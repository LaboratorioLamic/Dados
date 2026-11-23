// ═══════════════════════════════════════════════════════════════
// cq-lancamento.js — Lançamento e liberação de corridas — LAMIC
// Registro dos resultados de controle por corrida analítica, avaliação
// pelas regras configuradas, liberação/rejeição por responsável,
// correção e invalidação preservando o dado original.
// RDC 978/2025: def. XII (corrida), arts. 102, 105-II, 116, 180 I-V, 183.
// ═══════════════════════════════════════════════════════════════

let _cqLanc = null;           // estado do lançamento em edição
let _cqCorrFiltro = { per: null, status: 'todas', grupo: '' };   // per: { modo: 'intervalo', de, ate } | { modo: 'ano', ano } | { modo: 'geral' }
let _cqCorrCache = null;      // { u, mes, corridas }
let _cqCorrAberta = null;     // { u, mes, key }

const CQ_ESTADO_SIGLA = { aceito: 'A', alerta: 'W', rejeitado: 'R', sem_alvo: 'X' };
const CQ_SIGLA_ESTADO = { A: 'aceito', W: 'alerta', R: 'rejeitado', X: 'sem_alvo', P: 'sem_alvo' };

function _cqLancReset() { _cqLanc = null; }

function _cqLancNovo(grupo) {
  const u = _cqUnidadeAtivaId();
  return {
    u, grupo: grupo || '', dataHora: _cqNowLocal(), operadorId: _cqSess().id,
    flags: { posManutPrev: false, posManutCorr: false, reinicioEquip: false, verificacao: false, otRef: '', otId: null },
    retroJust: '', repeticaoDe: null, somenteTestes: null, linhas: {}, hist: {}, carregando: new Set(), rascunhoRestaurado: false,
    modo: grupo ? _cqModoCorrida(u, grupo) : 'lote', selecionados: [],   // corrida fracionada: testes adicionados, na ordem
  };
}

// Corrida fracionada: a grade mostra só os testes adicionados pelo operador (repetição sempre usa o teste fixo)
function _cqLancFrac() { return !!_cqLanc && _cqLanc.modo === 'fracionada' && !_cqLanc.somenteTestes; }

// Grupos (equipamentos ou sistemas manuais) com testes ativos na unidade.
// porSetor: só os testes do setor escolhido no CQ (listas); sem ele, todos (busca por chave do grupo)
function _cqGruposLanc(u, { porSetor = false } = {}) {
  const g = {};
  (porSetor ? _cqTestesDoFiltro(u) : _cqTestesDaUnidade(u)).forEach(t => {
    const ativo = t.ativoId && typeof _ativoById === 'function' ? _ativoById(t.ativoId) : null;
    if (ativo?.statusUso === 'em_desuso') return;
    const k = _cqGrupoEquip(t);
    (g[k] = g[k] || { key: k, nome: _cqEquipTeste(t), ativoId: t.ativoId || null, ativo, testes: [] }).testes.push(t);
  });
  Object.values(g).forEach(x => x.testes.sort((a, b) => _cqNomeTeste(a).localeCompare(_cqNomeTeste(b))));
  return Object.values(g).sort((a, b) => a.nome.localeCompare(b.nome));
}

function cqLancarPara(grupoKey) {
  _cqLanc = _cqLancNovo(grupoKey);
  cqNav('lancar');
}

// Abre o lançamento para repetir o controle de um teste rejeitado
async function cqRepetirControle(mes, ck, testeId) {
  const t = cqState.config.testes[testeId];
  if (!t) return;
  const c = await cqCarregarCorrida(_cqUnidadeAtivaId(), mes, ck);
  const ct = c?.testes?.[testeId] || {};
  cqModalClose();
  _cqLanc = _cqLancNovo(_cqGrupoEquip(t));
  _cqLanc.repeticaoDe = { mes, key: ck, numero: c?.numero || ck, testeId, ncId: ct.ncId || null, ncAno: ct.ncAno || null };
  _cqLanc.somenteTestes = [testeId];
  cqNav('lancar');
}

// ── TELA DE LANÇAMENTO ───────────────────────────────────────
function cqRenderLancar(body) {
  const u = _cqUnidadeAtivaId();
  if (!_cqCan('lancar')) { body.innerHTML = '<div class="cq-vazio">Sem permissão para lançar corridas.</div>'; return; }
  if (!_cqLanc || _cqLanc.u !== u) _cqLanc = _cqLancNovo('');
  const grupos = _cqGruposLanc(u, { porSetor: true });
  const g = _cqGruposLanc(u).find(x => x.key === _cqLanc.grupo);
  if (g && !_cqLanc.carregado) { _cqLancCarregarGrupo(); return; }
  // Atualização remota durante a digitação: só recalcula as linhas, sem perder o foco
  if (g && body.dataset.lancGrupo === _cqLanc.grupo && document.activeElement?.closest?.('#cq-grade, #cq-l-ester')) {
    _cqGradeAtualizarTudo();
    return;
  }
  body.dataset.lancGrupo = g ? _cqLanc.grupo : '';
  // Executado por: membros da unidade com permissão de lançar/configurar o CQ (sem nenhum configurado, o próprio usuário)
  let users = _cqUsuariosDaUnidade(u);
  if (!users.length) users = _cqUsuarios().filter(x => x.id === _cqSess().id);
  if (!users.some(x => x.id === _cqLanc.operadorId)) _cqLanc.operadorId = users.some(x => x.id === _cqSess().id) ? _cqSess().id : (users[0]?.id || _cqLanc.operadorId);
  const agora = _cqNowLocal();
  const ester = g && typeof _cqEsterLancCfg === 'function' ? _cqEsterLancCfg() : null;
  body.innerHTML = `
  <div class="cq-lanc">
    ${_cqLanc.repeticaoDe ? `<div class="cq-alerta-box cq-info-box">${CQ_ICO.repeat} Repetição do controle da corrida ${_cqEsc(_cqLanc.repeticaoDe.numero)}. A repetição isolada não é ação corretiva: registre causa e ação na não conformidade.</div>` : ''}
    <div class="cq-lanc-head">
      <div class="form-field cq-lanc-equip"><label class="field-label">Equipamento / sistema <span class="required">*</span></label>
        ${_cqLancEquipComboHTML(grupos)}</div>
      <div class="form-field" style="max-width:200px;"><label class="field-label">Data/hora da corrida <span class="required">*</span></label>
        <input type="datetime-local" class="field-input" id="cq-l-dh" max="${agora}" value="${_cqEsc(_cqLanc.dataHora)}" onblur="if(this.value!==this.defaultValue){this.defaultValue=this.value;cqLancDataHora(this.value)}" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}"></div>
      <div class="form-field" style="max-width:280px;min-width:240px;"><label class="field-label">${ester ? 'Operador do equipamento' : 'Executado por'} <span class="required">*</span></label>
        ${_cqUsuarioPopHTML('cq-l-oper', u, users, _cqLanc.operadorId, v => { _cqLanc.operadorId = v; })}</div>
      ${g ? _cqLancModoHTML() : ''}
    </div>
    ${g ? `
    ${g.ativo?.statusUso === 'em_pausa' ? `<div class="cq-alerta-box">${CQ_ICO.alerta} Equipamento em pausa: esta corrida será registrada como <b>verificação</b> (pós-manutenção / liberação), sem liberar resultados de pacientes.</div>` : ''}
    <div id="cq-l-retro"></div>
    <div class="cq-lanc-cond">${_cqLancCondHTML()}${_cqLancOtHTML()}</div>
    ${typeof _cqEsterLancHTML === 'function' ? _cqEsterLancHTML() : ''}
    ${_cqLanc.rascunhoRestaurado ? `<div class="cq-alerta-box cq-info-box">${CQ_ICO.undo} Rascunho não salvo restaurado deste computador. <a href="#" onclick="cqLancDescartarRascunho();return false;">Descartar rascunho</a></div>` : ''}
    ${_cqLancAddHTML()}
    <div class="cq-grade-wrap"><table class="cq-grade" id="cq-grade">${_cqGradeHTML(g)}</table></div>
    <div class="cq-lanc-rodape">
      <div class="cq-nota" id="cq-l-nota">${_cqLancNotaTxt()}</div>
      <div class="cq-spacer"></div>
      <button class="btn btn-outline" onclick="cqLancLimpar()">Limpar</button>
      <button class="btn btn-primary" id="cq-l-salvar" onclick="cqLancSalvar()">${CQ_ICO.check} Salvar corrida</button>
    </div>` : grupos.length ? `<div class="cq-lanc-escolha">
      <div class="cq-sec-titulo">Escolha o equipamento ou sistema</div>
      <div class="cq-lanc-equips">${grupos.map(x => {
        const r = _cqLancEquipResumo(x);
        return `<button type="button" class="cq-lanc-eq ${r.cls}" data-k="${_cqEsc(x.key)}" onclick="cqLancGrupo(this.dataset.k)">
          <span class="cq-lanc-eq-ico">${x.key.startsWith('m:') ? CQ_ICO.beaker : CQ_ICO.ativo}</span>
          <span class="cq-lanc-eq-txt"><b>${_cqEsc(x.nome)}</b><small>${x.testes.length} teste${x.testes.length === 1 ? '' : 's'}${x.ativo?.statusUso === 'em_pausa' ? ' · em pausa (verificação)' : ''}</small>
            <span class="cq-lanc-eq-st"><i></i>${_cqEsc(r.status)}</span></span>
          <svg class="cq-cfg-tile-seta" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="9 6 15 12 9 18"/></svg></button>`;
      }).join('')}</div></div>` : '<div class="cq-vazio">Nenhum teste ativo nesta área. Cadastre testes em Cadastros.</div>'}
  </div>`;
  if (g) { _cqLancAtualizarRetro(); _cqGradeAtualizarTudo(); if (ester) _cqEsterAtualizar(); }
}

// Resumo do equipamento para a escolha: testes sem CQ hoje, aguardando avaliação ou em dia
function _cqLancEquipResumo(x) {
  const un = _cqUnidade();
  const ul = (cqState.indices[_cqUnidadeAtivaId()] || {}).ultimo || {};
  const semHoje = x.testes.filter(t => _cqTesteSemCQHoje(t, ul[t.id], un)).length;
  const aguarda = x.testes.filter(t => ul[t.id] && !ul[t.id].decisao).length;
  const status = semHoje ? `${semHoje} sem CQ hoje` : aguarda ? `${aguarda} aguardando avaliação` : 'CQ do dia em dia';
  const pausa = x.ativo?.statusUso === 'em_pausa' ? ' · em pausa' : '';
  return { status, cls: semHoje ? 'pend' : aguarda ? 'aguarda' : 'ok', txt: `${x.testes.length} teste${x.testes.length === 1 ? '' : 's'} · ${status}${pausa}` };
}

// ── Equipamento / sistema: campo de pesquisa com lista (clicar no escolhido desmarca) ──
let _cqEqcAtivo = -1;
function _cqLancEquipComboHTML(grupos) {
  const g = grupos.find(x => x.key === _cqLanc.grupo);
  const ico = x => (x.key.startsWith('m:') ? CQ_ICO.beaker : CQ_ICO.ativo);
  const itens = grupos.map((x, i) => {
    const sel = x.key === _cqLanc.grupo;
    return `<button type="button" class="cq-sitpop-op cq-eqc-op${sel ? ' sel' : ''}" data-i="${i}" data-k="${_cqEsc(x.key)}" data-b="${_cqEsc(_cqNormBusca(x.nome))}"
        onclick="cqEqcEscolher(this.dataset.k)" onmouseenter="cqEqcHover(${i})" title="${sel ? 'Clique para desmarcar e voltar à lista de equipamentos' : 'Lançar neste equipamento'}">
      <span class="cq-sitpop-marca"><span class="cq-sitpop-ico">${ico(x)}</span></span>
      <span class="cq-sitpop-txt"><b>${_cqEsc(x.nome)}</b><small>${_cqEsc(_cqLancEquipResumo(x).txt)}</small></span>
      ${sel ? '<span class="cq-eqc-desm">desmarcar ×</span>' : ''}</button>`;
  }).join('');
  return `<div class="cq-sitpop cq-eqc${g ? ' com-valor' : ''}" id="cq-l-grupo-pop" onfocusout="cqEqcSaiu(event)">
    <div class="cq-eqc-campo" onclick="document.getElementById('cq-eqc-in').focus()">
      <span class="cq-sitpop-ico">${g ? ico(g) : CQ_ICO.busca}</span>
      <input type="text" id="cq-eqc-in" autocomplete="off" spellcheck="false" value="${_cqEsc(g?.nome || '')}" placeholder="Pesquise ou selecione o equipamento / sistema"
        onfocus="cqEqcAbrir()" oninput="cqEqcFiltrar(this.value)" onkeydown="cqEqcTecla(event)">
      ${g ? `<span class="cq-sitpop-x" role="button" title="Desmarcar e voltar à lista" onmousedown="event.preventDefault()" onclick="event.stopPropagation();cqLancSairEquip()">×</span>` : ''}
      <svg class="cq-sitpop-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
    </div>
    <div class="cq-sitpop-menu cq-eqc-menu" onmousedown="event.preventDefault()">${itens || '<div class="cq-ms-vazio">Nenhum equipamento com testes ativos.</div>'}
      <div class="cq-ms-vazio cq-eqc-nada" hidden>Nenhum equipamento encontrado.</div></div>
  </div>`;
}
function _cqEqcVisiveis() { return [...document.querySelectorAll('#cq-l-grupo-pop .cq-eqc-op')].filter(b => !b.hidden); }
function cqEqcAbrir() {
  const pop = document.getElementById('cq-l-grupo-pop'), inp = document.getElementById('cq-eqc-in');
  if (!pop || !inp) return;
  document.querySelectorAll('.cq-sitpop.aberto, .cq-mp.aberto').forEach(x => { if (x !== pop) x.classList.remove('aberto'); });
  pop.classList.add('aberto');
  inp.select();
  cqEqcFiltrar('');
}
function cqEqcFiltrar(q) {
  const n = _cqNormBusca(q || '').trim();
  // Texto igual ao nome escolhido (campo recém-focado): mostra todos
  const nomeSel = _cqNormBusca(document.querySelector('#cq-l-grupo-pop .cq-eqc-op.sel b')?.textContent || '');
  let vis = 0;
  document.querySelectorAll('#cq-l-grupo-pop .cq-eqc-op').forEach(b => { const ok = !n || n === nomeSel || b.dataset.b.includes(n); b.hidden = !ok; if (ok) vis++; });
  const nada = document.querySelector('#cq-l-grupo-pop .cq-eqc-nada');
  if (nada) nada.hidden = !!vis;
  document.getElementById('cq-l-grupo-pop')?.classList.add('aberto');
  cqEqcHover(n && n !== nomeSel ? 0 : -1, true);
}
function cqEqcHover(i, visivel) {
  const vis = _cqEqcVisiveis();
  document.querySelectorAll('#cq-l-grupo-pop .cq-eqc-op.foco').forEach(b => b.classList.remove('foco'));
  const alvo = visivel ? vis[i] : document.querySelector(`#cq-l-grupo-pop .cq-eqc-op[data-i="${i}"]`);
  _cqEqcAtivo = alvo ? vis.indexOf(alvo) : -1;
  alvo?.classList.add('foco');
}
function cqEqcTecla(e) {
  const vis = _cqEqcVisiveis();
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!vis.length) return;
    const n = (_cqEqcAtivo + (e.key === 'ArrowDown' ? 1 : -1) + vis.length) % vis.length;
    cqEqcHover(n, true);
    vis[n].scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const b = vis[_cqEqcAtivo] || (vis.length === 1 ? vis[0] : null);
    if (b) cqEqcEscolher(b.dataset.k);
  } else if (e.key === 'Escape') { cqEqcFechar(); e.target.blur(); }
}
function cqEqcFechar() {
  const pop = document.getElementById('cq-l-grupo-pop');
  pop?.classList.remove('aberto');
  const inp = document.getElementById('cq-eqc-in');
  const nome = document.querySelector('#cq-l-grupo-pop .cq-eqc-op.sel b')?.textContent || '';
  if (inp) inp.value = nome;
}
function cqEqcSaiu(e) {
  const pop = document.getElementById('cq-l-grupo-pop');
  if (pop && !pop.contains(e.relatedTarget)) cqEqcFechar();
}
// Clicar no equipamento já escolhido desmarca e volta à lista
function cqEqcEscolher(k) {
  if (k === _cqLanc.grupo) { cqLancSairEquip(); return; }
  document.getElementById('cq-l-grupo-pop')?.classList.remove('aberto');
  cqLancGrupo(k);
}

// ── Condições da corrida (popover) e vínculo com OT ──────────
const CQ_COND_CORRIDA = [
  { k: 'posManutPrev', label: 'Após manutenção preventiva', desc: 'Primeira corrida depois da manutenção programada' },
  { k: 'posManutCorr', label: 'Após manutenção corretiva', desc: 'Primeira corrida depois de reparo ou troca de peça' },
  { k: 'reinicioEquip', label: 'Após reinício do equipamento', desc: 'Equipamento desligado, reiniciado ou sem energia' },
];
function _cqLancCondHTML(aberto) {
  const f = _cqLanc.flags;
  const on = CQ_COND_CORRIDA.filter(c => f[c.k]);
  const rot = !on.length ? 'Nenhuma condição especial' : on.length === 1 ? on[0].label : `${on.length} condições marcadas`;
  return `<div class="cq-sitpop cq-lanc-pop${on.length ? ' tem' : ''}${aberto ? ' aberto' : ''}" id="cq-l-cond-pop">
    <button type="button" class="cq-sitpop-btn" onclick="cqSitPopAbrir('cq-l-cond')" title="${_cqEsc(on.map(c => c.label).join('\n') || 'Marque se a corrida foi feita após manutenção ou reinício')}">
      <span class="cq-sitpop-marca"><span class="cq-sitpop-ico">${CQ_ICO.alerta}</span></span>
      <span class="cq-lanc-pop-txt"><small>Condições da corrida</small><b>${_cqEsc(rot)}</b></span>
      ${on.length ? `<span class="cq-lanc-pop-n">${on.length}</span>` : ''}
      <svg class="cq-sitpop-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></button>
    <div class="cq-sitpop-menu cq-lanc-cond-menu">
      ${CQ_COND_CORRIDA.map(c => `<button type="button" class="cq-tgl${f[c.k] ? ' on' : ''}" onclick="cqLancCond('${c.k}')"><span class="cq-tgl-sw"><i></i></span><span class="cq-tgl-txt"><b>${c.label}</b><small>${c.desc}</small></span></button>`).join('')}
      <div class="cq-nota" style="margin:4px 2px 0;">Ficam registradas na corrida para explicar desvios após intervenções no equipamento.</div>
    </div>
  </div>`;
}
function cqLancCond(k) {
  _cqLanc.flags[k] = !_cqLanc.flags[k];
  const el = document.getElementById('cq-l-cond-pop');
  if (el) el.outerHTML = _cqLancCondHTML(true);
}

// OT vinculada: escolhida da lista de OTs (as do equipamento primeiro) ou referência livre
function _cqLancOt() { return _cqLanc.flags.otId && typeof otState !== 'undefined' ? otState.ordens.find(o => o.id === _cqLanc.flags.otId) || null : null; }
function _cqLancOtHTML(aberto) {
  const f = _cqLanc.flags;
  const o = _cqLancOt();
  const tem = !!(o || f.otRef);
  const rot = o ? `${o.numero} · ${o.titulo || ''}` : f.otRef ? `Ref.: ${f.otRef}` : 'Vincular a uma OT';
  const ico = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>';
  return `<div class="cq-sitpop cq-lanc-pop cq-lanc-ot${tem ? ' tem' : ''}${aberto ? ' aberto' : ''}" id="cq-l-ot-pop">
    <button type="button" class="cq-sitpop-btn" onclick="cqSitPopAbrir('cq-l-ot');setTimeout(()=>document.getElementById('cq-l-ot-busca')?.focus(),40)">
      <span class="cq-sitpop-marca"><span class="cq-sitpop-ico">${ico}</span></span>
      <span class="cq-lanc-pop-txt"><small>Ordem de trabalho</small><b>${_cqEsc(rot)}</b></span>
      ${tem ? `<span class="cq-sitpop-x" role="button" title="Desvincular" onclick="event.stopPropagation();cqLancOtLimpar()">×</span>` : ''}
      <svg class="cq-sitpop-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></button>
    <div class="cq-sitpop-menu cq-lanc-ot-menu">
      <div class="cq-tp-busca">${CQ_ICO.busca}<input type="text" id="cq-l-ot-busca" placeholder="Buscar OT por número ou título…" autocomplete="off" oninput="cqLancOtBuscar(this.value)"></div>
      <div class="cq-tp-lista" id="cq-l-ot-lista">${_cqLancOtListaHTML('')}</div>
    </div>
  </div>`;
}
function _cqLancOtListaHTML(q) {
  if (typeof otState === 'undefined' || !Array.isArray(otState.ordens)) return '<div class="cq-ms-vazio">Módulo de ordens de trabalho indisponível.</div>';
  const g = _cqGruposLanc(_cqLanc.u).find(x => x.key === _cqLanc.grupo);
  const ativoId = g?.ativoId || null;
  const n = _cqNormBusca(q).trim();
  const ehDoEquip = o => !!ativoId && typeof otAtivoIds === 'function' && otAtivoIds(o).includes(ativoId);
  const aberta = o => !['concluida', 'cancelada'].includes(o.status);
  const lista = otState.ordens.filter(o => o && (!n || _cqNormBusca(`${o.numero} ${o.titulo}`).includes(n)))
    .sort((a, b) => ehDoEquip(b) - ehDoEquip(a) || aberta(b) - aberta(a) || (b.criadoEm || '').localeCompare(a.criadoEm || ''))
    .slice(0, 40);
  const cfg = typeof OT_STATUS_CFG !== 'undefined' ? OT_STATUS_CFG : {};
  const item = o => `<button type="button" class="cq-sitpop-op${o.id === _cqLanc.flags.otId ? ' sel' : ''}" onclick="cqLancOtEscolher('${o.id}')">
      <span class="cq-sitpop-marca"><span class="cq-sitpop-dot" style="background:${cfg[o.status]?.dot || '#9aa5b1'}"></span></span>
      <span class="cq-sitpop-txt"><b>${_cqEsc(o.numero || '')} · ${_cqEsc(o.titulo || '')}</b>
        <small>${_cqEsc([cfg[o.status]?.label?.replace(/s$/, '') || o.status, o.criadoEm ? _cqFmtData(o.criadoEm.slice(0, 10)) : '', typeof _otNomeAtivos === 'function' ? _otNomeAtivos(o) : ''].filter(Boolean).join(' · '))}</small></span>
      <svg class="cq-sitpop-ok" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><polyline points="20 6 9 17 4 12"/></svg></button>`;
  const doEq = lista.filter(ehDoEquip), outras = lista.filter(o => !ehDoEquip(o));
  const grupo = (tit, xs) => xs.length ? `<div class="cq-tp-grupo"><div class="cq-tp-grupo-tit">${tit}<span>${xs.length}</span></div>${xs.map(item).join('')}</div>` : '';
  const livre = n ? `<button type="button" class="cq-sitpop-op cq-lanc-ot-livre" data-q="${_cqEsc(q.trim())}" onclick="cqLancOtRef(this.dataset.q)">
      <span class="cq-sitpop-marca"><span class="cq-sitpop-ico">${CQ_ICO.edit}</span></span><span class="cq-sitpop-txt"><b>Usar “${_cqEsc(q.trim())}” como referência</b><small>Sem vínculo: ocorrência, chamado ou documento externo</small></span></button>` : '';
  return (grupo(g?.nome ? `OTs de ${_cqEsc(g.nome)}` : 'Deste equipamento', doEq) + grupo(doEq.length ? 'Outras OTs' : 'Ordens de trabalho', outras)
    || `<div class="cq-ms-vazio">${n ? 'Nenhuma OT encontrada.' : 'Nenhuma ordem de trabalho registrada.'}</div>`) + livre;
}
function cqLancOtBuscar(q) { const l = document.getElementById('cq-l-ot-lista'); if (l) l.innerHTML = _cqLancOtListaHTML(q); }
function _cqLancOtRedesenhar() { const el = document.getElementById('cq-l-ot-pop'); if (el) el.outerHTML = _cqLancOtHTML(false); }
function cqLancOtEscolher(id) {
  const o = otState.ordens.find(x => x.id === id);
  if (!o) return;
  _cqLanc.flags.otId = o.id;
  _cqLanc.flags.otRef = o.numero || '';
  _cqLancOtRedesenhar();
}
function cqLancOtRef(txt) { _cqLanc.flags.otId = null; _cqLanc.flags.otRef = String(txt || '').trim().slice(0, 60); _cqLancOtRedesenhar(); }
function cqLancOtLimpar() { _cqLanc.flags.otId = null; _cqLanc.flags.otRef = ''; _cqLancOtRedesenhar(); }

// × do equipamento: volta à escolha (os valores digitados ficam no rascunho deste computador)
function cqLancSairEquip() {
  const anterior = _cqLanc;
  const temValor = anterior && Object.values(anterior.linhas || {}).some(_cqLinhaPreenchida);
  _cqLanc = _cqLancNovo('');
  _cqLanc.dataHora = anterior?.dataHora || _cqNowLocal();
  _cqLanc.operadorId = anterior?.operadorId || _cqSess().id;
  cqRender();
  if (temValor) showToast('Valores digitados guardados como rascunho: voltam ao escolher o mesmo equipamento.', 'success');
}

function cqLancGrupo(k) {
  const anterior = _cqLanc;
  _cqLanc = _cqLancNovo(k);
  _cqLanc.dataHora = anterior?.dataHora || _cqNowLocal();
  _cqLanc.operadorId = anterior?.operadorId || _cqSess().id;
  _cqLancCarregarGrupo();
}

function cqLancDataHora(v) {
  const diaAntes = (_cqLanc.dataHora || '').slice(0, 10);
  _cqLanc.dataHora = v;
  _cqLancAtualizarRetro();
  // Histórico e alvos dependem da data/hora da corrida
  Object.keys(_cqLanc.linhas).forEach(t => { delete _cqLanc.hist[t]; });
  // Lotes de insumo oferecidos dependem do dia (encerrados por vencimento valem até a validade)
  const grade = document.getElementById('cq-grade');
  if (grade && diaAntes !== (v || '').slice(0, 10)) grade.innerHTML = _cqGradeHTML();
  _cqGradeAtualizarTudo();
  _cqLancCarregarHistoricos();
  // Leitura de ciclo já registrado: os ciclos oferecidos dependem da data/hora da corrida
  if (_cqLanc.ciclo?.modo === 'vinculado' && typeof _cqEsterRedesenhar === 'function') _cqEsterRedesenhar();
}

function _cqLancAtualizarRetro() {
  const el = document.getElementById('cq-l-retro');
  if (!el || !_cqLanc) return;
  const horas = _cqHorasAtras(_cqLanc.dataHora);
  const lim = Number(_cqPolitica().retroativoHoras) || 0;
  if (horas !== null && horas > lim) {
    el.innerHTML = `<div class="cq-alerta-box">${CQ_ICO.clock} Lançamento retroativo (${Math.floor(horas)} h atrás). Justifique:
      <input type="text" class="field-input" id="cq-l-retro-just" style="margin-top:6px;" value="${_cqEsc(_cqLanc.retroJust)}" oninput="_cqLanc.retroJust=this.value" placeholder="Ex.: falha do sistema no plantão; registro em papel transcrito"></div>`;
  } else el.innerHTML = '';
}

function _cqHorasAtras(dh) {
  if (!dh) return null;
  const agora = _cqNowLocal();
  const a = Date.UTC(+dh.slice(0, 4), +dh.slice(5, 7) - 1, +dh.slice(8, 10), +dh.slice(11, 13), +dh.slice(14, 16));
  const b = Date.UTC(+agora.slice(0, 4), +agora.slice(5, 7) - 1, +agora.slice(8, 10), +agora.slice(11, 13), +agora.slice(14, 16));
  return (b - a) / 3600000;
}

// Testes do equipamento disponíveis neste lançamento
function _cqLancTodosTestes() {
  const g = _cqGruposLanc(_cqLanc.u).find(x => x.key === _cqLanc.grupo);
  if (!g) return [];
  return _cqLanc.somenteTestes ? g.testes.filter(t => _cqLanc.somenteTestes.includes(t.id)) : g.testes;
}
// Testes exibidos na grade (na fracionada, só os adicionados)
function _cqLancTestes() {
  const todos = _cqLancTodosTestes();
  if (!_cqLancFrac()) return todos;
  return _cqLanc.selecionados.map(id => todos.find(t => t.id === id)).filter(Boolean);
}

function _cqLinhaVazia(tid) {
  const ult = ((cqState.indices[_cqLanc.u] || {}).ultimo || {})[tid];
  return { valores: {}, lr: ult?.lr || '', lk: ult?.lk || '', nr: false, motivoNR: '', posCalibracao: false };
}
function _cqLinhaPreenchida(l) { return !!l && (l.nr || Object.values(l.valores || {}).some(v => String(v || '').trim())); }

function _cqLancCarregarGrupo() {
  const testes = _cqLancTodosTestes();
  // Rascunho local
  let rasc = null;
  try { rasc = JSON.parse(localStorage.getItem(_cqRascunhoKey()) || 'null'); } catch (e) { rasc = null; }
  testes.forEach(t => { _cqLanc.linhas[t.id] = _cqLinhaVazia(t.id); });
  if (rasc && rasc.linhas && !_cqLanc.repeticaoDe) {
    Object.entries(rasc.linhas).forEach(([tid, l]) => { if (_cqLanc.linhas[tid]) Object.assign(_cqLanc.linhas[tid], l); });
    _cqLanc.rascunhoRestaurado = Object.values(rasc.linhas).some(l => Object.values(l.valores || {}).some(v => v));
    // Fracionada: restaura os testes adicionados e garante os que já têm valor digitado
    const sel = _cqArr(rasc.selecionados).filter(id => _cqLanc.linhas[id]);
    testes.forEach(t => { if (_cqLinhaPreenchida(_cqLanc.linhas[t.id]) && !sel.includes(t.id)) sel.push(t.id); });
    _cqLanc.selecionados = sel;
    // Ficha do ciclo de esterilização digitada
    if (rasc.ciclo && typeof rasc.ciclo === 'object') {
      _cqLanc.ciclo = { ...rasc.ciclo };
      if (rasc.ciclo.lote || rasc.ciclo.pacotes || rasc.ciclo.temp) _cqLanc.rascunhoRestaurado = true;
    }
  }
  _cqLanc.carregado = true;
  const body = document.getElementById('cq-body');
  if (body) body.dataset.lancGrupo = '';
  cqRender();
  _cqLancCarregarHistoricos();
}

async function _cqLancCarregarHistoricos() {
  const lanc = _cqLanc;
  const antesDe = (CQEngine.chaveTempo(lanc.dataHora) || '999999999999') + '_~';
  await Promise.all(_cqLancTestes().map(async t => {
    if (lanc.hist[t.id]) return;
    // Qualitativos não usam regras entre corridas: não há histórico a carregar
    if (_cqTesteQual(t)) { lanc.hist[t.id] = []; _cqGradeAtualizarLinha(t); return; }
    lanc.carregando.add(t.id);
    _cqGradeAtualizarLinha(t);
    try { lanc.hist[t.id] = await cqHistoricoTeste(lanc.u, t, antesDe); }
    catch (e) { lanc.hist[t.id] = []; console.error('[cq] histórico', e); }
    lanc.carregando.delete(t.id);
    if (_cqLanc === lanc) _cqGradeAtualizarLinha(t);
  }));
}

function _cqRascunhoKey() { return `cq-draft-${_cqLanc.u}-${_cqLanc.grupo}`; }
function _cqRascunhoSalvar() {
  if (!_cqLanc?.grupo || _cqLanc.repeticaoDe) return;
  const ciclo = typeof _cqEsterRascunho === 'function' ? _cqEsterRascunho() : null;
  try { localStorage.setItem(_cqRascunhoKey(), JSON.stringify({ em: _cqAgora(), linhas: _cqLanc.linhas, selecionados: _cqLanc.selecionados, ciclo })); } catch (e) { /* sem storage */ }
}
function _cqRascunhoLimpar() { try { localStorage.removeItem(_cqRascunhoKey()); } catch (e) { /* sem storage */ } }
function cqLancDescartarRascunho() { _cqRascunhoLimpar(); const k = _cqLanc.grupo, modo = _cqLanc.modo; _cqLanc = _cqLancNovo(k); _cqLanc.modo = modo; _cqLancCarregarGrupo(); }
function cqLancLimpar() {
  if (!_cqLanc) return;
  _cqRascunhoLimpar();
  const k = _cqLanc.grupo, rep = _cqLanc.repeticaoDe, so = _cqLanc.somenteTestes, modo = _cqLanc.modo;
  _cqLanc = _cqLancNovo(k);
  _cqLanc.repeticaoDe = rep; _cqLanc.somenteTestes = so; _cqLanc.modo = modo;
  _cqLancCarregarGrupo();
}

// ── CORRIDA FRACIONADA ───────────────────────────────────────
function cqLancModo(modo) {
  if (!_cqLanc || !CQ_MODOS_CORRIDA[modo] || _cqLanc.modo === modo) return;
  // Ao passar para fracionada, mantém na grade os testes que já têm algo digitado
  if (modo === 'fracionada') _cqLanc.selecionados = _cqLancTodosTestes().filter(t => _cqLinhaPreenchida(_cqLanc.linhas[t.id])).map(t => t.id);
  _cqLanc.modo = modo;
  _cqRascunhoSalvar();
  _cqLancRedesenharGrade();
  _cqLancCarregarHistoricos();
}

function cqLancAdicionar(tid) {
  if (!_cqLancFrac() || !tid || _cqLanc.selecionados.includes(tid)) return;
  if (!_cqLancTodosTestes().some(t => t.id === tid)) return;
  if (!_cqLanc.linhas[tid]) _cqLanc.linhas[tid] = _cqLinhaVazia(tid);
  _cqLanc.selecionados.push(tid);
  _cqRascunhoSalvar();
  _cqLancRedesenharGrade();
  _cqLancCarregarHistoricos();
  const inp = document.querySelector(`#cq-grade .cq-g-input:not([disabled])[data-t="${tid}"]`);
  if (inp) inp.focus();
}

function cqLancRemover(tid) {
  if (!_cqLancFrac()) return;
  _cqLanc.selecionados = _cqLanc.selecionados.filter(x => x !== tid);
  _cqLanc.linhas[tid] = _cqLinhaVazia(tid);
  _cqRascunhoSalvar();
  _cqLancRedesenharGrade();
}

function _cqLancRedesenharGrade() {
  const grade = document.getElementById('cq-grade');
  if (!grade) { cqRender(); return; }
  const add = document.getElementById('cq-l-add');
  if (add) add.outerHTML = _cqLancAddHTML();
  const seg = document.getElementById('cq-l-modo');
  if (seg) seg.outerHTML = _cqLancModoHTML();
  const nota = document.getElementById('cq-l-nota');
  if (nota) nota.innerHTML = _cqLancNotaTxt();
  grade.innerHTML = _cqGradeHTML();
  _cqGradeAtualizarTudo();
}

function _cqLancModoHTML() {
  if (_cqLanc.somenteTestes) return '<div id="cq-l-modo"></div>';
  return `<div class="form-field" id="cq-l-modo"><label class="field-label">Corrida</label>
    <div class="cq-seg">${[['lote', 'Em lote'], ['fracionada', 'Fracionada']].map(([k, l]) => `<button type="button" class="${_cqLanc.modo === k ? 'active' : ''}" title="${_cqEsc(CQ_MODOS_CORRIDA[k])}" onclick="cqLancModo('${k}')">${l}</button>`).join('')}</div></div>`;
}

// Barra "Adicionar teste" da corrida fracionada: popover com busca e navegação por teclado
let _cqPick = { busca: '', ativo: 0, vis: [] };

function _cqLancAddHTML() {
  if (!_cqLancFrac()) return '<div id="cq-l-add"></div>';
  const resto = _cqPickOpcoes();
  const n = _cqLanc.selecionados.length;
  const off = !resto.length;
  return `<div class="cq-lanc-add" id="cq-l-add">
    <div class="cq-ms cq-pick${off ? ' cq-ms-off' : ''}" id="cq-l-pick">
      <div class="cq-ms-btn" id="cq-l-pick-btn" tabindex="${off ? -1 : 0}" role="button" aria-haspopup="listbox"
        onclick="cqPickAbrir()" onkeydown="cqPickTeclaBtn(event)">
        <span class="cq-pick-ico">${CQ_ICO.plus}</span>
        <span class="cq-ms-ph">${off ? 'Todos os testes do equipamento já foram adicionados' : 'Adicionar teste realizado — clique ou comece a digitar…'}</span>
        <svg class="cq-ms-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="cq-ms-pop" id="cq-l-pick-pop" style="display:none;" onkeydown="cqPickTecla(event)">
        <div class="cq-ms-busca">${CQ_ICO.busca}<input type="text" id="cq-l-pick-busca" placeholder="Buscar por analito, meio, método…" autocomplete="off" oninput="cqPickBuscar(this.value)"></div>
        <div class="cq-ms-lista cq-pick-lista" id="cq-l-pick-lista" role="listbox"></div>
        <div class="cq-pick-rodape"><span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>Enter</kbd> adicionar</span><span><kbd>Esc</kbd> fechar</span></div>
      </div>
    </div>
    <span class="cq-pick-cont"><b>${n}</b> de ${n + resto.length} teste(s) nesta corrida</span>
  </div>`;
}

// Testes ainda não adicionados, agrupados por analito
function _cqPickOpcoes() {
  const ultimo = (cqState.indices[_cqLanc.u] || {}).ultimo || {};
  return _cqLancTodosTestes().filter(t => !_cqLanc.selecionados.includes(t.id)).map(t => {
    const an = _cqAnalito(t.analitoId);
    const u = ultimo[t.id];
    return { id: t.id, grupo: an?.nome || _cqNomeTeste(t), label: t.metodo || an?.nome || _cqNomeTeste(t),
      sub: _cqTesteQual(t) ? (CQ_TIPOS_ANALITO[an?.tipo] || 'Qualitativo') : (an?.unidadeMedida || ''),
      ultimo: u?.dataHora || null, status: u?.status || null };
  }).sort((a, b) => a.grupo.localeCompare(b.grupo, 'pt') || a.label.localeCompare(b.label, 'pt'));
}

function _cqPickNorm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

// Destaca o trecho buscado (comparação sem acentos; índices preservados por caractere)
function _cqPickRealce(txt, q) {
  if (!q) return _cqEsc(txt);
  const i = _cqPickNorm(txt).indexOf(q);
  if (i < 0 || _cqPickNorm(txt).length !== String(txt).length) return _cqEsc(txt);
  return `${_cqEsc(txt.slice(0, i))}<mark>${_cqEsc(txt.slice(i, i + q.length))}</mark>${_cqEsc(txt.slice(i + q.length))}`;
}

function _cqPickListaHTML() {
  const q = _cqPickNorm(_cqPick.busca).trim();
  const termos = q.split(/\s+/).filter(Boolean);
  const vis = _cqPickOpcoes().filter(o => { const alvo = _cqPickNorm(`${o.grupo} ${o.label} ${o.sub}`); return termos.every(x => alvo.includes(x)); });
  _cqPick.vis = vis;
  if (_cqPick.ativo >= vis.length) _cqPick.ativo = Math.max(0, vis.length - 1);
  if (!vis.length) return `<div class="cq-ms-vazio">${q ? 'Nenhum teste encontrado.' : 'Nenhum teste disponível.'}</div>`;
  const cor = { aceito: 'cq-dot-verde', alerta: 'cq-dot-amarelo', rejeitado: 'cq-dot-vermelho' };
  let grupo = null;
  return vis.map((o, i) => {
    const cab = o.grupo !== grupo ? `<div class="cq-ms-grupo">${_cqPickRealce((grupo = o.grupo), termos[0])}</div>` : '';
    return `${cab}<div class="cq-ms-op cq-pick-op${i === _cqPick.ativo ? ' ativo' : ''}" role="option" aria-selected="${i === _cqPick.ativo}" data-i="${i}"
        onmousedown="event.preventDefault()" onclick="cqPickEscolher(${i})" onmousemove="cqPickHover(${i})">
      <span class="cq-ms-op-txt"><span>${_cqPickRealce(o.label, termos[0])}</span>${o.sub ? `<small>${_cqEsc(o.sub)}</small>` : ''}</span>
      <span class="cq-pick-ult" title="${o.status ? 'Última avaliação: ' + _cqEsc(CQ_STATUS[o.status]?.label || o.status) : ''}">
        ${o.ultimo ? `${o.status ? `<span class="cq-dot ${cor[o.status] || ''}"></span>` : ''}último ${_cqFmtDH(o.ultimo)}` : '<i>sem lançamentos</i>'}</span>
    </div>`;
  }).join('');
}

function cqPickAbrir(textoInicial) {
  const pop = document.getElementById('cq-l-pick-pop');
  if (!pop || document.getElementById('cq-l-pick')?.classList.contains('cq-ms-off')) return;
  if (pop.style.display !== 'none' && textoInicial === undefined) { cqPickFechar(); return; }
  _cqPick = { busca: textoInicial || '', ativo: 0, vis: [] };
  const inp = document.getElementById('cq-l-pick-busca');
  if (inp) inp.value = _cqPick.busca;
  document.getElementById('cq-l-pick-lista').innerHTML = _cqPickListaHTML();
  pop.style.display = '';
  document.getElementById('cq-l-pick')?.classList.add('aberto');
  setTimeout(() => { inp?.focus(); if (inp) inp.selectionStart = inp.selectionEnd = inp.value.length; }, 20);
}

function cqPickFechar(foco) {
  const pop = document.getElementById('cq-l-pick-pop');
  if (!pop || pop.style.display === 'none') return;
  pop.style.display = 'none';
  document.getElementById('cq-l-pick')?.classList.remove('aberto');
  if (foco) document.getElementById('cq-l-pick-btn')?.focus();
}

function cqPickBuscar(q) {
  _cqPick.busca = q;
  _cqPick.ativo = 0;
  const l = document.getElementById('cq-l-pick-lista');
  if (l) { l.innerHTML = _cqPickListaHTML(); l.scrollTop = 0; }
}

function cqPickHover(i) {
  if (_cqPick.ativo === i) return;
  _cqPick.ativo = i;
  document.querySelectorAll('#cq-l-pick-lista .cq-pick-op').forEach(el => el.classList.toggle('ativo', Number(el.dataset.i) === i));
}

function cqPickEscolher(i) {
  const o = _cqPick.vis[i];
  if (!o) return;
  cqPickFechar();
  cqLancAdicionar(o.id);
}

// Botão fechado: Enter/espaço/seta abrem; digitar uma letra abre já filtrando
function cqPickTeclaBtn(e) {
  if (['Enter', ' ', 'ArrowDown'].includes(e.key)) { e.preventDefault(); cqPickAbrir(); return; }
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); cqPickAbrir(e.key); }
}

function cqPickTecla(e) {
  const n = _cqPick.vis.length;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cqPickFechar(true); return; }
  if (e.key === 'Enter') { e.preventDefault(); cqPickEscolher(_cqPick.ativo); return; }
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' || !n) return;
  e.preventDefault();
  _cqPick.ativo = (_cqPick.ativo + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
  cqPickHover(_cqPick.ativo);
  document.querySelector(`#cq-l-pick-lista .cq-pick-op[data-i="${_cqPick.ativo}"]`)?.scrollIntoView({ block: 'nearest' });
}

document.addEventListener('mousedown', e => {
  const el = document.getElementById('cq-l-pick');
  if (el && !el.contains(e.target)) cqPickFechar();
});

function _cqLancNotaTxt() {
  return (_cqLancFrac() ? 'Corrida fracionada: adicione só os testes realizados neste horário; os demais ficam para outra corrida. ' : '')
    + 'Enter avança para a linha de baixo. Colar uma coluna do Excel preenche as linhas seguintes. Valores com vírgula ou ponto decimal.';
}

function _cqMaxNiveis(testes) { return Math.max(1, ...testes.map(t => Math.max(0, ..._cqNiveisTeste(t)))); }

function _cqGradeHTML() {
  const testes = _cqLancTestes();
  const maxN = _cqMaxNiveis(testes);
  const head = `<thead><tr><th class="cq-g-real" title="Marque os testes não realizados nesta corrida">Execução</th><th class="cq-g-teste">Teste</th>${Array.from({ length: maxN }, (_, i) => `<th class="cq-g-nivel">Nível ${i + 1}</th>`).join('')}<th>Insumos (lote)</th><th class="cq-g-status">Avaliação</th></tr></thead>`;
  const rows = testes.map(t => {
    const l = _cqLanc.linhas[t.id] || {};
    const an = _cqAnalito(t.analitoId);
    const niveis = _cqNiveisTeste(t);
    const qual = _cqTesteQual(t);
    const escala = _cqArr(an?.escala);
    const cells = Array.from({ length: maxN }, (_, i) => {
      const n = i + 1;
      if (!niveis.includes(n)) return '<td class="cq-g-na"></td>';
      const lid = t.lotesAtivos?.[n];
      if (qual) {
        const bloq = l.nr || (!_cqNivelSemMaterial(t, n) && !lid);
        return `<td class="cq-g-cell cq-g-cell-q" id="cq-g-${t.id}-${n}">
        <select class="cq-g-input cq-g-qsel" data-t="${t.id}" data-n="${n}" ${bloq ? 'disabled' : ''} onchange="cqLancValor('${t.id}',${n},this.value)" onkeydown="cqLancTecla(event)">
          <option value="">—</option>${escala.map(e => `<option value="${_cqEsc(e)}" ${e === l.valores?.[n] ? 'selected' : ''}>${_cqEsc(e)}</option>`).join('')}</select>
        <div class="cq-g-alvo" id="cq-g-alvo-${t.id}-${n}"></div></td>`;
      }
      return `<td class="cq-g-cell" id="cq-g-${t.id}-${n}">
        <input type="text" inputmode="decimal" class="cq-g-input" data-t="${t.id}" data-n="${n}" value="${_cqEsc(l.valores?.[n] || '')}" ${l.nr || !lid ? 'disabled' : ''}
          oninput="cqLancValor('${t.id}',${n},this.value)" onkeydown="cqLancTecla(event)" onpaste="cqLancColar(event)" autocomplete="off">
        <div class="cq-g-alvo" id="cq-g-alvo-${t.id}-${n}"></div></td>`;
    }).join('');
    const diaCorrida = (_cqLanc.dataHora || _cqNowLocal()).slice(0, 10);
    const optIns = (lista, atual) => `<option value="">—</option>` + lista.map(i => `<option value="${i.id}" ${i.id === atual ? 'selected' : ''} ${i.vencido || i.bloqueado ? 'class="cq-opt-bloq"' : ''}>${_cqEsc(i.lote)}${i.vencido ? ' (vencido)' : i.bloqueado ? ' (quarentena)' : ''}</option>`).join('');
    const linhaTeste = `<td class="cq-g-teste"><div class="cq-g-nome">${_cqEsc(_cqNomeTeste(t))}</div><div class="cq-muted">${qual ? _cqEsc(CQ_TIPOS_ANALITO[an?.tipo] || '') : `${_cqEsc(an?.unidadeMedida || '')}${t.metodo ? ' · ' + _cqEsc(t.metodo) : ''}`}</div>
        ${_cqLancFrac() ? `<button type="button" class="cq-icobtn cq-g-remover" title="Remover este teste da corrida" onclick="cqLancRemover('${t.id}')">${CQ_ICO.close}</button>` : ''}
        ${typeof _cqEsterIncubSlotHTML === 'function' ? _cqEsterIncubSlotHTML(t) : ''}
        ${l.nr ? `<input type="text" class="field-input cq-g-nrmot" placeholder="Motivo do não realizado *" value="${_cqEsc(l.motivoNR)}" oninput="_cqLanc.linhas['${t.id}'].motivoNR=this.value;_cqRascunhoSalvar()">` : ''}</td>`;
    // Coluna à esquerda: Realizado ⇄ Não realizado
    const colReal = `<td class="cq-g-real"><button type="button" class="cq-g-realbtn${l.nr ? ' nr' : ''}" onclick="cqLancNR('${t.id}',${!l.nr})"
        title="${l.nr ? 'Clique para voltar a lançar este teste' : 'Clique para marcar como não realizado nesta corrida'}">
        <span class="cq-g-realbtn-ico">${l.nr ? CQ_ICO.ban : CQ_ICO.check}</span><span>${l.nr ? 'Não realizado' : 'Realizado'}</span></button></td>`;
    if (qual) {
      const tipo = t.insumoTipo;
      const prodNome = _cqNomeProdutoTeste(t);
      const lista = tipo ? _cqInsumosPara(t.analitoId, tipo, t.insumoProdutoId || t.insumoProduto, _cqEquipDoTeste(t), _cqLanc.u, diaCorrida) : [];
      return `<tr class="cq-g-row${l.nr ? ' cq-g-nr' : ''}" id="cq-g-row-${t.id}">${colReal}${linhaTeste}${cells}
      <td class="cq-g-ins">${tipo ? `<select class="field-select cq-g-sel" title="Lote de ${_cqEsc((CQ_TIPOS_INSUMO[tipo] || 'insumo').toLowerCase())}${prodNome ? ' — ' + _cqEsc(prodNome) : ''}" onchange="cqLancInsumo('${t.id}','lr',this.value)">${optIns(lista, l.lr)}</select>
        ${_cqLancPrepHTML(t, l)}
        <div class="cq-muted">${_cqEsc(prodNome || CQ_TIPOS_INSUMO[tipo] || '')}${t.exigirInsumo ? ' <span class="required">*</span>' : ''}</div>
        ${!lista.length ? `<div class="cq-txt-amarelo" style="font-size:11px;">${_cqEsc(_cqInsumosDiagnostico(t, tipo, _cqLanc.u))}</div>` : ''}` : '<span class="cq-muted">—</span>'}</td>
      <td class="cq-g-status" id="cq-g-st-${t.id}"></td></tr>`;
    }
    const reag = _cqInsumosPara(t.analitoId, 'reagente', '', _cqEquipDoTeste(t), _cqLanc.u, diaCorrida), cal = _cqInsumosPara(t.analitoId, 'calibrador', '', _cqEquipDoTeste(t), _cqLanc.u, diaCorrida);
    return `<tr class="cq-g-row${l.nr ? ' cq-g-nr' : ''}" id="cq-g-row-${t.id}">
      ${colReal}${linhaTeste}
      ${cells}
      <td class="cq-g-ins">
        ${reag.length ? `<select class="field-select cq-g-sel" title="Lote de reagente" onchange="cqLancInsumo('${t.id}','lr',this.value)">${optIns(reag, l.lr)}</select>${_cqLancPrepHTML(t, l)}` : ''}
        ${cal.length ? `<select class="field-select cq-g-sel" title="Lote de calibrador" onchange="cqLancInsumo('${t.id}','lk',this.value)">${optIns(cal, l.lk)}</select>` : ''}
        ${!reag.length && !cal.length ? '<span class="cq-muted">—</span>' : ''}
        <label class="cq-g-nrlbl"><input type="checkbox" ${l.posCalibracao ? 'checked' : ''} onchange="_cqLanc.linhas['${t.id}'].posCalibracao=this.checked"> após calibração</label>
      </td>
      <td class="cq-g-status" id="cq-g-st-${t.id}"></td></tr>`;
  }).join('');
  if (!testes.length && _cqLancFrac()) return head + `<tbody><tr><td colspan="${maxN + 4}" class="cq-td-vazio">Nenhum teste adicionado. Use “Adicionar teste” acima para incluir os testes realizados nesta corrida.</td></tr></tbody>`;
  return head + `<tbody>${rows}</tbody>`;
}

// ── LOTE DO CONTROLE NA GRADE ─────────────────────────────────
// Cada nível mostra o lote em uso. A troca feita aqui é definitiva (lote em uso do teste, com
// justificativa e trilha), como na aba "Uso nos testes" do lote; não é uma escolha por corrida,
// porque o lote define o alvo e o histórico das regras.
function _cqPodeTrocarLoteLanc() { return _cqCan('configurar') || _cqCan('liberar'); }
function _cqLancDia() { return (_cqLanc?.dataHora || _cqNowLocal()).slice(0, 10); }
function _cqMaterialDoNivel(t, n) { return _cqTesteQual(t) ? (_cqControleQual(t, n)?.materialId || '') : (t.materialId || ''); }
// Problema do lote na data da corrida ('' = utilizável)
function _cqLoteProblema(lote, t, n, dia) {
  if (!lote) return 'sem lote';
  if (_cqValidadeLote(lote, _cqNivelNoLote(t, n), _cqLanc?.u, dia)?.vencido) return 'vencido';
  if (lote.status === 'quarentena') return 'quarentena';
  if (lote.status === 'encerrado') return 'encerrado';
  return '';
}
function _cqLancLoteChip(t, n) {
  const lote = _cqLoteDoNivel(t, n);
  const prob = _cqLoteProblema(lote, t, n, _cqLancDia());
  const txt = lote ? `${lote.lote}${prob ? ' · ' + prob : ''}` : 'sem lote';
  const tit = `Lote do controle${lote ? ` ${lote.lote} · val. ${_cqFmtData(lote.validade)}` : ''}${prob ? ` — ${prob}` : ''}`;
  if (!_cqPodeTrocarLoteLanc()) return `<span class="cq-g-lote${prob ? ' erro' : ''}" title="${_cqEsc(tit)}">${_cqEsc(txt)}</span>`;
  return `<button type="button" class="cq-g-lote${prob ? ' erro' : ''}" title="${_cqEsc(tit)}. Clique para trocar o lote em uso." onclick="cqLancTrocarLote('${t.id}',${n})">${_cqEsc(txt)}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><polyline points="6 9 12 15 18 9"/></svg></button>`;
}
// Lotes que podem assumir o nível: mesmo material, nível presente no lote (quantitativo), unidade do teste,
// em uso ou em avaliação e dentro da validade na data da corrida
function _cqLotesTrocaNivel(t, n, dia) {
  const matId = _cqMaterialDoNivel(t, n);
  if (!matId) return [];
  const qual = _cqTesteQual(t);
  return Object.values(cqState.config.lotesControle)
    .filter(l => l.materialId === matId && _cqNaUnidade(l, t.unidadeId) && ['em_uso', 'em_avaliacao'].includes(l.status || 'em_uso')
      && !(l.validade && l.validade < dia) && (qual || _cqArr(l.niveis).map(Number).includes(Number(n))))
    .sort((a, b) => (b.validade || '').localeCompare(a.validade || ''));
}
function cqLancTrocarLote(tid, n) {
  const t = cqState.config.testes[tid];
  if (!t) return;
  if (!_cqPodeTrocarLoteLanc()) { showToast('Sem permissão para trocar o lote em uso do teste.', 'error'); return; }
  const dia = _cqLancDia();
  const qual = _cqTesteQual(t);
  const atual = _cqLoteDoNivel(t, n);
  const cands = _cqLotesTrocaNivel(t, n, dia).filter(l => l.id !== atual?.id);
  const mat = cqState.config.materiais[_cqMaterialDoNivel(t, n)];
  if (!cands.length) { showToast(`Nenhum outro lote de ${mat?.nome || 'controle'} em uso ou em avaliação, dentro da validade, nesta área. Cadastre-o em Controles/Materiais.`, 'error'); return; }
  const dec = _cqAnalito(t.analitoId)?.decimais ?? 2;
  const alvoTxt = (l, m) => { const a = _cqAlvoVigente(t.id, l.id, m, _cqLanc?.dataHora); return a ? `${_cqNum(a.media, dec)} ± ${_cqNum(a.dp, dec + 1)}` : 'sem alvo'; };
  const rot = m => qual ? _cqRotuloNivel(t, m) : `N${m}`;
  // Níveis do teste com o mesmo material: a troca costuma valer para o frasco todo
  const mesmos = _cqNiveisTeste(t).filter(m => _cqMaterialDoNivel(t, m) === _cqMaterialDoNivel(t, n));
  const marcado = m => Number(m) === Number(n) || (atual && t.lotesAtivos?.[m] === atual.id);
  _cqPrompt({
    titulo: 'Trocar lote do controle', subtitulo: `${_cqNomeTeste(t)} · ${_cqEquipTeste(t)}`,
    corpo: `<div class="cq-nota">Lote em uso hoje: <b>${_cqEsc(atual?.lote || 'nenhum')}</b>${mat ? ` (${_cqEsc(mat.nome)})` : ''}. A troca vale para as próximas corridas deste teste e fica registrada no teste e no lote.</div>
      <div class="form-field"><label class="field-label">Novo lote <span class="required">*</span></label>
        <select id="cq-lanc-troca-lote" class="field-select">${cands.map(l => `<option value="${l.id}">${_cqEsc(l.lote)} · val. ${_cqFmtData(l.validade)} · ${_cqEsc(CQ_STATUS_LOTE[l.status || 'em_uso']?.label || l.status)}${qual ? '' : ` · alvo ${rot(n)}: ${alvoTxt(l, n)}`}</option>`).join('')}</select></div>
      ${mesmos.length > 1 ? `<div class="form-field"><label class="field-label">Níveis</label><div class="cq-checks cq-checks-inline">${mesmos.map(m => `<label class="oc-check"><input type="checkbox" class="cq-lanc-troca-niv" value="${m}" ${marcado(m) ? 'checked' : ''}> ${_cqEsc(rot(m))} <span class="cq-muted">(hoje: ${_cqEsc(_cqLoteDoNivel(t, m)?.lote || 'sem lote')})</span></label>`).join('')}</div></div>` : ''}
      <div class="form-field"><label class="field-label">Justificativa <span class="required">*</span></label>
        <textarea id="cq-lanc-troca-just" class="field-textarea" style="min-height:60px;" placeholder="Ex.: frasco do lote anterior esgotado; início do lote novo."></textarea></div>
      ${qual ? '' : '<div class="cq-nota">Lote sem alvo vigente: a corrida é avaliada como “sem alvo” até o alvo ser cadastrado (aba Alvos do teste).</div>'}`,
    confirmar: 'Trocar lote',
    onConfirm: async () => {
      const lote = cqState.config.lotesControle[_cqVal('cq-lanc-troca-lote')];
      const just = _cqVal('cq-lanc-troca-just');
      const niveis = mesmos.length > 1 ? [...document.querySelectorAll('#cq-prompt-body .cq-lanc-troca-niv:checked')].map(c => Number(c.value)) : [Number(n)];
      if (!lote) { showToast('Selecione o novo lote.', 'error'); return false; }
      if (!niveis.length) { showToast('Selecione ao menos um nível.', 'error'); return false; }
      if (!qual) {
        const fora = niveis.filter(m => !_cqArr(lote.niveis).map(Number).includes(m));
        if (fora.length) { showToast(`O lote ${lote.lote} não tem o(s) nível(is) ${fora.map(rot).join(', ')}.`, 'error'); return false; }
      }
      if (!just) { showToast('Informe a justificativa.', 'error'); return false; }
      if (!_cqPodeGravar()) return false;
      const la = { ...(t.lotesAtivos || {}) };
      niveis.forEach(m => { la[m] = lote.id; });
      const fmtL = v => Object.entries(v || {}).map(([m, id]) => `${rot(m)}: ${cqState.config.lotesControle[id]?.lote || id}`).join('; ') || '—';
      const agora = _cqAgora();
      const C = CQ_KEYS.config;
      const ok = await window.dbUpdate({
        [`${C}/testes/${t.id}/lotesAtivos`]: la,
        [`${C}/testes/${t.id}/atualizadoEm`]: agora,
        [`${C}/testes/${t.id}/trilha/${_cqTk()}`]: _cqTrilhaEntry('edicao', `Troca de lote no lançamento da corrida: ${just}`, [{ campo: CQ_LBL_TESTE.lotesAtivos, antes: fmtL(t.lotesAtivos), depois: fmtL(la) }]),
        [`${C}/lotesControle/${lote.id}/atualizadoEm`]: agora,
        [`${C}/lotesControle/${lote.id}/trilha/${_cqTk()}`]: _cqTrilhaEntry('edicao', `Definido como lote em uso de ${_cqNomeTeste(t)} · ${_cqEquipTeste(t)} (${niveis.map(rot).join(', ')}) no lançamento da corrida: ${just}`),
      });
      if (!ok) { showToast('Falha ao gravar. Verifique a conexão.', 'error'); return false; }
      cqState.config.testes[t.id] = { ...t, lotesAtivos: la };
      const semAlvo = qual ? [] : niveis.filter(m => !_cqAlvoVigente(t.id, lote.id, m, _cqLanc?.dataHora));
      showToast(semAlvo.length ? `Lote ${lote.lote} em uso. Sem alvo em ${semAlvo.map(rot).join(', ')}: cadastre-o na aba Alvos do teste.` : `Lote ${lote.lote} em uso.`, semAlvo.length ? 'error' : 'success');
      if (typeof _cqLancRedesenharGrade === 'function') _cqLancRedesenharGrade();
      return true;
    },
  });
}

function cqLancValor(tid, n, v) {
  const l = _cqLanc?.linhas[tid];
  if (!l) return;
  l.valores[n] = v;
  _cqRascunhoSalvar();
  const t = cqState.config.testes[tid];
  if (t) _cqGradeAtualizarLinha(t);
}
function cqLancNR(tid, v) {
  const l = _cqLanc.linhas[tid];
  l.nr = v;
  if (v) l.valores = {};
  _cqRascunhoSalvar();
  document.getElementById('cq-grade').innerHTML = _cqGradeHTML();
  _cqGradeAtualizarTudo();
  if (v) document.querySelector(`#cq-g-row-${tid} .cq-g-nrmot`)?.focus();
}
function cqLancInsumo(tid, campo, v) {
  const l = _cqLanc.linhas[tid];
  l[campo] = v;
  if (campo === 'lr') { delete l.prep; l.prepData = ''; l.prepResp = ''; delete l.prepLiberar; }   // o preparo pertence ao lote escolhido
  _cqRascunhoSalvar();
  if (campo === 'lr') { _cqLancRedesenharGrade(); return; }
  _cqGradeAtualizarLinha(cqState.config.testes[tid]);
}

// Preparo do lote de insumo preparado no laboratório: escolhe um preparo existente ou registra um novo
function _cqLancPrepHTML(t, l) {
  const ins = l.lr ? cqState.config.insumos[l.lr] : null;
  if (!ins?.preparoInterno) return '';
  const dia = (_cqLanc.dataHora || _cqNowLocal()).slice(0, 10);
  // Uso único: só os preparos ainda não usados em corrida (registrados antes na aba Preparos), do mais antigo ao mais novo
  const unico = !!ins.preparoUsoUnico;
  const preps = _cqPreparosDe(ins).filter(p => (!p.finalizado && !(unico && Object.keys(p.corridas || {}).length)) || p.id === l.prep);
  if (l.prep === undefined) l.prep = (unico ? [...preps].reverse() : preps).find(p => _cqPrepUsavel(p, dia))?.id || 'novo';
  if (l.prep === 'novo') { l.prepData = l.prepData || dia; l.prepResp = l.prepResp || _cqSess().id; l.prepUn = l.prepUn || _cqPrepUltimaUnidade(_cqLoteCru(ins).produtoId) || 'mL'; }
  const respNome = id => { const u = _cqUsuarios().find(x => x.id === id); return u ? (u.nomeCompleto || u.username) : ''; };
  const ops = preps.map(p => {
    const venc = p.validade && p.validade < dia;
    return `<option value="${p.id}" ${p.id === l.prep ? 'selected' : ''} ${p.situacao === 'reprovado' ? 'disabled' : ''}>Preparo ${_cqEsc(_cqPrepTxt(p))}${venc ? ' (vencido)' : p.situacao === 'reprovado' ? ' (reprovado)' : p.situacao === 'em_avaliacao' ? ' (em avaliação)' : ''}</option>`;
  }).join('');
  const info = `cqPreparoInfo('${ins.id}','${l.prep}','${l.prepData || ''}','${_cqEsc(respNome(l.prepResp)).replace(/'/g, '&#39;')}')`;
  const camposNovo = `<input type="date" class="field-input" title="Data do preparo" max="${dia}" value="${_cqEsc(l.prepData)}" onchange="cqLancPrepCampo('${t.id}','prepData',this.value)">
      <select class="field-select" title="Responsável pelo preparo" onchange="cqLancPrepCampo('${t.id}','prepResp',this.value)">${(_cqUsuariosDaUnidade(_cqLanc.u).length ? _cqUsuariosDaUnidade(_cqLanc.u) : _cqUsuarios()).map(u => `<option value="${u.id}" ${u.id === l.prepResp ? 'selected' : ''}>${_cqEsc(u.nomeCompleto || u.username)}</option>`).join('')}</select>
      <div class="cq-prep-qtd-lin"><input type="number" class="field-input" min="0" step="any" inputmode="decimal" title="Quantidade preparada (opcional)" placeholder="Qtd. (opcional)" value="${_cqEsc(l.prepQtd || '')}" onchange="cqLancPrepCampo('${t.id}','prepQtd',this.value)">
        <select class="field-select" title="Unidade" onchange="cqLancPrepCampo('${t.id}','prepUn',this.value)">${CQ_UNID_PREPARO.map(x => `<option ${x === l.prepUn ? 'selected' : ''}>${x}</option>`).join('')}</select></div>`;
  // Lote sem preparos registrados: a lista teria só "+ Novo preparo", então vai direto para data e responsável
  if (!preps.length) {
    return `<div class="cq-prep-novo">
      <div class="cq-prep-cab"><span>${unico ? 'Preparo (uso único)' : 'Preparo'}</span><button type="button" class="cq-icobtn" title="Informações do preparo" onclick="${info}">${CQ_ICO.info}</button></div>
      ${camposNovo}
    </div>
    <div class="cq-plib-slot" id="cq-g-plib-${t.id}"></div>`;
  }
  return `<div class="cq-prep">
      <select class="field-select cq-g-sel" title="Preparo do lote ${_cqEsc(ins.lote)}" onchange="cqLancPrep('${t.id}',this.value)">${ops}<option value="novo" ${l.prep === 'novo' ? 'selected' : ''}>+ Novo preparo</option></select>
      <button type="button" class="cq-icobtn" title="Informações do preparo" onclick="${info}">${CQ_ICO.info}</button>
    </div>
    ${l.prep === 'novo' ? `<div class="cq-prep-novo">${camposNovo}</div>` : ''}
    <div class="cq-plib-slot" id="cq-g-plib-${t.id}"></div>`;
}
function cqLancPrep(tid, v) {
  const l = _cqLanc.linhas[tid];
  l.prep = v;
  delete l.prepLiberar;
  if (v !== 'novo') { l.prepData = ''; l.prepResp = ''; l.prepQtd = ''; }
  _cqRascunhoSalvar();
  _cqLancRedesenharGrade();
}
function cqLancPrepCampo(tid, campo, v) { _cqLanc.linhas[tid][campo] = v; _cqRascunhoSalvar(); }

// ── Liberar o preparo em avaliação com a corrida ──
// Corrida aceita aprova o preparo usado nela. Marcado aqui, ele passa a Liberado só quando a corrida
// é publicada, com a justificativa automática "Corrida aprovada"; se algum teste da corrida que usa o
// mesmo preparo não estiver aceito, ele continua em avaliação (decisão da corrida).
const CQ_PREP_LIB_MOTIVO = 'Corrida aprovada';
const CQ_ICO_SETA_LIB = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="13 6 19 12 13 18"/></svg>';
// Preparo da linha que pode ser liberado: em avaliação (ou novo, que nasce em avaliação)
function _cqLancPrepLibAlvo(l) {
  const ins = l.lr ? cqState.config.insumos[l.lr] : null;
  if (!ins?.preparoInterno || !l.prep || l.prep === 'legado') return null;
  if (l.prep === 'novo') return ins.preparo?.liberaSemCIQ ? null : { rot: 'o novo preparo' };
  const p = _cqPreparo(ins, l.prep);
  return p && !p.legado && (p.situacao || 'em_avaliacao') === 'em_avaliacao' ? { rot: p.codigo ? `o preparo ${p.codigo}` : 'o preparo' } : null;
}
function _cqLancPrepLibChave(l) { return l.prep === 'novo' ? `${l.lr}|novo|${l.prepData}|${l.prepResp}` : `${l.lr}|${l.prep}`; }

function _cqLancPrepLibAtualizar(t) {
  const el = document.getElementById('cq-g-plib-' + t.id);
  if (!el) return;
  const l = _cqLanc.linhas[t.id];
  const alvo = l && !l.nr && _cqPodeSituacaoPreparo() ? _cqLancPrepLibAlvo(l) : null;
  if (!alvo) { el.innerHTML = ''; el._html = ''; return; }
  const a = _cqAvaliarLinha(t);
  const s = a.preenchidos && a.completo && !a.erros.length ? (a.r?.status || 'sem_alvo') : null;
  const pode = s === 'aceito';
  // Política da área que já libera corridas aceitas ao salvar: o preparo vai junto
  const g = pode ? _cqGruposLanc(_cqLanc.u).find(x => x.key === _cqLanc.grupo) : null;
  const auto = pode && !!_cqPolitica(_cqLanc.u).liberarAceitosAoSalvar && _cqCan('liberar') && g?.ativo?.statusUso !== 'em_pausa';
  const on = auto || (pode && !!l.prepLiberar);
  const titulo = on ? 'Liberado ao publicar a corrida' : 'Liberar preparo com esta corrida';
  const sub = auto ? ''   // automático: título e fluxo bastam
    : on ? `Justificativa automática: “${CQ_PREP_LIB_MOTIVO}”. Só vale depois de publicar.`
    : pode ? `Corrida aceita: ${alvo.rot} pode passar a Liberado.`
    : s === 'rejeitado' ? 'Resultado rejeitado: o preparo continua em avaliação.'
    : s === 'alerta' ? 'Resultado com alerta: libere pela decisão da corrida.'
    : s === 'sem_alvo' ? 'Sem alvo para avaliar: libere pela decisão da corrida.'
    : 'Disponível quando o resultado for aceito.';
  const fluxo = on ? `<span class="cq-plib-fluxo"><span class="cq-badge cq-st-pendente">Em avaliação</span>${CQ_ICO_SETA_LIB}<span class="cq-badge cq-st-aceito">Liberado</span></span>` : '';
  const html = `<button type="button" class="cq-plib${on ? ' on' : ''}${pode ? '' : ' bloq'}${auto ? ' auto' : ''}" role="switch" aria-checked="${on}"
      ${pode && !auto ? '' : 'disabled'} onclick="cqLancPrepLiberar('${t.id}')" title="${on ? 'Clique para não liberar o preparo' : 'Liberar o preparo quando a corrida for publicada'}">
      <span class="cq-plib-ico">${on ? CQ_ICO.check : CQ_ICO.shield}</span>
      <span class="cq-plib-txt"><b>${titulo}</b>${sub ? `<small>${sub}</small>` : ''}${fluxo}</span>
      ${pode && !auto ? '<span class="cq-plib-sw" aria-hidden="true"><span></span></span>' : ''}
    </button>`;
  // Só redesenha quando muda (a cada tecla a linha é reavaliada; o brilho não deve repetir)
  if (el._html !== html) { el.innerHTML = html; el._html = html; }
}
function cqLancPrepLiberar(tid) {
  const l = _cqLanc?.linhas[tid];
  if (!l) return;
  l.prepLiberar = !l.prepLiberar;
  _cqRascunhoSalvar();
  _cqLancPrepLibAtualizar(cqState.config.testes[tid]);
}

function cqLancTecla(e) {
  if (e.key !== 'Enter' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  // Em listas (qualitativos) as setas escolhem a opção; só Enter avança
  if (e.target.tagName === 'SELECT' && e.key !== 'Enter') return;
  e.preventDefault();
  const inputs = [...document.querySelectorAll('#cq-grade .cq-g-input:not([disabled])')];
  const el = e.target;
  const mesmos = inputs.filter(i => i.dataset.n === el.dataset.n);
  let idx = mesmos.indexOf(el) + (e.key === 'ArrowUp' ? -1 : 1);
  let alvo = mesmos[idx];
  if (!alvo && e.key === 'Enter') {
    // fim da coluna: vai para o topo da próxima coluna
    const prox = inputs.filter(i => Number(i.dataset.n) === Number(el.dataset.n) + 1);
    alvo = prox[0];
  }
  if (alvo) { alvo.focus(); alvo.select(); }
}

function cqLancColar(e) {
  const txt = (e.clipboardData || window.clipboardData)?.getData('text') || '';
  const linhas = txt.replace(/\r/g, '').split('\n').filter((x, i, a) => x !== '' || i < a.length - 1);
  if (linhas.length <= 1) return;
  e.preventDefault();
  const el = e.target;
  const mesmos = [...document.querySelectorAll(`#cq-grade .cq-g-input:not([disabled])[data-n="${el.dataset.n}"]`)];
  let i = mesmos.indexOf(el);
  linhas.forEach(v => {
    const inp = mesmos[i++];
    if (!inp) return;
    inp.value = v.split('\t')[0].trim();
    cqLancValor(inp.dataset.t, Number(inp.dataset.n), inp.value);
  });
}

// Avaliação em tempo real de uma linha (teste)
function _cqAvaliarLinha(t) {
  if (_cqTesteQual(t)) return _cqAvaliarLinhaQual(t);
  const l = _cqLanc.linhas[t.id] || { valores: {} };
  const porNivel = {}, atual = [], erros = [];
  _cqNiveisTeste(t).forEach(n => {
    const txt = (l.valores?.[n] || '').trim();
    if (!txt) return;
    const v = CQEngine.parseNumero(txt);
    if (v === null) { erros.push(`Nível ${n}: valor inválido "${txt}"`); porNivel[n] = { invalido: true }; return; }
    const lid = t.lotesAtivos?.[n];
    const alvo = lid ? _cqAlvoVigente(t.id, lid, n, _cqLanc.dataHora) : null;
    const z = alvo ? CQEngine.zScore(v, alvo.media, alvo.dp) : null;
    porNivel[n] = { valor: v, alvo, z, loteId: lid };
    atual.push({ nivel: n, z });
  });
  const niveis = _cqNiveisTeste(t);
  const preenchidos = Object.keys(porNivel).length;
  const completo = preenchidos === niveis.length && !erros.length;
  let r = null;
  if (atual.length && !erros.length) {
    r = CQEngine.avaliarCorrida({ atual, historico: _cqLanc.hist[t.id] || [], regras: t.regras || {}, opcoes: { gatilho12s: !!t.opcoesRegras?.gatilho12s } });
    if (typeof _cqEsterAplicar === 'function') r = _cqEsterAplicar(r, _cqEsterFalhasLanc());
  }
  return { porNivel, r, completo, preenchidos, erros };
}

// Qualitativo: compara o resultado escolhido com o esperado de cada controle
function _cqAvaliarLinhaQual(t) {
  const l = _cqLanc.linhas[t.id] || { valores: {} };
  const an = _cqAnalito(t.analitoId);
  const escala = _cqArr(an?.escala);
  const porNivel = {}, atual = [], erros = [];
  _cqNiveisTeste(t).forEach(n => {
    const txt = String(l.valores?.[n] || '').trim();
    if (!txt) return;
    const obtido = escala.find(e => e.toLowerCase() === txt.toLowerCase());
    if (!obtido) { erros.push(`Nível ${n}: resultado fora da lista "${txt}"`); porNivel[n] = { invalido: true }; return; }
    const c = _cqControleQual(t, n) || {};
    porNivel[n] = { obtido, esperado: c.esperado || null, loteId: c.materialId ? (t.lotesAtivos?.[n] || null) : null };
    atual.push({ nivel: n, obtido, esperado: c.esperado || '', rotulo: _cqRotuloNivel(t, n) });
  });
  const preenchidos = Object.keys(porNivel).length;
  const completo = preenchidos === _cqNiveisTeste(t).length && !erros.length;
  let r = atual.length && !erros.length
    ? CQEngine.avaliarCorridaQualitativa({ atual, tipo: an?.tipo, escala, tolerancia: an?.toleranciaPassos })
    : null;
  // Ciclo de esterilização com parâmetro físico fora da especificação: indicador rejeitado
  if (r && typeof _cqEsterAplicar === 'function') r = _cqEsterAplicar(r, _cqEsterFalhasLanc());
  return { porNivel, r, completo, preenchidos, erros, qual: true };
}

function _cqGradeAtualizarLinhaQual(t, st, l) {
  _cqNiveisTeste(t).forEach(n => {
    const el = document.getElementById(`cq-g-alvo-${t.id}-${n}`);
    if (!el) return;
    const c = _cqControleQual(t, n) || {};
    const mat = cqState.config.materiais[c.materialId];
    el.innerHTML = `<div><span title="${_cqEsc(mat ? `${mat.nome}${mat.codigoReferencia ? ' · ' + mat.codigoReferencia : ''}` : 'Sem material')}">${_cqEsc(_cqRotuloNivel(t, n))}</span>
      · esp.: ${c.esperado ? _cqEsc(c.esperado) : '<span class="cq-txt-vermelho">não definido</span>'}</div>
      ${_cqNivelSemMaterial(t, n) ? '' : `<div class="cq-g-lote-lin">${_cqLancLoteChip(t, n)}</div>`}`;
  });
  if (l.nr) { st.innerHTML = '<span class="cq-muted">não realizado</span>'; return; }
  const a = _cqAvaliarLinhaQual(t);
  _cqNiveisTeste(t).forEach(n => {
    const cell = document.getElementById(`cq-g-${t.id}-${n}`);
    if (!cell) return;
    cell.classList.remove('cq-c-aceito', 'cq-c-alerta', 'cq-c-rejeitado', 'cq-c-semalvo', 'cq-c-invalido');
    const pn = a.porNivel[n];
    if (!pn) return;
    if (pn.invalido) { cell.classList.add('cq-c-invalido'); return; }
    const s = a.r?.porNivel[n]?.status || 'sem_alvo';
    cell.classList.add({ aceito: 'cq-c-aceito', alerta: 'cq-c-alerta', rejeitado: 'cq-c-rejeitado', sem_alvo: 'cq-c-semalvo' }[s]);
  });
  if (a.erros.length) { st.innerHTML = `<span class="cq-txt-vermelho">${_cqEsc(a.erros[0])}</span>`; return; }
  if (!a.preenchidos) { st.innerHTML = ''; return; }
  const s = a.r?.status || 'sem_alvo';
  st.innerHTML = `${_cqBadge(CQ_STATUS, s)}${a.r?.violacoes.length ? ` <span class="cq-g-regras">${a.r.violacoes.map(v => CQEngine.rotuloRegra(v.regra)).join(', ')}</span>` : ''}
    ${!a.completo ? '<div class="cq-muted cq-g-zs"><span class="cq-txt-amarelo">níveis faltando</span></div>' : ''}`;
}

function _cqGradeAtualizarTudo() {
  _cqLancTestes().forEach(_cqGradeAtualizarLinha);
  if (typeof _cqEsterIncubSync === 'function') _cqEsterIncubSync();   // incubação na linha do indicador biológico
}

function _cqGradeAtualizarLinha(t) {
  if (!t || !_cqLanc?.linhas[t.id]) return;
  const st = document.getElementById('cq-g-st-' + t.id);
  if (!st) return;
  const an = _cqAnalito(t.analitoId);
  const dec = an?.decimais ?? 2;
  const l = _cqLanc.linhas[t.id];
  _cqLancPrepLibAtualizar(t);
  if (_cqTesteQual(t)) { _cqGradeAtualizarLinhaQual(t, st, l); return; }
  _cqNiveisTeste(t).forEach(n => {
    const lid = t.lotesAtivos?.[n];
    const alvo = lid ? _cqAlvoVigente(t.id, lid, n, _cqLanc.dataHora) : null;
    const el = document.getElementById(`cq-g-alvo-${t.id}-${n}`);
    if (!el) return;
    const lote = lid ? cqState.config.lotesControle[lid] : null;
    el.innerHTML = `<div class="cq-g-lote-lin">${_cqLancLoteChip(t, n)}</div>${!lid ? ''
      : alvo ? `<div>${_cqNum(alvo.media, dec)} ± ${_cqNum(alvo.dp, dec + 1)}${['fabricante', 'provisorio'].includes(alvo.origem) ? ` <span title="Alvo ${_cqEsc(CQ_ORIGEM_ALVO[alvo.origem]?.label || 'provisório')}">*</span>` : ''}</div>`
      : '<div class="cq-txt-amarelo">sem alvo</div>'}`;
  });
  if (l.nr) { st.innerHTML = '<span class="cq-muted">não realizado</span>'; return; }
  const a = _cqAvaliarLinha(t);
  _cqNiveisTeste(t).forEach(n => {
    const cell = document.getElementById(`cq-g-${t.id}-${n}`);
    if (!cell) return;
    cell.classList.remove('cq-c-aceito', 'cq-c-alerta', 'cq-c-rejeitado', 'cq-c-semalvo', 'cq-c-invalido');
    const pn = a.porNivel[n];
    if (!pn) { cell.title = ''; return; }
    if (pn.invalido) { cell.classList.add('cq-c-invalido'); return; }
    const s = a.r?.porNivel[n]?.status || 'sem_alvo';
    cell.classList.add({ aceito: 'cq-c-aceito', alerta: 'cq-c-alerta', rejeitado: 'cq-c-rejeitado', sem_alvo: 'cq-c-semalvo' }[s]);
    cell.title = pn.z !== null ? `z = ${_cqNum(pn.z, 2)}` : 'Sem alvo';
  });
  const carregando = _cqLanc.carregando.has(t.id) || !_cqLanc.hist[t.id];
  if (a.erros.length) { st.innerHTML = `<span class="cq-txt-vermelho">${_cqEsc(a.erros[0])}</span>`; return; }
  if (!a.preenchidos) { st.innerHTML = carregando ? '<span class="cq-muted">carregando histórico…</span>' : ''; return; }
  const zs = Object.entries(a.porNivel).map(([n, p]) => `N${n} z=${p.z === null ? '—' : _cqNum(p.z, 2)}`).join(' · ');
  const s = a.r?.status || 'sem_alvo';
  st.innerHTML = `${_cqBadge(CQ_STATUS, s)}${a.r?.violacoes.length ? ` <span class="cq-g-regras">${a.r.violacoes.map(v => CQEngine.rotuloRegra(v.regra)).join(', ')}</span>` : ''}
    <div class="cq-muted cq-g-zs">${zs}${!a.completo ? ' · <span class="cq-txt-amarelo">níveis faltando</span>' : ''}${carregando ? ' · carregando histórico…' : ''}</div>`;
}

// ── SALVAR CORRIDA ───────────────────────────────────────────
async function cqLancSalvar() {
  if (_cqSalvando || !_cqLanc) return;
  if (!_cqCan('lancar')) { showToast('Sem permissão para lançar.', 'error'); return; }
  if (!_cqPodeGravar()) return;
  if (!_cqEstacao()) { showToast('Defina o nome desta estação de trabalho antes de lançar.', 'error'); cqEditarEstacao(); return; }
  const lanc = _cqLanc;
  const u = lanc.u;
  const un = cqState.config.unidades[u];
  const g = _cqGruposLanc(u).find(x => x.key === lanc.grupo);
  if (!g) { showToast('Selecione o equipamento.', 'error'); return; }
  const dh = _cqVal('cq-l-dh') || lanc.dataHora;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dh)) { showToast('Informe a data/hora da corrida.', 'error'); return; }
  if (dh > _cqNowLocal()) { showToast('A data/hora da corrida não pode estar no futuro.', 'error'); return; }
  const horas = _cqHorasAtras(dh);
  const retro = horas > (Number(_cqPolitica(u).retroativoHoras) || 0);
  if (retro && !lanc.retroJust.trim()) { showToast('Justifique o lançamento retroativo.', 'error'); return; }
  const operador = _cqUsuarios().find(x => x.id === lanc.operadorId);
  if (!operador) { showToast('Informe quem executou a corrida.', 'error'); return; }

  const testes = _cqLancTestes();
  const hoje = dh.slice(0, 10);
  const realizados = [], naoRealizados = [], problemas = [];
  testes.forEach(t => {
    const l = lanc.linhas[t.id];
    if (l.nr) {
      if (!l.motivoNR.trim()) problemas.push(`${_cqNomeTeste(t)}: informe o motivo de não realização`);
      else naoRealizados.push(t);
      return;
    }
    const a = _cqAvaliarLinha(t);
    if (!a.preenchidos) { if (_cqLancFrac()) problemas.push(`${_cqNomeTeste(t)}: digite os resultados ou remova o teste da corrida`); return; }
    if (a.erros.length) { problemas.push(`${_cqNomeTeste(t)}: ${a.erros[0]}`); return; }
    if (!a.completo) { problemas.push(`${_cqNomeTeste(t)}: preencha todos os níveis ou marque “não realizado”`); return; }
    _cqNiveisTeste(t).forEach(n => {
      if (_cqNivelSemMaterial(t, n)) return;
      const lote = _cqLoteDoNivel(t, n);
      if (!lote) { problemas.push(`${_cqNomeTeste(t)} N${n}: sem lote de controle definido`); return; }
      if (lote.status === 'quarentena') problemas.push(`${_cqNomeTeste(t)} N${n}: lote ${lote.lote} em quarentena`);
      const v = _cqValidadeLoteTeste(t, n, u, hoje);
      if (v?.vencido) problemas.push(`${_cqNomeTeste(t)} N${n}: ${v.motivo === 'estabilidade' ? 'frasco aberto/repique além da estabilidade' : 'lote vencido'} (${_cqFmtData(v.dataLimite)}) — RDC 978, art. 102`);
    });
    if (t.exigirInsumo && !l.lr) problemas.push(`${_cqNomeTeste(t)}: informe o lote do ${(CQ_TIPOS_INSUMO[t.insumoTipo] || 'insumo').toLowerCase()}`);
    const insP = l.lr ? cqState.config.insumos[l.lr] : null;
    if (insP?.preparoInterno) {
      if (!l.prep) problemas.push(`${_cqNomeTeste(t)}: informe o preparo do lote ${insP.lote}`);
      else if (l.prep === 'novo') {
        if (!l.prepData || !l.prepResp) problemas.push(`${_cqNomeTeste(t)}: informe data e responsável do novo preparo`);
        else if (l.prepData > hoje) problemas.push(`${_cqNomeTeste(t)}: data do preparo posterior à corrida`);
        else if (_cqPrepValidade(insP, l.prepData) < hoje) problemas.push(`${_cqNomeTeste(t)}: preparo de ${_cqFmtData(l.prepData)} vencido para esta corrida`);
      } else {
        const pp = _cqPreparo(insP, l.prep);
        if (!pp) problemas.push(`${_cqNomeTeste(t)}: preparo não encontrado — escolha outro`);
        else if (pp.situacao === 'reprovado') problemas.push(`${_cqNomeTeste(t)}: preparo de ${_cqFmtData(pp.data)} reprovado no controle`);
        else if (pp.finalizado) problemas.push(`${_cqNomeTeste(t)}: preparo de ${_cqFmtData(pp.data)} finalizado — escolha outro ou registre um novo`);
        else if (insP.preparoUsoUnico && Object.keys(pp.corridas || {}).length) problemas.push(`${_cqNomeTeste(t)}: preparo ${pp.codigo || 'de ' + _cqFmtData(pp.data)} de uso único já usado em outra corrida`);
        else if (pp.validade && pp.validade < hoje) problemas.push(`${_cqNomeTeste(t)}: preparo de ${_cqFmtData(pp.data)} vencido (${_cqFmtData(pp.validade)}) — RDC 978, art. 102`);
      }
    }
    ['lr', 'lk'].forEach(c => {
      const ins = l[c] ? cqState.config.insumos[l[c]] : null;
      if (ins && ins.validade && ins.validade < hoje) problemas.push(`${_cqNomeTeste(t)}: ${CQ_TIPOS_INSUMO[ins.tipo]} lote ${ins.lote} vencido — RDC 978, art. 102`);
      if (ins && ins.status === 'quarentena') problemas.push(`${_cqNomeTeste(t)}: ${CQ_TIPOS_INSUMO[ins.tipo]} lote ${ins.lote} em quarentena`);
    });
    realizados.push(t);
  });
  if (problemas.length) {
    showToast(problemas.slice(0, 3).join(' · ') + (problemas.length > 3 ? ` (+${problemas.length - 3})` : ''), 'error');
    return;
  }
  // Ficha do ciclo de esterilização (RDC 1002, art. 91)
  const ester = typeof _cqEsterValidar === 'function' ? _cqEsterValidar(dh) : { ciclo: null };
  if (ester.erro) { showToast(ester.erro, 'error'); return; }
  const ciclo = ester.ciclo;
  // Ciclo novo pode ser publicado sem testes (preparado): fica em análise até os indicadores
  if (!realizados.length && !(ciclo && !ciclo.vinculo)) { showToast(_cqLancFrac() && !testes.length ? 'Adicione ao menos um teste à corrida.' : 'Nenhum resultado digitado.', 'error'); return; }

  const btn = document.getElementById('cq-l-salvar');
  if (btn) btn.disabled = true;
  _cqSalvando = true;
  let reservaLote = null;     // caminho do lote da carga reservado; liberado se a corrida não for gravada
  let reservaNum = null;      // nº do ciclo automático reservado; devolvido se a corrida não for gravada
  let gravou = false;
  try {
    // Reavalia com o histórico atualizado (outra estação pode ter salvo agora)
    const antesDe = CQEngine.chaveTempo(dh) + '_~';
    lanc.dataHora = dh;
    await Promise.all(realizados.map(async t => { lanc.hist[t.id] = _cqTesteQual(t) ? [] : await cqHistoricoTeste(u, t, antesDe, { forcar: true }); }));
    const ck = CQEngine.chaveCorrida(dh);
    const mes = CQEngine.mesDe(dh);
    if (ciclo && !ciclo.vinculo) {
      const res = await _cqEsterReservarLote(u, ciclo.loteCarga, { corridaKey: ck, mes, dataHora: dh, equip: g.key });
      if (!res.ok) { showToast(res.msg, 'error'); if (typeof _cqEsterLoteConflito === 'function') _cqEsterLoteConflito(); return; }
      reservaLote = res.path;
      const rn = typeof _cqEsterReservarNumCiclo === 'function' ? await _cqEsterReservarNumCiclo(u, g.key) : null;
      if (rn === false) { showToast('Não foi possível gerar o nº do ciclo. Verifique a conexão e tente novamente.', 'error'); return; }
      if (rn) { reservaNum = rn; ciclo.numeroCicloEquip = String(rn.n); }
    }
    const numero = await _cqProximoNumero(u, 'corridas');
    if (!numero) { showToast('Não foi possível gerar o número da corrida. Tente novamente.', 'error'); return; }
    const pol = _cqPolitica(u);
    const podeLiberar = _cqCan('liberar');
    const verificacao = g.ativo?.statusUso === 'em_pausa';
    const ass = _cqAssinatura();
    const updates = {};
    const testesHdr = {};
    const idxUltimo = (cqState.indices[u] || {}).ultimo || {};
    const resumoTxt = [];
    // Preparos marcados para liberar com a corrida: valem se todos os testes que usam o preparo estão aceitos
    const prepLib = {};
    if (_cqPodeSituacaoPreparo()) realizados.forEach(t => {
      const l = lanc.linhas[t.id];
      if (!_cqLancPrepLibAlvo(l)) return;
      const k = _cqLancPrepLibChave(l);
      const x = prepLib[k] || (prepLib[k] = { pedido: false, ok: true });
      x.pedido = x.pedido || !!l.prepLiberar;
      x.ok = x.ok && _cqAvaliarLinha(t).r?.status === 'aceito';
    });
    const libPedida = l => { const x = prepLib[_cqLancPrepLibChave(l)]; return !!(x?.pedido && x.ok); };
    const prepLibFeitos = new Map();   // `${lr}|${prep}` → código (para o aviso e para não repetir)
    const prepNovos = {};      // `${lr}|${chave}` → objeto do preparo criado nesta corrida (compartilhado entre testes)
    const prepSeqUsado = {};   // lr → números de preparo já usados nesta corrida
    const prepDoTeste = (t, l, autoLib) => {
      const ins = l.lr ? cqState.config.insumos[l.lr] : null;
      if (!ins?.preparoInterno || !l.prep) return null;
      const uso = { numero, mes, dataHora: dh, testeId: t.id };
      const avaliacao = { numero, corridaKey: ck, mes, ..._cqAssinatura() };
      // Liberação pedida no lançamento: mesma origem (corrida), com a justificativa automática
      const libMan = !autoLib && libPedida(l);
      const avalLib = { ...avaliacao, acao: 'liberado', motivo: CQ_PREP_LIB_MOTIVO, comPublicacao: true };
      const histLib = { de: 'em_avaliacao', para: 'liberado', motivo: `${CQ_PREP_LIB_MOTIVO} — corrida ${numero}`, ...ass };
      const trilhaLib = cod => _cqTrilhaEntry('edicao', `Preparo ${cod} liberado com a publicação da corrida ${numero}: ${CQ_PREP_LIB_MOTIVO.toLowerCase()}`);
      if (l.prep === 'novo' || l.prep === 'legado') {
        const leg = l.prep === 'legado' ? _cqPreparo(ins, 'legado') : null;
        const k = `${l.lr}|${l.prep}|${l.prepData}|${l.prepResp}`;
        if (!prepNovos[k]) {
          const resp = _cqUsuarios().find(x => x.id === l.prepResp);
          const data = leg ? leg.data : l.prepData;
          const seq = _cqPrepSeq(ins) + (prepSeqUsado[l.lr] = (prepSeqUsado[l.lr] || 0) + 1) - 1;
          const qtd = leg ? 0 : Number(String(l.prepQtd || '').replace(',', '.'));
          const obj = { id: _cqUid(), seq, codigo: _cqPrepCodigo(ins, seq), data, responsavelId: leg ? null : l.prepResp, responsavel: leg ? leg.responsavel : (resp?.nomeCompleto || resp?.username || ''),
            ...(qtd > 0 ? { quantidade: qtd, unidadeQtd: l.prepUn || '' } : {}),
            validade: _cqPrepValidade(ins, data), situacao: leg ? 'liberado' : 'em_avaliacao', legado: !!leg, origem: 'lancamento', criadoEm: ass.em, criadoPor: ass, corridas: {} };
          // Uso único: consumido nesta corrida (sai dos lançamentos; a decisão da corrida ainda libera ou reprova)
          if (ins.preparoUsoUnico) obj.finalizado = { auto: true, motivo: `uso único — corrida ${numero}`, ...ass };
          // Produto liberado no registro (sem CIQ): nasce liberado, como na aba Preparos
          if (!leg && ins.preparo?.liberaSemCIQ) { obj.situacao = 'liberado'; obj.avaliacao = { auto: true, acao: 'liberado', motivo: 'Liberado no registro (produto sem corrida de CIQ)', ...ass }; }
          prepNovos[k] = obj;
          updates[`${CQ_KEYS.config}/insumos/${l.lr}/preparos/${obj.id}`] = obj;
          updates[`${CQ_KEYS.config}/insumos/${l.lr}/trilha/${_cqTk()}${obj.id.slice(-3)}`] = _cqTrilhaEntry('edicao', `Preparo ${obj.codigo} de ${_cqFmtData(data)} (${obj.responsavel}${_cqPrepQtdTxt(obj) ? ', ' + _cqPrepQtdTxt(obj) : ''}) registrado na corrida ${numero}`);
        }
        const obj = prepNovos[k];
        obj.corridas[ck] = uso;
        if (autoLib && obj.situacao === 'em_avaliacao') { obj.situacao = 'liberado'; obj.avaliacao = avaliacao; }
        else if (libMan && obj.situacao === 'em_avaliacao') {
          obj.situacao = 'liberado';
          obj.avaliacao = avalLib;
          obj.historico = { [_cqTk()]: histLib };
          updates[`${CQ_KEYS.config}/insumos/${l.lr}/trilha/${_cqTk()}${obj.id.slice(-3)}l`] = trilhaLib(obj.codigo);
          prepLibFeitos.set(`${l.lr}|${obj.id}`, obj.codigo);
        }
        return obj.id;
      }
      updates[`${CQ_KEYS.config}/insumos/${l.lr}/preparos/${l.prep}/corridas/${ck}`] = uso;
      // Uso único registrado antes (aba Preparos): consumido nesta corrida
      if (ins.preparoUsoUnico && !_cqPreparo(ins, l.prep)?.finalizado) updates[`${CQ_KEYS.config}/insumos/${l.lr}/preparos/${l.prep}/finalizado`] = { auto: true, motivo: `uso único — corrida ${numero}`, ...ass };
      const pAtual = _cqPreparo(ins, l.prep);
      if (autoLib && pAtual?.situacao === 'em_avaliacao') {
        updates[`${CQ_KEYS.config}/insumos/${l.lr}/preparos/${l.prep}/situacao`] = 'liberado';
        updates[`${CQ_KEYS.config}/insumos/${l.lr}/preparos/${l.prep}/avaliacao`] = avaliacao;
      } else if (libMan && pAtual?.situacao === 'em_avaliacao' && !prepLibFeitos.has(`${l.lr}|${l.prep}`)) {
        const pb = `${CQ_KEYS.config}/insumos/${l.lr}/preparos/${l.prep}`;
        const cod = pAtual.codigo || `de ${_cqFmtData(pAtual.data)}`;
        updates[`${pb}/situacao`] = 'liberado';
        updates[`${pb}/avaliacao`] = avalLib;
        updates[`${pb}/historico/${_cqTk()}`] = histLib;
        updates[`${CQ_KEYS.config}/insumos/${l.lr}/trilha/${_cqTk()}${l.prep.slice(-3)}l`] = trilhaLib(cod);
        prepLibFeitos.set(`${l.lr}|${l.prep}`, cod);
      }
      return l.prep;
    };

    realizados.forEach(t => {
      const l = lanc.linhas[t.id];
      const a = _cqAvaliarLinha(t);
      const r = a.r;
      const ult = idxUltimo[t.id];
      const trocaLr = !!(ult?.lr && l.lr && ult.lr !== l.lr);
      const trocaLk = !!(ult?.lk && l.lk && ult.lk !== l.lk);
      const autoLib = pol.liberarAceitosAoSalvar && podeLiberar && r.status === 'aceito' && !verificacao;
      const decisao = autoLib ? { acao: 'liberado', auto: true, comentario: 'Liberado ao salvar (sem violações)', ...ass } : null;
      const prepId = prepDoTeste(t, l, autoLib);
      const niveisMap = {};
      Object.entries(a.porNivel).forEach(([n, p]) => {
        const resKey = `${ck}_n${n}`;
        niveisMap[n] = resKey;
        const est = r.porNivel[n]?.status || 'sem_alvo';
        const res = a.qual ? CQEngine.compactarResultado({
          corridaKey: ck, nivel: Number(n), loteControleId: p.loteId, obtido: p.obtido, esperado: p.esperado,
          estado: CQ_ESTADO_SIGLA[est], regras: r.porNivel[n]?.regras || [], decisao: decisao ? 'L' : null, loteReagenteId: l.lr || null, preparoId: prepId,
        }) : CQEngine.compactarResultado({
          corridaKey: ck, nivel: Number(n), loteControleId: p.loteId, valor: p.valor, alvoId: p.alvo?.id || null,
          media: p.alvo?.media ?? null, dp: p.alvo?.dp ?? null, z: p.z === null ? null : CQEngine.arred(p.z, 4),
          estado: CQ_ESTADO_SIGLA[est], regras: r.porNivel[n]?.regras || [], decisao: decisao ? 'L' : null,
          loteReagenteId: l.lr || null, loteCalibradorId: l.lk || null, preparoId: prepId,
        });
        updates[`${CQ_KEYS.resultados}/${u}/${mes}/${t.id}/${resKey}`] = res;
        _cqMarcarUso(updates, 'lotesControle', p.loteId);
        _cqMarcarUso(updates, 'materiais', cqState.config.lotesControle[p.loteId]?.materialId || t.controlesQual?.[n]?.materialId);
      });
      _cqMarcarUso(updates, 'testes', t.id);
      _cqMarcarUso(updates, 'analitos', t.analitoId);
      _cqMarcarUso(updates, 'materiais', t.materialId);
      _cqMarcarUso(updates, 'insumos', l.lr);
      _cqMarcarUso(updates, 'insumos', l.lk);
      testesHdr[t.id] = {
        niveis: niveisMap, lr: l.lr || null, lk: l.lk || null, prep: prepId, posCalibracao: !!l.posCalibracao,
        trocaLoteReagente: trocaLr, trocaLoteCalibrador: trocaLk, versaoConfig: t.versaoConfig || 1,
        avaliacao: { status: r.status, violacoes: r.violacoes.map(v => ({ regra: v.regra, severidade: v.severidade, escopo: v.escopo, niveis: v.niveis, texto: v.texto })),
                     ...(r.statusIndicadores ? { statusIndicadores: r.statusIndicadores } : {}) },
        decisao,
      };
      if (!ult || (ult.dataHora || '') <= dh) {
        updates[`${CQ_KEYS.indices}/${u}/ultimo/${t.id}`] = { dataHora: dh, corridaKey: ck, mes, status: r.status, decisao: decisao ? 'L' : null, lr: l.lr || null, lk: l.lk || null };
      }
      resumoTxt.push(`${_cqNomeTeste(t)}: ${CQ_STATUS[r.status]?.label}`);
    });
    naoRealizados.forEach(t => { testesHdr[t.id] = { naoRealizado: true, motivo: lanc.linhas[t.id].motivoNR.trim() }; });

    const hdr = {
      numero, unidadeId: u, ativoId: g.ativoId || null,
      ativoSnap: g.ativo ? { nome: g.ativo.nome || '', codigo: g.ativo.codigo || '', serie: g.ativo.serie || '' } : null,
      sistemaAnalitico: g.ativoId ? null : g.nome, dataHora: dh,
      operadorId: operador.id, operadorNome: operador.nomeCompleto || operador.username,
      lancadoPorId: ass.porId, lancadoPorNome: ass.porNome, lancadoEm: ass.em, servTs: window.dbServerTs(), estacao: ass.estacao,
      retroativo: retro ? { horas: Math.round(horas), justificativa: lanc.retroJust.trim() } : null,
      flags: { posManutPrev: lanc.flags.posManutPrev, posManutCorr: lanc.flags.posManutCorr, reinicioEquip: lanc.flags.reinicioEquip,
               verificacao, otRef: String(lanc.flags.otRef || '').trim() || null, otId: lanc.flags.otId || null },
      repeticaoDe: lanc.repeticaoDe ? lanc.repeticaoDe.key : null,
      // Setores dos testes no momento da corrida (filtros e relatórios por setor)
      setorIds: _cqSetoresDosTestes(Object.keys(testesHdr)).filter(Boolean),
      testes: testesHdr, trilha: {},
    };
    hdr.status = _cqStatusCorrida(hdr);
    if (_cqLancFrac()) hdr.fracionada = true;
    let txtCiclo = '', sitCiclo = null;
    if (ciclo) {
      hdr.ciclo = ciclo;
      if (ciclo.vinculo) {
        // Testes de um ciclo já registrado: referência cruzada no ciclo de origem, que recalcula a situação
        const v = ciclo.vinculo;
        const leitura = { numero, mes, dataHora: dh, testes: _cqEsterResumoTestes(testesHdr) };
        updates[`${CQ_KEYS.corridas}/${u}/${v.mes}/${v.key}/ciclo/leituras/${ck}`] = leitura;
        updates[`${CQ_KEYS.corridas}/${u}/${v.mes}/${v.key}/trilha/${_cqTk()}`] = _cqTrilhaEntry('edicao', `Testes do ciclo ${ciclo.loteCarga} lançados na corrida ${numero}`);
        const st = await _cqEsterStatusOrigem(u, v.mes, v.key, o => { o.ciclo.leituras[ck] = leitura; }, `testes da corrida ${numero}`);
        Object.assign(updates, st.up);
        if (st.novo) sitCiclo = { lote: ciclo.loteCarga, ...st };
        txtCiclo = ` · testes do ciclo ${ciclo.loteCarga} (corrida ${v.numero || v.key})`;
      } else {
        updates[`${reservaLote}/numero`] = numero;
        // Situação do ciclo novo: em análise sem testes; os testes desta corrida já contam
        const cc = { ...hdr, key: ck, mes };
        ciclo.status = _cqEsterCalcStatus(cc);
        ciclo.statusAss = { ...ass, auto: true, motivo: realizados.length ? `testes da corrida ${numero}` : 'ciclo preparado sem testes' };
        if (ciclo.status === 'em_analise') updates[`${CQ_KEYS.indices}/${u}/ciclosPendentes/${ck}`] = _cqEsterPendResumo(cc);
        sitCiclo = { lote: ciclo.loteCarga, novo: ciclo.status, antes: null };
        txtCiclo = ` · ciclo ${ciclo.loteCarga}, ${ciclo.programa.nome}, ${ciclo.pacotes.length} pacote(s), ${CQ_CICLO_STATUS[ciclo.status].label.toLowerCase()}${ciclo.conforme ? '' : ` — parâmetros físicos fora da especificação: ${ciclo.falhas.join('; ')}`}`;
      }
      hdr.status = _cqStatusCorrida(hdr);
    }
    hdr.trilha[_cqTk()] = _cqTrilhaEntry('criacao', `Corrida ${numero} lançada${hdr.fracionada ? ' (fracionada)' : ''}${txtCiclo} — ${resumoTxt.join('; ') || 'sem testes'}`);
    updates[`${CQ_KEYS.corridas}/${u}/${mes}/${ck}`] = hdr;
    const pend = _cqResumoPendencia({ ...hdr, key: ck, mes });
    if (pend) updates[`${CQ_KEYS.indices}/${u}/pendentes/${ck}`] = pend;
    const rep = lanc.repeticaoDe;
    if (rep?.ncId && rep.ncAno && testesHdr[rep.testeId]) {
      updates[`${CQ_KEYS.acoes}/${u}/${rep.ncAno}/${rep.ncId}/repeticoes/${ck}`] = {
        numero, mes, dataHora: dh, status: testesHdr[rep.testeId].avaliacao?.status || null, porNome: ass.porNome,
      };
    }

    const ok = await window.dbUpdate(updates);
    if (!ok) { showToast('Falha ao gravar a corrida. Nada foi salvo; tente novamente.', 'error'); return; }
    gravou = true;
    // Atualiza caches dos resultados
    Object.entries(updates).forEach(([p, v]) => {
      if (!p.startsWith(CQ_KEYS.resultados + '/')) return;
      const [, , m2, t2, rk] = p.slice(CQ_KEYS.resultados.length).split('/');
      _cqResCacheSet(u, m2, t2, rk, CQEngine.expandirResultado(v, rk));
    });
    _cqRascunhoLimpar();
    const nRej = realizados.filter(t => testesHdr[t.id].avaliacao.status === 'rejeitado').length;
    const libTxt = prepLibFeitos.size ? ` Preparo ${[...prepLibFeitos.values()].join(', ')} liberado.` : '';
    const cicloTxt = !sitCiclo ? ''
      : !realizados.length ? ` Ciclo ${sitCiclo.lote} em análise: lance os indicadores escolhendo este ciclo.`
      : sitCiclo.novo !== sitCiclo.antes ? ` Ciclo ${sitCiclo.lote}: ${CQ_CICLO_STATUS[sitCiclo.novo].label.toLowerCase()}.` : '';
    const numImp = lanc.ciclo?.etqNumImpresso;
    const numTxt = reservaNum && numImp && numImp !== String(reservaNum.n) ? ` Atenção: o ciclo ficou com nº ${reservaNum.n}; a etiqueta impressa mostra nº ${numImp} — reimprima pela ficha da corrida.` : '';
    showToast(`Corrida ${numero} salva.${nRej ? ` ${nRej} teste(s) rejeitado(s): avalie e registre a ação corretiva.` : pend ? ' Aguardando avaliação.' : ' Todos os testes liberados.'}${cicloTxt}${libTxt}${numTxt}`, nRej || numTxt || sitCiclo?.novo === 'reprovado' ? 'error' : 'success');
    const repet = lanc.repeticaoDe;
    _cqLanc = _cqLancNovo(lanc.grupo);
    if (!repet) _cqLanc.modo = lanc.modo;   // fracionada: próxima corrida começa vazia, no mesmo modo
    if (lanc.ciclo && typeof _cqEsterVazio === 'function') _cqLanc.ciclo = _cqEsterVazio(lanc.ciclo.programaId);   // mantém o programa
    cqRender();
    if (pend || repet) cqAbrirCorrida(mes, ck);
  } finally {
    // Corrida não gravada: libera o lote da carga reservado
    if (reservaLote && !gravou) await window.dbUpdate({ [reservaLote]: null });
    if (reservaNum && !gravou) await reservaNum.desfazer();
    _cqSalvando = false;
    if (btn) btn.disabled = false;
  }
}

// ── LISTA DE CORRIDAS ────────────────────────────────────────
function cqRenderCorridas(body) {
  const u = _cqUnidadeAtivaId();
  if (!_cqCorrFiltro.per) { const m = CQEngine.mesDe(_cqNowLocal()); _cqCorrFiltro.per = { modo: 'intervalo', de: m, ate: m }; }
  const idx = cqState.indices[u] || {};
  const pend = Object.entries(idx.pendentes || {}).map(([k, p]) => ({ key: k, ...p })).filter(p => _cqRegistroPassaSetor(p)).sort((a, b) => (a.dataHora || '').localeCompare(b.dataHora || ''));
  const grupos = _cqGruposLanc(u, { porSetor: true });
  const opsEquip = [{ value: '', label: 'Todos os equipamentos', desc: `${grupos.length} equipamento(s) e sistema(s)`, ico: CQ_ICO.lista },
    ...grupos.map(x => ({ value: x.key, label: x.nome, desc: `${x.key.startsWith('a:') ? 'Equipamento' : 'Sistema / bancada'} · ${x.testes.length} teste(s)`, ico: CQ_ICO.ativo }))];
  const descSt = { pendente: 'Com teste sem decisão', liberada: 'Todos os testes liberados', parcial: 'Parte liberada, parte rejeitada', rejeitada: 'Todos os testes rejeitados' };
  const opsSt = [{ value: 'todas', label: 'Todas as situações', desc: 'Corridas em qualquer situação', dot: 'todas' },
    ...Object.entries(CQ_CORRIDA_STATUS).map(([k, s]) => ({ value: k, label: s.label, desc: descSt[k] || '', dot: 'corr-' + k }))];
  body.innerHTML = `
  <div class="cq-corr">
    ${pend.length ? `<div class="cq-card cq-card-pend"><div class="cq-card-tit">${CQ_ICO.clock} Aguardando avaliação (${pend.length})
      ${_cqCan('liberar') ? '' : '<span class="cq-muted"> · sem permissão para liberar</span>'}</div>
      <div class="cq-pend-grid">${pend.map(p => `<div class="cq-pend-item" onclick="cqAbrirCorrida('${p.mes || CQEngine.mesDe(p.key)}','${p.key}')">
        <span class="cq-dot ${p.temRejeicao ? 'cq-dot-vermelho' : 'cq-dot-amarelo'}"></span>
        <div style="flex:1;min-width:0;"><div class="cq-pend-tit">${_cqEsc(p.numero || p.key)} · ${_cqEsc(p.equipNome || '')}</div>
        <div class="cq-pend-sub">${_cqFmtDH(p.dataHora)} · ${p.nPend} teste(s)${p.temRejeicao ? ' · <b class="cq-txt-vermelho">rejeição</b>' : ''}</div></div></div>`).join('')}</div></div>` : ''}
    <div class="cq-toolbar">
      ${_cqMpHTML('cq-mp-corr', { get: () => _cqCorrFiltro.per, set: v => { _cqCorrFiltro.per = v; }, onchange: () => _cqCorrCarregar(), modos: ['geral', 'ano', 'intervalo'], atalhos: [1, 3, 6, 12], max: 24 })}
      ${_cqPopSelHTML('cq-corr-equip', opsEquip, _cqCorrFiltro.grupo, { compacto: true, onchange: v => { _cqCorrFiltro.grupo = v; _cqCorrRenderLista(); } })}
      ${_cqPopSelHTML('cq-corr-st', opsSt, _cqCorrFiltro.status, { compacto: true, onchange: v => { _cqCorrFiltro.status = v; _cqCorrRenderLista(); } })}
      <span class="cq-corr-total" id="cq-corr-total"></span>
      <div class="cq-spacer"></div>
      <button class="btn btn-outline btn-sm" onclick="_cqCorrCache=null;cqRender()">${CQ_ICO.undo} Atualizar</button>
    </div>
    <div id="cq-corr-lista"><div class="cq-vazio-p">Carregando…</div></div>
  </div>`;
  _cqCorrCarregar();
}

async function _cqCorrCarregar() {
  const u = _cqUnidadeAtivaId();
  const meses = _cqPerMeses(_cqCorrFiltro.per, 24), chave = meses.join(',');
  if (!_cqCorrCache || _cqCorrCache.u !== u || _cqCorrCache.chave !== chave) {
    const el = document.getElementById('cq-corr-lista');
    if (el) el.innerHTML = '<div class="cq-vazio-p">Carregando…</div>';
    const partes = await Promise.all(meses.map(m => cqCarregarCorridasMes(u, m)));
    if (_cqPerMeses(_cqCorrFiltro.per, 24).join(',') !== chave) return;   // período mudou durante a leitura
    _cqCorrCache = { u, chave, corridas: Object.assign({}, ...partes) };
  }
  _cqCorrRenderLista();
}

function _cqCorrRenderLista() {
  const el = document.getElementById('cq-corr-lista');
  if (!el || !_cqCorrCache) return;
  const lista = Object.values(_cqCorrCache.corridas)
    .filter(c => _cqCorrFiltro.status === 'todas' || (c.status || _cqStatusCorrida(c)) === _cqCorrFiltro.status)
    .filter(c => !_cqCorrFiltro.grupo || (_cqCorrFiltro.grupo === (c.ativoId ? 'a:' + c.ativoId : 'm:' + (c.sistemaAnalitico || 'Bancada / manual'))))
    .filter(c => _cqRegistroPassaSetor(c))
    .sort((a, b) => b.key.localeCompare(a.key));
  const tot = document.getElementById('cq-corr-total');
  if (tot) tot.textContent = `${lista.length} corrida${lista.length === 1 ? '' : 's'}`;
  el.innerHTML = `<div class="oc-table-scroll"><table class="ot-list-table cq-table">
    <thead><tr><th class="ot-list-th">Nº</th><th class="ot-list-th">Data/hora</th><th class="ot-list-th">Equipamento</th><th class="ot-list-th">Testes</th><th class="ot-list-th">Avaliação</th><th class="ot-list-th">Situação</th><th class="ot-list-th">Executado por</th></tr></thead>
    <tbody>${lista.length ? lista.map(c => {
      const ts = Object.values(c.testes || {}).filter(x => !x.naoRealizado);
      const cont = s => ts.filter(x => x.avaliacao?.status === s).length;
      const st = c.status || _cqStatusCorrida(c);
      return `<tr class="ot-list-row" onclick="cqAbrirCorrida('${c.mes}','${c.key}')">
        <td class="oc-num">${_cqEsc(c.numero)}${c.repeticaoDe ? ' <span title="Repetição">↻</span>' : ''}</td><td style="white-space:nowrap;">${_cqFmtDH(c.dataHora)}${c.retroativo ? ' <span class="cq-badge cq-st-alerta" title="Retroativo">R</span>' : ''}</td>
        <td>${_cqEsc(c.ativoSnap?.nome || c.sistemaAnalitico || '—')}${c.flags?.verificacao ? ' <span class="cq-badge cq-st-pendente">verificação</span>' : ''}${c.observacao ? ` <span class="cq-badge cq-st-alerta" title="${_cqEsc(c.observacao)}">sem lote</span>` : ''}
          ${c.ciclo?.loteCarga ? ` <span class="cq-badge ${c.ciclo.conforme === false ? 'cq-st-rejeitado' : 'cq-st-semalvo'}" title="${c.ciclo.vinculo ? 'Leitura de indicador do ciclo' : 'Lote da carga'}${c.ciclo.conforme === false ? ' — parâmetros físicos fora da especificação' : ''}">${c.ciclo.vinculo ? 'leitura ' : ''}${_cqEsc(c.ciclo.loteCarga)}</span>` : ''}</td>
        <td>${ts.length}</td>
        <td style="white-space:nowrap;">${cont('aceito') ? `<span class="cq-badge cq-st-aceito">${cont('aceito')}</span> ` : ''}${cont('alerta') ? `<span class="cq-badge cq-st-alerta">${cont('alerta')}</span> ` : ''}${cont('rejeitado') ? `<span class="cq-badge cq-st-rejeitado">${cont('rejeitado')}</span> ` : ''}${cont('sem_alvo') ? `<span class="cq-badge cq-st-semalvo">${cont('sem_alvo')}</span>` : ''}</td>
        <td>${_cqBadge(CQ_CORRIDA_STATUS, st)}</td><td>${_cqEsc(c.operadorNome || '—')}</td></tr>`;
    }).join('') : '<tr><td colspan="7" class="cq-td-vazio">Nenhuma corrida no período.</td></tr>'}</tbody></table></div>`;
}

// ── DETALHE DA CORRIDA ───────────────────────────────────────
// Aba aberta no detalhe da corrida (mantida ao redesenhar após uma decisão)
let _cqCorrAba = 'pend';
function cqCorrAba(k) {
  _cqCorrAba = k;
  document.querySelectorAll('.cq-cr-aba').forEach(b => b.classList.toggle('on', b.dataset.k === k));
  document.querySelectorAll('.cq-cr-lista').forEach(l => { l.hidden = l.dataset.k !== k; });
}
async function cqAbrirCorrida(mes, key) {
  const u = _cqUnidadeAtivaId();
  _cqCorrAba = 'pend';
  _cqCorrAberta = { u, mes, key };
  cqModalOpen({ titulo: 'Corrida', subtitulo: 'Carregando…', corpo: '<div class="cq-vazio-p">Carregando…</div>', icone: 'lista' });
  await _cqCorrRenderDetalhe(true);
}

async function _cqCorrRenderDetalhe(forcar) {
  const ctx = _cqCorrAberta;
  if (!ctx) return;
  const c = await cqCarregarCorrida(ctx.u, ctx.mes, ctx.key);
  if (!c) { document.getElementById('cq-modal-body').innerHTML = '<div class="cq-vazio">Corrida não encontrada.</div>'; return; }
  const testesIds = Object.keys(c.testes || {});
  const resPorTeste = {};
  await Promise.all(testesIds.map(async t => { resPorTeste[t] = await cqCarregarResultados(ctx.u, ctx.mes, t, { forcar }); }));
  if (_cqCorrAberta !== ctx) return;
  const podeLib = _cqCan('liberar');
  const me = _cqSess().id;
  const st = _cqStatusCorrida(c);
  const linhas = testesIds.map(tid => {
    const t = cqState.config.testes[tid];
    const ct = c.testes[tid];
    const nome = t ? _cqNomeTeste(t) : 'Teste removido';
    if (ct.naoRealizado) return `<div class="cq-cr-card nr"><div class="cq-cr-top"><div class="cq-cr-tit"><b>${_cqEsc(nome)}</b><small>Não realizado: ${_cqEsc(ct.motivo)}</small></div><span class="cq-badge cq-st-semalvo">não realizado</span></div></div>`;
    const dec = _cqAnalito(t?.analitoId)?.decimais ?? 2;
    const nivs = Object.entries(ct.niveis || {}).sort(([a], [b]) => a - b).map(([n, rk]) => {
      const r = resPorTeste[tid]?.[rk];
      if (!r) return `<div class="cq-cr-nv"><span class="cq-det-n">N${n}</span><div class="cq-cr-nv-txt"><span class="cq-muted">—</span></div></div>`;
      const est = CQ_SIGLA_ESTADO[r.estado] || 'sem_alvo';
      const podeCorr = !r.invalidado && (_cqCan('invalidar') || (c.lancadoPorId === me && !ct.decisao));
      const q = r.obtido !== undefined;
      return `<div class="cq-cr-nv est-${r.invalidado ? 'inval' : est}${r.invalidado ? ' cq-det-inval' : ''}">
        <span class="cq-det-n" title="${_cqEsc(t ? _cqRotuloNivel(t, n) : '')}">N${n}</span>
        <div class="cq-cr-nv-txt">
          <div class="cq-cr-nv-val"><b>${q ? _cqEsc(r.obtido) : _cqNum(r.valor, dec)}</b>
            ${r.valorOriginal !== undefined ? `<span class="cq-muted" title="Valor original">(orig. ${q ? _cqEsc(r.valorOriginal) : _cqNum(r.valorOriginal, dec)})</span>` : ''}
            ${_cqArr(r.regras).length ? `<span class="cq-g-regras">${_cqArr(r.regras).map(x => CQEngine.rotuloRegra(x)).join(', ')}</span>` : ''}
            ${r.invalidado ? `<span class="cq-badge cq-st-semalvo" title="${_cqEsc(r.invalidacao?.motivo)}">invalidado</span>` : ''}
            ${r.observacao ? `<span class="cq-badge cq-st-alerta" title="${_cqEsc(r.observacao)}">sem lote</span>` : ''}</div>
          <small>${q ? `${_cqEsc(t ? _cqRotuloNivel(t, n) : '')} · esperado ${_cqEsc(r.esperado || '—')}`
            : `z ${r.z === undefined || r.z === null ? '—' : _cqNum(r.z, 2)} · alvo ${r.media !== undefined ? `${_cqNum(r.media, dec)} ± ${_cqNum(r.dp, dec + 1)}` : '—'}`}</small>
        </div>
        ${podeCorr ? `<span class="cq-cr-nv-acoes"><button class="cq-icobtn" title="Corrigir valor" onclick="cqCorrigirResultado('${tid}','${rk}')">${CQ_ICO.edit}</button>
          <button class="cq-icobtn" title="Invalidar resultado" onclick="cqInvalidarResultado('${tid}','${rk}')">${CQ_ICO.ban}</button></span>` : ''}
      </div>`;
    }).join('');
    const av = ct.avaliacao || {};
    const viol = _cqArr(av.violacoes).map(v => `<div class="cq-det-viol ${v.severidade === 'rejeicao' ? 'cq-txt-vermelho' : 'cq-txt-amarelo'}">• ${_cqEsc(v.texto)}</div>`).join('');
    let decisaoHTML = '';
    if (ct.decisao) {
      const d = ct.decisao;
      decisaoHTML = `<div class="cq-cr-dec-linha">${_cqBadge(CQ_DECISAO, d.acao)}<span class="cq-muted">${_cqEsc(_cqPvNome(d.porNome))} · ${_cqFmtDH(d.em)}${d.auto ? ' · automática' : ''}</span></div>${d.comentario && !d.auto ? `<div class="cq-det-com">“${_cqEsc(d.comentario)}”</div>` : ''}
        ${ct.ncId ? `<a href="#" class="cq-link" onclick="cqAbrirNC('${ctx.u}','${_cqEsc(ct.ncAno || ctx.mes.slice(0, 4))}','${ct.ncId}');return false;">${CQ_ICO.alerta} Não conformidade</a>` : ''}
        ${d.acao === 'rejeitado' && _cqCan('lancar') ? `<button class="btn btn-outline btn-sm" style="margin-top:4px;" onclick="cqRepetirControle('${ctx.mes}','${ctx.key}','${tid}')">${CQ_ICO.repeat} Repetir controle</button>` : ''}`;
    } else if (podeLib) {
      const s = av.status;
      decisaoHTML = `<div class="cq-det-btns">
        ${s !== 'rejeitado' ? `<button class="btn btn-primary btn-sm" onclick="cqDecidir('${tid}','liberado')">${CQ_ICO.check} Liberar</button>` : ''}
        <button class="btn btn-outline btn-sm cq-btn-rej" onclick="cqDecidir('${tid}','rejeitado')">${CQ_ICO.ban} Rejeitar</button>
        ${s === 'rejeitado' ? `<button class="btn btn-outline btn-sm" onclick="cqDecidir('${tid}','liberado_com_violacao')" title="Exige justificativa técnica e senha">Liberar c/ justificativa</button>` : ''}
      </div>`;
    } else decisaoHTML = '<span class="cq-muted">Aguardando avaliação</span>';
    const extras = [ct.posCalibracao ? 'após calibração' : '', ct.trocaLoteReagente ? 'troca de lote de reagente' : '', ct.trocaLoteCalibrador ? 'troca de lote de calibrador' : ''].filter(Boolean);
    const insLr = ct.lr ? cqState.config.insumos[ct.lr] : null;
    const prepLr = ct.prep && insLr ? _cqPreparo(insLr, ct.prep) : null;
    const ins = [ct.lr ? (t && _cqTesteQual(t) ? `${insLr?.nome || 'Insumo'} lote ${insLr?.lote || '?'}` : `Reag. ${insLr?.lote || '?'}`) + (prepLr ? ` · preparo ${_cqPrepTxt(prepLr)}` : '') : '',
                 ct.lk ? `Cal. ${cqState.config.insumos[ct.lk]?.lote || '?'}` : ''].filter(Boolean);
    const um = _cqAnalito(t?.analitoId)?.unidadeMedida || '';
    return `<div class="cq-cr-card st-${av.status || 'sem_alvo'}">
      <div class="cq-cr-top">
        <div class="cq-cr-tit"><b>${_cqEsc(nome)}</b>${um || ins.length ? `<small>${_cqEsc([um, ...ins].filter(Boolean).join(' · '))}</small>` : ''}</div>
        ${_cqBadge(CQ_STATUS, av.status || 'sem_alvo')}
      </div>
      ${extras.length || ct.observacao ? `<div class="cq-cr-avisos">${extras.map(x => `<span>${_cqEsc(x)}</span>`).join('')}${ct.observacao ? `<span>Obs.: ${_cqEsc(ct.observacao)}</span>` : ''}</div>` : ''}
      <div class="cq-cr-niveis">${nivs}</div>
      ${viol ? `<div class="cq-cr-viol">${viol}</div>` : ''}
      <div class="cq-cr-pe"><div class="cq-cr-dec">${decisaoHTML}</div>
        ${t ? `<button type="button" class="cq-cr-graf" title="Abrir o gráfico de controle" onclick="cqModalClose();cqAbrirGrafico('${tid}')">${CQ_ICO.grafico} Gráfico</button>` : ''}</div>
    </div>`;
  });
  // Abas: pendentes (sem decisão), liberados e rejeitados; não realizados ficam numa aba própria
  const grupoDe = tid => { const ct = c.testes[tid]; return ct.naoRealizado ? 'nr' : !ct.decisao ? 'pend' : ct.decisao.acao === 'rejeitado' ? 'rej' : 'lib'; };
  const grupos = [['pend', 'Pendentes'], ['lib', 'Liberados'], ['rej', 'Rejeitados'], ['nr', 'Não realizados']]
    .map(([k, rot]) => ({ k, rot, itens: testesIds.map((tid, i) => grupoDe(tid) === k ? linhas[i] : null).filter(Boolean) }))
    .filter(g => g.itens.length || g.k !== 'nr');
  if (!grupos.some(g => g.k === _cqCorrAba && g.itens.length)) _cqCorrAba = (grupos.find(g => g.itens.length) || grupos[0]).k;
  const vazioAba = { pend: 'Nenhum teste aguardando avaliação.', lib: 'Nenhum teste liberado.', rej: 'Nenhum teste rejeitado.' };
  const flags = [c.fracionada ? 'Corrida fracionada' : '', c.flags?.posManutPrev ? 'Após manutenção preventiva' : '', c.flags?.posManutCorr ? 'Após manutenção corretiva' : '', c.flags?.reinicioEquip ? 'Após reinício' : '',
                 c.flags?.verificacao ? 'Verificação (equipamento em pausa)' : '', c.flags?.otRef && !c.flags?.otId ? `Ref.: ${c.flags.otRef}` : ''].filter(Boolean);
  const aceitosPend = testesIds.filter(tid => !c.testes[tid].naoRealizado && !c.testes[tid].decisao && c.testes[tid].avaliacao?.status === 'aceito');
  document.getElementById('cq-modal-title').textContent = `Corrida ${c.numero}`;
  document.getElementById('cq-modal-sub').textContent = `${c.ativoSnap?.nome || c.sistemaAnalitico || ''} · ${_cqFmtDH(c.dataHora)}`;
  document.getElementById('cq-modal-body').innerHTML = `
    <div class="cq-cr-head">
      <div class="cq-cr-resumo">
        ${_cqBadge(CQ_CORRIDA_STATUS, st)}
        <span class="cq-cr-cont">${(() => {
          const sts = testesIds.map(tid => c.testes[tid]).filter(x => !x.naoRealizado).map(x => x.avaliacao?.status || 'sem_alvo');
          const n = k => sts.filter(x => x === k).length;
          return [`<b>${testesIds.length}</b> teste${testesIds.length === 1 ? '' : 's'}`, n('aceito') && `<i class="ok"></i>${n('aceito')} aceito${n('aceito') === 1 ? '' : 's'}`,
            n('alerta') && `<i class="al"></i>${n('alerta')} em alerta`, n('rejeitado') && `<i class="rj"></i>${n('rejeitado')} rejeitado${n('rejeitado') === 1 ? '' : 's'}`].filter(Boolean).join('<span class="cq-cr-sep"></span>');
        })()}</span>
      </div>
      <div class="cq-cr-pessoas">
        <div><small>Executado por</small><b>${_cqEsc(c.operadorNome)}</b></div>
        <div><small>Lançado por</small><b>${_cqEsc(c.lancadoPorNome)}</b><span>${_cqFmtDH(c.lancadoEm)}${c.estacao ? ` · ${_cqEsc(c.estacao)}` : ''}</span></div>
        ${c.repeticaoDe ? `<div><small>Repetição de</small><a href="#" class="cq-link" onclick="cqAbrirCorrida('${CQEngine.mesDe(c.repeticaoDe)}','${c.repeticaoDe}');return false;">${_cqEsc(c.repeticaoDe)}</a></div>` : ''}
      </div>
      ${c.retroativo ? `<div class="cq-cr-nota"><b>Retroativo:</b> ${_cqEsc(c.retroativo.justificativa)}</div>` : ''}
      ${c.observacao ? `<div class="cq-cr-nota al"><b>Observação:</b> ${_cqEsc(c.observacao)}</div>` : ''}
    </div>
    ${flags.length || c.flags?.otId ? `<div class="cq-det-flags">${flags.map(f => `<span class="cq-tag">${_cqEsc(f)}</span>`).join('')}${c.flags?.otId ? `<a href="#" class="cq-tag cq-tag-ot" title="Abrir a ordem de trabalho" onclick="${typeof otOpenView === 'function' ? `cqModalClose();setTimeout(()=>otOpenView('${_cqEsc(c.flags.otId)}'),60)` : ''};return false;">OT ${_cqEsc(c.flags.otRef || '')}</a>` : ''}</div>` : ''}
    ${typeof _cqEsterDetalheHTML === 'function' ? _cqEsterDetalheHTML(c) : ''}
    <div class="cq-cr-abas" role="tablist">${grupos.map(g => `<button type="button" role="tab" class="cq-cr-aba ${g.k}${g.k === _cqCorrAba ? ' on' : ''}" data-k="${g.k}" onclick="cqCorrAba('${g.k}')">${g.rot}<span>${g.itens.length}</span></button>`).join('')}</div>
    ${grupos.map(g => `<div class="cq-cr-lista" data-k="${g.k}" ${g.k === _cqCorrAba ? '' : 'hidden'}>${g.itens.join('') || `<div class="cq-cr-vazio">${vazioAba[g.k] || ''}</div>`}</div>`).join('')}
    <details class="cq-det-trilha cq-cr-trilha"><summary>Rastreabilidade da corrida <span class="cq-step-qtd">${_cqTrilhaLista(c).length}</span></summary>${_cqTrilhaHTML(c)}</details>`;
  document.getElementById('cq-modal-foot').innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;"><button class="btn btn-outline" onclick="cqImprimirCorrida()">${CQ_ICO.print} Imprimir</button>${_cqCorrBtnExcluir(c)}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      ${podeLib && aceitosPend.length > 1 ? `<button class="btn btn-primary" onclick="cqLiberarAceitos()">${CQ_ICO.check} Liberar ${aceitosPend.length} aceitos</button>` : ''}
      <button class="btn btn-outline" onclick="cqModalClose()">Fechar</button></div>`;
  document.getElementById('cq-modal-foot').style.justifyContent = 'space-between';
}

// ── DECISÕES (liberação / rejeição) ──────────────────────────
function cqDecidir(testeId, acao) {
  const ctx = _cqCorrAberta;
  if (!ctx || !_cqCan('liberar')) return;
  const t = cqState.config.testes[testeId];
  const nome = t ? _cqNomeTeste(t) : 'Teste';
  const pol = _cqPolitica(ctx.u);
  cqCarregarCorrida(ctx.u, ctx.mes, ctx.key).then(c => {
    const ct = c?.testes?.[testeId];
    if (!ct) return;
    if (ct.decisao) { showToast(`Já avaliado por ${ct.decisao.porNome}.`, 'error'); _cqCorrRenderDetalhe(true); return; }
    const s = ct.avaliacao?.status;
    if (acao === 'liberado' && s === 'aceito' && !c.flags?.verificacao) { _cqAplicarDecisao(ctx, testeId, 'liberado', ''); return; }
    const exigeCom = acao !== 'liberado' || s === 'sem_alvo' || (s === 'alerta' && pol.comentarioObrigatorioAlerta) || c.flags?.verificacao;
    const titulos = { liberado: 'Liberar', rejeitado: 'Rejeitar', liberado_com_violacao: 'Liberar com justificativa' };
    _cqPrompt({
      titulo: `${titulos[acao]} · ${nome}`,
      subtitulo: acao === 'liberado_com_violacao' ? 'Liberação de corrida rejeitada pelas regras — assinatura obrigatória'
        : acao === 'rejeitado' ? 'Os resultados de pacientes desta corrida não devem ser liberados' : (s === 'sem_alvo' ? 'Avaliação manual (sem alvo definido)' : 'Avaliação do responsável'),
      corpo: `${acao === 'rejeitado' ? `<div class="cq-nota">Será aberta uma não conformidade para registrar causa, ação corretiva e impacto em pacientes (RDC 978, art. 180, IV).</div>` : ''}
        ${acao === 'liberado_com_violacao' ? `<div class="cq-alerta-box">${CQ_ICO.alerta} Use apenas com fundamento técnico (ex.: violação explicada por erro de digitação já corrigido, controle deteriorado com repetição aceita). Uma não conformidade será aberta.</div>` : ''}
        <div class="form-field"><label class="field-label">${acao === 'liberado' ? 'Comentário' : 'Justificativa'} ${exigeCom ? '<span class="required">*</span>' : ''}</label>
          <textarea id="cq-dec-com" class="field-textarea" style="min-height:70px;"></textarea></div>
        ${acao === 'liberado_com_violacao' ? _cqSenhaCampoHTML() : ''}`,
      confirmar: titulos[acao], perigo: acao !== 'liberado',
      onConfirm: async () => {
        const com = _cqVal('cq-dec-com');
        if (exigeCom && !com) { showToast('Informe a justificativa.', 'error'); return false; }
        if (acao === 'liberado_com_violacao' && !(await _cqSenhaOk())) return false;
        return _cqAplicarDecisao(ctx, testeId, acao, com);
      },
    });
  });
}

async function cqLiberarAceitos() {
  const ctx = _cqCorrAberta;
  if (!ctx || !_cqCan('liberar')) return;
  const c = await cqCarregarCorrida(ctx.u, ctx.mes, ctx.key);
  if (c?.flags?.verificacao) { showToast('Corrida de verificação: avalie cada teste com comentário.', 'error'); return; }
  const ids = Object.keys(c?.testes || {}).filter(t => !c.testes[t].naoRealizado && !c.testes[t].decisao && c.testes[t].avaliacao?.status === 'aceito');
  for (const t of ids) await _cqAplicarDecisao(ctx, t, 'liberado', '', { semRender: true });
  _cqCorrRenderDetalhe(true);
  showToast(`${ids.length} teste(s) liberado(s).`, 'success');
}

// Grava a decisão (transação: só a primeira decisão vale) e seus efeitos
async function _cqAplicarDecisao(ctx, testeId, acao, comentario, opts = {}) {
  if (!_cqPodeGravar()) return false;
  const base = `${CQ_KEYS.corridas}/${ctx.u}/${ctx.mes}/${ctx.key}`;
  const decisao = { acao, comentario: comentario || '', ..._cqAssinatura(), ...(acao === 'liberado_com_violacao' ? { reautenticado: !!_cqPolitica(ctx.u).reautenticar } : {}) };
  const gravada = await window.dbTransaction(`${base}/testes/${testeId}/decisao`, cur => (cur ? undefined : decisao));
  const c = await cqCarregarCorrida(ctx.u, ctx.mes, ctx.key);
  if (!gravada || !c) {
    const d = c?.testes?.[testeId]?.decisao;
    showToast(d ? `Já avaliado por ${d.porNome}.` : 'Falha ao gravar a decisão.', 'error');
    if (!opts.semRender) _cqCorrRenderDetalhe(true);
    return false;
  }
  const ct = c.testes[testeId];
  const t = cqState.config.testes[testeId];
  const sigla = CQ_DECISAO[acao].sigla;
  const updates = {};
  Object.values(ct.niveis || {}).forEach(rk => { updates[`${CQ_KEYS.resultados}/${ctx.u}/${ctx.mes}/${testeId}/${rk}/d`] = sigla; });
  const novoStatus = _cqStatusCorrida(c);
  updates[`${base}/status`] = novoStatus;
  updates[`${base}/trilha/${_cqTk()}`] = _cqTrilhaEntry('decisao', `${t ? _cqNomeTeste(t) : testeId}: ${CQ_DECISAO[acao].label}${comentario ? ' — ' + comentario : ''}`);
  const pend = _cqResumoPendencia(c);
  updates[`${CQ_KEYS.indices}/${ctx.u}/pendentes/${ctx.key}`] = pend || null;
  const ult = (cqState.indices[ctx.u] || {}).ultimo?.[testeId];
  if (ult && ult.corridaKey === ctx.key) updates[`${CQ_KEYS.indices}/${ctx.u}/ultimo/${testeId}/decisao`] = sigla;
  const insP = ct.lr && ct.prep ? cqState.config.insumos[ct.lr] : null;
  const prepP = insP ? _cqPreparo(insP, ct.prep) : null;
  if (prepP?.situacao === 'em_avaliacao') {
    const sit = acao === 'rejeitado' ? 'reprovado' : 'liberado';
    const pb = `${CQ_KEYS.config}/insumos/${ct.lr}/preparos/${ct.prep}`;
    updates[`${pb}/situacao`] = sit;
    updates[`${pb}/avaliacao`] = { numero: c.numero, corridaKey: ctx.key, mes: ctx.mes, acao, ..._cqAssinatura() };
    updates[`${CQ_KEYS.config}/insumos/${ct.lr}/trilha/${_cqTk()}`] = _cqTrilhaEntry('edicao', `Preparo de ${_cqFmtData(prepP.data)} ${sit === 'liberado' ? 'liberado' : 'reprovado'} pela decisão da corrida ${c.numero}`);
  }

  // Ciclo de esterilização: a decisão pode liberar ou reprovar o ciclo
  if (c.ciclo && typeof _cqEsterStatusUpdates === 'function') {
    if (c.ciclo.vinculo) {
      const v = c.ciclo.vinculo, est = _cqEsterEstadoTeste(ct);
      updates[`${CQ_KEYS.corridas}/${ctx.u}/${v.mes}/${v.key}/ciclo/leituras/${ctx.key}/testes/${testeId}`] = est;
      Object.assign(updates, (await _cqEsterStatusOrigem(ctx.u, v.mes, v.key, o => {
        const l = o.ciclo.leituras[ctx.key] = { ...(o.ciclo.leituras[ctx.key] || { numero: c.numero, mes: ctx.mes, dataHora: c.dataHora }) };
        l.testes = { ...(l.testes || {}), [testeId]: est };
      }, `decisão na corrida ${c.numero}`)).up);
    } else {
      Object.assign(updates, _cqEsterStatusUpdates(ctx.u, c, `decisão na corrida ${c.numero}`).up);
    }
  }

  let ncNumero = null;
  if (acao !== 'liberado' && typeof _cqNovaNC === 'function') {
    const nc = await _cqNovaNC(ctx, c, testeId, acao, comentario);
    if (nc) {
      ncNumero = nc.numero;
      const ano = nc.ano;
      updates[`${CQ_KEYS.acoes}/${ctx.u}/${ano}/${nc.id}`] = nc;
      updates[`${CQ_KEYS.indices}/${ctx.u}/ncAbertas/${nc.id}`] = { numero: nc.numero, testeId, ano, abertaEm: nc.criadoEm };
      updates[`${base}/testes/${testeId}/ncId`] = nc.id;
      updates[`${base}/testes/${testeId}/ncAno`] = ano;
    }
  }
  const ok = await window.dbUpdate(updates);
  if (!ok) showToast('A decisão foi gravada, mas houve falha ao atualizar índices. Use “Reconstruir índices” se a pendência persistir.', 'error');
  Object.values(ct.niveis || {}).forEach(rk => {
    const k = `${ctx.u}|${ctx.mes}|${testeId}`;
    const cache = _cqResCache.get(k);
    if (cache?.[rk]) cache[rk].decisao = sigla;
  });
  _cqCorrCache = null;
  if (!opts.semRender) {
    showToast(`${CQ_DECISAO[acao].label}.${ncNumero ? ` Não conformidade ${ncNumero} aberta.` : ''}`, acao === 'liberado' ? 'success' : 'error');
    _cqCorrRenderDetalhe(true);
    if (_cqSub === 'corridas') _cqCorrCarregar();
  }
  return true;
}

// ── CORREÇÃO E INVALIDAÇÃO (dado original preservado) ────────
function cqCorrigirResultado(testeId, resKey) {
  const ctx = _cqCorrAberta;
  const r = _cqResCache.get(`${ctx.u}|${ctx.mes}|${testeId}`)?.[resKey];
  const t = cqState.config.testes[testeId];
  if (!r || !t) return;
  if (r.obtido !== undefined) { _cqCorrigirQual(ctx, t, r, resKey); return; }
  const dec = _cqAnalito(t.analitoId)?.decimais ?? 2;
  _cqPrompt({
    titulo: 'Corrigir valor', subtitulo: `${_cqNomeTeste(t)} · nível ${r.nivel} · valor atual ${_cqNum(r.valor, dec)}`,
    corpo: `<div class="cq-nota">O valor original permanece registrado (RDC 978, art. 116). A avaliação do teste nesta corrida será recalculada.</div>
      <div class="form-field"><label class="field-label">Novo valor <span class="required">*</span></label><input type="text" inputmode="decimal" id="cq-corr-val" class="field-input"></div>
      <div class="form-field"><label class="field-label">Motivo <span class="required">*</span></label><textarea id="cq-corr-mot" class="field-textarea" style="min-height:60px;" placeholder="Ex.: erro de digitação — valor do equipamento 98,2"></textarea></div>`,
    confirmar: 'Corrigir',
    onConfirm: async () => {
      const v = CQEngine.parseNumero(_cqVal('cq-corr-val')), mot = _cqVal('cq-corr-mot');
      if (v === null) { showToast('Valor inválido.', 'error'); return false; }
      if (!mot) { showToast('Informe o motivo.', 'error'); return false; }
      if (v === r.valor) { showToast('O valor é igual ao atual.', 'error'); return false; }
      return _cqAlterarResultado(ctx, testeId, resKey, { tipo: 'correcao', valor: v, motivo: mot });
    },
  });
}

function _cqCorrigirQual(ctx, t, r, resKey) {
  const escala = _cqArr(_cqAnalito(t.analitoId)?.escala);
  _cqPrompt({
    titulo: 'Corrigir resultado', subtitulo: `${_cqNomeTeste(t)} · ${_cqRotuloNivel(t, r.nivel)} · atual “${r.obtido}”`,
    corpo: `<div class="cq-nota">O resultado original permanece registrado (RDC 978, art. 116). A avaliação do teste nesta corrida será recalculada.</div>
      <div class="form-field"><label class="field-label">Resultado correto <span class="required">*</span></label>
        <select id="cq-corr-val" class="field-select"><option value="">— Selecione —</option>${escala.map(e => `<option value="${_cqEsc(e)}">${_cqEsc(e)}</option>`).join('')}</select></div>
      <div class="form-field"><label class="field-label">Motivo <span class="required">*</span></label><textarea id="cq-corr-mot" class="field-textarea" style="min-height:60px;" placeholder="Ex.: leitura registrada na placa errada"></textarea></div>`,
    confirmar: 'Corrigir',
    onConfirm: async () => {
      const v = _cqVal('cq-corr-val'), mot = _cqVal('cq-corr-mot');
      if (!escala.includes(v)) { showToast('Escolha o resultado na lista.', 'error'); return false; }
      if (!mot) { showToast('Informe o motivo.', 'error'); return false; }
      if (v === r.obtido) { showToast('O resultado é igual ao atual.', 'error'); return false; }
      return _cqAlterarResultado(ctx, t.id, resKey, { tipo: 'correcao', valor: v, motivo: mot });
    },
  });
}

function cqInvalidarResultado(testeId, resKey) {
  const ctx = _cqCorrAberta;
  const t = cqState.config.testes[testeId];
  _cqPrompt({
    titulo: 'Invalidar resultado', subtitulo: t ? `${_cqNomeTeste(t)}` : '',
    corpo: `<div class="cq-nota">O resultado continua registrado, mas deixa de entrar nas estatísticas e nas regras entre corridas.</div>
      <div class="form-field"><label class="field-label">Motivo <span class="required">*</span></label><textarea id="cq-inv-mot" class="field-textarea" style="min-height:60px;" placeholder="Ex.: frasco contaminado; amostra controle trocada"></textarea></div>`,
    confirmar: 'Invalidar', perigo: true,
    onConfirm: async () => {
      const mot = _cqVal('cq-inv-mot');
      if (!mot) { showToast('Informe o motivo.', 'error'); return false; }
      return _cqAlterarResultado(ctx, testeId, resKey, { tipo: 'invalidacao', motivo: mot });
    },
  });
}

async function _cqAlterarResultado(ctx, testeId, resKey, op) {
  if (!_cqPodeGravar()) return false;
  const t = cqState.config.testes[testeId];
  const c = await cqCarregarCorrida(ctx.u, ctx.mes, ctx.key);
  const ct = c?.testes?.[testeId];
  if (!t || !ct) return false;
  if (!_cqCan('invalidar') && !(c.lancadoPorId === _cqSess().id && !ct.decisao)) { showToast('Sem permissão.', 'error'); return false; }
  const resMap = await cqCarregarResultados(ctx.u, ctx.mes, testeId, { forcar: true });
  const r = resMap[resKey];
  if (!r) return false;
  const ass = _cqAssinatura();
  const tk = _cqTk();
  const base = `${CQ_KEYS.resultados}/${ctx.u}/${ctx.mes}/${testeId}/${resKey}`;
  const updates = {};
  const novo = { ...r };
  const qual = r.obtido !== undefined;
  if (op.tipo === 'correcao' && qual) {
    novo.obtido = op.valor;
    if (r.valorOriginal === undefined) { novo.valorOriginal = r.obtido; updates[`${base}/vo`] = r.obtido; }
    updates[`${base}/q`] = op.valor;
    updates[`${base}/k/${tk}`] = { campo: 'obtido', antes: r.obtido, depois: op.valor, motivo: op.motivo, ...ass };
  } else if (op.tipo === 'correcao') {
    novo.valor = op.valor;
    if (r.valorOriginal === undefined) { novo.valorOriginal = r.valor; updates[`${base}/vo`] = r.valor; }
    novo.z = CQEngine.zScore(op.valor, r.media, r.dp);
    updates[`${base}/v`] = op.valor;
    updates[`${base}/z`] = novo.z === null ? null : CQEngine.arred(novo.z, 4);
    updates[`${base}/k/${tk}`] = { campo: 'valor', antes: r.valor, depois: op.valor, motivo: op.motivo, ...ass };
  } else {
    novo.invalidado = true;
    novo.invalidacao = { motivo: op.motivo, ...ass };
    updates[`${base}/i`] = novo.invalidacao;
  }
  // Reavalia o teste nesta corrida com os níveis válidos
  const atuais = Object.values(ct.niveis || {}).map(rk => (rk === resKey ? novo : resMap[rk])).filter(x => x && !x.invalidado);
  let av;
  if (qual) {
    const an = _cqAnalito(t.analitoId);
    av = CQEngine.avaliarCorridaQualitativa({ atual: atuais.map(x => ({ nivel: x.nivel, obtido: x.obtido, esperado: x.esperado, rotulo: _cqRotuloNivel(t, x.nivel) })),
                                              tipo: an?.tipo, escala: _cqArr(an?.escala), tolerancia: an?.toleranciaPassos });
  } else {
    const hist = await cqHistoricoTeste(ctx.u, t, ctx.key, { forcar: true });
    av = CQEngine.avaliarCorrida({ atual: atuais.map(x => ({ nivel: x.nivel, z: x.z ?? null })), historico: hist, regras: t.regras || {},
                                   opcoes: { gatilho12s: !!t.opcoesRegras?.gatilho12s } });
  }
  // Ciclo de esterilização fora da especificação continua rejeitando o teste
  if (c.ciclo && !c.ciclo.vinculo && typeof _cqEsterAplicar === 'function') av = _cqEsterAplicar(av, c.ciclo.falhas);
  atuais.forEach(x => {
    const rk = Object.entries(ct.niveis).find(([n]) => Number(n) === Number(x.nivel))?.[1];
    if (!rk) return;
    const est = av.porNivel[x.nivel]?.status || 'sem_alvo';
    updates[`${CQ_KEYS.resultados}/${ctx.u}/${ctx.mes}/${testeId}/${rk}/e`] = CQ_ESTADO_SIGLA[est];
    updates[`${CQ_KEYS.resultados}/${ctx.u}/${ctx.mes}/${testeId}/${rk}/r`] = av.porNivel[x.nivel]?.regras?.length ? av.porNivel[x.nivel].regras : null;
  });
  const cbase = `${CQ_KEYS.corridas}/${ctx.u}/${ctx.mes}/${ctx.key}`;
  const statusAntes = ct.avaliacao?.status;
  updates[`${cbase}/testes/${testeId}/avaliacao`] = { status: atuais.length ? av.status : 'sem_alvo',
    violacoes: av.violacoes.map(v => ({ regra: v.regra, severidade: v.severidade, escopo: v.escopo, niveis: v.niveis, texto: v.texto })),
    statusIndicadores: av.statusIndicadores || null };
  const dec = _cqAnalito(t.analitoId)?.decimais ?? 2;
  const txt = op.tipo === 'correcao'
    ? (qual ? `${_cqNomeTeste(t)} N${r.nivel}: resultado corrigido de “${r.obtido}” para “${op.valor}” — ${op.motivo}`
            : `${_cqNomeTeste(t)} N${r.nivel}: valor corrigido de ${_cqNum(r.valor, dec)} para ${_cqNum(op.valor, dec)} — ${op.motivo}`)
    : `${_cqNomeTeste(t)} N${r.nivel}: resultado invalidado — ${op.motivo}`;
  updates[`${cbase}/trilha/${_cqTk()}`] = _cqTrilhaEntry(op.tipo, txt + (ct.decisao ? ` (após a decisão “${CQ_DECISAO[ct.decisao.acao]?.label}”, que foi mantida)` : '') +
    (statusAntes !== av.status ? ` · avaliação: ${CQ_STATUS[statusAntes]?.label || statusAntes} → ${CQ_STATUS[av.status]?.label || av.status}` : ''));
  if (!ct.decisao) {
    const c2 = JSON.parse(JSON.stringify(c));
    c2.testes[testeId].avaliacao = { status: av.status };
    updates[`${CQ_KEYS.indices}/${ctx.u}/pendentes/${ctx.key}`] = _cqResumoPendencia(c2) || null;
  }
  const ult = (cqState.indices[ctx.u] || {}).ultimo?.[testeId];
  if (ult && ult.corridaKey === ctx.key) updates[`${CQ_KEYS.indices}/${ctx.u}/ultimo/${testeId}/status`] = av.status;
  const ok = await window.dbUpdate(updates);
  if (!ok) { showToast('Falha ao gravar.', 'error'); return false; }
  _cqResCacheInvalidar(ctx.u, ctx.mes, testeId);
  showToast(op.tipo === 'correcao' ? 'Valor corrigido; original preservado.' : 'Resultado invalidado.', 'success');
  if (ct.decisao && statusAntes !== av.status) showToast('A avaliação mudou após a decisão. Revise a decisão registrada na trilha.', 'error');
  _cqCorrRenderDetalhe(true);
  return true;
}

// ── IMPRESSÃO DA CORRIDA ─────────────────────────────────────
async function cqImprimirCorrida() {
  const ctx = _cqCorrAberta;
  if (!ctx) return;
  const c = await cqCarregarCorrida(ctx.u, ctx.mes, ctx.key);
  if (!c) return;
  const un = cqState.config.unidades[ctx.u];
  const linhas = [];
  for (const [tid, ct] of Object.entries(c.testes || {})) {
    const t = cqState.config.testes[tid];
    const nome = t ? _cqNomeTeste(t) : tid;
    if (ct.naoRealizado) { linhas.push(`<tr><td>${_cqEsc(nome)}</td><td colspan="5">Não realizado: ${_cqEsc(ct.motivo)}</td></tr>`); continue; }
    const res = await cqCarregarResultados(ctx.u, ctx.mes, tid);
    const dec = _cqAnalito(t?.analitoId)?.decimais ?? 2;
    const niveisCt = Object.entries(ct.niveis || {}).filter(([, rk]) => rk);
    niveisCt.sort(([a], [b]) => a - b).forEach(([n, rk], i, arr) => {
      const r = res[rk] || {};
      const q = r.obtido !== undefined;
      linhas.push(`<tr>${i === 0 ? `<td rowspan="${arr.length}">${_cqEsc(nome)}<br><small>${_cqEsc(_cqAnalito(t?.analitoId)?.unidadeMedida || '')}</small>${ct.lr ? `<br><small>${_cqEsc(cqState.config.insumos[ct.lr]?.nome || '')} lote ${_cqEsc(cqState.config.insumos[ct.lr]?.lote || '?')}</small>` : ''}</td>` : ''}
        <td>N${n}${q && t ? `<br><small>${_cqEsc(_cqRotuloNivel(t, n))}</small>` : ''}</td>
        <td>${q ? _cqEsc(r.obtido) : _cqNum(r.valor, dec)}${r.valorOriginal !== undefined ? ` <small>(orig. ${q ? _cqEsc(r.valorOriginal) : _cqNum(r.valorOriginal, dec)})</small>` : ''}${r.invalidado ? ' <small>(invalidado)</small>' : ''}${r.observacao ? `<br><small>${_cqEsc(r.observacao)}</small>` : ''}</td>
        <td>${q ? _cqEsc(r.esperado || '—') : r.media !== undefined ? `${_cqNum(r.media, dec)} ± ${_cqNum(r.dp, dec + 1)}` : '—'}</td><td>${r.z !== undefined && r.z !== null ? _cqNum(r.z, 2) : '—'}</td>
        ${i === 0 ? `<td rowspan="${arr.length}">${_cqEsc(CQ_STATUS[ct.avaliacao?.status]?.label || '')}${_cqArr(ct.avaliacao?.violacoes).map(v => `<br><small>${_cqEsc(v.texto)}</small>`).join('')}
          <br><b>${_cqEsc(ct.decisao ? CQ_DECISAO[ct.decisao.acao]?.label : 'Aguardando avaliação')}</b>${ct.decisao ? `<br><small>${_cqEsc(ct.decisao.porNome)} · ${_cqFmtDH(ct.decisao.em)}${ct.decisao.comentario && !ct.decisao.auto ? ' — ' + _cqEsc(ct.decisao.comentario) : ''}</small>` : ''}</td>` : ''}</tr>`);
    });
  }
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Corrida ${_cqEsc(c.numero)}</title>
  <style>@page{size:A4;margin:14mm}body{font:12px/1.4 system-ui,sans-serif;color:#111}h1{font-size:16px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:10px}
  th,td{border:1px solid #999;padding:4px 6px;vertical-align:top;text-align:left}th{background:#eee}small{color:#555}.meta{display:grid;grid-template-columns:1fr 1fr;gap:2px 16px;margin-top:6px}</style></head>
  <body><h1>Registro de corrida de controle interno — ${_cqEsc(c.numero)}</h1>
  <div class="meta"><div><b>Área:</b> ${_cqEsc(un?.sigla)} — ${_cqEsc(un?.nome)}${un?.cnes ? ` (CNES ${_cqEsc(un.cnes)})` : ''}${_cqSetoresDeRegistro(c).filter(Boolean).length ? ` · <b>Setor:</b> ${_cqEsc([...new Set(_cqSetoresDeRegistro(c).filter(Boolean))].map(_cqRotuloSetor).join(', '))}` : ''}</div><div><b>Equipamento:</b> ${_cqEsc(c.ativoSnap?.nome || c.sistemaAnalitico || '')}${c.ativoSnap?.serie ? ` · S/N ${_cqEsc(c.ativoSnap.serie)}` : ''}</div>
  <div><b>Data/hora:</b> ${_cqFmtDH(c.dataHora)}</div><div><b>Executado por:</b> ${_cqEsc(c.operadorNome)}</div>
  <div><b>Lançado por:</b> ${_cqEsc(c.lancadoPorNome)} em ${_cqFmtDH(c.lancadoEm)} (estação ${_cqEsc(c.estacao || '')})</div><div><b>Situação:</b> ${_cqEsc(CQ_CORRIDA_STATUS[_cqStatusCorrida(c)]?.label)}</div>${c.observacao ? `<div style="grid-column:1/-1;"><b>Observação:</b> ${_cqEsc(c.observacao)}</div>` : ''}</div>
  ${typeof _cqEsterImpressaoHTML === 'function' ? _cqEsterImpressaoHTML(c) : ''}
  <table><thead><tr><th>Teste</th><th>Nível</th><th>Resultado</th><th>Alvo (média ± DP) / esperado</th><th>z</th><th>Avaliação / decisão</th></tr></thead><tbody>${linhas.join('')}</tbody></table>
  <p><small>Emitido em ${_cqFmtDH(_cqAgora())} por ${_cqEsc(_cqSess().nome)} · Sistema LAMIC — Controle de Qualidade v${CQ_VERSAO}</small></p>
  <script>window.onload=()=>window.print()<\/script></body></html>`;
  imprimirEmSegundoPlano(html);
}

// ── EXCLUSÃO DE CORRIDA (ATÉ 24 H) ───────────────────────────
// Para remover lançamentos de teste ou feitos por engano logo após o registro. Desfaz os vínculos:
// resultados, índices (pendência e última corrida de cada teste), NCs abertas pela corrida, uso dos
// preparos (e o preparo criado nela), reserva do lote da carga e leitura do ciclo. A corrida completa
// (cabeçalho, resultados e NCs) fica no histórico de exclusões; o número não é reaproveitado.
const CQ_EXCLUIR_CORRIDA_H = 24;
function _cqCorrHorasDesde(c) { const t = Date.parse(c?.lancadoEm || ''); return isNaN(t) ? Infinity : (Date.now() - t) / 36e5; }
function _cqCorrPodeExcluir(c) {
  if (!c || _cqCorrHorasDesde(c) > CQ_EXCLUIR_CORRIDA_H) return false;
  return c.lancadoPorId === _cqSess().id || _cqCan('invalidar');
}
function _cqCorrBtnExcluir(c) {
  if (!_cqCorrPodeExcluir(c)) return '';
  const rest = Math.max(0, CQ_EXCLUIR_CORRIDA_H - _cqCorrHorasDesde(c));
  const txt = rest >= 1 ? `${Math.floor(rest)} h` : `${Math.max(1, Math.round(rest * 60))} min`;
  return `<button class="btn btn-outline cq-btn-perigo" onclick="cqCorridaExcluir()" title="Disponível por mais ${txt} (até ${CQ_EXCLUIR_CORRIDA_H} h após o lançamento)">${CQ_ICO.lixo} Excluir corrida</button>`;
}

// Levanta tudo o que a exclusão precisa desfazer; `bloqueios` impede a exclusão
async function _cqCorrPlanoExclusao(u, mes, key) {
  const c = await cqCarregarCorrida(u, mes, key);
  if (!c) return { erro: 'Corrida não encontrada (já excluída?).' };
  const bloqueios = [];
  if (_cqCorrHorasDesde(c) > CQ_EXCLUIR_CORRIDA_H) bloqueios.push(`Lançada há mais de ${CQ_EXCLUIR_CORRIDA_H} h: use correção ou invalidação dos resultados.`);
  // Repetições lançadas a partir desta corrida
  const dProx = new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(4, 6), 1));   // 1º dia do mês seguinte
  const proxMes = `${dProx.getUTCFullYear()}${String(dProx.getUTCMonth() + 1).padStart(2, '0')}`;
  const vizinhas = { ...(await cqCarregarCorridasMes(u, mes)), ...(proxMes !== mes ? await cqCarregarCorridasMes(u, proxMes) : {}) };
  Object.values(vizinhas).filter(x => x.repeticaoDe === key && x.key !== key).forEach(x => bloqueios.push(`A corrida ${x.numero} é repetição desta: exclua-a primeiro.`));
  if (c.ciclo && !c.ciclo.vinculo && Object.keys(c.ciclo.leituras || {}).length) bloqueios.push(`O ciclo ${c.ciclo.loteCarga} já tem leitura de indicador em outra corrida: exclua a leitura primeiro.`);
  // NCs abertas pela decisão desta corrida
  const ncs = [];
  for (const [tid, ct] of Object.entries(c.testes || {})) {
    if (!ct?.ncId) continue;
    const ano = ct.ncAno || mes.slice(0, 4);
    const nc = await window.dbLoad(`${CQ_KEYS.acoes}/${u}/${ano}/${ct.ncId}`);
    if (!nc) continue;
    if (nc.ocorrenciaId) bloqueios.push(`A não conformidade ${nc.numero} gerou a ocorrência ${nc.ocorrenciaNumero || ''} do equipamento.`);
    if (Object.keys(nc.repeticoes || {}).some(k => k !== key)) bloqueios.push(`A não conformidade ${nc.numero} já tem repetição lançada.`);
    ncs.push({ tid, ano, id: ct.ncId, nc });
  }
  // Resultados (cópia crua para o histórico)
  const resultados = {};
  await Promise.all(Object.entries(c.testes || {}).filter(([, ct]) => !ct.naoRealizado).map(async ([tid, ct]) => {
    resultados[tid] = {};
    await Promise.all(Object.values(ct.niveis || {}).map(async rk => { resultados[tid][rk] = await window.dbLoad(`${CQ_KEYS.resultados}/${u}/${mes}/${tid}/${rk}`); }));
  }));
  return { c, bloqueios, ncs, resultados };
}

function cqCorridaExcluir() {
  const ctx = _cqCorrAberta;
  if (!ctx) return;
  (async () => {
    let plano;
    try { plano = await _cqCorrPlanoExclusao(ctx.u, ctx.mes, ctx.key); }
    catch (err) { console.error('[cq-lancamento.js] cqCorridaExcluir:', err); showToast('Não foi possível verificar a corrida. Tente novamente.', 'error'); return; }
    if (plano.erro) { showToast(plano.erro, 'error'); return; }
    const { c, bloqueios, ncs } = plano;
    if (!_cqCorrPodeExcluir(c)) { showToast('Sem permissão para excluir esta corrida.', 'error'); return; }
    const nomes = Object.entries(c.testes || {}).map(([tid, ct]) => `${cqState.config.testes[tid] ? _cqNomeTeste(cqState.config.testes[tid]) : tid}${ct.naoRealizado ? ' (não realizado)' : ''}`);
    const preps = Object.values(c.testes || {}).filter(ct => ct.prep && ct.lr).map(ct => {
      const ins = cqState.config.insumos[ct.lr];
      const p = ins ? _cqPreparo(ins, ct.prep) : null;
      return p ? `${p.codigo || 'preparo de ' + _cqFmtData(p.data)}${_cqPrepCriadoNaCorrida(p, c) ? ' (criado nesta corrida: será excluído)' : ''}` : '';
    }).filter(Boolean);
    cqModalClose();
    if (bloqueios.length) {
      _cqPrompt({ titulo: 'Não é possível excluir a corrida', subtitulo: `Corrida ${c.numero} · ${_cqFmtDH(c.dataHora)}`, confirmar: 'Entendi',
        corpo: `<div class="cq-alerta-box">${CQ_ICO.alerta} ${bloqueios.map(_cqEsc).join('<br>')}</div>`, onConfirm: () => { cqAbrirCorrida(ctx.mes, ctx.key); return true; } });
      return;
    }
    const li = (l, v) => `<div class="cq-excl-lin"><span>${l}</span><b>${v}</b></div>`;
    _cqPrompt({
      titulo: 'Excluir corrida', subtitulo: `Corrida ${c.numero} · ${c.ativoSnap?.nome || c.sistemaAnalitico || ''} · ${_cqFmtDH(c.dataHora)}`, perigo: true, confirmar: 'Excluir corrida',
      corpo: `<div class="cq-alerta-box">${CQ_ICO.alerta} A corrida e seus resultados deixam de aparecer em gráficos, relatórios e liberações. Use só para lançamentos de teste ou feitos por engano; para valor digitado errado, prefira corrigir ou invalidar o resultado.</div>
        <div class="cq-excl-resumo">
          ${li('Testes', _cqEsc(nomes.join(', ')))}
          ${li('Lançada', `${_cqEsc(c.lancadoPorNome)} · ${_cqFmtDH(c.lancadoEm)}`)}
          ${ncs.length ? li('Não conformidades', _cqEsc(ncs.map(x => x.nc.numero).join(', ')) + ' <span class="cq-muted">(excluídas junto)</span>') : ''}
          ${preps.length ? li('Preparos', _cqEsc(preps.join('; '))) : ''}
          ${c.ciclo ? li('Ciclo de esterilização', _cqEsc(c.ciclo.vinculo ? `leitura do ciclo ${c.ciclo.loteCarga} (removida)` : `lote da carga ${c.ciclo.loteCarga} liberado para reuso`)) : ''}
        </div>
        <div class="cq-nota">Uma cópia completa fica no histórico de exclusões (RDC 978/2025). O número ${_cqEsc(c.numero)} não é reaproveitado.</div>
        <div class="form-field"><label class="field-label">Motivo <span class="required">*</span></label>
          <input type="text" id="cq-corr-excl-motivo" class="field-input" maxlength="200" placeholder="Ex.: lançamento de teste / corrida lançada no equipamento errado" onkeydown="if(event.key==='Enter')cqPromptConfirmar()"></div>`,
      onConfirm: async () => {
        const motivo = _cqVal('cq-corr-excl-motivo');
        if (!motivo) { showToast('Informe o motivo da exclusão.', 'error'); return false; }
        if (!_cqPodeGravar() || _cqSalvando) return false;
        _cqSalvando = true;
        try { return await _cqCorrExcluirGravar(ctx, motivo); }
        catch (err) { console.error('[cq-lancamento.js] cqCorridaExcluir:', err); showToast('Falha ao excluir. Nada foi alterado.', 'error'); return false; }
        finally { _cqSalvando = false; }
      },
    });
  })();
}

// Preparo registrado no lançamento desta corrida (e só usado nela)
function _cqPrepCriadoNaCorrida(p, c) {
  return !!p && p.origem !== 'preparos' && !p.legado && p.criadoEm === c.lancadoEm && Object.keys(p.corridas || {}).every(k => k === c.key);
}

async function _cqCorrExcluirGravar(ctx, motivo) {
  const { u, mes, key } = ctx;
  // Revalida com o banco atual
  const plano = await _cqCorrPlanoExclusao(u, mes, key);
  if (plano.erro) { showToast(plano.erro, 'error'); return true; }
  if (plano.bloqueios.length) { showToast(plano.bloqueios[0], 'error'); return true; }
  const { c, ncs, resultados } = plano;
  if (!_cqCorrPodeExcluir(c)) { showToast('Sem permissão ou prazo de exclusão encerrado.', 'error'); return true; }
  const ass = _cqAssinatura();
  const base = `${CQ_KEYS.corridas}/${u}/${mes}/${key}`;
  const updates = { [base]: null, [`${CQ_KEYS.indices}/${u}/pendentes/${key}`]: null, [`${CQ_KEYS.indices}/${u}/ciclosPendentes/${key}`]: null };
  Object.entries(resultados).forEach(([tid, rks]) => Object.keys(rks).forEach(rk => { updates[`${CQ_KEYS.resultados}/${u}/${mes}/${tid}/${rk}`] = null; }));

  // Última corrida de cada teste: volta para a anterior (até 3 meses)
  const testes = Object.entries(c.testes || {}).filter(([, ct]) => !ct.naoRealizado).map(([tid]) => tid);
  const idxUlt = (cqState.indices[u] || {}).ultimo || {};
  const afetados = testes.filter(tid => idxUlt[tid]?.corridaKey === key);
  if (afetados.length) {
    const meses = CQEngine.mesesAnteriores(mes, 3);
    const anteriores = (await Promise.all(meses.map(m => cqCarregarCorridasMes(u, m)))).flatMap(o => Object.values(o))
      .filter(x => x.key !== key).sort((a, b) => (b.dataHora || '').localeCompare(a.dataHora || ''));
    afetados.forEach(tid => {
      const x = anteriores.find(y => y.testes?.[tid] && !y.testes[tid].naoRealizado);
      const ct = x?.testes[tid];
      updates[`${CQ_KEYS.indices}/${u}/ultimo/${tid}`] = x ? { dataHora: x.dataHora, corridaKey: x.key, mes: x.mes, status: ct.avaliacao?.status || 'aceito',
        decisao: ct.decisao ? CQ_DECISAO[ct.decisao.acao]?.sigla || null : null, lr: ct.lr || null, lk: ct.lk || null } : null;
    });
  }
  // NCs abertas por esta corrida
  ncs.forEach(({ ano, id }) => { updates[`${CQ_KEYS.acoes}/${u}/${ano}/${id}`] = null; updates[`${CQ_KEYS.indices}/${u}/ncAbertas/${id}`] = null; });
  // Repetição: retira o registro da NC da corrida original
  if (c.repeticaoDe) {
    const orig = await cqCarregarCorrida(u, CQEngine.mesDe(c.repeticaoDe), c.repeticaoDe);
    Object.values(orig?.testes || {}).forEach(ct => { if (ct?.ncId) updates[`${CQ_KEYS.acoes}/${u}/${ct.ncAno || CQEngine.mesDe(c.repeticaoDe).slice(0, 4)}/${ct.ncId}/repeticoes/${key}`] = null; });
  }
  // Preparos: tira o uso; desfaz a liberação/reprovação e a finalização automática vindas desta corrida
  const prepFeitos = new Set();
  Object.values(c.testes || {}).forEach(ct => {
    if (!ct.prep || !ct.lr || prepFeitos.has(ct.lr + ct.prep)) return;
    prepFeitos.add(ct.lr + ct.prep);
    const ins = cqState.config.insumos[ct.lr];
    const p = ins ? _cqPreparo(ins, ct.prep) : null;
    if (!p || p.legado) return;
    const pb = `${CQ_KEYS.config}/insumos/${ct.lr}/preparos/${ct.prep}`;
    if (_cqPrepCriadoNaCorrida(p, c)) {
      updates[pb] = null;
      updates[`${CQ_KEYS.config}/insumos/${ct.lr}/trilha/${_cqTk()}${ct.prep.slice(-3)}`] = _cqTrilhaEntry('exclusao', `Preparo ${p.codigo || 'de ' + _cqFmtData(p.data)} excluído com a corrida ${c.numero}: ${motivo}`);
      return;
    }
    updates[`${pb}/corridas/${key}`] = null;
    if (p.avaliacao?.corridaKey === key) { updates[`${pb}/situacao`] = 'em_avaliacao'; updates[`${pb}/avaliacao`] = null; }
    if (p.finalizado?.auto && String(p.finalizado.motivo || '').endsWith(`corrida ${c.numero}`)) updates[`${pb}/finalizado`] = null;
    updates[`${CQ_KEYS.config}/insumos/${ct.lr}/trilha/${_cqTk()}${ct.prep.slice(-3)}`] = _cqTrilhaEntry('edicao', `Uso do preparo ${p.codigo || 'de ' + _cqFmtData(p.data)} na corrida ${c.numero} removido (corrida excluída): ${motivo}`);
  });
  // Esterilização: libera o lote da carga ou retira a leitura do ciclo de origem
  if (c.ciclo && !c.ciclo.vinculo && typeof _cqEsterCaminhoLote === 'function' && c.ciclo.loteCarga) {
    const pl = _cqEsterCaminhoLote(u, c.ciclo.loteCarga);
    const res = await window.dbLoad(pl);
    if (res && (res.corridaKey === key || res.numero === c.numero)) updates[pl] = null;
  }
  if (c.ciclo?.vinculo) {
    const v = c.ciclo.vinculo;
    updates[`${CQ_KEYS.corridas}/${u}/${v.mes}/${v.key}/ciclo/leituras/${key}`] = null;
    updates[`${CQ_KEYS.corridas}/${u}/${v.mes}/${v.key}/trilha/${_cqTk()}`] = _cqTrilhaEntry('exclusao', `Testes da corrida ${c.numero} removidos do ciclo (corrida excluída): ${motivo}`);
    if (typeof _cqEsterStatusOrigem === 'function') Object.assign(updates, (await _cqEsterStatusOrigem(u, v.mes, v.key, o => { delete o.ciclo.leituras[key]; }, `corrida ${c.numero} excluída`)).up);
  }
  updates[`${CQ_KEYS.exclusoes}/${_cqTk()}`] = {
    colecao: 'corridas', id: key, unidadeId: u, mes, numero: c.numero, motivo,
    resumo: `Corrida ${c.numero} · ${c.ativoSnap?.nome || c.sistemaAnalitico || ''} · ${_cqFmtDH(c.dataHora)}`,
    registro: c, resultados, ncs: ncs.length ? Object.fromEntries(ncs.map(x => [x.id, x.nc])) : null, ...ass,
  };
  if (!(await window.dbUpdate(updates))) { showToast('Falha ao excluir. Verifique a conexão e tente novamente.', 'error'); return false; }
  // Caches locais
  testes.forEach(tid => _cqResCacheInvalidar(u, mes, tid));
  Object.entries(updates).forEach(([p, v]) => {
    if (!p.startsWith(`${CQ_KEYS.indices}/${u}/`)) return;
    const [grupo, id] = p.slice(`${CQ_KEYS.indices}/${u}/`.length).split('/');
    const idx = cqState.indices[u] = cqState.indices[u] || {};
    idx[grupo] = idx[grupo] || {};
    if (v === null) delete idx[grupo][id]; else idx[grupo][id] = v;
  });
  _cqCorrCache = null;
  _cqCorrAberta = null;
  showToast(`Corrida ${c.numero} excluída.`, 'success');
  cqRender();
  return true;
}
