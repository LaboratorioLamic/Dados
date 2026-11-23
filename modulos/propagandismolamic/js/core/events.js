// ===== js/core/events.js =====
(function () {
'use strict';

/** Pub/sub mínimo. Views assinam `dados:alterados` e re-renderizam sua lista. */

const ouvintes = new Map();

function on(evento, callback) {
    if (!ouvintes.has(evento)) ouvintes.set(evento, new Set());
    ouvintes.get(evento).add(callback);
    return () => off(evento, callback);
}

function off(evento, callback) {
    ouvintes.get(evento)?.delete(callback);
}

function emit(evento, payload) {
    ouvintes.get(evento)?.forEach(callback => {
        try {
            callback(payload);
        } catch (erro) {
            console.error(`Erro no ouvinte de "${evento}":`, erro);
        }
    });
}

const EVENTOS = {
    DADOS_ALTERADOS: 'dados:alterados',
    CONFIG_ALTERADA: 'config:alterada',
    SESSAO_ALTERADA: 'sessao:alterada',
    CONEXAO_ALTERADA: 'conexao:alterada'
};

NS.core = NS.core || {};
NS.core.events = { EVENTOS, emit, off, on };
})();
