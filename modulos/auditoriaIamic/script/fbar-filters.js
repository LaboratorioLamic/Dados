// === NOVA BARRA DE FILTROS (fbar) ===
// Controla: Minhas Tarefas, Filtro por Responsável/Revisor,
//           Filtros Avançados (dropdown), Pesquisa por título,
//           Filtro de Data no header.

// ── Estado ─────────────────────────────────────────────────────────────────
var fbarMyTasksActive = true;          // Minhas Tarefas ligado por padrão
var fbarMyTasksMode = 'responsavel';  // 'responsavel' | 'revisor' | 'all'
var fbarRespFilter    = '';            // valor do filtro responsável
var fbarRevFilter     = '';            // valor do filtro revisor
var _peopleFilterType = 'responsavel'; // qual modal está aberto
var fbarDateMode      = 'all';         // 'all' | 'year' | 'month' | 'week'
var fbarDateYear      = new Date().getFullYear();
var fbarDateMonth     = new Date().getMonth(); // 0-11

// ── HELPERS ─────────────────────────────────────────────────────────────────
function _tabPrefix() {
    const map = { auditoria:'Audit', atividades:'Ativ', manutencao:'Mant', documentos:'Doc' };
    return map[currentTab] || 'Audit';
}

function _hasRevisor() {
    const p = _tabPrefix();
    return p !== 'Mant';
}

// ── MINHAS TAREFAS ──────────────────────────────────────────────────────────
function toggleMyTasks() {
    // Toggle visibility of the small dropdown under the button
    const dd = document.getElementById('fbarMyTasksDropdown');
    if (!dd) return;
    const open = dd.style.display === 'block';
    // close other dropdowns
    const other = document.getElementById('filtersDropdown'); if (other) other.style.display = 'none';
    const ddDate = document.getElementById('fbarDateDropdown'); if (ddDate) ddDate.style.display = 'none';
    dd.style.display = open ? 'none' : 'block';
}

function setMyTasksMode(mode) {
    fbarMyTasksMode = mode;
    // Close dropdown
    const dd = document.getElementById('fbarMyTasksDropdown'); if (dd) dd.style.display = 'none';

    if (mode === 'responsavel') {
        fbarMyTasksActive = true;
        fbarRespFilter = '';
        fbarRevFilter = '';
    } else if (mode === 'revisor') {
        fbarMyTasksActive = true;
        fbarRevFilter = '';
        fbarRespFilter = '';
    } else { // all
        fbarMyTasksActive = false;
        fbarRespFilter = '';
        fbarRevFilter = '';
    }

    _updatePeopleBtnUI('responsavel');
    _updatePeopleBtnUI('revisor');
    _syncPeopleBtnsVisibility();
    _syncHiddenSelects();
    if (typeof currentTab !== 'undefined' && currentTab === 'dashboard' && typeof renderDashboard === 'function') {
        renderDashboard();
    } else {
        renderCards();
    }
    if (typeof updateNotificationCount === 'function') updateNotificationCount();
}

function _syncPeopleBtnsVisibility() {
    const rBtn = document.getElementById('fbarRespBtn');
    const vBtn = document.getElementById('fbarRevBtn');
    // Quando "Minhas Tarefas" está ativo como responsável: oculta botão responsável mas mantém revisor visível
    // Quando ativo como revisor: oculta botão revisor mas mantém responsável visível
    // Quando desativado (all): mostra ambos
    if (fbarMyTasksActive) {
        if (rBtn) rBtn.style.display = fbarMyTasksMode === 'revisor' ? 'inline-flex' : 'none';
        if (vBtn) vBtn.style.display = (fbarMyTasksMode === 'responsavel' && _hasRevisor()) ? 'inline-flex' : 'none';
    } else {
        if (rBtn) rBtn.style.display = 'inline-flex';
        if (vBtn) vBtn.style.display = _hasRevisor() ? 'inline-flex' : 'none';
    }
    // NOTE: não limpar filtros aqui — toggleMyTasks controla quando setar/limpar
}

// Extrai todos os nomes de um campo responsável (resolve IDs para nomes)
function _parseAllNames(raw) {
    return typeof _parseUserField === 'function' ? _parseUserField(raw) : [];
}

// Verifica se um campo (JSON array de IDs ou nomes) referencia o usuário atual
function _fieldHasCurrentUser(raw) {
    if (!raw || !currentuser) return false;
    const meId   = currentuser.id || '';
    const meName = (currentuser.name || '').trim().toLowerCase();
    try {
        const arr = JSON.parse(String(raw));
        const vals = Array.isArray(arr) ? arr : [String(arr)];
        return vals.some(v => { const vs = String(v).trim(); return (meId && vs === meId) || vs.toLowerCase() === meName; });
    } catch { const vs = String(raw).trim(); return (meId && vs === meId) || vs.toLowerCase() === meName; }
}

// Passa no filtro "Minhas Tarefas"
function passesFbarMyTasks(item) {
    if (!fbarMyTasksActive || !currentuser) return true;
    const isResp = _fieldHasCurrentUser(item.responsavelTecnico || item.responsavel || '');
    const isRev  = _fieldHasCurrentUser(item.revisor || '');
    if (fbarMyTasksMode === 'responsavel') return isResp;
    if (fbarMyTasksMode === 'revisor')     return isRev;
    return isResp || isRev;
}

// ── FILTROS POR PESSOA ───────────────────────────────────────────────────────
function openPeopleFilter(type) {
    _peopleFilterType = type;
    const modal = document.getElementById('modalPeopleFilter');
    const title = document.getElementById('peopleFilterTitle');
    const icon  = document.getElementById('peopleFilterIcon');
    const search = document.getElementById('peopleFilterSearch');
    if (!modal) return;
    if (title) title.textContent = type === 'responsavel' ? 'Selecionar Responsável' : 'Selecionar Revisor';
    if (icon)  icon.innerHTML = type === 'responsavel' ? '<i class="fas fa-user"></i>' : '<i class="fas fa-user-check"></i>';
    if (search) search.value = '';
    renderPeopleFilterList();
    modal.style.display = 'flex';
}

function closePeopleFilter() {
    const modal = document.getElementById('modalPeopleFilter');
    if (modal) modal.style.display = 'none';
    _dashPeopleMode = false;
}

function renderPeopleFilterList() {
    const list   = document.getElementById('peopleFilterList');
    const search = document.getElementById('peopleFilterSearch');
    if (!list) return;

    const query = (search?.value || '').toLowerCase().trim();
    const type  = _peopleFilterType;
    const current = type === 'responsavel' ? fbarRespFilter : fbarRevFilter;

    // Coleta apenas cards visíveis respeitando os demais filtros ativos
    const prefix = _tabPrefix();
    let items = [];
    if (prefix === 'Audit')      items = audits || [];
    else if (prefix === 'Ativ')  items = activities || [];
    else if (prefix === 'Mant')  items = maintenances || [];
    else if (prefix === 'Doc')   items = documents || [];
    items = items.filter(i => !i.deleted);
    // Aplica todos os filtros ativos excluindo o próprio filtro de pessoa sendo populado
    if (typeof passesFilters === 'function') {
        const excluded = type === 'revisor' ? { revisor: true } : { responsavel: true };
        items = items.filter(i => passesFilters(prefix, i, excluded));
    }

    // Conjunto de usuários válidos (com id e name)
    const validUsers = (users || []).filter(u => u.id && u.name);

    const resolvedNames = new Set();
    items.forEach(item => {
        const raw = type === 'responsavel'
            ? (item.responsavelTecnico || item.responsavel || '')
            : (item.revisor || '');
        if (!raw) return;
        try {
            const arr = JSON.parse(raw);
            (Array.isArray(arr) ? arr : [arr]).forEach(val => {
                const vs = String(val).trim();
                // Tenta resolver como ID primeiro
                const byId = validUsers.find(u => u.id === vs);
                if (byId) { resolvedNames.add(byId.name); return; }
                // Tenta como nome (legado)
                const byName = validUsers.find(u => u.name.toLowerCase() === vs.toLowerCase());
                if (byName) { resolvedNames.add(byName.name); return; }
                // Ignora valores inválidos (IDs sem usuário correspondente)
            });
        } catch (_) {
            const vs = String(raw).trim();
            const byId = validUsers.find(u => u.id === vs);
            if (byId) { resolvedNames.add(byId.name); return; }
            const byName = validUsers.find(u => u.name.toLowerCase() === vs.toLowerCase());
            if (byName) resolvedNames.add(byName.name);
        }
    });

    let realNames = [...resolvedNames].sort((a, b) => a.localeCompare(b));

    const filtered = query ? realNames.filter(n => n.toLowerCase().includes(query)) : realNames;

    if (!filtered.length) {
        list.innerHTML = `<div style="text-align:center; color:var(--text-muted); padding:24px; font-size:13px;">Nenhum resultado encontrado</div>`;
        return;
    }

    list.innerHTML = filtered.map(name => {
        const sel = (name.toLowerCase() === current.toLowerCase()) && current !== '';
        return `<div class="people-filter-item ${sel ? 'selected' : ''}" onclick="selectPeopleFilter('${_escPeople(name)}')">
            <div class="people-filter-item-check"><i class="fas fa-check"></i></div>
            <div class="people-filter-item-info">
                <div class="people-filter-item-name">${_escHtmlF(name)}</div>
            </div>
        </div>`;
    }).join('');
}

function selectPeopleFilter(name) {
    const type = _peopleFilterType;
    if (type === 'responsavel') {
        fbarRespFilter = (fbarRespFilter.toLowerCase() === name.toLowerCase()) ? '' : name;
    } else {
        fbarRevFilter = (fbarRevFilter.toLowerCase() === name.toLowerCase()) ? '' : name;
    }
    _updatePeopleBtnUI(type);
    renderPeopleFilterList();
    // Sincroniza com selects ocultos
    _syncHiddenSelects();
    renderCards();
}

function _updatePeopleBtnUI(type) {
    if (type === 'responsavel') {
        const btn   = document.getElementById('fbarRespBtn');
        const label = document.getElementById('fbarRespLabel');
        const badge = document.getElementById('fbarRespBadge');
        const active = !!fbarRespFilter;
        if (btn) btn.classList.toggle('active', active);
        if (label) label.textContent = active ? fbarRespFilter : 'Filtrar por Responsável';
        if (badge) badge.style.display = active ? 'inline-flex' : 'none';
        if (badge && active) badge.textContent = '1';
    } else {
        const btn   = document.getElementById('fbarRevBtn');
        const label = document.getElementById('fbarRevLabel');
        const badge = document.getElementById('fbarRevBadge');
        const active = !!fbarRevFilter;
        if (btn) btn.classList.toggle('active', active);
        if (label) label.textContent = active ? fbarRevFilter : 'Filtrar por Revisor';
        if (badge) badge.style.display = active ? 'inline-flex' : 'none';
        if (badge && active) badge.textContent = '1';
    }
}

// Sincroniza os filtros de pessoas com os selects ocultos usados pelo passesFilters()
function _syncHiddenSelects() {
    const prefix = _tabPrefix();
    const respEl = document.getElementById(`f${prefix}Responsavel`);
    const revEl  = document.getElementById(`f${prefix}Revisor`);
    if (respEl) {
        // Garante que o valor existe nas opções
        const val = fbarRespFilter ? fbarRespFilter.toLowerCase() : '';
        if (val && ![...respEl.options].some(o => o.value.toLowerCase() === val)) {
            const opt = document.createElement('option');
            opt.value = fbarRespFilter;
            opt.textContent = fbarRespFilter;
            respEl.appendChild(opt);
        }
        respEl.value = fbarRespFilter || '';
    }
    if (revEl) {
        const val = fbarRevFilter || '';
        if (val && ![...revEl.options].some(o => o.value === val)) {
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = val;
            revEl.appendChild(opt);
        }
        revEl.value = val;
    }
}

// ── PESQUISA POR TÍTULO ──────────────────────────────────────────────────────
function toggleFbarSearch() {
    const wrap = document.getElementById('fbarSearchWrap');
    const input = document.getElementById('titleSearchInput');
    if (!wrap) return;
    const opening = !wrap.classList.contains('open');
    wrap.classList.toggle('open', opening);
    const btn = document.getElementById('fbarSearchToggle');
    if (btn) btn.classList.toggle('active', opening);
    if (typeof setTitleSearchEnabled === 'function') {
        setTitleSearchEnabled('cards', opening);
    }
    if (opening && input) { setTimeout(() => input.focus(), 280); }
}

function clearFbarSearch() {
    const input = document.getElementById('titleSearchInput');
    if (input) { input.value = ''; onTitleSearchInput('cards'); }
}

// ── FILTROS AVANÇADOS (dropdown) ─────────────────────────────────────────────
function toggleFiltersDropdown() {
    const dd = document.getElementById('filtersDropdown');
    if (!dd) return;
    const open = dd.style.display === 'block';
    if (open) {
        dd.style.display = 'none';
    } else {
        _populateFbarAdv();
        dd.style.display = 'block';
    }
}

function _populateFbarAdv() {
    const prefix = _tabPrefix();
    _syncDropSelect('dropCat',      `f${prefix}Cat`,      'Categoria: Todas');
    _syncDropSelect('dropMarcador', `f${prefix}Marcador`, 'Marcador: Todos');
    _syncDropSelect('dropStatus',   `f${prefix}Status`,   'Status: Todos');

    // Status e "mostrar concluídos" — ocultos no kanban (colunas já representam status)
    const statusRow    = document.getElementById('fbarStatusRow');
    const finalizedRow = document.getElementById('fbarShowFinalizedRow');
    const isKanban = typeof isKanbanActive === 'function' && isKanbanActive();
    if (statusRow)    statusRow.style.display    = isKanban ? 'none' : '';
    if (finalizedRow) finalizedRow.style.display = isKanban ? 'none' : '';
    const cb  = document.getElementById('showFinalizedCheckbox');
    const cbv = document.getElementById('showFinalizedCheckboxVisible');
    if (cb && cbv) cbv.checked = cb.checked;

    // Indicador no botão
    const btn = document.getElementById('filtersToggleBtn');
    if (btn) {
        const hasAdv = (
            document.getElementById(`f${prefix}Cat`)?.value ||
            document.getElementById(`f${prefix}Marcador`)?.value ||
            (!isKanban && document.getElementById(`f${prefix}Status`)?.value)
        );
        btn.classList.toggle('has-filters', !!hasAdv);
    }
}

function _syncDropSelect(dropId, realId, placeholder) {
    const real = document.getElementById(realId);
    const drop = document.getElementById(dropId);
    if (!drop) return;
    if (real) {
        drop.innerHTML = real.innerHTML;
        if (!drop.querySelector('option[value=""]')) {
            drop.insertAdjacentHTML('afterbegin', `<option value="">${placeholder}</option>`);
        }
        try { drop.value = real.value; } catch(_) { drop.selectedIndex = 0; }
    } else {
        drop.innerHTML = `<option value="">${placeholder}</option>`;
    }
}

function onFbarAdvChange(type) {
    const prefix = _tabPrefix();
    const map = { categoria: `f${prefix}Cat`, marcador: `f${prefix}Marcador`, status: `f${prefix}Status` };
    const dropMap = { categoria: 'dropCat', marcador: 'dropMarcador', status: 'dropStatus' };
    const real = document.getElementById(map[type]);
    const drop = document.getElementById(dropMap[type]);
    if (real && drop) real.value = drop.value;
    _populateFbarAdv();
    saveFiltersToFirebase();
    renderCards();
}

function onFbarFinalizedChange() {
    const cbv = document.getElementById('showFinalizedCheckboxVisible');
    const cb  = document.getElementById('showFinalizedCheckbox');
    if (cb && cbv) cb.checked = cbv.checked;
    renderCards();
}

function closeFilters() {
    const dd = document.getElementById('filtersDropdown');
    if (dd) dd.style.display = 'none';
    const ddDash = document.getElementById('filtersDropdownDashboard');
    if (ddDash) ddDash.style.display = 'none';
    const ddDate = document.getElementById('fbarDateDropdown');
    if (ddDate) ddDate.style.display = 'none';
}

// ── FILTRO DE DATA (header — botão à esquerda do setor filter) ───────────────
function _renderFbarDateGroup() {
    const grp = document.getElementById('fbarDateGroup');
    if (!grp) return;
    const prefix = _tabPrefix();

    let html = `<select class="fbar-date-group" onchange="onFbarDateTypeChange(this.value)">
        <option value="all"   ${fbarDateMode==='all'   ?'selected':''}>Geral</option>
        <option value="year"  ${fbarDateMode==='year'  ?'selected':''}>Anual</option>
        <option value="month" ${fbarDateMode==='month' ?'selected':''}>Mensal</option>
        <option value="week"  ${fbarDateMode==='week'  ?'selected':''}>Semana Atual</option>
    </select>`;

    if (fbarDateMode === 'year') {
        const thisYear = new Date().getFullYear();
        const opts = [];
        for (let y = thisYear - 4; y <= thisYear + 1; y++) opts.push(y);
        html += `<select class="fbar-date-group" onchange="onFbarDateYearChange(this.value)">
            ${opts.map(y => `<option value="${y}" ${y===fbarDateYear?'selected':''}>${y}</option>`).join('')}
        </select>`;
    } else if (fbarDateMode === 'month') {
        const thisYear = new Date().getFullYear();
        const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
        const yOpts = [];
        for (let y = thisYear - 4; y <= thisYear + 1; y++) yOpts.push(y);
        html += `<select class="fbar-date-group" onchange="onFbarDateMonthChange(this.value)">
            ${months.map((m,i) => `<option value="${i}" ${i===fbarDateMonth?'selected':''}>${m}</option>`).join('')}
        </select>
        <select class="fbar-date-group" onchange="onFbarDateYearChange(this.value)">
            ${yOpts.map(y => `<option value="${y}" ${y===fbarDateYear?'selected':''}>${y}</option>`).join('')}
        </select>`;
    }

    grp.innerHTML = html;

    // Sincroniza com selects ocultos de data
    _syncDateHiddenSelects(prefix);
}

function onFbarDateTypeChange(val) {
    fbarDateMode = val;
    _renderFbarDateGroup();
    _syncDateHiddenSelects(_tabPrefix());
    renderCards();
}
function onFbarDateYearChange(val) {
    fbarDateYear = parseInt(val);
    _renderFbarDateGroup();
    _syncDateHiddenSelects(_tabPrefix());
    renderCards();
}
function onFbarDateMonthChange(val) {
    fbarDateMonth = parseInt(val);
    _renderFbarDateGroup();
    _syncDateHiddenSelects(_tabPrefix());
    renderCards();
}

function _syncDateHiddenSelects(prefix) {
    const dtEl = document.getElementById(`f${prefix}DateType`);
    if (!dtEl) return;

    if (fbarDateMode === 'all') {
        dtEl.value = 'all';
    } else if (fbarDateMode === 'year') {
        dtEl.value = 'year';
        const yEl = document.getElementById(`f${prefix}YearOnly`);
        if (yEl) {
            if (![...yEl.options].some(o => o.value == fbarDateYear)) {
                const opt = document.createElement('option');
                opt.value = fbarDateYear;
                opt.textContent = fbarDateYear;
                yEl.appendChild(opt);
            }
            yEl.value = fbarDateYear;
        }
    } else if (fbarDateMode === 'month') {
        dtEl.value = 'month';
        const mEl = document.getElementById(`f${prefix}Month`);
        const myEl = document.getElementById(`f${prefix}YearForMonth`);
        if (mEl) mEl.value = fbarDateMonth;
        if (myEl) {
            if (![...myEl.options].some(o => o.value == fbarDateYear)) {
                const opt = document.createElement('option');
                opt.value = fbarDateYear;
                opt.textContent = fbarDateYear;
                myEl.appendChild(opt);
            }
            myEl.value = fbarDateYear;
        }
    } else if (fbarDateMode === 'week') {
        // Usa filtro customizado com ini/fim da semana atual
        dtEl.value = 'custom';
        const now = new Date();
        const day = now.getDay(); // 0=dom
        const diffToMon = (day === 0) ? -6 : 1 - day;
        const mon = new Date(now);
        mon.setDate(now.getDate() + diffToMon);
        const sun = new Date(mon);
        sun.setDate(mon.getDate() + 6);
        const fmt = d => d.toISOString().slice(0,10);
        const iniEl = document.getElementById(`f${prefix}DataIni`);
        const fimEl = document.getElementById(`f${prefix}DataFim`);
        if (iniEl) iniEl.value = fmt(mon);
        if (fimEl) fimEl.value = fmt(sun);
    }
}

// ── BOTÃO DATA NO HEADER ─────────────────────────────────────────────────────
function openFbarDateDropdown() {
    const dd = document.getElementById('fbarDateDropdown');
    if (!dd) return;
    const open = dd.style.display === 'block';
    closeFilters();
    if (!open) {
        _buildFbarDateDropdown();
        dd.style.display = 'block';
    }
}

function _buildFbarDateDropdown() {
    const dd = document.getElementById('fbarDateDropdown');
    if (!dd) return;
    const thisYear = new Date().getFullYear();
    const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const yOpts = [];
    for (let y = thisYear - 4; y <= thisYear + 1; y++) yOpts.push(y);

    dd.innerHTML = `<div class="fbar-date-dd-inner">
        <div class="fbar-date-dd-modes">
            <button class="fbar-date-dd-mode ${fbarDateMode==='all'?'active':''}" onclick="setFbarDateMode('all')"><i class="fas fa-infinity"></i> Geral</button>
            <button class="fbar-date-dd-mode ${fbarDateMode==='year'?'active':''}" onclick="setFbarDateMode('year')"><i class="fas fa-calendar"></i> Anual</button>
            <button class="fbar-date-dd-mode ${fbarDateMode==='month'?'active':''}" onclick="setFbarDateMode('month')"><i class="fas fa-calendar-days"></i> Mensal</button>
            <button class="fbar-date-dd-mode ${fbarDateMode==='week'?'active':''}" onclick="setFbarDateMode('week')"><i class="fas fa-calendar-week"></i> Semana Atual</button>
        </div>
        ${fbarDateMode === 'month' ? `
        <div class="fbar-month-cal">
            <div class="fbar-month-cal-header">
                <button class="fbar-month-cal-nav" onclick="fbarDateYear--; _buildFbarDateDropdown();" title="Ano anterior"><i class="fas fa-chevron-left"></i></button>
                <span class="fbar-month-cal-year">${fbarDateYear}</span>
                <button class="fbar-month-cal-nav" onclick="fbarDateYear++; _buildFbarDateDropdown();" title="Próximo ano"><i class="fas fa-chevron-right"></i></button>
            </div>
            <div class="fbar-month-cal-grid">
                ${months.map((m,i) => `<button class="fbar-month-cal-cell${i===fbarDateMonth?' selected':''}" onclick="fbarDateMonth=${i}; _syncDateHiddenSelects(_tabPrefix()); _buildFbarDateDropdown(); _updateFbarDateBtn(); (currentTab==='dashboard'&&typeof renderDashboard==='function'?renderDashboard():renderCards());">${m.slice(0,3)}</button>`).join('')}
            </div>
        </div>` : ''}
        ${fbarDateMode === 'year' ? `
        <div class="fbar-date-dd-picker">
            <div class="fbar-date-dd-picker-row">
                <span class="fbar-adv-label">Ano</span>
                <select class="fbar-adv-select filter-input" onchange="fbarDateYear=parseInt(this.value); _syncDateHiddenSelects(_tabPrefix()); _buildFbarDateDropdown(); _updateFbarDateBtn(); (currentTab==='dashboard'&&typeof renderDashboard==='function'?renderDashboard():renderCards());">
                    ${yOpts.map(y => `<option value="${y}" ${y===fbarDateYear?'selected':''}>${y}</option>`).join('')}
                </select>
            </div>
        </div>` : ''}
    </div>`;
}

function setFbarDateMode(mode) {
    fbarDateMode = mode;
    _syncDateHiddenSelects(_tabPrefix());
    _buildFbarDateDropdown();
    _updateFbarDateBtn();
    if (typeof currentTab !== 'undefined' && currentTab === 'dashboard' && typeof renderDashboard === 'function') {
        renderDashboard();
    } else {
        renderCards();
    }
}

function _updateFbarDateBtn() {
    const btn   = document.getElementById('fbarDateBtn');
    const label = document.getElementById('fbarDateLabel');
    if (!btn || !label) return;
    const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const active = fbarDateMode !== 'all';
    btn.classList.toggle('active', active);
    if (fbarDateMode === 'all')   label.textContent = 'Data';
    if (fbarDateMode === 'year')  label.textContent = `${fbarDateYear}`;
    if (fbarDateMode === 'month') label.textContent = `${months[fbarDateMonth]}/${fbarDateYear}`;
    if (fbarDateMode === 'week')  label.textContent = 'Esta Semana';
}

// ── SYNC AO TROCAR DE ABA ────────────────────────────────────────────────────
function fbarOnTabSwitch() {
    // Reseta filtros de pessoas ao trocar de aba — exceto quando "Minhas Tarefas" está ativo
    if (!fbarMyTasksActive) {
        fbarRespFilter = '';
        fbarRevFilter  = '';
    }
    _updatePeopleBtnUI('responsavel');
    _updatePeopleBtnUI('revisor');
    // Sincroniza visibilidade e selects ocultos da aba atual
    _syncPeopleBtnsVisibility();
    if (typeof _syncHiddenSelects === 'function') _syncHiddenSelects();
    // Sincroniza data
    _syncDateHiddenSelects(_tabPrefix());
    _updateFbarDateBtn();
    // Sincroniza botões do dashboard
    if (typeof _updateDashPeopleBtnUI === 'function') {
        _updateDashPeopleBtnUI('responsavel');
        _updateDashPeopleBtnUI('revisor');
        _syncDashPeopleBtnsVisibility();
    }
    // Atualiza indicador filtros avançados
    _populateFbarAdv();
}

// ── INTEGRAÇÃO COM clearFilters() ───────────────────────────────────────────
// Patch do clearFilters original para também limpar os filtros do fbar
(function _patchClearFilters() {
    const _ready = () => {
        if (typeof clearFilters !== 'function') { setTimeout(_ready, 60); return; }
        const _orig = clearFilters;
        clearFilters = function() {
            _orig();
            fbarRespFilter = '';
            fbarRevFilter  = '';
            fbarDateMode   = 'all';
            _updatePeopleBtnUI('responsavel');
            _updatePeopleBtnUI('revisor');
            _updateFbarDateBtn();
            _syncPeopleBtnsVisibility();
            _syncDateHiddenSelects(_tabPrefix());
        };
    };
    _ready();
})();

// Patch do renderCards para injetar filtro "Minhas Tarefas" + pessoas via passesFilters
// O passesFilters() original já lê os selects ocultos (responsável/revisor)
// Apenas precisamos garantir que _syncHiddenSelects() seja chamado antes de renderCards
(function _patchRenderCards() {
    const _ready = () => {
        if (typeof renderCards !== 'function') { setTimeout(_ready, 60); return; }
        const _orig = renderCards;
        renderCards = function() {
            _syncHiddenSelects();
            _orig();
        };
    };
    _ready();
})();

// Hook no switchTab para sincronizar
(function _patchSwitchTab() {
    const _ready = () => {
        if (typeof switchTab !== 'function') { setTimeout(_ready, 60); return; }
        const _orig = switchTab;
        switchTab = function(tab) {
            _orig(tab);
            fbarOnTabSwitch();
        };
    };
    _ready();
})();

// Patch do passesFilters para incluir "Minhas Tarefas"
(function _patchPassesFilters() {
    const _ready = () => {
        if (typeof passesFilters !== 'function') { setTimeout(_ready, 60); return; }
        const _orig = passesFilters;
        passesFilters = function(prefix, item, excluded) {
            if (!_orig(prefix, item, excluded || {})) return false;
            if (!passesFbarMyTasks(item)) return false;
            return true;
        };
    };
    _ready();
})();

// ── DASHBOARD: MINHAS TAREFAS + FILTRO DE PESSOAS ───────────────────────────
var dashMyTasksActive = true;
var dashMyTasksMode   = 'responsavel';
var dashRespFilter    = '';
var dashRevFilter     = '';
var _peopleDashType   = 'responsavel';

function toggleMyTasksDash() {
    const dd = document.getElementById('fbarMyTasksDropdownDash');
    if (!dd) return;
    const open = dd.style.display === 'block';
    dd.style.display = open ? 'none' : 'block';
}

function setMyTasksModeDash(mode) {
    dashMyTasksMode = mode;
    const dd = document.getElementById('fbarMyTasksDropdownDash'); if (dd) dd.style.display = 'none';
    if (mode === 'responsavel') {
        dashMyTasksActive = true;
        dashRespFilter = '';
        dashRevFilter  = '';
    } else if (mode === 'revisor') {
        dashMyTasksActive = true;
        dashRevFilter  = '';
        dashRespFilter = '';
    } else {
        dashMyTasksActive = false;
        dashRespFilter = '';
        dashRevFilter  = '';
    }
    _updateDashPeopleBtnUI('responsavel');
    _updateDashPeopleBtnUI('revisor');
    _syncDashPeopleBtnsVisibility();
    _syncDashHiddenSelects();
    if (typeof renderDashboard === 'function') renderDashboard();
}

function openPeopleFilterDash(type) {
    _peopleDashType = type;
    // Reutiliza o modal de pessoas mas sobrescreve o contexto
    _peopleFilterType = type;
    _dashPeopleMode = true;
    const modal = document.getElementById('modalPeopleFilter');
    const title = document.getElementById('peopleFilterTitle');
    const icon  = document.getElementById('peopleFilterIcon');
    const search = document.getElementById('peopleFilterSearch');
    if (!modal) return;
    if (title) title.textContent = type === 'responsavel' ? 'Selecionar Responsável' : 'Selecionar Revisor';
    if (icon)  icon.innerHTML = type === 'responsavel' ? '<i class="fas fa-user"></i>' : '<i class="fas fa-user-check"></i>';
    if (search) search.value = '';
    _renderDashPeopleList();
    modal.style.display = 'flex';
}

var _dashPeopleMode = false;

function _renderDashPeopleList() {
    const list   = document.getElementById('peopleFilterList');
    const search = document.getElementById('peopleFilterSearch');
    if (!list) return;
    const query   = (search?.value || '').toLowerCase().trim();
    const type    = _peopleDashType;
    const current = type === 'responsavel' ? dashRespFilter : dashRevFilter;

    // Coleta nomes de todos os itens do dashboard
    let items = [
        ...(audits||[]).map(a => ({...a, _dtype:'audit'})),
        ...(activities||[]).map(a => ({...a, _dtype:'ativ'})),
        ...(maintenances||[]).map(m => ({...m, _dtype:'mant'})),
        ...(documents||[]).map(d => ({...d, _dtype:'doc'}))
    ].filter(i => !i.deleted);

    const validUsers = (users || []).filter(u => u.id && u.name);
    const resolvedNames = new Set();
    items.forEach(item => {
        const raw = type === 'responsavel'
            ? (item.responsavelTecnico || item.responsavel || '')
            : (item.revisor || '');
        if (!raw) return;
        try {
            const arr = JSON.parse(raw);
            (Array.isArray(arr) ? arr : [arr]).forEach(val => {
                const vs = String(val).trim();
                const byId = validUsers.find(u => u.id === vs);
                if (byId) { resolvedNames.add(byId.name); return; }
                const byName = validUsers.find(u => u.name.toLowerCase() === vs.toLowerCase());
                if (byName) resolvedNames.add(byName.name);
            });
        } catch (_) {
            const vs = String(raw).trim();
            const byId = validUsers.find(u => u.id === vs);
            if (byId) { resolvedNames.add(byId.name); return; }
            const byName = validUsers.find(u => u.name.toLowerCase() === vs.toLowerCase());
            if (byName) resolvedNames.add(byName.name);
        }
    });

    let realNames = [...resolvedNames].sort((a,b) => a.localeCompare(b));
    const filtered = query ? realNames.filter(n => n.toLowerCase().includes(query)) : realNames;

    if (!filtered.length) {
        list.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:24px;font-size:13px;">Nenhum resultado encontrado</div>`;
        return;
    }
    list.innerHTML = filtered.map(name => {
        const sel = (name.toLowerCase() === current.toLowerCase()) && current !== '';
        return `<div class="people-filter-item ${sel?'selected':''}" onclick="selectPeopleFilterDash('${_escPeople(name)}')">
            <div class="people-filter-item-check"><i class="fas fa-check"></i></div>
            <div class="people-filter-item-info"><div class="people-filter-item-name">${_escHtmlF(name)}</div></div>
        </div>`;
    }).join('');
}

function selectPeopleFilterDash(name) {
    const type = _peopleDashType;
    if (type === 'responsavel') {
        dashRespFilter = (dashRespFilter.toLowerCase() === name.toLowerCase()) ? '' : name;
    } else {
        dashRevFilter = (dashRevFilter.toLowerCase() === name.toLowerCase()) ? '' : name;
    }
    _updateDashPeopleBtnUI(type);
    _renderDashPeopleList();
    _syncDashHiddenSelects();
    const modal = document.getElementById('modalPeopleFilter');
    if (modal) modal.style.display = 'none';
    _dashPeopleMode = false;
    if (typeof renderDashboard === 'function') renderDashboard();
}

function _updateDashPeopleBtnUI(type) {
    if (type === 'responsavel') {
        const btn   = document.getElementById('fbarRespBtnDash');
        const label = document.getElementById('fbarRespLabelDash');
        const badge = document.getElementById('fbarRespBadgeDash');
        const active = !!dashRespFilter;
        if (btn) btn.classList.toggle('active', active);
        if (label) label.textContent = active ? dashRespFilter : 'Filtrar por Responsável';
        if (badge) { badge.style.display = active ? 'inline-flex' : 'none'; if (active) badge.textContent = '1'; }
    } else {
        const btn   = document.getElementById('fbarRevBtnDash');
        const label = document.getElementById('fbarRevLabelDash');
        const badge = document.getElementById('fbarRevBadgeDash');
        const active = !!dashRevFilter;
        if (btn) btn.classList.toggle('active', active);
        if (label) label.textContent = active ? dashRevFilter : 'Filtrar por Revisor';
        if (badge) { badge.style.display = active ? 'inline-flex' : 'none'; if (active) badge.textContent = '1'; }
    }
}

function _syncDashPeopleBtnsVisibility() {
    const rBtn = document.getElementById('fbarRespBtnDash');
    const vBtn = document.getElementById('fbarRevBtnDash');
    const hide = dashMyTasksActive;
    if (rBtn) rBtn.style.display = hide ? 'none' : 'inline-flex';
    if (vBtn) vBtn.style.display = hide ? 'none' : 'inline-flex';
}

function _syncDashHiddenSelects() {
    const respEl = document.getElementById('fDashResponsavel');
    const revEl  = document.getElementById('fDashRevisor');
    if (respEl) respEl.value = dashRespFilter || '';
    if (revEl)  revEl.value  = dashRevFilter  || '';
}


// ── UTILITÁRIOS ──────────────────────────────────────────────────────────────
function _escHtmlF(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _escPeople(s) {
    return String(s).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

// Fechar dropdowns ao clicar fora
document.addEventListener('click', function(e) {
    const dd = document.getElementById('filtersDropdown');
    const ddBtn = document.getElementById('filtersToggleBtn');
    const ddDate = document.getElementById('fbarDateDropdown');
    const ddDateBtn = document.getElementById('fbarDateBtn');
    const myDd = document.getElementById('fbarMyTasksDropdown');
    const myBtn = document.getElementById('fbarMyTasks');

    if (dd && dd.style.display === 'block') {
        if (!dd.contains(e.target) && e.target !== ddBtn && !ddBtn?.contains(e.target)) {
            dd.style.display = 'none';
        }
    }
    if (ddDate && ddDate.style.display === 'block') {
        if (!ddDate.contains(e.target) && e.target !== ddDateBtn && !ddDateBtn?.contains(e.target)) {
            ddDate.style.display = 'none';
        }
    }
    if (myDd && myDd.style.display === 'block') {
        if (!myDd.contains(e.target) && e.target !== myBtn && !myBtn?.contains(e.target)) {
            myDd.style.display = 'none';
        }
    }
});

// Inicialização
document.addEventListener('DOMContentLoaded', function() {
    // Estado inicial
    const myBtn = document.getElementById('fbarMyTasks');
    if (myBtn) myBtn.classList.toggle('active', fbarMyTasksActive);
    _syncPeopleBtnsVisibility();
    _updateFbarDateBtn();
});
