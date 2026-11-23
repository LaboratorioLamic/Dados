// Funções de hashing compartilhadas (SHA-256 + salt).
// Usadas pela senha única do admin (js/auth.js) e pelas contas multiusuário
// de aluno (js/student-auth.js) — mesmo padrão de segurança nos dois casos.
var UniAdmin = window.UniAdmin || {};

(function () {
    function toHex(buffer) {
        return Array.from(new Uint8Array(buffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    async function sha256(text) {
        const data = new TextEncoder().encode(text);
        const digest = await crypto.subtle.digest('SHA-256', data);
        return toHex(digest);
    }

    function randomSalt() {
        return toHex(crypto.getRandomValues(new Uint8Array(16)));
    }

    async function hashWithSalt(password, salt) {
        return sha256(`${salt}:${password}`);
    }

    UniAdmin.crypto = { toHex, sha256, randomSalt, hashWithSalt };

    // Normalização de nome (dedup/busca) — usada por colaboradores, cadastro
    // de aluno e sincronização com a planilha do Google Sheets.
    UniAdmin.normalizeName = function (name) {
        return (name || '')
            .trim()
            .toLowerCase()
            .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
            .replace(/\s+/g, ' ');
    };
})();

window.UniAdmin = UniAdmin;
