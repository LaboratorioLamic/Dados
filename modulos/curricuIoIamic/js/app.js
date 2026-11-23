// ===== Inicialização =====
// A sessão vem do Firebase Auth do Dados LAMIC (mesmo domínio). Sem sessão → aviso para entrar por lá.

document.addEventListener('DOMContentLoaded', () => {
    let iniciado = false;
    fbAuth.onAuthStateChanged(async user => {
        if (!user) {
            clearSession();
            if (iniciado) return location.reload();
            return showLogin();
        }
        if (iniciado) return; // troca de token: nada a fazer
        try {
            await entrarComDados(user);
            iniciado = true;
            showApp();
        } catch (err) {
            clearSession();
            showLogin(err.message || 'Erro ao entrar.');
        }
    });
});
