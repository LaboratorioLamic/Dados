// ===== js/core/storage.js =====
(function () {
'use strict';

/**
 * Forma e evolução da base — não mais a persistência.
 *
 * Os dados vivem no Firebase Realtime Database (`js/core/firebase.js`);
 * este módulo define a ESTRUTURA (`dbVazio`), os dados de fábrica e as
 * MIGRATIONS que levam uma base antiga até `VERSAO_ATUAL`.
 *
 * `migrar`/`normalizar` operam no formato-array (o mesmo que `db.listar`
 * devolve), então servem tanto para a base remota quanto para um arquivo
 * de backup ou um resto de localStorage vindo da versão anterior.
 *
 * Ao adicionar `produtos`, `campanhas` ou novos campos, registra-se uma
 * migration nova e as bases existentes se atualizam sozinhas no próximo
 * boot — a primeira aba que subir com o código novo faz a conversão.
 */

const VERSAO_ATUAL = 5;

/** IDs de fábrica para os objetivos padrão — usados pela migration v2 e pelas seeds. */
const OBJETIVOS_PADRAO = [
    { id: 'obj_fortalecer_relacionamento', nome: 'Fortalecer relacionamento' },
    { id: 'obj_consolidar_parceria', nome: 'Consolidar parceria' },
    { id: 'obj_prospectar_novo', nome: 'Prospectar novo' }
];

/** Motivos de ausência de fábrica — catálogo editável a partir da v4. */
const MOTIVOS_PADRAO = [
    { id: 'mot_em_atendimento', nome: 'Médico em atendimento' },
    { id: 'mot_fora_consultorio', nome: 'Médico não estava no consultório' },
    { id: 'mot_agenda_cheia', nome: 'Agenda cheia no dia' },
    { id: 'mot_consultorio_fechado', nome: 'Consultório fechado' },
    { id: 'mot_remarcado_secretaria', nome: 'Remarcado pela secretária' },
    { id: 'mot_outro', nome: 'Outro motivo' }
];

/** Marcadores de fábrica — catálogo editável a partir da v5. */
const MARCADORES_PADRAO = [
    { id: 'mrc_prioridade', nome: 'Prioridade', cor: '#ef4444' },
    { id: 'mrc_amostra_gratis', nome: 'Amostra grátis', cor: '#10b981' },
    { id: 'mrc_lancamento', nome: 'Lançamento', cor: '#8b5cf6' },
    { id: 'mrc_retorno', nome: 'Retorno', cor: '#f59e0b' }
];

/**
 * Chaves de permissão conhecidas.
 *
 * Duplicadas de propósito aqui: `core` não pode depender de `domain`, e as
 * seeds de grupo precisam nascer junto com o banco. A lista rica (rótulos,
 * agrupamento por módulo) vive em `js/domain/permissoes.js`, que valida
 * contra esta — divergência aparece como permissão órfã, não em silêncio.
 */
const PERMISSOES_CONHECIDAS = [
    'agenda.ver', 'agenda.criar', 'agenda.concluir', 'agenda.reagendar', 'agenda.cancelar',
    'medicos.ver', 'medicos.criar', 'medicos.editar', 'medicos.excluir',
    'catalogos.gerenciar',
    'backup.exportar', 'backup.importar', 'backup.apagar',
    'usuarios.gerenciar'
];

const SEM_ACESSO_TOTAL = ['usuarios.gerenciar', 'backup.apagar'];

/** Grupos de fábrica. IDs fixos para que migration e banco novo coincidam. */
function gruposPadrao() {
    const basico = ['agenda.ver', 'medicos.ver'];
    return [
        { id: 'grp_basico', nome: 'USUÁRIO BÁSICO', permissoes: basico.slice(), padrao: false },
        {
            id: 'grp_propagandista',
            nome: 'PROPAGANDISTA',
            permissoes: basico.concat(['agenda.criar', 'agenda.concluir', 'agenda.reagendar', 'medicos.criar', 'medicos.editar']),
            padrao: true
        },
        {
            id: 'grp_supervisor',
            nome: 'SUPERVISOR',
            permissoes: PERMISSOES_CONHECIDAS.filter(p => !SEM_ACESSO_TOTAL.includes(p)),
            padrao: false
        },
        { id: 'grp_gerente', nome: 'GERENTE', permissoes: PERMISSOES_CONHECIDAS.slice(), padrao: false }
    ];
}

/** Estrutura de um banco recém-criado. */
function dbVazio() {
    return {
        schemaVersion: VERSAO_ATUAL,
        medicos: [],
        visitas: [],
        especialidades: [],
        objetivos: OBJETIVOS_PADRAO.map(o => ({ ...o })),
        motivosAusencia: MOTIVOS_PADRAO.map(m => ({ ...m })),
        marcadores: MARCADORES_PADRAO.map(m => ({ ...m })),
        usuarios: [],
        grupos: gruposPadrao(),
        config: { nomeUsuario: '', autocadastro: false, grupoPadraoId: 'grp_propagandista' },
        atualizadoEm: new Date().toISOString()
    };
}

/**
 * Cada chave transforma a versão N-1 em N.
 * Onda 2 acrescentará:
 *   3: db => { db.produtos = []; db.medicos.forEach(m => m.statusRelacionamento ??= 'ativo'); }
 */
const MIGRATIONS = {
    // v1 é a base — nada a migrar.

    /**
     * Introduz os catálogos de especialidade e objetivo.
     * Especialidades: cada valor de texto distinto já usado por algum
     * médico vira uma entrada do catálogo, e o médico passa a referenciar
     * o id. Objetivos: os 3 valores fixos anteriores viram catálogo
     * editável, e as visitas existentes trocam a chave fixa pelo id novo.
     */
    2(db) {
        const normalizeStr = s => (s || '').toString().trim().toLowerCase()
            .normalize('NFD').replace(/[̀-ͯ]/g, '');

        db.especialidades = [];
        const porNomeNormalizado = new Map();

        for (const medico of db.medicos || []) {
            const nome = (medico.especialidade || '').trim();
            if (!nome) { medico.especialidadeId = ''; continue; }

            const chave = normalizeStr(nome);
            let entrada = porNomeNormalizado.get(chave);
            if (!entrada) {
                entrada = { id: `esp_${db.especialidades.length + 1}_${Date.now().toString(36)}`, nome };
                db.especialidades.push(entrada);
                porNomeNormalizado.set(chave, entrada);
            }
            medico.especialidadeId = entrada.id;
        }

        db.objetivos = OBJETIVOS_PADRAO.map(o => ({ ...o }));
        const idsValidos = new Set(db.objetivos.map(o => o.id));
        const mapaLegado = {
            fortalecer_relacionamento: 'obj_fortalecer_relacionamento',
            consolidar_parceria: 'obj_consolidar_parceria',
            prospectar_novo: 'obj_prospectar_novo'
        };

        for (const visita of db.visitas || []) {
            if (mapaLegado[visita.objetivo]) visita.objetivo = mapaLegado[visita.objetivo];
            else if (!idsValidos.has(visita.objetivo)) visita.objetivo = visita.objetivo || '';
        }
    },

    /**
     * Introduz contas de usuário e grupos de permissão.
     *
     * Nenhum usuário é criado: a base fica sem administrador de propósito, e
     * o boot em `js/main.js` cai no fluxo de cadastro do primeiro ADM. Criar
     * um usuário aqui exigiria inventar uma senha padrão — pior dos mundos.
     */
    3(db) {
        db.usuarios = [];
        db.grupos = gruposPadrao();
        db.config = { ...db.config, autocadastro: false, grupoPadraoId: 'grp_propagandista' };
    },

    /**
     * Motivos de ausência viram catálogo editável.
     *
     * As visitas continuam guardando o texto do motivo, não um id: o valor
     * já gravado é livre (o formulário sempre aceitou observação própria) e
     * renomear um motivo não pode reescrever o histórico.
     */
    4(db) {
        db.motivosAusencia = MOTIVOS_PADRAO.map(m => ({ ...m }));
    },

    /**
     * Marcadores: etiquetas coloridas, várias por visita.
     *
     * As visitas existentes ganham a lista vazia em vez de ficarem sem a
     * chave — o filtro da Agenda e o formulário leem `visita.marcadores`
     * direto, e um `undefined` espalharia checagem por toda a UI.
     */
    5(db) {
        db.marcadores = MARCADORES_PADRAO.map(m => ({ ...m }));
        for (const visita of db.visitas || []) {
            if (!Array.isArray(visita.marcadores)) visita.marcadores = [];
        }
    }
};

/** Aplica migrations em cadeia até a versão atual. Devolve o db mutado. */
function migrar(db) {
    let versao = Number(db.schemaVersion) || 0;

    while (versao < VERSAO_ATUAL) {
        const proxima = versao + 1;
        const migration = MIGRATIONS[proxima];
        if (typeof migration === 'function') migration(db);
        versao = proxima;
    }

    db.schemaVersion = VERSAO_ATUAL;
    return db;
}

/** Garante que o objeto tem a forma esperada, mesmo vindo de um blob parcial. */
function normalizar(bruto) {
    const base = dbVazio();
    if (!bruto || typeof bruto !== 'object') return base;

    return {
        schemaVersion: Number(bruto.schemaVersion) || 1,
        medicos: Array.isArray(bruto.medicos) ? bruto.medicos : [],
        visitas: Array.isArray(bruto.visitas) ? bruto.visitas : [],
        especialidades: Array.isArray(bruto.especialidades) ? bruto.especialidades : [],
        objetivos: Array.isArray(bruto.objetivos) ? bruto.objetivos : [],
        motivosAusencia: Array.isArray(bruto.motivosAusencia) ? bruto.motivosAusencia : [],
        marcadores: Array.isArray(bruto.marcadores) ? bruto.marcadores : [],
        usuarios: Array.isArray(bruto.usuarios) ? bruto.usuarios : [],
        grupos: Array.isArray(bruto.grupos) ? bruto.grupos : [],
        config: { ...base.config, ...(bruto.config || {}) },
        atualizadoEm: bruto.atualizadoEm || base.atualizadoEm
    };
}

NS.core = NS.core || {};
NS.core.storage = { MARCADORES_PADRAO, MOTIVOS_PADRAO, OBJETIVOS_PADRAO, PERMISSOES_CONHECIDAS, VERSAO_ATUAL, dbVazio, gruposPadrao, migrar, normalizar };
})();
