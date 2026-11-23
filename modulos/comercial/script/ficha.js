// ═══════════════════════════════════════════════════════════════
// ficha.js — Ficha do exame (gaveta): composição do preço, custos,
// etapas, custos adicionais, preço praticado e histórico
// ═══════════════════════════════════════════════════════════════
//
// A ficha trabalha sobre uma cópia (_fx). Nada é gravado até "Salvar".
// Seções marcadas como dinâmicas são redesenhadas a cada alteração;
// os campos digitáveis ficam em seções estáticas para não perder o foco.

let _fx = null, _fxOrig = null, _fxId = null;
let _fxAba = 'valores', _fxTab = {};         // _fxTab: idTabela → preço editado (null = retirar)

const ABAS_FICHA = [
  ['valores', 'Valores', 'fa-tag'],
  ['custos', 'Custos', 'fa-calculator'],
  ['controles', 'Controles', 'fa-sliders'],
  ['instrucoes', 'Instruções', 'fa-book-medical'],
  ['historico', 'Histórico', 'fa-clock-rotate-left']
];

function abrirFicha(id, aba = 'valores') {
  const e = ESTADO.exames[id];
  if (!e) return;
  _fxId = id; _fxFonte = null; _fxNovoItem = false; _fxEditPreco = false; _fxFixoEd = null; _fxAba = aba; _fxTab = {}; _fxRasc = {};
  _fxOrig = JSON.parse(JSON.stringify(e));
  _fx = JSON.parse(JSON.stringify(e));
  _fx.extras = extrasExame(_fx).map(x => ({ ...x }));
  _fx.justificativa = '';
  const editar = pode('exames', 'editar');
  const pane = (a, html) => `<div class="fx-pane ${_fxAba === a ? 'on' : ''}" data-a="${a}">${html}</div>`;
  abrirGaveta({
    sobre: e.mn, titulo: e.descricao || '(sem descrição)', meta: metaFicha(),
    corpo: `
      <div class="seg set-abas fx-abas" id="fx-abas"></div>
      ${pane('valores', `
        <div id="fx-alertas"></div>
        <div id="fx-pend"></div>
        <div id="fx-rasc"></div>
        <div class="sec-t"><i class="fa-solid fa-user"></i>Particular · preço praticado</div>
        <div class="prices"><div id="fx-sug"></div>
          <div class="pbox ${editar ? 'edit' : ''}"><div class="l"><i class="fa-solid fa-pen"></i>Praticado</div>
            <input id="fx-preco" type="text" inputmode="numeric" autocomplete="off" value="${moedaCampo(e.precoPraticado)}" ${editar ? '' : 'disabled'} oninput="mascaraMoeda(this);_fx.precoPraticado=lerMoeda(this.value)||null;atualizarFicha()" onfocus="this.select()">
            <div class="m" id="fx-st"></div><div class="delta" id="fx-preco-d"></div></div></div>
        <div id="fx-sist"></div>
        <div id="fx-comp" style="margin-top:12px"></div>
        ${pode('tabelas') ? `<div class="sec-t"><i class="fa-solid fa-table-list"></i>Outras tabelas de preço</div><div id="fx-tabs"></div>` : ''}
        <div id="fx-hier"></div>
        <div class="just" id="fx-just-w"><label for="fx-just">Justificativa da alteração de preço <span class="muted">(opcional)</span></label>
          <textarea id="fx-just" ${editar || pode('tabelas', 'editar') ? '' : 'disabled'} placeholder="Motivo: reajuste, negociação, concorrência…" oninput="_fx.justificativa=this.value"></textarea></div>`)}
      ${pane('custos', `
        <div class="sec-t"><i class="fa-solid fa-vials"></i>Custo do teste</div><div id="fx-custo"></div>
        <div class="sec-t"><i class="fa-solid fa-calculator"></i>Cascata de custos</div><div id="fx-casc"></div>
        <div class="sec-t"><i class="fa-solid fa-hand-holding-dollar"></i>Custos adicionais</div><div id="fx-extras"></div>
        <div class="sec-t"><i class="fa-solid fa-route"></i>Etapas do atendimento</div><div id="fx-etapas"></div>`)}
      ${pane('controles', `<div class="sec-t"><i class="fa-solid fa-sliders"></i>Controles</div><div id="fx-ctrl"></div>`)}
      ${pane('instrucoes', pode('instrucoes') ? `<div class="sec-t"><i class="fa-solid fa-book-medical"></i>Catálogo e instruções</div><div id="fx-cat"><div class="muted" style="font-size:12px"><i class="fa-solid fa-circle-notch fa-spin"></i> carregando…</div></div>`
        : vazio('fa-lock', 'Seu grupo não tem acesso às instruções'))}
      ${pane('historico', `<div class="sec-t"><i class="fa-solid fa-clock-rotate-left"></i>Histórico</div><div id="fx-hist"><div class="muted" style="font-size:12px"><i class="fa-solid fa-circle-notch fa-spin"></i> carregando…</div></div>`)}`,
    rodape: '<div id="fx-rodape" style="display:contents"></div>'
  });
  desenharCustoTeste(); desenharExtras(); desenharEtapas(); desenharControles();
  if (pode('tabelas')) desenharTabelasFicha(id);
  desenharPendentesFicha(id);
  atualizarFicha();
  carregarHistoricoExame(id);
  if (pode('instrucoes')) desenharCatalogoFicha(id);
  // preço praticado já em proposta pendente: travado (a proposta aparece no aviso acima, com o link)
  const pp = propPendente('particular', id), ip = document.getElementById('fx-preco');
  if (pp && ip) { ip.disabled = true; ip.title = 'Em proposta aguardando aprovação: altere na proposta'; }
  carregarRascFicha(id);
}

// Rascunho do usuário para este exame (Particular e tabelas): a ficha abre já com esses valores.
// _fxRasc: alvo → valor que estava no rascunho ao abrir (null = retirar)
let _fxRasc = {};
async function carregarRascFicha(id) {
  if (!usuarioAtual() || !(pode('exames', 'editar') || pode('tabelas', 'editar'))) return;
  const alvos = ['particular', ...(pode('tabelas') ? tabelasLista(false).map(t => t.id) : [])];
  await Promise.all(alvos.map(a => carregarRascunho(a)));
  // ficha trocada, fechada ou já editada enquanto carregava: não mexe
  if (_fxId !== id || !document.getElementById('fx-rodape') || mudancasPrecoFicha().length) return;
  alvos.forEach(a => { if (id in rasc(a) && !propPendente(a, id)) _fxRasc[a] = rasc(a)[id]; });
  const n = Object.keys(_fxRasc).length;
  if (!n) return;
  Object.entries(_fxRasc).forEach(([a, v]) => {
    if (a !== 'particular') { _fxTab[a] = v; return; }
    _fx.precoPraticado = v;
    document.getElementById('fx-preco').value = moedaCampo(v);
  });
  document.getElementById('fx-rasc').innerHTML = `<div class="alert x"><i class="fa-solid fa-pen-to-square"></i><div><b>${n} valor(es) do seu rascunho</b> nesta ficha · ainda não enviados para aprovação.</div></div>`;
  if (pode('tabelas')) desenharTabelasFicha(id);
  atualizarFicha();
}
// Alvos que estavam no rascunho e voltaram ao valor publicado na ficha
const rascDesfeitosFicha = precos => Object.keys(_fxRasc).filter(a => !precos.some(m => m.alvo === a));
// Preços da ficha diferentes do que já está no rascunho
const rascMudouFicha = precos => rascDesfeitosFicha(precos).length > 0
  || precos.some(m => !(m.alvo in _fxRasc) || (m.para == null) !== (_fxRasc[m.alvo] == null) || (m.para != null && Math.abs(m.para - _fxRasc[m.alvo]) > 0.004));

function desenharAbasFicha() {
  const el = document.getElementById('fx-abas');
  if (!el) return;
  const mud = mudancasPrecoFicha().length, sc = calcular(_fx).semCusto;
  el.innerHTML = ABAS_FICHA.map(([k, t, ic]) => `<button class="${_fxAba === k ? 'on' : ''}" onclick="trocarAbaFicha('${k}')"><i class="fa-solid ${ic}"></i>${t}${
    k === 'valores' && mud ? `<span class="fx-n">${mud}</span>` : k === 'custos' && sc ? ' <i class="fa-solid fa-circle-exclamation fx-av" title="Sem custo do teste"></i>' : ''}</button>`).join('');
}
function trocarAbaFicha(a) {
  _fxAba = a;
  document.querySelectorAll('.fx-pane').forEach(p => p.classList.toggle('on', p.dataset.a === a));
  desenharAbasFicha();
}

// ── Valores: outras tabelas (editáveis) ───────────────────────
const precoTabFicha = id => id in _fxTab ? _fxTab[id] : ESTADO.tabelas[id]?.precos?.[_fxId] ?? null;

function desenharTabelasFicha(id) {
  const el = document.getElementById('fx-tabs'), e = ESTADO.exames[id];
  if (!el || !e) return;
  const labs = [...lista(ESTADO.laboratorios, porNome), ...lista(ESTADO.conveniados, porNome)].filter(l => l.precos?.[id] != null);
  const ts = tabelasLista(false), edit = pode('tabelas', 'editar');
  el.innerHTML = `<div class="casc fx-tabs">${ts.map(t => {
      const p = precoTabFicha(t.id), pend = propPendente(t.id, id);
      return `<div class="casc-r ${t.ativa === false ? 'skip' : ''}" data-t="${t.id}"><div class="lft"><i class="fa-solid ${t.icone}" style="color:${t.cor}"></i><div>${esc(t.nome)}
          <div class="s" id="fxt-s-${t.id}"></div></div></div>
        <div class="fx-tv"><div class="fx-tv-l"><div class="price-in" id="fxt-pi-${t.id}"><span>R$</span><input type="text" inputmode="numeric" autocomplete="off" data-t="${t.id}" value="${moedaCampo(p)}" placeholder="—" ${edit && !pend ? '' : 'disabled'} oninput="editarTabFicha(this)" onfocus="this.select()"></div>
          ${pend ? htmlTravaProposta(pend) : edit ? `<div class="acts"><button title="Margem alvo: ${pct(margemAlvoTab(t), 0)}${t.margemSugerida != null ? ' (sugestão de margem da tabela)' : ' (alvo do setor/geral: tabela sem sugestão de margem)'}" ${calcular(e, null, t).semCusto ? 'disabled' : ''} onclick="margemTabFicha('${t.id}')"><i class="fa-solid fa-bullseye"></i></button><button title="Particular − ${pct(calcular(e, null, t).descRef, 0)} (desconto de referência)" onclick="refTabFicha('${t.id}')"><i class="fa-solid fa-percent"></i></button><button title="Retirar da tabela" onclick="definirTabFicha('${t.id}', null, true)"><i class="fa-solid fa-xmark"></i></button></div>` : ''}</div>
          <div class="delta" id="fxt-d-${t.id}"></div></div></div>`;
    }).join('')}
    ${labs.length ? `<div class="casc-r"><div class="lft"><i class="fa-solid fa-building-user"></i><div>Valores diferenciados<div class="s">${labs.map(l => `${esc(l.nome)} ${fmt(l.precos[id])}`).join(' · ')}</div></div></div></div>` : ''}
    ${!ts.length && !labs.length ? '<div class="casc-r muted">Nenhuma tabela cadastrada</div>' : ''}</div>
    ${ts.length && edit ? '<div class="hint" style="margin-top:6px"><i class="fa-solid fa-circle-info"></i> Digite para alterar ou incluir o exame na tabela; vazio retira.</div>' : ''}`;
}

// v: número · null (retirar) · forcarCampo: reescreve o campo
function definirTabFicha(id, v, forcarCampo) {
  if (propPendente(id, _fxId)) return;
  const s = ESTADO.tabelas[id]?.precos?.[_fxId] ?? null;
  if ((v == null && s == null) || (v != null && s != null && Math.abs(v - s) < 0.005)) delete _fxTab[id];
  else _fxTab[id] = v == null ? null : Math.round(v * 100) / 100;
  const inp = document.querySelector(`#fx-tabs input[data-t="${id}"]`), p = precoTabFicha(id);
  if (inp && forcarCampo) inp.value = moedaCampo(p);
  atualizarFicha();
}
function editarTabFicha(inp) {
  mascaraMoeda(inp);
  const v = lerMoeda(inp.value);
  if (v != null && (isNaN(v) || v <= 0)) return;
  definirTabFicha(inp.dataset.t, v);
}
// Margem alvo da tabela: sugestão de margem configurada ou alvo do setor/geral
const margemAlvoTab = t => calcular(_fx, null, t).margemSug ?? alvoExame(_fx);
function margemTabFicha(id) {
  const t = ESTADO.tabelas[id], v = precoParaMargem(calcular(_fx, null, t), margemAlvoTab(t));
  if (v == null) return toast('Exame sem custo: margem desconhecida', 'erro');
  definirTabFicha(id, v, true);
}
function refTabFicha(id) {
  const part = _fx.precoPraticado, t = ESTADO.tabelas[id];
  if (!part) return toast('Exame sem preço praticado', 'erro');
  definirTabFicha(id, Math.round(part * (1 - calcular(_fx, null, t).descRef)), true);
}

// Valor atual no Unilab (sistema do laboratório) comparado ao publicado: verde se bate, âmbar se difere
function unilabFicha(sist, publicado, temSistema = true) {
  if (!temSistema) return '<span class="muted" title="Tabela sem preços do Unilab importados">Unilab —</span>';
  const ok = sist == null ? publicado == null : publicado != null && Math.abs(sist - publicado) < 0.005;
  return `<span style="color:${ok ? 'var(--green)' : 'var(--amber)'}" title="${ok ? 'Igual ao publicado' : 'Diferente do publicado: atualizar o Unilab'}"><i class="fa-solid ${ok ? 'fa-check' : 'fa-code-compare'}"></i> Unilab ${sist != null ? fmt(sist) : 'sem valor'}</span>`;
}

// Margem, piso, desconto e delta de cada tabela (sem recriar os campos)
function atualizarTabsFicha() {
  const part = _fx.precoPraticado;
  tabelasLista(false).forEach(t => {
    const sEl = document.getElementById('fxt-s-' + t.id);
    if (!sEl) return;
    const p = precoTabFicha(t.id), c = p != null ? calcular(_fx, p, t) : null, salvo = t.precos?.[_fxId] ?? null, ed = t.id in _fxTab;
    sEl.innerHTML = p == null ? (part && calcular(_fx, null, t).descRef ? `ref. ${fmt(Math.round(part * (1 - calcular(_fx, null, t).descRef)))}` : '')
      : `${c.semCusto ? 'sem custo' : `<span style="color:${c.status === 'r' ? 'var(--red)' : 'inherit'}">margem ${pct(c.margem)}</span>`} · piso ${pct(c.min, 0)}${part ? ` · desc. ${pct(1 - p / part)}` : ''}`;
    sEl.innerHTML += `<div>${unilabFicha(t.sistema?.[_fxId] ?? null, salvo, !!t.sistema)}</div>`;
    document.getElementById('fxt-pi-' + t.id).className = `price-in ${ed ? 'on' : ''}`;
    const d = ed && p != null && salvo != null ? p - salvo : 0;
    document.getElementById('fxt-d-' + t.id).innerHTML = !ed ? '' : salvo == null ? '<span class="delta-dn">entra na tabela</span>' : p == null ? '<span class="delta-up">sai da tabela</span>'
      : `<span class="${d > 0 ? 'delta-dn' : 'delta-up'}">${d > 0 ? '+' : ''}${fmt(d)} (${d > 0 ? '+' : ''}${pct(d / salvo)})</span>`;
  });
}

// Alterações de preço pendentes na ficha: [{ alvo, nome, de, para }]
function mudancasPrecoFicha() {
  if (!_fx) return [];
  const m = [], o = _fxOrig.precoPraticado ?? null, n = _fx.precoPraticado ?? null;
  if (n != null && (o == null || Math.abs(n - o) > 0.004)) m.push({ alvo: 'particular', nome: 'Particular', de: o, para: n });
  Object.entries(_fxTab).forEach(([id, v]) => { if (ESTADO.tabelas[id]) m.push({ alvo: id, nome: ESTADO.tabelas[id].nome, de: ESTADO.tabelas[id].precos?.[_fxId] ?? null, para: v }); });
  return m;
}

// Campos de dados (custos, controles…) alterados na ficha
const _fxIgual = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const mudancasDadosFicha = () => !_fx ? [] : Object.keys(CAMPOS_FICHA).filter(c => !_fxIgual(c === 'extras' ? extrasExame(_fxOrig) : _fxOrig[c], _fx[c]));

// Clique fora, botão de fechar ou Esc: com preço alterado na ficha, pergunta se fecha ou guarda no rascunho
async function clicarForaGaveta() {
  if (_rgPausa && document.getElementById('cq-nome')) return voltarReagenteInsumo();
  if (_fxPausa && document.getElementById('rg-nome')) return voltarFichaReagente();
  if (!document.getElementById('fx-rodape')) return fecharGaveta();   // outra gaveta (não a ficha)
  const precos = document.getElementById('fx-rodape') &&(pode('exames', 'editar') || pode('tabelas', 'editar')) ? mudancasPrecoFicha() : [];
  if (!rascMudouFicha(precos)) return fecharGaveta();
  if (!precos.length) return salvarFicha('rascunho');
  const v = x => x != null ? fmt(x) : 'fora';
  const r = await confirmar({
    titulo: precos.length > 1 ? 'Salvar os preços como rascunho?' : `Salvar como rascunho da ${precos[0].nome}?`, icone: 'fa-pen-to-square', botao: 'Salvar no rascunho', cancelar: 'Fechar sem salvar',
    texto: `Você alterou ${precos.length > 1 ? 'preços' : 'o preço'} de <b>${esc(_fx.mn)}</b>. No rascunho nada é publicado: fica para revisar e enviar para aprovação.`
      + `<span class="fx-conf">${precos.map(m => `<span><b>${esc(m.nome)}</b><i>${v(m.de)} → <b>${m.para != null ? fmt(m.para) : 'retirar'}</b></i></span>`).join('')}</span>`
  });
  if (r === true) salvarFicha('rascunho');
  else if (r === false) fecharGaveta();
}

// Propostas pendentes que incluem o exame
function desenharPendentesFicha(id) {
  const el = document.getElementById('fx-pend');
  if (!el) return;
  const ps = lista(ESTADO.propostas, (a, b) => (b.em || 0) - (a.em || 0)).filter(p => p.status === 'pendente' && p.itens?.[id]);
  el.innerHTML = ps.length ? `<div class="alert a"><i class="fa-solid fa-hourglass-half"></i><div><b>${ps.length} proposta(s) aguardando aprovação</b>${ps.map(p => {
      const it = p.itens[id];
      return `<div>${esc(p.alvoNome)}: ${it.de != null ? fmt(it.de) : 'fora'} → <b>${it.para != null ? fmt(it.para) : 'retirar'}</b> · ${esc(p.autor)}${pode('tabelas') ? ` · <a href="#" onclick="abrirProposta('${p.id}');return false">abrir</a>` : ''}</div>`;
    }).join('')}</div></div>` : '';
}

// Rodapé: com alteração de preço vira "salvar no rascunho" / "aprovar e publicar"
function desenharRodapeFicha() {
  const el = document.getElementById('fx-rodape');
  if (!el) return;
  const editar = pode('exames', 'editar') || pode('tabelas', 'editar'), mud = mudancasPrecoFicha().length, aprova = pode('tabelas', 'aprovar');
  // com preço pendente, custos e controles têm o próprio Salvar (não mexe em preço nem fecha a ficha)
  const dados = mud && pode('exames', 'editar') && mudancasDadosFicha().length;
  el.innerHTML = `${pode('exames', 'excluir') ? `<button class="btn perigo-txt" onclick="excluirExame()" title="Excluir exame"><i class="fa-solid fa-trash"></i></button>` : ''}
    ${pode('exames', 'editar') && ESTADO.exames[_fxId] ? (ESTADO.exames[_fxId].ativo === false
      ? `<button class="btn bt-play" onclick="alternarAtivoExame('${_fxId}')" title="Ativar exame"><i class="fa-solid fa-play"></i></button>`
      : `<button class="btn bt-pause" onclick="alternarAtivoExame('${_fxId}')" title="Inativar exame"><i class="fa-solid fa-pause"></i></button>`) : ''}
    ${pode('exames', 'editar') ? `<button class="btn" style="margin-right:auto" onclick="abrirDadosExame('${_fxId}')" title="Dados do exame: nome, setor, material, prazo"><i class="fa-solid fa-pen-to-square"></i>${mud ? '' : 'Dados'}</button>` : '<span style="margin-right:auto"></span>'}
    ${editar ? '' : '<button class="btn" onclick="fecharGaveta()">Fechar</button>'}
    ${dados ? `<button class="btn" onclick="salvarFicha('dados')" title="Salva custos e controles agora; os preços continuam pendentes"><i class="fa-solid fa-floppy-disk"></i>Salvar</button>` : ''}
    ${!editar ? '' : mud ? `<button class="btn" onclick="salvarFicha('rascunho')" title="Guarda os preços no seu rascunho de cada tabela, para revisar e enviar depois"><i class="fa-solid fa-pen-to-square"></i>${aprova ? (dados ? '' : 'Rascunho') : 'Salvar no rascunho'}</button>
        <button class="btn ${aprova ? '' : 'pri'}" onclick="salvarFicha('confirmar')" title="Guarda os preços no rascunho e abre o rascunho de exames para conferir e confirmar o envio"><i class="fa-solid fa-paper-plane"></i>${aprova ? (dados ? '' : 'Enviar proposta') : 'Enviar proposta'}</button>
        ${aprova ? `<button class="btn pri" onclick="salvarFicha('publicar')" title="Publica os preços agora"><i class="fa-solid fa-stamp"></i>Aprovar e publicar</button>` : ''}`
      : `<button class="btn pri" onclick="salvarFicha()"><i class="fa-solid fa-floppy-disk"></i>Salvar</button>`}`;
}

function metaFicha() {
  const e = _fx;
  return `${tagSetor(e.setorId)}<span class="tag"><i class="fa-solid ${e.origem === 'apoio' ? 'fa-truck-medical' : 'fa-microscope'}"></i>${e.origem === 'apoio' ? 'Apoio' : 'Interno'}</span>`
    + (e.ativo === false ? '<span class="tag" style="color:var(--red)"><i class="fa-solid fa-eye-slash"></i>Inativo</span>' : '')
    + (e.material ? `<span class="tag"><i class="fa-solid fa-vial"></i>${esc(e.material)}</span>` : '')
    + (textoPrazo(_fxId) ? `<span class="tag"><i class="fa-solid fa-clock"></i>${esc(textoPrazo(_fxId))}</span>` : '');
}

// ── Seções dinâmicas ──────────────────────────────────────────
function atualizarFicha() {
  const e = _fx, c = calcular(e), preco = e.precoPraticado;
  const alertas = [];
  if (c.semCusto) alertas.push(['x', 'fa-circle-question', '<b>Custo do teste não informado.</b> Sem ele a margem é desconhecida.']);
  if (c.status === 'r') alertas.push(['r', 'fa-circle-xmark', `Margem ${pct(c.margem)} abaixo do mínimo de ${pct(c.min)}. Preço mínimo viável: <b>${fmt(c.minimo)}</b>.`]);
  if (e.foraDoSistema) alertas.push(['a', 'fa-plug-circle-xmark', 'Mnemônico não encontrado no catálogo do sistema do laboratório.']);
  document.getElementById('fx-alertas').innerHTML = alertas.map(([t, ic, txt]) => `<div class="alert ${t}"><i class="fa-solid ${ic}"></i><div>${txt}</div></div>`).join('');

  const w = v => Math.max(0, Math.min(100, v / preco * 100));
  document.getElementById('fx-comp').innerHTML = c.semCusto || !preco ? `<div class="muted" style="font-size:12.5px">${c.semCusto ? 'Informe o custo do teste para ver a composição.' : 'Informe o preço praticado.'}</div>`
    : `<div class="comp"><div style="width:${w(c.custo)}%;background:#64748b"></div><div style="width:${w(c.imposto)}%;background:var(--amber)"></div><div style="width:${w(c.lucro)}%;background:var(--green)"></div></div>
       <div class="comp-leg"><span><b style="background:#64748b"></b>Custo ${pct(c.custo / preco)}</span><span><b style="background:var(--amber)"></b>Imposto ${pct(c.imposto / preco)}</span><span><b style="background:${c.lucro < 0 ? 'var(--red)' : 'var(--green)'}"></b>Lucro ${pct(c.margem)}</span></div>`;

  const n = parametro('examesPorAtendimento');
  document.getElementById('fx-casc').innerHTML = `<div class="casc">
    <div class="casc-r"><div class="lft"><i class="fa-solid ${e.origem === 'apoio' ? 'fa-truck-medical' : 'fa-vials'}"></i><div>Custo do teste<div class="s">${rotuloOrigemCusto(e)}</div></div></div><span class="v">${c.semCusto ? '—' : fmt(c.teste.valor)}</span></div>
    ${c.fx.map(f => linhaFixoFicha(f, n)).join('')}
    ${c.extras.map(x => `<div class="casc-r"><div class="lft"><i class="fa-solid fa-hand-holding-dollar"></i><div>${esc(x.nome)}<div class="s">custo adicional</div></div></div><span class="v">${fmt(x.valor)}</span></div>`).join('')}
    <div class="casc-r tot"><div class="lft"><i class="fa-solid fa-equals"></i><div>Custo total</div></div><span class="v">${c.semCusto ? '—' : fmt(c.custo)}</span></div>
    ${preco && !c.semCusto ? `
    <div class="casc-r neg"><div class="lft"><i class="fa-solid fa-landmark"></i><div>Imposto<div class="s">${pct(parametro('imposto'))} sobre o preço</div></div></div><span class="v">− ${fmt(c.imposto)}</span></div>
    <div class="casc-r res"><div class="lft"><i class="fa-solid fa-sack-dollar"></i><div>Lucro</div></div><span class="v" style="color:${c.lucro < 0 ? 'var(--red)' : 'var(--green)'}">${fmt(c.lucro)}</span></div>` : ''}
  </div>
  ${preco && !c.semCusto ? `<div class="alert x" style="margin:10px 0 0"><i class="fa-solid fa-credit-card"></i><div><b>Projeção na maquininha</b> (${pct(parametro('taxaMaquininha'), 2)}, fora do custo): − ${fmt(c.taxaCartao)} → lucro <b style="color:${c.lucroCartao < 0 ? 'var(--red)' : 'inherit'}">${fmt(c.lucroCartao)}</b> · margem <b>${pct(c.margemCartao)}</b></div></div>` : ''}`;

  document.getElementById('fx-sug').innerHTML = `<div class="pbox"><div class="l"><i class="fa-solid fa-wand-magic-sparkles"></i>Sugerido ${c.semCusto ? '' : `(alvo ${pct(c.alvo)}${ESTADO.setores[e.setorId]?.margemAlvo != null ? ' do setor' : ''})`}</div>
    <div class="v">${c.sugerido ? fmt(c.sugerido) : '—'}</div>
    <div class="m muted">${c.minimo ? `mínimo viável ${fmt(c.minimo)}` : 'precisa de custo'}</div>
    ${c.sugerido && pode('exames', 'editar') ? `<button class="btn sm" style="margin-top:8px" onclick="usarSugerido(${c.sugerido})"><i class="fa-solid fa-arrow-right"></i>Usar sugerido</button>` : ''}</div>`;
  document.getElementById('fx-st').innerHTML = tagStatus(c.status);
  const pub = _fxOrig.precoPraticado || null;
  document.getElementById('fx-sist').innerHTML = `<div class="hint" style="margin-top:8px"><i class="fa-solid fa-server"></i> Valor atual no Unilab (Particular): ${unilabFicha(e.precoSistema ?? null, pub, !e.inativoNoSistema || e.precoSistema != null)}${e.inativoNoSistema ? ' <span class="muted">· efetua = N</span>' : ''}</div>`;

  // Valores: variação do praticado, tabelas, hierarquia, abas e rodapé
  const o = _fxOrig.precoPraticado, d = preco && o ? preco - o : 0;
  document.getElementById('fx-preco-d').innerHTML = Math.abs(d) > 0.004 ? `<span class="${d > 0 ? 'delta-dn' : 'delta-up'}">${d > 0 ? '+' : ''}${fmt(d)} (${d > 0 ? '+' : ''}${pct(d / o)}) · era ${fmt(o)}</span>` : '';
  document.querySelector('#fx-preco')?.closest('.pbox').classList.toggle('mud', Math.abs(d) > 0.004);
  atualizarTabsFicha();
  const qs = quebrasHierarquia(_fxId, (a, k) => a === 'particular' ? _fx.precoPraticado || null : precoTabFicha(a));
  document.getElementById('fx-hier').innerHTML = qs.length ? `<div class="alert a" style="margin-top:10px"><i class="fa-solid fa-stairs"></i><div><b>Quebra a hierarquia de valor</b>${qs.map(q => `<div>${esc(textoQuebra(q))}</div>`).join('')}</div></div>` : '';
  desenharAbasFicha();
  desenharRodapeFicha();
}

// Custo fixo na cascata: quem edita altera o valor só neste exame, ativa ou inativa.
// O valor é editado em uma linha por vez e aplicado ao sair do campo, pois a cascata é redesenhada a cada alteração.
let _fxFixoEd = null;
function linhaFixoFicha(f, n) {
  const editar = pode('exames', 'editar'), proprio = typeof _fx.fixosAjuste?.[f.id] === 'number', padrao = ESTADO.custosFixos[f.id]?.valor;
  const base = f.cobranca === 'rateado' ? `${fmt(f.valor)} rateado ÷ ${n} exames` : 'linear, valor cheio';
  const sub = f.inativoExame ? 'inativo neste exame' : !f.aplica ? 'não passa por esta etapa' : proprio ? `${base} · padrão ${fmt(padrao)}` : base;
  const valor = _fxFixoEd === f.id
    ? `<div class="price-in on"><span>R$</span><input id="fx-fixo-in" type="number" step="0.01" min="0" value="${Number(f.valor).toFixed(2)}" onfocus="this.select()" onblur="definirFixoExame('${f.id}',this.value)"
        onkeydown="if(event.key==='Enter')this.blur();else if(event.key==='Escape'){event.stopPropagation();_fxFixoEd=null;atualizarFicha()}"></div>`
    : `<span class="v">${f.aplica ? fmt(f.v) : '—'}</span>`;
  const acoes = !editar ? '' : `${f.aplica && _fxFixoEd !== f.id ? `<button type="button" class="btn sm" title="Alterar o valor neste exame" onclick="editarFixoExame('${f.id}')"><i class="fa-solid fa-pen"></i></button>` : ''}
    ${proprio && _fxFixoEd !== f.id ? `<button type="button" class="btn sm" title="Voltar ao valor padrão (${fmt(padrao)})" onclick="ajustarFixoExame('${f.id}')"><i class="fa-solid fa-rotate-left"></i></button>` : ''}
    ${chave(f.aplica, `alternarFixoExame('${f.id}')`)}`;
  return `<div class="casc-r ${f.aplica ? '' : 'skip'}"><div class="lft"><i class="fa-solid ${f.icone || 'fa-coins'}"></i><div>${esc(f.nome)}<div class="s">${sub}</div></div></div>
    <div style="display:flex;align-items:center;gap:8px">${valor}${acoes}</div></div>`;
}
// v: false (inativo) | número (valor próprio) | undefined (volta ao padrão)
function ajustarFixoExame(id, v) {
  const a = { ..._fx.fixosAjuste };
  if (v === undefined) delete a[id]; else a[id] = v;
  if (Object.keys(a).length) _fx.fixosAjuste = a; else delete _fx.fixosAjuste;
  atualizarFicha();
}
function editarFixoExame(id) {
  _fxFixoEd = id;
  atualizarFicha();
  document.getElementById('fx-fixo-in')?.focus();
}
function definirFixoExame(id, txt) {
  if (_fxFixoEd !== id) return;   // cancelado com Esc
  _fxFixoEd = null;
  const v = Math.round(parseFloat(txt) * 100) / 100;
  if (!(v >= 0)) return atualizarFicha();
  ajustarFixoExame(id, Math.abs(v - ESTADO.custosFixos[id].valor) < 0.004 ? undefined : v);
}
// Custo ligado a uma etapa (coleta, triagem) segue a etapa do exame, para não haver dois controles do mesmo custo
function alternarFixoExame(id) {
  const f = ESTADO.custosFixos[id];
  if (f.etapa) return alternarEtapaExame(f.etapa);
  ajustarFixoExame(id, _fx.fixosAjuste?.[id] === false ? undefined : false);
}

function usarSugerido(v) {
  if (propPendente('particular', _fxId)) return toast('Preço em proposta aguardando aprovação: altere na proposta', 'erro');
  _fx.precoPraticado = v;
  document.getElementById('fx-preco').value = moedaCampo(v);
  atualizarFicha();
}

function rotuloOrigemCusto(e) {
  const ct = custoTesteExame(e);
  if (!ct) return 'não informado';
  if (ct.origem === 'apoio') return `tabela do apoio · vigência ${dataBR(ct.ref.vigencia)}`;
  if (ct.origem === 'reagente') return `reagente ${ct.ref.nome}${(e.qtdReagente || 1) !== 1 ? ` × ${num(e.qtdReagente, 3)}` : ''}`;
  return { planilha: 'migrado da planilha', manual: 'informado manualmente' }[ct.origem] || 'informado manualmente';
}

// ── Seções estáticas ──────────────────────────────────────────
// Fonte do custo do teste: manual | reagente | tabela do apoio
const fonteCusto = e => e.vinculoApoio ? 'apoio' : e.reagenteId ? 'reagente' : 'manual';
const apoioDoExame = e => ESTADO.setores[e.setorId]?.categoria === 'apoio' ? e.setorId : (e.vinculoApoio?.apoioId || null);

function desenharCustoTeste() {
  const e = _fx, editar = pode('exames', 'editar') || pode('custos', 'editar'), fonte = _fxFonte || fonteCusto(e);
  const apoioId = apoioDoExame(e), temTabela = apoioId && Object.values(ESTADO.apoios[apoioId]?.precos || {}).some(p => !p.inativo);
  const fontes = [['manual', 'Manual', 'fa-pen'], ['reagente', 'Reagente', 'fa-vials']];
  if (e.origem === 'apoio' || e.vinculoApoio || apoioId) fontes.push(['apoio', 'Tabela do apoio', 'fa-truck-medical']);
  let corpo = '';
  if (fonte === 'manual') {
    corpo = `<div class="casc-r"><div class="lft"><i class="fa-solid fa-pen"></i><div>${e.origem === 'apoio' ? 'Valor pago ao apoio' : 'Custo por teste'}<div class="s">${e.origem === 'apoio' ? 'preço não negociado: informado pela equipe' : 'informado manualmente'}</div></div></div>
      <div class="price-in"><span>R$</span><input id="fx-custo-in" type="number" step="0.01" min="0" value="${e.custoTeste != null ? Number(e.custoTeste).toFixed(2) : ''}" placeholder="0,00" ${editar ? '' : 'disabled'}
        oninput="_fx.custoTeste=this.value===''?null:Math.max(0,parseFloat(this.value)||0);_fx.custoOrigem='manual';atualizarFicha()"></div></div>`;
  } else if (fonte === 'reagente') {
    const r = ESTADO.reagentes[e.reagenteId], cpt = r ? custoPorTeste(r, e.reagenteId) : null;
    corpo = `<div class="casc-r"><div class="lft"><i class="fa-solid fa-vials"></i><div>Reagente<div class="s">${r ? `${esc(r.fornecedor || '')} · ${fmt(cpt)} por teste` : 'escolha o reagente'}</div></div></div><div id="pop-fxreag" style="min-width:220px"></div></div>
      <div class="casc-r"><div class="lft"><i class="fa-solid fa-xmark"></i><div>Testes por exame<div class="s">ex.: 2 se o exame consome dois testes</div></div></div>
        <div class="price-in"><input type="number" step="0.01" min="0.01" value="${e.qtdReagente || 1}" ${editar ? '' : 'disabled'} oninput="_fx.qtdReagente=Math.max(0.01,parseFloat(this.value)||1);atualizarFicha()"></div></div>
      ${editar && pode('custos', 'criar') ? `<div class="casc-r"><div class="lft"><i class="fa-solid fa-plus"></i><div>Reagente não cadastrado<div class="s">cadastra o reagente e volta para esta ficha</div></div></div><button type="button" class="btn sm" onclick="novoReagenteFicha()"><i class="fa-solid fa-plus"></i>Novo reagente</button></div>` : ''}`;
  } else {
    const p = e.vinculoApoio ? precoApoio(e.vinculoApoio.apoioId, e.vinculoApoio.chave) : null;
    corpo = !temTabela ? `<div class="casc-r muted"><div class="lft"><i class="fa-solid fa-circle-info"></i><div>Este apoio ainda não tem tabela importada<div class="s">use custo manual por enquanto</div></div></div></div>`
      : `<div class="casc-r"><div class="lft"><i class="fa-solid fa-link"></i><div>${p ? `<span class="mn">${esc(p.codigo)}</span> <span class="tag">${esc(p.material || '')}</span>` : 'Sem vínculo'}<div class="s">${p ? esc(p.descricao) : 'escolha o item da tabela do apoio'}</div></div></div><div id="pop-fxapoio" style="min-width:200px"></div></div>
        ${p ? `<div class="casc-r"><div class="lft"><i class="fa-solid fa-handshake" style="color:var(--green)"></i><div>Preço negociado · vigência ${dataBR(p.vigencia)}<div class="s">${p.agendado ? `novo preço ${fmt(p.agendado.preco)} a partir de ${dataBR(p.agendado.vigencia)}` : 'atualiza a cada importação da tabela'}</div></div></div>${editar ? `<div style="display:flex;align-items:center;gap:8px"><span class="v">${fmt(p.valor)}</span><button type="button" class="btn sm" title="Editar preço negociado" onclick="_fxEditPreco=true;desenharCustoTeste()"><i class="fa-solid fa-pen"></i></button></div>` : `<span class="v">${fmt(p.valor)}</span>`}</div>` : ''}`;
    // edita o preço negociado e a vigência do item vinculado direto na tabela do apoio
    if (p && editar && _fxEditPreco) {
      const it = ESTADO.apoios[e.vinculoApoio.apoioId].precos[e.vinculoApoio.chave];
      corpo += `<div class="casc-r" style="display:block"><div class="lft" style="margin-bottom:10px"><i class="fa-solid fa-pen"></i><div>Editar preço negociado<div class="s">altera o item ${esc(it.codigo)} na tabela do apoio; vigência futura mantém o preço atual até a data</div></div></div>
          <div class="form-col" style="gap:8px">
            <div style="display:flex;gap:8px"><div class="price-in"><span>R$</span><input id="fx-ep-preco" type="number" step="0.01" min="0" value="${Number(it.preco).toFixed(2)}" onfocus="this.select()"></div>
              <div class="inp" style="flex:1"><input class="txt" id="fx-ep-vig" type="date" value="${esc(it.vigencia || hojeISO())}"></div></div>
            <div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn sm" onclick="_fxEditPreco=false;desenharCustoTeste()">Cancelar</button>
              <button type="button" class="btn sm pri" onclick="salvarPrecoApoioFicha()"><i class="fa-solid fa-floppy-disk"></i>Salvar preço</button></div>
          </div></div>`;
    }
    // valor negociado fora da tabela importada: cadastra o item à mão na tabela do apoio e vincula, como no cadastro do exame
    const apoio = ESTADO.setores[apoioId];
    if (editar && apoio?.categoria === 'apoio') corpo += !_fxNovoItem
      ? `<div class="casc-r"><div class="lft"><i class="fa-solid fa-plus"></i><div>Item fora da tabela<div class="s">valor negociado: cadastra o item em ${esc(apoio.nome)} e vincula o exame</div></div></div><button type="button" class="btn sm" onclick="_fxNovoItem=true;desenharCustoTeste()"><i class="fa-solid fa-plus"></i>Novo item</button></div>`
      : `<div class="casc-r" style="display:block"><div class="lft" style="margin-bottom:10px"><i class="fa-solid fa-handshake" style="color:var(--green)"></i><div>Novo item em ${esc(apoio.nome)}<div class="s">entra na tabela do apoio como item manual e o exame fica vinculado a ele</div></div></div>
          <div class="form-col" style="gap:8px">
            <div style="display:flex;gap:8px"><div class="inp" style="flex:1"><input class="txt" id="fx-ap-cod" placeholder="Código no apoio" value="${esc(e.mn || '')}"></div>
              <div class="price-in"><span>R$</span><input id="fx-ap-preco" type="number" step="0.01" min="0" placeholder="0,00" value="${e.custoTeste != null ? Number(e.custoTeste).toFixed(2) : ''}" onfocus="this.select()"></div></div>
            <div class="inp"><input class="txt" id="fx-ap-desc" placeholder="Nome do exame no apoio" value="${esc(e.descricao || '')}"></div>
            <div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn sm" onclick="_fxNovoItem=false;desenharCustoTeste()">Cancelar</button>
              <button type="button" class="btn sm pri" onclick="criarItemApoioFicha()"><i class="fa-solid fa-link"></i>Cadastrar e vincular</button></div>
          </div></div>`;
  }
  document.getElementById('fx-custo').innerHTML = `
    <div class="seg" style="margin-bottom:8px">${fontes.map(([v, t, ic]) => `<button class="${fonte === v ? 'on' : ''}" ${editar ? '' : 'disabled'} onclick="trocarFonteCusto('${v}')"><i class="fa-solid ${ic}"></i>${t}</button>`).join('')}</div>
    <div class="casc">${corpo}</div>`;
  if (fonte === 'reagente') criarPop('pop-fxreag', {
    rotulo: 'Reagente', titulo: 'Reagente do exame', icone: 'fa-vials', busca: 'Buscar reagente…', padrao: '',
    opcoes: () => [{ valor: '', rotulo: 'Nenhum', icone: 'fa-ban', cor: 'var(--gray)' },
      ...lista(ESTADO.reagentes, porNome).map(r => ({ valor: r.id, rotulo: r.nome, icone: 'fa-vials', desc: `${r.fornecedor || ''} · ${fmt(custoPorTeste(r))}/teste` }))],
    aoMudar: v => { _fx.reagenteId = v || null; desenharCustoTeste(); atualizarFicha(); }
  });
  if (fonte === 'apoio' && temTabela) criarPop('pop-fxapoio', {
    rotulo: 'Item do apoio', titulo: 'Tabela do apoio', icone: 'fa-magnifying-glass', busca: 'Código ou nome…', padrao: '',
    opcoes: () => lista(ESTADO.apoios[apoioId].precos, (a, b) => String(a.codigo).localeCompare(b.codigo)).filter(p => !p.inativo)
      .map(p => ({ valor: p.id, rotulo: `${p.codigo} · ${p.descricao}`, icone: 'fa-flask', desc: `${p.material || ''} · ${fmt(p.preco)}` })),
    aoMudar: v => { _fx.vinculoApoio = v ? { apoioId, chave: v } : null; desenharCustoTeste(); desenharControles(); atualizarFicha(); }
  });
  if (POPS['pop-fxreag'] && fonte === 'reagente') { POPS['pop-fxreag'].valor = e.reagenteId || ''; desenharBotaoPop('pop-fxreag'); }
  if (POPS['pop-fxapoio'] && fonte === 'apoio' && temTabela) { POPS['pop-fxapoio'].valor = e.vinculoApoio?.chave || ''; desenharBotaoPop('pop-fxapoio'); }
}

// Cadastra o item na tabela do apoio (manual) e já grava o vínculo no exame
let _fxNovoItem = false;
let _fxEditPreco = false;

// Altera preço/vigência do item vinculado na tabela do apoio (mesma regra de gravarItemApoio)
async function salvarPrecoApoioFicha() {
  const { apoioId, chave: k } = _fx.vinculoApoio || {}, old = ESTADO.apoios[apoioId]?.precos?.[k], a = ESTADO.setores[apoioId];
  if (!old) return toast('Item do apoio não encontrado', 'erro');
  const preco = Math.round(numCampo('fx-ep-preco') * 100) / 100, vig = valorCampo('fx-ep-vig') || hojeISO();
  if (!(preco >= 0)) return toast('Informe o preço', 'erro');
  if (old.preco === preco && (old.vigencia || '') === vig) { _fxEditPreco = false; return desenharCustoTeste(); }
  const item = { ...old, preco, vigencia: vig, editadoEm: Date.now(), editadoPor: usuarioAtual().nome };
  // o preço que valia segue valendo até a nova vigência (ver precoApoio)
  item.anterior = old.vigencia > hojeISO() && old.anterior ? old.anterior : { preco: old.preco, vigencia: old.vigencia || null };
  const hist = itemHistorico(item, 'editado', { de: old.preco, para: preco, vigDe: old.vigencia, vigPara: vig });
  await DB.mesclar('/', { [`${CAMINHOS.apoios}/${apoioId}/precos/${k}`]: item, ...loteHistoricoApoio('manual', { [k]: hist }, {}, apoioId) });
  ESTADO.apoios[apoioId] = { ...ESTADO.apoios[apoioId], precos: { ...ESTADO.apoios[apoioId].precos, [k]: item } };
  registrar('apoios', `${a?.nome || apoioId}: item ${old.codigo} alterado pela ficha do exame ${_fx.mn} (${fmt(old.preco)} → ${fmt(preco)}, vigência ${dataBR(vig)})`);
  _fxEditPreco = false;
  desenharCustoTeste(); desenharControles(); atualizarFicha();
  toast(`Preço de ${old.codigo} atualizado`);
}
async function criarItemApoioFicha() {
  const e = _fx, apoioId = apoioDoExame(e), apoio = ESTADO.setores[apoioId];
  if (apoio?.categoria !== 'apoio') return toast('O setor do exame não é um laboratório de apoio', 'erro');
  const cod = valorCampo('fx-ap-cod').trim(), preco = numCampo('fx-ap-preco');
  if (!cod) return toast('Informe o código do item no apoio', 'erro');
  if (!(preco >= 0)) return toast('Informe o valor negociado', 'erro');
  const k = chaveItemApoio(cod, '');
  if (ESTADO.apoios[apoioId]?.precos?.[k]) return toast(`O item ${cod} já existe na tabela de ${apoio.nome}: escolha-o em "Item do apoio"`, 'erro');
  const item = { codigo: cod, material: '', descricao: valorCampo('fx-ap-desc').trim() || e.descricao || '', preco: Math.round(preco * 100) / 100, vigencia: hojeISO(), manual: true, desde: Date.now(), criadoPor: usuarioAtual().nome };
  await DB.mesclar('/', { [`${CAMINHOS.apoios}/${apoioId}/precos/${k}`]: item, ...loteHistoricoApoio('manual', { [k]: itemHistorico(item, 'criado', { para: item.preco, vigPara: item.vigencia }) }, {}, apoioId) });
  // já vale na ficha, sem esperar o dado voltar do banco
  ESTADO.apoios[apoioId] = { ...ESTADO.apoios[apoioId], precos: { ...ESTADO.apoios[apoioId]?.precos, [k]: item } };
  registrar('apoios', `${apoio.nome}: item ${cod} cadastrado manualmente (${fmt(item.preco)}) pela ficha do exame ${e.mn}`);
  _fx.vinculoApoio = { apoioId, chave: k };
  _fx.reagenteId = null;
  _fxFonte = 'apoio'; _fxNovoItem = false;
  desenharCustoTeste(); desenharControles(); atualizarFicha();
  await salvarFicha('dados');
  toast(`${e.mn}: item ${cod} cadastrado em ${apoio.nome} e vinculado`);
}

// Novo reagente a partir da ficha: a gaveta é uma só, então os elementos da ficha ficam guardados
// (com o que já foi digitado) e voltam ao salvar ou cancelar o cadastro
let _fxPausa = null;
function novoReagenteFicha() {
  const nos = id => [...document.getElementById(id).childNodes];
  const pausa = { sobre: document.getElementById('g-sobre').textContent, titulo: document.getElementById('g-titulo').textContent,
    meta: nos('g-meta'), corpo: nos('g-corpo'), rodape: nos('g-rodape'), topo: document.getElementById('g-corpo').scrollTop };
  abrirReagente();
  _fxPausa = pausa;
}
// id: reagente recém-cadastrado, já escolhido na ficha (grava no exame ao salvar a ficha)
function voltarFichaReagente(id) {
  const p = _fxPausa;
  _fxPausa = null;
  fecharPop();
  document.getElementById('g-sobre').textContent = p.sobre;
  document.getElementById('g-titulo').textContent = p.titulo;
  document.getElementById('g-meta').replaceChildren(...p.meta);
  document.getElementById('g-corpo').replaceChildren(...p.corpo);
  document.getElementById('g-rodape').replaceChildren(...p.rodape);
  document.getElementById('g-corpo').scrollTop = p.topo;
  if (!id) return;
  _fx.reagenteId = id;
  _fx.qtdReagente = _fx.qtdReagente || 1;
  _fxFonte = 'reagente';
  desenharCustoTeste(); desenharControles(); atualizarFicha();
}

async function trocarFonteCusto(f) {
  if (f !== 'apoio' && _fx.vinculoApoio) {
    const manual = f === 'manual';
    const { apoioId, chave: k } = _fx.vinculoApoio, it = ESTADO.apoios[apoioId]?.precos?.[k], p = precoApoio(apoioId, k);
    const ok = await confirmar({ titulo: 'Desvincular do exame de apoio?', icone: 'fa-link-slash', botao: manual ? 'Desvincular e usar manual' : 'Desvincular e usar reagente',
      texto: `Ao selecionar <b>${manual ? 'Manual' : 'Reagente'}</b>, <b>${esc(_fx.mn)}</b> deixa de seguir o valor da tabela de <b>${esc(ESTADO.setores[apoioId]?.nome || 'apoio')}</b> e não acompanha mais as importações. A alteração só vale ao salvar a ficha.`
        + `<span class="fx-conf"><span><b>${esc(it?.codigo || 'Item do apoio')}</b><i>${p ? fmt(p.valor) : 'sem preço vigente'}</i></span>`
        + (manual ? `<span><b>Custo manual</b><i>${_fx.custoTeste != null ? fmt(_fx.custoTeste) : 'não informado'}</i></span>` : `<span><b>Reagente</b><i>escolha em seguida</i></span>`) + '</span>' });
    if (ok !== true) return;
  }
  if (f !== 'apoio') _fx.vinculoApoio = null;
  if (f !== 'reagente') _fx.reagenteId = null;
  if (f === 'reagente' && !_fx.reagenteId) _fx.qtdReagente = _fx.qtdReagente || 1;
  if (f === 'apoio' && !_fx.vinculoApoio) _fx.vinculoApoio = null;
  _fxFonte = f;
  desenharCustoTeste(); desenharControles(); atualizarFicha();
  // modo escolhido sem item ainda: mostra o seletor correspondente
  if (f === 'reagente' && !_fx.reagenteId) setTimeout(() => POPS['pop-fxreag'] && abrirPop('pop-fxreag'), 50);
  if (f === 'apoio' && !_fx.vinculoApoio) setTimeout(() => document.getElementById('pop-fxapoio') && POPS['pop-fxapoio'] && abrirPop('pop-fxapoio'), 50);
}
let _fxFonte = null;

function desenharExtras() {
  const editar = pode('exames', 'editar');
  document.getElementById('fx-extras').innerHTML = `<div class="casc">
    ${_fx.extras.map((x, i) => `<div class="casc-r"><div class="lft"><i class="fa-solid fa-hand-holding-dollar"></i><div>${esc(x.nome)}</div></div>
      <span class="v">${fmt(x.valor)} ${editar ? `<button class="pop-x" title="Remover" onclick="_fx.extras.splice(${i},1);desenharExtras();atualizarFicha()"><i class="fa-solid fa-xmark"></i></button>` : ''}</span></div>`).join('')}
    ${editar ? `<div class="casc-r add-extra"><input id="fx-ex-nome" class="mini" placeholder="Ex.: aplicação, conservação…"><input id="fx-ex-val" class="mini v-in" type="number" step="0.01" min="0" placeholder="0,00">
      <button class="btn sm" onclick="adicionarExtra()"><i class="fa-solid fa-plus"></i>Adicionar</button></div>` : ''}
    ${!_fx.extras.length && !editar ? '<div class="casc-r muted">Nenhum</div>' : ''}</div>`;
}
function adicionarExtra() {
  const nome = valorCampo('fx-ex-nome').trim(), valor = numCampo('fx-ex-val');
  if (!nome || !(valor > 0)) return toast('Informe nome e valor do custo', 'erro');
  _fx.extras.push({ nome, valor: Math.round(valor * 100) / 100 });
  desenharExtras(); atualizarFicha();
}

function desenharEtapas() {
  const et = etapasExame(_fx), s = ESTADO.setores[_fx.setorId], editar = pode('exames', 'editar');
  const ajustado = _fx.etapas && Object.keys(_fx.etapas).length;
  document.getElementById('fx-etapas').innerHTML = `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
    ${Object.entries(ETAPAS).map(([k, x]) => `<button class="chip ${et[k] ? 'on' : ''}" ${editar ? '' : 'disabled'} onclick="alternarEtapaExame('${k}')"><i class="fa-solid ${et[k] ? 'fa-circle-check' : 'fa-circle-xmark'}"></i>${x.nome}</button>`).join('')}
    <span class="muted" style="font-size:11.5px">${ajustado ? `<i class="fa-solid fa-thumbtack"></i> ajustado neste exame ${editar ? '· <a href="#" onclick="delete _fx.etapas;desenharEtapas();atualizarFicha();return false">usar padrão do setor</a>' : ''}` : `padrão do ${s ? 'setor' : 'sistema'}`}</span></div>`;
}
function alternarEtapaExame(k) {
  const et = etapasExame(_fx);
  _fx.etapas = { ...et, [k]: !et[k] };
  desenharEtapas(); atualizarFicha();
}

function desenharControles() {
  const e = _fx, editar = pode('exames', 'editar');
  document.getElementById('fx-ctrl').innerHTML = `<div class="casc">
    ${e.origem === 'apoio' ? (e.vinculoApoio
      ? `<div class="casc-r"><div class="lft"><i class="fa-solid fa-handshake" style="color:var(--green)"></i><div>Valor negociado com o apoio<div class="s">automático: vinculado à tabela importada</div></div></div><span class="badge-s ok"><i class="fa-solid fa-lock"></i>sim</span></div>`
      : `<div class="casc-r"><div class="lft"><i class="fa-solid fa-handshake" style="color:${e.negociado ? 'var(--green)' : 'inherit'}"></i><div>Valor negociado com o apoio<div class="s">marcação manual (sem vínculo com tabela importada)</div></div></div>${chave(e.negociado, '_fx.negociado=!_fx.negociado;this.classList.toggle(\'on\')', !editar)}</div>`) : ''}
    <div class="casc-r"><div class="lft"><i class="fa-solid fa-rotate" style="color:var(--green)"></i><div>Valor atualizado no sistema<div class="s">automático: marcado quando o valor publicado bate com o sistema do laboratório</div></div></div>${chave(!valorDesatualizado(_fxId), 'atualizarSistemaFicha()', !editar || !valorDesatualizado(_fxId))}</div>
    <div class="casc-r"><div class="lft"><i class="fa-solid fa-plug-circle-xmark"></i><div>Fora do sistema do laboratório<div class="s">mnemônico não existe no catálogo</div></div></div>${chave(e.foraDoSistema, '_fx.foraDoSistema=!_fx.foraDoSistema;this.classList.toggle(\'on\');atualizarFicha()', !editar)}</div>
  </div>`;
}

// ── Histórico ─────────────────────────────────────────────────
async function carregarHistoricoExame(id) {
  const h = lista(await DB.ler(`historicoExames/${id}`), (a, b) => (b.em || 0) - (a.em || 0)).slice(0, 30);
  const el = document.getElementById('fx-hist');
  if (!el || _fxId !== id) return;
  el.innerHTML = h.length ? h.map(x => `<div class="hist-i"><div class="avatar" style="width:26px;height:26px;font-size:10px;background:${corAvatar(x.usuarioId || x.usuario)}">${esc(iniciais(x.usuario))}</div>
      <div><div>${esc(x.descricao)}</div>${x.justificativa ? `<div class="s"><i class="fa-solid fa-quote-left"></i> ${esc(x.justificativa)}</div>` : ''}<div class="t">${esc(x.usuario)} · ${dataHora(x.em)}</div></div></div>`).join('')
    : '<div class="muted" style="font-size:12.5px">Sem alterações registradas.</div>';
}

// ── Gravação ──────────────────────────────────────────────────
// Preços (praticado e outras tabelas) vão para o rascunho de cada tabela;
// quem aprova também pode publicar direto (uma proposta por tabela alterada).
// Os demais campos são gravados direto no exame.
const CAMPOS_FICHA = {
  custoTeste: v => `Custo do teste ${fmt(v[0])} → ${fmt(v[1])}`,
  reagenteId: v => v[1] ? `Reagente: ${ESTADO.reagentes[v[1]]?.nome || '—'}` : 'Reagente desvinculado',
  qtdReagente: v => `Testes por exame ${num(v[0] || 1, 3)} → ${num(v[1] || 1, 3)}`,
  vinculoApoio: v => v[1] ? `Vinculado ao item ${ESTADO.apoios[v[1].apoioId]?.precos?.[v[1].chave]?.codigo || ''} do apoio` : 'Vínculo com o apoio removido',
  extras: () => 'Custos adicionais alterados',
  etapas: () => 'Etapas do atendimento ajustadas',
  fixosAjuste: () => 'Custos fixos ajustados neste exame',
  negociado: v => v[1] ? 'Marcado como negociado' : 'Desmarcado como negociado',
  auditar: v => v[1] ? 'Marcado para auditoria' : 'Auditoria concluída',
  foraDoSistema: v => v[1] ? 'Marcado como fora do sistema' : 'Encontrado no sistema'
};

// modo: undefined (só dados) | 'dados' (só dados, ficha continua aberta com os preços pendentes) | 'rascunho' (preços no rascunho)
//   | 'confirmar' (preços no rascunho e abre o rascunho de exames para confirmar o envio) | 'publicar' (aprova e publica, com confirmação)
async function salvarFicha(modo) {
  const e = _fx, o = _fxOrig, k = _fxId;
  const mud = mudancasDadosFicha();
  const precos = modo === 'dados' ? [] : mudancasPrecoFicha(), desfeitos = modo === 'dados' ? [] : rascDesfeitosFicha(precos);
  if (modo === 'dados' && !mud.length) return;
  if (!mud.length && !precos.length && !desfeitos.length) { fecharGaveta(); return; }
  if (precos.some(m => m.para != null && !(m.para > 0))) return toast('Preço inválido', 'erro');
  if ((precos.length || desfeitos.length) && !modo) modo = 'rascunho';
  if (modo === 'publicar' && !pode('tabelas', 'aprovar')) return toast('Seu grupo não pode publicar preços', 'erro');
  if (precos.some(m => m.alvo === 'particular') && !pode('exames', 'editar')) return toast('Seu grupo não pode alterar o preço praticado', 'erro');
  if (precos.some(m => m.alvo !== 'particular') && !pode('tabelas', 'editar')) return toast('Seu grupo não pode alterar tabelas de preço', 'erro');
  // publicar: UniLab dos que ficam diferentes do sistema (nenhum: publica direto)
  const marcUni = modo === 'publicar' && precos.length ? await perguntarUnilab(precos.map(m => ({ alvo: m.alvo, k, mn: e.mn, para: m.para ?? null }))) : new Set();
  if (!marcUni) return;
  const u = usuarioAtual();

  // dados do exame (custos, controles…)
  if (mud.length) {
    const dados = { atualizadoEm: DB.agora(), atualizadoPor: u.nome };
    mud.forEach(c => { dados[c] = e[c] ?? null; });
    if (mud.includes('custoTeste')) dados.custoOrigem = e.custoTeste == null ? null : 'manual';
    if (mud.includes('vinculoApoio') && e.vinculoApoio) dados.negociado = true;
    if (mud.includes('extras')) dados.extras = e.extras.length ? e.extras : null;
    if (mud.includes('etapas')) dados.etapas = e.etapas && Object.keys(e.etapas).length ? e.etapas : null;
    await DB.mesclar(`${CAMINHOS.exames}/${k}`, dados);
    await DB.gravar(`historicoExames/${k}/${DB.novaChave('historicoExames')}`, {
      descricao: mud.map(c => CAMPOS_FICHA[c]([c === 'extras' ? extrasExame(o) : o[c], e[c]])).filter(Boolean).join(' · '),
      usuario: u.nome, usuarioId: u.id, em: DB.agora()
    });
  }
  if (modo === 'dados') {
    // o salvo passa a ser a base de comparação; preços editados seguem pendentes
    mud.forEach(c => { o[c] = JSON.parse(JSON.stringify(e[c] ?? null)); });
    atualizarFicha();
    return toast(`${e.mn}: dados salvos`);
  }

  // preços no rascunho de cada tabela (substitui o que já havia lá para este exame)
  if (modo === 'rascunho' || modo === 'confirmar') {
    for (const m of precos) {
      await carregarRascunho(m.alvo);
      definirRasc(ctxAlvo(m.alvo), k, m.para);
      await gravarRasc(m.alvo);
    }
    // valor devolvido ao publicado: sai do rascunho
    for (const a of desfeitos) { definirRasc(ctxAlvo(a), k, undefined); await gravarRasc(a); }
    // Enviar proposta: abre o rascunho de exames já neste exame, para conferir e confirmar
    if (modo === 'confirmar' && precos.length) return abrirRascunhoExames(k, (e.justificativa || '').trim());
    fecharGaveta();
    if (document.getElementById('gr-body')) desenharGrade();
    atualizarBotaoRascExames();
    return toast(precos.length ? `${e.mn}: ${precos.length} preço(s) no rascunho` : desfeitos.length ? `${e.mn}: retirado do rascunho` : `${e.mn} salvo`);
  }

  // preços: uma proposta por tabela
  const just = (e.justificativa || '').trim() || null, lote = precos.length > 1 ? DB.novaChave('propostas') : null;
  for (const m of precos) {
    const id = DB.novaChave('propostas');
    const p = { alvo: m.alvo, alvoNome: m.nome, itens: { [k]: { mn: e.mn, de: m.de ?? null, para: m.para ?? null, sistemaOk: marcUni.has(`${m.alvo}|${k}`) || null } }, n: 1,
      justificativa: just, autor: u.nome, autorId: u.id, em: Date.now(), status: 'pendente', origem: 'ficha', lote };
    await DB.gravar(`propostas/${id}`, { ...p, em: DB.agora() });
    if (modo === 'publicar') await aplicarProposta(id, p);
    else registrar('tabelas', `${m.nome}: proposta de preço de ${e.mn} enviada (ficha do exame)`, { proposta: id });
  }
  // publicado ou enviado: o rascunho deste exame deixa de valer
  for (const a of new Set([...precos.map(m => m.alvo), ...desfeitos])) { await carregarRascunho(a); definirRasc(ctxAlvo(a), k, undefined); await gravarRasc(a); }
  // publicado: a janela fecha de vez (sem voltar à proposta ou ao rascunho de onde a ficha foi aberta)
  if (modo === 'publicar' && precos.length) { _ppVolta = null; ppTirarFantasma(); }
  fecharGaveta();
  atualizarBotaoRascExames();
  toast(!precos.length ? `${e.mn} salvo` : modo === 'publicar' ? `${e.mn}: ${precos.length} preço(s) publicados` : `${e.mn}: ${precos.length} proposta(s) enviadas para aprovação`);
}

// Marcar "Valor atualizado no sistema": grava o valor publicado como preço do sistema
// Com id: chamada de fora da ficha (sino), sem gaveta aberta para redesenhar
async function atualizarSistemaFicha(id) {
  const k = id || _fxId, ds = divergenciasSistema(k);
  if (!ds.length) return;
  const v = x => x != null ? fmt(x) : 'fora', e = ESTADO.exames[k];
  const ok = await confirmar({ titulo: 'Atualizar a tabela do sistema?', icone: 'fa-database', botao: 'Atualizar sistema',
    texto: `<span class="modal-ex"><b>${esc(e.mn)}</b><span>${esc(e.descricao || '(sem descrição)')}</span></span>Confirme que o valor já foi lançado no sistema do laboratório. A tabela do sistema <b>no banco de dados</b> passa a ter o valor publicado:`
      + `<span class="fx-conf">${ds.map(d => `<span><b>${esc(d.nome)}</b><i>${v(d.sist)} → <b>${v(d.salvo)}</b></i></span>`).join('')}</span>` });
  if (ok !== true) return id ? undefined : atualizarFicha();
  const u = usuarioAtual(), upd = {};
  ds.forEach(d => { upd[caminhoSistema(d.alvo, k)] = d.salvo; });
  upd[`historicoExames/${k}/${DB.novaChave('historicoExames')}`] = { descricao: `Sistema atualizado: ${ds.map(d => `${d.nome} ${v(d.sist)} → ${v(d.salvo)}`).join(' · ')}`, usuario: u.nome, usuarioId: u.id, em: DB.agora() };
  await DB.mesclar('/', upd);
  toast('Tabela do sistema atualizada');
}

async function excluirExame() {
  const e = ESTADO.exames[_fxId];
  const ok = await confirmar({ titulo: `Excluir ${e.mn}?`, texto: 'O exame sai de todas as tabelas. Para apenas esconder, marque como inativo em "Dados do exame".', botao: 'Excluir', perigo: true });
  if (!ok) return;
  await DB.remover(`${CAMINHOS.exames}/${_fxId}`);
  registrar('exames', `Exame ${e.mn} excluído`, { antes: e });
  fecharGaveta();
  toast(`${e.mn} excluído`);
}

// ── Dados do exame (novo / editar cadastro) ───────────────────
let _dx = null;
function abrirDadosExame(id) {
  const e = id ? ESTADO.exames[id] : null;
  _dx = { id: id || null, setorId: e?.setorId || '', origem: e?.origem || origemLembrada(), ativo: e ? e.ativo !== false : true, negociado: false, auditar: false, fora: false, checks: { site: false, unilab: false, revisado: false },
    mnUlt: '', mnDup: null, auto: {}, anexos: [], anexosAuto: false };
  const novo = !id;
  // Exame novo: instrução cadastrada junto (catálogo de instruções)
  const comIns = !id && pode('instrucoes', 'editar');
  if (comIns) garantirCatalogo();
  abrirGaveta({
    sobre: id ? e.mn : 'Novo exame', titulo: id ? 'Dados do exame' : 'Cadastrar exame',
    corpo: `<div class="form-col">
      <div class="fgrid sem-pad" ${novo ? 'style="grid-template-columns:1.2fr 1fr 1fr"' : ''}>
        ${id ? campo('dx-mn', 'Mnemônico', e.mn, { tipo: 'text', desab: true, dica: 'não pode ser alterado' })
          : `<div class="field"><label for="dx-mn">Mnemônico</label><div class="inp" id="dx-mn-w"><input id="dx-mn" class="txt" type="text" placeholder="Ex.: GLI" autocomplete="off"
              onblur="verificarMnDx()" onkeydown="if(event.key==='Enter'){event.preventDefault();verificarMnDx()}"></div>
            <span class="hint" id="dx-mn-hint">igual ao do sistema · conferido ao sair do campo</span></div>`}
        ${novo ? campo('dx-custo', 'Custo do teste', '', { pre: 'R$', moeda: true, ph: '0,00', dica: 'manual', aoMudar: 'previaDadosExame()' }) : ''}
        ${campo('dx-preco', 'Preço praticado', e?.precoPraticado ?? '', { pre: 'R$', moeda: true, ph: '0,00', desab: !!id, dica: id ? 'altere na ficha' : '', aoMudar: novo ? 'previaDadosExame()' : '' })}
      </div>
      ${novo ? `<div class="dx-prev" id="dx-calc"></div>` : ''}
      ${campo('dx-desc', 'Nome do exame', e?.descricao || '', { tipo: 'text', ph: 'Ex.: Glicose' })}
      <div class="field"><label>Setor</label><div id="pop-dxsetor" class="block"></div></div>
      <div class="field"><label>Origem</label><div class="opt-cards" id="dx-origem">
        ${[['interno', 'Interno', 'Executado no LAMIC', 'fa-microscope'], ['apoio', 'Apoio', 'Enviado a laboratório de apoio', 'fa-truck-medical']].map(([v, t, d, ic]) =>
          `<button type="button" class="oc ${_dx.origem === v ? 'on' : ''}" data-v="${v}" onclick="_dx.origem='${v}';lembrarOrigem();marcarOc('dx-origem', this);atualizarControlesDx()"><span class="po-ic"><i class="fa-solid ${ic}"></i></span><span><b>${t}</b><small>${d}</small></span><i class="fa-solid fa-circle-check ck"></i></button>`).join('')}</div></div>
      <div class="fgrid sem-pad" style="grid-template-columns:2fr 1fr">
        ${campo('dx-mat', 'Material', e?.material || '', { tipo: 'text', ph: 'Ex.: Soro' })}
        ${campo('dx-dias', 'Prazo (dias)', (id ? diasPrazo(id) : null) ?? '', { passo: '1', ph: 'Ex.: 2', dica: '0 = 24 Horas' })}
      </div>
      ${comIns ? `<div class="field"><label style="display:flex;align-items:center"><i class="fa-solid fa-book-medical"></i>Instrução do exame<button type="button" class="btn sm" style="margin-left:auto" onclick="copiarPromptInstrucao()" title="Copia o prompt de IA que formata a instrução no padrão do catálogo"><i class="fa-solid fa-copy"></i>Copiar prompt</button></label>
        <textarea id="dx-ins" class="txt-grande" style="min-height:170px" placeholder="Jejum, preparo, coleta, conservação, critérios de rejeição…"></textarea>
        <div class="dx-checks" id="dx-checks"></div>
        <span class="hint" id="dx-cat-hint">Vai para o catálogo de instruções. Opcional.</span></div>
      <div class="field"><label><i class="fa-solid fa-paperclip"></i>Anexos</label><div id="dx-anexos"></div>
        <span class="hint">Links (Drive, PDF, formulário) da instrução do exame: aparecem clicáveis para os laboratórios apoiados no L2L.</span></div>` : ''}
      ${novo ? '<div class="sec-t"><i class="fa-solid fa-sliders"></i>Controles</div>' : ''}
      <div class="casc">
        ${novo ? `<div class="casc-r" id="dx-neg-r"><div class="lft"><i class="fa-solid fa-handshake" style="color:var(--green)"></i><div>Valor negociado com o apoio<div class="s">cadastra o item na tabela do apoio, com o custo informado, e vincula o exame</div></div></div>${chave(false, '_dx.negociado=!_dx.negociado;this.classList.toggle(\'on\');atualizarControlesDx()')}</div>
        <div id="dx-neg-campos" class="dx-neg" style="display:none">
          <div class="fgrid sem-pad" style="grid-template-columns:1fr 2fr">
            ${campo('dx-ap-cod', 'Mnemônico no apoio', '', { tipo: 'text', ph: 'Código no apoio' })}
            ${campo('dx-ap-desc', 'Nome no apoio', '', { tipo: 'text', ph: 'Descrição na tabela do apoio' })}
          </div>
          <div class="hint" id="dx-neg-hint"></div>
        </div>
        <div class="casc-r"><div class="lft"><i class="fa-solid fa-plug-circle-xmark"></i><div>Fora do sistema do laboratório<div class="s">mnemônico não existe no catálogo</div></div></div>${chave(false, '_dx.fora=!_dx.fora;this.classList.toggle(\'on\')')}</div>` : ''}
        <div class="casc-r"><div class="lft"><i class="fa-solid fa-eye"></i><div>Exame ativo<div class="s">inativo sai das listas e das tabelas</div></div></div>${chave(_dx.ativo, '_dx.ativo=!_dx.ativo;this.classList.toggle(\'on\')')}</div></div>
    </div>`,
    rodape: `<button class="btn" onclick="${id ? `abrirFicha('${id}')` : 'fecharGaveta()'}">${id ? '<i class="fa-solid fa-arrow-left"></i>Voltar' : 'Cancelar'}</button>
      <button class="btn pri" id="dx-salvar" onclick="gravarDadosExame()"><i class="fa-solid fa-floppy-disk"></i>Salvar</button>`
  });
  criarPop('pop-dxsetor', {
    rotulo: 'Setor', titulo: 'Setor do exame', icone: 'fa-sitemap', busca: 'Buscar setor…', padrao: '',
    opcoes: () => opcoesSetorPop('Sem setor'),
    aoMudar: v => {
      _dx.setorId = v;
      const cat = ESTADO.setores[v]?.categoria;   // apoio → origem apoio
      if (cat) { _dx.origem = cat === 'apoio' ? 'apoio' : 'interno'; marcarOc('dx-origem', document.querySelector(`#dx-origem .oc[data-v="${_dx.origem}"]`)); }
      atualizarControlesDx();
    }
  });
  POPS['pop-dxsetor'].valor = _dx.setorId; desenharBotaoPop('pop-dxsetor');
  atualizarControlesDx();
  desenharChecksDx();
  desenharAnexosDx();
}

// Mnemônico conferido ao sair do campo (Tab, clique fora) ou no Enter, não a cada tecla.
// Já cadastrado → bloqueia o Salvar. Mudou → os campos preenchidos pelo catálogo acompanham.
function verificarMnDx() {
  if (!_dx || _dx.id || !document.getElementById('dx-mn')) return;
  const mn = valorCampo('dx-mn').trim();
  if (mn === _dx.mnUlt) return;
  _dx.mnUlt = mn;
  const dup = mn ? lista(ESTADO.exames).find(x => String(x.mn || '').toUpperCase() === mn.toUpperCase()) : null;
  _dx.mnDup = dup ? dup.id : null;
  document.getElementById('dx-mn-w')?.classList.toggle('erro', !!dup);
  const hint = document.getElementById('dx-mn-hint'), bt = document.getElementById('dx-salvar');
  if (hint) hint.innerHTML = dup
    ? `<span class="dx-mn-dup"><i class="fa-solid fa-ban"></i> Já existe o exame <b>${esc(dup.mn)}</b>${dup.descricao ? ` (${esc(dup.descricao)})` : ''}: use outro mnemônico · <a href="#" onclick="abrirFicha('${esc(dup.id)}');return false">abrir ficha</a></span>`
    : 'igual ao do sistema · conferido ao sair do campo';
  if (bt) { bt.disabled = !!dup; bt.title = dup ? 'Mnemônico já cadastrado' : ''; }
  preencherDoCatalogo();
}

// Cadastro novo: "negociado" só vale para apoio; prévia de custo e margem
function atualizarControlesDx() {
  const r = document.getElementById('dx-neg-r');
  if (r) r.style.display = _dx.origem === 'apoio' ? '' : 'none';
  // negociado: item manual na tabela do apoio (mnemônico e nome sugeridos a partir do exame)
  const cp = document.getElementById('dx-neg-campos');
  if (cp) {
    const mostra = _dx.origem === 'apoio' && _dx.negociado, setor = ESTADO.setores[_dx.setorId], apoio = setor?.categoria === 'apoio';
    cp.style.display = mostra ? '' : 'none';
    if (mostra) {
      const cod = document.getElementById('dx-ap-cod'), nome = document.getElementById('dx-ap-desc');
      if (!cod.value) cod.value = valorCampo('dx-mn').trim();
      if (!nome.value) nome.value = valorCampo('dx-desc').trim();
      document.getElementById('dx-neg-hint').innerHTML = apoio
        ? `<i class="fa-solid fa-circle-info"></i> O "Custo do teste" informado acima entra na tabela de <b>${esc(setor.nome)}</b> como item manual.`
        : '<i class="fa-solid fa-triangle-exclamation" style="color:var(--amber)"></i> Escolha no campo Setor o laboratório de apoio que recebe este item.';
    }
  }
  previaDadosExame();
}
function previaDadosExame() {
  const el = document.getElementById('dx-calc');
  if (!el) return;
  const custo = numCampo('dx-custo'), preco = numCampo('dx-preco');
  if (!(custo >= 0)) { el.innerHTML = ''; return; }
  const c = calcular({ setorId: _dx.setorId || null, origem: _dx.origem, custoTeste: custo, precoPraticado: preco > 0 ? preco : null });
  const cor = c.margem != null ? STATUS[c.status].cor : 'var(--text-muted)';
  const bloco = (ic, rot, v, s, estilo = '') => `<div class="dp" ${estilo}><span class="dp-l"><i class="fa-solid ${ic}"></i>${rot}</span><b class="dp-v">${v}</b><span class="dp-s">${s}</span></div>`;
  el.innerHTML = bloco('fa-calculator', 'Custo total', fmt(c.custo), 'com custos fixos do setor')
    + bloco('fa-tag', 'Preço sugerido', c.sugerido != null ? fmt(c.sugerido) : '—', preco > 0 && c.sugerido != null ? `praticado ${preco >= c.sugerido ? 'acima' : 'abaixo'} do sugerido` : 'pela margem alvo')
    + bloco('fa-chart-simple', 'Margem', c.margem != null ? pct(c.margem) : '—', c.margem != null ? `lucro ${fmt(c.lucro)}` : 'informe o preço', `style="--c:${cor}"`)
    + `<div class="dp-acts"><div class="dp-top"><span class="dp-l"><i class="fa-solid fa-wand-magic-sparkles"></i>Precificar</span>
          <span class="dp-arr" title="Arredonda o preço dos botões Piso e Alvo ao múltiplo mais próximo; para baixo só se a margem não sair da tolerância"><span class="dp-arr-l">Arredondar</span>${ARRED_DX.map(a => `<button type="button" class="${a === arredDx() ? 'on' : ''}" onclick="definirArredDx(${a})">R$ ${a},00</button>`).join('')}</span></div>
        ${btnPrecificarDx('fa-shield-halved', 'Piso', precoArredDx(c, 'piso'), c.min, preco)}${btnPrecificarDx('fa-bullseye', 'Alvo', precoArredDx(c, 'alvo'), c.alvo, preco)}</div>`;
}
// Arredondamento dos preços de piso e alvo (múltiplo mais próximo, ver precoArredDx): múltiplos de R$ 1, 5, 10 ou 100; a escolha fica lembrada neste navegador
const ARRED_DX = [1, 5, 10, 100];
function arredDx() {
  let a = 1;
  try { a = +localStorage.getItem('prec-arred-exame'); } catch (e) {}
  return ARRED_DX.includes(a) ? a : 1;
}
// Preço de piso ou alvo arredondado ao múltiplo mais próximo: para baixo só quando a margem continua
// dentro da tolerância da Particular (alvo) ou no mínimo (piso); senão, para cima
function precoArredDx(c, tipo, a = arredDx()) {
  const m = tipo === 'piso' ? c.min : c.alvo, div = 1 - parametro('imposto') - m;
  if (c.custo == null || m == null || div <= 0) return null;
  const exato = c.custo / div, cima = Math.ceil(exato / a - 1e-9) * a, baixo = Math.floor(exato / a + 1e-9) * a;
  const tol = tipo === 'alvo' ? ESTADO.particular?.tolerancia || 0 : 0;
  const ok = baixo > 0 && 1 - parametro('imposto') - c.custo / baixo >= m - tol - 1e-9;
  return ok && exato - baixo <= cima - exato ? baixo : cima;
}
function definirArredDx(a) {
  const antes = arredDx(), preco = numCampo('dx-preco'), custo = numCampo('dx-custo'), el = document.getElementById('dx-preco');
  try { localStorage.setItem('prec-arred-exame', a); } catch (e) {}
  // preço que veio de um dos botões acompanha o novo arredondamento
  if (el && preco > 0 && custo >= 0) {
    const c = calcular({ setorId: _dx.setorId || null, origem: _dx.origem, custoTeste: custo, precoPraticado: null });
    const tipo = ['alvo', 'piso'].find(t => precoArredDx(c, t, antes) === preco);
    if (tipo) el.value = fmtMoedaCampo(precoArredDx(c, tipo, a));
  }
  previaDadosExame();
}
// Botão que preenche o preço praticado com o valor que dá a margem mínima (piso) ou a margem alvo
function btnPrecificarDx(ic, rot, valor, margem, preco) {
  if (valor == null) return '';
  return `<button type="button" class="btn sm ${preco === valor ? 'pri' : ''}" onclick="precificarDx(${valor})" title="Preenche o preço praticado: margem de ${pct(margem)}"><i class="fa-solid ${ic}"></i>${rot} · ${fmt(valor)} <span class="dp-m">${pct(margem)}</span></button>`;
}
function precificarDx(valor) {
  const el = document.getElementById('dx-preco');
  if (!el) return;
  el.value = fmtMoedaCampo(valor);
  previaDadosExame();
}

// Checklist de publicação (compacto) no cadastro do exame: Site · Unilab · Revisado
function desenharChecksDx() {
  const el = document.getElementById('dx-checks');
  if (!el) return;
  el.innerHTML = Object.entries(CHECKS).map(([k, c]) => {
    const desab = !pode('instrucoes', c.acao);
    return `<div class="dx-ck" title="${c.nome === 'Revisado' ? 'Instrução revisada' : 'Publicado no ' + c.nome}${desab ? ' · sem permissão' : ''}">
      <span><i class="fa-solid ${c.icone}"></i>${c.nome}</span>${chave(_dx.checks[k], `_dx.checks['${k}']=!_dx.checks['${k}'];this.classList.toggle('on')`, desab)}</div>`;
  }).join('');
}

// Mnemônico no catálogo de instruções → preenche os campos vazios. Trocar o mnemônico troca também
// o que veio do catálogo anterior (_dx.auto: campo → valor preenchido); o que foi digitado à mão fica.
function preencherDoCatalogo() {
  const hint = document.getElementById('dx-cat-hint');
  if (!hint) return;
  const mn = valorCampo('dx-mn').trim(), r = mn ? ESTADO.catalogo?.[chaveExame(mn)] : null;
  const encher = (id, v) => {
    const el = document.getElementById(id);
    if (!el) return;
    const atual = el.value.trim(), auto = id in _dx.auto;
    if (atual && !(auto && atual === _dx.auto[id])) { delete _dx.auto[id]; return; }   // digitado à mão
    const nv = v != null && v !== '' ? String(v) : '';
    el.value = nv;
    if (nv) _dx.auto[id] = nv; else delete _dx.auto[id];
  };
  encher('dx-desc', r?.nome); encher('dx-mat', r?.material); encher('dx-dias', r?.prazoDias); encher('dx-ins', r?.instrucao);
  if (r || _dx.auto.checks) {
    Object.keys(CHECKS).forEach(k => { _dx.checks[k] = !!r?.[k]; });
    _dx.auto.checks = !!r;
    if (!r) delete _dx.auto.checks;
    desenharChecksDx();
  }
  // anexos da instrução: entram se a lista está vazia ou ainda é a que veio do catálogo
  if (!_dx.anexos.some(a => a.nome || a.url) || _dx.anexosAuto) {
    _dx.anexos = anexosDe(r).map(a => ({ nome: a.nome || '', url: a.url || '' }));
    _dx.anexosAuto = _dx.anexos.length > 0;
    desenharAnexosDx();
  }
  hint.innerHTML = r ? `<i class="fa-solid fa-circle-check" style="color:var(--green)"></i> ${esc(r.mn)} já está no catálogo${r.revisado ? ' (instrução revisada)' : ''}: campos preenchidos${anexosDe(r).length ? `, com ${anexosDe(r).length} anexo(s)` : ''}.`
    : 'Vai para o catálogo de instruções. Opcional.';
}

// Anexos da instrução no cadastro (links nome + URL, como no editor de instruções)
function desenharAnexosDx() {
  const el = document.getElementById('dx-anexos');
  if (!el) return;
  el.innerHTML = _dx.anexos.map((a, i) => `<div class="anx-r">
      <div class="inp"><span class="pre"><i class="fa-solid fa-tag"></i></span><input class="txt" value="${esc(a.nome)}" placeholder="Nome do anexo" oninput="_dx.anexos[${i}].nome=this.value;_dx.anexosAuto=false"></div>
      <div class="inp"><span class="pre"><i class="fa-solid fa-link"></i></span><input class="txt" value="${esc(a.url)}" placeholder="https://…" oninput="_dx.anexos[${i}].url=this.value;_dx.anexosAuto=false"></div>
      ${urlValida(a.url) ? `<a class="icon-btn" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer" title="Abrir o link"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : ''}
      <button type="button" class="icon-btn" title="Remover anexo" onclick="_dx.anexos.splice(${i},1);_dx.anexosAuto=false;desenharAnexosDx()"><i class="fa-solid fa-trash"></i></button></div>`).join('')
    + `<div class="anx-ac"><button type="button" class="btn sm" id="dx-anx-add" onclick="adicionarAnexoDx()"><i class="fa-solid fa-plus"></i>Adicionar anexo</button></div>`;
}
function adicionarAnexoDx() {
  _dx.anexos.push({ nome: '', url: '' });
  _dx.anexosAuto = false;
  desenharAnexosDx();
  [...document.querySelectorAll('#dx-anexos .anx-r')].pop()?.querySelector('input')?.focus();
}
// Anexos preenchidos e válidos → lista limpa; link inválido → mensagem de erro
function anexosValidosDx() {
  const anexos = _dx.anexos.map(a => ({ nome: String(a.nome || '').trim(), url: String(a.url || '').trim() })).filter(a => a.nome || a.url);
  const ruim = anexos.find(a => !urlValida(a.url));
  if (ruim) return { erro: `Anexo ${ruim.nome || 'sem nome'}: o link precisa começar com http:// ou https://` };
  anexos.forEach(a => { a.nome ||= 'Anexo'; });
  return { anexos };
}

// Grava nome, material, prazo e instrução no catálogo (mantém o checklist de publicação)
async function gravarCatalogoNovoExame(id, mn, nome) {
  if (!pode('instrucoes', 'editar') || !document.getElementById('dx-ins')) return;
  const r = ESTADO.catalogo?.[id] || await DB.ler(`catalogo/${id}`) || {};
  const instrucao = valorCampo('dx-ins').trim() || null, dias = parseInt(valorCampo('dx-dias'), 10);
  const material = valorCampo('dx-mat').trim() || null;
  const marcou = Object.keys(CHECKS).some(k => _dx.checks[k] !== !!r[k]), anexos = anexosValidosDx().anexos || [];
  if (!instrucao && !material && isNaN(dias) && !r.mn && !marcou && !anexos.length) return;
  const u = usuarioAtual(), dados = { mn, cadastro: true, nome: r.nome || nome, material: material ?? r.material ?? null, prazo: isNaN(dias) ? (r.prazo ?? null) : null,
    prazoDias: isNaN(dias) ? (r.prazoDias ?? null) : Math.max(0, dias), instrucao: r.instrucao ?? null, anexos: anexos.length ? anexos : null, atualizadoEm: DB.agora(), atualizadoPor: u.nome };
  // texto digitado vai para os campos por categoria (secoes.js)
  if (instrucao && instrucao !== (r.instrucao || '')) Object.assign(dados, dadosInstrucao(instrucao));
  // texto diferente do revisado → volta a precisar de revisão
  if (r.revisado && (dados.instrucao || '') !== (r.instrucao || '')) Object.assign(dados, { revisado: false, revisadoPor: null, revisadoEm: null });
  // checklist de publicação marcado no cadastro (quem marcou e quando)
  Object.entries(CHECKS).forEach(([k, c]) => {
    const v = _dx.checks[k];
    if (!pode('instrucoes', c.acao) || !!r[k] === v) return;
    Object.assign(dados, { [k]: v, [`${k}Por`]: v ? u.nome : null, [`${k}Em`]: v ? DB.agora() : null });
  });
  await DB.mesclar(`catalogo/${id}`, dados);
  if (ESTADO.catalogo) ESTADO.catalogo[id] = { ...r, ...dados, atualizadoEm: Date.now() };   // a ficha abre em seguida
}

async function gravarDadosExame() {
  const desc = valorCampo('dx-desc').trim();
  if (!desc) return toast('Informe o nome do exame', 'erro');
  const dias = parseInt(valorCampo('dx-dias'), 10);
  const dados = { descricao: desc, setorId: _dx.setorId || null, origem: _dx.origem, ativo: _dx.ativo,
    material: valorCampo('dx-mat').trim() || null, prazoDias: isNaN(dias) ? null : Math.max(0, dias), atualizadoEm: DB.agora(), atualizadoPor: usuarioAtual().nome };
  let id = _dx.id, modoPreco = null, justProposta = "";
  if (!id) {
    verificarMnDx();
    const mn = valorCampo('dx-mn').trim();
    if (!mn) return toast('Informe o mnemônico', 'erro');
    id = chaveExame(mn);
    if (ESTADO.exames[id] || _dx.mnDup) return toast(`Já existe o exame ${mn}: use outro mnemônico`, 'erro');
    const anx = document.getElementById('dx-anexos') ? anexosValidosDx() : {};
    if (anx.erro) return toast(anx.erro, 'erro');
    const preco = numCampo('dx-preco');
    const custo = numCampo('dx-custo');
    if (!isNaN(custo) && custo < 0) return toast('Custo do teste inválido', 'erro');
    // preço praticado: janela para escolher entre proposta (padrão) e publicar direto
    if (preco > 0) {
      const esc = await escolherModoPrecoDx(preco, custo >= 0 && calcular({ setorId: _dx.setorId || null, origem: _dx.origem, custoTeste: custo }, preco).status === 'r');
      if (!esc) return;
      modoPreco = esc.modo; justProposta = esc.just;
    }
    // valor negociado: o custo vira item manual da tabela do apoio e o exame já nasce vinculado a ele
    let itemApoio = null;
    if (_dx.origem === 'apoio' && _dx.negociado) {
      const setor = ESTADO.setores[_dx.setorId];
      if (setor?.categoria !== 'apoio') return toast('Valor negociado: escolha o setor do laboratório de apoio', 'erro');
      if (!(custo >= 0)) return toast('Valor negociado: informe o custo do teste', 'erro');
      const cod = valorCampo('dx-ap-cod').trim() || mn, k = chaveItemApoio(cod, '');
      if (ESTADO.apoios[_dx.setorId]?.precos?.[k]) return toast(`O item ${cod} já existe na tabela de ${setor.nome}: desmarque "negociado" e vincule pela ficha`, 'erro');
      itemApoio = { k, item: { codigo: cod, material: '', descricao: valorCampo('dx-ap-desc').trim() || desc, preco: Math.round(custo * 100) / 100, vigencia: hojeISO(), manual: true, desde: Date.now(), criadoPor: usuarioAtual().nome } };
      dados.vinculoApoio = { apoioId: _dx.setorId, chave: k };
    }
    Object.assign(dados, { mn, precoPraticado: modoPreco === 'publicar' ? preco : null, criadoEm: DB.agora(),
      custoTeste: custo >= 0 ? Math.round(custo * 100) / 100 : null, custoOrigem: custo >= 0 ? 'manual' : null,
      negociado: _dx.origem === 'apoio' && _dx.negociado ? true : null, auditar: _dx.auditar || null, foraDoSistema: _dx.fora || null });
    await DB.gravar(`${CAMINHOS.exames}/${id}`, dados);
    if (itemApoio) {
      await DB.gravar(`${CAMINHOS.apoios}/${_dx.setorId}/precos/${itemApoio.k}`, itemApoio.item);
      registrar('apoios', `${ESTADO.setores[_dx.setorId].nome}: item ${itemApoio.item.codigo} cadastrado manualmente (${fmt(itemApoio.item.preco)}) no cadastro do exame ${mn}`);
    }
    await gravarCatalogoNovoExame(id, mn, desc);
    if (modoPreco === 'proposta') {
      const u = usuarioAtual(), pid = DB.novaChave('propostas');
      await DB.gravar(`propostas/${pid}`, { alvo: 'particular', alvoNome: 'Particular', itens: { [id]: { mn, de: null, para: Math.round(preco * 100) / 100 } }, n: 1,
        justificativa: justProposta || 'Exame recém criado', autor: u.nome, autorId: u.id, em: DB.agora(), status: 'pendente', origem: 'cadastro' });
      registrar('tabelas', `Particular: proposta de preço do exame novo ${mn} enviada (cadastro)`, { proposta: pid });
    }
  } else {
    // prazo em dias substitui o texto antigo, no exame e no catálogo de instruções
    if (dados.prazoDias != null) {
      dados.prazo = null;
      const c = ESTADO.catalogo?.[id] ?? await DB.ler(`catalogo/${id}`);
      if (c) {
        await DB.mesclar(`catalogo/${id}`, { prazoDias: dados.prazoDias, prazo: null });
        if (ESTADO.catalogo?.[id]) Object.assign(ESTADO.catalogo[id], { prazoDias: dados.prazoDias, prazo: null });
      }
    } else delete dados.prazoDias;
    await DB.mesclar(`${CAMINHOS.exames}/${id}`, dados);
  }
  await DB.gravar(`historicoExames/${id}/${DB.novaChave('historicoExames')}`, {
    descricao: _dx.id ? 'Dados do exame alterados' : `Exame cadastrado${modoPreco === 'publicar' ? ` · preço ${fmt(numCampo('dx-preco'))} publicado` : modoPreco === 'proposta' ? ` · preço ${fmt(numCampo('dx-preco'))} enviado para aprovação` : ''}`, usuario: usuarioAtual().nome, usuarioId: usuarioAtual().id, em: DB.agora()
  });
  ESTADO.exames[id] = { ...(ESTADO.exames[id] || {}), ...dados, ...(dados.atualizadoEm ? { atualizadoEm: Date.now() } : {}) };
  toast(_dx.id ? 'Dados salvos' : modoPreco === 'proposta' ? 'Exame cadastrado · preço enviado para aprovação' : 'Exame cadastrado');
  if (modoPreco === 'proposta') fecharGaveta();   // proposta enviada: cadastro encerrado
  else abrirFicha(id);
}

// Exame novo com preço praticado: aviso e escolha entre enviar como proposta (padrão) ou publicar direto (só quem aprova).
// → { modo: 'proposta' | 'publicar', just } | null (voltou sem escolher)
function escolherModoPrecoDx(preco, abaixoPiso) {
  return new Promise(resolve => {
    const aprova = pode('tabelas', 'aprovar'), m = document.getElementById('modal');
    let modo = 'proposta';
    const oc = (v, t, d, ic, ok) => `<button type="button" class="oc ${v === modo ? 'on' : ''}" data-v="${v}" ${ok ? '' : 'disabled'}><span class="po-ic"><i class="fa-solid ${ic}"></i></span><span><b>${t}</b><small>${d}</small></span><i class="fa-solid fa-circle-check ck"></i></button>`;
    m.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true">
        <button class="modal-x" data-x title="Fechar"><i class="fa-solid fa-xmark"></i></button>
        <div class="modal-ic pausa"><i class="fa-solid fa-tag"></i></div>
        <h3>Preço praticado de ${fmt(preco)}</h3>
        <p>Como o preço da Particular deste exame novo passa a valer?
          ${abaixoPiso ? '<span class="modal-li"><span style="color:var(--red)"><i class="fa-solid fa-circle-xmark" style="color:var(--red)"></i>Preço abaixo da margem mínima</span></span>' : ''}</p>
        <div class="opt-cards dx-pmodo" id="dx-pmodo">
          ${oc('proposta', 'Enviar como proposta', 'Vale depois da aprovação; até lá o exame fica sem preço', 'fa-paper-plane', true)}
          ${oc('publicar', 'Publicar direto', aprova ? 'Vale na hora, sem revisão de outra pessoa' : 'Só para quem aprova preços', 'fa-stamp', aprova)}</div>
        <div class="modal-acoes"><button class="btn" data-r="0">Voltar</button><button class="btn pri" data-r="1"><i class="fa-solid fa-paper-plane"></i>Enviar proposta</button></div>
      </div>`;
    // comentário opcional da proposta: balão abre o campo
    m.querySelector('.modal-acoes').insertAdjacentHTML('afterbegin', `<button type="button" class="btn" id="dx-pbal" title="Comentário da proposta"><i class="fa-solid fa-comment"></i></button>`);
    m.querySelector('.modal-acoes').insertAdjacentHTML('beforebegin', `<textarea id="dx-pjust" rows="2" placeholder="Comentário da proposta (opcional)" style="display:none;width:100%;margin-top:10px;padding:8px 10px;border:1px solid var(--line,#ddd);border-radius:8px;font:inherit;resize:vertical">Exame recém criado</textarea>`);
    const bal = m.querySelector('#dx-pbal'), just = m.querySelector('#dx-pjust');
    bal.onclick = () => { just.style.display = just.style.display === 'none' ? '' : 'none'; if (just.style.display === '') just.focus(); };
    m.classList.add('open');
    const ok = m.querySelector('[data-r="1"]');
    m.querySelectorAll('#dx-pmodo .oc').forEach(b => b.onclick = () => {
      modo = b.dataset.v;
      marcarOc('dx-pmodo', b);
      bal.style.display = modo === 'proposta' ? '' : 'none';
      if (modo !== 'proposta') just.style.display = 'none';
      ok.innerHTML = modo === 'publicar' ? '<i class="fa-solid fa-stamp"></i>Publicar sem revisão' : '<i class="fa-solid fa-paper-plane"></i>Enviar proposta';
    });
    const fim = r => { m.classList.remove('open'); document.removeEventListener('keydown', tecla); resolve(r); };
    const tecla = e => { if (e.key === 'Escape' && e.target !== just) fim(null); };
    m.querySelector('[data-r="0"]').onclick = () => fim(null);
    m.querySelector('[data-x]').onclick = () => fim(null);
    ok.onclick = () => fim({ modo, just: modo === 'proposta' ? just.value.trim() : '' });
    m.onclick = e => { if (e.target === m) fim(null); };
    document.addEventListener('keydown', tecla);
    ok.focus();
  });
}

// Origem escolhida ao cadastrar um exame: fica lembrada neste navegador para os próximos cadastros
function origemLembrada() {
  try { return localStorage.getItem('prec-origem-exame') === 'apoio' ? 'apoio' : 'interno'; } catch (e) { return 'interno'; }
}
function lembrarOrigem() {
  if (_dx.id) return;                               // só no cadastro de exame novo
  try { localStorage.setItem('prec-origem-exame', _dx.origem); } catch (e) {}
}
