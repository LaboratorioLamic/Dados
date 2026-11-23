// Lista de colaboradores = usuários do Dados LAMIC.
// Substitui o antigo sync com a planilha do Google Sheets (colaboradores-sync.js) e a
// aba Configurações > Colaboradores: o cadastro de pessoas agora é um só, no Dados LAMIC.
// Mantém a interface U.ColaboradoresSync usada pelo painel (relatórios, Excel, Usuários).
(function () {
    const U = window.UniAdmin;

    // { [login]: { fullName, unit, role, funcao, active, accountUserId } }
    async function fetchColaboradores() {
        const [usuarios, porLogin] = await Promise.all([
            U.db.ref('/usuarios').once('value').then(s => s.val() || {}),
            U.db.ref(`/${U.dbRoot}/porLogin`).once('value').then(s => s.val() || {})
        ]);
        const out = {};
        Object.keys(usuarios).forEach(login => {
            const u = usuarios[login] || {};
            out[login] = {
                fullName: u.nome || login,
                unit: null,
                role: u.cargo || null,
                funcao: u.funcao || null,
                active: u.ativo === true,
                accountUserId: porLogin[login] || null
            };
        });
        return out;
    }

    // Não há mais planilha para sincronizar; mantido para quem ainda chama.
    async function syncFromSheets() { return { added: 0, updated: 0, skipped: 0, usersUpdated: 0 }; }

    U.ColaboradoresSync = { fetchColaboradores, syncFromSheets };
})();
