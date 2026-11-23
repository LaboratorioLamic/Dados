// ═══════════════════════════════════════════════════════════════
// custos.js — Tela Custos: custos fixos (fase 1); reagentes e
// laboratórios de apoio chegam na fase 3 — COMERCIAL LAMIC
// ═══════════════════════════════════════════════════════════════

let custosAba = 'fixos';
SUBNAV_GANCHO.custos = p => { custosAba = p; renderCustos(); };

function renderCustos() {
  const el = document.getElementById('s-custos');
  const editar = pode('custos', 'editar'), criar = pode('custos', 'criar');
  const botao = !criar ? '' : custosAba === 'fixos' ? `<button class="btn pri" onclick="abrirCustoFixo()"><i class="fa-solid fa-plus"></i>Novo custo fixo</button>`
    : custosAba === 'reag' ? (reagVista === 'cq' ? `<button class="btn pri" onclick="abrirInsumoCq()"><i class="fa-solid fa-plus"></i>Novo calibrador / controle</button>`
      : `<button class="btn pri" onclick="abrirReagente()"><i class="fa-solid fa-plus"></i>Novo reagente</button>`) : '';
  el.innerHTML = `
    <div class="h-row"><div><h2>Custos</h2><p>Base do custo de cada exame. Alterações valem para todos os exames.</p></div>${botao}</div>
    <div class="subnav" data-grupo="custos">
      <button data-p="fixos" class="${custosAba === 'fixos' ? 'on' : ''}"><i class="fa-solid fa-hand-holding-medical"></i>Custos fixos</button>
      <button data-p="reag" class="${custosAba === 'reag' ? 'on' : ''}"><i class="fa-solid fa-vials"></i>Reagentes e insumos</button>
      <button data-p="apoio" class="${custosAba === 'apoio' ? 'on' : ''}"><i class="fa-solid fa-truck-medical"></i>Laboratórios de apoio</button>
    </div>
    <div class="pane ${custosAba === 'fixos' ? 'on' : ''}" id="custos-fixos">${custosAba === 'fixos' ? htmlCustosFixos(editar) : ''}</div>
    <div class="pane ${custosAba === 'reag' ? 'on' : ''}" id="custos-reag">${custosAba === 'reag' ? htmlReagentes() : ''}</div>
    <div class="pane ${custosAba === 'apoio' ? 'on' : ''}" id="custos-apoio">${custosAba === 'apoio' ? htmlApoios() : ''}</div>`;
  iniciarSubnav();
  if (custosAba === 'reag') desenharReagentes();
  if (custosAba === 'apoio') popsVinculos();
}

const custoPorExame = f => f.cobranca === 'rateado' ? f.valor / parametro('examesPorAtendimento') : f.valor;

function htmlCustosFixos(editar) {
  const fixos = lista(ESTADO.custosFixos, (a, b) => (a.ordem ?? 99) - (b.ordem ?? 99) || porNome(a, b));
  const soma = fs => fs.reduce((s, f) => s + (f.valor || 0), 0);
  const lin = soma(fixos.filter(f => f.cobranca !== 'rateado')), rat = soma(fixos.filter(f => f.cobranca === 'rateado'));
  const cond = fixos.filter(f => f.etapa).reduce((s, f) => s + custoPorExame(f), 0);
  const total = fixos.reduce((s, f) => s + custoPorExame(f), 0);
  const seg = (f, campo, opcoes) => `<div class="seg">${opcoes.map(([v, t, ic, dica]) => `<button class="${(f[campo] ?? null) === v ? 'on' : ''}" ${editar ? '' : 'disabled'} title="${dica}" onclick='salvarCustoFixo("${f.id}", {${campo}: ${JSON.stringify(v)}})'><i class="fa-solid ${ic}"></i>${t}</button>`).join('')}</div>`;
  return `
    <div class="kpis">
      <div class="card kpi"><div class="kpi-l"><span class="ic" style="background:var(--green-bg);color:var(--green)"><i class="fa-solid fa-equals"></i></span>Lineares</div><div class="kpi-v">${fmt(lin)}</div><div class="kpi-s">valor cheio em cada exame</div></div>
      <div class="card kpi"><div class="kpi-l"><span class="ic" style="background:var(--cyan-light);color:var(--cyan)"><i class="fa-solid fa-divide"></i></span>Rateados</div><div class="kpi-v">${fmt(rat)}</div><div class="kpi-s">${rat ? `${fmt(rat / parametro('examesPorAtendimento'))} por exame (÷ ${parametro('examesPorAtendimento')})` : 'nenhum custo rateado'}</div></div>
      <div class="card kpi"><div class="kpi-l"><span class="ic" style="background:var(--amber-bg);color:var(--amber)"><i class="fa-solid fa-route"></i></span>Dependem de etapa</div><div class="kpi-v">${fmt(cond)}</div><div class="kpi-s">coleta e triagem: só se o exame passa por elas</div></div>
      <div class="card kpi"><div class="kpi-l"><span class="ic" style="background:var(--gray-bg);color:var(--gray)"><i class="fa-solid fa-calculator"></i></span>Total por exame</div><div class="kpi-v">${fmt(total)}</div><div class="kpi-s">exame que passa por todas as etapas</div></div>
    </div>
    <div class="alert x"><i class="fa-solid fa-route"></i><div><b>Nem todo exame passa por coleta e triagem.</b> Cada setor define as etapas padrão e cada exame pode ajustar. Custos específicos (ex.: aplicação de vacina) serão lançados no próprio exame.</div></div>
    <div class="card"><div class="tbl-wrap"><table>
      <thead><tr><th>Custo</th><th>Cobrança</th><th>Aplica-se a</th><th class="num">Valor</th><th class="num">Por exame</th><th></th></tr></thead>
      <tbody>${fixos.map(f => `<tr>
        <td><div class="ucell"><span class="po-ic" style="--c:var(--text-secondary)"><i class="fa-solid ${f.icone || 'fa-coins'}"></i></span>${esc(f.nome)}</div></td>
        <td>${seg(f, 'cobranca', [['linear', 'Linear', 'fa-equals', 'Valor cheio em cada exame'], ['rateado', 'Rateado', 'fa-divide', 'Dividido pelos exames do atendimento']])}</td>
        <td>${seg(f, 'etapa', [[null, 'Todos', 'fa-check', 'Entra em todos os exames'], ['coleta', 'Coleta', 'fa-syringe', 'Só exames com coleta'], ['triagem', 'Triagem', 'fa-filter', 'Só exames com triagem']])}</td>
        <td class="num"><div class="price-in"><span>R$</span><input type="number" step="0.01" min="0" value="${Number(f.valor).toFixed(2)}" ${editar ? '' : 'disabled'} onchange="salvarValorFixo('${f.id}', this)"></div></td>
        <td class="num">${fmt(custoPorExame(f))}</td>
        <td class="acts">${editar ? `<button title="Editar" onclick="abrirCustoFixo('${f.id}')"><i class="fa-solid fa-pen"></i></button>` : ''}${pode('custos', 'excluir') ? `<button title="Excluir" onclick="excluirCustoFixo('${f.id}')"><i class="fa-solid fa-trash"></i></button>` : ''}</td>
      </tr>`).join('') || `<tr><td colspan="6">${vazio('fa-coins', 'Nenhum custo fixo cadastrado')}</td></tr>`}</tbody>
    </table></div></div>`;
}

async function salvarCustoFixo(id, dados, aviso = true) {
  const antes = ESTADO.custosFixos[id];
  await DB.mesclar(`${CAMINHOS.custosFixos}/${id}`, dados);
  registrar('custosFixos', `Custo fixo ${antes?.nome || ''} alterado`, { antes: antes || null, depois: dados });
  if (aviso) toast(`${antes?.nome || 'Custo'} atualizado`);
}

function salvarValorFixo(id, input) {
  const v = parseFloat(input.value);
  if (isNaN(v) || v < 0) { input.value = ESTADO.custosFixos[id].valor; return toast('Valor inválido', 'erro'); }
  salvarCustoFixo(id, { valor: Math.round(v * 100) / 100 });
}

// Gaveta de cadastro / edição
let _cfEd = null;
function abrirCustoFixo(id) {
  const f = id ? ESTADO.custosFixos[id] : null;
  _cfEd = { id: id || null, icone: f?.icone || 'fa-coins' };
  abrirGaveta({
    sobre: id ? 'Editar custo fixo' : 'Novo custo fixo',
    titulo: f ? f.nome : 'Cadastrar custo fixo',
    corpo: `<div class="form-col">
      ${campo('cf-nome', 'Nome', f?.nome || '', { tipo: 'text', ph: 'Ex.: Energia' })}
      ${campo('cf-valor', 'Valor', f?.valor ?? '', { pre: 'R$', passo: '0.01', ph: '0,00' })}
      <div class="field"><label>Cobrança</label><div class="opt-cards" id="cf-cob">
        ${[['linear', 'Linear', 'Valor cheio em cada exame', 'fa-equals'], ['rateado', 'Rateado', 'Dividido pelos exames do atendimento', 'fa-divide']].map(([v, t, d, ic]) =>
          `<button type="button" class="oc ${(f?.cobranca || 'linear') === v ? 'on' : ''}" data-v="${v}" onclick="marcarOc('cf-cob', this)"><span class="po-ic"><i class="fa-solid ${ic}"></i></span><span><b>${t}</b><small>${d}</small></span><i class="fa-solid fa-circle-check ck"></i></button>`).join('')}
      </div></div>
      <div class="field"><label>Aplica-se a</label><div class="opt-cards" id="cf-etapa">
        ${[['', 'Todos os exames', 'Sem condição', 'fa-check'], ['coleta', 'Só com coleta', 'Exames que passam pela coleta', 'fa-syringe'], ['triagem', 'Só com triagem', 'Exames que passam pela triagem', 'fa-filter']].map(([v, t, d, ic]) =>
          `<button type="button" class="oc ${(f?.etapa || '') === v ? 'on' : ''}" data-v="${v}" onclick="marcarOc('cf-etapa', this)"><span class="po-ic"><i class="fa-solid ${ic}"></i></span><span><b>${t}</b><small>${d}</small></span><i class="fa-solid fa-circle-check ck"></i></button>`).join('')}
      </div></div>
      <div class="field"><label>Ícone</label><div class="icon-grid pequeno">${ICONES_CUSTO.map(ic =>
        `<button type="button" class="ig ${_cfEd.icone === ic ? 'on' : ''}" style="--c:var(--cyan)" onclick="_cfEd.icone='${ic}';this.parentNode.querySelectorAll('.ig').forEach(x=>x.classList.toggle('on',x===this))"><i class="fa-solid ${ic}"></i></button>`).join('')}</div></div>
    </div>`,
    rodape: `<button class="btn" onclick="fecharGaveta()">Cancelar</button><button class="btn pri" onclick="gravarCustoFixo()"><i class="fa-solid fa-floppy-disk"></i>Salvar</button>`
  });
}

function marcarOc(grupoId, btn) {
  document.querySelectorAll(`#${grupoId} .oc`).forEach(x => x.classList.toggle('on', x === btn));
}
const ocValor = grupoId => document.querySelector(`#${grupoId} .oc.on`)?.dataset.v ?? '';

async function gravarCustoFixo() {
  const nome = valorCampo('cf-nome').trim(), valor = numCampo('cf-valor');
  if (!nome) return toast('Informe o nome', 'erro');
  if (isNaN(valor) || valor < 0) return toast('Informe um valor válido', 'erro');
  const dados = { nome, valor: Math.round(valor * 100) / 100, coluna: null,
    cobranca: ocValor('cf-cob') || 'linear', etapa: ocValor('cf-etapa') || null, icone: _cfEd.icone };
  if (_cfEd.id) await salvarCustoFixo(_cfEd.id, dados, false);
  else {
    dados.ordem = Object.keys(ESTADO.custosFixos).length + 1;
    await DB.gravar(`${CAMINHOS.custosFixos}/${DB.novaChave(CAMINHOS.custosFixos)}`, dados);
    registrar('custosFixos', `Custo fixo ${nome} criado`, { depois: dados });
  }
  fecharGaveta();
  toast(`Custo ${nome} salvo`);
}

async function excluirCustoFixo(id) {
  const f = ESTADO.custosFixos[id];
  const ok = await confirmar({ titulo: `Excluir ${f.nome}?`, texto: 'O custo deixa de entrar no preço de todos os exames.', botao: 'Excluir', perigo: true });
  if (!ok) return;
  await DB.remover(`${CAMINHOS.custosFixos}/${id}`);
  registrar('custosFixos', `Custo fixo ${f.nome} excluído`, { antes: f });
  toast(`${f.nome} excluído`);
}
