// ===== js/core/db.js =====
(function () {
'use strict';

/**
 * CRUD genérico por coleção, sobre o Firebase Realtime Database.
 *
 * A fonte da verdade é remota, mas os 15 exports continuam SÍNCRONOS: um
 * espelho local (`db`) é hidratado por um listener na raiz e as escritas
 * são otimistas — mutam o espelho, emitem o evento e vão para o servidor
 * numa fila. Quem precisa da confirmação do servidor chama `pendente()`
 * (é o que `NS.ui.carregando.acaoRemota` faz antes de fechar o overlay).
 *
 * Por que otimista: `permissoes.pode()` chama `obter()` durante o render.
 * Tornar as leituras assíncronas espalharia `await` por toda a UI sem
 * ganho — a confirmação de escrita resolve o mesmo problema num lugar só.
 *
 * Cada registro é um nó próprio (`/visitas/{id}`), nunca um blob: dois
 * usuários gravando ao mesmo tempo só colidem se editarem o mesmo campo
 * do mesmo registro.
 *
 * Deliberadamente agnóstico ao domínio: nas Ondas 2 e 3, `produtos` e
 * `campanhas` funcionam sem uma linha de código novo aqui.
 */

var storage = NS.core.storage;
var fb = NS.core.firebase;
var novoId = NS.core.id.novoId;
var PREFIXOS = NS.core.id.PREFIXOS;
var emit = NS.core.events.emit;
var EVENTOS = NS.core.events.EVENTOS;
var ErroSemConexao = NS.core.firebase.ErroSemConexao;

/** Coleções persistidas como mapa de id -> registro. */
const COLECOES = ['medicos', 'visitas', 'especialidades', 'objetivos', 'motivosAusencia', 'marcadores', 'usuarios', 'grupos'];

const CAMINHO_META = 'meta';
const CAMINHO_LOCK = 'meta/migracao';
const CAMINHO_SNAPSHOT = 'snapshots/preImport';

let db = storage.dbVazio();
let estadoInicial = { migrado: false, baseVazia: false, versaoMinima: '' };

/** Índice medicoId -> visitas, evita varredura O(n) por card na Agenda. */
let indiceVisitasPorMedico = new Map();

function reconstruirIndices() {
    indiceVisitasPorMedico = new Map();
    for (const visita of db.visitas) {
        const lista = indiceVisitasPorMedico.get(visita.medicoId);
        if (lista) lista.push(visita);
        else indiceVisitasPorMedico.set(visita.medicoId, [visita]);
    }
}

/* ------------------------------------------------------------------ *
 * Conversão banco <-> espelho
 * ------------------------------------------------------------------ */

/** Mapa `{id: registro}` do RTDB -> array, que é o formato do resto do app. */
function paraArray(mapa) {
    if (!mapa || typeof mapa !== 'object') return [];
    return Object.keys(mapa)
        .map(chave => ({ ...mapa[chave], id: mapa[chave]?.id || chave }))
        // O RTDB devolve as chaves ordenadas lexicograficamente, o que
        // embaralharia catálogos a cada snapshot. `criadoEm` estabiliza.
        .sort((a, b) => String(a.criadoEm || '').localeCompare(String(b.criadoEm || '')));
}

/** Array -> mapa `{id: registro}`, o formato gravado. */
function paraMapa(lista) {
    const mapa = {};
    for (const item of lista || []) if (item?.id) mapa[item.id] = item;
    return mapa;
}

/**
 * Snapshot bruto da raiz -> espelho local completo.
 * Coleção vazia não existe como nó no RTDB, então as chaves faltando são
 * recriadas aqui — o resto do app nunca vê `undefined`.
 */
function normalizarSnapshot(bruto) {
    const base = storage.dbVazio();
    const dados = bruto || {};

    const espelho = {
        schemaVersion: Number(dados.meta?.schemaVersion) || storage.VERSAO_ATUAL,
        config: { ...base.config, ...(dados.config || {}) },
        atualizadoEm: dados.meta?.atualizadoEm || null
    };

    for (const colecao of COLECOES) espelho[colecao] = paraArray(dados[colecao]);
    // `permissoes` some do nó quando fica vazio — grupo sem permissão nenhuma.
    espelho.grupos = espelho.grupos.map(g => ({ ...g, permissoes: g.permissoes || [] }));

    return espelho;
}

/** Espelho local -> patch multi-path da base inteira (usado no seed e na migração). */
function patchDaBase(base) {
    const patch = {};
    for (const colecao of COLECOES) patch[colecao] = paraMapa(base[colecao]);
    patch.config = base.config;
    patch[`${CAMINHO_META}/schemaVersion`] = storage.VERSAO_ATUAL;
    patch[`${CAMINHO_META}/atualizadoEm`] = fb.SERVER_TIMESTAMP;
    return patch;
}

/* ------------------------------------------------------------------ *
 * Fila de escrita
 * ------------------------------------------------------------------ */

let patchPendente = null;
let envioAgendado = false;
const escritasEmVoo = new Set();

/**
 * Acumula caminhos e dispara UM `update()` por microtask: duas chamadas
 * seguidas (`atualizar` + `aplicarTransicao`, por exemplo) viram uma
 * escrita atômica, e nenhum outro cliente vê o estado intermediário.
 */
function enfileirarMulti(patch) {
    exigirConexao();
    patchPendente = { ...(patchPendente || {}), ...patch };

    if (envioAgendado) return;
    envioAgendado = true;

    queueMicrotask(() => {
        const aEnviar = patchPendente;
        patchPendente = null;
        envioAgendado = false;
        if (!aEnviar) return;

        aEnviar[`${CAMINHO_META}/atualizadoEm`] = fb.SERVER_TIMESTAMP;

        const promessa = fb.atualizar(aEnviar);
        escritasEmVoo.add(promessa);
        promessa
            // Escrita rejeitada não muda o servidor, então nenhum snapshot
            // novo chegaria para corrigir o espelho otimista: releitura na mão.
            .catch(() => ressincronizar())
            .finally(() => escritasEmVoo.delete(promessa));
    });
}

/** Descarta o espelho e recarrega do servidor — usado quando uma escrita falha. */
function ressincronizar() {
    return fb.lerUmaVez('/').then(bruto => {
        db = normalizarSnapshot(bruto);
        reconstruirIndices();
        emit(EVENTOS.DADOS_ALTERADOS);
        emit(EVENTOS.CONFIG_ALTERADA, lerConfig());
    }).catch(() => { /* offline: o listener corrige quando a conexão voltar */ });
}

function enfileirar(caminho, valor) {
    enfileirarMulti({ [caminho]: valor });
}

/** Prefixa cada chave do patch com `colecao/id/`. */
function caminhosDoRegistro(colecao, id, campos) {
    const patch = {};
    for (const campo of Object.keys(campos)) patch[`${colecao}/${id}/${campo}`] = campos[campo];
    return patch;
}

function exigirConexao() {
    if (!fb.conectado()) throw new ErroSemConexao('Sem conexão com o servidor. A alteração não foi salva.');
}

/**
 * Resolve quando todas as escritas já emitidas chegarem ao servidor.
 * Rejeita com o primeiro erro — a UI mostra o aviso e o próximo snapshot
 * corrige o espelho otimista.
 */
function pendente() {
    // A microtask da fila ainda não rodou quando `pendente()` é chamado
    // logo depois de um writer: um salto de microtask garante o registro.
    return Promise.resolve()
        .then(() => Promise.resolve())
        .then(() => Promise.all([...escritasEmVoo]))
        .then(() => undefined);
}

function conectado() {
    return fb.conectado();
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

/**
 * Conecta, garante o schema e resolve quando o primeiro snapshot chegar.
 *
 * A migração é disputada por lock: com várias abas subindo juntas, só uma
 * converte a base; as outras esperam o `schemaVersion` subir.
 *
 * @returns {Promise<{migrado: boolean, baseVazia: boolean, versaoMinima: string}>}
 */
async function iniciar() {
    const meta = (await fb.lerUmaVez(CAMINHO_META)) || {};
    const versaoRemota = Number(meta.schemaVersion) || 0;
    const baseVazia = versaoRemota === 0;
    let migrado = false;

    if (versaoRemota < storage.VERSAO_ATUAL) {
        migrado = await garantirSchema(versaoRemota);
    }

    await new Promise((resolve, reject) => {
        let primeiro = true;

        fb.raiz().on('value', snap => {
            db = normalizarSnapshot(snap.val());
            reconstruirIndices();

            if (primeiro) {
                primeiro = false;
                resolve();
                return;
            }

            // Snapshot vindo do servidor (nosso ou de outro usuário): as views
            // se redesenham inteiras, então um evento por snapshot basta.
            emit(EVENTOS.DADOS_ALTERADOS);
            emit(EVENTOS.CONFIG_ALTERADA, lerConfig());
        }, erro => {
            if (primeiro) reject(erro);
        });
    });

    estadoInicial = {
        migrado,
        baseVazia,
        versaoMinima: String(meta.appVersaoMinima || '')
    };
    return estadoInicial;
}

/**
 * Semeia uma base vazia ou aplica as MIGRATIONS pendentes — uma vez só,
 * mesmo com várias abas competindo.
 * @returns {Promise<boolean>} true se ESTE cliente converteu a base
 */
async function garantirSchema(versaoRemota) {
    const ganhou = await fb.lock(CAMINHO_LOCK);

    if (!ganhou) {
        // Outro cliente está convertendo: espera o schema subir.
        await fb.esperarValor(
            `${CAMINHO_META}/schemaVersion`,
            valor => Number(valor) >= storage.VERSAO_ATUAL
        );
        return false;
    }

    try {
        let base;
        if (versaoRemota === 0) {
            base = storage.dbVazio();
        } else {
            base = normalizarSnapshot((await fb.lerUmaVez('/')) || {});
            // `normalizarSnapshot` assume a versão atual quando o meta some;
            // aqui a versão real é conhecida e é ela que guia as MIGRATIONS.
            base.schemaVersion = versaoRemota;
            base = storage.migrar(base);
        }

        await fb.atualizarDireto(patchDaBase(base));
        return versaoRemota !== 0;
    } finally {
        await fb.liberarLock(CAMINHO_LOCK);
    }
}

function estado() {
    return estadoInicial;
}

/* ------------------------------------------------------------------ *
 * Leitura
 * ------------------------------------------------------------------ */

function listar(colecao, filtro) {
    const itens = db[colecao] || [];
    return typeof filtro === 'function' ? itens.filter(filtro) : itens.slice();
}

function obter(colecao, id) {
    return (db[colecao] || []).find(item => item.id === id) || null;
}

function contar(colecao, filtro) {
    const itens = db[colecao] || [];
    return typeof filtro === 'function' ? itens.filter(filtro).length : itens.length;
}

function visitasDoMedico(medicoId) {
    return (indiceVisitasPorMedico.get(medicoId) || []).slice();
}

/* ------------------------------------------------------------------ *
 * Escrita
 * ------------------------------------------------------------------ */

function criar(colecao, dados, opcoes) {
    exigirConexao();
    if (!db[colecao]) db[colecao] = [];

    const item = {
        ...dados,
        id: dados.id || novoId(PREFIXOS[colecao] || 'reg'),
        criadoEm: dados.criadoEm || new Date().toISOString()
    };

    db[colecao].push(item);
    reconstruirIndices();
    enfileirar(`${colecao}/${item.id}`, item);
    if (!opcoes?.silencioso) emit(EVENTOS.DADOS_ALTERADOS);
    return item;
}

function atualizar(colecao, id, patch, opcoes) {
    exigirConexao();
    const item = obter(colecao, id);
    if (!item) return null;

    const campos = { ...patch, atualizadoEm: new Date().toISOString() };
    Object.assign(item, campos);
    reconstruirIndices();
    // Só os campos do patch vão para o servidor: um campo que outro usuário
    // acabou de mudar não é sobrescrito por um valor velho do espelho.
    enfileirarMulti(caminhosDoRegistro(colecao, id, campos));
    if (!opcoes?.silencioso) emit(EVENTOS.DADOS_ALTERADOS);
    return item;
}

function remover(colecao, id, opcoes) {
    exigirConexao();
    const lista = db[colecao] || [];
    const indice = lista.findIndex(item => item.id === id);
    if (indice === -1) return false;

    lista.splice(indice, 1);
    reconstruirIndices();
    enfileirar(`${colecao}/${id}`, null);
    if (!opcoes?.silencioso) emit(EVENTOS.DADOS_ALTERADOS);
    return true;
}

/** Instantâneo `{colecao: {id: json}}` — base do diff da `transacao`. */
function instantaneo(base) {
    const saida = {};
    for (const colecao of COLECOES) {
        const porId = {};
        for (const item of base[colecao] || []) if (item?.id) porId[item.id] = JSON.stringify(item);
        saida[colecao] = porId;
    }
    return saida;
}

/**
 * Executa várias mutações e grava uma única vez.
 * Usado pelo reagendamento e pela exclusão em cascata de um médico, que
 * precisam ser atômicos: nenhum outro usuário pode ver o estado do meio.
 *
 * O callback muta o espelho à vontade (como sempre fez); o diff por
 * registro decide o que vai para o servidor.
 */
function transacao(fn, opcoes) {
    exigirConexao();
    const antes = instantaneo(db);
    const resultado = fn(db);
    reconstruirIndices();

    const depois = instantaneo(db);
    const patch = {};

    for (const colecao of COLECOES) {
        const a = antes[colecao], d = depois[colecao];
        for (const id in d) if (a[id] !== d[id]) patch[`${colecao}/${id}`] = JSON.parse(d[id]);
        for (const id in a) if (!(id in d)) patch[`${colecao}/${id}`] = null;
    }

    if (Object.keys(patch).length) enfileirarMulti(patch);
    if (!opcoes?.silencioso) emit(EVENTOS.DADOS_ALTERADOS);
    return resultado;
}

/* ------------------------------------------------------------------ *
 * Config
 * ------------------------------------------------------------------ */

function lerConfig() {
    return { ...db.config };
}

function gravarConfig(patch) {
    exigirConexao();
    db.config = { ...db.config, ...patch };
    // Chave a chave: dois admins mexendo em opções diferentes não se atropelam.
    const caminhos = {};
    for (const chave of Object.keys(patch)) caminhos[`config/${chave}`] = patch[chave];
    enfileirarMulti(caminhos);

    emit(EVENTOS.CONFIG_ALTERADA, lerConfig());
    return lerConfig();
}

/* ------------------------------------------------------------------ *
 * Backup
 * ------------------------------------------------------------------ */

/** Cópia profunda para exportação — o chamador não pode mutar o banco vivo. */
function exportarDados() {
    return JSON.parse(JSON.stringify({
        medicos: db.medicos,
        visitas: db.visitas,
        especialidades: db.especialidades,
        objetivos: db.objetivos,
        motivosAusencia: db.motivosAusencia,
        usuarios: db.usuarios,
        grupos: db.grupos,
        config: db.config
    }));
}

/**
 * Substitui todo o conteúdo num único `update()` multi-path: os ids que
 * somem viram `null` no mesmo patch, então a troca é atômica no servidor.
 *
 * `usuarios` e `grupos` só são trocados quando vêm no payload: um backup
 * antigo (ou os dados de teste) não pode apagar as contas e trancar todo
 * mundo fora do app.
 */
function substituirTudo(dados) {
    exigirConexao();
    const vazio = storage.dbVazio();

    const novo = {
        medicos: dados.medicos || [],
        visitas: dados.visitas || [],
        especialidades: dados.especialidades || [],
        objetivos: dados.objetivos?.length ? dados.objetivos : vazio.objetivos,
        motivosAusencia: dados.motivosAusencia?.length ? dados.motivosAusencia : vazio.motivosAusencia,
        usuarios: Array.isArray(dados.usuarios) ? dados.usuarios : db.usuarios,
        grupos: Array.isArray(dados.grupos) ? dados.grupos : db.grupos,
        // Backup sem marcadores (formato antigo) mantém os atuais em vez de quebrar a importação
        marcadores: Array.isArray(dados.marcadores) ? dados.marcadores : (db.marcadores || [])
    };
    if (!novo.grupos?.length) novo.grupos = vazio.grupos;

    const patch = {};

    for (const colecao of COLECOES) {
        const idsAntigos = new Set((db[colecao] || []).map(item => item.id));
        for (const item of (Array.isArray(novo[colecao]) ? novo[colecao] : (db[colecao] || []))) {
            patch[`${colecao}/${item.id}`] = item;
            idsAntigos.delete(item.id);
        }
        for (const id of idsAntigos) patch[`${colecao}/${id}`] = null;
        db[colecao] = novo[colecao];
    }

    // A config atual entra na base da mesclagem: uma opção que o payload não
    // traz (autocadastro, grupo padrão) é preservada em vez de voltar ao
    // padrão de fábrica sem ninguém pedir.
    db.config = { ...vazio.config, ...db.config, ...(dados.config || {}) };
    patch.config = db.config;
    patch[`${CAMINHO_META}/schemaVersion`] = storage.VERSAO_ATUAL;
    db.schemaVersion = storage.VERSAO_ATUAL;

    reconstruirIndices();
    enfileirarMulti(patch);
    emit(EVENTOS.DADOS_ALTERADOS);
    emit(EVENTOS.CONFIG_ALTERADA, lerConfig());
}

/**
 * Guarda o estado atual antes de uma importação, permitindo desfazer.
 * Fica no servidor, não no navegador: quem importou pode não ser quem
 * precisa desfazer.
 */
function salvarSnapshotPreImport() {
    exigirConexao();
    enfileirar(CAMINHO_SNAPSHOT, {
        ...exportarDados(),
        // Sem a versão, um snapshot já atual seria remigrado do zero na volta.
        schemaVersion: storage.VERSAO_ATUAL,
        em: new Date().toISOString()
    });
    return true;
}

/** @returns {Promise<object|null>} */
function lerSnapshotPreImport() {
    return fb.lerUmaVez(CAMINHO_SNAPSHOT).then(bruto => {
        if (!bruto) return null;
        return storage.migrar(storage.normalizar(bruto));
    }).catch(() => null);
}

/** Referência viva — só para leitura pontual do estado completo. */
function bancoBruto() {
    return db;
}

NS.core = NS.core || {};
NS.core.db = {
    ErroSemConexao,
    atualizar,
    bancoBruto,
    conectado,
    contar,
    criar,
    estado,
    exportarDados,
    gravarConfig,
    iniciar,
    lerConfig,
    lerSnapshotPreImport,
    listar,
    obter,
    pendente,
    remover,
    salvarSnapshotPreImport,
    substituirTudo,
    transacao,
    visitasDoMedico
};
})();
