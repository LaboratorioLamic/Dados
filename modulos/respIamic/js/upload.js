// Sistema genérico de anexos — reutilizável em qualquer formulário da página.
//
// Cada formulário que aceita anexos é identificado por uma string `ctx` (contexto).
// Todo o estado e todos os elementos são indexados por essa string, então o mesmo
// código atende N formulários simultâneos.
//
// Três modos de anexo, escolhidos pelo usuário no <select> {ctx}-upload-tipo:
//   arquivo → envia ao Google Drive via Web App do Apps Script
//   imagem  → reduz no navegador (WebP), envia ao Google Drive e grava só o ponteiro
//             { drive: fileId, ts } em /imgBlobs/{blobId}. Imagens Base64 antigas são
//             movidas para o Drive aos poucos (migrarImgBlobsAntigos).
//   link    → não envia nada, só guarda a URL digitada

// ── BACKEND ─────────────────────────────────────────────────
const DRIVE_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwpeeSawMsBQkC2h8smOakK-UQXezLlSprDLw3fBPWGSZzUpoptqYiv_WbN1MgTPwtC/exec';

const UPLOAD_TIMEOUT_MS = 90000;

// O Apps Script responde através de um redirect para googleusercontent.com, e o
// corpo às vezes chega embrulhado em HTML. Tenta o JSON direto e, se falhar,
// procura o primeiro objeto JSON dentro do texto antes de desistir.
function _parseRespostaDrive(texto) {
    const bruto = String(texto || '').trim();
    if (!bruto) return '';

    try {
        return JSON.parse(bruto);
    } catch (e) { /* segue para o resgate abaixo */ }

    const inicio = bruto.indexOf('{');
    const fim = bruto.lastIndexOf('}');
    if (inicio !== -1 && fim > inicio) {
        try {
            return JSON.parse(bruto.slice(inicio, fim + 1));
        } catch (e) { /* não era JSON — devolve o texto cru */ }
    }
    return bruto;
}

// POST sem header Content-Type — o Apps Script não responde ao preflight CORS.
async function driveRequest(payload) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

    try {
        // ID token da sessão do Dados LAMIC: o Apps Script recusa pedidos sem ele (agendas.js)
        const idToken = fbAuth.currentUser ? await fbAuth.currentUser.getIdToken() : null;
        if (!idToken) throw new Error('Sessão do Dados LAMIC ausente. Recarregue a página.');
        const resp = await fetch(DRIVE_ENDPOINT, {
            method: 'POST',
            body: JSON.stringify({ ...payload, idToken }),
            signal: controller.signal
        });
        const r = _parseRespostaDrive(await resp.text());
        if (r && typeof r === 'object' && (r.success === false || r.error)) {
            throw new Error(r.error || r.message || 'O servidor recusou o pedido.');
        }
        return r;
    } catch (err) {
        if (err.name === 'AbortError') {
            throw new Error('O envio demorou demais e foi cancelado. Verifique sua conexão e tente novamente.');
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

// ── LIMITES E TIPOS ACEITOS ─────────────────────────────────
const ANEXO_MAX_ARQUIVO = 30 * 1024 * 1024;   // 30 MB
const ANEXO_MAX_IMAGEM  = 5 * 1024 * 1024;    // 5 MB antes da compressão

const EXT_ARQUIVO = ['pdf', 'doc', 'docx', 'odt', 'xls', 'xlsx', 'ods', 'csv', 'ppt', 'pptx', 'odp', 'jpg', 'jpeg', 'png', 'gif', 'webp'];
const EXT_IMAGEM  = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'tif'];

const MIME_ARQUIVO = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.oasis.opendocument.spreadsheet',
    'text/csv',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.oasis.opendocument.presentation',
    'image/jpeg', 'image/png', 'image/gif', 'image/webp'
];
const MIME_IMAGEM = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff'];

const ACCEPT_ARQUIVO = '.pdf,.doc,.docx,.odt,.xls,.xlsx,.ods,.csv,.ppt,.pptx,.odp,.jpg,.jpeg,.png,.gif,.webp';
const ACCEPT_IMAGEM  = '.jpg,.jpeg,.png,.gif,.webp,.bmp,.tiff';

// ── ESTADO POR CONTEXTO ─────────────────────────────────────
// _anexosState[ctx] = { anexos: [], pendente: {file,dataUrl}|null, enviando: bool, blobsSessao: Set }
const _anexosState = {};

function _uploadState(ctx) {
    if (!_anexosState[ctx]) {
        _anexosState[ctx] = {
            anexos: [],
            pendente: null,
            enviando: false,
            blobsSessao: new Set()
        };
    }
    return _anexosState[ctx];
}

// ── HELPERS DE DOM (sempre defensivos) ──────────────────────
function _upEl(ctx, sufixo) {
    return document.getElementById(`${ctx}-${sufixo}`);
}

function _escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function _uploadToast(msg, tipo) {
    if (typeof showNotification === 'function') showNotification(msg, tipo || 'info');
    else console.log(`[${tipo || 'info'}] ${msg}`);
}

// Extensão a partir do File real — nunca do título.
function _extDoArquivo(file) {
    const nome = (file && file.name) || '';
    const partes = nome.split('.');
    return partes.length > 1 ? partes.pop().toLowerCase() : '';
}

function _extDoNome(nome) {
    const partes = String(nome || '').split('.');
    return partes.length > 1 ? partes.pop().toLowerCase() : '';
}

// O contexto oferece o modo "imagem"? Se sim, o modo "arquivo" rejeita imagens.
function _temModoImagem(ctx) {
    const sel = _upEl(ctx, 'upload-tipo');
    if (!sel) return false;
    return Array.from(sel.options).some(o => o.value === 'imagem');
}

function _modoAtual(ctx) {
    const sel = _upEl(ctx, 'upload-tipo');
    return sel ? sel.value : 'arquivo';
}

// ── ÍCONES (SVG inline, sem dependência externa) ─────────────
const _ICON_CORES = {
    pdf:       '#dc2626',
    word:      '#2563eb',
    planilha:  '#16a34a',
    slides:    '#ea580c',
    imagem:    '#06b6d4',
    link:      '#7c3aed',
    generico:  '#64748b'
};

function _familiaDaExt(ext) {
    const e = String(ext || '').toLowerCase();
    if (e === 'pdf') return 'pdf';
    if (['doc', 'docx', 'odt'].includes(e)) return 'word';
    if (['xls', 'xlsx', 'ods', 'csv'].includes(e)) return 'planilha';
    if (['ppt', 'pptx', 'odp'].includes(e)) return 'slides';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'tif', 'svg'].includes(e)) return 'imagem';
    return 'generico';
}

// Ícone do anexo — a extensão é a fonte única de verdade.
function _iconeAnexo(ext, tipo) {
    if (tipo === 'link') {
        return `<svg class="anexo-icon" viewBox="0 0 24 24" fill="none" stroke="${_ICON_CORES.link}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
        </svg>`;
    }

    const familia = tipo === 'imagem' ? 'imagem' : _familiaDaExt(ext);
    const cor = _ICON_CORES[familia] || _ICON_CORES.generico;

    if (familia === 'imagem') {
        return `<svg class="anexo-icon" viewBox="0 0 24 24" fill="none" stroke="${cor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2"></rect>
            <circle cx="8.5" cy="8.5" r="1.5"></circle>
            <path d="M21 15l-5-5L5 21"></path>
        </svg>`;
    }

    if (familia === 'planilha') {
        return `<svg class="anexo-icon" viewBox="0 0 24 24" fill="none" stroke="${cor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <path d="M14 2v6h6"></path><path d="M8 13h8"></path><path d="M8 17h8"></path><path d="M12 13v4"></path>
        </svg>`;
    }

    if (familia === 'slides') {
        return `<svg class="anexo-icon" viewBox="0 0 24 24" fill="none" stroke="${cor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="12" rx="2"></rect>
            <path d="M12 16v4"></path><path d="M8 20h8"></path>
        </svg>`;
    }

    // pdf / word / genérico — folha de papel com linhas
    return `<svg class="anexo-icon" viewBox="0 0 24 24" fill="none" stroke="${cor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <path d="M14 2v6h6"></path><path d="M8 13h8"></path><path d="M8 17h5"></path>
    </svg>`;
}

// ── VALIDAÇÃO ───────────────────────────────────────────────
// Valida por MIME OU por extensão (com ||, nunca &&): muitos navegadores
// reportam type vazio para formatos OpenDocument.
function _validarArquivo(ctx, file) {
    const ext = _extDoArquivo(file);
    const mime = (file.type || '').toLowerCase();
    const modo = _modoAtual(ctx);

    if (modo === 'imagem') {
        if (file.size > ANEXO_MAX_IMAGEM) {
            return 'Imagem acima de 5 MB. Reduza a imagem antes de enviar.';
        }
        if (!(MIME_IMAGEM.includes(mime) || EXT_IMAGEM.includes(ext))) {
            return 'Formato de imagem não aceito. Use JPG, PNG, GIF, WEBP, BMP ou TIFF.';
        }
        return null;
    }

    if (file.size > ANEXO_MAX_ARQUIVO) {
        return 'Arquivo acima de 30 MB. Envie um arquivo menor.';
    }
    if (!(MIME_ARQUIVO.includes(mime) || EXT_ARQUIVO.includes(ext))) {
        return 'Formato de arquivo não aceito. Use PDF, Word, planilha, slides ou imagem.';
    }
    // Com o modo Imagem disponível, o modo Arquivo rejeita imagens para forçar a compressão.
    if (_temModoImagem(ctx) && (mime.startsWith('image/') || EXT_IMAGEM.includes(ext))) {
        return 'Para imagens, use o modo "Imagem" — ele comprime o arquivo antes de salvar.';
    }
    return null;
}

// ── SELEÇÃO DE ARQUIVO ──────────────────────────────────────
function handleUploadFile(ctx, file) {
    if (!file) return;

    const erro = _validarArquivo(ctx, file);
    if (erro) {
        _uploadToast(erro, 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        _uploadState(ctx).pendente = { file, dataUrl: e.target.result };
        renderUploadPreview(ctx);
        atualizarBloqueioSalvar(ctx);
    };
    reader.onerror = () => _uploadToast('Não foi possível ler o arquivo selecionado.', 'error');
    reader.readAsDataURL(file);
}

function onUploadFileInput(ctx, input) {
    if (!input) return;
    const file = input.files && input.files[0];
    handleUploadFile(ctx, file);
    input.value = '';   // permite reselecionar o mesmo arquivo
}

function descartarUploadPendente(ctx) {
    _uploadState(ctx).pendente = null;
    renderUploadPreview(ctx);
    atualizarBloqueioSalvar(ctx);
}

// ── PREVIEW DO ARQUIVO SELECIONADO ──────────────────────────
function renderUploadPreview(ctx) {
    const preview = _upEl(ctx, 'file-preview');
    const zona = _upEl(ctx, 'upload-zone');
    if (!preview) return;

    const st = _uploadState(ctx);

    if (!st.pendente) {
        preview.innerHTML = '';
        preview.classList.add('hidden');
        if (zona && _modoAtual(ctx) !== 'link') zona.classList.remove('hidden');
        return;
    }

    const ext = _extDoArquivo(st.pendente.file);
    preview.innerHTML = `
        <div class="anexo-preview-card">
            ${_iconeAnexo(ext, _modoAtual(ctx) === 'imagem' ? 'imagem' : 'arquivo')}
            <span class="anexo-preview-nome" title="${_escapeHtml(st.pendente.file.name)}">${_escapeHtml(st.pendente.file.name)}</span>
            <button type="button" class="anexo-btn-remover" title="Remover arquivo selecionado"
                onclick="descartarUploadPendente('${ctx}')">&times;</button>
        </div>`;
    preview.classList.remove('hidden');
    if (zona) zona.classList.add('hidden');   // enquanto houver preview, esconde a drop-zone
}

// ── TROCA DE TIPO ───────────────────────────────────────────
function onUploadTipoChange(ctx) {
    const modo = _modoAtual(ctx);
    const zona = _upEl(ctx, 'upload-zone');
    const linkWrap = _upEl(ctx, 'link-wrap');
    const input = _upEl(ctx, 'file-input');
    const dica = _upEl(ctx, 'upload-dica');
    const btn = _upEl(ctx, 'upload-btn');

    // Trocar de modo descarta o arquivo pendente
    _uploadState(ctx).pendente = null;
    renderUploadPreview(ctx);

    if (modo === 'link') {
        if (zona) zona.classList.add('hidden');
        if (linkWrap) linkWrap.classList.remove('hidden');
    } else {
        if (zona) zona.classList.remove('hidden');
        if (linkWrap) linkWrap.classList.add('hidden');
        if (input) input.setAttribute('accept', modo === 'imagem' ? ACCEPT_IMAGEM : ACCEPT_ARQUIVO);
        if (dica) {
            dica.textContent = modo === 'imagem'
                ? 'JPG, PNG, GIF, WEBP · até 5 MB'
                : 'PDF, Word, planilha, slides · até 30 MB';
        }
    }

    if (btn) btn.textContent = modo === 'link' ? 'Adicionar' : 'Enviar';
    const linkInput = _upEl(ctx, 'link-input');
    if (linkInput && modo !== 'link') linkInput.value = '';

    atualizarBloqueioSalvar(ctx);
}

// ── DRAG & DROP ─────────────────────────────────────────────
function initUploadZone(ctx) {
    const zona = _upEl(ctx, 'upload-zone');
    const input = _upEl(ctx, 'file-input');
    const select = _upEl(ctx, 'upload-tipo');
    if (!zona) return;

    if (zona.dataset.uploadInit === '1') return;   // não duplicar listeners
    zona.dataset.uploadInit = '1';

    zona.addEventListener('click', () => {
        if (input) input.click();
    });

    zona.addEventListener('dragover', (e) => {
        e.preventDefault();
        zona.classList.add('dragover');
    });

    zona.addEventListener('dragleave', (e) => {
        e.preventDefault();
        zona.classList.remove('dragover');
    });

    zona.addEventListener('drop', (e) => {
        e.preventDefault();
        zona.classList.remove('dragover');
        const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        handleUploadFile(ctx, file);
    });

    if (input) {
        input.addEventListener('change', () => onUploadFileInput(ctx, input));
    }
    if (select) {
        select.addEventListener('change', () => onUploadTipoChange(ctx));
    }

    onUploadTipoChange(ctx);
}

// ── COMPRESSÃO DE IMAGEM ────────────────────────────────────
// As imagens vão para o Drive (não mais Base64 no banco): WebP, lado máximo 1600px.
const IMG_MAX_LADO = 1600;
const IMG_QUALIDADE = 0.82;

function comprimirImagem(dataUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            let { width, height } = img;
            const maior = Math.max(width, height);
            if (maior > IMG_MAX_LADO) {
                const escala = IMG_MAX_LADO / maior;
                width = Math.round(width * escala);
                height = Math.round(height * escala);
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx2d = canvas.getContext('2d');
            ctx2d.drawImage(img, 0, 0, width, height);
            const webp = canvas.toDataURL('image/webp', IMG_QUALIDADE);
            resolve(webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', IMG_QUALIDADE));
        };
        img.onerror = () => reject(new Error('Não foi possível processar a imagem.'));
        img.src = dataUrl;
    });
}

// O RTDB não expõe progresso real — a barra avança por marcos.
function _setImgProgresso(ctx, pct) {
    const box = _upEl(ctx, 'img-progress');
    const barra = _upEl(ctx, 'img-progress-bar');
    const texto = _upEl(ctx, 'img-progress-pct');
    if (box) box.classList.toggle('hidden', pct === null);
    if (pct === null) return;
    if (barra) barra.style.width = `${pct}%`;
    if (texto) texto.textContent = `${pct}%`;
}

// Imagem: Drive (WebP) + ponteiro leve em /imgBlobs/{blobId}
const _imgDriveUrl = (fileId, w = 1600) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w${w}`;

async function _subirImagemDrive(nome, dataUrl) {
    if (!/^data:image\/(gif|webp)/i.test(dataUrl)) {
        try { dataUrl = await comprimirImagem(dataUrl); } catch (e) { /* envia o original */ }
    }
    const ext = dataUrl.startsWith('data:image/webp') ? 'webp' : dataUrl.startsWith('data:image/gif') ? 'gif'
        : dataUrl.startsWith('data:image/png') ? 'png' : 'jpg';
    const r = await driveRequest({ action: 'upload', filename: `${nome}.${ext}`, data: dataUrl });
    const fileId = r && typeof r === 'object' ? (r.fileId || r.id) : null;
    if (!fileId) throw new Error('O Drive não devolveu o arquivo da imagem.');
    return fileId;
}

// Apaga a imagem: arquivo no Drive (se houver) e o registro em /imgBlobs
async function apagarImagemBlob(blobId) {
    if (!blobId) return;
    const snap = await database.ref(`imgBlobs/${blobId}/drive`).once('value');
    if (snap.exists()) { try { await driveRequest({ action: 'delete', id: snap.val() }); } catch (e) { console.warn('Drive:', e.message); } }
    await database.ref(`imgBlobs/${blobId}`).remove();
}

async function salvarImagemBlob(ctx, dataUrl) {
    _setImgProgresso(ctx, 10);
    const blobId = 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    _setImgProgresso(ctx, 30);

    const fileId = await _subirImagemDrive(blobId, dataUrl);
    _setImgProgresso(ctx, 80);

    await database.ref(`imgBlobs/${blobId}`).set({ drive: fileId, ts: Date.now() });
    _setImgProgresso(ctx, 100);

    // Blob gravado antes de o formulário ser salvo — rastreia para limpar se cancelarem.
    _uploadState(ctx).blobsSessao.add(blobId);

    setTimeout(() => _setImgProgresso(ctx, null), 600);
    return blobId;
}

// ── NOME FINAL DO ARQUIVO ───────────────────────────────────
// Concatena o título com a extensão original, sem duplicar se o título já a tiver.
function _nomeFinal(titulo, ext) {
    if (!ext) return titulo;
    return _extDoNome(titulo) === ext ? titulo : `${titulo}.${ext}`;
}

// ── ENVIO ───────────────────────────────────────────────────
async function submitAnexoUpload(ctx) {
    const st = _uploadState(ctx);
    const tituloEl = _upEl(ctx, 'upload-title');
    const btn = _upEl(ctx, 'upload-btn');
    const modo = _modoAtual(ctx);
    const titulo = tituloEl ? tituloEl.value.trim() : '';

    if (!titulo) {
        _uploadToast('Informe o nome do anexo antes de enviar.', 'error');
        return;
    }

    // Modo link — sem requisição
    if (modo === 'link') {
        const linkInput = _upEl(ctx, 'link-input');
        const url = linkInput ? linkInput.value.trim() : '';
        if (!/^https?:\/\//i.test(url)) {
            _uploadToast('Informe uma URL válida começando com http:// ou https://', 'error');
            return;
        }
        st.anexos.push({ titulo, url, fileId: null, tipo: 'link', fileExt: '' });
        if (tituloEl) tituloEl.value = '';
        if (linkInput) linkInput.value = '';
        renderAnexosList(ctx);
        atualizarBloqueioSalvar(ctx);
        _uploadToast('Link adicionado.', 'success');
        return;
    }

    if (!st.pendente) {
        _uploadToast('Selecione um arquivo antes de enviar.', 'error');
        return;
    }

    const rotuloOriginal = btn ? btn.textContent : '';
    st.enviando = true;
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Enviando...';
    }
    atualizarBloqueioSalvar(ctx);

    try {
        const file = st.pendente.file;
        const ext = _extDoArquivo(file);            // fonte única de verdade do ícone

        if (modo === 'imagem') {
            const blobId = await salvarImagemBlob(ctx, st.pendente.dataUrl);
            st.anexos.push({ titulo, url: null, fileId: blobId, tipo: 'imagem', fileExt: ext });
        } else {
            let dados = st.pendente.dataUrl, extEnvio = ext;
            if (/^data:image\/(jpeg|png|webp|bmp|tiff)/i.test(dados)) {
                try {
                    dados = await comprimirImagem(dados);
                    extEnvio = dados.startsWith('data:image/webp') ? 'webp' : 'jpg';
                } catch (e) { /* envia o original */ }
            }
            const resp = await driveRequest({
                action: 'upload',
                filename: _nomeFinal(titulo.replace(/\.[^.]+$/, ''), extEnvio),
                data: dados
            });
            console.log('Resposta do Apps Script (upload):', resp);

            if (!resp || typeof resp !== 'object') {
                throw new Error(typeof resp === 'string' && resp
                    ? `Resposta inesperada do servidor: ${resp.slice(0, 120)}`
                    : 'O servidor não respondeu ao envio do arquivo.');
            }
            if (resp.success === false || resp.error) {
                throw new Error(resp.error || resp.message || 'O servidor recusou o envio do arquivo.');
            }

            const fileId = resp.fileId || resp.id || null;   // aceita "id" como alias
            // Alguns retornos trazem só o id — nesse caso monta o link de visualização.
            const url = resp.url || (fileId ? `https://drive.google.com/file/d/${fileId}/view` : null);
            if (!url) {
                throw new Error('O servidor não devolveu o link do arquivo enviado.');
            }

            st.anexos.push({ titulo, url, fileId, fileExt: ext });
        }

        if (tituloEl) tituloEl.value = '';
        st.pendente = null;
        renderUploadPreview(ctx);
        renderAnexosList(ctx);
        _uploadToast('Anexo enviado com sucesso.', 'success');
    } catch (err) {
        console.error('Erro no envio do anexo:', err);
        _uploadToast(err.message || 'Falha ao enviar o anexo. Tente novamente.', 'error');
        _setImgProgresso(ctx, null);
    } finally {
        st.enviando = false;
        if (btn) {
            btn.disabled = false;
            btn.textContent = rotuloOriginal || 'Enviar';
        }
        atualizarBloqueioSalvar(ctx);
    }
}

// ── BLOQUEIO DO BOTÃO SALVAR ────────────────────────────────
// Salvar com anexo pendente geraria um registro sem o vínculo do arquivo
// e um arquivo órfão no servidor.
function atualizarBloqueioSalvar(ctx) {
    const st = _uploadState(ctx);
    const btn = _upEl(ctx, 'save-btn');
    if (!btn) return;

    const bloquear = !!st.pendente || st.enviando;
    btn.disabled = bloquear;
    btn.style.opacity = bloquear ? '0.5' : '';
    btn.style.cursor = bloquear ? 'not-allowed' : '';
    btn.title = bloquear
        ? (st.enviando ? 'Aguarde o envio do anexo terminar.' : 'Envie ou remova o arquivo selecionado antes de salvar.')
        : '';
}

// ── LISTA DE ANEXOS ADICIONADOS ─────────────────────────────
function renderAnexosList(ctx) {
    const lista = _upEl(ctx, 'anexos-list');
    if (!lista) return;

    const st = _uploadState(ctx);
    lista.innerHTML = '';

    st.anexos.forEach((anexo, idx) => {
        const linha = document.createElement('div');
        linha.className = 'anexo-item';

        const icone = document.createElement('span');
        icone.className = 'anexo-item-icon';
        icone.innerHTML = _iconeAnexo(anexo.fileExt, anexo.tipo);
        linha.appendChild(icone);

        // Nome — link para arquivos/links; botão que carrega o Base64 para imagens
        let nomeEl;
        if (anexo.tipo === 'imagem') {
            nomeEl = document.createElement('button');
            nomeEl.type = 'button';
            nomeEl.className = 'anexo-item-nome anexo-item-nome-btn';
            nomeEl.onclick = () => abrirImagemAnexo(anexo.fileId, anexo.titulo);
        } else {
            nomeEl = document.createElement('a');
            nomeEl.className = 'anexo-item-nome';
            nomeEl.href = anexo.url || '#';
            nomeEl.target = '_blank';
            nomeEl.rel = 'noopener noreferrer';
        }
        nomeEl.textContent = anexo.titulo;
        nomeEl.title = anexo.titulo;
        nomeEl.setAttribute('data-anexo-nome', String(idx));
        linha.appendChild(nomeEl);

        const acoes = document.createElement('div');
        acoes.className = 'anexo-item-acoes';

        // Renomear só para não-imagens
        if (anexo.tipo !== 'imagem') {
            const btnRen = document.createElement('button');
            btnRen.type = 'button';
            btnRen.className = 'anexo-acao anexo-acao-renomear';
            btnRen.title = 'Renomear anexo';
            btnRen.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"></path></svg>';
            btnRen.onclick = () => iniciarRenomeAnexo(ctx, idx);
            acoes.appendChild(btnRen);
        }

        const btnDel = document.createElement('button');
        btnDel.type = 'button';
        btnDel.className = 'anexo-acao anexo-acao-remover';
        btnDel.title = 'Remover anexo';
        btnDel.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path></svg>';
        btnDel.onclick = () => removerAnexo(ctx, idx);
        acoes.appendChild(btnDel);

        linha.appendChild(acoes);
        lista.appendChild(linha);
    });
}

// Abre a imagem guardada em /imgBlobs num visualizador sobreposto (lightbox).
// Fica na própria página, acima dos modais; clique no fundo ou Esc fecham.
// Controles do lightbox aberto — preenchidos por _abrirImagemLightbox
let _lightboxZoomIn = null, _lightboxZoomOut = null, _lightboxZoomReset = null;
let _lightboxGirarHorario = null, _lightboxGirarAnti = null;
let _lightboxMoveHandler = null, _lightboxUpHandler = null;

function _fecharImagemLightbox() {
    const box = document.getElementById('img-lightbox');
    if (!box) return;
    document.removeEventListener('keydown', _lightboxKeyHandler);
    if (_lightboxMoveHandler) window.removeEventListener('mousemove', _lightboxMoveHandler);
    if (_lightboxUpHandler) window.removeEventListener('mouseup', _lightboxUpHandler);
    _lightboxMoveHandler = _lightboxUpHandler = null;
    _lightboxZoomIn = _lightboxZoomOut = _lightboxZoomReset = null;
    _lightboxGirarHorario = _lightboxGirarAnti = null;
    box.remove();
}

function _lightboxKeyHandler(e) {
    if (e.key === 'Escape') {
        e.stopPropagation();
        _fecharImagemLightbox();
    } else if ((e.key === '+' || e.key === '=') && _lightboxZoomIn) {
        e.preventDefault(); _lightboxZoomIn();
    } else if (e.key === '-' && _lightboxZoomOut) {
        e.preventDefault(); _lightboxZoomOut();
    } else if (e.key === '0' && _lightboxZoomReset) {
        e.preventDefault(); _lightboxZoomReset();
    } else if (e.key === '.' && _lightboxGirarHorario) {
        e.preventDefault(); _lightboxGirarHorario();
    } else if (e.key === ',' && _lightboxGirarAnti) {
        e.preventDefault(); _lightboxGirarAnti();
    }
}

const _LIGHTBOX_ZOOM_MIN = 1;
const _LIGHTBOX_ZOOM_MAX = 5;
const _LIGHTBOX_ZOOM_PASSO = 0.5;
const _LIGHTBOX_ZOOM_CLIQUE = 2;   // nível ao clicar na imagem sem zoom

function _abrirImagemLightbox(dataUrl, titulo) {
    _fecharImagemLightbox();

    const box = document.createElement('div');
    box.id = 'img-lightbox';
    box.className = 'img-lightbox';
    box.innerHTML = `
        <div class="img-lightbox-barra">
            <button type="button" class="img-lightbox-btn" data-lb="out" title="Diminuir (−)" aria-label="Diminuir zoom">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path><path d="M8 11h6"></path></svg>
            </button>
            <span class="img-lightbox-nivel" data-lb="nivel">100%</span>
            <button type="button" class="img-lightbox-btn" data-lb="in" title="Aumentar (+)" aria-label="Aumentar zoom">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path><path d="M8 11h6"></path><path d="M11 8v6"></path></svg>
            </button>
            <button type="button" class="img-lightbox-btn" data-lb="anti" title="Girar à esquerda (,)" aria-label="Girar no sentido anti-horário">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5v6h6"></path><path d="M3.5 11a9 9 0 1 1 1.6 5.2"></path></svg>
            </button>
            <button type="button" class="img-lightbox-btn" data-lb="hora" title="Girar à direita (.)" aria-label="Girar no sentido horário">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 5v6h-6"></path><path d="M20.5 11a9 9 0 1 0-1.6 5.2"></path></svg>
            </button>
            <button type="button" class="img-lightbox-btn img-lightbox-close" data-lb="close" title="Fechar (Esc)" aria-label="Fechar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
            </button>
        </div>
        <figure class="img-lightbox-figura">
            <img class="img-lightbox-img" alt="${_escapeHtml(titulo || 'Anexo')}">
            ${titulo ? `<figcaption class="img-lightbox-legenda">${_escapeHtml(titulo)}</figcaption>` : ''}
        </figure>`;

    const img = box.querySelector('.img-lightbox-img');
    const nivelEl = box.querySelector('[data-lb="nivel"]');
    img.src = dataUrl;

    // Estado do zoom/deslocamento/rotação. O pan só existe com zoom > 1.
    let zoom = 1, panX = 0, panY = 0, giro = 0;
    let arrastando = false, moveu = false, iniX = 0, iniY = 0;

    const aplicar = () => {
        if (zoom <= 1) { panX = 0; panY = 0; }
        // A rotação vem depois do scale para girar a imagem já ampliada em
        // torno do próprio centro, sem arrastar o enquadramento junto.
        img.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom}) rotate(${giro}deg)`;
        nivelEl.textContent = `${Math.round(zoom * 100)}%`;
        box.classList.toggle('img-lightbox-zoomed', zoom > 1);
    };

    // Gira em passos de 90°. O deslocamento volta ao centro porque o pan antigo
    // aponta para outra região depois do giro e deixaria a imagem fora da tela.
    const girar = (graus) => {
        giro = (giro + graus) % 360;
        panX = 0; panY = 0;
        aplicar();
    };
    _lightboxGirarHorario = () => girar(90);
    _lightboxGirarAnti = () => girar(-90);

    const setZoom = (valor) => {
        zoom = Math.min(_LIGHTBOX_ZOOM_MAX, Math.max(_LIGHTBOX_ZOOM_MIN, Math.round(valor * 100) / 100));
        aplicar();
    };

    _lightboxZoomIn = () => setZoom(zoom + _LIGHTBOX_ZOOM_PASSO);
    _lightboxZoomOut = () => setZoom(zoom - _LIGHTBOX_ZOOM_PASSO);
    _lightboxZoomReset = () => setZoom(1);

    // Clique na imagem alterna aproximar/afastar; arrastar não conta como clique
    img.addEventListener('click', e => {
        e.stopPropagation();
        if (moveu) { moveu = false; return; }
        setZoom(zoom > 1 ? 1 : _LIGHTBOX_ZOOM_CLIQUE);
    });

    // Roda do mouse aproxima/afasta em cima da imagem
    box.addEventListener('wheel', e => {
        e.preventDefault();
        setZoom(zoom + (e.deltaY < 0 ? _LIGHTBOX_ZOOM_PASSO : -_LIGHTBOX_ZOOM_PASSO));
    }, { passive: false });

    // Arrastar para navegar na imagem ampliada
    img.addEventListener('mousedown', e => {
        if (zoom <= 1) return;
        e.preventDefault();
        arrastando = true; moveu = false;
        iniX = e.clientX - panX; iniY = e.clientY - panY;
    });
    window.addEventListener('mousemove', _lightboxMoveHandler = e => {
        if (!arrastando) return;
        panX = e.clientX - iniX; panY = e.clientY - iniY;
        moveu = true;
        aplicar();
    });
    window.addEventListener('mouseup', _lightboxUpHandler = () => { arrastando = false; });

    box.addEventListener('click', e => {
        const btn = e.target.closest('[data-lb]');
        if (btn) {
            e.stopPropagation();
            if (btn.dataset.lb === 'in') _lightboxZoomIn();
            else if (btn.dataset.lb === 'out') _lightboxZoomOut();
            else if (btn.dataset.lb === 'hora') _lightboxGirarHorario();
            else if (btn.dataset.lb === 'anti') _lightboxGirarAnti();
            else if (btn.dataset.lb === 'close') _fecharImagemLightbox();
            return;
        }
        // Só o clique no fundo fecha — imagem, legenda e barra não sobem até aqui
        if (e.target === box) _fecharImagemLightbox();
    });
    box.querySelector('.img-lightbox-figura').addEventListener('click', e => e.stopPropagation());

    document.body.appendChild(box);
    aplicar();
    document.addEventListener('keydown', _lightboxKeyHandler);
}

async function abrirImagemAnexo(blobId, titulo) {
    if (!blobId) return;
    try {
        const snap = await database.ref(`imgBlobs/${blobId}`).once('value');
        const val = snap.val();
        const src = val && (val.drive ? _imgDriveUrl(val.drive) : val.data);
        if (!src) {
            _uploadToast('Imagem não encontrada no banco.', 'error');
            return;
        }
        _abrirImagemLightbox(src, titulo || val.titulo || '');
    } catch (err) {
        console.error('Erro ao abrir imagem:', err);
        _uploadToast('Não foi possível carregar a imagem.', 'error');
    }
}

// ── RENOMEAR (edição inline) ────────────────────────────────
function iniciarRenomeAnexo(ctx, idx) {
    const lista = _upEl(ctx, 'anexos-list');
    if (!lista) return;
    const st = _uploadState(ctx);
    const anexo = st.anexos[idx];
    if (!anexo) return;

    const alvo = lista.querySelector(`[data-anexo-nome="${idx}"]`);
    if (!alvo) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'anexo-item-rename';
    input.value = anexo.titulo;

    let finalizado = false;

    const cancelar = () => {
        if (finalizado) return;
        finalizado = true;
        renderAnexosList(ctx);
    };

    const confirmar = async () => {
        if (finalizado) return;
        const novo = input.value.trim();
        if (!novo || novo === anexo.titulo) {
            cancelar();
            return;
        }
        finalizado = true;
        anexo.titulo = novo;
        renderAnexosList(ctx);

        // A extensão nunca muda no rename — só reanexa a que já existia.
        if (anexo.fileId && anexo.tipo !== 'link') {
            try {
                await driveRequest({
                    action: 'rename',
                    id: anexo.fileId,
                    newName: _nomeFinal(novo, anexo.fileExt)
                });
            } catch (err) {
                console.error('Erro ao renomear no Drive:', err);
                _uploadToast('O nome foi alterado aqui, mas o servidor não confirmou a renomeação.', 'warning');
            }
        }
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); confirmar(); }
        if (e.key === 'Escape') { e.preventDefault(); cancelar(); }
    });
    input.addEventListener('blur', cancelar);

    alvo.replaceWith(input);
    input.focus();
    input.select();
}

// ── REMOVER ─────────────────────────────────────────────────
async function removerAnexo(ctx, idx) {
    const st = _uploadState(ctx);
    const anexo = st.anexos[idx];
    if (!anexo) return;

    if (!window.confirm(`Remover o anexo "${anexo.titulo}"? O arquivo será apagado definitivamente.`)) return;

    try {
        await apagarArquivoDoAnexo(anexo);
        if (anexo.tipo === 'imagem' && anexo.fileId) st.blobsSessao.delete(anexo.fileId);
    } catch (err) {
        console.error('Erro ao apagar arquivo do anexo:', err);
        _uploadToast('Não foi possível apagar o arquivo no servidor. O anexo foi retirado da lista.', 'warning');
    }

    st.anexos.splice(idx, 1);
    renderAnexosList(ctx);
    atualizarBloqueioSalvar(ctx);
}

// Apaga o arquivo real: imagem → banco, arquivo → Drive, link → nada.
async function apagarArquivoDoAnexo(anexo) {
    if (!anexo) return;
    if (anexo.tipo === 'link') return;
    if (anexo.tipo === 'imagem') {
        if (anexo.fileId) await apagarImagemBlob(anexo.fileId);
        return;
    }
    if (anexo.fileId) await driveRequest({ action: 'delete', id: anexo.fileId });
}

// Apaga todos os arquivos dos anexos de um registro que está sendo excluído.
async function apagarAnexosDoRegistro(registro) {
    const lista = (registro && registro.anexos) || [];
    for (const anexo of lista) {
        try {
            await apagarArquivoDoAnexo(anexo);
        } catch (err) {
            console.error('Erro ao apagar anexo do registro:', err);
        }
    }
}

// ── CICLO DE VIDA (API pública) ─────────────────────────────
// Um anexo só é válido se tiver url, ou se for imagem com fileId.
function _anexoValido(a) {
    return !!(a && (a.url || (a.tipo === 'imagem' && a.fileId)));
}

function restoreAnexosUpload(ctx, listaAnexos) {
    const st = _uploadState(ctx);
    st.anexos = (listaAnexos || []).filter(_anexoValido).map(a => ({ ...a }));
    st.pendente = null;
    st.blobsSessao = new Set();
    renderAnexosList(ctx);
    resetUploadZone(ctx);
}

function getAnexosUpload(ctx) {
    return _uploadState(ctx).anexos.filter(_anexoValido).map(a => ({ ...a }));
}

function clearAnexosUpload(ctx) {
    const st = _uploadState(ctx);
    st.anexos = [];
    st.pendente = null;
    st.blobsSessao = new Set();
    renderAnexosList(ctx);
    resetUploadZone(ctx);
}

function resetUploadZone(ctx) {
    const st = _uploadState(ctx);
    st.pendente = null;
    st.enviando = false;

    const tituloEl = _upEl(ctx, 'upload-title');
    const linkInput = _upEl(ctx, 'link-input');
    const fileInput = _upEl(ctx, 'file-input');
    const select = _upEl(ctx, 'upload-tipo');

    if (tituloEl) tituloEl.value = '';
    if (linkInput) linkInput.value = '';
    if (fileInput) fileInput.value = '';
    if (select) select.value = 'arquivo';

    _setImgProgresso(ctx, null);
    renderUploadPreview(ctx);
    onUploadTipoChange(ctx);
    atualizarBloqueioSalvar(ctx);
}

// PREVENÇÃO DE ÓRFÃOS
// A imagem vai para o banco no "Enviar", antes de o formulário ser salvo. Ao fechar
// ou cancelar sem salvar, apaga os blobs desta sessão que não estão referenciados em
// nenhum dado já persistido. Blobs já salvos permanecem intactos.
async function discardSessionBlobs(ctx, idsPersistidos) {
    const st = _uploadState(ctx);
    if (!st.blobsSessao.size) return;

    const persistidos = new Set(idsPersistidos || []);
    const orfaos = [...st.blobsSessao].filter(id => !persistidos.has(id));
    st.blobsSessao = new Set();

    for (const id of orfaos) {
        try {
            await apagarImagemBlob(id);
        } catch (err) {
            console.error('Erro ao descartar blob órfão:', err);
        }
    }
}

// ── INICIALIZAÇÃO ───────────────────────────────────────────
// Descobre os contextos presentes no DOM — sem lista fixa no código.
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[id$="-upload-zone"]').forEach(zona => {
        const ctx = zona.id.replace(/-upload-zone$/, '');
        initUploadZone(ctx);
    });
});


// ── MIGRAÇÃO DAS IMAGENS ANTIGAS ────────────────────────────
// Imagens Base64 em /imgBlobs vão para o Drive aos poucos (15 por sessão de admin, em segundo plano).
// Nenhuma imagem é perdida: o Base64 só sai do banco depois que o arquivo existe no Drive.
// As com mais de 30 dias vão primeiro.
async function migrarImgBlobsAntigos(maximo = 15) {
    const snap = await database.ref('imgBlobs').once('value');
    if (!snap.exists()) return { movidas: 0, restantes: 0 };
    const agora = Date.now(), PRAZO = 30 * 24 * 60 * 60 * 1000;
    const venceu = v => agora - (v.ts || 0) > PRAZO;
    const antigos = Object.entries(snap.val() || {})
        .filter(([, v]) => v && typeof v.data === 'string' && v.data.startsWith('data:image/'))
        .sort((a, b) => (venceu(a[1]) === venceu(b[1]) ? (a[1].ts || 0) - (b[1].ts || 0) : (venceu(a[1]) ? -1 : 1)));
    let movidas = 0;
    for (const [id, v] of antigos.slice(0, maximo)) {
        try {
            const fileId = await _subirImagemDrive(id, v.data);
            await database.ref(`imgBlobs/${id}`).set({ drive: fileId, ts: v.ts || agora, migrado: agora });
            movidas++;
        } catch (e) { console.warn('[imgBlobs] não migrou', id, e.message); break; }
    }
    return { movidas, restantes: antigos.length - movidas };
}
fbAuth.onAuthStateChanged(u => {
    if (!u) return;
    setTimeout(() => {
        if (typeof isAdmin !== 'function' || !isAdmin()) return;
        migrarImgBlobsAntigos()
            .then(r => { if (r.movidas) console.info(`[imgBlobs] ${r.movidas} imagens movidas para o Drive, faltam ${r.restantes}.`); })
            .catch(e => console.warn('[imgBlobs] migração:', e.message));
    }, 30000);
});
