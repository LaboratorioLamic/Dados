// ═══════════════════════════════════════════════════════════════
// cq.js — Módulo de Controle de Qualidade — LAMIC
// Núcleo: armazenamento, unidades, permissões, trilha de auditoria,
// aba principal, painel, configurações, card da Início e integrações.
// Base: RDC ANVISA 978/2025 (Cap. VII — Gestão do Controle da Qualidade),
// RDC 63/2011, PALC 2021 (seção 11) e ISO 15189:2022 (7.3.7).
// Demais arquivos: cq-engine.js (cálculos), cq-cadastros.js,
// cq-lancamento.js, cq-graficos.js, cq-acoes.js.
// ═══════════════════════════════════════════════════════════════

// ── STORAGE ──────────────────────────────────────────────────
// Cada registro fica em nó próprio. Resultados e corridas são
// particionados por unidade e mês e nunca são escutados por inteiro.
const CQ_KEYS = {
  config:     'gestao-cq-config-v1',      // cadastros (escutado)
  alvos:      'gestao-cq-alvos-v1',       // /{u}/{teste}/{alvoId} (escutado só da área ativa)
  corridas:   'gestao-cq-corridas-v1',    // /{u}/{yyyymm}/{corridaKey}
  resultados: 'gestao-cq-resultados-v1',  // /{u}/{yyyymm}/{teste}/{resKey}
  acoes:      'gestao-cq-acoes-v1',       // /{u}/{ano}/{ncId}
  indices:    'gestao-cq-indices-v1',     // /{u}/{ultimo|pendentes|ncAbertas} (escutado)
  seq:        'gestao-cq-seq-v1',         // /{u}/{corridas|nc}/{ano}
  uso:        'gestao-cq-uso-v1',         // /{colecao}/{id}: true — cadastro já usado em lançamento
  exclusoes:  'gestao-cq-exclusoes-v1',   // /{tk} — cadastros excluídos antes de qualquer lançamento
  cargas:     'gestao-cq-cargas-v1',      // /{u}/{lote da carga} — reserva do lote único do ciclo de esterilização
};
const CQ_VERSAO = '1.0.0';

const CQ_CATALOGOS_PADRAO = {
  causas: [
    'Erro de digitação / transcrição', 'Controle deteriorado ou mal reconstituído', 'Frasco de controle vencido / estabilidade excedida',
    'Reagente deteriorado ou troca de lote', 'Calibração inadequada ou vencida', 'Falha do equipamento', 'Após manutenção do equipamento',
    'Água reagente fora da especificação', 'Temperatura / condições ambientais', 'Erro do operador', 'Erro aleatório (sem causa identificada)',
  ],
  acoes: [
    'Repetição do controle (mesmo frasco)', 'Novo frasco de controle', 'Recalibração', 'Troca de lote ou frasco de reagente',
    'Manutenção / limpeza do equipamento', 'Acionamento da assistência técnica', 'Retreinamento do operador',
    'Reprocessamento de amostras de pacientes', 'Outra',
  ],
  fontesETa: [
    'CLIA 2024 (EUA)', 'RiliBÄK (Alemanha)', 'Variação biológica — desejável (EFLM)', 'Variação biológica — mínima',
    'Variação biológica — ótima', 'Estado da arte / CEQ (provedor)', 'Fabricante', 'Definida pelo laboratório (justificada)',
  ],
};

const CQ_COLECOES = ['unidades', 'analitos', 'materiais', 'lotesControle', 'insumoProdutos', 'insumos', 'testes', 'validacoes', 'conjuntosPreparo'];

let cqState = {
  config: { unidades: {}, analitos: {}, materiais: {}, lotesControle: {}, insumoProdutos: {}, insumos: {}, testes: {}, validacoes: {}, conjuntosPreparo: {},
            catalogos: JSON.parse(JSON.stringify(CQ_CATALOGOS_PADRAO)) },
  alvos: {},     // { testeId: { alvoId: alvo } } da área ativa
  indices: {},   // { unidadeId: { ultimo, pendentes, ncAbertas } }
};

let _cqConfigReady  = false;
let _cqIndicesReady = false;
let _cqAlvosReady   = false;
let _cqUnsubAlvos   = null;
let _cqAlvosUnidade = null;
let _cqSub          = 'painel';
let _cqPromptCb     = null;
let _cqSalvando     = false;

const CQ_STATUS = {
  aceito:    { label: 'Aceito',          cls: 'cq-st-aceito'  },
  alerta:    { label: 'Alerta',          cls: 'cq-st-alerta'  },
  rejeitado: { label: 'Rejeitado',       cls: 'cq-st-rejeitado' },
  sem_alvo:  { label: 'Sem alvo',        cls: 'cq-st-semalvo' },
  pendente:  { label: 'Aguardando',      cls: 'cq-st-pendente' },
};
const CQ_DECISAO = {
  liberado:               { label: 'Liberado',                 cls: 'cq-st-aceito',    sigla: 'L' },
  rejeitado:              { label: 'Rejeitado',                cls: 'cq-st-rejeitado', sigla: 'R' },
  liberado_com_violacao:  { label: 'Liberado com justificativa', cls: 'cq-st-alerta',  sigla: 'O' },
};
const CQ_CORRIDA_STATUS = {
  pendente:  { label: 'Aguardando avaliação', cls: 'cq-st-pendente' },
  liberada:  { label: 'Liberada',             cls: 'cq-st-aceito' },
  parcial:   { label: 'Parcialmente liberada', cls: 'cq-st-alerta' },
  rejeitada: { label: 'Rejeitada',            cls: 'cq-st-rejeitado' },
  em_analise: { label: 'Ciclo em análise',    cls: 'cq-st-pendente' },
};
const CQ_DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const CQ_FUSOS = {
  'America/Sao_Paulo': 'Brasília (UTC−3)', 'America/Bahia': 'Bahia (UTC−3)', 'America/Fortaleza': 'Fortaleza (UTC−3)',
  'America/Recife': 'Recife (UTC−3)', 'America/Belem': 'Belém (UTC−3)', 'America/Cuiaba': 'Cuiabá (UTC−4)',
  'America/Manaus': 'Manaus (UTC−4)', 'America/Porto_Velho': 'Porto Velho (UTC−4)', 'America/Rio_Branco': 'Rio Branco (UTC−5)',
  'America/Noronha': 'Fernando de Noronha (UTC−2)',
};
const CQ_PAPEIS = { operador: 'Operador', supervisor: 'Supervisor', rt: 'Responsável técnico' };

const CQ_ICO = {
  beaker:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 3h6"/><path d="M10 3v6.5L4.6 18.4A2 2 0 006.3 21.5h11.4a2 2 0 001.7-3.1L14 9.5V3"/><line x1="7.5" y1="15" x2="16.5" y2="15"/></svg>`,
  painel:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>`,
  lancar:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>`,
  lista:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r="1.5" fill="currentColor"/><circle cx="3" cy="12" r="1.5" fill="currentColor"/><circle cx="3" cy="18" r="1.5" fill="currentColor"/></svg>`,
  grafico: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 17 8 11 12 14 17 7 21 10"/><line x1="3" y1="21" x2="21" y2="21"/></svg>`,
  alerta:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  cadastro:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>`,
  plus:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  check:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
  close:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  edit:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>`,
  ativo:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`,
  clock:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  calendario:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  lock:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>`,
  print:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>`,
  baixar:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  undo:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>`,
  play:    `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M7 4.5v15a1 1 0 001.5.86l12-7.5a1 1 0 000-1.72l-12-7.5A1 1 0 007 4.5z"/></svg>`,
  pause:   `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4.5" width="4" height="15" rx="1.2"/><rect x="14" y="4.5" width="4" height="15" rx="1.2"/></svg>`,
  ban:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`,
  lixo:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>`,
  unidade: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  repeat:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>`,
  info:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="11"/><circle cx="12" cy="7.6" r="1.1" fill="currentColor" stroke="none"/></svg>`,
  busca:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  shield:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  banco:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5"/><path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"/></svg>`,
  usuarios:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>`,
};

// ── INICIALIZAÇÃO ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  cqLoad();
  _cqInjectModals();
  _cqHookTab();
  window.addEventListener('beforeunload', e => {
    if (_cqSalvando) { e.preventDefault(); e.returnValue = ''; }
  });
});

function cqLoad() {
  window._dbReady.then(() => {
    window.dbListen(CQ_KEYS.config, data => {
      const first = !_cqConfigReady;
      _cqConfigReady = true;
      _cqApplyConfig(data);
      _cqMigrarEquipAnalitos(data);
      _cqMigrarEquipInsumos(data);
      _cqEncerrarVencidos();
      _cqGarantirUnidadeAtiva();
      _cqOuvirAlvos();
      cqRender();
      if (document.getElementById('cpanel-cq')?.classList.contains('active')) cqRenderConfig();
      if (typeof renderHome === 'function' && (first || document.getElementById('tab-inicio')?.classList.contains('active'))) renderHome();
      if (typeof _cqAtualizarAlertasPreparo === 'function') _cqAtualizarAlertasPreparo();
    });
    window.dbListen(CQ_KEYS.indices, data => {
      _cqIndicesReady = true;
      cqState.indices = (data && typeof data === 'object') ? data : {};
      _cqHomeCorr = null;   // corrida nova ou avaliada: recontar no Início
      _cqUpdateNavBadge();
      if (_cqTabAtiva() && ['painel', 'corridas', 'ncs'].includes(_cqSub)) cqRender();
      if (typeof renderHome === 'function' && document.getElementById('tab-inicio')?.classList.contains('active')) renderHome();
    });
  });
}

// Gatilho: lote de controle ou de insumo com validade expirada é encerrado automaticamente.
// Roda ao carregar/alterar os cadastros e a cada hora (virada do dia com o app aberto). A chave da
// trilha deriva da validade e da última alteração do lote, então estações simultâneas gravam o mesmo
// registro em vez de duplicá-lo. `encerradoAuto` mantém o lote disponível para corrida retroativa
// datada dentro da validade (o lançamento continua bloqueando lote vencido na data da corrida).
let _cqEncerrandoVencidos = false;
async function _cqEncerrarVencidos() {
  if (_cqEncerrandoVencidos || !_cqConfigReady || window._dbConnected === false) return;
  if (!_cqCan('configurar') && !_cqCan('lancar')) return;
  const hoje = _cqHoje();
  const alvos = [];
  ['lotesControle', 'insumos'].forEach(col => Object.values(cqState.config[col] || {}).forEach(l => {
    if (l.validade && l.validade < hoje && l.status !== 'encerrado') alvos.push({ col, l: _cqLoteCru(l) });
  }));
  if (!alvos.length) return;
  _cqEncerrandoVencidos = true;
  const updates = {};
  const agora = _cqAgora();
  alvos.forEach(({ col, l }) => {
    const p = `${CQ_KEYS.config}/${col}/${l.id}`;
    const tk = (Date.parse(`${l.validade}T00:00:00Z`) + 864e5).toString(36).padStart(9, '0') + 'auto' + String(l.atualizadoEm || '').replace(/\D/g, '').slice(-6);
    const antes = CQ_STATUS_LOTE[l.status || 'em_uso']?.label || l.status;
    updates[`${p}/status`] = 'encerrado';
    updates[`${p}/encerradoAuto`] = { em: agora, validade: l.validade, statusAnterior: l.status || 'em_uso' };
    updates[`${p}/atualizadoEm`] = agora;
    updates[`${p}/trilha/${tk}`] = _cqTrilhaEntry('automatico', `Lote encerrado automaticamente: validade ${_cqFmtData(l.validade)} expirada`,
      [{ campo: 'Situação', antes, depois: 'Encerrado' }], { automatico: true });
  });
  try { await window.dbUpdate(updates); } finally { _cqEncerrandoVencidos = false; }
}
setInterval(() => { if (_cqConfigReady) _cqEncerrarVencidos(); }, 60 * 60 * 1000);

// Migração (uma vez): o equipamento/sistema passou a ser cadastrado no analito e o teste
// escolhe entre eles. Vincula a cada analito os equipamentos e sistemas dos testes existentes.
let _cqMigrouEquip = false;
function _cqMigrarEquipAnalitos(data) {
  if (_cqMigrouEquip || data?.migracoes?.analitoEquip || !_cqCan('configurar') || window._dbConnected === false) return;
  _cqMigrouEquip = true;
  const updates = {};
  Object.values(cqState.config.analitos).forEach(a => {
    const ativoIds = _cqArr(a.ativoIds).slice(), sistemas = _cqArr(a.sistemas).slice(), add = [];
    Object.values(cqState.config.testes).filter(t => t.analitoId === a.id).forEach(t => {
      if (t.ativoId) {
        if (!ativoIds.includes(t.ativoId)) { ativoIds.push(t.ativoId); add.push(_cqEquipTeste(t)); }
      } else {
        const sis = t.sistemaAnalitico || 'Bancada / manual';
        if (!sistemas.some(x => x.toLowerCase() === sis.toLowerCase())) { sistemas.push(sis); add.push(sis); }
      }
    });
    if (!add.length) return;
    const p = `${CQ_KEYS.config}/analitos/${a.id}`;
    updates[`${p}/ativoIds`] = ativoIds;
    updates[`${p}/sistemas`] = sistemas;
    updates[`${p}/trilha/${_cqTk()}`] = _cqTrilhaEntry('migracao', `Equipamentos/sistemas vinculados a partir dos testes existentes: ${add.join(', ')}`);
  });
  updates[`${CQ_KEYS.config}/migracoes/analitoEquip`] = { em: _cqAgora(), porNome: _cqSess().nome, versao: CQ_VERSAO };
  window.dbUpdate(updates).then(ok => { if (!ok) _cqMigrouEquip = false; });
}

// Migração (uma vez): insumo passou de um equipamento (ativoId) para vários equipamentos/sistemas (equips)
let _cqMigrouInsEquip = false;
function _cqMigrarEquipInsumos(data) {
  if (_cqMigrouInsEquip || data?.migracoes?.insumoEquips || !_cqCan('configurar') || window._dbConnected === false) return;
  _cqMigrouInsEquip = true;
  const updates = {};
  Object.values(cqState.config.insumos).filter(i => i.ativoId).forEach(i => {
    const p = `${CQ_KEYS.config}/insumos/${i.id}`;
    updates[`${p}/equips`] = [...new Set([..._cqArr(i.equips), 'a:' + i.ativoId])];
    updates[`${p}/ativoId`] = null;
    updates[`${p}/trilha/${_cqTk()}`] = _cqTrilhaEntry('migracao', `Equipamento convertido para a lista de equipamentos/sistemas: ${_cqRotuloEquip('a:' + i.ativoId)}`);
  });
  updates[`${CQ_KEYS.config}/migracoes/insumoEquips`] = { em: _cqAgora(), porNome: _cqSess().nome, versao: CQ_VERSAO };
  window.dbUpdate(updates).then(ok => { if (!ok) _cqMigrouInsEquip = false; });
}

// Equipamento/sistema: chaves 'a:<ativoId>' (ativo cadastrado) ou 'm:<sistema>' (sem equipamento)
function _cqRotuloEquip(k) {
  k = String(k || '');
  if (k.startsWith('a:')) return _cqNomeAtivo(k.slice(2));
  return k.startsWith('m:') ? k.slice(2) : k;
}
function _cqEquipDoTeste(t) { return t?.ativoId ? 'a:' + t.ativoId : 'm:' + (t?.sistemaAnalitico || 'Bancada / manual'); }
// Equipamentos/sistemas do insumo (compatível com o campo antigo ativoId)
function _cqEquipsInsumo(i) {
  const eqs = _cqArr(i?.equips);
  return eqs.length ? eqs : (i?.ativoId ? ['a:' + i.ativoId] : []);
}
// Material de controle serve ao equipamento/sistema e ao analito do teste?
// Sem equipamentos (ou sem analitos) cadastrados = serve a qualquer um (ex.: controle multianalito de terceira parte)
function _cqMaterialServe(m, equip, analitoId) {
  const eqs = _cqArr(m?.equips), ans = _cqArr(m?.analitoIds);
  const okEq = !eqs.length || !equip || eqs.some(k => _cqEquipChave(k) === _cqEquipChave(equip));
  const okAn = !ans.length || !analitoId || ans.includes(analitoId);
  return okEq && okAn;
}

// Opções do popover de equipamentos do insumo: ativos do CQ + equipamentos e sistemas dos analitos
function _cqOpcoesEquipInsumo(manter) {
  const mapa = new Map();
  const add = o => { const k = _cqEquipChave(o.value); if (!mapa.has(k)) mapa.set(k, o); };
  const SIS = 'Sem equipamento (bancada / manual)';
  _cqAtivosCQ().forEach(a => add({ value: 'a:' + a.id, label: a.nome || a.id, sub: [a.codigo, a.modelo].filter(Boolean).join(' · '), grupo: _cqRotuloSetorAtivo(a) }));
  Object.values(cqState.config.analitos).filter(a => a.ativo !== false && _cqNaUnidade(a)).forEach(an => _cqEquipsDoAnalito(an).forEach(o => {
    const sis = o.value.startsWith('m:');
    add({ value: o.value, label: sis ? o.label : (o.ativo?.nome || o.label), sub: sis ? 'Sistema analítico sem equipamento' : (o.ativo?.codigo || ''), grupo: sis ? SIS : _cqRotuloSetorAtivo(o.ativo) });
  }));
  _cqArr(manter).forEach(k => add({ value: k, label: _cqRotuloEquip(k), sub: 'Não vinculado a analito', grupo: String(k).startsWith('m:') ? SIS : 'Sem setor' }));
  const ordem = o => (o.grupo === SIS ? '1' : '0') + o.grupo;
  return [...mapa.values()].sort((a, b) => ordem(a).localeCompare(ordem(b)) || a.label.localeCompare(b.label));
}

// Equipamentos e sistemas analíticos do analito, como opções do teste ('a:<ativoId>' | 'm:<sistema>')
function _cqEquipsDoAnalito(an) {
  if (!an) return [];
  const eq = _cqArr(an.ativoIds).map(id => {
    const a = typeof _ativoById === 'function' ? _ativoById(id) : null;
    return { value: 'a:' + id, label: `${a?.nome || 'Equipamento removido'}${a?.codigo ? ' · ' + a.codigo : ''}`, grupo: a ? _cqRotuloSetorAtivo(a) : 'Equipamentos', ativo: a };
  }).filter(o => o.ativo?.statusUso !== 'em_desuso');
  const sis = _cqArr(an.sistemas).map(x => ({ value: 'm:' + x, label: x, grupo: 'Sem equipamento (bancada / manual)' }));
  return [...eq, ...sis];
}

function _cqApplyConfig(d) {
  const src = (d && typeof d === 'object') ? d : {};
  CQ_COLECOES.forEach(c => {
    const out = {};
    Object.entries(src[c] || {}).forEach(([id, r]) => { if (r && typeof r === 'object') out[id] = { ...r, id }; });
    cqState.config[c] = out;
  });
  const cat = src.catalogos;
  if (cat && typeof cat === 'object') {
    Object.keys(CQ_CATALOGOS_PADRAO).forEach(k => {
      const v = _cqArr(cat[k]);
      if (v.length) cqState.config.catalogos[k] = v;
    });
  }
  _cqHidratarInsumos();
}

// ── PRODUTOS E LOTES DE INSUMO ───────────────────────────────
// O produto (insumoProdutos) guarda tipo, fabricante, equipamentos/analitos e o preparo interno;
// o lote (insumos) guarda produtoId, número, validade, situação e os preparos. Em memória o lote
// recebe os campos do produto, então quem lê `insumos` continua vendo nome, tipo, equips etc.
// Lote antigo (sem produtoId) mantém os próprios campos até ser organizado em produto.
const CQ_CAMPOS_PRODUTO = ['tipo', 'nome', 'fabricante', 'regAnvisa', 'equips', 'analitoIds', 'preparoInterno', 'preparo'];
function _cqLoteCru(i) { return i?._cru || i; }
function _cqProdutoInsumo(i) { const pid = _cqLoteCru(i)?.produtoId; return pid ? cqState.config.insumoProdutos[pid] || null : null; }
function _cqHidratarInsumos() {
  const prods = cqState.config.insumoProdutos || {};
  Object.entries(cqState.config.insumos || {}).forEach(([id, x]) => {
    const l = _cqLoteCru(x);
    const p = l?.produtoId ? prods[l.produtoId] : null;
    if (!p) { cqState.config.insumos[id] = l; return; }
    const h = { ...l };
    CQ_CAMPOS_PRODUTO.forEach(k => { h[k] = p[k] ?? null; });
    Object.defineProperty(h, '_cru', { value: l });
    cqState.config.insumos[id] = h;
  });
}
function _cqLotesDoProduto(pid) { return Object.values(cqState.config.insumos).filter(i => _cqLoteCru(i).produtoId === pid); }
// Nome do produto controlado pelo teste (vínculo por id; testes antigos guardam só o nome)
function _cqNomeProdutoTeste(t) { return cqState.config.insumoProdutos[t?.insumoProdutoId]?.nome || t?.insumoProduto || ''; }

// Filtro de situação dos lotes (controles e insumos). Lote vencido é encerrado pelo gatilho
// (_cqEncerrarVencidos); "Vencido" lista os de validade expirada, encerrados ou ainda não.
const CQ_SITUACAO_FILTRO = { em_uso: 'Em uso', em_avaliacao: 'Em avaliação', quarentena: 'Quarentena', encerrado: 'Encerrado', vencido: 'Vencido' };
function _cqLoteVencido(l, hoje) { return !!(l?.validade && l.validade < (hoje || _cqHoje())); }
// Vencido e ainda não encerrado (o gatilho não rodou: sem conexão ou sem permissão nesta estação)
function _cqLoteVencidoAberto(l, hoje) { return _cqLoteVencido(l, hoje) && l.status !== 'encerrado'; }
function _cqLoteNaSituacao(l, sel, hoje) {
  if (!_cqArr(sel).length) return true;
  return sel.includes(l.status || 'em_uso') || (sel.includes('vencido') && _cqLoteVencido(l, hoje));
}
function _cqLoteSituacaoBadge(l, hoje) {
  if (_cqLoteVencidoAberto(l, hoje)) return '<span class="cq-badge cq-st-rejeitado">Vencido</span>';
  if (l.status === 'encerrado' && _cqLoteVencido(l, hoje)) return `<span class="cq-badge cq-st-semalvo" title="${l.encerradoAuto ? `Encerrado automaticamente em ${_cqFmtDH(l.encerradoAuto.em)}` : 'Encerrado'}">Encerrado · vencido</span>`;
  return _cqBadge(CQ_STATUS_LOTE, l.status || 'em_uso');
}

function _cqOuvirAlvos() {
  const u = _cqUnidadeAtivaId();
  if (u === _cqAlvosUnidade) return;
  if (_cqUnsubAlvos) { _cqUnsubAlvos(); _cqUnsubAlvos = null; }
  _cqAlvosUnidade = u;
  cqState.alvos = {};
  _cqAlvosReady = false;
  if (!u) return;
  _cqUnsubAlvos = window.dbListen(`${CQ_KEYS.alvos}/${u}`, data => {
    if (_cqAlvosUnidade !== u) return;
    const out = {};
    Object.entries((data && typeof data === 'object') ? data : {}).forEach(([t, mapa]) => {
      out[t] = {};
      Object.entries(mapa || {}).forEach(([id, a]) => { if (a && typeof a === 'object') out[t][id] = { ...a, id }; });
    });
    cqState.alvos = out;
    _cqAlvosReady = true;
    if (_cqTabAtiva()) cqRender();
  });
}

// ── HELPERS ───────────────────────────────────────────────────
function _cqUid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
// Chave de trilha: ordenável no tempo e única entre estações
function _cqTk() { return Date.now().toString(36).padStart(9, '0') + Math.random().toString(36).slice(2, 6); }
function _cqEsc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function _cqArr(v) {
  if (Array.isArray(v)) return v.filter(x => x !== null && x !== undefined);
  if (v && typeof v === 'object') return Object.values(v);
  return [];
}
function _cqAgora() { return new Date().toISOString(); }
function _cqPad(n) { return String(n).padStart(2, '0'); }

// Data/hora local "YYYY-MM-DDTHH:mm" no fuso da unidade
function _cqNowLocal(fuso) {
  const d = new Date();
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: fuso || _cqUnidade()?.fuso || undefined, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(d).map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  } catch (e) {
    return `${d.getFullYear()}-${_cqPad(d.getMonth() + 1)}-${_cqPad(d.getDate())}T${_cqPad(d.getHours())}:${_cqPad(d.getMinutes())}`;
  }
}
function _cqHoje(fuso) { return _cqNowLocal(fuso).slice(0, 10); }
function _cqFmtData(s) {
  if (!s) return '—';
  const [y, m, d] = String(s).slice(0, 10).split('-');
  return d ? `${d}/${m}/${y}` : '—';
}
function _cqFmtDH(s) {
  if (!s) return '—';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return `${_cqFmtData(s)} ${s.slice(11, 16)}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return _cqFmtData(s);
  const d = new Date(s);
  if (isNaN(d)) return _cqFmtData(s);
  return `${_cqPad(d.getDate())}/${_cqPad(d.getMonth() + 1)}/${d.getFullYear()} ${_cqPad(d.getHours())}:${_cqPad(d.getMinutes())}`;
}
function _cqFmtMes(yyyymm) {
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return yyyymm ? `${nomes[Number(String(yyyymm).slice(4, 6)) - 1]}/${String(yyyymm).slice(0, 4)}` : '—';
}
function _cqNum(v, dec) { return CQEngine.fmtNum(v, dec); }
function _cqVal(id) { const el = document.getElementById(id); return el ? String(el.value ?? '').trim() : ''; }
function _cqChk(id) { return !!document.getElementById(id)?.checked; }
function _cqSet(id, v) { const el = document.getElementById(id); if (el) el.value = v ?? ''; }

function _cqSess() {
  const s = typeof currentSession !== 'undefined' ? currentSession : null;
  return { id: s?.userId || null, nome: s?.nomeCompleto || s?.username || 'Sistema' };
}
function _cqIsAdmin() { return typeof currentSession !== 'undefined' && !!currentSession?.isAdmin; }
function _cqCan(k) {
  if (_cqIsAdmin()) return true;
  return typeof authHasPermission === 'function' && authHasPermission('cq.' + k);
}
// Editar cadastros que já existem (dados, ativar/inativar, encerrar ou reabrir lote, situação de preparo):
// quem tem "Cadastros e áreas de CQ" ou a permissão própria "Editar cadastros". Criar e excluir cadastros
// e configurar áreas continuam exigindo "Cadastros e áreas de CQ" (configurar).
function _cqPodeEditarCad(existe = true) { return _cqCan('configurar') || (existe && _cqCan('editarCadastros')); }
// "Editar cadastros" também cria lotes (controle e reagente) e exclui lote, produto ou material sem vínculos
// (cadastro errado); analitos, testes e áreas seguem exigindo "Cadastros e áreas de CQ".
const CQ_COL_EDITOR_EXCLUI = ['lotesControle', 'insumos', 'insumoProdutos', 'materiais', 'conjuntosPreparo'];
function _cqPodeCriarLote() { return _cqCan('configurar') || _cqCan('editarCadastros'); }
function _cqPodeExcluirCad(colecao) { return _cqCan('configurar') || (CQ_COL_EDITOR_EXCLUI.includes(colecao) && _cqCan('editarCadastros')); }
function _cqEstacao() { try { return localStorage.getItem('cq-estacao') || ''; } catch (e) { return ''; } }
function _cqLocal() { return { unidadeId: _cqUnidadeAtivaId(), estacao: _cqEstacao() || 'não informada' }; }

// Assinatura: quem, quando e onde (RDC 978 art. 105, II)
function _cqAssinatura(extra) {
  const u = _cqSess();
  return { porId: u.id, porNome: u.nome, em: _cqAgora(), ..._cqLocal(), ...(extra || {}) };
}

// Entrada de trilha de auditoria (somente acrescentada)
function _cqTrilhaEntry(acao, texto, diffs, extras) {
  const u = _cqSess();
  return { ts: _cqAgora(), userId: u.id, userName: u.nome, ..._cqLocal(), acao, texto: texto || '', diffs: diffs || [], ...(extras || {}) };
}
function _cqTrilhaAdd(rec, acao, texto, diffs, extras) {
  rec.trilha = rec.trilha && typeof rec.trilha === 'object' && !Array.isArray(rec.trilha) ? rec.trilha : {};
  rec.trilha[_cqTk()] = _cqTrilhaEntry(acao, texto, diffs, extras);
}
function _cqTrilhaLista(rec) {
  return Object.entries(rec?.trilha || {}).sort(([a], [b]) => a.localeCompare(b)).map(([, t]) => ({ ...t, diffs: _cqArr(t.diffs) }));
}

function _cqDiff(antes, depois, labels, fmt) {
  const diffs = [];
  Object.keys(labels).forEach(k => {
    const a = antes?.[k], b = depois?.[k];
    if (JSON.stringify(a ?? null) === JSON.stringify(b ?? null)) return;
    const vazio = x => x === undefined || x === null || x === '' || (Array.isArray(x) && !x.length);
    if (vazio(a) && vazio(b)) return;
    const f = (fmt && fmt[k]) || (x => Array.isArray(x) ? x.join(', ') : (typeof x === 'object' ? JSON.stringify(x) : String(x)));
    diffs.push({ campo: labels[k], antes: vazio(a) ? '—' : f(a), depois: vazio(b) ? '—' : f(b) });
  });
  return diffs;
}

// ── SELEÇÃO MÚLTIPLA EM POPOVER ──────────────────────────────
// opcoes: [{ value, label, sub?, grupo? }]. O estado fica em _cqMulti (não no DOM),
// então _cqMultiVal funciona mesmo antes de o popover ser aberto.
const _cqMulti = {};
// `resumo` (ex.: 'analitos'): com mais de um item marcado, o botão mostra um chip só ("3 analitos") em vez de um por item
// `filtro: true` (barras de filtro): botão compacto com ícone (`ico`), nome do item ou "N <resumo>", contador e ×;
// popover com busca, grupos e rodapé "N selecionado(s) · Concluir"
function _cqMultiHTML(id, opcoes, selecionados, { placeholder = 'Selecione…', disabled = false, onchange = null, vazio = 'Nenhuma opção.', resumo = '', filtro = false, ico = '' } = {}) {
  _cqMulti[id] = { opcoes: opcoes || [], sel: new Set(_cqArr(selecionados)), placeholder, disabled, onchange, vazio, busca: '', resumo, filtro, ico };
  return `<div class="cq-ms${disabled ? ' cq-ms-off' : ''}${filtro ? ' cq-ms-filtro' : ''}${filtro && _cqArr(selecionados).length ? ' tem-sel' : ''}" id="${id}">
    <div class="cq-ms-btn" id="${id}-btn" tabindex="${disabled ? -1 : 0}" role="button" aria-haspopup="listbox"
      onclick="cqMultiAbrir('${id}')" onkeydown="if(event.key==='Enter'||event.key===' '||event.key==='ArrowDown'){event.preventDefault();cqMultiAbrir('${id}')}">${_cqMultiBtnHTML(id)}</div>
    <div class="cq-ms-pop" id="${id}-pop" style="display:none;" onkeydown="if(event.key==='Escape'){event.stopPropagation();cqMultiFechar('${id}',true)}">
      <div class="cq-ms-busca">${CQ_ICO.busca}<input type="text" id="${id}-busca" placeholder="Buscar…" autocomplete="off" oninput="cqMultiBuscar('${id}',this.value)"></div>
      <div class="cq-ms-acoes"><button type="button" onclick="cqMultiTodos('${id}',true)">Marcar visíveis</button><button type="button" onclick="cqMultiTodos('${id}',false)">Limpar</button></div>
      <div class="cq-ms-lista" id="${id}-lista" role="listbox" aria-multiselectable="true"></div>
      ${filtro ? `<div class="cq-ms-pe"><span id="${id}-n"></span><button type="button" onclick="cqMultiFechar('${id}',true)">Concluir</button></div>` : ''}
    </div>
  </div>`;
}
function _cqMultiVal(id) { return [...(_cqMulti[id]?.sel || [])]; }
function _cqMultiBtnHTML(id) {
  const m = _cqMulti[id];
  if (!m) return '';
  const porValor = new Map(m.opcoes.map(o => [o.value, o]));
  const sel = [...m.sel];
  const caret = '<svg class="cq-ms-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>';
  if (m.filtro) {
    const n = sel.length;
    const nome = v => porValor.get(v)?.label || _cqRotuloMulti(v);
    const txt = !n ? `<span class="cq-ms-ph">${_cqEsc(m.placeholder)}</span>`
      : `<span class="cq-ms-f-txt" title="${_cqEsc(sel.map(nome).join('\n'))}">${_cqEsc(n === 1 ? nome(sel[0]) : `${n} ${m.resumo || 'selecionados'}`)}</span>`;
    return `${m.ico ? `<span class="cq-ms-f-ico">${m.ico}</span>` : ''}${txt}
      ${n && !m.disabled ? `<button type="button" class="cq-ms-f-x" title="Limpar filtro" onclick="event.stopPropagation();cqMultiTodos('${id}',false)">×</button>` : ''}${caret}`;
  }
  if (m.resumo && sel.length > 1) {
    const nomes = sel.map(v => porValor.get(v)?.label || _cqRotuloMulti(v)).join('\n');
    return `<div class="cq-ms-chips cq-ms-resumo"><span class="cq-ms-chip" title="${_cqEsc(nomes)}"><span class="cq-ms-chip-txt">${sel.length} ${_cqEsc(m.resumo)}</span>${m.disabled ? '' : `<button type="button" title="Limpar" onclick="event.stopPropagation();cqMultiTodos('${id}',false)">×</button>`}</span></div>
    <svg class="cq-ms-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>`;
  }
  const chips = sel.slice(0, 6).map(v => `<span class="cq-ms-chip" title="${_cqEsc(porValor.get(v)?.label || _cqRotuloMulti(v))}"><span class="cq-ms-chip-txt">${_cqEsc(porValor.get(v)?.label || _cqRotuloMulti(v))}</span>${m.disabled ? '' : `<button type="button" title="Remover" onclick="event.stopPropagation();cqMultiDesmarcarSel('${id}',${sel.indexOf(v)})">×</button>`}</span>`).join('');
  return `<div class="cq-ms-chips">${sel.length ? chips + (sel.length > 6 ? `<span class="cq-ms-mais">+${sel.length - 6}</span>` : '') : `<span class="cq-ms-ph">${_cqEsc(m.placeholder)}</span>`}</div>
    <svg class="cq-ms-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>`;
}
function _cqMultiListaHTML(id) {
  const m = _cqMulti[id];
  const q = (m.busca || '').toLowerCase().trim();
  const vis = m.opcoes.filter(o => !q || `${o.label} ${o.sub || ''} ${o.grupo || ''}`.toLowerCase().includes(q));
  if (!vis.length) return `<div class="cq-ms-vazio">${_cqEsc(q ? 'Nada encontrado.' : m.vazio)}</div>`;
  let grupo = null;
  return vis.map(o => {
    const idx = m.opcoes.indexOf(o);
    const cab = o.grupo !== undefined && o.grupo !== grupo ? `<div class="cq-ms-grupo">${_cqEsc((grupo = o.grupo) || 'Sem grupo')}</div>` : '';
    const on = m.sel.has(o.value);
    return `${cab}<label class="cq-ms-op${on ? ' on' : ''}" role="option" aria-selected="${on}">
      <input type="checkbox" ${on ? 'checked' : ''} onchange="cqMultiMarcarIdx('${id}',${idx},this.checked)">
      <span class="cq-ms-op-txt">${_cqEsc(o.label)}${o.sub ? `<small>${_cqEsc(o.sub)}</small>` : ''}</span></label>`;
  }).join('');
}
function _cqMultiAtualizar(id, lista = true) {
  const b = document.getElementById(id + '-btn');
  if (b) b.innerHTML = _cqMultiBtnHTML(id);
  const l = document.getElementById(id + '-lista');
  if (lista && l) l.innerHTML = _cqMultiListaHTML(id);
  const n = document.getElementById(id + '-n');
  if (n) { const k = _cqMulti[id].sel.size; n.textContent = k ? `${k} selecionado${k === 1 ? '' : 's'}` : 'Nenhum: mostra todos'; }
  document.getElementById(id)?.classList.toggle('tem-sel', !!_cqMulti[id]?.sel.size);
}
function cqMultiAbrir(id) {
  const m = _cqMulti[id];
  const pop = document.getElementById(id + '-pop');
  if (!m || m.disabled || !pop) return;
  if (pop.style.display !== 'none') { cqMultiFechar(id); return; }
  Object.keys(_cqMulti).forEach(o => { if (o !== id) cqMultiFechar(o); });
  m.busca = '';
  const busca = document.getElementById(id + '-busca');
  if (busca) busca.value = '';
  _cqMultiAtualizar(id);
  pop.style.display = '';
  document.getElementById(id)?.classList.add('aberto');
  setTimeout(() => busca?.focus(), 30);
}
function cqMultiFechar(id, foco) {
  const pop = document.getElementById(id + '-pop');
  if (!pop || pop.style.display === 'none') return;
  pop.style.display = 'none';
  document.getElementById(id)?.classList.remove('aberto');
  if (foco) document.getElementById(id + '-btn')?.focus();
}
function cqMultiBuscar(id, q) {
  if (!_cqMulti[id]) return;
  _cqMulti[id].busca = q;
  const l = document.getElementById(id + '-lista');
  if (l) l.innerHTML = _cqMultiListaHTML(id);
}
function cqMultiMarcar(id, v, on) {
  const m = _cqMulti[id];
  if (!m || m.disabled) return;
  if (on) m.sel.add(v); else m.sel.delete(v);
  _cqMultiAtualizar(id);
  if (typeof m.onchange === 'function') m.onchange(_cqMultiVal(id));
}
// Variantes por índice (os valores podem conter aspas e não vão para atributos HTML)
function cqMultiMarcarIdx(id, idx, on) { const o = _cqMulti[id]?.opcoes[idx]; if (o) cqMultiMarcar(id, o.value, on); }
function cqMultiDesmarcarSel(id, idx) { const v = _cqMultiVal(id)[idx]; if (v !== undefined) cqMultiMarcar(id, v, false); }
function _cqRotuloMulti(v) { return /^[am]:/.test(String(v)) && typeof _cqRotuloEquip === 'function' ? _cqRotuloEquip(v) : v; }
function cqMultiTodos(id, on) {
  const m = _cqMulti[id];
  if (!m || m.disabled) return;
  const q = (m.busca || '').toLowerCase().trim();
  if (on) m.opcoes.filter(o => !q || `${o.label} ${o.sub || ''} ${o.grupo || ''}`.toLowerCase().includes(q)).forEach(o => m.sel.add(o.value));
  else m.sel.clear();
  _cqMultiAtualizar(id);
  if (typeof m.onchange === 'function') m.onchange(_cqMultiVal(id));
}
// Troca as opções mantendo marcados só os que continuam disponíveis
function _cqMultiOpcoes(id, opcoes) {
  const m = _cqMulti[id];
  if (!m) return;
  m.opcoes = opcoes || [];
  const validos = new Set(m.opcoes.map(o => o.value));
  [...m.sel].forEach(v => { if (!validos.has(v)) m.sel.delete(v); });
  _cqMultiAtualizar(id);
}
document.addEventListener('mousedown', e => {
  Object.keys(_cqMulti).forEach(id => {
    const el = document.getElementById(id);
    if (el && !(e.target && typeof el.contains === 'function' && el.contains(e.target))) cqMultiFechar(id);
  });
});

// ── LISTA DE ITENS (adicionar, remover, ordenar) ─────────────
// Campo de cadastro de itens de texto: cada item numa linha, "Adicionar" (ou Enter) inclui, × remove,
// setas reordenam (`ordenavel`). `travados`: itens em uso que não podem sair. `sugestoes`: itens já
// cadastrados (ex.: na unidade) num popover que abre ao focar o campo e filtra pelo texto digitado.
// O estado fica em _cqItens; _cqItensVal lê a lista.
const _cqItens = {};
const _cqItensChave = s => _cqNormBusca(String(s || '').trim().replace(/\s+/g, ' '));
function _cqItensHTML(id, itens, opts = {}) {
  const vistos = new Set();
  const lista = _cqArr(itens).map(x => String(x).trim()).filter(x => x && !vistos.has(_cqItensChave(x)) && vistos.add(_cqItensChave(x)));
  _cqItens[id] = { ...opts, itens: lista, travados: new Set(_cqArr(opts.travados).map(_cqItensChave)), sugestoes: _cqArr(opts.sugestoes), ativo: -1, vis: [] };
  const m = _cqItens[id];
  const sug = m.sugestoes.length;
  return `<div class="cq-itens${m.disabled ? ' cq-itens-off' : ''}" id="${id}">
    <div class="cq-itens-lista" id="${id}-lista">${_cqItensListaHTML(id)}</div>
    ${m.disabled ? '' : `<div class="cq-itens-add">
      <div class="cq-itens-in">
        <input type="text" class="field-input" id="${id}-in" maxlength="${m.max || 80}" placeholder="${_cqEsc(m.placeholder || 'Novo item')}${sug ? ' — ou escolha um já cadastrado' : ''}" autocomplete="off"
          ${sug ? `onfocus="cqItensPopAbrir('${id}')" onclick="cqItensPopAbrir('${id}')" oninput="cqItensPopAbrir('${id}')" onblur="cqItensPopFechar('${id}')"` : ''} onkeydown="cqItensTecla(event,'${id}')">
        ${sug ? `<div class="cq-ms-pop cq-itens-pop" id="${id}-pop" style="display:none;" onmousedown="event.preventDefault()"></div>` : ''}
      </div>
      <button type="button" class="btn btn-primary btn-sm" onclick="cqItensAdicionar('${id}')">${CQ_ICO.plus} Adicionar</button></div>`}
  </div>`;
}
function _cqItensVal(id) { return [...(_cqItens[id]?.itens || [])]; }
function _cqItensListaHTML(id) {
  const m = _cqItens[id];
  if (!m.itens.length) return `<div class="cq-itens-vazio">${_cqEsc(m.vazio || 'Nenhum item adicionado.')}</div>`;
  const seta = pts => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="${pts}"/></svg>`;
  return m.itens.map((v, i) => {
    const trav = m.travados.has(_cqItensChave(v));
    return `<div class="cq-item${trav ? ' travado' : ''}">
      ${m.ordenavel ? `<span class="cq-item-n">${i + 1}</span>` : '<span class="cq-item-dot"></span>'}
      <span class="cq-item-txt">${_cqEsc(v)}</span>
      ${trav ? `<span class="cq-item-lock" title="${_cqEsc(m.travadoMotivo || 'Em uso')}">${CQ_ICO.lock}</span>` : ''}
      ${m.disabled ? '' : `<span class="cq-item-acoes">
        ${m.ordenavel ? `<button type="button" class="cq-icobtn" title="Subir" ${i ? '' : 'disabled'} onclick="cqItensMover('${id}',${i},-1)">${seta('18 15 12 9 6 15')}</button>
          <button type="button" class="cq-icobtn" title="Descer" ${i < m.itens.length - 1 ? '' : 'disabled'} onclick="cqItensMover('${id}',${i},1)">${seta('6 9 12 15 18 9')}</button>` : ''}
        <button type="button" class="cq-icobtn cq-item-rem" title="${trav ? _cqEsc(m.travadoMotivo || 'Em uso') + ' — não pode ser removido' : 'Remover'}" ${trav ? 'disabled' : ''} onclick="cqItensRemover('${id}',${i})">${CQ_ICO.close}</button></span>`}
    </div>`;
  }).join('');
}
// Popover de sugestões: itens ainda fora da lista, filtrados pelo texto (sem acentos, por termos)
function _cqItensPopHTML(id) {
  const m = _cqItens[id];
  const ja = new Set(m.itens.map(_cqItensChave));
  const termos = _cqItensChave(document.getElementById(id + '-in')?.value || '').split(' ').filter(Boolean);
  const livres = m.sugestoes.filter(s => !ja.has(_cqItensChave(s)));
  if (!livres.length) return '';
  m.vis = livres.filter(s => { const k = _cqItensChave(s); return termos.every(t => k.includes(t)); });
  if (m.ativo >= m.vis.length) m.ativo = -1;
  const realce = s => typeof _cqPickRealce === 'function' ? _cqPickRealce(s, termos[0]) : _cqEsc(s);
  const lista = m.vis.map((s, i) => `<div class="cq-ms-op cq-pick-op${i === m.ativo ? ' ativo' : ''}" role="option" data-i="${i}"
      onclick="cqItensSugEscolher('${id}',${i})" onmousemove="cqItensSugHover('${id}',${i})">${CQ_ICO.plus}<span class="cq-ms-op-txt"><span>${realce(s)}</span></span></div>`).join('')
    || '<div class="cq-ms-vazio">Nenhum já cadastrado corresponde. <b>Enter</b> adiciona o texto digitado.</div>';
  return `<div class="cq-ms-grupo">${_cqEsc(m.sugestoesRotulo || 'Já cadastrados')}</div>
    <div class="cq-ms-lista" role="listbox">${lista}</div>
    <div class="cq-pick-rodape"><span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>Enter</kbd> adicionar</span><span><kbd>Esc</kbd> fechar</span></div>`;
}
function cqItensPopAbrir(id) {
  const m = _cqItens[id], pop = document.getElementById(id + '-pop');
  if (!m || m.disabled || !pop) return;
  m.ativo = -1;
  const html = _cqItensPopHTML(id);
  pop.innerHTML = html;
  pop.style.display = html ? '' : 'none';
}
function cqItensPopFechar(id) {
  const pop = document.getElementById(id + '-pop');
  if (pop) pop.style.display = 'none';
  if (_cqItens[id]) _cqItens[id].ativo = -1;
}
function cqItensSugHover(id, i, rolar) {
  const m = _cqItens[id];
  if (!m) return;
  m.ativo = i;
  document.querySelectorAll(`#${id}-pop .cq-pick-op`).forEach(el => el.classList.toggle('ativo', Number(el.dataset.i) === i));
  if (rolar) document.querySelector(`#${id}-pop .cq-pick-op[data-i="${i}"]`)?.scrollIntoView({ block: 'nearest' });
}
function cqItensSugEscolher(id, i) { const s = _cqItens[id]?.vis[i]; if (s !== undefined) cqItensAdicionar(id, s); }
// Enter: sugestão destacada (setas) ou o texto digitado; Esc fecha o popover
function cqItensTecla(e, id) {
  const m = _cqItens[id], pop = document.getElementById(id + '-pop');
  const aberto = !!pop && pop.style.display !== 'none';
  if (e.key === 'Enter') { e.preventDefault(); if (aberto && m.vis[m.ativo] !== undefined) cqItensSugEscolher(id, m.ativo); else cqItensAdicionar(id); return; }
  if (e.key === 'Escape' && aberto) { e.preventDefault(); e.stopPropagation(); cqItensPopFechar(id); return; }
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  if (!aberto) cqItensPopAbrir(id);
  const n = m.vis.length;
  if (!n || !pop || pop.style.display === 'none') return;
  e.preventDefault();
  const d = e.key === 'ArrowDown' ? 1 : -1;
  cqItensSugHover(id, m.ativo < 0 ? (d > 0 ? 0 : n - 1) : (m.ativo + d + n) % n, true);
}
function _cqItensAtualizar(id) {
  const l = document.getElementById(id + '-lista');
  if (l) l.innerHTML = _cqItensListaHTML(id);
  _cqItensSugAtualizar(id);
  if (typeof _cqItens[id]?.onchange === 'function') _cqItens[id].onchange(_cqItensVal(id));
}
function _cqItensSugAtualizar(id) {
  const pop = document.getElementById(id + '-pop');
  if (pop && pop.style.display !== 'none') cqItensPopAbrir(id);   // lista mudou: atualiza o popover aberto
}
function cqItensAdicionar(id, valor) {
  const m = _cqItens[id];
  if (!m || m.disabled) return;
  const inp = document.getElementById(id + '-in');
  const v = String(valor ?? inp?.value ?? '').trim().replace(/\s+/g, ' ');
  if (!v) { inp?.focus(); return; }
  if (m.itens.some(x => _cqItensChave(x) === _cqItensChave(v))) { showToast(`“${v}” já está na lista.`, 'error'); inp?.select(); return; }
  m.itens.push(v);
  if (inp) inp.value = '';
  _cqItensAtualizar(id);
  inp?.focus();
}
function cqItensRemover(id, idx) {
  const m = _cqItens[id];
  if (!m || m.disabled || m.travados.has(_cqItensChave(m.itens[idx]))) return;
  m.itens.splice(idx, 1);
  _cqItensAtualizar(id);
}
function cqItensMover(id, idx, d) {
  const m = _cqItens[id];
  const j = idx + d;
  if (!m || m.disabled || j < 0 || j >= m.itens.length) return;
  [m.itens[idx], m.itens[j]] = [m.itens[j], m.itens[idx]];
  _cqItensAtualizar(id);
}

// ── SELEÇÃO ÚNICA EM POPOVER (com busca) ─────────────────────
// opcoes: [{ value, label, sub?, grupo?, extra? }]. Estado em _cqSel; valor lido por _cqSelVal.
const _cqSel = {};
function _cqSelHTML(id, opcoes, valor, { placeholder = 'Selecione…', disabled = false, onchange = null, vazio = 'Nenhuma opção.', busca = 'Buscar…' } = {}) {
  _cqSel[id] = { opcoes: opcoes || [], valor: valor ?? '', placeholder, disabled, onchange, vazio, buscaPh: busca, q: '', ativo: 0, vis: [] };
  return `<div class="cq-ms cq-pick cq-sel${disabled ? ' cq-ms-off' : ''}" id="${id}">
    <div class="cq-ms-btn" id="${id}-btn" tabindex="${disabled ? -1 : 0}" role="button" aria-haspopup="listbox"
      onclick="cqSelAbrir('${id}')" onkeydown="cqSelTeclaBtn(event,'${id}')">${_cqSelBtnHTML(id)}</div>
    <div class="cq-ms-pop" id="${id}-pop" style="display:none;" onkeydown="cqSelTecla(event,'${id}')">
      <div class="cq-ms-busca">${CQ_ICO.busca}<input type="text" id="${id}-busca" placeholder="${_cqEsc(busca)}" autocomplete="off" oninput="cqSelBuscar('${id}',this.value)"></div>
      <div class="cq-ms-lista cq-pick-lista" id="${id}-lista" role="listbox"></div>
    </div>
  </div>`;
}
function _cqSelVal(id) { return _cqSel[id]?.valor ?? ''; }
function _cqSelBtnHTML(id) {
  const m = _cqSel[id];
  const o = m.opcoes.find(x => x.value === m.valor);
  const txt = o ? `<span class="cq-sel-txt"><b>${_cqEsc(o.label)}</b>${o.sub ? `<small>${_cqEsc(o.sub)}</small>` : ''}</span>`
    : `<span class="cq-ms-ph">${_cqEsc(m.valor || m.placeholder)}</span>`;
  return `${txt}<svg class="cq-ms-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>`;
}
function _cqSelListaHTML(id) {
  const m = _cqSel[id];
  const termos = _cqNormBusca(m.q).split(/\s+/).filter(Boolean);
  m.vis = m.opcoes.filter(o => { const t = _cqNormBusca(`${o.label} ${o.sub || ''} ${o.grupo || ''}`); return termos.every(x => t.includes(x)); });
  if (m.ativo >= m.vis.length) m.ativo = Math.max(0, m.vis.length - 1);
  if (!m.vis.length) return `<div class="cq-ms-vazio">${_cqEsc(termos.length ? 'Nada encontrado.' : m.vazio)}</div>`;
  let grupo;
  return m.vis.map((o, i) => {
    const cab = o.grupo !== undefined && o.grupo !== grupo ? `<div class="cq-ms-grupo">${_cqEsc((grupo = o.grupo) || '')}</div>` : '';
    return `${cab}<div class="cq-ms-op cq-pick-op${i === m.ativo ? ' ativo' : ''}${o.value === m.valor ? ' on' : ''}" role="option" aria-selected="${o.value === m.valor}" data-i="${i}"
      onmousedown="event.preventDefault()" onclick="cqSelEscolher('${id}',${i})" onmousemove="cqSelHover('${id}',${i})">
      <span class="cq-ms-op-txt"><span>${_cqEsc(o.label)}</span>${o.sub ? `<small>${_cqEsc(o.sub)}</small>` : ''}</span>
      ${o.extra ? `<span class="cq-pick-ult">${_cqEsc(o.extra)}</span>` : ''}</div>`;
  }).join('');
}
function _cqNormBusca(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
function cqSelAbrir(id, texto) {
  const m = _cqSel[id], pop = document.getElementById(id + '-pop');
  if (!m || m.disabled || !pop) return;
  if (pop.style.display !== 'none' && texto === undefined) { cqSelFechar(id); return; }
  Object.keys(_cqSel).forEach(o => { if (o !== id) cqSelFechar(o); });
  m.q = texto || '';
  m.ativo = Math.max(0, m.opcoes.findIndex(o => o.value === m.valor));
  const inp = document.getElementById(id + '-busca');
  if (inp) inp.value = m.q;
  document.getElementById(id + '-lista').innerHTML = _cqSelListaHTML(id);
  pop.style.display = '';
  document.getElementById(id)?.classList.add('aberto');
  setTimeout(() => { inp?.focus(); document.querySelector(`#${id}-lista .cq-pick-op.ativo`)?.scrollIntoView({ block: 'nearest' }); }, 20);
}
function cqSelFechar(id, foco) {
  const pop = document.getElementById(id + '-pop');
  if (!pop || pop.style.display === 'none') return;
  pop.style.display = 'none';
  document.getElementById(id)?.classList.remove('aberto');
  if (foco) document.getElementById(id + '-btn')?.focus();
}
function cqSelBuscar(id, q) { const m = _cqSel[id]; if (!m) return; m.q = q; m.ativo = 0; document.getElementById(id + '-lista').innerHTML = _cqSelListaHTML(id); }
function cqSelHover(id, i) {
  const m = _cqSel[id];
  if (!m || m.ativo === i) return;
  m.ativo = i;
  document.querySelectorAll(`#${id}-lista .cq-pick-op`).forEach(el => el.classList.toggle('ativo', Number(el.dataset.i) === i));
}
function cqSelEscolher(id, i) {
  const m = _cqSel[id], o = m?.vis[i];
  if (!o) return;
  m.valor = o.value;
  const b = document.getElementById(id + '-btn');
  if (b) b.innerHTML = _cqSelBtnHTML(id);
  cqSelFechar(id, true);
  if (typeof m.onchange === 'function') m.onchange(o.value);
}
function cqSelTeclaBtn(e, id) {
  if (['Enter', ' ', 'ArrowDown'].includes(e.key)) { e.preventDefault(); cqSelAbrir(id); return; }
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); cqSelAbrir(id, e.key); }
}
function cqSelTecla(e, id) {
  const m = _cqSel[id], n = m?.vis.length || 0;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cqSelFechar(id, true); return; }
  if (e.key === 'Enter') { e.preventDefault(); cqSelEscolher(id, m.ativo); return; }
  if ((e.key !== 'ArrowDown' && e.key !== 'ArrowUp') || !n) return;
  e.preventDefault();
  cqSelHover(id, (m.ativo + (e.key === 'ArrowDown' ? 1 : -1) + n) % n);
  document.querySelector(`#${id}-lista .cq-pick-op[data-i="${m.ativo}"]`)?.scrollIntoView({ block: 'nearest' });
}
document.addEventListener('mousedown', e => {
  Object.keys(_cqSel).forEach(id => { const el = document.getElementById(id); if (el && !el.contains(e.target)) cqSelFechar(id); });
});

// Equipamentos (ativos) disponíveis para o CQ: os da unidade (ativa, se não informada)
function _cqAtivosCQ(u = _cqUnidadeAtivaId()) {
  const ativos = (typeof state !== 'undefined' && Array.isArray(state?.ativos)) ? state.ativos.filter(a => a && a.statusUso !== 'em_desuso') : [];
  return ativos.filter(a => !u || _cqAtivoNaUnidade(a, u))
    .sort((a, b) => _orgChaveOrdemAtivo(a).localeCompare(_orgChaveOrdemAtivo(b)) || (a.nome || '').localeCompare(b.nome || ''));
}
function _cqOpcoesAtivos(extraIds) {
  const lista = _cqAtivosCQ();
  _cqArr(extraIds).forEach(id => {
    if (lista.some(a => a.id === id)) return;
    const a = typeof _ativoById === 'function' ? _ativoById(id) : null;
    lista.push(a || { id, nome: 'Equipamento removido', setor: '' });
  });
  return lista.map(a => ({ value: a.id, label: a.nome || a.id, sub: [a.codigo, a.modelo].filter(Boolean).join(' · '), grupo: a.nome === 'Equipamento removido' && !a.codigo ? '' : _cqRotuloSetorAtivo(a) }));
}
function _cqNomeAtivo(id) {
  const a = typeof _ativoById === 'function' ? _ativoById(id) : null;
  return a?.nome || 'Equipamento removido';
}

function _cqOptions(lista, atual, vazio = '— Selecione —') {
  const itens = [...lista];
  if (atual && !itens.includes(atual)) itens.unshift(atual);
  return (vazio !== null ? `<option value="">${vazio}</option>` : '') +
    itens.map(v => `<option value="${_cqEsc(v)}" ${v === atual ? 'selected' : ''}>${_cqEsc(v)}</option>`).join('');
}
function _cqMapOptions(map, atual, vazio = '— Selecione —') {
  return (vazio !== null ? `<option value="">${vazio}</option>` : '') +
    Object.entries(map).map(([k, v]) => `<option value="${_cqEsc(k)}" ${k === atual ? 'selected' : ''}>${_cqEsc(typeof v === 'string' ? v : v.label)}</option>`).join('');
}
function _cqBadge(map, k, extra) {
  const c = map[k] || {};
  return `<span class="cq-badge ${c.cls || ''}">${_cqEsc(c.label || k || '—')}${extra || ''}</span>`;
}

// Permissão de outro usuário (grupo de acesso), no mesmo formato de authHasPermission ('cq.lancar')
function _cqUserPode(user, key) {
  if (!user) return false;
  if (user.isAdmin) return true;
  const groups = typeof authState !== 'undefined' ? (authState.groups || []) : [];
  let perm = groups.find(g => g.id === user.grupoId)?.permissoes;
  for (const p of key.split('.')) { perm = perm?.[p]; if (perm === undefined || perm === null) return false; }
  return !!perm;
}
// Quem pode responder por registros da unidade: membro da unidade com a permissão `key` (ex.: 'cq.lancar')
function _cqUsuariosDaUnidade(u, keys = ['cq.lancar', 'cq.configurar']) {
  return _cqUsuarios().filter(x => _cqPapel(u, x.id) && keys.some(k => _cqUserPode(x, k)));
}
function _cqUsuarios() {
  const users = typeof authState !== 'undefined' ? (authState.users || []) : [];
  return users.filter(u => u.ativo !== false).sort((a, b) => (a.nomeCompleto || '').localeCompare(b.nomeCompleto || ''));
}
function _cqNomeUsuario(id) {
  const u = (typeof authState !== 'undefined' ? authState.users || [] : []).find(x => x.id === id);
  return u ? (u.nomeCompleto || u.username) : '';
}

// Grava um registro de cadastro inteiro (com trilha) em seu próprio nó
async function _cqSalvarRegistro(colecao, rec) {
  rec.atualizadoEm = _cqAgora();
  const ok = await window.dbUpdate({ [`${CQ_KEYS.config}/${colecao}/${rec.id}`]: rec });
  if (!ok) { showToast('Falha ao gravar. Verifique a conexão e tente novamente.', 'error'); return false; }
  cqState.config[colecao][rec.id] = rec;
  if (colecao === 'insumos' || colecao === 'insumoProdutos') _cqHidratarInsumos();
  return true;
}

// Marca um cadastro como usado em lançamento (bloqueia a exclusão dele)
function _cqMarcarUso(updates, colecao, id) {
  if (id) updates[`${CQ_KEYS.uso}/${colecao}/${id}`] = true;
}

async function _cqProximoNumero(u, tipo) {
  const un = cqState.config.unidades[u];
  const ano = _cqHoje(un?.fuso).slice(0, 4);
  const n = await window.dbTransaction(`${CQ_KEYS.seq}/${u}/${tipo}/${ano}`, v => (Number(v) || 0) + 1);
  if (!n) return null;
  const sig = (un?.sigla || 'UN').toUpperCase();
  return tipo === 'nc' ? `NC-${sig}-${ano}-${String(n).padStart(3, '0')}` : `${sig}-${ano}-${String(n).padStart(6, '0')}`;
}

// Bloqueios gerais para gravações do CQ
function _cqPodeGravar() {
  if (window._dbConnected === false) { showToast('Sem conexão com o banco: lançamentos do CQ ficam bloqueados até a conexão voltar.', 'error'); return false; }
  if (Math.abs(window._dbClockSkewMs || 0) > 5 * 60 * 1000) {
    showToast('O relógio deste computador está desajustado em mais de 5 minutos. Corrija a data/hora do sistema antes de lançar.', 'error');
    return false;
  }
  return true;
}

// ── UNIDADES ─────────────────────────────────────────────────
function _cqUnidadesVisiveis() {
  const me = _cqSess().id;
  return Object.values(cqState.config.unidades)
    .filter(u => u.ativa !== false || _cqIsAdmin())
    .filter(u => _cqIsAdmin() || !!(u.membros && me && u.membros[me]))
    .sort((a, b) => (a.sigla || '').localeCompare(b.sigla || ''));
}
function _cqUnidadeAtivaId() {
  let id = null;
  try { id = localStorage.getItem('cq-unidade-ativa'); } catch (e) { /* sem storage */ }
  const vis = _cqUnidadesVisiveis();
  if (id && vis.some(u => u.id === id)) return id;
  return vis[0]?.id || null;
}
function _cqUnidade() { const id = _cqUnidadeAtivaId(); return id ? cqState.config.unidades[id] : null; }
function _cqGarantirUnidadeAtiva() {
  const id = _cqUnidadeAtivaId();
  try { if (id) localStorage.setItem('cq-unidade-ativa', id); } catch (e) { /* sem storage */ }
}
function cqSetUnidade(id) {
  try { localStorage.setItem('cq-unidade-ativa', id); } catch (e) { /* sem storage */ }
  _cqOuvirAlvos();
  if (typeof _cqLancReset === 'function') _cqLancReset();
  cqRender();
}
function _cqPapel(u, userId) { return cqState.config.unidades[u]?.membros?.[userId || _cqSess().id] || null; }
function _cqPolitica(u) {
  return Object.assign({ liberarAceitosAoSalvar: true, comentarioObrigatorioAlerta: true, reautenticar: true, retroativoHoras: 24 },
    cqState.config.unidades[u || _cqUnidadeAtivaId()]?.politica || {});
}
// Modo de lançamento de corridas: 'lote' (grade com todos os testes do equipamento) ou
// 'fracionada' (o operador adiciona os testes realizados, um a um). Padrão da unidade + exceção por equipamento.
const CQ_MODOS_CORRIDA = { lote: 'Em lote (todos os testes do equipamento)', fracionada: 'Fracionada (adicionar teste a teste)' };
function _cqChaveModoEquip(grupoKey) { return encodeURIComponent(grupoKey || '').replace(/\./g, '%2E'); }
function _cqModoCorrida(u, grupoKey) {
  const pol = _cqPolitica(u);
  const m = (grupoKey && pol.modoCorridaEquip?.[_cqChaveModoEquip(grupoKey)]) || pol.modoCorrida;
  return CQ_MODOS_CORRIDA[m] ? m : 'lote';
}

// ── CONSULTAS DE CADASTRO ────────────────────────────────────
function _cqTestesDaUnidade(u, { incluirInativos = false } = {}) {
  return Object.values(cqState.config.testes).filter(t => t.unidadeId === u && (incluirInativos || t.ativo !== false));
}

// ── UNIDADE × SETOR (hierarquia de org.js) ───────────────────
// A área do CQ (cqState.config.unidades) é vinculada, no próprio formulário dela, a uma unidade do sistema
// (Ativos › Unidades e setores) pelo campo orgUnidadeId; uma unidade pode ter várias áreas, cada uma com os seus setores.
// Sem vínculo (ex.: validação) vale o modelo antigo: lista de setores marcada na unidade do CQ.
function _cqUnidadeOrg(u) {
  const id = cqState.config.unidades[u]?.orgUnidadeId;
  return id && typeof _orgUnidade === 'function' ? _orgUnidade(id) : null;
}
// Ativo pertence à unidade do CQ?
function _cqAtivoNaUnidade(a, u) {
  if (!a || !u) return !!a;
  const org = _cqUnidadeOrg(u);
  if (org) {
    if (_orgUnidadeIdDoAtivo(a) !== org.id) return false;
    // Setores escolhidos na unidade do CQ (vazio = todos os da unidade do sistema)
    const ids = _cqArr(cqState.config.unidades[u]?.orgSetorIds);
    return !ids.length || _orgSetorIdsDoAtivo(a).some(id => ids.includes(id));
  }
  const setores = _cqArr(cqState.config.unidades[u]?.setores);
  if (!setores.length) return true;
  // Nome antigo marcado (ex.: item que virou setor de uma unidade continua valendo pelo id)
  return setores.includes(a.setor) || _orgIdsDeNomes(setores).includes(_orgSetorIdDoAtivo(a));
}
function _cqSetoresDaUnidade(u) {
  const org = _cqUnidadeOrg(u);
  if (!org) return [];
  const ids = _cqArr(cqState.config.unidades[u]?.orgSetorIds);
  return _orgSetores(org.id, { todos: true }).filter(s => !ids.length || ids.includes(s.id));
}
// Setor do teste: o gravado no teste ou, sem ele, o do equipamento
function _cqSetorDoTeste(t) {
  if (!t) return '';
  if (t.setorId) return t.setorId;
  const a = t.ativoId && typeof _ativoById === 'function' ? _ativoById(t.ativoId) : null;
  const s = a ? _orgSetorDoAtivo(a) : null;
  return s && !s.virtual ? s.id : '';
}
function _cqRotuloSetor(id) { return id ? (_orgRotuloSetor(id, { semUnidade: true }) || 'Setor removido') : 'Sem setor'; }
function _cqRotuloSetorAtivo(a) { return (a && _orgRotuloAtivo(a, { semUnidade: true })) || 'Sem setor'; }
// Filtro de setor do CQ, por unidade ('' = todos; '__sem__' = testes sem setor)
function _cqSetorAtivoId(u = _cqUnidadeAtivaId()) {
  if (!u || !_cqSetoresDaUnidade(u).length) return '';
  let id = '';
  try { id = localStorage.getItem('cq-setor-ativo-' + u) || ''; } catch (e) { /* sem storage */ }
  return id === '__sem__' || _cqSetoresDaUnidade(u).some(s => s.id === id) ? id : '';
}
function cqSetSetor(id) {
  const u = _cqUnidadeAtivaId();
  try { if (id) localStorage.setItem('cq-setor-ativo-' + u, id); else localStorage.removeItem('cq-setor-ativo-' + u); } catch (e) { /* sem storage */ }
  if (typeof _cqLancReset === 'function') _cqLancReset();
  _cqCorrCache = null;
  cqRender();
}
function _cqSetorPassa(setorId, filtro) { return !filtro || (filtro === '__sem__' ? !setorId : setorId === filtro); }
function _cqTestePassaSetor(t, filtro = _cqSetorAtivoId()) { return _cqSetorPassa(_cqSetorDoTeste(t), filtro); }
// Testes da unidade que passam no filtro de setor do CQ
function _cqTestesDoFiltro(u, opts) { const f = _cqSetorAtivoId(u); return _cqTestesDaUnidade(u, opts).filter(t => _cqTestePassaSetor(t, f)); }
// Produto de insumo ou material de controle no filtro de setor: usado por teste do setor, ou vinculado
// (analitos ou, sem analitos, equipamentos/sistemas) ao analito ou equipamento de um teste do setor.
// Sem vínculo nenhum: fora do filtro.
function _cqProdutoPassaSetor(p, u, f = _cqSetorAtivoId(u)) {
  if (!f || !p) return true;
  if (_cqArr(p.setorIds).includes(f)) return true;   // setor marcado no cadastro do produto
  const ans = _cqArr(p.analitoIds), eqs = _cqArr(p.equips ?? (typeof _cqEquipsInsumo === 'function' ? _cqEquipsInsumo(p) : []));
  return _cqTestesDaUnidade(u, { incluirInativos: true }).some(t => _cqTestePassaSetor(t, f) && (t.insumoProdutoId === p.id || t.materialId === p.id
    || Object.values(t.controlesQual || {}).some(c => c?.materialId === p.id)
    || (ans.length ? ans.includes(t.analitoId) : eqs.length && _cqMaterialServe({ equips: eqs }, _cqEquipDoTeste(t), t.analitoId))));
}
// Corrida/pendência no setor? Usa os setores gravados (setorIds) ou deriva dos testes
function _cqSetoresDeRegistro(r) {
  if (Array.isArray(r?.setorIds)) return r.setorIds;
  return Object.keys(r?.testes || {}).map(tid => _cqSetorDoTeste(cqState.config.testes[tid]));
}
function _cqRegistroPassaSetor(r, filtro = _cqSetorAtivoId()) {
  if (!filtro) return true;
  const ids = _cqSetoresDeRegistro(r);
  if (!ids.length) return true;   // sem como saber (registro antigo sem testes): não esconde
  return ids.some(id => _cqSetorPassa(id, filtro));
}
function _cqSetoresDosTestes(testeIds) {
  return [...new Set(testeIds.map(tid => _cqSetorDoTeste(cqState.config.testes[tid])))];
}
function _cqAnalito(id) { return cqState.config.analitos[id] || null; }
function _cqNomeTeste(t) {
  const a = _cqAnalito(t?.analitoId);
  if (!a) return t?.analitoNome || 'Analito removido';
  // Qualitativos (ex.: microbiologia) distinguem o meio/insumo controlado pelo campo método
  return _cqTesteQual(t) && t.metodo ? `${a.nome} · ${t.metodo}` : a.nome;
}
// Teste qualitativo ou semiquantitativo (resultado por categoria, sem média/DP)
function _cqTesteQual(t) { const a = _cqAnalito(t?.analitoId); return !!a && a.tipo !== undefined && a.tipo !== 'quantitativo'; }
function _cqControleQual(t, n) { return t?.controlesQual?.[n] || null; }
function _cqRotuloNivel(t, n) {
  const c = _cqControleQual(t, n);
  return _cqTesteQual(t) && c?.rotulo ? c.rotulo : `Nível ${n}`;
}
// Nível do lote de controle usado pelo nível n do teste (em qualitativos cada nível pode vir de um material diferente)
function _cqNivelNoLote(t, n) {
  if (!_cqTesteQual(t)) return Number(n);
  const lote = _cqLoteDoNivel(t, n);
  const c = _cqControleQual(t, n);
  return Number(c?.nivelLote) || Number(_cqArr(lote?.niveis)[0]) || 1;
}
function _cqValidadeLoteTeste(t, n, u, hoje) {
  const lote = _cqLoteDoNivel(t, n);
  return lote ? _cqValidadeLote(lote, _cqNivelNoLote(t, n), u, hoje) : null;
}
// Nível qualitativo sem material (ex.: placa não inoculada no teste de esterilidade)
function _cqNivelSemMaterial(t, n) { return _cqTesteQual(t) && !_cqControleQual(t, n)?.materialId; }
function _cqEquipTeste(t) {
  if (!t) return '—';
  if (!t.ativoId) return t.sistemaAnalitico || 'Bancada / manual';
  const a = typeof _ativoById === 'function' ? _ativoById(t.ativoId) : null;
  return (a?.nome) || t.ativoSnap?.nome || 'Equipamento removido';
}
function _cqGrupoEquip(t) { return t.ativoId ? 'a:' + t.ativoId : 'm:' + (t.sistemaAnalitico || 'Bancada / manual'); }
function _cqNiveisTeste(t) { return _cqArr(t?.niveis).map(Number).filter(n => n > 0).sort((a, b) => a - b); }
function _cqLoteDoNivel(t, nivel) { return t?.lotesAtivos?.[nivel] ? cqState.config.lotesControle[t.lotesAtivos[nivel]] || null : null; }

// ── CADASTROS POR UNIDADE ────────────────────────────────────
// Analitos, materiais, lotes de controle e insumos pertencem a uma ou mais unidades (`unidadeIds`).
// Registro anterior a esta regra (sem unidadeIds) aparece em todas até ser associado.
const CQ_COLECOES_UNIDADE = ['analitos', 'materiais', 'lotesControle', 'insumoProdutos', 'insumos'];
function _cqUnidadesRec(r) { return _cqArr(r?.unidadeIds); }
function _cqSemUnidade(r) { return !!r && !_cqUnidadesRec(r).length; }
function _cqNaUnidade(r, u) { const us = _cqUnidadesRec(r); return !us.length || us.includes(u || _cqUnidadeAtivaId()); }
function _cqDaUnidade(colecao, u) { return Object.values(cqState.config[colecao] || {}).filter(r => _cqNaUnidade(r, u)); }
function _cqSiglasUnidades(ids) { return _cqArr(ids).map(id => cqState.config.unidades[id]?.sigla || '?').join(', '); }
// Selo da lista: sem unidade (pendente) ou as siglas quando o cadastro é compartilhado
function _cqUnidadesTag(r) {
  if (_cqSemUnidade(r)) return ' <span class="cq-badge cq-st-alerta" title="Cadastro sem área: aparece em todas. Associe-o às áreas que o usam.">sem área</span>';
  const us = _cqUnidadesRec(r);
  return us.length > 1 ? ` <span class="cq-badge cq-st-semalvo" title="Compartilhado entre áreas">${_cqEsc(_cqSiglasUnidades(us))}</span>` : '';
}
// Unidades em que testes usam o cadastro (não pode ser desassociado delas)
function _cqUnidadesEmUso(colecao, id) {
  const us = new Set();
  Object.values(cqState.config.testes).forEach(t => {
    const usa = colecao === 'analitos' ? t.analitoId === id
      : colecao === 'materiais' ? (t.materialId === id || Object.values(t.controlesQual || {}).some(c => c?.materialId === id))
      : colecao === 'lotesControle' ? Object.values(t.lotesAtivos || {}).includes(id)
      : colecao === 'insumoProdutos' ? t.insumoProdutoId === id
      : false;
    if (usa) us.add(t.unidadeId);
  });
  if (colecao === 'insumos') Object.entries(cqState.indices || {}).forEach(([u, idx]) => {
    if (Object.values(idx?.ultimo || {}).some(x => x?.lr === id || x?.lk === id)) us.add(u);
  });
  return us;
}
// Campo de unidades dos formulários de cadastro (novo: unidade ativa marcada)
function _cqUnidadesCampoHTML(idCampo, rec, pode, nota, colecao) {
  // Cadastro antigo sem unidade: sugere as unidades em que é usado + a ativa
  const sel = !rec ? [_cqUnidadeAtivaId()].filter(Boolean)
    : _cqSemUnidade(rec) ? [...new Set([...(colecao ? _cqUnidadesEmUso(colecao, rec.id) : []), _cqUnidadeAtivaId()])].filter(Boolean)
    : _cqUnidadesRec(rec);
  const ops = Object.values(cqState.config.unidades).filter(u => u.ativa !== false || sel.includes(u.id))
    .sort((a, b) => (a.sigla || '').localeCompare(b.sigla || ''))
    .map(u => ({ value: u.id, label: `${u.sigla} — ${u.nome}` }));
  return `<div class="form-field"><label class="field-label">Áreas <span class="required">*</span></label>
    ${_cqMultiHTML(idCampo, ops, sel, { placeholder: 'Selecione as áreas que usam este cadastro', disabled: !pode, vazio: 'Nenhuma área cadastrada.' })}
    ${rec && _cqSemUnidade(rec) ? '<div class="cq-nota cq-txt-amarelo">Cadastro antigo sem área: hoje aparece em todas. Confira as áreas sugeridas e salve.</div>' : ''}
    <div class="cq-nota">${nota || 'Só aparece nas listas e nos testes das áreas selecionadas.'}</div></div>`;
}
// Lê e valida o campo; não deixa remover unidade em que testes usam o cadastro
function _cqUnidadesCapturar(idCampo, colecao, antes) {
  const sel = _cqMultiVal(idCampo);
  if (!sel.length) { showToast('Selecione ao menos uma área.', 'error'); return null; }
  if (antes) {
    const fora = [..._cqUnidadesEmUso(colecao, antes.id)].filter(u => !sel.includes(u));
    if (fora.length) { showToast(`Em uso por testes da(s) área(s) ${_cqSiglasUnidades(fora)}: mantenha-a(s) selecionada(s).`, 'error'); return null; }
  }
  return sel;
}
// Cadastro duplicado que existe só em outras unidades: oferece associá-lo à unidade ativa
function _cqOferecerAssociar(colecao, rec, rotulo) {
  const u = _cqUnidadeAtivaId();
  if (!rec || _cqNaUnidade(rec, u)) return false;
  const un = cqState.config.unidades[u];
  _cqPrompt({
    titulo: 'Cadastro já existe', subtitulo: rotulo,
    corpo: `<div class="cq-nota">${_cqEsc(rotulo)} já está cadastrado na(s) área(s) <b>${_cqEsc(_cqSiglasUnidades(_cqUnidadesRec(rec)))}</b>. Para usá-lo também em <b>${_cqEsc(un?.sigla || '')}</b>, associe o cadastro existente a esta área (não cria duplicata).</div>`,
    confirmar: `Associar a ${un?.sigla || 'esta área'}`,
    onConfirm: async () => {
      const unidadeIds = [..._cqUnidadesRec(rec), u];
      const p = `${CQ_KEYS.config}/${colecao}/${rec.id}`;
      const ok = await window.dbUpdate({ [`${p}/unidadeIds`]: unidadeIds, [`${p}/atualizadoEm`]: _cqAgora(),
        [`${p}/trilha/${_cqTk()}`]: _cqTrilhaEntry('edicao', `Associado à área ${un?.sigla || u}`) });
      if (!ok) { showToast('Falha ao gravar. Verifique a conexão.', 'error'); return false; }
      cqState.config[colecao][rec.id] = { ..._cqLoteCru(rec), unidadeIds };
      _cqHidratarInsumos();
      showToast(`Cadastro associado a ${un?.sigla || 'esta área'}.`, 'success');
      cqDrawerClose();
      cqRender();
      return true;
    },
  });
  return true;
}

// Alvo vigente para (teste, lote, nível) num instante (dataHora local)
function _cqAlvoVigente(testeId, loteId, nivel, dataHora) {
  const mapa = cqState.alvos[testeId] || {};
  const lim = dataHora || '9999-12-31T23:59';
  return Object.values(mapa)
    .filter(a => a.loteControleId === loteId && Number(a.nivel) === Number(nivel) && (a.vigenteDesde || '') <= lim && !a.revogado)
    .sort((a, b) => (b.vigenteDesde || '').localeCompare(a.vigenteDesde || '') || (b.criadoEm || '').localeCompare(a.criadoEm || ''))[0] || null;
}

// Validade do lote de controle. Recebimento e abertura de frascos são controlados no sistema
// de estoque; aqui vale a validade do lote. Parâmetros mantidos por compatibilidade.
function _cqValidadeLote(lote, nivel, u, hoje) {
  if (!lote) return null;
  void nivel; void u;
  return CQEngine.validadeEfetiva({ validade: lote.validade }, hoje || _cqHoje());
}

// ── RESULTADOS: CARGA SOB DEMANDA COM CACHE ──────────────────
const _cqResCache = new Map();   // `${u}|${mes}|${t}` → { resKey: resultado expandido }
const _cqResPend  = new Map();

async function cqCarregarResultados(u, mes, t, { forcar = false } = {}) {
  const k = `${u}|${mes}|${t}`;
  if (!forcar && _cqResCache.has(k)) return _cqResCache.get(k);
  if (!forcar && _cqResPend.has(k)) return _cqResPend.get(k);
  const p = window.dbLoad(`${CQ_KEYS.resultados}/${u}/${mes}/${t}`).then(raw => {
    const out = {};
    Object.entries(raw || {}).forEach(([rk, r]) => { if (r && typeof r === 'object') out[rk] = CQEngine.expandirResultado(r, rk); });
    _cqResCache.set(k, out);
    _cqResPend.delete(k);
    return out;
  });
  _cqResPend.set(k, p);
  return p;
}
function _cqResCacheSet(u, mes, t, resKey, expandido) {
  const k = `${u}|${mes}|${t}`;
  if (!_cqResCache.has(k)) return;
  _cqResCache.get(k)[resKey] = expandido;
}
function _cqResCacheInvalidar(u, mes, t) { _cqResCache.delete(`${u}|${mes}|${t}`); }

// Após gravações em lote (importação, exemplo): descarta tudo que as telas guardam em memória
function _cqInvalidarCaches() {
  _cqResCache.clear();
  if (typeof _cqCorrCache !== 'undefined') _cqCorrCache = null;
  if (typeof _cqGraf !== 'undefined') _cqGraf.dados = null;
  if (typeof _cqNcCache !== 'undefined') _cqNcCache = null;
}

// Resultados de um teste num intervalo de meses (lista, em ordem cronológica)
async function cqResultadosPeriodo(u, t, mesDe, mesAte, opts) {
  const meses = CQEngine.mesesEntre(mesDe, mesAte);
  const lotes = await Promise.all(meses.map(m => cqCarregarResultados(u, m, t, opts)));
  return lotes.flatMap(o => Object.values(o)).sort((a, b) => (a.corridaKey || '').localeCompare(b.corridaKey || '') || a.nivel - b.nivel);
}

// Histórico para avaliação das regras (corridas anteriores a `antesDe`)
async function cqHistoricoTeste(u, teste, antesDe, { forcar = false } = {}) {
  const jan = CQEngine.janelaMax(teste.regras || {});
  const mesAtual = CQEngine.mesDe(antesDe);
  let meses = 2, lista = [];
  for (;;) {
    const ms = CQEngine.mesesAnteriores(mesAtual, meses);
    const lotes = await Promise.all(ms.map(m => cqCarregarResultados(u, m, teste.id, { forcar })));
    lista = lotes.flatMap(o => Object.values(o));
    const hist = CQEngine.prepararHistorico(lista, { antesDe, reinicio: teste.reinicioHistorico || null, janelaMax: jan,
      incluirRejeitados: !!teste.opcoesRegras?.incluirRejeitados });
    const corridas = new Set(hist.map(h => h.chave)).size;
    const inicio = teste.inicioUso ? CQEngine.mesDe(teste.inicioUso) : null;
    const maisAntigo = ms[ms.length - 1];
    if (corridas >= jan || meses >= 6 || (inicio && maisAntigo <= inicio)) return hist;
    meses += 2;
  }
}

async function cqCarregarCorridasMes(u, mes) {
  const raw = await window.dbLoad(`${CQ_KEYS.corridas}/${u}/${mes}`);
  const out = {};
  Object.entries(raw || {}).forEach(([k, c]) => { if (c && typeof c === 'object') out[k] = { ...c, key: k, mes }; });
  return out;
}
async function cqCarregarCorrida(u, mes, key) {
  const c = await window.dbLoad(`${CQ_KEYS.corridas}/${u}/${mes}/${key}`);
  return c ? { ...c, key, mes } : null;
}

// ── MENU FLUTUANTE ───────────────────────────────────────────
// Menu solto no <body>, em posição fixa e acima de janelas e painéis (não é cortado por eles).
let _cqFloatAncora = null;
function _cqFloatAbrir(ancora, html, { cls = '', largura = 320 } = {}) {
  let el = document.getElementById('cq-float');
  if (!el) { el = document.createElement('div'); el.id = 'cq-float'; document.body.appendChild(el); }
  el.className = `cq-float ${cls}`;
  el.style.width = `${largura}px`;
  el.innerHTML = html;
  el.style.display = 'flex';
  const r = ancora.getBoundingClientRect();
  const h = el.offsetHeight, w = el.offsetWidth;
  const baixo = r.bottom + 6 + h <= window.innerHeight - 8 || r.top < h + 14;
  el.style.top = `${Math.max(8, baixo ? r.bottom + 6 : r.top - 6 - h)}px`;
  el.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
  _cqFloatAncora = ancora;
}
function _cqFloatFechar() {
  const el = document.getElementById('cq-float');
  if (el) { el.style.display = 'none'; el.innerHTML = ''; }
  _cqFloatAncora = null;
}
function _cqFloatAberto(ancora) { return !!_cqFloatAncora && _cqFloatAncora === ancora && document.getElementById('cq-float')?.style.display !== 'none'; }
document.addEventListener('mousedown', e => {
  const el = document.getElementById('cq-float');
  if (!_cqFloatAncora || !el) return;
  if (!el.contains(e.target) && !_cqFloatAncora.contains(e.target)) _cqFloatFechar();
});
window.addEventListener('scroll', e => { const el = document.getElementById('cq-float'); if (_cqFloatAncora && !(el && el.contains(e.target))) _cqFloatFechar(); }, true);
window.addEventListener('resize', () => { if (_cqFloatAncora) _cqFloatFechar(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && _cqFloatAncora) _cqFloatFechar(); });

// ── SELETOR DE PERÍODO (meses) ───────────────────────────────
// Popover com modos (Geral · Ano inteiro · Intervalo), atalhos opcionais (Mês atual, 3, 6, 12 meses)
// e grade de meses do ano. per: { modo: 'intervalo', de, ate, atalho? } | { modo: 'ano', ano } | { modo: 'geral' }.
// cfg: { get(), set(per), onchange(), modos: ['geral','ano','intervalo'], atalhos: [1,3,6,12], max, rotulo?(per) }
// rotulo: texto do botão no lugar do padrão (o Início usa "Geral" para todos os registros).
const CQ_MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const _cqMp = {};
function _cqMesSoma(yyyymm, n) {
  const d = new Date(Date.UTC(+yyyymm.slice(0, 4), +yyyymm.slice(4, 6) - 1 + n, 1));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
function _cqMesFmt(m) { return `${CQ_MESES_CURTOS[+m.slice(4, 6) - 1]}/${m.slice(0, 4)}`; }
function _cqMesesEntre(de, ate) { return (+ate.slice(0, 4) - +de.slice(0, 4)) * 12 + (+ate.slice(4, 6) - +de.slice(4, 6)) + 1; }
// Período → { de, ate } (yyyymm)
function _cqPerFaixa(per, max) {
  const atual = CQEngine.mesDe(_cqNowLocal());
  if (!per || per.modo === 'geral') return { de: _cqMesSoma(atual, -(max - 1)), ate: atual };
  if (per.modo === 'ano') { const ate = `${per.ano}12` > atual ? atual : `${per.ano}12`; return { de: `${per.ano}01`, ate }; }
  return { de: per.de, ate: per.ate };
}
// Período → lista de meses (do mais recente ao mais antigo), limitada a `max`
function _cqPerMeses(per, max) {
  const { de, ate } = _cqPerFaixa(per, max);
  const out = [];
  for (let m = ate; m >= de && out.length < max; m = _cqMesSoma(m, -1)) out.push(m);
  return out;
}
function _cqPerRotulo(per, max) {
  if (!per || per.modo === 'geral') return `Últimos ${max} meses`;
  if (per.modo === 'ano') return `Ano ${per.ano}`;
  if (per.atalho) return per.atalho === 1 ? 'Mês atual' : `Últimos ${per.atalho} meses`;
  return per.de === per.ate ? _cqMesFmt(per.de) : `${_cqMesFmt(per.de)} – ${_cqMesFmt(per.ate)}`;
}
function _cqMpHTML(id, cfg) {
  // Redesenho com o menu em uso (ex.: Início) mantém o ano exibido e a espera do 2º mês
  const ant = _cqMp[id];
  _cqMp[id] = { modos: ['geral', 'ano', 'intervalo'], atalhos: [], max: 24, ...cfg, ano: ant?.ano ?? null, espera: ant?.espera ?? false };
  const c = _cqMp[id];
  return `<div class="cq-mp" id="${id}">
    <button type="button" class="cq-mp-btn" onclick="cqMpAbrir('${id}')">${CQ_ICO.calendario}<span class="cq-mp-rot" id="${id}-rot">${_cqEsc(_cqMpRotulo(id))}</span>
      <svg class="cq-sitpop-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></button>
    <div class="cq-mp-menu" id="${id}-menu"></div>
  </div>`;
}
function _cqMpRotulo(id) { const c = _cqMp[id]; return c.rotulo ? c.rotulo(c.get()) : _cqPerRotulo(c.get(), c.max); }
function _cqMpMenuHTML(id) {
  const c = _cqMp[id], p = c.get();
  const atual = CQEngine.mesDe(_cqNowLocal());
  const anoAtual = +atual.slice(0, 4);
  if (!c.ano) c.ano = p.modo === 'ano' ? p.ano : p.modo === 'intervalo' ? +p.ate.slice(0, 4) : anoAtual;
  const rotModo = { geral: 'Geral', ano: 'Ano inteiro', intervalo: 'Intervalo' };
  const { de, ate } = _cqPerFaixa(p, c.max);
  const meses = CQ_MESES_CURTOS.map((nome, i) => {
    const m = `${c.ano}${String(i + 1).padStart(2, '0')}`;
    const futuro = m > atual;
    let cls = '';
    if (!futuro && m >= de && m <= ate) cls = p.modo === 'intervalo' && !p.atalho && (m === de || m === ate) ? 'sel' : 'faixa';
    return `<button type="button" class="cq-mp-mes ${cls}${m === atual ? ' hoje' : ''}" ${futuro ? 'disabled' : `onclick="cqMpMes('${id}','${m}')"`}>${nome}</button>`;
  }).join('');
  const dica = p.modo === 'intervalo' && c.espera ? 'Escolha o último mês do intervalo (ou o mesmo, para um mês só)' : _cqMpRotulo(id);
  return `<div class="cq-mp-modos" style="grid-template-columns:repeat(${c.modos.length},1fr)">${c.modos.map(k => `<button type="button" class="${p.modo === k ? 'active' : ''}" onclick="cqMpModo('${id}','${k}')">${rotModo[k]}</button>`).join('')}</div>
    ${c.atalhos.length ? `<div class="cq-mp-atalhos">${c.atalhos.map(n => `<button type="button" class="${p.modo === 'intervalo' && p.atalho === n ? 'active' : ''}" onclick="cqMpAtalho('${id}',${n})">${n === 1 ? 'Mês atual' : `${n} meses`}</button>`).join('')}</div>` : ''}
    <div class="cq-mp-ano"><button type="button" class="cq-mp-nav" onclick="cqMpAnoNav('${id}',-1)" title="Ano anterior"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="15 6 9 12 15 18"/></svg></button>
      <b>${c.ano}</b>
      <button type="button" class="cq-mp-nav" onclick="cqMpAnoNav('${id}',1)" title="Próximo ano" ${c.ano >= anoAtual ? 'disabled' : ''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="9 6 15 12 9 18"/></svg></button></div>
    <div class="cq-mp-grade">${meses}</div>
    <div class="cq-mp-pe${c.espera ? ' espera' : ''}">${_cqEsc(dica)}</div>`;
}
function _cqMpAplicar(id, fechar) {
  const c = _cqMp[id];
  const menu = document.getElementById(id + '-menu');
  if (menu) menu.innerHTML = _cqMpMenuHTML(id);
  const rot = document.getElementById(id + '-rot');
  if (rot) rot.textContent = _cqMpRotulo(id);
  if (fechar) document.getElementById(id)?.classList.remove('aberto');
  c.onchange?.();
}
function cqMpAbrir(id) {
  const el = document.getElementById(id), c = _cqMp[id];
  if (!el || !c) return;
  const abrir = !el.classList.contains('aberto');
  document.querySelectorAll('.cq-sitpop.aberto, .cq-mp.aberto').forEach(x => x.classList.remove('aberto'));
  if (abrir) { c.espera = false; c.ano = null; document.getElementById(id + '-menu').innerHTML = _cqMpMenuHTML(id); }
  el.classList.toggle('aberto', abrir);
}
function cqMpModo(id, k) {
  const c = _cqMp[id];
  const atual = CQEngine.mesDe(_cqNowLocal());
  c.espera = false;
  if (k === 'geral') c.set({ modo: 'geral' });
  else if (k === 'ano') c.set({ modo: 'ano', ano: c.ano || +atual.slice(0, 4) });
  else if (c.get().modo !== 'intervalo') c.set({ modo: 'intervalo', de: atual, ate: atual });
  _cqMpAplicar(id, k !== 'intervalo');
}
function cqMpAtalho(id, n) {
  const c = _cqMp[id];
  const atual = CQEngine.mesDe(_cqNowLocal());
  c.espera = false;
  c.ano = +atual.slice(0, 4);
  c.set({ modo: 'intervalo', de: _cqMesSoma(atual, -(n - 1)), ate: atual, atalho: n });
  _cqMpAplicar(id, true);
}
function cqMpAnoNav(id, d) {
  const c = _cqMp[id];
  const anoAtual = +CQEngine.mesDe(_cqNowLocal()).slice(0, 4);
  c.ano = Math.min(anoAtual, (c.ano || anoAtual) + d);
  if (c.get().modo === 'ano') { c.set({ modo: 'ano', ano: c.ano }); _cqMpAplicar(id, false); }
  else document.getElementById(id + '-menu').innerHTML = _cqMpMenuHTML(id);
}
// Intervalo: 1º clique escolhe um mês (já aplica); 2º clique fecha o intervalo
function cqMpMes(id, m) {
  const c = _cqMp[id], p = c.get();
  if (p.modo === 'intervalo' && c.espera) {
    let de = p.de < m ? p.de : m, ate = p.de < m ? m : p.de;
    if (_cqMesesEntre(de, ate) > c.max) { de = _cqMesSoma(ate, -(c.max - 1)); showToast(`Intervalo limitado a ${c.max} meses.`, 'error'); }
    c.set({ modo: 'intervalo', de, ate });
    c.espera = false;
    _cqMpAplicar(id, true);
    return;
  }
  c.set({ modo: 'intervalo', de: m, ate: m });
  c.espera = true;
  _cqMpAplicar(id, false);
}

// ── ABA PRINCIPAL ────────────────────────────────────────────
function _cqTabAtiva() { return !!document.getElementById('tab-cq')?.classList.contains('active'); }

function _cqHookTab() {
  const tabEl = document.getElementById('tab-cq');
  if (!tabEl) return;
  const obs = new MutationObserver(() => { if (tabEl.classList.contains('active')) _cqInitTab(); });
  obs.observe(tabEl, { attributes: true, attributeFilter: ['class'] });
  if (tabEl.classList.contains('active')) _cqInitTab();
}

function _cqInitTab() {
  const tabEl = document.getElementById('tab-cq');
  if (!tabEl) return;
  if (tabEl.dataset.cqInit !== '1') {
    tabEl.dataset.cqInit = '1';
    tabEl.innerHTML = _cqBuildTabHTML();
  }
  cqRender();
}

const CQ_SUBS = {
  painel:    { label: 'Painel',               ico: 'painel' },
  lancar:    { label: 'Lançar corrida',       ico: 'lancar' },
  corridas:  { label: 'Corridas e liberação', ico: 'lista' },
  graficos:  { label: 'Gráficos e histórico', ico: 'grafico' },
  ncs:       { label: 'Não conformidades',    ico: 'alerta' },
  cadastros: { label: 'Cadastros',            ico: 'cadastro' },
};

function _cqBuildTabHTML() {
  return `
<div class="cq-wrap">
  <aside class="rotina-left-nav cq-left-nav">
    <div class="rotina-nav-label">Controle de Qualidade</div>
    ${Object.entries(CQ_SUBS).map(([k, s]) => `<div class="rotina-nav-item${k === _cqSub ? ' active' : ''}" id="cqnav-${k}" onclick="cqNav('${k}')">${CQ_ICO[s.ico]}${s.label}<span class="cq-subnav-badge" id="cqnav-badge-${k}" style="display:none;"></span></div>`).join('')}
  </aside>
  <div class="cq-content">
    <div class="cq-topbar" id="cq-topbar"></div>
    <div class="cq-body" id="cq-body"></div>
  </div>
</div>`;
}

function cqNav(sub) {
  if (!CQ_SUBS[sub]) return;
  _cqSub = sub;
  document.querySelectorAll('#tab-cq .cq-left-nav .rotina-nav-item').forEach(el => el.classList.toggle('active', el.id === 'cqnav-' + sub));
  cqRender();
}

function cqRender() {
  _cqUpdateNavBadge();
  const body = document.getElementById('cq-body');
  if (!body || !_cqTabAtiva()) return;
  _cqRenderTopbar();
  if (!_cqConfigReady) { body.innerHTML = `<div class="cq-vazio">Carregando…</div>`; return; }
  const un = _cqUnidade();
  if (!un) {
    body.innerHTML = `<div class="cq-vazio cq-vazio-grande">${CQ_ICO.unidade}
      <h3>Nenhuma área de CQ disponível</h3>
      <p>${Object.keys(cqState.config.unidades).length
        ? 'Você não está vinculado a nenhuma área. Peça ao responsável pelo CQ para incluí-lo como membro de uma área.'
        : 'Cadastre a primeira área em Configurações › Controle de Qualidade.'}</p>
      ${_cqCan('configurar') ? `<button class="btn btn-primary" onclick="switchTab('config');setTimeout(()=>switchConfigTab('cq'),50)">${CQ_ICO.plus} Configurar áreas</button>` : ''}
    </div>`;
    return;
  }
  const fn = {
    painel: _cqRenderPainel,
    lancar: typeof cqRenderLancar === 'function' ? cqRenderLancar : null,
    corridas: typeof cqRenderCorridas === 'function' ? cqRenderCorridas : null,
    graficos: typeof cqRenderGraficos === 'function' ? cqRenderGraficos : null,
    ncs: typeof cqRenderNCs === 'function' ? cqRenderNCs : null,
    cadastros: typeof cqRenderCadastros === 'function' ? cqRenderCadastros : null,
  }[_cqSub];
  if (fn) fn(body); else body.innerHTML = '<div class="cq-vazio">Em construção.</div>';
}

// Filtro de setor (em par com a área): só aparece quando a área tem setores na organização.
// Popover com busca; cada setor mostra quantos testes ativos tem na área.
function _cqTopbarSetorHTML(u) {
  const setores = u ? _cqSetoresDaUnidade(u) : [];
  if (!setores.length) return '';
  const f = _cqSetorAtivoId(u);
  const testes = _cqTestesDaUnidade(u);
  const nT = id => testes.filter(t => _cqSetorPassa(_cqSetorDoTeste(t), id)).length;
  const qt = n => `${n} teste${n === 1 ? '' : 's'} ativo${n === 1 ? '' : 's'}`;
  const temSem = testes.some(t => !_cqSetorDoTeste(t));
  const ops = [
    { value: '', label: 'Todos os setores', sub: qt(testes.length) },
    ...setores.map(s => ({ value: s.id, label: s.nome, sub: qt(nT(s.id)) + (s.ativo === false ? ' · inativo' : ''), grupo: 'Setores da área' })),
    ...(temSem || f === '__sem__' ? [{ value: '__sem__', label: 'Sem setor', sub: qt(nT('__sem__')), grupo: 'Setores da área' }] : []),
  ];
  return `<div class="cq-topbar-unidade">
      <span class="cq-topbar-lbl">Setor</span>
      ${_cqSelHTML('cq-top-setor', ops, f, { busca: 'Buscar setor…', onchange: v => cqSetSetor(v) })}
    </div>`;
}

// Opções do seletor de área, agrupadas pela unidade do sistema (uma unidade pode ter várias áreas)
function _cqAreasOpcoes(vis) {
  const SEM = 'Sem unidade vinculada';
  return vis.map(x => {
    const org = _cqUnidadeOrg(x.id);
    const n = _cqTestesDaUnidade(x.id).length;
    return { value: x.id, label: `${x.sigla} — ${x.nome}`, grupo: org ? `${org.sigla} — ${org.nome}` : SEM,
      sub: [`${n} teste${n === 1 ? '' : 's'} ativo${n === 1 ? '' : 's'}`, x.validacao ? 'validação' : '', x.ativa === false ? 'inativa' : ''].filter(Boolean).join(' · ') };
  }).sort((a, b) => (a.grupo === SEM) - (b.grupo === SEM) || a.grupo.localeCompare(b.grupo, 'pt') || a.label.localeCompare(b.label, 'pt'));
}

function _cqRenderTopbar() {
  const el = document.getElementById('cq-topbar');
  if (!el) return;
  const vis = _cqUnidadesVisiveis();
  const u = _cqUnidadeAtivaId();
  const est = _cqEstacao();
  el.innerHTML = `
    <div class="cq-topbar-unidade">
      ${CQ_ICO.unidade}
      <span class="cq-topbar-lbl">Área</span>
      ${vis.length ? _cqSelHTML('cq-top-area', _cqAreasOpcoes(vis), u, { busca: 'Buscar área…', onchange: v => cqSetUnidade(v) }) : '<span class="cq-muted">nenhuma</span>'}
    </div>
    ${_cqTopbarSetorHTML(u)}
    <div class="cq-topbar-estacao ${est ? '' : 'cq-estacao-falta'}" title="Nome desta estação de trabalho (registrado em cada lançamento)" onclick="cqEditarEstacao()">
      ${CQ_ICO.ativo}<span>${est ? _cqEsc(est) : 'Definir estação'}</span>
    </div>
    ${window._dbAmbienteTeste ? '<span class="cq-badge cq-st-rejeitado">AMBIENTE DE TESTE</span>' : ''}
    <div class="cq-spacer"></div>
    ${u && typeof cqAbrirPreparos === 'function' && _cqPodeRegistrarPreparo() ? `<button class="btn btn-outline cq-btn-prep${_cqSub === 'cadastros' && _cqCadTab === 'preparos' ? ' ativo' : ''}" onclick="cqAbrirPreparos()" title="Registrar e acompanhar preparos de reagentes e meios">${CQ_ICO.beaker} Preparos</button>` : ''}
    ${u && _cqCan('lancar') ? `<button class="btn btn-primary" onclick="cqNav('lancar')">${CQ_ICO.plus} Lançar corrida</button>` : ''}`;
}

function cqEditarEstacao() {
  _cqPrompt({
    titulo: 'Estação de trabalho', subtitulo: 'Identifica o computador/local em cada registro (RDC 978, art. 105, II)',
    corpo: `<div class="form-field"><label class="field-label">Nome da estação</label>
      <input type="text" id="cq-prompt-estacao" class="field-input" maxlength="40" value="${_cqEsc(_cqEstacao())}" placeholder="Ex.: BIOQ-01, Bancada hematologia"></div>
      <div class="cq-nota">Gravado apenas neste navegador. Use um nome único por computador.</div>`,
    confirmar: 'Salvar',
    onConfirm: () => {
      const v = _cqVal('cq-prompt-estacao');
      if (!v) { showToast('Informe o nome da estação.', 'error'); return false; }
      try { localStorage.setItem('cq-estacao', v); } catch (e) { showToast('Não foi possível gravar neste navegador.', 'error'); return false; }
      cqRender();
      if (document.getElementById('cpanel-cq')?.classList.contains('active')) cqRenderConfig();
      return true;
    },
  });
}

// ── PAINEL ───────────────────────────────────────────────────
function _cqTesteSemCQHoje(t, ultimo, un) {
  const f = t.frequencia?.tipo || 'diaria';
  const hoje = _cqHoje(un?.fuso);
  const dow = new Date(hoje + 'T12:00:00').getDay();
  const dias = _cqArr(un?.diasOperacao).map(Number);
  if (dias.length && !dias.includes(dow)) return false;
  const ult = (ultimo?.dataHora || '').slice(0, 10);
  if (['diaria', 'por_corrida', 'por_turno'].includes(f)) return ult !== hoje;
  if (f === 'semanal') return !ult || CQEngine.diasEntre(ult, hoje) >= 7;
  if (f === 'quinzenal') return !ult || CQEngine.diasEntre(ult, hoje) >= 15;
  if (f === 'mensal') return !ult || CQEngine.diasEntre(ult, hoje) >= 30;
  return false;
}

function _cqLotesVencendo(u, dias = 30, testes = null) {
  const hoje = _cqHoje();
  const out = [];
  const usados = new Map();
  const ultimo = (cqState.indices[u] || {}).ultimo || {};
  const insumos = new Set();
  (testes || _cqTestesDaUnidade(u)).forEach(t => {
    Object.entries(t.lotesAtivos || {}).forEach(([nivel, lid]) => {
      const nl = _cqNivelNoLote(t, nivel);
      if (!usados.has(lid + '|' + nl)) usados.set(lid + '|' + nl, { lid, nivel: nl });
    });
    // Lotes de meio de cultura, corante ou reagente usados na última corrida do teste
    ['lr', 'lk'].forEach(c => { if (ultimo[t.id]?.[c]) insumos.add(ultimo[t.id][c]); });
  });
  usados.forEach(({ lid, nivel }) => {
    const lote = cqState.config.lotesControle[lid];
    const v = _cqValidadeLote(lote, nivel, u, hoje);
    if (v && v.dataLimite && v.diasRestantes <= dias) out.push({ lote, nivel, v });
  });
  insumos.forEach(id => {
    const ins = cqState.config.insumos[id];
    if (!ins || ins.status === 'encerrado') return;
    const v = CQEngine.validadeEfetiva({ validade: ins.validade }, hoje);
    if (v.dataLimite && v.diasRestantes <= dias) out.push({ insumo: ins, v });
  });
  return out.sort((a, b) => a.v.diasRestantes - b.v.diasRestantes);
}

let _cqPainelAba = 'equip';
function cqPainelAba(k) {
  _cqPainelAba = k;
  const body = document.getElementById('cq-body');
  if (body) _cqRenderPainel(body);
}
function _cqRenderPainel(body) {
  const u = _cqUnidadeAtivaId();
  const un = _cqUnidade();
  const idx = cqState.indices[u] || {};
  const ultimo = idx.ultimo || {};
  const fSetor = _cqSetorAtivoId(u);
  const testes = _cqTestesDoFiltro(u);
  const pend = Object.entries(idx.pendentes || {}).map(([k, p]) => ({ key: k, ...p })).filter(p => _cqRegistroPassaSetor(p, fSetor)).sort((a, b) => (a.dataHora || '').localeCompare(b.dataHora || ''));
  const ncs = Object.entries(idx.ncAbertas || {}).map(([k, n]) => ({ id: k, ...n })).filter(n => !fSetor || !n.testeId || _cqTestePassaSetor(cqState.config.testes[n.testeId], fSetor));
  const ciclosPend = Object.entries(idx.ciclosPendentes || {}).map(([k, p]) => ({ key: k, ...p })).filter(p => _cqRegistroPassaSetor(p, fSetor)).sort((a, b) => (a.dataHora || '').localeCompare(b.dataHora || ''));
  const vencendo = _cqLotesVencendo(u, 30, testes);
  const semHoje = testes.filter(t => _cqTesteSemCQHoje(t, ultimo[t.id], un));
  const provisorios = [];
  testes.filter(t => !_cqTesteQual(t)).forEach(t => _cqNiveisTeste(t).forEach(n => {
    const lid = t.lotesAtivos?.[n];
    const a = lid ? _cqAlvoVigente(t.id, lid, n) : null;
    if (!a || ['fabricante', 'provisorio'].includes(a.origem)) provisorios.push({ t, n, a });
  }));

  const tile = (v, l, cls, onclick) => `<div class="oc-kpi ${cls}" onclick="${onclick}"><div class="oc-kpi-val">${v}</div><div class="oc-kpi-lbl">${l}</div></div>`;
  const kpis = `<div class="oc-kpis cq-kpis">
    ${tile(pend.length, 'Corridas aguardando avaliação', pend.length ? 'oc-kpi-amber' : '', "cqNav('corridas')")}
    ${tile(ncs.length, 'Não conformidades abertas', ncs.length ? 'oc-kpi-red' : '', "cqNav('ncs')")}
    ${tile(semHoje.length, 'Testes sem CQ hoje', semHoje.length ? 'oc-kpi-cyan' : '', "cqNav('lancar')")}
    ${tile(vencendo.length, 'Lotes/frascos vencendo (30 dias)', vencendo.some(x => x.v.vencido) ? 'oc-kpi-red' : vencendo.length ? 'oc-kpi-amber' : '', "cqNav('cadastros')")}
    ${tile(provisorios.length, 'Níveis sem alvo estabelecido', provisorios.length ? 'oc-kpi-amber' : '', "cqCadPendencias()")}
  </div>`;

  // Cartões por equipamento
  const grupos = {};
  testes.forEach(t => { (grupos[_cqGrupoEquip(t)] = grupos[_cqGrupoEquip(t)] || { nome: _cqEquipTeste(t), ativoId: t.ativoId, testes: [] }).testes.push(t); });
  const cards = Object.entries(grupos).sort(([, a], [, b]) => a.nome.localeCompare(b.nome)).map(([gk, g]) => {
    const ativo = g.ativoId && typeof _ativoById === 'function' ? _ativoById(g.ativoId) : null;
    const st = ativo?.statusUso;
    // Mini card por teste: analito, complemento (meio/método), situação da última corrida e data
    const hojeP = _cqHoje(un?.fuso);
    const chips = g.testes.sort((a, b) => _cqNomeTeste(a).localeCompare(_cqNomeTeste(b))).map(t => {
      const ul = ultimo[t.id];
      const sem = _cqTesteSemCQHoje(t, ul, un);
      const an = _cqAnalito(t.analitoId);
      const titulo = an?.nome || _cqNomeTeste(t);
      const compl = _cqTesteQual(t) ? (t.metodo || '') : [t.metodo, an?.unidadeMedida].filter(Boolean).join(' · ');
      let st = 'nenhum', rot = 'Sem registro', tit = 'Sem corrida registrada';
      if (ul) {
        st = ul.decisao === 'R' ? 'rejeitado' : (ul.status || 'aceito');
        rot = CQ_STATUS[st]?.label || st;
        tit = `Última corrida ${_cqFmtDH(ul.dataHora)} · ${rot}${ul.decisao ? '' : ' · aguardando avaliação'}`;
      }
      if (sem) tit += ' · sem CQ hoje';
      const quando = ul ? (ul.dataHora.slice(0, 10) === hojeP ? `hoje ${ul.dataHora.slice(11, 16)}` : _cqFmtDH(ul.dataHora).slice(0, 16).replace(/\/\d{4}/, '')) : 'nunca';
      return `<button type="button" class="cq-tc cq-tc-${st}${sem ? ' sem' : ''}" title="${_cqEsc(tit)} · clique para ver o gráfico" onclick="cqAbrirGrafico('${t.id}')">
        <div class="cq-tc-top"><span class="cq-tc-nome">${_cqEsc(titulo)}</span><span class="cq-tc-st"><i></i>${_cqEsc(rot)}</span></div>
        ${compl ? `<div class="cq-tc-sub">${_cqEsc(compl)}</div>` : ''}
        <div class="cq-tc-pe"><span>${CQ_ICO.clock}${_cqEsc(quando)}</span>${ul && !ul.decisao ? '<span class="cq-tc-tag aguarda">aguardando</span>' : ''}${sem ? '<span class="cq-tc-tag">sem CQ hoje</span>' : ''}</div>
      </button>`;
    }).join('');
    return `<div class="cq-equip-card">
      <div class="cq-equip-head">
        <div class="cq-equip-ico">${CQ_ICO.ativo}</div>
        <div style="min-width:0;flex:1;"><div class="cq-equip-nome">${_cqEsc(g.nome)}</div>
          <div class="cq-equip-sub">${g.testes.length} teste${g.testes.length !== 1 ? 's' : ''}${st === 'em_pausa' ? ' · <span class="cq-txt-amarelo">em pausa (verificação)</span>' : st === 'em_desuso' ? ' · em desuso' : ''}</div></div>
        ${_cqCan('lancar') ? `<button class="btn btn-outline btn-sm" onclick="cqLancarPara('${_cqEsc(gk)}')">${CQ_ICO.lancar} Lançar</button>` : ''}
      </div>
      <div class="cq-tc-grid">${chips}</div>
    </div>`;
  }).join('');

  const listaPend = pend.slice(0, 8).map(p => `<div class="cq-pend-item" onclick="cqAbrirCorrida('${p.mes || CQEngine.mesDe(p.key)}','${p.key}')">
      <span class="cq-dot ${p.temRejeicao ? 'cq-dot-vermelho' : 'cq-dot-amarelo'}"></span>
      <div style="flex:1;min-width:0;"><div class="cq-pend-tit">${_cqEsc(p.numero || p.key)} · ${_cqEsc(p.equipNome || '')}</div>
      <div class="cq-pend-sub">${_cqFmtDH(p.dataHora)} · ${p.nPend || 0} teste(s) aguardando${p.temRejeicao ? ' · com rejeição' : ''}</div></div></div>`).join('');
  const listaVenc = vencendo.slice(0, 8).map(x => {
    if (x.insumo) {
      return `<div class="cq-pend-item" onclick="cqNav('cadastros')"><span class="cq-dot ${x.v.vencido ? 'cq-dot-vermelho' : 'cq-dot-amarelo'}"></span>
      <div style="flex:1;min-width:0;"><div class="cq-pend-tit">${_cqEsc(x.insumo.nome)} · lote ${_cqEsc(x.insumo.lote)}</div>
      <div class="cq-pend-sub">${x.v.vencido ? 'Vencido' : `Vence em ${x.v.diasRestantes} dia(s)`} (${_cqEsc(CQ_TIPOS_INSUMO[x.insumo.tipo] || 'insumo')}: ${_cqFmtData(x.v.dataLimite)})</div></div></div>`;
    }
    const mat = cqState.config.materiais[x.lote.materialId];
    return `<div class="cq-pend-item" onclick="cqNav('cadastros')"><span class="cq-dot ${x.v.vencido ? 'cq-dot-vermelho' : 'cq-dot-amarelo'}"></span>
      <div style="flex:1;min-width:0;"><div class="cq-pend-tit">${_cqEsc(mat?.nome || 'Material')} · lote ${_cqEsc(x.lote.lote)} · nível ${x.nivel}</div>
      <div class="cq-pend-sub">${x.v.vencido ? 'Vencido' : `Vence em ${x.v.diasRestantes} dia(s)`} (${x.v.motivo === 'estabilidade' ? 'estabilidade após abertura' : 'validade'}: ${_cqFmtData(x.v.dataLimite)})</div></div></div>`;
  }).join('');

  // Seções do painel em subabas: equipamentos, preparos (cq-trocas.js), controles e insumos
  const fn = f => (typeof window[f] === 'function' ? window[f](u) : '');
  const secPrep = fn('_cqPainelPreparosHTML'), secCtl = fn('_cqPainelControlesHTML'), secIns = fn('_cqPainelInsumosHTML');
  const equipamentos = `${cards || `<div class="cq-vazio">Nenhum teste cadastrado ${fSetor ? 'neste setor' : 'nesta área'}. ${_cqCan('configurar') ? `<a href="#" onclick="cqNav('cadastros');return false;">Cadastrar testes</a>` : ''}</div>`}
      ${cards ? '<div class="cq-tc-legenda"><span class="cq-tc-leg aceito"><i></i>Aceito</span><span class="cq-tc-leg alerta"><i></i>Alerta / sem alvo</span><span class="cq-tc-leg rejeitado"><i></i>Rejeitado</span><span class="cq-tc-leg nenhum"><i></i>Sem registro</span><span class="cq-tc-tag">sem CQ hoje</span></div>' : ''}`;
  // contagem das abas: números destacados (vermelho/amarelo/ciano) dos quadros da seção
  const alertas = html => {
    let red = 0, amb = 0;
    html.replace(/cq-pp-stat (vermelho|amarelo|ciano)"[^>]*><b>(\d+)<\/b>/g, (_, c, v) => { c === 'vermelho' ? red += +v : amb += +v; return _; });
    return { red, amb };
  };
  const rejeitados = testes.filter(t => { const ul = ultimo[t.id]; return ul && (ul.decisao === 'R' || ul.status === 'rejeitado'); }).length;
  const abas = [
    { k: 'equip', l: `Equipamentos e testes`, html: equipamentos, n: { red: rejeitados, amb: semHoje.length } },
    secPrep && { k: 'prep', l: 'Preparos', html: secPrep, n: alertas(secPrep) },
    secCtl && { k: 'ctl', l: 'Controles e materiais', html: secCtl, n: alertas(secCtl) },
    secIns && { k: 'ins', l: 'Reagentes e insumos', html: secIns, n: alertas(secIns) },
  ].filter(Boolean);
  if (!abas.some(a => a.k === _cqPainelAba)) _cqPainelAba = cards || abas.length === 1 ? 'equip' : abas[1].k;
  const ativa = abas.find(a => a.k === _cqPainelAba);
  const badge = n => n.red ? `<span class="cq-pab-n red">${n.red}</span>` : n.amb ? `<span class="cq-pab-n amb">${n.amb}</span>` : '';
  const abasHTML = `<div class="cq-pabas" role="tablist">${abas.map(a => `<button type="button" role="tab" class="cq-paba${a.k === _cqPainelAba ? ' on' : ''}" onclick="cqPainelAba('${a.k}')">${a.l}${badge(a.n)}</button>`).join('')}
    <span class="cq-pabas-ctx">${_cqEsc(un.sigla)}${fSetor ? ' · ' + _cqEsc(_cqRotuloSetor(fSetor === '__sem__' ? '' : fSetor)) : ''}</span></div>`;
  body.innerHTML = `
  ${kpis}
  <div class="cq-painel-grid">
    <div class="cq-painel-main">
      ${abasHTML}
      <div class="cq-paba-corpo cq-paba-${ativa.k}">${ativa.html}</div>
    </div>
    <div class="cq-painel-side">
      ${ciclosPend.length ? `<div class="cq-card"><div class="cq-card-tit">${CQ_ICO.clock} Ciclos de esterilização em análise</div>
        ${ciclosPend.slice(0, 8).map(p => `<div class="cq-pend-item" onclick="cqAbrirCorrida('${p.mes || CQEngine.mesDe(p.key)}','${p.key}')">
          <span class="cq-dot cq-dot-amarelo"></span>
          <div style="flex:1;min-width:0;"><div class="cq-pend-tit">${_cqEsc(p.lote || p.numero || p.key)} · ${_cqEsc(p.equipNome || '')}</div>
          <div class="cq-pend-sub">${_cqFmtDH(p.dataHora)}${p.programa ? ' · ' + _cqEsc(p.programa) : ''} · ${_cqArr(p.faltam).length ? 'aguardando ' + _cqEsc(_cqArr(p.faltam).join(', ')) : 'aguardando indicadores'}</div></div></div>`).join('')}
        ${ciclosPend.length > 8 ? `<div class="cq-muted" style="font-size:12px;">+${ciclosPend.length - 8} ciclo(s)</div>` : ''}</div>` : ''}
      <div class="cq-card"><div class="cq-card-tit">Aguardando avaliação</div>${listaPend || '<div class="cq-vazio-p">Nenhuma corrida pendente.</div>'}
        ${pend.length > 8 ? `<a href="#" class="cq-link" onclick="cqNav('corridas');return false;">Ver todas (${pend.length})</a>` : ''}</div>
      <div class="cq-card"><div class="cq-card-tit">Lotes e frascos</div>${listaVenc || '<div class="cq-vazio-p">Nenhum vencimento nos próximos 30 dias.</div>'}</div>
      ${provisorios.length ? `<div class="cq-card"><div class="cq-card-tit">Alvos provisórios ou ausentes</div>
        ${provisorios.slice(0, 8).map(p => `<div class="cq-pend-item" onclick="cqAbrirAlvos('${p.t.id}')"><span class="cq-dot cq-dot-amarelo"></span>
          <div style="flex:1;min-width:0;"><div class="cq-pend-tit">${_cqEsc(_cqNomeTeste(p.t))} · nível ${p.n}</div>
          <div class="cq-pend-sub">${_cqEsc(_cqEquipTeste(p.t))} · ${p.a ? (p.a.origem === 'fabricante' ? 'faixa do fabricante' : `provisório (n=${p.a.nPontos || '?'})`) : (p.t.lotesAtivos?.[p.n] ? 'sem alvo' : 'sem lote de controle')}</div></div></div>`).join('')}</div>` : ''}
    </div>
  </div>`;
}

// ── NAV BADGE E CARD DA INÍCIO ───────────────────────────────
function _cqContagens() {
  const me = _cqSess().id;
  let pend = 0, ncs = 0, rej = 0;
  _cqUnidadesVisiveis().forEach(u => {
    const idx = cqState.indices[u.id] || {};
    const p = Object.values(idx.pendentes || {});
    pend += p.length;
    rej += p.filter(x => x.temRejeicao).length;
    ncs += Object.keys(idx.ncAbertas || {}).length;
  });
  return { pend, ncs, rej, me };
}

function _cqUpdateNavBadge() {
  const el = document.getElementById('cq-nav-badge');
  if (!el) return;
  const k = _cqContagens();
  const tr = typeof _cqTrocasAlertasTodas === 'function' ? _cqTrocasAlertasTodas() : [];
  const n = k.pend + k.ncs + tr.length;
  el.style.display = n > 0 ? '' : 'none';
  el.textContent = n;
  el.classList.toggle('critica', k.rej > 0 || tr.some(a => a.tipo === 'danger'));
  el.title = `${k.pend} corrida(s) aguardando avaliação · ${k.ncs} NC aberta(s)${tr.length ? ` · ${tr.length} troca(s) de preparo` : ''}`;
  const b1 = document.getElementById('cqnav-badge-corridas');
  if (b1) { b1.style.display = k.pend ? '' : 'none'; b1.textContent = k.pend; }
  const b2 = document.getElementById('cqnav-badge-ncs');
  if (b2) { b2.style.display = k.ncs ? '' : 'none'; b2.textContent = k.ncs; }
}

// periodo: { inicio, fim, label } do filtro do Início (vazios = Geral)
function cqRenderHomeCard(periodo) {
  if (!_cqConfigReady || !(typeof authCanViewTab !== 'function' || authCanViewTab('cq'))) return '';
  const unidades = _cqUnidadesVisiveis().filter(u => !u.validacao);
  if (!unidades.length) return '';
  let pend = 0, ncs = 0, sem = 0, venc = 0, rej = 0, vencido = false;
  const linhas = unidades.map(un => {
    const idx = cqState.indices[un.id] || {};
    const p = Object.values(idx.pendentes || {});
    const n = Object.keys(idx.ncAbertas || {}).length;
    const s = _cqTestesDaUnidade(un.id).filter(t => _cqTesteSemCQHoje(t, (idx.ultimo || {})[t.id], un)).length;
    const vl = _cqLotesVencendo(un.id, 30);
    const v = vl.length;
    if (vl.some(x => x.v.vencido)) vencido = true;
    pend += p.length; ncs += n; sem += s; venc += v; rej += p.filter(x => x.temRejeicao).length;
    return { un, p: p.length, n, s, v };
  });
  const tile = (v, l, cls, acao = "switchTab('cq')") => `<div class="oc-hk ${cls}" onclick="${acao}"><div class="oc-hk-v">${v}</div><div class="oc-hk-l">${l}</div></div>`;
  // Trocas de preparo: só aparece quando algum produto da unidade tem "Avisar a troca"
  const comAviso = unidades.some(un => _cqDaUnidade('insumoProdutos', un.id).some(p => p.ativo !== false && p.preparo?.avisoDias != null));
  const trocas = comAviso && typeof _cqTrocasAlertasTodas === 'function' ? _cqTrocasAlertasTodas().filter(a => unidades.some(un => un.id === a.u)) : [];
  const trU = trocas[0]?.u || '';

  // Listas para agir, de todas as Áreas visíveis (com a sigla quando há mais de uma)
  const LIM = 6;
  const multi = unidades.length > 1;
  const sig = (un) => multi ? `<b class="cq-home-sig">${_cqEsc(un.sigla)}</b>` : '';
  const hojeMs = Date.now();
  const pendList = unidades.flatMap(un => Object.entries((cqState.indices[un.id] || {}).pendentes || {}).map(([key, p]) => ({ un, key, ...p })))
    .sort((a, b) => (b.temRejeicao - a.temRejeicao) || (a.dataHora || '').localeCompare(b.dataHora || ''));
  const ncList = unidades.flatMap(un => Object.entries((cqState.indices[un.id] || {}).ncAbertas || {}).map(([id, n]) => ({ un, id, ...n })))
    .sort((a, b) => (a.abertaEm || '').localeCompare(b.abertaEm || ''));
  const vencList = unidades.flatMap(un => _cqLotesVencendo(un.id, 30).map(x => ({ un, ...x })))
    .sort((a, b) => a.v.diasRestantes - b.v.diasRestantes);
  const item = (cor, titulo, sub, acao) => `<div class="home-notif-item" onclick="${acao}">
      <div class="home-notif-dot" style="background:${cor}"></div>
      <div class="home-notif-content"><div class="home-notif-title">${titulo}</div><div class="home-notif-meta">${sub}</div></div>
    </div>`;
  const vazio = (t) => `<div class="home-notif-empty"><span>${t}</span></div>`;
  const listaCard = (titulo, n, corpo, acao) => `<div class="home-chart-card home-lista-card">
      <div class="home-chart-header">
        <span class="home-chart-title">${titulo}<span class="home-chart-badge">${n}</span></span>
        ${n > LIM ? `<button type="button" class="hup-toggle-btn" onclick="${acao}">Ver todas</button>` : ''}
      </div>
      <div class="home-notif-body">${corpo}</div>
    </div>`;
  const listaPend = pendList.slice(0, LIM).map(p => item(p.temRejeicao ? '#e63946' : '#f4a261',
    `${sig(p.un)}${_cqEsc(p.numero || 'Corrida')} · ${_cqEsc(p.equipNome || '')}`,
    `${_cqFmtDH(p.dataHora)} · ${p.nPend || 0} teste(s) aguardando${p.temRejeicao ? ' · com rejeição' : ''}`,
    `cqHomeAbrir('${p.un.id}','corrida','${p.mes || CQEngine.mesDe(p.key)}','${p.key}')`)).join('');
  const listaNc = ncList.slice(0, LIM).map(n => {
    const t = cqState.config.testes[n.testeId];
    const dias = n.abertaEm ? Math.max(0, Math.floor((hojeMs - new Date(n.abertaEm).getTime()) / 864e5)) : null;
    return item('#e63946', `${sig(n.un)}${_cqEsc(n.numero || 'NC')}${t ? ' · ' + _cqEsc(_cqNomeTeste(t)) : ''}`,
      dias === null ? 'Aberta' : `Aberta há ${dias} dia(s)`, `cqHomeAbrir('${n.un.id}','ncs')`);
  }).join('');
  const listaVenc = vencList.slice(0, LIM).map(x => {
    const nome = x.insumo ? `${_cqEsc(x.insumo.nome)} · lote ${_cqEsc(x.insumo.lote)}`
      : `${_cqEsc(cqState.config.materiais[x.lote.materialId]?.nome || 'Material')} · lote ${_cqEsc(x.lote.lote)} · nível ${x.nivel}`;
    return item(x.v.vencido ? '#e63946' : '#f4a261', `${sig(x.un)}${nome}`,
      `${x.v.vencido ? 'Vencido' : `Vence em ${x.v.diasRestantes} dia(s)`} · ${_cqFmtData(x.v.dataLimite)}`, `cqHomeAbrir('${x.un.id}','cadastros')`);
  }).join('');
  const listas = `<div class="home-cols-3">
    ${listaCard('Corridas aguardando avaliação', pendList.length, listaPend || vazio('Nenhuma corrida pendente'), "cqHomeAbrir('','corridas')")}
    ${listaCard('Não conformidades abertas', ncList.length, listaNc || vazio('Nenhuma NC aberta'), "cqHomeAbrir('','ncs')")}
    ${listaCard('Lotes vencendo (30 dias)', vencList.length, listaVenc || vazio('Nenhum lote vencendo'), "cqHomeAbrir('','cadastros')")}
  </div>`;

  return `<div class="home-cols home-cols-larga cq-home-topo"><div class="home-chart-card oc-home-card cq-home-card">
    <div class="home-chart-header">
      <span class="home-chart-title">Indicadores</span>
      <button type="button" class="hup-toggle-btn" onclick="switchTab('cq')">Abrir CQ</button>
    </div>
    <div class="oc-hk-row${comAviso ? ' cq-hk-5' : ''}">
      ${tile(pend, 'Corridas aguardando avaliação', rej ? 'red' : pend ? 'amber' : '', "cqHomeAbrir('','corridas')")}
      ${tile(ncs, 'Não conformidades abertas', ncs ? 'red' : '', "cqHomeAbrir('','ncs')")}
      ${tile(sem, 'Testes sem CQ hoje', sem ? 'cyan' : '', "cqHomeAbrir('','lancar')")}
      ${tile(venc, 'Lotes vencendo (30 dias)', vencido ? 'red' : venc ? 'amber' : '', "cqHomeAbrir('','cadastros')")}
      ${comAviso ? tile(trocas.length, 'Trocas de preparo vencendo', trocas.some(a => a.tipo === 'danger') ? 'red' : trocas.length ? 'amber' : '', `cqAbrirTrocaAlerta('${trU}')`) : ''}
    </div>
    ${linhas.length > 1 ? `<div class="cq-home-unidades">${linhas.map(l => `<div class="cq-home-un"><b>${_cqEsc(l.un.sigla)}</b><span>${l.p} pend.</span><span>${l.n} NC</span><span>${l.s} sem CQ</span></div>`).join('')}</div>` : ''}
  </div>
  ${_cqHomeRegistros(unidades, periodo || {})}</div>
  ${listas}`;
}

// ── INÍCIO: lançamentos do período e cadastros (respeita período e filtro de setores) ──
// As corridas ficam por mês no banco e não são escutadas: são lidas só para contar, uma vez por
// combinação de áreas × meses, e a cópia é descartada quando os índices mudam (corrida nova ou avaliada).
let _cqHomeCorr = null;   // { chave, corridas: [] | null }
function _cqHomeMeses(inicio, fim) {
  const ate = CQEngine.mesDe(fim || _cqHoje());
  const de = inicio ? CQEngine.mesDe(inicio) : _cqMesSoma(ate, -11);
  const out = [];
  for (let m = ate; m >= de && out.length < 24; m = _cqMesSoma(m, -1)) out.push(m);
  return out;
}
function _cqHomeCorridas(unidades, meses) {
  const chave = unidades.map(u => u.id).join(',') + '|' + meses.join(',');
  if (_cqHomeCorr?.chave === chave) return _cqHomeCorr.corridas;
  _cqHomeCorr = { chave, corridas: null };
  Promise.all(unidades.flatMap(un => meses.map(m => cqCarregarCorridasMes(un.id, m))))
    .then(partes => {
      if (_cqHomeCorr?.chave !== chave) return;
      _cqHomeCorr.corridas = partes.flatMap(o => Object.values(o));
      if (typeof renderHome === 'function' && document.getElementById('tab-inicio')?.classList.contains('active')) renderHome();
    })
    .catch(() => { if (_cqHomeCorr?.chave === chave) _cqHomeCorr = null; });
  return null;
}
function _cqHomeRegistros(unidades, { inicio = '', fim = '', label = '', ativa = true }) {
  // Filtro de unidades/setores da barra do topo (mesma regra do Início: sem setor conhecido, não esconde)
  const vis = typeof _getFilteredSetores === 'function' ? _getFilteredSetores() : null;
  const passaSetores = (ids) => { const v = ids.filter(Boolean); return !vis || !v.length || v.some(id => vis.includes(id)); };
  const noPeriodo = (d) => !d || ((!inicio || d >= inicio) && (!fim || d <= fim));
  const geral = !inicio && !fim;

  // Só lê o banco com a aba do CQ aberta no Início (fora dela o card nem aparece)
  const corridas = ativa ? _cqHomeCorridas(unidades, _cqHomeMeses(inicio, fim)) : null;
  let nCorr = '…', nLib = '…', nRej = 0;
  if (corridas) {
    const doPeriodo = corridas.filter(c => noPeriodo((c.dataHora || '').slice(0, 10)) && passaSetores(_cqSetoresDeRegistro(c)));
    const st = c => c.status || _cqStatusCorrida(c);
    nCorr = doPeriodo.length;
    nLib = doPeriodo.filter(c => ['liberada', 'parcial'].includes(st(c))).length;
    nRej = doPeriodo.filter(c => st(c) === 'rejeitada').length;
  }

  // Cadastros ativos das áreas visíveis (um cadastro compartilhado conta uma vez)
  const uniao = (col, filtro) => { const m = new Map(); unidades.forEach(un => _cqDaUnidade(col, un.id).filter(filtro).forEach(r => m.set(r.id, r))); return [...m.values()]; };
  const ativo = r => r.ativo !== false;
  const testes = unidades.flatMap(un => _cqTestesDaUnidade(un.id));
  const nAnalitos = uniao('analitos', ativo).filter(a => {
    const ts = testes.filter(t => t.analitoId === a.id);
    return !ts.length || ts.some(t => passaSetores([_cqSetorDoTeste(t)]));
  }).length;
  const nControles = uniao('materiais', ativo).length;
  const nReagentes = uniao('insumoProdutos', ativo).length + uniao('insumos', i => !_cqProdutoInsumo(i) && i.status !== 'encerrado').length;
  const nPreparos = typeof _cqPrepAbaItens === 'function'
    ? unidades.flatMap(un => _cqPrepAbaItens(un.id)).filter(x => x.p.data && noPeriodo(x.p.data.slice(0, 10))).length : 0;

  const t = (v, l, acao, sub) => `<button type="button" class="cq-reg-item" onclick="${acao}"><span class="cq-reg-v">${v}</span><span class="cq-reg-l">${l}</span>${sub ? `<span class="cq-reg-sub">${sub}</span>` : ''}</button>`;
  return `<div class="home-chart-card cq-home-reg">
    <div class="home-chart-header">
      <span class="home-chart-title">Registros</span>
      <span class="home-chart-sub">${_cqEsc(label || 'Geral')}${geral ? ' · 12 meses' : ''}</span>
    </div>
    <div class="cq-reg-corpo">
      <div class="cq-reg-sec">Lançamentos</div>
      <div class="cq-reg-grid">
        ${t(nCorr, 'Corridas', "cqHomeAbrir('','corridas')")}
        ${t(nLib, 'Liberações', "cqHomeAbrir('','corridas')", nRej ? `${nRej} rejeitada(s)` : '')}
      </div>
      <div class="cq-reg-sec">Cadastros</div>
      <div class="cq-reg-grid">
        ${t(nAnalitos, 'Analitos', "cqHomeCad('analitos')")}
        ${t(nControles, 'Controles', "cqHomeCad('materiais')")}
        ${t(nReagentes, 'Reagentes', "cqHomeCad('insumos')")}
        ${t(nPreparos, 'Preparos', "cqHomeCad('preparos')", 'no período')}
      </div>
    </div>
  </div>`;
}
function cqHomeCad(aba) {
  if (typeof switchTab === 'function') switchTab('cq');
  _cqCadTab = aba;
  _cqCadExp.clear();
  cqNav('cadastros');
}

// Atalhos do Início: abre o CQ na Área do item (u vazio mantém a Área ativa) e vai ao destino
function cqHomeAbrir(u, destino, mes, key) {
  if (typeof switchTab === 'function') switchTab('cq');
  if (u && u !== _cqUnidadeAtivaId() && _cqUnidadesVisiveis().some(x => x.id === u)) cqSetUnidade(u);
  if (destino === 'corrida') { cqNav('corridas'); cqAbrirCorrida(mes, key); }
  else cqNav(destino);
}

// ── MODAIS GENÉRICOS ─────────────────────────────────────────
function _cqInjectModals() {
  const div = document.createElement('div');
  div.innerHTML = `
<div class="ot-form-drawer cq-drawer" id="cq-drawer">
  <div class="drawer-header">
    <div class="drawer-header-icon" id="cq-drawer-ico" style="color:var(--cyan);">${CQ_ICO.beaker}</div>
    <div style="flex:1;min-width:0;"><div class="drawer-title" id="cq-drawer-title"></div><div class="drawer-subtitle" id="cq-drawer-sub"></div></div>
    <button class="modal-close" onclick="cqDrawerClose()">${CQ_ICO.close}</button>
  </div>
  <div class="drawer-body cq-drawer-body" id="cq-drawer-body"></div>
  <div class="drawer-footer" id="cq-drawer-foot"></div>
</div>

<div class="modal-overlay modal-ot-view cq-modal" id="cq-modal">
  <div class="modal wide">
    <div class="modal-header">
      <div class="modal-header-left">
        <div class="modal-header-icon" id="cq-modal-ico" style="color:var(--cyan);">${CQ_ICO.beaker}</div>
        <div><div class="modal-title" id="cq-modal-title"></div><div class="modal-subtitle" id="cq-modal-sub"></div></div>
      </div>
      <button class="modal-close" onclick="cqModalClose()">${CQ_ICO.close}</button>
    </div>
    <div class="modal-body cq-modal-body" id="cq-modal-body"></div>
    <div class="modal-footer cq-modal-foot" id="cq-modal-foot"></div>
  </div>
</div>

<div class="modal-overlay modal-ot-sm cq-prompt" id="cq-prompt">
  <div class="modal">
    <div class="modal-header">
      <div class="modal-header-left">
        <div class="modal-header-icon" style="color:var(--cyan);">${CQ_ICO.shield}</div>
        <div><div class="modal-title" id="cq-prompt-title"></div><div class="modal-subtitle" id="cq-prompt-sub"></div></div>
      </div>
      <button class="modal-close" onclick="cqPromptClose()">${CQ_ICO.close}</button>
    </div>
    <div class="modal-body" id="cq-prompt-body"></div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="cqPromptClose()">Voltar</button>
      <button class="btn btn-primary" id="cq-prompt-ok" onclick="cqPromptConfirmar()"></button>
    </div>
  </div>
</div>`;
  document.body.appendChild(div);
}

function cqDrawerOpen({ titulo, subtitulo, corpo, rodape, icone, cor }) {
  delete document.getElementById('cq-drawer-title').dataset.teste;
  document.getElementById('cq-drawer-title').textContent = titulo || '';
  document.getElementById('cq-drawer-sub').textContent = subtitulo || '';
  const ico = document.getElementById('cq-drawer-ico');
  ico.innerHTML = CQ_ICO[icone] || CQ_ICO.beaker;
  ico.style.color = cor || 'var(--cyan)';
  document.getElementById('cq-drawer-body').innerHTML = corpo || '';
  document.getElementById('cq-drawer-foot').innerHTML = rodape || '';
  otOpenModal('cq-drawer');
}
function cqDrawerClose() { otCloseModal('cq-drawer'); }

function cqModalOpen({ titulo, subtitulo, corpo, rodape, icone, cor, largura }) {
  const caixa = document.querySelector('#cq-modal .modal');
  if (caixa) caixa.style.maxWidth = largura || '';
  document.getElementById('cq-modal-title').textContent = titulo || '';
  document.getElementById('cq-modal-sub').textContent = subtitulo || '';
  const ico = document.getElementById('cq-modal-ico');
  ico.innerHTML = CQ_ICO[icone] || CQ_ICO.beaker;
  ico.style.color = cor || 'var(--cyan)';
  document.getElementById('cq-modal-body').innerHTML = corpo || '';
  document.getElementById('cq-modal-foot').innerHTML = rodape || '';
  otOpenModal('cq-modal');
}
function cqModalClose() { otCloseModal('cq-modal'); }

// Prompt genérico: onConfirm retorna true (ou Promise<true>) para fechar
function _cqPrompt({ titulo, subtitulo, corpo, confirmar, perigo, onConfirm, largo }) {
  document.getElementById('cq-prompt')?.classList.toggle('cq-prompt-largo', !!largo);
  document.getElementById('cq-prompt-title').textContent = titulo || '';
  document.getElementById('cq-prompt-sub').textContent = subtitulo || '';
  document.getElementById('cq-prompt-body').innerHTML = corpo || '';
  const ok = document.getElementById('cq-prompt-ok');
  ok.textContent = confirmar || 'Confirmar';
  ok.className = 'btn ' + (perigo ? 'btn-danger cq-btn-perigo' : 'btn-primary');
  ok.disabled = false;
  _cqPromptCb = onConfirm;
  otOpenModal('cq-prompt');
  setTimeout(() => document.querySelector('#cq-prompt-body input:not([type=hidden]), #cq-prompt-body textarea, #cq-prompt-body select')?.focus(), 80);
}
async function cqPromptConfirmar() {
  const ok = document.getElementById('cq-prompt-ok');
  if (!_cqPromptCb || ok.disabled) return;
  ok.disabled = true;
  try {
    const fechar = await _cqPromptCb();
    if (fechar) cqPromptClose();
  } finally { ok.disabled = false; }
}
function cqPromptClose() { otCloseModal('cq-prompt'); _cqPromptCb = null; }

// Reautenticação para assinaturas críticas (política da unidade)
function _cqReautenticar(motivo) {
  return new Promise(resolve => {
    if (!_cqPolitica().reautenticar || typeof authVerifyCurrentPassword !== 'function') { resolve(true); return; }
    let resolvido = false;
    _cqPrompt({
      titulo: 'Confirme sua identidade', subtitulo: motivo || 'Assinatura eletrônica',
      corpo: `<div class="form-field"><label class="field-label">Usuário</label><input type="text" class="field-input" value="${_cqEsc(_cqSess().nome)}" disabled></div>
        <div class="form-field"><label class="field-label">Senha <span class="required">*</span></label>
        <input type="password" id="cq-reauth-pwd" class="field-input" autocomplete="current-password" onkeydown="if(event.key==='Enter')cqPromptConfirmar()"></div>`,
      confirmar: 'Assinar',
      onConfirm: async () => {
        if (!(await authVerifyCurrentPassword(document.getElementById('cq-reauth-pwd')?.value || ''))) { showToast('Senha incorreta.', 'error'); return false; }
        resolvido = true;
        resolve(true);
        return true;
      },
    });
    const el = document.getElementById('cq-prompt');
    const obs = new MutationObserver(() => {
      if (!el.classList.contains('open')) { obs.disconnect(); if (!resolvido) resolve(false); }
    });
    obs.observe(el, { attributes: true, attributeFilter: ['class'] });
  });
}

// Botão Ativar / Inativar do rodapé (ao lado de Excluir). O campo continua no formulário como checkbox
// oculto: o botão o inverte e chama o salvar do cadastro (validações, diferenças e trilha de sempre).
// cfg: { ids: 'id1,id2' (checkboxes), fn: nome da função de salvar, colecao, id, campo ('ativo' | 'ativa'), ativo }
function _cqBtnAtivoHTML(cfg) {
  if (!cfg) return '';
  return `<button type="button" class="btn btn-outline cq-btn-ativo ${cfg.ativo ? 'on' : 'off'}" title="${cfg.ativo ? 'Inativar: deixa de ser oferecido em lançamentos e cadastros novos' : 'Reativar o cadastro'}"
    onclick="cqAtivoAlternar('${cfg.ids}','${cfg.fn}','${cfg.colecao}','${cfg.id}','${cfg.campo || 'ativo'}')">${cfg.ativo ? `${CQ_ICO.pause} Inativar` : `${CQ_ICO.play} Ativar`}</button>`;
}
async function cqAtivoAlternar(ids, fn, colecao, id, campo) {
  const chks = String(ids).split(',').map(x => document.getElementById(x)).filter(Boolean);
  if (!chks.length || typeof window[fn] !== 'function' || _cqSalvando) return;
  const novo = !chks[0].checked;
  chks.forEach(c => { c.checked = novo; });
  await window[fn]();
  // Salvar recusado (validação) ou à espera de justificativa: o formulário volta ao valor gravado
  const rec = cqState.config[colecao]?.[id];
  if (rec && (rec[campo] !== false) !== novo) chks.forEach(c => { c.checked = !novo; });
}
// Aviso no topo do formulário de cadastro inativo
function _cqInativoNota(rec, campo = 'ativo', texto) {
  if (!rec || rec[campo] !== false) return '';
  return `<div class="cq-alerta-box cq-inativo-box">${CQ_ICO.pause} Inativo — ${texto || 'não é oferecido em lançamentos nem em cadastros novos'}. Use “Ativar” no rodapé para reativar.</div>`;
}

// Abas da janela lateral: [{ k, rotulo, html }] (itens falsy ignorados). Com uma aba só, sem cabeçalho.
// Os campos das abas ocultas continuam no DOM, então o salvar lê todas.
function _cqAbasHTML(grupo, abas, ativa) {
  const lista = abas.filter(Boolean);
  if (lista.length < 2) return lista[0]?.html || '';
  const at = lista.some(a => a.k === ativa) ? ativa : lista[0].k;
  return `<div class="ot-modal-tabs cq-drawer-tabs" id="cq-abas-${grupo}">${lista.map(a => `<button type="button" class="ot-modal-tab-btn${a.k === at ? ' active' : ''}" data-aba="${a.k}" onclick="cqAbaTrocar('${grupo}','${a.k}')">${a.rotulo}</button>`).join('')}</div>
    ${lista.map(a => `<div class="cq-aba-pane" data-grupo="${grupo}" data-aba="${a.k}" style="${a.k === at ? '' : 'display:none;'}">${a.html}</div>`).join('')}`;
}
function cqAbaTrocar(grupo, aba) {
  document.querySelectorAll(`#cq-abas-${grupo} .ot-modal-tab-btn`).forEach(b => b.classList.toggle('active', b.dataset.aba === aba));
  document.querySelectorAll(`.cq-aba-pane[data-grupo="${grupo}"]`).forEach(p => { p.style.display = p.dataset.aba === aba ? '' : 'none'; });
}
// Aba "Rastreabilidade" (só para cadastro existente), com o número de registros
function _cqAbaTrilha(rec) {
  if (!rec) return null;
  const n = _cqTrilhaLista(rec).length;
  return { k: 'trilha', rotulo: `Rastreabilidade${n ? ` <span class="cq-step-qtd">${n}</span>` : ''}`, html: _cqTrilhaHTML(rec) };
}

// Trilha formatada para exibição: um card por registro; cada campo alterado vira um chip
// que abre o antes → depois logo abaixo (cqTrilhaChip)
const CQ_TRILHA_TOM = {
  criacao: 'ok', edicao: 'info', correcao: 'aviso', alvo: 'info', decisao: 'aviso', acao: 'info', conclusao: 'ok',
  eficacia: 'ok', exclusao: 'erro', cancelamento: 'erro', reinicio_historico: 'aviso', migracao: 'mig', automatico: 'mig', ocorrencia: 'aviso',
};
const CQ_TRILHA_ICO = {
  ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  info: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
  aviso: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
  erro: '<path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/>',
  mig: '<path d="M4 12a8 8 0 0114-5.3L20 9M20 4v5h-5M20 12a8 8 0 01-14 5.3L4 15M4 20v-5h5"/>',
};
function _cqTrilhaIniciais(nome) {
  const p = String(nome || '').trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || '?') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}
function _cqTrilhaHTML(rec) {
  const itens = _cqTrilhaLista(rec).reverse();
  if (!itens.length) return '<div class="cq-vazio-p">Sem registros.</div>';
  const vazio = v => v === undefined || v === null || v === '';
  return `<div class="cq-tl">${itens.map(t => {
    const tom = CQ_TRILHA_TOM[t.acao] || 'info';
    const titulo = t.texto || t.acao || 'Registro';
    const longo = titulo.length > 140;
    return `<div class="cq-tl-card cq-tl-${tom}">
      <span class="cq-tl-ico"><svg viewBox="0 0 24 24">${CQ_TRILHA_ICO[tom]}</svg></span>
      <div class="cq-tl-corpo">
        <div class="cq-tl-txt${longo ? ' cq-tl-longo' : ''}"${longo ? ' onclick="this.classList.toggle(\'aberto\')" title="Clique para ver tudo"' : ''}>${_cqEsc(titulo)}</div>
        <div class="cq-tl-meta"><span class="cq-tl-av">${_cqEsc(_cqTrilhaIniciais(t.userName))}</span><b>${_cqEsc(t.userName || '—')}</b><span>${_cqFmtDH(t.ts)}</span>${t.estacao ? `<span class="cq-tl-est">${_cqEsc(t.estacao)}</span>` : ''}</div>
        ${t.diffs.length ? `<div class="cq-tl-chips">${t.diffs.map((d, i) => `<button type="button" class="cq-tl-chip" data-i="${i}" onclick="cqTrilhaChip(this)">${_cqEsc(d.campo)}<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button>`).join('')}</div>
        ${t.diffs.map((d, i) => `<div class="cq-tl-det" data-i="${i}" hidden>
          <div class="cq-tl-det-tit">${_cqEsc(d.campo)}</div>
          <div class="cq-tl-det-par">
            <div class="cq-tl-antes"><small>Antes</small>${vazio(d.antes) ? '<i>vazio</i>' : _cqEsc(d.antes)}</div>
            <div class="cq-tl-seta"><svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></div>
            <div class="cq-tl-depois"><small>Depois</small>${vazio(d.depois) ? '<i>vazio</i>' : _cqEsc(d.depois)}</div>
          </div></div>`).join('')}` : ''}
      </div></div>`;
  }).join('')}</div>`;
}
function cqTrilhaChip(btn) {
  const card = btn.closest('.cq-tl-card'), i = btn.dataset.i;
  const det = card?.querySelector(`.cq-tl-det[data-i="${i}"]`);
  if (!det) return;
  const abrir = det.hidden;
  det.hidden = !abrir;
  btn.classList.toggle('ativo', abrir);
}

// ── CONFIGURAÇÕES › CONTROLE DE QUALIDADE ────────────────────
function cqRenderConfig() {
  const body = document.getElementById('cpanel-cq-body');
  if (!body) return;
  if (!_cqCan('configurar')) { body.innerHTML = '<div class="cq-vazio">Sem permissão para configurar o Controle de Qualidade.</div>'; return; }
  const unidades = Object.values(cqState.config.unidades).sort((a, b) => (a.sigla || '').localeCompare(b.sigla || ''));
  const cat = cqState.config.catalogos;
  const validacoes = Object.values(cqState.config.validacoes).sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  const catBloco = (k, titulo, desc) => `<div class="cq-cfg-cat">
    <div class="cq-cfg-cat-tit">${titulo}<span class="cq-step-qtd">${_cqArr(cat[k]).length}</span></div><div class="cq-nota">${desc}</div>
    <div class="cq-tags">${_cqArr(cat[k]).map((v, i) => `<span class="cq-tag">${_cqEsc(v)}<button onclick="cqCatRemover('${k}',${i})" title="Remover">×</button></span>`).join('')}</div>
    <div class="cq-cfg-add"><input type="text" class="field-input" id="cq-cat-add-${k}" placeholder="Novo item" onkeydown="if(event.key==='Enter')cqCatAdicionar('${k}')">
      <button class="btn btn-outline btn-sm" onclick="cqCatAdicionar('${k}')">${CQ_ICO.plus} Adicionar</button></div>
  </div>`;

  // Sub-abas: Unidades · Estação e etiquetas · Catálogos · Validação · Dados e planilhas
  const valAtual = validacoes.find(v => v.versao === CQ_VERSAO);
  const validado = valAtual?.resultado === 'aprovado';
  const nCat = ['causas', 'acoes', 'fontesETa'].reduce((n, k) => n + _cqArr(cat[k]).length, 0);
  const abas = [
    ['unidades', CQ_ICO.unidade, 'Áreas', unidades.length ? `<span class="cq-step-qtd">${unidades.length}</span>` : ''],
    ['estacao', CQ_ICO.ativo, 'Estação e etiquetas', _cqEstacao() ? '' : '<span class="cq-cfg-ponto" title="Estação sem nome"></span>'],
    ['catalogos', CQ_ICO.cadastro, 'Catálogos', nCat ? `<span class="cq-step-qtd">${nCat}</span>` : ''],
    ['validacao', CQ_ICO.shield, 'Validação', validado ? '' : '<span class="cq-cfg-ponto" title="Versão sem validação aprovada"></span>'],
    ['dados', CQ_ICO.banco, 'Dados e planilhas', ''],
  ];
  if (!abas.some(a => a[0] === _cqCfgAba)) _cqCfgAba = 'unidades';
  const head = (ico, titulo, desc, acoes = '') => `<div class="cq-cfg-sec-head"><div class="cq-cfg-sec-tit"><span class="cq-cfg-sec-ico">${ico}</span><div><h3>${titulo}</h3>${desc ? `<p>${desc}</p>` : ''}</div></div>${acoes ? `<div class="cq-cfg-btns">${acoes}</div>` : ''}</div>`;
  const seta = '<svg class="cq-cfg-tile-seta" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="9 6 15 12 9 18"/></svg>';
  const tile = (ico, titulo, desc, acao, cls = '') => `<button type="button" class="cq-cfg-tile ${cls}" onclick="${acao}"><span class="cq-cfg-tile-ico">${ico}</span><span class="cq-cfg-tile-txt"><b>${titulo}</b><small>${desc}</small></span>${seta}</button>`;

  let conteudo = '';
  if (_cqCfgAba === 'unidades') {
    const uAtiva = _cqUnidadeAtivaId();
    const card = un => {
      const nAn = _cqDaUnidade('analitos', un.id).length, nTe = _cqTestesDaUnidade(un.id).length;
      const nMem = Object.keys(un.membros || {}).length;
      return `<button type="button" class="cq-un-card${un.ativa === false ? ' inativa' : ''}" onclick="cqUnidadeForm('${un.id}')">
        <div class="cq-un-card-top"><span class="cq-un-sigla">${_cqEsc(un.sigla)}</span>
          <span class="cq-un-badges">${un.id === uAtiva ? '<span class="cq-badge cq-un-atual">Selecionada</span>' : ''}${un.validacao ? '<span class="cq-badge cq-st-pendente">Validação</span>' : ''}${un.ativa === false ? '<span class="cq-badge cq-st-semalvo">Inativa</span>' : '<span class="cq-badge cq-st-aceito">Ativa</span>'}</span></div>
        <div class="cq-un-nome" title="${_cqEsc(un.nome)}">${_cqEsc(un.nome)}</div>
        <div class="cq-un-meta">
          ${_cqUnidadeOrg(un.id) ? `<span title="Unidade do sistema">${CQ_ICO.unidade}${_cqEsc(_cqUnidadeOrg(un.id).sigla)}</span>` : ''}
          <span title="Responsável técnico">${CQ_ICO.shield}${_cqEsc(_cqNomeUsuario(un.rtUserId) || 'Sem RT')}</span>
          <span>${CQ_ICO.usuarios}${nMem} membro${nMem === 1 ? '' : 's'}</span>
          ${un.cnes ? `<span>CNES ${_cqEsc(un.cnes)}</span>` : ''}
        </div>
        <div class="cq-un-rodape"><span><b>${nAn}</b> analito${nAn === 1 ? '' : 's'}</span><span><b>${nTe}</b> teste${nTe === 1 ? '' : 's'} ativo${nTe === 1 ? '' : 's'}</span>${seta}</div>
      </button>`;
    };
    conteudo = `<section class="cq-cfg-sec">
      ${head(CQ_ICO.unidade, 'Áreas', 'Cada área que executa exames tem CIQ e CEQ próprios (RDC 978, arts. 178 e 186). Clique para editar dados, membros, equipamentos e política de liberação.',
        `<button class="btn btn-primary btn-sm" onclick="cqUnidadeForm(null)">${CQ_ICO.plus} Nova área</button>`)}
      <div class="cq-un-grid">${unidades.map(card).join('')}
        <button type="button" class="cq-un-card cq-un-novo" onclick="cqUnidadeForm(null)">${CQ_ICO.plus}<span>Nova área</span></button></div>
    </section>`;
  } else if (_cqCfgAba === 'estacao') {
    const est = _cqEstacao();
    const ec = typeof _cqEtqCfg === 'function' ? _cqEtqCfg() : null;
    conteudo = `<section class="cq-cfg-sec">
      ${head(CQ_ICO.ativo, 'Esta estação de trabalho', 'Nome do computador/local gravado em cada registro (RDC 978, art. 105, II). Gravado apenas neste navegador.')}
      <div class="cq-cfg-estacao">
        <div class="cq-cfg-add"><input type="text" class="field-input" id="cq-cfg-estacao" maxlength="40" value="${_cqEsc(est)}" placeholder="Ex.: BIOQ-01, Bancada hematologia" onkeydown="if(event.key==='Enter')cqSalvarEstacaoCfg()">
          <button class="btn btn-primary btn-sm" onclick="cqSalvarEstacaoCfg()">${CQ_ICO.check} Salvar</button></div>
        ${est ? `<div class="cq-cfg-ok">${CQ_ICO.check} Registros feitos aqui saem como <b>${_cqEsc(est)}</b>.</div>`
          : `<div class="cq-cfg-aviso">${CQ_ICO.alerta} Estação sem nome: os registros saem como “não informada”.</div>`}
      </div>
    </section>
    ${ec ? `<section class="cq-cfg-sec">
      ${head(CQ_ICO.print, 'Etiquetas de preparo', 'Etiquetadora: uma etiqueta por página, no tamanho definido (use o mesmo tamanho de papel no driver da impressora). Folha A4: etiquetas em grade com linhas de corte. Vale só para esta estação.',
        `<button class="btn btn-primary btn-sm" onclick="cqEtqSalvarCfgForm()">${CQ_ICO.check} Salvar</button>`)}
      <div class="cq-etq-cfg-wrap">${_cqEtqCamposHTML('cq-etqc', ec)}<div class="cq-etq-prev" id="cq-etqc-prev">${_cqEtqPrevHTML(_cqEtqExemplo(), ec)}</div></div>
    </section>` : ''}`;
  } else if (_cqCfgAba === 'catalogos') {
    conteudo = `<section class="cq-cfg-sec">
      ${head(CQ_ICO.cadastro, 'Catálogos', 'Listas oferecidas nas não conformidades e nas especificações da qualidade. Remover um item não altera os registros que já o usaram.')}
      <div class="cq-cfg-cats">
        ${catBloco('causas', 'Causas de rejeição', 'Usadas na investigação das corridas rejeitadas.')}
        ${catBloco('acoes', 'Ações corretivas', 'Ações registradas nas não conformidades.')}
        ${catBloco('fontesETa', 'Fontes de erro total permitido', 'Modelo científico das especificações da qualidade (PALC 11.4).')}
      </div>
    </section>`;
  } else if (_cqCfgAba === 'validacao') {
    const banner = validado
      ? `<div class="cq-cfg-banner ok">${CQ_ICO.shield}<div><b>Versão ${_cqEsc(CQ_VERSAO)} validada</b><small>${_cqFmtData(valAtual.data)} · assinado por ${_cqEsc(valAtual.assinatura?.porNome || '—')}${valAtual.escopo ? ` · ${_cqEsc(valAtual.escopo)}` : ''}</small></div></div>`
      : `<div class="cq-cfg-banner pend">${CQ_ICO.alerta}<div><b>Versão ${_cqEsc(CQ_VERSAO)} ${valAtual ? 'reprovada na validação' : 'sem validação registrada'}</b><small>Registre a validação antes de usar o módulo em rotina (RDC 978, art. 106).</small></div>
          <button class="btn btn-primary btn-sm" onclick="cqValidacaoForm()">${CQ_ICO.plus} Registrar validação</button></div>`;
    conteudo = `<section class="cq-cfg-sec">
      ${head(CQ_ICO.shield, 'Validação do módulo', `Versão em uso: <b>${_cqEsc(CQ_VERSAO)}</b>. Cada nova versão deve ser validada antes do uso em rotina (RDC 978, art. 106).`,
        validado ? `<button class="btn btn-outline btn-sm" onclick="cqValidacaoForm()">${CQ_ICO.plus} Registrar validação</button>` : '')}
      ${banner}
      <div class="cq-sec-titulo" style="margin-top:18px;">Histórico de validações</div>
      ${validacoes.length ? `<div class="oc-table-scroll"><table class="ot-list-table cq-table"><thead><tr><th class="ot-list-th">Data</th><th class="ot-list-th">Versão</th><th class="ot-list-th">Escopo / protocolo</th><th class="ot-list-th">Resultado</th><th class="ot-list-th">Assinado por</th></tr></thead>
        <tbody>${validacoes.map(v => `<tr><td>${_cqFmtData(v.data)}</td><td><b>${_cqEsc(v.versao)}</b>${v.versao === CQ_VERSAO ? ' <span class="cq-badge cq-un-atual">em uso</span>' : ''}</td><td style="max-width:360px;">${_cqEsc(v.escopo)}</td>
          <td>${v.resultado === 'aprovado' ? '<span class="cq-badge cq-st-aceito">Aprovado</span>' : '<span class="cq-badge cq-st-rejeitado">Reprovado</span>'}</td>
          <td>${_cqEsc(v.assinatura?.porNome || '—')}<div class="cq-muted">${_cqFmtDH(v.assinatura?.em)}</div></td></tr>`).join('')}</tbody></table></div>`
        : '<div class="cq-nota">Nenhuma validação registrada.</div>'}
    </section>`;
  } else {
    const temExemplo = typeof cqExemploCriar === 'function' && _cqExemploExiste();
    conteudo = `<section class="cq-cfg-sec">
      ${head(CQ_ICO.lista, 'Planilhas (Excel)', 'Na importação, registros existentes são ignorados e resultados viram corridas avaliadas pelas regras de cada teste.')}
      <div class="cq-cfg-tiles">
        ${tile(CQ_ICO.lista, 'Baixar modelo', 'Planilha em branco com as abas e colunas aceitas na importação.', 'cqPlanilhaModelo()')}
        ${tile(CQ_ICO.print, 'Exportar', 'Cadastros, alvos, corridas, resultados e não conformidades.', 'cqPlanilhaExportarForm()')}
        ${tile(CQ_ICO.plus, 'Importar planilha', 'Cadastros e resultados históricos, com prévia antes de gravar.', 'cqPlanilhaImportarEscolher()', 'destaque')}
      </div>
    </section>
    ${_cqIsAdmin() ? `<section class="cq-cfg-sec">
      ${head(CQ_ICO.banco, 'Manutenção', 'Ferramentas de administrador.')}
      <div class="cq-cfg-tiles">
        ${tile(CQ_ICO.undo, 'Reconstruir índices', 'Recalcula pendências, últimas corridas e NCs abertas da área selecionada a partir dos registros.', 'cqReconstruirIndices()')}
        ${typeof cqExemploCriar !== 'function' ? '' : temExemplo
          ? tile(CQ_ICO.undo, 'Remover dados de exemplo', 'Apaga a área fictícia EXEMP e tudo o que foi criado para ela. Faça isso antes de usar o CQ em rotina.', 'cqExemploRemover()', 'perigo')
          : tile(CQ_ICO.beaker, 'Criar dados de exemplo', 'Área fictícia EXEMP com cadastros, alvos, cerca de 45 dias de corridas e não conformidades, para demonstração.', 'cqExemploCriar()')}
      </div>
    </section>
    <section class="cq-cfg-sec cq-cfg-perigo">
      ${head(CQ_ICO.alerta, 'Zona de perigo', 'Remove do banco todos os cadastros, alvos, corridas, resultados, não conformidades, índices e numerações do CQ, de todas as áreas. Uma cópia em <code>.json</code> é baixada antes. Os registros do CQ devem ser retidos pelo prazo regulatório (RDC 978/2025): use somente para descartar dados de teste.',
        `<button class="btn btn-outline btn-sm cq-btn-perigo" onclick="cqApagarTudo()">${CQ_ICO.alerta} Apagar dados do CQ</button>`)}
    </section>` : ''}`;
  }

  body.innerHTML = `
  <div class="cq-cfg">
    <div class="ot-modal-tabs cq-subtabs cq-cfg-abas">${abas.map(([k, ico, l, extra]) => `<button class="ot-modal-tab-btn${k === _cqCfgAba ? ' active' : ''}" onclick="cqCfgAba('${k}')">${ico}${l}${extra}</button>`).join('')}</div>
    ${conteudo}
  </div>`;
}

let _cqCfgAba = 'unidades';
function cqCfgAba(k) { _cqCfgAba = k; cqRenderConfig(); }

function cqSalvarEstacaoCfg() {
  const v = _cqVal('cq-cfg-estacao');
  if (!v) { showToast('Informe o nome da estação.', 'error'); return; }
  try { localStorage.setItem('cq-estacao', v); } catch (e) { showToast('Não foi possível gravar neste navegador.', 'error'); return; }
  showToast('Estação definida.', 'success');
  cqRender();
}

async function cqCatAdicionar(k) {
  const v = _cqVal('cq-cat-add-' + k);
  if (!v) return;
  const lista = _cqArr(cqState.config.catalogos[k]);
  if (lista.some(x => x.toLowerCase() === v.toLowerCase())) { showToast('Item já existe.', 'error'); return; }
  const nova = [...lista, v];
  if (await window.dbUpdate({ [`${CQ_KEYS.config}/catalogos/${k}`]: nova })) {
    cqState.config.catalogos[k] = nova;
    cqRenderConfig();
  } else showToast('Falha ao gravar.', 'error');
}
async function cqCatRemover(k, i) {
  const lista = _cqArr(cqState.config.catalogos[k]);
  if (lista.length <= 1) { showToast('A lista precisa ter ao menos um item.', 'error'); return; }
  const nova = lista.filter((_, j) => j !== i);
  if (await window.dbUpdate({ [`${CQ_KEYS.config}/catalogos/${k}`]: nova })) {
    cqState.config.catalogos[k] = nova;
    cqRenderConfig();
  } else showToast('Falha ao gravar.', 'error');
}

// ── FORMULÁRIO DE UNIDADE ────────────────────────────────────
let _cqUnFormId = null;
const CQ_LBL_UNIDADE = {
  sigla: 'Sigla', nome: 'Nome', cnes: 'CNES', endereco: 'Endereço', fuso: 'Fuso horário', setores: 'Setores', orgUnidadeId: 'Unidade do sistema',
  orgSetorIds: 'Setores da unidade', rtUserId: 'Responsável técnico', ativa: 'Ativa', validacao: 'Área de validação', diasOperacao: 'Dias de operação',
  membros: 'Membros', politica: 'Política de liberação', sistemas: 'Sistemas sem equipamento',
};
// Setores no formulário. org: unidade do sistema escolhida; lista: setores oferecidos; sel: ids marcados;
// legado: nomes da lista antiga (unidade sem vínculo); sugerida: unidade do sistema deduzida desses nomes
let _cqUnSt = { org: '', lista: [], sel: new Set(), legado: [], sugerida: '' };

// Interruptor (checkbox com aparência de switch) — o id continua sendo lido por _cqChk
function _cqSwitchHTML(id, on, titulo, desc) {
  return `<label class="cq-sw-row">
    <span class="cq-sw-txt"><b>${titulo}</b>${desc ? `<small>${desc}</small>` : ''}</span>
    <input type="checkbox" id="${id}" ${on ? 'checked' : ''}><span class="cq-sw" aria-hidden="true"></span>
  </label>`;
}
// Grupo de botões exclusivos (radios com aparência de segmento)
function _cqSegRadioHTML(nome, opcoes, atual, attrs = '', cls = '') {
  return `<div class="cq-segr ${cls}" role="radiogroup">${opcoes.map(([v, l]) => `<label class="cq-segr-op">
    <input type="radio" name="${nome}" value="${_cqEsc(v)}" ${v === atual ? 'checked' : ''} ${attrs}><span>${_cqEsc(l)}</span></label>`).join('')}</div>`;
}

function cqUnidadeForm(id) {
  if (!_cqCan('configurar')) return;
  const un = id ? cqState.config.unidades[id] : null;
  _cqUnFormId = id || null;
  const pol = Object.assign({ liberarAceitosAoSalvar: true, comentarioObrigatorioAlerta: true, reautenticar: true, retroativoHoras: 24 }, un?.politica || {});
  const dias = un ? _cqArr(un.diasOperacao).map(Number) : [1, 2, 3, 4, 5, 6];
  // Vínculo com a unidade do sistema (Ativos › Unidades e setores): uma unidade pode ter várias áreas
  const orgVinc = un?.orgUnidadeId || '';
  const orgOps = typeof _orgUnidades === 'function' ? _orgUnidades({ todas: true }).filter(o => o.ativa !== false || o.id === orgVinc) : [];
  // Sem vínculo: os nomes antigos marcados apontam a unidade provável
  const legado = orgVinc ? [] : _cqArr(un?.setores);
  const contUn = {};
  _orgIdsDeNomes(legado).forEach(sid => { const u = _orgUnidadeIdDoSetor(sid); if (u && orgOps.some(o => o.id === u)) contUn[u] = (contUn[u] || 0) + 1; });
  const sugerida = Object.entries(contUn).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  _cqUnSt = { org: '', lista: [], sel: new Set(), legado, sugerida };
  _cqUnSis = _cqArr(un?.sistemas).filter(x => x && x.nome).map(x => ({ id: x.id || _cqUid(), nome: x.nome, descricao: x.descricao || '' }));
  _cqUnSetoresIniciar(orgVinc, orgVinc ? _cqArr(un?.orgSetorIds) : null);

  const membros = un?.membros || {};
  const users = _cqUsuarios();
  const equipsUn = id && typeof _cqGruposLanc === 'function' ? _cqGruposLanc(id) : [];
  const orgOpcoes = [
    { value: '', label: 'Sem vínculo', sub: 'Modelo antigo ou área de validação' },
    ...orgOps.map(o => {
      const n = _orgSetores(o.id).length;
      const irmas = _cqAreasIrmas(o.id, id);
      return { value: o.id, label: `${o.sigla} — ${o.nome}`, sub: `${n} setor${n === 1 ? '' : 'es'}${irmas.length ? ` · área${irmas.length === 1 ? '' : 's'}: ${irmas.map(x => x.sigla).join(', ')}` : ''}`,
        extra: o.ativa === false ? 'inativa' : o.id === sugerida ? 'sugerida' : '' };
    })];
  const nAcesso = Object.values(membros).filter(Boolean).length;
  const modoAtual = CQ_MODOS_CORRIDA[pol.modoCorrida] ? pol.modoCorrida : 'lote';
  const modoTxt = k => { const m = String(CQ_MODOS_CORRIDA[k]).match(/^(.*?)\s*\((.*)\)$/); return m ? [m[1], m[2].charAt(0).toUpperCase() + m[2].slice(1)] : [CQ_MODOS_CORRIDA[k], '']; };

  cqDrawerOpen({
    titulo: un ? `Área ${un.sigla}` : 'Nova área', subtitulo: 'Local que executa exames e realiza CIQ/CEQ', icone: 'unidade',
    corpo: _cqAbasHTML('un', [{ k: 'dados', rotulo: 'Área', html: `
      ${_cqInativoNota(un, 'ativa', 'não aparece na seleção de áreas para quem não é administrador')}
      <div class="form-section"><div class="form-section-title">${CQ_ICO.unidade}Unidade do sistema e setores</div>
        <div class="cq-un-vinc">
          <div class="cq-un-passo"><span class="cq-un-passo-n">1</span><div><b>Unidade do sistema</b><small>Cadastrada em Ativos › Unidades e setores. Uma unidade pode ter várias áreas (ex.: Hematologia e Bioquímica na mesma unidade).</small></div></div>
          ${_cqSelHTML('cq-un-org', orgOpcoes, orgVinc, { placeholder: 'Selecione a unidade…', busca: 'Buscar unidade…', vazio: 'Nenhuma unidade disponível.', onchange: v => cqUnidadeOrgEscolher(v) })}
          <div class="cq-un-passo"><span class="cq-un-passo-n">2</span><div><b>Setores que se aplicam</b><small>Definem os equipamentos oferecidos nos testes desta área</small></div></div>
          <div id="cq-un-setores-box">${_cqUnSetoresBoxHTML()}</div>
        </div>
      </div>

      <div class="form-section"><div class="form-section-title">${CQ_ICO.cadastro}Identificação</div>
        <div class="form-row">
          <div class="form-field" style="max-width:130px;"><label class="field-label">Sigla <span class="required">*</span></label><input type="text" id="cq-un-sigla" class="field-input cq-un-sigla" maxlength="8" value="${_cqEsc(un?.sigla)}" placeholder="HEM"></div>
          <div class="form-field"><label class="field-label">Nome <span class="required">*</span></label><input type="text" id="cq-un-nome" class="field-input" maxlength="80" value="${_cqEsc(un?.nome)}" placeholder="Hematologia"></div>
        </div>
        <div class="form-row">
          <div class="form-field"><label class="field-label">Responsável técnico</label>
            ${_cqSelHTML('cq-un-rt', [{ value: '', label: 'Sem responsável técnico', sub: '' }, ...users.map(u => ({ value: u.id, label: u.nomeCompleto || u.username, sub: u.cargo || '' }))],
              un?.rtUserId || '', { placeholder: 'Selecione…', busca: 'Buscar usuário…', onchange: v => cqUnRtEscolhido(v) })}</div>
          <div class="form-field"><label class="field-label">Fuso horário</label>
            ${_cqSelHTML('cq-un-fuso', Object.entries(CQ_FUSOS).map(([v, l]) => ({ value: v, label: l })), un?.fuso || 'America/Sao_Paulo', { busca: 'Buscar fuso…' })}</div>
        </div>
        <div class="cq-nota">O responsável técnico entra automaticamente como membro com o papel RT.</div>
      </div>

      <div class="form-section"><div class="form-section-title">${CQ_ICO.calendario}Operação</div>
        <div class="form-field"><div class="cq-un-dias-head"><label class="field-label">Dias de operação</label>
          <span class="cq-un-presets"><button type="button" onclick="cqUnDiasPreset([1,2,3,4,5])">Seg–Sex</button><button type="button" onclick="cqUnDiasPreset([1,2,3,4,5,6])">Seg–Sáb</button><button type="button" onclick="cqUnDiasPreset([0,1,2,3,4,5,6])">Todos</button></span></div>
          <div class="cq-dias">${CQ_DIAS.map((d, i) => `<label class="cq-dia${i === 0 || i === 6 ? ' fds' : ''}"><input type="checkbox" class="cq-un-dia" value="${i}" ${dias.includes(i) ? 'checked' : ''}><span>${d}</span></label>`).join('')}</div></div>
        <input type="checkbox" id="cq-un-ativa" hidden ${un?.ativa === false ? '' : 'checked'}>
        <div class="cq-sw-lista">${_cqSwitchHTML('cq-un-validacao', !!un?.validacao, 'Área de validação', 'Usada para testar o sistema; fica fora dos indicadores')}</div>
      </div>

      <div class="form-section"><div class="form-section-title">${CQ_ICO.shield}Política de liberação</div>
        <div class="cq-sw-lista">
          ${_cqSwitchHTML('cq-un-pol-lib', pol.liberarAceitosAoSalvar, 'Liberar aceitos ao salvar', 'Libera automaticamente os testes sem violação quando o usuário tem permissão de liberar')}
          ${_cqSwitchHTML('cq-un-pol-com', pol.comentarioObrigatorioAlerta, 'Comentário obrigatório em alerta', 'Exige comentário para liberar testes em alerta')}
          ${_cqSwitchHTML('cq-un-pol-reauth', pol.reautenticar, 'Senha em assinaturas críticas', 'Liberar com violação e alterar alvos pedem a senha novamente')}
          <label class="cq-sw-row"><span class="cq-sw-txt"><b>Lançamento retroativo sem justificativa</b><small>Até quantas horas depois da corrida dispensa justificativa</small></span>
            <span class="cq-un-horas"><input type="number" min="0" max="720" id="cq-un-pol-retro" value="${Number(pol.retroativoHoras) || 0}"><span>h</span></span></label>
        </div>
      </div>

      <div class="form-section"><div class="form-section-title">${CQ_ICO.lista}Lançamento de corridas</div>
        <div class="cq-modos">${Object.keys(CQ_MODOS_CORRIDA).map(k => { const [t, d] = modoTxt(k); return `<label class="cq-modo">
          <input type="radio" name="cq-un-pol-modo" value="${k}" ${k === modoAtual ? 'checked' : ''}>
          <span class="cq-modo-radio"></span><span class="cq-modo-txt"><b>${_cqEsc(t)}</b><small>${_cqEsc(d)}</small></span></label>`; }).join('')}</div>
        <div class="cq-nota">Em lote: a grade mostra todos os testes do equipamento. Fracionada: o operador adiciona só os testes realizados naquela corrida — para rotinas em horários distintos. O modo pode ser trocado na própria tela de lançamento.</div>
        ${equipsUn.length ? `<div class="form-field"><label class="field-label">Exceções por equipamento / sistema</label>
          <div class="cq-un-lista">${equipsUn.map((g, i) => { const k = _cqChaveModoEquip(g.key); return `<div class="cq-un-linha">
            <span class="cq-un-linha-txt"><b>${_cqEsc(g.nome)}</b><small>${g.testes.length} teste(s)</small></span>
            ${_cqSegRadioHTML(`cq-un-me-${i}`, [['', 'Padrão'], ['lote', 'Lote'], ['fracionada', 'Fracionada']], pol.modoCorridaEquip?.[k] || '', `class="cq-un-me" data-k="${_cqEsc(k)}"`, 'sm')}
          </div>`; }).join('')}</div></div>` : ''}
      </div>
      ${typeof _cqEsterUnidadeHTML === 'function' ? _cqEsterUnidadeHTML(id, equipsUn) : ''}
      <div class="form-section"><div class="form-section-title">${CQ_ICO.usuarios}Membros e papéis</div>
        <div class="cq-nota">Só os membros veem e lançam nesta área. As ações permitidas dependem também das permissões do grupo do usuário.</div>
        <div class="cq-un-mb-bar">
          <label class="cq-ms-busca cq-un-mb-busca">${CQ_ICO.busca}<input type="text" placeholder="Buscar usuário…" autocomplete="off" oninput="cqUnMembrosFiltrar(this.value)"></label>
          <span class="cq-un-mb-n" id="cq-un-mb-n">${nAcesso} com acesso</span>
        </div>
        <div class="cq-un-lista cq-un-membros">${users.map((u, i) => { const nome = u.nomeCompleto || u.username || ''; return `<div class="cq-un-linha${membros[u.id] ? ' com-acesso' : ''}" data-busca="${_cqEsc(_cqNormBusca(nome + ' ' + (u.cargo || '')))}">
          <span class="cq-un-av">${_cqEsc(nome.trim().charAt(0).toUpperCase() || '?')}</span>
          <span class="cq-un-linha-txt"><b>${_cqEsc(nome)}</b>${u.cargo ? `<small>${_cqEsc(u.cargo)}</small>` : ''}</span>
          ${_cqSegRadioHTML(`cq-un-mb-${i}`, [['', 'Sem acesso'], ...Object.entries(CQ_PAPEIS).map(([k, l]) => [k, k === 'rt' ? 'RT' : l])], membros[u.id] || '', `class="cq-un-mb" data-user="${_cqEsc(u.id)}" onchange="cqUnMembroMudou(this)"`, 'sm')}
        </div>`; }).join('') || '<div class="cq-ms-vazio">Nenhum usuário ativo.</div>'}
          <div class="cq-ms-vazio" id="cq-un-mb-vazio" hidden>Nenhum usuário encontrado.</div></div>
      </div>
` }, { k: 'sistemas', rotulo: _cqUnSisRotulo(), html: `<div id="cq-un-sis-box">${_cqUnSisHTML()}</div>` }, _cqAbaTrilha(un)]),
    rodape: `${un ? `<div class="cq-rodape-esq">${_cqBtnAtivoHTML({ ids: 'cq-un-ativa', fn: 'cqUnidadeSalvar', colecao: 'unidades', id: un.id, campo: 'ativa', ativo: un.ativa !== false })}</div>` : ''}
      <button class="btn btn-outline" onclick="cqDrawerClose()">Cancelar</button>
      <button class="btn btn-primary" onclick="cqUnidadeSalvar()">${CQ_ICO.check} Salvar</button>`,
  });
}

// Outras áreas do CQ ligadas à mesma unidade do sistema (exceto a do formulário)
function _cqAreasIrmas(orgId, excetoId) {
  return orgId ? Object.values(cqState.config.unidades).filter(x => x && x.id !== excetoId && x.orgUnidadeId === orgId)
    .sort((a, b) => (a.sigla || '').localeCompare(b.sigla || '')) : [];
}
// A área cobre o setor? (orgSetorIds vazio = todos os setores da unidade)
function _cqAreaCobreSetor(area, setorId) { const ids = _cqArr(area?.orgSetorIds); return !ids.length || ids.includes(setorId); }

// Prepara os setores oferecidos para a unidade do sistema. ids: os gravados (vazio = todos);
// null = unidade recém-escolhida (aproveita os setores antigos de mesmo nome, se houver; senão,
// os setores ativos ainda sem área — ou todos, se a unidade não tem outra área)
function _cqUnSetoresIniciar(org, ids) {
  const st = _cqUnSt;
  st.org = org || '';
  if (!st.org) { st.lista = []; st.sel = new Set(); return; }
  const todos = _orgSetores(st.org, { todos: true });
  const existe = sid => todos.some(s => s.id === sid);
  let sel = _cqArr(ids).filter(existe);
  if (ids === null) {
    // Só nomes antigos que viraram setor de mesmo nome (não os que viraram a própria unidade)
    sel = st.legado.map(n => ({ n, sid: _orgIdDeNomeLegado(n) }))
      .filter(x => existe(x.sid) && _orgNorm(_orgSetor(x.sid)?.nome) === _orgNorm(x.n)).map(x => x.sid);
  }
  if (!sel.length) {
    const irmas = ids === null ? _cqAreasIrmas(st.org, _cqUnFormId).filter(x => x.ativa !== false) : [];
    const ativos = todos.filter(s => s.ativo !== false);
    sel = (irmas.length ? ativos.filter(s => !irmas.some(x => _cqAreaCobreSetor(x, s.id))) : ativos).map(s => s.id);
  }
  st.sel = new Set(sel);
  st.lista = todos.filter(s => s.ativo !== false || st.sel.has(s.id));
}
// Todos os setores ativos marcados (e nenhum inativo): grava "todos", e os setores novos entram sozinhos
function _cqUnSetoresTodos() {
  const st = _cqUnSt;
  return st.lista.length > 0 && st.lista.every(s => (s.ativo === false) !== st.sel.has(s.id));
}

function _cqUnSetoresBoxHTML() {
  const st = _cqUnSt;
  if (st.org) {
    const ss = st.lista;
    if (!ss.length) return `<div class="cq-un-st-vazio">${CQ_ICO.info}<span>Esta unidade ainda não tem setores.<small>Cadastre-os em Ativos › Unidades e setores.</small></span></div>`;
    const n = ss.filter(s => st.sel.has(s.id)).length;
    const irmas = _cqAreasIrmas(st.org, _cqUnFormId);
    const nota = !n ? '<span class="cq-un-st-erro">Selecione ao menos um setor.</span>'
      : _cqUnSetoresTodos() ? 'Todos os setores — os cadastrados depois nesta área entram automaticamente.'
      : 'Só os equipamentos dos setores marcados são oferecidos nos testes desta área.';
    const irmasTxt = irmas.length ? `<div class="cq-nota cq-un-irmas">${CQ_ICO.info} Outras áreas desta unidade: ${irmas.map(x => {
        const k = _cqArr(x.orgSetorIds).length;
        return `<b>${_cqEsc(x.sigla)}</b> (${k ? `${k} setor${k === 1 ? '' : 'es'}` : 'todos os setores'}${x.ativa === false ? ', inativa' : ''})`;
      }).join(', ')}. Um setor pode ficar em mais de uma área; cada área tem CIQ/CEQ próprio.</div>` : '';
    return `${irmasTxt}<div class="cq-un-st-head">
        <span><b>${n}</b> de ${ss.length} setor${ss.length === 1 ? '' : 'es'} selecionado${n === 1 ? '' : 's'}</span>
        <span class="cq-un-presets"><button type="button" onclick="cqUnSetoresMarcar(true)">Todos</button><button type="button" onclick="cqUnSetoresMarcar(false)">Limpar</button></span>
      </div>
      <div class="cq-un-st-grid">${ss.map((s, i) => {
        const on = st.sel.has(s.id);
        const na = typeof _orgContarAtivos === 'function' ? _orgContarAtivos(s.id) : 0;
        const em = irmas.filter(x => _cqAreaCobreSetor(x, s.id)).map(x => x.sigla);
        return `<button type="button" class="cq-tgl${on ? ' on' : ''}${s.ativo === false ? ' inativo' : ''}" aria-pressed="${on}" onclick="cqUnSetorAlternar(${i})">
          <span class="cq-tgl-chk">${CQ_ICO.check}</span>
          <span class="cq-tgl-txt"><b title="${_cqEsc(s.nome)}">${_cqEsc(s.nome)}</b><small>${na} equipamento${na === 1 ? '' : 's'}${s.ativo === false ? ' · inativo' : ''}${em.length ? ` · também em ${_cqEsc(em.join(', '))}` : ''}</small></span>
        </button>`;
      }).join('')}</div>
      <div class="cq-nota">${nota}</div>`;
  }
  if (st.legado.length) {
    const sug = st.sugerida ? _orgUnidade(st.sugerida) : null;
    return `<div class="cq-un-st-legado">
      <div class="cq-un-st-head"><span>${CQ_ICO.alerta}<b>Modelo antigo</b> — setores marcados antes da hierarquia unidade › setor</span></div>
      <div class="cq-ms-chips">${st.legado.map((s, i) => `<span class="cq-ms-chip"><span class="cq-ms-chip-txt">${_cqEsc(s)}</span><button type="button" title="Remover" onclick="cqUnLegadoRemover(${i})">×</button></span>`).join('')}</div>
      <div class="cq-nota">Vincule a unidade do sistema acima para escolher os setores atuais.${sug ? ` <button type="button" class="cq-un-sug" onclick="cqUnOrgSugerida()">${CQ_ICO.unidade} Usar ${_cqEsc(sug.sigla)} — ${_cqEsc(sug.nome)}</button>` : ''}</div>
    </div>`;
  }
  return `<div class="cq-un-st-vazio cq-un-st-off">${CQ_ICO.lock}<span>Selecione a unidade do sistema para habilitar os setores.<small>Sem vínculo (ex.: área de validação), todos os equipamentos são oferecidos.</small></span></div>`;
}
function _cqUnSetoresAtualizar() {
  const box = document.getElementById('cq-un-setores-box');
  if (box) box.innerHTML = _cqUnSetoresBoxHTML();
}
function cqUnSetorAlternar(i) {
  const s = _cqUnSt.lista[i];
  if (!s) return;
  if (_cqUnSt.sel.has(s.id)) _cqUnSt.sel.delete(s.id); else _cqUnSt.sel.add(s.id);
  _cqUnSetoresAtualizar();
}
function cqUnSetoresMarcar(on) {
  _cqUnSt.sel = new Set(on ? _cqUnSt.lista.filter(s => s.ativo !== false).map(s => s.id) : []);
  _cqUnSetoresAtualizar();
}
function cqUnLegadoRemover(i) {
  _cqUnSt.legado.splice(i, 1);
  _cqUnSetoresAtualizar();
}
function cqUnOrgSugerida() {
  const m = _cqSel['cq-un-org'];
  if (!m || !_cqUnSt.sugerida) return;
  m.valor = _cqUnSt.sugerida;
  const b = document.getElementById('cq-un-org-btn');
  if (b) b.innerHTML = _cqSelBtnHTML('cq-un-org');
  cqUnidadeOrgEscolher(_cqUnSt.sugerida);
}
function cqUnidadeOrgEscolher(v) {
  const o = v ? _orgUnidade(v) : null;
  const sig = document.getElementById('cq-un-sigla'), nom = document.getElementById('cq-un-nome');
  // Unidade nova: sugere sigla e nome da unidade do sistema
  // Só a primeira área da unidade herda sigla e nome dela (a sigla da área é única)
  const primeira = o && !_cqAreasIrmas(o.id, _cqUnFormId).length;
  if (primeira && sig && !sig.value) sig.value = String(o.sigla || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  if (primeira && nom && !nom.value) nom.value = o.nome || '';
  const un = _cqUnFormId ? cqState.config.unidades[_cqUnFormId] : null;
  // Voltando à unidade já gravada, recupera a seleção gravada
  _cqUnSetoresIniciar(v, v && v === un?.orgUnidadeId ? _cqArr(un?.orgSetorIds) : null);
  _cqUnSetoresAtualizar();
}

function cqUnDiasPreset(dias) {
  document.querySelectorAll('#cq-drawer .cq-un-dia').forEach(c => { c.checked = dias.includes(Number(c.value)); });
}
// Escolheu o RT: passa a ser membro com o papel RT (se ainda não for membro)
function cqUnRtEscolhido(userId) {
  if (!userId) return;
  const radios = [...document.querySelectorAll('#cq-drawer .cq-un-mb')].filter(r => r.dataset.user === userId);
  if (radios.some(r => r.checked && r.value)) return;
  const rt = radios.find(r => r.value === 'rt');
  if (rt) { rt.checked = true; cqUnMembroMudou(rt); }
}
function cqUnMembroMudou(r) {
  r.closest('.cq-un-linha')?.classList.toggle('com-acesso', !!r.value);
  const n = [...document.querySelectorAll('#cq-drawer .cq-un-mb:checked')].filter(x => x.value).length;
  const el = document.getElementById('cq-un-mb-n');
  if (el) el.textContent = `${n} com acesso`;
}
function cqUnMembrosFiltrar(q) {
  const t = _cqNormBusca(q).trim();
  let vis = 0;
  document.querySelectorAll('#cq-drawer .cq-un-membros .cq-un-linha').forEach(l => { const ok = !t || l.dataset.busca.includes(t); l.hidden = !ok; if (ok) vis++; });
  const v = document.getElementById('cq-un-mb-vazio');
  if (v) v.hidden = vis > 0;
}

// ── SISTEMAS SEM EQUIPAMENTO DA ÁREA ─────────────────────────
// Bancadas, kits manuais e sistemas analíticos que não são um ativo. Ficam em unidade.sistemas
// ([{ id, nome, descricao }]) e aparecem como sugestão no cadastro do analito. A lista da aba junta
// os cadastrados com os que já estão em uso nos analitos e testes da área (texto livre de antes).
// As alterações ficam no formulário e são gravadas com a área (Salvar).
let _cqUnSis = [];
function _cqUnSisUso(nome) {
  const u = _cqUnFormId, k = _cqItensChave(nome);
  if (!u) return { analitos: 0, testes: 0 };
  return {
    analitos: _cqDaUnidade('analitos', u).filter(a => _cqArr(a.sistemas).some(s => _cqItensChave(s) === k)).length,
    testes: _cqTestesDaUnidade(u, { incluirInativos: true }).filter(t => !t.ativoId && _cqItensChave(t.sistemaAnalitico || 'Bancada / manual') === k).length,
  };
}
// Cadastrados + em uso na área sem cadastro (estes só podem ser adicionados ao cadastro)
function _cqUnSisLista() {
  const cad = _cqUnSis.map(s => ({ ...s, cadastrado: true }));
  const vistos = new Set(cad.map(s => _cqItensChave(s.nome)));
  const soUso = [];
  if (_cqUnFormId) {
    const add = n => { const v = String(n || '').trim(); const k = _cqItensChave(v); if (v && !vistos.has(k)) { vistos.add(k); soUso.push({ id: '', nome: v, descricao: '', cadastrado: false }); } };
    _cqDaUnidade('analitos', _cqUnFormId).forEach(a => _cqArr(a.sistemas).forEach(add));
    _cqTestesDaUnidade(_cqUnFormId, { incluirInativos: true }).filter(t => !t.ativoId).forEach(t => add(t.sistemaAnalitico || 'Bancada / manual'));
  }
  return [...cad, ...soUso].map(s => ({ ...s, uso: _cqUnSisUso(s.nome) }))
    .sort((a, b) => (b.cadastrado - a.cadastrado) || a.nome.localeCompare(b.nome, 'pt'));
}
function _cqUnSisRotulo() { const n = _cqUnSisLista().length; return `Sistemas sem equipamento${n ? ` <span class="cq-step-qtd" id="cq-un-sis-n">${n}</span>` : ''}`; }
function _cqUnSisHTML() {
  const lista = _cqUnSisLista();
  const nUso = lista.filter(s => !s.cadastrado).length;
  const card = (s, i) => {
    const usado = s.uso.analitos + s.uso.testes > 0;
    const usoTxt = usado ? [s.uso.analitos && `${s.uso.analitos} analito${s.uso.analitos === 1 ? '' : 's'}`, s.uso.testes && `${s.uso.testes} teste${s.uso.testes === 1 ? '' : 's'}`].filter(Boolean).join(' · ') : 'sem uso ainda';
    const acoes = s.cadastrado
      ? `<button type="button" class="cq-icobtn" title="Editar" onclick="cqUnSisPop(this,'${s.id}')">${CQ_ICO.edit}</button>
         <button type="button" class="cq-icobtn cq-un-sis-del" ${usado ? 'disabled title="Em uso: não pode ser removido"' : 'title="Remover"'} onclick="cqUnSisRemover('${s.id}')">${CQ_ICO.lixo}</button>`
      : `<button type="button" class="btn btn-outline btn-sm" onclick="cqUnSisAdotar(${i})" title="Passa a constar no cadastro da área">${CQ_ICO.plus} Cadastrar</button>`;
    return `<div class="cq-un-sis-card${s.cadastrado ? '' : ' so-uso'}">
      <span class="cq-un-sis-ico">${CQ_ICO.beaker}</span>
      <div class="cq-un-sis-txt"><b>${_cqEsc(s.nome)}</b>${s.descricao ? `<small>${_cqEsc(s.descricao)}</small>` : ''}
        <span class="cq-un-sis-tags"><span class="cq-un-sis-tag${usado ? ' uso' : ''}">${usoTxt}</span>${s.cadastrado ? '' : '<span class="cq-un-sis-tag aviso">em uso, fora do cadastro</span>'}</span></div>
      <div class="cq-un-sis-acoes">${acoes}</div>
    </div>`;
  };
  return `<div class="cq-un-sis">
    <div class="cq-un-sis-head">
      <div><b>Sistemas sem equipamento</b><small>Bancadas, kits manuais e sistemas que não são um ativo. Aparecem como opção no cadastro dos analitos desta área.</small></div>
      <button type="button" class="btn btn-primary btn-sm" onclick="cqUnSisPop(this,'')">${CQ_ICO.plus} Novo sistema</button>
    </div>
    ${lista.length > 6 ? `<label class="cq-ms-busca cq-un-sis-busca">${CQ_ICO.busca}<input type="text" placeholder="Buscar sistema…" autocomplete="off" oninput="cqUnSisFiltrar(this.value)"></label>` : ''}
    ${nUso ? `<div class="cq-nota">${CQ_ICO.info} ${nUso} sistema${nUso === 1 ? '' : 's'} em uso nos analitos ou testes ainda não ${nUso === 1 ? 'consta' : 'constam'} no cadastro da área. Use <b>Cadastrar</b> para incluí-lo${nUso === 1 ? '' : 's'}.</div>` : ''}
    <div class="cq-un-sis-grid">${lista.map(card).join('') || `<div class="cq-un-sis-vazio">${CQ_ICO.beaker}<b>Nenhum sistema cadastrado</b><small>Ex.: Bancada de microbiologia, Microscopia manual, Kit rápido.</small>
      <button type="button" class="btn btn-outline btn-sm" onclick="cqUnSisPop(this,'')">${CQ_ICO.plus} Cadastrar o primeiro</button></div>`}</div>
    <div class="cq-ms-vazio" id="cq-un-sis-nada" hidden>Nenhum sistema encontrado.</div>
  </div>`;
}
function _cqUnSisAtualizar() {
  _cqFloatFechar();
  const box = document.getElementById('cq-un-sis-box');
  if (box) box.innerHTML = _cqUnSisHTML();
  const btn = document.querySelector('#cq-drawer .ot-modal-tab-btn[data-aba="sistemas"]');
  if (btn) btn.innerHTML = _cqUnSisRotulo();
}
// Popover de cadastro/edição ancorado no botão clicado (nome bloqueado quando o sistema já está em uso)
function cqUnSisPop(btn, id) {
  if (_cqFloatAberto(btn)) { _cqFloatFechar(); return; }
  const s = id ? _cqUnSis.find(x => x.id === id) : null;
  const uso = s ? _cqUnSisUso(s.nome) : { analitos: 0, testes: 0 };
  const travado = uso.analitos + uso.testes > 0;
  _cqFloatAbrir(btn, `<div class="cq-un-sis-pop">
    <div class="cq-un-sis-pop-tit">${CQ_ICO.beaker}<b>${s ? 'Editar sistema' : 'Novo sistema sem equipamento'}</b></div>
    <label class="field-label">Nome <span class="required">*</span></label>
    <input type="text" id="cq-un-sis-nome" class="field-input" maxlength="60" value="${_cqEsc(s?.nome || '')}" placeholder="Ex.: Bancada de microbiologia" ${travado ? 'disabled' : ''}
      onkeydown="if(event.key==='Enter'){event.preventDefault();cqUnSisConfirmar('${id}');}">
    ${travado ? '<div class="cq-nota">Em uso nos analitos ou testes: o nome não muda aqui.</div>' : ''}
    <label class="field-label">Descrição</label>
    <input type="text" id="cq-un-sis-desc" class="field-input" maxlength="120" value="${_cqEsc(s?.descricao || '')}" placeholder="Opcional — ex.: leitura visual, kit X"
      onkeydown="if(event.key==='Enter'){event.preventDefault();cqUnSisConfirmar('${id}');}">
    <div class="cq-un-sis-pop-pe"><button type="button" class="btn btn-outline btn-sm" onclick="_cqFloatFechar()">Cancelar</button>
      <button type="button" class="btn btn-primary btn-sm" onclick="cqUnSisConfirmar('${id}')">${CQ_ICO.check} ${s ? 'Aplicar' : 'Adicionar'}</button></div>
  </div>`, { cls: 'cq-un-sis-float', largura: 320 });
  setTimeout(() => document.getElementById(travado ? 'cq-un-sis-desc' : 'cq-un-sis-nome')?.focus(), 30);
}
function cqUnSisConfirmar(id) {
  const nome = (document.getElementById('cq-un-sis-nome')?.value || '').trim().replace(/\s+/g, ' ');
  const descricao = (document.getElementById('cq-un-sis-desc')?.value || '').trim();
  if (!nome) { showToast('Informe o nome do sistema.', 'error'); return; }
  const k = _cqItensChave(nome);
  if (_cqUnSis.some(x => x.id !== id && _cqItensChave(x.nome) === k)) { showToast('Já existe um sistema com este nome na área.', 'error'); return; }
  const s = id ? _cqUnSis.find(x => x.id === id) : null;
  if (s) Object.assign(s, { nome, descricao });
  else _cqUnSis.push({ id: _cqUid(), nome, descricao });
  _cqUnSisAtualizar();
}
function cqUnSisAdotar(i) {
  const s = _cqUnSisLista()[i];
  if (!s || s.cadastrado) return;
  _cqUnSis.push({ id: _cqUid(), nome: s.nome, descricao: '' });
  _cqUnSisAtualizar();
}
function cqUnSisRemover(id) {
  const s = _cqUnSis.find(x => x.id === id);
  if (!s) return;
  const uso = _cqUnSisUso(s.nome);
  if (uso.analitos + uso.testes) { showToast('Sistema em uso nos analitos ou testes: não pode ser removido.', 'error'); return; }
  _cqUnSis = _cqUnSis.filter(x => x.id !== id);
  _cqUnSisAtualizar();
}
function cqUnSisFiltrar(q) {
  const t = _cqNormBusca(q).trim();
  let vis = 0;
  document.querySelectorAll('#cq-un-sis-box .cq-un-sis-card').forEach(c => { const ok = !t || _cqNormBusca(c.textContent).includes(t); c.hidden = !ok; if (ok) vis++; });
  const v = document.getElementById('cq-un-sis-nada');
  if (v) v.hidden = vis > 0;
}

async function cqUnidadeSalvar() {
  if (_cqSalvando) return;
  const orgSel = _cqSelVal('cq-un-org');
  const sigla = _cqVal('cq-un-sigla').toUpperCase(), nome = _cqVal('cq-un-nome');
  if (!sigla || !/^[A-Z0-9]{1,8}$/.test(sigla)) { showToast('Informe a sigla (até 8 letras ou números).', 'error'); return; }
  if (!nome) { showToast('Informe o nome da área.', 'error'); return; }
  if (Object.values(cqState.config.unidades).some(u => u.sigla === sigla && u.id !== _cqUnFormId)) { showToast('Já existe área com esta sigla.', 'error'); return; }
  // Setores da unidade do sistema: null = todos (inclui os cadastrados depois)
  let orgSetorIds = null;
  if (orgSel && _cqUnSt.org === orgSel && _cqUnSt.lista.length) {
    const sel = _cqUnSt.lista.filter(s => _cqUnSt.sel.has(s.id)).map(s => s.id);
    if (!sel.length) { showToast('Selecione ao menos um setor da unidade.', 'error'); return; }
    if (!_cqUnSetoresTodos()) orgSetorIds = sel;
  }
  const antes = _cqUnFormId ? cqState.config.unidades[_cqUnFormId] : null;
  const membros = {};
  document.querySelectorAll('#cq-drawer .cq-un-mb:checked').forEach(r => { if (r.value) membros[r.dataset.user] = r.value; });
  const modo = document.querySelector('#cq-drawer input[name="cq-un-pol-modo"]:checked')?.value;
  const rec = {
    ...(antes || {}),
    id: _cqUnFormId || _cqUid(), orgUnidadeId: orgSel || null, orgSetorIds, sigla, nome,   // cnes/endereço saíram do formulário: os valores gravados ficam como estão
    fuso: _cqSelVal('cq-un-fuso') || 'America/Sao_Paulo', rtUserId: _cqSelVal('cq-un-rt') || null,
    // Setores do modelo antigo (sem vínculo); vinculada: mantém o valor gravado
    setores: orgSel ? _cqArr(antes?.setores) : [..._cqUnSt.legado],
    diasOperacao: [...document.querySelectorAll('#cq-drawer .cq-un-dia:checked')].map(x => Number(x.value)),
    ativa: _cqChk('cq-un-ativa'), validacao: _cqChk('cq-un-validacao'), membros,
    politica: { liberarAceitosAoSalvar: _cqChk('cq-un-pol-lib'), comentarioObrigatorioAlerta: _cqChk('cq-un-pol-com'),
                reautenticar: _cqChk('cq-un-pol-reauth'), retroativoHoras: Math.max(0, Number(_cqVal('cq-un-pol-retro')) || 0),
                modoCorrida: CQ_MODOS_CORRIDA[modo] ? modo : 'lote' },
    sistemas: _cqUnSis.map(x => ({ id: x.id, nome: x.nome, ...(x.descricao ? { descricao: x.descricao } : {}) })),
  };
  // Exceções por equipamento: preserva as de equipamentos que não aparecem agora (ex.: sem testes ativos)
  const modosEquip = { ...(antes?.politica?.modoCorridaEquip || {}) };
  document.querySelectorAll('#cq-drawer .cq-un-me:checked').forEach(r => { if (r.value) modosEquip[r.dataset.k] = r.value; else delete modosEquip[r.dataset.k]; });
  if (Object.keys(modosEquip).length) rec.politica.modoCorridaEquip = modosEquip;
  if (rec.rtUserId && !rec.membros[rec.rtUserId]) rec.membros[rec.rtUserId] = 'rt';
  if (!antes) { rec.criadoEm = _cqAgora(); rec.criadoPor = _cqAssinatura(); }
  const fmt = {
    rtUserId: v => _cqNomeUsuario(v) || v, ativa: v => v ? 'Sim' : 'Não', validacao: v => v ? 'Sim' : 'Não',
    orgUnidadeId: v => v ? (typeof _orgUnidade === 'function' && _orgUnidade(v) ? _orgUnidade(v).sigla + ' — ' + _orgUnidade(v).nome : v) : 'Sem vínculo',
    orgSetorIds: v => _cqArr(v).map(sid => _orgRotuloSetor(sid, { semUnidade: true }) || sid).join(', '),
    diasOperacao: v => _cqArr(v).map(i => CQ_DIAS[i]).join(', '), fuso: v => CQ_FUSOS[v] || v,
    membros: v => Object.entries(v || {}).map(([id, p]) => `${_cqNomeUsuario(id) || id} (${CQ_PAPEIS[p] || p})`).join('; '),
    politica: v => JSON.stringify(v),
    sistemas: v => _cqArr(v).map(x => x.descricao ? `${x.nome} (${x.descricao})` : x.nome).join('; '),
  };
  const diffs = antes ? _cqDiff(antes, rec, CQ_LBL_UNIDADE, fmt) : [];
  // "Todos os setores" aparece na trilha como texto, não como vazio
  diffs.forEach(d => { if (d.campo === CQ_LBL_UNIDADE.orgSetorIds) { if (d.antes === '—') d.antes = 'Todos'; if (d.depois === '—') d.depois = 'Todos'; } });
  if (antes && !diffs.length) { cqDrawerClose(); return; }
  _cqTrilhaAdd(rec, antes ? 'edicao' : 'criacao', antes ? 'Área alterada' : 'Área cadastrada', diffs);
  _cqSalvando = true;
  try {
    if (await _cqSalvarRegistro('unidades', rec)) {
      showToast(antes ? 'Área atualizada.' : 'Área cadastrada.', 'success');
      cqDrawerClose();
      _cqGarantirUnidadeAtiva();
      cqRenderConfig();
      cqRender();
    }
  } finally { _cqSalvando = false; }
}

function cqValidacaoForm() {
  _cqPrompt({
    titulo: 'Registrar validação do módulo', subtitulo: `Versão ${CQ_VERSAO} · RDC 978, art. 106`,
    corpo: `<div class="form-row"><div class="form-field"><label class="field-label">Data <span class="required">*</span></label><input type="date" id="cq-val-data" class="field-input" value="${_cqHoje()}"></div>
      <div class="form-field"><label class="field-label">Resultado <span class="required">*</span></label><select id="cq-val-res" class="field-select"><option value="aprovado">Aprovado</option><option value="reprovado">Reprovado</option></select></div></div>
      <div class="form-field"><label class="field-label">Escopo / protocolo executado <span class="required">*</span></label>
        <textarea id="cq-val-escopo" class="field-textarea" style="min-height:90px;" placeholder="Ex.: protocolo PV-CQ-01 — cálculos de média/DP/z, regras de Westgard com casos conhecidos, trilha de auditoria, permissões, relatórios. Testes automatizados: 45/45 aprovados."></textarea></div>
      <div class="form-field"><label class="field-label">Observações / desvios</label><textarea id="cq-val-obs" class="field-textarea" style="min-height:60px;"></textarea></div>`,
    confirmar: 'Assinar e registrar',
    onConfirm: async () => {
      const data = _cqVal('cq-val-data'), escopo = _cqVal('cq-val-escopo');
      if (!data || !escopo) { showToast('Informe a data e o escopo.', 'error'); return false; }
      const rec = { id: _cqUid(), versao: CQ_VERSAO, data, resultado: _cqVal('cq-val-res'), escopo, observacoes: _cqVal('cq-val-obs'),
                    assinatura: _cqAssinatura(), criadoEm: _cqAgora() };
      _cqTrilhaAdd(rec, 'criacao', 'Validação registrada');
      if (!(await _cqSalvarRegistro('validacoes', rec))) return false;
      showToast('Validação registrada.', 'success');
      cqRenderConfig();
      return true;
    },
  });
}

// Recalcula os índices da unidade ativa a partir dos registros (12 meses)
async function cqReconstruirIndices() {
  const u = _cqUnidadeAtivaId();
  if (!u || !_cqIsAdmin()) return;
  if (!_cqPodeGravar()) return;
  showToast('Reconstruindo índices…', 'success');
  const mesAtual = CQEngine.mesDe(_cqNowLocal());
  const meses = CQEngine.mesesAnteriores(mesAtual, 12);
  const corridas = (await Promise.all(meses.map(m => cqCarregarCorridasMes(u, m)))).flatMap(o => Object.values(o));
  const idx = { ultimo: {}, pendentes: {}, ncAbertas: {}, ciclosPendentes: {} };
  corridas.sort((a, b) => a.key.localeCompare(b.key)).forEach(c => {
    Object.entries(c.testes || {}).forEach(([t, ct]) => {
      if (ct.naoRealizado) return;
      idx.ultimo[t] = { dataHora: c.dataHora, corridaKey: c.key, mes: c.mes, status: ct.avaliacao?.status || 'aceito',
                        decisao: ct.decisao ? CQ_DECISAO[ct.decisao.acao]?.sigla : null, lr: ct.lr || null, lk: ct.lk || null };
    });
    const p = _cqResumoPendencia(c);
    if (p) idx.pendentes[c.key] = p;
    if (c.ciclo && !c.ciclo.vinculo && c.ciclo.status === 'em_analise' && typeof _cqEsterPendResumo === 'function') idx.ciclosPendentes[c.key] = _cqEsterPendResumo(c);
  });
  const ano = Number(mesAtual.slice(0, 4));
  for (const a of [ano, ano - 1]) {
    const ncs = await window.dbLoad(`${CQ_KEYS.acoes}/${u}/${a}`);
    Object.entries(ncs || {}).forEach(([id, nc]) => {
      if (nc && nc.status !== 'concluida' && nc.status !== 'cancelada') idx.ncAbertas[id] = { numero: nc.numero, testeId: nc.testeId, ano: a, abertaEm: nc.criadoEm };
    });
  }
  const ok = await window.dbUpdate({ [`${CQ_KEYS.indices}/${u}`]: idx });
  showToast(ok ? 'Índices reconstruídos.' : 'Falha ao gravar os índices.', ok ? 'success' : 'error');
}

// Apaga todos os nós do CQ (somente administrador). Antes da exclusão baixa
// uma cópia completa em JSON; se a leitura falhar, nada é apagado.
function cqApagarTudo() {
  if (!_cqIsAdmin()) { showToast('Somente administradores podem apagar os dados do CQ.', 'error'); return; }
  _cqPrompt({
    titulo: 'Apagar dados do Controle de Qualidade', subtitulo: 'Ação irreversível', perigo: true, confirmar: 'Apagar tudo',
    corpo: `<div class="cq-alerta-box">${CQ_ICO.alerta} Todos os dados do CQ de <b>todas as áreas</b> serão removidos do banco. Uma cópia em <code>.json</code> será baixada antes da exclusão.</div>
      <div class="form-field"><label class="field-label">Digite <b>APAGAR</b> para confirmar <span class="required">*</span></label>
        <input type="text" id="cq-apagar-conf" class="field-input" autocomplete="off" placeholder="APAGAR"></div>
      <div class="form-field"><label class="field-label">Sua senha <span class="required">*</span></label>
        <input type="password" id="cq-apagar-pwd" class="field-input" autocomplete="current-password" onkeydown="if(event.key==='Enter')cqPromptConfirmar()"></div>`,
    onConfirm: async () => {
      if (_cqVal('cq-apagar-conf').toUpperCase() !== 'APAGAR') { showToast('Digite APAGAR para confirmar.', 'error'); return false; }
      if (typeof authVerifyCurrentPassword !== 'function' || !(await authVerifyCurrentPassword(document.getElementById('cq-apagar-pwd')?.value || ''))) {
        showToast('Senha incorreta.', 'error'); return false;
      }
      if (!_cqPodeGravar()) return false;

      // dbGet (e não dbLoad, que devolve null tanto para "vazio" quanto para erro)
      const copia = {};
      try {
        const vals = await Promise.all(Object.values(CQ_KEYS).map(k => window.dbGet(k)));
        Object.values(CQ_KEYS).forEach((k, i) => { copia[k] = vals[i]; });
      } catch (err) {
        console.error('[cq.js] cqApagarTudo: falha ao ler os dados para a cópia:', err);
        showToast('Não foi possível ler os dados para a cópia de segurança. Nada foi apagado.', 'error');
        return false;
      }

      const agora = new Date();
      const u = _cqSess();
      const json = JSON.stringify({ _meta: { tipo: 'cq-copia-antes-exclusao', versao: CQ_VERSAO, geradoEm: agora.toISOString(), porId: u.id, porNome: u.nome, estacao: _cqEstacao() || 'não informada' }, ...copia }, null, 2);
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `cq-copia-antes-exclusao-${agora.toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      const updates = {};
      Object.values(CQ_KEYS).forEach(k => { updates[k] = null; });
      const ok = await window.dbUpdate(updates);
      if (!ok) { showToast('Falha ao apagar os dados do CQ. Nada foi removido.', 'error'); return false; }
      try { localStorage.removeItem('cq-unidade-ativa'); } catch (e) { /* sem storage */ }
      showToast('Dados do Controle de Qualidade apagados. Cópia baixada.', 'success');
      return true;
    },
  });
}

// Resumo de pendência de uma corrida (null quando todos os testes foram avaliados)
function _cqResumoPendencia(c) {
  const ts = Object.values(c.testes || {}).filter(ct => !ct.naoRealizado);
  const pend = ts.filter(ct => !ct.decisao);
  if (!pend.length) return null;
  const setorIds = _cqSetoresDosTestes(Object.entries(c.testes || {}).filter(([, ct]) => !ct.naoRealizado && !ct.decisao).map(([tid]) => tid));
  return { numero: c.numero || null, mes: c.mes || CQEngine.mesDe(c.key), dataHora: c.dataHora, equipNome: c.ativoSnap?.nome || c.sistemaAnalitico || '',
           nPend: pend.length, temRejeicao: pend.some(ct => ct.avaliacao?.status === 'rejeitado'), setorIds };
}

function _cqStatusCorrida(c) {
  const ts = Object.values(c.testes || {}).filter(ct => !ct.naoRealizado);
  // Ciclo de esterilização publicado sem testes: segue a situação do ciclo
  if (!ts.length && c.ciclo && !c.ciclo.vinculo && c.ciclo.status) return { em_analise: 'em_analise', reprovado: 'rejeitada' }[c.ciclo.status] || 'liberada';
  if (!ts.length) return 'liberada';
  if (ts.some(ct => !ct.decisao)) return 'pendente';
  const acoes = ts.map(ct => ct.decisao.acao);
  if (acoes.every(a => a === 'rejeitado')) return 'rejeitada';
  if (acoes.some(a => a === 'rejeitado')) return 'parcial';
  return 'liberada';
}

// ── ATALHOS USADOS POR OUTROS ARQUIVOS ───────────────────────
function cqAbrirGrafico(testeId) {
  if (typeof cqGraficoSelecionar === 'function') cqGraficoSelecionar(testeId);
  cqNav('graficos');
}
function cqAbrirAlvos(testeId) {
  cqNav('cadastros');
  if (typeof cqTesteForm === 'function') setTimeout(() => cqTesteForm(testeId, 'alvos'), 30);
}
