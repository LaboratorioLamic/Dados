// ===== js/domain/motivoAusencia.js =====
(function () {
'use strict';

/**
 * Domínio: Motivo de ausência (médico não atendeu).
 *
 * Catálogo editável (mesmo padrão de especialidade/objetivo), mas a
 * visita grava o `nome` (texto) escolhido, não um id — o motivo é uma
 * anotação livre de histórico, não uma referência estrutural, então
 * renomear uma entrada do catálogo não reescreve visitas passadas.
 */

var db = NS.core.db;
var normalizeStr = NS.domain.enderecoUtils.normalizeStr;
const COLECAO = 'motivosAusencia';

function listar() {
    return db.listar(COLECAO).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

function obter(id) {
    return db.obter(COLECAO, id);
}

function porNome(nome) {
    const alvo = normalizeStr(nome);
    return listar().find(m => normalizeStr(m.nome) === alvo) || null;
}

function validar(nome, { ignorarId = null } = {}) {
    const valor = (nome || '').trim();
    if (!valor) return 'Informe o motivo.';
    if (valor.length < 3) return 'Motivo muito curto.';

    const existente = porNome(valor);
    if (existente && existente.id !== ignorarId) return 'Já existe um motivo com esse texto.';

    return '';
}

function criar(nome) {
    return db.criar(COLECAO, { nome: nome.trim() });
}

/** Renomear não reescreve visitas antigas — elas guardam o texto, não o id. */
function atualizar(id, nome) {
    return db.atualizar(COLECAO, id, { nome: nome.trim() });
}

/** true se alguma visita usa o texto deste motivo — bloqueia a exclusão. */
function emUso(id) {
    const entrada = obter(id);
    if (!entrada) return false;
    const alvo = normalizeStr(entrada.nome);
    return db.listar('visitas').some(v => normalizeStr(v.motivoAusencia) === alvo);
}

function remover(id) {
    if (emUso(id)) return false;
    return db.remover(COLECAO, id);
}

NS.domain = NS.domain || {};
NS.domain.motivoAusencia = { atualizar, criar, emUso, listar, obter, porNome, remover, validar };
})();
