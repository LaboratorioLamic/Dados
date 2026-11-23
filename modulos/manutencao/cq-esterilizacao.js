// ═══════════════════════════════════════════════════════════════
// cq-esterilizacao.js — Ficha do ciclo de esterilização — LAMIC
// Cada corrida de uma autoclave com a ficha ativa registra o ciclo (carga):
// lote da carga único, programa, parâmetros físicos (tempo, temperatura e
// pressão), relação de pacotes e operador. Os indicadores químico e biológico
// são testes qualitativos da autoclave, lançados na mesma corrida; a leitura do
// indicador biológico (24 h depois) é lançada vinculada ao ciclo já registrado.
// RDC 1002/2025, arts. 81 III, 88-92 (registros por 5 anos); RDC 15/2012
// (câmara acima de 60 L); RDC 978/2025, art. 116 (correção preserva o original).
// ═══════════════════════════════════════════════════════════════

const CQ_UN_PRESSAO = ['kgf/cm²', 'bar', 'kPa', 'MPa', 'psi'];
const CQ_ESTER_DIAS_VINCULO = 10;     // ciclos oferecidos para a leitura do indicador biológico
const CQ_ESTER_INCUB_HORAS = 2;       // bula do indicador biológico: incubar até 2 h após o ciclo (padrão da configuração)
const CQ_ESTER_INCUB_TEMP = [55, 60]; // faixa usual da incubadora para indicador de vapor (padrão da configuração)
let _cqEsterDraft = null;
const CQ_ICO_ESTER_CFG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>';             // configuração em edição { u, grupoKey, nome, programas: [] }

// ── CONFIGURAÇÃO POR EQUIPAMENTO ─────────────────────────────
// Gravada na unidade: unidades/{u}/esterilizacao/{chave do equipamento}
function _cqEsterCfgRaw(u, grupoKey) { return cqState.config.unidades[u]?.esterilizacao?.[_cqChaveModoEquip(grupoKey)] || null; }
function _cqEsterCfg(u, grupoKey) { const c = _cqEsterCfgRaw(u, grupoKey); return c && c.ativo ? c : null; }
function _cqEsterProgramas(cfg) {
  return Object.values(cfg?.programas || {}).filter(p => p && p.nome).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
}
function _cqEsterN(v) {
  const n = Number(v);
  return v === null || v === undefined || v === '' || !Number.isFinite(n) ? '—' : n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}
function _cqEsterNum(v) { return CQEngine.parseNumero(String(v ?? '').trim()); }
function _cqEsterResumoCfg(cfg) {
  if (!cfg) return 'não configurada';
  const ps = _cqEsterProgramas(cfg);
  return `${cfg.ativo ? 'ativa' : 'desativada'} · prefixo ${cfg.prefixo || '—'} · lote ${cfg.loteModo === 'auto' ? 'automático' : 'gerado ao clicar'} · nº do ciclo ${cfg.cicloModo === 'auto' ? 'automático' : 'digitado'} · ` + (ps.length
    ? ps.map(p => `${p.nome} (${_cqEsterEspTxt(p, 'temp', cfg.unPressao)}; ${_cqEsterEspTxt(p, 'tempo')}; ${_cqEsterEspTxt(p, 'pressao', cfg.unPressao)}; ${p.validadeAtiva === false ? 'sem validade' : `validade ${p.validadeDias ?? '—'} dia(s)`})`).join(' | ')
    : 'sem programas');
}
// Texto da especificação de um parâmetro do programa
function _cqEsterEspTxt(p, campo, unP) {
  const n = _cqEsterN;
  if (!p) return '';
  if (campo === 'temp') return p.tempMax != null ? `${n(p.tempMin)} a ${n(p.tempMax)} °C` : `≥ ${n(p.tempMin)} °C`;
  if (campo === 'tempo') return `≥ ${n(p.tempoMin)} min`;
  const u = unP || p.unPressao || 'kgf/cm²';
  return p.pressaoMax != null ? `${n(p.pressaoMin)} a ${n(p.pressaoMax)} ${u}` : `≥ ${n(p.pressaoMin)} ${u}`;
}
// Parâmetro fora da especificação ('' = conforme ou não informado)
function _cqEsterForaCampo(p, campo, v, unP) {
  if (!p || !Number.isFinite(v)) return '';
  const n = _cqEsterN, u = unP || p.unPressao || 'kgf/cm²';
  if (campo === 'temp') {
    if (v < p.tempMin) return `temperatura ${n(v)} °C abaixo de ${n(p.tempMin)} °C`;
    if (p.tempMax != null && v > p.tempMax) return `temperatura ${n(v)} °C acima de ${n(p.tempMax)} °C`;
  } else if (campo === 'tempo') {
    if (v < p.tempoMin) return `tempo de esterilização ${n(v)} min abaixo de ${n(p.tempoMin)} min`;
  } else {
    if (v < p.pressaoMin) return `pressão ${n(v)} ${u} abaixo de ${n(p.pressaoMin)} ${u}`;
    if (p.pressaoMax != null && v > p.pressaoMax) return `pressão ${n(v)} ${u} acima de ${n(p.pressaoMax)} ${u}`;
  }
  return '';
}
function _cqEsterFalhas(p, unP, v) {
  return [['temp', v.temp], ['tempo', v.tempo], ['pressao', v.pressao]].map(([c, x]) => _cqEsterForaCampo(p, c, x, unP)).filter(Boolean);
}

// Parâmetro físico fora da especificação rejeita o teste (a carga deve ser reprocessada).
// statusIndicadores guarda a avaliação só dos indicadores, para a correção da ficha recalcular.
function _cqEsterAplicar(r, falhas) {
  if (!r || !_cqArr(falhas).length) return r;
  const v = { regra: 'FIS_ESP', severidade: 'rejeicao', escopo: 'corrida', niveis: [],
              texto: `Parâmetros físicos do ciclo fora da especificação: ${_cqArr(falhas).join('; ')} — carga não liberada, reprocessar` };
  return { ...r, statusIndicadores: r.statusIndicadores || r.status, status: 'rejeitado', violacoes: [..._cqArr(r.violacoes).filter(x => x.regra !== 'FIS_ESP'), v] };
}

// ── SITUAÇÃO DO CICLO ────────────────────────────────────────
// O ciclo pode ser publicado sem testes (preparado) e fica Em análise. Os indicadores lançados na
// própria corrida ou em corridas vinculadas definem a situação: Conforme quando os testes exigidos
// pelo programa estão aprovados (sem exigidos: todos os lançados aprovados), Reprovado com qualquer
// teste reprovado ou parâmetro físico fora da especificação. Calculada sempre, nunca digitada.
const CQ_CICLO_STATUS = {
  em_analise: { label: 'Em análise', cls: 'cq-st-pendente' },
  liberado:   { label: 'Conforme',   cls: 'cq-st-aceito' },
  reprovado:  { label: 'Reprovado',  cls: 'cq-st-rejeitado' },
};
// Estado final de um teste: A aprovado (liberado, com ou sem justificativa), R reprovado, P aguardando decisão
function _cqEsterEstadoTeste(ct) {
  if (!ct || ct.naoRealizado) return null;
  if (!ct.decisao) return 'P';
  return ct.decisao.acao === 'rejeitado' ? 'R' : 'A';
}
function _cqEsterResumoTestes(testes) {
  const out = {};
  Object.entries(testes || {}).forEach(([tid, ct]) => { const e = _cqEsterEstadoTeste(ct); if (e) out[tid] = e; });
  return out;
}
// Estados de cada teste no ciclo: os da corrida do ciclo + os das corridas vinculadas (leituras)
function _cqEsterEstadosCiclo(c) {
  const est = {};
  const add = (tid, e) => { (est[tid] = est[tid] || []).push(e); };
  Object.entries(_cqEsterResumoTestes(c.testes)).forEach(([t, e]) => add(t, e));
  Object.values(c.ciclo?.leituras || {}).forEach(l => Object.entries(l?.testes || {}).forEach(([t, e]) => add(t, e)));
  return est;
}
function _cqEsterCalcStatus(c) {
  const ci = c.ciclo;
  if (ci.conforme === false) return 'reprovado';
  const est = _cqEsterEstadosCiclo(c);
  const todos = Object.values(est).flat();
  if (todos.includes('R')) return 'reprovado';
  const exig = _cqArr(ci.testesExigidos).map(x => x.id);
  if (exig.length) return exig.every(t => (est[t] || []).includes('A')) ? 'liberado' : 'em_analise';
  return todos.length && !todos.includes('P') ? 'liberado' : 'em_analise';
}
// Testes do equipamento cujo analito libera o ciclo (Cadastros › Analitos › Analito de autoclave)
function _cqEsterExigidosEquip(testes) {
  return _cqArr(testes).filter(t => { const a = _cqAnalito(t.analitoId); return !!a?.indicadorEster && !!a.liberaCiclo; })
    .map(t => ({ id: t.id, nome: _cqNomeTeste(t) }));
}
// Testes exigidos ainda sem aprovação (para o painel e o detalhe)
function _cqEsterFaltam(c) {
  const est = _cqEsterEstadosCiclo(c);
  return _cqArr(c.ciclo?.testesExigidos).filter(x => !(est[x.id] || []).includes('A')).map(x => x.nome);
}
// Resumo gravado no índice dos ciclos em análise (painel e seletor do lançamento)
function _cqEsterPendResumo(c) {
  const ci = c.ciclo;
  return { numero: c.numero || null, mes: c.mes, dataHora: c.dataHora, lote: ci.loteCarga, programa: ci.programa?.nome || '',
           equipNome: c.ativoSnap?.nome || c.sistemaAnalitico || '', grupo: _cqEsterGrupoDaCorrida(c), setorIds: _cqArr(c.setorIds),
           validade: ci.validade?.data || null, faltam: _cqEsterFaltam(c) };
}
// Atualizações da situação de um ciclo já gravado (c = corrida do ciclo com as mudanças aplicadas)
function _cqEsterStatusUpdates(u, c, motivo) {
  const ci = c.ciclo;
  const antes = ci.status || null;
  const novo = _cqEsterCalcStatus(c);
  const base = `${CQ_KEYS.corridas}/${u}/${c.mes}/${c.key}`;
  const c2 = { ...c, ciclo: { ...ci, status: novo } };
  const up = { [`${CQ_KEYS.indices}/${u}/ciclosPendentes/${c.key}`]: novo === 'em_analise' ? _cqEsterPendResumo(c2) : null };
  if (novo !== antes) {
    up[`${base}/ciclo/status`] = novo;
    up[`${base}/ciclo/statusAss`] = { ..._cqAssinatura(), auto: true, motivo };
    up[`${base}/status`] = _cqStatusCorrida(c2);
    up[`${base}/trilha/${_cqTk()}cs`] = _cqTrilhaEntry('edicao', `Ciclo ${ci.loteCarga}: ${CQ_CICLO_STATUS[antes]?.label || 'sem situação'} → ${CQ_CICLO_STATUS[novo].label} (${motivo})`);
  }
  return { up, novo, antes };
}
// Recalcula a situação do ciclo de origem lido do banco; ajuste(c) aplica a mudança ainda não gravada
async function _cqEsterStatusOrigem(u, mes, key, ajuste, motivo) {
  let raw = null;
  try { raw = await window.dbGet(`${CQ_KEYS.corridas}/${u}/${mes}/${key}`); } catch (e) { raw = null; }
  if (!raw?.ciclo || raw.ciclo.vinculo) return { up: {} };
  const c = { ...raw, key, mes, ciclo: { ...raw.ciclo, leituras: { ...(raw.ciclo.leituras || {}) } } };
  ajuste?.(c);
  return _cqEsterStatusUpdates(u, c, motivo);
}
function _cqEsterStBadge(ci) {
  const st = ci?.status || (ci?.conforme === false ? 'reprovado' : '');
  return st ? `<span class="cq-badge ${CQ_CICLO_STATUS[st].cls}">${CQ_CICLO_STATUS[st].label}</span>` : '<span class="cq-badge cq-st-semalvo">registrado</span>';
}

function _cqEsterGrupoDaCorrida(c) { return c.ativoId ? 'a:' + c.ativoId : 'm:' + (c.sistemaAnalitico || 'Bancada / manual'); }
function _cqEsterMs(dh) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(dh || ''));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null;
}
// Data/hora do ciclo: informada na ficha (dataHoraCiclo); corridas antigas usam a da corrida
function _cqEsterDHC(o) { return o?.ciclo?.dataHoraCiclo || o?.dataHora || ''; }
// Ciclo novo em lançamento: campo da ficha, pré-preenchido com a data/hora da corrida
function _cqEsterDHCicloLanc() {
  const s = _cqLanc?.ciclo;
  return (s?.dhCiclo || (typeof _cqVal === 'function' && _cqVal('cq-l-dh')) || _cqLanc?.dataHora || _cqNowLocal()).slice(0, 16);
}
function _cqEsterHoras(de, ate) { const a = _cqEsterMs(de), b = _cqEsterMs(ate); return a === null || b === null ? null : (b - a) / 3600000; }
function _cqEsterPacotes(txt) {
  return String(txt || '').split(/\r?\n/).map(s => s.trim().slice(0, 120)).filter(Boolean).slice(0, 200);
}
// Incubação do indicador biológico (bula do produto): prazo após o ciclo e faixa de temperatura da
// incubadora, cadastrados no analito (Cadastros › Analitos). Sem cadastro: padrões; faixa vazia = sem conferência
function _cqEsterIncubCfg(an) {
  const ib = an?.incubacao;
  return {
    horas: Number(ib?.horas) > 0 ? Number(ib.horas) : CQ_ESTER_INCUB_HORAS,
    tmin: ib ? ib.tmin ?? null : CQ_ESTER_INCUB_TEMP[0],
    tmax: ib ? ib.tmax ?? null : CQ_ESTER_INCUB_TEMP[1],
  };
}
// Analito do teste biológico que recebe a incubação na corrida em lançamento
function _cqEsterIncubAn() {
  const tid = _cqEsterIncubAlvo();
  return tid ? _cqAnalito(cqState.config.testes[tid]?.analitoId) : null;
}
function _cqEsterTempForaFaixa(ib, v) { return ib.tmin != null && Number.isFinite(v) && (v < ib.tmin || v > ib.tmax); }
// Teste de indicador biológico: analito marcado como "de autoclave", tipo biológico (Cadastros › Analitos)
function _cqEsterEhBiologico(t) {
  return (t ? _cqAnalito(t.analitoId) : null)?.indicadorEster === 'biologico';
}
// A corrida em lançamento tem indicador biológico realizado?
function _cqEsterLancTemBI() {
  return typeof _cqLancTestes === 'function' && !!_cqLanc && _cqLancTestes().some(t => !_cqLanc.linhas[t.id]?.nr && _cqEsterEhBiologico(t));
}

// Equipamento com testes de indicadores de esterilização (sugere ativar a ficha)
function _cqEsterTemIndicadores(testes) {
  return testes.some(t => !!_cqAnalito(t.analitoId)?.indicadorEster);
}

// ── FORMULÁRIO DE CONFIGURAÇÃO ───────────────────────────────
function _cqEsterProgNovo() { return { id: _cqUid(), nome: '', tempMin: '', tempMax: '', tempoMin: '', pressaoMin: '', pressaoMax: '', validadeAtiva: true, validadeDias: '' }; }
// Validade da esterilização: data do ciclo + dias (AAAA-MM-DD)
function _cqEsterValData(dh, dias) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dh || ''));
  if (!m || !(dias >= 1)) return '';
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + Number(dias))).toISOString().slice(0, 10);
}
function _cqEsterDiasOk(v) { const n = Number(String(v ?? '').trim()); return Number.isInteger(n) && n >= 1 && n <= 3650 ? n : null; }

function cqEsterConfigForm(u, grupoKey) {
  if (!_cqCan('configurar')) { showToast('Sem permissão para configurar.', 'error'); return; }
  const g = _cqGruposLanc(u).find(x => x.key === grupoKey);
  const cfg = _cqEsterCfgRaw(u, grupoKey);
  const nome = g?.nome || String(grupoKey || '').replace(/^[am]:/, '');
  _cqEsterDraft = { u, grupoKey, nome, programas: _cqEsterProgramas(cfg).map(p => ({ ...p, tempMax: p.tempMax ?? '', pressaoMax: p.pressaoMax ?? '', validadeAtiva: p.validadeAtiva !== false, validadeDias: p.validadeDias ?? '' })),
    testes: (g?.testes || []).map(t => ({ id: t.id, nome: _cqNomeTeste(t) })).sort((a, b) => a.nome.localeCompare(b.nome)) };
  if (!_cqEsterDraft.programas.length) _cqEsterDraft.programas.push(_cqEsterProgNovo());
  const prefixo = cfg?.prefixo || String(g?.ativo?.codigo || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12) || 'AC';
  const loteModo = cfg?.loteModo === 'auto' ? 'auto' : 'manual', cicloModo = cfg?.cicloModo === 'auto' ? 'auto' : 'manual';
  // Contador do nº do ciclo: carrega o atual para sugerir o próximo
  const draft = _cqEsterDraft;
  window.dbLoad(_cqEsterCaminhoNumCiclo(u, grupoKey)).then(v => {
    if (_cqEsterDraft !== draft) return;
    draft.proxCarregado = (Number(v) || 0) + 1;
    const inp = document.getElementById('cq-es-prox');
    if (inp && !inp.dataset.mexeu) inp.value = draft.proxCarregado;
  }).catch(() => {});
  _cqPrompt({
    largo: true, titulo: 'Ficha do ciclo de esterilização', subtitulo: `${nome} · RDC 1002/2025, arts. 89-91`,
    corpo: `
      <label class="oc-check"><input type="checkbox" id="cq-es-ativo" ${!cfg || cfg.ativo ? 'checked' : ''}> Exigir a ficha do ciclo nos lançamentos deste equipamento</label>
      <div class="cq-nota">Cada corrida registra um ciclo: data, lote da carga (único), operador, programa, tempo, temperatura e pressão, e a relação de pacotes.
        Parâmetro fora da especificação rejeita os indicadores da corrida (carga não liberada). A leitura do indicador biológico é lançada depois, vinculada ao ciclo.
        Esterilizador com câmara acima de 60 L segue a RDC 15/2012.</div>
      <div class="form-row">
        <div class="form-field"><label class="field-label">Prefixo do lote da carga</label>
          <input type="text" id="cq-es-prefixo" class="field-input" maxlength="12" value="${_cqEsc(prefixo)}" placeholder="AC1">
          <div class="cq-nota">Lote gerado: PREFIXO-AAAAMMDD-NN. Use um prefixo diferente para cada autoclave.</div></div>
        <div class="form-field" style="max-width:180px;"><label class="field-label">Unidade de pressão</label>
          <select id="cq-es-unp" class="field-select">${CQ_UN_PRESSAO.map(x => `<option value="${_cqEsc(x)}" ${x === (cfg?.unPressao || 'kgf/cm²') ? 'selected' : ''}>${_cqEsc(x)}</option>`).join('')}</select></div>
      </div>
      <div class="cq-es-modos">
        <div class="form-field"><label class="field-label">Lote da carga</label>
          ${_cqEsterOpcoesHTML('cq-es-lotemodo', loteModo, [
            ['manual', CQ_ICO.edit, 'Gerado ao clicar', 'Editável no lançamento; o botão Gerar sugere o próximo do dia'],
            ['auto', CQ_ICO.repeat, 'Automático por ciclo', 'Gerado ao abrir o ciclo, sem digitação'],
          ])}</div>
        <div class="form-field"><label class="field-label">Nº do ciclo no equipamento</label>
          ${_cqEsterOpcoesHTML('cq-es-ciclomodo', cicloModo, [
            ['manual', CQ_ICO.edit, 'Digitado no lançamento', 'Contador do display ou da impressão da autoclave'],
            ['auto', CQ_ICO.repeat, 'Automático', 'Contador do sistema, ideal para equipamentos sem display'],
          ])}
          <div class="cq-es-prox" id="cq-es-prox-wrap" ${cicloModo === 'auto' ? '' : 'hidden'}>
            <label>Próximo nº do ciclo <input type="number" id="cq-es-prox" class="field-input" min="1" step="1" placeholder="…" oninput="this.dataset.mexeu=1"></label>
            <span class="cq-nota">Ajuste para acompanhar o contador real da autoclave. O número é confirmado ao publicar a corrida.</span>
          </div></div>
      </div>
      <div class="form-field"><label class="field-label">Programas do equipamento — especificação do fabricante para a fase de esterilização <span class="required">*</span></label>
        <div id="cq-es-progs">${_cqEsterProgsHTML()}</div>
        <button type="button" class="btn btn-outline btn-sm" onclick="cqEsterProgAdd()">${CQ_ICO.plus} Adicionar programa</button></div>
      ${(() => {
        const exig = _cqEsterExigidosEquip(g?.testes);
        return `<div class="cq-nota">${CQ_ICO.info} ${exig.length
          ? `Liberam o ciclo: <b>${exig.map(x => _cqEsc(x.nome)).join(', ')}</b> — o ciclo fica em análise até serem aprovados.`
          : 'Nenhum analito deste equipamento marcado para liberar o ciclo: fica conforme quando todos os testes lançados forem aprovados.'}
          Defina em Cadastros › Analitos › Analito de autoclave. Qualquer teste reprovado reprova o ciclo.</div>`;
      })()}`,
    confirmar: 'Salvar',
    onConfirm: cqEsterConfigSalvar,
  });
}

function _cqEsterProgsHTML() {
  const ps = _cqEsterDraft?.programas || [];
  const campo = (i, f, rot, req) => `<label><span class="cq-es-prog-rot">${rot}${req ? ' <span class="required">*</span>' : ''}</span><input type="text" inputmode="decimal" class="field-input" value="${_cqEsc(ps[i][f])}" oninput="cqEsterProgCampo(${i},'${f}',this.value)"></label>`;
  return ps.map((p, i) => `<div class="cq-es-prog">
      <div class="cq-es-prog-head"><input type="text" class="field-input" maxlength="60" value="${_cqEsc(p.nome)}" placeholder="Ex.: 134 °C — instrumental embalado" oninput="cqEsterProgCampo(${i},'nome',this.value)">
        ${ps.length > 1 ? `<button type="button" class="cq-icobtn" title="Remover programa" onclick="cqEsterProgRemover(${i})">${CQ_ICO.close}</button>` : ''}</div>
      <div class="cq-es-prog-campos">${campo(i, 'tempMin', 'Temp. mín. (°C)', true)}${campo(i, 'tempMax', 'Temp. máx. (°C)')}${campo(i, 'tempoMin', 'Tempo mín. (min)', true)}${campo(i, 'pressaoMin', 'Pressão mín.', true)}${campo(i, 'pressaoMax', 'Pressão máx.')}</div>
      <div class="cq-es-prog-val${p.validadeAtiva === false ? ' off' : ''}">
        <button type="button" class="cq-es-sw" role="switch" aria-checked="${p.validadeAtiva !== false}" title="Validade da esterilização ligada por padrão no lançamento" onclick="cqEsterProgVal(${i})"><span></span></button>
        <span class="cq-es-prog-val-rot">Validade da esterilização</span>
        <input type="number" class="field-input" min="1" max="3650" step="1" value="${_cqEsc(p.validadeDias)}" placeholder="dias" ${p.validadeAtiva === false ? 'disabled' : ''} oninput="cqEsterProgCampo(${i},'validadeDias',this.value)">
        <span class="cq-muted">${p.validadeAtiva === false ? 'desligada por padrão no lançamento' : 'dias · padrão no lançamento (editável)'}</span>
      </div>
    </div>`).join('');
}
// Opções em cartão (modo do lote e do nº do ciclo)
function _cqEsterOpcoesHTML(id, atual, ops) {
  return `<input type="hidden" id="${id}" value="${atual}"><div class="cq-es-opcoes" id="${id}-g" role="radiogroup">${ops.map(([k, ico, tit, sub]) =>
    `<button type="button" role="radio" aria-checked="${k === atual}" class="cq-es-opcao${k === atual ? ' on' : ''}" data-k="${k}" onclick="cqEsterOpcao('${id}','${k}')">
      <span class="cq-es-opcao-ico">${ico}</span><span class="cq-es-opcao-txt"><b>${tit}</b><small>${sub}</small></span><span class="cq-es-opcao-radio"></span></button>`).join('')}</div>`;
}
function cqEsterOpcao(id, k) {
  const h = document.getElementById(id);
  if (h) h.value = k;
  document.querySelectorAll(`#${id}-g .cq-es-opcao`).forEach(b => { const on = b.dataset.k === k; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  if (id === 'cq-es-ciclomodo') document.getElementById('cq-es-prox-wrap')?.toggleAttribute('hidden', k !== 'auto');
}
function cqEsterProgCampo(i, f, v) { if (_cqEsterDraft?.programas[i]) _cqEsterDraft.programas[i][f] = v; }
function cqEsterProgVal(i) {
  const p = _cqEsterDraft?.programas[i];
  if (!p) return;
  p.validadeAtiva = p.validadeAtiva === false;
  document.getElementById('cq-es-progs').innerHTML = _cqEsterProgsHTML();
}
function cqEsterProgAdd() {
  if (!_cqEsterDraft) return;
  _cqEsterDraft.programas.push(_cqEsterProgNovo());
  document.getElementById('cq-es-progs').innerHTML = _cqEsterProgsHTML();
}
function cqEsterProgRemover(i) {
  if (!_cqEsterDraft || _cqEsterDraft.programas.length <= 1) return;
  _cqEsterDraft.programas.splice(i, 1);
  document.getElementById('cq-es-progs').innerHTML = _cqEsterProgsHTML();
}

async function cqEsterConfigSalvar() {
  const d = _cqEsterDraft;
  if (!d) return false;
  const ativo = _cqChk('cq-es-ativo');
  const prefixo = _cqVal('cq-es-prefixo').toUpperCase();
  const unPressao = CQ_UN_PRESSAO.includes(_cqVal('cq-es-unp')) ? _cqVal('cq-es-unp') : 'kgf/cm²';
  if (!/^[A-Z0-9][A-Z0-9-]{0,11}$/.test(prefixo)) { showToast('Prefixo do lote: letras, números e hífen (até 12).', 'error'); return false; }
  const programas = {};
  const nomes = new Set();
  for (const [i, p] of d.programas.entries()) {
    const nome = String(p.nome || '').trim();
    const vazio = !nome && ['tempMin', 'tempMax', 'tempoMin', 'pressaoMin', 'pressaoMax', 'validadeDias'].every(f => !String(p[f] ?? '').trim());
    if (vazio) continue;
    const tit = nome || `Programa ${i + 1}`;
    if (!nome) { showToast(`${tit}: informe o nome.`, 'error'); return false; }
    if (nomes.has(nome.toLowerCase())) { showToast(`Programa repetido: ${nome}.`, 'error'); return false; }
    nomes.add(nome.toLowerCase());
    const v = f => (String(p[f] ?? '').trim() ? _cqEsterNum(p[f]) : null);
    const rec = { id: p.id || _cqUid(), nome, ordem: i, tempMin: v('tempMin'), tempMax: v('tempMax'), tempoMin: v('tempoMin'), pressaoMin: v('pressaoMin'), pressaoMax: v('pressaoMax') };
    const invalido = ['tempMin', 'tempMax', 'tempoMin', 'pressaoMin', 'pressaoMax'].find(f => String(p[f] ?? '').trim() && rec[f] === null);
    if (invalido) { showToast(`${nome}: valor inválido.`, 'error'); return false; }
    if (rec.tempMin === null || rec.tempoMin === null || rec.pressaoMin === null) { showToast(`${nome}: informe temperatura mínima, tempo mínimo e pressão mínima.`, 'error'); return false; }
    if (rec.tempoMin <= 0) { showToast(`${nome}: o tempo mínimo deve ser maior que zero.`, 'error'); return false; }
    if (rec.tempMax !== null && rec.tempMax < rec.tempMin) { showToast(`${nome}: temperatura máxima menor que a mínima.`, 'error'); return false; }
    if (rec.pressaoMax !== null && rec.pressaoMax < rec.pressaoMin) { showToast(`${nome}: pressão máxima menor que a mínima.`, 'error'); return false; }
    rec.validadeAtiva = p.validadeAtiva !== false;
    rec.validadeDias = String(p.validadeDias ?? '').trim() ? _cqEsterDiasOk(p.validadeDias) : null;
    if (String(p.validadeDias ?? '').trim() && rec.validadeDias === null) { showToast(`${nome}: validade em dias inteiros, de 1 a 3650.`, 'error'); return false; }
    if (rec.validadeAtiva && rec.validadeDias === null) { showToast(`${nome}: informe a validade da esterilização em dias (ou desligue a validade).`, 'error'); return false; }
    programas[rec.id] = rec;
  }
  if (ativo && !Object.keys(programas).length) { showToast('Cadastre ao menos um programa do equipamento.', 'error'); return false; }
  const loteModo = _cqVal('cq-es-lotemodo') === 'auto' ? 'auto' : 'manual';
  const cicloModo = _cqVal('cq-es-ciclomodo') === 'auto' ? 'auto' : 'manual';
  // Contador do nº do ciclo: grava só se o próximo nº foi alterado
  let prox = null;
  if (cicloModo === 'auto' && _cqVal('cq-es-prox')) {
    prox = Number(_cqVal('cq-es-prox'));
    if (!Number.isInteger(prox) || prox < 1 || prox > 99999999) { showToast('Próximo nº do ciclo: número inteiro a partir de 1.', 'error'); return false; }
    if (prox === d.proxCarregado) prox = null;
  }
  if (!_cqPodeGravar()) return false;
  const k = _cqChaveModoEquip(d.grupoKey);
  const antes = _cqEsterCfgRaw(d.u, d.grupoKey);
  const rec = { ativo, prefixo, unPressao, loteModo, cicloModo,
    programas, equipNome: d.nome, atualizadoEm: _cqAgora(), atualizadoPor: _cqAssinatura() };
  const txtAntes = antes ? _cqEsterResumoCfg(antes) : 'não configurada', txtDepois = _cqEsterResumoCfg(rec);
  if (antes && txtAntes === txtDepois && prox === null) return true;
  const C = CQ_KEYS.config;
  const diffs = txtAntes !== txtDepois ? [{ campo: `Ficha de esterilização · ${d.nome}`, antes: txtAntes, depois: txtDepois }] : [];
  if (prox !== null) diffs.push({ campo: `Próximo nº do ciclo · ${d.nome}`, antes: d.proxCarregado ? String(d.proxCarregado) : '—', depois: String(prox) });
  const ok = await window.dbUpdate({
    [`${C}/unidades/${d.u}/esterilizacao/${k}`]: rec,
    [`${C}/unidades/${d.u}/atualizadoEm`]: _cqAgora(),
    [`${C}/unidades/${d.u}/trilha/${_cqTk()}`]: _cqTrilhaEntry('edicao', `Ficha do ciclo de esterilização — ${d.nome}`, diffs),
    ...(prox !== null ? { [_cqEsterCaminhoNumCiclo(d.u, d.grupoKey)]: prox - 1 } : {}),
  });
  if (!ok) { showToast('Falha ao gravar. Verifique a conexão.', 'error'); return false; }
  const un = cqState.config.unidades[d.u];
  if (un) un.esterilizacao = { ...(un.esterilizacao || {}), [k]: rec };
  showToast(`Ficha do ciclo ${ativo ? 'ativa' : 'desativada'} para ${d.nome}.`, 'success');
  _cqEsterDraft = null;
  _cqEsterAtualizarResumosUnidade();
  if (_cqSub === 'lancar' && _cqTabAtiva()) cqRender();
  return true;
}

// Seção do formulário da unidade: autoclaves com indicadores ou ficha configurada + seletor para as demais
function _cqEsterUnidadeHTML(u, grupos) {
  if (!u || !grupos.length) return '';
  const rel = grupos.filter(g => _cqEsterCfgRaw(u, g.key) || _cqEsterTemIndicadores(g.testes));
  const outros = grupos.filter(g => !rel.includes(g));
  return `<div class="form-section"><div class="form-section-title">${CQ_ICO.clock}Ciclos de esterilização (autoclaves)</div>
    <div class="cq-nota">Ficha do ciclo por equipamento: lote da carga, programa, tempo, temperatura, pressão e pacotes em cada corrida (RDC 1002/2025, art. 91). Salva na hora, independente do botão Salvar da área.</div>
    ${rel.length ? `<div class="cq-membros">${rel.map(g => `<div class="cq-membro"><span>${_cqEsc(g.nome)}<span class="cq-muted cq-un-ester-st" data-k="${_cqEsc(g.key)}"> ${_cqEsc(_cqEsterRotuloUn(u, g.key))}</span></span>
      <button type="button" class="btn btn-outline btn-sm" data-k="${_cqEsc(g.key)}" onclick="cqEsterConfigForm('${u}', this.dataset.k)">Configurar</button></div>`).join('')}</div>` : ''}
    ${outros.length ? `<div class="form-row" style="margin-top:8px;"><div class="form-field"><select id="cq-un-ester-outro" class="field-select"><option value="">Outro equipamento…</option>${outros.map(g => `<option value="${_cqEsc(g.key)}">${_cqEsc(g.nome)}</option>`).join('')}</select></div>
      <div class="form-field" style="flex:0;"><button type="button" class="btn btn-outline btn-sm" onclick="const k=document.getElementById('cq-un-ester-outro').value;if(k)cqEsterConfigForm('${u}',k)">Configurar</button></div></div>` : ''}
  </div>`;
}
function _cqEsterRotuloUn(u, key) {
  const c = _cqEsterCfgRaw(u, key);
  return !c ? '· ficha não configurada' : `· ficha ${c.ativo ? 'ativa' : 'desativada'} · ${_cqEsterProgramas(c).length} programa(s)`;
}
function _cqEsterAtualizarResumosUnidade() {
  if (!_cqUnFormId) return;
  document.querySelectorAll('#cq-drawer .cq-un-ester-st').forEach(el => { el.textContent = ' ' + _cqEsterRotuloUn(_cqUnFormId, el.dataset.k); });
}

// ── FICHA NO LANÇAMENTO ──────────────────────────────────────
function _cqEsterLancCfg() { return _cqLanc?.grupo ? _cqEsterCfg(_cqLanc.u, _cqLanc.grupo) : null; }
function _cqEsterVazio(programaId) {
  return { modo: '', programaId: programaId || '', lote: '', numEquip: '', temp: '', tempo: '', pressao: '', pacotes: '', vinc: '', incubIni: '', incubTemp: '', dhCiclo: '' };
}
function _cqEsterEstado() {
  if (!_cqLanc.ciclo) _cqLanc.ciclo = _cqEsterVazio();
  return _cqLanc.ciclo;
}
// Cópia gravável no rascunho (sem a lista de ciclos carregada)
function _cqEsterRascunho() {
  if (!_cqLanc?.ciclo) return null;
  const { recentes, carregando, loteGerando, loteFalhou, numPrevisto, numCarregando, etqNumImpresso, ...s } = _cqLanc.ciclo;
  return s;
}
function _cqEsterFalhasLanc() {
  const cfg = _cqEsterLancCfg();
  const s = _cqLanc?.ciclo;
  if (!cfg || !s || s.modo !== 'novo') return [];
  const p = _cqEsterProgramas(cfg).find(x => x.id === s.programaId);
  return p ? _cqEsterFalhas(p, cfg.unPressao, { temp: _cqEsterNum(s.temp), tempo: _cqEsterNum(s.tempo), pressao: _cqEsterNum(s.pressao) }) : [];
}

function _cqEsterLancHTML() {
  const cfg = _cqEsterLancCfg();
  if (!cfg) return _cqEsterDicaHTML();
  const s = _cqEsterEstado();
  const progs = _cqEsterProgramas(cfg);
  if (!progs.some(p => p.id === s.programaId)) s.programaId = progs.length === 1 ? progs[0].id : '';
  const cfgBtn = _cqCan('configurar') ? `<button type="button" class="btn btn-outline btn-sm cq-ester-cfg" data-k="${_cqEsc(_cqLanc.grupo)}" title="Programas, lote da carga e nº do ciclo deste equipamento" onclick="cqEsterConfigForm('${_cqLanc.u}', this.dataset.k)">${CQ_ICO_ESTER_CFG} Configurar programas</button>` : '';
  if (s.recentes === undefined) _cqEsterCarregarRecentes();
  // Padrão: o ciclo pendente (em análise) mais recente; sem pendentes, um ciclo novo
  if (!s.modo && s.recentes !== undefined && !s.carregando) _cqEsterModoPadrao(s);
  const head = `<div class="cq-ester-head"><span class="cq-ester-tit">${CQ_ICO.clock} Ciclo de esterilização</span>
      <span class="cq-muted">RDC 1002/2025, art. 91</span>
      <span class="cq-ester-acoes">${cfgBtn}${s.modo === 'novo' ? _cqEsterEtqBtnHTML() : ''}</span></div>`;
  if (!s.modo) return `<div class="cq-ester" id="cq-l-ester">${head}<div class="cq-vazio-p">Carregando ciclos deste equipamento…</div></div>`;
  const topo = `<div class="cq-esv-topo">
      <div class="form-field cq-esv-campo"><label class="field-label">Ciclo <span class="required">*</span></label>${_cqEsterSeletorHTML(s)}</div>
      ${s.modo === 'vinculado' ? _cqEsterVincResumoHTML(s)
        : `<div class="cq-esv-resumo vazio">${CQ_ICO.info}<span>Ciclo novo: preencha a ficha abaixo. Pode publicar <b>sem testes</b> — o ciclo fica <b>em análise</b> até os indicadores serem aprovados.</span></div>`}
    </div>`;
  if (s.modo === 'vinculado') return `<div class="cq-ester" id="cq-l-ester">${head}${topo}</div>`;
  const p = progs.find(x => x.id === s.programaId);
  if (!s.dhCiclo) s.dhCiclo = _cqEsterDHCicloLanc();
  const campoNum = (c, rot, esp) => `<div class="form-field"><label class="field-label">${rot} <span class="required">*</span></label>
      <input type="text" inputmode="decimal" class="field-input" id="cq-es-${c}" value="${_cqEsc(s[c])}" oninput="cqEsterCampo('${c}',this.value)" autocomplete="off">
      <span class="cq-ester-esp">${p ? 'Especificação: ' + _cqEsc(esp) : 'Escolha o programa'}</span></div>`;
  const loteAuto = cfg.loteModo === 'auto', numAuto = cfg.cicloModo === 'auto';
  if (s.recentes === undefined) _cqEsterCarregarRecentes();   // materiais já publicados neste equipamento
  if (loteAuto && !s.lote && !s.loteGerando && !s.loteFalhou) setTimeout(() => cqEsterGerarLote(true), 0);
  if (numAuto && s.numPrevisto === undefined) _cqEsterCarregarNumPrevisto();
  const travado = (txt, rot) => `<div class="cq-es-auto" title="${_cqEsc(rot)}">${CQ_ICO.repeat}<span>${txt}</span><span class="cq-es-auto-tag">auto</span></div>`;
  const campoLote = loteAuto
    ? travado(s.lote ? _cqEsc(s.lote) : s.loteFalhou ? `<a href="#" class="cq-link" onclick="cqEsterGerarLote(true);return false;">Não gerado — tentar de novo</a>` : '<span class="cq-muted">Gerando…</span>', 'Lote gerado automaticamente para este ciclo')
    : `<div class="cq-ester-lote"><input type="text" class="field-input" id="cq-es-lote" maxlength="40" value="${_cqEsc(s.lote)}" placeholder="${_cqEsc((cfg.prefixo || 'AC') + '-AAAAMMDD-NN')}" oninput="cqEsterCampo('lote',this.value)" autocomplete="off">
          <button type="button" class="btn btn-outline btn-sm" title="Gera o menor número do dia ainda não publicado" onclick="cqEsterGerarLote()">Gerar</button></div>`;
  const campoNumCiclo = numAuto
    ? `<span id="cq-es-numauto">${travado(s.numPrevisto ? `nº ${_cqEsc(s.numPrevisto)}` : '<span class="cq-muted">…</span>', 'Contador do sistema: confirmado ao publicar a corrida')}</span>`
    : `<input type="text" class="field-input" maxlength="20" value="${_cqEsc(s.numEquip)}" oninput="cqEsterCampo('numEquip',this.value)" placeholder="Contador do display/impressão" autocomplete="off">`;
  return `<div class="cq-ester" id="cq-l-ester">${head}${topo}
    <div class="cq-ester-grid">
      <div class="form-field"><label class="field-label">Programa <span class="required">*</span></label>
        <select class="field-select" onchange="cqEsterProg(this.value)"><option value="">— Selecione —</option>${progs.map(x => `<option value="${x.id}" ${x.id === s.programaId ? 'selected' : ''}>${_cqEsc(x.nome)}</option>`).join('')}</select>
        ${!progs.length ? '<span class="cq-ester-esp cq-txt-vermelho">Nenhum programa cadastrado</span>' : ''}</div>
      <div class="form-field"><label class="field-label">Lote da carga <span class="required">*</span></label>
        ${campoLote}
        <span class="cq-ester-esp">${loteAuto ? 'Automático por ciclo; ' : 'O mesmo da etiqueta dos pacotes; '}único no serviço.</span></div>
      <div class="form-field"><label class="field-label">Nº do ciclo no equipamento</label>
        ${campoNumCiclo}
        ${numAuto ? '<span class="cq-ester-esp">Automático: confirmado ao publicar a corrida.</span>' : ''}</div>
      ${_cqEsterValCampoHTML(s, p)}
    </div>
    <div class="cq-ester-grid">
      <div class="form-field"><label class="field-label">Data/hora do ciclo <span class="required">*</span></label>
        <input type="datetime-local" class="field-input" id="cq-es-dhciclo" value="${_cqEsc(s.dhCiclo)}" onblur="if(this.value!==this.defaultValue){this.defaultValue=this.value;cqEsterCampo('dhCiclo',this.value,true)}" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">
        <span class="cq-ester-esp">Início do ciclo na autoclave</span></div>
      ${campoNum('temp', 'Temperatura de esterilização (°C)', _cqEsterEspTxt(p, 'temp', cfg.unPressao))}
      ${campoNum('tempo', 'Tempo de esterilização (min)', _cqEsterEspTxt(p, 'tempo', cfg.unPressao))}
      ${campoNum('pressao', `Pressão (${_cqEsc(cfg.unPressao || 'kgf/cm²')})`, _cqEsterEspTxt(p, 'pressao', cfg.unPressao))}
    </div>
    <div class="form-field"><label class="field-label">Pacotes esterilizados <span class="required">*</span> <span class="cq-es-npac" id="cq-es-npac">${_cqEsc(_cqEsterPacResumo(s.pacotes))}</span></label>
      ${_cqEsterPacHTML(s)}</div>
    <div id="cq-es-status"></div>
  </div>`;
}

// Leitura do indicador biológico: escolhe o ciclo já registrado (outra corrida) deste equipamento
// Ciclos do seletor: em análise (sem limite de tempo) e os demais dos últimos dias
function _cqEsterCiclosLista(s) {
  const dh = _cqLanc.dataHora || _cqNowLocal();
  const todos = _cqArr(s.recentes).filter(r => r.dataHora <= dh);
  return {
    pend: todos.filter(r => r.ciclo.status === 'em_analise'),
    outros: todos.filter(r => r.ciclo.status !== 'em_analise' && (_cqEsterHoras(r.dataHora, dh) ?? 0) <= CQ_ESTER_DIAS_VINCULO * 24),
  };
}
function _cqEsterModoPadrao(s) {
  const { pend } = _cqEsterCiclosLista(s);
  if (pend.length) { s.modo = 'vinculado'; s.vinc = `${pend[0].mes}|${pend[0].key}`; } else s.modo = 'novo';
}
function _cqEsterCicloSel(s) {
  if (s.modo !== 'vinculado') return null;
  const { pend, outros } = _cqEsterCiclosLista(s);
  const o = [...pend, ...outros].find(r => `${r.mes}|${r.key}` === s.vinc) || null;
  if (s.vinc && !o) s.vinc = '';
  return o;
}
function _cqEsterSeletorHTML(s) {
  const dh = _cqLanc.dataHora || _cqNowLocal();
  const { pend, outros } = _cqEsterCiclosLista(s);
  const novo = s.modo === 'novo';
  const o = _cqEsterCicloSel(s);
  const ha = r => {
    const h = _cqEsterHoras(r.dataHora, dh);
    return h === null ? '' : h < 1 ? 'há menos de 1 h' : h < 48 ? `há ${Math.round(h)} h` : `há ${Math.round(h / 24)} dias`;
  };
  const dot = r => ({ em_analise: 'pend', reprovado: 'fora' }[r.ciclo.status] || (r.ciclo.conforme === false ? 'fora' : 'ok'));
  const item = r => {
    const v = `${r.mes}|${r.key}`;
    const busca = `${r.ciclo.loteCarga} ${r.ciclo.programa?.nome || ''} ${r.numero} ${_cqFmtDH(_cqEsterDHC(r))}`.toLowerCase();
    return `<button type="button" role="option" aria-selected="${v === s.vinc && !novo}" class="cq-esv-item${v === s.vinc && !novo ? ' sel' : ''}" data-busca="${_cqEsc(busca)}" onclick="cqEsterVinc('${_cqEsc(v)}')">
        <span class="cq-esv-dot ${dot(r)}"></span>
        <span class="cq-esv-item-txt"><b>${_cqEsc(r.ciclo.loteCarga)}</b><small>${_cqFmtDH(_cqEsterDHC(r))} · ${_cqEsc(r.ciclo.programa?.nome || '—')}</small></span>
        <span class="cq-esv-item-dir">${_cqEsterStBadge(r.ciclo)}<small>corrida ${_cqEsc(r.numero)} · ${ha(r)}</small></span>
      </button>`;
  };
  const grupo = (tit, lista) => (lista.length ? `<div class="cq-esv-grupo">${tit}</div>${lista.map(item).join('')}` : '');
  const n = pend.length + outros.length;
  const pop = `<div class="cq-esv-pop" id="cq-esv-pop" role="listbox" aria-label="Ciclos deste equipamento">
      <div class="cq-esv-pop-head"><b>Ciclos deste equipamento</b><span>${n}</span></div>
      ${n > 5 ? `<div class="cq-esv-busca">${CQ_ICO.busca}<input type="text" placeholder="Buscar lote, programa ou corrida" oninput="cqEsterVincBuscar(this.value)" autocomplete="off"></div>` : ''}
      <div class="cq-esv-lista">
        <button type="button" class="cq-esv-item cq-esv-item-novo${novo ? ' sel' : ''}" onclick="cqEsterNovoCiclo()">
          <span class="cq-esv-novo-ico">${CQ_ICO.plus}</span>
          <span class="cq-esv-item-txt"><b>Novo ciclo</b><small>Preencher a ficha de um ciclo novo</small></span></button>
        ${grupo(`Em análise · ${pend.length}`, pend)}
        ${grupo(`Conformes e reprovados · últimos ${CQ_ESTER_DIAS_VINCULO} dias`, outros)}
        <div class="cq-esv-vazio" id="cq-esv-semres" hidden>Nenhum ciclo encontrado</div>
      </div>
    </div>`;
  const botao = `<button type="button" class="cq-esv-btn${novo ? ' novo' : o ? '' : ' vazio'}" id="cq-esv-btn" aria-haspopup="listbox" aria-expanded="false" onclick="cqEsterVincPop()">
      <span class="cq-esv-btn-ico">${novo ? CQ_ICO.plus : CQ_ICO.clock}</span>
      <span class="cq-esv-btn-txt">${novo
        ? `<b>Novo ciclo</b><small>Ficha abaixo · registrado ao publicar a corrida</small>`
        : o ? `<b>${_cqEsc(o.ciclo.loteCarga)} ${_cqEsterStBadge(o.ciclo)}</b><small>${_cqFmtDH(_cqEsterDHC(o))} · corrida ${_cqEsc(o.numero)}</small>`
        : `<b>Selecione o ciclo</b><small>${pend.length} em análise · ${outros.length} recente(s)</small>`}</span>
      <svg class="cq-esv-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
    </button>`;
  return `<div class="cq-esv-linha"><div class="cq-esv-wrap" id="cq-esv-wrap">${botao}${pop}</div>
    ${novo ? '' : `<button type="button" class="btn btn-outline cq-esv-novo" onclick="cqEsterNovoCiclo()" title="Registrar um ciclo novo">${CQ_ICO.plus} Novo ciclo</button>`}</div>`;
}
// Ciclo escolhido: resumo ao lado do seletor
function _cqEsterVincResumoHTML(s) {
  const o = _cqEsterCicloSel(s);
  if (!o) return `<div class="cq-esv-resumo vazio">${CQ_ICO.info}<span>Escolha o ciclo: os testes desta corrida entram nele e definem se fica conforme.</span></div>`;
  const fato = (rot, val) => `<div class="cq-esv-fato"><span>${rot}</span><b>${val}</b></div>`;
  const faltam = o.ciclo.status === 'em_analise' ? _cqEsterFaltam({ ...o, testes: o.testes }) : [];
  return `<div class="cq-esv-resumo">
      ${fato('Programa', _cqEsc(o.ciclo.programa?.nome || '—'))}
      ${fato('Operador', _cqEsc(o.operadorNome || '—'))}
      ${fato('Parâmetros', `${_cqEsterN(o.ciclo.temperatura)} °C · ${_cqEsterN(o.ciclo.tempo)} min · ${_cqEsterN(o.ciclo.pressao)} ${_cqEsc(o.ciclo.programa?.unPressao || '')}`)}
      ${fato('Pacotes', String(_cqArr(o.ciclo.pacotes).length))}
      ${faltam.length ? fato('Aguardando', _cqEsc(faltam.join(', '))) : ''}
      <div class="cq-esv-fato"><span>Situação</span>${_cqEsterStBadge(o.ciclo)}</div>
    </div>`;
}
// Incubação do indicador biológico: fica na linha do próprio teste biológico da grade (o primeiro
// realizado), no ciclo novo (preenchido de uma vez) e na leitura de um ciclo já registrado.
// Os dados ficam no ciclo da corrida (ciclo.incubacao).
// Data/hora do ciclo a que a incubação se refere ('' = sem ciclo definido)
function _cqEsterIncubRef(s) {
  if (s?.modo === 'novo') return _cqEsterDHCicloLanc();
  const o = s ? _cqEsterCicloSel(s) : null;
  return o ? _cqEsterDHC(o) : '';
}
function _cqEsterIncubAlvo() {
  const s = _cqLanc?.ciclo;
  if (!s || !_cqEsterIncubRef(s) || typeof _cqLancTestes !== 'function') return null;
  return _cqLancTestes().find(t => !_cqLanc.linhas[t.id]?.nr && _cqEsterEhBiologico(t))?.id || null;
}
// Chave do conteúdo: muda com o ciclo escolhido ou a data/hora do ciclo (redesenha a incubação)
function _cqEsterIncubChave(s) { return `${s.modo}|${s.vinc || ''}|${_cqEsterIncubRef(s)}`; }
// Espaço na célula do teste (cq-lancamento.js); preenchido só no teste alvo
function _cqEsterIncubSlotHTML(t) {
  if (!_cqLanc?.ciclo || !_cqEsterEhBiologico(t)) return '';
  const k = _cqEsterIncubAlvo() === t.id ? _cqEsterIncubChave(_cqLanc.ciclo) : '';
  return `<div class="cq-g-incub" data-t="${t.id}" data-k="${_cqEsc(k)}">${k ? _cqEsterIncubHTML(_cqLanc.ciclo) : ''}</div>`;
}
function _cqEsterIncubHTML(s) {
  const ref = _cqEsterIncubRef(s);
  if (!ref) return '';
  const ib = _cqEsterIncubCfg(_cqEsterIncubAn());
  const dh = _cqLanc.dataHora || _cqNowLocal();
  const atraso = s.incubIni ? _cqEsterHoras(ref, s.incubIni) : null;
  const tarde = atraso !== null && atraso > ib.horas;
  return `<div class="cq-g-incub-tit">${CQ_ICO.beaker} Incubação</div>
    <div class="cq-g-incub-campos">
      <label class="cq-g-incub-f"><span>Início</span>
        <input type="datetime-local" class="field-input${tarde ? ' cq-es-fora' : ''}" value="${_cqEsc(s.incubIni)}" min="${_cqEsc(ref)}" max="${_cqEsc(dh)}" onblur="if(this.value!==this.defaultValue){this.defaultValue=this.value;cqEsterIncubIni(this.value)}" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">
        <small class="${tarde ? 'cq-txt-vermelho' : ''}">${atraso !== null ? `${_cqEsterN(Math.round(atraso * 10) / 10)} h após o ciclo${tarde ? ` — bula: até ${_cqEsterN(ib.horas)} h` : ''}` : `Até ${_cqEsterN(ib.horas)} h após o ciclo (bula)`}</small></label>
      <label class="cq-g-incub-f cq-g-incub-t"><span>Incubadora</span>
        <span class="cq-g-incub-un"><input type="text" inputmode="decimal" class="field-input" id="cq-es-incubtemp" value="${_cqEsc(s.incubTemp)}" oninput="cqEsterIncubTemp(this.value)" placeholder="57" autocomplete="off"><i>°C</i></span>
        <small id="cq-es-incubtemp-esp">${_cqEsterIncubTempTxt(s, ib)}</small></label>
    </div>`;
}
function _cqEsterIncubTempTxt(s, ib) {
  const v = String(s.incubTemp || '').trim() ? _cqEsterNum(s.incubTemp) : null;
  const faixa = ib.tmin != null ? `${_cqEsterN(ib.tmin)} a ${_cqEsterN(ib.tmax)} °C` : '';
  if (String(s.incubTemp || '').trim() && v === null) return '<span class="cq-txt-vermelho">Valor inválido</span>';
  if (_cqEsterTempForaFaixa(ib, v)) return `<span class="cq-txt-vermelho">Fora da bula (${faixa})</span>`;
  return faixa ? `Bula: ${faixa}` : 'Faixa não configurada';
}
function cqEsterIncubTemp(v) {
  const s = _cqEsterEstado();
  s.incubTemp = v;
  _cqRascunhoSalvar();
  const ib = _cqEsterIncubCfg(_cqEsterIncubAn());
  const n = String(v || '').trim() ? _cqEsterNum(v) : null;
  document.getElementById('cq-es-incubtemp')?.classList.toggle('cq-es-fora', (String(v || '').trim() && n === null) || _cqEsterTempForaFaixa(ib, n));
  const esp = document.getElementById('cq-es-incubtemp-esp');
  if (esp) esp.innerHTML = _cqEsterIncubTempTxt(s, ib);
}
function cqEsterIncubIni(v) {
  if (!_cqLanc?.ciclo) return;
  _cqLanc.ciclo.incubIni = v;
  _cqRascunhoSalvar();
  _cqEsterIncubSync(true);
}
// Testes ou ciclo escolhido mudaram: leva a incubação para o teste biológico certo
function _cqEsterIncubSync(forcar) {
  if (!_cqLanc?.ciclo) return;
  const alvo = _cqEsterIncubAlvo(), k = alvo ? _cqEsterIncubChave(_cqLanc.ciclo) : '';
  document.querySelectorAll('.cq-g-incub').forEach(el => {
    const kk = el.dataset.t === alvo ? k : '';
    if (!forcar && el.dataset.k === kk) return;   // não redesenha a cada tecla
    el.dataset.k = kk;
    el.innerHTML = kk ? _cqEsterIncubHTML(_cqLanc.ciclo) : '';
  });
}

// Popover dos ciclos registrados
let _cqEsvBound = false;
function cqEsterVincPop() {
  const pop = document.getElementById('cq-esv-pop'), btn = document.getElementById('cq-esv-btn');
  if (!pop || !btn) return;
  const abrir = !pop.classList.contains('open');
  pop.classList.toggle('open', abrir);
  btn.setAttribute('aria-expanded', abrir);
  if (abrir) {
    pop.querySelector('.cq-esv-busca input')?.focus();
    pop.querySelector('.cq-esv-item.sel')?.scrollIntoView({ block: 'nearest' });
  }
  if (_cqEsvBound) return;
  _cqEsvBound = true;
  const fechar = () => { document.getElementById('cq-esv-pop')?.classList.remove('open'); document.getElementById('cq-esv-btn')?.setAttribute('aria-expanded', 'false'); };
  document.addEventListener('mousedown', e => { if (!e.target.closest('#cq-esv-wrap')) fechar(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('cq-esv-pop')?.classList.contains('open')) { e.stopPropagation(); fechar(); document.getElementById('cq-esv-btn')?.focus(); }
  }, true);
}
function cqEsterVincBuscar(q) {
  const t = String(q || '').trim().toLowerCase();
  let n = 0;
  document.querySelectorAll('#cq-esv-pop .cq-esv-item[data-busca]').forEach(b => { const ok = !t || b.dataset.busca.includes(t); b.hidden = !ok; if (ok) n++; });
  document.querySelectorAll('#cq-esv-pop .cq-esv-grupo').forEach(g => { g.hidden = !!t; });
  const sem = document.getElementById('cq-esv-semres');
  if (sem) sem.hidden = n > 0;
}

async function _cqEsterCarregarRecentes() {
  const lanc = _cqLanc;
  const s = lanc?.ciclo;
  if (!s || s.carregando) return;
  s.carregando = true;
  try {
    const meses = CQEngine.mesesAnteriores(CQEngine.mesDe(_cqNowLocal()), 2);
    const corridas = (await Promise.all(meses.map(m => cqCarregarCorridasMes(lanc.u, m)))).flatMap(o => Object.values(o));
    // Ciclos em análise mais antigos que a janela carregada (índice dos pendentes)
    const faltam = Object.entries((cqState.indices[lanc.u] || {}).ciclosPendentes || {})
      .filter(([k, p]) => p?.grupo === lanc.grupo && !corridas.some(c => c.key === k));
    corridas.push(...(await Promise.all(faltam.map(([k, p]) => cqCarregarCorrida(lanc.u, p.mes || CQEngine.mesDe(k), k)))).filter(Boolean));
    s.recentes = corridas.filter(c => c.ciclo?.loteCarga && !c.ciclo.vinculo && _cqEsterGrupoDaCorrida(c) === lanc.grupo)
      .sort((a, b) => (b.dataHora || '').localeCompare(a.dataHora || '')).slice(0, 80)
      .map(c => ({ key: c.key, mes: c.mes, numero: c.numero, dataHora: c.dataHora, operadorNome: c.operadorNome || '', ciclo: c.ciclo, testes: c.testes || {} }));
  } catch (e) {
    console.error('[cq] ciclos de esterilização', e);
    s.recentes = [];
  }
  s.carregando = false;
  if (_cqLanc !== lanc) return;
  if (!s.modo || s.modo === 'vinculado') { _cqEsterRedesenhar(); return; }
  // Novo ciclo: atualiza só o seletor (não tira o foco da ficha)
  const sel = document.querySelector('#cq-l-ester .cq-esv-linha');
  if (sel) sel.outerHTML = _cqEsterSeletorHTML(s);
  if (document.getElementById('cq-es-pac-pop')?.classList.contains('open')) cqEsterPacSug();
}

// Dica quando o equipamento tem indicadores mas a ficha não foi ativada
function _cqEsterDicaHTML() {
  const g = _cqLanc?.grupo ? _cqGruposLanc(_cqLanc.u).find(x => x.key === _cqLanc.grupo) : null;
  if (!g || _cqEsterCfgRaw(_cqLanc.u, g.key) || !_cqEsterTemIndicadores(g.testes)) return '<div id="cq-l-ester"></div>';
  return `<div id="cq-l-ester" class="cq-alerta-box cq-info-box">${CQ_ICO.info} Este equipamento tem indicadores de esterilização. A RDC 1002/2025 (art. 91) exige registrar, por carga, o lote, os pacotes e o tempo, a temperatura e a pressão.
    ${_cqCan('configurar') ? `<a href="#" class="cq-link" data-k="${_cqEsc(g.key)}" onclick="cqEsterConfigForm('${_cqLanc.u}', this.dataset.k);return false;">Ativar a ficha do ciclo</a>` : 'Peça a quem configura o CQ para ativar a ficha do ciclo.'}</div>`;
}

function _cqEsterRedesenhar() {
  const el = document.getElementById('cq-l-ester');
  if (!el || !_cqLanc) return;
  el.outerHTML = _cqEsterLancHTML();
  _cqEsterAtualizar();
}

// Atualiza a conformidade sem redesenhar os campos (mantém o foco) e reavalia a grade
function _cqEsterAtualizar() {
  const cfg = _cqEsterLancCfg();
  const s = _cqLanc?.ciclo;
  const st = document.getElementById('cq-es-status');
  if (cfg && s && s.modo === 'novo') {
    const p = _cqEsterProgramas(cfg).find(x => x.id === s.programaId);
    const vals = { temp: _cqEsterNum(s.temp), tempo: _cqEsterNum(s.tempo), pressao: _cqEsterNum(s.pressao) };
    Object.entries(vals).forEach(([c, v]) => {
      const inp = document.getElementById('cq-es-' + c);
      if (!inp) return;
      const txt = String(s[c] || '').trim();
      inp.classList.toggle('cq-es-fora', !!txt && (v === null || !!_cqEsterForaCampo(p, c, v, cfg.unPressao)));
    });
    const npac = document.getElementById('cq-es-npac');
    if (npac) npac.textContent = _cqEsterPacResumo(s.pacotes);
    if (st) {
      const falhas = _cqEsterFalhasLanc();
      const invalidos = Object.entries(vals).filter(([c, v]) => String(s[c] || '').trim() && v === null).length;
      const completo = p && Object.values(vals).every(v => v !== null);
      st.className = 'cq-ester-st ' + (falhas.length || invalidos ? 'fora' : completo ? 'ok' : 'pend');
      st.innerHTML = invalidos ? 'Valor inválido em um dos parâmetros físicos.'
        : falhas.length ? `${CQ_ICO.alerta} Fora da especificação do programa: ${_cqEsc(falhas.join('; '))}. Os indicadores desta corrida serão rejeitados — não libere os pacotes; reprocesse a carga.`
        : completo ? `${CQ_ICO.check} Parâmetros físicos dentro da especificação do programa.`
        : 'Informe tempo, temperatura e pressão lidos no registro do equipamento (RDC 1002, art. 91, VII).';
    }
  }
  _cqEsterEtqBtnAtualizar();
  if (typeof _cqGradeAtualizarTudo === 'function' && document.getElementById('cq-grade')) _cqGradeAtualizarTudo();
}

function cqEsterNovoCiclo() {
  if (!_cqLanc) return;
  const s = _cqEsterEstado();
  s.modo = 'novo';
  s.vinc = '';
  _cqRascunhoSalvar();
  _cqEsterRedesenhar();
}
function cqEsterProg(v) {
  const s = _cqEsterEstado();
  s.programaId = v;
  delete s.valAtiva; delete s.valDias;   // volta ao padrão do novo programa
  _cqRascunhoSalvar();
  _cqEsterRedesenhar();
}

// ── VALIDADE DA ESTERILIZAÇÃO ──
// Validade: ligada ou não pelo programa; os dias vêm do programa e podem ser ajustados no lançamento (s.valDias)
function _cqEsterValEstado(s, p) {
  // Ligada ou não: definido pelo programa (Configurar programas)
  const ativa = p ? p.validadeAtiva !== false : true;
  const diasTxt = s.valDias ?? (p?.validadeDias != null ? String(p.validadeDias) : '');
  return { ativa, diasTxt, dias: _cqEsterDiasOk(diasTxt) };
}
function _cqEsterValDataTxt(s, p) {
  const v = _cqEsterValEstado(s, p);
  if (!p) return '';
  if (!v.ativa) return 'Programa sem validade';
  const d = v.dias ? _cqEsterValData(_cqEsterDHCicloLanc(), v.dias) : '';
  return d ? `Válido até ${_cqFmtData(d)}` : 'Informe os dias (1 a 3650)';
}
function _cqEsterValCampoHTML(s, p) {
  const v = _cqEsterValEstado(s, p);
  const padrao = p ? (p.validadeAtiva === false ? 'desligada' : `${p.validadeDias ?? '—'} dia(s)`) : '';
  return `<div class="form-field"><label class="field-label">Validade da esterilização ${v.ativa && p ? '<span class="required">*</span>' : ''}</label>
      <div class="cq-es-val${v.ativa && p ? '' : ' off'}${v.ativa && p && !v.dias ? ' erro' : ''}" id="cq-es-val">
        <input type="number" class="cq-es-val-dias" id="cq-es-valdias" min="1" max="3650" step="1" value="${_cqEsc(v.diasTxt)}" ${v.ativa && p ? '' : 'disabled'} oninput="cqEsterValDias(this.value)" aria-label="Validade em dias">
        <span class="cq-es-val-un">dias</span>
        <span class="cq-es-val-data" id="cq-es-valdata">${_cqEsc(_cqEsterValDataTxt(s, p))}</span>
      </div>
      <span class="cq-ester-esp">${p ? `Padrão do programa: ${_cqEsc(padrao)}` : 'Escolha o programa'}</span></div>`;
}
function _cqEsterLancProg() {
  const cfg = _cqEsterLancCfg(), s = _cqLanc?.ciclo;
  return cfg && s ? _cqEsterProgramas(cfg).find(x => x.id === s.programaId) : null;
}
function cqEsterValDias(v) {
  const s = _cqEsterEstado(), p = _cqEsterLancProg();
  s.valDias = v;
  _cqRascunhoSalvar();
  const box = document.getElementById('cq-es-val'), dt = document.getElementById('cq-es-valdata');
  if (dt) dt.textContent = _cqEsterValDataTxt(s, p);
  if (box) box.classList.toggle('erro', !_cqEsterValEstado(s, p).dias);
  _cqEsterEtqBtnAtualizar();
}
function cqEsterVinc(v) { const s = _cqEsterEstado(); s.modo = 'vinculado'; s.vinc = v; _cqRascunhoSalvar(); _cqEsterRedesenhar(); }
function cqEsterCampo(c, v, redesenhar) {
  if (!_cqLanc) return;
  _cqEsterEstado()[c] = v;
  _cqRascunhoSalvar();
  if (redesenhar) _cqEsterRedesenhar(); else _cqEsterAtualizar();
}

async function cqEsterGerarLote(auto) {
  const cfg = _cqEsterLancCfg();
  if (!cfg) return;
  const lanc = _cqLanc;
  const s = _cqEsterEstado();
  if (auto && (s.loteGerando || (s.lote && !s.loteFalhou))) return;
  if (!_cqPodeGravar()) { if (auto) { s.loteFalhou = true; _cqEsterRedesenhar(); } return; }
  s.loteGerando = true;
  s.loteFalhou = false;
  // Menor número do dia ainda não publicado: gerar de novo não pula numeração (a unicidade é
  // garantida ao publicar, pela reserva do lote)
  const dia = (lanc.dataHora || _cqNowLocal()).slice(0, 10).replace(/-/g, '');
  const base = `${(cfg.prefixo || 'AC').toUpperCase()}-${dia}-`;
  let lote = null;
  try {
    for (let n = 1; n <= 999 && !lote; n++) {
      const cand = base + String(n).padStart(2, '0');
      if (!(await window.dbGet(_cqEsterCaminhoLote(lanc.u, cand)))) lote = cand;
    }
  } catch (e) { lote = null; }
  s.loteGerando = false;
  if (!lote) { s.loteFalhou = !!auto; showToast('Não foi possível gerar o lote. Verifique a conexão.', 'error'); if (_cqLanc === lanc) _cqEsterRedesenhar(); return; }
  if (_cqLanc !== lanc) return;
  s.lote = lote;
  _cqRascunhoSalvar();
  _cqEsterRedesenhar();
}

// Lote automático já publicado por outra estação: gera o próximo livre (a etiqueta, se impressa, deve ser refeita)
function _cqEsterLoteConflito() {
  const cfg = _cqEsterLancCfg(), s = _cqLanc?.ciclo;
  if (cfg?.loteModo !== 'auto' || !s || s.modo !== 'novo') return;
  s.lote = '';
  _cqRascunhoSalvar();
  _cqEsterRedesenhar();
}

// ── Nº DO CICLO AUTOMÁTICO ──
// Contador do sistema por equipamento: o próximo nº aparece como previsto no lançamento e é
// reservado ao publicar a corrida (devolvido se a gravação falhar).
function _cqEsterCaminhoNumCiclo(u, grupo) { return `${CQ_KEYS.seq}/${u}/ciclosEquip/${_cqChaveModoEquip(grupo)}`; }
async function _cqEsterCarregarNumPrevisto() {
  const lanc = _cqLanc, s = lanc?.ciclo;
  if (!s || s.numCarregando) return;
  s.numCarregando = true;
  let v = null;
  try { v = await window.dbLoad(_cqEsterCaminhoNumCiclo(lanc.u, lanc.grupo)); } catch (e) { v = null; }
  s.numCarregando = false;
  s.numPrevisto = (Number(v) || 0) + 1;
  if (_cqLanc !== lanc) return;
  const el = document.getElementById('cq-es-numauto');
  if (el) el.innerHTML = `<div class="cq-es-auto" title="Contador do sistema: confirmado ao publicar a corrida">${CQ_ICO.repeat}<span>nº ${_cqEsc(s.numPrevisto)}</span><span class="cq-es-auto-tag">auto</span></div>`;
  _cqEsterEtqBtnAtualizar();
}
async function _cqEsterReservarNumCiclo(u, grupo) {
  if (_cqEsterCfg(u, grupo)?.cicloModo !== 'auto') return null;
  const path = _cqEsterCaminhoNumCiclo(u, grupo);
  const n = await window.dbTransaction(path, v => (Number(v) || 0) + 1);
  if (!n) return false;
  return { n, desfazer: () => window.dbTransaction(path, v => (Number(v) === n ? n - 1 : undefined)) };
}

// ── PACOTES ESTERILIZADOS ──
// Lista de materiais com quantidade; gravada como linhas "2 × Pinça anatômica" (formato da ficha)
function _cqEsterPacItens(txt) {
  return _cqEsterPacotes(txt).map(l => { const m = /^(\d{1,3})\s*[×xX]\s+(.+)$/.exec(l); return m ? { qtd: Number(m[1]), nome: m[2].trim() } : { qtd: 1, nome: l }; });
}
function _cqEsterPacSerial(itens) { return itens.map(i => (i.qtd !== 1 ? `${i.qtd} × ${i.nome}` : i.nome)).join('\n'); }
function _cqEsterPacResumo(txt) {
  const it = _cqEsterPacItens(txt), tot = it.reduce((n, i) => n + i.qtd, 0), sem = it.filter(i => !i.qtd).length;
  return it.length ? `${tot} pacote${tot !== 1 ? 's' : ''}${it.length !== tot ? ` · ${it.length} ite${it.length !== 1 ? 'ns' : 'm'}` : ''}${sem ? ` · ${sem} sem quantidade` : ''}` : '';
}
// Itens ainda com quantidade 0 (vindos da lista de sugestões): impedem publicar e imprimir
function _cqEsterPacSemQtd(txt) { return _cqEsterPacItens(txt).filter(i => !i.qtd).map(i => i.nome); }
// Busca sem acentos, sinais e espaços: "pinca-anat" encontra "Pinça anatômica"
function _cqEsterPacNorm(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
// Destaca no nome original o trecho que casou com a busca normalizada
function _cqEsterPacMarca(nome, qn) {
  if (!qn) return _cqEsc(nome);
  let nn = '';
  const pos = [];
  [...nome].forEach((ch, i) => { const c = _cqEsterPacNorm(ch); for (const x of c) { nn += x; pos.push(i); } });
  const k = nn.indexOf(qn);
  if (k < 0) return _cqEsc(nome);
  const chars = [...nome], a = pos[k], b = pos[k + qn.length - 1] + 1;
  return `${_cqEsc(chars.slice(0, a).join(''))}<mark>${_cqEsc(chars.slice(a, b).join(''))}</mark>${_cqEsc(chars.slice(b).join(''))}`;
}
// Sugestões: materiais dos ciclos já publicados neste equipamento (últimos 2 meses), do mais usado ao menos usado
function _cqEsterPacHistorico() {
  const mapa = new Map();
  _cqArr((_cqEsPacAlvo || _cqLanc?.ciclo)?.recentes).forEach(r => {
    _cqEsterPacItens(_cqArr(r.ciclo?.pacotes).join('\n')).forEach(({ nome }) => {
      const k = nome.toLowerCase();
      const x = mapa.get(k) || { nome, n: 0, ultimo: '' };
      x.n++;
      if ((r.dataHora || '') > x.ultimo) { x.ultimo = r.dataHora || ''; x.nome = nome; }
      mapa.set(k, x);
    });
  });
  return [...mapa.values()].sort((a, b) => b.n - a.n || b.ultimo.localeCompare(a.ultimo));
}
let _cqEsPacIdx = -1;
let _cqEsPacBound = false;
// Lista de pacotes fora do lançamento (correção da ficha): { pacotes, recentes, alvo: true }
let _cqEsPacAlvo = null;
function _cqEsPacEst() { return _cqEsPacAlvo || _cqEsterEstado(); }
function cqEsterPacSug() {
  const pop = document.getElementById('cq-es-pac-pop'), inp = document.getElementById('cq-es-pac-nome');
  const s = _cqEsPacAlvo || _cqLanc?.ciclo;
  if (!pop || !inp || !s) return;
  const q = _cqEsterPacNorm(inp.value);
  const ja = new Set(_cqEsterPacItens(s.pacotes).map(x => _cqEsterPacNorm(x.nome)));
  const hist = _cqEsterPacHistorico();
  const lista = hist.filter(x => { const n = _cqEsterPacNorm(x.nome); return !ja.has(n) && (!q || n.includes(q)); }).slice(0, 30);
  const carregando = s.recentes === undefined || s.carregando;
  if (!lista.length && !(carregando && !q)) { _cqEsterPacSugFechar(); return; }
  _cqEsPacIdx = Math.min(_cqEsPacIdx, lista.length - 1);
  const marca = nome => _cqEsterPacMarca(nome, q);
  pop.innerHTML = `<div class="cq-es-pac-pop-head"><b>Já esterilizados neste equipamento</b>${lista.length ? `<span>${lista.length}</span>` : ''}</div>
    <div class="cq-es-pac-pop-lista" role="listbox">${carregando && !lista.length ? '<div class="cq-es-pac-pop-vazio">Carregando ciclos publicados…</div>'
      : lista.map((x, i) => `<button type="button" role="option" class="cq-es-pac-op${i === _cqEsPacIdx ? ' ativo' : ''}" data-nome="${_cqEsc(x.nome)}"
          onmousedown="event.preventDefault()" onclick="cqEsterPacEscolher(this.dataset.nome)">
          <span class="cq-es-pac-op-ico">${CQ_ICO.beaker}</span>
          <span class="cq-es-pac-op-txt"><b>${marca(x.nome)}</b><small>${x.n} ciclo${x.n !== 1 ? 's' : ''} · último ${_cqFmtDH(x.ultimo)}</small></span>
          <span class="cq-es-pac-op-add">${CQ_ICO.plus}</span>
        </button>`).join('')}</div>`;
  pop.classList.add('open');
  inp.setAttribute('aria-expanded', 'true');
  pop.querySelector('.cq-es-pac-op.ativo')?.scrollIntoView({ block: 'nearest' });
  if (_cqEsPacBound) return;
  _cqEsPacBound = true;
  document.addEventListener('mousedown', e => { if (!e.target.closest('.cq-es-pac-add')) _cqEsterPacSugFechar(); });
}
function _cqEsterPacSugFechar() {
  const pop = document.getElementById('cq-es-pac-pop');
  if (pop) { pop.classList.remove('open'); pop.innerHTML = ''; }
  document.getElementById('cq-es-pac-nome')?.setAttribute('aria-expanded', 'false');
  _cqEsPacIdx = -1;
}
function cqEsterPacEscolher(nome) {
  const inp = document.getElementById('cq-es-pac-nome');
  if (inp) inp.value = nome;
  cqEsterPacAdd(0);
}
// Setas navegam nas sugestões; Enter escolhe a destacada (ou adiciona o texto digitado); Esc fecha
function cqEsterPacTecla(e) {
  const pop = document.getElementById('cq-es-pac-pop');
  const ops = pop?.classList.contains('open') ? [...pop.querySelectorAll('.cq-es-pac-op')] : [];
  if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && ops.length) {
    e.preventDefault();
    _cqEsPacIdx = e.key === 'ArrowDown' ? (_cqEsPacIdx + 1) % ops.length : (_cqEsPacIdx <= 0 ? ops.length - 1 : _cqEsPacIdx - 1);
    ops.forEach((b, i) => b.classList.toggle('ativo', i === _cqEsPacIdx));
    ops[_cqEsPacIdx]?.scrollIntoView({ block: 'nearest' });
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    const op = ops[_cqEsPacIdx];
    if (op) cqEsterPacEscolher(op.dataset.nome); else cqEsterPacAdd();
    return;
  }
  if (e.key === 'Escape' && ops.length) { e.preventDefault(); e.stopPropagation(); _cqEsterPacSugFechar(); }
}
function _cqEsterPacHTML(s) {
  _cqEsPacAlvo = s?.alvo ? s : null;
  return `<div class="cq-es-pac">
      <div class="cq-es-pac-add">
        <span class="cq-es-pac-ico">${CQ_ICO.beaker}</span>
        <input type="text" id="cq-es-pac-nome" class="cq-es-pac-inp" maxlength="110" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false"
          placeholder="Material ou kit — ex.: Pinça anatômica" onfocus="cqEsterPacSug()" oninput="_cqEsPacIdx=-1;cqEsterPacSug()" onkeydown="cqEsterPacTecla(event)">
        <div class="cq-es-pac-pop" id="cq-es-pac-pop"></div>
        <input type="number" id="cq-es-pac-qtd" class="cq-es-pac-qtd" min="1" max="999" step="1" value="1" title="Quantidade" onkeydown="if(event.key==='Enter'){event.preventDefault();cqEsterPacAdd();}">
        <button type="button" class="btn btn-primary btn-sm cq-es-pac-btn" onclick="cqEsterPacAdd()">${CQ_ICO.plus} Adicionar</button>
      </div>
      <div class="cq-es-pac-lista" id="cq-es-pac-lista">${_cqEsterPacListaHTML(s)}</div>
    </div>`;
}
function _cqEsterPacListaHTML(s) {
  const it = _cqEsterPacItens(s.pacotes);
  if (!it.length) return `<div class="cq-es-pac-vazio">Nenhum pacote adicionado — digite o material acima e tecle Enter.</div>`;
  return it.map((x, i) => `<div class="cq-es-pac-item${x.qtd ? '' : ' semqtd'}" title="${x.qtd ? '' : 'Informe a quantidade (1 ou mais) para publicar a corrida'}">
      <span class="cq-es-pac-nome" title="${_cqEsc(x.nome)}">${_cqEsc(x.nome)}</span>
      <span class="cq-es-pac-step">
        <button type="button" title="Diminuir" onclick="cqEsterPacQtd(${i},-1)" ${x.qtd <= 1 ? 'disabled' : ''}>−</button>
        <input type="number" class="cq-es-pac-n" id="cq-es-pac-n-${i}" min="0" max="999" step="1" value="${x.qtd}" aria-label="Quantidade de ${_cqEsc(x.nome)}"
          onfocus="this.select()" onchange="cqEsterPacQtdSet(${i},this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();document.getElementById('cq-es-pac-nome')?.focus();}">
        <button type="button" title="Aumentar" onclick="cqEsterPacQtd(${i},1)">+</button>
      </span>
      <button type="button" class="cq-es-pac-rem" title="Remover" onclick="cqEsterPacRemover(${i})">${CQ_ICO.close}</button>
    </div>`).join('');
}
function _cqEsterPacGravar(itens) {
  const s = _cqEsPacEst();
  s.pacotes = _cqEsterPacSerial(itens);
  const lista = document.getElementById('cq-es-pac-lista');
  if (lista) lista.innerHTML = _cqEsterPacListaHTML(s);
  if (s.alvo) { const np = document.getElementById('cq-es-npac'); if (np) np.textContent = _cqEsterPacResumo(s.pacotes); return; }
  _cqRascunhoSalvar();
  _cqEsterAtualizar();
}
// qtdLista: item escolhido na lista de sugestões entra com quantidade 0 (a digitar)
function cqEsterPacAdd(qtdLista) {
  if (!_cqEsPacAlvo && !_cqLanc) return;
  const inp = document.getElementById('cq-es-pac-nome'), q = document.getElementById('cq-es-pac-qtd');
  const nome = String(inp?.value || '').trim().replace(/\s+/g, ' ').slice(0, 110);
  const qtd = qtdLista === 0 ? 0 : Math.min(999, Math.max(1, Math.round(Number(q?.value) || 1)));
  if (!nome) { inp?.focus(); return; }
  const itens = _cqEsterPacItens(_cqEsPacEst().pacotes);
  const n = _cqEsterPacNorm(nome);
  let idx = itens.findIndex(x => _cqEsterPacNorm(x.nome) === n);
  if (idx >= 0) itens[idx].qtd = Math.min(999, itens[idx].qtd + qtd);
  else {
    if (itens.length >= 200) { showToast('Limite de 200 itens por ciclo.', 'error'); return; }
    itens.push({ nome, qtd });
    idx = itens.length - 1;
  }
  _cqEsterPacGravar(itens);
  if (inp) inp.value = '';
  if (q) q.value = 1;
  _cqEsPacIdx = -1;
  if (qtdLista === 0 && !itens[idx].qtd) {
    // Quantidade a informar: foco direto no campo do item
    _cqEsterPacSugFechar();
    const ni = document.getElementById(`cq-es-pac-n-${idx}`);
    if (ni) { ni.focus(); ni.select(); }
    return;
  }
  inp?.focus();
  if (document.activeElement === inp) cqEsterPacSug(); else _cqEsterPacSugFechar();
}
function cqEsterPacQtd(i, d) {
  const itens = _cqEsterPacItens(_cqEsPacEst().pacotes);
  if (!itens[i]) return;
  itens[i].qtd = Math.min(999, Math.max(itens[i].qtd ? 1 : 0, itens[i].qtd + d));
  _cqEsterPacGravar(itens);
}
function cqEsterPacQtdSet(i, v) {
  const itens = _cqEsterPacItens(_cqEsPacEst().pacotes);
  if (!itens[i]) return;
  const n = Math.round(Number(String(v).replace(',', '.')));
  itens[i].qtd = Number.isFinite(n) ? Math.min(999, Math.max(0, n)) : 0;
  _cqEsterPacGravar(itens);
}
function cqEsterPacRemover(i) {
  const itens = _cqEsterPacItens(_cqEsPacEst().pacotes);
  itens.splice(i, 1);
  _cqEsterPacGravar(itens);
}

// Incubação: só com indicador biológico na corrida; guarda o prazo e a faixa usados na conferência
function _cqEsterIncubValidar(s, ref, dh) {
  if (!_cqEsterLancTemBI()) return { incubacao: null };
  if (s.incubIni && s.incubIni < ref) return { erro: 'O início da incubação não pode ser anterior ao ciclo.' };
  if (s.incubIni && s.incubIni > dh) return { erro: 'O início da incubação não pode ser posterior à corrida.' };
  const it = String(s.incubTemp || '').trim() ? _cqEsterNum(s.incubTemp) : null;
  if (String(s.incubTemp || '').trim() && it === null) return { erro: 'Temperatura da incubadora inválida.' };
  if (!s.incubIni && it === null) return { incubacao: null };
  const ib = _cqEsterIncubCfg(_cqEsterIncubAn());
  const atraso = s.incubIni ? Math.round(_cqEsterHoras(ref, s.incubIni) * 10) / 10 : null;
  return { incubacao: { inicio: s.incubIni || null, temperatura: it, horasAposCiclo: atraso,
    prazoHoras: ib.horas, faixa: ib.tmin != null ? { min: ib.tmin, max: ib.tmax } : null,
    foraPrazo: atraso !== null && atraso > ib.horas, foraFaixa: _cqEsterTempForaFaixa(ib, it) } };
}

// Valida a ficha ao salvar. Retorna { erro } ou { ciclo } (ciclo null quando o equipamento não usa a ficha)
function _cqEsterValidar(dh) {
  const cfg = _cqEsterLancCfg();
  if (!cfg) return { ciclo: null };
  const s = _cqEsterEstado();
  if (!s.modo) return { erro: 'Aguarde carregar os ciclos deste equipamento.' };
  if (s.modo === 'vinculado') {
    const o = _cqArr(s.recentes).find(r => `${r.mes}|${r.key}` === s.vinc);
    if (!o) return { erro: 'Escolha o ciclo já registrado a que esta leitura pertence.' };
    if (o.dataHora > dh) return { erro: 'A data/hora da leitura não pode ser anterior à do ciclo.' };
    const { vinculo, leituras, correcoes, status, statusAss, ...base } = o.ciclo;
    const ciclo = { ...base, vinculo: { mes: o.mes, key: o.key, numero: o.numero, dataHora: o.dataHora, operadorNome: o.operadorNome || '' }, incubacao: null };
    const inc = _cqEsterIncubValidar(s, _cqEsterDHC(o), dh);
    if (inc.erro) return inc;
    ciclo.incubacao = inc.incubacao;
    return { ciclo };
  }
  const progs = _cqEsterProgramas(cfg);
  if (!progs.length) return { erro: 'Cadastre os programas da autoclave (Configurações › Área › Ciclos de esterilização).' };
  const p = progs.find(x => x.id === s.programaId);
  if (!p) return { erro: 'Escolha o programa do ciclo de esterilização.' };
  const lote = String(s.lote || '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (!lote) return { erro: 'Informe o lote da carga (RDC 1002, art. 91, II).' };
  if (!/^[A-Z0-9][A-Z0-9 ._/-]{0,39}$/.test(lote)) return { erro: 'Lote da carga: use letras, números, espaço, ponto, hífen ou barra (até 40).' };
  const temp = _cqEsterNum(s.temp), tempo = _cqEsterNum(s.tempo), pressao = _cqEsterNum(s.pressao);
  if (temp === null || tempo === null || pressao === null) return { erro: 'Informe tempo, temperatura e pressão do ciclo (RDC 1002, art. 91, VII).' };
  const pacotes = _cqEsterPacotes(s.pacotes);
  if (!pacotes.length) return { erro: 'Informe a relação de pacotes esterilizados (RDC 1002, art. 91, V).' };
  const semQtd = _cqEsterPacSemQtd(s.pacotes);
  if (semQtd.length) return { erro: `Informe a quantidade (1 ou mais) dos pacotes: ${semQtd.join(', ')}.` };
  const unPressao = cfg.unPressao || 'kgf/cm²';
  const falhas = _cqEsterFalhas(p, unPressao, { temp, tempo, pressao });
  const val = _cqEsterValEstado(s, p);
  if (val.ativa && !val.dias) return { erro: 'Informe a validade da esterilização em dias (1 a 3650) ou desligue a validade.' };
  const dhc = String(s.dhCiclo || '');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dhc)) return { erro: 'Informe a data/hora do ciclo de esterilização.' };
  if (dhc > dh) return { erro: 'A data/hora do ciclo não pode ser posterior à da corrida.' };
  const inc = _cqEsterIncubValidar(s, dhc, dh);
  if (inc.erro) return inc;
  return { ciclo: {
    incubacao: inc.incubacao,
    loteCarga: lote, numeroCicloEquip: cfg.cicloModo === 'auto' ? null : (String(s.numEquip || '').trim() || null), dataHoraCiclo: dhc,
    programa: { id: p.id, nome: p.nome, tempMin: p.tempMin, tempMax: p.tempMax ?? null, tempoMin: p.tempoMin, pressaoMin: p.pressaoMin, pressaoMax: p.pressaoMax ?? null, unPressao },
    temperatura: temp, tempo, pressao, pacotes, conforme: !falhas.length, falhas,
    validade: val.ativa ? { dias: val.dias, data: _cqEsterValData(dhc, val.dias) } : null,
    // Testes exigidos para o ciclo ficar conforme: analitos que liberam o ciclo (cópia: mudar o cadastro não afeta este ciclo)
    testesExigidos: _cqEsterExigidosEquip(_cqGruposLanc(_cqLanc.u).find(x => x.key === _cqLanc.grupo)?.testes),
  } };
}

// Lote da carga único na unidade (RDC 1002, art. 91, § 2º): reserva por transação
function _cqEsterCaminhoLote(u, lote) { return `${CQ_KEYS.cargas}/${u}/${_cqChaveModoEquip(String(lote).toUpperCase())}`; }
async function _cqEsterReservarLote(u, lote, info) {
  const path = _cqEsterCaminhoLote(u, lote);
  const val = { lote, ...info, porNome: _cqSess().nome, em: _cqAgora() };
  const r = await window.dbTransaction(path, cur => (cur ? undefined : val));
  if (r && r.corridaKey === info.corridaKey) return { ok: true, path };
  const ex = await window.dbLoad(path);
  if (ex) return { ok: false, msg: `Lote da carga ${lote} já registrado${ex.numero ? ` na corrida ${ex.numero}` : ''}${ex.dataHora ? ` (${_cqFmtDH(ex.dataHora)})` : ''}. O lote deve ser único — RDC 1002, art. 91, § 2º.` };
  return { ok: false, msg: 'Não foi possível reservar o lote da carga. Verifique a conexão e tente novamente.' };
}

// ── DETALHE, CORREÇÃO E IMPRESSÃO ────────────────────────────
function _cqEsterPodeCorrigir(c) {
  if (!c?.ciclo || c.ciclo.vinculo) return false;
  const semDecisao = Object.values(c.testes || {}).every(ct => ct.naoRealizado || !ct.decisao);
  return _cqCan('invalidar') || (c.lancadoPorId === _cqSess().id && semDecisao);
}

function _cqEsterDetalheHTML(c) {
  const ci = c?.ciclo;
  if (!ci) return '';
  const p = ci.programa || {};
  const un = p.unPressao || 'kgf/cm²';
  const vinc = ci.vinculo;
  const lin = (rot, campo, v, unid) => {
    const fora = _cqEsterForaCampo(p, campo, Number(v), un);
    return `<tr><td>${rot}</td><td><b>${_cqEsterN(v)} ${unid}</b></td><td>${_cqEsc(_cqEsterEspTxt(p, campo, un))}</td>
      <td>${fora ? '<span class="cq-badge cq-st-rejeitado">fora</span>' : '<span class="cq-badge cq-st-aceito">conforme</span>'}</td></tr>`;
  };
  const leituras = Object.entries(ci.leituras || {}).sort(([a], [b]) => a.localeCompare(b));
  const correcoes = Object.entries(ci.correcoes || {}).sort(([a], [b]) => a.localeCompare(b));
  const pac = _cqArr(ci.pacotes);
  return `<div class="cq-ester cq-ester-det">
    <div class="cq-ester-head"><span class="cq-ester-tit">${CQ_ICO.clock} Ciclo de esterilização · lote ${_cqEsc(ci.loteCarga)}</span>
      ${!vinc && ci.status ? `<span class="cq-ester-sit">${_cqEsterStBadge(ci)}</span>` : ''}
      ${ci.conforme === false ? '<span class="cq-badge cq-st-rejeitado">parâmetros fora da especificação</span>' : '<span class="cq-badge cq-st-aceito">parâmetros conformes</span>'}
      <span class="cq-ester-acoes">
        ${ci.conforme !== false ? `<button class="btn btn-outline btn-sm" onclick="cqEsterEtqCorrida()" title="Etiqueta dos pacotes desta carga">${CQ_ICO.print} Etiqueta do ciclo</button>` : ''}
        ${_cqEsterPodeCorrigir(c) ? `<button class="btn btn-outline btn-sm" onclick="cqEsterCorrigir()">${CQ_ICO.edit} Corrigir ficha</button>` : ''}</span></div>
    ${vinc || ci.incubacao ? `<div class="cq-alerta-box cq-info-box">${CQ_ICO.info} ${vinc ? `Leitura de indicador do ciclo de ${_cqFmtDH(ci.dataHoraCiclo || vinc.dataHora)} — registrado na corrida
      <a href="#" class="cq-link" onclick="cqAbrirCorrida('${_cqEsc(vinc.mes)}','${_cqEsc(vinc.key)}');return false;">${_cqEsc(vinc.numero || vinc.key)}</a>.` : 'Indicador biológico lido nesta corrida.'}
      ${ci.incubacao ? `Incubação: ${ci.incubacao.inicio ? `início ${_cqFmtDH(ci.incubacao.inicio)}${ci.incubacao.horasAposCiclo != null ? ` (${_cqEsterN(ci.incubacao.horasAposCiclo)} h após o ciclo)` : ''}` : 'início não informado'}${ci.incubacao.temperatura != null ? ` · ${_cqEsterN(ci.incubacao.temperatura)} °C` : ''}.` : ''}
      ${(() => {
        const inc = ci.incubacao;
        if (!inc) return '';
        const prazo = inc.prazoHoras ?? CQ_ESTER_INCUB_HORAS;
        const foraPrazo = inc.foraPrazo ?? (inc.horasAposCiclo > prazo);
        const faixa = inc.faixa ? `${_cqEsterN(inc.faixa.min)} a ${_cqEsterN(inc.faixa.max)} °C` : '';
        return `${foraPrazo ? `<b class="cq-txt-vermelho">Incubação iniciada além de ${_cqEsterN(prazo)} h do ciclo.</b> ` : ''}${inc.foraFaixa ? `<b class="cq-txt-vermelho">Temperatura da incubadora fora da faixa da bula (${faixa}).</b>` : ''}`;
      })()}</div>` : ''}
    <div class="cq-ester-resumo">
      <div><span class="cq-muted">Data do ciclo</span><b>${_cqFmtDH(ci.dataHoraCiclo || (vinc ? vinc.dataHora : c.dataHora))}</b></div>
      <div><span class="cq-muted">Lote da carga</span><b>${_cqEsc(ci.loteCarga)}</b></div>
      <div><span class="cq-muted">Programa</span><b>${_cqEsc(p.nome || '—')}</b></div>
      <div><span class="cq-muted">Nº do ciclo no equipamento</span><b>${_cqEsc(ci.numeroCicloEquip || '—')}</b></div>
      <div><span class="cq-muted">Validade da esterilização</span><b>${ci.validade?.data ? `${_cqFmtData(ci.validade.data)} (${_cqEsc(ci.validade.dias)} dia${ci.validade.dias !== 1 ? 's' : ''})` : 'sem validade'}</b></div>
      <div><span class="cq-muted">Operador do equipamento</span><b>${_cqEsc(vinc ? vinc.operadorNome || '—' : c.operadorNome || '—')}</b></div>
    </div>
    <table class="cq-ester-tbl"><thead><tr><th>Parâmetro físico</th><th>Registrado</th><th>Especificação</th><th>Situação</th></tr></thead><tbody>
      ${lin('Temperatura', 'temp', ci.temperatura, '°C')}${lin('Tempo de esterilização', 'tempo', ci.tempo, 'min')}${lin('Pressão', 'pressao', ci.pressao, _cqEsc(un))}</tbody></table>
    <div class="cq-muted" style="font-size:12px;margin-top:6px;">Pacotes esterilizados (${pac.length})</div>
    <ul class="cq-ester-pac">${pac.map(x => `<li>${_cqEsc(x)}</li>`).join('')}</ul>
    ${!vinc && _cqArr(ci.testesExigidos).length ? (() => {
      const est = _cqEsterEstadosCiclo(c);
      const chip = x => { const e = est[x.id] || []; const k = e.includes('R') ? 'R' : e.includes('A') ? 'A' : e.includes('P') ? 'P' : '';
        return `<span class="cq-ester-exig ${{ A: 'ok', R: 'fora', P: 'pend' }[k] || ''}">${k === 'A' ? CQ_ICO.check : k === 'R' ? CQ_ICO.close : CQ_ICO.clock}${_cqEsc(x.nome)}<small>${{ A: 'aprovado', R: 'reprovado', P: 'aguardando decisão' }[k] || 'não lançado'}</small></span>`; };
      return `<div class="cq-ester-exigs"><span class="cq-muted">Testes exigidos para o ciclo ficar conforme:</span>${_cqArr(ci.testesExigidos).map(chip).join('')}</div>`;
    })() : ''}
    ${leituras.length ? `<div class="cq-nota">Testes lançados em corrida(s) vinculada(s): ${leituras.map(([k, l]) => `<a href="#" class="cq-link" onclick="cqAbrirCorrida('${_cqEsc(l.mes)}','${_cqEsc(k)}');return false;">${_cqEsc(l.numero || k)}</a> (${_cqFmtDH(l.dataHora)})`).join(', ')}</div>` : ''}
    ${correcoes.length ? `<div class="cq-nota">${correcoes.map(([, x]) => `Corrigido por ${_cqEsc(x.porNome)} em ${_cqFmtDH(x.em)} — ${_cqEsc(x.motivo)}: ${_cqArr(x.diffs).map(d => `${_cqEsc(d.campo)} <s>${_cqEsc(d.antes)}</s> → ${_cqEsc(d.depois)}`).join('; ')}`).join('<br>')}</div>` : ''}
  </div>`;
}

function _cqEsterImpressaoHTML(c) {
  const ci = c?.ciclo;
  if (!ci) return '';
  const p = ci.programa || {};
  const un = p.unPressao || 'kgf/cm²';
  const vinc = ci.vinculo;
  const lin = (rot, campo, v, unid) => `<tr><td>${rot}</td><td>${_cqEsterN(v)} ${unid}</td><td>${_cqEsc(_cqEsterEspTxt(p, campo, un))}</td><td>${_cqEsterForaCampo(p, campo, Number(v), un) ? 'FORA' : 'Conforme'}</td></tr>`;
  return `<h2 style="font-size:13px;margin:14px 0 4px;">Ciclo de esterilização (RDC 1002/2025, art. 91)</h2>
    <div class="meta">
      <div><b>Data do ciclo:</b> ${_cqFmtDH(ci.dataHoraCiclo || (vinc ? vinc.dataHora : c.dataHora))}</div><div><b>Lote da carga:</b> ${_cqEsc(ci.loteCarga)}</div>
      <div><b>Programa:</b> ${_cqEsc(p.nome || '—')}</div><div><b>Nº do ciclo no equipamento:</b> ${_cqEsc(ci.numeroCicloEquip || '—')}</div>
      <div><b>Validade da esterilização:</b> ${ci.validade?.data ? `${_cqFmtData(ci.validade.data)} (${_cqEsc(ci.validade.dias)} dia(s))` : 'sem validade'}</div>
      <div><b>Operador do equipamento:</b> ${_cqEsc(vinc ? vinc.operadorNome || '—' : c.operadorNome || '—')}</div><div><b>Parâmetros físicos:</b> ${ci.conforme === false ? 'FORA DA ESPECIFICAÇÃO' : 'conformes'}</div>
      ${vinc || ci.incubacao ? `<div style="grid-column:1/-1;"><b>${vinc ? 'Leitura de indicador do ciclo registrado na corrida' : 'Indicador biológico lido nesta corrida'}</b> ${vinc ? _cqEsc(vinc.numero || vinc.key) : ''}${ci.incubacao ? ` · incubação ${ci.incubacao.inicio ? 'iniciada ' + _cqFmtDH(ci.incubacao.inicio) : ''}${ci.incubacao.horasAposCiclo != null ? ` (${_cqEsterN(ci.incubacao.horasAposCiclo)} h após o ciclo)` : ''}${ci.incubacao.temperatura != null ? ` a ${_cqEsterN(ci.incubacao.temperatura)} °C` : ''}${ci.incubacao.foraPrazo ? ' — FORA DO PRAZO DA BULA' : ''}${ci.incubacao.foraFaixa ? ' — TEMPERATURA FORA DA FAIXA DA BULA' : ''}` : ''}</div>` : ''}
    </div>
    <table><thead><tr><th>Parâmetro físico</th><th>Registrado</th><th>Especificação</th><th>Situação</th></tr></thead><tbody>
      ${lin('Temperatura', 'temp', ci.temperatura, '°C')}${lin('Tempo de esterilização', 'tempo', ci.tempo, 'min')}${lin('Pressão', 'pressao', ci.pressao, _cqEsc(un))}</tbody></table>
    <p style="margin:8px 0 2px;"><b>Pacotes esterilizados (${_cqArr(ci.pacotes).length}):</b> ${_cqArr(ci.pacotes).map(_cqEsc).join('; ')}</p>
    ${Object.values(ci.correcoes || {}).map(x => `<p style="margin:2px 0;"><small>Ficha corrigida por ${_cqEsc(x.porNome)} em ${_cqFmtDH(x.em)} — ${_cqEsc(x.motivo)}: ${_cqArr(x.diffs).map(d => `${_cqEsc(d.campo)} ${_cqEsc(d.antes)} → ${_cqEsc(d.depois)}`).join('; ')}</small></p>`).join('')}`;
}

// ── ETIQUETA DO CICLO ────────────────────────────────────────
// Identifica os pacotes da carga: lote da carga em destaque, data/hora e nº do ciclo, parâmetros físicos,
// operador e equipamento (RDC 1002/2025, art. 91). Carga com parâmetro fora da especificação não é
// liberada e não recebe etiqueta. Usa a mesma janela de impressão das etiquetas de preparo.
function _cqEsterEtqDados({ lote, dataHora, numEquip, programa, temp, tempo, pressao, unPressao, operador, equip, validade, validadeDias }) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/.exec(String(dataHora || ''));
  const quando = m ? `${m[3]}/${m[2]}/${m[1].slice(2)} ${m[4]}` : '—';
  const n = _cqEsterN;
  const segs = {
    ciclo: [['Ciclo ', 0], [quando, 1], [numEquip ? ` · nº ${numEquip}` : '', 0]],
    val: validade ? [['Validade: ', 0], [`${validade.slice(8, 10)}/${validade.slice(5, 7)}/${validade.slice(2, 4)}`, 1], [validadeDias ? ` · ${validadeDias} dia${Number(validadeDias) !== 1 ? 's' : ''}` : '', 0]] : null,
    param: [[`${n(temp)} °C · ${n(tempo)} min · ${n(pressao)} ${unPressao || 'kgf/cm²'}`, 0]],
    op: [[`Op: ${_cqEtqNomeCurto(operador) || '—'}`, 0]],
    equip: equip ? [[String(equip), 0]] : null,
  };
  const niveis = [{ tit: 2, linhas: ['ciclo', 'val', 'param', 'op', 'equip'] }, { tit: 1, linhas: ['ciclo', 'val', 'param', 'op'] }, { tit: 1, linhas: ['ciclo', 'val', 'param'] }, { tit: 1, linhas: ['ciclo', 'val'] }]
    .map(nv => ({ ...nv, linhas: nv.linhas.filter(k => segs[k]) }));
  return { produto: `Esterilizado · ${programa || 'autoclave'}`, codigo: String(lote || ''), segs, niveis };
}

// Lançamento: a etiqueta só sai com a ficha do novo ciclo completa e conforme
function _cqEsterEtqLanc() {
  const cfg = _cqEsterLancCfg();
  const s = _cqLanc?.ciclo;
  if (!cfg || !s || s.modo !== 'novo') return { erro: 'ficha do ciclo indisponível.' };
  const p = _cqEsterProgramas(cfg).find(x => x.id === s.programaId);
  if (!p) return { erro: 'escolha o programa.' };
  const lote = String(s.lote || '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (!lote) return { erro: cfg.loteModo === 'auto' ? 'aguarde o lote da carga ser gerado.' : 'informe o lote da carga.' };
  const temp = _cqEsterNum(s.temp), tempo = _cqEsterNum(s.tempo), pressao = _cqEsterNum(s.pressao);
  if (temp === null || tempo === null || pressao === null) return { erro: 'informe temperatura, tempo e pressão.' };
  const numEquip = cfg.cicloModo === 'auto' ? (s.numPrevisto ? String(s.numPrevisto) : '') : String(s.numEquip || '').trim();
  if (!_cqEsterPacotes(s.pacotes).length) return { erro: 'informe a relação de pacotes.' };
  if (_cqEsterPacSemQtd(s.pacotes).length) return { erro: 'informe a quantidade de todos os pacotes.' };
  if (_cqEsterFalhas(p, cfg.unPressao, { temp, tempo, pressao }).length) return { erro: 'parâmetros fora da especificação — carga não liberada.' };
  const dh = _cqEsterDHCicloLanc();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dh || '')) return { erro: 'informe a data/hora do ciclo.' };
  const op = _cqUsuarios().find(x => x.id === _cqLanc.operadorId);
  if (!op) return { erro: 'informe quem executou a corrida.' };
  const val = _cqEsterValEstado(s, p);
  if (val.ativa && !val.dias) return { erro: 'informe a validade da esterilização em dias.' };
  const g = _cqGruposLanc(_cqLanc.u).find(x => x.key === _cqLanc.grupo);
  return { numEquip, d: _cqEsterEtqDados({ lote, dataHora: dh, numEquip, programa: p.nome, temp, tempo, pressao,
    unPressao: cfg.unPressao, operador: op.nomeCompleto || op.username, equip: g?.nome || cfg.equipNome || '',
    validade: val.ativa ? _cqEsterValData(dh, val.dias) : '', validadeDias: val.ativa ? val.dias : null }) };
}
function _cqEsterEtqBtnHTML() {
  const r = _cqEsterEtqLanc();
  return `<button type="button" id="cq-es-etq" class="btn btn-outline btn-sm cq-ester-etq${r.erro ? ' inativo' : ''}" aria-disabled="${!!r.erro}"
      title="${_cqEsc(r.erro ? 'Etiqueta do ciclo: ' + r.erro : 'Imprimir a etiqueta dos pacotes desta carga')}" onclick="cqEsterEtqLanc()">${CQ_ICO.print} Etiqueta do ciclo</button>`;
}
function _cqEsterEtqBtnAtualizar() {
  const b = document.getElementById('cq-es-etq');
  if (!b) return;
  const r = _cqEsterEtqLanc();
  b.classList.toggle('inativo', !!r.erro);
  b.setAttribute('aria-disabled', String(!!r.erro));
  b.title = r.erro ? 'Etiqueta do ciclo: ' + r.erro : 'Imprimir a etiqueta dos pacotes desta carga';
}
function cqEsterEtqLanc() {
  const r = _cqEsterEtqLanc();
  _cqEsterEtqBtnAtualizar();
  if (r.erro) { showToast(`Etiqueta do ciclo: ${r.erro}`, 'error'); return; }
  const cfg = _cqEsterLancCfg();
  if (cfg?.cicloModo === 'auto') _cqLanc.ciclo.etqNumImpresso = r.numEquip;   // confere ao publicar
  _cqEtqDialogo(r.d, 'Etiqueta do ciclo', `Lote da carga ${r.d.codigo}`,
    `<div class="cq-etq-aviso">A etiqueta não grava o ciclo: publique a corrida para registrar a ficha e os indicadores.${cfg?.cicloModo === 'auto' ? ' O nº do ciclo é o previsto e se confirma na publicação.' : ''}</div>`);
}

// Ficha da corrida: etiqueta do ciclo registrado (na leitura do indicador biológico, o ciclo de origem)
async function cqEsterEtqCorrida() {
  const ctx = _cqCorrAberta;
  if (!ctx) return;
  const c = await cqCarregarCorrida(ctx.u, ctx.mes, ctx.key);
  const ci = c?.ciclo;
  if (!ci) return;
  if (ci.conforme === false || ci.status === 'reprovado') { showToast('Ciclo reprovado: carga não liberada, sem etiqueta.', 'error'); return; }
  const vinc = ci.vinculo, p = ci.programa || {};
  const d = _cqEsterEtqDados({ lote: ci.loteCarga, dataHora: ci.dataHoraCiclo || (vinc ? vinc.dataHora : c.dataHora), numEquip: ci.numeroCicloEquip,
    programa: p.nome, temp: ci.temperatura, tempo: ci.tempo, pressao: ci.pressao, unPressao: p.unPressao,
    operador: vinc ? vinc.operadorNome : c.operadorNome, equip: c.ativoSnap?.nome || c.sistemaAnalitico || '', validade: ci.validade?.data || '', validadeDias: ci.validade?.dias || null });
  // Indicador rejeitado (sem decisão que libere): avisa antes de etiquetar os pacotes
  const rej = Object.values(c.testes || {}).some(ct => !ct.naoRealizado && (ct.decisao ? ct.decisao.acao !== 'liberado' : ct.avaliacao?.status === 'rejeitado'));
  _cqEtqDialogo(d, 'Etiqueta do ciclo', `Lote da carga ${ci.loteCarga} · corrida ${c.numero}`,
    rej ? `<div class="cq-etq-aviso alerta">Indicador desta corrida rejeitado ou não liberado: confirme a liberação da carga antes de etiquetar os pacotes.</div>`
      : ci.status === 'em_analise' ? `<div class="cq-etq-aviso">Ciclo em análise: só libere os pacotes depois que os indicadores forem aprovados.</div>` : '');
}

// Correção da ficha (o valor original fica registrado); reavalia os testes da corrida
async function cqEsterCorrigir() {
  const ctx = _cqCorrAberta;
  if (!ctx) return;
  const c = await cqCarregarCorrida(ctx.u, ctx.mes, ctx.key);
  if (!c || !_cqEsterPodeCorrigir(c)) { showToast('Sem permissão para corrigir a ficha.', 'error'); return; }
  const ci = c.ciclo, un = ci.programa?.unPressao || 'kgf/cm²';
  const n = v => (v === null || v === undefined ? '' : String(v).replace('.', ','));
  const pac = { alvo: true, pacotes: _cqArr(ci.pacotes).join('\n'), recentes: [] };
  _cqPrompt({
    largo: true, titulo: 'Corrigir ficha do ciclo', subtitulo: `Lote ${ci.loteCarga} · corrida ${c.numero}`,
    corpo: `<div class="cq-nota">Os valores originais permanecem registrados (RDC 978, art. 116). Lote da carga e programa não mudam: se estiverem errados, invalide os resultados e lance a corrida de novo.</div>
      <div class="cq-ester-grid">
        <div class="form-field"><label class="field-label">Temperatura (°C)</label><input type="text" inputmode="decimal" id="cq-esc-temp" class="field-input" value="${_cqEsc(n(ci.temperatura))}"></div>
        <div class="form-field"><label class="field-label">Tempo (min)</label><input type="text" inputmode="decimal" id="cq-esc-tempo" class="field-input" value="${_cqEsc(n(ci.tempo))}"></div>
        <div class="form-field"><label class="field-label">Pressão (${_cqEsc(un)})</label><input type="text" inputmode="decimal" id="cq-esc-pressao" class="field-input" value="${_cqEsc(n(ci.pressao))}"></div>
        <div class="form-field"><label class="field-label">Nº do ciclo no equipamento</label><input type="text" id="cq-esc-num" class="field-input" maxlength="20" value="${_cqEsc(ci.numeroCicloEquip || '')}"></div>
      </div>
      <div class="form-field"><label class="field-label">Pacotes esterilizados <span class="required">*</span> <span class="cq-es-npac" id="cq-es-npac">${_cqEsc(_cqEsterPacResumo(pac.pacotes))}</span></label>
        ${_cqEsterPacHTML(pac)}</div>
      <div class="form-field"><label class="field-label">Motivo <span class="required">*</span></label><textarea id="cq-esc-mot" class="field-textarea" style="min-height:56px;" placeholder="Ex.: temperatura transcrita errada — impressão da autoclave mostra 134,2 °C"></textarea></div>`,
    confirmar: 'Corrigir',
    onConfirm: async () => {
      const temp = _cqEsterNum(_cqVal('cq-esc-temp')), tempo = _cqEsterNum(_cqVal('cq-esc-tempo')), pressao = _cqEsterNum(_cqVal('cq-esc-pressao'));
      const pacotes = _cqEsterPacotes(pac.pacotes);
      const num = _cqVal('cq-esc-num') || null, mot = _cqVal('cq-esc-mot');
      if (temp === null || tempo === null || pressao === null) { showToast('Informe tempo, temperatura e pressão válidos.', 'error'); return false; }
      if (!pacotes.length) { showToast('Informe ao menos um pacote.', 'error'); return false; }
      if (_cqEsterPacSemQtd(pac.pacotes).length) { showToast('Informe a quantidade de todos os pacotes.', 'error'); return false; }
      if (!mot) { showToast('Informe o motivo.', 'error'); return false; }
      const diffs = [];
      const cmp = (campo, a, b, fmt) => { if (String(a ?? '') !== String(b ?? '')) diffs.push({ campo, antes: fmt(a), depois: fmt(b) }); };
      cmp('Temperatura', ci.temperatura, temp, v => `${_cqEsterN(v)} °C`);
      cmp('Tempo', ci.tempo, tempo, v => `${_cqEsterN(v)} min`);
      cmp('Pressão', ci.pressao, pressao, v => `${_cqEsterN(v)} ${un}`);
      cmp('Nº do ciclo no equipamento', ci.numeroCicloEquip || '', num || '', v => v || '—');
      cmp('Pacotes', _cqArr(ci.pacotes).join('; '), pacotes.join('; '), v => v || '—');
      if (!diffs.length) { showToast('Nenhum valor foi alterado.', 'error'); return false; }
      return _cqEsterAplicarCorrecao(ctx, c, { temperatura: temp, tempo, pressao, numeroCicloEquip: num, pacotes }, diffs, mot);
    },
  });
}

async function _cqEsterAplicarCorrecao(ctx, c, novos, diffs, motivo) {
  if (!_cqPodeGravar()) return false;
  const ci = c.ciclo;
  const falhas = _cqEsterFalhas(ci.programa, ci.programa?.unPressao, { temp: novos.temperatura, tempo: novos.tempo, pressao: novos.pressao });
  const base = `${CQ_KEYS.corridas}/${ctx.u}/${ctx.mes}/${ctx.key}`;
  const tk = _cqTk();
  const updates = {
    [`${base}/ciclo/temperatura`]: novos.temperatura, [`${base}/ciclo/tempo`]: novos.tempo, [`${base}/ciclo/pressao`]: novos.pressao,
    [`${base}/ciclo/numeroCicloEquip`]: novos.numeroCicloEquip, [`${base}/ciclo/pacotes`]: novos.pacotes,
    [`${base}/ciclo/conforme`]: !falhas.length, [`${base}/ciclo/falhas`]: falhas.length ? falhas : null,
    [`${base}/ciclo/correcoes/${tk}`]: { diffs, motivo, ..._cqAssinatura() },
  };
  // Reavaliação: parte da avaliação só dos indicadores e aplica a nova conformidade
  const c2 = JSON.parse(JSON.stringify(c));
  const mudancas = [];
  Object.entries(c.testes || {}).forEach(([tid, ct]) => {
    if (ct.naoRealizado) return;
    const av = ct.avaliacao || {};
    const r = _cqEsterAplicar({ status: av.statusIndicadores || av.status, violacoes: _cqArr(av.violacoes).filter(v => v.regra !== 'FIS_ESP') }, falhas);
    const nova = { status: r.status, violacoes: _cqArr(r.violacoes), statusIndicadores: r.statusIndicadores || null };
    updates[`${base}/testes/${tid}/avaliacao`] = nova;
    c2.testes[tid].avaliacao = nova;
    if (nova.status !== av.status) {
      const t = cqState.config.testes[tid];
      mudancas.push(`${t ? _cqNomeTeste(t) : tid}: ${CQ_STATUS[av.status]?.label || av.status} → ${CQ_STATUS[nova.status]?.label || nova.status}${ct.decisao ? ' (decisão mantida — revise)' : ''}`);
      const ult = (cqState.indices[ctx.u] || {}).ultimo?.[tid];
      if (ult && ult.corridaKey === ctx.key) updates[`${CQ_KEYS.indices}/${ctx.u}/ultimo/${tid}/status`] = nova.status;
    }
  });
  updates[`${CQ_KEYS.indices}/${ctx.u}/pendentes/${ctx.key}`] = _cqResumoPendencia(c2) || null;
  // Situação do ciclo com a nova conformidade dos parâmetros
  c2.ciclo = { ...c2.ciclo, conforme: !falhas.length };
  Object.assign(updates, _cqEsterStatusUpdates(ctx.u, { ...c2, key: ctx.key, mes: ctx.mes }, 'correção da ficha').up);
  updates[`${base}/trilha/${tk}`] = _cqTrilhaEntry('correcao', `Ficha do ciclo corrigida — ${motivo}${mudancas.length ? ` · avaliação: ${mudancas.join('; ')}` : ''}`, diffs);
  if (!(await window.dbUpdate(updates))) { showToast('Falha ao gravar.', 'error'); return false; }
  _cqCorrCache = null;
  showToast(mudancas.length ? 'Ficha corrigida; a avaliação dos testes mudou.' : 'Ficha corrigida; valores originais preservados.', mudancas.some(x => x.includes('revise')) ? 'error' : 'success');
  _cqCorrRenderDetalhe(true);
  return true;
}
