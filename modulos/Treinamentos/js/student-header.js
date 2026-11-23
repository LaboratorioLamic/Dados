// Liga o botão "Minha Conta" do header do portal à sessão do aluno.
// Deslogado: abre o modal de login/cadastro (js/student-auth.js).
// Logado: abre o painel de perfil (js/student-profile.js), com histórico e sair.
(function () {
    const U = window.UniAdmin;
    const btn = document.getElementById('student-account-btn');
    const label = document.getElementById('student-account-label');
    if (!btn || !label || !U.StudentAuth) return;

    function refresh() {
        const session = U.StudentAuth.getSession();
        if (session) {
            label.textContent = session.fullName.split(' ')[0];
            btn.title = `Logado como ${session.fullName} — clique para ver seu perfil`;
        } else {
            label.textContent = 'Entrar';
            btn.title = 'Entrar ou criar conta';
        }
    }
    U.refreshStudentHeader = refresh;

    btn.addEventListener('click', () => {
        const session = U.StudentAuth.getSession();
        if (session) {
            U.StudentProfile?.openModal();
            return;
        }
        U.StudentAuth.openModal({ onSuccess: refresh });
    });

    refresh();
})();
