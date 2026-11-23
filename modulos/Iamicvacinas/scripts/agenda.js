// ─── CALENDAR & KANBAN (from index.html lines ~3133-3967) ────────────────────

let _calView = 'mensal'; // 'mensal' | 'semanal'
let _weekStart = null; // Date do domingo da semana atual

const KANBAN_COLLAPSE_BTN_STYLE = 'background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);';
const KANBAN_COLLAPSE_BTN_ACTIVE_STYLE = 'background:rgba(0,0,0,0.3);border:1px solid rgba(0,0,0,0.4);';

function switchCalView(view) {
    _calView = view;
    const btnM = document.getElementById('btn-cal-mensal');
    const btnS = document.getElementById('btn-cal-semanal');
    const active   = 'px-3 h-8 rounded-lg text-xs font-black uppercase tracking-wider transition bg-navy-900 text-white shadow';
    const inactive = 'px-3 h-8 rounded-lg text-xs font-black uppercase tracking-wider transition text-slate-500 hover:bg-white';
    if (btnM) btnM.className = view === 'mensal' ? active : inactive;
    if (btnS) btnS.className = view === 'semanal' ? active : inactive;
    document.getElementById('cal-view-mensal').classList.toggle('hidden', view !== 'mensal');
    document.getElementById('cal-view-semanal').classList.toggle('hidden', view !== 'semanal');
    if (view === 'semanal') {
        if (!_weekStart) _weekStart = _getSundayOf(new Date());
        renderWeekly();
    } else {
        renderCalendar();
    }
}

function calNavPrev() { if (_calView === 'semanal') { _weekStart.setDate(_weekStart.getDate() - 7); renderWeekly(); } else { changeMonth(-1); } }
function calNavNext() { if (_calView === 'semanal') { _weekStart.setDate(_weekStart.getDate() + 7); renderWeekly(); } else { changeMonth(1); } }
function calGoToday() { if (_calView === 'semanal') { _weekStart = _getSundayOf(new Date()); renderWeekly(); } else { currentDate = new Date(); renderCalendar(); } }

// ─── Vendedor Popover (Agenda/Calendário) ────────────────────────────────
let _vendedorPopoverNamesCal = [];

function _populateCalVendedorList() {
    let inRange;
    if (_calView === 'semanal' && _weekStart) {
        const start = _weekStart.toISOString().split('T')[0];
        const end = new Date(new Date(start).setDate(new Date(start).getDate() + 6)).toISOString().split('T')[0];
        inRange = appointments.filter(a => a.data >= start && a.data <= end);
    } else {
        const year = currentDate.getFullYear();
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        inRange = appointments.filter(a => a.data.startsWith(`${year}-${month}`));
    }
    _vendedorPopoverNamesCal = [...new Set(inRange.filter(a => a.vendedor).map(a => a.vendedor))].sort();
    const curVendInput = document.getElementById('filter-vendedor-cal');
    const curVend = curVendInput ? curVendInput.value : '';
    if (curVend && curVend !== '__mine__' && !_vendedorPopoverNamesCal.includes(curVend)) {
        curVendInput.value = '';
        _updateVendedorBtnCal('');
    }
    _applyVendedorPopoverSearchCal();
}

function _applyVendedorPopoverSearchCal() {
    const searchInput = document.getElementById('vendedor-popover-search-cal');
    const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const list = document.getElementById('vendedor-popover-list-cal');
    if (!list) return;
    const curVend = document.getElementById('filter-vendedor-cal').value;
    const filtered = _vendedorPopoverNamesCal.filter(n => !query || n.toLowerCase().includes(query));
    if (!filtered.length) {
        list.innerHTML = '<p class="text-xs text-slate-400 text-center py-3">Nenhum vendedor encontrado</p>';
        return;
    }
    list.innerHTML = filtered.map(nome => {
        const active = curVend === nome;
        const initials = nome.trim().split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
        return `<button type="button" onclick="selectVendedorFilterCal('${nome.replace(/'/g, "\\'")}')"
            class="vendedor-pop-item w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition text-left ${active ? 'bg-clinic-50 text-clinic-700 font-semibold' : ''}">
            <span class="h-7 w-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white" style="background: linear-gradient(135deg,#6366f1,#8b5cf6);">${initials}</span>
            <span class="flex-1 truncate">${nome}</span>
            ${active ? '<i class="fas fa-check text-clinic-500 text-xs shrink-0"></i>' : ''}
        </button>`;
    }).join('');
}

function filterVendedorPopoverListCal() {
    _applyVendedorPopoverSearchCal();
}

function _updateVendedorBtnCal(val) {
    const btn = document.getElementById('btn-vendedor-popover-cal');
    const lbl = document.getElementById('btn-vendedor-label-cal');
    const mineBtn = document.getElementById('btn-vendedor-mine-cal');
    const todosBtn = document.getElementById('btn-vendedor-todos-cal');
    if (!lbl) return;
    const isActive = val !== '';
    if (val === '__mine__') {
        lbl.textContent = 'Minhas Vendas';
    } else if (val) {
        const short = val.split(' ')[0];
        lbl.textContent = short.length > 12 ? short.slice(0, 12) + '…' : short;
    } else {
        lbl.textContent = 'Vendedores';
    }
    if (btn) {
        btn.classList.toggle('border-clinic-300', isActive);
        btn.classList.toggle('bg-clinic-50', isActive);
        btn.classList.toggle('text-clinic-600', isActive);
    }
    if (mineBtn) mineBtn.classList.toggle('bg-indigo-50', val === '__mine__');
    if (todosBtn) {
        todosBtn.classList.toggle('bg-clinic-100', val === '');
        todosBtn.classList.toggle('bg-clinic-50', val !== '');
    }
}

function selectVendedorFilterCal(val) {
    document.getElementById('filter-vendedor-cal').value = val;
    _updateVendedorBtnCal(val);
    _applyVendedorPopoverSearchCal();
    _closeVendedorPopoverCal();
    if (_calView === 'semanal') renderWeekly(); else renderCalendar();
}

function _closeVendedorPopoverCal() {
    const pop = document.getElementById('vendedor-popover-cal');
    const chev = document.getElementById('btn-vendedor-chevron-cal');
    if (pop) pop.classList.add('hidden');
    if (chev) chev.style.transform = '';
    document.removeEventListener('click', _vendedorPopOutsideCal);
}

function _vendedorPopOutsideCal(e) {
    if (e.target.closest('#vendedor-popover-cal') || e.target.closest('#btn-vendedor-popover-cal')) return;
    _closeVendedorPopoverCal();
}

function toggleVendedorPopoverCal(e) {
    if (e) e.stopPropagation();
    const pop = document.getElementById('vendedor-popover-cal');
    const chev = document.getElementById('btn-vendedor-chevron-cal');
    const btn = document.getElementById('btn-vendedor-popover-cal');
    if (!pop) return;
    const isHidden = pop.classList.contains('hidden');
    _closeVendedorPopoverCal();
    if (isHidden) {
        const searchInput = document.getElementById('vendedor-popover-search-cal');
        if (searchInput) searchInput.value = '';
        _applyVendedorPopoverSearchCal();
        pop.classList.remove('hidden');
        const r = btn.getBoundingClientRect();
        pop.style.top = (r.bottom + 8) + 'px';
        const popW = pop.offsetWidth || 288;
        let left = r.left;
        if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
        if (left < 8) left = 8;
        pop.style.left = left + 'px';
        if (chev) chev.style.transform = 'rotate(180deg)';
        setTimeout(() => document.addEventListener('click', _vendedorPopOutsideCal), 10);
    }
}

function _getSundayOf(date) {
    const d = new Date(date); d.setHours(0,0,0,0);
    d.setDate(d.getDate() - d.getDay());
    return d;
}

function getFilterWeekStart() {
    const weekInput = document.getElementById('filter-week-start');
    if (weekInput && weekInput.value) {
        const date = new Date(weekInput.value + 'T00:00:00');
        return _getSundayOf(date);
    }
    return _getSundayOf(new Date());
}

function setFilterWeekStart(date) {
    const weekInput = document.getElementById('filter-week-start');
    if (!weekInput) return;
    const sunday = _getSundayOf(date);
    weekInput.value = sunday.toISOString().split('T')[0];
}

function formatFilterWeekLabel() {
    const start = getFilterWeekStart();
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const fmt = d => {
        const parts = d.toLocaleDateString('pt-BR', { day:'2-digit', month:'short' }).split(' de ');
        return parts.length === 2 ? `${parts[0]}/${parts[1]}` : parts.join('/');
    };
    return `${fmt(start)} – ${fmt(end)}`;
}

function adjustFilterWeek(delta) {
    const start = getFilterWeekStart();
    start.setDate(start.getDate() + delta * 7);
    setFilterWeekStart(start);
    if (typeof _syncDateFilterUI === 'function') _syncDateFilterUI();
    if (typeof renderTable === 'function') renderTable();
    if (typeof renderKanban === 'function') renderKanban();
}

function goToCurrentFilterWeek() {
    setFilterWeekStart(new Date());
    if (typeof _syncDateFilterUI === 'function') _syncDateFilterUI();
    if (typeof renderTable === 'function') renderTable();
    if (typeof renderKanban === 'function') renderKanban();
}

// ─── SEMANAL: TIMELINE (estilo Google Agenda) ────────────────────────────────
const WK_START_HOUR = 7;      // primeira hora exibida
const WK_END_HOUR   = 19;     // última hora exibida (exclusiva)
const WK_SLOT_MIN   = 30;     // granularidade de drop
const WK_SLOT_PX    = 28;     // altura de um slot de 30min
const WK_CARD_MIN   = 60;     // duração visual do card de grupo
const WK_CAPACITY   = { 0: 0, 1: 24, 2: 24, 3: 24, 4: 24, 5: 24, 6: 12 }; // vagas por dia da semana (0=dom)

const _wkPxPerMin = () => WK_SLOT_PX / WK_SLOT_MIN;
function _wkMinutes(hhmm) {
    if (!hhmm) return null;
    const m = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim());
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
}
function _wkHHMM(min) {
    const h = Math.floor(min / 60), m = min % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function _wkFmtDate(d) { return d.split('-').reverse().join('/'); }

// Horário representativo de um grupo (menor hora entre as vacinas)
function _wkGroupTime(apps) {
    const mins = apps.map(a => _wkMinutes(a.hora)).filter(v => v != null);
    return mins.length ? Math.min(...mins) : null;
}

// ─── Validações de movimentação (data + hora) ────────────────────────────────
// Retorna null se permitido, ou string com o motivo do bloqueio.
function _wkValidateMove(a, dateStr) {
    const pat = patients.find(p => String(p.id) === String(a.patientId));
    const v   = vaccines.find(x => String(x.id) === String(a.vaccineId));
    const vNome = v ? v.nome : 'vacina';

    // 1) Data válida
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || isNaN(new Date(dateStr + 'T00:00:00'))) {
        return 'Data de destino inválida.';
    }
    // 2) Dia sem expediente
    const dow = new Date(dateStr + 'T00:00:00').getDay();
    if (!WK_CAPACITY[dow]) {
        return `Bloqueado: ${_wkFmtDate(dateStr)} está fechado (sem expediente).`;
    }
    // 3) Data anterior ao nascimento do paciente
    if (pat && pat.dtNasc && dateStr < pat.dtNasc) {
        return `Bloqueado: ${_wkFmtDate(dateStr)} é anterior ao nascimento de ${pat.nome}.`;
    }
    // 4) Lote vencido na data destino
    if (a.loteId) {
        const lote = vaccineLots.find(l => String(l.id) === String(a.loteId));
        if (lote && lote.validade && new Date(lote.validade + 'T00:00:00') < new Date(dateStr + 'T00:00:00')) {
            return `Bloqueado: lote ${lote.numero} da ${vNome} vence em ${_wkFmtDate(lote.validade)} — anterior à data destino.`;
        }
    }
    // 5) Restrição de idade da vacina na nova data
    if (v && pat && pat.dtNasc) {
        const ageErr = _wkValidateAge(v, pat, a.doseAtual, dateStr);
        if (ageErr) return ageErr;
    }
    // 6) Aprazamento: intervalo mínimo desde a dose anterior. Antecipação de até
    //    VALIDADE_EXCEPCIONAL_DIAS é permitida (confirmada no modal de mover).
    const apr = _wkAprazamento(a);
    if (apr && diasAntecipacao(dateStr, apr.minIso) > VALIDADE_EXCEPCIONAL_DIAS) {
        return `Bloqueado: data mínima para ${a.doseAtual} de ${vNome} é ${_wkFmtDate(apr.minIso)} (${apr.intervalo} dias após a dose anterior de ${_wkFmtDate(apr.prevData)}; validade excepcional a partir de ${_wkFmtDate(addDiasIso(apr.minIso, -VALIDADE_EXCEPCIONAL_DIAS))}).`;
    }
    return null;
}

// Data de aprazamento recomendada (dose N ≥ 2) com base na dose anterior.
// Retorna { minIso, intervalo, prevData } ou null se não se aplica.
function _wkAprazamento(a) {
    if (!a.doseAtual || !a.doseAtual.includes('ª Dose') || a.doseAtual === '1ª Dose') return null;
    const v = vaccines.find(x => String(x.id) === String(a.vaccineId));
    if (!v) return null;
    const pat = patients.find(p => String(p.id) === String(a.patientId));
    const doseNum = Number((a.doseAtual.match(/(\d+)/) || [])[1] || 2);
    const esq  = (typeof getEsquemaPaciente === 'function') ? getEsquemaPaciente(v, pat ? pat.dtNasc : null) : null;
    const ints = (esq && esq.intervalos && esq.intervalos.length)
        ? esq.intervalos
        : (v.intervalos && v.intervalos.length ? v.intervalos : (v.intervaloDias > 0 ? [v.intervaloDias] : []));
    let intervalo = ints.length
        ? (ints[doseNum - 2] != null ? ints[doseNum - 2] : ints[ints.length - 1])
        : 0;
    if (!intervalo || intervalo <= 0) intervalo = 30;
    const prevApp = appointments.filter(x =>
        String(x.patientId) === String(a.patientId) &&
        String(x.vaccineId) === String(a.vaccineId) &&
        String(x.id) !== String(a.id) &&
        x.doseAtual === `${doseNum - 1}ª Dose`
    ).sort((x, y) => new Date(y.data) - new Date(x.data))[0];
    if (!prevApp) return null;
    return { minIso: addDiasIso(prevApp.data, intervalo), intervalo, prevData: prevApp.data };
}

// Idade do paciente na data destino vs. faixas etárias da vacina
function _wkValidateAge(v, pat, doseAtual, dateStr) {
    if (typeof getAgeInMonths !== 'function') return null;
    const ageInfo = getAgeInMonths(pat.dtNasc, dateStr);
    const totalMeses = ageInfo.years * 12 + ageInfo.months;
    const patStr = ageInfo.years > 0
        ? `${ageInfo.years} ano(s) e ${ageInfo.months} mês(es)`
        : `${ageInfo.months} mês(es)`;

    if (doseAtual === 'Dose Zero') {
        const minDZ = (v.doseZeroMinAnos || 0) * 12 + (v.doseZeroMinMeses || 0);
        if (totalMeses < minDZ) {
            return `Bloqueado: em ${_wkFmtDate(dateStr)} ${pat.nome} terá ${patStr}, abaixo da idade mínima da Dose Zero de ${v.nome}.`;
        }
        return null;
    }

    const meetsDZ = v.doseZero
        && totalMeses >= ((v.doseZeroMinAnos || 0) * 12 + (v.doseZeroMinMeses || 0));

    if (v.esquemas && v.esquemas.length) {
        const encaixa = v.esquemas.some(esq => {
            if (esq.minAnos == null) return true;
            const minTotal = (esq.minAnos || 0) * 12 + (esq.minMeses || 0);
            const hasMax = esq.maxAnos != null || esq.maxMeses != null;
            const maxTotal = hasMax ? ((esq.maxAnos || 0) * 12 + (esq.maxMeses || 0)) : Infinity;
            return totalMeses >= minTotal && totalMeses <= maxTotal;
        });
        if (!encaixa && !meetsDZ) {
            const faixas = v.esquemas.filter(e => e.minAnos != null)
                .map(e => (typeof formatFaixaEtaria === 'function' ? formatFaixaEtaria(e) : '')).filter(Boolean).join('; ');
            return `Bloqueado: em ${_wkFmtDate(dateStr)} ${pat.nome} terá ${patStr} e não se enquadra nas faixas etárias de ${v.nome}${faixas ? ` (${faixas})` : ''}.`;
        }
        return null;
    }

    const minAge = (v.idadeMinimaAnos || 0) * 12 + (v.idadeMinimaMeses || 0);
    if (totalMeses < minAge && !meetsDZ) {
        return `Bloqueado: em ${_wkFmtDate(dateStr)} ${pat.nome} terá ${patStr}, abaixo da idade mínima de ${v.nome}.`;
    }
    return null;
}

// Distribui grupos sobrepostos em colunas (lanes) dentro do dia
function _wkLayoutLanes(groups) {
    let cluster = [], clusterEnd = -1;
    const flush = () => {
        cluster.forEach(g => { g.lanes = cluster.length ? Math.max(...cluster.map(x => x.lane)) + 1 : 1; });
        cluster = [];
    };
    groups.forEach(g => {
        const start = g.min, end = g.min + WK_CARD_MIN;
        if (cluster.length && start >= clusterEnd) flush();
        const taken = new Set(cluster.filter(x => x.min + WK_CARD_MIN > start).map(x => x.lane));
        let lane = 0; while (taken.has(lane)) lane++;
        g.lane = lane;
        cluster.push(g);
        clusterEnd = Math.max(clusterEnd, end);
    });
    flush();
}

// Dia visível da semana no celular (0 = domingo). null = usa o dia de hoje.
let _wkMobileDay = null;

function setWeeklyMobileDay(i) {
    _wkMobileDay = i;
    renderWeekly();
}

function renderWeekly() {
    const board = document.getElementById('weekly-board');
    if (!board) return;
    _populateCalVendedorList();
    const _rawVendCal = document.getElementById('filter-vendedor-cal').value;
    const filterVendedorCal = _rawVendCal === '__mine__'
        ? (typeof currentUser !== 'undefined' && currentUser ? currentUser.nome : '')
        : _rawVendCal;
    const DAY_NAMES = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
    const _isDark = document.body.classList.contains('dark-mode');
    const C = _isDark
        ? { bg:'#0f172a', head:'#0f172a', line:'#1e293b', lineStrong:'#334155', text:'#e2e8f0', muted:'#64748b', gutter:'#0b1220', closed:'#111827' }
        : { bg:'#ffffff', head:'#ffffff', line:'#f1f5f9', lineStrong:'#e2e8f0', text:'#0f172a', muted:'#94a3b8', gutter:'#ffffff', closed:'#f8fafc' };
    const todayStr = new Date().toISOString().split('T')[0];

    const sunday = new Date(_weekStart);
    const saturday = new Date(_weekStart); saturday.setDate(saturday.getDate() + 6);
    const fmtLbl = d => {
        const parts = d.toLocaleDateString('pt-BR', { day:'2-digit', month:'short' }).split(' de ');
        return parts.length === 2 ? `${parts[0]}/${parts[1]}` : parts.join('/');
    };
    const lbl = document.getElementById('current-month-label');
    if (lbl) lbl.textContent = `${fmtLbl(sunday)} – ${fmtLbl(saturday)}`;

    const totalMin  = (WK_END_HOUR - WK_START_HOUR) * 60;
    const gridH     = totalMin * _wkPxPerMin();
    const slotCount = totalMin / WK_SLOT_MIN;

    // Dados por dia
    const days = Array.from({ length: 7 }, (_, i) => {
        const day = new Date(_weekStart); day.setDate(day.getDate() + i);
        const dateStr = day.toISOString().split('T')[0];
        const apps = appointments.filter(a => a.data === dateStr && a.status !== 'Perdido'
            && (!filterVendedorCal || a.vendedor === filterVendedorCal));
        const byPat = {};
        apps.forEach(a => { (byPat[a.patientId] = byPat[a.patientId] || []).push(a); });
        const groups = Object.entries(byPat).map(([patId, gApps]) => {
            gApps.sort((x, y) => (_wkMinutes(x.hora) ?? 1e9) - (_wkMinutes(y.hora) ?? 1e9));
            return { patId, apps: gApps, min: _wkGroupTime(gApps) };
        }).sort((g1, g2) => (g1.min ?? 1e9) - (g2.min ?? 1e9));
        _wkLayoutLanes(groups.filter(g => g.min != null));
        return { i, day, dateStr, apps, groups, isToday: dateStr === todayStr, closed: !WK_CAPACITY[day.getDay()] };
    });

    // ── Cabeçalho de um dia
    const headHtml = d => {
        const cap = WK_CAPACITY[d.day.getDay()];
        const used = d.groups.length;
        const over = cap && used > cap;
        const capLbl = d.closed ? 'Fechado' : `${used}/${cap} vagas`;
        const capColor = d.closed ? '#f43f5e' : over ? '#f59e0b' : C.muted;
        return `<div class="flex flex-col items-center justify-center py-2 rounded-xl ${d.isToday ? 'wk-today-head' : ''}"
            style="${d.isToday ? `background:${_isDark ? 'rgba(37,99,235,.16)' : '#eff6ff'};border:1px solid ${_isDark ? '#1d4ed8' : '#bfdbfe'};` : ''}">
            <span class="text-[9px] font-black uppercase tracking-widest" style="color:${d.closed ? '#fb7185' : d.isToday ? '#2563eb' : C.muted}">${DAY_NAMES[d.i]}</span>
            <span class="font-black text-xl leading-none mt-0.5" style="color:${d.closed ? '#f43f5e' : d.isToday ? '#2563eb' : C.text}">${d.day.getDate()}</span>
            <span class="text-[9px] font-black uppercase tracking-wider mt-0.5" style="color:${capColor}">${capLbl}</span>
        </div>`;
    };

    // ── Card de grupo posicionado na timeline
    const groupCardHtml = (d, g) => {
        const pat = getPatientById(g.patId);
        if (!pat) return '';
        const apps = g.apps;
        const hasDelayed = apps.some(a => a.status === 'Agendado' && a.data < todayStr);
        const hasSemLote = apps.some(a => a.status === 'Agendado' && !a.loteId);
        const dominant = apps.every(a => a.status === 'Aplicado') ? 'Aplicado'
            : apps.some(a => a.status === 'Agendado') ? 'Agendado'
            : apps.some(a => a.status === 'Em negociação') ? 'Em negociação'
            : apps.some(a => a.status === 'Nova oportunidade') ? 'Nova oportunidade'
            : apps[0].status;
        const accent = hasSemLote ? '#db2777'
            : hasDelayed ? '#f59e0b'
            : dominant === 'Aplicado' ? '#16a34a'
            : dominant === 'Agendado' ? '#2563eb'
            : dominant === 'Em negociação' ? '#0891b2'
            : '#64748b';
        const tint = _isDark ? 'rgba(148,163,184,.10)' : `${accent}14`;

        const startMin = Math.max(g.min, WK_START_HOUR * 60);
        const top = (startMin - WK_START_HOUR * 60) * _wkPxPerMin();
        const height = Math.max(WK_SLOT_PX, Math.min(WK_CARD_MIN * _wkPxPerMin(), gridH - top));
        const endMin = Math.min(startMin + WK_CARD_MIN, WK_END_HOUR * 60);
        const ageInfo = pat.dtNasc && typeof getAgeInMonths === 'function' ? getAgeInMonths(pat.dtNasc, d.dateStr) : null;
        const ageLbl = ageInfo ? (ageInfo.years >= 1 ? `${ageInfo.years} ano${ageInfo.years > 1 ? 's' : ''}` : `${ageInfo.months} m`) : '';
        const sub = `${apps.length} vacina${apps.length > 1 ? 's' : ''}${ageLbl ? ' · ' + ageLbl : ''}`;

        const lanes = g.lanes || 1, lane = g.lane || 0;
        const widthPct = 100 / lanes;
        return `<div class="wk-event absolute rounded-lg overflow-hidden cursor-grab select-none"
            draggable="true"
            ondragstart="weeklyGroupDragStart(event,'${d.dateStr}','${g.patId}')"
            ondragend="weeklyDragEnd(event)"
            ondragover="weeklyDragOver(event)" ondragleave="weeklyDragLeave(event)"
            ondrop="weeklyDrop(event,'${d.dateStr}','${_wkHHMM(startMin)}')"
            onclick="openWeeklyGroup('${d.dateStr}','${g.patId}')"
            title="${String(pat.nome).replace(/"/g, '&quot;')} — ${_wkHHMM(startMin)}${hasSemLote ? ' — Sem lote reservado' : ''}"
            style="top:${top}px;height:${height}px;left:calc(${lane * widthPct}% + 2px);width:calc(${widthPct}% - 4px);background:${tint};border-left:3px solid ${accent};box-shadow:0 1px 2px rgba(15,23,42,.08);">
            <button class="wk-add wk-add-on-event" title="Adicionar vacina a ${String(pat.nome).replace(/"/g, '&quot;')} às ${_wkHHMM(startMin)}"
                onclick="event.stopPropagation();addVacinaToWeeklyGroup('${d.dateStr}','${g.patId}','${_wkHHMM(startMin)}','${String(apps.find(a => a.vendedor)?.vendedor || '').replace(/'/g, "\\'")}')"
                style="color:${accent};"><i class="fas fa-plus"></i></button>
            <div class="px-1.5 py-1 h-full flex flex-col justify-center min-w-0">
                <p class="text-[9px] font-black leading-none truncate" style="color:${accent}">
                    ${_wkHHMM(startMin)} – ${_wkHHMM(endMin)}${hasDelayed ? ' <i class="fas fa-exclamation-triangle"></i>' : ''}
                </p>
                <p class="text-[10px] font-black leading-tight truncate mt-0.5" style="color:${C.text}">${pat.nome}</p>
                <p class="text-[9px] leading-none truncate" style="color:${C.muted}">${sub}</p>
                ${hasSemLote ? `<span title="Sem lote reservado" class="text-[8px] font-black px-1 py-0.5 rounded-full mt-0.5 self-start inline-flex items-center gap-0.5 shrink-0"
                    style="color:${_isDark ? '#f9a8d4' : '#9d174d'};background:${_isDark ? '#3b0a25' : '#fce7f3'};border:1px solid ${_isDark ? '#831843' : '#fbcfe8'}"><i class="fas fa-exclamation-triangle"></i> Sem lote</span>` : ''}
            </div>
        </div>`;
    };

    // ── Faixa "sem horário" (all-day)
    const noTimeHtml = d => {
        const gs = d.groups.filter(g => g.min == null);
        if (!gs.length) return '';
        return gs.map(g => {
            const pat = getPatientById(g.patId);
            if (!pat) return '';
            const semLote = g.apps.some(a => a.status === 'Agendado' && !a.loteId);
            return `<div class="rounded-md px-1.5 py-1 mb-1 cursor-grab select-none"
                draggable="true"
                ondragstart="weeklyGroupDragStart(event,'${d.dateStr}','${g.patId}')"
                ondragend="weeklyDragEnd(event)"
                onclick="openWeeklyGroup('${d.dateStr}','${g.patId}')"
                title="${String(pat.nome).replace(/"/g, '&quot;')}${semLote ? ' — Sem lote reservado' : ''}"
                style="background:${semLote ? (_isDark ? '#3b0a25' : '#fdf2f8') : (_isDark ? '#1e293b' : '#f1f5f9')};border-left:3px solid ${semLote ? '#db2777' : '#94a3b8'};">
                <p class="text-[10px] font-black truncate" style="color:${C.text}">${pat.nome}</p>
                <p class="text-[8px] truncate" style="color:${C.muted}">${g.apps.length} vacina(s) · sem horário</p>
                ${semLote ? `<span title="Sem lote reservado" class="text-[8px] font-black px-1 py-0.5 rounded-full mt-0.5 inline-flex items-center gap-0.5"
                    style="color:${_isDark ? '#f9a8d4' : '#9d174d'};background:${_isDark ? '#3b0a25' : '#fce7f3'};border:1px solid ${_isDark ? '#831843' : '#fbcfe8'}"><i class="fas fa-exclamation-triangle"></i> Sem lote</span>` : ''}
            </div>`;
        }).join('');
    };

    const hoursCol = Array.from({ length: WK_END_HOUR - WK_START_HOUR }, (_, h) =>
        `<div class="relative" style="height:${60 * _wkPxPerMin()}px;">
            <span class="absolute -top-1.5 right-1.5 text-[9px] font-bold" style="color:${C.muted}">${String(WK_START_HOUR + h).padStart(2,'0')}:00</span>
        </div>`).join('');

    const gridLines = Array.from({ length: slotCount }, (_, s) =>
        `<div style="height:${WK_SLOT_PX}px;border-bottom:1px ${s % 2 === 1 ? 'solid' : 'dashed'} ${s % 2 === 1 ? C.lineStrong : C.line};"></div>`).join('');

    const dropZones = d => d.closed ? '' : Array.from({ length: slotCount }, (_, s) => {
        const min = WK_START_HOUR * 60 + s * WK_SLOT_MIN;
        return `<div class="wk-slot absolute left-0 right-0 flex items-center justify-center" style="top:${s * WK_SLOT_PX}px;height:${WK_SLOT_PX}px;"
            ondragover="weeklyDragOver(event)" ondragleave="weeklyDragLeave(event)"
            ondrop="weeklyDrop(event,'${d.dateStr}','${_wkHHMM(min)}')"
            ondblclick="weeklySlotDblClick('${d.dateStr}','${_wkHHMM(min)}')">
            <button class="wk-add" onclick="event.stopPropagation();weeklySlotDblClick('${d.dateStr}','${_wkHHMM(min)}')"
                title="Agendar às ${_wkHHMM(min)}"><i class="fas fa-plus"></i></button>
        </div>`;
    }).join('');

    // Linha "agora"
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const showNow = nowMin >= WK_START_HOUR * 60 && nowMin <= WK_END_HOUR * 60;
    const nowTop = (nowMin - WK_START_HOUR * 60) * _wkPxPerMin();

    // No celular a semana inteira não cabe: mostramos um dia por vez, escolhido
    // na faixa de chips acima do quadro (_wkMobileDay).
    const _wkMob = typeof isMobileView === 'function' && isMobileView();
    if (_wkMob && (_wkMobileDay === null || _wkMobileDay < 0 || _wkMobileDay > 6)) _wkMobileDay = new Date().getDay();
    const visDays = _wkMob ? [days[_wkMobileDay]] : days;
    const gridCols = `56px repeat(${visDays.length},minmax(0,1fr))`;
    const dayChips = _wkMob ? `<div class="m-wk-days">${days.map(d => `
        <button type="button" class="m-wk-day m-compact ${d.i === _wkMobileDay ? 'active' : ''}" onclick="setWeeklyMobileDay(${d.i})">
            <span>${DAY_NAMES[d.i]}</span>
            <span class="m-wk-num">${d.day.getDate()}</span>
        </button>`).join('')}</div>` : '';

    board.innerHTML = `
    ${dayChips}
    <div class="wk-wrap flex flex-col w-full rounded-2xl border overflow-hidden" style="border-color:${C.lineStrong};background:${C.bg};">
        <div class="wk-head grid shrink-0" style="grid-template-columns:${gridCols};background:${C.head};border-bottom:1px solid ${C.lineStrong};">
            <div></div>
            ${visDays.map(d => `<div class="px-1 py-1">${headHtml(d)}</div>`).join('')}
        </div>
        <div class="wk-allday grid shrink-0" style="grid-template-columns:${gridCols};border-bottom:1px solid ${C.lineStrong};background:${_isDark ? '#0b1220' : '#fcfcfd'};">
            <div class="flex items-start justify-end pr-1.5 pt-1.5">
                <span class="text-[8px] font-black uppercase tracking-wider" style="color:${C.muted}">Sem hora</span>
            </div>
            ${visDays.map(d => `<div class="p-1 min-h-[34px]" style="border-left:1px solid ${C.line};"
                ondragover="${d.closed ? '' : 'weeklyDragOver(event)'}" ondragleave="weeklyDragLeave(event)"
                ondrop="${d.closed ? '' : `weeklyDrop(event,'${d.dateStr}','')`}">${noTimeHtml(d)}</div>`).join('')}
        </div>
        <div class="wk-scroll flex-1 overflow-y-auto">
            <div class="grid relative" style="grid-template-columns:${gridCols};">
                <div class="relative" style="height:${gridH}px;background:${C.gutter};">${hoursCol}</div>
                ${visDays.map(d => `<div class="relative" style="height:${gridH}px;border-left:1px solid ${C.line};${d.closed ? `background:repeating-linear-gradient(45deg,${C.closed},${C.closed} 6px,transparent 6px,transparent 12px);` : ''}">
                    <div class="absolute inset-0">${gridLines}</div>
                    ${dropZones(d)}
                    ${d.groups.filter(g => g.min != null).map(g => groupCardHtml(d, g)).join('')}
                    ${d.isToday && showNow ? `<div class="absolute left-0 right-0 pointer-events-none" style="top:${nowTop}px;border-top:2px solid #ef4444;">
                        <span class="absolute -left-1 -top-1 h-2 w-2 rounded-full" style="background:#ef4444;"></span>
                    </div>` : ''}
                </div>`).join('')}
            </div>
        </div>
    </div>`;

    const _setWeeklyHeight = () => {
        const rect = board.getBoundingClientRect();
        // No celular a barra inferior de navegação ocupa o rodapé da tela
        const bottomGap = _wkMob ? 92 : 16;
        if (rect.top > 0) board.style.height = `${window.innerHeight - rect.top - bottomGap}px`;
        const wrap = board.querySelector('.wk-wrap');
        if (wrap) wrap.style.height = '100%';
    };
    _setWeeklyHeight();
    window._weeklyResizeHandler && window.removeEventListener('resize', window._weeklyResizeHandler);
    window._weeklyResizeHandler = _setWeeklyHeight;
    window.addEventListener('resize', window._weeklyResizeHandler);

    // Rola até a primeira ocorrência (ou hora atual)
    const scroller = board.querySelector('.wk-scroll');
    if (scroller) {
        const firstMin = Math.min(...days.flatMap(d => d.groups.map(g => g.min).filter(v => v != null)), showNow ? nowMin : Infinity);
        if (isFinite(firstMin)) {
            scroller.scrollTop = Math.max(0, (firstMin - WK_START_HOUR * 60) * _wkPxPerMin() - WK_SLOT_PX * 2);
        }
    }
}

// ─── Drag & Drop semanal ─────────────────────────────────────────────────────
let _weeklyDragId = null;      // arrasto de vacina individual (painel do grupo)
let _weeklyDragGroup = null;   // { dateStr, patId } arrasto do grupo inteiro

function weeklyDragStart(e, id) {
    _weeklyDragId = id; _weeklyDragGroup = null;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(id));
    e.currentTarget.style.opacity = '0.5';
    e.stopPropagation();
    // O painel do grupo cobre a grade — fecha (após iniciar o drag) para permitir soltar em outro horário
    setTimeout(closeWeeklyGroup, 0);
}
function weeklyGroupDragStart(e, dateStr, patId) {
    _weeklyDragGroup = { dateStr, patId }; _weeklyDragId = null;
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.style.opacity = '0.5';
}
function weeklyDragEnd(e) {
    e.currentTarget.style.opacity = '';
    document.querySelectorAll('.wk-slot,.wk-allday > div').forEach(c => c.style.background = '');
}
function weeklyDragOver(e) {
    e.preventDefault();
    e.currentTarget.style.background = 'rgba(37,99,235,.18)';
}
function weeklyDragLeave(e) { e.currentTarget.style.background = ''; }

let _weeklyPendingDrop = null; // { ids:[], targetDate, targetHora, label }

function weeklyDrop(e, dateStr, hora) {
    e.preventDefault(); e.stopPropagation();
    e.currentTarget.style.background = '';

    let movingApps = [];
    let label = '';
    if (_weeklyDragGroup) {
        const { dateStr: fromDate, patId } = _weeklyDragGroup;
        movingApps = appointments.filter(a => a.data === fromDate && String(a.patientId) === String(patId) && a.status !== 'Perdido');
        const pat = patients.find(p => String(p.id) === String(patId));
        label = pat ? `${pat.nome} · ${movingApps.length} vacina(s)` : '';
    } else if (_weeklyDragId) {
        const a = appointments.find(x => String(x.id) === String(_weeklyDragId));
        if (a) {
            movingApps = [a];
            const pat = patients.find(p => String(p.id) === String(a.patientId));
            const vac = vaccines.find(v => String(v.id) === String(a.vaccineId));
            label = `${pat ? pat.nome : ''} · ${vac ? vac.nome : ''} ${a.doseAtual || ''}`;
        }
    }
    _weeklyDragGroup = null; _weeklyDragId = null;
    if (!movingApps.length) return;

    const fromDate = movingApps[0].data;
    const fromHora = movingApps[0].hora || '';
    if (fromDate === dateStr && (fromHora || '') === (hora || '')) return;

    // Capacidade do dia destino (contada por atendimento/paciente)
    if (fromDate !== dateStr) {
        const dow = new Date(dateStr + 'T00:00:00').getDay();
        const cap = WK_CAPACITY[dow] || 0;
        const patIds = new Set(appointments
            .filter(a => a.data === dateStr && a.status !== 'Perdido')
            .map(a => String(a.patientId)));
        if (cap && !patIds.has(String(movingApps[0].patientId)) && patIds.size >= cap) {
            showNotification(`Bloqueado: ${_wkFmtDate(dateStr)} já atingiu o limite de ${cap} vagas.`, 'error');
            renderWeekly(); return;
        }
    }

    // Valida TODAS as vacinas movidas — qualquer bloqueio cancela o movimento
    for (const a of movingApps) {
        const err = _wkValidateMove(a, dateStr);
        if (err) { showNotification(err, 'error'); renderWeekly(); return; }
    }

    const pat = patients.find(p => String(p.id) === String(movingApps[0].patientId));
    const horaLbl = h => h ? h : 'sem horário';
    document.getElementById('wdrop-from').textContent = `${_wkFmtDate(fromDate)} · ${horaLbl(fromHora)}`;
    document.getElementById('wdrop-to').textContent   = `${_wkFmtDate(dateStr)} · ${horaLbl(hora)}`;
    document.getElementById('wdrop-patient').textContent = pat ? pat.nome : '—';
    document.getElementById('wdrop-vaccine').textContent = label || '—';

    // Validade excepcional: vacinas antecipadas em relação ao aprazamento recomendado
    const antecipadas = movingApps.map(a => {
        const apr = _wkAprazamento(a);
        const dias = apr ? diasAntecipacao(dateStr, apr.minIso) : 0;
        if (!dias) return null;
        const vac = vaccines.find(v => String(v.id) === String(a.vaccineId));
        return `<li><b>${vac ? vac.nome : 'Vacina'} ${a.doseAtual}</b> — recomendada ${_wkFmtDate(apr.minIso)} (${dias} dia${dias !== 1 ? 's' : ''} antes)</li>`;
    }).filter(Boolean);
    const excBox = document.getElementById('wdrop-excepcional');
    excBox.classList.toggle('hidden', !antecipadas.length);
    document.getElementById('wdrop-excepcional-lista').innerHTML = antecipadas.join('');
    document.getElementById('wdrop-confirm-btn').innerHTML = antecipadas.length
        ? '<i class="fas fa-hourglass-half mr-1"></i> Confirmar antecipação'
        : 'Confirmar';

    _weeklyPendingDrop = { ids: movingApps.map(a => a.id), targetDate: dateStr, targetHora: hora || '' };
    document.getElementById('modal-weekly-drop').classList.add('active');
}

function confirmWeeklyDrop() {
    if (!_weeklyPendingDrop) return;
    const { ids, targetDate, targetHora } = _weeklyPendingDrop;
    _weeklyPendingDrop = null;
    document.getElementById('modal-weekly-drop').classList.remove('active');
    const _auditBefore = auditSnapshotAppointments(ids);
    let moved = 0;
    ids.forEach(id => {
        const idx = appointments.findIndex(a => String(a.id) === String(id));
        if (idx < 0) return;
        appointments[idx].data = targetDate;
        appointments[idx].hora = targetHora;
        if (typeof syncAppointmentMovement === 'function') syncAppointmentMovement(appointments[idx]);
        moved++;
    });
    logAppointmentAuditMany(_auditBefore);
    if (moved) {
        saveAll();
        renderWeekly();
        if (typeof renderCalendar === 'function') renderCalendar();
        showNotification(moved > 1 ? `${moved} agendamentos movidos com sucesso!` : 'Agendamento movido com sucesso!', 'success');
    }
    // Arraste vindo do mensal: fecha o modal do dia de origem (o dia mudou)
    if (_monthPendingReturn) {
        _monthPendingReturn = null;
        _monthDayModalHide(false);
        document.getElementById('modal-day-details').classList.remove('active');
    }
}

function cancelWeeklyDrop() {
    _weeklyPendingDrop = null;
    document.getElementById('modal-weekly-drop').classList.remove('active');
    // Arraste vindo do mensal: devolve o modal do dia como estava
    if (_monthPendingReturn) {
        _monthPendingReturn = null;
        _monthDayModalHide(false);
        return;
    }
    renderWeekly();
}

// ─── Painel do grupo: detalhe/arraste individual ──────────────────────────────
function openWeeklyGroup(dateStr, patId) {
    const pat = patients.find(p => String(p.id) === String(patId));
    const apps = appointments.filter(a => a.data === dateStr && String(a.patientId) === String(patId) && a.status !== 'Perdido')
        .sort((x, y) => (_wkMinutes(x.hora) ?? 1e9) - (_wkMinutes(y.hora) ?? 1e9));
    if (!pat || !apps.length) return;
    const todayStr = new Date().toISOString().split('T')[0];
    const _isDark = document.body.classList.contains('dark-mode');

    document.getElementById('wkgroup-title').textContent = pat.nome;
    document.getElementById('wkgroup-sub').textContent =
        `${_wkFmtDate(dateStr)} · ${apps.length} vacina(s)${apps[0].hora ? ' · ' + apps[0].hora : ' · sem horário'}`;

    // Ações em lote do grupo
    const appsParaAplicar = apps.filter(a => a.status === 'Agendado');
    const appsParaAgendar = apps.filter(a => a.status === 'Em negociação' || a.status === 'Nova oportunidade');
    const grupoHora = apps.find(a => a.hora)?.hora || '';
    const grupoVendedor = (apps.find(a => a.vendedor)?.vendedor || '').replace(/'/g, "\\'");
    const btnCls = 'h-9 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider shadow-sm transition flex items-center justify-center gap-1.5 flex-1';

    document.getElementById('wkgroup-actions').innerHTML = [
        appsParaAgendar.length
            ? permBtn('criar_agendamento', `<button onclick="closeWeeklyGroup();openAgendarGrupoModal(${patId},'Em negociação',appointments.filter(a=>String(a.patientId)==='${patId}'&&a.data==='${dateStr}'&&(a.status==='Em negociação'||a.status==='Nova oportunidade')))"
                class="${btnCls} bg-blue-500 text-white hover:bg-blue-600"><i class="fas fa-calendar-check text-[9px]"></i>Agendar todos (${appsParaAgendar.length})</button>`)
            : '',
        appsParaAplicar.length
            ? permBtn('aplicar', `<button onclick="closeWeeklyGroup();openAplicarGrupoModal(${patId},'Agendado',appointments.filter(a=>String(a.patientId)==='${patId}'&&a.data==='${dateStr}'&&a.status==='Agendado'))"
                class="${btnCls} bg-green-500 text-white hover:bg-green-600"><i class="fas fa-syringe text-[9px]"></i>Aplicar todos (${appsParaAplicar.length})</button>`)
            : '',
        permBtn('criar_agendamento', `<button onclick="addVacinaToWeeklyGroup('${dateStr}','${patId}','${grupoHora}','${grupoVendedor}')"
            class="${btnCls} bg-indigo-600 text-white hover:bg-indigo-700"><i class="fas fa-plus text-[9px]"></i>Adicionar vacina</button>`)
    ].filter(Boolean).join('');

    document.getElementById('wkgroup-list').innerHTML = apps.map(a => {
        const vac = getVaccineById(a.vaccineId);
        const isDelayed = a.status === 'Agendado' && a.data < todayStr;
        const stColor = a.status === 'Aplicado' ? '#16a34a' : isDelayed ? '#f59e0b'
            : a.status === 'Agendado' ? '#2563eb' : a.status === 'Em negociação' ? '#0891b2' : '#64748b';
        const btnAgendar = (a.status === 'Em negociação' || a.status === 'Nova oportunidade')
            ? permBtn('criar_agendamento', `<button onclick="event.stopPropagation();closeWeeklyGroup();openAgendarModal(${a.id})" class="h-6 w-6 rounded flex items-center justify-center bg-blue-500 text-white hover:bg-blue-600 transition shrink-0" title="Agendar"><i class="fas fa-calendar-check text-[9px]"></i></button>`)
            : '';
        const btnAplicar = a.status === 'Agendado'
            ? permBtn('aplicar', `<button onclick="event.stopPropagation();closeWeeklyGroup();openConcluirModal(${a.id})" class="h-6 w-6 rounded flex items-center justify-center bg-green-500 text-white hover:bg-green-600 transition shrink-0" title="Aplicar"><i class="fas fa-syringe text-[9px]"></i></button>`)
            : '';
        return `<div draggable="true"
            ondragstart="weeklyDragStart(event,${a.id})" ondragend="weeklyDragEnd(event)"
            onclick="closeWeeklyGroup();viewRecord(${a.id})"
            class="flex items-center gap-2 rounded-xl px-2.5 py-2 border cursor-grab hover:shadow-sm transition"
            style="background:${_isDark ? '#0f172a' : '#fff'};border-color:${_isDark ? '#334155' : '#e2e8f0'};border-left:3px solid ${stColor};">
            <i class="fas fa-syringe text-[10px] shrink-0" style="color:${stColor}"></i>
            <div class="flex-1 min-w-0">
                <p class="text-[11px] font-black truncate" style="color:${_isDark ? '#f1f5f9' : '#172554'}">${vac ? vac.nome : '—'}</p>
                <p class="text-[9px]" style="color:${_isDark ? '#64748b' : '#94a3b8'}">${a.doseAtual || ''}${a.hora ? ' · ' + a.hora : ''} · ${a.status}</p>
            </div>
            ${btnAgendar}${btnAplicar}
            <i class="fas fa-grip-vertical text-[9px] shrink-0" style="color:${_isDark ? '#475569' : '#cbd5e1'}"></i>
        </div>`;
    }).join('');

    document.getElementById('modal-weekly-group').classList.add('active');
}

function closeWeeklyGroup() {
    document.getElementById('modal-weekly-group').classList.remove('active');
}

// Novo agendamento já preenchido com paciente, data, hora e vendedor do grupo
function addVacinaToWeeklyGroup(dateStr, patId, hora, vendedor) {
    if (!checkPerm('criar_agendamento')) return;
    closeWeeklyGroup();
    const p = patients.find(x => String(x.id) === String(patId));
    openRecordModal();
    const dEl = document.getElementById('reg-data');
    if (dEl) dEl.value = dateStr;
    const hEl = document.getElementById('reg-hora');
    if (hEl) hEl.value = hora || '';
    const vEl = document.getElementById('reg-vendedor');
    if (vEl && vendedor) vEl.value = vendedor;
    if (p) {
        setTimeout(() => {
            document.getElementById('reg-patient-search').value = `${p.cpf} - ${p.nome}`;
            autoFillPatient();
            // autoFillPatient pode reescrever a data — reaplica os dados do grupo
            if (dEl) dEl.value = dateStr;
            if (hEl) hEl.value = hora || '';
            if (vEl && vendedor) vEl.value = vendedor;
            if (typeof updateIdadeField === 'function') updateIdadeField();
        }, 50);
    }
}

// Duplo clique em slot vazio → novo agendamento naquela data/hora
function weeklySlotDblClick(dateStr, hora) {
    if (typeof openRecordModal !== 'function') return;
    openRecordModal();
    const dEl = document.getElementById('reg-data');
    if (dEl) { dEl.value = dateStr; dEl.dispatchEvent(new Event('change')); }
    const hEl = document.getElementById('reg-hora'); if (hEl) hEl.value = hora;
}

function changeMonth(dir) { currentDate.setMonth(currentDate.getMonth() + dir); renderCalendar(); }
function jumpToMonth(val) { if(!val) return; const [y, m] = val.split('-'); currentDate = new Date(y, parseInt(m)-1, 1); renderCalendar(); }

// ─── MONTH/YEAR PICKER ────────────────────────────────────────────────────────
const MONTHS_PICKER = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MONTHS_FULL   = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
let _pickerYear  = new Date().getFullYear();
let _pickerMonth = new Date().getMonth(); // usado apenas no modo semanal

function _positionPicker() {
    const picker = document.getElementById('month-year-picker');
    const btn = document.getElementById('current-month-label')?.closest('button');
    if (!picker || !btn) return;
    const rect = btn.getBoundingClientRect();
    const pickerW = 288;
    let left = rect.left + rect.width / 2 - pickerW / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - pickerW - 8));
    picker.style.position = 'fixed';
    picker.style.top  = (rect.bottom + 8) + 'px';
    picker.style.left = left + 'px';
    picker.style.right = 'auto';
    picker.style.zIndex = '99999';
}

function toggleMonthYearPicker() {
    const picker = document.getElementById('month-year-picker');
    const isHidden = picker.classList.contains('hidden');
    if (isHidden) {
        // Mover picker para body para escapar de backdrop-filter/stacking contexts
        if (picker.parentElement !== document.body) {
            document.body.appendChild(picker);
        }
        if (_calView === 'semanal') {
            const ref = _weekStart || new Date();
            _pickerYear  = ref.getFullYear();
            _pickerMonth = ref.getMonth();
            _renderPickerWeekMode();
        } else {
            _pickerYear = currentDate.getFullYear();
            _renderPickerMonthMode();
        }
        _positionPicker();
        picker.classList.remove('hidden');
        setTimeout(() => document.addEventListener('click', _closPickerOutside), 10);
    } else {
        picker.classList.add('hidden');
        document.removeEventListener('click', _closPickerOutside);
    }
}

function _closPickerOutside(e) {
    const picker = document.getElementById('month-year-picker');
    const triggerBtn = document.getElementById('current-month-label')?.closest('button');
    if (picker && !picker.contains(e.target) && !triggerBtn?.contains(e.target)) {
        picker.classList.add('hidden');
        document.removeEventListener('click', _closPickerOutside);
    }
}

function pickerChangeYear(dir) {
    _pickerYear += dir;
    if (_calView === 'semanal') _renderPickerWeekMode();
    else _renderPickerMonthMode();
}

function pickerChangeMonth(dir) {
    _pickerMonth += dir;
    if (_pickerMonth < 0)  { _pickerMonth = 11; _pickerYear--; }
    if (_pickerMonth > 11) { _pickerMonth = 0;  _pickerYear++; }
    _renderPickerWeekMode();
}

function _renderPickerMonthMode() {
    document.getElementById('picker-months-grid').classList.remove('hidden');
    document.getElementById('picker-week-mode').classList.add('hidden');
    document.getElementById('picker-year-label').textContent = _pickerYear;
    const curMonth = currentDate.getMonth();
    const curYear  = currentDate.getFullYear();
    const grid = document.getElementById('picker-months-grid');
    grid.innerHTML = MONTHS_PICKER.map((m, i) => {
        const isActive = i === curMonth && _pickerYear === curYear;
        return `<button onclick="pickerSelectMonth(${i})" class="py-2 rounded-xl text-xs font-black uppercase transition ${isActive ? 'bg-clinic-600 text-white shadow-md' : 'text-slate-600 hover:bg-clinic-50 hover:text-clinic-700'}">${m}</button>`;
    }).join('');
}

function _renderPickerWeekMode() {
    document.getElementById('picker-months-grid').classList.add('hidden');
    document.getElementById('picker-week-mode').classList.remove('hidden');
    document.getElementById('picker-year-label').textContent = _pickerYear;
    document.getElementById('picker-month-label').textContent = `${MONTHS_FULL[_pickerMonth]} ${_pickerYear}`;

    const activeWeekSunday = _weekStart ? new Date(_weekStart) : null;
    const firstDay = new Date(_pickerYear, _pickerMonth, 1).getDay();
    const daysInMonth = new Date(_pickerYear, _pickerMonth + 1, 0).getDate();
    const todayStr = new Date().toISOString().split('T')[0];

    let cells = '';
    for (let i = 0; i < firstDay; i++) cells += '<div></div>';

    for (let d = 1; d <= daysInMonth; d++) {
        const dateObj = new Date(_pickerYear, _pickerMonth, d);
        const weekSun = _getSundayOf(dateObj);
        const dateStr = dateObj.toISOString().split('T')[0];
        const isToday = dateStr === todayStr;
        const isInActiveWeek = activeWeekSunday && weekSun.getTime() === activeWeekSunday.getTime();
        const isSun = dateObj.getDay() === 0;

        let cls = 'h-7 w-7 mx-auto flex items-center justify-center rounded-lg text-[11px] font-black cursor-pointer transition ';
        if (isInActiveWeek) {
            cls += isSun ? 'bg-red-500 text-white' : 'bg-clinic-600 text-white';
        } else if (isToday) {
            cls += 'ring-2 ring-clinic-400 text-clinic-700';
        } else {
            cls += isSun ? 'text-red-400 hover:bg-red-50' : 'text-slate-600 hover:bg-clinic-50 hover:text-clinic-700';
        }

        cells += `<div onclick="pickerSelectWeek(${_pickerYear},${_pickerMonth},${d})" class="${cls}">${d}</div>`;
    }

    document.getElementById('picker-week-days-grid').innerHTML = cells;
}

function pickerSelectMonth(monthIndex) {
    currentDate = new Date(_pickerYear, monthIndex, 1);
    renderCalendar();
    document.getElementById('month-year-picker').classList.add('hidden');
    document.removeEventListener('click', _closPickerOutside);
}

function pickerSelectWeek(year, month, day) {
    const clicked = new Date(year, month, day);
    _weekStart = _getSundayOf(clicked);
    renderWeekly();
    document.getElementById('month-year-picker').classList.add('hidden');
    document.removeEventListener('click', _closPickerOutside);
}

function renderMonthYearPicker() { _renderPickerMonthMode(); }

function renderCalendar() {
    _populateCalVendedorList();
    const _rawVendCal = document.getElementById('filter-vendedor-cal').value;
    const filterVendedorCal = _rawVendCal === '__mine__'
        ? (typeof currentUser !== 'undefined' && currentUser ? currentUser.nome : '')
        : _rawVendCal;
    const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const year = currentDate.getFullYear(); const month = currentDate.getMonth();

    document.getElementById('current-month-label').innerText = `${MONTHS[month]} ${year}`;

    const first = new Date(year, month, 1).getDay(); const days = new Date(year, month + 1, 0).getDate();
    const todayStr = new Date().toISOString().split('T')[0];

    const body = document.getElementById('calendar-body');
    body.innerHTML = '';
    // No celular o mês vira lista (um dia por linha): as células de
    // preenchimento até o primeiro dia da semana não fazem sentido.
    const mList = typeof isMobileView === 'function' && isMobileView();
    body.classList.toggle('m-cal-list', !!mList);
    if (!mList) {
        for (let i = 0; i < first; i++) body.appendChild(Object.assign(document.createElement('div'), {className: 'min-h-[100px]'}));
    }
    const WDAYS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

    // Agrupa por data numa única passada, em vez de um appointments.filter() por
    // célula do mês (31 varreduras completas do array a cada render).
    const appsByDate = new Map();
    for (const a of appointments) {
        if (filterVendedorCal && a.vendedor !== filterVendedorCal) continue;
        let bucket = appsByDate.get(a.data);
        if (!bucket) { bucket = []; appsByDate.set(a.data, bucket); }
        bucket.push(a);
    }
    const holidaySet = new Set(holidays);

    for (let d = 1; d <= days; d++) {
        const dateObj = new Date(year, month, d);
        const isSunday = dateObj.getDay() === 0;
        const dateStr = `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const isHoliday = holidaySet.has(dateStr);
        const dayApps = appsByDate.get(dateStr) || [];

        const cell = document.createElement('div');
        // Na lista do celular o dia da semana precisa vir junto do número
        // (sem a grade, a coluna já não identifica o dia)
        const dayLabel = mList
            ? `${d}<span class="m-cal-wd">${WDAYS[dateObj.getDay()]}</span>`
            : `${d}`;

        if (isSunday) {
            cell.className = `min-h-[100px] rounded-lg border p-1.5 bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed flex flex-col`;
            cell.innerHTML = `<div class="text-right text-xs font-black text-slate-300 mb-1">${dayLabel}</div><div class="text-[9px] font-black text-slate-300 mt-auto w-full text-center">DOMINGO</div>`;
        } else {
            cell.className = `min-h-[100px] rounded-lg border p-1.5 bg-white hover:border-clinic-400 hover:shadow-md transition cursor-pointer flex flex-col relative ${dateStr === todayStr ? 'border-clinic-500 ring-2 ring-clinic-300' : 'border-slate-200'}`;
            cell.onclick = () => openDayModal(dateStr, d, month, year);
            cell.dataset.date = dateStr;
            cell.ondragover  = e => monthCellDragOver(e);
            cell.ondragleave = e => monthCellDragLeave(e);
            cell.ondrop      = e => monthCellDrop(e, dateStr);

            if (isHoliday) {
                cell.innerHTML = `<div class="text-right text-xs font-black mb-1 ${dateStr===todayStr?'text-clinic-600':'text-slate-400'}">${dayLabel}</div><div class="text-[9px] font-black text-red-500 bg-red-50 text-center rounded py-1 mt-auto border border-red-200 shadow-sm">FERIADO</div>`;
            } else {
                const emAndamento = dayApps.filter(a => a.status === 'Em negociação').length;
                const agendadosTodos = dayApps.filter(a => a.status === 'Agendado');
                const atrasados = dateStr < todayStr ? agendadosTodos.length : 0;
                const agendados = agendadosTodos.length - atrasados;
                const aplicados = dayApps.filter(a => a.status === 'Aplicado').length;
                const cancelados = dayApps.filter(a => a.status === 'Perdido').length;
                const semLote = agendadosTodos.filter(a => !a.loteId).length;

                // .cal-sum: no celular estas faixas viram pontos coloridos (css/mobile.css)
                let summary = '';
                if(semLote)     summary += `<div class="cal-sum text-[9px] font-black text-pink-700 bg-pink-50 border border-pink-200 rounded px-1 mb-0.5 truncate shadow-sm" title="Agendamentos sem lote reservado"><i class="fas fa-exclamation-triangle"></i> ${semLote} AGENDADO(S) SEM LOTE</div>`;
                if(emAndamento) summary += `<div class="cal-sum text-[9px] font-black text-cyan-700 bg-cyan-50 border border-cyan-100 rounded px-1 mb-0.5 truncate shadow-sm">${emAndamento} NEGOCIANDO</div>`;
                if(atrasados)   summary += `<div class="cal-sum text-[9px] font-black text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 mb-0.5 truncate shadow-sm"><i class="fas fa-exclamation-triangle"></i> ${atrasados} ATRASADO(S)</div>`;
                if(agendados)   summary += `<div class="cal-sum text-[9px] font-black text-blue-700 bg-blue-50 border border-blue-100 rounded px-1 mb-0.5 truncate shadow-sm">${agendados} AGENDADO(S)</div>`;
                if(aplicados)   summary += `<div class="cal-sum text-[9px] font-black text-green-700 bg-green-50 border border-green-100 rounded px-1 mb-0.5 truncate shadow-sm">${aplicados} APLICADO(S)</div>`;
                if(cancelados)  summary += `<div class="cal-sum text-[9px] font-black text-red-700 bg-red-50 border border-red-100 rounded px-1 mb-0.5 truncate shadow-sm">${cancelados} PERDIDO(S)</div>`;

                cell.innerHTML = `<div class="text-right text-xs font-black mb-1 ${dateStr===todayStr?'text-clinic-600':'text-slate-400'}">${dayLabel}</div><div class="cal-sum-wrap flex flex-col gap-[1px]">${summary}</div>`;
            }
        }
        body.appendChild(cell);
    }
    if (_calView === 'semanal') renderWeekly();
}

// ─── Drag & Drop no calendário mensal (a partir do modal do dia) ─────────────
let _monthDragActive = null;   // { type:'group'|'single', dateStr, patId, id }

function _monthDayModalHide(hide) {
    const modal = document.getElementById('modal-day-details');
    if (!modal) return;
    modal.style.opacity = hide ? '0' : '';
    modal.style.pointerEvents = hide ? 'none' : '';
}

function _monthShowDragGhost(show, label) {
    let ghost = document.getElementById('month-drag-ghost');
    if (!show) { if (ghost) ghost.remove(); document.removeEventListener('dragover', _monthGhostFollow); return; }
    if (!ghost) {
        ghost = document.createElement('div');
        ghost.id = 'month-drag-ghost';
        ghost.className = 'fixed z-[400] pointer-events-none rounded-xl px-3 py-2 shadow-2xl';
        ghost.style.cssText += 'background:#2563eb;color:#fff;font-weight:900;font-size:11px;text-transform:uppercase;letter-spacing:.04em;transform:translate(12px,12px);';
        document.body.appendChild(ghost);
    }
    ghost.innerHTML = `<i class="fas fa-hand-rock mr-1.5"></i>${label} <span class="opacity-70">— solte em um dia</span>`;
    document.addEventListener('dragover', _monthGhostFollow);
}

function _monthGhostFollow(e) {
    const ghost = document.getElementById('month-drag-ghost');
    if (!ghost) return;
    ghost.style.left = e.clientX + 'px';
    ghost.style.top  = e.clientY + 'px';
}

function monthGroupDragStart(e, dateStr, patId) {
    e.stopPropagation();
    const pat = patients.find(p => String(p.id) === String(patId));
    const n = appointments.filter(a => a.data === dateStr && String(a.patientId) === String(patId) && a.status !== 'Perdido').length;
    _monthDragActive = { type: 'group', dateStr, patId };
    _weeklyDragGroup = { dateStr, patId }; _weeklyDragId = null;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `group:${patId}`);
    _monthShowDragGhost(true, `${pat ? pat.nome : 'Atendimento'} · ${n} vacina(s)`);
    _monthArmCalendarDrop(true);
    setTimeout(() => _monthDayModalHide(true), 0);
}

function monthDragStart(e, id) {
    e.stopPropagation();
    const a = appointments.find(x => String(x.id) === String(id));
    const vac = a ? vaccines.find(v => String(v.id) === String(a.vaccineId)) : null;
    _monthDragActive = { type: 'single', id };
    _weeklyDragId = id; _weeklyDragGroup = null;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(id));
    _monthShowDragGhost(true, vac ? `${vac.nome} · ${a.doseAtual || ''}` : 'Vacina');
    _monthArmCalendarDrop(true);
    setTimeout(() => _monthDayModalHide(true), 0);
}

function monthDragEnd() {
    _monthShowDragGhost(false);
    _monthArmCalendarDrop(false);
    // Se não houve drop válido, reexibe o modal do dia
    if (_monthDragActive && !_weeklyPendingDrop) _monthDayModalHide(false);
    _monthDragActive = null;
    _weeklyDragGroup = null; _weeklyDragId = null;
}

// Ativa/desativa as células do calendário como alvos de soltura
function _monthArmCalendarDrop(on) {
    const body = document.getElementById('calendar-body');
    if (!body) return;
    body.querySelectorAll('[data-date]').forEach(cell => {
        cell.classList.toggle('month-drop-armed', on);
        if (!on) cell.style.outline = '';
    });
}

function monthCellDragOver(e) {
    if (!_monthDragActive) return;
    e.preventDefault();
    e.currentTarget.style.outline = '2px solid #2563eb';
    e.currentTarget.style.outlineOffset = '-2px';
}
function monthCellDragLeave(e) { e.currentTarget.style.outline = ''; }

function monthCellDrop(e, dateStr) {
    if (!_monthDragActive) return;
    e.currentTarget.style.outline = '';
    _monthShowDragGhost(false);
    _monthArmCalendarDrop(false);
    _monthPendingReturn = _monthDragActive;
    _monthDragActive = null;
    // Mantém o horário atual: reusa a validação/confirmação do semanal
    const keepHora = _weeklyDragGroup
        ? (appointments.find(a => a.data === _weeklyDragGroup.dateStr && String(a.patientId) === String(_weeklyDragGroup.patId) && a.hora) || {}).hora || ''
        : (appointments.find(a => String(a.id) === String(_weeklyDragId)) || {}).hora || '';
    weeklyDrop(e, dateStr, keepHora);
    // Nenhum modal de confirmação aberto ⇒ movimento bloqueado: devolve o modal do dia
    if (!_weeklyPendingDrop) { _monthPendingReturn = null; _monthDayModalHide(false); }
}

let _monthPendingReturn = null; // origem do arraste no mensal, para reabrir o modal do dia

// ─── MODAL DO DIA & FERIADOS ──────────────────────────────────────────────────
function openDayModal(dateStr, d, month, year) {
    selectedDayDate = dateStr;
    const formattedDate = `${String(d).padStart(2,'0')}/${String(month + 1).padStart(2,'0')}/${year}`;
    document.getElementById('day-details-date').innerText = formattedDate;

    const isHoliday = holidays.includes(dateStr);
    const holidayBtnContainer = document.getElementById('holiday-btn-container');
    const list = document.getElementById('day-appointments-list');
    const btnAgendarDia = document.getElementById('btn-agendar-dia');

    const _dmIsHoliDark = document.body.classList.contains('dark-mode');
    if (isHoliday) {
        holidayBtnContainer.innerHTML = permBtn('definir_feriados', `<button onclick="toggleHoliday('${dateStr}')" class="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition shadow-sm" style="background:${_dmIsHoliDark?'rgba(148,163,184,0.15)':'#e2e8f0'};color:${_dmIsHoliDark?'#94a3b8':'#475569'};border:1px solid ${_dmIsHoliDark?'rgba(148,163,184,0.3)':'#cbd5e1'}"><i class="fas fa-calendar-check mr-1"></i> Remover Feriado</button>`);
        list.innerHTML = `<div class="text-center py-10"><i class="fas fa-cocktail text-4xl text-red-200 mb-3"></i><p class="text-red-500 font-black uppercase">Dia marcado como Feriado</p></div>`;
        btnAgendarDia.style.display = 'none';
    } else {
        holidayBtnContainer.innerHTML = permBtn('definir_feriados', `<button onclick="toggleHoliday('${dateStr}')" class="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition shadow-sm" style="background:${_dmIsHoliDark?'rgba(239,68,68,0.15)':'#fee2e2'};color:${_dmIsHoliDark?'#f87171':'#dc2626'};border:1px solid ${_dmIsHoliDark?'rgba(239,68,68,0.3)':'#fca5a5'}"><i class="fas fa-calendar-times mr-1"></i> Marcar Feriado</button>`);
        btnAgendarDia.style.display = (isCurrentUserAdmin() || hasPerm('agendar')) ? 'block' : 'none';

        const dayApps = appointments.filter(a => a.data === dateStr);
        if (dayApps.length === 0) {
            list.innerHTML = `<p class="text-center text-slate-400 text-sm py-8 font-bold">Nenhum agendamento neste dia.</p>`;
        } else {
            const todayStrDM = new Date().toISOString().split('T')[0];
            const _dmIsDark = document.body.classList.contains('dark-mode');
            const _dmDl = (light, dark) => _dmIsDark ? dark : light;
            const _dmApptTime = a => { const t = a.hora ? a.hora.trim() : '00:00'; return new Date(`${a.data}T${t}`); };

            // Agrupa por paciente
            const byPatDM = {};
            dayApps.forEach(a => { if (!byPatDM[a.patientId]) byPatDM[a.patientId] = []; byPatDM[a.patientId].push(a); });

            // Ordena grupos pelo horário do primeiro agendamento do grupo
            const groupsDM = Object.entries(byPatDM).sort(([, appsA], [, appsB]) => {
                const tA = Math.min(...appsA.map(a => _dmApptTime(a).getTime()));
                const tB = Math.min(...appsB.map(a => _dmApptTime(a).getTime()));
                return tA - tB;
            });

            list.innerHTML = groupsDM.map(([patId, apps]) => {
                const pat = getPatientById(patId);
                if (!pat) return '';

                // Ordena vacinas do grupo por horário
                apps.sort((a, b) => _dmApptTime(a) - _dmApptTime(b));

                const hasDelayed = apps.some(a => dateStr < todayStrDM && a.status === 'Agendado');
                const hasSemLoteDM = apps.some(a => a.status === 'Agendado' && !a.loteId);
                const waLink = `https://wa.me/55${formatWa(pat.contato || '')}`;
                const firstHora = apps[0].hora || '';

                // Status dominante do grupo (para cor do header)
                const dominantStatus = apps.every(a => a.status === 'Aplicado') ? 'Aplicado'
                    : apps.some(a => a.status === 'Agendado') ? 'Agendado'
                    : apps.some(a => a.status === 'Em negociação') ? 'Em negociação'
                    : apps.some(a => a.status === 'Nova oportunidade') ? 'Nova oportunidade'
                    : apps[0].status;

                const headerAccent = dominantStatus === 'Aplicado' ? '#16a34a'
                    : hasDelayed ? '#f59e0b'
                    : dominantStatus === 'Agendado' ? '#2563eb'
                    : dominantStatus === 'Em negociação' ? '#0891b2'
                    : '#64748b';
                const headerBgColor = dominantStatus === 'Aplicado' ? _dmDl('#f0fdf4','#052e16')
                    : hasDelayed ? _dmDl('#fffbeb','#1c1500')
                    : dominantStatus === 'Agendado' ? _dmDl('#eff6ff','#0f1f3d')
                    : dominantStatus === 'Em negociação' ? _dmDl('#ecfeff','#0c2535')
                    : _dmDl('#f8fafc','#1e293b');
                const headerBorderColor = dominantStatus === 'Aplicado' ? _dmDl('#bbf7d0','#166534')
                    : hasDelayed ? _dmDl('#fde68a','#78350f')
                    : dominantStatus === 'Agendado' ? _dmDl('#bfdbfe','#1e3a8a')
                    : dominantStatus === 'Em negociação' ? _dmDl('#a5f3fc','#164e63')
                    : _dmDl('#e2e8f0','#334155');

                const miniCardBg = _dmDl('#ffffff', '#1e293b');
                const miniCardBorder = _dmDl('#e2e8f0', '#334155');
                const patNameColor = _dmDl('#172554', '#f1f5f9');
                const metaColor = _dmDl('#64748b', '#94a3b8');
                const bodyBg = _dmDl('#f8fafc', '#0f172a');

                const minicardsHtml = apps.map(a => {
                    const vac = getVaccineById(a.vaccineId);
                    if (!vac) return '';
                    const isDelayed = dateStr < todayStrDM && a.status === 'Agendado';
                    const stColor = a.status === 'Aplicado' ? (_dmIsDark?'#4ade80':'#16a34a') : isDelayed ? (_dmIsDark?'#fbbf24':'#d97706') : a.status === 'Agendado' ? (_dmIsDark?'#60a5fa':'#2563eb') : a.status === 'Em negociação' ? (_dmIsDark?'#22d3ee':'#0891b2') : (_dmIsDark?'#94a3b8':'#64748b');
                    const stBg = a.status === 'Aplicado' ? (_dmIsDark?'rgba(74,222,128,0.15)':'#dcfce7') : isDelayed ? (_dmIsDark?'rgba(251,191,36,0.15)':'#fffbeb') : a.status === 'Agendado' ? (_dmIsDark?'rgba(96,165,250,0.15)':'#dbeafe') : a.status === 'Em negociação' ? (_dmIsDark?'rgba(34,211,238,0.15)':'#cffafe') : (_dmIsDark?'rgba(148,163,184,0.15)':'#f1f5f9');
                    const stLabel = isDelayed ? 'Atrasado' : a.status;
                    const semLoteA = a.status === 'Agendado' && !a.loteId;
                    const mcBg = semLoteA ? _dmDl('#fdf2f8','#3b0a25') : miniCardBg;
                    const mcAccent = semLoteA ? '#db2777' : stColor;
                    return `<div class="flex items-center gap-2 px-3 py-2 rounded-lg border hover:shadow-sm transition cursor-grab"
                        style="background:${mcBg};border-color:${semLoteA ? _dmDl('#fbcfe8','#831843') : miniCardBorder};border-left:3px solid ${mcAccent};border-left-color:${mcAccent};"
                        draggable="true"
                        ondragstart="monthDragStart(event,${a.id})"
                        ondragend="monthDragEnd(event)"
                        onclick="viewRecord(${a.id})"
                        <i class="fas fa-syringe text-[10px] shrink-0" style="color:${stColor}"></i>
                        <div class="flex-1 min-w-0">
                            <p class="text-[11px] font-black truncate" style="color:${patNameColor}">${vac.nome}</p>
                            <p class="text-[10px]" style="color:${metaColor}">${a.doseAtual}${a.hora ? ' · <i class="far fa-clock"></i> '+a.hora : ''}</p>
                        </div>
                        ${semLoteA ? `<span title="Sem lote reservado" class="text-[9px] font-black px-1.5 py-0.5 rounded-full whitespace-nowrap border shrink-0" style="background:${_dmDl('#fce7f3','#3b0a25')};color:${_dmDl('#9d174d','#f9a8d4')};border-color:${_dmDl('#fbcfe8','#831843')}"><i class="fas fa-exclamation-triangle mr-1"></i>Sem lote</span>` : ''}
                        <span class="text-[9px] font-black px-1.5 py-0.5 rounded-full whitespace-nowrap" style="background:${stBg};color:${stColor};">${stLabel}</span>
                        <div class="flex gap-1 shrink-0">
                            ${a.status === 'Agendado' ? permBtn('aplicar', `<button onclick="event.stopPropagation();openConcluirModal(${a.id})" class="h-7 px-2 rounded-lg text-[9px] font-black uppercase shadow-sm transition" style="background:${_dmIsDark?'rgba(74,222,128,0.2)':'#22c55e'};color:${_dmIsDark?'#4ade80':'#fff'};border:1px solid ${_dmIsDark?'rgba(74,222,128,0.35)':'transparent'}"><i class="fas fa-check mr-1"></i>Aplicar</button>`) : ''}
                            ${(a.status === 'Em negociação' || a.status === 'Nova oportunidade') ? permBtn('criar_agendamento', `<button onclick="event.stopPropagation();openAgendarModal(${a.id})" class="h-7 px-2 rounded-lg text-[9px] font-black uppercase shadow-sm transition" style="background:${_dmIsDark?'rgba(96,165,250,0.2)':'#3b82f6'};color:${_dmIsDark?'#60a5fa':'#fff'};border:1px solid ${_dmIsDark?'rgba(96,165,250,0.35)':'transparent'}"><i class="fas fa-calendar-check mr-1"></i>Agendar</button>`) : ''}
                        </div>
                    </div>`;
                }).join('');

                const appsParaAplicar = apps.filter(a => a.status === 'Agendado');
                const appsParaAgendar = apps.filter(a => a.status === 'Em negociação' || a.status === 'Nova oportunidade');
                const dmGroupId = `dm-group-${patId}`;

                const btnAplicarTodos = appsParaAplicar.length > 0
                    ? permBtn('aplicar', `<button onclick="event.stopPropagation();openAplicarGrupoModal(${patId},'Agendado',appointments.filter(a=>a.patientId==${patId}&&a.status==='Agendado'))" class="h-7 px-2 rounded-lg text-[9px] font-black uppercase shadow-sm transition flex items-center gap-1 shrink-0" style="background:${_dmIsDark?'rgba(74,222,128,0.2)':'#22c55e'};color:${_dmIsDark?'#4ade80':'#fff'};border:1px solid ${_dmIsDark?'rgba(74,222,128,0.35)':'transparent'}"><i class="fas fa-syringe text-[8px]"></i>Aplicar todos</button>`)
                    : '';
                const btnAgendarTodos = appsParaAgendar.length > 0
                    ? permBtn('criar_agendamento', `<button onclick="event.stopPropagation();openAgendarGrupoModal(${patId},'Em negociação',appointments.filter(a=>a.patientId==${patId}&&(a.status==='Em negociação'||a.status==='Nova oportunidade')))" class="h-7 px-2 rounded-lg text-[9px] font-black uppercase shadow-sm transition flex items-center gap-1 shrink-0" style="background:${_dmIsDark?'rgba(96,165,250,0.2)':'#3b82f6'};color:${_dmIsDark?'#60a5fa':'#fff'};border:1px solid ${_dmIsDark?'rgba(96,165,250,0.35)':'transparent'}"><i class="fas fa-calendar-check text-[8px]"></i>Agendar todos</button>`)
                    : '';

                return `<div class="rounded-xl border shadow-sm overflow-hidden transition hover:shadow-md" style="border-left:4px solid ${headerAccent};border-color:${headerBorderColor};">
                    <div class="px-3 py-2.5 flex items-center gap-2 border-b cursor-grab" style="background:${headerBgColor};border-color:${headerBorderColor};"
                        draggable="true"
                        ondragstart="monthGroupDragStart(event,'${dateStr}','${patId}')"
                        ondragend="monthDragEnd(event)"
                        title="Arraste para mover o atendimento para outro dia">
                        <button onclick="event.stopPropagation();dayModalToggleGroup('${dmGroupId}')" class="h-7 w-7 rounded-lg flex items-center justify-center transition shrink-0" style="background:${_dmDl('rgba(255,255,255,0.7)','rgba(0,0,0,0.2)')};color:${metaColor};" title="Mostrar/ocultar vacinas">
                            <i class="fas fa-chevron-up text-[10px]" id="${dmGroupId}-chevron"></i>
                        </button>
                        <div class="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 font-black text-sm text-white" style="background:${headerAccent};">${(pat.nome||'?')[0].toUpperCase()}</div>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2 flex-wrap">
                                <h4 class="font-black text-sm" style="color:${patNameColor}">${pat.nome}</h4>
                                <a href="${waLink}" target="_blank" onclick="event.stopPropagation()" title="WhatsApp" class="text-green-500 hover:text-green-700 transition"><i class="fab fa-whatsapp"></i></a>
                                ${hasDelayed ? `<span class="text-[9px] font-black px-1.5 py-0.5 rounded-full border" style="background:${_dmDl('#fef9c3','#422006')};color:${_dmDl('#a16207','#fbbf24')};border-color:${_dmDl('#fde68a','#78350f')}"><i class="fas fa-exclamation-triangle mr-1"></i>Atrasado</span>` : ''}
                                ${hasSemLoteDM ? `<span title="Sem lote reservado" class="text-[9px] font-black px-1.5 py-0.5 rounded-full border" style="background:${_dmDl('#fce7f3','#3b0a25')};color:${_dmDl('#9d174d','#f9a8d4')};border-color:${_dmDl('#fbcfe8','#831843')}"><i class="fas fa-exclamation-triangle mr-1"></i>Sem lote</span>` : ''}
                            </div>
                            <p class="text-[10px] font-bold" style="color:${metaColor}">${getAgeDisplay(pat.dtNasc)} · CPF: ${pat.cpf}${firstHora ? ' · '+firstHora : ''} · ${apps.length} vacina${apps.length !== 1 ? 's' : ''}</p>
                        </div>
                        <div class="flex gap-1 items-center shrink-0 flex-wrap justify-end">
                            ${btnAgendarTodos}
                            ${btnAplicarTodos}
                            ${permBtn('agendar', `<button onclick="event.stopPropagation();viewPatientHistory(${patId})" title="Prontuário" class="h-7 w-7 rounded-lg flex items-center justify-center transition text-xs shrink-0" style="background:${_dmDl('#eef2ff','#1e1b4b')};color:${_dmDl('#4f46e5','#818cf8')}"><i class="fas fa-clipboard-list"></i></button>`)}
                        </div>
                    </div>
                    <div class="p-2 flex flex-col gap-1.5" id="${dmGroupId}" style="background:${bodyBg}">${minicardsHtml}</div>
                </div>`;
            }).join('');
        }
    }
    document.getElementById('modal-day-details').classList.add('active');
}

function toggleHoliday(dateStr) {
    if (!checkPerm('definir_feriados')) return;
    const idx = holidays.indexOf(dateStr);
    if(idx > -1) {
        holidays.splice(idx, 1);
        logAudit('Excluído', 'sistema', 'feriados', 'Feriado', `Data: ${dateStr.split('-').reverse().join('/')}`);
        showNotification('Feriado removido!', 'success');
    } else {
        if(appointments.some(a => a.data === dateStr)) {
            showNotification('Bloqueio: Existem agendamentos neste dia. Cancele-os antes de marcar como feriado.', 'error');
            return;
        }
        holidays.push(dateStr);
        logAudit('Criado', 'sistema', 'feriados', 'Feriado', `Data: ${dateStr.split('-').reverse().join('/')}`);
        showNotification('Dia marcado como feriado.', 'warning');
    }
    saveAll(); renderCalendar();
    const [y, m, d] = dateStr.split('-');
    openDayModal(dateStr, d, parseInt(m)-1, y);
}

function weeklyToggleGroup(groupId) {
    const body = document.getElementById(groupId);
    const chevron = document.getElementById(groupId + '-chevron');
    if (!body) return;
    const hidden = body.style.display === 'none';
    body.style.display = hidden ? '' : 'none';
    if (chevron) {
        chevron.classList.toggle('fa-chevron-up', hidden);
        chevron.classList.toggle('fa-chevron-down', !hidden);
    }
}

function dayModalToggleGroup(groupId) {
    const body = document.getElementById(groupId);
    const chevron = document.getElementById(groupId + '-chevron');
    if (!body) return;
    const hidden = body.style.display === 'none';
    body.style.display = hidden ? '' : 'none';
    if (chevron) {
        chevron.classList.toggle('fa-chevron-up', hidden);
        chevron.classList.toggle('fa-chevron-down', !hidden);
    }
}

function openRecordModalWithDate() {
    closeModals(); openRecordModal();
    if (selectedDayDate) document.getElementById('reg-data').value = selectedDayDate;
}

function setQuickStatus(id, status) {
    let idx = appointments.findIndex(a=>a.id==id);
    if(idx > -1) {
        const _auditBefore = { ...appointments[idx] };
        appointments[idx].status = status;
        logAppointmentAudit(_auditBefore, appointments[idx]);
        if (typeof syncAppointmentMovement === 'function') syncAppointmentMovement(appointments[idx]);
        if (typeof syncAllLoteStatus === 'function') syncAllLoteStatus();
        saveAll(); renderCalendar(); renderTable(); renderDashboard();
        if (typeof refreshAlmoxIfActive === 'function') refreshAlmoxIfActive();
        if (typeof refreshOpenModals === 'function') refreshOpenModals();
        showNotification('Status modificado com sucesso!','success');
    }
}

// ─── PAGAMENTO NOS MODAIS RÁPIDOS (Agendar / Aplicar) ────────────────────────
// Mesmo marcador do formulário de registro, na versão de um botão só: aqui não
// há campo de valor a acompanhar, apenas o "pago ou não pago" do agendamento.

let _quickPago = { agendar: false, concluir: false };

// Status da taxa de deslocamento no modal Concluir. O valor em si não é editado
// aqui (vem do agendamento); só o "paga ou não paga" da visita. No modal Agendar
// a taxa é editada no próprio editor de endereço, que é a fonte única lá.
let _concluirTaxaPaga = false;

// Mostra o bloco da taxa de um modal rápido e devolve o valor cobrado.
// Fora da visita domiciliar (ou sem taxa) o bloco fica oculto.
function _renderQuickTaxa(ctx, app) {
    const wrap = document.getElementById(`${ctx}-taxa-wrap`);
    const taxa = (app && typeof getTaxaDeslocamento === 'function')
        ? getTaxaDeslocamento(app.endereco) : 0;
    if (wrap) wrap.classList.toggle('hidden', taxa <= 0);
    if (taxa <= 0) return 0;
    const valEl = document.getElementById(`${ctx}-taxa-valor`);
    if (valEl) valEl.textContent = 'R$ ' + formatBRL(taxa);
    _paintQuickTaxa(ctx);
    return taxa;
}

function _paintQuickTaxa(ctx) {
    const btn = document.getElementById(`${ctx}-taxa-btn`);
    if (!btn) return;
    const on = _concluirTaxaPaga;
    btn.className = on
        ? 'w-full flex items-center justify-center gap-2 border-2 border-emerald-600 bg-emerald-600 rounded-lg py-2 px-3 text-white text-xs font-black uppercase tracking-wide transition hover:bg-emerald-700'
        : 'w-full flex items-center justify-center gap-2 border-2 border-slate-200 bg-white rounded-lg py-2 px-3 text-slate-400 text-xs font-black uppercase tracking-wide transition hover:border-emerald-300';
    const ico = document.getElementById(`${ctx}-taxa-icone`);
    const txt = document.getElementById(`${ctx}-taxa-texto`);
    if (ico) ico.className = on ? 'fas fa-circle-check text-sm' : 'fas fa-circle-xmark text-sm';
    if (txt) txt.textContent = on ? 'Taxa paga' : 'Taxa não paga';
}

function toggleQuickTaxaPaga(ctx) {
    _concluirTaxaPaga = !_concluirTaxaPaga;
    _paintQuickTaxa(ctx);
}

// Grava o status da taxa de volta no endereço do agendamento.
function _salvarQuickTaxa(app, paga) {
    if (!app || !app.endereco) return;
    if (typeof getTaxaDeslocamento !== 'function' || getTaxaDeslocamento(app.endereco) <= 0) return;
    app.endereco = { ...app.endereco, taxaPaga: !!paga };
}

function _paintQuickPago(ctx) {
    const btn  = document.getElementById(`btn-${ctx}-pago`);
    const icon = document.getElementById(`icon-${ctx}-pago`);
    const txt  = document.getElementById(`txt-${ctx}-pago`);
    if (!btn) return;
    const on = !!_quickPago[ctx];
    btn.className = on
        ? 'w-full flex items-center justify-center gap-2 border-2 border-emerald-600 bg-emerald-600 rounded-xl py-3 px-4 text-white text-xs font-black uppercase tracking-wide transition hover:bg-emerald-700 hover:border-emerald-700 shadow-sm mb-1'
        : 'w-full flex items-center justify-center gap-2 border-2 border-slate-200 bg-white rounded-xl py-3 px-4 text-slate-400 text-xs font-black uppercase tracking-wide transition hover:border-emerald-300 mb-1';
    if (icon) icon.className = on ? 'fas fa-circle-check text-sm' : 'fas fa-circle-xmark text-sm';
    if (txt)  txt.textContent = on ? 'Pago' : 'Não pago';

    // Agendar só avisa; Aplicar mostra o erro apenas depois de uma tentativa.
    if (ctx === 'agendar') {
        const aviso = document.getElementById('agendar-pago-aviso');
        const spacer = document.getElementById('agendar-pago-spacer');
        if (aviso) aviso.classList.toggle('hidden', on);
        if (spacer) spacer.style.display = on ? 'block' : 'none';
    } else if (on) {
        document.getElementById('concluir-pago-erro')?.classList.add('hidden');
        const spacer = document.getElementById('concluir-pago-spacer');
        if (spacer) spacer.style.display = 'block';
    }
}

function setQuickPago(ctx, valor) {
    _quickPago[ctx] = !!valor;
    _paintQuickPago(ctx);
}

function toggleQuickPago(ctx) {
    setQuickPago(ctx, !_quickPago[ctx]);
}

// ─── AGENDAR (de "Em negociação" → "Agendado") ───────────────────────────────
function openAgendarModal(id) {
    if (!checkPerm('agendar')) return;
    pendingAgendarId = id;
    const a = appointments.find(x => x.id == id);
    if (!a) return;
    const pat = patients.find(p => p.id == a.patientId);
    const vac = vaccines.find(v => v.id == a.vaccineId);

    document.getElementById('agendar-info').innerText = pat && vac ? `${pat.nome} — ${vac.nome} (${a.doseAtual})` : '';
    const dataInput = document.getElementById('agendar-data');
    dataInput.value = a.data || '';
    document.getElementById('agendar-pedido').value = a.pedido || a.pedidoNumero || '';
    document.getElementById('agendar-data-erro').classList.add('hidden');
    document.getElementById('agendar-data-spacer').style.display = 'block';

    // Endereço salvo tem precedência; sem ele, herda o mais usado do paciente.
    _agendarEndereco = a.endereco
        ? { ...a.endereco }
        : (typeof enderecoParaNovoAgendamento === 'function' ? enderecoParaNovoAgendamento(a.patientId, []) : null);
    _renderAgendarEndereco();
    setQuickPago('agendar', a.pago);

    checkAgendarData();
    document.getElementById('modal-agendar').classList.add('active');
}

// O editor de endereço vive dentro deste fluxo: fechar o agendamento o encerra
// junto, devolvendo os IDs-alvo de endereco.js ao formulário de registro.
function closeAgendarModal() {
    if (document.getElementById('modal-endereco-grupo')?.classList.contains('active')) _encerrarEnderecoGrupo();
    document.getElementById('modal-agendar').classList.remove('active');
    pendingAgendarId = null;
    _agendarEndereco = null;
}

// ─── ENDEREÇO DO AGENDAMENTO AVULSO ──────────────────────────────────────────
// Mesmo critério do Agendar Grupo: sem endereço completo não vira "Agendado".

let _agendarEndereco = null;

function _enderecoAgendarCompleto() {
    if (!_agendarEndereco) return false;
    // Sem local escolhido ainda falta decidir — não conta como completo.
    if (!_agendarEndereco.localAplicacao) return false;
    // Laboratório não é visita: no lugar do endereço, exige a unidade que aplica.
    if (typeof localAplicacaoExigeEndereco === 'function' &&
        !localAplicacaoExigeEndereco(_agendarEndereco.localAplicacao)) {
        if (typeof localAplicacaoExigeUnidade === 'function' &&
            localAplicacaoExigeUnidade(_agendarEndereco.localAplicacao)) return !!_agendarEndereco.unidadeId;
        return true;
    }
    if (typeof ENDERECO_OBRIGATORIOS === 'undefined') return true;
    return ENDERECO_OBRIGATORIOS.every(f => String(_agendarEndereco[f.campo] || '').trim());
}

function _renderAgendarEndereco() {
    const resumoEl = document.getElementById('agendar-endereco-resumo');
    const badgeEl  = document.getElementById('agendar-endereco-badge');
    const completo = _enderecoAgendarCompleto();

    if (resumoEl) {
        const texto = (typeof enderecoResumo === 'function') ? enderecoResumo(_agendarEndereco) : '';
        resumoEl.textContent = texto || 'Nenhum endereço informado';
        resumoEl.className = texto
            ? 'text-[11px] font-bold text-slate-600 truncate'
            : 'text-[11px] font-bold text-slate-400 italic truncate';
    }
    if (badgeEl) {
        badgeEl.textContent = completo ? 'Completo' : 'Incompleto';
        badgeEl.className = completo
            ? 'text-[9px] font-black px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200 whitespace-nowrap'
            : 'text-[9px] font-black px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200 whitespace-nowrap';
    }
}

function abrirEnderecoAgendar() {
    const a = appointments.find(x => x.id == pendingAgendarId);
    if (!a) return;
    abrirEditorEndereco({
        patId: a.patientId,
        endereco: _agendarEndereco,
        mensagem: 'Endereço da visita atualizado.',
        aoSalvar: end => {
            _agendarEndereco = end;
            _renderAgendarEndereco();
            checkAgendarData();
        }
    });
}

// Chama atenção para o box de endereço: pulso vermelho + rolagem até ele.
function _piscarEnderecoAgendar() {
    const box = document.getElementById('agendar-endereco-box');
    if (!box) return;
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const base = box.className.replace(/\s*(ring-2|ring-red-400|border-red-400|animate-pulse)\b/g, '');
    box.className = base + ' ring-2 ring-red-400 border-red-400 animate-pulse';
    setTimeout(() => { box.className = base; }, 1800);
}

function checkAgendarData() {
    const val = document.getElementById('agendar-data').value;
    const pedido = document.getElementById('agendar-pedido').value.trim();
    const btn = document.getElementById('btn-confirm-agendar');
    const semEndereco = !_enderecoAgendarCompleto();
    const ok = val.length > 0 && pedido.length > 0 && !semEndereco;
    // Continua clicável mesmo bloqueado: `disabled` engole o clique e o usuário
    // fica sem saber o motivo. confirmAgendar() valida e explica.
    btn.disabled = false;
    btn.className = ok
        ? 'flex-1 bg-blue-600 text-white font-black py-3 rounded-xl uppercase text-xs transition hover:bg-blue-700 cursor-pointer shadow-md'
        : 'flex-1 bg-blue-200 text-blue-400 font-black py-3 rounded-xl uppercase text-xs transition hover:bg-blue-300 cursor-pointer';
    btn.title = ok ? '' : (semEndereco ? _dicaEnderecoIncompleto(_agendarEndereco) : '');
}

// `title` não interpreta HTML — a mesma mensagem, sem as tags de destaque.
function _dicaEnderecoIncompleto(end) {
    const msg = (typeof enderecoIncompletoMsg === 'function') ? enderecoIncompletoMsg(end) : '';
    return msg.replace(/<[^>]+>/g, '');
}

function confirmAgendar() {
    const data = document.getElementById('agendar-data').value;
    const pedido = document.getElementById('agendar-pedido').value.trim();
    if (!pedido) {
        showNotification('Informe o número do pedido para agendar.', 'error');
        return;
    }
    if (!data) {
        document.getElementById('agendar-data-erro').classList.remove('hidden');
        document.getElementById('agendar-data-spacer').style.display = 'none';
        return;
    }
    // Endereço completo é pré-requisito do status Agendado.
    if (!_enderecoAgendarCompleto()) {
        showNotification(
            (typeof enderecoIncompletoMsg === 'function')
                ? enderecoIncompletoMsg(_agendarEndereco)
                : 'Endereço incompleto para agendar.',
            'error'
        );
        _piscarEnderecoAgendar();
        return;
    }
    if (holidays.includes(data)) {
        showNotification('Bloqueio: O dia selecionado está marcado como feriado.', 'error');
        return;
    }
    const dObj = new Date(data + 'T00:00:00');
    if (dObj.getDay() === 0) {
        showNotification('Bloqueio: Agendamentos aos domingos não são permitidos.', 'error');
        return;
    }
    if (!pendingAgendarId) return;
    const idx = appointments.findIndex(a => a.id == pendingAgendarId);
    if (idx > -1) {
        // Se o agendamento já tem lote vinculado, a reserva precisa de disponível > 0
        const apt = appointments[idx];
        if (apt.loteId && typeof getLoteDisponivelParaAgendamento === 'function') {
            const dispLivre = getLoteDisponivelParaAgendamento(Number(apt.loteId), Number(pendingAgendarId));
            if (dispLivre <= 0) {
                const loteRef = vaccineLots.find(l => l.id == apt.loteId);
                showNotification(`Não é possível reservar: o lote ${loteRef ? loteRef.numero : ''} está sem estoque disponível.`, 'error');
                return;
            }
        }
        const _auditBefore = { ...appointments[idx] };
        appointments[idx].status = 'Agendado';
        appointments[idx].data = data;
        appointments[idx].pedido = pedido;
        appointments[idx].endereco = { ..._agendarEndereco };
        if (typeof aplicarPagoAgendamento === 'function') {
            aplicarPagoAgendamento(appointments[idx], _quickPago.agendar, _auditBefore);
        }
        logAppointmentAudit(_auditBefore, appointments[idx]);
        pendingAgendarId = null;
        _agendarEndereco = null;
        document.getElementById('modal-agendar').classList.remove('active');
        if (typeof syncAppointmentMovement === 'function') syncAppointmentMovement(appointments[idx]);
        if (typeof syncAllLoteStatus === 'function') syncAllLoteStatus();
        saveAll(); renderCalendar(); renderTable(); renderDashboard();
        if (typeof refreshAlmoxIfActive === 'function') refreshAlmoxIfActive();
        if (typeof refreshOpenModals === 'function') refreshOpenModals();
        showNotification('Agendamento confirmado!', 'success');
        // Agendado não bloqueia por pagamento, mas o pendente precisa ser visto.
        if (!_quickPago.agendar) showNotification('Atenção: agendamento salvo como <b>não pago</b>.', 'info');
    }
}

// ─── CONCLUIR VACINAÇÃO ───────────────────────────────────────────────────────
function openConcluirModal(id) {
    if (!checkPerm('aplicar')) return;
    // Bloqueio: apenas usuários com permissão 'aplicar' podem aplicar
    if (!isCurrentUserAdmin() && !hasPerm('aplicar')) {
        showNotification('Apenas usuários com permissão de aplicador podem registrar aplicações.', 'error');
        return;
    }
    pendingConcluirId = id;
    const a = appointments.find(x => x.id == id);
    if (!a) return;
    const pat = patients.find(p => p.id == a.patientId);
    const vac = vaccines.find(v => v.id == a.vaccineId);

    document.getElementById('concluir-info').innerText = pat && vac ? `${pat.nome} — ${vac.nome} (${a.doseAtual})` : '';
    // Pré-preenche com o nome do usuário logado se ele tem permissão de aplicador
    const nomeAplicador = a.aplicador || (currentUser ? currentUser.nome : '');
    document.getElementById('concluir-aplicador').value = nomeAplicador;
    const dateEl = document.getElementById('concluir-data');
    if (dateEl) {
        dateEl.value = a.data ? a.data : new Date().toISOString().slice(0,10);
    }

    // Populate lote select with open lots for this vaccine
    const loteSel = document.getElementById('concluir-lote');
    loteSel.innerHTML = '<option value="">Selecione o lote...</option>';
    const openLots = vaccineLots.filter(l => l.vaccineId == a.vaccineId && (l.status === 'aberto' || l.id == a.loteId)).sort((a, b) => new Date(a.validade) - new Date(b.validade));
    openLots.forEach(l => {
        const disp = (typeof getLoteDisponivelParaAgendamento === 'function') ? getLoteDisponivelParaAgendamento(l.id, a.id) : null;
        const opt = document.createElement('option');
        opt.value = l.id;
        const dispStr = disp != null ? ` (disp: ${Math.max(0, disp)})` : '';
        opt.textContent = `Lote ${l.numero} — Val: ${l.validade.split('-').reverse().join('/')}${dispStr}`;
        opt.dataset.numero = l.numero;
        opt.dataset.validade = l.validade;
        if (disp != null && disp <= 0 && l.id != a.loteId) { opt.disabled = true; opt.textContent += ' — sem estoque'; }
        if (l.id == a.loteId) opt.selected = true;
        loteSel.appendChild(opt);
    });

    document.getElementById('concluir-lote-erro').classList.add('hidden');
    document.getElementById('concluir-lote-spacer').style.display = 'block';
    document.getElementById('concluir-pago-erro')?.classList.add('hidden');
    const _pagoSpacer = document.getElementById('concluir-pago-spacer');
    if (_pagoSpacer) _pagoSpacer.style.display = 'block';
    setQuickPago('concluir', a.pago);
    _concluirTaxaPaga = (typeof getTaxaPaga === 'function') ? getTaxaPaga(a.endereco) : false;
    _renderQuickTaxa('concluir', a);
    checkConcluirLote();
    document.getElementById('modal-concluir').classList.add('active');
}

function checkConcluirLote() {
    const sel = document.getElementById('concluir-lote');
    const loteVal = sel.value;
    const aplicadorVal = document.getElementById('concluir-aplicador').value.trim();
    const btn = document.getElementById('btn-confirm-concluir');
    const erroVencido = document.getElementById('concluir-lote-vencido-erro');

    // Verifica vencimento e proximidade com base na data do agendamento
    const avisoVencendo = document.getElementById('concluir-lote-vencendo-aviso');
    let loteVencido = false;
    let loteVencendo = false;
    if (loteVal) {
        const lot = vaccineLots.find(l => l.id == loteVal);
        if (lot && lot.validade) {
            const apmt = appointments.find(a => a.id == pendingConcluirId);
            const dateEl = document.getElementById('concluir-data');
            const refDate = (dateEl && dateEl.value) ? new Date(dateEl.value + 'T00:00:00') : (apmt && apmt.data ? new Date(apmt.data + 'T00:00:00') : new Date());
            refDate.setHours(0,0,0,0);
            const twoMonthsRef = new Date(refDate); twoMonthsRef.setMonth(twoMonthsRef.getMonth() + 2);
            const exp = new Date(lot.validade + 'T00:00:00');
            loteVencido  = exp < refDate;
            loteVencendo = !loteVencido && exp <= twoMonthsRef;
        }
    }

    if (loteVencido) {
        erroVencido.classList.remove('hidden');
        if (avisoVencendo) avisoVencendo.classList.add('hidden');
        sel.classList.add('border-red-400');
        btn.disabled = true;
        btn.className = 'flex-1 bg-red-200 text-red-400 font-black py-3 rounded-xl uppercase text-xs transition cursor-not-allowed';
        return;
    }

    erroVencido.classList.add('hidden');
    if (avisoVencendo) avisoVencendo.classList.toggle('hidden', !loteVencendo);
    sel.classList.remove('border-red-400');

    const ok = loteVal.length > 0 && aplicadorVal.length > 0;
    btn.disabled = !ok;
    btn.className = ok
        ? 'flex-1 bg-green-600 text-white font-black py-3 rounded-xl uppercase text-xs transition hover:bg-green-700 cursor-pointer shadow-md'
        : 'flex-1 bg-green-200 text-green-400 font-black py-3 rounded-xl uppercase text-xs transition cursor-not-allowed';
}

function confirmConcluir() {
    // Bloqueio no save: apenas aplicadores podem confirmar
    if (!isCurrentUserAdmin() && !hasPerm('aplicar')) {
        showNotification('Apenas usuários com permissão de aplicador podem registrar aplicações.', 'error');
        return;
    }
    const loteId = document.getElementById('concluir-lote').value;
    const aplicador = document.getElementById('concluir-aplicador').value.trim();
    const data = document.getElementById('concluir-data') ? document.getElementById('concluir-data').value : '';
    if (!data) {
        showNotification('Informe a data da aplicação.', 'error');
        return;
    }
    if (typeof holidays !== 'undefined' && holidays.includes(data)) {
        showNotification('Bloqueio: A data selecionada é feriado.', 'error');
        return;
    }
    const dObj = new Date(data + 'T00:00:00');
    if (dObj.getDay() === 0) {
        showNotification('Bloqueio: Aplicações aos domingos não são permitidas.', 'error');
        return;
    }
    if (!loteId || !aplicador) {
        document.getElementById('concluir-lote-erro').classList.remove('hidden');
        document.getElementById('concluir-lote-spacer').style.display = 'none';
        return;
    }
    // Aplicado exige pagamento registrado — a dose sai do estoque agora.
    if (!_quickPago.concluir) {
        document.getElementById('concluir-pago-erro')?.classList.remove('hidden');
        const spacer = document.getElementById('concluir-pago-spacer');
        if (spacer) spacer.style.display = 'none';
        showNotification('Marque o pagamento como <b>Pago</b> para registrar esta aplicação.', 'error');
        return;
    }
    if (!pendingConcluirId) return;
    // Taxa da visita segue a mesma regra: cobrada e pendente não conclui.
    const _appConcluir = appointments.find(a => a.id == pendingConcluirId);
    if (_appConcluir && typeof getTaxaDeslocamento === 'function'
        && getTaxaDeslocamento(_appConcluir.endereco) > 0 && !_concluirTaxaPaga) {
        showNotification('Marque a <b>taxa de deslocamento</b> como paga para registrar esta aplicação.', 'error');
        document.getElementById('concluir-taxa-btn')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
    }
    const idx = appointments.findIndex(a => a.id == pendingConcluirId);
    if (idx > -1) {
        // Bloqueio de estoque: o lote precisa de disponível > 0 (desconsiderando este próprio agendamento)
        if (typeof getLoteDisponivelParaAgendamento === 'function') {
            const dispLivre = getLoteDisponivelParaAgendamento(Number(loteId), Number(pendingConcluirId));
            if (dispLivre <= 0) {
                const loteRef = vaccineLots.find(l => l.id == loteId);
                showNotification(`Estoque insuficiente no lote ${loteRef ? loteRef.numero : ''}. Registre uma entrada ou selecione outro lote.`, 'error');
                return;
            }
        }
        const lot = vaccineLots.find(l => l.id == loteId);
        const _auditBefore = { ...appointments[idx] };
        appointments[idx].status = 'Aplicado';
        appointments[idx].loteId = Number(loteId);
        appointments[idx].lote = lot ? lot.numero.toUpperCase() : '';
        appointments[idx].aplicador = aplicador.toUpperCase();
        appointments[idx].data = data;
        if (typeof aplicarPagoAgendamento === 'function') {
            aplicarPagoAgendamento(appointments[idx], _quickPago.concluir, _auditBefore);
        }
        _salvarQuickTaxa(appointments[idx], _concluirTaxaPaga);
        logAppointmentAudit(_auditBefore, appointments[idx]);
        pendingConcluirId = null;
        document.getElementById('modal-concluir').classList.remove('active');
        if (typeof syncAppointmentMovement === 'function') syncAppointmentMovement(appointments[idx]);
        if (typeof syncAllLoteStatus === 'function') syncAllLoteStatus();
        saveAll(); renderCalendar(); renderTable(); renderDashboard();
        if (typeof refreshAlmoxIfActive === 'function') refreshAlmoxIfActive();
        if (typeof refreshOpenModals === 'function') refreshOpenModals();
        if (typeof updateExpiryBadge === 'function') updateExpiryBadge();
        showNotification('Vacinação concluída com sucesso!', 'success');
    }
}

// ─── KANBAN BOARD ─────────────────────────────────────────────────────────────
function switchTableView(view) {
    tableView = view;
    const vPlan = document.getElementById('view-planilhas');
    const vKan  = document.getElementById('view-kanban');
    const statusSel = document.getElementById('status-filter-wrap');
    if (typeof _closeAllFilterPops === 'function') _closeAllFilterPops();

    if (view === 'kanban') {
        if (vPlan) vPlan.classList.add('hidden');
        if (vKan)  { vKan.style.display = 'flex'; vKan.style.flexDirection = 'column'; }
        if (statusSel) statusSel.style.display = 'none';
        document.getElementById('table-pagination')?.remove();
        _kanbanPage = {};
        renderKanban();
    } else {
        if (vPlan) vPlan.classList.remove('hidden');
        if (vKan)  vKan.style.display = 'none';
        if (statusSel) statusSel.style.display = '';
        renderTable();
    }
}

function _getKanbanFiltered() {
    const _searchWrap = document.getElementById('wrap-search-agenda');
    const _searchOpen = _searchWrap && _searchWrap.style.maxWidth !== '0px' && _searchWrap.style.maxWidth !== '0';
    const search = _searchOpen ? normalizeStr(document.getElementById('filter-search-agenda').value) : '';
    const dateFilter = document.getElementById('filter-date-agenda').value;
    const monthFilter = document.getElementById('filter-month-agenda').value;
    const _rawVendAgenda = document.getElementById('filter-vendedor-agenda').value;
    const filterVendedor = _rawVendAgenda === '__mine__'
        ? (typeof currentUser !== 'undefined' && currentUser ? currentUser.nome : '')
        : _rawVendAgenda;
    const filterAplicador = document.getElementById('filter-aplicador-agenda').value;
    const todayObj = new Date();
    const todayStr = todayObj.toISOString().split('T')[0];
    const weekStart = getFilterWeekStart();
    const startOfWeek = weekStart.toISOString().split('T')[0];
    const endOfWeek = new Date(new Date(startOfWeek).setDate(new Date(startOfWeek).getDate()+6)).toISOString().split('T')[0];

    const patIdx = getPatientsIndex();
    const vacIdx = getVaccinesIndex();
    // Lido uma vez: dentro do filter isso era um getElementById por agendamento.
    const dayValue = document.getElementById('filter-day-agenda')?.value || todayStr;

    return appointments.filter(a => {
        // Filtra por data ANTES do lookup: descarta a maior parte sem tocar nos Maps.
        let matchDate = true;
        if (dateFilter === 'diario' || dateFilter === 'hoje') {
            matchDate = a.data === dayValue;
        } else if (dateFilter === 'semana') matchDate = a.data >= startOfWeek && a.data <= endOfWeek;
        else if (dateFilter === 'mes' && monthFilter) matchDate = a.data.startsWith(monthFilter);
        if (!matchDate) return false;

        const pat = patIdx.get(String(a.patientId));
        const vac = vacIdx.get(String(a.vaccineId));
        if (!pat || !vac) return false;
        // Vendedor/aplicador antes da busca: comparação de string simples é bem mais
        // barata que o normalizeStr() (NFD + 2 regex) exigido pelo matchSearch.
        if (filterVendedor && a.vendedor !== filterVendedor) return false;
        if (filterAplicador && a.aplicador !== filterAplicador) return false;
        if (!search) return true;
        return normalizeStr(pat.nome).includes(search) || normalizeStr(pat.cpf).includes(search);
    });
}

function _kanbanApptDateTime(app) {
    const time = app.hora ? app.hora.trim() : '00:00';
    return new Date(`${app.data}T${time}`);
}

function renderKanban() {
    renderKanbanGrouped();
}

function _kanbanDefaultSortDir(colKey) {
    return (colKey === 'Aplicado' || colKey === 'Perdido') ? 'desc' : 'asc';
}

function kanbanColGroupSortToggle(colKey) {
    const cur = _kanbanColGroupSort[colKey] || _kanbanDefaultSortDir(colKey);
    _kanbanColGroupSort[colKey] = cur === 'asc' ? 'desc' : 'asc';
    _kanbanPage[colKey] = 0;
    renderKanban();
}

function kanbanColToggleAllVaccines(colKey, btn) {
    const col = document.querySelector(`.kanban-col[data-col="${colKey}"]`);
    if (!col) return;
    const hidden = !_kanbanColVaccinesHidden[colKey];
    _kanbanColVaccinesHidden[colKey] = hidden;
    if (btn) btn.setAttribute('style', (btn.getAttribute('style') || '').replace(/background:[^;]*;border:1px solid [^;]*;/, hidden ? KANBAN_COLLAPSE_BTN_ACTIVE_STYLE : KANBAN_COLLAPSE_BTN_STYLE));
    const bodies = [...col.querySelectorAll('.kanban-group-card .p-2.flex.flex-col')];
    bodies.forEach(body => {
        body.style.display = hidden ? 'none' : '';
        const btn2 = body.closest('.kanban-group-card').querySelector('button[onclick*="kanbanGroupToggleVaccines"] i');
        if (btn2) {
            btn2.classList.toggle('fa-chevron-up', !hidden);
            btn2.classList.toggle('fa-chevron-down', hidden);
        }
    });
}

function kanbanPageGo(colKey, newPage) {
    _kanbanPage[colKey] = newPage;
    renderKanban();
}

function kanbanDragStart(event, id) {
    _kanbanDragId = id;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
    setTimeout(() => { event.target.style.opacity = '0.45'; event.target.style.transform = 'scale(0.97)'; }, 0);
}

function kanbanDragEnd(event) {
    event.target.style.opacity = '';
    event.target.style.transform = '';
    document.querySelectorAll('.kanban-col').forEach(c => {
        c.style.boxShadow = '';
        c.style.borderColor = '';
        c.style.background = '';
    });
}

function kanbanDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const col = event.currentTarget;
    col.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.35)';
}

function kanbanDragLeave(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
        event.currentTarget.style.boxShadow = '';
    }
}

function kanbanDrop(event, targetStatus) {
    event.preventDefault();
    event.currentTarget.style.boxShadow = '';

    if (_kanbanGroupDragPatId !== null) {
        const patId = _kanbanGroupDragPatId;
        const fromStatus = _kanbanGroupDragFromStatus;
        _kanbanGroupDragPatId = null;
        _kanbanGroupDragFromStatus = null;
        _handleGroupDrop(patId, fromStatus, targetStatus);
        return;
    }

    const id = _kanbanDragId;
    if (!id) return;
    const a = appointments.find(x => x.id == id);
    if (!a || a.status === targetStatus) return;

    if (targetStatus === 'Agendado') {
        if (!checkPerm('agendar')) return;
        openAgendarModal(id);
    } else if (targetStatus === 'Aplicado') {
        if (!checkPerm('aplicar')) return;
        openConcluirModal(id);
    } else if (targetStatus === 'Perdido') {
        openKanbanCancelModal(id);
    } else {
        const idx = appointments.findIndex(x => x.id == id);
        if (idx > -1) {
            const _auditBefore = { ...appointments[idx] };
            appointments[idx].status = targetStatus;
            logAppointmentAudit(_auditBefore, appointments[idx]);
            if (typeof syncAppointmentMovement === 'function') syncAppointmentMovement(appointments[idx]);
            if (typeof syncAllLoteStatus === 'function') syncAllLoteStatus();
            saveAll(); renderCalendar(); renderDashboard();
            renderKanban();
            if (typeof refreshAlmoxIfActive === 'function') refreshAlmoxIfActive();
            if (typeof refreshOpenModals === 'function') refreshOpenModals();
            showNotification('Status atualizado!', 'success');
        }
    }
    _kanbanDragId = null;
}

// ─── KANBAN CANCEL MODAL ──────────────────────────────────────────────────────
function openKanbanCancelModal(id) {
    _kanbanPendingCancelId = id;
    const a = appointments.find(x => x.id == id);
    if (!a) return;
    const pat = patients.find(p=>p.id==a.patientId);
    const vac = vaccines.find(v=>v.id==a.vaccineId);
    const info = document.getElementById('kanban-cancel-info');
    if (info) info.textContent = pat && vac ? `${pat.nome} — ${vac.nome} (${a.doseAtual})` : '';
    const sel = document.getElementById('kanban-cancel-reason');
    sel.innerHTML = '<option value="">Selecione o motivo...</option>' + cancelReasons.map(r=>`<option value="${r}">${r}</option>`).join('');
    document.getElementById('kanban-cancel-err').classList.add('hidden');
    const btnManage = document.getElementById('btn-kanban-manage-reasons');
    if (btnManage) btnManage.classList.toggle('hidden', !(isCurrentUserAdmin() || hasPerm('criar_agendamento')));
    document.getElementById('modal-kanban-cancel').classList.add('active');
}

function closeKanbanCancelModal() {
    _kanbanPendingCancelId = null;
    document.getElementById('modal-kanban-cancel').classList.remove('active');
}

function confirmKanbanCancel() {
    const reason = document.getElementById('kanban-cancel-reason').value;
    if (!reason) {
        document.getElementById('kanban-cancel-err').classList.remove('hidden');
        return;
    }
    const idx = appointments.findIndex(x => x.id == _kanbanPendingCancelId);
    if (idx > -1) {
        const _auditBefore = { ...appointments[idx] };
        appointments[idx].status = 'Perdido';
        appointments[idx].motivoCancelamento = reason;
        logAppointmentAudit(_auditBefore, appointments[idx]);
        closeKanbanCancelModal();
        if (typeof syncAppointmentMovement === 'function') syncAppointmentMovement(appointments[idx]);
        if (typeof syncAllLoteStatus === 'function') syncAllLoteStatus();
        saveAll(); renderCalendar(); renderDashboard();
        renderKanban();
        if (typeof refreshAlmoxIfActive === 'function') refreshAlmoxIfActive();
        if (typeof refreshOpenModals === 'function') refreshOpenModals();
        showNotification('Registro marcado como perdido.', 'info');
    }
}

function renderKanbanGrouped() {
    const board = document.getElementById('kanban-board');
    if (!board) return;
    _populateTableColabDropdowns();
    const todayStr = new Date().toISOString().split('T')[0];
    const allFiltered = _getKanbanFiltered();
    const _dark = document.body.classList.contains('dark-mode');
    const _dl = (light, dark) => _dark ? dark : light;

    const columns = [
        { key: 'Nova oportunidade', label: 'Nova Oportunidade', icon: 'fa-star',
          color: '#64748b', light: _dl('#f8fafc','#1e293b'), border: _dl('#cbd5e1','#334155'), text: _dl('#475569','#94a3b8'), gradFrom: '#475569', gradTo: '#334155' },
        { key: 'Em negociação', label: 'Em Negociação', icon: 'fa-comments',
          color: '#0891b2', light: _dl('#ecfeff','#0c2535'), border: _dl('#a5f3fc','#164e63'), text: _dl('#0e7490','#67e8f9'), gradFrom: '#0891b2', gradTo: '#0e7490' },
        { key: 'Agendado', label: 'Agendado', icon: 'fa-calendar-check',
          color: '#2563eb', light: _dl('#eff6ff','#0f1f3d'), border: _dl('#bfdbfe','#1e3a8a'), text: _dl('#1d4ed8','#93c5fd'), gradFrom: '#2563eb', gradTo: '#1d4ed8' },
        { key: 'Aplicado', label: 'Aplicado', icon: 'fa-syringe',
          color: '#16a34a', light: _dl('#f0fdf4','#052e16'), border: _dl('#bbf7d0','#166534'), text: _dl('#15803d','#4ade80'), gradFrom: '#16a34a', gradTo: '#15803d' },
        { key: 'Perdido', label: 'Perdido', icon: 'fa-ban',
          color: '#dc2626', light: _dl('#fff1f2','#2d0a0a'), border: _dl('#fecdd3','#7f1d1d'), text: _dl('#b91c1c','#fca5a5'), gradFrom: '#dc2626', gradTo: '#b91c1c' },
    ];

    board.innerHTML = columns.map(col => {
        const colApps = allFiltered
            .filter(a => a.status === col.key)
            .sort((a, b) => _kanbanApptDateTime(a) - _kanbanApptDateTime(b));

        const byPat = {};
        colApps.forEach(a => {
            if (!byPat[a.patientId]) byPat[a.patientId] = [];
            byPat[a.patientId].push(a);
        });
        const groups = Object.entries(byPat);
        const _gSortDir = _kanbanColGroupSort[col.key] || _kanbanDefaultSortDir(col.key);
        groups.sort(([, appsA], [, appsB]) => {
            let dtA, dtB;
            if (_gSortDir === 'desc') {
                dtA = appsA.reduce((max, app) => Math.max(max, _kanbanApptDateTime(app)), -Infinity);
                dtB = appsB.reduce((max, app) => Math.max(max, _kanbanApptDateTime(app)), -Infinity);
                return dtB - dtA;
            } else {
                const firstA = appsA.reduce((minApp, app) => _kanbanApptDateTime(app) < _kanbanApptDateTime(minApp) ? app : minApp, appsA[0]);
                const firstB = appsB.reduce((minApp, app) => _kanbanApptDateTime(app) < _kanbanApptDateTime(minApp) ? app : minApp, appsB[0]);
                const diff = _kanbanApptDateTime(firstA) - _kanbanApptDateTime(firstB);
                if (diff !== 0) return diff;
                const patA = getPatientById(appsA[0].patientId);
                const patB = getPatientById(appsB[0].patientId);
                const nameA = patA ? String(patA.nome || '') : '';
                const nameB = patB ? String(patB.nome || '') : '';
                return nameA.localeCompare(nameB, 'pt-BR', { sensitivity: 'base' });
            }
        });
        const totalApps = colApps.length;
        const totalGroups = groups.length;

        const PAGE_SIZE = 6;
        const totalPages = Math.max(1, Math.ceil(groups.length / PAGE_SIZE));
        if (_kanbanPage[col.key] === undefined) _kanbanPage[col.key] = 0;
        if (_kanbanPage[col.key] >= totalPages) _kanbanPage[col.key] = totalPages - 1;
        const page = _kanbanPage[col.key];
        const pageGroups = groups.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

        const colKeyEsc = col.key.replace(/'/g, "\\'");
        const colVaccinesHidden = !!_kanbanColVaccinesHidden[col.key];

        const PURPLE = _dark
            ? { color: '#7c3aed', border: '#4c1d95', light: '#1e1535', text: '#c4b5fd' }
            : { color: '#7c3aed', border: '#ddd6fe', light: '#faf5ff', text: '#6d28d9' };
        const CYAN = _dark
            ? { color: '#06b6d4', border: '#155e75', light: '#083344', text: '#67e8f9' }
            : { color: '#06b6d4', border: '#a5f3fc', light: '#ecfeff', text: '#0e7490' };

        const groupsHtml = pageGroups.map(([patId, apps]) => {
            const pat = getPatientById(patId);
            if (!pat) return '';
            // Total da visita: soma as doses e a taxa de deslocamento, que já vem
            // gravada em uma única vacina do grupo (nunca replicada nas irmãs).
            const totalVal = apps.reduce((s, a) => s
                + (parseBRL(String(a.valorAplicado || '0')) || 0)
                + (typeof getTaxaDeslocamento === 'function' ? getTaxaDeslocamento(a.endereco) : 0), 0);
            const age = pat.dtNasc ? getAgeDisplay(pat.dtNasc) : '';
            const waLink = `https://wa.me/55${formatWa(pat.contato || '')}`;
            const hasDelayed = apps.some(a => a.data < todayStr && a.status === 'Agendado');
            const hasToday = apps.some(a => a.data === todayStr && a.status === 'Agendado');
            const hasSemLote = col.key === 'Agendado' && apps.some(a => !a.loteId);
            const hasContactAlert = (typeof patientContacts !== 'undefined' && typeof _isContactDue === 'function')
                && patientContacts.some(c => c.patientId == patId && _isContactDue(c));
            const allOutroLocal = col.key === 'Perdido' && apps.length > 0 && apps.every(a => a.aplicadaOutroLocal);
            const allOutraVacina = col.key === 'Perdido' && apps.length > 0 && apps.every(a => a.outraVacina);
            const groupCol = allOutroLocal ? PURPLE : allOutraVacina ? CYAN : col;

            const minicardsHtml = apps.map(a => {
                const vac = getVaccineById(a.vaccineId);
                if (!vac) return '';
                const isDelayed = a.data < todayStr && a.status === 'Agendado';
                const isToday = a.data === todayStr && a.status === 'Agendado';
                const isOutroLocal = col.key === 'Perdido' && a.aplicadaOutroLocal;
                const isOutraVacina = col.key === 'Perdido' && a.outraVacina;
                const semLote = col.key === 'Agendado' && !a.loteId;
                const miniCol = isOutroLocal ? PURPLE : isOutraVacina ? CYAN : col;
                const dateLabel = a.data ? a.data.split('-').reverse().join('/') : '—';
                const miniBg = semLote ? _dl('#fdf2f8','#3b0a25') : isDelayed ? _dl('#fef2f2','#2d0a0a') : isToday ? _dl('#fffbeb','#1c1500') : _dl('#fff','#1e293b');
                const miniBorder = semLote ? _dl('#fbcfe8','#831843') : isDelayed ? _dl('#fecaca','#7f1d1d') : isToday ? _dl('#fde68a','#78350f') : miniCol.border;
                const miniAccent = semLote ? '#db2777' : isDelayed ? '#dc2626' : isToday ? '#f59e0b' : miniCol.color;
                return `<div
                    draggable="true"
                    ondragstart="kanbanMiniInGroupDragStart(event,${a.id})"
                    ondragend="kanbanDragEnd(event)"
                    onclick="kanbanMiniInGroupClick(event,${a.id})"
                    class="flex items-center gap-2 rounded-lg px-2 py-1.5 border cursor-pointer hover:shadow-sm transition-all select-none"
                    style="background:${miniBg};border-color:${miniBorder};border-left:3px solid ${miniAccent};">
                    <i class="fas fa-syringe text-[9px] shrink-0" style="color:${miniCol.text};"></i>
                    <div class="flex-1 min-w-0">
                        <p class="text-[10px] font-black truncate leading-tight" style="color:${_dl('#172554','#f1f5f9')}">${vac.nome}</p>
                        <p class="text-[9px] font-bold" style="color:${_dl('#94a3b8','#475569')}">${a.doseAtual} · ${dateLabel}${a.hora ? ' ' + a.hora : ''}</p>
                    </div>
                     ${a.importedCPNI
                        ? `<span title="Importado do CPNI" class="text-[9px] font-black shrink-0 whitespace-nowrap inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full" style="color:${_dl('#059669','#34d399')};background:${_dl('#d1fae5','#052e1c')};border:1px solid ${_dl('#a7f3d0','#065f46')}"><i class="fas fa-file-import"></i></span>`
                        : (a.valorAplicado ? `<span class="text-[9px] font-black shrink-0 whitespace-nowrap" style="color:${_dl('#059669','#34d399')}">R$ ${a.valorAplicado}</span>` : '')}
                    ${semLote ? `<span title="Sem lote reservado" class="text-[8px] font-black px-1 py-0.5 rounded-full shrink-0 inline-flex items-center gap-0.5" style="color:${_dl('#9d174d','#f9a8d4')};background:${_dl('#fce7f3','#3b0a25')};border:1px solid ${_dl('#fbcfe8','#831843')}"><i class="fas fa-exclamation-triangle"></i> Sem lote</span>` : ''}
                    ${isDelayed ? `<span class="text-[8px] font-black px-1 py-0.5 rounded-full shrink-0" style="color:${_dl('#991b1b','#fca5a5')};background:${_dl('#fee2e2','#450a0a')};border:1px solid ${_dl('#fecaca','#7f1d1d')}">!</span>` : ''}
                    ${isToday ? `<span class="text-[8px] font-black px-1 py-0.5 rounded-full shrink-0" style="color:${_dl('#92400e','#fbbf24')};background:${_dl('#fffbeb','#1c1500')};border:1px solid ${_dl('#fde68a','#78350f')}">Hoje</span>` : ''}
                </div>`;
            }).join('');

            return `<div
                draggable="true"
                ondragstart="kanbanGroupDragStart(event,${patId},'${colKeyEsc}')"
                ondragend="kanbanGroupDragEnd(event)"
                data-pat="${patId}" data-status="${colKeyEsc}"
                class="kanban-group-card rounded-xl shadow-sm overflow-hidden hover:shadow-lg transition-all duration-200 cursor-grab active:cursor-grabbing select-none"
                style="border:2px solid ${hasSemLote ? _dl('#fbcfe8','#831843') : hasDelayed ? _dl('#fecaca','#7f1d1d') : hasToday ? _dl('#fde68a','#78350f') : groupCol.border};background:${_dl('#fff','#1e293b')};">
                <div class="px-3 pt-2 pb-1.5 flex flex-col gap-1.5" style="background:${groupCol.light};border-bottom:1px solid ${groupCol.border};">
                    <div class="flex items-center gap-2">
                        <div class="h-7 w-7 rounded-lg flex items-center justify-center shrink-0 font-black text-xs text-white" style="background:${groupCol.color};">
                            ${(pat.nome || '?')[0].toUpperCase()}
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="font-black text-[11px] leading-tight truncate" style="color:${_dl('#172554','#f1f5f9')}">${pat.nome}</p>
                            <p class="text-[9px]" style="color:${_dl('#94a3b8','#475569')}">${pat.cpf}${age ? ' · ' + age : ''}</p>
                        </div>
                        ${hasContactAlert ? `<button onclick="event.stopPropagation();viewPatientHistory(${patId});if(typeof switchProntuarioTab==='function')switchProntuarioTab('contato');" title="Contato agendado em alerta" class="h-6 w-6 rounded-md flex items-center justify-center transition text-xs shrink-0 animate-pulse" style="background:${_dl('#fee2e2','#450a0a')};color:${_dl('#dc2626','#f87171')}"><i class="fas fa-bell"></i></button>` : ''}
                        <span class="kb-mob-move shrink-0"></span>
                        <i class="fas fa-grip-vertical text-xs shrink-0" style="color:${_dl('#cbd5e1','#334155')}"></i>
                    </div>
                    <div class="flex items-center gap-2">
                        <button onclick="event.stopPropagation();kanbanGroupToggleVaccines(this)" title="Mostrar/ocultar vacinas"
                            class="h-6 w-6 rounded-md flex items-center justify-center transition text-xs shrink-0" style="background:${_dl('#f1f5f9','#1e293b')};color:${_dl('#64748b','#94a3b8')}"><i class="fas ${colVaccinesHidden ? 'fa-chevron-down' : 'fa-chevron-up'}"></i></button>
                        <div class="flex-1"></div>
                        <div class="text-right">
                            <div class="text-[8px] uppercase tracking-wide" style="color:${_dl('#94a3b8','#475569')}">Ticket</div>
                            <div class="text-[10px] font-black" style="color:${_dl('#059669','#34d399')}">${formatCurrency(totalVal)}</div>
                        </div>
                        <div class="h-5 w-5 rounded-full flex items-center justify-center font-black text-[9px] text-white" style="background:${groupCol.color};" title="${apps.length} vacina(s)">${apps.length}</div>
                        <a href="${waLink}" target="_blank" onclick="event.stopPropagation()"
                            class="h-6 w-6 rounded-md text-green-600 hover:bg-green-500 hover:text-white flex items-center justify-center transition text-xs shrink-0" style="background:${_dl('#f0fdf4','#052e16')}"
                            title="WhatsApp"><i class="fab fa-whatsapp"></i></a>
                        <button onclick="event.stopPropagation();viewPatientHistory(${patId})" title="Ver prontuário vacinal"
                            class="h-6 w-6 rounded-md flex items-center justify-center transition text-xs shrink-0" style="background:${_dl('#e0e7ff','#1e1b4b')};color:${_dl('#4f46e5','#818cf8')}"><i class="fas fa-clipboard-list"></i></button>
                        ${(col.key === 'Nova oportunidade' || col.key === 'Em negociação') ? permBtn('agendar', `<button onclick="event.stopPropagation();openEditarOportunidadeModal(${patId},appointments.filter(a=>String(a.patientId)==='${patId}'&&a.status==='${colKeyEsc}'),'${colKeyEsc}')" title="Editar ${col.key === 'Em negociação' ? 'negociação' : 'oportunidades'} do grupo"
                            class="h-6 w-6 rounded-md flex items-center justify-center transition text-xs shrink-0" style="background:${col.light};color:${col.text}"><i class="fas fa-pencil-alt"></i></button>`) : ''}
                        ${col.key === 'Agendado' ? permBtn('agendar', `<button onclick="event.stopPropagation();openAgendarGrupoModal(${patId},'Agendado',appointments.filter(a=>String(a.patientId)==='${patId}'&&a.status==='Agendado'))" title="Editar agendamentos do grupo"
                            class="h-6 w-6 rounded-md flex items-center justify-center transition text-xs shrink-0" style="background:${_dl('#dbeafe','#1e3a5f')};color:${_dl('#1e3a8a','#93c5fd')}"><i class="fas fa-pencil-alt"></i></button>`) : ''}
                        ${col.key === 'Aplicado' ? permBtn('aplicar', `<button onclick="event.stopPropagation();openAplicarGrupoModal(${patId},'Aplicado',appointments.filter(a=>String(a.patientId)==='${patId}'&&a.status==='Aplicado'))" title="Editar aplicações do grupo"
                            class="h-6 w-6 rounded-md flex items-center justify-center transition text-xs shrink-0" style="background:${_dl('#dcfce7','#052e16')};color:${_dl('#15803d','#4ade80')}"><i class="fas fa-pencil-alt"></i></button>`) : ''}
                    </div>
                </div>
                <div class="p-2 flex flex-col gap-1.5" style="background:${_dl('#fff','#1e293b')};${colVaccinesHidden ? 'display:none' : ''}">${minicardsHtml}</div>
            </div>`;
        }).join('');

        const emptyHtml = `<div class="flex flex-col items-center justify-center py-10 text-center opacity-60">
            <div class="h-12 w-12 rounded-full flex items-center justify-center mb-2" style="background:${col.light};">
                <i class="fas ${col.icon} text-lg" style="color:${col.color};"></i>
            </div>
            <p class="text-[11px] font-black uppercase tracking-wider" style="color:${col.text};">Sem registros</p>
        </div>`;

        const collapseBtnStyle = KANBAN_COLLAPSE_BTN_STYLE;
        const collapseBtnActiveStyle = KANBAN_COLLAPSE_BTN_ACTIVE_STYLE;
        const gSortIcon = _gSortDir === 'desc' ? 'fa-sort-amount-down-alt' : 'fa-sort-amount-up-alt';
        const gSortTitle = _gSortDir === 'desc' ? 'Maior→menor (última vacina) — clique para inverter' : 'Menor→maior (1ª vacina) — clique para inverter';
        const gSortBtnStyle = _gSortDir === 'desc' ? collapseBtnActiveStyle : collapseBtnStyle;
        const gColBodyBg  = _dark ? '#0f172a' : 'rgba(255,255,255,0.70)';
        const gPagBg      = _dark ? 'linear-gradient(180deg,#1e293b,#182131)' : 'linear-gradient(180deg,#ffffff,#f8fafc)';
        const gPagBorder  = _dark ? '#334155' : '#e2e8f0';
        const gPagTxt     = _dark ? '#94a3b8' : '#64748b';
        const gColBorder  = _dark ? '#334155' : 'rgba(203,213,225,0.60)';
        const gPagBtnBg   = _dark ? '#0f172a' : '#ffffff';

        const pagBtn = (dir, disabled) => `
            <button onclick="kanbanPageGo('${colKeyEsc}',${page + dir})" ${disabled ? 'disabled' : ''}
                class="h-6 w-6 rounded-lg flex items-center justify-center border transition disabled:opacity-30 disabled:cursor-not-allowed hover:shadow-sm active:scale-90"
                style="background:${gPagBtnBg};border-color:${gPagBorder};color:${disabled ? gPagTxt : col.color}">
                <i class="fas fa-chevron-${dir < 0 ? 'left' : 'right'} text-[10px]"></i>
            </button>`;

        const paginationHtml = (totalPages > 1) ? `
            <div class="flex items-center justify-between gap-2 px-3 py-1.5 shrink-0" style="background:${gPagBg};border-bottom:1px solid ${gPagBorder}">
                ${pagBtn(-1, page === 0)}
                <span class="flex items-center gap-1.5 leading-none">
                    <span class="text-[11px] font-black px-2 py-1 rounded-full" style="background:${col.light};color:${col.text};border:1px solid ${col.border}">${page + 1}/${totalPages}</span>
                    <span class="flex items-center gap-1 text-[11px] font-black px-2 py-1 rounded-full" style="background:${gPagBtnBg};color:${gPagTxt};border:1px solid ${gPagBorder}" title="${totalGroups} paciente(s)">
                        <i class="fas fa-user text-[10px]" style="opacity:0.85"></i>${totalGroups}
                    </span>
                    <span class="flex items-center gap-1 text-[11px] font-black px-2 py-1 rounded-full" style="background:${gPagBtnBg};color:${gPagTxt};border:1px solid ${gPagBorder}" title="${totalApps} vacina(s)">
                        <i class="fas fa-syringe text-[10px]" style="opacity:0.85"></i>${totalApps}
                    </span>
                </span>
                ${pagBtn(1, page >= totalPages - 1)}
            </div>` : '';

        return `<div class="kanban-col flex flex-col rounded-2xl overflow-hidden shadow-md transition-all duration-200" style="height:100%;flex:1 1 0;min-width:240px;border:1px solid ${gColBorder};"
            ondragover="kanbanDragOver(event)"
            ondragleave="kanbanDragLeave(event)"
            ondrop="kanbanDrop(event,'${colKeyEsc}')"
            data-col="${col.key}">
            <div class="px-4 py-3 flex items-center justify-between shrink-0 select-none" style="background:linear-gradient(135deg,${col.gradFrom},${col.gradTo});">
                <div class="flex items-center gap-2">
                    <div class="h-7 w-7 bg-white/20 rounded-lg flex items-center justify-center border border-white/30">
                        <i class="fas ${col.icon} text-white text-xs"></i>
                    </div>
                    <span class="font-black text-white text-xs uppercase tracking-wider">${col.label}</span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="h-6 min-w-6 px-1.5 bg-white/25 text-white font-black text-xs rounded-full flex items-center justify-center border border-white/30">${totalGroups}</span>
                    <button onclick="kanbanColToggleAllVaccines('${colKeyEsc}',this)" title="Mostrar/ocultar vacinas de todos os grupos"
                        class="h-6 w-6 rounded-md flex items-center justify-center transition text-white hover:scale-110 active:scale-95"
                        style="${colVaccinesHidden ? collapseBtnActiveStyle : collapseBtnStyle}">
                        <i class="fas fa-list text-[10px]"></i>
                    </button>
                    <button onclick="kanbanColGroupSortToggle('${colKeyEsc}')" title="${gSortTitle}"
                        class="h-6 w-6 rounded-md flex items-center justify-center transition text-white hover:scale-110 active:scale-95"
                        style="${gSortBtnStyle}">
                        <i class="fas ${gSortIcon} text-[10px]"></i>
                    </button>
                </div>
            </div>
            ${paginationHtml}
            <div class="kanban-col-body flex-1 overflow-y-auto p-3 space-y-3" style="background:${gColBodyBg}">
                ${pageGroups.length ? groupsHtml : emptyHtml}
            </div>
        </div>`;
    }).join('');
}

function kanbanGroupDragStart(event, patId, fromStatus) {
    _kanbanGroupDragPatId = String(patId);
    _kanbanGroupDragFromStatus = fromStatus;
    _kanbanDragId = null;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', 'group:' + patId + ':' + fromStatus);
    setTimeout(() => {
        const card = event.target.closest('.kanban-group-card');
        if (card) { card.style.opacity = '0.45'; card.style.transform = 'scale(0.97)'; }
    }, 0);
}

function kanbanGroupToggleVaccines(btn) {
    const card = btn.closest('.kanban-group-card');
    if (!card) return;
    const body = card.querySelector('.p-2.flex.flex-col');
    if (!body) return;
    const icon = btn.querySelector('i');
    const hidden = body.style.display === 'none';
    body.style.display = hidden ? '' : 'none';
    icon.classList.toggle('fa-chevron-up', hidden);
    icon.classList.toggle('fa-chevron-down', !hidden);
}

function kanbanGroupDragEnd(event) {
    const card = event.target.closest ? event.target.closest('.kanban-group-card') : null;
    if (card) { card.style.opacity = ''; card.style.transform = ''; }
    document.querySelectorAll('.kanban-col').forEach(c => {
        c.style.boxShadow = '';
        c.style.borderColor = '';
        c.style.background = '';
    });
}

let _miniGroupDragging = false;

function kanbanMiniInGroupDragStart(event, id) {
    _kanbanDragId = id;
    _kanbanGroupDragPatId = null;
    _kanbanGroupDragFromStatus = null;
    _miniGroupDragging = true;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(id));
    event.stopPropagation();
    setTimeout(() => { event.target.style.opacity = '0.45'; }, 0);
}

function kanbanMiniInGroupClick(event, id) {
    if (_miniGroupDragging) { _miniGroupDragging = false; return; }
    event.stopPropagation();
    viewRecord(id);
}

function _handleGroupDrop(patId, fromStatus, targetStatus) {
    if (!patId || fromStatus === targetStatus) return;
    // Registros importados do CPNI são somente-leitura e sempre "Aplicado": nunca participam de ações de grupo/drag.
    const groupApps = appointments.filter(a => a.patientId == patId && a.status === fromStatus && !a.importedCPNI);
    if (!groupApps.length) return;

    if (targetStatus === 'Aplicado') {
        if (!checkPerm('aplicar')) return;
        openAplicarGrupoModal(patId, fromStatus, groupApps);
        return;
    }
    if (targetStatus === 'Agendado') {
        if (!checkPerm('agendar')) return;
        openAgendarGrupoModal(patId, fromStatus, groupApps);
        return;
    }
    if (targetStatus === 'Perdido') {
        openMoverGrupoPerdidoModal(patId, fromStatus, groupApps);
        return;
    }

    const _auditBefore = auditSnapshotAppointments(groupApps.map(a => a.id));
    groupApps.forEach(a => {
        const idx = appointments.findIndex(x => x.id == a.id);
        if (idx > -1) {
            appointments[idx].status = targetStatus;
            if (typeof syncAppointmentMovement === 'function') syncAppointmentMovement(appointments[idx]);
        }
    });
    logAppointmentAuditMany(_auditBefore);
    if (typeof syncAllLoteStatus === 'function') syncAllLoteStatus();
    saveAll(); renderCalendar(); renderDashboard();
    renderKanban();
    if (typeof refreshAlmoxIfActive === 'function') refreshAlmoxIfActive();
    if (typeof refreshOpenModals === 'function') refreshOpenModals();
    showNotification(`${groupApps.length} agendamento(s) movido(s) para ${targetStatus}!`, 'success');
}

// Legenda de doses disponíveis de uma vacina, exibida em cada linha do modal.
// Existe para suprir a informação de estoque a quem não pode abrir o select de lote.
function _grupoEstoqueLegenda(vaccineId, ignoreAppointmentId) {
    if (!vaccineId || typeof getLoteDisponivelParaAgendamento !== 'function') return '';
    const openLots = (vaccineLots || []).filter(l => l.vaccineId == vaccineId && l.status === 'aberto');
    const disp = openLots.reduce((s, l) => s + Math.max(0, getLoteDisponivelParaAgendamento(l.id, ignoreAppointmentId)), 0);
    const cor = disp > 0 ? 'text-emerald-600' : 'text-red-600';
    const txt = disp > 0
        ? `<b>${disp}</b> dose${disp !== 1 ? 's' : ''} disponíve${disp !== 1 ? 'is' : 'l'} em ${openLots.length} lote${openLots.length !== 1 ? 's' : ''}`
        : 'Sem doses disponíveis em estoque';
    return `<p class="text-[9px] font-bold ${cor} mt-0.5"><i class="fas fa-boxes-stacked mr-1"></i>${txt}</p>`;
}

// ─── MODAL: AGENDAR GRUPO ─────────────────────────────────────────────────────

function openAgendarGrupoModal(patId, fromStatus, groupApps) {
    groupApps = groupApps.filter(a => !a.importedCPNI); // registros importados do CPNI não entram em ações de grupo
    _agendarGrupoPending = {
        patId: String(patId),
        fromStatus,
        apps: groupApps.map(a => ({
            id: a.id,
            vaccineId: a.vaccineId,
            dose: a.doseAtual,
            data: a.data,
            hora: a.hora || '',
            valorAplicado: a.valorAplicado,
            // Base do desconto linear do total: o valor cheio original, se a
            // vacina já tinha desconto, senão o valor atual.
            valorCheio: a.valorCheio || a.valorAplicado,
            loteId: a.loteId,
            pedido: a.pedido || a.pedidoNumero || '',
            pago: !!a.pago
        }))
    };
    _agendarGrupoRemovedIds = new Set();
    _agendarGrupoRemovePending = null;

    const pat = patients.find(p => p.id == patId);
    const titleEl = document.getElementById('agendar-grupo-paciente');
    if (titleEl) titleEl.textContent = pat ? pat.nome : '—';

    const fromEl = document.getElementById('agendar-grupo-from-status');
    if (fromEl) fromEl.textContent = fromStatus;

    const countEl = document.getElementById('agendar-grupo-count');
    if (countEl) countEl.textContent = groupApps.length + ' vacina' + (groupApps.length !== 1 ? 's' : '');

    // Endereço já existente em qualquer vacina do grupo vira o ponto de partida;
    // sem nenhum, cai no histórico do paciente (mesma regra do formulário).
    _agendarGrupoPending.endereco =
        (typeof enderecoParaNovoAgendamento === 'function')
            ? enderecoParaNovoAgendamento(patId, groupApps)
            : null;

    _renderAgendarGrupoEndereco();
    cancelarEdicaoTotalGrupo('agendar-grupo');
    _renderAgendarGrupoLines();
    document.getElementById('modal-agendar-grupo').classList.add('active');
}

// ─── ENDEREÇO DO GRUPO ───────────────────────────────────────────────────────
// Um único endereço para todas as vacinas: é a mesma visita. Preencher aqui
// grava em todas ao confirmar.

function _enderecoGrupoCompleto() {
    const end = _agendarGrupoPending && _agendarGrupoPending.endereco;
    if (!end) return false;
    // Sem local escolhido ainda falta decidir — não conta como completo.
    if (!end.localAplicacao) return false;
    // Laboratório não exige endereço, mas exige a unidade de coleta que aplica.
    if (typeof localAplicacaoExigeEndereco === 'function' &&
        !localAplicacaoExigeEndereco(end.localAplicacao)) {
        if (typeof localAplicacaoExigeUnidade === 'function' &&
            localAplicacaoExigeUnidade(end.localAplicacao)) return !!end.unidadeId;
        return true;
    }
    if (typeof ENDERECO_OBRIGATORIOS === 'undefined') return true;
    return ENDERECO_OBRIGATORIOS.every(f => String(end[f.campo] || '').trim());
}

function _renderAgendarGrupoEndereco() {
    const resumoEl = document.getElementById('agendar-grupo-endereco-resumo');
    const badgeEl  = document.getElementById('agendar-grupo-endereco-badge');
    const end = _agendarGrupoPending && _agendarGrupoPending.endereco;
    const completo = _enderecoGrupoCompleto();

    if (resumoEl) {
        const texto = (typeof enderecoResumo === 'function') ? enderecoResumo(end) : '';
        resumoEl.textContent = texto || 'Nenhum endereço informado';
        resumoEl.className = texto
            ? 'text-[11px] font-bold text-slate-600 truncate'
            : 'text-[11px] font-bold text-slate-400 italic truncate';
    }
    if (badgeEl) {
        badgeEl.textContent = completo ? 'Completo' : 'Incompleto';
        badgeEl.className = completo
            ? 'text-[9px] font-black px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200 whitespace-nowrap'
            : 'text-[9px] font-black px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200 whitespace-nowrap';
    }
}

// Editor de endereço compartilhado (modal-endereco-grupo). Cada fluxo que o abre
// declara de onde vem o endereço e o que fazer ao salvar; o modal em si não sabe
// nada sobre grupo ou agendamento avulso.
let _enderecoEditor = null;

// `status` diz para que status o endereço está sendo preenchido: só "Agendado"
// exige Local da Aplicação (e, conforme o local, o endereço). Os fluxos de
// agendamento não passam nada e ficam no padrão.
function abrirEditorEndereco({ patId, endereco, titulo, aoSalvar, mensagem, status }) {
    // Enquanto este modal está aberto ele é o dono dos IDs-alvo de endereco.js.
    setEnderecoPrefixo('grpend');
    setEnderecoPacienteId(patId);
    _enderecoEditor = { aoSalvar, mensagem, status: status || 'Agendado' };

    const pat = patients.find(p => p.id == patId);
    const nomeEl = document.getElementById('endereco-grupo-paciente');
    if (nomeEl) nomeEl.textContent = titulo || (pat ? pat.nome : '—');

    preencherEnderecoForm(endereco);
    aplicarPadraoEndereco();
    document.getElementById('modal-endereco-grupo').classList.add('active');
    // O cursor vai para o próximo campo que ainda precisa de humano: sem local
    // escolhido, a escolha; no laboratório, a unidade (o logradouro está oculto).
    setTimeout(() => {
        const local = (typeof getLocalAplicacao === 'function') ? getLocalAplicacao() : '';
        let alvo = 'grpend-logradouro';
        if (!local) alvo = 'grpend-local-btn';
        else if (typeof localAplicacaoExigeUnidade === 'function' && localAplicacaoExigeUnidade(local)) alvo = 'grpend-unidade';
        document.getElementById(alvo)?.focus();
    }, 60);
}

// Devolve o controle dos IDs ao formulário de registro.
function _encerrarEnderecoGrupo() {
    limparEnderecoForm();
    document.getElementById('modal-endereco-grupo').classList.remove('active');
    setEnderecoPrefixo('reg');
    setEnderecoPacienteId(null);
    _enderecoEditor = null;
}

function fecharEnderecoGrupo() {
    _encerrarEnderecoGrupo();
}

function salvarEnderecoGrupo() {
    if (!_enderecoEditor) { _encerrarEnderecoGrupo(); return; }
    // Mesma regra do formulário de registro: a exigência vale para o status
    // em que o endereço está sendo preenchido — fora de "Agendado", nada é obrigatório.
    if (typeof validarEnderecoObrigatorio === 'function'
        && !validarEnderecoObrigatorio(_enderecoEditor.status)) return;
    const end = coletarEnderecoForm();
    const { aoSalvar, mensagem } = _enderecoEditor;
    _encerrarEnderecoGrupo();
    if (typeof aoSalvar === 'function') aoSalvar(end);
    if (mensagem) showNotification(mensagem, 'success');
}

function abrirEnderecoGrupo() {
    if (!_agendarGrupoPending) return;
    abrirEditorEndereco({
        patId: _agendarGrupoPending.patId,
        endereco: _agendarGrupoPending.endereco,
        mensagem: 'Endereço aplicado a todas as vacinas do grupo.',
        aoSalvar: end => {
            _agendarGrupoPending.endereco = end;
            _renderAgendarGrupoEndereco();
            _checkAgendarGrupoBtn();
        }
    });
}

// Botão de pagamento das linhas de grupo. Cada vacina tem seu valor, então o
// marcador é por linha — não do grupo inteiro, como acontece com o endereço.
// A alternância repinta só o próprio botão: re-renderizar a lista descartaria o
// pedido, a data e o lote que o usuário já digitou nas outras linhas.
const _GRUPO_PAGO_CLS = on => on
    ? 'h-7 w-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center transition shrink-0 shadow-sm hover:bg-emerald-700'
    : 'h-7 w-7 rounded-lg bg-slate-100 hover:bg-emerald-100 text-slate-400 hover:text-emerald-600 flex items-center justify-center transition shrink-0';
// O cifrão é fixo nos dois estados: é o que o botão faz, não o estado dele. Um
// "x" aqui colidiria com o × de remover, logo ao lado. O estado quem diz é a cor
// (verde preenchido = pago) mais o title.
const _GRUPO_PAGO_ICO = () => 'fas fa-dollar-sign text-[10px]';
const _GRUPO_PAGO_TIT = on => on ? 'Pago — clique para desmarcar' : 'Não pago — clique para marcar como pago';

function _grupoPagoBtn(fluxo, app) {
    const on = !!app.pago;
    return `<button type="button" id="${fluxo.toLowerCase()}-grupo-pago-${app.id}"
        onclick="toggle${fluxo}GrupoPago(${app.id})" class="${_GRUPO_PAGO_CLS(on)}" title="${_GRUPO_PAGO_TIT(on)}">
        <i class="${_GRUPO_PAGO_ICO()}"></i>
    </button>`;
}

function _paintGrupoPagoBtn(fluxo, app) {
    const btn = document.getElementById(`${fluxo.toLowerCase()}-grupo-pago-${app.id}`);
    if (!btn) return;
    const on = !!app.pago;
    btn.className = _GRUPO_PAGO_CLS(on);
    btn.title = _GRUPO_PAGO_TIT(on);
    const icon = btn.querySelector('i');
    if (icon) icon.className = _GRUPO_PAGO_ICO();
}

function toggleAgendarGrupoPago(appId) {
    if (!_agendarGrupoPending) return;
    const line = _agendarGrupoPending.apps.find(a => a.id == appId);
    if (!line) return;
    line.pago = !line.pago;
    _paintGrupoPagoBtn('Agendar', line);
}

function _renderAgendarGrupoLines() {
    if (!_agendarGrupoPending) return;
    const container = document.getElementById('agendar-grupo-lines');
    if (!container) return;

    const lines = _agendarGrupoPending.apps;
    const removedIds = _agendarGrupoRemovedIds;
    const fromStatus = _agendarGrupoPending.fromStatus;
    // Lote só é editável por quem tem permissão de aplicar vacina; os demais veem
    // a disponibilidade pela legenda de doses ao lado do nome da vacina.
    const _podeEditarLoteGrupo = (typeof canEditLoteAplicador === 'function') ? canEditLoteAplicador() : true;

    container.innerHTML = lines.map(app => {
        const vac = vaccines.find(v => v.id == app.vaccineId);
        const isRemoved = removedIds.has(app.id);
        const isConfirming = _agendarGrupoRemovePending === app.id;
        const nomVac = vac ? vac.nome : '—';
        const valorStr = app.valorAplicado ? ` · R$ ${app.valorAplicado}` : '';

        if (isRemoved) {
            return `<div class="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-50 border border-dashed border-slate-200">
                <i class="fas fa-syringe text-slate-300 text-xs shrink-0"></i>
                <div class="flex-1 min-w-0">
                    <p class="text-[11px] font-black text-slate-400 line-through truncate">${nomVac}</p>
                    <p class="text-[10px] text-slate-400">${app.dose}</p>
                </div>
                <span class="text-[9px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full whitespace-nowrap">Mantido em ${fromStatus}</span>
                <button onclick="undoRemoveAgendarGrupoLine(${app.id})" class="h-7 w-7 rounded-lg bg-slate-100 hover:bg-indigo-100 text-slate-400 hover:text-indigo-600 flex items-center justify-center transition shrink-0" title="Restaurar">
                    <i class="fas fa-undo text-[9px]"></i>
                </button>
            </div>`;
        }

        if (isConfirming) {
            return `<div class="flex flex-col gap-2 px-3 py-2.5 rounded-xl bg-red-50 border-2 border-red-300 transition">
                <div class="flex items-center gap-2">
                    <i class="fas fa-exclamation-triangle text-red-500 text-xs shrink-0"></i>
                    <div class="flex-1 min-w-0">
                        <p class="text-[11px] font-black text-red-700 truncate">${nomVac} — ${app.dose}</p>
                        <p class="text-[10px] text-red-600">Esta vacina ficará em <strong>${fromStatus}</strong></p>
                    </div>
                </div>
                <div class="flex gap-2">
                    <button onclick="cancelRemoveAgendarGrupoLine()" class="flex-1 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 text-[10px] font-black uppercase tracking-wider hover:bg-slate-50 transition">Cancelar</button>
                    <button onclick="executeRemoveAgendarGrupoLine(${app.id})" class="flex-1 py-1.5 rounded-lg bg-red-600 text-white text-[10px] font-black uppercase tracking-wider hover:bg-red-700 transition shadow-sm">Remover</button>
                </div>
            </div>`;
        }

        const openLots = vaccineLots
            ? vaccineLots.filter(l => l.vaccineId == app.vaccineId && (l.status === 'aberto' || l.id == app.loteId))
                .sort((a, b) => new Date(a.validade) - new Date(b.validade))
            : [];
        const loteOptions = '<option value="">Selecionar Lote</option>' + openLots.map(l => {
            const disp = (typeof getLoteDisponivelParaAgendamento === 'function') ? getLoteDisponivelParaAgendamento(l.id, app.id) : null;
            const dispStr = disp != null ? ` (${Math.max(0, disp)})` : '';
            const disabled = (disp != null && disp <= 0 && l.id != app.loteId) ? 'disabled' : '';
            const selected = l.id == app.loteId ? 'selected' : '';
            return `<option value="${l.id}" ${selected} ${disabled}>Lote ${l.numero} · ${l.validade.split('-').reverse().join('/')}${dispStr}</option>`;
        }).join('');

        return `<div class="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white border border-slate-200 hover:border-slate-300 transition">
                <i class="fas fa-syringe text-indigo-400 text-xs shrink-0"></i>
                <div class="flex-1 min-w-0">
                    <p class="text-[11px] font-black text-navy-900 truncate leading-tight flex items-center gap-1.5">${nomVac}${vac && vac.mnemonico ? `<span class="inline-flex items-center bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full text-[9px] font-black normal-case shrink-0">${vac.mnemonico}</span>` : ''}</p>
                    <p class="text-[10px] text-slate-500">${app.dose}${valorStr}</p>
                    ${_grupoEstoqueLegenda(app.vaccineId, app.id)}
                </div>
                <input type="text" id="agendar-grupo-pedido-${app.id}" value="${app.pedido || ''}" placeholder="Nº pedido" oninput="_checkAgendarGrupoBtn()"
                    class="border border-slate-200 rounded-lg py-1.5 px-2 text-xs text-slate-700 focus:ring-2 focus:ring-blue-400 outline-none bg-slate-50 shrink-0 w-[100px]">
                ${openLots.length > 0 ? `<select id="agendar-grupo-lote-${app.id}" ${_podeEditarLoteGrupo ? '' : 'disabled title="Somente usuários com permissão de aplicar vacina podem definir o lote."'}
                    class="border border-slate-200 rounded-lg py-1.5 px-2 text-xs text-slate-700 focus:ring-2 focus:ring-blue-400 outline-none bg-slate-50 shrink-0 max-w-[140px]${_podeEditarLoteGrupo ? '' : ' opacity-60 cursor-not-allowed bg-slate-100'}">
                    ${loteOptions}
                </select>` : `<span class="text-[9px] font-bold text-slate-400 shrink-0 whitespace-nowrap" title="Nenhum lote aberto para esta vacina">Sem lote</span>`}
                <input type="date" id="agendar-grupo-date-${app.id}" value="${app.data || ''}"
                    class="border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs text-slate-700 focus:ring-2 focus:ring-blue-400 outline-none bg-slate-50 shrink-0">
                <input type="time" id="agendar-grupo-hora-${app.id}" value="${app.hora || ''}"
                    class="border border-slate-200 rounded-lg py-1.5 px-2 text-xs text-slate-700 focus:ring-2 focus:ring-blue-400 outline-none bg-slate-50 shrink-0 w-[90px]">
                ${_grupoPagoBtn('Agendar', app)}
                <button onclick="removeAgendarGrupoLine(${app.id})"
                    class="h-7 w-7 rounded-lg bg-red-50 hover:bg-red-500 text-red-400 hover:text-white flex items-center justify-center transition shrink-0" title="Remover desta lista">
                    <i class="fas fa-times text-[9px]"></i>
                </button>
        </div>`;
    }).join('');

    const activeApps = lines.filter(a => !removedIds.has(a.id));
    const totalVacinas = activeApps.reduce((s, a) => s + (parseBRL(String(a.valorAplicado || '0')) || 0), 0);
    // Taxa de deslocamento entra uma vez pela visita, não por vacina.
    const taxa = (typeof getTaxaDeslocamento === 'function')
        ? getTaxaDeslocamento(_agendarGrupoPending && _agendarGrupoPending.endereco) : 0;
    const totalEl = document.getElementById('agendar-grupo-total');
    if (totalEl) {
        const qtd = `${activeApps.length} vacina${activeApps.length !== 1 ? 's' : ''}`;
        totalEl.textContent = taxa > 0
            ? `${qtd} · R$ ${formatBRL(totalVacinas)} + taxa R$ ${formatBRL(taxa)} = R$ ${formatBRL(totalVacinas + taxa)}`
            : `${qtd} · R$ ${formatBRL(totalVacinas)}`;
    }

    _pintarDescontoTotalGrupo('agendar-grupo');
    _checkAgendarGrupoBtn();
}

// ─── EDIÇÃO DO TOTAL DO GRUPO ────────────────────────────────────────────────
// O novo total vira um desconto percentual igual em todas as vacinas do grupo,
// calculado sobre o valor cheio de cada uma, e só vale depois de confirmado na
// janela de aviso. Cada fluxo (agendar, oportunidade/negociação) diz quais
// linhas entram, de onde vêm os valores e como gravar o resultado. A taxa de
// deslocamento fica fora.
const _TOTAL_GRUPO_FLUXOS = {
    'agendar-grupo': {
        linhas: () => _agendarGrupoPending
            ? _agendarGrupoPending.apps.filter(a => !_agendarGrupoRemovedIds.has(a.id)) : [],
        atual: a => parseBRL(a.valorAplicado),
        cheio: a => parseBRL(a.valorCheio),
        aplicar: (novos, pct) => {
            // Preserva o que já foi digitado nas linhas antes de re-renderizar.
            novos.forEach(({ app, valor }) => {
                const val = campo => { const el = document.getElementById(`agendar-grupo-${campo}-${app.id}`); return el ? el.value : null; };
                if (val('pedido') != null) app.pedido = val('pedido');
                if (val('date') != null) app.data = val('date');
                if (val('hora') != null) app.hora = val('hora');
                if (val('lote')) app.loteId = Number(val('lote'));
                app.valorAplicado = formatBRL(valor);
                app.descontoPct = pct > 0.0001 ? parseFloat(pct.toFixed(1)) : 0;
                app.totalEditado = true;
            });
            _renderAgendarGrupoLines();
        }
    },
    'oport-grupo': {
        // Cortesia já está zerada de propósito: fica fora do rateio.
        linhas: () => _editarOportunidadePending
            ? _editarOportunidadePending.apps.filter(a => a.vaccineId && !a._oportCortesia) : [],
        atual: a => parseBRL(_oportValorAtual(a)),
        // Para o % exibido no total a cortesia conta, pelo valor cheio dela.
        todas: () => _editarOportunidadePending
            ? _editarOportunidadePending.apps.filter(a => a.vaccineId) : [],
        cheio: a => parseBRL((a._oportDescontoAtivo || a._oportCortesia) ? a._oportCheio : _oportValorAtual(a)),
        aplicar: (novos, pct) => {
            _syncOportLinesFromDom();
            novos.forEach(({ app, base, valor }) => {
                if (pct > 0.0001) {
                    app._oportCheio = formatBRL(base);
                    app._oportDescontoAtivo = true;
                    app.valorAplicado = formatBRL(valor);
                } else {
                    app._oportCheio = '';
                    app._oportDescontoAtivo = false;
                    app.valorAplicado = formatBRL(base);
                }
            });
            _renderEditarOportunidadeLines();
        }
    }
};
let _totalGrupoPending = null;

// Selo ao lado do total: quanto o grupo está abaixo do valor cheio.
function _pintarDescontoTotalGrupo(fluxo) {
    const cfg = _TOTAL_GRUPO_FLUXOS[fluxo];
    const el = document.getElementById(`${fluxo}-total-pct`);
    if (!cfg || !el) return;
    const linhas = (cfg.todas || cfg.linhas)();
    const cheio = linhas.reduce((s, a) => s + cfg.cheio(a), 0);
    const atual = linhas.reduce((s, a) => s + cfg.atual(a), 0);
    const pct = cheio > 0 ? ((cheio - atual) / cheio) * 100 : 0;
    if (pct < 0.05) { el.classList.add('hidden'); return; }
    el.textContent = `${pct.toFixed(1).replace('.', ',')}% OFF · −R$ ${formatBRL(cheio - atual)}`;
    el.title = `Valor cheio: R$ ${formatBRL(cheio)}`;
    el.classList.remove('hidden');
}

function editarTotalGrupo(fluxo) {
    const cfg = _TOTAL_GRUPO_FLUXOS[fluxo];
    const linhas = cfg ? cfg.linhas() : [];
    if (!linhas.length) { showNotification('Nenhuma vacina com valor para editar.', 'error'); return; }
    const atual = linhas.reduce((s, a) => s + cfg.atual(a), 0);
    document.getElementById(`${fluxo}-total-view`).classList.add('hidden');
    document.getElementById(`${fluxo}-total-edit`).classList.remove('hidden');
    const input = document.getElementById(`${fluxo}-total-input`);
    input.value = formatBRL(atual);
    input.focus();
    input.select();
}

function cancelarEdicaoTotalGrupo(fluxo) {
    document.getElementById(`${fluxo}-total-view`)?.classList.remove('hidden');
    document.getElementById(`${fluxo}-total-edit`)?.classList.add('hidden');
}

function aplicarTotalGrupo(fluxo) {
    const cfg = _TOTAL_GRUPO_FLUXOS[fluxo];
    if (!cfg) return;
    const linhas = cfg.linhas();
    const cheio = linhas.reduce((s, a) => s + cfg.cheio(a), 0);
    const atual = linhas.reduce((s, a) => s + cfg.atual(a), 0);
    const novo = parseBRL(document.getElementById(`${fluxo}-total-input`).value);

    if (!(novo > 0)) { showNotification('Informe um valor total válido.', 'error'); return; }
    if (cheio <= 0) { showNotification('As vacinas do grupo não têm valor para descontar.', 'error'); return; }
    if (novo > cheio + 0.001) {
        showNotification(`O total não pode passar do valor cheio (R$ ${formatBRL(cheio)}).`, 'error');
        return;
    }
    if (Math.abs(novo - atual) < 0.005) { cancelarEdicaoTotalGrupo(fluxo); return; }

    // Mesmo fator para todas; a sobra de arredondamento vai para a vacina mais
    // cara, para o total bater exatamente com o digitado.
    const fator = novo / cheio;
    const novos = linhas.map(a => {
        const base = cfg.cheio(a);
        return { app: a, base, valor: Math.round(base * fator * 100) / 100 };
    });
    const sobra = Math.round((novo - novos.reduce((s, n) => s + n.valor, 0)) * 100) / 100;
    if (sobra) {
        const maior = novos.reduce((m, n) => n.base > m.base ? n : m, novos[0]);
        maior.valor = Math.round((maior.valor + sobra) * 100) / 100;
    }
    const pct = (1 - fator) * 100;
    _totalGrupoPending = { fluxo, novos, pct };

    document.getElementById('desc-grupo-de').textContent = `R$ ${formatBRL(atual)}`;
    document.getElementById('desc-grupo-para').textContent = `R$ ${formatBRL(novo)}`;
    document.getElementById('desc-grupo-pct').textContent = pct > 0.0001
        ? `${pct.toFixed(1).replace('.', ',')}% de desconto em cada vacina`
        : 'Sem desconto — valores cheios restaurados';
    document.getElementById('desc-grupo-lista').innerHTML = novos.map(({ app, base, valor }) => {
        const vac = vaccines.find(v => v.id == app.vaccineId);
        return `<div class="flex items-center justify-between gap-3 py-1.5">
            <span class="text-[11px] font-bold text-slate-700 truncate">${vac ? vac.nome : '—'}</span>
            <span class="text-[11px] whitespace-nowrap">
                ${Math.abs(base - valor) > 0.004 ? `<span class="text-slate-400 line-through mr-1.5">R$ ${formatBRL(base)}</span>` : ''}
                <span class="font-black text-emerald-700">R$ ${formatBRL(valor)}</span>
            </span>
        </div>`;
    }).join('');
    document.getElementById('modal-desconto-grupo').classList.add('active');
}

function fecharConfirmacaoTotalGrupo() {
    _totalGrupoPending = null;
    document.getElementById('modal-desconto-grupo').classList.remove('active');
}

function confirmarTotalGrupo() {
    if (!_totalGrupoPending) return;
    const { fluxo, novos, pct } = _totalGrupoPending;
    fecharConfirmacaoTotalGrupo();
    cancelarEdicaoTotalGrupo(fluxo);
    _TOTAL_GRUPO_FLUXOS[fluxo].aplicar(novos, pct);
    showNotification('Desconto aplicado a todas as vacinas do grupo.', 'success');
}

function _checkAgendarGrupoBtn() {
    if (!_agendarGrupoPending) return;
    const activeApps = _agendarGrupoPending.apps.filter(a => !_agendarGrupoRemovedIds.has(a.id));
    const btn = document.getElementById('btn-confirm-agendar-grupo');
    if (!btn) return;
    const allPedidosPreenchidos = activeApps.every(app => {
        const el = document.getElementById(`agendar-grupo-pedido-${app.id}`);
        return el && el.value.trim().length > 0;
    });
    // Status Agendado exige endereço utilizável para a visita.
    const semEndereco = !_enderecoGrupoCompleto();
    const canConfirm = activeApps.length > 0 && allPedidosPreenchidos && !semEndereco;
    // O botão continua clicável mesmo bloqueado: `disabled` engole o clique e o
    // usuário fica sem saber o motivo. confirmAgendarGrupo() valida e explica.
    btn.disabled = false;
    btn.className = canConfirm
        ? 'flex-1 bg-blue-600 text-white font-black py-3 rounded-xl uppercase text-xs transition hover:bg-blue-700 cursor-pointer shadow-md'
        : 'flex-1 bg-blue-200 text-blue-400 font-black py-3 rounded-xl uppercase text-xs transition hover:bg-blue-300 cursor-pointer';
    btn.title = canConfirm ? '' :
        (semEndereco ? _dicaEnderecoIncompleto(_agendarGrupoPending.endereco) : 'Preencha o Nº do pedido de cada vacina.');
}

// Chama atenção para o box de endereço: pulso vermelho + rolagem até ele.
// Usado quando o bloqueio do agendamento é justamente a falta de endereço.
function _piscarEnderecoGrupo() {
    const box = document.getElementById('agendar-grupo-endereco-box');
    if (!box) return;
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const base = box.className.replace(/\s*(ring-2|ring-red-400|border-red-400|animate-pulse)\b/g, '');
    box.className = base + ' ring-2 ring-red-400 border-red-400 animate-pulse';
    setTimeout(() => { box.className = base; }, 1800);
}

function removeAgendarGrupoLine(appId) {
    _agendarGrupoRemovePending = appId;
    _renderAgendarGrupoLines();
}

function cancelRemoveAgendarGrupoLine() {
    _agendarGrupoRemovePending = null;
    _renderAgendarGrupoLines();
}

function executeRemoveAgendarGrupoLine(appId) {
    _agendarGrupoRemovedIds.add(appId);
    _agendarGrupoRemovePending = null;
    _renderAgendarGrupoLines();
}

function undoRemoveAgendarGrupoLine(appId) {
    _agendarGrupoRemovedIds.delete(appId);
    _renderAgendarGrupoLines();
}

function confirmAgendarGrupo() {
    if (!_agendarGrupoPending) return;

    const activeApps = _agendarGrupoPending.apps.filter(a => !_agendarGrupoRemovedIds.has(a.id));
    if (!activeApps.length) {
        showNotification('Nenhuma vacina ativa para agendar.', 'error');
        return;
    }

    // Endereço completo é pré-requisito do status Agendado — mesma regra do
    // formulário de registro.
    if (!_enderecoGrupoCompleto()) {
        showNotification(
            (typeof enderecoIncompletoMsg === 'function')
                ? enderecoIncompletoMsg(_agendarGrupoPending.endereco)
                : 'Endereço incompleto para agendar.',
            'error'
        );
        // Marca o box e leva o usuário até ele; abrir o editor direto tiraria a
        // referência visual de onde o problema está.
        _piscarEnderecoGrupo();
        return;
    }

    // Valida datas e coleta lotes de cada linha ativa
    const dateMap = {};
    const loteMap = {};
    const pedidoMap = {};
    for (const app of activeApps) {
        const pedidoInput = document.getElementById(`agendar-grupo-pedido-${app.id}`);
        const pedido = pedidoInput ? pedidoInput.value.trim() : '';
        if (!pedido) {
            showNotification(`Informe o número do pedido para "${vaccines.find(v => v.id == app.vaccineId)?.nome || 'vacina'}".`, 'error');
            if (pedidoInput) {
                pedidoInput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                pedidoInput.focus();
                pedidoInput.classList.add('border-red-400', 'ring-2', 'ring-red-200');
            }
            return;
        }
        pedidoMap[app.id] = pedido;

        const input = document.getElementById(`agendar-grupo-date-${app.id}`);
        const data = input ? input.value : '';
        if (!data) {
            showNotification(`Informe a data para "${vaccines.find(v => v.id == app.vaccineId)?.nome || 'vacina'}".`, 'error');
            if (input) { input.focus(); input.classList.add('border-red-400', 'ring-2', 'ring-red-200'); }
            return;
        }
        if (typeof holidays !== 'undefined' && holidays.includes(data)) {
            showNotification('Bloqueio: Uma das datas está marcada como feriado.', 'error');
            return;
        }
        if (new Date(data + 'T00:00:00').getDay() === 0) {
            showNotification('Bloqueio: Agendamentos aos domingos não são permitidos.', 'error');
            return;
        }
        dateMap[app.id] = data;

        const horaInput = document.getElementById(`agendar-grupo-hora-${app.id}`);
        if (horaInput && horaInput.value) dateMap[`hora_${app.id}`] = horaInput.value;

        const loteSel = document.getElementById(`agendar-grupo-lote-${app.id}`);
        const loteId = loteSel ? loteSel.value : '';
        if (loteId) {
            const lote = vaccineLots.find(l => l.id == loteId);
            if (lote && lote.validade) {
                const exp = new Date(lote.validade + 'T00:00:00');
                const dest = new Date(data + 'T00:00:00');
                if (exp < dest) {
                    const vac = vaccines.find(v => v.id == app.vaccineId);
                    showNotification(`Bloqueado: lote ${lote.numero} da ${vac ? vac.nome : 'vacina'} vence antes da data de agendamento.`, 'error');
                    return;
                }
            }
            if (typeof getLoteDisponivelParaAgendamento === 'function') {
                const disp = getLoteDisponivelParaAgendamento(Number(loteId), Number(app.id));
                if (disp <= 0) {
                    const lote2 = vaccineLots.find(l => l.id == loteId);
                    showNotification(`Estoque insuficiente no lote ${lote2 ? lote2.numero : ''}.`, 'error');
                    return;
                }
            }
            loteMap[app.id] = Number(loteId);
        }
    }

    const _auditBefore = auditSnapshotAppointments(activeApps.map(a => a.id));
    activeApps.forEach((app, i) => {
        const idx = appointments.findIndex(a => a.id == app.id);
        if (idx > -1) {
            appointments[idx].status = 'Agendado';
            appointments[idx].data = dateMap[app.id];
            appointments[idx].hora = dateMap[`hora_${app.id}`] || appointments[idx].hora || '';
            appointments[idx].pedido = pedidoMap[app.id];
            // Mesma visita, mesmo endereço em todas as vacinas do grupo — mas a
            // taxa de deslocamento fica só na primeira, para não cobrar por dose.
            appointments[idx].endereco = (typeof enderecoDaVisitaParaVacina === 'function')
                ? enderecoDaVisitaParaVacina(_agendarGrupoPending.endereco, i === 0)
                : { ..._agendarGrupoPending.endereco };
            if (typeof aplicarPagoAgendamento === 'function') {
                aplicarPagoAgendamento(appointments[idx], app.pago, _auditBefore.get(String(app.id)));
            }
            if (app.totalEditado) {
                appointments[idx].valorAplicado = app.valorAplicado;
                appointments[idx].valorCheio = app.descontoPct > 0 ? app.valorCheio : null;
                appointments[idx].descontoPct = app.descontoPct > 0 ? app.descontoPct : null;
            }
            if (loteMap[app.id]) {
                appointments[idx].loteId = loteMap[app.id];
                const lote = vaccineLots.find(l => l.id == loteMap[app.id]);
                if (lote) appointments[idx].lote = lote.numero.toUpperCase();
            }
            if (typeof syncAppointmentMovement === 'function') syncAppointmentMovement(appointments[idx]);
        }
    });
    logAppointmentAuditMany(_auditBefore);

    if (typeof syncAllLoteStatus === 'function') syncAllLoteStatus();
    saveAll(); renderCalendar(); renderTable(); renderDashboard();
    if (typeof refreshAlmoxIfActive === 'function') refreshAlmoxIfActive();
    if (typeof refreshOpenModals === 'function') refreshOpenModals();

    const count = activeApps.length;
    const semPagar = activeApps.filter(a => !a.pago).length;
    closeAgendarGrupoModal();
    renderKanban();
    showNotification(`${count} vacina${count !== 1 ? 's' : ''} agendada${count !== 1 ? 's' : ''} com sucesso!`, 'success');
    // Agendado não bloqueia por pagamento, mas o pendente precisa ser visto.
    if (semPagar) showNotification(`Atenção: ${semPagar} vacina${semPagar !== 1 ? 's' : ''} agendada${semPagar !== 1 ? 's' : ''} como <b>não paga${semPagar !== 1 ? 's' : ''}</b>.`, 'info');
}

function closeAgendarGrupoModal() {
    // O modal de endereço vive dentro deste fluxo: fechar o grupo o encerra junto,
    // devolvendo os IDs-alvo de endereco.js ao formulário de registro.
    if (document.getElementById('modal-endereco-grupo')?.classList.contains('active')) _encerrarEnderecoGrupo();
    document.getElementById('modal-agendar-grupo').classList.remove('active');
    _agendarGrupoPending = null;
    _agendarGrupoRemovedIds = new Set();
    _agendarGrupoRemovePending = null;
}

// ─── MODAL: EDITAR OPORTUNIDADE (GRUPO) ──────────────────────────────────────

const OPORTUNIDADE_THEMES = {
    'Nova oportunidade': {
        title: 'Editar Oportunidade',
        icon: 'fa-star',
        header: 'bg-gradient-to-br from-slate-600 to-slate-800 p-5 text-white flex items-center gap-3 shrink-0',
        subtitle: 'text-[11px] text-slate-200 font-bold truncate mt-0.5',
        accent: 'h-1 w-full bg-gradient-to-r from-slate-400 via-slate-300 to-transparent shrink-0',
        infoBox: 'flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5',
        infoIcon: 'fas fa-info-circle text-slate-500 text-xs shrink-0',
        infoText: 'text-[11px] text-slate-600 font-bold',
        btn: 'flex-1 bg-slate-700 text-white font-black py-3 rounded-xl uppercase text-xs transition hover:bg-slate-800 cursor-pointer shadow-md'
    },
    'Em negociação': {
        title: 'Editar Negociação',
        icon: 'fa-comments',
        header: 'bg-gradient-to-br from-cyan-600 to-cyan-800 p-5 text-white flex items-center gap-3 shrink-0',
        subtitle: 'text-[11px] text-cyan-100 font-bold truncate mt-0.5',
        accent: 'h-1 w-full bg-gradient-to-r from-cyan-400 via-cyan-300 to-transparent shrink-0',
        infoBox: 'flex items-center gap-2 bg-cyan-50 border border-cyan-200 rounded-xl px-3 py-2.5',
        infoIcon: 'fas fa-info-circle text-cyan-500 text-xs shrink-0',
        infoText: 'text-[11px] text-cyan-700 font-bold',
        btn: 'flex-1 bg-cyan-700 text-white font-black py-3 rounded-xl uppercase text-xs transition hover:bg-cyan-800 cursor-pointer shadow-md'
    }
};

function openEditarOportunidadeModal(patId, groupApps, fromStatus) {
    _editarOportunidadePending = {
        patId: String(patId),
        fromStatus: fromStatus || 'Nova oportunidade',
        apps: groupApps.map(a => ({
            id: a.id,
            vaccineId: a.vaccineId,
            dose: a.doseAtual,
            data: a.data || '',
            pedido: a.pedido || a.pedidoNumero || '',
            valorAplicado: a.valorAplicado || '',
            _oportCheio: a.valorCheio || '',
            _oportDescontoAtivo: !!a.descontoPct && !a.cortesia,
            _oportCortesia: !!a.cortesia
        }))
    };

    const theme = OPORTUNIDADE_THEMES[_editarOportunidadePending.fromStatus] || OPORTUNIDADE_THEMES['Nova oportunidade'];
    const setCls = (id, cls) => { const el = document.getElementById(id); if (el) el.className = cls; };
    setCls('oport-modal-header', theme.header);
    setCls('oport-modal-icon', 'fas ' + theme.icon + ' text-white text-base');
    setCls('oport-grupo-paciente', theme.subtitle);
    setCls('oport-modal-accent', theme.accent);
    setCls('oport-info-box', theme.infoBox);
    setCls('oport-info-icon', theme.infoIcon);
    setCls('oport-info-text', theme.infoText);
    setCls('btn-confirm-editar-oportunidade', theme.btn);
    const titleEl2 = document.getElementById('oport-modal-title');
    if (titleEl2) titleEl2.textContent = theme.title;

    const pat = patients.find(p => p.id == patId);
    _editarOportunidadePending.patDtNasc = pat ? pat.dtNasc : '';
    const titleEl = document.getElementById('oport-grupo-paciente');
    if (titleEl) titleEl.textContent = pat ? pat.nome : '—';

    const countEl = document.getElementById('oport-grupo-count');
    if (countEl) countEl.textContent = groupApps.length + ' vacina' + (groupApps.length !== 1 ? 's' : '');

    cancelarEdicaoTotalGrupo('oport-grupo');
    _renderEditarOportunidadeLines();
    document.getElementById('modal-editar-grupo-oportunidade').classList.add('active');
}

function _renderEditarOportunidadeLines() {
    if (!_editarOportunidadePending) return;
    const container = document.getElementById('oport-grupo-lines');
    if (!container) return;

    container.innerHTML = _editarOportunidadePending.apps.map(app => {
        const vac = vaccines.find(v => v.id == app.vaccineId);
        const hasDesconto = app._oportDescontoAtivo || app._oportCortesia;
        const pctLabel = app._oportCortesia ? 'CORTESIA' : (app._oportDescontoAtivo ? formatDescontoPct(app) + '% OFF' : '');

        return `<div class="flex flex-col gap-1.5 px-3 py-2.5 rounded-xl bg-white border ${app._isNew ? 'border-dashed border-indigo-300' : 'border-slate-200 hover:border-slate-300'} transition">
                <div class="flex items-center gap-2 flex-nowrap">
                    <div class="w-4 flex items-center justify-center shrink-0" title="${app._isNew ? 'Nova vacina — salva apenas ao confirmar' : 'Vacina já registrada'}">
                        <i class="fas fa-syringe text-xs ${app._isNew ? 'text-indigo-500' : 'text-slate-400'}"></i>
                    </div>
                    <div class="relative flex-1 min-w-0" id="oport-vacina-wrap-${app.id}">
                        <input type="text" id="oport-vacina-search-${app.id}" value="${vac ? vac.nome : ''}"
                            oninput="_filterOportVacinaDropdown('${app.id}')" onfocus="_filterOportVacinaDropdown('${app.id}')" onblur="_hideOportVacinaDropdown('${app.id}')"
                            autocomplete="off" placeholder="Buscar vacina..."
                            class="w-full border border-slate-200 rounded-lg py-1.5 px-2 text-xs font-black text-navy-900 focus:ring-2 focus:ring-blue-400 outline-none bg-slate-50 uppercase truncate">
                        <div id="oport-vacina-dropdown-${app.id}" class="hidden absolute z-[400] left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-y-auto" style="max-height:200px;"></div>
                    </div>
                    <select id="oport-dose-${app.id}" onchange="_onOportunidadeDoseChange('${app.id}')"
                        class="border border-slate-200 rounded-lg py-1.5 px-1.5 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-blue-400 outline-none bg-slate-50 shrink-0 w-[104px]">
                        ${_buildOportDoseOptionsHtml(vac, _editarOportunidadePending.patDtNasc, app.data, app.dose)}
                    </select>
                    <input type="text" id="oport-pedido-${app.id}" value="${app.pedido || ''}" placeholder="Nº pedido"
                        class="border border-slate-200 rounded-lg py-1.5 px-2 text-xs text-slate-700 focus:ring-2 focus:ring-blue-400 outline-none bg-slate-50 shrink-0 w-[84px]">
                    <input type="date" id="oport-data-${app.id}" value="${app.data || ''}" onchange="_onOportunidadeDataChange('${app.id}')"
                        class="border border-slate-200 rounded-lg py-1.5 px-1.5 text-xs text-slate-700 focus:ring-2 focus:ring-blue-400 outline-none bg-slate-50 shrink-0">
                    <div class="flex items-stretch rounded-lg overflow-hidden border border-slate-200 bg-slate-50 shrink-0">
                        <span class="px-1.5 flex items-center bg-slate-100 text-slate-400 font-black text-[10px] border-r border-slate-200 select-none">R$</span>
                        <input type="text" id="oport-valor-${app.id}" value="${app.valorAplicado || ''}" placeholder="0,00" readonly
                            class="w-[68px] py-1.5 px-1.5 outline-none text-xs font-black text-navy-900 bg-slate-50 cursor-default select-all">
                        <button type="button" onclick="openOportunidadeDescontoModal('${app.id}')" title="Aplicar desconto"
                            class="flex items-center px-2 bg-gradient-to-br from-indigo-600 to-indigo-800 hover:from-indigo-500 hover:to-indigo-700 text-white text-[9px] font-black uppercase shrink-0">
                            <i class="fas fa-tag text-[9px]"></i>
                        </button>
                    </div>
                    <div class="w-7 shrink-0 flex items-center justify-center">
                        ${app._isNew ? `<button type="button" onclick="removeOportunidadeLine('${app.id}')" title="Excluir vacina não salva"
                            class="h-7 w-7 rounded-lg bg-red-50 hover:bg-red-500 text-red-400 hover:text-white flex items-center justify-center transition"><i class="fas fa-trash-alt text-[10px]"></i></button>` : ''}
                    </div>
                </div>
                <div id="oport-desconto-info-${app.id}" class="items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg px-2.5 py-1.5" style="display:${hasDesconto ? 'flex' : 'none'}">
                    <i class="fas fa-tag text-indigo-400 text-[9px] shrink-0"></i>
                    <span class="text-[10px] text-slate-500">Cheio: <b class="text-slate-700">R$ ${app._oportCheio}</b></span>
                    <span class="text-slate-300 text-[10px]">•</span>
                    <span class="text-[10px] font-black text-indigo-600">${pctLabel}</span>
                    <button type="button" onclick="removerOportunidadeDesconto('${app.id}')" class="ml-auto text-slate-400 hover:text-red-500 transition" title="Remover desconto"><i class="fas fa-times text-[9px]"></i></button>
                </div>
        </div>`;
    }).join('');

    _recalcEditarOportunidadeTotal();
}

function _filterOportVacinaDropdown(appId) {
    const input = document.getElementById(`oport-vacina-search-${appId}`);
    const dd = document.getElementById(`oport-vacina-dropdown-${appId}`);
    if (!input || !dd) return;
    const val = normalizeStr(input.value);
    const ativos = vaccines.filter(v => v.ativo !== false);
    const matches = val
        ? ativos.filter(v => {
            if (normalizeStr(v.nome).includes(val)) return true;
            if (v.mnemonico && normalizeStr(v.mnemonico).includes(val)) return true;
            return vaccineLots.some(l => l.vaccineId == v.id && l.fabricante && normalizeStr(l.fabricante).includes(val));
        })
        : ativos;
    if (!matches.length) { dd.classList.add('hidden'); return; }
    dd.innerHTML = matches.map(v =>
        `<div class="px-3 py-2 hover:bg-clinic-50 hover:text-clinic-700 cursor-pointer text-xs font-bold text-navy-900 border-b border-slate-100 last:border-0 transition uppercase"
              onmousedown="_selectOportVacina('${appId}',${v.id},'${v.nome.replace(/'/g,"\\'")}')">
            <span>${v.nome}</span>
            ${v.mnemonico ? `<br><span class="inline-flex items-center bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full text-[9px] font-black normal-case mt-0.5">${v.mnemonico}</span>` : ''}
        </div>`
    ).join('');
    dd.classList.remove('hidden');
}

function _hideOportVacinaDropdown(appId) {
    setTimeout(() => { const dd = document.getElementById(`oport-vacina-dropdown-${appId}`); if (dd) dd.classList.add('hidden'); }, 150);
}

function _selectOportVacina(appId, vId, nome) {
    if (!_editarOportunidadePending) return;
    const line = _editarOportunidadePending.apps.find(a => a.id == appId);
    if (!line) return;
    const vac = vaccines.find(v => v.id == vId);
    line.vaccineId = vac ? vac.id : line.vaccineId;
    line.valorAplicado = vac ? String(vac.valor || '').replace('R$', '').trim() : '';
    line.dose = '';
    line._oportCheio = '';
    line._oportDescontoAtivo = false;
    line._oportCortesia = false;
    _renderEditarOportunidadeLines();
    _warnOportIdade(appId);
}

// Monta as doses disponíveis respeitando os mesmos critérios do agendamento
// individual (autoFillVaccine): esquemas compatíveis com a idade do paciente na
// data de referência, Dose Única, Reforço e Dose Zero.
function _buildOportDoseOptionsHtml(vac, dtNasc, dataStr, currentDose) {
    if (!vac) return '<option value="">Selecione a vacina</option>';

    const esqs = (typeof getEsquemasPaciente === 'function') ? getEsquemasPaciente(vac, dtNasc, dataStr) : [];
    const meetsDoseZero = (typeof _patientMeetsDoseZero === 'function') && _patientMeetsDoseZero(vac, dtNasc, dataStr || undefined);
    const opt = (val, label) => `<option value="${val}" ${currentDose === val ? 'selected' : ''}>${label || val}</option>`;
    const keepCurrent = html => (currentDose && !html.includes(`value="${currentDose}"`))
        ? html + `<option value="${currentDose}" selected>${currentDose} (fora do esquema)</option>`
        : html;

    // Nenhum esquema compatível com a idade: só Dose Zero é permitida (quando aplicável)
    if (dtNasc && esqs.length === 0 && vac.esquemas && vac.esquemas.length > 0) {
        if (meetsDoseZero) return keepCurrent('<option value="">Selecione...</option>' + opt('Dose Zero'));
        return keepCurrent('<option value="">Sem dose compatível com a idade</option>');
    }

    let html = '<option value="">Selecione...</option>';
    const esqsToUse = esqs.length ? esqs : (vac.esquemas && vac.esquemas.length ? [vac.esquemas[0]] : [{ numDoses: vac.numDoses || 1 }]);
    const doseOptions = new Set();
    esqsToUse.forEach(e => {
        // Esquema somente reforço (0 doses): não oferta dose primária nem Dose Única
        if (typeof esquemaSemDoses === 'function' && esquemaSemDoses(e)) return;
        const n = e.numDoses || 1;
        if (n === 1) doseOptions.add('__dose_unica__');
        else for (let i = 1; i <= n; i++) doseOptions.add(i);
    });
    const numeradas = [...doseOptions].filter(d => d !== '__dose_unica__').sort((a, b) => a - b);
    numeradas.forEach(i => { html += opt(`${i}ª Dose`); });
    if (doseOptions.has('__dose_unica__')) html += opt('Dose Única');
    getVaccineReforcos(vac).forEach((r, i) => { html += opt(reforcoLabel(i + 1)); });
    // Dose Zero só aparece quando o paciente atende ao critério de idade próprio dela
    if (vac.doseZero && (!dtNasc || meetsDoseZero)) html += opt('Dose Zero');
    return keepCurrent(html);
}

// Equivalente a checkAgeConstraint() do formulário individual: avisa na hora em
// que a vacina/dose/data torna a combinação inválida para a idade do paciente.
function _warnOportIdade(appId) {
    if (!_editarOportunidadePending) return;
    const line = _editarOportunidadePending.apps.find(a => a.id == appId);
    if (!line) return;
    const vac = vaccines.find(v => v.id == line.vaccineId);
    if (!vac) return;
    const dataEl = document.getElementById(`oport-data-${appId}`);
    const doseEl = document.getElementById(`oport-dose-${appId}`);
    const msg = _oportCheckAgeBlocked(vac, _editarOportunidadePending.patDtNasc, dataEl ? dataEl.value : '', doseEl ? doseEl.value : '');
    if (msg) showNotification(`Restrição de idade (${vac.nome}): ${msg}`, 'error');
}

function _onOportunidadeDoseChange(appId) {
    if (!_editarOportunidadePending) return;
    const line = _editarOportunidadePending.apps.find(a => a.id == appId);
    const doseEl = document.getElementById(`oport-dose-${appId}`);
    if (line && doseEl) line.dose = doseEl.value;
    _warnOportIdade(appId);
}

function _onOportunidadeDataChange(appId) {
    if (!_editarOportunidadePending) return;
    const line = _editarOportunidadePending.apps.find(a => a.id == appId);
    if (!line) return;
    const dataEl = document.getElementById(`oport-data-${appId}`);
    const doseSel = document.getElementById(`oport-dose-${appId}`);
    const vac = vaccines.find(v => v.id == line.vaccineId);
    if (dataEl) line.data = dataEl.value;
    if (doseSel && vac && dataEl) {
        // A idade muda com a data: recalcula as doses permitidas preservando a seleção
        doseSel.innerHTML = _buildOportDoseOptionsHtml(vac, _editarOportunidadePending.patDtNasc, dataEl.value, doseSel.value);
        line.dose = doseSel.value;
    }
    _warnOportIdade(appId);
}

// Valor exibido na linha: o input é a fonte enquanto a linha está na tela.
function _oportValorAtual(app) {
    const el = document.getElementById(`oport-valor-${app.id}`);
    return el ? el.value : app.valorAplicado;
}

// Copia para o estado o que foi digitado nas linhas; sem isso, re-renderizar
// a lista descarta pedido, data, dose e valor.
function _syncOportLinesFromDom() {
    if (!_editarOportunidadePending) return;
    _editarOportunidadePending.apps.forEach(app => {
        const el = campo => document.getElementById(`oport-${campo}-${app.id}`);
        if (el('pedido')) app.pedido = el('pedido').value;
        if (el('data')) app.data = el('data').value;
        if (el('dose')) app.dose = el('dose').value;
        if (el('valor')) app.valorAplicado = el('valor').value;
    });
}

function formatDescontoPct(app) {
    const cheioNum = parseBRL(app._oportCheio);
    const valorEl = document.getElementById(`oport-valor-${app.id}`);
    const atualNum = parseBRL(valorEl ? valorEl.value : app.valorAplicado);
    if (!cheioNum) return '0,0';
    return (((cheioNum - atualNum) / cheioNum) * 100).toFixed(1).replace('.', ',');
}

function _recalcEditarOportunidadeTotal() {
    if (!_editarOportunidadePending) return;
    const total = _editarOportunidadePending.apps.reduce((s, app) => {
        const el = document.getElementById(`oport-valor-${app.id}`);
        return s + (parseBRL(el ? el.value : app.valorAplicado) || 0);
    }, 0);
    const totalEl = document.getElementById('oport-grupo-total');
    const count = _editarOportunidadePending.apps.length;
    if (totalEl) totalEl.textContent = `${count} vacina${count !== 1 ? 's' : ''} · ${formatCurrency(total)}`;
    _pintarDescontoTotalGrupo('oport-grupo');
}

function addOportunidadeLine() {
    if (!_editarOportunidadePending) return;
    _oportNewLineSeq++;
    _editarOportunidadePending.apps.push({
        id: `new_${Date.now()}_${_oportNewLineSeq}`,
        vaccineId: null,
        dose: '',
        data: new Date().toISOString().split('T')[0],
        pedido: '',
        valorAplicado: '',
        _oportCheio: '',
        _oportDescontoAtivo: false,
        _oportCortesia: false,
        _isNew: true
    });
    _renderEditarOportunidadeLines();
}

function removeOportunidadeLine(appId) {
    if (!_editarOportunidadePending) return;
    const line = _editarOportunidadePending.apps.find(a => a.id == appId);
    if (!line || !line._isNew) return;
    _editarOportunidadePending.apps = _editarOportunidadePending.apps.filter(a => a.id != appId);
    _renderEditarOportunidadeLines();
}

function _oportCheckAgeBlocked(vac, dtNasc, dataStr, doseVal) {
    if (!vac || !dtNasc) return null;
    const ageInfo = getAgeInMonths(dtNasc, dataStr || undefined);
    const totalMeses = ageInfo.years * 12 + ageInfo.months;
    const patStr = ageInfo.years > 0 && ageInfo.months > 0 ? `${ageInfo.years} ano(s) e ${ageInfo.months} mês(es)`
        : ageInfo.years > 0 ? `${ageInfo.years} ano(s)` : `${ageInfo.months} mês(es)`;

    if (doseVal === 'Dose Zero') {
        const minAgeDoseZero = (vac.doseZeroMinAnos || 0) * 12 + (vac.doseZeroMinMeses || 0);
        if (totalMeses < minAgeDoseZero) {
            return `paciente possui ${patStr}, abaixo da idade mínima exigida para a Dose Zero.`;
        }
        return null;
    }

    if (vac.esquemas && vac.esquemas.length > 0) {
        const encaixa = vac.esquemas.some(esq => {
            if (esq.minAnos == null) return true;
            const minTotal = (esq.minAnos || 0) * 12 + (esq.minMeses || 0);
            const hasMax = esq.maxAnos != null || esq.maxMeses != null;
            const maxTotal = hasMax ? ((esq.maxAnos || 0) * 12 + (esq.maxMeses || 0)) : Infinity;
            return totalMeses >= minTotal && totalMeses <= maxTotal;
        });
        if (!encaixa && !(typeof _patientMeetsDoseZero === 'function' && _patientMeetsDoseZero(vac, dtNasc, dataStr || undefined))) {
            return `paciente possui ${patStr} e não se enquadra em nenhuma faixa etária cadastrada para esta vacina.`;
        }
        return null;
    }

    const minAgeInMonths = (vac.idadeMinimaAnos || 0) * 12 + (vac.idadeMinimaMeses || 0);
    if (totalMeses < minAgeInMonths && !(typeof _patientMeetsDoseZero === 'function' && _patientMeetsDoseZero(vac, dtNasc, dataStr || undefined))) {
        return `paciente possui ${patStr}, abaixo da idade mínima exigida para esta vacina.`;
    }
    return null;
}

function _oportCheckDuplicidade(app, vac, doseVal) {
    const isDoseUnicaRepetivel = doseVal === 'Dose Única' && vac && vac.esquemas && vac.esquemas.some(e => e.numDoses === 1 && e.repete);
    const isReforco = reforcoIndexFromLabel(doseVal) != null;
    if (isDoseUnicaRepetivel || isReforco) return null;
    const patId = _editarOportunidadePending.patId;

    const duplExterno = appointments.find(x =>
        String(x.patientId) === String(patId) &&
        String(x.vaccineId) === String(app.vaccineId) &&
        x.doseAtual === doseVal &&
        x.status !== 'Perdido' &&
        String(x.id) !== String(app.id)
    );
    if (duplExterno) return `já existe registro de ${doseVal} da vacina ${vac ? vac.nome : ''} para este paciente.`;

    const duplInterno = _editarOportunidadePending.apps.find(other => {
        if (other.id === app.id || other.vaccineId != app.vaccineId) return false;
        const otherDoseEl = document.getElementById(`oport-dose-${other.id}`);
        return otherDoseEl && otherDoseEl.value === doseVal;
    });
    if (duplInterno) return `duas linhas desta edição estão com a mesma vacina e dose (${doseVal}).`;

    return null;
}

function _oportCheckDoseAnterior(app, doseVal) {
    if (!doseVal.includes('ª Dose') || doseVal === '1ª Dose') return null;
    const numAtual = parseInt(doseVal);
    const prevDoseStr = `${numAtual - 1}ª Dose`;
    const patId = _editarOportunidadePending.patId;

    const hasPrevExterno = appointments.some(x =>
        String(x.patientId) === String(patId) && x.vaccineId == app.vaccineId && x.doseAtual === prevDoseStr && String(x.id) !== String(app.id)
    );
    if (hasPrevExterno) return null;

    const hasPrevInterno = _editarOportunidadePending.apps.some(other => {
        if (other.id === app.id || other.vaccineId != app.vaccineId) return false;
        const otherDoseEl = document.getElementById(`oport-dose-${other.id}`);
        return otherDoseEl && otherDoseEl.value === prevDoseStr;
    });
    if (hasPrevInterno) return null;

    return prevDoseStr;
}

function confirmEditarOportunidade() {
    if (!_editarOportunidadePending) return;

    // Vacina e dose são obrigatórias em todas as linhas, além dos mesmos bloqueios
    // clínicos usados no agendamento individual (idade, duplicidade, dose anterior).
    for (const app of _editarOportunidadePending.apps) {
        const vac = vaccines.find(v => v.id == app.vaccineId);
        const doseEl = document.getElementById(`oport-dose-${app.id}`);
        const doseVal = doseEl ? doseEl.value : '';
        const dataEl = document.getElementById(`oport-data-${app.id}`);

        if (!app.vaccineId || !vac) {
            showNotification('Selecione a vacina em todas as linhas antes de salvar.', 'error');
            const el = document.getElementById(`oport-vacina-search-${app.id}`);
            if (el) { el.focus(); el.classList.add('border-red-400', 'ring-2', 'ring-red-200'); }
            return;
        }
        if (!doseVal) {
            showNotification(`Selecione a dose da vacina ${vac.nome} antes de salvar.`, 'error');
            if (doseEl) { doseEl.focus(); doseEl.classList.add('border-red-400', 'ring-2', 'ring-red-200'); }
            return;
        }

        const ageMsg = _oportCheckAgeBlocked(vac, _editarOportunidadePending.patDtNasc, dataEl ? dataEl.value : '', doseVal);
        if (ageMsg) {
            showNotification(`Bloqueado (${vac.nome}): ${ageMsg}`, 'error');
            return;
        }

        const duplMsg = _oportCheckDuplicidade(app, vac, doseVal);
        if (duplMsg) {
            showNotification(`Bloqueado: ${duplMsg}`, 'error');
            return;
        }

        const prevDoseFaltante = _oportCheckDoseAnterior(app, doseVal);
        if (prevDoseFaltante) {
            const confirmar = window.confirm(`Não foi encontrado registro da ${prevDoseFaltante} da vacina ${vac.nome} para este paciente.\n\nDeseja registrar a ${doseVal} mesmo assim?`);
            if (!confirmar) return;
        }
    }

    let vendedorNome = '';
    if (typeof currentUser !== 'undefined' && currentUser) {
        const _fullUser = appUsers.find(u => u.id === currentUser.id);
        if (_fullUser) vendedorNome = _fullUser.nome;
    }

    // Endereço de referência: as vacinas já salvas deste mesmo grupo.
    const _enderecoIrmaosOport = _editarOportunidadePending.apps
        .filter(app => !app._isNew)
        .map(app => appointments.find(a => a.id == app.id))
        .filter(Boolean);

    let novosCount = 0;
    _editarOportunidadePending.apps.forEach((app, i) => {
        const doseEl = document.getElementById(`oport-dose-${app.id}`);
        const pedidoEl = document.getElementById(`oport-pedido-${app.id}`);
        const dataEl = document.getElementById(`oport-data-${app.id}`);
        const valorEl = document.getElementById(`oport-valor-${app.id}`);
        const valor = valorEl ? valorEl.value : app.valorAplicado;
        const doseVal = doseEl ? doseEl.value : app.dose;
        const pedidoVal = pedidoEl ? pedidoEl.value.trim() : app.pedido;
        const dataVal = dataEl ? dataEl.value : app.data;
        const valorCheio = (app._oportDescontoAtivo || app._oportCortesia) ? app._oportCheio : null;
        const descontoPct = app._oportDescontoAtivo ? parseFloat(formatDescontoPct(app).replace(',', '.')) : null;
        const cortesia = app._oportCortesia || false;

        if (app._isNew) {
            novosCount++;
            const novoApp = {
                id: Date.now() + i,
                patientId: Number(_editarOportunidadePending.patId),
                vaccineId: Number(app.vaccineId),
                data: dataVal,
                hora: '',
                doseAtual: doseVal,
                valorAplicado: valor,
                valorCheio: valorCheio,
                descontoPct: descontoPct,
                cortesia: cortesia,
                status: _editarOportunidadePending.fromStatus,
                loteId: null,
                lote: '',
                motivoCancelamento: '',
                aplicadaOutroLocal: false,
                pedido: pedidoVal,
                vendedor: vendedorNome,
                aplicador: '',
                // Herda o endereço das vacinas já existentes do grupo
                endereco: (typeof enderecoParaNovoAgendamento === 'function')
                    ? enderecoParaNovoAgendamento(_editarOportunidadePending.patId, _enderecoIrmaosOport)
                    : null
            };
            appointments.push(novoApp);
            logAppointmentAudit(null, novoApp);
            if (typeof syncAppointmentMovement === 'function') syncAppointmentMovement(novoApp);
        } else {
            const idx = appointments.findIndex(a => a.id == app.id);
            if (idx === -1) return;
            const _auditBefore = { ...appointments[idx] };
            appointments[idx].vaccineId = app.vaccineId;
            appointments[idx].doseAtual = doseVal;
            appointments[idx].pedido = pedidoVal;
            appointments[idx].data = dataVal;
            appointments[idx].valorAplicado = valor;
            appointments[idx].valorCheio = valorCheio;
            appointments[idx].descontoPct = descontoPct;
            appointments[idx].cortesia = cortesia;
            logAppointmentAudit(_auditBefore, appointments[idx]);
            if (typeof syncAppointmentMovement === 'function') syncAppointmentMovement(appointments[idx]);
        }
    });

    saveAll(); renderTable(); renderDashboard();
    if (typeof refreshAlmoxIfActive === 'function') refreshAlmoxIfActive();
    if (typeof refreshOpenModals === 'function') refreshOpenModals();

    const count = _editarOportunidadePending.apps.length;
    closeEditarOportunidadeModal();
    renderKanban();
    showNotification(`Alterações salvas em ${count} vacina${count !== 1 ? 's' : ''}${novosCount ? ` (${novosCount} nova${novosCount !== 1 ? 's' : ''})` : ''}!`, 'success');
}

function closeEditarOportunidadeModal() {
    document.getElementById('modal-editar-grupo-oportunidade').classList.remove('active');
    _editarOportunidadePending = null;
}

// ─── DESCONTO NA OPORTUNIDADE (GRUPO) ────────────────────────────────────────

function openOportunidadeDescontoModal(appId) {
    if (!_editarOportunidadePending) return;
    const line = _editarOportunidadePending.apps.find(a => a.id == appId);
    if (!line) return;

    const valorEl = document.getElementById(`oport-valor-${appId}`);
    const valorAtual = valorEl ? valorEl.value : '';
    if (!valorAtual || (valorAtual === '0,00' && !line._oportCortesia)) {
        showNotification('Informe um valor antes de aplicar desconto.', 'error');
        return;
    }

    const base = (line._oportDescontoAtivo || line._oportCortesia) ? line._oportCheio : valorAtual;
    _oportunidadeDescontoTarget = appId;
    document.getElementById('oport-modal-desc-valor-cheio').textContent = 'R$ ' + base;
    document.getElementById('oport-desc-pct-input').value = '';
    document.getElementById('oport-desc-val-input').value = '';
    document.getElementById('oport-desc-preview').classList.add('hidden');
    document.getElementById('oport-desc-cortesia-check').checked = line._oportCortesia;
    toggleOportunidadeCortesia();
    switchOportunidadeDescontoTab('pct');
    document.getElementById('modal-desconto-oportunidade').classList.add('active');
}

function switchOportunidadeDescontoTab(tab) {
    _oportunidadeDescontoTab = tab;
    const isPct = tab === 'pct';
    document.getElementById('oport-desc-pct-panel').classList.toggle('hidden', !isPct);
    document.getElementById('oport-desc-val-panel').classList.toggle('hidden', isPct);
    const erro = document.getElementById('oport-desc-erro');
    if (erro) erro.classList.add('hidden');
    document.getElementById('oport-tab-desc-pct').className = `flex-1 py-2 transition text-[11px] font-black uppercase ${isPct ? 'bg-indigo-600 text-white' : 'bg-white text-slate-400 hover:bg-slate-50'}`;
    document.getElementById('oport-tab-desc-val').className = `flex-1 py-2 transition text-[11px] font-black uppercase ${!isPct ? 'bg-indigo-600 text-white' : 'bg-white text-slate-400 hover:bg-slate-50'}`;
    document.getElementById('oport-desc-preview').classList.add('hidden');
}

function setOportunidadeDescontoPct(pct) {
    document.getElementById('oport-desc-pct-input').value = pct;
    calcOportunidadeDescontoPreview();
}

function calcOportunidadeDescontoPreview() {
    const line = _editarOportunidadePending && _editarOportunidadePending.apps.find(a => a.id == _oportunidadeDescontoTarget);
    if (!line) return;
    const valorEl = document.getElementById(`oport-valor-${_oportunidadeDescontoTarget}`);
    const base = line._oportDescontoAtivo ? line._oportCheio : (valorEl ? valorEl.value : '');
    const baseNum = parseBRL(base);
    if (!baseNum) return;

    const preview = document.getElementById('oport-desc-preview');
    const erro = document.getElementById('oport-desc-erro');

    let finalNum = 0, pct = 0;
    if (_oportunidadeDescontoTab === 'pct') {
        pct = parseFloat(document.getElementById('oport-desc-pct-input').value) || 0;
        if (pct < 0 || pct > 100) {
            preview.classList.add('hidden');
            if (erro) { erro.textContent = 'Percentual deve ficar entre 0% e 100%.'; erro.classList.remove('hidden'); }
            return;
        }
        finalNum = baseNum * (1 - pct / 100);
    } else {
        const raw = document.getElementById('oport-desc-val-input').value;
        finalNum = parseBRL(raw);
        if (!raw) {
            preview.classList.add('hidden');
            if (erro) erro.classList.add('hidden');
            return;
        }
        if (finalNum < 0 || finalNum > baseNum) {
            preview.classList.add('hidden');
            if (erro) { erro.textContent = `Valor final não pode passar de R$ ${formatBRL(baseNum)}.`; erro.classList.remove('hidden'); }
            return;
        }
        pct = baseNum > 0 ? ((baseNum - finalNum) / baseNum) * 100 : 0;
    }
    if (erro) erro.classList.add('hidden');

    const economia = baseNum - finalNum;
    document.getElementById('oport-desc-preview-valor').textContent = 'R$ ' + formatBRL(finalNum);
    document.getElementById('oport-desc-preview-pct').textContent = pct.toFixed(1).replace('.', ',') + '% OFF';
    document.getElementById('oport-desc-preview-economia').textContent = 'R$ ' + formatBRL(economia);
    document.getElementById('oport-desc-preview').classList.remove('hidden');
}

function aplicarOportunidadeDesconto() {
    const line = _editarOportunidadePending && _editarOportunidadePending.apps.find(a => a.id == _oportunidadeDescontoTarget);
    if (!line) return;
    const valorEl = document.getElementById(`oport-valor-${_oportunidadeDescontoTarget}`);
    const isCortesia = document.getElementById('oport-desc-cortesia-check').checked;
    const base = (line._oportDescontoAtivo || line._oportCortesia) ? line._oportCheio : valorEl.value;
    const baseNum = parseBRL(base);

    if (isCortesia) {
        line._oportCheio = base;
        line._oportCortesia = true;
        line._oportDescontoAtivo = false;
        valorEl.value = '0,00';
        document.getElementById('modal-desconto-oportunidade').classList.remove('active');
        _syncOportLinesFromDom();
        _renderEditarOportunidadeLines();
        showNotification('Vacina marcada como cortesia!', 'success');
        return;
    }

    let finalNum = 0, pct = 0;
    if (_oportunidadeDescontoTab === 'pct') {
        pct = parseFloat(document.getElementById('oport-desc-pct-input').value) || 0;
        if (pct <= 0 || pct > 100) { showNotification('Informe um percentual entre 0,1% e 100%.', 'error'); return; }
        finalNum = baseNum * (1 - pct / 100);
    } else {
        finalNum = parseBRL(document.getElementById('oport-desc-val-input').value);
        if (finalNum <= 0 || finalNum > baseNum) { showNotification('Informe um valor final válido.', 'error'); return; }
        pct = baseNum > 0 ? ((baseNum - finalNum) / baseNum) * 100 : 0;
    }

    line._oportCheio = base;
    line._oportCortesia = false;
    line._oportDescontoAtivo = true;
    valorEl.value = formatBRL(finalNum);
    document.getElementById('modal-desconto-oportunidade').classList.remove('active');
    _syncOportLinesFromDom();
    _renderEditarOportunidadeLines();
    showNotification('Desconto aplicado com sucesso!', 'success');
}

function toggleOportunidadeCortesia() {
    const isCortesia = document.getElementById('oport-desc-cortesia-check').checked;
    const tabs = document.getElementById('oport-desc-tabs-container');
    if (tabs) tabs.classList.toggle('hidden', isCortesia);
    document.getElementById('oport-desc-preview').classList.add('hidden');
    if (isCortesia) {
        document.getElementById('oport-desc-pct-panel').classList.add('hidden');
        document.getElementById('oport-desc-val-panel').classList.add('hidden');
    } else {
        switchOportunidadeDescontoTab(_oportunidadeDescontoTab);
    }
}

function removerOportunidadeDesconto(appId) {
    const line = _editarOportunidadePending && _editarOportunidadePending.apps.find(a => a.id == appId);
    if (!line || (!line._oportDescontoAtivo && !line._oportCortesia)) return;
    const valorEl = document.getElementById(`oport-valor-${appId}`);
    if (valorEl && line._oportCheio) valorEl.value = line._oportCheio;
    line._oportDescontoAtivo = false;
    line._oportCortesia = false;
    line._oportCheio = '';
    _syncOportLinesFromDom();
    _renderEditarOportunidadeLines();
}

function closeOportunidadeDescontoModal() {
    document.getElementById('modal-desconto-oportunidade').classList.remove('active');
    _oportunidadeDescontoTarget = null;
}

function openAplicarGrupoModal(patId, fromStatus, groupApps) {
    groupApps = groupApps.filter(a => !a.importedCPNI); // registros importados do CPNI não entram em ações de grupo
    if (!checkPerm('aplicar')) return;
    if (!isCurrentUserAdmin() && !hasPerm('aplicar')) {
        showNotification('Apenas usuários com permissão de aplicador podem registrar aplicações.', 'error');
        return;
    }

    // A taxa da visita mora no endereço de uma das vacinas do grupo (a que a
    // carrega). Aqui ela é editada como um item único, e na confirmação volta
    // para essa mesma vacina — nunca replicada nas irmãs.
    const _donaTaxa = groupApps.find(a => typeof getTaxaDeslocamento === 'function'
        && getTaxaDeslocamento(a.endereco) > 0);
    const _refEnd = (_donaTaxa || groupApps[0] || {}).endereco || null;
    const _permiteTaxa = typeof taxaLocalPermite === 'function'
        && taxaLocalPermite(_refEnd && _refEnd.localAplicacao);

    _aplicarGrupoPending = {
        patId: String(patId),
        fromStatus,
        taxaDonaId: _donaTaxa ? _donaTaxa.id : (groupApps[0] ? groupApps[0].id : null),
        taxaPermitida: _permiteTaxa,
        taxaValor: _permiteTaxa && typeof getTaxaDeslocamento === 'function'
            ? getTaxaDeslocamento(_refEnd) : 0,
        taxaPaga: _permiteTaxa && typeof getTaxaPaga === 'function'
            ? getTaxaPaga(_refEnd) : false,
        apps: groupApps.map(a => ({
            id: a.id,
            vaccineId: a.vaccineId,
            dose: a.doseAtual,
            data: a.data || new Date().toISOString().split('T')[0],
            hora: a.hora || '',
            loteId: a.loteId || '',
            aplicador: a.aplicador || (currentUser ? currentUser.nome : ''),
            pedido: a.pedido || a.pedidoNumero || '',
            pago: !!a.pago
        }))
    };
    _aplicarGrupoRemovedIds = new Set();
    _aplicarGrupoRemovePending = null;

    const pat = patients.find(p => p.id == patId);
    const titleEl = document.getElementById('aplicar-grupo-paciente');
    if (titleEl) titleEl.textContent = pat ? pat.nome : '—';

    const fromEl = document.getElementById('aplicar-grupo-from-status');
    if (fromEl) fromEl.textContent = fromStatus;

    const countEl = document.getElementById('aplicar-grupo-count');
    if (countEl) countEl.textContent = groupApps.length + ' vacina' + (groupApps.length !== 1 ? 's' : '');

    _renderAplicarGrupoLines();
    document.getElementById('modal-aplicar-grupo').classList.add('active');
}

function toggleAplicarGrupoPago(appId) {
    if (!_aplicarGrupoPending) return;
    const line = _aplicarGrupoPending.apps.find(a => a.id == appId);
    if (!line) return;
    line.pago = !line.pago;
    _paintGrupoPagoBtn('Aplicar', line);
    _checkAplicarGrupoBtn();
}

// ─── TAXA DE DESLOCAMENTO NO APLICAR GRUPO ───────────────────────────────────
// Um único par (valor, paga) para a visita inteira. Repinta só o próprio bloco:
// re-renderizar as linhas apagaria pedido/lote já digitados.

function onAplicarGrupoTaxaInput(input) {
    if (!_aplicarGrupoPending) return;
    if (typeof maskCurrency === 'function') maskCurrency(input);
    _aplicarGrupoPending.taxaValor = parseBRL(input.value) || 0;
    if (_aplicarGrupoPending.taxaValor <= 0) _aplicarGrupoPending.taxaPaga = false;
    _paintAplicarGrupoTaxa();
    _checkAplicarGrupoBtn();
}

function toggleAplicarGrupoTaxaPaga() {
    if (!_aplicarGrupoPending) return;
    if ((_aplicarGrupoPending.taxaValor || 0) <= 0) return;
    _aplicarGrupoPending.taxaPaga = !_aplicarGrupoPending.taxaPaga;
    _paintAplicarGrupoTaxa();
    _checkAplicarGrupoBtn();
}

function _paintAplicarGrupoTaxa() {
    if (!_aplicarGrupoPending) return;
    const btn = document.getElementById('aplicar-grupo-taxa-pago-btn');
    const on = !!_aplicarGrupoPending.taxaPaga;
    const vazia = (_aplicarGrupoPending.taxaValor || 0) <= 0;
    if (btn) {
        btn.className = on
            ? 'flex items-center justify-center gap-2 border-2 border-emerald-600 bg-emerald-600 rounded-lg py-2 px-3 text-white text-[11px] font-black uppercase tracking-wide transition hover:bg-emerald-700'
            : 'flex items-center justify-center gap-2 border-2 border-slate-200 bg-white rounded-lg py-2 px-3 text-slate-400 text-[11px] font-black uppercase tracking-wide transition hover:border-emerald-300';
        btn.disabled = vazia;
        btn.classList.toggle('opacity-50', vazia);
        btn.classList.toggle('cursor-not-allowed', vazia);
        const ico = document.getElementById('aplicar-grupo-taxa-pago-icone');
        const txt = document.getElementById('aplicar-grupo-taxa-pago-texto');
        if (ico) ico.className = on ? 'fas fa-circle-check text-xs' : 'fas fa-circle-xmark text-xs';
        if (txt) txt.textContent = on ? 'Taxa paga' : 'Taxa não paga';
    }
    _paintAplicarGrupoTotal();
}

function _paintAplicarGrupoTotal() {
    if (!_aplicarGrupoPending) return;
    const totalEl = document.getElementById('aplicar-grupo-total');
    if (!totalEl) return;
    const activeApps = _aplicarGrupoPending.apps.filter(a => !_aplicarGrupoRemovedIds.has(a.id));
    const taxa = _aplicarGrupoPending.taxaPermitida ? (_aplicarGrupoPending.taxaValor || 0) : 0;
    const qtd = `${activeApps.length} vacina${activeApps.length !== 1 ? 's' : ''}`;
    // Soma os valores já gravados nos agendamentos: aqui as linhas não editam valor.
    const totalVacinas = activeApps.reduce((s, l) => {
        const app = appointments.find(a => a.id == l.id);
        return s + (app ? parseBRL(app.valorAplicado) : 0);
    }, 0);
    totalEl.textContent = taxa > 0
        ? `${qtd} · R$ ${formatBRL(totalVacinas)} + taxa R$ ${formatBRL(taxa)} = R$ ${formatBRL(totalVacinas + taxa)}`
        : `${qtd} · R$ ${formatBRL(totalVacinas)}`;
}

function _renderAplicarGrupoLines() {
    if (!_aplicarGrupoPending) return;
    const container = document.getElementById('aplicar-grupo-lines');
    if (!container) return;

    const lines = _aplicarGrupoPending.apps;
    const removedIds = _aplicarGrupoRemovedIds;
    const fromStatus = _aplicarGrupoPending.fromStatus;

    container.innerHTML = lines.map(app => {
        const vac = vaccines.find(v => v.id == app.vaccineId);
        const isRemoved = removedIds.has(app.id);
        const isConfirming = _aplicarGrupoRemovePending === app.id;
        const nomVac = vac ? vac.nome : '—';
        const aplicadorVal = app.aplicador ? app.aplicador.toUpperCase() : '';
        const aplicadoresValidos = (() => {
            const lista = (appUsers || []).filter(u => u.isAplicador && u.ativo !== false)
                .map(u => u.nome ? u.nome.toUpperCase() : '').filter(Boolean);
            return [...new Set(lista)].sort();
        })();
        const aplicadorItemsHtml = aplicadoresValidos.map(n =>
            `<div class="px-3 py-1.5 text-xs text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 cursor-pointer rounded aplicar-grupo-aplic-item" data-nome="${n.replace(/"/g,'&quot;')}" onmousedown="_selectAplicador(this)">${n}</div>`
        ).join('') || '<div class="px-3 py-1.5 text-xs text-slate-400 italic">Nenhum aplicador habilitado</div>';
        const dateVal = app.data || new Date().toISOString().split('T')[0];

        if (isRemoved) {
            return `<div class="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-50 border border-dashed border-slate-200">
                <i class="fas fa-syringe text-slate-300 text-xs shrink-0"></i>
                <div class="flex-1 min-w-0">
                    <p class="text-[11px] font-black text-slate-400 line-through truncate">${nomVac}</p>
                    <p class="text-[10px] text-slate-400">${app.dose}</p>
                </div>
                <span class="text-[9px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full whitespace-nowrap">Mantido em ${fromStatus}</span>
                <button onclick="undoRemoveAplicarGrupoLine(${app.id})" class="h-7 w-7 rounded-lg bg-slate-100 hover:bg-indigo-100 text-slate-400 hover:text-indigo-600 flex items-center justify-center transition shrink-0" title="Restaurar">
                    <i class="fas fa-undo text-[9px]"></i>
                </button>
            </div>`;
        }

        if (isConfirming) {
            return `<div class="flex flex-col gap-2 px-3 py-2.5 rounded-xl bg-red-50 border-2 border-red-300 transition">
                <div class="flex items-center gap-2">
                    <i class="fas fa-exclamation-triangle text-red-500 text-xs shrink-0"></i>
                    <div class="flex-1 min-w-0">
                        <p class="text-[11px] font-black text-red-700 truncate">${nomVac} — ${app.dose}</p>
                        <p class="text-[10px] text-red-600">Esta vacina ficará em <strong>${fromStatus}</strong></p>
                    </div>
                </div>
                <div class="flex gap-2">
                    <button onclick="cancelRemoveAplicarGrupoLine()" class="flex-1 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 text-[10px] font-black uppercase tracking-wider hover:bg-slate-50 transition">Cancelar</button>
                    <button onclick="executeRemoveAplicarGrupoLine(${app.id})" class="flex-1 py-1.5 rounded-lg bg-red-600 text-white text-[10px] font-black uppercase tracking-wider hover:bg-red-700 transition shadow-sm">Remover</button>
                </div>
            </div>`;
        }

        const openLots = vaccineLots.filter(l => l.vaccineId == app.vaccineId && (l.status === 'aberto' || l.id == app.loteId))
            .sort((a, b) => new Date(a.validade) - new Date(b.validade));
        const loteOptions = openLots.length
            ? openLots.map(l => {
                const disp = (typeof getLoteDisponivelParaAgendamento === 'function') ? getLoteDisponivelParaAgendamento(l.id, app.id) : null;
                const disabled = disp != null && disp <= 0 && l.id != app.loteId;
                const dispStr = disp != null ? ` (disp: ${Math.max(0, disp)})` : '';
                const label = `Lote ${l.numero} — Val: ${l.validade.split('-').reverse().join('/')}${dispStr}${disabled ? ' — sem estoque' : ''}`;
                return `<option value="${l.id}" ${l.id == app.loteId ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${label}</option>`;
            }).join('')
            : '<option value="">Sem lotes disponíveis</option>';

        return `<div class="flex flex-col gap-3 px-3 py-3 rounded-xl bg-white border border-slate-200 hover:border-slate-300 transition">
                <div class="flex items-center gap-3">
                    <i class="fas fa-syringe text-indigo-400 text-xs shrink-0"></i>
                    <div class="flex-1 min-w-0">
                        <p class="text-[11px] font-black text-navy-900 truncate leading-tight flex items-center gap-1.5">${nomVac}${vac && vac.mnemonico ? `<span class="inline-flex items-center bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full text-[9px] font-black normal-case shrink-0">${vac.mnemonico}</span>` : ''}</p>
                        <p class="text-[10px] text-slate-500">${app.dose}</p>
                    </div>
                    ${_grupoPagoBtn('Aplicar', app)}
                    <button onclick="removeAplicarGrupoLine(${app.id})"
                        class="h-7 w-7 rounded-lg bg-red-50 hover:bg-red-500 text-red-400 hover:text-white flex items-center justify-center transition shrink-0" title="Remover desta lista">
                        <i class="fas fa-times text-[9px]"></i>
                    </button>
                </div>
                <div class="grid gap-2" style="grid-template-columns: 0.8fr 1fr 0.7fr 1.3fr 1.3fr;">
                    <div class="flex flex-col">
                        <label class="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Nº Pedido</label>
                        <input type="text" id="aplicar-grupo-pedido-${app.id}" value="${app.pedido || ''}" placeholder="Nº do pedido..." oninput="_checkAplicarGrupoBtn()"
                            class="w-full border border-slate-200 rounded-lg py-2 px-2.5 text-xs text-slate-700 focus:ring-2 focus:ring-blue-400 outline-none bg-slate-50">
                    </div>
                    <div class="flex flex-col">
                        <label class="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Data da Aplicação</label>
                        <input type="date" id="aplicar-grupo-date-${app.id}" value="${dateVal}"
                            class="w-full border border-slate-200 rounded-lg py-2 px-2.5 text-xs text-slate-700 focus:ring-2 focus:ring-blue-400 outline-none bg-slate-50">
                    </div>
                    <div class="flex flex-col">
                        <label class="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Hora</label>
                        <input type="time" id="aplicar-grupo-hora-${app.id}" value="${app.hora || ''}"
                            class="w-full border border-slate-200 rounded-lg py-2 px-2.5 text-xs text-slate-700 focus:ring-2 focus:ring-blue-400 outline-none bg-slate-50">
                    </div>
                    <div class="flex flex-col">
                        <label class="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Lote</label>
                        <select id="aplicar-grupo-lote-${app.id}"
                            class="w-full border border-slate-200 rounded-lg py-2 px-2.5 text-xs text-slate-700 focus:ring-2 focus:ring-blue-400 outline-none bg-slate-50">
                            <option value="">Selecione o lote...</option>
                            ${loteOptions}
                        </select>
                    </div>
                    <div class="flex flex-col">
                        <label class="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Aplicador</label>
                        <div class="relative aplicar-grupo-aplic-wrap">
                            <input type="text" id="aplicar-grupo-aplicador-${app.id}" value="${aplicadorVal}" autocomplete="off"
                                class="w-full border border-slate-200 rounded-lg py-2 px-2.5 text-xs text-slate-700 focus:ring-2 focus:ring-blue-400 outline-none bg-slate-50"
                                placeholder="Digite ou selecione..."
                                oninput="_filterAplicadorDropdown(this)"
                                onfocus="_openAplicadorDropdown(this)"
                                onblur="_closeAplicadorDropdown(this)">
                            <div id="aplicar-grupo-aplic-drop-${app.id}"
                                class="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg hidden max-h-40 overflow-y-auto aplicar-grupo-aplic-drop py-1">
                                ${aplicadorItemsHtml}
                            </div>
                        </div>
                    </div>
                </div>
        </div>`;
    }).join('');

    // Taxa só aparece em visita domiciliar; fora dela o bloco fica oculto.
    const taxaWrap = document.getElementById('aplicar-grupo-taxa-wrap');
    if (taxaWrap) taxaWrap.classList.toggle('hidden', !_aplicarGrupoPending.taxaPermitida);
    const taxaInput = document.getElementById('aplicar-grupo-taxa-valor');
    if (taxaInput) {
        const v = _aplicarGrupoPending.taxaValor || 0;
        taxaInput.value = v > 0 ? formatBRL(v) : '';
    }
    _paintAplicarGrupoTaxa();

    _checkAplicarGrupoBtn();
}

function _checkAplicarGrupoBtn() {
    if (!_aplicarGrupoPending) return;
    const activeApps = _aplicarGrupoPending.apps.filter(a => !_aplicarGrupoRemovedIds.has(a.id));
    const btn = document.getElementById('btn-confirm-aplicar-grupo');
    if (!btn) return;
    const allPedidosPreenchidos = activeApps.every(app => {
        const el = document.getElementById(`aplicar-grupo-pedido-${app.id}`);
        return el && el.value.trim().length > 0;
    });
    // Aplicado exige pagamento em toda linha — mesma regra do formulário.
    const todasPagas = activeApps.every(app => !!app.pago);
    // A taxa da visita entra na mesma exigência: se foi cobrada, tem de estar paga.
    const taxaCobrada = _aplicarGrupoPending.taxaPermitida && (_aplicarGrupoPending.taxaValor || 0) > 0;
    const taxaOk = !taxaCobrada || !!_aplicarGrupoPending.taxaPaga;
    const canConfirm = activeApps.length > 0 && allPedidosPreenchidos && todasPagas && taxaOk;
    btn.disabled = !canConfirm;
    btn.className = canConfirm
        ? 'flex-1 bg-green-600 text-white font-black py-3 rounded-xl uppercase text-xs transition hover:bg-green-700 cursor-pointer shadow-md'
        : 'flex-1 bg-green-200 text-emerald-400 font-black py-3 rounded-xl uppercase text-xs cursor-not-allowed';
    btn.title = canConfirm ? '' :
        (!todasPagas ? 'Marque o pagamento de todas as vacinas para registrar a aplicação.'
        : !taxaOk ? 'Marque a taxa de deslocamento como paga para registrar a aplicação.'
        : 'Preencha o Nº do pedido de cada vacina.');
}

function _openAplicadorDropdown(input) {
    const drop = input.parentElement.querySelector('.aplicar-grupo-aplic-drop');
    if (drop) { drop.classList.remove('hidden'); _filterAplicadorDropdown(input); }
}

function _closeAplicadorDropdown(input) {
    const drop = input.parentElement.querySelector('.aplicar-grupo-aplic-drop');
    if (drop) setTimeout(() => drop.classList.add('hidden'), 150);
}

function _filterAplicadorDropdown(input) {
    const drop = input.parentElement.querySelector('.aplicar-grupo-aplic-drop');
    if (!drop) return;
    drop.classList.remove('hidden');
    const q = input.value.trim().toUpperCase();
    drop.querySelectorAll('.aplicar-grupo-aplic-item').forEach(el => {
        el.classList.toggle('hidden', q.length > 0 && !el.dataset.nome.includes(q));
    });
}

function _selectAplicador(item) {
    const drop = item.closest('.aplicar-grupo-aplic-drop');
    const wrap = item.closest('.aplicar-grupo-aplic-wrap');
    const input = wrap ? wrap.querySelector('input') : null;
    if (input) { input.value = item.dataset.nome; input.classList.remove('border-red-400','ring-red-200'); }
    if (drop) drop.classList.add('hidden');
}

function removeAplicarGrupoLine(appId) {
    _aplicarGrupoRemovePending = appId;
    _renderAplicarGrupoLines();
}

function cancelRemoveAplicarGrupoLine() {
    _aplicarGrupoRemovePending = null;
    _renderAplicarGrupoLines();
}

function executeRemoveAplicarGrupoLine(appId) {
    _aplicarGrupoRemovedIds.add(appId);
    _aplicarGrupoRemovePending = null;
    _renderAplicarGrupoLines();
}

function undoRemoveAplicarGrupoLine(appId) {
    _aplicarGrupoRemovedIds.delete(appId);
    _renderAplicarGrupoLines();
}

function confirmAplicarGrupo() {
    if (!_aplicarGrupoPending) return;

    const activeApps = _aplicarGrupoPending.apps.filter(a => !_aplicarGrupoRemovedIds.has(a.id));
    if (!activeApps.length) {
        showNotification('Nenhuma vacina ativa para aplicar.', 'error');
        return;
    }

    const dateMap = {};
    const horaMap = {};
    const loteMap = {};
    const aplicadorMap = {};
    const pedidoMap = {};

    for (const app of activeApps) {
        const pedidoInput = document.getElementById(`aplicar-grupo-pedido-${app.id}`);
        const dateInput = document.getElementById(`aplicar-grupo-date-${app.id}`);
        const horaInput = document.getElementById(`aplicar-grupo-hora-${app.id}`);
        const loteSel = document.getElementById(`aplicar-grupo-lote-${app.id}`);
        const aplicadorInput = document.getElementById(`aplicar-grupo-aplicador-${app.id}`);
        const pedido = pedidoInput ? pedidoInput.value.trim() : '';
        const data = dateInput ? dateInput.value : '';
        const loteId = loteSel ? loteSel.value : '';
        const aplicador = aplicadorInput ? aplicadorInput.value.trim() : '';
        const nomVac = vaccines.find(v => v.id == app.vaccineId)?.nome || 'vacina';

        if (!pedido) {
            showNotification(`Informe o número do pedido para "${nomVac}".`, 'error');
            if (pedidoInput) { pedidoInput.focus(); pedidoInput.classList.add('border-red-400', 'ring-2', 'ring-red-200'); }
            return;
        }
        if (!data) {
            showNotification(`Informe a data de aplicação de "${nomVac}".`, 'error');
            if (dateInput) { dateInput.focus(); dateInput.classList.add('border-red-400', 'ring-2', 'ring-red-200'); }
            return;
        }
        if (typeof holidays !== 'undefined' && holidays.includes(data)) {
            showNotification('Bloqueio: Uma das datas está marcada como feriado.', 'error');
            return;
        }
        if (new Date(data + 'T00:00:00').getDay() === 0) {
            showNotification('Bloqueio: aplicações aos domingos não são permitidas.', 'error');
            return;
        }
        if (!loteId) {
            showNotification(`Selecione o lote para "${nomVac}".`, 'error');
            if (loteSel) loteSel.focus();
            return;
        }
        if (!aplicador) {
            showNotification(`Informe o aplicador para "${nomVac}".`, 'error');
            if (aplicadorInput) { aplicadorInput.focus(); aplicadorInput.classList.add('border-red-400','ring-2','ring-red-200'); }
            return;
        }
        // Aplicado exige pagamento registrado — a dose sai do estoque agora.
        if (!app.pago) {
            showNotification(`Marque o pagamento como <b>Pago</b> para aplicar "${nomVac}".`, 'error');
            document.getElementById(`aplicar-grupo-pago-${app.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return;
        }
        const aplicadoresPermitidos = (appUsers || []).filter(u => u.isAplicador && u.ativo !== false)
            .map(u => u.nome ? u.nome.toUpperCase() : '').filter(Boolean);
        if (!aplicadoresPermitidos.includes(aplicador.toUpperCase())) {
            showNotification(`Aplicador inválido para "${nomVac}". Selecione um aplicador habilitado.`, 'error');
            if (aplicadorInput) { aplicadorInput.focus(); aplicadorInput.classList.add('border-red-400','ring-2','ring-red-200'); }
            return;
        }
        if (typeof getLoteDisponivelParaAgendamento === 'function') {
            const disp = getLoteDisponivelParaAgendamento(Number(loteId), app.id);
            if (disp <= 0 && Number(loteId) !== app.loteId) {
                showNotification(`Lote sem estoque para "${nomVac}".`, 'error');
                if (loteSel) loteSel.focus();
                return;
            }
        }

        dateMap[app.id] = data;
        horaMap[app.id] = horaInput ? horaInput.value : '';
        loteMap[app.id] = loteId;
        aplicadorMap[app.id] = aplicador;
        pedidoMap[app.id] = pedido;
    }

    // A dona da taxa pode ter sido removida do grupo: a cobrança da visita passa
    // para a primeira vacina que restou, para não se perder nem duplicar.
    if (_aplicarGrupoPending.taxaPermitida
        && !activeApps.some(a => a.id == _aplicarGrupoPending.taxaDonaId)) {
        _aplicarGrupoPending.taxaDonaId = activeApps.length ? activeApps[0].id : null;
    }

    // Taxa cobrada segue a regra do pagamento da dose: sem ela paga, não aplica.
    const _taxaCobrada = _aplicarGrupoPending.taxaPermitida && (_aplicarGrupoPending.taxaValor || 0) > 0;
    if (_taxaCobrada && !_aplicarGrupoPending.taxaPaga) {
        showNotification('Marque a <b>taxa de deslocamento</b> como paga para registrar a aplicação.', 'error');
        document.getElementById('aplicar-grupo-taxa-pago-btn')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
    }

    const _auditBefore = auditSnapshotAppointments(activeApps.map(a => a.id));
    activeApps.forEach(app => {
        const idx = appointments.findIndex(a => a.id == app.id);
        if (idx > -1) {
            // A taxa da visita é gravada em uma única vacina; as demais ficam zeradas.
            if (_aplicarGrupoPending.taxaPermitida && appointments[idx].endereco) {
                const dona = app.id == _aplicarGrupoPending.taxaDonaId;
                appointments[idx].endereco = {
                    ...appointments[idx].endereco,
                    taxaDeslocamento: dona ? (_aplicarGrupoPending.taxaValor || 0) : 0,
                    taxaPaga: dona ? !!_aplicarGrupoPending.taxaPaga : false
                };
            }
            const loteId = Number(loteMap[app.id]);
            const lote = vaccineLots.find(l => l.id == loteId);
            appointments[idx].status = 'Aplicado';
            appointments[idx].data = dateMap[app.id];
            appointments[idx].hora = horaMap[app.id] || appointments[idx].hora || '';
            appointments[idx].loteId = loteId;
            appointments[idx].lote = lote ? lote.numero.toUpperCase() : '';
            appointments[idx].aplicador = aplicadorMap[app.id].toUpperCase();
            appointments[idx].pedido = pedidoMap[app.id];
            if (typeof aplicarPagoAgendamento === 'function') {
                aplicarPagoAgendamento(appointments[idx], app.pago, _auditBefore.get(String(app.id)));
            }
            if (typeof syncAppointmentMovement === 'function') syncAppointmentMovement(appointments[idx]);
        }
    });
    logAppointmentAuditMany(_auditBefore);

    if (typeof syncAllLoteStatus === 'function') syncAllLoteStatus();
    saveAll(); renderCalendar(); renderTable(); renderDashboard(); renderKanban();
    if (typeof refreshAlmoxIfActive === 'function') refreshAlmoxIfActive();
    if (typeof refreshOpenModals === 'function') refreshOpenModals();

    const count = activeApps.length;
    closeAplicarGrupoModal();
    showNotification(`${count} vacina${count !== 1 ? 's' : ''} aplicada${count !== 1 ? 's' : ''} com sucesso!`, 'success');
}

function closeAplicarGrupoModal() {
    document.getElementById('modal-aplicar-grupo').classList.remove('active');
    _aplicarGrupoPending = null;
    _aplicarGrupoRemovedIds = new Set();
    _aplicarGrupoRemovePending = null;
}

// ─── MODAL: MOVER GRUPO PARA PERDIDO ─────────────────────────────────────────

function openMoverGrupoPerdidoModal(patId, fromStatus, groupApps) {
    groupApps = groupApps.filter(a => !a.importedCPNI); // registros importados do CPNI não entram em ações de grupo
    _moverGrupoPerdidoPending = { patId: String(patId), fromStatus, apps: groupApps };

    const pat = patients.find(p => p.id == patId);
    const infoEl = document.getElementById('grupo-perdido-paciente');
    if (infoEl) infoEl.textContent = pat ? pat.nome : '—';

    const contEl = document.getElementById('grupo-perdido-count');
    if (contEl) contEl.textContent = `${groupApps.length} vacina${groupApps.length !== 1 ? 's' : ''} em "${fromStatus}"`;

    const listEl = document.getElementById('grupo-perdido-list');
    if (listEl) {
        listEl.innerHTML = groupApps.map(a => {
            const vac = vaccines.find(v => v.id == a.vaccineId);
            return `<div class="flex items-center gap-2 text-[11px] text-slate-600 py-1 border-b border-slate-100 last:border-0">
                <i class="fas fa-syringe text-red-300 text-[9px] shrink-0"></i>
                <span class="font-bold truncate">${vac ? vac.nome : '—'}</span>
                <span class="text-slate-400">·</span>
                <span class="text-slate-500">${a.doseAtual}</span>
            </div>`;
        }).join('');
    }

    const sel = document.getElementById('grupo-perdido-reason');
    if (sel) {
        sel.innerHTML = '<option value="">Selecione o motivo...</option>' +
            (typeof cancelReasons !== 'undefined' ? cancelReasons : []).map(r => `<option value="${r}">${r}</option>`).join('');
        sel.value = '';
    }

    document.getElementById('grupo-perdido-err').classList.add('hidden');
    document.getElementById('modal-grupo-perdido').classList.add('active');
}

function closeMoverGrupoPerdidoModal() {
    document.getElementById('modal-grupo-perdido').classList.remove('active');
    _moverGrupoPerdidoPending = null;
}

function confirmMoverGrupoPerdido() {
    const reason = document.getElementById('grupo-perdido-reason').value;
    if (!reason) {
        document.getElementById('grupo-perdido-err').classList.remove('hidden');
        return;
    }
    if (!_moverGrupoPerdidoPending) return;

    const { apps } = _moverGrupoPerdidoPending;
    const _auditBefore = auditSnapshotAppointments(apps.map(a => a.id));
    apps.forEach(a => {
        const idx = appointments.findIndex(x => x.id == a.id);
        if (idx > -1) {
            appointments[idx].status = 'Perdido';
            appointments[idx].motivoCancelamento = reason;
            if (typeof syncAppointmentMovement === 'function') syncAppointmentMovement(appointments[idx]);
        }
    });
    logAppointmentAuditMany(_auditBefore);

    if (typeof syncAllLoteStatus === 'function') syncAllLoteStatus();
    saveAll(); renderCalendar(); renderDashboard();
    renderKanban();
    if (typeof refreshAlmoxIfActive === 'function') refreshAlmoxIfActive();
    if (typeof refreshOpenModals === 'function') refreshOpenModals();

    const count = apps.length;
    closeMoverGrupoPerdidoModal();
    showNotification(`${count} vacina${count !== 1 ? 's' : ''} marcada${count !== 1 ? 's' : ''} como perdida${count !== 1 ? 's' : ''}.`, 'info');
}


