// Limite de tentativas por avaliação. Compartilhado entre o portal
// (js/main.js, que consulta/grava o contador a cada tentativa) e o painel
// admin (js/admin-users.js, que libera o bloqueio pelo histórico do aluno).
//
// Gravado em uniadmin/attempts/byUser/{userId}/{slug}/{subjectId}/{themeId} =
// { count, extraAttempts, locked, updatedAt, unlockedAt, unlockedBy }. Nó
// irmão de results/byUser e progress/byUser — ver js/student-auth.js. Não
// sobrescreve nada do fluxo existente: resultados continuam sendo gravados
// como sempre, isto aqui só conta reprovações consecutivas para travar
// novas tentativas.
//
// `count` nunca é zerado pela liberação do admin — ele guarda o histórico
// real de reprovações. Quem abre a trava é `extraAttempts`: cada liberação
// soma 1 tentativa extra ao limite (limite efetivo = MAX_ATTEMPTS +
// extraAttempts), então o aluno ganha exatamente 1 nova chance por vez, não
// as 3 de novo.
(function () {
    const U = window.UniAdmin;
    const ref = U.ref, get = U.get, set = U.set, db = U.db, dbRoot = U.dbRoot;

    const MAX_ATTEMPTS = 3;
    const BASE_PATH = `/${dbRoot}/attempts/byUser`;

    function pathFor(userId, slug, subjectId, themeId) {
        return `${BASE_PATH}/${userId}/${slug}/${subjectId}/${themeId}`;
    }

    // Limite efetivo de tentativas deste curso, considerando liberações do
    // admin. Centralizado aqui para getState/registerFailedAttempt/unlock
    // nunca calcularem `locked` de formas diferentes entre si.
    function limitFor(state) {
        return MAX_ATTEMPTS + (state.extraAttempts || 0);
    }

    // Estado atual do contador para o curso. Nunca lança: ausência de dado
    // (ou falha de rede) é tratada como "nenhuma tentativa registrada ainda",
    // igual ao resto do app quando offline (ver refreshSession()).
    async function getState(userId, slug, subjectId, themeId) {
        const empty = { count: 0, extraAttempts: 0, locked: false };
        if (!userId) return empty;
        try {
            const snap = await get(ref(db, pathFor(userId, slug, subjectId, themeId)));
            return snap.exists() ? { ...empty, ...snap.val() } : empty;
        } catch (error) {
            return empty;
        }
    }

    async function isLocked(userId, slug, subjectId, themeId) {
        const state = await getState(userId, slug, subjectId, themeId);
        return !!state.locked;
    }

    // Leitura única de todo o histórico de tentativas do usuário, para o
    // modal de histórico (js/admin-users.js) não fazer uma consulta por
    // curso. Devolve um Map "slug|subjectId|themeId" -> estado.
    async function getAllForUser(userId) {
        const map = new Map();
        if (!userId) return map;
        try {
            const snap = await get(ref(db, `${BASE_PATH}/${userId}`));
            if (!snap.exists()) return map;
            const bySlug = snap.val() || {};
            Object.keys(bySlug).forEach(slug => {
                Object.keys(bySlug[slug] || {}).forEach(subjectId => {
                    Object.keys(bySlug[slug][subjectId] || {}).forEach(themeId => {
                        map.set(`${slug}|${subjectId}|${themeId}`, bySlug[slug][subjectId][themeId]);
                    });
                });
            });
        } catch (error) { /* modal cai para "nenhum bloqueio" — ver chamada */ }
        return map;
    }

    // Chamado a cada reprovação. Devolve o estado novo (com `locked` já
    // atualizado) para quem gravou decidir a tela sem precisar reler.
    async function registerFailedAttempt(userId, slug, subjectId, themeId) {
        if (!userId) return { count: 0, extraAttempts: 0, locked: false };
        const current = await getState(userId, slug, subjectId, themeId);
        const count = (current.count || 0) + 1;
        const extraAttempts = current.extraAttempts || 0;
        const state = { count, extraAttempts, locked: count >= MAX_ATTEMPTS + extraAttempts, updatedAt: Date.now() };
        try { await set(ref(db, pathFor(userId, slug, subjectId, themeId)), state); }
        catch (error) { /* offline: contador local do próprio submit ainda vale para esta tela */ }
        return state;
    }

    // Aprovação zera o contador — o curso foi vencido, uma futura reprovação
    // (ex.: refazer por outro motivo) começa a contar do zero de novo.
    async function resetOnPass(userId, slug, subjectId, themeId) {
        if (!userId) return;
        try { await set(ref(db, pathFor(userId, slug, subjectId, themeId)), null); }
        catch (error) { /* não bloqueia a tela de aprovação por causa disto */ }
    }

    // Ação do admin no histórico do aluno: libera exatamente +1 tentativa
    // extra para o curso (não reseta as reprovações já contadas). Registra
    // quem liberou e quando, para auditoria.
    async function unlock(userId, slug, subjectId, themeId, adminName) {
        const current = await getState(userId, slug, subjectId, themeId);
        const extraAttempts = (current.extraAttempts || 0) + 1;
        const state = {
            ...current,
            extraAttempts,
            locked: current.count >= MAX_ATTEMPTS + extraAttempts,
            unlockedAt: Date.now(),
            unlockedBy: adminName || 'admin'
        };
        await set(ref(db, pathFor(userId, slug, subjectId, themeId)), state);
        return state;
    }

    U.Attempts = { MAX_ATTEMPTS, limitFor, getState, isLocked, getAllForUser, registerFailedAttempt, resetOnPass, unlock };
})();
