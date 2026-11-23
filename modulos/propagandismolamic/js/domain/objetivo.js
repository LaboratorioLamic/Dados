// ===== js/domain/objetivo.js =====
(function () {
'use strict';

/**
 * Domínio: Objetivo de visita.
 *
 * Catálogo editável (Config › Objetivos). Visitas referenciam uma
 * entrada por `objetivo` (o id) — mesmo padrão de especialidade.
 */

var db = NS.core.db;
var normalizeStr = NS.domain.enderecoUtils.normalizeStr;
const COLECAO = 'objetivos';

function listar() {
    return db.listar(COLECAO).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

function obter(id) {
    return db.obter(COLECAO, id);
}

function nomeDe(id) {
    return obter(id)?.nome || '';
}

function porNome(nome) {
    const alvo = normalizeStr(nome);
    return listar().find(o => normalizeStr(o.nome) === alvo) || null;
}

function validar(nome, { ignorarId = null } = {}) {
    const valor = (nome || '').trim();
    if (!valor) return 'Informe o nome do objetivo.';
    if (valor.length < 2) return 'Nome muito curto.';

    const existente = porNome(valor);
    if (existente && existente.id !== ignorarId) return 'Já existe um objetivo com esse nome.';

    return '';
}

function criar(nome) {
    return db.criar(COLECAO, { nome: nome.trim() });
}

function atualizar(id, nome) {
    return db.atualizar(COLECAO, id, { nome: nome.trim() });
}

/** true se alguma visita usa este objetivo — bloqueia a exclusão. */
function emUso(id) {
    return db.listar('visitas').some(v => v.objetivo === id);
}

function remover(id) {
    if (emUso(id)) return false;
    return db.remover(COLECAO, id);
}

NS.domain = NS.domain || {};
NS.domain.objetivo = { atualizar, criar, emUso, listar, nomeDe, obter, porNome, remover, validar };
})();
