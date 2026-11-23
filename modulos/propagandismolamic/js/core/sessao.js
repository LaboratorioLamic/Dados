// ===== js/core/sessao.js =====
(function () {
'use strict';

/**
 * Quem está logado agora.
 *
 * Fica em `sessionStorage`, fora do `labruta.db`, por dois motivos: fechar a
 * aba encerra a sessão (o app abre por duplo-clique, muitas vezes em máquina
 * compartilhada) e o backup nunca carrega "quem estava logado" junto.
 *
 * Guarda só o id. Resolver o id em usuário é papel de `js/domain/usuario.js` —
 * `core` não conhece o formato de um usuário.
 */

var emit = NS.core.events.emit;
var EVENTOS = NS.core.events.EVENTOS;
const CHAVE = 'labruta.sessao';

/** Espelho em memória: sessionStorage pode estar bloqueado (modo restrito). */
let sessao = null;

function ler() {
    try {
        const bruto = sessionStorage.getItem(CHAVE);
        return bruto ? JSON.parse(bruto) : null;
    } catch {
        return null;
    }
}

function iniciar() {
    sessao = ler();
    return sessao;
}

function usuarioId() {
    return sessao?.usuarioId || '';
}

function estaAutenticado() {
    return !!usuarioId();
}

function abrir(id) {
    sessao = { usuarioId: id, iniciadaEm: new Date().toISOString() };

    try {
        sessionStorage.setItem(CHAVE, JSON.stringify(sessao));
    } catch {
        // Sem sessionStorage a sessão vive só em memória: recarregar a
        // página pede login de novo, o que é o lado seguro do erro.
    }

    emit(EVENTOS.SESSAO_ALTERADA, sessao);
    return sessao;
}

function encerrar() {
    sessao = null;

    try {
        sessionStorage.removeItem(CHAVE);
    } catch { /* nada a limpar */ }

    emit(EVENTOS.SESSAO_ALTERADA, null);
}

NS.core = NS.core || {};
NS.core.sessao = { CHAVE, abrir, encerrar, estaAutenticado, iniciar, usuarioId };
})();
