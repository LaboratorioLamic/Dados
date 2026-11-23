// ═══════════════════════════════════════════════════════════════
// sincronizar.js — Sincronização com o Unilab: vários CSVs de uma vez
// (Particular e demais tabelas) e relatório de divergências
// ═══════════════════════════════════════════════════════════════
//
// Cada arquivo (código;índice;porte;ch;filme;mnemonico;efetua;vlrporte) é ligado a uma
// tabela pelo nome (PARTICULAR.csv, CARTOES_DE_DESCONTO.csv…), com ajuste manual.
// Particular: preço no Unilab, efetua S/N, exames novos e fora do sistema.
// Demais tabelas: preço no Unilab de cada exame (tabelas/{id}/sistema).
// Preço diferente: só registra (aparece como divergência) ou vai ao rascunho.

const sinc = { passo: 0, arqs: [], erro: '', precos: 'manter', novos: true, novosN: false, fora: true, incluir: false, res: null };
const PASSOS_SINC = ['Arquivos', 'Conferir', 'Concluído'];
const slugTabela = s => normalizar(s).replace(/\.csv$/, '').replace(/[^a-z0-9]+/g, '');

// Divergências atuais (preço salvo × preço no Unilab), sem precisar de arquivo
function divergenciasUnilab() {
  const ls = [];
  ['particular', ...tabelasLista(false).map(t => t.id)].forEach(alvo => {
    const cx = ctxAlvo(alvo);
    const ks = cx.base ? examesVisiveis().filter(e => e.ativo !== false).map(e => e.id) : Object.keys(cx.tab.precos || {});
    ks.forEach(k => {
      const e = ESTADO.exames[k], p = cx.salvo(k), s = cx.sistema(k);
      if (e && p != null && s != null && Math.abs(s - p) > 0.004) ls.push({ alvo, tabela: cx.nome, e, k, lamic: p, unilab: s });
    });
  });
  return ls;
}

function exportarDivergenciasUnilab() {
  const ls = divergenciasUnilab();
  if (!ls.length) return toast('Nenhuma divergência com o Unilab', 'aviso');
  const dec = v => String(Math.round(v * 100) / 100).replace('.', ',');
  const csv = ['Tabela;Mnemônico;Exame;Preço LAMIC;Preço Unilab;Diferença',
    ...ls.map(x => [x.tabela, x.e.mn, `"${String(x.e.descricao || '').replace(/"/g, '""')}"`, dec(x.lamic), dec(x.unilab), dec(x.unilab - x.lamic)].join(';'))].join('\r\n') + '\r\n';
  baixarArquivo('Divergências com o Unilab.csv', new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
}

const desenharSinc = () => { const c = document.getElementById('sinc-card'); if (c) { c.innerHTML = htmlSinc(); popsSinc(); } };
function reiniciarSinc() { Object.assign(sinc, { passo: 0, arqs: [], erro: '', res: null }); desenharSinc(); }

function htmlSinc() {
  const passos = `<div class="steps">${PASSOS_SINC.map((s, i) => `<div class="step ${i < sinc.passo ? 'done' : i === sinc.passo ? 'cur' : ''}"><span class="c">${i < sinc.passo ? '<i class="fa-solid fa-check"></i>' : i + 1}</span>${s}</div>`).join('')}</div>`;
  const cab = `<div class="sec-card-h"><span class="tc-ic" style="--c:#6366f1"><i class="fa-solid fa-rotate"></i></span><div><h3>Sincronizar com o Unilab</h3><div class="sub">CSV da Particular e das demais tabelas, vários arquivos de uma vez</div></div></div>`;
  const kp = (ic, cor, rot, v, s = '') => `<div class="imp"><div class="l"><i class="fa-solid ${ic}" style="color:${cor}"></i>${rot}</div><div class="v">${num(v, 0)}</div>${s ? `<div class="d muted">${s}</div>` : ''}</div>`;
  let corpo = '', rodape = '';

  if (sinc.passo === 0) {
    const divs = divergenciasUnilab(), nTab = new Set(divs.map(x => x.alvo)).size;
    const ult = Math.max(0, ...tabelasLista().map(t => t.importadoEm || 0));
    corpo = `
      <div class="alert ${divs.length ? 'a' : 'x'}"><i class="fa-solid ${divs.length ? 'fa-code-compare' : 'fa-circle-check'}"></i><div>
        ${divs.length ? `<b>${num(divs.length, 0)} preço(s) diferentes do Unilab</b> em ${nTab} tabela(s), pela última importação${ult ? ` (${dataHora(ult)})` : ''}.
          <div style="margin-top:6px"><button class="btn sm" onclick="exportarDivergenciasUnilab()"><i class="fa-solid fa-file-csv"></i>Exportar divergências</button></div>`
        : 'Nenhuma divergência registrada com o Unilab. Envie os arquivos atuais para conferir.'}</div></div>
      <label class="drop ${sinc.arqs.length ? 'ok' : ''}" for="sinc-arq"><input type="file" id="sinc-arq" accept=".csv,text/csv" multiple onchange="lerArquivosSinc(this)">
        <i class="fa-solid ${sinc.arqs.length ? 'fa-circle-check' : 'fa-cloud-arrow-up'}"></i><b>Tabelas exportadas do Unilab (.csv)</b>
        <div class="drop-s">${sinc.arqs.length ? sinc.arqs.map(x => esc(x.nome)).join(' · ') : 'Selecione um ou mais arquivos: PARTICULAR.csv, CARTOES_DE_DESCONTO.csv…'}</div></label>
      ${sinc.erro ? `<div class="alert r" style="margin-top:12px"><i class="fa-solid fa-circle-xmark"></i><div>${esc(sinc.erro)}</div></div>` : ''}`;
    rodape = `<span class="muted" style="font-size:12px">Nada é gravado nesta etapa</span><button class="btn pri" ${sinc.arqs.length ? '' : 'disabled'} onclick="sinc.passo=1;desenharSinc()">Conferir<i class="fa-solid fa-arrow-right"></i></button>`;
  }

  if (sinc.passo === 1) {
    foraCatalogoSinc();
    const us = sinc.arqs.filter(x => x.a), part = us.find(x => x.alvo === 'particular')?.a.part;
    const tot = k => us.reduce((s, x) => s + x.a[k], 0), cria = pode('exames', 'criar'), edita = pode('tabelas', 'editar');
    const op = (v, t, d, ic) => `<button type="button" class="oc ${sinc.precos === v ? 'on' : ''}" onclick="sinc.precos='${v}';desenharSinc()"><span class="po-ic"><i class="fa-solid ${ic}"></i></span><span><b>${t}</b><small>${d}</small></span><i class="fa-solid fa-circle-check ck"></i></button>`;
    const sw = (campo, t, d, ic, desab) => `<div class="casc-r"><div class="lft"><i class="fa-solid ${ic}"></i><div>${t}<div class="s">${d}</div></div></div>${chave(sinc[campo] && !desab, `sinc.${campo}=!sinc.${campo};this.classList.toggle('on')`, desab)}</div>`;
    const soTab = us.filter(x => x.alvo !== 'particular').reduce((s, x) => s + x.a.so, 0);
    corpo = `
      <div class="sumgrid">
        ${kp('fa-file-csv', 'var(--text-muted)', 'Arquivos', us.length, `${sinc.arqs.length - us.length} ignorado(s)`)}
        ${kp('fa-arrows-rotate', 'var(--cyan)', 'Preços conferidos', tot('cad'))}
        ${kp('fa-code-compare', 'var(--amber)', 'Preço diferente', tot('div'), 'Unilab × LAMIC')}
        ${kp('fa-plus', 'var(--green)', 'Só no Unilab', tot('so'), 'exames novos ou fora da tabela')}
        ${kp('fa-plug-circle-xmark', 'var(--red)', 'Fora do arquivo', tot('fora'), 'na base, não no Unilab')}
      </div>
      <div class="tbl-wrap card-in"><table><thead><tr><th>Arquivo</th><th style="min-width:230px">Tabela</th><th class="num">Linhas</th><th class="num">Conferidos</th><th class="num">Diferentes</th><th class="num">Só no Unilab</th><th class="num">Fora do arquivo</th></tr></thead>
        <tbody>${sinc.arqs.map((x, i) => `<tr><td class="desc" title="${esc(x.nome)}"><i class="fa-solid fa-file-csv muted"></i> ${esc(x.nome)}</td>
          <td>${x.erro ? `<span class="st r"><i class="fa-solid fa-circle-xmark"></i><span class="st-t">${esc(x.erro)}</span></span>` : `<div id="pop-sinc-${i}"></div>`}</td>
          ${x.a ? `<td class="num">${num(x.a.linhas, 0)}</td><td class="num">${num(x.a.cad, 0)}</td><td class="num">${x.a.div ? `<b style="color:var(--amber)">${num(x.a.div, 0)}</b>` : '0'}</td><td class="num">${num(x.a.so, 0)}</td><td class="num">${num(x.a.fora, 0)}</td>`
            : '<td class="num muted" colspan="5">não será importado</td>'}</tr>`).join('')}</tbody></table></div>
      ${tot('div') ? `<div class="sec-t" style="margin-top:16px"><i class="fa-solid fa-code-compare"></i>Preços diferentes (${num(tot('div'), 0)})</div>
        <div class="opt-cards">
          ${op('manter', 'Manter os preços do LAMIC', 'Só registra o valor do Unilab: aparece como divergência em cada tabela', 'fa-lock')}
          ${op('rascunho', 'Levar o valor do Unilab ao meu rascunho', 'Revise em cada tabela e envie para aprovação', 'fa-pen')}
        </div>` : ''}
      <div class="sec-t" style="margin-top:16px"><i class="fa-solid fa-sliders"></i>Ao importar</div>
      <div class="casc">
        <div class="casc-r"><div class="lft"><i class="fa-solid fa-desktop"></i><div>Atualizar o preço no Unilab em ${us.length} tabela(s)<div class="s">referência das divergências; substitui a importação anterior</div></div></div><span class="badge-s ok">sempre</span></div>
        ${part ? sw('novos', `Particular: cadastrar os ${part.novosS.length} exames novos`, cria ? 'preço = valor do Unilab; sem custo e sem setor (entram em Pendências)' : 'seu grupo não pode criar exames', 'fa-plus', !cria || !part.novosS.length)
          + sw('novosN', `Particular: cadastrar também os ${part.novosN.length} com efetua = N`, 'entram inativos, sem preço', 'fa-ban', !cria || !part.novosN.length)
          + sw('fora', `Particular: marcar ${part.fora.length} exame(s) como fora do catálogo`, 'ativos na base que não estão em nenhuma tabela do Unilab', 'fa-plug-circle-xmark', !part.fora.length) : ''}
        ${us.some(x => x.alvo !== 'particular') ? sw('incluir', `Incluir nas tabelas os ${soTab} exame(s) que só têm preço no Unilab`, edita ? 'o valor do Unilab vira o preço da tabela (sem passar por aprovação)' : 'seu grupo não pode editar tabelas', 'fa-copy', !edita || !soTab) : ''}
      </div>
      ${sinc.erro ? `<div class="alert r" style="margin-top:12px"><i class="fa-solid fa-circle-xmark"></i><div>${esc(sinc.erro)}</div></div>` : ''}`;
    rodape = `<button class="btn" onclick="sinc.passo=0;sinc.erro='';desenharSinc()"><i class="fa-solid fa-arrow-left"></i>Voltar</button>
      <button class="btn pri" id="sinc-gravar" ${us.length ? '' : 'disabled'} onclick="gravarSinc()"><i class="fa-solid fa-check"></i>Sincronizar</button>`;
  }

  if (sinc.passo === 2) {
    const r = sinc.res;
    corpo = `<div class="done-box"><i class="fa-solid fa-circle-check"></i><h3>Sincronização concluída</h3>
      <p>${r.tabelas} tabela(s) · ${num(r.conferidos, 0)} preços conferidos · ${num(r.div, 0)} diferentes${r.novos ? ` · ${r.novos} exame(s) novos` : ''}${r.incluidos ? ` · ${r.incluidos} incluídos nas tabelas` : ''}${r.rasc ? ` · ${r.rasc} no rascunho` : ''}</p>
      <div style="display:flex;gap:8px;justify-content:center;margin-top:18px;flex-wrap:wrap">
        ${r.div ? `<button class="btn" onclick="exportarDivergenciasUnilab()"><i class="fa-solid fa-file-csv"></i>Exportar divergências</button>` : ''}
        ${pode('tabelas') ? `<button class="btn pri" onclick="tabAba='tabelas';tabSel='${r.primeiro}';grade.alvo=null;grade.proxFiltro='${r.rasc ? 'ed' : r.div ? 'div' : ''}';irPara('tabelas')"><i class="fa-solid fa-table-list"></i>${r.rasc ? 'Revisar rascunho' : 'Ver nas tabelas'}</button>` : ''}</div></div>`;
    rodape = `<button class="btn" onclick="reiniciarSinc()"><i class="fa-solid fa-rotate-left"></i>Nova sincronização</button><span></span>`;
  }
  return cab + passos + `<div class="wz-body">${corpo}</div>` + (rodape ? `<div class="wz-f">${rodape}</div>` : '');
}

// Popover de tabela em cada arquivo (passo Conferir)
function popsSinc() {
  if (sinc.passo !== 1) return;
  sinc.arqs.forEach((x, i) => {
    if (x.erro) return;
    delete POPS[`pop-sinc-${i}`];
    criarPop(`pop-sinc-${i}`, {
      rotulo: 'Tabela', titulo: 'Tabela deste arquivo', icone: 'fa-table-list', padrao: x.alvo,
      opcoes: () => [{ valor: '', rotulo: 'Não importar', icone: 'fa-ban', cor: 'var(--gray)' },
        { valor: 'particular', rotulo: 'Particular', icone: 'fa-user', cor: '#00a8cc', desc: 'tabela base' },
        ...tabelasLista().map(t => ({ valor: t.id, rotulo: t.nome, icone: t.icone, cor: t.cor, qtd: Object.keys(t.precos || {}).length }))],
      aoMudar: v => { x.alvo = v; analisarArqSinc(x); sinc.erro = ''; desenharSinc(); }
    });
  });
}

async function lerArquivosSinc(input) {
  const fs = [...input.files];
  if (!fs.length) return;
  sinc.erro = '';
  try {
    await garantirCatalogo();
    const alvos = [['particular', 'Particular'], ...tabelasLista().map(t => [t.id, t.nome])];
    sinc.arqs = await Promise.all(fs.map(async f => {
      const bytes = new Uint8Array(await f.arrayBuffer());
      let txt = new TextDecoder('utf-8').decode(bytes);
      if (txt.includes('�')) txt = new TextDecoder('iso-8859-1').decode(bytes);
      const x = { nome: f.name, alvo: alvos.find(([, n]) => slugTabela(n) === slugTabela(f.name))?.[0] || '' };
      try { x.sis = analisarSistema(txt); } catch (e) { x.erro = 'não é um CSV do Unilab'; }
      analisarArqSinc(x);
      return x;
    }));
    if (sinc.arqs.every(x => x.erro)) throw new Error('Nenhum arquivo no formato do Unilab (código;índice;porte;ch;filme;mnemonico;efetua;vlrporte).');
    sinc.passo = 1;
  } catch (e) { sinc.erro = e.message; }
  desenharSinc();
}

// Resumo de um arquivo contra a tabela escolhida
function analisarArqSinc(x) {
  x.a = null;
  if (!x.sis || !x.alvo) return;
  if (x.alvo === 'particular') {
    const p = analiseUnilabParticular(x.sis);
    x.a = { linhas: p.linhas, cad: p.atualizar.length, div: p.divergentes.length, so: p.novosS.length, fora: p.fora.length, part: p };
    return;
  }
  const atuais = ESTADO.tabelas[x.alvo]?.precos || {}, porMn = mapaMnemonicos(), sistema = {};
  Object.values(x.sis).forEach(s => {
    const k = porMn[s.mn.toUpperCase()];
    if (k && s.efetua && s.ch > 0) sistema[k] = s.ch;
  });
  const ks = Object.keys(sistema);
  x.a = {
    linhas: Object.keys(x.sis).length, cad: ks.length, sistema,
    divs: ks.filter(k => atuais[k] != null && Math.abs(atuais[k] - sistema[k]) > 0.004),
    sos: ks.filter(k => atuais[k] == null),
    fora: Object.keys(atuais).filter(k => sistema[k] == null).length
  };
  x.a.div = x.a.divs.length; x.a.so = x.a.sos.length;
}

// Fora do catálogo da Particular: tira os que aparecem nos outros arquivos desta sincronização
function foraCatalogoSinc() {
  const outros = new Set(sinc.arqs.filter(x => x.a?.sistema).flatMap(x => Object.keys(x.a.sistema)));
  const p = sinc.arqs.find(x => x.alvo === 'particular' && x.a)?.a;
  if (!p?.part) return;
  p.part.fora = p.part.fora.filter(k => !outros.has(k));
  p.part.desmarcar = [...new Set([...(p.part.desmarcar || []), ...Object.keys(ESTADO.exames).filter(k => ESTADO.exames[k].foraDoSistema && outros.has(k))])];
  p.fora = p.part.fora.length;
}

async function gravarSinc() {
  foraCatalogoSinc();
  const us = sinc.arqs.filter(x => x.a);
  const rep = us.find((x, i) => us.findIndex(y => y.alvo === x.alvo) !== i);
  if (rep) { sinc.erro = `Dois arquivos apontam para a mesma tabela (${ctxAlvo(rep.alvo).nome}): escolha "Não importar" em um deles.`; return desenharSinc(); }
  const bt = document.getElementById('sinc-gravar');
  if (bt) { bt.disabled = true; bt.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>Gravando…'; }
  const upd = {}, rascs = {}, agora = DB.agora(), edita = pode('tabelas', 'editar');
  const r = { tabelas: us.length, conferidos: 0, div: 0, novos: 0, incluidos: 0, rasc: 0, primeiro: (us.find(x => x.a.div) || us[0]).alvo };
  us.forEach(x => {
    const a = x.a;
    r.conferidos += a.cad; r.div += a.div;
    if (x.alvo === 'particular') {
      r.novos += gravacoesUnilabParticular(a.part, { precos: 'manter', novos: sinc.novos, novosN: sinc.novosN, fora: sinc.fora }, upd).novos.length;
      if (sinc.precos === 'rascunho' && a.div) rascs.particular = Object.fromEntries(a.part.divergentes.map(d => [d.k, d.para]));
      return;
    }
    const base = `${CAMINHOS.tabelas}/${x.alvo}`;
    const s0 = ESTADO.tabelas[x.alvo]?.sistema || {};
    [...new Set([...Object.keys(a.sistema), ...Object.keys(s0)])].forEach(k => { if (precoDifere(s0[k], a.sistema[k])) upd[`${base}/sistema/${k}`] = a.sistema[k] ?? null; });
    upd[`${base}/importadoEm`] = agora;
    upd[`${base}/arquivo`] = x.nome;
    if (sinc.incluir && edita) a.sos.forEach(k => { upd[`${base}/precos/${k}`] = a.sistema[k]; r.incluidos++; });
    if (sinc.precos === 'rascunho' && a.div) rascs[x.alvo] = Object.fromEntries(a.divs.map(k => [k, a.sistema[k]]));
  });
  try {
    await DB.mesclar('/', upd);
    for (const [alvo, vals] of Object.entries(rascs)) {
      await carregarRascunho(alvo);
      r.rasc += await substituirRasc(alvo, { ...rasc(alvo), ...vals });
    }
    registrar('tabelas', `Sincronização com o Unilab: ${r.tabelas} tabela(s), ${r.conferidos} preços, ${r.div} diferentes, ${r.novos} exames novos, ${r.incluidos} incluídos, ${r.rasc} no rascunho`, { arquivos: us.map(x => x.nome) });
    sinc.res = r; sinc.passo = 2; sinc.erro = '';
  } catch (e) {
    console.error(e);
    sinc.erro = 'Falha ao gravar: ' + e.message;
  }
  desenharSinc();
}
