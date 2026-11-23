// ═══════════════════════════════════════════════════════════════
// secoes.js — Instrução do exame em campos por categoria: leitura do
// texto corrido (palavras-chave), cópia, migração e PDF do exame
// ═══════════════════════════════════════════════════════════════
//
// catalogo/{chave}/secoes: { jejum, orientacoes, questionario, interacoes,
//   coleta, rejeicao, conservacao, sobre, comentarios } (só os campos preenchidos)
// catalogo/{chave}/instrucao continua gravada: é o mesmo conteúdo em texto corrido, com
//   os títulos e emojis (juntarSecoes), usado na busca, na planilha e por versões antigas do L2L.
// O site L2L lê "secoes" e, se o exame ainda não foi migrado, separa "instrucao" com a
// mesma regra daqui (separarSecoes): manter as duas cópias iguais.

const SECOES = {
  jejum:        { nome: 'Jejum',                icone: 'fa-utensils',             emoji: '🍴', cor: '#e8890c', re: /^(tempo de )?jejum( obrigatorio)?$/ },
  orientacoes:  { nome: 'Orientações',          icone: 'fa-clipboard-list',       emoji: '📑', cor: '#00a8cc', re: /^(orientacao|orientacoes|preparo|instrucoes( de (preparo|coleta))?|informacoes de preparo e coleta)$/ },
  questionario: { nome: 'Questionário',         icone: 'fa-clipboard-question',   emoji: '📋', cor: '#6366f1', re: /^questionarios?$/ },
  interacoes:   { nome: 'Interações',           icone: 'fa-triangle-exclamation', emoji: '⚠\uFE0F', cor: '#d97706', re: /^((interacao|interacoes)( medicamentosas?)?|interferentes)$/ },
  coleta:       { nome: 'Coleta',               icone: 'fa-syringe',              emoji: '🏨', cor: '#16a34a', re: /^coleta( (no )?apoio)?$/ },
  rejeicao:     { nome: 'Critério de rejeição', icone: 'fa-ban',                  emoji: '🧪', cor: '#e63946', re: /^(criterios? de )?rejeicao$/ },
  conservacao:  { nome: 'Conservação',          icone: 'fa-temperature-low',      emoji: '🌡\uFE0F', cor: '#0ea5e9', re: /^(conservacao|armazenamento|estabilidade)$/ },
  sobre:        { nome: 'Sobre o exame',        icone: 'fa-magnifying-glass',     emoji: '🔎', cor: '#64748b', re: /^(sobre( o exame)?|fundamentacao teorica|interpretacao do exame)$/ },
  comentarios:  { nome: 'Comentários',          icone: 'fa-comment-dots',         emoji: '💬', cor: '#8b5cf6', re: /^(comentarios?|cometarios?)$/ }
};

const RE_EMOJI = /[\p{Extended_Pictographic}\uFE0F\u200D]/gu;
const semEmoji = t => String(t || '').replace(RE_EMOJI, '').replace(/^[ \t]+/gm, '').trim();

// Linha de título ("🍴 Jejum:", "Coleta apoio: …", "Instruções") → { k, resto } · qualquer outra → null
// O título vem sozinho na linha ou seguido de dois-pontos, com ou sem emoji na frente;
// marcador de lista (•, *, -) nunca é título.
function tituloSecao(linha) {
  const m = String(linha).trim().match(/^([^\p{L}\p{N}]*)([\p{L} ]{3,40}?)\s*(?::\s*(.*))?$/u);
  if (!m) return null;
  const emoji = /\p{Extended_Pictographic}/u.test(m[1]);
  if (m[1] && !emoji) return null;
  const t = m[2].normalize('NFD').replace(/[\u0300-\u036F]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  // formato antigo: "Jejum não necessário" numa linha só
  if (m[3] === undefined && /^jejum nao (e )?(necessario|obrigatorio)$/.test(t)) return { k: 'jejum', resto: m[2].trim() };
  const k = Object.keys(SECOES).find(s => SECOES[s].re.test(t));
  return k ? { k, resto: (m[3] || '').trim() } : null;
}

// Texto corrido → { campo: texto }. O que vem antes do primeiro título, ou um texto sem
// nenhuma palavra-chave, fica em "sobre".
function separarSecoes(texto) {
  const partes = {};
  let atual = 'sobre';
  String(texto || '').replace(/\r\n?/g, '\n').split('\n').forEach(linha => {
    const t = tituloSecao(linha);
    if (t) { atual = t.k; (partes[atual] ??= []).push('', t.resto); }
    else (partes[atual] ??= []).push(linha);
  });
  return limparSecoes(Object.fromEntries(Object.entries(partes).map(([k, ls]) => [k, ls.join('\n')])));
}

// Só os campos conhecidos e preenchidos, na ordem de SECOES
function limparSecoes(s) {
  const r = {};
  Object.keys(SECOES).forEach(k => {
    const t = String(s?.[k] ?? '').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
    if (t) r[k] = t;
  });
  return r;
}

const juntarSecoes = (s, emoji = true) => Object.keys(SECOES).filter(k => s?.[k]).map(k => `${emoji ? SECOES[k].emoji + ' ' : ''}${SECOES[k].nome}:\n${s[k]}`).join('\n\n');
// Registro do catálogo → campos (os gravados ou, sem migração, os lidos do texto)
const secoesDe = r => r?.secoes ? limparSecoes(r.secoes) : separarSecoes(r?.instrucao);
const mesmasSecoes = (a, b) => JSON.stringify(limparSecoes(a)) === JSON.stringify(limparSecoes(b));
// Texto gravado no catálogo a partir de um texto corrido: { secoes, instrucao } (null quando vazio)
function dadosInstrucao(texto) {
  const s = separarSecoes(texto);
  return { secoes: Object.keys(s).length ? s : null, instrucao: juntarSecoes(s) || null };
}

async function copiarTexto(texto, aviso = 'Copiado') {
  if (!texto) return toast('Nada para copiar', 'aviso');
  try { await navigator.clipboard.writeText(texto); }
  catch (e) {   // sem permissão ou fora de contexto seguro
    const t = Object.assign(document.createElement('textarea'), { value: texto });
    t.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(t); t.select();
    document.execCommand('copy'); t.remove();
  }
  toast(aviso);
}

// ── Campos no editor da instrução (instrucoes.js: _iEd.sec) ───
function htmlSecoesIns(editar) {
  return `<div class="field"><div class="sc-top"><label><i class="fa-solid fa-file-lines"></i>Instrução</label>
        <span class="sc-ac">${editar ? `<button type="button" class="btn sm" id="in-ext-bt" onclick="alternarTextoExtenso()"><i class="fa-solid fa-keyboard"></i>Texto por extenso</button>` : ''}
        <button type="button" class="btn sm" title="Copia todos os campos, com os emojis" onclick="copiarTexto(juntarSecoes(limparSecoes(_iEd.sec)),'Instrução copiada (com emojis)')"><i class="fa-solid fa-copy"></i>Copiar tudo</button></span></div>
      <div id="in-ext" class="sc-ext" style="display:none">
        <textarea id="in-ext-txt" class="txt-grande" style="min-height:180px" placeholder="Digite ou cole o texto completo. Os títulos são reconhecidos e cada parte vai para o seu campo:&#10;&#10;Jejum:&#10;Não necessário.&#10;&#10;Conservação:&#10;Até 7 dias refrigerado."></textarea>
        <div class="anx-ac"><button type="button" class="btn sm pri" onclick="distribuirTextoExtenso()"><i class="fa-solid fa-wand-magic-sparkles"></i>Distribuir nos campos</button>
          <button type="button" class="btn sm" onclick="alternarTextoExtenso()">Fechar</button></div>
        <span class="hint">Títulos reconhecidos: ${Object.values(SECOES).map(s => s.nome).join(', ')}. Texto sem título vai para Sobre o exame.</span>
      </div>
      <div id="in-secs" class="sc-lista"></div></div>`;
}

function desenharSecoesIns() {
  const el = document.getElementById('in-secs');
  if (!el) return;
  const ed = pode('instrucoes', 'editar');
  el.innerHTML = Object.entries(SECOES).map(([k, s]) => `<div class="sc-f" style="--c:${s.cor}">
      <div class="sc-h"><span class="sc-ic"><i class="fa-solid ${s.icone}"></i></span><b>${s.nome}</b>
        <button type="button" class="sc-cp" title="Copiar ${s.nome} (sem emojis)" onclick="copiarSecao('${k}')"><i class="fa-solid fa-copy"></i></button></div>
      <textarea id="in-s-${k}" rows="1" ${ed ? '' : 'disabled'} placeholder="${ed ? 'Sem informação' : '—'}" oninput="_iEd.sec['${k}']=this.value;ajustarAltura(this);atualizarExtrairAnexos()">${esc(_iEd.sec[k] || '')}</textarea></div>`).join('');
  el.querySelectorAll('textarea').forEach(ajustarAltura);
}
function ajustarAltura(t) { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight + 2, 420) + 'px'; }
// Título e conteúdo do campo, sem emojis
const copiarSecao = k => copiarTexto(semEmoji(_iEd.sec[k]) && `${SECOES[k].nome}:\n${semEmoji(_iEd.sec[k])}`, `${SECOES[k].nome} copiado`);

// Campo único para digitar ou colar o texto inteiro: abre com o conteúdo atual dos campos
function alternarTextoExtenso() {
  const el = document.getElementById('in-ext'), abrir = el.style.display === 'none';
  el.style.display = abrir ? '' : 'none';
  document.getElementById('in-ext-bt')?.classList.toggle('on', abrir);
  if (!abrir) return;
  const t = document.getElementById('in-ext-txt');
  t.value = juntarSecoes(limparSecoes(_iEd.sec));
  t.focus();
}
function distribuirTextoExtenso() {
  const texto = valorCampo('in-ext-txt'), s = separarSecoes(texto), ks = Object.keys(s);
  if (!ks.length) return toast('Digite o texto para distribuir', 'aviso');
  _iEd.sec = s;
  desenharSecoesIns();
  atualizarExtrairAnexos();
  alternarTextoExtenso();
  const semTitulo = ks.length === 1 && ks[0] === 'sobre' && !texto.split('\n').some(tituloSecao);
  toast(semTitulo ? 'Nenhum título reconhecido: o texto ficou em Sobre o exame' : `Texto distribuído em ${ks.length} campo(s)`, semTitulo ? 'aviso' : 'ok');
}

// ── Migração: instruções em texto único → campos ──────────────
const pendentesMigracao = () => lista(ESTADO.catalogo).filter(r => r.instrucao && !r.secoes);

async function migrarSecoes() {
  const alvo = pendentesMigracao();
  if (!alvo.length) return;
  // links escritos no texto saem para o campo Anexos antes de separar
  const plano = alvo.map(r => { const x = extrairAnexos(r.instrucao); return { r, x, s: separarSecoes(x.texto), titulo: x.texto.split('\n').some(tituloSecao) }; });
  const semTitulo = plano.filter(p => !p.titulo).length, nLinks = plano.reduce((n, p) => n + p.x.anexos.length, 0);
  const ok = await confirmar({ titulo: 'Migrar instruções para campos?', icone: 'fa-wand-magic-sparkles', botao: 'Migrar',
    texto: `<b>${num(alvo.length, 0)}</b> instrução(ões) serão separadas por título (Jejum, Orientações, Conservação…).<br>
      ${semTitulo ? `<b>${num(semTitulo, 0)}</b> sem nenhum título reconhecido ficam inteiras em <b>Sobre o exame</b>.<br>` : ''}
      ${nLinks ? `<b>${num(nLinks, 0)}</b> link(s) do texto passam para o campo Anexos.<br>` : ''}
      O conteúdo e o checklist de publicação não mudam.` });
  if (!ok) return;
  const upd = plano.map(({ r, x, s }) => {
    const u = { [`${r.id}/secoes`]: Object.keys(s).length ? s : null, [`${r.id}/instrucao`]: juntarSecoes(s) || null };
    if (x.anexos.length) u[`${r.id}/anexos`] = juntarAnexos(anexosDe(r), x.anexos);
    return u;
  });
  for (let i = 0; i < upd.length; i += 200) await DB.mesclar('catalogo', Object.assign({}, ...upd.slice(i, i + 200)));
  registrar('catalogo', `Instruções migradas para campos: ${alvo.length} (${semTitulo} sem título, ${nLinks} links em anexos)`);
  toast(`${num(alvo.length, 0)} instrução(ões) migradas`);
  if (telaAtual === 'instrucoes') renderInstrucoes();
}

// ── PDF do exame ──────────────────────────────────────────────
// Itens que podem entrar no PDF (liga/desliga na janela); as escolhas valem até recarregar
const ITENS_PDF_INS = {
  mn: { nome: 'Mnemônico', icone: 'fa-hashtag' }, material: { nome: 'Material biológico', icone: 'fa-vial' }, prazo: { nome: 'Prazo de entrega', icone: 'fa-clock' },
  ...Object.fromEntries(Object.entries(SECOES).map(([k, s]) => [k, { nome: s.nome, icone: s.icone, cor: s.cor }])),
  anexos: { nome: 'Anexos', icone: 'fa-paperclip' }
};
const ipdf = Object.fromEntries(Object.keys(ITENS_PDF_INS).map(k => [k, true]));

// Exame do PDF: null = o que está aberto no editor; id = o que está salvo no catálogo (aba da ficha)
let _pdfId = null;
// Conteúdo atual do editor (inclui o que ainda não foi salvo) ou o salvo no catálogo
function conteudoPdfInstrucao() {
  const id = _pdfId || _iEd.id, r = ESTADO.catalogo[id] || {}, dias = _pdfId ? NaN : parseInt(valorCampo('in-dias'), 10);
  const anexos = _pdfId ? anexosDe(r) : _iEd.anexos;
  return { mn: r.mn || ESTADO.exames[id]?.mn || id, nome: (_pdfId ? '' : valorCampo('in-nome').trim()) || r.nome || '', material: _pdfId ? String(r.material || '').trim() : valorCampo('in-mat').trim(),
    prazo: (isNaN(dias) ? prazoDe(r) || '' : prazoTexto(Math.max(0, dias))).replace(/\bdias\b(?!\s+[uú]teis)/i, 'dias úteis').replace(/\bdia\b(?!\s+[uú]til)/i, 'dia útil'),
    secoes: _pdfId ? secoesDe(r) : limparSecoes(_iEd.sec), anexos: anexos.filter(a => urlValida(a.url)).map(a => ({ nome: String(a.nome || '').trim() || 'Anexo', url: a.url.trim() })) };
}

function abrirPdfInstrucao(id = null) {
  _pdfId = id;
  const c = conteudoPdfInstrucao();
  const tem = k => k === 'mn' ? true : k === 'anexos' ? c.anexos.length : k in SECOES ? c.secoes[k] : c[k];
  const linha = ([k, it]) => `<div class="casc-r ${tem(k) ? '' : 'vazia'}"><div class="lft"><i class="fa-solid ${it.icone}" ${it.cor ? `style="color:${it.cor}"` : ''}></i><div>${it.nome}${tem(k) ? '' : '<div class="s">sem informação</div>'}</div></div>
    ${chave(tem(k) && ipdf[k], `ipdf['${k}']=!ipdf['${k}'];this.classList.toggle('on')`, !tem(k))}</div>`;
  const m = document.getElementById('janela') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'janela', className: 'modal' }));
  m.innerHTML = `<div class="modal-card jan" role="dialog" aria-modal="true">
      <div class="jan-h"><span class="sc-ic" style="--c:var(--red)"><i class="fa-solid fa-file-pdf"></i></span><div><h3>PDF do exame</h3><small>${esc(c.mn)} · ${esc(c.nome || 'sem nome')}</small></div>
        <button class="icon-btn" title="Fechar" onclick="fecharJanela()"><i class="fa-solid fa-xmark"></i></button></div>
      <div class="jan-b"><div class="sec-t"><i class="fa-solid fa-sliders"></i>O que entra no PDF</div>
        <div class="casc">${Object.entries(ITENS_PDF_INS).map(linha).join('')}</div>
        <div class="hint" style="margin-top:8px"><i class="fa-solid fa-circle-info"></i> Sai com a logo, o nome do exame e ${id ? 'o conteúdo salvo no catálogo' : 'o conteúdo que está na tela, mesmo antes de salvar'}.</div></div>
      <div class="modal-acoes"><button class="btn" onclick="fecharJanela()">Cancelar</button>
        <button class="btn perigo" id="ipdf-gerar" onclick="gerarPdfInstrucao()"><i class="fa-solid fa-file-pdf"></i>Gerar PDF</button></div></div>`;
  m.classList.add('open');
  m.onclick = e => { if (e.target === m) fecharJanela(); };
}
const fecharJanela = () => document.getElementById('janela')?.classList.remove('open');

// Ícone do Font Awesome como imagem (o PDF não tem a fonte dos ícones)
async function iconePdf(classe, cor = '#ffffff') {
  try {
    await document.fonts.load('900 48px "Font Awesome 6 Free"');
    const i = Object.assign(document.createElement('i'), { className: 'fa-solid ' + classe });
    i.style.cssText = 'position:absolute;visibility:hidden';
    document.body.appendChild(i);
    const g = getComputedStyle(i, '::before').content.replace(/["']/g, '');
    i.remove();
    if (!g || g === 'none') return null;
    const cv = Object.assign(document.createElement('canvas'), { width: 96, height: 96 }), cx = cv.getContext('2d');
    cx.font = '900 56px "Font Awesome 6 Free"'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillStyle = cor;
    cx.fillText(g, 48, 50);
    return cv.toDataURL('image/png');
  } catch (e) { return null; }
}

async function gerarPdfInstrucao() {
  const bt = document.getElementById('ipdf-gerar'), c = conteudoPdfInstrucao();
  const secs = Object.keys(SECOES).filter(k => ipdf[k] && c.secoes[k]);
  bt.disabled = true; bt.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>Gerando…';
  try {
    await carregarLibsPdf();
    const icones = {};
    for (const k of [...secs, 'anexos', 'material', 'prazo']) icones[k] = await iconePdf(ITENS_PDF_INS[k].icone, k in SECOES || k === 'anexos' ? '#ffffff' : '#5bb4d8');
    const doc = montarPdfInstrucao(c, secs, await logoPdf(), icones);
    doc.save(`Instrução - ${c.mn}${c.nome ? ' - ' + c.nome : ''}.pdf`.replace(/[\\/:*?"<>|]/g, '-'));
    registrar('catalogo', `PDF da instrução de ${c.mn} gerado`);
    fecharJanela();
    toast('PDF gerado');
  } catch (e) {
    console.error(e);
    toast(e.message || 'Erro ao gerar o PDF', 'erro');
  } finally {
    bt.disabled = false; bt.innerHTML = '<i class="fa-solid fa-file-pdf"></i>Gerar PDF';
  }
}

// A fonte padrão do PDF não tem emojis nem alguns símbolos
const textoPdf = t => String(t || '').replace(RE_EMOJI, '').replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/[→⇒➔➜]/g, '->').replace(/[\u2000-\u200F\u2028\u202F]/g, ' ').replace(/[“”]/g, '"').replace(/[‘’]/g, "'");

function montarPdfInstrucao(c, secs, logo, icones) {
  const { jsPDF } = window.jspdf, C = COR_PDF;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.setLineHeightFactor(1.42);
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 42, LW = W - 2 * M;
  const TOPO = 86, BASE = H - 62, hoje = new Date().toLocaleDateString('pt-BR');
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const cor = (v, tipo = 'text') => tipo === 'text' ? doc.setTextColor(...v) : tipo === 'fill' ? doc.setFillColor(...v) : doc.setDrawColor(...v);
  const fonte = (estilo = 'normal', tam = 10) => { doc.setFont('helvetica', estilo); doc.setFontSize(tam); };
  let y = 122;
  const quebra = h => { if (y + h > BASE) { doc.addPage(); y = TOPO + 10; } };

  // ── Nome do exame ──
  fonte('bold', 19); cor(C.navy);
  const nome = doc.splitTextToSize(textoPdf(c.nome) || c.mn, LW);
  doc.text(nome, M, y);
  y += (nome.length - 1) * 23 + 10;
  cor(C.azul, 'fill'); doc.rect(M, y, 46, 3, 'F');
  cor(C.cinza, 'fill'); doc.rect(M + 50, y, 14, 3, 'F');
  y += 20;

  // ── Material e prazo ──
  const caixas = [['material', 'Material biológico', c.material], ['prazo', 'Prazo de entrega', c.prazo]].filter(([k, , v]) => ipdf[k] && v);
  if (caixas.length) {
    const bw = (LW - (caixas.length - 1) * 10) / caixas.length;
    caixas.forEach(([k, rot, v], i) => {
      const x = M + i * (bw + 10);
      cor(C.fundo, 'fill'); cor(C.linha, 'draw'); doc.setLineWidth(0.6);
      doc.roundedRect(x, y, bw, 46, 5, 5, 'FD');
      if (icones[k]) doc.addImage(icones[k], 'PNG', x + 10, y + 12, 22, 22);
      fonte('bold', 7.5); cor(C.muted); doc.text(rot.toUpperCase(), x + 40, y + 18, { charSpace: 0.5 });
      fonte('bold', 11.5); cor(C.navy); doc.text(doc.splitTextToSize(textoPdf(v), bw - 52)[0], x + 40, y + 34);
    });
    y += 46 + 20;
  }

  // ── Campos da instrução ──
  const TAM = 9.8, LH = TAM * 1.42, XT = M + 30, WT = LW - 30;
  const cabecalho = (titulo, rgbCor, icone) => {
    quebra(24 + LH * 2);
    cor(rgbCor, 'fill'); doc.roundedRect(M, y, 21, 21, 5, 5, 'F');
    if (icone) doc.addImage(icone, 'PNG', M + 3.5, y + 3.5, 14, 14);
    fonte('bold', 11.5); cor(C.navy); doc.text(titulo, XT, y + 14.5);
    cor(C.linha, 'draw'); doc.setLineWidth(0.5); doc.line(XT + doc.getTextWidth(titulo) + 8, y + 10.5, W - M, y + 10.5);
    y += 21 + 13;
  };
  secs.forEach(k => {
    const s = SECOES[k], rc = rgb(s.cor);
    cabecalho(s.nome, rc, icones[k]);
    textoPdf(c.secoes[k]).split('\n').forEach(linha => {
      const t = linha.trim();
      if (!t) { y += 5; return; }
      const item = /^(?:[•\-–*]|=>|\.{1,4})\s+/.test(t), txt = item ? t.replace(/^(?:[•\-–*]|=>|\.{1,4})\s+/, '') : t;
      const sub = !item && /:$/.test(t) && t.length < 70;
      fonte(sub ? 'bold' : 'normal', TAM); cor(sub ? C.navy : C.texto);
      const x = item ? XT + 11 : XT;
      doc.splitTextToSize(txt, item ? WT - 11 : WT).forEach((l, i) => {
        quebra(LH);
        if (item && !i) { cor(rc, 'fill'); doc.circle(XT + 3, y - TAM * 0.32, 1.8, 'F'); }
        doc.text(l, x, y);
        y += LH;
      });
      y += 1.5;
    });
    y += 14;
  });

  // ── Anexos (links clicáveis) ──
  if (ipdf.anexos && c.anexos.length) {
    cabecalho('Anexos', C.navy, icones.anexos);
    c.anexos.forEach(a => {
      quebra(LH * 2 + 4);
      fonte('bold', TAM); cor(C.texto); doc.text(doc.splitTextToSize(textoPdf(a.nome), WT)[0], XT, y);
      y += LH - 1;
      fonte('normal', 8.5); cor([0, 130, 170]);
      doc.textWithLink(doc.splitTextToSize(a.url, WT)[0], XT, y, { url: a.url });
      y += LH + 3;
    });
  }
  if (!secs.length && !(ipdf.anexos && c.anexos.length)) { fonte('normal', 10); cor(C.muted); doc.text('Sem instrução cadastrada para este exame.', M, y); }

  // ── Cabeçalho e rodapé em todas as páginas ──
  const n = doc.internal.getNumberOfPages(), rodape = modeloProposta().rodape || '';
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    cor(C.navy, 'fill'); doc.rect(0, 0, W, 5, 'F');
    cor(C.azul, 'fill'); doc.rect(W * 0.62, 0, W * 0.38, 5, 'F');
    if (i === 1) {
      if (logo) { const p = doc.getImageProperties(logo), lw = 150; doc.addImage(logo, 'PNG', M - 14, 18, lw, lw * p.height / p.width, 'logo'); }
      fonte('bold', 8); cor(C.azul); doc.text('INSTRUÇÕES DO EXAME', W - M, 38, { align: 'right', charSpace: 1.2 });
      if (ipdf.mn) { fonte('bold', 15); cor(C.navy); doc.text(c.mn, W - M, 56, { align: 'right' }); }
      fonte('normal', 8.5); cor(C.muted); doc.text(`Emitido em ${hoje}`, W - M, ipdf.mn ? 70 : 54, { align: 'right' });
      cor(C.linha, 'draw'); doc.setLineWidth(0.6); doc.line(M, 86, W - M, 86);
    } else {
      if (logo) { const p = doc.getImageProperties(logo), lw = 92; doc.addImage(logo, 'PNG', M - 8, 16, lw, lw * p.height / p.width, 'logo'); }
      fonte('bold', 9); cor(C.navy); doc.text(doc.splitTextToSize(textoPdf(c.nome) || c.mn, LW - 130)[0], W - M, 38, { align: 'right' });
      fonte('normal', 8); cor(C.muted); doc.text(`${ipdf.mn ? c.mn + ' · ' : ''}continuação`, W - M, 51, { align: 'right' });
      cor(C.linha, 'draw'); doc.setLineWidth(0.6); doc.line(M, 66, W - M, 66);
    }
    cor(C.azul, 'draw'); doc.setLineWidth(1); doc.line(M, H - 46, M + 40, H - 46);
    cor(C.linha, 'draw'); doc.setLineWidth(0.5); doc.line(M + 44, H - 46, W - M, H - 46);
    fonte('normal', 7.8); cor(C.muted);
    doc.text(doc.splitTextToSize(rodape, LW - 90)[0] || '', M, H - 32);
    doc.text(`Instruções do exame · emitido em ${hoje}`, M, H - 21);
    fonte('bold', 8); cor(C.navy); doc.text(`Página ${i} de ${n}`, W - M, H - 32, { align: 'right' });
  }
  return doc;
}
