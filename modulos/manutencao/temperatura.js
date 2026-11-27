// ════════════════════════════════════════════════════════════════
// temperatura.js — Controle de Temperatura (aba do módulo Manutenção)
//
// Dados: nó RAIZ "temperatura" do applamic (banco do Dados LAMIC), fora de manutencao/,
// para ter regras próprias no banco (firebase/database.rules.json) sem mexer no resto do Manutenção.
//   temperatura/equipamentos/{id}: { id, unidadeId, ativoId|null, ambienteId|null, codigo, tipo, legenda, min, max, ativo, criadoEm }
//     obrigatorio: false = sob rotina (ex.: caixas de transporte): sem pendência, sem sino, sem cobrança
//     vínculo: ativoId (geladeira, freezer, estufa…) OU ambienteId (sala do org: temperatura ambiente) OU nenhum
//   temperatura/leituras/{unidadeId}/{AAAA-MM}/{equipId}_{DD}_{turno}:
//       { equipId, data, turno, min, max, atual, justificativa, ocorrenciaId,
//         login, nome, gravadoEm, editadoEm, editadoPor }
//   temperatura/acesso/{login}: { unidades: { unidadeId: true }, em }
//       Índice gerado a partir dos SETORES VISÍVEIS do grupo (Configurações › Usuários e grupos):
//       unidade com algum setor visível → vê a Temperatura dela. Grupo sem setor marcado → só a unidade do RH.
//       Gravado por quem tem temperatura.configurar (ao salvar grupos/usuários e no botão Recalcular).
// unidadeId = id em rh_unidades (RH). Feriados: nó raiz "feriados". Regras de pendência: js/temperatura-calc.js.
//
// Permissões: grupos do PORTAL (Administração › Grupos): temperatura.ver, .lancar,
// .configurar. O banco confere as mesmas permissões nas regras.
// Unidade do usuário = usuarios/{login}/unidadeId (gravado pelo RH).
// ════════════════════════════════════════════════════════════════

const TEMP_RAIZ = 'temperatura';
const TEMP_CORTE = { manha: 12, tarde: 17 };       // hora a partir da qual o turno de hoje fica atrasado
const TEMP_TURNOS = { manha: 'Manhã', tarde: 'Tarde' };
const TEMP_ICON_TURNO = { manha: 'fa-cloud-sun', tarde: 'fa-sun' };
const TEMP_MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const tempState = {
  equipamentos: {}, acesso: null, acessos: {}, feriados: {}, leituras: {},
  unidadeId: null, ano: 0, mes: 0, equipSel: null, eqAba: 'ativos', eqBusca: '',
  offLeituras: null, prontos: false, perms: null, rh: {},
};
let _tChart = null;
let _tChartVez = 0;   // só a chamada mais recente desenha (render e seleção podem chegar juntas)
let _tempModal = null;   // { data, turno, equipIds }

// ── banco: caminhos completos a partir da raiz do applamic ──────
function dbListenT(path, cb) {
  const r = rootDb.ref(path);
  r.on('value', s => cb(s.val()), e => console.warn('[temperatura]', path, e && e.code));
  return () => r.off('value');
}
async function dbGetT(path) { try { return (await rootDb.ref(path).once('value')).val(); } catch (e) { console.warn('[temperatura]', path, e && e.code); return null; } }
async function dbUpdateT(up) { try { await rootDb.ref().update(up); return true; } catch (e) { console.error('[temperatura] gravar:', e); return false; } }

// ── permissões (grupos do portal) ───────────────────────────────
const _T_PERM = { visualizar: 'ver', lancarLeituras: 'lancar', exportarLeituras: 'exportar', importarLeituras: 'importar', configurarTemperatura: 'configurar' };
function _tPerfil() { return typeof _authPerfilDados !== 'undefined' ? _authPerfilDados : null; }
function _tLogin() { return _tPerfil()?.login || ''; }
function _tAdmin() { return _tPerfil()?.grupo === 'admin'; }
// Permissão: admin do portal, grupo do portal (temperatura_*), grupo do Manutenção (temperatura.*) ou índice acesso.perms.
// O banco aceita o grupo do portal ou o índice (gravado por quem configura a partir dos grupos do Manutenção).
const _T_PERM_MANUT = { visualizar: 'verTemperatura', lancarLeituras: 'lancarLeituras', exportarLeituras: 'exportarLeituras', importarLeituras: 'importarLeituras', configurarTemperatura: 'configurarTemperatura' };
function _tCan(k) {
  if (_tAdmin()) return true;
  const curto = _T_PERM[k] || k;
  if (tempState.perms?.['temperatura_' + curto] === true) return true;
  if (tempState.acesso?.perms?.[curto] === true) return true;
  return typeof authHasPermission === 'function' && authHasPermission('temperatura.' + (_T_PERM_MANUT[k] || k));
}
function tempPodeVer() { return _tCan('visualizar'); }
function tempPodeConfigurar() { return _tCan('configurarTemperatura'); }

// ── utilidades ──────────────────────────────────────────────────
const _tEsc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const _tP2 = (n) => String(n).padStart(2, '0');
const _tYm = (a, m) => `${a}-${_tP2(m + 1)}`;
const _tIso = (a, m, d) => `${a}-${_tP2(m + 1)}-${_tP2(d)}`;
const _tBR = (iso) => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '';
const _tNum = (v) => { if (v === '' || v == null) return null; const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; };
const _tFmt = (v) => v == null ? '—' : Number(v).toFixed(1).replace('.', ',');
function _tAgora() { return new Date(Date.now() + (window._dbClockSkewMs || 0)); }
function _tToast(m, t) { if (typeof showToast === 'function') showToast(m, t); }
function _tChave(equipId, iso, turno) { return `${equipId}_${iso.slice(8, 10)}_${turno}`; }

function _tLoadScript(src, teste) {
  if (teste()) return Promise.resolve();
  return new Promise((ok, erro) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => erro(new Error('Falha ao carregar ' + src)); document.head.appendChild(s); });
}
const _tChartJs = () => _tLoadScript('https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js', () => typeof Chart !== 'undefined');
const _tXlsx = () => _tLoadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', () => typeof XLSX !== 'undefined');

// ── unidades visíveis ───────────────────────────────────────────
function _tTodasUnidades() {
  return Object.entries(tempState.rh || {}).filter(([, u]) => u && u.nome && u.ativa !== false)
    .map(([id, u]) => ({ id, nome: u.nome, sigla: u.sigla || '' }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }));
}
const _tNormNome = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
// unidadeId vem do RH (usuarios/{login}/unidadeId); o banco usa esse id nas regras
function _tMinhaUnidadeId() { return _tPerfil()?.unidadeId || null; }
function _tUnidadesVisiveis() {
  return TempCalc.unidadesVisiveis({ todas: _tTodasUnidades(), admin: _tAdmin(), minha: _tMinhaUnidadeId(),
    acesso: tempState.acesso });
}
// unidade do org (Manutenção) ligada à unidade do RH — usada só para filtrar ativos
function _tOrgDaUnidadeRh(rhId) { return Object.values((typeof orgState !== 'undefined' && orgState.unidades) || {}).find(u => u && String(u.rhId) === String(rhId))?.id || null; }
const _tNomeUnidade = (id) => { const u = _tTodasUnidades().find(x => x.id === id); return u ? (u.nome || u.sigla) : '—'; };

// ── feriados ────────────────────────────────────────────────────
function _tFeriado(iso) { return TempCalc.feriado(tempState.feriados, iso); }
function _tDiaUtil(a, m, d) { return TempCalc.diaUtil(tempState.feriados, a, m, d); }

// ── equipamentos / leituras ─────────────────────────────────────
// Mnemônicos liberados ao usuário (índice acesso/{login}.equips); sem lista = todos das unidades visíveis
function _tEquipLiberado(e) { const l = tempState.acesso?.equips; return _tAdmin() || !l || !!l[e.id]; }
function _tEquipsDaUnidade(uid) {
  return Object.values(tempState.equipamentos || {}).filter(e => e && e.unidadeId === uid && e.ativo !== false && _tEquipLiberado(e))
    .sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), 'pt-BR', { numeric: true }));
}
function _tLeitura(equipId, iso, turno) { return tempState.leituras[_tChave(equipId, iso, turno)] || null; }
function _tAtrasado(iso, turno) { return TempCalc.atrasado(iso, turno, _tAgora()); }
function _tAtivo(id) { return (typeof state !== 'undefined' ? state.ativos : []).find(a => a && a.id === id) || null; }
function _tAmbiente(id) { return id && typeof orgState !== 'undefined' ? orgState.ambientes?.[id] || null : null; }
// rótulo do vínculo: ativo, ambiente (sala) ou nenhum
function _tVinculo(e) {
  const at = e.ativoId ? _tAtivo(e.ativoId) : null;
  if (at) return { tipo: 'ativo', curto: at.codigo || at.nome, longo: (at.codigo ? at.codigo + ' · ' : '') + at.nome, ic: 'fa-box' };
  const am = _tAmbiente(e.ambienteId);
  if (am) return { tipo: 'ambiente', curto: am.nome, longo: 'Sala: ' + am.nome, ic: 'fa-door-open' };
  return null;
}
function _tTagVinculo(e) { const v = _tVinculo(e); return v ? `<span class="temp-tag"><i class="fas ${v.ic}"></i> ${_tEsc(v.curto)}</span>` : '<span class="temp-tag amb">sem vínculo</span>'; }

// Dias do mês (até hoje) sem leitura "atual" em algum turno — regra em js/temperatura-calc.js
function _tPendencias(uid = tempState.unidadeId, a = tempState.ano, m = tempState.mes) {
  return TempCalc.pendencias({ equips: _tEquipsDaUnidade(uid), leituras: tempState.leituras, feriados: tempState.feriados, ano: a, mes: m, agora: _tAgora() });
}

// ── inicialização ───────────────────────────────────────────────
function tempIniciar() {
  if (tempState.prontos) return;
  tempState.prontos = true;
  const ag = _tAgora();
  tempState.ano = ag.getFullYear(); tempState.mes = ag.getMonth();
  rootDb.ref('rh_unidades').on('value', s => { tempState.rh = s.val() || {}; _tAtualizar(); }, e => console.warn('[temperatura] rh_unidades:', e && e.code));
  dbListenT(`${TEMP_RAIZ}/equipamentos`, v => { tempState.equipamentos = v || {}; _tAtualizar(); });
  const login = _tLogin();
  if (login) dbListenT(`${TEMP_RAIZ}/acesso/${login}`, v => { tempState.acesso = v || null; _tAtualizar(); });
  if (tempPodeConfigurar()) {
    dbListenT(`${TEMP_RAIZ}/acesso`, v => { tempState.acessos = v || {}; if (document.getElementById('cpanel-temperatura')?.classList.contains('active')) tempRenderConfig(); });
    setTimeout(() => tempGravarAcessos(true), 4000);   // mantém o índice em dia com grupos/setores
  }
  if (typeof rootDb !== 'undefined') rootDb.ref('feriados').on('value', s => { tempState.feriados = s.val() || {}; _tAtualizar(); }, e => console.warn('[temperatura] feriados:', e && e.code));
  // turno pode virar "atrasado" com a tela aberta
  setInterval(() => { if (_tAbaAtiva()) tempRender(); else _tAtualizarBadge(); }, 60000);
}
function _tAbaAtiva() { return document.getElementById('tab-temperatura')?.classList.contains('active'); }
function _tAtualizar() {
  if (document.getElementById('cpanel-temperatura')?.classList.contains('active')) tempRenderConfig();
  if (_tAbaAtiva()) tempRender(); else _tAtualizarBadge();
}

function _tOuvirLeituras() {
  const uid = tempState.unidadeId, ym = _tYm(tempState.ano, tempState.mes);
  const chave = uid ? `${uid}/${ym}` : '';
  if (tempState._ouvindo === chave) return;
  if (tempState.offLeituras) { tempState.offLeituras(); tempState.offLeituras = null; }
  tempState._ouvindo = chave; tempState.leituras = {};
  if (!uid) return;
  tempState.offLeituras = dbListenT(`${TEMP_RAIZ}/leituras/${chave}`, v => { tempState.leituras = v || {}; if (_tAbaAtiva()) tempRender(); else _tAtualizarBadge(); });
}

function _tAtualizarBadge() {
  const el = document.getElementById('temp-nav-badge'); if (!el || !tempState.unidadeId) return;
  const n = _tPendencias().filter(x => x.atrasado).length;
  el.textContent = n; el.style.display = n ? '' : 'none';
}

// ── render da aba ───────────────────────────────────────────────
function tempRender() {
  tempIniciar();
  const tab = document.getElementById('tab-temperatura'); if (!tab) return;
  const vis = _tUnidadesComEquip();
  if (!vis.find(u => u.id === tempState.unidadeId)) tempState.unidadeId = (vis.find(u => u.id === _tMinhaUnidadeId()) || vis[0])?.id || null;
  _tOuvirLeituras();
  if (!vis.length) {
    tab.innerHTML = `<div class="temp-vazio"><i class="fas fa-building-circle-exclamation"></i><b>Nenhuma unidade disponível</b>
      <p>Sua unidade é a do seu cadastro no RH. Peça ao RH para vincular (ou salvar de novo) seu cadastro de funcionário, ou ao administrador para liberar o acesso.</p></div>`;
    return;
  }
  const eqs = _tEquipsDaUnidade(tempState.unidadeId);
  if (!tempState.eqAba) tempState.eqAba = 'ativos';
  if (!eqs.some(e => _tEhCaixa(e) === (tempState.eqAba === 'caixas')) && eqs.length) tempState.eqAba = tempState.eqAba === 'caixas' ? 'ativos' : 'caixas';
  const daAba = eqs.filter(e => _tEhCaixa(e) === (tempState.eqAba === 'caixas'));
  if (!daAba.find(e => e.id === tempState.equipSel)) tempState.equipSel = daAba[0]?.id || null;
  const pendUn = _tPendencias();                                   // unidade inteira (KPI)
  const atrUn = pendUn.filter(p => p.atrasado);
  const pend = pendUn.filter(p => p.equip.id === tempState.equipSel);  // sino: só o mnemônico selecionado
  const atr = pend.filter(p => p.atrasado);
  const eqSel = tempState.equipamentos[tempState.equipSel];
  const ag = _tAgora(), hoje = _tIso(ag.getFullYear(), ag.getMonth(), ag.getDate());
  const statusHoje = (e) => {
    if (e.obrigatorio === false) { const n = ['manha', 'tarde'].filter(t => _tLeitura(e.id, hoje, t)?.atual != null).length; return { cls: 'rot', txt: `<i class="fas fa-truck"></i> sob rotina${n ? ' · ' + n + ' hoje' : ''}` }; }
    if (!_tDiaUtil(ag.getFullYear(), ag.getMonth(), ag.getDate())) return { cls: 'ok', txt: '<i class="fas fa-mug-hot"></i> sem leitura hoje' };
    const f = ['manha', 'tarde'].filter(t => _tLeitura(e.id, hoje, t)?.atual == null);
    if (!f.length) return { cls: 'ok', txt: '<i class="fas fa-check"></i> completo' };
    const late = f.some(t => _tAtrasado(hoje, t));
    return { cls: late ? 'pend' : 'meio', txt: `${late ? '<i class="fas fa-circle-exclamation"></i>' : '<i class="fas fa-clock"></i>'} falta ${f.map(t => TEMP_TURNOS[t].toLowerCase()).join(' e ')}` };
  };
  tempState._statusHoje = statusHoje;
  const leiturasMes = Object.values(tempState.leituras || {});
  const fora = leiturasMes.filter(l => { const e = tempState.equipamentos[l.equipId]; return e && l.atual != null && (l.atual < e.min || l.atual > e.max); }).length;
  const eqsObrig = eqs.filter(e => e.obrigatorio !== false);
  const hojeCompletos = eqsObrig.filter(e => statusHoje(e).cls === 'ok').length;

  tab.innerHTML = `
  <div class="temp-head">
    <div class="temp-chip"><button class="temp-btn" onclick="tempTogglePop('temp-pop-un',event)"><i class="fas fa-building"></i>Unidade: <b>${_tEsc(_tNomeUnidade(tempState.unidadeId))}</b>${vis.length > 1 ? '<i class="fas fa-chevron-down"></i>' : ''}</button>
      ${vis.length > 1 ? `<div class="temp-pop" id="temp-pop-un"><input placeholder="Buscar unidade..." oninput="tempFiltrarUnidades(this.value)"><div id="temp-lista-un">${_tListaUnidades(vis, '')}</div></div>` : ''}</div>
    <div class="temp-chip"><button class="temp-btn" onclick="tempTogglePop('temp-pop-mes',event)"><i class="fas fa-calendar"></i><b>${TEMP_MESES[tempState.mes]} / ${tempState.ano}</b><i class="fas fa-chevron-down"></i></button>
      <div class="temp-pop" id="temp-pop-mes" style="width:250px"><div class="temp-ano-nav"><button onclick="tempMudarAno(-1,event)"><i class="fas fa-chevron-left"></i></button><b>${tempState.ano}</b><button onclick="tempMudarAno(1,event)"><i class="fas fa-chevron-right"></i></button></div>
        <div class="temp-mgrid">${TEMP_MESES.map((n, i) => `<div class="temp-it ${i === tempState.mes ? 'sel' : ''}" onclick="tempMudarMes(${i})">${n}</div>`).join('')}</div></div></div>
    <div class="temp-sp"></div>
    <div class="temp-chip temp-bell"><button class="temp-btn" onclick="tempTogglePop('temp-pop-notif',event)" title="Dias não preenchidos"><i class="fas fa-bell"></i></button>
      ${pend.length ? `<span class="temp-bdg ${atr.length ? '' : 'amb'}">${pend.length}</span>` : ''}
      <div class="temp-pop temp-pop-dir" id="temp-pop-notif"><div class="temp-ph"><span>Dias não preenchidos${eqSel ? ' — ' + _tEsc(eqSel.codigo) : ''}</span><small>${TEMP_MESES[tempState.mes]}/${tempState.ano} · sem dom./feriados</small></div>
        <div class="temp-notif-lista">${pend.map(p => `<div class="temp-ni" onclick="tempAbrirRegistro('${p.iso}','${p.faltam[0]}','${p.equip.id}')">
          <i class="fas ${p.atrasado ? 'fa-circle-exclamation temp-ic-red' : 'fa-clock temp-ic-amb'}"></i>
          <div><div class="temp-ni-t">${_tBR(p.iso).slice(0, 5)} — ${_tEsc(p.equip.codigo)}</div><div class="temp-ni-s">${p.atrasado ? 'Atrasado' : 'Hoje, no prazo'} · falta ${p.faltam.map(t => TEMP_TURNOS[t].toLowerCase()).join(' e ')}</div></div>
          <i class="fas fa-chevron-right temp-ni-seta"></i></div>`).join('') || '<div class="temp-ni temp-ni-s"><i class="fas fa-circle-check temp-ic-grn"></i> Tudo preenchido</div>'}</div></div></div>
    ${_tCan('exportarLeituras') ? `<div class="temp-chip"><button class="temp-btn" onclick="tempTogglePop('temp-pop-bkp',event)"><i class="fas fa-database"></i>Backup<i class="fas fa-chevron-down"></i></button>
      <div class="temp-pop temp-pop-dir" id="temp-pop-bkp" style="width:270px">
        <div class="temp-it" onclick="tempEscolherPeriodo('unidade')"><span><i class="fas fa-file-export"></i> Exportar unidade (.xlsx)</span></div>
        ${vis.length > 1 ? `<div class="temp-it" onclick="tempEscolherPeriodo('todas')"><span><i class="fas fa-file-zipper"></i> Exportar unidades visíveis</span></div>` : ''}
      </div></div>` : ''}
    ${_tCan('lancarLeituras') && eqSel ? `<button class="temp-btn pri" onclick="tempAbrirRegistro(null, null, tempState.equipSel)" title="Registrar leituras de ${_tEsc(eqSel.codigo)}"><i class="fas fa-plus"></i>Registrar ${_tEsc(eqSel.codigo)}</button>` : ''}
  </div>
  <div class="temp-kpis">
    <div class="temp-kpi"><div class="v">${eqs.length}</div><div class="l">Equipamentos monitorados</div></div>
    <div class="temp-kpi grn"><div class="v">${hojeCompletos}/${eqsObrig.length}</div><div class="l">Completos hoje${eqs.length > eqsObrig.length ? ` · ${eqs.length - eqsObrig.length} sob rotina` : ''}</div></div>
    <div class="temp-kpi red"><div class="v">${atrUn.length}</div><div class="l">Pendências atrasadas no mês</div></div>
    <div class="temp-kpi amb"><div class="v">${fora}</div><div class="l">Leituras fora da faixa no mês</div></div>
  </div>
  ${eqs.length ? `<div class="temp-grid">
    <div class="temp-card temp-eq-card">
      <div class="temp-eq-topo">
        <div class="temp-subabas">${['ativos', 'caixas'].map(k => `<button type="button" class="${tempState.eqAba === k ? 'on' : ''}" onclick="tempEqAba('${k}')"><i class="fas ${k === 'caixas' ? 'fa-truck' : 'fa-snowflake'}"></i> ${k === 'caixas' ? 'Caixas' : 'Ativos'} <em>${eqs.filter(e => _tEhCaixa(e) === (k === 'caixas')).length}</em></button>`).join('')}</div>
        <label class="temp-busca"><i class="fas fa-magnifying-glass"></i><input type="search" id="temp-eq-busca" placeholder="Buscar equipamento ou mnemônico…" value="${_tEsc(tempState.eqBusca)}" oninput="tempEqBuscar(this.value)" autocomplete="off"><button type="button" class="temp-busca-x" title="Limpar busca" onclick="tempEqLimpar()" ${tempState.eqBusca ? '' : 'hidden'}><i class="fas fa-xmark"></i></button></label>
        <small class="temp-fx">status de hoje</small>
      </div>
      <div class="temp-eq-lista" id="temp-eq-lista">${_tListaEquipHtml()}</div>
    </div>
    <div class="temp-card" id="temp-detalhe">${_tDetalheHtml()}</div>
  </div>` : `<div class="temp-vazio"><i class="fas fa-temperature-empty"></i><b>Nenhum equipamento nesta unidade</b><p>Cadastre em Configurações › Temperatura.</p></div>`}`;
  _tDesenharGrafico();
  _tAtualizarBadge();
}

// Unidades visíveis que têm equipamento (ativo e liberado ao usuário). Sem nenhum em lugar algum: todas (mostra o aviso de vazio).
function _tUnidadesComEquip() {
  const vis = _tUnidadesVisiveis();
  const com = vis.filter(u => _tEquipsDaUnidade(u.id).length);
  return com.length ? com : vis;
}
function _tListaUnidades(vis, q) {
  const n = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return vis.filter(u => n(u.nome + ' ' + u.sigla).includes(n(q))).map(u => {
    const qtd = _tEquipsDaUnidade(u.id).length;
    return `<div class="temp-it ${u.id === tempState.unidadeId ? 'sel' : ''}" onclick="tempMudarUnidade('${u.id}')"><span>${_tEsc(u.nome || u.sigla)}</span><small>${qtd} eq.</small></div>`;
  }).join('') || '<div class="temp-it"><small>Nenhuma unidade</small></div>';
}

function _tDetalheHtml() {
  const e = tempState.equipamentos[tempState.equipSel]; if (!e) return '';
  const a = tempState.ano, m = tempState.mes, ultimo = new Date(a, m + 1, 0).getDate();
  const ag = _tAgora(), hoje = _tIso(ag.getFullYear(), ag.getMonth(), ag.getDate());
  const podeLancar = _tCan('lancarLeituras');
  const cel = (v) => `<td class="${v != null && (v < e.min || v > e.max) ? 'out' : ''}">${_tFmt(v)}</td>`;
  const quick = (iso, t) => {
    if (!podeLancar) return `<td colspan="3" class="miss">—</td>`;
    // caixas (sob rotina): botão verde, sem cobrança de prazo
    if (e.obrigatorio === false) return `<td colspan="3"><button class="temp-qf rot" onclick="tempAbrirRegistro('${iso}','${t}','${e.id}')"><i class="fas fa-plus"></i> Preencher ${TEMP_TURNOS[t].toLowerCase()}</button></td>`;
    const noPrazo = iso === hoje && !_tAtrasado(iso, t);
    return `<td colspan="3"><button class="temp-qf ${noPrazo ? 'wait' : ''}" onclick="tempAbrirRegistro('${iso}','${t}','${e.id}')"><i class="fas ${noPrazo ? 'fa-clock' : 'fa-plus'}"></i> Preencher ${TEMP_TURNOS[t].toLowerCase()}${noPrazo ? ` (até ${TEMP_CORTE[t]}h)` : ''}</button></td>`;
  };
  const linhas = [];
  for (let d = ultimo; d >= 1; d--) {
    const iso = _tIso(a, m, d);
    if (iso > hoje) continue;
    const fer = _tFeriado(iso), dom = new Date(a, m, d).getDay() === 0;
    const lm = _tLeitura(e.id, iso, 'manha'), lt = _tLeitura(e.id, iso, 'tarde');
    if (e.obrigatorio === false && !lm && !lt && iso !== hoje) continue;   // sob rotina: só os dias com leitura (+ hoje, para preencher)
    if ((fer || dom) && !lm && !lt) { if (fer) linhas.push(`<tr class="hol"><td>${iso.slice(8)}/${iso.slice(5, 7)}</td><td colspan="8"><i class="fas fa-calendar-xmark"></i> ${_tEsc(fer.nome || 'Feriado')}</td></tr>`); continue; }
    const resp = [lm, lt].filter(Boolean).map(l => l.nome || l.login).filter((v, i, arr) => arr.indexOf(v) === i).join(', ');
    const bloco = (l, t) => l && l.atual != null ? cel(l.min) + cel(l.max) + cel(l.atual) : quick(iso, t);
    const just = [lm, lt].filter(l => l?.justificativa).map(l => `${TEMP_TURNOS[l.turno]}: ${l.justificativa}`).join(' | ');
    linhas.push(`<tr><td>${iso.slice(8)}/${iso.slice(5, 7)}${just ? ` <i class="fas fa-comment-dots temp-ic-amb" title="${_tEsc(just)}"></i>` : ''}</td><td>${_tEsc(resp || '—')}</td>${bloco(lm, 'manha')}${bloco(lt, 'tarde')}
      <td class="temp-act">${podeLancar && (lm || lt) ? `<i class="fas fa-pen" title="Editar" onclick="tempAbrirRegistro('${iso}','${lm ? 'manha' : 'tarde'}','${e.id}',true)"></i><i class="fas fa-trash" title="Excluir" onclick="tempExcluirLeitura('${e.id}','${iso}')"></i>` : ''}</td></tr>`);
  }
  const vinc = _tVinculo(e);
  const M = `<i class="fas fa-cloud-sun temp-ic-cy"></i>`, T = `<i class="fas fa-sun temp-ic-amb"></i>`;
  return `<div class="temp-info"><div><small>Equipamento</small><b>${_tEsc(e.codigo)}</b></div><div><small>Tipo</small><b>${_tEsc(e.tipo || '—')}</b></div>
      <div><small>Legenda</small><b>${_tEsc(e.legenda || '—')}</b></div><div><small>Faixa</small><b>${_tFmt(e.min)} a ${_tFmt(e.max)} ºC</b></div>
      <div><small>Vínculo</small><b>${vinc ? _tEsc(vinc.longo) : '—'}</b></div></div>
    <div class="temp-tw"><table><thead><tr><th>Data</th><th>Responsável</th><th>${M} Mín</th><th>${M} Máx</th><th>${M} Atual</th><th>${T} Mín</th><th>${T} Máx</th><th>${T} Atual</th><th></th></tr></thead>
    <tbody>${linhas.join('') || '<tr><td colspan="9" class="miss">Sem dias neste período.</td></tr>'}</tbody></table></div>
    <div class="temp-chartw"><canvas id="temp-chart"></canvas></div>`;
}

async function _tDesenharGrafico() {
  const cv = document.getElementById('temp-chart'); const e = tempState.equipamentos[tempState.equipSel];
  if (!cv || !e) return;
  const vez = ++_tChartVez;
  try { await _tChartJs(); } catch { return; }
  if (vez !== _tChartVez || !document.body.contains(cv)) return;
  const a = tempState.ano, m = tempState.mes, ultimo = new Date(a, m + 1, 0).getDate();
  const dias = [], man = [], tar = [];
  const rotina = e.obrigatorio === false;   // caixas: só os dias com leitura, sem buracos no eixo
  for (let d = 1; d <= ultimo; d++) {
    const iso = _tIso(a, m, d);
    const vm = _tLeitura(e.id, iso, 'manha')?.atual ?? null, vt = _tLeitura(e.id, iso, 'tarde')?.atual ?? null;
    if (rotina ? (vm == null && vt == null) : !_tDiaUtil(a, m, d)) continue;
    dias.push(rotina ? `${_tP2(d)}/${_tP2(m + 1)}` : d); man.push(vm); tar.push(vt);
  }
  // o canvas é recriado a cada render: o gráfico anterior pode estar em canvas já removido
  try { _tChart?.destroy(); } catch (err) { /* canvas antigo já saiu da página */ }
  try { Chart.getChart(cv)?.destroy(); } catch (err) { /* idem */ }
  _tChart = new Chart(cv, {
    type: 'line',
    data: { labels: dias, datasets: [
      { label: 'Manhã', data: man, borderColor: '#00a8cc', backgroundColor: '#00a8cc', tension: .3, pointRadius: 3, spanGaps: rotina },
      { label: 'Tarde', data: tar, borderColor: '#f4a261', backgroundColor: '#f4a261', tension: .3, pointRadius: 3, spanGaps: rotina },
      { label: 'Máx', data: dias.map(() => e.max), borderColor: '#e63946', borderDash: [6, 4], pointRadius: 0, borderWidth: 1.5 },
      { label: 'Mín', data: dias.map(() => e.min), borderColor: '#2a9d8f', borderDash: [6, 4], pointRadius: 0, borderWidth: 1.5 },
    ] },
    options: { maintainAspectRatio: false, animation: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } } },
  });
}

// ── interações ──────────────────────────────────────────────────
function tempTogglePop(id, ev) {
  ev?.stopPropagation();
  document.querySelectorAll('#tab-temperatura .temp-pop').forEach(p => { if (p.id !== id) p.classList.remove('open'); });
  document.getElementById(id)?.classList.toggle('open');
}
document.addEventListener('click', ev => { if (!ev.target.closest('.temp-pop')) document.querySelectorAll('#tab-temperatura .temp-pop.open').forEach(p => p.classList.remove('open')); });
function tempFiltrarUnidades(q) { const el = document.getElementById('temp-lista-un'); if (el) el.innerHTML = _tListaUnidades(_tUnidadesComEquip(), q); }
function tempMudarUnidade(id) { tempState.unidadeId = id; tempState.equipSel = null; tempRender(); }
function tempMudarMes(i) { tempState.mes = i; tempRender(); }
function tempMudarAno(d, ev) { ev?.stopPropagation(); tempState.ano += d; tempRender(); setTimeout(() => document.getElementById('temp-pop-mes')?.classList.add('open'), 0); }
// ── lista de equipamentos: sub-abas Ativos / Caixas + busca ─────
// Caixa = equipamento sob rotina (obrigatorio === false), ex.: caixas de transporte.
function _tEhCaixa(e) { return e?.obrigatorio === false; }
function _tListaEquipHtml() {
  const st = tempState._statusHoje || (() => ({ cls: '', txt: '' }));
  const q = _tNormNome(tempState.eqBusca || '');
  const lista = _tEquipsDaUnidade(tempState.unidadeId).filter(e => _tEhCaixa(e) === (tempState.eqAba === 'caixas'))
    .filter(e => !q || _tNormNome([e.codigo, e.tipo, e.legenda, _tVinculo(e)?.longo].join(' ')).includes(q));
  if (!lista.length) return `<div class="temp-eq-vazio"><i class="fas ${q ? 'fa-magnifying-glass' : 'fa-box-open'}"></i>${q ? 'Nada encontrado para “' + _tEsc(tempState.eqBusca) + '”' : 'Nenhum equipamento nesta aba'}</div>`;
  return lista.map(e => { const s = st(e); return `<div class="temp-eq ${e.id === tempState.equipSel ? 'sel' : ''}" onclick="tempSelecionarEquip('${e.id}')">
    <div class="temp-eq-txt"><div class="n">${_tEsc(e.codigo)}${_tTagVinculo(e)}</div>
    <div class="s">${_tEsc(e.tipo)}${e.legenda ? ' · ' + _tEsc(e.legenda) : ''} · ${_tFmt(e.min)}~${_tFmt(e.max)} ºC</div></div><span class="temp-st ${s.cls}">${s.txt}</span></div>`; }).join('');
}
function tempEqAba(k) { tempState.eqAba = k; tempState.equipSel = null; tempRender(); }
function tempEqBuscar(v) {
  tempState.eqBusca = v;
  const el = document.getElementById('temp-eq-lista'); if (el) el.innerHTML = _tListaEquipHtml();
  const x = document.querySelector('.temp-busca-x'); if (x) x.hidden = !v;
}
function tempEqLimpar() { const i = document.getElementById('temp-eq-busca'); if (i) { i.value = ''; i.focus(); } tempEqBuscar(''); }

function tempSelecionarEquip(id) {
  tempState.equipSel = id;
  const lista = document.getElementById('temp-eq-lista'), top = lista ? lista.scrollTop : 0;
  tempRender();
  const nova = document.getElementById('temp-eq-lista'); if (nova) nova.scrollTop = top;
}

// ── modal de registro ──────────────────────────────────────────
function tempAbrirRegistro(iso, turno, equipId, edicao) {
  if (!_tCan('lancarLeituras')) { _tToast('Sem permissão para lançar leituras.', 'error'); return; }
  document.querySelectorAll('#tab-temperatura .temp-pop.open').forEach(p => p.classList.remove('open'));
  const ag = _tAgora();
  const data = iso || _tIso(ag.getFullYear(), ag.getMonth(), ag.getDate());
  _tempModal = { data, turno: turno || (ag.getHours() < TEMP_CORTE.manha ? 'manha' : 'tarde'), equipId: equipId || null, edicao: !!edicao };
  let ov = document.getElementById('temp-ov');
  if (!ov) { ov = document.createElement('div'); ov.id = 'temp-ov'; ov.className = 'temp-ov'; ov.onclick = (e) => { if (e.target === ov) tempFecharRegistro(); }; document.body.appendChild(ov); }
  const nome = currentSession?.nomeCompleto || _tLogin();
  ov.innerHTML = `<div class="temp-modal" role="dialog" aria-modal="true">
    <div class="temp-mh"><h3><i class="fas fa-plus temp-ic-cy"></i> Registrar leituras — ${_tEsc(_tNomeUnidade(tempState.unidadeId))}</h3><button class="temp-x" onclick="tempFecharRegistro()">&times;</button>
      <div class="temp-mh-row">
        <label>Data <input type="date" id="temp-m-data" value="${data}" max="${_tIso(ag.getFullYear(), ag.getMonth(), ag.getDate())}" onchange="tempModalMudou()"></label>
        <label>Turno <span class="temp-seg">${['manha', 'tarde'].map(t => `<button type="button" data-t="${t}" class="${t === _tempModal.turno ? 'on' : ''}" onclick="tempModalTurno('${t}')"><i class="fas ${TEMP_ICON_TURNO[t]}"></i> ${TEMP_TURNOS[t]}</button>`).join('')}</span></label>
        <label>Responsável <span class="temp-ro"><i class="fas fa-user-lock"></i> ${_tEsc(nome)}</span></label>
      </div></div>
    <div class="temp-mb"><table><thead><tr><th>Equipamento</th><th>Faixa</th><th>Mín</th><th>Máx</th><th>Atual</th></tr></thead><tbody id="temp-m-tb"></tbody></table></div>
    <div class="temp-mf"><span class="temp-msg" id="temp-m-msg">Tab/Enter avança. Vermelho = fora da faixa (exige justificativa).</span><div class="temp-sp"></div>
      <button class="temp-btn" onclick="tempFecharRegistro()">Cancelar</button><button class="temp-btn pri" id="temp-m-salvar" onclick="tempSalvarRegistro()"><i class="fas fa-check"></i>Salvar</button></div></div>`;
  ov.classList.add('open');
  tempModalMudou();
}
function tempFecharRegistro() { document.getElementById('temp-ov')?.classList.remove('open'); _tempModal = null; }
function tempModalTurno(t) { if (!_tempModal) return; _tempModal.turno = t; document.querySelectorAll('.temp-seg button').forEach(b => b.classList.toggle('on', b.dataset.t === t)); tempModalMudou(); }
function tempModalMudou() {
  if (!_tempModal) return;
  _tempModal.data = document.getElementById('temp-m-data').value || _tempModal.data;
  const { data, turno } = _tempModal;
  const ym = data.slice(0, 7);
  const lerMes = ym === _tYm(tempState.ano, tempState.mes) ? Promise.resolve(tempState.leituras) : dbGetT(`${TEMP_RAIZ}/leituras/${tempState.unidadeId}/${ym}`);
  Promise.resolve(lerMes).then(mes => {
    mes = mes || {};
    const eqs = _tEquipsDaUnidade(tempState.unidadeId).filter(e => !_tempModal.equipId || e.id === _tempModal.equipId);
    const [y, mo, d] = data.split('-').map(Number);
    const aviso = !_tDiaUtil(y, mo - 1, d) ? `<tr><td colspan="5" class="temp-aviso"><i class="fas fa-triangle-exclamation"></i> ${_tFeriado(data) ? 'Feriado: ' + _tEsc(_tFeriado(data).nome || '') : 'Domingo'} — leitura opcional.</td></tr>` : '';
    document.getElementById('temp-m-tb').innerHTML = aviso + (eqs.map(e => {
      const l = mes[_tChave(e.id, data, turno)];
      if (l && l.atual != null && !_tempModal.edicao) return `<tr><td><b>${_tEsc(e.codigo)}</b><div class="temp-fx">${_tEsc(e.tipo || '')}${e.legenda ? ' · ' + _tEsc(e.legenda) : ''}</div></td><td class="temp-fx">${_tFmt(e.min)} ~ ${_tFmt(e.max)} ºC</td>
        <td colspan="3" class="temp-done"><i class="fas fa-check"></i> já registrado (${_tEsc(l.nome || l.login || '')}${l.gravadoEm ? ', ' + new Date(l.gravadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}) — atual ${_tFmt(l.atual)} ºC
        <button class="temp-lnk" onclick="tempEditarLinha('${e.id}')"><i class="fas fa-pen"></i> editar</button></td></tr>`;
      return _tLinhaForm(e, l);
    }).join('') || '<tr><td colspan="5">Sem equipamentos.</td></tr>');
    document.querySelectorAll('#temp-m-tb input[type=number]').forEach(i => _tValidarInput(i));
    setTimeout(() => document.querySelector('#temp-m-tb input')?.focus(), 30);
  });
}
function tempEditarLinha(equipId) { _tempModal.equipId = equipId; _tempModal.edicao = true; tempModalMudou(); }
function _tLinhaForm(e, l) {
  const v = (x) => x == null ? '' : String(x).replace('.', ',');
  const fora = l?.atual != null && (l.atual < e.min || l.atual > e.max);
  return `<tr data-eq="${e.id}"><td><b>${_tEsc(e.codigo)}</b><div class="temp-fx">${_tEsc(e.tipo || '')}${e.legenda ? ' · ' + _tEsc(e.legenda) : ''}</div></td><td class="temp-fx">${_tFmt(e.min)} ~ ${_tFmt(e.max)} ºC</td>
    <td><input type="text" inputmode="decimal" data-f="min" value="${v(l?.min)}" oninput="tempValidar(this)"></td>
    <td><input type="text" inputmode="decimal" data-f="max" value="${v(l?.max)}" oninput="tempValidar(this)"></td>
    <td><input type="text" inputmode="decimal" data-f="atual" value="${v(l?.atual)}" oninput="tempValidar(this)">
      <div class="temp-just ${fora ? 'show' : ''}"><input type="text" data-f="just" maxlength="300" placeholder="Justificativa obrigatória" value="${_tEsc(l?.justificativa || '')}">
      ${typeof ocOpenForm === 'function' && !l?.ocorrenciaId ? '<label class="temp-oc"><input type="checkbox" data-f="oc"> Abrir ocorrência</label>' : ''}</div></td></tr>`;
}
function tempValidar(inp) {
  const tr = inp.closest('tr'); const e = tempState.equipamentos[tr?.dataset.eq]; if (!e) return;
  const g = (f) => _tNum(tr.querySelector(`[data-f=${f}]`).value);
  const mn = g('min'), mx = g('max'), at = g('atual');
  tr.querySelectorAll('[data-f=min],[data-f=max],[data-f=atual]').forEach(i => i.classList.remove('bad', 'good'));
  const marca = (f, ok) => { const i = tr.querySelector(`[data-f=${f}]`); if (i.value.trim()) i.classList.add(ok ? 'good' : 'bad'); };
  if (at != null) marca('atual', at >= e.min && at <= e.max);
  if (mn != null) marca('min', (at == null || mn <= at) && (mx == null || mn <= mx));
  if (mx != null) marca('max', (at == null || mx >= at) && (mn == null || mx >= mn));
  tr.querySelector('.temp-just')?.classList.toggle('show', at != null && (at < e.min || at > e.max));
}
function _tValidarInput(i) { if (i) tempValidar(i); }

async function tempSalvarRegistro() {
  if (!_tempModal) return;
  const { data, turno } = _tempModal;
  const uid = tempState.unidadeId, ym = data.slice(0, 7);
  const ag = _tAgora();
  if (data > _tIso(ag.getFullYear(), ag.getMonth(), ag.getDate())) { _tToast('Não é possível registrar data futura.', 'error'); return; }
  const up = {}, erros = [], ocorrer = [];
  const mes = ym === _tYm(tempState.ano, tempState.mes) ? tempState.leituras : (await dbGetT(`${TEMP_RAIZ}/leituras/${uid}/${ym}`)) || {};
  document.querySelectorAll('#temp-m-tb tr[data-eq]').forEach(tr => {
    const e = tempState.equipamentos[tr.dataset.eq]; if (!e) return;
    const g = (f) => tr.querySelector(`[data-f=${f}]`);
    const mn = _tNum(g('min').value), mx = _tNum(g('max').value), at = _tNum(g('atual').value);
    const just = (g('just')?.value || '').trim();
    if (mn == null && mx == null && at == null) return;     // linha em branco: ignora
    const nome = e.codigo;
    if (at == null) { erros.push(`${nome}: informe a temperatura atual`); return; }
    if ((mn != null && mn > at) || (mx != null && mx < at) || (mn != null && mx != null && mn > mx)) { erros.push(`${nome}: mínima ≤ atual ≤ máxima`); return; }
    const fora = at < e.min || at > e.max;
    if (fora && !just) { erros.push(`${nome}: fora da faixa, justifique`); return; }
    const chave = _tChave(e.id, data, turno), ant = mes[chave];
    const reg = { equipId: e.id, data, turno, min: mn, max: mx, atual: at, justificativa: fora ? just : null,
      ocorrenciaId: ant?.ocorrenciaId || null,
      login: ant?.login || _tLogin(), nome: ant?.nome || currentSession?.nomeCompleto || _tLogin(),
      gravadoEm: ant?.gravadoEm || dbServerTs() };
    if (ant) { reg.editadoEm = dbServerTs(); reg.editadoPor = _tLogin(); }
    up[`${TEMP_RAIZ}/leituras/${uid}/${ym}/${chave}`] = reg;
    if (fora && g('oc')?.checked) ocorrer.push({ e, at, just, caminho: `${TEMP_RAIZ}/leituras/${uid}/${ym}/${chave}` });
  });
  if (erros.length) { const m = document.getElementById('temp-m-msg'); m.innerHTML = `<span class="temp-ic-red"><i class="fas fa-circle-xmark"></i> ${_tEsc(erros.join(' · '))}</span>`; return; }
  if (!Object.keys(up).length) { _tToast('Nenhuma leitura preenchida.', 'info'); return; }
  const btn = document.getElementById('temp-m-salvar'); btn.disabled = true;
  const ok = await dbUpdateT(up);
  btn.disabled = false;
  if (!ok) { _tToast('Erro ao salvar leituras.', 'error'); return; }
  _tToast(`${Object.keys(up).length} leitura(s) salva(s).`, 'success');
  tempFecharRegistro();
  if (ocorrer.length) {
    const o = ocorrer[0];
    tempState._ocPendente = o.caminho;
    ocOpenForm(null, { ativoId: o.e.ativoId || undefined, tipo: 'falha',
      titulo: `Temperatura fora da faixa — ${o.e.codigo}`,
      descricao: `${TEMP_TURNOS[turno]} de ${_tBR(data)}: ${_tFmt(o.at)} ºC (faixa ${_tFmt(o.e.min)} a ${_tFmt(o.e.max)} ºC).\nJustificativa: ${o.just}`,
      origem: { tipo: 'temperatura', caminho: o.caminho } });
    if (ocorrer.length > 1) _tToast(`Outras ${ocorrer.length - 1} ocorrência(s) marcadas: abra pela linha depois.`, 'info');
  }
}

async function tempExcluirLeitura(equipId, iso) {
  const e = tempState.equipamentos[equipId]; if (!e) return;
  const ok = typeof uiConfirmar === 'function'
    ? await uiConfirmar({ tipo: 'perigo', titulo: 'Excluir leituras?', mensagem: `${e.codigo} — ${_tBR(iso)} (manhã e tarde).`, confirmar: 'Excluir' })
    : false;
  if (!ok) return;
  const base = `${TEMP_RAIZ}/leituras/${tempState.unidadeId}/${iso.slice(0, 7)}`;
  const r = await dbUpdateT({ [`${base}/${_tChave(equipId, iso, 'manha')}`]: null, [`${base}/${_tChave(equipId, iso, 'tarde')}`]: null });
  _tToast(r ? 'Leituras excluídas.' : 'Erro ao excluir.', r ? 'success' : 'error');
}

// ── backup por planilha ────────────────────────────────────────
const TEMP_COLS = ['unidade', 'equipamento', 'ativo', 'data', 'turno', 'min', 'max', 'atual', 'responsavel', 'justificativa'];
// escolha do período antes de exportar: mês selecionado ou ano inteiro
function tempEscolherPeriodo(modo) {
  document.querySelectorAll('#tab-temperatura .temp-pop.open').forEach(p => p.classList.remove('open'));
  let ov = document.getElementById('temp-ov');
  if (!ov) { ov = document.createElement('div'); ov.id = 'temp-ov'; ov.className = 'temp-ov'; document.body.appendChild(ov); }
  ov.onclick = (e) => { if (e.target === ov) ov.classList.remove('open'); };
  const alvo = modo === 'todas' ? 'Unidades visíveis' : _tNomeUnidade(tempState.unidadeId);
  ov.innerHTML = `<div class="temp-modal temp-per">
    <div class="temp-eqm-h"><span class="temp-eqm-ic"><i class="fas fa-file-export"></i></span>
      <div><h3>Exportar leituras</h3><small>${_tEsc(alvo)}</small></div><button class="temp-x" onclick="document.getElementById('temp-ov').classList.remove('open')">&times;</button></div>
    <div class="temp-per-op">
      <button onclick="tempExportar('${modo}','mes')"><i class="fas fa-calendar-day"></i><b>Mês</b><small>${TEMP_MESES[tempState.mes]} / ${tempState.ano}</small></button>
      <button onclick="tempExportar('${modo}','ano')"><i class="fas fa-calendar"></i><b>Ano</b><small>Janeiro a dezembro de ${tempState.ano}</small></button>
    </div></div>`;
  ov.classList.add('open');
}
async function tempExportar(modo, periodo = 'mes') {
  document.getElementById('temp-ov')?.classList.remove('open');
  if (!_tCan('exportarLeituras')) { _tToast('Sem permissão para exportar leituras.', 'error'); return; }
  document.querySelectorAll('#tab-temperatura .temp-pop.open').forEach(p => p.classList.remove('open'));
  try { await _tXlsx(); } catch (e) { _tToast(e.message, 'error'); return; }
  const wb = XLSX.utils.book_new();
  const unids = modo === 'todas' ? _tUnidadesVisiveis() : _tUnidadesVisiveis().filter(u => u.id === tempState.unidadeId);
  const L = [], E = [];
  const ymSel = `${tempState.ano}-${String(tempState.mes + 1).padStart(2, '0')}`;
  const noPeriodo = (ym) => periodo === 'ano' ? ym.startsWith(tempState.ano + '-') : ym === ymSel;
  {
    _tToast('Gerando planilha…', 'info');
    for (const u of unids) {
      const tudo = (await dbGetT(`${TEMP_RAIZ}/leituras/${u.id}`)) || {};
      Object.entries(tudo).filter(([ym]) => noPeriodo(ym)).forEach(([, mes]) => Object.values(mes || {}).forEach(l => {
        const e = tempState.equipamentos[l.equipId];
        L.push([u.nome, e?.codigo || l.equipId, e?.ativoId ? (_tAtivo(e.ativoId)?.codigo || '') : '', l.data, l.turno, l.min, l.max, l.atual, l.nome || l.login || '', l.justificativa || '']);
      }));
      Object.values(tempState.equipamentos).filter(e => e.unidadeId === u.id).forEach(e =>
        E.push([u.nome, e.codigo, e.ativoId ? (_tAtivo(e.ativoId)?.codigo || '') : '', e.tipo || '', e.legenda || '', e.min, e.max, e.ativo === false ? 'arquivado' : 'ativo']));
    }
    L.sort((a, b) => String(a[0]).localeCompare(b[0]) || String(a[3]).localeCompare(b[3]) || String(a[1]).localeCompare(b[1]) || String(a[4]).localeCompare(b[4]));
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([TEMP_COLS, ...L]), 'Leituras');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['unidade', 'equipamento', 'ativo', 'tipo', 'legenda', 'min', 'max', 'status'], ...E]), 'Equipamentos');
  const fer = tempState.feriados || {};
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['data', 'descricao', 'repete'],
    ...Object.entries(fer.fixos || {}).map(([k, v]) => [k, v?.nome || '', 'todo ano']),
    ...Object.entries(fer.datas || {}).map(([k, v]) => [k, v?.nome || '', 'só no ano'])]), 'Feriados');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Campo', 'Regra'], ['unidade', 'nome da unidade como aparece no filtro'], ['equipamento', 'código cadastrado na unidade'],
    ['data', 'AAAA-MM-DD'], ['turno', 'manha ou tarde'], ['min / max / atual', 'número (ponto ou vírgula); atual obrigatório; mín ≤ atual ≤ máx'],
    ['justificativa', 'obrigatória se atual fora da faixa do equipamento'], ['chave', 'unidade + equipamento + data + turno (conflito = já existe)'],
    ['Feriados', 'só informativo: feriados são editados no portal (Administração › Feriados)']]), 'Instruções');
  const nome = `temperatura-${modo === 'todas' ? 'unidades' : (unids[0]?.sigla || 'unidade')}-${periodo === 'ano' ? tempState.ano : ymSel}.xlsx`;
  XLSX.writeFile(wb, nome);
}

let _tImport = null;
async function tempImportar(inp) {
  const f = inp.files?.[0]; inp.value = ''; if (!f) return;
  if (!_tCan('importarLeituras')) { _tToast('Sem permissão para importar leituras.', 'error'); return; }
  try { await _tXlsx(); } catch (e) { _tToast(e.message, 'error'); return; }
  const buf = await f.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: false });
  const ws = wb.Sheets['Leituras'] || wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
  const vis = _tUnidadesVisiveis();
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  const cache = {};
  const linhas = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const u = vis.find(x => norm(x.nome) === norm(r.unidade) || norm(x.sigla) === norm(r.unidade));
    const e = u && Object.values(tempState.equipamentos).find(x => x.unidadeId === u.id && norm(x.codigo) === norm(r.equipamento));
    let data = String(r.data || '').trim();
    const br = data.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if (br) data = `${br[3]}-${br[2]}-${br[1]}`;
    const turno = norm(r.turno).replace('manhã', 'manha');
    const mn = _tNum(r.min), mx = _tNum(r.max), at = _tNum(r.atual), just = String(r.justificativa || '').trim();
    let st = 'nova', msg = 'Nova';
    if (!u) { st = 'erro'; msg = 'Unidade não encontrada ou sem acesso'; }
    else if (!e) { st = 'erro'; msg = 'Equipamento não encontrado na unidade'; }
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) { st = 'erro'; msg = 'Data inválida'; }
    else if (!['manha', 'tarde'].includes(turno)) { st = 'erro'; msg = 'Turno inválido'; }
    else if (at == null) { st = 'erro'; msg = 'Atual vazio'; }
    else if ((mn != null && mn > at) || (mx != null && mx < at)) { st = 'erro'; msg = 'Mín/Máx incoerente'; }
    else if ((at < e.min || at > e.max) && !just) { st = 'erro'; msg = 'Fora da faixa sem justificativa'; }
    else {
      const k = `${u.id}/${data.slice(0, 7)}`;
      if (!(k in cache)) cache[k] = (await dbGetT(`${TEMP_RAIZ}/leituras/${k}`)) || {};
      if (cache[k][_tChave(e.id, data, turno)]) { st = 'conf'; msg = 'Já existe (conflito)'; }
    }
    linhas.push({ n: i + 2, r, u, e, data, turno, mn, mx, at, just, st, msg });
  }
  _tImport = { linhas, sobrescrever: false, arquivo: f.name };
  _tDesenharImport();
}
function _tDesenharImport() {
  const { linhas, sobrescrever, arquivo } = _tImport;
  const c = (s) => linhas.filter(l => l.st === s).length;
  let ov = document.getElementById('temp-ov');
  if (!ov) { ov = document.createElement('div'); ov.id = 'temp-ov'; ov.className = 'temp-ov'; document.body.appendChild(ov); }
  ov.onclick = (e) => { if (e.target === ov) ov.classList.remove('open'); };
  const cls = { nova: 'ok', conf: 'meio', erro: 'pend' };
  ov.innerHTML = `<div class="temp-modal"><div class="temp-mh"><h3><i class="fas fa-file-import temp-ic-cy"></i> Importar planilha — prévia</h3><button class="temp-x" onclick="document.getElementById('temp-ov').classList.remove('open')">&times;</button>
    <div class="temp-mh-row"><span><i class="fas fa-file-excel"></i> ${_tEsc(arquivo)}</span><span class="temp-ic-grn"><i class="fas fa-circle-check"></i> ${c('nova')} novas</span>
      <span class="temp-ic-amb"><i class="fas fa-code-merge"></i> ${c('conf')} conflitos</span><span class="temp-ic-red"><i class="fas fa-circle-xmark"></i> ${c('erro')} com erro</span></div>
    <div class="temp-mh-row"><label>Conflito <span class="temp-seg"><button type="button" class="${sobrescrever ? '' : 'on'}" onclick="_tImport.sobrescrever=false;_tDesenharImport()">Manter atual</button><button type="button" class="${sobrescrever ? 'on' : ''}" onclick="_tImport.sobrescrever=true;_tDesenharImport()">Sobrescrever</button></span></label></div></div>
    <div class="temp-mb"><table><thead><tr><th>Linha</th><th>Unidade</th><th>Equip.</th><th>Data</th><th>Turno</th><th>Mín</th><th>Máx</th><th>Atual</th><th>Status</th></tr></thead><tbody>
    ${linhas.map(l => `<tr><td>${l.n}</td><td>${_tEsc(l.r.unidade)}</td><td>${_tEsc(l.r.equipamento)}</td><td>${_tEsc(l.data)}</td><td>${_tEsc(l.r.turno)}</td><td>${_tFmt(l.mn)}</td><td>${_tFmt(l.mx)}</td><td>${_tFmt(l.at)}</td><td><span class="temp-st ${cls[l.st]}">${_tEsc(l.msg)}</span></td></tr>`).join('') || '<tr><td colspan="9">Planilha vazia ou sem aba Leituras.</td></tr>'}
    </tbody></table></div>
    <div class="temp-mf"><span class="temp-msg">Linhas com erro são ignoradas. Nada grava até confirmar.</span><div class="temp-sp"></div>
      <button class="temp-btn" onclick="document.getElementById('temp-ov').classList.remove('open')">Cancelar</button>
      <button class="temp-btn pri" onclick="tempConfirmarImport()"><i class="fas fa-check"></i>Importar ${c('nova') + (sobrescrever ? c('conf') : 0)} linha(s)</button></div></div>`;
  ov.classList.add('open');
}
async function tempConfirmarImport() {
  if (!_tCan('importarLeituras')) { _tToast('Sem permissão para importar leituras.', 'error'); return; }
  const { linhas, sobrescrever } = _tImport;
  const up = {};
  linhas.filter(l => l.st === 'nova' || (sobrescrever && l.st === 'conf')).forEach(l => {
    const fora = l.at < l.e.min || l.at > l.e.max;
    up[`${TEMP_RAIZ}/leituras/${l.u.id}/${l.data.slice(0, 7)}/${_tChave(l.e.id, l.data, l.turno)}`] = {
      equipId: l.e.id, data: l.data, turno: l.turno, min: l.mn, max: l.mx, atual: l.at, justificativa: fora ? l.just : null,
      login: _tLogin(), nome: String(l.r.responsavel || '').trim() || currentSession?.nomeCompleto || '',
      gravadoEm: dbServerTs(), importado: true,
      // sobrescrever exige editadoPor = quem grava (regra do banco)
      ...(l.st === 'conf' ? { editadoPor: _tLogin(), editadoEm: dbServerTs() } : {}) };
  });
  if (!Object.keys(up).length) { _tToast('Nada para importar.', 'info'); return; }
  const ok = await dbUpdateT(up);
  _tToast(ok ? `${Object.keys(up).length} leitura(s) importada(s).` : 'Erro ao importar.', ok ? 'success' : 'error');
  if (ok) document.getElementById('temp-ov')?.classList.remove('open');
}

// ── configurações (equipamentos e liberação entre unidades) ─────
let _tCfgEdit = null;
function tempRenderConfig() {
  tempIniciar();
  const el = document.getElementById('cpanel-temperatura-body'); if (!el) return;
  if (!_tCan('configurarTemperatura')) { el.innerHTML = '<p class="temp-fx">Sem permissão.</p>'; return; }
  const unids = _tTodasUnidades();
  const eqs = Object.values(tempState.equipamentos).sort((a, b) => _tNomeUnidade(a.unidadeId).localeCompare(_tNomeUnidade(b.unidadeId)) || String(a.codigo).localeCompare(String(b.codigo), 'pt-BR', { numeric: true }));
  el.innerHTML = (window.tempBackup ? tempBackup.cardHtml() : '') + `
  <div class="temp-cfg-card"><h4><i class="fas fa-list"></i> Equipamentos <small>${eqs.length}</small><span class="temp-sp"></span><button class="temp-btn pri" onclick="tempAbrirEquip()"><i class="fas fa-plus"></i>Novo equipamento</button></h4>
    <div class="temp-tw"><table><thead><tr><th>Unidade</th><th>Código</th><th>Tipo</th><th>Legenda</th><th>Faixa</th><th>Vínculo</th><th>Status</th><th></th></tr></thead><tbody>
    ${eqs.map(e => { return `<tr class="${e.ativo === false ? 'temp-arq' : ''}"><td>${_tEsc(_tNomeUnidade(e.unidadeId))}</td><td><b>${_tEsc(e.codigo)}</b></td><td>${_tEsc(e.tipo || '')}</td><td>${_tEsc(e.legenda || '')}</td>
      <td>${_tFmt(e.min)} ~ ${_tFmt(e.max)}</td><td>${_tTagVinculo(e)}</td><td><span class="temp-pill ${e.ativo === false ? 'off' : 'ok'}">${e.ativo === false ? 'Arquivado' : 'Ativo'}</span>${e.obrigatorio === false ? ' <span class="temp-pill tr"><i class="fas fa-truck"></i> Transporte</span>' : ''}</td>
      <td class="temp-act"><i class="fas fa-pen" title="Editar" onclick="tempAbrirEquip('${e.id}')"></i><i class="fas ${e.ativo === false ? 'fa-box-open' : 'fa-box-archive'}" title="${e.ativo === false ? 'Reativar' : 'Arquivar'}" onclick="tempArquivarEquip('${e.id}')"></i></td></tr>`; }).join('') || '<tr><td colspan="8" class="miss">Nenhum equipamento.</td></tr>'}
    </tbody></table></div></div>
  <div class="temp-cfg-card"><h4><i class="fas fa-eye"></i> Quem vê cada unidade <span class="temp-sp"></span><button class="temp-btn" onclick="tempGravarAcessos()"><i class="fas fa-rotate"></i>Recalcular acessos</button></h4>
    <p class="temp-fx">Vem dos <b>setores visíveis</b> do grupo (Configurações › Grupos › Unidades e setores): unidade com algum setor visível = vê a Temperatura dela. Grupo sem setor marcado = só a unidade do cadastro no RH. Administrador do portal vê todas. Atualiza sozinho ao salvar grupos e usuários.</p>
    <div class="temp-tw"><table><thead><tr><th>Usuário</th><th>Grupo</th><th>Unidades (além da do RH)</th><th>Mnemônicos</th></tr></thead><tbody>
    ${_tListaAcessos().map(a => `<tr><td><b>${_tEsc(a.nome)}</b> <span class="temp-fx">${_tEsc(a.login)}</span></td><td>${_tEsc(a.grupo)}</td><td class="temp-libs">${a.unidades.length ? a.unidades.map(id => `<span class="temp-tag">${_tEsc(_tNomeUnidade(id))}</span>`).join('') : '<span class="temp-fx">só a do RH</span>'}${a.desatualizado ? ' <span class="temp-tag amb">recalcular</span>' : ''}</td><td>${a.equips == null ? '<span class="temp-fx">todos</span>' : a.equips}</td></tr>`).join('') || '<tr><td colspan="4" class="miss">Nenhum usuário vinculado ao portal.</td></tr>'}
    </tbody></table></div></div>`;
}
function tempAbrirEquip(id) {
  if (!_tCan('configurarTemperatura')) return;
  _tCfgEdit = id && tempState.equipamentos[id] ? id : null;
  const unids = _tTodasUnidades();
  const ed = _tCfgEdit ? tempState.equipamentos[_tCfgEdit] : {};
  const unForm = ed.unidadeId || tempState.unidadeId || unids[0]?.id || '';
  let ov = document.getElementById('temp-ov');
  if (!ov) { ov = document.createElement('div'); ov.id = 'temp-ov'; ov.className = 'temp-ov'; document.body.appendChild(ov); }
  ov.onclick = (e) => { if (e.target === ov) tempFecharEquip(); };
  ov.innerHTML = `<div class="temp-modal temp-eqm">
    <div class="temp-eqm-h"><span class="temp-eqm-ic"><i class="fas ${_tCfgEdit ? 'fa-pen' : 'fa-temperature-half'}"></i></span>
      <div><h3>${_tCfgEdit ? 'Editar equipamento' : 'Novo equipamento'}</h3><small>${_tCfgEdit ? _tEsc(ed.codigo + ' · ' + _tNomeUnidade(ed.unidadeId)) : 'Cadastre um ponto de controle de temperatura'}</small></div>
      <button class="temp-x" onclick="tempFecharEquip()">&times;</button></div>
    <div class="temp-mb temp-cfg-form2">
      <div class="temp-cfg-sec"><span class="temp-cfg-st"><i class="fas fa-tag"></i> Identificação</span>
        <div class="temp-cfg-row">
          <label>Unidade<select id="temp-c-un">${unids.map(u => `<option value="${u.id}" ${u.id === unForm ? 'selected' : ''}>${_tEsc(u.nome || u.sigla)}</option>`).join('')}</select></label>
          <label>Código<input id="temp-c-cod" maxlength="30" value="${_tEsc(ed.codigo || '')}" placeholder="GEL-01"></label>
          <label>Tipo<input id="temp-c-tipo" maxlength="40" value="${_tEsc(ed.tipo || '')}" placeholder="Geladeira" list="temp-tipos"></label>
          <datalist id="temp-tipos">${['Geladeira', 'Freezer', 'Congelador', 'Ambiente', 'Estufa', 'Banho-maria', 'Caixa de transporte'].map(t => `<option value="${t}">`).join('')}</datalist>
          <label class="temp-cfg-grow">Legenda<input id="temp-c-leg" maxlength="80" value="${_tEsc(ed.legenda || '')}" placeholder="Vacinas sala 2"></label>
        </div></div>
      <div class="temp-cfg-sec"><span class="temp-cfg-st"><i class="fas fa-temperature-half"></i> Faixa aceitável</span>
        <div class="temp-cfg-row">
          <label class="temp-cfg-num"><span><i class="fas fa-arrow-down temp-ic-cy"></i> Mín</span><div class="temp-in-un"><input id="temp-c-min" inputmode="decimal" value="${ed.min ?? ''}" placeholder="2,0"><em>ºC</em></div></label>
          <label class="temp-cfg-num"><span><i class="fas fa-arrow-up temp-ic-red"></i> Máx</span><div class="temp-in-un"><input id="temp-c-max" inputmode="decimal" value="${ed.max ?? ''}" placeholder="8,0"><em>ºC</em></div></label>
          <label class="temp-sw-card" title="Caixa de transporte: preenchida sob rotina, sem pendência nem aviso">
            <input type="checkbox" id="temp-c-transp" ${ed.obrigatorio === false ? 'checked' : ''}><span class="temp-sw"></span>
            <span class="temp-sw-tx"><b><i class="fas fa-truck"></i> Transporte</b><small>Sob rotina — sem pendência nem aviso</small></span></label>
        </div></div>
      <div class="temp-cfg-sec"><span class="temp-cfg-st"><i class="fas fa-link"></i> Vínculo</span>
        <div class="temp-cfg-row">
          <input type="hidden" id="temp-c-ativo" value="${ed.ativoId ? 'a:' + _tEsc(ed.ativoId) : ed.ambienteId ? 'm:' + _tEsc(ed.ambienteId) : ''}">
          <button type="button" class="temp-vinc-btn" id="temp-c-vinc" onclick="tempAbrirVinculo(this)">${_tVincBtnHtml(ed.ativoId ? 'a:' + ed.ativoId : ed.ambienteId ? 'm:' + ed.ambienteId : '')}</button>
</div>
        </div>
    </div>
    <div class="temp-mf"><span class="temp-msg"><i class="fas fa-circle-info"></i> Faixa usada para destacar leituras fora do limite.</span><div class="temp-sp"></div>
      <button class="temp-btn" onclick="tempFecharEquip()">Cancelar</button>
      <button class="temp-btn pri temp-btn-lg" onclick="tempSalvarEquip()"><i class="fas fa-check"></i>${_tCfgEdit ? 'Salvar alterações' : 'Adicionar equipamento'}</button></div></div>`;
  ov.classList.add('open');
  setTimeout(() => document.getElementById(_tCfgEdit ? 'temp-c-leg' : 'temp-c-cod')?.focus(), 30);
}
function tempFecharEquip() { document.getElementById('temp-vinc-pop')?.remove(); document.getElementById('temp-ov')?.classList.remove('open'); _tCfgEdit = null; }
// ── popover de vínculo (ativo ou sala) com busca e filtros ──
function _tVincOpcoes() {
  const out = [];
  const ats = (typeof state !== 'undefined' ? state.ativos : []) || [];
  ats.filter(a => a && a.id).forEach(a => {
    const st = typeof _orgSetorDoAtivo === 'function' ? _orgSetorDoAtivo(a) : null;
    out.push({ v: 'a:' + a.id, tipo: 'ativo', nome: a.nome || '', cod: a.codigo || '', cat: a.categoria || '', setorId: st?.id || '', setor: st?.nome || a.setor || '', un: st?.unidadeId || '' });
  });
  const og = typeof orgState !== 'undefined' ? orgState : {};
  Object.values(og.ambientes || {}).filter(a => a && a.ativo !== false).forEach(a => {
    const st = a.setorId && og.setores?.[a.setorId];
    out.push({ v: 'm:' + a.id, tipo: 'ambiente', nome: a.nome || '', cod: '', cat: 'Sala / ambiente', setorId: st?.id || '', setor: st?.nome || '', un: a.unidadeId || st?.unidadeId || '' });
  });
  return out;
}
function _tVincBtnHtml(v) {
  const o = v && _tVincOpcoes().find(x => x.v === v);
  if (!o) return '<span class="temp-vinc-ic none"><i class="fas fa-link-slash"></i></span><span class="temp-vinc-tx"><b>Sem vínculo</b><small>Clique para escolher um ativo ou sala</small></span><i class="fas fa-chevron-down temp-vinc-car"></i>';
  return `<span class="temp-vinc-ic ${o.tipo}"><i class="fas ${o.tipo === 'ativo' ? 'fa-box' : 'fa-door-open'}"></i></span><span class="temp-vinc-tx"><b>${_tEsc((o.cod ? o.cod + ' · ' : '') + o.nome)}</b><small>${_tEsc([o.tipo === 'ativo' ? 'Ativo' : 'Sala', o.tipo === 'ativo' ? o.cat : '', o.setor].filter(Boolean).join(' · '))}</small></span><i class="fas fa-chevron-down temp-vinc-car"></i>`;
}
function tempAbrirVinculo(btn) {
  if (document.getElementById('temp-vinc-pop')) { document.getElementById('temp-vinc-pop').remove(); return; }
  const opcs = _tVincOpcoes();
  const unOrg = _tOrgDaUnidadeRh(document.getElementById('temp-c-un').value) || '';
  const f = { q: '', tipo: '', un: unOrg, setor: '', cat: '' };
  const pop = document.createElement('div'); pop.id = 'temp-vinc-pop'; pop.className = 'temp-vinc-pop';
  const uns = Object.values((typeof orgState !== 'undefined' && orgState.unidades) || {}).filter(u => u && u.ativo !== false).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR', { numeric: true }));
  const cats = [...new Set(opcs.map(o => o.cat).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  pop.innerHTML = `<div class="temp-vp-h"><label class="temp-busca"><i class="fas fa-magnifying-glass"></i><input type="search" id="temp-vp-q" placeholder="Buscar por nome, código, setor…" autocomplete="off"></label>
    <div class="temp-vp-chips" id="temp-vp-tipo"><button type="button" data-t="" class="on"><i class="fas fa-layer-group"></i> Todos</button><button type="button" data-t="ativo"><i class="fas fa-box"></i> Ativos</button><button type="button" data-t="ambiente"><i class="fas fa-door-open"></i> Salas</button></div>
    <div class="temp-vp-fs">
      <label title="Unidade"><i class="fas fa-building"></i><select id="temp-vp-un"><option value="">Todas as unidades</option>${uns.map(u => `<option value="${_tEsc(u.id)}" ${u.id === unOrg ? 'selected' : ''}>${_tEsc(u.nome)}</option>`).join('')}</select></label>
      <label title="Setor"><i class="fas fa-sitemap"></i><select id="temp-vp-setor"></select></label>
      <label title="Categoria"><i class="fas fa-shapes"></i><select id="temp-vp-cat"><option value="">Todas as categorias</option>${cats.map(c => `<option>${_tEsc(c)}</option>`).join('')}</select></label>
    </div></div>
    <div class="temp-vp-l" id="temp-vp-l"></div>
    <div class="temp-vp-f"><span class="temp-fx" id="temp-vp-n"></span><div class="temp-sp"></div><button type="button" class="temp-btn" data-v=""><i class="fas fa-link-slash"></i>Sem vínculo</button></div>`;
  document.body.appendChild(pop);
  const r = btn.getBoundingClientRect(), w = Math.min(580, window.innerWidth - 16);
  pop.style.width = w + 'px';
  pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
  if (window.innerHeight - r.bottom > 400 || r.top < 400) pop.style.top = (r.bottom + 6) + 'px';
  else pop.style.bottom = (window.innerHeight - r.top + 6) + 'px';
  const atual = document.getElementById('temp-c-ativo').value;
  const desenhar = () => {
    const nq = _tNormNome(f.q);
    const base = opcs.filter(o => (!f.tipo || o.tipo === f.tipo) && (!f.un || o.un === f.un));
    const setores = [...new Map(base.filter(o => o.setor).map(o => [o.setorId || o.setor, o.setor])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
    if (f.setor && !setores.some(([k]) => k === f.setor)) f.setor = '';
    pop.querySelector('#temp-vp-setor').innerHTML = '<option value="">Todos os setores</option>' + setores.map(([k, n]) => `<option value="${_tEsc(k)}" ${k === f.setor ? 'selected' : ''}>${_tEsc(n)}</option>`).join('');
    const vis = base.filter(o => (!f.setor || (o.setorId || o.setor) === f.setor) && (!f.cat || o.cat === f.cat) && (!nq || _tNormNome([o.nome, o.cod, o.setor, o.cat].join(' ')).includes(nq)))
      .sort((a, b) => a.tipo.localeCompare(b.tipo) || String(a.cod || a.nome).localeCompare(String(b.cod || b.nome), 'pt-BR', { numeric: true }));
    pop.querySelector('#temp-vp-l').innerHTML = vis.slice(0, 300).map(o => `<button type="button" class="temp-vp-it ${o.v === atual ? 'on' : ''}" data-v="${_tEsc(o.v)}"><span class="temp-vinc-ic ${o.tipo}"><i class="fas ${o.tipo === 'ativo' ? 'fa-box' : 'fa-door-open'}"></i></span>
      <span class="temp-vinc-tx"><b>${o.cod ? `<code>${_tEsc(o.cod)}</code> ` : ''}${_tEsc(o.nome)}</b><small>${_tEsc([o.setor, o.cat].filter(Boolean).join(' · ') || '—')}</small></span>${o.v === atual ? '<i class="fas fa-circle-check temp-ic-cy"></i>' : ''}</button>`).join('')
      || '<div class="temp-eq-vazio"><i class="fas fa-magnifying-glass"></i>Nada encontrado com esses filtros</div>';
    pop.querySelector('#temp-vp-n').textContent = vis.length > 300 ? `300 de ${vis.length} — refine a busca` : `${vis.length} resultado(s)`;
  };
  pop.querySelector('#temp-vp-q').oninput = (e) => { f.q = e.target.value; desenhar(); };
  pop.querySelector('#temp-vp-tipo').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; f.tipo = b.dataset.t; pop.querySelectorAll('#temp-vp-tipo button').forEach(x => x.classList.toggle('on', x === b)); desenhar(); };
  pop.querySelector('#temp-vp-un').onchange = (e) => { f.un = e.target.value; desenhar(); };
  pop.querySelector('#temp-vp-setor').onchange = (e) => { f.setor = e.target.value; desenhar(); };
  pop.querySelector('#temp-vp-cat').onchange = (e) => { f.cat = e.target.value; desenhar(); };
  const fora = (e) => { if (!pop.contains(e.target) && !btn.contains(e.target)) fechar(); };
  const esc = (e) => { if (e.key === 'Escape') fechar(); };
  function fechar() { pop.remove(); document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); window.removeEventListener('scroll', fechar, true); }
  pop.addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    document.getElementById('temp-c-ativo').value = b.dataset.v;
    btn.innerHTML = _tVincBtnHtml(b.dataset.v);
    fechar();
  });
  setTimeout(() => { document.addEventListener('mousedown', fora); document.addEventListener('keydown', esc); }, 0);
  pop.querySelector('#temp-vp-l').addEventListener('scroll', (e) => e.stopPropagation(), true);
  desenhar();
  pop.querySelector('#temp-vp-q').focus();
}
async function tempSalvarEquip() {
  const g = (id) => document.getElementById(id).value.trim();
  const unidadeId = g('temp-c-un'), codigo = g('temp-c-cod').toUpperCase(), min = _tNum(g('temp-c-min')), max = _tNum(g('temp-c-max'));
  if (!unidadeId || !codigo) { _tToast('Informe unidade e código.', 'error'); return; }
  if (min == null || max == null || min >= max) { _tToast('Faixa inválida: mín deve ser menor que máx.', 'error'); return; }
  const id = _tCfgEdit || ('tq_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5));
  if (Object.values(tempState.equipamentos).some(e => e.id !== id && e.unidadeId === unidadeId && String(e.codigo).toUpperCase() === codigo)) { _tToast('Já existe esse código na unidade.', 'error'); return; }
  const ant = tempState.equipamentos[id] || {};
  const reg = { id, unidadeId, codigo, tipo: g('temp-c-tipo'), legenda: g('temp-c-leg'), min, max, obrigatorio: !document.getElementById('temp-c-transp').checked,
    ativoId: g('temp-c-ativo').startsWith('a:') ? g('temp-c-ativo').slice(2) : null,
    ambienteId: g('temp-c-ativo').startsWith('m:') ? g('temp-c-ativo').slice(2) : null,
    ativo: ant.ativo !== false, criadoEm: ant.criadoEm || dbServerTs(), atualizadoEm: dbServerTs(), atualizadoPor: _tLogin() };
  const ok = await dbUpdateT({ [`${TEMP_RAIZ}/equipamentos/${id}`]: reg });
  _tToast(ok ? 'Equipamento salvo.' : 'Erro ao salvar.', ok ? 'success' : 'error');
  if (ok) { tempFecharEquip(); tempRenderConfig(); }
}
async function tempArquivarEquip(id) {
  const e = tempState.equipamentos[id]; if (!e) return;
  const ok = await dbUpdateT({ [`${TEMP_RAIZ}/equipamentos/${id}/ativo`]: e.ativo === false });
  _tToast(ok ? (e.ativo === false ? 'Equipamento reativado.' : 'Equipamento arquivado (leituras mantidas).') : 'Erro.', ok ? 'success' : 'error');
}
// ── índice de acesso (setores visíveis → unidades do RH) ───────
// Mesmo critério de authGetVisibleSetores(), aplicado a cada usuário do Manutenção ligado a um login do portal.
function tempCalcularAcessos() {
  const out = {};
  if (typeof authState === 'undefined' || typeof _authGrupoSetorIds !== 'function') return out;
  (authState.users || []).filter(u => u && u.dadosLogin && u.ativo !== false).forEach(u => {
    const g = (authState.groups || []).find(x => x.id === u.grupoId);
    const setores = _authGrupoSetorIds(g);     // null = grupo sem restrição → só a unidade do RH
    const unidades = {};
    (setores || []).forEach(sid => {
      const orgUn = typeof _orgUnidadeIdDoSetor === 'function' ? _orgUnidadeIdDoSetor(sid) : '';
      const rh = orgUn && orgState.unidades?.[orgUn]?.rhId;
      if (rh) unidades[rh] = true;
    });
    // mnemônicos: grupo (lista vazia = todos) ∩ usuário (lista vazia = todos os do grupo)
    const gl = Array.isArray(g?.tempEquipIds) && g.tempEquipIds.length ? g.tempEquipIds : null;
    const ul = Array.isArray(u.tempEquipIds) && u.tempEquipIds.length ? u.tempEquipIds : null;
    const lista = gl && ul ? ul.filter(id => gl.includes(id)) : (ul || gl);
    const equips = lista ? Object.fromEntries(lista.map(id => [id, true])) : null;
    // permissões da Temperatura vindas do grupo do Manutenção (admin do Manutenção = todas)
    const pt = g?.permissoes?.temperatura || {};
    const perms = {};
    Object.entries(_T_PERM_MANUT).forEach(([k, chave]) => { if (u.isAdmin || pt[chave] === true) perms[_T_PERM[k]] = true; });
    out[u.dadosLogin] = { unidades, equips, perms, nome: u.nomeCompleto || u.username || '', grupo: g?.nome || '' };
  });
  return out;
}
function _tSigAcesso(x) { return Object.keys(x?.unidades || {}).sort().join(',') + '|' + (x?.equips ? Object.keys(x.equips).filter(k => k !== '_nenhum').sort().join(',') : '*') + '|' + Object.keys(x?.perms || {}).sort().join(','); }
function _tListaAcessos() {
  const calc = tempCalcularAcessos();
  return Object.entries(calc).map(([login, a]) => {
    return { login, nome: a.nome, grupo: a.grupo, unidades: Object.keys(a.unidades), equips: a.equips ? Object.keys(a.equips).length : null, desatualizado: _tSigAcesso(a) !== _tSigAcesso(tempState.acessos?.[login]) };
  }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}
async function tempGravarAcessos(silencioso) {
  if (!tempPodeConfigurar()) { if (!silencioso) _tToast('Sem permissão para configurar a Temperatura.', 'error'); return; }
  const calc = tempCalcularAcessos();
  const atual = (await dbGetT(`${TEMP_RAIZ}/acesso`)) || {};
  const up = {};
  Object.entries(calc).forEach(([login, a]) => {
    if (_tSigAcesso(a) !== _tSigAcesso(atual[login]) || !atual[login])
      up[`${TEMP_RAIZ}/acesso/${login}`] = { unidades: Object.keys(a.unidades).length ? a.unidades : null,
        // lista vazia por interseção (grupo × usuário sem nada em comum) = nenhum mnemônico
        equips: a.equips ? (Object.keys(a.equips).length ? a.equips : { _nenhum: true }) : null,
        perms: Object.keys(a.perms || {}).length ? a.perms : null, em: dbServerTs() };
  });
  Object.keys(atual).forEach(login => { if (!calc[login]) up[`${TEMP_RAIZ}/acesso/${login}`] = null; });   // usuário saiu do Manutenção
  if (!Object.keys(up).length) { if (!silencioso) _tToast('Acessos já estão em dia.', 'info'); return; }
  const ok = await dbUpdateT(up);
  if (!silencioso || !ok) _tToast(ok ? `Acessos atualizados (${Object.keys(up).length}).` : 'Erro ao gravar acessos.', ok ? 'success' : 'error');
}

// Boot: carrega as permissões do grupo do portal, reaplica o menu e abre pelo sino (#temperatura)
setTimeout(function _tBoot() {
  if (typeof currentSession === 'undefined' || !currentSession || typeof rootDb === 'undefined' || !_tPerfil()) { setTimeout(_tBoot, 1500); return; }
  const g = _tPerfil().grupo;
  rootDb.ref(`grupos/${g}/perms`).on('value', snap => {
    tempState.perms = snap.val() || {};
    if (typeof applyPermissions === 'function') applyPermissions();
    if (!tempPodeVer()) return;
    tempIniciar();
    if (!tempState.unidadeId) tempState.unidadeId = (_tUnidadesVisiveis().find(u => u.id === _tMinhaUnidadeId()) || _tUnidadesVisiveis()[0])?.id || null;
    _tOuvirLeituras();
    const h = location.hash.match(/^#temperatura(?:\/([\w-]+))?$/);
    if (h && typeof switchTab === 'function' && !_tAbaAtiva()) {
      if (h[1] && _tUnidadesVisiveis().some(u => u.id === h[1])) tempState.unidadeId = h[1];
      history.replaceState(null, '', location.pathname + location.search);   // não reabre ao recarregar
      switchTab('temperatura');
    }
  }, e => console.warn('[temperatura] perms do grupo:', e && e.code));
}, 800);

// ── mnemônicos visíveis: seletor usado em Grupos e Usuários (Configurações) ──
function tempResumoMnemonicos(ids) {
  if (!Array.isArray(ids) || !ids.length) return 'Temperatura: todos';
  return `Temperatura: ${ids.length} mnemônico${ids.length !== 1 ? 's' : ''}`;
}
// opts: { titulo, sub, disponiveis: [equip], selecionados: [id] | null (= todos), onSalvar(lista | []) }
function _tPickerMnemonicos(opts) {
  tempIniciar();
  const disp = opts.disponiveis.slice().sort((a, b) => _tNomeUnidade(a.unidadeId).localeCompare(_tNomeUnidade(b.unidadeId), 'pt-BR', { numeric: true }) || String(a.codigo).localeCompare(String(b.codigo), 'pt-BR', { numeric: true }));
  const sel = new Set(opts.selecionados && opts.selecionados.length ? opts.selecionados : disp.map(e => e.id));
  let ov = document.getElementById('temp-ov');
  if (!ov) { ov = document.createElement('div'); ov.id = 'temp-ov'; ov.className = 'temp-ov'; document.body.appendChild(ov); }
  ov.onclick = (e) => { if (e.target === ov) ov.classList.remove('open'); };
  let q = '';
  const desenhar = () => {
    const nq = _tNormNome(q);
    const vis = disp.filter(e => !nq || _tNormNome([e.codigo, e.tipo, e.legenda, _tNomeUnidade(e.unidadeId)].join(' ')).includes(nq));
    const porUn = {}; vis.forEach(e => (porUn[e.unidadeId] = porUn[e.unidadeId] || []).push(e));
    ov.querySelector('#temp-pk-lista').innerHTML = Object.entries(porUn).map(([u, eqs]) => {
      const todos = eqs.every(e => sel.has(e.id));
      return `<div class="temp-pk-un"><label class="temp-pk-unh"><input type="checkbox" ${todos ? 'checked' : ''} data-un="${_tEsc(u)}"> <b>${_tEsc(_tNomeUnidade(u))}</b> <small class="temp-fx">${eqs.filter(e => sel.has(e.id)).length}/${eqs.length}</small></label>
        <div class="temp-pk-grid">${eqs.map(e => `<label class="temp-pk-it ${sel.has(e.id) ? 'on' : ''}"><input type="checkbox" ${sel.has(e.id) ? 'checked' : ''} data-eq="${_tEsc(e.id)}">
          <span><b>${_tEsc(e.codigo)}</b>${e.obrigatorio === false ? ' <i class="fas fa-truck temp-ic-cy" title="Caixa"></i>' : ''}<small>${_tEsc(e.legenda || e.tipo || '')}</small></span></label>`).join('')}</div></div>`;
    }).join('') || '<div class="temp-eq-vazio"><i class="fas fa-magnifying-glass"></i>Nada encontrado</div>';
    ov.querySelector('#temp-pk-cont').textContent = `${sel.size} de ${disp.length} selecionado(s)`;
  };
  ov.innerHTML = `<div class="temp-modal" style="width:min(94vw,760px)"><div class="temp-mh"><h3><i class="fas fa-temperature-half temp-ic-cy"></i> ${_tEsc(opts.titulo)}</h3><button class="temp-x" data-fechar>&times;</button>
    <div class="temp-mh-row temp-fx">${_tEsc(opts.sub || '')}</div>
    <div class="temp-mh-row" style="gap:10px"><label class="temp-busca" style="flex:1"><i class="fas fa-magnifying-glass"></i><input type="search" id="temp-pk-q" placeholder="Buscar mnemônico, legenda ou unidade…" autocomplete="off"></label>
      <button class="temp-btn" id="temp-pk-todos"><i class="fas fa-check-double"></i>Todos</button><button class="temp-btn" id="temp-pk-nenhum"><i class="fas fa-xmark"></i>Nenhum</button></div></div>
    <div class="temp-mb" id="temp-pk-lista"></div>
    <div class="temp-mf"><span class="temp-msg" id="temp-pk-cont"></span><div class="temp-sp"></div><button class="temp-btn" data-fechar>Cancelar</button><button class="temp-btn pri" id="temp-pk-ok"><i class="fas fa-check"></i>Aplicar</button></div></div>`;
  ov.querySelectorAll('[data-fechar]').forEach(b => { b.onclick = () => ov.classList.remove('open'); });
  ov.querySelector('#temp-pk-q').oninput = (e) => { q = e.target.value; desenhar(); };
  ov.querySelector('#temp-pk-todos').onclick = () => { disp.forEach(e => sel.add(e.id)); desenhar(); };
  ov.querySelector('#temp-pk-nenhum').onclick = () => { sel.clear(); desenhar(); };
  ov.querySelector('#temp-pk-lista').onchange = (ev) => {
    const t = ev.target;
    if (t.dataset.eq) { if (t.checked) sel.add(t.dataset.eq); else sel.delete(t.dataset.eq); }
    if (t.dataset.un) disp.filter(e => e.unidadeId === t.dataset.un).forEach(e => { if (t.checked) sel.add(e.id); else sel.delete(e.id); });
    desenhar();
  };
  ov.querySelector('#temp-pk-ok').onclick = () => {
    if (!sel.size) { _tToast('Marque ao menos um mnemônico (ou "Todos").', 'error'); return; }
    // todos marcados = sem restrição (inclui equipamentos cadastrados depois)
    opts.onSalvar(sel.size === disp.length ? [] : [...sel]);
    ov.classList.remove('open');
  };
  desenhar();
  ov.classList.add('open');
}
function _tTodosEquipsAtivos() { return Object.values(tempState.equipamentos || {}).filter(e => e && e.ativo !== false); }
function tempAbrirMnemonicosGrupo(gid) {
  if (!tempPodeConfigurar()) { _tToast('Precisa da permissão Configurar da Temperatura.', 'error'); return; }
  const g = authState.groups.find(x => x.id === gid); if (!g) return;
  if (!_tTodosEquipsAtivos().length) { _tToast('Nenhum equipamento cadastrado na Temperatura.', 'info'); return; }
  _tPickerMnemonicos({ titulo: `Mnemônicos de Temperatura — ${g.nome}`, sub: 'Equipamentos que os membros do grupo veem e lançam (dentro das unidades dos setores visíveis). Todos marcados = sem restrição.',
    disponiveis: _tTodosEquipsAtivos(), selecionados: g.tempEquipIds,
    onSalvar(lista) { g.tempEquipIds = lista; _saveAuth(); if (typeof renderGroupsTable === 'function') renderGroupsTable(); _tToast('Mnemônicos do grupo salvos.', 'success'); } });
}
function tempAbrirMnemonicosUsuario() {
  const gid = document.getElementById('user-edit-grupo')?.value;
  const g = authState.groups.find(x => x.id === gid);
  const base = _tTodosEquipsAtivos().filter(e => !g?.tempEquipIds?.length || g.tempEquipIds.includes(e.id));
  if (!base.length) { _tToast('O grupo não tem mnemônicos liberados.', 'error'); return; }
  _tPickerMnemonicos({ titulo: 'Mnemônicos de Temperatura do usuário', sub: 'Restringe dentro dos liberados ao grupo. Todos marcados = todos os do grupo. Vale ao salvar o usuário.',
    disponiveis: base, selecionados: (window._userEditTempEquips || []).filter(id => base.some(e => e.id === id)),
    onSalvar(lista) { window._userEditTempEquips = lista; tempAtualizarBotaoUsuario(); } });
}
function tempAtualizarBotaoUsuario() {
  const f = document.getElementById('user-edit-temp-field'); if (f) f.style.display = tempPodeConfigurar() ? '' : 'none';
  const l = document.getElementById('user-edit-temp-label'); if (!l) return;
  const n = (window._userEditTempEquips || []).length;
  l.textContent = n ? `${n} mnemônico${n !== 1 ? 's' : ''}` : 'Todos do grupo';
}
