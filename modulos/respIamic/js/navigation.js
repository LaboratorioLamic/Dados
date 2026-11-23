// Navegação: abas, agendas, sub-abas de configurações e drawer

// SUB-ABAS DE CONFIGURAÇÕES
function switchConfigTab(tab) {
    document.querySelectorAll('.cfg-tab').forEach(el => el.classList.add('hidden'));
    document.getElementById(`cfg-tab-${tab}`).classList.remove('hidden');
    ['usuarios', 'backup'].forEach(t => {
        const btn = document.getElementById(`cfg-btn-${t}`);
        if (t === tab) {
            btn.classList.add('bg-navy-900', 'text-white', 'shadow-md');
            btn.classList.remove('text-slate-500', 'hover:bg-slate-100');
        } else {
            btn.classList.remove('bg-navy-900', 'text-white', 'shadow-md');
            btn.classList.add('text-slate-500', 'hover:bg-slate-100');
        }
    });
}

// NAVEGAÇÃO DE ABAS
const ABAS_DA_AGENDA = ['dashboard', 'dados', 'indicadores', 'demografia'];

function markActiveTab(tab) {
    document.querySelectorAll('[data-drawer-tab]').forEach(b => {
        const mesmaTab = b.dataset.drawerTab === tab;
        const agendaDoItem = b.dataset.drawerAgenda;
        const ativo = mesmaTab && (!agendaDoItem || agendaDoItem === currentAgendaId);
        b.classList.toggle('is-active', ativo);
    });
    // Grupo da agenda ativa fica destacado enquanto navegamos dentro dela
    document.querySelectorAll('[data-drawer-group]').forEach(g => {
        g.classList.toggle('is-current', g.dataset.drawerGroup === currentAgendaId && ABAS_DA_AGENDA.includes(tab));
    });
}

function switchTab(tab) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');
    markActiveTab(tab);

    if (tab === 'inicio') renderHomeCards();
    if (tab === 'dashboard') renderCalendar();
    if (tab === 'indicadores' || tab === 'demografia') _moverFiltrosInd(tab);
    if (tab === 'indicadores') renderIndicadores();
    if (tab === 'demografia') renderDemografia();
}

// A barra de filtros dos indicadores é compartilhada com a Demografia
function _moverFiltrosInd(tab) {
    const barra = document.getElementById('ind-filtros');
    const destino = document.getElementById(`tab-${tab}`);
    if (barra && destino && barra.parentElement !== destino) destino.prepend(barra);
    const titulo = document.getElementById('ind-titulo-aba');
    if (titulo) titulo.innerText = tab === 'demografia' ? 'Demografia' : 'Indicadores';
    const granul = document.getElementById('ind-granul-wrap');
    if (granul) granul.classList.toggle('hidden', tab === 'demografia');
}

// ── SELEÇÃO DE AGENDA ───────────────────────────────────────
function selectAgenda(agendaId, tab) {
    if (!AGENDAS[agendaId]) return;
    let destino = tab && ABAS_DA_AGENDA.includes(tab) ? tab : 'dashboard';
    // Demografia depende de endereço: só nas agendas domiciliares
    if (destino === 'demografia' && !temCampo('endereco', AGENDAS[agendaId])) destino = 'dashboard';

    if (agendaId !== currentAgendaId) {
        currentAgendaId = agendaId;
        localStorage.setItem('respiroAgendaAtiva', agendaId);
        appointments = appointmentsDe(agendaId);
        tablePage = 1;
        applyAgendaConfig();
        resetAgendaFilters();
        updateDatalists();
        updateFilterDropdowns();
        renderTable();
        // A rastreabilidade é por agenda: sem isso o painel continuaria
        // mostrando o movimento da aba anterior.
        renderTraceability();
    }
    switchTab(destino);
}

// Abre a agenda a partir de um card da tela inicial
function openAgendaFrom(agendaId, tab) {
    selectAgenda(agendaId, tab);
}

// Limpa filtros da tabela ao trocar de agenda (substrato não existe em todas)
function resetAgendaFilters() {
    ['filter-search', 'filter-atendente', 'filter-substrato', 'filter-status'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
}

// Aplica a configuração da agenda ativa ao DOM (campos, rótulos, KPIs, legenda)
function applyAgendaConfig() {
    const agenda = currentAgenda();
    const cores = agendaCores(agenda);

    // Cabeçalhos das abas
    const setTexto = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };
    const setIcone = (id, classe) => { const el = document.getElementById(id); if (el) el.className = `fas ${classe}`; };
    const setNomeAgenda = (id, nome, cidadeTag) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = cidadeTag
            ? `${nome} <span class="agenda-cidade-tag"><i class="fas fa-city"></i>${cidadeTag}</span>`
            : nome;
    };

    setNomeAgenda('agenda-nome-dashboard', agenda.nome, agenda.cidadeTag);
    setNomeAgenda('agenda-nome-tabela', agenda.nome, agenda.cidadeTag);
    setNomeAgenda('agenda-nome-indicadores', agenda.nome, agenda.cidadeTag);
    setIcone('agenda-icone-dashboard', agenda.icon);
    setIcone('agenda-icone-tabela', agenda.icon);
    setIcone('agenda-icone-indicadores', agenda.icon);

    // Campos do formulário controlados pela config
    document.querySelectorAll('[data-agenda-campo]').forEach(el => {
        const ativo = temCampo(el.dataset.agendaCampo, agenda);
        el.classList.toggle('hidden', !ativo);
        el.querySelectorAll('input, select, textarea').forEach(f => {
            if (!ativo) {
                f.dataset.eraObrigatorio = f.required ? '1' : '0';
                f.required = false;
            } else if (f.dataset.eraObrigatorio === '1') {
                f.required = true;
            }
        });
    });

    // Botões do checklist
    document.querySelectorAll('[data-checklist-item]').forEach(el => {
        el.classList.toggle('hidden', !temChecklist(el.dataset.checklistItem, agenda));
    });

    // KPIs e gráficos dos indicadores
    document.querySelectorAll('[data-agenda-kpi]').forEach(el => {
        el.classList.toggle('hidden', !agenda.kpis.includes(el.dataset.agendaKpi));
    });
    document.querySelectorAll('[data-agenda-chart]').forEach(el => {
        el.classList.toggle('hidden', !agenda.charts.includes(el.dataset.agendaChart));
    });

    // Legenda do calendário
    document.querySelectorAll('[data-agenda-legenda]').forEach(el => {
        el.classList.toggle('hidden', !agenda.legenda.includes(el.dataset.agendaLegenda));
    });
    const dotAgendado = document.getElementById('legenda-agendado-dot');
    if (dotAgendado) dotAgendado.className = `h-2 w-2 rounded-full ${cores.dot}`;

    // Colunas da tabela
    document.querySelectorAll('[data-agenda-coluna]').forEach(el => {
        el.classList.toggle('hidden', !temCampo(el.dataset.agendaColuna, agenda));
    });

    // 3º filtro da tabela: Substrato nas agendas com exame, Bairro nas domiciliares
    const filtro3 = document.getElementById('filter-substrato');
    if (filtro3) {
        filtro3.classList.toggle('hidden', !temCampo('substrato', agenda) && !temCampo('endereco', agenda));
    }

    // Cor de destaque dos cabeçalhos
    const accentPorCor = { blue: 'text-blue-400', teal: 'text-teal-400', amber: 'text-amber-400', ice: 'text-sky-400' };
    document.querySelectorAll('[data-agenda-accent]').forEach(el => {
        el.classList.remove('text-blue-400', 'text-teal-400', 'text-amber-400', 'text-sky-400');
        el.classList.add(accentPorCor[agenda.cor] || 'text-blue-400');
    });

    // Rótulo de vagas por dia usado pelo calendário
    document.documentElement.style.setProperty('--agenda-cor', cores.chart);
}

// ── MENU SUSPENSO LATERAL (DRAWER) ──────────────────────────
function isDrawerOpen() {
    return document.getElementById('side-drawer').classList.contains('is-open');
}

function openDrawer() {
    document.getElementById('side-drawer').classList.add('is-open');
    document.getElementById('drawer-backdrop').classList.add('is-open');
    const burger = document.getElementById('burger-btn');
    burger.classList.add('is-open');
    burger.setAttribute('aria-expanded', 'true');
    burger.setAttribute('aria-label', 'Fechar menu');
    syncDrawerUser();
    expandDrawerGroup(currentAgendaId);
}

function closeDrawer() {
    document.getElementById('side-drawer').classList.remove('is-open');
    document.getElementById('drawer-backdrop').classList.remove('is-open');
    const burger = document.getElementById('burger-btn');
    burger.classList.remove('is-open');
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-label', 'Abrir menu');
}

function toggleDrawer() {
    isDrawerOpen() ? closeDrawer() : openDrawer();
}

function drawerNavigate(tab) {
    closeDrawer();
    switchTab(tab);
}

// Navega para uma aba de uma agenda específica a partir do drawer
function drawerNavigateAgenda(agendaId, tab) {
    closeDrawer();
    selectAgenda(agendaId, tab);
}

// ── DROPDOWN DE AGENDAS NO DRAWER ───────────────────────────
function toggleDrawerGroup(agendaId) {
    const grupo = document.querySelector(`[data-drawer-group="${agendaId}"]`);
    if (!grupo) return;
    const aberto = grupo.classList.toggle('is-expanded');
    const header = grupo.querySelector('.drawer-group-header');
    if (header) header.setAttribute('aria-expanded', aberto ? 'true' : 'false');
}

function expandDrawerGroup(agendaId) {
    const grupo = document.querySelector(`[data-drawer-group="${agendaId}"]`);
    if (!grupo || grupo.classList.contains('is-expanded')) return;
    grupo.classList.add('is-expanded');
    const header = grupo.querySelector('.drawer-group-header');
    if (header) header.setAttribute('aria-expanded', 'true');
}

// Reflete o usuário logado dentro do drawer
function syncDrawerUser() {
    const box = document.getElementById('drawer-user');
    const cfgBtn = document.getElementById('drawer-btn-config');
    if (!currentUser) {
        box.classList.add('hidden');
        box.classList.remove('flex');
        cfgBtn.classList.add('hidden');
        return;
    }
    box.classList.remove('hidden');
    box.classList.add('flex');
    document.getElementById('drawer-user-initials').innerText = getInitials(currentUser.fullName);
    document.getElementById('drawer-user-name').innerText = formatAtendenteName(currentUser.fullName);
    document.getElementById('drawer-user-role').innerText = isAdmin() ? 'Administrador' : 'Atendente';
    cfgBtn.classList.toggle('hidden', !isAdmin());
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isDrawerOpen()) closeDrawer();
});
