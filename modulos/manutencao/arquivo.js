// ═══════════════════════════════════════════════════════════════
// arquivo.js — Arquivo compactado de publicações — Manutenção LAMIC
//
// Publicações (atividades realizadas) com mais de ARQ_MESES meses saem do nó
// principal `gestao-ativos-v2/publicacoes` e vão para `gestao-pubs-arquivo-v1`,
// agrupadas por ano + tarefa e compactadas sem perda: os valores que se repetem
// em todo o grupo (autor, checklist marcado, tarefa…) ficam uma vez só em `base`
// e cada publicação vira uma linha [id, dataRealizada, dataPublicacao, difs?].
//
// Nada é apagado. O arquivo só é carregado quando alguém consulta histórico
// antigo, e as publicações arquivadas são somente leitura (evidência de auditoria
// RDC 978/2025, PALC e ISO 15189). Cada grupo guarda um hash do conteúdo original.
// ═══════════════════════════════════════════════════════════════

const ARQ_KEY    = 'gestao-pubs-arquivo-v1';
const ARQ_MESES  = 12;
const ARQ_VERSAO = 1;
// Campos guardados por posição em cada linha (sempre strings quando presentes)
const ARQ_CAMPOS_LINHA = ['id', 'dataRealizada', 'dataPublicacao'];

// ── FUNÇÕES PURAS (sem DOM nem Firebase) ──────────────────────

// O Firebase descarta arrays e objetos vazios e pode devolver arrays como objetos
function _arqArr(v) {
  if (Array.isArray(v)) return v.filter(x => x !== null && x !== undefined);
  if (v && typeof v === 'object') return Object.values(v);
  return [];
}

// Reproduz o que o Firebase guarda: sem null/undefined, sem arrays/objetos vazios
function _arqNormalizar(v) {
  if (Array.isArray(v)) {
    const out = v.map(_arqNormalizar).filter(x => x !== undefined);
    return out.length ? out : undefined;
  }
  if (v !== null && typeof v === 'object') {
    const out = {};
    Object.keys(v).forEach(k => {
      if (k === '_arq') return; // marcador local, não faz parte do registro
      const n = _arqNormalizar(v[k]);
      if (n !== undefined) out[k] = n;
    });
    return Object.keys(out).length ? out : undefined;
  }
  return v === null ? undefined : v;
}

// JSON com chaves ordenadas: mesma entrada → mesma string, em qualquer navegador
function _arqCanonico(v) {
  if (Array.isArray(v)) return '[' + v.map(_arqCanonico).join(',') + ']';
  if (v !== null && typeof v === 'object') {
    return '{' + Object.keys(v).sort()
      .filter(k => v[k] !== undefined)
      .map(k => JSON.stringify(k) + ':' + _arqCanonico(v[k])).join(',') + '}';
  }
  return v === undefined ? 'null' : JSON.stringify(v);
}

function _arqClonar(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

// Data (YYYY-MM-DD) usada para decidir o corte e o ano do grupo
function _arqDataChave(p) {
  const m = /^\d{4}-\d{2}-\d{2}/.exec(p?.dataRealizada || '') || /^\d{4}-\d{2}-\d{2}/.exec(p?.dataPublicacao || '');
  return m ? m[0] : '';
}

// Ordem estável para o hash e para as linhas
function _arqOrdenar(pubs) {
  return pubs.slice().sort((a, b) => {
    const ka = _arqDataChave(a) + (a.dataRealizada || '') + (a.dataPublicacao || '') + (a.id || '');
    const kb = _arqDataChave(b) + (b.dataRealizada || '') + (b.dataPublicacao || '') + (b.id || '');
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

// Mescla listas de publicações por id; a última lista vence em caso de repetição
function _arqMesclar(...listas) {
  const porId = new Map();
  listas.forEach(l => l.forEach(p => { if (p?.id) porId.set(p.id, p); }));
  return [...porId.values()];
}

// pubs → grupo compactado (sem hash e sem metadados de execução)
function _arqCompactar(pubs) {
  const lista = _arqOrdenar(pubs.map(p => _arqNormalizar(p) || {}));
  const n = lista.length;

  // base = valor mais frequente de cada campo, se presente em mais da metade do grupo
  const freq = {};
  lista.forEach(p => Object.keys(p).forEach(k => {
    if (ARQ_CAMPOS_LINHA.includes(k)) return;
    const c = _arqCanonico(p[k]);
    freq[k] = freq[k] || {};
    freq[k][c] = freq[k][c] || { qtd: 0, valor: p[k] };
    freq[k][c].qtd++;
  }));
  const base = {};
  Object.entries(freq).forEach(([k, vals]) => {
    const top = Object.values(vals).sort((a, b) => b.qtd - a.qtd)[0];
    if (top.qtd * 2 > n) base[k] = _arqClonar(top.valor);
  });
  const baseCanon = Object.fromEntries(Object.entries(base).map(([k, v]) => [k, _arqCanonico(v)]));

  const linhas = lista.map(p => {
    const difs = {};
    // Campo de linha ausente ou não-string vira 0 na linha (e o valor real, se houver, vai em difs)
    const linha = ARQ_CAMPOS_LINHA.map(k => {
      if (typeof p[k] === 'string') return p[k];
      if (p[k] !== undefined) difs[k] = _arqClonar(p[k]);
      return 0;
    });
    Object.keys(p).forEach(k => {
      if (ARQ_CAMPOS_LINHA.includes(k)) return;
      if (k in baseCanon && baseCanon[k] === _arqCanonico(p[k])) return;
      difs[k] = _arqClonar(p[k]);
    });
    const omit = Object.keys(base).filter(k => !(k in p));
    if (omit.length) difs._omit = omit;
    if (Object.keys(difs).length) linha.push(difs);
    return linha;
  });

  return { v: ARQ_VERSAO, n, base, linhas };
}

// grupo compactado → pubs (na ordem das linhas)
function _arqDescompactar(g) {
  if (!g || typeof g !== 'object') return [];
  const base = g.base || {};
  return _arqArr(g.linhas).map(l => {
    const linha = Array.isArray(l) ? l : _arqArr(l);
    const p = {};
    Object.keys(base).forEach(k => { p[k] = _arqClonar(base[k]); });
    ARQ_CAMPOS_LINHA.forEach((k, i) => { if (typeof linha[i] === 'string') p[k] = linha[i]; });
    const difs = linha[ARQ_CAMPOS_LINHA.length];
    if (difs && typeof difs === 'object') {
      Object.keys(difs).forEach(k => {
        if (k === '_omit') _arqArr(difs._omit).forEach(o => { delete p[o]; });
        else p[k] = _arqClonar(difs[k]);
      });
    }
    return p;
  });
}

// FNV-1a 32 bits — só quando crypto.subtle não está disponível (contexto não seguro)
function _arqFnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// Hash do conteúdo original (normalizado e ordenado) de um grupo
async function _arqHash(pubs) {
  const txt = _arqCanonico(_arqOrdenar(pubs.map(p => _arqNormalizar(p) || {})));
  const subtle = (typeof crypto !== 'undefined' && crypto.subtle) ? crypto.subtle : null;
  if (subtle && typeof TextEncoder !== 'undefined') {
    const buf = await subtle.digest('SHA-256', new TextEncoder().encode(txt));
    return 'sha256:' + Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  return 'fnv1a32:' + _arqFnv1a(txt);
}

// Compacta e confere que a volta reproduz exatamente o original
async function _arqCompactarVerificado(pubs) {
  const g = _arqCompactar(pubs);
  const original = _arqCanonico(_arqOrdenar(pubs.map(p => _arqNormalizar(p) || {})));
  // Passa pelo mesmo tratamento do Firebase antes de descompactar
  const volta = _arqCanonico(_arqOrdenar(_arqDescompactar(_arqNormalizar(g) || {}).map(p => _arqNormalizar(p) || {})));
  if (volta !== original) throw new Error('Verificação de compactação falhou');
  g.hash = await _arqHash(pubs);
  return g;
}

// Data de corte (YYYY-MM-DD): publicações anteriores a ela são arquivadas
function _arqDataCorte(hoje = new Date(), meses = ARQ_MESES) {
  const d = new Date(hoje.getFullYear(), hoje.getMonth() - meses, hoje.getDate());
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Separa as publicações do nó principal em { arquivar: {ano: {tarefaId: [pubs]}}, manter: [pubs], qtd }
function _arqPlanejar(pubs, corte) {
  const arquivar = {};
  const manter = [];
  let qtd = 0;
  pubs.forEach(p => {
    const d = _arqDataChave(p);
    if (!d || d >= corte || !p?.id || !p?.tarefaId) { manter.push(p); return; }
    const ano = d.slice(0, 4);
    arquivar[ano] = arquivar[ano] || {};
    (arquivar[ano][p.tarefaId] = arquivar[ano][p.tarefaId] || []).push(p);
    qtd++;
  });
  return { arquivar, manter, qtd };
}

function _arqTamanho(v) {
  const s = JSON.stringify(v ?? null);
  return typeof Blob !== 'undefined' ? new Blob([s]).size : s.length;
}

// ── ESTADO ────────────────────────────────────────────────────
let _arqIndice     = {};   // { tarefaId: { n, anos: { "2024": 250 } } }
let _arqExecucoes  = {};   // trilha das execuções de arquivamento
let _arqCache      = {};   // { ano: [pubs descompactadas] }
const _arqCarregando = {}; // { ano: Promise }
let _arqEmExecucao = false;

window._dbReady?.then(() => {
  window.dbListen(`${ARQ_KEY}/indice`, data => {
    _arqIndice = (data && typeof data === 'object') ? data : {};
    // Só re-renderiza depois que os dados principais chegaram (antes disso o script.js renderiza sozinho)
    if (typeof _stateFirebaseReady !== 'undefined' && _stateFirebaseReady && typeof refreshTaskFlagsUI === 'function') refreshTaskFlagsUI();
  });
});

// ── LEITURA ───────────────────────────────────────────────────
function _arqAnosDe(tarefaIds) {
  const anos = new Set();
  const ids = tarefaIds ? tarefaIds : Object.keys(_arqIndice);
  ids.forEach(id => Object.keys(_arqIndice[id]?.anos || {}).forEach(a => anos.add(a)));
  return [...anos].sort();
}

function arqCarregarAno(ano) {
  ano = String(ano);
  if (_arqCache[ano]) return Promise.resolve(_arqCache[ano]);
  if (_arqCarregando[ano]) return _arqCarregando[ano];
  _arqCarregando[ano] = window.dbLoad(`${ARQ_KEY}/grupos/${ano}`).then(grupos => {
    const pubs = [];
    Object.values(grupos || {}).forEach(g => _arqDescompactar(g).forEach(p => { p._arq = true; pubs.push(p); }));
    _arqCache[ano] = pubs;
    delete _arqCarregando[ano];
    return pubs;
  }).catch(err => {
    delete _arqCarregando[ano];
    throw err;
  });
  return _arqCarregando[ano];
}

async function arqCarregarAnos(anos) {
  const pendentes = (anos || []).map(String).filter(a => !_arqCache[a]);
  if (!pendentes.length) return;
  try {
    await Promise.all(pendentes.map(arqCarregarAno));
  } catch (err) {
    console.error('[arquivo.js] falha ao carregar arquivo:', err);
    if (typeof showToast === 'function') showToast('Não foi possível carregar o histórico arquivado.', 'error');
    return;
  }
  // Re-renderiza listas, modais abertos e a agenda (via _agendaRefreshHook)
  if (typeof refreshTaskFlagsUI === 'function') refreshTaskFlagsUI();
}

function arqCarregarTudo() { return arqCarregarAnos(_arqAnosDe(null)); }

// Publicações do nó principal + as arquivadas já carregadas (sem repetir id)
function todasPublicacoes() {
  const hot = (typeof state !== 'undefined' && state.publicacoes) || [];
  const anos = Object.keys(_arqCache);
  if (!anos.length) return hot;
  const ids = new Set(hot.map(p => p.id));
  const extra = [];
  anos.forEach(a => _arqCache[a].forEach(p => { if (!ids.has(p.id)) { ids.add(p.id); extra.push(p); } }));
  return hot.concat(extra);
}

function arqBuscarPublicacao(id) {
  if (!id) return null;
  return todasPublicacoes().find(p => p.id === id) || null;
}

function arqEhArquivada(pubOuId) {
  const p = typeof pubOuId === 'string' ? arqBuscarPublicacao(pubOuId) : pubOuId;
  return !!p?._arq;
}

// Total de publicações de uma tarefa (nó principal + arquivo), sem carregar o arquivo
function arqContarPubs(tarefaId) {
  const hot = ((typeof state !== 'undefined' && state.publicacoes) || []).filter(p => p.tarefaId === tarefaId).length;
  return hot + (Number(_arqIndice[tarefaId]?.n) || 0);
}

function arqTemPubs(tarefaId) {
  return (Number(_arqIndice[tarefaId]?.n) || 0) > 0
    || ((typeof state !== 'undefined' && state.publicacoes) || []).some(p => p.tarefaId === tarefaId);
}

function arqTotalArquivadas() {
  return Object.values(_arqIndice).reduce((s, i) => s + (Number(i?.n) || 0), 0);
}

// Quantas publicações arquivadas destas tarefas ainda não foram carregadas
function arqPendentes(tarefaIds) {
  let n = 0;
  const anos = new Set();
  (tarefaIds || Object.keys(_arqIndice)).forEach(id => {
    Object.entries(_arqIndice[id]?.anos || {}).forEach(([ano, qtd]) => {
      if (_arqCache[ano]) return;
      n += Number(qtd) || 0;
      anos.add(ano);
    });
  });
  return { n, anos: [...anos].sort() };
}

// Botão "Carregar histórico arquivado" para o rodapé das listas
function arqRodapeHtml(tarefaIds) {
  const { n, anos } = arqPendentes(tarefaIds);
  if (!n) return '';
  return `<div class="arq-rodape">
    <button class="btn btn-outline" onclick="event.stopPropagation();arqCarregarAnos(${_arqEscAttr(JSON.stringify(anos))})">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
      Carregar histórico arquivado (${n} publicaç${n > 1 ? 'ões' : 'ão'} · ${anos.join(', ')})
    </button>
  </div>`;
}

// Mantém o rodapé de uma lista que é re-renderizada por innerHTML de outro elemento
function arqRenderRodape(elId, ancora, tarefaIds) {
  let el = document.getElementById(elId);
  if (!el) {
    if (!ancora) return;
    el = document.createElement('div');
    el.id = elId;
    ancora.after(el);
  }
  el.innerHTML = arqRodapeHtml(tarefaIds);
}

// Selo para publicações arquivadas (somente leitura)
function arqSeloHtml(p) {
  return p?._arq ? `<span class="chip chip-gray arq-selo" title="Registro arquivado — somente leitura">Arquivada</span>` : '';
}

function _arqEscAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
function _arqEsc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── EXECUÇÃO DO ARQUIVAMENTO ──────────────────────────────────
function _arqPodeArquivar() {
  if (typeof currentSession === 'undefined' || !currentSession) return false;
  return !!currentSession.isAdmin || (typeof authHasPermission === 'function' && authHasPermission('config.backup'));
}

function arqPrevia() {
  const corte = _arqDataCorte();
  const hot = (typeof state !== 'undefined' && state.publicacoes) || [];
  const plano = _arqPlanejar(hot, corte);
  const tarefas = new Set();
  Object.values(plano.arquivar).forEach(porTarefa => Object.keys(porTarefa).forEach(t => tarefas.add(t)));
  return {
    corte,
    qtd: plano.qtd,
    tarefas: tarefas.size,
    anos: Object.keys(plano.arquivar).sort(),
    totalHot: hot.length,
    bytesHot: _arqTamanho(hot),
    bytesMover: _arqTamanho(Object.values(plano.arquivar).flatMap(pt => Object.values(pt).flat())),
  };
}

async function arqExecutarArquivamento() {
  if (!_arqPodeArquivar()) { showToast('Sem permissão para arquivar o histórico.', 'error'); return; }
  if (_arqEmExecucao) return;
  if (typeof _stateFirebaseReady !== 'undefined' && !_stateFirebaseReady) { showToast('Aguarde a sincronização com o banco.', 'info'); return; }
  if (!window._dbConnected) { showToast('Sem conexão com o banco. Tente novamente quando estiver online.', 'error'); return; }
  if (typeof window.dbUpdate !== 'function') { showToast('Função de gravação indisponível.', 'error'); return; }

  const corte = _arqDataCorte();
  const plano = _arqPlanejar(state.publicacoes, corte);
  if (!plano.qtd) { showToast('Nenhuma publicação anterior ao corte para arquivar.', 'info'); arqRenderPainel(); return; }
  if (!(await uiConfirmar({
    tipo: 'info', titulo: 'Arquivar histórico?', confirmar: 'Arquivar',
    mensagem: `<b>${plano.qtd} publicação(ões)</b> realizadas antes de <b>${formatDate(corte)}</b> serão arquivadas.`,
    detalhe: 'Os registros não são apagados: passam para o arquivo compactado, ficam somente leitura e são carregados sob demanda ao consultar histórico antigo.',
  }))) return;
  if (_arqEmExecucao) return;

  _arqEmExecucao = true;
  arqRenderPainel();
  try {
    const sess = currentSession;
    const agora = new Date().toISOString();
    const updates = {};
    const gruposInfo = [];
    const indiceAtual = (await window.dbLoad(`${ARQ_KEY}/indice`)) || {};
    const indiceNovo = {};
    let bytesDepois = 0;

    // Fase 1: monta e verifica cada grupo (mesclando com o que já estiver arquivado)
    const escritas = [];
    for (const [ano, porTarefa] of Object.entries(plano.arquivar)) {
      for (const [tarefaId, pubs] of Object.entries(porTarefa)) {
        const caminho = `${ARQ_KEY}/grupos/${ano}/${tarefaId}`;
        const existente = await window.dbLoad(caminho);
        const mescladas = _arqMesclar(_arqDescompactar(existente), pubs);
        const g = await _arqCompactarVerificado(mescladas);
        g.arquivadoEm = agora;
        g.arquivadoPorId = sess?.userId || null;
        g.arquivadoPorNome = sess?.nomeCompleto || sess?.username || null;
        escritas.push({ caminho, g, ano, tarefaId, mescladas });
        bytesDepois += _arqTamanho(g);
        gruposInfo.push({ ano, tarefaId, n: g.n, hash: g.hash });

        const idx = indiceNovo[tarefaId] || _arqClonar(indiceAtual[tarefaId]) || { n: 0, anos: {} };
        idx.anos = idx.anos || {};
        idx.anos[ano] = g.n;
        idx.n = Object.values(idx.anos).reduce((s, q) => s + (Number(q) || 0), 0);
        indiceNovo[tarefaId] = idx;
      }
    }

    // Fase 2: grava só os grupos e confere lendo de volta do banco
    escritas.forEach(e => { updates[e.caminho] = e.g; });
    if (!await window.dbUpdate(updates)) throw new Error('Falha ao gravar o arquivo');
    for (const e of escritas) {
      const lido = await window.dbLoad(e.caminho);
      const hashLido = await _arqHash(_arqDescompactar(lido));
      if (hashLido !== e.g.hash) throw new Error(`Conferência falhou no grupo ${e.ano}/${e.tarefaId}`);
    }

    // Fase 3: atômico — índice + nó principal sem as arquivadas + trilha da execução
    const idsArquivados = new Set(escritas.flatMap(e => e.mescladas.map(p => p.id)));
    const recentes = state.publicacoes.filter(p => !idsArquivados.has(p.id));
    const execId = (typeof uid === 'function') ? uid() : Date.now().toString(36);
    const fase3 = {
      [`gestao-ativos-v2/publicacoes`]: recentes,
      [`${ARQ_KEY}/execucoes/${execId}`]: {
        em: agora, corte,
        porId: sess?.userId || null,
        porNome: sess?.nomeCompleto || sess?.username || null,
        qtdMovida: plano.qtd,
        grupos: gruposInfo,
        bytesAntes: _arqTamanho(state.publicacoes.filter(p => idsArquivados.has(p.id))),
        bytesDepois,
      },
    };
    Object.entries(indiceNovo).forEach(([t, idx]) => { fase3[`${ARQ_KEY}/indice/${t}`] = idx; });
    if (!await window.dbUpdate(fase3)) throw new Error('Arquivo gravado, mas falhou ao atualizar o nó principal. Execute novamente.');

    state.publicacoes = recentes;
    _arqIndice = { ..._arqIndice, ...indiceNovo };
    // Descarta caches dos anos alterados para recarregar já mesclados
    Object.keys(plano.arquivar).forEach(a => { delete _arqCache[a]; });
    showToast(`${plano.qtd} publicação(ões) arquivada(s).`, 'success');
  } catch (err) {
    console.error('[arquivo.js] arquivamento:', err);
    showToast('Arquivamento interrompido: ' + err.message, 'error');
  } finally {
    _arqEmExecucao = false;
    if (typeof refreshTaskFlagsUI === 'function') refreshTaskFlagsUI();
    if (typeof renderSysInfo === 'function') renderSysInfo();
    arqRenderPainel();
  }
}

// ── PAINEL (Configurações › Backup) ───────────────────────────
async function arqRenderPainel() {
  const el = document.getElementById('arq-painel');
  if (!el) return;
  const card = document.getElementById('arq-card');
  if (card) card.style.display = _arqPodeArquivar() ? '' : 'none';
  if (!_arqPodeArquivar()) return;

  const pv = arqPrevia();
  const totalArq = arqTotalArquivadas();
  const kb = b => (b / 1024).toFixed(1) + ' KB';
  // Estimativa conservadora: ~30% do tamanho original após compactação
  const estimado = Math.round(pv.bytesMover * 0.3);

  el.innerHTML = `
    <div class="arq-stats">
      <div><span>Publicações no banco principal</span><strong>${pv.totalHot}</strong></div>
      <div><span>Publicações já arquivadas</span><strong>${totalArq}</strong></div>
      <div><span>A arquivar (antes de ${formatDate(pv.corte)})</span><strong>${pv.qtd}</strong></div>
      <div><span>Tarefas envolvidas</span><strong>${pv.tarefas}</strong></div>
      <div><span>Tamanho a mover</span><strong>${kb(pv.bytesMover)} → ~${kb(estimado)}</strong></div>
    </div>
    <button class="btn btn-primary cfg-backup-btn" onclick="arqExecutarArquivamento()" ${(!pv.qtd || _arqEmExecucao) ? 'disabled' : ''}>
      ${_arqEmExecucao ? 'Arquivando…' : `Arquivar ${pv.qtd} publicaç${pv.qtd === 1 ? 'ão' : 'ões'}`}
    </button>
    <div class="arq-execucoes" id="arq-execucoes"></div>`;

  try {
    const ex = await window.dbLoad(`${ARQ_KEY}/execucoes`);
    _arqExecucoes = ex || {};
  } catch { /* lista é opcional */ }
  const lista = Object.values(_arqExecucoes).sort((a, b) => (b.em || '').localeCompare(a.em || '')).slice(0, 5);
  const exEl = document.getElementById('arq-execucoes');
  if (exEl && lista.length) {
    exEl.innerHTML = `<div class="arq-execucoes-titulo">Últimas execuções</div>` + lista.map(e => `
      <div class="arq-execucao">
        <span>${e.em ? new Date(e.em).toLocaleString('pt-BR') : '—'}</span>
        <span>${_arqEsc(e.porNome || '—')}</span>
        <span>${Number(e.qtdMovida) || 0} pub. · corte ${formatDate(e.corte)}</span>
        <span>${kb(Number(e.bytesAntes) || 0)} → ${kb(Number(e.bytesDepois) || 0)}</span>
      </div>`).join('');
  }
}

// ── BACKUP ────────────────────────────────────────────────────
// Lê o nó de arquivo inteiro (grupos compactados, índice e execuções) sem descompactar
function arqExportarDados() {
  return window.dbLoad(ARQ_KEY);
}

async function arqRestaurarDados(dados) {
  if (!dados || typeof dados !== 'object') return;
  await window.dbSave(ARQ_KEY, dados);
  _arqCache = {};
}

window.arqCarregarAno       = arqCarregarAno;
window.arqCarregarAnos      = arqCarregarAnos;
window.arqCarregarTudo      = arqCarregarTudo;
window.todasPublicacoes     = todasPublicacoes;
window.arqBuscarPublicacao  = arqBuscarPublicacao;
window.arqEhArquivada       = arqEhArquivada;
window.arqContarPubs        = arqContarPubs;
window.arqTemPubs           = arqTemPubs;
window.arqPendentes         = arqPendentes;
window.arqTotalArquivadas   = arqTotalArquivadas;
window.arqRodapeHtml        = arqRodapeHtml;
window.arqRenderRodape      = arqRenderRodape;
window.arqSeloHtml          = arqSeloHtml;
window.arqExecutarArquivamento = arqExecutarArquivamento;
window.arqRenderPainel      = arqRenderPainel;
window.arqExportarDados     = arqExportarDados;
window.arqRestaurarDados    = arqRestaurarDados;
