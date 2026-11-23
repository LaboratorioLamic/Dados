// Sistema de auditoria / histórico e rastreabilidade

// ============================================================
// SISTEMA DE AUDITORIA / HISTÓRICO
// ============================================================
const _auditFields = [
    { key: 'data',       label: 'Data',        fmt: v => v ? v.split('-').reverse().join('/') : '—' },
    { key: 'horaInicio', label: 'Hora início',  fmt: v => v || '—' },
    { key: 'horaFim',    label: 'Hora fim',     fmt: v => v || '—' },
    { key: 'paciente',   label: 'Paciente',     fmt: v => v || '—' },
    { key: 'exame',      label: 'Exame',        fmt: v => v || '—' },
    { key: 'substrato',  label: 'Substrato',    fmt: v => v || '—' },
    { key: 'metano',     label: 'Metano',       fmt: v => v || '—' },
    { key: 'abstinencia',label: 'Abstinência',  fmt: v => v != null && v !== '' ? `${v} dia(s)` : '—' },
    { key: 'logradouro', label: 'Logradouro',   fmt: v => v || '—' },
    { key: 'numero',     label: 'Número',       fmt: v => v || '—' },
    { key: 'complemento',label: 'Complemento',  fmt: v => v || '—' },
    { key: 'bairro',     label: 'Bairro',       fmt: v => v || '—' },
    { key: 'cidade',     label: 'Cidade',       fmt: v => v || '—' },
    { key: 'cep',        label: 'CEP',          fmt: v => v || '—' },
    { key: 'distante',   label: 'Localidade distante', fmt: v => v ? 'Sim' : 'Não' },
    { key: 'acompanhantes', label: 'Outros pacientes',
      fmt: v => (v || []).length ? v.map(a => a.nome).join(', ') : '—' },
    { key: 'pontoReferencia', label: 'Ponto de referência', fmt: v => v || '—' },
    { key: 'coletador',  label: 'Coletador',    fmt: v => v || '—' },
    { key: 'coletadorAuxiliar', label: 'Coletador auxiliar', fmt: v => v || '—' },
    { key: 'status',     label: 'Status',       fmt: v => v || '—' },
    // Comentários entram na auditoria porque carregam a justificativa da
    // ausência — sem isso o motivo da falta não apareceria no histórico.
    { key: 'comentarios',label: 'Comentários',  fmt: v => (v && String(v).trim()) || '—' },
    { key: 'atendente',  label: 'Atendente',    fmt: v => v || '—' },
    { key: 'pedido',     label: 'Pedido',       fmt: v => v || '—' },
    { key: 'idade',      label: 'Idade',        fmt: v => v != null ? String(v) : '—' },
];

function addAuditLog(action, record, oldRecord) {
    const changes = [];
    if (action === 'edit' && oldRecord) {
        for (const f of _auditFields) {
            // Compara pelo valor já formatado — campos de lista (acompanhantes)
            // não sobrevivem a um String() cru.
            const oldVal = f.fmt(oldRecord[f.key]);
            const newVal = f.fmt(record[f.key]);
            if (oldVal !== newVal) {
                changes.push({ label: f.label, oldVal, newVal });
            }
        }
    }
    // Não registrar edição se nenhum campo rastreado mudou
    if (action === 'edit' && changes.length === 0) return;

    const agendaDoRegistro = getAgenda(record.agendaId || currentAgendaId);
    const detalheExame = agendaDoRegistro.campos.exame
        ? `${record.exame || ''} | ${record.substrato || ''}`
        : agendaDoRegistro.campos.endereco
            ? `${agendaDoRegistro.nome} | ${[record.logradouro, record.numero].filter(Boolean).join(', ')}`
            : agendaDoRegistro.nome;

    const entry = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        action,
        agendaId: agendaDoRegistro.id,
        appointmentId: record.id,
        paciente: record.paciente || '—',
        data: record.data || '',
        atendente: record.atendente || '',
        user: currentUser?.username || 'sistema',
        userFullName: currentUser?.fullName || '',
        details: `${detalheExame} | ${record.horaInicio || ''}–${record.horaFim || ''}`,
        changes
    };
    auditLog.unshift(entry);
    database.ref(`auditLog/${entry.id}`).set(entry).catch(console.error);
}

function addUserAuditLog(action, targetUser, changes) {
    const entry = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        action,
        appointmentId: null,
        paciente: targetUser.fullName || targetUser.username,
        data: '',
        atendente: '',
        user: currentUser?.username || 'sistema',
        userFullName: currentUser?.fullName || '',
        details: `@${targetUser.username}`,
        changes: changes || []
    };
    auditLog.unshift(entry);
    database.ref(`auditLog/${entry.id}`).set(entry).catch(console.error);
    _refreshHistoryIfOpen();
}

function addMotivoAuditLog(action, newVal, oldVal) {
    const changes = (action === 'motivo_edit' && oldVal)
        ? [{ label: 'Motivo', oldVal, newVal }]
        : [];
    const entry = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        action,
        appointmentId: null,
        paciente: null,
        data: '',
        atendente: '',
        user: currentUser?.username || 'sistema',
        userFullName: currentUser?.fullName || '',
        details: action === 'motivo_delete' ? oldVal : newVal,
        changes
    };
    auditLog.unshift(entry);
    database.ref(`auditLog/${entry.id}`).set(entry).catch(console.error);
    _refreshHistoryIfOpen();
}

function _refreshHistoryIfOpen() {
    if (document.getElementById('modal-history').classList.contains('active')) {
        renderHistoryList();
    }
}

function loadAuditLogsFromFirebase() {
    database.ref('auditLog').orderByChild('timestamp').once('value').then(snapshot => {
        const data = snapshot.val();
        if (data) {
            auditLog = Object.values(data).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        } else {
            auditLog = [];
        }
        renderTraceability();
    }).catch(console.error);
}

function setupAuditLogRealtimeListener() {
    database.ref('auditLog').on('value', (snapshot) => {
        const data = snapshot.val();
        auditLog = data ? Object.values(data).sort((a, b) => b.timestamp.localeCompare(a.timestamp)) : [];
        renderTraceability();
        _refreshHistoryIfOpen();
    });
}

function _openHistoryCommon() {
    historyPage = 1;
    _pickerSelectedMonth = '';
    document.getElementById('history-month-filter').value = '';
    const btn = document.getElementById('btn-history-month-toggle');
    btn.classList.remove('bg-blue-500');
    btn.classList.add('bg-white/10');
    // Mostrar lixeira global apenas para admins (verifica se o botão existe)
    const trashBtn = document.getElementById('btn-history-clear-all');
    if (trashBtn) {
        if (isAdmin()) {
            trashBtn.classList.remove('hidden');
            trashBtn.classList.add('flex');
        } else {
            trashBtn.classList.add('hidden');
            trashBtn.classList.remove('flex');
        }
    }
    renderHistoryList();
    document.getElementById('modal-history').classList.add('active');
}

function openDayHistory() {
    const dateText = document.getElementById('day-details-date').innerText;
    const parts = dateText.split('/');
    const isoDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
    historyFilter = { type: 'day', date: isoDate };
    _openHistoryCommon();
}

function openAppointmentHistory() {
    const id = parseInt(document.getElementById('reg-id').value);
    if (!id) return;
    historyFilter = { type: 'appointment', id };
    _openHistoryCommon();
}

function openHistoryModal(filter) {
    historyFilter = filter;
    _openHistoryCommon();
}

// ── AGENDA DE ORIGEM DE UM REGISTRO ─────────────────────────
// Entradas novas gravam `agendaId`. As antigas, não: para essas, a agenda é
// inferida pelo agendamento correspondente. Quando nem isso resolve (registro
// de agendamento já excluído), a entrada fica sem origem conhecida e não
// aparece nas abas específicas.
function _agendaDoLog(entry) {
    if (entry.agendaId) return entry.agendaId;
    if (entry.appointmentId != null) {
        const app = appointments.find(a => a.id == entry.appointmentId);
        if (app && app.agendaId) return app.agendaId;
    }
    return null;
}

// Ações globais por natureza (usuários, motivos de perda) não pertencem a
// nenhuma agenda e por isso não entram no recorte por aba.
function _logGlobalDeSistema(entry) {
    return !!(entry.action && (entry.action.startsWith('user_') || entry.action.startsWith('motivo_')));
}

function getFilteredAuditLog() {
    let filtered = [...auditLog];
    const isUserAction = e => e.action && e.action.startsWith('user_');

    if (historyFilter.type === 'global') {
        filtered = filtered.filter(e => !isUserAction(e));
    } else if (historyFilter.type === 'day') {
        filtered = filtered.filter(e => e.data === historyFilter.date && !isUserAction(e));
    } else if (historyFilter.type === 'appointment') {
        filtered = filtered.filter(e => e.appointmentId === historyFilter.id && !isUserAction(e));
    } else if (historyFilter.type === 'users') {
        filtered = filtered.filter(e => isUserAction(e));
    }

    // Cada aba tem rastreabilidade própria: o histórico de uma agenda não se
    // mistura com o das outras. O filtro por agendamento já é específico o
    // bastante, e as abas de usuários/motivos são globais.
    const recorteDeAgenda = historyFilter.type === 'global' || historyFilter.type === 'day';
    if (recorteDeAgenda) {
        filtered = filtered.filter(e =>
            !_logGlobalDeSistema(e) && _agendaDoLog(e) === currentAgendaId);
    }
    const monthInput = document.getElementById('history-month-filter');
    if (monthInput && monthInput.value) {
        filtered = filtered.filter(e => e.timestamp && e.timestamp.startsWith(monthInput.value));
    }
    return filtered;
}

function renderHistoryList() {
    const filtered = getFilteredAuditLog();
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / historyItemsPerPage));
    if (historyPage > totalPages) historyPage = totalPages;
    const start = (historyPage - 1) * historyItemsPerPage;
    const pageItems = filtered.slice(start, start + historyItemsPerPage);

    const subtitles = {
        global:      'Rastreabilidade geral',
        day:         `Alterações do dia ${historyFilter.date ? historyFilter.date.split('-').reverse().join('/') : ''}`,
        appointment: 'Histórico do agendamento',
        users:       'Criação · Edição · Exclusão de usuários'
    };
    document.getElementById('history-subtitle').innerText = subtitles[historyFilter.type] || '';

    const actionCfg = {
        create:        { label: 'Criado',            color: 'text-emerald-700 bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500', icon: 'fa-plus-circle' },
        edit:          { label: 'Editado',           color: 'text-blue-700 bg-blue-50 border-blue-200',          dot: 'bg-blue-500',    icon: 'fa-edit' },
        delete:        { label: 'Excluído',          color: 'text-red-700 bg-red-50 border-red-200',             dot: 'bg-red-500',     icon: 'fa-trash-alt' },
        motivo_add:    { label: 'Motivo Adicionado', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500', icon: 'fa-tag' },
        motivo_edit:   { label: 'Motivo Editado',    color: 'text-blue-700 bg-blue-50 border-blue-200',          dot: 'bg-blue-500',    icon: 'fa-tag' },
        motivo_delete: { label: 'Motivo Removido',   color: 'text-red-700 bg-red-50 border-red-200',             dot: 'bg-red-500',     icon: 'fa-tag' },
        user_create:   { label: 'Usuário Criado',   color: 'text-emerald-700 bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500', icon: 'fa-user-plus' },
        user_edit:     { label: 'Usuário Editado',  color: 'text-blue-700 bg-blue-50 border-blue-200',          dot: 'bg-blue-500',    icon: 'fa-user-edit' },
        user_delete:   { label: 'Usuário Excluído', color: 'text-red-700 bg-red-50 border-red-200',             dot: 'bg-red-500',     icon: 'fa-user-times' }
    };

    const listEl = document.getElementById('history-list');
    if (pageItems.length === 0) {
        listEl.innerHTML = '<p class="text-center text-slate-400 font-bold uppercase text-xs py-10">Nenhum registro encontrado</p>';
    } else {
        listEl.innerHTML = pageItems.map(entry => {
            const cfg = actionCfg[entry.action] || actionCfg.edit;
            const dt = new Date(entry.timestamp);
            const dateStr = dt.toLocaleDateString('pt-BR');
            const timeStr = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            const aptDate = entry.data ? entry.data.split('-').reverse().join('/') : '—';

            // Diff block para edições
            let diffHtml = '';
            const isMotivoAction = entry.action && entry.action.startsWith('motivo_');
            const isUserAction   = entry.action && entry.action.startsWith('user_');
            if (!isMotivoAction && entry.action === 'edit' && Array.isArray(entry.changes) && entry.changes.length > 0) {
                const rows = entry.changes.map(c => `
                    <div class="flex items-center gap-1.5 flex-wrap py-0.5">
                        <span class="text-[10px] font-black text-slate-400 uppercase w-20 flex-shrink-0">${c.label}</span>
                        <span class="text-[11px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded line-through">${c.oldVal}</span>
                        <i class="fas fa-arrow-right text-slate-300 text-[10px]"></i>
                        <span class="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">${c.newVal}</span>
                    </div>`).join('');
                diffHtml = `<div class="mt-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 space-y-0.5">${rows}</div>`;
            }
            if ((isMotivoAction || isUserAction) && Array.isArray(entry.changes) && entry.changes.length > 0) {
                const rows = entry.changes.map(c => `
                    <div class="flex items-center gap-1.5 flex-wrap py-0.5">
                        <span class="text-[10px] font-black text-slate-400 uppercase w-20 flex-shrink-0">${c.label}</span>
                        <span class="text-[11px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded line-through">${c.oldVal}</span>
                        <i class="fas fa-arrow-right text-slate-300 text-[10px]"></i>
                        <span class="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">${c.newVal}</span>
                    </div>`).join('');
                diffHtml = `<div class="mt-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 space-y-0.5">${rows}</div>`;
            }

            const titleLine = isMotivoAction
                ? `<p class="text-sm font-black text-navy-900">${entry.details || '—'}</p>
                   <p class="text-xs text-slate-400 font-medium">Motivo de perda</p>`
                : isUserAction
                ? `<p class="text-sm font-black text-navy-900">${entry.paciente || '—'}</p>
                   <p class="text-xs text-slate-400 font-medium font-mono">${entry.details || ''}</p>`
                : `<p class="text-sm font-black text-navy-900">${entry.paciente}</p>
                   <p class="text-xs text-slate-500 font-medium">${entry.details} &bull; Data: ${aptDate}</p>
                   ${entry.atendente ? `<p class="text-[10px] text-slate-400 font-bold mt-0.5">Atendente: ${entry.atendente}</p>` : ''}`;

            const userDisplayName = entry.userFullName
                ? formatAtendenteName(entry.userFullName)
                : (entry.user || 'sistema');

            return `
            <div class="flex gap-3 py-3 border-b border-slate-100 last:border-0">
                <div class="flex flex-col items-center pt-1">
                    <div class="h-8 w-8 rounded-full ${cfg.dot} flex items-center justify-center flex-shrink-0">
                        <i class="fas ${cfg.icon} text-white text-xs"></i>
                    </div>
                    <div class="w-0.5 flex-1 bg-slate-100 mt-1 min-h-[8px]"></div>
                </div>
                <div class="flex-1 pb-1">
                    <p class="text-[11px] font-black text-navy-900 uppercase tracking-wide mb-0.5">
                        <i class="fas fa-user-circle text-blue-400 mr-1"></i>${userDisplayName}
                    </p>
                    <div class="flex items-center gap-2 mb-1 flex-wrap">
                        <span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${cfg.color}">${cfg.label}</span>
                        <span class="text-[10px] text-slate-400 font-bold">${dateStr} às ${timeStr}</span>
                    </div>
                    ${titleLine}
                    ${diffHtml}
                    ${isAdmin() ? `<button onclick="deleteAuditLogEntry(${entry.id})" class="mt-2 text-[9px] font-black uppercase text-red-400 hover:text-red-600 transition-all flex items-center gap-1"><i class="fas fa-trash-alt"></i> Excluir registro</button>` : ''}
                </div>
            </div>`;
        }).join('');
    }

    const showing = total === 0 ? '0' : `${start + 1}–${Math.min(start + historyItemsPerPage, total)}`;
    document.getElementById('history-pagination-info').innerText = `${showing} de ${total}`;
}

function changeHistoryPage(dir) {
    const filtered = getFilteredAuditLog();
    const totalPages = Math.max(1, Math.ceil(filtered.length / historyItemsPerPage));
    historyPage = Math.max(1, Math.min(totalPages, historyPage + dir));
    renderHistoryList();
}

// Mantido por compatibilidade com chamadas que resetam o filtro
function toggleHistoryMonthFilter() {
    clearHistoryMonthFilter();
}

// ---- Month Picker customizado ----
let _pickerYear = new Date().getFullYear();
let _pickerSelectedMonth = '';

function _closePicker(e) {
    const picker = document.getElementById('history-month-picker');
    if (!picker.contains(e.target)) {
        _hideMonthPicker();
    }
}

function _hideMonthPicker() {
    document.getElementById('history-month-picker').classList.add('hidden');
    document.removeEventListener('click', _closePicker);
}

function toggleHistoryMonthPicker(event) {
    event.stopPropagation();
    const picker = document.getElementById('history-month-picker');
    if (!picker.classList.contains('hidden')) {
        _hideMonthPicker();
        return;
    }
    const btn = event.currentTarget;
    const rect = btn.getBoundingClientRect();
    picker.style.top   = (rect.bottom + 6) + 'px';
    picker.style.left  = 'auto';
    picker.style.right = (window.innerWidth - rect.right) + 'px';
    _pickerYear = _pickerSelectedMonth ? parseInt(_pickerSelectedMonth.split('-')[0]) : new Date().getFullYear();
    document.getElementById('picker-year').innerText = _pickerYear;
    renderPickerMonths();
    picker.classList.remove('hidden');
    document.addEventListener('click', _closePicker);
}

function changePickerYear(dir) {
    _pickerYear += dir;
    document.getElementById('picker-year').innerText = _pickerYear;
    renderPickerMonths();
}

function renderPickerMonths() {
    const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    document.getElementById('picker-months').innerHTML = months.map((m, i) => {
        const val = `${_pickerYear}-${String(i + 1).padStart(2, '0')}`;
        const sel = val === _pickerSelectedMonth;
        return `<button onclick="selectHistoryMonth('${val}')" class="py-2 rounded-xl text-xs font-black uppercase tracking-wide transition-all ${sel ? 'bg-blue-500 text-white' : 'text-slate-300 hover:bg-white/10 hover:text-white'}">${m}</button>`;
    }).join('');
}

function selectHistoryMonth(val) {
    if (_pickerSelectedMonth === val) {
        clearHistoryMonthFilter();
        return;
    }
    _pickerSelectedMonth = val;
    document.getElementById('history-month-filter').value = val;
    historyPage = 1;
    renderHistoryList();
    _hideMonthPicker();
    const btn = document.getElementById('btn-history-month-toggle');
    btn.classList.add('bg-blue-500');
    btn.classList.remove('bg-white/10');
}

function clearHistoryMonthFilter() {
    _pickerSelectedMonth = '';
    document.getElementById('history-month-filter').value = '';
    historyPage = 1;
    renderHistoryList();
    _hideMonthPicker();
    const btn = document.getElementById('btn-history-month-toggle');
    btn.classList.remove('bg-blue-500');
    btn.classList.add('bg-white/10');
}

function confirmClearAllAuditLog() {
    if (!isAdmin()) return;
    document.getElementById('modal-clear-audit-confirm').classList.add('active');
}

function executeClearAllAuditLog() {
    document.getElementById('modal-clear-audit-confirm').classList.remove('active');
    auditLog = [];
    database.ref('auditLog').remove().catch(console.error);
    renderHistoryList();
    renderTraceability();
    showNotification('Rastreabilidade apagada com sucesso.', 'success');
}

function renderTraceability() {
    const el = document.getElementById('traceability-list');
    if (!el) return;
    const now = new Date();
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    // O painel também é por aba: mostra só o movimento da agenda ativa
    const daAgenda = auditLog.filter(e =>
        !_logGlobalDeSistema(e) && _agendaDoLog(e) === currentAgendaId);
    const monthLogs = daAgenda.filter(e => e.timestamp && e.timestamp.startsWith(monthPrefix));
    document.getElementById('trace-created').innerText = monthLogs.filter(e => e.action === 'create').length;
    document.getElementById('trace-edited').innerText  = monthLogs.filter(e => e.action === 'edit').length;
    document.getElementById('trace-deleted').innerText = monthLogs.filter(e => e.action === 'delete').length;

    const recent = daAgenda.slice(0, 5);
    const cfgMap = {
        create: { label: 'Criado',  dot: 'bg-emerald-500', icon: 'fa-plus-circle',  text: 'text-emerald-700' },
        edit:   { label: 'Editado', dot: 'bg-blue-500',    icon: 'fa-edit',          text: 'text-blue-700' },
        delete: { label: 'Excluído',dot: 'bg-red-500',     icon: 'fa-trash-alt',     text: 'text-red-700' }
    };
    if (recent.length === 0) {
        el.innerHTML = '<p class="text-center text-slate-400 font-bold uppercase text-[10px] py-4">Sem atividades recentes</p>';
        return;
    }
    el.innerHTML = recent.map(entry => {
        const cfg = cfgMap[entry.action] || cfgMap.edit;
        const dt = new Date(entry.timestamp);
        const dateStr = dt.toLocaleDateString('pt-BR');
        const timeStr = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        return `
        <div class="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
            <div class="h-7 w-7 rounded-full ${cfg.dot} flex items-center justify-center flex-shrink-0">
                <i class="fas ${cfg.icon} text-white text-[10px]"></i>
            </div>
            <div class="flex-1 min-w-0">
                <p class="text-xs font-black text-navy-900 truncate">${entry.paciente}</p>
                <p class="text-[10px] text-slate-400">${dateStr} às ${timeStr}</p>
            </div>
            <span class="text-[9px] font-black uppercase ${cfg.text} flex-shrink-0">${cfg.label}</span>
        </div>`;
    }).join('');
}
// ============================================================
