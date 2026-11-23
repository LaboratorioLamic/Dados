// ═══════════════════════════════════════════════════════════════
// upload.js — Sistema de Upload de Arquivos via Google Drive
// ═══════════════════════════════════════════════════════════════

const UPLOAD_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbycXyyM2EviqYrkBYhKn1dkDAYWfuvEikNCpyma8VkoEGyVF-vAJGhJmYNp_XtHLadq/exec';

const UPLOAD_ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
const UPLOAD_ALLOWED_EXT   = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];

// ── Estado temporário de upload ──────────────────────────────
const _uploadQueues = {
  pub:              { file: null, dataUrl: null },
  'edit-pub':       { file: null, dataUrl: null },
  'isento-rotina':  { file: null, dataUrl: null }
};

// Botões de salvar/confirmar bloqueados durante upload
const _SAVE_BTN_IDS = {
  'pub':            'btn-confirmar-publicacao',
  'edit-pub':       'btn-salvar-edicao-pub',
  'isento-rotina':  null
};

let _uploadsInProgress = { 'pub': false, 'edit-pub': false, 'isento-rotina': false };

function _setSaveBtnBlocked(ctx, blocked) {
  _uploadsInProgress[ctx] = blocked;
  const btnId = _SAVE_BTN_IDS[ctx];
  if (!btnId) return;
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = blocked;
  btn.title = blocked ? 'Aguarde o término do envio do arquivo' : '';
  btn.style.opacity = blocked ? '0.5' : '';
  btn.style.cursor  = blocked ? 'not-allowed' : '';
}

// ── Comunicação com o Google Apps Script ─────────────────────
async function _driveRequest(payload) {
  const resp = await fetch(UPLOAD_SCRIPT_URL, {
    method: 'POST',
    body:   JSON.stringify(payload)
  });
  const text = await resp.text();
  try { return JSON.parse(text); } catch { return text; }
}

async function driveUpload(filename, dataUrl) {
  // Envia no mesmo formato do script de referência: action, filename, data (dataUrl completo)
  return _driveRequest({ action: 'upload', filename, data: dataUrl });
}

async function driveDelete(fileId) {
  return _driveRequest({ action: 'delete', id: fileId });
}

async function driveRename(fileId, newName) {
  return _driveRequest({ action: 'rename', id: fileId, newName });
}

// ── Inicialização das zonas de upload ────────────────────────
function initUploadZone(ctx) {
  const zone  = document.getElementById(`${ctx}-upload-zone`);
  const input = document.getElementById(`${ctx}-file-input`);
  if (!zone || !input) return;

  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) _setUploadFile(ctx, file);
  });
  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) _setUploadFile(ctx, file);
    input.value = '';
  });
}

function _setUploadFile(ctx, file) {
  if (!_validateUploadFile(file)) return;
  const reader = new FileReader();
  reader.onload = e => {
    _uploadQueues[ctx].file    = file;
    _uploadQueues[ctx].dataUrl = e.target.result;
    _renderUploadPreview(ctx);
  };
  reader.readAsDataURL(file);
}

function _validateUploadFile(file) {
  const okType = UPLOAD_ALLOWED_TYPES.includes(file.type);
  const okExt  = UPLOAD_ALLOWED_EXT.some(ext => file.name.toLowerCase().endsWith(ext));
  if (!okType && !okExt) {
    if (typeof showToast === 'function') showToast('Apenas PDF e imagens são permitidos.', 'error');
    return false;
  }
  return true;
}

function _renderUploadPreview(ctx) {
  const zone    = document.getElementById(`${ctx}-upload-zone`);
  const preview = document.getElementById(`${ctx}-file-preview`);
  const q       = _uploadQueues[ctx];
  if (!preview) return;

  _setSaveBtnBlocked(ctx, !!q.file);

  if (q.file) {
    const isPdf = q.file.type === 'application/pdf' || q.file.name.toLowerCase().endsWith('.pdf');
    const icon  = isPdf
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;color:var(--red);flex-shrink:0;"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;color:var(--cyan);flex-shrink:0;"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
    preview.innerHTML = `
      <div class="upload-file-info">
        ${icon}
        <span class="upload-file-name" title="${q.file.name}">${q.file.name}</span>
        <button class="anexo-del" onclick="_clearUploadFile('${ctx}')" title="Remover">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="width:12px;height:12px;">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>`;
    preview.style.display = '';
    if (zone) zone.style.display = 'none';
  } else {
    preview.style.display = 'none';
    if (zone) zone.style.display = '';
  }
}

function _clearUploadFile(ctx) {
  _uploadQueues[ctx].file    = null;
  _uploadQueues[ctx].dataUrl = null;
  _renderUploadPreview(ctx);
}

// ── Upload principal ─────────────────────────────────────────
async function doUploadAnexo(ctx, onSuccess, getPrefixo) {
  const q = _uploadQueues[ctx];
  if (!q.file || !q.dataUrl) {
    if (typeof showToast === 'function') showToast('Selecione um arquivo primeiro.', 'error');
    return;
  }
  const titleInput = document.getElementById(`${ctx}-upload-title`);
  const title = (titleInput?.value || '').trim();
  if (!title) {
    if (typeof showToast === 'function') showToast('Informe um nome para o arquivo.', 'error');
    if (titleInput) titleInput.focus();
    return;
  }

  const btn = document.getElementById(`${ctx}-upload-btn`);
  _setUploadBtnLoading(btn, true);
  _setSaveBtnBlocked(ctx, true);

  try {
    // Constrói nome: [Prefixo - ] Nome do arquivo + extensão
    const ext      = q.file.name.includes('.') ? q.file.name.slice(q.file.name.lastIndexOf('.')) : '';
    const baseName = title.endsWith(ext) ? title.slice(0, -ext.length) : title;
    const prefixo  = typeof getPrefixo === 'function' ? getPrefixo() : '';
    const filename = prefixo ? `${prefixo} - ${baseName}${ext}` : `${baseName}${ext}`;

    const result = await driveUpload(filename, q.dataUrl);

    // Script retorna JSON com { success, fileId|id, url } ou string "Sucesso" (legado)
    let fileUrl, fileId;
    if (typeof result === 'object' && result.success && result.url) {
      fileUrl = result.url;
      fileId  = result.fileId || result.id || null;
    } else if (result === 'Sucesso') {
      const found = await _findUploadedFile(filename);
      fileUrl = found?.url || '#';
      fileId  = found?.id  || null;
    } else {
      throw new Error(typeof result === 'string' ? result : 'Falha no upload.');
    }

    if (titleInput) titleInput.value = '';
    _clearUploadFile(ctx);
    if (typeof onSuccess === 'function') onSuccess({ titulo: title, url: fileUrl, fileId });
    if (typeof showToast === 'function') showToast('Arquivo enviado com sucesso!', 'success');
  } catch (err) {
    if (typeof showToast === 'function') showToast('Erro ao enviar: ' + err.message, 'error');
  } finally {
    _setUploadBtnLoading(btn, false);
    _setSaveBtnBlocked(ctx, false);
  }
}

async function _findUploadedFile(filename) {
  try {
    const list = await fetch(UPLOAD_SCRIPT_URL + '?action=list').then(r => r.json());
    return Array.isArray(list) ? list.find(f => f.name === filename) || null : null;
  } catch {
    return null;
  }
}

function _setUploadBtnLoading(btn, loading) {
  if (!btn) return;
  btn.disabled = loading;
  btn.innerHTML = loading
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="width:14px;height:14px;animation:spin 1s linear infinite;"><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0"/></svg> Enviando...`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="width:14px;height:14px;"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Enviar`;
}

// ── Excluir anexo já salvo do Drive ─────────────────────────
async function deleteAnexoDrive(fileId, onSuccess) {
  if (!fileId) return;
  try {
    await driveDelete(fileId);
    if (typeof onSuccess === 'function') onSuccess();
    if (typeof showToast === 'function') showToast('Arquivo removido do Drive.', 'success');
  } catch (err) {
    if (typeof showToast === 'function') showToast('Erro ao remover: ' + err.message, 'error');
  }
}

// ── Renomear anexo já salvo no Drive ────────────────────────
async function renameAnexoDrive(fileId, newName, onSuccess) {
  if (!fileId || !newName) return;
  try {
    await driveRename(fileId, newName);
    if (typeof onSuccess === 'function') onSuccess();
    if (typeof showToast === 'function') showToast('Arquivo renomeado no Drive.', 'success');
  } catch (err) {
    if (typeof showToast === 'function') showToast('Erro ao renomear: ' + err.message, 'error');
  }
}

// ── Resetar zona ao fechar modal ────────────────────────────
function resetUploadZone(ctx) {
  _uploadQueues[ctx] = { file: null, dataUrl: null };
  const titleInput = document.getElementById(`${ctx}-upload-title`);
  if (titleInput) titleInput.value = '';
  _renderUploadPreview(ctx);
}

// ── Inicialização automática ao carregar ─────────────────────
document.addEventListener('DOMContentLoaded', function () {
  initUploadZone('pub');
  initUploadZone('edit-pub');
});
