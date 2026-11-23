// ── PREPARO DE CONTROLE (RECONSTITUIÇÃO POR NÍVEL) ──────────────────────
// Material de controle liofilizado (ex.: VITROS HBsAg Controls) é reconstituído no laboratório: cada
// nível vira um frasco próprio, com validade de uso, código e etiqueta próprios (RDC 978, art. 101).
// Configuração no material: preparoInterno + preparo { volume, unidadeQtd, validadeDias, especificacao, riscos }
// (o armazenamento é o do próprio material). Registro em lotesControle/{id}/preparos/{pid}:
// { id, nivel, seq, codigo LOTE-N1-P01, data, dataHora, responsavelId, responsavel, quantidade, unidadeQtd,
//   validade, validadePadrao?, validadeAjuste?, observacoes, criadoEm, criadoPor, finalizado? }.
// A sequência é por nível (preparoSeq/{n}); códigos excluídos não são reaproveitados.

// Campos do formulário do material
function _cqCtlPrepCamposHTML(m, pode) {
  const on = !!m?.preparoInterno;
  const pf = m?.preparo || {};
  const un = pf.unidadeQtd || 'mL';
  return `<div class="form-field"><label class="field-label">Preparo</label>
      ${_cqToggleHTML('cq-mat-prep', on, 'Preparado no laboratório', 'Reconstituído/diluído aqui: cada nível tem preparo, validade e etiqueta próprios', 'Usado como recebido (pronto para uso)', pode)}</div>
    <div id="cq-mat-prep-campos" style="${on ? '' : 'display:none;'}">
      <div class="form-row">
        <div class="form-field"><label class="field-label">Volume por frasco</label>
          <div class="cq-pf-qtd"><input type="number" id="cq-mat-prep-vol" class="field-input" min="0" step="any" inputmode="decimal" value="${_cqEsc(pf.volume ?? '')}" placeholder="Ex.: 1,6" ${_cqRo(pode)}>
            <select id="cq-mat-prep-un" class="field-select" ${_cqRo(pode)}>${CQ_UNID_PREPARO.map(x => `<option ${x === un ? 'selected' : ''}>${x}</option>`).join('')}</select></div></div>
        <div class="form-field" id="cq-mat-prep-dias-wrap" style="${pf.validadeLote ? 'display:none;' : ''}"><label class="field-label">Validade após preparo (dias) <span class="required">*</span></label>
          <input type="number" id="cq-mat-prep-dias" class="field-input" min="1" max="3650" step="1" value="${_cqEsc(pf.validadeDias ?? '')}" placeholder="Ex.: 5" ${_cqRo(pode)}></div>
      </div>
      <div class="form-field">${_cqToggleHTML('cq-mat-prep-vallote', !!pf.validadeLote, 'Validade do lote', 'O preparo vale até a validade do lote', 'O preparo vale os dias acima, limitado à validade do lote', pode)}</div>
      <div class="form-field"><label class="field-label">Instrução de preparo</label>
        <textarea id="cq-mat-prep-esp" class="field-textarea" style="min-height:50px;" placeholder="Ex.: reconstituir com 1,6 mL de água reagente; inverter suavemente até dissolver" ${_cqRo(pode)}>${_cqEsc(pf.especificacao || '')}</textarea></div>
      <div class="form-field"><label class="field-label">Riscos</label>
        <input type="text" id="cq-mat-prep-riscos" class="field-input" maxlength="200" value="${_cqEsc(pf.riscos || '')}" placeholder="Ex.: derivado de sangue humano — potencialmente infectante" ${_cqRo(pode)}></div>
      <div class="cq-nota">A validade de cada preparo é a data do preparo + os dias, limitada à do lote; com “Validade do lote” ligado, é a própria validade do lote. Registre em Cadastros › Preparos ou no lote (aba Preparos).</div>
    </div>`;
}
// Mostra/oculta os campos ao ligar/desligar o toggle
document.addEventListener('cq-toggle', e => {
  const box = document.getElementById({ 'cq-mat-prep': 'cq-mat-prep-campos', 'cq-mat-prep-vallote': 'cq-mat-prep-dias-wrap' }[e.detail?.id]);
  if (!box) return;
  box.style.display = (e.detail.id === 'cq-mat-prep') === e.detail.on ? '' : 'none';
});

// Lê os campos do formulário do material; null = erro já avisado
function _cqCtlPrepCamposLer() {
  if (!_cqChk('cq-mat-prep')) return { preparoInterno: false, preparo: null };
  const vol = _cqVal('cq-mat-prep-vol').replace(',', '.'), validadeLote = _cqChk('cq-mat-prep-vallote'), dias = validadeLote ? null : Number(_cqVal('cq-mat-prep-dias'));
  if (!validadeLote && !(Number.isInteger(dias) && dias >= 1 && dias <= 3650)) { showToast('Preparo: informe a validade após o preparo em dias inteiros (1 a 3650).', 'error'); return null; }
  if (vol !== '' && !(Number(vol) > 0)) { showToast('Preparo: volume por frasco inválido.', 'error'); return null; }
  return { preparoInterno: true, preparo: { volume: vol === '' ? null : Number(vol), unidadeQtd: _cqVal('cq-mat-prep-un') || 'mL', validadeDias: dias, validadeLote,
    especificacao: _cqVal('cq-mat-prep-esp'), riscos: _cqVal('cq-mat-prep-riscos') } };
}
function _cqCtlFmtPreparo(v) {
  if (!v) return '—';
  return [v.volume ? `${String(v.volume).replace('.', ',')} ${v.unidadeQtd || ''}`.trim() + ' por frasco' : '', v.validadeLote ? 'validade do lote' : v.validadeDias ? `validade ${v.validadeDias} dia(s) após preparo` : '',
    v.especificacao, v.riscos ? 'riscos: ' + v.riscos : ''].filter(Boolean).join(' · ') || '—';
}
// Seção "Preparo" na visualização do material
function _cqCtlPrepSecaoMaterial(m) {
  if (!m.preparoInterno) return '';
  const pf = m.preparo || {};
  return _cqPvSecao(CQ_ICO.beaker, 'Preparo (por nível)', _cqPvCampos([
    { l: 'Volume por frasco', v: pf.volume ? _cqEsc(`${String(pf.volume).replace('.', ',')} ${pf.unidadeQtd || ''}`) : '' },
    { l: 'Validade após preparo', v: pf.validadeLote ? 'Validade do lote' : pf.validadeDias ? `${pf.validadeDias} dia(s), limitada à do lote` : '' },
    { l: 'Instrução', v: _cqEsc(pf.especificacao || ''), largo: true },
    { l: 'Riscos', v: _cqEsc(pf.riscos || ''), largo: true },
  ]));
}

// ── Dados ──
function _cqCtlNivelRot(mat, n) { const nome = mat?.niveis?.[n]?.nome; return `Nível ${n}${nome ? ` (${nome})` : ''}`; }
function _cqCtlPreps(l) {
  return Object.values(l?.preparos || {}).filter(p => p && p.id)
    .sort((a, b) => (b.dataHora || b.data || '').localeCompare(a.dataHora || a.data || '') || (Number(a.nivel) - Number(b.nivel)));
}
function _cqCtlPrep(l, id) { return _cqCtlPreps(l).find(p => p.id === id) || null; }
function _cqCtlPrepSeq(l, n) {
  const ps = _cqCtlPreps(l).filter(p => Number(p.nivel) === Number(n));
  return Math.max(ps.length, Number(l?.preparoSeq?.[n]) || 0, ...ps.map(p => Number(p.seq) || 0)) + 1;
}
function _cqCtlPrepCodigo(l, n, seq) { return `${l.lote}-N${n}-P${String(seq).padStart(2, '0')}`; }
function _cqCtlPrepValidade(mat, l, dia) {
  const dias = Number(mat?.preparo?.validadeDias);
  if (mat?.preparo?.validadeLote || !dia || !(dias > 0)) return l?.validade || null;
  const v = _cqSomarDias(dia, dias);
  return l?.validade && l.validade < v ? l.validade : v;
}
// Lotes de controle da área que aceitam preparo hoje: material preparado no laboratório, em uso/avaliação, dentro da validade
function _cqCtlPrepLotes(u, dia = _cqHoje()) {
  const ord = l => ((l.status || 'em_uso') === 'em_uso' ? 0 : 1);
  return _cqDaUnidade('lotesControle', u).filter(l => {
    const m = cqState.config.materiais[l.materialId];
    return m?.preparoInterno && m.ativo !== false && ['em_uso', 'em_avaliacao'].includes(l.status || 'em_uso') && !_cqLoteVencido(l, dia);
  }).sort((a, b) => ord(a) - ord(b) || (cqState.config.materiais[a.materialId]?.nome || '').localeCompare(cqState.config.materiais[b.materialId]?.nome || '', 'pt') || (a.validade || '').localeCompare(b.validade || ''));
}
// Todos os preparos de controle da área
function _cqCtlPrepItens(u) {
  return _cqDaUnidade('lotesControle', u).flatMap(l => _cqCtlPreps(l).map(p => ({ l, p, mat: cqState.config.materiais[l.materialId] })));
}

// ── Permissões (as mesmas dos preparos de reagentes) ──
function _cqCtlPodeExcluirPrep(p) {
  if (!p) return false;
  return _cqCan('configurar') || _cqCan('editarCadastros') || (_cqPodeRegistrarPreparo() && !!p.criadoPor?.porId && p.criadoPor.porId === _cqSess().id);
}

// ── Etiqueta: uma por nível ──
function _cqCtlEtqDados(l, p) {
  const mat = cqState.config.materiais[l.materialId];
  const fd = s => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(2, 4)}` : '—');
  const nome = mat?.niveis?.[p.nivel]?.nome;
  return { produto: `${mat?.nome || 'Controle'} · N${p.nivel}${nome ? ' ' + nome : ''}`, codigo: p.codigo || '', lote: l.lote || '', qtd: _cqPrepQtdTxt(p),
           prep: fd(p.data), val: fd(p.validade || l.validade), resp: _cqEtqNomeCurto(p.responsavel) };
}
// Janela de impressão de uma ou várias etiquetas (ids separados por vírgula)
function cqCtlEtq(loteId, ids) {
  const l = cqState.config.lotesControle[loteId];
  if (!l) return;
  const ps = String(ids || '').split(',').map(id => _cqCtlPrep(l, id)).filter(Boolean).sort((a, b) => Number(a.nivel) - Number(b.nivel));
  if (!ps.length) { showToast('Preparo não encontrado.', 'error'); return; }
  const ds = ps.map(p => _cqCtlEtqDados(l, p));
  if (ds.length === 1) { _cqEtqDialogo(ds[0], 'Imprimir etiqueta', `${ds[0].produto} · ${ds[0].codigo}`); return; }
  const cfg = _cqEtqCfg();
  window._cqCtlEtqAtual = ds;
  _cqPrompt({
    titulo: 'Imprimir etiquetas', subtitulo: `${cqState.config.materiais[l.materialId]?.nome || 'Controle'} · lote ${l.lote} · ${ds.length} nível(is)`, confirmar: `Imprimir ${ds.length}`,
    corpo: `<div class="cq-nota">Uma etiqueta por nível: cada frasco reconstituído leva a sua.</div>
      <div class="cq-ctl-etq-grade" style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin:8px 0;">${ds.map((d, k) => `<div style="text-align:center;">
        <div class="cq-etq-prev" style="min-height:0;">${_cqEtqPrevHTML(d, cfg)}</div>
        <button type="button" class="btn btn-outline btn-sm" onclick="_cqEtqBaixarPDF(window._cqCtlEtqAtual[${k}], _cqEtqLer('cq-etqp'))">${CQ_ICO.baixar} PDF ${_cqEsc(d.codigo)}</button></div>`).join('')}</div>
      <div class="cq-etq-lin">
        <div class="form-field"><label class="field-label">Cópias de cada</label>
          <input type="number" id="cq-etqp-copias" class="field-input" min="1" max="300" step="1" value="1" onkeydown="if(event.key==='Enter')cqPromptConfirmar()"></div>
      </div>
      <details class="cq-etq-det"><summary>Ajustar impressão</summary>${_cqEtqCamposHTML('cq-etqp', cfg)}
        <div class="cq-nota">O ajuste fica salvo nesta estação. Na etiquetadora, use o mesmo tamanho de papel no driver da impressora.</div></details>`,
    onConfirm: () => {
      const n = Number(_cqVal('cq-etqp-copias'));
      if (!(Number.isInteger(n) && n >= 1 && n <= 300)) { showToast('Cópias: de 1 a 300.', 'error'); return false; }
      const c = _cqEtqLer('cq-etqp');
      _cqEtqSalvarCfg(c);
      return _cqEtqImprimir(ds, c, n);
    },
  });
}
function cqCtlEtqPDF(loteId, id) {
  const l = cqState.config.lotesControle[loteId];
  const p = l ? _cqCtlPrep(l, id) : null;
  if (p) _cqEtqBaixarPDF(_cqCtlEtqDados(l, p), _cqEtqCfg());
}

// ── Registro ──
let _cqCtlNovo = null;   // { loteId, onde }
function cqCtlPrepNovo(loteId, onde = 'aba') {
  if (!_cqPodeRegistrarPreparo()) { showToast('Sem permissão para registrar preparos.', 'error'); return; }
  const u = _cqUnidadeAtivaId();
  const lotes = _cqCtlPrepLotes(u);
  if (loteId && !lotes.some(l => l.id === loteId)) {
    const l = cqState.config.lotesControle[loteId];
    const m = l && cqState.config.materiais[l.materialId];
    showToast(!m?.preparoInterno ? 'O material deste lote não está marcado como preparado no laboratório (edite o material).'
      : `Lote ${l.lote} vencido, em quarentena, encerrado ou fora desta área.`, 'error');
    return;
  }
  if (!lotes.length) { showToast('Nenhum lote de controle desta área com preparo no laboratório, válido e em uso.', 'error'); return; }
  _cqCtlNovo = { onde };
  const l0 = cqState.config.lotesControle[loteId] || lotes[0];
  if (cqState.config.lotesControle[loteId]) cqDrawerClose();
  const resps = _cqPrepResponsaveis(u);
  const me = _cqSess().id;
  _cqPrompt({
    titulo: 'Preparo de controle', subtitulo: 'Reconstituição — um preparo e uma etiqueta por nível', confirmar: 'Registrar',
    corpo: `<div class="form-field"><label class="field-label">Material · lote <span class="required">*</span></label>
        <select id="cq-ctp-lote" class="field-select" onchange="cqCtlPrepLoteMudou()">${lotes.map(l => {
          const m = cqState.config.materiais[l.materialId];
          return `<option value="${l.id}" ${l.id === l0.id ? 'selected' : ''}>${_cqEsc(m?.nome || '?')} — lote ${_cqEsc(l.lote)} (val. ${_cqFmtData(l.validade)})</option>`;
        }).join('')}</select></div>
      <div class="form-field"><label class="field-label">Níveis preparados <span class="required">*</span></label>
        <div class="cq-checks cq-checks-inline" id="cq-ctp-niveis"></div></div>
      <div class="form-row">
        <div class="form-field"><label class="field-label">Data e hora <span class="required">*</span></label>
          <input type="datetime-local" id="cq-ctp-dh" class="field-input" value="${_cqNowLocal().slice(0, 16)}" max="${_cqNowLocal().slice(0, 16)}" onchange="cqCtlPrepLoteMudou(true)"></div>
        <div class="form-field"><label class="field-label">Quantidade por frasco</label>
          <div class="cq-pf-qtd"><input type="number" id="cq-ctp-qtd" class="field-input" min="0" step="any" inputmode="decimal">
            <select id="cq-ctp-un" class="field-select">${CQ_UNID_PREPARO.map(x => `<option>${x}</option>`).join('')}</select></div></div>
      </div>
      <div class="form-field"><label class="field-label">Responsável <span class="required">*</span></label>
        <select id="cq-ctp-resp" class="field-select">${(resps.some(x => x.id === me) ? resps : [{ id: me, nomeCompleto: _cqSess().nome }, ...resps])
          .map(x => `<option value="${_cqEsc(x.id)}" ${x.id === me ? 'selected' : ''}>${_cqEsc(x.nomeCompleto || x.username)}</option>`).join('')}</select></div>
      <div id="cq-ctp-info" class="cq-nota"></div>
      <div class="form-field"><label class="field-label">Observações</label>
        <input type="text" id="cq-ctp-obs" class="field-input" maxlength="200" placeholder="Opcional — ex.: água reagente lote 1234"></div>`,
    onConfirm: () => cqCtlPrepRegistrar(),
  });
  cqCtlPrepLoteMudou();
}
// Troca de lote (ou de data): níveis do lote, volume sugerido e validade calculada
function cqCtlPrepLoteMudou(soData) {
  const l = cqState.config.lotesControle[_cqVal('cq-ctp-lote')];
  const mat = l && cqState.config.materiais[l.materialId];
  if (!l || !mat) return;
  if (!soData) {
    const nv = _cqArr(l.niveis).map(Number).sort((a, b) => a - b);
    const box = document.getElementById('cq-ctp-niveis');
    if (box) box.innerHTML = nv.map(n => `<label class="oc-check"><input type="checkbox" class="cq-ctp-nivel" value="${n}" checked> ${_cqEsc(_cqCtlNivelRot(mat, n))}</label>`).join('');
    const q = document.getElementById('cq-ctp-qtd'), un = document.getElementById('cq-ctp-un');
    if (q) q.value = mat.preparo?.volume ?? '';
    if (un) un.value = mat.preparo?.unidadeQtd || 'mL';
  }
  const dia = _cqVal('cq-ctp-dh').slice(0, 10) || _cqHoje();
  const val = _cqCtlPrepValidade(mat, l, dia);
  const info = document.getElementById('cq-ctp-info');
  if (info) info.innerHTML = `Validade de cada preparo: <b>${_cqFmtData(val)}</b>${mat.preparo?.validadeLote ? ' (validade do lote)' : mat.preparo?.validadeDias ? ` (${mat.preparo.validadeDias} dia(s), limitada à do lote ${_cqFmtData(l.validade)})` : ''}.`
    + (mat.preparo?.especificacao ? `<br>${_cqEsc(mat.preparo.especificacao)}` : '') + (mat.armazenamento ? `<br>Armazenamento: ${_cqEsc(mat.armazenamento)}` : '');
}
async function cqCtlPrepRegistrar() {
  if (!_cqPodeRegistrarPreparo() || _cqSalvando) return false;
  const l = cqState.config.lotesControle[_cqVal('cq-ctp-lote')];
  const mat = l && cqState.config.materiais[l.materialId];
  if (!l || !mat) { showToast('Escolha o lote.', 'error'); return false; }
  const niveis = [...document.querySelectorAll('.cq-ctp-nivel:checked')].map(c => Number(c.value));
  const agora = _cqNowLocal().slice(0, 16);
  const dh = _cqVal('cq-ctp-dh') || agora, dia = dh.slice(0, 10);
  const qtdTxt = _cqVal('cq-ctp-qtd').replace(',', '.'), qtd = qtdTxt === '' ? null : Number(qtdTxt);
  const respId = _cqVal('cq-ctp-resp');
  if (!niveis.length) { showToast('Marque ao menos um nível.', 'error'); return false; }
  if (dh > agora) { showToast('Data e hora do preparo no futuro.', 'error'); return false; }
  if (qtd !== null && !(qtd > 0)) { showToast('Quantidade inválida.', 'error'); return false; }
  if (!respId) { showToast('Informe o responsável.', 'error'); return false; }
  if (!_cqCtlPrepLotes(_cqUnidadeAtivaId(), dia).some(x => x.id === l.id)) { showToast(`Lote ${l.lote} vencido, em quarentena ou encerrado na data do preparo.`, 'error'); return false; }
  const validade = _cqCtlPrepValidade(mat, l, dia);
  if (validade && validade < _cqHoje()) { showToast(`Preparo já vencido (validade ${_cqFmtData(validade)}).`, 'error'); return false; }
  if (!_cqPodeGravar()) return false;
  const ass = _cqAssinatura();
  const resp = _cqUsuarios().find(x => x.id === respId);
  const respNome = resp?.nomeCompleto || resp?.username || (respId === _cqSess().id ? _cqSess().nome : '');
  const base = `${CQ_KEYS.config}/lotesControle/${l.id}`;
  const updates = {}, novos = [];
  niveis.forEach((n, k) => {
    const seq = _cqCtlPrepSeq(l, n);
    const p = { id: _cqUid() + 'n' + n + k, nivel: n, seq, codigo: _cqCtlPrepCodigo(l, n, seq), data: dia, dataHora: dh, responsavelId: respId, responsavel: respNome,
      quantidade: qtd, unidadeQtd: qtd ? _cqVal('cq-ctp-un') : '', validade, observacoes: _cqVal('cq-ctp-obs'), origem: 'preparos', criadoEm: ass.em, criadoPor: ass };
    updates[`${base}/preparos/${p.id}`] = p;
    updates[`${base}/preparoSeq/${n}`] = seq;
    novos.push(p);
  });
  updates[`${base}/atualizadoEm`] = ass.em;
  updates[`${base}/trilha/${_cqTk()}`] = _cqTrilhaEntry('edicao', `Preparo registrado (${novos.map(p => p.codigo).join(', ')}): ${dh.replace('T', ' ')} por ${respNome || '—'}`
    + `${qtd ? `, ${_cqPrepQtdTxt(novos[0])} por frasco` : ''}, validade ${_cqFmtData(validade)}${novos[0].observacoes ? ` — ${novos[0].observacoes}` : ''}`);
  _cqSalvando = true;
  try {
    if (!(await window.dbUpdate(updates))) { showToast('Falha ao gravar. Verifique a conexão.', 'error'); return false; }
  } finally { _cqSalvando = false; }
  l.preparos = l.preparos || {};
  l.preparoSeq = l.preparoSeq || {};
  novos.forEach(p => { l.preparos[p.id] = p; l.preparoSeq[p.nivel] = p.seq; });
  showToast(`${novos.length} preparo(s) registrado(s): ${novos.map(p => p.codigo).join(', ')}.`, 'success');
  cqRender();
  // Já oferece as etiquetas (uma por nível)
  setTimeout(() => cqCtlEtq(l.id, novos.map(p => p.id).join(',')), 80);
  return true;
}

// ── Finalizar / excluir ──
function cqCtlPrepFinalizar(loteId, id, onde = 'aba') {
  const l = cqState.config.lotesControle[loteId];
  const p = l ? _cqCtlPrep(l, id) : null;
  if (!p || p.finalizado) return;
  if (!_cqPodeSituacaoPreparo() && !_cqPodeRegistrarPreparo()) { showToast('Sem permissão para finalizar o preparo.', 'error'); return; }
  _cqPrompt({
    titulo: 'Finalizar preparo?', subtitulo: `${cqState.config.materiais[l.materialId]?.nome || ''} · ${p.codigo}`, perigo: true, confirmar: 'Finalizar',
    corpo: `<div class="cq-nota">O frasco acabou ou foi descartado. O preparo sai da lista “Em uso”; fica na rastreabilidade do lote.</div>`,
    onConfirm: async () => {
      if (!_cqPodeGravar()) return false;
      const ass = _cqAssinatura();
      const base = `${CQ_KEYS.config}/lotesControle/${loteId}`;
      const finalizado = { auto: false, motivo: CQ_PREP_FIN_PADRAO, ...ass };
      const ok = await window.dbUpdate({
        [`${base}/preparos/${id}/finalizado`]: finalizado, [`${base}/atualizadoEm`]: ass.em,
        [`${base}/trilha/${_cqTk()}`]: _cqTrilhaEntry('edicao', `Preparo ${p.codigo} finalizado`, [{ campo: 'Preparo finalizado', antes: 'Não', depois: 'Sim' }]),
      });
      if (!ok) { showToast('Falha ao gravar. Verifique a conexão.', 'error'); return false; }
      if (l.preparos?.[id]) l.preparos[id].finalizado = finalizado;
      showToast(`Preparo ${p.codigo} finalizado.`, 'success');
      if (onde === 'lote') cqLoteVer(loteId, 'preparos'); else cqRender();
      return true;
    },
  });
}
function cqCtlPrepExcluir(loteId, id, onde = 'aba') {
  const l = cqState.config.lotesControle[loteId];
  const p = l ? _cqCtlPrep(l, id) : null;
  if (!p) return;
  if (!_cqCtlPodeExcluirPrep(p)) { showToast('Sem permissão para excluir este preparo.', 'error'); return; }
  const mat = cqState.config.materiais[l.materialId];
  _cqPrompt({
    titulo: 'Excluir preparo', subtitulo: `${mat?.nome || ''} · lote ${l.lote} · ${p.codigo}`, perigo: true, confirmar: 'Excluir',
    corpo: `<div class="cq-nota">Use para preparo registrado por engano ou em duplicidade. Uma cópia fica no histórico de exclusões e na rastreabilidade do lote; o código não é reaproveitado.</div>
      <div class="form-field"><label class="field-label">Motivo <span class="required">*</span></label>
        <input type="text" id="cq-ctp-excl-motivo" class="field-input" maxlength="200" placeholder="Ex.: registrado em duplicidade" onkeydown="if(event.key==='Enter')cqPromptConfirmar()"></div>`,
    onConfirm: async () => {
      const motivo = _cqVal('cq-ctp-excl-motivo');
      if (!motivo) { showToast('Informe o motivo da exclusão.', 'error'); return false; }
      if (!_cqPodeGravar()) return false;
      const ass = _cqAssinatura();
      const base = `${CQ_KEYS.config}/lotesControle/${loteId}`;
      const ok = await window.dbUpdate({
        [`${base}/preparos/${id}`]: null,
        [`${base}/preparoSeq/${p.nivel}`]: Math.max(Number(l.preparoSeq?.[p.nivel]) || 0, Number(p.seq) || 0),
        [`${base}/atualizadoEm`]: ass.em,
        [`${base}/trilha/${_cqTk()}`]: _cqTrilhaEntry('exclusao', `Preparo ${p.codigo} excluído: ${motivo}`,
          [{ campo: 'Preparo', antes: [p.codigo, _cqFmtDH(p.dataHora || p.data), p.responsavel, _cqPrepQtdTxt(p)].filter(Boolean).join(' · '), depois: 'excluído' }]),
        [`${CQ_KEYS.exclusoes}/${_cqTk()}`]: { colecao: 'preparosControle', id, loteControleId: loteId, resumo: `${mat?.nome || ''} · lote ${l.lote} · ${p.codigo}`, motivo, registro: p, ...ass },
      });
      if (!ok) { showToast('Falha ao excluir. Verifique a conexão e tente novamente.', 'error'); return false; }
      if (l.preparos) delete l.preparos[id];
      (l.preparoSeq = l.preparoSeq || {})[p.nivel] = Math.max(Number(l.preparoSeq[p.nivel]) || 0, Number(p.seq) || 0);
      showToast(`Preparo ${p.codigo} excluído.`, 'success');
      if (onde === 'lote') cqLoteVer(loteId, 'preparos'); else cqRender();
      return true;
    },
  });
}

// ── Listas ──
function _cqCtlPrepLinhaHTML({ l, p, mat }, onde, comLote) {
  const hoje = _cqHoje();
  const icoFim = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
  const fin = p.finalizado ? `<div class="cq-muted">${_cqEsc(`finalizado por ${p.finalizado.porNome || '—'} em ${_cqFmtDH(p.finalizado.em)}`)}</div>` : '';
  return `<tr class="ot-list-row${p.finalizado ? ' oc-row-final' : ''}">
    <td class="cq-prep-cod-td">${_cqEsc(p.codigo || '—')}</td>
    ${comLote ? `<td><b>${_cqEsc(mat?.nome || '?')}</b><div class="cq-muted">lote ${_cqEsc(l.lote)}</div></td>` : ''}
    <td>${_cqEsc(_cqCtlNivelRot(mat, p.nivel))}</td>
    <td style="white-space:nowrap;">${_cqPrepQtdTxt(p) ? `<b>${_cqEsc(_cqPrepQtdTxt(p))}</b>` : '<span class="cq-muted">—</span>'}</td>
    <td style="font-size:12.5px;white-space:nowrap;">${_cqFmtDH(p.dataHora || p.data)}<div class="cq-muted">${_cqEsc(p.responsavel || '—')}</div></td>
    <td>${_cqPrepValidadeBarra(p, hoje)}${fin}</td>
    <td class="cq-prep-acoes">
      ${!p.finalizado && (_cqPodeSituacaoPreparo() || _cqPodeRegistrarPreparo()) ? `<button type="button" class="cq-icobtn" title="Finalizar (frasco acabou ou descartado)" onclick="cqCtlPrepFinalizar('${l.id}','${p.id}','${onde}')">${icoFim}</button>` : ''}
      <button type="button" class="cq-icobtn" title="Imprimir etiqueta" onclick="cqCtlEtq('${l.id}','${p.id}')">${CQ_ICO.print}</button>
      <button type="button" class="cq-icobtn" title="Baixar etiqueta em PDF" onclick="cqCtlEtqPDF('${l.id}','${p.id}')">${CQ_ICO.baixar}</button>
      ${_cqCtlPodeExcluirPrep(p) ? `<button type="button" class="cq-icobtn cq-prep-excl" title="Excluir preparo" onclick="cqCtlPrepExcluir('${l.id}','${p.id}','${onde}')">${CQ_ICO.lixo}</button>` : ''}
    </td></tr>`;
}
function _cqCtlPrepTabelaHTML(itens, onde, comLote, vazio) {
  return `<div class="oc-table-scroll"><table class="ot-list-table cq-table cq-prep-tbl">
    <thead><tr><th class="ot-list-th">Código</th>${comLote ? '<th class="ot-list-th">Controle · lote</th>' : ''}<th class="ot-list-th">Nível</th><th class="ot-list-th">Quantidade</th>
      <th class="ot-list-th">Preparo</th><th class="ot-list-th">Validade</th><th class="ot-list-th"></th></tr></thead>
    <tbody>${itens.length ? itens.map(x => _cqCtlPrepLinhaHTML(x, onde, comLote)).join('') : `<tr><td colspan="${comLote ? 7 : 6}" class="cq-td-vazio">${vazio}</td></tr>`}</tbody></table></div>`;
}
// Aba "Preparos" da visualização do lote de controle
function _cqCtlPrepAbaLote(l, mat) {
  const ps = _cqCtlPreps(l);
  if (!mat?.preparoInterno && !ps.length) return null;
  const itens = ps.map(p => ({ l, p, mat }));
  const uso = itens.filter(x => !x.p.finalizado), fins = itens.filter(x => x.p.finalizado);
  const emUso = uso.filter(x => !(x.p.validade && x.p.validade < _cqHoje()));
  const novo = _cqPodeRegistrarPreparo() && mat?.preparoInterno ? `<button class="btn btn-outline btn-sm cq-an-novo-teste" onclick="cqCtlPrepNovo('${l.id}','lote')">${CQ_ICO.plus} Novo preparo (por nível)</button>` : '';
  const btnEtqUso = emUso.length > 1 ? `<button class="btn btn-outline btn-sm" onclick="cqCtlEtq('${l.id}','${emUso.map(x => x.p.id).join(',')}')">${CQ_ICO.print} Etiquetas em uso (${emUso.length})</button>` : '';
  return { k: 'preparos', rotulo: `Preparos${uso.length ? ` <span class="cq-step-qtd">${uso.length}</span>` : ''}`, html: `
    ${mat?.preparoInterno ? '' : '<div class="cq-nota cq-txt-amarelo">O material não está mais marcado como preparado no laboratório: só o histórico aparece.</div>'}
    <div class="cq-sec-titulo">Em uso</div>
    ${_cqCtlPrepTabelaHTML(uso, 'lote', false, 'Nenhum preparo em uso.')}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">${novo}${btnEtqUso}</div>
    ${fins.length ? `<details style="margin-top:14px;"><summary>Finalizados (${fins.length})</summary>${_cqCtlPrepTabelaHTML(fins, 'lote', false, '')}</details>` : ''}` };
}
// Seção na aba Cadastros › Preparos (segue o filtro Em uso / Finalizados / Todos)
function _cqCtlPrepAbaLista() {
  return;   // os preparos de controle entram na tabela principal da aba (_cqCtlPrepAbaLinhas)
  const el = document.getElementById('cq-ctl-prep-lista');
  if (!el) return;
  const u = _cqUnidadeAtivaId();
  const todos = _cqCtlPrepItens(u);
  if (!todos.length && !_cqCtlPrepLotes(u).length) { el.innerHTML = ''; return; }
  const itens = todos.filter(({ p }) => _cqPrepFiltro === 'todos' || (_cqPrepFiltro === 'finalizados') === !!p.finalizado)
    .sort((a, b) => (b.p.dataHora || '').localeCompare(a.p.dataHora || '') || Number(a.p.nivel) - Number(b.p.nivel));
  const vazio = { em_uso: 'Nenhum controle reconstituído em uso', finalizados: 'Nenhum preparo de controle finalizado', todos: 'Nenhum preparo de controle registrado' }[_cqPrepFiltro] + ' nesta área.';
  el.innerHTML = `<div class="cq-sec-titulo" style="margin-top:22px;">Controles reconstituídos <span class="cq-muted" style="font-weight:400;">· um preparo e uma etiqueta por nível</span></div>
    ${_cqCtlPrepTabelaHTML(itens, 'aba', true, vazio)}`;
}

// ── CONTROLES NA ABA PREPAROS, NOS CONJUNTOS E NA TROCA ─────────────────
// Material de controle entra onde entra produto, pela chave 'mat:<id>' (conjunto guarda { materialId }).
function _cqTrKey(it) { return it?.materialId ? 'mat:' + it.materialId : it?.produtoId || ''; }
function _cqTrEhMat(k) { return String(k || '').startsWith('mat:'); }
function _cqTrMat(k) { return _cqTrEhMat(k) ? cqState.config.materiais[String(k).slice(4)] : null; }
function _cqTrNome(k) { return _cqTrEhMat(k) ? _cqTrMat(k)?.nome : cqState.config.insumoProdutos[k]?.nome; }
// Materiais com preparo no laboratório da área (ativos)
function _cqCtlMateriaisPrep(u) {
  return _cqDaUnidade('materiais', u).filter(m => m.preparoInterno && m.ativo !== false && _cqProdutoPassaSetor(m, u))
    .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt'));
}
// Preparos de controle do material na área (todos os lotes)
function _cqCtlPrepsMaterial(mid, u) {
  return _cqDaUnidade('lotesControle', u).filter(l => l.materialId === mid).flatMap(l => _cqCtlPreps(l).map(p => ({ l, p })));
}
function _cqCtlLotesMaterial(mid, u, dia) { return _cqCtlPrepLotes(u, dia).filter(l => l.materialId === mid); }

// Popover "Novo preparo": grupo dos controles; escolher abre o registro por nível
function _cqCtlPrepPopGrupoHTML(u, dia) {
  const ms = _cqCtlMateriaisPrep(u).filter(m => _cqPrepServeEquip(m));
  if (!ms.length) return '';
  return `<div class="cq-tp-grupo"><div class="cq-tp-grupo-tit">${CQ_ICO.beaker}Controles (um preparo por nível)<span>${ms.length}</span></div>${ms.map(m => {
    const nl = _cqCtlLotesMaterial(m.id, u, dia).length;
    return `<button type="button" class="cq-sitpop-op${nl ? '' : ' sem-lote'}" data-b="${_cqEsc(_cqNormBusca(`${m.nome} ${m.fabricante || ''}`))}" onclick="cqPrepCtlEscolher('${m.id}')">
      <span class="cq-sitpop-marca"><span class="cq-sitpop-ico">${CQ_ICO.beaker}</span></span>
      <span class="cq-sitpop-txt"><b>${_cqEsc(m.nome)}</b><small>${_cqEsc([m.fabricante, `${Object.keys(m.niveis || {}).length} nível(is)`, nl ? `${nl} lote(s) em uso` : 'sem lote em uso dentro da validade'].filter(Boolean).join(' · '))}</small></span></button>`;
  }).join('')}</div>`;
}
function cqPrepCtlEscolher(mid) {
  document.getElementById('cq-pf-prod-pop')?.classList.remove('aberto');
  const l = _cqCtlLotesMaterial(mid, _cqUnidadeAtivaId())[0];
  if (!l) { showToast('Nenhum lote deste controle em uso e dentro da validade nesta área.', 'error'); return; }
  if (document.getElementById('cq-prep-form-wrap')?.closest('#cq-drawer')) cqDrawerClose();
  cqCtlPrepNovo(l.id);
}
// Opções do filtro de produtos da aba Preparos
function _cqCtlPrepOpsProd(u) {
  const ms = new Map(_cqCtlMateriaisPrep(u).map(m => [m.id, m]));
  _cqCtlPrepItens(u).forEach(({ mat }) => { if (mat) ms.set(mat.id, mat); });
  return [...ms.values()].filter(m => _cqPrepServeEquip(m)).map(m => ({ value: 'mat:' + m.id, label: m.nome, sub: m.fabricante || '', grupo: 'Controles' }));
}
// Linhas de controle na tabela da aba Preparos (mesmas colunas dos reagentes)
function _cqCtlPrepAbaLinhas(u, hoje) {
  return _cqCtlPrepItens(u)
    .filter(({ p, mat }) => (!_cqPrepProds.length || _cqPrepProds.includes('mat:' + mat?.id)) && _cqPrepServeEquip(mat || {})
      && (_cqPrepFiltro === 'todos' || (_cqPrepFiltro === 'finalizados') === !!p.finalizado) && _cqPrepBuscaBate(p))
    .map(x => ({ ord: x.p.dataHora || x.p.data || '', criadoEm: x.p.criadoEm || '', html: _cqCtlPrepLinhaAbaHTML(x, hoje) }));
}
function _cqCtlPrepLinhaAbaHTML({ l, p, mat }, hoje) {
  const icoFim = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
  const fin = p.finalizado ? `<div class="cq-muted cq-prep-fin-txt">${_cqEsc(`finalizado por ${p.finalizado.porNome || '—'}`)}</div>` : '';
  return `<tr class="ot-list-row${p.finalizado ? ' oc-row-final' : ''}" onclick="cqLoteVer('${l.id}','preparos')" title="Abrir o lote de controle">
    <td class="cq-prep-cod-td">${_cqEsc(p.codigo || '—')}</td>
    <td><b>${_cqEsc(mat?.nome || '?')}</b> <span class="cq-badge cq-st-semalvo">${_cqEsc(_cqCtlNivelRot(mat, p.nivel))}</span><div class="cq-muted">controle · lote ${_cqEsc(l.lote)}</div></td>
    <td style="white-space:nowrap;">${_cqPrepQtdTxt(p) ? `<b>${_cqEsc(_cqPrepQtdTxt(p))}</b>` : '<span class="cq-muted">—</span>'}</td>
    <td style="font-size:12.5px;white-space:nowrap;">${_cqFmtDH(p.dataHora || p.data)}<div class="cq-muted">${_cqEsc(p.responsavel || '—')}</div></td>
    <td>${_cqPrepValidadeBarra(p, hoje)}</td>
    <td><div class="cq-prep-sitcel"><span class="cq-badge ${p.finalizado ? 'cq-st-semalvo' : 'cq-st-aceito'}" title="O controle é avaliado na própria corrida">${p.finalizado ? 'Finalizado' : 'Em uso'}</span>${!p.finalizado && (_cqPodeSituacaoPreparo() || _cqPodeRegistrarPreparo()) ? `<button type="button" class="cq-prep-parar" title="Finalizar (frasco acabou ou descartado)" onclick="event.stopPropagation();cqCtlPrepFinalizar('${l.id}','${p.id}')">${icoFim}</button>` : ''}</div>${fin}</td>
    <td class="oc-num" style="text-align:center;"><span class="cq-muted">—</span></td>
    <td class="cq-prep-acoes" onclick="event.stopPropagation()">
      <button type="button" class="cq-icobtn" title="Imprimir etiqueta" onclick="cqCtlEtq('${l.id}','${p.id}')">${CQ_ICO.print}</button>
      <button type="button" class="cq-icobtn" title="Baixar etiqueta em PDF" onclick="cqCtlEtqPDF('${l.id}','${p.id}')">${CQ_ICO.baixar}</button>
      ${_cqCtlPodeExcluirPrep(p) ? `<button type="button" class="cq-icobtn cq-prep-excl" title="Excluir preparo" onclick="cqCtlPrepExcluir('${l.id}','${p.id}')">${CQ_ICO.lixo}</button>` : ''}
    </td></tr>`;
}

// Situação de troca do material (mesma regra dos produtos; controle não tem aviso próprio: 3 dias)
function _cqCtlTrocaSit(mid, u) {
  const hoje = _cqHoje(cqState.config.unidades[u]?.fuso);
  const preps = _cqCtlPrepsMaterial(mid, u).map(x => x.p);
  if (!preps.length) return { tipo: 'nova', txt: 'nunca preparado', uso: [] };
  const uso = preps.filter(p => !p.finalizado);
  if (!uso.length) return { tipo: 'vencida', txt: 'sem preparo em uso', uso };
  const v = uso.map(p => p.validade).filter(Boolean).sort()[0];
  if (!v) return { tipo: 'ok', txt: 'sem validade', uso };
  const dias = _cqPrepDias(hoje, v);
  if (dias < 0) return { tipo: 'vencida', txt: `vencida há ${-dias} d`, uso, dias };
  return { tipo: dias <= 3 ? 'proxima' : 'ok', txt: dias === 0 ? 'vence hoje' : `vence em ${dias} d`, uso, dias };
}
// Preparos de controle em uso que a troca finaliza
function _cqCtlTrocaEmUso(mid, u, ate) {
  return _cqCtlPrepsMaterial(mid, u).filter(({ p }) => !p.finalizado && (!ate || (p.dataHora || p.data || '') <= ate));
}
// Item de controle na lista da troca: lote e quantidade por frasco; cada nível do lote vira um preparo
function _cqCtlTrocaItemHTML(key, x, t, frac, dia, dh) {
  const m = _cqTrMat(key);
  if (!m) { x.incluir = false; return '<div class="cq-tr-item off"><b class="cq-muted">Controle removido do cadastro</b></div>'; }
  const incluir = frac || x.incluir;
  const lotes = _cqCtlLotesMaterial(m.id, t.u, dia);
  if (!lotes.some(l => l.id === x.lote)) x.lote = lotes[0]?.id || '';
  const l = x.lote ? cqState.config.lotesControle[x.lote] : null;
  const val = l ? _cqCtlPrepValidade(m, l, dia) : null;
  const nv = l ? _cqArr(l.niveis).map(Number).sort((a, b) => a - b) : [];
  // Níveis desta troca: padrão todos os do lote (x.niveis = null)
  const sel = _cqCtlTrocaNiveisSel(x, l);
  const emUso = _cqCtlTrocaEmUso(m.id, t.u, dh).filter(({ p }) => sel.includes(Number(p.nivel)));
  const usoTxt = emUso.length ? `Em uso: ${emUso.map(({ p }) => `${p.codigo} (val. ${_cqFmtData(p.validade)})`).join(', ')}${t.finalizar ? ' — será finalizado' : ''}` : 'Nenhum preparo em uso';
  const k = _cqEsc(key);
  const cab = frac
    ? `<span class="cq-tr-nome"><b>${_cqEsc(m.nome)}</b></span>`
    : `<label class="cq-tr-sw"><input type="checkbox" ${incluir ? 'checked' : ''} onchange="cqTrocaItem('${k}','incluir',this.checked,true)"><span class="cq-sw" aria-hidden="true"></span><b>${_cqEsc(m.nome)}</b>${incluir ? '' : '<small>fora desta troca</small>'}</label>`;
  return `<div class="cq-tr-item${incluir ? '' : ' off'}">
    <div class="cq-tr-cab">${cab}
      <span class="cq-tr-cab-dir">${incluir && val ? `<span class="cq-tr-val" title="Validade dos novos preparos">val. ${_cqFmtData(val)} · ${_cqPrepDias(dia, val)} d</span>` : ''}
        ${frac ? `<button type="button" class="cq-sitpop-x" title="Tirar da troca" onclick="cqTrocaFracToggle('${k}',true)">×</button>` : ''}</span></div>
    ${incluir ? `<div class="cq-tr-campos">
        <div class="form-field"><label class="field-label">Lote do controle</label>
          <select class="field-select" ${lotes.length ? '' : 'disabled'} onchange="cqTrocaItem('${k}','lote',this.value,true)">${lotes.length
            ? lotes.map(o => `<option value="${o.id}" ${o.id === x.lote ? 'selected' : ''}>${_cqEsc(o.lote)} · val. ${_cqFmtData(o.validade)}</option>`).join('')
            : '<option value="">Nenhum lote em uso dentro da validade</option>'}</select></div>
        <div class="form-field"><label class="field-label">Quantidade por frasco</label>
          <div class="cq-pf-qtd"><input type="number" class="field-input" min="0" step="any" inputmode="decimal" value="${_cqEsc(x.qtd)}" placeholder="0" oninput="cqTrocaItem('${k}','qtd',this.value)">
            <select class="field-select" onchange="cqTrocaItem('${k}','un',this.value)">${CQ_UNID_PREPARO.map(un => `<option ${un === x.un ? 'selected' : ''}>${un}</option>`).join('')}</select></div></div>
      </div>
      ${nv.length ? `<div class="form-field"><label class="field-label">Níveis desta troca</label>
        <div class="cq-checks cq-checks-inline">${nv.map(n => `<label class="oc-check"><input type="checkbox" ${sel.includes(n) ? 'checked' : ''} onchange="cqTrocaCtlNivel('${k}',${n},this.checked)"> ${_cqEsc(_cqCtlNivelRot(m, n))}</label>`).join('')}</div>
        <div class="cq-muted cq-tr-uso">Um preparo e uma etiqueta por nível marcado.</div></div>` : ''}
      <div class="cq-muted cq-tr-uso">${_cqEsc(usoTxt)}</div>` : ''}
  </div>`;
}
// Níveis marcados do item (padrão: todos os do lote); só os que o lote tem
function _cqCtlTrocaNiveisSel(x, l) {
  const nv = l ? _cqArr(l.niveis).map(Number).sort((a, b) => a - b) : [];
  return Array.isArray(x.niveis) ? nv.filter(n => x.niveis.includes(n)) : nv;
}
function cqTrocaCtlNivel(key, n, on) {
  const x = _cqTroca?.itens[key];
  if (!x) return;
  const l = cqState.config.lotesControle[x.lote];
  const atual = _cqCtlTrocaNiveisSel(x, l);
  x.niveis = on ? [...new Set([...atual, n])] : atual.filter(v => v !== n);
  _cqTrocaRedesenhar();
}
// Valida o item de controle da troca; devolve o plano ou null (erro já avisado)
function _cqCtlTrocaPlano(key, x, t, dia) {
  const m = _cqTrMat(key);
  const l = x.lote ? cqState.config.lotesControle[x.lote] : null;
  if (!m || !l) { showToast(`${m?.nome || 'Controle'}: nenhum lote em uso dentro da validade.`, 'error'); return null; }
  if (!_cqCtlLotesMaterial(m.id, t.u, dia).some(o => o.id === l.id)) { showToast(`${m.nome}: lote ${l.lote} vencido, em quarentena ou encerrado na data da troca.`, 'error'); return null; }
  const qtdTxt = String(x.qtd ?? '').replace(',', '.'), qtd = qtdTxt === '' ? null : Number(qtdTxt);
  if (qtd !== null && !(qtd > 0)) { showToast(`${m.nome}: quantidade inválida.`, 'error'); return null; }
  const validade = _cqCtlPrepValidade(m, l, dia);
  if (validade && validade < _cqHoje()) { showToast(`${m.nome}: preparo já vencido (validade ${_cqFmtData(validade)}).`, 'error'); return null; }
  const niveis = _cqCtlTrocaNiveisSel(x, l);
  if (!niveis.length) { showToast(`${m.nome}: marque ao menos um nível${t.modo === 'fracionado' ? ' ou tire o controle da troca' : ' ou deixe o controle fora desta troca'}.`, 'error'); return null; }
  return { ctl: true, m, l, qtd, un: qtd ? x.un : '', validade, niveis };
}
// Grava os preparos (um por nível) e finaliza os em uso do material
function _cqCtlTrocaGravar(updates, x, k, { dia, dh, respId, obs, conjunto, finalizar, motivoFin, u }, ass) {
  const resp = _cqUsuarios().find(z => z.id === respId);
  const respNome = resp?.nomeCompleto || resp?.username || '';
  const base = `${CQ_KEYS.config}/lotesControle/${x.l.id}`;
  const novos = x.niveis.map((n, j) => {
    const seq = _cqCtlPrepSeq(x.l, n);
    const p = { id: _cqUid() + 'n' + n + k + j, nivel: n, seq, codigo: _cqCtlPrepCodigo(x.l, n, seq), data: dia, dataHora: dh, responsavelId: respId, responsavel: respNome,
      quantidade: x.qtd, unidadeQtd: x.un, validade: x.validade, observacoes: (obs || '').trim(), origem: 'troca', conjunto, criadoEm: ass.em, criadoPor: ass };
    updates[`${base}/preparos/${p.id}`] = p;
    updates[`${base}/preparoSeq/${n}`] = seq;
    return p;
  });
  updates[`${base}/atualizadoEm`] = ass.em;
  updates[`${base}/trilha/${_cqTk()}c${k}`] = _cqTrilhaEntry('edicao', `Preparo registrado na ${conjunto.fracionada ? 'troca fracionada' : `troca do conjunto ${conjunto.nome}`} (${novos.map(p => p.codigo).join(', ')}): ${dh.replace('T', ' ')} por ${respNome || '—'}, validade ${_cqFmtData(x.validade)}`);
  const fins = [];
  if (finalizar) _cqCtlTrocaEmUso(x.m.id, u, dh).filter(({ p }) => x.niveis.includes(Number(p.nivel))).forEach(({ l, p }, j) => {
    const fin = { auto: false, motivo: `${motivoFin} (${novos.map(q => q.codigo).join(', ')})`, ...ass };
    updates[`${CQ_KEYS.config}/lotesControle/${l.id}/preparos/${p.id}/finalizado`] = fin;
    updates[`${CQ_KEYS.config}/lotesControle/${l.id}/atualizadoEm`] = ass.em;
    updates[`${CQ_KEYS.config}/lotesControle/${l.id}/trilha/${_cqTk()}f${k}${j}`] = _cqTrilhaEntry('edicao', `Preparo ${p.codigo} finalizado: ${fin.motivo}`, [{ campo: 'Preparo finalizado', antes: 'Não', depois: 'Sim' }]);
    fins.push({ l, p, fin });
  });
  return { novos, fins };
}
function _cqCtlTrocaAplicarLocal(x, r) {
  x.l.preparos = x.l.preparos || {};
  x.l.preparoSeq = x.l.preparoSeq || {};
  r.novos.forEach(p => { x.l.preparos[p.id] = p; x.l.preparoSeq[p.nivel] = p.seq; });
  r.fins.forEach(({ l, p, fin }) => { if (l.preparos?.[p.id]) l.preparos[p.id].finalizado = fin; });
}
