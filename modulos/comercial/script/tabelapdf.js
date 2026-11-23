// ═══════════════════════════════════════════════════════════════
// tabelapdf.js — PDF de uma tabela de preço (balcão, convênios e
// laboratórios apoiados e conveniados)
// ═══════════════════════════════════════════════════════════════
//
// Mesmo visual do PDF da proposta (propostapdf.js): logo, cabeçalho e rodapé com
// paginação. Sai só o preço publicado: custo, margem e rascunho nunca entram.

const tpdf = { alvo: null, titulo: '', obs: '', setor: true, material: true, prazo: true, filtrada: false, base: false };

// Exames com preço publicado no alvo (ou só os filtrados na grade). Em laboratório apoiado,
// "Incluir tabela base" completa com a tabela de referência; o preço diferenciado tem prioridade.
function itensPdfTabela() {
  const cx = ctxAlvo(tpdf.alvo);
  const ks = tpdf.filtrada && grade.alvo === tpdf.alvo && grade.linhas ? grade.linhas.map(x => x.k)
    : examesVisiveis().filter(e => e.ativo !== false).map(e => e.id);
  const base = tpdf.base && cx.lab && cx.ref ? cx.ref.valor : () => null;
  return ks.map(k => ({ k, e: ESTADO.exames[k], preco: cx.salvo(k) > 0 ? cx.salvo(k) : base(k) })).filter(x => x.e && x.preco > 0);
}

function abrirPdfTabela(alvo) {
  const cx = ctxAlvo(alvo);
  if (tpdf.alvo !== alvo) Object.assign(tpdf, { alvo, titulo: cx.lab ? `Tabela de preços · ${cx.nome}` : `Tabela ${cx.nome}`, obs: '', filtrada: false, base: false });
  if (!itensPdfTabela().length) {
    tpdf.filtrada = false;
    if (!itensPdfTabela().length && cx.lab && cx.ref) tpdf.base = true;
    if (!itensPdfTabela().length) return toast('Tabela sem preços publicados', 'erro');
  }
  garantirCatalogo();
  const sw = (k, t, d, ic) => `<div class="casc-r"><div class="lft"><i class="fa-solid ${ic}"></i><div>${t}<div class="s">${d}</div></div></div>${chave(tpdf[k], `tpdf.${k}=!tpdf.${k};this.classList.toggle('on');contarPdfTabela()`)}</div>`;
  const pend = Object.keys(rasc(alvo)).length;
  abrirGaveta({
    sobre: 'Gerar PDF', titulo: cx.nome,
    meta: '<span class="tag" id="tpdf-n"></span>',
    corpo: `<div class="form-col">
      ${campo('tpdf-tit', 'Título', tpdf.titulo, { tipo: 'text', aoMudar: 'tpdf.titulo=this.value' })}
      <div class="just" style="margin:0"><label for="tpdf-obs">Observação (opcional)</label>
        <textarea id="tpdf-obs" rows="3" placeholder="Ex.: valores válidos para pagamento à vista" oninput="tpdf.obs=this.value">${esc(tpdf.obs)}</textarea></div>
      <div class="sec-t"><i class="fa-solid fa-sliders"></i>Conteúdo</div>
      <div class="casc">
        ${sw('setor', 'Agrupar por setor', 'exames separados por setor; apoio sai como "Diversos"', 'fa-layer-group')}
        ${sw('material', 'Coluna de material', 'material biológico do catálogo', 'fa-vial')}
        ${sw('prazo', 'Coluna de prazo', 'prazo de liberação do catálogo', 'fa-clock')}
        ${cx.lab && cx.ref ? sw('base', 'Incluir tabela base', `todos os exames da ${esc(cx.ref.nome)}; valor diferenciado tem prioridade`, 'fa-table-list') : ''}
        ${grade.alvo === alvo ? sw('filtrada', 'Só os exames filtrados na tela', 'respeita busca, setor e filtro da grade', 'fa-filter') : ''}
      </div>
      ${pend ? `<div class="alert a" style="margin:0"><i class="fa-solid fa-pen"></i><div>Seu rascunho (${pend} preço(s)) <b>não</b> entra: o PDF usa os preços publicados.</div></div>` : ''}
      <div class="hint"><i class="fa-solid fa-lock"></i> Custo e margem nunca saem no PDF.</div>
    </div>`,
    rodape: `<span style="margin-right:auto"></span><button class="btn" onclick="fecharGaveta()">Fechar</button>
      <button class="btn pri" id="tpdf-gerar" onclick="gerarPdfTabela()"><i class="fa-solid fa-file-pdf"></i>Gerar PDF</button>`
  });
  contarPdfTabela();
}
function contarPdfTabela() {
  const el = document.getElementById('tpdf-n');
  if (el) el.innerHTML = `<i class="fa-solid fa-flask-vial"></i>${num(itensPdfTabela().length, 0)} exame(s)`;
}

async function gerarPdfTabela() {
  const bt = document.getElementById('tpdf-gerar'), cx = ctxAlvo(tpdf.alvo);
  if (!itensPdfTabela().length) return toast('Nenhum exame com preço nesse filtro', 'erro');
  if (bt) { bt.disabled = true; bt.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>Gerando…'; }
  try {
    await Promise.all([carregarLibsPdf(), garantirCatalogo()]);
    const itens = itensPdfTabela();
    montarPdfTabela(await logoPdf(), cx, itens).save(`${tpdf.titulo || cx.nome} - LAMIC.pdf`.replace(/[\\/:*?"<>|]/g, '-'));
    registrar('tabelas', `${cx.nome}: PDF gerado (${itens.length} exames)`);
    toast(`PDF gerado · ${itens.length} exames`);
  } catch (e) {
    console.error(e);
    toast(e.message || 'Erro ao gerar o PDF', 'erro');
  } finally {
    if (bt) { bt.disabled = false; bt.innerHTML = '<i class="fa-solid fa-file-pdf"></i>Gerar PDF'; }
  }
}

function montarPdfTabela(logo, cx, itens) {
  const { jsPDF } = window.jspdf, C = COR_PDF, f = tpdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.setLineHeightFactor(1.42);
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 42, LW = W - 2 * M;
  const TOPO = 78, BASE = H - 64, hoje = new Date().toLocaleDateString('pt-BR');
  const brl = v => 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cor = (c, tipo = 'text') => tipo === 'text' ? doc.setTextColor(...c) : tipo === 'fill' ? doc.setFillColor(...c) : doc.setDrawColor(...c);
  const fonte = (estilo = 'normal', tam = 10) => { doc.setFont('helvetica', estilo); doc.setFontSize(tam); };
  const titulo = f.titulo || cx.nome;

  // ── Título ──
  let y = 108;
  fonte('bold', 18); cor(C.navy);
  const lt = doc.splitTextToSize(titulo, LW).slice(0, 2);
  doc.text(lt, M, y);
  y += lt.length * 22 - 12;
  cor(C.azul, 'fill'); doc.rect(M, y, 46, 3, 'F');
  cor(C.cinza, 'fill'); doc.rect(M + 50, y, 14, 3, 'F');
  y += 20;
  fonte('normal', 9.5); cor(C.muted);
  doc.text(`${itens.length.toLocaleString('pt-BR')} exames · valores unitários em reais (R$) · emitida em ${hoje}`, M, y);
  y += 14;
  if (f.obs.trim()) {
    fonte('normal', 9.5); cor(C.texto);
    const lo = doc.splitTextToSize(f.obs.trim(), LW);
    doc.text(lo, M, y + 4);
    y += lo.length * 13.5 + 6;
  }

  // ── Relação de exames ──
  const cat = ESTADO.catalogo || {};
  const cols = [{ k: 'mn', t: 'Mnemônico', w: 66 }, { k: 'ex', t: 'Exame' }];
  if (f.material) cols.push({ k: 'mat', t: 'Material', w: 84 });
  if (f.prazo) cols.push({ k: 'pz', t: 'Prazo', w: 66, a: 'center' });
  cols.push({ k: 'vl', t: 'Valor', w: 70, a: 'right' });
  const linha = x => ({ mn: x.e.mn, ex: x.e.descricao || '', mat: cat[x.k]?.material || x.e.material || '-', pz: textoPrazoPdf(x.k) || '-', vl: brl(x.preco) });
  const ord = (a, b) => String(a.e.mn).localeCompare(String(b.e.mn), 'pt-BR', { sensitivity: 'base' });
  const corpo = [];
  if (f.setor) {
    const grupos = {};
    itens.forEach(x => (grupos[grupoPdf(x.e)] ??= []).push(x));
    Object.keys(grupos).sort(ordemGrupoPdf).forEach(s => {
      corpo.push([{ content: `${s}  (${grupos[s].length})`, colSpan: cols.length, styles: { fillColor: [232, 243, 249], textColor: C.navy, fontStyle: 'bold', fontSize: 8.5 } }]);
      grupos[s].sort(ord).forEach(x => { const r = linha(x); corpo.push(cols.map(c => r[c.k])); });
    });
  } else itens.sort(ord).forEach(x => { const r = linha(x); corpo.push(cols.map(c => r[c.k])); });
  const colStyles = {};
  cols.forEach((c, i) => { colStyles[i] = { cellWidth: c.w || 'auto', halign: c.a || 'left' }; });
  colStyles[0].fontStyle = 'bold'; colStyles[0].textColor = C.navy;
  colStyles[cols.length - 1].fontStyle = 'bold';
  doc.autoTable({
    startY: y, head: [cols.map(c => c.t)], body: corpo, theme: 'plain',
    margin: { left: M, right: M, top: TOPO + 6, bottom: H - BASE + 4 },
    styles: { font: 'helvetica', fontSize: 8.4, cellPadding: { top: 4.5, bottom: 4.5, left: 5, right: 5 }, textColor: C.texto, lineColor: C.linha, lineWidth: { bottom: 0.5 }, valign: 'middle', overflow: 'linebreak' },
    headStyles: { fillColor: C.navy, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8, lineWidth: 0, halign: 'left' },
    alternateRowStyles: { fillColor: [250, 251, 253] },
    columnStyles: colStyles,
    didParseCell: d => { if (d.section === 'head') d.cell.styles.halign = cols[d.column.index]?.a || 'left'; }
  });

  // ── Cabeçalho e rodapé em todas as páginas ──
  const n = doc.internal.getNumberOfPages(), rodape = modeloProposta().rodape || '';
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    cor(C.navy, 'fill'); doc.rect(0, 0, W, 5, 'F');
    cor(C.azul, 'fill'); doc.rect(W * 0.62, 0, W * 0.38, 5, 'F');
    if (logo) { const p = doc.getImageProperties(logo), lw = i === 1 ? 120 : 92; doc.addImage(logo, 'PNG', M - 10, 16, lw, lw * p.height / p.width); }
    fonte('bold', 8); cor(C.azul); doc.text('TABELA DE PREÇOS', W - M, 34, { align: 'right', charSpace: 1.2 });
    fonte('bold', 10); cor(C.navy); doc.text(doc.splitTextToSize(cx.nome, 260)[0], W - M, 48, { align: 'right' });
    cor(C.linha, 'draw'); doc.setLineWidth(0.6); doc.line(M, 66, W - M, 66);
    cor(C.azul, 'draw'); doc.setLineWidth(1); doc.line(M, H - 46, M + 40, H - 46);
    cor(C.linha, 'draw'); doc.setLineWidth(0.5); doc.line(M + 44, H - 46, W - M, H - 46);
    fonte('normal', 7.8); cor(C.muted);
    doc.text(doc.splitTextToSize(rodape, LW - 90)[0] || '', M, H - 32);
    doc.text(`${titulo} · emitida em ${hoje}`, M, H - 21);
    fonte('bold', 8); cor(C.navy); doc.text(`Página ${i} de ${n}`, W - M, H - 32, { align: 'right' });
  }
  return doc;
}
