// ═══════════════════════════════════════════════════════════════
// org.js — Unidades e setores (hierarquia compartilhada)
// Unidade (ex.: NTO) → Setores (ex.: Hematologia). O ativo pertence a um setor
// e, por ele, a uma unidade. Ativos, Rotinas, OT, Ocorrências, Início e CQ leem
// a hierarquia apenas pelas funções deste arquivo.
//
// Modelo antigo: `state.setores` é uma lista de nomes que mistura unidades
// ("01 - Unidade NTO") e setores ("Hematologia"). Cada nome antigo ainda não
// tratado aparece como setor "sem unidade" (id 'n:<nome>'). Na tela de Unidades
// e setores cada um é movido para uma unidade (vira setor dela) ou transformado
// em unidade; o vínculo fica em `legado`, então ativos, permissões, OT e
// ocorrências que guardam o nome antigo passam a apontar para o setor novo.
// O vínculo com o Controle de Qualidade é feito no CQ (área.orgUnidadeId; várias áreas por unidade).
//
// Setor compartilhado: o ativo tem um setor responsável (setorId) e pode ser
// compartilhado com outros setores do mesmo ambiente (ativo.setoresCompartilhados).
// Quem é de qualquer um desses setores vê e opera o ativo; OT/CQ/histórico seguem o principal.
//
// Ambientes: salas físicas da unidade (ex.: Sala de Coleta, Sala Analítica 01).
// Ligação N:N com os setores da mesma unidade, guardada só em ambiente.setorIds.
// O ativo fica em um ambiente (ativo.ambienteId), escolhido entre os do setor.
// ═══════════════════════════════════════════════════════════════

const ORG_KEY = 'gestao-org-v1';

// { unidades: { id: { id, sigla, nome, ativa } },
//   setores:  { id: { id, nome, unidadeId, ativo } },
//   ambientes:{ id: { id, nome, unidadeId, setorIds: [], ativo } },
//   legado:   { k: { nome, setorId, unidadeId, em, porNome } } }   ← nome antigo → setor novo ('' = sem setor)
let orgState = { unidades: {}, setores: {}, ambientes: {}, legado: {} };
let _orgReady = false;
let _orgMapaLegado = new Map();   // nome antigo normalizado → setorId ('' = tratado sem setor)

document.addEventListener('DOMContentLoaded', () => {
  window._dbReady.then(() => {
    window.dbListen(ORG_KEY, data => {
      _orgReady = true;
      const d = (data && typeof data === 'object') ? data : {};
      const obj = v => (v && typeof v === 'object') ? v : {};
      orgState = { unidades: obj(d.unidades), setores: obj(d.setores), ambientes: obj(d.ambientes), legado: obj(d.legado) };
      _orgMapaLegado = new Map(Object.values(orgState.legado).filter(x => x && x.nome).map(x => [_orgNorm(x.nome), x.setorId || '']));
      _orgAoMudar();
    });
  });
});

function _orgEsc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// Conteúdo de string JS ('...') dentro de atributo HTML (onclick="f('…')")
function _orgJsAttr(s) { return _orgEsc(String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")); }
function _orgNorm(s) { return String(s || '').trim().toLocaleLowerCase('pt-BR'); }
function _orgUid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// ── CONSULTAS ────────────────────────────────────────────────
// Há unidades cadastradas? (filtros de unidade e agrupamentos só aparecem a partir daí)
function _orgMigrado() { return Object.values(orgState.unidades || {}).some(Boolean); }

// Unidades, ordenadas por sigla. opts.todas inclui as inativas.
function _orgUnidades(opts = {}) {
  return Object.values(orgState.unidades || {})
    .filter(u => u && (opts.todas || u.ativa !== false))
    .sort((a, b) => (a.sigla || '').localeCompare(b.sigla || '', 'pt-BR'));
}
function _orgUnidade(id) { return id ? (orgState.unidades?.[id] || null) : null; }
function _orgSiglaUnidade(id) { const u = _orgUnidade(id); return u ? (u.sigla || u.nome || '') : ''; }

// Nomes do modelo antigo (lista + nomes usados nos ativos)
function _orgNomesLegados() {
  const nomes = (typeof state !== 'undefined' && Array.isArray(state.setores)) ? state.setores.filter(Boolean) : [];
  const set = new Set(nomes);
  if (typeof state !== 'undefined') (state.ativos || []).forEach(a => { if (a?.setor && !a.setorId) set.add(a.setor); });
  return [...set];
}
function _orgLegadoTratado(nome) { return _orgMapaLegado.has(_orgNorm(nome)); }
// Nomes antigos ainda sem destino (aparecem como setores sem unidade)
function _orgNomesPendentes() { return _orgNomesLegados().filter(n => !_orgLegadoTratado(n)); }
function _orgSetorVirtual(nome) { return { id: 'n:' + nome, nome, unidadeId: null, ativo: true, virtual: true }; }

// Setores. unidadeId: undefined = todos; null = sem unidade; id = da unidade. opts.todos inclui inativos.
function _orgSetores(unidadeId, opts = {}) {
  let lista = [
    ...Object.values(orgState.setores || {}).filter(s => s && (opts.todos || s.ativo !== false)),
    ..._orgNomesPendentes().map(_orgSetorVirtual)
  ];
  if (unidadeId !== undefined) lista = lista.filter(s => (s.unidadeId || null) === (unidadeId || null));
  return lista.sort((a, b) =>
    _orgSiglaUnidade(a.unidadeId).localeCompare(_orgSiglaUnidade(b.unidadeId), 'pt-BR') ||
    (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
}
// Setor por id. 'n:<nome>' = nome antigo: resolve pelo vínculo (legado) ou fica como setor sem unidade
function _orgSetor(id) {
  if (!id) return null;
  if (orgState.setores?.[id]) return orgState.setores[id];
  if (!String(id).startsWith('n:')) return null;
  const nome = String(id).slice(2);
  const k = _orgNorm(nome);
  if (_orgMapaLegado.has(k)) return orgState.setores?.[_orgMapaLegado.get(k)] || null;
  return _orgSetorVirtual(nome);
}
function _orgSetoresPorNome(nome, unidadeId) {
  const n = _orgNorm(nome);
  if (!n) return [];
  return _orgSetores(unidadeId, { todos: true }).filter(s => _orgNorm(s.nome) === n);
}
// Id do setor correspondente a um nome antigo ('' = sem correspondência)
function _orgIdDeNomeLegado(nome) { return nome ? (_orgSetor('n:' + nome)?.id || '') : ''; }

// Setor de um ativo: pelo setorId; sem ele, pelo nome antigo
function _orgSetorDoAtivo(a) {
  if (!a) return null;
  if (a.setorId && orgState.setores?.[a.setorId]) return orgState.setores[a.setorId];
  return a.setor ? _orgSetor('n:' + a.setor) : null;
}
function _orgSetorIdDoAtivo(a) {
  const s = _orgSetorDoAtivo(a);
  if (s) return s.id;
  return a?.setor ? 'n:' + a.setor : '';
}
function _orgUnidadeIdDoAtivo(a) { return _orgSetorDoAtivo(a)?.unidadeId || ''; }
// Setores com que o ativo é compartilhado (só setores existentes da unidade do principal)
function _orgSetoresCompDoAtivo(a) {
  const v = a?.setoresCompartilhados;
  const lista = Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.values(v) : []);
  if (!lista.length) return [];
  const p = _orgSetorDoAtivo(a);
  if (!p || p.virtual) return [];
  return [...new Set(lista)].filter(id => id && id !== p.id && orgState.setores?.[id]?.unidadeId === p.unidadeId);
}
// Setor responsável + compartilhados (filtros, permissões e contagens)
function _orgSetorIdsDoAtivo(a) {
  const p = _orgSetorIdDoAtivo(a);
  return p ? [p, ..._orgSetoresCompDoAtivo(a)] : [];
}
function _orgUnidadeIdDoSetor(setorId) { return _orgSetor(setorId)?.unidadeId || ''; }

// ── AMBIENTES ────────────────────────────────────────────────
// Setores ligados ao ambiente (lista gravada pode vir como objeto do banco)
function _orgSetorIdsDoAmbiente(amb) {
  const v = amb?.setorIds;
  return Array.isArray(v) ? v.filter(Boolean) : (v && typeof v === 'object' ? Object.values(v).filter(Boolean) : []);
}
// Ambientes, ordenados por nome. unidadeId: undefined = todos. opts.todos inclui inativos.
function _orgAmbientes(unidadeId, opts = {}) {
  return Object.values(orgState.ambientes || {})
    .filter(x => x && (opts.todos || x.ativo !== false) && (unidadeId === undefined || x.unidadeId === unidadeId))
    .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR', { numeric: true }));
}
function _orgAmbiente(id) { return id ? (orgState.ambientes?.[id] || null) : null; }
function _orgTemAmbientes() { return Object.values(orgState.ambientes || {}).some(Boolean); }
// Ambientes ligados ao setor (opts.todos inclui inativos)
function _orgAmbientesDoSetor(setorId, opts = {}) {
  if (!setorId) return [];
  return _orgAmbientes(undefined, opts).filter(x => _orgSetorIdsDoAmbiente(x).includes(setorId));
}
function _orgAmbienteDoAtivo(a) { return _orgAmbiente(a?.ambienteId); }
// "Sala Analítica 01" (+ " (inativo)")
function _orgRotuloAmbiente(id) {
  const x = _orgAmbiente(id);
  return x ? x.nome + (x.ativo === false ? ' (inativo)' : '') : '';
}
// Rótulo a partir de um par gravado (ambienteId, nome) — OT e ocorrências
function _orgRotuloAmbienteRef(id, nome) { return _orgRotuloAmbiente(id) || nome || ''; }

// "NTO · Hematologia" (opts.semUnidade: só o nome)
function _orgRotuloSetor(id, opts = {}) {
  const s = _orgSetor(id);
  if (!s) return id && String(id).startsWith('n:') ? String(id).slice(2) : '';
  const sig = opts.semUnidade ? '' : _orgSiglaUnidade(s.unidadeId);
  return sig ? `${sig} · ${s.nome}` : s.nome;
}
// Rótulo do setor de um ativo (cai no nome gravado no ativo). opts.ambiente acrescenta a sala;
// opts.compartilhado acrescenta os setores compartilhados ("NTO · Microbiologia + Parasitologia").
function _orgRotuloAtivo(a, opts = {}) {
  const s = _orgSetorDoAtivo(a);
  let base = s ? _orgRotuloSetor(s.id, opts) : (a?.setor || '');
  if (opts.compartilhado) {
    const comp = _orgSetoresCompDoAtivo(a).map(id => orgState.setores[id].nome);
    if (comp.length) base += ' + ' + comp.join(' + ');
  }
  const amb = opts.ambiente ? _orgRotuloAmbiente(a?.ambienteId) : '';
  return amb ? (base ? `${base} · ${amb}` : amb) : base;
}
// Id de setor a partir de um par gravado (setorId, nome) — OT/ocorrência/rotina antigas
function _orgSetorIdDeRef(setorId, nome) {
  if (setorId && orgState.setores?.[setorId]) return setorId;
  if (!nome) return '';
  return _orgIdDeNomeLegado(nome) || 'n:' + nome;
}
// Rótulo a partir de um par (setorId, nome gravado) — OT e ocorrências guardam os dois
function _orgRotuloRef(setorId, nome, opts = {}) {
  const id = _orgSetorIdDeRef(setorId, nome);
  return (id && _orgRotuloSetor(id, opts)) || nome || '';
}

// Nomes antigos (permissões, unidades do CQ sem vínculo) → ids de setor
function _orgIdsDeNomes(nomes) {
  return [...new Set((Array.isArray(nomes) ? nomes : []).map(_orgIdDeNomeLegado).filter(Boolean))];
}
// Setores (todos, inclusive inativos) das unidades informadas
function _orgSetoresDasUnidades(unidadeIds) {
  const set = new Set(Array.isArray(unidadeIds) ? unidadeIds : []);
  if (!set.size) return [];
  return Object.values(orgState.setores || {}).filter(s => s && s.unidadeId && set.has(s.unidadeId)).map(s => s.id);
}

// Referência de setor para gravar em OT/ocorrência (histórico)
function _orgRefDoAtivo(a) {
  const s = _orgSetorDoAtivo(a);
  const amb = _orgAmbienteDoAtivo(a);
  return { setor: s?.nome || a?.setor || '', setorId: s && !s.virtual ? s.id : '', unidadeId: s?.unidadeId || '',
           ambienteId: amb?.id || '', ambiente: amb?.nome || '', setorIdsCompartilhados: _orgSetoresCompDoAtivo(a) };
}

// ── FILTROS EM PAR (Unidade + Setor) ─────────────────────────
// Unidades que têm ao menos um dos setores informados (+ "Sem unidade" quando houver)
function _orgUnidadesDosSetores(setorIds) {
  const ids = new Set();
  let semUnidade = false;
  (setorIds || []).forEach(id => { const u = _orgUnidadeIdDoSetor(id); if (u) ids.add(u); else semUnidade = true; });
  const lista = _orgUnidades({ todas: true }).filter(u => ids.has(u.id)).map(u => ({ value: u.id, label: u.sigla, sub: u.nome }));
  if (semUnidade && _orgMigrado()) lista.push({ value: '__sem__', label: 'Sem unidade', sub: '' });
  return lista;
}
// Setor passa no filtro de unidade? ('' = todas; '__sem__' = sem unidade)
function _orgSetorNaUnidade(setorId, unidadeFiltro) {
  if (!unidadeFiltro) return true;
  const u = _orgUnidadeIdDoSetor(setorId);
  return unidadeFiltro === '__sem__' ? !u : u === unidadeFiltro;
}
// Opções de setor (value = id) restritas a uma lista de ids e a um filtro de unidade
function _orgOpcoesSetores(setorIds, unidadeFiltro, opts = {}) {
  const set = new Set(setorIds || []);
  return [...set].filter(id => _orgSetorNaUnidade(id, unidadeFiltro))
    .map(id => ({ value: id, label: _orgRotuloSetor(id, { semUnidade: !!unidadeFiltro || opts.semUnidade }) || id, unidade: _orgSiglaUnidade(_orgUnidadeIdDoSetor(id)) }))
    .sort((a, b) => (a.unidade || '').localeCompare(b.unidade || '', 'pt-BR') || a.label.localeCompare(b.label, 'pt-BR'));
}
// Ativo passa nos filtros de unidade, setor e ambiente? ('', 'todas'/'todos' = sem filtro; ambiente '__sem__' = sem ambiente)
function _orgAtivoPassa(a, unidadeFiltro, setorFiltro, ambienteFiltro) {
  const id = _orgSetorIdDoAtivo(a);
  if (setorFiltro && setorFiltro !== 'todos' && !_orgSetorIdsDoAtivo(a).includes(setorFiltro)) return false;
  if (unidadeFiltro && unidadeFiltro !== 'todas' && !_orgSetorNaUnidade(id, unidadeFiltro)) return false;
  if (ambienteFiltro && ambienteFiltro !== 'todos') {
    const amb = _orgAmbienteDoAtivo(a)?.id || '';
    if (ambienteFiltro === '__sem__' ? amb : amb !== ambienteFiltro) return false;
  }
  return true;
}
// Chave de ordenação "unidade › setor" de um ativo
function _orgChaveOrdemAtivo(a) {
  const s = _orgSetorDoAtivo(a);
  return ((s ? _orgSiglaUnidade(s.unidadeId) + '\u0001' + s.nome : (a?.setor || '')) || '').toLowerCase();
}
// HTML de <option> para um <select> de unidade
function _orgOptionsUnidade(lista, atual, vazio = 'Todas as unidades') {
  return `<option value="">${_orgEsc(vazio)}</option>` +
    lista.map(o => `<option value="${_orgEsc(o.value)}"${o.value === atual ? ' selected' : ''}>${_orgEsc(o.label)}${o.sub ? ' — ' + _orgEsc(o.sub) : ''}</option>`).join('');
}

// ── REAÇÃO A MUDANÇAS ────────────────────────────────────────
function _orgRefreshTelas() {
  const call = n => { if (typeof window[n] === 'function') { try { window[n](); } catch (e) { console.error(`[org.js] ${n}:`, e); } } };
  ['atualizarSelects', 'renderCards', 'renderRotinasTable', 'renderTarefasTable', 'renderAtividadesTable',
   '_otRenderKanban', 'ocRender', 'renderAgendaCalendario', 'updateNotifBadge', 'renderHome', 'cqRender'].forEach(call);
}
function _orgAoMudar() {
  if (typeof currentSession !== 'undefined' && currentSession && typeof _initTopbarSectorFilter === 'function') _initTopbarSectorFilter();
  _orgRefreshTelas();
  orgRenderGerenciador();
  if (document.getElementById('cpanel-cq')?.classList.contains('active') && typeof cqRenderConfig === 'function') cqRenderConfig();
}

// ── TELA "UNIDADES E SETORES" (modal da aba Ativos ou painel de Configurações) ──
// Visão geral: um card por unidade. Clicar no card abre a janela da unidade
// (modal-org-unidade), que lista os setores como chips e permite cadastrar novos.
let _orgEdit = null;          // { tipo: 'unidade'|'setor'|'tornar', id }
let _orgNovaUnidade = false;  // card "Nova unidade" aberto como formulário
let _orgDetalheId = null;     // unidade aberta na janela de setores
let _orgBusca = '';           // filtro dos cards de unidade
let _orgBuscaSetor = '';      // filtro dos chips/cards da aba aberta na janela
let _orgAba = 'setores';      // aba da janela da unidade: 'setores' | 'ambientes'
// Filtro de status nas unidades e na janela da unidade: 'ativos' | 'inativos' | 'ambos'
let _orgFiltroStatus = 'ativos';
function _orgPassaStatus(ativo) {
  return _orgFiltroStatus === 'ambos' || (_orgFiltroStatus === 'ativos' ? ativo : !ativo);
}
function orgFiltroStatus(v) { _orgFiltroStatus = v; orgRenderGerenciador(); }
function _orgFiltroStatusHTML() {
  const op = [['ativos', 'Ativos'], ['inativos', 'Inativos'], ['ambos', 'Ambos']];
  return `<div class="org-abas org-abas-status" role="tablist" style="flex:none">${op.map(([k, r]) =>
    `<button type="button" role="tab" class="org-aba${_orgFiltroStatus === k ? ' on' : ''}" aria-selected="${_orgFiltroStatus === k}" onclick="orgFiltroStatus('${k}')"><span>${r}</span></button>`).join('')}</div>`;
}

// ── UNIDADES DO RH ───────────────────────────────────────────
// O nome das unidades vem do cadastro do RH (rh_unidades, no Dados LAMIC). Cada unidade daqui
// é ligada a uma do RH (unidade.rhId) por palavras-chave do nome; o nome passa a ser o do RH.
// Aqui só se altera a sigla (mnemônico) e se ativa/inativa. Unidade nova do RH entra sozinha.
let _orgRh = null;   // { id: { nome } } ou null enquanto não carregou
function _orgPalavras(n) {
  return String(n || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
    .replace(/^\s*\d+\s*[-–—.]\s*/, '').replace(/[^A-Z0-9]+/g, ' ')
    .split(' ').filter(p => p && !['UNIDADE', 'UND', 'UN', 'LAMIC', 'LABORATORIO', 'DE', 'DA', 'DO', 'DAS', 'DOS', 'E'].includes(p));
}
function _orgParRh(u, livres) {
  const pu = _orgPalavras(u.nome);
  if (!pu.length) return null;
  const k = pu.join(' ');
  let m = livres.filter(([, r]) => _orgPalavras(r.nome).join(' ') === k);
  if (m.length !== 1) m = livres.filter(([, r]) => { const pr = _orgPalavras(r.nome); return pr.length && (pr.every(p => pu.includes(p)) || pu.every(p => pr.includes(p))); });
  return m.length === 1 ? m[0] : null;
}
let _orgSincRh = false;
async function _orgSincronizarRh() {
  if (_orgSincRh || !_orgRh || !_orgReady || !_orgPodeEditar() || window._dbConnected === false) return;
  _orgSincRh = true;
  try {
    const up = {}, agora = new Date().toISOString();
    const unidades = Object.values(orgState.unidades || {}).filter(Boolean);
    const usados = new Set(unidades.map(u => u.rhId).filter(Boolean));
    const livres = () => Object.entries(_orgRh).filter(([id, r]) => r && r.nome && !usados.has(id));
    // 1) liga por palavras-chave quem ainda não tem par
    unidades.filter(u => !u.rhId || !_orgRh[u.rhId]).forEach(u => {
      const par = _orgParRh(u, livres());
      if (!par) return;
      usados.add(par[0]);
      up[`${ORG_KEY}/unidades/${u.id}/rhId`] = par[0];
      u.rhId = par[0];
    });
    // 2) nome sempre igual ao do RH
    unidades.filter(u => u.rhId && _orgRh[u.rhId]?.nome && u.nome !== _orgRh[u.rhId].nome).forEach(u => {
      up[`${ORG_KEY}/unidades/${u.id}/nome`] = _orgRh[u.rhId].nome;
      up[`${ORG_KEY}/unidades/${u.id}/atualizadoEm`] = agora;
    });
    // 3) unidade do RH sem par aqui: cria (sigla sugerida, ajustável)
    const siglas = new Set(unidades.map(u => _orgNorm(u.sigla)));
    livres().forEach(([rid, r]) => {
      let base = _orgSiglaSugerida(_orgParseUnidade(r.nome).curto) || 'UN', sigla = base, i = 2;
      while (siglas.has(_orgNorm(sigla))) sigla = (base.slice(0, 6) + i++);
      siglas.add(_orgNorm(sigla));
      const id = _orgUid('un_');
      up[`${ORG_KEY}/unidades/${id}`] = { id, sigla, nome: r.nome, rhId: rid, ativa: true, criadoEm: agora, atualizadoEm: agora, atualizadoPor: 'RH (Dados LAMIC)' };
    });
    if (Object.keys(up).length) { console.info('[org] unidades sincronizadas com o RH:', up); await window.dbUpdate(up); }
  } finally { _orgSincRh = false; }
}
function _orgOuvirRh() {
  if (typeof rootDb === 'undefined') return;
  rootDb.ref('rh_unidades').on('value', snap => { _orgRh = snap.val() || {}; _orgSincronizarRh(); },
    err => console.warn('[org] rh_unidades:', err && err.code));
}
setTimeout(_orgOuvirRh, 0);
setInterval(_orgSincronizarRh, 5000);

function _orgPodeEditar() {
  return typeof authHasPermission === 'function' && authHasPermission('ativos.editarSetor');
}

function openSetorModal() {
  _orgEdit = null;
  if (typeof openModal === 'function') openModal('modal-setor');
  orgRenderGerenciador();
}
function orgAbrirOrganizacao() { openSetorModal(); }

function orgFecharGerenciador() {
  if (_orgDetalheId) orgFecharUnidade();
  if (typeof closeModal === 'function') closeModal('modal-setor');
  _orgEdit = null;
  _orgNovaUnidade = false;
  orgRenderGerenciador();
}

// Renderiza no modal (quando aberto) ou no painel de Configurações — nunca nos dois (ids repetidos)
function _orgAlvoGerenciador() {
  const modal = document.getElementById('org-gerenciador');
  const cfg = document.getElementById('org-gerenciador-cfg');
  if (document.getElementById('modal-setor')?.classList.contains('open')) { if (cfg) cfg.innerHTML = ''; return modal; }
  if (modal) modal.innerHTML = '';
  return document.getElementById('cpanel-org')?.classList.contains('active') ? cfg : null;
}

function _orgContarAtivos(setorId) {
  return (typeof state !== 'undefined' ? state.ativos : []).filter(a => a && _orgSetorIdsDoAtivo(a).includes(setorId)).length;
}
function _orgContarAtivosNome(nome) {
  return (typeof state !== 'undefined' ? state.ativos : []).filter(a => a && !a.setorId && a.setor === nome).length;
}
// Grupos/usuários que ainda citam o nome antigo nas permissões
function _orgPermissoesComNome(nome) {
  if (typeof authState === 'undefined') return 0;
  return (authState.groups || []).filter(g => (g.setoresPermitidos || []).includes(nome)).length
    + (authState.users || []).filter(u => (u.setores || []).includes(nome)).length;
}

// Ativos e OTs abertas por setor — uma passada só por renderização
function _orgContagens() {
  const ativos = new Map(), ots = new Map(), ambientes = new Map(), ativosUn = new Map();
  const inc = (m, k) => { if (k) m.set(k, (m.get(k) || 0) + 1); };
  (typeof state !== 'undefined' ? state.ativos || [] : []).forEach(a => {
    if (!a) return;
    _orgSetorIdsDoAtivo(a).forEach(id => inc(ativos, id));   // conta em cada setor (responsável e compartilhados)
    inc(ativosUn, _orgUnidadeIdDoAtivo(a));                  // na unidade, uma vez só
    inc(ambientes, _orgAmbienteDoAtivo(a)?.id);
  });
  (typeof otState !== 'undefined' ? otState.ordens || [] : []).forEach(o => {
    if (o && !['concluida', 'cancelada'].includes(o.status)) inc(ots, _orgSetorIdDeRef(o.setorId, o.setor));
  });
  return { ativos, ots, ambientes, ativosUn };
}
function _orgResumoUnidade(u, cont) {
  const setores = _orgSetores(u.id, { todos: true });
  const soma = m => setores.reduce((t, s) => t + (m.get(s.id) || 0), 0);
  const ambientes = _orgAmbientes(u.id, { todos: true });
  return { setores, setoresAtivos: setores.filter(s => s.ativo !== false).length, ativos: cont.ativosUn.get(u.id) || 0, ots: soma(cont.ots),
           ambientes, ambientesAtivos: ambientes.filter(x => x.ativo !== false).length };
}

// Cor fixa por unidade (derivada da sigla) para identificar o card e a janela
const _ORG_CORES = ['#0891b2', '#2a9d8f', '#7c3aed', '#e76f51', '#2563eb', '#b7791f', '#db2777', '#059669'];
function _orgCor(u) {
  let h = 0;
  for (const c of String(u?.sigla || u?.id || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return _ORG_CORES[h % _ORG_CORES.length];
}
const _orgPl = (n, um, varios) => `${n === 1 ? um : varios}`;
// Texto para busca: minúsculo e sem acentos
function _orgBuscaNorm(s) { return _orgNorm(s).normalize('NFD').replace(/[̀-ͯ]/g, ''); }

// Troca o conteúdo mantendo o foco (e o texto digitado) do campo em uso
function _orgPintar(el, html) {
  const a = document.activeElement;
  const foco = a && a.id && el.contains(a)
    ? { id: a.id, val: a.value, ini: a.selectionStart, fim: a.selectionEnd, texto: a.tagName === 'INPUT' && /^(text|search)$/.test(a.type) }
    : null;
  el.innerHTML = html;
  if (!foco) return;
  const n = document.getElementById(foco.id);
  if (!n) return;
  if (foco.texto) n.value = foco.val;
  n.focus();
  if (foco.texto) { try { n.setSelectionRange(foco.ini, foco.fim); } catch (e) { /* campo sem seleção */ } }
}

const _ORG_ICO = {
  edit:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>',
  del:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  off:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>',
  on:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>',
  plus:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  seta:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
  busca:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  predio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-4h6v4"/><path d="M9 10h.01M15 10h.01M9 14h.01M15 14h.01"/></svg>',
  setor:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  ativo:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
  ot:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>',
  ambiente: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M6 21V4a1 1 0 011-1h10a1 1 0 011 1v17"/><circle cx="14.5" cy="12" r=".9" fill="currentColor"/></svg>',
  info:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  cq:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6"/><path d="M10 3v6l-5 9a2 2 0 001.8 3h10.4a2 2 0 001.8-3l-5-9V3"/><path d="M7.5 15h9"/></svg>'
};

// ── VISÃO GERAL: CARDS DAS UNIDADES ──────────────────────────
function orgRenderGerenciador() {
  _orgRenderDetalhe();
  const el = _orgAlvoGerenciador();
  if (!el) return;
  const pode = _orgPodeEditar();
  const unidades = _orgUnidades({ todas: true });
  const cont = _orgContagens();
  const resumos = unidades.filter(u => _orgPassaStatus(u.ativa !== false)).map(u => ({ u, r: _orgResumoUnidade(u, cont) }));
  const soma = k => resumos.reduce((t, x) => t + x.r[k], 0);
  const nAtivas = unidades.filter(u => u.ativa !== false).length;
  const nOts = soma('ots');
  const stat = (ico, n, rot, sub, cls = '') => `<div class="org-stat ${cls}">
      <span class="org-stat-ico">${ico}</span>
      <div><b>${n}</b><span>${rot}</span>${sub ? `<small>${sub}</small>` : ''}</div>
    </div>`;
  _orgPintar(el, `
    <div class="org-topo">
      <div class="org-stats">
        ${stat(_ORG_ICO.predio, nAtivas, _orgPl(nAtivas, 'unidade', 'unidades'), unidades.length > nAtivas ? `+${unidades.length - nAtivas} inativa(s)` : '')}
        ${stat(_ORG_ICO.setor, soma('setoresAtivos'), _orgPl(soma('setoresAtivos'), 'setor', 'setores'), '')}
        ${stat(_ORG_ICO.ativo, soma('ativos'), _orgPl(soma('ativos'), 'ativo vinculado', 'ativos vinculados'), '')}
        ${stat(_ORG_ICO.ot, nOts, _orgPl(nOts, 'OT aberta', 'OTs abertas'), '', nOts ? 'org-stat-alerta' : '')}
      </div>
      ${_orgFiltroStatusHTML()}
      ${unidades.length ? `<label class="org-busca">${_ORG_ICO.busca}
        <input type="search" id="org-busca" placeholder="Buscar unidade ou setor…" value="${_orgEsc(_orgBusca)}" oninput="orgFiltrarUnidades(this.value)">
      </label>` : ''}
    </div>
    <div class="org-grid">
      ${resumos.map(x => _orgCardHTML(x.u, x.r, cont)).join('')}
    </div>
    ${!resumos.length && unidades.length ? '<div class="org-vazio">Nenhuma unidade neste filtro.</div>' : ''}
    <div class="org-vazio org-sem-resultado" hidden>Nenhuma unidade ou setor encontrado.</div>
    ${!unidades.length && !pode ? '<div class="org-vazio">Nenhuma unidade cadastrada.</div>' : ''}
    ${_orgPendentesHTML(pode, unidades)}`);
  if (_orgBusca) orgFiltrarUnidades(_orgBusca);
}

function _orgCardHTML(u, r, cont) {
  const inativa = u.ativa === false;
  const ativos = r.setores.filter(s => s.ativo !== false)
    .sort((a, b) => (cont.ativos.get(b.id) || 0) - (cont.ativos.get(a.id) || 0));
  const prev = ativos.slice(0, 5);
  const busca = _orgBuscaNorm([u.sigla, u.nome, ...r.setores.map(s => s.nome), ...r.ambientes.map(x => x.nome)].join(' '));
  const abrir = `orgAbrirUnidade('${_orgJsAttr(u.id)}')`;
  const vinculoCQ = _orgUnidadesCQ(u.id).length > 0;
  return `<div class="org-card${inativa ? ' org-inativo' : ''}" style="--org-cor:${_orgCor(u)}" role="button" tabindex="0"
      data-busca="${_orgEsc(busca)}" onclick="${abrir}"
      onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();${abrir}}"
      title="Abrir setores e ambientes de ${_orgEsc(u.sigla)}">
    <div class="org-card-top">
      <span class="org-sigla-badge">${_orgEsc(u.sigla)}</span>
      <div class="org-card-tit">
        <b>${_orgEsc(u.nome)}</b>
        <span>${inativa ? '<em class="org-pill org-pill-off">Inativa</em>' : '<em class="org-pill org-pill-on">Ativa</em>'}${vinculoCQ ? '<em class="org-pill">CQ</em>' : ''}${_orgRh && !u.rhId ? '<em class="org-pill org-pill-off" title="Sem unidade correspondente no cadastro do RH">sem RH</em>' : ''}</span>
      </div>
      <span class="org-card-seta">${_ORG_ICO.seta}</span>
    </div>
    <div class="org-card-nums org-card-nums4">
      <div><b>${r.setoresAtivos}</b><span>${_orgPl(r.setoresAtivos, 'setor', 'setores')}</span></div>
      <div><b>${r.ambientesAtivos}</b><span>${_orgPl(r.ambientesAtivos, 'ambiente', 'ambientes')}</span></div>
      <div><b>${r.ativos}</b><span>${_orgPl(r.ativos, 'ativo', 'ativos')}</span></div>
      <div class="${r.ots ? 'org-num-alerta' : ''}"><b>${r.ots}</b><span>${_orgPl(r.ots, 'OT aberta', 'OTs abertas')}</span></div>
    </div>
    <div class="org-card-prev">
      ${prev.map(s => `<span>${_orgEsc(s.nome)}</span>`).join('') || '<i>Nenhum setor ainda — clique para cadastrar</i>'}
      ${ativos.length > prev.length ? `<span class="org-mais">+${ativos.length - prev.length}</span>` : ''}
    </div>
  </div>`;
}

function _orgCardNovoHTML() {
  if (!_orgNovaUnidade) {
    return `<button type="button" class="org-card org-card-novo" onclick="orgNovaUnidade(true)">
      <span class="org-novo-ico">${_ORG_ICO.plus}</span>
      <b>Nova unidade</b>
      <small>Cadastre a unidade e, em seguida, os setores dela</small>
    </button>`;
  }
  const esc = `if(event.key==='Escape')orgNovaUnidade(false)`;
  return `<div class="org-card org-card-form">
    <b class="org-form-tit">${_ORG_ICO.predio} Nova unidade</b>
    <input type="text" id="org-un-nova-sigla" class="field-input org-sigla" maxlength="8" placeholder="Sigla (ex.: NTO)"
      onkeydown="if(event.key==='Enter')document.getElementById('org-un-nova-nome').focus();${esc}">
    <input type="text" id="org-un-nova-nome" class="field-input" placeholder="Nome da unidade"
      onkeydown="if(event.key==='Enter')orgUnidadeSalvar(null);${esc}">
    <div class="org-form-acoes">
      <button class="btn btn-outline btn-sm" onclick="orgNovaUnidade(false)">Cancelar</button>
      <button class="btn btn-primary btn-sm" onclick="orgUnidadeSalvar(null)">${_ORG_ICO.plus} Cadastrar</button>
    </div>
  </div>`;
}

function orgNovaUnidade(abrir) {
  _orgNovaUnidade = !!abrir;
  orgRenderGerenciador();
  if (abrir) document.getElementById('org-un-nova-sigla')?.focus();
}

function orgFiltrarUnidades(txt) {
  _orgBusca = txt || '';
  const q = _orgBuscaNorm(_orgBusca);
  let n = 0;
  document.querySelectorAll('.org-grid .org-card[data-busca]').forEach(c => {
    const ok = !q || c.dataset.busca.includes(q);
    c.hidden = !ok;
    if (ok) n++;
  });
  const vazio = document.querySelector('.org-sem-resultado');
  if (vazio) vazio.hidden = !(q && !n);
}

// ── JANELA DA UNIDADE: SETORES EM CHIPS ──────────────────────
function orgAbrirUnidade(id) {
  _orgDetalheId = id;
  _orgBuscaSetor = '';
  _orgAba = 'setores';
  _orgNovoAmbSel = new Set();
  _orgPop = '';
  if (_orgEdit?.tipo !== 'tornar') _orgEdit = null;
  if (typeof openModal === 'function') openModal('modal-org-unidade');
  // Chips entram animados só na abertura (não a cada atualização do banco)
  const el = document.getElementById('org-detalhe');
  el?.classList.add('org-anim');
  setTimeout(() => el?.classList.remove('org-anim'), 500);
  _orgRenderDetalhe();
  if (_orgPodeEditar() && !_orgSetores(id, { todos: true }).length) setTimeout(() => document.getElementById('org-novo-item')?.focus(), 150);
}

// Abre a janela da unidade direto na aba Ambientes (atalho do cadastro de ativo)
function orgAbrirAmbientes(id) {
  orgAbrirUnidade(id);
  orgTrocarAba('ambientes');
  if (_orgPodeEditar()) setTimeout(() => document.getElementById('org-novo-item')?.focus(), 150);
}

function orgFecharUnidade() {
  if (typeof closeModal === 'function') closeModal('modal-org-unidade');
  _orgDetalheId = null;
  if (_orgEdit?.tipo !== 'tornar') _orgEdit = null;
  orgRenderGerenciador();
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || uiDialogoAberto() || !_orgDetalheId || !document.getElementById('modal-org-unidade')?.classList.contains('open')) return;
  e.preventDefault();
  if (_orgPop) { const k = _orgPop; orgPopFechar(); document.getElementById('org-pop-btn-' + k)?.focus(); }
  else if (_orgEdit) orgCancelar(); else orgFecharUnidade();
});

function _orgRenderDetalhe() {
  const el = document.getElementById('org-detalhe');
  if (!el || !_orgDetalheId || !document.getElementById('modal-org-unidade')?.classList.contains('open')) return;
  const u = _orgUnidade(_orgDetalheId);
  const tit = document.getElementById('org-det-titulo');
  const sub = document.getElementById('org-det-sub');
  if (!u) { el.innerHTML = '<div class="org-vazio">Carregando unidade…</div>'; return; }
  const pode = _orgPodeEditar();
  const inativa = u.ativa === false;
  const cont = _orgContagens();
  const r = _orgResumoUnidade(u, cont);
  const abaAmb = _orgAba === 'ambientes';
  // Ativos primeiro; dentro de cada grupo segue a ordem alfabética
  const porAtivo = lista => [...lista].sort((a, b) => (a.ativo === false) - (b.ativo === false));
  const setores = porAtivo(r.setores);
  const ambientes = porAtivo(r.ambientes);
  const testes = new Map(setores.map(s => [s.id, _orgTestesCQDoSetor(s.id).length]));
  const nTestes = [...testes.values()].reduce((t, n) => t + n, 0);
  // Ambientes ativos de cada setor (pela lista do ambiente)
  const ambsDoSetor = new Map();
  ambientes.filter(x => x.ativo !== false).forEach(x => _orgSetorIdsDoAmbiente(x).forEach(sid => {
    if (!ambsDoSetor.has(sid)) ambsDoSetor.set(sid, []);
    ambsDoSetor.get(sid).push(x);
  }));
  const uid = _orgJsAttr(u.id);
  const editando = _orgEdit?.tipo === 'unidade' && _orgEdit.id === u.id;
  const cqs = _orgUnidadesCQ(u.id);

  if (tit) tit.textContent = `${u.sigla} — ${u.nome}`;
  if (sub) sub.textContent = inativa ? 'Unidade inativa' : 'Setores e ambientes da unidade';
  el.style.setProperty('--org-cor', _orgCor(u));

  const caret = '<svg class="org-pop-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>';
  const busca = (k, n) => n > 7 ? `<label class="org-busca org-pop-busca">${_ORG_ICO.busca}
          <input type="search" id="org-pop-busca-${k}" placeholder="Buscar…" value="${_orgPop === k ? _orgEsc(_orgPopBusca) : ''}" oninput="orgPopFiltrar('${k}', this.value)" onkeydown="if(event.key==='Enter')event.preventDefault()">
        </label>` : '';
  // Botão + popover com a lista de vínculos (setor ↔ ambiente); marca na seleção da chave sem redesenhar
  const vincPop = (opcoes, cfg) => {
    const k = cfg.k || 'vinc';
    const sel = _orgPopSel(k);
    const n = sel?.size || 0;
    if (cfg.desab) {
      return `<div class="org-pop-wrap"><button type="button" class="org-pop-btn vazio" disabled title="${_orgEsc(cfg.desab)}">
        ${cfg.ico}<span class="org-pop-rot">${_orgEsc(cfg.desab)}</span></button></div>`;
    }
    const itens = opcoes.map(o => {
      const on = sel?.has(o.id);
      return `<button type="button" class="org-pop-item${on ? ' on' : ''}" role="menuitemcheckbox" aria-checked="${on ? 'true' : 'false'}"
        data-busca="${_orgEsc(_orgBuscaNorm(o.nome))}" onclick="orgToggleVinculo(this,'${_orgJsAttr(o.id)}','${k}')">
        <span class="org-toggle-chk">${_ORG_ICO.on}</span><span class="org-pop-nome">${_orgEsc(o.nome)}</span>${o.off ? '<small>inativo</small>' : ''}</button>`;
    }).join('');
    return `<div class="org-pop-wrap${cfg.cls ? ' ' + cfg.cls : ''}" id="org-pop-${k}" data-vazio="${_orgEsc(cfg.vazio)}">
      <button type="button" class="org-pop-btn${n ? '' : ' vazio'}" id="org-pop-btn-${k}" onclick="orgPopAlternar('${k}')" aria-haspopup="true" aria-expanded="${_orgPop === k ? 'true' : 'false'}" title="${_orgEsc(cfg.titulo)}">
        ${cfg.ico}<span class="org-pop-rot" id="org-pop-rot-${k}">${_orgEsc(_orgPopRotulo(cfg.vazio, k))}</span>
        <b class="org-aba-n" id="org-pop-n-${k}">${n}</b>${caret}
      </button>
      <div class="org-pop${_orgPop === k ? ' open' : ''}" role="menu">
        <div class="org-pop-head"><b>${_orgEsc(cfg.titulo)}</b><button type="button" class="org-pop-limpar" onclick="orgPopLimpar('${k}')">Limpar</button></div>
        ${busca(k, opcoes.length)}
        <div class="org-pop-lista">${itens || `<i class="org-amb-sem">${_orgEsc(cfg.semOpcoes)}</i>`}</div>
        <div class="org-pop-pe"><button type="button" class="btn btn-primary btn-sm" onclick="orgPopFechar()">Concluir</button></div>
      </div>
    </div>`;
  };
  // Botão + popover de unidade do setor (escolher outra move o setor); valor no input oculto org-setor-unidade
  const unPop = atual => {
    const cur = _orgEdit?.un || atual;
    const uc = _orgUnidade(cur);
    const lista = _orgUnidades({ todas: true });
    const badge = (x, id = '') => `<span class="org-sigla-badge sm"${id ? ` id="${id}"` : ''} style="--org-cor:${_orgCor(x)}">${_orgEsc(x?.sigla || '?')}</span>`;
    const itens = lista.map(x => {
      const on = x.id === cur;
      return `<button type="button" class="org-pop-item org-pop-un${on ? ' on' : ''}" role="menuitemradio" aria-checked="${on ? 'true' : 'false'}"
        data-busca="${_orgEsc(_orgBuscaNorm(x.sigla + ' ' + x.nome))}" onclick="orgUnidadeEscolher('${_orgJsAttr(x.id)}')">
        ${badge(x)}<span class="org-pop-nome">${_orgEsc(x.nome)}</span>
        ${x.id === atual ? '<small>atual</small>' : x.ativa === false ? '<small>inativa</small>' : ''}
        <span class="org-pop-radio">${_ORG_ICO.on}</span></button>`;
    }).join('');
    return `<div class="org-pop-wrap org-pop-wrap-un" id="org-pop-un">
      <input type="hidden" id="org-setor-unidade" value="${_orgEsc(cur)}">
      <button type="button" class="org-pop-btn org-pop-btn-un" id="org-pop-btn-un" onclick="orgPopAlternar('un')" aria-haspopup="true" aria-expanded="${_orgPop === 'un' ? 'true' : 'false'}" title="Unidade do setor — escolher outra move o setor">
        ${badge(uc)}<span class="org-pop-rot">${_orgEsc(uc?.nome || 'Unidade')}</span>
        ${cur !== atual ? '<em class="org-pill org-pill-off">mover</em>' : ''}${caret}
      </button>
      <div class="org-pop${_orgPop === 'un' ? ' open' : ''}" role="menu">
        <div class="org-pop-head"><b>Unidade do setor</b><small>outra unidade move o setor</small></div>
        ${busca('un', lista.length)}
        <div class="org-pop-lista">${itens}</div>
      </div>
    </div>`;
  };
  const nomeEdit = padrao => _orgEsc(_orgEdit?.nome ?? padrao);

  const chip = s => {
    const sid = _orgJsAttr(s.id);
    const ambsS = ambsDoSetor.get(s.id) || [];
    if (_orgEdit?.tipo === 'setor' && _orgEdit.id === s.id) {
      // Ambientes da unidade (inativos só se já ligados ao setor)
      const opAmb = ambientes.filter(x => x.ativo !== false || _orgEdit.sel?.has(x.id));
      return `<div class="org-schip editing">
        <input type="text" id="org-setor-nome" class="field-input" value="${nomeEdit(s.nome)}" placeholder="Nome do setor"
          oninput="_orgEdit&&(_orgEdit.nome=this.value)" onkeydown="if(event.key==='Enter')orgSetorSalvar('${sid}')">
        ${unPop(s.unidadeId)}
        ${opAmb.length ? vincPop(opAmb.map(x => ({ id: x.id, nome: x.nome, off: x.ativo === false })),
          { ico: _ORG_ICO.ambiente, titulo: 'Ambientes onde o setor atua', vazio: 'Vincular ambientes', semOpcoes: '',
            desab: (_orgEdit.un || s.unidadeId) !== s.unidadeId ? `Sai dos ambientes de ${u.sigla}` : '' }) : ''}
        <button class="btn btn-outline btn-sm" onclick="orgCancelar()">Cancelar</button>
        <button class="btn btn-primary btn-sm" onclick="orgSetorSalvar('${sid}')">Salvar</button>
      </div>`;
    }
    const off = s.ativo === false;
    const na = cont.ativos.get(s.id) || 0, no = cont.ots.get(s.id) || 0, nt = testes.get(s.id) || 0, nam = ambsS.length;
    return `<div class="org-schip${off ? ' org-inativo' : ''}" data-busca="${_orgEsc(_orgBuscaNorm(s.nome))}">
      <span class="org-schip-ini">${_orgEsc((s.nome || '?').trim().charAt(0).toUpperCase())}</span>
      <div class="org-schip-body">
        <div class="org-schip-nome" title="${_orgEsc(s.nome)}"><span>${_orgEsc(s.nome)}</span>${off ? ' <em class="org-pill org-pill-off">Inativo</em>' : ''}</div>
        <div class="org-schip-meta">
          <span class="${na ? '' : 'org-zero'}" title="${na} ${_orgPl(na, 'ativo', 'ativos')} no setor">${_ORG_ICO.ativo}${na}</span>
          <span class="${nam ? '' : 'org-zero'}" title="${nam ? 'Ambientes: ' + _orgEsc(ambsS.map(x => x.nome).join(', ')) : 'Nenhum ambiente vinculado'}">${_ORG_ICO.ambiente}${nam}</span>
          <span class="${no ? 'org-meta-alerta' : 'org-zero'}" title="${no} ${_orgPl(no, 'OT aberta', 'OTs abertas')}">${_ORG_ICO.ot}${no}</span>
          <span class="${nt ? '' : 'org-zero'}" title="${nt} ${_orgPl(nt, 'teste', 'testes')} de Controle de Qualidade">${_ORG_ICO.cq}${nt}</span>
        </div>
      </div>
      ${pode && !s.virtual ? `<span class="org-schip-acoes">
        <button onclick="orgEditar('setor','${sid}')" title="Renomear, mover ou vincular ambientes">${_ORG_ICO.edit}</button>
        <button onclick="orgSetorAtivar('${sid}', ${off})" title="${off ? 'Reativar' : 'Inativar'}">${off ? _ORG_ICO.on : _ORG_ICO.off}</button>
        <button class="org-perigo" onclick="orgSetorExcluir('${sid}')" title="Excluir">${_ORG_ICO.del}</button>
      </span>` : ''}
    </div>`;
  };

  const ambCard = x => {
    const aid = _orgJsAttr(x.id);
    const ligados = _orgSetorIdsDoAmbiente(x).map(id => orgState.setores?.[id]).filter(Boolean)
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
    if (_orgEdit?.tipo === 'ambiente' && _orgEdit.id === x.id) {
      const opSet = setores.filter(s => !s.virtual && (s.ativo !== false || _orgEdit.sel?.has(s.id)));
      return `<div class="org-amb editing">
        <div class="org-amb-edit-nome">
          <span class="org-amb-ico">${_ORG_ICO.ambiente}</span>
          <input type="text" id="org-amb-nome" class="field-input" value="${nomeEdit(x.nome)}" placeholder="Nome do ambiente (ex.: Sala de Coleta)"
            oninput="_orgEdit&&(_orgEdit.nome=this.value)" onkeydown="if(event.key==='Enter')orgAmbienteSalvar('${aid}')">
          ${vincPop(opSet.map(s => ({ id: s.id, nome: s.nome, off: s.ativo === false })),
            { ico: _ORG_ICO.setor, titulo: 'Setores que usam este ambiente', vazio: 'Vincular setores', semOpcoes: 'Cadastre setores nesta unidade para vincular.' })}
          <button class="btn btn-outline btn-sm" onclick="orgCancelar()">Cancelar</button>
          <button class="btn btn-primary btn-sm" onclick="orgAmbienteSalvar('${aid}')">Salvar</button>
        </div>
      </div>`;
    }
    const off = x.ativo === false;
    const na = cont.ambientes.get(x.id) || 0;
    const busca = _orgBuscaNorm([x.nome, ...ligados.map(s => s.nome)].join(' '));
    return `<div class="org-amb${off ? ' org-inativo' : ''}" data-busca="${_orgEsc(busca)}">
      <div class="org-amb-top">
        <span class="org-amb-ico">${_ORG_ICO.ambiente}</span>
        <div class="org-amb-tit">
          <b title="${_orgEsc(x.nome)}">${_orgEsc(x.nome)}</b>
          <small>${off ? '<em class="org-pill org-pill-off">Inativo</em> ' : ''}<span class="${na ? '' : 'org-zero'}">${_ORG_ICO.ativo}${na} ${_orgPl(na, 'ativo', 'ativos')}</span></small>
        </div>
        ${pode ? `<span class="org-schip-acoes">
          <button onclick="orgEditar('ambiente','${aid}')" title="Renomear ou vincular setores">${_ORG_ICO.edit}</button>
          <button onclick="orgAmbienteAtivar('${aid}', ${off})" title="${off ? 'Reativar' : 'Inativar'}">${off ? _ORG_ICO.on : _ORG_ICO.off}</button>
          <button class="org-perigo" onclick="orgAmbienteExcluir('${aid}')" title="Excluir">${_ORG_ICO.del}</button>
        </span>` : ''}
      </div>
      <div class="org-amb-setores">
        ${ligados.map(s => `<span class="org-tag${s.ativo === false ? ' org-inativo' : ''}">${_orgEsc(s.nome)}</span>`).join('')
          || `<i class="org-amb-sem">Nenhum setor vinculado${pode ? ` — <a href="#" onclick="event.preventDefault();orgEditar('ambiente','${aid}')">vincular setores</a>` : ''}</i>`}
      </div>
    </div>`;
  };

  const nSetAtivos = r.setoresAtivos, nAmbAtivos = r.ambientesAtivos;
  const setoresF = setores.filter(s => _orgPassaStatus(s.ativo !== false));
  const ambientesF = ambientes.filter(x => _orgPassaStatus(x.ativo !== false));
  const lista = abaAmb ? ambientesF : setoresF;
  const aba = (k, ico, rot, n, total) => `<button type="button" role="tab" class="org-aba${_orgAba === k ? ' on' : ''}" aria-selected="${_orgAba === k}"
      onclick="orgTrocarAba('${k}')" title="${n} ${rot.toLowerCase()} ${_orgPl(n, 'ativo', 'ativos')}${total > n ? ` · ${total - n} ${_orgPl(total - n, 'inativo', 'inativos')}` : ''}">
      ${ico}<span>${rot}</span><b class="org-aba-n">${n}</b></button>`;
  const addPh = abaAmb
    ? `Novo ambiente em ${_orgEsc(u.sigla)} (ex.: Sala de Coleta) — vários: separe por ;`
    : `Novo setor em ${_orgEsc(u.sigla)} — vários: separe por ; (ex.: Hematologia; Bioquímica)`;
  const addFn = abaAmb ? `orgAmbientesAdicionar('${uid}')` : `orgSetoresAdicionar('${uid}')`;
  const vazio = abaAmb
    ? `<div class="org-vazio org-vazio-grande">${_ORG_ICO.ambiente}<span>Nenhum ambiente nesta unidade${pode && !inativa ? ' — cadastre o primeiro acima' : ''}.</span><small>Ex.: Sala de Triagem, Sala de Coleta, Sala Analítica 01.</small></div>`
    : `<div class="org-vazio org-vazio-grande">${_ORG_ICO.setor}<span>Nenhum setor nesta unidade${pode && !inativa ? ' — cadastre o primeiro acima' : ''}.</span></div>`;

  _orgPintar(el, `
    <div class="org-det-head">
      ${editando ? `<div class="org-det-edit">
        <input type="text" id="org-un-sigla" class="field-input org-sigla" maxlength="8" value="${_orgEsc(u.sigla)}" placeholder="Sigla">
        <input type="text" id="org-un-nome" class="field-input" value="${_orgEsc(u.nome)}" placeholder="Nome" ${u.rhId ? 'readonly title="Nome vem do cadastro do RH (Dados LAMIC)" style="opacity:.65"' : ''} onkeydown="if(event.key==='Enter')orgUnidadeSalvar('${uid}')">
        <button class="btn btn-outline btn-sm" onclick="orgCancelar()">Cancelar</button>
        <button class="btn btn-primary btn-sm" onclick="orgUnidadeSalvar('${uid}')">Salvar</button>
      </div>` : `
        <span class="org-sigla-badge lg">${_orgEsc(u.sigla)}</span>
        <div class="org-det-tit">
          <b>${_orgEsc(u.nome)}</b>
          <span>${inativa ? '<em class="org-pill org-pill-off">Inativa</em>' : '<em class="org-pill org-pill-on">Ativa</em>'}
            ${cqs.length ? `<em class="org-pill" title="Área(s) do Controle de Qualidade vinculada(s)">CQ · ${cqs.map(c => _orgEsc(c.sigla || c.nome || '')).join(', ')}</em>` : ''}</span>
        </div>
        ${pode ? `<div class="org-det-acoes">
          <button class="btn btn-outline btn-sm" onclick="orgEditar('unidade','${uid}')" title="${u.rhId ? 'Alterar a sigla (o nome vem do RH)' : 'Editar'}">${_ORG_ICO.edit} ${u.rhId ? 'Sigla' : 'Editar'}</button>
          <button class="btn btn-outline btn-sm" onclick="orgUnidadeAtivar('${uid}', ${inativa})">${inativa ? _ORG_ICO.on + ' Reativar' : _ORG_ICO.off + ' Inativar'}</button>
          ${u.rhId ? '' : `<button class="btn btn-outline btn-sm org-btn-perigo" onclick="orgUnidadeExcluir('${uid}')" title="Excluir unidade (sem vínculo com o RH)" style="color:#dc2626;border-color:#fca5a5"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg> Excluir</button>`}
        </div>` : ''}`}
    </div>

    <div class="org-card-nums org-det-nums">
      <div><b>${nSetAtivos}</b><span>${_orgPl(nSetAtivos, 'setor ativo', 'setores ativos')}</span></div>
      <div><b>${nAmbAtivos}</b><span>${_orgPl(nAmbAtivos, 'ambiente', 'ambientes')}</span></div>
      <div><b>${r.ativos}</b><span>${_orgPl(r.ativos, 'ativo', 'ativos')}</span></div>
      <div class="${r.ots ? 'org-num-alerta' : ''}"><b>${r.ots}</b><span>${_orgPl(r.ots, 'OT aberta', 'OTs abertas')}</span></div>
      <div><b>${nTestes}</b><span>${_orgPl(nTestes, 'teste de CQ', 'testes de CQ')}</span></div>
    </div>

    <div class="org-det-bar">
      <div class="org-abas" role="tablist">
        ${aba('setores', _ORG_ICO.setor, 'Setores', nSetAtivos, setores.length)}
        ${aba('ambientes', _ORG_ICO.ambiente, 'Ambientes', nAmbAtivos, ambientes.length)}
      </div>
      ${_orgFiltroStatusHTML()}
      ${lista.length > 6 ? `<label class="org-busca org-busca-sm">${_ORG_ICO.busca}
        <input type="search" id="org-busca-setor" placeholder="Filtrar ${abaAmb ? 'ambientes' : 'setores'}…" value="${_orgEsc(_orgBuscaSetor)}" oninput="orgFiltrarSetores(this.value)">
      </label>` : ''}
    </div>

    ${pode && !inativa ? `<div class="org-det-add">
      <span class="org-det-add-ico">${_ORG_ICO.plus}</span>
      <input type="text" id="org-novo-item" placeholder="${addPh}" onkeydown="if(event.key==='Enter')${addFn}">
      ${abaAmb ? vincPop(setores.filter(s => !s.virtual && s.ativo !== false).map(s => ({ id: s.id, nome: s.nome })),
        { k: 'novo', cls: 'org-pop-wrap-add', ico: _ORG_ICO.setor, titulo: 'Setores que usam o ambiente', vazio: 'Setores',
          semOpcoes: 'Cadastre setores nesta unidade para vincular.' }) : ''}
      <button class="btn btn-primary btn-sm" onclick="${addFn}">Adicionar</button>
    </div>` : inativa ? `<div class="org-det-aviso">Unidade inativa — reative para cadastrar ${abaAmb ? 'ambientes' : 'setores'}.</div>` : ''}
    ${abaAmb ? `<div class="org-dica">${_ORG_ICO.info}<span><b>Ambiente</b> é o local físico (sala). Um ambiente pode atender vários setores — ex.: Bioquímica e Imuno-Hormônios na Sala Analítica 01 — e um setor pode ocupar vários ambientes.</span></div>` : ''}

    <div class="${abaAmb ? 'org-ambs' : 'org-schips'} org-lista">${(abaAmb ? ambientesF.map(ambCard) : setoresF.map(chip)).join('') || ((abaAmb ? ambientes : setores).length ? `<div class="org-vazio">Nenhum ${abaAmb ? 'ambiente' : 'setor'} neste filtro.</div>` : vazio)}</div>
    <div class="org-vazio org-schip-sem" hidden>Nenhum ${abaAmb ? 'ambiente' : 'setor'} encontrado.</div>`);
  if (_orgBuscaSetor) orgFiltrarSetores(_orgBuscaSetor);
}

function orgTrocarAba(aba) {
  if (_orgAba === aba) return;
  _orgAba = aba;
  _orgBuscaSetor = '';
  _orgPop = '';
  if (_orgEdit && _orgEdit.tipo !== 'tornar' && _orgEdit.tipo !== 'unidade') _orgEdit = null;
  const el = document.getElementById('org-detalhe');
  el?.classList.add('org-anim');
  setTimeout(() => el?.classList.remove('org-anim'), 500);
  _orgRenderDetalhe();
}

// ── POPOVERS DO FORMULÁRIO EM EDIÇÃO: vínculos (setor ↔ ambiente) e unidade do setor ──
let _orgPop = '';           // popover aberto: '' | 'vinc' | 'un' | 'novo'
let _orgPopBusca = '';      // filtro da lista do popover aberto
let _orgNovoAmbSel = new Set();  // setores marcados na barra "Novo ambiente"

// Seleção de cada popover de vínculo: 'novo' = barra de novo ambiente; 'vinc' = formulário em edição
function _orgPopSel(k) { return k === 'novo' ? _orgNovoAmbSel : _orgEdit?.sel; }

// Nomes marcados ("Bioquímica, Imuno-Hormonios") ou o texto de vazio
function _orgPopRotulo(vazio, k = 'vinc') {
  const nomes = [...(_orgPopSel(k) || [])].map(id => orgState.setores?.[id]?.nome || orgState.ambientes?.[id]?.nome).filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return nomes.length ? nomes.join(', ') : vazio;
}
function _orgPopAtualizarBotao(k = 'vinc') {
  const sel = _orgPopSel(k);
  const rot = document.getElementById('org-pop-rot-' + k);
  if (rot) rot.textContent = _orgPopRotulo(document.getElementById('org-pop-' + k)?.dataset.vazio || '', k);
  const n = document.getElementById('org-pop-n-' + k);
  if (n) n.textContent = sel?.size || 0;
  document.getElementById('org-pop-btn-' + k)?.classList.toggle('vazio', !sel?.size);
}

function orgToggleVinculo(btn, id, k = 'vinc') {
  const sel = _orgPopSel(k);
  if (!sel) return;
  const on = !sel.has(id);
  if (on) sel.add(id); else sel.delete(id);
  btn.classList.toggle('on', on);
  btn.setAttribute('aria-checked', on ? 'true' : 'false');
  _orgPopAtualizarBotao(k);
}

// Unidade escolhida no popover: redesenha (mostra "mover" e trava os ambientes da unidade atual)
function orgUnidadeEscolher(id) {
  if (!_orgEdit || _orgEdit.tipo !== 'setor') return;
  const nome = document.getElementById('org-setor-nome');
  if (nome) _orgEdit.nome = nome.value;
  _orgEdit.un = id;
  _orgPop = '';
  _orgPopBusca = '';
  _orgRenderDetalhe();
  document.getElementById('org-pop-btn-un')?.focus();
}

function orgPopAlternar(k) {
  const aberto = _orgPop;
  if (aberto) orgPopFechar();
  if (aberto !== k) orgPopAbrir(k);
}
function orgPopAbrir(k) {
  const wrap = document.getElementById('org-pop-' + k);
  const pop = wrap?.querySelector('.org-pop');
  if (!pop) return;
  _orgPop = k;
  // Abre para cima quando não cabe abaixo do botão na janela
  const corpo = document.getElementById('org-detalhe')?.getBoundingClientRect();
  const btn = wrap.getBoundingClientRect();
  const baixo = (corpo ? corpo.bottom : window.innerHeight) - btn.bottom;
  const cima = btn.top - (corpo ? corpo.top : 0);
  pop.classList.toggle('cima', baixo < 300 && cima > baixo);
  pop.classList.add('open');
  document.getElementById('org-pop-btn-' + k)?.setAttribute('aria-expanded', 'true');
  setTimeout(() => (document.getElementById('org-pop-busca-' + k) || pop.querySelector('.org-pop-item.on') || pop.querySelector('.org-pop-item'))?.focus(), 30);
}
function orgPopFechar() {
  const k = _orgPop;
  _orgPop = '';
  _orgPopBusca = '';
  if (!k) return;
  document.querySelector(`#org-pop-${k} .org-pop`)?.classList.remove('open');
  const b = document.getElementById('org-pop-busca-' + k);
  if (b) { b.value = ''; orgPopFiltrar(k, ''); }
  document.getElementById('org-pop-btn-' + k)?.setAttribute('aria-expanded', 'false');
}
function orgPopFiltrar(k, txt) {
  _orgPopBusca = txt || '';
  const q = _orgBuscaNorm(_orgPopBusca);
  document.querySelectorAll(`#org-pop-${k} .org-pop-item`).forEach(i => { i.hidden = !!q && !i.dataset.busca.includes(q); });
}
function orgPopLimpar(k = 'vinc') {
  const sel = _orgPopSel(k);
  if (!sel) return;
  sel.clear();
  document.querySelectorAll(`#org-pop-${k} .org-pop-item`).forEach(i => { i.classList.remove('on'); i.setAttribute('aria-checked', 'false'); });
  _orgPopAtualizarBotao(k);
}
// Clique fora fecha o popover
document.addEventListener('mousedown', e => {
  if (_orgPop && !e.target.closest('#org-pop-' + _orgPop)) orgPopFechar();
});

function orgFiltrarSetores(txt) {
  _orgBuscaSetor = txt || '';
  const q = _orgBuscaNorm(_orgBuscaSetor);
  let n = 0;
  document.querySelectorAll('#org-detalhe .org-lista > [data-busca]').forEach(c => {
    const ok = !q || c.dataset.busca.includes(q);
    c.hidden = !ok;
    if (ok) n++;
  });
  const vazio = document.querySelector('#org-detalhe .org-schip-sem');
  if (vazio) vazio.hidden = !(q && !n);
}

// Itens da lista antiga ainda sem destino: mover para uma unidade (vira setor) ou transformar em unidade
function _orgPendentesHTML(pode, unidades) {
  const pend = _orgNomesPendentes().sort((a, b) => a.localeCompare(b, 'pt-BR'));
  if (!pend.length) return '';
  const ativas = unidades.filter(u => u.ativa !== false);
  const optsUn = `<option value="">— Unidade —</option>` + ativas.map(u => `<option value="${_orgEsc(u.id)}">${_orgEsc(u.sigla)} — ${_orgEsc(u.nome)}</option>`).join('');
  const linha = (nome, i) => {
    const n = _orgContarAtivosNome(nome);
    if (_orgEdit?.tipo === 'tornar' && _orgEdit.id === nome) {
      const p = _orgParseUnidade(nome);
      const precisaSetor = n > 0 || _orgPermissoesComNome(nome) > 0;
      return `<div class="org-pend-item editing">
        <b>${_orgEsc(nome)}</b> → nova unidade:
        <div class="org-linha">
          <input type="text" id="org-tornar-sigla" class="field-input org-sigla" maxlength="8" value="${_orgEsc(_orgSiglaSugerida(p.curto))}" placeholder="Sigla">
          <input type="text" id="org-tornar-nome" class="field-input" value="${_orgEsc(p.nome)}" placeholder="Nome da unidade">
        </div>
        ${precisaSetor ? `<div class="org-linha"><span>Setor para os ${n} ativo(s) e permissões que estão nela:</span>
          <input type="text" id="org-tornar-setor" class="field-input" value="Geral" placeholder="Ex.: Geral"></div>` : ''}
        <div class="org-linha" style="justify-content:flex-end;">
          <button class="btn btn-outline" onclick="orgCancelar()">Cancelar</button>
          <button class="btn btn-primary" onclick="orgLegadoTornarUnidade(${i})">Criar unidade</button>
        </div>
      </div>`;
    }
    return `<div class="org-pend-item">
      ${pode ? `<input type="checkbox" class="org-pend-chk" value="${i}" title="Selecionar">` : ''}
      <span class="org-pend-nome"><b>${_orgEsc(nome)}</b> <small>${n} ativo${n === 1 ? '' : 's'}</small></span>
      ${pode ? `<span class="org-pend-acoes">
        ${ativas.length ? `<select id="org-pend-un-${i}" class="field-input">${optsUn}</select>
        <button class="btn btn-outline btn-sm" onclick="orgLegadoMover([${i}], document.getElementById('org-pend-un-${i}').value)">Mover</button>` : ''}
        <button class="btn btn-outline btn-sm" onclick="orgEditar('tornar', ${i})">Tornar unidade</button>
        ${n === 0 ? `<button class="btn btn-outline btn-sm" onclick="orgLegadoExcluir(${i})" title="Remover da lista">${_ORG_ICO.del}</button>` : ''}
      </span>` : ''}
    </div>`;
  };
  _orgPendLista = pend;
  return `<div class="org-unidade org-sem-unidade">
    <div class="org-unidade-head"><div class="org-unidade-tit"><b>Lista antiga — sem unidade (${pend.length})</b>
      <span>itens do cadastro antigo de setores. Mova cada setor para a sua unidade ou transforme em unidade os itens que são unidades (ex.: “01 - Unidade NTO”).</span></div></div>
    ${pode && ativas.length ? `<div class="org-linha org-pend-lote">
      <span>Selecionados →</span><select id="org-pend-lote" class="field-input" style="max-width:280px;">${optsUn}</select>
      <button class="btn btn-outline btn-sm" onclick="orgLegadoMoverSelecionados()">Mover selecionados</button>
    </div>` : ''}
    ${pend.map(linha).join('')}
  </div>`;
}
let _orgPendLista = [];

function orgEditar(tipo, id) {
  _orgEdit = { tipo, id: tipo === 'tornar' ? _orgPendLista[id] : id };
  _orgPop = '';
  _orgPopBusca = '';
  // Vínculos setor ↔ ambiente marcados no formulário (gravados só ao salvar)
  if (tipo === 'setor') _orgEdit.sel = new Set(_orgAmbientesDoSetor(id, { todos: true }).map(x => x.id));
  if (tipo === 'ambiente') _orgEdit.sel = new Set(_orgSetorIdsDoAmbiente(_orgAmbiente(id)));
  orgRenderGerenciador();
  document.getElementById({ setor: 'org-setor-nome', unidade: 'org-un-nome', tornar: 'org-tornar-sigla', ambiente: 'org-amb-nome' }[tipo])?.focus();
}
function orgCancelar() { _orgEdit = null; _orgPop = ''; _orgPopBusca = ''; orgRenderGerenciador(); }

// "01 - Unidade NTO" → { nome: 'Unidade NTO', curto: 'NTO' }
function _orgParseUnidade(txt) {
  const m = String(txt || '').match(/^\s*[\w.]+\s*[-–—]\s*(.+)$/);
  const nome = (m ? m[1] : String(txt || '')).trim();
  return { nome, curto: nome.replace(/^unidade\s+/i, '').trim() };
}
function _orgSiglaSugerida(curto) {
  return String(curto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8);
}

function _orgPodeGravar() {
  if (!_orgPodeEditar()) { showToast('Sem permissão para editar unidades e setores.', 'error'); return false; }
  if (!_orgReady || window._dbConnected === false) { showToast('Sem conexão com o banco. Tente novamente.', 'error'); return false; }
  return true;
}
// ── CONFIRMAÇÃO: janela própria do sistema (dialogo.js) ──
// tipo: 'perigo' (excluir) | 'aviso' (inativar) | 'info' (mover).
const _orgConfirmar = opts => uiConfirmar(opts);

function _orgCarimbo() {
  return { atualizadoEm: new Date().toISOString(), atualizadoPor: (typeof currentSession !== 'undefined' && currentSession?.nomeCompleto) || '' };
}

// ── UNIDADES ─────────────────────────────────────────────────
async function orgUnidadeSalvar(id) {
  if (!_orgPodeGravar()) return;
  const sigla = (document.getElementById(id ? 'org-un-sigla' : 'org-un-nova-sigla')?.value || '').trim().toUpperCase();
  let nome  = (document.getElementById(id ? 'org-un-nome' : 'org-un-nova-nome')?.value || '').trim();
  if (!sigla || !nome) { showToast('Informe a sigla e o nome da unidade.', 'error'); return; }
  if (_orgUnidades({ todas: true }).some(u => u.id !== id && _orgNorm(u.sigla) === _orgNorm(sigla))) { showToast('Já existe uma unidade com essa sigla.', 'error'); return; }
  const atual = id ? _orgUnidade(id) : null;
  if (!atual) { showToast('Unidades vêm do cadastro do RH (Dados LAMIC).', 'error'); return; }
  if (atual.rhId) nome = atual.nome;
  const novoId = id || _orgUid('un_');
  const rec = { ...(atual || { ativa: true, criadoEm: new Date().toISOString() }), id: novoId, sigla, nome, ..._orgCarimbo() };
  const ok = await window.dbUpdate({ [`${ORG_KEY}/unidades/${novoId}`]: rec });
  if (!ok) { showToast('Falha ao salvar a unidade.', 'error'); return; }
  _orgEdit = null;
  showToast(id ? 'Unidade salva!' : 'Unidade cadastrada. Adicione os setores dela.', 'success');
  if (id) { orgRenderGerenciador(); return; }
  _orgNovaUnidade = false;
  orgAbrirUnidade(novoId);
  setTimeout(() => document.getElementById('org-novo-item')?.focus(), 150);
}

async function orgUnidadeAtivar(id, ativar) {
  if (!_orgPodeGravar()) return;
  const u = _orgUnidade(id);
  if (!u) return;
  if (!ativar && !(await _orgConfirmar({
    tipo: 'aviso', titulo: 'Inativar unidade?', confirmar: 'Inativar',
    mensagem: `A unidade <b>${_orgEsc(u.sigla)} — ${_orgEsc(u.nome)}</b> deixa de aparecer nas seleções.`,
    detalhe: 'Ativos e históricos são mantidos. Você pode reativá-la quando quiser.'
  }))) return;
  await window.dbUpdate({ [`${ORG_KEY}/unidades/${id}/ativa`]: !!ativar, [`${ORG_KEY}/unidades/${id}/atualizadoEm`]: new Date().toISOString() });
}

// Áreas do CQ vinculadas a esta unidade do sistema
function _orgUnidadesCQ(id) {
  return typeof cqState !== 'undefined' ? Object.values(cqState.config?.unidades || {}).filter(c => c && c.orgUnidadeId === id) : [];
}

async function orgUnidadeExcluir(id) {
  if (!_orgPodeGravar()) return;
  const u = _orgUnidade(id);
  if (!u) return;
  if (u.rhId) { showToast('Unidade do RH não é excluída aqui: inative-a.', 'error'); return; }
  // Unidade sem RH: exclui junto setores e ambientes dela, desde que nada em uso dependa deles.
  const setores = Object.values(orgState.setores || {}).filter(s => s && s.unidadeId === id);
  const ambientes = _orgAmbientes(id, { todos: true });
  const ids = new Set(setores.map(s => s.id));
  const grupos = typeof authState !== 'undefined' ? (authState.groups || []) : [];
  const bloqueio = [];
  const nAtivos = setores.reduce((t, s) => t + _orgContarAtivos(s.id), 0)
    + ambientes.reduce((t, x) => t + _orgAtivosNoAmbiente(x.id).length, 0);
  if (nAtivos) bloqueio.push(`${nAtivos} ativo(s)`);
  const nTestes = setores.reduce((t, s) => t + _orgTestesCQDoSetor(s.id).length, 0);
  if (nTestes) bloqueio.push(`${nTestes} teste(s) de CQ`);
  if (_orgUnidadesCQ(id).length) bloqueio.push('área do Controle de Qualidade');
  const nOT = (typeof otState !== 'undefined' ? otState.ordens || [] : []).filter(o => o && ids.has(o.setorId)).length;
  if (nOT) bloqueio.push(`${nOT} OT(s)`);
  const nGrupos = grupos.filter(g => (g.unidadeIdsPermitidas || []).includes(id) || (g.setorIdsPermitidos || []).some(x => ids.has(x))).length;
  if (nGrupos) bloqueio.push(`${nGrupos} grupo(s) de usuários`);
  if (bloqueio.length) { showToast(`Não é possível excluir: a unidade é usada por ${bloqueio.join(', ')}. Inative-a.`, 'error'); return; }
  const partes = [setores.length && `${setores.length} setor(es)`, ambientes.length && `${ambientes.length} ambiente(s)`].filter(Boolean);
  if (!(await _orgConfirmar({
    tipo: 'perigo', titulo: 'Excluir unidade?', confirmar: 'Excluir unidade',
    mensagem: `A unidade <b>${_orgEsc(u.sigla)} — ${_orgEsc(u.nome)}</b> (sem vínculo com o RH) será excluída${partes.length ? `, junto com ${partes.join(' e ')} sem uso` : ''}.`,
    detalhe: 'Nomes da lista antiga ligados a esses setores voltam a aparecer como pendentes. Esta ação não pode ser desfeita.'
  }))) return;
  const up = { [`${ORG_KEY}/unidades/${id}`]: null };
  setores.forEach(s => { up[`${ORG_KEY}/setores/${s.id}`] = null; });
  ambientes.forEach(x => { up[`${ORG_KEY}/ambientes/${x.id}`] = null; });
  Object.entries(orgState.legado || {}).forEach(([k, x]) => { if (x && (ids.has(x.setorId) || x.unidadeId === id)) up[`${ORG_KEY}/legado/${k}`] = null; });
  if (!(await window.dbUpdate(up))) { showToast('Falha ao excluir a unidade.', 'error'); return; }
  if (_orgDetalheId === id) orgFecharUnidade();
  showToast('Unidade excluída.', 'success');
}

// ── SETORES ──────────────────────────────────────────────────
// Testes de CQ que usam o setor (pelo setorId gravado ou pelo equipamento)
function _orgTestesCQDoSetor(setorId) {
  if (typeof cqState === 'undefined') return [];
  return Object.values(cqState.config?.testes || {}).filter(t => {
    if (t.setorId) return t.setorId === setorId;
    const a = t.ativoId && typeof _ativoById === 'function' ? _ativoById(t.ativoId) : null;
    return a ? _orgSetorIdDoAtivo(a) === setorId : false;
  });
}

// Adiciona um ou vários setores (separados por ;) à unidade
async function orgSetoresAdicionar(unidadeId) {
  if (!_orgPodeGravar()) return;
  const inp = document.getElementById('org-novo-item');
  const nomes = [...new Set(String(inp?.value || '').split(/[;\n]/).map(s => s.trim()).filter(Boolean))];
  if (!nomes.length) { showToast('Informe o nome do setor.', 'error'); return; }
  const ja = nomes.filter(n => Object.values(orgState.setores).some(s => s && s.unidadeId === unidadeId && _orgNorm(s.nome) === _orgNorm(n)));
  const novos = nomes.filter(n => !ja.includes(n));
  if (!novos.length) { showToast(`Já existe(m) em ${_orgSiglaUnidade(unidadeId)}: ${ja.join(', ')}.`, 'error'); return; }
  const up = {};
  novos.forEach(nome => {
    const id = _orgUid('st_');
    up[`${ORG_KEY}/setores/${id}`] = { id, nome, unidadeId, ativo: true, criadoEm: new Date().toISOString(), ..._orgCarimbo() };
  });
  if (!(await window.dbUpdate(up))) { showToast('Falha ao salvar os setores.', 'error'); return; }
  showToast(`${novos.length} setor(es) adicionado(s)${ja.length ? ` · já existiam: ${ja.join(', ')}` : ''}.`, 'success');
  const campo = document.getElementById('org-novo-item');
  if (campo) { campo.value = ''; campo.focus(); }
}

async function orgSetorSalvar(id) {
  if (!_orgPodeGravar()) return;
  const atual = orgState.setores[id];
  if (!atual) return;
  const nome = (document.getElementById('org-setor-nome')?.value || '').trim();
  const un = document.getElementById('org-setor-unidade')?.value || atual.unidadeId;
  if (!nome) { showToast('Informe o nome do setor.', 'error'); return; }
  if (!_orgUnidade(un)) { showToast('Escolha a unidade do setor.', 'error'); return; }
  if (Object.values(orgState.setores).some(s => s && s.id !== id && s.unidadeId === un && _orgNorm(s.nome) === _orgNorm(nome))) { showToast(`Já existe o setor "${nome}" em ${_orgSiglaUnidade(un)}.`, 'error'); return; }
  const up = {};
  const ambsDaUnidade = _orgAmbientes(atual.unidadeId, { todos: true });
  if (atual.unidadeId !== un) {
    // Ambientes são da unidade: o setor só muda de unidade sem ativos alocados em salas da unidade atual
    const emAmbiente = _orgAtivosDoSetorEmAmbiente(id);
    if (emAmbiente.length) { showToast(`Não é possível mover: ${emAmbiente.length} ativo(s) deste setor estão em ambientes de ${_orgSiglaUnidade(atual.unidadeId)}. Retire o ambiente deles antes.`, 'error'); return; }
    ambsDaUnidade.filter(x => _orgSetorIdsDoAmbiente(x).includes(id))
      .forEach(x => _orgUpSetoresDoAmbiente(up, x, _orgSetorIdsDoAmbiente(x).filter(s => s !== id)));
    // Mover de unidade muda a unidade de todos os ativos do setor
    const testes = _orgTestesCQDoSetor(id).filter(t => _orgUnidadeCQDoTeste(t) && _orgUnidadeCQDoTeste(t) !== un);
    if (testes.length) { showToast(`Não é possível mover: ${testes.length} teste(s) de CQ de outra unidade usam este setor.`, 'error'); return; }
    const nAt = _orgContarAtivos(id);
    if (!(await _orgConfirmar({
      tipo: 'info', icone: 'mover', titulo: 'Mover setor?', confirmar: 'Mover setor',
      mensagem: `O setor <b>${_orgEsc(atual.nome)}</b> sai de <b>${_orgEsc(_orgSiglaUnidade(atual.unidadeId))}</b> e passa para <b>${_orgEsc(_orgSiglaUnidade(un))}</b>.`,
      detalhe: nAt ? `${nAt} ativo(s) deste setor passam a pertencer a essa unidade.` : 'O setor não tem ativos vinculados.'
    }))) return;
  } else if (_orgEdit?.tipo === 'setor' && _orgEdit.id === id && _orgEdit.sel) {
    // Vínculos com os ambientes marcados no formulário
    const bloq = [];
    ambsDaUnidade.forEach(x => {
      const ids = _orgSetorIdsDoAmbiente(x);
      const tem = ids.includes(id), quer = _orgEdit.sel.has(x.id);
      if (tem === quer) return;
      if (tem) {
        const n = _orgAtivosNoAmbiente(x.id, id).length;
        if (n) { bloq.push(`${x.nome} (${n} ativo${n === 1 ? '' : 's'})`); return; }
      }
      _orgUpSetoresDoAmbiente(up, x, quer ? [...ids, id] : ids.filter(s => s !== id));
    });
    if (bloq.length) { showToast(`Não é possível desvincular: há ativos de ${atual.nome} em ${bloq.join(', ')}. Mude o ambiente deles antes.`, 'error'); return; }
  }
  up[`${ORG_KEY}/setores/${id}`] = { ...atual, nome, unidadeId: un, ..._orgCarimbo() };
  const ok = await window.dbUpdate(up);
  if (!ok) { showToast('Falha ao salvar o setor.', 'error'); return; }
  // Renomeado: atualiza o nome de exibição gravado nos ativos
  if (atual.nome !== nome) {
    let mudou = false;
    state.ativos.forEach(a => { if (a && a.setorId === id && a.setor !== nome) { a.setor = nome; mudou = true; } });
    if (mudou) saveState();
  }
  _orgEdit = null;
  orgRenderGerenciador();
  showToast('Setor salvo!', 'success');
}
// Unidade do sistema da unidade de CQ do teste
function _orgUnidadeCQDoTeste(t) {
  return typeof cqState !== 'undefined' ? (cqState.config?.unidades?.[t.unidadeId]?.orgUnidadeId || '') : '';
}

async function orgSetorAtivar(id, ativar) {
  if (!_orgPodeGravar()) return;
  const s = orgState.setores[id];
  if (!s) return;
  if (!ativar && !(await _orgConfirmar({
    tipo: 'aviso', titulo: 'Inativar setor?', confirmar: 'Inativar',
    mensagem: `O setor <b>${_orgEsc(s.nome)}</b> (${_orgEsc(_orgSiglaUnidade(s.unidadeId))}) deixa de ser oferecido para novos cadastros.`,
    detalhe: 'Ativos e históricos são mantidos. Você pode reativá-lo quando quiser.'
  }))) return;
  await window.dbUpdate({ [`${ORG_KEY}/setores/${id}/ativo`]: !!ativar, [`${ORG_KEY}/setores/${id}/atualizadoEm`]: new Date().toISOString() });
}

async function orgSetorExcluir(id) {
  if (!_orgPodeGravar()) return;
  const s = orgState.setores[id];
  if (!s) return;
  const bloqueio = [];
  const nAtivos = _orgContarAtivos(id);
  if (nAtivos) bloqueio.push(`${nAtivos} ativo(s)`);
  const nGrupos = typeof authState !== 'undefined' ? (authState.groups || []).filter(g => (g.setorIdsPermitidos || []).includes(id)).length : 0;
  if (nGrupos) bloqueio.push(`${nGrupos} grupo(s) de usuários`);
  const nTestes = _orgTestesCQDoSetor(id).length;
  if (nTestes) bloqueio.push(`${nTestes} teste(s) de CQ`);
  const nOT = (typeof otState !== 'undefined' ? otState.ordens : []).filter(o => o && o.setorId === id).length;
  if (nOT) bloqueio.push(`${nOT} OT(s)`);
  if (Object.values(orgState.legado).some(x => x && x.setorId === id)) bloqueio.push('vínculo com item da lista antiga');
  if (bloqueio.length) { showToast(`Não é possível excluir: o setor é usado por ${bloqueio.join(', ')}. Inative-o.`, 'error'); return; }
  if (!(await _orgConfirmar({
    tipo: 'perigo', titulo: 'Excluir setor?', confirmar: 'Excluir setor',
    mensagem: `O setor <b>${_orgEsc(s.nome)}</b> (${_orgEsc(_orgSiglaUnidade(s.unidadeId))}) será excluído.`,
    detalhe: 'Esta ação não pode ser desfeita.'
  }))) return;
  const up = { [`${ORG_KEY}/setores/${id}`]: null };
  _orgAmbientesDoSetor(id, { todos: true }).forEach(x => _orgUpSetoresDoAmbiente(up, x, _orgSetorIdsDoAmbiente(x).filter(s => s !== id)));
  await window.dbUpdate(up);
}

// ── AMBIENTES ────────────────────────────────────────────────
// Ativos alocados no ambiente (opcional: só os do setor informado)
function _orgAtivosNoAmbiente(ambienteId, setorId) {
  return (typeof state !== 'undefined' ? state.ativos || [] : [])
    .filter(a => a && a.ambienteId === ambienteId && (!setorId || _orgSetorIdsDoAtivo(a).includes(setorId)));
}
function _orgAtivosDoSetorEmAmbiente(setorId) {
  return (typeof state !== 'undefined' ? state.ativos || [] : []).filter(a => a && a.ambienteId && _orgSetorIdsDoAtivo(a).includes(setorId));
}
// Acrescenta ao update a nova lista de setores do ambiente
function _orgUpSetoresDoAmbiente(up, amb, ids) {
  up[`${ORG_KEY}/ambientes/${amb.id}/setorIds`] = [...new Set(ids)];
  up[`${ORG_KEY}/ambientes/${amb.id}/atualizadoEm`] = new Date().toISOString();
}

// Adiciona um ou vários ambientes (separados por ;) à unidade, já ligados aos setores marcados na barra
async function orgAmbientesAdicionar(unidadeId) {
  if (!_orgPodeGravar()) return;
  const inp = document.getElementById('org-novo-item');
  const nomes = [...new Set(String(inp?.value || '').split(/[;\n]/).map(s => s.trim()).filter(Boolean))];
  if (!nomes.length) { showToast('Informe o nome do ambiente.', 'error'); inp?.focus(); return; }
  const setorIds = [..._orgNovoAmbSel].filter(id => orgState.setores?.[id]?.unidadeId === unidadeId);
  const temSetores = _orgSetores(unidadeId).some(s => !s.virtual && s.ativo !== false);
  if (temSetores && !setorIds.length) { showToast('Selecione os setores que usam o ambiente.', 'error'); orgPopAbrir('novo'); return; }
  const existentes = _orgAmbientes(unidadeId, { todos: true });
  const ja = nomes.filter(n => existentes.some(x => _orgNorm(x.nome) === _orgNorm(n)));
  const novos = nomes.filter(n => !ja.includes(n));
  if (!novos.length) { showToast(`Já existe(m) em ${_orgSiglaUnidade(unidadeId)}: ${ja.join(', ')}.`, 'error'); return; }
  const up = {}, ids = [];
  novos.forEach(nome => {
    const id = _orgUid('amb_');
    ids.push(id);
    up[`${ORG_KEY}/ambientes/${id}`] = { id, nome, unidadeId, setorIds, ativo: true, criadoEm: new Date().toISOString(), ..._orgCarimbo() };
  });
  if (!(await window.dbUpdate(up))) { showToast('Falha ao salvar os ambientes.', 'error'); return; }
  // Reseta o campo: nome e setores marcados
  const nomesSet = setorIds.map(id => orgState.setores?.[id]?.nome).filter(Boolean).join(', ');
  _orgNovoAmbSel = new Set();
  orgPopFechar();
  const campo = document.getElementById('org-novo-item');
  if (campo) campo.value = '';
  _orgRenderDetalhe();
  showToast(`${novos.length === 1 ? `Ambiente "${novos[0]}" adicionado` : `${novos.length} ambientes adicionados`}${nomesSet ? ` · ${nomesSet}` : ''}${ja.length ? ` · já existiam: ${ja.join(', ')}` : ''}.`, 'success');
  document.getElementById('org-novo-item')?.focus();
}

async function orgAmbienteSalvar(id) {
  if (!_orgPodeGravar()) return;
  const atual = orgState.ambientes?.[id];
  if (!atual) return;
  const nome = (document.getElementById('org-amb-nome')?.value || '').trim();
  if (!nome) { showToast('Informe o nome do ambiente.', 'error'); return; }
  if (_orgAmbientes(atual.unidadeId, { todos: true }).some(x => x.id !== id && _orgNorm(x.nome) === _orgNorm(nome))) { showToast(`Já existe o ambiente "${nome}" em ${_orgSiglaUnidade(atual.unidadeId)}.`, 'error'); return; }
  const antes = _orgSetorIdsDoAmbiente(atual);
  const sel = _orgEdit?.tipo === 'ambiente' && _orgEdit.id === id && _orgEdit.sel ? _orgEdit.sel : new Set(antes);
  // Só setores da própria unidade
  const ids = [...sel].filter(sid => orgState.setores?.[sid]?.unidadeId === atual.unidadeId);
  // Desvincular um setor com ativos neste ambiente deixaria o ativo numa sala fora do setor
  const bloq = antes.filter(sid => !ids.includes(sid))
    .map(sid => ({ s: orgState.setores?.[sid], n: _orgAtivosNoAmbiente(id, sid).length }))
    .filter(x => x.n);
  if (bloq.length) { showToast(`Não é possível desvincular: ${bloq.map(x => `${x.n} ativo(s) de ${x.s?.nome || 'setor'}`).join(', ')} estão neste ambiente. Mude o ambiente deles antes.`, 'error'); return; }
  const ok = await window.dbUpdate({ [`${ORG_KEY}/ambientes/${id}`]: { ...atual, nome, setorIds: ids, ..._orgCarimbo() } });
  if (!ok) { showToast('Falha ao salvar o ambiente.', 'error'); return; }
  _orgEdit = null;
  orgRenderGerenciador();
  showToast(ids.length ? 'Ambiente salvo!' : 'Ambiente salvo — sem setores vinculados ele não aparece no cadastro de ativos.', ids.length ? 'success' : 'info');
}

async function orgAmbienteAtivar(id, ativar) {
  if (!_orgPodeGravar()) return;
  const x = orgState.ambientes?.[id];
  if (!x) return;
  const n = _orgAtivosNoAmbiente(id).length;
  if (!ativar && !(await _orgConfirmar({
    tipo: 'aviso', titulo: 'Inativar ambiente?', confirmar: 'Inativar',
    mensagem: `O ambiente <b>${_orgEsc(x.nome)}</b> (${_orgEsc(_orgSiglaUnidade(x.unidadeId))}) deixa de ser oferecido no cadastro de ativos.`,
    detalhe: n ? `${n} ativo(s) continuam registrados nele. Você pode reativá-lo quando quiser.` : 'Você pode reativá-lo quando quiser.'
  }))) return;
  await window.dbUpdate({ [`${ORG_KEY}/ambientes/${id}/ativo`]: !!ativar, [`${ORG_KEY}/ambientes/${id}/atualizadoEm`]: new Date().toISOString() });
}

async function orgAmbienteExcluir(id) {
  if (!_orgPodeGravar()) return;
  const x = orgState.ambientes?.[id];
  if (!x) return;
  const n = _orgAtivosNoAmbiente(id).length;
  if (n) { showToast(`Não é possível excluir: ${n} ativo(s) estão neste ambiente. Mude o ambiente deles ou inative-o.`, 'error'); return; }
  const nOT = (typeof otState !== 'undefined' ? otState.ordens || [] : []).filter(o => o && o.ambienteId === id).length;
  if (nOT) { showToast(`Não é possível excluir: ${nOT} OT(s) registram este ambiente. Inative-o.`, 'error'); return; }
  if (!(await _orgConfirmar({
    tipo: 'perigo', titulo: 'Excluir ambiente?', confirmar: 'Excluir ambiente',
    mensagem: `O ambiente <b>${_orgEsc(x.nome)}</b> (${_orgEsc(_orgSiglaUnidade(x.unidadeId))}) será excluído.`,
    detalhe: 'Esta ação não pode ser desfeita.'
  }))) return;
  await window.dbUpdate({ [`${ORG_KEY}/ambientes/${id}`]: null });
}

// ── LISTA ANTIGA ─────────────────────────────────────────────
// Ativos que estavam no nome antigo passam a apontar para o setor (nome de exibição = setor novo)
function _orgAplicarNosAtivos(nome, setorId, nomeSetor) {
  let mudou = false;
  state.ativos.forEach(a => {
    if (a && !a.setorId && a.setor === nome) { a.setorId = setorId; a.setor = nomeSetor; mudou = true; }
  });
  if (mudou) saveState();
}
function _orgEntradaLegado(nome, setorId, unidadeId) {
  return { nome, setorId: setorId || '', unidadeId: unidadeId || '', em: new Date().toISOString(),
           porNome: (typeof currentSession !== 'undefined' && currentSession?.nomeCompleto) || '' };
}

function orgLegadoMoverSelecionados() {
  const idx = [...document.querySelectorAll('.org-pend-chk:checked')].map(c => Number(c.value));
  if (!idx.length) { showToast('Marque os itens a mover.', 'error'); return; }
  orgLegadoMover(idx, document.getElementById('org-pend-lote')?.value);
}

// Move itens da lista antiga para a unidade: cada um vira setor dela (reaproveita setor de mesmo nome)
async function orgLegadoMover(indices, unidadeId) {
  if (!_orgPodeGravar()) return;
  if (!unidadeId || !_orgUnidade(unidadeId)) { showToast('Escolha a unidade.', 'error'); return; }
  const nomes = indices.map(i => _orgPendLista[i]).filter(Boolean);
  if (!nomes.length) return;
  const up = {}, destino = {};
  nomes.forEach(nome => {
    let s = Object.values(orgState.setores).find(x => x && x.unidadeId === unidadeId && _orgNorm(x.nome) === _orgNorm(nome));
    if (!s) {
      s = { id: _orgUid('st_'), nome, unidadeId, ativo: true, criadoEm: new Date().toISOString(), ..._orgCarimbo() };
      up[`${ORG_KEY}/setores/${s.id}`] = s;
    }
    destino[nome] = s;
    up[`${ORG_KEY}/legado/${_orgUid('lg_')}`] = _orgEntradaLegado(nome, s.id, unidadeId);
  });
  if (!(await window.dbUpdate(up))) { showToast('Falha ao mover.', 'error'); return; }
  nomes.forEach(nome => _orgAplicarNosAtivos(nome, destino[nome].id, destino[nome].nome));
  showToast(`${nomes.length} item(ns) movido(s) para ${_orgSiglaUnidade(unidadeId)}.`, 'success');
}

// Transforma um item da lista antiga em unidade; ativos/permissões dele vão para um setor da nova unidade
async function orgLegadoTornarUnidade() {
  if (!_orgPodeGravar()) return;
  const nome = _orgEdit?.tipo === 'tornar' ? _orgEdit.id : null;
  if (!nome) return;
  const sigla = (document.getElementById('org-tornar-sigla')?.value || '').trim().toUpperCase();
  const nomeUn = (document.getElementById('org-tornar-nome')?.value || '').trim();
  const setorEl = document.getElementById('org-tornar-setor');
  const nomeSetor = setorEl ? setorEl.value.trim() : '';
  if (!sigla || !nomeUn) { showToast('Informe a sigla e o nome da unidade.', 'error'); return; }
  if (_orgUnidades({ todas: true }).some(u => _orgNorm(u.sigla) === _orgNorm(sigla))) { showToast('Já existe uma unidade com essa sigla.', 'error'); return; }
  if (setorEl && !nomeSetor) { showToast('Informe o setor para os ativos que estão nesta unidade (ex.: Geral).', 'error'); return; }
  const ts = new Date().toISOString();
  const unId = _orgUid('un_');
  const up = { [`${ORG_KEY}/unidades/${unId}`]: { id: unId, sigla, nome: nomeUn, ativa: true, criadoEm: ts, ..._orgCarimbo() } };
  let setorId = '';
  if (nomeSetor) {
    setorId = _orgUid('st_');
    up[`${ORG_KEY}/setores/${setorId}`] = { id: setorId, nome: nomeSetor, unidadeId: unId, ativo: true, criadoEm: ts, ..._orgCarimbo() };
  }
  up[`${ORG_KEY}/legado/${_orgUid('lg_')}`] = _orgEntradaLegado(nome, setorId, unId);
  if (!(await window.dbUpdate(up))) { showToast('Falha ao criar a unidade.', 'error'); return; }
  if (setorId) _orgAplicarNosAtivos(nome, setorId, nomeSetor);
  _orgEdit = null;
  showToast(`Unidade ${sigla} criada${setorId ? ` com o setor ${nomeSetor}` : ''}.`, 'success');
}

// Remove da lista antiga um item sem ativos e sem permissões
async function orgLegadoExcluir(i) {
  if (!_orgPodeEditar()) { showToast('Sem permissão para editar setores.', 'error'); return; }
  const nome = _orgPendLista[i];
  if (!nome) return;
  if (state.ativos.some(a => a && a.setor === nome && !a.setorId)) { showToast('Não é possível remover: há ativos neste item.', 'error'); return; }
  if (_orgPermissoesComNome(nome)) { showToast('Não é possível remover: há grupos ou usuários com acesso a este item.', 'error'); return; }
  if (!(await _orgConfirmar({
    tipo: 'perigo', titulo: 'Remover da lista antiga?', confirmar: 'Remover',
    mensagem: `O item <b>${_orgEsc(nome)}</b> sai da lista antiga de setores.`,
    detalhe: 'Não há ativos nem permissões usando este item.'
  }))) return;
  state.setores = (state.setores || []).filter(s => s !== nome);
  saveState();
  orgRenderGerenciador();
}

// ── BACKUP ───────────────────────────────────────────────────
function _orgParaBackup() { return { unidades: orgState.unidades, setores: orgState.setores, ambientes: orgState.ambientes, legado: orgState.legado }; }
