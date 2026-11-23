// Home: botão "Minha Conta" no canto superior direito.
// Deslogado: abre o modal de login/cadastro (js/student-auth.js).
// Logado: mostra o primeiro nome; ao clicar, abre um perfil resumido
// (setor, função, alterar senha e sair) — sem histórico/progresso, que
// só fazem sentido dentro de uma plataforma (portal.html).
(function () {
    const U = window.UniAdmin;
    const btn = document.getElementById('student-account-btn');
    const label = document.getElementById('student-account-label');
    if (!btn || !label || !U || !U.StudentAuth) return;

    function refreshHeader() {
        const session = U.StudentAuth.getSession();
        if (session) {
            label.textContent = session.fullName.split(' ')[0];
            btn.title = `Logado como ${session.fullName} — clique para ver seu perfil`;
        } else {
            label.textContent = 'Entrar';
            btn.title = 'Entrar ou criar conta';
        }
    }

    // ─── Modal de perfil resumido ───
    const modal = document.getElementById('student-profile-modal');
    const closeBtn = document.getElementById('student-profile-close');
    const nameEl = document.getElementById('student-profile-name');
    const infoUnitEl = document.getElementById('student-profile-info-unit');
    const infoRoleEl = document.getElementById('student-profile-info-role');
    const logoutBtn = document.getElementById('student-profile-logout');

    const passwordToggle = document.getElementById('student-profile-password-toggle');
    const passwordPanel = document.getElementById('student-profile-password-panel');
    const passwordError = document.getElementById('student-profile-password-error');
    const currentPasswordInput = document.getElementById('student-profile-current-password');
    const newPasswordInput = document.getElementById('student-profile-new-password');
    const confirmPasswordInput = document.getElementById('student-profile-confirm-password');
    const passwordSubmitBtn = document.getElementById('student-profile-password-submit');

    function resetPasswordPanel() {
        if (passwordPanel) passwordPanel.style.display = 'none';
        if (passwordError) { passwordError.textContent = ''; passwordError.classList.remove('active'); }
        if (currentPasswordInput) currentPasswordInput.value = '';
        if (newPasswordInput) newPasswordInput.value = '';
        if (confirmPasswordInput) confirmPasswordInput.value = '';
    }

    function closeProfileModal() {
        modal?.classList.remove('active');
    }

    async function loadProfile() {
        const session = U.StudentAuth.getSession();
        if (!session) { closeProfileModal(); return; }

        nameEl.textContent = session.fullName;
        infoUnitEl.textContent = session.unit || 'Não informado';
        infoRoleEl.textContent = session.role || 'Não informado';

        try {
            const updated = await U.StudentAuth.refreshSession();
            if (updated) {
                infoUnitEl.textContent = updated.unit || 'Não informado';
                infoRoleEl.textContent = updated.role || 'Não informado';
            }
        } catch (error) {
            // offline: mantém o que já estava na sessão local
        }
    }

    function openProfileModal() {
        modal?.classList.add('active');
        resetPasswordPanel();
        loadProfile();
    }

    passwordToggle?.addEventListener('click', () => {
        const isOpen = passwordPanel.style.display !== 'none';
        if (isOpen) { resetPasswordPanel(); return; }
        passwordPanel.style.display = 'block';
    });

    passwordSubmitBtn?.addEventListener('click', async () => {
        passwordError.textContent = '';
        passwordError.classList.remove('active');
        passwordSubmitBtn.disabled = true;
        try {
            await U.StudentAuth.changePassword({
                currentPassword: currentPasswordInput.value,
                newPassword: newPasswordInput.value,
                confirmation: confirmPasswordInput.value
            });
            resetPasswordPanel();
            U.showWarning?.('Senha alterada com sucesso.');
        } catch (error) {
            passwordError.textContent = error.message;
            passwordError.classList.add('active');
        } finally {
            passwordSubmitBtn.disabled = false;
        }
    });

    closeBtn?.addEventListener('click', closeProfileModal);
    modal?.addEventListener('click', (event) => { if (event.target === modal) closeProfileModal(); });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modal?.classList.contains('active')) closeProfileModal();
    });

    logoutBtn?.addEventListener('click', () => {
        U.StudentAuth.logout();
        closeProfileModal();
        refreshHeader();
    });

    btn.addEventListener('click', () => {
        const session = U.StudentAuth.getSession();
        if (session) {
            openProfileModal();
            return;
        }
        U.StudentAuth.openModal({ onSuccess: refreshHeader });
    });

    refreshHeader();
})();
