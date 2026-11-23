// ═══════════════════════════════════════════════════════════════
// propostas.js — Envio do rascunho como proposta, aprovação,
// rejeição e publicação dos preços — COMERCIAL LAMIC
// ═══════════════════════════════════════════════════════════════
//
// propostas/{id}: alvo, alvoNome, itens {chave: {mn, de, para}}, n,
//   justificativa, autor, autorId, em, status (pendente|aprovada|rejeitada|cancelada),
//   decisao {por, porId, em, motivo}, lote (id comum às propostas enviadas juntas)
// Ausência de "de" = exame não estava na tabela; ausência de "para" = sai da tabela.

const ST_PROPOSTA = {
  pendente:  { nome: 'Pendente',  icone: 'fa-hourglass-half', cls: 'warn' },
  aprovada:  { nome: 'Aprovada',  icone: 'fa-circle-check',   cls: 'ok' },
  rejeitada: { nome: 'Rejeitada', icone: 'fa-circle-xmark',   cls: 'bad' },
  cancelada: { nome: 'Cancelada', icone: 'fa-ban',            cls: 'off' }
};
let propFiltro = 'pendente'; // pendente | historico

const alvoInfo = alvo => {
  const cx = ctxAlvo(alvo);
  return cx ? { nome: cx.nome, icone: cx.icone, cor: cx.cor } : { nome: '(removida)', icone: 'fa-table-list', cor: 'var(--gray)' };
};
const fmtOuFora = (v, lab) => v != null ? fmt(v) : `<span class="muted">${lab ? 'sem valor' : 'fora'}</span>`;

// ── Quadro da proposta (envio e avaliação) ────────────────────
// Linha: valor de antes, valor proposto e o cálculo dele no perfil da tabela.
// Desconto só onde há referência (tabelas: Particular; laboratórios/conveniados: tabela base).
// Valor da Particular em proposta pendente (a mais recente que inclui o exame): { id, para } | null
// No envio e no rascunho de exames (_ppRascPart), o valor da Particular no rascunho do usuário vem antes:
// a proposta da Particular ainda não enviada já afeta o desconto das demais tabelas ({ rasc: true, para })
let _ppRascPart = false;
function partPendente(k) {
  if (_ppRascPart && k in rasc('particular') && rasc('particular')[k] != null && !propPendente('particular', k)) return { id: null, rasc: true, para: arredPP(rasc('particular')[k]) };
  let r = null;
  Object.entries(ESTADO.propostas || {}).forEach(([id, p]) => {
    const it = p.status === 'pendente' && p.alvo === 'particular' ? p.itens?.[k] : null;
    if (it && it.para != null && (!r || (p.em || 0) > r.em)) r = { id, para: it.para, em: p.em || 0 };
  });
  return r;
}

// Onde a referência é a Particular, o desconto já considera o valor dela que aguarda aprovação (pend)
function linhaProposta(cx, k, de, para) {
  const e = ESTADO.exames[k], c = cx && e && para != null ? calcular(e, para, cx.tab) : null;
  const c0 = cx && e && de != null ? calcular(e, de, cx.tab) : null;
  const refPub = cx && !cx.base ? cx.ref?.valor(k) ?? null : null;
  const pend = cx && (cx.tabela || (cx.conv && !cx.tab)) ? partPendente(k) : null, ref = pend ? pend.para : refPub;
  const desc = ref && para != null && !precoSimbolico(ref) && !precoSimbolico(para) ? 1 - para / ref : null;
  return { k, e, mn: e?.mn, de, para, c, c0, ref, refPub, pend, desc, descRef: cx?.tabela ? c?.descRef ?? null : null, descMax: cx?.tabela ? c?.descMax ?? null : null, descTol: cx?.tabela ? c?.descTol ?? 0 : 0 };
}

const ppVar = x => {
  const d = x.de != null && x.para != null && x.de > 0 ? x.para / x.de - 1 : null;
  return d ? `<small class="${d > 0 ? 'delta-dn' : 'delta-up'}">${d > 0 ? '+' : ''}${pct(d)}</small>` : '';
};
// Desconto / margem alvo: clicável quando a linha tem campo de valor (aprovação e edição); aplica o preço no campo
const ppAlvo = (v, txt, tit) => v != null ? `<small class="pp-alvo" data-v="${v}" title="${tit}: ${fmt(v)}" onclick="ppAplicarAlvo(this)">${txt}</small>` : `<small>${txt}</small>`;
function ppAplicarAlvo(el) {
  const inp = el.closest('tr')?.querySelector('.price-in input');
  if (!inp) return;
  inp.value = moedaCampo(+el.dataset.v);
  inp.dispatchEvent(new Event('input'));
}
const ppDesc = x => x.desc == null ? '<span class="muted">—</span>'
  : `<b class="${acimaDescMax(x.desc, x.descMax, x.descTol) || x.desc < -0.0005 ? 'r' : acimaDescRef(x.desc, x.descRef, x.descTol) ? 'a' : ''}"${acimaDescMax(x.desc, x.descMax, x.descTol) ? ` title="Acima do desconto máximo (${pct(x.descMax, 0)})"` : ''}>${pct(x.desc)}</b>${x.descRef != null ? ppAlvo(x.ref != null ? Math.round(x.ref * (1 - x.descRef)) : null, `ref. ${pct(x.descRef, 0)}`, 'Aplicar o desconto de referência') : ''}${x.pend ? `<small style="color:var(--${x.pend.rasc ? 'cyan' : 'amber'})" title="Particular ${x.pend.rasc ? 'no seu rascunho' : 'com proposta pendente'}: desconto sobre ${fmt(x.pend.para)} (publicado hoje: ${x.refPub != null ? fmt(x.refPub) : '—'})"><i class="fa-solid ${x.pend.rasc ? 'fa-pen-to-square' : 'fa-hourglass-half'}"></i> Part. ${fmt(x.pend.para)}</small>` : ''}`;
// Margem do valor de hoje, sob ele (vermelha abaixo do piso)
const ppMrg0 = x => x.c0?.margem == null ? '' : `<small${x.c0.status === 'r' ? ' style="color:var(--red)"' : ''} title="Margem do valor de hoje · lucro ${fmt(x.c0.lucro)}">margem ${pct(x.c0.margem)}</small>`;
const ppMrg = x => {
  if (x.c?.semCusto && pode('exames', 'editar')) return `<button type="button" class="gx-sc" title="Exame sem custo: clique para informar" onclick="ppCusto(this)"><i class="fa-solid fa-plus"></i>custo</button>`;
  if (x.c?.margem == null) return `<span class="muted">${x.c?.semCusto ? 'sem custo' : '—'}</span>`;
  const mref = x.c.margemSug ?? x.c.alvo;
  return `<b class="${x.c.status === 'r' ? 'r' : 'g'}">${pct(x.c.margem)}</b><small>lucro ${fmt(x.c.lucro)}</small>${mref != null ? ppAlvo(precoParaMargem(x.c, mref), `ref. ${pct(mref, 0)}`, 'Aplicar a margem alvo') : ''}`;
};

// "Sem custo": abre a ficha do exame na aba de custos; ao fechá-la, a proposta volta como estava
// (justificativa, observação e valores revisados).
let _ppVolta = null;
function ppCusto(btn) { ppFicha(btn, 'custos'); }
// A gaveta é uma só: para a ficha abrir por cima, uma cópia inerte da proposta fica no lugar,
// escurecida, enquanto a gaveta de verdade desliza com a ficha.
function ppFantasma() {
  ppTirarFantasma();
  const g = document.getElementById('gaveta'), f = g.cloneNode(true), topo = document.getElementById('g-corpo').scrollTop;
  const vals = [...g.querySelectorAll('input, textarea')].map(i => i.value);
  f.querySelectorAll('input, textarea').forEach((i, n) => { i.value = vals[n]; });
  f.querySelectorAll('[id]').forEach(x => x.removeAttribute('id'));
  f.id = 'gaveta-fantasma';
  f.classList.add('fantasma');
  f.setAttribute('aria-hidden', 'true');
  g.before(f);
  f.querySelector('.dr-b').scrollTop = topo;
  ppSemTransicao(() => g.classList.remove('open'));
}
const ppTirarFantasma = () => document.getElementById('gaveta-fantasma')?.remove();
// Muda a gaveta de estado sem animar
function ppSemTransicao(f) {
  const g = document.getElementById('gaveta');
  g.style.transition = 'none';
  f();
  void g.offsetWidth;
  g.style.transition = '';
}

// Clique no exame: abre a ficha dele, com a mesma volta
function ppFicha(el, aba) {
  const k = el.closest('tr').dataset.k, rx = !!document.getElementById('rx-lista'), envio = !!document.getElementById('pp-just');
  const volta = rx ? { rx: { ..._rx, sel: new Set(_rx.sel) }, txt: valorCampo('rx-just') } : { envio, id: _propId, txt: valorCampo(envio ? 'pp-just' : 'pp-motivo'), rev: { ..._propRev } };
  if (!ESTADO.exames[k]) return;
  ppFantasma();
  abrirFicha(k, aba);
  _ppVolta = volta;
}
const _ppFecharGaveta = fecharGaveta;
fecharGaveta = function () {
  const v = _ppVolta;
  _ppVolta = null;
  _ppFecharGaveta();
  if (!v) return ppTirarFantasma();
  // a ficha desliza para fora e a cópia da proposta segue à vista, com o fundo escuro
  document.getElementById('gaveta-fundo').classList.add('open');
  // espera o custo gravado chegar ao estado antes de recalcular
  setTimeout(async () => {
    const g = document.getElementById('gaveta');
    g.style.transition = 'none';
    if (v.rx) { _rxVolta = v.rx; await abrirRascunhoExames(null, v.txt); }
    else if (v.envio) await abrirEnvioProposta(); else abrirProposta(v.id);
    void g.offsetWidth;
    g.style.transition = '';
    ppTirarFantasma();
    if (v.rx) return;
    const campo = document.getElementById(v.envio ? 'pp-just' : 'pp-motivo');
    if (campo) campo.value = v.txt;
    Object.entries(v.rev).forEach(([k, val]) => {
      const inp = [...document.querySelectorAll('#g-corpo .pp-tab tr')].find(tr => tr.dataset.k === k)?.querySelector('input');
      if (inp) { inp.value = moedaCampo(val); revisarItem(inp); }
    });
  }, 400);
};

// Indicadores do quadro: médias dos valores propostos, com as referências da tabela
function htmlKpisProposta(cx, ls) {
  let sm = 0, km = 0, s0 = 0, k0 = 0, sd = 0, kd = 0, lu = 0, ab = 0;
  ls.forEach(x => {
    if (x.c?.margem != null) { sm += x.c.margem; km++; lu += x.c.lucro; if (x.c.status === 'r') ab++; }
    if (x.c0?.margem != null) { s0 += x.c0.margem; k0++; }
    if (x.desc != null) { sd += x.desc; kd++; }
  });
  const dm = ls.filter(x => acimaDescMax(x.desc, x.descMax, x.descTol)).length;
  const kp = (rot, v, cls, sub) => `<div><span>${rot}</span><b class="${cls}">${v}</b><small>${sub}</small></div>`;
  return kp('Margem média', km ? pct(sm / km) : '—', ab ? 'r' : km ? 'g' : '',
      [`${cx.pisoNome} ${cx.pisoTxt}`, cx.margemSug != null ? `ref. ${cx.msugTxt}` : '', k0 ? `antes ${pct(s0 / k0)}` : ''].filter(Boolean).join(' · '))
    + (cx.base || !cx.ref ? '' : kp('Desconto médio', kd ? pct(sd / kd) : '—', dm ? 'r' : '',
      cx.tabela ? `ref. ${cx.descTxt}${cx.dmaxTxt ? ` · máx. ${cx.dmaxTxt}` : ''}` : `sobre ${esc(cx.ref.nome)}`))
    + kp('Lucro médio', km ? fmt(lu / km) : '—', km && lu < 0 ? 'r' : '', km ? `por exame · ${km} com custo` : 'sem custo informado')
    + htmlKpisTabelaToda(cx, ls);
}

// Tabela inteira com a proposta aplicada (exames da proposta no valor proposto, demais no publicado) × hoje
function htmlKpisTabelaToda(cx, ls) {
  const prop = Object.fromEntries(ls.map(x => [x.k, x.para]));
  const ks = new Set(Object.keys(ESTADO.exames || {}).filter(k => ESTADO.exames[k].ativo !== false && cx.salvo(k) != null));
  ls.forEach(x => { if (x.para != null) ks.add(x.k); });
  const m = { d: [0, 0], d0: [0, 0], m: [0, 0], m0: [0, 0], ab: 0 };
  const soma = (a, v) => { if (v != null && isFinite(v)) { a[0] += v; a[1]++; } };
  ks.forEach(k => {
    const s0 = cx.salvo(k) ?? null, v = k in prop ? prop[k] : s0;
    if (v != null) { const x = linhaProposta(cx, k, null, v); soma(m.m, x.c?.margem); soma(m.d, x.desc); if (x.c?.status === 'r') m.ab++; }
    if (s0 != null) { const x0 = linhaProposta(cx, k, null, s0); soma(m.m0, x0.c?.margem); soma(m.d0, x0.desc); }
  });
  const md = a => a[1] ? a[0] / a[1] : null;
  const mm = md(m.m), mm0 = md(m.m0), dd = md(m.d), dd0 = md(m.d0);
  const it = (rot, v, v0, cls) => `<em>${rot} <b class="${cls}">${v != null ? pct(v) : '—'}</b>${v0 != null && v != null && Math.abs(v - v0) > 0.00005 ? `<small>hoje ${pct(v0)} · ${v > v0 ? '+' : ''}${((v - v0) * 100).toFixed(1).replace('.', ',')} p.p.</small>` : ''}</em>`;
  return `<div class="pp-toda"><span><i class="fa-solid fa-table-list"></i>Tabela toda · ${num(ks.size, 0)} exames</span>
    ${it('Margem média', mm, mm0, m.ab ? 'r' : 'g')}${cx.base || !cx.ref ? '' : it('Desconto médio', dd, dd0, '')}
    ${m.ab ? `<em><small style="color:var(--red)">${m.ab} abaixo do ${cx.pisoNome}</small></em>` : ''}</div>`;
}

// Quadro da tabela: cabeçalho, indicadores e itens. o: { nome, colDe, colPara, celPara(x), marca(x) }
// Setor do exame e, nos de apoio, se o valor é negociado: linha discreta sob a descrição
function ppSetor(e) {
  const s = ESTADO.setores[e?.setorId];
  const neg = !e || (e.origem !== 'apoio' && s?.categoria !== 'apoio') ? '' : negociadoExame(e) ? '<i class="fa-solid fa-handshake" style="color:var(--green)" title="Apoio com negociação"></i>'
    : '<i class="fa-solid fa-handshake-slash" style="color:var(--red)" title="Apoio sem valor negociado"></i>';
  return s || neg ? `<div class="pp-set">${s ? `<span style="--c:${esc(s.cor || 'var(--gray)')}">${esc(s.nome)}</span>` : ''}${neg}</div>` : '';
}

// Particular do exame (referência nas demais tabelas), com margem e lucro
// Com valor da Particular no rascunho ou em proposta pendente, mostra esse valor (o publicado fica no "era")
const ppPartCel = x => {
  const pub = x.e?.precoPraticado || null, v = x.pend?.para ?? pub;
  if (!v) return '<span class="muted">—</span>';
  const c = calcular(x.e, v, null);
  return `${x.pend ? `<b style="color:var(--${x.pend.rasc ? 'cyan' : 'amber'})" title="${x.pend.rasc ? 'No seu rascunho' : 'Em proposta pendente'} · publicado ${pub ? fmt(pub) : '—'}"><i class="fa-solid ${x.pend.rasc ? 'fa-pen-to-square' : 'fa-hourglass-half'}"></i> ${fmt(v)}</b><small>era ${pub ? fmt(pub) : '—'}</small>` : fmt(v)}${c?.margem != null ? `<small${c.status === 'r' ? ' style="color:var(--red)"' : ''}>margem ${pct(c.margem)}</small><small>lucro ${fmt(c.lucro)}</small>` : ''}`;
};
// Coluna "Hoje": verde = recém-adicionado; vermelho = acima da Particular (quebra de hierarquia)
const ppHojeCel = (x, lab, comPart) => {
  const part = x.e?.precoPraticado, quebra = comPart && part && x.de != null && x.de > part + 0.004;
  if (x.it?.novoUnilab) return `<b style="color:var(--${quebra ? 'red' : 'green'})">${fmtOuFora(x.de, lab)}</b><small class="pp-novo"><i class="fa-solid fa-circle-plus"></i> recém-adicionado</small>${quebra ? '<small class="pp-quebra"><i class="fa-solid fa-triangle-exclamation"></i> acima da Particular</small>' : ''}`;
  return quebra ? `<b style="color:var(--red)" title="Quebra de hierarquia: acima da Particular (${fmt(part)})">${fmtOuFora(x.de, lab)}</b><small class="pp-quebra"><i class="fa-solid fa-triangle-exclamation"></i> acima da Particular</small>` : fmtOuFora(x.de, lab);
};
// Custo do teste (o mesmo da margem); sem custo: traço
const ppCustoCel = (x, cx) => { const v = x.c?.custo ?? x.c0?.custo ?? (x.e ? calcular(x.e, null, cx?.tab).custo : null); return v != null ? fmt(v) : '<span class="muted">—</span>'; };
function htmlQuadroProposta(cx, ls, o) {
  const lab = cx?.lab, comDesc = cx && !cx.base && !!cx.ref, comPart = cx && !cx.base;
  const n = { e: 0, s: 0, up: 0, dn: 0 };
  ls.forEach(x => { if (x.de == null) n.e++; else if (x.para == null) n.s++; else if (x.para > x.de) n.up++; else if (x.para < x.de) n.dn++; });
  const pend = ls.filter(x => x.pend && !x.pend.rasc), idPend = pend[0]?.pend.id, nRascPart = ls.filter(x => x.pend?.rasc).length;
  const partes = [n.e && `${n.e} ${lab ? 'novos' : 'entram'}`, n.up && `${n.up} sobem`, n.dn && `${n.dn} descem`, n.s && `${n.s} ${lab ? 'removidos' : 'saem'}`].filter(Boolean).join(' · ');
  return `<div class="pp-q">
    <div class="pp-qh"><span class="tc-ic" style="--c:${cx?.cor || 'var(--gray)'}"><i class="fa-solid ${cx?.icone || 'fa-table-list'}"></i></span>
      <div><b>${esc(o.nome || cx?.nome || '(removida)')}</b><small>${ls.length} preço(s)${partes ? ' · ' + partes : ''}</small></div></div>
    ${cx ? `<div class="pp-kpis" id="pp-kpis">${htmlKpisProposta(cx, ls)}</div>` : ''}
    ${pend.length ? `<div class="alert a" style="margin:10px 12px"><i class="fa-solid fa-hourglass-half"></i><div><b>${pend.length} exame(s) com valor da Particular aguardando aprovação.</b> O desconto deles já considera o valor proposto da Particular; se ela for rejeitada, volta a valer o publicado. <a href="#" onclick="abrirProposta('${idPend}');return false">Abrir a proposta da Particular</a></div></div>` : ''}
    ${nRascPart ? `<div class="alert x" style="margin:10px 12px"><i class="fa-solid fa-pen-to-square"></i><div><b>${nRascPart} exame(s) com valor da Particular no seu rascunho.</b> O desconto deles já considera esse valor; envie também a Particular para que ele valha.</div></div>` : ''}
    <div class="tbl-wrap"><table class="pp-tab"><thead><tr><th>Exame</th>${comPart ? '<th class="num">Particular</th>' : ''}<th class="num">Custo</th><th class="num">${o.colDe}</th><th class="num">${o.colPara}</th>${comDesc ? '<th class="num">Desconto</th>' : ''}<th class="num">Margem</th>${o.colExtra ? `<th class="num">${o.colExtra.th}</th>` : ''}</tr></thead>
      <tbody>${ls.map(x => `<tr data-k="${esc(x.k)}">
        <td class="pp-ex ${x.e && !o.semFicha ? 'lk' : ''}" ${x.e && !o.semFicha ? 'title="Abrir a ficha do exame" onclick="ppFicha(this)"' : ''}>${o.marcaEsq?.(x) || ''}<span class="mn">${esc(x.mn ?? '—')}</span>${o.marca?.(x) || ''}<small title="${esc(x.e?.descricao || '')}">${esc(x.e?.descricao || 'exame excluído')}</small>${ppSetor(x.e)}</td>
        ${comPart ? `<td class="num pp-v">${ppPartCel(x)}</td>` : ''}
        <td class="num pp-custo">${ppCustoCel(x, cx)}</td>
        <td class="num"${x.it?.novoUnilab ? ' title="Valor recém-adicionado: era fora da tabela e entrou ao marcar como já praticado no UniLab"' : ''}>${ppHojeCel(x, lab, comPart)}${ppMrg0(x)}</td>
        <td class="num pp-para">${o.celPara(x)}</td>
        ${comDesc ? `<td class="num pp-v pp-desc">${ppDesc(x)}</td>` : ''}
        <td class="num pp-v pp-mrg">${ppMrg(x)}</td>${o.colExtra ? `<td class="num">${o.colExtra.td(x)}</td>` : ''}</tr>`).join('')}</tbody></table></div></div>`;
}

// ── Arredondamento (envio e aprovação) ────────────────────────
// Para cima no múltiplo escolhido (R$ 1, 5, 10 ou 100), como no simulador; clicar de novo no ativo desliga.
let _ppArred = '0';
const arredPP = v => v != null && _ppArred !== '0' ? arredSim(v, +_ppArred) : v;
const htmlArredPP = fn => `<div class="pp-arred"><span><i class="fa-solid fa-coins"></i>Arredondar para cima</span><div class="seg">${ARRED_CMP.map(v =>
  `<button type="button" class="${_ppArred === v ? 'on' : ''}" title="Múltiplo de R$ ${v},00 · clique de novo para não arredondar" onclick="${fn}('${v}')">R$ ${v},00</button>`).join('')}</div></div>`;

// Chave UniLab só onde se aplica: o valor proposto difere do que está hoje no sistema do laboratório
const precisaVs = (cx, k, para) => sistemaSuportado(cx) && precoDifere(cx.sistema(k), para ?? null);

// ── Vista analítica × sintética ───────────────────────────────
// Analítica: quadro completo por tabela (indicadores, Particular, custo, desconto, margem).
// Sintética: uma linha por exame, só o essencial; com várias tabelas, uma coluna por tabela.
let _ppVista = (() => { try { return localStorage.getItem('ppVista') || 'analitico'; } catch { return 'analitico'; } })();
const ppSint = () => _ppVista === 'sintetico';
const htmlVistaPP = fn => `<div class="seg pp-vista">${[['analitico', 'Analítico', 'fa-table-cells'], ['sintetico', 'Sintético', 'fa-list']].map(([v, t, ic]) =>
  `<button type="button" class="${_ppVista === v ? 'on' : ''}" onclick="trocarVistaPP('${v}', ${fn})"><i class="fa-solid ${ic}"></i>${t}</button>`).join('')}</div>`;
function trocarVistaPP(v, fn) {
  if (_ppVista === v) return;
  _ppVista = v;
  try { localStorage.setItem('ppVista', v); } catch {}
  fn();
}
// Mesmo contrato de htmlQuadroProposta: escolhe o formato pela vista
const quadroPP = (cx, ls, o) => ppSint() ? htmlSintetico([{ cx, itens: ls, nome: o.nome }], o) : htmlQuadroProposta(cx, ls, o);

// Margem e desconto do valor, numa linha curta (vermelho = abaixo do piso / acima do desconto máximo)
const sintInfo = x => [x.c?.margem != null ? `<span class="${x.c.status === 'r' ? 'r' : ''}">marg. ${pct(x.c.margem)}</span>` : x.c?.semCusto ? (pode('exames', 'editar') ? '<button type="button" class="gx-sc pp-sc" title="Exame sem custo: clique para informar" onclick="ppCusto(this)">+ sem custo</button>' : '<span>sem custo</span>') : '',
  x.desc != null ? `<span class="${acimaDescMax(x.desc, x.descMax, x.descTol) || x.desc < -0.0005 ? 'r' : ''}">desc. ${pct(x.desc)}</span>` : ''].filter(Boolean).join(' · ');
// Valor de um exame numa tabela, compacto: novo valor, o de antes e a variação; vermelho = abaixo do piso ou acima do desconto máximo
const sintCel = (x, cx) => {
  if (!x) return '<td class="num"><span class="muted">—</span></td>';
  const r = x.c?.status === 'r' || acimaDescMax(x.desc, x.descMax, x.descTol), d = x.de != null && x.para != null && x.de > 0 ? x.para / x.de - 1 : null;
  const tit = [x.c?.margem != null ? `margem ${pct(x.c.margem)}` : '', x.desc != null ? `desconto ${pct(x.desc)}` : ''].filter(Boolean).join(' · ');
  return `<td class="num"><b class="${r ? 'r' : ''}" title="${tit}">${fmtOuFora(x.para, cx?.lab)}</b><small>${x.de != null ? `era ${fmt(x.de)}` : cx?.lab ? 'novo' : 'entra'}${d ? ` · <span class="${d > 0 ? 'delta-dn' : 'delta-up'}">${d > 0 ? '+' : ''}${pct(d)}</span>` : ''}</small>${sintInfo(x) ? `<small class="pp-sinf">${sintInfo(x)}</small>` : ''}</td>`;
};
// grupos: [{ cx, nome, itens, rot? }] · o: mesmas opções do quadro (colDe, colPara, celPara, marca, colExtra)
function htmlSintetico(grupos, o = {}) {
  const exCel = x => `<td class="pp-ex ${x.e && !o.semFicha ? 'lk' : ''}" ${x.e && !o.semFicha ? 'title="Abrir a ficha do exame" onclick="ppFicha(this)"' : ''}>${o.marcaEsq?.(x) || ''}<span class="mn">${esc(x.mn ?? '—')}</span>${o.marca?.(x) || ''}<small title="${esc(x.e?.descricao || '')}">${esc(x.e?.descricao || 'exame excluído')}</small></td>`;
  if (grupos.length === 1) {
    const { cx, itens } = grupos[0], comDesc = cx && !cx.base && !!cx.ref;
    return `<div class="pp-q pp-sint"><div class="tbl-wrap"><table class="pp-tab"><thead><tr><th>Exame</th><th class="num">${o.colDe || 'Antes'}</th><th class="num">${o.colPara || 'Proposto'}</th>${comDesc ? '<th class="num">Desconto</th>' : ''}<th class="num">Margem</th>${o.colExtra ? `<th class="num">${o.colExtra.th}</th>` : ''}</tr></thead>
      <tbody>${itens.map(x => `<tr data-k="${esc(x.k)}">${exCel(x)}<td class="num">${fmtOuFora(x.de, cx?.lab)}</td>
        <td class="num pp-para">${o.celPara ? o.celPara(x) : `<b>${fmtOuFora(x.para, cx?.lab)}</b>${ppVar(x)}`}</td>
        ${comDesc ? `<td class="num pp-v pp-desc">${ppDesc(x)}</td>` : ''}<td class="num pp-v pp-mrg">${ppMrg(x)}</td>${o.colExtra ? `<td class="num">${o.colExtra.td(x)}</td>` : ''}</tr>`).join('')}</tbody></table></div></div>`;
  }
  const ks = [], por = {};
  grupos.forEach((g, gi) => g.itens.forEach(x => { if (!por[x.k]) { por[x.k] = { x, c: {} }; ks.push(x.k); } por[x.k].c[gi] = x; }));
  ks.sort((a, b) => String(por[a].x.mn).localeCompare(String(por[b].x.mn)));
  return `<div class="pp-q pp-sint"><div class="tbl-wrap"><table class="pp-tab"><thead><tr><th>Exame</th>${grupos.map(g =>
      `<th class="num pp-sth" title="${esc(g.nome || g.cx?.nome || '(removida)')}"><i class="fa-solid ${g.cx?.icone || 'fa-table-list'}" style="color:${g.cx?.cor || 'var(--gray)'}"></i><span>${esc(g.nome || g.cx?.nome || '(removida)')}</span>${g.rot || ''}</th>`).join('')}</tr></thead>
    <tbody>${ks.map(k => `<tr data-k="${esc(k)}">${exCel(por[k].x)}${grupos.map((g, gi) => o.cel && por[k].c[gi] ? o.cel(por[k].c[gi], g) : sintCel(por[k].c[gi], g.cx)).join('')}</tr>`).join('')}</tbody></table></div></div>`;
}

// ── Envio ─────────────────────────────────────────────────────
async function abrirEnvioProposta(manter) {
  const cx = ctxAtual();
  const just = manter ? valorCampo('pp-just') : '', topo = manter ? document.getElementById('g-corpo')?.scrollTop || 0 : 0;
  if (!manter && !document.getElementById('gaveta-fantasma')) _ppArred = '0';
  _ppRascPart = true;
  limparRascTravado(cx);
  await gravarRasc(cx.alvo);
  if (!cx.base) await carregarRascunho('particular');
  const r = rasc(cx.alvo), s = resumoRasc(cx), aprova = pode('tabelas', 'aprovar');
  const itens = Object.entries(r).filter(([k]) => ESTADO.exames[k] && !propPendente(cx.alvo, k)).map(([k, v]) => linhaProposta(cx, k, cx.salvo(k) ?? null, arredPP(v ?? null)))
    .sort((a, b) => a.mn.localeCompare(b.mn));
  // ligado = valor ainda não lançado no sistema (padrão); mantém o marcado ao voltar da ficha
  const vs = pode('exames', 'editar') ? itens.filter(x => precisaVs(cx, x.k, x.para)) : [], podeVs = vs.length > 0;
  _envVs = Object.fromEntries(vs.map(x => [x.k, _envVs[x.k] ?? false]));
  abrirGaveta({
    larga: true, centro: true, sobre: 'Enviar proposta', titulo: cx.nome,
    meta: `<span class="tag"><i class="fa-solid fa-pen"></i>${s.n} alteração(ões)</span>${s.ab ? `<span class="tag" style="color:var(--red)"><i class="fa-solid fa-circle-xmark"></i>${s.ab} abaixo do ${cx.pisoNome}</span>` : ''}${s.dm ? `<span class="tag" style="color:var(--red)"><i class="fa-solid fa-ban"></i>${s.dm} acima do desc. máximo</span>` : ''}`,
    corpo: `
      ${s.ab ? `<div class="alert r"><i class="fa-solid fa-circle-xmark"></i><div>${s.ab} preço(s) ficam abaixo do ${cx.pisoNome} de ${cx.pisoTxt}.</div></div>` : ''}
      ${s.dm ? `<div class="alert r"><i class="fa-solid fa-ban"></i><div>${s.dm} preço(s) passam do desconto máximo de ${cx.dmaxTxt}.</div></div>` : ''}
      ${podeVs ? `<div class="hint" style="display:flex;align-items:center;gap:8px;margin:12px 0 0"><i class="fa-solid fa-clock-rotate-left" style="color:var(--red)"></i><span style="flex:1">UniLab: marque os exames cujo novo valor <b>já foi lançado</b> no sistema do laboratório. Ao publicar, a tabela do sistema no banco recebe esse valor.</span>
        <button class="btn sm" onclick="envVsTodos(true)"><i class="fa-solid fa-check-double"></i>Marcar todos</button><button class="btn sm" onclick="envVsTodos(null)"><i class="fa-solid fa-right-left"></i>Inverter</button></div>` : ''}
      <div class="pp-barra">${htmlVistaPP('() => abrirEnvioProposta(true)')}${htmlArredPP('arredEnvio')}</div>
      ${quadroPP(cx, itens, { colDe: 'Atual', colPara: 'Proposto', celPara: x => `<b>${fmtOuFora(x.para, cx.lab)}</b>${ppVar(x)}`,
        colExtra: podeVs ? { th: 'UniLab', td: x => x.k in _envVs ? `<span data-vs="${esc(x.k)}">${chave(_envVs[x.k], `envVs('${esc(x.k)}')`)}</span>` : '<span class="muted" title="Valor proposto igual ao do UniLab">—</span>' } : null })}
      <div class="just"><label for="pp-just">Justificativa <span class="muted">(opcional)</span></label>
        <textarea id="pp-just" placeholder="Motivo do reajuste, negociação, concorrência…">${esc(just)}</textarea></div>
      ${aprova ? '' : '<div class="hint" style="margin-top:8px"><i class="fa-solid fa-circle-info"></i> Os preços passam a valer quando alguém com permissão de aprovação aprovar a proposta.</div>'}`,
    rodape: `<button class="btn" style="margin-right:auto" onclick="fecharGaveta()">Voltar</button>
      <button class="btn ${aprova ? '' : 'pri'}" onclick="enviarProposta(false)"><i class="fa-solid fa-paper-plane"></i>Enviar para aprovação</button>
      ${aprova ? `<button class="btn pri" onclick="enviarProposta(true)"><i class="fa-solid fa-stamp"></i>Aprovar e publicar</button>` : ''}`
  });
  if (topo) document.getElementById('g-corpo').scrollTop = topo;
}
function arredEnvio(v) {
  _ppArred = _ppArred === v ? '0' : v;
  abrirEnvioProposta(true);
}

// Chave "Valor sistema" no envio e na aprovação (_envVs: chave → ligado = já atualizado no sistema).
// Ligado vira it.sistemaOk: ao publicar, o preço do sistema no banco recebe o valor publicado.
let _envVs = {};
function envVs(k, v) {
  _envVs[k] = v ?? !_envVs[k];
  document.querySelector(`[data-vs="${CSS.escape(k)}"] .switch`)?.classList.toggle('on', _envVs[k]);
}
const envVsTodos = v => Object.keys(_envVs).forEach(k => envVs(k, v ?? !_envVs[k]));
// Antes de publicar (qualquer janela): exames cujo valor a publicar difere do salvo no UniLab, para marcar
// os que já foram lançados lá. Nenhum divergente (ou sem permissão de editar exames): publica direto, sem janela.
// ls: [{ alvo, k, mn, para }] → Set de 'alvo|k' marcados · null = voltou sem publicar
let _uniVs = {};
function uniVs(kv, v) {
  _uniVs[kv] = v ?? !_uniVs[kv];
  document.querySelector(`[data-uv="${CSS.escape(kv)}"] .switch`)?.classList.toggle('on', _uniVs[kv]);
}
const uniVsTodos = v => Object.keys(_uniVs).forEach(kv => uniVs(kv, v ?? !_uniVs[kv]));
async function perguntarUnilab(ls, botao = 'Publicar') {
  if (!pode('exames', 'editar')) return new Set();
  const div = ls.map(x => ({ ...x, cx: ctxAlvo(x.alvo) })).filter(x => x.cx && ESTADO.exames[x.k] && precisaVs(x.cx, x.k, x.para ?? null));
  if (!div.length) return new Set();
  const varias = new Set(div.map(x => x.alvo)).size > 1, v = x => x != null ? fmt(x) : 'sem valor';
  _uniVs = Object.fromEntries(div.map(x => [`${x.alvo}|${x.k}`, false]));
  const r = await confirmar({ titulo: 'Valor atualizado no UniLab?', icone: 'fa-clock-rotate-left', botao, cancelar: 'Voltar',
    texto: `${div.length} exame(s) ficam com valor diferente do UniLab. Marque os que <b>já foram lançados</b> lá: a tabela do sistema no banco recebe o valor publicado. Os desmarcados ficam pendentes nas notificações (Atualizar no UniLab).
      <span style="display:flex;gap:6px;justify-content:center;margin:10px 0"><button type="button" class="btn sm" onclick="uniVsTodos(true)"><i class="fa-solid fa-check-double"></i>Marcar todos</button><button type="button" class="btn sm" onclick="uniVsTodos(null)"><i class="fa-solid fa-right-left"></i>Inverter</button></span>
      <span class="fx-conf" style="max-height:260px;overflow:auto">${div.map(x => { const kv = `${x.alvo}|${x.k}`;
        return `<span data-uv="${esc(kv)}" style="align-items:center"><b>${esc(x.mn || ESTADO.exames[x.k].mn)}${varias ? ` · ${esc(x.cx.nome)}` : ''}</b><i>UniLab ${v(x.cx.sistema(x.k))} → <b>${x.para != null ? fmt(x.para) : 'retirar'}</b></i>${chave(false, `uniVs('${esc(kv)}')`)}</span>`; }).join('')}</span>` });
  const marc = new Set(Object.keys(_uniVs).filter(kv => _uniVs[kv]));
  _uniVs = {};
  return r === true ? marc : null;
}

async function enviarProposta(publicar) {
  const cx = ctxAtual(), r = rasc(cx.alvo), u = usuarioAtual();
  let marc = new Set();
  if (publicar) {
    // já marcados na janela de envio não voltam a ser perguntados
    marc = await perguntarUnilab(Object.entries(r).filter(([k]) => ESTADO.exames[k] && !propPendente(cx.alvo, k) && _envVs[k] !== true)
      .map(([k, v]) => ({ alvo: cx.alvo, k, mn: ESTADO.exames[k].mn, para: arredPP(v ?? null) })));
    if (!marc) return;
  }
  const just = valorCampo('pp-just').trim();
  const itens = {};
  Object.entries(r).forEach(([k, v]) => {
    const e = ESTADO.exames[k];
    if (e && !propPendente(cx.alvo, k)) itens[k] = { mn: e.mn, de: cx.salvo(k) ?? null, para: arredPP(v ?? null), sistemaOk: sistemaSuportado(cx) && (_envVs[k] === true || marc.has(`${cx.alvo}|${k}`)) || null };
  });
  const n = Object.keys(itens).length;
  if (!n) return toast('Nada para enviar', 'erro');
  const id = DB.novaChave('propostas');
  const p = { alvo: cx.alvo, alvoNome: cx.nome, itens, n, justificativa: just || null, autor: u.nome, autorId: u.id, em: Date.now(), status: 'pendente' };
  await DB.gravar(`propostas/${id}`, { ...p, em: DB.agora() });
  await limparRasc(cx.alvo);
  _envVs = {}; _ppArred = '0';
  if (publicar) await aplicarProposta(id, p);
  else registrar('tabelas', `${cx.nome}: proposta com ${n} preço(s) enviada`, { proposta: id });
  fecharGaveta();
  toast(publicar ? `${n} preço(s) publicados em ${cx.nome}` : `Proposta enviada: ${n} preço(s) aguardando aprovação`);
  renderTabelas();
}

// Grava os preços da proposta e marca como aprovada
async function aplicarProposta(id, p) {
  const cx = ctxAlvo(p.alvo);
  if (!cx) throw new Error('Tabela da proposta não existe mais');
  const u = usuarioAtual(), agora = DB.agora(), upd = {};
  let n = 0;
  Object.entries(p.itens || {}).forEach(([k, it]) => {
    if (!ESTADO.exames[k]) return;
    const para = it.para ?? null;
    if (cx.base) {
      if (para == null) return;
      upd[`${CAMINHOS.exames}/${k}/precoPraticado`] = para;
      upd[`${CAMINHOS.exames}/${k}/atualizadoEm`] = agora;
      upd[`${CAMINHOS.exames}/${k}/atualizadoPor`] = u.nome;
    } else if (cx.lab) upd[`${cx.caminho}/${cx.id}/precos/${k}`] = para;
    else upd[`${CAMINHOS.tabelas}/${cx.id}/precos/${k}`] = para;
    if (it.sistemaOk && sistemaSuportado(cx)) upd[caminhoSistema(p.alvo, k)] = para;
    upd[`historicoExames/${k}/${DB.novaChave('historicoExames')}`] = {
      descricao: `${cx.nome}: ${it.de != null ? fmt(it.de) : cx.lab ? 'sem valor' : 'fora da tabela'} → ${para != null ? fmt(para) : cx.lab ? 'valor removido' : 'retirado da tabela'}${it.revisado ? ` (revisado na aprovação; proposto ${it.proposto != null ? fmt(it.proposto) : 'retirar'})` : ''}`,
      justificativa: p.justificativa || null, proposta: id, usuario: u.nome, usuarioId: u.id, em: agora
    };
    n++;
  });
  upd[`propostas/${id}/status`] = 'aprovada';
  upd[`propostas/${id}/decisao`] = { por: u.nome, porId: u.id, em: agora };
  await DB.mesclar('/', upd);
  registrar('tabelas', `${cx.nome}: ${n} preço(s) publicados (proposta de ${p.autor})`, { proposta: id });
  return n;
}

// ── Lista ─────────────────────────────────────────────────────
// Pendentes: uma linha por proposta (cada tabela é aprovada à parte).
// Histórico: decididas agrupadas em lotes (mesmo envio, várias tabelas). Sem "lote" (dados antigos):
// mesmo autor e justificativa, enviadas com até 2 min de diferença.
// filtrar: só as tabelas do filtro "Tabela" ficam visíveis (contagens refeitas; lote sem nenhuma some)
// pend: pendentes agrupadas só pelo lote (cada envio do rascunho de exames vira uma linha)
function lotesHistorico(filtrar, pend) {
  const g = [], porLote = {};
  lista(ESTADO.propostas, (a, b) => (b.em || 0) - (a.em || 0)).filter(p => (p.status === 'pendente') === !!pend).forEach(p => {
    let L = p.lote ? porLote[p.lote] : pend ? null : g.find(l => !l.lote && l.autorId === p.autorId && (l.justificativa || '') === (p.justificativa || '') && Math.abs(l.ult - (p.em || 0)) < 120000);
    if (!L) { L = { id: p.lote || p.id, lote: p.lote || null, autor: p.autor, autorId: p.autorId, em: p.em || 0, ult: p.em || 0, justificativa: p.justificativa, ps: [] }; g.push(L); if (p.lote) porLote[p.lote] = L; }
    L.ult = p.em || 0;
    L.ps.push(p);
  });
  if (filtrar) g.forEach(L => { L.ps = L.ps.filter(p => passaPop('pop-prop-tab', p.alvo)); });
  for (let i = g.length - 1; i >= 0; i--) if (!g[i].ps.length) g.splice(i, 1);
  g.forEach(L => {
    const sts = new Set(L.ps.map(p => p.status));
    L.status = sts.size === 1 ? L.ps[0].status : null;
    L.n = L.ps.reduce((s, p) => s + (p.n || Object.keys(p.itens || {}).length), 0);
    const c = { e: 0, s: 0, up: 0, dn: 0 };
    L.ps.forEach(p => Object.values(p.itens || {}).forEach(it => { if (it.de == null) c.e++; else if (it.para == null) c.s++; else if (it.para > it.de) c.up++; else if (it.para < it.de) c.dn++; }));
    L.cont = c;
  });
  return g;
}
const badgeSt = s => { const st = ST_PROPOSTA[s] || ST_PROPOSTA.pendente; return `<span class="badge-s ${st.cls}"><i class="fa-solid ${st.icone}"></i>${st.nome}</span>`; };
const tagAlvo = p => { const a = alvoInfo(p.alvo); return `<span class="tag"><i class="fa-solid ${a.icone}" style="color:${a.cor}"></i>${esc(p.alvoNome || a.nome)}</span>`; };
const resumoMudancas = c => [c.up && `<span class="delta-dn" title="Sobem"><i class="fa-solid fa-arrow-up"></i> ${c.up}</span>`, c.dn && `<span class="delta-up" title="Descem"><i class="fa-solid fa-arrow-down"></i> ${c.dn}</span>`,
  c.e && `<span title="Entram"><i class="fa-solid fa-plus"></i> ${c.e}</span>`, c.s && `<span class="muted" title="Saem"><i class="fa-solid fa-minus"></i> ${c.s}</span>`].filter(Boolean).join(' &nbsp;') || '—';

function desenharPropostas() {
  const el = document.getElementById('tabelas-propostas');
  if (propFiltro !== 'pendente') propFiltro = 'historico';
  const pend = lotesHistorico(false, true);
  const lotes = lotesHistorico();
  const hist = propFiltro === 'historico';
  const chips = `<div class="chips" style="padding-bottom:12px;align-items:center">
    <button class="chip ${propFiltro === 'pendente' ? 'on' : ''}" onclick="propFiltro='pendente';desenharPropostas()"><i class="fa-solid fa-hourglass-half"></i>Pendentes <b>${pend.length}</b></button>
    <button class="chip ${hist ? 'on' : ''}" onclick="propFiltro='historico';desenharPropostas()"><i class="fa-solid fa-clock-rotate-left"></i>Histórico <b>${lotes.length}</b></button>
    ${hist ? '<span style="flex:1"></span><div id="pop-prop-tab"></div><div id="pop-prop-autor"></div>' : ''}</div>`;
  el.innerHTML = `<div class="card">${chips}<div class="tbl-wrap" id="prop-corpo"></div></div>`;
  if (hist) {
    // contagem por lote: tabelas e autores presentes no histórico
    const conta = f => { const c = {}; lotes.forEach(L => new Set(f(L)).forEach(v => { c[v] = (c[v] || 0) + 1; })); return c; };
    const cT = conta(L => L.ps.map(p => p.alvo)), cA = conta(L => [L.autorId || L.autor]);
    const nomeT = {}, nomeA = {};
    lotes.forEach(L => { L.ps.forEach(p => { nomeT[p.alvo] = p.alvoNome || alvoInfo(p.alvo).nome; }); nomeA[L.autorId || L.autor] = L.autor; });
    criarPop('pop-prop-tab', { rotulo: 'Tabela', icone: 'fa-table', multi: true, limpavel: true, busca: 'Buscar tabela',
      opcoes: () => [{ valor: '', rotulo: 'Todas as tabelas', icone: 'fa-table-cells', qtd: lotes.length },
        ...Object.keys(cT).map(v => { const a = alvoInfo(v); return { valor: v, rotulo: nomeT[v], icone: a.icone, cor: a.cor, qtd: cT[v] }; })
        .sort((a, b) => a.rotulo.localeCompare(b.rotulo))],
      aoMudar: desenharCorpoPropostas });
    criarPop('pop-prop-autor', { rotulo: 'Autor', icone: 'fa-user', multi: true, limpavel: true, busca: 'Buscar autor',
      opcoes: () => Object.keys(cA).map(v => ({ valor: v, rotulo: nomeA[v] || '—', icone: 'fa-user', qtd: cA[v] })).sort((a, b) => a.rotulo.localeCompare(b.rotulo)),
      aoMudar: desenharCorpoPropostas });
  }
  desenharCorpoPropostas();
}

// Corpo da lista (separado para os filtros redesenharem sem recriar os popovers)
function desenharCorpoPropostas() {
  const el = document.getElementById('prop-corpo');
  if (!el) return;
  const pend = lotesHistorico(false, true);
  const tabs = valorPop('pop-prop-tab'), aut = valorPop('pop-prop-autor');
  const lotes = propFiltro === 'pendente' ? [] : lotesHistorico(true).filter(L => passaPop('pop-prop-autor', L.autorId || L.autor));
  el.innerHTML = propFiltro === 'pendente'
    ? `<table><thead><tr><th>Enviada em</th><th>Tabela</th><th>Autor</th><th class="num">Preços</th><th>Justificativa</th><th></th></tr></thead>
      <tbody>${pend.map(L => `<tr class="row" onclick="${L.ps.length === 1 ? `abrirProposta('${L.ps[0].id}')` : `abrirLote('${L.id}', true)`}">
        <td>${dataHora(L.em)}</td><td><div style="display:flex;flex-wrap:wrap;gap:4px">${L.ps.map(tagAlvo).join('')}</div></td><td>${esc(L.autor)}</td><td class="num">${num(L.n, 0)}</td>
        <td class="desc" title="${esc(L.justificativa || '')}">${esc(L.justificativa || '—')}</td>
        <td class="acts"><button title="Abrir"><i class="fa-solid fa-chevron-right"></i></button></td></tr>`).join('')
        || `<tr><td colspan="6">${vazio('fa-stamp', 'Nenhuma proposta aguardando aprovação')}</td></tr>`}</tbody></table>`
    : `<table><thead><tr><th>Enviado em</th><th>Tabelas</th><th>Autor</th><th class="num">Preços</th><th>Alterações</th><th>Justificativa</th><th>Situação</th><th></th></tr></thead>
      <tbody>${lotes.map(L => `<tr class="row" onclick="abrirLote('${L.id}')">
        <td>${dataHora(L.em)}</td><td><div style="display:flex;flex-wrap:wrap;gap:4px">${L.ps.filter((p, i) => L.ps.findIndex(q => q.alvo === p.alvo) === i).map(tagAlvo).join('')}</div></td>
        <td>${esc(L.autor)}</td><td class="num">${num(L.n, 0)}</td><td style="white-space:nowrap">${resumoMudancas(L.cont)}</td>
        <td class="desc" title="${esc(L.justificativa || '')}">${esc(L.justificativa || '—')}</td>
        <td>${L.status ? badgeSt(L.status) : '<span class="badge-s warn"><i class="fa-solid fa-layer-group"></i>Misto</span>'}</td>
        <td class="acts"><button title="Abrir"><i class="fa-solid fa-chevron-right"></i></button></td></tr>`).join('')
        || `<tr><td colspan="8">${vazio('fa-clock-rotate-left', tabs.length || aut.length ? 'Nenhum lote com esses filtros' : 'Nenhuma alteração decidida ainda')}</td></tr>`}</tbody></table>`;
}

// Lote do histórico: todas as tabelas alteradas juntas, cada uma com sua decisão
function abrirLote(id, pend) {
  const L = pend ? lotesHistorico(false, true).find(l => l.id === id) : lotesHistorico(true).find(l => l.id === id);
  if (!L) return;
  _ppRascPart = false;
  if (L.ps.length === 1) return abrirProposta(L.ps[0].id);
  L.ps.sort((a, b) => String(a.alvoNome).localeCompare(String(b.alvoNome)));
  const marca = x => x.de == null ? ' <span class="tag" style="color:var(--green)">entra</span>' : x.para == null ? ' <span class="tag" style="color:var(--red)">sai</span>'
    : x.para > x.de ? ' <i class="fa-solid fa-arrow-up delta-dn"></i>' : x.para < x.de ? ' <i class="fa-solid fa-arrow-down delta-up"></i>' : '';
  // propostas da mesma tabela (e mesma decisão) num quadro só
  const grupos = [];
  L.ps.forEach(p => {
    const g = grupos.find(x => x.alvo === p.alvo && x.status === p.status);
    if (g) { g.ids.push(p.id); Object.assign(g.itens, p.itens); } else grupos.push({ ...p, ids: [p.id], itens: { ...p.itens } });
  });
  grupos.forEach(p => {
    p.cx = ctxAlvo(p.alvo);
    p.ls = Object.entries(p.itens || {}).map(([k, it]) => Object.assign(linhaProposta(p.cx, k, it.de ?? null, it.para ?? null), { it, mn: it.mn }))
      .sort((a, b) => String(a.mn).localeCompare(String(b.mn)));
  });
  const quadros = ppSint() ? htmlSintetico(grupos.map(p => ({ cx: p.cx, nome: p.alvoNome, itens: p.ls, rot: p.status !== 'aprovada' ? ` <small>${ST_PROPOSTA[p.status]?.nome || ''}</small>` : '' })))
    : grupos.map(p => {
    const cx = p.cx, itens = p.ls;
    return `<div style="margin-top:16px"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">${badgeSt(p.status)}
        ${p.decisao ? `<small class="muted">por ${esc(p.decisao.por)} em ${dataHora(p.decisao.em)}${p.decisao.motivo ? ` · ${esc(p.decisao.motivo)}` : ''}</small>` : ''}
        ${p.ids.length === 1 ? `<a href="#" style="margin-left:auto;font-size:12px" onclick="abrirProposta('${p.id}');return false">detalhe <i class="fa-solid fa-chevron-right"></i></a>` : `<small class="muted" style="margin-left:auto">${p.ids.length} envios</small>`}</div>
      ${htmlQuadroProposta(cx, itens, { nome: p.alvoNome, colDe: 'Antes', colPara: p.status === 'aprovada' ? 'Publicado' : 'Proposto', marca,
        celPara: x => `${x.it.revisado ? `<s class="muted">${fmtOuFora(x.it.proposto, cx?.lab)}</s> ` : ''}<b>${fmtOuFora(x.para, cx?.lab)}</b>${ppVar(x)}` })}</div>`;
  }).join('');
  abrirGaveta({
    larga: true, centro: true, sobre: `Histórico · ${dataHora(L.em)}`, titulo: `${new Set(L.ps.map(p => p.alvo)).size} tabela(s) alterada(s)`,
    meta: `${L.status ? badgeSt(L.status) : ''}<span class="tag"><i class="fa-solid fa-user"></i>${esc(L.autor)}</span><span class="tag"><i class="fa-solid fa-tag"></i>${L.n} preço(s)</span><span class="tag">${resumoMudancas(L.cont)}</span>`,
    corpo: `${L.justificativa ? `<div class="pp-just"><i class="fa-solid fa-quote-left"></i><div><span>Justificativa · ${esc(L.autor)}</span><p>${esc(L.justificativa)}</p></div></div>` : ''}
      ${pend ? `<div class="hint" style="margin:12px 0 0"><i class="fa-solid fa-layer-group"></i> Enviadas juntas: aprove o lote inteiro ou abra o <b>detalhe</b> de uma tabela para revisar, editar ou rejeitar só ela.</div>` : ''}
      <div class="pp-barra">${htmlVistaPP(`() => abrirLote('${id}', ${!!pend})`)}</div>${quadros}`,
    rodape: pend && pode('tabelas', 'aprovar') ? `<button class="btn" style="margin-right:auto" onclick="fecharGaveta()">Fechar</button>
      <button class="btn pri" onclick="aprovarLote('${id}')"><i class="fa-solid fa-stamp"></i>Aprovar lote (${L.ps.length} tabelas)</button>`
      : `${L.ps.every(podeReverterProp) ? `<button class="btn perigo-txt" style="margin-right:auto" onclick="reverterPropostas(${esc(JSON.stringify(L.ps.map(p => p.id)))})" title="Volta os preços ao valor de antes e marca como cancelada"><i class="fa-solid fa-clock-rotate-left"></i>Reverter</button>` : ''}${L.ps.every(podeExcluirProp) ? `<button class="btn perigo-txt" style="margin-right:auto" onclick="excluirPropostas(${esc(JSON.stringify(L.ps.map(p => p.id)))})"><i class="fa-solid fa-trash"></i>Excluir do histórico</button>` : ''}<button class="btn" onclick="fecharGaveta()">Fechar</button>`
  });
}

// ── Detalhe ───────────────────────────────────────────────────
// Quem aprova pode revisar o valor proposto antes de publicar (_propRev: chave → valor)
let _propRev = {}, _propId = null;

function abrirProposta(id) {
  const p = ESTADO.propostas[id];
  if (!p) return;
  const cx = ctxAlvo(p.alvo), st = ST_PROPOSTA[p.status] || ST_PROPOSTA.pendente, u = usuarioAtual();
  const pendente = p.status === 'pendente', aprova = pode('tabelas', 'aprovar'), autor = p.autorId === u.id;
  const revisa = pendente && aprova && !!cx;
  if (_propId !== id) _ppArred = '0';
  _propRev = {}; _propId = id; _propEd = null; _ppRascPart = false;
  const nRev = Object.values(p.itens || {}).filter(it => it.revisado).length;
  let conflitos = 0, abaixo = 0;
  const itens = Object.entries(p.itens || {}).map(([k, it]) => {
    const e = ESTADO.exames[k], atual = cx && e ? cx.salvo(k) : null;
    const mudou = pendente && cx && e && (atual ?? null) !== (it.de ?? null);
    if (mudou) conflitos++;
    const x = Object.assign(linhaProposta(cx, k, (pendente ? atual : it.de) ?? null, it.para ?? null), { it, mudou, mn: it.mn });
    if (x.c?.status === 'r') abaixo++;
    return x;
  }).sort((a, b) => String(a.mn).localeCompare(String(b.mn)));
  abrirGaveta({
    larga: true, centro: true, sobre: `Proposta · ${dataHora(p.em)}`, titulo: p.alvoNome || cx?.nome || 'Proposta',
    meta: `<span class="badge-s ${st.cls}"><i class="fa-solid ${st.icone}"></i>${st.nome}</span><span class="tag"><i class="fa-solid fa-user"></i>${esc(p.autor)}</span><span class="tag"><i class="fa-solid fa-tag"></i>${itens.length} preço(s)</span>${p.editadaEm ? `<span class="tag" title="Editada por ${esc(p.editadaPor || '')} em ${dataHora(p.editadaEm)}"><i class="fa-solid fa-pen"></i>editada</span>` : ''}`,
    corpo: `
      ${!cx ? '<div class="alert r"><i class="fa-solid fa-circle-xmark"></i><div>A tabela desta proposta foi excluída.</div></div>' : ''}
      ${p.decisao ? `<div class="alert ${p.status === 'aprovada' ? 'x' : 'a'}"><i class="fa-solid ${st.icone}"></i><div><b>${st.nome}</b> por ${esc(p.decisao.por)} em ${dataHora(p.decisao.em)}${p.decisao.motivo ? `<br>${esc(p.decisao.motivo)}` : ''}${p.decisao.revertida ? `<br><i class="fa-solid fa-clock-rotate-left"></i> Aprovada e depois revertida por ${esc(p.decisao.revertida.por)} em ${dataHora(p.decisao.revertida.em)}` : ''}</div></div>` : ''}
      ${conflitos ? `<div class="alert a"><i class="fa-solid fa-triangle-exclamation"></i><div>${conflitos} preço(s) mudaram desde o envio (coluna "Tabela UniLab"). Ao aprovar, vale o valor proposto.</div></div>` : ''}
      <div id="pp-abaixo">${abaixo ? `<div class="alert r"><i class="fa-solid fa-circle-xmark"></i><div>${abaixo} preço(s) abaixo do ${cx?.pisoNome || 'piso'}.</div></div>` : ''}</div>
      ${nRev ? `<div class="alert x"><i class="fa-solid fa-pen"></i><div>${nRev} valor(es) revisado(s) na aprovação (riscado = valor proposto).</div></div>` : ''}
      ${p.justificativa ? `<div class="pp-just"><i class="fa-solid fa-quote-left"></i><div><span>Justificativa · ${esc(p.autor)}</span><p>${esc(p.justificativa)}</p></div></div>` : ''}
      ${revisa ? `<div class="hint" style="margin:14px 0 0"><i class="fa-solid fa-pen"></i> Ajuste o valor proposto, se precisar: ao aprovar, vale o valor revisado.</div><div id="pp-arred-w">${htmlArredPP('arredAprov')}</div>` : ''}
      <div class="pp-barra">${htmlVistaPP('atualizarPropostaAberta')}</div>
      ${quadroPP(cx, itens, {
        nome: p.alvoNome, colDe: pendente ? 'Tabela UniLab' : 'Antes', colPara: p.status === 'aprovada' ? 'Publicado' : 'Proposto',
        marca: x => x.mudou ? ` <i class="fa-solid fa-triangle-exclamation" style="color:var(--amber)" title="Mudou desde o envio: era ${x.it.de != null ? fmt(x.it.de) : 'fora'}"></i>` : '',
        celPara: x => revisa && x.e ? `<div class="price-in"><span>R$</span><input type="text" inputmode="numeric" autocomplete="off" value="${moedaCampo(x.para)}" placeholder="${cx.base ? '' : cx.lab ? 'sem valor' : 'fora'}" oninput="mascaraMoeda(this);revisarItem(this)" onfocus="this.select()"></div><div class="pp-var">${ppVar(x)}</div><div class="delta"></div>`
          : `${x.it.revisado ? `<s class="muted">${fmtOuFora(x.it.proposto, cx?.lab)}</s> ` : ''}<b>${fmtOuFora(x.para, cx?.lab)}</b>${ppVar(x)}`
      })}
      ${pendente && aprova ? `<div class="just"><label for="pp-motivo">Observação da decisão <span class="muted">(obrigatória para rejeitar)</span></label><textarea id="pp-motivo"></textarea></div>` : ''}`,
    rodape: `${!pendente && autor && cx ? `<button class="btn" style="margin-right:auto" onclick="reabrirProposta('${id}')" title="Carrega os preços no seu rascunho"><i class="fa-solid fa-pen"></i>Editar de novo</button>` : pendente && cx && (autor || aprova) && pode('tabelas', 'editar') ? `<button class="btn" style="margin-right:auto" onclick="editarProposta('${id}')" title="Retificar valores, incluir ou tirar exames e alterar a justificativa"><i class="fa-solid fa-pen"></i>Editar</button>` : '<span style="margin-right:auto"></span>'}
      ${pendente && autor ? `<button class="btn perigo-txt" onclick="decidirProposta('${id}','cancelada')"><i class="fa-solid fa-ban"></i>Cancelar</button>` : ''}
      ${podeReverterProp(p) ? `<button class="btn perigo-txt" onclick="reverterPropostas(['${id}'])" title="Volta os preços ao valor de antes e marca como cancelada"><i class="fa-solid fa-clock-rotate-left"></i>Reverter</button>` : ''}
      ${podeExcluirProp(p) ? `<button class="btn perigo-txt" onclick="excluirPropostas(['${id}'])" title="Excluir do histórico"><i class="fa-solid fa-trash"></i></button>` : ''}
      ${pendente && aprova ? `<button class="btn perigo-txt" onclick="decidirProposta('${id}','rejeitada')"><i class="fa-solid fa-circle-xmark"></i>Rejeitar</button>
        <button class="btn pri" id="pp-aprovar" ${cx ? '' : 'disabled'} onclick="decidirProposta('${id}','aprovada')"><i class="fa-solid fa-stamp"></i>Aprovar e publicar</button>` : `<button class="btn" onclick="fecharGaveta()">Fechar</button>`}`
  });
}

// Dados mudaram com a proposta aberta (Particular, custos, outra proposta…): recalcula sem perder
// os valores revisados nem a observação. Com um campo em edição, só os números das linhas.
function atualizarPropostaAberta() {
  const corpo = document.getElementById('g-corpo');
  if (_propEd && document.getElementById('pe-q')) {
    if (ESTADO.propostas[_propEd.id]?.status !== 'pendente') { const id = _propEd.id; _propEd = null; toast('A proposta foi decidida por outra pessoa', 'erro'); return abrirProposta(id); }
    if (!corpo.contains(document.activeElement)) desenharEdicaoProposta();
    return;
  }
  if (!_propId || !document.getElementById('pp-abaixo') || !ESTADO.propostas[_propId]) return;
  const foco = document.activeElement;
  if (foco && corpo?.contains(foco) && /INPUT|TEXTAREA/.test(foco.tagName)) {
    document.querySelectorAll('#g-corpo .pp-tab tr input').forEach(revisarItem);
    return;
  }
  const rev = { ..._propRev }, txt = valorCampo('pp-motivo'), topo = corpo?.scrollTop || 0;
  abrirProposta(_propId);
  const campo = document.getElementById('pp-motivo');
  if (campo) campo.value = txt;
  Object.entries(rev).forEach(([k, val]) => {
    const inp = [...document.querySelectorAll('#g-corpo .pp-tab tr')].find(tr => tr.dataset.k === k)?.querySelector('input');
    if (inp) { inp.value = moedaCampo(val); revisarItem(inp); }
  });
  const novo = document.getElementById('g-corpo');
  if (novo) novo.scrollTop = topo;
}

// ── Edição da proposta pendente ───────────────────────────────
// Autor (ou quem aprova) retifica valores, inclui ou tira exames e altera a justificativa.
// _propEd: { id, itens: cópia editável, just }
let _propEd = null, _peSug = [];

function editarProposta(id) {
  const p = ESTADO.propostas[id];
  if (!p || p.status !== 'pendente') return toast('Proposta já decidida', 'erro');
  _propEd = { id, just: p.justificativa || '', itens: JSON.parse(JSON.stringify(p.itens || {})), sis: {} };
  _ppRascPart = false;
  const cx = ctxAlvo(p.alvo);
  if (cx?.tabela) Object.entries(_propEd.itens).forEach(([k, it]) => { if (it.para != null && cx.salvo(k) == null && !precoDifere(cx.sistema(k), it.para)) _propEd.sis[k] = true; });
  desenharEdicaoProposta();
}

const peLinhas = cx => Object.entries(_propEd.itens).map(([k, it]) => Object.assign(linhaProposta(cx, k, cx.salvo(k) ?? null, it.para ?? null), { it, mn: it.mn }))
  .sort((a, b) => String(a.mn).localeCompare(String(b.mn)));

function desenharEdicaoProposta(focoK) {
  const p = ESTADO.propostas[_propEd.id], cx = p && ctxAlvo(p.alvo);
  if (!cx) return;
  const aberta = !!document.getElementById('pe-q'), topo = aberta ? document.getElementById('g-corpo').scrollTop : 0, ls = peLinhas(cx);
  abrirGaveta({
    larga: true, centro: true, sobre: `Editar proposta · ${dataHora(p.em)}`, titulo: p.alvoNome || cx.nome,
    meta: `<span class="tag"><i class="fa-solid fa-user"></i>${esc(p.autor)}</span><span class="tag"><i class="fa-solid fa-tag"></i>${ls.length} preço(s)</span>`,
    corpo: `
      <div class="hint"><i class="fa-solid fa-pen"></i> Retifique os valores, inclua ou tire exames e ajuste a justificativa. Nada muda na proposta até salvar.</div>
      <div class="gx-busca" style="margin:12px 0"><div class="search"><i class="fa-solid fa-magnifying-glass"></i><input id="pe-q" placeholder="Adicionar exame: mnemônico ou nome…" autocomplete="off"
          oninput="peBuscar(this.value)" onfocus="peBuscar(this.value)" onkeydown="peTecla(event)" onblur="setTimeout(peFecharSug, 150)"></div>
        <div class="gx-sug" id="pe-sug"></div></div>
      <div class="pp-barra">${htmlVistaPP('() => desenharEdicaoProposta()')}</div>
      ${quadroPP(cx, ls, {
        nome: p.alvoNome, colDe: 'Tabela UniLab', colPara: 'Proposto',
        semFicha: true, // a ficha tomaria a gaveta e a edição em curso se perderia
        marca: () => ` <button type="button" class="gx-sc" style="color:var(--red)" title="Tirar o exame da proposta" onclick="peRemover(this)"><i class="fa-solid fa-xmark"></i>tirar</button>`,
        celPara: x => `<div class="price-in on"><span>R$</span><input type="text" inputmode="numeric" autocomplete="off" value="${moedaCampo(x.para)}" placeholder="${cx.base ? '' : cx.lab ? 'remover' : 'retirar'}" oninput="mascaraMoeda(this);peEditar(this)" onfocus="this.select()"></div><div class="pp-var">${ppVar(x)}</div>`,
        colExtra: pode('exames', 'editar') && sistemaSuportado(cx) ? { th: 'UniLab', td: x => peChaveSis(cx, x.k) } : null
      })}
      <div class="just"><label for="pe-just">Justificativa <span class="muted">(opcional)</span></label>
        <textarea id="pe-just" placeholder="Motivo do reajuste, negociação, concorrência…" oninput="_propEd.just=this.value">${esc(_propEd.just)}</textarea></div>`,
    rodape: `<button class="btn" style="margin-right:auto" onclick="abrirProposta('${_propEd.id}')">Voltar sem salvar</button>
      <button class="btn pri" onclick="salvarEdicaoProposta()"><i class="fa-solid fa-floppy-disk"></i>Salvar alterações</button>`
  });
  document.getElementById('g-corpo').scrollTop = topo;
  if (focoK) {
    const tr = [...document.querySelectorAll('#g-corpo .pp-tab tr')].find(t => t.dataset.k === focoK);
    tr?.scrollIntoView({ block: 'center' });
    tr?.querySelector('input')?.focus();
  }
}

function peEditar(inp) {
  const p = ESTADO.propostas[_propEd.id], cx = ctxAlvo(p.alvo), tr = inp.closest('tr'), k = tr.dataset.k, lido = lerMoeda(inp.value);
  const v = lido == null ? null : Math.round(lido * 100) / 100;
  if (v != null && (isNaN(v) || v < 0)) return;
  _propEd.itens[k].para = v;
  const x = linhaProposta(cx, k, cx.salvo(k) ?? null, v);
  tr.querySelector('.pp-var').innerHTML = ppVar(x);
  const tdDesc = tr.querySelector('.pp-desc');
  if (tdDesc) tdDesc.innerHTML = ppDesc(x);
  tr.querySelector('.pp-mrg').innerHTML = ppMrg(x);
  const sw = tr.querySelector('[data-pes]');
  if (sw) sw.outerHTML = peChaveSis(cx, k);
  const kpis = document.getElementById('pp-kpis');
  if (kpis) kpis.innerHTML = htmlKpisProposta(cx, peLinhas(cx));
}
// Chave UniLab na edição: ligada = valor proposto já praticado hoje no sistema do laboratório.
// Já igual ao sistema: travada. Marcada pelo usuário (_propEd.sis): só grava ao salvar, com confirmação.
const peFalta = (cx, k) => cx.tabela && cx.salvo(k) == null; // fora da tabela: sistema e tabela ficam fora de sincronia
const peSisIgual = (cx, k) => _propEd.itens[k]?.para != null && !precoDifere(cx.sistema(k), _propEd.itens[k].para) && !peFalta(cx, k);
const peChaveSis = (cx, k) => `<span data-pes="${esc(k)}" title="Valor proposto já praticado hoje no UniLab">${chave(peSisIgual(cx, k) || !!_propEd.sis?.[k], `peMarcarSis('${esc(k)}')`, peSisIgual(cx, k) || _propEd.itens[k]?.para == null)}</span>`;
function peMarcarSis(k) {
  const p = ESTADO.propostas[_propEd.id], cx = ctxAlvo(p.alvo);
  _propEd.sis ||= {};
  if (_propEd.sis[k]) delete _propEd.sis[k]; else _propEd.sis[k] = true;
  const el = document.querySelector(`[data-pes="${CSS.escape(k)}"]`);
  if (el) el.outerHTML = peChaveSis(cx, k);
}
function peRemover(btn) {
  delete _propEd.itens[btn.closest('tr').dataset.k];
  desenharEdicaoProposta();
}

// Busca para incluir exame: mnemônico que começa com o texto vem primeiro
function peBuscar(q) {
  const p = ESTADO.propostas[_propEd.id], cx = ctxAlvo(p.alvo), el = document.getElementById('pe-sug');
  if (!q.trim()) return peFecharSug();
  const ini = normalizar(q.trim()), pri = e => normalizar(e.mn).startsWith(ini) ? 0 : 1;
  const vis = examesVisiveis().filter(e => e.ativo !== false && !(e.id in _propEd.itens) && contem(e.mn + ' ' + e.descricao, q))
    .sort((a, b) => pri(a) - pri(b) || String(a.mn).localeCompare(String(b.mn), 'pt-BR')).slice(0, 8);
  _peSug = vis.map(e => e.id);
  el.innerHTML = !vis.length ? `<div class="gx-sug-v"><i class="fa-solid fa-magnifying-glass"></i>Nenhum exame para incluir com <b>${esc(q)}</b></div>`
    : vis.map((e, i) => {
      const outra = propPendente(p.alvo, e.id, _propEd.id), s = cx.salvo(e.id);
      return `<button type="button" class="${i ? '' : 'hi'}" ${outra ? 'disabled' : ''} onmousedown="event.preventDefault();peAdicionar(_peSug[${i}])">
        <b>${esc(e.mn)}</b><span title="${esc(e.descricao)}">${esc(e.descricao)}</span><small class="${outra ? '' : s != null ? 'g' : ''}"><i class="fa-solid ${outra ? 'fa-hourglass-half' : s != null ? 'fa-table-list' : 'fa-circle-plus'}"></i>${outra ? 'em outra proposta' : s != null ? `hoje ${fmt(s)}` : cx.base ? 'sem preço' : cx.lab ? 'sem valor' : 'fora da tabela'}</small></button>`;
    }).join('');
  el.classList.add('open');
}
function peFecharSug() { _peSug = []; document.getElementById('pe-sug')?.classList.remove('open'); }
function peTecla(ev) {
  if (ev.key === 'Escape' && _peSug.length) { ev.stopPropagation(); return peFecharSug(); }
  if (ev.key !== 'Enter' || !_peSug.length) return;
  ev.preventDefault();
  peAdicionar(_peSug[0]);
}
// Exame novo entra com o valor de sempre: referência (com o desconto da tabela) > praticado > piso
function peAdicionar(k) {
  const p = ESTADO.propostas[_propEd.id], cx = ctxAlvo(p.alvo), e = ESTADO.exames[k];
  if (!e || k in _propEd.itens) return;
  if (propPendente(p.alvo, k, _propEd.id)) return toast(`${e.mn} já está em outra proposta pendente`, 'erro');
  const x = linhaGrade(cx, { ...e, id: k });
  const para = cx.base ? e.precoPraticado ?? x.c.sugerido ?? null : valorAcao(cx, x, 'ref') ?? e.precoPraticado ?? x.c.minimo ?? null;
  _propEd.itens[k] = { mn: e.mn, de: cx.salvo(k) ?? null, para };
  desenharEdicaoProposta(k);
}

async function salvarEdicaoProposta() {
  const id = _propEd.id, p = ESTADO.propostas[id], cx = p && ctxAlvo(p.alvo), u = usuarioAtual();
  if (!p || p.status !== 'pendente') return toast('Proposta já decidida', 'erro');
  if (!cx) return toast('Tabela da proposta não existe mais', 'erro');
  const itens = _propEd.itens, n = Object.keys(itens).length;
  if (!n) return toast('Proposta sem exames: para desistir, cancele a proposta', 'erro');
  // sem valor = retirar da tabela; só faz sentido para exame que está nela
  const ruim = Object.values(itens).find(it => it.para == null ? cx.base || cx.salvo(Object.keys(itens).find(k => itens[k] === it)) == null : !(it.para > 0));
  if (ruim) return toast(`${ruim.mn}: informe um valor válido`, 'erro');
  // marcados como já praticados no UniLab: confirma tudo de uma vez e grava junto com a proposta
  const sis = Object.keys(_propEd.sis || {}).filter(k => itens[k] && itens[k].para != null && (precoDifere(cx.sistema(k), itens[k].para) || peFalta(cx, k)));
  const vs = v => v != null ? fmt(v) : 'sem valor', upd = {};
  if (sis.length) {
    const ok = await confirmar({ titulo: 'Atualizar valores no UniLab?', icone: 'fa-database', botao: 'Salvar e atualizar',
      texto: `Confirme que ${sis.length} exame(s) já são cobrados no UniLab pelo valor proposto. O preço do sistema em <b>${esc(p.alvoNome || cx.nome)}</b> é atualizado no banco de dados:`
        + `<span class="fx-conf" style="max-height:260px;overflow:auto">${sis.map(k => `<span><b>${esc(itens[k].mn)}</b><i>${vs(cx.sistema(k))} → <b>${fmt(itens[k].para)}</b>${cx.tabela && cx.salvo(k) == null ? ' · entra na tabela' : ''}</i></span>`).join('')}</span>` });
    if (ok !== true) return;
    sis.forEach(k => {
      upd[caminhoSistema(p.alvo, k)] = itens[k].para;
      // exame fora da tabela: já praticado no UniLab, entra na tabela com esse valor (coluna "Tabela UniLab")
      if (cx.tabela && cx.salvo(k) == null) { upd[`${CAMINHOS.tabelas}/${cx.id}/precos/${k}`] = itens[k].para; itens[k].novoUnilab = true; }
      itens[k].sistemaOk = true;
      upd[`historicoExames/${k}/${DB.novaChave('historicoExames')}`] = { descricao: `${p.alvoNome || cx.nome}: sistema atualizado ${vs(cx.sistema(k))} → ${fmt(itens[k].para)} (edição da proposta)`, usuario: u.nome, usuarioId: u.id, em: DB.agora() };
    });
  }
  const dados = { itens, n, justificativa: _propEd.just.trim() || null, editadaEm: DB.agora(), editadaPor: u.nome };
  await DB.mesclar(`propostas/${id}`, dados);
  if (sis.length) {
    await DB.mesclar('/', upd);
    // reflete já na tela, sem esperar o banco
    sis.forEach(k => {
      if (p.alvo === 'particular') { if (ESTADO.exames[k]) ESTADO.exames[k].precoSistema = itens[k].para; }
      else if (ESTADO.tabelas[p.alvo]) {
        if (ESTADO.tabelas[p.alvo].precos?.[k] == null) (ESTADO.tabelas[p.alvo].precos ||= {})[k] = itens[k].para;
        (ESTADO.tabelas[p.alvo].sistema ||= {})[k] = itens[k].para;
      }
    });
  }
  Object.assign(p, dados, { editadaEm: Date.now() });
  registrar('tabelas', `${p.alvoNome}: proposta editada (${n} preço(s)${sis.length ? `, ${sis.length} atualizado(s) no UniLab` : ''})`, { proposta: id });
  _propEd = null;
  abrirProposta(id);
  if (document.getElementById('gr-body')) desenharGrade();
  if (typeof gxAberta === 'function' && gxAberta()) desenharGerirExames();
  toast('Proposta atualizada');
}

function revisarItem(inp) {
  const p = ESTADO.propostas[_propId], cx = p && ctxAlvo(p.alvo), tr = inp.closest('tr'), k = tr.dataset.k, it = p?.itens?.[k];
  if (!it || !cx) return;
  const lido = lerMoeda(inp.value), v = lido == null ? null : Math.round(lido * 100) / 100, orig = it.para ?? null;
  if ((v != null && (isNaN(v) || v < 0)) || (v == null && cx.base) || v === orig) delete _propRev[k];
  else _propRev[k] = v;
  const rev = k in _propRev, x = linhaProposta(cx, k, cx.salvo(k) ?? null, rev ? _propRev[k] : orig);
  tr.querySelector('.price-in').classList.toggle('on', rev);
  tr.querySelector('.pp-var').innerHTML = ppVar(x);
  tr.querySelector('.delta').innerHTML = rev ? `<span class="muted">proposto ${fmtOuFora(orig, cx.lab)}</span>` : '';
  const tdDesc = tr.querySelector('.pp-desc');
  if (tdDesc) tdDesc.innerHTML = ppDesc(x);
  tr.querySelector('.pp-mrg').innerHTML = ppMrg(x);
  // indicadores, alerta e botão refletem os valores revisados
  const ls = Object.entries(p.itens).map(([kk, i2]) => linhaProposta(cx, kk, cx.salvo(kk) ?? null, kk in _propRev ? _propRev[kk] : i2.para ?? null));
  const kpis = document.getElementById('pp-kpis');
  if (kpis) kpis.innerHTML = htmlKpisProposta(cx, ls);
  const abaixo = ls.filter(l => l.c?.status === 'r').length;
  document.getElementById('pp-abaixo').innerHTML = abaixo ? `<div class="alert r"><i class="fa-solid fa-circle-xmark"></i><div>${abaixo} preço(s) abaixo do ${cx.pisoNome}.</div></div>` : '';
  const n = Object.keys(_propRev).length;
  document.getElementById('pp-aprovar').innerHTML = `<i class="fa-solid fa-stamp"></i>${n ? `Publicar com ${n} revisão(ões)` : 'Aprovar e publicar'}`;
}

// Arredonda os valores propostos nos campos de revisão (desligar volta ao proposto)
function arredAprov(v) {
  const p = ESTADO.propostas[_propId];
  if (!p) return;
  _ppArred = _ppArred === v ? '0' : v;
  document.getElementById('pp-arred-w').innerHTML = htmlArredPP('arredAprov');
  document.querySelectorAll('#g-corpo .pp-tab tr[data-k]').forEach(tr => {
    const inp = tr.querySelector('.price-in input'), orig = p.itens?.[tr.dataset.k]?.para ?? null;
    if (!inp || orig == null) return;
    inp.value = moedaCampo(arredPP(orig));
    revisarItem(inp);
  });
}

async function decidirProposta(id, status) {
  const p = ESTADO.propostas[id], u = usuarioAtual(), motivo = valorCampo('pp-motivo').trim();
  if (!p || p.status !== 'pendente') return toast('Proposta já decidida', 'erro');
  if (status === 'rejeitada' && !motivo) { document.getElementById('pp-motivo')?.focus(); return toast('Informe o motivo da rejeição', 'erro'); }
  if (status === 'aprovada') {
    // valor digitado e não confirmado com Enter/Tab: vale o que está no campo
    if (_propId === id) document.querySelectorAll('#g-corpo .pp-tab tr .price-in input').forEach(revisarItem);
    // valores revisados por quem aprova: guarda o proposto original para auditoria
    const rev = _propId === id ? { ..._propRev } : {}, nRev = Object.keys(rev).length, itens = { ...p.itens };
    Object.entries(rev).forEach(([k, v]) => { itens[k] = { ...itens[k], para: v, proposto: itens[k].para ?? null, revisado: true }; });
    // UniLab: pergunta só pelos que divergem; já marcados no envio voltam só se o valor foi alterado aqui
    const mudouAqui = k => k in rev && precoDifere(itens[k].para, itens[k].proposto);
    const ks = Object.keys(itens).filter(k => !itens[k].sistemaOk || mudouAqui(k));
    const marc = await perguntarUnilab(ks.map(k => ({ alvo: p.alvo, k, mn: itens[k].mn, para: itens[k].para ?? null })), 'Aprovar e publicar');
    if (!marc) return;
    const mk = ks.filter(k => marc.has(`${p.alvo}|${k}`) || (mudouAqui(k) && itens[k].sistemaOk));
    mk.forEach(k => { itens[k] = { ...itens[k], sistemaOk: marc.has(`${p.alvo}|${k}`) || null }; });
    if (mk.length) await DB.mesclar(`propostas/${id}/itens`, Object.fromEntries(mk.map(k => [k, itens[k]])));
    if (nRev) await DB.mesclar(`propostas/${id}/itens`, Object.fromEntries(Object.keys(rev).map(k => [k, itens[k]])));
    const n = await aplicarProposta(id, { ...p, itens });
    if (motivo || nRev) await DB.mesclar(`propostas/${id}/decisao`, { motivo: motivo || null, revisados: nRev || null });
    toast(`${n} preço(s) publicados em ${p.alvoNome}${nRev ? ` · ${nRev} revisado(s)` : ''}`);
  } else {
    const ok = await confirmar({ titulo: status === 'cancelada' ? 'Cancelar proposta?' : 'Rejeitar proposta?', texto: 'Os preços atuais não mudam.', botao: status === 'cancelada' ? 'Cancelar proposta' : 'Rejeitar', perigo: true });
    if (!ok) return;
    await DB.mesclar(`propostas/${id}`, { status, decisao: { por: u.nome, porId: u.id, em: DB.agora(), motivo: motivo || null } });
    registrar('tabelas', `${p.alvoNome}: proposta ${status} (${p.n} preço(s))`, { proposta: id, motivo: motivo || null });
    toast(status === 'cancelada' ? 'Proposta cancelada' : 'Proposta rejeitada');
  }
  fecharGaveta();
  renderTela();
}

// Aprova todas as propostas pendentes do lote de uma vez (valores e marcas UniLab como enviados)
async function aprovarLote(id) {
  const L = lotesHistorico(false, true).find(l => l.id === id);
  if (!L) return toast('Lote já decidido', 'erro');
  const ps = L.ps.map(p => [p.id, ESTADO.propostas[p.id]]).filter(([, p]) => p?.status === 'pendente' && ctxAlvo(p.alvo));
  const marc = await perguntarUnilab(ps.flatMap(([, p]) => Object.entries(p.itens || {}).filter(([, it]) => !it.sistemaOk)
    .map(([k, it]) => ({ alvo: p.alvo, k, mn: it.mn, para: it.para ?? null }))), 'Aprovar lote');
  if (!marc) return;
  let n = 0;
  for (const [id, p] of ps) {
    const itens = Object.fromEntries(Object.entries(p.itens || {}).map(([k, it]) => [k, marc.has(`${p.alvo}|${k}`) ? { ...it, sistemaOk: true } : it]));
    n += await aplicarProposta(id, { ...p, itens });
  }
  fecharGaveta();
  toast(`${n} preço(s) publicados em ${L.ps.length} tabela(s)`);
  renderTela();
}

// Reverter (quem aprova): proposta aprovada volta cada preço ao valor de antes ("de"; sem "de" = sai da tabela)
// e passa a cancelada. Preço mudado depois por outra proposta não é tocado (fica de fora, avisado).
// A tabela do sistema (UniLab) não muda: a divergência aparece para atualizar o UniLab.
const podeReverterProp = p => p.status === 'aprovada' && pode('tabelas', 'aprovar') && !!ctxAlvo(p.alvo);
async function reverterPropostas(ids) {
  const ps = ids.map(id => [id, ESTADO.propostas[id]]).filter(([, p]) => p && podeReverterProp(p));
  if (!ps.length) return toast('Nada para reverter', 'erro');
  const volta = [], mudou = [];
  ps.forEach(([id, p]) => {
    const cx = ctxAlvo(p.alvo);
    Object.entries(p.itens || {}).forEach(([k, it]) => {
      if (!ESTADO.exames[k]) return;
      (precoDifere(cx.salvo(k), it.para ?? null) ? mudou : volta).push({ id, p, cx, k, it });
    });
  });
  const v = x => x != null ? fmt(x) : 'fora';
  const ok = await confirmar({ titulo: 'Reverter os preços?', icone: 'fa-clock-rotate-left', perigo: true, botao: 'Reverter',
    texto: `${volta.length} preço(s) voltam ao valor de antes e ${ps.length > 1 ? 'as propostas passam' : 'a proposta passa'} a <b>cancelada</b>:`
      + `<span class="fx-conf" style="max-height:220px;overflow:auto">${volta.map(x => `<span><b>${esc(x.it.mn)} · ${esc(x.p.alvoNome)}</b><i>${v(x.it.para)} → <b>${v(x.it.de)}</b></i></span>`).join('')}</span>`
      + (mudou.length ? `<small style="color:var(--amber)">${mudou.length} preço(s) mudaram depois desta proposta e ficam como estão: ${mudou.map(x => esc(x.it.mn)).join(', ')}.</small>` : '') });
  if (ok !== true) return;
  const u = usuarioAtual(), agora = DB.agora(), upd = {};
  volta.forEach(({ id, p, cx, k, it }) => {
    const de = it.de ?? null;
    if (cx.base) {
      upd[`${CAMINHOS.exames}/${k}/precoPraticado`] = de;
      upd[`${CAMINHOS.exames}/${k}/atualizadoEm`] = agora;
      upd[`${CAMINHOS.exames}/${k}/atualizadoPor`] = u.nome;
    } else if (cx.lab) upd[`${cx.caminho}/${cx.id}/precos/${k}`] = de;
    else upd[`${CAMINHOS.tabelas}/${cx.id}/precos/${k}`] = de;
    upd[`historicoExames/${k}/${DB.novaChave('historicoExames')}`] = {
      descricao: `${cx.nome}: revertido ${v(it.para)} → ${de != null ? fmt(de) : cx.lab ? 'sem valor' : 'fora da tabela'}`,
      proposta: id, usuario: u.nome, usuarioId: u.id, em: agora };
  });
  ps.forEach(([id, p]) => {
    upd[`propostas/${id}/status`] = 'cancelada';
    upd[`propostas/${id}/decisao`] = { ...(p.decisao || {}), revertida: { por: u.nome, porId: u.id, em: agora } };
  });
  await DB.mesclar('/', upd);
  registrar('tabelas', `${[...new Set(ps.map(([, p]) => p.alvoNome))].join(', ')}: ${volta.length} preço(s) revertidos`, { propostas: ps.map(([id]) => id) });
  fecharGaveta();
  toast(`${volta.length} preço(s) revertidos`);
  renderTela();
}

// Cancelada: o autor (ou quem aprova) pode tirá-la do histórico. Nada foi publicado, então nada mais muda.
const podeExcluirProp = p => p.status === 'cancelada' && (p.autorId === usuarioAtual()?.id || pode('tabelas', 'aprovar'));
async function excluirPropostas(ids) {
  const ps = ids.map(id => ESTADO.propostas[id]).filter(Boolean);
  if (!ps.length || !ps.every(podeExcluirProp)) return toast('Só propostas canceladas podem ser excluídas', 'erro');
  const n = ps.reduce((s, p) => s + (p.n || Object.keys(p.itens || {}).length), 0);
  const ok = await confirmar({ titulo: 'Excluir do histórico?', perigo: true, botao: 'Excluir',
    texto: `${ps.length > 1 ? `${ps.length} propostas canceladas` : 'A proposta cancelada'} (${n} preço(s) em ${[...new Set(ps.map(p => esc(p.alvoNome)))].join(', ')}) some do histórico. Não dá para desfazer.` });
  if (ok !== true) return;
  for (const id of ids) { await DB.remover(`propostas/${id}`); delete ESTADO.propostas[id]; }
  registrar('tabelas', `${ps.length} proposta(s) cancelada(s) excluída(s) do histórico (${ps.map(p => p.alvoNome).join(', ')})`);
  fecharGaveta();
  toast('Excluída do histórico');
  renderTela();
}

// Proposta rejeitada/cancelada → volta para o rascunho do autor
async function reabrirProposta(id) {
  const p = ESTADO.propostas[id];
  await carregarRascunho(p.alvo);
  const atual = { ...rasc(p.alvo) };
  Object.entries(p.itens || {}).forEach(([k, it]) => { atual[k] = it.para ?? null; });
  const n = await substituirRasc(p.alvo, atual);
  fecharGaveta();
  focarAlvo(p.alvo);
  grade.alvo = null;
  renderTabelas();
  toast(`${n} preço(s) no seu rascunho`);
}

// Contador no menu: propostas aguardando aprovação (só para quem aprova)
function atualizarBadgePropostas() {
  const a = document.querySelector('#nav a[data-s="tabelas"]');
  if (!a) return;
  a.querySelector('.badge')?.remove();
  const n = pode('tabelas', 'aprovar') ? lista(ESTADO.propostas).filter(p => p.status === 'pendente').length : 0;
  if (n) a.insertAdjacentHTML('beforeend', `<span class="badge aviso" title="Propostas aguardando aprovação">${n}</span>`);
}
