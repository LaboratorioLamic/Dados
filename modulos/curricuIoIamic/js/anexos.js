// ===== Sistema de anexos: Arquivo (Google Drive) | Imagem (Google Drive, WebP) | Link =====
// Contrato do Apps Script (rh.js): POST {action:'upload', filename, data:<dataURL>, idToken} → {success, fileId, url}
//                                  POST {action:'delete'|'rename', id, newName?, idToken}
// Sem listagem pública (o GET ?action=list antigo expunha todos os arquivos do RH).
// Imagem de anexo: arquivo no Drive + ponteiro leve em rh_imagens/{key} = { drive, criadoEm }.
// Foto de funcionário continua no banco (256px, pequena e privada).

const ANEXO_MAX_MB = 15; // limite do Apps Script/navegador — acima disso, orientar uso de Link

// SVG (traço Feather) por formato — usado no chip do anexo
const ANEXO_SVG = {
    doc:   '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
    lines: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>',
    grid:  '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="16" x2="16" y2="16"/><line x1="12" y1="11" x2="12" y2="18"/>',
    play:  '<rect x="2" y="4" width="20" height="16" rx="2"/><polygon points="10 9 15 12 10 15 10 9"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
    link:  '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    file:  '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'
};

// Formatos identificados por extensão → ícone colorido próprio
const ANEXO_FORMATOS = {
    pdf:    { label: 'PDF',     cor: '#e34948', svg: 'doc',   ext: ['pdf'] },
    word:   { label: 'Word',    cor: '#2a78d6', svg: 'lines', ext: ['doc', 'docx', 'odt', 'rtf'] },
    excel:  { label: 'Excel',   cor: '#008300', svg: 'grid',  ext: ['xls', 'xlsx', 'csv', 'ods'] },
    txt:    { label: 'Texto',   cor: '#8a90a3', svg: 'lines', ext: ['txt', 'md', 'log'] },
    video:  { label: 'Vídeo',   cor: '#4a3aa7', svg: 'play',  ext: ['mp4', 'avi', 'mov', 'mkv', 'webm', 'wmv'] },
    imagem: { label: 'Imagem',  cor: '#eda100', svg: 'image', ext: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] },
    link:   { label: 'Link',    cor: '#0284c7', svg: 'link',  ext: [] },
    outro:  { label: 'Arquivo', cor: '#6b7280', svg: 'file',  ext: [] }
};

function detectaFormato(nomeArquivo) {
    const ext = (nomeArquivo || '').split('.').pop().toLowerCase();
    for (const [k, v] of Object.entries(ANEXO_FORMATOS)) if (v.ext.includes(ext)) return k;
    return 'outro';
}

// Ícone colorido do formato (chip quadrado com SVG do tipo)
function anexoIcone(formato, size = 34) {
    const f = ANEXO_FORMATOS[formato] || ANEXO_FORMATOS.outro;
    const isz = Math.round(size * 0.52);
    return `<span class="anexo-ico" style="width:${size}px;height:${size}px;background:${f.cor}1a;color:${f.cor};border:1px solid ${f.cor}40">
        <svg viewBox="0 0 24 24" style="width:${isz}px;height:${isz}px" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ANEXO_SVG[f.svg] || ANEXO_SVG.file}</svg>
    </span>`;
}

// ---- Upload de arquivo → Google Drive ----
function lerComoDataURL(file) {
    return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = e => res(e.target.result);
        r.onerror = rej;
        r.readAsDataURL(file);
    });
}

const _uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// Pedido ao Apps Script com o ID token da sessão do Dados LAMIC (o script recusa sem ele).
// POST sem Content-Type: o Apps Script não responde ao preflight CORS.
async function driveReq(payload) {
    const idToken = fbAuth.currentUser ? await fbAuth.currentUser.getIdToken() : null;
    if (!idToken) throw new Error('Sessão do Dados LAMIC ausente. Recarregue a página.');
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 120000);
    let texto;
    try {
        const r = await fetch(DRIVE_API, { method: 'POST', body: JSON.stringify({ ...payload, idToken }), signal: ctl.signal });
        texto = await r.text();
    } catch (e) {
        throw e.name === 'AbortError' ? new Error('O envio demorou demais e foi cancelado.') : e;
    } finally { clearTimeout(t); }
    let resp;
    try { resp = JSON.parse(texto); } catch {
        const i = texto.indexOf('{'), f = texto.lastIndexOf('}');
        try { resp = (i !== -1 && f > i) ? JSON.parse(texto.slice(i, f + 1)) : null; } catch { resp = null; }
    }
    if (!resp || typeof resp !== 'object') throw new Error('Resposta inesperada do servidor. Implante a versão nova do Apps Script (rh.js).');
    if (resp.success === false || resp.error) throw new Error(resp.error || 'O servidor recusou o pedido.');
    return resp;
}

const _imgDriveUrl = (id, w = 1600) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${w}`;
const _ehImagemReduzivel = d => /^data:image\/(jpeg|png|webp|bmp|tiff)/i.test(d || '');

async function uploadArquivoDrive(file, titulo) {
    let ext = (file.name.split('.').pop() || '').toLowerCase();
    let data = await lerComoDataURL(file);
    // Foto/imagem enviada como arquivo também vai reduzida em WebP (GIF fica como está)
    if (_ehImagemReduzivel(data)) {
        try { data = await reduzirDataUrl(data); ext = data.startsWith('data:image/webp') ? 'webp' : 'jpg'; } catch { /* original */ }
    }
    const r = await driveReq({ action: 'upload', filename: `${titulo}.${ext}`, data });
    const driveId = r.fileId || r.id;
    if (!driveId) throw new Error('O Drive não devolveu o arquivo enviado.');
    return { driveId, url: r.url || `https://drive.google.com/file/d/${driveId}/view`, nomeArquivo: file.name };
}

async function excluirArquivoDrive(driveId) {
    if (!driveId) return;
    try { await driveReq({ action: 'delete', id: driveId }); }
    catch (e) { console.warn('Falha ao excluir do Drive:', e); }
}

// Reduz para no máximo 1600px em WebP (JPEG se o navegador não gerar WebP)
async function reduzirDataUrl(dataURL, maxDim = 1600, q = 0.82) {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataURL; });
    const escala = Math.min(1, maxDim / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * escala);
    canvas.height = Math.round(img.height * escala);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const webp = canvas.toDataURL('image/webp', q);
    return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', q);
}

// ---- Imagem de anexo: reduz (WebP) para a prévia e o envio ao Drive ----
async function comprimirImagem(file) {
    const dataURL = await lerComoDataURL(file);
    if (/^data:image\/gif/i.test(dataURL)) return dataURL;
    return reduzirDataUrl(dataURL);
}

// Envia a imagem do anexo ao Drive e grava só o ponteiro em rh_imagens. Devolve a chave.
async function salvarImagemAnexo(dataURL) {
    const ref = db.ref(PATHS.imagens).push();
    const ext = dataURL.startsWith('data:image/webp') ? 'webp' : dataURL.startsWith('data:image/gif') ? 'gif' : 'jpg';
    const r = await driveReq({ action: 'upload', filename: `rh_img_${ref.key}.${ext}`, data: dataURL });
    const driveId = r.fileId || r.id;
    if (!driveId) throw new Error('O Drive não devolveu a imagem enviada.');
    await ref.set({ drive: driveId, criadoEm: hoje() });
    return ref.key;
}

async function salvarImagemDB(dataURL) {
    const ref = db.ref(PATHS.imagens).push();
    await ref.set({ data: dataURL, criadoEm: hoje() });
    return ref.key;
}

// Cache em memória: cada imagem é buscada UMA vez por sessão, e só ao abrir
const IMG_CACHE = {};
async function obterImagem(imgKey) {
    if (IMG_CACHE[imgKey]) return IMG_CACHE[imgKey];
    const obj = await DB.getObj(`${PATHS.imagens}/${imgKey}`);
    const src = obj?.drive ? _imgDriveUrl(obj.drive) : obj?.data;
    if (!src) throw new Error('Imagem não encontrada.');
    IMG_CACHE[imgKey] = src;
    return src;
}

// ---- Foto de funcionário: mesmo nó rh_imagens, mas com cache PERSISTENTE (localStorage) ----
// Anexo comum só cacheia em memória (IMG_CACHE) porque é aberto sob demanda, uma vez. A foto
// aparece toda vez que o card/ficha é desenhado — sem cache em disco, ela seria rebaixada do
// banco a cada carregamento da página de Funcionários, o que é exatamente o custo que se quer evitar.
const FOTO_CACHE_PREFIX = 'rh_foto_';
const fotoCacheGet = k => { try { return localStorage.getItem(FOTO_CACHE_PREFIX + k); } catch { return null; } };
// Quota do localStorage é pequena (~5-10MB) — se estourar, a foto some do cache de disco mas
// continua funcionando via IMG_CACHE (memória) pelo resto da sessão. Falha silenciosa por design.
const fotoCacheSet = (k, data) => { try { localStorage.setItem(FOTO_CACHE_PREFIX + k, data); } catch {} };
const fotoCacheRemove = k => { try { localStorage.removeItem(FOTO_CACHE_PREFIX + k); } catch {} };

async function obterFoto(fotoKey) {
    if (!fotoKey) return null;
    if (IMG_CACHE[fotoKey]) return IMG_CACHE[fotoKey];
    const local = fotoCacheGet(fotoKey);
    if (local) { IMG_CACHE[fotoKey] = local; return local; }
    const obj = await DB.getObj(`${PATHS.imagens}/${fotoKey}`);
    if (!obj?.data) return null;
    IMG_CACHE[fotoKey] = obj.data;
    fotoCacheSet(fotoKey, obj.data);
    return obj.data;
}

// Recorta ao quadrado central (cover) e reduz a no máximo 256x256 — tamanho fixo pequeno o
// bastante para não pesar no banco, já que cada funcionário carrega a própria foto sempre
// que o card dele aparece na grade.
async function comprimirFoto(file) {
    const dataURL = await lerComoDataURL(file);
    const img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = dataURL;
    });
    const SIZE = 256;
    const lado = Math.min(img.width, img.height);
    const sx = (img.width - lado) / 2, sy = (img.height - lado) / 2;
    const canvas = document.createElement('canvas');
    canvas.width = SIZE; canvas.height = SIZE;
    canvas.getContext('2d').drawImage(img, sx, sy, lado, lado, 0, 0, SIZE, SIZE);
    const tipo = canvas.toDataURL('image/webp', 0.85).startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg';
    let q = 0.85, out = canvas.toDataURL(tipo, q);
    while (out.length > 100 * 1024 && q > 0.3) { q -= 0.1; out = canvas.toDataURL(tipo, q); }
    return out;
}

// Grava a foto (já comprimida) em rh_imagens e popula os dois caches na hora — evita um
// round-trip ao banco só para reexibir a foto que acabou de ser enviada. Se havia uma foto
// anterior, remove-a (senão o registro antigo fica orfão em rh_imagens para sempre).
async function salvarFotoDB(dataURL, fotoKeyAntiga) {
    const key = await salvarImagemDB(dataURL);
    IMG_CACHE[key] = dataURL;
    fotoCacheSet(key, dataURL);
    if (fotoKeyAntiga) await excluirFotoRemota(fotoKeyAntiga);
    return key;
}

async function excluirFotoRemota(fotoKey) {
    if (!fotoKey) return;
    await db.ref(`${PATHS.imagens}/${fotoKey}`).remove();
    delete IMG_CACHE[fotoKey];
    fotoCacheRemove(fotoKey);
}

// ---- Avatar com foto: iniciais na hora (síncrono), trocado pela foto quando ela chega ----
// (do cache de disco, quase instantâneo, ou do banco, no primeiro carregamento de sempre)
// `clicavel`: abre a foto ampliada (256px) num modal — usado na janela de detalhe, não nos
// cards da grade nem na prévia do formulário, onde o clique já tem outro efeito.
function avatarHtml(f, cls = '', clicavel = false) {
    const abre = clicavel && f.fotoKey;
    return `<div class="avatar ${cls}${abre ? ' is-clicavel' : ''}"${f.fotoKey ? ` data-foto-key="${f.fotoKey}"` : ''}${abre ? ` data-foto-open data-foto-nome="${escapeHtml(f.nome || '')}"` : ''}>${iniciais(f.nome)}</div>`;
}
function bindAvatarFotos(container) {
    container.querySelectorAll('[data-foto-key]').forEach(el => {
        obterFoto(el.dataset.fotoKey)
            .then(data => { if (data) el.innerHTML = `<img src="${data}" alt="">`; })
            .catch(() => {});
    });
    container.querySelectorAll('[data-foto-open]').forEach(el => {
        el.onclick = () => abrirFotoAmpliada(el, el.dataset.fotoKey, el.dataset.fotoNome);
    });
}

// ---- Foto ampliada: cresce a partir do mesmo canto da foto pequena, ficando por cima dela
// — fundo escurecido por trás. Fecha ao clicar em qualquer lugar ou Esc.
function abrirFotoAmpliada(anchorEl, fotoKey, nome) {
    document.querySelectorAll('.foto-lightbox').forEach(x => x.remove());
    const SIZE = 256, MARGEM = 16;
    const rect = anchorEl.getBoundingClientRect();
    // Ancora no canto superior-esquerdo da foto pequena; encolhe de volta pra dentro da tela
    // se ela estiver perto da borda, pra não vazar pra fora do viewport.
    const left = Math.min(rect.left, window.innerWidth - SIZE - MARGEM);
    const top = Math.min(rect.top, window.innerHeight - SIZE - MARGEM);

    const box = document.createElement('div');
    box.className = 'foto-lightbox';
    box.innerHTML = `<img alt="${escapeHtml(nome || '')}" hidden style="left:${left}px;top:${top}px">`;
    const fechar = () => { box.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') fechar(); };
    box.onclick = fechar;
    document.addEventListener('keydown', onKey);
    document.body.appendChild(box);
    obterFoto(fotoKey).then(data => {
        if (!data) return fechar();
        const img = box.querySelector('img');
        img.src = data;
        img.hidden = false;
    }).catch(fechar);
}

// ---- Abrir anexo (imagem: viewer com lazy load; demais: nova aba) ----
async function abrirAnexo(anexo) {
    if (!anexo) return;
    if (anexo.tipo === 'imagem') {
        try {
            const data = await obterImagem(anexo.imgKey);
            if (!data) return toast('Imagem não encontrada.', 'error');
            abrirVisualizadorImagem({ src: data, titulo: anexo.titulo || 'Imagem', legenda: anexo.titulo || '' });
        } catch (e) {
            toast(`Erro ao carregar a imagem: ${e.message}`, 'error');
        }
        return;
    }
    if (anexo.url) window.open(anexo.url, '_blank');
    else toast('Anexo sem URL disponível.', 'error');
}

// Exclui o conteúdo remoto de um ou mais anexos (Drive ou imagem no banco)
async function excluirAnexoRemoto(anexos) {
    const lista = Array.isArray(anexos) ? anexos : (anexos ? [anexos] : []);
    for (const anexo of lista) {
        if (!anexo) continue;
        if (anexo.tipo === 'arquivo') await excluirArquivoDrive(anexo.driveId);
        if (anexo.tipo === 'imagem' && anexo.imgKey) {
            try {
                const d = await DB.getObj(`${PATHS.imagens}/${anexo.imgKey}`);
                if (d?.drive) await excluirArquivoDrive(d.drive);
            } catch { /* segue apagando o ponteiro */ }
            await db.ref(`${PATHS.imagens}/${anexo.imgKey}`).remove();
            delete IMG_CACHE[anexo.imgKey];
        }
    }
}

// Normaliza o campo persistido: aceita o formato antigo (anexo único, objeto) e o novo
// (anexos, array), sempre retornando um array — o resto do sistema só lida com array.
const anexosDe = registro => registro?.anexos || (registro?.anexo ? [registro.anexo] : []);

// Balão da coluna de tabela: mostra só a QUANTIDADE de anexos, não nome/ícone por item —
// listas com múltiplos anexos ficariam largas demais linha a linha.
function anexoChip(anexos) {
    const lista = Array.isArray(anexos) ? anexos : (anexos ? [anexos] : []);
    if (!lista.length) return '';
    return `<span class="anexo-balao" data-anexo-open title="${lista.length} anexo${lista.length > 1 ? 's' : ''}">
        ${icon('paperclip')}<span>${lista.length}</span>
    </span>`;
}

function bindAnexoChips(container, resolver) {
    container.querySelectorAll('[data-anexo-open]').forEach(el => {
        el.addEventListener('click', e => {
            e.stopPropagation();
            const anexos = resolver(el);
            if (anexos && anexos.length) abrirGaleriaAnexos(anexos);
        });
    });
}

// ---- Janela de visualização: ícones grandes com o título abaixo de cada um ----
function abrirGaleriaAnexos(anexos) {
    const lista = Array.isArray(anexos) ? anexos : [anexos];
    if (!lista.length) return;
    const m = openModal({
        title: lista.length > 1 ? `Anexos (${lista.length})` : 'Anexo',
        size: 'modal-lg',
        body: `<div class="anexo-galeria">
            ${lista.map((a, i) => `
                <button type="button" class="anexo-galeria-item" data-anexo-idx="${i}" title="${escapeHtml(a.titulo || '')}">
                    ${anexoIcone(a.formato, 72)}
                    <span>${escapeHtml(a.titulo || '')}</span>
                </button>`).join('')}
        </div>`,
        footer: null
    });
    m.body.querySelectorAll('[data-anexo-idx]').forEach(btn => {
        btn.onclick = () => abrirAnexo(lista[Number(btn.dataset.anexoIdx)]);
    });
}

// ---- Campo de anexo para formulários (os 3 tipos, com título) ----
// initAnexoField(slotEl, anexosExistentes) → controller.getAnexos() executa os uploads pendentes
// no salvar e retorna a lista final. Aceita vários anexos: cada um vira um item na lista, com
// opção de continuar adicionando mais antes de salvar. Aceita tanto array quanto o anexo único
// antigo (objeto), para compatibilidade com registros já gravados.
function initAnexoField(slot, existentes) {
    const iniciais = Array.isArray(existentes) ? existentes : (existentes ? [existentes] : []);
    const st = { lista: iniciais.slice(), removidos: [], tipo: '', file: null, imgPreview: null };

    // Cartões-botão de tipo (substituem o select nativo)
    const TIPOS = [
        { id: 'arquivo', label: 'Arquivo', hint: 'Word, PDF, Excel, vídeo…', svg: ANEXO_SVG.file },
        { id: 'imagem',  label: 'Imagem',  hint: 'Comprimida no banco',      svg: ANEXO_SVG.image },
        { id: 'link',    label: 'Link',    hint: 'URL externa (YouTube…)',   svg: ANEXO_SVG.link }
    ];
    const tipoCards = () => `
        <div class="ax-types">${TIPOS.map(t => `
            <button type="button" class="ax-type${st.tipo === t.id ? ' active' : ''}" data-ax-type="${t.id}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${t.svg}</svg>
                <strong>${t.label}</strong>
                <span>${t.hint}</span>
            </button>`).join('')}</div>`;

    const listaExistentesHtml = () => st.lista.length ? `
        <div class="ax-existing-list">
            ${st.lista.map((a, i) => `
                <div class="ax-existing" data-ax-existing="${i}">
                    ${anexoIcone(a.formato, 40)}
                    <div class="grow">
                        <strong>${escapeHtml(a.titulo || '')}</strong>
                        <div class="muted">${ANEXO_FORMATOS[a.formato]?.label || ''} anexado</div>
                    </div>
                    <button type="button" class="btn btn-secondary btn-sm" data-ax-ver="${i}">Abrir</button>
                    <button type="button" class="btn-icon danger" data-ax-rem="${i}" title="Remover">${icon('trash')}</button>
                </div>`).join('')}
        </div>` : '';

    const render = () => {
        slot.innerHTML = `
            <div class="anexo-field">
                ${listaExistentesHtml()}
                ${tipoCards()}
                <div class="field ${st.tipo ? '' : 'hidden'}" data-ax-titulo-wrap style="margin:12px 0 0">
                    <label>Título do anexo <span class="req">*</span></label>
                    <input class="input" data-ax-titulo placeholder="Ex: Certificado assinado">
                </div>
                <div data-ax-corpo></div>
                ${st.tipo ? `<button type="button" class="btn btn-secondary btn-sm" data-ax-add style="margin-top:12px">${icon('plus')} Adicionar anexo</button>` : ''}
            </div>`;

        slot.querySelectorAll('[data-ax-ver]').forEach(b => b.onclick = () => abrirAnexo(st.lista[Number(b.dataset.axVer)]));
        slot.querySelectorAll('[data-ax-rem]').forEach(b => b.onclick = () => {
            const i = Number(b.dataset.axRem);
            const [removido] = st.lista.splice(i, 1);
            if (removido) st.removidos.push(removido);
            render();
        });

        const cards = slot.querySelectorAll('[data-ax-type]');
        const tituloAtual = () => (slot.querySelector('[data-ax-titulo]')?.value || '');
        cards.forEach(c => c.onclick = () => {
            const t = c.dataset.axType;
            const prevTitulo = tituloAtual();
            st.tipo = st.tipo === t ? '' : t;      // clicar de novo desmarca
            st.file = null; st.imgPreview = null;
            render();
            const ti = slot.querySelector('[data-ax-titulo]');
            if (ti) { ti.value = prevTitulo; if (st.tipo) ti.focus(); }
        });

        const btnAdd = slot.querySelector('[data-ax-add]');
        if (btnAdd) btnAdd.onclick = async () => {
            try {
                const anexo = await montaAnexoPendente();
                st.lista.push(anexo);
                st.tipo = ''; st.file = null; st.imgPreview = null;
                render();
            } catch (e) {
                toast(e.message || 'Erro ao anexar.', 'error');
            }
        };

        const corpo = slot.querySelector('[data-ax-corpo]');
        if (!corpo) return;

        // Dropzone reutilizável: input file oculto + área clicável/arrastável
        const dropzone = (accept, hintHtml) => `
            <div class="field" style="margin-top:12px"><label>${st.tipo === 'imagem' ? 'Imagem' : 'Arquivo'} <span class="req">*</span></label>
                <div class="ax-drop" data-ax-drop tabindex="0" role="button">
                    <input data-ax-file type="file" accept="${accept}" hidden>
                    <div class="ax-drop-inner">
                        <svg class="ax-drop-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        <div class="ax-drop-txt"><strong>Clique ou arraste</strong> o ${st.tipo === 'imagem' ? 'imagem' : 'arquivo'} aqui</div>
                    </div>
                    <div class="ax-drop-preview" data-ax-preview hidden></div>
                </div>
                <div class="field-hint" data-ax-info>${hintHtml}</div>
            </div>`;

        const bindDrop = onFile => {
            const dz = corpo.querySelector('[data-ax-drop]');
            const inp = corpo.querySelector('[data-ax-file]');
            const pick = () => inp.click();
            dz.onclick = pick;
            dz.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } };
            dz.ondragover = e => { e.preventDefault(); dz.classList.add('dragging'); };
            dz.ondragleave = () => dz.classList.remove('dragging');
            dz.ondrop = e => {
                e.preventDefault(); dz.classList.remove('dragging');
                if (e.dataTransfer.files[0]) { inp.files = e.dataTransfer.files; onFile(e.dataTransfer.files[0]); }
            };
            inp.onchange = e => e.target.files[0] && onFile(e.target.files[0]);
        };

        if (st.tipo === 'arquivo') {
            corpo.innerHTML = dropzone('.pdf,.doc,.docx,.odt,.rtf,.xls,.xlsx,.csv,.ods,.txt,.md,.mp4,.avi,.mov,.mkv,.webm',
                `Máx. ${ANEXO_MAX_MB}MB — para vídeos grandes, use o tipo <strong>Link</strong>. Enviado ao Google Drive ao salvar.`);
            bindDrop(f => {
                if (f.size > ANEXO_MAX_MB * 1024 * 1024) {
                    toast(`Arquivo acima de ${ANEXO_MAX_MB}MB. Use o tipo Link.`, 'error');
                    st.file = null; return;
                }
                st.file = f;
                const fmt = ANEXO_FORMATOS[detectaFormato(f.name)];
                const prev = corpo.querySelector('[data-ax-preview]');
                prev.hidden = false;
                prev.innerHTML = `${anexoIcone(detectaFormato(f.name), 36)}<div class="grow"><strong>${escapeHtml(f.name)}</strong><div class="muted">${(f.size / 1024 / 1024).toFixed(1)}MB · ${fmt.label}</div></div>`;
                corpo.querySelector('[data-ax-drop]').classList.add('has-file');
            });
        } else if (st.tipo === 'imagem') {
            corpo.innerHTML = dropzone('image/*',
                'Comprimida automaticamente (máx. 1280px, JPEG) e gravada no banco — carregada só ao abrir.');
            bindDrop(async f => {
                st.file = f; st.imgPreview = null;
                const info = corpo.querySelector('[data-ax-info]');
                const prev = corpo.querySelector('[data-ax-preview]');
                info.textContent = 'Comprimindo...';
                try {
                    st.imgPreview = await comprimirImagem(f);
                    info.textContent = `Pronta: ${(st.imgPreview.length / 1024).toFixed(0)}KB após compressão (original ${(f.size / 1024).toFixed(0)}KB)`;
                    prev.hidden = false;
                    prev.innerHTML = `<img src="${st.imgPreview}" alt="Prévia">`;
                    corpo.querySelector('[data-ax-drop]').classList.add('has-file');
                } catch (err) {
                    info.textContent = 'Erro ao processar a imagem.';
                    st.file = null;
                }
            });
        } else if (st.tipo === 'link') {
            corpo.innerHTML = `
                <div class="field" style="margin-top:12px"><label>URL <span class="req">*</span></label>
                    <input class="input" data-ax-url type="url" placeholder="https://...">
                </div>`;
        } else corpo.innerHTML = '';
    };

    // Executa o upload do rascunho em edição e retorna o anexo pronto (sem mexer em st.lista)
    async function montaAnexoPendente() {
        if (!st.tipo) throw new Error('Escolha um tipo de anexo.');
        const titulo = (slot.querySelector('[data-ax-titulo]')?.value || '').trim();
        if (!titulo) throw new Error('Informe o título do anexo.');
        const base = { id: _uid(), titulo, criadoEm: hoje() };

        if (st.tipo === 'link') {
            const url = (slot.querySelector('[data-ax-url]')?.value || '').trim();
            if (!url) throw new Error('Informe a URL do link.');
            return { ...base, tipo: 'link', formato: 'link', url };
        }
        if (st.tipo === 'imagem') {
            if (!st.imgPreview) throw new Error('Selecione uma imagem.');
            const imgKey = await salvarImagemAnexo(st.imgPreview);
            IMG_CACHE[imgKey] = st.imgPreview;
            return { ...base, tipo: 'imagem', formato: 'imagem', imgKey };
        }
        // arquivo → Google Drive
        if (!st.file) throw new Error('Selecione um arquivo.');
        const up = await uploadArquivoDrive(st.file, titulo);
        return { ...base, tipo: 'arquivo', formato: detectaFormato(st.file.name), ...up };
    }

    render();

    return {
        // Executa o upload do rascunho pendente (se houver) e retorna {anexos, removidos}.
        // `removidos` são os anexos remotos que precisam ser excluídos (Drive/imagem) após salvar.
        //
        // O rascunho é ABSORVIDO pela lista assim que o upload conclui: se o salvar falhar
        // depois disso (rede, permissão, validação de outro campo), a segunda tentativa
        // reaproveita o arquivo já enviado em vez de subir uma cópia órfã ao Drive.
        async getAnexos() {
            if (st.tipo) {
                const anexo = await montaAnexoPendente();
                st.lista.push(anexo);
                st.tipo = ''; st.file = null; st.imgPreview = null;
                render();
            }
            return { anexos: st.lista.slice(), removidos: st.removidos };
        },
        // Síncrono, sem disparar upload: há algo que se perderia ao fechar sem salvar? Um
        // anexo já anexado, um tipo escolhido (rascunho em andamento) ou uma remoção pendente.
        isDirty: () => st.lista.length > 0 || !!st.tipo || st.removidos.length > 0,
        // Retrato do estado para quem precisa desenhar um resumo do campo em outro lugar
        // (ex.: a célula "Documento" de uma linha de tabela, com o campo morando fora dela).
        resumo: () => ({
            n: st.lista.length,
            rascunho: !!st.tipo,
            titulo: st.lista[0]?.titulo || '',
            formato: st.lista[0]?.formato || 'outro'
        })
    };
}


// ---- Migração: imagens de anexo antigas (Base64 em rh_imagens) → Drive, poucas por sessão ----
// Fotos de funcionário (≤100KB, sempre exibidas) ficam no banco: só migra Base64 acima de 120KB,
// que são imagens de anexo. O Base64 só sai do banco depois que o arquivo existe no Drive.
async function migrarImagensAntigasRH(maximo = 15) {
    const snap = await db.ref(PATHS.imagens).once('value');
    if (!snap.exists()) return { movidas: 0, restantes: 0 };
    const antigos = Object.entries(snap.val() || {})
        .filter(([, v]) => v && typeof v.data === 'string' && v.data.startsWith('data:image/') && v.data.length > 120 * 1024);
    let movidas = 0;
    for (const [key, v] of antigos.slice(0, maximo)) {
        try {
            const ext = v.data.startsWith('data:image/webp') ? 'webp' : v.data.startsWith('data:image/png') ? 'png' : 'jpg';
            const r = await driveReq({ action: 'upload', filename: `rh_img_${key}.${ext}`, data: v.data });
            const driveId = r.fileId || r.id;
            if (!driveId) throw new Error('sem id');
            await db.ref(`${PATHS.imagens}/${key}`).set({ drive: driveId, criadoEm: v.criadoEm || hoje(), migrado: Date.now() });
            delete IMG_CACHE[key];
            movidas++;
        } catch (e) { console.warn('[rh_imagens] não migrou', key, e.message); break; }
    }
    return { movidas, restantes: antigos.length - movidas };
}
fbAuth.onAuthStateChanged(u => {
    if (!u) return;
    setTimeout(() => migrarImagensAntigasRH()
        .then(r => { if (r.movidas) console.info(`[rh_imagens] ${r.movidas} imagens movidas para o Drive, faltam ${r.restantes}.`); })
        .catch(() => { /* sem acesso ao RH ou Apps Script antigo: tenta na próxima sessão */ }), 30000);
});
