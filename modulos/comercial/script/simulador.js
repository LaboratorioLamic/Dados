// ═══════════════════════════════════════════════════════════════
// simulador.js — Simulador de reajuste e proposta para laboratório
// ═══════════════════════════════════════════════════════════════
//
// Reajuste: aplica uma regra (percentual, levar ao piso, margem desejada,
//   sugerido, desconto sobre a referência) aos preços salvos de uma tabela,
//   mostra o impacto e leva o resultado ao rascunho do usuário (→ proposta).
// Comparar tabelas: duas tabelas lado a lado (diferentes, maior/menor, ausentes em uma),
//   cada lado com sua regra de ajuste e edição manual; cada lado gera o próprio rascunho.
// Proposta para laboratório (antiga aba 01.LAB da Lamic-to-Lab): preço
//   proposto × volume mensal por exame, filtro por prazo, margem ponderada e
//   viabilidade pelo piso da tabela. Simulações ficam em simulacoes/{id}.
// Proposta para cliente: exames incluídos pela busca × volume de exame, com um
//   só atendimento dividido entre eles (simulacoes/{id} com tipo 'cli').
// Proposta para médico: desconto aos pacientes encaminhados pelo médico. Custo de cada exame sem a coleta,
//   volume = expectativa mensal de envio; exames pela busca ou todos da tabela (tipo 'med').
// Propostas empresas: o mesmo módulo (pm aponta para o estado da aba), custo sem o atendimento (tipo 'emp').

const SIM_POR_PAG = 50;
// aba lembrada ao recarregar a página
let simAba = (() => { try { return localStorage.getItem('simAba') || 'reajuste'; } catch { return 'reajuste'; } })();
SUBNAV_GANCHO.simulador = p => { simAba = p; try { localStorage.setItem('simAba', p); } catch {} renderSimulador(); };

// Arredonda para cima no múltiplo m (0 = centavos)
const arredSim = (v, m) => v == null ? null : m ? Math.ceil(v / m - 1e-9) * m : Math.round(v * 100) / 100;
const alvosSimulaveis = () => ['particular', ...tabelasLista().map(t => t.id), ...lista(ESTADO.laboratorios, porNome).map(l => 'lab:' + l.id), ...lista(ESTADO.conveniados, porNome).map(c => 'conv:' + c.id)];
const OPCOES_ARRED = [
  { valor: '0', rotulo: 'Centavos', icone: 'fa-coins', desc: 'Sem arredondar' },
  { valor: '1', rotulo: 'R$ 1,00', icone: 'fa-coins', desc: 'Para cima, sem centavos' },
  { valor: '5', rotulo: 'R$ 5,00', icone: 'fa-coins', desc: 'Múltiplo de 5, para cima' },
  { valor: '10', rotulo: 'R$ 10,00', icone: 'fa-coins', desc: 'Múltiplo de 10, para cima' }
];

function renderSimulador() {
  const el = document.getElementById('s-simulador');
  const nTipo = t => lista(ESTADO.simulacoes).filter(s => (s.tipo || 'lab') === t).length, salvas = nTipo('lab'), salvasCli = nTipo('cli'), salvasMed = nTipo('med'), salvasEmp = nTipo('emp');
  el.innerHTML = `
    <div class="h-row"><div><h2>Simulador</h2><p>Veja o impacto antes de aplicar. Nenhum preço muda até a proposta ser aprovada.</p></div></div>
    <div class="subnav-row"><div class="subnav" data-grupo="simulador">
      <button data-p="reajuste" class="${simAba === 'reajuste' ? 'on' : ''}"><i class="fa-solid fa-arrow-trend-up"></i>Reajuste de tabela</button>
      <button data-p="cmp" class="${simAba === 'cmp' ? 'on' : ''}"><i class="fa-solid fa-code-compare"></i>Comparar tabelas</button>
      <button data-p="lab" class="${simAba === 'lab' ? 'on' : ''}"><i class="fa-solid fa-handshake"></i>Proposta L2L${salvas ? `<span class="n-sub">${salvas}</span>` : ''}</button>
      <button data-p="emp" class="${simAba === 'emp' ? 'on' : ''}"><i class="fa-solid fa-building"></i>Propostas Empresas${salvasEmp ? `<span class="n-sub">${salvasEmp}</span>` : ''}</button>
      <button data-p="cli" class="${simAba === 'cli' ? 'on' : ''}"><i class="fa-solid fa-user"></i>Proposta cliente${salvasCli ? `<span class="n-sub">${salvasCli}</span>` : ''}</button>
      <button data-p="med" class="${simAba === 'med' ? 'on' : ''}"><i class="fa-solid fa-user-doctor"></i>Proposta médico${salvasMed ? `<span class="n-sub">${salvasMed}</span>` : ''}</button>
    </div>
    <button class="btn so-lab" onclick="_pdfModo=['cli','med','emp'].includes(simAba)?simAba:'lab';abrirModeloPdf()" title="Texto padrão do PDF da aba (proposta L2L, orçamento de cliente, proposta ao médico ou à empresa)"><i class="fa-solid fa-gear"></i>Configurar texto</button></div>
    <div class="pane ${simAba === 'reajuste' ? 'on' : ''}" id="simulador-reajuste"></div>
    <div class="pane ${simAba === 'cmp' ? 'on' : ''}" id="simulador-cmp"></div>
    <div class="pane ${simAba === 'lab' ? 'on' : ''}" id="simulador-lab"></div>
    <div class="pane ${simAba === 'cli' ? 'on' : ''}" id="simulador-cli"></div>
    <div class="pane ${simAba === 'med' ? 'on' : ''}" id="simulador-med"></div>
    <div class="pane ${simAba === 'emp' ? 'on' : ''}" id="simulador-emp"></div>`;
  iniciarSubnav();
  if (simAba === 'reajuste') desenharSimReajuste();
  else if (simAba === 'cmp') desenharSimCmp();
  else if (simAba === 'cli') desenharSimCli();
  else if (simAba === 'med' || simAba === 'emp') { pm = PMS[simAba]; desenharSimMed(); }
  else desenharSimLab();
}

// ═══ Reajuste de tabela ══════════════════════════════════════
// man: valores digitados à mão na coluna Novo (chave do exame → preço); valem sobre a regra
// mtab: margem desejada = a configurada na tabela (sugestão de margem; na Particular, margem alvo)
// dtab/dfx: o mesmo para o desconto sobre a referência (desconto de referência da tabela)
// mfx: margem desejada escalonada por custo total ([{ ate, v }], v em %; a última sem limite) ou null
const rj = { man: {}, alvo: 'particular', tipo: 'pct', p: 5, m: null, mfx: null, mtab: true, d: null, dfx: null, dtab: true, escopo: 'todos', naoReduzir: true, filtro: 'alt', q: '', pag: 1, ordem: 'var', dir: -1 };

const TIPOS_REAJUSTE = {
  pct:  { nome: 'Percentual',          icone: 'fa-percent',               desc: 'Aplica % sobre o preço atual' },
  piso: { nome: 'Levar ao piso',       icone: 'fa-arrow-up',              desc: 'Só os abaixo do piso de margem' },
  marg: { nome: 'Margem desejada',     icone: 'fa-bullseye',              desc: 'Preço que atinge a margem informada' },
  sug:  { nome: 'Aplicar sugerido',    icone: 'fa-wand-magic-sparkles',   desc: 'Margem alvo de cada setor', so: 'base' },
  desc: { nome: 'Desconto s/ referência', icone: 'fa-tags',               desc: 'Referência menos o percentual', so: 'ref' }
};
const tiposDe = cx => Object.keys(TIPOS_REAJUSTE).filter(t => !TIPOS_REAJUSTE[t].so || (TIPOS_REAJUSTE[t].so === 'base' ? cx.base : !cx.base && cx.ref));

function desenharSimReajuste() {
  const el = document.getElementById('simulador-reajuste');
  if (!ctxAlvo(rj.alvo)) rj.alvo = 'particular';
  el.innerHTML = `<div class="sim-grid">
      <div class="card form" id="rj-form"></div>
      <div class="card sim-res">
        <div class="impact" id="rj-imp"></div>
        <div class="toolbar">
          <div class="search"><i class="fa-solid fa-magnifying-glass"></i><input id="rj-q" value="${esc(rj.q)}" placeholder="Buscar exame…" oninput="rj.q=this.value;rj.pag=1;desenharResultadoReajuste()"></div>
          <div class="chips sem-pad" id="rj-chips"></div>
        </div>
        <div class="tbl-wrap"><table><thead id="rj-head"></thead><tbody id="rj-body"></tbody></table></div>
        <div class="foot" id="rj-foot"></div>
      </div></div>`;
  desenharFormReajuste();
}

function desenharFormReajuste() {
  const el = document.getElementById('rj-form'), cx = ctxAlvo(rj.alvo);
  if (!el || !cx) return;
  const tipos = tiposDe(cx);
  if (!tipos.includes(rj.tipo)) rj.tipo = 'pct';
  if (rj.escopo === 'fora' && !tabRjOk(cx, 'm')) rj.escopo = 'todos';
  ['m', 'd'].forEach(k => { if (rj[k + 'tab'] && !tabRjOk(cx, k)) rj[k + 'tab'] = false; });
  if (rj.m == null) rj.m = Math.round(((cx.base ? parametro('margemAlvo') : cx.margemSug ?? cx.piso + 0.1)) * 1000) / 10;
  if (rj.d == null) rj.d = Math.round((cx.descRef || 0.1) * 1000) / 10;
  const cria = pode('simulador', 'criar');
  const param = rj.tipo === 'pct' ? `<span class="f-label">Percentual</span>
      <div class="range-row"><input type="range" min="-20" max="50" step="0.5" value="${rj.p}" oninput="rj.p=+this.value;document.getElementById('rj-p').value=this.value;recalcReajuste()">
        <div class="inp"><input id="rj-p" type="number" step="0.5" value="${rj.p}" oninput="rj.p=parseFloat(this.value)||0;this.closest('.range-row').querySelector('input[type=range]').value=rj.p;recalcReajuste()"><span class="suf">%</span></div></div>
      <span class="hint">Negativo reduz o preço</span>`
    : rj.tipo === 'marg' ? `<span class="f-label">Margem desejada</span>
      ${htmlParamRj(cx, 'm')}
      <span class="hint">${rj.mtab ? (cx.base ? 'Margem alvo da Particular · setor com alvo próprio prevalece · ' : 'Sugestão de margem configurada na tabela · ') : rj.mfx ? '' : cx.base ? `Alvo geral ${textoAlvoParticular()} · ` : cx.margemSug != null ? `Sugestão de margem da tabela: ${cx.msugTxt} · ` : `Piso da tabela: ${cx.pisoTxt} · `}exames sem custo ficam de fora</span>`
    : rj.tipo === 'desc' ? `<span class="f-label">Desconto sobre ${esc(cx.ref?.nome || 'a referência')}</span>
      ${htmlParamRj(cx, 'd')}
      <span class="hint">${rj.dtab ? 'Desconto de referência configurado na tabela' : rj.dfx ? '' : cx.descRef ? `Desconto de referência da tabela: ${cx.descTxt}` : ''}</span>`
    : rj.tipo === 'piso' ? `<span class="f-label">Regra</span><div class="hint"><i class="fa-solid fa-circle-info"></i> Exames abaixo de ${cx.pisoTxt} sobem até o ${cx.pisoNome}; os demais não mudam.</div>`
    : `<span class="f-label">Regra</span><div class="hint"><i class="fa-solid fa-circle-info"></i> Preço = custo total ÷ (1 − imposto − margem alvo do setor).</div>`;
  el.innerHTML = `
    <div class="fg"><span class="f-label">Tabela</span><div id="pop-rjalvo" class="block"></div></div>
    <div class="fg"><span class="f-label">Setor</span><div id="pop-rjsetor" class="block"></div></div>
    <div class="fg"><span class="f-label">Aplicar em</span>
      <div class="seg seg-col"><button class="${rj.escopo === 'todos' ? 'on' : ''}" onclick="rj.escopo='todos';desenharFormReajuste()" title="Todos os exames com preço"><i class="fa-solid fa-list"></i>Todos</button><button class="${rj.escopo === 'abaixo' ? 'on' : ''}" onclick="rj.escopo='abaixo';desenharFormReajuste()" title="Só os exames abaixo de ${cx.pisoTxt}"><i class="fa-solid fa-circle-xmark"></i>Abaixo do ${cx.pisoNome}</button>${tabRjOk(cx, 'm') ? `<button class="${rj.escopo === 'fora' ? 'on' : ''}" onclick="rj.escopo='fora';desenharFormReajuste()" title="Só os exames abaixo da margem configurada na tabela (${cx.base ? textoAlvoParticular() : cx.msugTxt})"><i class="fa-solid fa-bullseye"></i>Fora da margem</button>` : ''}</div></div>
    <div class="fg"><span class="f-label">Arredondamento</span><div id="pop-rjarred" class="block"></div></div>
    <div class="fg full"><span class="f-label">Tipo de reajuste</span>
      <div class="opt-cards">${tipos.map(t => { const T = TIPOS_REAJUSTE[t]; return `<button type="button" class="oc ${rj.tipo === t ? 'on' : ''}" onclick="rj.tipo='${t}';rj.pag=1;desenharFormReajuste()">
        <span class="po-ic"><i class="fa-solid ${T.icone}"></i></span><span><b>${t === 'piso' ? `Levar ao ${cx.pisoNome}` : T.nome}</b><small>${t === 'piso' ? `Só os abaixo de ${cx.pisoTxt}` : t === 'desc' ? `${esc(cx.ref?.nome || 'Referência')} menos o percentual` : T.desc}</small></span><i class="fa-solid fa-circle-check ck"></i></button>`; }).join('')}</div></div>
    <div class="fg ${(rj.tipo === 'marg' && (rj.mtab || rj.mfx)) || (rj.tipo === 'desc' && (rj.dtab || rj.dfx)) ? 'full' : ''}">${param}</div>
    <div class="fg"><span class="f-label">Proteção</span>
      <div class="casc"><div class="casc-r"><div class="lft"><i class="fa-solid fa-shield"></i><div>Não reduzir preços<div class="s">mantém o atual quando a regra daria menos</div></div></div>${chave(rj.naoReduzir, 'rj.naoReduzir=!rj.naoReduzir;this.classList.toggle(\'on\');recalcReajuste()')}</div></div></div>
    ${cria ? `<div class="fg sim-acoes">
      <button class="btn" onclick="levarReajuste(false)"><i class="fa-solid fa-pen"></i>Levar ao meu rascunho</button>
      <button class="btn pri" onclick="levarReajuste(true)"><i class="fa-solid fa-paper-plane"></i>Enviar como proposta</button></div>`
      : '<div class="fg hint sim-acoes"><i class="fa-solid fa-lock"></i> Seu grupo só pode visualizar simulações.</div>'}`;
  criarPop('pop-rjalvo', {
    rotulo: 'Tabela', titulo: 'Tabela a simular', icone: 'fa-table-list', padrao: 'particular', busca: 'Buscar tabela…',
    opcoes: () => alvosSimulaveis().map(a => {
      const c = ctxAlvo(a);
      return { valor: a, rotulo: c.nome, icone: c.icone, cor: c.cor, grupo: c.conv ? 'Conveniados' : c.lab ? 'Laboratórios apoiados' : 'Tabelas', desc: c.base ? 'Preço praticado' : `piso ${c.pisoTxt}` };
    }),
    aoMudar: a => { rj.alvo = a; rj.man = {}; rj.m = null; rj.mfx = null; rj.mtab = true; rj.d = null; rj.dfx = null; rj.dtab = true; rj.pag = 1; desenharFormReajuste(); }
  });
  criarPop('pop-rjsetor', {
    rotulo: 'Setor', titulo: 'Escopo do reajuste', icone: 'fa-bullseye', busca: 'Buscar setor…', limpavel: true, multi: true,
    opcoes: () => opcoesSetorPop('Todos os setores', [{ valor: '__sem', rotulo: 'Sem setor', icone: 'fa-triangle-exclamation', cor: 'var(--amber)' }]),
    aoMudar: () => { rj.pag = 1; recalcReajuste(); }
  });
  criarPop('pop-rjarred', {
    rotulo: 'Arredondar', titulo: 'Arredondamento do novo preço', icone: 'fa-coins', padrao: '1', opcoes: OPCOES_ARRED,
    aoMudar: () => recalcReajuste()
  });
  recalcReajuste();
}

// ── Margem desejada e desconto: da tabela, única ou escalonada (faixas pelo custo total, como em faixas.js) ──
// k = 'm' (margem; campo margemSugerida) ou 'd' (desconto; campo descontoRef) · estado em E[k], E[k+'fx'], E[k+'tab']
// st = dono do estado: 'rj' (Reajuste) ou 'a'/'b' (lado da comparação)
const CAMPO_RJ = { m: 'margemSugerida', d: 'descontoRef' }, ROT_RJ = { m: 'Margem', d: 'Desconto' };
const estRj = st => st === 'rj' ? rj : cmp[st];
const caminhoRj = st => st === 'rj' ? 'rj' : `cmp.${st}`;
const recalcRj = st => st === 'rj' ? 'recalcReajuste()' : 'recalcCmp()';
const redesenharRj = st => { if (st === 'rj') desenharFormReajuste(); else { desenharLadoCmp(st); recalcCmp(); } };
const faixasTabRj = (cx, k) => faixasDe(cx.tab || ESTADO.particular, CAMPO_RJ[k]).filter(f => f.v != null);
const valorTabRj = (cx, k) => k === 'm' ? (cx.base ? regraTab(null, 'margemSugerida') ?? parametro('margemAlvo') : cx.margemSug) : cx.descRef;
const tabRjOk = (cx, k) => k === 'm' ? cx.base || (cx.msugTxt && cx.msugTxt !== '—') : faixasTabRj(cx, 'd').length > 1 || cx.descRef > 0;
const valorRj = (k, custo, E = rj) => { const fx = E[k + 'fx']; return !fx || custo == null ? E[k] || 0 : (fx.find(f => f.ate == null || custo <= f.ate)?.v ?? E[k]) || 0; };

function htmlParamRj(cx, k, st = 'rj') {
  const E = estRj(st), fx = E[k + 'fx'], tab = E[k + 'tab'], ok = tabRjOk(cx, k);
  const seg = `<div class="seg" style="margin-bottom:8px"><button class="${tab ? 'on' : ''}" ${ok ? '' : `disabled title="Tabela sem ${k === 'm' ? 'sugestão de margem' : 'desconto de referência'}: defina em Configurar"`} onclick="modoRj('${k}','tab','${st}')" title="${ROT_RJ[k]} configurado na tabela, por faixa de custo quando houver"><i class="fa-solid fa-table-list"></i>Da tabela</button><button class="${!tab && !fx ? 'on' : ''}" onclick="modoRj('${k}','unica','${st}')"><i class="fa-solid fa-percent"></i>Única</button><button class="${fx && !tab ? 'on' : ''}" onclick="modoRj('${k}','fx','${st}')" title="${ROT_RJ[k]} escalonado por faixa de custo total"><i class="fa-solid fa-chart-line"></i>Escalonada</button></div>`;
  const corpo = tab ? htmlTabRj(cx, k) : fx ? htmlFxRj(k, st)
    : `<div class="inp" style="width:130px"><input ${st === 'rj' ? '' : `id="cmp-${k}${st}" `}type="number" step="0.5" value="${E[k]}" oninput="${caminhoRj(st)}.${k}=parseFloat(this.value)||0;${recalcRj(st)}"><span class="suf">%</span></div>`;
  return seg + corpo + (fx && !tab ? `<span class="hint">Faixas pelo custo total do exame: começam em R$ 0 e a última vale para todo custo acima</span>` : '');
}
function htmlFxRj(k, st = 'rj') {
  const fx = estRj(st)[k + 'fx'], cam = `${caminhoRj(st)}.${k}fx`, rec = recalcRj(st);
  return `<div class="mfx"><div class="mfx-h"><span>Custo total</span><span>${ROT_RJ[k]}</span><span></span></div>${fx.map((f, i) => {
    const de = i ? fx[i - 1].ate : 0, ult = i === fx.length - 1;
    return `<div class="mfx-l">${ult ? `<span class="mfx-de">acima de <b>${de != null ? fmt(de) : '…'}</b></span>`
        : `<div class="inp"><span class="pre">até R$</span><input type="number" step="0.01" min="0" value="${f.ate ?? ''}" oninput="${cam}[${i}].ate=this.value.trim()===''?null:parseFloat(this.value);${rec}" onchange="redesenharRj('${st}')" onfocus="this.select()"></div>`}
      <div class="inp"><input type="number" step="0.5" value="${f.v}" oninput="${cam}[${i}].v=parseFloat(this.value)||0;${rec}" onfocus="this.select()"><span class="suf">%</span></div>
      ${ult ? '<span></span>' : `<button type="button" class="rg-x" title="Remover faixa" onclick="removerFxRj('${k}',${i},'${st}')"><i class="fa-solid fa-xmark"></i></button>`}</div>`;
  }).join('')}
  <button type="button" class="btn sm" onclick="adicionarFxRj('${k}','${st}')"><i class="fa-solid fa-plus"></i>Adicionar faixa</button></div>`;
}
// Valor configurado na tabela, só leitura (faixas pelo custo total quando houver)
function htmlTabRj(cx, k) {
  const fx = faixasTabRj(cx, k);
  const caixa = v => `<div class="inp" style="opacity:.75"><input type="text" value="${v != null ? num(v * 100, 1) : '—'}" disabled><span class="suf">%</span></div>`;
  if (fx.length < 2) return `<div style="width:130px" title="Configurado na tabela">${caixa(valorTabRj(cx, k))}</div>`;
  return `<div class="mfx ro" title="Configurado na tabela"><div class="mfx-h"><span>Custo total</span><span>${ROT_RJ[k]}</span><span></span></div>${fx.map((f, i) => {
    const de = i ? fx[i - 1].ate : 0, ult = i === fx.length - 1;
    return `<div class="mfx-l"><span class="mfx-de">${ult ? `acima de <b>${fmt(de)}</b>` : `até <b>${fmt(f.ate)}</b>`}</span>${caixa(f.v)}<span></span></div>`;
  }).join('')}</div>`;
}
function modoRj(k, modo, st = 'rj') {
  const E = estRj(st);
  E[k + 'tab'] = modo === 'tab';
  if (modo === 'unica' && E[k + 'fx']) { E[k] = E[k + 'fx'][0].v; E[k + 'fx'] = null; }
  if (modo === 'fx' && !E[k + 'fx']) {
    // começa pelas faixas configuradas na tabela, quando houver
    const fx = faixasTabRj(ctxAlvo(E.alvo), k);
    E[k + 'fx'] = fx.length > 1 ? fx.map((f, i) => ({ ate: i === fx.length - 1 ? null : f.ate, v: Math.round(f.v * 1000) / 10 }))
      : [{ ate: 100, v: E[k] ?? 0 }, { ate: null, v: E[k] ?? 0 }];
  }
  redesenharRj(st);
}
// Nova faixa entra antes da última ("acima de")
function adicionarFxRj(k, st = 'rj') {
  const fx = estRj(st)[k + 'fx'], ant = fx[fx.length - 2]?.ate;
  fx.splice(fx.length - 1, 0, { ate: ant ? ant * 2 : 100, v: fx[fx.length - 1].v });
  redesenharRj(st);
}
function removerFxRj(k, i, st = 'rj') {
  const E = estRj(st), fx = E[k + 'fx'];
  fx.splice(i, 1);
  if (fx.length < 2) { E[k] = fx[0].v; E[k + 'fx'] = null; }
  redesenharRj(st);
}

// Novo preço de um exame pela regra escolhida (undefined = não muda)
function novoPrecoReajuste(cx, x) {
  const { atual, c, ref } = x;
  let v;
  if (rj.tipo === 'pct') v = atual * (1 + (rj.p || 0) / 100);
  else if (rj.tipo === 'piso') v = c.status === 'r' ? c.minimo : undefined;
  else if (rj.tipo === 'marg') v = rj.mtab ? precoParaMargem(c, cx.base ? c.alvo : c.margemSug) : precoParaMargem(c, valorRj('m', c.custo) / 100);
  else if (rj.tipo === 'sug') v = c.sugerido || undefined;
  else if (rj.tipo === 'desc') v = ref != null ? ref * (1 - (rj.dtab ? c.descRef || 0 : valorRj('d', c.custo) / 100)) : undefined;
  if (v == null || isNaN(v) || v <= 0) return undefined;
  v = arredSim(v, +valorPop('pop-rjarred') || 0);
  if (rj.naoReduzir && v < atual) return undefined;
  return Math.abs(v - atual) < 0.005 ? undefined : v;
}

// Margem abaixo da configurada na tabela (sugestão de margem; na Particular, margem alvo menos a tolerância)
function foraDaMargem(cx, c) {
  if (c.margem == null) return false;
  const alvo = cx.base ? c.alvo - (ESTADO.particular?.tolerancia || 0) : c.margemSug;
  return alvo != null && c.margem < alvo - 1e-9;
}

let _rjLinhas = [], _rjSimbolicos = 0;
function calcularReajuste() {
  const cx = ctxAlvo(rj.alvo);
  _rjSimbolicos = 0;
  _rjLinhas = examesVisiveis().filter(e => e.ativo !== false)
    .filter(e => passaPop('pop-rjsetor', ESTADO.setores[e.setorId] ? e.setorId : '__sem'))
    .map(e => {
      const atual = cx.salvo(e.id);
      if (atual == null) return null;
      if (precoSimbolico(atual)) { _rjSimbolicos++; return null; }
      const c = calcular(e, atual, cx.tab);
      if (rj.escopo === 'abaixo' && c.status !== 'r') return null;
      if (rj.escopo === 'fora' && !foraDaMargem(cx, c)) return null;
      const x = { e, k: e.id, atual, c, ref: cx.ref?.valor(e.id) ?? null };
      x.man = e.id in rj.man;
      const v = x.man ? (Math.abs(rj.man[e.id] - atual) < 0.005 ? undefined : rj.man[e.id]) : novoPrecoReajuste(cx, x);
      x.alt = v !== undefined;
      x.novo = x.alt ? v : atual;
      x.c1 = x.alt ? calcular(e, x.novo, cx.tab) : c;
      x.var = x.novo / atual - 1;
      return x;
    }).filter(Boolean);
  return _rjLinhas;
}

function recalcReajuste() {
  const cx = ctxAlvo(rj.alvo), ls = calcularReajuste(), alt = ls.filter(x => x.alt);
  const media = (arr, f) => { const v = arr.map(f).filter(n => n != null && !isNaN(n)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const m0 = media(ls, x => x.c.margem), m1 = media(ls, x => x.c1.margem);
  const ab0 = ls.filter(x => x.c.status === 'r').length, ab1 = ls.filter(x => x.c1.status === 'r').length;
  const saem = ls.filter(x => x.c.status === 'r' && x.c1.status !== 'r').length;
  const sobe = alt.filter(x => x.novo > x.atual).length, desce = alt.length - sobe;
  const s0 = ls.reduce((s, x) => s + x.atual, 0), s1 = ls.reduce((s, x) => s + x.novo, 0);
  const semCusto = ls.filter(x => x.c.semCusto).length;
  // desconto médio sobre a referência (tabelas que têm referência), antes e depois
  const comRef = ls.filter(x => x.ref > 0), d0 = media(comRef, x => 1 - x.atual / x.ref), d1 = media(comRef, x => 1 - x.novo / x.ref);
  const imp = (ic, rot, v, d, cls = '') => `<div class="imp"><div class="l"><i class="fa-solid ${ic}"></i>${rot}</div><div class="v">${v}</div><div class="d ${cls}">${d}</div></div>`;
  const vm = valorTabRj(cx, 'm'), tabM = !cx.base && cx.msugTxt && cx.msugTxt !== '—' ? cx.msugTxt : vm != null ? pct(vm) : cx.pisoTxt && cx.pisoTxt !== '—' ? `${cx.pisoNome} ${cx.pisoTxt}` : pct(parametro('margemAlvo'));
  document.getElementById('rj-imp').innerHTML =
    imp('fa-flask-vial', 'Exames alterados', `${num(alt.length, 0)}<small> de ${num(ls.length, 0)}</small>`, `<span class="muted">${[sobe && `${sobe} sobem`, desce && `${desce} descem`].filter(Boolean).join(' · ') || 'nenhuma alteração'}</span>`)
    + imp('fa-tags', 'Variação média', alt.length ? `${media(alt, x => x.var) >= 0 ? '+' : ''}${pct(media(alt, x => x.var))}` : '—', `<span class="muted">no escopo ${s0 ? `${s1 >= s0 ? '+' : ''}${pct(s1 / s0 - 1)}` : '—'}</span>`)
    + imp('fa-percent', 'Margem média', m1 != null ? pct(m1) : '—', `<i class="fa-solid fa-clock-rotate-left"></i>antes ${m0 != null ? pct(m0) : '—'}${tabM ? `<span class="rj-ref">Ref. ${tabM}</span>` : ''}`, m1 == null || m0 == null ? 'muted' : m1 >= m0 ? 'up' : 'dn')
    + (d1 != null ? imp('fa-tags', `Desconto médio s/ ${esc(cx.ref.nome)}`, pct(d1), `<i class="fa-solid fa-clock-rotate-left"></i>antes ${d0 != null ? pct(d0) : '—'}${cx.descTxt && cx.descTxt !== '—' ? `<span class="rj-ref">Ref. ${cx.descTxt}</span>` : ''}`, d0 == null ? 'muted' : d1 <= d0 ? 'up' : 'dn') : '')
    + imp('fa-life-ring', `Abaixo do ${cx.pisoNome}`, num(ab1, 0), `<span class="muted">antes ${ab0}${saem ? ` · <b style="color:var(--green)">${saem} saem</b>` : ''}</span>`)
    + (semCusto ? imp('fa-circle-question', 'Sem custo', num(semCusto, 0), '<span class="muted">margem desconhecida</span>') : '')
    + (_rjSimbolicos ? imp('fa-ban', 'Ignorados', num(_rjSimbolicos, 0), `<span class="muted">preço abaixo de ${fmt(PRECO_MIN_VARIACAO)}</span>`) : '');
  desenharResultadoReajuste();
}

const FILTROS_RJ = {
  alt:   { nome: 'Alterados',       f: x => x.alt, icone: 'fa-pen' },
  man:   { nome: 'Manuais',         f: x => x.man, icone: 'fa-keyboard' },
  todos: { nome: 'Todos no escopo', f: () => true, icone: 'fa-list' },
  r:     { nome: 'Abaixo depois',   f: x => x.c1.status === 'r', cor: 'var(--red)' },
  saem:  { nome: 'Saem do vermelho', f: x => x.c.status === 'r' && x.c1.status !== 'r', cor: 'var(--green)' }
};

function desenharResultadoReajuste() {
  const body = document.getElementById('rj-body');
  if (!body) return;
  const cx = ctxAlvo(rj.alvo), base = _rjLinhas.filter(x => contem(x.e.mn + ' ' + x.e.descricao, rj.q));
  document.getElementById('rj-chips').innerHTML = Object.entries(FILTROS_RJ).map(([k, F]) => {
    const n = base.filter(F.f).length;
    if (!n && k !== rj.filtro && k !== 'alt' && k !== 'todos') return '';
    return `<button class="chip ${rj.filtro === k ? 'on' : ''}" onclick="rj.filtro='${k}';rj.pag=1;desenharResultadoReajuste()">${F.cor ? `<span class="d" style="background:${F.cor}"></span>` : `<i class="fa-solid ${F.icone}"></i>`}${k === 'r' ? `Abaixo do ${cx.pisoNome} depois` : F.nome} <b>${n}</b></button>`;
  }).join('') + (Object.keys(rj.man).length ? `<button class="btn qd" style="color:var(--amber);border-color:var(--amber)" onclick="limparManuaisReajuste()" title="Desfazer ${Object.keys(rj.man).length} edição(ões) manual(is): voltam à regra"><i class="fa-solid fa-rotate-left"></i></button>` : '');
  const ls = base.filter(FILTROS_RJ[rj.filtro].f);
  const val = { mn: x => x.e.mn.toUpperCase(), desc: x => normalizar(x.e.descricao), custo: x => x.c.custo ?? -1, atual: x => x.atual, novo: x => x.novo,
    var: x => x.var, m0: x => x.c.margem ?? -9, m1: x => x.c1.margem ?? -9 }[rj.ordem] || (x => x.e.mn);
  ls.sort((a, b) => { const va = val(a), vb = val(b); return (va < vb ? -1 : va > vb ? 1 : 0) * rj.dir; });
  const n = Math.max(1, Math.ceil(ls.length / SIM_POR_PAG));
  if (rj.pag > n) rj.pag = n;
  const th = (r, k, cls) => thOrdem(r, k, rj.ordem, rj.dir, 'ordenarReajuste', cls), edita = pode('simulador', 'criar');
  document.getElementById('rj-head').innerHTML = `<tr>${th('MN', 'mn')}${th('Descrição', 'desc')}${th('Custo total', 'custo', 'num')}${th('Atual', 'atual', 'num')}${th('Novo', 'novo', 'num')}${th('Variação', 'var', 'num')}${th('Margem atual', 'm0', 'num')}${th('Nova margem', 'm1', 'num')}<th>Situação</th></tr>`;
  body.innerHTML = ls.slice((rj.pag - 1) * SIM_POR_PAG, rj.pag * SIM_POR_PAG).map(x => `<tr class="${x.alt ? '' : 'fora'}">
      <td class="mn"><a href="#" class="lk-mn" onclick="abrirFicha('${esc(x.k)}');return false">${esc(x.e.mn)}</a></td>
      <td class="desc" title="${esc(x.e.descricao)}">${esc(x.e.descricao)}</td>
      <td class="num">${celulaCusto(x.c)}</td>
      <td class="num muted">${fmt(x.atual)}</td>
      <td class="num">${edita ? `<div class="rj-novo"><div class="price-in ${x.man ? 'on' : ''}" title="${x.man ? 'Valor digitado à mão: a regra não mexe nele' : 'Digite para definir o valor à mão'}"><span>R$</span><input type="number" step="0.01" min="0" data-k="${esc(x.k)}" value="${x.novo.toFixed(2)}" onchange="editarNovoReajuste(this)" onkeydown="teclaReajuste(event)" onfocus="this.select()"></div>${
        x.man ? `<button class="rj-desf" title="Voltar ao valor da regra" onclick="desfazerNovoReajuste('${esc(x.k)}')"><i class="fa-solid fa-rotate-left"></i></button>` : ''}</div>` : `<b>${fmt(x.novo)}</b>`}</td>
      <td class="num ${x.var > 0.0001 ? 'delta-dn' : x.var < -0.0001 ? 'delta-up' : 'muted'}">${x.alt ? `${x.var > 0 ? '+' : ''}${pct(x.var)}` : '—'}</td>
      <td class="num" style="color:${x.c.status === 'r' ? 'var(--red)' : 'inherit'}">${x.c.margem != null ? pct(x.c.margem) : '—'}</td>
      <td class="num" style="color:${x.c1.status === 'r' ? 'var(--red)' : 'inherit'}"><b>${x.c1.margem != null ? pct(x.c1.margem) : '—'}</b></td>
      <td>${situacaoSim(cx, x.c1)}</td></tr>`).join('')
    || `<tr><td colspan="9">${vazio('fa-sliders', _rjLinhas.length ? 'Nenhum exame com esse filtro' : `Nenhum exame com preço em ${esc(cx.nome)} neste escopo`)}</td></tr>`;
  document.getElementById('rj-foot').innerHTML = paginacao(ls.length, rj.pag, SIM_POR_PAG, 'paginaReajuste');
}
const situacaoSim = (cx, c) => cx.base || c.status === 'x' ? tagStatus(c.status) : c.status === 'r' ? tagSt('r', 'fa-circle-xmark', 'Abaixo do piso') : tagSt('g', 'fa-circle-check', 'OK');

// Valor novo digitado à mão: vale sobre a regra (sem arredondar nem "não reduzir"); vazio volta à regra
function editarNovoReajuste(inp) {
  const k = inp.dataset.k, txt = inp.value.trim(), v = txt === '' ? null : Math.round(parseFloat(txt) * 100) / 100;
  if (v == null || isNaN(v) || v <= 0) delete rj.man[k];
  else rj.man[k] = v;
  recalcReajuste();
}
function desfazerNovoReajuste(k) { delete rj.man[k]; recalcReajuste(); }
function limparManuaisReajuste() { const n = Object.keys(rj.man).length; rj.man = {}; if (rj.filtro === 'man') rj.filtro = 'alt'; recalcReajuste(); toast(`${n} edição(ões) manual(is) desfeita(s)`); }
// Enter / ↑ ↓ confirmam o valor e passam para o preço vizinho
function teclaReajuste(ev) {
  if (!['Enter', 'ArrowDown', 'ArrowUp'].includes(ev.key)) return;
  ev.preventDefault();
  const ins = [...document.querySelectorAll('#rj-body input')], i = ins.indexOf(ev.target), k = ins[ev.key === 'ArrowUp' ? i - 1 : i + 1]?.dataset.k;
  editarNovoReajuste(ev.target);      // redesenha a tabela
  if (k != null) [...document.querySelectorAll('#rj-body input')].find(x => x.dataset.k === k)?.focus();
}
function paginaReajuste(p) { rj.pag = p; desenharResultadoReajuste(); }
function ordenarReajuste(k) { rj.dir = rj.ordem === k ? -rj.dir : (k === 'var' ? -1 : 1); rj.ordem = k; desenharResultadoReajuste(); }

// Vai para a grade da tabela (filtro "No rascunho")
function irParaGrade(alvo) {
  focarAlvo(alvo);
  grade.alvo = null; grade.proxFiltro = 'ed';
  irPara('tabelas');
}

// Soma valores ao rascunho do usuário (os mesmos exames são substituídos)
async function levarAoRascunho(alvo, valores, origem) {
  const cx = ctxAlvo(alvo), ks = Object.keys(valores);
  await carregarRascunho(alvo);
  const outros = Object.keys(rasc(alvo)).filter(k => !(k in valores)).length;
  if (outros) {
    const ok = await confirmar({ titulo: 'Somar ao rascunho?', texto: `Seu rascunho de <b>${esc(cx.nome)}</b> já tem ${outros} outra(s) alteração(ões). Os ${ks.length} valores simulados serão somados a ele.`, botao: 'Somar' });
    if (!ok) return false;
  }
  ks.forEach(k => definirRasc(cx, k, valores[k]));
  clearTimeout(_rascTimer[alvo]);
  await gravarRasc(alvo);
  registrar('tabelas', `${cx.nome}: ${ks.length} preço(s) do simulador (${origem}) levados ao rascunho`);
  return true;
}

async function levarReajuste(enviar) {
  const alt = _rjLinhas.filter(x => x.alt);
  if (!alt.length) return toast('Nenhum preço muda com essa regra', 'erro');
  const nMan = alt.filter(x => x.man).length;
  const T = TIPOS_REAJUSTE[rj.tipo], origem = (nMan ? `${nMan} valor(es) manual(is) + ` : '') + (rj.tipo === 'pct' ? `${rj.p > 0 ? '+' : ''}${num(rj.p, 1)}%` : rj.tipo === 'marg' ? (rj.mtab ? 'margem da tabela' : rj.mfx ? `margem escalonada ${rj.mfx.map(f => num(f.v, 1) + '%').join('/')}` : `margem ${num(rj.m, 1)}%`) : rj.tipo === 'desc' ? (rj.dtab ? 'desconto da tabela' : rj.dfx ? `desconto escalonado ${rj.dfx.map(f => num(f.v, 1) + '%').join('/')}` : `desconto ${num(rj.d, 1)}%`) : T.nome.toLowerCase());
  const ok = await levarAoRascunho(rj.alvo, Object.fromEntries(alt.map(x => [x.k, x.novo])), origem);
  if (!ok) return;
  irParaGrade(rj.alvo);
  if (enviar) abrirEnvioProposta();
  else toast(`${alt.length} preço(s) no seu rascunho`);
}

// ═══ Comparar tabelas ════════════════════════════════════════
// Dois lados (a, b), cada um com tabela, regra de ajuste e valores à mão (man: chave → preço; vale sobre a regra).
// A comparação (filtros) e o escopo da regra usam os preços salvos hoje; as colunas Novo mostram o ajuste.
// escopo: em quais exames a regra mexe · ausentes: inclui os exames que só a outra tabela tem (partindo do preço dela)
// m/d: margem desejada e desconto (mtab/dtab = os configurados na tabela; mfx/dfx = escalonados à mão, como no Reajuste)
const ladoCmp = alvo => ({ alvo, tipo: 'nada', p: 0, m: null, mfx: null, mtab: true, d: null, dfx: null, dtab: true, escopo: 'dif', ausentes: false, arred: '0', naoReduzir: false, man: {} });
const cmp = { a: ladoCmp('particular'), b: ladoCmp(null), q: '', filtro: 'dif', pag: 1, ordem: 'dif', dir: -1 };
const LADOS_CMP = { a: { letra: 'A', cor: 'var(--cyan)' }, b: { letra: 'B', cor: '#8b5cf6' } };
const outroLado = s => s === 'a' ? 'b' : 'a';
const bdgCmp = s => `<span class="cmp-l" style="--lc:${LADOS_CMP[s].cor}" title="${esc(ctxAlvo(cmp[s].alvo)?.nome || '')}">${LADOS_CMP[s].letra}</span>`;

const TIPOS_CMP = {
  nada:  { nome: 'Sem regra',         icone: 'fa-hand',        desc: 'Só os valores digitados à mão' },
  outra: { nome: 'Pela outra tabela', icone: 'fa-right-left',  desc: 'Preço da outra ± percentual (0 = igualar)' },
  pct: TIPOS_REAJUSTE.pct, piso: TIPOS_REAJUSTE.piso, marg: TIPOS_REAJUSTE.marg, sug: TIPOS_REAJUSTE.sug, desc: TIPOS_REAJUSTE.desc
};
const tiposCmp = cx => Object.keys(TIPOS_CMP).filter(t => !TIPOS_CMP[t].so || (TIPOS_CMP[t].so === 'base' ? cx.base : !cx.base && cx.ref));
const ESCOPOS_CMP = {
  dif:   { nome: 'Com valor diferente',      curto: 'Diferentes',   icone: 'fa-not-equal' },
  maior: { nome: 'Mais caros que a outra',   curto: 'Mais caros',   icone: 'fa-arrow-up' },
  menor: { nome: 'Mais baratos que a outra', curto: 'Mais baratos', icone: 'fa-arrow-down' },
  todos: { nome: 'Todos com preço',          curto: 'Todos',        icone: 'fa-list' }
};
// Arredondamento para cima; clicar de novo no ativo desliga ('0' = centavos)
const ARRED_CMP = ['1', '5', '10', '100'];

function desenharSimCmp() {
  const el = document.getElementById('simulador-cmp');
  if (!ctxAlvo(cmp.a.alvo)) cmp.a.alvo = 'particular';
  if (!ctxAlvo(cmp.b.alvo) || cmp.b.alvo === cmp.a.alvo) cmp.b.alvo = alvosSimulaveis().find(a => a !== cmp.a.alvo) || null;
  if (!cmp.b.alvo) { el.innerHTML = `<div class="card">${vazio('fa-code-compare', 'Cadastre ao menos duas tabelas para comparar')}</div>`; return; }
  el.innerHTML = `<div class="cmp-lados">
      <div class="card cmp-lado" id="cmp-lado-a" style="--lc:${LADOS_CMP.a.cor}"></div>
      <div class="card cmp-lado" id="cmp-lado-b" style="--lc:${LADOS_CMP.b.cor}"></div></div>
    <div class="card sim-res">
      <div class="impact" id="cmp-imp"></div>
      <div class="toolbar">
        <div class="search"><i class="fa-solid fa-magnifying-glass"></i><input id="cmp-q" value="${esc(cmp.q)}" placeholder="Buscar exame…" oninput="cmp.q=this.value;cmp.pag=1;desenharResultadoCmp()"></div>
        <div id="pop-cmpsetor"></div>
        <div class="chips sem-pad" id="cmp-chips"></div>
      </div>
      <div class="tbl-wrap"><table class="cmp-tab"><thead id="cmp-head"></thead><tbody id="cmp-body"></tbody></table></div>
      <div class="foot" id="cmp-foot"></div>
    </div>`;
  criarPop('pop-cmpsetor', {
    rotulo: 'Setor', titulo: 'Setores comparados', icone: 'fa-bullseye', busca: 'Buscar setor…', limpavel: true, multi: true,
    opcoes: () => opcoesSetorPop('Todos os setores', [{ valor: '__sem', rotulo: 'Sem setor', icone: 'fa-triangle-exclamation', cor: 'var(--amber)' }]),
    aoMudar: () => { cmp.pag = 1; recalcCmp(); }
  });
  desenharLadoCmp('a');
  desenharLadoCmp('b');
  recalcCmp();
}

function desenharLadoCmp(s) {
  const L = cmp[s], o = outroLado(s), el = document.getElementById('cmp-lado-' + s), cx = ctxAlvo(L.alvo), cxO = ctxAlvo(cmp[o].alvo);
  if (!el || !cx || !cxO) return;
  const tipos = tiposCmp(cx), T = LADOS_CMP[s], on = c => c ? 'on' : '';
  if (!tipos.includes(L.tipo)) L.tipo = 'nada';
  if (L.m == null) L.m = Math.round((cx.base ? parametro('margemAlvo') : cx.margemSug ?? cx.piso + 0.1) * 1000) / 10;
  if (L.d == null) L.d = Math.round((cx.descRef || 0.1) * 1000) / 10;
  ['m', 'd'].forEach(k => { if (L[k + 'tab'] && !tabRjOk(cx, k)) L[k + 'tab'] = false; });
  const campo = (k, rot) => `<label class="cmp-param">${rot}<span class="inp"><input id="cmp-${k}${s}" type="number" step="0.5" value="${L[k]}" oninput="cmp.${s}.${k}=parseFloat(this.value)||0;recalcCmp()"><span class="suf">%</span></span></label>`;
  const param = L.tipo === 'outra' ? campo('p', `Sobre ${esc(cxO.nome)}`)
    : L.tipo === 'pct' ? campo('p', 'Percentual')
    : L.tipo === 'marg' ? `<div class="cmp-fx">${htmlParamRj(cx, 'm', s)}</div>`
    : L.tipo === 'desc' ? `<div class="cmp-fx">${htmlParamRj(cx, 'd', s)}</div>` : '';
  const info = L.tipo === 'outra' ? 'Negativo fica abaixo da outra · 0 iguala'
    : L.tipo === 'pct' ? 'Negativo reduz o preço'
    : L.tipo === 'marg' ? `${L.mtab ? (cx.base ? 'Margem alvo da Particular · setor com alvo próprio prevalece · ' : 'Sugestão de margem da tabela · ') : ''}exames sem custo ficam de fora`
    : L.tipo === 'desc' ? `${L.dtab ? 'Desconto de referência da tabela' : 'Desconto'} sobre ${esc(cx.ref?.nome || 'a referência')}`
    : L.tipo === 'piso' ? `Exames abaixo de ${cx.pisoTxt} sobem até o ${cx.pisoNome}.`
    : L.tipo === 'sug' ? 'Custo total ÷ (1 − imposto − margem alvo do setor).'
    : `Digite os valores na coluna <b>Novo</b> de ${T.letra}.`;
  const nomeTipo = t => t === 'piso' ? `Levar ao ${cx.pisoNome}` : t === 'desc' ? 'Desconto s/ referência' : TIPOS_CMP[t].nome;
  const descTipo = t => t === 'piso' ? `Só os abaixo de ${cx.pisoTxt}` : t === 'desc' ? `${cx.ref?.nome || 'Referência'} menos o percentual` : TIPOS_CMP[t].desc;
  const opcao = (k, icone, rot, desc) => `<button type="button" class="chip ${on(L[k])}" title="${esc(desc)}" onclick="cmp.${s}.${k}=!cmp.${s}.${k};desenharLadoCmp('${s}');recalcCmp()"><i class="fa-solid ${L[k] ? 'fa-square-check' : icone}"></i>${rot}</button>`;
  el.innerHTML = `
    <div class="cmp-lado-h"><span class="cmp-letra">${T.letra}</span><div id="pop-cmp${s}" class="block"></div></div>
    <div class="cmp-row"><span class="cmp-rot">Ajuste</span>
      <div class="cmp-tipos">${tipos.map(t => `<button type="button" class="chip ${on(L.tipo === t)}" data-tipo="${t}" title="${esc(descTipo(t))}" onclick="cmp.${s}.tipo='${t}';cmp.pag=1;desenharLadoCmp('${s}');recalcCmp()"><i class="fa-solid ${TIPOS_CMP[t].icone}"></i>${nomeTipo(t)}</button>`).join('')}</div></div>
    <div class="cmp-row"><span class="cmp-rot"></span><div class="cmp-regra">${param}${info ? `<span class="hint"><i class="fa-solid fa-circle-info"></i> ${info}</span>` : ''}</div></div>
    <div class="cmp-row cmp-escopo"><span class="cmp-rot">Aplicar em</span>
      <div class="seg">${Object.entries(ESCOPOS_CMP).map(([k, E]) => `<button class="${on(L.escopo === k)}" title="${E.nome}" onclick="cmp.${s}.escopo='${k}';desenharLadoCmp('${s}');recalcCmp()"><i class="fa-solid ${E.icone}"></i>${E.curto}</button>`).join('')}</div></div>
    <div class="cmp-row"><span class="cmp-rot">Arredondar</span>
      <div class="seg">${ARRED_CMP.map(v => `<button class="${on(L.arred === v)}" title="Para cima, múltiplo de R$ ${v} · clique de novo para não arredondar" onclick="cmp.${s}.arred=cmp.${s}.arred==='${v}'?'0':'${v}';desenharLadoCmp('${s}');recalcCmp()">R$ ${v}</button>`).join('')}</div></div>
    <div class="cmp-row"><span class="cmp-rot">Opções</span>
      <div class="cmp-ops">${opcao('ausentes', 'fa-square-plus', 'Incluir ausentes', `Exames só de ${cxO.nome} entram com o preço dela`)}${opcao('naoReduzir', 'fa-shield', 'Não reduzir preços', 'Mantém o atual quando a regra daria menos')}</div></div>
    ${pode('simulador', 'criar') ? `<div class="sim-acoes cmp-acoes" id="cmp-acoes-${s}"></div>`
      : '<div class="hint sim-acoes"><i class="fa-solid fa-lock"></i> Seu grupo só pode visualizar simulações.</div>'}`;
  delete POPS['pop-cmp' + s];          // o padrão é a tabela do lado (muda na troca entre A e B)
  criarPop('pop-cmp' + s, {
    rotulo: `Tabela ${T.letra}`, titulo: `Tabela ${T.letra}`, icone: 'fa-table-list', padrao: L.alvo, busca: 'Buscar tabela…',
    opcoes: () => alvosSimulaveis().map(a => {
      const c = ctxAlvo(a);
      return { valor: a, rotulo: c.nome, icone: c.icone, cor: c.cor, grupo: c.conv ? 'Conveniados' : c.lab ? 'Laboratórios apoiados' : 'Tabelas',
        desc: a === cmp[o].alvo ? `é a tabela ${LADOS_CMP[o].letra}: escolher troca os lados` : c.base ? 'Preço praticado' : `piso ${c.pisoTxt}` };
    }),
    aoMudar: a => trocarTabelaCmp(s, a)
  });
  desenharAcoesCmp();
}

// Escolher no lado s a tabela do outro lado troca A e B (cada um leva a sua regra)
function trocarTabelaCmp(s, a) {
  if (a === cmp[s].alvo) return;
  if (a === cmp[outroLado(s)].alvo) [cmp.a, cmp.b] = [cmp.b, cmp.a];
  else Object.assign(cmp[s], { alvo: a, man: {}, m: null, mfx: null, mtab: true, d: null, dfx: null, dtab: true });
  cmp.pag = 1;
  desenharLadoCmp('a');
  desenharLadoCmp('b');
  recalcCmp();
}

// Novo preço de um lado: { v, alt, man } · v null = exame fora da tabela
function novoCmp(L, cx, e, atual, outro) {
  const k = e.id;
  if (k in L.man) return { v: L.man[k], man: true, alt: atual == null || Math.abs(L.man[k] - atual) >= 0.005 };
  const fica = { v: atual, alt: false, man: false };
  if (atual == null) { if (!L.ausentes || outro == null) return fica; }
  else if (!{ todos: true, dif: outro != null && Math.abs(atual - outro) >= 0.005, maior: outro != null && atual > outro + 0.005, menor: outro != null && atual < outro - 0.005 }[L.escopo]) return fica;
  const base = atual ?? outro, c = calcular(e, base, cx.tab), ref = cx.ref?.valor(k) ?? null;
  let v;
  if (L.tipo === 'outra') v = outro != null ? outro * (1 + (L.p || 0) / 100) : undefined;
  else if (L.tipo === 'pct') v = base * (1 + (L.p || 0) / 100);
  else if (L.tipo === 'piso') v = c.status === 'r' ? c.minimo : undefined;
  else if (L.tipo === 'marg') v = precoParaMargem(c, L.mtab ? (cx.base ? c.alvo : c.margemSug) : valorRj('m', c.custo, L) / 100);
  else if (L.tipo === 'sug') v = c.sugerido || undefined;
  else if (L.tipo === 'desc') v = ref != null && !precoSimbolico(ref) ? ref * (1 - (L.dtab ? c.descRef || 0 : valorRj('d', c.custo, L) / 100)) : undefined;
  v = v == null || isNaN(v) || v <= 0 ? undefined : arredSim(v, +L.arred || 0);
  // ausente: entra pelo preço da outra quando a regra não dá valor
  if (atual == null) return { v: v ?? arredSim(outro, +L.arred || 0), alt: true, man: false };
  if (v === undefined || (L.naoReduzir && v < atual) || Math.abs(v - atual) < 0.005) return fica;
  return { v, alt: true, man: false };
}

// Relação entre os preços de A e B
const relCmp = (a, b) => a == null ? (b == null ? null : 'soB') : b == null ? 'soA' : Math.abs(a - b) < 0.005 ? 'igual' : a > b ? 'aMaior' : 'bMaior';
const ORDEM_REL = { aMaior: 0, bMaior: 1, soA: 2, soB: 3, igual: 4 };
const tagRelCmp = r => r === 'igual' ? tagSt('g', 'fa-equals', 'Iguais') : !r ? '—'
  : `<span class="cmp-rel">${r === 'soA' || r === 'soB' ? `só em ${bdgCmp(r === 'soA' ? 'a' : 'b')}` : `${bdgCmp(r === 'aMaior' ? 'a' : 'b')} maior`}</span>`;
const textoRelCmp = r => ({ aMaior: 'A maior', bMaior: 'B maior', soA: 'só em A', soB: 'só em B', igual: 'iguais' })[r] || '—';

let _cmpLinhas = [], _cmpSimbolicos = 0;
function calcularCmp() {
  const cxA = ctxAlvo(cmp.a.alvo), cxB = ctxAlvo(cmp.b.alvo);
  _cmpSimbolicos = 0;
  _cmpLinhas = examesVisiveis().filter(e => e.ativo !== false)
    .filter(e => passaPop('pop-cmpsetor', ESTADO.setores[e.setorId] ? e.setorId : '__sem'))
    .map(e => {
      const a0 = cxA.salvo(e.id), b0 = cxB.salvo(e.id);
      if (a0 == null && b0 == null) return null;
      if (precoSimbolico(a0) || precoSimbolico(b0)) { _cmpSimbolicos++; return null; }
      const na = novoCmp(cmp.a, cxA, e, a0, b0), nb = novoCmp(cmp.b, cxB, e, b0, a0);
      const x = { e, k: e.id, a0, b0, a1: na.v, b1: nb.v, altA: na.alt, altB: nb.alt, manA: na.man, manB: nb.man };
      x.rel0 = relCmp(a0, b0); x.rel1 = relCmp(x.a1, x.b1);
      x.dif0 = a0 && b0 ? b0 / a0 - 1 : null; x.dif1 = x.a1 && x.b1 ? x.b1 / x.a1 - 1 : null;
      x.ca = x.a1 != null ? calcular(e, x.a1, cxA.tab) : null;
      x.cb = x.b1 != null ? calcular(e, x.b1, cxB.tab) : null;
      return x;
    }).filter(Boolean);
  return _cmpLinhas;
}

function recalcCmp() {
  if (!document.getElementById('cmp-imp')) return;
  const ls = calcularCmp();
  const n0 = r => ls.filter(x => x.rel0 === r).length, n1 = r => ls.filter(x => x.rel1 === r).length;
  const media = v => v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  const d0 = media(ls.filter(x => x.dif0 != null).map(x => x.dif0)), d1 = media(ls.filter(x => x.dif1 != null).map(x => x.dif1));
  const dif0 = n0('aMaior') + n0('bMaior'), dif1 = n1('aMaior') + n1('bMaior');
  const altA = ls.filter(x => x.altA).length, altB = ls.filter(x => x.altB).length, man = ls.filter(x => x.manA).length + ls.filter(x => x.manB).length;
  const sinal = v => v == null ? '—' : `${v > 0 ? '+' : ''}${pct(v)}`, mudou = altA || altB;
  const depois = (a, b) => mudou && a !== b ? `<span class="muted"> · depois <b>${num(b, 0)}</b></span>` : '';
  const imp = (ic, rot, v, d, cls = '') => `<div class="imp"><div class="l"><i class="fa-solid ${ic}"></i>${rot}</div><div class="v">${v}</div><div class="d ${cls}">${d}</div></div>`;
  document.getElementById('cmp-imp').innerHTML =
    imp('fa-flask-vial', 'Exames comparados', num(ls.length, 0), `<span class="muted">${num(ls.filter(x => x.dif0 != null).length, 0)} nas duas tabelas</span>`)
    + imp('fa-not-equal', 'Valores diferentes', num(dif0, 0), `<span class="muted">${bdgCmp('a')} maior ${n0('aMaior')} · ${bdgCmp('b')} maior ${n0('bMaior')}</span>${depois(dif0, dif1)}`)
    + imp('fa-scale-unbalanced', `${bdgCmp('b')} sobre ${bdgCmp('a')} (média)`, sinal(mudou ? d1 : d0), mudou ? `<i class="fa-solid fa-clock-rotate-left"></i>antes ${sinal(d0)}` : '<span class="muted">nos exames das duas tabelas</span>', 'muted')
    + imp('fa-circle-half-stroke', `Só em ${bdgCmp('a')}`, num(n0('soA'), 0), `<span class="muted">fora de ${esc(ctxAlvo(cmp.b.alvo).nome)}</span>${depois(n0('soA'), n1('soA'))}`)
    + imp('fa-circle-half-stroke', `Só em ${bdgCmp('b')}`, num(n0('soB'), 0), `<span class="muted">fora de ${esc(ctxAlvo(cmp.a.alvo).nome)}</span>${depois(n0('soB'), n1('soB'))}`)
    + imp('fa-pen', 'Ajustes', `${num(altA, 0)}<small> ${LADOS_CMP.a.letra}</small> · ${num(altB, 0)}<small> ${LADOS_CMP.b.letra}</small>`, `<span class="muted">${man ? `${man} manual(is)` : 'nenhum manual'}</span>`)
    + (_cmpSimbolicos ? imp('fa-ban', 'Ignorados', num(_cmpSimbolicos, 0), `<span class="muted">preço abaixo de ${fmt(PRECO_MIN_VARIACAO)}</span>`) : '');
  desenharResultadoCmp();
  desenharAcoesCmp();
}

const FILTROS_CMP = {
  dif:    { h: () => '<i class="fa-solid fa-not-equal"></i>Diferentes',       f: x => x.rel0 === 'aMaior' || x.rel0 === 'bMaior' },
  aMaior: { h: () => `${bdgCmp('a')} maior`,                                   f: x => x.rel0 === 'aMaior' },
  bMaior: { h: () => `${bdgCmp('b')} maior`,                                   f: x => x.rel0 === 'bMaior' },
  soA:    { h: () => `Só em ${bdgCmp('a')}`,                                    f: x => x.rel0 === 'soA' },
  soB:    { h: () => `Só em ${bdgCmp('b')}`,                                    f: x => x.rel0 === 'soB' },
  igual:  { h: () => '<i class="fa-solid fa-equals"></i>Iguais',              f: x => x.rel0 === 'igual' },
  alt:    { h: () => '<i class="fa-solid fa-pen"></i>Ajustados',             f: x => x.altA || x.altB },
  todos:  { h: () => '<i class="fa-solid fa-list"></i>Todos',                f: () => true }
};

function desenharResultadoCmp() {
  const body = document.getElementById('cmp-body');
  if (!body) return;
  const cxA = ctxAlvo(cmp.a.alvo), cxB = ctxAlvo(cmp.b.alvo), base = _cmpLinhas.filter(x => contem(x.e.mn + ' ' + x.e.descricao, cmp.q));
  const nMan = Object.keys(cmp.a.man).length + Object.keys(cmp.b.man).length;
  document.getElementById('cmp-chips').innerHTML = Object.entries(FILTROS_CMP).map(([k, F]) => {
    const n = base.filter(F.f).length;
    if (!n && k !== cmp.filtro && k !== 'dif' && k !== 'todos') return '';
    return `<button class="chip ${cmp.filtro === k ? 'on' : ''}" onclick="cmp.filtro='${k}';cmp.pag=1;desenharResultadoCmp()">${F.h()} <b>${n}</b></button>`;
  }).join('') + (nMan ? `<button class="btn qd" style="color:var(--amber);border-color:var(--amber)" onclick="limparManuaisCmp()" title="Desfazer ${nMan} edição(ões) manual(is): voltam à regra"><i class="fa-solid fa-rotate-left"></i></button>` : '')
    + (pode('simulador', 'criar') ? `<button class="btn pri" id="cmp-ambos" onclick="levarCmp('ab')" title="Leva os ajustes de A e de B, cada um ao rascunho da sua tabela"><i class="fa-solid fa-pen"></i>Gerar os dois rascunhos</button>` : '');
  const ls = base.filter(FILTROS_CMP[cmp.filtro].f);
  const val = { mn: x => x.e.mn.toUpperCase(), desc: x => normalizar(x.e.descricao), a0: x => x.a0 ?? -1, a1: x => x.a1 ?? -1, b0: x => x.b0 ?? -1, b1: x => x.b1 ?? -1,
    dif: x => x.dif1 != null ? Math.abs(x.dif1) : -1, rel: x => ORDEM_REL[x.rel1] ?? 9 }[cmp.ordem] || (x => x.e.mn);
  ls.sort((a, b) => { const va = val(a), vb = val(b); return (va < vb ? -1 : va > vb ? 1 : 0) * cmp.dir; });
  const n = Math.max(1, Math.ceil(ls.length / SIM_POR_PAG));
  if (cmp.pag > n) cmp.pag = n;
  const th = (r, k, cls) => thOrdem(r, k, cmp.ordem, cmp.dir, 'ordenarCmp', cls), edita = pode('simulador', 'criar');
  const grp = s => `<th colspan="2" class="cmp-g" style="--lc:${LADOS_CMP[s].cor}">${bdgCmp(s)} ${esc(ctxAlvo(cmp[s].alvo).nome)}</th>`;
  document.getElementById('cmp-head').innerHTML = `<tr class="cmp-grp"><th colspan="2"></th>${grp('a')}${grp('b')}<th colspan="2"></th></tr>
    <tr>${th('MN', 'mn')}${th('Descrição', 'desc')}${th('Atual', 'a0', 'num')}${th('Novo', 'a1', 'num')}${th('Atual', 'b0', 'num')}${th('Novo', 'b1', 'num')}${th(`${LADOS_CMP.b.letra} vs ${LADOS_CMP.a.letra}`, 'dif', 'num')}${th('Comparação', 'rel')}</tr>`;
  const atual = v => v != null ? fmt(v) : '<span class="cmp-aus">ausente</span>';
  const novo = (x, s) => {
    const K = s.toUpperCase(), v = x[s + '1'], man = x['man' + K], alt = x['alt' + K], c = x['c' + s];
    const marg = c?.margem != null ? `<div class="sub-num" style="${c.status === 'r' ? 'color:var(--red)' : ''}">margem ${pct(c.margem)}</div>` : '';
    if (!edita) return v == null ? '<span class="muted">—</span>' : `<b class="${alt ? '' : 'muted'}">${fmt(v)}</b>${marg}`;
    return `<div class="rj-novo"><div class="price-in ${man ? 'on' : alt ? 'alt' : ''}" title="${man ? 'Valor digitado à mão: a regra não mexe nele' : 'Digite para definir o valor à mão'}"><span>R$</span><input type="number" step="0.01" min="0" data-l="${s}" data-k="${esc(x.k)}" value="${v != null ? v.toFixed(2) : ''}" placeholder="${x[s + '0'] == null ? 'incluir' : ''}" onchange="editarNovoCmp(this)" onkeydown="teclaCmp(event)" onfocus="this.select()"></div>${
      man ? `<button class="rj-desf" title="Voltar ao valor da regra" onclick="desfazerNovoCmp('${s}','${esc(x.k)}')"><i class="fa-solid fa-rotate-left"></i></button>` : ''}</div>${marg}`;
  };
  body.innerHTML = ls.slice((cmp.pag - 1) * SIM_POR_PAG, cmp.pag * SIM_POR_PAG).map(x => `<tr>
      <td class="mn"><a href="#" class="lk-mn" onclick="abrirFicha('${esc(x.k)}');return false">${esc(x.e.mn)}</a></td>
      <td class="desc" title="${esc(x.e.descricao)}">${esc(x.e.descricao)}</td>
      <td class="num muted">${atual(x.a0)}</td>
      <td class="num">${novo(x, 'a')}</td>
      <td class="num muted">${atual(x.b0)}</td>
      <td class="num">${novo(x, 'b')}</td>
      <td class="num">${x.dif1 != null ? `<b>${x.dif1 > 0 ? '+' : ''}${pct(x.dif1)}</b><div class="sub-num">${x.b1 - x.a1 > 0 ? '+' : ''}${fmt(x.b1 - x.a1)}</div>` : '<span class="muted">—</span>'}${
        x.dif0 != null && x.dif1 != null && Math.abs(x.dif1 - x.dif0) > 0.00005 ? `<div class="sub-num">antes ${x.dif0 > 0 ? '+' : ''}${pct(x.dif0)}</div>` : ''}</td>
      <td>${tagRelCmp(x.rel1)}${x.rel1 !== x.rel0 ? `<div class="sub-num">antes: ${textoRelCmp(x.rel0)}</div>` : ''}</td></tr>`).join('')
    || `<tr><td colspan="8">${vazio('fa-code-compare', _cmpLinhas.length ? 'Nenhum exame com esse filtro' : `Nenhum exame com preço em ${esc(cxA.nome)} ou ${esc(cxB.nome)} neste escopo`)}</td></tr>`;
  document.getElementById('cmp-foot').innerHTML = paginacao(ls.length, cmp.pag, SIM_POR_PAG, 'paginaCmp');
}
function paginaCmp(p) { cmp.pag = p; desenharResultadoCmp(); }
function ordenarCmp(k) { cmp.dir = cmp.ordem === k ? -cmp.dir : (k === 'dif' ? -1 : 1); cmp.ordem = k; desenharResultadoCmp(); }

// Valor digitado à mão num lado: vale sobre a regra; vazio volta à regra (no ausente, vazio = não incluir)
function editarNovoCmp(inp) {
  const L = cmp[inp.dataset.l], k = inp.dataset.k, txt = inp.value.trim(), v = txt === '' ? null : Math.round(parseFloat(txt) * 100) / 100;
  if (v == null || isNaN(v) || v <= 0) delete L.man[k];
  else L.man[k] = v;
  recalcCmp();
}
function desfazerNovoCmp(s, k) { delete cmp[s].man[k]; recalcCmp(); }
function limparManuaisCmp() {
  const n = Object.keys(cmp.a.man).length + Object.keys(cmp.b.man).length;
  cmp.a.man = {}; cmp.b.man = {};
  recalcCmp();
  toast(`${n} edição(ões) manual(is) desfeita(s)`);
}
// Enter / ↑ ↓ confirmam o valor e passam para o preço vizinho da mesma coluna
function teclaCmp(ev) {
  if (!['Enter', 'ArrowDown', 'ArrowUp'].includes(ev.key)) return;
  ev.preventDefault();
  const s = ev.target.dataset.l, col = () => [...document.querySelectorAll(`#cmp-body input[data-l="${s}"]`)];
  const ins = col(), i = ins.indexOf(ev.target), k = ins[ev.key === 'ArrowUp' ? i - 1 : i + 1]?.dataset.k;
  editarNovoCmp(ev.target);           // redesenha a tabela
  if (k != null) col().find(x => x.dataset.k === k)?.focus();
}

function desenharAcoesCmp() {
  ['a', 'b'].forEach(s => {
    const el = document.getElementById('cmp-acoes-' + s), cx = ctxAlvo(cmp[s].alvo);
    if (!el || !cx) return;
    const n = _cmpLinhas.filter(x => x['alt' + s.toUpperCase()]).length;
    el.innerHTML = `<button class="btn ${n ? 'pri' : ''}" ${n ? '' : 'disabled'} onclick="levarCmp('${s}')"><i class="fa-solid fa-pen"></i>Gerar rascunho${n ? ` (${n})` : ''}</button>
      <button class="btn" onclick="irParaGrade('${esc(cx.alvo)}')" title="Abrir a grade de ${esc(cx.nome)} no filtro do rascunho"><i class="fa-solid fa-table-list"></i>Abrir rascunho</button>`;
  });
}

// Leva os ajustes de um lado ('a' | 'b') ou dos dois ('ab') ao rascunho da respectiva tabela
async function levarCmp(qual) {
  const feitos = [];
  let algum = false;
  for (const s of qual === 'ab' ? ['a', 'b'] : [qual]) {
    const K = s.toUpperCase(), alt = _cmpLinhas.filter(x => x['alt' + K]);
    if (!alt.length) continue;
    algum = true;
    const L = cmp[s], cx = ctxAlvo(L.alvo), cxO = ctxAlvo(cmp[outroLado(s)].alvo), nMan = alt.filter(x => x['man' + K]).length;
    const regra = { outra: `${cxO.nome} ${L.p > 0 ? '+' : ''}${num(L.p, 1)}%`, pct: `${L.p > 0 ? '+' : ''}${num(L.p, 1)}%`, piso: `levar ao ${cx.pisoNome}`,
      marg: L.mtab ? 'margem da tabela' : L.mfx ? 'margem escalonada' : `margem ${num(L.m, 1)}%`, sug: 'sugerido',
      desc: L.dtab ? 'desconto da tabela' : L.dfx ? 'desconto escalonado' : `desconto ${num(L.d, 1)}%` }[L.tipo];
    const partes = [nMan && `${nMan} valor(es) manual(is)`, regra, L.ausentes && 'inclui ausentes'].filter(Boolean);
    const ok = await levarAoRascunho(L.alvo, Object.fromEntries(alt.map(x => [x.k, x[s + '1']])), `comparação com ${cxO.nome}${partes.length ? ` (${partes.join(' + ')})` : ''}`);
    if (ok) feitos.push(`${alt.length} em ${cx.nome}`);
  }
  if (feitos.length) toast(`Rascunho gerado: ${feitos.join(' · ')}`);
  else if (!algum) toast(qual === 'ab' ? 'Nenhum preço muda nas duas tabelas' : 'Nenhum preço muda nesta tabela', 'erro');
}

// ═══ Proposta para laboratório (01.LAB) ═══════════════════════
const pl = { id: null, nome: '', labId: '', tabelaId: null, base: 'tab', d: 10, itens: {}, pdf: null, filtro: 'tab', q: '', pag: 1, ordem: 'mn', dir: 1, sujo: false };
// Exame está na proposta quando foi marcado (s) ou tem volume (propostas antigas só tinham volume)
const selLab = it => !!it && (it.s === true || it.v > 0);

// dias do cadastro (0 = 24 horas); texto antigo: "24 H" → 0 · "48h" → 2 · "4 Dias" → 4 · "N/A" → null
function diasPrazo(k) {
  const c = ESTADO.catalogo?.[k];
  const d = c?.prazoDias ?? ESTADO.exames[k]?.prazoDias;
  if (d != null && !isNaN(d)) return +d;
  const t = String(c?.prazo || ESTADO.exames[k]?.prazo || '');
  let m = t.match(/(\d+)\s*h/i);
  if (m) return +m[1] <= 24 ? 0 : Math.ceil(+m[1] / 24);
  m = t.match(/(\d+)\s*d/i);
  return m ? +m[1] : null;
}
// Nos PDFs o prazo sai em dias úteis ("2 dias" → "2 dias úteis", "1 dia" → "1 dia útil")
const textoPrazoPdf = k => textoPrazo(k).replace(/\bdias\b(?!\s+[uú]teis)/i, 'dias úteis').replace(/\bdia\b(?!\s+[uú]til)/i, 'dia útil');
const textoPrazo = k => { const c = ESTADO.catalogo?.[k], e = ESTADO.exames[k]; return prazoTexto(c?.prazoDias ?? e?.prazoDias) || c?.prazo || e?.prazo || ''; };

// Contexto: tabela de referência (perfil de custo, piso) e laboratório vinculado
// o: estado da proposta (pl ou pc)
function ctxLabSim(o = pl) {
  const t = ESTADO.tabelas[o.tabelaId] || null, l = ESTADO.laboratorios[o.labId] || null;
  return {
    t, l, tab: t ? { ...t, id: o.tabelaId } : null, piso: t?.piso ?? parametro('margemMinima'), margemSug: t?.margemSugerida ?? null,
    // preço simbólico (abaixo de R$ 1,00) não serve de referência
    ref: k => { const v = t ? t.precos?.[k] ?? null : ESTADO.exames[k]?.precoPraticado || null; return precoSimbolico(v) ? null : v; },
    refNome: t?.nome || 'Particular'
  };
}

function precoPadraoLab(cl, e, ref) {
  const atualLab = cl.l?.precos?.[e.id];
  if (pl.base === 'tab') return atualLab ?? ref;
  if (pl.base === 'desc') return ref != null ? Math.round(ref * (1 - (pl.d || 0) / 100)) : null;
  if (pl.base === 'msug') { const c = calcular(e, null, cl.tab); return precoParaMargem(c, c.margemSug ?? cl.margemSug) ?? null; }
  return ref;
}

function linhaLab(cl, e) {
  const k = e.id, it = pl.itens[k] || {}, ref = cl.ref(k), padrao = precoPadraoLab(cl, e, ref);
  const preco = it.p ?? padrao, vol = it.v || 0, c = calcular(e, preco, cl.tab);
  const lucro = c.lucro != null ? c.lucro * vol : null;
  return { e, k, ref, padrao, preco, man: it.p != null, sel: selLab(it), vol, c, receita: preco != null ? preco * vol : 0, lucro, prazo: diasPrazo(k), desc: ref && preco != null ? 1 - preco / ref : null };
}

function resumoLab(cl) {
  const s = { n: 0, vol: 0, receita: 0, lucro: 0, semCusto: 0, ab: 0, refT: 0, recC: 0 };
  Object.entries(pl.itens).forEach(([k, it]) => {
    const e = ESTADO.exames[k];
    if (!e || !selLab(it)) return;
    const x = linhaLab(cl, { ...e, id: k });
    if (x.preco == null) return;
    s.n++; s.vol += x.vol; s.receita += x.receita;
    if (x.c.semCusto) s.semCusto++;
    else { s.lucro += x.lucro; s.recC += x.receita; if (x.c.status === 'r') s.ab++; }
    if (x.ref) s.refT += x.ref * x.vol;
  });
  s.margem = s.recC ? s.lucro / s.recC : null;
  s.desc = s.refT ? 1 - s.receita / s.refT : null;
  s.viavel = s.margem != null && s.margem >= cl.piso;
  return s;
}

function desenharSimLab() {
  const el = document.getElementById('simulador-lab');
  if (pl.tabelaId == null || (pl.tabelaId && !ESTADO.tabelas[pl.tabelaId])) pl.tabelaId = tabelaLabPadrao()?.id || '';
  if (pl.labId && !ESTADO.laboratorios[pl.labId]) pl.labId = '';
  const cria = pode('simulador', 'criar'), sv = pl.id ? ESTADO.simulacoes[pl.id] : null;
  el.innerHTML = `<div class="card">
      <div class="sec-card-h"><span class="tc-ic" style="--c:#8b5cf6"><i class="fa-solid fa-handshake"></i></span>
        <div style="min-width:0;flex:1"><h3>${esc(pl.nome || 'Nova proposta')}${pl.sujo ? ' <span class="badge-s warn">não salva</span>' : sv ? ' <span class="badge-s ok">salva</span>' : ''}</h3>
          <div class="sub">${sv ? `${esc(sv.autor)} · ${dataHora(sv.atualizadoEm || sv.em)}` : 'Preço proposto × volume mensal por exame · margem pelo perfil de custo da tabela de referência'}</div></div>
        <div class="rt"><button class="btn qd" onclick="novaSimLab()" title="Nova proposta"><i class="fa-solid fa-plus" style="color:var(--cyan)"></i></button>
          <div id="pop-plsalvas"></div>
          <button class="btn qd" onclick="exportarSimLab()" title="Exportar planilha"><i class="fa-solid fa-file-csv"></i></button>
          <button class="btn qd" onclick="abrirPdfLab()" title="Proposta em PDF com texto de apresentação"><i class="fa-solid fa-file-pdf"></i></button>
          ${sv && pode('tabelas', 'criar') ? `<button class="btn qd" onclick="abrirConverterLab()" title="Converter: proposta salva vira tabela de preço ou laboratório apoiado"><i class="fa-solid fa-right-left"></i></button>` : ''}
          ${sv && (usuarioAtual().admin || sv.autorId === usuarioAtual().id || pode('simulador', 'aprovar')) ? `<button class="btn qd perigo-txt" onclick="excluirSimLab()" title="Excluir simulação"><i class="fa-solid fa-trash"></i></button>` : ''}
          ${cria ? `<button class="btn qd pri" onclick="salvarSimLab()" title="Salvar"><i class="fa-solid fa-floppy-disk"></i></button>` : ''}</div></div>
      <div class="fgrid pl-dados">
        ${campo('pl-nome', 'Nome da proposta', pl.nome, { tipo: 'text', ph: 'Ex.: Lab. Vida — out/2026', aoMudar: 'pl.nome=this.value;pl.sujo=true' })}
        <div class="field"><label>Laboratório</label><div id="pop-pllab" class="block"></div></div>
        <div class="field"><label>Tabela de referência</label><div id="pop-pltab" class="block"></div></div>
        <div class="field"><label>Preço inicial</label><div id="pop-plbase" class="block"></div></div>
        ${pl.base === 'desc' ? campo('pl-d', 'Desconto', pl.d, { suf: '%', passo: '0.5', aoMudar: 'pl.d=parseFloat(this.value)||0;pl.sujo=true;desenharTabelaLab()' }) : ''}
      </div>
      <div class="impact" id="pl-imp" style="padding-top:0"></div>
      <div class="toolbar">
        <div class="search"><i class="fa-solid fa-magnifying-glass"></i><input id="pl-q" value="${esc(pl.q)}" placeholder="Buscar exame…" oninput="pl.q=this.value;pl.pag=1;desenharTabelaLab()"></div>
        <div id="pop-plsetor"></div>
        <span class="hint"><i class="fa-solid fa-keyboard"></i> Enter / ↑ ↓ navegam</span>
      </div>
      <div class="chips" id="pl-chips"></div>
      <div class="bulk on" id="pl-bulk"></div>
      <div class="tbl-wrap"><table class="tab-edit"><thead id="pl-head"></thead><tbody id="pl-body"><tr><td colspan="12"><div class="vazio"><i class="fa-solid fa-circle-notch fa-spin"></i>Carregando…</div></td></tr></tbody></table></div>
      <div class="foot" id="pl-foot"></div></div>`;
  criarPop('pop-pllab', {
    rotulo: 'Laboratório', titulo: 'Laboratório da proposta', icone: 'fa-building-user', padrao: '', busca: 'Buscar laboratório…',
    opcoes: () => [{ valor: '', rotulo: 'Prospecção (sem cadastro)', icone: 'fa-user-plus', desc: 'Laboratório ainda não atendido' },
      ...lista(ESTADO.laboratorios, porNome).map(l => ({ valor: l.id, rotulo: l.nome, icone: 'fa-building-user', cor: ESTADO.tabelas[l.tabelaId]?.cor, desc: `${Object.keys(l.precos || {}).length} valor(es) diferenciado(s)` }))],
    aoMudar: v => { pl.labId = v; pl.sujo = true; if (v && ESTADO.laboratorios[v].tabelaId && ESTADO.tabelas[ESTADO.laboratorios[v].tabelaId]) pl.tabelaId = ESTADO.laboratorios[v].tabelaId; desenharSimLab(); }
  });
  POPS['pop-pllab'].valor = pl.labId; desenharBotaoPop('pop-pllab');
  criarPop('pop-pltab', {
    rotulo: 'Tabela', titulo: 'Tabela de referência', icone: 'fa-table-list', padrao: '',
    opcoes: () => [...tabelasLista().map(t => ({ valor: t.id, rotulo: t.nome, icone: t.icone, cor: t.cor, grupo: TIPOS_TABELA[t.tipo]?.nome, desc: `piso ${textoRegra(t, 'piso')} · ${resumoPerfil(t)}` })),
      { valor: '', rotulo: 'Particular', icone: 'fa-user', cor: '#00a8cc', grupo: 'Base', desc: 'Preço praticado e custos fixos padrão' }],
    aoMudar: v => { pl.tabelaId = v; pl.sujo = true; desenharSimLab(); }
  });
  POPS['pop-pltab'].valor = pl.tabelaId; desenharBotaoPop('pop-pltab');
  const cl = ctxLabSim();
  criarPop('pop-plbase', {
    rotulo: 'Preço inicial', titulo: 'Preço dos exames não digitados', icone: 'fa-tag', padrao: 'tab',
    opcoes: () => [{ valor: 'tab', rotulo: `Valor da ${cl.refNome}`, icone: 'fa-equals', desc: pl.labId ? 'ou o valor diferenciado atual do laboratório' : 'Preço da tabela de referência' },
      { valor: 'desc', rotulo: 'Desconto sobre a tabela', icone: 'fa-percent', desc: 'Tabela menos o percentual, sem centavos' },
      { valor: 'msug', rotulo: 'Sugestão de margem', icone: 'fa-bullseye', desc: cl.margemSug != null ? `Preço que atinge ${pct(cl.margemSug, 0)}` : 'Defina em Configurar da tabela' }],
    aoMudar: v => { pl.base = v; pl.sujo = true; desenharSimLab(); }
  });
  POPS['pop-plbase'].valor = pl.base; desenharBotaoPop('pop-plbase');
  criarPop('pop-plsetor', {
    rotulo: 'Setor', titulo: 'Filtrar por setor', icone: 'fa-filter', busca: 'Buscar setor…', limpavel: true,
    opcoes: () => opcoesSetorPop('Todos os setores'), aoMudar: () => { pl.pag = 1; desenharTabelaLab(); }
  });
  criarPop('pop-plsalvas', {
    rotulo: 'Salvas', titulo: 'Simulações salvas', icone: 'fa-folder-open', padrao: '', busca: 'Buscar…',
    opcoes: () => [{ valor: '', rotulo: lista(ESTADO.simulacoes).some(s => (s.tipo || 'lab') === 'lab') ? 'Abrir…' : 'Nenhuma salva', icone: 'fa-folder-open' },
      ...lista(ESTADO.simulacoes, (a, b) => (b.atualizadoEm || b.em || 0) - (a.atualizadoEm || a.em || 0)).filter(s => (s.tipo || 'lab') === 'lab').map(s => ({
        valor: s.id, rotulo: s.nome || 'Sem nome', icone: 'fa-handshake', cor: '#8b5cf6',
        desc: `${s.resumo ? `${s.resumo.n} exames · ${num(s.resumo.vol, 0)}/mês · ${fmt(s.resumo.receita)}` : ''} · ${esc(s.autor || '')} ${dataHora(s.atualizadoEm || s.em)}` }))],
    aoMudar: id => { POPS['pop-plsalvas'].valor = ''; if (id) abrirSimLab(id); }
  });
  garantirCatalogo().then(() => desenharTabelaLab());
}

const FILTROS_PL = {
  tab:   { nome: 'Na tabela',     f: (x, cl) => x.ref != null, icone: 'fa-table-list' },
  vol:   { nome: 'Na proposta',   f: x => x.sel, icone: 'fa-cart-shopping' },
  todos: { nome: 'Todos',         f: () => true, icone: 'fa-list' },
  man:   { nome: 'Preço digitado', f: x => x.man, cor: 'var(--cyan)' },
  r:     { nome: 'Abaixo do piso', f: x => x.c.status === 'r', cor: 'var(--red)' },
  x:     { nome: 'Sem custo',     f: x => x.preco != null && x.c.semCusto, cor: 'var(--gray)' }
};

let _plLinhas = [];
function desenharTabelaLab() {
  const body = document.getElementById('pl-body');
  if (!body) return;
  const cl = ctxLabSim(), fs = valorPop('pop-plsetor');
  const base = examesVisiveis().filter(e => e.ativo !== false)
    .filter(e => !fs || e.setorId === fs)
    .filter(e => contem(e.mn + ' ' + e.descricao, pl.q))
    .map(e => linhaLab(cl, e));
  document.getElementById('pl-chips').innerHTML = Object.entries(FILTROS_PL).map(([k, F]) => {
    const n = base.filter(x => F.f(x, cl)).length;
    if (!n && k !== pl.filtro && !['tab', 'vol', 'todos'].includes(k)) return '';
    return `<button class="chip ${pl.filtro === k ? 'on' : ''}" onclick="pl.filtro='${k}';pl.pag=1;desenharTabelaLab()">${F.cor ? `<span class="d" style="background:${F.cor}"></span>` : `<i class="fa-solid ${F.icone}"></i>`}${F.nome} <b>${n}</b></button>`;
  }).join('');
  const ls = base.filter(x => FILTROS_PL[pl.filtro].f(x, cl));
  const val = { mn: x => x.e.mn.toUpperCase(), desc: x => normalizar(x.e.descricao), prazo: x => x.prazo ?? 999, custo: x => x.c.custo ?? -1, ref: x => x.ref ?? -1,
    preco: x => x.preco ?? -1, margem: x => x.c.margem ?? -9, vol: x => x.vol, receita: x => x.receita }[pl.ordem] || (x => x.e.mn);
  ls.sort((a, b) => { const va = val(a), vb = val(b); return (va < vb ? -1 : va > vb ? 1 : 0) * pl.dir; });
  _plLinhas = ls;
  const n = Math.max(1, Math.ceil(ls.length / SIM_POR_PAG));
  if (pl.pag > n) pl.pag = n;
  const th = (r, k, cls) => thOrdem(r, k, pl.ordem, pl.dir, 'ordenarLab', cls);
  const marcaveis = ls.filter(x => x.preco != null), todosSel = marcaveis.length > 0 && marcaveis.every(x => x.sel);
  document.getElementById('pl-head').innerHTML = `<tr>${th(`<button class="cb sel-cx ${todosSel ? 'on' : ''}" onclick="event.stopPropagation();selecaoLoteLab('${todosSel ? 'nenhum' : 'todos'}')" title="${todosSel ? 'Desmarcar' : 'Selecionar'} todos os filtrados"><i class="fa-solid fa-check"></i></button>MN`, 'mn')}${th('Descrição', 'desc')}${th('Prazo', 'prazo', 'col-opt')}${th('Custo total', 'custo', 'num')}${th(esc(cl.refNome), 'ref', 'num')}
    ${th('Proposta', 'preco', 'num')}<th class="num col-opt">Desc.</th>${th('Margem', 'margem', 'num')}${th('Volume/mês', 'vol', 'num')}${th('Receita/mês', 'receita', 'num')}<th>Situação</th></tr>`;
  body.innerHTML = ls.slice((pl.pag - 1) * SIM_POR_PAG, pl.pag * SIM_POR_PAG).map(x => htmlLinhaLab(cl, x)).join('')
    || `<tr><td colspan="11">${vazio('fa-magnifying-glass', pl.filtro === 'vol' ? 'Nenhum exame na proposta ainda: marque o mnemônico ou informe o volume mensal.' : 'Nenhum exame com esses filtros')}</td></tr>`;
  document.getElementById('pl-foot').innerHTML = paginacao(ls.length, pl.pag, SIM_POR_PAG, 'paginaLab');
  desenharBulkLab(ls.length);
  desenharImpactoLab();
}

function htmlLinhaLab(cl, x) {
  const { e, k, ref, preco, man, sel, vol, c, desc } = x;
  return `<tr data-k="${esc(k)}" class="${sel ? 'ed' : ''}">
    <td class="mn"><button class="cb sel-cx ${sel ? 'on' : ''}" ${preco == null ? 'disabled' : ''} onclick="alternarSelLab(this)" title="${sel ? 'Tirar da' : 'Incluir na'} proposta"><i class="fa-solid fa-check"></i></button><a href="#" class="lk-mn" onclick="abrirFicha(this.closest('tr').dataset.k);return false">${esc(e.mn)}</a></td>
    <td class="desc" title="${esc(e.descricao)}">${esc(e.descricao)}</td>
    <td class="nw muted col-opt">${esc(textoPrazo(k)) || '—'}</td>
    <td class="num">${celulaCusto(c)}</td>
    <td class="num muted">${ref != null ? fmt(ref) : '—'}</td>
    <td class="num"><div class="price-in ${man ? 'on' : ''}"><span>R$</span><input type="number" step="0.01" min="0" data-c="p" value="${preco != null ? preco.toFixed(2) : ''}" placeholder="—"
      oninput="editarLab(this)" onchange="chipsLabDepois()" onkeydown="teclaLab(event)" onfocus="this.select()"></div></td>
    <td class="num muted col-opt">${desc != null ? pct(desc) : '—'}</td>
    <td class="num" style="color:${c.status === 'r' ? 'var(--red)' : 'inherit'}">${c.margem != null ? pct(c.margem) : '—'}</td>
    <td class="num"><div class="price-in vol-in ${vol > 0 ? 'on' : ''}"><input type="number" step="1" min="0" data-c="v" value="${vol || ''}" placeholder="0"
      oninput="editarLab(this)" onchange="chipsLabDepois()" onkeydown="teclaLab(event)" onfocus="this.select()"></div></td>
    <td class="num">${vol > 0 && preco != null ? fmt(x.receita) : '<span class="muted">—</span>'}</td>
    <td>${preco == null ? tagSt('p', 'fa-circle-minus', 'Sem preço') : c.status === 'x' ? tagStatus('x') : c.status === 'r' ? tagSt('r', 'fa-circle-xmark', 'Inviável') : tagSt('g', 'fa-circle-check', 'Viável')}</td></tr>`;
}

function editarLab(inp) {
  const tr = inp.closest('tr'), k = tr.dataset.k, e = ESTADO.exames[k], cl = ctxLabSim();
  if (!e) return;
  const txt = inp.value.trim(), v = txt === '' ? null : parseFloat(txt);
  if (v != null && (isNaN(v) || v < 0)) return;
  const it = pl.itens[k] ??= {};
  if (inp.dataset.c === 'v') { if (v > 0) { it.v = Math.round(v); it.s = true; } else delete it.v; }
  else {
    const padrao = precoPadraoLab(cl, { ...e, id: k }, cl.ref(k));
    if (v == null || (padrao != null && Math.abs(v - padrao) < 0.005)) delete it.p; else it.p = Math.round(v * 100) / 100;
  }
  if (!Object.keys(it).length) delete pl.itens[k];
  pl.sujo = true;
  // redesenha a linha mantendo o campo em edição
  const tmp = document.createElement('tbody');
  tmp.innerHTML = htmlLinhaLab(cl, linhaLab(cl, { ...e, id: k }));
  const nova = tmp.firstElementChild;
  tr.className = nova.className;
  [...tr.children].forEach((td, i) => {
    const pin = td.querySelector('.price-in');
    if (pin) pin.className = nova.children[i].querySelector('.price-in').className;
    else td.innerHTML = nova.children[i].innerHTML;
  });
  desenharImpactoLab();
}

// Marca/desmarca o exame na proposta; desmarcar também zera o volume
function alternarSelLab(bt) {
  const k = bt.closest('tr').dataset.k, it = pl.itens[k] ??= {};
  if (selLab(it)) { delete it.s; delete it.v; } else it.s = true;
  if (!Object.keys(it).length) delete pl.itens[k];
  pl.sujo = true;
  desenharTabelaLab();
}

// Seleção em lote nos exames filtrados com preço: 'todos', 'nenhum' ou 'inverter'
function selecaoLoteLab(modo) {
  let n = 0;
  _plLinhas.forEach(x => {
    if (x.preco == null) return;
    const it = pl.itens[x.k] ??= {}, marcar = modo === 'todos' || (modo === 'inverter' && !selLab(it));
    if (marcar) it.s = true; else { delete it.s; delete it.v; }
    if (!Object.keys(it).length) delete pl.itens[x.k];
    if (marcar) n++;
  });
  pl.sujo = true;
  desenharTabelaLab();
  toast(modo === 'nenhum' ? 'Filtrados desmarcados' : `${n} exame(s) selecionado(s)`);
}

let _plChipsTimer = null;
function chipsLabDepois() { clearTimeout(_plChipsTimer); _plChipsTimer = setTimeout(() => { if (!document.activeElement?.closest('#pl-body')) desenharTabelaLab(); }, 300); }

function teclaLab(ev) {
  if (!['Enter', 'ArrowDown', 'ArrowUp'].includes(ev.key)) return;
  ev.preventDefault();
  const c = ev.target.dataset.c, ins = [...document.querySelectorAll(`#pl-body input[data-c="${c}"]`)], i = ins.indexOf(ev.target);
  ins[ev.key === 'ArrowUp' ? i - 1 : i + 1]?.focus();
}

function desenharImpactoLab() {
  const el = document.getElementById('pl-imp');
  if (!el) return;
  const cl = ctxLabSim(), s = resumoLab(cl);
  const imp = (ic, rot, v, d, cls = '') => `<div class="imp"><div class="l"><i class="fa-solid ${ic}"></i>${rot}</div><div class="v">${v}</div><div class="d ${cls}">${d}</div></div>`;
  el.innerHTML = !s.n ? `<div class="alert x" style="grid-column:1/-1;margin:0"><i class="fa-solid fa-circle-info"></i><div>Informe o <b>volume mensal</b> dos exames que o laboratório vai enviar. O preço começa no valor da ${esc(cl.refNome)} e pode ser editado; a margem usa o perfil de custo da tabela (piso ${pct(cl.piso, 0)}).</div></div>`
    : imp('fa-flask-vial', 'Exames na proposta', num(s.n, 0), `<span class="muted">${num(s.vol, 0)} exames/mês</span>`)
    + imp('fa-sack-dollar', 'Receita mensal', fmt(s.receita), `<span class="muted">${s.desc != null ? `desconto médio ${pct(s.desc)} s/ ${esc(cl.refNome)}` : ''}</span>`)
    + imp('fa-coins', 'Lucro mensal', fmt(s.lucro), `<span class="muted">após custo total e imposto${s.semCusto ? ` · ${s.semCusto} sem custo fora da conta` : ''}</span>`)
    + imp('fa-percent', 'Margem ponderada', s.margem != null ? pct(s.margem) : '—', `piso ${pct(cl.piso, 0)}`, s.margem == null ? 'muted' : s.viavel ? 'up' : 'dn')
    + `<div class="imp viab ${s.viavel ? 'ok' : 'bad'}"><div class="l"><i class="fa-solid ${s.viavel ? 'fa-circle-check' : 'fa-circle-xmark'}"></i>Viabilidade</div><div class="v">${s.margem == null ? '—' : s.viavel ? 'Viável' : 'Inviável'}</div>
      <div class="d">${s.ab ? `${s.ab} exame(s) abaixo do piso` : 'todos os exames acima do piso'}</div></div>`;
}

function desenharBulkLab(nFilt) {
  const el = document.getElementById('pl-bulk');
  if (!el) return;
  const nSel = Object.values(pl.itens).filter(selLab).length, nVol = Object.values(pl.itens).filter(i => i.v > 0).length, nMan = Object.values(pl.itens).filter(i => i.p != null).length;
  const l = ESTADO.laboratorios[pl.labId];
  el.innerHTML = `<b>${num(nFilt, 0)} filtrado(s)</b>
    ${_plLinhas.some(x => x.preco != null) && _plLinhas.every(x => x.preco == null || x.sel)
      ? `<button class="btn sm" onclick="selecaoLoteLab('nenhum')" title="Desmarca todos os exames filtrados"><i class="fa-solid fa-xmark"></i>Deselecionar todos</button>`
      : `<button class="btn sm" onclick="selecaoLoteLab('todos')" title="Marca todos os exames filtrados com preço"><i class="fa-solid fa-check-double"></i>Selecionar todos</button>`}
    <button class="btn sm" onclick="selecaoLoteLab('inverter')" title="Marcados saem, desmarcados entram (só nos filtrados)"><i class="fa-solid fa-arrows-rotate"></i>Inverter seleção</button>
    ${nSel ? `<span class="tag"><i class="fa-solid fa-cart-shopping"></i>${num(nSel, 0)} na proposta</span>` : ''}
    <div class="inp" style="width:110px"><input id="pl-vlote" type="number" step="1" min="0" placeholder="Volume"><span class="suf">/mês</span></div>
    <button class="btn sm" onclick="volumeLoteLab()" title="Aplica o volume a todos os exames filtrados com preço"><i class="fa-solid fa-cart-plus"></i>Volume nos filtrados</button>
    ${nVol ? `<button class="btn sm" onclick="limparLab('v')"><i class="fa-solid fa-eraser"></i>Zerar volumes</button>` : ''}
    ${nMan ? `<button class="btn sm" onclick="limparLab('p')"><i class="fa-solid fa-rotate-left"></i>Desfazer ${nMan} preço(s) digitado(s)</button>` : ''}
    ${pode('simulador', 'criar') ? `<button class="btn sm" style="margin-left:auto" ${l && nSel ? '' : 'disabled'} onclick="levarSimLab()" title="${l ? `Preços dos exames da proposta viram rascunho de ${esc(l.nome)}` : 'Escolha um laboratório cadastrado'}"><i class="fa-solid fa-pen"></i>Levar ao rascunho${l ? ` de ${esc(l.nome)}` : ' do laboratório'}</button>` : ''}`;
}

function volumeLoteLab() {
  const v = Math.round(numCampo('pl-vlote'));
  if (!(v >= 0)) return toast('Informe o volume', 'erro');
  let n = 0;
  _plLinhas.forEach(x => {
    if (x.preco == null) return;
    const it = pl.itens[x.k] ??= {};
    if (v > 0) { it.v = v; it.s = true; } else delete it.v;
    if (!Object.keys(it).length) delete pl.itens[x.k];
    n++;
  });
  pl.sujo = true;
  desenharTabelaLab();
  toast(`Volume ${v} em ${n} exame(s)`);
}

async function limparLab(c) {
  const ok = await confirmar({ titulo: c === 'v' ? 'Zerar volumes?' : 'Desfazer preços digitados?', texto: c === 'v' ? 'Os exames continuam selecionados, sem volume.' : 'Os exames voltam ao preço inicial escolhido.', botao: c === 'v' ? 'Zerar' : 'Desfazer', perigo: true });
  if (!ok) return;
  Object.keys(pl.itens).forEach(k => { delete pl.itens[k][c]; if (!Object.keys(pl.itens[k]).length) delete pl.itens[k]; });
  pl.sujo = true;
  desenharTabelaLab();
}

function paginaLab(p) { pl.pag = p; desenharTabelaLab(); }
function ordenarLab(k) { pl.dir = pl.ordem === k ? -pl.dir : (['vol', 'receita'].includes(k) ? -1 : 1); pl.ordem = k; desenharTabelaLab(); }

// ── Salvar, abrir, nova ───────────────────────────────────────
async function novaSimLab() {
  if (pl.sujo && !await confirmar({ titulo: 'Descartar a simulação atual?', texto: 'As alterações não salvas serão perdidas.', botao: 'Descartar', perigo: true })) return;
  Object.assign(pl, { id: null, nome: '', labId: '', tabelaId: null, base: 'tab', d: 10, itens: {}, pdf: null, filtro: 'tab', pag: 1, sujo: false });
  desenharSimLab();
}

async function abrirSimLab(id) {
  const s = ESTADO.simulacoes[id];
  if (!s) return;
  if (pl.sujo && id !== pl.id && !await confirmar({ titulo: 'Abrir outra simulação?', texto: 'As alterações não salvas da atual serão perdidas.', botao: 'Abrir', perigo: true })) return;
  Object.assign(pl, { id, nome: s.nome || '', labId: s.labId || '', tabelaId: s.tabelaId ?? '', base: s.base || 'tab', d: s.d ?? 10,
    itens: JSON.parse(JSON.stringify(s.itens || {})), pdf: s.pdf ? { ...s.pdf } : null, filtro: 'vol', pag: 1, sujo: false });
  desenharSimLab();
}

async function salvarSimLab() {
  const cl = ctxLabSim(), r = resumoLab(cl), u = usuarioAtual();
  pl.nome = (valorCampo('pl-nome') || pl.nome).trim();
  if (!pl.nome) { document.getElementById('pl-nome')?.focus(); return toast('Dê um nome à proposta', 'erro'); }
  if (!Object.keys(pl.itens).length) return toast('Nada para salvar: selecione exames, informe volumes ou preços', 'erro');
  const id = pl.id || DB.novaChave('simulacoes'), antes = ESTADO.simulacoes[id];
  const dados = { tipo: 'lab', nome: pl.nome, labId: pl.labId || null, tabelaId: pl.tabelaId || '', base: pl.base, d: pl.d, itens: pl.itens, pdf: pdfParaSalvar(pl.pdf),
    resumo: { n: r.n, vol: r.vol, receita: Math.round(r.receita * 100) / 100, margem: r.margem, viavel: r.viavel },
    autor: antes?.autor || u.nome, autorId: antes?.autorId || u.id, em: antes?.em || DB.agora(), atualizadoEm: DB.agora(), atualizadoPor: u.nome };
  await DB.gravar(`${CAMINHOS.simulacoes}/${id}`, dados);
  ESTADO.simulacoes[id] = { ...dados, em: antes?.em || Date.now(), atualizadoEm: Date.now() };
  pl.id = id; pl.sujo = false;
  registrar('simulador', `Proposta "${pl.nome}" salva (${r.n} exames, ${fmt(r.receita)}/mês)`);
  desenharSimLab();
  toast('Simulação salva');
}

async function excluirSimLab() {
  const s = ESTADO.simulacoes[pl.id];
  if (!s || !await confirmar({ titulo: 'Excluir simulação?', texto: `"${esc(s.nome)}" será excluída.`, botao: 'Excluir', perigo: true })) return;
  await DB.remover(`${CAMINHOS.simulacoes}/${pl.id}`);
  delete ESTADO.simulacoes[pl.id];
  pl.id = null; pl.sujo = true;
  renderSimulador();
}

// ── Exportar e levar ao laboratório ───────────────────────────
function exportarSimLab() {
  const cl = ctxLabSim();
  let ls = Object.keys(pl.itens).filter(k => ESTADO.exames[k] && selLab(pl.itens[k])).map(k => linhaLab(cl, { ...ESTADO.exames[k], id: k }));
  if (!ls.length) ls = _plLinhas.filter(x => x.preco != null);
  if (!ls.length) return toast('Nenhum exame para exportar', 'erro');
  ls.sort((a, b) => a.e.mn.localeCompare(b.e.mn, 'pt-BR', { sensitivity: 'base' }));
  const dec = v => v == null ? '' : String(Math.round(v * 100) / 100).replace('.', ',');
  const q = s => `"${String(s || '').replace(/"/g, '""')}"`;
  const csv = [['Mnemônico', 'Exame', 'Prazo', cl.refNome, 'Proposta', 'Desconto', 'Volume/mês', 'Receita/mês'].join(';'),
    ...ls.map(x => [x.e.mn, q(x.e.descricao), q(textoPrazo(x.k)), dec(x.ref), dec(x.preco), x.desc != null ? pct(x.desc) : '', x.vol || '', x.vol ? dec(x.receita) : ''].join(';'))].join('\r\n') + '\r\n';
  baixarArquivo(`Proposta - ${pl.nome || 'laboratório'}.csv`, new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
}

async function levarSimLab() {
  const l = ESTADO.laboratorios[pl.labId], cl = ctxLabSim();
  if (!l) return;
  const valores = {};
  Object.entries(pl.itens).forEach(([k, it]) => {
    const e = ESTADO.exames[k];
    if (!e || !selLab(it)) return;
    const x = linhaLab(cl, { ...e, id: k });
    if (x.preco != null) valores[k] = x.preco;
  });
  if (!Object.keys(valores).length) return toast('Nenhum exame selecionado com preço', 'erro');
  const ok = await levarAoRascunho('lab:' + pl.labId, valores, `proposta "${pl.nome || 'sem nome'}"`);
  if (!ok) return;
  irParaGrade('lab:' + pl.labId);
  toast(`${Object.keys(valores).length} valor(es) no rascunho de ${l.nome}`);
}

// ── Converter a proposta salva em tabela ou laboratório apoiado ──
let _plConv = null;
// Preços dos exames selecionados na proposta
function precosSelLab() {
  const cl = ctxLabSim(), v = {};
  Object.entries(pl.itens).forEach(([k, it]) => {
    const e = ESTADO.exames[k];
    if (!e || !selLab(it)) return;
    const x = linhaLab(cl, { ...e, id: k });
    if (x.preco != null) v[k] = x.preco;
  });
  return v;
}

function abrirConverterLab() {
  if (!pl.id || pl.sujo) return toast('Salve a proposta antes de converter', 'erro');
  if (!Object.keys(precosSelLab()).length) return toast('Selecione os exames da proposta', 'erro');
  const tLab = ESTADO.tabelas[pl.tabelaId]?.tipo === 'lab' ? pl.tabelaId : tabelaLabPadrao()?.id || '';
  _plConv = { modo: 'lab', nome: pl.nome, tipo: 'lab', completa: false, tabelaId: tLab };
  abrirGaveta({
    sobre: 'Converter proposta', titulo: pl.nome,
    corpo: '<div id="pl-conv"></div>',
    rodape: `<span style="margin-right:auto"></span><button class="btn" onclick="fecharGaveta()">Cancelar</button>
      <button class="btn pri" id="pl-conv-ok" onclick="converterLab()"><i class="fa-solid fa-right-left"></i>Converter</button>`
  });
  desenharConverterLab();
}

// Valores que entram: tabela nova leva os selecionados (e, se pedido, o resto da referência);
// laboratório leva só o que difere da tabela base
function valoresConverterLab() {
  const c = _plConv, sel = precosSelLab();
  if (c.modo === 'tabela') {
    if (!c.completa) return sel;
    const cl = ctxLabSim(), todos = {};
    examesVisiveis().filter(e => e.ativo !== false).forEach(e => { const v = cl.ref(e.id); if (v != null) todos[e.id] = v; });
    return { ...todos, ...sel };
  }
  const base = ESTADO.tabelas[c.tabelaId]?.precos || {};
  return Object.fromEntries(Object.entries(sel).filter(([k, v]) => base[k] == null || Math.abs(base[k] - v) >= 0.005));
}

function desenharConverterLab() {
  const el = document.getElementById('pl-conv'), c = _plConv;
  if (!el) return;
  const cl = ctxLabSim(), nSel = Object.keys(precosSelLab()).length, n = Object.keys(valoresConverterLab()).length, direto = pode('tabelas', 'aprovar');
  const oc = (v, t, d, ic) => `<button type="button" class="oc ${c.modo === v ? 'on' : ''}" onclick="_plConv.modo='${v}';desenharConverterLab()"><span class="po-ic"><i class="fa-solid ${ic}"></i></span><span><b>${t}</b><small>${d}</small></span><i class="fa-solid fa-circle-check ck"></i></button>`;
  el.innerHTML = `<div class="form-col">
    <div class="sec-t"><i class="fa-solid fa-right-left"></i>A proposta vira</div>
    ${oc('lab', 'Laboratório apoiado', 'cadastro novo, com tabela base e valores diferenciados', 'fa-building-user')}
    ${oc('tabela', 'Nova tabela de preço', 'os preços da proposta viram uma tabela', 'fa-table-list')}
    ${campo('pl-conv-nome', c.modo === 'lab' ? 'Nome do laboratório' : 'Nome da tabela', c.nome, { tipo: 'text', aoMudar: '_plConv.nome=this.value' })}
    ${c.modo === 'lab' ? `<div class="field"><label>Tabela base</label><div id="pop-plconvtab" class="block"></div><span class="hint">Exame sem valor diferenciado usa o preço dela</span></div>`
      : `<div class="field"><label>Tipo</label><div id="pop-plconvtipo" class="block"></div><span class="hint">Piso de margem e perfil de custo copiados de ${esc(cl.refNome)}</span></div>
        <div class="casc"><div class="casc-r"><div class="lft"><i class="fa-solid fa-table-list"></i><div>Incluir tabela base<div class="s">demais exames entram com o valor de ${esc(cl.refNome)}</div></div></div>${chave(c.completa, '_plConv.completa=!_plConv.completa;desenharConverterLab()')}</div></div>`}
    <div class="alert x" style="margin:0"><i class="fa-solid fa-circle-info"></i><div>${c.modo === 'lab'
      ? `<b>${num(n, 0)}</b> valor(es) diferenciado(s) de ${num(nSel, 0)} exame(s) selecionado(s); os iguais à tabela base não são gravados.`
      : `<b>${num(n, 0)}</b> preço(s) na nova tabela.`} ${direto ? 'Os preços já ficam publicados.' : 'Os preços vão para o seu rascunho e dependem de aprovação.'}</div></div>
  </div>`;
  if (c.modo === 'lab') {
    const tabs = tabelasLista().filter(t => t.tipo === 'lab');
    criarPop('pop-plconvtab', {
      rotulo: 'Tabela', titulo: 'Tabela base', icone: 'fa-table-list', padrao: '',
      opcoes: () => tabs.length ? tabs.map(t => ({ valor: t.id, rotulo: t.nome, icone: t.icone, cor: t.cor, desc: `piso ${textoRegra(t, 'piso')} · ${resumoPerfil(t)}` })) : [{ valor: '', rotulo: 'Nenhuma tabela de laboratórios', icone: 'fa-ban', cor: 'var(--gray)' }],
      aoMudar: v => { _plConv.tabelaId = v; desenharConverterLab(); }
    });
    POPS['pop-plconvtab'].valor = c.tabelaId; desenharBotaoPop('pop-plconvtab');
  } else {
    criarPop('pop-plconvtipo', {
      rotulo: 'Tipo', titulo: 'Tipo da tabela', icone: 'fa-tags', padrao: 'lab',
      opcoes: () => Object.entries(TIPOS_TABELA).map(([k, t]) => ({ valor: k, rotulo: t.nome, icone: t.icone, desc: t.desc })),
      aoMudar: v => { _plConv.tipo = v; }
    });
    POPS['pop-plconvtipo'].valor = c.tipo; desenharBotaoPop('pop-plconvtipo');
  }
}

async function converterLab() {
  const c = _plConv, nome = (c.nome || '').trim(), valores = valoresConverterLab(), n = Object.keys(valores).length;
  const direto = pode('tabelas', 'aprovar'), cl = ctxLabSim(), agora = DB.agora();
  if (!nome) return toast('Informe o nome', 'erro');
  let id, alvo;
  if (c.modo === 'lab') {
    if (!c.tabelaId) return toast('Escolha a tabela base', 'erro');
    const rep = lista(ESTADO.laboratorios).find(l => normalizar(l.nome) === normalizar(nome));
    if (rep) return toast(`Já existe o laboratório ${rep.nome}`, 'erro');
    id = DB.novaChave(CAMINHOS.laboratorios); alvo = 'lab:' + id;
    const dados = { nome, tabelaId: c.tabelaId, ativo: true, obs: `Criado da proposta "${pl.nome}"`, precos: direto && n ? valores : null, criadoEm: agora, atualizadoEm: agora };
    await DB.gravar(`${CAMINHOS.laboratorios}/${id}`, dados);
    ESTADO.laboratorios[id] = ESTADO.laboratorios[id] || { ...dados };
    // a proposta passa a apontar para o laboratório criado
    await DB.mesclar(`${CAMINHOS.simulacoes}/${pl.id}`, { labId: id, tabelaId: c.tabelaId });
    Object.assign(ESTADO.simulacoes[pl.id], { labId: id, tabelaId: c.tabelaId });
    pl.labId = id; pl.tabelaId = c.tabelaId;
    registrar('laboratorios', `Laboratório ${nome} criado da proposta "${pl.nome}"${direto ? ` com ${n} valor(es) diferenciado(s)` : ''}`, { depois: { ...dados, precos: null } });
  } else {
    if (lista(ESTADO.tabelas).some(t => normalizar(t.nome) === normalizar(nome)) || normalizar(nome) === 'particular') return toast('Já existe uma tabela com esse nome', 'erro');
    if (!n) return toast('Nenhum preço para a tabela', 'erro');
    id = DB.novaChave(CAMINHOS.tabelas); alvo = id;
    const dados = { nome, tipo: c.tipo, cor: cl.t?.cor || PALETA[4], icone: TIPOS_TABELA[c.tipo].icone, descontoRef: cl.t?.descontoRef ?? 0, piso: cl.piso, margemSugerida: cl.margemSug, faixas: cl.t?.faixas || null,
      ativa: true, perfil: cl.t?.perfil || null, ordem: Math.max(0, ...lista(ESTADO.tabelas).map(t => t.ordem || 0)) + 1, precos: direto ? valores : null, criadoEm: agora, atualizadoEm: agora };
    await DB.gravar(`${CAMINHOS.tabelas}/${id}`, dados);
    ESTADO.tabelas[id] = ESTADO.tabelas[id] || { ...dados };
    registrar('tabelas', `Tabela ${nome} criada da proposta "${pl.nome}"${direto ? ` com ${n} preços` : ''}`, { depois: { ...dados, precos: null } });
  }
  fecharGaveta();
  if (!direto && n) await levarAoRascunho(alvo, valores, `proposta "${pl.nome}"`);
  irParaGrade(alvo);
  if (direto) grade.proxFiltro = null;
  toast(c.modo === 'lab' ? `${nome} cadastrado · ${n} valor(es) ${direto ? 'diferenciado(s)' : 'no rascunho'}` : `Tabela ${nome} criada · ${n} preço(s)${direto ? '' : ' no rascunho'}`);
}

// ═══ Proposta para cliente ════════════════════════════════════
// Exames incluídos um a um pela busca; o volume de exame multiplica o preço (o total é editável).
// O paciente tem um só atendimento: o custo fixo "Atendimento" (valor fixo, do perfil da tabela) sai de
// cada exame e é dividido entre os exames com custo, sem multiplicar pelo volume; os demais custos
// (teste, outros fixos, adicionais) multiplicam pelo volume de exame.
// itens: { chave: { q: volume de exame, p: preço unitário digitado, t: total digitado } } (ordem de inclusão)
// pdf: dados do PDF do orçamento (destinatário, textos próprios, opções) ou null
const pc = { id: null, nome: '', cliente: '', tabelaId: '', base: 'tab', d: 10, itens: {}, pdf: null, sujo: false };
// Rascunho no navegador: sobrevive ao recarregar a página até "Tirar todos"
const RASCUNHO_CLI = 'rascunhoPropostaCli';
try { Object.assign(pc, JSON.parse(localStorage.getItem(RASCUNHO_CLI)) || {}); } catch {}
function guardarRascunhoCli() {
  try {
    if (Object.keys(pc.itens).length || pc.nome || pc.cliente) localStorage.setItem(RASCUNHO_CLI, JSON.stringify(pc));
  } catch {}
}
window.addEventListener('beforeunload', guardarRascunhoCli);
let _pcSug = [], _pcHi = 0;

const custoFixoAtend = () => lista(ESTADO.custosFixos).find(f => normalizar(f.nome) === 'atendimento') || null;
// Um atendimento pelo perfil da tabela (tabela que não cobra atendimento = 0)
function atendPadraoCli(cl) {
  const f = custoFixoAtend(), p = f && cl.tab?.perfil?.[f.id];
  return !f || p === false ? 0 : typeof p === 'number' ? p : f.valor || 0;
}
function ctxCli() {
  const cl = ctxLabSim(pc);
  cl.atend = atendPadraoCli(cl);
  return cl;
}

function linhasCli(cl) {
  const fA = custoFixoAtend(), imp = parametro('imposto');
  const bs = Object.keys(pc.itens).filter(k => ESTADO.exames[k]).map(k => {
    const e = { ...ESTADO.exames[k], id: k }, c0 = calcular(e, null, cl.tab), at = fA && c0.fx.find(f => f.id === fA.id && f.aplica);
    return { e, k, c0, q: pc.itens[k].q || 1, base: c0.semCusto ? null : c0.custo - (at?.v || 0) };
  });
  // custo = custo da linha: (custo sem atendimento × volume) + parte do atendimento
  const nEx = bs.filter(b => b.base != null).length, atendUn = nEx ? cl.atend / nEx : 0;
  return bs.map(({ e, k, c0, q, base }) => {
    const it = pc.itens[k], ref = cl.ref(k), custo = base != null ? base * q + atendUn : null;
    const m = c0.margemSug ?? cl.margemSug ?? c0.alvo;
    const padrao = pc.base === 'desc' ? (ref != null ? Math.round(ref * (1 - (pc.d || 0) / 100)) : null)
      : pc.base === 'msug' && custo != null && 1 - imp - m > 0 ? Math.ceil(custo / q / (1 - imp - m)) : ref;
    const preco = it.t != null ? it.t / q : it.p ?? padrao, total = it.t ?? (preco != null ? Math.round(preco * q * 100) / 100 : null);
    const lucro = total != null && custo != null ? total * (1 - imp) - custo : null, margem = lucro != null && total > 0 ? lucro / total : null;
    const dica = custo == null ? '' : `(${[`Teste ${fmt(c0.teste.valor)}`, ...c0.fx.filter(f => f.aplica && f.id !== fA?.id).map(f => `${f.nome} ${fmt(f.v)}`),
      ...c0.extras.map(x => `${x.nome} ${fmt(x.valor)}`)].join(' + ')} = ${fmt(base)}) × ${q} + Atendimento ÷ ${nEx} ${fmt(atendUn)} = ${fmt(custo)}`;
    return { e, k, q, ref, padrao, preco, total, custo, base, atendUn, c0, lucro, margem, dica, manP: it.p != null, manT: it.t != null,
      status: preco == null ? 'p' : custo == null ? 'x' : margem < c0.min ? 'r' : 'g', desc: ref && preco != null ? 1 - preco / ref : null };
  });
}

function resumoCli(cl, ls) {
  const s = { n: ls.length, un: 0, receita: 0, lucro: 0, recC: 0, refT: 0, recR: 0, semCusto: 0, ab: 0 };
  ls.forEach(x => {
    if (x.total == null) return;
    s.un += x.q; s.receita += x.total;
    if (x.custo == null) s.semCusto++;
    else { s.lucro += x.lucro; s.recC += x.total; if (x.status === 'r') s.ab++; }
    if (x.ref) { s.refT += x.ref * x.q; s.recR += x.total; }
  });
  s.margem = s.recC ? s.lucro / s.recC : null;
  s.desc = s.refT ? 1 - s.recR / s.refT : null;
  s.viavel = s.margem != null && s.margem >= cl.piso;
  return s;
}

function desenharSimCli() {
  const el = document.getElementById('simulador-cli');
  if (!el) return;
  if (pc.tabelaId && !ESTADO.tabelas[pc.tabelaId]) pc.tabelaId = '';
  const cria = pode('simulador', 'criar'), sv = pc.id ? ESTADO.simulacoes[pc.id] : null, cl = ctxCli(), fA = custoFixoAtend();
  el.innerHTML = `<div class="card">
      <div class="sec-card-h"><span class="tc-ic" style="--c:#00a8cc"><i class="fa-solid fa-user"></i></span>
        <div style="min-width:0;flex:1"><h3>${esc(pc.nome || 'Nova proposta')}${pc.sujo ? ' <span class="badge-s warn">não salva</span>' : sv ? ' <span class="badge-s ok">salva</span>' : ''}</h3>
          <div class="sub">${sv ? `${esc(sv.autor)} · ${dataHora(sv.atualizadoEm || sv.em)}` : 'Exames escolhidos × volume de exame · um só atendimento dividido entre os exames'}</div></div>
        <div class="rt"><button class="btn qd" onclick="novaSimCli()" title="Nova proposta"><i class="fa-solid fa-plus" style="color:var(--cyan)"></i></button>
          <div id="pop-pcsalvas"></div>
          <button class="btn qd" onclick="exportarSimCli()" title="Exportar planilha"><i class="fa-solid fa-file-csv"></i></button>
          <button class="btn qd" onclick="abrirPdfCli()" title="Orçamento em PDF para o cliente"><i class="fa-solid fa-file-pdf"></i></button>
          ${sv && (usuarioAtual().admin || sv.autorId === usuarioAtual().id || pode('simulador', 'aprovar')) ? `<button class="btn qd perigo-txt" onclick="excluirSimCli()" title="Excluir proposta"><i class="fa-solid fa-trash"></i></button>` : ''}
          ${cria ? `<button class="btn qd pri" onclick="salvarSimCli()" title="Salvar"><i class="fa-solid fa-floppy-disk"></i></button>` : ''}</div></div>
      <div class="fgrid pl-dados">
        ${campo('pc-nome', 'Nome da proposta', pc.nome, { tipo: 'text', ph: 'Ex.: Check-up Maria — out/2026', aoMudar: 'pc.nome=this.value;pc.sujo=true' })}
        ${campo('pc-cliente', 'Cliente', pc.cliente, { tipo: 'text', ph: 'Nome do paciente ou empresa', aoMudar: 'pc.cliente=this.value;pc.sujo=true' })}
        <div class="field"><label>Tabela de referência</label><div id="pop-pctab" class="block"></div></div>
        <div class="field"><label>Preço inicial</label><div id="pop-pcbase" class="block"></div></div>
        ${pc.base === 'desc' ? campo('pc-d', 'Desconto', pc.d, { suf: '%', passo: '0.5', aoMudar: 'pc.d=parseFloat(this.value)||0;pc.sujo=true;atualizarLinhasCli()' }) : ''}
        ${campo('pc-atend', 'Custo do atendimento', cl.atend.toFixed(2), { pre: 'R$', tipo: 'text', desab: true,
          dica: !fA ? 'Sem custo fixo "Atendimento" cadastrado' : `valor fixo${cl.atend ? '' : ' (a tabela não cobra)'} · um só por paciente, dividido entre os exames` })}
      </div>
      <div class="impact" id="pc-imp" style="padding-top:0"></div>
      <div class="toolbar">
        <div class="gx-busca"><div class="search"><i class="fa-solid fa-magnifying-glass"></i><input id="pc-q" placeholder="Adicionar exame: mnemônico ou nome…" autocomplete="off"
            oninput="buscarCli(this.value)" onfocus="buscarCli(this.value)" onkeydown="teclaBuscaCli(event)" onblur="setTimeout(fecharSugCli, 150)"></div>
          <div class="gx-sug" id="pc-sug"></div></div>
        <span class="hint"><i class="fa-solid fa-keyboard"></i> Enter adiciona · ↑ ↓ escolhem</span>
      </div>
      <div class="bulk on" id="pc-bulk"></div>
      <div class="tbl-wrap"><table class="tab-edit"><thead><tr><th>MN</th><th>Descrição</th><th class="col-opt">Prazo</th><th class="num" title="Custo da linha: custo do exame × volume + parte do atendimento">Custo total</th><th class="num">${esc(cl.refNome)}</th>
        <th class="num">Preço</th><th class="num col-opt">Desc.</th><th class="num" title="Multiplica o preço do exame">Volume de exame</th><th class="num">Total</th><th class="num">Margem</th><th>Situação</th><th></th></tr></thead>
        <tbody id="pc-body"></tbody></table></div></div>`;
  criarPop('pop-pctab', {
    rotulo: 'Tabela', titulo: 'Tabela de referência', icone: 'fa-table-list', padrao: '',
    opcoes: () => [{ valor: '', rotulo: 'Particular', icone: 'fa-user', cor: '#00a8cc', grupo: 'Base', desc: 'Preço praticado e custos fixos padrão' },
      ...tabelasLista().map(t => ({ valor: t.id, rotulo: t.nome, icone: t.icone, cor: t.cor, grupo: TIPOS_TABELA[t.tipo]?.nome, desc: `piso ${textoRegra(t, 'piso')} · ${resumoPerfil(t)}` }))],
    aoMudar: v => { pc.tabelaId = v; pc.sujo = true; desenharSimCli(); }
  });
  POPS['pop-pctab'].valor = pc.tabelaId; desenharBotaoPop('pop-pctab');
  criarPop('pop-pcbase', {
    rotulo: 'Preço inicial', titulo: 'Preço dos exames não digitados', icone: 'fa-tag', padrao: 'tab',
    opcoes: () => [{ valor: 'tab', rotulo: `Valor da ${cl.refNome}`, icone: 'fa-equals', desc: 'Preço da tabela de referência' },
      { valor: 'desc', rotulo: 'Desconto sobre a tabela', icone: 'fa-percent', desc: 'Tabela menos o percentual, sem centavos' },
      { valor: 'msug', rotulo: 'Sugestão de margem', icone: 'fa-bullseye', desc: cl.margemSug != null ? `Preço que atinge ${pct(cl.margemSug, 0)}` : 'Preço que atinge a margem alvo' }],
    aoMudar: v => { pc.base = v; pc.sujo = true; desenharSimCli(); }
  });
  POPS['pop-pcbase'].valor = pc.base; desenharBotaoPop('pop-pcbase');
  criarPop('pop-pcsalvas', {
    rotulo: 'Salvas', titulo: 'Propostas de cliente salvas', icone: 'fa-folder-open', padrao: '', busca: 'Buscar…',
    opcoes: () => { const ss = lista(ESTADO.simulacoes, (a, b) => (b.atualizadoEm || b.em || 0) - (a.atualizadoEm || a.em || 0)).filter(s => s.tipo === 'cli');
      return [{ valor: '', rotulo: ss.length ? 'Abrir…' : 'Nenhuma salva', icone: 'fa-folder-open' },
        ...ss.map(s => ({ valor: s.id, rotulo: s.nome || 'Sem nome', icone: 'fa-user', cor: '#00a8cc',
          desc: `${s.cliente ? s.cliente + ' · ' : ''}${s.resumo ? `${s.resumo.n} exames · ${fmt(s.resumo.receita)}` : ''} · ${s.autor || ''} ${dataHora(s.atualizadoEm || s.em)}` }))]; },
    aoMudar: id => { POPS['pop-pcsalvas'].valor = ''; if (id) abrirSimCli(id); }
  });
  garantirCatalogo().then(() => desenharTabelaCli());
}

function desenharTabelaCli() {
  const body = document.getElementById('pc-body');
  if (!body) return;
  const cl = ctxCli(), ls = linhasCli(cl);
  body.innerHTML = ls.map(x => htmlLinhaCli(cl, x)).join('')
    || `<tr><td colspan="12">${vazio('fa-magnifying-glass', 'Nenhum exame ainda: busque pelo mnemônico ou nome e tecle Enter para adicionar.')}</td></tr>`;
  desenharImpactoCli(cl, ls);
}

function htmlLinhaCli(cl, x) {
  const { e, k, q, ref, preco, total, custo, status } = x;
  const inp = (c, v, on, extra = '') => `<div class="price-in ${on ? 'on' : ''}${c === 'q' ? ' vol-in' : ''}">${c === 'q' ? '' : '<span>R$</span>'}<input type="number" step="${c === 'q' ? 1 : 0.01}" min="${c === 'q' ? 1 : 0}" data-c="${c}" value="${v}" placeholder="—"
      onchange="setTimeout(()=>editarCli(this))" onkeydown="teclaCli(event)" onfocus="this.dataset.v=this.value;this.select()"${extra}></div>`;
  return `<tr data-k="${esc(k)}" class="ed">
    <td class="mn"><a href="#" class="lk-mn" onclick="abrirFicha(this.closest('tr').dataset.k);return false">${esc(e.mn)}</a></td>
    <td class="desc" title="${esc(e.descricao)}">${esc(e.descricao)}</td>
    <td class="nw muted col-opt">${esc(textoPrazo(k)) || '—'}</td>
    <td class="num">${custo != null ? `<span title="${esc(x.dica)}">${fmt(custo)}</span><div class="sub-num cus-cli" title="${esc(x.dica)}">${q > 1 ? `<b>${q}×</b> ${fmt(x.base)}` : fmt(x.base)}${x.atendUn ? ` <i class="fa-solid fa-user-doctor"></i> ${fmt(x.atendUn)}` : ''}</div>` : '—'}</td>
    <td class="num muted">${ref != null ? fmt(ref) : '—'}</td>
    <td class="num">${inp('p', preco != null ? preco.toFixed(2) : '', x.manP)}</td>
    <td class="num muted col-opt">${x.desc != null ? pct(x.desc) : '—'}</td>
    <td class="num">${inp('q', q, true)}</td>
    <td class="num">${inp('t', total != null ? total.toFixed(2) : '', x.manT, ' title="Valor final: preço × volume de exame"')}</td>
    <td class="num" style="color:${status === 'r' ? 'var(--red)' : 'inherit'}">${x.margem != null ? pct(x.margem) : '—'}${x.lucro != null ? `<div class="sub-num" style="color:var(--${x.lucro < 0 ? 'red' : 'green'})">lucro ${fmt(x.lucro)}</div>` : ''}</td>
    <td>${status === 'p' ? tagSt('p', 'fa-circle-minus', 'Sem preço') : status === 'x' ? tagStatus('x') : status === 'r' ? tagSt('r', 'fa-circle-xmark', 'Abaixo do piso') : tagSt('g', 'fa-circle-check', 'OK')}</td>
    <td class="acts"><button title="Tirar da proposta" onclick="removerCli(this)"><i class="fa-solid fa-xmark"></i></button></td></tr>`;
}

// Redesenha as linhas e devolve o foco ao campo onde o usuário estava (a parte do atendimento muda em todas)
function atualizarLinhasCli() {
  const body = document.getElementById('pc-body');
  if (!body) return;
  const cl = ctxCli(), ls = linhasCli(cl), ativo = document.activeElement, tmp = document.createElement('tbody');
  const fk = ativo?.dataset.c && body.contains(ativo) ? [ativo.closest('tr').dataset.k, ativo.dataset.c] : null;
  if (ls.length !== body.querySelectorAll('tr[data-k]').length) return desenharTabelaCli();
  ls.forEach(x => {
    const tr = [...body.children].find(t => t.dataset.k === x.k);
    if (!tr) return;
    tmp.innerHTML = htmlLinhaCli(cl, x);
    const nova = tmp.firstElementChild;
    [...tr.children].forEach((td, i) => { td.innerHTML = nova.children[i].innerHTML; });
  });
  if (fk) [...body.querySelectorAll(`input[data-c="${fk[1]}"]`)].find(i => i.closest('tr').dataset.k === fk[0])?.focus();
  desenharImpactoCli(cl, ls);
}

function editarCli(inp) {
  const k = inp.closest('tr').dataset.k, it = pc.itens[k], txt = inp.value.trim(), v = txt === '' ? null : parseFloat(txt);
  if (!it || (v != null && (isNaN(v) || v < 0))) return;
  const c = inp.dataset.c;
  if (c === 'q') {
    if (!(v >= 1)) return;
    // total digitado vira preço unitário: o novo volume multiplica o mesmo preço
    if (it.t != null) { it.p = Math.round(it.t / (it.q || 1) * 10000) / 10000; delete it.t; }
    it.q = Math.round(v);
  } else if (c === 't') {
    if (v == null) delete it.t; else { it.t = Math.round(v * 100) / 100; delete it.p; }
  } else {
    delete it.t;
    const padrao = linhasCli(ctxCli()).find(x => x.k === k)?.padrao;
    if (v == null || (padrao != null && Math.abs(v - padrao) < 0.005)) delete it.p; else it.p = Math.round(v * 100) / 100;
  }
  pc.sujo = true;
  atualizarLinhasCli();
}

function teclaCli(ev) {
  if (ev.key === 'Escape') { ev.target.value = ev.target.dataset.v ?? ''; return ev.target.blur(); }
  if (!['Enter', 'ArrowDown', 'ArrowUp'].includes(ev.key)) return;
  ev.preventDefault();
  const c = ev.target.dataset.c, ins = [...document.querySelectorAll(`#pc-body input[data-c="${c}"]`)], i = ins.indexOf(ev.target);
  const prox = ins[ev.key === 'ArrowUp' ? i - 1 : i + 1];
  if (prox) prox.focus();
  else if (ev.key === 'Enter') document.getElementById('pc-q')?.focus();
}

function removerCli(bt) {
  delete pc.itens[bt.closest('tr').dataset.k];
  pc.sujo = true;
  desenharTabelaCli();
}

function desenharImpactoCli(cl, ls) {
  guardarRascunhoCli();
  const el = document.getElementById('pc-imp');
  if (!el) return;
  const s = resumoCli(cl, ls), un = ls.find(x => x.custo != null)?.atendUn;
  const imp = (ic, rot, v, d, cls = '') => `<div class="imp"><div class="l"><i class="fa-solid ${ic}"></i>${rot}</div><div class="v">${v}</div><div class="d ${cls}">${d}</div></div>`;
  el.innerHTML = !s.n ? `<div class="alert x" style="grid-column:1/-1;margin:0"><i class="fa-solid fa-circle-info"></i><div>Busque e adicione os exames do cliente. O <b>volume de exame</b> multiplica o preço e o total pode ser editado; o paciente tem <b>um só atendimento</b> (${fmt(cl.atend)}), dividido entre os exames.</div></div>`
    : imp('fa-flask-vial', 'Exames', num(s.n, 0), `<span class="muted">${num(s.un, 0)} com o volume</span>`)
    + imp('fa-headset', 'Atendimento', fmt(cl.atend), `<span class="muted">um só${un != null ? ` · ${fmt(un)} por exame` : ''}</span>`)
    + imp('fa-sack-dollar', 'Total da proposta', fmt(s.receita), `<span class="muted">${s.desc != null ? `desconto médio ${pct(s.desc)} s/ ${esc(cl.refNome)}` : ''}</span>`)
    + imp('fa-coins', 'Lucro', fmt(s.lucro), `<span class="muted">após custo total e imposto${s.semCusto ? ` · ${s.semCusto} sem custo fora da conta` : ''}</span>`)
    + imp('fa-percent', 'Margem ponderada', s.margem != null ? pct(s.margem) : '—', `piso ${pct(cl.piso, 0)}`, s.margem == null ? 'muted' : s.viavel ? 'up' : 'dn')
    + `<div class="imp viab ${s.viavel ? 'ok' : 'bad'}"><div class="l"><i class="fa-solid ${s.viavel ? 'fa-circle-check' : 'fa-circle-xmark'}"></i>Viabilidade</div><div class="v">${s.margem == null ? '—' : s.viavel ? 'Viável' : 'Inviável'}</div>
      <div class="d">${s.ab ? `${s.ab} exame(s) abaixo do piso` : 'todos os exames acima do piso'}</div></div>`;
  desenharBulkCli(s);
}

function desenharBulkCli(s) {
  const el = document.getElementById('pc-bulk');
  if (!el) return;
  const nMan = Object.values(pc.itens).filter(i => i.p != null || i.t != null).length;
  el.innerHTML = `<b>${num(s.n, 0)} exame(s)</b>${s.un !== s.n ? `<span class="tag"><i class="fa-solid fa-layer-group"></i>${num(s.un, 0)} com o volume</span>` : ''}
    ${nMan ? `<button class="btn sm" onclick="limparPrecosCli()"><i class="fa-solid fa-rotate-left"></i>Desfazer ${nMan} preço(s) digitado(s)</button>` : ''}
    ${s.n ? `<button class="btn sm" onclick="tirarTodosCli()"><i class="fa-solid fa-eraser"></i>Tirar todos</button>` : ''}`;
}

// ── Busca: inclui o exame na proposta ─────────────────────────
function buscarCli(q) {
  const el = document.getElementById('pc-sug'), cl = ctxCli();
  if (!el || !q.trim()) return fecharSugCli();
  const ini = normalizar(q.trim()), pri = e => normalizar(e.mn).startsWith(ini) ? 0 : 1;
  const todos = examesVisiveis().filter(e => e.ativo !== false && contem(e.mn + ' ' + e.descricao, q))
    .sort((a, b) => pri(a) - pri(b) || String(a.mn).localeCompare(String(b.mn), 'pt-BR'));
  const vis = todos.slice(0, 10);
  _pcSug = vis.map(e => e.id); _pcHi = 0;
  el.innerHTML = !vis.length ? `<div class="gx-sug-v"><i class="fa-solid fa-magnifying-glass"></i>Nenhum exame encontrado para <b>${esc(q)}</b></div>`
    : vis.map((e, i) => {
      const ja = e.id in pc.itens, ref = cl.ref(e.id);
      return `<button type="button" class="${i ? '' : 'hi'}" onmousedown="event.preventDefault();adicionarCli(_pcSug[${i}])" onmouseenter="marcarSugCli(${i})">
        <b>${esc(e.mn)}</b><span title="${esc(e.descricao)}">${esc(e.descricao)}</span><small class="${ja ? 'c' : ref != null ? 'g' : ''}"><i class="fa-solid ${ja ? 'fa-plus' : ref != null ? 'fa-table-list' : 'fa-circle-plus'}"></i>${ja ? 'na proposta · +1 no volume' : ref != null ? fmt(ref) : 'sem preço'}</small></button>`;
    }).join('') + (todos.length > vis.length ? `<div class="gx-sug-v">+ ${todos.length - vis.length} exame(s): continue digitando para refinar</div>` : '');
  el.classList.add('open');
}
function fecharSugCli() { _pcSug = []; document.getElementById('pc-sug')?.classList.remove('open'); }
function marcarSugCli(i) {
  _pcHi = i;
  const bs = document.querySelectorAll('#pc-sug button');
  bs.forEach((b, j) => b.classList.toggle('hi', j === i));
  bs[i]?.scrollIntoView({ block: 'nearest' });
}
function teclaBuscaCli(ev) {
  if (ev.key === 'Escape' && _pcSug.length) { ev.stopPropagation(); return fecharSugCli(); }
  if (!_pcSug.length) return;
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); marcarSugCli(Math.max(0, Math.min(_pcSug.length - 1, _pcHi + (ev.key === 'ArrowDown' ? 1 : -1)))); }
  else if (ev.key === 'Enter') { ev.preventDefault(); adicionarCli(_pcSug[_pcHi]); }
}
// Exame já na proposta: soma 1 ao volume
function adicionarCli(k) {
  const e = ESTADO.exames[k];
  if (!e) return;
  const it = pc.itens[k];
  if (it) { if (it.t != null) { it.p = Math.round(it.t / (it.q || 1) * 10000) / 10000; delete it.t; } it.q = (it.q || 1) + 1; }
  else pc.itens[k] = { q: 1 };
  pc.sujo = true;
  const q = document.getElementById('pc-q');
  if (q) q.value = '';
  fecharSugCli();
  desenharTabelaCli();
  q?.focus();
  if (it) toast(`${e.mn}: volume ${it.q}`);
}

async function limparPrecosCli() {
  if (!await confirmar({ titulo: 'Desfazer preços digitados?', texto: 'Os exames voltam ao preço inicial escolhido.', botao: 'Desfazer', perigo: true })) return;
  Object.values(pc.itens).forEach(it => { delete it.p; delete it.t; });
  pc.sujo = true;
  desenharTabelaCli();
}
async function tirarTodosCli() {
  if (!await confirmar({ titulo: 'Tirar todos os exames?', texto: 'A proposta fica sem exames.', botao: 'Tirar', perigo: true })) return;
  pc.itens = {};
  pc.sujo = true;
  try { localStorage.removeItem(RASCUNHO_CLI); } catch {}
  desenharTabelaCli();
}

// ── Salvar, abrir, nova, exportar ─────────────────────────────
async function novaSimCli() {
  if (pc.sujo && !await confirmar({ titulo: 'Descartar a proposta atual?', texto: 'As alterações não salvas serão perdidas.', botao: 'Descartar', perigo: true })) return;
  Object.assign(pc, { id: null, nome: '', cliente: '', tabelaId: '', base: 'tab', d: 10, itens: {}, pdf: null, sujo: false });
  desenharSimCli();
}

async function abrirSimCli(id) {
  const s = ESTADO.simulacoes[id];
  if (!s) return;
  if (pc.sujo && id !== pc.id && !await confirmar({ titulo: 'Abrir outra proposta?', texto: 'As alterações não salvas da atual serão perdidas.', botao: 'Abrir', perigo: true })) return;
  // ordem de inclusão guardada em "o" (o banco devolve as chaves em ordem alfabética)
  const itens = Object.entries(JSON.parse(JSON.stringify(s.itens || {}))).sort((a, b) => (a[1].o ?? 0) - (b[1].o ?? 0));
  Object.assign(pc, { id, nome: s.nome || '', cliente: s.cliente || '', tabelaId: s.tabelaId ?? '', base: s.base || 'tab', d: s.d ?? 10, pdf: s.pdf ? { ...s.pdf } : null,
    itens: Object.fromEntries(itens.map(([k, it]) => { delete it.o; return [k, it]; })), sujo: false });
  desenharSimCli();
}

async function salvarSimCli() {
  const cl = ctxCli(), r = resumoCli(cl, linhasCli(cl)), u = usuarioAtual();
  pc.nome = (valorCampo('pc-nome') || pc.nome).trim();
  if (!pc.nome) { document.getElementById('pc-nome')?.focus(); return toast('Dê um nome à proposta', 'erro'); }
  if (!Object.keys(pc.itens).length) return toast('Nada para salvar: adicione exames', 'erro');
  const id = pc.id || DB.novaChave('simulacoes'), antes = ESTADO.simulacoes[id];
  const itens = Object.fromEntries(Object.entries(pc.itens).map(([k, it], i) => [k, { ...it, o: i }]));
  const dados = { tipo: 'cli', nome: pc.nome, cliente: pc.cliente.trim() || null, tabelaId: pc.tabelaId || '', base: pc.base, d: pc.d, itens, pdf: pdfParaSalvar(pc.pdf, modeloPropostaCli()),
    resumo: { n: r.n, un: r.un, receita: Math.round(r.receita * 100) / 100, margem: r.margem, viavel: r.viavel },
    autor: antes?.autor || u.nome, autorId: antes?.autorId || u.id, em: antes?.em || DB.agora(), atualizadoEm: DB.agora(), atualizadoPor: u.nome };
  await DB.gravar(`${CAMINHOS.simulacoes}/${id}`, dados);
  ESTADO.simulacoes[id] = { ...dados, em: antes?.em || Date.now(), atualizadoEm: Date.now() };
  pc.id = id; pc.sujo = false;
  registrar('simulador', `Proposta cliente "${pc.nome}" salva (${r.n} exames, ${fmt(r.receita)})`);
  renderSimulador();
  toast('Proposta salva');
}

async function excluirSimCli() {
  const s = ESTADO.simulacoes[pc.id];
  if (!s || !await confirmar({ titulo: 'Excluir proposta?', texto: `"${esc(s.nome)}" será excluída.`, botao: 'Excluir', perigo: true })) return;
  await DB.remover(`${CAMINHOS.simulacoes}/${pc.id}`);
  delete ESTADO.simulacoes[pc.id];
  pc.id = null; pc.sujo = true;
  renderSimulador();
}

function exportarSimCli() {
  const cl = ctxCli(), ls = linhasCli(cl);
  if (!ls.length) return toast('Nenhum exame para exportar', 'erro');
  const dec = v => v == null ? '' : String(Math.round(v * 100) / 100).replace('.', ',');
  const q = s => `"${String(s || '').replace(/"/g, '""')}"`;
  const s = resumoCli(cl, ls);
  const csv = [['Mnemônico', 'Exame', 'Prazo', cl.refNome, 'Preço', 'Desconto', 'Volume de exame', 'Total'].join(';'),
    ...ls.map(x => [x.e.mn, q(x.e.descricao), q(textoPrazo(x.k)), dec(x.ref), dec(x.preco), x.desc != null ? pct(x.desc) : '', x.q, dec(x.total)].join(';')),
    ['', q('Total'), '', '', '', s.desc != null ? pct(s.desc) : '', s.un, dec(s.receita)].join(';')].join('\r\n') + '\r\n';
  baixarArquivo(`Proposta cliente - ${pc.nome || pc.cliente || 'sem nome'}.csv`, new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
}

// ═══ Proposta para médico ═════════════════════════════════════
// Desconto aos pacientes que o médico encaminha ao laboratório. Cada exame com o custo normal
// (todos os custos, sem dividir atendimento); o volume é a expectativa mensal de envio de pacientes.
// Exames entram um a um pela busca ou todos da tabela de referência de uma vez (ou só de um setor).
// itens: { chave: { v: volume esperado/mês, p: preço digitado } } (ordem de inclusão)
// pdf: dados do PDF da proposta ao médico ou null
// Médico e empresas usam o mesmo módulo: pm aponta para o estado da aba aberta (PMS.med | PMS.emp).
// medico/crm guardam o nome e o documento do destinatário (na empresa: razão social e CNPJ).
// sem: custos fixos fora da conta (médico: coleta; empresa: atendimento)
const PM_MODOS = {
  med: { tipo: 'med', chave: 'rascunhoPropostaMed', sem: ['coleta'], icone: 'fa-user-doctor', cor: '#10b981',
    sub: 'Desconto aos pacientes do médico · custo de cada exame sem a coleta × expectativa mensal de envio', phNome: 'Ex.: Dr. Silva — out/2026',
    rotPessoa: 'Médico', phPessoa: 'Nome do médico', rotDoc: 'CRM / especialidade', phDoc: 'Ex.: CRM-CE 12345 · Endocrinologia',
    rotPreco: 'Preço paciente', titVol: 'Expectativa de pacientes enviados pelo médico por mês', impVol: 'Pacientes esperados', subVol: 'exames encaminhados pelo médico',
    mes: '/mês', rotVol: 'Volume/mês', rotTot: 'Receita/mês', impRec: 'Receita mensal', subRec: 'pela expectativa de envio', impLuc: 'Lucro mensal', phVol: 'informe o volume/mês',
    intro: 'Monte a lista de exames com desconto para os pacientes do médico', introVol: 'que o médico deve encaminhar', semTxt: 'sem a coleta',
    titSalvas: 'Propostas de médico salvas', reg: 'Proposta médico', pdfTit: 'Proposta de desconto em PDF para o médico', semVolTxt: 'Fica só o que o médico deve encaminhar' },
  emp: { tipo: 'emp', chave: 'rascunhoPropostaEmp', sem: ['atendimento'], icone: 'fa-building', cor: '#f59e0b',
    sub: 'Proposta de venda à empresa · custo de cada exame sem o atendimento × quantidade de exames', phNome: 'Ex.: Empresa X — out/2026',
    rotPessoa: 'Empresa', phPessoa: 'Razão social', rotDoc: 'CNPJ / contato', phDoc: 'Ex.: 00.000.000/0001-00 · RH',
    rotPreco: 'Preço empresa', titVol: 'Quantidade de exames na proposta', impVol: 'Quantidade de exames', subVol: 'exames vendidos na proposta',
    mes: '', rotVol: 'Qtd', rotTot: 'Total', impRec: 'Total da proposta', subRec: 'preço × quantidade', impLuc: 'Lucro da proposta', phVol: 'informe a quantidade',
    intro: 'Monte a lista de exames da proposta à empresa', introVol: 'de cada exame (venda única, não é acordo mensal)', semTxt: 'sem o atendimento',
    titSalvas: 'Propostas de empresa salvas', reg: 'Proposta empresa', pdfTit: 'Proposta em PDF para a empresa', semVolTxt: 'Fica só o que tem quantidade' }
};
const novoPm = modo => ({ modo, id: null, nome: '', medico: '', crm: '', tabelaId: '', base: 'desc', d: 10, itens: {}, pdf: null, sujo: false, filtro: 'todos', q: '', pag: 1, ordem: '', dir: 1 });
const PMS = { med: novoPm('med'), emp: novoPm('emp') };
// Rascunho no navegador: sobrevive ao recarregar a página até "Tirar todos"
Object.values(PMS).forEach(o => { try { Object.assign(o, JSON.parse(localStorage.getItem(PM_MODOS[o.modo].chave)) || {}, { q: '', pag: 1, modo: o.modo }); } catch {} });
let pm = PMS[simAba === 'emp' ? 'emp' : 'med'];
const PMM = () => PM_MODOS[pm.modo];
function guardarRascunhoMed() {
  Object.values(PMS).forEach(o => {
    try { if (Object.keys(o.itens).length || o.nome || o.medico) localStorage.setItem(PM_MODOS[o.modo].chave, JSON.stringify(o)); } catch {}
  });
}
window.addEventListener('beforeunload', guardarRascunhoMed);
let _pmSug = [], _pmHi = 0, _pmLinhas = [];

const ctxMed = () => ctxLabSim(pm);
function precoPadraoMed(cl, e, ref) {
  if (pm.base === 'desc') return ref != null ? Math.round(ref * (1 - (pm.d || 0) / 100)) : null;
  if (pm.base === 'msug') { const c = calcular(e, null, cl.tab, PMM().sem); return precoParaMargem(c, c.margemSug ?? cl.margemSug ?? c.alvo) ?? null; }
  return ref;
}
function linhaMed(cl, k) {
  const e = { ...ESTADO.exames[k], id: k }, it = pm.itens[k] || {}, ref = cl.ref(k), padrao = precoPadraoMed(cl, e, ref);
  const preco = it.p ?? padrao, vol = it.v || 0, c = calcular(e, preco, cl.tab, PMM().sem);
  return { e, k, ref, padrao, preco, man: it.p != null, vol, c, receita: preco != null ? preco * vol : 0, lucro: c.lucro != null ? c.lucro * vol : null,
    prazo: diasPrazo(k), desc: ref && preco != null ? 1 - preco / ref : null };
}
const linhasMed = cl => Object.keys(pm.itens).filter(k => ESTADO.exames[k]).map(k => linhaMed(cl, k));

// Margem e desconto ponderados pelo volume esperado; sem volume nenhum, cada exame pesa 1
function resumoMed(cl, ls) {
  const s = { n: ls.length, vol: 0, receita: 0, lucro: 0, semCusto: 0, ab: 0, semPreco: 0 };
  const comVol = ls.some(x => x.vol > 0 && x.preco != null), peso = x => comVol ? x.vol : 1;
  let recC = 0, lucC = 0, refT = 0, recR = 0;
  ls.forEach(x => {
    if (x.preco == null) { s.semPreco++; return; }
    s.vol += x.vol; s.receita += x.receita;
    if (x.c.semCusto) s.semCusto++;
    else { s.lucro += x.lucro || 0; lucC += x.c.lucro * peso(x); recC += x.preco * peso(x); if (x.c.status === 'r') s.ab++; }
    if (x.ref) { refT += x.ref * peso(x); recR += x.preco * peso(x); }
  });
  s.comVol = comVol;
  s.margem = recC ? lucC / recC : null;
  s.desc = refT ? 1 - recR / refT : null;
  s.viavel = s.margem != null && s.margem >= cl.piso;
  return s;
}

function desenharSimMed() {
  const el = document.getElementById(`simulador-${pm.modo}`), M = PMM();
  if (!el) return;
  if (pm.tabelaId && !ESTADO.tabelas[pm.tabelaId]) pm.tabelaId = '';
  const cria = pode('simulador', 'criar'), sv = pm.id ? ESTADO.simulacoes[pm.id] : null, cl = ctxMed();
  el.innerHTML = `<div class="card">
      <div class="sec-card-h"><span class="tc-ic" style="--c:${M.cor}"><i class="fa-solid ${M.icone}"></i></span>
        <div style="min-width:0;flex:1"><h3>${esc(pm.nome || 'Nova proposta')}${pm.sujo ? ' <span class="badge-s warn">não salva</span>' : sv ? ' <span class="badge-s ok">salva</span>' : ''}</h3>
          <div class="sub">${sv ? `${esc(sv.autor)} · ${dataHora(sv.atualizadoEm || sv.em)}` : M.sub}</div></div>
        <div class="rt"><button class="btn qd" onclick="novaSimMed()" title="Nova proposta"><i class="fa-solid fa-plus" style="color:var(--cyan)"></i></button>
          <div id="pop-pmsalvas"></div>
          <button class="btn qd" onclick="exportarSimMed()" title="Exportar planilha"><i class="fa-solid fa-file-csv"></i></button>
          <button class="btn qd" onclick="abrirPdfMed()" title="${M.pdfTit}"><i class="fa-solid fa-file-pdf"></i></button>
          ${sv && (usuarioAtual().admin || sv.autorId === usuarioAtual().id || pode('simulador', 'aprovar')) ? `<button class="btn qd perigo-txt" onclick="excluirSimMed()" title="Excluir proposta"><i class="fa-solid fa-trash"></i></button>` : ''}
          ${cria ? `<button class="btn qd pri" onclick="salvarSimMed()" title="Salvar"><i class="fa-solid fa-floppy-disk"></i></button>` : ''}</div></div>
      <div class="fgrid pl-dados">
        ${campo('pm-nome', 'Nome da proposta', pm.nome, { tipo: 'text', ph: M.phNome, aoMudar: 'pm.nome=this.value;pm.sujo=true' })}
        ${campo('pm-medico', M.rotPessoa, pm.medico, { tipo: 'text', ph: M.phPessoa, aoMudar: 'pm.medico=this.value;pm.sujo=true' })}
        ${campo('pm-crm', M.rotDoc, pm.crm, { tipo: 'text', ph: M.phDoc, aoMudar: 'pm.crm=this.value;pm.sujo=true' })}
        <div class="field"><label>Tabela de referência</label><div id="pop-pmtab" class="block"></div></div>
        <div class="field"><label>${M.rotPreco}</label><div id="pop-pmbase" class="block"></div></div>
        ${pm.base === 'desc' ? campo('pm-d', 'Desconto', pm.d, { suf: '%', passo: '0.5', aoMudar: 'pm.d=parseFloat(this.value)||0;pm.sujo=true;desenharTabelaMed()' }) : ''}
      </div>
      <div class="impact" id="pm-imp" style="padding-top:0"></div>
      <div class="toolbar">
        <div class="gx-busca"><div class="search"><i class="fa-solid fa-magnifying-glass"></i><input id="pm-add" placeholder="Adicionar exame: mnemônico ou nome…" autocomplete="off"
            oninput="buscarMed(this.value)" onfocus="buscarMed(this.value)" onkeydown="teclaBuscaMed(event)" onblur="setTimeout(fecharSugMed, 150)"></div>
          <div class="gx-sug" id="pm-sug"></div></div>
        <div id="pop-pmsetor"></div>
        <button class="btn" id="pm-todos" onclick="incluirTodosMed()"></button>
      </div>
      <div class="toolbar" style="padding-top:0">
        <div class="search"><i class="fa-solid fa-filter"></i><input id="pm-q" value="${esc(pm.q)}" placeholder="Filtrar na proposta…" oninput="pm.q=this.value;pm.pag=1;desenharTabelaMed()"></div>
        <div class="chips" id="pm-chips" style="margin:0"></div>
        <span class="hint"><i class="fa-solid fa-keyboard"></i> Enter / ↑ ↓ / Tab confirmam · Esc desfaz</span>
      </div>
      <div class="bulk on" id="pm-bulk"></div>
      <div class="tbl-wrap"><table class="tab-edit"><thead id="pm-head"></thead><tbody id="pm-body"><tr><td colspan="12"><div class="vazio"><i class="fa-solid fa-circle-notch fa-spin"></i>Carregando…</div></td></tr></tbody></table></div>
      <div class="foot" id="pm-foot"></div></div>`;
  criarPop('pop-pmtab', {
    rotulo: 'Tabela', titulo: 'Tabela de referência', icone: 'fa-table-list', padrao: '',
    opcoes: () => [{ valor: '', rotulo: 'Particular', icone: 'fa-user', cor: '#00a8cc', grupo: 'Base', desc: 'Preço praticado e custos fixos padrão' },
      ...tabelasLista().map(t => ({ valor: t.id, rotulo: t.nome, icone: t.icone, cor: t.cor, grupo: TIPOS_TABELA[t.tipo]?.nome, desc: `piso ${textoRegra(t, 'piso')} · ${resumoPerfil(t)}` }))],
    aoMudar: v => { pm.tabelaId = v; pm.sujo = true; desenharSimMed(); }
  });
  POPS['pop-pmtab'].valor = pm.tabelaId; desenharBotaoPop('pop-pmtab');
  criarPop('pop-pmbase', {
    rotulo: M.rotPreco, titulo: 'Preço dos exames não digitados', icone: 'fa-tag', padrao: 'desc',
    opcoes: () => [{ valor: 'desc', rotulo: 'Desconto sobre a tabela', icone: 'fa-percent', desc: `${esc(cl.refNome)} menos o percentual, sem centavos` },
      { valor: 'tab', rotulo: `Valor da ${cl.refNome}`, icone: 'fa-equals', desc: 'Sem desconto: ajuste exame a exame' },
      { valor: 'msug', rotulo: 'Sugestão de margem', icone: 'fa-bullseye', desc: cl.margemSug != null ? `Preço que atinge ${pct(cl.margemSug, 0)}` : 'Preço que atinge a margem alvo' }],
    aoMudar: v => { pm.base = v; pm.sujo = true; desenharSimMed(); }
  });
  POPS['pop-pmbase'].valor = pm.base; desenharBotaoPop('pop-pmbase');
  criarPop('pop-pmsetor', {
    rotulo: 'Setor', titulo: 'Setor: filtra a lista e o "incluir todos"', icone: 'fa-filter', busca: 'Buscar setor…', limpavel: true,
    opcoes: () => opcoesSetorPop('Todos os setores'), aoMudar: () => { pm.pag = 1; desenharTabelaMed(); }
  });
  criarPop('pop-pmsalvas', {
    rotulo: 'Salvas', titulo: M.titSalvas, icone: 'fa-folder-open', padrao: '', busca: 'Buscar…',
    opcoes: () => { const ss = lista(ESTADO.simulacoes, (a, b) => (b.atualizadoEm || b.em || 0) - (a.atualizadoEm || a.em || 0)).filter(s => s.tipo === M.tipo);
      return [{ valor: '', rotulo: ss.length ? 'Abrir…' : 'Nenhuma salva', icone: 'fa-folder-open' },
        ...ss.map(s => ({ valor: s.id, rotulo: s.nome || 'Sem nome', icone: M.icone, cor: M.cor,
          desc: `${s.medico ? s.medico + ' · ' : ''}${s.resumo ? `${s.resumo.n} exames · ${num(s.resumo.vol || 0, 0)}${M.mes || ' exames'} · ${fmt(s.resumo.receita)}` : ''} · ${s.autor || ''} ${dataHora(s.atualizadoEm || s.em)}` }))]; },
    aoMudar: id => { POPS['pop-pmsalvas'].valor = ''; if (id) abrirSimMed(id); }
  });
  garantirCatalogo().then(() => desenharTabelaMed());
}

const FILTROS_PM = {
  todos: { nome: 'Todos',          f: () => true, icone: 'fa-list' },
  vol:   { nome: 'Com volume',     f: x => x.vol > 0, icone: 'fa-cart-shopping' },
  man:   { nome: 'Preço digitado', f: x => x.man, cor: 'var(--cyan)' },
  r:     { nome: 'Abaixo do piso', f: x => x.c.status === 'r', cor: 'var(--red)' },
  x:     { nome: 'Sem custo',      f: x => x.preco != null && x.c.semCusto, cor: 'var(--gray)' },
  p:     { nome: 'Sem preço',      f: x => x.preco == null, cor: 'var(--amber)' }
};

function desenharTabelaMed() {
  const body = document.getElementById('pm-body');
  if (!body) return;
  const cl = ctxMed(), fs = valorPop('pop-pmsetor'), todas = linhasMed(cl);
  const base = todas.filter(x => (!fs || x.e.setorId === fs) && contem(x.e.mn + ' ' + x.e.descricao, pm.q));
  if (!FILTROS_PM[pm.filtro]) pm.filtro = 'todos';
  document.getElementById('pm-chips').innerHTML = Object.entries(FILTROS_PM).map(([k, F]) => {
    const n = base.filter(F.f).length;
    if (!n && k !== pm.filtro && k !== 'todos') return '';
    return `<button class="chip ${pm.filtro === k ? 'on' : ''}" onclick="pm.filtro='${k}';pm.pag=1;desenharTabelaMed()">${F.cor ? `<span class="d" style="background:${F.cor}"></span>` : `<i class="fa-solid ${F.icone}"></i>`}${F.nome} <b>${n}</b></button>`;
  }).join('');
  const ls = base.filter(FILTROS_PM[pm.filtro].f);
  const val = { mn: x => x.e.mn.toUpperCase(), desc: x => normalizar(x.e.descricao), prazo: x => x.prazo ?? 999, custo: x => x.c.custo ?? -1, ref: x => x.ref ?? -1,
    preco: x => x.preco ?? -1, pd: x => x.desc ?? -9, margem: x => x.c.margem ?? -9, vol: x => x.vol, receita: x => x.receita }[pm.ordem];
  if (val) ls.sort((a, b) => { const va = val(a), vb = val(b); return (va < vb ? -1 : va > vb ? 1 : 0) * pm.dir; });
  _pmLinhas = ls;
  const n = Math.max(1, Math.ceil(ls.length / SIM_POR_PAG));
  if (pm.pag > n) pm.pag = n;
  const th = (r, k, cls) => thOrdem(r, k, pm.ordem, pm.dir, 'ordenarMed', cls);
  document.getElementById('pm-head').innerHTML = `<tr>${th('MN', 'mn')}${th('Descrição', 'desc')}${th('Prazo', 'prazo', 'col-opt')}${th('Custo total', 'custo', 'num')}${th(esc(cl.refNome), 'ref', 'num')}
    ${th(PMM().rotPreco, 'preco', 'num')}${th('Desc.', 'pd', 'num col-opt')}${th('Margem', 'margem', 'num')}${th(`<span title="${PMM().titVol}">${PMM().rotVol}</span>`, 'vol', 'num')}${th(PMM().rotTot, 'receita', 'num')}<th>Situação</th><th></th></tr>`;
  body.innerHTML = ls.slice((pm.pag - 1) * SIM_POR_PAG, pm.pag * SIM_POR_PAG).map(x => htmlLinhaMed(x)).join('')
    || `<tr><td colspan="12">${vazio(todas.length ? 'fa-magnifying-glass' : PMM().icone, todas.length ? 'Nenhum exame com esses filtros'
      : `Nenhum exame ainda: busque pelo mnemônico ou nome e tecle Enter, ou use <b>Incluir todos da ${esc(cl.refNome)}</b>.`)}</td></tr>`;
  document.getElementById('pm-foot').innerHTML = paginacao(ls.length, pm.pag, SIM_POR_PAG, 'paginaMed');
  botaoTodosMed(cl);
  desenharImpactoMed(cl, todas);
}

function htmlLinhaMed(x) {
  const { e, k, ref, preco, man, vol, c, desc } = x;
  const inp = (cc, v, on, extra = '') => `<div class="price-in ${on ? 'on' : ''}${cc === 'v' ? ' vol-in' : ''}">${cc === 'v' ? '' : '<span>R$</span>'}<input type="number" step="${cc === 'v' ? 1 : 0.01}" min="0" data-c="${cc}" value="${v}" placeholder="${cc === 'v' ? '0' : '—'}"
      onchange="setTimeout(()=>editarMed(this))" onkeydown="teclaMed(event)" onfocus="this.dataset.v=this.value;this.select()"${extra}></div>`;
  const lucro = vol > 0 ? x.lucro : c.lucro;
  return `<tr data-k="${esc(k)}" class="ed">
    <td class="mn"><a href="#" class="lk-mn" onclick="abrirFicha(this.closest('tr').dataset.k);return false">${esc(e.mn)}</a></td>
    <td class="desc" title="${esc(e.descricao)}">${esc(e.descricao)}</td>
    <td class="nw muted col-opt">${esc(textoPrazo(k)) || '—'}</td>
    <td class="num">${celulaCusto(c)}</td>
    <td class="num muted">${ref != null ? fmt(ref) : '—'}</td>
    <td class="num">${inp('p', preco != null ? preco.toFixed(2) : '', man)}</td>
    <td class="num muted col-opt">${desc != null ? pct(desc) : '—'}</td>
    <td class="num" style="color:${c.status === 'r' ? 'var(--red)' : 'inherit'}">${c.margem != null ? pct(c.margem) : '—'}${lucro != null ? `<div class="sub-num" style="color:var(--${lucro < 0 ? 'red' : 'green'})">lucro ${fmt(lucro)}${vol > 0 ? PMM().mes || ' total' : ''}</div>` : ''}</td>
    <td class="num">${inp('v', vol || '', vol > 0, ` title="${PMM().titVol}"`)}</td>
    <td class="num">${vol > 0 && preco != null ? fmt(x.receita) : '<span class="muted">—</span>'}</td>
    <td>${preco == null ? tagSt('p', 'fa-circle-minus', 'Sem preço') : c.status === 'x' ? tagStatus('x') : c.status === 'r' ? tagSt('r', 'fa-circle-xmark', 'Abaixo do piso') : tagSt('g', 'fa-circle-check', 'OK')}</td>
    <td class="acts"><button title="Tirar da proposta" onclick="removerMed(this)"><i class="fa-solid fa-xmark"></i></button></td></tr>`;
}

// Valor confirmado (Enter, setas, Tab ou clicar fora): redesenha só a linha e devolve o foco
function editarMed(inp) {
  const tr = inp.closest('tr'), k = tr?.dataset.k, it = pm.itens[k], txt = inp.value.trim(), v = txt === '' ? null : parseFloat(txt);
  if (!it || (v != null && (isNaN(v) || v < 0))) return;
  const cl = ctxMed();
  if (inp.dataset.c === 'v') { if (v > 0) it.v = Math.round(v); else delete it.v; }
  else {
    const padrao = precoPadraoMed(cl, { ...ESTADO.exames[k], id: k }, cl.ref(k));
    if (v == null || (padrao != null && Math.abs(v - padrao) < 0.005)) delete it.p; else it.p = Math.round(v * 100) / 100;
  }
  pm.sujo = true;
  if (!tr.isConnected) return desenharTabelaMed();
  const ativo = document.activeElement, fc = tr.contains(ativo) ? ativo.dataset.c : null, tmp = document.createElement('tbody');
  tmp.innerHTML = htmlLinhaMed(linhaMed(cl, k));
  tr.replaceWith(tmp.firstElementChild);
  if (fc) document.querySelector(`#pm-body tr[data-k="${CSS.escape(k)}"] input[data-c="${fc}"]`)?.focus();
  desenharImpactoMed(cl, linhasMed(cl));
}

function teclaMed(ev) {
  if (ev.key === 'Escape') { ev.target.value = ev.target.dataset.v ?? ''; return ev.target.blur(); }
  if (!['Enter', 'ArrowDown', 'ArrowUp'].includes(ev.key)) return;
  ev.preventDefault();
  const c = ev.target.dataset.c, ins = [...document.querySelectorAll(`#pm-body input[data-c="${c}"]`)], i = ins.indexOf(ev.target);
  const prox = ins[ev.key === 'ArrowUp' ? i - 1 : i + 1];
  if (prox) prox.focus(); else ev.target.blur();
}

function removerMed(bt) {
  delete pm.itens[bt.closest('tr').dataset.k];
  pm.sujo = true;
  desenharTabelaMed();
}

function desenharImpactoMed(cl, ls) {
  guardarRascunhoMed();
  const el = document.getElementById('pm-imp');
  if (!el) return;
  const s = resumoMed(cl, ls), M = PMM();
  const imp = (ic, rot, v, d, cls = '') => `<div class="imp"><div class="l"><i class="fa-solid ${ic}"></i>${rot}</div><div class="v">${v}</div><div class="d ${cls}">${d}</div></div>`;
  el.innerHTML = !s.n ? `<div class="alert x" style="grid-column:1/-1;margin:0"><i class="fa-solid fa-circle-info"></i><div>${M.intro}: adicione um a um pela busca ou <b>inclua todos da ${esc(cl.refNome)}</b> e tire o que não entra.
      Informe ${M.mes ? 'o <b>volume/mês</b>' : 'a <b>quantidade</b>'} ${M.introVol}; a margem usa o custo de cada exame ${M.semTxt} (piso ${pct(cl.piso, 0)}).</div></div>`
    : imp('fa-flask-vial', 'Exames na proposta', num(s.n, 0), `<span class="muted">${s.desc != null ? `desconto médio ${pct(s.desc)} s/ ${esc(cl.refNome)}` : ''}${s.semPreco ? ` · ${s.semPreco} sem preço` : ''}</span>`)
    + imp('fa-users', M.impVol, `${num(s.vol, 0)}${M.mes ? '<small>/mês</small>' : ''}`, `<span class="muted">${s.vol ? M.subVol : M.phVol}</span>`)
    + imp('fa-sack-dollar', M.impRec, s.vol ? fmt(s.receita) : '—', `<span class="muted">${M.subRec}</span>`)
    + imp('fa-coins', M.impLuc, s.vol ? fmt(s.lucro) : '—', `<span class="muted">após custo ${M.semTxt} e imposto${s.semCusto ? ` · ${s.semCusto} sem custo fora da conta` : ''}</span>`, s.vol ? (s.lucro < 0 ? 'dn' : 'up') : '')
    + imp('fa-percent', s.comVol ? 'Margem ponderada' : 'Margem média', s.margem != null ? pct(s.margem) : '—', `piso ${pct(cl.piso, 0)}${s.comVol ? ' · pelo volume' : ' · sem volume, por exame'}`, s.margem == null ? 'muted' : s.viavel ? 'up' : 'dn')
    + `<div class="imp viab ${s.viavel ? 'ok' : 'bad'}"><div class="l"><i class="fa-solid ${s.viavel ? 'fa-circle-check' : 'fa-circle-xmark'}"></i>Viabilidade</div><div class="v">${s.margem == null ? '—' : s.viavel ? 'Viável' : 'Inviável'}</div>
      <div class="d">${s.ab ? `${s.ab} exame(s) abaixo do piso` : 'todos os exames acima do piso'}</div></div>`;
  desenharBulkMed(s);
}

function desenharBulkMed(s) {
  const el = document.getElementById('pm-bulk');
  if (!el) return;
  const its = Object.values(pm.itens), nMan = its.filter(i => i.p != null).length, nVol = its.filter(i => i.v > 0).length, nSemVol = s.n - nVol;
  el.innerHTML = `<b>${num(s.n, 0)} exame(s)</b>${_pmLinhas.length !== s.n ? `<span class="tag"><i class="fa-solid fa-filter"></i>${num(_pmLinhas.length, 0)} filtrado(s)</span>` : ''}
    ${s.n ? `<div class="inp" style="width:110px"><input id="pm-vlote" type="number" step="1" min="0" placeholder="${PMM().mes ? 'Volume' : 'Qtd'}" onkeydown="if(event.key==='Enter')volumeLoteMed()"><span class="suf">${PMM().mes || 'exames'}</span></div>
      <button class="btn sm" onclick="volumeLoteMed()" title="Aplica ${PMM().mes ? 'o volume' : 'a quantidade'} aos exames filtrados"><i class="fa-solid fa-cart-plus"></i>${PMM().mes ? 'Volume' : 'Qtd'} nos filtrados</button>` : ''}
    ${nVol ? `<button class="btn sm" onclick="zerarVolumesMed()"><i class="fa-solid fa-eraser"></i>Zerar volumes</button>` : ''}
    ${nMan ? `<button class="btn sm" onclick="limparPrecosMed()"><i class="fa-solid fa-rotate-left"></i>Desfazer ${nMan} preço(s) digitado(s)</button>` : ''}
    ${nVol && nSemVol ? `<button class="btn sm" onclick="tirarSemVolumeMed()" title="${PMM().semVolTxt}"><i class="fa-solid fa-filter-circle-xmark"></i>Tirar ${nSemVol} sem volume</button>` : ''}
    ${_pmLinhas.length && _pmLinhas.length !== s.n ? `<button class="btn sm" onclick="tirarFiltradosMed()"><i class="fa-solid fa-xmark"></i>Tirar os ${num(_pmLinhas.length, 0)} filtrados</button>` : ''}
    ${s.n ? `<button class="btn sm" onclick="tirarTodosMed()"><i class="fa-solid fa-trash-can"></i>Tirar todos</button>` : ''}`;
}

// ── Incluir: um a um pela busca ou todos da tabela ────────────
// Exames ativos com preço na tabela de referência (e do setor escolhido) que ainda não estão na proposta
function faltantesMed(cl) {
  const fs = valorPop('pop-pmsetor');
  return examesVisiveis().filter(e => e.ativo !== false && !(e.id in pm.itens) && (!fs || e.setorId === fs) && cl.ref(e.id) != null)
    .sort((a, b) => String(a.mn).localeCompare(String(b.mn), 'pt-BR', { sensitivity: 'base' }));
}
function botaoTodosMed(cl) {
  const bt = document.getElementById('pm-todos');
  if (!bt) return;
  const n = faltantesMed(cl).length, s = ESTADO.setores[valorPop('pop-pmsetor')];
  bt.disabled = !n;
  bt.title = `Inclui os exames com preço na ${cl.refNome}${s ? ` do setor ${s.nome}` : ''} que ainda não estão na proposta`;
  bt.innerHTML = `<i class="fa-solid fa-list-check"></i>${n ? `Incluir ${num(n, 0)} da ${esc(cl.refNome)}${s ? ` · ${esc(s.nome)}` : ''}` : `Todos da ${esc(cl.refNome)} incluídos`}`;
}
async function incluirTodosMed() {
  const cl = ctxMed(), fs = faltantesMed(cl);
  if (!fs.length) return;
  if (fs.length > 50 && !await confirmar({ titulo: `Incluir ${num(fs.length, 0)} exames?`, texto: `Todos os exames com preço na ${esc(cl.refNome)} entram na proposta. Depois é só tirar as linhas que não fazem parte.`, botao: 'Incluir', icone: 'fa-list-check' })) return;
  fs.forEach(e => { pm.itens[e.id] = {}; });
  pm.sujo = true; pm.filtro = 'todos';
  desenharTabelaMed();
  toast(`${num(fs.length, 0)} exame(s) incluído(s)`);
}

function buscarMed(q) {
  const el = document.getElementById('pm-sug'), cl = ctxMed();
  if (!el || !q.trim()) return fecharSugMed();
  const ini = normalizar(q.trim()), pri = e => normalizar(e.mn).startsWith(ini) ? 0 : 1;
  const todos = examesVisiveis().filter(e => e.ativo !== false && contem(e.mn + ' ' + e.descricao, q))
    .sort((a, b) => pri(a) - pri(b) || String(a.mn).localeCompare(String(b.mn), 'pt-BR'));
  const vis = todos.slice(0, 10);
  _pmSug = vis.map(e => e.id); _pmHi = 0;
  el.innerHTML = !vis.length ? `<div class="gx-sug-v"><i class="fa-solid fa-magnifying-glass"></i>Nenhum exame encontrado para <b>${esc(q)}</b></div>`
    : vis.map((e, i) => {
      const ja = e.id in pm.itens, ref = cl.ref(e.id);
      return `<button type="button" class="${i ? '' : 'hi'}" onmousedown="event.preventDefault();adicionarMed(_pmSug[${i}])" onmouseenter="marcarSugMed(${i})">
        <b>${esc(e.mn)}</b><span title="${esc(e.descricao)}">${esc(e.descricao)}</span><small class="${ja ? 'c' : ref != null ? 'g' : ''}"><i class="fa-solid ${ja ? 'fa-check' : ref != null ? 'fa-table-list' : 'fa-circle-plus'}"></i>${ja ? 'já na proposta' : ref != null ? fmt(ref) : 'sem preço'}</small></button>`;
    }).join('') + (todos.length > vis.length ? `<div class="gx-sug-v">+ ${todos.length - vis.length} exame(s): continue digitando para refinar</div>` : '');
  el.classList.add('open');
}
function fecharSugMed() { _pmSug = []; document.getElementById('pm-sug')?.classList.remove('open'); }
function marcarSugMed(i) {
  _pmHi = i;
  const bs = document.querySelectorAll('#pm-sug button');
  bs.forEach((b, j) => b.classList.toggle('hi', j === i));
  bs[i]?.scrollIntoView({ block: 'nearest' });
}
function teclaBuscaMed(ev) {
  if (ev.key === 'Escape' && _pmSug.length) { ev.stopPropagation(); return fecharSugMed(); }
  if (!_pmSug.length) return;
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); marcarSugMed(Math.max(0, Math.min(_pmSug.length - 1, _pmHi + (ev.key === 'ArrowDown' ? 1 : -1)))); }
  else if (ev.key === 'Enter') { ev.preventDefault(); adicionarMed(_pmSug[_pmHi]); }
}
// Exame já na proposta: só leva até a linha dele
function adicionarMed(k) {
  const e = ESTADO.exames[k];
  if (!e) return;
  const ja = k in pm.itens;
  if (!ja) { pm.itens[k] = {}; pm.sujo = true; }
  const q = document.getElementById('pm-add');
  if (q) q.value = '';
  fecharSugMed();
  // limpa filtros que esconderiam o exame e vai à página dele
  if (pm.q || pm.filtro !== 'todos' || (valorPop('pop-pmsetor') && valorPop('pop-pmsetor') !== e.setorId)) { pm.q = ''; pm.filtro = 'todos'; definirPop('pop-pmsetor', ''); const f = document.getElementById('pm-q'); if (f) f.value = ''; }
  desenharTabelaMed();
  const i = _pmLinhas.findIndex(x => x.k === k);
  if (i >= 0 && Math.floor(i / SIM_POR_PAG) + 1 !== pm.pag) { pm.pag = Math.floor(i / SIM_POR_PAG) + 1; desenharTabelaMed(); }
  const tr = document.querySelector(`#pm-body tr[data-k="${CSS.escape(k)}"]`);
  tr?.scrollIntoView({ block: 'nearest' });
  tr?.classList.add('flash'); setTimeout(() => tr?.classList.remove('flash'), 900);
  q?.focus();
  if (ja) toast(`${e.mn} já está na proposta`);
}

// ── Ações em lote ─────────────────────────────────────────────
function volumeLoteMed() {
  const v = Math.round(numCampo('pm-vlote'));
  if (!(v >= 0)) return toast('Informe o volume', 'erro');
  _pmLinhas.forEach(x => { const it = pm.itens[x.k]; if (!it) return; if (v > 0) it.v = v; else delete it.v; });
  pm.sujo = true;
  desenharTabelaMed();
  toast(`${PMM().mes ? 'Volume' : 'Quantidade'} ${v}${PMM().mes} em ${_pmLinhas.length} exame(s)`);
}
async function zerarVolumesMed() {
  if (!await confirmar({ titulo: 'Zerar volumes?', texto: 'Os exames continuam na proposta, sem volume.', botao: 'Zerar', perigo: true })) return;
  Object.values(pm.itens).forEach(it => { delete it.v; });
  pm.sujo = true;
  desenharTabelaMed();
}
async function limparPrecosMed() {
  if (!await confirmar({ titulo: 'Desfazer preços digitados?', texto: 'Os exames voltam ao preço ao paciente escolhido.', botao: 'Desfazer', perigo: true })) return;
  Object.values(pm.itens).forEach(it => { delete it.p; });
  pm.sujo = true;
  desenharTabelaMed();
}
async function tirarSemVolumeMed() {
  const ks = Object.keys(pm.itens).filter(k => !(pm.itens[k].v > 0));
  if (!await confirmar({ titulo: `Tirar ${ks.length} exame(s) sem volume?`, texto: PMM().mes ? 'Ficam só os exames com expectativa de envio.' : 'Ficam só os exames com quantidade.', botao: 'Tirar', perigo: true })) return;
  ks.forEach(k => { delete pm.itens[k]; });
  pm.sujo = true;
  desenharTabelaMed();
}
async function tirarFiltradosMed() {
  const ks = _pmLinhas.map(x => x.k);
  if (!await confirmar({ titulo: `Tirar ${ks.length} exame(s) filtrado(s)?`, texto: 'Os exames que aparecem na lista com os filtros atuais saem da proposta.', botao: 'Tirar', perigo: true })) return;
  ks.forEach(k => { delete pm.itens[k]; });
  pm.sujo = true;
  desenharTabelaMed();
}
async function tirarTodosMed() {
  if (!await confirmar({ titulo: 'Tirar todos os exames?', texto: 'A proposta fica sem exames.', botao: 'Tirar', perigo: true })) return;
  pm.itens = {};
  pm.sujo = true;
  try { localStorage.removeItem(PMM().chave); } catch {}
  desenharTabelaMed();
}
function paginaMed(p) { pm.pag = p; desenharTabelaMed(); }
function ordenarMed(k) { pm.dir = pm.ordem === k ? -pm.dir : (['vol', 'receita', 'pd'].includes(k) ? -1 : 1); pm.ordem = k; desenharTabelaMed(); }

// ── Salvar, abrir, nova, exportar ─────────────────────────────
async function novaSimMed() {
  if (pm.sujo && !await confirmar({ titulo: 'Descartar a proposta atual?', texto: 'As alterações não salvas serão perdidas.', botao: 'Descartar', perigo: true })) return;
  Object.assign(pm, novoPm(pm.modo));
  try { localStorage.removeItem(PMM().chave); } catch {}
  desenharSimMed();
}

async function abrirSimMed(id) {
  const s = ESTADO.simulacoes[id];
  if (!s) return;
  if (pm.sujo && id !== pm.id && !await confirmar({ titulo: 'Abrir outra proposta?', texto: 'As alterações não salvas da atual serão perdidas.', botao: 'Abrir', perigo: true })) return;
  // ordem de inclusão guardada em "o" (o banco devolve as chaves em ordem alfabética)
  const itens = Object.entries(JSON.parse(JSON.stringify(s.itens || {}))).sort((a, b) => (a[1].o ?? 0) - (b[1].o ?? 0));
  Object.assign(pm, { id, nome: s.nome || '', medico: s.medico || '', crm: s.crm || '', tabelaId: s.tabelaId ?? '', base: s.base || 'desc', d: s.d ?? 10, pdf: s.pdf ? { ...s.pdf } : null,
    itens: Object.fromEntries(itens.map(([k, it]) => { delete it.o; return [k, it]; })), sujo: false, filtro: 'todos', q: '', pag: 1, ordem: '' });
  desenharSimMed();
}

async function salvarSimMed() {
  const cl = ctxMed(), r = resumoMed(cl, linhasMed(cl)), u = usuarioAtual();
  pm.nome = (valorCampo('pm-nome') || pm.nome).trim();
  if (!pm.nome) { document.getElementById('pm-nome')?.focus(); return toast('Dê um nome à proposta', 'erro'); }
  if (!Object.keys(pm.itens).length) return toast('Nada para salvar: adicione exames', 'erro');
  const id = pm.id || DB.novaChave('simulacoes'), antes = ESTADO.simulacoes[id];
  // "o" guarda a ordem e evita item vazio (o banco não grava objeto vazio)
  const itens = Object.fromEntries(Object.entries(pm.itens).map(([k, it], i) => [k, { ...it, o: i }]));
  const dados = { tipo: PMM().tipo, nome: pm.nome, medico: pm.medico.trim() || null, crm: pm.crm.trim() || null, tabelaId: pm.tabelaId || '', base: pm.base, d: pm.d, itens,
    pdf: pdfParaSalvar(pm.pdf, PDF_MODOS[pm.modo].modelo()),
    resumo: { n: r.n, vol: r.vol, receita: Math.round(r.receita * 100) / 100, margem: r.margem, viavel: r.viavel },
    autor: antes?.autor || u.nome, autorId: antes?.autorId || u.id, em: antes?.em || DB.agora(), atualizadoEm: DB.agora(), atualizadoPor: u.nome };
  await DB.gravar(`${CAMINHOS.simulacoes}/${id}`, dados);
  ESTADO.simulacoes[id] = { ...dados, em: antes?.em || Date.now(), atualizadoEm: Date.now() };
  pm.id = id; pm.sujo = false;
  registrar('simulador', `${PMM().reg} "${pm.nome}" salva (${r.n} exames, ${num(r.vol, 0)}${PMM().mes || ' exames'}, ${fmt(r.receita)}${PMM().mes})`);
  renderSimulador();
  toast('Proposta salva');
}

async function excluirSimMed() {
  const s = ESTADO.simulacoes[pm.id];
  if (!s || !await confirmar({ titulo: 'Excluir proposta?', texto: `"${esc(s.nome)}" será excluída.`, botao: 'Excluir', perigo: true })) return;
  await DB.remover(`${CAMINHOS.simulacoes}/${pm.id}`);
  delete ESTADO.simulacoes[pm.id];
  pm.id = null; pm.sujo = true;
  renderSimulador();
}

function exportarSimMed() {
  const cl = ctxMed(), ls = linhasMed(cl).filter(x => x.preco != null);
  if (!ls.length) return toast('Nenhum exame com preço para exportar', 'erro');
  ls.sort((a, b) => a.e.mn.localeCompare(b.e.mn, 'pt-BR', { sensitivity: 'base' }));
  const dec = v => v == null ? '' : String(Math.round(v * 100) / 100).replace('.', ',');
  const q = s => `"${String(s || '').replace(/"/g, '""')}"`;
  const s = resumoMed(cl, ls);
  const csv = [['Mnemônico', 'Exame', 'Prazo', cl.refNome, PMM().rotPreco, 'Desconto', PMM().rotVol, PMM().rotTot].join(';'),
    ...ls.map(x => [x.e.mn, q(x.e.descricao), q(textoPrazo(x.k)), dec(x.ref), dec(x.preco), x.desc != null ? pct(x.desc) : '', x.vol || '', x.vol ? dec(x.receita) : ''].join(';')),
    ['', q('Total'), '', '', '', s.desc != null ? pct(s.desc) : '', s.vol || '', s.vol ? dec(s.receita) : ''].join(';')].join('\r\n') + '\r\n';
  baixarArquivo(`${PMM().reg} - ${pm.nome || pm.medico || 'sem nome'}.csv`, new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
}
