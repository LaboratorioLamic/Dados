// ═══════════════════════════════════════════════════════════════
// cq-acoes.js — Não conformidades do Controle de Qualidade — LAMIC
// Registro das inadequações, investigação de causas, ações tomadas e
// impacto em resultados de pacientes para corridas rejeitadas ou
// liberadas com justificativa (RDC 978 art. 180, IV e art. 109;
// PALC 11.5). Escalonamento opcional para Ocorrência do equipamento.
// ═══════════════════════════════════════════════════════════════

let _cqNcFiltro = { status: 'abertas', ano: null };
let _cqNcCache = null;    // { u, ano, ncs }
let _cqNcAberta = null;   // { u, ano, id }

const CQ_NC_STATUS = {
  aberta:    { label: 'Aberta',    cls: 'cq-st-rejeitado' },
  concluida: { label: 'Concluída', cls: 'cq-st-aceito' },
  cancelada: { label: 'Cancelada', cls: 'cq-st-semalvo' },
};
const CQ_NC_TIPO = { rejeicao: 'Corrida rejeitada', liberacao_com_violacao: 'Liberação com violação' };
const CQ_FATORES = { operador: 'Operador', equipamento: 'Equipamento', materiais: 'Materiais (controle, reagente, calibrador)', procedimento: 'Procedimento analítico', ambiente: 'Ambiente' };
const CQ_CAUSAS_EQUIP = ['Falha do equipamento', 'Calibração inadequada ou vencida', 'Após manutenção do equipamento', 'Água reagente fora da especificação', 'Temperatura / condições ambientais'];
const CQ_SNNA = { sim: 'Sim', nao: 'Não', na: 'Não se aplica' };

// Cria o registro da NC (chamado ao rejeitar ou liberar com violação)
async function _cqNovaNC(ctx, corrida, testeId, acao, comentario) {
  const numero = await _cqProximoNumero(ctx.u, 'nc');
  if (!numero) { showToast('Não foi possível numerar a não conformidade; registre-a manualmente.', 'error'); return null; }
  const t = cqState.config.testes[testeId];
  const ct = corrida.testes[testeId];
  const ano = _cqHoje().slice(0, 4);
  // Última corrida aceita antes desta (início do intervalo de pacientes potencialmente afetados)
  let ultimaAceita = null;
  try {
    const meses = CQEngine.mesesAnteriores(ctx.mes, 3);
    const res = (await Promise.all(meses.map(m => cqCarregarResultados(ctx.u, m, testeId, { forcar: m === ctx.mes })))).flatMap(o => Object.values(o));
    const ant = res.filter(r => r.corridaKey < ctx.key && ['L', 'O'].includes(r.decisao) && !r.invalidado).sort((a, b) => b.corridaKey.localeCompare(a.corridaKey))[0];
    if (ant) ultimaAceita = { key: ant.corridaKey, mes: CQEngine.mesDe(ant.corridaKey), dataHora: CQEngine.dataDeChave(ant.corridaKey) };
  } catch (e) { /* segue sem a referência */ }
  const id = _cqUid();
  const nc = {
    id, numero, ano, unidadeId: ctx.u, tipo: acao === 'rejeitado' ? 'rejeicao' : 'liberacao_com_violacao',
    corridaKey: ctx.key, mes: ctx.mes, corridaNumero: corrida.numero, dataHoraCorrida: corrida.dataHora,
    testeId, testeNome: t ? _cqNomeTeste(t) : testeId, equipNome: corrida.ativoSnap?.nome || corrida.sistemaAnalitico || '',
    ativoId: corrida.ativoId || null, violacoes: _cqArr(ct?.avaliacao?.violacoes).map(v => v.texto), decisaoComentario: comentario || '',
    impacto: { ultimaCorridaAceita: ultimaAceita, intervaloDe: ultimaAceita?.dataHora || '', intervaloAte: corrida.dataHora },
    status: 'aberta', criadoEm: _cqAgora(), criadoPor: _cqAssinatura(), trilha: {},
  };
  nc.trilha[_cqTk()] = _cqTrilhaEntry('criacao', `Não conformidade aberta: ${CQ_NC_TIPO[nc.tipo]} — ${nc.testeNome}, corrida ${corrida.numero}${comentario ? ' — ' + comentario : ''}`);
  return nc;
}

// ── LISTA ────────────────────────────────────────────────────
function cqRenderNCs(body) {
  const u = _cqUnidadeAtivaId();
  const anoAtual = _cqHoje().slice(0, 4);
  if (!_cqNcFiltro.ano) _cqNcFiltro.ano = anoAtual;
  const anos = [0, 1, 2, 3, 4, 5].map(i => String(Number(anoAtual) - i));
  body.innerHTML = `
  <div class="cq-ncs">
    <div class="cq-toolbar">
      <div class="cq-seg">
        <button class="${_cqNcFiltro.status === 'abertas' ? 'active' : ''}" onclick="_cqNcFiltro.status='abertas';cqRender()">Abertas</button>
        <button class="${_cqNcFiltro.status === 'todas' ? 'active' : ''}" onclick="_cqNcFiltro.status='todas';cqRender()">Todas do ano</button>
      </div>
      ${_cqNcFiltro.status === 'todas' ? `<select class="field-select" style="max-width:110px;" onchange="_cqNcFiltro.ano=this.value;_cqNcCache=null;cqRender()">${anos.map(a => `<option ${a === _cqNcFiltro.ano ? 'selected' : ''}>${a}</option>`).join('')}</select>` : ''}
      <div class="cq-spacer"></div>
      <button class="btn btn-outline btn-sm" onclick="_cqNcCache=null;cqRender()">${CQ_ICO.undo} Atualizar</button>
    </div>
    <div id="cq-nc-lista"><div class="cq-vazio-p">Carregando…</div></div>
  </div>`;
  _cqNcCarregarLista(u);
}

async function _cqNcCarregarLista(u) {
  let ncs = [];
  if (_cqNcFiltro.status === 'abertas') {
    const idx = Object.entries((cqState.indices[u] || {}).ncAbertas || {});
    ncs = (await Promise.all(idx.map(async ([id, x]) => {
      const nc = await window.dbLoad(`${CQ_KEYS.acoes}/${u}/${x.ano}/${id}`);
      return nc ? { ...nc, id, ano: String(x.ano) } : null;
    }))).filter(Boolean);
  } else {
    if (!_cqNcCache || _cqNcCache.u !== u || _cqNcCache.ano !== _cqNcFiltro.ano) {
      const raw = await window.dbLoad(`${CQ_KEYS.acoes}/${u}/${_cqNcFiltro.ano}`);
      _cqNcCache = { u, ano: _cqNcFiltro.ano, ncs: Object.entries(raw || {}).map(([id, nc]) => ({ ...nc, id, ano: _cqNcFiltro.ano })) };
    }
    ncs = _cqNcCache.ncs;
  }
  const el = document.getElementById('cq-nc-lista');
  if (!el) return;
  // Filtro de setor do CQ: pelo setor do teste da NC
  const fSetor = _cqSetorAtivoId(u);
  if (fSetor) ncs = ncs.filter(nc => !nc.testeId || _cqTestePassaSetor(cqState.config.testes[nc.testeId], fSetor));
  ncs.sort((a, b) => (b.criadoEm || '').localeCompare(a.criadoEm || ''));
  el.innerHTML = `<div class="oc-table-scroll"><table class="ot-list-table cq-table">
    <thead><tr><th class="ot-list-th">Nº</th><th class="ot-list-th">Aberta em</th><th class="ot-list-th">Teste</th><th class="ot-list-th">Equipamento</th><th class="ot-list-th">Tipo</th><th class="ot-list-th">Violação</th><th class="ot-list-th">Situação</th><th class="ot-list-th">Pendência</th></tr></thead>
    <tbody>${ncs.length ? ncs.map(nc => `<tr class="ot-list-row" onclick="cqAbrirNC('${u}','${nc.ano}','${nc.id}')">
      <td class="oc-num">${_cqEsc(nc.numero)}</td><td style="white-space:nowrap;">${_cqFmtDH(nc.criadoEm)}</td><td><b>${_cqEsc(nc.testeNome)}</b></td><td>${_cqEsc(nc.equipNome)}</td>
      <td>${_cqEsc(CQ_NC_TIPO[nc.tipo] || nc.tipo)}</td><td style="font-size:12px;max-width:240px;">${_cqEsc(_cqArr(nc.violacoes).join('; '))}</td>
      <td>${_cqBadge(CQ_NC_STATUS, nc.status)}</td><td style="font-size:12px;">${_cqEsc(nc.status === 'aberta' ? (_cqNcPendencias(nc)[0] || 'Pronta para conclusão') : '—')}</td></tr>`).join('')
      : `<tr><td colspan="8" class="cq-td-vazio">${_cqNcFiltro.status === 'abertas' ? 'Nenhuma não conformidade aberta.' : 'Nenhuma não conformidade no ano.'}</td></tr>`}</tbody></table></div>`;
}

function _cqNcPendencias(nc) {
  const p = [];
  if (!(nc.investigacao?.texto || '').trim()) p.push('Registrar a investigação');
  if (!nc.causa) p.push('Definir a causa');
  if (!Object.keys(nc.acoes || {}).length) p.push('Registrar a(s) ação(ões) corretiva(s)');
  const i = nc.impacto || {};
  if (!i.reprocessadas || !i.laudosAfetados || !(i.justificativa || '').trim()) p.push('Avaliar o impacto em resultados de pacientes');
  if (i.laudosAfetados === 'sim' && !(i.laudosRetificados || '').trim()) p.push('Registrar retificação/comunicação dos laudos afetados');
  return p;
}

// ── DETALHE / TRATAMENTO ─────────────────────────────────────
async function cqAbrirNC(u, ano, id) {
  if (_cqSub !== 'ncs' && _cqTabAtiva() === false) switchTab('cq');
  _cqNcAberta = { u, ano: String(ano), id };
  cqModalOpen({ titulo: 'Não conformidade', subtitulo: 'Carregando…', corpo: '<div class="cq-vazio-p">Carregando…</div>', icone: 'alerta', cor: 'var(--red)' });
  await _cqNcRender();
}

function _cqNcPath(ctx) { return `${CQ_KEYS.acoes}/${ctx.u}/${ctx.ano}/${ctx.id}`; }

async function _cqNcRender() {
  const ctx = _cqNcAberta;
  if (!ctx) return;
  const nc = await window.dbLoad(_cqNcPath(ctx));
  if (!nc) { document.getElementById('cq-modal-body').innerHTML = '<div class="cq-vazio">Não conformidade não encontrada.</div>'; return; }
  const aberta = nc.status === 'aberta';
  const pode = aberta && (_cqCan('liberar') || _cqCan('lancar') || _cqCan('revisar'));
  const inv = nc.investigacao || {}, imp = nc.impacto || {};
  const acoes = Object.entries(nc.acoes || {}).sort(([a], [b]) => a.localeCompare(b)).map(([, a]) => a);
  const reps = Object.entries(nc.repeticoes || {}).sort(([a], [b]) => a.localeCompare(b));
  const causas = cqState.config.catalogos.causas;
  const sugereOc = nc.ativoId && !nc.ocorrenciaId && CQ_CAUSAS_EQUIP.includes(nc.causa);
  const radio = (nome, val, atual) => Object.entries(CQ_SNNA).filter(([k]) => val.includes(k)).map(([k, l]) => `<label class="oc-check"><input type="radio" name="${nome}" value="${k}" ${atual === k ? 'checked' : ''} ${pode ? '' : 'disabled'}> ${l}</label>`).join('');
  const ro = pode ? '' : 'disabled';
  const pend = _cqNcPendencias(nc);
  document.getElementById('cq-modal-title').textContent = `Não conformidade ${nc.numero}`;
  document.getElementById('cq-modal-sub').textContent = `${nc.testeNome} · ${nc.equipNome} · ${CQ_NC_TIPO[nc.tipo] || nc.tipo}`;
  document.getElementById('cq-modal-body').innerHTML = `
    <div class="cq-det-head">
      <div><span class="cq-muted">Situação</span>${_cqBadge(CQ_NC_STATUS, nc.status)}</div>
      <div><span class="cq-muted">Corrida</span><a href="#" onclick="cqModalClose();setTimeout(()=>cqAbrirCorrida('${nc.mes}','${nc.corridaKey}'),60);return false;">${_cqEsc(nc.corridaNumero)}</a><span class="cq-muted">${_cqFmtDH(nc.dataHoraCorrida)}</span></div>
      <div><span class="cq-muted">Aberta por</span><b>${_cqEsc(nc.criadoPor?.porNome)}</b><span class="cq-muted">${_cqFmtDH(nc.criadoEm)}</span></div>
      ${nc.ocorrenciaNumero ? `<div><span class="cq-muted">Ocorrência</span>${typeof ocAbrirDeOT === 'function' ? `<a href="#" onclick="cqModalClose();switchTab('ocorrencias');setTimeout(()=>ocOpenView('${nc.ocorrenciaId}'),80);return false;">${_cqEsc(nc.ocorrenciaNumero)}</a>` : _cqEsc(nc.ocorrenciaNumero)}</div>` : ''}
    </div>
    <div class="cq-nc-viol">${_cqArr(nc.violacoes).map(v => `<div>• ${_cqEsc(v)}</div>`).join('')}${nc.decisaoComentario ? `<div class="cq-muted">Justificativa da decisão: “${_cqEsc(nc.decisaoComentario)}”</div>` : ''}</div>
    ${aberta && pend.length ? `<div class="cq-alerta-box">${CQ_ICO.alerta} Pendências: ${_cqEsc(pend.join(' · '))}</div>` : ''}
    ${sugereOc ? `<div class="cq-alerta-box cq-info-box">${CQ_ICO.ativo} A causa aponta para o equipamento. Registre uma ocorrência para tratar o equipamento (pausa, OT e liberação formal).</div>` : ''}

    <div class="form-section"><div class="form-section-title">${CQ_ICO.lista}1. Investigação (PALC 11.1 — causas de variabilidade)</div>
      <div class="cq-checks cq-checks-inline">${Object.entries(CQ_FATORES).map(([k, l]) => `<label class="oc-check"><input type="checkbox" class="cq-nc-fator" value="${k}" ${inv.fatores?.[k] ? 'checked' : ''} ${ro}> ${l}</label>`).join('')}</div>
      <div class="form-field"><label class="field-label">O que foi verificado <span class="required">*</span></label>
        <textarea id="cq-nc-inv" class="field-textarea" style="min-height:70px;" ${ro} placeholder="Ex.: frasco N2 reconstituído há 9 dias (estabilidade 7); calibração vigente; reagente dentro da validade; demais analitos do equipamento aceitos.">${_cqEsc(inv.texto)}</textarea></div>
      <div class="form-field"><label class="field-label">Causa <span class="required">*</span></label><select id="cq-nc-causa" class="field-select" ${ro}>${_cqOptions(causas, nc.causa || '')}</select></div>
    </div>

    <div class="form-section"><div class="form-section-title">${CQ_ICO.edit}2. Ações tomadas</div>
      ${acoes.length ? `<div class="cq-nc-acoes">${acoes.map(a => `<div class="cq-nc-acao"><b>${_cqEsc(a.tipo)}</b>${a.descricao ? ` — ${_cqEsc(a.descricao)}` : ''}<div class="cq-muted">${_cqEsc(a.porNome)} · ${_cqFmtDH(a.em)}</div></div>`).join('')}</div>` : '<div class="cq-vazio-p">Nenhuma ação registrada.</div>'}
      ${pode ? `<div class="form-row cq-nc-add"><div class="form-field"><select id="cq-nc-acao-tipo" class="field-select">${_cqOptions(cqState.config.catalogos.acoes, '')}</select></div>
        <div class="form-field"><input type="text" id="cq-nc-acao-desc" class="field-input" placeholder="Descrição (o quê, resultado)"></div>
        <button class="btn btn-outline btn-sm" onclick="cqNcAddAcao()">${CQ_ICO.plus} Adicionar</button></div>` : ''}
      ${reps.length ? `<div class="cq-nc-reps"><span class="cq-muted">Repetições do controle:</span> ${reps.map(([k, r]) => `<a href="#" onclick="cqModalClose();setTimeout(()=>cqAbrirCorrida('${r.mes}','${k}'),60);return false;">${_cqEsc(r.numero)}</a> ${_cqBadge(CQ_STATUS, r.status || 'pendente')}`).join(' · ')}</div>` : ''}
      ${aberta && _cqCan('lancar') ? `<button class="btn btn-outline btn-sm" style="margin-top:6px;" onclick="cqModalClose();cqRepetirControle('${nc.mes}','${nc.corridaKey}','${nc.testeId}')">${CQ_ICO.repeat} Lançar repetição do controle</button>` : ''}
    </div>

    <div class="form-section"><div class="form-section-title">${CQ_ICO.shield}3. Impacto em resultados de pacientes (PALC 11.5)</div>
      <div class="cq-nota">Última corrida aceita antes da falha: <b>${imp.ultimaCorridaAceita ? _cqFmtDH(imp.ultimaCorridaAceita.dataHora) : 'não encontrada nos últimos 3 meses'}</b>. Amostras analisadas desde então podem ter sido afetadas: recomenda-se reprocessá-las para identificar o momento da perda de estabilidade.</div>
      <div class="form-row"><div class="form-field"><label class="field-label">Intervalo potencialmente afetado — de</label><input type="datetime-local" id="cq-nc-de" class="field-input" value="${_cqEsc(imp.intervaloDe)}" ${ro}></div>
        <div class="form-field"><label class="field-label">até</label><input type="datetime-local" id="cq-nc-ate" class="field-input" value="${_cqEsc(imp.intervaloAte)}" ${ro}></div></div>
      <div class="form-field"><label class="field-label">Amostras de pacientes reprocessadas? <span class="required">*</span></label><div class="cq-checks cq-checks-inline">${radio('cq-nc-rep', ['sim', 'nao', 'na'], imp.reprocessadas)}</div></div>
      <div class="form-row"><div class="form-field"><label class="field-label">Quantidade reprocessada</label><input type="number" min="0" id="cq-nc-qtd" class="field-input" value="${_cqEsc(imp.qtd ?? '')}" ${ro}></div>
        <div class="form-field"><label class="field-label">Diferença clinicamente significativa?</label><div class="cq-checks cq-checks-inline">${radio('cq-nc-dif', ['sim', 'nao', 'na'], imp.diferencaSignificativa)}</div></div></div>
      <div class="form-field"><label class="field-label">Laudos já liberados foram afetados? <span class="required">*</span></label><div class="cq-checks cq-checks-inline">${radio('cq-nc-laudos', ['sim', 'nao'], imp.laudosAfetados)}</div></div>
      <div class="form-field"><label class="field-label">Retificação / comunicação (laudos, médicos, pacientes)</label><textarea id="cq-nc-retif" class="field-textarea" style="min-height:50px;" ${ro} placeholder="Nº dos laudos retificados (RDC 978, art. 170), contatos realizados, data.">${_cqEsc(imp.laudosRetificados)}</textarea></div>
      <div class="form-field"><label class="field-label">Fundamentação da avaliação <span class="required">*</span></label><textarea id="cq-nc-just" class="field-textarea" style="min-height:50px;" ${ro} placeholder="Ex.: nenhuma amostra de paciente liberada entre o último CQ aceito e a rejeição (rotina retida).">${_cqEsc(imp.justificativa)}</textarea></div>
      ${pode ? `<button class="btn btn-primary btn-sm" onclick="cqNcSalvar()">${CQ_ICO.check} Salvar investigação e impacto</button>` : ''}
    </div>

    ${nc.conclusao ? `<div class="form-section"><div class="form-section-title">${CQ_ICO.check}Conclusão</div>
      <div>${_cqEsc(nc.conclusao.texto)}</div><div class="cq-muted">${_cqEsc(nc.conclusao.porNome)} · ${_cqFmtDH(nc.conclusao.em)}</div>
      ${nc.eficacia ? `<div style="margin-top:8px;"><b>Eficácia:</b> ${nc.eficacia.eficaz ? 'ações eficazes' : '<span class="cq-txt-vermelho">ações ineficazes</span>'} — ${_cqEsc(nc.eficacia.texto)}<div class="cq-muted">${_cqEsc(nc.eficacia.porNome)} · ${_cqFmtDH(nc.eficacia.em)}</div></div>` : ''}</div>` : ''}
    ${nc.cancelamento ? `<div class="form-section"><div class="form-section-title">${CQ_ICO.ban}Cancelamento</div><div>${_cqEsc(nc.cancelamento.motivo)}</div><div class="cq-muted">${_cqEsc(nc.cancelamento.porNome)} · ${_cqFmtDH(nc.cancelamento.em)}</div></div>` : ''}
    <details class="cq-det-trilha"><summary>Rastreabilidade</summary>${_cqTrilhaHTML(nc)}</details>`;
  const foot = document.getElementById('cq-modal-foot');
  foot.style.justifyContent = 'space-between';
  foot.innerHTML = `<div style="display:flex;gap:8px;flex-wrap:wrap;">
      ${nc.ativoId && !nc.ocorrenciaId && typeof ocOpenForm === 'function' && aberta ? `<button class="btn btn-outline" onclick="cqNcEscalar()">${CQ_ICO.alerta} Registrar ocorrência do equipamento</button>` : ''}
      ${aberta && (_cqCan('revisar') || _cqIsAdmin()) ? `<button class="btn btn-outline cq-btn-rej" onclick="cqNcCancelar()">${CQ_ICO.ban} Cancelar NC</button>` : ''}
      ${nc.status === 'concluida' && !nc.eficacia && (_cqCan('liberar') || _cqCan('revisar')) ? `<button class="btn btn-outline" onclick="cqNcEficacia()">${CQ_ICO.check} Registrar eficácia</button>` : ''}
    </div>
    <div style="display:flex;gap:8px;">
      ${aberta && (_cqCan('liberar') || _cqCan('revisar')) ? `<button class="btn btn-primary" onclick="cqNcConcluir()" ${pend.length ? 'disabled title="Resolva as pendências"' : ''}>${CQ_ICO.check} Concluir</button>` : ''}
      <button class="btn btn-outline" onclick="cqModalClose()">Fechar</button></div>`;
}

function _cqNcRadio(nome) { return document.querySelector(`#cq-modal input[name="${nome}"]:checked`)?.value || ''; }

async function cqNcSalvar() {
  const ctx = _cqNcAberta;
  if (!ctx || !_cqPodeGravar()) return;
  const nc = await window.dbLoad(_cqNcPath(ctx));
  if (!nc || nc.status !== 'aberta') { showToast('Esta não conformidade não está aberta.', 'error'); return; }
  const fatores = {};
  document.querySelectorAll('#cq-modal .cq-nc-fator').forEach(c => { if (c.checked) fatores[c.value] = true; });
  const inv = { fatores, texto: _cqVal('cq-nc-inv') };
  const causa = _cqVal('cq-nc-causa');
  const imp = {
    ...(nc.impacto || {}), intervaloDe: _cqVal('cq-nc-de'), intervaloAte: _cqVal('cq-nc-ate'),
    reprocessadas: _cqNcRadio('cq-nc-rep'), qtd: _cqVal('cq-nc-qtd') === '' ? null : Number(_cqVal('cq-nc-qtd')),
    diferencaSignificativa: _cqNcRadio('cq-nc-dif'), laudosAfetados: _cqNcRadio('cq-nc-laudos'),
    laudosRetificados: _cqVal('cq-nc-retif'), justificativa: _cqVal('cq-nc-just'),
  };
  const lbl = { texto: 'Investigação', causa: 'Causa', reprocessadas: 'Amostras reprocessadas', qtd: 'Quantidade', diferencaSignificativa: 'Diferença significativa',
                laudosAfetados: 'Laudos afetados', laudosRetificados: 'Retificação', justificativa: 'Fundamentação', intervaloDe: 'Intervalo (de)', intervaloAte: 'Intervalo (até)' };
  const fmt = { reprocessadas: v => CQ_SNNA[v] || v, diferencaSignificativa: v => CQ_SNNA[v] || v, laudosAfetados: v => CQ_SNNA[v] || v };
  const diffs = [..._cqDiff({ texto: nc.investigacao?.texto, causa: nc.causa }, { texto: inv.texto, causa }, { texto: lbl.texto, causa: lbl.causa }),
                 ..._cqDiff(nc.impacto || {}, imp, Object.fromEntries(Object.entries(lbl).filter(([k]) => !['texto', 'causa'].includes(k))), fmt)];
  if (!diffs.length && JSON.stringify(nc.investigacao?.fatores || {}) === JSON.stringify(fatores)) { showToast('Nada alterado.', 'success'); return; }
  const p = _cqNcPath(ctx);
  const ok = await window.dbUpdate({
    [`${p}/investigacao`]: inv, [`${p}/causa`]: causa || null, [`${p}/impacto`]: imp,
    [`${p}/trilha/${_cqTk()}`]: _cqTrilhaEntry('edicao', 'Investigação / impacto atualizados', diffs),
  });
  showToast(ok ? 'Registro salvo.' : 'Falha ao gravar.', ok ? 'success' : 'error');
  if (ok) _cqNcRender();
}

async function cqNcAddAcao() {
  const ctx = _cqNcAberta;
  const tipo = _cqVal('cq-nc-acao-tipo'), desc = _cqVal('cq-nc-acao-desc');
  if (!tipo) { showToast('Selecione a ação.', 'error'); return; }
  if (tipo === 'Outra' && !desc) { showToast('Descreva a ação.', 'error'); return; }
  if (!_cqPodeGravar()) return;
  const p = _cqNcPath(ctx);
  const ass = _cqAssinatura();
  const tk = _cqTk();
  const ok = await window.dbUpdate({
    [`${p}/acoes/${tk}`]: { tipo, descricao: desc, ...ass },
    [`${p}/trilha/${_cqTk()}`]: _cqTrilhaEntry('acao', `Ação registrada: ${tipo}${desc ? ' — ' + desc : ''}`),
  });
  if (ok) _cqNcRender(); else showToast('Falha ao gravar.', 'error');
}

function cqNcConcluir() {
  const ctx = _cqNcAberta;
  _cqPrompt({
    titulo: 'Concluir não conformidade', subtitulo: 'Assinatura do responsável pela avaliação (PALC 11.5)',
    corpo: `<div class="form-field"><label class="field-label">Conclusão <span class="required">*</span></label>
      <textarea id="cq-nc-conc" class="field-textarea" style="min-height:70px;" placeholder="Ex.: causa confirmada (frasco vencido); novo frasco aceito na repetição; sem impacto em laudos."></textarea></div>${_cqSenhaCampoHTML()}`,
    confirmar: 'Assinar e concluir',
    onConfirm: async () => {
      const txt = _cqVal('cq-nc-conc');
      if (!txt) { showToast('Descreva a conclusão.', 'error'); return false; }
      if (!(await _cqSenhaOk()) || !_cqPodeGravar()) return false;
      const nc = await window.dbLoad(_cqNcPath(ctx));
      if (!nc || nc.status !== 'aberta') { showToast('Esta não conformidade não está aberta.', 'error'); return false; }
      const pend = _cqNcPendencias(nc);
      if (pend.length) { showToast('Pendências: ' + pend.join(' · '), 'error'); return false; }
      const p = _cqNcPath(ctx);
      const ok = await window.dbUpdate({
        [`${p}/status`]: 'concluida', [`${p}/conclusao`]: { texto: txt, ..._cqAssinatura({ reautenticado: !!_cqPolitica(ctx.u).reautenticar }) },
        [`${p}/trilha/${_cqTk()}`]: _cqTrilhaEntry('conclusao', `Não conformidade concluída: ${txt}`),
        [`${CQ_KEYS.indices}/${ctx.u}/ncAbertas/${ctx.id}`]: null,
      });
      if (!ok) { showToast('Falha ao gravar.', 'error'); return false; }
      showToast('Não conformidade concluída.', 'success');
      _cqNcCache = null;
      _cqNcRender();
      if (_cqSub === 'ncs') cqRender();
      return true;
    },
  });
}

function cqNcCancelar() {
  const ctx = _cqNcAberta;
  _cqPrompt({
    titulo: 'Cancelar não conformidade', subtitulo: 'Use apenas para registro indevido (ex.: duplicado)',
    corpo: `<div class="form-field"><label class="field-label">Motivo <span class="required">*</span></label><textarea id="cq-nc-canc" class="field-textarea" style="min-height:60px;"></textarea></div>${_cqSenhaCampoHTML()}`,
    confirmar: 'Cancelar NC', perigo: true,
    onConfirm: async () => {
      const mot = _cqVal('cq-nc-canc');
      if (!mot) { showToast('Informe o motivo.', 'error'); return false; }
      if (!(await _cqSenhaOk()) || !_cqPodeGravar()) return false;
      const p = _cqNcPath(ctx);
      const ok = await window.dbUpdate({
        [`${p}/status`]: 'cancelada', [`${p}/cancelamento`]: { motivo: mot, ..._cqAssinatura() },
        [`${p}/trilha/${_cqTk()}`]: _cqTrilhaEntry('cancelamento', `Não conformidade cancelada: ${mot}`),
        [`${CQ_KEYS.indices}/${ctx.u}/ncAbertas/${ctx.id}`]: null,
      });
      if (!ok) { showToast('Falha ao gravar.', 'error'); return false; }
      _cqNcCache = null;
      _cqNcRender();
      return true;
    },
  });
}

function cqNcEficacia() {
  const ctx = _cqNcAberta;
  _cqPrompt({
    titulo: 'Verificação de eficácia', subtitulo: 'As ações evitaram a recorrência?',
    corpo: `<div class="form-field"><label class="field-label">Resultado <span class="required">*</span></label><select id="cq-nc-ef" class="field-select"><option value="">— Avalie —</option><option value="sim">Eficaz</option><option value="nao">Ineficaz</option></select></div>
      <div class="form-field"><label class="field-label">Evidência <span class="required">*</span></label><textarea id="cq-nc-ef-txt" class="field-textarea" style="min-height:60px;" placeholder="Ex.: 20 corridas seguintes aceitas, sem nova violação 2-2s."></textarea></div>`,
    confirmar: 'Registrar',
    onConfirm: async () => {
      const ef = _cqVal('cq-nc-ef'), txt = _cqVal('cq-nc-ef-txt');
      if (!ef || !txt) { showToast('Informe o resultado e a evidência.', 'error'); return false; }
      const p = _cqNcPath(ctx);
      const ok = await window.dbUpdate({
        [`${p}/eficacia`]: { eficaz: ef === 'sim', texto: txt, ..._cqAssinatura() },
        [`${p}/trilha/${_cqTk()}`]: _cqTrilhaEntry('eficacia', `Eficácia: ${ef === 'sim' ? 'eficaz' : 'ineficaz'} — ${txt}`),
      });
      if (!ok) { showToast('Falha ao gravar.', 'error'); return false; }
      _cqNcRender();
      return true;
    },
  });
}

// ── INTEGRAÇÃO COM OCORRÊNCIAS ───────────────────────────────
async function cqNcEscalar() {
  const ctx = _cqNcAberta;
  const nc = await window.dbLoad(_cqNcPath(ctx));
  if (!nc || typeof ocOpenForm !== 'function') return;
  cqModalClose();
  ocOpenForm(null, {
    ativoId: nc.ativoId, tipo: 'falha', subtipo: 'Resultado ou leitura inconsistente', metodoDetec: 'Controle de qualidade', severidade: 'media',
    titulo: `CQ rejeitado — ${nc.testeNome} (${_cqArr(nc.violacoes).map(v => v.split(':')[0]).join(', ')})`.slice(0, 120),
    descricao: `Não conformidade de CQ ${nc.numero} na corrida ${nc.corridaNumero} (${_cqFmtDH(nc.dataHoraCorrida)}).\nViolações: ${_cqArr(nc.violacoes).join('; ')}.` +
      (nc.causa ? `\nCausa provável: ${nc.causa}.` : '') + (nc.investigacao?.texto ? `\nInvestigação: ${nc.investigacao.texto}` : ''),
    dataHoraOcorrencia: nc.dataHoraCorrida,
    origem: { tipo: 'cq', unidadeId: ctx.u, ncId: ctx.id, ncAno: ctx.ano, ncNumero: nc.numero, corridaKey: nc.corridaKey, testeId: nc.testeId },
  });
}

// Chamado pelo módulo de Ocorrências após registrar uma ocorrência originada no CQ
async function cqAposCriarOcorrencia(oc) {
  const o = oc?.origem;
  if (!o || o.tipo !== 'cq' || !o.ncId) return;
  const p = `${CQ_KEYS.acoes}/${o.unidadeId}/${o.ncAno}/${o.ncId}`;
  await window.dbUpdate({
    [`${p}/ocorrenciaId`]: oc.id, [`${p}/ocorrenciaNumero`]: oc.numero,
    [`${p}/trilha/${_cqTk()}`]: _cqTrilhaEntry('ocorrencia', `Ocorrência ${oc.numero} registrada para o equipamento`),
  });
}
