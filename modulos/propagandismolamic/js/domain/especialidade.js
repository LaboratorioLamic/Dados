// ===== js/domain/especialidade.js =====
(function () {
'use strict';

/**
 * Domínio: Especialidade médica.
 *
 * Catálogo editável (Config › Especialidades). Médicos referenciam uma
 * entrada por `especialidadeId` — nunca guardam o nome solto, para que
 * renomear a especialidade não exija tocar em cada médico.
 */

var db = NS.core.db;
var normalizeStr = NS.domain.enderecoUtils.normalizeStr;
const COLECAO = 'especialidades';

function listar() {
    return db.listar(COLECAO).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

function obter(id) {
    return db.obter(COLECAO, id);
}

function porNome(nome) {
    const alvo = normalizeStr(nome);
    return listar().find(e => normalizeStr(e.nome) === alvo) || null;
}

/** Erros bloqueiam o salvamento. */
function validar(nome, { ignorarId = null } = {}) {
    const valor = (nome || '').trim();
    if (!valor) return 'Informe o nome da especialidade.';
    if (valor.length < 2) return 'Nome muito curto.';

    const existente = porNome(valor);
    if (existente && existente.id !== ignorarId) return 'Já existe uma especialidade com esse nome.';

    return '';
}

function criar(nome) {
    return db.criar(COLECAO, { nome: nome.trim() });
}

function atualizar(id, nome) {
    return db.atualizar(COLECAO, id, { nome: nome.trim() });
}

/** true se algum médico usa esta especialidade — bloqueia a exclusão. */
function emUso(id) {
    return db.listar('medicos').some(m => m.especialidadeId === id);
}

function remover(id) {
    if (emUso(id)) return false;
    return db.remover(COLECAO, id);
}

NS.domain = NS.domain || {};
NS.domain.especialidade = { atualizar, criar, emUso, listar, obter, porNome, remover, validar };
})();
