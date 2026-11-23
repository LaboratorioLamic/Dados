// ===== Router (hash) + sidebar =====

// Registro de páginas: cada módulo se registra aqui.
// { id, title, icon, perm (null = sempre), adminOnly, render(container) }
const PAGES = [];

function registerPage(page) { PAGES.push(page); }

function visiblePages() {
    return PAGES.filter(p => {
        if (p.adminOnly) return currentUser?.admin;
        if (p.perm) return can(p.perm);
        return true;
    }).sort((a, b) => (a.order || 99) - (b.order || 99));
}

// ---- Sidebar suspensa (hambúrguer) ----
const sidebarEl = () => document.getElementById('sidebar');
const sidebarOverlayEl = () => document.getElementById('sidebarOverlay');

function setSidebar(aberta) {
    const el = sidebarEl(), ov = sidebarOverlayEl(), btn = document.getElementById('btnMenu');
    if (!el) return;
    el.classList.toggle('open', aberta);
    ov?.classList.toggle('show', aberta);
    btn?.setAttribute('aria-expanded', String(aberta));
    // Trava o scroll do fundo enquanto o menu cobre a tela
    document.body.style.overflow = aberta ? 'hidden' : '';
    if (aberta) el.querySelector('.nav-item.active, .nav-item')?.focus?.();
}
const toggleSidebar = () => setSidebar(!sidebarEl()?.classList.contains('open'));
const closeSidebar = () => setSidebar(false);

// Handler nomeado: showApp() roda de novo a cada login, e re-registrar duplicaria o atalho.
// Registrado na fase de CAPTURA para ler o estado ANTES de ui.js fechar o modal no Esc —
// senão um único Esc fecharia modal e sidebar de uma vez.
function sidebarKeydown(e) {
    const temCamada = !!document.querySelector('.modal-overlay, .drawer');
    if (e.key === 'Escape') {
        // Modal/drawer tem precedência: ui.js cuida deles neste mesmo Esc.
        if (!temCamada && sidebarEl()?.classList.contains('open')) closeSidebar();
        return;
    }
    const digitando = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if (digitando || temCamada || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.toLowerCase() === 'm') { e.preventDefault(); toggleSidebar(); }
}

function initSidebarToggle() {
    document.getElementById('btnMenu').onclick = toggleSidebar;
    document.getElementById('sidebarClose').onclick = closeSidebar;
    document.getElementById('sidebarOverlay').onclick = closeSidebar;
    document.removeEventListener('keydown', sidebarKeydown, true);
    document.addEventListener('keydown', sidebarKeydown, true);
}

function renderSidebar() {
    const nav = document.getElementById('sidebarNav');
    nav.innerHTML = visiblePages().map(p => `
        <div class="nav-item" data-page="${p.id}" tabindex="0" role="button">
            ${icon(p.icon)}
            <span>${escapeHtml(p.title)}</span>
        </div>`).join('');
    nav.querySelectorAll('.nav-item').forEach(el => {
        const ir = () => { location.hash = `#/${el.dataset.page}`; closeSidebar(); };
        el.onclick = ir;
        el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ir(); } };
    });

    // Rodapé: usuário logado
    const foot = document.getElementById('sidebarUser');
    foot.innerHTML = `
        <div class="avatar">${iniciais(currentUser.nome)}</div>
        <div class="user-info grow">
            <div class="user-name">${escapeHtml(currentUser.nome)}</div>
            <div class="user-role">${currentUser.admin ? 'Administrador' : 'Usuário'}</div>
        </div>
        <button class="btn-logout" title="Sair">${icon('logout')}</button>`;
    foot.querySelector('.btn-logout').onclick = doLogout;
}

function navigate() {
    const pages = visiblePages();
    if (!pages.length) {
        document.getElementById('pageContainer').innerHTML =
            emptyState({ icon: 'lock', title: 'Sem permissões', text: 'Seu usuário não possui permissão para ver nenhum módulo. Contate um administrador.' });
        return;
    }
    const id = (location.hash || '').replace(/^#\//, '') || pages[0].id;
    const page = pages.find(p => p.id === id) || pages[0];

    document.querySelectorAll('.nav-item').forEach(el =>
        el.classList.toggle('active', el.dataset.page === page.id));
    document.getElementById('pageTitle').textContent = page.title;

    const container = document.getElementById('pageContainer');
    container.innerHTML = '';
    // `wide: true` libera o limite de largura — para páginas de tabela larga (folha, resultados)
    container.className = 'page' + (page.wide ? ' page-wide' : '');
    closePopover();
    page.render(container);
}

function initRouter() {
    window.removeEventListener('hashchange', navigate);
    window.addEventListener('hashchange', navigate);
    navigate();
}
