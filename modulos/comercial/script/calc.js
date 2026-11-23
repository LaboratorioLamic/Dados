// ═══════════════════════════════════════════════════════════════
// calc.js — Regras de cálculo de custo, margem e preço
// ═══════════════════════════════════════════════════════════════
//
// custoTotal = custoTeste + custos fixos aplicáveis + custos adicionais
// lucro      = preço − custoTotal − imposto        (imposto = preço × %)
// margem     = lucro ÷ preço
// sugerido   = ⌈ custoTotal ÷ (1 − imposto − margemAlvo) ⌉
// mínimo     = ⌈ custoTotal ÷ (1 − imposto − margemMínima) ⌉
// maquininha = projeção: lucro − preço × taxa (não entra no custo)

// Chave segura para o Realtime Database (mnemônicos podem ter "/" ou ".")
const chaveExame = mn => String(mn).trim().replace(/[.#$\[\]\/%]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());

const STATUS = {
  r: { nome: 'Abaixo do mínimo', icone: 'fa-circle-xmark',       cor: 'var(--red)' },
  a: { nome: 'Abaixo do alvo',   icone: 'fa-circle-exclamation', cor: 'var(--amber)' },
  g: { nome: 'Saudável',         icone: 'fa-circle-check',       cor: 'var(--green)' },
  x: { nome: 'Sem custo',        icone: 'fa-circle-question',    cor: 'var(--gray)' },
  p: { nome: 'Sem preço',        icone: 'fa-circle-minus',       cor: 'var(--gray)' }
};
const tagSt = (cls, icone, nome) => `<span class="st ${cls}" title="${nome}"><i class="fa-solid ${icone}"></i><span class="st-t">${nome}</span></span>`;
const tagStatus = s => tagSt(s, STATUS[s].icone, STATUS[s].nome);

// Preço abaixo de R$ 1,00 é simbólico (reanálise, cortesia…): fica fora das simulações
// e dos cálculos de variação e desconto médio
const PRECO_MIN_VARIACAO = 1;
const precoSimbolico = p => p != null && p < PRECO_MIN_VARIACAO;

// Etapas: ajuste do exame > padrão do setor > passa por todas
function etapasExame(e) {
  const s = ESTADO.setores[e.setorId];
  return {
    coleta:  e.etapas?.coleta  ?? s?.etapas?.coleta  ?? true,
    triagem: e.etapas?.triagem ?? s?.etapas?.triagem ?? true
  };
}

// perfil (opcional, da tabela de preço): { idCustoFixo: false (não cobra) | valor próprio }
// sem: nomes de custos fixos que não entram (normalizados, ex.: ['coleta']) — propostas do simulador
// e.fixosAjuste (opcional, do exame): { idCustoFixo: false (inativo no exame) | valor próprio }; o valor próprio vale sobre o do perfil
function fixosExame(e, perfil = null, sem = null) {
  const et = etapasExame(e), n = Math.max(1, parametro('examesPorAtendimento'));
  return lista(ESTADO.custosFixos, (a, b) => (a.ordem ?? 99) - (b.ordem ?? 99))
    .map(f => {
      const p = perfil?.[f.id], aj = e.fixosAjuste?.[f.id], valor = typeof aj === 'number' ? aj : typeof p === 'number' ? p : f.valor;
      return { ...f, valor, foraPerfil: p === false, inativoExame: aj === false, aplica: p !== false && aj !== false && (!f.etapa || et[f.etapa] !== false) && !sem?.includes(normalizar(f.nome)), v: f.cobranca === 'rateado' ? valor / n : valor };
    });
}

// ── Custo do teste ────────────────────────────────────────────
// Prioridade: vínculo com tabela do apoio > reagente > valor manual
const hojeISO = () => new Date().toISOString().slice(0, 10);
// "24/09/2026" ou "2026-09-24" → "2026-09-24"
const dataISO = s => { s = String(s || '').trim(); const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : s.slice(0, 10); };
const dataBR = iso => iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : (iso || '—');

// Preço vigente de um item da tabela do apoio (vigência futura → vale o anterior)
function precoApoio(apoioId, chave) {
  const p = ESTADO.apoios?.[apoioId]?.precos?.[chave];
  // item inativo (saiu da tabela importada ou foi inativado à mão) não custeia
  if (!p || p.inativo) return null;
  if (p.vigencia && p.vigencia > hojeISO() && p.anterior) return { ...p, valor: p.anterior.preco, vigencia: p.anterior.vigencia, agendado: { preco: p.preco, vigencia: p.vigencia } };
  return { ...p, valor: p.preco };
}

// Reagente com calibrador e controle (insumosCQ). Num kit em uso por diasKit dias:
//   calibrações = ⌈diasKit ÷ calDias⌉ (mín. 1; sem intervalo: 1 por kit)   corridas de CQ = ⌈diasKit × ctrlCorridasDia⌉
//   testes úteis = testes × (1 − perdas) − calibrações × pontos − corridas × níveis − outros consumos
//   material     = calibrações × custo/calibração + corridas × custo/corrida
//                  (custo por uso = preço ÷ rendimento ÷ reagentes que compartilham o insumo)
//   custo/teste  = (preço do kit + material) ÷ testes úteis
const _usoInsumos = new WeakMap();
function reagentesDoInsumo() {
  let m = _usoInsumos.get(ESTADO.reagentes);
  if (!m) {
    m = {};
    Object.entries(ESTADO.reagentes || {}).forEach(([id, r]) => [r.calId, r.ctrlId].forEach(i => { if (i) (m[i] ||= new Set()).add(id); }));
    _usoInsumos.set(ESTADO.reagentes, m);
  }
  return m;
}
// rid: reagente em cálculo (conta uma vez, mesmo que ainda não esteja gravado com o vínculo)
const compartilhamInsumo = (insId, rid) => { const s = reagentesDoInsumo()[insId]; return (s ? s.size - (rid && s.has(rid) ? 1 : 0) : 0) + 1; };
const custoUsoInsumo = (i, insId, rid) => i && i.preco > 0 && i.rende > 0 ? i.preco / i.rende / compartilhamInsumo(insId, rid) : 0;

function detalheReagente(r, rid = r.id) {
  const ins = ESTADO.insumosCQ || {}, cal = r.calId ? ins[r.calId] : null, ctrl = r.ctrlId ? ins[r.ctrlId] : null, dias = r.diasKit || 0;
  const nCal = cal ? (r.calDias > 0 && dias > 0 ? Math.max(1, Math.ceil(dias / r.calDias - 1e-9)) : 1) : 0;
  const nCq = ctrl ? Math.ceil(dias * (r.ctrlCorridasDia || 0) - 1e-9) : 0;
  const pontos = r.calPontos || cal?.niveis || 1, niveis = r.ctrlNiveis || ctrl?.niveis || 1;
  const tCal = nCal * pontos, tCq = nCq * niveis;
  const uCal = custoUsoInsumo(cal, r.calId, rid), uCq = custoUsoInsumo(ctrl, r.ctrlId, rid);
  const mCal = nCal * uCal, mCq = nCq * uCq;
  const base = (r.testesPorKit || 0) * (1 - (r.perdas || 0) / 100) - (r.controles || 0);
  const uteis = base - tCal - tCq, kit = r.precoKit || 0;
  const custo = uteis > 0 ? (kit + mCal + mCq) / uteis : null;
  const semCq = base > 0 ? kit / base : null;
  return { cal, ctrl, dias, nCal, nCq, pontos, niveis, tCal, tCq, uCal, uCq, mCal, mCq, base, uteis, custo,
    pesoCq: custo && semCq != null && (nCal || nCq) ? 1 - semCq / custo : null };
}
const custoPorTeste = (r, rid) => detalheReagente(r, rid).custo;

function custoTesteExame(e) {
  if (e.vinculoApoio) {
    const p = precoApoio(e.vinculoApoio.apoioId, e.vinculoApoio.chave);
    if (p) return { valor: p.valor, origem: 'apoio', ref: p };
  }
  if (e.reagenteId && ESTADO.reagentes[e.reagenteId]) {
    const r = ESTADO.reagentes[e.reagenteId], v = custoPorTeste(r, e.reagenteId);
    if (v != null) return { valor: v * (e.qtdReagente || 1), origem: 'reagente', ref: r };
  }
  return e.custoTeste != null ? { valor: e.custoTeste, origem: e.custoOrigem || 'manual' } : null;
}
// Pardini: negociado = vinculado à tabela 4114; demais apoios: marcação manual
const negociadoExame = e => e.vinculoApoio ? true : !!e.negociado;

const extrasExame = e => (Array.isArray(e.extras) ? e.extras : Object.values(e.extras || {})).filter(x => x && x.valor > 0);
const alvoExame = e => ESTADO.setores[e.setorId]?.margemAlvo ?? parametro('margemAlvo');

// ── Regras por faixa de custo total ───────────────────────────
// Piso de margem, desconto de referência e sugestão de margem são um valor único ou progressivos:
//   faixas/{campo} = [{ ate: 100, v: .20 }, { ate: 500, v: .15 }, { v: .10 }]
// (a primeira começa em 0; a última, sem "ate", vale para todo custo acima do limite anterior).
// tab = tabela de preço; sem tabela vale a configuração própria da Particular (config/particular).
const PADRAO_REGRA = { piso: () => parametro('margemMinima'), descontoRef: () => 0, descontoMax: () => null, margemSugerida: () => null };
const faixasDe = (o, campo) => { const f = o?.faixas?.[campo]; return f ? Object.values(f).filter(Boolean) : []; };
function regraTab(tab, campo, custo = null) {
  const o = tab || ESTADO.particular || {}, padrao = o[campo] ?? PADRAO_REGRA[campo]();
  const fx = faixasDe(o, campo);
  if (!fx.length || custo == null) return padrao;
  return (fx.find(f => f.ate == null || custo <= f.ate) || fx[fx.length - 1]).v ?? padrao;
}
// "20%" ou, com faixas, "10% a 20% progressivo"
function textoRegra(tab, campo, casas = 0) {
  const fx = faixasDe(tab || ESTADO.particular, campo).map(f => f.v).filter(v => v != null), v = regraTab(tab, campo);
  if (fx.length > 1) { const a = Math.min(...fx), b = Math.max(...fx); return a === b ? pct(a, casas) : `${pct(a, casas)} a ${pct(b, casas)} progressivo`; }
  return v != null ? pct(v, casas) : '—';
}
// Margem alvo da Particular: setor com alvo próprio > configuração da Particular > parâmetro geral
const textoAlvoParticular = () => regraTab(null, 'margemSugerida') != null ? textoRegra(null, 'margemSugerida', 1) : pct(parametro('margemAlvo'));

// Preço que atinge a margem m, em múltiplos de "passo": arredonda para cima; com tolerância (Particular),
// arredonda para baixo quando o valor de baixo ainda fica dentro dela (margem ≥ m − tolerância)
function precoAlvo(custo, m, passo = 1, tol = ESTADO.particular?.tolerancia || 0) {
  const div = 1 - parametro('imposto') - m;
  if (custo == null || m == null || div <= 0) return null;
  const exato = custo / div, baixo = Math.floor(exato / passo + 1e-9) * passo;
  if (tol > 0 && baixo > 0 && 1 - parametro('imposto') - custo / baixo >= m - tol - 1e-9) return baixo;
  return Math.ceil(exato / passo - 1e-9) * passo;
}

// tab (opcional): tabela de preço → usa o perfil de custo e as regras de margem dela
// sem (opcional): custos fixos fora da conta (ver fixosExame)
function calcular(e, preco = e.precoPraticado, tab = null, sem = null) {
  const fx = fixosExame(e, tab?.perfil, sem), extras = extrasExame(e);
  const fixo = fx.filter(f => f.aplica).reduce((s, f) => s + f.v, 0);
  const somaExtras = extras.reduce((s, x) => s + x.valor, 0);
  const imp = parametro('imposto'), ct = custoTesteExame(e), custo = ct ? ct.valor + fixo + somaExtras : null;
  const min = regraTab(tab, 'piso', custo);
  const alvo = tab ? alvoExame(e) : ESTADO.setores[e.setorId]?.margemAlvo ?? regraTab(null, 'margemSugerida', custo) ?? parametro('margemAlvo');
  // min, descRef, descMax e margemSug: regras da tabela já resolvidas para a faixa de custo deste exame
  // descTol: tolerância de desconto da tabela (pontos acima do de referência e do máximo que não geram alerta)
  // margTol: tolerância de margem da tabela (pontos abaixo da sugestão de margem ainda aceitos no preço sugerido)
  const r = { fx, extras, fixo, somaExtras, alvo, min, descRef: regraTab(tab, 'descontoRef', custo), descMax: tab ? regraTab(tab, 'descontoMax', custo) : null, descTol: tab?.toleranciaDesc || 0, margTol: tab?.toleranciaMargem || 0, margemSug: regraTab(tab, 'margemSugerida', custo),
    preco: preco || null, teste: ct, semCusto: !ct };
  if (r.semCusto) { r.status = 'x'; return r; }
  r.custo = custo;
  r.sugerido = tab ? (1 - imp - alvo > 0 ? Math.ceil(r.custo / (1 - imp - alvo)) : null) : precoAlvo(r.custo, alvo);
  r.minimo = 1 - imp - min > 0 ? Math.ceil(r.custo / (1 - imp - min)) : null;
  if (!preco) { r.status = 'p'; return r; }
  r.imposto = preco * imp;
  r.lucro = preco - r.custo - r.imposto;
  r.margem = r.lucro / preco;
  r.taxaCartao = preco * parametro('taxaMaquininha');
  r.lucroCartao = r.lucro - r.taxaCartao;
  r.margemCartao = r.lucroCartao / preco;
  // Tabelas de preço só têm piso: abaixo dele ou OK.
  // Particular: margem até "tolerância" pontos abaixo do alvo ainda conta como no alvo
  r.status = r.margem < min ? 'r' : tab || r.margem >= alvo - (ESTADO.particular?.tolerancia || 0) - 1e-9 ? 'g' : 'a';
  return r;
}

// Composição do custo total (dica ao passar o mouse e célula das listas)
function composicaoCusto(c) {
  if (c.semCusto) return '';
  const partes = [`Teste ${fmt(c.teste.valor)}`, ...c.fx.filter(f => f.aplica).map(f => `${f.nome} ${fmt(f.v)}`), ...c.extras.map(x => `${x.nome} ${fmt(x.valor)}`)];
  return `${partes.join(' + ')} = ${fmt(c.custo)}`;
}
const celulaCusto = c => c.semCusto ? '—'
  : `<span title="${esc(composicaoCusto(c))}">${fmt(c.custo)}</span><div class="sub-num">teste ${fmt(c.teste.valor)}</div>`;

// Valor publicado × sistema do laboratório: Particular (precoSistema) e tabelas com preços do sistema importados.
// Só compara tabelas que têm "sistema" (sem importação não há o que comparar).
const sistemaSuportado = cx => !!cx && (cx.base || (cx.tabela && !!cx.tab?.sistema));
function divergenciasSistema(k) {
  const e = ESTADO.exames[k], r = [];
  if (!e || e.ativo === false) return r;
  const dif = (a, b) => a == null || b == null ? a !== b : Math.abs(a - b) > 0.004;
  if (e.precoPraticado && e.precoSistema != null && dif(e.precoPraticado, e.precoSistema)) r.push({ alvo: 'particular', nome: 'Particular', salvo: e.precoPraticado, sist: e.precoSistema });
  Object.entries(ESTADO.tabelas || {}).forEach(([id, t]) => {
    if (!t.sistema) return;
    const salvo = t.precos?.[k] ?? null, sist = t.sistema[k] ?? null;
    if (dif(salvo, sist)) r.push({ alvo: id, nome: t.nome, salvo, sist });
  });
  return r;
}
const valorDesatualizado = k => divergenciasSistema(k).length > 0;
// Caminho do preço do sistema de um exame num alvo
const caminhoSistema = (alvo, k) => alvo === 'particular' ? `${CAMINHOS.exames}/${k}/precoSistema` : `${CAMINHOS.tabelas}/${alvo}/sistema/${k}`;

// Pendências de um exame (usadas na tela Pendências e nos ícones da lista)
const PENDENCIAS = {
  custo:  { nome: 'Sem custo',           icone: 'fa-circle-question',          desc: 'Sem custo do teste: margem desconhecida.' },
  setor:  { nome: 'Sem setor',           icone: 'fa-tags',                     desc: 'Exame sem setor definido.' },
  preco:  { nome: 'Sem preço',           icone: 'fa-circle-minus',             desc: 'Exame sem preço praticado.' },
  sist:   { nome: 'Fora do sistema',     icone: 'fa-plug-circle-xmark',        desc: 'Mnemônico não encontrado no sistema do laboratório, ou não efetuado pela tabela Particular (efetua = N no Unilab).' },
  div:    { nome: 'Divergência de preço', icone: 'fa-code-compare',            desc: 'Preço praticado diferente do cadastrado no sistema do laboratório.' },
  hier:   { nome: 'Quebra hierarquia',   icone: 'fa-stairs',                   desc: 'Preço de uma tabela acima de outra que deveria ser maior (Particular ≥ Cartões ≥ … ; tabelas fora da hierarquia ≤ Particular). Ajuste em Tabelas de preço → Hierarquia.' },
  min:    { nome: 'Abaixo do mínimo',    icone: 'fa-circle-xmark',             desc: 'Margem abaixo da mínima: revise preço ou custo.' }
};
function pendenciasExame(e, c = calcular(e)) {
  const p = [];
  if (e.ativo === false) return p;
  if (c.semCusto) p.push('custo');
  if (!e.setorId || !ESTADO.setores[e.setorId]) p.push('setor');
  if (!e.precoPraticado) p.push('preco');
  if (e.foraDoSistema || e.inativoNoSistema) p.push('sist');
  if (e.precoSistema != null && e.precoPraticado && Math.abs(e.precoSistema - e.precoPraticado) > 0.004) p.push('div');
  if (e.id && quebrasHierarquia(e.id).length) p.push('hier');
  if (c.status === 'r') p.push('min');
  return p;
}

// Setores que o usuário atual pode ver ('todos' ou lista de ids)
function exameVisivel(e) {
  const u = usuarioAtual();
  if (!u || u.admin || u.setores === 'todos' || !Array.isArray(u.setores)) return true;
  return u.setores.includes(e.setorId);
}
const examesVisiveis = () => lista(ESTADO.exames).filter(exameVisivel);
