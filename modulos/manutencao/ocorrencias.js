// ═══════════════════════════════════════════════════════════════
// ocorrencias.js — Módulo de Ocorrências de Ativos — Manutenção LAMIC
// Registro e tratamento (ação imediata → impacto → causa → ações →
// eficácia → liberação → encerramento) de todo evento que impacta um ativo.
// Base: RDC ANVISA 978/2025, PALC (SBPC/ML) e ISO 15189:2022.
// ═══════════════════════════════════════════════════════════════

// ── STORAGE ──────────────────────────────────────────────────
// Cada ocorrência é gravada em seu próprio nó (ocorrencias/{id}) para que
// edições simultâneas de usuários diferentes não se sobrescrevam.
const OC_KEY = 'gestao-ocorrencias-v1';

const OC_CATALOGOS_PADRAO = {
  subtipos: {
    falha:             ['Não liga', 'Erro / alarme do equipamento', 'Resultado ou leitura inconsistente', 'Parada durante a rotina', 'Falha de software / interface', 'Ruído ou aquecimento anormal'],
    ambiental:         ['Temperatura fora da faixa', 'Umidade fora da faixa', 'Queda de energia', 'Oscilação elétrica', 'Falha do nobreak / gerador', 'Água reagente fora da especificação', 'Falha de climatização'],
    dano:              ['Queda / impacto', 'Derramamento de líquido', 'Dano no transporte', 'Dano estrutural'],
    acidente:          ['Acidente com operador', 'Exposição a material biológico', 'Choque elétrico', 'Corte / perfuração'],
    uso_indevido:      ['Operação fora do procedimento', 'Reagente ou insumo incorreto', 'Configuração alterada indevidamente', 'Operador não treinado'],
    alerta_fabricante: ['Recall', 'Alerta de segurança (field safety notice)', 'Atualização obrigatória', 'Não conformidade de lote'],
  },
  causasRaiz:         ['Desgaste natural', 'Falha de componente', 'Falta de manutenção', 'Erro operacional', 'Falha de treinamento', 'Causa externa (energia, clima, transporte)', 'Defeito de fabricação', 'Fim de vida útil', 'Procedimento inadequado', 'Não identificada'],
  metodosDetec:       ['Inspeção visual', 'Alarme do equipamento', 'Relato do operador', 'Monitoramento de temperatura', 'Controle de qualidade', 'Manutenção preventiva', 'Comunicado do fabricante'],
  criteriosLiberacao: ['Teste funcional aprovado', 'Controle de qualidade aprovado', 'Calibração / verificação aprovada', 'Qualificação pelo fornecedor', 'Laudo técnico de terceiro'],
  motivosRetirada:    ['Conserto inviável técnica ou economicamente', 'Fim de vida útil / obsolescência', 'Substituído por outro equipamento', 'Aguardando peça ou reparo sem previsão', 'Aguardando decisão da gestão', 'Devolvido ao fornecedor / comodato encerrado'],
};

let ocState = {
  ocorrencias: {},
  catalogos: JSON.parse(JSON.stringify(OC_CATALOGOS_PADRAO)),
};

// Flag: true após o Firebase responder pela primeira vez
let _ocFirebaseReady = false;

// ── CONSTANTES ────────────────────────────────────────────────
const OC_TIPOS = {
  falha:             { label: 'Falha / Parada',             cls: 'oc-tipo-falha'     },
  ambiental:         { label: 'Ambiental / Infraestrutura', cls: 'oc-tipo-ambiental' },
  dano:              { label: 'Dano',                       cls: 'oc-tipo-dano'      },
  acidente:          { label: 'Acidente',                   cls: 'oc-tipo-acidente'  },
  uso_indevido:      { label: 'Uso indevido',               cls: 'oc-tipo-uso'       },
  alerta_fabricante: { label: 'Alerta do fabricante',       cls: 'oc-tipo-alerta'    },
};

const OC_STATUS = {
  aberta:              { label: 'Aberta',                cls: 'oc-st-aberta'    },
  em_tratamento:       { label: 'Em tratamento',         cls: 'oc-st-tratamento' },
  aguardando_eficacia: { label: 'Aguardando eficácia',   cls: 'oc-st-eficacia'  },
  encerrada:           { label: 'Encerrada',             cls: 'oc-st-encerrada' },
  cancelada:           { label: 'Cancelada',             cls: 'oc-st-cancelada' },
};

const OC_SEV = {
  baixa:   { label: 'Baixa',   cls: 'ot-badge-sev-baixa'   },
  media:   { label: 'Média',   cls: 'ot-badge-sev-media'   },
  alta:    { label: 'Alta',    cls: 'ot-badge-sev-alta'    },
  critica: { label: 'Crítica', cls: 'ot-badge-sev-critica' },
};

const OC_AFETA = { sim: 'Sim', nao: 'Não', em_avaliacao: 'Em avaliação' };
const OC_ACAO_RESULTADOS = {
  nenhuma:            'Nenhuma ação necessária',
  repeticao:          'Repetição das análises',
  retificacao_laudo:  'Retificação / recolhimento de laudos',
  comunicacao_medico: 'Comunicação ao médico solicitante',
  outra:              'Outra (descrever)',
};
const OC_METODO_CAUSA = { '5porques': '5 Porquês', ishikawa: 'Ishikawa (6M)', outro: 'Outro / análise direta' };
const OC_ISHIKAWA = { metodo: 'Método', maquina: 'Máquina', material: 'Material', maoDeObra: 'Mão de obra', meioAmbiente: 'Meio ambiente', medicao: 'Medição' };
const OC_DESTINOS = { anvisa_notivisa: 'ANVISA (NOTIVISA / tecnovigilância)', fabricante: 'Fabricante / distribuidor', visa_local: 'Vigilância sanitária local' };
const OC_ETAPAS_ANEXO = { registro: 'Registro', acoes: 'Ações', liberacao: 'Liberação', notificacao: 'Notificação' };
// Desfecho de cada ativo parado: volta a operar ou sai de uso (temporária ou definitivamente).
// Os dois últimos resolvem a pendência da ocorrência e levam o ativo para "Em desuso".
const OC_DESFECHOS = {
  retorno: { label: 'Retorno ao uso',                    curto: 'Retornou ao uso',  dataLbl: 'Data/hora do retorno ao uso' },
  desuso:  { label: 'Fora de uso (sem previsão de retorno)', curto: 'Fora de uso',  dataLbl: 'Data/hora da retirada de uso' },
  baixa:   { label: 'Desativado / baixa definitiva',     curto: 'Desativado',       dataLbl: 'Data/hora da desativação' },
};

// Apresentação dos desfechos no popover de seleção (ico = chave de OC_ICO)
const OC_DESF_UI = {
  retorno: { ico: 'unlock', desc: 'Verificado e liberado para operar. Exige as OTs de pausa concluídas.' },
  desuso:  { ico: 'lock',   desc: 'Retirado de uso, aguardando decisão ou peça. Pode voltar em outro registro.' },
  baixa:   { ico: 'ban',    desc: 'Encerrado definitivamente: descarte, devolução ou substituição.' },
};

const OC_LBL_REGISTRO = {
  tipo: 'Tipo', subtipo: 'Subtipo', titulo: 'Título', descricao: 'Descrição',
  dataHoraOcorrencia: 'Data/hora da ocorrência', dataHoraDeteccao: 'Data/hora da detecção',
  metodoDetec: 'Método de detecção', severidade: 'Severidade',
};
const OC_LBL_ESPEC = {
  leitura: 'Leitura registrada', faixaAceitavel: 'Faixa aceitável', unidade: 'Unidade', duracaoMin: 'Duração (min)',
  pessoasEnvolvidas: 'Pessoas envolvidas', houveLesao: 'Houve lesão', comunicadoSESMT: 'Comunicado ao SESMT',
  fabricante: 'Fabricante', numAlerta: 'Nº do alerta', lotesAfetados: 'Lotes / séries afetados',
};
const OC_LBL_IMPACTO = {
  afetaResultados: 'Afeta resultados de pacientes', periodoDe: 'Período afetado (de)', periodoAte: 'Período afetado (até)',
  examesAfetados: 'Exames afetados', qtdAmostras: 'Qtd. de amostras', laudosLiberadosAfetados: 'Laudos liberados afetados',
  acaoResultados: 'Ação sobre resultados', riscoPaciente: 'Risco ao paciente', riscoOperador: 'Risco ao operador',
  justificativa: 'Fundamentação',
};
const OC_LBL_CAUSA = { metodo: 'Método de análise', porques: '5 Porquês', ishikawa: 'Ishikawa', causaRaiz: 'Causa raiz', descricao: 'Conclusão da análise' };
const OC_LBL_EFICACIA = { prevista: 'Verificação prevista', verificadaEm: 'Verificada em', eficaz: 'Eficaz', descricao: 'Evidência da eficácia' };
const OC_LBL_NOTIF = { requer: 'Requer notificação', destinos: 'Destinos', protocolo: 'Protocolo', data: 'Data da notificação', descricao: 'Descrição' };

const OC_FMT = {
  tipo:            v => OC_TIPOS[v]?.label || v,
  severidade:      v => OC_SEV[v]?.label || v,
  afetaResultados: v => OC_AFETA[v] || v,
  acaoResultados:  v => OC_ACAO_RESULTADOS[v] || v,
  metodo:          v => OC_METODO_CAUSA[v] || v,
  destinos:        v => (v || []).map(d => OC_DESTINOS[d] || d).join(', '),
  ishikawa:        v => Object.entries(v || {}).filter(([, x]) => x).map(([k, x]) => `${OC_ISHIKAWA[k] || k}: ${x}`).join(' · '),
  porques:         v => (v || []).filter(Boolean).map((x, i) => `${i + 1}) ${x}`).join(' '),
  requer:          v => v === true ? 'Sim' : v === false ? 'Não' : '—',
};

const OC_PAGE_SIZE = 20;

const OC_ICO = {
  alerta:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  plus:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  check:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
  close:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  search:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  ativo:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`,
  user:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`,
  upload:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
  clip:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>`,
  print:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>`,
  ot:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>`,
  lock:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>`,
  unlock:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 019.9-1"/></svg>`,
  trash:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>`,
  ban:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`,
  undo:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>`,
  edit:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>`,
  clock:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  wrench:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>`,
  list:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r="1.5" fill="currentColor"/><circle cx="3" cy="12" r="1.5" fill="currentColor"/><circle cx="3" cy="18" r="1.5" fill="currentColor"/></svg>`,
};

// ── ESTADO LOCAL DO MÓDULO ────────────────────────────────────
let _ocViewId       = null;
let _ocViewTab      = 'registro';
let _ocFormId       = null;   // null = nova ocorrência
let _ocFormAtivos   = [];     // [{ ativoId, parado, dataHoraParada, persistido }]
let _ocFormAnexos   = [];
let _ocFormOrigem   = null;   // { tipo:'ot', otId, otNumero } quando aberta a partir de uma OT
let _ocPickerSel    = new Set();
let _ocSalvando     = false;
let _ocPickerModo   = 'form'; // 'form' | 'filtro'
let _ocPromptCb     = null;
let _ocPage         = 0;
let _ocSort         = { col: 'dataHoraOcorrencia', dir: -1 };
let _ocFiltro       = { q: '', ativoId: null, tipo: '', sev: '', status: 'abertas', periodo: '12meses', de: '', ate: '', minhas: false };
let _ocAtivoModo    = 'ocorrencias'; // sub-aba do ativo: 'ocorrencias' | 'timeline'

// ── INICIALIZAÇÃO ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  ocLoad();
  _ocInjectModals();
  _ocExtendUpload();
  _ocHookTab();
});

function ocLoad() {
  window._dbReady.then(() => {
    window.dbListen(OC_KEY, (data) => {
      const firstLoad = !_ocFirebaseReady;
      _ocFirebaseReady = true;
      _ocApplyData(data);
      ocRender();
      _ocRefreshViewRemoto();
      _ocUpdateNavBadge();
      if (typeof _renderAtivoOcorrencias === 'function' && document.getElementById('avtab-ocorrencias')?.style.display === 'block') {
        _renderAtivoOcorrencias();
      }
      if (document.getElementById('cpanel-ocorrencias')?.classList.contains('active')) ocRenderConfigCatalogos();
      if (typeof renderHome === 'function' && (firstLoad || document.getElementById('tab-inicio')?.classList.contains('active'))) renderHome();
    });
  });
}

function _ocApplyData(d) {
  const ocs = {};
  const src = (d && typeof d === 'object' && d.ocorrencias) ? d.ocorrencias : {};
  Object.entries(src).forEach(([id, oc]) => {
    if (oc && typeof oc === 'object') ocs[id] = _ocNormalizar({ ...oc, id });
  });
  ocState.ocorrencias = ocs;
  const c = d?.catalogos;
  if (c && typeof c === 'object') {
    ['causasRaiz', 'metodosDetec', 'criteriosLiberacao', 'motivosRetirada'].forEach(k => {
      if (Array.isArray(c[k])) ocState.catalogos[k] = c[k];
    });
    if (c.subtipos && typeof c.subtipos === 'object') {
      Object.keys(OC_TIPOS).forEach(t => {
        if (Array.isArray(c.subtipos[t])) ocState.catalogos.subtipos[t] = c.subtipos[t];
      });
    }
  }
}

// O Firebase descarta arrays e objetos vazios e pode devolver arrays como objetos
function _ocArr(v) {
  if (Array.isArray(v)) return v.filter(x => x !== null && x !== undefined);
  if (v && typeof v === 'object') return Object.values(v);
  return [];
}

function _ocNormalizar(oc) {
  // Modelo antigo (um ativo por ocorrência) → lista de ativos afetados
  if (!oc.ativos && oc.ativoId) {
    oc.ativos = [{ ativoId: oc.ativoId, snapshot: oc.ativoSnapshot || {}, parado: !!oc.equipamentoParado,
                   dataHoraParada: oc.dataHoraParada || '', liberacao: oc.liberacao || {} }];
  }
  ['ativoId', 'ativoSnapshot', 'equipamentoParado', 'dataHoraParada', 'liberacao'].forEach(k => delete oc[k]);
  oc.ativos = _ocArr(oc.ativos).map(a => ({ ...a, snapshot: a.snapshot || {}, liberacao: a.liberacao || {}, parado: !!a.parado, dataHoraParada: a.dataHoraParada || '' }));
  oc.trilha           = _ocArr(oc.trilha).map(t => ({ ...t, diffs: _ocArr(t.diffs) }));
  oc.acoes            = _ocArr(oc.acoes);
  oc.anexos           = _ocArr(oc.anexos);
  oc.otIds            = _ocArr(oc.otIds);
  oc.dadosEspecificos = oc.dadosEspecificos || {};
  oc.acaoImediata     = oc.acaoImediata     || {};
  oc.impacto          = oc.impacto          || {};
  oc.analiseCausa     = oc.analiseCausa     || {};
  oc.analiseCausa.porques  = _ocArr(oc.analiseCausa.porques);
  oc.analiseCausa.ishikawa = oc.analiseCausa.ishikawa || {};
  oc.eficacia         = oc.eficacia         || {};
  oc.eficaciaHistorico = _ocArr(oc.eficaciaHistorico);
  oc.notificacao      = oc.notificacao      || {};
  oc.notificacao.destinos = _ocArr(oc.notificacao.destinos);
  oc.acoesNA          = oc.acoesNA          || {};
  oc.encerramento     = oc.encerramento     || {};
  oc.cancelamento     = oc.cancelamento     || {};
  oc.status           = oc.status           || 'aberta';
  return oc;
}

async function _ocPersistir(oc) {
  oc.atualizadoEm = _ocAgora();
  ocState.ocorrencias[oc.id] = oc;
  await window.dbSave(`${OC_KEY}/ocorrencias/${oc.id}`, oc);
}

function _ocSalvarCatalogos() {
  if (_ocFirebaseReady) window.dbSave(`${OC_KEY}/catalogos`, ocState.catalogos);
}

async function _ocProximoNumero() {
  const ano = new Date().getFullYear();
  const n = await window.dbTransaction(`${OC_KEY}/seq/${ano}`, v => (Number(v) || 0) + 1);
  const seq = n || (Object.values(ocState.ocorrencias).filter(o => (o.numero || '').startsWith(`OC-${ano}-`)).length + 1);
  return `OC-${ano}-${String(seq).padStart(3, '0')}`;
}

// ── HELPERS ───────────────────────────────────────────────────
function _ocUid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function _ocEsc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function _ocClone(o) { return o ? _ocNormalizar(JSON.parse(JSON.stringify(o))) : null; }
function _ocAgora() { return new Date().toISOString(); }
function _ocPad(n) { return String(n).padStart(2, '0'); }
function _ocNowLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${_ocPad(d.getMonth() + 1)}-${_ocPad(d.getDate())}T${_ocPad(d.getHours())}:${_ocPad(d.getMinutes())}`;
}
function _ocHoje() { return _ocNowLocal().slice(0, 10); }
function _ocIsoParaLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return `${d.getFullYear()}-${_ocPad(d.getMonth() + 1)}-${_ocPad(d.getDate())}T${_ocPad(d.getHours())}:${_ocPad(d.getMinutes())}`;
}
function _ocFmtData(s) {
  if (!s) return '—';
  const [y, m, d] = String(s).slice(0, 10).split('-');
  return d ? `${d}/${m}/${y}` : '—';
}
function _ocFmtDH(s) {
  if (!s) return '—';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return `${_ocFmtData(s)} ${s.slice(11, 16)}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return _ocFmtData(s);
  const d = new Date(s);
  if (isNaN(d)) return _ocFmtData(s);
  return `${_ocPad(d.getDate())}/${_ocPad(d.getMonth() + 1)}/${d.getFullYear()} ${_ocPad(d.getHours())}:${_ocPad(d.getMinutes())}`;
}
function _ocFmtVal(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'object') return JSON.stringify(v);
  if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(String(v))) return _ocFmtDH(v);
  return String(v);
}
function _ocSess() {
  const s = typeof currentSession !== 'undefined' ? currentSession : null;
  return { id: s?.userId || null, nome: s?.nomeCompleto || s?.username || 'Sistema' };
}
function _ocAssinatura() {
  const u = _ocSess();
  return { porId: u.id, porNome: u.nome, em: _ocAgora() };
}
function _ocCan(k) { return typeof authHasPermission !== 'function' || authHasPermission('ocorrencias.' + k); }
function _ocIsAdmin() { return typeof currentSession !== 'undefined' && !!currentSession?.isAdmin; }
function _ocAberta(oc) { return !['encerrada', 'cancelada'].includes(oc.status); }
function _ocUsuarios() {
  const users = typeof authState !== 'undefined' ? (authState.users || []) : [];
  return users.filter(u => u.ativo !== false).sort((a, b) => (a.nomeCompleto || '').localeCompare(b.nomeCompleto || ''));
}
// Primeiro ativo da ocorrência que ainda existe no cadastro
function _ocAtivoDe(oc) {
  if (typeof _ativoById !== 'function') return null;
  return oc.ativos.map(a => _ativoById(a.ativoId)).find(Boolean) || null;
}
function _ocVisivel(oc) {
  if (typeof _userCanSeeAtivo !== 'function' || !oc.ativos.length) return true;
  return oc.ativos.some(a => _userCanSeeAtivo((typeof _ativoById === 'function' && _ativoById(a.ativoId)) || a.snapshot));
}
function _ocTemParado(oc)        { return oc.ativos.some(a => a.parado); }
function _ocParadosPendentes(oc) { return oc.ativos.filter(a => a.parado && !a.liberacao.liberado); }
// Registros anteriores ao desfecho só tinham a liberação para uso, datada pela assinatura
function _ocDesfecho(l)  { return l.desfecho || 'retorno'; }
function _ocDataDesfecho(l) { return l.dataHora || l.em || ''; }
function _ocNomesAtivos(oc, max = 3) {
  const nomes = oc.ativos.map(a => a.snapshot.nome || '—');
  return nomes.length > max ? `${nomes.slice(0, max).join(', ')} +${nomes.length - max}` : nomes.join(', ');
}
// "NTO · Hematologia" do snapshot (gravado na abertura) ou, em registros antigos, pelo cadastro atual
function _ocRotuloSetor(s) {
  if (!s) return '';
  if (s.unidade && s.setor) return `${s.unidade} · ${s.setor}`;
  return typeof _orgRotuloRef === 'function' ? _orgRotuloRef(s.setorId, s.setor) : (s.setor || '');
}
function _ocMetaAtivo(s) {
  const amb = typeof _orgRotuloAmbienteRef === 'function' ? _orgRotuloAmbienteRef(s.ambienteId, s.ambiente) : (s.ambiente || '');
  return [s.codigo, _ocRotuloSetor(s), amb, s.marca && s.marca !== '-' ? s.marca : '', s.modelo && s.modelo !== '-' ? s.modelo : '', s.serie && s.serie !== '-' ? 'S/N ' + s.serie : ''].filter(Boolean).join(' · ');
}
function _ocSnapshotAtivo(a) {
  const ref = a && typeof _orgRefDoAtivo === 'function' ? _orgRefDoAtivo(a) : { setor: a?.setor || '', setorId: '', unidadeId: '' };
  return a ? { nome: a.nome || '', codigo: a.codigo || '', setor: ref.setor, setorId: ref.setorId, unidadeId: ref.unidadeId,
               ambienteId: ref.ambienteId || '', ambiente: ref.ambiente || '',
               unidade: ref.unidadeId && typeof _orgSiglaUnidade === 'function' ? _orgSiglaUnidade(ref.unidadeId) : '', categoria: a.categoria || '',
               tipo: a.tipo || '', marca: a.marca || '', modelo: a.modelo || '', serie: a.serie || '' } : {};
}
function _ocVal(id) { const el = document.getElementById(id); return el ? String(el.value ?? '').trim() : ''; }
function _ocChk(id) { return !!document.getElementById(id)?.checked; }
function _ocRadio(name) { return document.querySelector(`input[name="${name}"]:checked`)?.value || ''; }
function _ocOptions(lista, atual, vazio = '— Selecione —') {
  const itens = [...lista];
  if (atual && !itens.includes(atual)) itens.unshift(atual); // valor antigo fora do catálogo continua visível
  return `<option value="">${vazio}</option>` + itens.map(v => `<option value="${_ocEsc(v)}" ${v === atual ? 'selected' : ''}>${_ocEsc(v)}</option>`).join('');
}
function _ocMapOptions(map, atual, vazio = '— Selecione —') {
  return (vazio !== null ? `<option value="">${vazio}</option>` : '') +
    Object.entries(map).map(([k, v]) => `<option value="${k}" ${k === atual ? 'selected' : ''}>${_ocEsc(typeof v === 'string' ? v : v.label)}</option>`).join('');
}
function _ocBadgeStatus(st) { const c = OC_STATUS[st] || {}; return `<span class="oc-badge ${c.cls || ''}">${c.label || st || '—'}</span>`; }
function _ocBadgeTipo(t)    { const c = OC_TIPOS[t]  || {}; return `<span class="oc-badge ${c.cls || ''}">${c.label || t || '—'}</span>`; }
function _ocBadgeSev(s)     { const c = OC_SEV[s]    || {}; return `<span class="ot-badge ${c.cls || ''}">${c.label || s || '—'}</span>`; }

// ── TRILHA DE AUDITORIA ──────────────────────────────────────
// Somente acrescentada: cada alteração registra quem, quando e o que mudou.
function _ocTrilha(oc, acao, texto, diffs, extras) {
  const u = _ocSess();
  oc.trilha.push({ ts: _ocAgora(), userId: u.id, userName: u.nome, acao, texto: texto || '', diffs: diffs || [], ...(extras || {}) });
}

function _ocDiff(antes, depois, labels) {
  const diffs = [];
  Object.keys(labels).forEach(k => {
    const a = antes?.[k], b = depois?.[k];
    const ja = JSON.stringify(a ?? null), jb = JSON.stringify(b ?? null);
    if (ja === jb) return;
    if ((a === undefined || a === '' || a === null) && (b === undefined || b === '' || b === null)) return;
    const fmt = OC_FMT[k] || _ocFmtVal;
    diffs.push({ campo: labels[k], antes: (a === undefined || a === null || a === '') ? '—' : fmt(a), depois: (b === undefined || b === null || b === '') ? '—' : fmt(b) });
  });
  return diffs;
}

// ── REGRAS DO FLUXO ──────────────────────────────────────────
function _ocImpactoOk(oc)     { const i = oc.impacto; return ['sim', 'nao'].includes(i.afetaResultados) && !!(i.justificativa || '').trim() && (i.afetaResultados === 'nao' || !!i.acaoResultados); }
function _ocCausaOk(oc)       { return !!oc.analiseCausa.causaRaiz && !!(oc.analiseCausa.descricao || '').trim(); }
function _ocAcoesOk(oc)       { return oc.acoes.length > 0 ? oc.acoes.every(a => a.status === 'concluida') : !!(oc.acoesNA.justificativa || '').trim(); }
function _ocEficaciaOk(oc)    { return !!oc.eficacia.verificadaEm && oc.eficacia.eficaz === true; }
function _ocLiberacaoOk(oc)   { return _ocParadosPendentes(oc).length === 0; }
function _ocNotificacaoOk(oc) { const n = oc.notificacao; return n.requer === false || (n.requer === true && !!n.protocolo && !!n.data); }

function _ocPendencias(oc) {
  const p = [];
  if (!(oc.acaoImediata.texto || '').trim()) p.push({ tab: 'registro',    texto: 'Registrar a ação imediata (contenção)' });
  if (!_ocImpactoOk(oc))                     p.push({ tab: 'impacto',     texto: 'Avaliar o impacto nos resultados' });
  if (!_ocCausaOk(oc))                       p.push({ tab: 'causa',       texto: 'Analisar a causa raiz' });
  if (!_ocAcoesOk(oc))                       p.push({ tab: 'acoes',       texto: oc.acoes.length ? 'Concluir as ações corretivas' : 'Definir as ações corretivas' });
  if (!_ocEficaciaOk(oc))                    p.push({ tab: 'eficacia',    texto: oc.eficacia.eficaz === false ? 'Ações ineficazes: registrar novas ações' : 'Verificar a eficácia das ações' });
  if (!_ocLiberacaoOk(oc)) {
    const n = _ocParadosPendentes(oc).length;
    p.push({ tab: 'eficacia', texto: n > 1 ? `Registrar o retorno ou a retirada de uso de ${n} ativos parados` : 'Registrar o retorno ou a retirada de uso do ativo parado' });
  }
  if (!_ocNotificacaoOk(oc))                 p.push({ tab: 'notificacao', texto: oc.notificacao.requer === true ? 'Registrar protocolo da notificação' : 'Avaliar a necessidade de notificação' });
  return p;
}

function _ocStatusCalculado(oc) {
  if (!_ocAberta(oc)) return oc.status;
  if (!(oc.acaoImediata.texto && _ocImpactoOk(oc) && _ocCausaOk(oc))) return 'aberta';
  if (!_ocAcoesOk(oc)) return 'em_tratamento';
  return 'aguardando_eficacia';
}

function _ocAtualizarStatus(oc) {
  const novo = _ocStatusCalculado(oc);
  if (novo === oc.status) return;
  const antes = oc.status;
  _ocTrilha(oc, 'status', `Status: ${OC_STATUS[antes]?.label || antes} → ${OC_STATUS[novo]?.label || novo}`, [], { statusAntes: antes, statusDepois: novo });
  oc.status = novo;
}

// Grava, recalcula o status e atualiza todas as telas abertas
async function _ocCommit(oc, msg, opts = {}) {
  _ocAtualizarStatus(oc);
  const draft = opts.manterDraft ? _ocCapturarDraft() : null;
  await _ocPersistir(oc);
  if (_ocViewId === oc.id && document.getElementById('modal-oc-view')?.classList.contains('open')) {
    _ocRenderView(oc, opts.tab || _ocViewTab);
    if (draft) _ocRestaurarDraft(draft);
  }
  ocRender();
  _ocUpdateNavBadge();
  if (typeof _renderAtivoOcorrencias === 'function') _renderAtivoOcorrencias();
  if (msg) showToast(msg, 'success');
}

// Preserva o que o usuário digitou numa aba quando ela é redesenhada (ex.: após upload)
function _ocCapturarDraft() {
  const body = document.getElementById('oc-view-tab-body');
  if (!body) return null;
  const d = {};
  body.querySelectorAll('input[id], select[id], textarea[id]').forEach(el => {
    if (el.type === 'file') return;
    d[el.id] = (el.type === 'checkbox') ? { c: el.checked } : { v: el.value };
  });
  body.querySelectorAll('input[type="radio"]:checked').forEach(el => { d['__radio_' + el.name] = { r: el.value }; });
  return d;
}
function _ocRestaurarDraft(d) {
  Object.entries(d).forEach(([id, x]) => {
    if (id.startsWith('__radio_')) {
      const el = document.querySelector(`input[name="${id.slice(8)}"][value="${x.r}"]`);
      if (el) el.checked = true;
      return;
    }
    const el = document.getElementById(id);
    if (!el || el.type === 'file') return;
    if ('c' in x) el.checked = x.c; else el.value = x.v;
  });
  ocImpactoToggle(); ocCausaMetodoChange(); ocNotifToggle(); ocAcoesNAToggle(); ocLibDesfechoToggle();
}

// ── PAUSA E LIBERAÇÃO DO ATIVO ───────────────────────────────
// Cada ativo parado da ocorrência é retirado de uso e só retorna a "Em uso"
// com a sua liberação formal registrada na própria ocorrência.
function ocPausaResolvida(ocId, ativoId) {
  if (!_ocFirebaseReady) return false;
  const oc = ocState.ocorrencias[ocId];
  if (!oc || oc.status === 'cancelada') return true;
  const itens = ativoId ? oc.ativos.filter(a => a.ativoId === ativoId) : oc.ativos;
  return itens.every(a => !a.parado || !!a.liberacao.liberado);
}

function _ocAplicarPausa(oc) {
  if (oc.status === 'cancelada' || typeof state === 'undefined' || typeof _ativoIdxById !== 'function') return;
  const retirados = [];
  _ocParadosPendentes(oc).forEach(item => {
    const idx = _ativoIdxById(item.ativoId);
    if (idx < 0) return;
    const a = state.ativos[idx];
    const lista = a.pausaOcorrencias || [];
    if (a.statusUso === 'em_pausa' && lista.includes(oc.id)) return;
    state.ativos[idx] = {
      ...a,
      statusUso: 'em_pausa',
      pausaOTs: a.statusUso === 'em_pausa' ? (a.pausaOTs || []) : [],
      pausaOcorrencias: Array.from(new Set([...lista, oc.id])),
    };
    retirados.push(a.nome);
  });
  if (!retirados.length) return;
  saveState();
  showToast(`${retirados.length > 1 ? 'Ativos' : 'Ativo'} ${retirados.map(n => `"${n}"`).join(', ')} retirado(s) de uso (Em pausa) até a liberação formal.`, 'success');
}

function _ocReavaliarAtivo(oc) {
  if (typeof state === 'undefined' || typeof _ativoIdxById !== 'function') return;
  const pendencias = [];
  oc.ativos.forEach(item => {
    const idx = _ativoIdxById(item.ativoId);
    if (idx < 0) return;
    const a = state.ativos[idx];
    if (a.statusUso !== 'em_pausa' || !(a.pausaOcorrencias || []).includes(oc.id)) return;
    if (_ativoAvaliarRetornoUso(idx)) return;
    const otsAbertas = (a.pausaOTs || []).map(pid => (typeof otState !== 'undefined' ? otState.ordens : []).find(o => o.id === pid))
      .filter(o => o && !['concluida', 'cancelada'].includes(o.status)).map(o => o.numero);
    const ocsAbertas = (a.pausaOcorrencias || []).filter(id => !ocPausaResolvida(id, a.id)).map(id => ocState.ocorrencias[id]?.numero).filter(Boolean);
    const pend = [...otsAbertas, ...ocsAbertas];
    if (pend.length) pendencias.push(`"${a.nome}" (${pend.join(', ')})`);
  });
  if (pendencias.length) showToast(`Continua(m) em pausa: ${pendencias.join('; ')}.`, 'error');
}

// ── CONSULTAS USADAS POR OUTROS MÓDULOS ───────────────────────
function ocListarPorAtivo(ativoId, { incluirCanceladas = false } = {}) {
  if (!ativoId) return [];
  return Object.values(ocState.ocorrencias)
    .filter(oc => oc.ativos.some(a => a.ativoId === ativoId) && (incluirCanceladas || oc.status !== 'cancelada'))
    .sort((a, b) => (b.dataHoraOcorrencia || '').localeCompare(a.dataHoraOcorrencia || ''));
}

function ocBadgeLink(ocId) {
  const oc = ocState.ocorrencias[ocId];
  const label = oc ? oc.numero : 'Ocorrência excluída';
  return `<span class="ot-view-hero-badge"><span class="oc-badge oc-badge-link" ${oc ? `onclick="ocAbrirDeOT('${ocId}')"` : ''} title="Ocorrência vinculada">${OC_ICO.alerta}${_ocEsc(label)}</span></span>`;
}

function ocAbrirDeOT(ocId) {
  if (typeof otCloseModal === 'function') otCloseModal('modal-ot-view');
  ocOpenView(ocId);
}

// ── ABA PRINCIPAL ────────────────────────────────────────────
function _ocHookTab() {
  const tabEl = document.getElementById('tab-ocorrencias');
  if (!tabEl) return;
  const obs = new MutationObserver(() => { if (tabEl.classList.contains('active')) _ocInitTab(); });
  obs.observe(tabEl, { attributes: true, attributeFilter: ['class'] });
  if (tabEl.classList.contains('active')) _ocInitTab();
}

function _ocInitTab() {
  const tabEl = document.getElementById('tab-ocorrencias');
  if (!tabEl) return;
  if (tabEl.dataset.ocInit !== '1') {
    tabEl.dataset.ocInit = '1';
    tabEl.innerHTML = _ocBuildTabHTML();
  }
  ocRender();
}

function _ocBuildTabHTML() {
  return `
<div class="ot-wrapper oc-wrapper">
  <div class="oc-kpis" id="oc-kpis"></div>
  <div class="ot-toolbar">
    <div class="ot-search">
      ${OC_ICO.search}
      <input type="text" id="oc-search-input" placeholder="Buscar ocorrência..." oninput="ocFiltroSet('q', this.value)">
    </div>
    <div style="display:flex;align-items:center;gap:4px;">
      <div id="oc-filter-ativo-wrap" class="ot-filter-ativo-wrap" onclick="ocOpenAtivoPicker('filtro')" title="Filtrar por ativo" style="cursor:pointer;">
        ${OC_ICO.ativo}<span id="oc-filter-ativo-label">Selecionar ativo</span>
      </div>
      <button class="ot-filter-ativo-btn" id="oc-filter-ativo-clear" onclick="ocFiltroSet('ativoId', null)" title="Limpar ativo" style="display:none;">×</button>
    </div>
    <select class="ot-filter-select" id="oc-filter-tipo" onchange="ocFiltroSet('tipo', this.value)">
      ${_ocMapOptions(OC_TIPOS, '', 'Todos os tipos')}
    </select>
    <select class="ot-filter-select" id="oc-filter-sev" onchange="ocFiltroSet('sev', this.value)">
      <option value="">Toda severidade</option>
      <option value="critica">Crítica</option><option value="alta">Alta</option>
      <option value="media">Média</option><option value="baixa">Baixa</option>
    </select>
    <select class="ot-filter-select" id="oc-filter-status" onchange="ocFiltroSet('status', this.value)">
      <option value="abertas" selected>Em aberto</option>
      ${_ocMapOptions(OC_STATUS, '', null)}
      <option value="todas">Todas</option>
    </select>
    <select class="ot-filter-select" id="oc-filter-periodo" onchange="ocFiltroSet('periodo', this.value)">
      <option value="12meses" selected>Últimos 12 meses</option>
      <option value="ano">Ano corrente</option>
      <option value="todos">Todo o período</option>
      <option value="custom">Personalizado</option>
    </select>
    <span id="oc-filter-custom" style="display:none;align-items:center;gap:6px;">
      <input type="date" class="field-input oc-date-input" id="oc-filter-de" onchange="ocFiltroSet('de', this.value)">
      <span style="color:var(--text-muted);font-size:12px;">até</span>
      <input type="date" class="field-input oc-date-input" id="oc-filter-ate" onchange="ocFiltroSet('ate', this.value)">
    </span>
    <div class="ot-toolbar-spacer"></div>
    <button class="ot-my-ots-btn" id="oc-minhas-btn" onclick="ocFiltroSet('minhas', !_ocFiltro.minhas)" title="Ocorrências com pendências atribuídas a mim">
      ${OC_ICO.user} Minhas pendências
    </button>
  </div>
  <div id="oc-main" class="oc-main"></div>
  ${_ocCan('registrar') ? `<button class="ot-fab" onclick="ocOpenForm(null)" title="Registrar ocorrência">${OC_ICO.plus}</button>` : ''}
</div>`;
}

function ocFiltroSet(k, v) {
  _ocFiltro[k] = v;
  _ocPage = 0;
  if (k === 'periodo') {
    const c = document.getElementById('oc-filter-custom');
    if (c) c.style.display = v === 'custom' ? 'inline-flex' : 'none';
  }
  if (k === 'minhas') document.getElementById('oc-minhas-btn')?.classList.toggle('active', !!v);
  if (k === 'ativoId') {
    const a = v && typeof _ativoById === 'function' ? _ativoById(v) : null;
    const lbl = document.getElementById('oc-filter-ativo-label');
    if (lbl) lbl.textContent = a ? a.nome : 'Selecionar ativo';
    document.getElementById('oc-filter-ativo-wrap')?.classList.toggle('active', !!v);
    const clr = document.getElementById('oc-filter-ativo-clear');
    if (clr) clr.style.display = v ? '' : 'none';
  }
  ocRender();
}

function _ocEhMinha(oc) {
  const me = _ocSess().id;
  if (!me) return false;
  if (oc.acoes.some(a => a.status !== 'concluida' && a.responsavelId === me)) return true;
  return _ocAberta(oc) && oc.criadoPorId === me;
}

function _ocDataRef(oc) { return (oc.dataHoraOcorrencia || oc.criadoEm || '').slice(0, 10); }

function _ocFiltradas() {
  const f = _ocFiltro;
  const hoje = new Date();
  const limite12 = new Date(hoje.getFullYear() - 1, hoje.getMonth(), hoje.getDate());
  const lim12 = `${limite12.getFullYear()}-${_ocPad(limite12.getMonth() + 1)}-${_ocPad(limite12.getDate())}`;
  const q = (f.q || '').toLowerCase().trim();
  return Object.values(ocState.ocorrencias).filter(oc => {
    if (!_ocVisivel(oc)) return false;
    if (f.ativoId && !oc.ativos.some(a => a.ativoId === f.ativoId)) return false;
    if (f.tipo && oc.tipo !== f.tipo) return false;
    if (f.sev && oc.severidade !== f.sev) return false;
    if (f.status === 'abertas') { if (!_ocAberta(oc)) return false; }
    else if (f.status && f.status !== 'todas' && oc.status !== f.status) return false;
    const d = _ocDataRef(oc);
    if (f.periodo === '12meses' && d < lim12) return false;
    if (f.periodo === 'ano' && !d.startsWith(String(hoje.getFullYear()))) return false;
    if (f.periodo === 'custom') {
      if (f.de && d < f.de) return false;
      if (f.ate && d > f.ate) return false;
    }
    if (f.minhas && !_ocEhMinha(oc)) return false;
    if (q) {
      const ativosTxt = oc.ativos.map(a => `${a.snapshot.nome} ${a.snapshot.codigo} ${_ocRotuloSetor(a.snapshot)}`).join(' ');
      const txt = `${oc.numero} ${oc.titulo} ${oc.descricao} ${oc.subtipo} ${ativosTxt}`.toLowerCase();
      if (!txt.includes(q)) return false;
    }
    return true;
  });
}

function _ocProximoPrazo(oc) {
  const pend = oc.acoes.filter(a => a.status !== 'concluida' && a.prazo).map(a => a.prazo).sort();
  return pend[0] || '';
}

function _ocKPIs() {
  const vis = Object.values(ocState.ocorrencias).filter(_ocVisivel);
  const abertas = vis.filter(_ocAberta);
  const hoje = _ocHoje();
  return {
    abertas:   abertas.length,
    criticas:  abertas.filter(o => o.severidade === 'critica').length,
    vencidas:  abertas.reduce((n, o) => n + o.acoes.filter(a => a.status !== 'concluida' && a.prazo && a.prazo < hoje).length, 0),
    eficacia:  abertas.filter(o => o.status === 'aguardando_eficacia').length,
    parados:   abertas.reduce((n, o) => n + _ocParadosPendentes(o).length, 0),
  };
}

function ocRender() {
  _ocUpdateNavBadge();
  const main = document.getElementById('oc-main');
  if (!main) return;
  const k = _ocKPIs();
  const kpiEl = document.getElementById('oc-kpis');
  if (kpiEl) {
    const tile = (val, lbl, cls, onclick) => `<div class="oc-kpi ${cls}" onclick="${onclick}"><div class="oc-kpi-val">${val}</div><div class="oc-kpi-lbl">${lbl}</div></div>`;
    kpiEl.innerHTML =
      tile(k.abertas,  'Em aberto',             k.abertas  ? 'oc-kpi-cyan'  : '', "ocFiltroAtalho('abertas')") +
      tile(k.criticas, 'Críticas em aberto',    k.criticas ? 'oc-kpi-red'   : '', "ocFiltroAtalho('criticas')") +
      tile(k.vencidas, 'Ações vencidas',        k.vencidas ? 'oc-kpi-amber' : '', "ocFiltroAtalho('abertas')") +
      tile(k.eficacia, 'Aguardando eficácia',   k.eficacia ? 'oc-kpi-cyan'  : '', "ocFiltroAtalho('aguardando_eficacia')") +
      tile(k.parados,  'Ativos aguardando liberação', k.parados ? 'oc-kpi-red' : '', "ocFiltroAtalho('abertas')");
  }

  const lista = _ocFiltradas();
  const { col, dir } = _ocSort;
  const valor = (oc) => {
    if (col === 'ativo') return (oc.ativos[0]?.snapshot.nome || '').toLowerCase();
    if (col === 'prazo') return _ocProximoPrazo(oc) || '9999';
    if (col === 'severidade') return ['baixa', 'media', 'alta', 'critica'].indexOf(oc.severidade);
    return oc[col] || '';
  };
  lista.sort((a, b) => { const va = valor(a), vb = valor(b); return va < vb ? -dir : va > vb ? dir : 0; });

  const total = lista.length;
  const paginas = Math.max(1, Math.ceil(total / OC_PAGE_SIZE));
  if (_ocPage >= paginas) _ocPage = paginas - 1;
  const pagina = lista.slice(_ocPage * OC_PAGE_SIZE, (_ocPage + 1) * OC_PAGE_SIZE);

  const cols = [
    { key: 'numero', label: 'Nº' }, { key: 'dataHoraOcorrencia', label: 'Data' }, { key: 'ativo', label: 'Ativo' },
    { key: 'titulo', label: 'Ocorrência' }, { key: 'tipo', label: 'Tipo' }, { key: 'severidade', label: 'Severidade' },
    { key: 'status', label: 'Status' }, { key: 'etapa', label: 'Próxima etapa', nosort: true }, { key: 'prazo', label: 'Prazo ação' },
  ];
  const seta = c => c.key === col ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:11px;height:11px;margin-left:3px;">${dir === 1 ? '<polyline points="18 15 12 9 6 15"/>' : '<polyline points="6 9 12 15 18 9"/>'}</svg>` : '';
  const head = cols.map(c => `<th class="ot-list-th${c.key === col ? ' sorted' : ''}" ${c.nosort ? 'style="cursor:default;"' : `onclick="ocSortBy('${c.key}')"`}>${c.label}${seta(c)}</th>`).join('');
  const hoje = _ocHoje();
  const rows = pagina.length === 0
    ? `<tr><td colspan="${cols.length}" style="text-align:center;padding:36px;color:var(--text-muted);">Nenhuma ocorrência encontrada</td></tr>`
    : pagina.map(oc => {
        const pend = _ocAberta(oc) ? _ocPendencias(oc)[0]?.texto || 'Pronta para encerramento' : (oc.status === 'encerrada' ? `Encerrada em ${_ocFmtData(oc.encerramento.em)}` : 'Cancelada');
        const prazo = _ocProximoPrazo(oc);
        const vencido = prazo && prazo < hoje && _ocAberta(oc);
        const parado = _ocParadosPendentes(oc).length > 0 && _ocAberta(oc);
        const s0 = oc.ativos[0]?.snapshot || {};
        const subAtivo = oc.ativos.length > 1 ? `${oc.ativos.length} ativos afetados` : [s0.codigo, _ocRotuloSetor(s0)].filter(Boolean).join(' · ');
        return `<tr class="ot-list-row${_ocAberta(oc) ? '' : ' oc-row-final'}" onclick="ocOpenView('${oc.id}')">
          <td><span class="oc-num">${_ocEsc(oc.numero)}</span></td>
          <td style="font-size:12.5px;white-space:nowrap;">${_ocFmtDH(oc.dataHoraOcorrencia)}</td>
          <td style="max-width:200px;"><div class="oc-cell-ativo" title="${_ocEsc(_ocNomesAtivos(oc, 99))}">${_ocEsc(_ocNomesAtivos(oc, 1))}</div><div class="oc-cell-sub">${_ocEsc(subAtivo)}</div></td>
          <td style="font-weight:600;color:var(--text-primary);max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${parado ? `<span class="oc-parado-dot" title="Ativo aguardando liberação"></span>` : ''}${_ocEsc(oc.titulo)}</td>
          <td>${_ocBadgeTipo(oc.tipo)}</td>
          <td>${_ocBadgeSev(oc.severidade)}</td>
          <td>${_ocBadgeStatus(oc.status)}</td>
          <td style="font-size:12px;color:var(--text-secondary);max-width:200px;">${_ocEsc(pend)}</td>
          <td style="font-size:12.5px;white-space:nowrap;" class="${vencido ? 'oc-vencido' : ''}">${prazo ? (vencido ? 'Vencida · ' : '') + _ocFmtData(prazo) : '—'}</td>
        </tr>`;
      }).join('');

  main.innerHTML = `
<div class="ot-list-wrapper oc-list-wrapper">
  <div class="ot-list-toolbar">
    <span class="ot-list-count">${total} ocorrência${total !== 1 ? 's' : ''}</span>
  </div>
  <div class="oc-table-scroll">
    <table class="ot-list-table">
      <thead><tr>${head}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  ${paginas > 1 ? `<div class="oc-pagination">
    <button class="btn btn-outline btn-sm" ${_ocPage === 0 ? 'disabled' : ''} onclick="ocPagina(-1)">Anterior</button>
    <span>Página ${_ocPage + 1} de ${paginas}</span>
    <button class="btn btn-outline btn-sm" ${_ocPage >= paginas - 1 ? 'disabled' : ''} onclick="ocPagina(1)">Próxima</button>
  </div>` : ''}
</div>`;
}

function ocSortBy(col) {
  if (_ocSort.col === col) _ocSort.dir *= -1;
  else { _ocSort.col = col; _ocSort.dir = -1; }
  ocRender();
}
function ocPagina(delta) { _ocPage = Math.max(0, _ocPage + delta); ocRender(); }

function ocFiltroAtalho(tipo) {
  const st = document.getElementById('oc-filter-status');
  const sev = document.getElementById('oc-filter-sev');
  _ocFiltro.sev = tipo === 'criticas' ? 'critica' : '';
  _ocFiltro.status = ['aguardando_eficacia', 'encerrada'].includes(tipo) ? tipo : 'abertas';
  _ocFiltro.periodo = 'todos';
  if (st) st.value = _ocFiltro.status;
  if (sev) sev.value = _ocFiltro.sev;
  const per = document.getElementById('oc-filter-periodo');
  if (per) per.value = 'todos';
  const c = document.getElementById('oc-filter-custom');
  if (c) c.style.display = 'none';
  _ocPage = 0;
  ocRender();
}

function _ocUpdateNavBadge() {
  const el = document.getElementById('oc-nav-badge');
  if (!el) return;
  const k = _ocKPIs();
  el.style.display = k.abertas > 0 ? '' : 'none';
  el.textContent = k.abertas;
  el.classList.toggle('critica', k.criticas > 0);
  el.title = `${k.abertas} em aberto${k.criticas ? ` · ${k.criticas} crítica(s)` : ''}`;
}

// ── SELETOR DE ATIVOS ────────────────────────────────────────
// Modo 'form': seleção múltipla (um evento pode afetar vários ativos).
// Modo 'filtro': seleção única para filtrar a lista.
function ocOpenAtivoPicker(modo) {
  _ocPickerModo = modo;
  _ocPickerSel = new Set(modo === 'form' ? _ocFormAtivos.map(a => a.ativoId) : []);
  const input = document.getElementById('oc-ativo-search-input');
  if (input) input.value = '';
  const foot = document.getElementById('oc-ativo-picker-foot');
  if (foot) foot.style.display = modo === 'form' ? '' : 'none';
  document.getElementById('oc-ativo-picker-sub').textContent = modo === 'form'
    ? 'Marque todos os ativos afetados pelo evento' : 'Busque por nome, código, unidade, setor ou modelo';
  ocAtivoPickerFiltrar('');
  otOpenModal('modal-oc-ativo-search');
  setTimeout(() => input?.focus(), 80);
}

function ocAtivoPickerFiltrar(q) {
  const list = document.getElementById('oc-ativo-search-list');
  if (!list || typeof state === 'undefined') return;
  q = (q ?? document.getElementById('oc-ativo-search-input')?.value ?? '').toLowerCase();
  const travados = new Set(_ocFormAtivos.filter(a => a.persistido).map(a => a.ativoId));
  const ativos = state.ativos
    .filter(a => a && (typeof _userCanSeeAtivo !== 'function' || _userCanSeeAtivo(a)))
    .filter(a => !q || `${a.nome} ${a.codigo} ${_orgRotuloAtivo(a)} ${a.marca} ${a.modelo} ${a.serie}`.toLowerCase().includes(q))
    .sort((a, b) => _orgChaveOrdemAtivo(a).localeCompare(_orgChaveOrdemAtivo(b)) || (a.codigo || '').localeCompare(b.codigo || ''));
  const multi = _ocPickerModo === 'form';
  list.innerHTML = !ativos.length ? '<div class="autocomplete-empty">Nenhum ativo encontrado</div>' : ativos.slice(0, 60).map(a => {
    const sel = _ocPickerSel.has(a.id);
    return `<div class="ativo-search-card oc-pick${sel ? ' sel' : ''}${travados.has(a.id) ? ' travado' : ''}" onclick="ocSelecionarAtivo('${a.id}')">
      ${multi ? `<span class="oc-pick-check">${sel ? OC_ICO.check : ''}</span>` : ''}
      <div class="ativo-search-card-icon">${OC_ICO.ativo}</div>
      <div style="min-width:0;">
        <div class="ativo-search-card-name">${_ocEsc(a.nome)}${a.statusUso === 'em_desuso' ? ' <span style="font-size:11px;color:var(--text-muted);">(em desuso)</span>' : ''}</div>
        <div class="ativo-search-card-meta">${_ocEsc(_ocMetaAtivo(a))}</div>
      </div>
    </div>`;
  }).join('');
  const cnt = document.getElementById('oc-ativo-picker-count');
  if (cnt) cnt.textContent = `${_ocPickerSel.size} selecionado${_ocPickerSel.size !== 1 ? 's' : ''}`;
}

function ocSelecionarAtivo(id) {
  if (_ocPickerModo === 'filtro') {
    otCloseModal('modal-oc-ativo-search');
    ocFiltroSet('ativoId', id);
    return;
  }
  if (_ocFormAtivos.some(a => a.ativoId === id && a.persistido)) {
    showToast('Ativo já registrado nesta ocorrência: não pode ser removido.', 'error');
    return;
  }
  if (_ocPickerSel.has(id)) _ocPickerSel.delete(id); else _ocPickerSel.add(id);
  ocAtivoPickerFiltrar();
}

function ocAtivoPickerConcluir() {
  const atuais = new Map(_ocFormAtivos.map(a => [a.ativoId, a]));
  _ocFormAtivos = [
    ..._ocFormAtivos.filter(a => a.persistido || _ocPickerSel.has(a.ativoId)),
    ...[..._ocPickerSel].filter(id => !atuais.has(id)).map(id => ({ ativoId: id, parado: false, dataHoraParada: _ocNowLocal(), persistido: false })),
  ];
  otCloseModal('modal-oc-ativo-search');
  _ocRenderFormAtivos();
}

// ── FORMULÁRIO DE REGISTRO ───────────────────────────────────
function ocOpenForm(id, opts = {}) {
  if (!id && !_ocCan('registrar')) { showToast('Sem permissão para registrar ocorrências.', 'error'); return; }
  const oc = id ? ocState.ocorrencias[id] : null;
  if (id && (!oc || !_ocAberta(oc) || !_ocCan('editar'))) { showToast('Esta ocorrência não pode ser editada.', 'error'); return; }
  _ocFormId     = id || null;
  _ocFormAtivos = oc
    ? oc.ativos.map(a => ({ ativoId: a.ativoId, parado: a.parado, dataHoraParada: a.dataHoraParada || _ocNowLocal(), persistido: true, paradoPersistido: a.parado }))
    : (opts.ativoId ? [{ ativoId: opts.ativoId, parado: false, dataHoraParada: _ocNowLocal(), persistido: false }] : []);
  _ocFormAnexos = [];
  _ocFormOrigem = opts.origem || null;

  document.getElementById('oc-form-title').textContent = oc ? `Editar ${oc.numero}` : 'Registrar Ocorrência';
  document.getElementById('oc-form-save-lbl').textContent = oc ? 'Salvar alterações' : 'Registrar';

  const set = (fid, v) => { const el = document.getElementById(fid); if (el) el.value = v ?? ''; };
  set('oc-f-tipo', oc?.tipo || opts.tipo || 'falha');
  ocFormTipoChange(oc?.subtipo || opts.subtipo || '');
  set('oc-f-titulo', oc?.titulo || opts.titulo || '');
  set('oc-f-descricao', oc?.descricao || opts.descricao || '');
  set('oc-f-data-ocorrencia', oc?.dataHoraOcorrencia || opts.dataHoraOcorrencia || _ocNowLocal());
  set('oc-f-data-deteccao', oc?.dataHoraDeteccao || _ocNowLocal());
  document.getElementById('oc-f-metodo').innerHTML = _ocOptions(ocState.catalogos.metodosDetec, oc?.metodoDetec || opts.metodoDetec || '');
  set('oc-f-severidade', oc?.severidade || opts.severidade || 'media');
  set('oc-f-acao-imediata', oc?.acaoImediata?.texto || '');
  const e = oc?.dadosEspecificos || {};
  ['leitura', 'faixaAceitavel', 'unidade', 'duracaoMin', 'pessoasEnvolvidas', 'fabricante', 'numAlerta', 'lotesAfetados'].forEach(k => set('oc-f-esp-' + k, e[k] || ''));
  const lesao = document.getElementById('oc-f-esp-houveLesao'); if (lesao) lesao.checked = !!e.houveLesao;
  const sesmt = document.getElementById('oc-f-esp-comunicadoSESMT'); if (sesmt) sesmt.checked = !!e.comunicadoSESMT;
  const agora = _ocNowLocal();
  ['oc-f-data-ocorrencia', 'oc-f-data-deteccao'].forEach(fid => { const el = document.getElementById(fid); if (el) el.max = agora; });

  _ocRenderFormAtivos();
  const anexosWrap = document.getElementById('oc-form-anexos-section');
  if (anexosWrap) anexosWrap.style.display = oc ? 'none' : '';
  _ocRenderFormAnexos();
  if (typeof _clearUploadFile === 'function' && _uploadQueues['oc-form']) _clearUploadFile('oc-form');
  otOpenModal('modal-oc-form');
}

function ocFormTipoChange(subtipoAtual) {
  const tipo = _ocVal('oc-f-tipo') || 'falha';
  const sel = document.getElementById('oc-f-subtipo');
  if (sel) sel.innerHTML = _ocOptions(ocState.catalogos.subtipos[tipo] || [], typeof subtipoAtual === 'string' ? subtipoAtual : '');
  document.querySelectorAll('#modal-oc-form .oc-esp-bloco').forEach(b => {
    b.style.display = (b.dataset.tipos || '').split(',').includes(tipo) ? '' : 'none';
  });
}

function ocFormAtivoSet(i, campo, valor) {
  const item = _ocFormAtivos[i];
  if (!item) return;
  if (campo === 'parado' && !valor && item.paradoPersistido) {
    showToast('A parada já registrada só é encerrada pela liberação formal do ativo.', 'error');
    _ocRenderFormAtivos();
    return;
  }
  item[campo] = valor;
  if (campo === 'parado') _ocRenderFormAtivos();
}

function ocFormAtivoRemover(i) {
  if (_ocFormAtivos[i]?.persistido) return;
  _ocFormAtivos.splice(i, 1);
  _ocRenderFormAtivos();
}

function ocFormParadoTodos() {
  const marcar = _ocFormAtivos.some(a => !a.parado);
  _ocFormAtivos.forEach(a => { if (marcar || !a.paradoPersistido) a.parado = marcar; });
  _ocRenderFormAtivos();
}

function _ocRenderFormAtivos() {
  const wrap = document.getElementById('oc-f-ativo-wrap');
  if (!wrap) return;
  const agora = _ocNowLocal();
  const itens = _ocFormAtivos.map((item, i) => {
    const a = typeof _ativoById === 'function' ? _ativoById(item.ativoId) : null;
    const snap = a ? _ocSnapshotAtivo(a) : (ocState.ocorrencias[_ocFormId]?.ativos.find(x => x.ativoId === item.ativoId)?.snapshot || {});
    return `<div class="oc-ativo-chip${item.parado ? ' parado' : ''}">
      <div class="oc-ativo-chip-icon">${OC_ICO.ativo}</div>
      <div style="flex:1;min-width:0;">
        <div class="oc-ativo-chip-nome">${_ocEsc(snap.nome || 'Ativo removido do cadastro')}</div>
        <div class="oc-ativo-chip-meta">${_ocEsc(_ocMetaAtivo(snap))}</div>
        <div class="oc-ativo-chip-parada">
          <label class="oc-check" title="Retira o ativo de uso (Em pausa) até a liberação formal">
            <input type="checkbox" ${item.parado ? 'checked' : ''} ${item.paradoPersistido ? 'disabled' : ''} onchange="ocFormAtivoSet(${i},'parado',this.checked)"> Parado / retirado de uso
          </label>
          ${item.parado ? `<input type="datetime-local" class="field-input oc-parada-input" max="${agora}" value="${_ocEsc(item.dataHoraParada)}" ${item.paradoPersistido ? 'disabled' : ''} onchange="ocFormAtivoSet(${i},'dataHoraParada',this.value)" title="Parado desde">` : ''}
        </div>
      </div>
      ${item.persistido ? `<span class="oc-ativo-chip-lock" title="Ativo já registrado na ocorrência">${OC_ICO.lock}</span>`
        : `<button type="button" class="anexo-del" onclick="ocFormAtivoRemover(${i})" title="Remover">${OC_ICO.close}</button>`}
    </div>`;
  }).join('');
  wrap.innerHTML = `${itens}
    <div class="oc-ativos-acoes">
      <button type="button" class="btn btn-outline btn-sm" onclick="ocOpenAtivoPicker('form')">${OC_ICO.plus} ${_ocFormAtivos.length ? 'Adicionar / remover ativos' : 'Selecionar ativo(s)'}</button>
      ${_ocFormAtivos.length > 1 ? `<button type="button" class="btn btn-outline btn-sm" onclick="ocFormParadoTodos()">${_ocFormAtivos.some(a => !a.parado) ? 'Marcar todos como parados' : 'Desmarcar paradas'}</button>` : ''}
    </div>`;
  const cnt = document.getElementById('oc-f-ativos-count');
  if (cnt) cnt.textContent = _ocFormAtivos.length > 1 ? ` (${_ocFormAtivos.length})` : '';
}

function _ocRenderFormAnexos() {
  const el = document.getElementById('oc-form-anexo-list');
  if (!el) return;
  el.innerHTML = _ocFormAnexos.map((a, i) => `<div class="oc-anexo">
    ${OC_ICO.clip}<a href="${_ocEsc(a.url)}" target="_blank" rel="noopener">${_ocEsc(a.titulo)}</a>
    <button class="anexo-del" onclick="_ocFormAnexos.splice(${i},1);_ocRenderFormAnexos();" title="Remover">${OC_ICO.close}</button>
  </div>`).join('');
}

async function ocSaveForm() {
  if (_ocSalvando) return;
  if (typeof _uploadsInProgress !== 'undefined' && _uploadsInProgress['oc-form']) { showToast('Aguarde o envio do arquivo terminar.', 'error'); return; }
  const tipo = _ocVal('oc-f-tipo');
  const titulo = _ocVal('oc-f-titulo');
  const descricao = _ocVal('oc-f-descricao');
  const dataOc = _ocVal('oc-f-data-ocorrencia');
  const dataDet = _ocVal('oc-f-data-deteccao');
  const severidade = _ocVal('oc-f-severidade');
  const acaoImediata = _ocVal('oc-f-acao-imediata');
  const agora = _ocNowLocal();

  if (!_ocFormAtivos.length) { showToast('Selecione ao menos um ativo envolvido.', 'error'); return; }
  if (!tipo)            { showToast('Informe o tipo da ocorrência.', 'error'); return; }
  if (!titulo)          { showToast('Informe o título.', 'error'); return; }
  if (!descricao)       { showToast('Descreva o que aconteceu.', 'error'); return; }
  if (!dataOc)          { showToast('Informe a data/hora da ocorrência.', 'error'); return; }
  if (dataOc > agora)   { showToast('A data da ocorrência não pode estar no futuro.', 'error'); return; }
  if (dataDet && dataDet < dataOc) { showToast('A detecção não pode ser anterior à ocorrência.', 'error'); return; }
  if (!severidade)      { showToast('Informe a severidade.', 'error'); return; }
  if (!acaoImediata)    { showToast('Registre a ação imediata tomada (contenção).', 'error'); return; }
  const semData = _ocFormAtivos.find(a => a.parado && !a.dataHoraParada);
  if (semData) { showToast('Informe desde quando cada ativo parado está fora de uso.', 'error'); return; }
  if (_ocFormAtivos.some(a => a.parado && a.dataHoraParada > agora)) { showToast('A data da parada não pode estar no futuro.', 'error'); return; }

  const espKeys = { ambiental: ['leitura', 'faixaAceitavel', 'unidade', 'duracaoMin'], dano: ['pessoasEnvolvidas', 'houveLesao', 'comunicadoSESMT'], acidente: ['pessoasEnvolvidas', 'houveLesao', 'comunicadoSESMT'], alerta_fabricante: ['fabricante', 'numAlerta', 'lotesAfetados'] }[tipo] || [];
  const especificos = {};
  espKeys.forEach(k => {
    especificos[k] = ['houveLesao', 'comunicadoSESMT'].includes(k) ? _ocChk('oc-f-esp-' + k) : _ocVal('oc-f-esp-' + k);
  });
  if (tipo === 'ambiental' && !especificos.leitura) { showToast('Informe a leitura registrada fora da faixa.', 'error'); return; }
  if (tipo === 'alerta_fabricante' && !especificos.numAlerta) { showToast('Informe o número/identificação do alerta.', 'error'); return; }

  const registro = {
    tipo, subtipo: _ocVal('oc-f-subtipo'), titulo, descricao,
    dataHoraOcorrencia: dataOc, dataHoraDeteccao: dataDet, metodoDetec: _ocVal('oc-f-metodo'),
    severidade,
  };

  _ocSalvando = true;
  const btn = document.getElementById('btn-oc-form-save');
  if (btn) btn.disabled = true;
  try {
    let oc;
    if (_ocFormId) {
      oc = _ocClone(ocState.ocorrencias[_ocFormId]);
      const diffs = [..._ocDiff(oc, registro, OC_LBL_REGISTRO), ..._ocDiff(oc.dadosEspecificos, especificos, OC_LBL_ESPEC)];
      const acaoMudou = (oc.acaoImediata.texto || '') !== acaoImediata;
      if (acaoMudou) diffs.push({ campo: 'Ação imediata', antes: oc.acaoImediata.texto || '—', depois: acaoImediata });
      const { ativos, diffsAtivos } = _ocMontarAtivos(oc.ativos);
      diffs.push(...diffsAtivos);
      if (!diffs.length) { showToast('Nenhuma alteração para salvar.', 'error'); return; }
      Object.assign(oc, registro);
      oc.ativos = ativos;
      oc.dadosEspecificos = especificos;
      if (acaoMudou) oc.acaoImediata = { texto: acaoImediata, ..._ocAssinatura() };
      _ocTrilha(oc, 'edicao', 'Registro da ocorrência alterado', diffs);
    } else {
      const u = _ocSess();
      oc = _ocNormalizar({
        id: _ocUid(),
        numero: await _ocProximoNumero(),
        ativos: _ocMontarAtivos([]).ativos,
        ...registro,
        dadosEspecificos: especificos,
        detectadoPorId: u.id, detectadoPorNome: u.nome,
        acaoImediata: { texto: acaoImediata, ..._ocAssinatura() },
        anexos: _ocFormAnexos.slice(),
        otIds: _ocFormOrigem?.otId ? [_ocFormOrigem.otId] : [],
        origem: _ocFormOrigem || null,
        status: 'aberta',
        criadoEm: _ocAgora(), criadoPorId: u.id, criadoPorNome: u.nome,
      });
      const nomes = oc.ativos.map(a => a.snapshot.nome);
      _ocTrilha(oc, 'criacao', `Ocorrência registrada — ${nomes.length > 1 ? `${nomes.length} ativos: ` : 'ativo: '}${nomes.join(', ')}`);
    }
    await _ocCommit(oc, _ocFormId ? 'Ocorrência atualizada.' : `Ocorrência ${oc.numero} registrada.`);
    if (!_ocFormId && oc.origem?.tipo === 'cq' && typeof cqAposCriarOcorrencia === 'function') cqAposCriarOcorrencia(oc);
    _ocAplicarPausa(oc);
    otCloseModal('modal-oc-form');
    if (!_ocFormId) ocOpenView(oc.id);
  } finally {
    _ocSalvando = false;
    if (btn) btn.disabled = false;
  }
}

// Junta a lista do formulário com os ativos já registrados (preservando snapshot e liberação)
function _ocMontarAtivos(existentes) {
  const porId = new Map(existentes.map(a => [a.ativoId, a]));
  const diffsAtivos = [];
  const ativos = _ocFormAtivos.map(item => {
    const atual = porId.get(item.ativoId);
    if (atual) {
      const novo = { ...atual, parado: item.parado, dataHoraParada: item.parado ? item.dataHoraParada : '' };
      if (!atual.parado && item.parado) diffsAtivos.push({ campo: `Parado — ${atual.snapshot.nome}`, antes: 'Não', depois: `Sim, desde ${_ocFmtDH(item.dataHoraParada)}` });
      return novo;
    }
    const snap = _ocSnapshotAtivo(_ativoById(item.ativoId));
    if (existentes.length) diffsAtivos.push({ campo: 'Ativo incluído', antes: '—', depois: `${snap.nome}${item.parado ? ` (parado desde ${_ocFmtDH(item.dataHoraParada)})` : ''}` });
    return { ativoId: item.ativoId, snapshot: snap, parado: item.parado, dataHoraParada: item.parado ? item.dataHoraParada : '', liberacao: {} };
  });
  return { ativos, diffsAtivos };
}

// ── VISUALIZAÇÃO / TRATAMENTO ────────────────────────────────
function ocOpenView(id, tab) {
  const oc = ocState.ocorrencias[id];
  if (!oc) { showToast('Ocorrência não encontrada.', 'error'); return; }
  _ocViewId = id;
  _ocRenderView(oc, tab || (_ocAberta(oc) ? (_ocPendencias(oc)[0]?.tab || 'registro') : 'registro'));
  otOpenModal('modal-oc-view');
}

// Atualização vinda de outro usuário: não redesenha abas com formulário em edição
function _ocRefreshViewRemoto() {
  if (!_ocViewId || !document.getElementById('modal-oc-view')?.classList.contains('open')) return;
  const oc = ocState.ocorrencias[_ocViewId];
  if (!oc) { otCloseModal('modal-oc-view'); showToast('A ocorrência aberta foi excluída por outro usuário.', 'error'); return; }
  _ocRenderHeader(oc);
  if (['registro', 'trilha'].includes(_ocViewTab)) _ocRenderTab(oc, _ocViewTab);
}

const OC_TABS = [
  { key: 'registro',    label: 'Registro'            },
  { key: 'impacto',     label: 'Impacto'             },
  { key: 'causa',       label: 'Causa'               },
  { key: 'acoes',       label: 'Ações'               },
  { key: 'eficacia',    label: 'Eficácia & Liberação' },
  { key: 'notificacao', label: 'Notificação'         },
  { key: 'trilha',      label: 'Trilha'              },
];

function _ocRenderView(oc, tab) {
  _ocRenderHeader(oc);
  _ocRenderTab(oc, tab);
}

function _ocRenderHeader(oc) {
  const head = document.getElementById('oc-view-head');
  if (!head) return;
  const pend = oc.status !== 'cancelada' ? _ocParadosPendentes(oc).length : 0;
  const nParados = oc.ativos.filter(a => a.parado).length;
  const s0 = oc.ativos[0]?.snapshot || {};
  const ativoLinha = oc.ativos.length === 1
    ? `${_ocEsc(s0.nome || '—')}${s0.codigo ? ` · ${_ocEsc(s0.codigo)}` : ''}${s0.setor ? ` · ${_ocEsc(_ocRotuloSetor(s0))}` : ''}`
    : `${oc.ativos.length} ativos: ${_ocEsc(_ocNomesAtivos(oc, 4))}`;
  const etapas = [
    { lbl: 'Registro',  ok: !!oc.acaoImediata.texto },
    { lbl: 'Impacto',   ok: _ocImpactoOk(oc) },
    { lbl: 'Causa',     ok: _ocCausaOk(oc) },
    { lbl: 'Ações',     ok: _ocAcoesOk(oc) },
    { lbl: 'Eficácia',  ok: _ocEficaciaOk(oc) },
    ...(nParados ? [{ lbl: 'Liberação', ok: _ocLiberacaoOk(oc) }] : []),
    { lbl: 'Notificação', ok: _ocNotificacaoOk(oc) },
    { lbl: 'Encerramento', ok: oc.status === 'encerrada' },
  ];
  head.innerHTML = `
<div class="ot-view-hero oc-view-hero">
  <div class="ot-view-hero-num">${_ocEsc(oc.numero)} · Ocorrida em ${_ocFmtDH(oc.dataHoraOcorrencia)} · Registrada por ${_ocEsc(oc.criadoPorNome || '—')}</div>
  <div class="ot-view-hero-title">${_ocEsc(oc.titulo)}</div>
  <div class="oc-hero-ativo">${OC_ICO.ativo}${ativoLinha}</div>
  <div class="ot-view-hero-badges">
    ${_ocBadgeTipo(oc.tipo)} ${_ocBadgeSev(oc.severidade)} ${_ocBadgeStatus(oc.status)}
    ${pend ? `<span class="oc-badge oc-badge-parado">${OC_ICO.lock}${pend > 1 ? `${pend} ativos fora de uso` : 'Ativo fora de uso'}</span>` : ''}
    ${nParados && !pend && oc.status !== 'cancelada' ? `<span class="oc-badge oc-badge-liberado">${OC_ICO.unlock}${oc.ativos.some(a => a.parado && _ocDesfecho(a.liberacao) !== 'retorno') ? 'Desfecho dos ativos registrado' : nParados > 1 ? 'Ativos liberados' : 'Ativo liberado'}</span>` : ''}
  </div>
</div>
<div class="oc-stepper">
  ${etapas.map((e, i) => `<div class="oc-step${e.ok ? ' done' : ''}"><span class="oc-step-dot">${e.ok ? OC_ICO.check : i + 1}</span><span class="oc-step-lbl">${e.lbl}</span></div>`).join('<div class="oc-step-line"></div>')}
</div>`;

  const footL = document.getElementById('oc-view-foot-left');
  const footR = document.getElementById('oc-view-foot-right');
  const aberta = _ocAberta(oc);
  const canOT = typeof authHasPermission !== 'function' || authHasPermission('ot.criarOT');
  if (footL) footL.innerHTML = `
    ${_ocIsAdmin() ? `<button class="btn btn-outline oc-btn-danger" onclick="ocExcluir('${oc.id}')">${OC_ICO.trash} Excluir</button>` : ''}
    ${aberta && _ocCan('cancelar') ? `<button class="btn btn-outline oc-btn-danger" onclick="ocCancelar('${oc.id}')">${OC_ICO.ban} Cancelar</button>` : ''}
    ${oc.status === 'encerrada' && _ocCan('encerrar') ? `<button class="btn btn-outline" onclick="ocReabrir('${oc.id}')">${OC_ICO.undo} Reabrir</button>` : ''}`;
  if (footR) footR.innerHTML = `
    <button class="btn btn-outline" onclick="ocImprimir('${oc.id}')">${OC_ICO.print} Ficha PDF</button>
    ${aberta && canOT && _ocAtivoDe(oc) ? `<button class="btn btn-outline" onclick="ocGerarOT('${oc.id}')">${OC_ICO.ot} Gerar OT</button>` : ''}
    ${aberta && _ocCan('encerrar') ? `<button class="btn btn-primary" style="background:var(--green);" onclick="ocEncerrar('${oc.id}')">${OC_ICO.check} Encerrar</button>` : ''}`;
}

function ocSwitchTab(tab) {
  const oc = ocState.ocorrencias[_ocViewId];
  if (oc) _ocRenderTab(oc, tab);
}

function _ocRenderTab(oc, tab) {
  _ocViewTab = tab;
  const tabs = document.getElementById('oc-view-tabs');
  if (tabs) {
    const pend = new Set(_ocAberta(oc) ? _ocPendencias(oc).map(p => p.tab) : []);
    tabs.innerHTML = OC_TABS.map(t => `<button class="ot-modal-tab-btn${t.key === tab ? ' active' : ''}" onclick="ocSwitchTab('${t.key}')">
      ${t.label}${pend.has(t.key) ? '<span class="oc-tab-pend" title="Pendente"></span>' : ''}${t.key === 'trilha' ? `<span class="ot-modal-tab-badge">${oc.trilha.length}</span>` : ''}
    </button>`).join('');
  }
  const body = document.getElementById('oc-view-tab-body');
  if (!body) return;
  const render = { registro: _ocTabRegistro, impacto: _ocTabImpacto, causa: _ocTabCausa, acoes: _ocTabAcoes, eficacia: _ocTabEficacia, notificacao: _ocTabNotificacao, trilha: _ocTabTrilha }[tab];
  body.innerHTML = render ? render(oc) : '';
  ['oc-reg', 'oc-acao', 'oc-lib', 'oc-notif'].forEach(ctx => {
    if (document.getElementById(ctx + '-upload-zone') && typeof initUploadZone === 'function') {
      _uploadQueues[ctx] = { file: null, dataUrl: null };
      initUploadZone(ctx);
    }
  });
  ocImpactoToggle(); ocCausaMetodoChange(); ocNotifToggle(); ocAcoesNAToggle(); ocLibDesfechoToggle();
}

// Blocos reutilizados nas abas
function _ocInfo(lbl, val, full) {
  return `<div class="oc-info${full ? ' full' : ''}"><div class="oc-info-lbl">${lbl}</div><div class="oc-info-val">${val || '—'}</div></div>`;
}
function _ocAssinado(obj) {
  return obj?.porNome ? `<div class="oc-assinatura">${OC_ICO.user}${_ocEsc(obj.porNome)} · ${_ocFmtDH(obj.em)}</div>` : '';
}
function _ocSecao(titulo, html, extra) {
  return `<div class="oc-secao"><div class="oc-secao-title">${titulo}${extra || ''}</div>${html}</div>`;
}
function _ocAnexosHTML(oc, etapa, podeRemover, filtro) {
  const lista = oc.anexos.map((a, i) => ({ ...a, _i: i })).filter(a => (!etapa || a.etapa === etapa) && (!filtro || filtro(a)));
  if (!lista.length) return `<div class="oc-vazio">Nenhum anexo.</div>`;
  return lista.map(a => `<div class="oc-anexo">
    ${OC_ICO.clip}<a href="${_ocEsc(a.url)}" target="_blank" rel="noopener">${_ocEsc(a.titulo)}</a>
    <span class="oc-anexo-meta">${etapa ? '' : `${OC_ETAPAS_ANEXO[a.etapa] || ''} · `}${_ocEsc(a.porNome || '')} · ${_ocFmtDH(a.em)}</span>
    ${podeRemover ? `<button class="anexo-del" onclick="ocRemoverAnexo(${a._i})" title="Remover">${OC_ICO.close}</button>` : ''}
  </div>`).join('');
}
function _ocUploadHTML(ctx) {
  return `<div class="oc-upload">
    <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center;">
      <input type="text" id="${ctx}-upload-title" class="field-input" placeholder="Nome do arquivo (ex.: foto do display, laudo técnico)" style="flex:1;">
      <button id="${ctx}-upload-btn" class="btn btn-primary" onclick="ocUpload('${ctx}')" style="flex-shrink:0;">${OC_ICO.upload} Enviar</button>
    </div>
    <div id="${ctx}-upload-zone" class="upload-drop-zone" title="Clique ou arraste um arquivo PDF ou imagem">
      ${OC_ICO.upload}
      <div class="upload-drop-text"><strong>Clique ou arraste o arquivo</strong><br><span>PDF ou imagem</span></div>
      <input type="file" id="${ctx}-file-input" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.svg" style="display:none;">
    </div>
    <div id="${ctx}-file-preview" style="display:none;margin-top:6px;"></div>
  </div>`;
}
function _ocBotaoSalvar(etapa, label) {
  return `<div class="oc-acoes-form"><button class="btn btn-primary" onclick="ocSalvarEtapa('${etapa}')">${OC_ICO.check} ${label || 'Salvar etapa'}</button></div>`;
}
function _ocAvisoSomenteLeitura(oc) {
  if (!_ocAberta(oc)) return `<div class="oc-aviso">${OC_ICO.lock} Ocorrência ${oc.status === 'encerrada' ? 'encerrada' : 'cancelada'}: somente leitura.</div>`;
  return `<div class="oc-aviso">${OC_ICO.lock} Você não tem permissão para tratar esta etapa.</div>`;
}

// Situação de um ativo dentro da ocorrência: em operação, fora de uso ou liberado
function _ocSituacaoAtivo(oc, a) {
  if (!a.parado) return `<span class="oc-badge oc-st-cancelada">Não parado</span>`;
  if (a.liberacao.liberado) {
    const l = a.liberacao, d = _ocDesfecho(l);
    return d === 'retorno'
      ? `<span class="oc-badge oc-st-encerrada" title="${_ocEsc(l.criterio || '')}">${OC_ICO.unlock}Retornou ${_ocFmtDH(_ocDataDesfecho(l))}</span>`
      : `<span class="oc-badge oc-st-cancelada" title="${_ocEsc(l.motivo || '')}">${OC_DESFECHOS[d].curto} ${_ocFmtDH(_ocDataDesfecho(l))}</span>`;
  }
  if (oc.status === 'cancelada') return `<span class="oc-badge oc-st-cancelada">Parado desde ${_ocFmtDH(a.dataHoraParada)}</span>`;
  return `<span class="oc-badge oc-st-aberta">${OC_ICO.lock}Parado desde ${_ocFmtDH(a.dataHoraParada)}</span>`;
}

// ── ABA REGISTRO ─────────────────────────────────────────────
function _ocTabRegistro(oc) {
  const e = oc.dadosEspecificos;
  const podeEditar = _ocAberta(oc) && _ocCan('editar');
  const esp = Object.keys(OC_LBL_ESPEC).filter(k => e[k] !== undefined && e[k] !== '' && e[k] !== false)
    .map(k => _ocInfo(OC_LBL_ESPEC[k], _ocEsc(_ocFmtVal(e[k])))).join('');
  const ots = _ocOTsVinculadas(oc);
  const OT_ST = { pendente: 'Pendente', em_processo: 'Em processo', em_revisao: 'Em revisão', concluida: 'Concluída', cancelada: 'Cancelada' };
  return `
${podeEditar ? `<div class="oc-acoes-form" style="justify-content:flex-end;margin:0 0 6px;"><button class="btn btn-outline btn-sm" onclick="ocOpenForm('${oc.id}')">${OC_ICO.edit} Editar registro</button></div>` : ''}
${_ocSecao(`Ativos envolvidos (${oc.ativos.length})`, `${oc.ativos.map(a => `<div class="oc-ativo-item">
    <div class="oc-ativo-chip-icon">${OC_ICO.ativo}</div>
    <div style="flex:1;min-width:0;">
      <div class="oc-ativo-chip-nome">${_ocEsc(a.snapshot.nome || '—')}</div>
      <div class="oc-ativo-chip-meta">${_ocEsc(_ocMetaAtivo(a.snapshot))}${a.snapshot.categoria ? ` · ${_ocEsc(a.snapshot.categoria)}` : ''}</div>
    </div>
    ${_ocSituacaoAtivo(oc, a)}
  </div>`).join('')}<div class="oc-nota">Identificação registrada no momento da ocorrência.</div>`)}
${_ocSecao('O que aconteceu', `<div class="oc-grid">
  ${_ocInfo('Tipo', _ocEsc(OC_TIPOS[oc.tipo]?.label))}${_ocInfo('Subtipo', _ocEsc(oc.subtipo))}
  ${_ocInfo('Ocorrida em', _ocFmtDH(oc.dataHoraOcorrencia))}${_ocInfo('Detectada em', _ocFmtDH(oc.dataHoraDeteccao))}
  ${_ocInfo('Método de detecção', _ocEsc(oc.metodoDetec))}${_ocInfo('Detectada / registrada por', _ocEsc(oc.detectadoPorNome || oc.criadoPorNome))}
  ${_ocInfo('Severidade', _ocBadgeSev(oc.severidade))}${_ocInfo('Ativos parados', `${oc.ativos.filter(a => a.parado).length} de ${oc.ativos.length}`)}
  ${esp}
  ${_ocInfo('Descrição', `<div class="oc-texto">${_ocEsc(oc.descricao)}</div>`, true)}
</div>`)}
${_ocSecao('Ação imediata (contenção)', `<div class="oc-texto">${_ocEsc(oc.acaoImediata.texto) || '—'}</div>${_ocAssinado(oc.acaoImediata)}`)}
${oc.origem?.tipo === 'ot' ? `<div class="oc-nota">Gerada automaticamente a partir da ${_ocEsc(oc.origem.otNumero || 'OT')}.</div>` : ''}
${oc.origem?.tipo === 'cq' ? `<div class="oc-nota">Originada no Controle de Qualidade — não conformidade ${typeof cqAbrirNC === 'function' ? `<a href="#" onclick="otCloseModal('modal-oc-view');switchTab('cq');setTimeout(()=>cqAbrirNC('${_ocEsc(oc.origem.unidadeId)}','${_ocEsc(oc.origem.ncAno)}','${_ocEsc(oc.origem.ncId)}'),80);return false;">${_ocEsc(oc.origem.ncNumero || 'CQ')}</a>` : _ocEsc(oc.origem.ncNumero || '')}.</div>` : ''}
${_ocSecao('Ordens de trabalho vinculadas', ots.length ? ots.map(o => `<div class="oc-ot-link" onclick="ocAbrirOT('${o.id}')">
    ${OC_ICO.ot}<span class="oc-num">${_ocEsc(o.numero)}</span><span style="flex:1;">${_ocEsc(o.titulo)}</span><span class="oc-ot-st">${OT_ST[o.status] || o.status}</span>
  </div>`).join('') : `<div class="oc-vazio">Nenhuma OT vinculada.</div>`)}
${_ocSecao('Anexos e evidências', `${_ocAnexosHTML(oc, null, podeEditar)}${podeEditar ? _ocUploadHTML('oc-reg') : ''}`)}`;
}

function ocAbrirOT(otId) {
  otCloseModal('modal-oc-view');
  if (typeof otOpenView === 'function') otOpenView(otId);
}

// ── ABA IMPACTO ──────────────────────────────────────────────
function _ocTabImpacto(oc) {
  const i = oc.impacto;
  const pode = _ocAberta(oc) && _ocCan('tratar');
  if (!pode) {
    return (_ocImpactoOk(oc) || i.afetaResultados ? _ocSecao('Avaliação de impacto', `<div class="oc-grid">
      ${_ocInfo('Afeta resultados de pacientes', OC_AFETA[i.afetaResultados])}
      ${i.afetaResultados === 'sim' ? `${_ocInfo('Período afetado', `${_ocFmtDH(i.periodoDe)} a ${_ocFmtDH(i.periodoAte)}`)}${_ocInfo('Exames afetados', _ocEsc(i.examesAfetados))}
        ${_ocInfo('Qtd. de amostras', _ocEsc(i.qtdAmostras))}${_ocInfo('Laudos liberados afetados', i.laudosLiberadosAfetados ? 'Sim' : 'Não')}
        ${_ocInfo('Ação sobre resultados', _ocEsc(OC_ACAO_RESULTADOS[i.acaoResultados]))}` : ''}
      ${_ocInfo('Risco ao paciente', i.riscoPaciente ? 'Sim' : 'Não')}${_ocInfo('Risco ao operador', i.riscoOperador ? 'Sim' : 'Não')}
      ${_ocInfo('Fundamentação', `<div class="oc-texto">${_ocEsc(i.justificativa)}</div>`, true)}
    </div>${_ocAssinado(i)}`) : `<div class="oc-vazio">Impacto ainda não avaliado.</div>`) + _ocAvisoSomenteLeitura(oc);
  }
  const radio = (v, lbl) => `<label class="oc-radio"><input type="radio" name="ocv-imp-afeta" value="${v}" ${i.afetaResultados === v ? 'checked' : ''} onchange="ocImpactoToggle()">${lbl}</label>`;
  return `
<div class="oc-ajuda">Avalie se o evento pode ter comprometido resultados já emitidos ou em processamento (trabalho não conforme) e qual tratamento foi dado a eles.</div>
${_ocSecao('Resultados de pacientes', `
  <div class="form-field"><label class="field-label">A ocorrência pode ter afetado resultados de pacientes? <span class="required">*</span></label>
    <div class="oc-radio-row">${radio('sim', 'Sim')}${radio('nao', 'Não')}${radio('em_avaliacao', 'Em avaliação')}</div></div>
  <div id="ocv-imp-sim" style="display:none;">
    <div class="form-row">
      <div class="form-field"><label class="field-label">Período afetado — de</label><input type="datetime-local" id="ocv-imp-de" class="field-input" value="${_ocEsc(i.periodoDe || '')}"></div>
      <div class="form-field"><label class="field-label">até</label><input type="datetime-local" id="ocv-imp-ate" class="field-input" value="${_ocEsc(i.periodoAte || '')}"></div>
    </div>
    <div class="form-row">
      <div class="form-field"><label class="field-label">Exames afetados</label><input type="text" id="ocv-imp-exames" class="field-input" value="${_ocEsc(i.examesAfetados || '')}" placeholder="Ex.: glicose, ureia, creatinina"></div>
      <div class="form-field"><label class="field-label">Qtd. de amostras</label><input type="number" min="0" id="ocv-imp-qtd" class="field-input" value="${_ocEsc(i.qtdAmostras || '')}"></div>
    </div>
    <label class="oc-check"><input type="checkbox" id="ocv-imp-laudos" ${i.laudosLiberadosAfetados ? 'checked' : ''}> Há laudos já liberados afetados</label>
    <div class="form-field" style="margin-top:10px;"><label class="field-label">Ação sobre os resultados <span class="required">*</span></label>
      <select id="ocv-imp-acao" class="field-select">${_ocMapOptions(OC_ACAO_RESULTADOS, i.acaoResultados || '')}</select></div>
  </div>`)}
${_ocSecao('Riscos', `
  <label class="oc-check"><input type="checkbox" id="ocv-imp-risco-pac" ${i.riscoPaciente ? 'checked' : ''}> Houve ou há risco ao paciente</label>
  <label class="oc-check"><input type="checkbox" id="ocv-imp-risco-op" ${i.riscoOperador ? 'checked' : ''}> Houve ou há risco ao operador / colaborador</label>`)}
${_ocSecao('Fundamentação da avaliação', `
  <textarea id="ocv-imp-just" class="field-textarea" style="min-height:80px;" placeholder="Explique como a avaliação foi feita (ex.: revisão do CQ do período, reprocessamento de amostras, conferência de laudos)...">${_ocEsc(i.justificativa || '')}</textarea>
  ${_ocAssinado(i)}`)}
${_ocBotaoSalvar('impacto', 'Salvar avaliação de impacto')}`;
}

function ocImpactoToggle() {
  const box = document.getElementById('ocv-imp-sim');
  if (box) box.style.display = _ocRadio('ocv-imp-afeta') === 'sim' ? '' : 'none';
}

// ── ABA CAUSA ────────────────────────────────────────────────
function _ocTabCausa(oc) {
  const c = oc.analiseCausa;
  const pode = _ocAberta(oc) && _ocCan('tratar');
  if (!pode) {
    return (c.causaRaiz ? _ocSecao('Análise de causa', `<div class="oc-grid">
      ${_ocInfo('Método', _ocEsc(OC_METODO_CAUSA[c.metodo]))}${_ocInfo('Causa raiz', _ocEsc(c.causaRaiz))}
      ${c.metodo === '5porques' && c.porques.some(Boolean) ? _ocInfo('5 Porquês', c.porques.filter(Boolean).map((p, n) => `${n + 1}. ${_ocEsc(p)}`).join('<br>'), true) : ''}
      ${c.metodo === 'ishikawa' ? _ocInfo('Ishikawa', Object.keys(OC_ISHIKAWA).filter(k => c.ishikawa[k]).map(k => `<b>${OC_ISHIKAWA[k]}:</b> ${_ocEsc(c.ishikawa[k])}`).join('<br>'), true) : ''}
      ${_ocInfo('Conclusão', `<div class="oc-texto">${_ocEsc(c.descricao)}</div>`, true)}
    </div>${_ocAssinado(c)}`) : `<div class="oc-vazio">Causa ainda não analisada.</div>`) + _ocAvisoSomenteLeitura(oc);
  }
  const porques = [0, 1, 2, 3, 4].map(n => `<div class="form-field" style="margin-bottom:8px;"><label class="field-label">${n + 1}º Por quê?</label><input type="text" id="ocv-causa-pq-${n}" class="field-input" value="${_ocEsc(c.porques[n] || '')}"></div>`).join('');
  const ishi = Object.entries(OC_ISHIKAWA).map(([k, lbl]) => `<div class="form-field" style="margin-bottom:8px;"><label class="field-label">${lbl}</label><input type="text" id="ocv-causa-ish-${k}" class="field-input" value="${_ocEsc(c.ishikawa[k] || '')}"></div>`).join('');
  return `
<div class="oc-ajuda">Identifique a causa raiz para que a ação corretiva elimine a origem do problema e evite a recorrência.</div>
${_ocSecao('Método de análise', `
  <select id="ocv-causa-metodo" class="field-select" onchange="ocCausaMetodoChange()">${_ocMapOptions(OC_METODO_CAUSA, c.metodo || '')}</select>
  <div id="ocv-causa-5pq" style="display:none;margin-top:12px;">${porques}</div>
  <div id="ocv-causa-ish" style="display:none;margin-top:12px;"><div class="oc-grid-form">${ishi}</div></div>`)}
${_ocSecao('Conclusão', `
  <div class="form-field"><label class="field-label">Causa raiz <span class="required">*</span></label>
    <div class="ot-catalog-field"><select id="ocv-causa-raiz" class="field-select">${_ocOptions(ocState.catalogos.causasRaiz, c.causaRaiz || '')}</select></div></div>
  <div class="form-field"><label class="field-label">Conclusão da análise <span class="required">*</span></label>
    <textarea id="ocv-causa-desc" class="field-textarea" style="min-height:80px;" placeholder="Descreva a causa identificada e as evidências que a sustentam...">${_ocEsc(c.descricao || '')}</textarea></div>
  ${_ocAssinado(c)}`)}
${_ocBotaoSalvar('causa', 'Salvar análise de causa')}`;
}

function ocCausaMetodoChange() {
  const m = _ocVal('ocv-causa-metodo');
  const a = document.getElementById('ocv-causa-5pq'), b = document.getElementById('ocv-causa-ish');
  if (a) a.style.display = m === '5porques' ? '' : 'none';
  if (b) b.style.display = m === 'ishikawa' ? '' : 'none';
}

// ── ABA AÇÕES ────────────────────────────────────────────────
function _ocTabAcoes(oc) {
  const pode = _ocAberta(oc) && _ocCan('tratar');
  const me = _ocSess().id;
  const hoje = _ocHoje();
  const canOT = typeof authHasPermission !== 'function' || authHasPermission('ot.criarOT');
  const cards = oc.acoes.map(a => {
    const venc = a.status !== 'concluida' && a.prazo && a.prazo < hoje;
    const podeConcluir = _ocAberta(oc) && a.status !== 'concluida' && (pode || a.responsavelId === me);
    const podeRetificar = _ocAberta(oc) && a.status === 'concluida' && (pode || a.responsavelId === me || a.concluidaPorId === me);
    const podeEditar = _ocAberta(oc) && a.status !== 'concluida' && (pode || a.responsavelId === me);
    const ret = a.retificacoes?.[a.retificacoes.length - 1];
    const ot = a.otId && typeof otState !== 'undefined' ? otState.ordens.find(o => o.id === a.otId) : null;
    return `<div class="oc-acao${a.status === 'concluida' ? ' concluida' : ''}">
      <div class="oc-acao-top">
        <span class="oc-badge ${a.tipo === 'preventiva' ? 'oc-tipo-ambiental' : 'oc-tipo-falha'}">${a.tipo === 'preventiva' ? 'Preventiva' : 'Corretiva'}</span>
        <span class="oc-badge ${a.status === 'concluida' ? 'oc-st-encerrada' : venc ? 'oc-st-cancelada' : 'oc-st-aberta'}">${a.status === 'concluida' ? 'Concluída' : venc ? 'Vencida' : 'Pendente'}</span>
        <span style="flex:1;"></span>
        ${ot ? `<span class="oc-ot-mini" onclick="ocAbrirOT('${ot.id}')">${OC_ICO.ot}${_ocEsc(ot.numero)}</span>` : ''}
      </div>
      <div class="oc-acao-desc">${_ocEsc(a.descricao)}</div>
      <div class="oc-acao-meta">${OC_ICO.user}${_ocEsc(a.responsavelNome || '—')} · ${OC_ICO.clock}Prazo ${_ocFmtData(a.prazo)}</div>
      ${a.status === 'concluida' ? `<div class="oc-acao-evid"><b>Evidência:</b> ${_ocEsc(a.evidencia)}<div class="oc-assinatura">${OC_ICO.check}Concluída por ${_ocEsc(a.concluidaPorNome || '—')} · ${_ocFmtDH(a.concluidaEm)}</div></div>` : ''}
      ${ret ? `<div class="oc-assinatura">${OC_ICO.undo}${ret.conclusaoAnterior ? 'Reaberta para retificação' : 'Retificada'} por ${_ocEsc(ret.porNome || '—')} · ${_ocFmtDH(ret.em)} — ${_ocEsc(ret.motivo)}${a.retificacoes.length > 1 ? ` (${a.retificacoes.length}×, ver Trilha)` : ''}</div>` : ''}
      ${podeRetificar ? `<div class="oc-acao-btns"><button class="btn btn-outline btn-sm" onclick="ocRetificarAcao('${a.id}')">${OC_ICO.edit} Retificar</button></div>` : ''}
      ${_ocAberta(oc) && a.status !== 'concluida' ? `<div class="oc-acao-btns">
        ${podeConcluir ? `<button class="btn btn-primary btn-sm" style="background:var(--green);" onclick="ocConcluirAcao('${a.id}')">${OC_ICO.check} Concluir</button>` : ''}
        ${podeEditar ? `<button class="btn btn-outline btn-sm" onclick="ocEditarAcao('${a.id}')">${OC_ICO.edit} Editar</button>` : ''}
        ${pode && canOT && !a.otId && _ocAtivoDe(oc) ? `<button class="btn btn-outline btn-sm" onclick="ocGerarOT('${oc.id}','${a.id}')">${OC_ICO.ot} Gerar OT</button>` : ''}
        ${pode && !a.retificacoes?.length ? `<button class="btn btn-outline btn-sm oc-btn-danger" onclick="ocRemoverAcao('${a.id}')">${OC_ICO.trash}</button>` : ''}
      </div>` : ''}
    </div>`;
  }).join('');

  const usuarios = _ocUsuarios();
  const form = pode ? _ocSecao('Nova ação', `
  <div class="form-row">
    <div class="form-field"><label class="field-label">Tipo</label>
      <select id="ocv-acao-tipo" class="field-select"><option value="corretiva">Corretiva (elimina a causa)</option><option value="preventiva">Preventiva (evita recorrência em outros ativos)</option></select></div>
    <div class="form-field"><label class="field-label">Prazo <span class="required">*</span></label><input type="date" id="ocv-acao-prazo" class="field-input" min="${_ocHoje()}"></div>
  </div>
  <div class="form-field"><label class="field-label">Descrição <span class="required">*</span></label><input type="text" id="ocv-acao-desc" class="field-input" placeholder="O que será feito"></div>
  <div class="form-field"><label class="field-label">Responsável <span class="required">*</span></label>
    <select id="ocv-acao-resp" class="field-select"><option value="">— Selecione —</option>${usuarios.map(u => `<option value="${u.id}">${_ocEsc(u.nomeCompleto)}${u.cargo ? ' · ' + _ocEsc(u.cargo) : ''}</option>`).join('')}</select></div>
  <div class="oc-acoes-form"><button class="btn btn-primary" onclick="ocAdicionarAcao()">${OC_ICO.plus} Adicionar ação</button></div>`) : '';

  const na = oc.acoes.length === 0 ? (pode ? _ocSecao('Sem ação corretiva', `
  <label class="oc-check"><input type="checkbox" id="ocv-acoes-na" ${oc.acoesNA.justificativa ? 'checked' : ''} onchange="ocAcoesNAToggle()"> Nenhuma ação corretiva é necessária</label>
  <div id="ocv-acoes-na-box" style="display:none;margin-top:8px;">
    <textarea id="ocv-acoes-na-just" class="field-textarea" placeholder="Justifique (ex.: evento externo isolado, sem causa controlável pelo laboratório)...">${_ocEsc(oc.acoesNA.justificativa || '')}</textarea>
    ${_ocAssinado(oc.acoesNA)}
    ${_ocBotaoSalvar('acoesNA', 'Salvar justificativa')}
  </div>`) : (oc.acoesNA.justificativa ? _ocSecao('Sem ação corretiva', `<div class="oc-texto">${_ocEsc(oc.acoesNA.justificativa)}</div>${_ocAssinado(oc.acoesNA)}`) : '')) : '';

  return `
<div class="oc-ajuda">Defina as ações que eliminam a causa raiz, com responsável e prazo. Ações que exigem intervenção técnica podem gerar uma OT.</div>
${_ocSecao(`Ações (${oc.acoes.filter(a => a.status === 'concluida').length}/${oc.acoes.length} concluídas)`, cards || `<div class="oc-vazio">Nenhuma ação registrada.</div>`)}
${form}
${na}
${_ocSecao('Evidências das ações', `${_ocAnexosHTML(oc, 'acoes', pode)}${_ocAberta(oc) && (pode || oc.acoes.some(a => a.responsavelId === me)) ? _ocUploadHTML('oc-acao') : ''}`)}
${!pode ? _ocAvisoSomenteLeitura(oc) : ''}`;
}

function ocAcoesNAToggle() {
  const box = document.getElementById('ocv-acoes-na-box');
  if (box) box.style.display = _ocChk('ocv-acoes-na') ? '' : 'none';
}

async function ocAdicionarAcao() {
  const oc = _ocClone(ocState.ocorrencias[_ocViewId]);
  if (!oc || !_ocAberta(oc) || !_ocCan('tratar')) return;
  const descricao = _ocVal('ocv-acao-desc'), prazo = _ocVal('ocv-acao-prazo'), respId = _ocVal('ocv-acao-resp');
  if (!descricao) { showToast('Descreva a ação.', 'error'); return; }
  if (!prazo)     { showToast('Informe o prazo.', 'error'); return; }
  if (!respId)    { showToast('Selecione o responsável.', 'error'); return; }
  const resp = _ocUsuarios().find(u => u.id === respId);
  // Eficácia reprovada: arquiva a verificação anterior e reinicia o ciclo
  if (oc.eficacia.verificadaEm && oc.eficacia.eficaz === false) {
    oc.eficaciaHistorico.push(oc.eficacia);
    oc.eficacia = { prevista: '' };
  }
  const acao = {
    id: _ocUid(), tipo: _ocVal('ocv-acao-tipo') || 'corretiva', descricao, prazo,
    responsavelId: respId, responsavelNome: resp?.nomeCompleto || '',
    status: 'pendente', criadaEm: _ocAgora(), criadaPorNome: _ocSess().nome,
  };
  oc.acoes.push(acao);
  oc.acoesNA = {};
  _ocTrilha(oc, 'acao', `Ação ${acao.tipo} adicionada: ${descricao} (resp.: ${acao.responsavelNome}, prazo ${_ocFmtData(prazo)})`);
  await _ocCommit(oc, 'Ação adicionada.', { tab: 'acoes' });
}

function ocConcluirAcao(acaoId) {
  const oc = ocState.ocorrencias[_ocViewId];
  const a = oc?.acoes.find(x => x.id === acaoId);
  if (!a) return;
  _ocPrompt({
    titulo: 'Concluir ação',
    subtitulo: a.descricao,
    html: `<div class="form-field"><label class="field-label">Evidência da execução <span class="required">*</span></label>
      <textarea id="oc-prompt-txt" class="field-textarea" style="min-height:90px;" placeholder="O que foi feito, onde está registrado (anexe arquivos na aba Ações)..."></textarea></div>`,
    confirmar: 'Concluir ação', cor: 'var(--green)',
    onConfirm: async () => {
      const evid = _ocVal('oc-prompt-txt');
      if (!evid) { showToast('Descreva a evidência da execução.', 'error'); return false; }
      const novo = _ocClone(ocState.ocorrencias[_ocViewId]);
      const ac = novo.acoes.find(x => x.id === acaoId);
      const u = _ocSess();
      Object.assign(ac, { status: 'concluida', evidencia: evid, concluidaEm: _ocAgora(), concluidaPorId: u.id, concluidaPorNome: u.nome });
      _ocTrilha(novo, 'acao_concluida', `Ação concluída: ${ac.descricao}`, [{ campo: 'Evidência', antes: '—', depois: evid }]);
      await _ocCommit(novo, 'Ação concluída.', { tab: 'acoes' });
      return true;
    },
  });
}

// Retificação de ação concluída: reabre a ação (volta a pendente) para editar, gerar OT
// e concluir de novo. Só com a ocorrência aberta; a conclusão anterior fica preservada
// em retificacoes[] e na trilha, com motivo obrigatório.
function ocRetificarAcao(acaoId) {
  const oc = ocState.ocorrencias[_ocViewId];
  const a = oc?.acoes.find(x => x.id === acaoId);
  if (!a || a.status !== 'concluida' || !_ocAberta(oc)) return;
  _ocPrompt({
    titulo: 'Retificar ação concluída',
    subtitulo: a.descricao,
    html: `<div class="oc-aviso">${OC_ICO.undo} A ação volta para <b>pendente</b>: poderá ser editada, gerar OT e ser concluída novamente. A conclusão atual fica registrada na trilha.</div>
      <div class="form-field"><label class="field-label">Motivo da retificação <span class="required">*</span></label>
      <textarea id="oc-prompt-txt" class="field-textarea" style="min-height:80px;" placeholder="Ex.: evidência incompleta, ação precisa de intervenção técnica (OT)..."></textarea></div>`,
    confirmar: 'Reabrir ação',
    onConfirm: async () => {
      const motivo = _ocVal('oc-prompt-txt');
      if (!motivo) { showToast('Informe o motivo da retificação.', 'error'); return false; }
      const novo = _ocClone(ocState.ocorrencias[_ocViewId]);
      if (!_ocAberta(novo)) { showToast('A ocorrência não está mais aberta.', 'error'); return false; }
      const ac = novo.acoes.find(x => x.id === acaoId);
      if (!ac || ac.status !== 'concluida') return false;
      const u = _ocSess();
      const conclusao = { evidencia: ac.evidencia, concluidaEm: ac.concluidaEm, concluidaPorId: ac.concluidaPorId, concluidaPorNome: ac.concluidaPorNome };
      ac.retificacoes = [...(ac.retificacoes || []), { em: _ocAgora(), porId: u.id, porNome: u.nome, motivo, conclusaoAnterior: conclusao }];
      ac.status = 'pendente';
      delete ac.evidencia; delete ac.concluidaEm; delete ac.concluidaPorId; delete ac.concluidaPorNome;
      _ocTrilha(novo, 'acao_retificada', `Ação reaberta para retificação: ${ac.descricao} — motivo: ${motivo}`, [
        { campo: 'Status', antes: 'Concluída', depois: 'Pendente' },
        { campo: 'Evidência', antes: conclusao.evidencia || '—', depois: '—' },
        { campo: 'Conclusão', antes: `${conclusao.concluidaPorNome || '—'} · ${_ocFmtDH(conclusao.concluidaEm)}`, depois: '—' },
      ]);
      await _ocCommit(novo, 'Ação reaberta para retificação.', { tab: 'acoes' });
      return true;
    },
  });
}

// Edição de ação pendente (descrição); a alteração vai para a trilha com antes/depois
function ocEditarAcao(acaoId) {
  const oc = ocState.ocorrencias[_ocViewId];
  const a = oc?.acoes.find(x => x.id === acaoId);
  if (!a || a.status === 'concluida' || !_ocAberta(oc)) return;
  _ocPrompt({
    titulo: 'Editar ação',
    subtitulo: `${a.tipo === 'preventiva' ? 'Preventiva' : 'Corretiva'} · ${a.responsavelNome || '—'} · prazo ${_ocFmtData(a.prazo)}`,
    html: `<div class="form-field"><label class="field-label">Descrição <span class="required">*</span></label>
      <textarea id="oc-prompt-txt" class="field-textarea" style="min-height:110px;">${_ocEsc(a.descricao)}</textarea></div>`,
    confirmar: 'Salvar',
    onConfirm: async () => {
      const descricao = _ocVal('oc-prompt-txt');
      if (!descricao) { showToast('Descreva a ação.', 'error'); return false; }
      const novo = _ocClone(ocState.ocorrencias[_ocViewId]);
      if (!_ocAberta(novo)) { showToast('A ocorrência não está mais aberta.', 'error'); return false; }
      const ac = novo.acoes.find(x => x.id === acaoId);
      if (!ac) return false;
      if (descricao === ac.descricao) return true;
      _ocTrilha(novo, 'acao_editada', `Ação editada: ${descricao}`, [{ campo: 'Descrição', antes: ac.descricao, depois: descricao }]);
      ac.descricao = descricao;
      await _ocCommit(novo, 'Ação atualizada.', { tab: 'acoes' });
      return true;
    },
  });
}

async function ocRemoverAcao(acaoId) {
  const atual = ocState.ocorrencias[_ocViewId]?.acoes.find(x => x.id === acaoId);
  if (!atual) return;
  if (!(await uiConfirmar({
    tipo: 'perigo', titulo: 'Remover ação?', confirmar: 'Remover ação',
    mensagem: `<b>${uiEsc(atual.descricao)}</b>`,
    detalhe: 'A remoção fica registrada na trilha de auditoria.',
  }))) return;
  const oc = _ocClone(ocState.ocorrencias[_ocViewId]);
  const a = oc?.acoes.find(x => x.id === acaoId);
  if (!a || !_ocAberta(oc) || a.status === 'concluida' || a.retificacoes?.length) return;
  oc.acoes = oc.acoes.filter(x => x.id !== acaoId);
  _ocTrilha(oc, 'acao_removida', `Ação removida: ${a.descricao} (resp.: ${a.responsavelNome}, prazo ${_ocFmtData(a.prazo)})`);
  _ocCommit(oc, 'Ação removida.', { tab: 'acoes' });
}

// ── ABA EFICÁCIA & LIBERAÇÃO ─────────────────────────────────
function _ocTabEficacia(oc) {
  const ef = oc.eficacia;
  const pode = _ocAberta(oc) && _ocCan('tratar');
  const acoesOk = _ocAcoesOk(oc);

  const hist = oc.eficaciaHistorico.length ? _ocSecao('Verificações anteriores', oc.eficaciaHistorico.map(h => `<div class="oc-hist">
    <b>${h.eficaz ? 'Eficaz' : 'Não eficaz'}</b> em ${_ocFmtData(h.verificadaEm)} — ${_ocEsc(h.descricao)} ${_ocAssinado(h)}</div>`).join('')) : '';

  let efHTML;
  if (pode) {
    const radio = (v, lbl) => `<label class="oc-radio"><input type="radio" name="ocv-ef-eficaz" value="${v}" ${String(ef.eficaz) === v ? 'checked' : ''} ${acoesOk ? '' : 'disabled'}>${lbl}</label>`;
    efHTML = `
      <div class="form-field"><label class="field-label">Data prevista para a verificação</label><input type="date" id="ocv-ef-prevista" class="field-input" value="${_ocEsc(ef.prevista || '')}"></div>
      ${acoesOk ? '' : `<div class="oc-aviso">${OC_ICO.clock} A verificação é liberada após a conclusão das ações.</div>`}
      <div class="form-row">
        <div class="form-field"><label class="field-label">Verificada em</label><input type="date" id="ocv-ef-data" class="field-input" max="${_ocHoje()}" value="${_ocEsc(ef.verificadaEm || '')}" ${acoesOk ? '' : 'disabled'}></div>
        <div class="form-field"><label class="field-label">As ações foram eficazes?</label><div class="oc-radio-row">${radio('true', 'Sim')}${radio('false', 'Não')}</div></div>
      </div>
      <div class="form-field"><label class="field-label">Evidência da eficácia</label>
        <textarea id="ocv-ef-desc" class="field-textarea" ${acoesOk ? '' : 'disabled'} placeholder="Ex.: sem recorrência em 30 dias; CQ dentro dos limites; monitoramento de temperatura estável...">${_ocEsc(ef.descricao || '')}</textarea></div>
      ${_ocAssinado(ef)}
      ${_ocBotaoSalvar('eficacia', 'Salvar eficácia')}`;
  } else {
    efHTML = `<div class="oc-grid">${_ocInfo('Prevista', _ocFmtData(ef.prevista))}${_ocInfo('Verificada em', _ocFmtData(ef.verificadaEm))}
      ${_ocInfo('Eficaz', ef.eficaz === true ? 'Sim' : ef.eficaz === false ? 'Não' : '—')}${_ocInfo('Evidência', `<div class="oc-texto">${_ocEsc(ef.descricao)}</div>`, true)}</div>${_ocAssinado(ef)}`;
  }

  // Desfecho de cada ativo parado: retorno ao uso, fora de uso ou baixa, com a data
  // real do evento. Vários podem ser registrados juntos quando tudo vale para todos;
  // motivos diferentes = um registro por ativo.
  const parados = oc.ativos.filter(a => a.parado);
  const pendentes = parados.filter(a => !a.liberacao.liberado);
  const liberados = parados.filter(a => a.liberacao.liberado);
  let libHTML = '';
  if (parados.length) {
    const libsVistas = new Set();
    const blocosLiberados = liberados.map(a => {
      const l = a.liberacao, d = _ocDesfecho(l);
      const ev = l.liberacaoId && !libsVistas.has(l.liberacaoId)
        ? (libsVistas.add(l.liberacaoId), _ocAnexosHTML(oc, 'liberacao', false, x => x.liberacaoId === l.liberacaoId))
        : (l.liberacaoId ? '<div class="oc-nota">Mesma evidência do registro acima.</div>' : _ocAnexosHTML(oc, 'liberacao', false, x => !x.liberacaoId));
      return `<div class="oc-liberado${d === 'retorno' ? '' : ' oc-retirado'}">${d === 'retorno' ? OC_ICO.unlock : OC_ICO.lock}<div style="flex:1;min-width:0;"><b>${_ocEsc(a.snapshot.nome)}</b> — ${OC_DESFECHOS[d].label.toLowerCase()}
        <div class="oc-grid" style="margin-top:8px;">
          ${_ocInfo(OC_DESFECHOS[d].dataLbl, _ocFmtDH(_ocDataDesfecho(l)))}
          ${d === 'retorno' ? _ocInfo('Critério', _ocEsc(l.criterio)) : _ocInfo('Motivo', _ocEsc(l.motivo))}
          ${_ocInfo('Parado desde', _ocFmtDH(a.dataHoraParada))}${_ocInfo('Registrado por', `${_ocEsc(l.porNome)} · ${_ocFmtDH(l.em)}`)}
          ${_ocInfo(d === 'retorno' ? 'Verificação' : 'Descrição', `<div class="oc-texto">${_ocEsc(l.descricao)}</div>`, true)}
        </div>${ev}</div></div>`;
    }).join('');

    let formHTML = '';
    if (pendentes.length && _ocAberta(oc) && _ocCan('liberarAtivo')) {
      const unico = pendentes.length === 1;
      const optAtivo = a => `<label class="oc-pop-opt">
          <input type="checkbox" class="ocv-lib-ativo" value="${a.ativoId}" data-nome="${_ocEsc(a.snapshot.nome)}" ${unico ? 'checked' : ''} onchange="ocLibAtivosSync()">
          <span class="oc-pop-mark oc-pop-mark-check">${OC_ICO.check}</span>
          <span class="oc-pop-txt"><b>${_ocEsc(a.snapshot.nome)}</b><small>${OC_ICO.clock}Parado desde ${_ocFmtDH(a.dataHoraParada)}${_ocParadoHa(a.dataHoraParada)}</small></span>
        </label>`;
      const optDesf = k => `<label class="oc-pop-opt oc-desf-${k}">
          <input type="radio" name="ocv-lib-desfecho" value="${k}" onchange="ocLibDesfechoToggle()">
          <span class="oc-pop-ico">${OC_ICO[OC_DESF_UI[k].ico]}</span>
          <span class="oc-pop-txt"><b>${OC_DESFECHOS[k].label}</b><small>${OC_DESF_UI[k].desc}</small></span>
          <span class="oc-pop-mark">${OC_ICO.check}</span>
        </label>`;
      formHTML = `<div class="oc-aviso oc-aviso-red">${OC_ICO.lock} ${pendentes.length > 1 ? `${pendentes.length} ativos fora de uso` : 'Ativo fora de uso'}. Registre o desfecho de cada um: retorno ao uso (com as OTs de pausa concluídas) ou retirada de uso. Se os motivos forem diferentes, registre um ativo por vez.</div>
        <div class="form-row">
          <div class="form-field"><label class="field-label">Ativos deste registro <span class="required">*</span></label>
            <div class="oc-pop-wrap">
              <button type="button" class="oc-pop-trigger" id="ocv-lib-ativos-trg" aria-haspopup="true" aria-expanded="false" onclick="ocPopToggle('ocv-lib-ativos-pop', event)">${_ocLibAtivosTrgHTML(unico ? [pendentes[0].snapshot.nome] : [], pendentes.length)}</button>
              <div class="oc-pop" id="ocv-lib-ativos-pop" role="listbox" aria-multiselectable="true">
                ${unico ? '' : `<div class="oc-pop-head"><span>${pendentes.length} ativos parados</span>
                  <button type="button" class="oc-pop-link" onclick="ocLibAtivosTodos(true)">Todos</button>
                  <button type="button" class="oc-pop-link" onclick="ocLibAtivosTodos(false)">Nenhum</button></div>`}
                ${pendentes.map(optAtivo).join('')}
              </div>
            </div></div>
          <div class="form-field"><label class="field-label">Desfecho <span class="required">*</span></label>
            <div class="oc-pop-wrap">
              <button type="button" class="oc-pop-trigger" id="ocv-lib-desf-trg" aria-haspopup="true" aria-expanded="false" onclick="ocPopToggle('ocv-lib-desf-pop', event)">${_ocLibDesfTrgHTML('')}</button>
              <div class="oc-pop" id="ocv-lib-desf-pop" role="listbox">${Object.keys(OC_DESFECHOS).map(optDesf).join('')}</div>
            </div></div>
        </div>
        <div id="ocv-lib-campos" style="display:none;">
          <div class="form-row">
            <div class="form-field"><label class="field-label"><span id="ocv-lib-data-lbl">Data/hora</span> <span class="required">*</span></label>
              <input type="datetime-local" id="ocv-lib-data" class="field-input" max="${_ocNowLocal()}"></div>
            <div class="form-field" id="ocv-lib-criterio-box"><label class="field-label">Critério de liberação <span class="required">*</span></label>
              <select id="ocv-lib-criterio" class="field-select">${_ocOptions(ocState.catalogos.criteriosLiberacao, '')}</select></div>
            <div class="form-field" id="ocv-lib-motivo-box"><label class="field-label">Motivo da retirada <span class="required">*</span></label>
              <select id="ocv-lib-motivo" class="field-select">${_ocOptions(ocState.catalogos.motivosRetirada || [], '')}</select></div>
          </div>
          <div class="form-field"><label class="field-label">Descrição <span class="required">*</span></label>
            <textarea id="ocv-lib-desc" class="field-textarea" placeholder="Testes realizados, resultados obtidos, quem verificou..."></textarea></div>
          <div class="field-label" style="margin:6px 0;">Evidência <span class="oc-cell-sub" id="ocv-lib-ev-opc"> (opcional: termo de baixa, laudo, orçamento...)</span></div>
          ${_ocAnexosHTML(oc, 'liberacao', true, x => !x.liberacaoId)}
          ${_ocUploadHTML('oc-lib')}
          <div class="oc-acoes-form"><button class="btn btn-primary" id="ocv-lib-btn" onclick="ocLiberarAtivos()">${OC_ICO.check} Registrar desfecho</button></div>
        </div>`;
    } else if (pendentes.length) {
      formHTML = `<div class="oc-aviso oc-aviso-red">${OC_ICO.lock} Aguardando o registro do desfecho: ${_ocEsc(pendentes.map(a => a.snapshot.nome).join(', '))}${_ocAberta(oc) ? ' (requer permissão "Liberar ativo para uso")' : ''}.</div>`;
    }
    libHTML = formHTML + blocosLiberados;
  }

  return `
<div class="oc-ajuda">Confirme, após um período adequado, que as ações eliminaram a causa (sem recorrência). Cada ativo retirado de uso só volta a operar com a liberação formal — ou é registrado como fora de uso / desativado.</div>
${parados.length ? _ocSecao(`Desfecho dos ativos parados (${liberados.length}/${parados.length})`, libHTML) : ''}
${_ocSecao('Verificação de eficácia', efHTML)}
${hist}
${!pode ? _ocAvisoSomenteLeitura(oc) : ''}`;
}

// ── POPOVER DE SELEÇÃO (ativos / desfecho) ───────────────────
// Os inputs ficam dentro do popover (só oculto), então a leitura do formulário não muda.
function ocPopToggle(id, ev) {
  ev?.stopPropagation();
  const pop = document.getElementById(id);
  if (!pop) return;
  const abrir = !pop.classList.contains('open');
  _ocPopFechar();
  if (!abrir) return;
  pop.classList.add('open');
  pop.previousElementSibling?.setAttribute('aria-expanded', 'true');
}

function _ocPopFechar() {
  document.querySelectorAll('.oc-pop.open').forEach(p => {
    p.classList.remove('open');
    p.previousElementSibling?.setAttribute('aria-expanded', 'false');
  });
}

document.addEventListener('click', e => { if (!e.target.closest('.oc-pop-wrap')) _ocPopFechar(); });
// Captura: o Esc fecha só o popover, sem fechar o modal da ocorrência junto
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !document.querySelector('.oc-pop.open')) return;
  e.stopPropagation();
  _ocPopFechar();
}, true);

function _ocParadoHa(dataHora) {
  const ms = Date.now() - new Date(dataHora).getTime();
  if (!dataHora || isNaN(ms) || ms < 0) return '';
  const h = Math.floor(ms / 3600000), d = Math.floor(h / 24);
  return d >= 1 ? ` · há ${d} dia${d > 1 ? 's' : ''}` : ` · há ${h}h`;
}

function ocLibAtivosTodos(marcar) {
  document.querySelectorAll('.ocv-lib-ativo').forEach(el => { el.checked = marcar; });
  ocLibAtivosSync();
}

function ocLibAtivosSync() {
  const trg = document.getElementById('ocv-lib-ativos-trg');
  if (!trg) return;
  const todos = [...document.querySelectorAll('.ocv-lib-ativo')];
  const sel = todos.filter(el => el.checked);
  trg.innerHTML = _ocLibAtivosTrgHTML(sel.map(el => el.dataset.nome), todos.length);
}

function _ocLibAtivosTrgHTML(nomes, total) {
  const chips = nomes.map(n => `<span class="oc-pop-chip">${_ocEsc(n)}</span>`).join('');
  return `<span class="oc-pop-val">${nomes.length ? chips : '<span class="oc-pop-ph">Selecione os ativos…</span>'}</span>
    ${total > 1 ? `<span class="oc-pop-count">${nomes.length}/${total}</span>` : ''}<span class="oc-pop-chev"></span>`;
}

function _ocLibDesfTrigger(d) {
  const trg = document.getElementById('ocv-lib-desf-trg');
  if (!trg) return;
  trg.className = `oc-pop-trigger${d ? ` oc-desf-${d}` : ''}`;
  trg.innerHTML = _ocLibDesfTrgHTML(d);
}

function _ocLibDesfTrgHTML(d) {
  return `<span class="oc-pop-val">${d
    ? `<span class="oc-pop-ico">${OC_ICO[OC_DESF_UI[d].ico]}</span><b>${OC_DESFECHOS[d].label}</b>`
    : '<span class="oc-pop-ph">Escolha o desfecho…</span>'}</span><span class="oc-pop-chev"></span>`;
}

function ocLibDesfechoToggle() {
  const d = _ocRadio('ocv-lib-desfecho');
  _ocLibDesfTrigger(d);
  if (d) _ocPopFechar();
  const campos = document.getElementById('ocv-lib-campos');
  if (!campos) return;
  campos.style.display = d ? '' : 'none';
  if (!d) return;
  const retorno = d === 'retorno';
  const show = (id, v) => { const el = document.getElementById(id); if (el) el.style.display = v ? '' : 'none'; };
  show('ocv-lib-criterio-box', retorno); show('ocv-lib-motivo-box', !retorno);
  document.getElementById('ocv-lib-ev-opc').textContent = retorno
    ? ' (opcional: teste, CQ, laudo, foto do display...)'
    : ' (opcional: termo de baixa, laudo, orçamento...)';
  document.getElementById('ocv-lib-data-lbl').textContent = OC_DESFECHOS[d].dataLbl;
  document.getElementById('ocv-lib-desc').placeholder = retorno
    ? 'Testes realizados, resultados obtidos, quem verificou...'
    : 'Situação do ativo, decisão tomada, quem autorizou, destino do equipamento...';
  const btn = document.getElementById('ocv-lib-btn');
  btn.style.background = retorno ? 'var(--green)' : '';
  btn.innerHTML = retorno ? `${OC_ICO.unlock} Liberar para uso` : `${OC_ICO.lock} Registrar retirada de uso`;
}

async function ocLiberarAtivos() {
  const oc = _ocClone(ocState.ocorrencias[_ocViewId]);
  if (!oc || !_ocAberta(oc) || !_ocCan('liberarAtivo')) { showToast('Sem permissão para registrar o desfecho dos ativos.', 'error'); return; }
  if (_uploadsInProgress?.['oc-lib']) { showToast('Aguarde o envio do arquivo terminar.', 'error'); return; }
  const ids = [...document.querySelectorAll('.ocv-lib-ativo:checked')].map(el => el.value);
  const desfecho = _ocRadio('ocv-lib-desfecho');
  const retorno = desfecho === 'retorno';
  const dataHora = _ocVal('ocv-lib-data'), descricao = _ocVal('ocv-lib-desc');
  const criterio = retorno ? _ocVal('ocv-lib-criterio') : '';
  const motivo   = retorno ? '' : _ocVal('ocv-lib-motivo');
  if (!ids.length)  { showToast('Selecione os ativos deste registro.', 'error'); return; }
  if (!OC_DESFECHOS[desfecho]) { showToast('Indique o desfecho: retorno ao uso, fora de uso ou desativado.', 'error'); return; }
  if (!dataHora)    { showToast(`Informe a ${OC_DESFECHOS[desfecho].dataLbl.toLowerCase()}.`, 'error'); return; }
  if (dataHora > _ocNowLocal()) { showToast('A data/hora não pode estar no futuro.', 'error'); return; }
  if (retorno && !criterio) { showToast('Selecione o critério de liberação.', 'error'); return; }
  if (!retorno && !motivo)  { showToast('Selecione o motivo da retirada de uso.', 'error'); return; }
  if (!descricao)   { showToast(retorno ? 'Descreva a verificação realizada.' : 'Descreva a situação e a decisão sobre o ativo.', 'error'); return; }
  const alvos = oc.ativos.filter(a => ids.includes(a.ativoId) && a.parado && !a.liberacao.liberado);
  const antesDaParada = alvos.filter(a => a.dataHoraParada && dataHora < a.dataHoraParada);
  if (antesDaParada.length) {
    showToast(`A data/hora é anterior à parada de: ${antesDaParada.map(a => `${a.snapshot.nome} (${_ocFmtDH(a.dataHoraParada)})`).join(', ')}.`, 'error'); return;
  }
  const evidencias = oc.anexos.filter(a => a.etapa === 'liberacao' && !a.liberacaoId);
  const nomes = alvos.map(a => a.snapshot.nome).join(', ');
  const nomesHTML = alvos.map(a => `<b>${uiEsc(a.snapshot.nome)}</b>`).join(', ');
  const ok = await uiConfirmar(retorno ? {
    tipo: 'sucesso', icone: 'sucesso', titulo: 'Liberar para uso?', confirmar: 'Liberar para uso',
    mensagem: `Liberação formal de ${nomesHTML}, com retorno em <b>${_ocFmtDH(dataHora)}</b>.`,
  } : {
    tipo: desfecho === 'baixa' ? 'perigo' : 'aviso', titulo: `${OC_DESFECHOS[desfecho].label}?`, confirmar: 'Registrar desfecho',
    mensagem: `${nomesHTML} — ${uiEsc(OC_DESFECHOS[desfecho].label.toLowerCase())} em <b>${_ocFmtDH(dataHora)}</b>.`,
    detalhe: `O ativo passará para "Em desuso" no cadastro.`,
  });
  if (!ok) return;
  const liberacaoId = _ocUid();
  const ass = _ocAssinatura();
  alvos.forEach(a => {
    a.liberacao = { liberado: true, desfecho, dataHora, descricao, liberacaoId, ...(retorno ? { criterio } : { motivo }), ...ass };
  });
  evidencias.forEach(a => { a.liberacaoId = liberacaoId; });
  _ocTrilha(oc, 'liberacao', `${OC_DESFECHOS[desfecho].label} — ${nomes} — ${retorno ? criterio : motivo}`, [
    { campo: OC_DESFECHOS[desfecho].dataLbl, antes: '—', depois: _ocFmtDH(dataHora) },
    { campo: retorno ? 'Verificação' : 'Descrição', antes: '—', depois: descricao },
    ...(evidencias.length ? [{ campo: 'Evidências', antes: '—', depois: evidencias.map(a => a.titulo).join(', ') }] : []),
  ]);
  const msg = retorno ? (alvos.length > 1 ? `${alvos.length} ativos liberados.` : 'Liberação registrada.')
                      : (alvos.length > 1 ? `${alvos.length} ativos retirados de uso.` : 'Retirada de uso registrada.');
  await _ocCommit(oc, msg, { tab: 'eficacia' });
  if (retorno) _ocReavaliarAtivo(oc);
  else _ocRetirarDeUso(oc, alvos);
}

// Fora de uso / baixa: o ativo sai da pausa da ocorrência direto para "Em desuso"
function _ocRetirarDeUso(oc, alvos) {
  if (typeof state === 'undefined' || typeof _ativoIdxById !== 'function') return;
  const u = _ocSess();
  const nomes = [];
  alvos.forEach(item => {
    const idx = _ativoIdxById(item.ativoId);
    if (idx < 0) return;
    const a = state.ativos[idx];
    const l = item.liberacao;
    const ST = { em_uso: 'Em uso', em_pausa: 'Em pausa', em_desuso: 'Em desuso' };
    const hist = Array.isArray(a._historico) ? a._historico : [];
    state.ativos[idx] = {
      ...a, statusUso: 'em_desuso', pausaOTs: [], pausaOcorrencias: [],
      _historico: [{ ts: _ocAgora(), userId: u.id, userName: u.nome, isNew: false, diffs: [
        { campo: 'Status de uso', antes: ST[a.statusUso] || a.statusUso || '—', depois: 'Em desuso' },
        { campo: 'Motivo', antes: '—', depois: `${OC_DESFECHOS[l.desfecho].label}: ${l.motivo} (${oc.numero}, ${_ocFmtDH(l.dataHora)})` },
      ] }, ...hist],
    };
    nomes.push(a.nome);
  });
  if (!nomes.length) return;
  saveState();
  showToast(`${nomes.map(n => `"${n}"`).join(', ')} ${nomes.length > 1 ? 'passaram' : 'passou'} para Em desuso.`, 'success');
}

// ── ABA NOTIFICAÇÃO ──────────────────────────────────────────
function _ocTabNotificacao(oc) {
  const n = oc.notificacao;
  const pode = _ocAberta(oc) && _ocCan('tratar');
  const alerta = (oc.severidade === 'critica' || oc.impacto.riscoPaciente || oc.tipo === 'alerta_fabricante' || oc.tipo === 'acidente')
    ? `<div class="oc-aviso oc-aviso-red">${OC_ICO.alerta} ${oc.tipo === 'alerta_fabricante' ? 'Alerta do fabricante: verifique as ações exigidas e o registro junto à vigilância sanitária.' : 'Evento crítico, com risco ao paciente ou acidente: avalie com atenção a notificação à vigilância sanitária (tecnovigilância) e ao fabricante.'}</div>` : '';
  if (!pode) {
    return alerta + (n.requer !== undefined ? _ocSecao('Notificação', `<div class="oc-grid">
      ${_ocInfo('Requer notificação', OC_FMT.requer(n.requer))}
      ${n.requer ? `${_ocInfo('Destinos', _ocEsc(OC_FMT.destinos(n.destinos)))}${_ocInfo('Protocolo', _ocEsc(n.protocolo))}${_ocInfo('Data', _ocFmtData(n.data))}` : ''}
      ${_ocInfo(n.requer ? 'Descrição' : 'Justificativa', `<div class="oc-texto">${_ocEsc(n.descricao)}</div>`, true)}
    </div>${_ocAssinado(n)}${_ocAnexosHTML(oc, 'notificacao', false)}`) : `<div class="oc-vazio">Notificação ainda não avaliada.</div>`) + _ocAvisoSomenteLeitura(oc);
  }
  const radio = (v, lbl) => `<label class="oc-radio"><input type="radio" name="ocv-notif-requer" value="${v}" ${String(n.requer) === v ? 'checked' : ''} onchange="ocNotifToggle()">${lbl}</label>`;
  return `
<div class="oc-ajuda">Registre se o evento exige notificação a órgãos sanitários ou ao fabricante (queixa técnica, evento adverso, tecnovigilância) e guarde o comprovante.</div>
${alerta}
${_ocSecao('Necessidade de notificação', `
  <div class="form-field"><label class="field-label">O evento requer notificação externa? <span class="required">*</span></label>
    <div class="oc-radio-row">${radio('true', 'Sim')}${radio('false', 'Não')}</div></div>
  <div id="ocv-notif-sim" style="display:none;">
    <div class="form-field"><label class="field-label">Destinos</label>
      ${Object.entries(OC_DESTINOS).map(([k, lbl]) => `<label class="oc-check"><input type="checkbox" class="ocv-notif-dest" value="${k}" ${n.destinos.includes(k) ? 'checked' : ''}> ${lbl}</label>`).join('')}</div>
    <div class="form-row">
      <div class="form-field"><label class="field-label">Nº do protocolo <span class="required">*</span></label><input type="text" id="ocv-notif-protocolo" class="field-input" value="${_ocEsc(n.protocolo || '')}"></div>
      <div class="form-field"><label class="field-label">Data da notificação <span class="required">*</span></label><input type="date" id="ocv-notif-data" class="field-input" max="${_ocHoje()}" value="${_ocEsc(n.data || '')}"></div>
    </div>
  </div>
  <div class="form-field"><label class="field-label" id="ocv-notif-desc-lbl">Descrição / justificativa</label>
    <textarea id="ocv-notif-desc" class="field-textarea" placeholder="Detalhes da notificação ou justificativa de não notificar...">${_ocEsc(n.descricao || '')}</textarea></div>
  ${_ocAssinado(n)}
  ${_ocBotaoSalvar('notificacao', 'Salvar notificação')}`)}
${_ocSecao('Comprovantes', `${_ocAnexosHTML(oc, 'notificacao', true)}${_ocUploadHTML('oc-notif')}`)}`;
}

function ocNotifToggle() {
  const box = document.getElementById('ocv-notif-sim');
  if (box) box.style.display = _ocRadio('ocv-notif-requer') === 'true' ? '' : 'none';
}

// ── ABA TRILHA ───────────────────────────────────────────────
function _ocTabTrilha(oc) {
  const itens = [...oc.trilha].reverse();
  return `
<div class="oc-ajuda">Registro cronológico e inalterável de todas as ações realizadas nesta ocorrência.</div>
<div class="oc-trilha">${itens.map(t => `
  <div class="oc-trilha-item oc-trilha-${_ocEsc(t.acao)}">
    <div class="oc-trilha-dot"></div>
    <div class="oc-trilha-body">
      <div class="oc-trilha-head"><b>${_ocEsc(t.userName)}</b><span>${_ocFmtDH(t.ts)}</span></div>
      <div class="oc-trilha-txt">${_ocEsc(t.texto)}</div>
      ${t.diffs && t.diffs.length ? `<table class="oc-trilha-diff">${t.diffs.map(d => `<tr><td>${_ocEsc(d.campo)}</td><td class="antes">${_ocEsc(d.antes)}</td><td>→</td><td class="depois">${_ocEsc(d.depois)}</td></tr>`).join('')}</table>` : ''}
    </div>
  </div>`).join('')}</div>`;
}

// ── SALVAR ETAPAS ────────────────────────────────────────────
async function ocSalvarEtapa(etapa) {
  const atual = ocState.ocorrencias[_ocViewId];
  if (!atual || !_ocAberta(atual) || !_ocCan('tratar')) { showToast('Sem permissão para tratar esta ocorrência.', 'error'); return; }
  const oc = _ocClone(atual);

  if (etapa === 'impacto') {
    const afeta = _ocRadio('ocv-imp-afeta');
    const just = _ocVal('ocv-imp-just');
    if (!afeta) { showToast('Indique se os resultados podem ter sido afetados.', 'error'); return; }
    const sim = afeta === 'sim';
    const novo = {
      afetaResultados: afeta,
      periodoDe: sim ? _ocVal('ocv-imp-de') : '', periodoAte: sim ? _ocVal('ocv-imp-ate') : '',
      examesAfetados: sim ? _ocVal('ocv-imp-exames') : '', qtdAmostras: sim ? _ocVal('ocv-imp-qtd') : '',
      laudosLiberadosAfetados: sim ? _ocChk('ocv-imp-laudos') : false,
      acaoResultados: sim ? _ocVal('ocv-imp-acao') : '',
      riscoPaciente: _ocChk('ocv-imp-risco-pac'), riscoOperador: _ocChk('ocv-imp-risco-op'),
      justificativa: just,
    };
    if (afeta !== 'em_avaliacao' && !just) { showToast('Descreva a fundamentação da avaliação.', 'error'); return; }
    if (sim && !novo.acaoResultados) { showToast('Informe a ação tomada sobre os resultados.', 'error'); return; }
    if (sim && novo.periodoDe && novo.periodoAte && novo.periodoAte < novo.periodoDe) { showToast('Período afetado inválido.', 'error'); return; }
    const diffs = _ocDiff(oc.impacto, novo, OC_LBL_IMPACTO);
    if (!diffs.length) { showToast('Nenhuma alteração para salvar.', 'error'); return; }
    oc.impacto = { ...novo, ..._ocAssinatura() };
    _ocTrilha(oc, 'impacto', 'Avaliação de impacto registrada', diffs);
    if ((novo.riscoPaciente || novo.laudosLiberadosAfetados) && oc.severidade !== 'critica'
        && await uiConfirmar({
          titulo: 'Elevar severidade para Crítica?', confirmar: 'Elevar para Crítica', cancelar: 'Manter atual',
          mensagem: `A avaliação indica ${[novo.riscoPaciente && '<b>risco ao paciente</b>', novo.laudosLiberadosAfetados && '<b>laudos liberados afetados</b>'].filter(Boolean).join(' e ')}.`,
          detalhe: `Severidade atual: ${uiEsc(OC_SEV[oc.severidade]?.label || '—')}.`,
        })) {
      _ocTrilha(oc, 'edicao', 'Severidade elevada após avaliação de impacto', [{ campo: 'Severidade', antes: OC_SEV[oc.severidade]?.label, depois: 'Crítica' }]);
      oc.severidade = 'critica';
    }
  }

  else if (etapa === 'causa') {
    const metodo = _ocVal('ocv-causa-metodo');
    const novo = {
      metodo,
      porques: metodo === '5porques' ? [0, 1, 2, 3, 4].map(n => _ocVal('ocv-causa-pq-' + n)) : [],
      ishikawa: metodo === 'ishikawa' ? Object.fromEntries(Object.keys(OC_ISHIKAWA).map(k => [k, _ocVal('ocv-causa-ish-' + k)])) : {},
      causaRaiz: _ocVal('ocv-causa-raiz'),
      descricao: _ocVal('ocv-causa-desc'),
    };
    if (!novo.causaRaiz) { showToast('Selecione a causa raiz.', 'error'); return; }
    if (!novo.descricao) { showToast('Descreva a conclusão da análise.', 'error'); return; }
    if (metodo === '5porques' && !novo.porques[0]) { showToast('Preencha ao menos o 1º porquê.', 'error'); return; }
    while (novo.porques.length && !novo.porques[novo.porques.length - 1]) novo.porques.pop();
    const diffs = _ocDiff(oc.analiseCausa, novo, OC_LBL_CAUSA);
    if (!diffs.length) { showToast('Nenhuma alteração para salvar.', 'error'); return; }
    oc.analiseCausa = { ...novo, ..._ocAssinatura() };
    _ocTrilha(oc, 'causa', 'Análise de causa registrada', diffs);
  }

  else if (etapa === 'acoesNA') {
    const just = _ocChk('ocv-acoes-na') ? _ocVal('ocv-acoes-na-just') : '';
    if (_ocChk('ocv-acoes-na') && !just) { showToast('Justifique a ausência de ação corretiva.', 'error'); return; }
    if ((oc.acoesNA.justificativa || '') === just) { showToast('Nenhuma alteração para salvar.', 'error'); return; }
    oc.acoesNA = just ? { justificativa: just, ..._ocAssinatura() } : {};
    _ocTrilha(oc, 'acao', just ? `Registrado que nenhuma ação corretiva é necessária: ${just}` : 'Justificativa de "sem ação corretiva" removida');
  }

  else if (etapa === 'eficacia') {
    const acoesOk = _ocAcoesOk(oc);
    const eficazRaw = _ocRadio('ocv-ef-eficaz');
    const novo = {
      prevista: _ocVal('ocv-ef-prevista'),
      verificadaEm: acoesOk ? _ocVal('ocv-ef-data') : (oc.eficacia.verificadaEm || ''),
      eficaz: acoesOk ? (eficazRaw === 'true' ? true : eficazRaw === 'false' ? false : null) : (oc.eficacia.eficaz ?? null),
      descricao: acoesOk ? _ocVal('ocv-ef-desc') : (oc.eficacia.descricao || ''),
    };
    if (acoesOk && (novo.verificadaEm || novo.eficaz !== null)) {
      if (!novo.verificadaEm) { showToast('Informe a data da verificação.', 'error'); return; }
      if (novo.eficaz === null) { showToast('Indique se as ações foram eficazes.', 'error'); return; }
      if (!novo.descricao) { showToast('Descreva a evidência da eficácia.', 'error'); return; }
    }
    const diffs = _ocDiff(oc.eficacia, novo, OC_LBL_EFICACIA);
    if (!diffs.length) { showToast('Nenhuma alteração para salvar.', 'error'); return; }
    oc.eficacia = { ...novo, ..._ocAssinatura() };
    _ocTrilha(oc, 'eficacia', novo.verificadaEm ? `Eficácia verificada: ${novo.eficaz ? 'eficaz' : 'NÃO eficaz'}` : 'Verificação de eficácia planejada', diffs);
    if (novo.eficaz === false) showToast('Ações não eficazes: registre novas ações na aba Ações.', 'error');
  }

  else if (etapa === 'notificacao') {
    const r = _ocRadio('ocv-notif-requer');
    if (!r) { showToast('Indique se o evento requer notificação.', 'error'); return; }
    const requer = r === 'true';
    const novo = {
      requer,
      destinos: requer ? [...document.querySelectorAll('.ocv-notif-dest:checked')].map(el => el.value) : [],
      protocolo: requer ? _ocVal('ocv-notif-protocolo') : '',
      data: requer ? _ocVal('ocv-notif-data') : '',
      descricao: _ocVal('ocv-notif-desc'),
    };
    if (requer && !novo.destinos.length) { showToast('Selecione ao menos um destino.', 'error'); return; }
    if (!requer && !novo.descricao) { showToast('Justifique por que não há necessidade de notificação.', 'error'); return; }
    const diffs = _ocDiff(oc.notificacao, novo, OC_LBL_NOTIF);
    if (!diffs.length) { showToast('Nenhuma alteração para salvar.', 'error'); return; }
    oc.notificacao = { ...novo, ..._ocAssinatura() };
    _ocTrilha(oc, 'notificacao', requer ? 'Notificação externa registrada' : 'Avaliado: não requer notificação externa', diffs);
    if (requer && (!novo.protocolo || !novo.data)) showToast('Salvo. O protocolo e a data serão exigidos para encerrar.', 'success');
  }

  await _ocCommit(oc, 'Etapa salva.', { tab: _ocViewTab });
}

// ── ANEXOS ───────────────────────────────────────────────────
function ocUpload(ctx) {
  const etapa = { 'oc-form': 'registro', 'oc-reg': 'registro', 'oc-acao': 'acoes', 'oc-lib': 'liberacao', 'oc-notif': 'notificacao' }[ctx];
  const ocId = ctx === 'oc-form' ? _ocFormId : _ocViewId;
  const prefixo = () => ocState.ocorrencias[ocId]?.numero || 'OC';
  doUploadAnexo(ctx, async anexo => {
    const u = _ocSess();
    const reg = { ...anexo, etapa, porId: u.id, porNome: u.nome, em: _ocAgora() };
    if (ctx === 'oc-form') { _ocFormAnexos.push(reg); _ocRenderFormAnexos(); return; }
    const oc = _ocClone(ocState.ocorrencias[ocId]);
    if (!oc) return;
    oc.anexos.push(reg);
    _ocTrilha(oc, 'anexo', `Anexo adicionado (${OC_ETAPAS_ANEXO[etapa]}): ${anexo.titulo}`);
    await _ocCommit(oc, null, { manterDraft: true });
  }, prefixo);
}

async function ocRemoverAnexo(i) {
  const alvo = ocState.ocorrencias[_ocViewId]?.anexos[i];
  if (!alvo) return;
  if (!(await uiConfirmar({
    tipo: 'perigo', titulo: 'Remover anexo?', confirmar: 'Remover anexo',
    mensagem: `<b>${uiEsc(alvo.titulo)}</b> será removido desta ocorrência.`,
    detalhe: 'A remoção fica registrada na trilha de auditoria.',
  }))) return;
  // Relê depois da confirmação: a lista pode ter mudado enquanto a janela estava aberta
  const oc = _ocClone(ocState.ocorrencias[_ocViewId]);
  i = oc?.anexos.findIndex(x => x.url === alvo.url && x.titulo === alvo.titulo) ?? -1;
  const a = oc?.anexos[i];
  if (!a || !_ocAberta(oc)) return;
  oc.anexos.splice(i, 1);
  _ocTrilha(oc, 'anexo_removido', `Anexo removido (${OC_ETAPAS_ANEXO[a.etapa] || ''}): ${a.titulo} — ${a.url}`);
  _ocCommit(oc, 'Anexo removido.', { manterDraft: true });
}

// ── ENCERRAR / REABRIR / CANCELAR / EXCLUIR ─────────────────
function ocEncerrar(id) {
  const oc = ocState.ocorrencias[id];
  if (!oc || !_ocAberta(oc) || !_ocCan('encerrar')) return;
  const pend = _ocPendencias(oc);
  if (pend.length) {
    _ocPrompt({
      titulo: 'Pendências para encerrar',
      subtitulo: `${oc.numero} ainda não pode ser encerrada`,
      html: `<ul class="oc-pend-list">${pend.map(p => `<li onclick="otCloseModal('modal-oc-prompt');ocSwitchTab('${p.tab}')">${OC_ICO.clock}${_ocEsc(p.texto)}</li>`).join('')}</ul>`,
      confirmar: null,
    });
    return;
  }
  _ocPrompt({
    titulo: 'Encerrar ocorrência',
    subtitulo: `${oc.numero} — todas as etapas foram cumpridas`,
    html: `<div class="form-field"><label class="field-label">Parecer de encerramento <span class="required">*</span></label>
      <textarea id="oc-prompt-txt" class="field-textarea" style="min-height:90px;" placeholder="Síntese do tratamento e conclusão (responsável técnico / qualidade)..."></textarea></div>`,
    confirmar: 'Encerrar', cor: 'var(--green)',
    onConfirm: async () => {
      const parecer = _ocVal('oc-prompt-txt');
      if (!parecer) { showToast('Registre o parecer de encerramento.', 'error'); return false; }
      const novo = _ocClone(ocState.ocorrencias[id]);
      if (_ocPendencias(novo).length) { showToast('A ocorrência mudou e voltou a ter pendências.', 'error'); return false; }
      const antes = novo.status;
      novo.encerramento = { parecer, ..._ocAssinatura() };
      novo.status = 'encerrada';
      _ocTrilha(novo, 'encerramento', `Ocorrência encerrada. Parecer: ${parecer}`, [], { statusAntes: antes, statusDepois: 'encerrada' });
      await _ocCommit(novo, `${novo.numero} encerrada.`);
      return true;
    },
  });
}

function ocReabrir(id) {
  const oc = ocState.ocorrencias[id];
  if (!oc || oc.status !== 'encerrada' || !_ocCan('encerrar')) return;
  _ocPrompt({
    titulo: 'Reabrir ocorrência', subtitulo: oc.numero,
    html: `<div class="form-field"><label class="field-label">Justificativa <span class="required">*</span></label><textarea id="oc-prompt-txt" class="field-textarea"></textarea></div>`,
    confirmar: 'Reabrir', cor: 'var(--amber)',
    onConfirm: async () => {
      const just = _ocVal('oc-prompt-txt');
      if (!just) { showToast('Justifique a reabertura.', 'error'); return false; }
      const novo = _ocClone(ocState.ocorrencias[id]);
      novo.status = 'aberta';
      novo.encerramento = {};
      novo.status = _ocStatusCalculado(novo);
      _ocTrilha(novo, 'reabertura', `Ocorrência reaberta: ${just}`, [], { statusAntes: 'encerrada', statusDepois: novo.status });
      await _ocCommit(novo, `${novo.numero} reaberta.`);
      return true;
    },
  });
}

function ocCancelar(id) {
  const oc = ocState.ocorrencias[id];
  if (!oc || !_ocAberta(oc) || !_ocCan('cancelar')) return;
  _ocPrompt({
    titulo: 'Cancelar ocorrência', subtitulo: `${oc.numero} — o registro é mantido como cancelado`,
    html: `<div class="form-field"><label class="field-label">Motivo do cancelamento <span class="required">*</span></label>
      <textarea id="oc-prompt-txt" class="field-textarea" placeholder="Ex.: registro em duplicidade (informe o número da ocorrência válida)..."></textarea></div>`,
    confirmar: 'Cancelar ocorrência', cor: 'var(--red)',
    onConfirm: async () => {
      const motivo = _ocVal('oc-prompt-txt');
      if (!motivo) { showToast('Informe o motivo.', 'error'); return false; }
      const novo = _ocClone(ocState.ocorrencias[id]);
      const antes = novo.status;
      novo.cancelamento = { motivo, ..._ocAssinatura() };
      novo.status = 'cancelada';
      _ocTrilha(novo, 'cancelamento', `Ocorrência cancelada: ${motivo}`, [], { statusAntes: antes, statusDepois: 'cancelada' });
      await _ocCommit(novo, `${novo.numero} cancelada.`);
      _ocReavaliarAtivo(novo);
      return true;
    },
  });
}

function ocExcluir(id) {
  const oc = ocState.ocorrencias[id];
  if (!oc || !_ocIsAdmin()) return;
  _ocPrompt({
    titulo: 'Excluir ocorrência', subtitulo: 'Exclusão definitiva — exclusiva do administrador',
    html: `<div class="oc-aviso oc-aviso-red">${OC_ICO.alerta} A ocorrência sai do histórico do ativo. Uma cópia integral é guardada no log de exclusões, com o motivo. Prefira <b>Cancelar</b> sempre que possível.</div>
      <div class="form-field"><label class="field-label">Motivo da exclusão <span class="required">*</span></label><textarea id="oc-prompt-txt" class="field-textarea"></textarea></div>
      <div class="form-field"><label class="field-label">Digite <b>${_ocEsc(oc.numero)}</b> para confirmar</label><input type="text" id="oc-prompt-conf" class="field-input" autocomplete="off"></div>`,
    confirmar: 'Excluir definitivamente', cor: 'var(--red)',
    onConfirm: async () => {
      const motivo = _ocVal('oc-prompt-txt');
      if (!motivo) { showToast('Informe o motivo da exclusão.', 'error'); return false; }
      if (_ocVal('oc-prompt-conf') !== oc.numero) { showToast('Número de confirmação incorreto.', 'error'); return false; }
      const snapshot = ocState.ocorrencias[id];
      await window.dbSave(`${OC_KEY}/exclusoes/${id}`, { snapshot, motivo, ..._ocAssinatura() });
      const ok = await window.dbRemove(`${OC_KEY}/ocorrencias/${id}`);
      if (!ok) { showToast('Falha ao excluir. Tente novamente.', 'error'); return false; }
      delete ocState.ocorrencias[id];
      otCloseModal('modal-oc-view');
      _ocViewId = null;
      ocRender(); _ocUpdateNavBadge();
      if (typeof _renderAtivoOcorrencias === 'function') _renderAtivoOcorrencias();
      _ocReavaliarAtivo(snapshot);
      showToast(`${snapshot.numero} excluída. Cópia guardada no log de exclusões.`, 'success');
      return true;
    },
  });
}

// Modal genérico de confirmação com campos
function _ocPrompt({ titulo, subtitulo, html, confirmar, cor, onConfirm }) {
  document.getElementById('oc-prompt-title').textContent = titulo;
  const sub = document.getElementById('oc-prompt-subtitle');
  sub.textContent = subtitulo || '';
  sub.title = subtitulo || ''; // texto longo fica cortado em 2 linhas; o completo aparece no hover
  document.getElementById('oc-prompt-body').innerHTML = html;
  const btn = document.getElementById('oc-prompt-confirm');
  btn.style.display = confirmar ? '' : 'none';
  btn.textContent = confirmar || '';
  btn.style.background = cor || '';
  btn.disabled = false;
  _ocPromptCb = onConfirm || null;
  otOpenModal('modal-oc-prompt');
  setTimeout(() => document.querySelector('#oc-prompt-body textarea, #oc-prompt-body input')?.focus(), 80);
}

async function ocPromptConfirmar() {
  if (!_ocPromptCb) return;
  const btn = document.getElementById('oc-prompt-confirm');
  btn.disabled = true;
  try {
    const ok = await _ocPromptCb();
    if (ok !== false) otCloseModal('modal-oc-prompt');
  } finally {
    btn.disabled = false;
  }
}

// ── INTEGRAÇÃO COM OT ────────────────────────────────────────
// Origem pendente: preenchida quando o formulário de OT é aberto a partir de uma ocorrência
let _ocOrigemOT = null;

// A OT nasce com todos os ativos da ocorrência que ainda existem no cadastro
// (dá para remover no formulário os que não fizerem parte do serviço)
function ocGerarOT(ocId, acaoId) {
  const oc = ocState.ocorrencias[ocId];
  if (!oc) return;
  if (typeof authHasPermission === 'function' && !authHasPermission('ot.criarOT')) { showToast('Sem permissão para criar OTs.', 'error'); return; }
  const idxs = oc.ativos.map(a => _ativoIdxById(a.ativoId)).filter(i => i >= 0);
  if (!idxs.length) { showToast('Os ativos desta ocorrência não existem mais no cadastro.', 'error'); return; }
  const acao = acaoId ? oc.acoes.find(a => a.id === acaoId) : null;
  otCloseModal('modal-oc-view');
  otOpenFormForAtivo(idxs[0]);
  _otFromAtivoView = false;
  _otAtivoIdxs = idxs;
  _otRenderAtivoChip();
  _ocOrigemOT = { ocId, acaoId: acaoId || null };
  _otOcorrenciaIds = [ocId];
  _otRenderOcorrenciaChip();
  const set = (fid, v) => { const el = document.getElementById(fid); if (el) el.value = v; };
  set('ot-f-tipo', 'corretiva');
  if (typeof otFormTipoChange === 'function') otFormTipoChange();
  set('ot-f-titulo', `${oc.numero} — ${acao ? acao.descricao : oc.titulo}`);
  set('ot-f-descricao', `${acao ? `Ação ${acao.tipo}: ${acao.descricao}\n\n` : ''}Ocorrência ${oc.numero}: ${oc.descricao}`);
  set('ot-f-severidade', oc.severidade || 'media');
  if (acao?.prazo) set('ot-f-prazo', acao.prazo);
}

// Grava o vínculo na OT buscando-a pelo id: o listener do Firebase pode ter
// substituído os objetos de otState.ordens desde o último otSave()
function _ocMarcarOT(otId, ocId) {
  const alvo = otState.ordens.find(o => o.id === otId);
  if (!alvo) return;
  alvo.ocorrenciaIds = Array.from(new Set([...otOcorrenciaIds(alvo), ocId]));
  alvo.ocorrenciaId = null;
  otSave();
}

// OTs ligadas a uma ocorrência: pela lista da ocorrência ou pelo campo da própria OT
function _ocOTsVinculadas(oc) {
  return (typeof otState !== 'undefined' ? otState.ordens : []).filter(o => oc.otIds.includes(o.id) || otOcorrenciaIds(o).includes(oc.id));
}

// ── SELETOR DE OCORRÊNCIAS (formulário da OT) ────────────────
function ocOpenPickerParaOT() {
  const input = document.getElementById('oc-ot-picker-input');
  if (input) input.value = '';
  ocPickerOTFiltrar('');
  otOpenModal('modal-oc-ot-picker');
  setTimeout(() => input?.focus(), 80);
}

function ocPickerOTFiltrar(q) {
  const list = document.getElementById('oc-ot-picker-list');
  if (!list) return;
  q = (q || '').toLowerCase().trim();
  const ativosOT = typeof _otAtivoIdsAtuais === 'function' ? _otAtivoIdsAtuais() : [];
  const jaVinculadas = new Set(typeof _otOcorrenciaIds !== 'undefined' ? _otOcorrenciaIds : []);
  const itens = Object.values(ocState.ocorrencias)
    .filter(oc => _ocAberta(oc) && _ocVisivel(oc))
    .filter(oc => !q || `${oc.numero} ${oc.titulo} ${oc.subtipo} ${_ocNomesAtivos(oc, 99)}`.toLowerCase().includes(q))
    .map(oc => ({ oc, mesmo: oc.ativos.some(a => ativosOT.includes(a.ativoId)), ja: jaVinculadas.has(oc.id) }))
    .sort((a, b) => (a.ja - b.ja) || (b.mesmo - a.mesmo) || (b.oc.dataHoraOcorrencia || '').localeCompare(a.oc.dataHoraOcorrencia || ''));
  if (!itens.length) {
    list.innerHTML = `<div class="autocomplete-empty">Nenhuma ocorrência em aberto${q ? ' para a busca' : ''}</div>`;
    return;
  }
  list.innerHTML = itens.slice(0, 40).map(({ oc, mesmo, ja }) => `
    <div class="ativo-search-card oc-ot-pick${ja ? ' travado' : ''}" ${ja ? 'title="Já vinculada a esta OT"' : `onclick="ocSelecionarParaOT('${oc.id}')"`}>
      <div style="flex:1;min-width:0;">
        <div class="oc-ot-pick-top"><span class="oc-num">${_ocEsc(oc.numero)}</span>${_ocBadgeTipo(oc.tipo)}${_ocBadgeSev(oc.severidade)}${_ocBadgeStatus(oc.status)}
          ${ja ? '<span class="oc-badge oc-st-encerrada">Já vinculada</span>' : mesmo ? '<span class="oc-badge oc-st-eficacia">Mesmo ativo da OT</span>' : ''}</div>
        <div class="ativo-search-card-name">${_ocEsc(oc.titulo)}</div>
        <div class="ativo-search-card-meta">${_ocFmtDH(oc.dataHoraOcorrencia)} · ${_ocEsc(_ocNomesAtivos(oc))}</div>
      </div>
    </div>`).join('');
}

function ocSelecionarParaOT(id) {
  const oc = ocState.ocorrencias[id];
  if (!oc || _otOcorrenciaIds.includes(id)) return;
  _otOcorrenciaIds.push(id);
  _otRenderOcorrenciaChip();
  otCloseModal('modal-oc-ot-picker');
  // OT ainda sem ativos: assume os ativos da ocorrência
  if (!_otAtivoIdxs.length) {
    _otAtivoIdxs = oc.ativos.map(a => _ativoIdxById(a.ativoId)).filter(i => i >= 0);
    _otRenderAtivoChip();
    if (_otAtivoIdxs.length > 1) showToast(`${_otAtivoIdxs.length} ativos da ocorrência vinculados à OT. Remova os que não fizerem parte do serviço.`, 'success');
  }
}

// Chamado pelo OT.js depois de salvar uma OT. anteriores = ocorrências vinculadas antes da gravação.
async function ocAposSalvarOT(ot, anteriores) {
  if (!ot || !_ocFirebaseReady) { _ocOrigemOT = null; return; }
  const origem = _ocOrigemOT;
  _ocOrigemOT = null;
  const atuais = otOcorrenciaIds(ot);
  anteriores = Array.isArray(anteriores) ? anteriores : (anteriores ? [anteriores] : []);
  const removidas = anteriores.filter(id => !atuais.includes(id));
  const incluidas = atuais.filter(id => !anteriores.includes(id));

  // Vínculos alterados no formulário da OT: registra em cada ocorrência afetada
  if (removidas.length || incluidas.length) {
    for (const id of removidas) {
      if (!ocState.ocorrencias[id]) continue;
      const antiga = _ocClone(ocState.ocorrencias[id]);
      antiga.otIds = antiga.otIds.filter(x => x !== ot.id);
      antiga.acoes.forEach(a => { if (a.otId === ot.id) delete a.otId; });
      _ocTrilha(antiga, 'ot', `${ot.numero} desvinculada desta ocorrência`);
      await _ocCommit(antiga, null);
    }
    for (const id of incluidas) {
      if (!ocState.ocorrencias[id]) continue;
      const oc = _ocClone(ocState.ocorrencias[id]);
      if (!oc.otIds.includes(ot.id)) oc.otIds.push(ot.id);
      const gerada = origem?.ocId === id;
      const acao = gerada && origem.acaoId ? oc.acoes.find(a => a.id === origem.acaoId) : null;
      if (acao) acao.otId = ot.id;
      _ocTrilha(oc, 'ot', `${ot.numero} ${gerada ? 'gerada' : 'vinculada'}${acao ? ` para a ação "${acao.descricao}"` : ''}: ${ot.titulo || ''}`);
      await _ocCommit(oc, null);
    }
    return;
  }

  // OT corretiva com falha do ativo gera a ocorrência automaticamente (registro do sistema,
  // independente da permissão de quem abriu a OT: toda falha precisa ficar no histórico)
  if (!atuais.length && ot.tipo === 'corretiva' && ot.ativoFalhou && otAtivoIds(ot).length) {
    const oc = await _ocCriarDeOT(ot);
    if (!oc) return;
    ot.ocorrenciaIds = [oc.id];
    _ocMarcarOT(ot.id, oc.id);
    showToast(`Ocorrência ${oc.numero} registrada a partir da ${ot.numero}. Complete o tratamento na aba Ocorrências.`, 'success');
  }
}

async function _ocCriarDeOT(ot) {
  const ativosOT = otAtivoIds(ot).map(id => _ativoById(id)).filter(Boolean);
  if (!ativosOT.length) return null;
  const u = _ocSess();
  const dataBase = ot.dataParada || ot.dataAbertura || _ocHoje();
  const oc = _ocNormalizar({
    id: _ocUid(),
    numero: await _ocProximoNumero(),
    ativos: ativosOT.map(a => ({
      ativoId: a.id, snapshot: _ocSnapshotAtivo(a), liberacao: {},
      parado: !!ot.causouParada,
      dataHoraParada: ot.causouParada && ot.dataParada ? `${ot.dataParada}T00:00` : '',
    })),
    tipo: 'falha',
    subtipo: ot.tipoFalha || '',
    titulo: ot.titulo,
    descricao: ot.descricao || ot.titulo,
    dataHoraOcorrencia: `${dataBase}T00:00`,
    dataHoraDeteccao: _ocIsoParaLocal(ot.criadoEm) || _ocNowLocal(),
    metodoDetec: ot.metodoDetec || '',
    severidade: ot.severidade || 'media',
    detectadoPorId: ot.criadoPorId || u.id, detectadoPorNome: ot.criadoPorNome || u.nome,
    acaoImediata: { texto: `Aberta a ${ot.numero} para diagnóstico e correção.`, ..._ocAssinatura() },
    impacto: ot.tipoDano === 'Risco ao paciente' ? { riscoPaciente: true } : {},
    analiseCausa: ot.causaRaiz ? { causaRaiz: ot.causaRaiz } : {},
    otIds: [ot.id],
    origem: { tipo: 'ot', otId: ot.id, otNumero: ot.numero },
    status: 'aberta',
    criadoEm: _ocAgora(), criadoPorId: u.id, criadoPorNome: u.nome,
  });
  _ocTrilha(oc, 'criacao', `Ocorrência gerada automaticamente a partir da ${ot.numero} (ativo falhou)`);
  await _ocCommit(oc, null);
  _ocAplicarPausa(oc);
  return oc;
}

// ── SUB-ABA NO MODAL DO ATIVO ────────────────────────────────
function ocAtivoModo(modo) { _ocAtivoModo = modo; _renderAtivoOcorrencias(); }

function _renderAtivoOcorrencias() {
  const container = document.getElementById('ativo-ocorrencias-list');
  if (!container || typeof state === 'undefined') return;
  const idx = typeof ativoEdicaoIndex !== 'undefined' ? ativoEdicaoIndex : null;
  const ativo = idx !== null && idx !== undefined ? state.ativos[idx] : null;
  if (!ativo) { container.innerHTML = ''; return; }

  const topo = `<div class="oc-ativo-topo">
    <div class="oc-seg">
      <button class="${_ocAtivoModo === 'ocorrencias' ? 'active' : ''}" onclick="ocAtivoModo('ocorrencias')">${OC_ICO.alerta}Ocorrências</button>
      <button class="${_ocAtivoModo === 'timeline' ? 'active' : ''}" onclick="ocAtivoModo('timeline')">${OC_ICO.list}Linha do tempo</button>
    </div>
    ${_ocCan('registrar') ? `<button class="btn btn-primary btn-sm" style="gap:6px;font-size:12.5px;" onclick="ocOpenForm(null,{ativoId:'${ativo.id}'})">${OC_ICO.plus} Registrar ocorrência</button>` : ''}
  </div>`;

  if (_ocAtivoModo === 'timeline') { container.innerHTML = topo + _ocTimelineAtivo(ativo, idx); return; }

  const ocs = ocListarPorAtivo(ativo.id, { incluirCanceladas: true });
  if (!ocs.length) {
    container.innerHTML = topo + `<div class="avot-empty">${OC_ICO.alerta}<strong>Nenhuma ocorrência registrada</strong><span>Falhas, desvios, danos e alertas deste ativo aparecem aqui</span></div>`;
    return;
  }
  container.innerHTML = topo + `<div class="avot-list">` + ocs.map(oc => `
    <div class="avot-card${_ocAberta(oc) ? '' : ' oc-row-final'}" onclick="ocOpenView('${oc.id}')">
      <div class="avot-card-top">
        <span class="avot-num">${_ocEsc(oc.numero)}</span>
        ${_ocBadgeTipo(oc.tipo)} ${_ocBadgeSev(oc.severidade)} ${_ocBadgeStatus(oc.status)}
      </div>
      <div class="avot-titulo">${_ocEsc(oc.titulo)}</div>
      <div class="avot-card-bot">
        <span class="avot-prazo">${OC_ICO.clock}${_ocFmtDH(oc.dataHoraOcorrencia)}</span>
        ${oc.status !== 'cancelada' && !ocPausaResolvida(oc.id, ativo.id) ? `<span class="avot-falha-tag">Aguardando liberação</span>` : ''}
        ${oc.ativos.length > 1 ? `<span class="avot-resp">Evento com ${oc.ativos.length} ativos</span>` : ''}
        ${_ocAberta(oc) ? `<span class="avot-resp">${_ocEsc(_ocPendencias(oc)[0]?.texto || 'Pronta para encerramento')}</span>` : ''}
      </div>
    </div>`).join('') + `</div>`;
}
window._renderAtivoOcorrencias = _renderAtivoOcorrencias;

// Histórico unificado do ativo: ocorrências, OTs, manutenções realizadas e alterações de cadastro
function _ocTimelineAtivo(ativo, idx) {
  const ev = [];
  ocListarPorAtivo(ativo.id, { incluirCanceladas: true }).forEach(oc => ev.push({
    data: oc.dataHoraOcorrencia, cls: 'oc', rotulo: 'Ocorrência',
    titulo: `${oc.numero} — ${oc.titulo}`, sub: `${OC_TIPOS[oc.tipo]?.label || ''} · ${OC_STATUS[oc.status]?.label || ''}`,
    onclick: `ocOpenView('${oc.id}')`,
  }));
  ocListarPorAtivo(ativo.id).forEach(oc => oc.ativos.filter(a => a.ativoId === ativo.id && a.parado && a.liberacao.liberado).forEach(a => {
    const l = a.liberacao, d = _ocDesfecho(l);
    ev.push({
      data: _ocDataDesfecho(l).length > 16 ? _ocIsoParaLocal(l.em) : _ocDataDesfecho(l), cls: 'oc', rotulo: OC_DESFECHOS[d].curto,
      titulo: `${oc.numero} — ${d === 'retorno' ? l.criterio : l.motivo}`, sub: `Parado desde ${_ocFmtDH(a.dataHoraParada)} · ${l.porNome || ''}`,
      onclick: `ocOpenView('${oc.id}')`,
    });
  }));
  const OT_ST = { pendente: 'Pendente', em_processo: 'Em processo', em_revisao: 'Em revisão', concluida: 'Concluída', cancelada: 'Cancelada' };
  (typeof otState !== 'undefined' ? otState.ordens : [])
    .filter(o => otAtivoIds(o).includes(ativo.id) || otTemAtivo(o, idx))
    .forEach(o => ev.push({
      data: _ocIsoParaLocal(o.criadoEm) || o.dataAbertura, cls: 'ot', rotulo: 'OT',
      titulo: `${o.numero} — ${o.titulo}`, sub: `${o.tipo || ''} · ${OT_ST[o.status] || o.status}${o.dataConclusao ? ` · concluída em ${_ocFmtData(o.dataConclusao)}` : ''}`,
      onclick: `otOpenView('${o.id}')`,
    }));
  const tarefas = state.tarefas.filter(t => t.equipamentoId ? t.equipamentoId === ativo.id : t.equipamentoIdx === idx);
  const tarefaPorId = Object.fromEntries(tarefas.map(t => [t.id, t]));
  todasPublicacoes().filter(p => tarefaPorId[p.tarefaId]).forEach(p => {
    const t = tarefaPorId[p.tarefaId];
    const r = state.rotinas.find(x => x.id === t.rotinaId);
    ev.push({
      data: p.dataRealizada || _ocIsoParaLocal(p.dataPublicacao), cls: 'man', rotulo: 'Manutenção',
      titulo: t.titulo, sub: `${r ? r.nome + ' · ' : ''}${p.empresaResponsavel || p.tecnicoResponsavel || p.publicadoPorNome || ''}`,
    });
  });
  (ativo._historico || []).forEach(h => ev.push({
    data: _ocIsoParaLocal(h.ts), cls: 'cad', rotulo: 'Cadastro',
    titulo: h.isNew ? 'Ativo cadastrado' : 'Cadastro alterado',
    sub: `${h.userName || ''}${h.diffs?.length ? ' · ' + h.diffs.map(d => d.campo).join(', ') : ''}`,
  }));
  ev.sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  const rodapeArq = typeof arqRodapeHtml === 'function' ? arqRodapeHtml(tarefas.map(t => t.id)) : '';
  if (!ev.length) return `<div class="avot-empty"><strong>Sem eventos registrados</strong></div>` + rodapeArq;
  return `<div class="oc-timeline">${ev.map(e => `
    <div class="oc-tl-item oc-tl-${e.cls}${e.onclick ? ' clickable' : ''}" ${e.onclick ? `onclick="${e.onclick}"` : ''}>
      <div class="oc-tl-dot"></div>
      <div class="oc-tl-body">
        <div class="oc-tl-head"><span class="oc-tl-rotulo">${e.rotulo}</span><span>${_ocFmtDH(e.data)}</span></div>
        <div class="oc-tl-titulo">${_ocEsc(e.titulo)}</div>
        ${e.sub ? `<div class="oc-tl-sub">${_ocEsc(e.sub)}</div>` : ''}
      </div>
    </div>`).join('')}</div>` + rodapeArq;
}

// ── FICHA PDF ────────────────────────────────────────────────
function ocImprimir(id) {
  const oc = ocState.ocorrencias[id];
  if (!oc) return;
  const e = _ocEsc;
  const i = oc.impacto, c = oc.analiseCausa, ef = oc.eficacia, n = oc.notificacao;
  const parados = oc.ativos.filter(a => a.parado);
  const temLib = parados.length > 0;
  const linha = (lbl, val) => `<tr><th>${lbl}</th><td>${val || '—'}</td></tr>`;
  const ass = o => o?.porNome ? `<div class="ass">${e(o.porNome)} · ${_ocFmtDH(o.em)}</div>` : '';
  const ots = _ocOTsVinculadas(oc);
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${e(oc.numero)} — Ficha de Ocorrência</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; color: #111; margin: 0; }
  header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #0e1628; padding-bottom: 6px; margin-bottom: 10px; }
  header h1 { font-size: 15pt; margin: 0; } header .sub { font-size: 9pt; color: #555; }
  header .num { font-size: 13pt; font-weight: bold; text-align: right; }
  h2 { font-size: 11pt; background: #e9eef3; padding: 4px 8px; margin: 12px 0 4px; border-left: 4px solid #00a8cc; page-break-after: avoid; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  th, td { border: 1px solid #c8d0da; padding: 4px 6px; vertical-align: top; text-align: left; }
  th { width: 30%; background: #f6f8fa; font-weight: 600; }
  .txt { white-space: pre-wrap; }
  .ass { font-size: 8.5pt; color: #555; margin: 2px 0 6px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-top: 28px; page-break-inside: avoid; }
  .sig { border-top: 1px solid #333; padding-top: 4px; font-size: 9pt; text-align: center; margin-top: 36px; }
  .trilha td, .trilha th { font-size: 8.5pt; }
  .st { display: inline-block; padding: 1px 8px; border: 1px solid #333; border-radius: 10px; font-size: 9pt; }
  footer { margin-top: 14px; font-size: 8pt; color: #777; border-top: 1px solid #ccc; padding-top: 4px; }
</style></head><body>
<header>
  <div><h1>Registro de Ocorrência de Ativo</h1><div class="sub">LAMIC — Gestão de Manutenção · Evidência de tratamento de não conformidade (RDC 978/2025 · PALC · ISO 15189)</div></div>
  <div><div class="num">${e(oc.numero)}</div><div class="sub">Status: <span class="st">${OC_STATUS[oc.status]?.label}</span></div></div>
</header>
<h2>1. ${oc.ativos.length > 1 ? `Ativos envolvidos (${oc.ativos.length})` : 'Ativo envolvido'}</h2>
<table><tr><th style="width:auto">Ativo</th><th style="width:12%">Código</th><th style="width:18%">Unidade · Setor</th><th style="width:22%">Marca / Modelo / Nº de série</th><th style="width:20%">Situação</th></tr>
${oc.ativos.map(a => { const s = a.snapshot; return `<tr><td>${e(s.nome)}</td><td>${e(s.codigo)}</td><td>${e(_ocRotuloSetor(s))}</td>
<td>${e([s.marca, s.modelo, s.serie].filter(x => x && x !== '-').join(' / '))}</td>
<td>${a.parado ? `Parado desde ${_ocFmtDH(a.dataHoraParada)}${a.liberacao.liberado ? `<br>${OC_DESFECHOS[_ocDesfecho(a.liberacao)].curto} em ${_ocFmtDH(_ocDataDesfecho(a.liberacao))}` : '<br><b>Aguardando desfecho</b>'}` : 'Não parado'}</td></tr>`; }).join('')}</table>
<h2>2. Descrição da ocorrência</h2>
<table>${linha('Título', e(oc.titulo))}${linha('Tipo / Subtipo', e(`${OC_TIPOS[oc.tipo]?.label || ''}${oc.subtipo ? ' / ' + oc.subtipo : ''}`))}
${linha('Ocorrida em', _ocFmtDH(oc.dataHoraOcorrencia))}${linha('Detectada em / método', `${_ocFmtDH(oc.dataHoraDeteccao)}${oc.metodoDetec ? ' · ' + e(oc.metodoDetec) : ''}`)}
${linha('Registrada por', `${e(oc.criadoPorNome)} em ${_ocFmtDH(oc.criadoEm)}`)}${linha('Severidade', e(OC_SEV[oc.severidade]?.label))}
${Object.keys(OC_LBL_ESPEC).filter(k => oc.dadosEspecificos[k]).map(k => linha(OC_LBL_ESPEC[k], e(_ocFmtVal(oc.dadosEspecificos[k])))).join('')}
${linha('Descrição', `<div class="txt">${e(oc.descricao)}</div>`)}</table>
<h2>3. Ação imediata (contenção)</h2>
<table>${linha('Ação', `<div class="txt">${e(oc.acaoImediata.texto)}</div>${ass(oc.acaoImediata)}`)}</table>
<h2>4. Avaliação de impacto</h2>
<table>${linha('Afeta resultados de pacientes', OC_AFETA[i.afetaResultados] || '—')}
${i.afetaResultados === 'sim' ? linha('Período afetado', `${_ocFmtDH(i.periodoDe)} a ${_ocFmtDH(i.periodoAte)}`) + linha('Exames / amostras', `${e(i.examesAfetados)}${i.qtdAmostras ? ` · ${e(i.qtdAmostras)} amostra(s)` : ''}`) + linha('Laudos liberados afetados', i.laudosLiberadosAfetados ? 'Sim' : 'Não') + linha('Ação sobre resultados', e(OC_ACAO_RESULTADOS[i.acaoResultados])) : ''}
${linha('Risco ao paciente / operador', `${i.riscoPaciente ? 'Sim' : 'Não'} / ${i.riscoOperador ? 'Sim' : 'Não'}`)}
${linha('Fundamentação', `<div class="txt">${e(i.justificativa)}</div>${ass(i)}`)}</table>
<h2>5. Análise de causa</h2>
<table>${linha('Método', e(OC_METODO_CAUSA[c.metodo]))}
${c.porques.some(Boolean) ? linha('5 Porquês', c.porques.filter(Boolean).map((p, k) => `${k + 1}. ${e(p)}`).join('<br>')) : ''}
${Object.values(c.ishikawa).some(Boolean) ? linha('Ishikawa', Object.keys(OC_ISHIKAWA).filter(k => c.ishikawa[k]).map(k => `<b>${OC_ISHIKAWA[k]}:</b> ${e(c.ishikawa[k])}`).join('<br>')) : ''}
${linha('Causa raiz', e(c.causaRaiz))}${linha('Conclusão', `<div class="txt">${e(c.descricao)}</div>${ass(c)}`)}</table>
<h2>6. Ações corretivas / preventivas</h2>
${oc.acoes.length ? `<table><tr><th style="width:auto">Ação</th><th style="width:16%">Responsável</th><th style="width:11%">Prazo</th><th style="width:30%">Execução / evidência</th></tr>
${oc.acoes.map(a => `<tr><td>[${a.tipo === 'preventiva' ? 'P' : 'C'}] ${e(a.descricao)}${a.otId ? `<br><small>OT: ${e(ots.find(o => o.id === a.otId)?.numero || '')}</small>` : ''}</td><td>${e(a.responsavelNome)}</td><td>${_ocFmtData(a.prazo)}</td>
<td>${a.status === 'concluida' ? `${e(a.evidencia)}<div class="ass">${e(a.concluidaPorNome)} · ${_ocFmtDH(a.concluidaEm)}</div>` : 'Pendente'}</td></tr>`).join('')}</table>`
  : `<table>${linha('Ações', oc.acoesNA.justificativa ? `Nenhuma ação necessária: ${e(oc.acoesNA.justificativa)}${ass(oc.acoesNA)}` : '—')}</table>`}
${ots.length ? `<table>${linha('OTs vinculadas', ots.map(o => `${e(o.numero)} — ${e(o.titulo)} (${e(o.status)})`).join('<br>'))}</table>` : ''}
<h2>7. Verificação de eficácia</h2>
<table>${oc.eficaciaHistorico.map(h => linha(`Verificação anterior (${_ocFmtData(h.verificadaEm)})`, `${h.eficaz ? 'Eficaz' : 'Não eficaz'} — ${e(h.descricao)}${ass(h)}`)).join('')}
${linha('Verificada em', _ocFmtData(ef.verificadaEm))}${linha('Eficaz', ef.eficaz === true ? 'Sim' : ef.eficaz === false ? 'Não' : '—')}
${linha('Evidência', `<div class="txt">${e(ef.descricao)}</div>${ass(ef)}`)}</table>
${temLib ? `<h2>8. Desfecho dos ativos parados</h2>
${parados.map(a => { const l = a.liberacao, d = _ocDesfecho(l), ret = d === 'retorno'; return `<table>${linha('Ativo', `<b>${e(a.snapshot.nome)}</b> — parado desde ${_ocFmtDH(a.dataHoraParada)}`)}
${linha('Desfecho', l.liberado ? OC_DESFECHOS[d].label : 'Pendente — ativo fora de uso')}
${l.liberado ? linha(OC_DESFECHOS[d].dataLbl, _ocFmtDH(_ocDataDesfecho(l))) + linha(ret ? 'Critério' : 'Motivo', e(ret ? l.criterio : l.motivo))
  + linha(ret ? 'Verificação' : 'Descrição', `<div class="txt">${e(l.descricao)}</div>${ass(l)}`)
  + linha('Evidências', oc.anexos.filter(x => x.etapa === 'liberacao' && (l.liberacaoId ? x.liberacaoId === l.liberacaoId : !x.liberacaoId)).map(x => e(x.titulo)).join(', ') || '—') : ''}</table>`; }).join('')}` : ''}
<h2>${temLib ? 9 : 8}. Notificação externa</h2>
<table>${linha('Requer notificação', OC_FMT.requer(n.requer))}${n.requer ? linha('Destinos', e(OC_FMT.destinos(n.destinos))) + linha('Protocolo / data', `${e(n.protocolo)} · ${_ocFmtData(n.data)}`) : ''}
${linha(n.requer ? 'Descrição' : 'Justificativa', `<div class="txt">${e(n.descricao)}</div>${ass(n)}`)}</table>
<h2>${temLib ? 10 : 9}. Encerramento</h2>
<table>${oc.status === 'cancelada' ? linha('Cancelada', `${e(oc.cancelamento.motivo)}${ass(oc.cancelamento)}`) : linha('Parecer', oc.encerramento.parecer ? `<div class="txt">${e(oc.encerramento.parecer)}</div>${ass(oc.encerramento)}` : 'Ocorrência em aberto')}</table>
${oc.anexos.length ? `<h2>Anexos</h2><table>${oc.anexos.map(a => linha(e(OC_ETAPAS_ANEXO[a.etapa] || ''), `${e(a.titulo)} — <small>${e(a.url)}</small>${ass(a)}`)).join('')}</table>` : ''}
<div class="grid">
  <div class="sig">Registrado por<br>${e(oc.criadoPorNome)}</div>
  <div class="sig">Responsável pelo tratamento</div>
  <div class="sig">Responsável técnico / Qualidade${oc.encerramento.porNome ? `<br>${e(oc.encerramento.porNome)}` : ''}</div>
</div>
<h2 style="page-break-before:always;">Trilha de auditoria</h2>
<table class="trilha"><tr><th style="width:17%">Data/hora</th><th style="width:18%">Usuário</th><th style="width:auto">Registro</th></tr>
${oc.trilha.map(t => `<tr><td>${_ocFmtDH(t.ts)}</td><td>${e(t.userName)}</td><td>${e(t.texto)}${t.diffs?.length ? '<br>' + t.diffs.map(d => `<small>${e(d.campo)}: ${e(d.antes)} → ${e(d.depois)}</small>`).join('<br>') : ''}</td></tr>`).join('')}</table>
<footer>Emitido em ${_ocFmtDH(_ocAgora())} por ${e(_ocSess().nome)} · Documento gerado pelo sistema de gestão de manutenção LAMIC.</footer>
<script>window.onload = () => setTimeout(() => window.print(), 300);<\/script>
</body></html>`;
  imprimirEmSegundoPlano(html);
}

// ── CARD DO INÍCIO (KPIs) ────────────────────────────────────
// Subaba da lista de ocorrências no Início: 'abertas' | 'finalizadas' (só desta sessão)
let _ocHomeSub = 'abertas';
function ocHomeSub(sub) {
  _ocHomeSub = sub;
  if (typeof renderHome === 'function') renderHome();
}

// Início (aba Tarefas e Ativos): lista das ocorrências em aberto e card de indicadores, separados
// para o Início posicionar cada um. Sem permissão ou dados ainda não carregados → null.
function ocHomePartes() {
  if (!_ocFirebaseReady || !(typeof authCanViewTab !== 'function' || authCanViewTab('ocorrencias'))) return null;
  const vis = Object.values(ocState.ocorrencias).filter(_ocVisivel).filter(o => o.status !== 'cancelada');
  const k = _ocKPIs();
  const hoje = new Date();
  const lim12 = new Date(hoje.getFullYear() - 1, hoje.getMonth(), hoje.getDate()).toISOString().slice(0, 10);
  const lim90 = new Date(hoje.getTime() - 90 * 864e5).toISOString();
  const ult12 = vis.filter(o => _ocDataRef(o) >= lim12);

  const encerradas90 = vis.filter(o => o.status === 'encerrada' && o.encerramento.em >= lim90 && o.criadoEm);
  const tempoMedio = encerradas90.length
    ? Math.round(encerradas90.reduce((s, o) => s + (new Date(o.encerramento.em) - new Date(o.criadoEm)) / 864e5, 0) / encerradas90.length)
    : null;

  const porTipo = Object.keys(OC_TIPOS).map(t => ({ t, n: ult12.filter(o => o.tipo === t).length })).filter(x => x.n > 0).sort((a, b) => b.n - a.n);
  const maxTipo = Math.max(1, ...porTipo.map(x => x.n));
  const porAtivo = {};
  ult12.forEach(o => o.ativos.forEach(a => {
    const key = a.ativoId || a.snapshot.nome;
    (porAtivo[key] = porAtivo[key] || { nome: a.snapshot.nome, n: 0 }).n++;
  }));
  const top = Object.values(porAtivo).sort((a, b) => b.n - a.n).slice(0, 5);

  // Em aberto, para agir: ações vencidas primeiro, depois severidade e prazo da próxima ação
  const hojeS = _ocHoje();
  const sevOrd = { critica: 0, alta: 1, media: 2, baixa: 3 };
  const sevDot = { critica: '#e63946', alta: '#f4a261', media: '#00a8cc', baixa: '#2a9d8f' };
  const abertas = vis.filter(_ocAberta).map(oc => {
    const prazo = _ocProximoPrazo(oc);
    return { oc, prazo, vencida: !!prazo && prazo < hojeS, parado: _ocParadosPendentes(oc).length > 0 };
  }).sort((a, b) => (b.vencida - a.vencida) || ((sevOrd[a.oc.severidade] ?? 9) - (sevOrd[b.oc.severidade] ?? 9)) || (a.prazo || '9999').localeCompare(b.prazo || '9999'));
  const LIM = 8;
  const lista = abertas.slice(0, LIM).map(({ oc, prazo, vencida, parado }) => `
    <div class="home-notif-item" onclick="ocOpenView('${oc.id}')">
      <div class="home-notif-dot" style="background:${sevDot[oc.severidade] || '#718096'}" title="Severidade ${OC_SEV[oc.severidade]?.label || ''}"></div>
      <div class="home-notif-content">
        <div class="home-notif-title">${_ocEsc(oc.numero)} — ${_ocEsc(oc.titulo)}</div>
        <div class="home-notif-meta">${_ocEsc(_ocNomesAtivos(oc, 1))}${oc.ativos.length > 1 ? ` +${oc.ativos.length - 1}` : ''} · ${_ocEsc(_ocPendencias(oc)[0]?.texto || 'Pronta para encerramento')}</div>
      </div>
      <div class="home-notif-badges">
        ${prazo ? `<span class="home-notif-badge ${vencida ? 'notif-badge-red' : 'notif-badge-gray'}">${vencida ? 'Ação vencida' : 'Ação até ' + _ocFmtData(prazo).slice(0, 5)}</span>` : ''}
        ${parado ? '<span class="home-notif-badge notif-badge-amber">Ativo parado</span>' : ''}
      </div>
    </div>`).join('');

  const tile = (v, l, cls, acao = "switchTab('ocorrencias')") => `<div class="oc-hk ${cls}" onclick="${acao}"><div class="oc-hk-v">${v}</div><div class="oc-hk-l">${l}</div></div>`;
  const indicadores = `<div class="home-chart-card oc-home-card">
    <div class="home-chart-header">
      <span class="home-chart-title">Ocorrências · indicadores</span>
      <button type="button" class="hup-toggle-btn" onclick="switchTab('ocorrencias')">Abrir ocorrências</button>
    </div>
    <div class="oc-hk-row oc-hk-6">
      ${tile(k.abertas, 'Em aberto', k.abertas ? 'cyan' : '', "switchTab('ocorrencias');ocFiltroAtalho('abertas')")}
      ${tile(k.criticas, 'Críticas em aberto', k.criticas ? 'red' : '', "switchTab('ocorrencias');ocFiltroAtalho('criticas')")}
      ${tile(k.vencidas, 'Ações vencidas', k.vencidas ? 'amber' : '', "switchTab('ocorrencias');ocFiltroAtalho('abertas')")}
      ${tile(k.parados, 'Ativos aguardando liberação', k.parados ? 'red' : '', "switchTab('ocorrencias');ocFiltroAtalho('abertas')")}
      ${tile(k.eficacia, 'Aguardando eficácia', '', "switchTab('ocorrencias');ocFiltroAtalho('aguardando_eficacia')")}
      ${tile(tempoMedio === null ? '—' : tempoMedio + 'd', 'Tempo médio até encerrar (90d)', '')}
    </div>
    <div class="oc-hk-cols">
      <div><div class="oc-hk-sub">Por tipo · 12 meses</div>
        ${porTipo.length ? porTipo.map(x => `<div class="oc-hbar"><span class="oc-hbar-l">${OC_TIPOS[x.t].label}</span><span class="oc-hbar-t"><span style="width:${Math.round(x.n / maxTipo * 100)}%"></span></span><span class="oc-hbar-v">${x.n}</span></div>`).join('') : '<div class="oc-vazio">Sem ocorrências no período.</div>'}
      </div>
      <div><div class="oc-hk-sub">Ativos com mais ocorrências · 12 meses</div>
        ${top.length ? top.map(x => `<div class="oc-hrank"><span>${_ocEsc(x.nome)}</span><b class="${x.n > 1 ? 'reinc' : ''}">${x.n}${x.n > 1 ? ' · reincidente' : ''}</b></div>`).join('') : '<div class="oc-vazio">Sem ocorrências no período.</div>'}
      </div>
    </div>
  </div>`;
  // Finalizadas: encerradas mais recentes, com data e tempo até encerrar
  const finalizadas = vis.filter(o => o.status === 'encerrada')
    .sort((a, b) => (b.encerramento?.em || '').localeCompare(a.encerramento?.em || ''));
  const listaFin = finalizadas.slice(0, LIM).map(oc => {
    const em = oc.encerramento?.em || '';
    const dias = em && oc.criadoEm ? Math.max(0, Math.round((new Date(em) - new Date(oc.criadoEm)) / 864e5)) : null;
    return `<div class="home-notif-item" onclick="ocOpenView('${oc.id}')">
      <div class="home-notif-dot" style="background:#2a9d8f"></div>
      <div class="home-notif-content">
        <div class="home-notif-title">${_ocEsc(oc.numero)} — ${_ocEsc(oc.titulo)}</div>
        <div class="home-notif-meta">${_ocEsc(_ocNomesAtivos(oc, 1))}${oc.ativos.length > 1 ? ` +${oc.ativos.length - 1}` : ''}${oc.encerramento?.porNome ? ' · ' + _ocEsc(oc.encerramento.porNome) : ''}</div>
      </div>
      <div class="home-notif-badges">
        ${em ? `<span class="home-notif-badge notif-badge-gray">Encerrada ${_ocFmtData(em.slice(0, 10)).slice(0, 5)}</span>` : ''}
        ${dias !== null ? `<span class="home-notif-meta">${dias}d até encerrar</span>` : ''}
      </div>
    </div>`;
  }).join('');

  const fin = _ocHomeSub === 'finalizadas';
  const total = fin ? finalizadas.length : abertas.length;
  const subaba = (id, rot, n) => `<button type="button" class="home-subaba${_ocHomeSub === id ? ' active' : ''}" onclick="ocHomeSub('${id}')">${rot}<span>${n}</span></button>`;
  const listaCard = `<div class="home-chart-card home-lista-card">
    <div class="home-chart-header">
      <span class="home-chart-title">Ocorrências</span>
      <div class="home-subabas">${subaba('abertas', 'Em aberto', abertas.length)}${subaba('finalizadas', 'Finalizadas', finalizadas.length)}</div>
    </div>
    <div class="home-notif-body">${fin
      ? (listaFin || '<div class="home-notif-empty"><span>Nenhuma ocorrência finalizada</span></div>')
      : (lista || '<div class="home-notif-empty"><span>Nenhuma ocorrência em aberto</span></div>')}</div>
    ${total > LIM ? `<button type="button" class="home-ver-todas" onclick="switchTab('ocorrencias');ocFiltroAtalho('${fin ? 'encerrada' : 'abertas'}')">Ver todas (${total})</button>` : ''}
  </div>`;
  return { indicadores, lista: listaCard };
}

// ── CATÁLOGOS (Configurações) ────────────────────────────────
function ocRenderConfigCatalogos() {
  const el = document.getElementById('cpanel-ocorrencias-body');
  if (!el) return;
  const pode = _ocIsAdmin() || _ocCan('encerrar');
  const bloco = (titulo, chave, lista, tipo) => `<div class="oc-cat-bloco">
    <div class="oc-cat-title">${titulo}</div>
    <div class="oc-cat-chips">${lista.map((v, i) => `<span class="oc-cat-chip">${_ocEsc(v)}${pode ? `<button onclick="ocCatRemover('${chave}',${i}${tipo ? `,'${tipo}'` : ''})" title="Remover">×</button>` : ''}</span>`).join('') || '<span class="oc-vazio">Vazio</span>'}</div>
    ${pode ? `<div class="oc-cat-add"><input type="text" class="field-input" id="oc-cat-in-${chave}${tipo ? '-' + tipo : ''}" placeholder="Novo item..." onkeydown="if(event.key==='Enter')ocCatAdicionar('${chave}'${tipo ? `,'${tipo}'` : ''})">
      <button class="btn btn-outline btn-sm" onclick="ocCatAdicionar('${chave}'${tipo ? `,'${tipo}'` : ''})">Adicionar</button></div>` : ''}
  </div>`;
  el.innerHTML = `
    ${pode ? '' : `<div class="oc-aviso">${OC_ICO.lock} Somente usuários com permissão de encerrar ocorrências podem alterar os catálogos.</div>`}
    <div class="oc-cat-grupo">Subtipos por tipo de ocorrência</div>
    ${Object.entries(OC_TIPOS).map(([t, cfg]) => bloco(cfg.label, 'subtipos', ocState.catalogos.subtipos[t] || [], t)).join('')}
    <div class="oc-cat-grupo">Tratamento</div>
    ${bloco('Causas raiz', 'causasRaiz', ocState.catalogos.causasRaiz)}
    ${bloco('Métodos de detecção', 'metodosDetec', ocState.catalogos.metodosDetec)}
    ${bloco('Critérios de liberação do ativo', 'criteriosLiberacao', ocState.catalogos.criteriosLiberacao)}
    ${bloco('Motivos de retirada de uso (fora de uso / baixa)', 'motivosRetirada', ocState.catalogos.motivosRetirada || [])}`;
}

function _ocCatLista(chave, tipo) {
  if (chave === 'subtipos') return (ocState.catalogos.subtipos[tipo] = ocState.catalogos.subtipos[tipo] || []);
  return ocState.catalogos[chave];
}
function ocCatAdicionar(chave, tipo) {
  const inp = document.getElementById(`oc-cat-in-${chave}${tipo ? '-' + tipo : ''}`);
  const v = (inp?.value || '').trim();
  if (!v) return;
  const lista = _ocCatLista(chave, tipo);
  if (lista.some(x => x.toLowerCase() === v.toLowerCase())) { showToast('Item já existe.', 'error'); return; }
  lista.push(v);
  _ocSalvarCatalogos();
  ocRenderConfigCatalogos();
}
async function ocCatRemover(chave, i, tipo) {
  const valor = _ocCatLista(chave, tipo)[i];
  if (valor === undefined) return;
  if (!(await uiConfirmar({
    tipo: 'perigo', titulo: 'Remover do catálogo?', confirmar: 'Remover',
    mensagem: `<b>${uiEsc(valor)}</b> deixa de aparecer nas opções.`,
    detalhe: 'Registros existentes não são alterados.',
  }))) return;
  const lista = _ocCatLista(chave, tipo);
  i = lista.indexOf(valor);
  if (i < 0) return;
  lista.splice(i, 1);
  _ocSalvarCatalogos();
  ocRenderConfigCatalogos();
}

// ── UPLOAD ───────────────────────────────────────────────────
function _ocExtendUpload() {
  if (typeof _uploadQueues === 'undefined') return;
  ['oc-form', 'oc-reg', 'oc-acao', 'oc-lib', 'oc-notif'].forEach(ctx => {
    _uploadQueues[ctx] = { file: null, dataUrl: null };
    _SAVE_BTN_IDS[ctx] = ctx === 'oc-form' ? 'btn-oc-form-save' : null;
    _uploadsInProgress[ctx] = false;
  });
}

// ── INJEÇÃO DE MODAIS ────────────────────────────────────────
function _ocInjectModals() {
  const div = document.createElement('div');
  div.innerHTML = _ocModalsHTML();
  document.body.appendChild(div);
  setTimeout(() => { if (typeof initUploadZone === 'function') initUploadZone('oc-form'); }, 100);
}

function _ocModalsHTML() {
  const sec = (titulo, ico) => `<div class="form-section-title">${ico}${titulo}</div>`;
  return `
<!-- ══ FORM: REGISTRAR / EDITAR OCORRÊNCIA ══ -->
<div class="ot-form-drawer oc-form-drawer" id="modal-oc-form">
  <div class="drawer-header">
    <div class="drawer-header-icon" style="color:var(--red);">${OC_ICO.alerta}</div>
    <div>
      <div class="drawer-title" id="oc-form-title">Registrar Ocorrência</div>
      <div class="drawer-subtitle">Registre o evento assim que ele for identificado</div>
    </div>
  </div>
  <div class="drawer-body" style="padding:22px 28px;overflow-y:auto;flex:1;">
    <div class="form-section">
      ${sec('Ativos envolvidos<span id="oc-f-ativos-count"></span>', OC_ICO.ativo)}
      <div class="oc-nota" style="margin:-4px 0 10px;">Inclua todos os ativos afetados pelo evento. Marque como parado os que forem retirados de uso: cada um só volta a "Em uso" com a sua liberação formal.</div>
      <div class="form-field"><div id="oc-f-ativo-wrap"></div></div>
    </div>
    <div class="form-section">
      ${sec('O que aconteceu', OC_ICO.alerta)}
      <div class="form-row">
        <div class="form-field"><label class="field-label">Tipo <span class="required">*</span></label>
          <select id="oc-f-tipo" class="field-select" onchange="ocFormTipoChange()">${_ocMapOptions(OC_TIPOS, 'falha', null)}</select></div>
        <div class="form-field"><label class="field-label">Subtipo</label><select id="oc-f-subtipo" class="field-select"></select></div>
      </div>
      <div class="form-field"><label class="field-label">Título <span class="required">*</span></label>
        <input type="text" id="oc-f-titulo" class="field-input" maxlength="120" placeholder="Ex.: Geladeira de reagentes a 12 °C"></div>
      <div class="form-field"><label class="field-label">Descrição <span class="required">*</span></label>
        <textarea id="oc-f-descricao" class="field-textarea" style="min-height:80px;" placeholder="O que foi observado, onde, em que condições, mensagens de erro..."></textarea></div>
      <div class="form-row">
        <div class="form-field"><label class="field-label">Ocorrida em <span class="required">*</span></label><input type="datetime-local" id="oc-f-data-ocorrencia" class="field-input"></div>
        <div class="form-field"><label class="field-label">Detectada em</label><input type="datetime-local" id="oc-f-data-deteccao" class="field-input"></div>
      </div>
      <div class="form-row">
        <div class="form-field"><label class="field-label">Método de detecção</label><select id="oc-f-metodo" class="field-select"></select></div>
        <div class="form-field"><label class="field-label">Severidade <span class="required">*</span></label>
          <select id="oc-f-severidade" class="field-select"><option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option><option value="critica">Crítica</option></select></div>
      </div>
      <div class="oc-esp-bloco" data-tipos="ambiental">
        <div class="form-row">
          <div class="form-field"><label class="field-label">Leitura registrada <span class="required">*</span></label><input type="text" id="oc-f-esp-leitura" class="field-input" placeholder="Ex.: 12,4"></div>
          <div class="form-field"><label class="field-label">Faixa aceitável</label><input type="text" id="oc-f-esp-faixaAceitavel" class="field-input" placeholder="Ex.: 2 a 8"></div>
        </div>
        <div class="form-row">
          <div class="form-field"><label class="field-label">Unidade</label><input type="text" id="oc-f-esp-unidade" class="field-input" placeholder="°C, %UR, V..."></div>
          <div class="form-field"><label class="field-label">Duração estimada (min)</label><input type="number" min="0" id="oc-f-esp-duracaoMin" class="field-input"></div>
        </div>
      </div>
      <div class="oc-esp-bloco" data-tipos="dano,acidente">
        <div class="form-field"><label class="field-label">Pessoas envolvidas</label><input type="text" id="oc-f-esp-pessoasEnvolvidas" class="field-input"></div>
        <label class="oc-check"><input type="checkbox" id="oc-f-esp-houveLesao"> Houve lesão / exposição</label>
        <label class="oc-check"><input type="checkbox" id="oc-f-esp-comunicadoSESMT"> Comunicado ao SESMT / segurança do trabalho</label>
      </div>
      <div class="oc-esp-bloco" data-tipos="alerta_fabricante">
        <div class="form-row">
          <div class="form-field"><label class="field-label">Fabricante</label><input type="text" id="oc-f-esp-fabricante" class="field-input"></div>
          <div class="form-field"><label class="field-label">Nº / identificação do alerta <span class="required">*</span></label><input type="text" id="oc-f-esp-numAlerta" class="field-input"></div>
        </div>
        <div class="form-field"><label class="field-label">Lotes / séries afetados</label><input type="text" id="oc-f-esp-lotesAfetados" class="field-input"></div>
      </div>
    </div>
    <div class="form-section">
      ${sec('Ação imediata (contenção)', OC_ICO.wrench)}
      <div class="form-field"><label class="field-label">O que foi feito de imediato? <span class="required">*</span></label>
        <textarea id="oc-f-acao-imediata" class="field-textarea" style="min-height:70px;" placeholder="Ex.: reagentes transferidos para a geladeira reserva; equipamento identificado como fora de uso; amostras do lote retidas..."></textarea></div>
    </div>
    <div class="form-section" id="oc-form-anexos-section">
      ${sec('Evidências', OC_ICO.clip)}
      <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center;">
        <input type="text" id="oc-form-upload-title" class="field-input" placeholder="Nome do arquivo (ex.: foto do display)" style="flex:1;">
        <button id="oc-form-upload-btn" class="btn btn-primary" onclick="ocUpload('oc-form')" style="flex-shrink:0;">${OC_ICO.upload} Enviar</button>
      </div>
      <div id="oc-form-upload-zone" class="upload-drop-zone" title="Clique ou arraste um arquivo PDF ou imagem">
        ${OC_ICO.upload}
        <div class="upload-drop-text"><strong>Clique ou arraste o arquivo</strong><br><span>PDF ou imagem</span></div>
        <input type="file" id="oc-form-file-input" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.svg" style="display:none;">
      </div>
      <div id="oc-form-file-preview" style="display:none;margin-top:6px;"></div>
      <div id="oc-form-anexo-list" style="margin-top:8px;"></div>
    </div>
  </div>
  <div class="drawer-footer">
    <button class="btn btn-outline" onclick="otCloseModal('modal-oc-form')">Cancelar</button>
    <button class="btn btn-primary" onclick="ocSaveForm()" id="btn-oc-form-save">${OC_ICO.check}<span id="oc-form-save-lbl">Registrar</span></button>
  </div>
</div>

<!-- ══ VISUALIZAÇÃO / TRATAMENTO ══ -->
<div class="modal-overlay modal-ot-view modal-oc-view" id="modal-oc-view">
  <div class="modal wide">
    <div class="modal-header">
      <div class="modal-header-left">
        <div class="modal-header-icon" style="color:var(--red);">${OC_ICO.alerta}</div>
        <div><div class="modal-title">Ocorrência</div><div class="modal-subtitle">Registro, tratamento e evidências</div></div>
      </div>
      <button class="modal-close" onclick="otCloseModal('modal-oc-view')">${OC_ICO.close}</button>
    </div>
    <div class="modal-body oc-view-body">
      <div id="oc-view-head"></div>
      <div class="ot-modal-tabs oc-view-tabs" id="oc-view-tabs"></div>
      <div id="oc-view-tab-body" class="oc-view-tab-body"></div>
    </div>
    <div class="modal-footer" style="justify-content:space-between;flex-wrap:wrap;gap:8px;">
      <div id="oc-view-foot-left" style="display:flex;gap:8px;flex-wrap:wrap;"></div>
      <div id="oc-view-foot-right" style="display:flex;gap:8px;flex-wrap:wrap;"></div>
    </div>
  </div>
</div>

<!-- ══ PROMPT GENÉRICO ══ -->
<div class="modal-overlay modal-ot-sm modal-oc-prompt" id="modal-oc-prompt">
  <div class="modal">
    <div class="modal-header">
      <div class="modal-header-left">
        <div class="modal-header-icon">${OC_ICO.alerta}</div>
        <div><div class="modal-title" id="oc-prompt-title"></div><div class="modal-subtitle" id="oc-prompt-subtitle"></div></div>
      </div>
      <button class="modal-close" onclick="otCloseModal('modal-oc-prompt')">${OC_ICO.close}</button>
    </div>
    <div class="modal-body" id="oc-prompt-body"></div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="otCloseModal('modal-oc-prompt')">Voltar</button>
      <button class="btn btn-primary" id="oc-prompt-confirm" onclick="ocPromptConfirmar()"></button>
    </div>
  </div>
</div>

<!-- ══ SELETOR DE OCORRÊNCIA (formulário da OT) ══ -->
<div class="modal-overlay modal-ot-sm modal-oc-ativo" id="modal-oc-ot-picker">
  <div class="modal">
    <div class="modal-header">
      <div class="modal-header-left">
        <div class="modal-header-icon" style="color:var(--red);">${OC_ICO.alerta}</div>
        <div><div class="modal-title">Vincular ocorrência</div><div class="modal-subtitle">Ocorrências em aberto · as do mesmo ativo aparecem primeiro</div></div>
      </div>
      <button class="modal-close" onclick="otCloseModal('modal-oc-ot-picker')">${OC_ICO.close}</button>
    </div>
    <div class="modal-body">
      <input type="text" id="oc-ot-picker-input" class="field-input" placeholder="Buscar por número, título ou ativo..." oninput="ocPickerOTFiltrar(this.value)" style="margin-bottom:10px;">
      <div id="oc-ot-picker-list" class="oc-ativo-search-list"></div>
    </div>
  </div>
</div>

<!-- ══ SELETOR DE ATIVO ══ -->
<div class="modal-overlay modal-ot-sm modal-oc-ativo" id="modal-oc-ativo-search">
  <div class="modal">
    <div class="modal-header">
      <div class="modal-header-left">
        <div class="modal-header-icon">${OC_ICO.ativo}</div>
        <div><div class="modal-title">Selecionar ativos</div><div class="modal-subtitle" id="oc-ativo-picker-sub">Busque por nome, código, unidade, setor ou modelo</div></div>
      </div>
      <button class="modal-close" onclick="otCloseModal('modal-oc-ativo-search')">${OC_ICO.close}</button>
    </div>
    <div class="modal-body">
      <input type="text" id="oc-ativo-search-input" class="field-input" placeholder="Buscar ativo..." oninput="ocAtivoPickerFiltrar(this.value)" style="margin-bottom:10px;">
      <div id="oc-ativo-search-list" class="oc-ativo-search-list"></div>
    </div>
    <div class="modal-footer" id="oc-ativo-picker-foot" style="justify-content:space-between;">
      <span id="oc-ativo-picker-count" style="font-size:12.5px;color:var(--text-muted);"></span>
      <button class="btn btn-primary" onclick="ocAtivoPickerConcluir()">${OC_ICO.check} Concluir</button>
    </div>
  </div>
</div>`;
}
