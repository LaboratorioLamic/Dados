// Liga o ícone de configurações do portal ao painel admin.
// Não há mais senha própria do painel: só entra quem é gestor no Dados LAMIC
// (grupo admin ou grupo com a permissão "unilamic.gerenciar"). Ver js/dados-session.js.
(function () {

const U = window.UniAdmin;
const settingsBtn = document.getElementById('settings-btn');

async function openSettings() {
    const session = (await U.StudentAuth.ready) && U.StudentAuth.getSession();
    if (!session) { U.StudentAuth.openModal(); return; }
    if (!session.isManager) {
        U.showWarning?.('Seu grupo no Dados LAMIC não tem a permissão "Gerenciar UniLAMIC".');
        return;
    }
    U.unlock();
    window.__openAdmin?.();
}

// O botão só aparece para gestores.
function syncButton() {
    if (settingsBtn) settingsBtn.style.display = U.StudentAuth.getSession()?.isManager ? '' : 'none';
}
document.addEventListener('uniadmin:session-updated', syncButton);
syncButton();

settingsBtn?.addEventListener('click', openSettings);

// Compatibilidade com links antigos que apontavam para /config/
if (location.hash === '#config') window.addEventListener('load', openSettings);

})();
