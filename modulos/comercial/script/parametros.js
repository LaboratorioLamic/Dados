// ═══════════════════════════════════════════════════════════════
// parametros.js — Parâmetros de cálculo — COMERCIAL LAMIC
// ═══════════════════════════════════════════════════════════════

const CAMPOS_PARAM = [
  { id: 'imposto',              rotulo: 'Imposto sobre faturamento', icone: 'fa-landmark',     suf: '%', dica: '% do preço (Simples/ISS)' },
  { id: 'taxaMaquininha',       rotulo: 'Taxa da maquininha',        icone: 'fa-credit-card',  suf: '%', dica: 'só projeção: não entra no custo' },
  { id: 'examesPorAtendimento', rotulo: 'Exames por atendimento',    icone: 'fa-divide',       suf: 'exames', dica: 'média; divide os custos fixos rateados' }
];
// Margem mínima e margem alvo não ficam aqui: cada tabela tem as suas em "Configurar" (a Particular, em
// "Configurar Particular"). Os valores já gravados em parametros seguem como padrão de quem não configurou.
const ehPct = id => id !== 'examesPorAtendimento';

function renderParametros() {
  const editar = pode('params', 'editar');
  painelConfig().innerHTML = `<div class="card">
    <div class="sec-card-h"><span class="tc-ic" style="--c:var(--cyan)"><i class="fa-solid fa-sliders"></i></span><div><h3>Parâmetros de cálculo</h3><div class="sub">Valem para todos os exames. Margem mínima e margem alvo são configuradas em cada tabela de preço.</div></div></div>
    <div class="fgrid">${CAMPOS_PARAM.map(c => campo('pf-' + c.id, c.rotulo, ehPct(c.id) ? +(parametro(c.id) * 100).toFixed(2) : parametro(c.id),
      { suf: c.suf, icone: c.icone, dica: c.dica, aoMudar: 'previaParametros()', desab: !editar, passo: ehPct(c.id) ? '0.01' : '0.1' })).join('')}</div>
    <div style="padding:0 18px 18px"><div class="alert x" id="params-previa" style="margin:0"></div></div>
    ${editar ? `<div class="wz-f"><span class="muted" style="font-size:12px"><i class="fa-solid fa-clock-rotate-left"></i> Toda alteração fica registrada no histórico</span>
      <div style="display:flex;gap:8px"><button class="btn" onclick="renderParametros()">Descartar</button><button class="btn pri" onclick="salvarParametros()"><i class="fa-solid fa-floppy-disk"></i>Salvar parâmetros</button></div></div>` : ''}
  </div>
  <div class="card" style="margin-top:14px">
    <div class="sec-card-h"><span class="tc-ic" style="--c:var(--cyan)"><i class="fa-solid fa-wand-magic-sparkles"></i></span><div><h3>Prompt da instrução do exame</h3><div class="sub">Texto copiado pelo botão "Copiar prompt" no cadastro do exame.</div></div></div>
    <div style="padding:0 18px 18px"><textarea id="pf-prompt" class="txt-grande" style="min-height:320px;width:100%" ${editar ? '' : 'disabled'}>${esc(promptInstrucao())}</textarea></div>
    ${editar ? `<div class="wz-f"><button class="btn" onclick="document.getElementById('pf-prompt').value=PADRAO_PROMPT_INSTRUCAO">Restaurar padrão</button>
      <div style="display:flex;gap:8px"><button class="btn" onclick="renderParametros()">Descartar</button><button class="btn pri" onclick="salvarPromptInstrucao()"><i class="fa-solid fa-floppy-disk"></i>Salvar prompt</button></div></div>` : ''}
  </div>`;
  previaParametros();
}

function lerParametros() {
  const p = {};
  for (const c of CAMPOS_PARAM) {
    const v = numCampo('pf-' + c.id);
    if (isNaN(v) || v < 0) return null;
    p[c.id] = ehPct(c.id) ? Math.round(v * 100) / 10000 : v;
  }
  return p;
}

// Exemplo do efeito dos parâmetros em um exame de custo conhecido
function previaParametros() {
  const p = lerParametros(), el = document.getElementById('params-previa');
  if (!p) { el.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i><div>Valores inválidos.</div>'; return; }
  const soma = lista(ESTADO.custosFixos).reduce((s, f) => s + (f.cobranca === 'rateado' ? f.valor / Math.max(1, p.examesPorAtendimento) : f.valor), 0);
  const custoTeste = 8.51, custo = custoTeste + soma;              // ex.: E1 (ImmunoCAP)
  // margens da Particular (configuração dela ou o padrão)
  const alvo = regraTab(null, 'margemSugerida', custo) ?? parametro('margemAlvo'), piso = regraTab(null, 'piso', custo);
  const div = 1 - p.imposto - alvo, divMin = 1 - p.imposto - piso;
  const sug = div > 0 ? Math.ceil(custo / div) : null, min = divMin > 0 ? Math.ceil(custo / divMin) : null;
  el.innerHTML = `<i class="fa-solid fa-calculator"></i><div><b>Exemplo:</b> exame com custo do teste ${fmt(custoTeste)} + custos fixos ${fmt(soma)} = ${fmt(custo)} →
    na Particular, preço sugerido <b>${sug ? fmt(sug) : 'impossível (imposto + alvo ≥ 100%)'}</b> (alvo ${pct(alvo, 0)}) · mínimo viável <b>${min ? fmt(min) : '—'}</b> (${pct(piso, 0)})
    · na maquininha o lucro cai ${pct(p.taxaMaquininha, 2)} do preço.</div>`;
}

async function salvarParametros() {
  const p = lerParametros();
  if (!p) return toast('Corrija os valores inválidos', 'erro');
  if (p.imposto + (regraTab(null, 'margemSugerida') ?? parametro('margemAlvo')) >= 1) return toast('Imposto + margem alvo da Particular precisa ser menor que 100%', 'erro');
  if (p.examesPorAtendimento < 1) return toast('Exames por atendimento precisa ser ao menos 1', 'erro');
  const antes = { ...ESTADO.parametros };
  const mudou = CAMPOS_PARAM.filter(c => antes[c.id] !== p[c.id]);
  if (!mudou.length) return toast('Nenhuma alteração', 'aviso');
  const ok = await confirmar({ titulo: 'Salvar parâmetros?', texto: `Alterações: ${mudou.map(c => c.rotulo.toLowerCase()).join(', ')}. O cálculo de todos os exames muda.`, botao: 'Salvar' });
  if (!ok) return;
  // mescla: preserva as margens padrão, que não são mais editadas aqui
  await DB.mesclar(CAMINHOS.parametros, p);
  registrar('parametros', 'Parâmetros de cálculo alterados', { antes, depois: { ...antes, ...p } });
  toast('Parâmetros salvos');
}

// Prompt de IA da instrução do exame
const promptInstrucao = () => ESTADO.parametros?.promptInstrucao || PADRAO_PROMPT_INSTRUCAO;
async function salvarPromptInstrucao() {
  const v = valorCampo('pf-prompt').trim();
  if (!v) return toast('O prompt não pode ficar vazio', 'erro');
  if (v === promptInstrucao()) return toast('Nenhuma alteração', 'aviso');
  await DB.mesclar(CAMINHOS.parametros, { promptInstrucao: v === PADRAO_PROMPT_INSTRUCAO ? null : v });
  registrar('parametros', 'Prompt da instrução do exame alterado');
  toast('Prompt salvo');
}
async function copiarPromptInstrucao() {
  const t = promptInstrucao();
  try { await navigator.clipboard.writeText(t); }
  catch {
    const a = Object.assign(document.createElement('textarea'), { value: t });
    document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove();
  }
  toast('Prompt copiado');
}
