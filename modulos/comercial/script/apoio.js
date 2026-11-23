// ═══════════════════════════════════════════════════════════════
// apoio.js — Laboratórios de apoio: importação da tabela de preços
// (modelos Hermes Pardini 4114 e Alvaro 2656), vínculo de mnemônicos e vigência
// ═══════════════════════════════════════════════════════════════
//
// Pardini 4114 = preços NEGOCIADOS. Colunas usadas:
//   A Material (desempate) · B Mnemônico · C Descrição (conferência)
//   F Início Vigência · G Preço Exame(R$)
// Vínculo automático só quando mnemônico E descrição batem.

// Modelo de importação: definido no cadastro do setor (Configurações → Setores)
const modeloDoApoio = s => s?.categoria === 'apoio' && MODELOS_APOIO[s.modeloImportacao] ? s.modeloImportacao : null;
const chaveItemApoio = (codigo, material) => chaveExame(`${codigo}|${material || ''}`);

// ── Similaridade de descrições ────────────────────────────────
const _STOP = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'PARA', 'POR', 'COM', 'EM', 'A', 'O', 'ANTI', 'ANTICORPOS', 'S', 'U', 'NO', 'NA']);
const textoComparar = s => normalizar(s).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const tokens = s => new Set(s.split(' ').filter(t => t && !_STOP.has(t)));
function bigramas(s) {
  const m = new Map();
  for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); }
  return m;
}
// Texto já preparado para comparar (normalizado, tokens e bigramas): calculado uma vez por descrição
const _prepTexto = new Map();
function prepararTexto(s) {
  let p = _prepTexto.get(s);
  if (p) return p;
  const a = textoComparar(s), tk = tokens(a), o = [...tk].sort().join(' ');
  p = { a, tk, o, ga: bigramas(a), go: bigramas(o) };
  if (_prepTexto.size > 30000) _prepTexto.clear();
  _prepTexto.set(s, p);
  return p;
}
function dice(a, ma, b, mb) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  if (ma.size > mb.size) { const t = ma; ma = mb; mb = t; }
  let inter = 0;
  for (const [g, n] of ma) { const o = mb.get(g); if (o) inter += n < o ? n : o; }
  return 2 * inter / (a.length + b.length - 2);
}
function similaridadePrep(pa, pb) {
  let inter = 0;
  for (const t of pa.tk) if (pb.tk.has(t)) inter++;
  const uni = pa.tk.size + pb.tk.size - inter;
  return Math.max(dice(pa.a, pa.ga, pb.a, pb.ga), dice(pa.o, pa.go, pb.o, pb.go), uni ? inter / uni : 0);
}
const similaridade = (a, b) => similaridadePrep(prepararTexto(a), prepararTexto(b));
// Teto da similaridade só pelos tamanhos: permite pular pares que não superam o melhor já achado
const _tetoDice = (x, y) => x < 2 || y < 2 || x === y ? 1 : 2 * Math.min(x - 1, y - 1) / (x + y - 2);
function tetoSimilaridade(pa, pb) {
  const na = pa.tk.size, nb = pb.tk.size;
  return Math.max(_tetoDice(pa.a.length, pb.a.length), _tetoDice(pa.o.length, pb.o.length), na && nb ? Math.min(na, nb) / Math.max(na, nb) : 0);
}

// ── Leitura do arquivo ────────────────────────────────────────
let _xlsxPromessa = null;
function carregarXLSX() {
  if (window.XLSX) return Promise.resolve();
  return _xlsxPromessa ??= new Promise((ok, erro) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = ok; s.onerror = () => erro(new Error('Não foi possível carregar o leitor de Excel (sem internet?).'));
    document.head.appendChild(s);
  });
}

async function linhasDoArquivo(arquivo) {
  if (/\.csv$/i.test(arquivo.name)) return lerCSV(await arquivo.text());
  await carregarXLSX();
  const wb = XLSX.read(await arquivo.arrayBuffer(), { type: 'array' });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
}

function dataPlanilha(v) {
  if (typeof v === 'number' && window.XLSX) { const d = XLSX.SSF.parse_date_code(v); return d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : ''; }
  return dataISO(v);
}

// Tabela Pardini → { chave: { codigo, material, descricao, preco, vigencia } }
function analisarTabelaPardini(linhas) {
  const iCab = linhas.slice(0, 15).findIndex(l => l.some(c => normalizar(c) === 'mnemonico'));
  if (iCab < 0) throw new Error('Cabeçalho não encontrado: o arquivo precisa ter a coluna "Mnemônico" (modelo Pardini 4114).');
  const cab = linhas[iCab].map(normalizar);
  const col = (re, padrao) => { const i = cab.findIndex(c => re.test(c)); return i >= 0 ? i : padrao; };
  const C = { mat: col(/^material/, 0), mn: col(/^mnemonico/, 1), desc: col(/^descricao/, 2), vig: col(/vigencia/, 5), preco: col(/^preco/, 6) };
  const itens = {}, avisos = [];
  linhas.slice(iCab + 1).forEach(l => {
    const codigo = String(l[C.mn] ?? '').trim();
    if (!codigo) return;
    const preco = typeof l[C.preco] === 'number' ? l[C.preco] : numeroBR(l[C.preco]);
    if (preco == null) { avisos.push(`${codigo}: sem preço`); return; }
    const material = String(l[C.mat] ?? '').trim();
    itens[chaveItemApoio(codigo, material)] = { codigo, material, descricao: String(l[C.desc] ?? '').trim(), preco: Math.round(preco * 100) / 100, vigencia: dataPlanilha(l[C.vig]) };
  });
  if (!Object.keys(itens).length) throw new Error('Nenhum exame com preço encontrado no arquivo.');
  return { itens, avisos };
}

// Alvaro 2656 = "Preços Negociados". Cabeçalho do cadastro do cliente nas primeiras linhas;
// depois A Cod. Exame · B Nome Exame · F Preços Especiais R$ ("R$ 1.843,15").
// Sem material e sem vigência: vale a partir da data da importação.
function analisarTabelaAlvaro(linhas) {
  const iCab = linhas.slice(0, 40).findIndex(l => l.some(c => /^cod\.? ?exame/.test(normalizar(c))));
  if (iCab < 0) throw new Error('Cabeçalho não encontrado: o arquivo precisa ter a coluna "Cod. Exame" (modelo Alvaro, preços negociados).');
  const cab = linhas[iCab].map(normalizar);
  const col = (re, padrao) => { const i = cab.findIndex(c => re.test(c)); return i >= 0 ? i : padrao; };
  const C = { cod: col(/^cod\.? ?exame/, 0), desc: col(/^nome/, 1), preco: col(/^preco/, 5) };
  const itens = {}, avisos = [], hoje = hojeISO();
  linhas.slice(iCab + 1).forEach(l => {
    const codigo = String(l[C.cod] ?? '').trim();
    if (!codigo) return;
    const preco = typeof l[C.preco] === 'number' ? l[C.preco] : numeroBR(l[C.preco]);
    if (preco == null) { avisos.push(`${codigo}: sem preço`); return; }
    itens[chaveItemApoio(codigo, '')] = { codigo, material: '', descricao: String(l[C.desc] ?? '').trim(), preco: Math.round(preco * 100) / 100, vigencia: hoje };
  });
  if (!Object.keys(itens).length) throw new Error('Nenhum exame com preço encontrado no arquivo.');
  return { itens, avisos };
}

// Leitor de cada modelo (linhas do arquivo → { itens, avisos })
const LEITORES_APOIO = { pardini4114: analisarTabelaPardini, alvaro2656: analisarTabelaAlvaro };

// ── Classificação dos vínculos ────────────────────────────────
// Para cada exame do setor do apoio: vinculado | auto | conf | forte | fraca | sem | rejeitado
// Índice da tabela (por código, textos preparados) e melhor item por descrição: guardados enquanto a tabela não muda
const _indiceApoio = new WeakMap();
function indiceTabelaApoio(itens) {
  let ix = _indiceApoio.get(itens);
  if (ix) return ix;
  ix = { porCodigo: {}, todos: [], melhor: new Map() };
  Object.entries(itens).forEach(([k, it]) => {
    const x = { k, ...it };
    (ix.porCodigo[String(it.codigo).toUpperCase()] ??= []).push(x);
    ix.todos.push({ it: x, p: prepararTexto(it.descricao) });
  });
  _indiceApoio.set(itens, ix);
  return ix;
}
// rej = itens rejeitados para o exame ({ chave: true }): ficam fora da busca (e o resultado fora da memória)
function melhorItemApoio(ix, descricao, rej) {
  let m = rej ? undefined : ix.melhor.get(descricao);
  if (m !== undefined) return m;
  const pe = prepararTexto(descricao);
  m = null;
  for (const { it, p } of ix.todos) {
    if (rej && rej[it.k]) continue;
    if (m && (m.s >= 1 || tetoSimilaridade(pe, p) <= m.s)) continue;
    const s = similaridadePrep(pe, p);
    if (!m || s > m.s) m = { it, s };
  }
  if (!rej) ix.melhor.set(descricao, m);
  return m;
}
// Sugestões de vínculo rejeitadas para o exame neste apoio: exame.vinculosRejeitados[apoioId] = { chaveDoItem: true }
const rejeitadosDoExame = (e, apoioId) => { const r = e?.vinculosRejeitados?.[apoioId]; return r && Object.keys(r).length ? r : null; };

function classificarVinculos(apoioId, itens) {
  const ix = indiceTabelaApoio(itens), porCodigo = ix.porCodigo;
  return lista(ESTADO.exames).filter(e => e.setorId === apoioId).map(e => {
    if (e.vinculoApoio?.apoioId === apoioId) {
      return { e, st: itens[e.vinculoApoio.chave] ? 'vinculado' : 'saiu', k: e.vinculoApoio.chave, it: itens[e.vinculoApoio.chave] };
    }
    // sugestão rejeitada: o exame sai da fila de sugestões e fica na categoria própria,
    // até uma importação trazer item novo (entrou na tabela depois da rejeição) que combine
    const rej = rejeitadosDoExame(e, apoioId);
    if (rej) {
      const desde = Math.max(...Object.values(rej).map(v => typeof v === 'number' ? v : 0));
      const novos = ix.todos.filter(x => x.it.desde > desde && !rej[x.it.k]);
      if (novos.length) {
        const pe = prepararTexto(e.descricao), mn = e.mn.toUpperCase();
        const melhorDe = l => l.reduce((m, x) => { const s = similaridadePrep(pe, x.p); return !m || s > m.s ? { it: x.it, s } : m; }, null);
        const mesmos = novos.filter(x => String(x.it.codigo).toUpperCase() === mn);
        if (mesmos.length) { const m = melhorDe(mesmos); return { e, st: m.s >= 0.75 ? 'auto' : 'conf', k: m.it.k, it: m.it, sc: m.s, multi: mesmos.length > 1 }; }
        const m = melhorDe(novos);
        if (m.s >= 0.6) return { e, st: m.s >= 0.9 ? 'forte' : 'fraca', k: m.it.k, it: m.it, sc: m.s };
      }
      return { e, st: 'rejeitado', k: null, it: null, rejIt: Object.keys(rej).map(k => itens[k]).filter(Boolean) };
    }
    const mesmos = porCodigo[e.mn.toUpperCase()];
    if (mesmos) {
      const melhor = mesmos.map(it => ({ it, s: similaridade(e.descricao, it.descricao) })).sort((a, b) => b.s - a.s)[0];
      return { e, st: melhor.s >= 0.75 ? 'auto' : 'conf', k: melhor.it.k, it: melhor.it, sc: melhor.s, multi: mesmos.length > 1 };
    }
    const melhor = melhorItemApoio(ix, e.descricao);
    const st = melhor && melhor.s >= 0.9 ? 'forte' : melhor && melhor.s >= 0.6 ? 'fraca' : 'sem';
    return { e, st, k: st !== 'sem' ? melhor.it.k : null, it: st !== 'sem' ? melhor.it : null, sc: melhor?.s };
  });
}

const VST = {
  vinculado: { t: 'Vinculado',        c: 'ok',   ic: 'fa-link',                h: 'vínculo já confirmado' },
  auto:      { t: 'Automático',       c: 'ok',   ic: 'fa-link',                h: 'mnemônico e descrição iguais' },
  forte:     { t: 'Sugestão forte',   c: 'base', ic: 'fa-wand-magic-sparkles', h: 'mnemônico diferente, descrição igual' },
  fraca:     { t: 'Sugestão fraca',   c: 'base', ic: 'fa-wand-magic-sparkles', h: 'descrição parecida: confira' },
  conf:      { t: 'Conferir',         c: 'bad',  ic: 'fa-triangle-exclamation', h: 'mesmo mnemônico, exame diferente: não vincula sozinho' },
  sem:       { t: 'Sem vínculo',      c: 'off',  ic: 'fa-link-slash',          h: 'não encontrado na tabela' },
  rejeitado: { t: 'Rejeitado',        c: 'bad',  ic: 'fa-ban',                 h: 'sugestão rejeitada: só volta a sugerir com item novo na tabela ou ao restaurar' },
  saiu:      { t: 'Saiu da tabela',   c: 'warn', ic: 'fa-circle-exclamation',  h: 'item vinculado não está mais na tabela' },
  manual:    { t: 'Escolhido',        c: 'base', ic: 'fa-hand-pointer',        h: 'item trocado manualmente: confirme para vincular' }
};

// ── Tela (Custos → Laboratórios de apoio) ─────────────────────
const apo = { aba: 'vinc', itF: 'ativos', itQ: '', itPag: 1, sel: null, passo: 0, arquivo: null, analise: null, erro: '', comFortes: false, filtro: '', pag: 1, cache: null, troca: {}, trocaEx: {}, marc: {} };
aoAtualizar(ch => { if (ch === 'exames' || ch === 'apoios' || ch === 'setores') apo.cache = null; });

function htmlApoios() {
  const apoios = lista(ESTADO.setores, porNome).filter(s => s.categoria === 'apoio');
  if (!apoios.length) return `<div class="card">${vazio('fa-truck-medical', 'Nenhum setor da categoria "Laboratório de apoio" cadastrado.')}</div>`;
  if (!apoios.find(a => a.id === apo.sel)) apo.sel = (apoios.find(a => modeloDoApoio(a)) || apoios[0]).id;
  // contagem dos cartões em uma única passada pelos exames
  const cont = Object.fromEntries(apoios.map(a => [a.id, { n: 0, vinc: 0, sem: 0 }]));
  Object.entries(ESTADO.exames || {}).forEach(([id, e]) => {
    const c = cont[e.setorId];
    if (!c) return;
    c.n++;
    if (e.vinculoApoio?.apoioId === e.setorId) c.vinc++;
    if (!custoTesteExame({ id, ...e })) c.sem++;
  });
  return `<div class="cards">${apoios.map(a => {
      const t = ESTADO.apoios[a.id] || {}, nItens = Object.values(t.precos || {}).filter(it => !it.inativo).length;
      const c = cont[a.id], modelo = modeloDoApoio(a);
      return `<button class="card tcard ${a.id === apo.sel ? 'on' : ''}" onclick="apo.sel='${a.id}';apo.passo=0;apo.cache=null;apo.pag=1;apo.troca={};apo.trocaEx={};apo.marc={};renderCustos()">
        <div class="tc-h"><span class="tc-ic" style="--c:${a.cor}"><i class="fa-solid ${a.icone}"></i></span><div><div class="tc-n">${esc(a.nome)}</div>
          <div class="tc-s">${nItens ? `tabela de ${dataBR(t.vigencia)} · ${num(nItens, 0)} itens` : modelo ? 'tabela ainda não importada' : 'modelo de importação pendente'}</div></div></div>
        <div class="tc-stats"><div><b>${c.n}</b><span>exames LAMIC</span></div><div><b>${c.vinc}</b><span>vinculados</span></div><div><b>${c.sem}</b><span>sem custo</span></div></div></button>`;
    }).join('')}</div>
    <div class="card" style="margin-top:14px" id="apoio-det">${htmlApoioDetalhe()}</div>`;
}

function htmlApoioDetalhe() {
  const a = ESTADO.setores[apo.sel], modelo = modeloDoApoio(a), t = ESTADO.apoios[apo.sel] || {};
  const podeImp = pode('custos', 'importar');
  let cab = `<div class="sec-card-h"><span class="tc-ic" style="--c:${a.cor}"><i class="fa-solid ${a.icone}"></i></span>
    <div><h3>${esc(a.nome)}</h3><div class="sub">${modelo ? MODELOS_APOIO[modelo].nome + (MODELOS_APOIO[modelo].negociada ? ' · preços negociados' : '') : 'Sem modelo de importação: custos informados manualmente na ficha de cada exame'}</div></div>
    <div class="rt">${t.importadoEm ? `<span class="muted" style="font-size:12px">importada em ${dataHora(t.importadoEm)} por ${esc(t.importadoPor || '—')}</span>` : ''}
      ${modelo && podeImp && apo.passo === 0 ? `<button class="btn pri" onclick="apo.passo=1;apo.erro='';desenharApoioDet()"><i class="fa-solid fa-file-import"></i>${t.precos ? 'Importar nova tabela' : 'Importar tabela'}</button>` : ''}</div></div>`;
  if (apo.passo >= 1) return cab + htmlImportacaoApoio();
  const nAt = Object.values(t.precos || {}).filter(it => !it.inativo).length, nHist = Object.keys(t.historico || {}).length;
  const abas = `<div style="padding:14px 18px 0"><div class="seg">${[['vinc', 'Vínculos', 'fa-link', null], ['itens', 'Itens da tabela', 'fa-list', nAt], ['hist', 'Histórico', 'fa-clock-rotate-left', nHist || null]]
    .map(([k, tx, ic, n]) => `<button class="${apo.aba === k ? 'on' : ''}" onclick="apo.aba='${k}';desenharApoioDet()"><i class="fa-solid ${ic}"></i>${tx}${n != null ? ` <b>${n}</b>` : ''}</button>`).join('')}</div></div>`;
  if (apo.aba === 'itens') return cab + abas + htmlItensApoio();
  if (apo.aba === 'hist') return cab + abas + htmlHistoricoApoio();
  cab += abas;
  if (!modelo) return cab + vazio('fa-file-excel', `<b>Nenhum modelo de importação escolhido</b><br>Escolha o modelo no cadastro do setor. Se o apoio ainda não tem modelo, envie um arquivo de exemplo da tabela para criarmos. Enquanto isso, dá para cadastrar os itens à mão em "Itens da tabela".${pode('params', 'editar') ? `<br><button class="btn sm" style="margin-top:10px" onclick="abrirSetor('${apo.sel}')"><i class="fa-solid fa-pen"></i>Editar setor</button>` : ''}`);
  if (!t.precos) return cab + vazio('fa-file-import', `Importe a tabela (${esc(MODELOS_APOIO[modelo].exemplo)}) para vincular os exames e atualizar os custos.`);
  return cab + htmlVinculos();
}
const desenharApoioDet = () => { const el = document.getElementById('apoio-det'); if (el) { el.innerHTML = htmlApoioDetalhe(); popsVinculos(); } };

// ── Assistente de importação ──────────────────────────────────
function htmlImportacaoApoio() {
  const passos = ['Arquivo', 'Conferir', 'Concluído'];
  const barra = `<div class="steps">${passos.map((s, i) => `<div class="step ${i + 1 < apo.passo ? 'done' : i + 1 === apo.passo ? 'cur' : ''}"><span class="c">${i + 1 < apo.passo ? '<i class="fa-solid fa-check"></i>' : i + 1}</span>${s}</div>`).join('')}</div>`;
  let corpo = '', rodape = '';
  if (apo.passo === 1) {
    corpo = `<label class="drop ${apo.arquivo ? 'ok' : ''}" for="apo-arq"><input type="file" id="apo-arq" accept="${MODELOS_APOIO[modeloDoApoio(ESTADO.setores[apo.sel])]?.aceita || '.xlsx,.xls,.csv'}" onchange="lerArquivoApoio(this)">
        <i class="fa-solid ${apo.arquivo ? 'fa-circle-check' : 'fa-cloud-arrow-up'}"></i><b>${esc(MODELOS_APOIO[modeloDoApoio(ESTADO.setores[apo.sel])]?.arquivo || 'Tabela de preços do apoio')}</b>
        <div class="drop-s">${apo.arquivo ? esc(apo.arquivo.name) : `Arquivo baixado do portal (ex.: ${esc(MODELOS_APOIO[modeloDoApoio(ESTADO.setores[apo.sel])]?.exemplo || '')})`}</div></label>
      ${apo.erro ? `<div class="alert r" style="margin-top:12px"><i class="fa-solid fa-circle-xmark"></i><div>${esc(apo.erro)}</div></div>` : ''}`;
    rodape = `<button class="btn" onclick="apo.passo=0;apo.arquivo=null;desenharApoioDet()">Cancelar</button><button class="btn pri" ${apo.arquivo && !apo.analisando ? '' : 'disabled'} onclick="analisarApoio()"><i class="fa-solid ${apo.analisando ? 'fa-circle-notch fa-spin' : 'fa-magnifying-glass-chart'}"></i>${apo.analisando ? 'Analisando vínculos…' : 'Analisar'}</button>`;
  }
  if (apo.passo === 2) {
    const an = apo.analise, cont = {};
    an.vinc.forEach(v => { cont[v.st] = (cont[v.st] || 0) + 1; });
    const vig = {}; Object.values(an.itens).forEach(it => { vig[it.vigencia] = (vig[it.vigencia] || 0) + 1; });
    const vigMaior = Object.entries(vig).sort((a, b) => b[1] - a[1])[0]?.[0], futuras = Object.values(an.itens).filter(it => it.vigencia > hojeISO()).length;
    const imp = an.impacto;
    const kp = (ic, cor, rot, v, s = '') => `<div class="imp"><div class="l"><i class="fa-solid ${ic}" style="color:${cor}"></i>${rot}</div><div class="v">${num(v, 0)}</div>${s ? `<div class="d muted">${s}</div>` : ''}</div>`;
    corpo = `<div class="sumgrid">
        ${kp('fa-list', 'var(--text-muted)', 'Itens na tabela', Object.keys(an.itens).length, `vigência ${dataBR(vigMaior)}${futuras ? ` · ${futuras} futura(s)` : ''}`)}
        ${kp('fa-link', 'var(--green)', 'Automáticos', (cont.auto || 0) + (cont.vinculado || 0), `${cont.vinculado || 0} já vinculados`)}
        ${kp('fa-wand-magic-sparkles', 'var(--cyan)', 'Sugestões', (cont.forte || 0) + (cont.fraca || 0), `${cont.forte || 0} fortes · ${cont.fraca || 0} fracas`)}
        ${kp('fa-triangle-exclamation', 'var(--red)', 'Conferir', cont.conf || 0, 'mesmo MN, exame diferente')}
        ${kp('fa-link-slash', 'var(--gray)', 'Sem vínculo', (cont.sem || 0) + (cont.saiu || 0) + (cont.rejeitado || 0), [cont.saiu ? `${cont.saiu} saíram da tabela` : '', cont.rejeitado ? `${cont.rejeitado} rejeitados` : ''].filter(Boolean).join(' · ') || 'custo manual')}
        ${kp('fa-arrow-trend-up', 'var(--red)', 'Custos sobem', imp.sobem, imp.mediana != null ? `mediana ${imp.mediana > 0 ? '+' : ''}${pct(imp.mediana)}` : '')}
        ${kp('fa-arrow-trend-down', 'var(--green)', 'Custos descem', imp.descem)}
        ${kp('fa-circle-xmark', 'var(--red)', 'Caem abaixo do mínimo', imp.caem.length)}
        ${an.saem || an.voltam ? kp('fa-ban', 'var(--gray)', 'Itens inativados', an.saem, `fora do arquivo${an.voltam ? ` · ${an.voltam} reativado(s)` : ''}`) : ''}
      </div>
      ${an.avisos.length ? `<div class="alert a"><i class="fa-solid fa-triangle-exclamation"></i><div>${an.avisos.length} linha(s) ignoradas: ${esc(an.avisos.slice(0, 5).join(' · '))}${an.avisos.length > 5 ? '…' : ''}</div></div>` : ''}
      ${imp.caem.length ? `<div class="sec-t"><i class="fa-solid fa-circle-xmark"></i>Exames que caem abaixo do mínimo</div>
        <div class="tbl-wrap card-in"><table><thead><tr><th>MN</th><th>Exame</th><th class="num">Custo atual → novo</th><th class="num">Margem</th></tr></thead><tbody>
        ${imp.caem.slice(0, 15).map(x => `<tr><td class="mn">${esc(x.e.mn)}</td><td class="desc">${esc(x.e.descricao)}</td><td class="num">${fmt(x.c0)} → <b>${fmt(x.c1)}</b></td><td class="num">${pct(x.m0)} → <span style="color:var(--red)">${pct(x.m1)}</span></td></tr>`).join('')}
        </tbody></table></div>${imp.caem.length > 15 ? `<div class="hint" style="margin-top:6px">+ ${imp.caem.length - 15} exames</div>` : ''}` : ''}
      <div class="sec-t" style="margin-top:16px"><i class="fa-solid fa-sliders"></i>Ao aplicar</div>
      <div class="casc">
        <div class="casc-r"><div class="lft"><i class="fa-solid fa-link" style="color:var(--green)"></i><div>Gravar a tabela e vincular os automáticos<div class="s">custos passam a vir da tabela e os exames ficam marcados como negociados</div></div></div><span class="badge-s ok">sempre</span></div>
        <div class="casc-r"><div class="lft"><i class="fa-solid fa-sitemap" style="color:${ESTADO.setores[apo.sel].cor}"></i><div>Vincular apenas os ${an.vinc.length} exames do setor ${esc(ESTADO.setores[apo.sel].nome)}<div class="s">exames de outros setores e as tabelas dos outros apoios não são alterados</div></div></div><span class="badge-s ok">sempre</span></div>
        <div class="casc-r"><div class="lft"><i class="fa-solid fa-wand-magic-sparkles" style="color:var(--cyan)"></i><div>Vincular também as ${cont.forte || 0} sugestões fortes<div class="s">descrição igual, mnemônico diferente (ex.: 17PG → 17-PG)</div></div></div>${chave(apo.comFortes, 'apo.comFortes=!apo.comFortes;this.classList.toggle(\'on\')')}</div>
        <div class="casc-r"><div class="lft"><i class="fa-solid fa-ban"></i><div>Inativar os ${an.saem} itens que não estão no arquivo<div class="s">não são apagados: ficam em Itens da tabela → Inativos e voltam se reaparecerem · itens cadastrados à mão continuam ativos</div></div></div><span class="badge-s ok">sempre</span></div>
        <div class="casc-r"><div class="lft"><i class="fa-solid fa-hand-pointer"></i><div>Sugestões fracas e "conferir"<div class="s">ficam para confirmação manual na lista de vínculos</div></div></div><span class="badge-s off">manual</span></div>
      </div>`;
    rodape = `<button class="btn" onclick="apo.passo=1;desenharApoioDet()"><i class="fa-solid fa-arrow-left"></i>Voltar</button><button class="btn pri" onclick="aplicarTabelaApoio()"><i class="fa-solid fa-check"></i>Aplicar tabela</button>`;
  }
  if (apo.passo === 3) {
    corpo = `<div class="done-box"><i class="fa-solid fa-circle-check"></i><h3>Tabela aplicada</h3><p>${apo.resultado}</p></div>`;
    rodape = `<span></span><button class="btn pri" onclick="apo.passo=0;apo.arquivo=null;apo.cache=null;desenharApoioDet()"><i class="fa-solid fa-link"></i>Ver vínculos</button>`;
  }
  return barra + `<div class="wz-body">${corpo}</div><div class="wz-f">${rodape}</div>`;
}

function lerArquivoApoio(input) {
  apo.arquivo = input.files[0] || null; apo.erro = '';
  desenharApoioDet();
}

async function analisarApoio() {
  apo.analisando = true; desenharApoioDet();
  await new Promise(r => setTimeout(r, 30));          // deixa a tela mostrar o "analisando"
  try {
    const leitor = LEITORES_APOIO[modeloDoApoio(ESTADO.setores[apo.sel])];
    if (!leitor) throw new Error('Este setor não tem modelo de importação.');
    const { itens, avisos } = leitor(await linhasDoArquivo(apo.arquivo));
    // desde = quando o item entrou na tabela: sugestões rejeitadas só voltam com item mais novo que a rejeição
    const antes = ESTADO.apoios[apo.sel]?.precos || {}, agora = Date.now();
    Object.entries(itens).forEach(([k, it]) => { if (!antes[k]) it.desde = agora; else if (antes[k].desde) it.desde = antes[k].desde; });
    // itens cadastrados à mão (valor negociado no cadastro do exame) continuam na tabela se o arquivo não os trouxer
    Object.entries(antes).forEach(([k, it]) => { if (it.manual && !it.inativo && !itens[k]) itens[k] = { ...it }; });
    // importados que o arquivo não traz mais: ficam inativos
    const saem = Object.entries(antes).filter(([k, it]) => !it.inativo && !itens[k]).length, voltam = Object.entries(antes).filter(([k, it]) => it.inativo && itens[k]).length;
    const vinc = classificarVinculos(apo.sel, itens);
    // impacto: exames que ficarão vinculados (já vinculados + automáticos)
    const imp = { sobem: 0, descem: 0, caem: [], var: [] }, min = parametro('margemMinima');
    vinc.filter(v => v.st === 'vinculado' || v.st === 'auto').forEach(v => {
      const c0 = calcular(v.e), e1 = { ...v.e, vinculoApoio: null, reagenteId: null, custoTeste: v.it.preco }, c1 = calcular(e1);
      if (c0.semCusto) return;
      const d = c1.teste.valor - c0.teste.valor;
      if (d > 0.004) imp.sobem++; else if (d < -0.004) imp.descem++;
      if (c0.teste.valor > 0) imp.var.push(c1.teste.valor / c0.teste.valor - 1);
      if (c0.margem != null && c0.margem >= min && c1.margem < min) imp.caem.push({ e: v.e, c0: c0.teste.valor, c1: c1.teste.valor, m0: c0.margem, m1: c1.margem });
    });
    imp.var.sort((a, b) => a - b);
    imp.mediana = imp.var.length ? imp.var[Math.floor(imp.var.length / 2)] : null;
    apo.analise = { itens, avisos, vinc, impacto: imp, arquivo: apo.arquivo.name, saem, voltam };
    apo.passo = 2; apo.comFortes = false;
  } catch (e) { console.error(e); apo.erro = e.message; }
  apo.analisando = false;
  desenharApoioDet();
}

async function aplicarTabelaApoio() {
  const an = apo.analise, id = apo.sel, antes = ESTADO.apoios[id]?.precos || {}, u = usuarioAtual();
  const ok = await confirmar({ titulo: 'Aplicar a nova tabela?', texto: 'Os custos dos exames vinculados passam a usar os preços desta tabela, respeitando a vigência.', botao: 'Aplicar' });
  if (!ok) return;
  // preços: guarda o preço anterior quando muda (vigência futura continua usando o anterior)
  const precos = {}, semVig = MODELOS_APOIO[modeloDoApoio(ESTADO.setores[id])]?.semVigencia;
  // lote do histórico: o que mudou em relação à tabela anterior
  const hist = {}, cnt = { novos: 0, alterados: 0, inativados: 0, reativados: 0 }, primeira = !Object.keys(antes).length, agoraMs = Date.now();
  const reg = (k, it, tipo, m) => { cnt[tipo + 's']++; if (!(tipo === 'novo' && primeira)) hist[k] = itemHistorico(it, tipo, m); };
  Object.entries(an.itens).forEach(([k, it]) => {
    const old = antes[k];
    // modelo sem vigência no arquivo: preço igual mantém a data em que passou a valer
    if (semVig && old && old.preco === it.preco && old.vigencia) it = { ...it, vigencia: old.vigencia };
    precos[k] = { ...it };
    if (old && (old.preco !== it.preco || old.vigencia !== it.vigencia)) precos[k].anterior = { preco: old.preco, vigencia: old.vigencia || null };
    else if (old?.anterior && it.vigencia > hojeISO()) precos[k].anterior = old.anterior;
    if (!old) reg(k, it, 'novo', { para: it.preco, vigPara: it.vigencia });
    else if (old.inativo) reg(k, it, 'reativado', { de: old.preco, para: it.preco, vigDe: old.vigencia, vigPara: it.vigencia });
    else if (old.preco !== it.preco || old.vigencia !== it.vigencia) reg(k, it, 'alterado', { de: old.preco, para: it.preco, vigDe: old.vigencia, vigPara: it.vigencia });
  });
  // fora do arquivo: o item fica na tabela, inativo
  Object.entries(antes).forEach(([k, old]) => {
    if (precos[k]) return;
    precos[k] = { ...old, inativo: true, inativoEm: old.inativoEm || agoraMs };
    if (!old.inativo) reg(k, old, 'inativado', { de: old.preco, vigDe: old.vigencia });
  });
  const nAtivos = Object.keys(an.itens).length;
  const vigs = Object.values(an.itens).map(i => i.vigencia).filter(Boolean).sort();
  const upd = {
    [`${CAMINHOS.apoios}/${id}/precos`]: precos,
    [`${CAMINHOS.apoios}/${id}/vigencia`]: vigs[Math.floor(vigs.length / 2)] || null,
    [`${CAMINHOS.apoios}/${id}/importadoEm`]: DB.agora(),
    [`${CAMINHOS.apoios}/${id}/importadoPor`]: u.nome,
    [`${CAMINHOS.apoios}/${id}/arquivo`]: an.arquivo,
    [`${CAMINHOS.apoios}/${id}/modelo`]: modeloDoApoio(ESTADO.setores[id]),
    ...loteHistoricoApoio('importacao', hist, { arquivo: an.arquivo, n: cnt, total: nAtivos, vigencia: vigs[Math.floor(vigs.length / 2)] || null, primeira: primeira || null })
  };
  let nv = 0;
  an.vinc.forEach(v => {
    if (v.st === 'auto' || (apo.comFortes && v.st === 'forte')) {
      upd[`${CAMINHOS.exames}/${v.e.id}/vinculoApoio`] = { apoioId: id, chave: v.k };
      upd[`${CAMINHOS.exames}/${v.e.id}/negociado`] = true;
      nv++;
    }
  });
  await DB.mesclar('/', upd);
  registrar('apoios', `Tabela ${ESTADO.setores[id].nome} importada: ${nAtivos} itens ativos (${cnt.novos} novos, ${cnt.alterados} alterados, ${cnt.inativados} inativados, ${cnt.reativados} reativados), ${nv} novos vínculos`, { arquivo: an.arquivo });
  apo.resultado = `${num(nAtivos, 0)} itens ativos · ${cnt.alterados} valor(es) alterado(s) · ${cnt.novos} novo(s) · ${cnt.inativados} inativado(s)${cnt.reativados ? ` · ${cnt.reativados} reativado(s)` : ''} · ${nv} novos vínculos · ${an.vinc.filter(v => v.st === 'vinculado').length} vínculos existentes atualizados`;
  apo.passo = 3; apo.cache = null;
  desenharApoioDet();
}

// ── Lista de vínculos ─────────────────────────────────────────
const VINC_POR_PAG = 40;
// Itens da tabela do apoio selecionado; o mesmo objeto enquanto a tabela não muda (aproveita o índice)
const _itensApoio = new WeakMap();
function itensApoioSel() {
  const precos = ESTADO.apoios[apo.sel]?.precos;
  if (!precos) return {};
  let itens = _itensApoio.get(precos);
  if (!itens) _itensApoio.set(precos, itens = Object.fromEntries(Object.entries(precos).filter(([, v]) => !v.inativo).map(([k, v]) => [k, { k, ...v }])));
  return itens;
}
// Linha como está na tela: com o item e/ou o exame trocados à mão (valem até confirmar)
function vinculoEfetivo(v, itens) {
  const lin = v.e.id, tr = v.st !== 'vinculado' && itens[apo.troca[lin]];
  if (tr) v = { ...v, k: tr.k, it: tr, sc: similaridade(v.e.descricao, tr.descricao), manual: true };
  // exame LAMIC trocado à mão: o item da linha passa a ser oferecido a outro exame do setor
  const ex = v.st !== 'vinculado' && v.it && ESTADO.exames[apo.trocaEx[lin]];
  if (ex) v = { ...v, e: { ...ex, id: apo.trocaEx[lin] }, sc: similaridade(ex.descricao, v.it.descricao), manual: true };
  return v;
}
const vinculoConfirmavel = v => v.st !== 'vinculado' && !!v.k && (v.manual || v.st !== 'saiu');
function htmlVinculos() {
  const nRej = id => Object.keys(ESTADO.exames[id]?.vinculosRejeitados?.[apo.sel] || {}).length;
  const itens = itensApoioSel();
  if (!apo.cache) apo.cache = classificarVinculos(apo.sel, itens);
  const cont = {}; apo.cache.forEach(v => { cont[v.st] = (cont[v.st] || 0) + 1; });
  // rejeitados ficam só na categoria própria, fora de "Todos"
  if (apo.filtro && !cont[apo.filtro]) apo.filtro = '';
  const ls = apo.cache.filter(v => apo.filtro ? v.st === apo.filtro : v.st !== 'rejeitado');
  const ordem = ['saiu', 'conf', 'auto', 'forte', 'fraca', 'sem', 'vinculado', 'rejeitado'];
  ls.sort((a, b) => ordem.indexOf(a.st) - ordem.indexOf(b.st) || a.e.mn.localeCompare(b.e.mn));
  const n = Math.max(1, Math.ceil(ls.length / VINC_POR_PAG)); if (apo.pag > n) apo.pag = n;
  const editar = pode('exames', 'editar') || pode('custos', 'editar');
  // seleção para confirmar em lote: só linhas que dá para confirmar, no filtro atual
  const conf = apo.conf = new Set(editar ? ls.filter(v => vinculoConfirmavel(vinculoEfetivo(v, itens))).map(v => v.e.id) : []);
  Object.keys(apo.marc).forEach(k => { if (!conf.has(k)) delete apo.marc[k]; });
  const todosMarc = conf.size > 0 && Object.keys(apo.marc).length === conf.size;
  return `<div class="chips" style="padding-bottom:12px">
      <button class="chip ${!apo.filtro ? 'on' : ''}" onclick="apo.filtro='';apo.pag=1;desenharApoioDet()"><i class="fa-solid fa-list"></i>Todos <b>${apo.cache.length - (cont.rejeitado || 0)}</b></button>
      ${ordem.filter(k => cont[k]).map(k => `<button class="chip ${apo.filtro === k ? 'on' : ''}" onclick="apo.filtro='${k}';apo.pag=1;desenharApoioDet()"><i class="fa-solid ${VST[k].ic}"></i>${VST[k].t} <b>${cont[k]}</b></button>`).join('')}
      ${conf.size ? `<span id="vinc-lote" style="margin-left:auto;display:inline-flex;gap:8px;align-items:center">${htmlLoteVinculos()}</span>` : ''}
    </div>
    <div class="tbl-wrap"><table><thead><tr><th>${conf.size ? `<button id="vinc-cx-todos" class="cb sel-cx ${todosMarc ? 'on' : ''}" onclick="marcarVinculos()" title="Selecionar ou desmarcar todos os que faltam confirmar"><i class="fa-solid fa-check"></i></button>` : ''}MN LAMIC</th><th>Exame LAMIC</th><th></th><th>Item do apoio</th><th>Descrição no apoio</th><th class="num">Preço</th><th>Situação</th><th></th></tr></thead><tbody>
    ${ls.slice((apo.pag - 1) * VINC_POR_PAG, apo.pag * VINC_POR_PAG).map(v => {
      const lin = v.e.id;
      v = vinculoEfetivo(v, itens);
      const podeTrocar = editar && v.st !== 'vinculado';
      const s = v.manual ? VST.manual : VST[v.st], it = v.it, p = v.st === 'vinculado' ? precoApoio(apo.sel, v.k) : null;
      return `<tr data-lin="${lin}" ${conf.has(lin) ? `class="vlin ${apo.marc[lin] ? 'vsel' : ''}" onclick="cliqueLinhaVinculo(event,'${lin}')"` : ''}><td>${conf.size ? (conf.has(lin) ? `<button class="cb sel-cx ${apo.marc[lin] ? 'on' : ''}" onclick="marcarVinculo('${lin}')" title="Selecionar para confirmar em lote"><i class="fa-solid fa-check"></i></button>` : '<span class="cb sel-cx" style="visibility:hidden"></span>') : ''}<span class="mn" style="cursor:pointer" onclick="abrirFicha('${v.e.id}')">${esc(v.e.mn)}</span>${podeTrocar && it ? `<span class="pop-mini" id="pop-ve-${lin}" data-ex="${lin}" data-tipo="ex" title="Trocar o exame LAMIC"></span>` : ''}</td><td class="desc" title="${esc(v.e.descricao)}">${esc(v.e.descricao)}</td>
        <td class="muted"><i class="fa-solid fa-arrows-left-right"></i></td>
        <td>${it ? `<span class="mn">${esc(it.codigo)}</span> <span class="tag">${esc(it.material || '—')}</span>` : '—'}${podeTrocar ? `<span class="pop-mini" id="pop-vt-${lin}" data-ex="${lin}" title="Trocar o item do apoio"></span>` : ''}</td>
        <td class="desc" title="${esc(it?.descricao || '')}">${it ? (v.st === 'conf' && !v.manual ? `<span style="color:var(--red)">${esc(it.descricao)}</span>` : esc(it.descricao)) : v.st === 'rejeitado' && v.rejIt.length ? `<span class="muted" title="${esc(v.rejIt.map(r => `${r.codigo} · ${r.descricao}`).join('\n'))}">rejeitado: ${esc(v.rejIt[0].codigo)} · ${esc(v.rejIt[0].descricao)}${v.rejIt.length > 1 ? ` (+${v.rejIt.length - 1})` : ''}</span>` : '<span class="muted">não encontrado</span>'}</td>
        <td class="num">${p ? fmt(p.valor) + (p.agendado ? ` <i class="fa-solid fa-clock" style="color:var(--amber)" title="${fmt(p.agendado.preco)} a partir de ${dataBR(p.agendado.vigencia)}"></i>` : '') : it ? fmt(it.preco) : '—'}</td>
        <td><span class="badge-s ${s.c}" title="${s.h}"><i class="fa-solid ${s.ic}"></i>${s.t}${v.sc != null && (v.manual || (v.st !== 'vinculado' && v.st !== 'auto')) ? ` ${Math.round(v.sc * 100)}%` : ''}</span></td>
        <td class="acts">${editar ? (v.st === 'vinculado'
          ? `<button title="Remover vínculo" onclick="definirVinculo('${v.e.id}', null)"><i class="fa-solid fa-link-slash"></i></button>`
          : `${v.manual ? `<button title="Desfazer a troca" onclick="delete apo.troca['${lin}'];delete apo.trocaEx['${lin}'];desenharApoioDet()"><i class="fa-solid fa-rotate-left"></i></button>` : ''}${v.k && (v.manual || v.st !== 'saiu') ? `<button title="Confirmar vínculo" onclick="definirVinculo('${v.e.id}', '${v.k}')"><i class="fa-solid fa-check"></i></button><button title="Rejeitar: não sugerir mais este item para este exame" onclick="rejeitarVinculo('${v.e.id}', '${v.k}', '${lin}')"><i class="fa-solid fa-ban" style="color:var(--red)"></i></button>` : ''}${nRej(lin) ? `<button title="Restaurar: voltar a sugerir (${nRej(lin)} item(ns) rejeitados)" onclick="restaurarRejeitados('${lin}')"><i class="fa-solid fa-rotate"></i></button>` : ''}<button title="Escolher na ficha do exame" onclick="abrirFicha('${v.e.id}');setTimeout(()=>trocarFonteCusto('apoio'),80)"><i class="fa-solid fa-magnifying-glass"></i></button>`) : ''}</td></tr>`;
    }).join('') || `<tr><td colspan="8">${vazio('fa-link', 'Nada nesta situação')}</td></tr>`}
    </tbody></table></div>
    <div class="foot">${paginacao(ls.length, apo.pag, VINC_POR_PAG, 'paginaVinculos')}</div>`;
}
function paginaVinculos(p) { apo.pag = p; desenharApoioDet(); }

// ── Confirmação em lote ───────────────────────────────────────
// A seleção mexe só nas linhas já desenhadas: não redesenha a tabela (lenta em tabelas grandes)
function htmlLoteVinculos() {
  const total = apo.conf?.size || 0, n = Object.keys(apo.marc).length, todos = total > 0 && n === total;
  return `${n ? `<span class="muted" style="font-size:12px">${n} de ${total} selecionado(s)</span>` : ''}
    <button class="btn sm" onclick="marcarVinculos()" title="${todos ? 'Desmarca todos' : `Marca os ${total} que faltam confirmar neste filtro`}"><i class="fa-solid ${todos ? 'fa-xmark' : 'fa-check-double'}"></i>${todos ? 'Desmarcar todos' : 'Selecionar todos'}</button>
    <button class="btn sm perigo-txt" ${n ? '' : 'disabled'} onclick="rejeitarVinculosMarcados()" title="Não sugerir mais estes itens para estes exames"><i class="fa-solid fa-ban"></i>Rejeitar ${n || ''}</button>
    <button class="btn sm pri" ${n ? '' : 'disabled'} onclick="confirmarVinculosMarcados()"><i class="fa-solid fa-link"></i>Confirmar ${n || ''} vínculo(s)</button>`;
}
function atualizarSelecaoVinculos() {
  document.querySelectorAll('#apoio-det tr.vlin').forEach(tr => {
    const on = !!apo.marc[tr.dataset.lin];
    tr.classList.toggle('vsel', on);
    tr.querySelector('.sel-cx')?.classList.toggle('on', on);
  });
  const lote = document.getElementById('vinc-lote'), total = apo.conf?.size || 0;
  if (lote) lote.innerHTML = htmlLoteVinculos();
  document.getElementById('vinc-cx-todos')?.classList.toggle('on', total > 0 && Object.keys(apo.marc).length === total);
}
function marcarVinculo(lin) {
  if (!apo.conf?.has(lin)) return;
  if (apo.marc[lin]) delete apo.marc[lin]; else apo.marc[lin] = true;
  atualizarSelecaoVinculos();
}
// Clique em qualquer ponto da linha seleciona; botões, mnemônico e trocas seguem com a ação própria
function cliqueLinhaVinculo(ev, lin) {
  if (ev.target.closest('button, a, input, .mn, .pop-mini')) return;
  marcarVinculo(lin);
}
// Marca (ou desmarca) todos os que faltam confirmar no filtro atual, em todas as páginas
function marcarVinculos(sim) {
  const total = apo.conf?.size || 0;
  sim ??= !(total > 0 && Object.keys(apo.marc).length === total);
  apo.marc = {};
  if (sim) apo.conf?.forEach(id => { apo.marc[id] = true; });
  atualizarSelecaoVinculos();
}

async function confirmarVinculosMarcados() {
  const itens = itensApoioSel(), u = usuarioAtual(), id = apo.sel, feitos = {};
  // um vínculo por exame: se duas linhas apontam para o mesmo exame (troca à mão), vale a primeira
  const pares = (apo.cache || []).filter(v => apo.marc[v.e.id]).map(v => ({ lin: v.e.id, v: vinculoEfetivo(v, itens) }))
    .filter(x => vinculoConfirmavel(x.v) && itens[x.v.k] && !feitos[x.v.e.id] && (feitos[x.v.e.id] = true));
  if (!pares.length) return toast('Nenhum vínculo selecionado', 'erro');
  const fracos = pares.filter(x => !x.v.manual && (x.v.st === 'fraca' || x.v.st === 'conf')).length;
  const ok = await confirmar({ titulo: `Confirmar ${pares.length} vínculo(s)?`, botao: 'Confirmar vínculos',
    texto: `Os custos destes exames passam a vir da tabela do apoio.${fracos ? ` ${fracos} são sugestões fracas ou "conferir": confira as descrições antes.` : ''}` });
  if (!ok) return;
  const upd = {}, agora = DB.agora();
  pares.forEach(({ v }) => {
    const b = `${CAMINHOS.exames}/${v.e.id}`;
    upd[`${b}/vinculoApoio`] = { apoioId: id, chave: v.k };
    upd[`${b}/negociado`] = true;
    upd[`${b}/atualizadoEm`] = agora;
    upd[`${b}/atualizadoPor`] = u.nome;
    upd[`historicoExames/${v.e.id}/${DB.novaChave('historicoExames')}`] = { descricao: `Vinculado ao item ${v.it.codigo} (${v.it.material || '—'}) do apoio`, usuario: u.nome, usuarioId: u.id, em: agora };
  });
  await DB.mesclar('/', upd);
  registrar('apoios', `${ESTADO.setores[id].nome}: ${pares.length} vínculo(s) confirmados em lote`);
  pares.forEach(({ lin }) => { delete apo.troca[lin]; delete apo.trocaEx[lin]; });
  apo.marc = {}; apo.cache = null;
  toast(`${pares.length} vínculo(s) confirmados`);
  desenharApoioDet();
}

async function rejeitarVinculosMarcados() {
  const itens = itensApoioSel(), u = usuarioAtual(), id = apo.sel;
  const pares = (apo.cache || []).filter(v => apo.marc[v.e.id]).map(v => ({ lin: v.e.id, v: vinculoEfetivo(v, itens) })).filter(x => vinculoConfirmavel(x.v) && itens[x.v.k]);
  if (!pares.length) return toast('Nenhum vínculo selecionado', 'erro');
  const ok = await confirmar({ titulo: `Rejeitar ${pares.length} sugestão(ões)?`, botao: 'Rejeitar', perigo: true,
    texto: 'Os itens sugeridos deixam de ser recomendados para estes exames, inclusive nas próximas importações.' });
  if (!ok) return;
  const upd = {}, agora = DB.agora();
  pares.forEach(({ v }) => {
    upd[`${CAMINHOS.exames}/${v.e.id}/vinculosRejeitados/${id}/${v.k}`] = Date.now();
    upd[`historicoExames/${v.e.id}/${DB.novaChave('historicoExames')}`] = { descricao: `Sugestão de vínculo rejeitada: item ${v.it.codigo} (${v.it.material || '—'}) do apoio`, usuario: u.nome, usuarioId: u.id, em: agora };
  });
  await DB.mesclar('/', upd);
  registrar('apoios', `${ESTADO.setores[id].nome}: ${pares.length} sugestão(ões) de vínculo rejeitadas em lote`);
  pares.forEach(({ lin }) => { delete apo.troca[lin]; delete apo.trocaEx[lin]; });
  apo.marc = {}; apo.cache = null;
  toast(`${pares.length} sugestão(ões) rejeitadas`);
  desenharApoioDet();
}

// Botão de troca em cada linha: popover com a tabela do apoio; a escolha fica na linha até confirmar
function popsVinculos() {
  // listas montadas uma vez por desenho, só quando um popover abre, e divididas entre todas as linhas
  let opEx, opIt;
  const exames = () => opEx ??= Object.entries(ESTADO.exames || {}).filter(([, e]) => e.setorId === apo.sel && !e.vinculoApoio)
    .sort((a, b) => a[1].mn.localeCompare(b[1].mn)).map(([id, e]) => ({ valor: id, rotulo: `${e.mn} · ${e.descricao}`, icone: 'fa-vial' }));
  const itens = () => opIt ??= lista(ESTADO.apoios[apo.sel]?.precos, (a, b) => String(a.codigo).localeCompare(b.codigo)).filter(p => !p.inativo)
    .map(p => ({ valor: p.id, rotulo: `${p.codigo} · ${p.descricao}`, icone: 'fa-flask', desc: [p.material, fmt(p.preco)].filter(Boolean).join(' · ') }));
  document.querySelectorAll('#apoio-det .pop-mini').forEach(el => {
    delete POPS[el.id];
    const lin = el.dataset.ex, ex = el.dataset.tipo === 'ex', mapa = ex ? apo.trocaEx : apo.troca;
    criarPop(el.id, {
      rotulo: 'Trocar', titulo: ex ? 'Trocar o exame LAMIC' : 'Trocar o item do apoio', icone: 'fa-right-left', busca: ex ? 'Mnemônico ou nome…' : 'Código ou nome…', padrao: '', soIcone: true,
      opcoes: () => [{ valor: '', rotulo: 'Escolha', icone: 'fa-right-left' }, ...(ex ? exames().filter(o => o.valor !== lin) : itens())].filter(o => o.valor || !popAberto),
      aoMudar: k => { if (k) mapa[lin] = k; else delete mapa[lin]; desenharApoioDet(); }
    });
  });
}

async function definirVinculo(exameId, chaveItem) {
  const e = ESTADO.exames[exameId], u = usuarioAtual();
  const upd = { vinculoApoio: chaveItem ? { apoioId: apo.sel, chave: chaveItem } : null, atualizadoEm: DB.agora(), atualizadoPor: u.nome };
  if (chaveItem) upd.negociado = true;
  await DB.mesclar(`${CAMINHOS.exames}/${exameId}`, upd);
  const it = chaveItem ? ESTADO.apoios[apo.sel]?.precos?.[chaveItem] : null;
  await DB.gravar(`historicoExames/${exameId}/${DB.novaChave('historicoExames')}`, {
    descricao: chaveItem ? `Vinculado ao item ${it?.codigo} (${it?.material || '—'}) do apoio` : 'Vínculo com o apoio removido', usuario: u.nome, usuarioId: u.id, em: DB.agora()
  });
  apo.cache = null;
  const lin = Object.keys(apo.trocaEx).find(k => apo.trocaEx[k] === exameId) || exameId;
  delete apo.troca[lin]; delete apo.trocaEx[lin];
  toast(chaveItem ? `${e.mn} vinculado` : `Vínculo de ${e.mn} removido`);
}

// Rejeita a sugestão: o item deixa de ser recomendado para este exame (vale também nas próximas importações)
async function rejeitarVinculo(exameId, chaveItem, lin) {
  const e = ESTADO.exames[exameId], u = usuarioAtual(), it = ESTADO.apoios[apo.sel]?.precos?.[chaveItem];
  delete apo.troca[lin]; delete apo.trocaEx[lin]; delete apo.marc[lin];
  await DB.mesclar('/', {
    [`${CAMINHOS.exames}/${exameId}/vinculosRejeitados/${apo.sel}/${chaveItem}`]: Date.now(),
    [`historicoExames/${exameId}/${DB.novaChave('historicoExames')}`]: { descricao: `Sugestão de vínculo rejeitada: item ${it?.codigo} (${it?.material || '—'}) do apoio`, usuario: u.nome, usuarioId: u.id, em: DB.agora() }
  });
  apo.cache = null;
  toast(`${e.mn}: sugestão ${it?.codigo || ''} rejeitada`);
  desenharApoioDet();
}

async function restaurarRejeitados(exameId) {
  const e = ESTADO.exames[exameId];
  await DB.mesclar('/', { [`${CAMINHOS.exames}/${exameId}/vinculosRejeitados/${apo.sel}`]: null });
  apo.cache = null;
  toast(`${e.mn}: sugestões rejeitadas voltaram`);
  desenharApoioDet();
}

// ── Itens da tabela: ativos / inativos, cadastro e edição à mão ──
// Item fora do arquivo importado não é apagado: fica inativo (não custeia nem é sugerido) e volta se reaparecer.
const ITENS_POR_PAG = 40;
function itensApoioFiltrados() {
  return lista(ESTADO.apoios[apo.sel]?.precos, (a, b) => String(a.codigo).localeCompare(String(b.codigo)))
    .filter(it => (apo.itF === 'inativos') === !!it.inativo && contem(`${it.codigo} ${it.descricao} ${it.material || ''}`, apo.itQ));
}
function htmlItensApoio() {
  const todos = Object.values(ESTADO.apoios[apo.sel]?.precos || {}), nI = todos.filter(it => it.inativo).length;
  if (apo.itF === 'inativos' && !nI) apo.itF = 'ativos';
  const chip = (f, t, ic, n) => `<button class="chip ${apo.itF === f ? 'on' : ''}" onclick="apo.itF='${f}';apo.itPag=1;desenharApoioDet()"><i class="fa-solid ${ic}"></i>${t} <b>${n}</b></button>`;
  return `<div class="chips" style="padding-bottom:12px;align-items:center">
      ${chip('ativos', 'Ativos', 'fa-circle-check', todos.length - nI)}${chip('inativos', 'Inativos', 'fa-ban', nI)}
      <div class="pop-search" style="margin:0 0 0 auto;min-width:240px"><i class="fa-solid fa-magnifying-glass"></i><input placeholder="Código ou descrição…" value="${esc(apo.itQ)}" oninput="apo.itQ=this.value;apo.itPag=1;desenharItensApoio()"></div>
      ${pode('custos', 'editar') ? `<button class="btn sm pri" onclick="abrirItemApoio()"><i class="fa-solid fa-plus"></i>Novo item</button>` : ''}
    </div><div id="apo-itens">${htmlTabelaItensApoio()}</div>`;
}
const desenharItensApoio = () => { const el = document.getElementById('apo-itens'); if (el) el.innerHTML = htmlTabelaItensApoio(); };
function paginaItensApoio(p) { apo.itPag = p; desenharItensApoio(); }

function htmlTabelaItensApoio() {
  const ls = itensApoioFiltrados(), editar = pode('custos', 'editar'), inat = apo.itF === 'inativos';
  const n = Math.max(1, Math.ceil(ls.length / ITENS_POR_PAG)); if (apo.itPag > n) apo.itPag = n;
  // exames vinculados a cada item
  const vinc = {};
  Object.values(ESTADO.exames || {}).forEach(e => { if (e.vinculoApoio?.apoioId === apo.sel) (vinc[e.vinculoApoio.chave] ??= []).push(e.mn); });
  return `<div class="tbl-wrap"><table><thead><tr><th>Item do apoio</th><th>Descrição no apoio</th><th>Origem</th><th>Exames LAMIC</th><th class="num">Preço</th><th>Vigência</th><th></th></tr></thead><tbody>
    ${ls.slice((apo.itPag - 1) * ITENS_POR_PAG, apo.itPag * ITENS_POR_PAG).map(it => {
      const p = inat ? null : precoApoio(apo.sel, it.id), v = vinc[it.id] || [];
      return `<tr data-k="${esc(it.id)}"><td><span class="mn">${esc(it.codigo)}</span> ${it.material ? `<span class="tag">${esc(it.material)}</span>` : ''}</td>
        <td class="desc" title="${esc(it.descricao || '')}">${esc(it.descricao || '')}</td>
        <td>${it.manual ? '<span class="badge-s base" title="Cadastrado à mão: continua na tabela mesmo fora do arquivo importado"><i class="fa-solid fa-hand"></i>manual</span>' : `<span class="badge-s off"><i class="fa-solid fa-file-import"></i>importado</span>`}${it.editadoEm && !it.manual ? ` <i class="fa-solid fa-pen muted" title="Editado à mão por ${esc(it.editadoPor || '—')} em ${dataHora(it.editadoEm)}: a próxima importação volta ao valor do arquivo"></i>` : ''}</td>
        <td>${v.length ? `<span class="mn" title="${esc(v.join(', '))}">${esc(v.slice(0, 2).join(', '))}${v.length > 2 ? ` +${v.length - 2}` : ''}</span>` : '<span class="muted">—</span>'}</td>
        <td class="num">${inat ? `<span class="muted">${fmt(it.preco)}</span>` : fmt(p.valor) + (p.agendado ? ` <i class="fa-solid fa-clock" style="color:var(--amber)" title="${fmt(p.agendado.preco)} a partir de ${dataBR(p.agendado.vigencia)}"></i>` : '')}</td>
        <td>${inat ? `<span class="muted">inativo${it.inativoEm ? ` desde ${dataBR(new Date(it.inativoEm).toISOString().slice(0, 10))}` : ''}</span>` : it.vigencia ? dataBR(p.vigencia || it.vigencia) : '<span class="muted">—</span>'}</td>
        <td class="acts">${editar ? `<button title="Editar item" onclick="abrirItemApoio(this.closest('tr').dataset.k)"><i class="fa-solid fa-pen"></i></button>
          <button title="${inat ? 'Reativar item' : 'Inativar item'}" onclick="alternarItemApoio(this.closest('tr').dataset.k)"><i class="fa-solid ${inat ? 'fa-rotate-left' : 'fa-ban'}"></i></button>` : ''}</td></tr>`;
    }).join('') || `<tr><td colspan="7">${vazio(inat ? 'fa-ban' : 'fa-list', apo.itQ ? 'Nenhum item com essa busca' : inat ? 'Nenhum item inativo' : 'Nenhum item na tabela')}</td></tr>`}
    </tbody></table></div>
    <div class="foot">${paginacao(ls.length, apo.itPag, ITENS_POR_PAG, 'paginaItensApoio')}</div>`;
}

// Lote do histórico da tabela: uma importação ou uma alteração à mão. itens: { chave: { codigo, material, descricao, tipo, de, para, vigDe, vigPara } }
function loteHistoricoApoio(tipo, itens, extra = {}, apoioId = apo.sel) {
  return { [`${CAMINHOS.apoios}/${apoioId}/historico/${DB.novaChave(`${CAMINHOS.apoios}/${apoioId}/historico`)}`]: { tipo, em: Date.now(), por: usuarioAtual().nome, ...extra, itens } };
}
const itemHistorico = (it, tipo, m = {}) => ({ codigo: it.codigo, material: it.material || '', descricao: it.descricao || '', tipo, de: m.de ?? null, para: m.para ?? null, vigDe: m.vigDe || null, vigPara: m.vigPara || null });

let _iaK = null;
function abrirItemApoio(k) {
  const it = k ? ESTADO.apoios[apo.sel]?.precos?.[k] : null, a = ESTADO.setores[apo.sel];
  _iaK = it ? k : null;
  abrirGaveta({
    sobre: it ? 'Editar item do apoio' : 'Novo item do apoio', titulo: it ? `${it.codigo}${it.material ? ` · ${it.material}` : ''}` : a.nome,
    corpo: `<div class="form-col">
      ${it && !it.manual ? '<div class="alert a" style="margin:0"><i class="fa-solid fa-file-import"></i><div>Item importado: a alteração vale até a próxima importação da tabela, que volta a usar o valor do arquivo.</div></div>'
        : !it ? '<div class="alert x" style="margin:0"><i class="fa-solid fa-hand"></i><div>Item cadastrado à mão: continua na tabela mesmo quando o arquivo importado não o traz.</div></div>' : ''}
      ${campo('ia-cod', 'Código no apoio', it?.codigo || '', { tipo: 'text', ph: 'Ex.: TSH', desab: !!it })}
      ${campo('ia-mat', 'Material', it?.material || '', { tipo: 'text', ph: 'Opcional (ex.: S, LIQ)', desab: !!it, dica: it ? '' : 'diferencia itens de mesmo código' })}
      ${it ? '' : '<div class="chips sem-pad ia-mats" id="ia-mats" hidden></div>'}
      ${campo('ia-desc', 'Descrição no apoio', it?.descricao || '', { tipo: 'text' })}
      ${campo('ia-preco', 'Preço', it ? Number(it.preco).toFixed(2) : '', { pre: 'R$', passo: '0.01', ph: '0,00' })}
      ${campo('ia-vig', 'Vigência', it?.vigencia || hojeISO(), { tipo: 'date', dica: 'a partir de quando o preço vale · com data futura, o preço atual segue valendo até lá' })}
    </div>`,
    rodape: `<button class="btn" onclick="fecharGaveta()">Cancelar</button><button class="btn pri" onclick="gravarItemApoio()"><i class="fa-solid fa-floppy-disk"></i>Salvar item</button>`
  });
  const mat = document.getElementById('ia-mat');
  if (!it && mat) {
    mat.autocomplete = 'off';
    ['focus', 'input', 'blur'].forEach(ev => mat.addEventListener(ev, () => setTimeout(desenharMateriaisApoio)));
  }
}

// Materiais já usados nos itens deste apoio, do mais comum ao menos: aparecem sob o campo enquanto ele tem o foco
function materiaisApoio() {
  const n = {};
  Object.values(ESTADO.apoios[apo.sel]?.precos || {}).forEach(it => { const m = (it.material || '').trim(); if (m) n[m] = (n[m] || 0) + 1; });
  return Object.entries(n).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
function desenharMateriaisApoio() {
  const el = document.getElementById('ia-mats'), inp = document.getElementById('ia-mat');
  if (!el || !inp) return;
  const atual = inp.value.trim().toUpperCase(), ls = materiaisApoio().filter(([m]) => contem(m, inp.value.trim()));
  // mousedown não tira o foco do campo: a lista continua aberta para o clique chegar
  el.innerHTML = ls.map(([m, q]) => `<button type="button" class="chip ${m.toUpperCase() === atual ? 'on' : ''}" data-m="${esc(m)}" onmousedown="event.preventDefault()" onclick="escolherMaterialApoio(this.dataset.m)">${esc(m)} <b>${q}</b></button>`).join('')
    || `<span class="hint">${materiaisApoio().length ? 'Nenhum material igual: será cadastrado um novo' : 'Nenhum material cadastrado neste apoio ainda'}</span>`;
  el.hidden = document.activeElement !== inp;
}
function escolherMaterialApoio(m) {
  const inp = document.getElementById('ia-mat');
  inp.value = m;
  desenharMateriaisApoio();
  document.getElementById('ia-desc')?.focus();
}

async function gravarItemApoio() {
  const base = `${CAMINHOS.apoios}/${apo.sel}/precos`, precos = ESTADO.apoios[apo.sel]?.precos || {}, a = ESTADO.setores[apo.sel], u = usuarioAtual();
  const old = _iaK ? precos[_iaK] : null;
  const cod = old ? old.codigo : valorCampo('ia-cod').trim(), mat = old ? old.material || '' : valorCampo('ia-mat').trim();
  const desc = valorCampo('ia-desc').trim(), preco = Math.round(numCampo('ia-preco') * 100) / 100, vig = valorCampo('ia-vig') || hojeISO();
  if (!cod) return toast('Informe o código do item', 'erro');
  if (!(preco >= 0)) return toast('Informe o preço', 'erro');
  const k = _iaK || chaveItemApoio(cod, mat);
  if (!old && precos[k]) return toast(precos[k].inativo ? `O item ${cod} já existe e está inativo: reative-o em "Inativos"` : `O item ${cod} já existe na tabela`, 'erro');
  let item, hist;
  if (!old) {
    item = { codigo: cod, material: mat, descricao: desc, preco, vigencia: vig, manual: true, desde: Date.now(), criadoPor: u.nome };
    hist = itemHistorico(item, 'criado', { para: preco, vigPara: vig });
  } else {
    const mudouValor = old.preco !== preco || (old.vigencia || '') !== vig;
    if (!mudouValor && (old.descricao || '') === desc) return fecharGaveta();
    item = { ...old, descricao: desc, preco, vigencia: vig, editadoEm: Date.now(), editadoPor: u.nome };
    // o preço que valia segue valendo até a nova vigência (ver precoApoio)
    if (mudouValor) item.anterior = old.vigencia > hojeISO() && old.anterior ? old.anterior : { preco: old.preco, vigencia: old.vigencia || null };
    hist = itemHistorico(item, 'editado', { de: old.preco, para: preco, vigDe: old.vigencia, vigPara: vig });
  }
  await DB.mesclar('/', { [`${base}/${k}`]: item, ...loteHistoricoApoio('manual', { [k]: hist }) });
  registrar('apoios', `${a.nome}: item ${cod} ${old ? `alterado à mão (${fmt(old.preco)} → ${fmt(preco)})` : `cadastrado à mão (${fmt(preco)})`}`);
  apo.cache = null;
  fecharGaveta();
  toast(`Item ${cod} ${old ? 'atualizado' : 'cadastrado'}`);
}

async function alternarItemApoio(k) {
  const it = ESTADO.apoios[apo.sel]?.precos?.[k], a = ESTADO.setores[apo.sel];
  if (!it) return;
  const inativar = !it.inativo, base = `${CAMINHOS.apoios}/${apo.sel}/precos/${k}`;
  if (inativar) {
    const vinc = Object.values(ESTADO.exames || {}).filter(e => e.vinculoApoio?.apoioId === apo.sel && e.vinculoApoio.chave === k).map(e => e.mn);
    const ok = await confirmar({ titulo: `Inativar o item ${it.codigo}?`, botao: 'Inativar', perigo: vinc.length > 0,
      texto: vinc.length ? `<b>${vinc.length} exame(s)</b> vinculado(s) (${esc(vinc.slice(0, 5).join(', '))}${vinc.length > 5 ? '…' : ''}) deixam de ter o custo vindo da tabela e aparecem como "Saiu da tabela".` : 'O item deixa de ser sugerido e de custear exames. Dá para reativar depois.' });
    if (!ok) return;
  }
  await DB.mesclar('/', { [`${base}/inativo`]: inativar ? true : null, [`${base}/inativoEm`]: inativar ? Date.now() : null,
    ...loteHistoricoApoio('manual', { [k]: itemHistorico(it, inativar ? 'inativado' : 'reativado', inativar ? { de: it.preco, vigDe: it.vigencia } : { para: it.preco, vigPara: it.vigencia }) }) });
  registrar('apoios', `${a.nome}: item ${it.codigo} ${inativar ? 'inativado' : 'reativado'} à mão`);
  apo.cache = null;
  toast(`Item ${it.codigo} ${inativar ? 'inativado' : 'reativado'}`);
}

// ── Histórico de alterações da tabela, por lote ───────────────
const TIPOS_HIST_APOIO = {
  novo:      { t: 'Novo',      c: 'ok',   ic: 'fa-plus' },
  criado:    { t: 'Criado à mão', c: 'ok', ic: 'fa-hand' },
  alterado:  { t: 'Alterado',  c: 'base', ic: 'fa-right-left' },
  editado:   { t: 'Editado à mão', c: 'base', ic: 'fa-pen' },
  inativado: { t: 'Inativado', c: 'off',  ic: 'fa-ban' },
  reativado: { t: 'Reativado', c: 'ok',   ic: 'fa-rotate-left' }
};
const HIST_ITENS_MAX = 300;
function htmlHistoricoApoio() {
  const lotes = lista(ESTADO.apoios[apo.sel]?.historico, (a, b) => (b.em || 0) - (a.em || 0));
  if (!lotes.length) return vazio('fa-clock-rotate-left', '<b>Sem histórico ainda</b><br>As próximas importações e alterações à mão desta tabela aparecem aqui, lote a lote.');
  const vig = (de, para) => de && para && de !== para ? `${dataBR(de)} → <b>${dataBR(para)}</b>` : para || de ? dataBR(para || de) : '<span class="muted">—</span>';
  return `<div class="ah-l">${lotes.map((l, i) => {
    const imp = l.tipo === 'importacao', itens = Object.values(l.itens || {}).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
    const cnt = {}; itens.forEach(x => { cnt[x.tipo] = (cnt[x.tipo] || 0) + 1; });
    if (imp && l.n) Object.assign(cnt, { novo: l.n.novos || 0, alterado: l.n.alterados || 0, inativado: l.n.inativados || 0, reativado: l.n.reativados || 0 });
    const resumo = Object.keys(TIPOS_HIST_APOIO).filter(t => cnt[t]).map(t => `<span class="badge-s ${TIPOS_HIST_APOIO[t].c}"><i class="fa-solid ${TIPOS_HIST_APOIO[t].ic}"></i>${cnt[t]} ${TIPOS_HIST_APOIO[t].t.toLowerCase()}</span>`).join('');
    return `<details class="ah" ${i === 0 ? 'open' : ''}><summary><span class="po-ic" style="--c:${imp ? 'var(--cyan)' : 'var(--amber)'}"><i class="fa-solid ${imp ? 'fa-file-import' : 'fa-hand'}"></i></span>
        <div class="ah-t"><b>${imp ? `Importação${l.arquivo ? ` · ${esc(l.arquivo)}` : ''}` : 'Alteração à mão'}</b><small>${dataHora(l.em)} · ${esc(l.por || '—')}${imp && l.vigencia ? ` · vigência ${dataBR(l.vigencia)}` : ''}${imp && l.total != null ? ` · ${num(l.total, 0)} itens ativos` : ''}</small></div>
        <span class="ah-r">${resumo || '<span class="muted" style="font-size:12px">sem alterações de valor</span>'}</span><i class="fa-solid fa-chevron-down ah-chev"></i></summary>
      ${itens.length ? `<div class="tbl-wrap"><table><thead><tr><th>Item</th><th>Descrição</th><th>Alteração</th><th class="num">Preço</th><th>Vigência do custo</th></tr></thead><tbody>
        ${itens.slice(0, HIST_ITENS_MAX).map(x => {
          const tp = TIPOS_HIST_APOIO[x.tipo] || TIPOS_HIST_APOIO.alterado, so = x.de != null && x.para != null && x.de === x.para;
          const d = x.de > 0 && x.para != null && !so ? x.para / x.de - 1 : null;
          return `<tr><td><span class="mn">${esc(x.codigo)}</span> ${x.material ? `<span class="tag">${esc(x.material)}</span>` : ''}</td><td class="desc" title="${esc(x.descricao || '')}">${esc(x.descricao || '')}</td>
            <td><span class="badge-s ${tp.c}"><i class="fa-solid ${tp.ic}"></i>${so ? 'Vigência' : tp.t}</span></td>
            <td class="num">${x.de != null && x.para != null && !so ? `<span class="muted">${fmt(x.de)}</span> → <b>${fmt(x.para)}</b>${d ? ` <small style="color:var(--${d > 0 ? 'red' : 'green'})">${d > 0 ? '+' : ''}${pct(d)}</small>` : ''}` : x.para != null ? fmt(x.para) : x.de != null ? `<span class="muted">${fmt(x.de)}</span>` : '—'}</td>
            <td>${vig(x.vigDe, x.vigPara)}</td></tr>`;
        }).join('')}</tbody></table></div>${itens.length > HIST_ITENS_MAX ? `<div class="hint" style="padding:8px 18px">+ ${itens.length - HIST_ITENS_MAX} itens neste lote</div>` : ''}`
        : `<div class="hint" style="padding:10px 18px">${imp && l.primeira ? 'Primeira importação: os itens entraram todos como novos e não são listados um a um.' : 'Nenhum valor mudou neste lote.'}</div>`}</details>`;
  }).join('')}</div>`;
}
