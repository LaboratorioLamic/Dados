// ═══════════════════════════════════════════════════════════════
// reagentes.js — Reagentes, calibradores e controles (Custos → Reagentes)
// custo por teste = (preço do kit + calibrador + controle) ÷ testes úteis
// testes úteis   = testes × (1 − perdas) − testes de calibração − testes de CQ − outros
// (regras em detalheReagente, calc.js)
// ═══════════════════════════════════════════════════════════════

let buscaReag = '', reagVista = 'reag';

const examesDoReagente = id => lista(ESTADO.exames).filter(e => e.reagenteId === id);
const reagentesDoCq = id => lista(ESTADO.reagentes, porNome).filter(r => r.calId === id || r.ctrlId === id);
const TIPO_CQ = {
  cal:  { nome: 'Calibrador', icone: 'fa-scale-balanced', cor: 'var(--amber)', uso: 'calibração', usos: 'calibrações' },
  ctrl: { nome: 'Controle',   icone: 'fa-shield-halved',  cor: 'var(--green)', uso: 'corrida',    usos: 'corridas' }
};

function htmlReagentes() {
  const cq = reagVista === 'cq';
  return `<div class="card">
    <div class="toolbar">
      <div class="seg"><button class="${cq ? '' : 'on'}" onclick="reagVista='reag';renderCustos()"><i class="fa-solid fa-vials"></i>Reagentes</button>
        <button class="${cq ? 'on' : ''}" onclick="reagVista='cq';renderCustos()"><i class="fa-solid fa-scale-balanced"></i>Calibradores e controles</button></div>
      <div class="search"><i class="fa-solid fa-magnifying-glass"></i><input id="q-reag" value="${esc(buscaReag)}" placeholder="Buscar ${cq ? 'calibrador ou controle' : 'reagente'} ou fornecedor…" oninput="buscaReag=this.value;desenharReagentes()"></div>
      <span class="formula"><i class="fa-solid fa-calculator"></i>${cq ? 'custo por uso = preço ÷ rendimento ÷ reagentes que compartilham'
        : 'custo/teste = (kit + calibrador + controle) ÷ (testes × (1 − perdas) − calibração − CQ)'}</span>
    </div>
    <div class="tbl-wrap"><table><thead>${cq
      ? '<tr><th>Calibrador / controle</th><th>Tipo</th><th class="num">Preço</th><th class="num">Níveis</th><th class="num">Rende</th><th class="num">Custo/uso</th><th class="num">Reagentes</th><th>Atualizado</th></tr>'
      : '<tr><th>Reagente / insumo</th><th class="num">Preço kit</th><th class="num">Testes</th><th class="num">Perdas</th><th class="num">Úteis</th><th class="num">Calib. + CQ</th><th class="num">Custo/teste</th><th class="num">Exames</th><th>Atualizado</th></tr>'}</thead>
      <tbody id="reag-body"></tbody></table></div></div>`;
}

function desenharReagentes() {
  const el = document.getElementById('reag-body');
  if (!el) return;
  if (reagVista === 'cq') return desenharInsumosCq(el);
  const rs = lista(ESTADO.reagentes, porNome).filter(r => contem(r.nome + ' ' + (r.fornecedor || ''), buscaReag));
  el.innerHTML = rs.map(r => {
    const d = detalheReagente(r);
    return `<tr class="row" onclick="abrirReagente('${r.id}')">
      <td><div class="ucell"><span class="po-ic" style="--c:var(--cyan)"><i class="fa-solid fa-vials"></i></span><div>${esc(r.nome)}<div class="s">${esc(r.fornecedor || '—')}</div></div></div></td>
      <td class="num">${fmt(r.precoKit)}</td><td class="num">${num(r.testesPorKit, 0)}</td><td class="num">${num(r.perdas || 0)}%</td>
      <td class="num">${num(Math.max(0, d.uteis), 0)}</td>
      <td class="num">${d.pesoCq != null ? `<span title="calibração e controle no custo por teste">${pct(d.pesoCq)}</span><div class="sub-num">${[d.cal && 'cal', d.ctrl && 'CQ'].filter(Boolean).join(' + ')}</div>` : '<span class="muted">—</span>'}</td>
      <td class="num" style="font-weight:600">${fmt(d.custo)}</td><td class="num">${examesDoReagente(r.id).length}</td>
      <td class="muted" style="font-size:12px">${dataHora(r.atualizadoEm)}</td></tr>`;
  }).join('')
    || `<tr><td colspan="9">${vazio('fa-vials', Object.keys(ESTADO.reagentes).length ? 'Nenhum reagente encontrado' : '<b>Nenhum reagente cadastrado</b><br>Cadastre e depois vincule aos exames pela ficha do exame (Custo do teste → Reagente).')}</td></tr>`;
}

function desenharInsumosCq(el) {
  const is = lista(ESTADO.insumosCQ, porNome).filter(i => contem(i.nome + ' ' + (i.fornecedor || ''), buscaReag));
  el.innerHTML = is.map(i => {
    const t = TIPO_CQ[i.tipo] || TIPO_CQ.ctrl, n = reagentesDoCq(i.id).length, uso = i.preco > 0 && i.rende > 0 ? i.preco / i.rende : null;
    return `<tr class="row" onclick="abrirInsumoCq('${i.id}')">
      <td><div class="ucell"><span class="po-ic" style="--c:${t.cor}"><i class="fa-solid ${t.icone}"></i></span><div>${esc(i.nome)}<div class="s">${esc(i.fornecedor || '—')}</div></div></div></td>
      <td>${t.nome}</td><td class="num">${fmt(i.preco)}</td><td class="num">${num(i.niveis || 0, 0)}</td><td class="num">${num(i.rende || 0, 0)} ${t.usos}</td>
      <td class="num" style="font-weight:600">${fmt(uso)}${n > 1 && uso != null ? `<div class="sub-num">${fmt(uso / n)} por reagente</div>` : ''}</td>
      <td class="num">${n}</td><td class="muted" style="font-size:12px">${dataHora(i.atualizadoEm)}</td></tr>`;
  }).join('')
    || `<tr><td colspan="8">${vazio('fa-scale-balanced', Object.keys(ESTADO.insumosCQ || {}).length ? 'Nada encontrado'
      : '<b>Nenhum calibrador ou controle cadastrado</b><br>Cadastre aqui e vincule no reagente. Um mesmo controle multianalito pode servir vários reagentes: o custo é rateado entre eles.')}</td></tr>`;
}

// ── Reagente ──────────────────────────────────────────────────
let _rEd = null;
const opcoesCq = tipo => [{ valor: '', rotulo: 'Nenhum', icone: 'fa-ban', cor: 'var(--gray)' },
  ...lista(ESTADO.insumosCQ, porNome).filter(i => i.tipo === tipo).map(i => ({ valor: i.id, rotulo: i.nome, icone: TIPO_CQ[tipo].icone, cor: TIPO_CQ[tipo].cor,
    desc: `${i.fornecedor ? i.fornecedor + ' · ' : ''}${num(i.niveis || 0, 0)} níveis · ${fmt(i.preco > 0 && i.rende > 0 ? i.preco / i.rende : null)}/${TIPO_CQ[tipo].uso}` }))];

const btNovoInsumo = tipo => pode('custos', 'criar') ? `<button type="button" class="btn sm" style="margin-top:6px;align-self:flex-start" onclick="novoInsumoReagente('${tipo}')"><i class="fa-solid fa-plus"></i>Novo ${TIPO_CQ[tipo].nome.toLowerCase()}</button>` : '';

// Novo calibrador/controle a partir do reagente: a gaveta é uma só, então os elementos do reagente ficam
// guardados (com o que já foi digitado) e voltam ao salvar ou cancelar o cadastro
let _rgPausa = null;
function novoInsumoReagente(tipo) {
  const nos = id => [...document.getElementById(id).childNodes];
  const pausa = { sobre: document.getElementById('g-sobre').textContent, titulo: document.getElementById('g-titulo').textContent,
    meta: nos('g-meta'), corpo: nos('g-corpo'), rodape: nos('g-rodape'), topo: document.getElementById('g-corpo').scrollTop };
  abrirInsumoCq(null, tipo);
  _rgPausa = pausa;
}
// id e tipo: insumo recém-cadastrado, já escolhido no reagente
function voltarReagenteInsumo(id, tipo) {
  const p = _rgPausa;
  _rgPausa = null;
  fecharPop();
  document.getElementById('g-sobre').textContent = p.sobre;
  document.getElementById('g-titulo').textContent = p.titulo;
  document.getElementById('g-meta').replaceChildren(...p.meta);
  document.getElementById('g-corpo').replaceChildren(...p.corpo);
  document.getElementById('g-rodape').replaceChildren(...p.rodape);
  document.getElementById('g-corpo').scrollTop = p.topo;
  if (!id) return;
  const st = POPS[tipo === 'cal' ? 'pop-rgcal' : 'pop-rgctrl'];
  st.valor = id;
  desenharBotaoPop(st.id);
  st.aoMudar(id);
}

function abrirReagente(id) {
  const r = id ? ESTADO.reagentes[id] : null, editar = pode('custos', id ? 'editar' : 'criar');
  _rEd = { id: id || null, calId: r?.calId || '', ctrlId: r?.ctrlId || '' };
  _fxPausa = null;
  const ops = { aoMudar: 'previaReagente()', desab: !editar };
  abrirGaveta({
    sobre: id ? 'Reagente' : 'Novo reagente', titulo: r ? r.nome : 'Cadastrar reagente',
    meta: r ? `<span class="tag"><i class="fa-solid fa-link"></i>${examesDoReagente(id).length} exame(s)</span><span class="tag"><i class="fa-solid fa-clock"></i>${dataHora(r.atualizadoEm)}</span>` : '',
    corpo: `<div class="form-col">
      <div class="fgrid sem-pad">
        ${campo('rg-nome', 'Nome', r?.nome || '', { tipo: 'text', ph: 'Ex.: Glicose HK', desab: !editar })}
        ${campo('rg-forn', 'Fornecedor', r?.fornecedor || '', { tipo: 'text', ph: 'Ex.: Roche', desab: !editar })}
      </div>
      <div class="fgrid sem-pad">
        ${campo('rg-kit', 'Preço do kit', r?.precoKit ?? '', { pre: 'R$', passo: '0.01', ...ops })}
        ${campo('rg-testes', 'Testes por kit', r?.testesPorKit ?? '', { suf: 'testes', passo: '1', ...ops })}
        ${campo('rg-perdas', 'Perdas e repetições', r?.perdas ?? 0, { suf: '%', passo: '0.1', dica: 'repetição, volume morto, vencimento', ...ops })}
        ${campo('rg-dias', 'Kit em uso', r?.diasKit ?? '', { suf: 'dias', passo: '1', dica: 'da abertura até acabar ou vencer a bordo', ...ops })}
      </div>
      <div class="sec-t"><i class="fa-solid fa-scale-balanced"></i>Calibração</div>
      <div class="fgrid sem-pad">
        <div class="field"><label>Calibrador</label><div id="pop-rgcal"></div>${btNovoInsumo('cal')}</div>
        ${campo('rg-calpts', 'Pontos por calibração', r?.calPontos ?? '', { suf: 'testes', passo: '1', dica: 'níveis × replicatas, com o branco', ...ops })}
        ${campo('rg-caldias', 'Calibrar a cada', r?.calDias ?? '', { suf: 'dias', passo: '1', dica: 'vazio: 1 por kit (troca de lote/frasco)', ...ops })}
      </div>
      <div class="sec-t"><i class="fa-solid fa-shield-halved"></i>Controle de qualidade interno</div>
      <div class="fgrid sem-pad">
        <div class="field"><label>Controle</label><div id="pop-rgctrl"></div>${btNovoInsumo('ctrl')}</div>
        ${campo('rg-ctrlniv', 'Níveis por corrida', r?.ctrlNiveis ?? '', { suf: 'testes', passo: '1', dica: 'ex.: normal + patológico = 2', ...ops })}
        ${campo('rg-ctrldia', 'Corridas por dia', r?.ctrlCorridasDia ?? '', { suf: '/dia', passo: '0.1', dica: 'ex.: 1 por turno; 0,2 = 1×/semana', ...ops })}
        ${campo('rg-ctrl', 'Outros testes gastos', r?.controles ?? 0, { suf: 'por kit', passo: '1', dica: 'CQ sem cadastro, diluições, proficiência', ...ops })}
      </div>
      <div class="sec-t"><i class="fa-solid fa-calculator"></i>Resultado</div><div id="rg-prev"></div>
      ${id ? '<div class="sec-t"><i class="fa-solid fa-flask-vial"></i>Impacto nos exames vinculados</div><div id="rg-ex"></div>' : ''}
    </div>`,
    rodape: `${id && pode('custos', 'excluir') ? `<button class="btn perigo-txt" style="margin-right:auto" onclick="excluirReagente()"><i class="fa-solid fa-trash"></i>Excluir</button>` : ''}
      <button class="btn" onclick="clicarForaGaveta()">${editar ? 'Cancelar' : 'Fechar'}</button>
      ${editar ? `<button class="btn pri" onclick="gravarReagente()"><i class="fa-solid fa-floppy-disk"></i>Salvar e recalcular</button>` : ''}`
  });
  [['pop-rgcal', 'cal', 'calId', 'rg-calpts'], ['pop-rgctrl', 'ctrl', 'ctrlId', 'rg-ctrlniv']].forEach(([pid, tipo, k, campoNiv]) => {
    delete POPS[pid];
    const st = criarPop(pid, {
      rotulo: TIPO_CQ[tipo].nome, titulo: TIPO_CQ[tipo].nome + ' do reagente', icone: TIPO_CQ[tipo].icone, busca: 'Buscar…', padrao: '',
      opcoes: () => opcoesCq(tipo),
      aoMudar: v => {
        _rEd[k] = v || '';
        // níveis do insumo como ponto de partida
        const el = document.getElementById(campoNiv), i = ESTADO.insumosCQ?.[v];
        if (el && !el.value && i?.niveis) el.value = i.niveis;
        previaReagente();
      }
    });
    if (st) { st.valor = _rEd[k]; desenharBotaoPop(pid); if (!editar) st.btn.disabled = true; }
  });
  previaReagente();
}

function lerReagente() {
  const n = id => { const v = numCampo(id); return v > 0 ? v : null; };
  return { nome: valorCampo('rg-nome').trim(), fornecedor: valorCampo('rg-forn').trim(), precoKit: numCampo('rg-kit'),
    testesPorKit: numCampo('rg-testes'), perdas: numCampo('rg-perdas') || 0, controles: numCampo('rg-ctrl') || 0, diasKit: n('rg-dias'),
    calId: _rEd.calId || null, calPontos: n('rg-calpts'), calDias: n('rg-caldias'),
    ctrlId: _rEd.ctrlId || null, ctrlNiveis: n('rg-ctrlniv'), ctrlCorridasDia: n('rg-ctrldia') };
}

function previaReagente() {
  const n = lerReagente(), antes = _rEd.id ? ESTADO.reagentes[_rEd.id] : null, d = detalheReagente(n, _rEd.id);
  const novo = n.precoKit > 0 ? d.custo : null, atual = antes ? custoPorTeste(antes, _rEd.id) : null;
  const dif = novo != null && atual ? novo / atual - 1 : 0;
  const lin = (ic, t, s, v, cls = '') => `<div class="casc-r ${cls}"><div class="lft"><i class="fa-solid ${ic}"></i><div>${t}${s ? `<div class="s">${s}</div>` : ''}</div></div><span class="v">${v}</span></div>`;
  const rateio = (i, id) => { const k = compartilhamInsumo(id, _rEd.id); return `${fmt(i.preco)} ÷ ${num(i.rende || 0, 0)}${k > 1 ? ` ÷ ${k} reagentes` : ''}`; };
  const falta = [];
  if ((d.ctrl || d.cal && n.calDias) && !n.diasKit) falta.push('informe por quantos dias o kit fica em uso');
  if (d.ctrl && !n.ctrlCorridasDia) falta.push('informe as corridas de controle por dia');
  [[d.cal, 'calibrador'], [d.ctrl, 'controle']].forEach(([i, t]) => { if (i && !(i.preco > 0 && i.rende > 0)) falta.push(`${t} sem preço ou rendimento`); });
  const testes = n.testesPorKit || 0;
  document.getElementById('rg-prev').innerHTML = `${falta.length ? `<div class="alert x" style="margin-bottom:8px"><i class="fa-solid fa-circle-info"></i><div>${falta.join(' · ')}</div></div>` : ''}<div class="casc">
    ${lin('fa-box', 'Testes do kit', '', num(testes, 0))}
    ${n.perdas ? lin('fa-minus', `Perdas e repetições`, `${num(n.perdas)}%`, '− ' + num(testes * n.perdas / 100, 1)) : ''}
    ${d.cal ? lin('fa-scale-balanced', 'Calibração', `${d.nCal} calibração(ões) × ${num(d.pontos, 0)} pontos${n.calDias && n.diasKit ? ` · a cada ${num(n.calDias, 0)} de ${num(n.diasKit, 0)} dias` : ' · 1 por kit'}`, '− ' + num(d.tCal, 0)) : ''}
    ${d.ctrl ? lin('fa-shield-halved', 'Controle interno', `${d.nCq} corrida(s) × ${num(d.niveis, 0)} níveis · ${num(n.ctrlCorridasDia || 0)}/dia × ${num(n.diasKit || 0, 0)} dias`, '− ' + num(d.tCq, 0)) : ''}
    ${n.controles ? lin('fa-minus', 'Outros testes gastos', '', '− ' + num(n.controles, 0)) : ''}
    ${lin('fa-vial', 'Testes úteis', '', num(Math.max(0, d.uteis), 1), 'tot')}
  </div>
  <div class="casc" style="margin-top:8px">
    ${lin('fa-box', 'Kit', '', fmt(n.precoKit || 0))}
    ${d.cal ? lin('fa-scale-balanced', `Calibrador · ${esc(d.cal.nome)}`, `${d.nCal} × ${fmt(d.uCal)} (${rateio(d.cal, n.calId)})`, '+ ' + fmt(d.mCal)) : ''}
    ${d.ctrl ? lin('fa-shield-halved', `Controle · ${esc(d.ctrl.nome)}`, `${d.nCq} × ${fmt(d.uCq)} (${rateio(d.ctrl, n.ctrlId)})`, '+ ' + fmt(d.mCq)) : ''}
    <div class="casc-r tot"><div class="lft"><i class="fa-solid fa-equals"></i><div>Custo por teste<div class="s">${[atual ? `atual ${fmt(atual)}` : '', d.pesoCq != null && novo != null ? `calibração + CQ = ${pct(d.pesoCq)} do custo` : ''].filter(Boolean).join(' · ')}</div></div></div>
      <span class="v">${novo == null ? `<span style="color:var(--red)">${n.precoKit > 0 && testes > 0 ? 'calibração e CQ consomem o kit' : 'informe preço e testes'}</span>` : fmt(novo)}${Math.abs(dif) > 0.0005 ? ` <span class="${dif > 0 ? 'delta-up' : 'delta-dn'}" style="font-size:11px">${dif > 0 ? '+' : ''}${pct(dif)}</span>` : ''}</span></div></div>`;
  const el = document.getElementById('rg-ex');
  if (!el) return;
  const exs = examesDoReagente(_rEd.id);
  el.innerHTML = !exs.length ? '<div class="muted" style="font-size:12.5px">Nenhum exame vinculado. Vincule pela ficha do exame (Custo do teste → Reagente).</div>'
    : `<div class="casc">${exs.slice(0, 40).map(e => {
        const c0 = calcular(e), fake = { ...ESTADO.reagentes, [_rEd.id]: { ...ESTADO.reagentes[_rEd.id], ...n } };
        const salvo = ESTADO.reagentes; ESTADO.reagentes = fake; const c1 = calcular(e); ESTADO.reagentes = salvo;
        return `<div class="casc-r"><div class="lft"><span class="mn">${esc(e.mn)}</span><div class="s">${c0.margem != null ? pct(c0.margem) : '—'} → <b style="color:${STATUS[c1.status].cor}">${c1.margem != null ? pct(c1.margem) : '—'}</b></div></div>${tagStatus(c1.status)}</div>`;
      }).join('')}${exs.length > 40 ? `<div class="casc-r muted">+ ${exs.length - 40} exames</div>` : ''}</div>`;
}

async function gravarReagente() {
  const n = lerReagente();
  if (!n.nome) return toast('Informe o nome', 'erro');
  if (!(n.precoKit > 0) || !(n.testesPorKit > 0)) return toast('Informe preço do kit e testes por kit', 'erro');
  if (n.ctrlId && !(n.diasKit > 0 && n.ctrlCorridasDia > 0)) return toast('Controle vinculado: informe dias de uso do kit e corridas por dia', 'erro');
  if (custoPorTeste(n, _rEd.id) == null) return toast('Perdas, calibração e controles consomem todos os testes do kit', 'erro');
  const dados = { ...n, atualizadoEm: DB.agora(), atualizadoPor: usuarioAtual().nome };
  const id = _rEd.id || DB.novaChave(CAMINHOS.reagentes), antes = ESTADO.reagentes[id] || null;
  await DB.gravar(`${CAMINHOS.reagentes}/${id}`, dados);
  registrar('reagentes', `Reagente ${n.nome} ${_rEd.id ? 'alterado' : 'cadastrado'}`, { antes, depois: n });
  // cadastrado a partir da ficha: já vale nela, sem esperar o dado voltar do banco
  if (_fxPausa) {
    ESTADO.reagentes = { ...ESTADO.reagentes, [id]: { ...dados, atualizadoEm: Date.now() } };
    voltarFichaReagente(id);
    return toast(`${n.nome} cadastrado e escolhido: salve a ficha para vincular`);
  }
  fecharGaveta();
  toast(`${n.nome} salvo${_rEd.id ? ` · ${examesDoReagente(id).length} exame(s) recalculados` : ''}`);
}

async function excluirReagente() {
  const r = ESTADO.reagentes[_rEd.id], exs = examesDoReagente(_rEd.id);
  if (exs.length) return toast(`${r.nome} está vinculado a ${exs.length} exame(s): desvincule antes`, 'aviso');
  const ok = await confirmar({ titulo: `Excluir ${r.nome}?`, botao: 'Excluir', perigo: true });
  if (!ok) return;
  await DB.remover(`${CAMINHOS.reagentes}/${_rEd.id}`);
  registrar('reagentes', `Reagente ${r.nome} excluído`, { antes: r });
  fecharGaveta();
  toast('Reagente excluído');
}

// ── Calibrador / controle ─────────────────────────────────────
let _cqEd = null;
function abrirInsumoCq(id, tipoNovo) {
  const i = id ? ESTADO.insumosCQ[id] : null, editar = pode('custos', id ? 'editar' : 'criar'), tipo = i?.tipo || tipoNovo || 'ctrl';
  _cqEd = { id: id || null };
  _rgPausa = null;
  const ops = { aoMudar: 'previaInsumoCq()', desab: !editar };
  abrirGaveta({
    sobre: id ? TIPO_CQ[tipo].nome : 'Novo calibrador ou controle', titulo: i ? i.nome : 'Cadastrar calibrador / controle',
    meta: i ? `<span class="tag"><i class="fa-solid fa-link"></i>${reagentesDoCq(id).length} reagente(s)</span><span class="tag"><i class="fa-solid fa-clock"></i>${dataHora(i.atualizadoEm)}</span>` : '',
    corpo: `<div class="form-col">
      <div class="field"><label>Tipo</label><div class="opt-cards" id="cq-tipo">
        ${Object.entries(TIPO_CQ).map(([v, t]) => `<button type="button" class="oc ${tipo === v ? 'on' : ''}" data-v="${v}" ${editar ? '' : 'disabled'} onclick="marcarOc('cq-tipo', this);previaInsumoCq()"><span class="po-ic" style="--c:${t.cor}"><i class="fa-solid ${t.icone}"></i></span>
          <span><b>${t.nome}</b><small>${v === 'cal' ? 'ajusta a curva do equipamento' : 'confere se a corrida está correta'}</small></span><i class="fa-solid fa-circle-check ck"></i></button>`).join('')}
      </div></div>
      <div class="fgrid sem-pad">
        ${campo('cq-nome', 'Nome', i?.nome || '', { tipo: 'text', ph: 'Ex.: Lyphochek Assayed Chemistry', desab: !editar })}
        ${campo('cq-forn', 'Fornecedor', i?.fornecedor || '', { tipo: 'text', ph: 'Ex.: Bio-Rad', desab: !editar })}
        ${campo('cq-preco', 'Preço da embalagem', i?.preco ?? '', { pre: 'R$', passo: '0.01', ...ops })}
        ${campo('cq-niv', 'Níveis', i?.niveis ?? '', { passo: '1', dica: 'ponto de partida no reagente', ...ops })}
      </div>
      <div id="cq-rende-w"></div>
      <div class="sec-t"><i class="fa-solid fa-calculator"></i>Resultado</div><div id="cq-prev"></div>
      ${id ? `<div class="sec-t"><i class="fa-solid fa-vials"></i>Reagentes que usam</div><div class="casc">${reagentesDoCq(id).map(r => {
          const d = detalheReagente(r);
          return `<div class="casc-r"><div class="lft"><i class="fa-solid fa-vials"></i><div>${esc(r.nome)}<div class="s">${esc(r.fornecedor || '')}</div></div></div><span class="v">${fmt(d.custo)}/teste</span></div>`;
        }).join('') || '<div class="casc-r muted">Nenhum reagente vinculado. Vincule no cadastro do reagente.</div>'}</div>` : ''}
    </div>`,
    rodape: `${id && pode('custos', 'excluir') ? `<button class="btn perigo-txt" style="margin-right:auto" onclick="excluirInsumoCq()"><i class="fa-solid fa-trash"></i>Excluir</button>` : ''}
      <button class="btn" onclick="clicarForaGaveta()">${editar ? 'Cancelar' : 'Fechar'}</button>
      ${editar ? `<button class="btn pri" onclick="gravarInsumoCq()"><i class="fa-solid fa-floppy-disk"></i>Salvar e recalcular</button>` : ''}`
  });
  _cqEd.rende = i?.rende ?? '';
  _cqEd.desab = !editar;
  previaInsumoCq();
}

function lerInsumoCq() {
  return { tipo: ocValor('cq-tipo') || 'ctrl', nome: valorCampo('cq-nome').trim(), fornecedor: valorCampo('cq-forn').trim(),
    preco: numCampo('cq-preco'), niveis: numCampo('cq-niv') || null, rende: document.getElementById('cq-rende') ? numCampo('cq-rende') : _cqEd.rende };
}

function previaInsumoCq() {
  const n = lerInsumoCq(), t = TIPO_CQ[n.tipo], w = document.getElementById('cq-rende-w');
  // o rótulo do rendimento muda com o tipo; o valor digitado fica
  if (w.dataset.tipo !== n.tipo) {
    if (document.getElementById('cq-rende')) _cqEd.rende = valorCampo('cq-rende');
    w.dataset.tipo = n.tipo;
    w.innerHTML = campo('cq-rende', `Rende (${t.usos} por embalagem)`, _cqEd.rende ?? '', { suf: t.usos, passo: '1', aoMudar: 'previaInsumoCq()', desab: _cqEd.desab,
      dica: n.tipo === 'cal' ? 'frascos × calibrações por frasco; após aberto vale o que acabar antes: volume ou estabilidade'
        : 'corridas até acabar ou vencer após aberto (ex.: estável 7 dias, 1 corrida/dia → 7 por frasco)' });
    n.rende = numCampo('cq-rende');
  }
  const uso = n.preco > 0 && n.rende > 0 ? n.preco / n.rende : null, k = _cqEd.id ? reagentesDoCq(_cqEd.id).length : 0;
  document.getElementById('cq-prev').innerHTML = `<div class="casc">
    <div class="casc-r ${k > 1 ? '' : 'tot'}"><div class="lft"><i class="fa-solid ${k > 1 ? 'fa-divide' : 'fa-equals'}"></i><div>Custo por ${t.uso}<div class="s">${fmt(n.preco || 0)} ÷ ${num(n.rende || 0, 0)} ${t.usos}</div></div></div>
      <span class="v">${uso == null ? '<span style="color:var(--red)">informe preço e rendimento</span>' : fmt(uso)}</span></div>
    ${k > 1 && uso != null ? `<div class="casc-r tot"><div class="lft"><i class="fa-solid fa-equals"></i><div>Por reagente<div class="s">material multianalito rateado entre ${k} reagentes</div></div></div><span class="v">${fmt(uso / k)}</span></div>` : ''}</div>`;
}

async function gravarInsumoCq() {
  const n = lerInsumoCq();
  if (!n.nome) return toast('Informe o nome', 'erro');
  if (!(n.preco >= 0) || !(n.rende > 0)) return toast(`Informe preço e quantas ${TIPO_CQ[n.tipo].usos} a embalagem rende`, 'erro');
  const id = _cqEd.id || DB.novaChave('insumosCQ'), antes = ESTADO.insumosCQ?.[id] || null;
  if (antes && antes.tipo !== n.tipo && reagentesDoCq(id).length) return toast('Em uso por reagentes: desvincule antes de trocar o tipo', 'aviso');
  await DB.gravar(`${CAMINHOS.insumosCQ}/${id}`, { ...n, atualizadoEm: DB.agora(), atualizadoPor: usuarioAtual().nome });
  registrar('reagentes', `${TIPO_CQ[n.tipo].nome} ${n.nome} ${_cqEd.id ? 'alterado' : 'cadastrado'}`, { antes, depois: n });
  // cadastrado a partir do reagente: já vale nele, sem esperar o dado voltar do banco
  if (_rgPausa) {
    ESTADO.insumosCQ = { ...ESTADO.insumosCQ, [id]: { ...n, atualizadoEm: Date.now(), atualizadoPor: usuarioAtual().nome } };
    voltarReagenteInsumo(id, n.tipo);
    return toast(`${n.nome} cadastrado e escolhido no reagente`);
  }
  fecharGaveta();
  toast(`${n.nome} salvo${_cqEd.id ? ` · ${reagentesDoCq(id).length} reagente(s) recalculados` : ''}`);
}

async function excluirInsumoCq() {
  const i = ESTADO.insumosCQ[_cqEd.id], rs = reagentesDoCq(_cqEd.id);
  if (rs.length) return toast(`${i.nome} está vinculado a ${rs.length} reagente(s): desvincule antes`, 'aviso');
  const ok = await confirmar({ titulo: `Excluir ${i.nome}?`, botao: 'Excluir', perigo: true });
  if (!ok) return;
  await DB.remover(`${CAMINHOS.insumosCQ}/${_cqEd.id}`);
  registrar('reagentes', `${TIPO_CQ[i.tipo]?.nome || 'Insumo'} ${i.nome} excluído`, { antes: i });
  fecharGaveta();
  toast('Excluído');
}
