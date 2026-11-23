// ============================================================
// CALENDAR — Visualização de calendário (mensal/semanal)
// ============================================================

/* global masterLists, activities, audits, documents,
          currentuser, currentTab, openView, openPublicacaoModal,
          passesFilters, passesFbarMyTasks, normalizeText,
          getAllowedSetores, formatBR, saveAll, renderCards,
          userCanEditCards, verPublicacao */

// ── Estado ──────────────────────────────────────────────────
var calendarActiveByTab = {
    auditoria: false,
    atividades: false,
    documentos: false
};

var calViewMode   = 'monthly';
var calViewYear   = new Date().getFullYear();
var calViewMonth  = new Date().getMonth();
var calViewWeek   = _calGetWeekStart(new Date());

var calViewFilter = 'tarefas';  // 'tarefas' | 'publicacoes' | 'ambos'

// ── Módulos ─────────────────────────────────────────────────
var _CAL_MODULES = {
    auditoria:    { prefix: 'Audit', statusKey: 'auditStatus',  dateField: 'dataPrevisao',       getItems: () => (typeof audits     !== 'undefined' ? audits     : []) },
    atividades:   { prefix: 'Ativ',  statusKey: 'ativStatus',   dateField: 'dataConclusao',      getItems: () => (typeof activities !== 'undefined' ? activities : []) },
    documentos:   { prefix: 'Doc',   statusKey: 'docStatus',    dateField: 'dataProximaRevisao', getItems: () => (typeof documents  !== 'undefined' ? documents  : []) }
};

// ── Utils de data ────────────────────────────────────────────
function _calGetWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = (day === 0) ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0,0,0,0);
    return d;
}

function _calDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${dd}`;
}

function _calFmtDayMonth(d) {
    return d.toLocaleDateString('pt-BR', { day:'2-digit', month:'short' });
}

function _calFmtFullDate(d) {
    return d.toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
}

function _calToday() {
    const t = new Date();
    t.setHours(0,0,0,0);
    return t;
}

function _calTruncate(str, max) {
    if (!str) return '';
    return str.length > max ? str.slice(0, max) + '…' : str;
}

// ── Verifica se calendário está ativo nesta aba ──────────────
function isCalendarActive(tab) {
    tab = tab || (typeof currentTab !== 'undefined' ? currentTab : '');
    return !!(calendarActiveByTab[tab]);
}

// ── Alterna para aba Calendário ──────────────────────────────
function toggleCalendarView(mode) {
    if (!_CAL_MODULES[currentTab]) return;

    if (typeof kanbanActiveByTab !== 'undefined') {
        kanbanActiveByTab[currentTab] = false;
    }

    calendarActiveByTab[currentTab] = (mode === 'calendar');

    const grid    = document.getElementById('cardsGrid');
    const board   = document.getElementById('kanbanBoard');
    const calBoard= document.getElementById('calendarBoard');
    const addBtn  = document.getElementById('addBtn');
    const addColRow = document.getElementById('fbarAddcolRow');
    const canEdit = typeof userCanEditCards === 'function' ? userCanEditCards() : false;

    const calOn = isCalendarActive();

    if (calOn) {
        if (grid)  grid.style.display  = 'none';
        if (board) board.style.display = 'none';
        if (calBoard) calBoard.style.display = 'block';
        if (addBtn)    addBtn.style.display    = canEdit ? 'flex' : 'none';
        if (addColRow) addColRow.style.display = 'none';
        var _lsBarCal = document.getElementById('listSubtabsBar'); if (_lsBarCal) _lsBarCal.style.display = 'none';
        var _tvCal = document.getElementById('tableView'); if (_tvCal) _tvCal.style.display = 'none';
        var _gvCal = document.getElementById('groupsView'); if (_gvCal) _gvCal.style.display = 'none';
        var _svCal = document.getElementById('setoresView'); if (_svCal) _svCal.style.display = 'none';
        renderCalendar();
    } else {
        if (calBoard) calBoard.style.display = 'none';
        if (grid) grid.style.display = (typeof currentListSubtab === 'undefined' || currentListSubtab === 'cards') ? 'grid' : 'none';
        var _lsBarCalOff = document.getElementById('listSubtabsBar'); if (_lsBarCalOff) _lsBarCalOff.style.display = 'flex';
        if (addBtn) addBtn.style.display = canEdit ? 'flex' : 'none';
        if (typeof renderCards === 'function') renderCards();
    }

    _calUpdateToggleBtns();
    if (typeof _populateFbarAdv === 'function') _populateFbarAdv();
}

function _calUpdateToggleBtns() {
    const btnList   = document.getElementById('btnViewList');
    const btnKanban = document.getElementById('btnViewKanban');
    const btnCal    = document.getElementById('btnViewCalendar');
    const calOn     = isCalendarActive();
    const kbOn      = (typeof isKanbanActive === 'function') && isKanbanActive();

    if (btnList)   { btnList.classList.toggle('active', !calOn && !kbOn);  btnList.classList.toggle('inactive', calOn || kbOn); }
    if (btnKanban) { btnKanban.classList.toggle('active',  kbOn && !calOn); btnKanban.classList.toggle('inactive', !kbOn || calOn); }
    if (btnCal)    { btnCal.classList.toggle('active', calOn); btnCal.classList.toggle('inactive', !calOn); }
}

// ── Calcula próximas ocorrências de rotina a partir de uma base ─
function _calNextOccurrence(item, fromDate) {
    const rotina = item.rotina || 'pontual';
    if (rotina === 'pontual') return null;
    const freq = Number(item.frequencia) || 1;
    const base = new Date(fromDate);
    base.setHours(0,0,0,0);
    let next = new Date(base);

    if (rotina === 'anual') {
        next.setFullYear(next.getFullYear() + freq);
    } else if (rotina === 'mensal') {
        next.setMonth(next.getMonth() + freq);
    } else if (rotina === 'semanal') {
        next.setDate(next.getDate() + freq * 7);
    } else if (rotina === 'diario') {
        next.setDate(next.getDate() + freq);
    } else if (rotina === 'diasemana') {
        const days = Array.isArray(item.diasSemana) ? item.diasSemana : [];
        if (days.length === 0) return null;
        const tomorrow = new Date(base);
        tomorrow.setDate(tomorrow.getDate() + 1);
        for (let i = 0; i < 14; i++) {
            const d = new Date(tomorrow);
            d.setDate(tomorrow.getDate() + i);
            if (days.includes(d.getDay())) { next = d; break; }
        }
    }
    return next;
}

// ── Gera ocorrências de tarefa no range (apenas data da previsão/conclusão) ─
function _calGetTarefaOccurrences(item, dateField, rangeStart, rangeEnd) {
    const dateStr = item[dateField];
    if (!dateStr) return [];
    const d = new Date(dateStr + 'T00:00:00');
    if (d >= rangeStart && d <= rangeEnd) return [dateStr];
    return [];
}

// ── Avança data pela rotina/frequência ──────────────────────
function _calAdvanceByRotina(cur, rotina, freq) {
    const d = new Date(cur);
    if (rotina === 'anual')   d.setFullYear(d.getFullYear() + freq);
    else if (rotina === 'mensal')  d.setMonth(d.getMonth() + freq);
    else if (rotina === 'semanal') d.setDate(d.getDate() + freq * 7);
    else if (rotina === 'diario')  d.setDate(d.getDate() + freq);
    return d;
}

// ── Gera publicações previstas no range a partir do campo Previsão do card ─
function _calGetPubPrevistaOccurrences(item, tab, rangeStart, rangeEnd) {
    const rotina = item.rotina || 'pontual';
    if (rotina === 'pontual') return [];

    // Âncora = campo Previsão do card (dataPrevisao ou dataProximaRevisao)
    const anchor = tab === 'documentos' ? item.dataProximaRevisao : item.dataPrevisao;
    if (!anchor) return [];

    const freq    = Number(item.frequencia) || 1;
    const results = [];

    if (rotina === 'diasemana') {
        const days = Array.isArray(item.diasSemana) ? item.diasSemana : [];
        if (days.length === 0) return [];
        const d = new Date(rangeStart);
        while (d <= rangeEnd) {
            if (days.includes(d.getDay())) results.push(_calDateStr(d));
            d.setDate(d.getDate() + 1);
        }
        return results;
    }

    // Para rotinas periódicas: âncora é a próxima prevista; projeta para trás e para frente
    let cur = new Date(anchor + 'T00:00:00');

    // Recua até antes do rangeStart para capturar ocorrências que caem dentro do range
    let safety = 0;
    while (cur > rangeStart && safety < 500) {
        cur = _calAdvanceByRotina(cur, rotina, -freq);
        safety++;
    }
    // Avança até o range
    safety = 0;
    while (cur < rangeStart && safety < 500) {
        cur = _calAdvanceByRotina(cur, rotina, freq);
        safety++;
    }

    // Coleta ocorrências no range
    safety = 0;
    while (cur <= rangeEnd && safety < 500) {
        results.push(_calDateStr(cur));
        cur = _calAdvanceByRotina(cur, rotina, freq);
        safety++;
    }

    return results;
}

// ── Gera mapa dia → itens ────────────────────────────────────
function _calBuildDayMap(rangeStart, rangeEnd) {
    const tab = currentTab;
    const cfg = _CAL_MODULES[tab];
    if (!cfg) return {};

    let data = (cfg.getItems() || []).filter(i => !i.deleted);

    const allowedSetores = (typeof getAllowedSetores === 'function') ? getAllowedSetores() : null;
    if (allowedSetores !== null) data = data.filter(i => setorMatchesAny(i.setor, allowedSetores));

    const showFinalized = document.getElementById('showFinalizedCheckbox')?.checked !== false;

    data = data.filter(item => {
        // Respeita todos os filtros da aba (setor, categoria, status, responsável, revisor, marcador, título)
        // exceto o filtro de data, que o calendário gerencia por navegação
        if (typeof passesFilters === 'function' && !passesFilters(cfg.prefix, item, { date: true })) return false;
        if (typeof passesFbarMyTasks === 'function' && !passesFbarMyTasks(item)) return false;
        // Respeita o checkbox "Mostrar concluídos/cancelados"
        if (!showFinalized && typeof normalizeStatusName === 'function') {
            const s = normalizeStatusName(item.status || '');
            if (s === 'concluído' || s === 'cancelado') return false;
        }
        return true;
    });

    const map = {};

    // ── Tarefas: apenas no dia da previsão/conclusão ─────────
    if (calViewFilter !== 'publicacoes') {
        data.forEach(item => {
            const occurrences = _calGetTarefaOccurrences(item, cfg.dateField, rangeStart, rangeEnd);
            occurrences.forEach(ds => {
                if (!map[ds]) map[ds] = [];
                map[ds].push({ item, type: 'tarefa' });
            });
        });
    }

    // ── Publicações ──────────────────────────────────────────
    if (calViewFilter !== 'tarefas') {
        data.forEach(item => {
            // Publicações realizadas
            (item.publicacoes || []).forEach((pub, pubIdx) => {
                if (!pub.data) return;
                const d = new Date(pub.data + 'T00:00:00');
                if (d >= rangeStart && d <= rangeEnd) {
                    if (!map[pub.data]) map[pub.data] = [];
                    map[pub.data].push({ item, type: 'publicacao', pub, pubIdx, realizada: true });
                }
            });

            // Publicações previstas: âncora = campo Previsão do card, projeta pela rotina
            const previstas = _calGetPubPrevistaOccurrences(item, tab, rangeStart, rangeEnd);
            previstas.forEach(ds => {
                if (!map[ds]) map[ds] = [];
                const alreadyReal = (map[ds] || []).some(e => e.item.id === item.id && e.type === 'publicacao' && e.realizada && e.pub && e.pub.data === ds);
                if (!alreadyReal) {
                    map[ds].push({ item, type: 'publicacao', pub: null, pubIdx: null, realizada: false });
                }
            });
        });
    }

    return map;
}

// ── RENDER PRINCIPAL ─────────────────────────────────────────
function renderCalendar() {
    const board = document.getElementById('calendarBoard');
    if (!board) return;
    if (!_CAL_MODULES[currentTab]) { board.innerHTML = ''; return; }

    board.innerHTML = '';
    board.appendChild(_calBuildHeader());

    const grade = document.createElement('div');
    grade.id = 'calendarGrade';
    board.appendChild(grade);

    _calRenderGrade();
}

function _calRenderGrade() {
    const grade = document.getElementById('calendarGrade');
    if (!grade) return;
    if (calViewMode === 'monthly') _calRenderMonthly(grade);
    else _calRenderWeekly(grade);
}

// ── Header ───────────────────────────────────────────────────
function _calBuildHeader() {
    const wrap = document.createElement('div');
    wrap.className = 'cal-header';

    const navArea = document.createElement('div');
    navArea.className = 'cal-nav-area';

    const btnPrev = document.createElement('button');
    btnPrev.className = 'cal-nav-btn';
    btnPrev.innerHTML = '<i class="fas fa-chevron-left"></i>';
    btnPrev.onclick = () => _calNavigate(-1);

    const btnNext = document.createElement('button');
    btnNext.className = 'cal-nav-btn';
    btnNext.innerHTML = '<i class="fas fa-chevron-right"></i>';
    btnNext.onclick = () => _calNavigate(1);

    const btnToday = document.createElement('button');
    btnToday.className = 'cal-today-btn';
    btnToday.textContent = 'Hoje';
    btnToday.onclick = _calGoToday;

    const title = document.createElement('span');
    title.className = 'cal-nav-title';
    title.id = 'calNavTitle';
    title.textContent = _calGetNavTitle();

    navArea.appendChild(btnPrev);
    navArea.appendChild(btnToday);
    navArea.appendChild(title);
    navArea.appendChild(btnNext);

    const ctrlArea = document.createElement('div');
    ctrlArea.className = 'cal-ctrl-area';
    ctrlArea.appendChild(_calBuildViewFilter());
    ctrlArea.appendChild(_calBuildModeToggle());

    wrap.appendChild(navArea);
    wrap.appendChild(ctrlArea);
    return wrap;
}

function _calGetNavTitle() {
    const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    if (calViewMode === 'monthly') return `${months[calViewMonth]} ${calViewYear}`;
    const end = new Date(calViewWeek);
    end.setDate(end.getDate() + 6);
    const sm = months[calViewWeek.getMonth()];
    const em = months[end.getMonth()];
    if (sm === em) return `${calViewWeek.getDate()} – ${end.getDate()} de ${sm} ${end.getFullYear()}`;
    return `${calViewWeek.getDate()} ${sm} – ${end.getDate()} ${em} ${end.getFullYear()}`;
}

function _calBuildViewFilter() {
    const wrap = document.createElement('div');
    wrap.className = 'cal-viewfilter-wrap';
    wrap.style.position = 'relative';

    const btn = document.createElement('button');
    btn.className = 'fbar-mytasks-btn' + (calViewFilter !== 'ambos' ? ' active' : '');
    btn.id = 'calViewFilterBtn';
    btn.innerHTML = `<i class="fas fa-eye"></i> <span id="calViewFilterLabel">${_calViewFilterLabel()}</span> <i class="fas fa-caret-down" style="margin-left:6px;font-size:12px;"></i>`;
    btn.onclick = () => {
        const dd = document.getElementById('calViewFilterDropdown');
        if (dd) dd.style.display = dd.style.display === 'block' ? 'none' : 'block';
    };

    const dd = document.createElement('div');
    dd.className = 'filters-dropdown fbar-adv-dropdown';
    dd.id = 'calViewFilterDropdown';
    dd.style.cssText = 'display:none; position:absolute; z-index:60; min-width:200px;';

    const opts = [
        { val: 'tarefas',     label: 'Tarefas',     desc: 'Visualiza as tarefas na agenda' },
        { val: 'publicacoes', label: 'Publicações',  desc: 'Visualiza as publicações na agenda' },
        { val: 'ambos',       label: 'Ambos',        desc: 'Tarefas e publicações' }
    ];

    const inner = document.createElement('div');
    inner.style.cssText = 'padding:8px; display:flex; flex-direction:column; gap:4px;';
    opts.forEach(o => {
        const optBtn = document.createElement('button');
        optBtn.className = 'cal-viewfilter-opt' + (calViewFilter === o.val ? ' active' : '');
        optBtn.dataset.val = o.val;
        optBtn.innerHTML = `<span class="cal-vf-label">${o.label}</span><span class="cal-vf-desc">${o.desc}</span>`;
        optBtn.onclick = () => _calSetViewFilter(o.val);
        inner.appendChild(optBtn);
    });

    dd.appendChild(inner);
    wrap.appendChild(btn);
    wrap.appendChild(dd);
    return wrap;
}

function _calViewFilterLabel() {
    return { tarefas: 'Tarefas', publicacoes: 'Publicações', ambos: 'Ambos' }[calViewFilter] || 'Visualização';
}

function _calSetViewFilter(val) {
    calViewFilter = val;
    const dd = document.getElementById('calViewFilterDropdown');
    if (dd) dd.style.display = 'none';
    renderCalendar();
}

function _calBuildModeToggle() {
    const wrap = document.createElement('div');
    wrap.className = 'view-module-tabs cal-mode-toggle';

    const btnMonth = document.createElement('button');
    btnMonth.className = 'view-module-tab' + (calViewMode === 'monthly' ? ' active' : '');
    btnMonth.innerHTML = '<i class="fas fa-calendar-alt"></i> Mensal';
    btnMonth.onclick = () => _calSetMode('monthly');

    const btnWeek = document.createElement('button');
    btnWeek.className = 'view-module-tab' + (calViewMode === 'weekly' ? ' active' : '');
    btnWeek.innerHTML = '<i class="fas fa-calendar-week"></i> Semanal';
    btnWeek.onclick = () => _calSetMode('weekly');

    wrap.appendChild(btnMonth);
    wrap.appendChild(btnWeek);
    return wrap;
}

function _calSetMode(mode) {
    calViewMode = mode;
    renderCalendar();
}

function _calNavigate(dir) {
    if (calViewMode === 'monthly') {
        calViewMonth += dir;
        if (calViewMonth < 0)  { calViewMonth = 11; calViewYear--; }
        if (calViewMonth > 11) { calViewMonth = 0;  calViewYear++; }
    } else {
        const d = new Date(calViewWeek);
        d.setDate(d.getDate() + dir * 7);
        calViewWeek = d;
    }
    const titleEl = document.getElementById('calNavTitle');
    if (titleEl) titleEl.textContent = _calGetNavTitle();
    _calRenderGrade();
}

function _calGoToday() {
    const now = new Date();
    calViewYear  = now.getFullYear();
    calViewMonth = now.getMonth();
    calViewWeek  = _calGetWeekStart(now);
    renderCalendar();
}

// ── Renderização Mensal ──────────────────────────────────────
function _calRenderMonthly(container) {
    const monthStart = new Date(calViewYear, calViewMonth, 1);
    const monthEnd   = new Date(calViewYear, calViewMonth + 1, 0);

    let startDow = monthStart.getDay();
    startDow = (startDow === 0) ? 6 : startDow - 1;

    const daysInMonth = monthEnd.getDate();
    const totalCells  = startDow + daysInMonth;
    const trailing    = (totalCells % 7 === 0) ? 0 : 7 - (totalCells % 7);

    // Grade completa: inclui dias do mês anterior/posterior que preenchem as semanas
    const rangeStart = new Date(calViewYear, calViewMonth, 1 - startDow);
    const rangeEnd   = new Date(calViewYear, calViewMonth, daysInMonth + trailing);

    const map = _calBuildDayMap(rangeStart, rangeEnd);
    const today = _calToday();
    const canEdit = typeof userCanEditCards === 'function' ? userCanEditCards() : false;

    const grid = document.createElement('div');
    grid.className = 'cal-monthly-grid';

    const weekDays = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
    weekDays.forEach(d => {
        const th = document.createElement('div');
        th.className = 'cal-weekday-header';
        th.textContent = d;
        grid.appendChild(th);
    });

    const totalGridCells = startDow + daysInMonth + trailing;
    for (let i = 0; i < totalGridCells; i++) {
        const dateObj = new Date(calViewYear, calViewMonth, 1 - startDow + i);
        const dateStr = _calDateStr(dateObj);
        const isToday = (dateObj.getTime() === today.getTime());
        const isOther = (dateObj.getMonth() !== calViewMonth || dateObj.getFullYear() !== calViewYear);
        const entries = _calSortEntriesByStatus(map[dateStr] || []);

        const cell = document.createElement('div');
        cell.className = 'cal-day-cell'
            + (isToday ? ' cal-day-today' : '')
            + (isOther ? ' cal-day-other-month' : '');
        cell.dataset.date = dateStr;

        // Drag-over para tarefas
        if (canEdit) {
            cell.addEventListener('dragover', (e) => { e.preventDefault(); cell.classList.add('cal-drag-over'); });
            cell.addEventListener('dragleave', () => cell.classList.remove('cal-drag-over'));
            cell.addEventListener('drop', (e) => {
                e.preventDefault();
                cell.classList.remove('cal-drag-over');
                _calHandleDrop(e, dateStr);
            });
        }

        const dayNum = document.createElement('span');
        dayNum.className = 'cal-day-num';
        dayNum.textContent = dateObj.getDate();
        cell.appendChild(dayNum);

        if (entries.length > 0) {
            const evtsWrap = document.createElement('div');
            evtsWrap.className = 'cal-events-wrap';

            const maxShow = 8;
            const shown = entries.slice(0, maxShow);
            shown.forEach(e => evtsWrap.appendChild(_calRenderEventChip(e, canEdit)));
            if (entries.length > maxShow) {
                const more = document.createElement('button');
                more.className = 'cal-more-btn';
                more.textContent = `+${entries.length - maxShow} mais`;
                more.onclick = (ev) => { ev.stopPropagation(); _calOpenDayModal(dateStr, entries); };
                evtsWrap.appendChild(more);
            }
            cell.appendChild(evtsWrap);
        }

        if (entries.length > 0) {
            cell.onclick = () => _calOpenDayModal(dateStr, entries);
            cell.style.cursor = 'pointer';
        }

        grid.appendChild(cell);
    }

    container.innerHTML = '';
    container.appendChild(grid);
}

// ── Renderização Semanal ─────────────────────────────────────
function _calRenderWeekly(container) {
    const rangeStart = new Date(calViewWeek);
    const rangeEnd   = new Date(calViewWeek);
    rangeEnd.setDate(rangeEnd.getDate() + 6);

    const map = _calBuildDayMap(rangeStart, rangeEnd);
    const today = _calToday();
    const weekDayNames = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
    const canEdit = typeof userCanEditCards === 'function' ? userCanEditCards() : false;

    const grid = document.createElement('div');
    grid.className = 'cal-weekly-grid';

    for (let i = 0; i < 7; i++) {
        const dateObj = new Date(calViewWeek);
        dateObj.setDate(dateObj.getDate() + i);
        const dateStr = _calDateStr(dateObj);
        const isToday = (dateObj.getTime() === today.getTime());
        const entries = _calSortEntriesByStatus(map[dateStr] || []);

        const col = document.createElement('div');
        col.className = 'cal-week-col' + (isToday ? ' cal-week-col-today' : '');
        col.dataset.date = dateStr;

        if (canEdit) {
            col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('cal-drag-over'); });
            col.addEventListener('dragleave', () => col.classList.remove('cal-drag-over'));
            col.addEventListener('drop', (e) => {
                e.preventDefault();
                col.classList.remove('cal-drag-over');
                _calHandleDrop(e, dateStr);
            });
        }

        const colHeader = document.createElement('div');
        colHeader.className = 'cal-week-col-header';
        colHeader.innerHTML = `<span class="cal-wk-dayname">${weekDayNames[i]}</span><span class="cal-wk-daynum${isToday ? ' cal-wk-today-num' : ''}">${dateObj.getDate()}</span>`;
        col.appendChild(colHeader);

        const evtsWrap = document.createElement('div');
        evtsWrap.className = 'cal-week-events';

        if (entries.length === 0) {
            evtsWrap.appendChild(document.createElement('div')).className = 'cal-week-empty';
        } else {
            entries.forEach(e => evtsWrap.appendChild(_calRenderEventCard(e, canEdit)));
        }

        col.appendChild(evtsWrap);
        grid.appendChild(col);
    }

    container.innerHTML = '';
    container.appendChild(grid);

    initCalWeekMobileSwipe();
}

// ── Chip de evento (mensal) ──────────────────────────────────
function _calRenderEventChip(entry, canEdit) {
    const { item, type, pub, pubIdx, realizada } = entry;
    const chip = document.createElement('button');
    chip.className = 'cal-event-chip';

    const statusColor = _calGetStatusColor(item);
    chip.style.setProperty('--evt-color', statusColor);

    // Trunca título para caber no chip mensal (18 chars)
    const titulo = _calTruncate(item.titulo, 18);

    if (type === 'publicacao') {
        chip.classList.add(realizada ? 'cal-evt-pub-done' : 'cal-evt-pub-pending');
        const icon = realizada ? 'check-circle' : 'clock';
        const pubLabel = realizada && pub ? (pub.tipo || 'Publicação') : 'Previsto';
        const dateInfo = realizada && pub ? ` · ${pub.hora || ''}` : '';
        const nRnc = realizada && pub && Array.isArray(pub.rncIds) ? pub.rncIds.length : 0;
        const rncBadge = nRnc > 0 ? `<span class="cal-evt-rnc-badge" title="${nRnc} RNC gerada(s) nesta publicação"><i class="fas fa-triangle-exclamation"></i> ${nRnc}</span>` : '';
        chip.innerHTML = `<i class="fas fa-${icon}"></i> ${_calEsc(titulo)}${rncBadge}`;
        chip.title = `${pubLabel}${dateInfo} — ${item.titulo}${nRnc > 0 ? ` (${nRnc} RNC associada${nRnc > 1 ? 's' : ''})` : ''}`;
        chip.onclick = (e) => { e.stopPropagation(); _calOpenPubEntry(item, pub, pubIdx); };
    } else {
        chip.classList.add('cal-evt-tarefa');
        chip.innerHTML = `<span class="cal-evt-dot" style="background:${statusColor}"></span>${_calEsc(titulo)}`;
        chip.title = item.titulo;
        // Drag para mover tarefas
        if (canEdit) {
            chip.draggable = true;
            chip.addEventListener('dragstart', (e) => {
                e.stopPropagation();
                e.dataTransfer.setData('text/plain', JSON.stringify({ itemId: item.id, tab: currentTab }));
                chip.classList.add('cal-dragging');
                _calAttachEdgeDrag();
            });
            chip.addEventListener('dragend', () => { chip.classList.remove('cal-dragging'); _calDetachEdgeDrag(); });
        }
        chip.onclick = (e) => { e.stopPropagation(); _calOpenItem(item); };
    }

    return chip;
}

// ── Card de evento (semanal) ──────────────────────────────────
function _calRenderEventCard(entry, canEdit) {
    const { item, type, pub, pubIdx, realizada } = entry;
    const card = document.createElement('button');
    card.className = 'cal-event-card';

    const statusColor = _calGetStatusColor(item);
    card.style.setProperty('--evt-color', statusColor);

    const statusName = item.status || '';
    const _rawResp = item.responsavelTecnico || item.responsavel || '';
    var _respNames = [];
    if (_rawResp) {
        var _respIds;
        try { var _rp = JSON.parse(String(_rawResp)); _respIds = Array.isArray(_rp) ? _rp.map(String) : [String(_rp)]; }
        catch { _respIds = [String(_rawResp)]; }
        _respNames = _respIds.map(id => (typeof resolveUserId === 'function' ? resolveUserId(id) : null) || id).filter(Boolean);
    }
    const resp = _respNames.length > 1
        ? `${_respNames[0]} +${_respNames.length - 1}`
        : (_respNames[0] || '');

    if (type === 'publicacao') {
        card.classList.add(realizada ? 'cal-evt-pub-done' : 'cal-evt-pub-pending');
        const pubTipo = realizada && pub ? (pub.tipo || 'Publicação') : 'Previsto';
        const pubDesc = realizada && pub ? _calTruncate(pub.descricao || '', 40) : 'Publicação prevista pela rotina';
        const pubDate = realizada && pub ? `<div class="cal-ecard-resp"><i class="fas fa-calendar" style="font-size:10px;"></i> ${pub.data || ''} ${pub.hora || ''}</div>` : '';
        const _pubUsrName = (realizada && pub && pub.usuario) ? ((typeof resolveUserId === 'function' ? resolveUserId(pub.usuario) : null) || pub.usuario) : '';
        const pubUser = _pubUsrName ? `<div class="cal-ecard-resp"><i class="fas fa-user" style="font-size:10px;"></i> ${_calEsc(_pubUsrName)}</div>` : '';
        const nRnc = realizada && pub && Array.isArray(pub.rncIds) ? pub.rncIds.length : 0;
        const rncBadge = nRnc > 0 ? `<span class="cal-evt-rnc-badge" title="${nRnc} RNC gerada(s) nesta publicação"><i class="fas fa-triangle-exclamation"></i> ${nRnc} RNC</span>` : '';
        card.innerHTML = `
            <div class="cal-ecard-top">
                <i class="fas fa-${realizada ? 'check-circle' : 'clock'}" style="color:${realizada ? 'var(--c-green)' : 'var(--c-orange)'}"></i>
                <span class="cal-ecard-type">${_calEsc(pubTipo)}</span>
                ${rncBadge}
            </div>
            <div class="cal-ecard-title">${_calEsc(item.titulo)}</div>
            ${pubDesc ? `<div class="cal-ecard-desc">${_calEsc(pubDesc)}</div>` : ''}
            ${pubDate}${pubUser}
            ${resp ? `<div class="cal-ecard-resp"><i class="fas fa-user" style="font-size:10px;"></i> ${_calEsc(resp)}</div>` : ''}`;
        card.onclick = () => _calOpenPubEntry(item, pub, pubIdx);
    } else {
        card.classList.add('cal-evt-tarefa');
        const setor = item.setor ? `<div class="cal-ecard-resp"><i class="fas fa-building" style="font-size:10px;"></i> ${_calEsc((typeof setorText === 'function' ? setorText(item.setor) : item.setor))}</div>` : '';
        card.innerHTML = `
            <div class="cal-ecard-top">
                <span class="cal-evt-dot" style="background:${statusColor}; flex-shrink:0;"></span>
                <span class="cal-ecard-status">${_calEsc(statusName)}</span>
            </div>
            <div class="cal-ecard-title">${_calEsc(item.titulo)}</div>
            ${resp ? `<div class="cal-ecard-resp"><i class="fas fa-user" style="font-size:10px;"></i> ${_calEsc(resp)}</div>` : ''}
            ${setor}`;
        if (canEdit) {
            card.draggable = true;
            card._calItemId  = item.id;
            card._calItemTab = typeof currentTab !== 'undefined' ? currentTab : null;
            card.addEventListener('dragstart', (e) => {
                e.stopPropagation();
                e.dataTransfer.setData('text/plain', JSON.stringify({ itemId: item.id, tab: currentTab }));
                card.classList.add('cal-dragging');
                _calAttachEdgeDrag();
            });
            card.addEventListener('dragend', () => { card.classList.remove('cal-dragging'); _calDetachEdgeDrag(); });
        }
        card.onclick = () => _calOpenItem(item);
    }

    return card;
}

function _calStatusOrderNames() {
    // Usa exatamente a ordem de colunas do Kanban (regulars por ordem salva → concluídos → cancelados)
    if (typeof _kbGetSortedStatuses === 'function' && typeof _kbGetConfig === 'function') {
        const cfg = _kbGetConfig(currentTab);
        if (cfg) return _kbGetSortedStatuses(cfg).map(s => s.name);
    }
    // Fallback: ordem crua da lista mestre
    const cfg = _CAL_MODULES[currentTab];
    return cfg && masterLists ? (masterLists[cfg.statusKey] || []).map(s => s.name) : [];
}

function _calSortEntriesByStatus(entries) {
    const order = _calStatusOrderNames();
    const rank = (it) => {
        if (!it || !it.status) return 9999;
        const idx = order.indexOf(it.status);
        return idx === -1 ? 9999 : idx;
    };
    return entries.slice().sort((a, b) => rank(a.item) - rank(b.item));
}

function _calGetStatusColor(item) {
    if (!masterLists || !item.status) return 'var(--c-default, #94a3b8)';
    const cfg = _CAL_MODULES[currentTab];
    if (!cfg) return 'var(--c-default, #94a3b8)';
    const list = masterLists[cfg.statusKey] || [];
    const s = list.find(s => s.name === item.status);
    if (!s) return 'var(--c-default, #94a3b8)';
    const colorMap = {
        blue: 'var(--c-blue)', green: 'var(--c-green)', red: 'var(--c-red)',
        orange: 'var(--c-orange)', yellow: 'var(--c-yellow)', purple: 'var(--c-purple)',
        default: 'var(--c-default, #94a3b8)'
    };
    return colorMap[s.color] || colorMap.default;
}

function _calEsc(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Abrir item / publicação ──────────────────────────────────
function _calOpenItem(item) {
    if (typeof openView === 'function') openView(item.id, currentTab);
}

function _calOpenPubEntry(item, pub, pubIdx) {
    if (!pub) {
        // Publicação prevista: abre diretamente o modal de Nova Publicação
        if (typeof openPublicacaoModal === 'function') {
            window._currentViewId  = item.id;
            window._currentViewTab = currentTab;
            openPublicacaoModal();
        } else if (typeof openView === 'function') {
            openView(item.id, currentTab);
            setTimeout(() => {
                const pubTabBtn = document.querySelector('.view-modal-tab[data-tab="publicacoes"], .view-modal-tab[onclick*="publicacoes"]');
                if (pubTabBtn) pubTabBtn.click();
                if (typeof openPublicacaoModal === 'function') openPublicacaoModal();
            }, 200);
        }
        return;
    }
    // Publicação realizada: abre diretamente o modal da publicação
    if (typeof verPublicacao === 'function' && pubIdx !== null && pubIdx !== undefined) {
        verPublicacao(item.id, currentTab, pubIdx);
    } else if (typeof openView === 'function') {
        openView(item.id, currentTab);
        setTimeout(() => {
            const pubTabBtn = document.querySelector('.view-modal-tab[data-tab="publicacoes"], .view-modal-tab[onclick*="publicacoes"]');
            if (pubTabBtn) pubTabBtn.click();
        }, 150);
    }
}

// ── Overlay de carregamento (mover card) ─────────────────────
function _calShowMoveLoading() {
    const board = document.getElementById('calendarBoard');
    if (!board) return;
    if (getComputedStyle(board).position === 'static') board.style.position = 'relative';
    let ov = document.getElementById('calMoveLoading');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'calMoveLoading';
        ov.className = 'cal-move-loading';
        ov.innerHTML = '<div class="cal-move-loading-box"><span class="cal-move-spinner"></span><span>Salvando...</span></div>';
        board.appendChild(ov);
    }
    ov.classList.add('is-visible');
}

function _calHideMoveLoading() {
    const ov = document.getElementById('calMoveLoading');
    if (ov) ov.classList.remove('is-visible');
}

// Aplica a nova data e aguarda a gravação no banco antes de re-renderizar.
// Bloqueia a tela inteira enquanto salva (overlay global), pra ninguém
// interagir com o site enquanto a mudança de data ainda não foi confirmada.
function _calApplyMove(item, cfg, targetDateStr) {
    const prev = item[cfg.dateField];
    item[cfg.dateField] = targetDateStr;

    _calRenderGrade();
    if (typeof renderCards === 'function') renderCards();

    let p;
    try {
        if (typeof window._saveAllWithLoading === 'function') {
            p = window._saveAllWithLoading('Salvando nova data...');
        } else {
            _calShowMoveLoading();
            p = (typeof saveAll === 'function') ? saveAll() : null;
        }
    } catch (err) {
        p = Promise.reject(err);
    }
    if (!p || typeof p.then !== 'function') p = Promise.resolve();

    return p.catch(err => {
        console.error('[calendar] falha ao mover card:', err);
        item[cfg.dateField] = prev;
        if (typeof showToast === 'function') showToast('Erro ao salvar a nova data', 'error');
    }).finally(() => {
        _calHideMoveLoading();
        _calRenderGrade();
        if (typeof renderCards === 'function') renderCards();
    });
}

// ── Drag & Drop ──────────────────────────────────────────────
function _calHandleDrop(e, targetDateStr) {
    let data;
    try { data = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; }
    if (!data || !data.itemId || !data.tab) return;

    const tab = data.tab;
    const cfg = _CAL_MODULES[tab];
    if (!cfg) return;

    const items = cfg.getItems();
    const item = items.find(i => i.id === data.itemId);
    if (!item) return;

    // Verifica permissão de editar cards (Todos ou Parcial — verificado via userCanEditCards que já trata parcial)
    if (typeof userCanEditCards === 'function' && !userCanEditCards(item)) return;

    // Atualiza a data do campo correto
    if (item[cfg.dateField] === targetDateStr) return;
    _calApplyMove(item, cfg, targetDateStr);
}

// ── Modal do dia ─────────────────────────────────────────────
function _calOpenDayModal(dateStr, entries) {
    let modal = document.getElementById('calDayModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'calDayModal';
        modal.className = 'cal-day-modal-overlay';
        modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
        document.body.appendChild(modal);
    }

    const d = new Date(dateStr + 'T00:00:00');
    const dateLabel = _calFmtFullDate(d);
    const canEdit = typeof userCanEditCards === 'function' ? userCanEditCards() : false;

    modal.innerHTML = `
        <div class="cal-day-modal">
            <div class="cal-day-modal-header">
                <span class="cal-day-modal-title">${dateLabel}</span>
                <button class="cal-day-modal-close" onclick="document.getElementById('calDayModal').style.display='none'">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="cal-day-modal-body" id="calDayModalBody"></div>
        </div>`;

    const body = modal.querySelector('#calDayModalBody');
    entries.forEach(e => body.appendChild(_calRenderEventCard(e, canEdit)));

    modal.style.display = 'flex';
}

// ── Fechar dropdowns ao clicar fora ──────────────────────────
document.addEventListener('click', function(e) {
    const vfDd = document.getElementById('calViewFilterDropdown');
    const vfBtn = document.getElementById('calViewFilterBtn');
    if (vfDd && vfDd.style.display === 'block') {
        if (!vfDd.contains(e.target) && e.target !== vfBtn && !vfBtn?.contains(e.target)) {
            vfDd.style.display = 'none';
        }
    }
});

// ============================================================
// CALENDÁRIO SEMANAL MOBILE — paginação por swipe (1 dia por vez)
// ============================================================

var _calMobile = {
    active: false,
    currentIdx: 0,
    touchStartX: 0,
    touchStartY: 0,
    dragging: false
};

function _calIsMobile() {
    return window.innerWidth <= 768;
}

function initCalWeekMobileSwipe() {
    const board = document.getElementById('calendarBoard');
    if (!board) return;

    if (calViewMode !== 'weekly') {
        _calDestroyMobileDots();
        return;
    }

    _calMobile.active = _calIsMobile();
    if (!_calMobile.active) {
        _calDestroyMobileDots();
        const grid = board.querySelector('.cal-weekly-grid');
        if (grid) grid.classList.remove('cal-weekly-mobile-paged');
        const cols = board.querySelectorAll('.cal-week-col');
        cols.forEach(c => { c.style.transform = ''; c.style.opacity = ''; c.classList.remove('cal-col-active','cal-col-left','cal-col-right'); });
        return;
    }

    const grid = board.querySelector('.cal-weekly-grid');
    if (!grid) return;
    grid.classList.add('cal-weekly-mobile-paged');

    const today = _calToday();
    const cols = Array.from(grid.querySelectorAll('.cal-week-col'));
    let startIdx = 0;
    cols.forEach((col, i) => {
        if (col.classList.contains('cal-week-col-today')) startIdx = i;
    });
    _calMobile.currentIdx = startIdx;
    _calMobileShowDay(startIdx, false, grid);
    _calBuildDayDots(cols.length, grid);
    _calTouchAttachCards();

    grid.removeEventListener('touchstart', _calTouchStart, { passive: false });
    grid.removeEventListener('touchmove',  _calTouchMove,  { passive: false });
    grid.removeEventListener('touchend',   _calTouchEnd);
    grid.addEventListener('touchstart', _calTouchStart, { passive: true });
    grid.addEventListener('touchmove',  _calTouchMove,  { passive: false });
    grid.addEventListener('touchend',   _calTouchEnd);
}

function _calMobileShowDay(idx, animate, grid) {
    if (!grid) grid = document.querySelector('#calendarBoard .cal-weekly-grid');
    if (!grid) return;
    const cols = Array.from(grid.querySelectorAll('.cal-week-col'));
    if (!cols.length) return;
    idx = Math.max(0, Math.min(idx, cols.length - 1));
    _calMobile.currentIdx = idx;

    cols.forEach((col, i) => {
        col.classList.remove('cal-col-active', 'cal-col-left', 'cal-col-right');
        if (animate) col.classList.add('cal-col-anim');
        else col.classList.remove('cal-col-anim');

        if (i === idx) col.classList.add('cal-col-active');
        else if (i < idx) col.classList.add('cal-col-left');
        else col.classList.add('cal-col-right');
    });

    _calUpdateDayDots(idx, cols.length);
}

var _calWeekDayNames = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];

function _calBuildDayDots(total, grid) {
    _calDestroyMobileDots();
    if (total <= 1) return;

    const dotsWrap = document.createElement('div');
    dotsWrap.className = 'cal-day-pills';
    dotsWrap.id = 'calMobileDots';

    for (let i = 0; i < total; i++) {
        const pill = document.createElement('button');
        pill.className = 'cal-day-pill' + (i === _calMobile.currentIdx ? ' cal-day-pill--active' : '');
        pill.textContent = _calWeekDayNames[i] || String(i + 1);
        pill.addEventListener('click', () => _calMobileShowDay(i, true));
        dotsWrap.appendChild(pill);
    }

    const board = document.getElementById('calendarBoard');
    if (board) board.appendChild(dotsWrap);
}

function _calUpdateDayDots(activeIdx, total) {
    const wrap = document.getElementById('calMobileDots');
    if (!wrap) return;
    const pills = wrap.querySelectorAll('.cal-day-pill');
    pills.forEach((p, i) => p.classList.toggle('cal-day-pill--active', i === activeIdx));
}

function _calDestroyMobileDots() {
    const el = document.getElementById('calMobileDots');
    if (el) el.remove();
}

function _calTouchStart(e) {
    if (!_calMobile.active) return;
    if (_calTouch.active || _calTouch.longPressTimer) return; // card drag tem prioridade
    const t = e.touches[0];
    _calMobile.touchStartX = t.clientX;
    _calMobile.touchStartY = t.clientY;
    _calMobile.dragging = false;
}

function _calTouchMove(e) {
    if (!_calMobile.active) return;
    if (_calTouch.active || _calTouch.longPressTimer) return;
    const t = e.touches[0];
    const dx = t.clientX - _calMobile.touchStartX;
    const dy = t.clientY - _calMobile.touchStartY;
    if (!_calMobile.dragging) {
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) {
            _calMobile.dragging = true;
        } else {
            return;
        }
    }
    e.preventDefault();

    const grid = document.querySelector('#calendarBoard .cal-weekly-grid');
    if (!grid) return;
    const cols = Array.from(grid.querySelectorAll('.cal-week-col'));
    const idx = _calMobile.currentIdx;

    cols.forEach((col, i) => {
        col.classList.remove('cal-col-anim');
        let base = (i - idx) * 100;
        col.style.transform = `translateX(calc(${base}% + ${dx}px))`;
        if (i === idx) {
            col.style.opacity = String(Math.max(0.6, 1 - Math.abs(dx) / 300));
        } else if ((i === idx - 1 && dx > 0) || (i === idx + 1 && dx < 0)) {
            col.style.opacity = String(Math.min(1, Math.abs(dx) / 200));
        } else {
            col.style.opacity = '0';
        }
    });
}

function _calTouchEnd(e) {
    if (!_calMobile.active || !_calMobile.dragging) return;
    _calMobile.dragging = false;

    const grid = document.querySelector('#calendarBoard .cal-weekly-grid');
    if (!grid) return;
    const cols = Array.from(grid.querySelectorAll('.cal-week-col'));
    cols.forEach(c => { c.style.transform = ''; c.style.opacity = ''; });

    const dx = e.changedTouches[0].clientX - _calMobile.touchStartX;
    const threshold = 60;
    let next = _calMobile.currentIdx;
    if (dx < -threshold) next = Math.min(_calMobile.currentIdx + 1, cols.length - 1);
    else if (dx > threshold) next = Math.max(_calMobile.currentIdx - 1, 0);

    _calMobileShowDay(next, true);
}

window.addEventListener('resize', function() {
    if (typeof calViewMode !== 'undefined' && calViewMode === 'weekly') {
        const wasMobile = _calMobile.active;
        const isMobile = _calIsMobile();
        if (wasMobile !== isMobile) {
            initCalWeekMobileSwipe();
        }
    }
});

// ── Edge-scroll durante drag no calendário semanal mobile ────
var _calEdgeTimer = null;
var _calEdgeDir   = 0;

function _calClearEdgeTimer() {
    if (_calEdgeTimer) { clearTimeout(_calEdgeTimer); _calEdgeTimer = null; }
    _calEdgeDir = 0;
    document.querySelectorAll('.cal-edge-indicator').forEach(el => el.remove());
}

function _calEdgeCheck(clientX) {
    if (!_calMobile.active) return;
    const grid = document.querySelector('#calendarBoard .cal-weekly-grid');
    if (!grid) return;
    const rect = grid.getBoundingClientRect();
    const zone = rect.width * 0.15;
    let dir = 0;
    if (clientX < rect.left + zone) dir = -1;
    else if (clientX > rect.right - zone) dir = 1;

    if (dir === 0) { _calClearEdgeTimer(); return; }
    if (dir === _calEdgeDir) return;

    _calClearEdgeTimer();
    _calEdgeDir = dir;
    _calShowEdgeIndicator(dir, grid);
    _calEdgeTimer = setTimeout(() => {
        const cols = grid.querySelectorAll('.cal-week-col');
        const next = _calMobile.currentIdx + dir;
        if (next >= 0 && next < cols.length) {
            _calMobileShowDay(next, true, grid);
        }
        _calClearEdgeTimer();
    }, 1000);
}

function _calShowEdgeIndicator(dir, grid) {
    document.querySelectorAll('.cal-edge-indicator').forEach(el => el.remove());
    const ind = document.createElement('div');
    ind.className = 'cal-edge-indicator kb-edge-indicator kb-edge-indicator--' + (dir < 0 ? 'left' : 'right');
    grid.style.position = 'relative';
    grid.appendChild(ind);
}

function _calAttachEdgeDrag() {
    const board = document.getElementById('calendarBoard');
    if (!board) return;
    board._calEdgeDragHandler = (e) => _calEdgeCheck(e.clientX);
    board.addEventListener('dragover', board._calEdgeDragHandler);
}

function _calDetachEdgeDrag() {
    _calClearEdgeTimer();
    const board = document.getElementById('calendarBoard');
    if (board && board._calEdgeDragHandler) {
        board.removeEventListener('dragover', board._calEdgeDragHandler);
        board._calEdgeDragHandler = null;
    }
}

// ============================================================
// CALENDÁRIO SEMANAL MOBILE — long-press para mover card de dia
// ============================================================

var _calTouch = {
    longPressTimer: null,
    itemId: null,
    itemTab: null,
    cardEl: null,
    ghostEl: null,
    active: false,
    startX: 0,
    startY: 0,
    edgeTimer: null,
    edgeDir: 0
};

var CAL_LONG_PRESS_MS = 500;
var CAL_EDGE_ZONE     = 0.18;
var CAL_EDGE_DELAY_MS = 1000;

function _calTouchAttachCards() {
    const grid = document.querySelector('#calendarBoard .cal-weekly-grid');
    if (!grid) return;
    grid.querySelectorAll('.cal-event-card').forEach(card => {
        card.removeEventListener('touchstart',  _calCardTouchStart);
        card.removeEventListener('touchmove',   _calCardTouchMove);
        card.removeEventListener('touchend',    _calCardTouchEnd);
        card.removeEventListener('touchcancel', _calCardTouchCancel);
        if (!card.draggable) return;
        card.addEventListener('touchstart',  _calCardTouchStart,  { passive: false });
        card.addEventListener('touchmove',   _calCardTouchMove,   { passive: false });
        card.addEventListener('touchend',    _calCardTouchEnd,    { passive: false });
        card.addEventListener('touchcancel', _calCardTouchCancel, { passive: true  });
    });
}

function _calCardTouchStart(e) {
    if (!_calMobile.active) return;
    if (e.touches.length !== 1) return;
    const card = e.currentTarget;
    const t = e.touches[0];
    _calTouch.startX   = t.clientX;
    _calTouch.startY   = t.clientY;
    _calTouch.cardEl   = card;
    _calTouch.active   = false;

    // Recupera itemId e tab a partir do listener de dragstart já existente
    // clonando o evento artificialmente — usamos dataset se disponível
    _calTouch.itemId  = card._calItemId  || null;
    _calTouch.itemTab = card._calItemTab || null;

    _calTouch.longPressTimer = setTimeout(() => {
        _calActivateDrag(card, t.clientX, t.clientY);
    }, CAL_LONG_PRESS_MS);
}

function _calCardTouchMove(e) {
    if (!_calTouch.cardEl) return;
    const t = e.touches[0];
    if (!_calTouch.active) {
        const dx = Math.abs(t.clientX - _calTouch.startX);
        const dy = Math.abs(t.clientY - _calTouch.startY);
        if (dx > 8 || dy > 8) _calCancelTouchDrag();
        return;
    }
    e.preventDefault();
    e.stopPropagation();
    _calMoveGhost(t.clientX, t.clientY);
    _calTouchEdgeCheck(t.clientX);
}

function _calCardTouchEnd(e) {
    if (!_calTouch.active) { _calCancelTouchDrag(); return; }
    e.preventDefault();
    e.stopPropagation();
    _calTouchDrop();
    _calCancelTouchDrag();
}

function _calCardTouchCancel() { _calCancelTouchDrag(); }

function _calActivateDrag(card, cx, cy) {
    _calTouch.active = true;
    if (navigator.vibrate) navigator.vibrate(40);
    card.classList.add('kb-touch-holding');

    const ghost = document.createElement('div');
    ghost.className = 'kb-touch-ghost';
    ghost.innerHTML = card.innerHTML;
    ghost.style.width = card.offsetWidth + 'px';
    document.body.appendChild(ghost);
    _calTouch.ghostEl = ghost;
    _calMoveGhost(cx, cy);
}

function _calMoveGhost(cx, cy) {
    const g = _calTouch.ghostEl;
    if (!g) return;
    g.style.left = (cx - g.offsetWidth / 2) + 'px';
    g.style.top  = (cy - 30) + 'px';
}

function _calTouchEdgeCheck(cx) {
    const grid = document.querySelector('#calendarBoard .cal-weekly-grid');
    if (!grid) return;
    const rect = grid.getBoundingClientRect();
    const zone = rect.width * CAL_EDGE_ZONE;
    let dir = 0;
    if (cx < rect.left + zone) dir = -1;
    else if (cx > rect.right - zone) dir = 1;

    if (dir === 0) { _calTouchClearEdge(); return; }
    if (dir === _calTouch.edgeDir) return;

    _calTouchClearEdge();
    _calTouch.edgeDir = dir;
    _calTouch.edgeTimer = setTimeout(() => {
        const cols = grid.querySelectorAll('.cal-week-col');
        const next = _calMobile.currentIdx + dir;
        if (next >= 0 && next < cols.length) {
            _calMobileShowDay(next, true, grid);
            _calTouchAttachCards();
            if (navigator.vibrate) navigator.vibrate(20);
        }
        _calTouch.edgeDir = 0;
        _calTouch.edgeTimer = null;
    }, CAL_EDGE_DELAY_MS);
}

function _calTouchClearEdge() {
    if (_calTouch.edgeTimer) { clearTimeout(_calTouch.edgeTimer); _calTouch.edgeTimer = null; }
    _calTouch.edgeDir = 0;
}

function _calTouchDrop() {
    const grid = document.querySelector('#calendarBoard .cal-weekly-grid');
    if (!grid) return;
    const activeCol = grid.querySelector('.cal-week-col.cal-col-active');
    if (!activeCol) return;
    const targetDateStr = activeCol.dataset.date;
    if (!targetDateStr) return;

    // Recupera item pelo id e tab armazenados no card
    const itemId  = _calTouch.itemId;
    const itemTab = _calTouch.itemTab || (typeof currentTab !== 'undefined' ? currentTab : null);
    if (!itemId || !itemTab) return;

    const cfg = _CAL_MODULES[itemTab];
    if (!cfg) return;
    const item = cfg.getItems().find(i => i.id === itemId);
    if (!item) return;

    if (item[cfg.dateField] === targetDateStr) return;

    _calApplyMove(item, cfg, targetDateStr);
}

function _calCancelTouchDrag() {
    if (_calTouch.longPressTimer) { clearTimeout(_calTouch.longPressTimer); _calTouch.longPressTimer = null; }
    _calTouchClearEdge();
    if (_calTouch.cardEl) _calTouch.cardEl.classList.remove('kb-touch-holding');
    if (_calTouch.ghostEl) { _calTouch.ghostEl.remove(); _calTouch.ghostEl = null; }
    _calTouch.active  = false;
    _calTouch.itemId  = null;
    _calTouch.itemTab = null;
    _calTouch.cardEl  = null;
}
