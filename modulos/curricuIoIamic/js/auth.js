// ===== Autenticação e permissões =====

const SESSION_KEY = 'rh_sessao';
let currentUser = null;

// ===== Modelo de permissões =====
// Organizado em ÁRVORE: MÓDULO (tela do menu) → SUB-ITENS (as abas de dentro da tela), no
// espírito do menu de cadastros que expande para mostrar cada item. Cada leaf tem só as ações
// que o sistema REALMENTE controla — nada de coluna decorativa que não é aplicada:
//   • consultar → gate `ver_*`   : abrir a aba/tela e ler os registros.
//   • gerenciar → gate `editar_*`: incluir, alterar e excluir.
//
// Lançamentos é a tela com várias abas; a VISUALIZAÇÃO é por aba (Férias, Faltas, ASO...),
// controlando quais abas o usuário enxerga. A GESTÃO (incluir/alterar/excluir) fica no nível
// do módulo porque os mesmos formulários de edição são reaproveitados fora da tela de
// Lançamentos (na ficha do funcionário) — separar por aba criaria brechas e inconsistência.
const PERM_ACOES = {
    consultar: { label: 'Visualizar', desc: 'Ver e abrir os registros', icon: 'eye' },
    gerenciar: { label: 'Gerenciar', desc: 'Incluir, alterar e excluir', icon: 'edit' }
};

// Sub-abas da tela de Lançamentos (espelham LANC_TABS em lancamentos.js). `fin` = a aba é
// financeira e também exige ver_folha + ver_financeiro para aparecer.
const PERM_LANC_SUBS = [
    { id: 'ferias', label: 'Férias' },
    { id: 'ausencias', label: 'Faltas e Licenças' },
    { id: 'ausparcial', label: 'Ausências parciais' },
    { id: 'cat', label: 'CAT' },
    { id: 'aso', label: 'ASO' },
    { id: 'demissoes', label: 'Demissões' },
    { id: 'treinamentos', label: 'Treinamentos' },
    { id: 'promocoes', label: 'Promoções' },
    { id: 'transferencias', label: 'Transferências' },
    { id: 'disciplinar', label: 'Medidas disciplinares' },
    { id: 'bancohoras', label: 'Banco de horas' },
    { id: 'decimo', label: '13º Salário', fin: true },
    { id: 'folhagrid', label: 'Folha mensal', fin: true }
].map(s => ({ ...s, ver: 'ver_lanc_' + s.id }));

const PERM_MODULOS = [
    {
        id: 'dashboard', label: 'Dashboard', icon: 'dashboard',
        desc: 'Indicadores e visão geral do RH',
        acoes: [{ tipo: 'consultar', key: 'ver_dashboard' }]
    },
    {
        id: 'funcionarios', label: 'Funcionários', icon: 'users',
        desc: 'Cadastro e ficha dos colaboradores',
        acoes: [
            { tipo: 'consultar', key: 'ver_funcionarios' },
            { tipo: 'gerenciar', key: 'editar_funcionarios' }
        ]
    },
    {
        id: 'lancamentos', label: 'Lançamentos', icon: 'calendar',
        desc: 'Eventos de RH — visualização por aba',
        // Ação de gestão no nível do módulo (ver comentário acima).
        acoes: [{ tipo: 'gerenciar', key: 'editar_lancamentos' }],
        // Visualização por aba: cada leaf tem sua própria permissão de ver.
        viewCoarse: 'ver_lancamentos',
        subs: PERM_LANC_SUBS
    },
    {
        id: 'folha', label: 'Folha & Custos', icon: 'money',
        desc: 'Folha de pagamento e custos mensais',
        acoes: [
            { tipo: 'consultar', key: 'ver_folha' },
            { tipo: 'gerenciar', key: 'editar_folha' }
        ]
    },
    {
        id: 'resultados', label: 'Resultados', icon: 'chart',
        desc: 'Relatórios e análises consolidadas',
        acoes: [{ tipo: 'consultar', key: 'ver_resultados' }]
    }
];

// Permissões sensíveis (transversais a vários módulos)
const PERM_SENSIVEIS = [
    {
        key: 'ver_financeiro', label: 'Valores financeiros', icon: 'money',
        desc: 'Salários, custos e totais em R$ — em todos os módulos.'
    },
    // Dado de saúde é categoria especial na LGPD (art. 11): quem controla prazo de ASO não
    // precisa ver o resultado clínico. Sem esta permissão a aba mostra datas e vencimentos
    // (o que o RH precisa para não tomar autuação), mas oculta resultado, restrições e laudo.
    {
        key: 'ver_medico', label: 'Dados médicos', icon: 'medical',
        desc: 'Resultado do ASO, restrições e laudos (LGPD art. 11).'
    },
    // Medida disciplinar é dado de conduta: quem controla o prazo da suspensão e o reflexo na
    // folha não precisa ler a descrição do fato. Sem esta permissão a aba mostra tipo, data,
    // período e ciência (o que é gestão), mas oculta o motivo, o relato e o documento. A
    // EXISTÊNCIA da medida nunca é escondida — ocultá-la distorceria a trajetória do colaborador.
    {
        key: 'ver_disciplinar', label: 'Dados disciplinares', icon: 'lock',
        desc: 'Motivo detalhado, descrição do fato e documentos das medidas disciplinares.'
    }
];

// Lista achatada (compat. com quem itera PERMISSOES: seed do 1º admin, backup, etc.)
const PERMISSOES = [
    ...PERM_MODULOS.flatMap(m => [
        ...(m.acoes || []).map(a => ({ key: a.key, grupo: m.label, label: `${PERM_ACOES[a.tipo].label} — ${m.label}` })),
        ...(m.viewCoarse ? [{ key: m.viewCoarse, grupo: m.label, label: `Ver — ${m.label}` }] : []),
        ...(m.subs || []).map(s => ({ key: s.ver, grupo: m.label, label: `Ver ${s.label} — ${m.label}` }))
    ]),
    ...PERM_SENSIVEIS.map(p => ({ key: p.key, grupo: 'Sensível', label: p.label }))
];
const PERM_KEYS = PERMISSOES.map(p => p.key);

// Expande/normaliza um conjunto de permissões para que os gates grosos e os por-aba fiquem
// coerentes entre si:
//   • Grupo legado que só tem `ver_lancamentos` (sem as chaves por aba) → libera todas as abas.
//   • O gate groso `ver_lancamentos` (usado no menu e no registerPage) passa a refletir se há
//     ao menos UMA aba visível.
function expandirPerms(perms) {
    const p = { ...(perms || {}) };
    const subKeys = PERM_LANC_SUBS.map(s => s.ver);
    const algumSub = subKeys.some(k => p[k]);
    if (p.ver_lancamentos && !algumSub) subKeys.forEach(k => p[k] = true); // legado → todas as abas
    p.ver_lancamentos = subKeys.some(k => p[k]);                            // coarse reflete as abas
    return p;
}

// Cache dos grupos carregados na sessão (para resolver perms e exibir o nome do grupo).
let gruposCache = null;
async function carregarGrupos(force) {
    if (!gruposCache || force) gruposCache = await DB.getAll(PATHS.grupos);
    return gruposCache;
}
function grupoPorId(id) { return (gruposCache || []).find(g => g.id === id) || null; }

// Resolve o conjunto de permissões efetivo de um usuário: admin = tudo; senão, as permissões
// do GRUPO ao qual ele pertence; e, por retrocompatibilidade, as permissões gravadas
// direto no usuário (modelo antigo) quando ele ainda não tem grupo.
async function resolverPerms(user) {
    if (user.admin) { const p = {}; PERM_KEYS.forEach(k => p[k] = true); return p; }
    let base;
    if (user.grupoId) {
        await carregarGrupos();
        base = grupoPorId(user.grupoId)?.perms || {};
    } else {
        base = user.perms || {}; // modelo legado (perms direto no usuário)
    }
    return expandirPerms(base);
}

// Visualização por aba de Lançamentos (admin sempre pode).
function podeVerLanc(subId) {
    if (!currentUser) return false;
    if (currentUser.admin) return true;
    return !!currentUser.perms?.['ver_lanc_' + subId];
}

function getSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; }
}

function setSession(user) {
    currentUser = user;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

function clearSession() {
    currentUser = null;
    sessionStorage.removeItem(SESSION_KEY);
}

// user.admin === true → tudo liberado
function can(perm) {
    if (!currentUser) return false;
    if (currentUser.admin) return true;
    return !!(currentUser.perms && currentUser.perms[perm]);
}

// ---- Sessão vinda do Dados LAMIC ----
// Não há mais login nem senha próprios do RH. Quem entrou no Dados LAMIC (Firebase Auth do
// projeto applamic) chega logado. O acesso ao RH e o grupo de permissões continuam aqui, em
// rh_usuarios, ligados pelo campo `login` (= login do Dados). Administrador do Dados é sempre
// administrador do RH.
async function entrarComDados(user) {
    const login = await DB.getObj(`uids/${user.uid}`);
    if (!login) throw new Error('Conta sem cadastro no Dados LAMIC.');
    const perfil = await DB.getObj(`usuarios/${login}`);
    if (!perfil || perfil.ativo !== true) throw new Error('Sua conta está desativada no Dados LAMIC.');
    const adminDados = perfil.grupo === 'admin';
    let rhUser = null;
    try {
        const usuarios = await DB.getAll(PATHS.usuarios);
        rhUser = usuarios.find(u => (u.login || '').toLowerCase() === login) || null;
    } catch (e) {
        if (!adminDados) throw new Error('Você não tem acesso ao RH LAMIC. Peça a um administrador do RH.');
        throw e;
    }
    if (!adminDados) {
        if (!rhUser) throw new Error('Você não tem acesso ao RH LAMIC. Peça a um administrador do RH.');
        if (rhUser.ativo === false) throw new Error('Usuário inativo no RH. Contate um administrador.');
    }
    const admin = adminDados || !!rhUser?.admin;
    const base = { admin, grupoId: rhUser?.grupoId || null, perms: rhUser?.perms || null };
    const perms = await resolverPerms(base);
    setSession({
        id: rhUser?.id || null,
        nome: perfil.nome || rhUser?.nome || login,
        login,
        uid: user.uid,
        admin,
        grupoId: base.grupoId,
        grupoNome: base.grupoId ? (grupoPorId(base.grupoId)?.nome || null) : null,
        perms
    });
    return currentUser;
}

// Confere a senha do Dados LAMIC do usuário logado (usado antes de ações sensíveis).
async function confirmarSenhaDados(senha) {
    const user = fbAuth.currentUser;
    if (!user || !currentUser?.login) throw new Error('Sessão expirada. Recarregue a página.');
    const v = (await DB.getObj(`logins/${currentUser.login}/v`)) || 0;
    const cred = firebase.auth.EmailAuthProvider.credential(dadosEmail(currentUser.login, v), senha);
    try { await user.reauthenticateWithCredential(cred); return true; }
    catch (e) {
        if (/wrong-password|invalid-credential|invalid-login/.test(e.code || '')) return false;
        throw e;
    }
}

async function doLogout() {
    clearSession();
    location.hash = '';
    try { await fbAuth.signOut(); } catch (e) { /* já saiu */ }
    location.reload();
}

// ---- Telas ----
function showLogin(msg) {
    if (window.LamicCarregando) window.LamicCarregando.fim();   // fim do carregamento padrão
    document.getElementById('app').classList.remove('show');
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('loginMsg').textContent = msg
        || 'O RH LAMIC usa o mesmo login e senha do Dados LAMIC. Entre por lá e abra o RH novamente.';
    document.getElementById('btnDados').style.display = '';
}

function showApp() {
    if (window.LamicCarregando) window.LamicCarregando.fim();   // fim do carregamento padrão
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('app').classList.add('show');
    renderSidebar();
    initSidebarToggle();
    if (can('ver_dashboard') && typeof refreshNotificacoes === 'function') refreshNotificacoes();
    // Parâmetros globais (alerta de prazo de férias, vencimento de ASO, ciclo de banco de
    // horas) antes da primeira página renderizar
    DB.getObj(PATHS.parametros).then(p => { setFeriasParams(p || {}); setAsoParams(p || {}); setBhParams(p || {}); setDecimoParams(p || {}); initRouter(); })
        .catch(() => initRouter());
}
