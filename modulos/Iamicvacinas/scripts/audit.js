// ─── AUDIT / RASTREABILIDADE (from index.html lines ~2173-2370) ──────────────

function computeChanges(oldObj, newObj, fieldLabels) {
    if (!oldObj || !newObj) return [];
    return Object.entries(fieldLabels).reduce((acc, [key, label]) => {
        const oldVal = oldObj[key] != null ? String(oldObj[key]) : '';
        const newVal = newObj[key] != null ? String(newObj[key]) : '';
        if (oldVal !== newVal) acc.push({ field: label, de: oldVal || '—', para: newVal || '—' });
        return acc;
    }, []);
}

function logAudit(action, entityType, entityId, entityName, details, changes, patientId) {
    if (!currentUser) return;
    const user = (typeof appUsers !== 'undefined') ? appUsers.find(u => u.id == currentUser.id) : null;
    const entryId = String(Date.now()) + '_' + String(Math.floor(Math.random() * 1e6));
    const entry = {
        id: entryId,
        ts: new Date().toISOString(),
        userId: currentUser.id,
        userName: user ? user.nome : currentUser.nome,
        action,
        entityType,
        entityId: String(entityId || ''),
        entityName: entityName || '',
        details: details || null,
        changes: (changes && changes.length) ? changes : null,
        patientId: patientId != null ? String(patientId) : null
    };
    auditLog.unshift(entry);
    if (auditLog.length > 1000) auditLog = auditLog.slice(0, 1000);
    db.ref('auditLog/' + entryId).set(entry).catch(err => console.error('[FB] logAudit:', err));
}

// ─── AUDIT DE AGENDAMENTO (alterações fora do formulário de registro) ────────
// O drag do kanban, o arraste nas agendas mensal/semanal e as ações de grupo
// alteram `appointments` direto, sem passar por saveAppointment(). Sem estes
// helpers, essas mudanças não apareciam na rastreabilidade.
const APPOINTMENT_AUDIT_FIELDS = {
    data: 'Data', hora: 'Hora', doseAtual: 'Dose', status: 'Status', lote: 'Lote',
    valorAplicado: 'Valor', vendedor: 'Vendedor', aplicador: 'Aplicador', pedido: 'Pedido',
    pago: 'Pagamento',
    motivoCancelamento: 'Motivo de Perda', endereco: 'Endereço'
};

function _auditApptSnapshot(a) {
    if (!a) return null;
    const fmtDate = d => (d && String(d).includes('-')) ? String(d).split('-').reverse().join('/') : (d || '');
    const fmtEnd = e => (typeof enderecoResumo === 'function' ? enderecoResumo(e) : '') || '';
    // Booleano cru viraria "true"/"false" na linha do tempo — o log é lido por gente.
    return { ...a, data: fmtDate(a.data), endereco: fmtEnd(a.endereco), pago: a.pago ? 'Pago' : 'Não pago' };
}

function auditAppointmentLabel(a) {
    if (!a) return '—';
    const pat = (typeof patients !== 'undefined') ? patients.find(p => p.id == a.patientId) : null;
    const vac = (typeof vaccines !== 'undefined') ? vaccines.find(v => v.id == a.vaccineId) : null;
    return `${pat ? pat.nome : '—'} | ${vac ? vac.nome : '—'} | ${a.doseAtual || '—'} | ${a.data ? String(a.data).split('-').reverse().join('/') : '—'}`;
}

// Captura o estado atual dos agendamentos ANTES da mutação, para comparar depois.
function auditSnapshotAppointments(ids) {
    const map = new Map();
    if (typeof appointments === 'undefined') return map;
    (ids || []).forEach(id => {
        const a = appointments.find(x => x.id == id);
        if (a) map.set(String(id), { ...a });
    });
    return map;
}

function logAppointmentAudit(oldApp, newApp, details) {
    if (!newApp) return;
    if (!oldApp) {
        logAudit('Criado', 'agendamento', newApp.id, auditAppointmentLabel(newApp),
            details || `Status: ${newApp.status || '—'}`, null, newApp.patientId);
        return;
    }
    const changes = computeChanges(_auditApptSnapshot(oldApp), _auditApptSnapshot(newApp), APPOINTMENT_AUDIT_FIELDS);
    if (!changes.length && !details) return;
    logAudit('Editado', 'agendamento', newApp.id, auditAppointmentLabel(newApp), details || null, changes, newApp.patientId);
}

// Fecha o ciclo de auditSnapshotAppointments(): registra o diff de cada agendamento.
function logAppointmentAuditMany(snapshots, details) {
    if (!snapshots || typeof appointments === 'undefined') return;
    snapshots.forEach((oldApp, id) => {
        const now = appointments.find(x => x.id == id);
        if (now) logAppointmentAudit(oldApp, now, details);
    });
}

function openAuditModal(entityType, entityId, entityName) {
    _auditCtx = { entityType, entityId, entityName };
    _auditFilterMonth = null;
    _auditPage = 0;
    document.getElementById('audit-filter-dot').classList.add('hidden');
    document.getElementById('audit-calendar-picker').classList.add('hidden');
    _auditCalYear = new Date().getFullYear();
    _renderAuditTimeline();
    document.getElementById('modal-audit').classList.add('active');
}

function _renderAuditTimeline() {
    const { entityType, entityId, entityName } = _auditCtx;
    const idStr = String(entityId || '');
    let entries = [];
    if (entityType === 'sistema') {
        entries = auditLog.filter(e => ['usuario', 'grupo', 'unidade', 'sistema'].includes(e.entityType));
    } else if (entityType === 'paciente-completo') {
        entries = auditLog.filter(e =>
            (e.entityType === 'paciente' && e.entityId === idStr) ||
            (e.entityType === 'agendamento' && String(e.patientId || '') === idStr));
    } else if (idStr) {
        entries = auditLog.filter(e => e.entityType === entityType && e.entityId === idStr);
    } else {
        entries = auditLog.filter(e => e.entityType === entityType);
    }
    if (_auditFilterMonth) {
        entries = entries.filter(e => {
            const d = new Date(e.ts);
            return d.getFullYear() === _auditFilterMonth.year && d.getMonth() === _auditFilterMonth.month;
        });
    }
    const titleMap = { agendamento: 'Agendamento', paciente: 'Paciente', 'paciente-completo': 'Paciente', vacina: 'Vacina', lote: 'Lote / Vacina', usuario: 'Usuário', grupo: 'Grupo', unidade: 'Unidade', sistema: 'Configuração' };
    document.getElementById('audit-modal-subtitle').textContent = entityName || titleMap[entityType] || entityType;
    const list = document.getElementById('audit-timeline');
    const isAdmin = isCurrentUserAdmin();
    if (entries.length === 0) {
        list.innerHTML = `<div class="flex flex-col items-center justify-center py-16 text-center">
            <div class="h-16 w-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                <i class="fas fa-history text-slate-300 text-2xl"></i>
            </div>
            <p class="text-sm font-black text-slate-400 uppercase tracking-widest">${_auditFilterMonth ? 'Nenhum registro neste mês' : 'Sem histórico registrado'}</p>
            <p class="text-xs text-slate-300 mt-1">${_auditFilterMonth ? 'Tente outro período ou limpe o filtro' : 'Alterações futuras aparecerão aqui'}</p>
        </div>`;
    } else {
        const totalPages = Math.ceil(entries.length / _AUDIT_PAGE_SIZE);
        if (_auditPage >= totalPages) _auditPage = totalPages - 1;
        const pageEntries = entries.slice(_auditPage * _AUDIT_PAGE_SIZE, (_auditPage + 1) * _AUDIT_PAGE_SIZE);
        const timelineHtml = pageEntries.map((e, i) => {
            const d = new Date(e.ts);
            const dateStr = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
            const timeStr = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
            const { display: userDisplay, initials } = getDisplayName(e.userName);
            const actionColors = {
                'Criado':  { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-300', icon: 'fa-plus-circle', avatarBg: 'bg-emerald-500', line: 'bg-emerald-200' },
                'Editado': { bg: 'bg-blue-100',    text: 'text-blue-700',    border: 'border-blue-300',    icon: 'fa-pen-to-square', avatarBg: 'bg-blue-500',   line: 'bg-blue-200'    },
                'Excluído':{ bg: 'bg-red-100',     text: 'text-red-700',     border: 'border-red-300',     icon: 'fa-trash',         avatarBg: 'bg-red-500',    line: 'bg-red-200'     }
            };
            const c = actionColors[e.action] || actionColors['Editado'];
            const isLast = i === pageEntries.length - 1;
            const trashBtn = isAdmin ? `<button onclick="deleteAuditEntry('${e.id}')" title="Excluir registro" class="ml-1 h-7 w-7 rounded-full flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition shrink-0"><i class="fas fa-trash text-[11px]"></i></button>` : '';
            return `<div class="flex gap-3 ${isLast ? '' : 'pb-4'}">
                <div class="flex flex-col items-center shrink-0">
                    <div class="h-9 w-9 ${c.avatarBg} rounded-full flex items-center justify-center text-white text-[10px] font-black shadow-md shrink-0">${initials}</div>
                    ${!isLast ? `<div class="w-0.5 flex-1 mt-2 ${c.line} min-h-4"></div>` : ''}
                </div>
                <div class="flex-1 min-w-0 pb-1">
                    <div class="flex flex-wrap items-center gap-2 mb-1">
                        <span class="font-black text-navy-900 text-sm truncate">${userDisplay}</span>
                        <span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${c.bg} ${c.text} border ${c.border}">
                            <i class="fas ${c.icon} mr-1"></i>${e.action}
                        </span>
                        ${e.entityType !== entityType || entityType === 'sistema' ? `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-500 uppercase">${titleMap[e.entityType] || e.entityType}</span>` : ''}
                    </div>
                    ${e.entityName ? `<p class="text-xs text-slate-600 font-bold truncate mb-0.5"><i class="fas fa-tag text-slate-300 mr-1 text-[10px]"></i>${e.entityName}</p>` : ''}
                    ${e.changes && e.changes.length ? `<div class="mt-1 mb-1 space-y-1">${e.changes.map(ch => `<div class="flex flex-wrap items-center gap-1 text-[11px] bg-slate-50 border border-slate-100 rounded-lg px-2 py-1"><span class="font-black text-slate-500 shrink-0">${ch.field}:</span><span class="text-red-500 font-bold line-through max-w-[120px] truncate" title="${ch.de}">${ch.de}</span><i class="fas fa-arrow-right text-slate-300 text-[9px] shrink-0"></i><span class="text-emerald-600 font-black max-w-[120px] truncate" title="${ch.para}">${ch.para}</span></div>`).join('')}</div>` : (e.details ? `<p class="text-[11px] text-slate-400 font-bold mb-0.5"><i class="fas fa-info-circle mr-1"></i>${e.details}</p>` : '')}
                    <p class="text-[10px] text-slate-400 flex items-center gap-1 mt-1">
                        <i class="far fa-clock"></i>
                        <span>${dateStr} às ${timeStr}</span>
                        ${trashBtn}
                    </p>
                </div>
            </div>`;
        }).join('');
        const paginationHtml = totalPages > 1 ? `
            <div class="flex items-center justify-between pt-4 mt-2 border-t border-slate-100 shrink-0">
                <button onclick="auditGoToPage(${_auditPage - 1})" ${_auditPage === 0 ? 'disabled' : ''} class="h-8 px-3 rounded-xl text-xs font-black flex items-center gap-1.5 transition ${_auditPage === 0 ? 'text-slate-300 cursor-not-allowed' : 'text-slate-600 hover:bg-slate-100'}">
                    <i class="fas fa-chevron-left text-[10px]"></i> Anterior
                </button>
                <span class="text-[11px] font-black text-slate-400 uppercase tracking-wider">
                    ${_auditPage + 1} / ${totalPages}
                    <span class="text-slate-300 font-bold normal-case tracking-normal ml-1">(${entries.length} registros)</span>
                </span>
                <button onclick="auditGoToPage(${_auditPage + 1})" ${_auditPage >= totalPages - 1 ? 'disabled' : ''} class="h-8 px-3 rounded-xl text-xs font-black flex items-center gap-1.5 transition ${_auditPage >= totalPages - 1 ? 'text-slate-300 cursor-not-allowed' : 'text-slate-600 hover:bg-slate-100'}">
                    Próxima <i class="fas fa-chevron-right text-[10px]"></i>
                </button>
            </div>` : '';
        list.innerHTML = `<div>${timelineHtml}</div>${paginationHtml}`;
        list.scrollTop = 0;
    }
}

function auditGoToPage(page) {
    _auditPage = page;
    _renderAuditTimeline();
}

function toggleAuditCalendar() {
    const picker = document.getElementById('audit-calendar-picker');
    const isHidden = picker.classList.contains('hidden');
    picker.classList.toggle('hidden', !isHidden);
    if (isHidden) _renderAuditCalendarGrid();
}

function _renderAuditCalendarGrid() {
    document.getElementById('audit-cal-year').textContent = _auditCalYear;
    const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const grid = document.getElementById('audit-cal-months');
    grid.innerHTML = months.map((m, i) => {
        const isActive = _auditFilterMonth && _auditFilterMonth.year === _auditCalYear && _auditFilterMonth.month === i;
        return `<button onclick="selectAuditMonth(${_auditCalYear},${i})" class="py-1.5 rounded-xl text-xs font-black transition ${isActive ? 'bg-blue-600 text-white shadow' : 'text-slate-600 hover:bg-blue-50 hover:text-blue-700'}">${m}</button>`;
    }).join('');
}

function auditCalendarPrevYear() { _auditCalYear--; _renderAuditCalendarGrid(); }
function auditCalendarNextYear() { _auditCalYear++; _renderAuditCalendarGrid(); }

function selectAuditMonth(year, month) {
    _auditFilterMonth = { year, month };
    _auditPage = 0;
    document.getElementById('audit-filter-dot').classList.remove('hidden');
    document.getElementById('audit-calendar-picker').classList.add('hidden');
    _renderAuditTimeline();
}

function clearAuditFilter() {
    _auditFilterMonth = null;
    _auditPage = 0;
    document.getElementById('audit-filter-dot').classList.add('hidden');
    document.getElementById('audit-calendar-picker').classList.add('hidden');
    _renderAuditTimeline();
}

function cleanOrphanAuditLogs() {
    if (!isCurrentUserAdmin()) return;
    const patientIds   = new Set(patients.map(p => String(p.id)));
    const vaccineIds   = new Set(vaccines.map(v => String(v.id)));
    const appointIds   = new Set(appointments.map(a => String(a.id)));
    const loteIds      = new Set(vaccineLots.map(l => String(l.id)));
    const userIds      = new Set(appUsers.map(u => String(u.id)));
    const groupIds     = new Set(appGroups.map(g => String(g.id)));

    const entityMap = {
        paciente:     patientIds,
        vacina:       vaccineIds,
        agendamento:  appointIds,
        lote:         loteIds,
        usuario:      userIds,
        grupo:        groupIds,
    };

    const orphans = auditLog.filter(e => {
        if (e.entityType === 'sistema') return false;
        const set = entityMap[e.entityType];
        if (!set) return false;
        return e.entityId && !set.has(e.entityId);
    });

    if (orphans.length === 0) {
        showNotification('Nenhum log órfão encontrado.', 'info');
        return;
    }

    showConfirmDanger(
        `Excluir ${orphans.length} log${orphans.length > 1 ? 's' : ''} órfão${orphans.length > 1 ? 's' : ''} (sem item vinculado)?`,
        () => {
            const removes = orphans.map(e => db.ref('auditLog/' + e.id).remove());
            Promise.all(removes)
                .then(() => {
                    const orphanIds = new Set(orphans.map(e => e.id));
                    auditLog = auditLog.filter(e => !orphanIds.has(e.id));
                    showNotification(`${orphans.length} log${orphans.length > 1 ? 's' : ''} órfão${orphans.length > 1 ? 's' : ''} removido${orphans.length > 1 ? 's' : ''}.`, 'success');
                })
                .catch(() => showNotification('Erro ao limpar logs órfãos.', 'error'));
        }
    );
}

function deleteAuditEntry(entryId) {
    if (!isCurrentUserAdmin()) return;
    showConfirmDanger('Excluir este registro do histórico permanentemente?', () => {
        db.ref('auditLog/' + entryId).remove()
            .then(() => {
                auditLog = auditLog.filter(e => e.id !== entryId);
                _renderAuditTimeline();
                showNotification('Registro excluído do histórico.', 'success');
            })
            .catch(() => showNotification('Erro ao excluir registro.', 'error'));
    });
}

// Fecha o picker ao clicar fora (from index.html line 2364)
document.addEventListener('click', function(ev) {
    const wrapper = document.getElementById('audit-calendar-wrapper');
    if (wrapper && !wrapper.contains(ev.target)) {
        document.getElementById('audit-calendar-picker')?.classList.add('hidden');
    }
});
