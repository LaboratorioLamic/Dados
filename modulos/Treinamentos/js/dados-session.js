// Sessão do aluno vinda do Dados LAMIC.
// Substitui o antigo login próprio do UniLAMIC (student-auth.js): não existe mais
// cadastro nem senha aqui. Quem está logado no Dados LAMIC (Firebase Auth do projeto
// applamic, mesma origem) já chega logado; quem não está vê um aviso para entrar por lá.
//
// Mantém a mesma interface U.StudentAuth que o restante do portal usa
// (getSession, refreshSession, watchSession, logout, openModal…), então main.js,
// ranking, perfil e painel continuam funcionando sem saber de onde vem a sessão.
//
// Vínculo com o histórico: os registros do UniLAMIC (progress/results/attempts) são
// indexados por userId (id em /uniadmin/users). O login do Dados aponta para ele em
// /uniadmin/porLogin/{login}. Quem ainda não tem registro de aluno ganha um no
// primeiro acesso.
(function () {
    const U = window.UniAdmin;
    const db = U.db, dbRoot = U.dbRoot;
    const SESSION_KEY = 'uniadmin.studentSession';
    const USERS_PATH = `/${dbRoot}/users`;
    const BY_LOGIN_PATH = `/${dbRoot}/porLogin`;
    const PROGRESS_PATH = `/${dbRoot}/progress/byUser`;

    const val = async (path) => (await db.ref(path).once('value')).val();

    // ─── Cache local (getSession é síncrono e é chamado em todo render) ───
    function getSession() {
        try {
            const raw = localStorage.getItem(SESSION_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }
    function setSession(s) {
        try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) { /* sem storage: segue só em memória */ }
    }
    function clearSession() {
        try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* idem */ }
    }
    const notify = () => document.dispatchEvent(new CustomEvent('uniadmin:session-updated'));

    // Gestor do UniLAMIC = administrador do Dados ou grupo com a permissão unilamic.gerenciar.
    async function isManagerFor(grupo) {
        if (grupo === 'admin') return true;
        if (!grupo) return false;
        return (await val(`/grupos/${grupo}/perms/unilamic_gerenciar`)) === true;
    }

    // Garante o registro de aluno do login e devolve o userId.
    async function ensureStudentRecord(login, perfil) {
        const existing = await val(`${BY_LOGIN_PATH}/${login}`);
        if (existing) return existing;
        const userId = db.ref(USERS_PATH).push().key;
        await db.ref().update({
            [`${USERS_PATH}/${userId}`]: {
                fullName: perfil.nome, username: login, login,
                unit: null, role: perfil.cargo || null, disabled: false, createdAt: Date.now()
            },
            [`${BY_LOGIN_PATH}/${login}`]: userId
        });
        return userId;
    }

    async function buildSession(user) {
        const login = await val(`/uids/${user.uid}`);
        if (!login) return null;
        const perfil = await val(`/usuarios/${login}`);
        if (!perfil || perfil.ativo !== true) return null;
        const userId = await ensureStudentRecord(login, perfil);
        const aluno = (await val(`${USERS_PATH}/${userId}`)) || {};
        return {
            userId, login, username: login,
            fullName: perfil.nome || aluno.fullName || login,
            unit: perfil.unidade || aluno.unit || null,   // unidade do funcionário vinculado no RH
            role: perfil.cargo || null,
            funcao: perfil.funcao || null,
            grupo: perfil.grupo || null,
            isManager: await isManagerFor(perfil.grupo),
            loggedInAt: Date.now()
        };
    }

    function sameSession(a, b) {
        if (!a || !b) return a === b;
        return ['userId', 'fullName', 'unit', 'role', 'funcao', 'grupo', 'isManager'].every(k => (a[k] ?? null) === (b[k] ?? null));
    }

    // ─── Ciclo da sessão ───
    let resolveReady;
    const ready = new Promise(r => { resolveReady = r; });
    let stopWatch = null;

    async function refreshSession() {
        const user = U.auth.currentUser;
        if (!user) { if (getSession()) { clearSession(); notify(); } return null; }
        try {
            const fresh = await buildSession(user);
            const before = getSession();
            if (!fresh) {
                clearSession();
                if (before) document.dispatchEvent(new CustomEvent('uniadmin:session-revoked', { detail: { reason: 'disabled' } }));
                notify();
                return null;
            }
            setSession(fresh);
            if (!sameSession(before, fresh)) notify();
            return fresh;
        } catch (error) {
            // Offline ou leitura negada momentânea: mantém a sessão em cache.
            console.error('Erro ao carregar a sessão do Dados LAMIC:', error);
            return getSession();
        }
    }

    // Acompanha o perfil no Dados: cargo/grupo alterado reflete na hora; desativado derruba.
    function watchSession() {
        stopWatchingSession();
        const s = getSession();
        if (!s?.login) return;
        const r = db.ref(`/usuarios/${s.login}`);
        let first = true;
        const cb = () => { if (first) { first = false; return; } refreshSession(); };
        r.on('value', cb, () => {});
        stopWatch = () => r.off('value', cb);
    }
    function stopWatchingSession() {
        if (stopWatch) { stopWatch(); stopWatch = null; }
    }

    U.auth.onAuthStateChanged(async () => {
        await refreshSession();
        if (getSession()) watchSession(); else stopWatchingSession();
        resolveReady(getSession());
        if (window.LamicCarregando) window.LamicCarregando.fim();
        notify();
    });

    // ─── Sem sessão: aviso para entrar pelo Dados LAMIC ───
    function openModal() {
        let el = document.getElementById('dados-login-overlay');
        if (!el) {
            el = document.createElement('div');
            el.id = 'dados-login-overlay';
            el.className = 'auth-modal active';
            el.setAttribute('role', 'dialog');
            el.setAttribute('aria-modal', 'true');
            el.innerHTML = ''
                + '<div class="auth-card" style="max-width:420px;text-align:center">'
                + '  <h2 style="margin-bottom:8px">Entre pelo Dados LAMIC</h2>'
                + '  <p style="margin-bottom:18px">O acesso ao UniLAMIC usa o mesmo login e senha do Dados LAMIC. '
                + 'Entre por lá e abra o UniLAMIC novamente.</p>'
                + `  <a class="btn btn-primary" href="${U.DADOS_URL}" target="_top" style="display:inline-block;margin-bottom:10px">Ir para o Dados LAMIC</a>`
                + '  <br><button type="button" class="btn btn-secondary" data-close>Fechar</button>'
                + '</div>';
            el.addEventListener('click', (e) => { if (e.target === el || e.target.hasAttribute('data-close')) el.remove(); });
            document.body.appendChild(el);
        }
    }

    // Sair do UniLAMIC é sair do Dados LAMIC (é a mesma conta).
    async function logout() {
        stopWatchingSession();
        clearSession();
        try { await U.auth.signOut(); } catch (e) { /* já deslogado */ }
        notify();
    }

    async function changePassword() {
        throw new Error('A senha agora é a do Dados LAMIC. Troque por lá, no ícone de chave.');
    }

    async function getCourseProgressForUser(userId) {
        if (!userId) return [];
        try {
            const bySlug = (await val(`${PROGRESS_PATH}/${userId}`)) || {};
            const rows = [];
            Object.keys(bySlug).forEach(slug => {
                Object.keys(bySlug[slug] || {}).forEach(subjectId => {
                    Object.keys(bySlug[slug][subjectId] || {}).forEach(themeId => {
                        const e = bySlug[slug][subjectId][themeId] || {};
                        rows.push({
                            slug, subjectId, themeId,
                            total: e.total || 0, done: e.done || 0, pct: e.pct || 0,
                            approved: e.approved ?? null, updatedAt: e.updatedAt || null
                        });
                    });
                });
            });
            return rows;
        } catch (error) {
            console.error('Erro ao carregar progressão de cursos:', error);
            return [];
        }
    }

    U.StudentAuth = {
        ready, getSession, clearSession, refreshSession, watchSession, stopWatchingSession,
        openModal, logout, changePassword, getCourseProgressForUser
    };

    document.addEventListener('uniadmin:session-revoked', (event) => {
        const removed = event.detail?.reason === 'removed';
        const notice = document.createElement('div');
        notice.id = 'session-revoked-overlay';
        notice.setAttribute('role', 'alertdialog');
        notice.setAttribute('aria-modal', 'true');
        notice.innerHTML = ''
            + '<div class="connection-overlay-card">'
            + '  <h2>Sessão encerrada</h2>'
            + `  <p>${removed ? 'Sua conta foi removida.' : 'Sua conta foi desativada no Dados LAMIC.'}</p>`
            + '  <p class="connection-overlay-hint">A página será recarregada.</p>'
            + '</div>';
        document.body.appendChild(notice);
        setTimeout(() => window.location.reload(), 2500);
    });

    window.UniAdmin = U;
})();
