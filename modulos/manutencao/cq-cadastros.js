// ═══════════════════════════════════════════════════════════════
// cq-cadastros.js — Cadastros do Controle de Qualidade — LAMIC
// Analitos, materiais e lotes de controle, reagentes/calibradores (estoque,
// recebimento e abertura de frascos ficam no sistema de estoque), testes
// (estratégia de controle e regras — art. 176 II/III, art. 180 II) e
// alvos versionados (média/DP — CLSI C24, PALC 11.5).
// ═══════════════════════════════════════════════════════════════

let _cqCadTab = 'analitos';
let _cqCadBusca = '';
let _cqTesteFormId = null;
let _cqTesteFormTab = 'config';
let _cqTesteDraft = null;

const CQ_TIPOS_ANALITO = { quantitativo: 'Quantitativo', qualitativo: 'Qualitativo', semiquantitativo: 'Semiquantitativo' };
const CQ_TIPOS_MATERIAL = {
  comercial: 'Controle comercial', fornecido_kit: 'Controle do kit / fabricante', pool_interno: 'Pool interno (alternativo)',
  cepa_referencia: 'Cepa de referência (ATCC / rastreável)', lamina_controle: 'Lâmina controle (coloração)',
};
const CQ_TIPOS_INSUMO = { reagente: 'Reagente', calibrador: 'Calibrador', kit: 'Kit', meio_cultura: 'Meio de cultura', corante: 'Corante / kit de coloração' };
const CQ_FREQ = {
  por_corrida: 'A cada corrida analítica', diaria: 'Diária', por_turno: 'A cada turno', semanal: 'Semanal',
  quinzenal: 'Quinzenal', mensal: 'Mensal', por_lote: 'A cada novo lote ou preparo',
  lote_remessa: 'A cada lote / remessa (uso único)',
};

// Analitos qualitativos usados no controle de meios de cultura e colorações.
// Ponto de partida: o RT revisa as categorias antes do uso (RDC 978, art. 176, III).
const CQ_MODELOS_MICRO = [
  { nome: 'Esterilidade de meio de cultura', codigo: 'MIC-EST',
    escala: ['Sem crescimento', 'Com crescimento (contaminado)'] },
  { nome: 'Desempenho de meio de cultura', codigo: 'MIC-DES',
    escala: ['Crescimento com características esperadas', 'Crescimento com características atípicas', 'Sem crescimento', 'Crescimento inibido', 'Crescimento não inibido'] },
  { nome: 'Coloração de Gram', codigo: 'MIC-GRAM',
    escala: ['Gram-positivo (roxo)', 'Gram-negativo (rosa/vermelho)', 'Coloração inadequada'] },
  { nome: 'Coloração de Ziehl-Neelsen (BAAR)', codigo: 'MIC-BAAR',
    escala: ['BAAR presentes (bacilos vermelhos)', 'BAAR ausentes', 'Coloração inadequada'] },
];
// Monitoramento da esterilização a vapor (RDC 1002/2025, arts. 88-90; bulas dos indicadores).
// Integrador tipo 5/6 em todo ciclo; indicador biológico semanal (ampola teste = negativo, ampola controle = positivo).
// Tipo de indicador de esterilização do analito: define o tratamento na ficha do ciclo
// (ex.: o indicador biológico pede a incubação na corrida de leitura)
const CQ_INDICADOR_ESTER = {
  quimico:   'Indicador químico / integrador',
  biologico: 'Indicador biológico',
  bowie:     'Teste de Bowie & Dick',
};
const CQ_INDICADOR_CURTO = { quimico: 'Químico / integrador', biologico: 'Biológico', bowie: 'Bowie & Dick' };
const CQ_INDICADOR_DESC = {
  quimico: 'Viragem de cor no pacote teste (classe 5 ou 6)',
  biologico: 'Ampola com esporos — a leitura pede início e temperatura da incubação',
  bowie: 'Remoção de ar e penetração de vapor (autoclave pré-vácuo)',
};
const CQ_ICO_AUTOCLAVE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>';
// Liga/desliga a marca de analito de autoclave no formulário (grava ao salvar)
function cqAnAutoclaveSw(btn) {
  const on = btn.getAttribute('aria-checked') !== 'true';
  btn.setAttribute('aria-checked', on);
  document.getElementById('cq-an-autoclave-chk').checked = on;
  document.getElementById('cq-an-autoclave').classList.toggle('on', on);
}
const CQ_AN_LIB_SUB = {
  true: 'O ciclo fica em análise até este indicador ser aprovado.',
  false: 'Não segura o ciclo; se reprovado, reprova o ciclo.',
};
function cqAnLiberaSw(btn) {
  const on = btn.getAttribute('aria-checked') !== 'true';
  btn.setAttribute('aria-checked', on);
  document.getElementById('cq-an-libera').checked = on;
  const sub = document.getElementById('cq-an-lib-sub');
  if (sub) sub.textContent = CQ_AN_LIB_SUB[on];
}
function cqAnAutoclaveTipo(k) {
  document.getElementById('cq-an-indic').value = k;
  document.getElementById('cq-an-autoclave').dataset.tipo = k;
}
// Sugestão para analitos antigos ainda não marcados (pelo código ou nome); não muda o comportamento
function _cqIndicadorSugerido(a) {
  const cod = a?.codigo || '', nome = a?.nome || '';
  if (/(^|[-_ ])IB$/i.test(cod) || /indicador biol|biol[oó]gico|stearothermophilus|atrophaeus/i.test(nome)) return 'biologico';
  if (/(^|[-_ ])BD$/i.test(cod) || /bowie/i.test(nome)) return 'bowie';
  if (/^EST-|(^|[-_ ])IQ\d*$/i.test(cod) || /integrador|indicador qu[ií]mico/i.test(nome)) return 'quimico';
  return '';
}
const CQ_MODELOS_ESTER = [
  { nome: 'Integrador químico tipo 5 (vapor)', codigo: 'EST-IQ5', indicador: 'quimico',
    escala: ['Viragem completa (aprovado)', 'Viragem incompleta ou ausente (reprovado)'] },
  { nome: 'Indicador biológico (G. stearothermophilus)', codigo: 'EST-IB', indicador: 'biologico',
    escala: ['Negativo (sem crescimento, meio púrpura)', 'Positivo (crescimento, meio amarelo)'] },
  { nome: 'Teste de Bowie & Dick', codigo: 'EST-BD', indicador: 'bowie',
    escala: ['Mudança de cor uniforme (aprovado)', 'Mudança de cor não uniforme (reprovado)'] },
];
const CQ_MODELOS = {
  micro: { lista: CQ_MODELOS_MICRO, titulo: 'Modelos de microbiologia', sub: 'Controle de meios de cultura e colorações', esp: 'Microbiologia', nomeCurto: 'microbiologia' },
  ester: { lista: CQ_MODELOS_ESTER, titulo: 'Modelos de esterilização', sub: 'Indicadores químico e biológico da autoclave', esp: 'Outros', nomeCurto: 'esterilização' },
};
const CQ_ORIGEM_ALVO = {
  fabricante: { label: 'Fabricante (bula)', cls: 'cq-st-alerta' },
  provisorio: { label: 'Provisório (laboratório)', cls: 'cq-st-alerta' },
  estabelecido: { label: 'Estabelecido (laboratório)', cls: 'cq-st-aceito' },
  cumulativo: { label: 'Cumulativo', cls: 'cq-st-aceito' },
};

let _cqCadEquips = [];            // filtro de equipamentos/sistemas da aba Analitos e testes ('a:…' | 'm:…')
let _cqCadAnalitos = [];          // filtro de analitos (ids), com busca por código ou nome
let _cqCadPend = false;           // só analitos com pendência
let _cqCadSit = [];               // situação dos lotes (abas Controles/Materiais e Reagentes): [] = todas, ou [uma]
let _cqCadProds = [];            // filtro de produtos (aba Reagentes, meios e insumos)
let _cqCadAtivo = 'ativos';       // ativos | inativos | todos (as três abas)       // situação dos lotes nas abas Controles/Materiais e Reagentes (vazio = todas)
const _cqCadExp = new Map();      // analitoId → expandido (sem entrada: segue o filtro)

function cqRenderCadastros(body) {
  // Ordem: analito (equipamentos/sistemas e seus testes) → materiais e lotes → reagentes. O teste é criado dentro do analito.
  const tabs = { analitos: 'Analitos e testes', materiais: 'Controles/Materiais', insumos: 'Reagentes, meios e insumos', preparos: 'Preparos' };
  if (!tabs[_cqCadTab]) _cqCadTab = 'analitos';
  _cqCadBusca = '';   // as abas usam os filtros de analito, equipamento, situação e ativos no lugar da busca
  const cfg = cqState.config;
  const uAt = _cqUnidadeAtivaId();
  const qtd = { analitos: _cqDaUnidade('analitos', uAt).length, materiais: _cqDaUnidade('materiais', uAt).filter(m => _cqProdutoPassaSetor(m, uAt)).length,
                insumos: _cqDaUnidade('insumoProdutos', uAt).filter(p => _cqProdutoPassaSetor(p, uAt)).length + _cqDaUnidade('insumos', uAt).filter(i => !_cqProdutoInsumo(i) && _cqProdutoPassaSetor(i, uAt)).length,
                preparos: _cqPrepAbaItens(uAt).filter(x => !x.p.finalizado).length + _cqCtlPrepItens(uAt).filter(x => !x.p.finalizado).length };
  const tabsHTML = `<div class="ot-modal-tabs cq-subtabs">${Object.entries(tabs).map(([k, l], i) => `<button class="ot-modal-tab-btn${k === _cqCadTab ? ' active' : ''}" onclick="cqCadTab('${k}')"${k === 'preparos' ? ' title="Preparos em uso"' : ''}><span class="cq-step${qtd[k] ? ' feito' : ''}">${i + 1}</span>${l}${qtd[k] ? `<span class="cq-step-qtd">${qtd[k]}</span>` : ''}</button>`).join('')}</div>`;
  // Preparos: formulário de registro + lista, com filtros próprios
  if (_cqCadTab === 'preparos') {
    body.innerHTML = `<div class="cq-cad">${tabsHTML}${_cqPrepAbaHTML(uAt)}</div>`;
    _cqPrepAbaLista();
    return;
  }
  const podeCfg = _cqCan('configurar'), podeLote = _cqPodeCriarLote();
  const nSemUn = CQ_COLECOES_UNIDADE.reduce((n, c) => n + Object.values(cfg[c] || {}).filter(_cqSemUnidade).length, 0);
  const novo = {
    analitos: podeCfg ? `<button class="btn btn-outline btn-sm" onclick="cqModelosMicro()" title="Cria analitos qualitativos para meios de cultura e colorações">${CQ_ICO.beaker} Modelos de microbiologia</button>
      <button class="btn btn-outline btn-sm" onclick="cqModelosMicro('ester')" title="Cria analitos qualitativos para o integrador químico, o indicador biológico e o Bowie &amp; Dick da autoclave">${CQ_ICO.beaker} Modelos de esterilização</button>
      <button class="btn btn-primary btn-sm" onclick="cqAnalitoForm(null)">${CQ_ICO.plus} Novo analito</button>` : '',
    materiais: `${podeLote ? `<button class="btn btn-outline btn-sm" onclick="cqLoteForm(null)">${CQ_ICO.plus} Novo lote</button>` : ''}
      ${podeCfg ? `<button class="btn btn-primary btn-sm" onclick="cqMaterialForm(null)">${CQ_ICO.plus} Novo material / cepa</button>` : ''}`,
    insumos: `${podeCfg && _cqInsumosLegados().length ? `<button class="btn btn-outline btn-sm" onclick="cqInsumosOrganizar()" title="Lotes cadastrados antes da separação entre produto e lote">${CQ_ICO.alerta} Organizar ${_cqInsumosLegados().length} lote(s) antigo(s)</button>` : ''}
      ${podeLote ? `<button class="btn btn-outline btn-sm" onclick="cqInsumoForm(null)">${CQ_ICO.plus} Novo lote</button>` : ''}
      ${podeCfg ? `<button class="btn btn-primary btn-sm" onclick="cqInsumoProdutoForm(null)">${CQ_ICO.plus} Novo produto</button>` : ''}`,
  }[_cqCadTab];
  // Filtros de analito e de equipamento/sistema (as três abas; a seleção vale ao trocar de aba).
  // Um restringe o outro: só aparecem os analitos dos equipamentos marcados e vice-versa.
  const opsAn = _cqCadOpsAnalitos(uAt, _cqCadEquips);
  _cqCadAnalitos = _cqCadAnalitos.filter(id => opsAn.some(o => o.value === id));
  const ops = _cqCadOpsEquips(uAt, _cqCadAnalitos);
  const validos = new Set(ops.map(o => _cqEquipChave(o.value)));
  _cqCadEquips = _cqCadEquips.filter(v => validos.has(_cqEquipChave(v)));
  let filtros = `<div class="cq-cad-equip cq-cad-an">${_cqMultiHTML('cq-cad-an', opsAn, _cqCadAnalitos, { placeholder: 'Todos os analitos', resumo: 'analitos', filtro: true, ico: CQ_ICO.beaker,
      onchange: v => { _cqCadAnalitos = v; _cqCadFiltrosCruzar('an'); }, vazio: 'Nenhum analito vinculado aos equipamentos e sistemas marcados.' })}</div>
    <div class="cq-cad-equip">${_cqMultiHTML('cq-cad-equip', ops, _cqCadEquips, { placeholder: 'Todos os equipamentos e sistemas', resumo: 'equipamentos / sistemas', filtro: true, ico: CQ_ICO.ativo,
      onchange: v => { _cqCadEquips = v; _cqCadFiltrosCruzar('equip'); }, vazio: 'Nenhum equipamento ou sistema vinculado aos analitos marcados.' })}</div>`;
  // Ativos / Inativos / Todos, com a contagem da aba
  const colAtivo = { analitos: 'analitos', materiais: 'materiais', insumos: 'insumoProdutos' }[_cqCadTab];
  const recsAtivo = _cqDaUnidade(colAtivo, uAt);
  const nInat = recsAtivo.filter(r => r.ativo === false).length + (_cqCadTab === 'analitos' ? _cqTestesDaUnidade(uAt, { incluirInativos: true }).filter(t => t.ativo === false && _cqAnalito(t.analitoId)?.ativo !== false).length : 0);
  const segAtivo = [['ativos', 'Ativos', recsAtivo.length - recsAtivo.filter(r => r.ativo === false).length], ['inativos', 'Inativos', nInat], ['todos', 'Todos', null]];
  filtros = `<div class="cq-seg cq-cad-ativo" role="group" aria-label="Ativos ou inativos">${segAtivo.map(([k, l, n]) => `<button type="button" class="${_cqCadAtivo === k ? 'active' : ''}" onclick="cqCadAtivo('${k}')">${k === 'inativos' ? CQ_ICO.pause : k === 'ativos' ? CQ_ICO.play : ''}${l}${n !== null ? ` <span class="cq-seg-n">${n}</span>` : ''}</button>`).join('')}</div>` + filtros;
  if (_cqCadTab === 'analitos') {
    filtros += `<button type="button" class="cq-filtro-chip${_cqCadPend ? ' on' : ''}" onclick="cqCadPendToggle()" title="Testes sem lote, sem alvo ou sem resultado esperado, e analitos sem teste">${CQ_ICO.alerta} Só com pendência</button>`;
  } else {
    if (_cqCadTab === 'insumos') {
      const opsProd = _cqCadOpsProdutos(uAt);
      _cqCadProds = _cqCadProds.filter(id => opsProd.some(o => o.value === id));
      filtros += `<div class="cq-cad-equip cq-cad-prod">${_cqMultiHTML('cq-cad-prod', opsProd, _cqCadProds, { placeholder: 'Todos os produtos', resumo: 'produtos', filtro: true, ico: CQ_ICO.cadastro,
          onchange: v => { _cqCadProds = v; _cqCadExp.clear(); _cqCadRenderLista(); }, vazio: 'Nenhum produto para os analitos e equipamentos marcados.' })}</div>`;
    }
    const descSit = { em_uso: 'Lotes oferecidos nos lançamentos', em_avaliacao: 'Lotes novos em teste', quarentena: 'Lotes bloqueados para uso',
      encerrado: 'Inclui os vencidos, encerrados automaticamente', vencido: 'Validade expirada (encerrados ou não)' };
    const ops = [{ value: '', label: 'Todas', desc: 'Lotes em qualquer situação', dot: 'todas' },
      ...Object.entries(CQ_SITUACAO_FILTRO).map(([k, l]) => ({ value: k, label: l, desc: descSit[k] || '' }))];
    filtros += `<div class="cq-cad-sit" title="Situação dos lotes exibidos (os produtos e materiais continuam na lista)"><span>Situação</span>${_cqPopSelHTML('cq-cad-sit', ops, _cqCadSit[0] || '',
        { compacto: true, onchange: v => { _cqCadSit = v ? [v] : []; _cqCadRenderLista(); } })}</div>`;
  }
  body.innerHTML = `
  <div class="cq-cad">
    ${tabsHTML}
    <div class="cq-toolbar cq-toolbar-wrap">
      ${filtros}
      <div class="cq-spacer"></div>${podeCfg && nSemUn ? `<button class="btn btn-outline btn-sm" onclick="cqAssociarSemUnidade()" title="Cadastros antigos sem área aparecem em todas as áreas">${CQ_ICO.unidade} Associar ${nSemUn} cadastro(s) sem área</button>` : ''}${novo}
    </div>
    <div id="cq-cad-lista"></div>
  </div>`;
  _cqCadRenderLista();
}

function cqCadTab(t) { _cqCadTab = t; _cqCadBusca = ''; _cqCadExp.clear(); cqRender(); }
function cqCadAtivo(v) { _cqCadAtivo = v; _cqCadExp.clear(); cqRender(); }
// Material / produto conforme o filtro Ativos / Inativos / Todos
function _cqCadAtivoBate(r) { return _cqCadAtivo === 'todos' || (_cqCadAtivo === 'inativos') === (r?.ativo === false); }
function cqCadPendToggle() { _cqCadPend = !_cqCadPend; _cqCadExp.clear(); cqRender(); }
// Atalho do painel: lista já filtrada pelas pendências
function cqCadPendencias() { _cqCadTab = 'analitos'; _cqCadPend = true; _cqCadBusca = ''; _cqCadEquips = []; _cqCadAnalitos = []; _cqCadExp.clear(); cqNav('cadastros'); }
function cqCadExpandir(id, aberto) { _cqCadExp.set(id, !aberto); _cqCadRenderLista(); }
// Grupos (analito / material / produto) recolhidos por padrão; a busca por texto e "Só com pendência" os abrem
let _cqCadIdsLista = [];
function _cqCadAbertoPadrao() { return !!_cqCadBusca.trim() || (_cqCadTab === 'analitos' && _cqCadPend); }
function _cqCadAberto(id) { return _cqCadExp.has(id) ? _cqCadExp.get(id) : _cqCadAbertoPadrao(); }
function cqCadExpandirTodos(abrir) { _cqCadIdsLista.forEach(id => _cqCadExp.set(id, abrir)); _cqCadRenderLista(); }
// Cabeçalho da coluna da seta: expande ou recolhe todos os grupos da lista
function _cqCadThExpandir(ids) {
  _cqCadIdsLista = ids;
  const todos = ids.length && ids.every(_cqCadAberto);
  return `<th class="ot-list-th" style="width:34px;">${ids.length ? `<button type="button" class="cq-icobtn cq-an-exp${todos ? ' aberto' : ''}" title="${todos ? 'Recolher todos' : 'Expandir todos'}" onclick="cqCadExpandirTodos(${!todos})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="9 6 15 12 9 18"/></svg></button>` : ''}</th>`;
}

// Analito × equipamento/sistema da unidade: vínculo do cadastro do analito ou de um teste dele
function _cqCadAnalitoNoEquip(a, chaves, testesU) {
  return _cqEquipsDoAnalito(a).some(o => chaves.has(_cqEquipChave(o.value)))
    || testesU.some(t => t.analitoId === a.id && chaves.has(_cqEquipChave(_cqEquipDoTeste(t))));
}
// Opções do filtro de analitos: todos os da unidade ou só os dos equipamentos/sistemas marcados
// Filtro de setor nos filtros de Cadastros: analito ou equipamento com teste no setor
// (ou equipamento lotado no setor, para o que ainda não tem teste)
function _cqCadEquipNoSetor(eq, u, f = _cqSetorAtivoId(u)) {
  if (!f) return true;
  const k = _cqEquipChave(eq);
  if (_cqTestesDaUnidade(u, { incluirInativos: true }).some(t => _cqTestePassaSetor(t, f) && _cqEquipChave(_cqEquipDoTeste(t)) === k)) return true;
  const at = String(eq).startsWith('a:') && typeof _ativoById === 'function' ? _ativoById(String(eq).slice(2)) : null;
  return !!at && typeof _orgSetorIdsDoAtivo === 'function' && _orgSetorIdsDoAtivo(at).some(id => _cqSetorPassa(id, f));
}
function _cqCadAnalitoNoSetor(a, u, f = _cqSetorAtivoId(u)) {
  if (!f) return true;
  return _cqTestesDaUnidade(u, { incluirInativos: true }).some(t => t.analitoId === a.id && _cqTestePassaSetor(t, f))
    || _cqEquipsDoAnalito(a).some(o => o.ativo && _cqCadEquipNoSetor(o.value, u, f));
}
function _cqCadOpsAnalitos(u, equipsSel) {
  const chaves = new Set(_cqArr(equipsSel).map(_cqEquipChave));
  const testesU = chaves.size ? _cqTestesDaUnidade(u, { incluirInativos: true }) : [];
  return _cqDaUnidade('analitos', u).filter(a => (!chaves.size || _cqCadAnalitoNoEquip(a, chaves, testesU)) && _cqCadAnalitoNoSetor(a, u))
    .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''))
    .map(a => ({ value: a.id, label: a.codigo ? `${a.codigo} — ${a.nome}` : a.nome, sub: a.tipo && a.tipo !== 'quantitativo' ? CQ_TIPOS_ANALITO[a.tipo] : (a.unidadeMedida || '') }));
}
// Opções do filtro de equipamentos/sistemas: todos ou só os dos analitos marcados
function _cqCadOpsEquips(u, anSel) {
  const ops = _cqCadOpcoesEquip(u).filter(o => _cqCadEquipNoSetor(o.value, u));
  const ids = new Set(_cqArr(anSel));
  if (!ids.size) return ops;
  const testesU = _cqTestesDaUnidade(u, { incluirInativos: true });
  return ops.filter(o => {
    const k = new Set([_cqEquipChave(o.value)]);
    return [...ids].some(id => { const a = _cqAnalito(id); return a && _cqCadAnalitoNoEquip(a, k, testesU); });
  });
}
// Depois de mudar um dos filtros, refaz as opções do outro (descartando marcações que deixaram de valer)
function _cqCadFiltrosCruzar(origem) {
  const u = _cqUnidadeAtivaId();
  if (origem === 'an') { _cqMultiOpcoes('cq-cad-equip', _cqCadOpsEquips(u, _cqCadAnalitos)); _cqCadEquips = _cqMultiVal('cq-cad-equip'); }
  else { _cqMultiOpcoes('cq-cad-an', _cqCadOpsAnalitos(u, _cqCadEquips)); _cqCadAnalitos = _cqMultiVal('cq-cad-an'); }
  if (_cqCadTab === 'insumos') { _cqMultiOpcoes('cq-cad-prod', _cqCadOpsProdutos(u)); _cqCadProds = _cqMultiVal('cq-cad-prod'); }
  _cqCadExp.clear();
  _cqCadRenderLista();
}

// Opções do filtro de produtos: os da unidade que passam pelos filtros de ativos, analitos e equipamentos
function _cqCadOpsProdutos(u) {
  const hoje = _cqHoje();
  const lotesU = _cqDaUnidade('insumos', u);
  return _cqDaUnidade('insumoProdutos', u).filter(p => _cqCadAtivoBate(p) && _cqCadFiltroServe(p, _cqEquipsInsumo(p)) && _cqProdutoPassaSetor(p, u))
    .sort((a, b) => (CQ_TIPOS_INSUMO[a.tipo] || '').localeCompare(CQ_TIPOS_INSUMO[b.tipo] || '') || (a.nome || '').localeCompare(b.nome || '', 'pt'))
    .map(p => {
      const ls = lotesU.filter(i => _cqLoteCru(i).produtoId === p.id);
      const emUso = ls.filter(l => (l.status || 'em_uso') === 'em_uso' && !_cqLoteVencido(l, hoje)).length;
      return { value: p.id, label: p.nome, grupo: CQ_TIPOS_INSUMO[p.tipo] || 'Outros',
               sub: [p.fabricante, ls.length ? `${ls.length} lote(s)${emUso ? `, ${emUso} em uso` : ''}` : 'sem lote'].filter(Boolean).join(' · ') };
    });
}

// Filtro das abas Controles/Materiais e Reagentes: o material ou produto aparece quando serve a algum
// analito e a algum equipamento/sistema selecionado. Sem analitos no cadastro = serve a todos; sem
// equipamentos = serve aos equipamentos dos analitos dele (ou a qualquer um, se também não tiver analitos).
function _cqCadFiltroServe(rec, equips) {
  const ans = _cqArr(rec?.analitoIds);
  if (_cqCadAnalitos.length && ans.length && !ans.some(a => _cqCadAnalitos.includes(a))) return false;
  if (!_cqCadEquips.length) return true;
  const sel = new Set(_cqCadEquips.map(_cqEquipChave));
  const eqs = _cqArr(equips);
  if (eqs.length) return eqs.some(k => sel.has(_cqEquipChave(k)));
  if (!ans.length) return true;
  return ans.some(a => _cqEquipsDoAnalito(_cqAnalito(a)).some(o => sel.has(_cqEquipChave(o.value))));
}

// Opções do filtro: equipamentos da unidade (agrupados por setor) e sistemas sem equipamento dos analitos e testes da unidade
function _cqCadOpcoesEquip(u) {
  const SIS = 'Sistemas sem equipamento (bancada / manual)';
  const mapa = new Map();
  const add = o => { const k = _cqEquipChave(o.value); if (!mapa.has(k)) mapa.set(k, o); };
  _cqEquipsTodos(u).forEach(o => {
    const sis = o.value.startsWith('m:');
    add({ value: o.value, label: sis ? o.label : (o.ativo?.nome || o.label), sub: sis ? 'Sistema analítico sem equipamento' : [o.ativo?.codigo, o.ativo?.modelo].filter(Boolean).join(' · '),
          grupo: sis ? SIS : (o.ativo ? _cqRotuloSetorAtivo(o.ativo) : (o.grupo || 'Equipamentos')) });
  });
  _cqTestesDaUnidade(u, { incluirInativos: true }).forEach(t => {
    const v = _cqEquipDoTeste(t), sis = v.startsWith('m:');
    add({ value: v, label: _cqEquipTeste(t), sub: sis ? 'Sistema analítico sem equipamento' : 'Equipamento de teste', grupo: sis ? SIS : 'Outros equipamentos' });
  });
  const ordem = o => (o.grupo === SIS ? '1' : '0') + o.grupo;
  return [...mapa.values()].sort((a, b) => ordem(a).localeCompare(ordem(b)) || a.label.localeCompare(b.label));
}

// Pendências de um teste ativo: nível sem lote, sem alvo (quantitativo) ou sem resultado esperado (qualitativo)
function _cqPendenciasTeste(t) {
  const p = [];
  if (t.ativo === false) return p;
  const qual = _cqTesteQual(t);
  _cqNiveisTeste(t).forEach(n => {
    if (qual) {
      if (!_cqControleQual(t, n)?.esperado) p.push(`N${n} sem esperado`);
      if (!_cqNivelSemMaterial(t, n) && !_cqLoteDoNivel(t, n)) p.push(`N${n} sem lote`);
      else if (_cqLoteDoNivel(t, n)?.status === 'encerrado') p.push(`N${n} lote encerrado`);
      return;
    }
    const lid = t.lotesAtivos?.[n];
    if (_cqLoteDoNivel(t, n)?.status === 'encerrado') p.push(`N${n} lote encerrado`);
    if (!lid) p.push(`N${n} sem lote`);
    else if (!_cqAlvoVigente(t.id, lid, n)) p.push(`N${n} sem alvo`);
  });
  return p;
}

// Linha de um teste (lista do analito e aba Testes do analito)
function _cqTesteLinhaHTML(t) {
  const niveis = _cqNiveisTeste(t);
  const qual = _cqTesteQual(t);
  const an = _cqAnalito(t.analitoId);
  const lotes = niveis.map(n => {
    const rot = qual ? _cqEsc(_cqRotuloNivel(t, n)) : `N${n}`;
    if (qual && _cqNivelSemMaterial(t, n)) return `${rot}: sem material`;
    const l = _cqLoteDoNivel(t, n);
    return `${rot}: ${l ? _cqEsc(l.lote) : '<span class="cq-txt-vermelho">sem lote</span>'}`;
  }).join(' · ');
  const criterio = qual
    ? niveis.map(n => { const e = _cqControleQual(t, n)?.esperado; return e ? `<div style="font-size:11.5px;">N${n}: ${_cqEsc(e)}</div>` : `<span class="cq-badge cq-st-rejeitado">N${n} sem esperado</span>`; }).join('')
    : niveis.map(n => { const lid = t.lotesAtivos?.[n]; const a = lid ? _cqAlvoVigente(t.id, lid, n) : null;
        return a ? `<span class="cq-badge ${CQ_ORIGEM_ALVO[a.origem]?.cls || ''}" title="${_cqEsc(CQ_ORIGEM_ALVO[a.origem]?.label || '')}">N${n}</span>` : `<span class="cq-badge cq-st-rejeitado">N${n} sem alvo</span>`; }).join(' ');
  const regras = qual ? (an?.tipo === 'semiquantitativo' ? 'Concordância (±1 categoria = alerta)' : 'Concordância com o esperado')
    : `${_cqEsc(CQEngine.PRESETS[t.regrasPreset]?.label || 'Personalizado')}<div class="cq-muted">${_cqResumoRegras(t.regras)}</div>`;
  return `<tr class="ot-list-row${t.ativo === false ? ' oc-row-final' : ''}" onclick="cqTesteVer('${t.id}')">
    <td><b>${_cqEsc(_cqEquipTeste(t))}</b>${t.ativo === false ? ' <span class="cq-badge cq-st-semalvo">inativo</span>' : ''}${_cqSetoresDaUnidade(t.unidadeId).length ? `<div class="cq-muted">${_cqEsc(_cqRotuloSetor(_cqSetorDoTeste(t)))}</div>` : ''}</td>
    <td>${_cqEsc(t.metodo || '—')}</td><td style="font-size:12px;">${lotes || '—'}</td>
    <td style="font-size:12px;">${regras}</td><td style="font-size:12px;">${_cqEsc(CQ_FREQ[t.frequencia?.tipo] || '—')}</td><td>${criterio}</td></tr>`;
}
function _cqTestesTabelaHTML(a, ts) {
  const pode = _cqCan('configurar');
  const qual = a.tipo && a.tipo !== 'quantitativo';
  return `<div class="oc-table-scroll"><table class="ot-list-table cq-table cq-table-sm cq-an-testes-tbl">
      <thead><tr><th class="ot-list-th">Equipamento / sistema</th><th class="ot-list-th">${qual ? 'Meio / insumo' : 'Método'}</th><th class="ot-list-th">Níveis e lotes</th><th class="ot-list-th">${qual ? 'Critério' : 'Regras'}</th><th class="ot-list-th">Frequência</th><th class="ot-list-th">${qual ? 'Esperado' : 'Alvos'}</th></tr></thead>
      <tbody>${ts.length ? ts.map(_cqTesteLinhaHTML).join('') : '<tr><td colspan="6" class="cq-td-vazio">Nenhum teste deste analito nesta área.</td></tr>'}</tbody></table></div>
    ${pode ? `<button class="btn btn-outline btn-sm cq-an-novo-teste" onclick="event.stopPropagation();cqTesteForm(null,null,{analitoId:'${a.id}'})" ${_cqEquipsDoAnalito(a).length ? '' : 'disabled title="Vincule antes um equipamento ou sistema ao analito"'}>${CQ_ICO.plus} Novo teste de ${_cqEsc(a.nome)}</button>` : ''}`;
}

// Lista resumida dos testes (aba Testes do analito, dentro da janela lateral): uma linha por teste, sem tabela
function _cqTestesCompactoHTML(a, ts) {
  const pode = _cqCan('configurar');
  const itens = ts.map(t => {
    const qual = _cqTesteQual(t);
    const pend = _cqPendenciasTeste(t);
    const lotes = _cqNiveisTeste(t).map(n => {
      if (qual && _cqNivelSemMaterial(t, n)) return null;
      const l = _cqLoteDoNivel(t, n);
      return l ? l.lote : null;
    }).filter(Boolean);
    const sub = [t.metodo ? _cqEquipTeste(t) : '', `${_cqNiveisTeste(t).length} nível(is)`, lotes.length ? `lote ${[...new Set(lotes)].join(', ')}` : ''].filter(Boolean).join(' · ');
    const st = t.ativo === false ? '<span class="cq-badge cq-st-semalvo">inativo</span>'
      : pend.length ? `<span class="cq-badge cq-st-alerta" title="${_cqEsc(pend.join('; '))}">${pend.length} pendência(s)</span>`
      : '<span class="cq-badge cq-st-aceito">ok</span>';
    return `<div class="cq-te-item${t.ativo === false ? ' inativo' : ''}" onclick="cqTesteVer('${t.id}')" title="Abrir teste">
      <div class="cq-te-item-txt"><b>${_cqEsc(t.metodo || _cqEquipTeste(t))}</b><small>${_cqEsc(sub)}</small></div>${st}
      <svg class="cq-te-item-seta" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="9 6 15 12 9 18"/></svg></div>`;
  }).join('');
  return `<div class="cq-te-lista">${itens || '<div class="cq-ms-vazio">Nenhum teste deste analito nesta área.</div>'}</div>
    ${pode ? `<button class="btn btn-outline btn-sm cq-an-novo-teste" onclick="cqTesteForm(null,null,{analitoId:'${a.id}'})" ${_cqEquipsDoAnalito(a).length ? '' : 'disabled'}>${CQ_ICO.plus} Novo teste</button>` : ''}`;
}

function _cqCadRenderLista() {
  if (_cqCadTab === 'preparos') { _cqPrepAbaLista(); return; }
  const el = document.getElementById('cq-cad-lista');
  if (!el) return;
  const q = _cqCadBusca.toLowerCase().trim();
  const bate = txt => !q || String(txt).toLowerCase().includes(q);
  const u = _cqUnidadeAtivaId();
  const hoje = _cqHoje();

  if (_cqCadTab === 'analitos') {
    const testesU = _cqTestesDaUnidade(u, { incluirInativos: true })
      .sort((a, b) => _cqEquipTeste(a).localeCompare(_cqEquipTeste(b)) || (a.metodo || '').localeCompare(b.metodo || ''));
    const chaves = new Set(_cqCadEquips.map(_cqEquipChave));
    const anSel = new Set(_cqCadAnalitos);
    const fSetor = _cqSetorAtivoId(u);
    const filtrando = !!q || chaves.size > 0 || anSel.size > 0 || _cqCadPend || _cqCadAtivo === 'inativos' || !!fSetor;
    const txtTeste = t => `${_cqEquipTeste(t)} ${t.metodo || ''} ${_cqNiveisTeste(t).map(n => _cqLoteDoNivel(t, n)?.lote || '').join(' ')}`;
    const linhas = [];
    _cqDaUnidade('analitos', u).sort((a, b) => (a.nome || '').localeCompare(b.nome || '')).forEach(a => {
      if (anSel.size && !anSel.has(a.id)) return;
      const todos = testesU.filter(t => t.analitoId === a.id);
      let ts = todos;
      // Ativos: analito ativo e só os testes ativos. Inativos: analito inativo (com os testes) ou os testes inativos de um analito ativo
      if (_cqCadAtivo === 'ativos') { if (a.ativo === false) return; ts = ts.filter(t => t.ativo !== false); }
      else if (_cqCadAtivo === 'inativos' && a.ativo !== false) { ts = ts.filter(t => t.ativo === false); if (!ts.length) return; }
      if (chaves.size) {
        ts = ts.filter(t => chaves.has(_cqEquipChave(_cqEquipDoTeste(t))));
        if (!ts.length && !_cqEquipsDoAnalito(a).some(o => chaves.has(_cqEquipChave(o.value)))) return;
      }
      // Setor: testes do setor; o analito sem teste nele aparece se tiver equipamento no setor
      if (fSetor) {
        ts = ts.filter(t => _cqTestePassaSetor(t, fSetor));
        if (!ts.length && !_cqEquipsDoAnalito(a).some(o => o.ativo && _orgSetorIdsDoAtivo(o.ativo).some(id => _cqSetorPassa(id, fSetor)))) return;
      }
      if (q && !bate(`${a.codigo || ''} ${a.nome} `)) { ts = ts.filter(t => bate(txtTeste(t))); if (!ts.length) return; }
      const semTeste = !todos.length && a.ativo !== false;
      const comPend = ts.map(t => ({ t, p: _cqPendenciasTeste(t) }));
      const nPend = comPend.reduce((n, x) => n + x.p.length, 0);
      if (_cqCadPend) { if (!nPend && !semTeste) return; ts = comPend.filter(x => x.p.length).map(x => x.t); }
      linhas.push({ a, ts, nTotal: todos.length, nPend, semTeste });
    });
    const chev = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="9 6 15 12 9 18"/></svg>`;
    el.innerHTML = `<div class="oc-table-scroll"><table class="ot-list-table cq-table cq-an-tbl">
      <thead><tr>${_cqCadThExpandir(linhas.map(x => x.a.id))}<th class="ot-list-th">Código</th><th class="ot-list-th">Analito</th><th class="ot-list-th">Unidade</th><th class="ot-list-th">Tipo</th><th class="ot-list-th">Equipamentos / sistemas</th><th class="ot-list-th">ETa / resultados</th><th class="ot-list-th">Testes</th></tr></thead>
      <tbody>${linhas.length ? linhas.map(({ a, ts, nTotal, nPend, semTeste }) => {
        const aberto = _cqCadAberto(a.id);
        const qual = a.tipo && a.tipo !== 'quantitativo';
        return `<tr class="ot-list-row${a.ativo === false ? ' oc-row-final' : ''}${aberto ? ' cq-an-aberto' : ''}" onclick="cqAnalitoVer('${a.id}')">
          <td><button type="button" class="cq-icobtn cq-an-exp${aberto ? ' aberto' : ''}" title="${aberto ? 'Ocultar' : 'Mostrar'} testes" onclick="event.stopPropagation();cqCadExpandir('${a.id}',${aberto})">${chev}</button></td>
          <td class="oc-num">${_cqEsc(a.codigo || '—')}</td><td><b>${_cqEsc(a.nome)}</b>${_cqUnidadesTag(a)}</td><td>${_cqEsc(a.unidadeMedida || '—')}</td>
          <td>${_cqEsc(CQ_TIPOS_ANALITO[a.tipo] || a.tipo || CQ_TIPOS_ANALITO.quantitativo)}</td>
          <td style="font-size:12px;max-width:240px;">${_cqEquipsDoAnalito(a).length ? _cqEsc(_cqEquipsDoAnalito(a).map(o => o.label).join(', ')) : '<span class="cq-txt-amarelo">nenhum — vincule para criar testes</span>'}</td>
          <td style="font-size:12px;">${qual ? `${_cqArr(a.escala).length} resultados possíveis`
            : a.eta?.valor ? `<span title="${_cqEsc(a.eta.fonte || '')}">${_cqNum(Number(a.eta.valor), 1)}${a.eta.tipo === 'abs' ? ' ' + _cqEsc(a.unidadeMedida) : '%'}</span>` : '<span class="cq-txt-amarelo">ETa não definido</span>'}</td>
          <td style="white-space:nowrap;">${nTotal ? `<span class="cq-an-nteste">${nTotal}</span>` : ''}${nPend ? ` <span class="cq-badge cq-st-alerta" title="Níveis sem lote, sem alvo ou sem esperado">${nPend} pendência(s)</span>` : ''}${semTeste ? '<span class="cq-badge cq-st-semalvo">sem teste</span>' : ''}</td></tr>
        ${aberto ? `<tr class="cq-an-testes"><td></td><td colspan="7">${_cqTestesTabelaHTML(a, ts)}</td></tr>` : ''}`;
      }).join('') : `<tr><td colspan="8" class="cq-td-vazio">${filtrando ? 'Nenhum analito ou teste corresponde aos filtros.' : 'Nenhum analito nesta área.'}</td></tr>`}</tbody>
    </table></div>`;
    return;
  }

  const chev = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="9 6 15 12 9 18"/></svg>`;
  const sit = _cqCadSit;
  const podeCfg = _cqCan('configurar');
  const podeEd = _cqPodeEditarCad();
  // Linha do grupo (material / produto) com a seta que mostra os lotes; recolhida por padrão
  const grupoTr = (id, cls, onclick, celulas) => {
    const aberto = _cqCadAberto(id);
    return { aberto, html: `<tr class="ot-list-row${cls}${aberto ? ' cq-an-aberto' : ''}" onclick="${onclick}">
      <td><button type="button" class="cq-icobtn cq-an-exp${aberto ? ' aberto' : ''}" title="${aberto ? 'Ocultar' : 'Mostrar'} lotes" onclick="event.stopPropagation();cqCadExpandir('${id}',${aberto})">${chev}</button></td>${celulas}</tr>` };
  };
  const nLotesHTML = (ls, total) => {
    if (!total) return '<span class="cq-badge cq-st-semalvo">sem lote</span>';
    const venc = ls.filter(l => _cqLoteVencidoAberto(l, hoje)).length;
    return `<span class="cq-an-nteste${ls.length ? '' : ' zero'}" title="${ls.length} de ${total} lote(s) na situação filtrada">${ls.length}</span>${total > ls.length ? `<span class="cq-muted"> / ${total}</span>` : ''}${venc ? ` <span class="cq-badge cq-st-rejeitado">${venc} vencido(s)</span>` : ''}`;
  };
  const filtroAnEq = _cqCadAnalitos.length > 0 || _cqCadEquips.length > 0;
  // Abas Ativos / Inativos dentro do grupo aberto (devolve a aba e os lotes dela)
  const abaLotes = (gid, ls) => {
    const k = _cqLotesAbaAtual(gid, ls);
    return { k, ls: ls.filter(l => _cqLoteInativo(l) === (k === 'inativos')), seg: _cqLotesSegHTML(ls, k, `cqLotesAba('${gid}',this.dataset.k)`) };
  };
  const vazioSit = sit.length ? ` na situação ${sit.map(k => CQ_SITUACAO_FILTRO[k]).join(' / ').toLowerCase()}` : '';
  const vazioLotes = (total, cols = 5) => `<tr><td colspan="${cols}" class="cq-td-vazio">${total ? `Nenhum lote${vazioSit}.` : 'Nenhum lote cadastrado.'}</td></tr>`;
  const equipsAnalitosHTML = (eqs, ans) => `${eqs.length ? `<b>${_cqEsc(eqs.map(_cqRotuloEquip).join(', '))}</b>` : '<span class="cq-muted">Qualquer equipamento</span>'}<br>${_cqArr(ans).length ? _cqEsc(_cqArr(ans).map(a => _cqAnalito(a)?.nome || '?').join(', ')) : '<span class="cq-muted">Todos os analitos</span>'}`;

  if (_cqCadTab === 'materiais') {
    // Testes da unidade com o lote em uso (abre a aba "Uso nos testes" do lote)
    const usoTxt = l => {
      const ts = _cqTestesDoFiltro(u).filter(t => Object.values(t.lotesAtivos || {}).includes(l.id));
      return ts.length ? `<a href="#" onclick="event.preventDefault();event.stopPropagation();cqLoteVer('${l.id}','uso')" title="${_cqEsc(ts.map(t => `${_cqNomeTeste(t)} · ${_cqEquipTeste(t)}`).join('; '))}">${ts.length} teste(s)</a>` : '<span class="cq-muted">—</span>';
    };
    const todosLotes = _cqDaUnidade('lotesControle', u);
    const linhas = [];
    _cqDaUnidade('materiais', u).sort((a, b) => (a.nome || '').localeCompare(b.nome || '')).forEach(m => {
      if (!_cqCadAtivoBate(m) || !_cqCadFiltroServe(m, m.equips) || !_cqProdutoPassaSetor(m, u)) return;
      const todos = todosLotes.filter(l => l.materialId === m.id).sort((a, b) => (b.validade || '').localeCompare(a.validade || ''));
      let ls = todos.filter(l => _cqLoteNaSituacao(l, sit, hoje));
      if (!bate(`${m.nome} ${m.fabricante || ''} ${m.codigoReferencia || ''} ${m.matriz || ''}`)) { ls = ls.filter(l => bate(l.lote)); if (!ls.length) return; }
      // A situação filtra só os lotes: o material aparece mesmo sem lote na situação (contagem 0 / total)
      linhas.push({ m, ls, total: todos.length });
    });
    el.innerHTML = `<div class="oc-table-scroll"><table class="ot-list-table cq-table cq-an-tbl">
      <thead><tr>${_cqCadThExpandir(linhas.map(x => x.m.id))}<th class="ot-list-th">Material</th><th class="ot-list-th">Fabricante</th><th class="ot-list-th">Tipo</th><th class="ot-list-th">Matriz</th><th class="ot-list-th">Níveis</th><th class="ot-list-th">Equipamentos / analitos</th><th class="ot-list-th">Lotes</th>${podeEd ? '<th class="ot-list-th"></th>' : ''}</tr></thead>
      <tbody>${linhas.length ? linhas.map(({ m, ls, total }) => {
        const g = grupoTr(m.id, m.ativo === false ? ' oc-row-final' : '', `cqMaterialVer('${m.id}')`, `
          <td><b>${_cqEsc(m.nome)}</b>${_cqUnidadesTag(m)}${m.ativo === false ? ' <span class="cq-badge cq-st-semalvo">inativo</span>' : ''}${m.codigoReferencia ? `<div class="cq-muted">${_cqEsc(m.codigoReferencia)}</div>` : ''}</td>
          <td>${_cqEsc(m.fabricante || '—')}${m.regAnvisa ? `<div class="cq-muted">ANVISA ${_cqEsc(m.regAnvisa)}</div>` : ''}</td><td>${_cqEsc(CQ_TIPOS_MATERIAL[m.tipo] || m.tipo)}</td><td>${_cqEsc(m.matriz || '—')}</td>
          <td>${Object.entries(m.niveis || {}).map(([n, x]) => `N${n}${x?.nome ? ' ' + _cqEsc(x.nome) : ''}`).join(', ')}</td>
          <td style="font-size:12px;max-width:260px;">${equipsAnalitosHTML(_cqArr(m.equips), m.analitoIds)}</td>
          <td style="white-space:nowrap;">${nLotesHTML(ls, total)}</td>
          ${podeEd ? `<td class="cq-td-acao"><button type="button" class="btn btn-outline btn-sm" onclick="event.stopPropagation();cqMaterialForm('${m.id}')">${CQ_ICO.edit} Editar</button></td>` : ''}`);
        const ab = abaLotes(m.id, ls);
        const nColL = podeEd ? 7 : 6;
        return g.html + (g.aberto ? `<tr class="cq-an-testes"><td></td><td colspan="${podeEd ? 8 : 7}">${ab.seg}
          <div class="oc-table-scroll"><table class="ot-list-table cq-table cq-table-sm cq-an-testes-tbl">
            <thead><tr><th class="ot-list-th">Lote</th><th class="ot-list-th">Níveis</th><th class="ot-list-th">Validade</th><th class="ot-list-th">Em uso em</th><th class="ot-list-th">Observações</th><th class="ot-list-th">Situação</th>${podeEd ? '<th class="ot-list-th"></th>' : ''}</tr></thead>
            <tbody>${ab.ls.length ? ab.ls.map(l => `<tr class="ot-list-row" onclick="cqLoteVer('${l.id}')"><td class="oc-num" style="font-size:12.5px;">${_cqEsc(l.lote)}${_cqUnidadesTag(l)}</td>
              <td>${_cqArr(l.niveis).map(n => 'N' + n).join(', ')}</td><td class="${_cqLoteVencido(l, hoje) ? 'oc-vencido' : ''}">${_cqFmtData(l.validade)}</td>
              <td style="font-size:12px;">${usoTxt(l)}</td>
              <td style="font-size:12px;max-width:300px;">${_cqEsc(l.observacoes || '—')}</td><td>${_cqLoteSituacaoBadge(l, hoje)}</td>
              ${podeEd ? `<td class="cq-td-acao"><button type="button" class="btn btn-outline btn-sm" onclick="event.stopPropagation();cqLoteForm('${l.id}')">${CQ_ICO.edit} Editar</button></td>` : ''}</tr>`).join('') : ls.length ? _cqLotesAbaVazio(ab.k, nColL) : vazioLotes(total, nColL)}</tbody></table></div>
          ${_cqPodeCriarLote() ? `<button class="btn btn-outline btn-sm cq-an-novo-teste" onclick="event.stopPropagation();cqLoteForm(null,{materialId:'${m.id}'})">${CQ_ICO.plus} Novo lote de ${_cqEsc(m.nome)}</button>` : ''}</td></tr>` : '');
      }).join('') : `<tr><td colspan="${podeEd ? 9 : 8}" class="cq-td-vazio">${q || filtroAnEq ? 'Nenhum material ou lote corresponde aos filtros.' : 'Nenhum material nesta área.'}</td></tr>`}</tbody>
    </table></div>`;
    return;
  }

  if (_cqCadTab === 'insumos') {
    const lotesU = _cqDaUnidade('insumos', u);
    const prods = new Map(_cqDaUnidade('insumoProdutos', u).map(p => [p.id, p]));
    lotesU.forEach(i => { const p = _cqProdutoInsumo(i); if (p) prods.set(p.id, p); });
    const linhas = [];
    [...prods.values()].sort((a, b) => (CQ_TIPOS_INSUMO[a.tipo] || '').localeCompare(CQ_TIPOS_INSUMO[b.tipo] || '') || (a.nome || '').localeCompare(b.nome || '', 'pt')).forEach(p => {
      if (!_cqCadAtivoBate(p) || !_cqCadFiltroServe(p, _cqEquipsInsumo(p)) || !_cqProdutoPassaSetor(p, u)) return;
      if (_cqCadProds.length && !_cqCadProds.includes(p.id)) return;
      const todos = lotesU.filter(i => _cqLoteCru(i).produtoId === p.id).sort((a, b) => (b.validade || '').localeCompare(a.validade || ''));
      let ls = todos.filter(l => _cqLoteNaSituacao(l, sit, hoje));
      if (!bate(`${p.nome} ${p.fabricante || ''} ${p.regAnvisa || ''} ${CQ_TIPOS_INSUMO[p.tipo] || ''}`)) { ls = ls.filter(l => bate(l.lote)); if (!ls.length) return; }
      // A situação filtra só os lotes: o produto aparece mesmo sem lote na situação (contagem 0 / total)
      linhas.push({ p, ls, total: todos.length });
    });
    const prepTxt = l => {
      if (!l.preparoInterno) return '<span class="cq-muted">—</span>';
      const ps = _cqPreparosDe(l);
      return ps.length ? `${ps.length} · último ${_cqFmtData(ps[0].data)}` : '<span class="cq-muted">nenhum</span>';
    };
    const legados = _cqCadAtivo === 'inativos' || _cqCadProds.length ? [] : lotesU.filter(i => !_cqProdutoInsumo(i)).filter(i => _cqLoteNaSituacao(i, sit, hoje) && _cqCadFiltroServe(i, _cqEquipsInsumo(i)) && bate(`${i.nome} ${i.lote} ${i.fabricante || ''}`))
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt') || (b.validade || '').localeCompare(a.validade || ''));
    el.innerHTML = `<div class="oc-table-scroll"><table class="ot-list-table cq-table cq-an-tbl">
      <thead><tr>${_cqCadThExpandir(linhas.map(x => x.p.id))}<th class="ot-list-th">Tipo</th><th class="ot-list-th">Produto</th><th class="ot-list-th">Equipamentos / analitos</th><th class="ot-list-th">Preparo interno</th><th class="ot-list-th">Lotes</th>${podeEd ? '<th class="ot-list-th"></th>' : ''}</tr></thead>
      <tbody>${linhas.length ? linhas.map(({ p, ls, total }) => {
        const prep = p.preparoInterno ? `Sim${p.preparo?.validadeDias ? ` · validade ${p.preparo.validadeDias} dia(s)` : ''}${p.preparo?.especificacao ? `<div class="cq-muted">${_cqEsc(p.preparo.especificacao)}</div>` : ''}` : '<span class="cq-muted">Não</span>';
        const g = grupoTr(p.id, p.ativo === false ? ' oc-row-final' : '', `cqInsumoProdutoVer('${p.id}')`, `
          <td>${_cqEsc(CQ_TIPOS_INSUMO[p.tipo] || p.tipo)}</td>
          <td><b>${_cqEsc(p.nome)}</b>${_cqUnidadesTag(p)}${p.ativo === false ? ' <span class="cq-badge cq-st-semalvo">inativo</span>' : ''}<div class="cq-muted">${_cqEsc([p.fabricante, p.regAnvisa ? 'ANVISA ' + p.regAnvisa : ''].filter(Boolean).join(' · '))}</div></td>
          <td style="font-size:12px;max-width:260px;">${equipsAnalitosHTML(_cqEquipsInsumo(p), p.analitoIds)}</td>
          <td style="font-size:12px;">${prep}</td>
          <td style="white-space:nowrap;">${nLotesHTML(ls, total)}</td>
          ${podeEd ? `<td class="cq-td-acao"><button type="button" class="btn btn-outline btn-sm" onclick="event.stopPropagation();cqInsumoProdutoForm('${p.id}')">${CQ_ICO.edit} Editar</button></td>` : ''}`);
        const ab = abaLotes(p.id, ls);
        return g.html + (g.aberto ? `<tr class="cq-an-testes"><td></td><td colspan="${podeEd ? 6 : 5}">${ab.seg}
          <div class="oc-table-scroll"><table class="ot-list-table cq-table cq-table-sm cq-an-testes-tbl">
            <thead><tr><th class="ot-list-th">Lote</th><th class="ot-list-th">Validade</th><th class="ot-list-th">Preparos</th><th class="ot-list-th">Observações</th><th class="ot-list-th">Situação</th>${podeEd ? '<th class="ot-list-th"></th>' : ''}</tr></thead>
            <tbody>${ab.ls.length ? ab.ls.map(l => `<tr class="ot-list-row" onclick="cqInsumoVer('${l.id}')"><td class="oc-num" style="font-size:12.5px;">${_cqEsc(l.lote)}${_cqUnidadesTag(l)}</td>
              <td class="${_cqLoteVencido(l, hoje) ? 'oc-vencido' : ''}">${_cqFmtData(l.validade)}</td><td style="font-size:12px;">${prepTxt(l)}</td>
              <td style="font-size:12px;max-width:300px;">${_cqEsc(l.observacoes || '—')}</td><td><div class="cq-lote-sit">${_cqLoteSituacaoBadge(l, hoje)}${podeEd ? _cqLoteUsoBtn(l, hoje) : ''}</div></td>
              ${podeEd ? `<td class="cq-td-acao"><button type="button" class="btn btn-outline btn-sm" onclick="event.stopPropagation();cqInsumoForm('${l.id}')">${CQ_ICO.edit} Editar</button></td>` : ''}</tr>`).join('') : ls.length ? _cqLotesAbaVazio(ab.k, podeEd ? 6 : 5) : vazioLotes(total, podeEd ? 6 : 5)}</tbody></table></div>
          ${_cqPodeCriarLote() ? `<button class="btn btn-outline btn-sm cq-an-novo-teste" onclick="event.stopPropagation();cqInsumoForm(null,{produtoId:'${p.id}'})">${CQ_ICO.plus} Novo lote de ${_cqEsc(p.nome)}</button>` : ''}</td></tr>` : '');
      }).join('') : `<tr><td colspan="${podeEd ? 7 : 6}" class="cq-td-vazio">${q || filtroAnEq || _cqCadProds.length ? 'Nenhum produto ou lote corresponde aos filtros.' : 'Nenhum produto nesta área.'}</td></tr>`}</tbody>
    </table></div>
    ${legados.length ? `<div class="cq-sec-titulo" style="margin-top:22px;">Lotes sem produto (cadastro antigo)</div>
      <div class="cq-nota" style="margin-bottom:8px;">Cadastrados quando produto e lote eram um registro só. ${podeCfg ? 'Use “Organizar lote(s) antigo(s)” acima ou abra o lote e escolha o produto.' : 'Um usuário com permissão de configurar deve organizá-los em produtos.'}</div>
      <div class="oc-table-scroll"><table class="ot-list-table cq-table">
        <thead><tr><th class="ot-list-th">Tipo</th><th class="ot-list-th">Produto</th><th class="ot-list-th">Lote</th><th class="ot-list-th">Validade</th><th class="ot-list-th">Equipamentos / analitos</th><th class="ot-list-th">Situação</th></tr></thead>
        <tbody>${legados.map(i => `<tr class="ot-list-row" onclick="cqInsumoForm('${i.id}')"><td>${_cqEsc(CQ_TIPOS_INSUMO[i.tipo] || i.tipo)}</td>
          <td><b>${_cqEsc(i.nome)}</b>${_cqUnidadesTag(i)}<div class="cq-muted">${_cqEsc(i.fabricante || '')}</div></td><td class="oc-num" style="font-size:12.5px;">${_cqEsc(i.lote)}</td>
          <td class="${_cqLoteVencido(i, hoje) ? 'oc-vencido' : ''}">${_cqFmtData(i.validade)}</td>
          <td style="font-size:12px;max-width:240px;">${equipsAnalitosHTML(_cqEquipsInsumo(i), i.analitoIds)}</td>
          <td>${_cqLoteSituacaoBadge(i, hoje)}</td></tr>`).join('')}</tbody>
      </table></div>` : ''}`;
  }
}

// Lotes ativos (qualquer situação exceto Encerrado) e inativos (Encerrado)
function _cqLoteInativo(l) { return (l?.status || 'em_uso') === 'encerrado'; }
const _cqLotesAba = {};   // aba escolhida por material/produto na tabela: 'ativos' | 'inativos'
// Aba inicial: a escolhida; sem escolha, Ativos (ou Inativos, se só houver encerrados)
function _cqLotesAbaAtual(gid, ls) {
  if (_cqLotesAba[gid]) return _cqLotesAba[gid];
  return !ls.some(l => !_cqLoteInativo(l)) && ls.some(_cqLoteInativo) ? 'inativos' : 'ativos';
}
function cqLotesAba(gid, k) { _cqLotesAba[gid] = k; _cqCadRenderLista(); }
function _cqLotesSegHTML(ls, atual, onclick) {
  const nA = ls.filter(l => !_cqLoteInativo(l)).length, nI = ls.length - nA;
  return `<div class="cq-seg cq-lotes-seg" role="tablist" onclick="event.stopPropagation()">${[['ativos', CQ_ICO.play + 'Ativos', nA, 'Em uso, em avaliação, quarentena ou vencido ainda não encerrado'], ['inativos', 'Inativos', nI, 'Encerrados']]
    .map(([k, l, n, t]) => `<button type="button" data-k="${k}" class="${k === atual ? 'active' : ''}" title="${t}" onclick="${onclick}">${l} <span class="cq-seg-n">${n}</span></button>`).join('')}</div>`;
}
function _cqLotesAbaVazio(k, cols) { return `<tr><td colspan="${cols}" class="cq-td-vazio">${k === 'inativos' ? 'Nenhum lote encerrado.' : 'Nenhum lote ativo.'}</td></tr>`; }
// Troca de aba na janela, sem redesenhar
function cqLotesAbaJanela(btn) {
  const box = btn.closest('.cq-lotes-janela');
  if (!box) return;
  box.querySelectorAll('.cq-lotes-seg button').forEach(b => b.classList.toggle('active', b === btn));
  box.querySelectorAll('.cq-lotes-pane').forEach(p => { p.hidden = p.dataset.k !== btn.dataset.k; });
}

// Lista compacta de lotes (abas Lotes do material e do produto); `abrir` = função do formulário do lote
function _cqLotesCompactoHTML(lotes, abrir, novo) {
  const hoje = _cqHoje();
  const k0 = !lotes.some(l => !_cqLoteInativo(l)) && lotes.some(_cqLoteInativo) ? 'inativos' : 'ativos';
  const lista = (ls, vazio) => `<div class="cq-te-lista">${ls.map(l => `<div class="cq-te-item${l.status === 'encerrado' ? ' inativo' : ''}" onclick="${abrir}('${l.id}')" title="Abrir lote">
      <div class="cq-te-item-txt"><b>Lote ${_cqEsc(l.lote)}</b><small>${_cqEsc([`val. ${_cqFmtData(l.validade)}`, _cqSiglasUnidades(_cqUnidadesRec(l)), l.observacoes].filter(Boolean).join(' · '))}</small></div>${_cqLoteSituacaoBadge(l, hoje)}
      <svg class="cq-te-item-seta" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="9 6 15 12 9 18"/></svg></div>`).join('')
    || `<div class="cq-ms-vazio">${vazio}</div>`}</div>`;
  if (!lotes.length) return `${lista([], 'Nenhum lote cadastrado.')}${novo || ''}`;
  return `<div class="cq-lotes-janela">${_cqLotesSegHTML(lotes, k0, 'cqLotesAbaJanela(this)')}
    ${[['ativos', 'Nenhum lote ativo.'], ['inativos', 'Nenhum lote encerrado.']].map(([k, v]) => `<div class="cq-lotes-pane" data-k="${k}"${k === k0 ? '' : ' hidden'}>${lista(lotes.filter(l => _cqLoteInativo(l) === (k === 'inativos')), v)}</div>`).join('')}
  </div>${novo || ''}`;
}
// Aviso no formulário do lote encerrado pelo gatilho de vencimento
function _cqEncerradoAutoNota(l) {
  if (!l || l.status !== 'encerrado' || !l.encerradoAuto) return '';
  return `<div class="cq-alerta-box">${CQ_ICO.alerta} Encerrado automaticamente em ${_cqFmtDH(l.encerradoAuto.em)}: validade ${_cqFmtData(l.encerradoAuto.validade)} expirada. Para reabrir, corrija a validade e altere a situação.</div>`;
}

// Botão play/stop do lote de insumo: Em uso ⇄ Encerrado (sempre pede confirmação)
// origem 'ver': chamado da visualização do lote, que é redesenhada depois de gravar
function _cqLoteUsoBtn(l, hoje, origem) {
  const enc = (l.status || 'em_uso') === 'encerrado';
  const venc = _cqLoteVencido(l, hoje);
  if (enc && venc) return `<span class="cq-lote-uso off" title="Lote vencido: corrija a validade para reabrir">${CQ_ICO.play}</span>`;
  const rot = enc ? 'Colocar em uso' : 'Encerrar lote (esgotado ou descartado)';
  return `<button type="button" class="cq-lote-uso ${enc ? 'play' : 'stop'}" title="${rot}" aria-label="${rot}" onclick="event.stopPropagation();cqInsumoLoteAlternar('${l.id}'${origem ? `,'${origem}'` : ''})">
    ${enc ? CQ_ICO.play : '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>'}<span>${enc ? 'Usar' : 'Encerrar'}</span></button>`;
}
function cqInsumoLoteAlternar(id, origem) {
  if (!_cqPodeEditarCad()) { showToast('Sem permissão para alterar a situação do lote.', 'error'); return; }
  const i = cqState.config.insumos[id];
  if (!i || _cqSalvando) return;
  const cru = _cqLoteCru(i);
  const antes = cru.status || 'em_uso';
  const novo = antes === 'encerrado' ? 'em_uso' : 'encerrado';
  if (novo === 'em_uso' && _cqLoteVencido(cru)) { showToast(`Lote ${cru.lote} vencido (${_cqFmtData(cru.validade)}): corrija a validade para reabrir.`, 'error'); return; }
  const prod = _cqProdutoInsumo(i);
  const nome = `${prod?.nome ? `${_cqEsc(prod.nome)} · ` : ''}lote <b>${_cqEsc(cru.lote)}</b>`;
  const emUso = i.preparoInterno ? _cqPreparosDe(i).filter(p => !p.finalizado && p.situacao !== 'reprovado').length : 0;
  const corpo = novo === 'encerrado'
    ? `<p style="margin:0 0 10px;">Encerrar ${nome}?</p>
       <div class="cq-alerta-box">${CQ_ICO.alerta} O lote vai para a aba Inativos e deixa de ser oferecido em novos preparos e lançamentos. Use quando o lote estiver esgotado ou descartado.</div>
       ${emUso ? `<p style="margin:10px 0 0;font-size:13px;color:var(--text-muted);">${emUso} preparo${emUso === 1 ? '' : 's'} deste lote continua${emUso === 1 ? '' : 'm'} em uso até ser${emUso === 1 ? '' : 'em'} finalizado${emUso === 1 ? '' : 's'} ou substituído${emUso === 1 ? '' : 's'}.</p>` : ''}
       <p style="margin:10px 0 0;font-size:13px;color:var(--text-muted);">Pode ser reaberto depois, se ainda estiver na validade. A alteração fica na trilha do lote.</p>`
    : `<p style="margin:0 0 10px;">Colocar ${nome} em uso de novo?</p>
       <p style="margin:0;font-size:13px;color:var(--text-muted);">O lote volta para a aba Ativos e passa a ser oferecido nos preparos e lançamentos (validade ${_cqFmtData(cru.validade)}). A alteração fica na trilha do lote.</p>`;
  _cqPrompt({
    titulo: novo === 'encerrado' ? 'Encerrar lote' : 'Colocar lote em uso',
    subtitulo: `${prod?.nome || 'Lote'} · lote ${cru.lote}`,
    corpo,
    confirmar: novo === 'encerrado' ? 'Encerrar lote' : 'Colocar em uso',
    perigo: novo === 'encerrado',
    onConfirm: () => _cqInsumoLoteGravar(id, novo, origem),
  });
}
async function _cqInsumoLoteGravar(id, novo, origem) {
  const i = cqState.config.insumos[id];
  if (!i || _cqSalvando || !_cqPodeGravar()) return false;
  const cru = _cqLoteCru(i);
  const antes = cru.status || 'em_uso';
  if (antes === novo) return true;   // já mudou por outro caminho
  const ass = _cqAssinatura();
  const base = `${CQ_KEYS.config}/insumos/${id}`;
  const updates = {
    [`${base}/status`]: novo,
    [`${base}/atualizadoEm`]: ass.em,
    [`${base}/trilha/${_cqTk()}`]: _cqTrilhaEntry('edicao', `Lote ${cru.lote} ${novo === 'encerrado' ? 'encerrado' : 'colocado em uso'} pela ${origem === 'ver' ? 'visualização do lote' : 'lista de lotes'}`,
      [{ campo: 'Situação', antes: CQ_STATUS_LOTE[antes]?.label || antes, depois: CQ_STATUS_LOTE[novo].label }]),
  };
  if (novo === 'em_uso') updates[`${base}/encerradoAuto`] = null;
  _cqSalvando = true;
  try {
    if (!(await window.dbUpdate(updates))) { showToast('Falha ao gravar. Verifique a conexão.', 'error'); return false; }
  } finally { _cqSalvando = false; }
  cru.status = novo;
  if (novo === 'em_uso') delete cru.encerradoAuto;
  _cqHidratarInsumos();
  showToast(`Lote ${cru.lote} ${novo === 'encerrado' ? 'encerrado' : 'em uso'}.`, 'success');
  _cqCadRenderLista();
  if (origem === 'ver') cqInsumoVer(id);
  return true;
}

const CQ_STATUS_LOTE = {
  em_uso: { label: 'Em uso', cls: 'cq-st-aceito' }, em_avaliacao: { label: 'Em avaliação', cls: 'cq-st-pendente' },
  quarentena: { label: 'Quarentena', cls: 'cq-st-alerta' }, encerrado: { label: 'Encerrado', cls: 'cq-st-semalvo' },
};
const CQ_STATUS_LOTE_DESC = {
  em_uso: 'Oferecido nos lançamentos',
  em_avaliacao: 'Lote novo em teste; também oferecido nos lançamentos',
  quarentena: 'Bloqueado: aparece nos lançamentos, mas não pode ser usado',
  encerrado: 'Fora de uso: esgotado, descartado ou vencido',
};

// Popover de seleção única: botão com bolinha colorida + lista com descrição e ✓.
// Valor no input oculto `id` (lido por _cqVal); `onchange` opcional recebe o valor escolhido.
const _cqPopSelCb = {};
// `limpar`: código JS de um botão × que aparece quando há valor escolhido
function _cqPopSelHTML(id, ops, atual, { pode = true, onchange = null, compacto = false, placeholder = '', limpar = '' } = {}) {
  _cqPopSelCb[id] = { onchange, ops };
  const op = ops.find(o => o.value === atual) || (placeholder ? { value: '', label: placeholder, ico: CQ_ICO.ativo, vazio: true } : ops[0]);
  const item = (o, i) => `<button type="button" class="cq-sitpop-op${o.value === op.value ? ' sel' : ''}" data-i="${i}" onclick="cqPopSel('${id}',${i})">
      <span class="cq-sitpop-marca">${_cqPopSelMarca(o)}</span><span class="cq-sitpop-txt"><b>${_cqEsc(o.label)}</b>${o.desc ? `<small>${_cqEsc(o.desc)}</small>` : ''}</span>
      <svg class="cq-sitpop-ok" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><polyline points="20 6 9 17 4 12"/></svg></button>`;
  return `<div class="cq-sitpop${compacto ? ' compacto' : ''}${op.vazio ? ' vazio' : ''}" id="${id}-pop">
    <input type="hidden" id="${id}" value="${_cqEsc(op.value)}">
    <button type="button" class="cq-sitpop-btn" ${pode ? `onclick="cqSitPopAbrir('${id}')"` : 'disabled'} aria-haspopup="listbox">
      <span class="cq-sitpop-marca">${_cqPopSelMarca(op)}</span><span class="cq-sitpop-rot">${_cqEsc(op.label)}</span>
      ${limpar && !op.vazio ? `<span class="cq-sitpop-x" role="button" title="Desmarcar" onclick="event.stopPropagation();${limpar}">×</span>` : ''}
      <svg class="cq-sitpop-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></button>
    <div class="cq-sitpop-menu" role="listbox">${ops.map(item).join('')}</div>
  </div>`;
}
// Bolinha colorida (dot) ou ícone (ico) da opção
function _cqPopSelMarca(o) { return o.ico ? `<span class="cq-sitpop-ico">${o.ico}</span>` : `<span class="cq-sitpop-dot st-${o.dot || o.value || 'todas'}"></span>`; }
function cqPopSel(id, i) {
  const pop = document.getElementById(id + '-pop');
  const inp = document.getElementById(id);
  const cfg = _cqPopSelCb[id] || {};
  const op = (cfg.ops || [])[i];
  if (!pop || !inp || !op) return;
  inp.value = op.value;
  pop.querySelector('.cq-sitpop-btn .cq-sitpop-marca').innerHTML = _cqPopSelMarca(op);
  pop.querySelector('.cq-sitpop-rot').textContent = op.label;
  pop.classList.remove('vazio');
  pop.querySelectorAll('.cq-sitpop-op').forEach(x => x.classList.toggle('sel', Number(x.dataset.i) === i));
  pop.classList.remove('aberto');
  if (cfg.onchange) cfg.onchange(op.value);
}
// Situação do lote (formulários de lote de controle e de insumo)
function _cqSitPopHTML(id, atual, pode) {
  const ops = Object.keys(CQ_STATUS_LOTE).map(k => ({ value: k, label: CQ_STATUS_LOTE[k].label, desc: CQ_STATUS_LOTE_DESC[k] }));
  return _cqPopSelHTML(id, ops, CQ_STATUS_LOTE[atual] ? atual : 'em_uso', { pode });
}
function cqSitPopAbrir(id) {
  const pop = document.getElementById(id + '-pop');
  if (!pop) return;
  const abrir = !pop.classList.contains('aberto');
  document.querySelectorAll('.cq-sitpop.aberto').forEach(x => x.classList.remove('aberto'));
  pop.classList.toggle('aberto', abrir);
}
document.addEventListener('click', e => {
  // e.target fora do documento: o clique redesenhou o próprio popover (ex.: seletor de meses)
  if (!document.body?.contains?.(e.target)) return;
  document.querySelectorAll('.cq-sitpop.aberto, .cq-mp.aberto').forEach(x => { if (!x.contains(e.target)) x.classList.remove('aberto'); });
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.cq-sitpop.aberto, .cq-mp.aberto').forEach(x => x.classList.remove('aberto')); });

// Botão liga/desliga (valor no checkbox oculto `id`)
function _cqToggleHTML(id, on, titulo, descOn, descOff, pode) {
  return `<input type="checkbox" id="${id}" hidden ${on ? 'checked' : ''}>
    <button type="button" class="cq-tgl${on ? ' on' : ''}" id="${id}-btn" aria-pressed="${on}" ${pode ? `onclick="cqToggle('${id}')"` : 'disabled'} data-on="${_cqEsc(descOn)}" data-off="${_cqEsc(descOff)}">
      <span class="cq-tgl-sw"><i></i></span><span class="cq-tgl-txt"><b>${titulo}</b><small>${on ? descOn : descOff}</small></span></button>`;
}
function cqToggle(id) {
  const chk = document.getElementById(id), btn = document.getElementById(id + '-btn');
  if (!chk || !btn) return;
  chk.checked = !chk.checked;
  btn.classList.toggle('on', chk.checked);
  btn.setAttribute('aria-pressed', chk.checked);
  btn.querySelector('small').textContent = chk.checked ? btn.dataset.on : btn.dataset.off;
  document.dispatchEvent(new CustomEvent('cq-toggle', { detail: { id, on: chk.checked } }));
}

function _cqResumoRegras(regras) {
  return CQEngine.ORDEM_REGRAS.filter(k => regras?.[k] && regras[k] !== 'off')
    .map(k => CQEngine.REGRAS[k].label + (regras[k] === 'alerta' ? ' (alerta)' : '')).join(' / ') || 'sem regras';
}

function _cqRodapeForm(fnSalvar, podeEditar, fnExcluir, ativoCfg) {
  // Excluir: "Cadastros e áreas de CQ" ou, para lote/produto/material, "Editar cadastros"; ativar/inativar acompanha a edição
  const colExcl = /cqExcluirCadastro\('(\w+)'/.exec(fnExcluir || '')?.[1];
  const esq = podeEditar ? `${fnExcluir && _cqPodeExcluirCad(colExcl) ? `<button class="btn btn-outline cq-btn-perigo" onclick="${fnExcluir}">Excluir</button>` : ''}${_cqBtnAtivoHTML(ativoCfg)}` : '';
  return `${esq ? `<div class="cq-rodape-esq">${esq}</div>` : ''}
    <button class="btn btn-outline" onclick="cqDrawerClose()">${podeEditar ? 'Cancelar' : 'Fechar'}</button>
    ${podeEditar ? `<button class="btn btn-primary" onclick="${fnSalvar}">${CQ_ICO.check} Salvar</button>` : ''}`;
}
function _cqRo(pode) { return pode ? '' : 'disabled'; }

// ── ANALITOS ─────────────────────────────────────────────────
let _cqAnalitoFormId = null;
const CQ_LBL_ANALITO = {
  codigo: 'Código', nome: 'Nome', unidadeMedida: 'Unidade', decimais: 'Casas decimais', tipo: 'Tipo',
  limitesDecisao: 'Limites de decisão', eta: 'Erro total permitido', cvMeta: 'CV meta', escala: 'Resultados possíveis',
  toleranciaPassos: 'Tolerância (categorias)', ativoIds: 'Equipamentos', sistemas: 'Sistemas sem equipamento', unidadeIds: 'Áreas', ativo: 'Ativo',
  indicadorEster: 'Indicador de esterilização', incubacao: 'Incubação do indicador biológico', liberaCiclo: 'Libera o ciclo da autoclave',
};
const _cqFmtSistemas = v => _cqArr(v).join(', ') || '—';
// Sugestões dos campos de lista do analito: o que já está cadastrado na unidade
function _cqSistemasDaUnidade(u) {
  const mapa = new Map();
  const add = x => { const v = String(x || '').trim(); if (v && !mapa.has(_cqItensChave(v))) mapa.set(_cqItensChave(v), v); };
  // Cadastrados na área (Configurações › área › Sistemas sem equipamento) + os já usados
  _cqArr(cqState.config.unidades[u]?.sistemas).forEach(x => add(x?.nome));
  _cqDaUnidade('analitos', u).forEach(a => _cqArr(a.sistemas).forEach(add));
  _cqTestesDaUnidade(u, { incluirInativos: true }).filter(t => !t.ativoId).forEach(t => add(t.sistemaAnalitico || 'Bancada / manual'));
  return [...mapa.values()].sort((a, b) => a.localeCompare(b, 'pt'));
}
function _cqResultadosDaUnidade(u, exceto) {
  const mapa = new Map();
  _cqDaUnidade('analitos', u).filter(a => a.id !== exceto && a.tipo && a.tipo !== 'quantitativo')
    .forEach(a => _cqArr(a.escala).forEach(x => { const v = String(x || '').trim(); if (v && !mapa.has(_cqItensChave(v))) mapa.set(_cqItensChave(v), v); }));
  return [...mapa.values()];
}

// Equipamentos/sistemas do formulário do analito; não remove os que têm testes
function _cqAnalitoEquipCapturar(analitoId) {
  const ativoIds = _cqMultiVal('cq-an-ativos');
  const vistos = new Set();
  const sistemas = _cqItensVal('cq-an-sistemas').map(x => x.trim().replace(/\s+/g, ' ')).filter(x => x && !vistos.has(x.toLowerCase()) && vistos.add(x.toLowerCase()));
  if (analitoId) {
    const faltando = new Set();
    Object.values(cqState.config.testes).filter(t => t.analitoId === analitoId).forEach(t => {
      if (t.ativoId ? !ativoIds.includes(t.ativoId) : !vistos.has((t.sistemaAnalitico || 'Bancada / manual').toLowerCase())) faltando.add(_cqEquipTeste(t));
    });
    if (faltando.size) { showToast(`Em uso por testes deste analito, não pode ser removido: ${[...faltando].join(', ')}.`, 'error'); return null; }
  }
  return { ativoIds, sistemas };
}
const _cqFmtAtivos = v => _cqArr(v).map(_cqNomeAtivo).join(', ') || '—';

function cqAnalitoForm(id, aba) {
  const a = id ? cqState.config.analitos[id] : null;
  const u = _cqUnidadeAtivaId();
  const testesA = a ? _cqTestesDaUnidade(u, { incluirInativos: true }).filter(t => t.analitoId === a.id)
    .sort((x, y) => _cqEquipTeste(x).localeCompare(_cqEquipTeste(y)) || (x.metodo || '').localeCompare(y.metodo || '')) : [];
  const outrasUn = a ? [...new Set(Object.values(cqState.config.testes).filter(t => t.analitoId === a.id && t.unidadeId !== u).map(t => t.unidadeId))] : [];
  const abaT = a && aba === 'testes';
  const pode = _cqPodeEditarCad(!!a);
  _cqAnalitoFormId = id || null;
  const fontes = cqState.config.catalogos.fontesETa;
  const tipo = a?.tipo || 'quantitativo';
  const quant = tipo === 'quantitativo';
  // O tipo não muda depois que há testes: os resultados gravados dependem dele
  const emUso = !!a && Object.values(cqState.config.testes).some(t => t.analitoId === a.id);
  // Sistemas e resultados em uso por testes deste analito (não podem sair da lista)
  const testesAn = a ? Object.values(cqState.config.testes).filter(t => t.analitoId === a.id) : [];
  const sisEmUso = testesAn.filter(t => !t.ativoId).map(t => t.sistemaAnalitico || 'Bancada / manual');
  const escEmUso = testesAn.flatMap(t => _cqNiveisTeste(t).map(n => _cqControleQual(t, n)?.esperado).filter(Boolean));
  cqDrawerOpen({
    titulo: a ? a.nome : 'Novo analito', subtitulo: 'Substância ou característica medida', icone: 'beaker',
    corpo: `
      ${a ? `<div class="ot-modal-tabs cq-drawer-tabs" id="cq-an-abas">
        <button class="ot-modal-tab-btn${abaT ? '' : ' active'}" data-aba="id" onclick="cqAnalitoAba('id')">Identificação</button>
        <button class="ot-modal-tab-btn${abaT ? ' active' : ''}" data-aba="testes" onclick="cqAnalitoAba('testes')">Testes${testesA.length ? ` <span class="cq-step-qtd">${testesA.length}</span>` : ''}</button>
        <button class="ot-modal-tab-btn" data-aba="trilha" onclick="cqAnalitoAba('trilha')">${_cqAbaTrilha(a).rotulo}</button></div>
      <div id="cq-an-pane-testes" style="padding-top:14px;${abaT ? '' : 'display:none;'}">
        ${outrasUn.length ? `<div class="cq-nota">Também há testes deste analito em: ${_cqEsc(_cqSiglasUnidades(outrasUn))} (selecione a área para vê-los).</div>` : ''}
        ${!_cqEquipsDoAnalito(a).length ? `<div class="cq-alerta-box">${CQ_ICO.alerta} Vincule ao menos um equipamento ou sistema analítico na aba Identificação e salve para criar testes.</div>` : ''}
        ${_cqTestesCompactoHTML(a, testesA)}
      </div>` : ''}
      <div id="cq-an-pane-id" style="${abaT ? 'display:none;' : ''}">
      ${_cqInativoNota(a, 'ativo', 'não aparece nos cadastros de testes nem nos lançamentos')}
      <div class="form-section"><div class="form-section-title">${CQ_ICO.beaker}Identificação</div>
        <div class="form-row">
          <div class="form-field" style="max-width:140px;"><label class="field-label">Código</label><input type="text" id="cq-an-codigo" class="field-input" maxlength="16" value="${_cqEsc(a?.codigo)}" ${_cqRo(pode)}></div>
          <div class="form-field"><label class="field-label">Nome <span class="required">*</span></label><input type="text" id="cq-an-nome" class="field-input" maxlength="80" value="${_cqEsc(a?.nome)}" placeholder="Ex.: Glicose" ${_cqRo(pode)}></div>
        </div>
        <div class="form-row">
          <div class="form-field"><label class="field-label">Tipo</label><select id="cq-an-tipo" class="field-select" onchange="cqAnalitoTipoChange()" ${pode && !emUso ? '' : 'disabled'}>
            ${Object.entries(CQ_TIPOS_ANALITO).map(([k, l]) => `<option value="${k}" ${k === tipo ? 'selected' : ''}>${l}</option>`).join('')}</select>
            ${emUso ? '<div class="cq-nota">O tipo não pode ser alterado: há testes cadastrados com este analito.</div>' : ''}</div>
          ${_cqUnidadesCampoHTML('cq-an-un', a, pode, 'O analito só aparece nas listas e no cadastro de testes das áreas selecionadas.', 'analitos')}
        </div>
        <div class="cq-an-equip">
          <div class="form-field"><label class="field-label">Equipamentos que dosam este analito</label>
            ${_cqMultiHTML('cq-an-ativos', _cqOpcoesAtivos(a?.ativoIds), a?.ativoIds, { placeholder: 'Nenhum equipamento vinculado', disabled: !pode, vazio: 'Nenhum equipamento ativo nesta área (Ativos › Unidades e setores).' })}</div>
          <div class="form-field"><label class="field-label">Sistemas analíticos sem equipamento (bancada / manual)</label>
            ${_cqItensHTML('cq-an-sistemas', a?.sistemas, { placeholder: 'Ex.: Bancada de microbiologia', disabled: !pode, max: 60,
              vazio: 'Nenhum sistema sem equipamento.', travados: sisEmUso, travadoMotivo: 'Usado por teste deste analito',
              sugestoes: _cqSistemasDaUnidade(u), sugestoesRotulo: 'Já cadastrados na área' })}</div>
          <div class="cq-nota">Os testes deste analito escolhem o equipamento ou sistema nesta lista, e os reagentes e insumos são filtrados pelo equipamento.${emUso ? ' Equipamentos e sistemas com testes cadastrados não podem ser removidos.' : ''}</div>
        </div>
        <div id="cq-an-quant" style="${quant ? '' : 'display:none;'}">
        <div class="form-row">
          <div class="form-field"><label class="field-label">Unidade de medida <span class="required">*</span></label><input type="text" id="cq-an-unidade" class="field-input" maxlength="20" value="${_cqEsc(a?.unidadeMedida)}" placeholder="mg/dL" ${_cqRo(pode)}></div>
          <div class="form-field" style="max-width:130px;"><label class="field-label">Casas decimais</label><input type="number" min="0" max="4" id="cq-an-dec" class="field-input" value="${a?.decimais ?? 1}" ${_cqRo(pode)}></div>
        </div>
        <div class="form-field"><label class="field-label">Limites de decisão clínica</label>
          <input type="text" id="cq-an-limites" class="field-input" value="${_cqEsc(_cqArr(a?.limitesDecisao).join('; '))}" placeholder="Ex.: 70; 100; 126 (separados por ponto e vírgula)" ${_cqRo(pode)}>
          <div class="cq-nota">Os níveis de controle devem ficar próximos desses valores (PALC 11.3, ISO 15189 7.3.7.2).</div></div>
        </div>
      </div>
      <div class="form-section" id="cq-an-qual" style="${quant ? 'display:none;' : ''}"><div class="form-section-title">${CQ_ICO.lista}Resultados possíveis</div>
        <div class="form-field"><label class="field-label">Resultados <span class="required">*</span> <span class="cq-muted">(mínimo 2)</span></label>
          ${_cqItensHTML('cq-an-escala', a?.escala, { placeholder: 'Ex.: Sem crescimento', disabled: !pode, ordenavel: true, max: 80,
            vazio: 'Nenhum resultado. Adicione ao menos dois.', travados: escEmUso, travadoMotivo: 'Resultado esperado em teste deste analito',
            sugestoes: _cqResultadosDaUnidade(u, a?.id), sugestoesRotulo: 'Usados em outros analitos da área' })}
          <div class="cq-nota">O operador escolhe o resultado nesta lista; o sistema compara com o resultado esperado de cada controle (RDC 978, art. 180, II e V).
            Semiquantitativo: use as setas para deixar em ordem crescente, começando pelo negativo (ex.: Negativo, Traços, 1+, 2+, 3+).</div></div>
        <div class="form-field" id="cq-an-tol-wrap" style="max-width:260px;${tipo === 'semiquantitativo' ? '' : 'display:none;'}"><label class="field-label">Tolerância (categorias)</label>
          <input type="number" min="0" max="2" id="cq-an-tol" class="field-input" value="${a?.toleranciaPassos ?? 1}" ${_cqRo(pode)}>
          <div class="cq-nota">Diferença aceita como alerta. Passar de negativo para positivo (ou o contrário) sempre rejeita.</div></div>
        ${(() => {
          // Analito de autoclave: só o que está marcado aqui é tratado como indicador de esterilização
          const on = !!a?.indicadorEster, sug = !on && a ? _cqIndicadorSugerido(a) : '', tipo = a?.indicadorEster || sug;
          return `<div class="cq-an-ac${on ? ' on' : ''}" id="cq-an-autoclave" data-tipo="${tipo}">
            <div class="cq-an-ac-cab">
              <span class="cq-an-ac-ico">${CQ_ICO_AUTOCLAVE}</span>
              <div class="cq-an-ac-txt"><b>Analito de autoclave</b><small>Indicador de esterilização</small></div>
              <button type="button" class="cq-es-sw" role="switch" aria-checked="${on}" title="Ligar/desligar analito de autoclave" onclick="cqAnAutoclaveSw(this)" ${_cqRo(pode)}><span></span></button>
            </div>
            <input type="checkbox" id="cq-an-autoclave-chk" hidden ${on ? 'checked' : ''}>
            <input type="hidden" id="cq-an-indic" value="${tipo}">
            <div class="cq-an-ac-tipo">${_cqSelHTML('cq-an-indic-sel', Object.entries(CQ_INDICADOR_ESTER).map(([k, l]) => ({ value: k, label: l, sub: CQ_INDICADOR_DESC[k] })), tipo,
              { placeholder: 'Escolha o tipo de indicador…', disabled: !pode, onchange: cqAnAutoclaveTipo, busca: 'Buscar tipo…' })}</div>
            ${(() => {
              const ib = typeof _cqEsterIncubCfg === 'function' ? _cqEsterIncubCfg(a) : { horas: 2, tmin: 55, tmax: 60 };
              const num = v => v == null ? '' : _cqEsc(String(v).replace('.', ','));
              return `<div class="cq-an-ac-ib">
                <span class="cq-an-ac-ib-tit">Bula</span>
                <label>Incubar até <input type="text" inputmode="decimal" id="cq-an-ib-h" class="field-input" value="${num(ib.horas)}" ${_cqRo(pode)}> h</label>
                <span class="cq-an-ac-ib-sep"></span>
                <label>Incubadora <input type="text" inputmode="decimal" id="cq-an-ib-tmin" class="field-input" value="${num(ib.tmin)}" ${_cqRo(pode)}> a
                  <input type="text" inputmode="decimal" id="cq-an-ib-tmax" class="field-input" value="${num(ib.tmax)}" ${_cqRo(pode)}> °C</label>
                <span class="cq-an-ac-ib-info" title="Prazo contado a partir do ciclo. Fora do prazo ou da faixa: alerta em vermelho na corrida de leitura. Faixa vazia: sem conferência.">${CQ_ICO.info}</span>
              </div>`;
            })()}
            ${(() => {
              const lib = on ? !!a.liberaCiclo : true;   // ao marcar como analito de autoclave, libera por padrão
              return `<div class="cq-an-ac-lib">
                <button type="button" class="cq-es-sw" role="switch" aria-checked="${lib}" title="Ligar/desligar" onclick="cqAnLiberaSw(this)" ${_cqRo(pode)}><span></span></button>
                <span class="cq-an-ac-lib-txt"><b>Libera o ciclo da autoclave</b><small id="cq-an-lib-sub">${CQ_AN_LIB_SUB[lib]}</small></span>
                <input type="checkbox" id="cq-an-libera" hidden ${lib ? 'checked' : ''}>
              </div>`;
            })()}
            ${sug ? `<div class="cq-an-ac-sug">Parece ${_cqEsc(CQ_INDICADOR_CURTO[sug].toLowerCase())} pelo nome/código. Ligue para confirmar.</div>` : ''}
          </div>`;
        })()}
        <input type="checkbox" id="cq-an-ativo-q" hidden ${a?.ativo === false ? '' : 'checked'}>
      </div>
      <div class="form-section" id="cq-an-espec" style="${quant ? '' : 'display:none;'}"><div class="form-section-title">${CQ_ICO.shield}Especificação da qualidade</div>
        <div class="form-row">
          <div class="form-field"><label class="field-label">Erro total permitido (ETa)</label><input type="text" id="cq-an-eta" class="field-input" inputmode="decimal" value="${_cqEsc(a?.eta?.valor ?? '')}" placeholder="Ex.: 8" ${_cqRo(pode)}></div>
          <div class="form-field" style="max-width:150px;"><label class="field-label">Expresso em</label><select id="cq-an-eta-tipo" class="field-select" ${_cqRo(pode)}><option value="%" ${a?.eta?.tipo !== 'abs' ? 'selected' : ''}>%</option><option value="abs" ${a?.eta?.tipo === 'abs' ? 'selected' : ''}>unidade do analito</option></select></div>
        </div>
        <div class="form-field"><label class="field-label">Fonte (modelo científico)</label><select id="cq-an-eta-fonte" class="field-select" ${_cqRo(pode)}>${_cqOptions(fontes, a?.eta?.fonte || '')}</select></div>
        <div class="form-field"><label class="field-label">Referência / observação</label><input type="text" id="cq-an-eta-ref" class="field-input" maxlength="200" value="${_cqEsc(a?.eta?.referencia)}" placeholder="Ex.: CMS-3355-F (2024); EFLM BV database, acesso em 10/2026" ${_cqRo(pode)}></div>
        <div class="form-row">
          <div class="form-field"><label class="field-label">CV meta (%)</label><input type="text" id="cq-an-cvmeta" class="field-input" inputmode="decimal" value="${_cqEsc(a?.cvMeta?.valor ?? '')}" ${_cqRo(pode)}></div>
          <div class="form-field"><label class="field-label">Fonte do CV meta</label><input type="text" id="cq-an-cvmeta-fonte" class="field-input" value="${_cqEsc(a?.cvMeta?.fonte)}" placeholder="Ex.: VB desejável (0,5 × CVI)" ${_cqRo(pode)}></div>
        </div>
        <input type="checkbox" id="cq-an-ativo" hidden ${a?.ativo === false ? '' : 'checked'}>
      </div>
      </div>
      ${a ? `<div id="cq-an-pane-trilha" style="padding-top:14px;display:none;">${_cqTrilhaHTML(a)}</div>` : ''}`,
    rodape: _cqRodapeForm('cqAnalitoSalvar()', pode, a ? `cqExcluirCadastro('analitos','${a.id}')` : '',
      a && { ids: 'cq-an-ativo,cq-an-ativo-q', fn: 'cqAnalitoSalvar', colecao: 'analitos', id: a.id, ativo: a.ativo !== false }),
  });
  if (a && aba === 'trilha') cqAnalitoAba('trilha');
  delete document.getElementById('cq-drawer-title')?.dataset.teste;
}
// Visualização do analito (clique na linha): resumo, testes da área e trilha. "Editar" abre o formulário na mesma aba.
function cqAnalitoVer(id, aba) {
  const a = cqState.config.analitos[id];
  if (!a) return;
  const u = _cqUnidadeAtivaId();
  const testesA = _cqTestesDaUnidade(u, { incluirInativos: true }).filter(t => t.analitoId === a.id)
    .sort((x, y) => _cqEquipTeste(x).localeCompare(_cqEquipTeste(y)) || (x.metodo || '').localeCompare(y.metodo || ''));
  const ativosT = testesA.filter(t => t.ativo !== false);
  const nPend = ativosT.reduce((n, t) => n + _cqPendenciasTeste(t).length, 0);
  const equips = _cqEquipsDoAnalito(a);
  const tipo = a.tipo || 'quantitativo';
  const quant = tipo === 'quantitativo';
  const hero = `<div class="cq-pv-hero">
    <div class="cq-pv-hero-ico">${a.indicadorEster ? CQ_ICO_AUTOCLAVE : CQ_ICO.beaker}</div>
    <div class="cq-pv-hero-txt"><small>${_cqEsc(CQ_TIPOS_ANALITO[tipo] || tipo)}</small><h3>${_cqEsc(a.nome)}</h3>
      <div class="cq-pv-chips">${_cqPvPill(_cqEsc(_cqSiglasUnidades(_cqUnidadesRec(a)) || 'Todas as áreas'), '', CQ_ICO.unidade)}
        ${a.codigo ? _cqPvPill(_cqEsc(a.codigo), 'ciano', CQ_ICO.cadastro) : ''}
        ${quant && a.unidadeMedida ? _cqPvPill(_cqEsc(a.unidadeMedida), 'contorno') : ''}
        ${a.indicadorEster ? _cqPvPill(_cqEsc(CQ_INDICADOR_ESTER[a.indicadorEster] || 'Indicador de esterilização'), 'ciano', CQ_ICO_AUTOCLAVE) : ''}</div></div>
    ${_cqPvPill(a.ativo === false ? 'Inativo' : 'Ativo', a.ativo === false ? 'cinza grande' : 'verde grande')}
  </div>`;
  const stats = `<div class="cq-pv-stats">
    ${_cqPvStat(CQ_ICO.lista, 'Testes ativos', String(ativosT.length), `de ${testesA.length} nesta área`, ativosT.length ? '' : 'alerta')}
    ${_cqPvStat(CQ_ICO.alerta, 'Pendências', String(nPend), nPend ? 'níveis sem lote, alvo ou esperado' : 'nenhuma', nPend ? 'alerta' : 'ok')}
    ${_cqPvStat(CQ_ICO.beaker, 'Equipamentos / sistemas', String(equips.length), equips.length ? 'vinculados' : 'vincule para criar testes', equips.length ? '' : 'alerta')}
  </div>`;
  const secId = _cqPvSecao(CQ_ICO.cadastro, 'Identificação', _cqPvCampos([
    { l: 'Código', v: _cqEsc(a.codigo || '') },
    { l: 'Tipo', v: _cqEsc(CQ_TIPOS_ANALITO[tipo] || tipo) },
    quant && { l: 'Unidade de medida', v: _cqEsc(a.unidadeMedida || '') },
    quant && { l: 'Casas decimais', v: a.decimais != null ? String(a.decimais) : '' },
    quant && { l: 'Limites de decisão clínica', v: _cqEsc(_cqArr(a.limitesDecisao).join('; ')) },
    { l: 'Equipamentos / sistemas', v: _cqEsc(equips.map(o => o.label).join(', ')), largo: true },
  ]));
  const secEspec = quant ? _cqPvSecao(CQ_ICO.shield, 'Especificação da qualidade', _cqPvCampos([
    { l: 'Erro total permitido (ETa)', v: a.eta?.valor ? `${_cqEsc(String(a.eta.valor))}${a.eta.tipo === 'abs' ? ' ' + _cqEsc(a.unidadeMedida || '') : '%'}` : '' },
    { l: 'Fonte do ETa', v: _cqEsc(a.eta?.fonte || '') },
    { l: 'Referência', v: _cqEsc(a.eta?.referencia || ''), largo: true },
    { l: 'CV meta', v: a.cvMeta?.valor ? `${_cqEsc(String(a.cvMeta.valor))}%` : '' },
    { l: 'Fonte do CV meta', v: _cqEsc(a.cvMeta?.fonte || '') },
  ])) : '';
  const esc = _cqArr(a.escala);
  const secRes = !quant ? _cqPvSecao(CQ_ICO.lista, 'Resultados possíveis', `${esc.length
    ? `<div class="cq-pv-chips">${esc.map(r => _cqPvPill(_cqEsc(r), 'contorno')).join(' ')}</div>` : '<div class="cq-pv-nota">Nenhum resultado definido.</div>'}
    ${tipo === 'semiquantitativo' ? `<div class="cq-pv-nota">Tolerância: ${_cqEsc(String(a.toleranciaPassos ?? 1))} categoria(s).</div>` : ''}`) : '';
  const ib = a.incubacao;
  const secAc = a.indicadorEster ? _cqPvSecao(CQ_ICO_AUTOCLAVE, 'Analito de autoclave', _cqPvCampos([
    { l: 'Indicador', v: _cqEsc(CQ_INDICADOR_ESTER[a.indicadorEster] || a.indicadorEster) },
    { l: 'Libera o ciclo da autoclave', v: a.liberaCiclo ? 'Sim — o ciclo fica em análise até ser aprovado' : 'Não — se reprovado, reprova o ciclo' },
    a.indicadorEster === 'biologico' && { l: 'Incubação (bula)', v: ib ? `até ${_cqEsc(String(ib.horas))} h após o ciclo${ib.tmin != null ? ` · ${_cqEsc(String(ib.tmin))} a ${_cqEsc(String(ib.tmax))} °C` : ''}` : '' },
  ])) : '';
  const geral = `<div class="cq-vw">${hero}${stats}${secId}${secEspec}${secRes}${secAc}</div>`;
  cqDrawerOpen({
    titulo: a.nome, subtitulo: [CQ_TIPOS_ANALITO[tipo], a.ativo === false ? 'inativo' : ''].filter(Boolean).join(' · ') || 'Analito', icone: 'beaker',
    corpo: `${_cqInativoNota(a, 'ativo', 'não aparece nos cadastros de testes nem nos lançamentos')}${_cqAbasHTML('anver', [
      { k: 'geral', rotulo: 'Geral', html: geral },
      { k: 'testes', rotulo: `Testes${testesA.length ? ` <span class="cq-step-qtd">${testesA.length}</span>` : ''}`, html: _cqTestesCompactoHTML(a, testesA) },
      _cqAbaTrilha(a)], aba)}`,
    rodape: `<div></div><div style="display:flex;gap:8px;"><button class="btn btn-outline" onclick="cqDrawerClose()">Fechar</button>
      ${_cqPodeEditarCad() ? `<button class="btn btn-primary" onclick="cqAnalitoForm('${a.id}',document.querySelector('#cq-abas-anver .ot-modal-tab-btn.active')?.dataset.aba)">${CQ_ICO.edit} Editar</button>` : ''}</div>`,
  });
  delete document.getElementById('cq-drawer-title')?.dataset.teste;
}

// Botão "voltar ao analito" (teste): abre a visualização do analito na aba Testes
function _cqVoltarAnalitoHTML(an) { return _cqVoltarHTML(an.nome, `cqAnalitoVer('${an.id}','testes')`, 'Voltar para o analito'); }
// Botão "voltar" compacto no topo da janela lateral (teste → analito, lote → material/produto)
function _cqVoltarHTML(nome, acao, titulo) {
  return `<button type="button" class="cq-voltar-btn" onclick="${acao}" title="${_cqEsc(titulo)}">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 6 9 12 15 18"/></svg>
    <span>${_cqEsc(nome)}</span></button>`;
}
// Visualização do teste: configuração, níveis (lote e alvo ou esperado) e trilha. "Editar" abre o formulário.
function cqTesteVer(id, aba) {
  const t = cqState.config.testes[id];
  if (!t) return;
  const an = _cqAnalito(t.analitoId);
  const qual = _cqTesteQual(t);
  const niveis = _cqNiveisTeste(t);
  const pend = _cqPendenciasTeste(t);
  const nomeT = _cqNomeTeste(t);
  const setor = _cqSetoresDaUnidade(t.unidadeId).length ? _cqRotuloSetor(_cqSetorDoTeste(t)) : '';
  const hero = `<div class="cq-pv-hero">
    <div class="cq-pv-hero-ico">${an?.indicadorEster ? CQ_ICO_AUTOCLAVE : CQ_ICO.beaker}</div>
    <div class="cq-pv-hero-txt"><small>Teste · ${_cqEsc(CQ_TIPOS_ANALITO[an?.tipo || 'quantitativo'] || '')}</small><h3>${_cqEsc(nomeT)}</h3>
      <div class="cq-pv-chips">${_cqPvPill(_cqEsc(_cqEquipTeste(t)), '', CQ_ICO.beaker)}
        ${_cqPvPill(_cqEsc(_cqSiglasUnidades([t.unidadeId]) || ''), '', CQ_ICO.unidade)}
        ${setor ? _cqPvPill(_cqEsc(setor), 'contorno') : ''}
        ${an ? `<button type="button" class="cq-pv-pill link" onclick="cqAnalitoVer('${an.id}')" title="Ver o analito">${_cqEsc(an.nome)}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="9 6 15 12 9 18"/></svg></button>` : ''}</div></div>
    ${_cqPvPill(t.ativo === false ? 'Inativo' : 'Ativo', t.ativo === false ? 'cinza grande' : 'verde grande')}
  </div>`;
  const stats = `<div class="cq-pv-stats">
    ${_cqPvStat(CQ_ICO.lista, 'Níveis', String(niveis.length), qual ? 'controles' : niveis.map(n => 'N' + n).join(', '))}
    ${_cqPvStat(CQ_ICO.calendario, 'Frequência', _cqEsc(CQ_FREQ[t.frequencia?.tipo] || '—'), t.frequencia?.tipo === 'vezes_dia' ? `${_cqEsc(String(t.frequencia.vezesDia || 1))}× ao dia` : '')}
    ${_cqPvStat(CQ_ICO.alerta, 'Pendências', String(pend.length), pend.length ? _cqEsc(pend.join('; ')) : 'nenhuma', pend.length ? 'alerta' : 'ok')}
  </div>`;
  const mat = cqState.config.materiais[t.materialId];
  const secCfg = _cqPvSecao(CQ_ICO.cadastro, 'Configuração', _cqPvCampos([
    { l: 'Analito', v: _cqEsc(an?.nome || '') },
    { l: 'Equipamento / sistema', v: _cqEsc(_cqEquipTeste(t)) },
    { l: qual ? 'Meio / insumo' : 'Método', v: _cqEsc(t.metodo || '') },
    !qual && { l: 'Material de controle', v: _cqEsc(mat?.nome || '') },
    { l: 'Critério', v: qual ? (an?.tipo === 'semiquantitativo' ? 'Concordância (±1 categoria = alerta)' : 'Concordância com o esperado')
      : `${_cqEsc(CQEngine.PRESETS[t.regrasPreset]?.label || 'Personalizado')} <small>${_cqResumoRegras(t.regras)}</small>`, largo: true },
    t.insumoTipo && { l: 'Insumo controlado', v: _cqEsc([CQ_TIPOS_INSUMO[t.insumoTipo] || t.insumoTipo, t.insumoProduto].filter(Boolean).join(' · ')) },
    t.insumoTipo && { l: 'Exigir lote do insumo', v: t.exigirInsumo ? 'Sim' : 'Não' },
    { l: 'Início de uso', v: t.inicioUso ? _cqFmtData(t.inicioUso) : '' },
  ]));
  const linhas = niveis.map(n => {
    const rot = qual ? _cqRotuloNivel(t, n) : `Nível ${n}`;
    if (qual) {
      const c = _cqControleQual(t, n);
      const m = cqState.config.materiais[c?.materialId];
      const l = _cqLoteDoNivel(t, n);
      return { l: _cqEsc(rot), v: `${c?.esperado ? `Esperado: <b>${_cqEsc(c.esperado)}</b>` : '<span class="cq-txt-vermelho">sem esperado</span>'}
        <small>${_cqEsc([m?.nome, l ? `lote ${l.lote}` : (_cqNivelSemMaterial(t, n) ? '' : 'sem lote')].filter(Boolean).join(' · '))}</small>`, largo: true };
    }
    const l = _cqLoteDoNivel(t, n);
    const al = l ? _cqAlvoVigente(t.id, l.id, n) : null;
    const dec = an?.decimais ?? 1;
    return { l: _cqEsc(rot), v: `${l ? `Lote ${_cqEsc(l.lote)}` : '<span class="cq-txt-vermelho">sem lote</span>'}
      <small>${al ? `média ${_cqNum(Number(al.media), dec)} · DP ${_cqNum(Number(al.dp), dec)}${CQ_ORIGEM_ALVO[al.origem] ? ` · ${_cqEsc(CQ_ORIGEM_ALVO[al.origem].label)}` : ''}` : l ? 'sem alvo' : ''}</small>`, largo: true };
  });
  const secNiv = _cqPvSecao(CQ_ICO.lista, qual ? 'Controles' : 'Níveis, lotes e alvos', linhas.length ? _cqPvCampos(linhas) : '<div class="cq-pv-nota">Nenhum nível definido.</div>');
  const geral = `<div class="cq-vw">${hero}${stats}${secCfg}${secNiv}</div>`;
  cqDrawerOpen({
    titulo: `${nomeT} · ${_cqEquipTeste(t)}`, subtitulo: 'Estratégia de controle do teste (RDC 978, arts. 176 e 180)', icone: 'beaker',
    corpo: `${an ? _cqVoltarAnalitoHTML(an) : ''}${_cqAbasHTML('tever', [
      { k: 'config', rotulo: 'Geral', html: geral },
      _cqAbaTrilha(t)], aba)}`,
    rodape: `<div></div><div style="display:flex;gap:8px;"><button class="btn btn-outline" onclick="cqDrawerClose()">Fechar</button>
      ${_cqPodeEditarCad() ? `<button class="btn btn-primary" onclick="cqTesteForm('${t.id}',document.querySelector('#cq-abas-tever .ot-modal-tab-btn.active')?.dataset.aba)">${CQ_ICO.edit} Editar</button>` : ''}</div>`,
  });
  delete document.getElementById('cq-drawer-title')?.dataset.teste;
}
function cqAnalitoAba(aba) {
  document.querySelectorAll('#cq-an-abas .ot-modal-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.aba === aba));
  [['testes', 'cq-an-pane-testes'], ['id', 'cq-an-pane-id'], ['trilha', 'cq-an-pane-trilha']].forEach(([k, id]) => {
    const el = document.getElementById(id);
    if (el) el.style.display = k === aba ? '' : 'none';
  });
}
// Analito novo salvo: oferece criar o primeiro teste já vinculado
function _cqOferecerPrimeiroTeste(rec) {
  if (!_cqEquipsDoAnalito(rec).length || !_cqNaUnidade(rec)) return;
  _cqPrompt({
    titulo: 'Analito cadastrado', subtitulo: rec.nome,
    corpo: `<div class="cq-nota">Criar agora o primeiro teste de <b>${_cqEsc(rec.nome)}</b> nesta área? Se ainda faltar o material/lote de controle ou o insumo, cadastre-os nas abas 2 e 3 e crie o teste depois pelo próprio analito.</div>`,
    confirmar: 'Criar teste',
    onConfirm: () => { setTimeout(() => cqTesteForm(null, null, { analitoId: rec.id }), 60); return true; },
  });
}

function _cqSetChk(id, v) { const el = document.getElementById(id); if (el) el.checked = !!v; }

function cqAnalitoTipoChange() {
  const tipo = _cqVal('cq-an-tipo') || 'quantitativo';
  const quant = tipo === 'quantitativo';
  [['cq-an-quant', quant], ['cq-an-espec', quant], ['cq-an-qual', !quant], ['cq-an-tol-wrap', tipo === 'semiquantitativo']].forEach(([id, vis]) => {
    const el = document.getElementById(id);
    if (el) el.style.display = vis ? '' : 'none';
  });
}

async function cqAnalitoSalvar() {
  if (_cqSalvando || !_cqPodeEditarCad(!!_cqAnalitoFormId)) return;
  const antes0 = _cqAnalitoFormId ? cqState.config.analitos[_cqAnalitoFormId] : null;
  const tipo = _cqVal('cq-an-tipo') || antes0?.tipo || 'quantitativo';
  if (tipo !== 'quantitativo') return _cqAnalitoQualSalvar(tipo);
  const nome = _cqVal('cq-an-nome'), um = _cqVal('cq-an-unidade');
  if (!nome) { showToast('Informe o nome do analito.', 'error'); return; }
  if (!um) { showToast('Informe a unidade de medida.', 'error'); return; }
  const etaTxt = _cqVal('cq-an-eta'), eta = etaTxt ? CQEngine.parseNumero(etaTxt) : null;
  if (etaTxt && (eta === null || eta <= 0)) { showToast('ETa inválido.', 'error'); return; }
  if (eta !== null && !_cqVal('cq-an-eta-fonte')) { showToast('Informe a fonte do ETa (modelo científico).', 'error'); return; }
  const cvTxt = _cqVal('cq-an-cvmeta'), cv = cvTxt ? CQEngine.parseNumero(cvTxt) : null;
  if (cvTxt && (cv === null || cv <= 0)) { showToast('CV meta inválido.', 'error'); return; }
  const limites = _cqVal('cq-an-limites').split(';').map(s => CQEngine.parseNumero(s.trim())).filter(v => v !== null);
  const antes = _cqAnalitoFormId ? cqState.config.analitos[_cqAnalitoFormId] : null;
  const dupQ = Object.values(cqState.config.analitos).find(x => x.nome.toLowerCase() === nome.toLowerCase() && x.unidadeMedida === um && x.id !== _cqAnalitoFormId);
  if (dupQ) { if (!_cqOferecerAssociar('analitos', dupQ, `Analito ${dupQ.nome} (${dupQ.unidadeMedida})`)) showToast('Já existe analito com este nome e unidade.', 'error'); return; }
  const eq = _cqAnalitoEquipCapturar(_cqAnalitoFormId);
  if (!eq) return;
  const unidadeIds = _cqUnidadesCapturar('cq-an-un', 'analitos', antes);
  if (!unidadeIds) return;
  const rec = {
    ...(antes || {}), id: _cqAnalitoFormId || _cqUid(), codigo: _cqVal('cq-an-codigo'), nome, unidadeMedida: um,
    decimais: Math.min(4, Math.max(0, Number(_cqVal('cq-an-dec')) || 0)), tipo: 'quantitativo',
    limitesDecisao: limites, escala: null, toleranciaPassos: null,
    eta: eta !== null ? { valor: eta, tipo: _cqVal('cq-an-eta-tipo') || '%', fonte: _cqVal('cq-an-eta-fonte'), referencia: _cqVal('cq-an-eta-ref') } : null,
    cvMeta: cv !== null ? { valor: cv, fonte: _cqVal('cq-an-cvmeta-fonte') } : null,
    ...eq, unidadeIds, ativo: _cqChk('cq-an-ativo'),
  };
  if (!antes) { rec.criadoEm = _cqAgora(); rec.criadoPor = _cqAssinatura(); }
  const fmt = { eta: v => v ? `${v.valor}${v.tipo === 'abs' ? ' ' + um : '%'} (${v.fonte})` : '—', cvMeta: v => v ? `${v.valor}% (${v.fonte || ''})` : '—', ativoIds: _cqFmtAtivos, sistemas: _cqFmtSistemas, unidadeIds: _cqSiglasUnidades, ativo: v => v ? 'Sim' : 'Não' };
  const diffs = antes ? _cqDiff(antes, rec, CQ_LBL_ANALITO, fmt) : [];
  if (antes && !diffs.length) { cqDrawerClose(); return; }
  _cqTrilhaAdd(rec, antes ? 'edicao' : 'criacao', antes ? 'Analito alterado' : 'Analito cadastrado', diffs);
  _cqSalvando = true;
  try {
    if (await _cqSalvarRegistro('analitos', rec)) { showToast('Analito salvo.', 'success'); cqDrawerClose(); cqRender(); if (!antes) _cqOferecerPrimeiroTeste(rec); }
  } finally { _cqSalvando = false; }
}

// Analito qualitativo/semiquantitativo: lista de resultados possíveis no lugar de unidade e ETa
async function _cqAnalitoQualSalvar(tipo) {
  const nome = _cqVal('cq-an-nome');
  if (!nome) { showToast('Informe o nome do analito.', 'error'); return; }
  if (_cqChk('cq-an-autoclave-chk') && !CQ_INDICADOR_ESTER[_cqVal('cq-an-indic')]) { showToast('Analito de autoclave: escolha o tipo de indicador.', 'error'); return; }
  // Indicador biológico: incubação da bula (prazo obrigatório; faixa opcional, as duas pontas)
  let incubacao = null;
  if (_cqChk('cq-an-autoclave-chk') && _cqVal('cq-an-indic') === 'biologico') {
    const num = id => { const t = _cqVal(id); return t ? CQEngine.parseNumero(t) : null; };
    const h = num('cq-an-ib-h'), tmin = num('cq-an-ib-tmin'), tmax = num('cq-an-ib-tmax');
    if (h === null || h <= 0 || h > 72) { showToast('Incubação: prazo entre 0 e 72 h após o ciclo.', 'error'); return; }
    if (!!_cqVal('cq-an-ib-tmin') !== !!_cqVal('cq-an-ib-tmax') || (_cqVal('cq-an-ib-tmin') && (tmin === null || tmax === null))) { showToast('Incubação: informe as duas temperaturas da faixa (ou deixe as duas vazias).', 'error'); return; }
    if (tmin !== null && tmax < tmin) { showToast('Incubação: temperatura máxima menor que a mínima.', 'error'); return; }
    incubacao = { horas: h, tmin, tmax };
  }
  const escala = CQEngine.parseEscala(_cqItensVal('cq-an-escala').join('\n'));
  if (escala.length < 2) { showToast('Adicione ao menos dois resultados possíveis.', 'error'); return; }
  const antes = _cqAnalitoFormId ? cqState.config.analitos[_cqAnalitoFormId] : null;
  const dupQl = Object.values(cqState.config.analitos).find(x => x.nome.toLowerCase() === nome.toLowerCase() && (x.tipo || 'quantitativo') !== 'quantitativo' && x.id !== _cqAnalitoFormId);
  if (dupQl) { if (!_cqOferecerAssociar('analitos', dupQl, `Analito ${dupQl.nome}`)) showToast('Já existe analito qualitativo com este nome.', 'error'); return; }
  // Resultados usados como esperado em testes não podem sair da lista
  const usados = new Set();
  Object.values(cqState.config.testes).filter(t => t.analitoId === _cqAnalitoFormId)
    .forEach(t => _cqNiveisTeste(t).forEach(n => { const e = _cqControleQual(t, n)?.esperado; if (e) usados.add(e); }));
  const faltando = [...usados].filter(e => !escala.includes(e));
  if (faltando.length) { showToast(`Resultado em uso como esperado em testes: ${faltando.join(', ')}.`, 'error'); return; }
  const eq = _cqAnalitoEquipCapturar(_cqAnalitoFormId);
  if (!eq) return;
  const unidadeIds = _cqUnidadesCapturar('cq-an-un', 'analitos', antes);
  if (!unidadeIds) return;
  const rec = {
    ...(antes || {}), id: _cqAnalitoFormId || _cqUid(), codigo: _cqVal('cq-an-codigo'), nome, unidadeMedida: '', decimais: 0, tipo,
    limitesDecisao: [], eta: null, cvMeta: null, escala,
    toleranciaPassos: tipo === 'semiquantitativo' ? Math.min(2, Math.max(0, Number(_cqVal('cq-an-tol')) || 0)) : null,
    indicadorEster: _cqChk('cq-an-autoclave-chk') ? _cqVal('cq-an-indic') : null, incubacao,
    liberaCiclo: _cqChk('cq-an-autoclave-chk') ? _cqChk('cq-an-libera') : null,
    ...eq, unidadeIds, ativo: _cqChk('cq-an-ativo-q'),
  };
  if (!antes) { rec.criadoEm = _cqAgora(); rec.criadoPor = _cqAssinatura(); }
  const fmt = { escala: v => _cqArr(v).join(' | '), tipo: v => CQ_TIPOS_ANALITO[v] || v, indicadorEster: v => CQ_INDICADOR_ESTER[v] || 'Não',
    liberaCiclo: v => v ? 'Sim' : 'Não',
    incubacao: v => v ? `até ${String(v.horas).replace('.', ',')} h após o ciclo${v.tmin != null ? `, ${String(v.tmin).replace('.', ',')} a ${String(v.tmax).replace('.', ',')} °C` : ''}` : '—', ativoIds: _cqFmtAtivos, sistemas: _cqFmtSistemas, unidadeIds: _cqSiglasUnidades, ativo: v => v ? 'Sim' : 'Não' };
  const diffs = antes ? _cqDiff(antes, rec, CQ_LBL_ANALITO, fmt) : [];
  if (antes && !diffs.length) { cqDrawerClose(); return; }
  _cqTrilhaAdd(rec, antes ? 'edicao' : 'criacao', antes ? 'Analito alterado' : 'Analito cadastrado', diffs);
  _cqSalvando = true;
  try {
    if (await _cqSalvarRegistro('analitos', rec)) { showToast('Analito salvo.', 'success'); cqDrawerClose(); cqRender(); if (!antes) _cqOferecerPrimeiroTeste(rec); }
  } finally { _cqSalvando = false; }
}

// Cadastros antigos sem unidade: associa às unidades dos testes que os usam (insumos: dos últimos
// lançamentos); os sem uso vão para a unidade ativa. Lote sem uso segue o material.
function cqAssociarSemUnidade() {
  if (!_cqCan('configurar')) return;
  const cfg = cqState.config;
  const uAt = _cqUnidadeAtivaId();
  const unAt = cfg.unidades[uAt];
  const prop = {};   // col → { id → { rec, us:Set, porUso } }
  CQ_COLECOES_UNIDADE.forEach(col => {
    prop[col] = {};
    Object.values(cfg[col] || {}).filter(_cqSemUnidade).forEach(rec => {
      const us = _cqUnidadesEmUso(col, rec.id);
      prop[col][rec.id] = { rec, us, porUso: us.size > 0 };
    });
  });
  const unidadesDe = (col, id) => prop[col][id] ? prop[col][id].us : new Set(_cqUnidadesRec(cfg[col][id]));
  // Material usado por lote em uso precisa estar nas unidades desse lote
  Object.values(prop.lotesControle).forEach(p => {
    const pm = prop.materiais[p.rec.materialId];
    if (pm && p.us.size) { p.us.forEach(u => pm.us.add(u)); pm.porUso = true; }
  });
  // Produto de insumo: idem com os lotes dele
  Object.values(prop.insumos).forEach(p => {
    const pp = prop.insumoProdutos[_cqLoteCru(p.rec).produtoId];
    if (pp && p.us.size) { p.us.forEach(u => pp.us.add(u)); pp.porUso = true; }
  });
  Object.values(prop.materiais).forEach(p => { if (!p.us.size) p.us.add(uAt); });
  Object.values(prop.insumoProdutos).forEach(p => { if (!p.us.size) p.us.add(uAt); });
  Object.values(prop.lotesControle).forEach(p => { if (!p.us.size) unidadesDe('materiais', p.rec.materialId).forEach(u => p.us.add(u)); });
  Object.values(prop.insumos).forEach(p => { const pid = _cqLoteCru(p.rec).produtoId; if (!p.us.size && pid) unidadesDe('insumoProdutos', pid).forEach(u => p.us.add(u)); });
  ['analitos', 'lotesControle', 'insumos'].forEach(col => Object.values(prop[col]).forEach(p => { if (!p.us.size) p.us.add(uAt); }));
  const total = CQ_COLECOES_UNIDADE.reduce((n, c) => n + Object.keys(prop[c]).length, 0);
  if (!total) { showToast('Todos os cadastros já estão associados a áreas.', 'success'); return; }
  const nomes = { analitos: 'Analitos', materiais: 'Materiais de controle', lotesControle: 'Lotes de controle', insumoProdutos: 'Produtos (reagentes e insumos)', insumos: 'Lotes de reagentes e insumos' };
  const secoes = CQ_COLECOES_UNIDADE.filter(c => Object.keys(prop[c]).length).map(c => {
    const ps = Object.values(prop[c]).sort((a, b) => _cqResumoCadastro(c, a.rec).localeCompare(_cqResumoCadastro(c, b.rec)));
    const nUso = ps.filter(p => p.porUso).length;
    return `<details class="cq-assoc-sec"><summary><b>${nomes[c]}</b> · ${ps.length}${nUso ? ` <span class="cq-muted">(${nUso} pelo uso em testes)</span>` : ''}</summary>
      ${ps.map(p => `<div class="cq-assoc-item"><span>${_cqEsc(_cqResumoCadastro(c, p.rec))}</span><b>${_cqEsc(_cqSiglasUnidades([...p.us]))}</b></div>`).join('')}</details>`;
  }).join('');
  _cqPrompt({
    titulo: 'Associar cadastros às áreas', subtitulo: `${total} cadastro(s) sem área`,
    corpo: `<div class="cq-nota">Cadastros usados em testes serão associados às áreas desses testes (reagentes: às dos últimos lançamentos). Os sem uso irão para a área ativa, <b>${_cqEsc(unAt?.sigla || '')}</b>. Depois é possível ajustar cada cadastro. A alteração fica registrada na rastreabilidade.</div>${secoes}`,
    confirmar: 'Associar',
    onConfirm: async () => {
      const updates = {};
      const agora = _cqAgora();
      CQ_COLECOES_UNIDADE.forEach(c => Object.values(prop[c]).forEach(p => {
        const base = `${CQ_KEYS.config}/${c}/${p.rec.id}`;
        updates[`${base}/unidadeIds`] = [...p.us];
        updates[`${base}/atualizadoEm`] = agora;
        updates[`${base}/trilha/${_cqTk()}${p.rec.id.slice(-3)}`] = _cqTrilhaEntry('edicao', `Associado à(s) área(s) ${_cqSiglasUnidades([...p.us])} ${p.porUso ? '(uso em testes)' : '(cadastro sem uso)'}`);
      }));
      if (!(await window.dbUpdate(updates))) { showToast('Falha ao gravar. Nada foi alterado.', 'error'); return false; }
      CQ_COLECOES_UNIDADE.forEach(c => Object.values(prop[c]).forEach(p => { cfg[c][p.rec.id] = { ..._cqLoteCru(p.rec), unidadeIds: [...p.us] }; }));
      _cqHidratarInsumos();
      showToast(`${total} cadastro(s) associado(s).`, 'success');
      cqRender();
      return true;
    },
  });
}

// Cria os analitos qualitativos de um conjunto de modelos (microbiologia ou esterilização) que ainda não existem
function cqModelosMicro(tipo) {
  if (!_cqCan('configurar')) return;
  const mod = CQ_MODELOS[tipo] || CQ_MODELOS.micro;
  const u = _cqUnidadeAtivaId();
  const un = cqState.config.unidades[u];
  const porNome = new Map(Object.values(cqState.config.analitos).map(a => [(a.nome || '').toLowerCase(), a]));
  const novos = mod.lista.filter(m => !porNome.has(m.nome.toLowerCase()));
  // Já cadastrados só em outras unidades: associa à unidade ativa em vez de duplicar
  const associar = mod.lista.map(m => porNome.get(m.nome.toLowerCase())).filter(a => a && !_cqNaUnidade(a, u));
  if (!novos.length && !associar.length) { showToast(`Os analitos de ${mod.nomeCurto} já estão cadastrados nesta área.`, 'success'); return; }
  _cqPrompt({
    titulo: mod.titulo, subtitulo: `${mod.sub} · ${un?.sigla || ''}`,
    corpo: `<div class="cq-nota">${novos.length ? `Serão criados ${novos.length} analito(s) qualitativo(s) na área ${_cqEsc(un?.sigla || '')}. ` : ''}${associar.length ? `${associar.length} já cadastrado(s) em outra área será(ão) associado(s) a ${_cqEsc(un?.sigla || '')}. ` : ''}Revise os resultados possíveis com o RT antes de cadastrar os testes.</div>
      ${novos.map(m => `<div class="cq-modelo-item"><b>${_cqEsc(m.nome)}</b><div class="cq-muted">${_cqEsc(m.escala.join(' · '))}</div></div>`).join('')}
      ${associar.map(a => `<div class="cq-modelo-item"><b>${_cqEsc(a.nome)}</b><div class="cq-muted">Existente (${_cqEsc(_cqSiglasUnidades(_cqUnidadesRec(a)))}) — será associado</div></div>`).join('')}
      ${tipo === 'ester' ? `<div class="cq-nota">Depois: vincule cada analito à autoclave, cadastre os indicadores como material de controle (com lote e validade) e crie os testes —
        integrador: nível 1 “Pacote teste”, esperado “Viragem completa”, a cada corrida; indicador biológico: nível 1 “Ampola teste (no pacote)” esperado “Negativo”
        e nível 2 “Ampola controle (fora da autoclave)” esperado “Positivo”, mesmo lote nos dois níveis, semanal. Ative a ficha do ciclo da autoclave em Configurações › Área.</div>` : ''}`,
    confirmar: novos.length ? 'Criar analitos' : 'Associar analitos',
    onConfirm: async () => {
      const updates = {};
      const criados = [];
      novos.forEach(m => {
        const rec = { id: _cqUid() + m.codigo.slice(-2).toLowerCase(), codigo: m.codigo, nome: m.nome, unidadeMedida: '', decimais: 0, tipo: 'qualitativo',
                      ...(m.indicador ? { indicadorEster: m.indicador, liberaCiclo: true } : {}),
                      limitesDecisao: [], escala: [...m.escala], ativo: true, unidadeIds: [u],
                      criadoEm: _cqAgora(), criadoPor: _cqAssinatura(), atualizadoEm: _cqAgora() };
        _cqTrilhaAdd(rec, 'criacao', `Analito cadastrado a partir do modelo de ${mod.nomeCurto}`);
        updates[`${CQ_KEYS.config}/analitos/${rec.id}`] = rec;
        criados.push(rec);
      });
      associar.forEach(a => {
        const p = `${CQ_KEYS.config}/analitos/${a.id}`;
        updates[`${p}/unidadeIds`] = [..._cqUnidadesRec(a), u];
        updates[`${p}/trilha/${_cqTk()}${a.id.slice(-3)}`] = _cqTrilhaEntry('edicao', `Associado à área ${un?.sigla || u} (modelos de ${mod.nomeCurto})`);
      });
      if (!(await window.dbUpdate(updates))) { showToast('Falha ao gravar. Verifique a conexão e tente novamente.', 'error'); return false; }
      criados.forEach(r => { cqState.config.analitos[r.id] = r; });
      associar.forEach(a => { cqState.config.analitos[a.id] = { ...a, unidadeIds: [..._cqUnidadesRec(a), u] }; });
      showToast([novos.length ? `${novos.length} analito(s) criado(s)` : '', associar.length ? `${associar.length} associado(s) a ${un?.sigla || ''}` : ''].filter(Boolean).join(' e ') + '.', 'success');
      cqRender();
      return true;
    },
  });
}

// ── MATERIAIS DE CONTROLE ────────────────────────────────────
let _cqMaterialFormId = null;
const CQ_LBL_MATERIAL = {
  nome: 'Nome', fabricante: 'Fabricante', fornecedor: 'Fornecedor', regAnvisa: 'Registro ANVISA', tipo: 'Tipo', matriz: 'Matriz',
  codigoReferencia: 'Código de referência', niveis: 'Níveis', armazenamento: 'Armazenamento',
  estabilidadeAbertoDias: 'Estabilidade após abertura (dias)', equips: 'Equipamentos / sistemas', analitoIds: 'Analitos', unidadeIds: 'Áreas', ativo: 'Ativo',
  preparoInterno: 'Preparado no laboratório', preparo: 'Dados do preparo',
};

function cqMaterialForm(id, opts = {}) {
  const m = id ? cqState.config.materiais[id] : null;
  const pode = _cqPodeEditarCad(!!m);
  _cqMaterialFormId = id || null;
  const niveis = m?.niveis || { 1: { nome: 'Normal' }, 2: { nome: 'Patológico' } };
  cqDrawerOpen({
    titulo: m ? m.nome : 'Novo material de controle', subtitulo: 'Amostra controle usada no CIQ (RDC 978, art. 181)', icone: 'beaker',
    corpo: _cqAbasHTML('mat', [{ k: 'dados', rotulo: 'Material', html: `
      ${_cqInativoNota(m, 'ativo', 'não é oferecido em testes novos')}
      <div class="form-section"><div class="form-section-title">${CQ_ICO.beaker}Material</div>
        <div class="form-field"><label class="field-label">Nome <span class="required">*</span></label><input type="text" id="cq-mat-nome" class="field-input" maxlength="80" value="${_cqEsc(m?.nome)}" placeholder="Ex.: Lyphochek Assayed Chemistry Control" ${_cqRo(pode)}></div>
        <div class="form-row">
          <div class="form-field"><label class="field-label">Fabricante <span class="required">*</span></label><input type="text" id="cq-mat-fab" class="field-input" value="${_cqEsc(m?.fabricante)}" ${_cqRo(pode)}></div>
          <div class="form-field"><label class="field-label">Fornecedor</label><input type="text" id="cq-mat-forn" class="field-input" value="${_cqEsc(m?.fornecedor)}" ${_cqRo(pode)}></div>
        </div>
        <div class="form-row">
          <div class="form-field"><label class="field-label">Tipo</label><select id="cq-mat-tipo" class="field-select" ${_cqRo(pode)}>${_cqMapOptions(CQ_TIPOS_MATERIAL, m?.tipo || 'comercial', null)}</select></div>
          <div class="form-field"><label class="field-label">Registro ANVISA</label><input type="text" id="cq-mat-anvisa" class="field-input" value="${_cqEsc(m?.regAnvisa)}" ${_cqRo(pode)}></div>
        </div>
        ${_cqUnidadesCampoHTML('cq-mat-un', m, pode, 'O material e seus lotes só aparecem nas áreas selecionadas.', 'materiais')}
        <div class="form-field"><label class="field-label">Equipamentos / sistemas</label>
          ${_cqMultiHTML('cq-mat-equip', _cqOpcoesEquipInsumo(m?.equips), m?.equips, { placeholder: 'Qualquer equipamento ou bancada', disabled: !pode, onchange: cqMaterialEquipChange, vazio: 'Nenhum equipamento ou sistema cadastrado.' })}</div>
        <div class="form-field"><label class="field-label">Analitos controlados <span class="cq-muted" id="cq-mat-an-escopo">${_cqArr(m?.equips).length ? '(vazio = todos dos equipamentos)' : '(vazio = todos)'}</span></label>
          ${_cqMultiHTML('cq-mat-an', _cqOpcoesAnalitosEquip(m?.equips, m?.analitoIds), m?.analitoIds, { placeholder: 'Todos os analitos', disabled: !pode, vazio: 'Nenhum analito vinculado a estes equipamentos/sistemas.' })}
          <div class="cq-nota">No cadastro do teste, só aparecem os materiais (e seus lotes) do equipamento/sistema e do analito escolhidos. Vazio: serve a qualquer um (ex.: controle multianalito de terceira parte).</div></div>
        <div class="form-field"><label class="field-label">Código de referência da cepa / lâmina</label><input type="text" id="cq-mat-ref" class="field-input" maxlength="60" value="${_cqEsc(m?.codigoReferencia)}" placeholder="Ex.: ATCC 25922 (cepas: espécie no nome, ex.: Escherichia coli)" ${_cqRo(pode)}>
          <div class="cq-nota">Cepas de referência: use cepas rastreáveis (ATCC, NCTC ou equivalente). Estoque, recebimento e abertura de frascos são controlados no sistema de estoque.</div></div>
        <div class="form-row">
          <div class="form-field"><label class="field-label">Matriz</label><input type="text" id="cq-mat-matriz" class="field-input" value="${_cqEsc(m?.matriz)}" placeholder="Soro humano, sangue total…" ${_cqRo(pode)}></div>
          <div class="form-field"><label class="field-label">Estabilidade após abertura (dias)</label><input type="number" min="0" id="cq-mat-estab" class="field-input" value="${_cqEsc(m?.estabilidadeAbertoDias ?? '')}" ${_cqRo(pode)}></div>
        </div>
        <div class="form-field"><label class="field-label">Armazenamento</label><input type="text" id="cq-mat-arm" class="field-input" value="${_cqEsc(m?.armazenamento)}" placeholder="Ex.: 2 a 8 °C; após reconstituição −20 °C" ${_cqRo(pode)}></div>
        <div class="form-field"><label class="field-label">Níveis</label>
          ${[1, 2, 3].map(n => `<div class="cq-nivel-row"><label class="oc-check"><input type="checkbox" class="cq-mat-nivel" value="${n}" ${niveis[n] ? 'checked' : ''} ${_cqRo(pode)}> Nível ${n}</label>
            <input type="text" class="field-input cq-mat-nivel-nome" data-n="${n}" value="${_cqEsc(niveis[n]?.nome || '')}" placeholder="Nome (opcional)" ${_cqRo(pode)}></div>`).join('')}
        </div>
        ${_cqCtlPrepCamposHTML(m, pode)}
        ${m?.tipo === 'pool_interno' || !m ? `<div class="cq-nota">Pool interno: forma alternativa de avaliação da precisão quando não há controle comercial (RDC 978, art. 182; PALC 11.9). Documente preparo, homogeneidade e estabilidade.</div>` : ''}
        <input type="checkbox" id="cq-mat-ativo" hidden ${m?.ativo === false ? '' : 'checked'}>
      </div>
` }, m && (() => {
      const ls = Object.values(cqState.config.lotesControle).filter(l => l.materialId === m.id).sort((a, b) => (b.validade || '').localeCompare(a.validade || ''));
      return { k: 'lotes', rotulo: `Lotes${ls.length ? ` <span class="cq-step-qtd">${ls.length}</span>` : ''}`,
        html: _cqLotesCompactoHTML(ls, 'cqLoteVer', _cqPodeCriarLote() ? `<button class="btn btn-outline btn-sm cq-an-novo-teste" onclick="cqLoteForm(null,{materialId:'${m.id}'})">${CQ_ICO.plus} Novo lote</button>` : '') };
    })(), _cqAbaTrilha(m)], opts.aba),
    rodape: _cqRodapeForm('cqMaterialSalvar()', pode, m ? `cqExcluirCadastro('materiais','${m.id}')` : '',
      m && { ids: 'cq-mat-ativo', fn: 'cqMaterialSalvar', colecao: 'materiais', id: m.id, ativo: m.ativo !== false }),
  });
}

function cqMaterialEquipChange(equips) {
  _cqMultiOpcoes('cq-mat-an', _cqOpcoesAnalitosEquip(equips, []));
  const esc = document.getElementById('cq-mat-an-escopo');
  if (esc) esc.textContent = _cqArr(equips).length ? '(vazio = todos dos equipamentos)' : '(vazio = todos)';
}

async function cqMaterialSalvar() {
  if (_cqSalvando || !_cqPodeEditarCad(!!_cqMaterialFormId)) return;
  const nome = _cqVal('cq-mat-nome'), fab = _cqVal('cq-mat-fab');
  if (!nome || !fab) { showToast('Informe nome e fabricante.', 'error'); return; }
  const niveis = {};
  document.querySelectorAll('#cq-drawer .cq-mat-nivel:checked').forEach(c => {
    const n = c.value;
    niveis[n] = { nome: document.querySelector(`#cq-drawer .cq-mat-nivel-nome[data-n="${n}"]`)?.value.trim() || '' };
  });
  if (!Object.keys(niveis).length) { showToast('Selecione ao menos um nível.', 'error'); return; }
  const antes = _cqMaterialFormId ? cqState.config.materiais[_cqMaterialFormId] : null;
  const est = _cqVal('cq-mat-estab');
  const equips = _cqMultiVal('cq-mat-equip');
  const analitoIds = _cqMultiVal('cq-mat-an');
  // Não remove equipamento/sistema nem analito de testes que usam este material
  if (antes && (equips.length || analitoIds.length)) {
    const fora = new Set();
    Object.values(cqState.config.testes).filter(t => t.materialId === antes.id || Object.values(t.controlesQual || {}).some(c => c?.materialId === antes.id))
      .forEach(t => { if (!_cqMaterialServe({ equips, analitoIds }, _cqEquipDoTeste(t), t.analitoId)) fora.add(`${_cqNomeTeste(t)} · ${_cqEquipTeste(t)}`); });
    if (fora.size) { showToast(`Material em uso pelos testes: ${[...fora].join('; ')}. Mantenha esses equipamentos/sistemas e analitos.`, 'error'); return; }
  }
  if (!antes) {
    const dupM = Object.values(cqState.config.materiais).find(x => x.nome.toLowerCase() === nome.toLowerCase() && (x.fabricante || '').toLowerCase() === fab.toLowerCase());
    if (dupM && _cqOferecerAssociar('materiais', dupM, `Material ${dupM.nome} — ${dupM.fabricante}`)) return;
  }
  const unidadeIds = _cqUnidadesCapturar('cq-mat-un', 'materiais', antes);
  if (!unidadeIds) return;
  // Lotes do material não podem ficar em unidades que o material deixou
  const lotesFora = antes ? Object.values(cqState.config.lotesControle).filter(l => l.materialId === antes.id && _cqUnidadesRec(l).some(x => !unidadeIds.includes(x))) : [];
  if (lotesFora.length) { showToast(`Lote(s) ${lotesFora.map(l => l.lote).join(', ')} deste material estão em áreas que você removeu. Ajuste os lotes antes.`, 'error'); return; }
  const rec = {
    ...(antes || {}), id: _cqMaterialFormId || _cqUid(), nome, fabricante: fab, fornecedor: _cqVal('cq-mat-forn'),
    tipo: _cqVal('cq-mat-tipo') || 'comercial', regAnvisa: _cqVal('cq-mat-anvisa'), matriz: _cqVal('cq-mat-matriz'), codigoReferencia: _cqVal('cq-mat-ref'),
    estabilidadeAbertoDias: est === '' ? null : Math.max(0, Number(est) || 0), armazenamento: _cqVal('cq-mat-arm'), niveis, equips, analitoIds, unidadeIds,
    ativo: _cqChk('cq-mat-ativo'),
  };
  const prep = _cqCtlPrepCamposLer();
  if (!prep) return;
  rec.preparoInterno = prep.preparoInterno;
  if (prep.preparo) rec.preparo = prep.preparo; else delete rec.preparo;
  if (!antes) { rec.criadoEm = _cqAgora(); rec.criadoPor = _cqAssinatura(); }
  const fmt = { niveis: v => Object.entries(v || {}).map(([n, x]) => `N${n}${x?.nome ? ' ' + x.nome : ''}`).join(', '), tipo: v => CQ_TIPOS_MATERIAL[v] || v,
                equips: v => _cqArr(v).map(_cqRotuloEquip).join(', ') || 'Qualquer', analitoIds: v => _cqArr(v).map(a => _cqAnalito(a)?.nome || a).join(', ') || 'Todos',
                unidadeIds: _cqSiglasUnidades, ativo: v => v ? 'Sim' : 'Não', preparoInterno: v => v ? 'Sim' : 'Não', preparo: _cqCtlFmtPreparo };
  const diffs = antes ? _cqDiff(antes, rec, CQ_LBL_MATERIAL, fmt) : [];
  if (antes && !diffs.length) { cqDrawerClose(); return; }
  _cqTrilhaAdd(rec, antes ? 'edicao' : 'criacao', antes ? 'Material alterado' : 'Material cadastrado', diffs);
  _cqSalvando = true;
  try {
    if (await _cqSalvarRegistro('materiais', rec)) { showToast('Material salvo.', 'success'); cqDrawerClose(); cqRender(); }
  } finally { _cqSalvando = false; }
}

// ── LOTES DE CONTROLE ────────────────────────────────────────
let _cqLoteFormId = null;
const CQ_LBL_LOTE = { materialId: 'Material', lote: 'Lote', niveis: 'Níveis', validade: 'Validade', bulaUrl: 'Bula / valores do fabricante', status: 'Situação', observacoes: 'Observações', unidadeIds: 'Áreas' };

// Testes (nas unidades do lote) cujo nível usa o material do lote: candidatos a ter este lote em uso.
// Quantitativo: material do teste + nível presente no lote. Qualitativo: material do nível.
function _cqLoteUsoCandidatos(l) {
  const niveisLote = _cqArr(l.niveis).map(Number);
  return Object.values(cqState.config.testes)
    .filter(t => _cqNaUnidade(l, t.unidadeId) && (!_cqSetorAtivoId() || t.unidadeId !== _cqUnidadeAtivaId() || _cqTestePassaSetor(t)) && (t.ativo !== false || Object.values(t.lotesAtivos || {}).includes(l.id)))
    .map(t => {
      const qual = _cqTesteQual(t);
      const niveis = _cqNiveisTeste(t).filter(n => qual ? _cqControleQual(t, n)?.materialId === l.materialId : t.materialId === l.materialId && niveisLote.includes(n));
      return { t, niveis };
    })
    .filter(x => x.niveis.length)
    .sort((a, b) => _cqNomeTeste(a.t).localeCompare(_cqNomeTeste(b.t), 'pt') || _cqEquipTeste(a.t).localeCompare(_cqEquipTeste(b.t), 'pt'));
}
function _cqLoteUsoHTML(l, pode) {
  const cands = _cqLoteUsoCandidatos(l);
  const mat = cqState.config.materiais[l.materialId];
  if (!cands.length) return `<div class="cq-nota">Nenhum teste usa o material ${_cqEsc(mat?.nome || '')} nas áreas deste lote. Escolha o material no cadastro do teste (aba Analitos e testes); depois o lote pode ser definido aqui.</div>`;
  const bloq = l.status === 'quarentena' || l.status === 'encerrado' || _cqLoteVencido(l);
  const multiUn = _cqUnidadesRec(l).length !== 1;
  const total = cands.reduce((s, x) => s + x.niveis.length, 0);
  const comEste = cands.reduce((s, x) => s + x.niveis.filter(n => x.t.lotesAtivos?.[n] === l.id).length, 0);
  setTimeout(_cqLoteUsoAtualizar, 0);   // chips do botão: lidos das caixas depois de o HTML entrar na página
  // Popover: um grupo por teste, cada nível é uma opção marcável com o lote em uso hoje.
  // As caixas (.cq-lote-uso) ficam no popover mesmo fechado; _cqLoteUsoCapturar lê direto delas.
  const grupos = cands.map(({ t, niveis }) => {
    const qual = _cqTesteQual(t);
    const nomeT = _cqNomeTeste(t);
    const sub = [_cqEquipTeste(t), multiUn ? _cqSiglasUnidades([t.unidadeId]) : '', t.ativo === false ? 'inativo' : ''].filter(Boolean).join(' · ');
    const ops = niveis.map(n => {
      const atual = _cqLoteDoNivel(t, n);
      const usa = atual?.id === l.id;
      // Alvo só é conhecido para a unidade ativa (os alvos são carregados por unidade)
      const semAlvo = usa && !qual && _cqAlvosReady && t.unidadeId === _cqUnidadeAtivaId() && !_cqAlvoVigente(t.id, l.id, n);
      const hoje = usa ? 'este lote' : atual ? `${atual.lote}${_cqLoteVencido(atual) ? ' (vencido)' : atual.status === 'encerrado' ? ' (encerrado)' : ''}` : 'sem lote';
      const off = !pode || (bloq && !usa);
      const rot = qual ? _cqRotuloNivel(t, n) : `N${n}`;
      return `<label class="cq-ms-op cq-uso-op${usa ? ' on' : ''}${off ? ' off' : ''}" data-q="${_cqEsc(_cqNormBusca(`${nomeT} ${sub} ${rot} ${hoje}`))}">
        <input type="checkbox" class="cq-lote-uso" data-t="${t.id}" data-n="${n}" data-rot="${_cqEsc(`${nomeT} · ${rot}`)}" ${usa ? 'checked' : ''} ${off ? 'disabled' : ''} onchange="cqLoteUsoMarcar(this)">
        <span class="cq-ms-op-txt">${_cqEsc(rot)}<small class="${!usa && !atual ? 'cq-txt-amarelo' : ''}">Hoje: <span class="cq-uso-hoje" data-orig="${_cqEsc(hoje)}">${_cqEsc(hoje)}</span></small></span>
        ${semAlvo ? '<span class="cq-uso-alerta" title="Cadastre o alvo deste lote na aba Alvos do teste">sem alvo</span>' : ''}</label>`;
    }).join('');
    return `<div class="cq-uso-grp${t.ativo === false ? ' inativo' : ''}"><div class="cq-ms-grupo cq-uso-grp-cab">${_cqEsc(nomeT)}${sub ? `<small>${_cqEsc(sub)}</small>` : ''}</div>${ops}</div>`;
  }).join('');
  return `${bloq ? `<div class="cq-alerta-box">${CQ_ICO.alerta} Lote ${l.status === 'quarentena' ? 'em quarentena' : _cqLoteVencido(l) ? 'vencido' : 'encerrado'}: não pode passar a ser o lote em uso de um teste.</div>` : ''}
    <div class="cq-uso-resumo">Em uso em <b id="cq-uso-n">${comEste}</b> de ${total} nível(is) de ${cands.length} teste(s)</div>
    <div class="cq-ms cq-uso-ms" id="cq-uso-ms" data-ro="${pode ? '' : '1'}">
      <div class="cq-ms-btn" id="cq-uso-ms-btn" tabindex="0" role="button" aria-haspopup="listbox"
        onclick="cqLoteUsoAbrir()" onkeydown="if(event.key==='Enter'||event.key===' '||event.key==='ArrowDown'){event.preventDefault();cqLoteUsoAbrir()}"></div>
      <div class="cq-ms-pop" id="cq-uso-ms-pop" style="display:none;" onkeydown="if(event.key==='Escape'){event.stopPropagation();cqLoteUsoFechar(true)}">
        <div class="cq-ms-busca">${CQ_ICO.busca}<input type="text" id="cq-uso-ms-busca" placeholder="Buscar teste ou nível…" autocomplete="off" oninput="cqLoteUsoBuscar(this.value)"></div>
        <div class="cq-ms-lista cq-uso-ms-lista" role="listbox" aria-multiselectable="true">${grupos}<div class="cq-ms-vazio" id="cq-uso-ms-vazio" style="display:none;">Nada encontrado.</div></div>
        <div class="cq-ms-pe"><span id="cq-uso-ms-n"></span><button type="button" onclick="cqLoteUsoFechar(true)">Concluir</button></div>
      </div>
    </div>
    <div class="cq-nota" style="margin-top:8px;">${pode ? '' : '<b>Só visualização:</b> clique em <b>Editar</b> (rodapé) para mudar o uso. '}Marque o nível para usar este lote (substitui o lote em uso; a troca fica registrada no teste e no lote, com justificativa). Testes quantitativos precisam do alvo do novo lote (aba “Alvos” do teste).
      Aparecem os testes cujo nível usa o material ${_cqEsc(mat?.nome || '')}.</div>`;
}
// Popover de uso nos testes: botão com um chip por nível marcado
function _cqLoteUsoCaixas() { return [...document.querySelectorAll('#cq-uso-ms .cq-lote-uso')]; }
function _cqLoteUsoAtualizar() {
  const btn = document.getElementById('cq-uso-ms-btn');
  if (!btn) return;
  const cx = _cqLoteUsoCaixas(), sel = cx.filter(c => c.checked);
  const chips = sel.map(c => `<span class="cq-ms-chip" title="${_cqEsc(c.dataset.rot)}"><span class="cq-ms-chip-txt">${_cqEsc(c.dataset.rot.slice(0, c.dataset.rot.lastIndexOf(' · ')))}</span><span class="cq-uso-chip-nv">${_cqEsc(c.dataset.rot.slice(c.dataset.rot.lastIndexOf(' · ') + 3))}</span>${c.disabled ? '' : `<button type="button" title="Retirar este lote do nível" onclick="event.stopPropagation();cqLoteUsoTirar(${cx.indexOf(c)})">×</button>`}</span>`).join('');
  btn.innerHTML = `<div class="cq-ms-chips">${chips || `<span class="cq-ms-ph">Nenhum nível usa este lote${document.getElementById('cq-uso-ms')?.dataset.ro ? '' : ' — clique para escolher'}</span>`}</div>
    <svg class="cq-ms-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>`;
  const n = document.getElementById('cq-uso-n');
  if (n) n.textContent = sel.length;
  const pe = document.getElementById('cq-uso-ms-n');
  const ro = !!document.getElementById('cq-uso-ms')?.dataset.ro;
  if (pe) pe.textContent = `${sel.length} de ${cx.length} nível(is) com este lote${ro ? ' · só visualização: use Editar para mudar' : ''}`;
}
function cqLoteUsoMarcar(c) {
  const op = c.closest('.cq-uso-op');
  op?.classList.toggle('on', c.checked);
  const h = op?.querySelector('.cq-uso-hoje');
  if (h) h.textContent = c.checked ? (h.dataset.orig === 'este lote' ? 'este lote' : `${h.dataset.orig} → este lote`) : (h.dataset.orig === 'este lote' ? 'este lote → sem lote' : h.dataset.orig);
  _cqLoteUsoAtualizar();
}
function cqLoteUsoTirar(i) {
  const c = _cqLoteUsoCaixas()[i];
  if (!c || c.disabled) return;
  c.checked = false;
  cqLoteUsoMarcar(c);
}
function cqLoteUsoAbrir() {
  const pop = document.getElementById('cq-uso-ms-pop');
  if (!pop) return;
  if (pop.style.display !== 'none') { cqLoteUsoFechar(); return; }
  const b = document.getElementById('cq-uso-ms-busca');
  if (b) b.value = '';
  cqLoteUsoBuscar('');
  pop.style.display = '';
  document.getElementById('cq-uso-ms')?.classList.add('aberto');
  setTimeout(() => b?.focus(), 30);
}
function cqLoteUsoFechar(foco) {
  const pop = document.getElementById('cq-uso-ms-pop');
  if (!pop || pop.style.display === 'none') return;
  pop.style.display = 'none';
  document.getElementById('cq-uso-ms')?.classList.remove('aberto');
  if (foco) document.getElementById('cq-uso-ms-btn')?.focus();
}
function cqLoteUsoBuscar(q) {
  const k = _cqNormBusca(q || '').trim();
  let algum = false;
  document.querySelectorAll('#cq-uso-ms .cq-uso-grp').forEach(g => {
    let vis = 0;
    g.querySelectorAll('.cq-uso-op').forEach(o => { const ok = !k || o.dataset.q.includes(k); o.style.display = ok ? '' : 'none'; if (ok) vis++; });
    g.style.display = vis ? '' : 'none';
    if (vis) algum = true;
  });
  const v = document.getElementById('cq-uso-ms-vazio');
  if (v) v.style.display = algum ? 'none' : '';
}
document.addEventListener('mousedown', e => {
  const el = document.getElementById('cq-uso-ms');
  if (el && !el.contains(e.target)) cqLoteUsoFechar();
});
// Mudanças de lote em uso marcadas na aba "Uso nos testes": [{ t, la (novo lotesAtivos), mud: [texto] }]
function _cqLoteUsoCapturar(l) {
  const porTeste = new Map();
  document.querySelectorAll('#cq-drawer .cq-lote-uso').forEach(c => {
    const t = cqState.config.testes[c.dataset.t];
    if (!t || c.disabled) return;
    const n = c.dataset.n;
    const atual = t.lotesAtivos?.[n] || null;
    if (c.checked === (atual === l.id)) return;
    const x = porTeste.get(t.id) || { t, la: { ...(t.lotesAtivos || {}) }, mud: [] };
    const rot = _cqTesteQual(t) ? _cqRotuloNivel(t, n) : `N${n}`;
    if (c.checked) { x.la[n] = l.id; x.mud.push(`${rot}: ${cqState.config.lotesControle[atual]?.lote || 'sem lote'} → ${l.lote}`); }
    else { delete x.la[n]; x.mud.push(`${rot}: ${l.lote} → sem lote`); }
    porTeste.set(t.id, x);
  });
  return [...porTeste.values()];
}

function cqLoteForm(id, opts = {}) {
  const l = id ? cqState.config.lotesControle[id] : null;
  const pode = l ? _cqPodeEditarCad() : _cqPodeCriarLote();
  _cqLoteFormId = id || null;
  const mats = Object.values(cqState.config.materiais).filter(m => m.id === l?.materialId || m.id === opts.materialId || (m.ativo !== false && _cqNaUnidade(m))).sort((a, b) => a.nome.localeCompare(b.nome));
  if (!mats.length) { showToast('Cadastre antes o material de controle desta área.', 'error'); return; }
  const mat0 = l ? cqState.config.materiais[l.materialId] : (cqState.config.materiais[opts.materialId] || mats[0]);
  // Número de níveis de teste com este lote em uso
  const usoN = l ? Object.values(cqState.config.testes).reduce((s, t) => s + Object.values(t.lotesAtivos || {}).filter(x => x === l.id).length, 0) : 0;
  cqDrawerOpen({
    titulo: l ? `Lote ${l.lote}` : 'Novo lote de controle', subtitulo: mat0 ? mat0.nome : '', icone: 'beaker',
    corpo: (mat0 && (l || opts.materialId) ? _cqVoltarHTML(mat0.nome, `cqMaterialVer('${mat0.id}','lotes')`, 'Voltar para o material') : '') + _cqAbasHTML('lote', [{ k: 'dados', rotulo: 'Lote', html: `
      ${_cqEncerradoAutoNota(l)}
      <div class="form-section"><div class="form-section-title">${CQ_ICO.beaker}Lote</div>
        <div class="form-field"><label class="field-label">Material <span class="required">*</span></label>
          <select id="cq-lote-mat" class="field-select" onchange="cqLoteMatChange()" ${l || !pode ? 'disabled' : ''}>${mats.map(m => `<option value="${m.id}" ${m.id === mat0?.id ? 'selected' : ''}>${_cqEsc(m.nome)} — ${_cqEsc(m.fabricante)}</option>`).join('')}</select></div>
        <div class="form-row">
          <div class="form-field"><label class="field-label">Número do lote <span class="required">*</span></label><input type="text" id="cq-lote-num" class="field-input" maxlength="40" value="${_cqEsc(l?.lote)}" ${l || !pode ? 'disabled' : ''}></div>
          <div class="form-field"><label class="field-label">Validade <span class="required">*</span></label><input type="date" id="cq-lote-val" class="field-input" value="${_cqEsc(l?.validade)}" ${_cqRo(pode)}></div>
        </div>
        <div class="form-field"><label class="field-label">Níveis deste lote</label><div class="cq-checks cq-checks-inline" id="cq-lote-niveis">${_cqLoteNiveisHTML(mat0, l, pode)}</div></div>
        ${_cqUnidadesCampoHTML('cq-lote-un', l, pode, 'Áreas que usam este lote (precisam estar entre as do material).', 'lotesControle')}
        <div class="form-row">
          <div class="form-field"><label class="field-label">Situação</label>${_cqSitPopHTML('cq-lote-status', l?.status || 'em_uso', pode)}
            <div class="cq-nota">Vencido o lote, a situação passa a “Encerrado” automaticamente.</div></div>
          <div class="form-field"><label class="field-label">Link da bula / tabela de valores</label><input type="url" id="cq-lote-bula" class="field-input" value="${_cqEsc(l?.bulaUrl)}" placeholder="https://…" ${_cqRo(pode)}></div>
        </div>
        <div class="form-field"><label class="field-label">Observações</label><textarea id="cq-lote-obs" class="field-textarea" style="min-height:50px;" ${_cqRo(pode)}>${_cqEsc(l?.observacoes)}</textarea></div>
      </div>
` }, l && { k: 'uso', rotulo: `Uso nos testes${usoN ? ` <span class="cq-step-qtd">${usoN}</span>` : ''}`, html: _cqLoteUsoHTML(l, pode) }, _cqAbaTrilha(l)], opts.aba),
    rodape: _cqRodapeForm('cqLoteSalvar()', pode, l ? `cqExcluirCadastro('lotesControle','${l.id}')` : ''),
  });
}

// Testes (de qualquer área) com algum nível usando o lote de controle
function _cqTestesDoLoteControle(lid) {
  const f = _cqSetorAtivoId();
  return Object.values(cqState.config.testes).filter(t => Object.values(t.lotesAtivos || {}).includes(lid) && (!f || _cqTestePassaSetor(t, f)));
}

// Visualização do material de controle (clique na linha): dados, níveis, lotes (Ativos / Inativos) e trilha.
// Editar abre o formulário (cqMaterialForm), no mesmo modelo dos produtos de reagentes.
function cqMaterialVer(id, aba) {
  const m = cqState.config.materiais[id];
  if (!m) return;
  const hoje = _cqHoje();
  const lotes = Object.values(cqState.config.lotesControle).filter(l => l.materialId === m.id).sort((a, b) => (b.validade || '').localeCompare(a.validade || ''));
  const ativos = lotes.filter(l => !_cqLoteInativo(l));
  const prox = ativos.filter(l => l.validade).map(l => l.validade).sort()[0];
  const proxDias = prox ? _cqPrepDias(hoje, prox) : null;
  const nTestes = new Set(lotes.flatMap(l => _cqTestesDoLoteControle(l.id).map(t => t.id))).size;
  const equips = _cqArr(m.equips);
  const ans = _cqArr(m.analitoIds);
  const niveis = Object.entries(m.niveis || {});
  const tipo = CQ_TIPOS_MATERIAL[m.tipo] || m.tipo || '';
  const hero = `<div class="cq-pv-hero">
    <div class="cq-pv-hero-ico">${CQ_ICO.beaker}</div>
    <div class="cq-pv-hero-txt"><small>${_cqEsc(tipo || 'Material de controle')}</small><h3>${_cqEsc(m.nome)}</h3>
      <div class="cq-pv-chips">${_cqPvPill(_cqEsc(_cqSiglasUnidades(_cqUnidadesRec(m)) || 'Todas as áreas'), '', CQ_ICO.unidade)}
        ${m.fabricante ? _cqPvPill(_cqEsc(m.fabricante), '', CQ_ICO.cadastro) : ''}
        ${m.codigoReferencia ? _cqPvPill(_cqEsc(m.codigoReferencia), 'ciano', CQ_ICO.beaker) : ''}</div></div>
    ${_cqPvPill(m.ativo === false ? 'Inativo' : 'Ativo', m.ativo === false ? 'cinza grande' : 'verde grande')}
  </div>`;
  const stats = `<div class="cq-pv-stats">
    ${_cqPvStat(CQ_ICO.cadastro, 'Lotes ativos', String(ativos.length), `de ${lotes.length} cadastrado${lotes.length === 1 ? '' : 's'}`, ativos.length ? '' : 'alerta')}
    ${_cqPvStat(CQ_ICO.calendario, 'Próximo vencimento', prox ? _cqFmtData(prox) : '—',
      proxDias === null ? 'sem lote ativo' : proxDias < 0 ? `vencido há ${-proxDias} dia(s)` : proxDias === 0 ? 'vence hoje' : `em ${proxDias} dia(s)`,
      proxDias === null ? '' : proxDias < 0 ? 'perigo' : proxDias <= 30 ? 'alerta' : 'ok')}
    ${_cqPvStat(CQ_ICO.lista, 'Testes em uso', String(nTestes), nTestes ? 'com lote deste material' : 'nenhum teste usa os lotes')}
  </div>`;
  const secMat = _cqPvSecao(CQ_ICO.cadastro, 'Material', _cqPvCampos([
    { l: 'Fabricante', v: _cqEsc(m.fabricante || '') },
    { l: 'Fornecedor', v: _cqEsc(m.fornecedor || '') },
    { l: 'Registro ANVISA', v: _cqEsc(m.regAnvisa || '') },
    { l: 'Matriz', v: _cqEsc(m.matriz || '') },
    { l: 'Estabilidade após abertura', v: m.estabilidadeAbertoDias != null && m.estabilidadeAbertoDias !== '' ? `${_cqEsc(m.estabilidadeAbertoDias)} dia(s)` : '' },
    { l: 'Armazenamento', v: _cqEsc(m.armazenamento || '') },
    { l: 'Equipamentos / sistemas', v: equips.length ? _cqEsc(equips.map(_cqRotuloEquip).join(', ')) : 'Qualquer equipamento', fraco: !equips.length, largo: true },
    { l: 'Analitos controlados', v: ans.length ? _cqEsc(ans.map(a => _cqAnalito(a)?.nome || '?').join(', ')) : 'Todos os analitos', fraco: !ans.length, largo: true },
  ]));
  const secNiv = _cqPvSecao(CQ_ICO.lista, 'Níveis', niveis.length
    ? `<div class="cq-pv-chips">${niveis.map(([n, x]) => _cqPvPill(`Nível ${n}${x?.nome ? ' · ' + _cqEsc(x.nome) : ''}`, 'contorno')).join(' ')}</div>`
    : '<div class="cq-pv-nota">Nenhum nível definido.</div>');
  const geral = `<div class="cq-vw">${hero}${stats}${secMat}${secNiv}${_cqCtlPrepSecaoMaterial(m)}</div>`;
  const lotesHTML = _cqLotesCompactoHTML(lotes, 'cqLoteVer', _cqPodeCriarLote() ? `<button class="btn btn-outline btn-sm cq-an-novo-teste" onclick="cqLoteForm(null,{materialId:'${m.id}'})">${CQ_ICO.plus} Novo lote</button>` : '');
  cqDrawerOpen({
    titulo: m.nome, subtitulo: [tipo, m.fabricante, m.ativo === false ? 'inativo' : ''].filter(Boolean).join(' · ') || 'Material de controle', icone: 'beaker',
    corpo: `${_cqInativoNota(m, 'ativo', 'não é oferecido em testes novos')}${_cqAbasHTML('matver', [
      { k: 'geral', rotulo: 'Geral', html: geral },
      { k: 'lotes', rotulo: `Lotes${lotes.length ? ` <span class="cq-step-qtd">${lotes.length}</span>` : ''}`, html: lotesHTML },
      _cqAbaTrilha(m)], aba)}`,
    rodape: `<div>${_cqPodeExcluirCad('materiais') ? `<button class="btn btn-outline cq-btn-perigo" onclick="cqExcluirCadastro('materiais','${m.id}')">Excluir</button>` : ''}</div><div style="display:flex;gap:8px;"><button class="btn btn-outline" onclick="cqDrawerClose()">Fechar</button>
      ${_cqPodeEditarCad() ? `<button class="btn btn-primary" onclick="cqMaterialForm('${m.id}',{aba:document.querySelector('#cq-abas-matver .ot-modal-tab-btn.active')?.dataset.aba})">${CQ_ICO.edit} Editar</button>` : ''}</div>`,
  });
}

// Visualização do lote de controle (clique na linha): validade, níveis, uso nos testes e trilha.
// A situação (em uso, avaliação, quarentena, encerrado) muda no formulário: encerrar um lote em uso
// pede justificativa e tira o lote dos testes, o que o cqLoteSalvar já trata.
function cqLoteVer(id, aba) {
  const l = cqState.config.lotesControle[id];
  if (!l) return;
  const mat = cqState.config.materiais[l.materialId];
  const hoje = _cqHoje();
  const dias = l.validade ? _cqPrepDias(hoje, l.validade) : null;
  const testes = _cqTestesDoLoteControle(l.id);
  const niveis = _cqArr(l.niveis).map(Number).sort((a, b) => a - b);
  const hero = `<div class="cq-pv-hero">
    <div class="cq-pv-hero-ico">${CQ_ICO.cadastro}</div>
    <div class="cq-pv-hero-txt"><small>Lote · ${_cqEsc(CQ_TIPOS_MATERIAL[mat?.tipo] || 'Material de controle')}</small><h3>${_cqEsc(l.lote)}</h3>
      <div class="cq-pv-chips">${mat ? `<button type="button" class="cq-pv-pill link" onclick="cqMaterialVer('${mat.id}')" title="Ver o material">${CQ_ICO.beaker}${_cqEsc(mat.nome)}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="9 6 15 12 9 18"/></svg></button>` : ''}
        ${_cqPvPill(_cqEsc(_cqSiglasUnidades(_cqUnidadesRec(l)) || 'Todas as áreas'), '', CQ_ICO.unidade)}
        ${mat?.fabricante ? _cqPvPill(_cqEsc(mat.fabricante), '', CQ_ICO.cadastro) : ''}</div></div>
    <div class="cq-pv-hero-sit">${_cqLoteSituacaoBadge(l, hoje)}</div>
  </div>`;
  const stats = `<div class="cq-pv-stats">
    ${_cqPvStat(CQ_ICO.calendario, 'Validade do lote', l.validade ? _cqFmtData(l.validade) : '—',
      dias === null ? 'não informada' : dias < 0 ? `vencido há ${-dias} dia(s)` : dias === 0 ? 'vence hoje' : `faltam ${dias} dia(s)`,
      dias === null ? '' : dias < 0 ? 'perigo' : dias <= 30 ? 'alerta' : 'ok')}
    ${_cqPvStat(CQ_ICO.lista, 'Níveis', String(niveis.length), niveis.map(n => 'N' + n).join(', ') || 'nenhum')}
    ${_cqPvStat(CQ_ICO.beaker, 'Uso nos testes', String(testes.length), testes.length ? `teste${testes.length === 1 ? '' : 's'} com o lote em uso` : 'nenhum teste usa o lote', testes.length ? '' : 'alerta')}
  </div>`;
  const nomeNivel = n => mat?.niveis?.[n]?.nome;
  const secLote = _cqPvSecao(CQ_ICO.cadastro, 'Lote', _cqPvCampos([
    { l: 'Material', v: mat ? `${_cqEsc(mat.nome)} <small>${_cqEsc(mat.fabricante || '')}</small>` : 'Material removido' },
    { l: 'Níveis', v: niveis.map(n => `N${n}${nomeNivel(n) ? ' ' + _cqEsc(nomeNivel(n)) : ''}`).join(', ') },
    { l: 'Situação', v: _cqEsc(CQ_STATUS_LOTE[l.status || 'em_uso']?.label || l.status || '') },
    { l: 'Bula / tabela de valores', v: l.bulaUrl ? `<a href="${_cqEsc(l.bulaUrl)}" target="_blank" rel="noopener">Abrir link</a>` : '' },
    { l: 'Cadastrado em', v: l.criadoEm ? `${_cqFmtDH(l.criadoEm)}${l.criadoPor?.porNome ? ` <small>por ${_cqEsc(l.criadoPor.porNome)}</small>` : ''}` : '' },
    l.atualizadoEm && l.atualizadoEm !== l.criadoEm && { l: 'Última alteração', v: _cqFmtDH(l.atualizadoEm) },
  ]));
  const obs = String(l.observacoes || '').trim();
  const secObs = _cqPvSecao(CQ_ICO.lista, 'Observações', obs ? `<div class="cq-pv-obs">${_cqEsc(obs)}</div>` : '<div class="cq-pv-nota">Nenhuma observação.</div>');
  const geral = `<div class="cq-vw">${hero}${_cqEncerradoAutoNota(l)}${stats}${secLote}${secObs}</div>`;
  cqDrawerOpen({
    titulo: `${mat?.nome || 'Lote'} · lote ${l.lote}`, subtitulo: [CQ_TIPOS_MATERIAL[mat?.tipo], `val. ${_cqFmtData(l.validade)}`].filter(Boolean).join(' · '), icone: 'beaker',
    corpo: (mat ? _cqVoltarHTML(mat.nome, `cqMaterialVer('${mat.id}','lotes')`, 'Voltar para o material') : '') + _cqAbasHTML('lotever', [
      { k: 'geral', rotulo: 'Geral', html: geral },
      { k: 'uso', rotulo: `Uso nos testes${testes.length ? ` <span class="cq-step-qtd">${testes.length}</span>` : ''}`, html: _cqLoteUsoHTML(l, false) },
      _cqCtlPrepAbaLote(l, mat),
      _cqAbaTrilha(l)], aba),
    rodape: `<div>${_cqPodeExcluirCad('lotesControle') ? `<button class="btn btn-outline cq-btn-perigo" onclick="cqExcluirCadastro('lotesControle','${l.id}')">Excluir</button>` : ''}</div><div style="display:flex;gap:8px;"><button class="btn btn-outline" onclick="cqDrawerClose()">Fechar</button>
      ${_cqPodeEditarCad() ? `<button class="btn btn-primary" onclick="cqLoteForm('${l.id}',{aba:document.querySelector('#cq-abas-lotever .ot-modal-tab-btn.active')?.dataset.aba})">${CQ_ICO.edit} Editar</button>` : ''}</div>`,
  });
}

function _cqLoteNiveisHTML(mat, l, pode) {
  const sel = l ? _cqArr(l.niveis).map(Number) : Object.keys(mat?.niveis || {}).map(Number);
  return Object.entries(mat?.niveis || {}).map(([n, x]) => `<label class="oc-check"><input type="checkbox" class="cq-lote-nivel" value="${n}" ${sel.includes(Number(n)) ? 'checked' : ''} ${l || !pode ? 'disabled' : ''}> Nível ${n}${x?.nome ? ' (' + _cqEsc(x.nome) + ')' : ''}</label>`).join('');
}
function cqLoteMatChange() {
  const mat = cqState.config.materiais[_cqVal('cq-lote-mat')];
  const el = document.getElementById('cq-lote-niveis');
  if (el) el.innerHTML = _cqLoteNiveisHTML(mat, null, true);
}

async function cqLoteSalvar() {
  if (_cqSalvando || !(_cqLoteFormId ? _cqPodeEditarCad() : _cqPodeCriarLote())) return;
  const antes = _cqLoteFormId ? cqState.config.lotesControle[_cqLoteFormId] : null;
  const materialId = antes ? antes.materialId : _cqVal('cq-lote-mat');
  const lote = antes ? antes.lote : _cqVal('cq-lote-num');
  const validade = _cqVal('cq-lote-val');
  const niveis = antes ? _cqArr(antes.niveis) : [...document.querySelectorAll('#cq-drawer .cq-lote-nivel:checked')].map(c => Number(c.value));
  if (!materialId || !lote) { showToast('Informe material e número do lote.', 'error'); return; }
  if (!validade) { showToast('Informe a validade do lote.', 'error'); return; }
  if (!niveis.length) { showToast('Selecione os níveis do lote.', 'error'); return; }
  const dupL = antes ? null : Object.values(cqState.config.lotesControle).find(x => x.materialId === materialId && x.lote.toLowerCase() === lote.toLowerCase());
  if (dupL) { if (!_cqOferecerAssociar('lotesControle', dupL, `Lote ${dupL.lote} — ${cqState.config.materiais[materialId]?.nome || ''}`)) showToast('Lote já cadastrado para este material.', 'error'); return; }
  const unidadeIds = _cqUnidadesCapturar('cq-lote-un', 'lotesControle', antes);
  if (!unidadeIds) return;
  const matL = cqState.config.materiais[materialId];
  const foraMat = _cqUnidadesRec(matL).length ? unidadeIds.filter(x => !_cqUnidadesRec(matL).includes(x)) : [];
  if (foraMat.length) { showToast(`O material ${matL.nome} não está associado à(s) área(s) ${_cqSiglasUnidades(foraMat)}. Associe o material antes.`, 'error'); return; }
  const rec = { ...(antes || {}), id: _cqLoteFormId || _cqUid(), materialId, lote, validade, niveis, unidadeIds,
                status: _cqVal('cq-lote-status') || 'em_uso', bulaUrl: _cqVal('cq-lote-bula'), observacoes: _cqVal('cq-lote-obs') };
  if (rec.status !== 'encerrado') delete rec.encerradoAuto;   // reaberto: o gatilho volta a valer
  if (!antes) { rec.criadoEm = _cqAgora(); rec.criadoPor = _cqAssinatura(); }
  const fmt = { status: v => CQ_STATUS_LOTE[v]?.label || v, materialId: v => cqState.config.materiais[v]?.nome || v, niveis: v => _cqArr(v).map(n => 'N' + n).join(', '), unidadeIds: _cqSiglasUnidades };
  const diffs = antes ? _cqDiff(antes, rec, CQ_LBL_LOTE, fmt) : [];
  const uso = antes ? _cqLoteUsoCapturar(antes) : [];
  if (antes && !diffs.length && !uso.length) { cqDrawerClose(); return; }
  // Lote que deixa de poder ser usado não pode ficar como lote em uso marcado agora
  const bloqueado = rec.status === 'quarentena' || rec.status === 'encerrado' || _cqLoteVencido(rec);
  if (bloqueado && uso.some(x => Object.values(x.la).includes(rec.id))) { showToast('Lote em quarentena, encerrado ou vencido não pode passar a ser o lote em uso de um teste.', 'error'); return; }
  const fmtLotes = v => Object.entries(v || {}).map(([n, id]) => `N${n}: ${(id === rec.id ? rec : cqState.config.lotesControle[id])?.lote || id}`).join('; ') || '—';
  const gravar = async justificativa => {
    if (diffs.length || !antes) _cqTrilhaAdd(rec, antes ? 'edicao' : 'criacao', antes ? 'Lote alterado' : 'Lote cadastrado', diffs);
    if (uso.length) _cqTrilhaAdd(rec, 'edicao', `Lote em uso alterado no cadastro do lote — ${uso.map(x => `${_cqNomeTeste(x.t)} · ${_cqEquipTeste(x.t)} (${x.mud.join(', ')})`).join('; ')}: ${justificativa}`);
    rec.atualizadoEm = _cqAgora();
    const C = CQ_KEYS.config;
    // Campo a campo: os preparos (cq-controle-preparo.js) podem ter sido gravados por outra estação
    const updates = {};
    const campos = new Set([...Object.keys(antes || {}), ...Object.keys(rec)]);
    campos.forEach(k => { if (k !== 'preparos' && k !== 'preparoSeq') updates[`${C}/lotesControle/${rec.id}/${k}`] = rec[k] ?? null; });
    uso.forEach(x => {
      const p = `${C}/testes/${x.t.id}`;
      updates[`${p}/lotesAtivos`] = x.la;
      updates[`${p}/atualizadoEm`] = rec.atualizadoEm;
      updates[`${p}/trilha/${_cqTk()}${x.t.id.slice(-3)}`] = _cqTrilhaEntry('edicao', `Troca de lote definida no cadastro do lote ${rec.lote}: ${justificativa}`,
        [{ campo: CQ_LBL_TESTE.lotesAtivos, antes: fmtLotes(x.t.lotesAtivos), depois: fmtLotes(x.la) }]);
    });
    _cqSalvando = true;
    try {
      if (!(await window.dbUpdate(updates))) { showToast('Falha ao gravar. Verifique a conexão e tente novamente.', 'error'); return false; }
      cqState.config.lotesControle[rec.id] = rec;
      uso.forEach(x => { cqState.config.testes[x.t.id] = { ...x.t, lotesAtivos: x.la }; });
      showToast(uso.length ? `Lote salvo; lote em uso atualizado em ${uso.length} teste(s).` : 'Lote salvo.', 'success');
      cqRender();
      // Lote novo: reabre na aba "Uso nos testes" para defini-lo como lote em uso
      if (!antes) cqLoteForm(rec.id, { aba: _cqLoteUsoCandidatos(rec).length ? 'uso' : 'dados' }); else cqDrawerClose();
      return true;
    } finally { _cqSalvando = false; }
  };
  if (!uso.length) { await gravar(''); return; }
  _cqPrompt({
    titulo: 'Troca de lote em uso', subtitulo: `Lote ${rec.lote} — registre o motivo`,
    corpo: `<div class="cq-nota">${uso.map(x => `<div><b>${_cqEsc(_cqNomeTeste(x.t))}</b> · ${_cqEsc(_cqEquipTeste(x.t))}: ${_cqEsc(x.mud.join(', '))}</div>`).join('')}</div>
      <div class="form-field"><label class="field-label">Justificativa <span class="required">*</span></label>
        <textarea id="cq-lote-uso-just" class="field-textarea" style="min-height:70px;" placeholder="Ex.: lote anterior esgotado; novo lote avaliado em paralelo por 10 dias."></textarea></div>`,
    confirmar: 'Confirmar',
    onConfirm: async () => {
      const j = _cqVal('cq-lote-uso-just');
      if (!j) { showToast('Informe a justificativa.', 'error'); return false; }
      return gravar(j);
    },
  });
}

// ── REAGENTES, MEIOS E INSUMOS: PRODUTO ──────────────────────
// Produto (insumoProdutos): tipo, fabricante, equipamentos/analitos e preparo interno.
// Os lotes (insumos) apontam para o produto e herdam esses dados (ver _cqHidratarInsumos).
let _cqInsProdFormId = null;
const CQ_LBL_INS_PRODUTO = { setorIds: 'Setores', tipo: 'Tipo', nome: 'Produto', fabricante: 'Fabricante', regAnvisa: 'Registro ANVISA', equips: 'Equipamentos / sistemas', analitoIds: 'Analitos',
                             preparoInterno: 'Preparado no laboratório', preparo: 'Dados do preparo', unidadeIds: 'Áreas', ativo: 'Ativo' };
const _cqFmtPreparo = v => v ? [v.especificacao, v.armazenamento, v.riscos ? 'riscos: ' + v.riscos : '', v.validadeDias ? `validade ${v.validadeDias} dia(s) após preparo` : '',
  v.volume ? `volume padrão ${String(v.volume).replace('.', ',')} ${v.unidadeQtd || ''}`.trim() : '', v.liberaSemCIQ ? 'liberado no registro (sem CIQ)' : '', v.avisoDias != null ? `avisa a troca ${v.avisoDias} dia(s) antes` : ''].filter(Boolean).join(' · ') : '—';

function cqInsumoProdutoForm(id, opts = {}) {
  const p = id ? cqState.config.insumoProdutos[id] : null;
  const pode = _cqPodeEditarCad(!!p);
  _cqInsProdFormId = id || null;
  const sel = _cqArr(p?.analitoIds);
  const equips = _cqEquipsInsumo(p);
  const prep = p?.preparo || {};
  const lotes = p ? _cqLotesDoProduto(p.id).sort((a, b) => (b.validade || '').localeCompare(a.validade || '')) : [];
  cqDrawerOpen({
    titulo: p ? p.nome : 'Novo produto', subtitulo: 'Reagente, calibrador, meio de cultura ou corante — os lotes são cadastrados no produto', icone: 'beaker',
    corpo: _cqAbasHTML('prod', [{ k: 'dados', rotulo: 'Produto', html: `
      ${_cqInativoNota(p, 'ativo', 'não é oferecido em testes novos')}
      <div class="form-section"><div class="form-section-title">${CQ_ICO.beaker}Produto</div>
        <div class="form-row">
          <div class="form-field" style="max-width:190px;"><label class="field-label">Tipo</label><select id="cq-ins-tipo" class="field-select" ${_cqRo(pode)}>${_cqMapOptions(CQ_TIPOS_INSUMO, p?.tipo || 'reagente', null)}</select></div>
          <div class="form-field"><label class="field-label">Produto <span class="required">*</span></label><input type="text" id="cq-ins-nome" class="field-input" maxlength="100" value="${_cqEsc(p?.nome)}" placeholder="Ex.: Ágar EMB" ${_cqRo(pode)}></div>
        </div>
        <div class="form-row">
          <div class="form-field"><label class="field-label">Fabricante</label><input type="text" id="cq-ins-fab" class="field-input" value="${_cqEsc(p?.fabricante)}" ${_cqRo(pode)}></div>
          <div class="form-field"><label class="field-label">Registro ANVISA</label><input type="text" id="cq-ins-anvisa" class="field-input" value="${_cqEsc(p?.regAnvisa)}" ${_cqRo(pode)}></div>
        </div>
        ${_cqUnidadesCampoHTML('cq-ins-un', p, pode, 'O produto e seus lotes só aparecem nas áreas selecionadas.', 'insumoProdutos')}
        <div class="form-field"><label class="field-label">Equipamentos / sistemas</label>
          ${_cqMultiHTML('cq-ins-equip', _cqOpcoesEquipInsumo(equips), equips, { placeholder: 'Qualquer equipamento ou bancada', disabled: !pode, onchange: cqInsumoEquipChange, vazio: 'Nenhum equipamento ou sistema cadastrado.' })}
          <div class="cq-nota">Ativos da área e sistemas analíticos sem equipamento informados nos analitos. Vazio: serve a qualquer um.</div></div>
        <div class="form-field"><label class="field-label">Analitos <span class="cq-muted" id="cq-ins-an-escopo">${equips.length ? '(vazio = todos dos equipamentos)' : '(vazio = todos)'}</span></label>
          ${_cqMultiHTML('cq-ins-an', _cqOpcoesAnalitosEquip(equips, sel), sel, { placeholder: 'Todos os analitos', disabled: !pode, vazio: 'Nenhum analito vinculado a estes equipamentos/sistemas (vincule no cadastro do analito).' })}
          <div class="cq-nota">Com equipamento ou sistema selecionado, só aparecem os analitos vinculados a ele no cadastro de analitos.</div></div>
        ${(() => {
          // Setores: para o filtro de setor do CQ achar o produto sem equipamento/analito (ou além deles)
          // Só os setores das áreas marcadas no campo Áreas (atualiza quando as áreas mudam)
          if (_cqMulti['cq-ins-un']) _cqMulti['cq-ins-un'].onchange = cqInsSetoresAreas;
          const ops = _cqInsSetoresOps(_cqMultiVal('cq-ins-un'));
          if (!Object.values(cqState.config.unidades).some(un => _cqSetoresDaUnidade(un.id).length) && !_cqArr(p?.setorIds).length) return '';
          return `<div class="form-field"><label class="field-label">Setores</label>
            ${_cqMultiHTML('cq-ins-setores', ops, _cqArr(p?.setorIds), { placeholder: 'Pelos testes, equipamentos e analitos vinculados', disabled: !pode, vazio: 'Nenhum setor nas áreas selecionadas.' })}
            <div class="cq-nota">Use para produto sem equipamento ou analito vinculado: ele passa a aparecer no filtro desses setores. Os testes, equipamentos e analitos vinculados continuam valendo.</div></div>`;
        })()}
        <input type="checkbox" id="cq-ins-ativo" hidden ${p?.ativo === false ? '' : 'checked'}>
      </div>
      <div class="form-section"><div class="form-section-title">${CQ_ICO.beaker}Preparo no laboratório (RDC 978, art. 101)</div>
        <label class="oc-check"><input type="checkbox" id="cq-ins-prep" ${p?.preparoInterno ? 'checked' : ''} onchange="document.getElementById('cq-ins-prep-campos').style.display=this.checked?'':'none'" ${_cqRo(pode)}> Preparado ou fracionado pelo laboratório (meio preparado a partir do desidratado, corante diluído…)</label>
        <div id="cq-ins-prep-campos" style="${p?.preparoInterno ? '' : 'display:none;'}">
          <div class="cq-nota">Lote e validade são os de cada lote do produto (ex.: meio desidratado). Data e responsável de cada preparo são informados no lançamento da corrida.</div>
          <div class="form-row">
            <div class="form-field"><label class="field-label">Concentração / especificação</label><input type="text" id="cq-ins-prep-esp" class="field-input" value="${_cqEsc(prep.especificacao)}" placeholder="Ex.: 36 g/L; pH 7,2 ± 0,2" ${_cqRo(pode)}></div>
            <div class="form-field" style="max-width:200px;"><label class="field-label">Validade após preparo (dias)</label><input type="number" min="1" max="3650" id="cq-ins-prep-dias" class="field-input" value="${_cqEsc(prep.validadeDias ?? '')}" placeholder="Ex.: 30" ${_cqRo(pode)}></div>
            <div class="form-field" style="max-width:220px;"><label class="field-label">Volume padrão do preparo</label>
              <div class="cq-pf-qtd"><input type="number" min="0" step="any" inputmode="decimal" id="cq-ins-prep-vol" class="field-input" value="${_cqEsc(prep.volume ?? '')}" placeholder="Ex.: 500" ${_cqRo(pode)}>
                <select id="cq-ins-prep-un" class="field-select" ${_cqRo(pode)}>${CQ_UNID_PREPARO.map(x => `<option ${x === (prep.unidadeQtd || 'mL') ? 'selected' : ''}>${x}</option>`).join('')}</select></div></div>
          </div>
          <div class="form-row">
            <div class="form-field"><label class="field-label">Armazenamento <span class="required">*</span></label><input type="text" id="cq-ins-prep-arm" class="field-input" value="${_cqEsc(prep.armazenamento)}" placeholder="Ex.: 2 a 8 °C, protegido da luz" ${_cqRo(pode)}></div>
            <div class="form-field"><label class="field-label">Riscos potenciais</label><input type="text" id="cq-ins-prep-risco" class="field-input" value="${_cqEsc(prep.riscos)}" placeholder="Ex.: irritante; inflamável" ${_cqRo(pode)}></div>
          </div>
          <label class="oc-check"><input type="checkbox" id="cq-ins-prep-livre" ${prep.liberaSemCIQ ? 'checked' : ''} ${_cqRo(pode)}> Liberado no registro, sem corrida de CIQ (ex.: corante ou fixador da bateria de coloração)</label>
          <div class="cq-prep-aviso-lin">
            <label class="oc-check"><input type="checkbox" id="cq-ins-prep-aviso" ${prep.avisoDias != null ? 'checked' : ''} onchange="document.getElementById('cq-ins-prep-aviso-dias').disabled=!this.checked" ${_cqRo(pode)}> Avisar a troca quando o preparo em uso estiver para vencer</label>
            <input type="number" min="0" max="365" id="cq-ins-prep-aviso-dias" class="field-input" value="${_cqEsc(prep.avisoDias ?? 3)}" title="Dias de antecedência do aviso" ${prep.avisoDias != null && pode ? '' : 'disabled'}><span class="cq-muted">dia(s) antes</span>
          </div>
          <div class="cq-nota">O aviso aparece no painel do CQ e no sino de alertas. Também avisa quando o produto fica sem preparo em uso.</div>
        </div>
      </div>
` }, p && { k: 'lotes', rotulo: `Lotes${lotes.length ? ` <span class="cq-step-qtd">${lotes.length}</span>` : ''}`,
        html: _cqLotesCompactoHTML(lotes, 'cqInsumoForm', pode ? `<button class="btn btn-outline btn-sm cq-an-novo-teste" onclick="cqInsumoForm(null,{produtoId:'${p.id}'})">${CQ_ICO.plus} Novo lote</button>` : '') },
      _cqAbaTrilha(p)], opts.aba),
    rodape: _cqRodapeForm('cqInsumoProdutoSalvar()', pode, p ? `cqExcluirCadastro('insumoProdutos','${p.id}')` : '',
      p && { ids: 'cq-ins-ativo', fn: 'cqInsumoProdutoSalvar', colecao: 'insumoProdutos', id: p.id, ativo: p.ativo !== false }),
  });
}

// Visualização do produto (clique na linha da tabela): dados gerais e abas de lotes e preparos,
// cada uma com Ativos / Inativos. Editar abre o formulário (cqInsumoProdutoForm).
// rot.busca (opcional): { ph, chave(x) } põe a pesquisa ao lado das abas; filtra as duas abas enquanto digita
function _cqAtivosInativosHTML(itens, inativo, item, rot) {
  const ina = itens.filter(inativo), atv = itens.filter(x => !inativo(x));
  const k0 = !atv.length && ina.length ? 'inativos' : 'ativos';
  const seg = `<div class="cq-seg cq-lotes-seg" role="tablist">${[['ativos', CQ_ICO.play + 'Ativos', atv.length, rot.tAtivos], ['inativos', 'Inativos', ina.length, rot.tInativos]]
    .map(([k, l, n, t]) => `<button type="button" data-k="${k}" class="${k === k0 ? 'active' : ''}" title="${t}" onclick="cqLotesAbaJanela(this)">${l} <span class="cq-seg-n">${n}</span></button>`).join('')}</div>`;
  const bk = rot.busca;
  // Cada item leva a chave de busca normalizada (data-b) no elemento raiz
  const html = x => { const h = item(x); return bk ? h.replace('<div ', `<div data-b="${_cqEsc(_cqNormBusca(bk.chave(x) || ''))}" `) : h; };
  const pane = (k, ls, vazio) => `<div class="cq-lotes-pane" data-k="${k}"${k === k0 ? '' : ' hidden'}><div class="cq-te-lista">${ls.map(html).join('') || `<div class="cq-ms-vazio">${vazio}</div>`}
    ${bk && ls.length ? '<div class="cq-ms-vazio cq-ai-nada" hidden>Nenhum resultado para a pesquisa.</div>' : ''}</div></div>`;
  const topo = bk && itens.length ? `<div class="cq-ai-topo">${seg}
    <label class="cq-ai-busca" title="${_cqEsc(bk.ph)}">${CQ_ICO.busca}<input type="search" placeholder="${_cqEsc(bk.ph)}" autocomplete="off" oninput="cqAtivosInativosBuscar(this)" onkeydown="if(event.key==='Escape'&&this.value){event.stopPropagation();this.value='';cqAtivosInativosBuscar(this);}"></label></div>` : seg;
  return `<div class="cq-lotes-janela">${topo}${pane('ativos', atv, rot.vAtivos)}${pane('inativos', ina, rot.vInativos)}</div>`;
}
// Pesquisa nas abas Ativos / Inativos: esconde o que não bate e atualiza a contagem de cada aba
function cqAtivosInativosBuscar(inp) {
  const box = inp.closest('.cq-lotes-janela');
  if (!box) return;
  const t = _cqNormBusca(inp.value || '').trim();
  box.classList.toggle('buscando', !!t);
  box.querySelectorAll('.cq-lotes-pane').forEach(p => {
    let n = 0;
    const its = p.querySelectorAll('[data-b]');
    its.forEach(el => { const ok = !t || el.dataset.b.includes(t); el.hidden = !ok; if (ok) n++; });
    const nada = p.querySelector('.cq-ai-nada');
    if (nada) nada.hidden = !its.length || n > 0;
    const c = box.querySelector(`.cq-lotes-seg button[data-k="${p.dataset.k}"] .cq-seg-n`);
    if (c) c.textContent = n;
  });
}

// Peças da aba Geral das janelas de visualização (produto e lote)
const _cqPvNome = n => { const x = String(n || '').trim().split(/\s+/).filter(Boolean); return x.length > 1 ? `${x[0]} ${x[x.length - 1]}` : x[0] || ''; };
const _cqPvPill = (txt, cls = '', ico = '') => `<span class="cq-pv-pill ${cls}">${ico}${txt}</span>`;
function _cqPvStat(ico, rot, valor, sub, cls = '') {
  return `<div class="cq-pv-stat ${cls}"><span class="cq-pv-stat-ico">${ico}</span><div class="cq-pv-stat-txt"><small>${rot}</small><b>${valor}</b>${sub ? `<span>${sub}</span>` : ''}</div></div>`;
}
function _cqPvSecao(ico, tit, corpo) { return `<section class="cq-pv-sec"><header>${ico}<b>${tit}</b></header><div class="cq-pv-sec-corpo">${corpo}</div></section>`; }
// Campos em grade; os vazios não ocupam espaço: ficam numa linha "Não informado"
function _cqPvCampos(campos) {
  const cs = campos.filter(Boolean);
  const cheios = cs.filter(c => c.v), vazios = cs.filter(c => !c.v);
  return `${cheios.length ? `<div class="cq-pv-grid">${cheios.map(c => `<div class="cq-pv-campo${c.largo ? ' largo' : ''}${c.fraco ? ' fraco' : ''}"><span>${c.l}</span><b>${c.v}</b></div>`).join('')}</div>` : ''}
    ${vazios.length ? `<div class="cq-pv-faltam">Não informado: ${vazios.map(c => c.l.toLowerCase()).join(', ')}</div>` : ''}`;
}
// Cartão "Último preparo": data, código e quem preparou
function _cqPvUltimoPrep(ult) {
  return _cqPvStat(CQ_ICO.clock, 'Último preparo', ult ? _cqFmtData(ult.data) : '—',
    ult ? `<em title="${_cqEsc([ult.codigo, ult.responsavel].filter(Boolean).join(' · '))}">${_cqEsc(ult.codigo || '')}</em>${ult.responsavel ? ` · ${_cqEsc(_cqPvNome(ult.responsavel))}` : ''}` : 'nenhum registrado');
}

function cqInsumoProdutoVer(id, aba) {
  const p = cqState.config.insumoProdutos[id];
  if (!p) return;
  const pode = _cqPodeCriarLote();
  const hoje = _cqHoje();
  const prep = p.preparo || {};
  const lotes = _cqLotesDoProduto(p.id).sort((a, b) => (b.validade || '').localeCompare(a.validade || ''));
  const preps = p.preparoInterno ? lotes.flatMap(i => _cqPreparosDe(i).map(x => ({ i, p: x })))
    .sort((a, b) => (b.p.dataHora || b.p.data || '').localeCompare(a.p.dataHora || a.p.data || '')) : [];
  const equips = _cqEquipsInsumo(p);
  const ans = _cqArr(p.analitoIds);
  const cjs = Object.values(cqState.config.conjuntosPreparo || {}).filter(c => c && c.ativo !== false && _cqConjuntoItens(c).some(x => x.produtoId === p.id));
  const emUso = preps.filter(x => !x.p.finalizado && x.p.situacao !== 'reprovado');

  const nAtv = lotes.filter(l => !_cqLoteInativo(l)).length;
  const ult = preps[0]?.p;
  const tipo = CQ_TIPOS_INSUMO[p.tipo] || p.tipo || '';
  const prox = lotes.filter(l => !_cqLoteInativo(l) && l.validade).map(l => l.validade).sort()[0];
  const proxDias = prox ? _cqPrepDias(hoje, prox) : null;
  const hero = `<div class="cq-pv-hero">
    <div class="cq-pv-hero-ico">${CQ_ICO.beaker}</div>
    <div class="cq-pv-hero-txt"><small>${_cqEsc(tipo)}</small><h3>${_cqEsc(p.nome)}</h3>
      <div class="cq-pv-chips">${_cqPvPill(_cqEsc(_cqSiglasUnidades(_cqUnidadesRec(p)) || 'Todas as áreas'), '', CQ_ICO.unidade)}
        ${p.fabricante ? _cqPvPill(_cqEsc(p.fabricante), '', CQ_ICO.cadastro) : ''}
        ${_cqPvPill(p.preparoInterno ? 'Preparado no laboratório' : 'Usado como recebido', p.preparoInterno ? 'ciano' : '', p.preparoInterno ? CQ_ICO.beaker : '')}</div></div>
    ${_cqPvPill(p.ativo === false ? 'Inativo' : 'Ativo', p.ativo === false ? 'cinza grande' : 'verde grande')}
  </div>`;
  const stats = `<div class="cq-pv-stats">
    ${_cqPvStat(CQ_ICO.cadastro, 'Lotes ativos', String(nAtv), `de ${lotes.length} cadastrado${lotes.length === 1 ? '' : 's'}`, nAtv ? '' : 'alerta')}
    ${p.preparoInterno ? _cqPvStat(CQ_ICO.beaker, 'Preparos em uso', String(emUso.length), `de ${preps.length} registrado${preps.length === 1 ? '' : 's'}`, preps.length && !emUso.length ? 'alerta' : '')
      : _cqPvStat(CQ_ICO.alerta, 'Próximo vencimento', prox ? _cqFmtData(prox) : '—', proxDias === null ? 'sem lote ativo' : proxDias < 0 ? `vencido há ${-proxDias} dia(s)` : `em ${proxDias} dia(s)`, proxDias !== null && proxDias < 0 ? 'perigo' : proxDias !== null && proxDias <= 30 ? 'alerta' : '')}
    ${p.preparoInterno ? _cqPvUltimoPrep(ult) : ''}
  </div>`;
  const secProd = _cqPvSecao(CQ_ICO.cadastro, 'Produto', _cqPvCampos([
    { l: 'Fabricante', v: _cqEsc(p.fabricante || '') },
    { l: 'Registro ANVISA', v: _cqEsc(p.regAnvisa || '') },
    { l: 'Equipamentos / sistemas', v: equips.length ? _cqEsc(equips.map(_cqRotuloEquip).join(', ')) : 'Qualquer equipamento', fraco: !equips.length },
    { l: 'Analitos', v: ans.length ? _cqEsc(ans.map(a => _cqAnalito(a)?.nome || '?').join(', ')) : 'Todos os analitos', fraco: !ans.length },
  ]));
  const secPrep = _cqPvSecao(CQ_ICO.beaker, 'Preparo no laboratório', p.preparoInterno ? `
    <div class="cq-pv-chips">
      ${prep.validadeDias ? _cqPvPill(`Validade de uso: ${prep.validadeDias} dia(s)`, 'ciano', CQ_ICO.clock) : _cqPvPill('Validade de uso não definida', 'cinza', CQ_ICO.clock)}
      ${prep.volume ? _cqPvPill(`Volume padrão: ${String(prep.volume).replace('.', ',')} ${prep.unidadeQtd || ''}`, '', CQ_ICO.beaker) : ''}
      ${prep.liberaSemCIQ ? _cqPvPill('Liberado no registro, sem CIQ', 'verde', CQ_ICO.check) : _cqPvPill('Liberado pela corrida de CIQ', '', CQ_ICO.lista)}
      ${prep.avisoDias != null ? _cqPvPill(`Avisa a troca ${prep.avisoDias} dia(s) antes`, 'ambar', CQ_ICO.alerta) : _cqPvPill('Sem aviso de troca', 'cinza', CQ_ICO.alerta)}
    </div>
    ${_cqPvCampos([
      { l: 'Armazenamento', v: _cqEsc(prep.armazenamento || ''), largo: true },
      { l: 'Concentração / especificação', v: _cqEsc(prep.especificacao || '') },
      { l: 'Riscos potenciais', v: _cqEsc(prep.riscos || '') },
      cjs.length && { l: 'Conjuntos de troca', v: cjs.map(c => _cqPvPill(_cqEsc(c.nome), 'contorno', CQ_ICO.repeat)).join(' '), largo: true },
    ])}` : '<div class="cq-pv-nota">Usado como recebido: não tem preparo, validade de uso nem aviso de troca.</div>');
  const geral = `<div class="cq-vw">${hero}${stats}${secProd}${secPrep}</div>`;

  const lotesHTML = _cqLotesCompactoHTML(lotes, 'cqInsumoVer', pode ? `<button class="btn btn-outline btn-sm cq-an-novo-teste" onclick="cqInsumoForm(null,{produtoId:'${p.id}'})">${CQ_ICO.plus} Novo lote</button>` : '');
  const prepsHTML = _cqPrepsAtivosInativosHTML(preps, true);

  cqDrawerOpen({
    titulo: p.nome, subtitulo: [CQ_TIPOS_INSUMO[p.tipo], p.fabricante, p.ativo === false ? 'inativo' : ''].filter(Boolean).join(' · ') || 'Produto', icone: 'beaker',
    corpo: `${_cqInativoNota(p, 'ativo', 'não é oferecido em testes novos')}${_cqAbasHTML('prodver', [
      { k: 'geral', rotulo: 'Geral', html: geral },
      { k: 'lotes', rotulo: `Lotes${lotes.length ? ` <span class="cq-step-qtd">${lotes.length}</span>` : ''}`, html: lotesHTML },
      preps.length && { k: 'preparos', rotulo: `Preparos <span class="cq-step-qtd">${preps.length}</span>`, html: prepsHTML },
      _cqAbaTrilha(p)], aba)}`,
    rodape: `<div>${_cqPodeExcluirCad('insumoProdutos') ? `<button class="btn btn-outline cq-btn-perigo" onclick="cqExcluirCadastro('insumoProdutos','${p.id}')">Excluir</button>` : ''}</div><div style="display:flex;gap:8px;"><button class="btn btn-outline" onclick="cqDrawerClose()">Fechar</button>
      ${_cqPodeEditarCad() ? `<button class="btn btn-primary" onclick="cqInsumoProdutoForm('${p.id}',{aba:document.querySelector('#cq-abas-prodver .ot-modal-tab-btn.active')?.dataset.aba})">${CQ_ICO.edit} Editar</button>` : ''}</div>`,
  });
}

// Preparo na lista das janelas de visualização (produto e lote); clique abre o detalhe
function _cqPrepItemHTML({ i, p: x }, comLote) {
  const hoje = _cqHoje();
  const venc = x.validade && x.validade < hoje && !x.finalizado;
  const sit = CQ_SITUACAO_PREPARO[x.situacao || 'em_avaliacao'] || {};
  return `<div class="cq-te-item${x.finalizado ? ' inativo' : ''}" onclick="cqPreparoInfo('${i.id}','${x.id}')" title="Abrir preparo">
    <div class="cq-te-item-txt"><b>${_cqEsc(x.codigo || 'Preparo de ' + _cqFmtData(x.data))}</b>
      <small>${_cqEsc([comLote ? `lote ${i.lote}` : '', `${_cqFmtData(x.data)}${x.responsavel ? ' · ' + x.responsavel : ''}`].filter(Boolean).join(' · '))} · <span class="${venc ? 'oc-vencido' : ''}">val. ${_cqFmtData(x.validade)}${venc ? ' (vencido)' : ''}</span>${x.conjunto ? ` · ${_cqEsc(x.conjunto.nome)}` : ''}</small></div>
    <span class="cq-badge ${x.finalizado ? 'cq-st-semalvo' : sit.cls || ''}">${_cqEsc(sit.label || '')}${x.finalizado ? ' · finalizado' : ''}</span>
    <svg class="cq-te-item-seta" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="9 6 15 12 9 18"/></svg></div>`;
}
function _cqPrepsAtivosInativosHTML(pares, comLote) {
  return _cqAtivosInativosHTML(pares, x => !!x.p.finalizado, x => _cqPrepItemHTML(x, comLote),
    { busca: { ph: 'Pesquisar código do preparo', chave: x => `${x.p.codigo || ''} ${x.i.lote || ''}` }, tAtivos: 'Não finalizados (em avaliação, liberados ou reprovados)', tInativos: 'Finalizados (consumidos, descartados ou substituídos)', vAtivos: 'Nenhum preparo ativo.', vInativos: 'Nenhum preparo finalizado.' });
}

// Visualização do lote de insumo (clique na linha): dados do lote e preparos (Ativos / Inativos).
// Editar abre o formulário (cqInsumoForm). Lote antigo, sem produto, abre direto o formulário para organizar.
function cqInsumoVer(id) {
  const i = cqState.config.insumos[id];
  if (!i) return;
  const prod = _cqProdutoInsumo(i);
  if (!prod) { cqInsumoForm(id); return; }
  const pode = _cqPodeEditarCad();
  const hoje = _cqHoje();
  const preps = i.preparoInterno ? _cqPreparosDe(i).map(x => ({ i, p: x })) : [];
  const emUso = preps.filter(x => !x.p.finalizado && x.p.situacao !== 'reprovado');
  const ult = preps[0]?.p;
  const dias = i.validade ? _cqPrepDias(hoje, i.validade) : null;
  const tipo = CQ_TIPOS_INSUMO[prod.tipo] || prod.tipo || '';
  const hero = `<div class="cq-pv-hero">
    <div class="cq-pv-hero-ico">${CQ_ICO.cadastro}</div>
    <div class="cq-pv-hero-txt"><small>Lote · ${_cqEsc(tipo)}</small><h3>${_cqEsc(i.lote)}</h3>
      <div class="cq-pv-chips"><button type="button" class="cq-pv-pill link" onclick="cqInsumoProdutoVer('${prod.id}')" title="Ver o produto">${CQ_ICO.beaker}${_cqEsc(prod.nome)}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="9 6 15 12 9 18"/></svg></button>
        ${_cqPvPill(_cqEsc(_cqSiglasUnidades(_cqUnidadesRec(i)) || 'Todas as áreas'), '', CQ_ICO.unidade)}
        ${prod.fabricante ? _cqPvPill(_cqEsc(prod.fabricante), '', CQ_ICO.cadastro) : ''}</div></div>
    <div class="cq-pv-hero-sit">${_cqLoteSituacaoBadge(i, hoje)}${pode ? _cqLoteUsoBtn(i, hoje, 'ver') : ''}</div>
  </div>`;
  const stats = `<div class="cq-pv-stats">
    ${_cqPvStat(CQ_ICO.calendario, 'Validade do lote', i.validade ? _cqFmtData(i.validade) : '—',
      dias === null ? 'não informada' : dias < 0 ? `vencido há ${-dias} dia(s)` : dias === 0 ? 'vence hoje' : `faltam ${dias} dia(s)`,
      dias === null ? '' : dias < 0 ? 'perigo' : dias <= 30 ? 'alerta' : 'ok')}
    ${i.preparoInterno ? _cqPvStat(CQ_ICO.beaker, 'Preparos em uso', String(emUso.length), `de ${preps.length} registrado${preps.length === 1 ? '' : 's'}`) : ''}
    ${i.preparoInterno ? _cqPvUltimoPrep(ult) : ''}
  </div>`;
  const secLote = _cqPvSecao(CQ_ICO.cadastro, 'Lote', _cqPvCampos([
    { l: 'Produto', v: `${_cqEsc(prod.nome)} <small>${_cqEsc(tipo)}</small>` },
    i.preparoInterno && { l: 'Uso do preparo', v: i.preparoUsoUnico ? 'Uso único: um preparo novo a cada corrida' : 'Um preparo serve a várias corridas' },
    { l: 'Cadastrado em', v: i.criadoEm ? `${_cqFmtDH(i.criadoEm)}${i.criadoPor?.porNome ? ` <small>por ${_cqEsc(i.criadoPor.porNome)}</small>` : ''}` : '' },
    i.atualizadoEm && i.atualizadoEm !== i.criadoEm && { l: 'Última alteração', v: _cqFmtDH(i.atualizadoEm) },
  ]));
  const obs = String(i.observacoes || '').trim();
  const secObs = _cqPvSecao(CQ_ICO.lista, 'Observações', obs ? `<div class="cq-pv-obs">${_cqEsc(obs)}</div>` : '<div class="cq-pv-nota">Nenhuma observação.</div>');
  const geral = `<div class="cq-vw">${hero}${_cqEncerradoAutoNota(i)}${stats}${secLote}${secObs}</div>`;
  cqDrawerOpen({
    titulo: `${prod.nome} · lote ${i.lote}`, subtitulo: [CQ_TIPOS_INSUMO[prod.tipo], `val. ${_cqFmtData(i.validade)}`].filter(Boolean).join(' · '), icone: 'beaker',
    corpo: _cqVoltarHTML(prod.nome, `cqInsumoProdutoVer('${prod.id}','lotes')`, 'Voltar para o produto') + _cqAbasHTML('insver', [
      { k: 'geral', rotulo: 'Geral', html: geral },
      preps.length && { k: 'preparos', rotulo: `Preparos <span class="cq-step-qtd">${preps.length}</span>`, html: _cqPrepsAtivosInativosHTML(preps, false) },
      _cqAbaTrilha(i)]),
    rodape: `<div>${_cqPodeExcluirCad('insumos') ? `<button class="btn btn-outline cq-btn-perigo" onclick="cqExcluirCadastro('insumos','${i.id}')">Excluir</button>` : ''}</div><div style="display:flex;gap:8px;"><button class="btn btn-outline" onclick="cqDrawerClose()">Fechar</button>
      ${pode ? `<button class="btn btn-primary" onclick="cqInsumoForm('${i.id}',{aba:document.querySelector('#cq-abas-insver .ot-modal-tab-btn.active')?.dataset.aba})">${CQ_ICO.edit} Editar</button>` : ''}</div>`,
  });
}

// Analitos oferecidos no produto: os vinculados ao equipamento (todos sem equipamento) + os já marcados
function _cqOpcoesAnalitosEquip(equips, manter) {
  const fica = new Set(_cqArr(manter));
  const chaves = new Set(_cqArr(equips).map(_cqEquipChave));
  return Object.values(cqState.config.analitos)
    .filter(a => fica.has(a.id) || (a.ativo !== false && _cqNaUnidade(a) && (!chaves.size || _cqEquipsDoAnalito(a).some(o => chaves.has(_cqEquipChave(o.value))))))
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .map(a => ({ value: a.id, label: a.nome, sub: [a.codigo, a.unidadeMedida || CQ_TIPOS_ANALITO[a.tipo] || ''].filter(Boolean).join(' · ') }));
}
function cqInsumoEquipChange(equips) {
  _cqMultiOpcoes('cq-ins-an', _cqOpcoesAnalitosEquip(equips, []));
  const esc = document.getElementById('cq-ins-an-escopo');
  if (esc) esc.textContent = _cqArr(equips).length ? '(vazio = todos dos equipamentos)' : '(vazio = todos)';
}

// Setores das áreas escolhidas no produto (grupo = sigla da área)
function _cqInsSetoresOps(unidadeIds) {
  const ops = [], vistos = new Set();
  _cqArr(unidadeIds).map(id => cqState.config.unidades[id]).filter(Boolean).forEach(un => _cqSetoresDaUnidade(un.id).forEach(st => {
    if (vistos.has(st.id)) return;
    vistos.add(st.id);
    ops.push({ value: st.id, label: _cqRotuloSetor(st.id), grupo: un.sigla || '' });
  }));
  return ops;
}
function cqInsSetoresAreas(unidadeIds) { _cqMultiOpcoes('cq-ins-setores', _cqInsSetoresOps(unidadeIds)); }
async function cqInsumoProdutoSalvar() {
  if (_cqSalvando || !_cqPodeEditarCad(!!_cqInsProdFormId)) return;
  const antes = _cqInsProdFormId ? cqState.config.insumoProdutos[_cqInsProdFormId] : null;
  const nome = _cqVal('cq-ins-nome'), tipo = _cqVal('cq-ins-tipo') || 'reagente', fabricante = _cqVal('cq-ins-fab');
  if (!nome) { showToast('Informe o nome do produto.', 'error'); return; }
  const preparoInterno = _cqChk('cq-ins-prep');
  const diasTxt = _cqVal('cq-ins-prep-dias');
  const preparo = preparoInterno ? {
    especificacao: _cqVal('cq-ins-prep-esp'), armazenamento: _cqVal('cq-ins-prep-arm'), riscos: _cqVal('cq-ins-prep-risco'),
    validadeDias: diasTxt === '' ? null : Math.max(1, Math.round(Number(diasTxt)) || 0) || null,
    // Volume padrão: vem preenchido no registro do preparo e na troca (pode ser ajustado lá)
    ...(Number(_cqVal('cq-ins-prep-vol').replace(',', '.')) > 0 ? { volume: Number(_cqVal('cq-ins-prep-vol').replace(',', '.')) } : {}),
    // Unidade padrão vale mesmo sem volume (vem selecionada no preparo); 'mL' de produto antigo não é gravado à toa
    ...(_cqVal('cq-ins-prep-vol') || _cqVal('cq-ins-prep-un') !== 'mL' || antes?.preparo?.unidadeQtd ? { unidadeQtd: _cqVal('cq-ins-prep-un') || 'mL' } : {}),
    // Só gravados quando ligados: produto antigo salvo sem mudança não acusa diferença
    ...(_cqChk('cq-ins-prep-livre') ? { liberaSemCIQ: true } : {}),
    ...(_cqChk('cq-ins-prep-aviso') ? { avisoDias: Math.max(0, Math.round(Number(_cqVal('cq-ins-prep-aviso-dias'))) || 0) } : {}),
  } : null;
  if (preparo && !preparo.armazenamento) { showToast('Preparo interno: informe o armazenamento (RDC 978, art. 101).', 'error'); return; }
  const norm = x => _cqNormBusca(String(x || '').trim());
  if (!antes) {
    const dup = Object.values(cqState.config.insumoProdutos).find(x => x.tipo === tipo && norm(x.nome) === norm(nome) && norm(x.fabricante) === norm(fabricante));
    if (dup) { if (!_cqOferecerAssociar('insumoProdutos', dup, `${dup.nome}${dup.fabricante ? ' — ' + dup.fabricante : ''}`)) showToast('Produto já cadastrado (mesmo tipo, nome e fabricante).', 'error'); return; }
  }
  const equips = _cqMultiVal('cq-ins-equip'), analitoIds = _cqMultiVal('cq-ins-an');
  // Testes que controlam o produto: o tipo não muda e o produto continua servindo ao analito e ao equipamento deles
  if (antes) {
    const testes = Object.values(cqState.config.testes).filter(t => t.insumoProdutoId === antes.id);
    if (testes.length && tipo !== antes.tipo) { showToast(`Produto controlado pelos testes ${testes.map(_cqNomeTeste).join('; ')}: o tipo não pode mudar.`, 'error'); return; }
    const fora = testes.filter(t => !_cqMaterialServe({ equips, analitoIds }, _cqEquipDoTeste(t), t.analitoId)).map(t => `${_cqNomeTeste(t)} · ${_cqEquipTeste(t)}`);
    if (fora.length) { showToast(`Produto controlado pelos testes ${fora.join('; ')}. Mantenha esses equipamentos/sistemas e analitos.`, 'error'); return; }
  }
  const unidadeIds = _cqUnidadesCapturar('cq-ins-un', 'insumoProdutos', antes);
  if (!unidadeIds) return;
  // Lotes do produto não podem ficar em unidades que o produto deixou
  const lotesFora = antes ? _cqLotesDoProduto(antes.id).filter(l => _cqUnidadesRec(l).some(x => !unidadeIds.includes(x))) : [];
  if (lotesFora.length) { showToast(`Lote(s) ${lotesFora.map(l => l.lote).join(', ')} deste produto estão em áreas que você removeu. Ajuste os lotes antes.`, 'error'); return; }
  const rec = { ...(antes || {}), id: _cqInsProdFormId || _cqUid(), tipo, nome, fabricante, regAnvisa: _cqVal('cq-ins-anvisa'),
                equips, analitoIds, setorIds: document.getElementById('cq-ins-setores') ? _cqMultiVal('cq-ins-setores') : _cqArr(antes?.setorIds),
                preparoInterno, preparo, unidadeIds, ativo: _cqChk('cq-ins-ativo') };
  if (!antes) { rec.criadoEm = _cqAgora(); rec.criadoPor = _cqAssinatura(); }
  const fmt = { tipo: v => CQ_TIPOS_INSUMO[v] || v, analitoIds: v => _cqArr(v).map(a => _cqAnalito(a)?.nome || a).join(', ') || 'Todos',
                equips: v => _cqArr(v).map(_cqRotuloEquip).join(', ') || 'Qualquer', setorIds: v => _cqArr(v).map(_cqRotuloSetor).join(', ') || '—', unidadeIds: _cqSiglasUnidades, preparoInterno: v => v ? 'Sim' : 'Não',
                preparo: _cqFmtPreparo, ativo: v => v === false ? 'Não' : 'Sim' };
  const diffs = antes ? _cqDiff(antes, rec, CQ_LBL_INS_PRODUTO, fmt) : [];
  if (antes && !diffs.length) { cqDrawerClose(); return; }
  _cqTrilhaAdd(rec, antes ? 'edicao' : 'criacao', antes ? 'Produto alterado' : 'Produto cadastrado', diffs);
  _cqSalvando = true;
  try {
    if (await _cqSalvarRegistro('insumoProdutos', rec)) {
      cqRender();
      if (antes) { showToast('Produto salvo.', 'success'); cqDrawerClose(); }
      else { showToast('Produto salvo. Cadastre agora o lote em uso.', 'success'); cqInsumoForm(null, { produtoId: rec.id }); }
    }
  } finally { _cqSalvando = false; }
}

// ── REAGENTES, MEIOS E INSUMOS: LOTE ─────────────────────────
let _cqInsumoFormId = null;
const CQ_LBL_INSUMO = { produtoId: 'Produto', lote: 'Lote', validade: 'Validade', status: 'Situação', preparoUsoUnico: 'Preparo de uso único', observacoes: 'Observações', unidadeIds: 'Áreas' };

function cqInsumoForm(id, opts = {}) {
  const i = id ? cqState.config.insumos[id] : null;
  const pode = i ? _cqPodeEditarCad() : _cqPodeCriarLote();
  _cqInsumoFormId = id || null;
  const prodAtual = _cqProdutoInsumo(i);
  const legado = !!i && !prodAtual;
  const norm = x => _cqNormBusca(String(x || '').trim());
  const prods = Object.values(cqState.config.insumoProdutos).filter(p => p.id === prodAtual?.id || (p.ativo !== false && _cqNaUnidade(p)))
    .sort((a, b) => (CQ_TIPOS_INSUMO[a.tipo] || '').localeCompare(CQ_TIPOS_INSUMO[b.tipo] || '') || a.nome.localeCompare(b.nome, 'pt'));
  if (!prods.length) {
    if (legado) showToast('Lote antigo: cadastre antes o produto ou use “Organizar lote(s) antigo(s)”.', 'error');
    else showToast('Cadastre antes o produto (reagente, meio de cultura, corante…).', 'error');
    if (!legado) return;
  }
  // Lote antigo: sugere o produto de mesmo tipo e nome, se houver um só
  const sugerido = legado ? prods.filter(p => p.tipo === i.tipo && norm(p.nome) === norm(i.nome)) : [];
  const pid = prodAtual?.id || opts.produtoId || (sugerido.length === 1 ? sugerido[0].id : '');
  const p0 = cqState.config.insumoProdutos[pid];
  const porTipo = {};
  prods.forEach(p => { (porTipo[p.tipo] = porTipo[p.tipo] || []).push(p); });
  const opsProd = Object.entries(porTipo).map(([t, ps]) => `<optgroup label="${_cqEsc(CQ_TIPOS_INSUMO[t] || t)}">${ps.map(p => `<option value="${p.id}" ${p.id === pid ? 'selected' : ''}>${_cqEsc(p.nome)}${p.fabricante ? ' — ' + _cqEsc(p.fabricante) : ''}</option>`).join('')}</optgroup>`).join('');
  cqDrawerOpen({
    titulo: i ? `${i.nome} · lote ${i.lote}` : 'Novo lote', subtitulo: p0 ? `${CQ_TIPOS_INSUMO[p0.tipo] || ''} · ${p0.nome}` : 'Reagentes, calibradores, meios de cultura e corantes usados nas corridas', icone: 'beaker',
    corpo: (() => { const pv = prodAtual || cqState.config.insumoProdutos[opts.produtoId]; return pv ? _cqVoltarHTML(pv.nome, `cqInsumoProdutoVer('${pv.id}','lotes')`, 'Voltar para o produto') : ''; })() + _cqAbasHTML('ins', [{ k: 'dados', rotulo: 'Lote', html: `
      ${_cqEncerradoAutoNota(i)}
      ${legado ? `<div class="cq-alerta-box">${CQ_ICO.alerta} Lote cadastrado antes da separação entre produto e lote: ${_cqEsc(CQ_TIPOS_INSUMO[i.tipo] || i.tipo)} “${_cqEsc(i.nome)}”${i.fabricante ? `, ${_cqEsc(i.fabricante)}` : ''}${_cqEquipsInsumo(i).length ? `, ${_cqEsc(_cqEquipsInsumo(i).map(_cqRotuloEquip).join(', '))}` : ''}${_cqArr(i.analitoIds).length ? `, analitos ${_cqEsc(_cqArr(i.analitoIds).map(a => _cqAnalito(a)?.nome || '?').join(', '))}` : ''}.
        Escolha o produto correspondente: o lote passa a seguir o cadastro dele (equipamentos, analitos e preparo).</div>` : ''}
      <div class="form-section"><div class="form-section-title">${CQ_ICO.beaker}Lote</div>
        <div class="form-field"><label class="field-label">Produto <span class="required">*</span></label>
          <select id="cq-ins-prod" class="field-select" onchange="cqInsumoProdChange()" ${prodAtual || !pode ? 'disabled' : ''}>${pid ? '' : '<option value="">— Selecione o produto —</option>'}${opsProd}</select>
          ${prodAtual ? '<div class="cq-nota">O produto não muda depois do cadastro do lote. Lote no produto errado: encerre-o (ou exclua, se não tiver lançamentos) e cadastre-o no produto certo.</div>' : ''}</div>
        <div class="form-row">
          <div class="form-field"><label class="field-label">Lote <span class="required">*</span></label><input type="text" id="cq-ins-lote" class="field-input" maxlength="60" value="${_cqEsc(i?.lote)}" placeholder="Ex.: 610061" ${i || !pode ? 'disabled' : ''}></div>
          <div class="form-field"><label class="field-label">Validade <span class="required">*</span></label><input type="date" id="cq-ins-val" class="field-input" value="${_cqEsc(i?.validade)}" ${_cqRo(pode)}></div>
        </div>
        <div class="form-row cq-sit-linha">
          <div class="form-field"><label class="field-label">Situação</label>${_cqSitPopHTML('cq-ins-status', i?.status || 'em_uso', pode)}
            <div class="cq-nota">Vencido o lote, passa a “Encerrado” automaticamente.</div></div>
          <div class="form-field" id="cq-ins-unico-wrap" style="${p0?.preparoInterno ? '' : 'display:none;'}"><label class="field-label">Preparo</label>
            ${_cqToggleHTML('cq-ins-unico', !!i?.preparoUsoUnico, 'Uso único', 'Um preparo novo a cada corrida', 'Um preparo serve a várias corridas', pode)}</div>
        </div>
        ${_cqUnidadesCampoHTML('cq-ins-un', i, pode, 'Áreas que usam este lote (precisam estar entre as do produto). O lote só é oferecido nos lançamentos delas.', 'insumos')}
        <div class="form-field"><label class="field-label">Observações</label><textarea id="cq-ins-obs" class="field-textarea" style="min-height:50px;" ${_cqRo(pode)}>${_cqEsc(i?.observacoes)}</textarea></div>
      </div>
` }, i?.preparoInterno && { k: 'preparos', rotulo: `Preparos${_cqPreparosDe(i).length ? ` <span class="cq-step-qtd">${_cqPreparosDe(i).length}</span>` : ''}`, html: _cqPreparosHistoricoHTML(i) },
      _cqAbaTrilha(i)], opts.aba),
    rodape: _cqRodapeForm('cqInsumoSalvar()', pode, i ? `cqExcluirCadastro('insumos','${i.id}')` : ''),
  });
}

// Uso único só faz sentido em produto preparado no laboratório
function cqInsumoProdChange() {
  const w = document.getElementById('cq-ins-unico-wrap');
  if (w) w.style.display = cqState.config.insumoProdutos[_cqVal('cq-ins-prod')]?.preparoInterno ? '' : 'none';
}

async function cqInsumoSalvar() {
  if (_cqSalvando || !(_cqInsumoFormId ? _cqPodeEditarCad() : _cqPodeCriarLote())) return;
  const antes = _cqInsumoFormId ? cqState.config.insumos[_cqInsumoFormId] : null;
  const cruA = antes ? _cqLoteCru(antes) : null;
  // Produto fixo depois do cadastro do lote (lote antigo, sem produto, escolhe uma vez)
  const produtoId = cruA?.produtoId && cqState.config.insumoProdutos[cruA.produtoId] ? cruA.produtoId : _cqVal('cq-ins-prod');
  const prod = cqState.config.insumoProdutos[produtoId];
  const lote = antes ? antes.lote : _cqVal('cq-ins-lote'), validade = _cqVal('cq-ins-val');
  if (!prod) { showToast('Selecione o produto.', 'error'); return; }
  if (!lote || !validade) { showToast('Informe lote e validade.', 'error'); return; }
  const norm = x => _cqNormBusca(String(x || '').trim());
  const dup = Object.values(cqState.config.insumos).find(x => x.id !== antes?.id && _cqLoteCru(x).produtoId === produtoId && norm(x.lote) === norm(lote));
  if (dup) { if (antes || !_cqOferecerAssociar('insumos', dup, `${prod.nome} — lote ${dup.lote}`)) showToast('Lote já cadastrado para este produto.', 'error'); return; }
  const unidadeIds = _cqUnidadesCapturar('cq-ins-un', 'insumos', antes);
  if (!unidadeIds) return;
  const foraProd = _cqUnidadesRec(prod).length ? unidadeIds.filter(x => !_cqUnidadesRec(prod).includes(x)) : [];
  if (foraProd.length) { showToast(`O produto ${prod.nome} não está associado à(s) área(s) ${_cqSiglasUnidades(foraProd)}. Associe o produto antes.`, 'error'); return; }
  // O registro do lote guarda só os dados do lote; os do produto vêm do cadastro dele.
  // Lote antigo: data/responsável do preparo do cadastro viram `preparoLegado` (primeiro preparo no próximo uso).
  const base = { ...(cruA || {}) };
  CQ_CAMPOS_PRODUTO.forEach(k => { delete base[k]; });
  delete base.ativoId;
  if (cruA && !cruA.produtoId && cruA.preparo?.data && !cruA.preparoLegado) base.preparoLegado = { data: cruA.preparo.data, responsavel: cruA.preparo.responsavel || '' };
  const rec = { ...base, id: _cqInsumoFormId || _cqUid(), produtoId, lote, validade, status: _cqVal('cq-ins-status') || 'em_uso',
                observacoes: _cqVal('cq-ins-obs'), unidadeIds, preparoUsoUnico: !!prod.preparoInterno && _cqChk('cq-ins-unico') };
  if (rec.status !== 'encerrado') delete rec.encerradoAuto;   // reaberto: o gatilho volta a valer
  if (!antes) { rec.criadoEm = _cqAgora(); rec.criadoPor = _cqAssinatura(); }
  const fmt = { produtoId: v => cqState.config.insumoProdutos[v]?.nome || v, status: v => CQ_STATUS_LOTE[v]?.label || v, unidadeIds: _cqSiglasUnidades, preparoUsoUnico: v => v ? 'Sim' : 'Não' };
  const diffs = antes ? _cqDiff(cruA, rec, CQ_LBL_INSUMO, fmt) : [];
  if (antes && !diffs.length) { cqDrawerClose(); return; }
  const legado = antes && !cruA.produtoId;
  _cqTrilhaAdd(rec, antes ? 'edicao' : 'criacao', !antes ? 'Lote de insumo cadastrado'
    : legado ? `Lote organizado no produto ${prod.nome} (antes: ${[CQ_TIPOS_INSUMO[cruA.tipo] || cruA.tipo, cruA.nome, cruA.fabricante, _cqEquipsInsumo(cruA).map(_cqRotuloEquip).join(', '), _cqArr(cruA.analitoIds).map(a => _cqAnalito(a)?.nome || a).join(', '), cruA.preparoInterno ? 'preparo: ' + _cqFmtPreparo(cruA.preparo) : ''].filter(Boolean).join(' · ')})`
    : 'Lote de insumo alterado', diffs);
  _cqSalvando = true;
  try {
    if (await _cqSalvarRegistro('insumos', rec)) { showToast('Lote salvo.', 'success'); cqDrawerClose(); cqRender(); }
  } finally { _cqSalvando = false; }
}

// ── ORGANIZAR LOTES ANTIGOS EM PRODUTOS ──────────────────────
// Antes, cada lote trazia tipo, nome, fabricante, equipamentos, analitos e preparo. Lotes com o mesmo
// tipo, nome, equipamentos/sistemas, analitos e preparo interno formam um produto; diferença em algum
// desses campos (que decidem em quais testes o lote é oferecido) gera produtos separados, para não
// mudar o que o lançamento oferece. Fabricante/ANVISA/dados do preparo divergentes: vale o lote mais recente.
function _cqInsumosLegados() { return Object.values(cqState.config.insumos).filter(i => !_cqProdutoInsumo(i)); }

function cqInsumosOrganizar() {
  if (!_cqCan('configurar')) return;
  const legados = _cqInsumosLegados();
  if (!legados.length) { showToast('Não há lotes antigos para organizar.', 'success'); return; }
  const norm = x => _cqNormBusca(String(x || '').trim());
  const chave = x => [x.tipo || 'reagente', norm(x.nome), _cqEquipsInsumo(x).map(_cqEquipChave).sort().join(','), _cqArr(x.analitoIds).slice().sort().join(','), x.preparoInterno ? 1 : 0].join('|');
  const grupos = new Map();
  legados.forEach(i => { const k = chave(i); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(i); });
  const existentes = Object.values(cqState.config.insumoProdutos);
  const plano = [...grupos.entries()].map(([k, ls]) => {
    ls.sort((a, b) => (b.validade || '').localeCompare(a.validade || '') || (b.criadoEm || '').localeCompare(a.criadoEm || ''));
    const ref = ls[0];
    const prim = c => ls.map(i => String(i[c] || '').trim()).find(Boolean) || '';
    const distintos = c => [...new Set(ls.map(i => String(i[c] || '').trim()).filter(Boolean))];
    const conflitos = [['fabricante', 'Fabricante'], ['regAnvisa', 'Registro ANVISA']].filter(([c]) => distintos(c).length > 1).map(([c, l]) => `${l}: ${distintos(c).join(' / ')} — vale “${prim(c)}”`);
    let preparo = null;
    if (ref.preparoInterno) {
      const pr = ls.map(i => i.preparo).find(x => x && (x.armazenamento || x.especificacao)) || ref.preparo || {};
      preparo = { especificacao: pr.especificacao || '', armazenamento: pr.armazenamento || '', riscos: pr.riscos || '', validadeDias: pr.validadeDias ?? null };
      if (new Set(ls.map(i => _cqFmtPreparo({ ...i.preparo, data: null }))).size > 1) conflitos.push(`Dados do preparo diferentes entre os lotes — vale “${_cqFmtPreparo(preparo)}”`);
    }
    // Lote sem unidade aparece em todas: o produto também fica sem unidade
    const us = ls.some(_cqSemUnidade) ? [] : [...new Set(ls.flatMap(_cqUnidadesRec))];
    const ex = existentes.find(p => chave(p) === k) || null;
    const addUs = ex && _cqUnidadesRec(ex).length ? (us.length ? us.filter(x => !_cqUnidadesRec(ex).includes(x)) : null) : [];
    const prod = ex || { id: _cqUid(), tipo: ref.tipo || 'reagente', nome: String(ref.nome || '').trim(), fabricante: prim('fabricante'), regAnvisa: prim('regAnvisa'),
                         equips: _cqEquipsInsumo(ref), analitoIds: _cqArr(ref.analitoIds), preparoInterno: !!ref.preparoInterno, preparo, unidadeIds: us, ativo: true };
    return { ls, ex, addUs, prod, conflitos };
  }).sort((a, b) => (a.prod.nome || '').localeCompare(b.prod.nome || '', 'pt'));
  const nomesRepetidos = new Set(plano.map(x => norm(x.prod.nome)).filter((n, i, arr) => arr.indexOf(n) !== i));
  // Testes que guardam só o nome do produto: vinculados quando um único produto do plano (ou existente) serve a eles
  const candidatos = [...existentes, ...plano.filter(x => !x.ex).map(x => x.prod)];
  const testesVinc = Object.values(cqState.config.testes).filter(t => t.insumoProduto && !cqState.config.insumoProdutos[t.insumoProdutoId]).map(t => {
    let c = candidatos.filter(p => p.tipo === t.insumoTipo && norm(p.nome) === norm(t.insumoProduto) && _cqMaterialServe(p, _cqEquipDoTeste(t), t.analitoId) && (_cqSemUnidade(p) || _cqUnidadesRec(p).includes(t.unidadeId)));
    // Mais de um: fica o que tem lote não encerrado na unidade do teste
    if (c.length > 1) {
      const lotesDe = p => [..._cqLotesDoProduto(p.id), ...(plano.find(x => x.prod === p)?.ls || [])];
      c = c.filter(p => lotesDe(p).some(l => l.status !== 'encerrado' && _cqNaUnidade(l, t.unidadeId)));
    }
    return c.length === 1 ? { t, p: c[0] } : null;
  }).filter(Boolean);
  const nNovos = plano.filter(x => !x.ex).length;
  const corpo = `<div class="cq-nota">Cada produto passa a concentrar tipo, fabricante, ANVISA, equipamentos/sistemas, analitos e preparo; o lote fica com número, validade, situação, áreas e preparos.
      Lotes de mesmo nome com equipamentos, analitos ou preparo diferentes viram produtos separados, para não mudar o que é oferecido nos lançamentos.
      Os ids dos lotes não mudam: corridas, resultados e preparos já lançados continuam ligados a eles. Tudo fica registrado na rastreabilidade.</div>
    ${plano.map(x => `<details class="cq-assoc-sec" ${x.conflitos.length || nomesRepetidos.has(norm(x.prod.nome)) ? 'open' : ''}><summary><b>${_cqEsc(x.prod.nome)}</b> · ${_cqEsc(CQ_TIPOS_INSUMO[x.prod.tipo] || x.prod.tipo)} · ${x.ls.length} lote(s)
        ${x.ex ? ' <span class="cq-badge cq-st-aceito">produto existente</span>' : ' <span class="cq-badge cq-st-pendente">novo produto</span>'}${x.conflitos.length ? ' <span class="cq-badge cq-st-alerta">revisar</span>' : ''}</summary>
      <div class="cq-assoc-item"><span>Equipamentos / analitos</span><b>${_cqEsc([_cqEquipsInsumo(x.prod).map(_cqRotuloEquip).join(', ') || 'Qualquer equipamento', _cqArr(x.prod.analitoIds).map(a => _cqAnalito(a)?.nome || '?').join(', ') || 'todos os analitos'].join(' · '))}</b></div>
      ${!x.ex ? `<div class="cq-assoc-item"><span>Fabricante / áreas</span><b>${_cqEsc([x.prod.fabricante || '—', _cqUnidadesRec(x.prod).length ? _cqSiglasUnidades(_cqUnidadesRec(x.prod)) : 'todas (sem área)'].join(' · '))}</b></div>` : ''}
      ${x.addUs?.length ? `<div class="cq-assoc-item"><span>Produto passa a valer também em</span><b>${_cqEsc(_cqSiglasUnidades(x.addUs))}</b></div>` : ''}
      ${x.ls.map(l => `<div class="cq-assoc-item"><span>Lote ${_cqEsc(l.lote)} · val. ${_cqFmtData(l.validade)}</span><b>${_cqEsc(CQ_STATUS_LOTE[l.status || 'em_uso']?.label || l.status)}</b></div>`).join('')}
      ${x.conflitos.map(c => `<div class="cq-nota cq-txt-amarelo">${_cqEsc(c)}</div>`).join('')}
      ${nomesRepetidos.has(norm(x.prod.nome)) ? '<div class="cq-nota cq-txt-amarelo">Há outro produto com este nome e configuração diferente. Se for o mesmo produto, depois ajuste equipamentos/analitos e mova os lotes pelo cadastro do lote.</div>' : ''}
    </details>`).join('')}
    ${testesVinc.length ? `<div class="cq-nota" style="margin-top:10px;">${testesVinc.length} teste(s) passarão a apontar para o produto pelo cadastro (não só pelo nome): ${_cqEsc(testesVinc.map(x => _cqNomeTeste(x.t)).join('; '))}.</div>` : ''}`;
  _cqPrompt({
    titulo: 'Organizar lotes antigos em produtos', subtitulo: `${legados.length} lote(s) → ${plano.length} produto(s) (${nNovos} novo(s))`, corpo, confirmar: 'Organizar',
    onConfirm: async () => {
      if (!_cqPodeGravar()) return false;
      const updates = {};
      const agora = _cqAgora();
      const C = CQ_KEYS.config;
      plano.forEach(x => {
        if (!x.ex) {
          const rec = { ...x.prod, criadoEm: agora, criadoPor: _cqAssinatura(), atualizadoEm: agora };
          _cqTrilhaAdd(rec, 'migracao', `Produto criado a partir de ${x.ls.length} lote(s) antigo(s): ${x.ls.map(l => l.lote).join(', ')}${x.conflitos.length ? '. ' + x.conflitos.join('; ') : ''}`);
          updates[`${C}/insumoProdutos/${rec.id}`] = rec;
        } else {
          const ps = `${C}/insumoProdutos/${x.ex.id}`;
          if (x.addUs === null) updates[`${ps}/unidadeIds`] = [];
          else if (x.addUs.length) updates[`${ps}/unidadeIds`] = [..._cqUnidadesRec(x.ex), ...x.addUs];
          updates[`${ps}/atualizadoEm`] = agora;
          updates[`${ps}/trilha/${_cqTk()}${x.ex.id.slice(-3)}`] = _cqTrilhaEntry('migracao', `Recebeu ${x.ls.length} lote(s) antigo(s): ${x.ls.map(l => l.lote).join(', ')}${x.addUs === null ? '; passa a valer em todas as áreas (lote sem área)' : x.addUs.length ? `; passa a valer também em ${_cqSiglasUnidades(x.addUs)}` : ''}`);
        }
        x.ls.forEach(l => {
          const cru = _cqLoteCru(l);
          const pl = `${C}/insumos/${l.id}`;
          updates[`${pl}/produtoId`] = x.prod.id;
          CQ_CAMPOS_PRODUTO.forEach(k => { updates[`${pl}/${k}`] = null; });
          updates[`${pl}/ativoId`] = null;
          if (cru.preparo?.data && !cru.preparoLegado) updates[`${pl}/preparoLegado`] = { data: cru.preparo.data, responsavel: cru.preparo.responsavel || '' };
          updates[`${pl}/atualizadoEm`] = agora;
          updates[`${pl}/trilha/${_cqTk()}${l.id.slice(-3)}`] = _cqTrilhaEntry('migracao', `Lote organizado no produto ${x.prod.nome} (antes no lote: ${[CQ_TIPOS_INSUMO[cru.tipo] || cru.tipo, cru.nome, cru.fabricante, cru.regAnvisa ? 'ANVISA ' + cru.regAnvisa : '', _cqEquipsInsumo(cru).map(_cqRotuloEquip).join(', '), _cqArr(cru.analitoIds).map(a => _cqAnalito(a)?.nome || a).join(', '), cru.preparoInterno ? 'preparo: ' + _cqFmtPreparo(cru.preparo) : ''].filter(Boolean).join(' · ')})`);
        });
      });
      testesVinc.forEach(({ t, p }) => {
        const pt = `${C}/testes/${t.id}`;
        updates[`${pt}/insumoProdutoId`] = p.id;
        updates[`${pt}/trilha/${_cqTk()}${t.id.slice(-3)}`] = _cqTrilhaEntry('migracao', `Produto controlado vinculado ao cadastro do produto ${p.nome}`);
      });
      updates[`${C}/migracoes/insumoProdutos`] = { em: agora, porNome: _cqSess().nome, versao: CQ_VERSAO, lotes: legados.length, produtos: nNovos };
      if (!(await window.dbUpdate(updates))) { showToast('Falha ao gravar. Nada foi alterado.', 'error'); return false; }
      showToast(`${legados.length} lote(s) organizados em ${plano.length} produto(s).`, 'success');
      cqRender();
      return true;
    },
  });
}

// ── PREPAROS DE INSUMO (RDC 978, art. 101) ───────────────────
// insumos/{id}/preparos/{pid}: { data, responsavel, validade, situacao, avaliacao, corridas:{ck:…} }.
// O preparo nasce no lançamento; a primeira decisão sobre uma corrida que o usa o libera ou reprova.
const CQ_SITUACAO_PREPARO = {
  em_avaliacao: { label: 'Em avaliação', cls: 'cq-st-pendente' }, liberado: { label: 'Liberado', cls: 'cq-st-aceito' }, reprovado: { label: 'Reprovado', cls: 'cq-st-rejeitado' },
};
function _cqSomarDias(iso, dias) {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + dias));
  return d.toISOString().slice(0, 10);
}
// Validade do preparado: data + dias do cadastro, limitada à validade do produto
function _cqPrepValidade(ins, data) {
  const dias = Number(ins?.preparo?.validadeDias);
  if (!data || !(dias > 0)) return ins?.validade || null;
  const v = _cqSomarDias(data, dias);
  return ins?.validade && ins.validade < v ? ins.validade : v;
}
// Validade escolhida para um preparo (no registro ou na retificação). Regras: não antes da data do preparo,
// nunca além da validade do lote (art. 102), prolongar além da referência só quem configura o CQ e preparo
// já vencido não é prolongado. ref = validade padrão (registro) ou a atual (retificação). Retorna o erro ou ''.
function _cqPrepValidadeErro({ nova, dia, max, ref, vencido }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nova || '')) return 'Informe a validade do preparo.';
  if (dia && nova < dia) return 'A validade não pode ser anterior à data do preparo.';
  if (max && nova > max) return `A validade do preparo é limitada à do lote (${_cqFmtData(max)}).`;
  if (ref && nova > ref) {
    if (vencido) return 'Preparo vencido não pode ter a validade prolongada. Registre um novo preparo.';
    if (!_cqCan('configurar')) return `Prolongar além de ${_cqFmtData(ref)} exige permissão de configurar o CQ. Encurtar é permitido.`;
  }
  return '';
}
// Campos de data + justificativa da validade alterada (formulário de preparo e troca de conjunto)
function _cqPrepValidadeEditHTML({ id, dia, padrao, max, valor, motivo, onData, onMotivo }) {
  const dias = padrao && dia ? _cqPrepDias(dia, padrao) : null;
  const podeProlongar = _cqCan('configurar');
  const maxInput = podeProlongar ? max : (padrao && max && padrao < max ? padrao : max || padrao);
  return `<div class="cq-pf-val-edit">
    <div class="form-field"><label class="field-label">Validade do preparo</label>
      <input type="date" id="${id}" class="field-input" min="${_cqEsc(dia || '')}" max="${_cqEsc(maxInput || '')}" value="${_cqEsc(valor || '')}" onchange="${onData}"></div>
    <div class="form-field"><label class="field-label">Justificativa <span class="required">*</span></label>
      <input type="text" id="${id}-mot" class="field-input" maxlength="200" value="${_cqEsc(motivo || '')}" oninput="${onMotivo}" placeholder="Ex.: precipitado na cuba; troca antecipada"></div>
    <div class="cq-nota">Padrão: ${_cqFmtData(padrao)}${dias !== null ? ` (${dias} dia(s))` : ''}. ${podeProlongar ? 'Você pode encurtar ou prolongar' : 'Você pode encurtar; prolongar exige permissão de configurar o CQ'}, até a validade do lote (${_cqFmtData(max)}).</div>
  </div>`;
}
function _cqPreparosDe(ins) {
  const lista = Object.values(ins?.preparos || {}).filter(p => p && p.id);
  // Cadastro antigo (data/responsável no insumo): vira o primeiro preparo, gravado no próximo uso
  const leg = ins?.preparoLegado || ins?.preparo;
  if (!lista.length && leg?.data) lista.push({ id: 'legado', data: leg.data, responsavel: leg.responsavel || '', situacao: 'liberado', legado: true });
  return lista.map(p => ({ ...p, validade: p.validade || _cqPrepValidade(ins, p.data) }))
    .sort((a, b) => (b.data || '').localeCompare(a.data || '') || (b.criadoEm || '').localeCompare(a.criadoEm || ''));
}
function _cqPreparo(ins, id) { return id ? _cqPreparosDe(ins).find(p => p.id === id) || null : null; }
// Finalizado (consumido, descartado ou de uso único já lançado): sai do lançamento; a situação (liberado/reprovado) é mantida
function _cqPrepUsavel(p, dia) { return !!p && !p.finalizado && p.situacao !== 'reprovado' && !(p.validade && dia && p.validade < dia); }
function _cqPrepFinalizadoTxt(p) {
  const f = p?.finalizado;
  if (!f) return '';
  return `${f.auto ? 'finalizado automaticamente' : `finalizado por ${f.porNome || '—'}`} em ${_cqFmtDH(f.em)}${f.motivo ? ` — ${f.motivo}` : ''}`;
}
function _cqPrepTxt(p) { return p ? `${p.codigo ? p.codigo + ' · ' : ''}${_cqFmtData(p.data)} · ${p.responsavel || '—'}` : ''; }

// Quem pode alterar a situação de um preparo (equivale a decidir sobre o controle dele)
function _cqPodeSituacaoPreparo() { return _cqCan('liberar') || _cqPodeEditarCad(); }
// Origem da situação atual: decisão de corrida ou alteração manual
function _cqPrepAvaliacaoTxt(p) {
  const a = p?.avaliacao;
  if (!a) return '';
  if (a.auto) return a.motivo || 'liberado no registro';
  return a.manual ? `alterado por ${a.porNome || '—'} em ${_cqFmtDH(a.em)}` : `decisão da corrida ${a.numero || ''}${a.porNome ? ' · ' + a.porNome : ''}`;
}
// Selo da situação; clicável para alterar quando há permissão (onde: 'lote' | 'aba' | 'info')
const CQ_SITUACAO_PREPARO_DESC = {
  em_avaliacao: 'Aguardando a decisão da corrida que o usar',
  liberado: 'Aprovado no controle; oferecido no lançamento',
  reprovado: 'Reprovado no controle; não é oferecido no lançamento',
};
const CQ_SITUACAO_PREPARO_DOT = { em_avaliacao: 'corr-pendente', liberado: 'corr-liberada', reprovado: 'corr-rejeitada' };
// Selo da situação: popover para escolher. Mudar a situação ou reabrir abre a janela da justificativa
// (obrigatória); finalizar é direto.
function _cqPrepSituacaoBtn(i, p, onde) {
  const atual = p.situacao || 'em_avaliacao';
  const sit = CQ_SITUACAO_PREPARO[atual];
  const pode = _cqPodeSituacaoPreparo() && !p.legado && !p.novo;
  const rot = `${_cqEsc(sit.label)}${p.finalizado ? ' · finalizado' : ''}`;
  const cls = p.finalizado ? 'cq-st-semalvo' : sit.cls;
  if (!pode) return `<span class="cq-badge ${cls}">${rot}</span>`;
  const id = `cq-ps-${onde}-${i.id}-${p.id}`;
  const arg = `'${i.id}','${p.id}','${onde}'`;
  const ops = Object.entries(CQ_SITUACAO_PREPARO).map(([k, x]) => `<button type="button" class="cq-sitpop-op${k === atual ? ' sel' : ''}" onclick="event.stopPropagation();cqPrepSitEscolher(${arg},'${k}')">
      <span class="cq-sitpop-marca"><span class="cq-sitpop-dot st-${CQ_SITUACAO_PREPARO_DOT[k]}"></span></span>
      <span class="cq-sitpop-txt"><b>${x.label}</b><small>${CQ_SITUACAO_PREPARO_DESC[k]}${k !== atual ? ' · pede justificativa' : ''}</small></span>
      <svg class="cq-sitpop-ok" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><polyline points="20 6 9 17 4 12"/></svg></button>`).join('');
  const fim = p.finalizado
    ? `<button type="button" class="cq-sitpop-op cq-ps-reabrir" onclick="event.stopPropagation();cqPrepSitEscolher(${arg},'reabrir')">
        <span class="cq-sitpop-marca"><span class="cq-sitpop-ico">${CQ_ICO.play}</span></span><span class="cq-sitpop-txt"><b>Reabrir preparo</b><small>Volta a ser oferecido no lançamento · pede justificativa</small></span></button>`
    : `<button type="button" class="cq-sitpop-op cq-ps-fim" onclick="event.stopPropagation();cqPrepSitEscolher(${arg},'finalizar')">
        <span class="cq-sitpop-marca"><span class="cq-sitpop-ico"><svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg></span></span><span class="cq-sitpop-txt"><b>Finalizar preparo</b><small>Acabou (consumido ou descartado)</small></span></button>`;
  return `<div class="cq-sitpop cq-ps" id="${id}-pop" onclick="event.stopPropagation()">
    <button type="button" class="cq-badge ${cls} cq-prep-sit" title="Alterar situação ou finalizar o preparo" onclick="event.stopPropagation();cqPrepSitAbrir('${id}')">${rot}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><polyline points="6 9 12 15 18 9"/></svg></button>
    <div class="cq-sitpop-menu cq-ps-menu">${ops}<div class="cq-ps-sep"></div>${fim}</div>
  </div>`;
}
// Abre o popover em posição fixa (funciona dentro de tabelas e grades com rolagem)
function cqPrepSitAbrir(id) {
  const pop = document.getElementById(id + '-pop');
  if (!pop) return;
  const btn = pop.querySelector('.cq-prep-sit');
  if (_cqFloatAberto(btn)) { _cqFloatFechar(); return; }
  document.querySelectorAll('.cq-sitpop.aberto, .cq-mp.aberto').forEach(x => x.classList.remove('aberto'));
  // Menu flutuante no <body>: fica à frente de janelas e painéis
  _cqFloatAbrir(btn, pop.querySelector('.cq-ps-menu').innerHTML, { cls: 'cq-ps-float', largura: 320 });
}
function cqPrepSitEscolher(insId, prepId, onde, k) {
  _cqFloatFechar();
  document.querySelectorAll('.cq-ps.aberto').forEach(x => x.classList.remove('aberto'));
  const i = cqState.config.insumos[insId];
  const p = i ? _cqPreparo(i, prepId) : null;
  if (!p) return;
  if (k === 'finalizar') { _cqPreparoFinalizarGravar(insId, prepId, onde); return; }
  if (k === 'reabrir') { cqPreparoSituacao(insId, prepId, onde, { reabrir: true }); return; }
  if (k === (p.situacao || 'em_avaliacao')) return;
  cqPreparoSituacao(insId, prepId, onde, { sit: k });
}
function _cqPreparosHistoricoHTML(i) {
  const ps = _cqPreparosDe(i);
  const hoje = _cqHoje();
  if (!ps.length) return `<div class="cq-nota">Nenhum preparo registrado. Registre em Cadastros › Preparos ou no lançamento da corrida (“+ Novo preparo”).${i.preparoUsoUnico ? ' Lote de uso único: cada preparo serve a uma corrida.' : ''}</div>`;
  const item = p => {
    const nC = Object.keys(p.corridas || {}).length;
    const venc = !p.finalizado && p.validade && p.validade < hoje;
    const sub = [`${nC} corrida(s)`, p.finalizado ? _cqPrepFinalizadoTxt(p) : _cqPrepAvaliacaoTxt(p), p.legado ? 'cadastro antigo' : ''].filter(Boolean).join(' · ');
    const quem = [p.codigo, p.responsavel || '—', _cqPrepQtdTxt(p)].filter(Boolean).join(' · ');
    return `<div class="cq-prep-item${p.finalizado ? ' finalizado' : ''}">
      <div class="cq-prep-data"><b>${_cqFmtData(p.data)}</b><small class="${venc ? 'cq-txt-vermelho' : ''}" title="Validade do preparado">val. ${_cqFmtData(p.validade)}</small></div>
      <div class="cq-prep-info"><span title="${_cqEsc(quem)}">${_cqEsc(quem)}</span><small title="${_cqEsc(sub)}">${_cqEsc(sub)}</small></div>
      ${_cqPrepSituacaoBtn(i, p, 'lote')}
      <span class="cq-prep-item-acoes"><button type="button" class="cq-icobtn" title="Imprimir etiqueta" onclick="cqImprimirRotulo('${i.id}','${p.id}')">${CQ_ICO.print}</button><button type="button" class="cq-icobtn" title="Baixar etiqueta em PDF" onclick="cqEtqBaixar('${i.id}','${p.id}')">${CQ_ICO.baixar}</button>${_cqPrepBtnExcluir(i, p, 'lote')}</span>
    </div>`;
  };
  const ativos = ps.filter(p => !p.finalizado), fins = ps.filter(p => p.finalizado);
  const segIni = !ativos.length && fins.length ? 'fin' : 'uso';
  return `${i.preparoUsoUnico ? '<div class="cq-nota" style="margin-bottom:8px;">Lote de uso único: um preparo por corrida, finalizado automaticamente ao registrar a corrida.</div>' : ''}
    <div class="cq-seg cq-prep-seg" role="tablist">${[['uso', CQ_ICO.play + 'Em uso', ativos.length], ['fin', 'Finalizados', fins.length]].map(([k, l, n]) => `<button type="button" data-k="${k}" class="${k === segIni ? 'active' : ''}" onclick="cqPrepLoteSeg(this,'${k}')">${l} <span class="cq-seg-n">${n}</span></button>`).join('')}</div>
    <div class="cq-prep-pane" data-k="uso"${segIni === 'uso' ? '' : ' hidden'}>${ativos.length ? `<div class="cq-prep-lista">${ativos.map(item).join('')}</div>` : '<div class="cq-nota">Nenhum preparo em uso: registre o próximo em Cadastros › Preparos ou no lançamento da corrida.</div>'}</div>
    <div class="cq-prep-pane" data-k="fin"${segIni === 'fin' ? '' : ' hidden'}>${fins.length ? `<div class="cq-prep-lista">${fins.map(item).join('')}</div>` : '<div class="cq-nota">Nenhum preparo finalizado.</div>'}</div>
    ${_cqPodeSituacaoPreparo() ? '<div class="cq-nota" style="margin-top:8px;">Clique na situação para alterá-la ou finalizar o preparo (com justificativa). Preparos finalizados ou reprovados não são oferecidos nos lançamentos.</div>' : ''}`;
}

// Em uso / Finalizados na aba Preparos do lote (troca sem redesenhar)
function cqPrepLoteSeg(btn, k) {
  const box = btn.closest('.cq-aba-pane') || btn.parentElement.parentElement;
  btn.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
  box.querySelectorAll('.cq-prep-pane').forEach(p => { p.hidden = p.dataset.k !== k; });
}

// Altera a situação de um preparo (aba Preparos do lote, lançamento da corrida ou informações do preparo)
function cqPreparoSituacao(insId, prepId, onde, opts = {}) {
  if (!_cqPodeSituacaoPreparo()) { showToast('Sem permissão para alterar a situação do preparo.', 'error'); return; }
  const i = cqState.config.insumos[insId];
  const p = i ? _cqPreparo(i, prepId) : null;
  if (!p || p.legado) { showToast('Preparo do cadastro antigo: a situação é registrada no primeiro uso dele.', 'error'); return; }
  if (onde === 'info') cqModalClose();
  const atual = p.situacao || 'em_avaliacao';
  const finAtual = !!p.finalizado;
  // Escolha feita no popover: a janela só pede a justificativa
  const simples = !!opts.sit || !!opts.reabrir;
  const badge = (k, fin) => `<span class="cq-badge ${fin ? 'cq-st-semalvo' : CQ_SITUACAO_PREPARO[k].cls}">${_cqEsc(CQ_SITUACAO_PREPARO[k].label)}${fin ? ' · finalizado' : ''}</span>`;
  const corpoSimples = simples ? `<div class="cq-ps-resumo">${badge(atual, finAtual)}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="13 6 19 12 13 18"/></svg>${opts.reabrir ? badge(atual, false) + '<span class="cq-muted">reaberto</span>' : badge(opts.sit, finAtual)}</div>
      <input type="hidden" id="cq-prep-sit" value="${opts.sit || atual}"><input type="checkbox" id="cq-prep-fin" hidden ${opts.reabrir ? '' : finAtual ? 'checked' : ''}>
      <div class="form-field" style="margin-top:12px;"><label class="field-label">Justificativa <span class="required">*</span></label>
        <textarea id="cq-prep-just" class="field-textarea" style="min-height:80px;" placeholder="${opts.reabrir ? 'Ex.: finalizado por engano; ainda há placas em uso.' : 'Ex.: esterilidade lida após 48 h sem crescimento; preparo liberado.'}"></textarea></div>
      <div class="cq-nota">Fica registrada na rastreabilidade do lote. Corridas que já usaram o preparo não mudam.</div>` : '';
  _cqPrompt({
    titulo: opts.reabrir ? 'Reabrir preparo' : simples ? 'Mudar situação do preparo' : opts.finalizar ? 'Finalizar preparo' : 'Situação do preparo', subtitulo: `${i.nome} · lote ${i.lote} · preparo ${p.codigo ? p.codigo + ' · ' : ''}de ${_cqFmtData(p.data)}`,
    corpo: simples ? corpoSimples : `<div class="form-field"><label class="field-label">Situação</label>
        <div class="cq-prep-sit-lin">
          <select id="cq-prep-sit" class="field-select">${_cqMapOptions(CQ_SITUACAO_PREPARO, atual, null)}</select>
          <input type="checkbox" id="cq-prep-fin" hidden ${finAtual || opts.finalizar ? 'checked' : ''}>
          ${_cqPrepBtnFinHTML(finAtual || !!opts.finalizar)}
        </div>
        ${p.avaliacao ? `<div class="cq-nota">Atual: ${_cqEsc(CQ_SITUACAO_PREPARO[atual]?.label || atual)} — ${_cqEsc(_cqPrepAvaliacaoTxt(p))}.</div>` : ''}
        <div id="cq-prep-fin-nota" class="cq-prep-fin-nota" data-atual="${finAtual ? 1 : 0}" data-txt="${_cqEsc(finAtual ? _cqPrepFinalizadoTxt(p) : '')}">${_cqPrepFinNotaHTML(finAtual, finAtual || !!opts.finalizar, finAtual ? _cqPrepFinalizadoTxt(p) : '')}</div></div>
      <div class="form-field" style="margin-top:10px;"><label class="field-label">Justificativa</label>
        <textarea id="cq-prep-just" class="field-textarea" style="min-height:64px;" placeholder="Obrigatória para alterar a situação ou reabrir; opcional para só finalizar. Ex.: esterilidade lida após 48 h sem crescimento."></textarea></div>
      <div class="cq-nota">Reprovado ou finalizado: deixa de ser oferecido nos lançamentos. Corridas que já usaram o preparo não mudam.</div>`,
    confirmar: 'Salvar',
    onConfirm: async () => {
      const sit = _cqVal('cq-prep-sit'), just = _cqVal('cq-prep-just'), fin = _cqChk('cq-prep-fin');
      if (sit === atual && fin === finAtual) { showToast('Nada mudou: altere a situação ou a finalização.', 'error'); return false; }
      // Justificativa: obrigatória para mudar a situação ou reabrir; só finalizar dispensa
      if (!just && (sit !== atual || (finAtual && !fin))) { showToast(sit !== atual ? 'Informe a justificativa da mudança de situação.' : 'Informe a justificativa para reabrir o preparo.', 'error'); return false; }
      const motivoTxt = just || CQ_PREP_FIN_PADRAO;
      if (!_cqPodeGravar()) return false;
      const ass = _cqAssinatura();
      const pb = `${CQ_KEYS.config}/insumos/${insId}/preparos/${prepId}`;
      const de = CQ_SITUACAO_PREPARO[atual]?.label || atual, para = CQ_SITUACAO_PREPARO[sit]?.label || sit;
      const updates = {};
      const diffs = [];
      const avaliacao = sit !== atual ? { manual: true, acao: sit, motivo: just, ...ass } : null;
      if (avaliacao) {
        updates[`${pb}/situacao`] = sit;
        updates[`${pb}/avaliacao`] = avaliacao;
        diffs.push({ campo: 'Situação do preparo', antes: de, depois: para });
      }
      const finalizado = fin ? (finAtual ? p.finalizado : { auto: false, motivo: motivoTxt, ...ass }) : null;
      if (fin !== finAtual) {
        updates[`${pb}/finalizado`] = finalizado;
        diffs.push({ campo: 'Preparo finalizado', antes: finAtual ? 'Sim' : 'Não', depois: fin ? 'Sim' : 'Não' });
      }
      updates[`${pb}/historico/${_cqTk()}`] = { de: atual, para: sit, finalizado: fin, motivo: motivoTxt, ...ass };
      updates[`${CQ_KEYS.config}/insumos/${insId}/atualizadoEm`] = ass.em;
      updates[`${CQ_KEYS.config}/insumos/${insId}/trilha/${_cqTk()}`] = _cqTrilhaEntry('edicao', `Preparo ${p.codigo ? p.codigo + ' ' : ''}de ${_cqFmtData(p.data)} ${fin && !finAtual ? 'finalizado' : !fin && finAtual ? 'reaberto' : 'alterado'}${just ? `: ${just}` : ''}`, diffs);
      if (!(await window.dbUpdate(updates))) { showToast('Falha ao gravar. Verifique a conexão.', 'error'); return false; }
      const cru = _cqLoteCru(i).preparos?.[prepId];
      if (cru) { if (avaliacao) { cru.situacao = sit; cru.avaliacao = avaliacao; } cru.finalizado = finalizado; }
      showToast(fin && !finAtual ? 'Preparo finalizado.' : !fin && finAtual ? 'Preparo reaberto.' : `Preparo ${para.toLowerCase()}.`, 'success');
      if (onde === 'lote') cqInsumoForm(insId, { aba: 'preparos' });
      else if (onde === 'aba') cqRender();
      else if (onde === 'info') setTimeout(() => cqPreparoInfo(insId, prepId), 60);
      return true;
    },
  });
}

// Botão Finalizar (stop) da janela de situação do preparo; alterna o checkbox oculto cq-prep-fin
function _cqPrepBtnFinHTML(on) {
  return `<button type="button" id="cq-prep-fin-btn" class="btn cq-btn-fin ${on ? 'on' : ''}" aria-pressed="${on}" onclick="cqPrepFinAlternar()"
    title="${on ? 'Clique para manter o preparo em uso' : 'Preparo consumido ou descartado: deixa de aparecer nos lançamentos'}">
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>${on ? 'Finalizado' : 'Finalizar'}</button>`;
}
function _cqPrepFinNotaHTML(atual, on, txt) {
  if (atual && on) return `<span class="cq-muted">${_cqEsc(txt)}. Clique em “Finalizado” para reabrir.</span>`;
  if (atual && !on) return `<span class="cq-prep-fin-aviso reabrir">${CQ_ICO.play} Será reaberto e voltará a aparecer nos lançamentos.</span>`;
  if (on) return `<span class="cq-prep-fin-aviso">${CQ_ICO.alerta} Será finalizado: deixa de aparecer nos lançamentos.</span>`;
  return '';
}
function cqPrepFinAlternar() {
  const chk = document.getElementById('cq-prep-fin');
  const btn = document.getElementById('cq-prep-fin-btn');
  if (!chk || !btn) return;
  chk.checked = !chk.checked;
  btn.outerHTML = _cqPrepBtnFinHTML(chk.checked);
  const nota = document.getElementById('cq-prep-fin-nota');
  if (nota) nota.innerHTML = _cqPrepFinNotaHTML(nota.dataset.atual === '1', chk.checked, nota.dataset.txt || '');
}

// Finalização rápida (botão ⏹ ao lado da situação): confirma e sinaliza que o preparo acabou, sem justificativa
// onde: tela a redesenhar depois de gravar ('info' = janela do preparo; padrão: aba Preparos)
function cqPreparoFinalizarRapido(insId, prepId, onde) {
  if (!_cqPodeSituacaoPreparo()) { showToast('Sem permissão para finalizar o preparo.', 'error'); return; }
  const i = cqState.config.insumos[insId];
  const p = i ? _cqPreparo(i, prepId) : null;
  if (!p || p.legado || p.finalizado) return;
  const nC = Object.keys(p.corridas || {}).length;
  _cqPrompt({
    titulo: 'Finalizar preparo?', subtitulo: `${i.nome} · lote ${i.lote} · ${p.codigo || 'preparo de ' + _cqFmtData(p.data)}`, perigo: true, confirmar: 'Finalizar',
    corpo: `<div class="cq-fin-conf">
        <span class="cq-fin-conf-ico"><svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg></span>
        <div><b>O preparo ${_cqEsc(p.codigo || '')} acabou?</b>
          <p>Ele deixa de ser oferecido no lançamento das corridas. ${nC ? `As ${nC} corrida(s) que já o usaram não mudam.` : ''} Se foi engano, reabra pela situação do preparo.</p></div>
      </div>`,
    onConfirm: async () => { await _cqPreparoFinalizarGravar(insId, prepId, onde); return true; },
  });
}
async function _cqPreparoFinalizarGravar(insId, prepId, onde = 'aba') {
  const i = cqState.config.insumos[insId];
  const p = i ? _cqPreparo(i, prepId) : null;
  if (!p || p.legado || p.finalizado || _cqSalvando) return;
  if (!_cqPodeGravar()) return;
  const ass = _cqAssinatura();
  const pb = `${CQ_KEYS.config}/insumos/${insId}/preparos/${prepId}`;
  const finalizado = { auto: false, motivo: CQ_PREP_FIN_PADRAO, ...ass };
  const nome = p.codigo || `de ${_cqFmtData(p.data)}`;
  _cqSalvando = true;
  try {
    const ok = await window.dbUpdate({
      [`${pb}/finalizado`]: finalizado,
      [`${pb}/historico/${_cqTk()}`]: { de: p.situacao || 'em_avaliacao', para: p.situacao || 'em_avaliacao', finalizado: true, motivo: CQ_PREP_FIN_PADRAO, ...ass },
      [`${CQ_KEYS.config}/insumos/${insId}/atualizadoEm`]: ass.em,
      [`${CQ_KEYS.config}/insumos/${insId}/trilha/${_cqTk()}`]: _cqTrilhaEntry('edicao', `Preparo ${nome} finalizado`, [{ campo: 'Preparo finalizado', antes: 'Não', depois: 'Sim' }]),
    });
    if (!ok) { showToast('Falha ao gravar. Verifique a conexão.', 'error'); return; }
  } finally { _cqSalvando = false; }
  const cru = _cqLoteCru(i).preparos?.[prepId];
  if (cru) cru.finalizado = finalizado;
  showToast(`Preparo ${nome} finalizado. Para reabrir, use a situação do preparo.`, 'success');
  if (onde === 'lote') cqInsumoForm(insId, { aba: 'preparos' });
  else if (onde === 'info') cqPreparoInfo(insId, prepId);
  else cqRender();
}

// Retificação da quantidade preparada (registro do valor anterior na trilha do lote)
function _cqPodeRetificarPreparo(p) {
  if (!p || p.novo || p.legado) return false;
  return _cqPodeSituacaoPreparo() || (_cqPodeRegistrarPreparo() && !!p.criadoPor?.porId && p.criadoPor.porId === _cqSess().id);
}
function cqPreparoRetificarQtd(insId, prepId) {
  const i = cqState.config.insumos[insId];
  const p = i ? _cqPreparo(i, prepId) : null;
  if (!_cqPodeRetificarPreparo(p)) { showToast('Sem permissão para retificar este preparo.', 'error'); return; }
  cqModalClose();
  const un = p.unidadeQtd || _cqPrepUltimaUnidade(_cqLoteCru(i).produtoId) || 'mL';
  _cqPrompt({
    titulo: 'Retificar quantidade', subtitulo: `${i.nome} · lote ${i.lote} · preparo ${p.codigo || 'de ' + _cqFmtData(p.data)}`, confirmar: 'Salvar',
    corpo: `<div class="form-field"><label class="field-label">Quantidade preparada <span class="required">*</span></label>
        <div class="cq-pf-qtd"><input type="number" id="cq-prep-rq" class="field-input" min="0" step="any" inputmode="decimal" value="${_cqEsc(p.quantidade ?? '')}" onkeydown="if(event.key==='Enter')cqPromptConfirmar()">
          <select id="cq-prep-ru" class="field-select">${CQ_UNID_PREPARO.map(x => `<option ${x === un ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
        ${_cqPrepQtdTxt(p) ? `<div class="cq-nota">Registrado: ${_cqEsc(_cqPrepQtdTxt(p))}.</div>` : ''}</div>
      <div class="form-field"><label class="field-label">Motivo</label>
        <input type="text" id="cq-prep-rm" class="field-input" maxlength="200" placeholder="Opcional — ex.: digitado 900 em vez de 500"></div>
      <div class="cq-nota">O valor anterior fica na rastreabilidade do lote.</div>`,
    onConfirm: async () => {
      const qtd = Number(_cqVal('cq-prep-rq').replace(',', '.')), unid = _cqVal('cq-prep-ru'), motivo = _cqVal('cq-prep-rm');
      if (!(qtd > 0)) { showToast('Informe a quantidade preparada.', 'error'); return false; }
      if (qtd === Number(p.quantidade) && unid === (p.unidadeQtd || '')) { showToast('Nada mudou.', 'error'); return false; }
      if (!_cqPodeGravar()) return false;
      const ass = _cqAssinatura();
      const pb = `${CQ_KEYS.config}/insumos/${insId}/preparos/${prepId}`;
      const antes = _cqPrepQtdTxt(p) || 'não informada', depois = _cqPrepQtdTxt({ quantidade: qtd, unidadeQtd: unid });
      const ok = await window.dbUpdate({
        [`${pb}/quantidade`]: qtd, [`${pb}/unidadeQtd`]: unid,
        [`${pb}/retificacoes/${_cqTk()}`]: { campo: 'quantidade', antes, depois, motivo, ...ass },
        [`${CQ_KEYS.config}/insumos/${insId}/atualizadoEm`]: ass.em,
        [`${CQ_KEYS.config}/insumos/${insId}/trilha/${_cqTk()}`]: _cqTrilhaEntry('edicao', `Quantidade do preparo ${p.codigo || 'de ' + _cqFmtData(p.data)} retificada${motivo ? `: ${motivo}` : ''}`, [{ campo: 'Quantidade preparada', antes, depois }]),
      });
      if (!ok) { showToast('Falha ao gravar. Verifique a conexão.', 'error'); return false; }
      const cru = _cqLoteCru(i).preparos?.[prepId];
      if (cru) { cru.quantidade = qtd; cru.unidadeQtd = unid; }
      showToast(`Quantidade retificada para ${depois}.`, 'success');
      cqRender();
      setTimeout(() => cqPreparoInfo(insId, prepId), 60);
      return true;
    },
  });
}

// Retificação da validade do preparo em uso: encurtar pode quem registra preparos; prolongar só quem
// configura o CQ (regras em _cqPrepValidadeErro). O valor anterior fica em retificacoes e na trilha do lote.
function _cqPodeRetificarValidade(p) {
  return !!p && !p.novo && !p.legado && !p.finalizado && (_cqPodeRegistrarPreparo() || _cqPodeSituacaoPreparo());
}
function cqPreparoRetificarValidade(insId, prepId) {
  const i = cqState.config.insumos[insId];
  const p = i ? _cqPreparo(i, prepId) : null;
  if (!_cqPodeRetificarValidade(p)) { showToast('Sem permissão para alterar a validade deste preparo.', 'error'); return; }
  cqModalClose();
  const hoje = _cqHoje();
  const padrao = p.validadePadrao || _cqPrepValidade(i, p.data);
  const vencido = !!(p.validade && p.validade < hoje);
  _cqPrompt({
    titulo: 'Alterar validade do preparo', subtitulo: `${i.nome} · lote ${i.lote} · preparo ${p.codigo || 'de ' + _cqFmtData(p.data)}`, confirmar: 'Salvar',
    corpo: `<div class="cq-nota">Validade atual: <b>${_cqFmtData(p.validade)}</b>${vencido ? ' (vencido: só pode ser encurtada)' : ''}.</div>
      ${_cqPrepValidadeEditHTML({ id: 'cq-prep-rv', dia: p.data, padrao, max: i.validade, valor: p.validade, motivo: '', onData: '', onMotivo: '' })}
      <div class="cq-nota">O valor anterior fica na rastreabilidade do lote.</div>`,
    onConfirm: async () => {
      const nova = _cqVal('cq-prep-rv'), motivo = _cqVal('cq-prep-rv-mot');
      if (nova === p.validade) { showToast('Nada mudou.', 'error'); return false; }
      const erro = _cqPrepValidadeErro({ nova, dia: p.data, max: i.validade, ref: p.validade, vencido });
      if (erro) { showToast(erro, 'error'); return false; }
      if (!motivo) { showToast('Informe a justificativa.', 'error'); return false; }
      if (!_cqPodeGravar()) return false;
      const ass = _cqAssinatura();
      const pb = `${CQ_KEYS.config}/insumos/${insId}/preparos/${prepId}`;
      const antes = _cqFmtData(p.validade), depois = _cqFmtData(nova);
      const ok = await window.dbUpdate({
        [`${pb}/validade`]: nova,
        ...(p.validadePadrao ? {} : { [`${pb}/validadePadrao`]: padrao }),
        [`${pb}/retificacoes/${_cqTk()}`]: { campo: 'validade', antes, depois, motivo, ...ass },
        [`${CQ_KEYS.config}/insumos/${insId}/atualizadoEm`]: ass.em,
        [`${CQ_KEYS.config}/insumos/${insId}/trilha/${_cqTk()}`]: _cqTrilhaEntry('edicao', `Validade do preparo ${p.codigo || 'de ' + _cqFmtData(p.data)} ${nova < p.validade ? 'encurtada' : 'prolongada'}: ${motivo}`, [{ campo: 'Validade do preparo', antes, depois }]),
      });
      if (!ok) { showToast('Falha ao gravar. Verifique a conexão.', 'error'); return false; }
      const cru = _cqLoteCru(i).preparos?.[prepId];
      if (cru) { cru.validade = nova; if (!cru.validadePadrao) cru.validadePadrao = padrao; }
      showToast(`Validade alterada para ${depois}.`, 'success');
      cqRender();
      if (typeof _cqAtualizarAlertasPreparo === 'function') _cqAtualizarAlertasPreparo();
      setTimeout(() => cqPreparoInfo(insId, prepId), 60);
      return true;
    },
  });
}

// Corridas que usaram o preparo (aberto pelo bloco "Corridas" do detalhe)
async function cqPreparoCorridas(insId, prepId) {
  const i = cqState.config.insumos[insId];
  const p = i ? _cqPreparo(i, prepId) : null;
  if (!p) return;
  const usos = Object.entries(p.corridas || {}).map(([k, c]) => ({ key: k, ...c, mes: c.mes || CQEngine.mesDe(k) })).sort((a, b) => (b.dataHora || '').localeCompare(a.dataHora || ''));
  const voltar = `<button class="btn btn-outline" onclick="cqPreparoInfo('${insId}','${prepId}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="width:14px;height:14px;"><polyline points="15 6 9 12 15 18"/></svg> Voltar ao preparo</button>`;
  const abrir = corpo => cqModalOpen({
    titulo: `Corridas do preparo ${p.codigo || ''}`.trim(), subtitulo: `${i.nome} · lote ${i.lote} · ${usos.length} corrida${usos.length === 1 ? '' : 's'}`, icone: 'lista', largura: '760px',
    corpo, rodape: `<div>${voltar}</div><button class="btn btn-primary" onclick="cqModalClose()">Fechar</button>`,
  });
  abrir('<div class="cq-vazio-p">Carregando corridas…</div>');
  document.getElementById('cq-modal-foot').style.justifyContent = 'space-between';
  // A corrida pode ser de qualquer unidade do lote: tenta a ativa primeiro
  const unidades = [...new Set([_cqUnidadeAtivaId(), ..._cqUnidadesRec(i)].filter(Boolean))];
  const carregadas = await Promise.all(usos.map(async uso => {
    for (const u of unidades) {
      const c = await cqCarregarCorrida(u, uso.mes, uso.key).catch(() => null);
      if (c) return { uso, c, u };
    }
    return { uso, c: null };
  }));
  const corDot = { aceito: 'corr-liberada', alerta: 'corr-parcial', sem_alvo: 'corr-parcial', rejeitado: 'corr-rejeitada' };
  const linhas = carregadas.map(({ uso, c, u }) => {
    if (!c) return `<div class="cq-pc-item ausente"><div class="cq-pc-main"><b>${_cqEsc(uso.numero || uso.key)}</b><span>${_cqFmtDH(uso.dataHora)} · corrida não encontrada (excluída?)</span></div></div>`;
    const st = c.status || _cqStatusCorrida(c);
    const testes = Object.entries(c.testes || {}).filter(([, ct]) => ct.prep === prepId && ct.lr === insId);
    const tHTML = testes.map(([tid, ct]) => {
      const t = cqState.config.testes[tid];
      const s = ct.decisao?.acao === 'rejeitado' ? 'rejeitado' : (ct.avaliacao?.status || 'sem_alvo');
      return `<span class="cq-pc-teste"><span class="cq-sitpop-dot st-${corDot[s] || 'encerrado'}"></span>${_cqEsc(t ? (_cqAnalito(t.analitoId)?.nome || _cqNomeTeste(t)) : 'Teste removido')}<em>${_cqEsc(CQ_STATUS[s]?.label || s)}${ct.decisao ? '' : ' · aguardando'}</em></span>`;
    }).join('');
    return `<button type="button" class="cq-pc-item st-${st}" onclick="cqModalClose();setTimeout(()=>cqAbrirCorrida('${_cqEsc(c.mes)}','${_cqEsc(c.key)}'),60)" title="Abrir a corrida">
      <div class="cq-pc-main"><b>${_cqEsc(c.numero || c.key)}</b><span>${_cqFmtDH(c.dataHora)} · ${_cqEsc(c.ativoSnap?.nome || c.sistemaAnalitico || '—')}${u !== _cqUnidadeAtivaId() ? ` · ${_cqEsc(cqState.config.unidades[u]?.sigla || '')}` : ''}</span>
        ${tHTML ? `<div class="cq-pc-testes">${tHTML}</div>` : ''}</div>
      <div class="cq-pc-dir">${_cqBadge(CQ_CORRIDA_STATUS, st)}<span class="cq-pc-op">${_cqEsc(c.operadorNome || '')}</span></div>
      <svg class="cq-cfg-tile-seta" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="9 6 15 12 9 18"/></svg></button>`;
  }).join('');
  const body = document.getElementById('cq-modal-body');
  if (body) body.innerHTML = usos.length ? `<div class="cq-pc-lista">${linhas}</div><div class="cq-nota" style="margin-top:10px;">Clique na corrida para ver resultados, avaliação e decisão.</div>`
    : '<div class="cq-vazio-p">Este preparo ainda não foi usado em corrida.</div>';
}

// Informações do preparo (lançamento, aba Preparos e lote): resumo no topo, números em blocos,
// situação e corridas; os dados do produto ficam recolhidos.
function cqPreparoInfo(insId, prepId, dataNovo, respNovo) {
  const i = cqState.config.insumos[insId];
  if (!i) return;
  const pf = i.preparo || {};
  const p = prepId === 'novo' ? { data: dataNovo, responsavel: respNovo, situacao: 'em_avaliacao', novo: true, validade: _cqPrepValidade(i, dataNovo) } : _cqPreparo(i, prepId);
  if (!p) { showToast('Preparo não encontrado.', 'error'); return; }
  const hoje = _cqHoje();
  const corridas = Object.entries(p.corridas || {}).map(([k, c]) => ({ key: k, ...c })).sort((a, b) => (b.dataHora || '').localeCompare(a.dataHora || ''));
  const nomes = String(p.responsavel || '').trim();
  const bloco = (ico, rot, valor, sub = '', cls = '', acao = '') => `<div class="cq-pi-bloco ${cls}">${acao}<small>${ico}${rot}</small><b>${valor}</b>${sub ? `<span>${sub}</span>` : ''}</div>`;
  const qtd = _cqPrepQtdTxt(p);
  const icoQtd = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 3h10"/><path d="M8 3v4l-3 11a2 2 0 002 3h10a2 2 0 002-3L16 7V3"/><line x1="6" y1="14" x2="18" y2="14"/></svg>';
  // Situação: selo + origem (decisão de corrida ou alteração manual) e finalização
  const av = p.avaliacao;
  const origem = av ? (av.auto ? `${av.motivo || 'Liberado no registro'} · ${av.porNome || '—'} em ${_cqFmtDH(av.em)}`
      : `${av.manual ? `Alterada manualmente por ${av.porNome || '—'} em ${_cqFmtDH(av.em)}` : `Definida pela ${_cqPrepAvaliacaoTxt(p)}`}${p.avaliacao.motivo ? ` — “${p.avaliacao.motivo}”` : ''}`)
    : (p.novo ? 'Será avaliado pela decisão da corrida.' : 'Aguardando a decisão da primeira corrida que o usar.');
  // Validade fora do padrão: no registro (validadeAjuste) ou retificada depois (retificacoes)
  const valHist = [
    p.validadeAjuste ? `Registrado com ${_cqFmtData(p.validadeAjuste.para)} em vez de ${_cqFmtData(p.validadeAjuste.de)} por ${p.validadeAjuste.porNome || '—'}: ${p.validadeAjuste.motivo}` : '',
    ...Object.entries(p.retificacoes || {}).sort(([a], [b]) => a.localeCompare(b)).map(([, r]) => r).filter(r => r?.campo === 'validade')
      .map(r => `Retificada de ${r.antes} para ${r.depois} por ${r.porNome || '—'} em ${_cqFmtDH(r.em)}${r.motivo ? `: ${r.motivo}` : ''}`),
  ].filter(Boolean);
  const prodLin = (l, v) => v ? `<div class="cq-pi-prod-lin"><span>${l}</span><b>${v}</b></div>` : '';
  cqModalOpen({
    titulo: p.novo ? 'Novo preparo' : 'Preparo', subtitulo: 'Preparado ou fracionado no laboratório (RDC 978, art. 101)', icone: 'beaker', largura: '760px',
    corpo: `<div class="cq-pi">
      <div class="cq-pi-hero">
        <div class="cq-pi-hero-txt">
          <div class="cq-pi-cod">${p.novo ? 'Novo preparo' : _cqEsc(p.codigo || 'Preparo sem código')}</div>
          <div class="cq-pi-sub">${_cqEsc(i.nome)} · lote ${_cqEsc(i.lote)}${i.preparoUsoUnico ? ' · <span class="cq-pi-tag">uso único</span>' : ''}</div>
        </div>
        <div class="cq-pi-hero-sit">${!p.novo && !p.legado && !p.finalizado && _cqPodeSituacaoPreparo()
          ? `<button type="button" class="cq-prep-parar cq-prep-parar-lg" title="Finalizar o preparo (consumido ou descartado)" aria-label="Finalizar o preparo" onclick="cqPreparoFinalizarRapido('${i.id}','${p.id}','info')"><svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2"/></svg></button>` : ''}${p.novo ? '<span class="cq-badge cq-st-pendente">Em avaliação</span>' : _cqPrepSituacaoBtn(i, p, 'info')}</div>
      </div>
      ${p.finalizado ? `<div class="cq-pi-fin">${'<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>'}<span>${_cqEsc(_cqPrepFinalizadoTxt(p))}</span></div>` : ''}
      <div class="cq-pi-blocos">
        ${bloco(icoQtd, 'Quantidade', qtd ? _cqEsc(qtd) : '<span class="cq-muted">não informada</span>', '', '',
          _cqPodeRetificarPreparo(p) ? `<button type="button" class="cq-pi-edit" title="Retificar a quantidade" onclick="cqPreparoRetificarQtd('${i.id}','${p.id}')">${CQ_ICO.edit}</button>` : '')}
        ${bloco(CQ_ICO.clock, 'Preparado em', _cqFmtData(p.data), [p.dataHora ? p.dataHora.slice(11, 16) : '', _cqEsc(nomes)].filter(Boolean).join(' · '))}
        <div class="cq-pi-bloco cq-pi-bloco-val">${_cqPodeRetificarValidade(p) ? `<button type="button" class="cq-pi-edit" title="Alterar a validade do preparo" onclick="cqPreparoRetificarValidade('${i.id}','${p.id}')">${CQ_ICO.edit}</button>` : ''}<small>${CQ_ICO.alerta}Validade</small>${_cqPrepValidadeBarra(p, hoje)}</div>
        ${corridas.length ? `<button type="button" class="cq-pi-bloco cq-pi-bloco-clic" onclick="cqPreparoCorridas('${i.id}','${p.id}')" title="Ver as corridas que usaram este preparo">
            <small>${CQ_ICO.lista}Corridas</small><b>${corridas.length}</b><span>última ${_cqFmtData(corridas[0].dataHora)}</span>
            <span class="cq-pi-ver">Clique para ver <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="9 6 15 12 9 18"/></svg></span></button>`
          : bloco(CQ_ICO.lista, 'Corridas', '0', p.novo ? 'registrada ao salvar' : 'ainda não usado')}
      </div>
      <div class="cq-pi-sec">
        <div class="cq-pi-sec-tit">Situação</div>
        <div class="cq-pi-origem">${_cqEsc(origem)}</div>
      </div>
      ${valHist.length ? `<div class="cq-pi-sec"><div class="cq-pi-sec-tit">Validade alterada</div>${valHist.map(t => `<div class="cq-pi-origem">${_cqEsc(t)}</div>`).join('')}</div>` : ''}
      ${p.conjunto ? `<div class="cq-pi-sec"><div class="cq-pi-sec-tit">${p.conjunto.fracionada ? 'Troca fracionada' : 'Troca de conjunto'}</div><div class="cq-pi-origem">${p.conjunto.fracionada ? `${p.conjunto.produtos || 1} produto(s) trocado(s) juntos, fora de conjunto` : _cqEsc(p.conjunto.nome)}</div></div>` : ''}
      ${p.observacoes ? `<div class="cq-pi-sec"><div class="cq-pi-sec-tit">Observações</div><div class="cq-pi-origem">${_cqEsc(p.observacoes)}</div></div>` : ''}
      <details class="cq-pi-prod">
        <summary>${CQ_ICO.beaker} Dados do produto e do preparo</summary>
        <div class="cq-pi-prod-grid">
          ${prodLin('Tipo', _cqEsc(CQ_TIPOS_INSUMO[i.tipo] || i.tipo))}
          ${prodLin('Lote do produto', `${_cqEsc(i.lote)} · val. ${_cqFmtData(i.validade)}`)}
          ${prodLin('Concentração / especificação', _cqEsc(pf.especificacao))}
          ${prodLin('Armazenamento', _cqEsc(pf.armazenamento))}
          ${prodLin('Riscos', _cqEsc(pf.riscos || 'Ver FISPQ'))}
          ${prodLin('Validade após preparo', pf.validadeDias ? `${pf.validadeDias} dia(s), limitada à do lote` : 'a do lote')}
          ${prodLin('Uso', i.preparoUsoUnico ? 'Único — um preparo por corrida' : 'Várias corridas por preparo')}
        </div>
      </details>
    </div>`,
    rodape: `<div>${!p.novo && _cqPodeExcluirPreparo(p) ? `<button class="btn btn-outline cq-btn-perigo" onclick="cqPreparoExcluir('${i.id}','${p.id}','info')">${CQ_ICO.lixo} Excluir</button>` : ''}</div>
      <div style="display:flex;gap:8px;">${!p.novo && !p.legado ? `<button class="btn btn-outline" title="Baixar etiqueta em PDF" onclick="cqEtqBaixar('${i.id}','${p.id}')">${CQ_ICO.baixar} PDF</button>
        <button class="btn btn-outline" onclick="cqModalClose();cqImprimirRotulo('${i.id}','${p.id}')">${CQ_ICO.print} Imprimir etiqueta</button>` : ''}
      <button class="btn btn-primary" onclick="cqModalClose()">Fechar</button></div>`,
  });
  document.getElementById('cq-modal-foot').style.justifyContent = 'space-between';
}

// ── ETIQUETA DO PREPARO ─────────────────────────────────────
// Etiquetadora: uma etiqueta por página, no tamanho da etiqueta. Folha A4: grade com linhas de corte.
// Configuração por estação (a impressora fica no computador): localStorage 'cq-etiqueta'.
// Conteúdo resumido (RDC 978, art. 101): produto, código do preparo, lote, quantidade, data do preparo,
// validade e responsável; o tamanho da fonte e o número de linhas se ajustam ao tamanho da etiqueta.
const CQ_ETQ_TAMANHOS = [[50, 30], [40, 25], [60, 40], [100, 50]];
// Resolução da etiqueta (pontos por polegada), usada no PDF e na impressão. 203 dpi é a das
// etiquetadoras térmicas comuns; o máximo é 300.
const CQ_ETQ_DPIS = [96, 150, 203, 300];
let _cqEtqDadosAtual = null;

function _cqEtqNorm(c) {
  const num = (v, min, max, d) => { const n = Number(String(v ?? '').replace(',', '.')); return n >= min && n <= max ? Math.round(n * 10) / 10 : d; };
  const rot = Number(c?.rot);
  const dpi = Number(c?.dpi);
  return { modo: c?.modo === 'folha' ? 'folha' : 'etiquetadora', largura: num(c?.largura, 20, 150, 50), altura: num(c?.altura, 10, 100, 30), rot: [90, 180, 270].includes(rot) ? rot : 0,
           dpi: CQ_ETQ_DPIS.includes(dpi) ? dpi : 300 };
}
function _cqEtqCfg() {
  let c = null;
  try { c = JSON.parse(localStorage.getItem('cq-etiqueta') || 'null'); } catch (e) { c = null; }
  return _cqEtqNorm(c);
}
function _cqEtqSalvarCfg(c) { try { localStorage.setItem('cq-etiqueta', JSON.stringify(_cqEtqNorm(c))); return true; } catch (e) { return false; } }
// Tamanho físico impresso: em 90°/270° a etiqueta gira junto com o texto (largura e altura trocam)
function _cqEtqFisico(c) { return c.rot === 90 || c.rot === 270 ? [c.altura, c.largura] : [c.largura, c.altura]; }
function _cqEtqPorFolha(c) { const [w, h] = _cqEtqFisico(c); return Math.max(0, Math.floor((194 + 2) / (w + 2))) * Math.max(0, Math.floor((281 + 2) / (h + 2))); }
function _cqEtqResumo(c) {
  const [w, h] = _cqEtqFisico(c), f = v => String(v).replace('.', ',');
  return `${c.modo === 'folha' ? 'Folha A4' : 'Etiquetadora'} · ${f(w)} × ${f(h)} mm${c.rot ? ` · ${c.rot}°` : ''}${c.modo === 'folha' ? ` · ${_cqEtqPorFolha(c)} por folha` : ''}`;
}

// Primeiro e último nome (cabe na etiqueta)
function _cqEtqNomeCurto(nome) {
  const n = String(nome || '').trim().split(/\s+/).filter(Boolean);
  return n.length > 1 ? `${n[0]} ${n[n.length - 1]}` : (n[0] || '');
}
function _cqEtqDados(i, pr) {
  const fd = s => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(2, 4)}` : '—');
  return { produto: i.nome || '', codigo: pr.codigo || '', lote: i.lote || '', qtd: _cqPrepQtdTxt(pr), prep: fd(pr.data), val: fd(pr.validade || i.validade),
           resp: _cqEtqNomeCurto(pr.responsavel) };
}
function _cqEtqExemplo() { return { produto: 'Ágar Mueller Hinton', codigo: 'MH-2611-P06', lote: 'MH-2611', qtd: '500 mL', prep: '06/10/26', val: '03/11/26', resp: 'Maria Souza' }; }
// Linhas de informação: trechos [texto, negrito] por chave e, em niveis, as combinações do mais completo
// ao mais enxuto. O preparo usa as do padrão; outro modelo (ex.: ciclo de esterilização) traz d.segs e d.niveis.
const CQ_ETQ_NIVEIS = [{ tit: 2, linhas: ['lote', 'datas', 'resp'] }, { tit: 1, linhas: ['lote', 'datas'] }, { tit: 1, linhas: ['val'] }];
function _cqEtqSegs(d) {
  return d.segs || {
    lote: [['Lote ', 0], [d.lote, 1], [d.qtd ? ` · ${d.qtd}` : '', 0]],
    datas: [[`Prep ${d.prep} · Val `, 0], [d.val, 1]],
    resp: d.resp ? [[`Resp: ${d.resp}`, 0]] : null,
    val: [['Val ', 0], [d.val, 1], [` · L ${d.lote}`, 0]],
  };
}

// Etiqueta com estilos inline em mm (mesma aparência na prévia e na impressão). O conteúdo é montado
// em largura × altura e gira 0/90/180/270° junto com a etiqueta (em 90°/270° a página fica altura × largura).
function _cqEtiquetaHTML(d, cfg, folha) {
  const rot = cfg.rot || 0;
  const [fw, fh] = _cqEtqFisico(cfg);
  const giro = rot ? `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(${rot}deg);` : '';
  return `<div class="etq" style="box-sizing:border-box;position:relative;width:${fw}mm;height:${fh}mm;overflow:hidden;background:#fff;${folha ? 'border:0.2mm dashed #999;' : ''}">${_cqEtqConteudoHTML(d, cfg.largura, cfg.altura, giro)}</div>`;
}
// Layout da etiqueta (mm): margem, escala das letras e quantas linhas cabem
function _cqEtqLayout(d, W, H) {
  const pad = Math.max(1, Math.min(W, H) * 0.05);
  const iw = W - 2 * pad, ih = H - 2 * pad;
  const sw = iw / 47;                        // escala pela largura (base: 50 mm)
  // Do mais completo ao mais enxuto: usa o primeiro em que a altura não força letra pequena demais
  const niveis = d.niveis || CQ_ETQ_NIVEIS;
  const alturaBase = n => n.tit * 3.9 + (d.codigo ? 4.9 : 0) + n.linhas.length * 3.2;
  let nv = niveis[0], esc = 1;
  for (const n of niveis) {
    nv = n;
    esc = Math.min(sw, ih / alturaBase(n), 2.2);
    if (esc >= Math.min(sw, 1) * 0.9 && esc >= 0.7) break;
  }
  return { pad, esc, nv };
}
function _cqEtqConteudoHTML(d, W, H, giro) {
  const { pad, esc, nv } = _cqEtqLayout(d, W, H);
  const mm = v => `${(v * esc).toFixed(2)}mm`;
  const e = _cqEsc;
  // Todo o texto em negrito: traço mais grosso, sem falhas na impressão térmica
  const lin = html => `<div style="font-size:${mm(2.7)};font-weight:700;line-height:1.18;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${html}</div>`;
  const segs = _cqEtqSegs(d);
  const L = k => (segs[k] ? lin(segs[k].map(([t, b]) => (b ? `<b>${e(t)}</b>` : e(t))).join('')) : '');
  return `<div style="box-sizing:border-box;width:${W}mm;height:${H}mm;padding:${pad.toFixed(2)}mm;overflow:hidden;display:flex;flex-direction:column;justify-content:center;gap:${mm(0.35)};font-family:Arial,Helvetica,sans-serif;color:#000;text-align:left;${giro}">
    <div style="font-size:${mm(3.4)};font-weight:700;line-height:1.15;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:${nv.tit};word-break:break-word;">${e(d.produto)}</div>
    ${d.codigo ? `<div style="font-size:${mm(4.2)};font-weight:800;line-height:1.15;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${e(d.codigo)}</div>` : ''}
    ${nv.linhas.map(L).join('')}
  </div>`;
}
// Prévia ampliada (cabe em ~280 px)
function _cqEtqPrevHTML(d, cfg) {
  const [fw, fh] = _cqEtqFisico(cfg);
  const z = Math.min(1.6, 280 / (fw * 3.7795), 230 / (fh * 3.7795));
  return `<div class="cq-etq-papel" style="zoom:${z.toFixed(3)};">${_cqEtiquetaHTML(d, cfg, false)}</div><div class="cq-etq-dim">${_cqEsc(_cqEtqResumo(cfg))}</div>`;
}

// Campos de modo e tamanho (Configurações e janela de impressão); px = prefixo dos ids
function _cqEtqCamposHTML(px, cfg) {
  const pre = CQ_ETQ_TAMANHOS.find(([l, a]) => l === cfg.largura && a === cfg.altura);
  return `<div class="cq-etq-cfg">
    <input type="hidden" id="${px}-modo" value="${cfg.modo}">
    <div class="form-field"><label class="field-label">Imprimir em</label>
      <div class="cq-seg" id="${px}-seg">${[['etiquetadora', 'Etiquetadora'], ['folha', 'Folha A4']].map(([k, l]) => `<button type="button" data-k="${k}" class="${cfg.modo === k ? 'active' : ''}" onclick="cqEtqModo('${px}','${k}')">${l}</button>`).join('')}</div></div>
    <div class="form-field"><label class="field-label">Tamanho da etiqueta</label>
      <div class="cq-etq-tam">
        <select id="${px}-pre" class="field-select" onchange="cqEtqPreset('${px}',this.value)">${CQ_ETQ_TAMANHOS.map(([l, a]) => `<option value="${l}x${a}" ${pre && pre[0] === l && pre[1] === a ? 'selected' : ''}>${l} × ${a} mm${l === 50 && a === 30 ? ' (padrão)' : ''}</option>`).join('')}<option value="" ${pre ? '' : 'selected'}>Personalizado</option></select>
        <input type="number" id="${px}-l" class="field-input" min="20" max="150" step="1" value="${cfg.largura}" title="Largura (mm), 20 a 150" oninput="cqEtqMudou('${px}')">
        <span>×</span>
        <input type="number" id="${px}-a" class="field-input" min="10" max="100" step="1" value="${cfg.altura}" title="Altura (mm), 10 a 100" oninput="cqEtqMudou('${px}')">
        <span>mm</span>
      </div></div>
    <input type="hidden" id="${px}-rot" value="${cfg.rot}">
    <div class="form-field"><label class="field-label">Orientação</label>
      <div class="cq-seg cq-etq-rot" id="${px}-rotseg">${[0, 90, 180, 270].map(r => `<button type="button" data-k="${r}" class="${cfg.rot === r ? 'active' : ''}" title="Girar a etiqueta ${r}°" onclick="cqEtqRot('${px}',${r})"><span class="cq-etq-rot-a" style="transform:rotate(${r}deg)">A</span>${r}°</button>`).join('')}</div></div>
    <input type="hidden" id="${px}-dpi" value="${cfg.dpi}">
    <div class="form-field"><label class="field-label">Qualidade (dpi) do PDF e da impressão</label>
      <div class="cq-seg cq-etq-dpi" id="${px}-dpiseg">${CQ_ETQ_DPIS.map(v => `<button type="button" data-k="${v}" class="${cfg.dpi === v ? 'active' : ''}" title="${_cqEtqDpiDica(v)}" onclick="cqEtqDpi('${px}',${v})">${v} dpi</button>`).join('')}</div>
      <div class="cq-nota" id="${px}-dpi-info">${_cqEtqDpiInfo(cfg)}</div></div>
  </div>`;
}
function _cqEtqDpiDica(v) { return { 96: 'Tela / pré-visualização (arquivo leve)', 150: 'Rascunho', 203: 'Etiquetadora térmica comum', 300: 'Máxima: impressão nítida' }[v] || ''; }
// Tamanho da imagem gerada, em pixels
function _cqEtqDpiInfo(c) {
  const [w, h] = _cqEtqFisico(c), px = mm => Math.round(mm * c.dpi / 25.4);
  return `${px(w)} × ${px(h)} pontos em ${String(w).replace('.', ',')} × ${String(h).replace('.', ',')} mm · ${_cqEtqDpiDica(c.dpi).toLowerCase()}. Vale para o PDF e para a impressão; o tamanho físico continua o da etiqueta.`;
}
function _cqEtqLer(px) { return _cqEtqNorm({ modo: _cqVal(px + '-modo'), largura: _cqVal(px + '-l'), altura: _cqVal(px + '-a'), rot: _cqVal(px + '-rot'), dpi: _cqVal(px + '-dpi') }); }
function cqEtqDpi(px, v) {
  const h = document.getElementById(px + '-dpi');
  if (h) h.value = v;
  document.querySelectorAll(`#${px}-dpiseg button`).forEach(b => b.classList.toggle('active', Number(b.dataset.k) === v));
  cqEtqMudou(px);
}
function cqEtqRot(px, r) {
  const h = document.getElementById(px + '-rot');
  if (h) h.value = r;
  document.querySelectorAll(`#${px}-rotseg button`).forEach(b => b.classList.toggle('active', Number(b.dataset.k) === r));
  cqEtqMudou(px);
}
function cqEtqModo(px, k) {
  const h = document.getElementById(px + '-modo');
  if (h) h.value = k;
  document.querySelectorAll(`#${px}-seg button`).forEach(b => b.classList.toggle('active', b.dataset.k === k));
  cqEtqMudou(px);
}
function cqEtqPreset(px, v) {
  if (v) {
    const [l, a] = v.split('x');
    const el = document.getElementById(px + '-l'), ea = document.getElementById(px + '-a');
    if (el) el.value = l;
    if (ea) ea.value = a;
  }
  cqEtqMudou(px);
}
function cqEtqMudou(px) {
  const c = _cqEtqLer(px);
  const sel = document.getElementById(px + '-pre');
  if (sel) sel.value = CQ_ETQ_TAMANHOS.some(([l, a]) => l === c.largura && a === c.altura) ? `${c.largura}x${c.altura}` : '';
  const info = document.getElementById(px + '-dpi-info');
  if (info) info.innerHTML = _cqEtqDpiInfo(c);
  const prev = document.getElementById(px + '-prev');
  if (prev) prev.innerHTML = _cqEtqPrevHTML(px === 'cq-etqp' && _cqEtqDadosAtual ? _cqEtqDadosAtual : _cqEtqExemplo(), c);
}
// Configurações › Etiquetas de preparo (esta estação)
function cqEtqSalvarCfgForm() {
  const l = Number(_cqVal('cq-etqc-l')), a = Number(_cqVal('cq-etqc-a'));
  if (!(l >= 20 && l <= 150) || !(a >= 10 && a <= 100)) { showToast('Tamanho inválido: largura de 20 a 150 mm e altura de 10 a 100 mm.', 'error'); return; }
  if (!_cqEtqSalvarCfg(_cqEtqLer('cq-etqc'))) { showToast('Não foi possível gravar neste navegador.', 'error'); return; }
  showToast('Configuração de etiquetas salva nesta estação.', 'success');
}

function _cqEtqImprimir(d, cfg, copias) {
  const folha = cfg.modo === 'folha';
  const css = folha
    ? '@page{size:A4;margin:8mm}html,body{margin:0}body{display:flex;flex-wrap:wrap;gap:2mm;align-content:flex-start}.etq{break-inside:avoid;page-break-inside:avoid}'
    : `@page{size:${_cqEtqFisico(cfg).join('mm ')}mm;margin:0}html,body{margin:0;padding:0}.etq{break-after:page;page-break-after:always}.etq:last-child{break-after:auto;page-break-after:auto}`;
  // A etiqueta vai impressa como a mesma imagem do PDF, na resolução escolhida (dpi do ajuste),
  // com o tamanho físico em mm: a impressora recebe exatamente os pontos que vai imprimir
  const [fw, fh] = _cqEtqFisico(cfg);
  // d: uma etiqueta ou uma lista (ex.: um preparo de controle por nível); cada uma sai em `copias` cópias
  const ds = Array.isArray(d) ? d : [d];
  const etqs = ds.map(x => {
    try {
      const src = _cqEtqCanvas(x, cfg, cfg.dpi || 300).toDataURL('image/png');
      return `<div class="etq" style="box-sizing:border-box;width:${fw}mm;height:${fh}mm;overflow:hidden;background:#fff;${folha ? 'border:0.2mm dashed #999;' : ''}"><img src="${src}" alt="" style="display:block;width:100%;height:100%;image-rendering:${(cfg.dpi || 300) < 200 ? 'pixelated' : 'auto'};"></div>`;
    } catch (err) {
      console.error('[cq-cadastros.js] _cqEtqImprimir: imagem da etiqueta', err);
      return _cqEtiquetaHTML(x, cfg, folha);   // sem canvas: imprime o layout em mm
    }
  });
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Etiqueta ${_cqEsc(ds[0].codigo || ds[0].lote)}${ds.length > 1 ? ` (+${ds.length - 1})` : ''}</title>
    <style>*{-webkit-print-color-adjust:exact;print-color-adjust:exact}${css}</style></head>
    <body>${etqs.map(e => `<template class="etq-t">${e}</template>`).join('')}<script>
      // Cada imagem vai uma vez no HTML e é clonada para cada cópia
      document.querySelectorAll('template.etq-t').forEach(tp => {
        const t = tp.content.firstElementChild;
        for (let i = 0; i < ${copias}; i++) document.body.appendChild(t.cloneNode(true));
      });
      window.onload = () => window.print();
    <\/script></body></html>`;
  return imprimirEmSegundoPlano(html);
}

// ── Desenho da etiqueta: linhas de texto já posicionadas (px no dpi pedido, eixo y para baixo, sem giro) ──
// Usado pela imagem da impressão (canvas) e pelo PDF (texto), que assim saem com o mesmo layout e os mesmos cortes.
function _cqEtqDesenho(d, cfg, dpi = 300) {
  const pxmm = dpi / 25.4;
  const ctx = document.createElement('canvas').getContext('2d');   // só para medir o texto
  const W = cfg.largura * pxmm, H = cfg.altura * pxmm;
  const { pad, esc, nv } = _cqEtqLayout(d, cfg.largura, cfg.altura);
  const P = pad * pxmm, iw = W - 2 * P;
  const tam = mm => mm * esc * pxmm;
  const fonte = (peso, px) => `${peso} ${px.toFixed(2)}px Arial, Helvetica, sans-serif`;
  const ops = [];
  // y = topo do texto; guarda a linha de base (Arial: topo do quadrado da letra a 0,81 do tamanho)
  const texto = (t, x, y, peso, px) => { if (t) ops.push({ t: String(t), x, y: y + px * 0.81, peso, px }); };
  // Corta com reticências o texto que não cabe na largura
  const caber = (txt, larg) => {
    if (ctx.measureText(txt).width <= larg) return txt;
    let t = txt;
    while (t.length > 1 && ctx.measureText(t + '…').width > larg) t = t.slice(0, -1);
    return t.trimEnd() + '…';
  };
  // Título: quebra por palavras em até nv.tit linhas
  ctx.font = fonte(700, tam(3.4));
  const linhasTit = [];
  let atual = '';
  String(d.produto || '').split(/\s+/).filter(Boolean).forEach(p => {
    const t = atual ? `${atual} ${p}` : p;
    if (ctx.measureText(t).width <= iw || !atual) atual = t; else { linhasTit.push(atual); atual = p; }
  });
  if (atual) linhasTit.push(atual);
  const tit = linhasTit.slice(0, nv.tit);
  if (linhasTit.length > nv.tit) tit[tit.length - 1] = caber(`${tit[tit.length - 1]} ${linhasTit.slice(nv.tit).join(' ')}`, iw);
  const segs = _cqEtqSegs(d);
  const blocos = [
    ...tit.map(t => ({ h: 3.4 * 1.15, fn: y => { const px = tam(3.4); ctx.font = fonte(700, px); texto(caber(t, iw), P, y, 700, px); } })),
    ...(d.codigo ? [{ h: 4.2 * 1.15, fn: y => { const px = tam(4.2); ctx.font = fonte(800, px); texto(caber(d.codigo, iw), P, y, 800, px); } }] : []),
    ...nv.linhas.map(k => segs[k]).filter(Boolean).map(sg => ({ h: 2.7 * 1.18, fn: y => {
      // Todo o texto em negrito (impressão térmica sem falhas); o destaque [texto, 1] fica igual ao resto
      const larg = () => sg.reduce((n, [t]) => { ctx.font = fonte(700, tam(2.7)); return n + ctx.measureText(t).width; }, 0);
      const px = tam(2.7) * Math.min(1, iw / (larg() || 1));   // linha longa: encolhe para caber
      let x = P;
      sg.forEach(([t]) => { ctx.font = fonte(700, px); texto(t, x, y, 700, px); x += ctx.measureText(t).width; });
    } })),
  ];
  const gap = 0.35 * esc * pxmm;
  const total = blocos.reduce((n, b) => n + b.h * esc * pxmm, 0) + gap * (blocos.length - 1);
  let y = (H - total) / 2;
  blocos.forEach(b => { b.fn(y + (b.h - (b.h / 1.16)) * esc * pxmm / 2); y += b.h * esc * pxmm + gap; });
  return { W, H, ops, fonte };
}

// ── Imagem da etiqueta (dpi do ajuste, até 300) para a impressão ──
function _cqEtqCanvas(d, cfg, dpi = 300) {
  const pxmm = dpi / 25.4;
  const [fw, fh] = _cqEtqFisico(cfg);
  const { W, H, ops, fonte } = _cqEtqDesenho(d, cfg, dpi);
  const cv = document.createElement('canvas');
  cv.width = Math.round(fw * pxmm);
  cv.height = Math.round(fh * pxmm);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.translate(cv.width / 2, cv.height / 2);
  ctx.rotate((cfg.rot || 0) * Math.PI / 180);
  ctx.translate(-W / 2, -H / 2);
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'alphabetic';
  ops.forEach(o => { ctx.font = fonte(o.peso, o.px); ctx.fillText(o.t, o.x, o.y); });
  return cv;
}

// ── Etiqueta em PDF: uma página no tamanho físico da etiqueta, com texto (selecionável e nítido) ──
// PDF montado aqui mesmo (sem biblioteca), nas fontes padrão Helvetica/Helvetica-Bold (mesmas
// medidas da Arial usada no layout) com codificação WinAnsi, que cobre os acentos do português.
const CQ_ETQ_WINANSI = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99 };
function _cqEtqPdfTexto(s) {
  let r = '';
  for (const ch of String(s)) {
    let c = ch.codePointAt(0);
    if (CQ_ETQ_WINANSI[ch]) c = CQ_ETQ_WINANSI[ch];
    else if (c > 0xFF || (c >= 0x80 && c < 0xA0)) c = 0x3F;    // fora da WinAnsi: '?'
    if (c === 0x28 || c === 0x29 || c === 0x5C) r += '\\' + ch;
    else if (c < 0x20 || c > 0x7E) r += '\\' + c.toString(8).padStart(3, '0');
    else r += ch;
  }
  return r;
}
function _cqEtqPDFBlob(d, cfg) {
  const dpi = cfg.dpi || 300;
  const k = 72 / dpi;                          // px do layout → pontos do PDF
  const n = v => String(Math.round(v * 1000) / 1000);
  const [fw, fh] = _cqEtqFisico(cfg);
  const PW = fw * 72 / 25.4, PH = fh * 72 / 25.4;
  const { W, H, ops } = _cqEtqDesenho(d, cfg, dpi);
  const a = (cfg.rot || 0) * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
  // Mesmo sistema do canvas: y para baixo, giro em torno do centro da etiqueta
  const desenho = [
    `q 1 0 0 -1 0 ${n(PH)} cm`,
    `1 0 0 1 ${n(PW / 2)} ${n(PH / 2)} cm`,
    `${n(cos)} ${n(sin)} ${n(-sin)} ${n(cos)} 0 0 cm`,
    `1 0 0 1 ${n(-W * k / 2)} ${n(-H * k / 2)} cm`,
    '0 g BT',
    ...ops.map(o => `/${o.peso >= 700 ? 'F2' : 'F1'} ${n(o.px * k)} Tf 1 0 0 -1 ${n(o.x * k)} ${n(o.y * k)} Tm (${_cqEtqPdfTexto(o.t)}) Tj`),
    'ET Q',
  ].join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(PW)} ${n(PH)}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Length ${desenho.length} >>\nstream\n${desenho}\nendstream`,
  ];
  // Tudo em ASCII: posição em bytes = posição na string
  let pdf = '%PDF-1.4\n';
  const offs = objs.map((o, i) => { const pos = pdf.length; pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; return pos; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Blob([pdf], { type: 'application/pdf' });
}
function _cqEtqBaixarPDF(d, cfg) {
  try {
    const blob = _cqEtqPDFBlob(d, cfg);
    const nome = `etiqueta-${String(d.codigo || d.lote || 'preparo').replace(/[^\w.-]+/g, '_')}.pdf`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    showToast(`Etiqueta salva em ${nome}.`, 'success');
  } catch (err) {
    console.error('[cq-cadastros.js] _cqEtqBaixarPDF:', err);
    showToast('Não foi possível gerar o PDF.', 'error');
  }
}
// Botão da janela de impressão (usa o ajuste atual) e das listas de preparos (usa o da estação)
function cqEtqBaixarPrompt() { if (_cqEtqDadosAtual) _cqEtqBaixarPDF(_cqEtqDadosAtual, _cqEtqLer('cq-etqp')); }
function cqEtqBaixar(id, prepId) {
  const i = cqState.config.insumos[id];
  const pr = i ? _cqPreparo(i, prepId) : null;
  if (!pr) return;
  _cqEtqBaixarPDF(_cqEtqDados(i, pr), _cqEtqCfg());
}

// Janela de impressão: prévia, cópias (padrão 1) e ajuste rápido
function cqImprimirRotulo(id, prepId) {
  const i = cqState.config.insumos[id];
  if (!i?.preparoInterno) return;
  const pr = _cqPreparo(i, prepId) || _cqPreparosDe(i)[0];
  if (!pr) { showToast('Nenhum preparo para imprimir.', 'error'); return; }
  _cqEtqDialogo(_cqEtqDados(i, pr), 'Imprimir etiqueta', `${i.nome} · ${pr.codigo || 'lote ' + i.lote}`);
}

// Janela de impressão de uma etiqueta já montada (preparo, ciclo de esterilização): prévia, PDF, cópias e ajuste
function _cqEtqDialogo(d, titulo, subtitulo, aviso = '') {
  _cqEtqDadosAtual = d;
  const cfg = _cqEtqCfg();
  _cqPrompt({
    titulo, subtitulo, confirmar: 'Imprimir',
    corpo: `${aviso}<div class="cq-etq-prev-wrap"><div class="cq-etq-prev" id="cq-etqp-prev">${_cqEtqPrevHTML(d, cfg)}</div>
        <button type="button" class="cq-etq-baixar" title="Baixar etiqueta em PDF (qualidade em Ajustar impressão)" onclick="cqEtqBaixarPrompt()">${CQ_ICO.baixar} PDF</button></div>
      <div class="cq-etq-lin">
        <div class="form-field"><label class="field-label">Cópias</label>
          <input type="number" id="cq-etqp-copias" class="field-input" min="1" max="300" step="1" value="1" onkeydown="if(event.key==='Enter')cqPromptConfirmar()"></div>
      </div>
      <details class="cq-etq-det"><summary>Ajustar impressão</summary>${_cqEtqCamposHTML('cq-etqp', cfg)}
        <div class="cq-nota">O ajuste fica salvo nesta estação (também em Configurações › Controle de Qualidade). Na etiquetadora, use o mesmo tamanho de papel no driver da impressora.</div></details>`,
    onConfirm: () => {
      const n = Number(_cqVal('cq-etqp-copias'));
      if (!(Number.isInteger(n) && n >= 1 && n <= 300)) { showToast('Cópias: de 1 a 300.', 'error'); return false; }
      const c = _cqEtqLer('cq-etqp');
      _cqEtqSalvarCfg(c);
      return _cqEtqImprimir(d, c, n);
    },
  });
}

// ── ABA PREPAROS ────────────────────────────────────────────
// Registro rápido de preparos (meio reconstituído, corante diluído, reagente fracionado) fora do
// lançamento da corrida. Grava em insumos/{id}/preparos/{pid}, o mesmo lugar dos preparos criados
// no lançamento, que passa a oferecê-los. Cada preparo recebe um código sequencial por lote
// (LOTE-P01…) para identificar frasco, tubos ou placas.
const CQ_PREP_FIN_PADRAO = 'Preparo acabou (consumido ou descartado)';
const CQ_UNID_PREPARO = ['mL', 'L', 'g', 'placas', 'tubos', 'frascos', 'alíquotas', 'lâminas'];
let _cqPrepFiltro = 'em_uso';     // em_uso | finalizados | todos
let _cqPrepProds = [];            // filtro de produtos (ids)
let _cqPrepNovo = null;           // rascunho do formulário (sobrevive às atualizações vindas do banco)
let _cqPrepDestaque = null;       // preparo recém-registrado (destacado na lista)
let _cqPrepBusca = null;          // busca por código (null = lupa fechada)
// Compara só letras e números: "1690 n1", "1690-N1" e "1690n1" encontram 1690-N1-P01
const _cqPrepBuscaNorm = v => _cqNormBusca(String(v || '')).replace(/[^a-z0-9]/g, '');
function _cqPrepBuscaBate(p) { const q = _cqPrepBuscaNorm(_cqPrepBusca); return !q || _cqPrepBuscaNorm(p?.codigo).includes(q); }
// Lupa que se abre no próprio campo (sem redesenhar a aba)
function cqPrepBuscaAbrir() {
  const box = document.getElementById('cq-prep-busca-box'), inp = document.getElementById('cq-prep-busca');
  if (!box || !inp) return;
  if (box.classList.contains('aberta') && !inp.value) { cqPrepBuscaFechar(); return; }
  box.classList.add('aberta');
  _cqPrepBusca = inp.value;
  inp.focus();
}
function cqPrepBuscaFechar() {
  const box = document.getElementById('cq-prep-busca-box'), inp = document.getElementById('cq-prep-busca');
  if (inp) inp.value = '';
  box?.classList.remove('aberta');
  const tinha = !!_cqPrepBusca;
  _cqPrepBusca = null;
  if (tinha) _cqPrepAbaLista();
}
function cqPrepBuscar(v) { _cqPrepBusca = v; _cqPrepAbaLista(); }

function _cqPodeRegistrarPreparo() { return _cqCan('lancar') || _cqCan('configurar'); }
// Atalho do cabeçalho: Cadastros › Preparos
function cqAbrirPreparos() { _cqCadTab = 'preparos'; _cqCadExp.clear(); cqNav('cadastros'); }
function cqPrepFiltro(v) { _cqPrepFiltro = v; cqRender(); }

// Próximo número de preparo do lote (os antigos, sem número, também contam)
function _cqPrepSeq(ins) {
  const ps = Object.values(_cqLoteCru(ins)?.preparos || {}).filter(p => p && p.id);
  return Math.max(ps.length, Number(_cqLoteCru(ins)?.preparoSeq) || 0, ...ps.map(p => Number(p.seq) || 0)) + 1;
}
function _cqPrepCodigo(ins, seq) { return `${ins.lote}-P${String(seq).padStart(2, '0')}`; }
function _cqPrepQtdTxt(p) { return p?.quantidade ? `${String(p.quantidade).replace('.', ',')} ${p.unidadeQtd || ''}`.trim() : ''; }
// Unidade de quantidade usada no último preparo do produto (sugestão do formulário)
function _cqPrepUltimaUnidade(produtoId) {
  if (!produtoId) return '';
  const ps = _cqLotesDoProduto(produtoId).flatMap(i => Object.values(_cqLoteCru(i).preparos || {})).filter(p => p?.unidadeQtd);
  ps.sort((a, b) => (b.criadoEm || '').localeCompare(a.criadoEm || ''));
  return ps[0]?.unidadeQtd || '';
}
// Produtos preparados no laboratório da unidade (ativos)
function _cqPrepProdutos(u) {
  return _cqDaUnidade('insumoProdutos', u).filter(p => p.preparoInterno && p.ativo !== false && _cqProdutoPassaSetor(p, u))
    .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt'));
}
// Lotes do produto que aceitam preparo: na unidade, em uso ou em avaliação e dentro da validade (em uso primeiro)
function _cqPrepLotesValidos(produtoId, u, dia) {
  const ord = l => ((l.status || 'em_uso') === 'em_uso' ? 0 : 1);
  return _cqLotesDoProduto(produtoId).filter(i => _cqNaUnidade(i, u) && ['em_uso', 'em_avaliacao'].includes(i.status || 'em_uso') && !_cqLoteVencido(i, dia))
    .sort((a, b) => ord(a) - ord(b) || (a.validade || '').localeCompare(b.validade || ''));
}
// Todos os preparos dos lotes da unidade preparados no laboratório
function _cqPrepAbaItens(u) {
  return _cqDaUnidade('insumos', u).filter(i => i.preparoInterno && _cqProdutoPassaSetor(_cqProdutoInsumo(i) || i, u)).flatMap(i => _cqPreparosDe(i).map(p => ({ i, p })));
}
function _cqPrepDias(de, ate) { return Math.round((Date.parse(ate + 'T00:00:00Z') - Date.parse(de + 'T00:00:00Z')) / 864e5); }

// Rascunho do formulário, com produto, lote e unidade sugeridos
function _cqPrepNovoEstado(u) {
  if (!_cqPrepNovo || _cqPrepNovo.u !== u) _cqPrepNovo = { u, prod: '', lote: '', qtd: '', un: '', dh: '', resp: _cqSess().id, obs: '', valEdit: false, val: '', valMot: '' };
  const n = _cqPrepNovo;
  // Responsável precisa ser membro da unidade com permissão de lançar/configurar o CQ
  const resps = _cqPrepResponsaveis(u);
  if (!resps.some(x => x.id === n.resp)) n.resp = resps.some(x => x.id === _cqSess().id) ? _cqSess().id : (resps[0]?.id || '');
  const prods = _cqPrepProdutos(u);
  if (!prods.some(p => p.id === n.prod)) { n.prod = prods.length === 1 ? prods[0].id : ''; n.lote = ''; n.un = ''; }
  const lotes = n.prod ? _cqPrepLotesValidos(n.prod, u, (n.dh || _cqNowLocal()).slice(0, 10)) : [];
  if (!lotes.some(l => l.id === n.lote)) n.lote = lotes[0]?.id || '';
  // Volume padrão do produto: preenche quantidade e unidade ao escolher o produto (uma vez por escolha)
  const pf = n.prod ? cqState.config.insumoProdutos[n.prod]?.preparo : null;
  if (n.prod && n.qtdProd !== n.prod) { n.qtdProd = n.prod; if (pf?.volume && n.qtd === '') n.qtd = String(pf.volume); if (pf?.unidadeQtd) n.un = pf.unidadeQtd; }
  if (n.prod && !n.un) n.un = pf?.unidadeQtd || _cqPrepUltimaUnidade(n.prod) || 'mL';
  return n;
}
function cqPrepNovoCampo(k, v, redesenhar) {
  const n = _cqPrepNovo;
  if (!n) return;
  n[k] = v;
  if (k === 'prod') { n.lote = ''; n.un = ''; n.qtd = ''; n.qtdProd = ''; }
  // Validade alterada vale para o produto, o lote e a data escolhidos: muda junto com eles
  if (['prod', 'lote', 'dh'].includes(k) || (k === 'valEdit' && !v)) { n.val = ''; if (k === 'valEdit') n.valMot = ''; }
  if (redesenhar) _cqPrepFormRedesenhar();
}
function _cqPrepFormRedesenhar() {
  const w = document.getElementById('cq-prep-form-wrap');
  if (w) w.innerHTML = _cqPrepFormHTML(_cqUnidadeAtivaId());
}

function _cqPrepFormHTML(u) {
  const prods = _cqPrepProdutos(u);
  // Área só com controles preparados (ex.: IMU): lista os controles; escolher abre o registro por nível
  const ctl = !prods.length ? _cqCtlPrepPopGrupoHTML(u, _cqHoje()) : '';
  if (ctl) return `<div class="cq-prep-form"><div class="cq-nota" style="margin-bottom:10px;">Escolha o controle: cada nível do lote ganha um preparo, um código e uma etiqueta.</div>
    <div class="cq-tp-lista cq-prep-ctl-lista">${ctl}</div></div>`;
  if (!prods.length) return `<div class="cq-prep-form cq-prep-form-vazio">${CQ_ICO.beaker}<div><b>Nenhum produto preparado no laboratório nesta área.</b>
    <small>Marque “Preparado ou fracionado pelo laboratório” no cadastro do produto (aba Reagentes, meios e insumos) ou “Preparado no laboratório” no material de controle.</small></div></div>`;
  const n = _cqPrepNovoEstado(u);
  const agora = _cqNowLocal().slice(0, 16);
  const dh = n.dh || agora;
  const dia = dh.slice(0, 10);
  const p = cqState.config.insumoProdutos[n.prod];
  const lotes = n.prod ? _cqPrepLotesValidos(n.prod, u, dia) : [];
  const ins = n.lote ? cqState.config.insumos[n.lote] : null;
  const pf = p?.preparo || {};
  const valPadrao = ins ? _cqPrepValidade(ins, dia) : null;
  const val = ins ? (n.valEdit && n.val ? n.val : valPadrao) : null;
  const optsLote = lotes.length
    ? lotes.map(l => `<option value="${l.id}" ${l.id === n.lote ? 'selected' : ''}>${_cqEsc(l.lote)} · val. ${_cqFmtData(l.validade)}${(l.status || 'em_uso') === 'em_avaliacao' ? ' · em avaliação' : ''}</option>`).join('')
    : `<option value="">${n.prod ? 'Nenhum lote em uso dentro da validade' : 'Escolha o produto'}</option>`;
  const seq = ins ? _cqPrepSeq(ins) : 0;
  const cod = ins ? _cqPrepCodigo(ins, seq) : '';
  const diasVal = val ? _cqPrepDias(dia, val) : null;
  const icoTag = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><circle cx="7" cy="7" r="1.5" fill="currentColor"/></svg>';
  // Informações do produto e do lote escolhidos
  const prepsLote = ins ? _cqPreparosDe(ins) : [];
  const emUso = prepsLote.filter(x => !x.finalizado);
  const ult = prepsLote[0];
  const lin = (l, v) => v ? `<div class="cq-pf-info-lin"><span>${l}</span><b>${v}</b></div>` : '';
  const info = p ? `<div class="cq-pf-info">
      <div class="cq-pf-info-tit">${CQ_ICO.info} Informações do produto</div>
      <div class="cq-pf-info-grid">
        ${lin('Tipo', _cqEsc(CQ_TIPOS_INSUMO[p.tipo] || p.tipo))}
        ${lin('Fabricante', _cqEsc(p.fabricante || '—'))}
        ${lin('Concentração / especificação', _cqEsc(pf.especificacao || '—'))}
        ${lin('Armazenamento', _cqEsc(pf.armazenamento || '—'))}
        ${lin('Riscos', _cqEsc(pf.riscos || 'Ver FISPQ'))}
        ${lin('Validade após o preparo', pf.validadeDias ? `${pf.validadeDias} dia(s), limitada à do lote` : 'a do lote')}
        ${ins ? lin('Lote do produto', `${_cqEsc(ins.lote)} · val. ${_cqFmtData(ins.validade)} · ${_cqEsc(CQ_STATUS_LOTE[ins.status || 'em_uso']?.label || '')}`) : ''}
        ${ins ? lin('Uso', ins.preparoUsoUnico ? 'Único — um preparo por corrida' : 'Um preparo serve a várias corridas') : ''}
        ${ins ? lin('Preparos em uso deste lote', emUso.length ? `${emUso.length} (${_cqEsc(emUso.slice(0, 3).map(x => x.codigo || _cqFmtData(x.data)).join(', '))}${emUso.length > 3 ? '…' : ''})` : 'nenhum') : ''}
        ${ult ? lin('Último preparo', _cqEsc([_cqFmtData(ult.data), _cqPrepQtdTxt(ult), ult.responsavel].filter(Boolean).join(' · '))) : ''}
      </div>
    </div>` : '';
  return `<div class="cq-prep-form">
    <div class="cq-pf-cod${ins ? '' : ' vazio'}">
      <span class="cq-pf-cod-ico">${icoTag}</span>
      <div class="cq-pf-cod-txt"><small>Código do preparo</small><b>${ins ? _cqEsc(cod) : '— — —'}</b>
        <span>${ins ? `${seq}º preparo do lote ${_cqEsc(ins.lote)} · gerado automaticamente e impresso na etiqueta` : 'Escolha o produto e o lote para gerar o código'}</span></div>
      ${val ? `<div class="cq-pf-cod-val${val !== valPadrao ? ' alterada' : ''}" title="Data do preparo + validade do produto, limitada à validade do lote"><small>Validade${val !== valPadrao ? ' alterada' : ''}</small><b>${_cqFmtData(val)}</b><span>${diasVal} dia(s)</span>
        <button type="button" class="cq-pf-val-alt" onclick="cqPrepNovoCampo('valEdit',${!n.valEdit},true)">${n.valEdit ? 'Usar padrão' : 'Alterar'}</button></div>` : ''}
    </div>
    ${ins && n.valEdit ? _cqPrepValidadeEditHTML({ id: 'cq-pf-val', dia, padrao: valPadrao, max: ins.validade, valor: val, motivo: n.valMot,
        onData: "cqPrepNovoCampo('val',this.value,true)", onMotivo: "cqPrepNovoCampo('valMot',this.value)" }) : ''}
    <div class="cq-prep-form-grid">
      <div class="form-field"><label class="field-label">Produto</label>
        ${_cqPrepProdPopHTML(prods, n, dia, u)}</div>
      <div class="form-field"><label class="field-label">Lote</label>
        <select class="field-select" ${lotes.length ? '' : 'disabled'} onchange="cqPrepNovoCampo('lote',this.value,true)">${optsLote}</select></div>
      <div class="form-field"><label class="field-label">Quantidade preparada <span class="required">*</span></label>
        <div class="cq-pf-qtd"><input type="number" class="field-input" min="0" step="any" inputmode="decimal" value="${_cqEsc(n.qtd)}" placeholder="0" oninput="cqPrepNovoCampo('qtd',this.value)">
        <select class="field-select" title="Unidade" onchange="cqPrepNovoCampo('un',this.value)">${CQ_UNID_PREPARO.map(x => `<option ${x === n.un ? 'selected' : ''}>${x}</option>`).join('')}</select></div></div>
      <div class="form-field"><label class="field-label">Data e hora</label>
        <input type="datetime-local" class="field-input" max="${agora}" value="${dh}" onchange="cqPrepNovoCampo('dh',this.value,true)"></div>
      <div class="form-field cq-pf-obs"><label class="field-label">Responsável</label>
        ${_cqPrepRespHTML(u, n)}</div>
      <div class="form-field cq-pf-obs"><label class="field-label">Observações</label>
        <textarea class="field-textarea cq-pf-obs-txt" maxlength="500" rows="4" placeholder="Opcional — ex.: pH 7,32; 25 placas de 90 mm; esterilizado no ciclo AC1-…" oninput="cqPrepNovoCampo('obs',this.value)">${_cqEsc(n.obs)}</textarea></div>
    </div>
    ${info}
  </div>`;
}

// Janela lateral de registro do preparo (botão "Novo preparo" da aba; prodId vem do painel,
// quando o produto está sem preparo em uso, e já deixa o produto escolhido)
function cqPrepNovoAbrir(prodId) {
  if (!_cqPodeRegistrarPreparo()) { showToast('Sem permissão para registrar preparos.', 'error'); return; }
  const u = _cqUnidadeAtivaId();
  if (prodId) {
    const n = _cqPrepNovoEstado(u);
    if (n.prod !== prodId) { n.prod = prodId; n.lote = ''; n.un = ''; }
  }
  cqDrawerOpen({
    titulo: 'Novo preparo', subtitulo: 'Meio reconstituído, corante diluído ou reagente fracionado', icone: 'beaker',
    corpo: `<div id="cq-prep-form-wrap" class="cq-prep-modal">${_cqPrepFormHTML(u)}</div>`,
    rodape: `<div></div><div style="display:flex;gap:8px;"><button class="btn btn-outline" onclick="cqDrawerClose()">Cancelar</button>
      <button class="btn btn-primary" onclick="cqPrepRegistrar()">${CQ_ICO.plus} Registrar preparo</button></div>`,
  });
}
// Responsáveis possíveis: membros da unidade com permissão de lançar ou configurar o CQ
function _cqPrepResponsaveis(u) { return _cqUsuariosDaUnidade(u); }
function _cqPrepRespHTML(u, n) {
  const resps = _cqPrepResponsaveis(u);
  if (!resps.length) return '<div class="cq-nota cq-txt-amarelo">Nenhum membro da área com permissão de lançar no CQ. Inclua os membros em Configurações › Área.</div>';
  return _cqUsuarioPopHTML('cq-pf-resp', u, resps, n.resp, v => cqPrepNovoCampo('resp', v));
}
// Popover de pessoa: iniciais, nome e papel na unidade
function _cqUsuarioPopHTML(id, u, users, atual, onchange) {
  const ini = x => (x.nomeCompleto || x.username || '?').trim().split(/\s+/).filter(Boolean).map((p, i, a) => (i === 0 || i === a.length - 1 ? p[0] : '')).join('').toUpperCase();
  const ops = users.map(x => ({ value: x.id, label: x.nomeCompleto || x.username,
    desc: [CQ_PAPEIS[_cqPapel(u, x.id)] || 'fora da área', x.id === _cqSess().id ? 'você' : ''].filter(Boolean).join(' · '),
    ico: `<b class="cq-av">${_cqEsc(ini(x))}</b>` }));
  return _cqPopSelHTML(id, ops, atual, { onchange });
}

// Produto do novo preparo: popover com busca, agrupado por equipamento/sistema (segue o filtro da aba)
function _cqPrepProdPopHTML(prods, n, dia, u) {
  const visiveis = prods.filter(_cqPrepServeEquip);
  const sel = cqState.config.insumoProdutos[n.prod];
  const sel2 = _cqPrepEquips.length ? new Set(_cqPrepEquips.map(_cqEquipChave)) : null;
  const grupos = new Map();
  visiveis.forEach(p => {
    const eqs = _cqEquipsInsumo(p).filter(k => !sel2 || sel2.has(_cqEquipChave(k)));
    (eqs.length ? eqs : ['']).forEach(k => {
      const g = k ? _cqRotuloEquip(k) : 'Qualquer equipamento';
      if (!grupos.has(g)) grupos.set(g, { ico: !k || k.startsWith('a:') ? CQ_ICO.ativo : CQ_ICO.beaker, prods: [] });
      grupos.get(g).prods.push(p);
    });
  });
  const item = p => {
    const nl = _cqPrepLotesValidos(p.id, u, dia).length;
    return `<button type="button" class="cq-sitpop-op${p.id === n.prod ? ' sel' : ''}${nl ? '' : ' sem-lote'}" data-b="${_cqEsc(_cqNormBusca(`${p.nome} ${p.fabricante || ''}`))}" onclick="cqPrepProdEscolher('${p.id}')">
      <span class="cq-sitpop-marca"><span class="cq-sitpop-ico">${CQ_ICO.beaker}</span></span>
      <span class="cq-sitpop-txt"><b>${_cqEsc(p.nome)}</b><small>${_cqEsc([p.fabricante, nl ? `${nl} lote(s) em uso` : 'sem lote em uso dentro da validade'].filter(Boolean).join(' · '))}</small></span>
      <svg class="cq-sitpop-ok" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><polyline points="20 6 9 17 4 12"/></svg></button>`;
  };
  const gruposHTML = [...grupos.entries()].sort(([a], [b]) => (a === 'Qualquer equipamento') - (b === 'Qualquer equipamento') || a.localeCompare(b, 'pt'))
    .map(([g, x]) => `<div class="cq-tp-grupo"><div class="cq-tp-grupo-tit">${x.ico}${_cqEsc(g)}<span>${x.prods.length}</span></div>${x.prods.sort((a, b) => a.nome.localeCompare(b.nome, 'pt')).map(item).join('')}</div>`).join('');
  return `<div class="cq-sitpop cq-tp cq-pf-prod" id="cq-pf-prod-pop">
    <button type="button" class="cq-sitpop-btn" onclick="cqSitPopAbrir('cq-pf-prod');setTimeout(()=>document.getElementById('cq-pf-prod-busca')?.focus(),40)">
      <span class="cq-sitpop-marca"><span class="cq-sitpop-ico">${CQ_ICO.beaker}</span></span>
      <span class="cq-tp-rot">${sel ? `<b>${_cqEsc(sel.nome)}</b><small>${_cqEsc([sel.fabricante, CQ_TIPOS_INSUMO[sel.tipo]].filter(Boolean).join(' · '))}</small>` : '<b class="cq-muted">Selecione o produto</b><small>Busque pelo nome ou fabricante</small>'}</span>
      <svg class="cq-sitpop-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></button>
    <div class="cq-sitpop-menu cq-tp-menu">
      <div class="cq-tp-busca">${CQ_ICO.busca}<input type="text" id="cq-pf-prod-busca" placeholder="Buscar produto ou fabricante…" autocomplete="off" oninput="cqPrepProdFiltrar(this.value)"></div>
      ${_cqPrepEquips.length ? `<div class="cq-pf-prod-filtro">${CQ_ICO.ativo} Filtrado pela aba: ${_cqEsc(_cqPrepEquips.map(_cqRotuloEquip).join(', '))}</div>` : ''}
      <div class="cq-tp-lista">${(gruposHTML + _cqCtlPrepPopGrupoHTML(u, dia)) || `<div class="cq-ms-vazio">${_cqPrepEquips.length ? 'Nenhum produto preparado para os equipamentos filtrados na aba.' : 'Nenhum produto preparado no laboratório.'}</div>`}
        <div class="cq-ms-vazio cq-tp-nada" hidden>Nenhum produto encontrado.</div></div>
    </div>
  </div>`;
}
function cqPrepProdFiltrar(q) {
  const t = _cqNormBusca(q || '').trim();
  let algum = false;
  document.querySelectorAll('#cq-pf-prod-pop .cq-tp-grupo').forEach(g => {
    let vis = 0;
    g.querySelectorAll('.cq-sitpop-op').forEach(b => { const ok = !t || b.dataset.b.includes(t); b.hidden = !ok; if (ok) vis++; });
    g.hidden = !vis;
    if (vis) algum = true;
  });
  const nada = document.querySelector('#cq-pf-prod-pop .cq-tp-nada');
  if (nada) nada.hidden = algum;
}
function cqPrepProdEscolher(id) {
  document.getElementById('cq-pf-prod-pop')?.classList.remove('aberto');
  cqPrepNovoCampo('prod', id, true);
}

// Registro do preparo (aba Preparos e troca de conjunto). Produto marcado "liberado no registro"
// dispensa a corrida de CIQ: o preparo já nasce liberado.
function _cqPrepMontar(ins, d, ass, seq) {
  const resp = _cqUsuarios().find(x => x.id === d.respId);
  const livre = !!ins.preparo?.liberaSemCIQ;
  const obj = { id: _cqUid(), seq, codigo: _cqPrepCodigo(ins, seq), data: d.dia, dataHora: d.dh, responsavelId: d.respId || null, responsavel: resp?.nomeCompleto || resp?.username || '',
    quantidade: d.qtd, unidadeQtd: d.un || '', observacoes: (d.obs || '').trim(), validade: d.validade, situacao: livre ? 'liberado' : 'em_avaliacao', legado: false, origem: d.origem || 'preparos',
    criadoEm: ass.em, criadoPor: ass, corridas: {} };
  if (livre) obj.avaliacao = { auto: true, acao: 'liberado', motivo: 'Liberado no registro (produto sem corrida de CIQ)', ...ass };
  if (d.motivoVal) {
    obj.validadePadrao = d.padrao || null;
    obj.validadeAjuste = { de: d.padrao || null, para: d.validade, motivo: d.motivoVal.trim(), ...ass };
  }
  if (d.conjunto) obj.conjunto = d.conjunto;
  return obj;
}
function _cqPrepTrilhaTxt(obj) {
  return `Preparo ${obj.codigo} registrado: ${_cqPrepQtdTxt(obj)} em ${_cqFmtDH(obj.dataHora)} por ${obj.responsavel || '—'}`
    + (obj.conjunto ? (obj.conjunto.fracionada ? ' (troca fracionada)' : ` (troca do conjunto ${obj.conjunto.nome})`) : '')
    + (obj.validadeAjuste ? ` · validade ${_cqFmtData(obj.validade)} em vez de ${_cqFmtData(obj.validadeAjuste.de)}: ${obj.validadeAjuste.motivo}` : '')
    + (obj.observacoes ? ` — ${obj.observacoes}` : '');
}

async function cqPrepRegistrar() {
  if (!_cqPodeRegistrarPreparo()) { showToast('Sem permissão para registrar preparos.', 'error'); return; }
  if (_cqSalvando) return;
  const u = _cqUnidadeAtivaId();
  const n = _cqPrepNovoEstado(u);
  const ins = n.lote ? cqState.config.insumos[n.lote] : null;
  const agora = _cqNowLocal().slice(0, 16);
  const dh = n.dh || agora;
  const dia = dh.slice(0, 10);
  const qtd = Number(String(n.qtd).replace(',', '.'));
  if (!ins) { showToast('Escolha o produto e o lote.', 'error'); return; }
  if (!(qtd > 0)) { showToast('Informe a quantidade preparada.', 'error'); return; }
  if (dh > agora) { showToast('Data e hora do preparo no futuro.', 'error'); return; }
  if (!_cqPrepLotesValidos(n.prod, u, dia).some(l => l.id === ins.id)) { showToast(`Lote ${ins.lote} vencido, em quarentena ou encerrado na data do preparo.`, 'error'); return; }
  const padrao = _cqPrepValidade(ins, dia);
  const alterada = n.valEdit && n.val && n.val !== padrao;
  if (alterada) {
    const erro = _cqPrepValidadeErro({ nova: n.val, dia, max: ins.validade, ref: padrao });
    if (erro) { showToast(erro, 'error'); return; }
    if (!(n.valMot || '').trim()) { showToast('Informe a justificativa da validade alterada.', 'error'); document.getElementById('cq-pf-val-mot')?.focus(); return; }
  }
  const validade = alterada ? n.val : padrao;
  if (validade && validade < _cqHoje()) { showToast(`Preparo já vencido (validade ${_cqFmtData(validade)}).`, 'error'); return; }
  if (!_cqPodeGravar()) return;
  const ass = _cqAssinatura();
  const obj = _cqPrepMontar(ins, { dia, dh, respId: n.resp, qtd, un: n.un, obs: n.obs, validade, padrao, motivoVal: alterada ? n.valMot : '' }, ass, _cqPrepSeq(ins));
  const base = `${CQ_KEYS.config}/insumos/${ins.id}`;
  const updates = {
    [`${base}/preparos/${obj.id}`]: obj,
    [`${base}/atualizadoEm`]: ass.em,
    [`${base}/trilha/${_cqTk()}`]: _cqTrilhaEntry('edicao', _cqPrepTrilhaTxt(obj)),
  };
  _cqSalvando = true;
  try {
    if (!(await window.dbUpdate(updates))) { showToast('Falha ao gravar. Verifique a conexão.', 'error'); return; }
  } finally { _cqSalvando = false; }
  const cru = _cqLoteCru(ins);
  (cru.preparos = cru.preparos || {})[obj.id] = obj;
  if (ins !== cru) ins.preparos = cru.preparos;
  Object.assign(n, { qtd: '', qtdProd: '', dh: '', obs: '', valEdit: false, val: '', valMot: '' });
  _cqPrepDestaque = obj.id;
  if (_cqPrepFiltro === 'finalizados') _cqPrepFiltro = 'em_uso';
  showToast(`Preparo ${obj.codigo} registrado.`, 'success');
  const wrap = document.getElementById('cq-prep-form-wrap');
  if (wrap?.closest('#cq-drawer')) cqDrawerClose(); else if (wrap?.closest('#cq-modal')) cqModalClose();
  cqRender();
}

// Exclusão de preparo nunca usado em corrida (registrado por engano ou em duplicidade).
// Quem configura o CQ ou quem registrou o preparo; cópia vai para o histórico de exclusões e a trilha do lote.
function _cqPrepUsado(p) { return !!p && (p.legado || Object.keys(p.corridas || {}).length > 0); }
function _cqPodeExcluirPreparo(p) {
  if (!p || p.novo || _cqPrepUsado(p)) return false;
  return _cqCan('configurar') || (_cqPodeRegistrarPreparo() && !!p.criadoPor?.porId && p.criadoPor.porId === _cqSess().id);
}
function _cqPrepBtnExcluir(i, p, onde) {
  return _cqPodeExcluirPreparo(p) ? `<button type="button" class="cq-icobtn cq-prep-excl" title="Excluir preparo (nunca usado em corrida)" onclick="event.stopPropagation();cqPreparoExcluir('${i.id}','${p.id}','${onde}')">${CQ_ICO.lixo}</button>` : '';
}
function cqPreparoExcluir(insId, prepId, onde) {
  const i = cqState.config.insumos[insId];
  const p = i ? _cqPreparo(i, prepId) : null;
  if (!p) return;
  if (_cqPrepUsado(p)) { showToast('Preparo já usado em corrida: não pode ser excluído. Finalize-o.', 'error'); return; }
  if (!_cqPodeExcluirPreparo(p)) { showToast('Sem permissão para excluir este preparo.', 'error'); return; }
  if (onde === 'info') cqModalClose();
  const nome = `${p.codigo || 'preparo'} de ${_cqFmtData(p.data)}`;
  _cqPrompt({
    titulo: 'Excluir preparo', subtitulo: `${i.nome} · lote ${i.lote} · ${nome}`, perigo: true, confirmar: 'Excluir',
    corpo: `<div class="cq-nota">Este preparo nunca foi usado em corrida. A exclusão o remove das listas e do lançamento; uma cópia fica no histórico de exclusões e na rastreabilidade do lote.${p.codigo ? ' O código não é reaproveitado.' : ''}</div>
      <div class="form-field"><label class="field-label">Motivo <span class="required">*</span></label>
        <input type="text" id="cq-prep-excl-motivo" class="field-input" maxlength="200" placeholder="Ex.: registrado em duplicidade / quantidade errada" onkeydown="if(event.key==='Enter')cqPromptConfirmar()"></div>`,
    onConfirm: async () => {
      const motivo = _cqVal('cq-prep-excl-motivo');
      if (!motivo) { showToast('Informe o motivo da exclusão.', 'error'); return false; }
      if (!_cqPodeGravar()) return false;
      const pb = `${CQ_KEYS.config}/insumos/${insId}/preparos/${prepId}`;
      // Revalida no banco: outra estação pode ter lançado uma corrida com este preparo
      let atual;
      try { atual = await _cqLerOuFalhar(pb); }
      catch (err) { console.error('[cq-cadastros.js] cqPreparoExcluir:', err); showToast('Falha ao ler o banco. Nada foi excluído.', 'error'); return false; }
      if (!atual) { showToast('Preparo não encontrado no banco.', 'error'); return true; }
      if (Object.keys(atual.corridas || {}).length) { showToast('Este preparo passou a ser usado em corrida. Nada foi excluído.', 'error'); return true; }
      const ass = _cqAssinatura();
      // Mantém a sequência: o próximo preparo não reaproveita o código excluído
      const seqMax = _cqPrepSeq(i) - 1;
      const updates = {
        [pb]: null,
        [`${CQ_KEYS.config}/insumos/${insId}/atualizadoEm`]: ass.em,
        [`${CQ_KEYS.config}/insumos/${insId}/preparoSeq`]: Math.max(seqMax, Number(_cqLoteCru(i).preparoSeq) || 0),
        [`${CQ_KEYS.config}/insumos/${insId}/trilha/${_cqTk()}`]: _cqTrilhaEntry('exclusao', `Preparo ${nome} excluído (nunca usado em corrida): ${motivo}`,
          [{ campo: 'Preparo', antes: [p.codigo, _cqFmtDH(p.dataHora || p.data), p.responsavel, _cqPrepQtdTxt(p)].filter(Boolean).join(' · '), depois: 'excluído' }]),
        [`${CQ_KEYS.exclusoes}/${_cqTk()}`]: { colecao: 'preparos', id: prepId, insumoId: insId, resumo: `${i.nome} · lote ${i.lote} · ${nome}`, motivo, registro: atual, ...ass },
      };
      if (!(await window.dbUpdate(updates))) { showToast('Falha ao excluir. Verifique a conexão e tente novamente.', 'error'); return false; }
      const cru = _cqLoteCru(i);
      if (cru.preparos) delete cru.preparos[prepId];
      cru.preparoSeq = updates[`${CQ_KEYS.config}/insumos/${insId}/preparoSeq`];
      if (i !== cru) i.preparoSeq = cru.preparoSeq;
      showToast(`Preparo ${p.codigo || ''} excluído.`.replace('  ', ' '), 'success');
      if (onde === 'lote') cqInsumoForm(insId, { aba: 'preparos' });
      else cqRender();
      return true;
    },
  });
}

// Barra de validade do preparado: verde, amarela nos últimos 20% do prazo, vermelha vencido
function _cqPrepValidadeBarra(p, hoje) {
  if (!p.validade) return '<span class="cq-muted">—</span>';
  if (p.finalizado) return `<span class="cq-muted">${_cqFmtData(p.validade)}</span>`;
  const tot = Math.max(1, _cqPrepDias(p.data || hoje, p.validade)), rest = _cqPrepDias(hoje, p.validade);
  const pct = rest < 0 ? 100 : Math.max(4, Math.min(100, rest / tot * 100));
  const cls = rest < 0 ? 'venc' : pct <= 20 ? 'fim' : 'ok';
  const txt = rest < 0 ? `vencido há ${-rest} d` : rest === 0 ? 'vence hoje' : `${rest} d`;
  return `<div class="cq-pv ${cls}" title="Validade ${_cqFmtData(p.validade)}"><div class="cq-pv-bar"><i style="width:${pct}%"></i></div><span>${_cqFmtData(p.validade)} · ${txt}</span></div>`;
}

// Filtro de equipamentos/sistemas da aba Preparos: produto sem equipamento no cadastro serve a todos
let _cqPrepEquips = [];
function _cqPrepServeEquip(rec) {
  if (!_cqPrepEquips.length) return true;
  const eqs = _cqEquipsInsumo(rec);
  if (!eqs.length) return true;
  const sel = new Set(_cqPrepEquips.map(_cqEquipChave));
  return eqs.some(k => sel.has(_cqEquipChave(k)));
}
// Produtos preparados da unidade (e os dos preparos listados), já filtrados pelos equipamentos marcados
function _cqPrepProdsAba(u) {
  const prods = new Map(_cqPrepProdutos(u).map(p => [p.id, p]));
  _cqPrepAbaItens(u).forEach(({ i }) => { const p = _cqProdutoInsumo(i); if (p) prods.set(p.id, p); });
  return [...prods.values()];
}
function _cqPrepOpsProd(u) {
  return _cqPrepProdsAba(u).filter(_cqPrepServeEquip).sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt'))
    .map(p => ({ value: p.id, label: p.nome, sub: [CQ_TIPOS_INSUMO[p.tipo], p.fabricante].filter(Boolean).join(' · '), grupo: CQ_TIPOS_INSUMO[p.tipo] || 'Outros' }))
    .concat(_cqCtlPrepOpsProd(u));
}
function _cqPrepOpsEquip(u) {
  // Produtos preparados e controles (materiais) preparados no laboratório ou com preparo na área
  const mats = new Map(_cqCtlMateriaisPrep(u).map(m => [m.id, m]));
  _cqCtlPrepItens(u).forEach(({ mat }) => { if (mat) mats.set(mat.id, mat); });
  const recs = [..._cqPrepProdsAba(u), ...mats.values()];
  const ks = new Map();
  recs.forEach(p => _cqEquipsInsumo(p).forEach(k => { if (!ks.has(_cqEquipChave(k))) ks.set(_cqEquipChave(k), k); }));
  return [...ks.values()].map(k => ({ value: k, label: _cqRotuloEquip(k), grupo: k.startsWith('a:') ? 'Equipamentos' : 'Sistemas e bancadas',
    sub: `${recs.filter(p => _cqEquipsInsumo(p).some(x => _cqEquipChave(x) === _cqEquipChave(k))).length} produto(s)/controle(s)` }))
    .sort((a, b) => a.grupo.localeCompare(b.grupo) || a.label.localeCompare(b.label, 'pt'));
}
function _cqPrepEquipsMudou(v) {
  _cqPrepEquips = v;
  _cqMultiOpcoes('cq-prep-prod', _cqPrepOpsProd(_cqUnidadeAtivaId()));
  _cqPrepProds = _cqMultiVal('cq-prep-prod');
  _cqPrepAbaLista();
}

function _cqPrepAbaHTML(u) {
  const itens = [..._cqPrepAbaItens(u), ..._cqCtlPrepItens(u)];
  const nUso = itens.filter(x => !x.p.finalizado).length;
  const opsEquip = _cqPrepOpsEquip(u);
  _cqPrepEquips = _cqPrepEquips.filter(k => opsEquip.some(o => _cqEquipChave(o.value) === _cqEquipChave(k)));
  const opsProd = _cqPrepOpsProd(u);
  _cqPrepProds = _cqPrepProds.filter(id => opsProd.some(o => o.value === id));
  const seg = [['em_uso', 'Em uso', nUso, CQ_ICO.play], ['finalizados', 'Finalizados', itens.length - nUso, ''], ['todos', 'Todos', null, '']];
  const nCj = typeof _cqConjuntosDaUnidade === 'function' ? _cqConjuntosDaUnidade(u).length : 0;
  return `${typeof _cqTrocasFaixaHTML === 'function' ? _cqTrocasFaixaHTML(u) : ''}
    <div class="cq-toolbar cq-toolbar-wrap">
      <div class="cq-seg cq-cad-ativo" role="group" aria-label="Preparos em uso ou finalizados">${seg.map(([k, l, nn, ico]) => `<button type="button" class="${_cqPrepFiltro === k ? 'active' : ''}" onclick="cqPrepFiltro('${k}')">${ico}${l}${nn !== null ? ` <span class="cq-seg-n">${nn}</span>` : ''}</button>`).join('')}</div>
      <div class="cq-cad-equip">${_cqMultiHTML('cq-prep-equip', opsEquip, _cqPrepEquips, { placeholder: 'Todos os equipamentos e sistemas', resumo: 'equipamentos / sistemas', filtro: true, ico: CQ_ICO.ativo,
        onchange: v => _cqPrepEquipsMudou(v), vazio: 'Nenhum equipamento vinculado aos produtos preparados.' })}</div>
      <div class="cq-cad-equip">${_cqMultiHTML('cq-prep-prod', opsProd, _cqPrepProds, { placeholder: 'Todos os produtos', resumo: 'produtos', filtro: true, ico: CQ_ICO.cadastro,
        onchange: v => { _cqPrepProds = v; _cqPrepAbaLista(); }, vazio: 'Nenhum produto preparado no laboratório nesta área.' })}</div>
      <div class="cq-busca-exp${_cqPrepBusca !== null ? ' aberta' : ''}" id="cq-prep-busca-box">
        <button type="button" class="cq-busca-exp-ico" title="Buscar preparo pelo código" onclick="cqPrepBuscaAbrir()">${CQ_ICO.busca}</button>
        <input type="text" id="cq-prep-busca" placeholder="Buscar código…" autocomplete="off" value="${_cqEsc(_cqPrepBusca || '')}"
          oninput="cqPrepBuscar(this.value)" onkeydown="if(event.key==='Escape')cqPrepBuscaFechar()" onblur="if(!this.value)cqPrepBuscaFechar()">
        <button type="button" class="cq-busca-exp-x" title="Limpar" onmousedown="event.preventDefault()" onclick="cqPrepBuscaFechar()">×</button>
      </div>
      <div class="cq-spacer"></div>
      ${_cqCan('configurar') || nCj ? `<button class="btn btn-outline btn-sm" onclick="cqConjuntosAbrir()" title="Produtos preparados trocados juntos (ex.: bateria de coloração)">${CQ_ICO.lista} Conjuntos</button>` : ''}
      ${_cqPodeRegistrarPreparo() && nCj ? `<button class="btn btn-outline btn-sm" onclick="cqTrocaAbrir()">${CQ_ICO.repeat} Trocar conjunto</button>` : ''}
      ${_cqPodeRegistrarPreparo() ? `<button class="btn btn-primary btn-sm" onclick="cqPrepNovoAbrir()">${CQ_ICO.plus} Novo preparo</button>` : ''}
    </div>
    <div id="cq-cad-lista"></div>
    <div id="cq-ctl-prep-lista"></div>`;
}

function _cqPrepAbaLista() {
  const el = document.getElementById('cq-cad-lista');
  if (!el) return;
  const u = _cqUnidadeAtivaId();
  const hoje = _cqHoje();
  const podeSit = _cqPodeSituacaoPreparo();
  const itens = _cqPrepAbaItens(u)
    .filter(({ i, p }) => (!_cqPrepProds.length || _cqPrepProds.includes(_cqLoteCru(i).produtoId)) && _cqPrepServeEquip(_cqProdutoInsumo(i) || i)
      && (_cqPrepFiltro === 'todos' || (_cqPrepFiltro === 'finalizados') === !!p.finalizado) && _cqPrepBuscaBate(p))
    .sort((a, b) => (b.p.dataHora || b.p.data || '').localeCompare(a.p.dataHora || a.p.data || '') || (b.p.criadoEm || '').localeCompare(a.p.criadoEm || ''));
  const icoFim = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
  const linha = ({ i, p }) => {
    const nC = Object.keys(p.corridas || {}).length;
    const fin = p.finalizado ? `<div class="cq-muted cq-prep-fin-txt" title="${_cqEsc(_cqPrepFinalizadoTxt(p))}">${_cqEsc(p.finalizado.auto ? 'finalizado automaticamente' : `finalizado por ${p.finalizado.porNome || '—'}`)}</div>` : '';
    return `<tr class="ot-list-row${p.finalizado ? ' oc-row-final' : ''}${p.id === _cqPrepDestaque ? ' cq-prep-destaque' : ''}" onclick="cqPreparoInfo('${i.id}','${p.id}')" title="Detalhes do preparo">
      <td class="cq-prep-cod-td">${p.codigo ? _cqEsc(p.codigo) : '<span class="cq-muted">—</span>'}</td>
      <td><b>${_cqEsc(i.nome)}</b><div class="cq-muted">lote ${_cqEsc(i.lote)}${i.preparoUsoUnico ? ' · uso único' : ''}</div></td>
      <td style="white-space:nowrap;">${_cqPrepQtdTxt(p) ? `<b>${_cqEsc(_cqPrepQtdTxt(p))}</b>` : '<span class="cq-muted">—</span>'}</td>
      <td style="font-size:12.5px;white-space:nowrap;">${_cqFmtDH(p.dataHora || p.data)}<div class="cq-muted">${_cqEsc(p.responsavel || '—')}</div></td>
      <td>${_cqPrepValidadeBarra(p, hoje)}</td>
      <td><div class="cq-prep-sitcel">${_cqPrepSituacaoBtn(i, p, 'aba')}${podeSit && !p.finalizado && !p.legado ? `<button type="button" class="cq-prep-parar" title="Finalizar o preparo (consumido ou descartado)" onclick="event.stopPropagation();cqPreparoFinalizarRapido('${i.id}','${p.id}')">${icoFim}</button>` : ''}</div>${fin}</td>
      <td class="oc-num" style="text-align:center;">${nC || '<span class="cq-muted">0</span>'}</td>
      <td class="cq-prep-acoes" onclick="event.stopPropagation()">
        <button type="button" class="cq-icobtn" title="Imprimir etiqueta" onclick="cqImprimirRotulo('${i.id}','${p.id}')">${CQ_ICO.print}</button>
        <button type="button" class="cq-icobtn" title="Baixar etiqueta em PDF" onclick="cqEtqBaixar('${i.id}','${p.id}')">${CQ_ICO.baixar}</button>
        ${_cqPrepBtnExcluir(i, p, 'aba')}
      </td></tr>`;
  };
  const todas = [...itens.map(x => ({ ord: x.p.dataHora || x.p.data || '', criadoEm: x.p.criadoEm || '', html: linha(x) })), ..._cqCtlPrepAbaLinhas(u, hoje)]
    .sort((a, b) => b.ord.localeCompare(a.ord) || b.criadoEm.localeCompare(a.criadoEm));
  const vazio = { em_uso: 'Nenhum preparo em uso', finalizados: 'Nenhum preparo finalizado', todos: 'Nenhum preparo registrado' }[_cqPrepFiltro] + (_cqPrepBusca ? ` com o código “${_cqPrepBusca}”.` : _cqPrepProds.length || _cqPrepEquips.length ? ' para os filtros marcados.' : ' nesta área.');
  el.innerHTML = `<div class="oc-table-scroll"><table class="ot-list-table cq-table cq-prep-tbl">
    <thead><tr><th class="ot-list-th">Código</th><th class="ot-list-th">Produto · lote</th><th class="ot-list-th">Quantidade</th><th class="ot-list-th">Preparo</th>
      <th class="ot-list-th">Validade</th><th class="ot-list-th">Situação</th><th class="ot-list-th" title="Corridas que usaram o preparo" style="text-align:center;">Corridas</th><th class="ot-list-th"></th></tr></thead>
    <tbody>${todas.length ? todas.map(x => x.html).join('') : `<tr><td colspan="8" class="cq-td-vazio">${vazio}</td></tr>`}</tbody></table></div>
    ${podeSit ? '<div class="cq-nota" style="margin-top:8px;">Clique na situação para liberar, reprovar ou finalizar. Preparos finalizados, reprovados ou vencidos não são oferecidos no lançamento.</div>' : ''}`;
  _cqPrepDestaque = null;
  _cqCtlPrepAbaLista();
}

// Insumos utilizáveis num teste (validade e situação); `produto` é o id do produto (só os lotes dele)
// ou, em testes antigos, o nome do insumo; `equipTeste` restringe ao equipamento/sistema do teste
// ('a:…' | 'm:…'; insumos sem equipamento servem a qualquer um)
function _cqInsumosPara(analitoId, tipo, produto, equipTeste, u, dia) {
  const hoje = dia || _cqHoje();
  // Encerrado pelo gatilho de vencimento continua valendo para corrida datada até a validade
  const aberto = i => i.status !== 'encerrado' || (!!i.encerradoAuto && !!dia && !!i.validade && i.validade >= dia);
  const pr = produto ? cqState.config.insumoProdutos[produto] : null;
  if (pr) {
    return _cqDaUnidade('insumos', u).filter(i => _cqLoteCru(i).produtoId === pr.id && aberto(i))
      .map(i => ({ ...i, vencido: !!(i.validade && i.validade < hoje), bloqueado: i.status === 'quarentena' }))
      .sort((a, b) => (b.validade || '').localeCompare(a.validade || ''));
  }
  const prod = (produto || '').trim().toLowerCase();
  return _cqDaUnidade('insumos', u)
    .filter(i => i.tipo === tipo && (!_cqArr(i.analitoIds).length || _cqArr(i.analitoIds).includes(analitoId)))
    .filter(i => { const eqs = _cqEquipsInsumo(i); return !eqs.length || !equipTeste || eqs.some(k => _cqEquipChave(k) === _cqEquipChave(equipTeste)); })
    .filter(i => !prod || (i.nome || '').trim().toLowerCase() === prod)
    .filter(aberto)
    .map(i => ({ ...i, vencido: !!(i.validade && i.validade < hoje), bloqueado: i.status === 'quarentena' }))
    .sort((a, b) => (b.validade || '').localeCompare(a.validade || ''));
}

// Por que nenhum lote aparece para o teste: aponta o critério que exclui o lote mais próximo
function _cqInsumosDiagnostico(t, tipo, u) {
  const pr = cqState.config.insumoProdutos[t.insumoProdutoId];
  if (pr) {
    const ls = _cqLotesDoProduto(pr.id);
    if (!ls.length) return `nenhum lote do produto ${pr.nome} — cadastre em “Reagentes, meios e insumos”.`;
    if (!ls.some(i => _cqNaUnidade(i, u))) return `nenhum lote de ${pr.nome} associado a esta área.`;
    return `todos os lotes de ${pr.nome} desta área estão encerrados — cadastre o novo lote.`;
  }
  const prod = (t.insumoProduto || '').trim().toLowerCase();
  const equip = _cqEquipDoTeste(t);
  const motivos = i => {
    const m = [];
    if (!_cqNaUnidade(i, u)) m.push(`não está associado a esta área`);
    if (i.tipo !== tipo) m.push(`tipo "${CQ_TIPOS_INSUMO[i.tipo] || i.tipo}" ≠ "${CQ_TIPOS_INSUMO[tipo] || tipo}" do teste`);
    if (_cqArr(i.analitoIds).length && !_cqArr(i.analitoIds).includes(t.analitoId)) m.push('analito não vinculado');
    const eqs = _cqEquipsInsumo(i);
    if (eqs.length && equip && !eqs.some(k => _cqEquipChave(k) === _cqEquipChave(equip))) m.push('equipamento/sistema diferente');
    if (prod && (i.nome || '').trim().toLowerCase() !== prod) m.push(`produto "${i.nome}" ≠ "${t.insumoProduto}" exigido no teste`);
    if (i.status === 'encerrado') m.push('lote encerrado');
    return m;
  };
  const cand = Object.values(cqState.config.insumos).map(i => ({ i, m: motivos(i) })).filter(x => x.m.length)
    .sort((a, b) => a.m.length - b.m.length);
  if (!cand.length) return 'nenhum lote cadastrado';
  const c = cand[0];
  return `nenhum lote compatível — ${c.i.nome} (lote ${c.i.lote}): ${c.m.join('; ')}. Ajuste o insumo ou o teste.`;
}

// ── TESTES (analito × equipamento × método × unidade) ────────
const CQ_LBL_TESTE = {
  analitoId: 'Analito', ativoId: 'Equipamento', sistemaAnalitico: 'Sistema analítico', metodo: 'Método', niveis: 'Níveis',
  materialId: 'Material de controle', lotesAtivos: 'Lotes em uso', frequencia: 'Frequência', regrasPreset: 'Conjunto de regras',
  regras: 'Regras', opcoesRegras: 'Opções das regras', etaOverride: 'ETa específico do teste', inicioUso: 'Início de uso', ativo: 'Ativo',
  controlesQual: 'Controles e resultados esperados', insumoTipo: 'Insumo controlado', insumoProduto: 'Produto controlado', insumoProdutoId: 'Cadastro do produto controlado', exigirInsumo: 'Exigir lote do insumo',
  setorId: 'Setor',
};

// Setor do teste: herdado do equipamento (pode ser trocado); obrigatório quando não há equipamento com setor na unidade
function _cqTesteSetorCampoHTML(d, pode) {
  const u = d.unidadeId || _cqUnidadeAtivaId();
  const setores = _cqSetoresDaUnidade(u);
  if (!setores.length) return '';
  const a = d.ativoId && typeof _ativoById === 'function' ? _ativoById(d.ativoId) : null;
  const sEq = a ? _orgSetorDoAtivo(a) : null;
  const herda = !!(sEq && !sEq.virtual && sEq.unidadeId === _cqUnidadeOrg(u)?.id);
  return `<div class="form-field" style="max-width:230px;"><label class="field-label">Setor ${herda ? '' : '<span class="required">*</span>'}</label>
    <select id="cq-te-setor" class="field-select" ${_cqRo(pode)}>
      <option value="">${_cqEsc(herda ? `Do equipamento (${sEq.nome})` : '— Selecione —')}</option>
      ${setores.filter(s => s.ativo !== false || s.id === d.setorId).map(s => `<option value="${_cqEsc(s.id)}" ${s.id === d.setorId ? 'selected' : ''}>${_cqEsc(s.nome)}</option>`).join('')}
    </select></div>`;
}
function _cqTesteCapturarSetor(d) {
  const el = document.getElementById('cq-te-setor');
  if (!el) return;
  const a = d.ativoId && typeof _ativoById === 'function' ? _ativoById(d.ativoId) : null;
  // Igual ao do equipamento: não grava (segue o equipamento se ele mudar de setor)
  d.setorId = el.value && el.value !== (a ? _orgSetorDoAtivo(a)?.id : '') ? el.value : '';
}

// Mapa por nível sem posições vazias (o RTDB devolve {1:…,2:…} como array)
function _cqMapaNiveis(x) {
  const out = {};
  Object.entries(x || {}).forEach(([n, v]) => { if (v !== null && v !== undefined && v !== '' && Number(n) > 0) out[n] = v; });
  return out;
}
// Critérios de avaliação do teste: regras (quantitativo) ou resultados esperados (qualitativo)
function _cqCriteriosTeste(x) {
  const esperados = {};
  _cqNiveisTeste(x).forEach(n => { esperados[n] = x.controlesQual?.[n]?.esperado || ''; });
  return CQEngine.canonico({ r: x.regras || {}, o: x.opcoesRegras || {}, e: esperados });
}

let _cqTesteAnalitoFixo = null;   // teste novo criado a partir do analito

function cqTesteForm(id, aba, opts = {}) {
  const t = id ? cqState.config.testes[id] : null;
  const anFixo = !t && opts.analitoId ? cqState.config.analitos[opts.analitoId] : null;
  if (!t && !anFixo) { showToast('Crie o teste a partir do analito (aba Analitos e testes).', 'error'); return; }
  if (anFixo && !_cqEquipsDoAnalito(anFixo).length) { showToast('Vincule antes um equipamento ou sistema analítico ao analito.', 'error'); return; }
  _cqTesteAnalitoFixo = anFixo ? anFixo.id : null;
  _cqTesteFormId = id || null;
  _cqTesteFormTab = aba || 'config';
  _cqTesteDraft = t ? JSON.parse(JSON.stringify(t)) : {
    unidadeId: _cqUnidadeAtivaId(), analitoId: '', ativoId: null, sistemaAnalitico: '', metodo: '', niveis: [1, 2],
    materialId: '', lotesAtivos: {}, frequencia: { tipo: 'por_corrida', vezesDia: 1 }, regrasPreset: 'westgard_n2',
    regras: { ...CQEngine.PRESETS.westgard_n2.regras }, opcoesRegras: { gatilho12s: false, incluirRejeitados: false },
    controlesQual: {}, insumoTipo: '', insumoProduto: '', insumoProdutoId: '', exigirInsumo: false,
    inicioUso: _cqHoje(), ativo: true,
  };
  if (anFixo) {
    const d = _cqTesteDraft;
    d.analitoId = anFixo.id;
    // Um só equipamento/sistema do analito na unidade: já vem selecionado
    const eqs = _cqEquipsTodos(d.unidadeId).filter(o => _cqEquipsDoAnalito(anFixo).some(x => _cqEquipChave(x.value) === _cqEquipChave(o.value)));
    if (eqs.length === 1) { d.ativoId = eqs[0].value.startsWith('a:') ? eqs[0].value.slice(2) : null; d.sistemaAnalitico = eqs[0].value.startsWith('m:') ? eqs[0].value.slice(2) : ''; }
    _cqTesteAjustarTipo(d);
  }
  _cqTesteRender();
}

// Estrutura do teste conforme o tipo do analito (regras × resultados esperados)
function _cqTesteAjustarTipo(d) {
  const qual = _cqTesteQual(d);
  if (qual && d.regrasPreset !== 'qualitativo') {
    Object.assign(d, { niveis: [1], controlesQual: {}, lotesAtivos: {}, materialId: '', regrasPreset: 'qualitativo', regras: {}, opcoesRegras: {},
                       insumoTipo: '', insumoProduto: '', insumoProdutoId: '', metodo: '', exigirInsumo: true,
                       frequencia: { tipo: 'por_lote', vezesDia: 1 } });
  } else if (!qual && d.regrasPreset === 'qualitativo') {
    Object.assign(d, { niveis: [1, 2], controlesQual: {}, lotesAtivos: {}, regrasPreset: 'westgard_n2', regras: { ...CQEngine.PRESETS.westgard_n2.regras },
                       opcoesRegras: { gatilho12s: false, incluirRejeitados: false }, insumoTipo: '', insumoProduto: '', insumoProdutoId: '', exigirInsumo: false,
                       frequencia: { tipo: 'por_corrida', vezesDia: 1 } });
  }
}

// Troca de analito num teste novo: ajusta a estrutura (regras × resultados esperados)
function cqTesteAnalitoChange() {
  _cqTesteCapturar();
  const d = _cqTesteDraft;
  d.analitoId = _cqVal('cq-te-analito');
  _cqTesteDescartarMateriais(d);
  _cqTesteAjustarTipo(d);
  _cqTesteRender();
}

// Teste novo: primeiro o equipamento/sistema; a lista de analitos vem dos vinculados a ele
function cqTesteEquipChange() {
  _cqTesteCapturar();
  const d = _cqTesteDraft;
  const eq = d.ativoId ? 'a:' + d.ativoId : (d.sistemaAnalitico ? 'm:' + d.sistemaAnalitico : '');
  if (d.analitoId && !_cqTesteAnalitoFixo && !_cqAnalitosDoEquip(eq, d.unidadeId).some(a => a.id === d.analitoId)) {
    d.analitoId = '';
    if (document.getElementById('cq-te-analito')) document.getElementById('cq-te-analito').value = '';
  }
  _cqTesteDescartarMateriais(d);
  _cqTesteRender();
}

// Descarta material e lotes que não servem ao equipamento/sistema e ao analito escolhidos
function _cqTesteDescartarMateriais(d) {
  const eq = d.ativoId ? 'a:' + d.ativoId : (d.sistemaAnalitico ? 'm:' + d.sistemaAnalitico : '');
  if (d.materialId && !_cqMaterialServe(cqState.config.materiais[d.materialId], eq, d.analitoId)) { d.materialId = ''; d.lotesAtivos = {}; }
  Object.entries(d.controlesQual || {}).forEach(([n, c]) => {
    if (c?.materialId && !_cqMaterialServe(cqState.config.materiais[c.materialId], eq, d.analitoId)) { c.materialId = ''; delete d.lotesAtivos?.[n]; }
  });
}

// Chave de comparação: sistemas manuais sem diferença de maiúsculas/minúsculas
function _cqEquipChave(v) { return String(v || '').startsWith('m:') ? String(v).toLowerCase() : String(v || ''); }
// Equipamentos/sistemas vinculados a algum analito ativo (equipamentos restritos aos da unidade)
function _cqEquipsTodos(u) {
  const mapa = new Map();
  Object.values(cqState.config.analitos).filter(a => a.ativo !== false && _cqNaUnidade(a, u)).forEach(a => _cqEquipsDoAnalito(a).forEach(o => {
    if (o.ativo && !_cqAtivoNaUnidade(o.ativo, u)) return;
    const k = _cqEquipChave(o.value);
    if (!mapa.has(k)) mapa.set(k, o);
  }));
  const ordem = o => (o.value.startsWith('m:') ? '1' : '0') + (o.grupo || '');
  return [...mapa.values()].sort((a, b) => ordem(a).localeCompare(ordem(b)) || a.label.localeCompare(b.label));
}
function _cqAnalitosDoEquip(eq, u) {
  if (!eq) return [];
  const k = _cqEquipChave(eq);
  return Object.values(cqState.config.analitos).filter(a => a.ativo !== false && _cqNaUnidade(a, u) && _cqEquipsDoAnalito(a).some(o => _cqEquipChave(o.value) === k))
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

function _cqTesteRender() {
  const t = _cqTesteFormId ? cqState.config.testes[_cqTesteFormId] : null;
  const tabs = !t ? { config: 'Configuração' }
    : _cqTesteQual(t) ? { config: 'Configuração', trilha: 'Rastreabilidade' }
    : { config: 'Configuração', alvos: 'Alvos (média e DP)', trilha: 'Rastreabilidade' };
  if (!tabs[_cqTesteFormTab]) _cqTesteFormTab = 'config';
  const titulo = t ? `${_cqNomeTeste(t)} · ${_cqEquipTeste(t)}` : 'Novo teste';
  const anVolta = _cqAnalito(t?.analitoId || _cqTesteAnalitoFixo);
  let corpo = `${anVolta ? _cqVoltarAnalitoHTML(anVolta) : ''}<div class="ot-modal-tabs cq-drawer-tabs">${Object.entries(tabs).map(([k, l]) => `<button class="ot-modal-tab-btn${k === _cqTesteFormTab ? ' active' : ''}" onclick="cqTesteAba('${k}')">${l}</button>`).join('')}</div>`;
  let rodape = `${t && _cqPodeEditarCad() ? `<div class="cq-rodape-esq">${_cqCan('configurar') ? `<button class="btn btn-outline cq-btn-perigo" onclick="cqExcluirCadastro('testes','${t.id}')">Excluir</button>` : ''}${_cqTesteFormTab === 'config' ? _cqBtnAtivoHTML({ ids: 'cq-te-habilitado', fn: 'cqTesteSalvar', colecao: 'testes', id: t.id, ativo: t.ativo !== false }) : ''}</div>` : ''}
    <button class="btn btn-outline" onclick="cqDrawerClose()">Fechar</button>`;
  if (_cqTesteFormTab === 'config') {
    corpo += _cqTesteConfigHTML();
    if (_cqPodeEditarCad(!!t)) rodape += `<button class="btn btn-primary" onclick="cqTesteSalvar()">${CQ_ICO.check} Salvar</button>`;
  } else if (_cqTesteFormTab === 'alvos') {
    corpo += `<div id="cq-alvos-wrap">${_cqAlvosHTML(t)}</div>`;
  } else {
    corpo += `<div style="padding-top:12px;">${_cqTrilhaHTML(t)}</div>`;
  }
  const aberto = document.getElementById('cq-drawer')?.classList.contains('open');
  if (aberto && document.getElementById('cq-drawer-title')?.dataset.teste === String(_cqTesteFormId)) {
    document.getElementById('cq-drawer-title').textContent = titulo;
    document.getElementById('cq-drawer-body').innerHTML = corpo;
    document.getElementById('cq-drawer-foot').innerHTML = rodape;
  } else {
    cqDrawerOpen({ titulo, subtitulo: 'Estratégia de controle do teste (RDC 978, arts. 176 e 180)', icone: 'beaker', corpo, rodape });
    document.getElementById('cq-drawer-title').dataset.teste = String(_cqTesteFormId);
  }
}

function cqTesteAba(aba) {
  if (_cqTesteFormTab === 'config') _cqTesteCapturar();
  _cqTesteFormTab = aba;
  _cqTesteRender();
}

function _cqTesteConfigHTML() {
  const d = _cqTesteDraft;
  const pode = _cqPodeEditarCad(!!_cqTesteFormId);
  const podeRegras = pode && (_cqCan('definirAlvos') || !_cqTesteFormId);
  const un = _cqUnidade();
  const equipAtual = d.ativoId ? 'a:' + d.ativoId : (d.sistemaAnalitico ? 'm:' + d.sistemaAnalitico : '');
  const uTe = d.unidadeId || _cqUnidadeAtivaId();
  const analitos = _cqAnalitosDoEquip(equipAtual, uTe);
  if (d.analitoId && !analitos.some(a => a.id === d.analitoId) && _cqAnalito(d.analitoId)) analitos.unshift(_cqAnalito(d.analitoId));
  const equipTe = d.ativoId ? 'a:' + d.ativoId : (d.sistemaAnalitico ? 'm:' + d.sistemaAnalitico : '');
  const mats = Object.values(cqState.config.materiais).filter(m => m.id === d.materialId || (m.ativo !== false && _cqNaUnidade(m, uTe) && _cqMaterialServe(m, equipTe, d.analitoId)))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  const anTe = _cqAnalito(d.analitoId);
  const opsEquip = _cqEquipsTodos(d.unidadeId || _cqUnidadeAtivaId())
    .filter(o => !_cqTesteAnalitoFixo || _cqEquipsDoAnalito(anTe).some(x => _cqEquipChave(x.value) === _cqEquipChave(o.value)));
  if (equipAtual && !opsEquip.some(o => _cqEquipChave(o.value) === _cqEquipChave(equipAtual))) opsEquip.unshift({ value: equipAtual, label: d.ativoId ? _cqEquipTeste(d) : d.sistemaAnalitico, grupo: 'Atual' });
  const gruposEquip = [...new Set(opsEquip.map(o => o.grupo))];
  void un;
  const lotesEmUso = new Set(Object.values(d.lotesAtivos || {}));
  const lotesMat = Object.values(cqState.config.lotesControle).filter(l => l.materialId === d.materialId && l.status !== 'encerrado' && (lotesEmUso.has(l.id) || _cqNaUnidade(l, uTe)))
    .sort((a, b) => (b.validade || '').localeCompare(a.validade || ''));
  const niveis = _cqArr(d.niveis).map(Number);
  const qual = _cqTesteQual(d);
  const regrasGrid = CQEngine.ORDEM_REGRAS.map(k => {
    const r = CQEngine.REGRAS[k];
    const v = d.regras?.[k] || 'off';
    return `<tr><td><b>${r.label}</b><div class="cq-muted">${_cqEsc(r.descricao)}</div></td><td class="cq-muted" style="font-size:11px;">${r.tipoErro === 'aleatorio' ? 'aleatório' : 'sistemático'}</td>
      <td><select class="field-select cq-regra-sel" data-regra="${k}" onchange="cqTesteRegraChange()" ${podeRegras ? '' : 'disabled'}>
        <option value="off" ${v === 'off' ? 'selected' : ''}>Desligada</option><option value="alerta" ${v === 'alerta' ? 'selected' : ''}>Alerta</option><option value="rejeicao" ${v === 'rejeicao' ? 'selected' : ''}>Rejeição</option></select></td></tr>`;
  }).join('');
  return `<div style="padding-top:14px;">
    ${_cqInativoNota(_cqTesteFormId ? d : null, 'ativo', 'não aparece nos lançamentos de corridas')}
    <div class="form-section"><div class="form-section-title">${CQ_ICO.beaker}Analito e sistema analítico</div>
      <div class="form-row">
        <div class="form-field"><label class="field-label">1. Equipamento / sistema analítico <span class="required">*</span></label>
          ${!opsEquip.length ? `<div class="cq-alerta-box">${CQ_ICO.alerta} Nenhum analito tem equipamento ou sistema vinculado nesta área. Vincule no cadastro do analito.</div>`
            : `<select id="cq-te-equip" class="field-select" onchange="cqTesteEquipChange()" ${_cqTesteFormId || !pode ? 'disabled' : ''}><option value="">— Selecione —</option>
              ${gruposEquip.map(g => `<optgroup label="${_cqEsc(g)}">${opsEquip.filter(o => o.grupo === g).map(o => `<option value="${_cqEsc(o.value)}" ${_cqEquipChave(o.value) === _cqEquipChave(equipAtual) ? 'selected' : ''}>${_cqEsc(o.label)}</option>`).join('')}</optgroup>`).join('')}</select>`}</div>
        <div class="form-field"><label class="field-label">2. Analito <span class="required">*</span></label>
          ${!equipAtual && !_cqTesteAnalitoFixo ? `<select id="cq-te-analito" class="field-select" disabled><option value="">Selecione antes o equipamento / sistema</option></select>`
            : `<select id="cq-te-analito" class="field-select" onchange="cqTesteAnalitoChange()" ${_cqTesteFormId || _cqTesteAnalitoFixo || !pode ? 'disabled' : ''}>${analitos.length ? `<option value="">— Selecione —</option>` + analitos.map(a => `<option value="${a.id}" ${a.id === d.analitoId ? 'selected' : ''}>${_cqEsc(a.nome)} (${_cqEsc(a.tipo && a.tipo !== 'quantitativo' ? CQ_TIPOS_ANALITO[a.tipo].toLowerCase() : a.unidadeMedida)})</option>`).join('') : '<option value="">Nenhum analito vinculado a este equipamento</option>'}</select>`}</div>
      </div>
      <div class="cq-nota" style="margin-top:-6px;">Os analitos listados são os vinculados ao equipamento / sistema no cadastro de analitos.</div>
      <div class="form-row">
        <div class="form-field"><label class="field-label">${qual ? 'Meio / insumo controlado' : 'Método'}</label>${qual ? _cqTesteInsumoCampoHTML(d, pode)
          : `<input type="text" id="cq-te-metodo" class="field-input" value="${_cqEsc(d.metodo)}" placeholder="Ex.: Hexoquinase" ${_cqRo(pode)}>`}</div>
        <div class="form-field" style="max-width:170px;"><label class="field-label">Início de uso</label><input type="date" id="cq-te-inicio" class="field-input" value="${_cqEsc(d.inicioUso)}" ${_cqRo(pode)}></div>
        ${_cqTesteSetorCampoHTML(d, pode)}
      </div>
    </div>
    ${qual ? _cqTesteQualSecoesHTML(d, pode, podeRegras) : `
    <div class="form-section"><div class="form-section-title">${CQ_ICO.beaker}Controle: níveis, material e lotes</div>
      <div class="form-field"><label class="field-label">Material de controle <span class="required">*</span></label>
        <select id="cq-te-material" class="field-select" onchange="cqTesteMaterialChange()" ${_cqRo(pode)}>${_cqMapOptions(Object.fromEntries(mats.map(m => [m.id, `${m.nome} — ${m.fabricante}`])), d.materialId)}</select></div>
      <div class="form-field"><label class="field-label">Níveis controlados e lote em uso</label>
        ${[1, 2, 3].map(n => {
          const temNoMat = !!cqState.config.materiais[d.materialId]?.niveis?.[n];
          const lotes = lotesMat.filter(l => _cqArr(l.niveis).map(Number).includes(n));
          return `<div class="cq-nivel-row"><label class="oc-check"><input type="checkbox" class="cq-te-nivel" value="${n}" ${niveis.includes(n) ? 'checked' : ''} ${!temNoMat || !pode ? 'disabled' : ''}> Nível ${n}</label>
            <select class="field-select cq-te-lote" data-n="${n}" ${!temNoMat || !pode ? 'disabled' : ''}><option value="">— Lote —</option>
              ${lotes.map(l => `<option value="${l.id}" ${d.lotesAtivos?.[n] === l.id ? 'selected' : ''}>${_cqEsc(l.lote)} · val. ${_cqFmtData(l.validade)}${l.status === 'quarentena' ? ' (quarentena)' : ''}</option>`).join('')}</select></div>`;
        }).join('')}
        <div class="cq-nota">Use níveis próximos dos limites de decisão clínica. Ao trocar o lote, cadastre o alvo do novo lote na aba “Alvos”. O lote em uso também pode ser definido no cadastro do lote (Controles/Materiais › lote › Uso nos testes).</div></div>
      <div class="form-row">
        <div class="form-field"><label class="field-label">Frequência</label><select id="cq-te-freq" class="field-select" ${_cqRo(pode)}>${_cqMapOptions(CQ_FREQ, d.frequencia?.tipo || 'por_corrida', null)}</select></div>
        <div class="form-field" style="max-width:150px;"><label class="field-label">Corridas por dia</label><input type="number" min="1" max="24" id="cq-te-vezes" class="field-input" value="${Number(d.frequencia?.vezesDia) || 1}" ${_cqRo(pode)}></div>
      </div>
      <div class="cq-nota">RDC 978, art. 183: CIQ no mínimo a cada corrida analítica e após cada manutenção preventiva e corretiva.</div>
    </div>
    <div class="form-section"><div class="form-section-title">${CQ_ICO.shield}Regras de controle (Westgard)</div>
      <div class="form-field"><label class="field-label">Conjunto de regras</label>
        <select id="cq-te-preset" class="field-select" onchange="cqTestePresetChange()" ${podeRegras ? '' : 'disabled'}>
          ${Object.entries(CQEngine.PRESETS).map(([k, p]) => `<option value="${k}" ${k === d.regrasPreset ? 'selected' : ''}>${_cqEsc(p.label)}</option>`).join('')}
          <option value="personalizado" ${!CQEngine.PRESETS[d.regrasPreset] ? 'selected' : ''}>Personalizado</option></select>
        ${!podeRegras ? '<div class="cq-nota">Alterar regras exige a permissão “Definir médias, DP e regras”.</div>' : ''}</div>
      <table class="cq-regras-tbl">${regrasGrid}</table>
      <div class="cq-checks" style="margin-top:8px;">
        <label class="oc-check"><input type="checkbox" id="cq-te-gatilho" ${d.opcoesRegras?.gatilho12s ? 'checked' : ''} ${podeRegras ? '' : 'disabled'}> Usar 1-2s como gatilho (só aplica as demais regras quando algum controle excede ±2 DP)</label>
        <label class="oc-check"><input type="checkbox" id="cq-te-increj" ${d.opcoesRegras?.incluirRejeitados ? 'checked' : ''} ${podeRegras ? '' : 'disabled'}> Incluir corridas rejeitadas no histórico das regras</label>
      </div>
    </div>
    <div class="form-section"><div class="form-section-title">${CQ_ICO.shield}Especificação da qualidade</div>
      <div class="cq-nota">Padrão do analito: ${(() => { const a = _cqAnalito(d.analitoId); return a?.eta ? `ETa ${_cqNum(Number(a.eta.valor), 1)}${a.eta.tipo === 'abs' ? ' ' + _cqEsc(a.unidadeMedida) : '%'} (${_cqEsc(a.eta.fonte)})` : 'não definido'; })()}.</div>
      <div class="form-row">
        <div class="form-field"><label class="field-label">ETa específico deste teste (%)</label><input type="text" inputmode="decimal" id="cq-te-eta" class="field-input" value="${_cqEsc(d.etaOverride?.valor ?? '')}" placeholder="Vazio = usar o do analito" ${_cqRo(pode)}></div>
        <div class="form-field"><label class="field-label">Justificativa</label><input type="text" id="cq-te-eta-just" class="field-input" value="${_cqEsc(d.etaOverride?.justificativa)}" ${_cqRo(pode)}></div>
      </div>
      <input type="checkbox" id="cq-te-habilitado" hidden ${d.ativo === false ? '' : 'checked'}>
    </div>
    ${_cqTesteFormId && pode ? `<div class="form-section"><div class="form-section-title">${CQ_ICO.undo}Histórico das regras</div>
      <div class="cq-nota">${d.reinicioHistorico ? `Histórico reiniciado em ${_cqFmtDH(CQEngine.dataDeChave(d.reinicioHistorico))}. ` : ''}Reiniciar faz as regras entre corridas desconsiderarem resultados anteriores (ex.: após troca de método ou grande manutenção).</div>
      <button class="btn btn-outline btn-sm" onclick="cqTesteReiniciarHistorico()">${CQ_ICO.undo} Reiniciar histórico das regras</button></div>` : ''}`}
  </div>`;
}

// Seções do teste qualitativo: um controle por nível (cepa, lâmina ou placa não inoculada) com resultado esperado
function _cqTesteQualSecoesHTML(d, pode, podeRegras) {
  const an = _cqAnalito(d.analitoId);
  const escala = _cqArr(an?.escala);
  const niveis = _cqArr(d.niveis).map(Number);
  const usados = new Set(Object.values(d.controlesQual || {}).map(c => c?.materialId).filter(Boolean));
  const equipTe = d.ativoId ? 'a:' + d.ativoId : (d.sistemaAnalitico ? 'm:' + d.sistemaAnalitico : '');
  const uTe = d.unidadeId || _cqUnidadeAtivaId();
  const mats = Object.values(cqState.config.materiais).filter(m => usados.has(m.id) || (m.ativo !== false && _cqNaUnidade(m, uTe) && _cqMaterialServe(m, equipTe, d.analitoId)))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  const insTipo = d.insumoTipo || '';
  // Lotes que o lançamento vai oferecer para o insumo escolhido no campo do teste
  const lotesIns = d.insumoTipo ? _cqInsumosPara(d.analitoId, d.insumoTipo, d.insumoProdutoId || d.insumoProduto, equipTe, uTe) : [];
  const ctrls = [1, 2, 3].map(n => {
    const c = d.controlesQual?.[n] || {};
    const lotes = c.materialId ? Object.values(cqState.config.lotesControle).filter(l => l.materialId === c.materialId && l.status !== 'encerrado' && (d.lotesAtivos?.[n] === l.id || _cqNaUnidade(l, uTe)))
      .sort((a, b) => (b.validade || '').localeCompare(a.validade || '')) : [];
    return `<div class="cq-qual-ctrl">
      <label class="oc-check"><input type="checkbox" class="cq-te-nivel" value="${n}" ${niveis.includes(n) ? 'checked' : ''} ${_cqRo(pode)}> Nível ${n}</label>
      <input type="text" class="field-input cq-te-qrot" data-n="${n}" maxlength="40" value="${_cqEsc(c.rotulo)}" placeholder="${n === 1 ? 'Ex.: Cepa positiva' : n === 2 ? 'Ex.: Cepa de inibição' : 'Ex.: Placa não inoculada'}" ${_cqRo(pode)}>
      <select class="field-select cq-te-qmat" data-n="${n}" onchange="cqTesteMaterialChange()" ${_cqRo(pode)}>
        <option value="">— Sem material (placa / lâmina não inoculada) —</option>
        ${mats.map(m => `<option value="${m.id}" ${m.id === c.materialId ? 'selected' : ''}>${_cqEsc(m.nome)}${m.codigoReferencia ? ' · ' + _cqEsc(m.codigoReferencia) : ''}</option>`).join('')}</select>
      <select class="field-select cq-te-lote" data-n="${n}" ${c.materialId && pode ? '' : 'disabled'}><option value="">${c.materialId ? '— Lote —' : 'sem lote'}</option>
        ${lotes.map(l => `<option value="${l.id}" ${d.lotesAtivos?.[n] === l.id ? 'selected' : ''}>${_cqEsc(l.lote)} · val. ${_cqFmtData(l.validade)}${l.status === 'quarentena' ? ' (quarentena)' : ''}</option>`).join('')}</select>
      <select class="field-select cq-te-qesp" data-n="${n}" ${podeRegras ? '' : 'disabled'}><option value="">— Resultado esperado —</option>
        ${escala.map(e => `<option value="${_cqEsc(e)}" ${e === c.esperado ? 'selected' : ''}>${_cqEsc(e)}</option>`).join('')}</select>
    </div>`;
  }).join('');
  return `
    <div class="form-section"><div class="form-section-title">${CQ_ICO.beaker}Controles e resultado esperado</div>
      <div class="cq-qual-ctrl cq-qual-head"><span>Nível</span><span>Identificação</span><span>Material (cepa / lâmina)</span><span>Lote em uso</span><span>Esperado</span></div>
      ${ctrls}
      <div class="cq-nota">Ex.: desempenho do Ágar EMB → N1 “Cepa positiva” E. coli ATCC 25922 = crescimento com características esperadas; N2 “Cepa de inibição” S. aureus ATCC 25923 = crescimento inibido.
        Esterilidade → N1 “Placa não inoculada”, sem material, esperado “Sem crescimento”. Confirme os esperados com a bula do meio e o POP.
        O lote em uso também pode ser definido no cadastro do lote (Controles/Materiais › lote › Uso nos testes).</div>
      ${!podeRegras ? '<div class="cq-nota">Alterar resultados esperados exige a permissão “Definir médias, DP e regras”.</div>' : ''}
      <div class="form-row">
        <div class="form-field"><label class="field-label">Frequência</label><select id="cq-te-freq" class="field-select" ${_cqRo(pode)}>${_cqMapOptions(CQ_FREQ, d.frequencia?.tipo || 'por_lote', null)}</select></div>
        <div class="form-field" style="max-width:150px;"><label class="field-label">Corridas por dia</label><input type="number" min="1" max="24" id="cq-te-vezes" class="field-input" value="${Number(d.frequencia?.vezesDia) || 1}" ${_cqRo(pode)}></div>
      </div>
    </div>
    <div class="form-section"><div class="form-section-title">${CQ_ICO.beaker}Insumo controlado</div>
      ${insTipo ? `<div class="form-field"><label class="field-label">Lotes oferecidos no lançamento · ${_cqEsc(CQ_TIPOS_INSUMO[insTipo] || insTipo)}${_cqNomeProdutoTeste(d) ? ' · ' + _cqEsc(_cqNomeProdutoTeste(d)) : ''}</label>
        ${lotesIns.length ? `<div class="cq-ins-compat">${lotesIns.map(i => `<span class="cq-ins-compat-item${i.vencido ? ' venc' : ''}" title="${_cqEsc([i.fabricante, i.vencido ? 'vencido' : i.bloqueado ? 'quarentena' : ''].filter(Boolean).join(' · '))}">lote <b>${_cqEsc(i.lote)}</b> · val. ${_cqFmtData(i.validade)}${i.vencido ? ' (vencido)' : i.bloqueado ? ' (quarentena)' : ''}</span>`).join('')}</div>`
          : `<div class="cq-nota cq-txt-amarelo">Nenhum lote em uso deste insumo nesta área. Cadastre o novo lote ${d.insumoProdutoId ? 'no produto, em' : 'em'} “Reagentes, meios e insumos”.</div>`}</div>`
        : '<div class="cq-nota">Sem insumo controlado: escolha o meio, corante ou kit no campo “Meio / insumo controlado” acima para rastrear o lote em cada lançamento.</div>'}
      ${insTipo ? `<label class="oc-check"><input type="checkbox" id="cq-te-exigeins" ${d.exigirInsumo ? 'checked' : ''} ${_cqRo(pode)}> Exigir o lote do insumo em cada lançamento (rastreabilidade do lote controlado)</label>` : ''}
      <input type="checkbox" id="cq-te-habilitado" hidden ${d.ativo === false ? '' : 'checked'}>
    </div>`;
}

// Produtos que servem ao teste: unidade, analito e equipamento/sistema. O teste guarda o produto;
// o lançamento oferece todos os lotes dele, inclusive os cadastrados depois.
// Lotes antigos (sem produto) entram agrupados pelo nome, como antes da separação produto × lote.
function _cqProdutosTeste(d) {
  const u = d.unidadeId || _cqUnidadeAtivaId();
  const eq = d.ativoId ? 'a:' + d.ativoId : (d.sistemaAnalitico ? 'm:' + d.sistemaAnalitico : '');
  const serve = x => (!_cqArr(x.analitoIds).length || !d.analitoId || _cqArr(x.analitoIds).includes(d.analitoId))
    && (!_cqEquipsInsumo(x).length || !eq || _cqEquipsInsumo(x).some(k => _cqEquipChave(k) === _cqEquipChave(eq)));
  const lotes = _cqDaUnidade('insumos', u).filter(i => i.status !== 'encerrado');
  const out = _cqDaUnidade('insumoProdutos', u).filter(p => p.nome && p.tipo !== 'calibrador' && (p.ativo !== false || p.id === d.insumoProdutoId) && serve(p))
    .map(p => ({ id: p.id, nome: p.nome.trim(), tipo: p.tipo, fab: p.fabricante || '', lotes: lotes.filter(i => _cqLoteCru(i).produtoId === p.id) }));
  const mapa = new Map();
  lotes.filter(i => !_cqProdutoInsumo(i) && i.nome && i.tipo !== 'calibrador' && serve(i)).forEach(i => {
    const k = i.nome.trim().toLowerCase();
    const p = mapa.get(k) || { id: '', nome: i.nome.trim(), lotes: [], tipos: {}, fab: i.fabricante || '' };
    p.lotes.push(i);
    p.tipos[i.tipo] = (p.tipos[i.tipo] || 0) + 1;
    mapa.set(k, p);
  });
  return [...out, ...[...mapa.values()].map(p => ({ ...p, tipo: Object.entries(p.tipos).sort((a, b) => b[1] - a[1])[0][0] }))];
}
// Produto escolhido no campo do teste: valor = id do produto ou, para lotes antigos, o nome
function _cqProdutoDoTeste(d, valor) {
  const v = String(valor || '').trim();
  if (!v) return null;
  const prods = _cqProdutosTeste(d);
  return prods.find(p => p.id && p.id === v) || prods.find(p => !p.id && _cqNormBusca(p.nome) === _cqNormBusca(v)) || null;
}

// Campo "Meio / insumo controlado" (qualitativos): popover com os produtos cadastrados
function _cqTesteInsumoCampoHTML(d, pode) {
  const hoje = _cqHoje();
  const prods = _cqProdutosTeste(d).sort((a, b) => (a.id ? 0 : 1) - (b.id ? 0 : 1) || (CQ_TIPOS_INSUMO[a.tipo] || '').localeCompare(CQ_TIPOS_INSUMO[b.tipo] || '') || a.nome.localeCompare(b.nome, 'pt'));
  const ops = [{ value: '', label: 'Sem insumo controlado', sub: 'O teste não controla meio, corante ou kit' },
    ...prods.map(p => {
      const venc = p.lotes.filter(i => i.validade && i.validade < hoje).length;
      const ult = [...p.lotes].sort((a, b) => (b.validade || '').localeCompare(a.validade || ''))[0];
      return { value: p.id || p.nome, label: p.nome, grupo: p.id ? (CQ_TIPOS_INSUMO[p.tipo] || p.tipo) : 'Lotes sem produto (cadastro antigo)',
        sub: [p.fab, p.lotes.length ? `${p.lotes.length} lote(s)${venc ? `, ${venc} vencido(s)` : ''}` : 'sem lote em uso'].filter(Boolean).join(' · '), extra: ult?.validade ? `val. ${_cqFmtData(ult.validade)}` : '' };
    })];
  // Vínculo pelo id do produto; testes antigos: o texto do campo é reaproveitado quando corresponde a um produto cadastrado
  const atual = (d.insumoProduto || d.metodo || '').trim();
  const achado = (d.insumoProdutoId && ops.find(o => o.value === d.insumoProdutoId)) || ops.find(o => o.value && _cqNormBusca(o.label) === _cqNormBusca(atual));
  if (atual && !achado) ops.push({ value: atual, label: atual, sub: 'Atual — não corresponde a um produto cadastrado para este analito e equipamento/sistema', grupo: 'Revisar' });
  const vazio = d.analitoId ? 'Nenhum meio, corante ou kit desta área vinculado a este analito e equipamento/sistema.' : 'Escolha antes o analito.';
  return `${_cqSelHTML('cq-te-insumo', ops, achado ? achado.value : atual, { placeholder: 'Selecione o meio, corante ou kit', disabled: !pode,
      onchange: cqTesteInsumoChange, busca: 'Buscar meio, corante ou kit…', vazio })}
    ${atual && !achado ? '<div class="cq-nota cq-txt-amarelo">Revise: escolha o insumo cadastrado correspondente para o lançamento oferecer os lotes dele.</div>' : ''}
    ${!prods.length && d.analitoId ? '<div class="cq-nota">Cadastre o produto em “Reagentes, meios e insumos” vinculado a este analito e equipamento/sistema.</div>' : ''}`;
}
function cqTesteInsumoChange() { _cqTesteCapturar(); _cqTesteRender(); }

function cqTesteMaterialChange() {
  _cqTesteCapturar();
  // Ao trocar o material de um nível qualitativo, o lote anterior deixa de valer
  const d = _cqTesteDraft;
  Object.entries(d.lotesAtivos || {}).forEach(([n, lid]) => {
    const c = d.controlesQual?.[n];
    if (c && cqState.config.lotesControle[lid]?.materialId !== c.materialId) delete d.lotesAtivos[n];
  });
  _cqTesteRender();
}
function cqTestePresetChange() {
  const k = _cqVal('cq-te-preset');
  const p = CQEngine.PRESETS[k];
  if (!p) return;
  _cqTesteCapturar();
  _cqTesteDraft.regrasPreset = k;
  _cqTesteDraft.regras = { ...p.regras };
  _cqTesteRender();
}
function cqTesteRegraChange() {
  const sel = document.getElementById('cq-te-preset');
  if (sel) sel.value = 'personalizado';
}

// Lê o formulário de configuração para o rascunho
function _cqTesteCapturarEquip(d) {
  d.analitoId = _cqVal('cq-te-analito');
  if (!document.getElementById('cq-te-equip')) return;
  const eq = _cqVal('cq-te-equip');
  d.ativoId = eq.startsWith('a:') ? eq.slice(2) : null;
  d.sistemaAnalitico = eq.startsWith('m:') ? eq.slice(2) : '';
}

function _cqTesteCapturar() {
  if (document.getElementById('cq-te-insumo')) { _cqTesteCapturarQual(); return; }
  if (!document.getElementById('cq-te-material')) return;
  const d = _cqTesteDraft;
  if (!_cqTesteFormId) _cqTesteCapturarEquip(d);
  d.metodo = _cqVal('cq-te-metodo');
  d.inicioUso = _cqVal('cq-te-inicio');
  _cqTesteCapturarSetor(d);
  d.materialId = _cqVal('cq-te-material');
  d.niveis = [...document.querySelectorAll('#cq-drawer .cq-te-nivel:checked')].map(c => Number(c.value));
  d.lotesAtivos = {};
  document.querySelectorAll('#cq-drawer .cq-te-lote').forEach(s => { if (s.value && d.niveis.includes(Number(s.dataset.n))) d.lotesAtivos[s.dataset.n] = s.value; });
  d.frequencia = { tipo: _cqVal('cq-te-freq') || 'por_corrida', vezesDia: Math.max(1, Number(_cqVal('cq-te-vezes')) || 1) };
  const preset = _cqVal('cq-te-preset');
  d.regrasPreset = CQEngine.PRESETS[preset] ? preset : 'personalizado';
  d.regras = {};
  document.querySelectorAll('#cq-drawer .cq-regra-sel').forEach(s => { if (s.value !== 'off') d.regras[s.dataset.regra] = s.value; });
  d.opcoesRegras = { gatilho12s: _cqChk('cq-te-gatilho'), incluirRejeitados: _cqChk('cq-te-increj') };
  const eta = CQEngine.parseNumero(_cqVal('cq-te-eta'));
  d.etaOverride = eta !== null && eta > 0 ? { valor: eta, tipo: '%', justificativa: _cqVal('cq-te-eta-just') } : null;
  d.ativo = _cqChk('cq-te-habilitado');
}

function _cqTesteCapturarQual() {
  const d = _cqTesteDraft;
  if (!_cqTesteFormId) _cqTesteCapturarEquip(d);
  d.inicioUso = _cqVal('cq-te-inicio');
  _cqTesteCapturarSetor(d);
  d.materialId = '';
  d.niveis = [...document.querySelectorAll('#cq-drawer .cq-te-nivel:checked')].map(c => Number(c.value));
  d.controlesQual = {};
  d.lotesAtivos = {};
  [1, 2, 3].forEach(n => {
    const campo = cls => document.querySelector(`#cq-drawer ${cls}[data-n="${n}"]`)?.value || '';
    const c = { rotulo: campo('.cq-te-qrot').trim(), materialId: campo('.cq-te-qmat'), esperado: campo('.cq-te-qesp') };
    if (c.rotulo || c.materialId || c.esperado || d.niveis.includes(n)) d.controlesQual[n] = c;
    const lote = campo('.cq-te-lote');
    if (lote && c.materialId && d.niveis.includes(n)) d.lotesAtivos[n] = lote;
  });
  d.frequencia = { tipo: _cqVal('cq-te-freq') || 'por_lote', vezesDia: Math.max(1, Number(_cqVal('cq-te-vezes')) || 1) };
  d.regrasPreset = 'qualitativo';
  d.regras = {};
  d.opcoesRegras = {};
  d.etaOverride = null;
  // Meio / insumo controlado: o produto escolhido define nome do teste, tipo e filtro dos lotes
  const v = _cqSelVal('cq-te-insumo');
  const prod = _cqProdutoDoTeste(d, v);
  d.metodo = prod ? prod.nome : v;
  if (prod) { d.insumoProduto = prod.nome; d.insumoTipo = prod.tipo; d.insumoProdutoId = prod.id || ''; }
  else if (!v) { d.insumoProduto = ''; d.insumoTipo = ''; d.insumoProdutoId = ''; }
  // texto antigo que não corresponde a insumo cadastrado: mantém o vínculo anterior até ser revisado
  const chk = document.getElementById('cq-te-exigeins');
  d.exigirInsumo = !!d.insumoTipo && (chk ? chk.checked : true);
  d.ativo = _cqChk('cq-te-habilitado');
}

async function cqTesteSalvar() {
  if (_cqSalvando || !_cqPodeEditarCad(!!_cqTesteFormId)) return;
  _cqTesteCapturar();
  const d = _cqTesteDraft;
  const antes = _cqTesteFormId ? cqState.config.testes[_cqTesteFormId] : null;
  if (!d.analitoId) { showToast('Selecione o analito.', 'error'); return; }
  if (!d.ativoId && !d.sistemaAnalitico) { showToast('Selecione o equipamento ou sistema analítico (vinculado no cadastro do analito).', 'error'); return; }
  if (!antes && !_cqEquipsDoAnalito(_cqAnalito(d.analitoId)).some(o => _cqEquipChave(o.value) === _cqEquipChave(d.ativoId ? 'a:' + d.ativoId : 'm:' + d.sistemaAnalitico))) {
    showToast('Este equipamento/sistema não está vinculado ao analito.', 'error'); return;
  }
  const qual = _cqTesteQual(d);
  if (!d.niveis.length) { showToast('Selecione ao menos um nível de controle.', 'error'); return; }
  if (qual) {
    const escala = _cqArr(_cqAnalito(d.analitoId)?.escala);
    const semEsp = d.niveis.find(n => !escala.includes(d.controlesQual?.[n]?.esperado));
    if (semEsp) { showToast(`Defina o resultado esperado do nível ${semEsp} (RDC 978, art. 180, II).`, 'error'); return; }
    d.niveis.forEach(n => { if (!d.controlesQual[n].rotulo) d.controlesQual[n].rotulo = d.controlesQual[n].materialId ? `Nível ${n}` : 'Sem material'; });
  } else {
    if (!d.materialId) { showToast('Selecione o material de controle.', 'error'); return; }
    if (!Object.keys(d.regras).some(k => d.regras[k] === 'rejeicao')) { showToast('Defina ao menos uma regra de rejeição (RDC 978, art. 180, II).', 'error'); return; }
  }
  if (d.etaOverride && !d.etaOverride.justificativa) { showToast('Justifique o ETa específico do teste.', 'error'); return; }
  const u = d.unidadeId || _cqUnidadeAtivaId();
  if (_cqSetoresDaUnidade(u).length && !_cqSetorDoTeste(d)) { showToast('Escolha o setor do teste.', 'error'); return; }
  const dup = _cqTestesDaUnidade(u, { incluirInativos: true }).find(t => t.id !== _cqTesteFormId && t.analitoId === d.analitoId &&
    (t.ativoId || null) === (d.ativoId || null) && (t.ativoId ? true : (t.sistemaAnalitico || '') === (d.sistemaAnalitico || '')) && (t.metodo || '') === (d.metodo || ''));
  if (dup) { showToast(`Já existe este teste (analito, equipamento e ${qual ? 'meio/insumo' : 'método'}) nesta área.`, 'error'); return; }
  const regrasMudaram = antes && _cqCriteriosTeste(antes) !== _cqCriteriosTeste(d);
  if (regrasMudaram && !_cqCan('definirAlvos')) { showToast(qual ? 'Sem permissão para alterar resultados esperados.' : 'Sem permissão para alterar regras.', 'error'); return; }
  const lotesMudaram = antes && CQEngine.canonico(_cqMapaNiveis(antes.lotesAtivos)) !== CQEngine.canonico(_cqMapaNiveis(d.lotesAtivos));

  const concluir = async (justificativa) => {
    const ativo = d.ativoId && typeof _ativoById === 'function' ? _ativoById(d.ativoId) : null;
    const rec = { ...(antes || {}), ...d, id: _cqTesteFormId || _cqUid(), unidadeId: u,
                  ativoSnap: ativo ? { nome: ativo.nome || '', codigo: ativo.codigo || '', serie: ativo.serie || '', modelo: ativo.modelo || '' } : (antes?.ativoSnap || null),
                  versaoConfig: (antes?.versaoConfig || 0) + (regrasMudaram || !antes ? 1 : 0) };
    if (!antes) { rec.criadoEm = _cqAgora(); rec.criadoPor = _cqAssinatura(); }
    const fmt = {
      analitoId: v => _cqAnalito(v)?.nome || v, ativoId: v => (typeof _ativoById === 'function' && _ativoById(v)?.nome) || v,
      niveis: v => _cqArr(v).map(n => 'N' + n).join(', '), materialId: v => cqState.config.materiais[v]?.nome || v,
      lotesAtivos: v => Object.entries(v || {}).map(([n, l]) => `N${n}: ${cqState.config.lotesControle[l]?.lote || l}`).join('; '),
      frequencia: v => `${CQ_FREQ[v?.tipo] || v?.tipo} (${v?.vezesDia || 1}×/dia)`, regras: v => _cqResumoRegras(v),
      regrasPreset: v => CQEngine.PRESETS[v]?.label || 'Personalizado', opcoesRegras: v => `gatilho 1-2s: ${v?.gatilho12s ? 'sim' : 'não'}; incluir rejeitados: ${v?.incluirRejeitados ? 'sim' : 'não'}`,
      etaOverride: v => v ? `${v.valor}% (${v.justificativa})` : '—', ativo: v => v ? 'Sim' : 'Não',
      controlesQual: v => Object.entries(_cqMapaNiveis(v)).map(([n, c]) => `N${n} ${c.rotulo || ''}: ${cqState.config.materiais[c.materialId]?.nome || 'sem material'} → ${c.esperado || '—'}`).join('; '),
      insumoTipo: v => CQ_TIPOS_INSUMO[v] || '—', exigirInsumo: v => v ? 'Sim' : 'Não', insumoProdutoId: v => cqState.config.insumoProdutos[v]?.nome || v,
      setorId: v => v ? _cqRotuloSetor(v) : 'Do equipamento',
    };
    const diffs = antes ? _cqDiff(antes, rec, CQ_LBL_TESTE, fmt) : [];
    if (antes && !diffs.length) { cqDrawerClose(); return true; }
    _cqTrilhaAdd(rec, antes ? 'edicao' : 'criacao', antes ? `Teste alterado${justificativa ? ': ' + justificativa : ''}` : 'Teste cadastrado', diffs,
      regrasMudaram ? { versaoConfig: rec.versaoConfig } : null);
    _cqSalvando = true;
    try {
      if (!(await _cqSalvarRegistro('testes', rec))) return false;
      showToast(antes ? 'Teste atualizado.' : qual ? 'Teste cadastrado.' : 'Teste cadastrado. Cadastre agora os alvos (média e DP) de cada nível.', 'success');
      _cqTesteFormId = rec.id;
      _cqTesteDraft = JSON.parse(JSON.stringify(rec));
      _cqTesteFormTab = antes || qual ? 'config' : 'alvos';
      document.getElementById('cq-drawer-title').dataset.teste = String(rec.id);
      _cqTesteRender();
      cqRender();
      return true;
    } finally { _cqSalvando = false; }
  };

  if (regrasMudaram || lotesMudaram) {
    _cqPrompt({
      titulo: regrasMudaram ? (qual ? 'Alteração dos resultados esperados' : 'Alteração das regras de controle') : 'Troca de lote de controle',
      subtitulo: regrasMudaram ? `Nova versão da configuração (v${(antes.versaoConfig || 0) + 1})` : 'Registre o motivo da troca',
      corpo: `<div class="form-field"><label class="field-label">Justificativa <span class="required">*</span></label>
        <textarea id="cq-te-just" class="field-textarea" style="min-height:70px;" placeholder="${regrasMudaram ? 'Ex.: Sigma 5,8 no último semestre — simplificação para 1-3s/2-2s/R-4s conforme Westgard Sigma Rules.' : 'Ex.: lote anterior esgotado; novo lote avaliado em paralelo por 10 dias.'}"></textarea></div>
        ${regrasMudaram ? _cqSenhaCampoHTML() : ''}`,
      confirmar: 'Confirmar',
      onConfirm: async () => {
        const j = _cqVal('cq-te-just');
        if (!j) { showToast('Informe a justificativa.', 'error'); return false; }
        if (regrasMudaram && !(await _cqSenhaOk())) return false;
        return concluir(j);
      },
    });
    return;
  }
  await concluir('');
}

function cqTesteReiniciarHistorico() {
  const t = cqState.config.testes[_cqTesteFormId];
  if (!t) return;
  _cqPrompt({
    titulo: 'Reiniciar histórico das regras', subtitulo: `${_cqNomeTeste(t)} · ${_cqEquipTeste(t)}`,
    corpo: `<div class="cq-nota">As regras entre corridas (2-2s, 4-1s, 10x…) passarão a considerar apenas corridas posteriores a agora. Os resultados anteriores continuam registrados.</div>
      <div class="form-field"><label class="field-label">Justificativa <span class="required">*</span></label><textarea id="cq-rh-just" class="field-textarea" style="min-height:60px;"></textarea></div>${_cqSenhaCampoHTML()}`,
    confirmar: 'Reiniciar', perigo: true,
    onConfirm: async () => {
      const j = _cqVal('cq-rh-just');
      if (!j) { showToast('Informe a justificativa.', 'error'); return false; }
      if (!(await _cqSenhaOk())) return false;
      const rec = JSON.parse(JSON.stringify(t));
      rec.reinicioHistorico = CQEngine.chaveTempo(_cqNowLocal()) + '_zzzzz';
      _cqTrilhaAdd(rec, 'reinicio_historico', `Histórico das regras reiniciado: ${j}`);
      if (!(await _cqSalvarRegistro('testes', rec))) return false;
      _cqTesteDraft = JSON.parse(JSON.stringify(rec));
      _cqTesteRender();
      showToast('Histórico reiniciado.', 'success');
      return true;
    },
  });
}

// Campo de senha embutido em prompts de assinatura (respeita a política da unidade)
function _cqSenhaCampoHTML() {
  if (!_cqPolitica().reautenticar) return '';
  return `<div class="form-field"><label class="field-label">Sua senha (assinatura) <span class="required">*</span></label>
    <input type="password" id="cq-assin-pwd" class="field-input" autocomplete="current-password"></div>`;
}
async function _cqSenhaOk() {
  if (!_cqPolitica().reautenticar || typeof authVerifyCurrentPassword !== 'function') return true;
  if (!(await authVerifyCurrentPassword(document.getElementById('cq-assin-pwd')?.value || ''))) { showToast('Senha incorreta.', 'error'); return false; }
  return true;
}

// ── ALVOS (média e DP versionados) ───────────────────────────
function _cqAlvosHTML(t) {
  if (!t) return '';
  const pode = _cqCan('definirAlvos');
  const an = _cqAnalito(t.analitoId);
  const dec = an?.decimais ?? 2;
  const mapa = cqState.alvos[t.id] || {};
  const blocos = _cqNiveisTeste(t).map(n => {
    const lid = t.lotesAtivos?.[n];
    const lote = lid ? cqState.config.lotesControle[lid] : null;
    const versoes = Object.values(mapa).filter(a => Number(a.nivel) === n).sort((a, b) => (b.vigenteDesde || '').localeCompare(a.vigenteDesde || ''));
    const vig = lid ? _cqAlvoVigente(t.id, lid, n) : null;
    return `<div class="cq-alvo-bloco">
      <div class="cq-alvo-head"><div><b>Nível ${n}</b> · lote em uso: ${lote ? _cqEsc(lote.lote) : '<span class="cq-txt-vermelho">nenhum</span>'}</div>
        ${pode && lote ? `<button class="btn btn-primary btn-sm" onclick="cqAlvoForm('${t.id}',${n},'${lid}')">${CQ_ICO.plus} Novo alvo</button>` : ''}</div>
      ${vig ? `<div class="cq-alvo-vig"><div><span class="cq-muted">Média</span><b>${_cqNum(vig.media, dec)}</b></div><div><span class="cq-muted">DP</span><b>${_cqNum(vig.dp, dec + 1)}</b></div>
        <div><span class="cq-muted">CV</span><b>${_cqNum(Math.abs(vig.dp / vig.media) * 100, 2)}%</b></div><div><span class="cq-muted">Origem</span>${_cqBadge(CQ_ORIGEM_ALVO, vig.origem)}</div>
        <div><span class="cq-muted">Vigente desde</span><b>${_cqFmtDH(vig.vigenteDesde)}</b></div></div>` : `<div class="cq-alerta-box">${CQ_ICO.alerta} Sem alvo para o lote em uso: os resultados ficarão “sem alvo” e exigirão decisão manual.</div>`}
      ${versoes.length ? `<table class="ot-list-table cq-table cq-table-sm"><thead><tr><th class="ot-list-th">Lote</th><th class="ot-list-th">Vigente desde</th><th class="ot-list-th">Média</th><th class="ot-list-th">DP</th><th class="ot-list-th">Origem</th><th class="ot-list-th">n</th><th class="ot-list-th">Justificativa / aprovação</th></tr></thead><tbody>
        ${versoes.map(a => `<tr${a.id === vig?.id ? ' class="cq-row-destaque"' : ''}><td>${_cqEsc(cqState.config.lotesControle[a.loteControleId]?.lote || '?')}</td><td>${_cqFmtDH(a.vigenteDesde)}</td>
          <td>${_cqNum(a.media, dec)}</td><td>${_cqNum(a.dp, dec + 1)}</td><td>${_cqBadge(CQ_ORIGEM_ALVO, a.origem)}</td><td>${a.nPontos || '—'}</td>
          <td style="font-size:11.5px;max-width:220px;">${_cqEsc(a.justificativa)}<div class="cq-muted">${_cqEsc(a.aprovado?.porNome || '')} · ${_cqFmtDH(a.aprovado?.em)}</div></td></tr>`).join('')}</tbody></table>` : ''}
    </div>`;
  }).join('');
  return `<div style="padding-top:12px;">
    <div class="cq-nota">Cada alteração cria uma nova versão; as anteriores permanecem registradas. Cada resultado guarda a média e o DP usados na sua avaliação (RDC 978, art. 116).</div>
    ${blocos || '<div class="cq-vazio-p">Selecione níveis e lotes na aba Configuração.</div>'}</div>`;
}

let _cqAlvoCtx = null;

function cqAlvoForm(testeId, nivel, loteId) {
  const t = cqState.config.testes[testeId];
  if (!t || !_cqCan('definirAlvos')) return;
  const an = _cqAnalito(t.analitoId);
  const lote = cqState.config.lotesControle[loteId];
  _cqAlvoCtx = { testeId, nivel, loteId };
  _cqPrompt({
    titulo: `Novo alvo · nível ${nivel}`, subtitulo: `${_cqNomeTeste(t)} · lote ${lote?.lote || '?'} (${an?.unidadeMedida || ''})`,
    corpo: `
      <div class="form-field"><label class="field-label">Origem</label>
        <select id="cq-alvo-origem" class="field-select" onchange="cqAlvoOrigemChange()">${_cqMapOptions(Object.fromEntries(Object.entries(CQ_ORIGEM_ALVO).map(([k, v]) => [k, v.label])), 'fabricante', null)}</select></div>
      <div id="cq-alvo-fab">
        <div class="cq-nota">Faixa da bula (média ± k·DP). Faixas do fabricante costumam ser largas: use como alvo provisório até ter 20 resultados.</div>
        <div class="form-row"><div class="form-field"><label class="field-label">Mínimo</label><input type="text" inputmode="decimal" id="cq-alvo-min" class="field-input" oninput="cqAlvoFaixaCalc()"></div>
          <div class="form-field"><label class="field-label">Máximo</label><input type="text" inputmode="decimal" id="cq-alvo-max" class="field-input" oninput="cqAlvoFaixaCalc()"></div>
          <div class="form-field" style="max-width:90px;"><label class="field-label">k (DP)</label><input type="text" inputmode="decimal" id="cq-alvo-k" class="field-input" value="2" oninput="cqAlvoFaixaCalc()"></div></div>
      </div>
      <div id="cq-alvo-dados" style="display:none;">
        <div class="form-row"><div class="form-field"><label class="field-label">Período dos dados</label><select id="cq-alvo-meses" class="field-select"><option value="1">Mês atual</option><option value="2">2 meses</option><option value="3" selected>3 meses</option><option value="6">6 meses</option></select></div>
          <div class="form-field" style="justify-content:flex-end;display:flex;flex-direction:column;"><button class="btn btn-outline btn-sm" onclick="cqAlvoCalcular()">${CQ_ICO.grafico} Calcular a partir dos dados</button></div></div>
        <div id="cq-alvo-calc-res"></div>
      </div>
      <div class="form-row"><div class="form-field"><label class="field-label">Média <span class="required">*</span></label><input type="text" inputmode="decimal" id="cq-alvo-media" class="field-input"></div>
        <div class="form-field"><label class="field-label">DP <span class="required">*</span></label><input type="text" inputmode="decimal" id="cq-alvo-dp" class="field-input"></div>
        <div class="form-field" style="max-width:90px;"><label class="field-label">n</label><input type="number" min="0" id="cq-alvo-n" class="field-input"></div></div>
      <div class="form-field"><label class="field-label">Vigente a partir de <span class="required">*</span></label><input type="datetime-local" id="cq-alvo-desde" class="field-input" value="${_cqNowLocal()}"></div>
      <div class="form-field"><label class="field-label">Justificativa <span class="required">*</span></label><textarea id="cq-alvo-just" class="field-textarea" style="min-height:60px;" placeholder="Ex.: média e DP de 20 corridas (01 a 25/09), lote novo avaliado em paralelo."></textarea></div>
      ${_cqSenhaCampoHTML()}`,
    confirmar: 'Assinar e salvar',
    onConfirm: cqAlvoSalvar,
  });
}

function cqAlvoOrigemChange() {
  const o = _cqVal('cq-alvo-origem');
  document.getElementById('cq-alvo-fab').style.display = o === 'fabricante' ? '' : 'none';
  document.getElementById('cq-alvo-dados').style.display = o === 'fabricante' ? 'none' : '';
}
function cqAlvoFaixaCalc() {
  const mn = CQEngine.parseNumero(_cqVal('cq-alvo-min')), mx = CQEngine.parseNumero(_cqVal('cq-alvo-max')), k = CQEngine.parseNumero(_cqVal('cq-alvo-k')) || 2;
  if (mn === null || mx === null || mx <= mn) return;
  const t = cqState.config.testes[_cqAlvoCtx.testeId];
  const dec = (_cqAnalito(t.analitoId)?.decimais ?? 2) + 2;
  _cqSet('cq-alvo-media', String(CQEngine.arred((mn + mx) / 2, dec)).replace('.', ','));
  _cqSet('cq-alvo-dp', String(CQEngine.arred(CQEngine.dpDeFaixa(mn, mx, k), dec)).replace('.', ','));
}

async function cqAlvoCalcular() {
  const ctx = _cqAlvoCtx;
  const t = cqState.config.testes[ctx.testeId];
  const u = t.unidadeId;
  const meses = Number(_cqVal('cq-alvo-meses')) || 3;
  const mesAte = CQEngine.mesDe(_cqNowLocal());
  const mesDe = CQEngine.mesesAnteriores(mesAte, meses)[meses - 1];
  const el = document.getElementById('cq-alvo-calc-res');
  el.innerHTML = '<div class="cq-nota">Carregando resultados…</div>';
  const res = (await cqResultadosPeriodo(u, t.id, mesDe, mesAte, { forcar: true }))
    .filter(r => Number(r.nivel) === Number(ctx.nivel) && r.loteControleId === ctx.loteId && !r.invalidado && !r.excluido && r.decisao !== 'R' && Number.isFinite(r.valor));
  // CV de referência: alvo estabelecido mais recente do mesmo nível em outro lote
  const anteriores = Object.values(cqState.alvos[t.id] || {}).filter(a => Number(a.nivel) === Number(ctx.nivel) && a.loteControleId !== ctx.loteId && ['estabelecido', 'cumulativo'].includes(a.origem))
    .sort((a, b) => (b.vigenteDesde || '').localeCompare(a.vigenteDesde || ''));
  const cvRef = anteriores[0] ? Math.abs(anteriores[0].dp / anteriores[0].media) * 100 : null;
  const r = CQEngine.estabelecerAlvo(res.map(x => x.valor), { cvReferencia: cvRef });
  const dec = (_cqAnalito(t.analitoId)?.decimais ?? 2) + 2;
  if (r.ok) {
    _cqSet('cq-alvo-media', String(CQEngine.arred(r.media, dec)).replace('.', ','));
    _cqSet('cq-alvo-dp', String(CQEngine.arred(r.dp, dec)).replace('.', ','));
    _cqSet('cq-alvo-n', r.n);
    _cqSet('cq-alvo-origem', r.origem);
    if (!_cqVal('cq-alvo-just')) _cqSet('cq-alvo-just', `Calculado com ${r.n} resultados do lote (${_cqFmtMes(mesDe)} a ${_cqFmtMes(mesAte)}).`);
  }
  el.innerHTML = `<div class="cq-calc-box">${r.ok ? `n = <b>${r.n}</b> · média <b>${_cqNum(r.media, dec - 1)}</b> · DP <b>${_cqNum(r.dp, dec)}</b> · CV <b>${_cqNum(r.cv, 2)}%</b>` : ''}
    ${cvRef ? `<div class="cq-muted">CV do lote anterior: ${_cqNum(cvRef, 2)}%</div>` : ''}
    ${r.avisos.map(a => `<div class="cq-txt-amarelo">• ${_cqEsc(a)}</div>`).join('')}</div>`;
}

async function cqAlvoSalvar() {
  const ctx = _cqAlvoCtx;
  const t = cqState.config.testes[ctx.testeId];
  const media = CQEngine.parseNumero(_cqVal('cq-alvo-media')), dp = CQEngine.parseNumero(_cqVal('cq-alvo-dp'));
  const desde = _cqVal('cq-alvo-desde'), just = _cqVal('cq-alvo-just'), origem = _cqVal('cq-alvo-origem');
  if (media === null || dp === null || dp <= 0) { showToast('Informe média e DP válidos (DP > 0).', 'error'); return false; }
  if (!desde) { showToast('Informe a data de início de vigência.', 'error'); return false; }
  if (!just) { showToast('Informe a justificativa.', 'error'); return false; }
  if (!(await _cqSenhaOk())) return false;
  const cv = Math.abs(dp / media) * 100;
  const an = _cqAnalito(t.analitoId);
  const eta = t.etaOverride?.valor || (an?.eta?.tipo === '%' ? Number(an.eta.valor) : null);
  if (eta && cv > eta / 2) showToast(`Atenção: CV de ${_cqNum(cv, 1)}% é alto em relação ao ETa (${_cqNum(eta, 1)}%).`, 'error');
  const anterior = _cqAlvoVigente(t.id, ctx.loteId, ctx.nivel, desde);
  const id = _cqUid();
  const alvo = {
    id, loteControleId: ctx.loteId, nivel: Number(ctx.nivel), media, dp, origem,
    nPontos: Number(_cqVal('cq-alvo-n')) || null, vigenteDesde: desde, substitui: anterior?.id || null, justificativa: just,
    faixaFabricante: origem === 'fabricante' ? { min: CQEngine.parseNumero(_cqVal('cq-alvo-min')), max: CQEngine.parseNumero(_cqVal('cq-alvo-max')), k: CQEngine.parseNumero(_cqVal('cq-alvo-k')) || 2 } : null,
    aprovado: _cqAssinatura({ reautenticado: !!_cqPolitica().reautenticar }), criadoEm: _cqAgora(),
  };
  const u = t.unidadeId;
  const trilhaTeste = _cqTrilhaEntry('alvo', `Novo alvo N${ctx.nivel} lote ${cqState.config.lotesControle[ctx.loteId]?.lote}: média ${media}, DP ${dp} (${CQ_ORIGEM_ALVO[origem]?.label}) — ${just}`);
  const ok = await window.dbUpdate({
    [`${CQ_KEYS.alvos}/${u}/${t.id}/${id}`]: alvo,
    [`${CQ_KEYS.config}/testes/${t.id}/trilha/${_cqTk()}`]: trilhaTeste,
  });
  if (!ok) { showToast('Falha ao gravar o alvo.', 'error'); return false; }
  (cqState.alvos[t.id] = cqState.alvos[t.id] || {})[id] = alvo;
  showToast('Alvo registrado.', 'success');
  if (_cqTesteFormId === t.id && _cqTesteFormTab === 'alvos') _cqTesteRender();
  cqRender();
  return true;
}

// ── EXCLUSÃO DE CADASTROS SEM LANÇAMENTOS ────────────────────
// Só é possível excluir cadastros que nunca entraram em uma corrida e dos
// quais nenhum outro cadastro depende. Cadastros já usados devem ser
// inativados (registros do CQ são retidos — RDC 978/2025). Cada exclusão
// fica registrada com cópia do cadastro em CQ_KEYS.exclusoes.
const CQ_COLECAO_LABEL = { testes: 'teste', analitos: 'analito', materiais: 'material de controle', lotesControle: 'lote de controle', insumoProdutos: 'produto', insumos: 'lote de insumo', conjuntosPreparo: 'conjunto de troca' };

// Leitura que lança exceção em caso de erro (dbLoad devolve null tanto para "vazio" quanto para erro)
function _cqLerOuFalhar(path) { return window.dbGet(path); }

// Marcadores de uso. Na primeira chamada varre os lançamentos gravados antes
// de os marcadores existirem e grava o resultado (uma única vez).
async function _cqUsoCarregar() {
  const atual = await _cqLerOuFalhar(CQ_KEYS.uso);
  if (atual && atual._v) return atual;
  const [corridas, resultados] = await Promise.all([_cqLerOuFalhar(CQ_KEYS.corridas), _cqLerOuFalhar(CQ_KEYS.resultados)]);
  const updates = {};
  const vals = o => Object.values(o && typeof o === 'object' ? o : {});
  vals(corridas).forEach(meses => vals(meses).forEach(cs => vals(cs).forEach(c => {
    Object.entries(c?.testes || {}).forEach(([tid, ct]) => {
      if (ct?.naoRealizado) return;
      _cqMarcarUso(updates, 'testes', tid);
      _cqMarcarUso(updates, 'insumos', ct?.lr);
      _cqMarcarUso(updates, 'insumos', ct?.lk);
    });
  })));
  vals(resultados).forEach(meses => vals(meses).forEach(ts => Object.entries(ts && typeof ts === 'object' ? ts : {}).forEach(([tid, rs]) => {
    _cqMarcarUso(updates, 'testes', tid);
    vals(rs).forEach(raw => {
      const r = CQEngine.expandirResultado(raw);
      _cqMarcarUso(updates, 'lotesControle', r.loteControleId);
      _cqMarcarUso(updates, 'insumos', r.loteReagenteId);
      _cqMarcarUso(updates, 'insumos', r.loteCalibradorId);
    });
  })));
  updates[`${CQ_KEYS.uso}/_v`] = _cqAgora();
  if (!(await window.dbUpdate(updates))) throw new Error('Falha ao gravar os marcadores de uso do CQ.');
  const uso = { ...(atual || {}) };
  Object.keys(updates).forEach(p => {
    const [col, id] = p.slice(CQ_KEYS.uso.length + 1).split('/');
    if (id) (uso[col] = uso[col] || {})[id] = true; else uso[col] = updates[p];
  });
  return uso;
}

// Motivos que impedem a exclusão (lista vazia = pode excluir)
function _cqBloqueiosExclusao(colecao, id, uso) {
  const cfg = cqState.config;
  const usado = (c, x) => !!(x && uso?.[c]?.[x]);
  const testes = Object.values(cfg.testes);
  const matsDoTeste = t => [t.materialId, ...Object.values(t.controlesQual || {}).map(c => c?.materialId)].filter(Boolean);
  const lotesDoTeste = t => Object.values(t.lotesAtivos || {}).filter(Boolean);
  const nomeTeste = t => `teste ${_cqNomeTeste(t)} · ${_cqEquipTeste(t)}`;
  const motivos = [];

  if (colecao === 'testes') {
    const comIndice = Object.values(cqState.indices || {}).some(ix => ix?.ultimo?.[id]);
    if (usado('testes', id) || comIndice) motivos.push('Possui lançamentos de CQ.');
  } else if (colecao === 'analitos') {
    if (usado('analitos', id) || testes.some(t => t.analitoId === id && usado('testes', t.id))) motivos.push('Possui lançamentos de CQ.');
    testes.filter(t => t.analitoId === id).forEach(t => motivos.push(`Usado no ${nomeTeste(t)} (exclua o teste antes).`));
    Object.values(cfg.insumoProdutos).filter(p => _cqArr(p.analitoIds).includes(id)).forEach(p => motivos.push(`Vinculado ao produto ${p.nome}.`));
    Object.values(cfg.insumos).filter(i => !_cqProdutoInsumo(i) && _cqArr(i.analitoIds).includes(id)).forEach(i => motivos.push(`Vinculado ao lote de insumo ${i.nome} ${i.lote}.`));
  } else if (colecao === 'materiais') {
    const lotes = Object.values(cfg.lotesControle).filter(l => l.materialId === id);
    if (usado('materiais', id) || lotes.some(l => usado('lotesControle', l.id)) || testes.some(t => matsDoTeste(t).includes(id) && usado('testes', t.id))) motivos.push('Possui lançamentos de CQ.');
    lotes.forEach(l => motivos.push(`Possui o lote de controle ${l.lote} (exclua o lote antes).`));
    testes.filter(t => matsDoTeste(t).includes(id)).forEach(t => motivos.push(`Usado no ${nomeTeste(t)}.`));
    Object.values(cfg.conjuntosPreparo || {}).filter(c => (c?.itens || []).some(x => x?.materialId === id)).forEach(c => motivos.push(`Faz parte do conjunto de preparo ${c.nome} (retire-o do conjunto antes).`));
  } else if (colecao === 'lotesControle') {
    if (usado('lotesControle', id)) motivos.push('Possui lançamentos de CQ.');
    testes.filter(t => lotesDoTeste(t).includes(id)).forEach(t => motivos.push(`Em uso no ${nomeTeste(t)}.`));
    const nPrep = Object.values(cfg.lotesControle[id]?.preparos || {}).filter(p => p?.id).length;
    if (nPrep) motivos.push(`Possui ${nPrep} preparo(s) registrado(s) (exclua os preparos antes).`);
  } else if (colecao === 'insumoProdutos') {
    const lotes = _cqLotesDoProduto(id);
    if (lotes.some(l => usado('insumos', l.id))) motivos.push('Possui lançamentos de CQ.');
    lotes.forEach(l => motivos.push(`Possui o lote ${l.lote} (exclua o lote antes).`));
    testes.filter(t => t.insumoProdutoId === id).forEach(t => motivos.push(`Controlado pelo ${nomeTeste(t)}.`));
    Object.values(cfg.conjuntosPreparo || {}).filter(c => (c?.itens || []).some(x => x?.produtoId === id)).forEach(c => motivos.push(`Faz parte do conjunto de preparo ${c.nome} (retire-o do conjunto antes).`));
  } else if (colecao === 'conjuntosPreparo') {
    // Utilizado = alguma troca registrou preparo com este conjunto
    const n = Object.values(cfg.insumos).reduce((s, i) => s + Object.values(_cqLoteCru(i)?.preparos || {}).filter(p => p?.conjunto?.id === id).length, 0)
      + Object.values(cfg.lotesControle).reduce((s, l) => s + Object.values(l?.preparos || {}).filter(p => p?.conjunto?.id === id).length, 0);
    if (n) motivos.push(`Já usado em troca (${n} preparo(s) registrados com este conjunto). Desmarque “Ativo” para retirá-lo de uso.`);
  } else if (colecao === 'insumos') {
    if (usado('insumos', id)) motivos.push('Possui lançamentos de CQ.');
    const nPrep = Object.values(_cqLoteCru(cfg.insumos[id] || {})?.preparos || {}).filter(p => p?.id).length;
    if (nPrep) motivos.push(`Possui ${nPrep} preparo(s) registrado(s) (exclua os preparos antes).`);
  }
  return motivos;
}

function _cqResumoCadastro(colecao, r) {
  if (colecao === 'testes') return `${_cqNomeTeste(r)} · ${_cqEquipTeste(r)}`;
  if (colecao === 'analitos') return [r.codigo, r.nome].filter(Boolean).join(' — ');
  if (colecao === 'materiais') return `${r.nome} (${r.fabricante || '—'})`;
  if (colecao === 'lotesControle') return `Lote ${r.lote} — ${cqState.config.materiais[r.materialId]?.nome || '?'}`;
  if (colecao === 'insumoProdutos') return `${r.nome} (${CQ_TIPOS_INSUMO[r.tipo] || r.tipo})`;
  if (colecao === 'insumos') return `${r.nome || '?'} — lote ${r.lote}`;
  if (colecao === 'conjuntosPreparo') return r.nome || r.id;
  return r.id;
}

async function cqExcluirCadastro(colecao, id) {
  if (!_cqPodeExcluirCad(colecao)) { showToast('Sem permissão para excluir cadastros do CQ.', 'error'); return; }
  const rec = cqState.config[colecao]?.[id];
  if (!rec) return;
  if (!_cqPodeGravar()) return;
  const rotulo = CQ_COLECAO_LABEL[colecao] || 'cadastro';
  let uso;
  try { uso = await _cqUsoCarregar(); }
  catch (err) {
    console.error('[cq-cadastros.js] cqExcluirCadastro:', err);
    showToast('Não foi possível verificar os lançamentos. Tente novamente.', 'error');
    return;
  }
  const motivos = _cqBloqueiosExclusao(colecao, id, uso);
  if (motivos.length) {
    _cqPrompt({
      titulo: `Não é possível excluir este ${rotulo}`, subtitulo: _cqResumoCadastro(colecao, rec), confirmar: 'Entendi',
      corpo: `<div class="cq-alerta-box">${CQ_ICO.alerta} ${motivos.map(m => _cqEsc(m)).join('<br>')}</div>
        <div class="cq-nota">Cadastros com lançamentos não podem ser excluídos — os registros do CQ devem ser retidos (RDC 978/2025). Desmarque “Ativo” ou altere a situação para retirá-lo de uso.</div>`,
      onConfirm: () => true,
    });
    return;
  }
  _cqPrompt({
    titulo: `Excluir ${rotulo}`, subtitulo: _cqResumoCadastro(colecao, rec), perigo: true, confirmar: 'Excluir',
    corpo: `<div class="cq-nota">Este ${rotulo} não possui lançamentos de CQ. A exclusão remove o cadastro${colecao === 'testes' || colecao === 'lotesControle' ? ' e os alvos vinculados' : ''}. Uma cópia fica registrada no histórico de exclusões.</div>
      <div class="form-field"><label class="field-label">Motivo <span class="required">*</span></label>
        <input type="text" id="cq-excl-motivo" class="field-input" maxlength="200" placeholder="Ex.: cadastro de teste / cadastrado em duplicidade" onkeydown="if(event.key==='Enter')cqPromptConfirmar()"></div>`,
    onConfirm: async () => {
      const motivo = _cqVal('cq-excl-motivo');
      if (!motivo) { showToast('Informe o motivo da exclusão.', 'error'); return false; }
      if (!_cqPodeGravar()) return false;
      let alvosTodos, usoAgora;
      try { [alvosTodos, usoAgora] = await Promise.all([_cqLerOuFalhar(CQ_KEYS.alvos), _cqLerOuFalhar(CQ_KEYS.uso)]); }
      catch (err) { console.error('[cq-cadastros.js] cqExcluirCadastro:', err); showToast('Falha ao ler o banco. Nada foi excluído.', 'error'); return false; }
      // Revalida: outra estação pode ter lançado depois da primeira verificação
      if (_cqBloqueiosExclusao(colecao, id, usoAgora || uso).length) { showToast('Este cadastro passou a ter vínculos. Nada foi excluído.', 'error'); return true; }

      const updates = { [`${CQ_KEYS.config}/${colecao}/${id}`]: null };
      const alvosRemovidos = {};
      Object.entries(alvosTodos || {}).forEach(([u, porTeste]) => Object.entries(porTeste || {}).forEach(([tid, mapa]) => {
        Object.entries(mapa || {}).forEach(([aid, a]) => {
          if ((colecao === 'testes' && tid === id) || (colecao === 'lotesControle' && a?.loteControleId === id)) {
            updates[`${CQ_KEYS.alvos}/${u}/${tid}/${aid}`] = null;
            alvosRemovidos[`${u}|${tid}|${aid}`] = a;
          }
        });
      }));
      updates[`${CQ_KEYS.exclusoes}/${_cqTk()}`] = {
        colecao, id, resumo: _cqResumoCadastro(colecao, rec), motivo, registro: rec,
        alvos: Object.keys(alvosRemovidos).length ? alvosRemovidos : null, ..._cqAssinatura(),
      };
      if (!(await window.dbUpdate(updates))) { showToast('Falha ao excluir. Verifique a conexão e tente novamente.', 'error'); return false; }
      delete cqState.config[colecao][id];
      if (colecao === 'testes') delete cqState.alvos[id];
      showToast(`${rotulo.charAt(0).toUpperCase() + rotulo.slice(1)} excluído.`, 'success');
      cqDrawerClose();
      cqRender();
      return true;
    },
  });
}
