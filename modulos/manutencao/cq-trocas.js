// ═══════════════════════════════════════════════════════════════
// cq-trocas.js — Conjuntos de troca e avisos de troca de preparos — Controle de Qualidade
// Conjunto (conjuntosPreparo/{id}): produtos preparados no laboratório que são trocados juntos
// (ex.: bateria de coloração de Papanicolau). A troca registra um preparo por produto num único
// dbUpdate e finaliza os preparos que estavam em uso. O aviso de troca vem da validade do preparo
// em uso dos produtos com "Avisar a troca" (preparo.avisoDias) e aparece no painel do CQ, na aba
// Preparos e no sino de alertas (window.cqNotifAlertas, lido por getNotifAlerts em script.js).
// ═══════════════════════════════════════════════════════════════

// ── CONJUNTOS ────────────────────────────────────────────────
function _cqConjuntosDaUnidade(u, inclusiveInativos) {
  return Object.values(cqState.config.conjuntosPreparo || {}).filter(c => _cqNaUnidade(c, u) && (inclusiveInativos || c.ativo !== false))
    .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt'));
}
function _cqConjuntoItens(c) { return _cqArr(c?.itens).filter(x => x && (x.produtoId || x.materialId)); }
function _cqConjuntoItemTxt(x) {
  const nome = _cqTrNome(_cqTrKey(x)) || (x.materialId ? 'controle removido' : 'produto removido');
  return x.quantidade ? `${nome} (${String(x.quantidade).replace('.', ',')} ${x.unidadeQtd || ''})`.replace(' )', ')') : nome;
}
function _cqConjuntoResumo(c) { return _cqConjuntoItens(c).map(_cqConjuntoItemTxt).join(', '); }
function _cqModalRodapeEntre() { const f = document.getElementById('cq-modal-foot'); if (f) f.style.justifyContent = 'space-between'; }

// Lista dos conjuntos da unidade (botão "Conjuntos" da aba Preparos)
function cqConjuntosAbrir() {
  const u = _cqUnidadeAtivaId();
  const pode = _cqCan('configurar');
  const podeTrocar = _cqPodeRegistrarPreparo();
  const lista = _cqConjuntosDaUnidade(u, true);
  cqModalOpen({
    titulo: 'Conjuntos de troca', subtitulo: `${_cqUnidade()?.sigla || ''} · produtos preparados que são trocados juntos`, icone: 'repeat', largura: '680px',
    corpo: lista.length ? `<div class="cq-cj-lista">${lista.map(c => `<div class="cq-cj-item${c.ativo === false ? ' inativo' : ''}">
        <div class="cq-cj-info"><b>${_cqEsc(c.nome)}${c.ativo === false ? ' <span class="cq-badge cq-st-semalvo">Inativo</span>' : ''}</b><small>${_cqEsc(_cqConjuntoResumo(c))}</small></div>
        <div class="cq-cj-acoes">
          ${c.ativo !== false && podeTrocar ? `<button class="btn btn-primary btn-sm" onclick="cqModalClose();cqTrocaAbrir('${c.id}')">${CQ_ICO.repeat} Trocar</button>` : ''}
          ${pode ? `<button class="btn btn-outline btn-sm" onclick="cqModalClose();cqConjuntoForm('${c.id}')">${CQ_ICO.edit} Editar</button>` : ''}
        </div></div>`).join('')}</div>`
      : `<div class="cq-nota">Nenhum conjunto nesta área. ${pode ? 'Crie um com os produtos trocados juntos (ex.: Hematoxilina, Orange G6, EA 36 e Álcool Absoluto).' : 'Peça a quem configura o CQ para criar o conjunto.'}</div>`,
    rodape: `<div></div><div style="display:flex;gap:8px;"><button class="btn btn-outline" onclick="cqModalClose()">Fechar</button>
      ${pode ? `<button class="btn btn-primary" onclick="cqModalClose();cqConjuntoForm(null)">${CQ_ICO.plus} Novo conjunto</button>` : ''}</div>`,
  });
  _cqModalRodapeEntre();
}

// Cadastro do conjunto: nome, ativo e produtos com a quantidade de cada troca
let _cqCjForm = null;
function cqConjuntoForm(id) {
  if (!_cqCan('configurar')) { showToast('Sem permissão para editar conjuntos de troca.', 'error'); return; }
  const c = id ? cqState.config.conjuntosPreparo[id] : null;
  _cqCjForm = { id: c ? c.id : null, nome: c?.nome || '', ativo: c ? c.ativo !== false : true, itens: _cqConjuntoItens(c).map(x => ({ produtoId: _cqTrKey(x), quantidade: x.quantidade, unidadeQtd: x.unidadeQtd })) };
  if (!_cqCjForm.itens.length) _cqCjForm.itens.push({ produtoId: '', quantidade: '', unidadeQtd: 'mL' });
  cqDrawerOpen({
    titulo: c ? c.nome : 'Novo conjunto de troca', subtitulo: 'Produtos preparados trocados juntos, com a quantidade de cada troca', icone: 'repeat',
    corpo: c ? _cqAbasHTML('cj', [{ k: 'dados', rotulo: 'Conjunto', html: '<div id="cq-cj-form"></div>' }, _cqAbaTrilha(c)]) : '<div id="cq-cj-form"></div>',
    rodape: `${c && _cqPodeExcluirCad('conjuntosPreparo') ? `<div class="cq-rodape-esq"><button class="btn btn-outline cq-btn-perigo" onclick="cqExcluirCadastro('conjuntosPreparo','${c.id}')">Excluir</button></div>` : ''}
      <button class="btn btn-outline" onclick="cqDrawerClose()">Cancelar</button>
      <button class="btn btn-primary" onclick="cqConjuntoSalvar()">${CQ_ICO.check} Salvar</button>`,
  });
  _cqCjRedesenhar();
}
function _cqCjRedesenhar() { const el = document.getElementById('cq-cj-form'); if (el) el.innerHTML = _cqCjFormHTML(); }
function _cqCjFormHTML() {
  const f = _cqCjForm;
  const u = _cqUnidadeAtivaId();
  const prods = _cqPrepProdutos(u);
  const mats = _cqCtlMateriaisPrep(u);
  const opts = sel => {
    const fora = sel && !prods.some(p => p.id === sel) && !mats.some(m => 'mat:' + m.id === sel) && _cqTrNome(sel) ? sel : null;
    return `<option value="">Selecione o produto ou controle</option>${fora ? `<option value="${_cqEsc(fora)}" selected>${_cqEsc(_cqTrNome(fora))} (fora da lista da área)</option>` : ''}`
      + (prods.length ? `<optgroup label="Reagentes, meios e insumos">${prods.map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${_cqEsc(p.nome)}${p.fabricante ? ' — ' + _cqEsc(p.fabricante) : ''}</option>`).join('')}</optgroup>` : '')
      + (mats.length ? `<optgroup label="Controles (um preparo por nível)">${mats.map(m => `<option value="mat:${m.id}" ${'mat:' + m.id === sel ? 'selected' : ''}>${_cqEsc(m.nome)}${m.fabricante ? ' — ' + _cqEsc(m.fabricante) : ''}</option>`).join('')}</optgroup>` : '');
  };
  return `<div class="form-section"><div class="form-section-title">${CQ_ICO.repeat}Conjunto</div>
      <div class="form-field"><label class="field-label">Nome <span class="required">*</span></label>
        <input type="text" class="field-input" maxlength="80" value="${_cqEsc(f.nome)}" placeholder="Ex.: Bateria Papanicolau (quinzenal)" oninput="_cqCjForm.nome=this.value"></div>
      <label class="oc-check"><input type="checkbox" ${f.ativo ? 'checked' : ''} onchange="_cqCjForm.ativo=this.checked"> Ativo (oferecido na troca)</label>
    </div>
    <div class="form-section"><div class="form-section-title">${CQ_ICO.beaker}Produtos</div>
      ${prods.length || mats.length ? '' : '<div class="cq-nota cq-txt-amarelo">Nenhum produto preparado no laboratório nesta área. Marque “Preparado ou fracionado pelo laboratório” no cadastro do produto.</div>'}
      <div class="cq-cj-itens">${f.itens.map((x, k) => `<div class="cq-cj-lin">
        <select class="field-select" onchange="cqCjItem(${k},'produtoId',this.value)">${opts(x.produtoId)}</select>
        <input type="number" class="field-input" min="0" step="any" inputmode="decimal" value="${_cqEsc(x.quantidade ?? '')}" placeholder="Qtd." title="Quantidade de cada troca" oninput="cqCjItem(${k},'quantidade',this.value)">
        <select class="field-select" title="Unidade" onchange="cqCjItem(${k},'unidadeQtd',this.value)">${CQ_UNID_PREPARO.map(un => `<option ${un === (x.unidadeQtd || 'mL') ? 'selected' : ''}>${un}</option>`).join('')}</select>
        <button type="button" class="cq-icobtn" title="Remover produto" onclick="cqCjItemRemover(${k})">${CQ_ICO.lixo}</button>
      </div>`).join('')}</div>
      <button type="button" class="btn btn-outline btn-sm" style="margin-top:8px;" onclick="cqCjItemAdd()">${CQ_ICO.plus} Adicionar produto</button>
      <div class="cq-nota">A quantidade vem preenchida na troca e pode ser ajustada nela. Validade e aviso de troca são os do cadastro de cada produto.</div>
    </div>`;
}
function cqCjItem(k, campo, v) { if (_cqCjForm?.itens[k]) _cqCjForm.itens[k][campo] = v; }
function cqCjItemAdd() { _cqCjForm.itens.push({ produtoId: '', quantidade: '', unidadeQtd: 'mL' }); _cqCjRedesenhar(); }
function cqCjItemRemover(k) { _cqCjForm.itens.splice(k, 1); _cqCjRedesenhar(); }

async function cqConjuntoSalvar() {
  if (_cqSalvando) return;
  if (!_cqCan('configurar')) { showToast('Sem permissão para editar conjuntos de troca.', 'error'); return; }
  const f = _cqCjForm;
  const u = _cqUnidadeAtivaId();
  const nome = String(f.nome || '').trim();
  if (!nome) { showToast('Informe o nome do conjunto.', 'error'); return; }
  const itens = f.itens.filter(x => x.produtoId).map(x => {
    const q = Number(String(x.quantidade ?? '').replace(',', '.'));
    const ref = _cqTrEhMat(x.produtoId) ? { materialId: x.produtoId.slice(4) } : { produtoId: x.produtoId };
    return { ...ref, quantidade: q > 0 ? q : null, unidadeQtd: x.unidadeQtd || 'mL' };
  });
  if (!itens.length) { showToast('Inclua ao menos um produto.', 'error'); return; }
  if (new Set(itens.map(_cqTrKey)).size !== itens.length) { showToast('Produto ou controle repetido no conjunto.', 'error'); return; }
  const dup = _cqConjuntosDaUnidade(u, true).find(c => c.id !== f.id && _cqNormBusca(c.nome || '') === _cqNormBusca(nome));
  if (dup) { showToast('Já existe um conjunto com este nome nesta área.', 'error'); return; }
  const antes = f.id ? cqState.config.conjuntosPreparo[f.id] : null;
  const rec = { ...(antes || {}), id: f.id || _cqUid(), nome, itens, ativo: !!f.ativo, unidadeIds: _cqUnidadesRec(antes).length ? _cqUnidadesRec(antes) : [u] };
  if (!antes) { rec.criadoEm = _cqAgora(); rec.criadoPor = _cqAssinatura(); }
  const fmtItens = v => _cqArr(v).map(_cqConjuntoItemTxt).join(', ');
  const diffs = antes ? _cqDiff(antes, rec, { nome: 'Nome', itens: 'Produtos', ativo: 'Ativo' }, { itens: fmtItens, ativo: v => v === false ? 'Não' : 'Sim' }) : [];
  if (antes && !diffs.length) { cqDrawerClose(); return; }
  if (!_cqPodeGravar()) return;
  _cqTrilhaAdd(rec, antes ? 'edicao' : 'criacao', antes ? 'Conjunto alterado' : `Conjunto criado: ${fmtItens(itens)}`, diffs);
  _cqSalvando = true;
  try {
    if (await _cqSalvarRegistro('conjuntosPreparo', rec)) { showToast('Conjunto salvo.', 'success'); cqDrawerClose(); cqRender(); }
  } finally { _cqSalvando = false; }
}

// ── TROCA ────────────────────────────────────────────────────
// Rascunho: { u, cj, dh, resp, obs, finalizar, itens: { produtoId: { incluir, lote, qtd, un, valEdit, val, valMot } } }
let _cqTroca = null;

// Preparos em uso do produto na unidade (os que a troca finaliza): não finalizados, registrados
// até a data/hora da troca; o preparo "legado" (cadastro antigo, sem registro próprio) fica de fora
function _cqTrocaEmUso(produtoId, u, ate) {
  return _cqLotesDoProduto(produtoId).filter(i => _cqNaUnidade(i, u))
    .flatMap(i => _cqPreparosDe(i).map(p => ({ i, p })))
    .filter(({ p }) => !p.finalizado && !p.legado && (!ate || (p.dataHora || p.data || '') <= ate));
}

// Situação do conjunto na área: a validade mais próxima entre os preparos em uso dos produtos dele
// tipo: vencida | proxima | ok | nova (nunca trocado)
function _cqConjuntoSituacao(cj, u) {
  const hoje = _cqHoje(cqState.config.unidades[u]?.fuso);
  let prox = null, ultima = null, semUso = 0, aviso = null, algum = false;
  _cqConjuntoItens(cj).forEach(it => {
    const prod = cqState.config.insumoProdutos[it.produtoId];
    if (prod?.preparo?.avisoDias != null) aviso = Math.max(aviso ?? 0, Number(prod.preparo.avisoDias) || 0);
    const preps = it.materialId ? _cqCtlPrepsMaterial(it.materialId, u).map(x => x.p) : _cqLotesDoProduto(it.produtoId).filter(i => _cqNaUnidade(i, u)).flatMap(i => _cqPreparosDe(i));
    if (preps.length) algum = true;
    preps.forEach(p => { const d = p.dataHora || p.data; if (d && (!ultima || d > ultima)) ultima = d; });
    const uso = preps.filter(p => !p.finalizado && p.situacao !== 'reprovado');
    if (!uso.length) { if (preps.length) semUso++; return; }
    const v = uso.map(p => p.validade).filter(Boolean).sort().pop();
    if (v && (!prox || v < prox)) prox = v;
  });
  const dias = prox ? _cqPrepDias(hoje, prox) : null;
  if (!algum) return { tipo: 'nova', txt: 'nunca trocado', ultima, prox, dias };
  if (semUso || (dias !== null && dias < 0)) return { tipo: 'vencida', txt: dias !== null && dias < 0 ? `vencida há ${-dias} d` : 'produto sem preparo em uso', ultima, prox, dias };
  if (dias === null) return { tipo: 'ok', txt: 'sem validade', ultima, prox, dias };
  return { tipo: dias <= (aviso ?? 3) ? 'proxima' : 'ok', txt: dias === 0 ? 'vence hoje' : `vence em ${dias} d`, ultima, prox, dias };
}
// Conjuntos a trocar primeiro na área: os dos produtos com aviso (na ordem de urgência); sem aviso, o mais vencido
function _cqConjuntosSugeridos(u) {
  const cjs = _cqConjuntosDaUnidade(u);
  const out = [];
  _cqTrocasAlertas(u).forEach(a => {
    // Produto em mais de um conjunto: o menor (troca só o necessário)
    const cj = cjs.filter(c => _cqConjuntoItens(c).some(x => x.produtoId === a.produto.id))
      .sort((x, y) => _cqConjuntoItens(x).length - _cqConjuntoItens(y).length)[0];
    if (cj && !out.includes(cj)) out.push(cj);
  });
  if (!out.length) {
    const ord = { vencida: 0, proxima: 1, nova: 2, ok: 3 };
    cjs.map(c => ({ c, s: _cqConjuntoSituacao(c, u) })).sort((a, b) => ord[a.s.tipo] - ord[b.s.tipo] || (a.s.dias ?? 1e6) - (b.s.dias ?? 1e6))
      .slice(0, 1).forEach(x => out.push(x.c));
  }
  return out;
}
const CQ_CJ_DOT = { vencida: 'corr-rejeitada', proxima: 'corr-parcial', ok: 'corr-liberada', nova: 'corr-pendente' };

// Seletor do conjunto na troca: popover com produtos, última troca e situação
function _cqTrocaCjPopHTML(cjs, atual, u) {
  const linha = (c, sel) => {
    const s = _cqConjuntoSituacao(c, u);
    const itens = _cqConjuntoItens(c);
    const nomes = itens.map(x => _cqTrNome(_cqTrKey(x)) || '?').join(', ');
    return `<span class="cq-sitpop-marca"><span class="cq-sitpop-dot st-${CQ_CJ_DOT[s.tipo]}"></span></span>
      <span class="cq-tr-cj-txt"><span class="cq-tr-cj-l1"><b>${_cqEsc(c.nome)}</b><span class="cq-tr-cj-sit ${s.tipo}">${_cqEsc(s.txt)}</span></span>
        <small title="${_cqEsc(nomes)}">${itens.length} produto${itens.length === 1 ? '' : 's'} · ${s.ultima ? `última troca ${_cqFmtData(s.ultima)}` : 'sem trocas'}${sel ? '' : ` · ${_cqEsc(nomes)}`}</small></span>`;
  };
  const sel = cjs.find(c => c.id === atual) || cjs[0];
  return `<div class="cq-sitpop cq-tr-cj" id="cq-tr-cj-pop">
    <button type="button" class="cq-sitpop-btn" onclick="cqSitPopAbrir('cq-tr-cj')" aria-haspopup="listbox">${linha(sel, true)}
      <svg class="cq-sitpop-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></button>
    <div class="cq-sitpop-menu" role="listbox">${cjs.map(c => `<button type="button" class="cq-sitpop-op${c.id === sel.id ? ' sel' : ''}" onclick="cqTrocaCjEscolher('${c.id}')">${linha(c, false)}
      <svg class="cq-sitpop-ok" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><polyline points="20 6 9 17 4 12"/></svg></button>`).join('')}</div>
  </div>`;
}
function cqTrocaCjEscolher(id) {
  document.getElementById('cq-tr-cj-pop')?.classList.remove('aberto');
  if (_cqTroca && _cqTroca.cj !== id) cqTrocaCampo('cj', id, true);
}

// Situação da troca de um produto na área (seletor da troca fracionada): mesma regra do aviso
function _cqProdutoTrocaSit(pid, u) {
  if (_cqTrEhMat(pid)) return _cqCtlTrocaSit(pid.slice(4), u);
  const hoje = _cqHoje(cqState.config.unidades[u]?.fuso);
  const prod = cqState.config.insumoProdutos[pid];
  const preps = _cqLotesDoProduto(pid).filter(i => _cqNaUnidade(i, u)).flatMap(i => _cqPreparosDe(i));
  if (!preps.length) return { tipo: 'nova', txt: 'nunca preparado', uso: [] };
  const uso = preps.filter(p => !p.finalizado && p.situacao !== 'reprovado');
  if (!uso.length) return { tipo: 'vencida', txt: 'sem preparo em uso', uso };
  const v = uso.map(p => p.validade).filter(Boolean).sort().pop();
  if (!v) return { tipo: 'ok', txt: 'sem validade', uso };
  const dias = _cqPrepDias(hoje, v);
  const aviso = prod?.preparo?.avisoDias != null ? Math.max(0, Number(prod.preparo.avisoDias) || 0) : 3;
  if (dias < 0) return { tipo: 'vencida', txt: `vencida há ${-dias} d`, uso, dias };
  return { tipo: dias <= aviso ? 'proxima' : 'ok', txt: dias === 0 ? 'vence hoje' : `vence em ${dias} d`, uso, dias };
}
// Produtos que podem entrar numa troca fracionada: preparados no laboratório, ativos, da área
function _cqTrocaProdutos(u) {
  return _cqDaUnidade('insumoProdutos', u).filter(p => p.ativo !== false && p.preparoInterno)
    .concat(_cqCtlMateriaisPrep(u).map(m => ({ id: 'mat:' + m.id, nome: m.nome, fabricante: m.fabricante, ctl: m })));
}
// Quantidade e unidade padrão do produto na troca fracionada: as do primeiro conjunto que o contém
function _cqTrocaFracItem(pid, u) {
  for (const c of _cqConjuntosDaUnidade(u)) {
    const it = _cqConjuntoItens(c).find(x => _cqTrKey(x) === pid);
    if (it) return it;
  }
  const m = _cqTrMat(pid);
  const pf = m ? m.preparo : cqState.config.insumoProdutos[pid]?.preparo;
  return m ? { materialId: m.id, quantidade: pf?.volume ?? '', unidadeQtd: pf?.unidadeQtd || 'mL' } : { produtoId: pid, quantidade: pf?.volume ?? '', unidadeQtd: pf?.unidadeQtd || 'mL' };
}

// Seletor da troca fracionada: popover com busca e multisseleção, produtos agrupados por conjunto
// (os mais urgentes primeiro); quem não está em conjunto fica em "Fora de conjunto"
function _cqTrocaAddPopHTML(u, dia) {
  const t = _cqTroca;
  const prods = _cqTrocaProdutos(u).filter(p => _cqProdutoPassaSetor(p.ctl || p, u));
  const ord = { vencida: 0, proxima: 1, nova: 2, ok: 3 };
  const sits = {};
  prods.forEach(p => { sits[p.id] = _cqProdutoTrocaSit(p.id, u); });
  const porUrg = (a, b) => ord[sits[a.id].tipo] - ord[sits[b.id].tipo] || (sits[a.id].dias ?? 1e6) - (sits[b.id].dias ?? 1e6) || a.nome.localeCompare(b.nome, 'pt');
  const ids = new Set(prods.map(p => p.id));
  const grupos = _cqConjuntosDaUnidade(u)
    .map(c => ({ cj: c, prods: _cqConjuntoItens(c).map(_cqTrKey).filter(id => ids.has(id)).map(id => prods.find(p => p.id === id)) }))
    .filter(g => g.prods.length);
  const emCj = new Set(grupos.flatMap(g => g.prods.map(p => p.id)));
  const soltos = prods.filter(p => !emCj.has(p.id));
  if (soltos.length) grupos.push({ cj: null, prods: soltos });
  const sel = new Set(t.sel);
  const item = p => {
    const s = sits[p.id];
    const nl = p.ctl ? _cqCtlLotesMaterial(p.ctl.id, u, dia).length : _cqPrepLotesValidos(p.id, u, dia).length;
    const usoTxt = s.uso.length ? `em uso: ${s.uso.map(x => x.codigo || _cqFmtData(x.data)).join(', ')}` : '';
    return `<button type="button" class="cq-sitpop-op cq-tr-add-op${sel.has(p.id) ? ' sel' : ''}" data-pid="${p.id}" data-b="${_cqEsc(_cqNormBusca(`${p.nome} ${p.fabricante || ''}`))}" onclick="cqTrocaFracToggle('${p.id}')">
      <span class="cq-sitpop-marca"><span class="cq-sitpop-dot st-${CQ_CJ_DOT[s.tipo]}"></span></span>
      <span class="cq-tr-cj-txt"><span class="cq-tr-cj-l1"><b>${_cqEsc(p.nome)}</b><span class="cq-tr-cj-sit ${s.tipo}">${_cqEsc(s.txt)}</span></span>
        <small>${_cqEsc([usoTxt, nl ? `${nl} lote${nl === 1 ? '' : 's'} disponíve${nl === 1 ? 'l' : 'is'}` : 'sem lote dentro da validade'].filter(Boolean).join(' · '))}</small></span>
      <span class="cq-tr-add-chk" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2"><polyline points="20 6 9 17 4 12"/></svg></span></button>`;
  };
  const tit = g => {
    const todos = g.prods.every(p => sel.has(p.id));
    return `<div class="cq-tp-grupo-tit">${g.cj ? CQ_ICO.lista : CQ_ICO.beaker}${_cqEsc(g.cj ? g.cj.nome : 'Fora de conjunto')}
      ${g.cj ? `<button type="button" class="cq-tr-add-todos" data-cj="${g.cj.id}" onclick="cqTrocaFracGrupo('${g.cj.id}')">${todos ? 'Desmarcar todos' : 'Marcar todos'}</button>` : `<span>${g.prods.length}</span>`}</div>`;
  };
  const nomes = t.sel.map(_cqTrNome).filter(Boolean);
  return `<div class="cq-sitpop cq-tp cq-tr-add${nomes.length ? ' tem' : ''}" id="cq-tr-add-pop">
    <button type="button" class="cq-sitpop-btn" onclick="cqSitPopAbrir('cq-tr-add');setTimeout(()=>document.getElementById('cq-tr-add-busca')?.focus(),40)">
      <span class="cq-sitpop-marca"><span class="cq-sitpop-ico">${CQ_ICO.plus}</span></span>
      <span class="cq-tp-rot" id="cq-tr-add-rot">${_cqTrocaAddRotHTML(nomes)}</span>
      <svg class="cq-sitpop-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></button>
    <div class="cq-sitpop-menu cq-tp-menu">
      <div class="cq-tp-busca">${CQ_ICO.busca}<input type="text" id="cq-tr-add-busca" placeholder="Buscar produto ou fabricante…" autocomplete="off" oninput="cqTrocaFracFiltrar(this.value)"></div>
      <div class="cq-tp-lista">${grupos.map(g => `<div class="cq-tp-grupo">${tit(g)}${[...g.prods].sort(porUrg).map(item).join('')}</div>`).join('')
        || '<div class="cq-ms-vazio">Nenhum produto preparado no laboratório nesta área.</div>'}
        <div class="cq-ms-vazio cq-tp-nada" hidden>Nenhum produto encontrado.</div></div>
      <div class="cq-tr-add-pe"><span id="cq-tr-add-n">${_cqTrocaAddNTxt(t.sel.length)}</span>
        <button type="button" class="btn btn-primary btn-sm" onclick="document.getElementById('cq-tr-add-pop')?.classList.remove('aberto')">Concluir</button></div>
    </div>
  </div>`;
}
function _cqTrocaAddRotHTML(nomes) {
  return nomes.length
    ? `<b>${nomes.length} produto${nomes.length === 1 ? '' : 's'} para trocar</b><small>${_cqEsc(nomes.join(', '))}</small>`
    : '<b>Adicionar produtos</b><small>Escolha quais preparos trocar agora</small>';
}
function _cqTrocaAddNTxt(n) { return n ? `${n} selecionado${n === 1 ? '' : 's'}` : 'Nenhum selecionado'; }
function cqTrocaFracFiltrar(q) {
  const s = _cqNormBusca(q || '').trim();
  let algum = false;
  document.querySelectorAll('#cq-tr-add-pop .cq-tp-grupo').forEach(g => {
    let vis = 0;
    g.querySelectorAll('.cq-sitpop-op').forEach(b => { const ok = !s || b.dataset.b.includes(s); b.hidden = !ok; if (ok) vis++; });
    g.hidden = !vis;
    if (vis) algum = true;
  });
  const nada = document.querySelector('#cq-tr-add-pop .cq-tp-nada');
  if (nada) nada.hidden = algum;
}
// Marcar e desmarcar não fecha o popover: atualiza só as marcas, o rótulo e a lista de produtos
function _cqTrocaFracAtualizar() {
  const t = _cqTroca;
  const sel = new Set(t.sel);
  const pop = document.getElementById('cq-tr-add-pop');
  if (pop) {
    pop.classList.toggle('tem', !!t.sel.length);
    pop.querySelectorAll('.cq-tr-add-op').forEach(b => b.classList.toggle('sel', sel.has(b.dataset.pid)));
    pop.querySelectorAll('.cq-tr-add-todos').forEach(b => {
      const g = b.closest('.cq-tp-grupo');
      const ids = [...(g ? g.querySelectorAll('.cq-tr-add-op') : [])].map(x => x.dataset.pid);
      b.textContent = ids.length && ids.every(id => sel.has(id)) ? 'Desmarcar todos' : 'Marcar todos';
    });
  }
  const rot = document.getElementById('cq-tr-add-rot');
  if (rot) rot.innerHTML = _cqTrocaAddRotHTML(t.sel.map(_cqTrNome).filter(Boolean));
  const n = document.getElementById('cq-tr-add-n');
  if (n) n.textContent = _cqTrocaAddNTxt(t.sel.length);
  const l = document.getElementById('cq-tr-lista');
  if (l) l.innerHTML = _cqTrocaListaHTML();
}
function cqTrocaFracToggle(pid, redesenhar) {
  const t = _cqTroca;
  if (!t) return;
  t.sel = t.sel.includes(pid) ? t.sel.filter(x => x !== pid) : [...t.sel, pid];
  if (redesenhar) _cqTrocaRedesenhar(); else _cqTrocaFracAtualizar();
}
// "Marcar todos" do grupo: inclui os produtos do conjunto que faltam (ou tira todos, se já estão)
function cqTrocaFracGrupo(cjId) {
  const t = _cqTroca;
  if (!t) return;
  const validos = new Set(_cqTrocaProdutos(t.u).map(p => p.id));
  const ids = _cqConjuntoItens(cqState.config.conjuntosPreparo[cjId]).map(_cqTrKey).filter(id => validos.has(id));
  t.sel = ids.every(id => t.sel.includes(id)) ? t.sel.filter(id => !ids.includes(id)) : [...t.sel, ...ids.filter(id => !t.sel.includes(id))];
  _cqTrocaFracAtualizar();
}
// Aba escolhida (Em lote / Fracionado) fica salva nesta estação para a próxima troca
function _cqTrocaModoSalvo() { try { return localStorage.getItem('cq-troca-modo') === 'fracionado' ? 'fracionado' : 'lote'; } catch (e) { return 'lote'; } }
function cqTrocaModo(m) {
  if (!_cqTroca || _cqTroca.modo === m) return;
  _cqTroca.modo = m;
  try { localStorage.setItem('cq-troca-modo', m); } catch (e) { /* sem armazenamento: só não lembra */ }
  _cqTrocaRedesenhar();
}

// Sem conjunto indicado, abre o sugerido (troca mais urgente da área)
function cqTrocaAbrir(cjId) {
  if (!_cqPodeRegistrarPreparo()) { showToast('Sem permissão para registrar preparos.', 'error'); return; }
  const u = _cqUnidadeAtivaId();
  const cjs = _cqConjuntosDaUnidade(u);
  if (!cjs.length) { showToast(_cqCan('configurar') ? 'Crie primeiro um conjunto de troca (botão Conjuntos).' : 'Nenhum conjunto de troca nesta área.', 'error'); return; }
  const cj = cjs.find(c => c.id === cjId) || _cqConjuntosSugeridos(u)[0] || cjs[0];
  _cqTroca = { u, modo: _cqTrocaModoSalvo(), cj: cj.id, sel: [], dh: '', resp: _cqSess().id, obs: '', finalizar: true, itens: {} };
  cqDrawerOpen({
    titulo: 'Trocar conjunto', subtitulo: 'Um preparo por produto, com a mesma data, hora e responsável', icone: 'repeat',
    corpo: '<div id="cq-tr-wrap" class="cq-prep-modal"></div>',
    rodape: `<div></div><div style="display:flex;gap:8px;"><button class="btn btn-outline" onclick="cqDrawerClose()">Cancelar</button>
      <button class="btn btn-primary" onclick="cqTrocaRegistrar()">${CQ_ICO.repeat} Registrar troca</button></div>`,
  });
  _cqTrocaRedesenhar();
}
function _cqTrocaRedesenhar() { const w = document.getElementById('cq-tr-wrap'); if (w && _cqTroca) w.innerHTML = _cqTrocaHTML(); }
function cqTrocaCampo(k, v, redesenhar) {
  if (!_cqTroca) return;
  _cqTroca[k] = v;
  // Outro conjunto: todos os produtos voltam a entrar (lote e quantidade digitados ficam)
  if (k === 'cj') Object.values(_cqTroca.itens).forEach(x => { x.incluir = true; });
  // Data mudou: lotes e validades são recalculados para o novo dia
  if (k === 'dh') Object.values(_cqTroca.itens).forEach(x => { x.val = ''; });
  if (redesenhar) _cqTrocaRedesenhar();
}
function cqTrocaItem(pid, k, v, redesenhar) {
  const x = _cqTroca?.itens[pid];
  if (!x) return;
  x[k] = v;
  if (k === 'lote' || (k === 'valEdit' && !v)) { x.val = ''; if (k === 'valEdit') x.valMot = ''; }
  if (redesenhar) _cqTrocaRedesenhar();
}

// Produtos da troca: em lote, os do conjunto (cada um pode ficar de fora); fracionada, os escolhidos
function _cqTrocaFonte() {
  const t = _cqTroca;
  if (t.modo === 'fracionado') return t.sel.map(pid => _cqTrocaFracItem(pid, t.u));
  return _cqConjuntoItens(cqState.config.conjuntosPreparo[t.cj]);
}
function _cqTrocaListaHTML() {
  const t = _cqTroca;
  const u = t.u;
  const frac = t.modo === 'fracionado';
  const dh = t.dh || _cqNowLocal().slice(0, 16);
  const dia = dh.slice(0, 10);
  const item = it => {
    const key = _cqTrKey(it);
    // Quantidade: a do conjunto; sem ela, o volume padrão do produto
    const pfp = !it.materialId ? cqState.config.insumoProdutos[it.produtoId]?.preparo : null;
    const x = t.itens[key] = t.itens[key] || { incluir: true, lote: '', qtd: it.quantidade ?? pfp?.volume ?? '', un: it.quantidade ? (it.unidadeQtd || 'mL') : (pfp?.unidadeQtd || (it.materialId ? _cqTrMat(key)?.preparo?.unidadeQtd : '') || it.unidadeQtd || 'mL'), valEdit: false, val: '', valMot: '' };
    if (it.materialId) return _cqCtlTrocaItemHTML(key, x, t, frac, dia, dh);
    const p = cqState.config.insumoProdutos[it.produtoId];
    if (!p) { x.incluir = false; return '<div class="cq-tr-item off"><b class="cq-muted">Produto removido do cadastro</b></div>'; }
    const pid = p.id;
    const incluir = frac || x.incluir;
    const lotes = _cqPrepLotesValidos(pid, u, dia);
    if (!lotes.some(l => l.id === x.lote)) x.lote = lotes[0]?.id || '';
    const ins = x.lote ? cqState.config.insumos[x.lote] : null;
    const padrao = ins ? _cqPrepValidade(ins, dia) : null;
    const val = ins ? (x.valEdit && x.val ? x.val : padrao) : null;
    const emUso = _cqTrocaEmUso(pid, u, dh);
    const usoTxt = emUso.length
      ? `Em uso: ${emUso.map(({ p: a }) => `${a.codigo || _cqFmtData(a.data)} (val. ${_cqFmtData(a.validade)})`).join(', ')}${t.finalizar ? ' — será finalizado' : ''}`
      : 'Nenhum preparo em uso';
    const cab = frac
      ? `<span class="cq-tr-nome"><b>${_cqEsc(p.nome)}</b></span>`
      : `<label class="cq-tr-sw" title="${incluir ? 'Entra nesta troca — clique para deixar de fora' : 'Fora desta troca — clique para incluir'}"><input type="checkbox" ${incluir ? 'checked' : ''} onchange="cqTrocaItem('${pid}','incluir',this.checked,true)"><span class="cq-sw" aria-hidden="true"></span><b>${_cqEsc(p.nome)}</b>${incluir ? '' : '<small>fora desta troca</small>'}</label>`;
    return `<div class="cq-tr-item${incluir ? '' : ' off'}">
      <div class="cq-tr-cab">
        ${cab}
        <span class="cq-tr-cab-dir">${incluir && val ? `<span class="cq-tr-val${val !== padrao ? ' alterada' : ''}" title="Validade do novo preparo">val. ${_cqFmtData(val)} · ${_cqPrepDias(dia, val)} d
          <button type="button" class="cq-pf-val-alt" onclick="cqTrocaItem('${pid}','valEdit',${!x.valEdit},true)">${x.valEdit ? 'Usar padrão' : 'Alterar'}</button></span>` : ''}
          ${frac ? `<button type="button" class="cq-sitpop-x" title="Tirar da troca" onclick="cqTrocaFracToggle('${pid}',true)">×</button>` : ''}</span>
      </div>
      ${incluir ? `<div class="cq-tr-campos">
          <div class="form-field"><label class="field-label">Lote</label>
            <select class="field-select" ${lotes.length ? '' : 'disabled'} onchange="cqTrocaItem('${pid}','lote',this.value,true)">${lotes.length
              ? lotes.map(l => `<option value="${l.id}" ${l.id === x.lote ? 'selected' : ''}>${_cqEsc(l.lote)} · val. ${_cqFmtData(l.validade)}${(l.status || 'em_uso') === 'em_avaliacao' ? ' · em avaliação' : ''}</option>`).join('')
              : '<option value="">Nenhum lote em uso dentro da validade</option>'}</select></div>
          <div class="form-field"><label class="field-label">Quantidade <span class="required">*</span></label>
            <div class="cq-pf-qtd"><input type="number" class="field-input" min="0" step="any" inputmode="decimal" value="${_cqEsc(x.qtd)}" placeholder="0" oninput="cqTrocaItem('${pid}','qtd',this.value)">
              <select class="field-select" title="Unidade" onchange="cqTrocaItem('${pid}','un',this.value)">${CQ_UNID_PREPARO.map(un => `<option ${un === x.un ? 'selected' : ''}>${un}</option>`).join('')}</select></div></div>
        </div>
        ${ins && x.valEdit ? _cqPrepValidadeEditHTML({ id: 'cq-tr-val-' + pid, dia, padrao, max: ins.validade, valor: val, motivo: x.valMot,
            onData: `cqTrocaItem('${pid}','val',this.value,true)`, onMotivo: `cqTrocaItem('${pid}','valMot',this.value)` }) : ''}
        <div class="cq-muted cq-tr-uso">${_cqEsc(usoTxt)}</div>` : ''}
    </div>`;
  };
  const fonte = _cqTrocaFonte();
  if (frac && !fonte.length) return `<div class="cq-tr-vazio">${CQ_ICO.beaker}<b>Nenhum produto escolhido</b><span>Use “Adicionar produtos” para escolher quais preparos trocar agora.</span></div>`;
  return fonte.map(item).join('');
}

function _cqTrocaHTML() {
  const t = _cqTroca;
  const u = t.u;
  const frac = t.modo === 'fracionado';
  const agora = _cqNowLocal().slice(0, 16);
  const dh = t.dh || agora;
  const resps = _cqPrepResponsaveis(u);
  if (!resps.some(x => x.id === t.resp)) t.resp = resps.some(x => x.id === _cqSess().id) ? _cqSess().id : (resps[0]?.id || '');
  const aba = (k, ico, tit, sub) => `<button type="button" role="tab" aria-selected="${t.modo === k}" class="${t.modo === k ? 'active' : ''}" onclick="cqTrocaModo('${k}')">${ico}<span><b>${tit}</b><small>${sub}</small></span></button>`;
  return `<div class="cq-tr-modo" role="tablist" aria-label="Tipo de troca">
      ${aba('lote', CQ_ICO.lista, 'Em lote', 'Todos os produtos do conjunto')}
      ${aba('fracionado', CQ_ICO.beaker, 'Fracionado', 'Só os produtos escolhidos')}
    </div>
    ${frac ? `<div class="form-field"><label class="field-label">Produtos</label>${_cqTrocaAddPopHTML(u, dh.slice(0, 10))}</div>`
      : `<div class="form-field"><label class="field-label">Conjunto</label>${_cqTrocaCjPopHTML(_cqConjuntosDaUnidade(u), t.cj, u)}</div>`}
    <div class="cq-tr-lista" id="cq-tr-lista">${_cqTrocaListaHTML()}</div>
    <div class="cq-prep-form-grid" style="margin-top:14px;">
      <div class="form-field"><label class="field-label">Data e hora da troca</label>
        <input type="datetime-local" class="field-input" max="${agora}" value="${dh}" onchange="cqTrocaCampo('dh',this.value,true)"></div>
      <div class="form-field"><label class="field-label">Responsável</label>
        ${resps.length ? _cqUsuarioPopHTML('cq-tr-resp', u, resps, t.resp, v => { if (_cqTroca) _cqTroca.resp = v; })
          : '<div class="cq-nota cq-txt-amarelo">Nenhum membro da área com permissão de lançar no CQ. Inclua os membros em Configurações › Área.</div>'}</div>
      <div class="form-field cq-pf-obs"><label class="field-label">Observações</label>
        <textarea class="field-textarea" maxlength="500" rows="3" placeholder="Opcional — vale para todos os preparos da troca" oninput="cqTrocaCampo('obs',this.value)">${_cqEsc(t.obs)}</textarea></div>
    </div>
    <div class="cq-sw-lista" style="margin-top:12px;"><label class="cq-sw-row">
      <span class="cq-sw-txt"><b>Finalizar os preparos em uso</b><small>Os preparos atuais destes produtos são substituídos pela troca</small></span>
      <input type="checkbox" ${t.finalizar ? 'checked' : ''} onchange="cqTrocaCampo('finalizar',this.checked,true)"><span class="cq-sw" aria-hidden="true"></span></label></div>`;
}

async function cqTrocaRegistrar() {
  if (!_cqPodeRegistrarPreparo()) { showToast('Sem permissão para registrar preparos.', 'error'); return; }
  if (_cqSalvando || !_cqTroca) return;
  const t = _cqTroca;
  const frac = t.modo === 'fracionado';
  const cj = frac ? null : cqState.config.conjuntosPreparo[t.cj];
  if (!frac && !cj) { showToast('Escolha o conjunto.', 'error'); return; }
  if (frac && !t.sel.length) { showToast('Adicione ao menos um produto para trocar.', 'error'); return; }
  const agora = _cqNowLocal().slice(0, 16);
  const dh = t.dh || agora;
  const dia = dh.slice(0, 10);
  if (dh > agora) { showToast('Data e hora da troca no futuro.', 'error'); return; }
  if (!t.resp) { showToast('Informe o responsável.', 'error'); return; }
  const hoje = _cqHoje();
  const plano = [];
  for (const it of _cqTrocaFonte()) {
    const x = t.itens[_cqTrKey(it)];
    if (!x || (!frac && !x.incluir)) continue;
    if (it.materialId) {
      const pc = _cqCtlTrocaPlano(_cqTrKey(it), x, t, dia);
      if (!pc) return;
      plano.push(pc);
      continue;
    }
    const p = cqState.config.insumoProdutos[it.produtoId];
    const ins = x.lote ? cqState.config.insumos[x.lote] : null;
    if (!p || !ins) { showToast(`${p?.nome || 'Produto'}: nenhum lote em uso dentro da validade. ${frac ? 'Tire o produto da troca' : 'Desmarque o produto'} ou cadastre o lote.`, 'error'); return; }
    if (!_cqPrepLotesValidos(p.id, t.u, dia).some(l => l.id === ins.id)) { showToast(`${p.nome}: lote ${ins.lote} vencido, em quarentena ou encerrado na data da troca.`, 'error'); return; }
    const qtd = Number(String(x.qtd ?? '').replace(',', '.'));
    if (!(qtd > 0)) { showToast(`${p.nome}: informe a quantidade.`, 'error'); return; }
    const padrao = _cqPrepValidade(ins, dia);
    const alterada = x.valEdit && x.val && x.val !== padrao;
    if (alterada) {
      const erro = _cqPrepValidadeErro({ nova: x.val, dia, max: ins.validade, ref: padrao });
      if (erro) { showToast(`${p.nome}: ${erro}`, 'error'); return; }
      if (!String(x.valMot || '').trim()) { showToast(`${p.nome}: informe a justificativa da validade alterada.`, 'error'); return; }
    }
    const validade = alterada ? x.val : padrao;
    if (validade && validade < hoje) { showToast(`${p.nome}: preparo já vencido (validade ${_cqFmtData(validade)}).`, 'error'); return; }
    plano.push({ p, ins, qtd, un: x.un, validade, padrao, motivoVal: alterada ? x.valMot : '' });
  }
  if (!plano.length) { showToast('Marque ao menos um produto para trocar.', 'error'); return; }
  if (!_cqPodeGravar()) return;
  const ass = _cqAssinatura();
  // Troca fracionada: sem conjunto; o código `troca` liga os preparos registrados juntos
  const conjunto = frac ? { fracionada: true, nome: 'Troca fracionada', troca: _cqUid(), produtos: plano.length } : { id: cj.id, nome: cj.nome, troca: _cqUid() };
  const updates = {};
  const novos = [], finalizados = [], ctls = [];
  const seqLote = {};
  plano.forEach((x, k) => {
    if (x.ctl) {
      const r = _cqCtlTrocaGravar(updates, x, k, { dia, dh, respId: t.resp, obs: t.obs, conjunto, finalizar: t.finalizar, u: t.u,
        motivoFin: `Substituído na ${frac ? 'troca fracionada' : `troca do conjunto ${cj.nome}`}` }, ass);
      ctls.push({ x, r });
      return;
    }
    seqLote[x.ins.id] = (seqLote[x.ins.id] ?? _cqPrepSeq(x.ins) - 1) + 1;
    const obj = _cqPrepMontar(x.ins, { dia, dh, respId: t.resp, qtd: x.qtd, un: x.un, obs: t.obs, validade: x.validade, padrao: x.padrao, motivoVal: x.motivoVal, conjunto, origem: 'troca' }, ass, seqLote[x.ins.id]);
    const base = `${CQ_KEYS.config}/insumos/${x.ins.id}`;
    updates[`${base}/preparos/${obj.id}`] = obj;
    updates[`${base}/atualizadoEm`] = ass.em;
    updates[`${base}/trilha/${_cqTk()}n${k}`] = _cqTrilhaEntry('edicao', _cqPrepTrilhaTxt(obj));
    novos.push({ ins: x.ins, obj });
    if (!t.finalizar) return;
    _cqTrocaEmUso(x.p.id, t.u, dh).forEach(({ i, p: ant }, j) => {
      const pb = `${CQ_KEYS.config}/insumos/${i.id}/preparos/${ant.id}`;
      const motivo = `Substituído pelo preparo ${obj.codigo} na ${frac ? 'troca fracionada' : `troca do conjunto ${cj.nome}`}`;
      const fin = { auto: false, motivo, ...ass };
      updates[`${pb}/finalizado`] = fin;
      updates[`${pb}/historico/${_cqTk()}${k}${j}`] = { de: ant.situacao || 'em_avaliacao', para: ant.situacao || 'em_avaliacao', finalizado: true, motivo, ...ass };
      updates[`${CQ_KEYS.config}/insumos/${i.id}/atualizadoEm`] = ass.em;
      updates[`${CQ_KEYS.config}/insumos/${i.id}/trilha/${_cqTk()}f${k}${j}`] = _cqTrilhaEntry('edicao', `Preparo ${ant.codigo || 'de ' + _cqFmtData(ant.data)} finalizado: ${motivo}`,
        [{ campo: 'Preparo finalizado', antes: 'Não', depois: 'Sim' }]);
      finalizados.push({ i, id: ant.id, fin });
    });
  });
  _cqSalvando = true;
  try {
    if (!(await window.dbUpdate(updates))) { showToast('Falha ao gravar. Verifique a conexão. Nada foi registrado.', 'error'); return; }
  } finally { _cqSalvando = false; }
  // Memória local até o listener do banco trazer os dados (as etiquetas leem daqui)
  novos.forEach(({ ins, obj }) => {
    const cru = _cqLoteCru(ins);
    (cru.preparos = cru.preparos || {})[obj.id] = obj;
    if (ins !== cru) ins.preparos = cru.preparos;
  });
  finalizados.forEach(({ i, id, fin }) => { const pr = _cqLoteCru(i).preparos?.[id]; if (pr) pr.finalizado = fin; });
  ctls.forEach(({ x, r }) => _cqCtlTrocaAplicarLocal(x, r));
  _cqTroca = null;
  cqDrawerClose();
  cqRender();
  _cqAtualizarAlertasPreparo();
  const nCtl = ctls.reduce((s, c) => s + c.r.novos.length, 0), fCtl = ctls.reduce((s, c) => s + c.r.fins.length, 0);
  showToast(`Troca registrada: ${novos.length + nCtl} preparo(s)${finalizados.length + fCtl ? `, ${finalizados.length + fCtl} finalizado(s)` : ''}.`, 'success');
  cqModalOpen({
    titulo: 'Troca registrada', subtitulo: `${frac ? 'Troca fracionada' : cj.nome} · ${_cqFmtDH(dh)}`, icone: 'repeat', largura: '620px',
    corpo: `<div class="cq-nota" style="margin-bottom:10px;">Identifique as cubas ou frascos com a etiqueta de cada preparo (RDC 978, art. 101).</div>
      <div class="cq-cj-lista">${novos.map(({ ins, obj }) => `<div class="cq-cj-item">
        <div class="cq-cj-info"><b>${_cqEsc(obj.codigo)}</b><small>${_cqEsc(ins.nome)} · lote ${_cqEsc(ins.lote)} · val. ${_cqFmtData(obj.validade)}</small></div>
        <div class="cq-cj-acoes"><button class="btn btn-outline btn-sm" onclick="cqImprimirRotulo('${ins.id}','${obj.id}')">${CQ_ICO.print} Etiqueta</button>
          <button class="cq-icobtn" title="Baixar etiqueta em PDF" onclick="cqEtqBaixar('${ins.id}','${obj.id}')">${CQ_ICO.baixar}</button></div>
      </div>`).join('')}${ctls.map(({ x, r }) => `<div class="cq-cj-item">
        <div class="cq-cj-info"><b>${_cqEsc(r.novos.map(p => p.codigo).join(', '))}</b><small>${_cqEsc(x.m.nome)} · lote ${_cqEsc(x.l.lote)} · val. ${_cqFmtData(x.validade)} · uma etiqueta por nível</small></div>
        <div class="cq-cj-acoes"><button class="btn btn-outline btn-sm" onclick="cqCtlEtq('${x.l.id}','${r.novos.map(p => p.id).join(',')}')">${CQ_ICO.print} Etiquetas (${r.novos.length})</button></div>
      </div>`).join('')}</div>`,
    rodape: '<div></div><button class="btn btn-primary" onclick="cqModalClose()">Fechar</button>',
  });
  _cqModalRodapeEntre();
}

// ── AVISOS DE TROCA ──────────────────────────────────────────
// Por produto com "Avisar a troca": a maior validade entre os preparos em uso na unidade.
// Vencida → danger; dentro do aviso → warning; produto que já teve preparo e ficou sem nenhum em uso → danger.
function _cqTrocasAlertas(u) {
  if (!u || !_cqConfigReady) return [];
  const hoje = _cqHoje(cqState.config.unidades[u]?.fuso);
  const out = [];
  _cqDaUnidade('insumoProdutos', u).filter(p => p.ativo !== false && p.preparoInterno && p.preparo?.avisoDias != null && _cqProdutoPassaSetor(p, u)).forEach(p => {
    const preps = _cqLotesDoProduto(p.id).filter(i => _cqNaUnidade(i, u)).flatMap(i => _cqPreparosDe(i));
    if (!preps.length) return;
    const emUso = preps.filter(x => !x.finalizado && x.situacao !== 'reprovado');
    if (!emUso.length) { out.push({ u, produto: p, tipo: 'danger', msg: 'Sem preparo em uso', dias: null, validade: null }); return; }
    const validade = emUso.map(x => x.validade).filter(Boolean).sort().pop();
    if (!validade) return;
    const dias = _cqPrepDias(hoje, validade);
    const aviso = Math.max(0, Number(p.preparo.avisoDias) || 0);
    if (dias < 0) out.push({ u, produto: p, tipo: 'danger', msg: `Troca vencida há ${-dias} dia(s)`, dias, validade });
    else if (dias <= aviso) out.push({ u, produto: p, tipo: 'warning', msg: dias === 0 ? 'Troca vence hoje' : `Troca vence em ${dias} dia(s)`, dias, validade });
  });
  return out.sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === 'danger' ? -1 : 1) || (a.dias ?? -1e6) - (b.dias ?? -1e6));
}
// Unidades visíveis ao usuário (sem as de validação do sistema)
function _cqTrocasAlertasTodas() {
  if (!_cqConfigReady) return [];
  return _cqUnidadesVisiveis().filter(un => !un.validacao).flatMap(un => _cqTrocasAlertas(un.id).map(a => ({ ...a, un })));
}
// Sino de alertas (script.js, getNotifAlerts('rotina')): mesmo formato dos alertas de tarefa
window.cqNotifAlertas = function () {
  if (typeof authCanViewTab === 'function' && !authCanViewTab('cq')) return [];
  return _cqTrocasAlertasTodas().map(a => ({
    isCQ: true, cqUnidade: a.u, tipo: a.tipo, rotinaNome: _cqEsc(a.produto.nome), tarefaNome: _cqEsc(a.produto.nome),
    equipNome: _cqEsc(`CQ ${a.un.sigla || ''} · troca de preparo`.replace('  ', ' ')), equipCodigo: '', msg: a.msg,
    diffDays: a.dias ?? -9999, proximaData: a.validade || null,
  }));
};
// Clique no alerta: abre o CQ na unidade do alerta, aba Preparos
function cqAbrirTrocaAlerta(u) {
  if (typeof switchTab === 'function') switchTab('cq');
  if (u && u !== _cqUnidadeAtivaId() && _cqUnidadesVisiveis().some(x => x.id === u)) cqSetUnidade(u);
  cqAbrirPreparos();
}
// Atualiza sino, selo da aba e painel (cadastros mudaram, troca registrada ou virada do dia)
function _cqAtualizarAlertasPreparo() {
  if (typeof updateNotifBadge === 'function') updateNotifBadge();
  if (typeof _cqUpdateNavBadge === 'function') _cqUpdateNavBadge();
}
setInterval(() => { if (_cqConfigReady) _cqAtualizarAlertasPreparo(); }, 60 * 60 * 1000);

// Faixa da aba Preparos: trocas vencidas ou vencendo na unidade ativa
function _cqTrocasFaixaHTML(u) {
  const al = _cqTrocasAlertas(u);
  if (!al.length) return '';
  const sug = _cqPodeRegistrarPreparo() ? _cqConjuntosSugeridos(u) : [];
  const critico = al.some(a => a.tipo === 'danger');
  return `<div class="cq-tr-faixa${critico ? ' critica' : ''}">${CQ_ICO.alerta}
    <div class="cq-tr-faixa-txt"><b>${critico ? 'Troca de preparo pendente' : 'Troca de preparo próxima'}</b>
      <span>${al.map(a => `${_cqEsc(a.produto.nome)}: ${_cqEsc(a.msg.toLowerCase())}`).join(' · ')}</span></div>
    <div class="cq-tr-faixa-acoes">${sug.map((c, i) => `<button class="btn ${i ? 'btn-outline' : 'btn-primary'} btn-sm" onclick="cqTrocaAbrir('${c.id}')" title="Abrir a troca deste conjunto">${CQ_ICO.repeat} Trocar ${_cqEsc(c.nome)}</button>`).join('')}</div>
  </div>`;
}

// ── PAINEL: PREPAROS DA ÁREA ─────────────────────────────────
// Bloco do painel do CQ: números do dia, conjuntos de troca e o preparo em uso de cada produto
// (mais urgentes primeiro). Vazio quando a área não tem produto preparado no laboratório.
const CQ_PAINEL_PREP_MAX = 12;
const CQ_PAINEL_PREP_TC = { vencida: 'rejeitado', proxima: 'alerta', ok: 'aceito', nova: 'nenhum' };
function _cqPainelPreparosHTML(u) {
  // Tiles por produto; controle (material preparado no laboratório) entra igual, inclusive nunca preparado
  const prods = _cqTrocaProdutos(u).filter(p => _cqProdutoPassaSetor(p.ctl || p, u));
  if (!prods.length && !_cqConjuntosDaUnidade(u).length) return '';
  const hoje = _cqHoje(cqState.config.unidades[u]?.fuso);
  const desde = _cqSomarDias(hoje, -30);
  const n = { uso: 0, vencendo: 0, vencidos: 0, aguardando: 0, mes: 0 };
  let ultimo = null;
  const tiles = prods.map(prod => {
    const aviso = prod.preparo?.avisoDias != null ? Math.max(0, Number(prod.preparo.avisoDias) || 0) : 3;
    // Controle: o "lote" do par é o lote de controle (i.ctl marca para o clique e a etiqueta)
    const pares = prod.ctl
      ? _cqCtlPrepsMaterial(prod.ctl.id, u).map(({ l, p }) => ({ i: { id: l.id, lote: l.lote, nome: prod.nome, ctl: true }, p }))
      : _cqLotesDoProduto(prod.id).filter(i => _cqNaUnidade(i, u)).flatMap(i => _cqPreparosDe(i).map(p => ({ i, p })));
    pares.forEach(({ i, p }) => {
      if (!p.legado && (p.data || '') >= desde) n.mes++;
      if (!p.legado && (!ultimo || (p.dataHora || p.data || '') > (ultimo.p.dataHora || ultimo.p.data || ''))) ultimo = { i, p };
      if (p.finalizado || p.situacao === 'reprovado') return;
      if (p.situacao === 'em_avaliacao') n.aguardando++;
      if (p.validade && p.validade < hoje) { n.vencidos++; return; }
      n.uso++;
      if (p.validade && _cqPrepDias(hoje, p.validade) <= aviso) n.vencendo++;
    });
    // Preparo mostrado: o em uso de validade mais longa (é o que define a situação do produto)
    const atual = pares.filter(({ p }) => !p.finalizado && p.situacao !== 'reprovado')
      .sort((a, b) => (b.p.validade || '9999').localeCompare(a.p.validade || '9999'))[0] || null;
    return { prod, s: _cqProdutoTrocaSit(prod.id, u), atual };
  });
  const ord = { vencida: 0, proxima: 1, ok: 2, nova: 3 };
  tiles.sort((a, b) => ord[a.s.tipo] - ord[b.s.tipo] || (a.s.dias ?? 1e6) - (b.s.dias ?? 1e6) || a.prod.nome.localeCompare(b.prod.nome, 'pt'));

  const stat = (v, l, cls, tit) => `<div class="cq-pp-stat${v && cls ? ' ' + cls : ''}" title="${_cqEsc(tit)}"><b>${v}</b><span>${l}</span></div>`;
  const stats = `<div class="cq-pp-stats">
    ${stat(n.uso, 'em uso', '', 'Preparos dentro da validade, não finalizados nem reprovados')}
    ${stat(n.vencendo, 'vencendo', 'amarelo', 'Em uso e vencendo dentro do aviso de troca do produto (3 dias, se o produto não define)')}
    ${stat(n.vencidos, 'vencidos sem troca', 'vermelho', 'Validade expirada e ainda não finalizados: troque ou finalize')}
    ${stat(n.aguardando, 'aguardando avaliação', 'ciano', 'Preparos que dependem da decisão de uma corrida de CIQ')}
    ${stat(n.mes, 'preparados em 30 dias', '', 'Preparos registrados nos últimos 30 dias')}
  </div>`;

  const pode = _cqPodeRegistrarPreparo();
  const cjs = _cqConjuntosDaUnidade(u).filter(c => _cqConjuntoItens(c).some(it => _cqProdutoPassaSetor(cqState.config.insumoProdutos[it.produtoId], u)));
  const conjuntos = cjs.map(c => {
    const s = _cqConjuntoSituacao(c, u);
    const itens = _cqConjuntoItens(c);
    // Última troca do conjunto (data e responsável), pelos preparos que a registraram
    let ult = null;
    itens.forEach(it => (it.materialId ? _cqCtlPrepsMaterial(it.materialId, u).map(x => x.p) : _cqLotesDoProduto(it.produtoId).filter(i => _cqNaUnidade(i, u)).flatMap(i => _cqPreparosDe(i))).forEach(p => {
      if (p.conjunto?.id === c.id && (!ult || (p.dataHora || '') > (ult.dataHora || ''))) ult = p;
    }));
    const sub = [`${itens.length} ${itens.some(x => x.materialId) ? 'ite' + (itens.length === 1 ? 'm' : 'ns') : 'produto' + (itens.length === 1 ? '' : 's')}`,
      ult ? `última troca ${_cqFmtData(ult.data)}${ult.responsavel ? ' por ' + ult.responsavel.split(' ')[0] : ''}` : s.ultima ? `último preparo ${_cqFmtData(s.ultima)}` : 'nunca trocado',
      s.prox ? `próxima até ${_cqFmtData(s.prox)}` : ''].filter(Boolean).join(' · ');
    const urgente = s.tipo === 'vencida' || s.tipo === 'proxima';
    return `<div class="cq-pp-cj">
      <span class="cq-sitpop-dot st-${CQ_CJ_DOT[s.tipo]}"></span>
      <div class="cq-pp-cj-txt"><div class="cq-tr-cj-l1"><b>${_cqEsc(c.nome)}</b><span class="cq-tr-cj-sit ${s.tipo}">${_cqEsc(s.txt)}</span></div>
        <small title="${_cqEsc(itens.map(x => _cqTrNome(_cqTrKey(x)) || '?').join(', '))}">${_cqEsc(sub)}</small></div>
      ${pode ? `<button class="btn ${urgente ? 'btn-primary' : 'btn-outline'} btn-sm" onclick="cqTrocaAbrir('${c.id}')">${CQ_ICO.repeat} Trocar</button>` : ''}
    </div>`;
  }).join('');

  const tile = ({ prod, s, atual }) => {
    const p = atual?.p;
    const tot = p?.validade && p.data ? Math.max(1, _cqPrepDias(p.data, p.validade)) : null;
    const pct = tot ? Math.min(100, Math.max(0, Math.round(_cqPrepDias(p.data, hoje) / tot * 100))) : null;
    const sub = p ? [p.codigo || _cqFmtData(p.data), atual.i.lote ? `lote ${atual.i.lote}` : ''].filter(Boolean).join(' · ') : 'Nenhum preparo em uso';
    const pe = p ? `${_cqFmtData(p.data)}${p.responsavel ? ' · ' + p.responsavel.split(' ')[0] : ''}${p.validade ? ` → ${_cqFmtData(p.validade)}` : ''}` : 'sem preparo em uso';
    // Sem preparo em uso: o clique já abre o registro de um novo preparo deste produto
    const novo = !p && _cqPodeRegistrarPreparo();
    const clique = prod.ctl ? (p ? `cqLoteVer('${atual.i.id}','preparos')` : novo ? `cqPrepCtlEscolher('${prod.ctl.id}')` : 'cqAbrirPreparos()')
      : p && !p.legado ? `cqPreparoInfo('${atual.i.id}','${p.id}')` : novo ? `cqPrepNovoAbrir('${prod.id}')` : 'cqAbrirPreparos()';
    const dica = p ? 'Ver o preparo em uso' : novo ? 'Registrar um novo preparo deste produto' : 'Abrir a aba Preparos';
    return `<button type="button" class="cq-tc cq-tc-${CQ_PAINEL_PREP_TC[s.tipo]} cq-pp-tc" title="${dica}" onclick="${clique}">
      <div class="cq-tc-top"><span class="cq-tc-nome">${_cqEsc(prod.nome)}${prod.ctl ? ' <span class="cq-tc-tag">controle</span>' : ''}</span><span class="cq-tc-st"><i></i>${_cqEsc(s.txt)}</span></div>
      <div class="cq-tc-sub">${_cqEsc(sub)}</div>
      ${pct !== null ? `<div class="cq-pp-barra" title="${pct}% da validade de uso decorrida"><i style="width:${pct}%"></i></div>` : ''}
      <div class="cq-tc-pe"><span>${CQ_ICO.clock}${_cqEsc(pe)}</span>${p?.situacao === 'em_avaliacao' ? '<span class="cq-tc-tag aguarda">aguardando avaliação</span>' : ''}</div>
    </button>`;
  };
  const vis = tiles.slice(0, CQ_PAINEL_PREP_MAX);
  const un = cqState.config.unidades[u];
  const up = ultimo?.p;
  return `<div class="cq-pp">
    <div class="cq-pp-head"><div class="cq-sec-titulo">Preparos · ${_cqEsc(un?.sigla || '')}</div>
      <div class="cq-pp-acoes">
        ${pode && cjs.length ? `<button class="btn btn-outline btn-sm" onclick="cqTrocaAbrir()">${CQ_ICO.repeat} Trocar conjunto</button>` : ''}
        <button class="btn btn-outline btn-sm" onclick="cqAbrirPreparos()">${CQ_ICO.beaker} Ver preparos</button></div></div>
    <div class="cq-equip-card cq-pp-card">
      ${stats}
      ${up ? `<div class="cq-pp-ult">${CQ_ICO.clock}<span>Último registro: <b>${_cqEsc(up.codigo || _cqFmtData(up.data))}</b> · ${_cqEsc(ultimo.i.nome || '')} · ${_cqFmtDH(up.dataHora || up.data)}${up.responsavel ? ' · ' + _cqEsc(up.responsavel) : ''}</span></div>` : ''}
      ${conjuntos ? `<div class="cq-pp-sub">Conjuntos de troca</div><div class="cq-pp-cjs">${conjuntos}</div>` : ''}
      <div class="cq-pp-sub">Em uso por produto</div>
      <div class="cq-tc-grid">${vis.map(tile).join('')}</div>
      ${tiles.length > vis.length ? `<a href="#" class="cq-link" onclick="cqAbrirPreparos();return false;">Ver todos os produtos (${tiles.length})</a>` : ''}
    </div>
  </div>`;
}

// ── PAINEL: REAGENTES, MEIOS E INSUMOS DA ÁREA ───────────────
// Números dos lotes e, por produto, os lotes ativos e o próximo vencimento (mais urgentes primeiro).
// Lote ativo = não encerrado. Vazio quando a área não tem produto cadastrado.
const CQ_PAINEL_INS_MAX = 10;
function cqAbrirInsumos() { _cqCadTab = 'insumos'; _cqCadExp.clear(); cqNav('cadastros'); }
function cqAbrirControles() { _cqCadTab = 'materiais'; _cqCadExp.clear(); cqNav('cadastros'); }
function _cqPainelInsumosHTML(u) {
  const lotesU = _cqDaUnidade('insumos', u);
  return _cqPainelLotesHTML(u, {
    prods: _cqDaUnidade('insumoProdutos', u).filter(p => p.ativo !== false && _cqProdutoPassaSetor(p, u)),
    lotesDe: p => lotesU.filter(l => _cqLoteCru(l).produtoId === p.id),
    sub: p => [CQ_TIPOS_INSUMO[p.tipo] || p.tipo, p.fabricante, p.preparoInterno ? 'preparado no laboratório' : ''],
    ver: p => `cqInsumoProdutoVer('${p.id}')`, titulo: 'Reagentes, meios e insumos', abrir: 'cqAbrirInsumos()', rotSem: 'produtos sem lote ativo', rotItens: 'produtos',
  });
}
// Controles/materiais da área: mesmo quadro, com os lotes de controle
function _cqPainelControlesHTML(u) {
  const lotesU = _cqDaUnidade('lotesControle', u);
  return _cqPainelLotesHTML(u, {
    prods: _cqDaUnidade('materiais', u).filter(m => m.ativo !== false && _cqProdutoPassaSetor(m, u)),
    lotesDe: m => lotesU.filter(l => l.materialId === m.id),
    sub: m => [CQ_TIPOS_MATERIAL[m.tipo] || m.tipo, m.fabricante, `${Object.keys(m.niveis || {}).length} nível(is)`, m.preparoInterno ? 'preparado no laboratório' : ''],
    ver: m => `cqMaterialVer('${m.id}')`, titulo: 'Controles e materiais', abrir: 'cqAbrirControles()', rotSem: 'controles sem lote ativo', rotItens: 'controles',
  });
}
function _cqPainelLotesHTML(u, cfg) {
  const prods = cfg.prods;
  if (!prods.length) return '';
  const hoje = _cqHoje(cqState.config.unidades[u]?.fuso);
  const n = { ativos: 0, vencendo: 0, vencidos: 0, avaliacao: 0, semLote: 0 };
  const ord = { vencido: 0, sem: 1, vencendo: 2, ok: 3 };
  const linhas = prods.map(p => {
    const ls = cfg.lotesDe(p).filter(l => !_cqLoteInativo(l)).sort((a, b) => (a.validade || '9999').localeCompare(b.validade || '9999'));
    n.ativos += ls.length;
    const venc = ls.filter(l => _cqLoteVencido(l, hoje));
    n.vencidos += venc.length;
    const validos = ls.filter(l => !_cqLoteVencido(l, hoje));
    const prox = validos[0]?.validade || null;
    const dias = prox ? _cqPrepDias(hoje, prox) : null;
    n.vencendo += validos.filter(l => l.validade && _cqPrepDias(hoje, l.validade) <= 30).length;
    const aval = ls.filter(l => ['em_avaliacao', 'quarentena'].includes(l.status)).length;
    n.avaliacao += aval;
    if (!ls.length) n.semLote++;
    const sit = venc.length ? { k: 'vencido', txt: `${venc.length} lote${venc.length === 1 ? '' : 's'} vencido${venc.length === 1 ? '' : 's'}` }
      : !ls.length ? { k: 'sem', txt: 'sem lote ativo' }
      : dias !== null && dias <= 30 ? { k: 'vencendo', txt: dias === 0 ? 'vence hoje' : `vence em ${dias} d` }
      : { k: 'ok', txt: dias !== null ? `${dias} d de validade` : 'em uso' };
    return { p, ls, prox, dias, aval, sit };
  }).sort((a, b) => ord[a.sit.k] - ord[b.sit.k] || (a.dias ?? 1e6) - (b.dias ?? 1e6) || a.p.nome.localeCompare(b.p.nome, 'pt'));

  const stat = (v, l, cls, tit) => `<div class="cq-pp-stat${v && cls ? ' ' + cls : ''}" title="${_cqEsc(tit)}"><b>${v}</b><span>${l}</span></div>`;
  const stats = `<div class="cq-pp-stats">
    ${stat(n.ativos, 'lotes ativos', '', `Lotes não encerrados dos ${cfg.rotItens} da área`)}
    ${stat(n.vencendo, 'vencendo em 30 dias', 'amarelo', 'Lotes ativos que vencem nos próximos 30 dias')}
    ${stat(n.vencidos, 'vencidos não encerrados', 'vermelho', 'Lotes com validade expirada ainda não encerrados')}
    ${stat(n.avaliacao, 'em avaliação / quarentena', 'ciano', 'Lotes novos ainda não liberados para uso pleno')}
    ${stat(n.semLote, cfg.rotSem, 'amarelo', `Cadastros ativos sem nenhum lote em uso`)}
  </div>`;
  const cor = { vencido: 'vermelho', sem: 'cinza', vencendo: 'amarelo', ok: 'verde' };
  const linha = ({ p, ls, prox, aval, sit }) => `<button type="button" class="cq-pi2-lin" onclick="${cfg.ver(p)}" title="Ver o cadastro">
      <span class="cq-pi2-ico ${cor[sit.k]}">${CQ_ICO.beaker}</span>
      <span class="cq-pi2-nome"><b>${_cqEsc(p.nome)}</b><small>${_cqEsc(cfg.sub(p).filter(Boolean).join(' · '))}</small></span>
      <span class="cq-pi2-lotes">${ls.length ? `<b>${ls.length}</b> lote${ls.length === 1 ? '' : 's'}<small>${_cqEsc(ls.slice(0, 2).map(l => l.lote).join(', '))}${ls.length > 2 ? '…' : ''}</small>` : '<small>nenhum lote ativo</small>'}</span>
      <span class="cq-pi2-val">${prox ? `<b>${_cqFmtData(prox)}</b><small>próximo vencimento</small>` : '<small>—</small>'}</span>
      <span class="cq-pi2-sit">${aval ? '<span class="cq-tc-tag aguarda">em avaliação</span>' : ''}<span class="cq-pi2-pill ${cor[sit.k]}"><i></i>${_cqEsc(sit.txt)}</span></span>
    </button>`;
  const vis = linhas.slice(0, CQ_PAINEL_INS_MAX);
  const un = cqState.config.unidades[u];
  return `<div class="cq-pp">
    <div class="cq-pp-head"><div class="cq-sec-titulo">${cfg.titulo} · ${_cqEsc(un?.sigla || '')}</div>
      <div class="cq-pp-acoes"><button class="btn btn-outline btn-sm" onclick="${cfg.abrir}">${CQ_ICO.cadastro} Ver cadastro</button></div></div>
    <div class="cq-equip-card cq-pp-card">
      ${stats}
      <div class="cq-pi2-lista">${vis.map(linha).join('')}</div>
      ${linhas.length > vis.length ? `<a href="#" class="cq-link" onclick="${cfg.abrir};return false;">Ver todos os ${cfg.rotItens} (${linhas.length})</a>` : ''}
    </div>
  </div>`;
}
