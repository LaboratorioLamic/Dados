// ═══════════════════════════════════════════════════════════════
// tabexames.js — Janela "Gerenciar exames" de uma tabela de preço:
// mostra o rascunho do usuário; a busca sugere exames e, ao escolher
// um, ele entra na lista para incluir, alterar o preço ou retirar.
// Na Particular (tabela base) a lista cuida do custo e do preço
// praticado: não há incluir/retirar nem desconto.
// ═══════════════════════════════════════════════════════════════

const GX_SUG = 8;
// fix: exames mantidos na lista enquanto a janela está aberta (mesmo sem alteração); sug: chaves sugeridas pela busca
const gx = { alvo: null, q: '', fix: new Set(), sug: [], hi: 0 };
const gxCtx = () => ctxAlvo(gx.alvo);

// Tabelas cuja referência é a Particular deixam alterar o valor dela aqui mesmo:
// a alteração vai para o rascunho da Particular e segue a aprovação de lá.
const gxPart = cx => (cx.tabela || (cx.conv && !cx.tab)) && pode('tabelas', 'editar') ? ctxAlvo('particular') : null;
// Linha da grade já com a Particular do rascunho como referência (desconto, teto do alvo e sugestões)
function gxX(cx, e) {
  const x = linhaGrade(cx, e), cxP = gxPart(cx);
  if (!cxP || !editado(cxP, x.k)) return x;
  const pp = precoAtual(cxP, x.k);
  return { ...x, e: { ...x.e, precoPraticado: pp }, ref: pp, refPub: x.ref, refEd: true, desc: pp && x.preco != null ? 1 - x.preco / pp : null };
}

// Arredondamento (para cima) dos valores sugeridos: múltiplos de R$ 1, 5 ou 10; a escolha fica lembrada neste navegador
const GX_ARR = [1, 5, 10];
function gxArr() {
  let a = 1;
  try { a = +localStorage.getItem('prec-arred-gx'); } catch (e) {}
  return GX_ARR.includes(a) ? a : 1;
}
function gxArredondar(v) {
  const a = gxArr();
  return v == null || a === 1 ? v : Math.ceil(v / a - 1e-9) * a;
}
// Valor sugerido de uma linha, já arredondado: 'alvo' (margem alvo), 'ref' (referência menos o desconto) ou 'piso'.
// Fora da Particular nunca passa do valor da Particular; "igual" (laboratório) não arredonda.
function gxValor(cx, x, a) {
  const c = x.c;
  // Particular: a tolerância de margem deixa o sugerido descer para o múltiplo de baixo
  if (a === 'alvo' && cx.base && !c.semCusto) return precoAlvo(c.custo, c.margemSug ?? c.alvo, gxArr()) ?? undefined;
  if (a === 'alvo') return tetoParticular(cx, x, gxArredondar(c.margemSug != null ? precoParaMargem(c, c.margemSug) : c.sugerido || undefined));
  const v = valorAcao(cx, x, a);
  return cx.lab && a === 'ref' ? v : tetoParticular(cx, x, gxArredondar(v));
}
function gxPopArr() {
  const st = criarPop('pop-gxarr', {
    rotulo: 'Arredondar', titulo: 'Arredondar valores sugeridos', icone: 'fa-coins', padrao: 1,
    opcoes: GX_ARR.map(a => ({ valor: a, rotulo: fmt(a), icone: 'fa-coins', desc: a === 1 ? 'Valores inteiros' : `Para cima, em múltiplos de ${fmt(a)}` })),
    aoMudar: a => {
      try { localStorage.setItem('prec-arred-gx', a); } catch (e) {}
      desenharGerirExames();
    }
  });
  if (!st) return;
  st.valor = gxArr();
  desenharBotaoPop('pop-gxarr');
}

async function abrirGerirExames(alvo) {
  const cx = ctxAlvo(alvo);
  if (!cx) return;
  fecharPop();
  await carregarRascunho(alvo);
  if (gxPart(cx)) await carregarRascunho('particular');
  limparRascTravado(cx);
  Object.assign(gx, { alvo, q: '', sug: [], hi: 0, fix: new Set(Object.keys(rasc(alvo))) });
  let m = document.getElementById('gx');
  if (!m) {
    m = document.createElement('div');
    m.id = 'gx'; m.className = 'gx-fundo';
    m.onclick = e => { if (e.target === m) fecharGerirExames(); };
    // o fundo dos popovers fica atrás da janela: clique fora do popover fecha por aqui
    m.addEventListener('mousedown', e => { if (popAberto && !e.target.closest('.pop-wrap')) fecharPop(); });
    document.body.appendChild(m);
  }
  m.innerHTML = `<div class="gx" role="dialog" aria-modal="true" aria-label="Gerenciar exames">
    <div class="gx-h"><span class="tc-ic" style="--c:${cx.cor}"><i class="fa-solid ${cx.icone}"></i></span>
      <div class="gx-t"><span>${cx.base ? 'Custos e preços' : 'Gerenciar exames'}</span><h3>${esc(cx.nome)}</h3></div>
      <div class="gx-kpis" id="gx-kpis"></div>
      <button class="gx-x" onclick="fecharGerirExames()" title="Fechar (Esc)"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="gx-bar">
      <div class="gx-busca"><div class="search"><i class="fa-solid fa-magnifying-glass"></i><input id="gx-q" placeholder="Digite o mnemônico ou o nome do exame para ${cx.base ? 'ver custo e preço' : 'adicionar'}…" autocomplete="off"
          oninput="gxBuscar(this.value)" onfocus="gxBuscar(this.value)" onkeydown="gxTeclaBusca(event)" onblur="setTimeout(gxFecharSug, 150)"></div>
        <div class="gx-sug" id="gx-sug"></div></div>
      <div id="pop-gxarr" title="Arredonda os valores sugeridos (alvo, referência, mínimo) e o preço de quem entra na lista"></div>
      <div class="gx-tit" id="gx-tit"></div></div>
    <div class="gx-lista" id="gx-lista"></div>
    <div class="gx-f"><div class="hint" id="gx-res"></div>
      <div class="gx-bts" id="gx-bts"></div></div></div>`;
  m.classList.add('open');
  document.addEventListener('keydown', gxEsc);
  gxPopArr();
  desenharGerirExames();
  document.getElementById('gx-q').focus();
}

function fecharGerirExames() {
  document.getElementById('gx')?.classList.remove('open');
  document.removeEventListener('keydown', gxEsc);
  if (grade.alvo === gx.alvo) desenharGrade();
}
const gxAberta = () => !!document.getElementById('gx')?.classList.contains('open');
function gxEsc(ev) {
  if (ev.key !== 'Escape' || document.getElementById('modal').classList.contains('open') || ev.target.closest?.('.pop-wrap')) return;
  if (document.getElementById('gaveta').classList.contains('open')) fecharGaveta(); else fecharGerirExames();
}

// "Revisar e enviar": mesma gaveta de envio da grade, aberta por cima da janela
function gxEnviar() {
  if (grade.alvo !== gx.alvo) { fecharGerirExames(); return; }
  abrirEnvioProposta();
}

// Clique na linha (fora dos campos e botões): abre a ficha do exame
function gxLinha(ev) {
  if (ev.target.closest('button, input, .price-in')) return;
  abrirFicha(ev.currentTarget.dataset.k);
}

// "Sem custo": abre a ficha do exame na aba de custos, por cima da janela
function gxCusto(btn) { abrirFicha(btn.closest('.gx-l').dataset.k, 'custos'); }

// Ao fechar a ficha, a lista reflete o custo novo (o dado gravado pode chegar logo depois)
const _gxFecharGaveta = fecharGaveta;
fecharGaveta = function () {
  _gxFecharGaveta();
  if (!gxAberta()) return;
  desenharGerirExames();
  setTimeout(() => { if (gxAberta() && !document.activeElement?.closest('#gx-lista')) desenharGerirExames(); }, 800);
};

// Exames ativos (ou que ainda têm preço no alvo), já com a busca aplicada
function gxItens(cx, comBusca = true) {
  return examesVisiveis().map(e => ({ e, k: e.id, preco: precoAtual(cx, e.id), salvo: cx.salvo(e.id), ed: editado(cx, e.id) }))
    .filter(x => x.e.ativo !== false || x.preco != null || x.ed)
    .filter(x => !comBusca || contem(x.e.mn + ' ' + x.e.descricao, gx.q));
}

// ── Busca com sugestões ───────────────────────────────────────
// Mnemônico que começa com o texto vem primeiro
function gxBuscar(q) {
  const cx = gxCtx(), el = document.getElementById('gx-sug');
  gx.q = q;
  if (!cx || !q.trim()) return gxFecharSug();
  const ini = normalizar(q.trim()), pri = x => normalizar(x.e.mn).startsWith(ini) ? 0 : 1;
  const itens = gxItens(cx).sort((a, b) => pri(a) - pri(b) || String(a.e.mn).localeCompare(String(b.e.mn), 'pt-BR'));
  const vis = itens.slice(0, GX_SUG);
  gx.sug = vis.map(x => x.k); gx.hi = 0;
  el.innerHTML = !vis.length ? `<div class="gx-sug-v"><i class="fa-solid fa-magnifying-glass"></i>Nenhum exame encontrado para <b>${esc(q)}</b></div>`
    : vis.map((x, i) => {
      const est = gx.fix.has(x.k) || x.ed ? ['c', 'fa-pen', 'já na lista'] : x.salvo != null ? ['g', 'fa-table-list', `${cx.base ? 'praticado' : cx.lab ? 'valor' : 'na tabela'} ${fmt(x.salvo)}`] : ['', 'fa-circle-plus', cx.base ? 'sem preço' : cx.lab ? 'sem valor' : 'fora da tabela'];
      return `<button type="button" class="${i ? '' : 'hi'}" onmousedown="event.preventDefault();gxAdicionar(gx.sug[${i}])" onmouseenter="gxMarcarSug(${i})">
        <b>${esc(x.e.mn)}</b><span title="${esc(x.e.descricao)}">${esc(x.e.descricao)}</span><small class="${est[0]}"><i class="fa-solid ${est[1]}"></i>${est[2]}</small></button>`;
    }).join('') + (itens.length > vis.length ? `<div class="gx-sug-v">+ ${itens.length - vis.length} exame(s): continue digitando para refinar</div>` : '');
  el.classList.add('open');
}
function gxFecharSug() { gx.sug = []; document.getElementById('gx-sug')?.classList.remove('open'); }
function gxMarcarSug(i) {
  gx.hi = i;
  document.querySelectorAll('#gx-sug button').forEach((b, n) => b.classList.toggle('hi', n === i));
}
function gxTeclaBusca(ev) {
  if (!gx.sug.length) return;
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); gxMarcarSug(Math.max(0, Math.min(gx.sug.length - 1, gx.hi + (ev.key === 'ArrowDown' ? 1 : -1)))); }
  else if (ev.key === 'Enter') { ev.preventDefault(); gxAdicionar(gx.sug[gx.hi]); }
  else if (ev.key === 'Escape') { ev.stopPropagation(); gxFecharSug(); }
}

// Exame escolhido na busca entra na lista; fora da tabela já recebe o preço sugerido (referência > praticado > piso)
function gxAdicionar(k) {
  const cx = gxCtx(), e = ESTADO.exames[k];
  if (!cx || !e) return;
  if (!cx.base && !gx.fix.has(k) && precoAtual(cx, k) == null && !editado(cx, k)) {
    const x = gxX(cx, { ...e, id: k });
    definirRasc(cx, k, gxValor(cx, x, 'ref') ?? x.e.precoPraticado ?? gxValor(cx, x, 'piso') ?? 0);
  }
  gx.fix.add(k); gx.q = '';
  document.getElementById('gx-q').value = '';
  gxFecharSug();
  desenharGerirExames();
  const l = [...document.querySelectorAll('#gx-lista .gx-l')].find(x => x.dataset.k === k);
  l?.scrollIntoView({ block: 'center' });
  l?.querySelector('input[data-c="v"]')?.focus();
}

function gxCabecalho(cx, todos = gxItens(cx, false)) {
  const kp = (v, r, cls = '') => `<div class="${cls}"><b>${num(v, 0)}</b><span>${r}</span></div>`;
  // médias com os preços atuais (rascunho incluído), como nos cartões das tabelas
  const cxP = gxPart(cx), np = cxP ? Object.keys(rasc('particular')).length : 0;
  let sm = 0, km = 0, sd = 0, kd = 0, nt = 0, sc = 0;
  todos.forEach(x => {
    const c = calcular(x.e, x.preco, cx.tab);
    if (c.semCusto) sc++;
    if (x.preco == null) return;
    nt++;
    const m = c.margem, ref = cxP && editado(cxP, x.k) ? precoAtual(cxP, x.k) : cx.ref?.valor(x.k);
    if (m != null) { sm += m; km++; }
    if (ref && !precoSimbolico(ref) && !precoSimbolico(x.preco)) { sd += 1 - x.preco / ref; kd++; }
  });
  const r = todos.filter(x => x.ed).length;
  const md = (v, rot, dica) => `<div class="med" title="${esc(dica)}"><b>${v}</b><span>${rot}</span></div>`;
  document.getElementById('gx-kpis').innerHTML = (cx.base ? kp(todos.length, 'exames') + kp(sc, 'sem custo') : kp(nt, cx.lab ? 'com valor' : 'na tabela') + kp(todos.length - nt, cx.lab ? 'sem valor' : 'fora')) + kp(r, 'no rascunho', r ? 'dest' : '')
    + md(km ? pct(sm / km) : '—', 'margem média', `Média dos ${km} exames com custo, já com o rascunho · ${cx.pisoNome} ${cx.pisoTxt}`)
    + (cx.base ? '' : md(kd ? pct(sd / kd) : '—', 'desc. médio', `Desconto médio sobre ${cx.ref?.nome || 'a referência'}${cx.tabela ? ` · referência ${cx.descTxt}${cx.dmaxTxt ? ` · máximo ${cx.dmaxTxt}` : ''}` : ''}`));
  document.getElementById('gx-tit').innerHTML = `<i class="fa-solid fa-pen-to-square"></i>Rascunho<b>${r}</b>`;
  document.getElementById('gx-res').innerHTML = r
    ? `<i class="fa-solid fa-pen-to-square"></i> <b>${r} alteração(ões) no seu rascunho</b> · ainda não enviadas para aprovação`
    : '<i class="fa-solid fa-circle-info"></i> As alterações ficam no seu rascunho até serem enviadas para aprovação';
  if (np) document.getElementById('gx-res').innerHTML += `<br><i class="fa-solid fa-user"></i> <b>${np} valor(es) da Particular alterado(s)</b> · ficam no rascunho da Particular e são enviados por lá, em proposta própria`;
  document.getElementById('gx-bts').innerHTML = `<button class="btn ${r ? '' : 'pri'}" onclick="fecharGerirExames()"><i class="fa-solid fa-check"></i>Concluir</button>`
    + (r ? `<button class="btn pri" onclick="gxEnviar()"><i class="fa-solid fa-paper-plane"></i>Revisar e enviar</button>` : '');
  if (np) document.getElementById('gx-bts').insertAdjacentHTML('afterbegin', `<button class="btn" onclick="gxIrParticular()" title="Abrir o rascunho da Particular para revisar e enviar"><i class="fa-solid fa-user"></i>Rascunho da Particular<b class="gx-n">${np}</b></button>`);
}

// Lista: o rascunho mais os exames escolhidos na busca nesta sessão da janela
function desenharGerirExames() {
  const cx = gxCtx(), el = document.getElementById('gx-lista');
  if (!cx || !el) return;
  limparRascTravado(cx);
  const todos = gxItens(cx, false);
  gxCabecalho(cx, todos);
  todos.forEach(x => { if (x.ed) gx.fix.add(x.k); });
  const itens = todos.filter(x => gx.fix.has(x.k)).sort((a, b) => String(a.e.mn).localeCompare(String(b.e.mn), 'pt-BR'));
  el.innerHTML = !itens.length ? vazio('fa-pen-to-square', `Rascunho vazio<br><span class="muted">${cx.base ? 'Busque um exame acima para informar o custo ou ajustar o preço praticado' : 'Busque um exame acima para incluir na tabela ou alterar o preço'}</span>`)
    : `<div class="gx-cab"><span>Exame</span><span></span><span>${cx.base ? 'Sugerido' : 'Alvo'}</span><span>${cx.base ? 'Mínimo' : cx.lab ? 'Igual' : 'Ref.'}</span><span>Margem</span><span>${cx.base ? 'Custo' : 'Desconto'}</span><span>${cx.base ? 'Unilab' : esc(cx.ref?.nome || 'Referência')}</span><span>Preço</span><span></span></div>`
    + itens.map(x => htmlLinhaGx(cx, x.e)).join('');
}

function htmlLinhaGx(cx, e) {
  const x = gxX(cx, e), { k, preco, c, ed, salvo, ref } = x, cxP = gxPart(cx);
  const d = ed && preco != null && salvo != null ? preco - salvo : 0;
  const mudou = !ed ? '' : salvo == null ? `<small class="g">${cx.lab ? 'novo valor' : 'entra'}</small>`
    : preco == null ? `<small class="r">${cx.lab ? 'remover' : 'sai'}</small>` : `<small class="c">${d > 0 ? '+' : ''}${fmt(d)}</small>`;
  const setor = ESTADO.setores[e.setorId];
  const info = salvo != null && ed ? `era ${fmt(salvo)}` : '';
  // sugestões: preço que atinge a margem alvo e referência menos o desconto de referência
  const mAlvo = c.margemSug ?? c.alvo, pLivre = gxArredondar(c.margemSug != null ? precoParaMargem(c, c.margemSug) : c.sugerido || undefined), pAlvo = gxValor(cx, x, 'alvo'), pRef = gxValor(cx, x, cx.base ? 'piso' : 'ref');
  const teto = !cx.base && pAlvo != null && pLivre != null && pAlvo < pLivre - 0.005;
  const sug = (a, v, sub, dica) => `<div class="gx-s gx-dyn">${v == null ? '' : `<button class="${preco != null && Math.abs(preco - v) < 0.005 ? 'on' : ''}" title="${esc(dica)}" onclick="gxAcao(this,'${a}')"><b>${fmt(v)}</b><small>${sub}</small></button>`}</div>`;
  // margem e desconto com o mesmo peso; desconto âmbar acima do de referência, vermelho acima do máximo ou se o preço passa dela
  const dmax = acimaDescMax(x.desc, x.descMax, x.descTol);
  const margem = c.semCusto ? `<button class="gx-sc" title="Exame sem custo: clique para informar" onclick="gxCusto(this)"><i class="fa-solid fa-plus"></i>custo</button>`
    : preco == null ? '<span class="gx-nd">—</span>' : `<b class="${c.status === 'r' ? 'r' : 'g'}" title="Custo ${fmt(c.custo)} · ${cx.pisoNome} ${pct(c.min, 0)}">${pct(c.margem)}</b>`;
  const dsc = x.desc, desconto = !ref || preco == null ? '<span class="gx-nd">—</span>'
    : `<b class="${dmax || dsc < -0.0005 ? 'r' : acimaDescRef(dsc, x.descRef, x.descTol) && !cx.lab ? 'a' : ''}" title="${dmax ? 'Acima do desconto máximo · ' : ''}Sobre ${esc(cx.ref.nome)} (${fmt(ref)})${cx.lab ? '' : ` · referência ${pct(x.descRef, 0)}`}${x.descMax != null ? ` · máximo ${pct(x.descMax, 0)}` : ''}">${dmax ? '<i class="fa-solid fa-ban"></i> ' : ''}${pct(dsc)}</b>`;
  // Coluna de referência: Unilab na Particular; valor da Particular editável (rascunho dela) nas tabelas que a usam
  const vRef = cx.base ? x.sist : ref;
  const part = !cxP ? `<div class="gx-p" title="${cx.base ? 'Preço no Unilab' : esc(cx.ref?.nome || 'Referência')}">${vRef != null ? fmt(vRef) : '<span class="gx-nd">—</span>'}</div>`
    : `<div class="gx-p"><div class="price-in ${x.refEd ? 'on' : ''}" title="Valor da Particular: a alteração vai para o rascunho da Particular"><input type="number" step="0.01" min="0" data-c="p" value="${ref != null ? ref.toFixed(2) : ''}" placeholder="—"
        oninput="gxEditarPart(this)" onkeydown="gxTecla(event)" onfocus="this.select()"></div>
      <div class="gx-dyn">${x.refEd ? `<button class="gx-pd" title="Alterado no rascunho da Particular: clique para desfazer" onclick="gxAcao(this,'desfp')">era ${x.refPub != null ? fmt(x.refPub) : '—'}<i class="fa-solid fa-rotate-left"></i></button>` : ''}</div></div>`;
  // Particular: no lugar do desconto e da referência entram o custo (clicável) e o preço do Unilab
  const custo = c.semCusto ? `<button class="gx-sc" title="Exame sem custo: clique para informar" onclick="gxCusto(this)"><i class="fa-solid fa-plus"></i>custo</button>`
    : `<button class="gx-ct" title="Custo total: clique para alterar" onclick="gxCusto(this)"><b>${fmt(c.custo)}</b><i class="fa-solid fa-pen"></i></button>`;
  const margemB = c.semCusto || preco == null ? '<span class="gx-nd">—</span>' : margem;
  return `<div class="gx-l ${preco != null ? 'in' : ''} ${ed ? 'ed' : ''}" data-k="${esc(k)}" onclick="gxLinha(event)">
    <div class="gx-mn gx-dyn"><b>${esc(e.mn)}</b>${mudou}</div>
    <div class="gx-d gx-dyn"><b title="${esc(e.descricao)}">${esc(e.descricao)}</b><small>${setor ? `<span class="gx-set ${info ? '' : 'so'}" style="--c:${esc(setor.cor || 'var(--gray)')}">${esc(setor.nome)}</span>` : ''}${info}</small></div>
    ${sug('alvo', pAlvo, teto ? 'teto Particular' : `margem ${pct(mAlvo, 0)}`, teto ? `Limitado ao valor da Particular: ${pct(mAlvo, 0)} de margem pediria ${fmt(pLivre)}` : `Preço que atinge ${pct(mAlvo, 0)} de margem`)}
    ${cx.base ? sug('piso', pRef, `margem ${pct(c.min, 0)}`, `Preço mínimo: ${pct(c.min, 0)} de margem`) : sug('ref', pRef, cx.lab ? 'igual' : `−${pct(c.descRef, 0)}`, cx.lab ? `Mesmo valor da ${cx.ref?.nome || 'tabela'}` : `${cx.ref.nome} menos o desconto de referência (${pct(c.descRef, 0)})`)}
    <div class="gx-v gx-dyn">${cx.base ? margemB : margem}${mAlvo != null ? `<small title="Margem de referência">ref. ${pct(mAlvo, 0)}</small>` : ''}</div>
    <div class="gx-v gx-dyn">${cx.base ? custo : desconto}${ref && !cx.lab && !cx.base ? `<small title="Desconto de referência">ref. ${pct(x.descRef, 0)}</small>` : ''}</div>
    ${part}
    ${x.pend ? `<div class="gx-lock">${htmlTravaProposta(x.pend, cx.lab)}</div>` : `<div class="price-in ${ed ? 'on' : ''}"><span>R$</span><input type="number" step="0.01" min="0" data-c="v" value="${preco != null ? preco.toFixed(2) : ''}" placeholder="—"
      oninput="gxEditar(this)" onkeydown="gxTecla(event)" onfocus="this.select()"></div>`}
    <div class="gx-a gx-dyn">${ed ? `<button title="Desfazer alteração" onclick="gxAcao(this,'desf')"><i class="fa-solid fa-rotate-left"></i></button>` : ''}${cx.base || x.pend ? '' : preco == null
      ? `<button class="add" title="${cx.lab ? 'Adicionar valor diferenciado' : 'Adicionar à tabela'}" onclick="gxAcao(this,'add')"><i class="fa-solid fa-plus"></i></button>`
      : `<button class="rem" title="${cx.lab ? 'Remover valor diferenciado' : 'Retirar da tabela'}" onclick="gxAcao(this,'rem')"><i class="fa-solid fa-xmark"></i></button>`}</div></div>`;
}

// Atualiza uma linha; digitando = mantém o campo de preço (e o foco)
function gxAtualizar(k, digitando) {
  const cx = gxCtx(), el = [...document.querySelectorAll('#gx-lista .gx-l')].find(l => l.dataset.k === k), e = ESTADO.exames[k];
  if (!el || !e) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = htmlLinhaGx(cx, { ...e, id: k });
  const nova = tmp.firstElementChild;
  if (!digitando) el.replaceWith(nova);
  else {
    el.className = nova.className;
    const novas = nova.querySelectorAll('.gx-dyn');
    el.querySelectorAll('.gx-dyn').forEach((cel, i) => { cel.innerHTML = novas[i].innerHTML; });
    const pis = nova.querySelectorAll('.price-in');
    el.querySelectorAll('.price-in').forEach((p, i) => { p.className = pis[i].className; });
  }
  gxCabecalho(cx);
  return digitando ? el : nova;
}

function gxEditar(inp) {
  const cx = gxCtx(), k = inp.closest('.gx-l').dataset.k, txt = inp.value.trim();
  const v = txt === '' ? null : parseFloat(txt);
  if (v != null && (isNaN(v) || v < 0)) return;
  definirRasc(cx, k, cx.base && v == null ? undefined : v);
  gxAtualizar(k, true);
}

// Valor da Particular: vai para o rascunho da Particular (campo vazio = desfaz)
function gxEditarPart(inp) {
  const cxP = gxPart(gxCtx()), k = inp.closest('.gx-l').dataset.k, txt = inp.value.trim();
  const v = txt === '' ? undefined : parseFloat(txt);
  if (!cxP || (v != null && (isNaN(v) || v < 0))) return;
  definirRasc(cxP, k, v || undefined);
  gxAtualizar(k, true);
}

// Leva para a Particular e abre a janela do rascunho dela
function gxIrParticular() {
  fecharGerirExames();
  focarAlvo('particular');
  renderTabelas();
  grade.alvo = 'particular';
  abrirGerirExames('particular');
}

function gxAcao(btn, a) {
  const cx = gxCtx(), k = btn.closest('.gx-l').dataset.k, e = ESTADO.exames[k];
  if (!e) return;
  // valor já em proposta pendente: só desfazer; o resto leva à proposta
  const pend = propPendente(cx.alvo, k);
  if (pend && a !== 'desf' && a !== 'desfp') return abrirProposta(pend.id);
  if (a === 'desfp') definirRasc(ctxAlvo('particular'), k, undefined);
  else if (a === 'desf') definirRasc(cx, k, undefined);
  else if (a === 'rem') definirRasc(cx, k, null);
  else {
    const x = gxX(cx, { ...e, id: k });
    if (a === 'alvo' || a === 'ref' || a === 'piso') definirRasc(cx, k, gxValor(cx, x, a));
    // "+": referência (com o desconto da tabela) > praticado > piso
    else definirRasc(cx, k, gxValor(cx, x, 'ref') ?? x.e.precoPraticado ?? gxValor(cx, x, 'piso') ?? 0);
  }
  const nova = gxAtualizar(k, false);
  if (a === 'add') nova?.querySelector('input[data-c="v"]')?.focus();
}

function gxTecla(ev) {
  if (!['Enter', 'ArrowDown', 'ArrowUp'].includes(ev.key)) return;
  ev.preventDefault();
  // navega na mesma coluna (preço ou Particular)
  const ins = [...document.querySelectorAll(`#gx-lista input[data-c="${ev.target.dataset.c}"]`)], i = ins.indexOf(ev.target);
  ins[ev.key === 'ArrowUp' ? i - 1 : i + 1]?.focus();
}
