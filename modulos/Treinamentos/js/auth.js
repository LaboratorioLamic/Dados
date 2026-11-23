// Trava do painel de configurações (só em memória: recarregar a página fecha o painel).
// A senha própria do painel deixou de existir; quem pode abrir é decidido em
// js/portal-auth.js pela permissão do Dados LAMIC.
(function () {
    const U = window.UniAdmin;
    let unlocked = false;
    U.isUnlocked = function () { return unlocked; };
    U.unlock = function () { unlocked = true; };
    U.lock = function () { unlocked = false; };
})();
