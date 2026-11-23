// ─── CRM DE CONTATO (aba "Contato" do Prontuário) ──────────────────────────────

const CONTACT_TYPES = [
    { val: 'ligacao',    label: 'Ligação',      icon: 'fa-phone',     prefix: 'fas' },
    { val: 'whatsapp',   label: 'WhatsApp',     icon: 'fa-whatsapp',  prefix: 'fab' },
    { val: 'presencial', label: 'Presencial',   icon: 'fa-user',      prefix: 'fas' },
    { val: 'nota',       label: 'Nota interna', icon: 'fa-note-sticky', prefix: 'fas' }
];

let _concluirContatoPending = null;
let _editarContatoPending = null;
let _excluirContatoPending = null;

let _contactsShowAll = false;
try { _contactsShowAll = localStorage.getItem('contacts-show-all') === '1'; } catch (e) {}

function _escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]));
}

function _isContactDue(c) {
    if (c.status !== 'aberto' || !c.agendadoPara) return false;
    return c.agendadoPara <= new Date().toISOString().split('T')[0];
}

function _refreshContactAlertsUI() {
    updateContactsBadge();
    if (typeof renderKanban === 'function') renderKanban();
}

// Contatos não são entidade própria na auditoria: entram na rastreabilidade do
// paciente, que é onde o histórico é consultado.
function _logContatoAudit(action, contato, details) {
    if (typeof logAudit !== 'function' || !contato) return;
    const pat = (typeof patients !== 'undefined') ? patients.find(p => p.id == contato.patientId) : null;
    const tipoLabel = (CONTACT_TYPES.find(t => t.val === contato.tipo) || {}).label || contato.tipo || '';
    logAudit(action, 'paciente', contato.patientId, pat ? pat.nome : '—',
        `Contato (${tipoLabel})${details ? ' · ' + details : ''}: ${String(contato.texto || '').slice(0, 120)}`);
}

function _createContactEntry(patientId, texto, tipo, agendadoPara) {
    const entry = {
        id:          Date.now() + Math.floor(Math.random() * 1000),
        patientId:   Number(patientId),
        autor:       (typeof currentUser !== 'undefined' && currentUser) ? (currentUser.nome || '').toUpperCase() : '',
        autorId:     (typeof currentUser !== 'undefined' && currentUser) ? currentUser.id : null,
        tipo,
        texto,
        criadoEm:    new Date().toISOString(),
        agendadoPara: agendadoPara || null,
        status:      agendadoPara ? 'aberto' : 'concluido',
        concluidoEm: agendadoPara ? null : new Date().toISOString()
    };
    patientContacts.push(entry);
    return entry;
}

// ── Permissões ────────────────────────────────────────────────────────────────

function _isContactAuthor(c) {
    if (typeof currentUser === 'undefined' || !currentUser) return false;
    if (c.autorId != null) return c.autorId === currentUser.id;
    return (c.autor || '') === (currentUser.nome || '').toUpperCase();
}

function _canDeleteContact() {
    return isCurrentUserAdmin() || hasPerm('editar_paciente');
}

function _canEditContact(c) {
    if (isCurrentUserAdmin() || hasPerm('editar_paciente')) return true;
    return _isContactAuthor(c);
}

// ── Sub-abas do prontuário ──────────────────────────────────────────────────

function switchProntuarioTab(tab) {
    _prontuarioTab = tab;
    const modal        = document.getElementById('modal-patient-history');
    const patientId    = modal ? modal.dataset.patientId : null;
    const patientHeader = document.getElementById('ph-patient-header');

    const tabs = {
        info:    { btn: document.getElementById('phtab-info'),    pane: document.getElementById('ph-tab-info') },
        rotina:  { btn: document.getElementById('phtab-rotina'),  pane: document.getElementById('ph-tab-rotina') },
        contato: { btn: document.getElementById('phtab-contato'), pane: document.getElementById('ph-tab-contato') }
    };
    if (!tabs.info.btn || !tabs.rotina.btn || !tabs.contato.btn || !tabs.info.pane || !tabs.rotina.pane || !tabs.contato.pane) return;

    if (patientHeader) patientHeader.classList.toggle('hidden', tab !== 'info');

    Object.keys(tabs).forEach(key => {
        const active = key === tab;
        const { btn, pane } = tabs[key];
        btn.classList.toggle('text-indigo-700', active);
        btn.classList.toggle('bg-indigo-50', active);
        btn.classList.toggle('border-indigo-500', active);
        btn.classList.toggle('text-slate-500', !active);
        btn.classList.toggle('border-transparent', !active);
        pane.classList.toggle('hidden', !active);
    });

    if (!patientId) return;
    if (tab === 'contato') renderContatoTab(patientId);
    if (tab === 'rotina' && typeof renderRotinaTab === 'function') renderRotinaTab(patientId);
}

// ── Feed (form + timeline) ───────────────────────────────────────────────────

function copyContatoPhone(contato) {
    const num = formatPhone(contato || '');
    navigator.clipboard.writeText(num).then(() => {
        showNotification('Número copiado!', 'success');
    });
}

function renderContatoTab(patientId) {
    const nameEl = document.getElementById('ph-contato-patient-name');
    const waEl   = document.getElementById('ph-contato-whatsapp');
    const respWrap = document.getElementById('ph-contato-resp-wrap');
    const respEl   = document.getElementById('ph-contato-resp-name');
    const p = patients.find(x => x.id == patientId);
    if (nameEl) nameEl.textContent = p ? p.nome : '';
    if (waEl) {
        const numEl  = document.getElementById('ph-contato-whatsapp-num');
        const linkEl = document.getElementById('ph-contato-whatsapp-link');
        if (p && p.contato) {
            if (linkEl) linkEl.href = `https://wa.me/55${formatWa(p.contato)}`;
            waEl.classList.remove('hidden');
            waEl.classList.add('flex');
            if (numEl) {
                numEl.textContent = formatPhone(p.contato);
                numEl.onclick = () => copyContatoPhone(p.contato);
            }
            const copyBtn = document.getElementById('ph-contato-whatsapp-copy');
            if (copyBtn) copyBtn.onclick = () => copyContatoPhone(p.contato);
        } else {
            waEl.classList.add('hidden');
            waEl.classList.remove('flex');
        }
    }
    if (respWrap && respEl) {
        const parentescoEl = document.getElementById('ph-contato-resp-parentesco');
        if (p && p.responsavel) {
            respEl.textContent = p.responsavel;
            respWrap.classList.remove('hidden');
            if (parentescoEl) {
                if (p.responsavelParentesco) {
                    parentescoEl.textContent = p.responsavelParentesco;
                    parentescoEl.classList.remove('hidden');
                } else {
                    parentescoEl.classList.add('hidden');
                }
            }
        } else {
            respWrap.classList.add('hidden');
        }
    }
    renderContatoForm(patientId);
    renderContatoTimeline(patientId);
}

function renderContatoForm(patientId) {
    const el = document.getElementById('contato-form-wrap');
    if (!el) return;
    el.innerHTML = `
    <div class="space-y-2.5">
        <textarea id="contato-novo-texto" rows="2" class="w-full border border-slate-200 rounded-lg py-2 px-3 focus:ring-2 focus:ring-clinic-500 outline-none text-sm" placeholder="Registrar contato, comentário ou combinado com o paciente..."></textarea>
        <div class="flex flex-wrap items-end gap-2">
            <div class="flex-1 min-w-[140px]">
                <label class="block text-[9px] font-black text-slate-400 uppercase mb-1">Tipo</label>
                <select id="contato-novo-tipo" class="w-full border border-slate-200 rounded-lg py-2 px-2.5 text-xs font-bold focus:ring-2 focus:ring-clinic-500 outline-none">
                    ${CONTACT_TYPES.map(t => `<option value="${t.val}">${t.label}</option>`).join('')}
                </select>
            </div>
            <div class="flex-1 min-w-[150px]">
                <label class="block text-[9px] font-black text-slate-400 uppercase mb-1">Lembrar de contatar em</label>
                <input type="date" id="contato-novo-data" class="w-full border border-slate-200 rounded-lg py-2 px-2.5 text-xs font-bold focus:ring-2 focus:ring-clinic-500 outline-none">
            </div>
            <button onclick="publicarContato(${patientId})" class="bg-clinic-600 hover:bg-clinic-700 text-white font-black text-xs px-4 py-2 rounded-lg shadow-sm transition uppercase tracking-wide shrink-0">
                <i class="fas fa-paper-plane mr-1"></i>Publicar
            </button>
        </div>
    </div>`;
}

function publicarContato(patientId) {
    const textoEl = document.getElementById('contato-novo-texto');
    const tipoEl  = document.getElementById('contato-novo-tipo');
    const dataEl  = document.getElementById('contato-novo-data');
    const texto = (textoEl.value || '').trim();
    if (!texto) { textoEl.classList.add('border-red-400'); textoEl.focus(); return; }
    textoEl.classList.remove('border-red-400');

    const _novoContato = _createContactEntry(patientId, texto, tipoEl.value, dataEl.value || null);
    _logContatoAudit('Criado', _novoContato,
        _novoContato.agendadoPara ? `lembrete em ${_novoContato.agendadoPara.split('-').reverse().join('/')}` : null);
    saveAll();

    _refreshContactAlertsUI();
    updateProntuarioContatoBadge(patientId);
    renderContatoTimeline(patientId);

    textoEl.value = '';
    dataEl.value = '';
    showNotification('Contato publicado.', 'success');
}

function renderContatoTimeline(patientId) {
    const el = document.getElementById('contato-timeline');
    if (!el) return;
    const list = patientContacts
        .filter(c => c.patientId == patientId)
        .sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm));

    if (!list.length) {
        el.innerHTML = '<div class="text-center py-10"><i class="fas fa-comment-slash text-4xl text-slate-200 mb-3"></i><p class="text-sm text-slate-400 font-bold uppercase">Nenhum contato registrado</p></div>';
        return;
    }
    el.innerHTML = list.map(_renderContatoCard).join('');
}

function _renderContatoCard(c) {
    const typeInfo = CONTACT_TYPES.find(t => t.val === c.tipo) || CONTACT_TYPES[CONTACT_TYPES.length - 1];
    const dt = new Date(c.criadoEm);
    const dataFmt = dt.toLocaleDateString('pt-BR') + ' ' + dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    let pendingChip = '', concluirBtn = '';
    if (c.status === 'aberto' && c.agendadoPara) {
        const todayStr = new Date().toISOString().split('T')[0];
        const dateFmt = c.agendadoPara.split('-').reverse().join('/');
        let chipCls, chipLabel;
        if (c.agendadoPara < todayStr)      { chipCls = 'bg-red-100 text-red-700 border-red-200';     chipLabel = `Atrasado · ${dateFmt}`; }
        else if (c.agendadoPara === todayStr) { chipCls = 'bg-amber-100 text-amber-700 border-amber-200'; chipLabel = `Hoje · ${dateFmt}`; }
        else                                 { chipCls = 'bg-slate-100 text-slate-600 border-slate-200'; chipLabel = `Agendado · ${dateFmt}`; }
        pendingChip = `<span class="inline-flex items-center text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${chipCls} mt-1.5"><i class="fas fa-clock mr-1"></i>${chipLabel}</span>`;
        concluirBtn = `<button onclick="openConcluirContatoModal(${c.id})" class="mt-2 w-full sm:w-auto bg-clinic-600 hover:bg-clinic-700 text-white text-[10px] font-black uppercase tracking-wide px-3 py-1.5 rounded-lg transition shadow-sm"><i class="fas fa-check mr-1"></i>Concluir contato</button>`;
    }

    let actions = '';
    const canEdit = _canEditContact(c);
    const canDelete = _canDeleteContact();
    if (canEdit || canDelete) {
        actions = `<div class="flex items-center gap-1 shrink-0">
            ${canEdit ? `<button onclick="openEditarContatoModal(${c.id})" title="Editar publicação" class="h-6 w-6 rounded-lg bg-white hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 border border-slate-200 flex items-center justify-center transition"><i class="fas fa-pen text-[9px]"></i></button>` : ''}
            ${canDelete ? `<button onclick="openExcluirContatoModal(${c.id})" title="Excluir publicação" class="h-6 w-6 rounded-lg bg-white hover:bg-red-50 text-slate-400 hover:text-red-600 border border-slate-200 flex items-center justify-center transition"><i class="fas fa-trash text-[9px]"></i></button>` : ''}
        </div>`;
    }

    return `
    <div class="border border-slate-200 rounded-xl p-3.5 bg-slate-50/50">
        <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-2 min-w-0">
                <div class="h-7 w-7 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0"><i class="${typeInfo.prefix} ${typeInfo.icon} text-[11px]"></i></div>
                <div class="min-w-0">
                    <p class="text-[11px] font-black text-navy-900 truncate">${_escapeHtml(c.autor) || 'Usuário'}</p>
                    <p class="text-[9px] text-slate-400 uppercase font-bold tracking-wide">${typeInfo.label} · ${dataFmt}</p>
                </div>
            </div>
            ${actions}
        </div>
        <p class="text-xs text-slate-700 mt-2 whitespace-pre-wrap">${_escapeHtml(c.texto)}</p>
        ${pendingChip}
        ${concluirBtn}
    </div>`;
}

function updateProntuarioContatoBadge(patientId) {
    const badge = document.getElementById('phtab-contato-badge');
    if (!badge) return;
    const pending = patientContacts.filter(c => c.patientId == patientId && c.status === 'aberto').length;
    badge.textContent = pending;
    badge.classList.toggle('hidden', pending === 0);
}

// ── Concluir contato (fecha pendência, publica resultado, opcionalmente reagenda) ──

function openConcluirContatoModal(contactId) {
    _concluirContatoPending = contactId;
    document.getElementById('concluir-contato-texto').value = '';
    document.getElementById('concluir-contato-reagendar').checked = false;
    document.getElementById('reagendar-contato-data-wrap').classList.add('hidden');
    document.getElementById('reagendar-contato-data').value = '';
    document.getElementById('concluir-contato-err').classList.add('hidden');
    document.getElementById('modal-concluir-contato').classList.add('active');
}

function closeConcluirContatoModal() {
    document.getElementById('modal-concluir-contato').classList.remove('active');
    _concluirContatoPending = null;
}

function toggleReagendarContatoField() {
    const chk  = document.getElementById('concluir-contato-reagendar');
    const wrap = document.getElementById('reagendar-contato-data-wrap');
    wrap.classList.toggle('hidden', !chk.checked);
    if (chk.checked) {
        const dataEl = document.getElementById('reagendar-contato-data');
        if (!dataEl.value) {
            const d = new Date(); d.setDate(d.getDate() + 7);
            dataEl.value = d.toISOString().split('T')[0];
        }
    }
}

function confirmConcluirContato() {
    const textoEl = document.getElementById('concluir-contato-texto');
    const texto = (textoEl.value || '').trim();
    const errEl = document.getElementById('concluir-contato-err');

    if (!texto) {
        errEl.innerHTML = '<i class="fas fa-exclamation-circle mr-1"></i>Descreva o resultado da conversa.';
        errEl.classList.remove('hidden');
        return;
    }
    const reagendar = document.getElementById('concluir-contato-reagendar').checked;
    const novaData  = document.getElementById('reagendar-contato-data').value;
    if (reagendar && !novaData) {
        errEl.innerHTML = '<i class="fas fa-exclamation-circle mr-1"></i>Escolha a data do novo contato.';
        errEl.classList.remove('hidden');
        return;
    }
    errEl.classList.add('hidden');

    const orig = patientContacts.find(c => c.id === _concluirContatoPending);
    if (!orig) { closeConcluirContatoModal(); return; }

    orig.status = 'concluido';
    orig.concluidoEm = new Date().toISOString();
    const _contatoResultado = _createContactEntry(orig.patientId, texto, orig.tipo, reagendar ? novaData : null);
    _logContatoAudit('Editado', orig, 'concluído');
    _logContatoAudit('Criado', _contatoResultado,
        reagendar ? `resultado · novo contato em ${novaData.split('-').reverse().join('/')}` : 'resultado');
    saveAll();

    _refreshContactAlertsUI();
    updateProntuarioContatoBadge(orig.patientId);
    renderContatoTimeline(orig.patientId);
    closeConcluirContatoModal();
    showNotification('Contato concluído' + (reagendar ? ' e novo contato agendado.' : '.'), 'success');
}

// ── Editar publicação ────────────────────────────────────────────────────────

function openEditarContatoModal(contactId) {
    const c = patientContacts.find(x => x.id === contactId);
    if (!c || !_canEditContact(c)) return;
    _editarContatoPending = contactId;

    const tipoSel = document.getElementById('editar-contato-tipo');
    tipoSel.innerHTML = CONTACT_TYPES.map(t => `<option value="${t.val}">${t.label}</option>`).join('');
    tipoSel.value = c.tipo;

    document.getElementById('editar-contato-texto').value = c.texto;
    document.getElementById('editar-contato-data').value = c.agendadoPara || '';
    document.getElementById('editar-contato-err').classList.add('hidden');
    document.getElementById('modal-editar-contato').classList.add('active');
}

function closeEditarContatoModal() {
    document.getElementById('modal-editar-contato').classList.remove('active');
    _editarContatoPending = null;
}

function confirmEditarContato() {
    const textoEl = document.getElementById('editar-contato-texto');
    const texto = (textoEl.value || '').trim();
    const errEl = document.getElementById('editar-contato-err');
    if (!texto) {
        errEl.classList.remove('hidden');
        return;
    }
    errEl.classList.add('hidden');

    const c = patientContacts.find(x => x.id === _editarContatoPending);
    if (!c || !_canEditContact(c)) { closeEditarContatoModal(); return; }

    const novaData = document.getElementById('editar-contato-data').value || null;
    c.texto = texto;
    c.tipo  = document.getElementById('editar-contato-tipo').value;
    c.agendadoPara = novaData;
    c.status = novaData ? 'aberto' : 'concluido';
    if (!novaData && !c.concluidoEm) c.concluidoEm = new Date().toISOString();
    if (novaData) c.concluidoEm = null;
    _logContatoAudit('Editado', c, novaData ? `lembrete em ${novaData.split('-').reverse().join('/')}` : 'sem lembrete');
    saveAll();

    _refreshContactAlertsUI();
    updateProntuarioContatoBadge(c.patientId);
    renderContatoTimeline(c.patientId);
    closeEditarContatoModal();
    showNotification('Publicação atualizada.', 'success');
}

// ── Excluir publicação ───────────────────────────────────────────────────────

function openExcluirContatoModal(contactId) {
    if (!_canDeleteContact()) return;
    _excluirContatoPending = contactId;
    document.getElementById('modal-delete-contato').classList.add('active');
}

function closeExcluirContatoModal() {
    document.getElementById('modal-delete-contato').classList.remove('active');
    _excluirContatoPending = null;
}

function confirmExcluirContato() {
    if (!_canDeleteContact() || !_excluirContatoPending) { closeExcluirContatoModal(); return; }

    const c = patientContacts.find(x => x.id === _excluirContatoPending);
    if (!c) { closeExcluirContatoModal(); return; }

    _logContatoAudit('Excluído', c);
    patientContacts = patientContacts.filter(x => x.id !== _excluirContatoPending);
    saveAll();

    _refreshContactAlertsUI();
    updateProntuarioContatoBadge(c.patientId);
    renderContatoTimeline(c.patientId);
    closeExcluirContatoModal();
    showNotification('Publicação excluída.', 'success');
}

// ── Sino global de contatos agendados ────────────────────────────────────────

function _visibleDueContacts() {
    return patientContacts.filter(_isContactDue).filter(c => _contactsShowAll || _isContactAuthor(c));
}

function updateContactsBadge() {
    const badge = document.getElementById('contacts-badge');
    if (!badge) return;
    const count = _visibleDueContacts().length;
    badge.textContent = count > 99 ? '99+' : count;
    badge.classList.toggle('hidden', count === 0);
    badge.classList.toggle('flex', count > 0);
}

function toggleContactsShowAll(e) {
    if (e) e.stopPropagation();
    _contactsShowAll = !_contactsShowAll;
    try { localStorage.setItem('contacts-show-all', _contactsShowAll ? '1' : '0'); } catch (e) {}
    updateContactsBadge();
    renderContactsPanel();
}

function _updateContactsShowAllBtn() {
    const btn = document.getElementById('contacts-showall-btn');
    if (!btn) return;
    btn.classList.toggle('bg-white', _contactsShowAll);
    btn.classList.toggle('text-indigo-700', _contactsShowAll);
    btn.classList.toggle('bg-white/10', !_contactsShowAll);
    btn.classList.toggle('text-white/80', !_contactsShowAll);
}

function toggleContactsPanel(e) {
    if (e) e.stopPropagation();
    const panel = document.getElementById('contacts-panel');
    if (!panel) return;
    if (panel.classList.contains('hidden')) {
        // Os dois painéis ocupam a mesma posição — fecha o de lote pendente antes de abrir
        const other = document.getElementById('semlote-panel');
        if (other) { other.classList.add('hidden'); other.classList.remove('flex'); }
        renderContactsPanel();
        panel.classList.remove('hidden');
        panel.classList.add('flex');
    } else {
        panel.classList.add('hidden');
        panel.classList.remove('flex');
    }
}

function renderContactsPanel() {
    const list = document.getElementById('contacts-panel-list');
    if (!list) return;
    _updateContactsShowAllBtn();
    const todayStr = new Date().toISOString().split('T')[0];
    const due = _visibleDueContacts().sort((a, b) => a.agendadoPara.localeCompare(b.agendadoPara));

    if (!due.length) {
        list.innerHTML = '<div class="text-center py-8"><i class="fas fa-check-circle text-3xl text-slate-200 mb-2 block"></i><p class="text-xs text-slate-400 font-bold uppercase">Nenhum contato pendente</p></div>';
        return;
    }

    list.innerHTML = due.map(c => {
        const p = patients.find(x => x.id == c.patientId);
        const isVencido = c.agendadoPara < todayStr;
        const typeInfo = CONTACT_TYPES.find(t => t.val === c.tipo) || CONTACT_TYPES[CONTACT_TYPES.length - 1];
        const autorTag = _contactsShowAll && c.autor ? `<p class="text-[9px] font-bold text-slate-400 uppercase truncate">${_escapeHtml(c.autor)}</p>` : '';
        const dateFmt = c.agendadoPara.split('-').reverse().join('/');
        return `
        <button onclick="_openContactFromPanel(${c.patientId})" class="w-full text-left p-3 rounded-xl border ${isVencido ? 'border-red-200 bg-red-50/50 hover:border-red-400' : 'border-amber-200 bg-amber-50/50 hover:border-amber-400'} transition">
            <div class="flex items-start justify-between gap-2 mb-1">
                <span class="min-w-0">
                    <p class="text-xs font-black text-navy-900 truncate">${_escapeHtml(p ? p.nome : 'Paciente removido')}</p>
                    ${autorTag}
                </span>
                <span class="flex flex-col items-end shrink-0">
                    <span class="text-[9px] font-black uppercase ${isVencido ? 'text-red-600' : 'text-amber-600'}">${isVencido ? 'Atrasado' : 'Hoje'}</span>
                    <span class="text-[9px] font-bold text-slate-400">${dateFmt}</span>
                </span>
            </div>
            <p class="text-[11px] text-slate-500 truncate"><i class="${typeInfo.prefix} ${typeInfo.icon} mr-1"></i>${_escapeHtml(c.texto)}</p>
        </button>`;
    }).join('');
}

function _openContactFromPanel(patientId) {
    toggleContactsPanel();
    if (typeof viewPatientHistory === 'function') viewPatientHistory(patientId);
    switchProntuarioTab('contato');
}

// ── Sino global de agendamentos sem lote (visível apenas para aplicadores) ────

// Pacientes com o grupo recolhido no painel (chave = patientId como string)
const _semLoteCollapsed = new Set();

// Somente quem pode aplicar (ou admin) enxerga o sino de lote pendente
function _canSeeSemLoteBell() {
    return isCurrentUserAdmin() || hasPerm('aplicar');
}

// Agendamentos com status "Agendado" que ainda não tiveram o lote preenchido
function _semLoteAppointments() {
    if (!_canSeeSemLoteBell()) return [];
    return appointments.filter(a =>
        a.status === 'Agendado' &&
        !a.loteId &&
        !(a.lote && String(a.lote).trim())
    );
}

function updateSemLoteBadge() {
    const btn = document.getElementById('btn-semlote-bell');
    const badge = document.getElementById('semlote-badge');
    if (!btn || !badge) return;

    if (!_canSeeSemLoteBell()) {
        btn.style.display = 'none';
        const panel = document.getElementById('semlote-panel');
        if (panel) { panel.classList.add('hidden'); panel.classList.remove('flex'); }
        return;
    }
    btn.style.display = '';

    const count = _semLoteAppointments().length;
    badge.textContent = count > 99 ? '99+' : count;
    badge.classList.toggle('hidden', count === 0);
    badge.classList.toggle('flex', count > 0);
}

function toggleSemLotePanel(e) {
    if (e) e.stopPropagation();
    if (!_canSeeSemLoteBell()) return;
    const panel = document.getElementById('semlote-panel');
    if (!panel) return;
    if (panel.classList.contains('hidden')) {
        // Os dois painéis ocupam a mesma posição — fecha o de contatos antes de abrir
        const other = document.getElementById('contacts-panel');
        if (other) { other.classList.add('hidden'); other.classList.remove('flex'); }
        renderSemLotePanel();
        panel.classList.remove('hidden');
        panel.classList.add('flex');
    } else {
        panel.classList.add('hidden');
        panel.classList.remove('flex');
    }
}

function renderSemLotePanel() {
    const list = document.getElementById('semlote-panel-list');
    if (!list) return;
    const todayStr = new Date().toISOString().split('T')[0];
    const pend = _semLoteAppointments().sort((a, b) =>
        String(a.data).localeCompare(String(b.data)) || String(a.hora || '').localeCompare(String(b.hora || ''))
    );

    if (!pend.length) {
        list.innerHTML = '<div class="text-center py-8"><i class="fas fa-check-circle text-3xl text-slate-200 mb-2 block"></i><p class="text-xs text-slate-400 font-bold uppercase">Todos os agendamentos com lote</p></div>';
        return;
    }

    // Agrupa por paciente, preservando a ordem cronológica dentro de cada grupo
    const grupos = new Map();
    pend.forEach(a => {
        const key = String(a.patientId);
        if (!grupos.has(key)) grupos.set(key, []);
        grupos.get(key).push(a);
    });

    list.innerHTML = Array.from(grupos.entries()).map(([patId, apps]) => {
        const p = patients.find(x => x.id == patId);
        const grupoAtrasado = apps.some(a => a.data < todayStr);
        const aberto = !_semLoteCollapsed.has(patId);

        const itens = apps.map(a => {
            const v = vaccines.find(x => x.id == a.vaccineId);
            const nomeVacina = v ? v.nome : 'Vacina não identificada';
            const isAtrasado = a.data < todayStr;
            const dateFmt = a.data ? String(a.data).split('-').reverse().join('/') : '—';
            const horaFmt = a.hora ? ` ${a.hora}` : '';
            return `
            <button onclick="_openSemLoteFromPanel(${a.id})" class="w-full text-left px-3 py-2 rounded-lg border border-slate-200 bg-white hover:border-pink-400 transition flex items-center justify-between gap-2">
                <span class="text-[11px] text-slate-600 truncate min-w-0"><i class="fas fa-syringe mr-1 text-slate-400"></i>${_escapeHtml(nomeVacina)}</span>
                <span class="text-[9px] font-bold shrink-0 ${isAtrasado ? 'text-red-600' : 'text-slate-400'}">${dateFmt}${horaFmt}</span>
            </button>`;
        }).join('');

        return `
        <div class="rounded-xl border ${grupoAtrasado ? 'border-red-200 bg-red-50/50' : 'border-pink-200 bg-pink-50/50'} overflow-hidden">
            <div class="w-full p-3 flex items-start justify-between gap-2">
                <button onclick="_openSemLoteGrupoFromPanel('${patId}', event)" class="text-left min-w-0 flex-1 hover:opacity-70 transition" title="Abrir edição em grupo">
                    <p class="text-xs font-black text-navy-900 truncate">${_escapeHtml(p ? p.nome : 'Paciente removido')}</p>
                    <p class="text-[9px] font-bold uppercase ${grupoAtrasado ? 'text-red-600' : 'text-pink-600'}">${apps.length} vacina${apps.length > 1 ? 's' : ''} sem lote</p>
                </button>
                <button onclick="toggleSemLoteGroup('${patId}', event)" class="shrink-0 h-6 w-6 rounded-lg flex items-center justify-center hover:bg-black/10 transition" title="${aberto ? 'Ocultar vacinas' : 'Mostrar vacinas'}">
                    <i class="fas fa-chevron-${aberto ? 'up' : 'down'} text-[10px] text-slate-400"></i>
                </button>
            </div>
            <div class="px-3 pb-3 space-y-1.5 ${aberto ? '' : 'hidden'}">${itens}</div>
        </div>`;
    }).join('');
}

// Recolhe/expande a lista de vacinas de um paciente no painel
function toggleSemLoteGroup(patId, e) {
    if (e) e.stopPropagation();
    const key = String(patId);
    if (_semLoteCollapsed.has(key)) _semLoteCollapsed.delete(key);
    else _semLoteCollapsed.add(key);
    renderSemLotePanel();
}

function _openSemLoteFromPanel(appointmentId) {
    toggleSemLotePanel();
    if (typeof editRecord === 'function') editRecord(appointmentId);
}

// Abre a edição em grupo com todos os agendamentos sem lote do paciente
function _openSemLoteGrupoFromPanel(patId, e) {
    if (e) e.stopPropagation();
    // openAgendarGrupoModal não valida permissão internamente
    if (!isCurrentUserAdmin() && !hasPerm('agendar') && !hasPerm('criar_agendamento')) {
        showNotification('Acesso negado: você não tem permissão para editar agendamentos.', 'error');
        return;
    }
    // Importados do CPNI não entram em ações de grupo (mesmo critério do modal)
    const apps = _semLoteAppointments().filter(a => String(a.patientId) === String(patId) && !a.importedCPNI);
    if (!apps.length) {
        showNotification('Nenhuma vacina elegível para edição em grupo.', 'error');
        return;
    }
    toggleSemLotePanel();
    // "Agendar grupo": mantém o status Agendado e permite preencher o lote de cada vacina
    if (typeof openAgendarGrupoModal === 'function') openAgendarGrupoModal(patId, 'Agendado', apps);
}
