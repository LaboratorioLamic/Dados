// ===== js/domain/config.js =====
(function () {
'use strict';

/** Configurações locais. Sem autenticação — só identificação para exibição. */

var db = NS.core.db;
function ler() {
    return db.lerConfig();
}

function nomeUsuario() {
    return (db.lerConfig().nomeUsuario || '').trim();
}

function definirNomeUsuario(nome) {
    return db.gravarConfig({ nomeUsuario: String(nome || '').trim() });
}

NS.domain = NS.domain || {};
NS.domain.config = { definirNomeUsuario, ler, nomeUsuario };
})();
