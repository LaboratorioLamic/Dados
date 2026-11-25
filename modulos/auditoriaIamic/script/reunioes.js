// === MÓDULO REUNIÕES ===
// Agenda de reuniões (estilo Google Agenda) com link do Google Meet, pauta/ata em
// tópicos (texto + checklist), vínculos com outros cards, recorrência, lembretes,
// status e ata em PDF (via impressão do navegador).
//
// Persistência: nó isolado /reunioes/{id} com listener próprio (mesmo padrão de
// script/messages.js). NÃO participa do saveAll() — não pesa no boot nem no merge.
(function () {
'use strict';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------
const LOGO_WHITE = 'https://i.imgur.com/qPGl0Kj.png';
const LOGO_COLOR = 'https://i.imgur.com/xyi3KTI.png';
const MEET_RE = /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/i;
const COLORS = ['#2563eb', '#16a34a', '#dc2626', '#7c3aed', '#ea580c', '#0891b2', '#db2777', '#64748b'];
const STATUS = {
    agendada:  { label: 'Agendada',  cls: 'reu-st--ag',  icon: 'fa-clock' },
    realizada: { label: 'Realizada', cls: 'reu-st--ok',  icon: 'fa-circle-check' },
    cancelada: { label: 'Cancelada', cls: 'reu-st--can', icon: 'fa-ban' }
};
const WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// Áreas vinculáveis (mesmas fontes globais do sistema)
const AREAS = [
    { key: 'ativ',  label: 'Atividade',  icon: 'fa-list-check',           color: '#16a34a', get: () => (typeof activities !== 'undefined' ? activities : []) },
    { key: 'audit', label: 'Rotina',     icon: 'fa-clipboard-check',      color: '#2563eb', get: () => (typeof audits !== 'undefined' ? audits : []) },
    { key: 'doc',   label: 'Documento',  icon: 'fa-file-lines',           color: '#ea580c', get: () => (typeof documents !== 'undefined' ? documents : []) },
    { key: 'oc',    label: 'Ocorrência', icon: 'fa-triangle-exclamation', color: '#d97706', get: () => (window.ocorrencias || []) },
    { key: 'rnc',   label: 'RNC',        icon: 'fa-circle-exclamation',   color: '#dc2626', get: () => (window.rncItems || []) }
];
const _area = k => AREAS.find(a => a.key === k) || AREAS[0];

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------
let _data = {};              // { id: reuniao }
let _listener = null;
const _VIEW_KEY = 'reu_view';  // última visualização escolhida (cache local)
let _view = (() => { try { const v = localStorage.getItem(_VIEW_KEY); return ['mes', 'semana', 'dia', 'lista'].includes(v) ? v : 'mes'; } catch (_) { return 'mes'; } })();   // mes | semana | dia | lista
let _cursor = _today();      // data de referência da agenda (YYYY-MM-DD)
let _open = null;            // { id, date } reunião aberta no drawer
let _editId = null;          // id em edição no formulário (null = nova)
let _form = null;            // rascunho do formulário
let _linkArea = 'rnc';
let _reminderTimer = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function _esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function _pad(n) { return String(n).padStart(2, '0'); }
function _ds(d) { return d.getFullYear() + '-' + _pad(d.getMonth() + 1) + '-' + _pad(d.getDate()); }
function _today() { return _ds(new Date()); }
function _parse(s) { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); }
function _addDays(s, n) { const d = _parse(s); d.setDate(d.getDate() + n); return _ds(d); }
function _fmtDate(s) { if (!s) return ''; const [y, m, d] = s.split('-'); return d + '/' + m + '/' + y; }
function _fmtLong(s) {
    const d = _parse(s);
    return WEEK[d.getDay()] + ', ' + _pad(d.getDate()) + ' de ' + MONTHS[d.getMonth()].toLowerCase() + ' de ' + d.getFullYear();
}
function _minutes(h) { const [a, b] = String(h || '0:0').split(':').map(Number); return a * 60 + (b || 0); }
function _duration(r) {
    const m = _minutes(r.horaFim) - _minutes(r.horaInicio);
    if (m <= 0) return '—';
    return (m >= 60 ? Math.floor(m / 60) + 'h' : '') + (m % 60 ? _pad(m % 60) + 'min' : (m >= 60 ? '' : '0min'));
}
function _uid(p) { return (p || '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function _toast(msg, type) { if (typeof showToast === 'function') showToast(msg, type || 'info'); }
function _me() {
    if (typeof currentuser === 'undefined' || !currentuser) return null;
    return { id: String(currentuser.id || currentuser.user || ''), name: currentuser.name || currentuser.user || 'Usuário' };
}
function _users() { return (typeof users !== 'undefined' && Array.isArray(users)) ? users.filter(u => u && u.active !== false) : []; }
// Responsáveis do item: lista em it.responsaveis (novo) ou o antigo it.responsavel (string)
function _resps(it) {
    if (!it) return [];
    if (Array.isArray(it.responsaveis) && it.responsaveis.length) return it.responsaveis.map(String);
    return it.responsavel ? [String(it.responsavel)] : [];
}
function _userName(id) {
    const u = _users().find(u => String(u.id) === String(id) || String(u.user) === String(id));
    return u ? (u.name || u.user) : (id || '—');
}
function _initials(name) {
    const p = String(name || '?').trim().split(/\s+/);
    return ((p[0] || '')[0] || '?').toUpperCase() + ((p[1] || '')[0] || '').toUpperCase();
}
function _isAdmin() { return typeof userIsAdmin === 'function' && userIsAdmin(); }
function _db() { return window.firebaseDatabase; }
function _ref(path) { return window.firebaseRef(_db(), path); }
async function _update(path, patch) {
    if (!window.firebaseUpdate) throw new Error('Firebase indisponível.');
    await window.firebaseUpdate(_ref(path), patch);
}
async function _set(path, val) {
    if (!window.firebaseSet) throw new Error('Firebase indisponível.');
    await window.firebaseSet(_ref(path), val);
}
function _fail(e) { console.error('[reunioes]', e); _toast('Erro ao salvar reunião: ' + (e && e.message || e), 'error'); }

// Permissão: admin, criador ou participante editam; demais só visualizam.
function _canEdit(r) {
    const me = _me();
    if (!me) return false;
    if (_isAdmin()) return true;
    const perm = typeof window.userCanManageReu === 'function' ? window.userCanManageReu() : 'parcial';
    if (perm === 'total') return true;
    if (perm === 'nao') return false;
    if (!r) return true; // criar nova
    return String(r.criadoPor) === me.id || (r.participantes || []).map(String).includes(me.id);
}
// Organizador (dono): só ele altera detalhes e presença. Admin entra só se não houver organizador.
// Co-organizador (r.coOrg[id] = true) também edita detalhes e vê a pauta inteira.
function _isDono(r) {
    const me = _me();
    if (!me || !r) return false;
    if (!r.criadoPor) return _isAdmin();
    return String(r.criadoPor) === me.id;
}
function _isCoOrg(r, id) { return !!(r && r.coOrg && r.coOrg[String(id)]); }
function _isOrg(r) { const me = _me(); return _isDono(r) || (!!me && _isCoOrg(r, me.id)); }
// Privacidade: só vê a reunião quem está vinculado (organizador, participante ou
// responsável por tópico/item). Nem admin vê reunião em que não está vinculado.
function _visible(r) {
    const me = _me();
    if (!me) return false;
    if (_isMine(r)) return true;
    const respIn = tps => Object.values(tps || {}).some(t => t && ((t.resp || []).map(String).includes(me.id) || Object.values(t.itens || {}).some(it => _resps(it).includes(me.id))));
    return respIn(r.topicos) || respIn(r.topicosModelo) || Object.values(r.excecoes || {}).some(e => e && respIn(e.topicos));
}
function _isMine(r) {
    const me = _me();
    return !!me && (String(r.criadoPor) === me.id || (r.participantes || []).map(String).includes(me.id));
}

// ---------------------------------------------------------------------------
// Recorrência
// ---------------------------------------------------------------------------
function _isRecurring(r) { return r.recorrencia && r.recorrencia.tipo && r.recorrencia.tipo !== 'nenhuma'; }

// A reunião `r` ocorre na data `s`?
function _occursOn(r, s) {
    if (!r || !r.data || s < r.data) return false;
    if (!_isRecurring(r)) return s === r.data;
    const rec = r.recorrencia;
    if (rec.ate && s > rec.ate) return false;
    const iv = Math.max(1, Number(rec.intervalo) || 1);
    const a = _parse(r.data), b = _parse(s);
    const days = Math.round((b - a) / 86400000);
    if (rec.tipo === 'diaria') return days % iv === 0;
    if (rec.tipo === 'semanal') {
        const dias = (rec.diasSemana && rec.diasSemana.length) ? rec.diasSemana.map(Number) : [a.getDay()];
        if (!dias.includes(b.getDay())) return false;
        const wa = new Date(a); wa.setDate(a.getDate() - a.getDay());
        const wb = new Date(b); wb.setDate(b.getDate() - b.getDay());
        const weeks = Math.round((wb - wa) / (7 * 86400000));
        return weeks % iv === 0;
    }
    if (rec.tipo === 'mensal') {
        const months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
        return months % iv === 0 && b.getDate() === a.getDate();
    }
    return false;
}

// Ocorrências entre duas datas (inclusive) — considera exceções movidas/excluídas.
// Cada ocorrência: { r: visão mesclada (série + override), base: série, date: chave
// da ocorrência na série, day: dia em que aparece, status, topicos, presenca }
function _occurrences(from, to) {
    const out = [];
    Object.values(_data).filter(r => r && r.id && !r.deleted && r.data).forEach(r => {
        if (!_isRecurring(r)) { if (r.data >= from && r.data <= to) out.push(_occ(r, r.data)); return; }
        const exc = r.excecoes || {};
        const lo = from > r.data ? from : r.data;
        for (let s = lo; s <= to; s = _addDays(s, 1)) {
            if (!_occursOn(r, s) || (exc[s] && exc[s].excluida)) continue;
            const o = _occ(r, s);
            if (o.day >= from && o.day <= to) out.push(o);
        }
        // ocorrências cuja data original está fora do intervalo mas foram movidas para dentro
        Object.keys(exc).forEach(k => {
            const e = exc[k];
            if (!e || e.excluida || !e.ov || !e.ov.data || (k >= from && k <= to)) return;
            if (e.ov.data >= from && e.ov.data <= to && _occursOn(r, k)) out.push(_occ(r, k));
        });
    });
    return out.sort((x, y) => (x.day + x.r.horaInicio).localeCompare(y.day + y.r.horaInicio));
}

// Dados efetivos de uma ocorrência (aplica exceções da série)
function _occ(r, date) {
    const rec = _isRecurring(r);
    const exc = (rec && r.excecoes && r.excecoes[date]) || {};
    const ov = exc.ov || {};
    const view = Object.assign({}, r, ov);
    let status = rec ? (exc.status || 'agendada') : (r.status || 'agendada');
    if (exc.cancelada) status = 'cancelada';
    return { r: view, base: r, date, day: (rec && ov.data) || date, status, excluida: !!exc.excluida,
        topicos: rec ? (exc.topicos || r.topicosModelo || {}) : (r.topicos || {}), presenca: rec ? (exc.presenca || {}) : (r.presenca || {}) };
}
// Caminho base onde ficam status/tópicos desta ocorrência
function _occPath(r, date) { return _isRecurring(r) ? 'reunioes/' + r.id + '/excecoes/' + date : 'reunioes/' + r.id; }

function _recLabel(r) {
    if (!_isRecurring(r)) return 'Não repete';
    const rec = r.recorrencia, iv = Math.max(1, Number(rec.intervalo) || 1);
    let t = '';
    if (rec.tipo === 'diaria') t = iv === 1 ? 'Diariamente' : 'A cada ' + iv + ' dias';
    if (rec.tipo === 'semanal') {
        const dias = (rec.diasSemana && rec.diasSemana.length ? rec.diasSemana : [_parse(r.data).getDay()]).map(d => WEEK[d]).join(', ');
        t = (iv === 1 ? 'Semanalmente' : 'A cada ' + iv + ' semanas') + ' (' + dias + ')';
    }
    if (rec.tipo === 'mensal') t = (iv === 1 ? 'Mensalmente' : 'A cada ' + iv + ' meses') + ' (dia ' + _parse(r.data).getDate() + ')';
    return t + (rec.ate ? ' até ' + _fmtDate(rec.ate) : '');
}
function _lembLabel(m) {
    if (!m) return 'Sem lembrete';
    if (m < 60) return m + ' min antes';
    if (m < 1440) return (m / 60) + 'h antes';
    return (m / 1440) + ' dia(s) antes';
}

// ---------------------------------------------------------------------------
// Firebase
// ---------------------------------------------------------------------------
function startReunioesListener() {
    if (_listener || !window.firebaseOnValue || !_db()) return;
    _startMkListener();
    _listener = window.firebaseOnValue(_ref('reunioes'), snap => {
        const keep = (_open && _dirty) ? _data[_open.id] : null;
        const all = (snap && snap.exists()) ? (snap.val() || {}) : {};
        _data = {};
        Object.keys(all).forEach(k => { if (all[k] && _visible(all[k])) _data[k] = all[k]; });
        if (keep) _data[_open.id] = keep;
        else if (_open && _data[_open.id]) _openSnap = _clean(_data[_open.id]);
        _refreshBadge();
        if (typeof currentTab !== 'undefined' && currentTab === 'reunioes') _renderMain();
        if (_open) {
            if (_data[_open.id]) _renderDetail();
            else reuCloseDetail(true);
        }
    });
    _startAvisos();
    if (!_reminderTimer) {
        _reminderTimer = setInterval(_checkReminders, 60000);
        setTimeout(_checkReminders, 4000);
    }
}
// Avisos de reunião (/reunioesAvisos/{userId}/{id}): tipo 'edit' | 'add'
let _avListener = null, _avisos = {}, _avToasted = new Set();
function _startAvisos() {
    const me = _me();
    if (_avListener || !me) return;
    _avListener = window.firebaseOnValue(_ref('reunioesAvisos/' + me.id), snap => {
        _avisos = (snap && snap.exists()) ? (snap.val() || {}) : {};
        Object.keys(_avisos).forEach(k => {
            const a = _avisos[k];
            if (!a || a.lido || _avToasted.has(k)) return;
            _avToasted.add(k);
            const msg = _avisoMsg(a);
            _toast((a.tipo === 'add' ? '👥 ' : '📝 ') + msg, 'info');
            if ('Notification' in window && Notification.permission === 'granted') {
                try {
                    const n = new Notification(a.tipo === 'add' ? 'Você foi adicionado a uma reunião' : 'Reunião atualizada', { body: msg, icon: LOGO_COLOR, tag: 'reuav_' + k });
                    n.onclick = () => { window.focus(); if (_data[a.reuId]) reuOpen(a.reuId, a.data); n.close(); };
                } catch (_) {}
            }
        });
        _refreshBell();
    });
}
function _avisoMsg(a) {
    return a.tipo === 'add'
        ? `${a.porNome || 'Alguém'} adicionou você em "${a.titulo || 'reunião'}" (${_fmtDate(a.data)})`
        : `${a.porNome || 'Alguém'} editou "${a.titulo || 'reunião'}" (${_fmtDate(a.data)})${a.resumo ? ' · ' + a.resumo : ''}`;
}
// Envia aviso 'add' para participantes recém-adicionados (entra no próximo _flush)
function _notifyAdded(prev, next, reuId, date, titulo) {
    const me = _me();
    const old = new Set((prev || []).map(String));
    (next || []).map(String).filter(u => !old.has(u) && (!me || u !== me.id)).forEach(u =>
        _commit('reunioesAvisos/' + u + '/' + _uid('av'), { tipo: 'add', reuId, data: date, titulo: titulo || '', por: me ? me.id : '', porNome: me ? me.name : '', em: Date.now() }));
}

// --- Sino de reuniões no cabeçalho ------------------------------------------------
// Ocorrência já terminou? (data passada ou hoje depois do horaFim)
function _ended(date, horaFim) {
    if (!date) return false;
    const t = _today();
    if (date < t) return true;
    if (date > t) return false;
    const now = new Date();
    return !!horaFim && _minutes(horaFim) <= now.getHours() * 60 + now.getMinutes();
}
// Só reuniões de hoje que ainda não terminaram
function _todayMine() {
    const t = _today();
    return _occurrences(t, t).filter(o => !o.excluida && o.status !== 'cancelada' && _isMine(o.r) && !_ended(t, o.r.horaFim));
}
// Últimas reuniões já encerradas (uma por reunião/série), só para consulta no sino
function _anterioresMine(n) {
    const t = _today();
    const occ = _occurrences(_addDays(t, -180), t)
        .filter(o => !o.excluida && _isMine(o.r) && _ended(o.day || o.date, o.r.horaFim))
        .sort((a, b) => ((b.day || b.date) + b.r.horaInicio).localeCompare((a.day || a.date) + a.r.horaInicio));
    const vistos = new Set(), out = [];
    for (const o of occ) { const k = String(o.base.id); if (vistos.has(k)) continue; vistos.add(k); out.push(o); if (out.length >= n) break; }
    return out;
}
// Aviso some quando a reunião a que se refere já terminou
function _avisoVivo(a) {
    if (!a || !a.reuId) return false;
    const r = _data[a.reuId];
    return !_ended(a.data, r && r.horaFim);
}
function _ensureBell() {
    let c = document.getElementById('reuBellContainer');
    if (c) return c;
    const ref = document.getElementById('notificationContainer');
    if (!ref || !ref.parentNode) return null;
    c = document.createElement('div');
    c.className = 'notification-container'; c.id = 'reuBellContainer'; c.title = 'Reuniões';
    c.innerHTML = '<i class="notification-icon fas fa-calendar-check"></i><div class="notification-badge hidden" id="reuBellBadge">0</div>';
    c.onclick = e => { e.stopPropagation(); reuToggleBell(); };
    ref.parentNode.insertBefore(c, ref);
    return c;
}
function _refreshBell() {
    if (!_me()) return;
    if (!_ensureBell()) return;
    const unread = Object.values(_avisos).filter(a => a && !a.lido && _avisoVivo(a)).length;
    const n = unread + _todayMine().filter(o => o.status === 'agendada').length;
    const b = document.getElementById('reuBellBadge');
    if (b) { b.textContent = n; b.classList.toggle('hidden', !n); }
    const p = document.getElementById('reuBellPanel');
    if (p && p.classList.contains('open')) _renderBell();
}
function reuToggleBell() {
    let p = document.getElementById('reuBellPanel');
    if (!p) {
        p = document.createElement('div');
        p.id = 'reuBellPanel'; p.className = 'reu-bell';
        document.body.appendChild(p);
    }
    if (p.classList.contains('open')) { reuCloseBell(); return; }
    const c = document.getElementById('reuBellContainer');
    const rc = c.getBoundingClientRect();
    p.style.top = (rc.bottom + 8) + 'px';
    p.style.right = Math.max(10, window.innerWidth - rc.right - 10) + 'px';
    p.classList.add('open');
    _renderBell();
    // marca avisos como lidos
    const me = _me();
    Object.keys(_avisos).forEach(k => { const a = _avisos[k]; if (a && !a.lido) _update('reunioesAvisos/' + me.id + '/' + k, { lido: true }).catch(() => {}); });
}
function reuCloseBell() { const p = document.getElementById('reuBellPanel'); if (p) p.classList.remove('open'); }
function reuClearAvisos() {
    const me = _me(); if (!me) return;
    _set('reunioesAvisos/' + me.id, null).catch(_fail);
    _avisos = {}; _refreshBell();
}
function reuBellOpen(id, date) { reuCloseBell(); if (_data[id]) reuOpen(id, date); else _toast('Reunião não encontrada.', 'error'); }
function _renderBell() {
    const p = document.getElementById('reuBellPanel'); if (!p) return;
    const now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
    const today = _todayMine();
    const avs = Object.keys(_avisos).map(k => Object.assign({ _k: k }, _avisos[k])).filter(_avisoVivo).sort((a, b) => (b.em || 0) - (a.em || 0)).slice(0, 30);
    const meetRow = o => {
        const r = o.r, st = STATUS[o.status] || STATUS.agendada;
        const past = _minutes(r.horaFim) <= nowMin, live = !past && _minutes(r.horaInicio) <= nowMin;
        return `<div class="reu-bell-it ${past ? 'is-past' : ''}" style="--c:${_esc(r.cor || COLORS[0])}" onclick="reuBellOpen('${_esc(o.base.id)}','${o.date}')">
            <span class="reu-bell-time">${_esc(r.horaInicio)}<small>${_esc(r.horaFim)}</small></span>
            <span class="reu-bell-main"><b>${_esc(r.titulo)}</b><small>${live ? '<span class="reu-bell-live">● agora</span> · ' : ''}${st.label}</small></span>
            ${r.meetUrl && !past ? `<a class="reu-bell-meet" href="${_esc(r.meetUrl)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="Entrar no Meet"><i class="fas fa-video"></i></a>` : ''}
        </div>`;
    };
    const avRow = a => `<div class="reu-bell-it reu-bell-av ${a.lido ? '' : 'is-new'}" onclick="reuBellOpen('${_esc(a.reuId)}','${_esc(a.data || '')}')">
        <span class="reu-bell-ic"><i class="fas ${a.tipo === 'add' ? 'fa-user-plus' : 'fa-pen'}"></i></span>
        <span class="reu-bell-main"><b>${_esc(_avisoMsg(a))}</b><small>${a.em ? new Date(a.em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</small></span>
    </div>`;
    p.innerHTML = `<div class="reu-bell-head"><b><i class="fas fa-calendar-check"></i> Reuniões</b><span style="flex:1"></span>
            <button class="reu-icon-btn" title="Fechar" onclick="reuCloseBell()"><i class="fas fa-times"></i></button></div>
        <div class="reu-bell-body">
            <div class="reu-bell-sec">Hoje · ${_fmtDate(_today())}</div>
            ${today.length ? today.map(meetRow).join('') : '<div class="reu-bell-empty">Nenhuma reunião hoje.</div>'}
            <div class="reu-bell-sec">Anteriores</div>
            ${(() => { const ant = _anterioresMine(5); return ant.length ? ant.map(o => `<div class="reu-bell-it is-past" style="--c:${_esc(o.r.cor || COLORS[0])}" onclick="reuBellOpen('${_esc(o.base.id)}','${o.date}')">
                <span class="reu-bell-time">${_fmtDate(o.day || o.date).slice(0, 5)}<small>${_esc(o.r.horaInicio)}</small></span>
                <span class="reu-bell-main"><b>${_esc(o.r.titulo)}</b><small>${(STATUS[o.status] || STATUS.agendada).label}</small></span></div>`).join('') : '<div class="reu-bell-empty">Nenhuma reunião anterior.</div>'; })()}
            <div class="reu-bell-sec">Avisos ${avs.length ? `<button class="reu-bell-clear" onclick="reuClearAvisos()">Limpar</button>` : ''}</div>
            ${avs.length ? avs.map(avRow).join('') : '<div class="reu-bell-empty">Nenhum aviso.</div>'}
        </div>`;
}
function stopReunioesListener() {
    if (_listener) { try { _listener(); } catch (_) {} _listener = null; }
    if (_mkListener) { try { _mkListener(); } catch (_) {} _mkListener = null; }
    if (_avListener) { try { _avListener(); } catch (_) {} _avListener = null; }
    _avisos = {}; _avToasted = new Set(); reuCloseBell();
    { const bc = document.getElementById('reuBellContainer'); if (bc) bc.remove(); }
    if (_reminderTimer) { clearInterval(_reminderTimer); _reminderTimer = null; }
    _data = {};
}

// ---------------------------------------------------------------------------
// Aba principal
// ---------------------------------------------------------------------------
function reuActivateTab() {
    _ensureShell();
    _renderMain();
    if ('Notification' in window && Notification.permission === 'default') {
        try { Notification.requestPermission(); } catch (_) {}
    }
}

function _ensureShell() {
    const root = document.getElementById('reunioesContent');
    if (!root || root.dataset.ready) return;
    root.dataset.ready = '1';
    root.innerHTML = `
        <div class="reu-toolbar">
            <div class="reu-nav">
                <button class="reu-btn" onclick="reuNav(-1)" title="Anterior"><i class="fas fa-chevron-left"></i></button>
                <button class="reu-btn" onclick="reuNav(0)">Hoje</button>
                <button class="reu-btn" onclick="reuNav(1)" title="Próximo"><i class="fas fa-chevron-right"></i></button>
                <h2 class="reu-period" id="reuPeriod"></h2>
            </div>
            <div class="reu-views" id="reuViews">
                <button data-v="mes" onclick="reuSetView('mes')">Mês</button>
                <button data-v="semana" onclick="reuSetView('semana')">Semana</button>
                <button data-v="dia" onclick="reuSetView('dia')">Dia</button>
                <button data-v="lista" onclick="reuSetView('lista')">Lista</button>
            </div>
            <button class="reu-btn reu-btn--pri" id="reuNewBtn" onclick="reuOpenForm()" ${_canEdit(null) ? '' : 'style="display:none"'}><i class="fas fa-plus"></i> Nova reunião</button>
        </div>
        <div class="reu-layout">
            <aside class="reu-side">
                <div class="reu-mini" id="reuMini"></div>
                <div class="reu-side-title"><i class="fas fa-calendar-day"></i> Próximas reuniões</div>
                <div id="reuUpcoming"></div>
            </aside>
            <section class="reu-main" id="reuMain"></section>
        </div>`;
}

function _renderMain() {
    const root = document.getElementById('reunioesContent');
    if (!root || !root.dataset.ready) return;
    document.querySelectorAll('#reuViews button').forEach(b => b.classList.toggle('active', b.dataset.v === _view));
    const nb = document.getElementById('reuNewBtn');
    if (nb) nb.style.display = _me() && _canEdit(null) ? '' : 'none';
    _renderUpcoming();
    const main = document.getElementById('reuMain');
    const per = document.getElementById('reuPeriod');
    const c = _parse(_cursor);
    if (_view === 'mes') { per.textContent = MONTHS[c.getMonth()] + ' ' + c.getFullYear(); main.innerHTML = _monthHtml(); }
    else if (_view === 'semana') {
        const ws = _addDays(_cursor, -c.getDay()), we = _addDays(ws, 6);
        per.textContent = _fmtDate(ws).slice(0, 5) + ' – ' + _fmtDate(we);
        main.innerHTML = _timeGridHtml(ws, 7);
    } else if (_view === 'dia') { per.textContent = _fmtLong(_cursor); main.innerHTML = _timeGridHtml(_cursor, 1); }
    else { per.textContent = 'A partir de ' + _fmtDate(_cursor); main.innerHTML = _listHtml(); }
    const prevScroll = main._reuScroll;
    if (_view === 'semana' || _view === 'dia') {
        const sc = main.querySelector('.reu-tg-scroll');
        if (sc) { sc.scrollTop = prevScroll != null ? prevScroll : 7 * SLOT_PX; sc.onscroll = () => { main._reuScroll = sc.scrollTop; }; }
        main.onpointerdown = _onGridDown;
    } else if (_view === 'mes') main.onpointerdown = _onMonthDown;
    else main.onpointerdown = null;
    const mini = document.getElementById('reuMini');
    if (mini) { _miniCursor = _cursor.slice(0, 8) + '01'; mini.innerHTML = _miniHtml(); }
}

function _evAttrs(o) {
    const ed = _canEdit(o.base) ? '1' : '0';
    return `data-id="${_esc(o.base.id)}" data-key="${o.date}" data-ed="${ed}" onclick="event.stopPropagation()" title="${_esc(o.r.titulo)} · ${_esc(o.r.horaInicio)}–${_esc(o.r.horaFim)}${ed === '1' ? ' · arraste para mover' : ''}"`;
}

function _monthHtml() {
    const c = _parse(_cursor);
    const first = new Date(c.getFullYear(), c.getMonth(), 1);
    const start = _addDays(_ds(first), -first.getDay());
    const end = _addDays(start, 41);
    const occ = _occurrences(start, end);
    const byDay = {};
    occ.forEach(o => (byDay[o.day] = byDay[o.day] || []).push(o));
    const today = _today();
    let h = '<div class="reu-month">' + WEEK.map(w => `<div class="reu-mh">${w}</div>`).join('');
    for (let i = 0; i < 42; i++) {
        const s = _addDays(start, i), d = _parse(s);
        const items = byDay[s] || [];
        const out = d.getMonth() !== c.getMonth();
        h += `<div class="reu-md ${out ? 'out' : ''} ${s === today ? 'today' : ''} ${s === _selDay ? 'is-pick' : ''}" data-day="${s}" onclick="reuDayClick('${s}')">
            <span class="reu-md-n">${d.getDate()}</span>
            ${items.slice(0, 3).map(o => `<span class="reu-ev ${o.status === 'cancelada' ? 'is-can' : ''}" style="--c:${_esc(o.r.cor || COLORS[0])}" ${_evAttrs(o)}><b>${_esc(o.r.horaInicio)}</b> ${_esc(o.r.titulo)}</span>`).join('')}
            ${items.length > 3 ? `<span class="reu-more" onclick="event.stopPropagation();reuGoDay('${s}')">+${items.length - 3} mais</span>` : ''}
        </div>`;
    }
    return h + '</div>';
}

function _timeGridHtml(start, n) {
    const end = _addDays(start, n - 1);
    const occ = _occurrences(start, end);
    const today = _today();
    let head = '<div class="reu-tg-head"><div class="reu-tg-gutter"></div>';
    let cols = '';
    for (let i = 0; i < n; i++) {
        const s = _addDays(start, i), d = _parse(s);
        head += `<div class="reu-tg-hd ${s === today ? 'today' : ''} ${s === _selDay ? 'is-pick' : ''}" data-day="${s}" onclick="reuGoDay('${s}')"><span>${WEEK[d.getDay()]}</span><b>${d.getDate()}</b></div>`;
        const dayOcc = occ.filter(o => o.day === s);
        const lanes = _lanes(dayOcc);
        const evs = dayOcc.map(o => {
            const top = _minutes(o.r.horaInicio) / 60 * SLOT_PX;
            const hgt = Math.max(20, (_minutes(o.r.horaFim) - _minutes(o.r.horaInicio)) / 60 * SLOT_PX - 2);
            const L = lanes.get(o) || { lane: 0, lanes: 1 };
            const w = 100 / L.lanes;
            const ed = _canEdit(o.base);
            return `<div class="reu-tg-ev ${o.status === 'cancelada' ? 'is-can' : ''} ${ed ? 'is-ed' : ''} ${hgt < 36 ? 'is-short' : ''}" style="top:${top}px;height:${hgt}px;left:calc(${L.lane * w}% + 2px);width:calc(${w}% - 4px);--c:${_esc(o.r.cor || COLORS[0])}" ${_evAttrs(o)}>
                <b>${_esc(o.r.titulo)}</b><span>${_esc(o.r.horaInicio)}–${_esc(o.r.horaFim)}</span>${_isRecurring(o.base) ? '<i class="fas fa-repeat reu-tg-rec"></i>' : ''}
                ${ed ? '<div class="reu-tg-rs" title="Arraste para mudar a duração"></div>' : ''}</div>`;
        }).join('');
        let lines = '';
        for (let hh = 0; hh < 24; hh++) lines += `<div class="reu-tg-slot"></div>`;
        let now = '';
        if (s === today) { const m = new Date(); now = `<div class="reu-tg-now" style="top:${(m.getHours() * 60 + m.getMinutes()) / 60 * SLOT_PX}px"></div>`; }
        cols += `<div class="reu-tg-col ${s === _selDay ? 'is-pick' : ''}" data-day="${s}">${lines}${evs}${now}</div>`;
    }
    head += '</div>';
    let gutter = '<div class="reu-tg-gutter">';
    for (let hh = 0; hh < 24; hh++) gutter += `<div class="reu-tg-hour">${_pad(hh)}:00</div>`;
    gutter += '</div>';
    return `<div class="reu-tg" style="--n:${n}">${head}<div class="reu-tg-scroll"><div class="reu-tg-body">${gutter}${cols}</div></div></div>`;
}

function _listHtml() {
    const occ = _occurrences(_cursor, _addDays(_cursor, 90));
    if (!occ.length) return _emptyHtml('Nenhuma reunião nos próximos 90 dias.');
    let h = '<div class="reu-list">', last = '';
    occ.forEach(o => {
        if (o.day !== last) { h += `<div class="reu-list-day">${_fmtLong(o.day)}</div>`; last = o.day; }
        h += _itemHtml(o, true);
    });
    return h + '</div>';
}

function _itemHtml(o, wide) {
    const st = STATUS[o.status] || STATUS.agendada;
    const r = o.r;
    return `<div class="reu-item ${wide ? 'wide' : ''}" style="--c:${_esc(r.cor || COLORS[0])}" onclick="reuOpen('${_esc(o.base.id)}','${o.date}')">
        <div class="reu-item-main">
            <div class="reu-item-title">${_esc(r.titulo)}</div>
            <div class="reu-item-sub">${wide ? '' : _fmtDate(o.day).slice(0, 5) + ' · '}${_esc(r.horaInicio)}–${_esc(r.horaFim)}${_isRecurring(o.base) ? ' · <i class="fas fa-repeat"></i>' : ''}${r.meetUrl ? ' · <i class="fas fa-video"></i>' : ''}</div>
        </div>
        <span class="reu-st ${st.cls}">${st.label}</span>
    </div>`;
}

function _emptyHtml(msg) {
    return `<div class="reu-empty"><i class="fas fa-calendar-xmark"></i><p>${_esc(msg)}</p></div>`;
}

function _renderUpcoming() {
    const box = document.getElementById('reuUpcoming');
    if (!box) return;
    const today = _today();
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const occ = _occurrences(today, _addDays(today, 30))
        .filter(o => o.status !== 'cancelada' && !(o.day === today && _minutes(o.r.horaFim) < nowMin))
        .filter((o, i, arr) => arr.findIndex(x => x.base.id === o.base.id) === i) // série: só a próxima
        .slice(0, 8);
    box.innerHTML = occ.length ? occ.map(o => _itemHtml(o, false)).join('') : '<div class="reu-side-empty">Nenhuma reunião nos próximos 30 dias.</div>';
}

function reuSetView(v) { _view = v; try { localStorage.setItem(_VIEW_KEY, v); } catch (_) {} _renderMain(); }
function reuNav(dir) {
    if (dir === 0) _cursor = _today();
    else if (_view === 'mes') { const c = _parse(_cursor); c.setDate(1); c.setMonth(c.getMonth() + dir); _cursor = _ds(c); }
    else if (_view === 'semana') _cursor = _addDays(_cursor, 7 * dir);
    else if (_view === 'dia') _cursor = _addDays(_cursor, dir);
    else _cursor = _addDays(_cursor, 30 * dir);
    _renderMain();
}
function reuGoDay(s) { _cursor = s; _view = 'dia'; _renderMain(); }
// Seleção visual do dia (só destaque, sem ação): mês, semana/dia e mini-calendário
let _selDay = null;
function _pickDay(s) {
    if (!s) return;
    _selDay = s;
    document.querySelectorAll('.reu-md.is-pick,.reu-tg-hd.is-pick,.reu-tg-col.is-pick,.reu-mini-d.is-pick').forEach(el => el.classList.remove('is-pick'));
    document.querySelectorAll(`.reu-md[data-day="${s}"],.reu-tg-hd[data-day="${s}"],.reu-tg-col[data-day="${s}"],.reu-mini-d[data-day="${s}"]`).forEach(el => el.classList.add('is-pick'));
}
document.addEventListener('pointerdown', e => {
    const el = e.target && e.target.closest && e.target.closest('.reu-md[data-day],.reu-tg-hd[data-day],.reu-tg-col[data-day],.reu-mini-d[data-day]');
    if (el) _pickDay(el.dataset.day);
}, true);
function reuDayClick(s) { if (_me()) reuOpenForm(null, s); }
function reuSlotClick(s, h) { if (_me()) reuOpenForm(null, s, _pad(h) + ':00'); }

// ---------------------------------------------------------------------------
// Arrastar e soltar · escopo de série · conflitos · desfazer · mini-calendário
// ---------------------------------------------------------------------------
const SLOT_PX = 48;           // altura de 1h na grade
const SNAP_MIN = 15;
let _drag = null;
let _miniCursor = null;

function _hm(min) { min = Math.max(0, Math.min(24 * 60 - 1, Math.round(min))); return _pad(Math.floor(min / 60)) + ':' + _pad(min % 60); }
function _snap(min) { return Math.round(min / SNAP_MIN) * SNAP_MIN; }
function _dayDiff(a, b) { return Math.round((_parse(b) - _parse(a)) / 86400000); }
function _clean(o) { return JSON.parse(JSON.stringify(o)); }

// Layout das reuniões sobrepostas num dia: devolve { key: {lane, lanes} }
function _lanes(list) {
    const evs = list.map(o => ({ o, s: _minutes(o.r.horaInicio), e: Math.max(_minutes(o.r.horaFim), _minutes(o.r.horaInicio) + 20) }))
        .sort((a, b) => a.s - b.s || b.e - a.e);
    const out = new Map();
    let cluster = [], laneEnds = [], clusterEnd = -1;
    const flush = () => { const n = laneEnds.length; cluster.forEach(c => out.set(c.o, { lane: c.lane, lanes: n })); cluster = []; laneEnds = []; };
    evs.forEach(ev => {
        if (ev.s >= clusterEnd && cluster.length) flush();
        let lane = laneEnds.findIndex(end => end <= ev.s);
        if (lane === -1) { lane = laneEnds.length; laneEnds.push(ev.e); } else laneEnds[lane] = ev.e;
        ev.lane = lane; cluster.push(ev);
        clusterEnd = Math.max(clusterEnd, ev.e);
    });
    if (cluster.length) flush();
    return out;
}

// Conflitos: participantes em comum com outra reunião no mesmo horário
function _conflicts(day, ini, fim, parts, skipId, skipKey) {
    const P = (parts || []).map(String);
    if (!P.length) return [];
    const a = _minutes(ini), b = _minutes(fim);
    return _occurrences(day, day).filter(o => {
        if (o.status === 'cancelada') return false;
        if (String(o.base.id) === String(skipId) && (skipKey == null || o.date === skipKey || !_isRecurring(o.base))) return false;
        const s = _minutes(o.r.horaInicio), e = _minutes(o.r.horaFim);
        if (!(a < e && s < b)) return false;
        return (o.r.participantes || []).some(p => P.includes(String(p)));
    }).map(o => ({ o, who: (o.r.participantes || []).filter(p => P.includes(String(p))).map(_userName) }));
}
function _conflictText(list) {
    return list.slice(0, 3).map(c => `<b>${_esc(c.who.join(', '))}</b> já tem “${_esc(c.o.r.titulo)}” (${_esc(c.o.r.horaInicio)}–${_esc(c.o.r.horaFim)})`).join('<br>')
        + (list.length > 3 ? `<br>+${list.length - 3} conflito(s)` : '');
}
function _confirmConflicts(list) {
    if (!list.length) return Promise.resolve(true);
    return new Promise(res => {
        if (typeof window._showConfirmDialog !== 'function') return res(true);
        let done = false;
        window._showConfirmDialog({
            title: 'Conflito de horário', message: _conflictText(list) + '<br><br>Salvar mesmo assim?',
            confirmLabel: 'Salvar mesmo assim', icon: 'fa-calendar-xmark', onConfirm: () => { done = true; res(true); }
        });
        // Cancelar/fechar: o diálogo é removido do DOM sem chamar onConfirm
        const iv = setInterval(() => { if (!document.getElementById('_confirmDlgOverlay')) { clearInterval(iv); if (!done) res(false); } }, 150);
    });
}

// Diálogo "Apenas este / Este e os seguintes / Todos"
function _askScope(title, opts) {
    opts = opts || {};
    return new Promise(res => {
        const el = document.createElement('div');
        el.className = 'reu-overlay reu-overlay--top open';
        el.style.zIndex = '10300';   // acima de popovers e da reunião
        el.innerHTML = `<div class="reu-modal reu-modal--scope">
            <div class="reu-modal-head"><h3><i class="fas fa-repeat"></i> ${_esc(title)}</h3></div>
            <div class="reu-modal-body">
                ${[['one', 'Apenas este evento', 'Altera só a ocorrência selecionada.'],
                   ['future', 'Este e os eventos seguintes', 'Divide a série a partir desta data.'],
                   ['all', 'Todos os eventos', 'Altera a série inteira.']].filter(x => !(opts.hide || []).includes(x[0])).map(([k, l, d], i) => `
                <label class="reu-scope"><input type="radio" name="reuScope" value="${k}" ${i === 0 ? 'checked' : ''}><span><b>${l}</b><small>${d}</small></span></label>`).join('')}
            </div>
            <div class="reu-modal-foot"><span style="flex:1"></span>
                <button class="reu-btn" data-act="cancel">Cancelar</button>
                <button class="reu-btn reu-btn--pri" data-act="ok">OK</button></div></div>`;
        const close = v => { el.remove(); document.removeEventListener('keydown', onKey, true); res(v); };
        const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); } if (e.key === 'Enter') { e.preventDefault(); el.querySelector('[data-act=ok]').click(); } };
        el.addEventListener('click', e => {
            const a = e.target.closest('[data-act]');
            if (!a) return;
            close(a.dataset.act === 'ok' ? el.querySelector('input[name=reuScope]:checked').value : null);
        });
        document.addEventListener('keydown', onKey, true);
        document.body.appendChild(el);
    });
}

// Desfazer: guarda o estado das reuniões afetadas e restaura
function _snapshot(ids) { const s = {}; ids.forEach(id => { s[id] = _data[id] ? _clean(_data[id]) : null; }); return s; }
function _showUndo(msg, snap) {
    let el = document.getElementById('reuUndo');
    if (el) el.remove();
    el = document.createElement('div');
    el.id = 'reuUndo'; el.className = 'reu-undo';
    el.innerHTML = `<i class="fas fa-circle-check"></i><span>${msg}</span><button>Desfazer</button><i class="fas fa-times reu-undo-x"></i>`;
    document.body.appendChild(el);
    const t = setTimeout(() => el.remove(), 7000);
    el.querySelector('.reu-undo-x').onclick = () => { clearTimeout(t); el.remove(); };
    el.querySelector('button').onclick = () => {
        clearTimeout(t); el.remove();
        Object.keys(snap).forEach(id => _commit('reunioes/' + id, snap[id]));
        _flush('Desfazendo…').then(ok => { if (ok) _toast('Alteração desfeita.', 'info'); });
    };
}

// Remapeia chaves de exceção (YYYY-MM-DD) deslocando `delta` dias
function _shiftExc(exc, delta, filter) {
    const out = {};
    Object.keys(exc || {}).forEach(k => {
        if (filter && !filter(k)) return;
        const e = _clean(exc[k]);
        if (e.ov && e.ov.data) e.ov.data = _addDays(e.ov.data, delta);
        out[delta ? _addDays(k, delta) : k] = e;
    });
    return out;
}
function _shiftRec(rec, delta) {
    const r2 = _clean(rec || {});
    if (delta && r2.tipo === 'semanal' && r2.diasSemana && r2.diasSemana.length) r2.diasSemana = r2.diasSemana.map(d => ((Number(d) + delta) % 7 + 7) % 7);
    return r2;
}

// Aplica uma alteração (campos `ch`, incluindo data/horaInicio/horaFim) a uma
// ocorrência `key` da reunião `id`, conforme o escopo. Devolve o id resultante.
function _applyScoped(id, key, ch, scope) {
    const r = _data[id];
    const o = _occ(r, key);
    const now = Date.now();
    if (!_isRecurring(r) || scope === 'all') {
        const next = _clean(r);
        if (_isRecurring(r)) {
            const delta = ch.data ? _dayDiff(o.day, ch.data) : 0;
            if (delta) {
                next.data = _addDays(r.data, delta);
                next.recorrencia = _shiftRec(r.recorrencia, delta);
                if (next.recorrencia.ate) next.recorrencia.ate = _addDays(next.recorrencia.ate, delta);
                next.excecoes = _shiftExc(r.excecoes, delta);
            }
            const c2 = Object.assign({}, ch); delete c2.data;
            Object.assign(next, c2);
        } else Object.assign(next, ch);
        next.atualizadoEm = now;
        _commit('reunioes/' + id, _clean(next));
        return id;
    }
    if (scope === 'one') {
        const exc = _clean((r.excecoes && r.excecoes[key]) || {});
        const ov = Object.assign({}, exc.ov || {}, ch);
        if (ov.data === key) delete ov.data;
        ['horaInicio', 'horaFim'].forEach(k => { if (ov[k] === r[k]) delete ov[k]; });
        exc.ov = ov;
        _commit('reunioes/' + id + '/excecoes/' + key, _clean(exc));
        return id;
    }
    // scope === 'future' → divide a série
    if (key <= r.data) return _applyScoped(id, key, ch, 'all');
    const newId = _uid('reu_');
    const delta = ch.data ? _dayDiff(o.day, ch.data) : 0;
    const head = _clean(r);
    head.recorrencia = Object.assign({}, head.recorrencia, { ate: _addDays(key, -1) });
    head.excecoes = _shiftExc(r.excecoes, 0, k => k < key);
    head.atualizadoEm = now;
    const tail = _clean(r);
    const c2 = Object.assign({}, ch); delete c2.data;
    Object.assign(tail, c2, {
        id: newId, data: _addDays(key, delta), criadoEm: now, atualizadoEm: now, serieOrigem: r.serieOrigem || r.id,
        recorrencia: Object.assign(_shiftRec(c2.recorrencia || r.recorrencia, delta), { ate: (r.recorrencia.ate ? _addDays(r.recorrencia.ate, delta) : null) }),
        excecoes: _shiftExc(r.excecoes, delta, k => k >= key)
    });
    if (ch.recorrencia) tail.recorrencia = Object.assign(_clean(ch.recorrencia), { ate: ch.recorrencia.ate || null });
    _commit('reunioes/' + id, _clean(head));
    _commit('reunioes/' + newId, _clean(tail));
    return newId;
}

// Fluxo completo de mover (arrastar): escopo → conflitos → grava → desfazer
async function _commitMove(id, key, day, ini, fim) {
    const r = _data[id];
    if (!r) return;
    const o = _occ(r, key);
    if (o.day === day && o.r.horaInicio === ini && o.r.horaFim === fim) { _renderMain(); return; }
    let scope = 'all';
    if (_isRecurring(r)) {
        scope = await _askScope('Mover reunião recorrente');
        if (!scope) { _renderMain(); return; }
    }
    const conf = _conflicts(day, ini, fim, o.r.participantes, id, scope === 'one' ? key : null);
    const snapIds = Object.keys(_data).filter(k => k === id);
    const snap = _snapshot(snapIds);
    const before = new Set(Object.keys(_data));
    _applyScoped(id, key, { data: day, horaInicio: ini, horaFim: fim }, scope);
    Object.keys(_data).forEach(k => { if (!before.has(k)) snap[k] = null; });
    if (!(await _flush('Movendo reunião…'))) return;
    _showUndo(`“${_esc(o.r.titulo)}” movida para ${_fmtDate(day).slice(0, 5)} · ${ini}–${fim}`, snap);
    if (conf.length) _toast('⚠ Conflito: ' + conf.map(c => c.who.join(', ') + ' em “' + c.o.r.titulo + '”').join('; '), 'error');
}

// --- Pointer: grade (semana/dia) --------------------------------------------------
function _colAt(x, y) {
    const el = document.elementFromPoint(x, y);
    return el && el.closest ? el.closest('.reu-tg-col') : null;
}
function _minAt(col, y) { return (y - col.getBoundingClientRect().top) / SLOT_PX * 60; }

function _onGridDown(e) {
    if (e.button !== 0) return;
    const evEl = e.target.closest('.reu-tg-ev');
    const col = e.target.closest('.reu-tg-col');
    if (!col) return;
    if (evEl) {
        const id = evEl.dataset.id, key = evEl.dataset.key;
        const r = _data[id];
        const o = r && _occ(r, key);
        if (!o) return;
        const resize = !!e.target.closest('.reu-tg-rs');
        _drag = {
            kind: resize ? 'resize' : 'move', el: evEl, id, key, ed: evEl.dataset.ed === '1',
            x0: e.clientX, y0: e.clientY, moved: false,
            ini: _minutes(o.r.horaInicio), fim: _minutes(o.r.horaFim), day: o.day,
            grab: _minAt(col, e.clientY) - _minutes(o.r.horaInicio)
        };
    } else {
        if (!_me()) return;
        _drag = { kind: 'create', col, day: col.dataset.day, x0: e.clientX, y0: e.clientY, moved: false, start: _snap(_minAt(col, e.clientY) - 7) };
    }
    document.addEventListener('pointermove', _onGridMove);
    document.addEventListener('pointerup', _onGridUp, { once: true });
}
function _onGridMove(e) {
    const d = _drag;
    if (!d) return;
    if (!d.moved && Math.abs(e.clientX - d.x0) + Math.abs(e.clientY - d.y0) < 5) return;
    if (!d.moved) {
        d.moved = true;
        if (d.kind !== 'create' && !d.ed) { d.kind = 'none'; return; }
        document.body.classList.add('reu-dragging');
        if (d.el) d.el.classList.add('is-drag');
    }
    if (d.kind === 'none') return;
    if (d.kind === 'create') {
        const m = _snap(_minAt(d.col, e.clientY));
        const a = Math.min(d.start, m), b = Math.max(d.start + SNAP_MIN, m);
        if (!d.box) { d.box = document.createElement('div'); d.box.className = 'reu-tg-sel'; d.col.appendChild(d.box); }
        d.a = a; d.b = b;
        d.box.style.top = (a / 60 * SLOT_PX) + 'px';
        d.box.style.height = ((b - a) / 60 * SLOT_PX) + 'px';
        d.box.textContent = _hm(a) + ' – ' + _hm(b);
        return;
    }
    if (d.kind === 'resize') {
        const col = d.el.parentElement;
        const m = Math.max(d.ini + SNAP_MIN, _snap(_minAt(col, e.clientY)));
        d.nFim = Math.min(24 * 60, m); d.nIni = d.ini; d.nDay = d.day;
    } else {
        const col = _colAt(e.clientX, e.clientY) || d.el.parentElement;
        const dur = d.fim - d.ini;
        let s = _snap(_minAt(col, e.clientY) - d.grab);
        s = Math.max(0, Math.min(24 * 60 - dur, s));
        d.nIni = s; d.nFim = s + dur; d.nDay = col.dataset.day;
        if (d.el.parentElement !== col) col.appendChild(d.el);
        d.el.style.left = '3px'; d.el.style.width = 'calc(100% - 6px)';
    }
    d.el.style.top = (d.nIni / 60 * SLOT_PX) + 'px';
    d.el.style.height = Math.max(20, (d.nFim - d.nIni) / 60 * SLOT_PX - 2) + 'px';
    const lbl = d.el.querySelector('span');
    if (lbl) lbl.textContent = _hm(d.nIni) + '–' + _hm(d.nFim);
}
function _onGridUp() {
    document.removeEventListener('pointermove', _onGridMove);
    document.body.classList.remove('reu-dragging');
    const d = _drag; _drag = null;
    if (!d) return;
    if (d.kind === 'create') {
        if (d.box) d.box.remove();
        if (d.moved && d.a != null) reuOpenForm(null, d.day, _hm(d.a), _hm(d.b));
        else reuOpenForm(null, d.day, _hm(Math.floor(d.start / 60) * 60));
        return;
    }
    if (!d.moved || d.kind === 'none') { reuOpen(d.id, d.key); return; }
    if (d.nDay == null) { _renderMain(); return; }
    _commitMove(d.id, d.key, d.nDay, _hm(d.nIni), _hm(d.nFim));
}

// --- Pointer: mês -------------------------------------------------------------------
function _onMonthDown(e) {
    if (e.button !== 0) return;
    const evEl = e.target.closest('.reu-ev');
    if (!evEl) return;
    e.stopPropagation();
    _drag = { kind: 'month', el: evEl, id: evEl.dataset.id, key: evEl.dataset.key, ed: evEl.dataset.ed === '1', x0: e.clientX, y0: e.clientY, moved: false };
    document.addEventListener('pointermove', _onMonthMove);
    document.addEventListener('pointerup', _onMonthUp, { once: true });
}
function _onMonthMove(e) {
    const d = _drag;
    if (!d) return;
    if (!d.moved && Math.abs(e.clientX - d.x0) + Math.abs(e.clientY - d.y0) < 5) return;
    if (!d.moved) {
        d.moved = true;
        if (!d.ed) { d.kind = 'none'; return; }
        d.ghost = d.el.cloneNode(true);
        d.ghost.className += ' reu-ghost';
        d.ghost.style.width = d.el.offsetWidth + 'px';
        document.body.appendChild(d.ghost);
        d.el.classList.add('is-drag');
        document.body.classList.add('reu-dragging');
    }
    if (d.kind === 'none') return;
    d.ghost.style.left = (e.clientX + 8) + 'px';
    d.ghost.style.top = (e.clientY + 8) + 'px';
    d.ghost.style.display = 'none';
    const t = document.elementFromPoint(e.clientX, e.clientY);
    d.ghost.style.display = '';
    const cell = t && t.closest ? t.closest('.reu-md') : null;
    document.querySelectorAll('.reu-md.is-over').forEach(c => { if (c !== cell) c.classList.remove('is-over'); });
    if (cell) cell.classList.add('is-over');
    d.target = cell ? cell.dataset.day : null;
}
function _onMonthUp() {
    document.removeEventListener('pointermove', _onMonthMove);
    document.body.classList.remove('reu-dragging');
    document.querySelectorAll('.reu-md.is-over').forEach(c => c.classList.remove('is-over'));
    const d = _drag; _drag = null;
    if (!d) return;
    if (d.ghost) d.ghost.remove();
    if (!d.moved || d.kind === 'none') { reuOpen(d.id, d.key); return; }
    if (d.el) d.el.classList.remove('is-drag');
    if (!d.target) return;
    const o = _occ(_data[d.id], d.key);
    _commitMove(d.id, d.key, d.target, o.r.horaInicio, o.r.horaFim);
}

// --- Mini-calendário ------------------------------------------------------------------
function _miniHtml() {
    if (!_miniCursor) _miniCursor = _cursor.slice(0, 8) + '01';
    const c = _parse(_miniCursor);
    const first = new Date(c.getFullYear(), c.getMonth(), 1);
    const start = _addDays(_ds(first), -first.getDay());
    const occ = _occurrences(start, _addDays(start, 41));
    const has = new Set(occ.filter(o => o.status !== 'cancelada').map(o => o.day));
    const today = _today();
    let ws = _cursor, we = _cursor;
    if (_view === 'semana') { ws = _addDays(_cursor, -_parse(_cursor).getDay()); we = _addDays(ws, 6); }
    let h = `<div class="reu-mini-head"><button onclick="reuMiniNav(-1)"><i class="fas fa-chevron-left"></i></button><b>${MONTHS[c.getMonth()]} ${c.getFullYear()}</b><button onclick="reuMiniNav(1)"><i class="fas fa-chevron-right"></i></button></div>
        <div class="reu-mini-grid">${WEEK.map(w => `<span class="reu-mini-wd">${w[0]}</span>`).join('')}`;
    for (let i = 0; i < 42; i++) {
        const s = _addDays(start, i), d = _parse(s);
        const cls = [d.getMonth() !== c.getMonth() ? 'out' : '', s === today ? 'today' : '', (_view !== 'mes' && s >= ws && s <= we) ? 'sel' : '', has.has(s) ? 'has' : ''].join(' ');
        h += `<button class="reu-mini-d ${cls} ${s === _selDay ? 'is-pick' : ''}" data-day="${s}" onclick="reuMiniPick('${s}')">${d.getDate()}</button>`;
    }
    return h + '</div>';
}
function reuMiniNav(dir) { const c = _parse(_miniCursor); c.setMonth(c.getMonth() + dir); _miniCursor = _ds(c).slice(0, 8) + '01'; const m = document.getElementById('reuMini'); if (m) m.innerHTML = _miniHtml(); }
function reuMiniPick(s) { _cursor = s; if (_view === 'lista') _view = 'dia'; _renderMain(); }



// Badge de reuniões de hoje (minhas) no botão da sidebar
function _refreshBadge() {
    _refreshBell();
    const btn = document.getElementById('tabReunioes');
    if (!btn) return;
    let b = btn.querySelector('.reu-badge');
    const today = _today();
    const n = _occurrences(today, today).filter(o => o.status === 'agendada' && _isMine(o.r)).length;
    if (!n) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('span'); b.className = 'reu-badge'; btn.appendChild(b); }
    b.textContent = n;
    b.title = n + ' reunião(ões) hoje';
}

// ---------------------------------------------------------------------------
// Formulário (criar/editar)
// ---------------------------------------------------------------------------
function _ensureFormModal() {
    if (document.getElementById('reuFormModal')) return;
    const el = document.createElement('div');
    el.id = 'reuFormModal';
    el.className = 'reu-overlay';
    document.body.appendChild(el);
}

let _formKey = null;          // ocorrência (chave) editada quando a série é recorrente
function reuOpenForm(id, date, hora, horaFim) {
    if (!_me()) { _toast('Faça login para criar reuniões.', 'error'); return; }
    const r = id ? _data[id] : null;
    if (!id && !_canEdit(null)) { _toast('Você não tem permissão para criar reuniões.', 'error'); return; }
    if (id && !_canEdit(r)) { _toast('Você não tem permissão para editar esta reunião.', 'error'); return; }
    if (id && _open && _open.id === id && _dirty) { _toast('Salve ou descarte as alterações da reunião antes de editar.', 'error'); return; }
    _editId = id || null;
    _formKey = null;
    const ini = hora || '09:00';
    const fim = horaFim || (_pad(Math.min(23, Number(ini.split(':')[0]) + 1)) + ':' + ini.split(':')[1]);
    let src = r;
    if (r && _isRecurring(r)) {
        _formKey = (_open && _open.id === id) ? _open.date : r.data;
        const o = _occ(r, _formKey);
        src = Object.assign({}, o.r, { data: o.day });
    }
    _form = src ? JSON.parse(JSON.stringify(src)) : {
        titulo: '', descricao: '', cor: COLORS[0], data: date || _today(), horaInicio: ini, horaFim: fim,
        recorrencia: { tipo: 'nenhuma', intervalo: 1, diasSemana: [], ate: null },
        lembreteMin: 15, meetUrl: '', participantes: [_me().id], vinculos: [], status: 'agendada'
    };
    if (!_form.recorrencia) _form.recorrencia = { tipo: 'nenhuma', intervalo: 1, diasSemana: [], ate: null };
    if (!_form.participantes) _form.participantes = [];
    if (!_form.vinculos) _form.vinculos = [];
    _ensureFormModal();
    _renderForm();
    document.getElementById('reuFormModal').classList.add('open');
    setTimeout(() => { const t = document.getElementById('reuFTitulo'); if (t) t.focus(); }, 50);
}

function _renderForm() {
    const f = _form, rec = f.recorrencia;
    const usersHtml = _formPartsHtml();
    const linksHtml = f.vinculos.map((v, i) => _linkChip(v, `reuFormRemoveLink(${i})`)).join('');
    document.getElementById('reuFormModal').innerHTML = `
    <div class="reu-modal">
        <div class="reu-modal-head">
            <h3><i class="fas fa-calendar-plus"></i> ${_editId ? 'Editar reunião' : 'Nova reunião'}</h3>
            <span style="flex:1"></span><button class="reu-icon-btn" title="Fechar" onclick="reuCloseForm()"><i class="fas fa-times"></i></button>
        </div>
        <div class="reu-modal-body">
            <label class="reu-f"><span>Título *</span><input id="reuFTitulo" value="${_esc(f.titulo)}" placeholder="Ex.: Análise da RNC #12" oninput="reuF('titulo',this.value)"></label>
            <div class="reu-row">
                <label class="reu-f"><span>Data *</span><input type="date" value="${_esc(f.data)}" onchange="reuF('data',this.value)"></label>
                <label class="reu-f"><span>Início *</span><input type="time" value="${_esc(f.horaInicio)}" onchange="reuF('horaInicio',this.value)"></label>
                <label class="reu-f"><span>Fim *</span><input type="time" value="${_esc(f.horaFim)}" onchange="reuF('horaFim',this.value)"></label>
            </div>
            <div class="reu-row">
                <label class="reu-f"><span>Recorrência</span>
                    <select onchange="reuFRec('tipo',this.value)">
                        ${[['nenhuma', 'Não repete'], ['diaria', 'Diária'], ['semanal', 'Semanal'], ['mensal', 'Mensal']].map(([k, l]) => `<option value="${k}" ${rec.tipo === k ? 'selected' : ''}>${l}</option>`).join('')}
                    </select></label>
                <label class="reu-f"><span>Lembrete</span>
                    <select onchange="reuF('lembreteMin',Number(this.value)||null)">
                        ${[[0, 'Sem lembrete'], [5, '5 min antes'], [15, '15 min antes'], [30, '30 min antes'], [60, '1 hora antes'], [1440, '1 dia antes']].map(([k, l]) => `<option value="${k}" ${(f.lembreteMin || 0) === k ? 'selected' : ''}>${l}</option>`).join('')}
                    </select></label>
            </div>
            ${rec.tipo !== 'nenhuma' ? `
            <div class="reu-rec-box">
                <div class="reu-row">
                    <label class="reu-f"><span>Repetir a cada</span><input type="number" min="1" max="30" value="${Number(rec.intervalo) || 1}" onchange="reuFRec('intervalo',Math.max(1,Number(this.value)||1))"></label>
                    <label class="reu-f"><span>Até (opcional)</span><input type="date" value="${_esc(rec.ate || '')}" onchange="reuFRec('ate',this.value||null)"></label>
                </div>
                ${rec.tipo === 'semanal' ? `<div class="reu-f"><span>Dias da semana</span><div class="reu-wd">${WEEK.map((w, i) => {
                    const on = (rec.diasSemana && rec.diasSemana.length ? rec.diasSemana.map(Number) : [_parse(f.data).getDay()]).includes(i);
                    return `<button type="button" class="${on ? 'on' : ''}" onclick="reuFToggleWd(${i})">${w.slice(0, 1)}</button>`;
                }).join('')}</div></div>` : ''}
            </div>` : ''}
            <label class="reu-f"><span><i class="fas fa-video" style="color:#0f9d58"></i> Link do Google Meet</span>
                <input id="reuFMeet" value="${_esc(f.meetUrl || '')}" placeholder="https://meet.google.com/xxx-xxxx-xxx" oninput="reuF('meetUrl',this.value.trim());reuMeetHint()">
                <small id="reuMeetHint" class="reu-hint"></small>
                <small class="reu-muted">Crie a sala em <a href="https://meet.google.com/new" target="_blank" rel="noopener">meet.google.com/new</a> e cole o link aqui.</small>
            </label>
            <div class="reu-f"><span>Participantes <small class="reu-muted" id="reuFPartN">(${f.participantes.length})</small></span><div class="reu-pchips" id="reuFPart">${usersHtml}</div></div>
            <div class="reu-f"><span>Vínculos</span><div class="reu-links">${linksHtml}<button type="button" class="reu-chip reu-chip--add" onclick="reuOpenLinkPicker('form')"><i class="fas fa-link"></i> Vincular card</button></div></div>
            <label class="reu-f"><span>Descrição</span><textarea rows="3" placeholder="Objetivo da reunião..." oninput="reuF('descricao',this.value)">${_esc(f.descricao || '')}</textarea></label>
            <div class="reu-f"><span>Cor</span><div class="reu-colors">${COLORS.map(c => `<button type="button" class="${f.cor === c ? 'on' : ''}" style="background:${c}" onclick="reuF('cor','${c}');reuRerenderForm()"></button>`).join('')}</div></div>
        </div>
        <div class="reu-modal-foot">
            ${_editId ? `<button class="reu-btn reu-btn--danger" onclick="reuDelete('${_esc(_editId)}')"><i class="fas fa-trash"></i> Excluir</button>` : ''}
            <span style="flex:1"></span>
            <button class="reu-btn" onclick="reuCloseForm()">Cancelar</button>
            <button class="reu-btn reu-btn--pri" id="reuFSave" onclick="reuSaveForm()"><i class="fas fa-check"></i> Salvar</button>
        </div>
    </div>`;
    reuMeetHint();
}

function reuF(k, v) { _form[k] = v; }
function reuFRec(k, v) { _form.recorrencia[k] = v; if (k === 'tipo') _renderForm(); }
function reuFToggleWd(i) {
    const rec = _form.recorrencia;
    let d = rec.diasSemana && rec.diasSemana.length ? rec.diasSemana.map(Number) : [_parse(_form.data).getDay()];
    d = d.includes(i) ? d.filter(x => x !== i) : d.concat(i).sort();
    rec.diasSemana = d;
    _renderForm();
}
// Chips resumidos: primeiro nome + inicial do último; até 8 visíveis e "+N" para ver todos
let _formPartsAll = false;
const _nomeCurto = n => { const p = String(n || '').trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : (p[0] || ''); };
function _formPartsHtml() {
    const ids = (_form && _form.participantes || []).map(String).sort((a, b) => _userName(a).localeCompare(_userName(b), 'pt-BR'));
    const LIM = 8, ver = _formPartsAll ? ids : ids.slice(0, LIM);
    const nome = s => _esc(s.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase()));
    return ver.map(id => `<span class="reu-pchip reu-pchip--sm on" title="${_esc(_userName(id))}">${_avatar(id)}${nome(_nomeCurto(_userName(id)))}<i class="fas fa-times reu-chip-x" onclick="reuFormToggleUser('${_esc(id)}')"></i></span>`).join('')
        + (ids.length > LIM ? `<button type="button" class="reu-chip reu-pchip-more" onclick="reuFormPartsAll()">${_formPartsAll ? '<i class="fas fa-chevron-up"></i> Mostrar menos' : `+${ids.length - LIM} pessoas`}</button>` : '')
        + `<button type="button" class="reu-chip reu-chip--add" onclick="reuFormPopUsers(this)"><i class="fas fa-user-plus"></i> Adicionar</button>`
        + (ids.length > 1 ? `<button type="button" class="reu-chip reu-pchip-clear" title="Remover todos" onclick="reuFormPartsClear()"><i class="fas fa-user-xmark"></i></button>` : '');
}
function _refreshFormParts() {
    const box = document.getElementById('reuFPart'); if (box) box.innerHTML = _formPartsHtml();
    const n = document.getElementById('reuFPartN'); if (n) n.textContent = `(${_form.participantes.length})`;
}
function reuFormPartsAll() { _formPartsAll = !_formPartsAll; _refreshFormParts(); }
async function reuFormPartsClear() {
    if (!_form || !_form.participantes.length) return;
    if (!(await _confirmBox({ titulo: 'Remover todos os participantes?', icone: 'fa-user-xmark', perigo: true, ok: 'Remover todos', html: `Os ${_form.participantes.length} participantes saem da lista. Você pode adicionar de novo antes de salvar.` }))) return;
    _form.participantes = []; _refreshFormParts();
}
function reuFormToggleUser(id) {
    const p = _form.participantes.map(String);
    _form.participantes = p.includes(String(id)) ? p.filter(x => x !== String(id)) : p.concat(String(id));
    _renderForm();
}
function reuFormPopUsers(btn) {
    _userPop(btn, { title: 'Participantes', selected: _form.participantes.slice(), multi: true, lotes: true, lotesAll: true, onPick: id => {
        const p = _form.participantes.map(String);
        _form.participantes = p.includes(String(id)) ? p.filter(x => x !== String(id)) : p.concat(String(id));
        _refreshFormParts();
    } });
}
function reuFormRemoveLink(i) { _form.vinculos.splice(i, 1); _renderForm(); }
function reuRerenderForm() { _renderForm(); }
function reuMeetHint() {
    const el = document.getElementById('reuMeetHint');
    if (!el) return;
    const v = (_form && _form.meetUrl) || '';
    el.textContent = v && !MEET_RE.test(v) ? '⚠ Link não parece ser do Google Meet (será salvo mesmo assim).' : '';
}
function reuCloseForm() {
    const m = document.getElementById('reuFormModal');
    if (m) m.classList.remove('open');
    _form = null; _editId = null;
}

async function reuSaveForm() {
    const f = _form;
    if (!f) return;
    if (!f.titulo || !f.titulo.trim()) { _toast('Informe o título da reunião.', 'error'); return; }
    if (!f.data || !f.horaInicio || !f.horaFim) { _toast('Informe data e horário.', 'error'); return; }
    if (_minutes(f.horaFim) <= _minutes(f.horaInicio)) { _toast('O horário de fim deve ser depois do início.', 'error'); return; }
    if (f.recorrencia.tipo !== 'nenhuma' && f.recorrencia.ate && f.recorrencia.ate < f.data) { _toast('A data "até" deve ser depois da data inicial.', 'error'); return; }
    const me = _me();
    const now = Date.now();
    const editId = _editId, key = _formKey;
    const orig = editId ? _data[editId] : null;
    const origParts = orig ? (orig.participantes || []).map(String) : [];
    const rec = { tipo: f.recorrencia.tipo, intervalo: Number(f.recorrencia.intervalo) || 1, diasSemana: f.recorrencia.diasSemana || [], ate: f.recorrencia.ate || null };
    const fields = {
        titulo: f.titulo.trim(), descricao: f.descricao || '', cor: f.cor || COLORS[0],
        data: f.data, horaInicio: f.horaInicio, horaFim: f.horaFim,
        lembreteMin: f.lembreteMin || null, meetUrl: f.meetUrl || '', participantes: f.participantes || []
    };

    // Escopo da alteração em série recorrente
    let scope = 'all';
    if (orig && _isRecurring(orig) && key) {
        scope = await _askScope('Editar reunião recorrente');
        if (!scope) return;
    }
    // Conflitos de agenda dos participantes
    const conf = _conflicts(f.data, f.horaInicio, f.horaFim, fields.participantes, editId, scope === 'one' ? key : null);
    if (!(await _confirmConflicts(conf))) return;

    const btn = document.getElementById('reuFSave');
    const setBusy = on => { if (!btn) return; btn.disabled = on; btn.innerHTML = on ? '<i class="fas fa-spinner fa-spin"></i> Salvando…' : '<i class="fas fa-check"></i> Salvar'; };
    setBusy(true);
    try {
        let id = editId;
        if (!editId) {
            id = _uid('reu_');
            _commit('reunioes/' + id, _clean(Object.assign({ id, criadoPor: me.id, criadoEm: now, status: 'agendada', topicos: {}, excecoes: {} },
                fields, { recorrencia: rec, vinculos: f.vinculos || [], atualizadoEm: now })));
            _notifyAdded([], fields.participantes, id, f.data, fields.titulo);
            if (!(await _flush('Criando reunião…'))) { setBusy(false); return; }
            _toast('Reunião criada.', 'success');
        } else if (!_isRecurring(orig) || !key) {
            _commit('reunioes/' + id, Object.assign({}, fields, { recorrencia: rec, vinculos: f.vinculos || [], atualizadoEm: now }), true);
            _notifyAdded(origParts, fields.participantes, id, f.data, fields.titulo);
            if (!(await _flush('Salvando reunião…'))) { setBusy(false); return; }
            if (_open && _open.id === id) _openSnap = _clean(_data[id]);
            _toast('Reunião atualizada.', 'success');
        } else {
            const snap = _snapshot([id]);
            const before = new Set(Object.keys(_data));
            if (scope === 'one') {
                _applyScoped(id, key, fields, 'one');
                _commit('reunioes/' + id + '/vinculos', f.vinculos || []);
            } else {
                id = _applyScoped(id, key, Object.assign({}, fields, { recorrencia: rec, vinculos: f.vinculos || [] }), scope);
            }
            Object.keys(_data).forEach(k => { if (!before.has(k)) snap[k] = null; });
            _notifyAdded(origParts, fields.participantes, id, key, fields.titulo);
            if (!(await _flush('Salvando reunião…'))) { setBusy(false); return; }
            if (_open && _data[_open.id]) _openSnap = _clean(_data[_open.id]);
            _showUndo(scope === 'one' ? 'Ocorrência atualizada.' : (scope === 'future' ? 'Série dividida: esta e as próximas atualizadas.' : 'Todas as ocorrências atualizadas.'), snap);
        }
        reuCloseForm();
        if (!_open || _open.id !== id || scope !== 'all') {
            let tries = 0;
            const openWhenReady = () => {
                const r2 = _data[id];
                if (r2) reuOpen(id, scope === 'one' ? key : (_isRecurring(r2) ? (r2.data > f.data ? r2.data : f.data) : f.data));
                else if (++tries < 20) setTimeout(openWhenReady, 150);
            };
            openWhenReady();
        }
    } catch (e) { _fail(e); setBusy(false); }
}

async function reuDelete(id) {
    const r = _data[id];
    if (!r) return;
    const key = (_open && _open.id === id) ? _open.date : null;
    if (_isRecurring(r) && key) {
        const scope = await _askScope('Excluir reunião recorrente');
        if (!scope) return;
        const snap = _snapshot([id]);
        if (scope === 'all' || (scope === 'future' && key <= r.data)) _commit('reunioes/' + id, null);
        else if (scope === 'one') _commit('reunioes/' + id + '/excecoes/' + key, { excluida: true });
        else {
            const next = _clean(r);
            next.recorrencia.ate = _addDays(key, -1);
            next.excecoes = _shiftExc(r.excecoes, 0, k => k < key);
            _commit('reunioes/' + id, next);
        }
        if (!(await _flush('Excluindo…'))) return;
        reuCloseForm(); reuCloseDetail(true);
        _showUndo(scope === 'one' ? 'Ocorrência excluída.' : (scope === 'future' ? 'Esta e as próximas ocorrências excluídas.' : 'Série excluída.'), snap);
        return;
    }
    const go = async () => {
        try {
            _commit('reunioes/' + id, null);
            if (!(await _flush('Excluindo reunião…'))) return;
            _toast('Reunião excluída.', 'success');
            reuCloseForm();
            reuCloseDetail(true);
        } catch (e) { _fail(e); }
    };
    if (typeof window._showConfirmDialog === 'function') {
        window._showConfirmDialog({
            title: 'Excluir reunião?',
            message: `"${_esc(r.titulo)}"${_isRecurring(r) ? ' e todas as suas repetições' : ''} serão excluídas, incluindo pauta e ata.`,
            confirmLabel: 'Excluir', confirmClass: 'confirm-dlg-btn--danger', icon: 'fa-trash',
            iconClass: 'confirm-dlg-icon--danger', onConfirm: go
        });
    } else go();
}

// ---------------------------------------------------------------------------
// Detalhe — modal amplo com subabas (Pauta/Ata · Ações · Detalhes · Vínculos)
// Atualização otimista: aplica a alteração no estado local, re-renderiza na hora
// e grava no Firebase em seguida (o listener confirma/corrige depois).
// ---------------------------------------------------------------------------
let _tab = 'pauta';
let _actFilter = { st: 'pend', who: '', mk: '' };
let _saving = 0;
let _saveErr = false;
const PRESENCA = {
    p: { label: 'Presente',    short: 'P', cls: 'is-p' },
    a: { label: 'Ausente',     short: 'A', cls: 'is-a' },
    j: { label: 'Justificado', short: 'J', cls: 'is-j' }
};

const _SHORTCUTS = [
    ['Adicionar', [['Shift + Enter', 'nova linha abaixo, do mesmo tipo'], ['Ctrl + Enter', 'nova tarefa abaixo'], ['Alt + Enter', 'novo tópico'], ['Enter', 'quebra de linha no texto (mantém o marcador)']]],
    ['Linha', [['End', 'marcar / desmarcar tarefa'], ['Shift + End', 'alternar texto ↔ tarefa'], ['Shift + ↑ / ↓', 'mover para cima / baixo'], ['Shift + →', 'virar subitem'], ['Shift + ←', 'subir nível'], ['Tab / Shift + Tab', 'marcador • no texto (mais / menos nível)'], ['Shift + Del', 'excluir item'], ['Backspace (vazio)', 'excluir linha vazia'], ['↑ / ↓', 'navegar entre linhas'], ['Ctrl + M', 'marcadores']]],
    ['Geral', [['Ctrl + Z', 'desfazer'], ['Ctrl + Shift + Z / Ctrl + Y', 'refazer']]]
];
function reuShowShortcuts(btn) {
    const el = _openPop(btn, `<div class="reu-kbd">
        <div class="reu-kbd-head"><b><i class="fas fa-keyboard"></i> Atalhos de teclado</b><span style="flex:1"></span><button class="reu-icon-btn" onclick="reuClosePop()"><i class="fas fa-times"></i></button></div>
        ${_SHORTCUTS.map(([g, list]) => `<div class="reu-kbd-sec">${g}</div>` + list.map(([k, d]) => `<div class="reu-kbd-row"><span>${k.split(' / ').map(x => x.split(' + ').map(y => `<kbd>${_esc(y)}</kbd>`).join('+')).join(' / ')}</span><small>${_esc(d)}</small></div>`).join('')).join('')}
    </div>`, 'reu-pop--kbd');
    const r = btn.getBoundingClientRect();
    el.style.left = Math.max(10, r.right - el.offsetWidth) + 'px';
    el.style.top = Math.max(10, r.top - el.offsetHeight - 8) + 'px';
}
function _ensureDrawer() {
    if (document.getElementById('reuDrawer')) return;
    const bk = document.createElement('div');
    bk.id = 'reuDrawerBk'; bk.className = 'reu-drawer-bk';
    const el = document.createElement('div');
    el.id = 'reuDrawer'; el.className = 'reu-x';
    el.setAttribute('role', 'dialog');
    document.body.appendChild(bk);
    document.body.appendChild(el);
}

function reuOpen(id, date) {
    const r = _data[id];
    if (!r) { _toast('Reunião não encontrada.', 'error'); return; }
    if (_open && _dirty && _open.id !== id) { _toast('Salve ou descarte as alterações da reunião aberta antes.', 'error'); return; }
    if (!date || !_occursOn(r, date)) {
        date = r.data;
        if (_isRecurring(r)) {
            const t = _today();
            for (let i = 0, s = t > r.data ? t : r.data; i < 400; i++, s = _addDays(s, 1)) {
                if (_occursOn(r, s)) { date = s; break; }
            }
        }
    }
    if (!_open || _open.id !== id) { _histReset(); _tab = 'pauta'; _dirty = false; _sessUploads = []; _pendDel = []; _openSnap = _clean(r); }
    _open = { id, date };
    _ensureDrawer();
    _renderDetail();
    document.getElementById('reuDrawer').classList.add('open');
    document.getElementById('reuDrawerBk').classList.add('open');
}
function reuCloseDetail(force) {
    if (_dirty && !force) {
        if (typeof window._showConfirmDialog === 'function') {
            window._showConfirmDialog({ title: 'Alterações não salvas', message: 'Você tem alterações que ainda não foram salvas. Deseja descartá-las e fechar?',
                confirmLabel: 'Descartar e fechar', confirmClass: 'confirm-dlg-btn--danger', icon: 'fa-floppy-disk', onConfirm: () => { reuDetailDiscard(); reuCloseDetail(true); } });
        }
        return;
    }
    if (_dirty) reuDetailDiscard();
    _closePop();
    _open = null;
    const d = document.getElementById('reuDrawer'), b = document.getElementById('reuDrawerBk');
    if (d) d.classList.remove('open');
    if (b) b.classList.remove('open');
}
function reuTab(t) { _tab = t; _closePop(); _renderDetail(); const b = document.querySelector('#reuDrawer .reu-x-body'); if (b) b.scrollTop = 0; }

function _sortedTopics(topicos) {
    return Object.keys(topicos || {}).map(k => Object.assign({ _id: k }, topicos[k]))
        .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
}
function _sortedItems(itens) {
    return Object.keys(itens || {}).map(k => Object.assign({ _id: k }, itens[k]))
        .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
}
function _linkChip(v, removeFn) {
    const a = _area(v.area);
    return `<span class="reu-chip" style="--c:${a.color}" onclick="reuOpenLinked('${v.area}','${_esc(v.id)}')" title="Abrir ${_esc(a.label)}">
        <i class="fas ${a.icon}"></i><span><small>${_esc(a.label)}</small> ${_esc(v.titulo || '#' + v.id)}</span>
        ${removeFn ? `<i class="fas fa-times reu-chip-x" onclick="event.stopPropagation();${removeFn}"></i>` : ''}</span>`;
}
// Vínculos dentro de tópicos/blocos (array `vinculos` no próprio nó)
function _nodeLinks(path, node, ed) { return (node.vinculos || []).map((v, i) => _linkChip(v, ed ? `reuRemoveNodeLink('${path}',${i})` : '')).join(''); }
function reuRemoveNodeLink(path, i) {
    if (!_guard(path)) return;
    const v = ((_getAt(path) || {}).vinculos || []).slice(); v.splice(i, 1);
    _write(path + '/vinculos', v);
}
function _avatar(id, cls) {
    const n = _userName(id);
    return `<span class="reu-av ${cls || ''}" title="${_esc(n)}">${_esc(_initials(n))}</span>`;
}
function _avStack(ids, max) {
    const list = (ids || []).slice(0, max || 5).map(id => _avatar(id)).join('');
    const extra = (ids || []).length - (max || 5);
    return `<span class="reu-avs">${list}${extra > 0 ? `<span class="reu-av reu-av--more">+${extra}</span>` : ''}</span>`;
}
function _isOverdue(it) { return it.prazo && !it.checked && it.prazo < _today(); }

// --- Estado local + gravação -------------------------------------------------
function _applyLocal(path, val) {
    const ks = path.split('/').slice(1); // remove 'reunioes'
    let o = _data;
    for (let i = 0; i < ks.length - 1; i++) {
        if (o[ks[i]] == null || typeof o[ks[i]] !== 'object') o[ks[i]] = {};
        o = o[ks[i]];
    }
    const last = ks[ks.length - 1];
    if (val === null || val === undefined) delete o[last];
    else o[last] = (typeof val === 'object') ? JSON.parse(JSON.stringify(val)) : val;
}
function _setSaveInd() {
    return; // indicador agora é renderizado no cabeçalho (rascunho / salvo)
    const el = document.getElementById('reuSaveInd');
    if (!el) return;
    if (_saving > 0) { el.className = 'reu-save is-saving'; el.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Salvando…'; }
    else if (_saveErr) { el.className = 'reu-save is-err'; el.innerHTML = '<i class="fas fa-triangle-exclamation"></i> Erro ao salvar'; }
    else { el.className = 'reu-save is-ok'; el.innerHTML = '<i class="fas fa-check"></i> Salvo'; }
}
// Rascunho do detalhe: nada é gravado até clicar em "Salvar".
let _dirty = false;          // há alterações não salvas na reunião aberta
let _openSnap = null;        // cópia da reunião ao abrir/salvar (para descartar)
let _sessUploads = [];       // arquivos enviados nesta edição (apagar se descartar)
let _pendDel = [];           // anexos removidos no rascunho (apagar só ao salvar)
let _pending = [];           // gravações reais aguardando confirmação do banco

function _withTimeout(p, ms) {
    return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('Tempo esgotado ao salvar. Verifique a conexão.')), ms || 20000))]);
}
function _applyPatch(path, val, patch) {
    if (patch) Object.keys(val).forEach(k => _applyLocal(path + '/' + k, val[k]));
    else _applyLocal(path, val);
}
function _rerender() {
    _renderDetail();
    if (typeof currentTab !== 'undefined' && currentTab === 'reunioes') _renderMain();
}
// Gravação real no Firebase (fora do rascunho). A promessa entra em _pending
// e _flush() espera o banco confirmar exibindo o carregamento.
function _commit(path, val, patch) {
    _applyPatch(path, val, patch);
    _rerender();
    const pr = _withTimeout(patch ? _update(path, val) : _set(path, val));
    _pending.push(pr);
    pr.catch(() => {});
    return pr;
}
async function _flush(msg) {
    const list = _pending.splice(0);
    if (!list.length) return true;
    if (typeof window.showGlobalLoading === 'function') window.showGlobalLoading(msg || 'Salvando no banco de dados…');
    try { await Promise.all(list); return true; }
    catch (e) { _fail(e); return false; }
    finally { if (typeof window.hideGlobalLoading === 'function') window.hideGlobalLoading(); }
}
// Alteração feita na reunião aberta → só no rascunho local; demais → gravação real
// Histórico do rascunho (Ctrl+Z / Ctrl+Y)
let _hist = [], _redo = [];
function _histReset() { _hist = []; _redo = []; }
function _histStep(back) {
    if (!_open) return false;
    const from = back ? _hist : _redo, to = back ? _redo : _hist;
    if (!from.length) return false;
    to.push(_clean(_data[_open.id]));
    _data[_open.id] = from.pop();
    _dirty = JSON.stringify(_data[_open.id]) !== JSON.stringify(_openSnap);
    _rerender();
    return true;
}
document.addEventListener('keydown', e => {
    if (!_open || !(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k !== 'z' && k !== 'y') return;
    const d = document.getElementById('reuDrawer');
    if (!d || !d.classList.contains('open') || document.querySelector('.reu-overlay.open')) return;
    const t = e.target;
    // texto sendo digitado e ainda não confirmado → desfazer nativo do campo
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && t.defaultValue !== undefined && t.value !== t.defaultValue) return;
    const back = k === 'z' && !e.shiftKey;
    if (_histStep(back)) { e.preventDefault(); e.stopPropagation(); }
}, true);
function _write(path, val, patch) {
    if (_open && path.indexOf('reunioes/' + _open.id) === 0) {
        const fm = path.slice(('reunioes/' + _open.id).length).match(/^\/([^/]+)/);
        const r0 = _data[_open.id];
        if (fm && !['excecoes', 'topicos'].includes(fm[1]) && _isRecurring(r0)) {
            const ov = ((r0.excecoes || {})[_open.date] || {}).ov;
            if (ov) delete ov[fm[1]];
        }
        _hist.push(_clean(_data[_open.id])); if (_hist.length > 100) _hist.shift(); _redo = [];
        _applyPatch(path, val, patch);
        _dirty = true;
        _rerender();
        return Promise.resolve();
    }
    return _commit(path, val, patch);
}
function _deleteStored(a) {
    if (!a) return;
    if (a.blobId && typeof window._deleteImgBlob === 'function') window._deleteImgBlob(a.blobId);
    if (a.fileId && typeof driveDelete === 'function') driveDelete(a.fileId).catch(() => {});
}
const _SERIES_SKIP = ['mkDefs', 'topicosModelo', 'excecoes', 'atualizadoEm', 'id', 'criadoEm', 'criadoPor', 'serieOrigem', 'data', 'horaInicio', 'horaFim', 'recorrencia', 'topicos'];
const _FIELD_LABEL = { titulo: 'título', descricao: 'descrição', cor: 'cor', participantes: 'participantes', vinculos: 'vínculos', anexos: 'anexos', meetUrl: 'link do Meet', status: 'status', lembreteMin: 'lembrete', presenca: 'presença', topicosModelo: 'modelo da pauta' };
function _baseDiff(a, b) {
    const ch = {};
    new Set(Object.keys(a || {}).concat(Object.keys(b || {}))).forEach(k => {
        if (_SERIES_SKIP.includes(k)) return;
        const va = a[k] === undefined ? null : a[k], vb = b[k] === undefined ? null : b[k];
        if (JSON.stringify(va) !== JSON.stringify(vb)) ch[k] = vb;
    });
    return ch;
}
// Pauta sem checks/anexos para servir de modelo às próximas ocorrências
function _tplFrom(topicos) {
    const t = _clean(topicos || {});
    Object.values(t).forEach(tp => { delete tp.anexos; Object.values(tp.itens || {}).forEach(it => { it.checked = false; delete it.anexos; }); });
    return t;
}
// Diálogo de salvar: escopo (série) + notificar participantes
function _askSave(opts) {
    return new Promise(res => {
        const el = document.createElement('div');
        el.className = 'reu-overlay reu-overlay--top open';
        el.style.zIndex = '10300';   // acima de popovers e da reunião
        const scopes = [['future', 'Esta e as próximas', 'Aplica a partir de ' + _fmtDate(opts.day) + (opts.pauta ? '. A pauta é espelhada nas próximas; as anteriores não mudam.' : '.')],
            ['one', 'Apenas esta ocorrência', 'As alterações valem só para ' + _fmtDate(opts.day) + '.']];
        if (opts.base) scopes.push(['all', 'Todas as ocorrências', 'Aplica à série inteira' + (opts.pauta ? ' (pauta: atas anteriores preservadas).' : '.')]);
        el.innerHTML = `<div class="reu-modal reu-modal--scope">
            <div class="reu-modal-head"><h3><i class="fas fa-floppy-disk"></i> Salvar alterações</h3></div>
            <div class="reu-modal-body">
                <p class="reu-save-sum">Alterado: <b>${_esc(opts.resumo || '—')}</b></p>
                ${opts.rec ? scopes.map(([k, l, d], i) => `
                <label class="reu-scope"><input type="radio" name="reuScope" value="${k}" ${i === 0 ? 'checked' : ''}><span><b>${l}</b><small>${d}</small></span></label>`).join('') : ''}
                <label class="reu-notify ${opts.others ? '' : 'is-off'}"><span class="reu-notify-txt"><b><i class="fas fa-bell"></i> Notificar envolvidos</b><small>${opts.others ? `Avisa ${opts.others} pessoa${opts.others > 1 ? 's' : ''} (organizador, participantes e responsáveis) sobre as mudanças.` : 'Nenhuma outra pessoa envolvida nesta reunião.'}</small></span>
                    <input type="checkbox" name="reuNotify" ${opts.others ? 'checked' : 'disabled'}><span class="reu-switch"></span></label>
            </div>
            <div class="reu-modal-foot"><span style="flex:1"></span>
                <button class="reu-btn" data-act="cancel">Cancelar</button>
                <button class="reu-btn reu-btn--pri" data-act="ok"><i class="fas fa-check"></i> Salvar</button></div></div>`;
        const close = v => { el.remove(); document.removeEventListener('keydown', onKey, true); res(v); };
        const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); } };
        el.addEventListener('click', e => {
            const a = e.target.closest('[data-act]');
            if (!a) return;
            if (a.dataset.act !== 'ok') return close(null);
            const sc = el.querySelector('input[name=reuScope]:checked'), nt = el.querySelector('input[name=reuNotify]');
            close({ scope: sc ? sc.value : 'all', notify: !!(nt && nt.checked) });
        });
        document.addEventListener('keydown', onKey, true);
        document.body.appendChild(el);
    });
}
// Espelha a pauta desta ocorrência nas próximas: congela as anteriores com o
// modelo antigo, limpa pautas próprias das futuras e grava o novo modelo.
function _propagatePauta(sid, key, topicos) {
    const r = _data[sid]; if (!r) return;
    const exc = r.excecoes || {}, old = r.topicosModelo;
    if (old) for (let d = r.data, g = 0; d < key && g < 1500; d = _addDays(d, 1), g++) {
        if (_occursOn(r, d) && !(exc[d] && (exc[d].topicos || exc[d].excluida))) _commit('reunioes/' + sid + '/excecoes/' + d + '/topicos', _clean(old));
    }
    Object.keys(exc).forEach(d => { if (d > key && exc[d] && exc[d].topicos) _commit('reunioes/' + sid + '/excecoes/' + d + '/topicos', null); });
    _commit('reunioes/' + sid + '/topicosModelo', _tplFrom(topicos));
}
async function reuDetailSave() {
    if (!_open || !_dirty) return;
    const id = _open.id, key = _open.date, me = _me();
    const cur = _clean(_data[id]), snap = _openSnap || {};
    const rec = _isRecurring(cur);
    const ch = _baseDiff(snap, cur);
    const excOf = o => (o.excecoes || {})[key] || null;
    const pautaOf = o => JSON.stringify(rec ? ((excOf(o) || {}).topicos || null) : (o.topicos || null));
    const pauta = pautaOf(snap) !== pautaOf(cur);
    const parts = Object.keys(ch).map(k => _FIELD_LABEL[k] || k);
    if (pauta) parts.unshift('pauta');
    if (rec && !pauta && JSON.stringify(excOf(snap)) !== JSON.stringify(excOf(cur))) parts.push('ocorrência');
    const resumo = [...new Set(parts)].join(', ');
    const inv = new Set((cur.participantes || []).map(String));
    if (cur.criadoPor) inv.add(String(cur.criadoPor));
    const addResp = tps => Object.values(tps || {}).forEach(t => { if (!t) return; (t.resp || []).forEach(u => inv.add(String(u))); Object.values(t.itens || {}).forEach(it => _resps(it).forEach(u => inv.add(u))); });
    addResp(rec ? (excOf(cur) || {}).topicos : cur.topicos); addResp(cur.topicosModelo);
    const others = [...inv].filter(x => x && (!me || x !== me.id));
    const ans = await _askSave({ rec, day: key, pauta, base: Object.keys(ch).length > 0, others: others.length, resumo });
    if (!ans) return;
    let finalId = id;
    _dirty = false;
    const rollback = () => { _pending.splice(0); _dirty = true; _data[id] = cur; _rerender(); };
    try {
        if (!rec) {
            cur.atualizadoEm = Date.now();
            _commit('reunioes/' + id, _clean(cur));
        } else {
            const restored = _clean(snap);
            restored.excecoes = _clean(cur.excecoes || {});
            // Organizador e co-organizadores valem para a reunião toda (não por ocorrência):
            // aplica direto na série e limpa cópias antigas nas exceções.
            if (cur.criadoPor) restored.criadoPor = cur.criadoPor;
            if (cur.coOrg && Object.keys(cur.coOrg).length) restored.coOrg = _clean(cur.coOrg); else delete restored.coOrg;
            if (cur.mkDefs && Object.keys(cur.mkDefs).length) restored.mkDefs = _clean(cur.mkDefs); else delete restored.mkDefs;
            const mkMudou = JSON.stringify(snap.mkDefs || null) !== JSON.stringify(cur.mkDefs || null);
            Object.values(restored.excecoes).forEach(e => { if (e && e.ov) { delete e.ov.coOrg; delete e.ov.criadoPor; } });
            const donoMudou = String(snap.criadoPor || '') !== String(cur.criadoPor || '') || JSON.stringify(snap.coOrg || null) !== JSON.stringify(cur.coOrg || null);
            _data[id] = restored;
            const c2 = Object.assign({}, ch);
            delete c2.coOrg;
            if (Object.keys(c2).length) {
                if (ans.scope !== 'one') { const e = restored.excecoes[key]; if (e && e.ov) Object.keys(c2).forEach(k => delete e.ov[k]); }
                finalId = _applyScoped(id, key, c2, ans.scope);
            } else {
                restored.atualizadoEm = Date.now();
                _commit('reunioes/' + id, _clean(restored));
            }
            // Com outras mudanças em escopo, garante que dono/co-organizadores também foram gravados na série
            if (Object.keys(c2).length && (donoMudou || mkMudou)) {
                const up = { criadoPor: restored.criadoPor || null, coOrg: restored.coOrg || null, mkDefs: restored.mkDefs || null };
                Object.keys(restored.excecoes || {}).forEach(k => { up['excecoes/' + k + '/ov/coOrg'] = null; up['excecoes/' + k + '/ov/criadoPor'] = null; });
                _commit('reunioes/' + id, up, true);
            }
            if (pauta && ans.scope !== 'one') _propagatePauta(finalId, key, (excOf(cur) || {}).topicos);
        }
        if (ans.notify && others.length) {
            const base = _data[finalId] || cur;
            const av = { tipo: 'edit', reuId: finalId, data: key, titulo: _occ(base, key).r.titulo || '', por: me ? me.id : '', porNome: me ? me.name : '', em: Date.now(), resumo };
            others.forEach(uid => _commit('reunioesAvisos/' + uid + '/' + _uid('av'), av));
        }
        _notifyAdded(snap.participantes, cur.participantes, finalId, key, cur.titulo);
        const ok = await _flush('Salvando reunião…');
        if (!ok) { rollback(); return; }
        _pendDel.forEach(_deleteStored);
        _pendDel = []; _sessUploads = []; _histReset();
        if (finalId !== id) _open.id = finalId;
        _openSnap = _clean(_data[_open.id]);
        _renderDetail();
        _toast('Reunião salva' + (ans.notify && others.length ? ' · participantes notificados.' : '.'), 'success');
    } catch (e) { rollback(); _fail(e); }
}
function reuDetailDiscard() {
    if (!_open) return;
    _sessUploads.forEach(_deleteStored);
    _sessUploads = []; _pendDel = []; _histReset();
    if (_openSnap) _data[_open.id] = _clean(_openSnap);
    _dirty = false;
    _rerender();
}

// --- Popovers -------------------------------------------------------------------
let _pop = null, _popCfg = null;
function _openPop(anchor, html, cls) {
    _closePop();
    const el = document.createElement('div');
    el.className = 'reu-pop ' + (cls || '');
    el.innerHTML = html;
    document.body.appendChild(el);
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth, h = el.offsetHeight;
    let left = Math.min(r.left, window.innerWidth - w - 10);
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - 10) top = Math.max(10, r.top - h - 6);
    el.style.left = Math.max(10, left) + 'px';
    el.style.top = top + 'px';
    _pop = el;
    setTimeout(() => document.addEventListener('mousedown', _popOutside), 0);
    const inp = el.querySelector('input[data-autofocus]');
    if (inp) setTimeout(() => inp.focus(), 30);
    return el;
}
function _popOutside(e) { if (_pop && !_pop.contains(e.target)) _closePop(); }
function _closePop() {
    if (_pop) { _pop.remove(); _pop = null; }
    _popCfg = null;
    document.removeEventListener('mousedown', _popOutside);
}
function _menuHtml(items) {
    return items.map(it => it === '-' ? '<div class="reu-pop-sep"></div>' :
        `<button class="reu-pop-it ${it.danger ? 'is-danger' : ''} ${it.on ? 'is-on' : ''}" onclick="${it.fn}"><i class="fas ${it.icon}" ${it.color ? `style="color:${it.color}"` : ''}></i><span>${_esc(it.label)}</span>${it.on ? '<i class="fas fa-check reu-pop-check"></i>' : ''}</button>`).join('');
}

// Popover de usuários (busca + seleção simples ou múltipla)
//   cfg: { title, selected:[ids], multi, first:[ids], allowNone, onPick(id) }
function _userPop(anchor, cfg) {
    _openPop(anchor, `<div class="reu-pop-title">${_esc(cfg.title || 'Usuários')}</div>
        <input class="reu-pop-search" data-autofocus placeholder="Buscar..." oninput="reuPopSearch(this.value)">
        <div class="reu-pop-list" id="reuPopList"></div>`, 'reu-pop--users');
    _popCfg = Object.assign({ q: '' }, cfg);
    _renderUserPopList();
}
function _renderUserPopList() {
    const box = document.getElementById('reuPopList');
    if (!box || !_popCfg) return;
    const c = _popCfg;
    const first = (c.first || []).map(String);
    let list = _users().map(u => ({ id: String(u.id), name: u.name || u.user || '' }));
    // only: só participantes (+ quem já está selecionado, para poder desmarcar)
    if (c.only) list = list.filter(u => first.includes(u.id) || (c.selected || []).map(String).includes(u.id));
    list.sort((a, b) => (first.includes(b.id) - first.includes(a.id)) || a.name.localeCompare(b.name));
    const q = (typeof normalizeText === 'function') ? normalizeText(c.q) : c.q.toLowerCase();
    if (q) list = list.filter(u => ((typeof normalizeText === 'function') ? normalizeText(u.name) : u.name.toLowerCase()).includes(q));
    const sel = (c.selected || []).map(String);
    let html = '';
    // Unidades (setor do RH) e grupos, só com os participantes da reunião
    if (c.lotes) {
        if (typeof window._carregarContasDados === 'function' && !_popLotesPedido) { _popLotesPedido = true; try { Promise.resolve(window._carregarContasDados()).then(() => _renderUserPopList()).catch(() => {}); } catch (_) {} }
        const base = c.lotesAll ? _users() : _users().filter(u => first.includes(String(u.id)));
        const nq = x => (typeof normalizeText === 'function') ? normalizeText(x) : String(x).toLowerCase();
        _popLotes = { setor: _lotesDe(base, _setorDoUser), grupo: _lotesDe(base, _grupoDoUser) };
        const sec = (tipo, ic, tit) => {
            const ls = _popLotes[tipo].map((l, i) => [l, i]).filter(x => !q || nq(x[0][0]).includes(q));
            if (!ls.length) return '';
            return `<div class="reu-pop-sec">${tit}</div>` + ls.map(x => {
                const nome = x[0][0], ids = x[0][1], i = x[1];
                const n = ids.filter(id => sel.includes(id)).length, todos = n === ids.length;
                return `<button class="reu-pop-it ${todos ? 'is-on' : ''}" onclick="reuPopPickLote('${tipo}',${i})">
                    <span class="reu-pop-cb ${todos ? 'on' : ''}">${todos ? '<i class="fas fa-check"></i>' : n ? '<i class="fas fa-minus"></i>' : ''}</span>
                    <span class="reu-av reu-av--none"><i class="fas ${ic}"></i></span><span>${_esc(nome)}</span><small class="reu-muted">${ids.length}</small></button>`;
            }).join('');
        };
        html += sec('setor', 'fa-building', 'Unidades') + sec('grupo', 'fa-users', 'Grupos');
        if (html) html += '<div class="reu-pop-sec">Pessoas</div>';
    }
    html += c.allowNone ? `<button class="reu-pop-it ${!sel.length ? 'is-on' : ''}" onclick="reuPopPick('')"><span class="reu-av reu-av--none"><i class="fas fa-user-slash"></i></span><span>Sem responsável</span></button>` : '';
    html += list.slice(0, 60).map(u => {
        const on = sel.includes(u.id);
        return `<button class="reu-pop-it ${on ? 'is-on' : ''}" onclick="reuPopPick('${_esc(u.id)}')">
            ${c.multi ? `<span class="reu-pop-cb ${on ? 'on' : ''}">${on ? '<i class="fas fa-check"></i>' : ''}</span>` : ''}
            ${_avatar(u.id)}<span>${_esc(u.name)}</span>
            ${first.includes(u.id) && !c.multi && !c.only ? '<small class="reu-muted">participante</small>' : ''}</button>`;
    }).join('') || `<div class="reu-side-empty">${c.only ? 'Nenhum participante encontrado. Adicione participantes em Detalhes.' : 'Nenhum usuário encontrado.'}</div>`;
    box.innerHTML = html;
}
let _popLotes = { setor: [], grupo: [] }, _popLotesPedido = false;
function _setorDoUser(u) { try { const c = typeof window._contaDados === 'function' ? window._contaDados(u.dadosLogin) : null; return String((c && c.unidade) || '').trim(); } catch (_) { return ''; } }
function _grupoDoUser(u) { try { const g = (u.grupoId && typeof getUserGroup === 'function') ? getUserGroup(u.grupoId) : null; return String((g && g.name) || u.grupo || '').trim(); } catch (_) { return ''; } }
function _lotesDe(us, fn) {
    const m = new Map();
    us.forEach(u => { const k = fn(u); if (!k) return; if (!m.has(k)) m.set(k, []); m.get(k).push(String(u.id)); });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
}
// Clicar numa unidade/grupo marca todos dela (ou desmarca, se todos já estavam)
function reuPopPickLote(tipo, i) {
    const c = _popCfg; const l = (_popLotes[tipo] || [])[i];
    if (!c || !l) return;
    const sel = (c.selected || []).map(String), ids = l[1];
    const todos = ids.every(id => sel.includes(id));
    ids.filter(id => todos ? sel.includes(id) : !sel.includes(id)).forEach(id => reuPopPick(id));
}
function reuPopSearch(q) { if (_popCfg) { _popCfg.q = q || ''; _renderUserPopList(); } }
function reuPopPick(id) {
    if (!_popCfg) return;
    const c = _popCfg;
    c.onPick(id);
    if (c.multi) {
        const s = (c.selected || []).map(String);
        c.selected = !id ? [] : s.includes(String(id)) ? s.filter(x => x !== String(id)) : s.concat(String(id));
        _renderUserPopList();
    } else _closePop();
}

// --- Render ----------------------------------------------------------------------
function _cur() { return _open && _data[_open.id]; }
function _topicOf(path) { const m = String(path || '').match(/^(.*\/topicos\/[^/]+)/); return m ? m[1] : null; }
// Responsável por um tópico pode editar os blocos daquele tópico
function _isTopicResp(path) {
    const me = _me(), tp = _topicOf(path), t = tp && _getAt(tp);
    if (!me || !t) return false;
    if ((t.resp || []).map(String).includes(me.id)) return true;
    const m = String(path).slice(tp.length).match(/^\/itens\/([^/]+)/);
    const itens = t.itens || {};
    for (let id = m && m[1], g = 0; id && itens[id] && g < 10; id = itens[id].pai, g++) if (_resps(itens[id]).includes(me.id)) return true;
    return false;
}
function _guard(path) { const r = _cur(); if (r && (_canEdit(r) || (path && _isTopicResp(path)))) return r; _toast('Sem permissão para editar.', 'error'); return null; }
// Ocorrência sem pauta própria → copia o modelo da série para o rascunho
function _materialize() {
    const r = _open && _data[_open.id];
    if (!r || !_isRecurring(r) || !r.topicosModelo) return;
    const fill = o => { if (!o) return; o.excecoes = o.excecoes || {}; const e = o.excecoes[_open.date] = o.excecoes[_open.date] || {}; if (!e.topicos) e.topicos = _clean(r.topicosModelo); };
    const e0 = (r.excecoes || {})[_open.date];
    if (e0 && e0.topicos) return;
    fill(r); if (_openSnap && _openSnap.id === r.id) fill(_openSnap);
}
function _renderDetail() {
    _materialize();
    const box = document.getElementById('reuDrawer');
    if (!box || !_open) return;
    const r = _data[_open.id];
    if (!r) return;
    // Preserva foco, seleção, texto digitado e rolagem entre re-renderizações
    const act = document.activeElement;
    const fk = act && box.contains(act) && act.dataset ? act.dataset.fk : null;
    const typed = fk ? act.value : null;
    let sel = null;
    try { if (fk && act.selectionStart != null) sel = [act.selectionStart, act.selectionEnd]; } catch (_) {}
    const bodyEl = box.querySelector('.reu-x-body');
    const scroll = bodyEl ? bodyEl.scrollTop : 0;

    box.innerHTML = _detailHtml(r);

    const nb = box.querySelector('.reu-x-body');
    if (nb) nb.scrollTop = scroll;
    if (fk) {
        const el = box.querySelector(`[data-fk="${fk}"]`);
        if (el) {
            if (typed != null && el.value !== typed) el.value = typed;
            el.focus();
            try { if (sel) el.setSelectionRange(sel[0], sel[1]); } catch (_) {}
        }
    }
    box.querySelectorAll('textarea.reu-autogrow').forEach(_autogrow);
    _setSaveInd();
}
// Altura = só as linhas com texto. Medir com o campo ainda sem largura (drawer abrindo,
// aba oculta) dava uma altura enorme; espera ter largura e remede quando a largura muda.
const _agRO = typeof ResizeObserver === 'function' ? new ResizeObserver(es => es.forEach(e => {
    const t = e.target, w = Math.round(e.contentRect.width);
    if (w && t._agW !== w) { t._agW = w; _autogrow(t, 1); }
})) : null;
function _autogrow(t, tent) {
    if (!t) return;
    if (_agRO && !t._agObs) { t._agObs = true; _agRO.observe(t); }
    if (!t.isConnected || t.clientWidth < 60) {
        if ((tent || 0) < 20) requestAnimationFrame(() => _autogrow(t, (tent || 0) + 1));
        return;
    }
    t.style.height = 'auto';
    t.style.height = Math.max(t.classList.contains('reu-in') ? 44 : 26, t.scrollHeight + 2) + 'px';
}

// Privacidade da pauta: quem não organiza nem participa só vê o que é seu. Tópico em que é
// responsável aparece inteiro; item em que é responsável aparece com seus subitens e os
// itens-pai (contexto da árvore). O resto da pauta fica oculto.
function _pautaPrivada(o) {
    const me = _me();
    if (!me) return Object.assign({}, o, { topicos: {} });
    const out = {};
    Object.entries(o.topicos || {}).forEach(([tid, t]) => {
        if (!t) return;
        if ((t.resp || []).map(String).includes(me.id)) { out[tid] = t; return; }
        const itens = t.itens || {}, keep = new Set();
        Object.keys(itens).forEach(id => {
            if (!itens[id] || !_resps(itens[id]).includes(me.id)) return;
            keep.add(id);
            _descIds(itens, id).forEach(d => keep.add(d));
            for (let p = itens[id].pai, g = 0; p && itens[p] && g < 20; p = itens[p].pai, g++) keep.add(p);
        });
        if (!keep.size) return;
        const it2 = {};
        keep.forEach(id => { it2[id] = itens[id]; });
        out[tid] = Object.assign({}, t, { itens: it2, texto: '', anexos: {}, vinculos: [] });
    });
    return Object.assign({}, o, { topicos: out });
}

function _detailHtml(r) {
    let o = _occ(r, _open.date);
    r = o.r;
    const st = STATUS[o.status] || STATUS.agendada;
    const ed = _canEdit(r);
    const org = _isOrg(r);
    if (!org) o = _pautaPrivada(o);   // pauta oculta: só organizador/co vê tudo
    const topics = _sortedTopics(o.topicos);
    const items = _allItems(o);
    const done = items.filter(x => x.it.checked).length;
    const pend = items.length - done;
    const nLinks = (r.vinculos || []).length;

    let body = '';
    if (_tab === 'pauta') body = _tabPauta(r, o, ed && org, topics);
    else if (_tab === 'acoes') body = _tabAcoes(r, o, ed && org, items);
    else if (_tab === 'detalhes') body = _tabDetalhes(r, o, ed);
    else if (_tab === 'anexos') body = _tabAnexos(r, o, ed);
    else body = _tabVinculos(r, ed);

    return `
    <button class="reu-kbd-btn" title="Atalhos de teclado" onclick="reuShowShortcuts(this)"><i class="fas fa-keyboard"></i></button>
    <div class="reu-x-head" style="--c:${_esc(r.cor || COLORS[0])}">
        <div class="reu-x-row">
            <button class="reu-st reu-st--btn ${st.cls}" ${ed ? `onclick="reuPopStatus(this)"` : 'disabled'} title="${ed ? 'Alterar status' : ''}"><i class="fas ${st.icon}"></i> ${st.label}${ed ? ' <i class="fas fa-chevron-down reu-caret"></i>' : ''}</button>
            ${_isRecurring(r) ? `<span class="reu-occ-tag" title="Esta é uma ocorrência de uma série"><i class="fas fa-repeat"></i> Ocorrência de ${_fmtDate(o.day)}</span>` : ''}
            ${_dirty ? '<span class="reu-save is-dirty"><i class="fas fa-circle"></i> Alterações não salvas</span>' : '<span class="reu-save is-ok"><i class="fas fa-check"></i> Salvo</span>'}
            <span style="flex:1"></span>
            ${_dirty ? `<button class="reu-btn" onclick="reuDetailDiscard()"><i class="fas fa-rotate-left"></i> Descartar</button>
                        <button class="reu-btn reu-btn--pri" onclick="reuDetailSave()"><i class="fas fa-check"></i> Salvar</button>` : ''}
            ${r.meetUrl ? `<a class="reu-x-meet" href="${_esc(r.meetUrl)}" target="_blank" rel="noopener" title="${_esc(r.meetUrl)}"><i class="fas fa-video"></i> Entrar no Meet</a>`
                        : (ed && _isOrg(r) ? `<button class="reu-x-meet reu-x-meet--empty" onclick="reuPopMeet(this)"><i class="fas fa-video"></i> Adicionar Meet</button>` : '')}
            <button class="reu-icon-btn" title="Mais ações" onclick="reuPopMenu(this)"><i class="fas fa-ellipsis"></i></button>
            <button class="reu-icon-btn" title="Fechar" onclick="reuCloseDetail()"><i class="fas fa-times"></i></button>
        </div>
        <h2 class="reu-x-title">${_esc(r.titulo)}</h2>
        <div class="reu-x-meta">
            <span class="reu-meta"><i class="fas fa-calendar"></i> ${_fmtLong(o.day)}${o.day !== _open.date ? ' <em>(movida)</em>' : ''}</span>
            <span class="reu-meta"><i class="fas fa-clock"></i> ${_esc(r.horaInicio)}–${_esc(r.horaFim)} <em>${_duration(r)}</em></span>
            <span class="reu-meta"><i class="fas fa-repeat"></i> ${_esc(_recLabel(r))}</span>
            <button class="reu-meta reu-meta--btn" ${ed ? 'onclick="reuPopLembrete(this)"' : 'disabled'}><i class="fas fa-bell"></i> ${_esc(_lembLabel(r.lembreteMin))}</button>
            <button class="reu-meta reu-meta--btn" onclick="reuTab('detalhes')" title="Participantes">${_avStack(r.participantes, 5)} ${(r.participantes || []).length}</button>
        </div>
        <nav class="reu-x-tabs">
            <button class="${_tab === 'pauta' ? 'on' : ''}" onclick="reuTab('pauta')"><i class="fas fa-list-ol"></i> Pauta / Ata <b>${topics.length}</b></button>
            <button class="${_tab === 'acoes' ? 'on' : ''}" onclick="reuTab('acoes')"><i class="fas fa-list-check"></i> Ações <b class="${pend ? 'is-warn' : ''}">${pend}/${items.length}</b></button>
            <button class="${_tab === 'detalhes' ? 'on' : ''}" onclick="reuTab('detalhes')"><i class="fas fa-circle-info"></i> Detalhes</button>
            <button class="${_tab === 'vinculos' ? 'on' : ''}" onclick="reuTab('vinculos')"><i class="fas fa-link"></i> Vínculos <b>${nLinks}</b></button>
            <button class="${_tab === 'anexos' ? 'on' : ''}" onclick="reuTab('anexos')"><i class="fas fa-paperclip"></i> Anexos <b>${_allAnexos(r, o).length}</b></button>
        </nav>
    </div>
    <div class="reu-x-body">${body}</div>`;
}

// --- Blocos em árvore (tarefa | texto), até 3 níveis ------------------------------
const MAX_DEPTH = 3;
const MK_COLORS = ['#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#db2777', '#64748b'];
let _marcadores = {};        // /reunioesMarcadores/{id}: { nome, cor, ordem }
let _mkListener = null;
let _collapsed = new Set();  // ids de blocos recolhidos (por sessão)

function _isTask(it) { return (it.tipo || 'tarefa') === 'tarefa'; }
// Árvore de um tópico: [{ it, depth, children:[...] }]
function _tree(itens) {
    const all = _sortedItems(itens);
    const ids = new Set(all.map(i => i._id));
    const byPai = {};
    all.forEach(i => { const p = (i.pai && ids.has(i.pai)) ? i.pai : ''; (byPai[p] = byPai[p] || []).push(i); });
    const build = (pai, depth) => (byPai[pai] || []).map(it => ({ it, depth, children: build(it._id, depth + 1) }));
    return build('', 0);
}
function _flatTree(nodes, out) { out = out || []; nodes.forEach(n => { out.push(n); _flatTree(n.children, out); }); return out; }
function _descIds(itens, id) {
    const out = [];
    const walk = pid => Object.keys(itens || {}).forEach(k => { if (itens[k] && itens[k].pai === pid) { out.push(k); walk(k); } });
    walk(id);
    return out;
}
function _taskProgress(node) {
    const tasks = _flatTree(node.children).filter(n => _isTask(n.it));
    return tasks.length ? { done: tasks.filter(n => n.it.checked).length, total: tasks.length } : null;
}
function _depthOf(itens, id) { let d = 0, cur = itens[id]; while (cur && cur.pai && itens[cur.pai] && d < 10) { d++; cur = itens[cur.pai]; } return d; }

// Todas as tarefas da ocorrência (para Ações, ata, progresso)
function _allItems(o) {
    const out = [];
    _sortedTopics(o.topicos).forEach((t, ti) => {
        const itens = t.itens || {};
        _flatTree(_tree(itens)).forEach((n, ii) => {
            if (!_isTask(n.it)) return;
            const trail = [];
            let p = n.it.pai && itens[n.it.pai];
            while (p && trail.length < 5) { trail.unshift(p.texto || '…'); p = p.pai && itens[p.pai]; }
            out.push({ t, ti, it: n.it, ii, depth: n.depth, trail });
        });
    });
    return out;
}

// --- Marcadores (globais do módulo) -------------------------------------------------
function _startMkListener() {
    if (_mkListener || !window.firebaseOnValue || !_db()) return;
    _mkListener = window.firebaseOnValue(_ref('reunioesMarcadores'), snap => {
        _marcadores = (snap && snap.exists()) ? (snap.val() || {}) : {};
        if (_open) _renderDetail();
    });
}
// Marcadores são de cada reunião: reunioes/{id}/mkDefs/{mkId} = { nome, cor, ordem } (ou { del: true }).
// Os antigos globais (/reunioesMarcadores) só aparecem na reunião que já os usa, até serem editados nela.
function _mkDefsDe(r) {
    r = r || _cur();
    if (!r) return {};
    const out = {};
    const usados = JSON.stringify(r.topicos || {}) + JSON.stringify(r.topicosModelo || {}) + JSON.stringify(r.excecoes || {});
    Object.keys(_marcadores).forEach(k => { if (usados.includes('"' + k + '"')) out[k] = _marcadores[k]; });
    Object.entries(r.mkDefs || {}).forEach(([k, v]) => { if (v && v.del) delete out[k]; else if (v) out[k] = v; });
    return out;
}
function _mkDef(id, r) { return _mkDefsDe(r)[id] || null; }
function _mkList(r) { const d = _mkDefsDe(r); return Object.keys(d).map(k => Object.assign({ _id: k }, d[k])).sort((a, b) => (a.ordem || 0) - (b.ordem || 0)); }
function _mkSalvar(id, def) {   // grava a definição inteira na reunião aberta (rascunho)
    const r = _cur(); if (!r) return;
    _write('reunioes/' + r.id + '/mkDefs/' + id, def);
}
function _mkChips(ids) {
    return (ids || []).map(id => _mkDef(id)).filter(Boolean)
        .map(m => `<span class="reu-tag" style="--t:${_esc(m.cor)}">${_esc(m.nome)}</span>`).join('');
}
function reuPopMarcadores(btn, path) {
    const cur = path.split('/').reduce((o, k, i) => (i === 0 ? _data : o && o[k]), null) || {};
    _popCfg = { kind: 'mk', path, sel: (cur.marcadores || []).slice() };
    _openPop(btn, `<div class="reu-pop-title">Marcadores</div><div class="reu-pop-list" id="reuMkList"></div>
        <div class="reu-mk-new"><input class="reu-pop-search" id="reuMkNew" placeholder="Novo marcador + Enter" onkeydown="if(event.key==='Enter')reuMkCreate(this.value)"></div>`, 'reu-pop--users');
    _popCfg = { kind: 'mk', path, sel: (cur.marcadores || []).slice() };
    _renderMkList();
}
function _renderMkList() {
    const box = document.getElementById('reuMkList');
    if (!box || !_popCfg) return;
    const list = _mkList();
    box.innerHTML = list.map(m => {
        const on = _popCfg.sel.includes(m._id);
        return `<div class="reu-pop-it ${on ? 'is-on' : ''}" onclick="reuMkToggle('${m._id}')">
            <span class="reu-pop-cb ${on ? 'on' : ''}">${on ? '<i class="fas fa-check"></i>' : ''}</span>
            <button class="reu-mk-dot" style="background:${_esc(m.cor)}" title="Trocar cor" onclick="event.stopPropagation();reuMkColor('${m._id}')"></button>
            <span>${_esc(m.nome)}</span>
            <i class="fas fa-pen reu-mk-del reu-mk-ren" title="Renomear marcador" onclick="event.stopPropagation();reuMkRename('${m._id}')"></i>
            <i class="fas fa-trash-can reu-mk-del" title="Excluir marcador" onclick="event.stopPropagation();reuMkDelete('${m._id}')"></i></div>
            ${_mkPaleta === m._id ? `<div class="reu-mk-pal" onclick="event.stopPropagation()">
                ${MK_COLORS.map(c => `<button class="${c === m.cor ? 'on' : ''}" style="background:${c}" title="${c}" onclick="reuMkSetColor('${m._id}','${c}')"></button>`).join('')}
                <label class="reu-mk-pal-custom" title="Outra cor"><i class="fas fa-eye-dropper"></i><input type="color" value="${_esc(/^#[0-9a-f]{6}$/i.test(m.cor) ? m.cor : '#2563eb')}" onchange="reuMkSetColor('${m._id}',this.value)"></label>
            </div>` : ''}`;
    }).join('') || '<div class="reu-side-empty">Nenhum marcador. Crie um abaixo.</div>';
}
function reuMkToggle(id) {
    if (!_popCfg || !_guard(_popCfg.path)) return;
    const s = _popCfg.sel;
    _popCfg.sel = s.includes(id) ? s.filter(x => x !== id) : s.concat(id);
    _write(_popCfg.path + '/marcadores', _popCfg.sel.length ? _popCfg.sel : null);
    _renderMkList();
}
async function reuMkCreate(nome) {
    nome = String(nome || '').trim();
    if (!nome || !_popCfg) return;
    const id = _uid('mk');
    const cor = MK_COLORS[_mkList().length % MK_COLORS.length];
    if (_mkList().some(x => String(x.nome || '').toLowerCase() === nome.toLowerCase())) { _toast('Já existe um marcador com esse nome nesta reunião.', 'error'); return; }
    _mkSalvar(id, { nome, cor, ordem: Date.now() });
    const inp = document.getElementById('reuMkNew'); if (inp) inp.value = '';
    reuMkToggle(id);
}
// Clicar na bolinha abre/fecha a paleta daquele marcador
let _mkPaleta = null;
function reuMkColor(id) { _mkPaleta = _mkPaleta === id ? null : id; _renderMkList(); }
async function reuMkRename(id) {
    const m = _mkDef(id); if (!m) return;
    const v = await _promptBox({ titulo: 'Renomear marcador', icone: 'fa-tag', valor: m.nome || '', ok: 'Salvar' });
    const nome = (v || '').trim();
    if (!nome || nome === m.nome) return;
    if (_mkList().some(x => x._id !== id && String(x.nome || '').toLowerCase() === nome.toLowerCase())) { _toast('Já existe um marcador com esse nome.', 'error'); return; }
    _mkSalvar(id, Object.assign({}, m, { nome }));
    _renderMkList();
}
async function reuMkSetColor(id, cor) {
    const m = _mkDef(id); if (!m || !cor) return;
    _mkPaleta = null;
    _mkSalvar(id, Object.assign({}, m, { cor }));
    _renderMkList();
}
async function reuMkDelete(id) {
    // antigo global: marca como excluído só nesta reunião; próprio da reunião: apaga
    _mkSalvar(id, _marcadores[id] ? { del: true } : null);
    _renderMkList();
}

// --- Anexos (reunião, tópico, bloco) — mesmo pipeline dos cards ----------------------
function _anexosArr(obj) { return Object.keys((obj && obj.anexos) || {}).map(k => Object.assign({ _id: k }, obj.anexos[k])).sort((a, b) => (a.em || 0) - (b.em || 0)); }
function _anIcon(a, size) {
    if (typeof window._anexoIconSvg === 'function') { try { return window._anexoIconSvg(a, size || '15px'); } catch (_) {} }
    return `<i class="fas ${a.tipo === 'link' ? 'fa-link' : a.tipo === 'imagem' ? 'fa-image' : 'fa-file'}"></i>`;
}
function _anexoChips(path, obj, ed) {
    return _anexosArr(obj).map(a => `<span class="reu-anx" onclick="reuOpenAnexo('${path}','${a._id}')" title="${_esc(a.nome)}">
        ${_anIcon(a, '14px')}<span>${_esc(a.nome)}</span>
        ${ed ? `<i class="fas fa-pen reu-chip-x reu-chip-ed" title="Renomear" onclick="event.stopPropagation();reuRenameAnexo('${path}','${a._id}')"></i><i class="fas fa-times reu-chip-x" title="Remover" onclick="event.stopPropagation();reuDeleteAnexo('${path}','${a._id}')"></i>` : ''}</span>`).join('');
}
function _getAt(path) { return path.split('/').reduce((o, k, i) => (i === 0 ? _data : o && o[k]), null); }

let _anxPath = null;
function reuOpenAttach(path) {
    if (!_guard(path)) return;
    _closePop();
    _anxPath = path;
    let el = document.getElementById('reuAnxModal');
    if (!el) {
        el = document.createElement('div');
        el.id = 'reuAnxModal'; el.className = 'reu-overlay reu-overlay--top';
        document.body.appendChild(el);
    }
    el.innerHTML = `<div class="reu-modal reu-modal--sm">
        <div class="reu-modal-head"><h3><i class="fas fa-paperclip"></i> Anexar</h3><span style="flex:1"></span><button class="reu-icon-btn" title="Fechar" onclick="reuCloseAttach()"><i class="fas fa-times"></i></button></div>
        <div class="reu-modal-body">
            <label class="reu-drop" id="reuDrop">
                <input type="file" id="reuAnxFile" multiple accept="${(typeof UPLOAD_ALLOWED_EXT !== 'undefined' ? UPLOAD_ALLOWED_EXT.join(',') : '')}" onchange="reuAnxFiles(this.files)">
                <i class="fas fa-cloud-arrow-up"></i><b>Clique ou arraste arquivos aqui</b>
                <small>PDF, Word, Excel, PowerPoint, CSV e imagens · imagens ficam no sistema, demais arquivos no Google Drive</small>
            </label>
            <div class="reu-anx-queue" id="reuAnxQueue"></div>
            <div class="reu-f"><span><i class="fas fa-link"></i> Ou adicionar link</span>
                <div class="reu-inline"><input class="reu-in" id="reuAnxLink" placeholder="https://..."><input class="reu-in" id="reuAnxLinkName" placeholder="Nome (opcional)" style="max-width:180px">
                <button class="reu-btn" onclick="reuAnxAddLink()">Adicionar</button></div></div>
        </div></div>`;
    el.classList.add('open');
    const dz = document.getElementById('reuDrop');
    ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag'); }));
    dz.addEventListener('drop', e => { if (e.dataTransfer && e.dataTransfer.files) reuAnxFiles(e.dataTransfer.files); });
}
function reuCloseAttach() { const el = document.getElementById('reuAnxModal'); if (el) el.classList.remove('open'); }
function _fileToDataUrl(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); }); }
function _extOf(name) { const i = String(name).lastIndexOf('.'); return i >= 0 ? String(name).slice(i).toLowerCase() : ''; }

async function reuAnxFiles(files) {
    const path = _anxPath;
    if (!path || !files || !files.length) return;
    const q = document.getElementById('reuAnxQueue');
    let ok = 0, fail = 0;
    for (const file of Array.from(files)) {
        const ext = _extOf(file.name);
        if (typeof UPLOAD_ALLOWED_EXT !== 'undefined' && !UPLOAD_ALLOWED_EXT.includes(ext)) { _toast('Tipo não permitido: ' + file.name, 'error'); fail++; continue; }
        if (file.size > 25 * 1024 * 1024) { _toast('Arquivo acima de 25 MB: ' + file.name, 'error'); fail++; continue; }
        const row = document.createElement('div');
        row.className = 'reu-anx-row';
        row.innerHTML = `<i class="fas fa-spinner fa-spin"></i><span>${_esc(file.name)}</span><small>enviando…</small>`;
        if (q) q.appendChild(row);
        try {
            let dataUrl = await _fileToDataUrl(file);
            const aid = _uid('a');
            const me = _me();
            let anexo;
            const isImg = /^image\/(jpeg|png|gif|webp)$/.test(file.type);
            if (isImg && typeof _saveImgBlob === 'function') {
                if (typeof _compressImageToJpeg === 'function') { try { dataUrl = await _compressImageToJpeg(dataUrl); } catch (_) {} }
                const blobId = 'reuimg_' + aid;
                await _saveImgBlob(blobId, dataUrl);
                anexo = { tipo: 'imagem', nome: file.name, blobId, fileExt: ext };
            } else {
                if (typeof driveUpload !== 'function') throw new Error('Upload indisponível.');
                const result = await driveUpload(file.name, dataUrl);
                if (!(result && typeof result === 'object' && result.url)) throw new Error(typeof result === 'string' ? result : 'Falha no upload.');
                anexo = { tipo: 'arquivo', nome: file.name, url: result.url, fileId: result.fileId || result.id || null, fileExt: ext };
            }
            anexo.por = me ? me.id : ''; anexo.em = Date.now();
            if (_open && path.indexOf('reunioes/' + _open.id) === 0) _sessUploads.push(anexo);
            _write(path + '/anexos/' + aid, anexo);
            row.innerHTML = `<i class="fas fa-circle-check" style="color:#16a34a"></i><span>${_esc(file.name)}</span><small>anexado</small>`;
            ok++;
        } catch (e) {
            row.innerHTML = `<i class="fas fa-circle-xmark" style="color:#dc2626"></i><span>${_esc(file.name)}</span><small>${_esc(e.message || 'erro')}</small>`;
            fail++;
        }
    }
    // Tudo certo → fecha sozinho; com falha, mantém aberto para o usuário ver o erro
    if (ok && !fail) {
        _toast(ok === 1 ? 'Anexo adicionado.' : ok + ' anexos adicionados.', 'success');
        setTimeout(reuCloseAttach, 350);
    } else if (ok && fail) _toast(ok + ' anexado(s), ' + fail + ' com erro.', 'error');
}
// Link colado do Google/Gmail/Outlook vem embrulhado (google.com/url?q=...): usa o destino real
function _linkReal(u) {
    for (let i = 0; i < 3; i++) {
        let x; try { x = new URL(u); } catch (_) { return u; }
        const h = x.hostname.replace(/^www\./, '');
        let alvo = null;
        if (/^google\.[a-z.]+$/.test(h) && x.pathname === '/url') alvo = x.searchParams.get('q') || x.searchParams.get('url');
        else if (/safelinks\.protection\.outlook\.com$/.test(h)) alvo = x.searchParams.get('url');
        if (!alvo || !/^https?:\/\//i.test(alvo)) return u;
        u = alvo;
    }
    return u;
}
function reuAnxAddLink() {
    let u = (document.getElementById('reuAnxLink').value || '').trim();
    if (!u) { _toast('Cole a URL.', 'error'); return; }
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    u = _linkReal(u);
    const nome = (document.getElementById('reuAnxLinkName').value || '').trim() || u.replace(/^https?:\/\//, '').slice(0, 60);
    const me = _me();
    _write(_anxPath + '/anexos/' + _uid('a'), { tipo: 'link', nome, url: u, por: me ? me.id : '', em: Date.now() });
    _toast('Link anexado.', 'success');
    reuCloseAttach();
}
function reuOpenAnexo(path, aid) {
    const a = ((_getAt(path) || {}).anexos || {})[aid];
    if (!a) return;
    if (a.tipo === 'imagem' && a.blobId) {
        if (typeof window.openImgLightboxBlob === 'function') window.openImgLightboxBlob(a.blobId, a.nome);
        else if (typeof window._loadImgBlob === 'function') window._loadImgBlob(a.blobId).then(u => { const w = window.open(); if (w) w.document.write(`<img src="${u}" style="max-width:100%">`); });
        return;
    }
    if (a.url) window.open(_linkReal(a.url), '_blank', 'noopener');
}
// Renomeia só o título exibido do anexo/link (o arquivo ou URL não mudam)
async function reuRenameAnexo(path, aid) {
    if (!_guard(path)) return;
    const a = ((_getAt(path) || {}).anexos || {})[aid];
    if (!a) return;
    const novo = await _promptBox({ titulo: 'Renomear anexo', icone: 'fa-pen', valor: a.nome || '', ok: 'Salvar' });
    if (novo === null) return;
    const v = novo.trim();
    if (!v || v === a.nome) return;
    _write(path + '/anexos/' + aid + '/nome', v);
}
function _promptBox(o) {
    return new Promise(res => {
        const el = document.createElement('div');
        el.className = 'reu-overlay reu-overlay--top open';
        el.style.zIndex = '10300';   // acima de popovers e da reunião
        el.innerHTML = `<div class="reu-modal reu-modal--scope" style="max-width:440px">
            <div class="reu-modal-head"><h3><i class="fas ${o.icone || 'fa-pen'}" style="color:#2563eb"></i> ${_esc(o.titulo || '')}</h3></div>
            <div class="reu-modal-body"><input class="reu-search" data-pb value="${_esc(o.valor || '')}" maxlength="160"></div>
            <div class="reu-modal-foot"><span style="flex:1"></span>
                <button class="reu-btn" data-act="cancel">Cancelar</button>
                <button class="reu-btn reu-btn--pri" data-act="ok">${_esc(o.ok || 'OK')}</button></div></div>`;
        const inp = () => el.querySelector('[data-pb]');
        const close = v => { el.remove(); document.removeEventListener('keydown', onKey, true); res(v); };
        const onKey = e => {
            if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(null); }
            else if (e.key === 'Enter') { e.stopPropagation(); e.preventDefault(); close(inp().value); }
        };
        el.addEventListener('click', e => {
            if (e.target === el) return close(null);
            const b = e.target.closest('[data-act]');
            if (b) close(b.dataset.act === 'ok' ? inp().value : null);
        });
        document.addEventListener('keydown', onKey, true);
        document.body.appendChild(el);
        setTimeout(() => { const i = inp(); i.focus(); i.select(); }, 0);
    });
}
function reuDeleteAnexo(path, aid) {
    if (!_guard(path)) return;
    const a = ((_getAt(path) || {}).anexos || {})[aid];
    if (!a) return;
    const go = () => {
        // No rascunho, o arquivo só é apagado de fato quando a reunião for salva
        if (_open && path.indexOf('reunioes/' + _open.id) === 0) _pendDel.push(a); else _deleteStored(a);
        _write(path + '/anexos/' + aid, null);
    };
    if (typeof window._showConfirmDialog === 'function') {
        window._showConfirmDialog({ title: 'Remover anexo?', message: `"${_esc(a.nome)}" será removido${a.tipo === 'link' ? '' : ' e o arquivo apagado'}.`, confirmLabel: 'Remover', confirmClass: 'confirm-dlg-btn--danger', icon: 'fa-trash', onConfirm: go });
    } else go();
}
// Todos os anexos da ocorrência (reunião + tópicos + blocos) para a aba Anexos e a ata
function _allAnexos(r, o) {
    const op = _occPath(r, _open ? _open.date : o.date);
    const out = [];
    _anexosArr(_data[r.id]).forEach(a => out.push({ a, path: 'reunioes/' + r.id, where: 'Reunião' }));
    _sortedTopics(o.topicos).forEach((t, ti) => {
        const tp = op + '/topicos/' + t._id;
        _anexosArr(t).forEach(a => out.push({ a, path: tp, where: (ti + 1) + '. ' + (t.titulo || 'Tópico') }));
        _sortedItems(t.itens).forEach(it => _anexosArr(it).forEach(a => out.push({ a, path: tp + '/itens/' + it._id, where: (ti + 1) + '. ' + (t.titulo || 'Tópico') + ' › ' + (it.texto || 'item') })));
    });
    return out;
}

// --- Render dos blocos -------------------------------------------------------------
function _blockRow(r, tp, node, ed, opts) {
    opts = opts || {};
    const it = node.it, ip = tp + '/itens/' + it._id;
    const task = _isTask(it);
    const od = task && _isOverdue(it);
    const hasKids = node.children && node.children.length;
    const col = _collapsed.has(it._id);
    const prog = task && hasKids ? _taskProgress(node) : null;
    const nAnx = Object.keys(it.anexos || {}).length;
    const depth = opts.flat ? 0 : node.depth;
    return `<div class="reu-blk ${task ? 'is-task' : 'is-text'} ${task && it.checked ? 'done' : ''} ${opts.ctx ? 'is-ctx' : ''}" style="--d:${depth}" data-bid="${it._id}">
        ${ed && opts.dnd ? `<span class="reu-blk-grip" title="Arraste para mover · solte sobre outra linha para virar subitem" onpointerdown="reuBlkDragStart(event,'${tp}','${it._id}')"><i class="fas fa-grip-vertical"></i></span>` : ''}
        ${ed ? `<button class="reu-blk-type" title="${task ? 'Converter em texto' : 'Converter em tarefa'}" onclick="reuItemSet('${ip}','tipo','${task ? 'texto' : 'tarefa'}')"><i class="fas ${task ? 'fa-paragraph' : 'fa-square-check'}"></i></button>` : ''}
        <button class="reu-blk-caret ${hasKids ? '' : 'is-empty'}" ${hasKids ? `onclick="reuToggleCollapse('${it._id}')"` : 'tabindex="-1"'}><i class="fas fa-chevron-${col ? 'right' : 'down'}"></i></button>
        ${task ? `<input type="checkbox" class="reu-blk-cb" ${it.checked ? 'checked' : ''} ${ed ? '' : 'disabled'} onchange="reuItemSet('${ip}','checked',this.checked)">`
               : `<span class="reu-blk-para" title="Bloco de texto"><i class="fas fa-paragraph"></i></span>`}
        ${task ? `<textarea class="reu-blk-text reu-autogrow" rows="1" data-fk="i-${it._id}" placeholder="Tarefa" ${ed ? '' : 'disabled'}
                    oninput="reuAutogrow(this)" onchange="reuItemSet('${ip}','texto',this.value)" onkeydown="reuBlkKey(event,this,'${tp}','${it._id}')">${_esc(it.texto || '')}</textarea>`
               : `<textarea class="reu-blk-text reu-autogrow" rows="1" data-fk="i-${it._id}" placeholder="Texto" ${ed ? '' : 'disabled'}
                    oninput="reuAutogrow(this)" onchange="reuItemSet('${ip}','texto',this.value)" onkeydown="reuBlkKey(event,this,'${tp}','${it._id}')">${_esc(it.texto || '')}</textarea>`}
        ${opts.extra || ''}
        <span class="reu-blk-meta">
            ${_mkChips(it.marcadores)}
            ${prog ? `<span class="reu-blk-prog" title="Subtarefas concluídas">${prog.done}/${prog.total}</span>` : ''}
            ${nAnx ? `<button class="reu-blk-anx" onclick="reuOpenAttach('${ip}')" title="Anexos"><i class="fas fa-paperclip"></i> ${nAnx}</button>` : ''}
            ${task ? `<label class="reu-due ${it.prazo ? 'has' : ''} ${od ? 'is-late' : ''}" title="${it.prazo ? 'Prazo: ' + _fmtDate(it.prazo) : 'Definir prazo'}">
                <i class="fas ${od ? 'fa-triangle-exclamation' : 'fa-calendar-day'}"></i>${it.prazo ? `<span>${_fmtDate(it.prazo).slice(0, 5)}</span>` : ''}
                ${ed ? `<input type="date" value="${_esc(it.prazo || '')}" onchange="reuItemSet('${ip}','prazo',this.value||null)" onclick="try{this.showPicker()}catch(e){}">` : ''}</label>` : ''}
            ${(() => { const rs = _resps(it), podeR = _isOrg(r); if (!rs.length && !podeR) return '';
                return `<button class="reu-who ${rs.length ? 'has' : ''}" ${podeR ? `onclick="reuPopResp(this,'${ip}')"` : 'disabled'} title="${rs.length ? _esc(rs.map(_userName).join(', ')) : 'Definir responsáveis'}">
                ${rs.length === 1 ? _avatar(rs[0]) + `<span>${_esc(_userName(rs[0]).split(' ')[0])}</span>` : rs.length ? _avStack(rs, 3) : '<i class="fas fa-user-plus"></i>'}</button>`; })()}
            ${ed && node.depth < MAX_DEPTH - 1 ? `<button class="reu-icon-btn reu-hover" title="Adicionar subitem" onclick="reuItemAdd('${tp}','','${it._id}','tarefa',true)"><i class="fas fa-plus"></i></button>` : ''}
            ${ed ? `<button class="reu-icon-btn reu-hover" title="Opções" onclick="reuPopBlock(this,'${tp}','${it._id}')"><i class="fas fa-ellipsis-vertical"></i></button>` : ''}
        </span>
    </div>
    ${nAnx && !opts.flat ? `<div class="reu-blk-anxs" style="--d:${depth}">${_anexoChips(ip, it, ed)}</div>` : ''}
    ${(it.vinculos || []).length ? `<div class="reu-blk-anxs" style="--d:${depth}">${_nodeLinks(ip, it, ed)}</div>` : ''}`;
}
function _renderNodes(r, tp, nodes, ed) {
    const me = _me();
    return nodes.map(n => { const e2 = ed || !!(me && _resps(n.it).includes(me.id)); return _blockRow(r, tp, n, e2, { dnd: true }) + (n.children.length && !_collapsed.has(n.it._id) ? _renderNodes(r, tp, n.children, e2) : ''); }).join('');
}

function _tabPauta(r, o, ed, topics) {
    const op = _occPath(r, _open.date);
    const html = topics.map((t, ti) => {
        const tp = op + '/topicos/' + t._id;
        const tree = _tree(t.itens);
        const tasks = _flatTree(tree).filter(n => _isTask(n.it));
        const done = tasks.filter(n => n.it.checked).length;
        const nAnx = Object.keys(t.anexos || {}).length;
        const edT = ed || _isTopicResp(tp);
        return `<div class="reu-topic">
            <div class="reu-topic-head">
                <span class="reu-topic-n">${ti + 1}</span>
                ${ed && topics.length > 1 ? `<span class="reu-topic-mv"><button class="reu-icon-btn" title="Subir tópico" ${ti === 0 ? 'disabled' : ''} onclick="reuTopicMove('${tp}',-1)"><i class="fas fa-chevron-up"></i></button><button class="reu-icon-btn" title="Descer tópico" ${ti === topics.length - 1 ? 'disabled' : ''} onclick="reuTopicMove('${tp}',1)"><i class="fas fa-chevron-down"></i></button></span>` : ''}
                <input class="reu-topic-title" data-fk="t-${t._id}" value="${_esc(t.titulo || '')}" placeholder="Título do tópico" ${ed ? '' : 'disabled'} onchange="reuTopicSet('${tp}','titulo',this.value)" onkeydown="if(event.key==='Enter'){this.blur();}else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='m'){event.preventDefault();reuPopMarcadores(this,'${tp}');}">
                <span class="reu-topic-tags">${_mkChips(t.marcadores)}</span>
                ${(t.resp || []).length ? `<button class="reu-meta reu-meta--btn reu-topic-resp" ${ed ? `onclick="reuPopTopicResp(this,'${tp}')"` : 'disabled'} title="Responsáveis pelo tópico">${_avStack(t.resp, 3)}</button>`
                    : (ed ? `<button class="reu-who" onclick="reuPopTopicResp(this,'${tp}')" title="Adicionar responsáveis pelo tópico"><i class="fas fa-user-plus"></i></button>` : '')}
                ${tree.length ? `<button class="reu-icon-btn" title="${_collapsed.has('T' + t._id) ? 'Mostrar itens' : 'Ocultar itens'}" onclick="reuToggleCollapse('T${t._id}')"><i class="fas ${_collapsed.has('T' + t._id) ? 'fa-eye-slash' : 'fa-sitemap'}"></i></button>` : ''}
                ${tasks.length ? `<span class="reu-topic-prog" title="${done}/${tasks.length} concluídas"><span style="width:${Math.round(done / tasks.length * 100)}%"></span></span><small>${done}/${tasks.length}</small>` : ''}
                ${ed ? `<button class="reu-icon-btn" title="Opções do tópico" onclick="reuPopTopic(this,'${tp}')"><i class="fas fa-ellipsis"></i></button>` : ''}
            </div>
            ${ed || (t.texto || '').trim() ? `<textarea class="reu-topic-text reu-autogrow" rows="1" data-fk="tx-${t._id}" placeholder="Descrição" ${ed ? '' : 'disabled'} oninput="reuAutogrow(this)" onchange="reuTopicSet('${tp}','texto',this.value)">${_esc((t.texto || '').trim())}</textarea>` : ''}
            <div class="reu-blocks">
                ${_collapsed.has('T' + t._id) ? `<button class="reu-topic-hidden" onclick="reuToggleCollapse('T${t._id}')"><i class="fas fa-eye"></i> ${_flatTree(tree).length} itens ocultos — mostrar</button>` : _renderNodes(r, tp, tree, edT)}
                ${edT ? `<div class="reu-blk-add">
                    <button class="reu-blk-add-type" title="Adicionar tarefa" onclick="reuItemAdd('${tp}','',null,'tarefa',true)"><i class="far fa-square-check"></i></button>
                    <button class="reu-blk-add-type" title="Adicionar texto" onclick="reuItemAdd('${tp}','',null,'texto',true)"><i class="fas fa-paragraph"></i></button>
                    <input data-fk="add-${t._id}" placeholder="Nova linha · Enter (mesmo tipo da última) · Ctrl+Enter tarefa · Alt+Enter novo tópico" onkeydown="reuAddKey(event,this,'${tp}')">
                </div>` : ''}
            </div>
            ${nAnx ? `<div class="reu-topic-anxs"><i class="fas fa-paperclip"></i>${_anexoChips(tp, t, ed)}</div>` : ''}
            ${(t.vinculos || []).length ? `<div class="reu-topic-anxs"><i class="fas fa-link"></i>${_nodeLinks(tp, t, ed)}</div>` : ''}
        </div>`;
    }).join('');
    const empty = `<div class="reu-empty-sm"><i class="fas fa-list-ol"></i><p>${ed ? 'Monte a pauta da reunião.' : 'Nenhum tópico registrado.'}</p></div>`;
    return `<div class="reu-pauta">${html || empty}
        ${ed ? `<button class="reu-add-topic" onclick="reuTopicAdd()"><i class="fas fa-plus"></i> Adicionar tópico</button>` : ''}</div>`;
}

function _tabAcoes(r, o, ed, items) {
    const op = _occPath(r, _open.date);
    // Filtro por tarefa; ancestrais de tarefas que passam no filtro ficam como contexto
    const match = (it, t) => {
        if (!_isTask(it)) return false;
        if (_actFilter.st === 'pend' && it.checked) return false;
        if (_actFilter.st === 'ok' && !it.checked) return false;
        if (_actFilter.who && (_actFilter.who === '_none' ? _resps(it).length > 0 : !_resps(it).includes(String(_actFilter.who)))) return false;
        if (_actFilter.mk && !(it.marcadores || []).includes(_actFilter.mk) && !(t.marcadores || []).includes(_actFilter.mk)) return false;
        return true;
    };
    const prune = (nodes, t) => nodes.map(n => {
        const kids = prune(n.children, t);
        const m = match(n.it, t);
        return (m || kids.length) ? { it: n.it, depth: n.depth, children: kids, ctx: !m } : null;
    }).filter(Boolean);
    const render = (nodes, tp) => nodes.map(n => _blockRow(r, tp, n, ed || _isTopicResp(tp + '/itens/' + n.it._id), { ctx: n.ctx })
        + (n.children.length && !_collapsed.has(n.it._id) ? render(n.children, tp) : '')).join('');
    const groups = _sortedTopics(o.topicos).map((t, ti) => {
        const tp = op + '/topicos/' + t._id;
        const nodes = prune(_tree(t.itens), t);
        if (!nodes.length) return '';
        return `<div class="reu-act-group"><span class="reu-topic-n">${ti + 1}</span><b>${_esc(t.titulo || 'Tópico')}</b>${_mkChips(t.marcadores)}</div>${render(nodes, tp)}`;
    }).join('');
    const cnt = { todos: items.length, pend: items.filter(x => !x.it.checked).length, ok: items.filter(x => x.it.checked).length };
    const whoLabel = !_actFilter.who ? 'Todos os responsáveis' : (_actFilter.who === '_none' ? 'Sem responsável' : _userName(_actFilter.who));
    const mk = _actFilter.mk && _mkDef(_actFilter.mk);
    return `<div class="reu-filters">
        <div class="reu-seg reu-seg--sm">
            ${[['pend', 'Pendentes'], ['ok', 'Concluídas'], ['todos', 'Todas']].map(([k, l]) => `<button class="${_actFilter.st === k ? 'on' : ''}" onclick="reuActFilter('st','${k}')">${l} <b>${cnt[k]}</b></button>`).join('')}
        </div>
        <button class="reu-meta reu-meta--btn" onclick="reuPopActWho(this)"><i class="fas fa-user"></i> ${_esc(whoLabel)} <i class="fas fa-chevron-down reu-caret"></i></button>
        <button class="reu-meta reu-meta--btn" onclick="reuPopActMk(this)">${mk ? `<span class="reu-mk-dot" style="background:${_esc(mk.cor)}"></span> ${_esc(mk.nome)}` : '<i class="fas fa-tag"></i> Todos os marcadores'} <i class="fas fa-chevron-down reu-caret"></i></button>
    </div>
    <div class="reu-actions">
        ${groups || `<div class="reu-empty-sm"><i class="fas fa-circle-check"></i><p>${items.length ? 'Nada aqui com esse filtro.' : 'As tarefas da pauta aparecem aqui.'}</p></div>`}
    </div>`;
}

function _tabAnexos(r, o, ed) {
    const all = _allAnexos(r, o);
    const card = x => {
        const a = x.a;
        return `<div class="reu-anx-card" onclick="reuOpenAnexo('${x.path}','${a._id}')">
            <span class="reu-anx-ic">${_anIcon(a, '22px')}</span>
            <div class="reu-anx-main"><b title="${_esc(a.nome)}">${_esc(a.nome)}</b><small>${_esc(x.where)}${a.por ? ' · ' + _esc(_userName(a.por).split(' ')[0]) : ''}${a.em ? ' · ' + new Date(a.em).toLocaleDateString('pt-BR') : ''}</small></div>
            ${ed ? `<button class="reu-icon-btn" title="Remover" onclick="event.stopPropagation();reuDeleteAnexo('${x.path}','${a._id}')"><i class="fas fa-trash-can"></i></button>` : ''}
        </div>`;
    };
    return `<div class="reu-vgrid">
        ${all.map(card).join('')}
        ${ed ? `<button class="reu-vcard reu-vcard--add" onclick="reuOpenAttach('reunioes/${_esc(r.id)}')"><i class="fas fa-paperclip"></i> Anexar arquivo, imagem ou link à reunião</button>` : ''}
        ${!all.length && !ed ? '<div class="reu-side-empty">Nenhum anexo.</div>' : ''}
    </div>`;
}

// --- Popovers de tópico/bloco ---------------------------------------------------------
function reuPopTopic(btn, tp) {
    _openPop(btn, _menuHtml([
        { label: 'Responsáveis', icon: 'fa-user-group', fn: `reuClosePop();reuPopTopicResp(document.querySelector('[data-fk=&quot;t-${tp.split('/').pop()}&quot;]'),'${tp}')` },
        { label: 'Marcadores', icon: 'fa-tag', fn: `reuClosePop();reuPopMarcadores(document.querySelector('[data-fk=&quot;t-${tp.split('/').pop()}&quot;]'),'${tp}')` },
        { label: 'Anexar', icon: 'fa-paperclip', fn: `reuOpenAttach('${tp}')` },
        { label: 'Vincular card', icon: 'fa-link', fn: `reuClosePop();reuOpenLinkPicker('${tp}')` },
        '-',
        { label: 'Mover para cima', icon: 'fa-arrow-up', fn: `reuClosePop();reuTopicMove('${tp}',-1)` },
        { label: 'Mover para baixo', icon: 'fa-arrow-down', fn: `reuClosePop();reuTopicMove('${tp}',1)` },
        '-',
        { label: 'Excluir tópico', icon: 'fa-trash', danger: true, fn: `reuClosePop();reuTopicDelete('${tp}')` }
    ]));
}
function reuTopicMove(tp, dir) {
    if (!_guard()) return;
    const base = tp.slice(0, tp.lastIndexOf('/'));
    const list = _sortedTopics(_getAt(base) || {});
    const i = list.findIndex(t => t._id === tp.split('/').pop()), j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    list.forEach((t, k) => { if ((t.ordem || 0) !== (k + 1) * 1000) _write(base + '/' + t._id, { ordem: (k + 1) * 1000 }, true); });
}
// Participantes desta ocorrência (visão mesclada, inclui o rascunho ainda não salvo)
function _partsAtuais(r) {
    r = r || _cur(); if (!r) return [];
    try { const o = _occ(r, _open.date); return ((o && o.r && o.r.participantes) || r.participantes || []).map(String); } catch (_) { return (r.participantes || []).map(String); }
}
function reuPopTopicResp(btn, tp) {
    const r = _cur(); if (!r) return;
    const t = _getAt(tp) || {};
    if (!_isOrg(r)) { _toast('Só o organizador e co-organizadores definem responsáveis.', 'error'); return; }
    _userPop(btn, { title: 'Responsáveis pelo tópico', selected: (t.resp || []).slice(), multi: true, lotes: true, first: _partsAtuais(r), only: true, onPick: id => {
        const cur = ((_getAt(tp) || {}).resp || []).map(String);
        const next = cur.includes(String(id)) ? cur.filter(x => x !== String(id)) : cur.concat(String(id));
        _write(tp + '/resp', next.length ? next : null);
    } });
}
function reuPopBlock(btn, tp, bid) {
    const t = _getAt(tp) || {}; const itens = t.itens || {}; const it = itens[bid]; if (!it) return;
    const task = _isTask(it);
    const depth = _depthOf(itens, bid);
    const sibs = _sortedItems(itens).filter(x => (x.pai || '') === (it.pai || ''));
    const idx = sibs.findIndex(x => x._id === bid);
    const anchor = `document.querySelector('[data-bid=&quot;${bid}&quot;]')`;
    _openPop(btn, _menuHtml([
        { label: task ? 'Converter em texto' : 'Converter em tarefa', icon: task ? 'fa-paragraph' : 'fa-square-check', fn: `reuClosePop();reuItemSet('${tp}/itens/${bid}','tipo','${task ? 'texto' : 'tarefa'}')` },
        depth < MAX_DEPTH - 1 ? { label: 'Adicionar subitem', icon: 'fa-turn-down', fn: `reuClosePop();reuItemAdd('${tp}','','${bid}','tarefa',true)` } : null,
        idx > 0 && depth < MAX_DEPTH - 1 ? { label: 'Recuar → (subitem)', icon: 'fa-indent', fn: `reuClosePop();reuIndent('${tp}','${bid}',1)` } : null,
        it.pai ? { label: '← Avançar nível', icon: 'fa-outdent', fn: `reuClosePop();reuIndent('${tp}','${bid}',-1)` } : null,
        '-',
        { label: 'Marcadores', icon: 'fa-tag', fn: `reuClosePop();reuPopMarcadores(${anchor},'${tp}/itens/${bid}')` },
        { label: 'Anexar', icon: 'fa-paperclip', fn: `reuOpenAttach('${tp}/itens/${bid}')` },
        { label: 'Vincular card', icon: 'fa-link', fn: `reuClosePop();reuOpenLinkPicker('${tp}/itens/${bid}')` },
        '-',
        { label: 'Excluir' + (_descIds(itens, bid).length ? ' (com subitens)' : ''), icon: 'fa-trash', danger: true, fn: `reuClosePop();reuItemDelete('${tp}/itens/${bid}')` }
    ].filter(Boolean)));
}
function reuPopActMk(btn) {
    _openPop(btn, `<div class="reu-pop-list">${_menuHtml([{ label: 'Todos os marcadores', icon: 'fa-tags', on: !_actFilter.mk, fn: "reuActFilter('mk','')" }, '-']
        .concat(_mkList().map(m => ({ label: m.nome, icon: 'fa-circle', color: m.cor, on: _actFilter.mk === m._id, fn: `reuActFilter('mk','${m._id}')` }))))}</div>`);
}
function reuToggleCollapse(bid) { _collapsed.has(bid) ? _collapsed.delete(bid) : _collapsed.add(bid); _renderDetail(); }

// --- Teclado nos blocos --------------------------------------------------------------
function _focusBlock(bid, atEnd) {
    setTimeout(() => {
        const el = document.querySelector(`#reuDrawer [data-fk="i-${bid}"]`);
        if (!el) return;
        el.focus();
        try { const n = atEnd ? el.value.length : 0; el.setSelectionRange(n, n); } catch (_) {}
    }, 0);
}
function _ordemAfter(itens, it) {
    const sibs = _sortedItems(itens).filter(x => (x.pai || '') === (it.pai || ''));
    const i = sibs.findIndex(x => x._id === it._id);
    const next = sibs[i + 1];
    return next ? ((it.ordem || 0) + (next.ordem || 0)) / 2 : (it.ordem || 0) + 1000;
}
function reuBlkKey(e, inp, tp, bid) {
    const t = _getAt(tp) || {}; const itens = t.itens || {}; const it = itens[bid];
    if (!it) return;
    const ip = tp + '/itens/' + bid;
    const isText = !_isTask(it);
    if (e.key === 'End' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && !isText) {
        e.preventDefault();
        if (inp.value !== (it.texto || '')) reuItemSet(ip, 'texto', inp.value);
        reuItemSet(ip, 'checked', !it.checked);
        _focusBlock(bid, true);
        return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'm') {   // Ctrl+M: marcadores
        e.preventDefault();
        if (inp.value !== (it.texto || '')) reuItemSet(ip, 'texto', inp.value);
        setTimeout(() => { const el = document.querySelector(`#reuDrawer [data-fk="i-${bid}"]`); if (el) reuPopMarcadores(el, ip); }, 0);
        return;
    }
    if (e.shiftKey && !e.ctrlKey && !e.altKey && ['ArrowUp', 'ArrowDown', 'ArrowRight', 'ArrowLeft', 'Delete', 'End'].includes(e.key)) {
        e.preventDefault();
        if (inp.value !== (it.texto || '')) reuItemSet(ip, 'texto', inp.value);
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { reuBlkMove(tp, bid, e.key === 'ArrowUp' ? -1 : 1); _focusBlock(bid, true); }
        else if (e.key === 'ArrowRight') { reuIndent(tp, bid, 1); _focusBlock(bid, true); }
        else if (e.key === 'ArrowLeft') { reuIndent(tp, bid, -1); _focusBlock(bid, true); }
        else if (e.key === 'Delete') {
            const flat = _flatTree(_tree(itens)); const i = flat.findIndex(n => n.it._id === bid);
            const nb = (flat[i - 1] || flat[i + 1 + _descIds(itens, bid).length] || {}).it;
            reuItemDelete(ip); if (nb) setTimeout(() => _focusBlock(nb._id, true), 60);
        }
        else if (e.key === 'End') { reuItemSet(ip, 'tipo', isText ? 'tarefa' : 'texto'); _focusBlock(bid, true); }
        return;
    }
    if (e.key === 'Enter' && e.altKey) {
        e.preventDefault();
        if (inp.value !== (it.texto || '')) reuItemSet(ip, 'texto', inp.value);
        reuTopicAdd();
        return;
    }
    // Enter: quebra de linha no texto (mantém o marcador) · Shift/Ctrl+Enter: nova linha abaixo
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); _bulNovaLinha(inp); return; }
    if (e.key === 'Enter') {
        e.preventDefault();
        if (inp.value !== (it.texto || '')) reuItemSet(ip, 'texto', inp.value);
        const nid = _uid('i');
        const cur = Object.assign({ _id: bid }, ((_getAt(tp) || {}).itens || {})[bid] || it);
        _write(tp + '/itens/' + nid, { texto: '', tipo: (e.ctrlKey || e.metaKey) ? 'tarefa' : (cur.tipo || 'tarefa'), checked: false, responsavel: '', pai: cur.pai || null, ordem: _ordemAfter((_getAt(tp) || {}).itens || {}, cur) });
        if (it.pai) _syncParentCheck(tp + '/itens/' + nid);
        _focusBlock(nid);
    } else if (e.key === 'Tab') {
        e.preventDefault();
        _bulNivel(inp, e.shiftKey ? -1 : 1);   // marcadores no texto (mover na árvore: Shift + ← / →)
    } else if (e.key === 'Backspace' && !inp.value && !_descIds(itens, bid).length) {
        e.preventDefault();
        const flat = _flatTree(_tree(itens));
        const i = flat.findIndex(n => n.it._id === bid);
        const prev = i > 0 ? flat[i - 1].it._id : null;
        _write(ip, null);
        if (prev) _focusBlock(prev, true);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        if (inp.value.includes('\n')) return;
        const flat = _flatTree(_tree(itens));
        const i = flat.findIndex(n => n.it._id === bid);
        const tgt = flat[i + (e.key === 'ArrowUp' ? -1 : 1)];
        if (tgt) { e.preventDefault(); if (inp.value !== (it.texto || '')) reuItemSet(ip, 'texto', inp.value); _focusBlock(tgt.it._id, true); }
    }
}
// --- Marcadores no texto: Tab / Shift+Tab mudam o nível da linha do cursor ---
// Nível n (1..10): 2 espaços de recuo por nível; • no 1º, ◦ no 2º, ▪ do 3º em diante.
const _BUL_MAX = 10;
const _bulPre = n => n <= 0 ? '' : '  '.repeat(n - 1) + (n === 1 ? '• ' : n === 2 ? '◦ ' : '▪ ');
const _BUL_RE = /^( *)[•◦▪] /;
function _bulLinha(inp) {
    const v = inp.value, pos = inp.selectionStart;
    const ini = v.lastIndexOf('\n', pos - 1) + 1;
    let fim = v.indexOf('\n', pos); if (fim < 0) fim = v.length;
    const linha = v.slice(ini, fim), m = linha.match(_BUL_RE), pre = m ? m[0] : '';
    return { v, pos, ini, fim, linha, pre, nivel: m ? Math.floor(m[1].length / 2) + 1 : 0 };
}
function _bulSet(inp, v, caret) {
    inp.value = v; inp.setSelectionRange(caret, caret);
    if (inp.classList.contains('reu-autogrow')) _autogrow(inp);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
}
function _bulNivel(inp, dir) {
    if (inp.disabled) return;
    const L = _bulLinha(inp);
    const n = Math.max(0, Math.min(_BUL_MAX, L.nivel + dir));
    const pre = _bulPre(n);
    const novo = pre + L.linha.slice(L.pre.length);
    _bulSet(inp, L.v.slice(0, L.ini) + novo + L.v.slice(L.fim), Math.max(L.ini + pre.length, L.pos + pre.length - L.pre.length));
}
// Shift+Enter: quebra a linha; se a linha tem marcador, a nova começa com o mesmo.
// Linha só com marcador (vazia) → remove o marcador, como no Word.
function _bulNovaLinha(inp) {
    if (inp.disabled) return;
    const L = _bulLinha(inp);
    if (L.pre && !L.linha.slice(L.pre.length).trim()) return _bulSet(inp, L.v.slice(0, L.ini) + L.v.slice(L.ini + L.pre.length), L.ini);
    const ins = '\n' + L.pre, fimSel = inp.selectionEnd;
    _bulSet(inp, L.v.slice(0, L.pos) + ins + L.v.slice(fimSel), L.pos + ins.length);
}
// Move o bloco entre os irmãos (mesmo pai), levando os subitens junto
function reuBlkMove(tp, bid, dir) {
    if (!_guard(tp + '/itens/' + bid)) return;
    const itens = (_getAt(tp) || {}).itens || {}; const it = itens[bid]; if (!it) return;
    const sibs = _sortedItems(itens).filter(x => (x.pai || '') === (it.pai || ''));
    const i = sibs.findIndex(x => x._id === bid), j = i + dir;
    if (i < 0 || j < 0 || j >= sibs.length) return;
    [sibs[i], sibs[j]] = [sibs[j], sibs[i]];
    const base = sibs.reduce((m, x) => Math.min(m, x.ordem || 0), Infinity) || 0;
    sibs.forEach((x, k) => { const o = base + k * 1000; if ((x.ordem || 0) !== o) _write(tp + '/itens/' + x._id, { ordem: o }, true); });
}
function reuIndent(tp, bid, dir) {
    if (!_guard(tp + '/itens/' + bid)) return;
    const t = _getAt(tp) || {}; const itens = t.itens || {}; const it = itens[bid];
    if (!it) return;
    if (dir > 0) {
        const sibs = _sortedItems(itens).filter(x => (x.pai || '') === (it.pai || ''));
        const i = sibs.findIndex(x => x._id === bid);
        if (i <= 0) return;
        // profundidade do bloco + profundidade da sua subárvore precisa caber em 3 níveis
        const subDepth = (function d(id) { const k = Object.keys(itens).filter(x => itens[x] && itens[x].pai === id); return k.length ? 1 + Math.max(...k.map(d)) : 0; })(bid);
        if (_depthOf(itens, bid) + 1 + subDepth > MAX_DEPTH - 1) { _toast('Limite de ' + MAX_DEPTH + ' níveis.', 'info'); return; }
        const newPai = sibs[i - 1];
        const kids = _sortedItems(itens).filter(x => x.pai === newPai._id);
        _write(tp + '/itens/' + bid, { pai: newPai._id, ordem: kids.length ? (kids[kids.length - 1].ordem || 0) + 1000 : Date.now() }, true);
    } else {
        if (!it.pai || !itens[it.pai]) return;
        const parent = Object.assign({ _id: it.pai }, itens[it.pai]);
        _write(tp + '/itens/' + bid, { pai: parent.pai || null, ordem: _ordemAfter(itens, parent) }, true);
    }
}
// --- Arrastar blocos: antes / depois (irmão) ou no meio (vira subitem) ---------------
let _bdrag = null;
function _subDepth(itens, id) { const k = Object.keys(itens).filter(x => itens[x] && itens[x].pai === id); return k.length ? 1 + Math.max(...k.map(x => _subDepth(itens, x))) : 0; }
function reuBlkDragStart(e, tp, bid) {
    if (e.button !== 0 || !_guard(tp + '/itens/' + bid)) return;
    e.preventDefault();
    const el = document.querySelector(`#reuDrawer .reu-blk[data-bid="${bid}"]`);
    if (!el) return;
    _bdrag = { tp, bid, el, topic: el.closest('.reu-topic'), target: null, zone: null };
    el.classList.add('is-drag');
    document.body.classList.add('reu-dragging');
    document.addEventListener('pointermove', _blkMove);
    document.addEventListener('pointerup', _blkUp, { once: true });
}
function _blkClear() { document.querySelectorAll('.reu-blk.drop-before, .reu-blk.drop-after, .reu-blk.drop-inside, .reu-blk.drop-no').forEach(b => b.classList.remove('drop-before', 'drop-after', 'drop-inside', 'drop-no')); }
function _blkMove(e) {
    const d = _bdrag; if (!d) return;
    _blkClear();
    d.target = null; d.zone = null;
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    const tEl = hit && hit.closest ? hit.closest('.reu-blk[data-bid]') : null;
    if (!tEl || tEl === d.el || tEl.closest('.reu-topic') !== d.topic) return;
    const itens = (_getAt(d.tp) || {}).itens || {};
    const tid = tEl.dataset.bid;
    // não pode soltar dentro da própria subárvore
    if (_descIds(itens, d.bid).includes(tid)) { tEl.classList.add('drop-no'); return; }
    const rc = tEl.getBoundingClientRect();
    const y = (e.clientY - rc.top) / rc.height;
    let zone = y < 0.28 ? 'before' : (y > 0.72 ? 'after' : 'inside');
    const sub = _subDepth(itens, d.bid);
    const tDepth = _depthOf(itens, tid);
    if (zone === 'inside' && tDepth + 1 + sub > MAX_DEPTH - 1) zone = y < 0.5 ? 'before' : 'after';
    if (zone !== 'inside' && tDepth + sub > MAX_DEPTH - 1) { tEl.classList.add('drop-no'); return; }
    d.target = tid; d.zone = zone;
    tEl.classList.add('drop-' + zone);
}
function _blkUp() {
    document.removeEventListener('pointermove', _blkMove);
    document.body.classList.remove('reu-dragging');
    _blkClear();
    const d = _bdrag; _bdrag = null;
    if (!d) return;
    d.el.classList.remove('is-drag');
    if (!d.target) return;
    const itens = (_getAt(d.tp) || {}).itens || {};
    const t = Object.assign({ _id: d.target }, itens[d.target]);
    let patch;
    if (d.zone === 'inside') {
        const kids = _sortedItems(itens).filter(x => x.pai === d.target && x._id !== d.bid);
        patch = { pai: d.target, ordem: kids.length ? (kids[kids.length - 1].ordem || 0) + 1000 : Date.now() };
        _collapsed.delete(d.target);
    } else if (d.zone === 'after') {
        const sibs = _sortedItems(itens).filter(x => (x.pai || '') === (t.pai || '') && x._id !== d.bid);
        const i = sibs.findIndex(x => x._id === t._id);
        const next = sibs[i + 1];
        patch = { pai: t.pai || null, ordem: next ? ((t.ordem || 0) + (next.ordem || 0)) / 2 : (t.ordem || 0) + 1000 };
    } else {
        const sibs = _sortedItems(itens).filter(x => (x.pai || '') === (t.pai || '') && x._id !== d.bid);
        const i = sibs.findIndex(x => x._id === t._id);
        const prev = sibs[i - 1];
        patch = { pai: t.pai || null, ordem: prev ? ((prev.ordem || 0) + (t.ordem || 0)) / 2 : (t.ordem || 0) - 1000 };
    }
    _write(d.tp + '/itens/' + d.bid, patch, true);
    if (d.zone === 'inside') _syncParentCheck(d.tp + '/itens/' + d.bid);
}
function reuAddKey(e, inp, tp) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (e.altKey) { if (inp.value.trim()) { const v = inp.value; inp.value = ''; reuItemAdd(tp, v, null, 'texto'); } reuTopicAdd(); return; }
    const v = inp.value.trim();
    if (!v) return;
    inp.value = '';
    const last = _flatTree(_tree((_getAt(tp) || {}).itens || {})).pop();
    reuItemAdd(tp, v, null, (e.ctrlKey || e.metaKey) ? 'tarefa' : (last ? (last.it.tipo || 'tarefa') : 'texto'));
}

function _tabDetalhes(r, o, edGeral) {
    const ed = _isOrg(r);
    const op = _occPath(r, _open.date);
    const pres = o.presenca || {};
    const people = (r.participantes || []).map(id => {
        const p = pres[id] || '';
        return `<div class="reu-prow">
            ${_avatar(id)}<span class="reu-prow-name">${_esc(_userName(id))}${String(id) === String(r.criadoPor) ? ' <small class="reu-muted">· organizador</small>' : (_isCoOrg(r, id) ? ' <small class="reu-muted">· co-organizador</small>' : '')}</span>
            <div class="reu-pres">${Object.keys(PRESENCA).map(k => `<button class="${p === k ? 'on ' + PRESENCA[k].cls : ''}" title="${PRESENCA[k].label}" ${ed ? `onclick="reuSetPresenca('${_esc(id)}','${p === k ? '' : k}')"` : 'disabled'}>${PRESENCA[k].short}</button>`).join('')}</div>
            ${_isDono(r) && String(id) === String(r.criadoPor) ? `<button class="reu-icon-btn" style="color:#2563eb" title="Transferir organizador (você vira co-organizador)" onclick="reuPopOrganizador(this)"><i class="fas fa-right-left"></i></button>` : ''}
            ${!_isDono(r) && _me() && String(id) === _me().id && _isCoOrg(r, id) ? `<button class="reu-icon-btn" style="color:#dc2626" title="Deixar de ser co-organizador" onclick="reuToggleCoOrg('${_esc(id)}')"><i class="fas fa-user-xmark"></i></button>` : ''}
            ${_isDono(r) && String(id) !== String(r.criadoPor) ? `<button class="reu-icon-btn ${_isCoOrg(r, id) ? '' : 'reu-hover'}" style="${_isCoOrg(r, id) ? 'color:#d97706' : ''}" title="${_isCoOrg(r, id) ? 'Remover co-organizador' : 'Tornar co-organizador (edita detalhes e vê toda a pauta)'}" onclick="reuToggleCoOrg('${_esc(id)}')"><i class="fas fa-user-shield"></i></button>` : ''}
            ${ed ? `<button class="reu-icon-btn reu-hover" title="Remover participante" onclick="reuToggleParticipant('${_esc(id)}')"><i class="fas fa-times"></i></button>` : ''}
        </div>`;
    }).join('') || '<div class="reu-side-empty">Nenhum participante.</div>';
    const nPres = Object.values(pres).filter(v => v === 'p').length;
    return `<div class="reu-det">
        <div class="reu-card">
            <div class="reu-card-t">Descrição / objetivo</div>
            <textarea class="reu-in reu-autogrow" data-fk="desc" placeholder="${ed ? 'Qual o objetivo desta reunião?' : 'Sem descrição.'}" ${ed ? '' : 'disabled'} oninput="reuAutogrow(this)" onchange="reuSetField('descricao',this.value)">${_esc(r.descricao || '')}</textarea>
            <div class="reu-card-t" style="margin-top:14px">Google Meet</div>
            <div class="reu-inline">
                <input class="reu-in" data-fk="meet" value="${_esc(r.meetUrl || '')}" placeholder="https://meet.google.com/xxx-xxxx-xxx" ${ed ? '' : 'disabled'} onchange="reuSetField('meetUrl',this.value.trim())">
                <a class="reu-btn" href="https://meet.google.com/new" target="_blank" rel="noopener" title="Criar sala"><i class="fas fa-plus"></i> Nova sala</a>
            </div>
            <div class="reu-card-t" style="margin-top:14px">Agenda</div>
            <div class="reu-kv"><span>Data</span><b>${_fmtLong(o.day)}</b></div>
            <div class="reu-kv"><span>Horário</span><b>${_esc(r.horaInicio)}–${_esc(r.horaFim)} (${_duration(r)})</b></div>
            <div class="reu-kv"><span>Recorrência</span><b>${_esc(_recLabel(r))}</b></div>
            <div class="reu-kv"><span>Lembrete</span><b>${_esc(_lembLabel(r.lembreteMin))}</b></div>
            <div class="reu-kv"><span>Organizador</span><b>${_esc(_userName(r.criadoPor))}${_isDono(r) ? ` <button class="reu-btn reu-btn--sm" style="margin-left:6px" title="Transferir a propriedade da reunião" onclick="reuPopOrganizador(this)"><i class="fas fa-right-left"></i> Transferir</button>` : ''}</b></div>
            ${(r.participantes || []).some(id => _isCoOrg(r, id)) ? `<div class="reu-kv"><span>Co-organizadores</span><b>${(r.participantes || []).filter(id => _isCoOrg(r, id)).map(id => _esc(_userName(id))).join(', ')}</b></div>` : ''}
            ${ed ? '' : '<div class="reu-muted" style="margin-top:8px"><i class="fas fa-lock"></i> Só o organizador e co-organizadores alteram os detalhes e a presença.</div>'}
            ${ed ? `<button class="reu-btn reu-btn--sm" style="margin:10px 0 0" onclick="reuOpenForm('${_esc(r.id)}')"><i class="fas fa-pen"></i> Editar data, horário e recorrência</button>` : ''}
        </div>
        <div class="reu-card">
            <div class="reu-card-t">Participantes <small class="reu-muted">· presença ${nPres}/${(r.participantes || []).length}</small>
                ${ed ? `<button class="reu-btn reu-btn--sm" onclick="reuPopParticipants(this)"><i class="fas fa-user-plus"></i> Adicionar</button>` : ''}</div>
            <div class="reu-plist">${people}</div>
            <div class="reu-muted" style="margin-top:8px">P = presente · A = ausente · J = justificado. A presença sai na ata.</div>
        </div>
    </div>`;
}

function _tabVinculos(r, ed) {
    const v = r.vinculos || [];
    return `<div class="reu-vgrid">
        ${v.map((x, i) => {
            const a = _area(x.area);
            return `<div class="reu-vcard" style="--c:${a.color}" onclick="reuOpenLinked('${x.area}','${_esc(x.id)}')">
                <span class="reu-link-ic"><i class="fas ${a.icon}"></i></span>
                <div class="reu-vcard-main"><small>${_esc(a.label)}</small><b>${_esc(x.titulo || '#' + x.id)}</b></div>
                ${ed ? `<button class="reu-icon-btn" title="Remover vínculo" onclick="event.stopPropagation();reuRemoveLink(${i})"><i class="fas fa-link-slash"></i></button>` : ''}
            </div>`;
        }).join('')}
        ${ed ? `<button class="reu-vcard reu-vcard--add" onclick="reuOpenLinkPicker('detail')"><i class="fas fa-plus"></i> Vincular Atividade, Rotina, Documento, Ocorrência ou RNC</button>` : ''}
        ${!v.length && !ed ? '<div class="reu-side-empty">Nenhum vínculo.</div>' : ''}
    </div>`;
}

// --- Popovers do detalhe -----------------------------------------------------------
function reuPopStatus(btn) {
    const r = _cur(); if (!r) return;
    const o = _occ(r, _open.date);
    _openPop(btn, _menuHtml(Object.keys(STATUS).map(k => ({ label: STATUS[k].label, icon: STATUS[k].icon, on: o.status === k, fn: `reuSetStatus('${k}')`,
        color: { agendada: '#2563eb', realizada: '#16a34a', cancelada: '#dc2626' }[k] }))));
}
function reuPopMenu(btn) {
    const r = _cur(); if (!r) return;
    const ed = _canEdit(r);
    const items = [];
    if (ed) items.push({ label: 'Editar reunião', icon: 'fa-pen', fn: `reuOpenForm('${_esc(r.id)}')` });
    items.push({ label: 'Duplicar', icon: 'fa-clone', fn: `reuDuplicate('${_esc(r.id)}')` });
    items.push('-');
    items.push({ label: 'Ata em PDF', icon: 'fa-file-pdf', color: '#dc2626', fn: 'reuPrintAta()' });
    items.push({ label: 'Enviar no chat', icon: 'fa-comments', color: '#7c3aed', fn: 'reuShareChat()' });
    items.push({ label: 'Copiar resumo', icon: 'fa-copy', fn: 'reuCopyLink()' });
    if (ed && _isRecurring(r)) { items.push('-'); items.push({ label: 'Trazer pendências da anterior', icon: 'fa-arrow-turn-down', fn: 'reuCarryPending()' }); }
    if (ed) { items.push('-'); items.push({ label: 'Excluir reunião', icon: 'fa-trash', danger: true, fn: `reuDelete('${_esc(r.id)}')` }); }
    _openPop(btn, _menuHtml(items).replace(/onclick="/g, 'onclick="reuClosePop();'));
}
function reuPopLembrete(btn) {
    const r = _cur(); if (!r) return;
    const opts = [[0, 'Sem lembrete'], [5, '5 min antes'], [15, '15 min antes'], [30, '30 min antes'], [60, '1 hora antes'], [1440, '1 dia antes']];
    _openPop(btn, _menuHtml(opts.map(([k, l]) => ({ label: l, icon: k ? 'fa-bell' : 'fa-bell-slash', on: (r.lembreteMin || 0) === k, fn: `reuClosePop();reuSetField('lembreteMin',${k || 'null'})` }))));
}
function reuPopMeet(btn) {
    const r = _cur(); if (!r) return;
    if (!_isOrg(r)) { _toast('Só o organizador e co-organizadores definem o Meet.', 'error'); return; }
    _openPop(btn, `<div class="reu-pop-title">Link do Google Meet</div>
        <input class="reu-pop-search" id="reuPopMeetIn" data-autofocus placeholder="https://meet.google.com/xxx-xxxx-xxx" value="${_esc(r.meetUrl || '')}" onkeydown="if(event.key==='Enter')reuSaveMeetPop()">
        <div class="reu-pop-foot"><a href="https://meet.google.com/new" target="_blank" rel="noopener">Criar sala nova</a><button class="reu-btn reu-btn--pri reu-btn--xs" onclick="reuSaveMeetPop()">Salvar</button></div>`, 'reu-pop--form');
}
function reuSaveMeetPop() {
    if (!_isOrg(_cur())) { _closePop(); return; }
    const v = (document.getElementById('reuPopMeetIn').value || '').trim();
    if (v && !MEET_RE.test(v)) _toast('Link não parece ser do Google Meet — salvo mesmo assim.', 'info');
    _closePop();
    reuSetField('meetUrl', v);
}
function reuPopResp(btn, path) {
    const r = _cur(); if (!r) return;
    if (!_isOrg(r)) { _toast('Só o organizador e co-organizadores definem responsáveis.', 'error'); return; }
    _userPop(btn, { title: 'Responsáveis', selected: _resps(_getAt(path)), multi: true, lotes: true, first: _partsAtuais(r), allowNone: true, only: true, onPick: id => {
        let cur = _resps(_getAt(path));
        if (!id) cur = [];
        else cur = cur.includes(String(id)) ? cur.filter(x => x !== String(id)) : cur.concat(String(id));
        _write(path, { responsaveis: cur.length ? cur : null, responsavel: cur[0] || '' }, true);
    } });
}
function reuPopParticipants(btn) {
    const r = _cur(); if (!r) return;
    _userPop(btn, { title: 'Participantes', selected: _partsAtuais(r), multi: true, lotes: true, lotesAll: true, onPick: id => reuToggleParticipant(id) });
}
function reuPopActWho(btn) {
    const r = _cur(); if (!r) return;
    _openPop(btn, `<div class="reu-pop-list">${_menuHtml([{ label: 'Todos os responsáveis', icon: 'fa-users', on: !_actFilter.who, fn: "reuActFilter('who','')" },
        { label: 'Sem responsável', icon: 'fa-user-slash', on: _actFilter.who === '_none', fn: "reuActFilter('who','_none')" }, '-']
        .concat(_partsAtuais(r).map(id => ({ label: _userName(id), icon: 'fa-user', on: String(_actFilter.who) === String(id), fn: `reuActFilter('who','${_esc(id)}')` }))))}</div>`);
}
function reuActFilter(k, v) { _actFilter[k] = v; _closePop(); _renderDetail(); }
function reuClosePop() { _closePop(); }
function reuAutogrow(t) { _autogrow(t); }
// --- Gravações (otimistas) ------------------------------------------------------------
function reuSetStatus(k) {
    const r = _guard(); if (!r) return;
    _closePop();
    const patch = { status: k };
    if (_isRecurring(r)) patch.cancelada = (k === 'cancelada') ? true : null;
    _write(_occPath(r, _open.date), patch, true);
}
function reuSetField(k, v) {
    const r = (k === 'descricao' || k === 'meetUrl') ? _guardOrg() : _guard(); if (!r) return;
    _write('reunioes/' + r.id, { [k]: v, atualizadoEm: Date.now() }, true);
}
function _guardOrg() {
    const r = _cur();
    if (r && _isOrg(r)) return r;
    _toast('Só o organizador pode alterar isto.', 'error'); return null;
}
// Confirmação no estilo do sistema (substitui o confirm() do navegador)
function _confirmBox(o) {
    return new Promise(res => {
        const el = document.createElement('div');
        el.className = 'reu-overlay reu-overlay--top open';
        el.style.zIndex = '10300';   // acima de popovers e da reunião
        const cor = o.perigo ? '#dc2626' : '#2563eb';
        el.innerHTML = `<div class="reu-modal reu-modal--scope" style="max-width:440px">
            <div class="reu-modal-head"><h3><i class="fas ${o.icone || 'fa-circle-question'}" style="color:${cor}"></i> ${_esc(o.titulo || 'Confirmar')}</h3></div>
            <div class="reu-modal-body" style="display:flex;gap:14px;align-items:flex-start">
                ${o.avatar ? `<span style="flex:none;transform:scale(1.5);margin:6px 8px 0 4px">${_avatar(o.avatar)}</span>` : ''}
                <div style="font-size:14px;line-height:1.55;color:inherit">${o.html || ''}</div>
            </div>
            <div class="reu-modal-foot"><span style="flex:1"></span>
                <button class="reu-btn" data-act="cancel">Cancelar</button>
                <button class="reu-btn reu-btn--pri" data-act="ok" style="background:${cor};border-color:${cor}">${_esc(o.ok || 'Confirmar')}</button></div></div>`;
        const close = v => { el.remove(); document.removeEventListener('keydown', onKey, true); res(v); };
        const onKey = e => {
            if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(false); }
            else if (e.key === 'Enter') { e.preventDefault(); close(true); }
        };
        el.addEventListener('click', e => {
            if (e.target === el) return close(false);
            const a = e.target.closest('[data-act]');
            if (a) close(a.dataset.act === 'ok');
        });
        document.addEventListener('keydown', onKey, true);
        document.body.appendChild(el);
        setTimeout(() => { const b = el.querySelector('[data-act=ok]'); if (b) b.focus(); }, 0);
    });
}
async function reuToggleCoOrg(uid) {
    // Lê da visão desta ocorrência: numa série, um ajuste "só este evento" guarda cópia de coOrg
    // na exceção (ov), que esconderia a mudança feita na série.
    const base = _cur(); const me = _me();
    const r = base && _open ? _occ(base, _open.date).r : base;
    uid = String(uid);
    const proprio = !!me && uid === me.id && _isCoOrg(r, uid);   // co-organizador pode sair do cargo
    if (!r || (!_isDono(r) && !proprio)) { _toast('Só o organizador define co-organizadores.', 'error'); return; }
    if (proprio && !_isDono(r) && !(await _confirmBox({ titulo: 'Deixar de ser co-organizador(a)?', icone: 'fa-user-xmark', perigo: true, ok: 'Sair do cargo',
        html: 'Você continua como participante, mas perde a edição dos detalhes e a visão da pauta inteira.' }))) return;
    const on = !_isCoOrg(r, uid);
    const co = Object.assign({}, r.coOrg || {});
    if (on) co[uid] = true; else delete co[uid];
    // grava o campo inteiro: _write descarta a cópia da exceção e a mudança aparece na hora
    _write('reunioes/' + r.id + '/coOrg', Object.keys(co).length ? co : null);
    _toast(on ? `${_userName(uid)} agora é co-organizador(a).` : `${_userName(uid)} deixou de ser co-organizador(a).`, 'success');
}
function reuPopOrganizador(btn) {
    const r = _cur(); if (!r || !_isDono(r)) return;
    const cands = (r.participantes || []).map(String).filter(id => id !== String(r.criadoPor));
    if (!cands.length) { _toast('Adicione participantes para transferir a propriedade.', 'info'); return; }
    _openPop(btn, _menuHtml(cands.map(id => ({ label: _userName(id), icon: 'fa-user', fn: `reuTransferOrg('${_esc(id)}')` }))));
}
async function reuTransferOrg(uid) {
    let r = _cur(); if (!r || !_isDono(r)) return;
    uid = String(uid);
    if (typeof reuClosePop === 'function') reuClosePop();
    if (!(await _confirmBox({ titulo: 'Transferir organizador', icone: 'fa-right-left', ok: 'Transferir', avatar: uid,
        html: `<b>${_esc(_userName(uid))}</b> passa a ser o(a) organizador(a) de <b>${_esc(r.titulo || 'esta reunião')}</b>.<br><span style="opacity:.75">Você vira co-organizador(a) e continua editando os detalhes.</span>` }))) return;
    r = _cur(); if (!r || !_isDono(r)) return;
    const parts = (r.participantes || []).map(String);
    if (!parts.includes(String(r.criadoPor))) parts.push(String(r.criadoPor));
    if (typeof reuClosePop === 'function') reuClosePop();
    const v = _open ? _occ(r, _open.date).r : r;
    const co = Object.assign({}, v.coOrg || {}); delete co[uid]; co[String(r.criadoPor)] = true;
    const ps = (v.participantes || parts).map(String); if (!ps.includes(String(r.criadoPor))) ps.push(String(r.criadoPor));
    // campo a campo: descarta cópias da exceção da ocorrência
    _write('reunioes/' + r.id + '/coOrg', co);
    _write('reunioes/' + r.id + '/participantes', ps);
    _write('reunioes/' + r.id + '/criadoPor', uid);
    _toast(`Organizador agora é ${_userName(uid)}.`, 'success');
}
function reuSetPresenca(uid, v) {
    const r = _guardOrg(); if (!r) return;
    _write(_occPath(r, _open.date) + '/presenca/' + uid, v || null);
}
function reuToggleParticipant(uid) {
    const r = _guard(); if (!r) return;
    const p = _partsAtuais(r);
    const next = p.includes(String(uid)) ? p.filter(x => x !== String(uid)) : p.concat(String(uid));
    _write('reunioes/' + r.id + '/participantes', next);
}
function reuTopicAdd() {
    const r = _guard(); if (!r) return;
    const o = _occ(r, _open.date);
    const n = Object.keys(o.topicos || {}).length;
    const tid = _uid('t');
    if (_tab !== 'pauta') _tab = 'pauta';
    _write(_occPath(r, _open.date) + '/topicos/' + tid, { titulo: 'Tópico ' + (n + 1), texto: '', ordem: Date.now(), itens: {} });
    const el = document.querySelector(`#reuDrawer [data-fk="t-${tid}"]`);
    if (el) { el.focus(); el.select(); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
}
function reuTopicSet(path, k, v) { if (_guard()) _write(path, { [k]: v }, true); }
function reuTopicDelete(path) {
    if (!_guard()) return;
    const t = path.split('/').reduce((o, k, i) => (i === 0 ? _data : o && o[k]), null);
    const go = () => {
        const anx = _anexosArr(t);
        Object.keys((t && t.itens) || {}).forEach(k => _anexosArr(t.itens[k]).forEach(a => anx.push(a)));
        anx.forEach(a => _pendDel.push(a));
        _write(path, null);
    };
    const hasContent = t && (t.texto || Object.keys(t.itens || {}).length);
    if (hasContent && typeof window._showConfirmDialog === 'function') {
        window._showConfirmDialog({ title: 'Excluir tópico?', message: 'O texto, os itens, subitens e anexos deste tópico serão removidos.', confirmLabel: 'Excluir', confirmClass: 'confirm-dlg-btn--danger', icon: 'fa-trash', onConfirm: go });
    } else go();
}
function reuItemAdd(topicPath, texto, pai, tipo, focus) {
    if (!_guard(pai ? topicPath + '/itens/' + pai : topicPath)) return;
    const itens = (_getAt(topicPath) || {}).itens || {};
    let ordem = Date.now();
    if (pai) {
        const kids = _sortedItems(itens).filter(x => x.pai === pai);
        if (kids.length) ordem = (kids[kids.length - 1].ordem || 0) + 1000;
        _collapsed.delete(pai);
    }
    const id = _uid('i');
    _write(topicPath + '/itens/' + id, { texto: String(texto || '').trim(), tipo: tipo || 'tarefa', checked: false, responsavel: '', pai: pai || null, ordem });
    if (pai) _syncParentCheck(topicPath + '/itens/' + id);
    if (focus) _focusBlock(id);
}
function reuItemSet(path, k, v) {
    if (!_guard(path)) return;
    _write(path, { [k]: v }, true);
    if (k === 'checked') _syncParentCheck(path);
}
// Tarefa-mãe acompanha as filhas: todas concluídas → mãe concluída; alguma aberta → mãe aberta
function _syncParentCheck(path) {
    const parts = path.split('/'); const bid = parts.pop(); parts.pop(); const tp = parts.join('/');
    const itens = (_getAt(tp) || {}).itens || {};
    let pid = itens[bid] && itens[bid].pai;
    while (pid && itens[pid]) {
        if (!_isTask(itens[pid])) break;
        const kids = Object.keys(itens).filter(k => itens[k] && itens[k].pai === pid && _isTask(itens[k]));
        if (!kids.length) break;
        const all = kids.every(k => itens[k].checked);
        if (!!itens[pid].checked === all) break;
        _write(tp + '/itens/' + pid, { checked: all }, true);
        pid = itens[pid].pai;
    }
}
function reuItemDelete(path) {
    if (!_guard(path)) return;
    const parts = path.split('/'); const bid = parts.pop(); parts.pop(); const tp = parts.join('/');
    const itens = (_getAt(tp) || {}).itens || {};
    const ids = [bid].concat(_descIds(itens, bid));
    const anx = [];
    ids.forEach(id => _anexosArr(itens[id]).forEach(a => anx.push(a)));
    const go = () => {
        anx.forEach(a => _pendDel.push(a));
        const patch = {}; ids.forEach(id => { patch[id] = null; });
        _write(tp + '/itens', patch, true);
    };
    if ((ids.length > 1 || anx.length) && typeof window._showConfirmDialog === 'function') {
        window._showConfirmDialog({ title: 'Excluir item?', message: (ids.length > 1 ? `Este item tem ${ids.length - 1} subitem(ns), que também serão excluídos.` : '') + (anx.length ? ` ${anx.length} anexo(s) serão removidos.` : ''),
            confirmLabel: 'Excluir', confirmClass: 'confirm-dlg-btn--danger', icon: 'fa-trash', onConfirm: go });
    } else go();
}
function reuRemoveLink(i) {
    const r = _guard(); if (!r) return;
    const v = (r.vinculos || []).slice(); v.splice(i, 1);
    _write('reunioes/' + r.id + '/vinculos', v);
}
function reuDuplicate(id) {
    const r = _data[id]; if (!r) return;
    reuOpenForm(null, _today(), r.horaInicio);
    _form = Object.assign(_form, JSON.parse(JSON.stringify({
        titulo: r.titulo + ' (cópia)', descricao: r.descricao || '', cor: r.cor, horaInicio: r.horaInicio, horaFim: r.horaFim,
        recorrencia: r.recorrencia || { tipo: 'nenhuma', intervalo: 1, diasSemana: [], ate: null },
        lembreteMin: r.lembreteMin || null, meetUrl: r.meetUrl || '', participantes: r.participantes || [], vinculos: r.vinculos || []
    })));
    _renderForm();
}
// Reunião recorrente: copia itens pendentes da ocorrência anterior para esta
function reuCarryPending() {
    const r = _guard(); if (!r || !_isRecurring(r)) return;
    let prev = null;
    for (let i = 1, s = _addDays(_open.date, -1); i < 400 && s >= r.data; i++, s = _addDays(s, -1)) {
        if (_occursOn(r, s)) { prev = s; break; }
    }
    if (!prev) { _toast('Não há ocorrência anterior.', 'info'); return; }
    const po = _occ(r, prev);
    const pend = _allItems(po).filter(x => !x.it.checked);
    if (!pend.length) { _toast('Nenhuma pendência na reunião de ' + _fmtDate(prev) + '.', 'info'); return; }
    const tid = _uid('t');
    const itens = {};
    pend.forEach((x, i) => { itens[_uid('i') + i] = { texto: x.it.texto, checked: false, responsavel: x.it.responsavel || '', responsaveis: x.it.responsaveis || null, prazo: x.it.prazo || null, ordem: Date.now() + i }; });
    _write(_occPath(r, _open.date) + '/topicos/' + tid, { titulo: 'Pendências de ' + _fmtDate(prev), texto: '', ordem: 0, itens });
    _tab = 'pauta'; _renderDetail();
    _toast(pend.length + ' pendência(s) trazida(s).', 'success');
}

// ---------------------------------------------------------------------------
// Vínculos — picker e abertura
// ---------------------------------------------------------------------------
let _linkTarget = 'detail';
function reuOpenLinkPicker(target) {
    _linkTarget = target;
    let el = document.getElementById('reuLinkModal');
    if (!el) {
        el = document.createElement('div');
        el.id = 'reuLinkModal'; el.className = 'reu-overlay reu-overlay--top';
        document.body.appendChild(el);
    }
    el.innerHTML = `<div class="reu-modal reu-modal--sm">
        <div class="reu-modal-head"><h3><i class="fas fa-link"></i> Vincular card</h3><span style="flex:1"></span><button class="reu-icon-btn" title="Fechar" onclick="reuCloseLinkPicker()"><i class="fas fa-times"></i></button></div>
        <div class="reu-modal-body">
            <div class="reu-area-tabs" id="reuLinkAreas"></div>
            <div class="reu-link-searchrow">
                <input class="reu-search" id="reuLinkSearch" placeholder="Buscar por título ou número..." oninput="reuRenderLinkList()">
                <button type="button" class="reu-link-new" id="reuLinkNew" onclick="reuLinkNovo()"><i class="fas fa-plus"></i></button>
            </div>
            <div class="reu-link-list" id="reuLinkList"></div>
        </div></div>`;
    el.classList.add('open');
    _renderLinkAreas();
    reuRenderLinkList();
    setTimeout(() => document.getElementById('reuLinkSearch').focus(), 50);
}
function reuCloseLinkPicker() { const el = document.getElementById('reuLinkModal'); if (el) el.classList.remove('open'); }
function _renderLinkAreas() {
    const nb = document.getElementById('reuLinkNew');
    if (nb) { const a = _area(_linkArea); nb.title = (a.key === 'rnc' || a.key === 'doc' ? 'Novo(a) ' : 'Nova ') + a.label; nb.style.setProperty('--c', a.color); }
    document.getElementById('reuLinkAreas').innerHTML = AREAS.map(a =>
        `<button class="${a.key === _linkArea ? 'on' : ''}" style="--c:${a.color}" onclick="reuSetLinkArea('${a.key}')"><i class="fas ${a.icon}"></i> ${a.label}</button>`).join('');
}
function reuSetLinkArea(k) { _linkArea = k; _renderLinkAreas(); reuRenderLinkList(); }
// "+" do Vincular card: abre o formulário de criação da área selecionada
function reuLinkNovo() {
    const k = _linkArea, nome = (typeof currentuser !== 'undefined' && currentuser) ? (currentuser.name || currentuser.user || '') : '';
    const form = (tipo, drawer, resp, zera) => {
        if (typeof resetModal !== 'function' || typeof openFormDrawer !== 'function') return false;
        try { zera(); } catch (_) {}
        if (typeof originalItem !== 'undefined') try { originalItem = null; } catch (_) {}
        resetModal(tipo);
        if (nome && typeof msSetValue === 'function') msSetValue(resp, [nome]);
        openFormDrawer(drawer);
        return true;
    };
    let ok = false;
    if (k === 'oc') ok = typeof window.ocOpenNew === 'function' && (window.ocOpenNew(), true);
    else if (k === 'rnc') ok = typeof window.rncOpenNew === 'function' && (window.rncOpenNew(), true);
    else if (k === 'ativ') ok = form('ativ', 'modalAtividades', 'ativ-resp', () => { editingAtivId = null; });
    else if (k === 'audit') ok = form('audit', 'modalAuditoria', 'audit-resp', () => { editingAuditId = null; });
    else if (k === 'doc') ok = form('doc', 'modalDocumentos', 'doc-resp', () => { editingDocId = null; });
    if (!ok) { _toast('Não foi possível abrir o formulário de ' + _area(k).label + '.', 'error'); return; }
    reuCloseLinkPicker();
    _toast('Depois de salvar, volte em Vincular card para vinculá-lo.', 'info');
}
function _cardTitle(area, c) {
    if (area === 'oc') {
        let tipo = '';
        try { const tipos = (masterLists && masterLists.ncTipos) || []; const t = tipos.find(x => x.id === c.tipoId); tipo = t ? t.name : ''; } catch (_) {}
        return (tipo || 'Ocorrência') + (c.colaborador ? ' — ' + c.colaborador : '') + (c.data ? ' (' + _fmtDate(c.data) + ')' : '');
    }
    return c.titulo || ('#' + c.id);
}
function reuRenderLinkList() {
    const a = _area(_linkArea);
    const q = (document.getElementById('reuLinkSearch').value || '').toLowerCase().trim();
    const current = (_linkTarget === 'form' ? (_form && _form.vinculos) : _linkTarget.indexOf('reunioes/') === 0 ? (_getAt(_linkTarget) || {}).vinculos : (_cur() && _cur().vinculos)) || [];
    let items = a.get().filter(c => c && !c.deleted);
    items = items.map(c => ({ c, t: _cardTitle(a.key, c) }));
    if (q) items = items.filter(x => x.t.toLowerCase().includes(q) || String(x.c.id).includes(q) || String(x.c.numero || '').includes(q));
    items = items.slice(-80).reverse();
    const box = document.getElementById('reuLinkList');
    box.innerHTML = items.length ? items.map(x => {
        const on = current.some(v => v.area === a.key && String(v.id) === String(x.c.id));
        return `<div class="reu-link-it ${on ? 'on' : ''}" onclick="reuPickLink('${a.key}','${_esc(x.c.id)}')">
            <span class="reu-link-ic" style="--c:${a.color}"><i class="fas ${a.icon}"></i></span>
            <span class="reu-link-t">${_esc(x.t)}${x.c.status ? `<small>${_esc(x.c.status)}</small>` : ''}</span>
            ${on ? '<i class="fas fa-check" style="color:#16a34a"></i>' : ''}</div>`;
    }).join('') : `<div class="reu-side-empty">Nenhum card encontrado.</div>`;
}
async function reuPickLink(area, id) {
    const a = _area(area);
    const c = a.get().find(x => String(x.id) === String(id));
    if (!c) return;
    const entry = { area, id: String(id), titulo: _cardTitle(area, c) };
    if (_linkTarget === 'form') {
        if (!_form.vinculos.some(v => v.area === area && String(v.id) === String(id))) _form.vinculos.push(entry);
        reuCloseLinkPicker(); _renderForm();
        return;
    }
    if (_linkTarget.indexOf('reunioes/') === 0) {
        if (!_guard(_linkTarget)) return;
        const nv = ((_getAt(_linkTarget) || {}).vinculos || []).slice();
        reuCloseLinkPicker();
        if (!nv.some(x => x.area === area && String(x.id) === String(id))) { nv.push(entry); _write(_linkTarget + '/vinculos', nv); }
        return;
    }
    const r = _guard(); if (!r) return;
    const v = (r.vinculos || []).slice();
    if (v.some(x => x.area === area && String(x.id) === String(id))) { reuCloseLinkPicker(); return; }
    v.push(entry);
    reuCloseLinkPicker();
    _write('reunioes/' + r.id + '/vinculos', v);
}
function reuOpenLinked(area, id) {
    const numId = /^\d+$/.test(String(id)) ? Number(id) : id;
    try {
        if (area === 'rnc') window.rncOpenView(numId);
        else if (area === 'oc') window.ocOpenView(id);
        else openView(numId, area);
    } catch (e) { _toast('Card indisponível.', 'error'); }
}

// Reuniões que vinculam um card (vínculo reverso, calculado em memória)
function reuGetVinculadas(area, id) {
    const hit = arr => (arr || []).some(v => v.area === area && String(v.id) === String(id));
    const inTopics = tps => Object.values(tps || {}).some(t => t && (hit(t.vinculos) || Object.values(t.itens || {}).some(it => it && hit(it.vinculos))));
    return Object.values(_data).filter(r => r && (hit(r.vinculos) || inTopics(r.topicos) || inTopics(r.topicosModelo) || Object.values(r.excecoes || {}).some(e => e && inTopics(e.topicos))))
        .sort((a, b) => String(b.data).localeCompare(String(a.data)));
}
function _reverseHtml(area, id) {
    const list = reuGetVinculadas(area, id);
    if (!list.length) return '';
    return `<div class="reu-rev"><div class="reu-rev-t"><i class="fas fa-people-group"></i> Reuniões vinculadas (${list.length})</div>
        ${list.map(r => {
            const st = STATUS[_isRecurring(r) ? 'agendada' : (r.status || 'agendada')];
            return `<div class="reu-rev-it" style="--c:${_esc(r.cor || COLORS[0])}" onclick="reuOpen('${_esc(r.id)}')">
                <b>${_esc(r.titulo)}</b><span>${_fmtDate(r.data)} · ${_esc(r.horaInicio)}${_isRecurring(r) ? ' · <i class="fas fa-repeat"></i>' : ''}</span>
                <span class="reu-st ${st.cls}">${st.label}</span></div>`;
        }).join('')}</div>`;
}
function _inject(container, area, id) {
    if (!container) return;
    const old = container.querySelector(':scope > .reu-rev');
    if (old) old.remove();
    const html = _reverseHtml(area, id);
    if (html) container.insertAdjacentHTML('beforeend', html);
}
function _tabToArea(tab) {
    if (tab === 'audit' || tab === 'auditoria') return 'audit';
    if (tab === 'ativ' || tab === 'atividades') return 'ativ';
    if (tab === 'doc' || tab === 'documentos') return 'doc';
    return null;
}
// Envolve as telas de visualização dos outros módulos para mostrar o vínculo reverso
function _installReverseHooks() {
    if (typeof window.renderViewContent === 'function' && !window.renderViewContent._reu) {
        const orig = window.renderViewContent;
        const wrapped = function (id, tab) {
            const res = orig.apply(this, arguments);
            try { const a = _tabToArea(tab); if (a) _inject(document.getElementById('viewContent'), a, id); } catch (_) {}
            return res;
        };
        wrapped._reu = true;
        window.renderViewContent = wrapped;
        try { renderViewContent = wrapped; } catch (_) {}
    }
    if (typeof window.rncOpenView === 'function' && !window.rncOpenView._reu) {
        const orig = window.rncOpenView;
        window.rncOpenView = function (id) {
            const res = orig.apply(this, arguments);
            try { _inject(document.getElementById('rnc-vinfo'), 'rnc', id); } catch (_) {}
            return res;
        };
        window.rncOpenView._reu = true;
    }
    if (typeof window.ocOpenView === 'function' && !window.ocOpenView._reu) {
        const orig = window.ocOpenView;
        window.ocOpenView = function (id) {
            const res = orig.apply(this, arguments);
            try { _inject(document.getElementById('ocViewPanelInfo'), 'oc', id); } catch (_) {}
            return res;
        };
        window.ocOpenView._reu = true;
    }
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------
function reuShareChat() {
    const r = _cur(); if (!r) return;
    if (typeof window.msgComposeWithCard !== 'function') { _toast('Chat indisponível.', 'error'); return; }
    const o = _occ(r, _open.date);
    window.msgComposeWithCard({ area: 'reuniao', id: String(r.id), titulo: o.r.titulo + ' · ' + _fmtDate(o.day) + ' ' + o.r.horaInicio });
}
// Extra exibido no chip de reunião dentro do chat (horário + botão Meet)
function reuChatChipExtra(id) {
    const r = _data[id];
    if (!r) return '';
    return r.meetUrl ? `<a class="msg-chip reu-chat-meet" href="${_esc(r.meetUrl)}" target="_blank" rel="noopener" onclick="event.stopPropagation()"><i class="fas fa-video"></i><span>Entrar no Meet</span></a>` : '';
}
function reuListForChat() {
    const t = _today();
    return Object.values(_data).filter(r => r && r.id && (_isRecurring(r) ? (!r.recorrencia.ate || r.recorrencia.ate >= t) : r.data >= _addDays(t, -7)))
        .map(r => ({ id: r.id, titulo: r.titulo + ' · ' + _fmtDate(r.data) + ' ' + r.horaInicio, status: '', setor: _recLabel(r) }));
}
function reuCopyLink() {
    const r = _cur(); if (!r) return;
    const v = _occ(r, _open.date);
    const txt = `📅 ${v.r.titulo}\n${_fmtLong(v.day)} · ${v.r.horaInicio}–${v.r.horaFim}` + (v.r.meetUrl ? `\n🎥 ${v.r.meetUrl}` : '');
    try { navigator.clipboard.writeText(txt).then(() => _toast('Resumo copiado.', 'success')); } catch (_) { _toast('Não foi possível copiar.', 'error'); }
}

// ---------------------------------------------------------------------------
// Lembretes (Notification do navegador + toast, com o sistema aberto)
// ---------------------------------------------------------------------------
function _checkReminders() {
    _refreshBell();
    if (!_me()) return;
    const now = new Date();
    const today = _ds(now), tomorrow = _addDays(today, 1);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    _occurrences(today, tomorrow).forEach(o => {
        const r = o.r;
        if (!r.lembreteMin || o.status !== 'agendada' || o.day < today || !_isMine(r)) return;
        const startMin = _minutes(r.horaInicio) + (o.day === tomorrow ? 1440 : 0);
        const diff = startMin - nowMin;
        if (diff < 0 || diff > r.lembreteMin) return;
        const key = 'reuLembrado_' + r.id + '_' + o.day;
        try { if (localStorage.getItem(key)) return; localStorage.setItem(key, '1'); } catch (_) {}
        const msg = `${r.titulo} começa ${diff <= 0 ? 'agora' : 'em ' + (diff >= 60 ? Math.round(diff / 60) + 'h' : diff + ' min')} (${r.horaInicio})`;
        _toast('🔔 ' + msg, 'info');
        if ('Notification' in window && Notification.permission === 'granted') {
            try {
                const n = new Notification('Reunião', { body: msg, icon: LOGO_COLOR, tag: key });
                n.onclick = () => { window.focus(); if (r.meetUrl) window.open(r.meetUrl, '_blank'); else reuOpen(o.base.id, o.date); n.close(); };
            } catch (_) {}
        }
    });
    _refreshBadge();
}

// ---------------------------------------------------------------------------
// Ata em PDF
// ---------------------------------------------------------------------------
function reuPrintAta() {
    const r = _cur(); if (!r) return;
    const html = _ataHtml(r, _open.date);
    const w = window.open('', '_blank');
    if (!w) { _toast('Permita pop-ups para gerar a ata.', 'error'); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
}

function _ataHtml(r, date) {
    const o = _occ(r, date);
    r = o.r;
    date = o.day;
    const st = STATUS[o.status] || STATUS.agendada;
    const me = _me();
    const topics = _sortedTopics(o.topicos);
    const now = new Date();
    const geradoEm = _fmtDate(_ds(now)) + ' ' + _pad(now.getHours()) + ':' + _pad(now.getMinutes());
    const ataNo = 'ATA-' + date.replace(/-/g, '') + '-' + String(r.id).slice(-4).toUpperCase();
    const actions = [];
    const tag = ids => (ids || []).map(id => _mkDef(id, r)).filter(Boolean).map(m => `<span class="tg" style="--t:${_esc(m.cor)}">${_esc(m.nome)}</span>`).join('');
    const anxList = obj => { const a = _anexosArr(obj); return a.length ? `<div class="anx">${a.map(x => `<span>📎 ${x.url ? `<a href="${_esc(x.url)}">${_esc(x.nome)}</a>` : _esc(x.nome)}</span>`).join('')}</div>` : ''; };
    const renderNodes = (nodes) => nodes.length ? `<ul class="cl">${nodes.map(n => {
        const it = n.it, task = _isTask(it);
        const line = task
            ? `<span class="box">${it.checked ? '✓' : ''}</span><span class="it">${_esc(it.texto)}</span>${tag(it.marcadores)}${it.prazo ? `<span class="due ${_isOverdue(it) ? 'late' : ''}">${_fmtDate(it.prazo).slice(0, 5)}</span>` : ''}${_resps(it).length ? `<span class="who">${_esc(_resps(it).map(_userName).join(', '))}</span>` : ''}`
            : `<span class="para">${_esc(it.texto).replace(/\n/g, '<br>')}</span>${tag(it.marcadores)}`;
        return `<li class="${task ? (it.checked ? 'ok' : '') : 'txtb'}"><div class="ln">${line}</div>${anxList(it)}${renderNodes(n.children)}</li>`;
    }).join('')}</ul>` : '';
    _allItems(o).forEach(x => actions.push({ t: x.it.texto, who: _resps(x.it).length ? _resps(x.it).map(_userName).join(', ') : '—', ok: x.it.checked, prazo: x.it.prazo, late: _isOverdue(x.it), n: (x.ti + 1) + '.' + (actions.filter(a => a.ti === x.ti).length + 1), ti: x.ti }));
    const topicsHtml = topics.map((t, i) => {
        const tree = _tree(t.itens);
        const tasks = _flatTree(tree).filter(n => _isTask(n.it));
        const done = tasks.filter(n => n.it.checked).length;
        return `<section class="topic">
            <div class="topic-h"><span class="num">${i + 1}</span><h3>${_esc(t.titulo || 'Tópico ' + (i + 1))}</h3>${tag(t.marcadores)}
                ${tasks.length ? `<span class="prog"><span class="bar"><span style="width:${Math.round(done / tasks.length * 100)}%"></span></span>${done}/${tasks.length}</span>` : ''}</div>
            ${(t.resp || []).length ? `<div class="tresp">Responsável: ${(t.resp || []).map(id => _esc(_userName(id))).join(', ')}</div>` : ''}
            ${t.texto && t.texto.trim() ? `<p class="txt">${_esc(t.texto).replace(/\n/g, '<br>')}</p>` : ''}
            ${renderNodes(tree)}
            ${anxList(t) ? `<div class="tanx">${anxList(t)}</div>` : ''}
        </section>`;
    }).join('') || '<p class="empty">Nenhum tópico registrado para esta reunião.</p>';
    const anxGeral = _anexosArr(_data[r.id]);
    const presLbl = { p: 'Presente', a: 'Ausente', j: 'Justificado' };
    const people = (r.participantes || []).map(id => { const pr = (o.presenca || {})[id]; return `<span class="pp ${pr ? 'pr-' + pr : ''}"><span class="av">${_esc(_initials(_userName(id)))}</span>${_esc(_userName(id))}${pr ? `<em>${presLbl[pr]}</em>` : ''}</span>`; }).join('') || '<span class="muted">—</span>';
    const links = (r.vinculos || []).map(v => { const a = _area(v.area); return `<span class="lk" style="--c:${a.color}"><b>${_esc(a.label)}</b> ${_esc(v.titulo || '#' + v.id)}</span>`; }).join('');
    const stColor = { agendada: '#2563eb', realizada: '#16a34a', cancelada: '#dc2626' }[o.status] || '#2563eb';
    const signers = [r.criadoPor].concat((r.participantes || []).filter(p => String(p) !== String(r.criadoPor))).slice(0, 6);
    const footTxt = ('LAMIC · Ata ' + ataNo + ' · Gerado em ' + geradoEm + (me ? ' por ' + me.name : '')).replace(/["\\]/g, '');
    const title = `Ata - ${r.titulo} - ${_fmtDate(date)}`.replace(/[\\/:*?"<>|]/g, '-');

    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${_esc(title)}</title>
<style>
@page { size: A4; margin: 14mm 15mm 18mm;
  @bottom-left { content: "${footTxt}"; font: 7.5pt "Segoe UI", Arial, sans-serif; color: #64748b; }
  @bottom-right { content: "Página " counter(page) " de " counter(pages); font: 7.5pt "Segoe UI", Arial, sans-serif; color: #64748b; } }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
:root { --pri:#0f172a; --acc:#2563eb; --soft:#dbeafe; --tx:#1e293b; --mut:#64748b; --bd:#e2e8f0; --bg:#f8fafc; }
html, body { margin: 0; background: #e2e8f0; color: var(--tx); font: 10.5pt/1.55 "Segoe UI", Inter, Roboto, Arial, sans-serif; }
.bar-tools { position: sticky; top: 0; z-index: 10; display: flex; gap: 8px; justify-content: center; align-items: center; padding: 10px; background: #0f172a; color: #cbd5e1; font-size: 13px; }
.bar-tools button { border: 0; border-radius: 8px; padding: 8px 16px; font: 600 13px "Segoe UI", Arial; cursor: pointer; }
.bar-tools .p { background: #2563eb; color: #fff; } .bar-tools .c { background: #334155; color: #e2e8f0; }
.page { width: 210mm; min-height: 297mm; margin: 18px auto; background: #fff; box-shadow: 0 10px 40px rgba(15,23,42,.18); padding: 0 0 16mm; position: relative; }
.hdr { background: var(--pri); color: #fff; padding: 9mm 15mm 7mm; display: flex; align-items: center; gap: 14px; border-bottom: 3px solid var(--acc); }
.hdr .logo { height: 34px; width: auto; display: block; }
.hdr .logo-fb { font: 800 20px/1 "Segoe UI", Arial; letter-spacing: 2px; }
.hdr .sep { width: 1px; height: 30px; background: rgba(255,255,255,.25); }
.hdr .doc { font-size: 9pt; letter-spacing: 1.6px; text-transform: uppercase; color: #93c5fd; font-weight: 700; }
.hdr .doc b { display: block; color: #fff; font-size: 13pt; letter-spacing: .3px; text-transform: none; margin-top: 2px; }
.hdr .right { margin-left: auto; text-align: right; font-size: 8.5pt; color: #cbd5e1; line-height: 1.5; }
.hdr .right b { color: #fff; font-size: 10pt; }
.wrap { padding: 8mm 15mm 0; }
.title { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 6mm; }
.title h1 { margin: 0; font-size: 20pt; line-height: 1.2; color: var(--pri); letter-spacing: -.3px; flex: 1; }
.status { flex-shrink: 0; margin-top: 4px; padding: 4px 12px; border-radius: 99px; font-size: 8.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: .8px; color: ${stColor}; background: ${stColor}14; border: 1px solid ${stColor}40; }
.info { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid var(--bd); border-radius: 10px; overflow: hidden; margin-bottom: 6mm; background: var(--bg); }
.info div { padding: 8px 12px; border-bottom: 1px solid var(--bd); }
.info div:nth-child(odd) { border-right: 1px solid var(--bd); }
.info div:nth-last-child(-n+2) { border-bottom: 0; }
.info small { display: block; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 1px; color: var(--mut); font-weight: 700; }
.info span { font-weight: 600; color: var(--pri); }
.info a { color: var(--acc); text-decoration: none; font-weight: 600; }
h2 { font-size: 9pt; text-transform: uppercase; letter-spacing: 1.4px; color: var(--acc); margin: 6mm 0 3mm; display: flex; align-items: center; gap: 8px; }
h2::after { content: ""; flex: 1; height: 1px; background: var(--bd); }
.desc { margin: 0; color: #334155; }
.pps { display: flex; flex-wrap: wrap; gap: 6px; }
.pp { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px 3px 3px; border: 1px solid var(--bd); border-radius: 99px; font-size: 9pt; font-weight: 600; }
.av { width: 20px; height: 20px; border-radius: 50%; background: var(--soft); color: var(--acc); display: inline-flex; align-items: center; justify-content: center; font-size: 7.5pt; font-weight: 800; }
.lks { display: flex; flex-wrap: wrap; gap: 6px; }
.lk { font-size: 8.8pt; padding: 3px 10px; border-radius: 6px; background: color-mix(in srgb, var(--c) 9%, white); border-left: 3px solid var(--c); }
.lk b { color: var(--c); font-size: 7.5pt; text-transform: uppercase; letter-spacing: .6px; margin-right: 4px; }
.topic { border: 1px solid var(--bd); border-left: 4px solid var(--acc); border-radius: 8px; padding: 10px 14px; margin-bottom: 4mm; break-inside: avoid; page-break-inside: avoid; }
.topic-h { display: flex; align-items: center; gap: 10px; }
.topic-h h3 { margin: 0; font-size: 11.5pt; color: var(--pri); flex: 1; }
.num { width: 22px; height: 22px; border-radius: 6px; background: var(--pri); color: #fff; font-weight: 800; font-size: 9pt; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.prog { display: inline-flex; align-items: center; gap: 6px; font-size: 8pt; color: var(--mut); font-weight: 700; }
.prog .bar { width: 60px; height: 5px; border-radius: 9px; background: var(--bd); overflow: hidden; display: inline-block; }
.prog .bar span { display: block; height: 100%; background: #16a34a; }
.txt { margin: 6px 0 0 32px; color: #334155; }
.cl { list-style: none; margin: 6px 0 0 32px; padding: 0; }
.cl li { display: flex; align-items: center; gap: 8px; padding: 4px 0; border-bottom: 1px dashed var(--bd); }
.cl li:last-child { border-bottom: 0; }
.box { width: 14px; height: 14px; border: 1.5px solid #94a3b8; border-radius: 4px; display: inline-flex; align-items: center; justify-content: center; font-size: 9pt; font-weight: 900; color: #fff; flex-shrink: 0; }
.cl li.ok .box { background: #16a34a; border-color: #16a34a; }
.cl li.ok .it { color: var(--mut); text-decoration: line-through; }
.it { flex: 1; }
.pp em { font-style: normal; font-size: 7pt; font-weight: 700; padding: 1px 6px; border-radius: 99px; margin-left: 2px; }
.pp.pr-p em { background: #dcfce7; color: #166534; } .pp.pr-a em { background: #fee2e2; color: #991b1b; } .pp.pr-j em { background: #fef3c7; color: #92400e; }
.pp.pr-a { opacity: .7; }
.due { font-size: 8pt; color: var(--mut); border: 1px solid var(--bd); padding: 0 6px; border-radius: 99px; } .due.late, td.late { color: #dc2626; font-weight: 700; }
.cl .cl { margin-left: 22px; margin-top: 2px; }
.cl li { flex-wrap: wrap; }
.cl li .ln { display: flex; align-items: center; gap: 8px; width: 100%; }
.cl li.txtb .para { flex: 1; color: #334155; font-style: italic; }
.cl li > .cl { width: 100%; }
.tg { font-size: 7pt; font-weight: 700; padding: 1px 7px; border-radius: 99px; color: var(--t); background: color-mix(in srgb, var(--t) 12%, white); border: 1px solid color-mix(in srgb, var(--t) 35%, white); white-space: nowrap; }
.tresp { margin: 4px 0 0 32px; font-size: 8.5pt; color: var(--mut); }
.anx { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 8pt; margin: 2px 0 0 22px; width: 100%; }
.anx a { color: var(--acc); text-decoration: none; }
.anx--g, .tanx .anx { margin-left: 0; }
.tanx { margin: 6px 0 0 32px; }
.who { font-size: 8pt; color: var(--acc); background: var(--soft); padding: 1px 8px; border-radius: 99px; font-weight: 600; }
table { width: 100%; border-collapse: collapse; font-size: 9pt; break-inside: auto; }
thead { display: table-header-group; }
th { background: var(--pri); color: #fff; text-align: left; padding: 7px 10px; font-size: 8pt; text-transform: uppercase; letter-spacing: .8px; }
th:first-child { border-radius: 6px 0 0 0; } th:last-child { border-radius: 0 6px 0 0; }
td { padding: 6px 10px; border-bottom: 1px solid var(--bd); }
tr { break-inside: avoid; }
tbody tr:nth-child(even) td { background: var(--bg); }
.tag { font-size: 7.5pt; font-weight: 700; padding: 2px 8px; border-radius: 99px; text-transform: uppercase; letter-spacing: .5px; }
.tag.ok { background: #dcfce7; color: #166534; } .tag.pend { background: #fef3c7; color: #92400e; }
.signs { display: grid; grid-template-columns: 1fr 1fr; gap: 12mm 14mm; margin-top: 12mm; break-inside: avoid; }
.sign { border-top: 1px solid #475569; padding-top: 4px; text-align: center; font-size: 9pt; font-weight: 600; }
.sign small { display: block; color: var(--mut); font-weight: 400; font-size: 7.5pt; }
.empty, .muted { color: var(--mut); font-style: italic; }
.ftr { position: absolute; left: 15mm; right: 15mm; bottom: 6mm; display: flex; align-items: center; gap: 8px; font-size: 7.5pt; color: var(--mut); border-top: 1px solid var(--bd); padding-top: 3mm; }
.ftr img { height: 14px; opacity: .8; }
.ftr .pg { margin-left: auto; }
@media print {
  html, body { background: #fff; }
  .bar-tools { display: none; }
  .page { width: auto; min-height: 0; margin: 0; box-shadow: none; padding: 0; }
  .hdr { margin: 0; border-radius: 0; }
  .wrap { padding: 6mm 0 0; }
  .hdr { padding: 7mm 6mm 6mm; }
  .ftr { position: static; margin: 10mm 0 0; }
  .ftr .pg { display: none; }
}
</style></head><body>
<div class="bar-tools"><span>Pré-visualização da ata</span><button class="p" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button><button class="c" onclick="window.close()">Fechar</button></div>
<div class="page">
  <header class="hdr">
    <img class="logo" referrerpolicy="no-referrer" src="${LOGO_WHITE}" alt="LAMIC" onerror="this.outerHTML='<span class=&quot;logo-fb&quot;>LAMIC</span>'">
    <span class="sep"></span>
    <div class="doc">Documento<b>Ata de Reunião</b></div>
    <div class="right"><b>${ataNo}</b><br>${_fmtDate(date)}</div>
  </header>
  <div class="wrap">
    <div class="title"><h1>${_esc(r.titulo)}</h1><span class="status">${st.label}</span></div>
    <div class="info">
      <div><small>Data</small><span>${_fmtLong(date)}</span></div>
      <div><small>Horário</small><span>${_esc(r.horaInicio)} – ${_esc(r.horaFim)} (${_duration(r)})</span></div>
      <div><small>Recorrência</small><span>${_esc(_recLabel(r))}</span></div>
      <div><small>Local</small>${r.meetUrl ? `<a href="${_esc(r.meetUrl)}">Google Meet · ${_esc(r.meetUrl.replace(/^https?:\/\//, ''))}</a>` : '<span>Presencial</span>'}</div>
      <div><small>Organizador</small><span>${_esc(_userName(r.criadoPor))}</span></div>
      <div><small>Participantes</small><span>${(r.participantes || []).length}</span></div>
    </div>
    ${r.descricao ? `<h2>Objetivo</h2><p class="desc">${_esc(r.descricao).replace(/\n/g, '<br>')}</p>` : ''}
    <h2>Participantes</h2><div class="pps">${people}</div>
    ${links ? `<h2>Itens vinculados</h2><div class="lks">${links}</div>` : ''}
    ${anxGeral.length ? `<h2>Anexos</h2><div class="anx anx--g">${anxGeral.map(x => `<span>📎 ${x.url ? `<a href="${_esc(x.url)}">${_esc(x.nome)}</a>` : _esc(x.nome)}</span>`).join('')}</div>` : ''}
    <h2>Pauta e deliberações</h2>
    ${topicsHtml}
    ${actions.length ? `<h2>Ações e responsáveis</h2>
    <table><thead><tr><th style="width:34px">#</th><th>Ação</th><th style="width:120px">Responsável</th><th style="width:70px">Prazo</th><th style="width:86px">Status</th></tr></thead>
    <tbody>${actions.map((a, i) => `<tr><td>${a.n}</td><td>${_esc(a.t)}</td><td>${_esc(a.who)}</td><td class="${a.late ? 'late' : ''}">${a.prazo ? _fmtDate(a.prazo).slice(0, 5) : '—'}</td><td><span class="tag ${a.ok ? 'ok' : 'pend'}">${a.ok ? 'Concluída' : 'Pendente'}</span></td></tr>`).join('')}</tbody></table>` : ''}
    <h2>Assinaturas</h2>
    <div class="signs">${signers.map((id, i) => `<div class="sign">${_esc(_userName(id))}<small>${i === 0 ? 'Organizador' : 'Participante'}</small></div>`).join('')}</div>
  </div>
  <footer class="ftr">
    <img referrerpolicy="no-referrer" src="${LOGO_COLOR}" alt="" onerror="this.remove()">
    <span>Gerado em ${geradoEm}${me ? ' por ' + _esc(me.name) : ''} · ${_esc(r.id)}</span>
    <span class="pg">${ataNo}</span>
  </footer>
</div>
<script>
(function(){
  var imgs = Array.prototype.slice.call(document.images), left = imgs.length, done = false;
  function ready(){ if (done) return; done = true; setTimeout(function(){ window.focus(); window.print(); }, 250); }
  if (!left) ready();
  imgs.forEach(function(im){ if (im.complete) { if (!--left) ready(); } else { im.onload = im.onerror = function(){ if (!--left) ready(); }; } });
  setTimeout(ready, 3000);
})();
<\/script>
</body></html>`;
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    // Esc fecha só popovers (menus). Janelas fecham apenas pelos botões.
    if (_pop) { _closePop(); return; }
});

function _boot() {
    _installReverseHooks();
    const tryStart = () => { if (_me() && _db()) startReunioesListener(); else setTimeout(tryStart, 1200); };
    setTimeout(tryStart, 1500);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _boot); else _boot();

Object.assign(window, {
    startReunioesListener, stopReunioesListener, reuActivateTab,
    reuSetView, reuNav, reuGoDay, reuDayClick, reuSlotClick,
    reuOpenForm, reuCloseForm, reuSaveForm, reuDelete, reuF, reuFRec, reuFToggleWd, reuFormToggleUser, reuFormRemoveLink, reuRerenderForm, reuMeetHint,
    reuOpen, reuCloseDetail, reuSetStatus, reuTopicAdd, reuTopicSet, reuTopicDelete, reuItemAdd, reuItemSet, reuItemDelete, reuRemoveLink,
    reuTab, reuPopStatus, reuPopMenu, reuPopLembrete, reuPopMeet, reuSaveMeetPop, reuPopResp, reuPopPickLote, reuPopParticipants, reuPopActWho, reuActFilter,
    reuClosePop, reuAutogrow, reuAddKey, reuSetField, reuSetPresenca, reuPopOrganizador, reuTransferOrg, reuToggleCoOrg, reuToggleParticipant, reuDuplicate, reuCarryPending,
    reuPopSearch, reuPopPick, reuFormPopUsers, reuFormPartsAll, reuFormPartsClear, reuMiniNav, reuMiniPick,
    reuPopMarcadores, reuMkToggle, reuMkCreate, reuMkColor, reuMkSetColor, reuMkRename, reuMkDelete, reuPopTopic, reuPopTopicResp, reuPopBlock, reuPopActMk,
    reuToggleCollapse, reuBlkKey, reuIndent, reuBlkDragStart, reuDetailSave, reuDetailDiscard, reuTopicMove, reuShowShortcuts, reuBlkMove, reuToggleBell, reuCloseBell, reuClearAvisos, reuBellOpen, reuRemoveNodeLink, reuOpenAttach, reuCloseAttach, reuAnxFiles, reuAnxAddLink, reuOpenAnexo, reuDeleteAnexo, reuRenameAnexo,
    reuOpenLinkPicker, reuCloseLinkPicker, reuSetLinkArea, reuLinkNovo, reuRenderLinkList, reuPickLink, reuOpenLinked, reuGetVinculadas,
    reuShareChat, reuChatChipExtra, reuListForChat, reuCopyLink, reuPrintAta
});
})();
