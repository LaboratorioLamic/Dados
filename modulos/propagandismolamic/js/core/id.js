// ===== js/core/id.js =====
(function () {
'use strict';

/**
 * Geração de identificadores.
 * Prefixo por tipo (med_, vis_) facilita debug e validação na importação.
 */

function aleatorio() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    }
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function novoId(prefixo) {
    return `${prefixo}_${aleatorio()}`;
}

const PREFIXOS = {
    medicos: 'med',
    visitas: 'vis',
    especialidades: 'esp',
    objetivos: 'obj',
    motivosAusencia: 'mot',
    marcadores: 'mrc',
    usuarios: 'usr',
    grupos: 'grp'
};

/** Salt aleatório em hexadecimal, para o hash de senha. */
function novoSalt() {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    }
    return aleatorio() + aleatorio();
}

NS.core = NS.core || {};
NS.core.id = { PREFIXOS, novoId, novoSalt };
})();
