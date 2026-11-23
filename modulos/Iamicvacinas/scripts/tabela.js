// ─── TABLE VIEW (from index.html lines ~3535-3709) ────────────────────────────

function setSortTable(field) {
    if(tableSortField === field) {
        tableSortDir = tableSortDir === 'asc' ? 'desc' : 'asc';
    } else {
        tableSortField = field;
        tableSortDir = 'asc';
    }
    ['data','paciente','vacina','status'].forEach(f => {
        const icon = document.getElementById(`sort-icon-${f}`);
        if(!icon) return;
        if(f === tableSortField) {
            icon.className = `fas ${tableSortDir === 'asc' ? 'fa-sort-up' : 'fa-sort-down'} text-clinic-400`;
        } else {
            icon.className = 'fas fa-sort text-slate-500';
        }
    });
    renderTableReset();
}

function toggleTableFilter(wrapId, focusId, isSelect) {
    const wrap = document.getElementById(wrapId);
    const isOpen = wrap.style.maxWidth !== '0px' && wrap.style.maxWidth !== '0';
    if (isOpen) {
        wrap.style.maxWidth = '0';
        wrap.style.opacity = '0';
        if (focusId) { document.getElementById(focusId).value = ''; renderTableReset(); }
        if (isSelect) {
            const sel = wrap.querySelector('select');
            if (sel) { sel.value = ''; renderTableReset(); }
        }
    } else {
        wrap.style.maxWidth = '240px';
        wrap.style.opacity = '1';
        if (focusId) setTimeout(() => document.getElementById(focusId).focus(), 310);
    }
}

function getStartOfWeek(date) { const d = new Date(date); const day = d.getDay(); const diff = d.getDate() - day; return new Date(d.setDate(diff)); }

function _populateTableColabDropdowns() {
    const dateFilter = document.getElementById('filter-date-agenda').value;
    const monthFilter = document.getElementById('filter-month-agenda').value;
    const todayStr = new Date().toISOString().split('T')[0];
    const startOfWeek = (typeof getFilterWeekStart === 'function' ? getFilterWeekStart() : getStartOfWeek(new Date())).toISOString().split('T')[0];
    const endOfWeek = new Date(new Date(startOfWeek).setDate(new Date(startOfWeek).getDate()+6)).toISOString().split('T')[0];

    const byDate = appointments.filter(a => {
        let matchDate = true;
        if (dateFilter === 'diario' || dateFilter === 'hoje') {
            const dayValue = document.getElementById('filter-day-agenda')?.value || todayStr;
            matchDate = a.data === dayValue;
        } else if (dateFilter === 'semana') matchDate = a.data >= startOfWeek && a.data <= endOfWeek;
        else if (dateFilter === 'mes' && monthFilter) matchDate = a.data.startsWith(monthFilter);
        return matchDate;
    });

    const curVend = document.getElementById('filter-vendedor-agenda').value;
    const vendedoresNoPeriodo = [...new Set(byDate.filter(a => a.vendedor).map(a => a.vendedor))].sort();
    _renderVendedorPopoverList(vendedoresNoPeriodo);
    if (curVend && curVend !== '__mine__' && !vendedoresNoPeriodo.includes(curVend)) {
        document.getElementById('filter-vendedor-agenda').value = '';
        _updateVendedorBtn('');
    }

    const aplicadorSel = document.getElementById('filter-aplicador-agenda');
    const curApl = aplicadorSel.value;
    aplicadorSel.innerHTML = '<option value="">Todos os Aplicadores</option>';
    const aplicadoresNoPeriodo = [...new Set(byDate.filter(a => a.aplicador).map(a => a.aplicador))].sort();
    aplicadoresNoPeriodo.forEach(nome => {
        const opt = document.createElement('option');
        opt.value = nome; opt.textContent = nome;
        if (nome === curApl) opt.selected = true;
        aplicadorSel.appendChild(opt);
    });
    if (curApl && !aplicadoresNoPeriodo.includes(curApl)) aplicadorSel.value = '';
}

function renderTable() {
    _populateTableColabDropdowns();

    const _searchWrap = document.getElementById('wrap-search-agenda');
    const _searchOpen = _searchWrap && _searchWrap.style.maxWidth !== '0px' && _searchWrap.style.maxWidth !== '0';
    const search = _searchOpen ? normalizeStr(document.getElementById('filter-search-agenda').value) : '';
    const status = document.getElementById('filter-status-agenda').value;
    const filterVacina = document.getElementById('filter-vacina-agenda').value;
    const dateFilter = document.getElementById('filter-date-agenda').value;
    const monthFilter = document.getElementById('filter-month-agenda').value;
    const _rawVend = document.getElementById('filter-vendedor-agenda').value;
    const filterVendedor = _rawVend === '__mine__'
        ? (typeof currentUser !== 'undefined' && currentUser ? currentUser.nome : '')
        : _rawVend;
    const filterAplicador = document.getElementById('filter-aplicador-agenda').value;

    const todayObj = new Date();
    const todayStr = todayObj.toISOString().split('T')[0];
    const startOfWeek = (typeof getFilterWeekStart === 'function' ? getFilterWeekStart() : getStartOfWeek(todayObj)).toISOString().split('T')[0];
    const endOfWeek = new Date(new Date(startOfWeek).setDate(new Date(startOfWeek).getDate()+6)).toISOString().split('T')[0];

    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';

    const patIdx = getPatientsIndex();
    const vacIdx = getVaccinesIndex();
    const dayValue = document.getElementById('filter-day-agenda')?.value || todayStr;

    let filtered = appointments.filter(a => {
        // Data e status primeiro: descartam a maioria antes dos lookups e do
        // normalizeStr(), que é caro (NFD + 2 regex).
        let matchDate = true;
        if(dateFilter === 'diario' || dateFilter === 'hoje') matchDate = a.data === dayValue;
        else if(dateFilter === 'semana') matchDate = a.data >= startOfWeek && a.data <= endOfWeek;
        else if(dateFilter === 'mes' && monthFilter) matchDate = a.data.startsWith(monthFilter);
        if(!matchDate) return false;
        if(status !== '' && a.status !== status) return false;
        if(filterVacina && String(a.vaccineId) !== String(filterVacina)) return false;
        if(filterVendedor && a.vendedor !== filterVendedor) return false;
        if(filterAplicador && a.aplicador !== filterAplicador) return false;

        const pat = patIdx.get(String(a.patientId));
        const vac = vacIdx.get(String(a.vaccineId));
        if(!pat || !vac) return false;
        if(!search) return true;
        return normalizeStr(pat.nome).includes(search) || normalizeStr(pat.cpf).includes(search);
    }).sort((a, b) => {
        const dir = tableSortDir === 'asc' ? 1 : -1;
        if(tableSortField === 'data') return (new Date(a.data) - new Date(b.data)) * dir;
        if(tableSortField === 'paciente') {
            const pA = patIdx.get(String(a.patientId))?.nome || '';
            const pB = patIdx.get(String(b.patientId))?.nome || '';
            return pA.localeCompare(pB, 'pt-BR') * dir;
        }
        if(tableSortField === 'vacina') {
            const vA = vacIdx.get(String(a.vaccineId))?.nome || '';
            const vB = vacIdx.get(String(b.vaccineId))?.nome || '';
            return vA.localeCompare(vB, 'pt-BR') * dir;
        }
        if(tableSortField === 'status') return a.status.localeCompare(b.status, 'pt-BR') * dir;
        return 0;
    });

    // Só as linhas da página vão pro DOM.
    const pageInfo = paginate(filtered, _tablePage, _TABLE_PAGE_SIZE);
    _tablePage = pageInfo.page;
    _renderTablePagination(pageInfo);

    const _tblDark = document.body.classList.contains('dark-mode');
    // Acumula e injeta de uma vez: `tbody.innerHTML +=` por linha reparseia toda
    // a tabela a cada iteração (O(N²)).
    const rowsHtml = pageInfo.items.map(a => {
        const pat = patIdx.get(String(a.patientId));
        const vac = vacIdx.get(String(a.vaccineId));
        const isDelayed = a.data < todayStr && a.status === 'Agendado';

        // Badge status — cores dark/light
        const stStyle = a.status==='Aplicado'
            ? (_tblDark ? 'background:#052e16;color:#4ade80;border:1px solid #166534' : 'background:#dcfce7;color:#15803d')
            : a.status==='Perdido'
            ? (_tblDark ? 'background:#2d0a0a;color:#fca5a5;border:1px solid #7f1d1d' : 'background:#fee2e2;color:#b91c1c')
            : a.status==='Em negociação'
            ? (_tblDark ? 'background:#0c2535;color:#67e8f9;border:1px solid #164e63' : 'background:#cffafe;color:#0e7490')
            : a.status==='Nova oportunidade'
            ? (_tblDark ? 'background:#1e293b;color:#94a3b8;border:1px solid #334155' : 'background:#f1f5f9;color:#475569')
            : isDelayed
            ? (_tblDark ? 'background:#1c1500;color:#fbbf24;border:1px solid #78350f' : 'background:#fef9c3;color:#a16207;border:1px solid #fde68a')
            : (_tblDark ? 'background:#0f1f3d;color:#93c5fd;border:1px solid #1e3a8a' : 'background:#dbeafe;color:#1d4ed8');

        // WhatsApp btn
        const waBg  = _tblDark ? 'background:rgba(34,197,94,0.15);color:#4ade80;border:1px solid rgba(34,197,94,0.25)' : 'background:#dcfce7;color:#16a34a';

        return `<tr onclick="viewRecord(${a.id})" class="cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:bg-clinic-50 hover:shadow-md active:translate-y-0 active:bg-clinic-100 group">
            <td data-label="Data" class="p-4 font-bold text-slate-700 whitespace-nowrap group-hover:text-clinic-700">${a.data.split('-').reverse().join('/')}${a.hora ? ' <span class="text-[10px] text-slate-400 font-bold">'+a.hora+'</span>' : ''} ${isDelayed?'<i class="fas fa-exclamation-triangle text-yellow-500 ml-1" title="Atrasado"></i>':''}</td>
            <td data-label="Paciente" class="p-4">
                <div class="flex items-center gap-2">
                    <a href="https://wa.me/55${formatWa(pat.contato)}" target="_blank" onclick="event.stopPropagation()" class="h-7 w-7 shrink-0 rounded-lg flex items-center justify-center transition shadow-sm hover:bg-green-500 hover:text-white" style="${waBg}" title="WhatsApp"><i class="fab fa-whatsapp text-sm"></i></a>
                    <div>
                        <div class="font-bold text-navy-900 group-hover:text-clinic-700">${pat.nome}</div>
                        <div class="text-[10px] text-slate-500">Idade: ${getAgeDisplay(pat.dtNasc)} | CPF: ${pat.cpf}</div>
                    </div>
                </div>
            </td>
            <td data-label="Vacina" class="p-4">
                <div class="font-bold whitespace-nowrap">${vac.nome}</div>
                <div class="text-[10px] font-black text-clinic-600 bg-clinic-50 inline-block px-1 rounded">${a.doseAtual}</div>
            </td>
            <td data-label="Status" class="p-4 text-center"><span class="px-2 py-1 rounded text-[10px] font-black uppercase whitespace-nowrap" style="${stStyle}">${isDelayed ? 'Atrasado' : a.status}</span></td>
            <td data-label="Ações" class="p-4 text-center" onclick="event.stopPropagation()">
                <div class="flex justify-center gap-2 flex-wrap">
                    ${a.status === 'Em negociação' ? permBtn('criar_agendamento', `<button onclick="openAgendarModal(${a.id})" class="h-8 w-8 bg-blue-500 text-white hover:bg-blue-600 rounded flex items-center justify-center transition shadow-sm" title="Agendar"><i class="fas fa-calendar-check"></i></button>`) : ''}
                    ${a.status === 'Agendado' ? permBtn('aplicar', `<button onclick="openConcluirModal(${a.id})" class="h-8 w-8 bg-green-500 text-white hover:bg-green-600 rounded flex items-center justify-center transition shadow-sm" title="Aplicar"><i class="fas fa-syringe"></i></button>`) : ''}
                </div>
            </td>
        </tr>`;
    }).join('');

    tbody.innerHTML = rowsHtml || `<tr><td colspan="5" class="p-10 text-center text-sm font-bold text-slate-400">
        <i class="fas fa-inbox text-2xl block mb-2 opacity-50"></i>Nenhum registro encontrado
    </td></tr>`;

    if (tableView === 'kanban') renderKanban();
}

// ─── PAGINAÇÃO DA PLANILHA ────────────────────────────────────────────────────
function _renderTablePagination(pageInfo) {
    let bar = document.getElementById('table-pagination');
    // A paginação da planilha só faz sentido na própria planilha — no kanban,
    // cada coluna tem sua própria paginação (kanbanPageGo).
    if (typeof tableView !== 'undefined' && tableView === 'kanban') {
        if (bar) bar.remove();
        return;
    }
    const table = document.getElementById('table-body')?.closest('table');
    if (!table || !table.parentElement) return;
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'table-pagination';
        table.parentElement.insertAdjacentElement('afterend', bar);
    }
    bar.innerHTML = renderPagination(pageInfo, 'goTablePage', 'registros');
}

function goTablePage(page) {
    _tablePage = page;
    renderTable(); // nunca renderTableReset(): zeraria a página recém-escolhida
    const wrap = document.getElementById('table-body')?.closest('table')?.parentElement;
    if (wrap) wrap.scrollTop = 0;
}

// Usada por todo handler de filtro/ordenação: mudar o conjunto filtrado sem
// voltar à página 1 deixaria o usuário numa página que já não existe.
// renderTable() sozinha (ex.: vinda do Firebase) preserva a página atual.
function renderTableReset() {
    _tablePage = 0;
    renderTable();
}

// ─── FILTROS POPOVER (Período / Status) ───────────────────────────────────────
const _DATE_FILTER_META = {
    todos:  { label: 'Todas as Datas' },
    diario: { label: 'Diário' },
    semana: { label: 'Semanal' },
    mes:    { label: 'Selecionar Mês' },
};

const _STATUS_FILTER_OPTS = [
    { val: '',                  label: 'Todos os Status',   color: '#94a3b8', icon: 'fa-layer-group' },
    { val: 'Nova oportunidade', label: 'Nova oportunidade', color: '#64748b', icon: 'fa-star' },
    { val: 'Em negociação',     label: 'Em negociação',     color: '#0891b2', icon: 'fa-comments' },
    { val: 'Agendado',          label: 'Agendado',          color: '#2563eb', icon: 'fa-calendar-check' },
    { val: 'Aplicado',          label: 'Aplicado',          color: '#16a34a', icon: 'fa-syringe' },
    { val: 'Perdido',           label: 'Perdido',           color: '#dc2626', icon: 'fa-ban' },
];

// Posiciona um popover (fixed) sob o botão, alinhado à direita, sem ser cortado por overflow.
function _positionFilterPop(btn, pop) {
    const r = btn.getBoundingClientRect();
    const w = pop.offsetWidth || 256;
    let left = r.right - w;
    if (left < 8) left = 8;
    const maxLeft = window.innerWidth - w - 8;
    if (left > maxLeft) left = Math.max(8, maxLeft);
    pop.style.top  = (r.bottom + 8) + 'px';
    pop.style.left = left + 'px';
}

function _closeAllFilterPops() {
    ['date-filter-pop', 'status-filter-pop', 'vacina-filter-pop'].forEach(id => {
        const p = document.getElementById(id);
        if (p) p.classList.add('hidden');
    });
    const dc = document.getElementById('date-filter-chev');
    const sc = document.getElementById('status-filter-chev');
    const vc = document.getElementById('vacina-filter-chev');
    if (dc) dc.style.transform = '';
    if (sc) sc.style.transform = '';
    if (vc) vc.style.transform = '';
    document.removeEventListener('click', _filterPopOutside);
    _closeVendedorPopover();
}

function _filterPopOutside(e) {
    if (e.target.closest('#date-filter-pop') || e.target.closest('#date-filter-btn') ||
        e.target.closest('#status-filter-pop') || e.target.closest('#status-filter-btn') ||
        e.target.closest('#vacina-filter-pop') || e.target.closest('#vacina-filter-btn')) return;
    _closeAllFilterPops();
}

// ── Período ──
function toggleDateFilterPop(e) {
    if (e) e.stopPropagation();
    const pop = document.getElementById('date-filter-pop');
    const btn = document.getElementById('date-filter-btn');
    const chev = document.getElementById('date-filter-chev');
    const isHidden = pop.classList.contains('hidden');
    _closeAllFilterPops();
    if (isHidden) {
        if (pop.parentElement !== document.body) document.body.appendChild(pop);
        _syncDateFilterUI();
        pop.classList.remove('hidden');
        _positionFilterPop(btn, pop);
        if (chev) chev.style.transform = 'rotate(180deg)';
        setTimeout(() => document.addEventListener('click', _filterPopOutside), 10);
    }
}

function _syncDateFilterUI() {
    let val = document.getElementById('filter-date-agenda').value || 'todos';
    const lbl = document.getElementById('date-filter-label');
    if (lbl) {
        if (val === 'mes') {
            const mInput = document.getElementById('filter-month-agenda');
            if (mInput && mInput.value) {
                const [y, m] = mInput.value.split('-');
                const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
                lbl.textContent = `${meses[parseInt(m,10)-1]} ${y}`;
            } else {
                lbl.textContent = 'Selecionar Mês';
            }
        } else if (val === 'semana') {
            const range = typeof formatFilterWeekLabel === 'function' ? formatFilterWeekLabel() : '';
            lbl.textContent = range ? `Semanal ${range}` : 'Semanal';
        } else if (val === 'diario' || val === 'hoje') {
            const dayInput = document.getElementById('filter-day-agenda');
            if (dayInput && !dayInput.value) {
                const now = new Date();
                dayInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            }
            const dayValue = document.getElementById('filter-day-agenda')?.value;
            const dateLabel = dayValue ? dayValue.split('-').reverse().join('/') : 'Diário';
            lbl.textContent = dayValue ? `Diário ${dateLabel}` : 'Diário';
            if (val === 'hoje') {
                document.getElementById('filter-date-agenda').value = 'diario';
                val = 'diario';
            }
        } else {
            lbl.textContent = (_DATE_FILTER_META[val] || _DATE_FILTER_META.todos).label;
        }
    }
    document.querySelectorAll('#date-filter-pop .date-opt').forEach(opt => {
        const active = opt.getAttribute('data-dval') === val;
        opt.classList.toggle('bg-clinic-50', active);
        opt.classList.toggle('text-clinic-700', active);
        const check = opt.querySelector('.date-opt-check');
        if (check) check.classList.toggle('opacity-0', !active);
    });
    const dWrap = document.getElementById('date-filter-day-wrap');
    const mWrap = document.getElementById('date-filter-month-wrap');
    const wWrap = document.getElementById('date-filter-week-wrap');
    if (dWrap) dWrap.classList.toggle('hidden', val !== 'diario' && val !== 'hoje');
    if (mWrap) mWrap.classList.toggle('hidden', val !== 'mes');
    if (wWrap) wWrap.classList.toggle('hidden', val !== 'semana');
    if (wWrap && val === 'semana') {
        const label = document.getElementById('date-filter-week-label');
        if (label) label.textContent = typeof formatFilterWeekLabel === 'function' ? formatFilterWeekLabel() : 'Semanal';
    }
    // Realça o botão quando há filtro ativo
    const btn = document.getElementById('date-filter-btn');
    if (btn) {
        const on = val !== 'todos';
        btn.classList.toggle('border-clinic-300', on);
        btn.classList.toggle('text-clinic-600', on);
        btn.classList.toggle('bg-clinic-50', on);
    }
}

function selectDateFilter(val) {
    document.getElementById('filter-date-agenda').value = val;
    if (val === 'mes') {
        const mInput = document.getElementById('filter-month-agenda');
        if (mInput && !mInput.value) {
            const now = new Date();
            mInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        }
        _syncDateFilterUI();
        // Mantém o popover aberto para escolher o mês
        const pop = document.getElementById('date-filter-pop');
        const btn = document.getElementById('date-filter-btn');
        if (pop && btn) _positionFilterPop(btn, pop);
        renderTableReset();
        return;
    }
    if (val === 'diario' || val === 'hoje') {
        const dayInput = document.getElementById('filter-day-agenda');
        if (dayInput && !dayInput.value) {
            const now = new Date();
            dayInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        }
        _syncDateFilterUI();
        const pop = document.getElementById('date-filter-pop');
        const btn = document.getElementById('date-filter-btn');
        if (pop && btn) _positionFilterPop(btn, pop);
        renderTableReset();
        return;
    }
    if (val === 'semana') {
        if (typeof setFilterWeekStart === 'function') {
            const weekInput = document.getElementById('filter-week-start');
            if (weekInput && !weekInput.value) setFilterWeekStart(new Date());
        }
        _syncDateFilterUI();
        const pop = document.getElementById('date-filter-pop');
        const btn = document.getElementById('date-filter-btn');
        if (pop && btn) _positionFilterPop(btn, pop);
        renderTableReset();
        return;
    }
    _syncDateFilterUI();
    _closeAllFilterPops();
    renderTableReset();
}

function onDateDayChange() {
    const dayInput = document.getElementById('filter-day-agenda');
    if (dayInput && dayInput.value) {
        document.getElementById('filter-date-agenda').value = 'diario';
        _syncDateFilterUI();
        renderTableReset();
    }
}

function _getTodayDateValue() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function _parseDateInputValue(value) {
    if (!value) return null;
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
}

function _formatDateValue(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function changeFilterDay(delta) {
    const dayInput = document.getElementById('filter-day-agenda');
    if (!dayInput) return;
    const current = dayInput.value ? _parseDateInputValue(dayInput.value) : new Date();
    if (!current) return;
    current.setDate(current.getDate() + delta);
    dayInput.value = _formatDateValue(current);
    document.getElementById('filter-date-agenda').value = 'diario';
    _syncDateFilterUI();
    renderTableReset();
}

function setFilterDayToday() {
    const dayInput = document.getElementById('filter-day-agenda');
    if (!dayInput) return;
    dayInput.value = _getTodayDateValue();
    document.getElementById('filter-date-agenda').value = 'diario';
    _syncDateFilterUI();
    renderTableReset();
}

function _getCurrentMonthValue() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function _parseMonthInputValue(value) {
    if (!value) return null;
    const [year, month] = value.split('-').map(Number);
    return new Date(year, month - 1, 1);
}

function _formatMonthValue(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function changeFilterMonth(delta) {
    const monthInput = document.getElementById('filter-month-agenda');
    if (!monthInput) return;
    const current = monthInput.value ? _parseMonthInputValue(monthInput.value) : new Date();
    if (!current) return;
    current.setMonth(current.getMonth() + delta);
    monthInput.value = _formatMonthValue(current);
    document.getElementById('filter-date-agenda').value = 'mes';
    _syncDateFilterUI();
    renderTableReset();
}

function setFilterMonthCurrent() {
    const monthInput = document.getElementById('filter-month-agenda');
    if (!monthInput) return;
    monthInput.value = _getCurrentMonthValue();
    document.getElementById('filter-date-agenda').value = 'mes';
    _syncDateFilterUI();
    renderTableReset();
}

function onDateMonthChange() {
    document.getElementById('filter-date-agenda').value = 'mes';
    _syncDateFilterUI();
    renderTableReset();
}

// ── Status ──
function _buildStatusFilterOptions() {
    const box = document.getElementById('status-filter-opts');
    if (!box || box.dataset.built === '1') return;
    box.innerHTML = _STATUS_FILTER_OPTS.map(o => `
        <button type="button" onclick="selectStatusFilter('${o.val.replace(/'/g, "\\'")}')" data-sval="${o.val}"
            class="status-opt w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition text-left">
            <span class="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style="background:${o.color}1a;color:${o.color};">
                <i class="fas ${o.icon} text-xs"></i>
            </span>
            <span class="flex-1">${o.label}</span>
            <i class="status-opt-check fas fa-check text-clinic-500 text-xs opacity-0"></i>
        </button>`).join('');
    box.dataset.built = '1';
}

function toggleStatusFilterPop(e) {
    if (e) e.stopPropagation();
    _buildStatusFilterOptions();
    const pop = document.getElementById('status-filter-pop');
    const btn = document.getElementById('status-filter-btn');
    const chev = document.getElementById('status-filter-chev');
    const isHidden = pop.classList.contains('hidden');
    _closeAllFilterPops();
    if (isHidden) {
        if (pop.parentElement !== document.body) document.body.appendChild(pop);
        _syncStatusFilterUI();
        pop.classList.remove('hidden');
        _positionFilterPop(btn, pop);
        if (chev) chev.style.transform = 'rotate(180deg)';
        setTimeout(() => document.addEventListener('click', _filterPopOutside), 10);
    }
}

function _syncStatusFilterUI() {
    const val = document.getElementById('filter-status-agenda').value || '';
    const meta = _STATUS_FILTER_OPTS.find(o => o.val === val) || _STATUS_FILTER_OPTS[0];
    const lbl = document.getElementById('status-filter-label');
    const dot = document.getElementById('status-filter-dot');
    if (lbl) lbl.textContent = meta.label;
    if (dot) dot.style.background = meta.color;
    document.querySelectorAll('#status-filter-pop .status-opt').forEach(opt => {
        const active = opt.getAttribute('data-sval') === val;
        opt.classList.toggle('bg-slate-100', active);
        const check = opt.querySelector('.status-opt-check');
        if (check) check.classList.toggle('opacity-0', !active);
    });
    const btn = document.getElementById('status-filter-btn');
    if (btn) {
        const on = val !== '';
        btn.classList.toggle('border-clinic-300', on);
        btn.classList.toggle('bg-clinic-50', on);
    }
}

function selectStatusFilter(val) {
    document.getElementById('filter-status-agenda').value = val;
    _syncStatusFilterUI();
    _closeAllFilterPops();
    renderTableReset();
}

// ── Vacina Popover ──
function _vacinaFilterMatches(v, query) {
    if (!query) return true;
    if (normalizeStr(v.nome).includes(query)) return true;
    if (v.mnemonico && normalizeStr(v.mnemonico).includes(query)) return true;
    return vaccineLots.some(l => l.vaccineId == v.id && l.fabricante && normalizeStr(l.fabricante).includes(query));
}

function _applyVacinaFilterSearch() {
    const searchInput = document.getElementById('vacina-filter-search');
    const query = searchInput ? normalizeStr(searchInput.value) : '';
    const list = document.getElementById('vacina-filter-list');
    if (!list) return;
    const curVal = document.getElementById('filter-vacina-agenda').value;
    const ativos = vaccines.filter(v => v.ativo !== false);
    const matches = ativos.filter(v => _vacinaFilterMatches(v, query)).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    if (!matches.length) {
        list.innerHTML = '<p class="text-xs text-slate-400 text-center py-3">Nenhuma vacina encontrada</p>';
        return;
    }
    list.innerHTML = matches.map(v => {
        const active = String(curVal) === String(v.id);
        return `<button type="button" onclick="selectVacinaFilter('${v.id}')"
            class="vacina-filter-item w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition text-left ${active ? 'bg-clinic-50 text-clinic-700 font-semibold' : ''}">
            <span class="h-7 w-7 rounded-lg flex items-center justify-center shrink-0 text-clinic-500 bg-clinic-50"><i class="fas fa-syringe text-xs"></i></span>
            <span class="flex-1 truncate">${v.nome}${v.mnemonico ? ` <span class="inline-flex items-center bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full text-[9px] font-black normal-case ml-1">${v.mnemonico}</span>` : ''}</span>
            ${active ? '<i class="fas fa-check text-clinic-500 text-xs shrink-0"></i>' : ''}
        </button>`;
    }).join('');
}

function filterVacinaFilterList() {
    _applyVacinaFilterSearch();
}

function _updateVacinaFilterBtn(val) {
    const lbl = document.getElementById('vacina-filter-label');
    const btn = document.getElementById('vacina-filter-btn');
    const todosBtn = document.getElementById('btn-vacina-filter-todas');
    if (!lbl) return;
    const isActive = val !== '';
    if (isActive) {
        const vacIdx = getVaccinesIndex();
        const v = vacIdx.get(String(val));
        const nome = v ? v.nome : '';
        lbl.textContent = nome.length > 16 ? nome.slice(0, 16) + '…' : nome;
    } else {
        lbl.textContent = 'Todas as Vacinas';
    }
    if (btn) {
        btn.classList.toggle('border-clinic-300', isActive);
        btn.classList.toggle('bg-clinic-50', isActive);
        btn.classList.toggle('text-clinic-600', isActive);
    }
    if (todosBtn) {
        todosBtn.classList.toggle('bg-clinic-100', !isActive);
        todosBtn.classList.toggle('bg-clinic-50', isActive);
    }
}

function selectVacinaFilter(val) {
    document.getElementById('filter-vacina-agenda').value = val;
    _updateVacinaFilterBtn(val);
    _applyVacinaFilterSearch();
    _closeAllFilterPops();
    renderTableReset();
}

function toggleVacinaFilterPop(e) {
    if (e) e.stopPropagation();
    const pop = document.getElementById('vacina-filter-pop');
    const btn = document.getElementById('vacina-filter-btn');
    const chev = document.getElementById('vacina-filter-chev');
    if (!pop) return;
    const isHidden = pop.classList.contains('hidden');
    _closeAllFilterPops();
    if (isHidden) {
        if (pop.parentElement !== document.body) document.body.appendChild(pop);
        const searchInput = document.getElementById('vacina-filter-search');
        if (searchInput) searchInput.value = '';
        _applyVacinaFilterSearch();
        pop.classList.remove('hidden');
        _positionFilterPop(btn, pop);
        if (chev) chev.style.transform = 'rotate(180deg)';
        setTimeout(() => document.addEventListener('click', _filterPopOutside), 10);
        setTimeout(() => searchInput && searchInput.focus(), 50);
    }
}

// ── Vendedor Popover ──
let _vendedorPopoverNames = [];

function _renderVendedorPopoverList(names) {
    _vendedorPopoverNames = names || [];
    _applyVendedorPopoverSearch();
}

function _applyVendedorPopoverSearch() {
    const searchInput = document.getElementById('vendedor-popover-search');
    const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const list = document.getElementById('vendedor-popover-list');
    if (!list) return;
    const curVend = document.getElementById('filter-vendedor-agenda').value;
    const filtered = _vendedorPopoverNames.filter(n => !query || n.toLowerCase().includes(query));
    if (!filtered.length) {
        list.innerHTML = '<p class="text-xs text-slate-400 text-center py-3">Nenhum vendedor encontrado</p>';
        return;
    }
    list.innerHTML = filtered.map(nome => {
        const active = curVend === nome;
        const initials = nome.trim().split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
        return `<button type="button" onclick="selectVendedorFilter('${nome.replace(/'/g, "\\'")}')"
            class="vendedor-pop-item w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition text-left ${active ? 'bg-clinic-50 text-clinic-700 font-semibold' : ''}">
            <span class="h-7 w-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white" style="background: linear-gradient(135deg,#6366f1,#8b5cf6);">${initials}</span>
            <span class="flex-1 truncate">${nome}</span>
            ${active ? '<i class="fas fa-check text-clinic-500 text-xs shrink-0"></i>' : ''}
        </button>`;
    }).join('');
}

function filterVendedorPopoverList() {
    _applyVendedorPopoverSearch();
}

function _updateVendedorBtn(val) {
    const btn = document.getElementById('btn-vendedor-popover');
    const lbl = document.getElementById('btn-vendedor-label');
    const mineBtn = document.getElementById('btn-vendedor-mine');
    const todosBtn = document.getElementById('btn-vendedor-todos');
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
    if (mineBtn) {
        mineBtn.classList.toggle('bg-indigo-50', val === '__mine__');
    }
    if (todosBtn) {
        todosBtn.classList.toggle('bg-clinic-100', val === '');
        todosBtn.classList.toggle('bg-clinic-50', val !== '');
    }
}

function selectVendedorFilter(val) {
    document.getElementById('filter-vendedor-agenda').value = val;
    _updateVendedorBtn(val);
    _applyVendedorPopoverSearch();
    _closeVendedorPopover();
    renderTableReset();
}

function _closeVendedorPopover() {
    const pop = document.getElementById('vendedor-popover');
    const chev = document.getElementById('btn-vendedor-chevron');
    if (pop) pop.classList.add('hidden');
    if (chev) chev.style.transform = '';
    document.removeEventListener('click', _vendedorPopOutside);
}

function _vendedorPopOutside(e) {
    if (e.target.closest('#vendedor-popover') || e.target.closest('#btn-vendedor-popover')) return;
    _closeVendedorPopover();
}

function toggleVendedorPopover(e) {
    if (e) e.stopPropagation();
    const pop = document.getElementById('vendedor-popover');
    const chev = document.getElementById('btn-vendedor-chevron');
    const btn = document.getElementById('btn-vendedor-popover');
    if (!pop) return;
    const isHidden = pop.classList.contains('hidden');
    _closeAllFilterPops();
    _closeVendedorPopover();
    if (isHidden) {
        _applyVendedorPopoverSearch();
        const searchInput = document.getElementById('vendedor-popover-search');
        if (searchInput) searchInput.value = '';
        _applyVendedorPopoverSearch();
        pop.classList.remove('hidden');
        // Anchor to the aplicador button if present, otherwise to the vendor button
        const aplBtn = document.getElementById('btn-icon-aplicador-agenda');
        const anchor = aplBtn || btn;
        const r = anchor.getBoundingClientRect();
        pop.style.top = (r.bottom + 8) + 'px';
        const popW = pop.offsetWidth || 288;
        // Align left edge of popover with left edge of anchor
        let left = r.left;
        if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
        if (left < 8) left = 8;
        pop.style.left = left + 'px';
        if (chev) chev.style.transform = 'rotate(180deg)';
        setTimeout(() => document.addEventListener('click', _vendedorPopOutside), 10);
    }
}
