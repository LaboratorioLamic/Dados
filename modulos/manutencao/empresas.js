// ═══════════════════════════════════════════════════════════════
// empresas.js — Módulo de Empresas Terceirizadas — Manutenção LAMIC
// ═══════════════════════════════════════════════════════════════

const EMP_KEY = 'gestao-empresas-v1';

let empState = { empresas: [] };

function _empCanManage() {
  if (typeof currentSession === 'undefined' || !currentSession) return true;
  if (currentSession.isAdmin) return true;
  return typeof authHasPermission === 'function' && authHasPermission('config.gerenciarEmpresas');
}

function empSave() {
  window.dbSave(EMP_KEY, empState);
}

function empLoad() {
  window._dbReady.then(() => {
    window.dbListen(EMP_KEY, (data) => {
      if (data && Array.isArray(data.empresas)) empState.empresas = data.empresas;
      empRenderTable();
    });
  });
}

// ── ESTADO LOCAL ──────────────────────────────────────────────
let _empFormId      = null;
let _empViewId      = null;
let _empSearchQ     = '';
let _empContatos    = [];   // lista de contatos temporária no form
let _empResps       = [];   // lista de responsáveis técnicos temporária
let _empAnexos      = [];   // anexos temporários no form
let _empUploadCtx   = 'emp-form';

// ── INICIALIZAÇÃO ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  empLoad();
  _empInjectModals();
  setTimeout(() => {
    if (typeof initUploadZone === 'function') initUploadZone(_empUploadCtx);
    _uploadQueues[_empUploadCtx]   = { file: null, dataUrl: null };
    _SAVE_BTN_IDS[_empUploadCtx]   = 'btn-emp-form-save';
    _uploadsInProgress[_empUploadCtx] = false;
  }, 200);
});

// ── TABELA PRINCIPAL ──────────────────────────────────────────
function empRenderTable() {
  const tbody = document.getElementById('emp-tbody');
  if (!tbody) return;
  const q = _empSearchQ.toLowerCase();
  const list = empState.empresas.filter(e =>
    !q || `${e.nome} ${e.cnpj} ${e.email}`.toLowerCase().includes(q)
  );
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="data-table-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
      <strong>Nenhuma empresa cadastrada</strong>
      <p>Cadastre empresas terceirizadas para vincular às OTs</p>
    </div></td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(e => `
    <tr style="cursor:pointer;" onclick="empOpenView('${e.id}')">
      <td>
        <div style="font-weight:600;color:var(--text-primary);">${_empEsc(e.nome)}</div>
        ${e.cnpj ? `<div style="font-size:11px;color:var(--text-muted);font-family:'DM Mono',monospace;">${_empEsc(e.cnpj)}</div>` : ''}
      </td>
      <td style="font-size:13px;color:var(--text-secondary);">${e.contatos?.[0]?.valor ? _empEsc(e.contatos[0].valor) : '—'}</td>
      <td style="font-size:13px;color:var(--text-secondary);">${_empEsc(e.email || '—')}</td>
      <td style="text-align:right;white-space:nowrap;" onclick="event.stopPropagation()">
        ${_empCanManage() ? `
        <button class="btn btn-outline btn-icon" title="Editar" onclick="empOpenForm('${e.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;">
            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/>
          </svg>
        </button>
        <button class="btn btn-outline btn-icon" title="Excluir" onclick="empConfirmDelete('${e.id}')"
          style="color:var(--red);border-color:rgba(230,57,70,.3);margin-left:4px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
          </svg>
        </button>` : ''}
      </td>
    </tr>`).join('');
}

function empSearchChange(v) {
  _empSearchQ = v;
  empRenderTable();
}

// ── ABRIR FORM ────────────────────────────────────────────────
function empOpenForm(id) {
  if (!_empCanManage()) {
    if (typeof showToast === 'function') showToast('Você não tem permissão para gerenciar empresas.', 'error');
    return;
  }
  _empFormId   = id || null;
  const e      = id ? empState.empresas.find(x => x.id === id) : null;

  document.getElementById('emp-form-title').textContent    = e ? 'Editar Empresa' : 'Nova Empresa';
  document.getElementById('emp-form-save-lbl').textContent = e ? 'Salvar Alterações' : 'Cadastrar';

  // Dados básicos
  _empSetField('emp-f-nome',     e?.nome     || '');
  _empSetField('emp-f-cnpj',     e?.cnpj     || '');
  _empSetField('emp-f-email',    e?.email    || '');
  _empSetField('emp-f-endereco', e?.endereco || '');
  _empSetField('emp-f-cep',      e?.cep      || '');
  _empSetField('emp-f-contrato', e?.contrato || '');

  // Listas temporárias
  _empContatos = e?.contatos  ? JSON.parse(JSON.stringify(e.contatos))  : [];
  _empResps    = e?.responsaveis ? JSON.parse(JSON.stringify(e.responsaveis)) : [];
  _empAnexos   = e?.anexos    ? JSON.parse(JSON.stringify(e.anexos))    : [];

  // Aba padrão
  _empSwitchTab('dados');
  _empRenderContatos();
  _empRenderResps();
  _empRenderAnexosForm();

  // Reset upload
  if (typeof _clearUploadFile === 'function') _clearUploadFile(_empUploadCtx);
  const titleInput = document.getElementById(`${_empUploadCtx}-upload-title`);
  if (titleInput) titleInput.value = '';

  empOpenModal('modal-emp-form');
}

// ── TABS DO FORM ──────────────────────────────────────────────
function _empSwitchTab(tab) {
  document.querySelectorAll('.emp-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.emp-tab-panel').forEach(p => p.classList.toggle('active', p.dataset.tab === tab));
}

// ── CONTATOS ──────────────────────────────────────────────────
function _empRenderContatos() {
  const list = document.getElementById('emp-contatos-list');
  if (!list) return;
  if (_empContatos.length === 0) {
    list.innerHTML = `<div class="emp-list-empty">Nenhum contato adicionado.</div>`;
    return;
  }
  list.innerHTML = _empContatos.map((c, i) => `
    <div class="emp-list-item">
      <div class="emp-list-item-body" style="flex-direction:row;align-items:center;gap:8px;">
        <span class="emp-list-item-label" style="min-width:70px;">${_empEsc(c.tipo || 'Telefone')}</span>
        <span class="emp-list-item-val">${_empEsc(c.valor)}</span>
        ${c.tipo === 'WhatsApp' ? _empWhatsappIcon(c.valor) : ''}
      </div>
      <button class="ot-sub-del-btn" onclick="_empRemoveContato(${i})">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`).join('');
}

function _empValidatePhone(v) {
  return /^[\d\s\+\-\(\)]{7,20}$/.test(v.replace(/\s/g,''));
}
function _empValidateEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}
function _empWhatsappLink(num) {
  const clean = num.replace(/\D/g,'');
  return `https://wa.me/${clean.startsWith('55') ? clean : '55' + clean}`;
}
function _empWhatsappIcon(num) {
  return `<a href="${_empWhatsappLink(num)}" target="_blank" title="Abrir WhatsApp" style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:#25d366;color:#fff;text-decoration:none;flex-shrink:0;margin-left:4px;" onclick="event.stopPropagation()">
    <svg viewBox="0 0 24 24" fill="currentColor" style="width:13px;height:13px;"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.557 4.12 1.528 5.852L0 24l6.335-1.507A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.79 9.79 0 01-5.012-1.376l-.36-.213-3.757.893.946-3.656-.235-.376A9.79 9.79 0 012.182 12C2.182 6.565 6.565 2.182 12 2.182S21.818 6.565 21.818 12 17.435 21.818 12 21.818z"/></svg>
  </a>`;
}

function empAddContato() {
  const tipo  = document.getElementById('emp-c-tipo')?.value || 'Telefone';
  const valor = document.getElementById('emp-c-valor')?.value.trim();
  if (!valor) { showToast('Informe o número/contato.', 'error'); return; }
  if ((tipo === 'Telefone' || tipo === 'Celular' || tipo === 'WhatsApp') && !_empValidatePhone(valor)) {
    showToast('Número de telefone inválido. Use apenas dígitos, espaços e símbolos + - ( ).', 'error'); return;
  }
  _empContatos.push({ tipo, valor });
  document.getElementById('emp-c-valor').value = '';
  _empRenderContatos();
}

function _empRemoveContato(i) {
  _empContatos.splice(i, 1);
  _empRenderContatos();
}

// ── RESPONSÁVEIS TÉCNICOS ─────────────────────────────────────
function _empRenderResps() {
  const list = document.getElementById('emp-resps-list');
  if (!list) return;
  if (_empResps.length === 0) {
    list.innerHTML = `<div class="emp-list-empty">Nenhum responsável adicionado.</div>`;
    return;
  }
  list.innerHTML = _empResps.map((r, i) => `
    <div class="emp-list-item">
      <div class="emp-list-item-body">
        <span class="emp-list-item-val" style="font-weight:600;">${_empEsc(r.nome)}</span>
        ${r.cargo   ? `<span class="emp-list-item-label">${_empEsc(r.cargo)}</span>` : ''}
        ${r.contato ? `<span class="emp-list-item-label" style="color:var(--cyan);display:flex;align-items:center;gap:4px;">${_empEsc(r.contato)}${_empWhatsappIcon(r.contato)}</span>` : ''}
        ${r.email   ? `<span class="emp-list-item-label" style="color:var(--text-muted);">${_empEsc(r.email)}</span>` : ''}
      </div>
      <button class="ot-sub-del-btn" onclick="_empRemoveResp(${i})">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`).join('');
}

function empAddResp() {
  const nome    = document.getElementById('emp-r-nome')?.value.trim();
  const cargo   = document.getElementById('emp-r-cargo')?.value.trim();
  const contato = document.getElementById('emp-r-contato')?.value.trim();
  const email   = document.getElementById('emp-r-email')?.value.trim();
  if (!nome) { showToast('Informe o nome do responsável.', 'error'); return; }
  if (contato && !_empValidatePhone(contato)) {
    showToast('Número de contato inválido.', 'error'); return;
  }
  if (email && !_empValidateEmail(email)) {
    showToast('E-mail inválido.', 'error'); return;
  }
  _empResps.push({ nome, cargo, contato, email });
  document.getElementById('emp-r-nome').value    = '';
  document.getElementById('emp-r-cargo').value   = '';
  document.getElementById('emp-r-contato').value = '';
  document.getElementById('emp-r-email').value   = '';
  _empRenderResps();
}

function _empRemoveResp(i) {
  _empResps.splice(i, 1);
  _empRenderResps();
}

// ── ANEXOS ────────────────────────────────────────────────────
function _empRenderAnexosForm() {
  const list = document.getElementById('emp-anexos-list');
  if (!list) return;
  if (_empAnexos.length === 0) { list.innerHTML = ''; return; }
  list.innerHTML = _empAnexos.map((a, i) => `
    <div class="anexo-item">
      <a href="${a.url}" target="_blank" style="color:var(--cyan);display:flex;align-items:center;gap:5px;text-decoration:none;font-size:12.5px;font-weight:500;flex:1;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;flex-shrink:0;"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        ${_empEsc(a.titulo)}
      </a>
      <button class="anexo-del" onclick="_empRemoveAnexo(${i})">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="width:11px;height:11px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`).join('');
}

function empAddAnexo(anexo) {
  _empAnexos.push(anexo);
  _empRenderAnexosForm();
}

function _empRemoveAnexo(i) {
  _empAnexos.splice(i, 1);
  _empRenderAnexosForm();
}

function _empGetUploadPrefixo() {
  const nome = document.getElementById('emp-f-nome')?.value.trim();
  return nome || 'EMP';
}

// ── SALVAR ────────────────────────────────────────────────────
function empSaveForm() {
  if (_uploadsInProgress[_empUploadCtx]) {
    showToast('Aguarde o término do envio do arquivo.', 'info'); return;
  }
  if (_uploadQueues[_empUploadCtx]?.file) {
    showToast('Envie o arquivo selecionado antes de salvar.', 'error'); return;
  }
  const nome = document.getElementById('emp-f-nome')?.value.trim();
  if (!nome) { showToast('Informe o nome da empresa.', 'error'); return; }
  const email = document.getElementById('emp-f-email')?.value.trim();
  if (email && !_empValidateEmail(email)) { showToast('E-mail da empresa inválido.', 'error'); return; }

  const now = new Date().toISOString();
  const data = {
    nome,
    cnpj:        document.getElementById('emp-f-cnpj')?.value.trim()     || '',
    email:       document.getElementById('emp-f-email')?.value.trim()    || '',
    endereco:    document.getElementById('emp-f-endereco')?.value.trim() || '',
    cep:         document.getElementById('emp-f-cep')?.value.trim()      || '',
    contrato:    document.getElementById('emp-f-contrato')?.value.trim() || '',
    contatos:    _empContatos.slice(),
    responsaveis: _empResps.slice(),
    anexos:      _empAnexos.slice(),
    atualizadoEm: now,
  };

  if (_empFormId) {
    const idx = empState.empresas.findIndex(x => x.id === _empFormId);
    if (idx >= 0) Object.assign(empState.empresas[idx], data);
  } else {
    empState.empresas.push({ id: _empUid(), criadoEm: now, ...data });
  }

  empSave();
  empCloseModal('modal-emp-form');
  empRenderTable();
  showToast(_empFormId ? 'Empresa atualizada.' : 'Empresa cadastrada!', 'success');
}

// ── VIEW ──────────────────────────────────────────────────────
function empOpenView(id) {
  _empViewId = id;
  const e = empState.empresas.find(x => x.id === id);
  if (!e) return;
  _empRenderView(e);
  const btnEdit = document.getElementById('btn-emp-view-editar');
  if (btnEdit) btnEdit.style.display = _empCanManage() ? '' : 'none';
  empOpenModal('modal-emp-view');
}

function _empRenderView(e) {
  const el = document.getElementById('emp-view-body');
  if (!el) return;

  const contatosHtml = e.contatos?.length
    ? e.contatos.map(c => `<div class="emp-list-item">
        <div class="emp-list-item-body" style="flex-direction:row;align-items:center;gap:8px;">
          <span class="emp-list-item-label" style="min-width:70px;">${_empEsc(c.tipo)}</span>
          <span class="emp-list-item-val">${_empEsc(c.valor)}</span>
          ${c.tipo === 'WhatsApp' ? _empWhatsappIcon(c.valor) : ''}
        </div>
      </div>`).join('')
    : `<div class="emp-list-empty">Nenhum contato registrado.</div>`;

  const respsHtml = e.responsaveis?.length
    ? e.responsaveis.map(r => `<div class="emp-list-item">
        <div class="emp-list-item-body">
          <div style="display:flex;align-items:center;gap:6px;">
            <span class="emp-list-item-val" style="font-weight:600;">${_empEsc(r.nome)}</span>
          </div>
          ${r.cargo   ? `<span class="emp-list-item-label">${_empEsc(r.cargo)}</span>` : ''}
          ${r.contato ? `<span class="emp-list-item-label" style="color:var(--cyan);display:flex;align-items:center;gap:4px;">${_empEsc(r.contato)}${_empWhatsappIcon(r.contato)}</span>` : ''}
          ${r.email   ? `<span class="emp-list-item-label" style="color:var(--text-muted);">${_empEsc(r.email)}</span>` : ''}
        </div>
      </div>`).join('')
    : `<div class="emp-list-empty">Nenhum responsável registrado.</div>`;

  const anexosHtml = e.anexos?.length
    ? e.anexos.map(a => `<a class="ot-pub-anexo-chip" href="${a.url}" target="_blank">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
        ${_empEsc(a.titulo)}
      </a>`).join('')
    : `<div class="emp-list-empty">Nenhum anexo.</div>`;

  el.innerHTML = `
<div class="emp-view-hero">
  <div class="emp-view-hero-name">${_empEsc(e.nome)}</div>
  ${e.cnpj ? `<div class="emp-view-hero-sub">${_empEsc(e.cnpj)}</div>` : ''}
</div>

<div class="detail-grid" style="margin-bottom:16px;">
  ${e.email    ? `<div class="detail-card"><div class="detail-label">E-mail</div><div class="detail-value">${_empEsc(e.email)}</div></div>` : ''}
  ${e.contrato ? `<div class="detail-card"><div class="detail-label">Contrato / Ref.</div><div class="detail-value">${_empEsc(e.contrato)}</div></div>` : ''}
  ${e.cep      ? `<div class="detail-card"><div class="detail-label">CEP</div><div class="detail-value">${_empEsc(e.cep)}</div></div>` : ''}
  ${e.endereco ? `<div class="detail-card" style="grid-column:1/-1;"><div class="detail-label">Endereço</div><div class="detail-value">${_empEsc(e.endereco)}</div></div>` : ''}
</div>

<div class="form-section-title" style="margin-bottom:10px;">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.63A2 2 0 012 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
  Contatos
</div>
<div style="margin-bottom:16px;">${contatosHtml}</div>

<div class="form-section-title" style="margin-bottom:10px;">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
  Responsáveis Técnicos
</div>
<div style="margin-bottom:16px;">${respsHtml}</div>

<div class="form-section-title" style="margin-bottom:10px;">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
  Anexos
</div>
<div class="ot-pub-anexos">${anexosHtml}</div>`;
}

// ── EXCLUIR ───────────────────────────────────────────────────
let _empDeleteId = null;
function empConfirmDelete(id) {
  if (!_empCanManage()) {
    if (typeof showToast === 'function') showToast('Você não tem permissão para excluir empresas.', 'error');
    return;
  }
  _empDeleteId = id;
  const e = empState.empresas.find(x => x.id === id);
  const el = document.getElementById('emp-delete-name');
  if (el) el.textContent = e?.nome || '';
  empOpenModal('modal-emp-delete');
}
function empDoDelete() {
  if (!_empDeleteId) return;
  empState.empresas = empState.empresas.filter(x => x.id !== _empDeleteId);
  empSave();
  empCloseModal('modal-emp-delete');
  empRenderTable();
  showToast('Empresa excluída.', 'success');
  _empDeleteId = null;
}

// ── MODAL HELPERS ─────────────────────────────────────────────
function empOpenModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.add('open'); el.style.opacity = '1'; el.style.pointerEvents = 'all'; }
}
function empCloseModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.remove('open'); el.style.opacity = ''; el.style.pointerEvents = ''; }
}

// ── HELPERS ───────────────────────────────────────────────────
function _empUid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function _empEsc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _empSetField(id, val) { const el = document.getElementById(id); if (el) el.value = val; }

// ── INJEÇÃO DE MODAIS ─────────────────────────────────────────
function _empInjectModals() {
  const div = document.createElement('div');
  div.innerHTML = _empModalsHTML();
  document.body.appendChild(div);
  setTimeout(() => {
    if (typeof initUploadZone === 'function') initUploadZone(_empUploadCtx);
  }, 150);
}

function _empModalsHTML() {
  return `
<!-- ══ MODAL FORM EMPRESA ══ -->
<div class="modal-overlay" id="modal-emp-form" style="z-index:710;">
  <div class="modal wide">
    <div class="modal-header">
      <div class="modal-header-left">
        <div class="modal-header-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        </div>
        <div>
          <div class="modal-title" id="emp-form-title">Nova Empresa</div>
          <div class="modal-subtitle">Cadastro de empresa terceirizada</div>
        </div>
      </div>
      <button class="modal-close" onclick="empCloseModal('modal-emp-form')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    <!-- Tabs -->
    <div class="ot-modal-tabs">
      <button class="ot-modal-tab-btn emp-tab-btn active" data-tab="dados" onclick="_empSwitchTab('dados')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        Dados
      </button>
      <button class="ot-modal-tab-btn emp-tab-btn" data-tab="contatos" onclick="_empSwitchTab('contatos')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.63A2 2 0 012 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
        Contatos
      </button>
      <button class="ot-modal-tab-btn emp-tab-btn" data-tab="responsaveis" onclick="_empSwitchTab('responsaveis')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
        Responsáveis
      </button>
      <button class="ot-modal-tab-btn emp-tab-btn" data-tab="anexos" onclick="_empSwitchTab('anexos')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
        Anexos
      </button>
    </div>

    <div class="modal-body" style="padding:0;">

      <!-- ABA DADOS -->
      <div class="emp-tab-panel active" data-tab="dados" style="padding:24px 28px;">
        <div class="form-section">
          <div class="form-section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
            Informações da Empresa
          </div>
          <div class="form-row">
            <div class="form-field" style="flex:2;">
              <label class="field-label">Empresa / Prestador <span class="required">*</span></label>
              <input type="text" id="emp-f-nome" class="field-input" placeholder="Nome da empresa ou prestador">
            </div>
            <div class="form-field" style="flex:1;">
              <label class="field-label">CNPJ / CPF</label>
              <input type="text" id="emp-f-cnpj" class="field-input" placeholder="00.000.000/0001-00">
            </div>
          </div>
          <div class="form-row">
            <div class="form-field">
              <label class="field-label">E-mail</label>
              <input type="email" id="emp-f-email" class="field-input" placeholder="contato@empresa.com">
            </div>
            <div class="form-field">
              <label class="field-label">Contrato / Referência</label>
              <input type="text" id="emp-f-contrato" class="field-input" placeholder="Número do contrato ou OS">
            </div>
          </div>
          <div class="form-row">
            <div class="form-field" style="flex:3;">
              <label class="field-label">Endereço</label>
              <input type="text" id="emp-f-endereco" class="field-input" placeholder="Rua, número, bairro, cidade">
            </div>
            <div class="form-field" style="flex:1;">
              <label class="field-label">CEP</label>
              <input type="text" id="emp-f-cep" class="field-input" placeholder="00000-000">
            </div>
          </div>
        </div>
      </div>

      <!-- ABA CONTATOS -->
      <div class="emp-tab-panel" data-tab="contatos" style="padding:24px 28px;">
        <div class="form-section-title" style="margin-bottom:14px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.63A2 2 0 012 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
          Contatos
        </div>
        <div id="emp-contatos-list" style="margin-bottom:14px;display:flex;flex-direction:column;gap:6px;"></div>
        <div style="display:flex;gap:8px;align-items:flex-end;">
          <div class="form-field" style="flex:0 0 130px;margin-bottom:0;">
            <label class="field-label">Tipo</label>
            <select id="emp-c-tipo" class="field-select">
              <option value="Telefone">Telefone</option>
              <option value="Celular">Celular</option>
              <option value="WhatsApp">WhatsApp</option>
              <option value="Outro">Outro</option>
            </select>
          </div>
          <div class="form-field" style="flex:1;margin-bottom:0;">
            <label class="field-label">Número / Contato</label>
            <input type="text" id="emp-c-valor" class="field-input" placeholder="(00) 00000-0000"
              onkeydown="if(event.key==='Enter')empAddContato()">
          </div>
          <button class="btn btn-primary" onclick="empAddContato()" style="flex-shrink:0;height:40px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:14px;height:14px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Adicionar
          </button>
        </div>
      </div>

      <!-- ABA RESPONSÁVEIS -->
      <div class="emp-tab-panel" data-tab="responsaveis" style="padding:24px 28px;">
        <div class="form-section-title" style="margin-bottom:14px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
          Responsáveis Técnicos
        </div>
        <div id="emp-resps-list" style="margin-bottom:14px;display:flex;flex-direction:column;gap:6px;"></div>
        <div style="background:var(--bg);border:1.5px solid var(--border);border-radius:var(--radius-lg);padding:14px;display:flex;flex-direction:column;gap:10px;">
          <div class="form-row" style="margin-bottom:0;">
            <div class="form-field" style="margin-bottom:0;">
              <label class="field-label">Nome <span class="required">*</span></label>
              <input type="text" id="emp-r-nome" class="field-input" placeholder="Nome completo">
            </div>
            <div class="form-field" style="margin-bottom:0;">
              <label class="field-label">Cargo / Função</label>
              <input type="text" id="emp-r-cargo" class="field-input" placeholder="Ex: Técnico Eletricista">
            </div>
          </div>
          <div style="display:flex;gap:8px;align-items:flex-end;">
            <div class="form-field" style="flex:1;margin-bottom:0;">
              <label class="field-label">Contato</label>
              <input type="text" id="emp-r-contato" class="field-input" placeholder="Telefone">
            </div>
            <div class="form-field" style="flex:1;margin-bottom:0;">
              <label class="field-label">E-mail</label>
              <input type="email" id="emp-r-email" class="field-input" placeholder="email@empresa.com"
                onkeydown="if(event.key==='Enter')empAddResp()">
            </div>
            <button class="btn btn-primary" onclick="empAddResp()" style="flex-shrink:0;height:40px;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:14px;height:14px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Adicionar
            </button>
          </div>
        </div>
      </div>

      <!-- ABA ANEXOS -->
      <div class="emp-tab-panel" data-tab="anexos" style="padding:24px 28px;">
        <div class="form-section-title" style="margin-bottom:14px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
          Anexos da Empresa
        </div>
        <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center;">
          <input type="text" id="${_empUploadCtx}-upload-title" class="field-input" placeholder="Nome do arquivo" style="flex:1;">
          <button id="${_empUploadCtx}-upload-btn" class="btn btn-primary"
            onclick="doUploadAnexo('${_empUploadCtx}', a => empAddAnexo(a), () => _empGetUploadPrefixo())"
            style="flex-shrink:0;" title="Fazer upload">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="width:14px;height:14px;">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Enviar
          </button>
        </div>
        <div id="${_empUploadCtx}-upload-zone" class="upload-drop-zone" title="Clique ou arraste um arquivo PDF ou imagem">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:28px;height:28px;opacity:.45;"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <div class="upload-drop-text"><strong>Clique ou arraste o arquivo</strong><br><span>PDF ou imagem</span></div>
          <input type="file" id="${_empUploadCtx}-file-input" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.svg" style="display:none;">
        </div>
        <div id="${_empUploadCtx}-file-preview" style="display:none;margin-top:6px;"></div>
        <div id="emp-anexos-list" style="margin-top:8px;"></div>
      </div>

    </div><!-- /modal-body -->

    <div class="modal-footer">
      <button class="btn btn-outline" onclick="empCloseModal('modal-emp-form')">Cancelar</button>
      <button class="btn btn-primary" id="btn-emp-form-save" onclick="empSaveForm()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:15px;height:15px;"><polyline points="20 6 9 17 4 12"/></svg>
        <span id="emp-form-save-lbl">Cadastrar</span>
      </button>
    </div>
  </div>
</div>

<!-- ══ MODAL VIEW EMPRESA ══ -->
<div class="modal-overlay" id="modal-emp-view" style="z-index:710;">
  <div class="modal wide">
    <div class="modal-header">
      <div class="modal-header-left">
        <div class="modal-header-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        </div>
        <div>
          <div class="modal-title">Empresa</div>
          <div class="modal-subtitle">Detalhes do cadastro</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <button id="btn-emp-view-editar" class="btn btn-outline" style="padding:6px 12px;font-size:12px;" onclick="empEditFromView()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
          Editar
        </button>
        <button class="modal-close" onclick="empCloseModal('modal-emp-view')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>
    <div class="modal-body" id="emp-view-body"></div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="empCloseModal('modal-emp-view')">Fechar</button>
    </div>
  </div>
</div>

<!-- ══ MODAL DELETE ══ -->
<div class="modal-overlay" id="modal-emp-delete" style="z-index:720;">
  <div class="modal sm">
    <div class="modal-header">
      <div class="modal-header-left">
        <div class="modal-header-icon" style="background:rgba(230,57,70,0.15);border-color:rgba(230,57,70,0.3);color:var(--red);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
        </div>
        <div>
          <div class="modal-title">Excluir Empresa</div>
          <div class="modal-subtitle">Esta ação é irreversível</div>
        </div>
      </div>
      <button class="modal-close" onclick="empCloseModal('modal-emp-delete')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="modal-body">
      <p style="font-size:13.5px;color:var(--text-secondary);line-height:1.6;">
        Deseja excluir a empresa <strong id="emp-delete-name"></strong>? Todos os dados vinculados serão perdidos.
      </p>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="empCloseModal('modal-emp-delete')">Cancelar</button>
      <button class="btn btn-primary" onclick="empDoDelete()" style="background:var(--red);">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:14px;height:14px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
        Excluir
      </button>
    </div>
  </div>
</div>
`;
}

function empEditFromView() {
  if (!_empCanManage()) {
    if (typeof showToast === 'function') showToast('Você não tem permissão para editar empresas.', 'error');
    return;
  }
  empCloseModal('modal-emp-view');
  empOpenForm(_empViewId);
}

function empGetList() { return empState.empresas; }

// ── INTEGRAÇÃO: popula selects de empresa em outros módulos ───
// Preenche o select de empresa com todas as empresas cadastradas
function empPopulateEmpresaSelect(selectId, selectedNome) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = '<option value="">— Selecione a empresa —</option>' +
    empState.empresas.map(e =>
      `<option value="${_empEsc(e.nome)}" data-id="${e.id}" ${e.nome === selectedNome ? 'selected' : ''}>${_empEsc(e.nome)}</option>`
    ).join('');
}

// Popula o select de técnico com base na empresa selecionada no select de empresa
function empPopulateTecnicoSelect(tecnicoSelectId, empresaSelectId, selectedNome) {
  const empSel  = document.getElementById(empresaSelectId);
  const tecSel  = document.getElementById(tecnicoSelectId);
  if (!empSel || !tecSel) return;
  const empId = empSel.selectedOptions[0]?.dataset?.id;
  const emp   = empId ? empState.empresas.find(e => e.id === empId) : null;
  const resps = emp?.responsaveis || [];
  tecSel.innerHTML = '<option value="">— Selecione o responsável —</option>' +
    resps.map(r =>
      `<option value="${_empEsc(r.nome)}" ${r.nome === selectedNome ? 'selected' : ''}>${_empEsc(r.nome)}${r.cargo ? ' · ' + _empEsc(r.cargo) : ''}</option>`
    ).join('');
}

// Popula ambos os selects (empresa + técnico) de uma vez — útil ao abrir forms existentes
function empPopulateBothSelects(empresaSelectId, tecnicoSelectId, empresaNome, tecnicoNome) {
  empPopulateEmpresaSelect(empresaSelectId, empresaNome);
  empPopulateTecnicoSelect(tecnicoSelectId, empresaSelectId, tecnicoNome);
}
