/* =========================================================================
   SISTEMA DE MENSAGENS
   Nó RTDB ISOLADO `/messages` com listener próprio.
   NÃO toca saveAll() nem as 9 coleções de cards — persistência independente.
   Reusa: currentuser, users (globais), openView() (card), driveUpload/_saveImgBlob (anexos).
   ========================================================================= */
(function () {
'use strict';

// ---------------------------------------------------------------------------
// Estado local
// ---------------------------------------------------------------------------
let _threads = {};              // { threadId: threadObj }
let _msgListener = null;
let _activeThreadId = null;     // thread aberta na visualização
let _replyTo = null;            // msgId sendo respondida
let _mentionTarget = null;      // 'compose' | 'thread'
let _cardTarget = null;         // 'compose' | 'thread'
let _attachTarget = null;       // 'compose' | 'thread'

// Rascunhos por contexto (menções, cards, anexos ainda não enviados)
const _draft = {
    compose: { mentions: [], cards: [], anexos: [], titulo: '' },
    thread:  { cards: [], anexos: [] }
};
let _mentionSel = [];           // seleção temporária no popup de menções
let _cardArea = 'ativ';         // área ativa no seletor de card

// Cooldown de envio: evita sobrecarregar o Firebase com envios em rajada
const MSG_SEND_COOLDOWN_MS = 5000;
let _lastMsgSendAt = 0;
function _msgSendOnCooldown() {
    const remaining = MSG_SEND_COOLDOWN_MS - (Date.now() - _lastMsgSendAt);
    if (remaining > 0) {
        _toast('Aguarde ' + Math.ceil(remaining / 1000) + 's para enviar outra mensagem.', 'error');
        return true;
    }
    _lastMsgSendAt = Date.now();
    return false;
}

// Retenção: mensagens mais antigas que o limite (por thread) são apagadas automaticamente
const MSG_RETENTION_DEFAULT_DAYS = 30;
const MSG_RETENTION_MAX_DAYS = 365;
const MSG_RETENTION_MIN_DAYS = 1;
const DAY_MS = 24 * 60 * 60 * 1000;
let _purgingThreads = new Set();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const _esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function _me() {
    if (typeof currentuser === 'undefined' || !currentuser) return null;
    return { id: String(currentuser.id || currentuser.user || ''), name: currentuser.name || currentuser.user || 'Usuário' };
}
function _uid() { return typeof generateId === 'function' ? String(generateId()) : String(Date.now() * 1000 + Math.floor(Math.random() * 1000)); }
function _toast(msg, type) { if (typeof showToast === 'function') showToast(msg, type || 'info'); else console.log('[msg]', msg); }

function _initials(name) {
    const parts = String(name || '?').trim().split(/\s+/);
    return ((parts[0] || '')[0] || '?').toUpperCase() + ((parts[1] || '')[0] || '').toUpperCase();
}

// ---------------------------------------------------------------------------
// Diálogo bonito (substitui confirm/prompt nativos)
//   _msgConfirm({title, text, icon, confirmLabel, danger}) -> Promise<bool>
//   _msgPrompt({title, text, value, placeholder, confirmLabel}) -> Promise<string|null>
// ---------------------------------------------------------------------------
let _dialogResolve = null;
function _msgDialog(opts, isPrompt) {
    return new Promise((resolve) => {
        const bd = document.getElementById('msgDialogBackdrop');
        const dlg = document.getElementById('msgDialog');
        const iconWrap = document.getElementById('msgDialogIcon');
        const input = document.getElementById('msgDialogInput');
        const btnOk = document.getElementById('msgDialogConfirm');
        const btnCancel = document.getElementById('msgDialogCancel');
        if (!bd) { resolve(isPrompt ? null : false); return; }

        document.getElementById('msgDialogTitle').textContent = opts.title || (isPrompt ? 'Editar' : 'Confirmar');
        document.getElementById('msgDialogText').textContent = opts.text || '';
        iconWrap.className = 'msg-dialog-icon' + (opts.danger ? ' danger' : '');
        iconWrap.innerHTML = `<i class="fas ${opts.icon || (opts.danger ? 'fa-triangle-exclamation' : 'fa-circle-question')}"></i>`;
        btnOk.textContent = opts.confirmLabel || (isPrompt ? 'Salvar' : (opts.danger ? 'Excluir' : 'Confirmar'));
        btnOk.classList.toggle('msg-btn-danger', !!opts.danger);

        if (isPrompt) {
            input.style.display = 'block';
            input.value = opts.value || '';
            input.placeholder = opts.placeholder || '';
        } else {
            input.style.display = 'none';
        }

        bd.style.display = 'flex';
        if (isPrompt) { setTimeout(() => { input.focus(); input.select(); }, 30); }
        else { setTimeout(() => btnOk.focus(), 30); }

        const cleanup = () => {
            bd.style.display = 'none';
            btnOk.onclick = null; btnCancel.onclick = null; bd.onclick = null; input.onkeydown = null; dlg.onkeydown = null;
            _dialogResolve = null;
        };
        const done = (val) => { cleanup(); resolve(val); };

        btnOk.onclick = () => done(isPrompt ? input.value : true);
        btnCancel.onclick = () => done(isPrompt ? null : false);
        bd.onclick = (e) => { if (e.target === bd) done(isPrompt ? null : false); };
        _dialogResolve = () => done(isPrompt ? null : false); // p/ ESC global
        const onKey = (e) => {
            if (e.key === 'Enter') { e.preventDefault(); done(isPrompt ? input.value : true); }
            else if (e.key === 'Escape') { e.preventDefault(); done(isPrompt ? null : false); }
        };
        (isPrompt ? input : dlg).onkeydown = onKey;
    });
}
function _msgConfirm(opts) { return _msgDialog(opts || {}, false); }
function _msgPrompt(opts) { return _msgDialog(opts || {}, true); }

function _timeAgo(ts) {
    if (!ts) return '';
    const d = Date.now() - ts;
    const min = Math.floor(d / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return `${min}min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h`;
    const dias = Math.floor(h / 24);
    if (dias < 7) return `${dias}d`;
    return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}
function _hora(ts) { return ts ? new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''; }

function _usersList() { return (typeof users !== 'undefined' && Array.isArray(users)) ? users.filter(u => u.active !== false) : []; }
function _userName(id) { const u = _usersList().find(u => String(u.id) === String(id) || String(u.user) === String(id)); return u ? (u.name || u.user) : id; }

// Mensagens de uma thread como array ordenado
function _msgsArr(thread) {
    if (!thread || !thread.mensagens) return [];
    return Object.keys(thread.mensagens)
        .map(k => ({ _id: k, ...thread.mensagens[k] }))
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

// Threads visíveis para mim (participante && não ocultada por mim)
function _visibleThreads() {
    const me = _me();
    if (!me) return [];
    return Object.keys(_threads)
        .map(k => ({ _id: k, ..._threads[k] }))
        .filter(t => Array.isArray(t.participants) && t.participants.some(p => String(p) === me.id))
        .sort((a, b) => (b.lastMsgAt || 0) - (a.lastMsgAt || 0));
}

// ---------------------------------------------------------------------------
// Notificações por conversa: 'todas' | 'mencoes' | 'mudo' (por usuário, em thread.mutedBy)
// ---------------------------------------------------------------------------
function _muteLevel(thread) {
    const me = _me();
    if (!me || !thread) return 'todas';
    return (thread.mutedBy && thread.mutedBy[me.id]) || thread.notifPadrao || 'todas';
}
async function msgSetMuteLevel(threadId, level) {
    const me = _me();
    if (!me) return;
    const patch = {};
    patch['mutedBy/' + me.id] = level;
    try { await _updateThread(threadId, patch); }
    catch (e) { _toast('Erro ao ajustar notificações: ' + (e.message || e), 'error'); }
}

// Popover de notificações (ícone de sino no card da lista)
let _muteThreadId = null;
function msgOpenMutePopover(ev, threadId) {
    ev.stopPropagation();
    const pop = document.getElementById('msgMutePopover');
    if (!pop) return;
    if (_muteThreadId === threadId && pop.style.display === 'flex') { msgCloseMutePopover(); return; }
    _muteThreadId = threadId;
    const level = _muteLevel(_threads[threadId]);
    pop.querySelectorAll('.msg-mute-opt').forEach(btn => btn.classList.toggle('active', btn.getAttribute('data-level') === level));

    pop.style.display = 'flex';
    const r = ev.currentTarget.getBoundingClientRect();
    const pw = 250;
    let left = r.right - pw;
    if (left < 8) left = 8;
    pop.style.top = (r.bottom + 6) + 'px';
    pop.style.left = left + 'px';
    setTimeout(() => document.addEventListener('mousedown', _closeMuteOnOutside), 0);
}
function _closeMuteOnOutside(e) {
    const pop = document.getElementById('msgMutePopover');
    if (pop && !pop.contains(e.target)) msgCloseMutePopover();
}
function msgCloseMutePopover() {
    const pop = document.getElementById('msgMutePopover');
    if (pop) pop.style.display = 'none';
    _muteThreadId = null;
    document.removeEventListener('mousedown', _closeMuteOnOutside);
}
async function msgPickMute(level) {
    const threadId = _muteThreadId;
    msgCloseMutePopover();
    if (!threadId) return;
    await msgSetMuteLevel(threadId, level);
    _renderThreadList();
}

function _unreadCount(thread) {
    const me = _me();
    if (!me || !thread) return 0;
    const level = _muteLevel(thread);
    if (level === 'mudo') return 0;
    const seen = (thread.lidoPor && thread.lidoPor[me.id]) || 0;
    return _msgsArr(thread).filter(m => {
        if (m.sistema) return false;
        if ((m.createdAt || 0) <= seen) return false;
        if (String(m.autor && m.autor.id) === me.id) return false;
        if (level === 'mencoes') return Array.isArray(m.mencoes) && m.mencoes.some(id => String(id) === me.id);
        return true;
    }).length;
}
function _totalUnread() { return _visibleThreads().reduce((s, t) => s + _unreadCount(t), 0); }

// Há alguma mensagem NÃO LIDA nesta thread em que fui mencionado(a)?
function _hasPendingMention(thread) {
    return _pendingMentionCount(thread) > 0;
}
// Quantas mensagens NÃO LIDAS nesta thread me mencionam?
function _pendingMentionCount(thread) {
    const me = _me();
    if (!me || !thread) return 0;
    const seen = (thread.lidoPor && thread.lidoPor[me.id]) || 0;
    return _msgsArr(thread).filter(m =>
        !m.sistema && (m.createdAt || 0) > seen &&
        String(m.autor && m.autor.id) !== me.id &&
        Array.isArray(m.mencoes) && m.mencoes.some(id => String(id) === me.id)
    ).length;
}

// ---------------------------------------------------------------------------
// Firebase (nó isolado /messages)
// ---------------------------------------------------------------------------
function _db() { return window.firebaseDatabase; }
function _ref(path) { return window.firebaseRef(_db(), path); }

async function _writeThread(threadId, thread) {
    if (!window.firebaseSet) throw new Error('Firebase indisponível.');
    await window.firebaseSet(_ref('messages/' + threadId), thread);
}
async function _updateThread(threadId, patch) {
    if (!window.firebaseUpdate) throw new Error('Firebase indisponível.');
    await window.firebaseUpdate(_ref('messages/' + threadId), patch);
}
async function _removeThread(threadId) {
    // Apaga imgBlobs de todas as imagens anexadas às mensagens desta thread,
    // evitando que virem órfãos quando a thread inteira é removida.
    const t = _threads[threadId];
    const mensagens = (t && t.mensagens) || {};
    Object.keys(mensagens).forEach(mid => {
        (mensagens[mid].anexos || []).forEach(a => {
            if (a && a.blobId && typeof window._deleteImgBlob === 'function') window._deleteImgBlob(a.blobId);
        });
    });
    await window.firebaseSet(_ref('messages/' + threadId), null);
}

function startMessagesListener() {
    if (_msgListener || !window.firebaseOnValue || !window.firebaseDatabase) return;
    _msgListener = window.firebaseOnValue(_ref('messages'), (snap) => {
        _threads = (snap && snap.exists()) ? (snap.val() || {}) : {};
        // Re-render se drawer aberto
        const drawer = document.getElementById('msgDrawer');
        const threadOpen = drawer && drawer.classList.contains('open') &&
            _activeThreadId && document.getElementById('msgViewThread').style.display !== 'none';
        // Thread aberta na tela: msgs recém-chegadas já estão sendo vistas → marca lido
        // ANTES de calcular o badge, para não notificar o que está visível.
        if (threadOpen && _threads[_activeThreadId]) _markRead(_activeThreadId);
        _refreshBadge();
        if (drawer && drawer.classList.contains('open')) {
            if (threadOpen) {
                // Não destrói uma edição in-place em aberto
                if (document.querySelector('#msgBubbles .msg-edit-box')) { /* adia re-render */ }
                else if (_threads[_activeThreadId]) _renderThread(_activeThreadId);
                else msgBackToList(); // thread foi apagada
            } else if (document.getElementById('msgViewList').style.display !== 'none') {
                _renderThreadList();
            }
        }
        _purgeExpiredMessages();
    });
}

// ---------------------------------------------------------------------------
// Retenção automática: apaga mensagens (e imagens vinculadas) mais antigas
// que o limite configurado por thread (padrão 30 dias, máx. 365).
// ---------------------------------------------------------------------------
function _retentionDays(t) {
    const n = Number(t && t.retencaoDias);
    if (!n || n < MSG_RETENTION_MIN_DAYS || n > MSG_RETENTION_MAX_DAYS) return MSG_RETENTION_DEFAULT_DAYS;
    return n;
}
function _purgeExpiredMessages() {
    const now = Date.now();
    Object.keys(_threads).forEach(threadId => {
        if (_purgingThreads.has(threadId)) return;
        const t = _threads[threadId];
        const msgs = _msgsArr(t);
        if (!msgs.length) return;
        const limitMs = _retentionDays(t) * DAY_MS;
        const expired = msgs.filter(m => !m.sistema && (now - (m.createdAt || 0)) > limitMs);
        if (!expired.length) return;

        _purgingThreads.add(threadId);
        (async () => {
            try {
                if (expired.length >= msgs.length) {
                    // Todas as mensagens expiraram: apaga a thread inteira (_removeThread limpa as imagens)
                    await _removeThread(threadId);
                } else {
                    const patch = {};
                    expired.forEach(m => {
                        (m.anexos || []).forEach(a => {
                            if (a.blobId && typeof window._deleteImgBlob === 'function') window._deleteImgBlob(a.blobId);
                        });
                        patch['mensagens/' + m._id] = null;
                    });
                    const remaining = msgs.filter(m => !expired.some(e => e._id === m._id));
                    patch['lastMsgAt'] = remaining.length ? remaining[remaining.length - 1].createdAt : (t.createdAt || now);
                    await _updateThread(threadId, patch);
                }
            } catch (_) { /* tenta de novo no próximo snapshot */ }
            finally { _purgingThreads.delete(threadId); }
        })();
    });
}

function _renderRetentionBox() {
    const t = _threads[_activeThreadId];
    const box = document.getElementById('msgRetentionBox');
    const input = document.getElementById('msgRetentionInput');
    if (!t || !box || !input) return;
    box.style.display = 'block';
    input.value = _retentionDays(t);
    input.disabled = !_isOwner(t);
    input.title = _isOwner(t) ? '' : 'Apenas o dono pode alterar o prazo de retenção.';
}
async function msgSetRetention(value) {
    const t = _threads[_activeThreadId];
    const me = _me();
    if (!t || !me || !_isOwner(t)) return;
    let days = Math.round(Number(value));
    if (!Number.isFinite(days)) days = MSG_RETENTION_DEFAULT_DAYS;
    days = Math.min(MSG_RETENTION_MAX_DAYS, Math.max(MSG_RETENTION_MIN_DAYS, days));
    const input = document.getElementById('msgRetentionInput');
    if (input) input.value = days;
    if (days === _retentionDays(t)) return;
    const threadId = _activeThreadId;
    try {
        await _updateThread(threadId, { retencaoDias: days });
        await _postSystem(threadId, `${me.name} definiu o prazo de retenção de mensagens para ${days} dia(s).`);
    } catch (e) { _toast('Erro ao salvar retenção: ' + (e.message || e), 'error'); }
}
function stopMessagesListener() {
    if (_msgListener && window.firebaseOff) {
        try { window.firebaseOff(_ref('messages'), _msgListener); } catch (_) {}
    }
    _msgListener = null;
    _threads = {};
    _refreshBadge();
}

// ---------------------------------------------------------------------------
// Badge do header
// ---------------------------------------------------------------------------
function _refreshBadge() {
    const badge = document.getElementById('messagesBadge');
    if (!badge) return;
    const n = _totalUnread();
    if (n > 0) { badge.textContent = n > 99 ? '99+' : n; badge.classList.remove('hidden'); }
    else { badge.classList.add('hidden'); }
}

// ---------------------------------------------------------------------------
// Drawer: abrir/fechar + navegação entre views
// ---------------------------------------------------------------------------
function msgToggleDrawer() {
    const drawer = document.getElementById('msgDrawer');
    if (!drawer) return;
    if (drawer.classList.contains('open')) msgCloseDrawer();
    else msgOpenDrawer();
}
function msgOpenDrawer() {
    if (!_me()) { _toast('Faça login para usar as mensagens.', 'error'); return; }
    startMessagesListener();
    document.getElementById('msgDrawer').classList.add('open');
    document.getElementById('msgBackdrop').classList.add('open');
    document.body.classList.add('msg-drawer-open');
    msgBackToList();
}
function msgCloseDrawer() {
    document.getElementById('msgDrawer').classList.remove('open');
    document.getElementById('msgBackdrop').classList.remove('open');
    document.body.classList.remove('msg-drawer-open');
    _closeAllPopups();
}
function _showView(id) {
    ['msgViewList', 'msgViewThread', 'msgViewCompose'].forEach(v => {
        const el = document.getElementById(v);
        if (el) el.style.display = (v === id) ? 'flex' : 'none';
    });
}
function msgBackToList() {
    _activeThreadId = null;
    _replyTo = null;
    _showView('msgViewList');
    document.getElementById('msgDrawerTitle').textContent = 'Mensagens';
    _renderThreadList();
}

// ---------------------------------------------------------------------------
// Lista de conversas
// ---------------------------------------------------------------------------
function _threadTitle(thread) {
    // Título personalizado tem prioridade
    if (thread.titulo && String(thread.titulo).trim()) return String(thread.titulo).trim();
    const me = _me();
    // Nomes dos outros participantes
    const others = (thread.participants || []).filter(p => String(p) !== (me && me.id));
    if (!others.length) return thread.createdBy ? thread.createdBy.name : 'Conversa';
    const names = others.map(_userName);
    if (names.length <= 2) return names.join(', ');
    return `${names[0]}, ${names[1]} +${names.length - 2}`;
}
function _isOwner(t) { const me = _me(); return me && t && t.createdBy && String(t.createdBy.id) === me.id; }
// Administrador da conversa (definido pelo dono pela coroa): gerencia participantes e escrita
function _isThreadAdmin(t, id) { return !!(t && t.admins && t.admins[String(id)]); }
function _souAdminConversa(t) { const me = _me(); return !!me && (_isOwner(t) || _isThreadAdmin(t, me.id)); }
// Escrita restrita: com t.escritaRestrita ligado, só dono, administradores e t.autorizados[id] escrevem
function _isAdminUser() { try { return typeof userIsAdmin === 'function' && !!userIsAdmin(); } catch (_) { return false; } }
function _canManageWrite(t) { return !!t && _souAdminConversa(t); }
function _isAuthorized(t, id) {
    if (!t) return false;
    if (t.createdBy && String(t.createdBy.id) === String(id)) return true;
    if (_isThreadAdmin(t, id)) return true;   // administradores da conversa sempre escrevem
    return !!(t.autorizados && t.autorizados[String(id)]);
}
function _canWrite(t) {
    const me = _me();
    if (!t || !me) return false;
    if (!t.escritaRestrita) return true;
    return _isAuthorized(t, me.id);
}
function _applyWritePerm(t) {
    const comp = document.getElementById('msgThreadComposer');
    const input = document.getElementById('msgThreadInput');
    if (!comp || !input) return;
    const ok = _canWrite(t);
    comp.classList.toggle('msg-composer--bloq', !ok);
    input.disabled = !ok;
    input.placeholder = ok ? 'Escreva uma resposta...' : 'Somente o proprietário pode escrever aqui.';
    let aviso = document.getElementById('msgWriteNotice');
    if (!ok) {
        if (!aviso) {
            aviso = document.createElement('div');
            aviso.id = 'msgWriteNotice'; aviso.className = 'msg-write-notice';
            aviso.innerHTML = '<i class="fas fa-lock"></i><span>Somente o proprietário (e quem ele autorizou) pode escrever nesta conversa.</span>';
            comp.prepend(aviso);
        }
    } else if (aviso) aviso.remove();
}
async function msgToggleWriteRestrict(on) {
    const t = _threads[_activeThreadId];
    const me = _me();
    if (!t || !me || !_canManageWrite(t)) return;
    const threadId = _activeThreadId;
    try {
        await _updateThread(threadId, { escritaRestrita: !!on });
        await _postSystem(threadId, on
            ? `${me.name} restringiu a conversa: só o proprietário pode escrever.`
            : `${me.name} liberou a conversa: todos os participantes podem escrever.`);
    } catch (e) { _toast('Erro ao salvar permissão: ' + (e.message || e), 'error'); }
    _renderWriteBox(); _renderMembers();
}
async function msgToggleAuthorized(userId) {
    const t = _threads[_activeThreadId];
    const me = _me();
    if (!t || !me || !_canManageWrite(t)) return;
    const id = String(userId);
    if (t.createdBy && String(t.createdBy.id) === id) return;   // dono sempre escreve
    const novo = !(t.autorizados && t.autorizados[id]);
    const threadId = _activeThreadId;
    try {
        await _updateThread(threadId, { ['autorizados/' + id]: novo ? true : null });
        await _postSystem(threadId, novo ? `${me.name} autorizou ${_userName(id)} a escrever.` : `${me.name} retirou a permissão de escrita de ${_userName(id)}.`);
    } catch (e) { _toast('Erro ao salvar permissão: ' + (e.message || e), 'error'); }
    _renderMembers();
}
function _renderWriteBox() {
    const t = _threads[_activeThreadId];
    const box = document.getElementById('msgWriteBox');
    if (!t || !box) return;
    const pode = _canManageWrite(t);
    const on = !!t.escritaRestrita;
    box.innerHTML = `
        <label class="msg-write-row ${pode ? '' : 'is-off'}" title="${pode ? '' : 'Apenas o proprietário pode alterar.'}">
            <span class="msg-write-txt"><b><i class="fas fa-lock"></i> Somente proprietário digita</b>
                <small>${on ? 'Só o proprietário (e quem tiver o lápis marcado em Participantes) envia mensagens.' : 'Todos os participantes podem enviar mensagens.'}</small></span>
            <input type="checkbox" class="msg-switch" ${on ? 'checked' : ''} ${pode ? '' : 'disabled'} onchange="msgToggleWriteRestrict(this.checked)">
        </label>`;
}

// Configurações da conversa (só proprietário): notificação padrão + quem digita
const _NOTIF_OPTS = [
    ['todas', 'fa-bell', 'Toda mensagem', 'Avisar sobre toda mensagem'],
    ['mencoes', 'fa-at', 'Só marcações', 'Avisar só quem for mencionado(a)'],
    ['mudo', 'fa-bell-slash', 'Sem notificação', 'Não avisar nesta conversa'],
];
function _renderConfig() {
    const t = _threads[_activeThreadId];
    const box = document.getElementById('msgCfgNotif');
    if (!t || !box) return;
    const atual = t.notifPadrao || 'todas';
    box.innerHTML = _NOTIF_OPTS.map(([v, ic, tit, sub]) => `
        <button type="button" class="msg-mute-opt ${v === atual ? 'active' : ''}" onclick="msgSetNotifPadrao('${v}')">
            <span class="msg-mute-opt-ic"><i class="fas ${ic}"></i></span>
            <span class="msg-mute-opt-txt"><span class="msg-mute-opt-title">${tit}</span><span class="msg-mute-opt-sub">${sub}</span></span>
            <i class="fas fa-check msg-mute-opt-check"></i>
        </button>`).join('') +
        '<small class="msg-cfg-hint">Padrão da conversa. Cada participante ainda pode ajustar o próprio sino na lista.</small>';
    const mb = document.getElementById('msgCfgMarc');
    if (mb) {
        const m = t.marcacoes || {};
        mb.innerHTML = _MARC_OPTS.map(([k, ic, tit, sub]) => `
            <label class="msg-write-row">
                <span class="msg-write-txt"><b><i class="fas ${ic}"></i> ${tit}</b><small>${sub}</small></span>
                <input type="checkbox" class="msg-switch" ${m[k] !== false ? 'checked' : ''} onchange="msgSetMarcacao('${k}', this.checked)">
            </label>`).join('') + '<small class="msg-cfg-hint">Vale para membros comuns. Dono e administradores da conversa podem marcar sempre.</small>';
    }
    _renderWriteBox();
}
async function msgSetMarcacao(k, on) {
    const t = _threads[_activeThreadId], me = _me();
    if (!t || !me || !_isOwner(t)) return;
    const threadId = _activeThreadId;
    const nome = (_MARC_OPTS.find(o => o[0] === k) || [])[2] || k;
    try {
        await _updateThread(threadId, { ['marcacoes/' + k]: on ? null : false });
        await _postSystem(threadId, `${me.name} ${on ? 'liberou' : 'bloqueou'} marcações de ${nome} para os membros.`);
    } catch (e) { _toast('Erro ao salvar: ' + (e.message || e), 'error'); }
    _renderConfig();
}
function msgOpenConfig() {
    const t = _threads[_activeThreadId];
    if (!t || !_isOwner(t)) return;
    document.getElementById('msgConfigModal').style.display = 'flex';
    _renderConfig();
}
function msgCloseConfig() { const m = document.getElementById('msgConfigModal'); if (m) m.style.display = 'none'; }
async function msgSetNotifPadrao(v) {
    const t = _threads[_activeThreadId], me = _me();
    if (!t || !me || !_isOwner(t) || (t.notifPadrao || 'todas') === v) return;
    const threadId = _activeThreadId;
    const nome = (_NOTIF_OPTS.find(o => o[0] === v) || [])[2] || v;
    try {
        await _updateThread(threadId, { notifPadrao: v });
        await _postSystem(threadId, `${me.name} definiu as notificações da conversa: ${nome}.`);
    } catch (e) { _toast('Erro ao salvar notificações: ' + (e.message || e), 'error'); }
    _renderConfig(); _renderThreadList();
}

// Posta uma mensagem de sistema na thread (entrou/saiu/removido/renomeou)
// Só entrada/saída de membros vira mensagem de sistema no chat; o resto (config, admins, título...) não aparece.
const _SYS_MEMBRO = /(adicionou .+|saiu da conversa|foi removid[oa]|entrou na conversa)/;
async function _postSystem(threadId, texto) {
    if (!_SYS_MEMBRO.test(String(texto || ''))) return;
    const now = Date.now();
    const msgId = _uid();
    const patch = {};
    patch['mensagens/' + msgId] = { sistema: true, texto, createdAt: now };
    patch['lastMsgAt'] = now;
    return _updateThread(threadId, patch);
}
function _renderThreadList() {
    const box = document.getElementById('msgThreadList');
    if (!box) return;
    const list = _visibleThreads();
    if (!list.length) {
        box.innerHTML = `<div class="msg-empty"><i class="fas fa-comment-dots"></i><p>Nenhuma conversa ainda.<br>Toque em <i class="fas fa-pen-to-square"></i> para começar.</p></div>`;
        return;
    }
    box.innerHTML = list.map(t => {
        const msgs = _msgsArr(t);
        const last = msgs[msgs.length - 1];
        const preview = last ? (last.texto || (last.cardsVinculados && last.cardsVinculados.length ? '📎 Card vinculado' : (last.anexos && last.anexos.length ? '📎 Anexo' : ''))) : '';
        const unread = _unreadCount(t);
        const title = _threadTitle(t);
        const level = _muteLevel(t);
        const muteIcon = level === 'mudo' ? 'fa-volume-xmark' : (level === 'mencoes' ? 'fa-volume-low' : 'fa-volume-high');
        const mentionCount = _pendingMentionCount(t);
        const mentioned = mentionCount > 0;
        return `
            <div class="msg-thread-card ${mentioned ? 'has-mention' : ''}" onclick="msgOpenThread('${t._id}')">
                <div class="msg-avatar">${_esc(_initials(title))}</div>
                <div class="msg-thread-card-body">
                    <div class="msg-thread-card-top">
                        <span class="msg-thread-card-name">${_esc(title)}</span>
                        ${mentioned ? `<span class="msg-mention-flag">📌 Mencionado x${mentionCount}@</span>` : ''}
                        <span class="msg-thread-card-meta">
                            ${unread ? `<span class="msg-thread-card-unread">${unread > 9 ? '9+' : unread}</span>` : ''}
                            <span class="msg-thread-card-time">${_timeAgo(t.lastMsgAt)}</span>
                            <button type="button" class="msg-thread-card-mute ${level !== 'todas' ? 'active' : ''}" title="Notificações" onmousedown="event.stopPropagation()" onclick="msgOpenMutePopover(event, '${t._id}')">
                                <i class="fas ${muteIcon}"></i>
                            </button>
                        </span>
                    </div>
                    <div class="msg-thread-card-preview">${_esc(preview).slice(0, 80)}</div>
                </div>
            </div>`;
    }).join('');
}

// ---------------------------------------------------------------------------
// Visualização da thread
// ---------------------------------------------------------------------------
function msgOpenThread(threadId) {
    _activeThreadId = threadId;
    _replyTo = null;
    _draft.thread = { cards: [], anexos: [] };
    _showView('msgViewThread');
    _renderThread(threadId);
    _markRead(threadId);
    _renderThreadDraftChips();
    _acClose();
    document.getElementById('msgReplyCtx').style.display = 'none';
}
function _renderThread(threadId) {
    const t = _threads[threadId];
    if (!t) { msgBackToList(); return; }
    const me = _me();
    const owner = _isOwner(t);
    // Título (dono pode renomear -> ícone de lápis)
    const titleEl = document.getElementById('msgThreadTitle');
    titleEl.textContent = _threadTitle(t);
    titleEl.classList.toggle('editable', owner);
    titleEl.onclick = owner ? msgEditTitle : null;
    const nParts = (t.participants || []).length;
    document.getElementById('msgThreadSub').textContent =
        `${nParts} participante${nParts !== 1 ? 's' : ''} · ${(t.participants || []).map(_userName).join(', ')}`;

    // Botões da topbar: Membros | Sair | Apagar (dono)
    const acts = document.getElementById('msgThreadActions');
    acts.innerHTML = `
        ${owner ? `<button class="msg-icon-btn" title="Configurações da conversa" onclick="msgOpenConfig()"><i class="fas fa-gear"></i></button>` : ''}
        <button class="msg-icon-btn" title="Participantes" onclick="msgOpenMembers()"><i class="fas fa-users"></i></button>
        <button class="msg-icon-btn" title="Sair da conversa" onclick="msgLeaveThread()"><i class="fas fa-right-from-bracket"></i></button>
        ${owner ? `<button class="msg-icon-btn msg-icon-btn--danger" title="Apagar conversa (para todos)" onclick="msgDeleteThread()"><i class="fas fa-trash-can"></i></button>` : ''}`;

    _applyWritePerm(t);
    if (document.getElementById('msgMembersModal').style.display === 'flex') _renderMembers();
    if (document.getElementById('msgConfigModal').style.display === 'flex') { if (owner) _renderConfig(); else msgCloseConfig(); }

    // Banner: "todos saíram" — só resta o dono
    const banner = document.getElementById('msgThreadBanner');
    if (owner && nParts <= 1) {
        banner.style.display = 'flex';
        banner.innerHTML = `<i class="fas fa-users-slash"></i><span>Todos os participantes saíram. Você está sozinho aqui.</span><button class="msg-banner-btn" onclick="msgDeleteThread()">Excluir conversa</button>`;
    } else {
        banner.style.display = 'none';
        banner.innerHTML = '';
    }

    const box = document.getElementById('msgBubbles');
    const msgs = _msgsArr(t);
    box.innerHTML = msgs.map(m => _bubbleHtml(m, t, me)).join('');
    box.scrollTop = box.scrollHeight;
}
// ---------------------------------------------------------------------------
// Ícone "visualizado" (bolhas próprias): cinza se falta alguém ler, azul se todos leram
// ---------------------------------------------------------------------------
function _seenInfo(m, thread, me) {
    const others = (thread.participants || []).filter(p => String(p) !== (me && me.id));
    const lidoPor = thread.lidoPor || {};
    const rows = others.map(pid => {
        const ts = lidoPor[pid] || 0;
        const seen = ts >= (m.createdAt || 0);
        return { id: pid, name: _userName(pid), seen, ts: seen ? ts : 0 };
    });
    const allSeen = rows.length > 0 && rows.every(r => r.seen);
    return { rows, allSeen };
}
function _seenIconHtml(m, thread, me) {
    const { rows, allSeen } = _seenInfo(m, thread, me);
    if (!rows.length) return '';
    return `<button class="msg-bubble-act msg-seen-ic ${allSeen ? 'all-seen' : ''}" onclick="msgOpenSeenPopover(event, '${m._id}')" title="${allSeen ? 'Todos visualizaram' : 'Falta visualizar'}"><i class="fas fa-check-double"></i></button>`;
}
let _seenMsgId = null;
function msgOpenSeenPopover(ev, msgId) {
    ev.stopPropagation();
    const pop = document.getElementById('msgSeenPopover');
    if (!pop) return;
    if (_seenMsgId === msgId && pop.style.display === 'flex') { msgCloseSeenPopover(); return; }
    const t = _threads[_activeThreadId];
    const me = _me();
    const m = t && t.mensagens && t.mensagens[msgId];
    if (!t || !m) return;
    _seenMsgId = msgId;
    const { rows } = _seenInfo(m, t, me);
    const seenRows = rows.filter(r => r.seen).sort((a, b) => a.ts - b.ts);
    const pendingRows = rows.filter(r => !r.seen);
    const line = (r) => `<div class="msg-seen-row">
        <i class="fas fa-circle msg-seen-row-dot ${r.seen ? 'seen' : ''}"></i>
        <span class="msg-seen-row-name">${_esc(r.name)}</span>
        ${r.seen ? `<span class="msg-seen-row-time">${_esc(_seenDateTime(r.ts))}</span>` : `<i class="fas fa-check-double msg-seen-row-pending" title="Não visualizou"></i>`}
    </div>`;
    let html = '';
    if (seenRows.length) html += `<div class="msg-seen-group-label">Visualizaram</div>` + seenRows.map(line).join('');
    if (pendingRows.length) html += `<div class="msg-seen-group-label">Ainda não visualizaram</div>` + pendingRows.map(line).join('');
    pop.innerHTML = html;

    pop.style.display = 'flex';
    const r = ev.currentTarget.getBoundingClientRect();
    const pw = 240;
    let left = r.right - pw;
    if (left < 8) left = 8;
    const spaceBelow = window.innerHeight - r.bottom;
    if (spaceBelow < 160) pop.style.top = (r.top - 8) + 'px', pop.style.transform = 'translateY(-100%)';
    else pop.style.top = (r.bottom + 6) + 'px', pop.style.transform = 'none';
    pop.style.left = left + 'px';
    setTimeout(() => document.addEventListener('mousedown', _closeSeenOnOutside), 0);
}
function _closeSeenOnOutside(e) {
    const pop = document.getElementById('msgSeenPopover');
    if (pop && !pop.contains(e.target)) msgCloseSeenPopover();
}
function msgCloseSeenPopover() {
    const pop = document.getElementById('msgSeenPopover');
    if (pop) pop.style.display = 'none';
    _seenMsgId = null;
    document.removeEventListener('mousedown', _closeSeenOnOutside);
}
function _seenDateTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const hoje = new Date();
    const mesmodia = d.toDateString() === hoje.toDateString();
    const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return mesmodia ? hora : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + hora;
}
function _bubbleHtml(m, thread, me) {
    // Mensagem de sistema (centralizada, sem autor/ações)
    if (m.sistema) {
        if (!_SYS_MEMBRO.test(String(m.texto || ''))) return '';   // avisos antigos de configuração ficam ocultos
        return `<div class="msg-system-row"><span class="msg-system-pill"><i class="fas fa-circle-info"></i> ${_esc(m.texto)}</span></div>`;
    }
    const mine = String(m.autor && m.autor.id) === (me && me.id);
    const mentionsMe = !mine && Array.isArray(m.mencoes) && m.mencoes.some(id => String(id) === (me && me.id));
    let quote = '';
    if (m.respostaA && thread.mensagens && thread.mensagens[m.respostaA]) {
        const q = thread.mensagens[m.respostaA];
        quote = `<div class="msg-bubble-quote"><span class="msg-bubble-quote-name">${_esc(q.autor && q.autor.name)}</span><span class="msg-bubble-quote-text">${_esc((q.texto || 'Anexo').slice(0, 60))}</span></div>`;
    }
    // Chips (cards + anexos)
    let chips = '';
    (m.cardsVinculados || []).forEach(c => {
        const am = _areaMeta(c.area);
        const _titulo = (c.titulo || 'Card').slice(0, 60) + ((c.titulo || '').length > 60 ? '…' : '');
        chips += `<a class="msg-chip msg-chip--card" onclick="msgOpenCard('${_esc(c.area)}','${_esc(c.id)}')" title="${_esc(c.titulo || 'Card')}"><i class="fas ${am.icon}" style="color:${am.color}"></i><span>${_esc(_titulo)} · ${_esc(am.label)}</span></a>`;
        if (c.area === 'reuniao' && typeof window.reuChatChipExtra === 'function') chips += window.reuChatChipExtra(c.id);
    });
    (m.anexos || []).forEach(a => {
        if (a.tipo === 'imagem') {
            chips += `<img class="msg-chip-thumb" src="${_esc(a.url)}" alt="${_esc(a.nome)}" onclick="msgOpenLightbox('${_esc(a.url)}')">`;
        } else if (a.tipo === 'link') {
            chips += `<a class="msg-chip" href="${_esc(a.url)}" target="_blank" rel="noopener"><i class="fas fa-link"></i><span>${_esc(a.nome || a.url)}</span></a>`;
        } else {
            chips += `<a class="msg-chip" href="${_esc(a.url)}" target="_blank" rel="noopener"><i class="fas fa-file-arrow-down"></i><span>${_esc(a.nome || 'Arquivo')}</span></a>`;
        }
    });
    const texto = m.texto ? `<div class="msg-bubble-text">${_linkifyMentions(m.texto)}</div>` : '';
    const editado = m.editedAt ? `<span class="msg-bubble-edited" title="Editada">(editada)</span>` : '';
    const seenIcon = mine ? _seenIconHtml(m, thread, me) : '';
    return `
        <div class="msg-bubble-row ${mine ? 'mine' : 'theirs'}" data-mid="${m._id}">
            ${!mine ? `<span class="msg-bubble-author">${_esc(m.autor && m.autor.name)}</span>` : ''}
            <div class="msg-bubble ${mentionsMe ? 'mentions-me' : ''}">
                ${mentionsMe ? `<span class="msg-bubble-mention-badge"><i class="fas fa-at"></i> você foi mencionado(a)</span>` : ''}
                ${quote}
                ${texto}
                ${chips ? `<div class="msg-bubble-chips">${chips}</div>` : ''}
            </div>
            <div class="msg-bubble-actions">
                <button class="msg-bubble-act" onclick="msgStartReply('${m._id}')" title="Responder"><i class="fas fa-reply"></i> Responder</button>
                ${_canModify(m) ? `
                    <button class="msg-bubble-act" onclick="msgEditMessage('${m._id}')" title="Editar"><i class="fas fa-pen"></i></button>
                    <button class="msg-bubble-act msg-bubble-act--danger" onclick="msgDeleteMessage('${m._id}')" title="Apagar"><i class="fas fa-trash-can"></i></button>
                ` : ''}
                <span class="msg-bubble-time">${_hora(m.createdAt)}${editado}</span>
                ${seenIcon}
            </div>
        </div>`;
}
function _linkifyMentions(texto) {
    // Destaca @Nome (nomes conhecidos), @todos e @Setor/@Grupo; escapa o resto
    let out = _esc(texto);
    out = out.replace(/(^|\s)@todos(?![\wÀ-ÿ])/gi, '$1<span class="msg-mention-tag msg-mention-tag--lote">@todos</span>');
    try {
        const nomes = new Set();
        _lotes(_usersList(), _setorDe).forEach(([n]) => nomes.add(n));
        _lotes(_usersList(), _grupoDe).forEach(([n]) => nomes.add(n));
        [...nomes].sort((a, b) => b.length - a.length).forEach(nm => {
            const re = new RegExp('@' + _esc(nm).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\wÀ-ÿ])', 'g');
            out = out.replace(re, `<span class="msg-mention-tag msg-mention-tag--lote">@${_esc(nm)}</span>`);
        });
    } catch (_) {}
    _usersList().forEach(u => {
        const nm = (u.name || u.user || '').trim();
        if (!nm) return;
        const re = new RegExp('@' + nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        out = out.replace(re, `<span class="msg-mention-tag">@${_esc(nm)}</span>`);
    });
    return out.replace(/\n/g, '<br>');
}
function _markRead(threadId) {
    const me = _me();
    const t = _threads[threadId];
    if (!me || !t) return;
    const now = Date.now();
    // Já marcado como lido neste instante? Evita reescrita/loop no listener.
    if (((t.lidoPor && t.lidoPor[me.id]) || 0) >= (t.lastMsgAt || 0)) return;
    // Atualiza local otimisticamente para o badge não piscar antes do próximo snapshot.
    if (!t.lidoPor) t.lidoPor = {};
    t.lidoPor[me.id] = now;
    const patch = {}; patch['lidoPor/' + me.id] = now;
    _updateThread(threadId, patch).catch(() => {});
    setTimeout(_refreshBadge, 200);
}

// ---------------------------------------------------------------------------
// Abrir card vinculado
// ---------------------------------------------------------------------------
function msgOpenCard(area, id) {
    const numId = /^\d+$/.test(String(id)) ? Number(id) : id;
    try {
        if (area === 'reuniao') {
            if (typeof window.reuOpen !== 'function') throw new Error('Reuniões indisponível.');
            window.reuOpen(String(id));
        } else if (area === 'rnc') {
            if (typeof rncOpenView !== 'function') throw new Error('RNC indisponível.');
            rncOpenView(numId);
        } else {
            if (typeof openView !== 'function') throw new Error('Visualização indisponível.');
            openView(numId, area);
        }
    } catch (e) { _toast('Item indisponível.', 'error'); }
}
function _areaLabel(area) { return _areaMeta(area).label; }

// ---------------------------------------------------------------------------
// Lightbox
// ---------------------------------------------------------------------------
function msgOpenLightbox(url, label) {
    // Usa o visualizador global (zoom / rotação); fallback ao lightbox simples
    if (typeof window.openImgLightbox === 'function' && document.getElementById('imgLightbox')) {
        window.openImgLightbox(url, label || '');
        return;
    }
    const lb = document.getElementById('msgLightbox');
    document.getElementById('msgLightboxImg').src = url;
    lb.style.display = 'flex';
}
function msgCloseLightbox() {
    const lb = document.getElementById('msgLightbox');
    if (lb) lb.style.display = 'none';
    if (typeof window.closeImgLightbox === 'function') window.closeImgLightbox();
}

// ---------------------------------------------------------------------------
// Responder
// ---------------------------------------------------------------------------
function msgStartReply(msgId) {
    const t = _threads[_activeThreadId];
    if (!t || !t.mensagens || !t.mensagens[msgId]) return;
    _replyTo = msgId;
    const q = t.mensagens[msgId];
    document.getElementById('msgReplyCtxName').textContent = q.autor && q.autor.name;
    document.getElementById('msgReplyCtxText').textContent = (q.texto || 'Anexo').slice(0, 80);
    document.getElementById('msgReplyCtx').style.display = 'flex';
    document.getElementById('msgThreadInput').focus();
}
function msgCancelReply() {
    _replyTo = null;
    document.getElementById('msgReplyCtx').style.display = 'none';
}

// ---------------------------------------------------------------------------
// Editar / Apagar mensagem (somente o autor)
// ---------------------------------------------------------------------------
const MSG_EDIT_WINDOW_MS = 12 * 60 * 60 * 1000; // 12 horas
function _withinEditWindow(m) {
    return m && (Date.now() - (m.createdAt || 0)) <= MSG_EDIT_WINDOW_MS;
}
function _isAuthor(m) {
    const me = _me();
    return me && m && !m.sistema && m.autor && String(m.autor.id) === me.id;
}
function _canModify(m) {
    // Autor da mensagem E dentro da janela de 12h
    return _isAuthor(m) && _withinEditWindow(m);
}
// Avisa se é autor mas o prazo de 12h expirou; retorna true se pode modificar
function _guardEditWindow(m) {
    if (_canModify(m)) return true;
    if (_isAuthor(m) && !_withinEditWindow(m)) {
        _toast('Não é possível editar ou apagar mensagens após 12 horas.', 'error');
    }
    return false;
}

function msgEditMessage(msgId) {
    const t = _threads[_activeThreadId];
    const m = t && t.mensagens && t.mensagens[msgId];
    if (!m || !_guardEditWindow(m)) return;
    const row = document.querySelector(`.msg-bubble-row[data-mid="${msgId}"]`);
    if (!row) return;
    const bubble = row.querySelector('.msg-bubble');
    const textEl = bubble.querySelector('.msg-bubble-text');
    // Já em edição? ignora
    if (bubble.querySelector('.msg-edit-box')) return;

    const current = m.texto || '';
    const box = document.createElement('div');
    box.className = 'msg-edit-box';
    box.innerHTML = `
        <textarea class="msg-edit-textarea">${_esc(current)}</textarea>
        <div class="msg-edit-actions">
            <button class="msg-edit-cancel" title="Cancelar"><i class="fas fa-times"></i></button>
            <button class="msg-edit-save" title="Salvar"><i class="fas fa-check"></i></button>
        </div>`;
    if (textEl) textEl.style.display = 'none';
    bubble.appendChild(box);
    const ta = box.querySelector('.msg-edit-textarea');
    ta.focus();
    ta.setSelectionRange(current.length, current.length);
    const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'; };
    grow(); ta.addEventListener('input', grow);

    const cleanup = () => { if (textEl) textEl.style.display = ''; box.remove(); };
    box.querySelector('.msg-edit-cancel').onclick = cleanup;
    box.querySelector('.msg-edit-save').onclick = () => _saveEdit(msgId, ta.value);
    ta.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _saveEdit(msgId, ta.value); }
        else if (e.key === 'Escape') { e.preventDefault(); cleanup(); }
    });
}

async function _saveEdit(msgId, newText) {
    const t = _threads[_activeThreadId];
    const m = t && t.mensagens && t.mensagens[msgId];
    if (!m || !_canModify(m)) return;
    const txt = String(newText || '').trim();
    // Sem texto e sem anexos/cards => equivale a apagar
    const hasOther = (m.cardsVinculados && m.cardsVinculados.length) || (m.anexos && m.anexos.length);
    if (!txt && !hasOther) { msgDeleteMessage(msgId, true); return; }
    if (txt === (m.texto || '')) { _renderThread(_activeThreadId); return; } // nada mudou

    const patch = {};
    patch['mensagens/' + msgId + '/texto'] = txt;
    patch['mensagens/' + msgId + '/editedAt'] = Date.now();
    try { await _updateThread(_activeThreadId, patch); _toast('Mensagem editada.', 'success'); }
    catch (e) { _toast('Erro ao editar: ' + (e.message || e), 'error'); }
}

async function msgDeleteMessage(msgId, skipConfirm) {
    const t = _threads[_activeThreadId];
    const m = t && t.mensagens && t.mensagens[msgId];
    if (!m || !_guardEditWindow(m)) return;
    if (!skipConfirm && !(await _msgConfirm({ title: 'Apagar mensagem', text: 'Esta ação não pode ser desfeita.', danger: true, confirmLabel: 'Apagar' }))) return;

    const msgs = _msgsArr(t);
    // Se for a única mensagem da conversa, apagar a mensagem esvaziaria a thread → apaga a thread toda
    if (msgs.length <= 1) {
        // _removeThread limpa os imgBlobs das mensagens antes de apagar a thread
        try { await _removeThread(_activeThreadId); msgBackToList(); _toast('Mensagem apagada.', 'success'); }
        catch (e) { _toast('Erro ao apagar: ' + (e.message || e), 'error'); }
        return;
    }

    // Limpa imgBlob se a mensagem tinha imagem própria
    (m.anexos || []).forEach(a => { if (a.blobId && typeof window._deleteImgBlob === 'function') window._deleteImgBlob(a.blobId); });

    const patch = {};
    patch['mensagens/' + msgId] = null;
    // Se apagou a última, ajusta lastMsgAt para a penúltima
    const remaining = msgs.filter(x => x._id !== msgId);
    patch['lastMsgAt'] = remaining.length ? remaining[remaining.length - 1].createdAt : (t.createdAt || Date.now());
    try { await _updateThread(_activeThreadId, patch); _toast('Mensagem apagada.', 'success'); }
    catch (e) { _toast('Erro ao apagar: ' + (e.message || e), 'error'); }
}

// ---------------------------------------------------------------------------
// Composer de NOVA mensagem
// ---------------------------------------------------------------------------
function msgOpenComposer() {
    if (!_me()) { _toast('Faça login para enviar mensagens.', 'error'); return; }
    _draft.compose = { mentions: [], cards: [], anexos: [], titulo: '' };
    document.getElementById('msgComposeInput').value = '';
    const tInput = document.getElementById('msgComposeTitulo');
    if (tInput) tInput.value = '';
    _renderComposeMentions();
    _renderComposeChips();
    _showView('msgViewCompose');
}

async function msgSendNew() {
    const me = _me();
    if (!me) return;
    const texto = document.getElementById('msgComposeInput').value.trim();
    const d = _draft.compose;
    const tInput = document.getElementById('msgComposeTitulo');
    d.titulo = tInput ? tInput.value.trim() : '';
    if (!d.mentions.length) { _toast('Selecione ao menos um usuário.', 'error'); return; }
    if (!texto && !d.cards.length && !d.anexos.length) { _toast('Escreva uma mensagem ou anexe algo.', 'error'); return; }
    if (_msgSendOnCooldown()) return;

    const btn = document.querySelector('#msgViewCompose .msg-btn-primary');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...'; }

    try {
        const now = Date.now();
        const participants = Array.from(new Set([me.id, ...d.mentions.map(String)]));
        const threadId = _uid();
        const msgId = _uid();
        const thread = {
            id: threadId,
            createdAt: now,
            createdBy: { id: me.id, name: me.name },
            titulo: (_draft.compose.titulo || '').trim(),
            participants,
            lastMsgAt: now,
            lidoPor: { [me.id]: now },
            mensagens: {
                [msgId]: {
                    autor: { id: me.id, name: me.name },
                    texto: texto || '',
                    createdAt: now,
                    mencoes: d.mentions.map(String),
                    cardsVinculados: d.cards,
                    anexos: d.anexos,
                    respostaA: null
                }
            }
        };
        await _writeThread(threadId, thread);
        _activeThreadId = threadId;
        msgOpenThread(threadId);
        _toast('Mensagem enviada.', 'success');
    } catch (e) {
        _toast('Erro ao enviar: ' + (e.message || e), 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar'; }
    }
}

// ---------------------------------------------------------------------------
// Enviar RESPOSTA na thread
// ---------------------------------------------------------------------------
// Extrai ids de participantes mencionados via "@Nome" no texto (usado no autocomplete/composer da thread)
// Marcações que membros comuns podem usar. Dono e administradores da conversa: sempre todas.
const _MARC_OPTS = [
    ['todos', 'fa-users-line', '@todos', 'Marcar todos os participantes de uma vez'],
    ['setores', 'fa-building', 'Setores', 'Marcar um setor inteiro (@Setor)'],
    ['grupos', 'fa-users', 'Grupos', 'Marcar um grupo inteiro (@Grupo)'],
    ['pessoas', 'fa-user', 'Pessoas', 'Marcar participantes pelo nome'],
];
function _podeMarcar(t, tipo) {
    if (!t) return true;
    if (_souAdminConversa(t)) return true;
    const m = t.marcacoes || {};
    return m[tipo] !== false;
}
// Lotes (setor/grupo) formados só pelos participantes da conversa
function _lotesThread(thread) {
    const ids = ((thread && thread.participants) || []).map(String);
    const us = _usersList().filter(u => ids.includes(String(u.id)));
    return { setor: _lotes(us, _setorDe), grupo: _lotes(us, _grupoDe) };
}
const _TODOS_RE = /(^|\s)@todos(?![\wÀ-ÿ])/i;
function _extractMentionIds(texto, thread) {
    if (!texto) return [];
    const parts = ((thread && thread.participants) || []).map(String);
    const found = new Set();
    const me = _me();
    const pode = k => _podeMarcar(thread, k);
    if (pode('todos') && _TODOS_RE.test(texto)) parts.forEach(pid => { if (!me || pid !== me.id) found.add(pid); });
    if (pode('pessoas')) parts.forEach(pid => {
        const nm = _userName(pid);
        if (nm && texto.includes('@' + nm)) found.add(pid);
    });
    const L = _lotesThread(thread);
    [...(pode('setores') ? L.setor : []), ...(pode('grupos') ? L.grupo : [])].forEach(([nome, ids]) => {
        if (texto.includes('@' + nome)) ids.forEach(id => { if (!me || id !== me.id) found.add(id); });
    });
    return [...found];
}

async function msgSendReply() {
    const me = _me();
    const t = _threads[_activeThreadId];
    if (!me || !t) return;
    if (!_canWrite(t)) { _toast('Somente administradores e pessoas autorizadas podem escrever nesta conversa.', 'error'); return; }
    const input = document.getElementById('msgThreadInput');
    const texto = input.value.trim();
    const d = _draft.thread;
    if (!texto && !d.cards.length && !d.anexos.length) return;
    if (_msgSendOnCooldown()) return;

    const now = Date.now();
    const msgId = _uid();
    const patch = {};
    patch['mensagens/' + msgId] = {
        autor: { id: me.id, name: me.name },
        texto: texto || '',
        createdAt: now,
        mencoes: _extractMentionIds(texto, t),
        cardsVinculados: d.cards,
        anexos: d.anexos,
        respostaA: _replyTo || null
    };
    patch['lastMsgAt'] = now;
    patch['lidoPor/' + me.id] = now;

    input.value = '';
    _autoGrow(input);
    _draft.thread = { cards: [], anexos: [] };
    _replyTo = null;
    document.getElementById('msgReplyCtx').style.display = 'none';
    _renderThreadDraftChips();

    try { await _updateThread(_activeThreadId, patch); }
    catch (e) { _toast('Erro ao responder: ' + (e.message || e), 'error'); }
}

// ---------------------------------------------------------------------------
// SAIR da conversa (remove de participants + notifica no chat)
// ---------------------------------------------------------------------------
async function msgLeaveThread() {
    const me = _me();
    const t = _threads[_activeThreadId];
    if (!me || !t) return;
    const owner = _isOwner(t);
    const others = (t.participants || []).filter(p => String(p) !== me.id);

    // Dono NÃO pode sair enquanto houver outros participantes:
    // precisa transferir a liderança antes.
    if (owner && others.length) {
        const ok = await _msgConfirm({
            title: 'Transferir liderança',
            text: 'Você é o dono desta conversa. Para sair, transfira a liderança para outro participante.',
            icon: 'fa-crown',
            confirmLabel: 'Escolher novo dono'
        });
        if (ok) { msgOpenMembers(); _toast('Escolha o novo dono na lista de participantes.', 'info'); }
        return;
    }

    const confirmText = owner
        ? 'Você é o único participante. Ao sair, a conversa será apagada.'
        : 'Os participantes serão avisados e você não a verá mais, a menos que seja readicionado.';
    if (!(await _msgConfirm({ title: 'Sair da conversa', text: confirmText, icon: 'fa-right-from-bracket', confirmLabel: 'Sair', danger: owner }))) return;

    const threadId = _activeThreadId;
    try {
        const newParts = others;
        await _updateThread(threadId, { participants: newParts });
        // Se ninguém mais resta, apaga a conversa (não há dono para gerenciar)
        if (!newParts.length) {
            await _removeThread(threadId);
        } else {
            await _postSystem(threadId, `${me.name} saiu da conversa.`);
        }
        msgBackToList();
        _toast('Você saiu da conversa.', 'success');
    } catch (e) {
        _toast('Erro ao sair: ' + (e.message || e), 'error');
    }
}

// ---------------------------------------------------------------------------
// TRANSFERIR liderança (dono -> outro participante)
// ---------------------------------------------------------------------------
async function msgTransferOwnership(userId) {
    const me = _me();
    const t = _threads[_activeThreadId];
    if (!me || !t || !_isOwner(t)) return;
    if (String(userId) === me.id) return; // já é o dono
    const novoNome = _userName(userId);
    const ok = await _msgConfirm({
        title: 'Transferir liderança',
        text: `Tornar ${novoNome} o novo dono desta conversa? Você passa a ser administrador(a).`,
        icon: 'fa-crown',
        confirmLabel: 'Transferir'
    });
    if (!ok) return;
    const threadId = _activeThreadId;
    try {
        await _updateThread(threadId, { createdBy: { id: String(userId), name: novoNome }, ['admins/' + String(userId)]: null, ['admins/' + me.id]: true });
        _transferindo = false;
        await _postSystem(threadId, `${me.name} transferiu a liderança da conversa para ${novoNome}.`);
        _renderMembers();
        _toast(`${novoNome} agora é o dono da conversa.`, 'success');
    } catch (e) {
        _toast('Erro ao transferir: ' + (e.message || e), 'error');
    }
}

// ---------------------------------------------------------------------------
// APAGAR conversa (somente o dono) — para todos
// ---------------------------------------------------------------------------
async function msgDeleteThread() {
    const me = _me();
    const t = _threads[_activeThreadId];
    if (!me || !t || !_isOwner(t)) return;
    if (!(await _msgConfirm({ title: 'Apagar conversa', text: 'A conversa será apagada para todos os participantes. Esta ação não pode ser desfeita.', danger: true, confirmLabel: 'Apagar' }))) return;
    try {
        await _removeThread(_activeThreadId);
        msgBackToList();
        _toast('Conversa apagada.', 'success');
    } catch (e) {
        _toast('Erro ao apagar: ' + (e.message || e), 'error');
    }
}

// ---------------------------------------------------------------------------
// GERENCIAR MEMBROS (adicionar: qualquer membro | remover: dono)
// ---------------------------------------------------------------------------
function msgOpenMembers() {
    const t = _threads[_activeThreadId];
    if (!t) return;
    { const f = document.getElementById("msgMembersFilter"); if (f) f.value = ""; } _transferindo = false;
    _renderMembers();
    document.getElementById('msgMemberSearch').value = '';
    _renderMemberAddList();
    _renderRetentionBox();
    _renderWriteBox();
    // setores vêm das contas do Dados (RH), que podem ainda não estar carregadas
    if (typeof window._carregarContasDados === 'function') window._carregarContasDados().then(() => { if (document.getElementById('msgMembersModal').style.display !== 'none') _renderMemberAddList(); }).catch(() => {});
    msgMembersTab('lista');
    _openPopup('msgMembersModal');
}
// Sub-abas do modal: 'lista' (participantes + ajustes) | 'add' (adicionar)
function msgMembersTab(tab) {
    const m = document.getElementById('msgMembersModal');
    if (!m) return;
    m.querySelectorAll('.msg-members-tab').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    m.querySelectorAll('.msg-members-body').forEach(b => { b.style.display = b.dataset.tab === tab ? '' : 'none'; });
    if (tab === 'add') { const s = document.getElementById('msgMemberSearch'); if (s) setTimeout(() => s.focus(), 30); }
}
function msgCloseMembers() { _closePopup('msgMembersModal'); }
let _transferindo = false;   // modo "escolher novo dono"
function msgToggleTransfer() { _transferindo = !_transferindo; _renderMembers(); }
async function msgToggleThreadAdmin(userId) {
    const t = _threads[_activeThreadId], me = _me();
    if (!t || !me || !_souAdminConversa(t)) return;   // dono ou administrador
    const id = String(userId);
    if (t.createdBy && String(t.createdBy.id) === id) return;   // o dono não é alterado
    const novo = !_isThreadAdmin(t, id);
    const threadId = _activeThreadId;
    try {
        await _updateThread(threadId, { ['admins/' + id]: novo ? true : null });
        await _postSystem(threadId, novo ? `${me.name} tornou ${_userName(id)} administrador(a) da conversa.` : `${me.name} removeu ${_userName(id)} dos administradores da conversa.`);
    } catch (e) { _toast('Erro ao salvar: ' + (e.message || e), 'error'); }
    _renderMembers();
}
function _renderMembers() {
    const t = _threads[_activeThreadId];
    const me = _me();
    const owner = _isOwner(t);
    const souAdm = _souAdminConversa(t);
    const box = document.getElementById('msgMembersList');
    const cnt = document.getElementById('msgMembersCount');
    if (cnt) cnt.textContent = String((t.participants || []).length);
    if (!owner) _transferindo = false;
    const fEl = document.getElementById('msgMembersFilter');
    const q = _normBusca(fEl ? fEl.value : '');
    const ownerId = t.createdBy ? String(t.createdBy.id) : '';
    // dono primeiro, depois administradores, depois o resto (alfabético)
    const ordem = (t.participants || []).map(String)
        .filter(pid => !q || _normBusca(_userName(pid)).includes(q))
        .sort((a, b) => ((b === ownerId) - (a === ownerId)) || (_isThreadAdmin(t, b) - _isThreadAdmin(t, a)) || _userName(a).localeCompare(_userName(b), 'pt-BR'));
    const aviso = _transferindo ? `<div class="msg-transfer-bar"><i class="fas fa-right-left"></i><span>Escolha o novo dono da conversa</span><button onclick="msgToggleTransfer()">Cancelar</button></div>` : '';
    box.innerHTML = aviso + (ordem.length ? '' : '<div class="msg-popup-empty">Ninguém encontrado.</div>') + ordem.map(pid => {
        const isOwnerMember = pid === ownerId;
        const isMe = String(pid) === (me && me.id);
        const isAdm = _isThreadAdmin(t, pid);
        const canManage = !isOwnerMember && souAdm; // dono e administradores gerenciam todos, menos o dono
        const restrita = !!t.escritaRestrita;
        const autorizado = _isAuthorized(t, pid);
        const sub = [isOwnerMember ? '<i class="fas fa-crown" style="color:#ca8a04"></i> Dono' : '',
            !isOwnerMember && isAdm ? '<i class="fas fa-user-shield" style="color:#ca8a04"></i> Administrador(a)' : '',
            restrita && !isOwnerMember && !isAdm && autorizado ? '<i class="fas fa-pen" style="color:var(--accent)"></i> Pode escrever' : '',
            restrita && !autorizado ? '<i class="fas fa-eye"></i> Só leitura' : ''].filter(Boolean).join(' · ');
        const penBtn = restrita && !isOwnerMember && !isAdm && canManage && !_transferindo
            ? `<button class="msg-icon-btn ${autorizado ? 'msg-icon-btn--on' : ''}" title="${autorizado ? 'Retirar permissão de escrita' : 'Autorizar a escrever'}" onclick="msgToggleAuthorized('${_esc(pid)}')"><i class="fas ${autorizado ? 'fa-user-pen' : 'fa-user-lock'}"></i></button>` : '';
        return `<div class="msg-popup-item" style="cursor:default;">
            <div class="msg-avatar" style="width:34px;height:34px;font-size:13px;">${_esc(_initials(_userName(pid)))}</div>
            <div style="flex:1;min-width:0;">
                <div class="msg-popup-item-name">${_esc(_userName(pid))}${isMe ? ' <small style="color:var(--text-muted)">(você)</small>' : ''}</div>
                ${sub ? `<div class="msg-popup-item-sub">${sub}</div>` : ''}
            </div>
            ${isOwnerMember && owner ? `<button class="msg-icon-btn ${_transferindo ? 'msg-icon-btn--on' : ''}" title="Trocar o dono da conversa" onclick="msgToggleTransfer()"><i class="fas fa-right-left"></i></button>` : ''}
            ${_transferindo && !isOwnerMember ? `<button class="msg-transfer-pick" onclick="msgTransferOwnership('${_esc(pid)}')"><i class="fas fa-crown"></i> Tornar dono</button>` : `
            ${penBtn}
            ${souAdm && !isOwnerMember ? `<button class="msg-icon-btn ${isAdm ? 'msg-icon-btn--gold msg-icon-btn--on' : 'msg-icon-btn--gold'}" title="${isAdm ? 'Remover administrador da conversa' : 'Tornar administrador da conversa'}" onclick="msgToggleThreadAdmin('${_esc(pid)}')"><i class="fas ${isAdm ? 'fa-user-shield' : 'fa-crown'}"></i></button>` : ''}
            ${canManage ? `<button class="msg-icon-btn msg-icon-btn--danger" title="Remover" onclick="msgRemoveMember('${_esc(pid)}')"><i class="fas fa-user-minus"></i></button>` : ''}`}
        </div>`;
    }).join('');
}
// Adicionar por Setor (unidade do RH), Grupo da Auditoria ou Usuário — mesmas fontes do seletor de menções
let _addLotes = { setor: [], grupo: [] };
function _renderMemberAddList() {
    const t = _threads[_activeThreadId];
    const q = _normBusca(document.getElementById('msgMemberSearch').value);
    const box = document.getElementById('msgMemberAddList');
    const dentro = id => (t.participants || []).some(p => String(p) === String(id));
    const fora = _usersList().filter(u => !dentro(u.id));
    _addLotes = { setor: _lotes(fora, _setorDe), grupo: _lotes(fora, _grupoDe) };
    const lote = (tipo, ic, cls) => _addLotes[tipo].map(([nome, ids], i) => [nome, ids, i])
        .filter(([nome]) => _normBusca(nome).includes(q))
        .map(([nome, ids, i]) => `<div class="msg-popup-item" onclick="msgAddMemberLote('${tipo}', ${i})">
                <div class="msg-avatar ${cls}" style="width:34px;height:34px;font-size:14px;"><i class="fas ${ic}"></i></div>
                <div style="flex:1;min-width:0;">
                    <div class="msg-popup-item-name">${_esc(nome)}</div>
                    <div class="msg-popup-item-sub">${ids.length} pessoa${ids.length > 1 ? 's' : ''} fora da conversa</div>
                </div>
                <i class="fas fa-user-plus" style="color:var(--accent)"></i>
            </div>`).join('');
    const setores = lote('setor', 'fa-building', 'msg-avatar--setor');
    const grupos = lote('grupo', 'fa-users', 'msg-avatar--lote');
    const candidates = fora.filter(u => _normBusca(u.name || u.user).includes(q));
    let h = '';
    if (setores) h += `<div class="msg-popup-sec"><i class="fas fa-building"></i> Setores / unidades</div>` + setores;
    if (grupos) h += `<div class="msg-popup-sec"><i class="fas fa-users"></i> Grupos</div>` + grupos;
    if (candidates.length) h += `<div class="msg-popup-sec"><i class="fas fa-user"></i> Usuários</div>`;
    if (!h) { box.innerHTML = `<div class="msg-popup-empty">Nenhum usuário disponível.</div>`; return; }
    box.innerHTML = h + candidates.map(u => `
        <div class="msg-popup-item" onclick="msgAddMember('${_esc(u.id)}')">
            <div class="msg-avatar" style="width:34px;height:34px;font-size:13px;">${_esc(_initials(u.name || u.user))}</div>
            <div style="flex:1;min-width:0;">
                <div class="msg-popup-item-name">${_esc(u.name || u.user)}</div>
                ${u.cargo ? `<div class="msg-popup-item-sub">${_esc(u.cargo)}</div>` : ''}
            </div>
            <i class="fas fa-user-plus" style="color:var(--accent)"></i>
        </div>`).join('');
}
async function msgAddMember(userId) {
    const t = _threads[_activeThreadId];
    const me = _me();
    if (!t || !me) return;
    if ((t.participants || []).some(p => String(p) === String(userId))) return;
    const threadId = _activeThreadId;
    const newParts = Array.from(new Set([...(t.participants || []).map(String), String(userId)]));
    try {
        await _updateThread(threadId, { participants: newParts });
        await _postSystem(threadId, `${me.name} adicionou ${_userName(userId)} à conversa.`);
        _renderMembers();
        _renderMemberAddList();
    } catch (e) { _toast('Erro ao adicionar: ' + (e.message || e), 'error'); }
}
async function msgAddMemberLote(tipo, idx) {
    const t = _threads[_activeThreadId];
    const me = _me();
    const lote = (_addLotes[tipo] || [])[idx];
    if (!t || !me || !lote) return;
    const [nome] = lote;
    const novos = lote[1].filter(id => !(t.participants || []).some(p => String(p) === String(id)));
    if (!novos.length) { _toast(`Todos de "${nome}" já estão na conversa.`, 'info'); return; }
    const de = tipo === 'setor' ? 'do setor' : 'do grupo';
    const ok = await _msgConfirm({ title: 'Adicionar em lote', icon: 'fa-user-plus', confirmLabel: 'Adicionar',
        text: `Adicionar ${novos.length} pessoa${novos.length > 1 ? 's' : ''} ${de} "${nome}" à conversa?` });
    if (!ok) return;
    const threadId = _activeThreadId;
    const newParts = Array.from(new Set([...(t.participants || []).map(String), ...novos.map(String)]));
    try {
        await _updateThread(threadId, { participants: newParts });
        await _postSystem(threadId, `${me.name} adicionou ${novos.length} pessoa${novos.length > 1 ? 's' : ''} ${de} "${nome}": ${novos.map(_userName).join(', ')}.`);
        _toast(`${novos.length} pessoa${novos.length > 1 ? 's' : ''} adicionada${novos.length > 1 ? 's' : ''}.`, 'success');
        _renderMembers();
        _renderMemberAddList();
    } catch (e) { _toast('Erro ao adicionar: ' + (e.message || e), 'error'); }
}
async function msgRemoveMember(userId) {
    const t = _threads[_activeThreadId];
    const me = _me();
    if (!t || !me || !_souAdminConversa(t)) return;
    if (String(userId) === String(t.createdBy.id)) return; // dono não se remove aqui (usa Sair)
    if (!(await _msgConfirm({ title: 'Remover participante', text: `Remover ${_userName(userId)} da conversa?`, danger: true, confirmLabel: 'Remover' }))) return;
    const threadId = _activeThreadId;
    const newParts = (t.participants || []).filter(p => String(p) !== String(userId));
    try {
        await _updateThread(threadId, { participants: newParts });
        await _postSystem(threadId, `${_userName(userId)} foi removido(a) por ${me.name}.`);
        _renderMembers();
        _renderMemberAddList();
    } catch (e) { _toast('Erro ao remover: ' + (e.message || e), 'error'); }
}

// ---------------------------------------------------------------------------
// TÍTULO do chat (dono edita)
// ---------------------------------------------------------------------------
async function msgEditTitle() {
    const t = _threads[_activeThreadId];
    const me = _me();
    if (!t || !me || !_isOwner(t)) { _toast('Apenas o dono pode renomear a conversa.', 'error'); return; }
    const atual = t.titulo || '';
    const novo = await _msgPrompt({ title: 'Título da conversa', text: 'Defina um nome para identificar esta conversa.', icon: 'fa-heading', value: atual, placeholder: 'Nome da conversa...', confirmLabel: 'Salvar' });
    if (novo === null) return;
    const titulo = novo.trim();
    if (titulo === atual.trim()) return;
    const threadId = _activeThreadId;
    try {
        await _updateThread(threadId, { titulo });
        await _postSystem(threadId, titulo
            ? `${me.name} renomeou a conversa para "${titulo}".`
            : `${me.name} removeu o título da conversa.`);
    } catch (e) { _toast('Erro ao renomear: ' + (e.message || e), 'error'); }
}

// ---------------------------------------------------------------------------
// POPUP: menções
// ---------------------------------------------------------------------------
function msgOpenMentionPicker(target) {
    _mentionTarget = target;
    _mentionSel = (target === 'compose') ? _draft.compose.mentions.slice() : [];
    _mentionTodos = false;
    document.getElementById('msgMentionSearch').value = '';
    _renderMentionList();
    // contas do Dados (setor do RH) podem ainda não estar carregadas
    if (typeof window._carregarContasDados === 'function') window._carregarContasDados().then(() => { if (document.getElementById('msgMentionPopup').style.display !== 'none') _renderMentionList(); }).catch(() => {});
    const anchor = (target === 'thread' && typeof event !== 'undefined' && event) ? event.currentTarget : null;
    if (anchor) _anchorPopupAbove('msgMentionPopup', anchor);
    else _openPopup('msgMentionPopup');
}
function msgCloseMentionPicker() { _closePopup('msgMentionPopup'); }

// Lista única: Setores (unidade do RH no Dados LAMIC), Grupos de usuários da Auditoria e Usuários.
// Clicar num setor/grupo marca todos dele (ou desmarca, se todos já estavam). A busca filtra as três seções.
function _setorDe(u) {
    const c = typeof window._contaDados === 'function' ? window._contaDados(u.dadosLogin) : null;
    return String((c && c.unidade) || '').trim();
}
function _grupoDe(u) {
    const g = (u.grupoId && typeof getUserGroup === 'function') ? getUserGroup(u.grupoId) : null;
    return String((g && g.name) || u.grupo || '').trim();
}
const _normBusca = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function _lotes(us, fn) {
    const m = new Map();
    us.forEach(u => { const k = fn(u); if (!k) return; if (!m.has(k)) m.set(k, []); m.get(k).push(String(u.id)); });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
}
let _mentionLotes = { setor: [], grupo: [] };
function msgMentionToggleLote(tipo, idx) {
    const lote = (_mentionLotes[tipo] || [])[idx];
    if (!lote) return;
    const [nome, ids] = lote;
    const todos = ids.every(id => _mentionSel.some(x => String(x) === id));
    if (todos) _mentionSel = _mentionSel.filter(x => !ids.includes(String(x)));
    else ids.forEach(id => { if (!_mentionSel.some(x => String(x) === id)) _mentionSel.push(id); });
    _renderMentionList();
    _toast(todos ? `"${nome}" desmarcado.` : `${ids.length} pessoa${ids.length > 1 ? 's' : ''} de "${nome}" marcada${ids.length > 1 ? 's' : ''}.`, 'info');
}
function _renderMentionList() {
    const q = _normBusca(document.getElementById('msgMentionSearch').value);
    const me = _me();
    const todos = _usersList().filter(u => String(u.id) !== (me && me.id));
    _mentionLotes = { setor: _lotes(todos, _setorDe), grupo: _lotes(todos, _grupoDe) };
    const box = document.getElementById('msgMentionList');
    const marcado = id => _mentionSel.some(x => String(x) === String(id));
    const lote = (tipo, ic, cls) => _mentionLotes[tipo].map(([nome, ids], i) => [nome, ids, i])
        .filter(([nome]) => _normBusca(nome).includes(q))
        .map(([nome, ids, i]) => {
            const n = ids.filter(marcado).length;
            const st = n === ids.length ? 'selected' : n ? 'selected parcial' : '';
            return `<div class="msg-popup-item ${st}" onclick="msgMentionToggleLote('${tipo}', ${i})">
                <div class="msg-avatar ${cls}" style="width:34px;height:34px;font-size:14px;"><i class="fas ${ic}"></i></div>
                <div style="flex:1;min-width:0;">
                    <div class="msg-popup-item-name">${_esc(nome)}</div>
                    <div class="msg-popup-item-sub">${ids.length} pessoa${ids.length > 1 ? 's' : ''}${n && n < ids.length ? ` · ${n} marcada${n > 1 ? 's' : ''}` : ''}</div>
                </div>
                <i class="fas fa-check-circle msg-popup-item-check"></i>
            </div>`;
        }).join('');
    const setores = lote('setor', 'fa-building', 'msg-avatar--setor');
    const grupos = lote('grupo', 'fa-users', 'msg-avatar--lote');
    const pessoas = todos.filter(u => _normBusca(u.name || u.user).includes(q)).map(u => `<div class="msg-popup-item ${marcado(u.id) ? 'selected' : ''}" onclick="msgToggleMention('${_esc(u.id)}')">
            <div class="msg-avatar" style="width:34px;height:34px;font-size:13px;">${_esc(_initials(u.name || u.user))}</div>
            <div style="flex:1;min-width:0;">
                <div class="msg-popup-item-name">${_esc(u.name || u.user)}</div>
                ${u.cargo ? `<div class="msg-popup-item-sub">${_esc(u.cargo)}</div>` : ''}
            </div>
            <i class="fas fa-check-circle msg-popup-item-check"></i>
        </div>`).join('');
    let h = '';
    const tAt = _mentionTarget === 'thread' ? _threads[_activeThreadId] : null;
    const podeP = k => !tAt || _podeMarcar(tAt, k);
    if (_mentionTarget === 'thread' && podeP('todos') && 'todos'.includes(q)) h += `<div class="msg-popup-item ${_mentionTodos ? 'selected' : ''}" onclick="msgToggleMentionTodos()">
            <div class="msg-avatar msg-avatar--lote" style="width:34px;height:34px;font-size:14px;"><i class="fas fa-users-line"></i></div>
            <div style="flex:1;min-width:0;"><div class="msg-popup-item-name">@todos</div><div class="msg-popup-item-sub">Marca todos os participantes da conversa</div></div>
            <i class="fas fa-check-circle msg-popup-item-check"></i></div>`;
    if (setores && podeP('setores')) h += `<div class="msg-popup-sec"><i class="fas fa-building"></i> Setores</div>` + setores;
    if (grupos && podeP('grupos')) h += `<div class="msg-popup-sec"><i class="fas fa-users"></i> Grupos</div>` + grupos;
    if (pessoas && podeP('pessoas')) h += `<div class="msg-popup-sec"><i class="fas fa-user"></i> Usuários</div>` + pessoas;
    box.innerHTML = h || `<div class="msg-popup-empty">${tAt && !_MARC_OPTS.some(o => _podeMarcar(tAt, o[0])) ? 'Marcações desativadas nesta conversa.' : 'Nada encontrado.'}</div>`;
}
let _mentionTodos = false;
function msgToggleMentionTodos() { _mentionTodos = !_mentionTodos; _renderMentionList(); }
function msgToggleMention(id) {
    const i = _mentionSel.findIndex(x => String(x) === String(id));
    if (i >= 0) _mentionSel.splice(i, 1); else _mentionSel.push(id);
    _renderMentionList();
}
function msgConfirmMentions() {
    if (_mentionTarget === 'compose') {
        _draft.compose.mentions = _mentionSel.slice();
        _renderComposeMentions();
    } else {
        // thread: adiciona menções como participantes novos + prefixo no texto
        const t = _threads[_activeThreadId];
        if (t) {
            const me = _me();
            const add = _mentionSel.filter(id => !(t.participants || []).some(p => String(p) === String(id)));
            if (add.length) {
                const threadId = _activeThreadId;
                const parts = Array.from(new Set([...(t.participants || []), ...add.map(String)]));
                _updateThread(threadId, { participants: parts })
                    .then(() => _postSystem(threadId, `${me.name} adicionou ${add.map(_userName).join(', ')} à conversa.`))
                    .catch(() => {});
            }
            const input = document.getElementById('msgThreadInput');
            const nomes = (_mentionTodos ? ['@todos'] : []).concat(_mentionSel.map(id => '@' + _userName(id))).join(' ');
            input.value = (input.value ? input.value + ' ' : '') + nomes + ' ';
            input.focus();
        }
    }
    msgCloseMentionPicker();
}
function _renderComposeMentions() {
    const box = document.getElementById('msgComposeMentions');
    const ms = _draft.compose.mentions;
    if (!ms.length) { box.innerHTML = `<span class="msg-mention-placeholder">Selecione usuários...</span>`; return; }
    box.innerHTML = ms.map(id => `<span class="msg-mention-tag-pill"><i class="fas fa-user"></i> ${_esc(_userName(id))} <i class="fas fa-times" onclick="event.stopPropagation();msgRemoveMention('${_esc(id)}')"></i></span>`).join('');
}
function msgRemoveMention(id) {
    _draft.compose.mentions = _draft.compose.mentions.filter(x => String(x) !== String(id));
    _renderComposeMentions();
}

// ---------------------------------------------------------------------------
// POPUP: vincular card (área -> card)
// ---------------------------------------------------------------------------
const _AREA_SOURCES = [
    { key: 'ativ',  label: 'Atividades',   icon: 'fa-list-check',           color: '#16a34a', get: () => (typeof activities !== 'undefined' ? activities : []) },
    { key: 'audit', label: 'Rotinas',       icon: 'fa-clipboard-check',      color: '#2563eb', get: () => (typeof audits !== 'undefined' ? audits : []) },
    { key: 'doc',   label: 'Documentos',   icon: 'fa-file-lines',           color: '#ea580c', get: () => (typeof documents !== 'undefined' ? documents : []) },
    { key: 'rnc',   label: 'RNC',          icon: 'fa-triangle-exclamation', color: '#dc2626', get: () => (typeof window.rncItems !== 'undefined' ? window.rncItems : []) },
    { key: 'reuniao', label: 'Reuniões',   icon: 'fa-people-group',         color: '#7c3aed', get: () => (typeof window.reuListForChat === 'function' ? window.reuListForChat() : []) }
];
function _areaMeta(key) { return _AREA_SOURCES.find(a => a.key === key) || _AREA_SOURCES[0]; }
function msgOpenCardPicker(target) {
    _cardTarget = target;
    _cardArea = 'ativ';
    document.getElementById('msgCardSearch').value = '';
    _renderAreaSelector();
    _renderCardList();
    const anchor = (target === 'thread' && typeof event !== 'undefined' && event) ? event.currentTarget : null;
    if (anchor) _anchorPopupAbove('msgCardPopup', anchor);
    else _openPopup('msgCardPopup');
}
function msgCloseCardPicker() { _closePopup('msgCardPopup'); _closeAreaPopover(); }

// Grade de ícones de área (3 em cima, 2 embaixo, centralizada) — sem popover
function _renderAreaSelector() {
    const box = document.getElementById('msgAreaTabs');
    box.innerHTML = _AREA_SOURCES.map(a => `
        <button class="msg-area-grid-item ${a.key === _cardArea ? 'active' : ''}" style="--area-color:${a.color}" onclick="msgSetCardArea('${a.key}')" title="${_esc(a.label)}">
            <span class="msg-area-grid-ic" style="background:${a.color}1a;color:${a.color}"><i class="fas ${a.icon}"></i></span>
            <span class="msg-area-grid-label">${_esc(a.label)}</span>
        </button>`).join('');
}
// Compat: mantido como no-op caso algo ainda referencie o popover antigo
function _closeAreaPopover() {}
function msgSetCardArea(area) { _cardArea = area; _closeAreaPopover(); _renderAreaSelector(); _renderCardList(); }
// Status final (concluído/cancelado) — oculta da lista de vínculo
function _isStatusFinal(status) {
    if (typeof normalizeStatusName === 'function') {
        const n = normalizeStatusName(status);
        return n === 'concluído' || n === 'concluido' || n === 'cancelado';
    }
    const n = String(status || '').trim().toLowerCase();
    return n === 'concluído' || n === 'concluido' || n === 'cancelado';
}
// RNC: status final é definido por finalKind na masterList rncStatus
function _isRncStatusFinal(status) {
    try {
        const list = (typeof masterLists !== 'undefined' && masterLists.rncStatus) || [];
        const s = list.find(x => x && x.name === status);
        if (s && (s.finalKind === 'concluido' || s.finalKind === 'cancelado')) return true;
    } catch (_) {}
    return _isStatusFinal(status);
}
const _norm = s => (typeof normalizeText === 'function') ? normalizeText(s) : String(s || '').trim().toLowerCase();
// Nomes (lowercase, sem acento) dos usuários mencionados/participantes-alvo (sem incluir eu mesmo)
function _targetUserNames() {
    let ids = [];
    const me = _me();
    if (_cardTarget === 'compose') {
        ids = _draft.compose.mentions.slice();
    } else if (_activeThreadId && _threads[_activeThreadId]) {
        ids = (_threads[_activeThreadId].participants || []).filter(p => String(p) !== (me && me.id));
    }
    return ids.map(id => _norm(_userName(id))).filter(Boolean);
}
// Nome (lowercase, sem acento) do usuário logado (dono do chat)
function _ownerUserName() {
    const me = _me();
    return me ? _norm(me.name) : '';
}
// O card liga o DONO do chat e o(s) usuário(s) adicionados: cada um dos dois lados precisa
// estar no card como responsável OU revisor (não basta um lado sozinho).
function _cardHasTargetPerson(card, targets) {
    const owner = _ownerUserName();
    if (!targets.length) return true; // sem alvo definido → não filtra por pessoa
    const parse = (typeof _parseUserField === 'function')
        ? _parseUserField
        : (v => String(v || '').toLowerCase().split(/[;,]/).map(s => s.trim()).filter(Boolean));
    // Só responsável/revisor contam como "envolvido" (colaborador não conta para o vínculo).
    const names = [].concat(parse(card.responsavel), parse(card.revisor)).map(_norm).filter(Boolean);
    const ownerIn = !owner || names.includes(owner);
    const targetIn = targets.some(t => names.includes(t));
    return ownerIn && targetIn;
}
function _renderCardList() {
    const src = _AREA_SOURCES.find(a => a.key === _cardArea);
    const q = (document.getElementById('msgCardSearch').value || '').toLowerCase();
    const isRnc = _cardArea === 'rnc';
    const targets = _targetUserNames();
    let items = (src ? src.get() : []).filter(c => c && !c.deleted);
    // Oculta cards com status final (concluído/cancelado)
    items = items.filter(c => !(isRnc ? _isRncStatusFinal(c.status) : _isStatusFinal(c.status)));
    // Mostra só cards em que os destinatários são responsáveis/revisores
    if (_cardArea !== 'reuniao') items = items.filter(c => _cardHasTargetPerson(c, targets));
    if (q) items = items.filter(c => (c.titulo || '').toLowerCase().includes(q));
    items = items.slice(0, 60);
    const box = document.getElementById('msgCardList');
    if (!items.length) {
        const hint = targets.length ? 'Nenhum card ativo onde os destinatários sejam responsáveis ou revisores.' : 'Nenhum card ativo encontrado.';
        box.innerHTML = `<div class="msg-popup-empty">${hint}</div>`;
        return;
    }
    const am = _areaMeta(_cardArea);
    box.innerHTML = items.map(c => `
        <div class="msg-popup-item" onclick="msgPickCard('${_cardArea}','${_esc(c.id)}')">
            <span class="msg-area-opt-ic" style="background:${am.color}1a;color:${am.color}"><i class="fas ${am.icon}"></i></span>
            <div style="flex:1;min-width:0;">
                <div class="msg-popup-item-name">${_esc(c.titulo || 'Sem título')}</div>
                ${c.setor ? `<div class="msg-popup-item-sub">${_esc(c.setor)}</div>` : ''}
            </div>
        </div>`).join('');
}
// Abre o chat já com um card vinculado no rascunho de nova conversa (usado por Reuniões)
function msgComposeWithCard(card) {
    if (!card) return;
    msgOpenDrawer();
    msgOpenComposer();
    if (!_draft.compose.cards.some(c => c.area === card.area && String(c.id) === String(card.id))) _draft.compose.cards.push(card);
    _renderComposeChips();
    _toast('Selecione os destinatários e envie.', 'info');
}
function msgPickCard(area, id) {
    const src = _AREA_SOURCES.find(a => a.key === area);
    const card = (src ? src.get() : []).find(c => String(c.id) === String(id));
    if (!card) return;
    const entry = { area, id: String(id), titulo: card.titulo || 'Card' };
    const bucket = (_cardTarget === 'compose') ? _draft.compose.cards : _draft.thread.cards;
    if (!bucket.some(c => c.area === area && String(c.id) === String(id))) bucket.push(entry);
    (_cardTarget === 'compose') ? _renderComposeChips() : _renderThreadDraftChips();
    msgCloseCardPicker();
}

// ---------------------------------------------------------------------------
// ANEXOS — Modal (arquivo -> Drive, imagem -> /imgBlobs, link)
// ---------------------------------------------------------------------------
let _attachType = 'arquivo';       // tipo selecionado no modal
let _attachFile = null;            // File escolhido (arquivo/imagem)

function msgOpenAttachMenu(target) {
    _attachTarget = target;
    _attachType = 'arquivo';
    _attachFile = null;
    document.getElementById('msgAttachName').value = '';
    document.getElementById('msgLinkUrl').value = '';
    _renderDropzone();
    _syncAttachType();
    _openPopup('msgAttachModal');
    // input de arquivo
    const inp = document.getElementById('msgAttachFileInput');
    inp.value = '';
    inp.onchange = () => { const f = inp.files && inp.files[0]; if (f) _onAttachFilePicked(f); };
}
function msgCloseAttachModal() { _closePopup('msgAttachModal'); _attachFile = null; }
function _hideAttachMenu() { _closePopup('msgAttachModal'); } // compat com _closeAllPopups

function msgSetAttachType(tipo) {
    _attachType = tipo;
    _attachFile = null;
    document.getElementById('msgAttachFileInput').value = '';
    document.getElementById('msgAttachFileInput').accept = (tipo === 'imagem') ? 'image/*' : '';
    _renderDropzone();
    _syncAttachType();
}
function _syncAttachType() {
    document.querySelectorAll('#msgAttachModal .msg-attach-type').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-type') === _attachType);
    });
    const isLink = _attachType === 'link';
    document.getElementById('msgLinkField').style.display = isLink ? 'block' : 'none';
    document.getElementById('msgDropzone').style.display = isLink ? 'none' : 'block';
    const dzText = document.getElementById('msgDropzoneText');
    if (dzText) dzText.textContent = _attachType === 'imagem' ? 'Clique para selecionar a imagem' : 'Clique para selecionar o arquivo';
}
function msgDropzoneClick() { document.getElementById('msgAttachFileInput').click(); }
function _onAttachFilePicked(file) {
    _attachFile = file;
    // Preenche nome automaticamente se vazio
    const nameInput = document.getElementById('msgAttachName');
    if (!nameInput.value.trim()) nameInput.value = file.name.replace(/\.[^.]+$/, '');
    _renderDropzone();
}
function _renderDropzone() {
    const empty = document.getElementById('msgDropzoneEmpty');
    const prev = document.getElementById('msgDropzonePreview');
    if (!_attachFile) { empty.style.display = 'flex'; prev.style.display = 'none'; prev.innerHTML = ''; return; }
    empty.style.display = 'none';
    prev.style.display = 'flex';
    const sizeKb = Math.round(_attachFile.size / 1024);
    const sizeStr = sizeKb > 1024 ? (sizeKb / 1024).toFixed(1) + ' MB' : sizeKb + ' KB';
    if (_attachType === 'imagem') {
        const url = URL.createObjectURL(_attachFile);
        prev.innerHTML = `<img class="msg-dropzone-img" src="${url}" alt=""><div class="msg-dropzone-meta"><span class="msg-dropzone-fname">${_esc(_attachFile.name)}</span><small>${sizeStr}</small></div><button class="msg-icon-btn" onclick="event.stopPropagation();msgClearAttachFile()"><i class="fas fa-times"></i></button>`;
    } else {
        prev.innerHTML = `<span class="msg-dropzone-fileic"><i class="fas fa-file"></i></span><div class="msg-dropzone-meta"><span class="msg-dropzone-fname">${_esc(_attachFile.name)}</span><small>${sizeStr}</small></div><button class="msg-icon-btn" onclick="event.stopPropagation();msgClearAttachFile()"><i class="fas fa-times"></i></button>`;
    }
}
function msgClearAttachFile() { _attachFile = null; document.getElementById('msgAttachFileInput').value = ''; _renderDropzone(); }

async function msgConfirmAttach() {
    const nome = document.getElementById('msgAttachName').value.trim();
    const btn = document.getElementById('msgAttachConfirmBtn');

    if (_attachType === 'link') {
        let u = document.getElementById('msgLinkUrl').value.trim();
        if (!u) { _toast('Cole a URL do link.', 'error'); return; }
        if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
        _pushAnexo({ tipo: 'link', nome: nome || u, url: u });
        msgCloseAttachModal();
        return;
    }

    if (!_attachFile) { _toast('Selecione um arquivo.', 'error'); return; }
    const file = _attachFile;
    const finalName = nome || file.name;
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
    try {
        await _handleAttachFile(file, _attachType, finalName);
        msgCloseAttachModal();
    } catch (e) {
        _toast('Erro no anexo: ' + (e.message || e), 'error');
    } finally {
        btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar';
    }
}

function _fileToDataUrl(file) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
}

async function _handleAttachFile(file, tipo, nome) {
    const bucket = (_attachTarget === 'compose') ? _draft.compose.anexos : _draft.thread.anexos;
    const displayName = nome || file.name;
    const loadingId = _uid();
    bucket.push({ _loading: true, _lid: loadingId, tipo, nome: displayName });
    _renderActiveChips();

    try {
        const dataUrl = await _fileToDataUrl(file);
        let anexo;
        if (tipo === 'imagem') {
            // Reusa /imgBlobs (mesmo pipeline dos cards)
            const blobId = 'msgimg_' + _uid();
            if (typeof _saveImgBlob === 'function') {
                // Drive: guarda só o link (antes ia a imagem inteira em Base64 dentro da mensagem)
                const urlImg = await _saveImgBlob(blobId, dataUrl);
                anexo = { tipo: 'imagem', nome: displayName, url: urlImg || '', blobId };
            } else {
                anexo = { tipo: 'imagem', nome: displayName, url: dataUrl };
            }
        } else {
            // Reusa Google Drive; preserva a extensão original no nome enviado
            if (typeof driveUpload !== 'function') throw new Error('Upload indisponível.');
            const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
            const uploadName = displayName.endsWith(ext) ? displayName : (displayName + ext);
            const result = await driveUpload(uploadName, dataUrl);
            let url, fileId;
            if (typeof result === 'object' && result && result.url) { url = result.url; fileId = result.fileId || result.id || null; }
            else throw new Error(typeof result === 'string' ? result : 'Falha no upload.');
            anexo = { tipo: 'arquivo', nome: displayName, url, fileId };
        }
        // Substitui o placeholder de loading
        const idx = bucket.findIndex(a => a._lid === loadingId);
        if (idx >= 0) bucket.splice(idx, 1, anexo); else bucket.push(anexo);
    } catch (e) {
        const idx = bucket.findIndex(a => a._lid === loadingId);
        if (idx >= 0) bucket.splice(idx, 1);
        _renderActiveChips();
        throw e;
    }
    _renderActiveChips();
}
function _pushAnexo(anexo) {
    const bucket = (_attachTarget === 'compose') ? _draft.compose.anexos : _draft.thread.anexos;
    bucket.push(anexo);
    _renderActiveChips();
}
function _renderActiveChips() {
    (_attachTarget === 'compose') ? _renderComposeChips() : _renderThreadDraftChips();
}

// Chips de rascunho (cards + anexos)
function _chipsHtml(cards, anexos, ctx) {
    let h = '';
    cards.forEach((c, i) => {
        h += `<span class="msg-attach-chip"><i class="fas fa-id-card"></i><span>${_esc(c.titulo)}</span><i class="fas fa-times remove" onclick="msgRemoveDraftCard('${ctx}',${i})"></i></span>`;
    });
    anexos.forEach((a, i) => {
        const ic = a._loading ? 'spinner fa-spin' : (a.tipo === 'imagem' ? 'image' : (a.tipo === 'link' ? 'link' : 'file'));
        h += `<span class="msg-attach-chip ${a._loading ? 'loading' : ''}"><i class="fas fa-${ic}"></i><span>${_esc(a.nome)}</span>${a._loading ? '' : `<i class="fas fa-times remove" onclick="msgRemoveDraftAnexo('${ctx}',${i})"></i>`}</span>`;
    });
    return h;
}
function _renderComposeChips() {
    document.getElementById('msgComposeAttachChips').innerHTML = _chipsHtml(_draft.compose.cards, _draft.compose.anexos, 'compose');
}
function _renderThreadDraftChips() {
    document.getElementById('msgThreadAttachChips').innerHTML = _chipsHtml(_draft.thread.cards, _draft.thread.anexos, 'thread');
}
function msgRemoveDraftCard(ctx, i) {
    const d = ctx === 'compose' ? _draft.compose : _draft.thread;
    d.cards.splice(i, 1);
    (ctx === 'compose') ? _renderComposeChips() : _renderThreadDraftChips();
}
function msgRemoveDraftAnexo(ctx, i) {
    const d = ctx === 'compose' ? _draft.compose : _draft.thread;
    const a = d.anexos[i];
    if (a && a.blobId && typeof window._deleteImgBlob === 'function') window._deleteImgBlob(a.blobId);
    d.anexos.splice(i, 1);
    (ctx === 'compose') ? _renderComposeChips() : _renderThreadDraftChips();
}

// ---------------------------------------------------------------------------
// Popups genéricos
// ---------------------------------------------------------------------------
function _openPopup(id) {
    const el = document.getElementById(id);
    if (!el) return;
    // Reset de posicionamento (caso tenha sido ancorado antes)
    el.classList.remove('anchored');
    el.style.top = ''; el.style.left = ''; el.style.bottom = ''; el.style.transform = '';
    el.style.display = 'flex';
}
function _closePopup(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = 'none';
    el.classList.remove('anchored');
    el.style.top = ''; el.style.left = ''; el.style.bottom = ''; el.style.transform = '';
}
// Clicar fora de uma janela aberta do chat (participantes, configurações, menções, cards, anexo) fecha ela.
// Não fecha com clique no diálogo de confirmação, no autocomplete de @ ou em overlays de outros módulos.
document.addEventListener('mousedown', e => {
    const t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('.msg-popup, #msgDialog, #msgDialogBackdrop, #msgMentionAC, #msgMutePopover, .reu-overlay, .modal, .form-drawer')) return;
    document.querySelectorAll('.msg-popup').forEach(el => {
        if (el.style.display && el.style.display !== 'none') {
            if (el.id === 'msgConfigModal') msgCloseConfig();
            else if (el.id === 'msgMembersModal' && typeof msgCloseMembers === 'function') msgCloseMembers();
            else _closePopup(el.id);
        }
    });
}, true);
// Ancora um popup ACIMA do botão que o abriu (usado no composer da thread)
function _anchorPopupAbove(id, anchorEl) {
    const el = document.getElementById(id);
    if (!el || !anchorEl) return;
    el.classList.add('anchored');
    el.style.transform = 'none';
    el.style.display = 'flex';
    // Mede depois de exibir para obter altura real
    requestAnimationFrame(() => {
        const r = anchorEl.getBoundingClientRect();
        const ph = el.offsetHeight;
        const pw = el.offsetWidth;
        let top = r.top - ph - 8;
        if (top < 8) top = 8;                       // não sai por cima
        let left = r.left;
        if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
        if (left < 8) left = 8;
        el.style.top = top + 'px';
        el.style.left = left + 'px';
    });
    // Fecha ao clicar fora (comportamento de popover)
    setTimeout(() => {
        const onOutside = (e) => {
            if (el.style.display === 'none') { document.removeEventListener('mousedown', onOutside); return; }
            if (el.contains(e.target) || (anchorEl && anchorEl.contains(e.target))) return;
            _closePopup(id);
            document.removeEventListener('mousedown', onOutside);
        };
        document.addEventListener('mousedown', onOutside);
    }, 0);
}
function _closeAllPopups() { ['msgMentionPopup', 'msgCardPopup', 'msgAttachModal', 'msgMembersModal'].forEach(_closePopup); _closeAreaPopover(); msgCloseMutePopover(); }

// ---------------------------------------------------------------------------
// Auto-grow textareas + ESC
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Autocomplete de menção inline (digitar "@" no input da thread)
// ---------------------------------------------------------------------------
let _acOpen = false;
let _acItems = [];       // candidatos filtrados
let _acIndex = 0;        // item destacado
let _acStart = -1;       // posição do "@" no texto

// Participantes do chat (exceto eu) que casam com o termo digitado
function _acCandidates(term) {
    const t = _threads[_activeThreadId];
    const me = _me();
    if (!t) return [];
    const q = (typeof normalizeText === 'function') ? normalizeText(term) : term.toLowerCase();
    const nq = x => (typeof normalizeText === 'function') ? normalizeText(x) : String(x).toLowerCase();
    const ok = nome => !q || nq(nome).includes(q);
    const out = [];
    const outros = (t.participants || []).filter(pid => String(pid) !== (me && me.id));
    if (outros.length > 1 && _podeMarcar(t, 'todos') && ok('todos')) out.push({ id: '', name: 'todos', kind: 'todos', sub: `Todos os ${outros.length} participantes` });
    const L = _lotesThread(t);
    if (_podeMarcar(t, 'setores')) L.setor.forEach(([nome, ids]) => { if (ok(nome)) out.push({ id: '', name: nome, kind: 'setor', sub: `Setor · ${ids.length} pessoa${ids.length > 1 ? 's' : ''}` }); });
    if (_podeMarcar(t, 'grupos')) L.grupo.forEach(([nome, ids]) => { if (ok(nome)) out.push({ id: '', name: nome, kind: 'grupo', sub: `Grupo · ${ids.length} pessoa${ids.length > 1 ? 's' : ''}` }); });
    if (_podeMarcar(t, 'pessoas')) outros.map(pid => ({ id: String(pid), name: _userName(pid), kind: 'user' })).forEach(u => { if (ok(u.name)) out.push(u); });
    return out;
}

// Detecta se o cursor está logo após um "@termo" (sem espaço) e abre/atualiza o AC
function _acCheck(input) {
    const pos = input.selectionStart;
    const upto = input.value.slice(0, pos);
    const m = upto.match(/(?:^|\s)@([^\s@]*)$/); // @ no início ou após espaço
    if (!m) { _acClose(); return; }
    _acStart = pos - m[1].length - 1; // posição do "@"
    _acItems = _acCandidates(m[1]);
    if (!_acItems.length) { _acClose(); return; }
    _acIndex = 0;
    _acRender();
}

function _acRender() {
    const box = document.getElementById('msgMentionAC');
    if (!box) return;
    box.innerHTML = _acItems.map((u, i) => `
        <div class="msg-mention-ac-item ${i === _acIndex ? 'active' : ''}" data-i="${i}"
             onmousedown="event.preventDefault();msgAcPick(${i})" onmousemove="msgAcHover(${i})">
            <div class="msg-avatar ${u.kind === 'setor' ? 'msg-avatar--setor' : u.kind && u.kind !== 'user' ? 'msg-avatar--lote' : ''}" style="width:28px;height:28px;font-size:11px;">${u.kind === 'todos' ? '<i class="fas fa-users-line"></i>' : u.kind === 'setor' ? '<i class="fas fa-building"></i>' : u.kind === 'grupo' ? '<i class="fas fa-users"></i>' : _esc(_initials(u.name))}</div>
            <span class="msg-mention-ac-name">${u.kind && u.kind !== 'user' ? '@' : ''}${_esc(u.name)}${u.sub ? ` <small style="opacity:.6;font-weight:400">· ${_esc(u.sub)}</small>` : ''}</span>
        </div>`).join('');
    box.style.display = 'block';
    _acOpen = true;
    // Garante que o item ativo fique visível
    const act = box.querySelector('.msg-mention-ac-item.active');
    if (act) act.scrollIntoView({ block: 'nearest' });
}
function _acClose() {
    const box = document.getElementById('msgMentionAC');
    if (box) { box.style.display = 'none'; box.innerHTML = ''; }
    _acOpen = false; _acItems = []; _acStart = -1;
}
function msgAcHover(i) { if (i !== _acIndex) { _acIndex = i; _acRender(); } }
function msgAcPick(i) {
    const input = document.getElementById('msgThreadInput');
    const u = _acItems[i];
    if (!u || _acStart < 0) { _acClose(); return; }
    const pos = input.selectionStart;
    const before = input.value.slice(0, _acStart);
    const after = input.value.slice(pos);
    const insert = '@' + u.name + ' ';
    input.value = before + insert + after;
    const caret = (before + insert).length;
    input.setSelectionRange(caret, caret);
    _acClose();
    input.focus();
    _autoGrow(input);
}
// Navegação por teclado no AC. Retorna true se consumiu a tecla.
function _acKeydown(e) {
    if (!_acOpen) return false;
    if (e.key === 'ArrowDown') { e.preventDefault(); _acIndex = (_acIndex + 1) % _acItems.length; _acRender(); return true; }
    if (e.key === 'ArrowUp') { e.preventDefault(); _acIndex = (_acIndex - 1 + _acItems.length) % _acItems.length; _acRender(); return true; }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); msgAcPick(_acIndex); return true; }
    if (e.key === 'Escape') { e.preventDefault(); _acClose(); return true; }
    return false;
}

function _autoGrow(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 130) + 'px'; }

// Colar imagem da área de transferência (Ctrl+V) direto no chat, com nome "Printscreen"
function _handlePasteImage(e, target) {
    if (!_me()) return;
    const items = (e.clipboardData && e.clipboardData.items) || [];
    for (const it of items) {
        if (it.kind === 'file' && it.type && it.type.indexOf('image/') === 0) {
            const file = it.getAsFile();
            if (!file) continue;
            e.preventDefault();
            _attachTarget = target;
            _handleAttachFile(file, 'imagem', 'Printscreen').catch(err => _toast('Erro ao colar imagem: ' + (err.message || err), 'error'));
            return;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const ci = document.getElementById('msgComposeInput');
    if (ci) ci.addEventListener('paste', e => _handlePasteImage(e, 'compose'));
    const ti = document.getElementById('msgThreadInput');
    if (ti) {
        ti.addEventListener('paste', e => _handlePasteImage(e, 'thread'));
        ti.addEventListener('input', () => { _autoGrow(ti); _acCheck(ti); });
        ti.addEventListener('click', () => _acCheck(ti));
        ti.addEventListener('keyup', (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') _acCheck(ti); });
        ti.addEventListener('keydown', (e) => {
            // O autocomplete de menção tem prioridade sobre o envio/quebra de linha
            if (_acKeydown(e)) return;
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); msgSendReply(); }
        });
        ti.addEventListener('blur', () => setTimeout(_acClose, 150)); // permite o clique no item
    }
    // Drag-and-drop no dropzone de anexo
    const dz = document.getElementById('msgDropzone');
    if (dz) {
        ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); if (_attachType !== 'link') dz.classList.add('drag'); }));
        ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag'); }));
        dz.addEventListener('drop', e => {
            if (_attachType === 'link') return;
            const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            if (f) _onAttachFilePicked(f);
        });
    }

    // Inicia listener se já logado
    const tryStart = () => { if (_me() && window.firebaseDatabase) startMessagesListener(); else setTimeout(tryStart, 1200); };
    setTimeout(tryStart, 1500);
});
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (_dialogResolve && document.getElementById('msgDialogBackdrop').style.display === 'flex') { _dialogResolve(); return; }
    if (document.getElementById('msgLightbox').style.display === 'flex') { msgCloseLightbox(); return; }
    if (document.getElementById('msgMutePopover').style.display === 'flex') { msgCloseMutePopover(); return; }
    if (document.getElementById('msgMembersModal').style.display === 'flex') { msgCloseMembers(); return; }
    if (document.getElementById('msgAttachModal').style.display === 'flex') { msgCloseAttachModal(); return; }
    if (document.getElementById('msgMentionPopup').style.display === 'flex') { msgCloseMentionPicker(); return; }
    if (document.getElementById('msgCardPopup').style.display === 'flex') { msgCloseCardPicker(); return; }
    const drawer = document.getElementById('msgDrawer');
    if (drawer && drawer.classList.contains('open')) msgCloseDrawer();
});

// ---------------------------------------------------------------------------
// Exports globais (chamados via onclick no HTML)
// ---------------------------------------------------------------------------
Object.assign(window, {
    msgToggleDrawer, msgOpenDrawer, msgCloseDrawer, msgBackToList,
    msgOpenComposer, msgSendNew, msgSendReply,
    msgOpenThread, msgLeaveThread, msgDeleteThread,
    msgOpenMutePopover, msgCloseMutePopover, msgPickMute,
    msgOpenSeenPopover, msgCloseSeenPopover,
    msgOpenMembers, msgCloseMembers, msgAddMember, msgAddMemberLote, msgRemoveMember, msgTransferOwnership, msgRenderMemberAddList: _renderMemberAddList,
    msgSetRetention, msgMembersTab, msgToggleTransfer, msgToggleThreadAdmin, msgRenderMembers: _renderMembers, msgToggleWriteRestrict, msgToggleAuthorized,
    msgOpenConfig, msgCloseConfig, msgSetNotifPadrao, msgSetMarcacao,
    msgEditTitle,
    msgStartReply, msgCancelReply, msgEditMessage, msgDeleteMessage,
    msgAcPick, msgAcHover,
    msgOpenCard, msgOpenLightbox, msgCloseLightbox,
    msgOpenMentionPicker, msgToggleMentionTodos, msgCloseMentionPicker, msgMentionToggleLote, msgToggleMention, msgConfirmMentions, msgRemoveMention, msgRenderMentionList: _renderMentionList,
    msgOpenCardPicker, msgCloseCardPicker, msgSetCardArea, msgPickCard, msgComposeWithCard, msgRenderCardList: _renderCardList,
    msgOpenAttachMenu, msgCloseAttachModal, msgSetAttachType, msgDropzoneClick, msgClearAttachFile, msgConfirmAttach,
    msgRemoveDraftCard, msgRemoveDraftAnexo,
    startMessagesListener, stopMessagesListener
});

})();
