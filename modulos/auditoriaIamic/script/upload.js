// ═══════════════════════════════════════════════════════════════
// upload.js — Sistema de Upload de Arquivos via Google Drive
// ═══════════════════════════════════════════════════════════════

const UPLOAD_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxE5y_r77WyOBPVSOW-5pXUtAuMrLBc3mhsPlNbppOvcLVmYHYDUZsNMWB0VAzxU_wDFA/exec';

const UPLOAD_ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.spreadsheet',
  'text/csv',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.presentation',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text'
];
const UPLOAD_ALLOWED_EXT = [
  '.pdf',
  '.jpg', '.jpeg', '.png', '.gif', '.webp',
  '.xls', '.xlsx', '.ods', '.csv',
  '.ppt', '.pptx', '.odp',
  '.doc', '.docx', '.odt'
];

// ── Tag de tipo de anexo (persistida no BD como anexo.fileExt) ──
// Fonte única de verdade para o ícone de cada anexo em qualquer lugar do app.
// Itens sem tag (dados legados) caem no fallback: ícone de arquivo vermelho.
function _extFromName(name) {
  if (!name) return '';
  const clean = String(name).split(/[?#]/)[0];
  return clean.includes('.') ? clean.slice(clean.lastIndexOf('.')).toLowerCase() : '';
}

// Calcula a tag fileExt a partir do File real (extensão confiável no momento do upload)
function _tagFromFile(file) {
  return _extFromName(file && file.name);
}

// Retorna { icon: 'pdf'|'sheet'|'slide'|'image'|'link'|'file', color } para um anexo salvo.
// Prioridade: tipo explícito (link/imagem) > tag fileExt persistida > fallback genérico vermelho.
window._anexoIconInfo = function(a) {
  if (!a) return { icon: 'file', color: '#ef4444' };
  if (a.tipo === 'link') return { icon: 'link', color: '#2563eb' };
  if (a.tipo === 'imagem') return { icon: 'image', color: '#7c3aed' };

  const ext = a.fileExt || '';
  if (ext === '.pdf') return { icon: 'pdf', color: '#ef4444' };
  if (['.doc', '.docx', '.odt'].includes(ext)) return { icon: 'doc', color: '#2563eb' };
  if (['.xls', '.xlsx', '.ods', '.csv'].includes(ext)) return { icon: 'sheet', color: '#16a34a' };
  if (['.ppt', '.pptx', '.odp'].includes(ext)) return { icon: 'slide', color: '#ea580c' };
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(ext)) return { icon: 'image', color: '#0891b2' };

  // Sem tag: ícone de arquivo vermelho padrão
  return { icon: 'file', color: '#ef4444' };
};

const _ANEXO_ICON_SVG = {
  pdf:   p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:${p};height:${p};color:{{C}};flex-shrink:0;"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/></svg>`,
  doc:   p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:${p};height:${p};color:{{C}};flex-shrink:0;"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>`,
  sheet: p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:${p};height:${p};color:{{C}};flex-shrink:0;"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><line x1="10" y1="9" x2="14" y2="9"/></svg>`,
  slide: p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:${p};height:${p};color:{{C}};flex-shrink:0;"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><rect x="8" y="12" width="8" height="5" rx="1"/></svg>`,
  image: p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:${p};height:${p};color:{{C}};flex-shrink:0;"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
  link:  p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:${p};height:${p};color:{{C}};flex-shrink:0;"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>`,
  file:  p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:${p};height:${p};color:{{C}};flex-shrink:0;"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`
};

// Gera o SVG do ícone de um anexo salvo. size: string CSS (ex: '15px').
window._anexoIconSvg = function(a, size) {
  const info = window._anexoIconInfo(a);
  const tpl = _ANEXO_ICON_SVG[info.icon] || _ANEXO_ICON_SVG.file;
  return tpl(size || '15px').replace('{{C}}', info.color);
};

// ── Estado temporário de upload ──────────────────────────────
const _uploadQueues = {
  pub:        { file: null, dataUrl: null },
  'edit-pub': { file: null, dataUrl: null },
  audit:      { file: null, dataUrl: null },
  ativ:       { file: null, dataUrl: null },
  doc:        { file: null, dataUrl: null },
  mant:       { file: null, dataUrl: null },
  oc:         { file: null, dataUrl: null },
  rnc:        { file: null, dataUrl: null }
};

// Armazena a task Firebase ativa por contexto para permitir cancelamento
const _activeUploadTasks = {};

// Botões de salvar/confirmar bloqueados durante upload (arquivo pendente ou enviando).
// Inclui os drawers de cards (audit/ativ/doc) para impedir salvar o card ANTES de
// o anexo terminar de subir — o que gravaria o card sem o vínculo do arquivo.
const _SAVE_BTN_IDS = {
  'pub':        'btn-confirmar-publicacao',
  'edit-pub':   'btn-salvar-edicao-pub',
  'audit':      'btn-save-audit',
  'ativ':       'btn-save-ativ',
  'doc':        'btn-save-doc',
  'oc':         'btn-save-oc',
  'rnc':        'btn-save-rnc'
};

let _uploadsInProgress = { 'pub': false, 'edit-pub': false };

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
// Timeout do upload via Drive. O Apps Script pode demorar (cold start), mas sem um
// limite uma requisição "pendurada" deixa o botão Enviar travado e — em publicações —
// o botão Salvar bloqueado (_setSaveBtnBlocked) até a rede desistir sozinha. Com o
// AbortController, um upload que estoura o tempo REJEITA, o catch mostra o erro e o
// finally do chamador libera os botões. Importante: o upload é DESACOPLADO do saveAll
// dos cards (escreve em Drive/ /imgBlobs, nunca nas coleções), então um timeout aqui
// NÃO interrompe nem corrompe a gravação dos cards — só falha o anexo em questão.
const UPLOAD_TIMEOUT_MS = 90 * 1000;

async function _driveRequest(payload) {
  const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), UPLOAD_TIMEOUT_MS) : null;
  try {
    // ID token da sessão: o Apps Script recusa pedidos sem ele (auditoria.js)
    const idToken = typeof window.firebaseIdToken === 'function' ? await window.firebaseIdToken() : null;
    if (!idToken) throw new Error('Sessão do Dados LAMIC ausente. Recarregue a página.');
    const resp = await fetch(UPLOAD_SCRIPT_URL, {
      method: 'POST',
      body:   JSON.stringify({ ...payload, idToken }),
      signal: ctrl ? ctrl.signal : undefined
    });
    const text = await resp.text();
    let r;
    try { r = JSON.parse(text); } catch {
      // Apps Script às vezes embrulha o JSON em HTML
      const i = text.indexOf('{'), f = text.lastIndexOf('}');
      try { r = (i !== -1 && f > i) ? JSON.parse(text.slice(i, f + 1)) : text; } catch { r = text; }
    }
    if (r && typeof r === 'object' && (r.success === false || r.error)) throw new Error(r.error || 'O servidor recusou o pedido.');
    return r;
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new Error('Tempo de envio esgotado. Verifique a conexão e tente novamente.');
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function driveUpload(filename, dataUrl) {
  // Imagens (menos GIF, para não perder a animação) vão reduzidas e em WebP
  if (/^data:image\/(jpeg|png|webp|bmp|tiff)/i.test(dataUrl || '')) {
    try {
      dataUrl = await _compressImageToJpeg(dataUrl);
      const ext = dataUrl.startsWith('data:image/webp') ? '.webp' : '.jpg';
      filename = String(filename || 'imagem').replace(/\.[^.]+$/, '') + ext;
    } catch (_) { /* envia o original */ }
  }
  return _driveRequest({ action: 'upload', filename, data: dataUrl });
}

async function driveDelete(fileId) {
  return _driveRequest({ action: 'delete', id: fileId });
}

async function driveRename(fileId, newName) {
  return _driveRequest({ action: 'rename', id: fileId, newName });
}

// ── Modo de upload (arquivo vs link vs imagem) ───────────────
function _getUploadMode(ctx) {
  const sel = document.getElementById(`${ctx}-upload-tipo`);
  return sel ? sel.value : 'arquivo';
}

function _onUploadTipoChange(ctx) {
  const mode = _getUploadMode(ctx);
  const zone     = document.getElementById(`${ctx}-upload-zone`);
  const preview  = document.getElementById(`${ctx}-file-preview`);
  const linkWrap = document.getElementById(`${ctx}-link-wrap`);
  const btn      = document.getElementById(`${ctx}-upload-btn`);
  const fileInput = document.getElementById(`${ctx}-file-input`);

  _clearUploadFile(ctx);

  if (mode === 'link') {
    if (zone) zone.style.display = 'none';
    if (preview) preview.style.display = 'none';
    if (linkWrap) linkWrap.style.display = '';
    if (btn) btn.textContent = 'Adicionar';
  } else if (mode === 'imagem') {
    if (linkWrap) linkWrap.style.display = 'none';
    if (fileInput) fileInput.accept = '.jpg,.jpeg,.png,.gif,.webp,.bmp,.tiff';
    const hint = zone ? zone.querySelector('.upload-drop-hint') : null;
    if (hint) hint.textContent = 'JPG, PNG, GIF, WebP (máx. 5 MB)';
    if (zone) zone.style.display = '';
    if (btn) btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="width:14px;height:14px;"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Enviar`;
    _renderUploadPreview(ctx);
  } else {
    if (linkWrap) linkWrap.style.display = 'none';
    const sel = document.getElementById(`${ctx}-upload-tipo`);
    const hasImageOption = sel && Array.from(sel.options).some(o => o.value === 'imagem');
    if (hasImageOption) {
      if (fileInput) fileInput.accept = '.pdf,.doc,.docx,.odt,.xls,.xlsx,.ods,.ppt,.pptx,.odp';
      const hint = zone ? zone.querySelector('.upload-drop-hint') : null;
      if (hint) hint.textContent = 'PDF, Word, planilha ou slides (máx. 30 MB)';
    } else {
      if (fileInput) fileInput.accept = '.pdf,.jpg,.jpeg,.png,.gif,.webp,.svg,.doc,.docx,.odt,.xls,.xlsx,.ods,.ppt,.pptx,.odp';
      const hint = zone ? zone.querySelector('.upload-drop-hint') : null;
      if (hint) hint.textContent = 'PDF, imagem, Word, planilha ou slides (máx. 30 MB)';
    }
    if (btn) btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="width:14px;height:14px;"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Enviar`;
    _renderUploadPreview(ctx);
  }
}
window._onUploadTipoChange = _onUploadTipoChange;

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

const IMAGE_TYPES = ['image/jpeg','image/png','image/gif','image/webp','image/bmp','image/tiff'];
const IMAGE_EXTS  = ['.jpg','.jpeg','.png','.gif','.webp','.bmp','.tiff'];
const IMAGE_MAX_BYTES  = 5  * 1024 * 1024; // 5 MB
const UPLOAD_MAX_BYTES = 30 * 1024 * 1024; // 30 MB

function _setUploadFile(ctx, file) {
  const mode = _getUploadMode(ctx);
  if (mode === 'imagem') {
    if (!_validateImageFile(file)) return;
    const reader = new FileReader();
    reader.onload = e => {
      _uploadQueues[ctx].file    = file;
      _uploadQueues[ctx].dataUrl = e.target.result;
      _renderUploadPreview(ctx);
    };
    reader.readAsDataURL(file);
  } else {
    if (!_validateUploadFile(file, ctx)) return;
    const reader = new FileReader();
    reader.onload = e => {
      _uploadQueues[ctx].file    = file;
      _uploadQueues[ctx].dataUrl = e.target.result;
      _renderUploadPreview(ctx);
    };
    reader.readAsDataURL(file);
  }
}

function _validateImageFile(file) {
  const okType = IMAGE_TYPES.includes(file.type);
  const okExt  = IMAGE_EXTS.some(ext => file.name.toLowerCase().endsWith(ext));
  if (!okType && !okExt) {
    if (typeof showToast === 'function') showToast('Apenas imagens são aceitas (JPG, PNG, GIF, WebP).', 'error');
    return false;
  }
  if (file.size > IMAGE_MAX_BYTES) {
    if (typeof showToast === 'function') showToast('Imagem muito grande. Máximo permitido: 5 MB.', 'error');
    return false;
  }
  return true;
}

const UPLOAD_ALLOWED_TYPES_NO_IMG = UPLOAD_ALLOWED_TYPES.filter(t => !t.startsWith('image/'));
const UPLOAD_ALLOWED_EXT_NO_IMG   = UPLOAD_ALLOWED_EXT.filter(e => !['.jpg','.jpeg','.png','.gif','.webp','.svg'].includes(e));

function _ctxHasImageOption(ctx) {
  const sel = document.getElementById(`${ctx}-upload-tipo`);
  return sel && Array.from(sel.options).some(o => o.value === 'imagem');
}

function _validateUploadFile(file, ctx) {
  if (ctx && _ctxHasImageOption(ctx)) {
    const okType = UPLOAD_ALLOWED_TYPES_NO_IMG.includes(file.type);
    const okExt  = UPLOAD_ALLOWED_EXT_NO_IMG.some(ext => file.name.toLowerCase().endsWith(ext));
    if (!okType && !okExt) {
      if (typeof showToast === 'function') showToast('Tipo de arquivo não permitido. Use PDF, planilha (xls/xlsx/ods/csv) ou apresentação. Para imagens, selecione o tipo "Imagem".', 'error');
      return false;
    }
  } else {
    const okType = UPLOAD_ALLOWED_TYPES.includes(file.type);
    const okExt  = UPLOAD_ALLOWED_EXT.some(ext => file.name.toLowerCase().endsWith(ext));
    if (!okType && !okExt) {
      if (typeof showToast === 'function') showToast('Tipo de arquivo não permitido. Use PDF, imagem, planilha ou apresentação.', 'error');
      return false;
    }
  }
  if (file.size > UPLOAD_MAX_BYTES) {
    if (typeof showToast === 'function') showToast('Arquivo muito grande. Máximo permitido: 30 MB.', 'error');
    return false;
  }
  return true;
}

function _getFileTypeIcon(file) {
  const name = file.name.toLowerCase();
  const type = file.type;
  if (type === 'application/pdf' || name.endsWith('.pdf'))
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;color:#ef4444;flex-shrink:0;"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/></svg>`;
  if (['.doc','.docx','.odt'].some(e => name.endsWith(e)))
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;color:#2563eb;flex-shrink:0;"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>`;
  if (['.xls','.xlsx','.ods','.csv'].some(e => name.endsWith(e)))
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;color:#16a34a;flex-shrink:0;"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><line x1="10" y1="9" x2="14" y2="9"/></svg>`;
  if (['.ppt','.pptx','.odp'].some(e => name.endsWith(e)))
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;color:#ea580c;flex-shrink:0;"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><rect x="8" y="12" width="8" height="5" rx="1"/></svg>`;
  if (['.jpg','.jpeg','.png','.gif','.webp','.svg'].some(e => name.endsWith(e)) || type.startsWith('image/'))
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;color:#0891b2;flex-shrink:0;"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;color:#6b7280;flex-shrink:0;"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
}

function _renderUploadPreview(ctx) {
  const zone    = document.getElementById(`${ctx}-upload-zone`);
  const preview = document.getElementById(`${ctx}-file-preview`);
  const q       = _uploadQueues[ctx];
  if (!preview) return;

  _setSaveBtnBlocked(ctx, !!q.file);

  const isLinkMode = _getUploadMode(ctx) === 'link';

  if (q.file) {
    const icon = _getFileTypeIcon(q.file);
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
    if (zone) zone.style.display = isLinkMode ? 'none' : '';
  }
}

function _clearUploadFile(ctx) {
  // Cancela upload Firebase em andamento
  if (_activeUploadTasks[ctx]) {
    try { _activeUploadTasks[ctx].cancel(); } catch (_) {}
    _activeUploadTasks[ctx] = null;
    const btn = document.getElementById(`${ctx}-upload-btn`);
    _setUploadBtnLoading(btn, false);
    _setSaveBtnBlocked(ctx, false);
    _setImgProgress(ctx, null);
  }
  _uploadQueues[ctx].file    = null;
  _uploadQueues[ctx].dataUrl = null;
  _renderUploadPreview(ctx);
}

// ── Compressão: redimensiona + WebP (JPEG se o navegador não gerar WebP) ──
// As imagens agora vão para o Drive (não mais Base64 no banco), então a qualidade pode ser maior.
const IMG_MAX_DIM  = 1600;  // px — lado máximo após resize
const IMG_QUALITY  = 0.82;  // qualidade WebP

async function _compressImageToJpeg(dataUrl, quality = IMG_QUALITY) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > IMG_MAX_DIM || h > IMG_MAX_DIM) {
        if (w >= h) { h = Math.round(h * IMG_MAX_DIM / w); w = IMG_MAX_DIM; }
        else        { w = Math.round(w * IMG_MAX_DIM / h); h = IMG_MAX_DIM; }
      }
      const canvas = document.createElement('canvas');
      canvas.width  = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const webp = canvas.toDataURL('image/webp', quality);
      resolve(webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function _base64ToBlob(dataUrl, mime) {
  const b64 = dataUrl.split(',')[1];
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function _setImgProgress(ctx, pct) {
  const wrap = document.getElementById(`${ctx}-img-progress`);
  const bar  = document.getElementById(`${ctx}-img-progress-bar`);
  const lbl  = document.getElementById(`${ctx}-img-progress-pct`);
  if (!wrap) return;
  if (pct === null) {
    wrap.style.display = 'none';
    if (bar) bar.style.width = '0%';
    if (lbl) lbl.textContent = '0%';
    return;
  }
  wrap.style.display = '';
  if (bar) bar.style.width = pct + '%';
  if (lbl) lbl.textContent = pct + '%';
}

// ── Limpeza de imgBlobs órfãos ───────────────────────────────
// Analisa /imgBlobs vs publicações e apaga os não-referenciados.
// collections: array de arrays (audits, activities, maintenances, documents, rncItems)
// Retorna { total, orphans, removed } para exibir no relatório.
window.purgeOrphanImgBlobs = async function(collections) {
  const db    = getFirebaseDatabase();
  const dbRef = getFirebaseRef();
  const dbGet = getFirebaseGet();
  const dbSet = getFirebaseSet();

  const snap = await dbGet(dbRef(db, 'imgBlobs'));
  const blobs = snap.exists() ? snap.val() : {};
  const storedIds = Object.keys(blobs);

  // Coleta todos os fileId referenciados em anexos de cards E de publicações.
  // ATENÇÃO: escanear item.anexos é obrigatório — sem isso, imagens anexadas
  // diretamente ao card viram órfãs falsas e são apagadas indevidamente.
  const referenced = new Set();
  const scan = (anexos) => (anexos || []).forEach(a => {
    if (a && a.tipo === 'imagem' && a.fileId) referenced.add(a.fileId);
  });
  (collections || []).forEach(arr => {
    (arr || []).forEach(item => {
      scan(item.anexos);
      (item.publicacoes || []).forEach(pub => scan(pub && pub.anexos));
    });
  });

  // Coleta blobIds de imagens anexadas a mensagens do batepapo (/messages).
  // Sem isso, imagens do chat seriam tratadas como órfãs e apagadas.
  try {
    const msgSnap  = await dbGet(dbRef(db, 'messages'));
    const threads  = msgSnap.exists() ? (msgSnap.val() || {}) : {};
    Object.keys(threads).forEach(tid => {
      const mensagens = (threads[tid] && threads[tid].mensagens) || {};
      Object.keys(mensagens).forEach(mid => {
        (mensagens[mid].anexos || []).forEach(a => {
          if (a && a.blobId) referenced.add(a.blobId);
        });
      });
    });
  } catch (_) {}

  // Coleta blobIds de imagens anexadas a reuniões (/reunioes — reunião, tópicos e
  // blocos, inclusive dentro de exceções de séries recorrentes). Varredura profunda.
  try {
    const reuSnap = await dbGet(dbRef(db, 'reunioes'));
    const walk = (o, depth) => {
      if (!o || typeof o !== 'object' || depth > 12) return;
      if (typeof o.blobId === 'string') referenced.add(o.blobId);
      Object.keys(o).forEach(k => walk(o[k], depth + 1));
    };
    if (reuSnap.exists()) walk(reuSnap.val(), 0);
  } catch (_) {}

  const orphans = storedIds.filter(id => !referenced.has(id));

  await Promise.all(
    orphans.map(id => {
      const d = blobs[id] && blobs[id].drive;
      if (d && typeof driveDelete === 'function') driveDelete(d).catch(() => {});
      return dbSet(dbRef(db, `imgBlobs/${id}`), null).catch(() => {});
    })
  );

  return { total: storedIds.length, orphans: orphans.length, removed: orphans.length };
};

// ── Imagens: Google Drive (WebP) com ponteiro leve em /imgBlobs/{blobId} ──
// Antes: a imagem inteira em Base64 dentro do banco (pesado). Agora: o arquivo vai para o Drive
// e /imgBlobs/{blobId} guarda só { drive: fileId, ts }. Os anexos continuam usando o blobId,
// então nada muda para cards, publicações, RNC, reuniões e chat.
// Imagens Base64 antigas são movidas para o Drive aos poucos (migrarImgBlobsAntigos).
const _imgDriveUrl = (fileId, w = 1600) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w${w}`;

async function _subirImagemDrive(blobId, dataUrl) {
  if (!/^data:image\/(gif|webp)/i.test(dataUrl)) {
    try { dataUrl = await _compressImageToJpeg(dataUrl); } catch (_) {}
  }
  const ext = dataUrl.startsWith('data:image/webp') ? 'webp' : dataUrl.startsWith('data:image/gif') ? 'gif' : dataUrl.startsWith('data:image/png') ? 'png' : 'jpg';
  // direto ao Apps Script: a conversão já foi feita aqui
  const r = await _driveRequest({ action: 'upload', filename: `${blobId}.${ext}`, data: dataUrl });
  const fileId = r && typeof r === 'object' ? (r.fileId || r.id) : null;
  if (!fileId) throw new Error('O Drive não devolveu o arquivo da imagem.');
  return fileId;
}

// Grava a imagem no Drive e o ponteiro em /imgBlobs. Devolve a URL para exibir.
async function _saveImgBlob(blobId, dataUrl) {
  const fileId = await _subirImagemDrive(blobId, dataUrl);
  const db    = getFirebaseDatabase();
  const dbRef = getFirebaseRef();
  const dbSet = getFirebaseSet();
  await dbSet(dbRef(db, `imgBlobs/${blobId}`), { drive: fileId, ts: Date.now() });
  return _imgDriveUrl(fileId);
}

window._deleteImgBlob = async function _deleteImgBlob(blobId) {
  if (!blobId) return;
  try {
    const db    = getFirebaseDatabase();
    const dbRef = getFirebaseRef();
    const dbSet = getFirebaseSet();
    const dbGet = getFirebaseGet();
    const snap = await dbGet(dbRef(db, `imgBlobs/${blobId}/drive`));
    if (snap.exists() && typeof driveDelete === 'function') await driveDelete(snap.val()).catch(() => {});
    await dbSet(dbRef(db, `imgBlobs/${blobId}`), null);
  } catch (_) {}
}

window._loadImgBlob = async function _loadImgBlob(blobId) {
  const db    = getFirebaseDatabase();
  const dbRef = getFirebaseRef();
  const dbGet = getFirebaseGet();
  const snap  = await dbGet(dbRef(db, `imgBlobs/${blobId}`));
  if (!snap.exists()) throw new Error('Imagem não encontrada.');
  const v = snap.val() || {};
  if (v.drive) return _imgDriveUrl(v.drive);
  return v.data;
}

// Move as imagens Base64 antigas de /imgBlobs para o Drive, poucas por vez (só admin, em segundo plano).
// Nenhuma imagem é perdida: o Base64 só sai do banco depois que o arquivo existe no Drive.
// As com mais de 30 dias vão primeiro; em poucas sessões o banco fica só com ponteiros leves.
const IMG_MIGRAR_POR_VEZ = 15;
const IMG_PRAZO_MS = 30 * 24 * 60 * 60 * 1000;
window.migrarImgBlobsAntigos = async function migrarImgBlobsAntigos(maximo = IMG_MIGRAR_POR_VEZ) {
  const db    = getFirebaseDatabase();
  const dbRef = getFirebaseRef();
  const dbGet = getFirebaseGet();
  const dbSet = getFirebaseSet();
  const snap = await dbGet(dbRef(db, 'imgBlobs'));
  if (!snap.exists()) return { movidas: 0, restantes: 0 };
  const agora = Date.now();
  const venceu = (v) => agora - (v.ts || 0) > IMG_PRAZO_MS;
  const antigos = Object.entries(snap.val() || {})
    .filter(([, v]) => v && typeof v.data === 'string' && v.data.startsWith('data:image/'))
    .sort((a, b) => (venceu(a[1]) === venceu(b[1]) ? (a[1].ts || 0) - (b[1].ts || 0) : (venceu(a[1]) ? -1 : 1)));
  let movidas = 0;
  for (const [id, v] of antigos.slice(0, maximo)) {
    try {
      const fileId = await _subirImagemDrive(id, v.data);
      await dbSet(dbRef(db, `imgBlobs/${id}`), { drive: fileId, ts: v.ts || agora, migrado: agora });
      movidas++;
    } catch (e) { console.warn('[imgBlobs] não migrou', id, e && e.message); break; }
  }
  return { movidas, restantes: antigos.length - movidas };
};

// ── Prevenção de imagens órfãs ───────────────────────────────
// Rastreia blobs de imagem enviados na sessão atual de um modal/drawer
// (já gravados em /imgBlobs) mas ainda NÃO persistidos via saveAll().
// Se o usuário cancelar/fechar sem salvar, são apagados para não virarem órfãos.
const _sessionImgBlobs = {};

function _trackSessionImgBlob(ctx, blobId) {
  if (!blobId) return;
  if (!_sessionImgBlobs[ctx]) _sessionImgBlobs[ctx] = new Set();
  _sessionImgBlobs[ctx].add(blobId);
}

// Coleta todos os fileId de imagem efetivamente referenciados nos dados salvos
// (anexos de cards e anexos de publicações), em todas as coleções.
function _collectReferencedBlobIds() {
  const refs = new Set();
  const collections = [
    (typeof audits        !== 'undefined' && audits)        || [],
    (typeof activities    !== 'undefined' && activities)    || [],
    (typeof maintenances  !== 'undefined' && maintenances)  || [],
    (typeof documents     !== 'undefined' && documents)     || [],
    (window.ocorrencias)  || [],
    (window.rncItems)     || []
  ];
  const scan = (anexos) => (anexos || []).forEach(a => {
    if (a && a.tipo === 'imagem' && a.fileId) refs.add(a.fileId);
  });
  collections.forEach(arr => (arr || []).forEach(item => {
    if (!item) return;
    scan(item.anexos);
    (item.publicacoes || []).forEach(p => scan(p && p.anexos));
  }));
  return refs;
}

// Descarta a sessão de upload de um contexto: apaga de /imgBlobs os blobs
// enviados nesta sessão que NÃO estão referenciados em nenhum dado salvo.
// Blobs que já foram persistidos (item salvo) permanecem intactos.
window._discardSessionImgBlobs = function _discardSessionImgBlobs(ctx) {
  const set = _sessionImgBlobs[ctx];
  if (!set || set.size === 0) return;
  const referenced = _collectReferencedBlobIds();
  set.forEach(blobId => {
    if (!referenced.has(blobId) && typeof window._deleteImgBlob === 'function') {
      window._deleteImgBlob(blobId);
    }
  });
  set.clear();
};

// Apaga todos os anexos associados a um item (anexos do card + anexos de todas
// as publicações), evitando órfãos no banco. Usado ao excluir um item
// permanentemente (exclusão manual ou expiração de 30 dias na lixeira):
//  • imagens base64 (tipo 'imagem') → /imgBlobs/{fileId}
//  • arquivos do Drive (fileId com tipo != 'imagem'/'link') → driveDelete
//  • links (tipo 'link') não têm arquivo → nada a apagar
// Mesma disciplina do _removeAnexoItem (remoção individual de anexo).
window._deleteItemImgBlobs = function _deleteItemImgBlobs(item) {
  if (!item) return;
  const del = (anexos) => (anexos || []).forEach(a => {
    if (!a || !a.fileId) return;
    if (a.tipo === 'imagem') {
      if (typeof window._deleteImgBlob === 'function') window._deleteImgBlob(a.fileId);
    } else if (a.tipo !== 'link' && typeof driveDelete === 'function') {
      driveDelete(a.fileId).catch(() => {});
    }
  });
  del(item.anexos);
  (item.publicacoes || []).forEach(p => del(p && p.anexos));
};

async function doUploadImagemFirebase(ctx, onSuccess) {
  const q = _uploadQueues[ctx];
  if (!q.file || !q.dataUrl) {
    if (typeof showToast === 'function') showToast('Selecione uma imagem primeiro.', 'error');
    return;
  }
  const titleInput = document.getElementById(`${ctx}-upload-title`);
  const title = (titleInput?.value || '').trim();
  if (!title) {
    if (typeof showToast === 'function') showToast('Informe um nome para a imagem.', 'error');
    if (titleInput) titleInput.focus();
    return;
  }

  const btn = document.getElementById(`${ctx}-upload-btn`);
  _setUploadBtnLoading(btn, true);
  _setSaveBtnBlocked(ctx, true);
  _setImgProgress(ctx, 10);

  try {
    // Comprime: resize 900px + JPEG 55%
    _setImgProgress(ctx, 30);
    const compressed = await _compressImageToJpeg(q.dataUrl);
    _setImgProgress(ctx, 60);

    // ID único para o blob
    const blobId = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Salva em /imgBlobs/{blobId} — isolado do saveAll()
    await _saveImgBlob(blobId, compressed);
    // Marca como blob de sessão: será descartado se o modal/drawer fechar sem salvar
    _trackSessionImgBlob(ctx, blobId);
    _setImgProgress(ctx, 100);

    if (titleInput) titleInput.value = '';
    _clearUploadFile(ctx);
    if (typeof onSuccess === 'function') onSuccess({ titulo: title, url: null, fileId: blobId, tipo: 'imagem' });
    if (typeof showToast === 'function') showToast('Imagem salva com sucesso!', 'success');
  } catch (err) {
    if (!err.canceled) {
      if (typeof showToast === 'function') showToast('Erro ao salvar imagem: ' + err.message, 'error');
    }
  } finally {
    _activeUploadTasks[ctx] = null;
    _setUploadBtnLoading(btn, false);
    _setSaveBtnBlocked(ctx, false);
    _setImgProgress(ctx, null);
  }
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

    const fileExt = _tagFromFile(q.file);
    if (titleInput) titleInput.value = '';
    _clearUploadFile(ctx);
    if (typeof onSuccess === 'function') onSuccess({ titulo: title, url: fileUrl, fileId, fileExt });
    if (typeof showToast === 'function') showToast('Arquivo enviado com sucesso!', 'success');
  } catch (err) {
    if (typeof showToast === 'function') showToast('Erro ao enviar: ' + err.message, 'error');
  } finally {
    _setUploadBtnLoading(btn, false);
    _setSaveBtnBlocked(ctx, false);
  }
}

// A listagem pública da pasta foi removida do Apps Script (expunha todos os arquivos).
// O upload agora devolve fileId e url direto.
async function _findUploadedFile() { return null; }

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
  // Cancela upload em andamento ao resetar
  if (_activeUploadTasks[ctx]) {
    try { _activeUploadTasks[ctx].cancel(); } catch (_) {}
    _activeUploadTasks[ctx] = null;
  }
  _uploadQueues[ctx] = { file: null, dataUrl: null };
  const titleInput = document.getElementById(`${ctx}-upload-title`);
  if (titleInput) titleInput.value = '';
  const linkInput = document.getElementById(`${ctx}-link-input`);
  if (linkInput) linkInput.value = '';
  const tipoSel = document.getElementById(`${ctx}-upload-tipo`);
  if (tipoSel) { tipoSel.value = 'arquivo'; _onUploadTipoChange(ctx); }
  _renderUploadPreview(ctx);
}

// ── Sistema de anexos para drawers (audit, ativ, doc, mant) ──

// Renderiza a lista de anexos já salvos no container
function _renderAnexosList(ctx) {
  const list = document.getElementById(`${ctx}-anexos-list`);
  if (!list) return;
  const items = (window._anexosData && window._anexosData[ctx]) || [];
  if (items.length === 0) {
    list.innerHTML = '';
    return;
  }
  list.innerHTML = items.map((a, i) => {
    const name = a.titulo || a.url || 'Arquivo';
    const iconSvg = window._anexoIconSvg(a, '15px');
    const nameEsc = name.replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const safeBlobId = (a.fileId || '').replace(/'/g, "\\'");
    const nameLink = a.tipo === 'imagem'
      ? `<button type="button" class="anexo-saved-name anexo-name-display" title="${nameEsc}" onclick="window.openImgLightboxBlob && window.openImgLightboxBlob('${safeBlobId}', this.title)" style="background:none;border:none;padding:0;cursor:pointer;text-align:left;">${nameEsc}</button>`
      : `<a href="${a.url}" target="_blank" class="anexo-saved-name anexo-name-display" title="${nameEsc}">${nameEsc}</a>`;
    return `
      <div class="anexo-saved-item" id="anexo-item-${ctx}-${i}">
        ${iconSvg}
        ${nameLink}
        <input type="text" class="anexo-name-input" value="${nameEsc}" style="display:none;"
          onblur="_commitRenameAnexo('${ctx}',${i},this)"
          onkeydown="if(event.key==='Enter'){this.blur();}if(event.key==='Escape'){_cancelRenameAnexo('${ctx}',${i},this);}">
        ${a.tipo !== 'imagem' ? `<button class="anexo-rename-btn" onclick="_startRenameAnexo('${ctx}',${i})" title="Renomear">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="width:11px;height:11px;">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>` : ''}
        <button class="anexo-del" onclick="_removeAnexoItem('${ctx}', ${i})" title="Remover">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="width:11px;height:11px;">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>`;
  }).join('');
}

function _removeAnexoItem(ctx, index) {
  if (!window._anexosData) window._anexosData = {};
  if (!window._anexosData[ctx]) window._anexosData[ctx] = [];
  const anexo = window._anexosData[ctx][index];
  const nome = (anexo && anexo.titulo) ? `"${anexo.titulo}"` : 'este anexo';
  showConfirmDanger({
    title: 'Remover anexo?',
    message: `${nome} será removido e não poderá ser recuperado.`,
    confirmLabel: 'Remover',
    onConfirm: () => {
      if (anexo && anexo.fileId) {
        if (anexo.tipo === 'imagem') {
          _deleteImgBlob(anexo.fileId);
        } else {
          driveDelete(anexo.fileId).catch(() => {});
        }
      }
      window._anexosData[ctx].splice(index, 1);
      _renderAnexosList(ctx);
    }
  });
}

function _startRenameAnexo(ctx, index) {
  const item = document.getElementById(`anexo-item-${ctx}-${index}`);
  if (!item) return;
  const display = item.querySelector('.anexo-name-display');
  const input   = item.querySelector('.anexo-name-input');
  const renBtn  = item.querySelector('.anexo-rename-btn');
  if (!display || !input) return;
  display.style.display = 'none';
  input.style.display   = '';
  if (renBtn) renBtn.style.display = 'none';
  input.focus();
  input.select();
}

function _cancelRenameAnexo(ctx, index, input) {
  const item = document.getElementById(`anexo-item-${ctx}-${index}`);
  if (!item) return;
  const display = item.querySelector('.anexo-name-display');
  const renBtn  = item.querySelector('.anexo-rename-btn');
  if (display) {
    input.value = display.textContent;
    display.style.display = '';
  }
  input.style.display = 'none';
  if (renBtn) renBtn.style.display = '';
}

function _commitRenameAnexo(ctx, index, input) {
  if (!window._anexosData || !window._anexosData[ctx]) return;
  const anexo = window._anexosData[ctx][index];
  if (!anexo) return;

  const newName = input.value.trim();
  if (!newName) { _cancelRenameAnexo(ctx, index, input); return; }

  const oldName = anexo.titulo || '';
  if (newName === oldName) { _cancelRenameAnexo(ctx, index, input); return; }

  anexo.titulo = newName;

  // Renomeia no Drive se tiver fileId (arquivos; links não têm arquivo no Drive).
  // A tag fileExt (usada para o ícone) é independente do título e não é alterada aqui.
  if (anexo.fileId && anexo.tipo !== 'link') {
    const ext = anexo.fileExt || (oldName.includes('.') ? oldName.slice(oldName.lastIndexOf('.')) : '');
    const driveName = newName.toLowerCase().endsWith(ext.toLowerCase()) ? newName : newName + ext;
    renameAnexoDrive(anexo.fileId, driveName).catch(() => {});
  }

  _renderAnexosList(ctx);
}

// Chamado pelo modal ao abrir para edição — restaura anexos existentes
function restoreAnexosUpload(ctx, anexos) {
  if (!window._anexosData) window._anexosData = {};
  window._anexosData[ctx] = (anexos || []).filter(a => a && (a.url || (a.tipo === 'imagem' && a.fileId)));
  _renderAnexosList(ctx);
  resetUploadZone(ctx);
}

// Chamado pelo modal ao salvar — retorna array de anexos
function getAnexosUpload(ctx) {
  if (!window._anexosData) return [];
  return (window._anexosData[ctx] || []).filter(a => a && (a.url || (a.tipo === 'imagem' && a.fileId)));
}

// Executa o upload do arquivo pendente ou adiciona link
async function submitAnexoUpload(ctx, getPrefixo) {
  const mode = _getUploadMode(ctx);

  if (mode === 'imagem') {
    await doUploadImagemFirebase(ctx, (result) => {
      if (!window._anexosData) window._anexosData = {};
      if (!window._anexosData[ctx]) window._anexosData[ctx] = [];
      window._anexosData[ctx].push(result);
      _renderAnexosList(ctx);
    });
    return;
  }

  if (mode === 'link') {
    const titleInput = document.getElementById(`${ctx}-upload-title`);
    const linkInput  = document.getElementById(`${ctx}-link-input`);
    const title = (titleInput?.value || '').trim();
    const url   = (linkInput?.value || '').trim();
    if (!title) {
      if (typeof showToast === 'function') showToast('Informe um nome para o link.', 'error');
      if (titleInput) titleInput.focus();
      return;
    }
    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
      if (typeof showToast === 'function') showToast('Informe uma URL válida (http:// ou https://).', 'error');
      if (linkInput) linkInput.focus();
      return;
    }
    if (!window._anexosData) window._anexosData = {};
    if (!window._anexosData[ctx]) window._anexosData[ctx] = [];
    window._anexosData[ctx].push({ titulo: title, url, fileId: null, tipo: 'link', fileExt: '' });
    _renderAnexosList(ctx);
    if (titleInput) titleInput.value = '';
    if (linkInput) linkInput.value = '';
    if (typeof showToast === 'function') showToast('Link adicionado com sucesso!', 'success');
    return;
  }

  await doUploadAnexo(ctx, (result) => {
    if (!window._anexosData) window._anexosData = {};
    if (!window._anexosData[ctx]) window._anexosData[ctx] = [];
    window._anexosData[ctx].push(result);
    _renderAnexosList(ctx);
  }, getPrefixo);
}

// Limpa zona de upload e lista ao fechar modal
function clearAnexosUpload(ctx) {
  if (!window._anexosData) window._anexosData = {};
  window._anexosData[ctx] = [];
  _renderAnexosList(ctx);
  resetUploadZone(ctx);
}

// ── Inicialização automática ao carregar ─────────────────────
document.addEventListener('DOMContentLoaded', function () {
  initUploadZone('pub');
  initUploadZone('edit-pub');
  initUploadZone('audit');
  initUploadZone('ativ');
  initUploadZone('doc');
  initUploadZone('mant');
  initUploadZone('oc');
  initUploadZone('rnc');
});


// ── Imagens do Drive abrem no visualizador (o mesmo do chat), não numa aba nova ──
// Vale para qualquer link de anexo que aponte para um arquivo do Drive e seja imagem
// (pela extensão no nome, no título ou pelo ícone de imagem). Ctrl/Cmd+clique ainda abre a aba.
(function () {
  const IMG = /\.(jpe?g|png|gif|webp|bmp|tiff?)(\s|$|\))/i;
  const ID = /drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([A-Za-z0-9_-]{10,})/;
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.closest('#imgLightbox')) return;
    const m = ID.exec(a.getAttribute('href') || '');
    if (!m) return;
    const nome = (a.getAttribute('title') || a.textContent || '').trim();
    const ehImg = IMG.test(nome + ' ') || a.querySelector('.fa-file-image, .fa-image') || a.dataset.tipo === 'imagem';
    if (!ehImg || typeof window.openImgLightbox !== 'function') return;
    e.preventDefault();
    e.stopPropagation();
    window.openImgLightbox('https://drive.google.com/thumbnail?id=' + encodeURIComponent(m[1]) + '&sz=w1600', nome);
  }, true);
})();
