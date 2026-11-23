// ===== js/domain/permissoes.js =====
(function () {
'use strict';

/**
 * Domínio: grupos de permissão e a pergunta "posso fazer isto?".
 *
 * O catálogo `MODULOS` é a única fonte da verdade: ele alimenta tanto a
 * checagem quanto o editor de grupos (que é gerado a partir dele). Adicionar
 * uma permissão nova é acrescentar uma linha aqui — e a chave correspondente
 * em `PERMISSOES_CONHECIDAS`, em `js/core/storage.js`, que as seeds usam.
 *
 * Aviso importante: isto é um portão de interface, não segurança. O app roda
 * em `file://` com tudo em `localStorage` — quem abre o DevTools edita a base
 * inteira sem passar por aqui.
 */

var db = NS.core.db;
var sessao = NS.core.sessao;
var normalizeStr = NS.domain.enderecoUtils.normalizeStr;
const COLECAO = 'grupos';

const MODULOS = [
    {
        id: 'agenda',
        rotulo: 'Agenda',
        icone: 'agenda',
        permissoes: [
            { chave: 'agenda.ver', rotulo: 'Visualizar agenda' },
            { chave: 'agenda.criar', rotulo: 'Criar agendamento' },
            { chave: 'agenda.concluir', rotulo: 'Registrar visita', ajuda: 'Marcar como realizada ou não atendeu' },
            { chave: 'agenda.reagendar', rotulo: 'Reagendar visita' },
            { chave: 'agenda.cancelar', rotulo: 'Cancelar visita' }
        ]
    },
    {
        id: 'medicos',
        rotulo: 'Médicos',
        icone: 'medicos',
        permissoes: [
            { chave: 'medicos.ver', rotulo: 'Visualizar médicos' },
            { chave: 'medicos.criar', rotulo: 'Adicionar médico' },
            { chave: 'medicos.editar', rotulo: 'Editar médico' },
            { chave: 'medicos.excluir', rotulo: 'Excluir médico', ajuda: 'Apaga também o histórico de visitas' }
        ]
    },
    {
        id: 'catalogos',
        rotulo: 'Catálogos',
        icone: 'config',
        permissoes: [
            { chave: 'catalogos.gerenciar', rotulo: 'Gerenciar especialidades, objetivos e marcadores' }
        ]
    },
    {
        id: 'ajustes',
        rotulo: 'Ajustes',
        icone: 'download',
        permissoes: [
            { chave: 'backup.exportar', rotulo: 'Exportar backup' },
            { chave: 'backup.importar', rotulo: 'Importar backup', ajuda: 'Substitui a base atual' },
            { chave: 'backup.apagar', rotulo: 'Apagar dados / gerar exemplos' }
        ]
    },
    {
        id: 'usuarios',
        rotulo: 'Usuários',
        icone: 'usuarios',
        permissoes: [
            { chave: 'usuarios.gerenciar', rotulo: 'Gerenciar usuários e grupos' }
        ]
    }
];

/** Todas as chaves declaradas em MODULOS, na ordem de exibição. */
function todasAsChaves() {
    return MODULOS.flatMap(modulo => modulo.permissoes.map(p => p.chave));
}

function rotuloDaChave(chave) {
    for (const modulo of MODULOS) {
        const encontrada = modulo.permissoes.find(p => p.chave === chave);
        if (encontrada) return `${modulo.rotulo} › ${encontrada.rotulo}`;
    }
    return chave;
}

/* ------------------------------------------------------------------ *
 * Checagem
 * ------------------------------------------------------------------ */

/** O usuário da sessão, ou null. Lê o banco direto para não depender de usuario.js. */
function usuarioDaSessao() {
    const id = sessao.usuarioId();
    if (!id) return null;

    const usuario = db.obter('usuarios', id);
    if (!usuario || usuario.ativo === false) return null;

    return usuario;
}

function pode(chave) {
    const usuario = usuarioDaSessao();
    if (!usuario) return false;
    if (usuario.admin) return true;

    const grupo = usuario.grupoId ? db.obter(COLECAO, usuario.grupoId) : null;
    return !!grupo && Array.isArray(grupo.permissoes) && grupo.permissoes.includes(chave);
}

function podeTodas(chaves) {
    return chaves.every(pode);
}

function podeAlguma(chaves) {
    return chaves.some(pode);
}

/* ------------------------------------------------------------------ *
 * Grupos
 * ------------------------------------------------------------------ */

function listarGrupos() {
    return db.listar(COLECAO).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

function obterGrupo(id) {
    return db.obter(COLECAO, id);
}

function grupoPorNome(nome) {
    const alvo = normalizeStr(nome);
    return listarGrupos().find(g => normalizeStr(g.nome) === alvo) || null;
}

/** Descarta chaves que não existem mais em MODULOS — grupo nunca guarda lixo. */
function sanitizarPermissoes(lista) {
    const validas = new Set(todasAsChaves());
    return (Array.isArray(lista) ? lista : []).filter(chave => validas.has(chave));
}

function validarGrupo(nome, { ignorarId = null } = {}) {
    const valor = (nome || '').trim();
    if (!valor) return 'Informe o nome do grupo.';
    if (valor.length < 2) return 'Nome muito curto.';

    const existente = grupoPorNome(valor);
    if (existente && existente.id !== ignorarId) return 'Já existe um grupo com esse nome.';

    return '';
}

function criarGrupo(nome, permissoes) {
    return db.criar(COLECAO, {
        nome: nome.trim(),
        permissoes: sanitizarPermissoes(permissoes),
        padrao: false
    });
}

function atualizarGrupo(id, { nome, permissoes }) {
    const patch = {};
    if (nome !== undefined) patch.nome = String(nome).trim();
    if (permissoes !== undefined) patch.permissoes = sanitizarPermissoes(permissoes);
    return db.atualizar(COLECAO, id, patch);
}

/** Quantos usuários usam este grupo. Zero libera a exclusão. */
function usuariosDoGrupo(id) {
    return db.listar('usuarios').filter(u => !u.admin && u.grupoId === id);
}

function grupoEmUso(id) {
    return usuariosDoGrupo(id).length > 0;
}

function removerGrupo(id) {
    if (grupoEmUso(id)) return false;
    return db.remover(COLECAO, id);
}

/** Grupo atribuído no autocadastro. Exclusivo: marcar um desmarca os outros. */
function definirGrupoPadrao(id) {
    db.transacao(banco => {
        for (const grupo of banco.grupos || []) grupo.padrao = grupo.id === id;
    });
    return db.gravarConfig({ grupoPadraoId: id });
}

function grupoPadrao() {
    const config = db.lerConfig();
    return (config.grupoPadraoId && obterGrupo(config.grupoPadraoId))
        || listarGrupos().find(g => g.padrao)
        || null;
}

NS.domain = NS.domain || {};
NS.domain.permissoes = {
    MODULOS, atualizarGrupo, criarGrupo, definirGrupoPadrao, grupoEmUso, grupoPadrao,
    grupoPorNome, listarGrupos, obterGrupo, pode, podeAlguma, podeTodas, removerGrupo,
    rotuloDaChave, sanitizarPermissoes, todasAsChaves, usuarioDaSessao, usuariosDoGrupo,
    validarGrupo
};
})();
