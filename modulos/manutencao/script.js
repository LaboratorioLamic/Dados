  // ── ESTADO GLOBAL ──
  const STORAGE_KEY = 'gestao-ativos-v2';
  let state = {
    setores: ["Laboratório Central", "Triagem", "Imagens"],
    categorias: ["Equipamentos Médicos", "Mobiliário Clínico", "TI"],
    ativos: [],
    tiposRotina: ['Preventivo', 'Rotina'],
    rotinas: [],
    tarefas: [],
    publicacoes: []
  };

  function saveState() {
    // Só salva após o Firebase ter respondido ao menos uma vez (evita sobrescrever dados reais com estado padrão)
    if (_stateFirebaseReady) {
      window.dbSave(STORAGE_KEY, state);
    }
    refreshTaskFlagsUI();
  }

  function isModalOpen(id) {
    return document.getElementById(id)?.classList.contains('open');
  }

  function getActiveSubTab(prefix, tabs) {
    for (const t of tabs) {
      const el = document.getElementById(prefix + '-' + t);
      if (el && el.style.display !== 'none') return t;
    }
    return tabs[0];
  }

  function refreshTaskFlagsUI() {
    renderCards();
    renderRotinasTable();
    renderTarefasTable();
    renderAtividadesTable();
    if (typeof _updateRotinaFiltroAtividadesDisplay === 'function') _updateRotinaFiltroAtividadesDisplay();
    if (typeof window._agendaRefreshHook === 'function') window._agendaRefreshHook();
    updateNotifBadge();

    if (document.getElementById('notif-dropdown')?.classList.contains('open')) {
      renderNotifDropdown();
    }
    if (document.getElementById('ativos-notif-dropdown')?.classList.contains('open')) {
      renderAtivosNotifDropdown();
    }

    if (isModalOpen('modal-rotina-view') && rotinaViewId) {
      renderRotinaViewInfo();
    }

    if (isModalOpen('modal-visualizar') && ativoEdicaoIndex !== null && ativoEdicaoIndex !== undefined) {
      _atualizarBadgesAtivoTabs(ativoEdicaoIndex);
      const avTab = getActiveSubTab('avtab', ['info', 'rotinas', 'ots', 'ocorrencias']);
      if (avTab === 'rotinas') _renderAtivoRotinas();
      if (avTab === 'ocorrencias' && typeof _renderAtivoOcorrencias === 'function') _renderAtivoOcorrencias();
    }

    if (isModalOpen('modal-tarefa-detalhe') && tarefaDetalheId) {
      renderTarefaDetalheContent(tarefaDetalheId);
      if (getActiveSubTab('tdtab', ['info', 'atividades']) === 'atividades') renderHistoricoTable(tarefaDetalheId);
    }
  }
  function loadState() { return null; } // substituído por Firebase

  // Flag: true após o Firebase responder pela primeira vez (null = banco vazio é igualmente válido)
  let _stateFirebaseReady = false;

  window._dbReady.then(() => {
    window.dbListen(STORAGE_KEY, (data) => {
      _stateFirebaseReady = true; // Firebase respondeu — saves agora são seguros
      if (data && typeof data === 'object') {
        state = {
          setores:    Array.isArray(data.setores)    ? data.setores    : state.setores,
          categorias: Array.isArray(data.categorias) ? data.categorias : state.categorias,
          ativos:     Array.isArray(data.ativos)     ? data.ativos     : state.ativos,
          tiposRotina:Array.isArray(data.tiposRotina)? data.tiposRotina: state.tiposRotina,
          rotinas:    Array.isArray(data.rotinas)    ? data.rotinas    : state.rotinas,
          tarefas:    Array.isArray(data.tarefas)    ? data.tarefas    : state.tarefas,
          // O Firebase descarta arrays vazios: sem o campo = nenhuma publicação no nó principal
          // (ex.: todas foram para o arquivo). Manter o estado local aqui as regravaria.
          publicacoes:Array.isArray(data.publicacoes)? data.publicacoes: []
        };
      }
      if (_sincronizarRefsAtivos()) saveState();
      if (typeof _otSincronizarRefsAtivos === 'function') _otSincronizarRefsAtivos();
      refreshTaskFlagsUI();
      if (typeof _initTopbarSectorFilter === 'function' && typeof currentSession !== 'undefined' && currentSession) {
        _initTopbarSectorFilter();
      }
    });
  });

  // ── UTILITÁRIOS ──
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  // ── IDENTIFICAÇÃO ESTÁVEL DE ATIVOS ──
  // Ativos possuem `id` fixo. Os vínculos legados por posição (equipamentoIdx / ativoIdx)
  // continuam existindo, mas são recalculados a partir do id sempre que divergirem.
  function _ativoById(id)    { return id ? (state.ativos.find(a => a?.id === id) || null) : null; }
  function _ativoIdxById(id) { return id ? state.ativos.findIndex(a => a?.id === id) : -1; }
  window._ativoById    = _ativoById;
  window._ativoIdxById = _ativoIdxById;

  // Garante id em todos os ativos e mantém equipamentoId ⇄ equipamentoIdx coerentes
  // em rotinas e tarefas. Retorna true se algo mudou.
  function _sincronizarRefsAtivos() {
    let mudou = false;
    // Id determinístico na migração: clientes simultâneos geram o mesmo valor
    state.ativos.forEach((a, i) => { if (a && !a.id) { a.id = 'atv_m' + i; mudou = true; } });
    const sync = rec => {
      if (!rec) return;
      if (rec.equipamentoId) {
        const idx = _ativoIdxById(rec.equipamentoId);
        if (idx >= 0 && rec.equipamentoIdx !== idx) { rec.equipamentoIdx = idx; mudou = true; }
      } else {
        const a = state.ativos[rec.equipamentoIdx];
        if (a?.id) { rec.equipamentoId = a.id; mudou = true; }
      }
    };
    state.rotinas.forEach(sync);
    state.tarefas.forEach(sync);
    return mudou;
  }

  // Retorna ao status "Em uso" um ativo em pausa quando todas as causas da pausa
  // foram resolvidas: OTs concluídas/canceladas e ocorrências liberadas/canceladas.
  function _ativoAvaliarRetornoUso(ativoIdx) {
    const ativo = state.ativos[ativoIdx];
    if (!ativo || ativo.statusUso !== 'em_pausa') return false;
    const pOTs = ativo.pausaOTs || [];
    const pOcs = ativo.pausaOcorrencias || [];
    if (pOTs.length === 0 && pOcs.length === 0) return false;
    const otsOk = pOTs.every(pid => {
      const ot = (typeof otState !== 'undefined' ? otState.ordens : []).find(o => o.id === pid);
      return !ot || ['concluida', 'cancelada'].includes(ot.status);
    });
    const ocsOk = pOcs.every(oid => typeof ocPausaResolvida !== 'function' || ocPausaResolvida(oid, ativo.id));
    if (!otsOk || !ocsOk) return false;
    state.ativos[ativoIdx] = { ...ativo, statusUso: 'em_uso', pausaOTs: [], pausaOcorrencias: [] };
    saveState();
    showToast(`Ativo "${ativo.nome}" retornou para Em Uso automaticamente.`, 'success');
    return true;
  }
  window._ativoAvaliarRetornoUso = _ativoAvaliarRetornoUso;
  function formatDate(str) {
    if (!str) return '—';
    const value = typeof str === 'string' ? str : String(str);
    const datePart = (value.includes('T') ? value.split('T')[0] : value);
    const [y,m,d] = datePart.split('-');
    return `${d}/${m}/${y}`;
  }
  function formatDateTime(str) {
    if (!str) return '—';
    const value = typeof str === 'string' ? str : String(str);
    if (!value.includes('T')) return formatDate(value);
    const [datePart, timePart] = value.split('T');
    const [y,m,d] = datePart.split('-');
    const [h,min] = timePart.split(':');
    return `${d}/${m}/${y} ${h}:${min}`;
  }
  function parseDataRealizada(str) {
    if (!str) return { date: '', time: '' };
    const value = typeof str === 'string' ? str : String(str);
    if (value.includes('T')) {
      const [date, timePart] = value.split('T');
      const time = (timePart || '').slice(0, 5);
      return { date, time: /^\d{2}:\d{2}$/.test(time) ? time : '' };
    }
    return { date: value, time: '' };
  }
  function buildDataRealizada(date, time) {
    if (!date) return '';
    return time ? `${date}T${time}` : date;
  }
  function dataRealizadaSortKey(str) {
    const { date, time } = parseDataRealizada(str);
    return (date || '') + 'T' + (time || '00:00');
  }
  function formatDataRealizadaHtml(str) {
    const { date, time } = parseDataRealizada(str);
    if (!date) return '—';
    const dateStr = formatDate(date);
    if (!time) return dateStr;
    return `${dateStr}<span class="data-realizada-hora">${time}</span>`;
  }
  function formatDataRealizadaText(str) {
    const { date, time } = parseDataRealizada(str);
    if (!date) return '—';
    return time ? `${formatDate(date)} ${time}` : formatDate(date);
  }
  function getTarefaLabel(t) {
    if (!t) return '—';
    const ativo = state.ativos[t.equipamentoIdx];
    const parts = [];
    if (ativo?.nome) parts.push(ativo.nome);
    if (ativo?.codigo) parts.push(ativo.codigo);
    if (t.dataTarefa) parts.push('prog. ' + formatDate(t.dataTarefa));
    return parts.length ? parts.join(' · ') : '—';
  }
  function calcProximaData(dateStr, rotina) {
    if (!dateStr || !rotina) return '';
    if (rotina.frequencia === 'Sempre') return '';
    if (rotina.frequencia === 'DiaDaSemana') {
      const dias = rotina.diasSemana || [];
      if (dias.length === 0) return '';
      return calcProximaDataDiaSemana(dateStr, dias);
    }
    const d = new Date(dateStr + 'T12:00:00');
    const n = parseInt(rotina.fazerCada) || 1;
    switch (rotina.frequencia) {
      case 'Dia':    d.setDate(d.getDate() + n); break;
      case 'Semana': d.setDate(d.getDate() + n * 7); break;
      case 'Meses':  d.setMonth(d.getMonth() + n); break;
      case 'Anos':   d.setFullYear(d.getFullYear() + n); break;
    }
    return d.toISOString().split('T')[0];
  }
  function getTaskFlag(tarefa) {
    if (tarefa.status === 'Inativo') return { cls: 'flag-inactive', icon: '⏸', label: 'Inativo' };
    if (!tarefa.proximaData) return { cls: 'flag-ok', icon: '✓', label: 'Ok' };
    const today = new Date(); today.setHours(0,0,0,0);
    const due = new Date(tarefa.proximaData + 'T00:00:00');
    const diff = Math.ceil((due - today) / 86400000);
    if (diff < 0) return { cls: 'flag-danger', icon: '!', label: `Vencida ${Math.abs(diff)}d` };
    const lembrete = tarefa.lembrete;
    if (lembrete === null || lembrete === undefined) return { cls: 'flag-ok', icon: '✓', label: `${diff}d` };
    if (diff <= lembrete) return { cls: 'flag-warning', icon: '⚠', label: `${diff}d restantes` };
    return { cls: 'flag-ok', icon: '✓', label: `${diff}d` };
  }

  // ── INICIALIZAÇÃO ──
  document.addEventListener("DOMContentLoaded", () => {
    atualizarSelects();       // popula setores, categorias, tipos
    atualizarFiltrosRotina(); // filtros do painel rotina
    populateTipoSelect();     // select de tipo no drawer
    renderCards();
    updateNotifBadge();
    updateAtivosFiltroBtn();
    setInterval(refreshTaskFlagsUI, 60000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) refreshTaskFlagsUI();
    });
    // aberto em #temperatura: a aba é ligada pelo boot da Temperatura (temperatura.js) assim que as permissões chegam
    if (!window.__bootTemp) switchTab('inicio');
  });

  // ── SIDEBAR OVERLAY ──
  function openSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebar-backdrop').classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-backdrop').classList.remove('open');
    document.body.style.overflow = '';
  }

  // ── OPTIMIZED MODE ──
  if (localStorage.getItem('optimizedMode') === '1') {
    document.body.classList.add('optimized-mode');
  }
  document.addEventListener('DOMContentLoaded', function() {
    if (localStorage.getItem('optimizedMode') === '1') {
      const btn = document.getElementById('opt-mode-btn');
      if (btn) btn.classList.add('active');
    }
  });

  function toggleOptimizedMode() {
    const body = document.body;
    const btn = document.getElementById('opt-mode-btn');
    const on = body.classList.toggle('optimized-mode');
    btn.classList.toggle('active', on);
    localStorage.setItem('optimizedMode', on ? '1' : '0');
  }

  // ── DARK MODE ──
  if (localStorage.getItem('darkMode') === '1') {
    document.body.classList.add('dark-mode');
  }
  document.addEventListener('DOMContentLoaded', function() {
    if (localStorage.getItem('darkMode') === '1') {
      const btn = document.getElementById('dark-mode-btn');
      if (btn) btn.classList.add('active');
    }
  });

  function toggleDarkMode() {
    const body = document.body;
    const btn = document.getElementById('dark-mode-btn');
    const on = body.classList.toggle('dark-mode');
    btn.classList.toggle('active', on);
    localStorage.setItem('darkMode', on ? '1' : '0');
  }

  // ── TOAST ──
  let _toastTimer = null;
  function showToast(msg, type = 'success') {
    const el = document.getElementById('toast');
    const icons = {
      success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>',
      error:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      info:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
    };
    el.innerHTML = (icons[type] || '') + msg;
    el.className = `toast ${type} show`;
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }

  // ── NAVEGAÇÃO ──
  const TAB_TITLES = { inicio:'Início', ativos:'Ativos', rotina:'Rotina', os:'Ordens de Trabalho', ocorrencias:'Ocorrências', cq:'Controle de Qualidade', temperatura:'Temperatura', config:'Configurações' };
  function switchTab(tabId) {
    // Guardas de permissão — verificar antes de qualquer alteração no DOM
    if (['ativos','rotina','os','ocorrencias','cq','temperatura'].includes(tabId)) {
      if (typeof authCanViewTab === 'function' && !authCanViewTab(tabId)) {
        showToast('Sem permissão para visualizar esta aba.', 'error');
        switchTab('inicio');
        return;
      }
    }
    if (tabId === 'config') {
      if (typeof authHasPermission === 'function' &&
          typeof currentSession    !== 'undefined' && currentSession &&
          !currentSession.isAdmin  && !authHasPermission('config.visualizarConfig')) {
        showToast('Sem permissão para acessar as configurações.', 'error');
        switchTab('inicio');
        return;
      }
    }

    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('tab-' + tabId)?.classList.add('active');
    document.getElementById('nav-' + tabId)?.classList.add('active');
    const title = TAB_TITLES[tabId] || tabId;
    document.getElementById('topbar-title').textContent = title;
    document.getElementById('topbar-breadcrumb').textContent = 'Sistema / ' + title;
    closeSidebar();
    if (tabId !== 'ativos') closeAtivosFilter();
    // Inicializar conteúdo ao trocar de aba
    if (tabId === 'rotina') {
      atualizarFiltrosRotina();
      populateTipoSelect();
    }
    if (tabId === 'rotina' || tabId === 'ativos') refreshTaskFlagsUI();
    if (tabId === 'inicio') {
      if (typeof renderHome === 'function') renderHome();
    }
    if (tabId === 'config') {
      _switchConfigTabFirst();
    }
    if (tabId === 'temperatura' && typeof tempRender === 'function') tempRender();
  }

  // ── ROTINA SUBTABS ──
  let activeRotinaTab = 'rotinas';
  function switchRotinaTab(tab) {
    activeRotinaTab = tab;
    const rotinaTab = document.getElementById('tab-rotina');
    rotinaTab.querySelectorAll('.rotina-panel').forEach(p => p.classList.remove('active'));
    rotinaTab.querySelectorAll('.rotina-nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('rpanel-' + tab).classList.add('active');
    document.getElementById('rnav-' + tab).classList.add('active');
    renderRotinasTable();
    renderTarefasTable();
    renderAtividadesTable();
    updateNotifBadge();
    if (tab === 'agenda' && typeof renderAgendaCalendario === 'function') renderAgendaCalendario();
  }

  // ── CONFIG SUBTABS ──
  const CONFIG_TABS_ORDER = ['usuario','grupos','org','empresas','ocorrencias','cq','temperatura','backup'];

  function _switchConfigTabFirst() {
    const first = CONFIG_TABS_ORDER.find(t => {
      const el = document.getElementById('cnav-' + t);
      return el && el.style.display !== 'none';
    });
    if (first) switchConfigTab(first);
  }

  function switchConfigTab(tab) {
    const configTab = document.getElementById('tab-config');
    configTab.querySelectorAll('.rotina-panel').forEach(p => p.classList.remove('active'));
    configTab.querySelectorAll('.rotina-nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('cpanel-' + tab)?.classList.add('active');
    document.getElementById('cnav-' + tab)?.classList.add('active');
    if (tab === 'backup')   { renderSysInfo(); if (typeof arqRenderPainel === 'function') arqRenderPainel(); }
    if (tab === 'usuario')  { if (typeof renderUsersTable  === 'function') renderUsersTable(); }
    if (tab === 'grupos')   { if (typeof renderGroupsTable === 'function') renderGroupsTable(); }
    if (tab === 'empresas') { if (typeof empRenderTable    === 'function') empRenderTable(); }
    if (tab === 'ocorrencias') { if (typeof ocRenderConfigCatalogos === 'function') ocRenderConfigCatalogos(); }
    if (tab === 'cq')       { if (typeof cqRenderConfig    === 'function') cqRenderConfig(); }
    if (tab === 'temperatura') { if (typeof tempRenderConfig === 'function') tempRenderConfig(); }
    if (tab === 'org')      { if (typeof orgRenderGerenciador === 'function') orgRenderGerenciador(); }
  }

  // ── NOTIFICAÇÕES ──
  function toggleNotifDropdown() {
    const dd = document.getElementById('notif-dropdown');
    dd.classList.toggle('open');
    if (dd.classList.contains('open')) renderNotifDropdown();
  }
  document.addEventListener('click', e => {
    if (!e.target.closest('.notif-wrapper')) {
      document.getElementById('notif-dropdown')?.classList.remove('open');
      document.getElementById('ativos-notif-dropdown')?.classList.remove('open');
    }
    if (!e.target.closest('#ativos-filter-toolbar-zone') && isAtivosFilterOpen()) {
      closeAtivosFilter();
    }
  });

  function renderNotifDropdown() {
    const list = document.getElementById('notif-list');
    const alerts = getNotifAlerts('rotina');
    document.getElementById('notif-count-label').textContent = alerts.length + ' alerta' + (alerts.length !== 1 ? 's' : '');
    if (alerts.length === 0) {
      list.innerHTML = '<div class="notif-empty">Nenhum alerta no momento</div>';
      return;
    }
    list.innerHTML = alerts.map(a => `
      <div class="notif-item" onclick="${a.isCQ ? `cqAbrirTrocaAlerta('${a.cqUnidade}')` : `switchRotinaTab('tarefas');openTarefaDetalhe('${a.tarefaId}')`};document.getElementById('notif-dropdown').classList.remove('open')">
        <div class="notif-dot ${a.tipo}"></div>
        <div class="notif-text">
          <strong>${a.rotinaNome}</strong> — ${a.equipNome}
          <small>${a.msg}</small>
        </div>
      </div>`).join('');
  }

  function ativoPassesAtivosFilters(equipamentoIdx) {
    const ativo = state.ativos[equipamentoIdx];
    if (!ativo) return false;
    if (typeof _userCanSeeAtivo === 'function' && !_userCanSeeAtivo(ativo)) return false;
    // Respeita subtab: notificações só do subtab ativo
    if (typeof _ativosSubtab !== 'undefined') {
      if (_ativosSubtab === 'em_desuso' && ativo.statusUso !== 'em_desuso') return false;
      if (_ativosSubtab !== 'em_desuso' && ativo.statusUso === 'em_desuso') return false;
    }
    const fSetor = (typeof sectorSearchGetValue === 'function') ? sectorSearchGetValue() : 'todos';
    const fCat   = (typeof categorySearchGetValue === 'function') ? categorySearchGetValue() : 'todas';
    if (!_orgAtivoPassa(ativo, _unitSearchVal, fSetor, typeof _ambSearchVal !== 'undefined' ? _ambSearchVal : '')) return false;
    if (fCat !== 'todas' && ativo.categoria !== fCat) return false;
    if (typeof _tipoSearchVal !== 'undefined' && _tipoSearchVal !== 'todos' && (ativo.tipo || 'Equipamento') !== _tipoSearchVal) return false;
    return true;
  }

  function tarefaPassesRotinaNotifFilters(t) {
    const rotina = state.rotinas.find(r => r.id === t.rotinaId);
    const ativo  = state.ativos[t.equipamentoIdx];
    if (!rotina || !ativo) return false;

    // Respeita o filtro de setores da topbar (Selecionar Setores)
    if (typeof _userCanSeeAtivo === 'function' && !_userCanSeeAtivo(ativo)) return false;

    const fTipo   = document.getElementById('filter-tipo')?.value || '';
    const fSetor  = document.getElementById('filter-setor-rotina-val')?.value || '';
    const fUnidade = document.getElementById('filter-unidade-rotina-val')?.value || '';
    const fCat    = document.getElementById('filter-cat-rotina-val')?.value || '';
    const fAtivoIdx = state._ativoFiltroIdx ?? null;

    if (fAtivoIdx !== null && fAtivoIdx !== undefined && t.equipamentoIdx !== fAtivoIdx) return false;
    if (fTipo && rotina.tipo !== fTipo) return false;
    if (!_orgAtivoPassa(ativo, fUnidade, fSetor)) return false;
    if (fCat && ativo.categoria !== fCat) return false;

    const rStatus = rotina.status || 'Ativo';
    if (_rotinaStatusFilter === 'ativo' && rStatus !== 'Ativo') return false;
    if (_rotinaStatusFilter === 'inativo' && rStatus !== 'Inativo') return false;

    if (activeRotinaTab === 'tarefas') {
      if (!tarefaPassesStatusFilter(t, 'main')) return false;
      const fTarefaAtivo = state._ativoFiltroTarefasIdx ?? null;
      if (fTarefaAtivo !== null && fTarefaAtivo !== undefined && t.equipamentoIdx !== fTarefaAtivo) return false;
    }

    if (activeRotinaTab === 'atividades') {
      const fAtivAtivo = state._ativoFiltroAtividadesIdx ?? null;
      if (fAtivAtivo !== null && fAtivAtivo !== undefined && t.equipamentoIdx !== fAtivAtivo) return false;
    }

    return true;
  }

  function getNotifAlerts(context) {
    const today = new Date(); today.setHours(0,0,0,0);
    const alerts = [];
    state.tarefas.forEach(t => {
      const tStatus = t.status || 'Ativo';
      if (tStatus !== 'Ativo') return;
      if (!t.proximaData) return;

      if (context === 'rotina' && !tarefaPassesRotinaNotifFilters(t)) return;
      if (context === 'ativos' && !ativoPassesAtivosFilters(t.equipamentoIdx)) return;

      const rotina = state.rotinas.find(r => r.id === t.rotinaId);
      const ativo = state.ativos[t.equipamentoIdx];
      if (!rotina || !ativo) return;
      const due = new Date(t.proximaData + 'T00:00:00');
      const diffDays = Math.ceil((due - today) / 86400000);
      if (diffDays < 0) {
        alerts.push({
          tarefaId: t.id, equipamentoIdx: t.equipamentoIdx, proximaData: t.proximaData,
          tipo: 'danger', rotinaNome: rotina.nome, tarefaNome: t.titulo || rotina.nome, equipNome: ativo.nome, equipCodigo: ativo.codigo,
          msg: `Vencida há ${Math.abs(diffDays)} dia(s)`, diffDays
        });
      } else if (t.lembrete !== null && t.lembrete !== undefined && diffDays <= t.lembrete) {
        alerts.push({
          tarefaId: t.id, equipamentoIdx: t.equipamentoIdx, proximaData: t.proximaData,
          tipo: 'warning', rotinaNome: rotina.nome, tarefaNome: t.titulo || rotina.nome, equipNome: ativo.nome, equipCodigo: ativo.codigo,
          msg: `Vence em ${diffDays} dia(s)`, diffDays
        });
      }
    });

    // Inclui OTs no período de alerta (apenas no contexto de ativos)
    if (context === 'ativos' && typeof otState !== 'undefined') {
      otState.ordens.forEach(o => {
        if (['concluida', 'cancelada'].includes(o.status)) return;
        if (!o.prazo) return;
        if (!ativoPassesAtivosFilters(o.ativoIdx)) return;

        const ativo = (o.ativoIdx !== null && o.ativoIdx !== undefined) ? state.ativos[o.ativoIdx] : null;
        const due = new Date(o.prazo + 'T00:00:00');
        const diffDays = Math.ceil((due - today) / 86400000);
        const _otAlertRaw = (o.prazoAlertaDias !== undefined && o.prazoAlertaDias !== null)
          ? parseInt(o.prazoAlertaDias, 10) : null;
        const alertLimit = (_otAlertRaw !== null && !Number.isNaN(_otAlertRaw) && _otAlertRaw >= 0) ? _otAlertRaw : null;

        if (diffDays < 0) {
          alerts.push({
            otId: o.id, equipamentoIdx: o.ativoIdx ?? null, proximaData: o.prazo,
            tipo: 'danger', rotinaNome: o.numero || 'OT', equipNome: ativo ? ativo.nome : (o.titulo || '—'),
            equipCodigo: ativo ? ativo.codigo : '', msg: `Vencida há ${Math.abs(diffDays)} dia(s)`, diffDays,
            isOT: true, otTitulo: o.titulo || ''
          });
        } else if (alertLimit !== null && diffDays <= alertLimit) {
          alerts.push({
            otId: o.id, equipamentoIdx: o.ativoIdx ?? null, proximaData: o.prazo,
            tipo: 'warning', rotinaNome: o.numero || 'OT', equipNome: ativo ? ativo.nome : (o.titulo || '—'),
            equipCodigo: ativo ? ativo.codigo : '', msg: `Vence em ${diffDays} dia(s)`, diffDays,
            isOT: true, otTitulo: o.titulo || ''
          });
        }
      });
    }

    // Trocas de preparo do Controle de Qualidade (cq-trocas.js)
    if (context === 'rotina' && typeof window.cqNotifAlertas === 'function') alerts.push(...window.cqNotifAlertas());

    alerts.sort((a, b) => {
      if (a.tipo !== b.tipo) return a.tipo === 'danger' ? -1 : 1;
      return (a.diffDays ?? 0) - (b.diffDays ?? 0);
    });
    return alerts;
  }

  function getAtivoAlertCounts(equipamentoIdx) {
    if (!ativoPassesAtivosFilters(equipamentoIdx)) return { danger: 0, warning: 0, total: 0 };
    let danger = 0, warning = 0;
    state.tarefas.filter(t => t.equipamentoIdx === equipamentoIdx && t.status === 'Ativo').forEach(t => {
      const f = getTaskFlag(t);
      if (f.cls === 'flag-danger') danger++;
      else if (f.cls === 'flag-warning') warning++;
    });
    // Inclui OTs do ativo no período de alerta
    if (typeof otState !== 'undefined') {
      const today = new Date(); today.setHours(0,0,0,0);
      otState.ordens.filter(o =>
        !['concluida', 'cancelada'].includes(o.status) &&
        o.prazo &&
        o.ativoIdx === equipamentoIdx
      ).forEach(o => {
        const due = new Date(o.prazo + 'T00:00:00');
        const diffDays = Math.ceil((due - today) / 86400000);
        const _otAlertRaw2 = (o.prazoAlertaDias !== undefined && o.prazoAlertaDias !== null)
          ? parseInt(o.prazoAlertaDias, 10) : null;
        const alertLimit = (_otAlertRaw2 !== null && !Number.isNaN(_otAlertRaw2) && _otAlertRaw2 >= 0) ? _otAlertRaw2 : null;
        if (diffDays < 0) danger++;
        else if (alertLimit !== null && diffDays <= alertLimit) warning++;
      });
    }
    return { danger, warning, total: danger + warning };
  }

  function toggleAtivosNotifDropdown() {
    const dd = document.getElementById('ativos-notif-dropdown');
    if (!dd) return;
    dd.classList.toggle('open');
    if (dd.classList.contains('open')) renderAtivosNotifDropdown();
  }

  function renderAtivosNotifDropdown() {
    const list = document.getElementById('ativos-notif-list');
    const label = document.getElementById('ativos-notif-count-label');
    if (!list) return;
    const alerts = getNotifAlerts('ativos');
    if (label) label.textContent = alerts.length + ' alerta' + (alerts.length !== 1 ? 's' : '');
    if (alerts.length === 0) {
      list.innerHTML = '<div class="notif-empty">Nenhum alerta no momento</div>';
      return;
    }
    list.innerHTML = alerts.map(a => {
      const onclick = a.isOT
        ? `otOpenView('${a.otId}');document.getElementById('ativos-notif-dropdown').classList.remove('open')`
        : `openAlertaFromAtivos('${a.tarefaId}');document.getElementById('ativos-notif-dropdown').classList.remove('open')`;
      const label = a.isOT
        ? `<span style="font-size:10px;font-weight:700;color:var(--cyan);background:rgba(0,180,216,0.12);border-radius:4px;padding:1px 5px;margin-left:4px;vertical-align:middle;">OT</span>`
        : '';
      const subline = a.isOT && a.otTitulo
        ? `${a.otTitulo} · ${a.msg} · ${formatDate(a.proximaData)}`
        : `${a.equipCodigo ? a.equipCodigo + ' · ' : ''}${a.msg} · ${formatDate(a.proximaData)}`;
      return `
      <div class="notif-item" onclick="${onclick}">
        <div class="notif-dot ${a.tipo}"></div>
        <div class="notif-text">
          <strong>${a.isOT ? a.rotinaNome : (a.tarefaNome || a.rotinaNome)}</strong>${label} — ${a.equipNome}
          <small>${subline}</small>
        </div>
      </div>`;
    }).join('');
  }

  function openAlertaFromAtivos(tarefaId) {
    const t = state.tarefas.find(t => t.id === tarefaId);
    if (!t) return;
    openTarefaDetalhe(tarefaId);
  }

  function updateNotifBadge() {
    const rotinaCount = getNotifAlerts('rotina').length;
    const ativosCount = getNotifAlerts('ativos').length;
    const badge = document.getElementById('notif-badge');
    if (badge) {
      badge.textContent = rotinaCount;
      badge.classList.toggle('visible', rotinaCount > 0);
    }
    const ativosBadge = document.getElementById('ativos-notif-badge');
    if (ativosBadge) {
      ativosBadge.textContent = ativosCount;
      ativosBadge.classList.toggle('visible', ativosCount > 0);
    }
    if (document.getElementById('notif-dropdown')?.classList.contains('open')) {
      renderNotifDropdown();
    }
    if (document.getElementById('ativos-notif-dropdown')?.classList.contains('open')) {
      renderAtivosNotifDropdown();
    }
  }

  // ══════════════════════════════════════════
  // ── DRAWER DE TAREFA ──
  // ══════════════════════════════════════════
  let tarefaEdicaoId = null;

  function openTarefaDrawerParaRotina(rotinaId) {
    const r = state.rotinas.find(r => r.id === rotinaId);
    if (!r) return;
    // Abre o drawer normalmente e depois pré-preenche
    openTarefaDrawer(null, rotinaId);
  }

  function openTarefaDrawer(id = null, preRotinaId = null) {
    if (!id && !preRotinaId && state.rotinas.length === 0) {
      showToast('Cadastre pelo menos uma rotina antes de criar tarefas.', 'info');
      return;
    }
    tarefaEdicaoId = id;
    const editing = id ? state.tarefas.find(t => t.id === id) : null;

    document.getElementById('drawer-tarefa-title').textContent = id ? 'Editar Tarefa' : 'Nova Tarefa';
    const btnHistTarefa = document.getElementById('btn-hist-tarefa');
    if (btnHistTarefa) btnHistTarefa.style.display = id ? '' : 'none';
    document.getElementById('tarefa-save-label').textContent = id ? 'Salvar Alterações' : 'Salvar Tarefa';

    // Reset autocomplete ativo
    document.getElementById('tarefa-equip-input').value = '';
    document.getElementById('tarefa-equip-select').value = '';
    document.getElementById('tarefa-equip-dropdown').style.display = 'none';

    // Limpar campos
    document.getElementById('tarefa-titulo').value = '';
    document.getElementById('tarefa-rotina-select').innerHTML = '<option value="">Selecione a rotina...</option>';
    document.getElementById('tarefa-rotina-info').style.display = 'none';
    const _dataInputReset = document.getElementById('tarefa-data');
    _dataInputReset.value = '';
    _dataInputReset.readOnly = false;
    _dataInputReset.style.opacity = '';
    _dataInputReset.style.cursor = '';
    _dataInputReset.setAttribute('oninput', 'autoCalcProximaData()');
    const _dataLabelReset = document.getElementById('tarefa-data-label');
    if (_dataLabelReset) {
      _dataLabelReset.childNodes[0].textContent = 'Data da Tarefa ';
      const _reqSpan = document.getElementById('tarefa-data-required');
      if (_reqSpan) _reqSpan.style.display = '';
    }
    document.getElementById('tarefa-lembrete').value = '';
    document.getElementById('tarefa-obs').value = '';
    document.getElementById('tarefa-fazer-cada').value = '';
    document.getElementById('tarefa-frequencia').value = 'Meses';
    document.getElementById('tarefa-repetir').value = 'Sempre';
    document.getElementById('tarefa-vezes').value = '';
    document.getElementById('tarefa-field-vezes').style.display = 'none';
    document.getElementById('tarefa-status').checked = true;
    updateTarefaStatusToggleLabel();
    setProximaDataDisplay('');
    _diasSemanaSelected = [];
    _tarefaResponsaveis = { usuarios: [], grupos: [] };
    _tarefaEmpresaId = null;
    document.getElementById('tarefa-empresa-padrao').value = '';
    const _respReset = document.getElementById('tarefa-resp-padrao');
    _respReset.value = '';
    _respReset.disabled = true;
    _respReset.placeholder = 'Selecione uma empresa primeiro';
    document.querySelectorAll('.dia-semana-btn').forEach(b => b.classList.remove('active'));
    onTarefaFrequenciaChange();
    _renderResponsaveisChips();

    if (editing) {
      document.getElementById('tarefa-titulo').value = editing.titulo || '';
      _tarefaSetAtivo(editing.equipamentoIdx);
      onTarefaEquipChange();
      document.getElementById('tarefa-rotina-select').value = editing.rotinaId;
      onTarefaRotinaChange();
      const _tarefaDataInput = document.getElementById('tarefa-data');
      const _tarefaDataLabel = document.getElementById('tarefa-data-label');
      const _tarefaDataRequired = document.getElementById('tarefa-data-required');
      const _temPublicacoes = arqTemPubs(editing.id);
      _tarefaDataInput.value = editing.dataTarefa || '';
      if (_temPublicacoes) {
        _tarefaDataLabel.childNodes[0].textContent = 'Ultima publicação ';
        if (_tarefaDataRequired) _tarefaDataRequired.style.display = 'none';
        _tarefaDataInput.readOnly = true;
        _tarefaDataInput.style.opacity = '0.7';
        _tarefaDataInput.style.cursor = 'default';
        _tarefaDataInput.removeAttribute('oninput');
      } else {
        _tarefaDataLabel.childNodes[0].textContent = 'Data da Tarefa ';
        if (_tarefaDataRequired) _tarefaDataRequired.style.display = '';
        _tarefaDataInput.readOnly = false;
        _tarefaDataInput.style.opacity = '';
        _tarefaDataInput.style.cursor = '';
        _tarefaDataInput.setAttribute('oninput', 'autoCalcProximaData()');
      }
      document.getElementById('tarefa-lembrete').value = editing.lembrete || '';
      document.getElementById('tarefa-obs').value = editing.observacoes || '';
      document.getElementById('tarefa-fazer-cada').value = editing.fazerCada || '';
      document.getElementById('tarefa-frequencia').value = editing.frequencia || 'Meses';
      document.getElementById('tarefa-repetir').value = editing.repetir || 'Sempre';
      document.getElementById('tarefa-vezes').value = editing.vezes || '';
      document.getElementById('tarefa-field-vezes').style.display = editing.repetir === 'Por' ? '' : 'none';
      document.getElementById('tarefa-status').checked = (editing.status || 'Ativo') === 'Ativo';
      updateTarefaStatusToggleLabel();
      document.getElementById('tarefa-terceiro').checked = !!editing.realizadoPorTerceiro;
      document.getElementById('tarefa-anexo-obrigatorio').checked = !!editing.anexoObrigatorio;
      const _terceiroSec = document.getElementById('tarefa-terceiro-section');
      if (_terceiroSec) _terceiroSec.style.display = editing.realizadoPorTerceiro ? '' : 'none';
      if (editing.realizadoPorTerceiro) {
        _tarefaSetEmpresaResp(editing.empresaPadrao || '', editing.respPadrao || '');
      }
      setProximaDataDisplay(editing.proximaData || '');
      document.getElementById('tarefa-proxima-data').value = editing.proximaData || '';
      _diasSemanaSelected = [...(editing.diasSemana || [])];
      document.querySelectorAll('.dia-semana-btn').forEach(b => {
        b.classList.toggle('active', _diasSemanaSelected.includes(parseInt(b.dataset.dia)));
      });
      onTarefaFrequenciaChange();

      // Bloquear reativação se concluída por repetições
      const statusSel = document.getElementById('tarefa-status');
      if (editing.autoInativada) {
        statusSel.disabled = true;
        statusSel.title = 'Tarefa concluída automaticamente — não pode ser reativada';
      } else {
        statusSel.disabled = false;
        statusSel.title = '';
      }
    } else if (preRotinaId) {
      // Pré-preenche a partir de uma rotina específica
      const r = state.rotinas.find(r => r.id === preRotinaId);
      if (r) {
        _tarefaSetAtivo(r.equipamentoIdx);
        onTarefaEquipChange();
        document.getElementById('tarefa-rotina-select').value = preRotinaId;
        onTarefaRotinaChange();
      }
      document.getElementById('tarefa-status').disabled = false;
    } else {
      document.getElementById('tarefa-status').disabled = false;
    }

    // Inicializa checklist, toggle de anexo e responsáveis
    checklistTarefaTemp = editing ? JSON.parse(JSON.stringify(editing.checklistTarefa || [])) : [];
    if (!editing) {
      document.getElementById('tarefa-terceiro').checked = false;
      document.getElementById('tarefa-anexo-obrigatorio').checked = false;
      const _sec = document.getElementById('tarefa-terceiro-section');
      if (_sec) _sec.style.display = 'none';
    }
    if (editing?.responsaveis) {
      _tarefaResponsaveis = { usuarios: [...(editing.responsaveis.usuarios || [])], grupos: [...(editing.responsaveis.grupos || [])] };
    }
    _renderResponsaveisChips();
    renderTarefaChecklistBuilder();
    atualizarAbaTarefaChecklist();
    switchTarefaDrawerTab('dados');

    document.getElementById('right-drawer-tarefa').classList.add('open');
    document.getElementById('drawer-backdrop').classList.add('open');
  }

  window.onTarefaTerceiroChange = function () {
    const checked = document.getElementById('tarefa-terceiro').checked;
    const sec = document.getElementById('tarefa-terceiro-section');
    if (sec) sec.style.display = checked ? '' : 'none';
    if (checked) {
      document.getElementById('tarefa-empresa-padrao').value = '';
      _tarefaEmpresaId = null;
      const respInp = document.getElementById('tarefa-resp-padrao');
      respInp.value = '';
      respInp.disabled = true;
      respInp.placeholder = 'Selecione uma empresa primeiro';
    }
  };

  // ── AUTOCOMPLETE EMPRESA/RESPONSÁVEL NO DRAWER DE TAREFA ──
  let _tarefaEmpresaId = null;

  window.tarefaEmpresaFilter = function () {
    const inp = document.getElementById('tarefa-empresa-padrao');
    const dd  = document.getElementById('tarefa-empresa-padrao-dd');
    if (!inp || !dd) return;
    const q = inp.value.toLowerCase();
    const empresas = (typeof empState !== 'undefined' ? empState.empresas : []);
    const matches = q ? empresas.filter(e => e.nome.toLowerCase().includes(q)) : empresas;
    if (matches.length === 0) {
      dd.innerHTML = '<div class="autocomplete-empty">Nenhuma empresa encontrada</div>';
    } else {
      dd.innerHTML = matches.map(e =>
        `<div class="autocomplete-opt" onmousedown="tarefaEmpresaSelect('${e.id}','${e.nome.replace(/'/g,"\\'")}')">
          <div class="autocomplete-opt-name">${e.nome}</div>
          ${e.cnpj ? `<div class="autocomplete-opt-meta">${e.cnpj}</div>` : ''}
        </div>`).join('');
    }
    dd.classList.add('open');
  };

  window.tarefaEmpresaSelect = function (id, nome) {
    _tarefaEmpresaId = id;
    document.getElementById('tarefa-empresa-padrao').value = nome;
    tarefaEmpresaClose();
    const respInp = document.getElementById('tarefa-resp-padrao');
    respInp.value = '';
    respInp.disabled = false;
    respInp.placeholder = 'Pesquisar responsável...';
    tarefaRespClose();
  };

  window.tarefaEmpresaClose = function () {
    document.getElementById('tarefa-empresa-padrao-dd')?.classList.remove('open');
  };

  window.tarefaRespFilter = function () {
    if (!_tarefaEmpresaId) return;
    const inp = document.getElementById('tarefa-resp-padrao');
    const dd  = document.getElementById('tarefa-resp-padrao-dd');
    if (!inp || !dd) return;
    const empresas = (typeof empState !== 'undefined' ? empState.empresas : []);
    const emp = empresas.find(e => e.id === _tarefaEmpresaId);
    const resps = (emp?.responsaveis || []).filter(r => r.ativo !== false);
    const q = inp.value.toLowerCase();
    const matches = q ? resps.filter(r => r.nome.toLowerCase().includes(q) || (r.cargo || '').toLowerCase().includes(q)) : resps;
    if (matches.length === 0) {
      dd.innerHTML = '<div class="autocomplete-empty">Nenhum responsável encontrado</div>';
    } else {
      dd.innerHTML = matches.map(r =>
        `<div class="autocomplete-opt" onmousedown="tarefaRespSelect('${r.nome.replace(/'/g,"\\'")}')">
          <div class="autocomplete-opt-name">${r.nome}</div>
          ${r.cargo ? `<div class="autocomplete-opt-meta">${r.cargo}</div>` : ''}
        </div>`).join('');
    }
    if (typeof empRespAddItemHTML === 'function') dd.innerHTML += empRespAddItemHTML(_tarefaEmpresaId, 'tarefaRespFilter', 'tarefa-resp-padrao');
    dd.classList.add('open');
  };

  window.tarefaRespSelect = function (nome) {
    document.getElementById('tarefa-resp-padrao').value = nome;
    tarefaRespClose();
  };

  window.tarefaRespClose = function () {
    document.getElementById('tarefa-resp-padrao-dd')?.classList.remove('open');
  };

  // ── AUTOCOMPLETE EMPRESA/TÉCNICO NA PUBLICAÇÃO ────────────────
  let _pubEmpresaId = null;

  window.pubEmpresaFilter = function () {
    const inp = document.getElementById('pub-empresa-responsavel');
    const dd  = document.getElementById('pub-empresa-responsavel-dd');
    if (!inp || !dd) return;
    const q = inp.value.toLowerCase();
    const empresas = (typeof empState !== 'undefined' ? empState.empresas : []);
    const matches = q ? empresas.filter(e => e.nome.toLowerCase().includes(q)) : empresas;
    if (matches.length === 0) {
      dd.innerHTML = '<div class="autocomplete-empty">Nenhuma empresa encontrada</div>';
    } else {
      dd.innerHTML = matches.map(e =>
        `<div class="autocomplete-opt" onmousedown="pubEmpresaSelect('${e.id}','${e.nome.replace(/'/g,"\\'")}')">
          <div class="autocomplete-opt-name">${e.nome}</div>
          ${e.cnpj ? `<div class="autocomplete-opt-meta">${e.cnpj}</div>` : ''}
        </div>`).join('');
    }
    dd.classList.add('open');
  };

  window.pubEmpresaSelect = function (id, nome) {
    _pubEmpresaId = id;
    document.getElementById('pub-empresa-responsavel').value = nome;
    pubEmpresaClose();
    const tecInp = document.getElementById('pub-tecnico-responsavel');
    tecInp.value = '';
    tecInp.disabled = false;
    tecInp.placeholder = 'Pesquisar técnico...';
    pubTecnicoClose();
  };

  window.pubEmpresaClose = function () {
    document.getElementById('pub-empresa-responsavel-dd')?.classList.remove('open');
  };

  window.pubTecnicoFilter = function () {
    if (!_pubEmpresaId) return;
    const inp = document.getElementById('pub-tecnico-responsavel');
    const dd  = document.getElementById('pub-tecnico-responsavel-dd');
    if (!inp || !dd) return;
    const empresas = (typeof empState !== 'undefined' ? empState.empresas : []);
    const emp = empresas.find(e => e.id === _pubEmpresaId);
    const resps = (emp?.responsaveis || []).filter(r => r.ativo !== false);
    const q = inp.value.toLowerCase();
    const matches = q ? resps.filter(r => r.nome.toLowerCase().includes(q) || (r.cargo || '').toLowerCase().includes(q)) : resps;
    if (matches.length === 0) {
      dd.innerHTML = '<div class="autocomplete-empty">Nenhum técnico encontrado</div>';
    } else {
      dd.innerHTML = matches.map(r =>
        `<div class="autocomplete-opt" onmousedown="pubTecnicoSelect('${r.nome.replace(/'/g,"\\'")}')">
          <div class="autocomplete-opt-name">${r.nome}</div>
          ${r.cargo ? `<div class="autocomplete-opt-meta">${r.cargo}</div>` : ''}
        </div>`).join('');
    }
    if (typeof empRespAddItemHTML === 'function') dd.innerHTML += empRespAddItemHTML(_pubEmpresaId, 'pubTecnicoFilter', 'pub-tecnico-responsavel');
    dd.classList.add('open');
  };

  window.pubTecnicoSelect = function (nome) {
    document.getElementById('pub-tecnico-responsavel').value = nome;
    pubTecnicoClose();
  };

  window.pubTecnicoClose = function () {
    document.getElementById('pub-tecnico-responsavel-dd')?.classList.remove('open');
  };

  function _pubSetEmpresaTecnico(empresaNome, tecnicoNome) {
    const empresas = (typeof empState !== 'undefined' ? empState.empresas : []);
    const emp = empresas.find(e => e.nome === empresaNome);
    _pubEmpresaId = emp?.id || null;
    document.getElementById('pub-empresa-responsavel').value = empresaNome || '';
    const tecInp = document.getElementById('pub-tecnico-responsavel');
    tecInp.value = tecnicoNome || '';
    tecInp.disabled = !_pubEmpresaId;
    tecInp.placeholder = _pubEmpresaId ? 'Pesquisar técnico...' : 'Selecione uma empresa primeiro';
  }

  // ── AUTOCOMPLETE EMPRESA/TÉCNICO EM EDITAR PUBLICAÇÃO ────────
  let _editPubEmpresaId = null;

  window.editPubEmpresaFilter = function () {
    const inp = document.getElementById('edit-pub-empresa');
    const dd  = document.getElementById('edit-pub-empresa-dd');
    if (!inp || !dd) return;
    const q = inp.value.toLowerCase();
    const empresas = (typeof empState !== 'undefined' ? empState.empresas : []);
    const matches = q ? empresas.filter(e => e.nome.toLowerCase().includes(q)) : empresas;
    if (matches.length === 0) {
      dd.innerHTML = '<div class="autocomplete-empty">Nenhuma empresa encontrada</div>';
    } else {
      dd.innerHTML = matches.map(e =>
        `<div class="autocomplete-opt" onmousedown="editPubEmpresaSelect('${e.id}','${e.nome.replace(/'/g,"\\'")}')">
          <div class="autocomplete-opt-name">${e.nome}</div>
          ${e.cnpj ? `<div class="autocomplete-opt-meta">${e.cnpj}</div>` : ''}
        </div>`).join('');
    }
    dd.classList.add('open');
  };

  window.editPubEmpresaSelect = function (id, nome) {
    _editPubEmpresaId = id;
    document.getElementById('edit-pub-empresa').value = nome;
    editPubEmpresaClose();
    const tecInp = document.getElementById('edit-pub-tecnico');
    tecInp.value = '';
    tecInp.disabled = false;
    tecInp.placeholder = 'Pesquisar técnico...';
    editPubTecnicoClose();
  };

  window.editPubEmpresaClose = function () {
    document.getElementById('edit-pub-empresa-dd')?.classList.remove('open');
  };

  window.editPubTecnicoFilter = function () {
    if (!_editPubEmpresaId) return;
    const inp = document.getElementById('edit-pub-tecnico');
    const dd  = document.getElementById('edit-pub-tecnico-dd');
    if (!inp || !dd) return;
    const empresas = (typeof empState !== 'undefined' ? empState.empresas : []);
    const emp = empresas.find(e => e.id === _editPubEmpresaId);
    const resps = (emp?.responsaveis || []).filter(r => r.ativo !== false);
    const q = inp.value.toLowerCase();
    const matches = q ? resps.filter(r => r.nome.toLowerCase().includes(q) || (r.cargo || '').toLowerCase().includes(q)) : resps;
    if (matches.length === 0) {
      dd.innerHTML = '<div class="autocomplete-empty">Nenhum técnico encontrado</div>';
    } else {
      dd.innerHTML = matches.map(r =>
        `<div class="autocomplete-opt" onmousedown="editPubTecnicoSelect('${r.nome.replace(/'/g,"\\'")}')">
          <div class="autocomplete-opt-name">${r.nome}</div>
          ${r.cargo ? `<div class="autocomplete-opt-meta">${r.cargo}</div>` : ''}
        </div>`).join('');
    }
    if (typeof empRespAddItemHTML === 'function') dd.innerHTML += empRespAddItemHTML(_editPubEmpresaId, 'editPubTecnicoFilter', 'edit-pub-tecnico');
    dd.classList.add('open');
  };

  window.editPubTecnicoSelect = function (nome) {
    document.getElementById('edit-pub-tecnico').value = nome;
    editPubTecnicoClose();
  };

  window.editPubTecnicoClose = function () {
    document.getElementById('edit-pub-tecnico-dd')?.classList.remove('open');
  };

  function _editPubSetEmpresaTecnico(empresaNome, tecnicoNome) {
    const empresas = (typeof empState !== 'undefined' ? empState.empresas : []);
    const emp = empresas.find(e => e.nome === empresaNome);
    _editPubEmpresaId = emp?.id || null;
    document.getElementById('edit-pub-empresa').value = empresaNome || '';
    const tecInp = document.getElementById('edit-pub-tecnico');
    tecInp.value = tecnicoNome || '';
    tecInp.disabled = !_editPubEmpresaId;
    tecInp.placeholder = _editPubEmpresaId ? 'Pesquisar técnico...' : 'Selecione uma empresa primeiro';
  }

  // Preenche os campos de autocomplete ao editar tarefa existente
  function _tarefaSetEmpresaResp(empresaNome, respNome) {
    const empresas = (typeof empState !== 'undefined' ? empState.empresas : []);
    const emp = empresas.find(e => e.nome === empresaNome);
    _tarefaEmpresaId = emp?.id || null;
    document.getElementById('tarefa-empresa-padrao').value = empresaNome || '';
    const respInp = document.getElementById('tarefa-resp-padrao');
    respInp.value = respNome || '';
    respInp.disabled = !_tarefaEmpresaId;
    respInp.placeholder = _tarefaEmpresaId ? 'Pesquisar responsável...' : 'Selecione uma empresa primeiro';
  }

  function updateTarefaStatusToggleLabel() {
    const toggle = document.getElementById('tarefa-status');
    const label = document.getElementById('tarefa-status-label');
    if (!toggle || !label) return;
    label.textContent = toggle.checked ? 'Ativo' : 'Inativo';
  }

  // ── ABAS DO DRAWER DE TAREFA ──
  function switchTarefaDrawerTab(tab) {
    ['dados','checklist'].forEach(t => {
      document.getElementById('dtab-tarefa-' + t).classList.toggle('active', t === tab);
      document.getElementById('dtab-tarefa-btn-' + t).classList.toggle('active', t === tab);
    });
  }

  // ── CHECKLIST DA TAREFA ──
  let checklistTarefaTemp = [];

  function addTarefaChecklistItem() {
    const input = document.getElementById('tarefa-checklist-novo-item');
    const texto = input.value.trim();
    if (!texto) return;
    checklistTarefaTemp.push({ id: uid(), texto, comentarioObrigatorio: false, loteAtivo: false, lote: '', validade: '' });
    input.value = '';
    renderTarefaChecklistBuilder();
    atualizarAbaTarefaChecklist();
  }

  function removeTarefaChecklistItem(id) {
    checklistTarefaTemp = checklistTarefaTemp.filter(i => i.id !== id);
    renderTarefaChecklistBuilder();
    atualizarAbaTarefaChecklist();
  }

  async function editTarefaChecklistItem(id) {
    const item = checklistTarefaTemp.find(i => i.id === id);
    if (!item) return;
    const novoTexto = await uiPrompt({ icone: 'editar', titulo: 'Editar item do checklist', valor: item.texto, placeholder: 'Texto do item' });
    if (novoTexto === null) return;
    const t = novoTexto.trim();
    if (!t) return;
    item.texto = t;
    renderTarefaChecklistBuilder();
  }

  function toggleTarefaChecklistComentario(id) {
    const item = checklistTarefaTemp.find(i => i.id === id);
    if (!item) return;
    item.comentarioObrigatorio = !item.comentarioObrigatorio;
    renderTarefaChecklistBuilder();
  }

  function toggleTarefaChecklistLote(id) {
    const item = checklistTarefaTemp.find(i => i.id === id);
    if (!item) return;
    item.loteAtivo = !item.loteAtivo;
    if (!item.loteAtivo) { item.lote = ''; item.validade = ''; }
    renderTarefaChecklistBuilder();
    if (item.loteAtivo) document.getElementById('checklist-lote-input-' + id)?.focus();
  }

  function updateTarefaChecklistLote(id, field, value) {
    const item = checklistTarefaTemp.find(i => i.id === id);
    if (!item) return;
    item[field] = value;
  }

  function renderTarefaChecklistBuilder() {
    const container = document.getElementById('tarefa-checklist-builder');
    if (!container) return;
    if (checklistTarefaTemp.length === 0) {
      container.innerHTML = `<div class="checklist-empty-tip">Nenhum item adicionado.</div>`;
      return;
    }
    container.innerHTML = checklistTarefaTemp.map((item, i) => {
      const loteAtivo = !!item.loteAtivo;
      return `
      <div class="checklist-item-wrap">
        <div class="checklist-item-row">
          <div class="checklist-item-num">${i + 1}</div>
          <div class="checklist-item-text">${item.texto}</div>
          <button class="checklist-item-del checklist-lote-toggle${loteAtivo ? ' active' : ''}" onclick="toggleTarefaChecklistLote('${item.id}')" title="${loteAtivo ? 'Lote ativo (clique para desativar)' : 'Ativar controle de Lote e Validade'}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:14px;height:14px;"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-4 0v2"/><path d="M8 7V5a2 2 0 00-4 0v2"/></svg>
          </button>
          <button class="checklist-item-del checklist-coment-toggle${item.comentarioObrigatorio ? ' active' : ''}" onclick="toggleTarefaChecklistComentario('${item.id}')" title="${item.comentarioObrigatorio ? 'Comentário obrigatório (clique para remover)' : 'Marcar como comentário obrigatório'}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          </button>
          <button class="checklist-item-del" onclick="editTarefaChecklistItem('${item.id}')" title="Editar" style="color:var(--cyan);">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="width:13px;height:13px;"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
          </button>
          <button class="checklist-item-del" onclick="removeTarefaChecklistItem('${item.id}')" title="Remover">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div id="checklist-lote-row-${item.id}" class="checklist-lote-row" style="display:${loteAtivo ? '' : 'none'};">
          <div class="checklist-lote-fields">
            <div class="checklist-lote-field-wrap">
              <label class="checklist-lote-label">Lote</label>
              <input type="text" id="checklist-lote-input-${item.id}" class="checklist-lote-input" placeholder="Nº do lote..." value="${item.lote || ''}" oninput="updateTarefaChecklistLote('${item.id}','lote',this.value)">
            </div>
            <div class="checklist-lote-field-wrap">
              <label class="checklist-lote-label">Validade</label>
              <input type="date" id="checklist-val-input-${item.id}" class="checklist-lote-input" value="${item.validade || ''}" oninput="updateTarefaChecklistLote('${item.id}','validade',this.value)">
            </div>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  function atualizarAbaTarefaChecklist() {
    const labelEl = document.getElementById('dtab-tarefa-checklist-label');
    if (!labelEl) return;
    const n = checklistTarefaTemp.length;
    labelEl.textContent = n > 0 ? `Checklist da Tarefa (${n})` : 'Checklist da Tarefa';
  }

  function closeTarefaDrawer() {
    document.getElementById('right-drawer-tarefa').classList.remove('open');
    document.getElementById('drawer-backdrop').classList.remove('open');
  }

  function closeAllDrawers() {
    closeRotinaDrawer();
    closeTarefaDrawer();
  }

  function _tarefaSetAtivo(idx) {
    const a = state.ativos[idx];
    if (a == null) return;
    document.getElementById('tarefa-equip-select').value = idx;
    document.getElementById('tarefa-equip-input').value = `${a.nome} — ${a.codigo}`;
    document.getElementById('tarefa-equip-dropdown').style.display = 'none';
  }

  function _tarefaEquipRenderDropdown(items) {
    const dd = document.getElementById('tarefa-equip-dropdown');
    if (!items.length) { dd.style.display = 'none'; return; }
    dd.innerHTML = items.map(({ idx, a }) =>
      `<div class="ativo-search-item" onmousedown="event.preventDefault();_tarefaSetAtivo(${idx});onTarefaEquipChange();" >${a.nome} — ${a.codigo}</div>`
    ).join('');
    dd.style.display = '';
  }

  function onTarefaEquipSearch() {
    const q = document.getElementById('tarefa-equip-input').value.toLowerCase();
    document.getElementById('tarefa-equip-select').value = '';
    const matches = state.ativos
      .map((a, idx) => ({ idx, a }))
      .filter(({ a }) => a && (`${a.nome} ${a.codigo}`).toLowerCase().includes(q))
      .sort((x, y) => {
        const sa = _orgChaveOrdemAtivo(x.a), sb = _orgChaveOrdemAtivo(y.a);
        if (sa !== sb) return sa < sb ? -1 : 1;
        const ca = (x.a.codigo || '').toLowerCase(), cb = (y.a.codigo || '').toLowerCase();
        return ca < cb ? -1 : ca > cb ? 1 : 0;
      })
      .slice(0, 50);
    _tarefaEquipRenderDropdown(matches);
  }

  function onTarefaEquipFocus() {
    const cur = document.getElementById('tarefa-equip-select').value;
    if (cur !== '') return;
    const matches = state.ativos
      .map((a, idx) => ({ idx, a }))
      .filter(({ a }) => a)
      .sort((x, y) => {
        const sa = _orgChaveOrdemAtivo(x.a), sb = _orgChaveOrdemAtivo(y.a);
        if (sa !== sb) return sa < sb ? -1 : 1;
        const ca = (x.a.codigo || '').toLowerCase(), cb = (y.a.codigo || '').toLowerCase();
        return ca < cb ? -1 : ca > cb ? 1 : 0;
      })
      .slice(0, 50);
    _tarefaEquipRenderDropdown(matches);
  }

  function onTarefaEquipBlur() {
    setTimeout(() => { document.getElementById('tarefa-equip-dropdown').style.display = 'none'; }, 150);
  }

  function onTarefaEquipChange() {
    const equipIdx = parseInt(document.getElementById('tarefa-equip-select').value || '');
    const rotSel = document.getElementById('tarefa-rotina-select');
    document.getElementById('tarefa-rotina-info').style.display = 'none';
    setProximaDataDisplay('');

    if (isNaN(equipIdx)) {
      rotSel.innerHTML = '<option value="">Selecione a rotina...</option>';
      return;
    }
    const rotinas = state.rotinas.filter(r => r.equipamentoIdx === equipIdx);
    rotSel.innerHTML = '<option value="">Selecione a rotina...</option>' +
      rotinas.map(r => `<option value="${r.id}">${r.nome} (${r.tipo})</option>`).join('');
  }

  function onTarefaRotinaChange() {
    const rotinaId = document.getElementById('tarefa-rotina-select').value;
    const infoBox  = document.getElementById('tarefa-rotina-info');

    if (!rotinaId) { infoBox.style.display = 'none'; return; }

    const r = state.rotinas.find(r => r.id === rotinaId);
    if (!r) return;
    const ativo  = state.ativos[r.equipamentoIdx];
    document.getElementById('tinfo-tipo').textContent  = r.tipo;
    document.getElementById('tinfo-setor').textContent = _orgRotuloAtivo(ativo) || '—';
    document.getElementById('tinfo-cat').textContent   = ativo?.categoria || '—';

    infoBox.style.display = '';
  }

  let _diasSemanaSelected = [];

  // ── RASTREABILIDADE DE EDIÇÕES ──
  let _rastreabilidadeCtx = null; // { tipo: 'ativo'|'rotina'|'tarefa', id }

  // Campos a ignorar no diff (internos/não editáveis pelo usuário)
  const _DIFF_IGNORE = new Set(['_historico','id','autoInativada','proximaData','status','equipamentoId']);

  // Rótulos legíveis para cada campo
  const _FIELD_LABELS = {
    nome:'Nome', titulo:'Título', tipo:'Tipo', equipamentoIdx:'Equipamento',
    setor:'Setor', ambienteId:'Ambiente', setoresCompartilhados:'Setores compartilhados', categoria:'Categoria', marca:'Marca', modelo:'Modelo',
    serie:'Nº de Série', nota:'Observações',
    codigo:'Código', frequencia:'Frequência', fazerCada:'Fazer a cada',
    repetir:'Repetir', vezes:'Vezes', lembrete:'Lembrete', dataTarefa:'Data da Tarefa',
    observacoes:'Observações', anexoObrigatorio:'Exigir Anexo',
    checklistTarefa:'Checklist da Tarefa',
    responsaveis:'Responsáveis', diasSemana:'Dias da Semana'
  };

  function _diffObj(anterior, atual) {
    const diffs = [];
    const keys = new Set([...Object.keys(anterior || {}), ...Object.keys(atual || {})]);
    for (const k of keys) {
      if (_DIFF_IGNORE.has(k)) continue;
      // Setor com unidade: registrado pelo setorId ("NTO · Hematologia"), sem duplicar o nome
      if (k === 'setor' && (anterior?.setorId || atual?.setorId)) continue;
      if (k === 'setorId') {
        const rA = anterior?.setorId ? _orgRotuloSetor(anterior.setorId) : (anterior?.setor || '');
        const rB = atual?.setorId ? _orgRotuloSetor(atual.setorId) : (atual?.setor || '');
        if (rA !== rB) diffs.push({ campo: 'Unidade · Setor', antes: rA || '—', depois: rB || '—' });
        continue;
      }
      if (k === 'setoresCompartilhados') {
        const nomes = v => (Array.isArray(v) ? v : []).map(id => _orgSetor(id)?.nome || id).sort().join(', ');
        const rA = nomes(anterior?.[k]), rB = nomes(atual?.[k]);
        if (rA !== rB) diffs.push({ campo: 'Setores compartilhados', antes: rA || '—', depois: rB || '—' });
        continue;
      }
      if (k === 'ambienteId') {
        const rA = _orgRotuloAmbiente(anterior?.ambienteId), rB = _orgRotuloAmbiente(atual?.ambienteId);
        if ((anterior?.ambienteId || '') !== (atual?.ambienteId || '')) diffs.push({ campo: 'Ambiente', antes: rA || '—', depois: rB || '—' });
        continue;
      }
      const vA = JSON.stringify(anterior?.[k] ?? null);
      const vB = JSON.stringify(atual?.[k]     ?? null);
      if (vA === vB) continue;
      diffs.push({
        campo: _FIELD_LABELS[k] || k,
        antes: _formatDiffVal(anterior?.[k]),
        depois: _formatDiffVal(atual?.[k])
      });
    }
    return diffs;
  }

  function _formatDiffVal(v) {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
    if (Array.isArray(v)) {
      if (v.length === 0) return '—';
      if (typeof v[0] === 'object' && v[0]?.texto) return v.map(i => i.texto).join(', ');
      return v.join(', ');
    }
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  function _registrarEdicao(objNovo, objAnterior) {
    const sess = typeof currentSession !== 'undefined' ? currentSession : null;
    const isNew = !objAnterior || (objAnterior._historico || []).length === 0;
    const entrada = {
      ts:       new Date().toISOString(),
      userId:   sess?.userId       || null,
      userName: sess?.nomeCompleto || sess?.username || 'Sistema',
      isNew,
      diffs: isNew ? [] : _diffObj(objAnterior, objNovo)
    };
    if (!Array.isArray(objNovo._historico)) objNovo._historico = [];
    objNovo._historico.unshift(entrada);
  }

  function openRastreabilidadeModal(tipo) {
    let obj = null;
    let nome = '';
    let titleLabel = 'Rastreabilidade de Edições';

    if (tipo === 'ativo') {
      obj  = ativoEdicaoIndex !== null ? state.ativos[ativoEdicaoIndex] : null;
      nome = obj?.nome || 'Ativo';
    } else if (tipo === 'ativo-view') {
      obj  = ativoEdicaoIndex !== null ? state.ativos[ativoEdicaoIndex] : null;
      nome = obj?.nome || 'Ativo';
    } else if (tipo === 'rotina') {
      obj  = rotinaEdicaoId ? state.rotinas.find(r => r.id === rotinaEdicaoId) : null;
      nome = obj?.nome || 'Rotina';
    } else if (tipo === 'rotina-view') {
      obj  = rotinaViewId ? state.rotinas.find(r => r.id === rotinaViewId) : null;
      nome = obj?.nome || 'Rotina';
    } else if (tipo === 'tarefa') {
      obj  = tarefaEdicaoId ? state.tarefas.find(t => t.id === tarefaEdicaoId) : null;
      nome = obj?.titulo || obj?.nome || 'Tarefa';
    } else if (tipo === 'tarefa-view') {
      obj  = tarefaDetalheId ? state.tarefas.find(t => t.id === tarefaDetalheId) : null;
      nome = obj?.titulo || 'Tarefa';
    } else if (tipo === 'pub-view') {
      const pub = arqBuscarPublicacao(_pubViewId);
      if (pub) {
        titleLabel = 'Informações da Publicação';
        const t = state.tarefas.find(t => t.id === pub.tarefaId);
        nome = t?.titulo || 'Atividade';
        const dataStr = pub.dataPublicacao ? new Date(pub.dataPublicacao).toLocaleDateString('pt-BR') : '—';
        const porNome = pub.publicadoPorNome || '—';
        const listEl2 = document.getElementById('rastreabilidade-list');
        const titleEl2 = document.getElementById('rastreabilidade-title');
        const subtitleEl2 = document.getElementById('rastreabilidade-subtitle');
        if (titleEl2) titleEl2.textContent = titleLabel;
        if (subtitleEl2) subtitleEl2.textContent = nome;
        if (listEl2) listEl2.innerHTML = `
          <div style="display:flex;align-items:flex-start;gap:12px;padding:14px 16px;border-bottom:1px solid var(--border);">
            <div style="width:32px;height:32px;border-radius:50%;background:rgba(0,180,216,.12);border:1.5px solid var(--cyan);
              display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--cyan);">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;">
                <path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/>
              </svg>
            </div>
            <div>
              <div style="font-size:12.5px;font-weight:700;color:var(--text-primary);">${porNome}</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Publicação · ${dataStr}</div>
            </div>
          </div>`;
        openModal('modal-rastreabilidade');
        return;
      }
    }

    const titleEl    = document.getElementById('rastreabilidade-title');
    const subtitleEl = document.getElementById('rastreabilidade-subtitle');
    const listEl     = document.getElementById('rastreabilidade-list');
    if (titleEl)    titleEl.textContent    = titleLabel;
    if (subtitleEl) subtitleEl.textContent = nome;

    const hist = obj?._historico || [];
    if (hist.length === 0) {
      listEl.innerHTML = `<div class="data-table-empty" style="padding:28px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <strong>Nenhuma edição registrada</strong>
        <p>O histórico aparece após salvar alterações</p>
      </div>`;
    } else {
      listEl.innerHTML = hist.map((h, i) => {
        const dt   = new Date(h.ts);
        const data = dt.toLocaleDateString('pt-BR');
        const hora = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const isCreation = h.isNew || i === hist.length - 1;
        const label = isCreation ? 'Criação' : 'Edição';
        const isLatest = i === 0;
        const accent  = isCreation ? 'var(--amber)' : isLatest ? 'var(--cyan)' : 'var(--border)';
        const accentBg = isCreation ? 'rgba(255,183,3,.1)' : isLatest ? 'rgba(0,180,216,.1)' : 'var(--bg)';
        const iconSvg  = isCreation
          ? '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'
          : '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/>';
        const diffs = h.diffs || [];
        const diffsHtml = diffs.length === 0 ? '' : `
          <div style="margin-top:8px;display:flex;flex-direction:column;gap:4px;">
            ${diffs.map(d => `
              <div style="font-size:11.5px;">
                <span style="font-weight:700;color:var(--text-secondary);">${d.campo}:</span>
                <span style="background:rgba(230,57,70,.12);color:#e63946;border-radius:4px;padding:1px 5px;margin-left:4px;text-decoration:line-through;">${d.antes}</span>
                <span style="font-size:10px;color:var(--text-muted);margin:0 3px;">→</span>
                <span style="background:rgba(42,157,143,.12);color:#2a9d8f;border-radius:4px;padding:1px 5px;">${d.depois}</span>
              </div>`).join('')}
          </div>`;
        return `<div style="display:flex;align-items:flex-start;gap:12px;padding:14px 16px;border-bottom:1px solid var(--border);">
          <div style="width:32px;height:32px;border-radius:50%;background:${accentBg};border:1.5px solid ${accent};
            display:flex;align-items:center;justify-content:center;flex-shrink:0;color:${accent};margin-top:1px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;">${iconSvg}</svg>
          </div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="font-size:12.5px;font-weight:700;color:var(--text-primary);">${h.userName}</span>
              <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;
                color:${isCreation?'var(--amber)':isLatest?'var(--cyan)':'var(--text-muted)'};">${label}</span>
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${data} às ${hora}</div>
            ${diffsHtml}
          </div>
        </div>`;
      }).join('');
    }

    openModal('modal-rastreabilidade');
  }

  // ── RESPONSÁVEIS DA TAREFA ──
  let _tarefaResponsaveis = { usuarios: [], grupos: [] };

  function filterResponsaveisSearch() {
    const input = document.getElementById('resp-search-input');
    const dropdown = document.getElementById('resp-search-dropdown');
    if (!input || !dropdown) return;
    const q = input.value.trim().toLowerCase();

    const usuarios = (typeof authState !== 'undefined' ? authState.users : [])
      .filter(u => u.ativo !== false && !_tarefaResponsaveis.usuarios.includes(u.id));
    const grupos = (typeof authState !== 'undefined' ? authState.groups : [])
      .filter(g => !_tarefaResponsaveis.grupos.includes(g.id));

    const matchU = q ? usuarios.filter(u =>
      u.nomeCompleto.toLowerCase().includes(q) || (u.username||'').toLowerCase().includes(q) || (u.cargo||'').toLowerCase().includes(q)
    ) : usuarios;
    const matchG = q ? grupos.filter(g => g.nome.toLowerCase().includes(q)) : grupos;

    if (matchU.length === 0 && matchG.length === 0) {
      dropdown.innerHTML = `<div class="autocomplete-empty">Nenhum resultado encontrado</div>`;
      dropdown.classList.add('open');
      return;
    }

    let html = '';
    if (matchG.length > 0) {
      html += `<div class="autocomplete-section-label">Grupos</div>`;
      html += matchG.map(g => `
        <div class="autocomplete-item" onmousedown="addResponsavel('grupo','${g.id}')">
          <div class="resp-item-icon resp-icon-grupo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
            </svg>
          </div>
          <div>
            <div style="font-size:13px;font-weight:600;">${g.nome}</div>
            <div style="font-size:11px;color:var(--text-muted);">Grupo</div>
          </div>
        </div>`).join('');
    }
    if (matchU.length > 0) {
      html += `<div class="autocomplete-section-label">Usuários</div>`;
      html += matchU.map(u => `
        <div class="autocomplete-item" onmousedown="addResponsavel('usuario','${u.id}')">
          <div class="resp-item-icon resp-icon-user">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <div>
            <div style="font-size:13px;font-weight:600;">${u.nomeCompleto}</div>
            <div style="font-size:11px;color:var(--text-muted);">${u.cargo || u.username || ''}</div>
          </div>
        </div>`).join('');
    }

    dropdown.innerHTML = html;
    dropdown.classList.add('open');
  }

  function closeResponsaveisDropdown() {
    const dd = document.getElementById('resp-search-dropdown');
    if (dd) dd.classList.remove('open');
  }

  function addResponsavel(tipo, id) {
    if (tipo === 'usuario' && !_tarefaResponsaveis.usuarios.includes(id)) {
      _tarefaResponsaveis.usuarios.push(id);
    } else if (tipo === 'grupo' && !_tarefaResponsaveis.grupos.includes(id)) {
      _tarefaResponsaveis.grupos.push(id);
    }
    const input = document.getElementById('resp-search-input');
    if (input) input.value = '';
    closeResponsaveisDropdown();
    _renderResponsaveisChips();
  }

  function removeResponsavel(tipo, id) {
    if (tipo === 'usuario') _tarefaResponsaveis.usuarios = _tarefaResponsaveis.usuarios.filter(x => x !== id);
    else _tarefaResponsaveis.grupos = _tarefaResponsaveis.grupos.filter(x => x !== id);
    _renderResponsaveisChips();
  }

  function _renderResponsaveisChips() {
    const chips = document.getElementById('responsaveis-chips');
    if (!chips) return;
    const usuarios = (typeof authState !== 'undefined' ? authState.users : []);
    const grupos   = (typeof authState !== 'undefined' ? authState.groups : []);
    const total = _tarefaResponsaveis.usuarios.length + _tarefaResponsaveis.grupos.length;
    if (total === 0) { chips.innerHTML = ''; return; }

    chips.innerHTML = [
      ..._tarefaResponsaveis.grupos.map(id => {
        const g = grupos.find(g => g.id === id);
        return g ? `<span class="resp-chip resp-chip-grupo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px;flex-shrink:0;">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
          </svg>
          ${g.nome}
          <button class="resp-chip-remove" onmousedown="removeResponsavel('grupo','${id}')" title="Remover">&times;</button>
        </span>` : '';
      }),
      ..._tarefaResponsaveis.usuarios.map(id => {
        const u = usuarios.find(u => u.id === id);
        return u ? `<span class="resp-chip resp-chip-user">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px;flex-shrink:0;">
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
          </svg>
          ${u.nomeCompleto}
          <button class="resp-chip-remove" onmousedown="removeResponsavel('usuario','${id}')" title="Remover">&times;</button>
        </span>` : '';
      })
    ].join('');
  }

  function toggleDiaSemana(dia) {
    const idx = _diasSemanaSelected.indexOf(dia);
    if (idx >= 0) _diasSemanaSelected.splice(idx, 1);
    else _diasSemanaSelected.push(dia);
    document.querySelectorAll('.dia-semana-btn').forEach(btn => {
      btn.classList.toggle('active', _diasSemanaSelected.includes(parseInt(btn.dataset.dia)));
    });
    autoCalcProximaData();
  }

  function onTarefaFrequenciaChange() {
    const freq = document.getElementById('tarefa-frequencia')?.value;
    const isSempre    = freq === 'Sempre';
    const isDiaSemana = freq === 'DiaDaSemana';

    const lembreteField  = document.getElementById('tarefa-lembrete-field');
    const proximaField   = document.getElementById('tarefa-proxima-field');
    const fazerCadaField = document.getElementById('tarefa-fazer-cada-field');
    const diasField      = document.getElementById('tarefa-dias-semana-field');
    const repetirRow     = document.getElementById('tarefa-repetir-row');

    // Lembrete e próxima data — ocultos quando Sempre
    if (lembreteField) lembreteField.style.display = isSempre ? 'none' : '';
    if (proximaField)  proximaField.style.display  = isSempre ? 'none' : '';

    // Campos dentro da seção de recorrência — o dropdown de Frequência SEMPRE visível
    if (fazerCadaField) fazerCadaField.style.display = (isSempre || isDiaSemana) ? 'none' : '';
    if (diasField)      diasField.style.display      = isDiaSemana ? '' : 'none';
    if (repetirRow)     repetirRow.style.display     = isSempre ? 'none' : '';

    autoCalcProximaData();
  }

  function autoCalcProximaData() {
    const data      = document.getElementById('tarefa-data').value;
    const frequencia = document.getElementById('tarefa-frequencia')?.value;

    if (frequencia === 'Sempre') { setProximaDataDisplay(''); return; }

    if (frequencia === 'DiaDaSemana') {
      if (!data || _diasSemanaSelected.length === 0) { setProximaDataDisplay(''); return; }
      const proxima = calcProximaDataDiaSemana(data, _diasSemanaSelected);
      document.getElementById('tarefa-proxima-data').value = proxima;
      setProximaDataDisplay(proxima);
      return;
    }

    const fazerCada = parseInt(document.getElementById('tarefa-fazer-cada')?.value);
    if (!data || !fazerCada || !frequencia) { setProximaDataDisplay(''); return; }
    const proxima = calcProximaData(data, { fazerCada, frequencia });
    document.getElementById('tarefa-proxima-data').value = proxima;
    setProximaDataDisplay(proxima);
  }

  function calcProximaDataDiaSemana(dataBase, dias) {
    const base = new Date(dataBase + 'T00:00:00');
    const sorted = [...dias].sort((a, b) => a - b);
    let proxima = new Date(base);
    proxima.setDate(proxima.getDate() + 1); // dia seguinte ao base
    for (let i = 0; i < 7; i++) {
      if (sorted.includes(proxima.getDay())) break;
      proxima.setDate(proxima.getDate() + 1);
    }
    return proxima.toISOString().split('T')[0];
  }

  function setProximaDataDisplay(val) {
    const el = document.getElementById('tarefa-proxima-display');
    if (!el) return;
    if (val) {
      el.classList.add('filled');
      el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${formatDate(val)}`;
    } else {
      el.classList.remove('filled');
      el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>Calculado automaticamente`;
    }
  }

  function saveTarefa() {
    const isNew = !tarefaEdicaoId;
    if (isNew && !_can('tarefas.criar'))  { showToast('Sem permissão para criar tarefas.', 'error'); return; }
    if (!isNew && !_can('tarefas.editar')) { showToast('Sem permissão para editar tarefas.', 'error'); return; }
    const titulo     = document.getElementById('tarefa-titulo').value.trim();
    const equipIdx   = parseInt(document.getElementById('tarefa-equip-select').value);
    const rotinaId   = document.getElementById('tarefa-rotina-select').value;
    const data       = document.getElementById('tarefa-data').value;
    const _lembreteRaw = document.getElementById('tarefa-lembrete').value;
    const lembrete = (_lembreteRaw === '' || _lembreteRaw === null) ? null : (parseInt(_lembreteRaw, 10) >= 0 ? parseInt(_lembreteRaw, 10) : null);
    const proxima    = document.getElementById('tarefa-proxima-data').value;
    const status     = document.getElementById('tarefa-status').checked ? 'Ativo' : 'Inativo';
    const obs        = document.getElementById('tarefa-obs').value.trim();
    const frequencia = document.getElementById('tarefa-frequencia').value;
    const isSempre   = frequencia === 'Sempre';
    const isDiaSemana = frequencia === 'DiaDaSemana';
    const fazerCada  = isSempre || isDiaSemana ? null : parseInt(document.getElementById('tarefa-fazer-cada').value);
    const repetir    = isSempre ? 'Sempre' : document.getElementById('tarefa-repetir').value;
    const vezes      = (!isSempre && repetir === 'Por') ? parseInt(document.getElementById('tarefa-vezes').value) : null;
    const diasSemana = isDiaSemana ? [..._diasSemanaSelected] : [];
    const realizadoPorTerceiro = document.getElementById('tarefa-terceiro').checked;
    const empresaPadrao = realizadoPorTerceiro ? (document.getElementById('tarefa-empresa-padrao')?.value.trim() || '') : '';
    const respPadrao    = realizadoPorTerceiro ? (document.getElementById('tarefa-resp-padrao')?.value.trim()    || '') : '';
    const anexoObrigatorio = document.getElementById('tarefa-anexo-obrigatorio').checked;

    if (!titulo)            { showToast('Informe o título da tarefa.', 'error'); return; }
    if (isNaN(equipIdx))    { showToast('Selecione o equipamento.', 'error'); return; }
    if (!rotinaId)          { showToast('Selecione a rotina.', 'error'); return; }
    if (!data)              { showToast('Informe a data da tarefa.', 'error'); return; }
    if (!isSempre && !isDiaSemana && (!fazerCada || fazerCada < 1)) { showToast('Informe o valor de "Fazer a cada".', 'error'); return; }
    if (isDiaSemana && diasSemana.length === 0) { showToast('Selecione pelo menos um dia da semana.', 'error'); return; }
    if (!isSempre && repetir === 'Por' && (!vezes || vezes < 1)) { showToast('Informe a quantidade de vezes.', 'error'); return; }

    // Bloquear reativação de tarefa auto-inativada por conclusão de repetições
    const existente = tarefaEdicaoId ? state.tarefas.find(t => t.id === tarefaEdicaoId) : null;
    if (existente?.autoInativada && status === 'Ativo') {
      showToast('Esta tarefa foi concluída e não pode ser reativada.', 'error');
      return;
    }

    const tarefa = {
      id: tarefaEdicaoId || uid(),
      titulo, equipamentoIdx: equipIdx, equipamentoId: state.ativos[equipIdx]?.id || null,
      rotinaId, dataTarefa: data,
      fazerCada, frequencia, repetir, vezes, diasSemana,
      proximaData: isSempre ? null : proxima,
      lembrete: isSempre ? null : lembrete,
      status, observacoes: obs,
      checklistTarefa: checklistTarefaTemp.slice(),
      anexoObrigatorio, realizadoPorTerceiro, empresaPadrao, respPadrao,
      responsaveis: { usuarios: [..._tarefaResponsaveis.usuarios], grupos: [..._tarefaResponsaveis.grupos] },
      autoInativada: existente?.autoInativada || false,
      _historico: existente?._historico || []
    };

    _registrarEdicao(tarefa, existente);
    if (tarefaEdicaoId) {
      const idx = state.tarefas.findIndex(t => t.id === tarefaEdicaoId);
      if (idx >= 0) state.tarefas[idx] = tarefa;
    } else {
      state.tarefas.push(tarefa);
    }
    saveState();
    closeTarefaDrawer();
    showToast(tarefaEdicaoId ? 'Tarefa atualizada!' : 'Tarefa cadastrada!', 'success');
  }

  // ══════════════════════════════════════════
  // ── TABELA DE TAREFAS ──
  // ══════════════════════════════════════════
  function renderTarefasTable(page) {
    if (page !== undefined) _tarefasPage = page;
    const tbody = document.getElementById('tarefas-tbody');
    if (!tbody) return;

    const fAtivoIdx  = state._ativoFiltroTarefasIdx ?? null;
    const fRotinaId  = state._rotinaFiltroTarefasId ?? null;
    const fSetor     = document.getElementById('filter-setor-rotina-val')?.value || '';
    const fTabSetor  = typeof _getTabFiltroVal === 'function' ? _getTabFiltroVal('tarefas','setor') : '';
    const fTabUnidade = typeof _getTabFiltroVal === 'function' ? _getTabFiltroVal('tarefas','unidade') : '';
    const fUnidade   = document.getElementById('filter-unidade-rotina-val')?.value || '';
    const fTabCat    = typeof _getTabFiltroVal === 'function' ? _getTabFiltroVal('tarefas','cat')   : '';
    const fTabTipo   = typeof _getTabFiltroTipo === 'function' ? _getTabFiltroTipo('tarefas')       : '';
    const _sess = typeof currentSession !== 'undefined' ? currentSession : null;
    const { col: tSCol, dir: tSDir } = _tarefasSort;
    const allList = state.tarefas.filter(t => {
      const ativo = state.ativos[t.equipamentoIdx];
      if (!ativo) return false;
      if (typeof _userCanSeeAtivo === 'function' && !_userCanSeeAtivo(ativo)) return false;
      if (!_orgAtivoPassa(ativo, fUnidade, fSetor)) return false;
      if (!_orgAtivoPassa(ativo, fTabUnidade, fTabSetor)) return false;
      if (fTabCat   && ativo.categoria !== fTabCat) return false;
      if (fTabTipo) {
        const rotina = state.rotinas.find(r => r.id === t.rotinaId);
        if (!rotina || rotina.tipo !== fTabTipo) return false;
      }
      if (fAtivoIdx !== null && t.equipamentoIdx !== fAtivoIdx) return false;
      if (fRotinaId !== null && t.rotinaId !== fRotinaId) return false;
      if (_minhasTarefasAtivo && _sess) {
        const resp = t.responsaveis || { usuarios: [], grupos: [] };
        const myUser = resp.usuarios.includes(_sess.userId);
        const myGroup = _sess.grupoId && resp.grupos.includes(_sess.grupoId);
        if (!myUser && !myGroup) return false;
      }
      return tarefaPassesStatusFilter(t, 'main');
    }).sort((a, b) => {
      let ka, kb;
      if (tSCol === 'rotina') {
        const ra = state.rotinas.find(r => r.id === a.rotinaId);
        const rb = state.rotinas.find(r => r.id === b.rotinaId);
        ka = ra?.nome?.toLowerCase() || ''; kb = rb?.nome?.toLowerCase() || '';
      } else if (tSCol === 'equipamento') {
        ka = state.ativos[a.equipamentoIdx]?.nome?.toLowerCase() || '';
        kb = state.ativos[b.equipamentoIdx]?.nome?.toLowerCase() || '';
      } else if (tSCol === 'dataTarefa') {
        ka = a.dataTarefa || ''; kb = b.dataTarefa || '';
      } else if (tSCol === 'proximaData') {
        ka = a.proximaData || ''; kb = b.proximaData || '';
      } else if (tSCol === 'titulo') {
        ka = a.titulo?.toLowerCase() || ''; kb = b.titulo?.toLowerCase() || '';
      } else { ka = kb = ''; }
      const cmp = ka < kb ? -1 : ka > kb ? 1 : 0;
      return tSDir === 'asc' ? cmp : -cmp;
    });

    const totalPages = Math.max(1, Math.ceil(allList.length / PER_PAGE));
    if (_tarefasPage >= totalPages) _tarefasPage = totalPages - 1;
    const list = allList.slice(_tarefasPage * PER_PAGE, (_tarefasPage + 1) * PER_PAGE);

    if (allList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="data-table-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
        <strong>Nenhuma tarefa encontrada</strong>
        <p>Ajuste o filtro de ativo ou crie uma nova tarefa</p>
      </div></td></tr>`;
      _renderPagination('tarefas-pagination', '#rpanel-tarefas', 0, 1, 0, 'renderTarefasTable');
      return;
    }

    tbody.innerHTML = list.map(t => {
      const rotina = state.rotinas.find(r => r.id === t.rotinaId);
      const ativo  = state.ativos[t.equipamentoIdx];
      const flag   = getTaskFlag(t);
      const nPubs  = arqContarPubs(t.id);
      const statusChip = t.status === 'Ativo'
        ? '<span class="chip chip-green">Ativo</span>'
        : '<span class="chip chip-gray">Inativo</span>';
      return `<tr onclick="openTarefaDetalhe('${t.id}')">
        <td><span class="task-flag ${flag.cls}">
          ${flag.cls === 'flag-danger' ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:12px;height:12px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' :
            flag.cls === 'flag-warning' ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:12px;height:12px;"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' :
            flag.cls === 'flag-ok' ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:12px;height:12px;"><polyline points="20 6 9 17 4 12"/></svg>' :
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:12px;height:12px;"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'}
          ${flag.label}
        </span></td>
        <td>
          <div style="font-weight:600;">${t.titulo || '—'}</div>
          <div style="font-size:11px;color:var(--text-muted);">${rotina?.nome || ''}</div>
        </td>
        <td>
          <div style="font-weight:500;">${ativo?.nome || '—'}</div>
          <div style="font-size:11px;color:var(--text-muted);font-family:'DM Mono',monospace;">${ativo?.codigo || ''}</div>
        </td>
        <td style="font-size:12.5px;">${formatDate(t.dataTarefa)}</td>
        <td style="font-size:12.5px;${t.proximaData ? '' : 'color:var(--text-muted);'}">${t.proximaData ? formatDate(t.proximaData) : '—'}</td>
        <td style="font-size:12.5px;">${t.lembrete === 0 ? 'Mesmo dia' : t.lembrete ? t.lembrete + ' dias' : '—'}</td>
        <td>${statusChip}${nPubs > 0 ? `<span class="chip chip-cyan" style="margin-left:6px;">${nPubs} pub.</span>` : ''}</td>
      </tr>`;
    }).join('');
    document.querySelectorAll('#tarefas-thead-row .th-sortable').forEach(th => {
      const col = th.dataset.sortCol;
      th.dataset.sortArrow = col === tSCol ? (tSDir === 'asc' ? ' ↑' : ' ↓') : '';
      th.classList.toggle('th-sort-active', col === tSCol);
    });
    _renderPagination('tarefas-pagination', '#rpanel-tarefas', _tarefasPage, totalPages, allList.length, 'renderTarefasTable');
  }

  // ══════════════════════════════════════════
  // ── DETALHE DA TAREFA ──
  // ══════════════════════════════════════════
  let tarefaDetalheId = null;

  function renderTarefaDetalheContent(id) {
    tarefaDetalheId = id;
    const t = state.tarefas.find(t => t.id === id);
    if (!t) return;
    const rotina = state.rotinas.find(r => r.id === t.rotinaId);
    const ativo  = state.ativos[t.equipamentoIdx];
    const flag   = getTaskFlag(t);
    const nPubs  = arqContarPubs(id);

    document.getElementById('tarefa-detalhe-title').textContent = t.titulo || rotina?.nome || 'Tarefa';
    document.getElementById('tarefa-detalhe-subtitle').textContent = ativo?.nome || '';
    const lbAtiv = document.getElementById('tdtab-label-atividades');
    if (lbAtiv) lbAtiv.innerHTML = nPubs > 0
      ? `Atividades <span style="display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 4px;border-radius:20px;font-size:10px;font-weight:700;background:var(--cyan);color:#fff;margin-left:4px;">${nPubs}</span>`
      : 'Atividades';

    const flagIconMap = {
      'flag-ok':       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
      'flag-warning':  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/></svg>`,
      'flag-danger':   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
      'flag-inactive': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`
    };

    // Responsáveis
    const respUsuarios = (t.responsaveis?.usuarios || []);
    const respGrupos   = (t.responsaveis?.grupos   || []);
    const allUsers  = typeof authState !== 'undefined' ? authState.users  : [];
    const allGroups = typeof authState !== 'undefined' ? authState.groups : [];
    const temResponsaveis = respUsuarios.length > 0 || respGrupos.length > 0;
    const respChipsHtml = temResponsaveis ? [
      ...respGrupos.map(id => {
        const g = allGroups.find(g => g.id === id);
        return g ? `<span class="resp-chip resp-chip-grupo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px;flex-shrink:0;">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
          </svg>${g.nome}</span>` : '';
      }),
      ...respUsuarios.map(id => {
        const u = allUsers.find(u => u.id === id);
        return u ? `<span class="resp-chip resp-chip-user">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px;flex-shrink:0;">
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
          </svg>${u.nomeCompleto}</span>` : '';
      })
    ].join('') : '';

    // Checklist
    const checklistTarefa  = t.checklistTarefa || [];
    const temChecklistTarefa = checklistTarefa.length > 0;

    const checklistTarefaHtml = temChecklistTarefa ? `
      <div class="task-detail-section">
        <div class="task-detail-section-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
          Checklist da Tarefa
        </div>
        <div style="display:flex;flex-direction:column;gap:5px;">
          ${checklistTarefa.map(it => `<div class="detail-checklist-item" style="flex-direction:column;align-items:flex-start;gap:3px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;flex-shrink:0;color:var(--text-muted);"><rect x="3" y="3" width="18" height="18" rx="3"/></svg>
              <span style="font-size:13px;color:var(--text-secondary);">${it.texto}</span>
              ${it.loteAtivo ? `<span class="checklist-lote-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:10px;height:10px;"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-4 0v2"/><path d="M8 7V5a2 2 0 00-4 0v2"/></svg>${it.lote ? ` ${it.lote}` : ' Lote'}${it.validade ? ` · ${it.validade}` : ''}</span>` : ''}
            </div>
          </div>`).join('')}
        </div>
      </div>` : '';

    // Frequência legível
    const freqLabel = (() => {
      if (t.frequencia === 'Sempre') return 'Sem recorrência';
      if (t.frequencia === 'DiaDaSemana') {
        const dias = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
        return (t.diasSemana || []).map(d => dias[d]).join(', ') || '—';
      }
      return t.fazerCada ? `A cada ${t.fazerCada} ${t.frequencia}` : '—';
    })();

    document.getElementById('tarefa-detalhe-body').innerHTML = `
      <div class="view-hero">
        <div class="view-hero-name">${t.titulo || rotina?.nome || '—'}</div>
        <div class="view-badges" style="margin-top:8px;">
          <span class="view-badge">${rotina?.nome || '—'} &bull; ${rotina?.tipo || ''}</span>
          <span class="view-badge">${ativo?.nome || '—'} &bull; ${ativo?.codigo || ''}</span>
        </div>
        <div class="task-flag-hero ${flag.cls}" style="margin-top:10px;">
          ${flagIconMap[flag.cls] || ''}
          ${flag.label}
        </div>
      </div>

      <div class="task-detail-section">
        <div class="task-detail-section-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          Dados da Rotina
        </div>
        <div class="rotina-view-grid">
          <div class="detail-card"><div class="detail-label">Frequência</div><div class="detail-value">${freqLabel}</div></div>
          <div class="detail-card"><div class="detail-label">Repetição</div><div class="detail-value">${t.frequencia === 'Sempre' ? '—' : t.repetir === 'Por' ? (t.vezes || '?') + ' vez(es)' : (t.repetir || 'Sempre')}</div></div>
          <div class="detail-card"><div class="detail-label">Setor</div><div class="detail-value">${_orgEsc(_orgRotuloAtivo(ativo)) || '—'}</div></div>
          <div class="detail-card"><div class="detail-label">Categoria</div><div class="detail-value">${ativo?.categoria || '—'}</div></div>
        </div>
      </div>

      <div class="task-detail-section">
        <div class="task-detail-section-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Programação
        </div>
        <div class="rotina-view-grid">
          <div class="detail-card"><div class="detail-label">${nPubs > 0 ? 'Ultima publicação' : 'Data da Tarefa'}</div><div class="detail-value">${formatDate(t.dataTarefa)}</div></div>
          <div class="detail-card"><div class="detail-label">Próxima Data</div><div class="detail-value" style="color:var(--cyan);">${t.proximaData ? formatDate(t.proximaData) : '—'}</div></div>
          ${t.frequencia !== 'Sempre' ? `<div class="detail-card"><div class="detail-label">Lembrete</div><div class="detail-value">${t.lembrete === 0 ? 'Mesmo dia' : t.lembrete ? t.lembrete + ' dias antes' : '—'}</div></div>` : ''}
          <div class="detail-card"><div class="detail-label">Status</div><div class="detail-value">${t.status}</div></div>
          <div class="detail-card"><div class="detail-label">Publicações</div><div class="detail-value">${nPubs} registrada${nPubs !== 1 ? 's' : ''}</div></div>
        </div>
        ${t.observacoes ? `<div class="detail-note" style="margin-top:10px;">
          <div class="detail-label" style="margin-bottom:6px;">Observações</div>
          <div style="font-size:13px;color:var(--text-secondary);white-space:pre-line;">${t.observacoes}</div>
        </div>` : ''}
      </div>

      ${temResponsaveis ? `
      <div class="task-detail-section">
        <div class="task-detail-section-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
          Responsáveis
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">${respChipsHtml}</div>
      </div>` : ''}

      ${t.realizadoPorTerceiro ? `
      <div class="task-detail-section">
        <div class="task-detail-section-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-4 0v2"/><path d="M8 7V5a2 2 0 00-4 0v2"/></svg>
          Empresa Terceirizada
        </div>
        <div class="rotina-view-grid">
          ${t.empresaPadrao ? `<div class="detail-card"><div class="detail-label">Empresa</div><div class="detail-value">${t.empresaPadrao}</div></div>` : ''}
          ${t.respPadrao    ? `<div class="detail-card"><div class="detail-label">Responsável</div><div class="detail-value">${t.respPadrao}</div></div>` : ''}
        </div>
      </div>` : ''}

      ${checklistTarefaHtml}`;

    const btnPub = document.getElementById('btn-publicar-tarefa');
    const canPublish = typeof authHasPermission !== 'function' || authHasPermission('tarefas.publicar');
    if (btnPub) btnPub.style.display = (t.status === 'Inativo' || !canPublish) ? 'none' : '';
  }

  function openTarefaDetalhe(id) {
    renderTarefaDetalheContent(id);
    _historicoSort = { col: 'dataRealizada', dir: 'desc' };
    _historicoPage = 0;
    switchTarefaDetalheTab('info');
    openModal('modal-tarefa-detalhe');
    // Permissões
    _mbtn('btn-editar-tarefa', _can('tarefas.editar'));
    // Excluir: só visível se não há publicações vinculadas
    const temPubs = arqTemPubs(tarefaDetalheId);
    const btnDelTarefa = document.getElementById('btn-excluir-tarefa');
    if (btnDelTarefa) btnDelTarefa.style.display = (!temPubs && _can('tarefas.excluir')) ? '' : 'none';
  }

  function editarTarefaAtual() {
    openTarefaDrawer(tarefaDetalheId);
  }

  async function excluirTarefaAtual() {
    if (!_can('tarefas.excluir')) { showToast('Sem permissão para excluir tarefas.', 'error'); return; }
    if (arqTemPubs(tarefaDetalheId)) { showToast('Esta tarefa possui publicações registradas e não pode ser excluída.', 'error'); return; }
    if (!(await uiConfirmar({
      tipo: 'perigo', titulo: 'Excluir tarefa?', confirmar: 'Excluir tarefa',
      mensagem: 'A tarefa será removida da agenda.',
      detalhe: 'O histórico de publicações desta tarefa também será removido.',
    }))) return;
    state.tarefas = state.tarefas.filter(t => t.id !== tarefaDetalheId);
    state.publicacoes = state.publicacoes.filter(p => p.tarefaId !== tarefaDetalheId);
    saveState();
    closeModal('modal-tarefa-detalhe');
    showToast('Tarefa excluída.', 'success');
  }

  function switchTarefaDetalheTab(tab) {
    ['info', 'atividades'].forEach(t => {
      document.getElementById('tdtab-' + t).style.display = t === tab ? 'block' : 'none';
      document.getElementById('tdtab-btn-' + t).classList.toggle('active', t === tab);
    });
    if (tab === 'atividades') renderHistoricoTable(tarefaDetalheId);
  }

  // ══════════════════════════════════════════
  // ── PUBLICAR TAREFA ──
  // ══════════════════════════════════════════
  let pubChecklistState = {};
  let pubChecklistComentarios = {};
  let pubChecklistLotes = {};
  let pubAnexos = [];

  function _getUploadPrefixo(ctx) {
    let tarefaId = null;
    if (ctx === 'pub') {
      tarefaId = tarefaDetalheId;
    } else if (ctx === 'edit-pub') {
      tarefaId = document.getElementById('edit-pub-id')?.value || null;
      // edit-pub-id guarda o pubId; precisamos do tarefaId da publicação
      const pub = arqBuscarPublicacao(tarefaId);
      tarefaId = pub?.tarefaId || null;
    }
    const tarefa = tarefaId ? state.tarefas.find(t => t.id === tarefaId) : null;
    const rotina = tarefa ? state.rotinas.find(r => r.id === tarefa.rotinaId) : null;
    const ativo  = tarefa ? state.ativos[tarefa.equipamentoIdx] : null;
    const partes = [ativo?.nome, rotina?.nome, tarefa?.titulo].filter(Boolean);
    return partes.join(', ');
  }

  function addPubAnexoFromUpload(anexo) {
    pubAnexos.push(anexo);
    renderPubAnexos();
  }

  let _excluirAnexoCtx = null; // { ctx: 'pub'|'edit-pub', idx }

  function removePubAnexo(idx) {
    const a = pubAnexos[idx];
    if (!a) return;
    _excluirAnexoCtx = { ctx: 'pub', idx };
    const nomeEl = document.getElementById('excluir-anexo-nome');
    if (nomeEl) nomeEl.textContent = a.titulo;
    openModal('modal-confirmar-excluir-anexo');
  }

  let _renomearAnexoCtx = null; // { ctx: 'pub'|'edit-pub', idx }

  function renamePubAnexo(idx) {
    const a = pubAnexos[idx];
    if (!a) return;
    _renomearAnexoCtx = { ctx: 'pub', idx };
    const input = document.getElementById('renomear-anexo-input');
    if (input) input.value = a.titulo;
    openModal('modal-renomear-anexo');
    setTimeout(() => input?.select(), 80);
  }

  function renderPubAnexos() {
    const list = document.getElementById('pub-anexo-list');
    if (!list) return;
    if (pubAnexos.length === 0) { list.innerHTML = ''; return; }
    list.innerHTML = pubAnexos.map((a, i) => `
      <div class="anexo-item">
        <a class="anexo-icon" href="${a.url}" target="_blank" title="Abrir anexo" style="cursor:pointer;text-decoration:none;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </a>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:600;color:var(--text-primary);">${a.titulo}</div>
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0;">
          <button class="anexo-del" onclick="renamePubAnexo(${i})" title="Renomear"
            style="color:var(--cyan);border-color:rgba(0,168,204,.3);">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="width:11px;height:11px;"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
          </button>
          <button class="anexo-del" onclick="removePubAnexo(${i})" title="Remover">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="width:11px;height:11px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>`).join('');
  }

  window.openPublicarModalDireto = function (tarefaId) {
    tarefaDetalheId = tarefaId;
    openPublicarModal();
  };

  function openPublicarModal() {
    const t = state.tarefas.find(t => t.id === tarefaDetalheId);
    if (!t) return;
    if (t.status === 'Inativo') { showToast('Tarefas inativas não podem ser publicadas.', 'error'); return; }
    const rotina = state.rotinas.find(r => r.id === t.rotinaId);

    const ativo = state.ativos[t.equipamentoIdx];
    const ativoNome  = ativo ? (ativo.codigo ? `${ativo.nome} · ${ativo.codigo}` : ativo.nome) : '—';
    const rotinaNome = rotina?.nome || '—';
    const tarefaNome = t.titulo || '—';
    const infoAtivoVal  = document.getElementById('pub-info-ativo-val');
    const infoRotinaVal = document.getElementById('pub-info-rotina-val');
    const infoTarefaVal = document.getElementById('pub-info-tarefa-val');
    if (infoAtivoVal)  infoAtivoVal.textContent  = ativoNome;
    if (infoRotinaVal) infoRotinaVal.textContent = rotinaNome;
    if (infoTarefaVal) infoTarefaVal.textContent = tarefaNome;

    const now = new Date();
    document.getElementById('pub-data-realizada').value = now.toISOString().split('T')[0];
    document.getElementById('pub-hora-realizada').value =
      String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    document.getElementById('pub-notas').value = '';
    _pubSetEmpresaTecnico(t.empresaPadrao || '', t.respPadrao || '');
    // Abre o terceiro automaticamente se a tarefa já tem realizadoPorTerceiro configurado
    const terceiroSection = document.getElementById('pub-terceiro-section');
    const terceiroCb      = document.getElementById('pub-terceiro-checkbox');
    if (terceiroSection) terceiroSection.style.display = t.realizadoPorTerceiro ? '' : 'none';
    if (terceiroCb) terceiroCb.checked = !!t.realizadoPorTerceiro;
    pubChecklistState = {};
    pubChecklistComentarios = {};
    pubChecklistLotes = {};
    pubAnexos = [];
    renderPubAnexos();
    if (typeof resetUploadZone === 'function') resetUploadZone('pub');

    // Seção de anexos
    const anexoSection = document.getElementById('pub-anexo-section');
    const reqLabel     = document.getElementById('pub-anexo-req-label');
    if (anexoSection) {
      anexoSection.style.display = '';
      if (reqLabel) reqLabel.style.display = t.anexoObrigatorio ? '' : 'none';
    }

    // Checklist da Tarefa
    const section = document.getElementById('pub-checklist-section');
    const tarefaChecklist = t.checklistTarefa || [];

    // Pré-carregar lotes/validades existentes na tarefa (só para itens com loteAtivo)
    tarefaChecklist.forEach(it => {
      if (it.loteAtivo) {
        pubChecklistLotes[it.id] = { lote: it.lote || '', validade: it.validade || '' };
      }
    });

    if (tarefaChecklist.length > 0) {
      section.style.display = '';
      let html = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <div class="form-section-title" style="margin-bottom:0;border:none;padding:0;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 11 12 14 22 4"/></svg>
            Checklist da Tarefa — marque todos os itens
          </div>
          <button type="button" id="btn-selecionar-checklist" class="btn-select-all-checks" onclick="selecionarTodosChecklist()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="width:12px;height:12px;"><polyline points="20 6 9 17 4 12"/></svg>
            <span id="btn-selecionar-checklist-label">Selecionar todos</span>
          </button>
        </div>`;
      html += tarefaChecklist.map(it => _renderPubCheckItem(it, tarefaChecklist.length)).join('');
      document.getElementById('pub-checklist').innerHTML = html;
      tarefaChecklist.forEach(it => { if (it.comentarioObrigatorio) _openPubComentario(it.id); });
      updatePubProgress(tarefaChecklist.length);
    } else {
      section.style.display = 'none';
    }

    closeModal('modal-tarefa-detalhe');
    openModal('modal-publicar');
  }

  function togglePubTerceiro() {
    const cb      = document.getElementById('pub-terceiro-checkbox');
    const section = document.getElementById('pub-terceiro-section');
    if (!section || !cb) return;
    // Sincroniza: se chamado pelo onclick da toggle-row, inverte o checkbox
    if (document.activeElement !== cb) cb.checked = !cb.checked;
    const nowOpen = cb.checked;
    section.style.display = nowOpen ? '' : 'none';
    if (!nowOpen) {
      const empInput = document.getElementById('pub-empresa-responsavel');
      const tecInput = document.getElementById('pub-tecnico-responsavel');
      if (empInput) empInput.value = '';
      if (tecInput) { tecInput.value = ''; tecInput.disabled = true; }
      _pubEmpresaId = null;
    }
  }

  function cancelarPublicacao() {
    // Bloqueia se houver qualquer anexo enviado pendente de salvamento
    if (pubAnexos.length > 0) {
      openModal('modal-aviso-anexo-pendente');
      return;
    }
    if (typeof resetUploadZone === 'function') resetUploadZone('pub');
    closeModal('modal-publicar');
  }

  function cancelarEdicaoPublicacao() {
    // Bloqueia se houver anexos novos adicionados nesta sessão pendentes de salvamento
    const idsOriginais = new Set(_editPubAnexosOriginais);
    const urlsOriginais = new Set(
      (state.publicacoes.find(p => p.id === document.getElementById('edit-pub-id')?.value)?.anexos || [])
        .map(a => typeof a === 'string' ? a : a.url)
    );
    const temNovos = _editPubAnexos.some(a => !idsOriginais.has(a.fileId) && !urlsOriginais.has(a.url));
    if (temNovos) {
      openModal('modal-aviso-anexo-pendente');
      return;
    }
    _editPubAnexosOriginais = [];
    if (typeof resetUploadZone === 'function') resetUploadZone('edit-pub');
    closeModal('modal-editar-pub');
  }

  function _renderPubCheckItem(it, total) {
    const obrig = !!it.comentarioObrigatorio;
    const loteAtivo = !!it.loteAtivo;
    return `
      <div class="pub-check-item-wrap" id="pwrap-${it.id}">
        <div class="pub-check-item" id="pcheck-${it.id}" data-comt-obrig="${obrig ? '1' : ''}" onclick="togglePubCheck('${it.id}', ${total})">
          <div class="pub-check-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg></div>
          <span class="pub-check-text">${it.texto}</span>
          <button class="pub-check-coment-btn${obrig ? ' obrig' : ''}" onclick="event.stopPropagation();togglePubComentario('${it.id}')" title="${obrig ? 'Comentário obrigatório' : 'Adicionar comentário'}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          </button>
        </div>
        ${loteAtivo ? `<div class="pub-check-lote-field" id="plote-${it.id}">
          <div class="checklist-lote-fields" style="padding-left:44px;">
            <div class="checklist-lote-field-wrap">
              <label class="checklist-lote-label">Lote <span style="color:var(--red);font-size:10px;">*obrigatório</span></label>
              <input type="text" id="plote-lote-${it.id}" class="checklist-lote-input" placeholder="Nº do lote..." value="${it.lote || ''}" oninput="pubChecklistLotes['${it.id}']={...(pubChecklistLotes['${it.id}']||{}),lote:this.value}">
            </div>
            <div class="checklist-lote-field-wrap">
              <label class="checklist-lote-label">Validade <span style="color:var(--red);font-size:10px;">*obrigatório</span></label>
              <input type="date" id="plote-val-${it.id}" class="checklist-lote-input" value="${it.validade || ''}" oninput="pubChecklistLotes['${it.id}']={...(pubChecklistLotes['${it.id}']||{}),validade:this.value}">
            </div>
          </div>
        </div>` : ''}
        <div class="pub-check-coment-field" id="pcoment-${it.id}" style="display:none;">
          <textarea id="pcoment-txt-${it.id}" class="pub-check-coment-input" placeholder="Comentário${obrig ? ' (obrigatório)' : ''}..." rows="2" oninput="pubChecklistComentarios['${it.id}']=this.value"></textarea>
        </div>
      </div>`;
  }

  function _openPubComentario(itemId) {
    const field = document.getElementById('pcoment-' + itemId);
    if (field) field.style.display = '';
  }

  function togglePubComentario(itemId) {
    const field = document.getElementById('pcoment-' + itemId);
    if (!field) return;
    const isOpen = field.style.display !== 'none';
    field.style.display = isOpen ? 'none' : '';
    if (!isOpen) document.getElementById('pcoment-txt-' + itemId)?.focus();
  }

  function _atualizarBtnSelecionarChecklist(allItems) {
    const btn   = document.getElementById('btn-selecionar-checklist');
    const label = document.getElementById('btn-selecionar-checklist-label');
    if (!btn || !label) return;
    const todosElegiveis = allItems.filter(it => {
      const comtObrig = !!it.comentarioObrigatorio;
      const comtPreenchido = !!(pubChecklistComentarios[it.id] || '').trim();
      return !comtObrig || comtPreenchido;
    });
    const todosMarcados = todosElegiveis.length > 0 && todosElegiveis.every(it => !!pubChecklistState[it.id]);
    label.textContent = todosMarcados ? 'Desmarcar todos' : 'Selecionar todos';
    btn.dataset.modo = todosMarcados ? 'desmarcar' : 'selecionar';
  }

  function selecionarTodosChecklist() {
    const t = state.tarefas.find(t => t.id === tarefaDetalheId);
    if (!t) return;
    const allItems = t.checklistTarefa || [];
    const btn = document.getElementById('btn-selecionar-checklist');
    const desmarcar = btn?.dataset.modo === 'desmarcar';
    allItems.forEach(it => {
      if (desmarcar) {
        pubChecklistState[it.id] = false;
        document.getElementById('pcheck-' + it.id)?.classList.remove('checked');
      } else {
        if (!!pubChecklistState[it.id]) return;
        const comtObrig = !!it.comentarioObrigatorio;
        const comtPreenchido = !!(pubChecklistComentarios[it.id] || '').trim();
        if (comtObrig && !comtPreenchido) return;
        pubChecklistState[it.id] = true;
        document.getElementById('pcheck-' + it.id)?.classList.add('checked');
      }
    });
    updatePubProgress(allItems.length);
    _atualizarBtnSelecionarChecklist(allItems);
  }

  function togglePubCheck(itemId, total) {
    const el = document.getElementById('pcheck-' + itemId);
    // Se está tentando marcar e tem comentário obrigatório, valida primeiro
    if (!pubChecklistState[itemId] && el?.dataset.comtObrig === '1') {
      const comentario = (pubChecklistComentarios[itemId] || '').trim();
      if (!comentario) {
        _openPubComentario(itemId);
        document.getElementById('pcoment-txt-' + itemId)?.focus();
        showToast('Preencha o comentário antes de marcar este item.', 'error');
        return;
      }
    }
    pubChecklistState[itemId] = !pubChecklistState[itemId];
    el.classList.toggle('checked', !!pubChecklistState[itemId]);
    updatePubProgress(total);
  }

  function updatePubProgress(total) {
    const done = Object.values(pubChecklistState).filter(Boolean).length;
    document.getElementById('pub-progress-label').textContent = `${done} / ${total} itens marcados`;
    document.getElementById('pub-progress-bar').style.width = total > 0 ? `${(done/total)*100}%` : '0%';
    const t = state.tarefas.find(t => t.id === tarefaDetalheId);
    if (t) _atualizarBtnSelecionarChecklist(t.checklistTarefa || []);
  }

  function publicarTarefa() {
    if (typeof _uploadsInProgress !== 'undefined' && _uploadsInProgress['pub']) { showToast('Aguarde o término do envio do arquivo.', 'info'); return; }
    if (typeof _uploadQueues !== 'undefined' && _uploadQueues['pub']?.file) { showToast('Envie o arquivo selecionado antes de publicar.', 'error'); return; }
    if (!_can('tarefas.publicar')) { showToast('Sem permissão para publicar tarefas.', 'error'); return; }
    const t = state.tarefas.find(t => t.id === tarefaDetalheId);
    if (!t) return;
    const rotina = state.rotinas.find(r => r.id === t.rotinaId);
    const dataPub = document.getElementById('pub-data-realizada').value;
    const horaPub = document.getElementById('pub-hora-realizada').value;

    if (!dataPub) { showToast('Informe a data de realização.', 'error'); return; }
    if (!horaPub) { showToast('Informe a hora de realização.', 'error'); return; }
    const dataRealizada = buildDataRealizada(dataPub, horaPub);
    const dataRealizadaDate = parseDataRealizada(dataRealizada).date;

    // Valida obrigatoriedade de anexo
    if (t.anexoObrigatorio && pubAnexos.length === 0) {
      showToast('Adicione pelo menos 1 anexo para publicar esta tarefa.', 'error'); return;
    }

    // Valida checklist da tarefa
    const checkItems = t.checklistTarefa || [];
    if (checkItems.length > 0) {
      const allChecked = checkItems.every(it => pubChecklistState[it.id]);
      if (!allChecked) { showToast('Marque todos os itens do checklist para publicar.', 'error'); return; }
      const semComent = checkItems.filter(it => it.comentarioObrigatorio && !(pubChecklistComentarios[it.id] || '').trim());
      if (semComent.length > 0) { showToast('Preencha o comentário obrigatório dos itens marcados.', 'error'); semComent.forEach(it => _openPubComentario(it.id)); return; }
      // Valida lote/validade obrigatório quando loteAtivo
      const semLote = checkItems.filter(it => it.loteAtivo && (!(pubChecklistLotes[it.id]?.lote || '').trim() || !(pubChecklistLotes[it.id]?.validade || '').trim()));
      if (semLote.length > 0) {
        showToast('Preencha o Lote e Validade obrigatórios dos itens do checklist.', 'error');
        semLote.forEach(it => document.getElementById('plote-lote-' + it.id)?.focus());
        return;
      }
    }

    // Aplicar lote/validade editados na publicação de volta à tarefa
    const tIdx2 = state.tarefas.findIndex(tt => tt.id === tarefaDetalheId);
    if (tIdx2 >= 0) {
      const checklistAtualizado = state.tarefas[tIdx2].checklistTarefa || [];
      checklistAtualizado.forEach(it => {
        const loteData = pubChecklistLotes[it.id];
        if (loteData) {
          if (loteData.lote !== undefined) it.lote = loteData.lote;
          if (loteData.validade !== undefined) it.validade = loteData.validade;
        }
      });
    }

    const _sess = typeof currentSession !== 'undefined' ? currentSession : null;
    const _comentariosEntries = Object.entries(pubChecklistComentarios).filter(([, v]) => v !== undefined && v !== null);
    const _lotesEntries = Object.entries(pubChecklistLotes).filter(([, v]) => v && (v.lote || v.validade));
    const pub = {
      id: uid(),
      tarefaId: tarefaDetalheId,
      dataRealizada,
      dataPublicacao: new Date().toISOString(),
      checklistMarcado: checkItems.map(it => it.id),
      ...(_comentariosEntries.length > 0 ? { checklistComentarios: Object.fromEntries(_comentariosEntries) } : {}),
      ...(_lotesEntries.length > 0 ? { checklistLotes: Object.fromEntries(_lotesEntries) } : {}),
      notas: document.getElementById('pub-notas').value.trim(),
      empresaResponsavel: (document.getElementById('pub-terceiro-section')?.style.display !== 'none') ? (document.getElementById('pub-empresa-responsavel').value.trim() || null) : null,
      tecnicoResponsavel: (document.getElementById('pub-terceiro-section')?.style.display !== 'none') ? (document.getElementById('pub-tecnico-responsavel').value.trim() || null) : null,
      anexos: pubAnexos.slice(),
      publicadoPorId:   _sess?.userId       || null,
      publicadoPorNome: _sess?.nomeCompleto || _sess?.username || null
    };
    state.publicacoes.push(pub);

    // Atualiza próxima data da tarefa baseado na data realizada
    const tIdx = state.tarefas.findIndex(tt => tt.id === tarefaDetalheId);
    if (tIdx >= 0) {
      const tarefaAtual = state.tarefas[tIdx];
      const novaProxima = calcProximaData(dataRealizadaDate, tarefaAtual);
      state.tarefas[tIdx].proximaData = novaProxima;
      state.tarefas[tIdx].dataTarefa  = dataRealizadaDate;

      // Auto-inativar ao atingir o número de repetições
      const repetir = tarefaAtual.repetir || rotina?.repetir;
      const vezes   = tarefaAtual.vezes   ?? rotina?.vezes;
      if (repetir === 'Por') {
        const nPubs = arqContarPubs(tarefaDetalheId);
        if (nPubs >= vezes) {
          state.tarefas[tIdx].status = 'Inativo';
          state.tarefas[tIdx].autoInativada = true;
        }
      }
    }

    closeModal('modal-publicar');
    saveState();
    // Gancho: quem abriu a publicação (ex.: vincular atividade na ocorrência) recebe a nova publicação
    if (typeof window._onPubCriada === 'function') { const cb = window._onPubCriada; window._onPubCriada = null; try { cb(pub); } catch (e) { console.error(e); } }
    if (typeof renderHome === 'function') renderHome();

    const tarefaFinal = state.tarefas[tIdx];
    const vezesFinal  = tarefaFinal?.vezes ?? rotina?.vezes;
    if (tarefaFinal?.autoInativada) {
      showToast(`Tarefa concluída após ${vezesFinal} publicação(ões).`, 'info');
    } else {
      showToast('Tarefa publicada com sucesso!', 'success');
    }
  }

  // ══════════════════════════════════════════
  // ── HISTÓRICO ──
  // ══════════════════════════════════════════
  // Histórico de publicações da tarefa — subaba "Atividades" do detalhe da tarefa
  let _historicoTarefaId = null;

  const HISTORICO_PER_PAGE = 10;
  let _historicoPage = 0;
  let _historicoSort = { col: 'dataRealizada', dir: 'desc' };

  function sortHistoricoBy(col) {
    if (_historicoSort.col === col) {
      _historicoSort.dir = _historicoSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      _historicoSort = { col, dir: col === 'dataRealizada' || col === 'dataPublicacao' ? 'desc' : 'asc' };
    }
    renderHistoricoTable(_historicoTarefaId, 0);
  }

  function renderHistoricoTable(tarefaId, page) {
    _historicoTarefaId = tarefaId;
    if (page !== undefined) _historicoPage = page;
    const tbody       = document.getElementById('historico-tbody');
    const { col: sCol, dir: sDir } = _historicoSort;
    const allPubs = todasPublicacoes().filter(p => p.tarefaId === tarefaId)
      .sort((a, b) => {
        let ka, kb;
        if (sCol === 'dataRealizada')  { ka = dataRealizadaSortKey(a.dataRealizada); kb = dataRealizadaSortKey(b.dataRealizada); }
        else if (sCol === 'dataPublicacao') { ka = a.dataPublicacao || ''; kb = b.dataPublicacao || ''; }
        else if (sCol === 'publicadoPor')   { ka = a.publicadoPorNome?.toLowerCase() || ''; kb = b.publicadoPorNome?.toLowerCase() || ''; }
        else { ka = kb = ''; }
        const cmp = ka < kb ? -1 : ka > kb ? 1 : 0;
        return sDir === 'asc' ? cmp : -cmp;
      });

    const totalPages = Math.max(1, Math.ceil(allPubs.length / HISTORICO_PER_PAGE));
    if (_historicoPage >= totalPages) _historicoPage = totalPages - 1;
    const pubs = allPubs.slice(_historicoPage * HISTORICO_PER_PAGE, (_historicoPage + 1) * HISTORICO_PER_PAGE);
    arqRenderRodape('historico-arq-rodape', document.querySelector('#tdtab-atividades .data-table-wrapper'), [tarefaId]);

    if (allPubs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="data-table-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <strong>Nenhuma publicação registrada</strong>
        <p>Publique a tarefa para registrar o histórico</p>
      </div></td></tr>`;
      _renderHistoricoPagination(0, 1, 0);
      return;
    }

    tbody.innerHTML = pubs.map(p => {
      const nCheck = p.checklistMarcado?.length || 0;
      const checkStr = nCheck > 0 ? `<span class="chip chip-green">${nCheck} item${nCheck>1?'s':''}</span>` : '<span style="color:var(--text-muted)">—</span>';
      const pubPor = p.publicadoPorNome || '<span style="color:var(--text-muted)">—</span>';
      return `<tr class="historico-pub-row" onclick="viewPublicacao('${p.id}')">
        <td style="font-weight:600;">${formatDataRealizadaHtml(p.dataRealizada)} ${arqSeloHtml(p)}</td>
        <td style="font-size:12px;color:var(--text-muted);">${formatDate(p.dataPublicacao)}</td>
        <td style="font-size:12.5px;">${pubPor}</td>
        <td>${checkStr}</td>
        <td class="historico-notas" title="${_orgEsc(p.notas || '')}">${p.notas || '<span style="color:var(--text-muted)">—</span>'}</td>
      </tr>`;
    }).join('');

    document.querySelectorAll('#historico-thead-row .th-sortable').forEach(th => {
      const col = th.dataset.sortCol;
      th.dataset.sortArrow = col === sCol ? (sDir === 'asc' ? ' ↑' : ' ↓') : '';
      th.classList.toggle('th-sort-active', col === sCol);
    });

    _renderHistoricoPagination(_historicoPage, totalPages, allPubs.length);
  }

  function _renderHistoricoPagination(page, totalPages, total) {
    let el = document.getElementById('historico-pagination');
    if (!el) {
      const wrapper = document.querySelector('#tdtab-atividades .data-table-wrapper');
      if (!wrapper) return;
      el = document.createElement('div');
      el.id = 'historico-pagination';
      el.style.cssText = 'display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:12px 0 0;';
      wrapper.after(el);
    }
    if (totalPages <= 1) { el.innerHTML = ''; return; }
    const start = page * HISTORICO_PER_PAGE + 1;
    const end   = Math.min((page + 1) * HISTORICO_PER_PAGE, total);
    el.innerHTML = `
      <span style="font-size:12px;color:var(--text-muted);">${start}–${end} de ${total}</span>
      <button class="btn btn-outline btn-icon" onclick="renderHistoricoTable('${_historicoTarefaId}', ${page - 1})" ${page === 0 ? 'disabled' : ''} style="padding:5px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <button class="btn btn-outline btn-icon" onclick="renderHistoricoTable('${_historicoTarefaId}', ${page + 1})" ${page >= totalPages - 1 ? 'disabled' : ''} style="padding:5px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><polyline points="9 18 15 12 9 6"/></svg>
      </button>`;
  }

  let _editPubAnexos = [];
  let _editPubAnexosOriginais = []; // fileIds que existiam antes de abrir o modal

  function _renderEditPubAnexos() {
    const list = document.getElementById('edit-pub-anexo-list');
    if (!list) return;
    if (_editPubAnexos.length === 0) { list.innerHTML = ''; return; }
    const canManageAnexos = _can('atividades.gerenciarAnexos');
    list.innerHTML = _editPubAnexos.map((a, i) => `
      <div class="anexo-item">
        <a class="anexo-icon" href="${a.url}" target="_blank" title="Abrir anexo" style="cursor:pointer;text-decoration:none;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </a>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:600;color:var(--text-primary);">${a.titulo}</div>
        </div>
        ${canManageAnexos ? `<div style="display:flex;gap:4px;flex-shrink:0;">
          <button class="anexo-del" onclick="_renameEditPubAnexo(${i})" title="Renomear"
            style="color:var(--cyan);border-color:rgba(0,168,204,.3);">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="width:11px;height:11px;"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
          </button>
          <button class="anexo-del" onclick="_removeEditPubAnexo(${i})" title="Remover">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="width:11px;height:11px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>` : ''}
      </div>`).join('');
  }

  function addEditPubAnexoFromUpload(anexo) {
    _editPubAnexos.push(anexo);
    _renderEditPubAnexos();
  }

  async function _confirmarExcluirAnexo() {
    if (!_excluirAnexoCtx) return;
    const { ctx, idx } = _excluirAnexoCtx;

    const btnConfirmar = document.getElementById('btn-confirmar-excluir-anexo');
    const btnCancelar  = document.getElementById('btn-cancelar-excluir-anexo');

    // Estado loading
    if (btnConfirmar) {
      btnConfirmar.disabled = true;
      btnConfirmar.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
          style="width:14px;height:14px;animation:spin 1s linear infinite;">
          <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0"/>
        </svg> Excluindo...`;
    }
    if (btnCancelar) btnCancelar.disabled = true;

    const a = ctx === 'pub' ? pubAnexos[idx] : _editPubAnexos[idx];

    try {
      if (a?.fileId && typeof driveDelete === 'function') {
        await driveDelete(a.fileId);
      }
      if (ctx === 'pub') {
        pubAnexos.splice(idx, 1);
        renderPubAnexos();
        if (typeof showToast === 'function') showToast('Arquivo removido do Drive.', 'success');
      } else {
        _editPubAnexos.splice(idx, 1);
        _renderEditPubAnexos();
        // Salva automaticamente a publicação com a lista de anexos atualizada
        const pubId = document.getElementById('edit-pub-id')?.value;
        const pubIdx = pubId ? state.publicacoes.findIndex(p => p.id === pubId) : -1;
        if (pubIdx >= 0) {
          state.publicacoes[pubIdx].anexos = _editPubAnexos.slice();
          saveState();
          if (typeof showToast === 'function') showToast('Anexo removido e publicação atualizada.', 'success');
        } else {
          if (typeof showToast === 'function') showToast('Arquivo removido do Drive.', 'success');
        }
      }
    } catch (err) {
      if (typeof showToast === 'function') showToast('Erro ao remover: ' + (err.message || err), 'error');
    } finally {
      _excluirAnexoCtx = null;
      closeModal('modal-confirmar-excluir-anexo');
      // Restaura botões para próximo uso
      if (btnConfirmar) {
        btnConfirmar.disabled = false;
        btnConfirmar.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" style="width:15px;height:15px;">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
          </svg> Excluir`;
      }
      if (btnCancelar) btnCancelar.disabled = false;
    }
  }

  function _removeEditPubAnexo(idx) {
    const a = _editPubAnexos[idx];
    if (!a) return;
    _excluirAnexoCtx = { ctx: 'edit-pub', idx };
    const nomeEl = document.getElementById('excluir-anexo-nome');
    if (nomeEl) nomeEl.textContent = a.titulo;
    openModal('modal-confirmar-excluir-anexo');
  }



  function _renameEditPubAnexo(idx) {
    const a = _editPubAnexos[idx];
    if (!a) return;
    _renomearAnexoCtx = { ctx: 'edit-pub', idx };
    const input = document.getElementById('renomear-anexo-input');
    if (input) input.value = a.titulo;
    openModal('modal-renomear-anexo');
    setTimeout(() => input?.select(), 80);
  }

  function _confirmarRenomearAnexo() {
    const input = document.getElementById('renomear-anexo-input');
    const novo = input?.value?.trim();
    if (!novo) { input?.focus(); return; }
    closeModal('modal-renomear-anexo');
    if (!_renomearAnexoCtx) return;
    const { ctx, idx } = _renomearAnexoCtx;
    _renomearAnexoCtx = null;
    if (ctx === 'pub') {
      const a = pubAnexos[idx];
      if (!a || novo === a.titulo) return;
      if (a.fileId && typeof renameAnexoDrive === 'function') {
        renameAnexoDrive(a.fileId, novo, () => { pubAnexos[idx].titulo = novo; renderPubAnexos(); });
      } else {
        pubAnexos[idx].titulo = novo; renderPubAnexos();
      }
    } else {
      const a = _editPubAnexos[idx];
      if (!a || novo === a.titulo) return;
      if (a.fileId && typeof renameAnexoDrive === 'function') {
        renameAnexoDrive(a.fileId, novo, () => { _editPubAnexos[idx].titulo = novo; _renderEditPubAnexos(); });
      } else {
        _editPubAnexos[idx].titulo = novo; _renderEditPubAnexos();
      }
    }
  }

  function abrirEditarPublicacao(pubId) {
    if (!_can('atividades.editar')) { showToast('Sem permissão para editar publicações.', 'error'); return; }
    if (arqEhArquivada(pubId)) { showToast('Publicação arquivada: registro somente leitura.', 'info'); return; }
    const p = state.publicacoes.find(p => p.id === pubId);
    if (!p) return;
    const { date, time } = parseDataRealizada(p.dataRealizada);
    document.getElementById('edit-pub-id').value   = pubId;
    document.getElementById('edit-pub-data').value = date;
    document.getElementById('edit-pub-hora').value = time || '00:00';
    document.getElementById('edit-pub-notas').value = p.notas || '';
    const tEdit = state.tarefas.find(t => t.id === p.tarefaId);
    const editTerceiroSection = document.getElementById('edit-pub-terceiro-section');
    if (editTerceiroSection) editTerceiroSection.style.display = tEdit?.realizadoPorTerceiro ? '' : 'none';
    _editPubSetEmpresaTecnico(p.empresaResponsavel || '', p.tecnicoResponsavel || '');
    // Carrega anexos existentes — normaliza formato legado
    _editPubAnexos = (p.anexos || []).map((a, i) =>
      typeof a === 'string' ? { titulo: `Anexo ${i + 1}`, url: a } : { ...a }
    );
    _editPubAnexosOriginais = _editPubAnexos.map(a => a.fileId).filter(Boolean);
    _renderEditPubAnexos();
    if (typeof resetUploadZone === 'function') resetUploadZone('edit-pub');
    openModal('modal-editar-pub');
  }

  function salvarEdicaoPublicacao() {
    if (typeof _uploadsInProgress !== 'undefined' && _uploadsInProgress['edit-pub']) { showToast('Aguarde o término do envio do arquivo.', 'info'); return; }
    if (typeof _uploadQueues !== 'undefined' && _uploadQueues['edit-pub']?.file) { showToast('Envie o arquivo selecionado antes de salvar.', 'error'); return; }
    const pubId = document.getElementById('edit-pub-id').value;
    const data  = document.getElementById('edit-pub-data').value;
    const hora  = document.getElementById('edit-pub-hora').value;
    const notas = document.getElementById('edit-pub-notas').value.trim();
    if (!data) { showToast('Informe a data de realização.', 'error'); return; }
    if (!hora) { showToast('Informe a hora de realização.', 'error'); return; }
    const idx = state.publicacoes.findIndex(p => p.id === pubId);
    if (idx < 0) return;
    state.publicacoes[idx].dataRealizada = buildDataRealizada(data, hora);
    state.publicacoes[idx].notas = notas;
    const tSave = state.tarefas.find(t => t.id === state.publicacoes[idx].tarefaId);
    if (tSave?.realizadoPorTerceiro) {
      state.publicacoes[idx].empresaResponsavel = document.getElementById('edit-pub-empresa').value.trim() || null;
      state.publicacoes[idx].tecnicoResponsavel = document.getElementById('edit-pub-tecnico').value.trim() || null;
    }
    state.publicacoes[idx].anexos = _editPubAnexos.slice();
    saveState();
    closeModal('modal-editar-pub');
    showToast('Publicação atualizada!', 'success');
  }

  let _pubExcluirId = null;

  function excluirPublicacaoFromView() {
    const pubId = _pubViewId;
    if (!pubId) return;
    closeModal('modal-pub-view');
    excluirPublicacao(pubId);
  }

  function excluirPublicacao(pubId) {
    if (!_can('atividades.excluir')) { showToast('Sem permissão para excluir publicações.', 'error'); return; }
    if (arqEhArquivada(pubId)) { showToast('Publicação arquivada: registro somente leitura.', 'info'); return; }
    _pubExcluirId = pubId;
    openModal('modal-confirmar-excluir-pub');
  }

  function _confirmarExcluirPublicacao() {
    const pubId = _pubExcluirId;
    _pubExcluirId = null;
    closeModal('modal-confirmar-excluir-pub');
    const p = state.publicacoes.find(p => p.id === pubId);
    state.publicacoes = state.publicacoes.filter(p => p.id !== pubId);

    // Se a tarefa estava auto-inativada e agora tem menos publicações, permitir reativação
    if (p) {
      const t = state.tarefas.find(t => t.id === p.tarefaId);
      if (t?.autoInativada) {
        const nPubs = arqContarPubs(t.id);
        if (t.repetir === 'Por' && nPubs < (t.vezes || 0)) {
          const tIdx = state.tarefas.findIndex(tt => tt.id === t.id);
          state.tarefas[tIdx].autoInativada = false;
          state.tarefas[tIdx].status = 'Ativo';
        }
      }
    }

    saveState();
    if (typeof renderHome === 'function') renderHome();
    showToast('Publicação excluída.', 'success');
  }

  let _pubViewId = null;
  let _pubViewFromAgenda = false;

  window.closePubView = function () {
    closeModal('modal-pub-view');
    const overlay = document.getElementById('modal-pub-view');
    if (overlay) overlay.style.zIndex = '';
    if (_pubViewFromAgenda) {
      _pubViewFromAgenda = false;
      openModal('modal-agenda-dia');
    }
  };

  window.viewPublicacaoFromAgenda = function (pubId) {
    _pubViewFromAgenda = true;
    const overlay = document.getElementById('modal-pub-view');
    if (overlay) overlay.style.zIndex = '600';
    window.viewPublicacao(pubId);
  };

  window.verAtividadesPubView = function () {
    const p = _pubViewId ? arqBuscarPublicacao(_pubViewId) : null;
    if (!p || !p.tarefaId) return;
    _pubViewFromAgenda = false;
    window.closePubView();
    openTarefaDetalhe(p.tarefaId);
    switchTarefaDetalheTab('atividades');
  };

  function editarPubView() {
    if (!_pubViewId) return;
    closeModal('modal-pub-view');
    abrirEditarPublicacao(_pubViewId);
  }

  window.viewPublicacao = function viewPublicacao(pubId) {
    _pubViewId = pubId;
    const p = arqBuscarPublicacao(pubId);
    if (!p) return;
    const t = state.tarefas.find(t => t.id === p.tarefaId);
    const rotina = t ? state.rotinas.find(r => r.id === t.rotinaId) : null;
    const tarefaChecklist  = t?.checklistTarefa || [];

    function checkListHtml(items, label, pubLotes) {
      if (!items.length) return '';
      return `<div style="margin-top:14px;">
        <div class="form-section-title" style="margin-bottom:8px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/></svg>
          ${label}
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          ${items.map(it => {
            const loteInfo = (pubLotes && pubLotes[it.id]) || {};
            const lote = loteInfo.lote || it.lote || '';
            const validade = loteInfo.validade || it.validade || '';
            const mostrarLote = !!it.loteAtivo && (lote || validade);
            return `
            <div style="display:flex;flex-direction:column;gap:4px;">
              <div class="pub-check-item checked" style="cursor:default;">
                <div class="pub-check-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg></div>
                <span class="pub-check-text">${it.texto}</span>
              </div>
              ${mostrarLote ? `<div style="display:flex;gap:8px;margin-left:44px;flex-wrap:wrap;">
                ${lote ? `<span class="checklist-lote-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:10px;height:10px;"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-4 0v2"/><path d="M8 7V5a2 2 0 00-4 0v2"/></svg> Lote: ${lote}</span>` : ''}
                ${validade ? `<span class="checklist-lote-badge" style="background:rgba(244,162,97,0.1);color:#f4a261;border-color:rgba(244,162,97,0.3);"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:10px;height:10px;"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> Val: ${validade}</span>` : ''}
              </div>` : ''}
            </div>`;
          }).join('')}
        </div>
      </div>`;
    }

    // Normaliza anexos: suporte a formato novo {titulo,url} e legado (string)
    const anexosNorm = (p.anexos || []).map((a, i) =>
      typeof a === 'string' ? { titulo: `Anexo ${i + 1}`, url: a } : a
    );

    const anexosHtml = anexosNorm.length > 0 ? `
      <div style="margin-top:16px;">
        <div class="form-section-title" style="margin-bottom:10px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
          Anexos (${anexosNorm.length})
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;">
          ${anexosNorm.map(a => `
            <a href="${a.url}" target="_blank" title="${a.url}" style="text-decoration:none;display:block;">
              <div style="background:var(--bg-card);border:1.5px solid rgba(230,57,70,0.22);border-radius:12px;padding:14px 10px 12px;display:flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer;transition:transform 0.18s,box-shadow 0.18s,border-color 0.18s,background 0.18s;"
                   onmouseover="this.style.borderColor='rgba(230,57,70,0.6)';this.style.background='rgba(230,57,70,0.05)';this.style.transform='translateY(-3px)';this.style.boxShadow='0 6px 18px rgba(230,57,70,0.15)'"
                   onmouseout="this.style.borderColor='rgba(230,57,70,0.22)';this.style.background='var(--bg-card)';this.style.transform='';this.style.boxShadow=''">
                <div style="width:46px;height:54px;border-radius:9px;background:rgba(230,57,70,0.09);border:1.5px solid rgba(230,57,70,0.28);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#e63946" stroke-width="1.8" stroke-linecap="round" style="width:22px;height:22px;">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  <span style="font-size:7px;font-weight:900;color:#e63946;letter-spacing:1px;">PDF</span>
                </div>
                <span style="font-size:12px;font-weight:600;color:var(--text-primary);text-align:center;word-break:break-word;line-height:1.35;width:100%;">${a.titulo}</span>
              </div>
            </a>`).join('')}
        </div>
      </div>` : '';

    document.getElementById('pub-view-subtitle').textContent =
      `Realizada em ${formatDataRealizadaText(p.dataRealizada)}${p._arq ? ' · Arquivada (somente leitura)' : ''}`;

    const ativo = t ? state.ativos[t.equipamentoIdx] : null;

    document.getElementById('pub-view-body').innerHTML = `
      ${t?.titulo ? `
      <div style="display:flex;align-items:center;gap:12px;padding:14px 16px;margin-bottom:14px;background:linear-gradient(135deg,var(--cyan-light) 0%,rgba(0,168,204,0.06) 100%);border:1.5px solid rgba(0,168,204,0.25);border-radius:12px;">
        <div style="width:38px;height:38px;border-radius:10px;background:var(--cyan);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" style="width:18px;height:18px;"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/></svg>
        </div>
        <div style="min-width:0;">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--cyan);margin-bottom:3px;">Tarefa</div>
          <div style="font-size:15px;font-weight:700;color:var(--text-primary);line-height:1.3;word-break:break-word;">${t.titulo}</div>
        </div>
      </div>` : ''}
      <div style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap;">
        <div style="flex:1;min-width:220px;">
          <div class="form-section-title" style="margin-bottom:8px;">Ativo</div>
          <div style="background:var(--bg);border:1.2px solid var(--border);border-radius:8px;padding:12px;">
            <div style="font-weight:700;font-size:15px;color:var(--text-primary);">${ativo?.nome || '—'}</div>
            <div style="font-size:13px;color:var(--text-muted);margin-top:6px;">Código: ${ativo?.codigo || '—'}</div>
            <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">
              <span class="chip chip-gray" style="font-size:11px;">Setor: ${_orgEsc(_orgRotuloAtivo(ativo)) || '—'}</span>
              <span class="chip chip-gray" style="font-size:11px;">Categoria: ${ativo?.categoria || '—'}</span>
            </div>
          </div>
        </div>
        <div style="flex:1;min-width:220px;">
          <div class="form-section-title" style="margin-bottom:8px;">Rotina</div>
          <div style="background:var(--bg);border:1.2px solid var(--border);border-radius:8px;padding:12px;">
            <div style="font-weight:700;font-size:15px;color:var(--text-primary);">${rotina?.nome || '—'}</div>
            <div style="font-size:13px;color:var(--text-muted);margin-top:6px;">Tipo: ${rotina?.tipo || '—'}</div>
            <div style="font-size:13px;color:var(--text-muted);margin-top:4px;">Frequência: ${t?.fazerCada ? `A cada ${t.fazerCada} ${t.frequencia}` : '—'}</div>
            <div style="font-size:13px;color:var(--text-muted);margin-top:4px;">Repetir: ${t?.repetir === 'Por' ? (t?.vezes || '—') + 'x' : (t?.repetir || 'Sempre')}</div>
          </div>
        </div>
      </div>

      <div style="margin-top:14px;" class="view-hero">
        <div class="view-hero-name">Execução</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">Tarefa: ${getTarefaLabel(t)}</div>
        <div class="view-badges" style="margin-top:8px;">
          <span class="view-badge">Realizada: ${formatDataRealizadaText(p.dataRealizada)}</span>
          ${p.publicadoPorNome ? `<span class="view-badge">Por: ${p.publicadoPorNome}</span>` : ''}
        </div>
      </div>

      ${(p.empresaResponsavel || p.tecnicoResponsavel) ? (() => {
        const empObj = typeof empState !== 'undefined' ? empState.empresas.find(e => e.nome === p.empresaResponsavel) : null;
        const respObj = empObj?.responsaveis?.find(r => r.nome === p.tecnicoResponsavel);
        const waIcon = (num) => num ? `<a href="https://wa.me/${num.replace(/\D/g,'')}" target="_blank" style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#25d366;color:#fff;text-decoration:none;margin-left:4px;" onclick="event.stopPropagation()"><svg viewBox="0 0 24 24" fill="currentColor" style="width:10px;height:10px;"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.557 4.12 1.528 5.852L0 24l6.335-1.507A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.79 9.79 0 01-5.012-1.376l-.36-.213-3.757.893.946-3.656-.235-.376A9.79 9.79 0 012.182 12C2.182 6.565 6.565 2.182 12 2.182S21.818 6.565 21.818 12 17.435 21.818 12 21.818z"/></svg></a>` : '';
        return `<div style="margin-top:14px;background:var(--bg);border:1.2px solid var(--border);border-radius:8px;padding:12px;">
          <div class="form-section-title" style="margin-bottom:8px;">Terceiro Responsável</div>
          <div style="display:flex;gap:18px;flex-wrap:wrap;">
            ${p.empresaResponsavel ? `<div><div class="detail-label">Empresa Responsável</div>
              <div style="font-size:13px;color:var(--text-secondary);margin-top:2px;">${p.empresaResponsavel}</div>
              ${empObj?.email ? `<div style="font-size:11px;color:var(--text-muted);">${empObj.email}</div>` : ''}
              ${(empObj?.contatos||[]).filter(c=>c.tipo==='WhatsApp').map(c=>`<div style="font-size:11px;color:var(--cyan);display:flex;align-items:center;">${c.valor}${waIcon(c.valor)}</div>`).join('')}
            </div>` : ''}
            ${p.tecnicoResponsavel ? `<div><div class="detail-label">Técnico Responsável</div>
              <div style="font-size:13px;color:var(--text-secondary);margin-top:2px;display:flex;align-items:center;gap:4px;">${p.tecnicoResponsavel}${respObj?.contato ? waIcon(respObj.contato) : ''}</div>
              ${respObj?.contato ? `<div style="font-size:11px;color:var(--cyan);">${respObj.contato}</div>` : ''}
            </div>` : ''}
          </div>
        </div>`;
      })() : ''}

      ${checkListHtml(tarefaChecklist, 'Checklist da Tarefa Verificado', p.checklistLotes)}
      ${anexosHtml}
      ${p.notas ? `
        <div class="detail-note" style="margin-top:14px;">
          <div class="detail-label" style="margin-bottom:6px;">Observações</div>
          <div style="font-size:13px;color:var(--text-secondary);white-space:pre-line;">${p.notas}</div>
        </div>` : ''}`;

    const btnEditPub = document.getElementById('btn-editar-pub-view');
    if (btnEditPub) btnEditPub.style.display = (_can('atividades.editar') && !p._arq) ? '' : 'none';

    const btnExcluirPubView = document.getElementById('btn-excluir-pub-view');
    if (btnExcluirPubView) btnExcluirPubView.style.display = (_can('atividades.excluir') && !p._arq) ? '' : 'none';

    openModal('modal-pub-view');
  }

  // ══════════════════════════════════════════
  // ── TABELA DE ATIVIDADES ──
  // ══════════════════════════════════════════
  const PER_PAGE = 20;
  const ATIVIDADES_PER_PAGE = PER_PAGE;
  let _atividadesPage = 0;
  let _rotinasPage    = 0;
  let _tarefasPage    = 0;
  let _atividadesSort = { col: 'dataRealizada', dir: 'desc' };
  let _rotinasSort    = { col: 'nome', dir: 'asc' };
  let _tarefasSort    = { col: 'dataTarefa', dir: 'asc' };

  function sortRotinasBy(col) {
    _rotinasSort = _rotinasSort.col === col
      ? { col, dir: _rotinasSort.dir === 'asc' ? 'desc' : 'asc' }
      : { col, dir: 'asc' };
    renderRotinasTable(0);
  }

  function sortTarefasBy(col) {
    _tarefasSort = _tarefasSort.col === col
      ? { col, dir: _tarefasSort.dir === 'asc' ? 'desc' : 'asc' }
      : { col, dir: col === 'dataTarefa' || col === 'proximaData' ? 'asc' : 'asc' };
    renderTarefasTable(0);
  }

  function renderAtividadesTable(page) {
    if (page !== undefined) _atividadesPage = page;
    const tbody = document.getElementById('atividades-tbody');
    if (!tbody) return;

    const fAtivoIdx  = state._ativoFiltroAtividadesIdx ?? null;
    const fRotinaId  = state._rotinaFiltroAtividadesId ?? null;
    const fSetor     = document.getElementById('filter-setor-rotina-val')?.value || '';
    const fTabSetor  = typeof _getTabFiltroVal === 'function' ? _getTabFiltroVal('atividades','setor') : '';
    const fTabUnidade = typeof _getTabFiltroVal === 'function' ? _getTabFiltroVal('atividades','unidade') : '';
    const fUnidade   = document.getElementById('filter-unidade-rotina-val')?.value || '';
    const fTabCat    = typeof _getTabFiltroVal === 'function' ? _getTabFiltroVal('atividades','cat')   : '';
    const fTabTipo   = typeof _getTabFiltroTipo === 'function' ? _getTabFiltroTipo('atividades')       : '';
    const canEdit   = typeof authHasPermission !== 'function' || authHasPermission('atividades.editar');
    const canDelete = typeof authHasPermission !== 'function' || authHasPermission('atividades.excluir');
    const _sess = typeof currentSession !== 'undefined' ? currentSession : null;
    const { col: sCol, dir: sDir } = _atividadesSort;
    const tarefaVisivel = t => {
      if (!t) return false;
      const ativo = state.ativos[t.equipamentoIdx];
      if (!ativo) return false;
      if (typeof _userCanSeeAtivo === 'function' && !_userCanSeeAtivo(ativo)) return false;
      if (!_orgAtivoPassa(ativo, fUnidade, fSetor)) return false;
      if (!_orgAtivoPassa(ativo, fTabUnidade, fTabSetor)) return false;
      if (fTabCat   && ativo.categoria !== fTabCat) return false;
      if (fTabTipo) {
        const rotina = state.rotinas.find(r => r.id === t.rotinaId);
        if (!rotina || rotina.tipo !== fTabTipo) return false;
      }
      if (fAtivoIdx !== null && t.equipamentoIdx !== fAtivoIdx) return false;
      if (fRotinaId !== null && t.rotinaId !== fRotinaId) return false;
      return true;
    };
    const tarefasVisiveis = new Set(state.tarefas.filter(tarefaVisivel).map(t => t.id));
    arqRenderRodape('atividades-arq-rodape', document.querySelector('#rpanel-atividades .data-table-wrapper'), [...tarefasVisiveis]);
    const allPubs = todasPublicacoes()
      .slice()
      .filter(p => {
        if (_minhasAtividadesAtivo && _sess && p.publicadoPorId !== _sess.userId) return false;
        return tarefasVisiveis.has(p.tarefaId);
      })
      .sort((a, b) => {
        const ta = state.tarefas.find(t => t.id === a.tarefaId);
        const tb = state.tarefas.find(t => t.id === b.tarefaId);
        let ka, kb;
        if (sCol === 'dataRealizada') {
          ka = dataRealizadaSortKey(a.dataRealizada);
          kb = dataRealizadaSortKey(b.dataRealizada);
        } else if (sCol === 'dataPublicacao') {
          ka = a.dataPublicacao || '';
          kb = b.dataPublicacao || '';
        } else if (sCol === 'rotina') {
          const ra = ta ? state.rotinas.find(r => r.id === ta.rotinaId) : null;
          const rb = tb ? state.rotinas.find(r => r.id === tb.rotinaId) : null;
          ka = ra?.nome?.toLowerCase() || '';
          kb = rb?.nome?.toLowerCase() || '';
        } else if (sCol === 'equipamento') {
          ka = (ta ? state.ativos[ta.equipamentoIdx]?.nome : null)?.toLowerCase() || '';
          kb = (tb ? state.ativos[tb.equipamentoIdx]?.nome : null)?.toLowerCase() || '';
        } else if (sCol === 'setor') {
          ka = ta ? _orgChaveOrdemAtivo(state.ativos[ta.equipamentoIdx]) : '';
          kb = tb ? _orgChaveOrdemAtivo(state.ativos[tb.equipamentoIdx]) : '';
        } else if (sCol === 'categoria') {
          ka = (ta ? state.ativos[ta.equipamentoIdx]?.categoria : null)?.toLowerCase() || '';
          kb = (tb ? state.ativos[tb.equipamentoIdx]?.categoria : null)?.toLowerCase() || '';
        } else if (sCol === 'publicadoPor') {
          ka = a.publicadoPorNome?.toLowerCase() || '';
          kb = b.publicadoPorNome?.toLowerCase() || '';
        } else {
          ka = kb = '';
        }
        const cmp = ka < kb ? -1 : ka > kb ? 1 : 0;
        return sDir === 'asc' ? cmp : -cmp;
      });

    const totalPages = Math.max(1, Math.ceil(allPubs.length / ATIVIDADES_PER_PAGE));
    if (_atividadesPage >= totalPages) _atividadesPage = totalPages - 1;
    const pubs = allPubs.slice(_atividadesPage * ATIVIDADES_PER_PAGE, (_atividadesPage + 1) * ATIVIDADES_PER_PAGE);

    if (allPubs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="data-table-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        <strong>Nenhuma atividade encontrada</strong>
        <p>Ajuste o filtro ou publique tarefas para ver atividades</p>
      </div></td></tr>`;
      _renderAtividadesPagination(0, 1, 0);
      return;
    }

    tbody.innerHTML = pubs.map(p => {
      const t      = state.tarefas.find(t => t.id === p.tarefaId);
      const rotina = t ? state.rotinas.find(r => r.id === t.rotinaId) : null;
      const ativo  = t ? state.ativos[t.equipamentoIdx] : null;
      return `<tr onclick="viewPublicacao('${p.id}')">
        <td style="font-weight:700;color:var(--text-primary);">${formatDataRealizadaHtml(p.dataRealizada)} ${arqSeloHtml(p)}</td>
        <td>
          <div style="font-weight:600;">Rotina: ${rotina?.nome || '—'}</div>
          <div style="font-size:11px;color:var(--text-muted);">${rotina?.tipo || ''}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Tarefa: ${getTarefaLabel(t)}</div>
        </td>
        <td>
          <div style="font-weight:500;">${ativo?.nome || '—'}</div>
          <div style="font-size:11px;color:var(--text-muted);font-family:'DM Mono',monospace;">${ativo?.codigo || ''}</div>
        </td>
        <td><span class="chip chip-gray">${_orgEsc(_orgRotuloAtivo(ativo)) || '—'}</span></td>
        <td><span class="chip chip-gray">${ativo?.categoria || '—'}</span></td>
        <td style="font-size:12px;color:var(--text-muted);">${formatDate(p.dataPublicacao)}</td>
        <td style="font-size:12.5px;">${p.publicadoPorNome || '<span style="color:var(--text-muted)">—</span>'}</td>
        <td onclick="event.stopPropagation();" style="white-space:nowrap;">
          ${canEdit && !p._arq ? `<button class="btn btn-outline btn-icon" onclick="abrirEditarPublicacao('${p.id}')" title="Editar" style="padding:5px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:13px;height:13px;"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg></button>` : ''}
          ${canDelete && !p._arq ? `<button class="btn btn-outline btn-icon" onclick="excluirPublicacao('${p.id}')" title="Excluir" style="padding:5px;color:var(--red);border-color:rgba(230,57,70,0.3);margin-left:4px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:13px;height:13px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>` : ''}
        </td>
      </tr>`;
    }).join('');

    document.querySelectorAll('#atividades-thead-row .th-sortable').forEach(th => {
      const col = th.dataset.sortCol;
      const arrow = col === sCol ? (sDir === 'asc' ? ' ↑' : ' ↓') : '';
      th.dataset.sortArrow = arrow;
      th.classList.toggle('th-sort-active', col === sCol);
    });

    _renderAtividadesPagination(_atividadesPage, totalPages, allPubs.length);
  }

  function _renderAtividadesPagination(page, totalPages, total) {
    let el = document.getElementById('atividades-pagination');
    if (!el) {
      const wrapper = document.querySelector('#rpanel-atividades .data-table-wrapper');
      if (!wrapper) return;
      el = document.createElement('div');
      el.id = 'atividades-pagination';
      el.style.cssText = 'display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:12px 0 0;';
      wrapper.after(el);
    }
    if (totalPages <= 1) { el.innerHTML = ''; return; }
    const start = page * ATIVIDADES_PER_PAGE + 1;
    const end   = Math.min((page + 1) * ATIVIDADES_PER_PAGE, total);
    el.innerHTML = `
      <span style="font-size:12px;color:var(--text-muted);">${start}–${end} de ${total}</span>
      <button class="btn btn-outline btn-icon" onclick="renderAtividadesTable(${page - 1})" ${page === 0 ? 'disabled' : ''} style="padding:5px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <button class="btn btn-outline btn-icon" onclick="renderAtividadesTable(${page + 1})" ${page >= totalPages - 1 ? 'disabled' : ''} style="padding:5px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><polyline points="9 18 15 12 9 6"/></svg>
      </button>`;
  }

  function sortAtividadesBy(col) {
    if (_atividadesSort.col === col) {
      _atividadesSort.dir = _atividadesSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      _atividadesSort = { col, dir: col === 'dataRealizada' || col === 'dataPublicacao' ? 'desc' : 'asc' };
    }
    renderAtividadesTable(0);
  }

  // ══════════════════════════════════════════
  // ── FILTROS DE STATUS ──
  // ══════════════════════════════════════════
  let _rotinaStatusFilter = 'ativo';
  let _tarefaStatusFilter = 'ativo';
  let _avRotinaStatusFilter = 'ativo';

  function getTarefaStatusFilter(ctx) {
    return _tarefaStatusFilter;
  }

  function getRotinaStatusFilter(ctx) {
    if (ctx === 'av') return _avRotinaStatusFilter;
    return _rotinaStatusFilter;
  }

  function rotinaPassesStatusFilter(r, ctx) {
    const f = getRotinaStatusFilter(ctx);
    const rStatus = r.status || 'Ativo';
    if (f === 'ativo' && rStatus !== 'Ativo') return false;
    if (f === 'inativo' && rStatus !== 'Inativo') return false;
    return true;
  }

  function tarefaPassesStatusFilter(t, ctx) {
    const f = getTarefaStatusFilter(ctx);
    const tStatus = t.status || 'Ativo';
    if (f === 'ativo' && tStatus !== 'Ativo') return false;
    if (f === 'inativo' && tStatus !== 'Inativo') return false;
    return true;
  }

  function setRotinaStatusFilter(val) {
    _rotinaStatusFilter = val;
    _rotinasPage = 0;
    ['ativo','inativo','ambos'].forEach(v => {
      const btn = document.getElementById('sfbtn-rotina-' + v);
      if (!btn) return;
      btn.className = 'status-filter-btn' + (v === val ? (v === 'ativo' ? ' active active-green' : v === 'inativo' ? ' active active-gray' : ' active') : '');
    });
    renderRotinasTable();
    updateNotifBadge();
  }

  function setAtivoRotinaStatusFilter(val) {
    _avRotinaStatusFilter = val;
    ['ativo', 'inativo', 'ambos'].forEach(v => {
      const btn = document.getElementById('sfbtn-av-rotina-' + v);
      if (!btn) return;
      btn.className = 'status-filter-btn' + (v === val
        ? (v === 'ativo' ? ' active active-green' : v === 'inativo' ? ' active active-gray' : ' active')
        : '');
    });
    _renderAtivoRotinas();
  }

  function setTarefaStatusFilter(ctx, val) {
    _tarefaStatusFilter = val;

    const prefix = 'sfbtn-tarefa';
    ['ativo', 'inativo', 'ambos'].forEach(v => {
      const btn = document.getElementById(prefix + '-' + v);
      if (!btn) return;
      btn.className = 'status-filter-btn' + (v === val
        ? (v === 'ativo' ? ' active active-green' : v === 'inativo' ? ' active active-gray' : ' active')
        : '');
    });

    _tarefasPage = 0;
    renderTarefasTable();
    updateNotifBadge();
  }

  // ── ALERTAS POR ROTINA ──
  function getRotinaAlerts(rotinaId) {
    const tarefas = state.tarefas.filter(t => t.rotinaId === rotinaId && t.status === 'Ativo');
    let danger = 0, warning = 0;
    tarefas.forEach(t => {
      const f = getTaskFlag(t);
      if (f.cls === 'flag-danger')  danger++;
      else if (f.cls === 'flag-warning') warning++;
    });
    return { danger, warning, total: danger + warning };
  }

  // ══════════════════════════════════════════
  // ── RENDER TABELA DE ROTINAS ──
  // ══════════════════════════════════════════
  function _renderPagination(elId, panelSelector, page, totalPages, total, onPage) {
    let el = document.getElementById(elId);
    if (!el) {
      const wrapper = document.querySelector(panelSelector + ' .data-table-wrapper');
      if (!wrapper) return;
      el = document.createElement('div');
      el.id = elId;
      el.style.cssText = 'display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:12px 0 0;flex-shrink:0;';
      wrapper.after(el);
    }
    if (totalPages <= 1) { el.innerHTML = ''; return; }
    const start = page * PER_PAGE + 1;
    const end   = Math.min((page + 1) * PER_PAGE, total);
    el.innerHTML = `
      <span style="font-size:12px;color:var(--text-muted);">${start}–${end} de ${total}</span>
      <button class="btn btn-outline btn-icon" onclick="${onPage}(${page - 1})" ${page === 0 ? 'disabled' : ''} style="padding:5px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <button class="btn btn-outline btn-icon" onclick="${onPage}(${page + 1})" ${page >= totalPages - 1 ? 'disabled' : ''} style="padding:5px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><polyline points="9 18 15 12 9 6"/></svg>
      </button>`;
  }

  function renderRotinasTable(page) {
    if (page !== undefined) _rotinasPage = page;
    const tbody = document.getElementById('rotinas-tbody');
    if (!tbody) return;
    const fTipo   = document.getElementById('filter-tipo')?.value || '';
    const fSetor  = document.getElementById('filter-setor-rotina-val')?.value || '';
    const fUnidade = document.getElementById('filter-unidade-rotina-val')?.value || '';
    const fCat    = document.getElementById('filter-cat-rotina-val')?.value || '';
    const fAtivoIdx = state._ativoFiltroIdx ?? null;

    const { col: rSCol, dir: rSDir } = _rotinasSort;
    const allList = state.rotinas.filter(r => {
      const ativo = state.ativos[r.equipamentoIdx];
      if (!ativo) return false;
      if (typeof _userCanSeeAtivo === 'function' && !_userCanSeeAtivo(ativo)) return false;
      if (fAtivoIdx !== null && r.equipamentoIdx !== fAtivoIdx) return false;
      if (fTipo && r.tipo !== fTipo) return false;
      if (!_orgAtivoPassa(ativo, fUnidade, fSetor)) return false;
      if (fCat && ativo.categoria !== fCat) return false;
      const rStatus = r.status || 'Ativo';
      if (_rotinaStatusFilter === 'ativo' && rStatus !== 'Ativo') return false;
      if (_rotinaStatusFilter === 'inativo' && rStatus !== 'Inativo') return false;
      return true;
    }).sort((a, b) => {
      const ativoA = state.ativos[a.equipamentoIdx];
      const ativoB = state.ativos[b.equipamentoIdx];
      let ka, kb;
      if (rSCol === 'nome')       { ka = a.nome?.toLowerCase() || '';          kb = b.nome?.toLowerCase() || ''; }
      else if (rSCol === 'equipamento') { ka = ativoA?.nome?.toLowerCase() || ''; kb = ativoB?.nome?.toLowerCase() || ''; }
      else if (rSCol === 'tipo')  { ka = a.tipo?.toLowerCase() || '';           kb = b.tipo?.toLowerCase() || ''; }
      else if (rSCol === 'setor') { ka = _orgChaveOrdemAtivo(ativoA);    kb = _orgChaveOrdemAtivo(ativoB); }
      else if (rSCol === 'categoria') { ka = ativoA?.categoria?.toLowerCase() || ''; kb = ativoB?.categoria?.toLowerCase() || ''; }
      else { ka = kb = ''; }
      const cmp = ka < kb ? -1 : ka > kb ? 1 : 0;
      return rSDir === 'asc' ? cmp : -cmp;
    });

    const totalPages = Math.max(1, Math.ceil(allList.length / PER_PAGE));
    if (_rotinasPage >= totalPages) _rotinasPage = totalPages - 1;
    const list = allList.slice(_rotinasPage * PER_PAGE, (_rotinasPage + 1) * PER_PAGE);

    if (allList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="data-table-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <strong>Nenhuma rotina encontrada</strong>
        <p>Ajuste os filtros ou cadastre uma nova rotina com o botão "+"</p>
      </div></td></tr>`;
      _renderPagination('rotinas-pagination', '#rpanel-rotinas', 0, 1, 0, 'renderRotinasTable');
      return;
    }

    const tipoCls = { Preventivo:'chip-blue', Rotina:'chip-cyan' };

    tbody.innerHTML = list.map(r => {
      const ativo     = state.ativos[r.equipamentoIdx];
      const clChip    = tipoCls[r.tipo] || 'chip-gray';
      const nItems    = r.checklist?.length || 0;
      const isInativo = r.status === 'Inativo';
      const alerts    = getRotinaAlerts(r.id);

      let alertBadge = '';
      if (!isInativo && alerts.total > 0) {
        const cls  = alerts.danger > 0 ? 'flag-danger' : 'flag-warning';
        const icon = alerts.danger > 0
          ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:11px;height:11px;flex-shrink:0;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
          : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:11px;height:11px;flex-shrink:0;"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/></svg>`;
        const tip  = [alerts.danger > 0 ? `${alerts.danger} vencida(s)` : '', alerts.warning > 0 ? `${alerts.warning} próxima(s)` : ''].filter(Boolean).join(', ');
        alertBadge = `<span class="task-flag ${cls}" style="font-size:10px;padding:2px 7px;margin-left:6px;" title="${tip}">${icon}${alerts.total}</span>`;
      }

      return `<tr onclick="viewRotina('${r.id}')" style="${isInativo ? 'opacity:0.6;' : ''}">
        <td>
          <div style="display:flex;align-items:center;">
            <strong style="font-weight:600;">${r.nome}</strong>
            ${isInativo ? '<span class="chip chip-gray" style="margin-left:6px;font-size:10px;">Inativa</span>' : alertBadge}
          </div>
        </td>
        <td>
          <div style="font-weight:500;">${ativo?.nome || '—'}</div>
          <div style="font-size:11px;color:var(--text-muted);font-family:'DM Mono',monospace;">${ativo?.codigo || ''}</div>
        </td>
        <td><span class="chip ${clChip}">${r.tipo}</span></td>
        <td><span class="chip chip-gray">${_orgEsc(_orgRotuloAtivo(ativo)) || '—'}</span></td>
        <td><span class="chip chip-gray">${ativo?.categoria || '—'}</span></td>
        <td>${nItems > 0
          ? `<span class="chip chip-green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px;"><polyline points="9 11 12 14 22 4"/></svg>${nItems} item${nItems>1?'s':''}</span>`
          : '<span style="color:var(--text-muted);font-size:12px;">—</span>'}</td>
      </tr>`;
    }).join('');
    document.querySelectorAll('#rotinas-thead-row .th-sortable').forEach(th => {
      const col = th.dataset.sortCol;
      th.dataset.sortArrow = col === rSCol ? (rSDir === 'asc' ? ' ↑' : ' ↓') : '';
      th.classList.toggle('th-sort-active', col === rSCol);
    });
    _renderPagination('rotinas-pagination', '#rpanel-rotinas', _rotinasPage, totalPages, allList.length, 'renderRotinasTable');
    updateNotifBadge();
  }

  // ── ATIVO SELECIONADO COMO FILTRO ──
  let _ativoFiltroNome = null;
  function setAtivoFiltro(idx) {
    state._ativoFiltroIdx = idx;
    const ativo = state.ativos[idx];
    _ativoFiltroNome = ativo?.nome || null;
    const display = document.getElementById('ativo-selector-display');
    if (display) {
      if (ativo) {
        display.innerHTML = `<div class="ativo-selecionado-chip" onclick="limparAtivoFiltro()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;"><path d="M20 16V7a2 2 0 00-2-2H6a2 2 0 00-2 2v9"/></svg>
          ${ativo.nome}
          <span class="chip-x" title="Limpar">&times;</span>
        </div>`;
      } else {
        display.innerHTML = `<button class="btn-select-ativo" onclick="openAtivoSelectorModal()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          Selecionar Ativo
        </button>`;
      }
    }
    // Ocultar filtros de setor/categoria quando um ativo está selecionado
    const setorEl = document.getElementById('filter-setor-rotina');
    const unEl    = document.getElementById('filter-unidade-rotina');
    const catEl   = document.getElementById('filter-cat-rotina');
    if (setorEl) setorEl.style.display = ativo ? 'none' : '';
    if (unEl)    unEl.style.display    = (ativo || !_orgMigrado()) ? 'none' : '';
    if (catEl)   catEl.style.display   = ativo ? 'none' : '';
    _rotinasPage = 0;
    renderRotinasTable();
    updateNotifBadge();
    closeModal('modal-ativo-selector');
  }
  function limparAtivoFiltro() { setAtivoFiltro(undefined); state._ativoFiltroIdx = null; updateNotifBadge(); }

  // ── ATIVO FILTRO TAREFAS ──
  function setAtivoFiltroTarefas(idx) {
    state._ativoFiltroTarefasIdx = (idx !== undefined) ? idx : null;
    const ativo = idx !== undefined ? state.ativos[idx] : null;
    const display = document.getElementById('ativo-selector-display-tarefas');
    if (display) {
      if (ativo) {
        display.innerHTML = `<div class="ativo-selecionado-chip" onclick="limparAtivoFiltroTarefas()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;"><path d="M20 16V7a2 2 0 00-2-2H6a2 2 0 00-2 2v9"/></svg>
          ${ativo.nome}
          <span class="chip-x" title="Limpar">&times;</span>
        </div>`;
      } else {
        display.innerHTML = `<button class="btn-select-ativo" onclick="openAtivoSelectorCtx('tarefas')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          Filtrar por Ativo
        </button>`;
      }
    }
    _tarefasPage = 0;
    _updateRotinaFiltroTarefasWrap();
    renderTarefasTable();
    updateNotifBadge();
    closeModal('modal-ativo-selector');
  }
  function limparAtivoFiltroTarefas() {
    state._rotinaFiltroTarefasId = null;
    _updateRotinaFiltroTarefasDisplay();
    setAtivoFiltroTarefas(undefined);
    updateNotifBadge();
  }

  // ── ROTINA FILTRO TAREFAS ──
  function _updateRotinaFiltroTarefasWrap() {
    const wrap = document.getElementById('rotina-filter-tarefas-wrap');
    if (!wrap) return;
    const hasAtivo = (state._ativoFiltroTarefasIdx ?? null) !== null;
    wrap.style.display = hasAtivo ? '' : 'none';
    if (!hasAtivo) {
      state._rotinaFiltroTarefasId = null;
      _updateRotinaFiltroTarefasDisplay();
    }
  }

  function _updateRotinaFiltroTarefasDisplay() {
    const wrap = document.getElementById('rotina-filter-tarefas-wrap');
    if (!wrap) return;
    const rotinaId = state._rotinaFiltroTarefasId ?? null;
    if (rotinaId) {
      const rotina = state.rotinas.find(r => r.id === rotinaId);
      wrap.innerHTML = `<div class="ativo-selecionado-chip" onclick="limparRotinaFiltroTarefas()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        ${rotina?.nome || 'Rotina'}
        <span class="chip-x" title="Limpar">&times;</span>
      </div>`;
    } else {
      wrap.innerHTML = `<button class="btn-select-ativo" id="btn-filtrar-rotina-tarefas" onclick="openRotinaSelectorCtx('tarefas')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/></svg>
        Filtrar por Rotina
      </button>`;
    }
  }

  function setRotinaFiltroTarefas(rotinaId) {
    state._rotinaFiltroTarefasId = rotinaId ?? null;
    _tarefasPage = 0;
    _updateRotinaFiltroTarefasDisplay();
    renderTarefasTable();
    updateNotifBadge();
    closeModal('modal-rotina-selector-tarefas');
  }

  function limparRotinaFiltroTarefas() {
    setRotinaFiltroTarefas(null);
  }

  let _rotinaSelectorCtx = 'tarefas';
  function openRotinaSelectorCtx(ctx) {
    _rotinaSelectorCtx = ctx;
    const isAtiv   = ctx === 'atividades';
    const isAgenda = ctx === 'agenda';
    const fAtivoIdx = isAtiv
      ? (state._ativoFiltroAtividadesIdx ?? null)
      : isAgenda
        ? (state._ativoFiltroAgendaIdx ?? null)
        : (state._ativoFiltroTarefasIdx ?? null);

    const rotinas = state.rotinas.filter(r => {
      if (fAtivoIdx !== null) {
        if (isAtiv) return state.tarefas.some(t =>
          t.rotinaId === r.id && t.equipamentoIdx === fAtivoIdx && arqTemPubs(t.id));
        return state.tarefas.some(t => t.rotinaId === r.id && t.equipamentoIdx === fAtivoIdx);
      }
      return true;
    });

    const setFn  = isAtiv ? `setRotinaFiltroAtividades` : isAgenda ? `setRotinaFiltroAgenda` : `setRotinaFiltroTarefas`;
    const listId  = isAtiv ? 'rotina-selector-atividades-list' : isAgenda ? 'rotina-selector-agenda-list' : 'rotina-selector-tarefas-list';
    const modalId = isAtiv ? 'modal-rotina-selector-atividades' : isAgenda ? 'modal-rotina-selector-agenda' : 'modal-rotina-selector-tarefas';

    const list = document.getElementById(listId);
    if (!list) return;
    list.innerHTML = rotinas.length === 0
      ? `<div class="ativo-search-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>Nenhuma rotina encontrada</div>`
      : rotinas.map(r => `<div class="ativo-search-card" onclick="${setFn}('${r.id}')">
          <div class="ativo-search-card-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </div>
          <div>
            <div class="ativo-search-card-name">${r.nome}</div>
            <div class="ativo-search-card-meta">${r.tipo || ''}</div>
          </div>
        </div>`).join('');
    openModal(modalId);
  }

  // ── ROTINA FILTRO ATIVIDADES ──
  function _updateRotinaFiltroAtividadesDisplay() {
    const wrap = document.getElementById('rotina-filter-atividades-wrap');
    if (!wrap) return;
    const rotinaId = state._rotinaFiltroAtividadesId ?? null;
    if (rotinaId) {
      const rotina = state.rotinas.find(r => r.id === rotinaId);
      wrap.innerHTML = `<div class="ativo-selecionado-chip" onclick="limparRotinaFiltroAtividades()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        ${rotina?.nome || 'Rotina'}
        <span class="chip-x" title="Limpar">&times;</span>
      </div>`;
    } else {
      wrap.innerHTML = `<button class="btn-select-ativo" onclick="openRotinaSelectorCtx('atividades')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/></svg>
        Filtrar por Rotina
      </button>`;
    }
  }

  function setRotinaFiltroAtividades(rotinaId) {
    state._rotinaFiltroAtividadesId = rotinaId ?? null;
    _updateRotinaFiltroAtividadesDisplay();
    _atividadesPage = 0;
    renderAtividadesTable();
    closeModal('modal-rotina-selector-atividades');
  }

  function limparRotinaFiltroAtividades() { setRotinaFiltroAtividades(null); }

  // ── MINHAS TAREFAS ──
  let _minhasTarefasAtivo = false;

  function toggleMinhasTarefas() {
    _minhasTarefasAtivo = !_minhasTarefasAtivo;
    const btn = document.getElementById('btn-minhas-tarefas');
    if (btn) {
      btn.style.background  = _minhasTarefasAtivo ? 'var(--night)' : '';
      btn.style.color       = _minhasTarefasAtivo ? '#fff' : '';
      btn.style.borderColor = _minhasTarefasAtivo ? 'var(--night)' : '';
      btn.style.boxShadow   = _minhasTarefasAtivo ? '0 3px 10px rgba(14,22,40,0.25)' : '';
    }
    renderTarefasTable();
  }

  // ── MINHAS ATIVIDADES ──
  let _minhasAtividadesAtivo = false;

  function toggleMinhasAtividades() {
    _minhasAtividadesAtivo = !_minhasAtividadesAtivo;
    const btn = document.getElementById('btn-minhas-atividades');
    if (btn) {
      btn.style.background  = _minhasAtividadesAtivo ? 'var(--night)' : '';
      btn.style.color       = _minhasAtividadesAtivo ? '#fff' : '';
      btn.style.borderColor = _minhasAtividadesAtivo ? 'var(--night)' : '';
      btn.style.boxShadow   = _minhasAtividadesAtivo ? '0 3px 10px rgba(14,22,40,0.25)' : '';
    }
    _atividadesPage = 0;
    renderAtividadesTable();
  }

  // ── ATIVO FILTRO ATIVIDADES ──
  function setAtivoFiltroAtividades(idx) {
    state._ativoFiltroAtividadesIdx = (idx !== undefined) ? idx : null;
    const ativo = idx !== undefined ? state.ativos[idx] : null;
    const display = document.getElementById('ativo-selector-display-atividades');
    const rotinaWrap = document.getElementById('rotina-filter-atividades-wrap');
    if (display) {
      if (ativo) {
        display.innerHTML = `<div class="ativo-selecionado-chip" onclick="limparAtivoFiltroAtividades()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;"><path d="M20 16V7a2 2 0 00-2-2H6a2 2 0 00-2 2v9"/></svg>
          ${ativo.nome}
          <span class="chip-x" title="Limpar">&times;</span>
        </div>`;
      } else {
        display.innerHTML = `<button class="btn-select-ativo" onclick="openAtivoSelectorCtx('atividades')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          Filtrar por Ativo
        </button>`;
      }
    }
    // Mostra o filtro de rotina apenas quando há ativo selecionado
    if (rotinaWrap) {
      if (ativo) {
        rotinaWrap.style.display = '';
      } else {
        rotinaWrap.style.display = 'none';
        // Limpa o filtro de rotina ao desselecionar o ativo
        state._rotinaFiltroAtividadesId = null;
        _updateRotinaFiltroAtividadesDisplay();
      }
    }
    renderAtividadesTable();
    updateNotifBadge();
    closeModal('modal-ativo-selector');
  }
  function limparAtivoFiltroAtividades() { setAtivoFiltroAtividades(undefined); updateNotifBadge(); }

  // ── MODAL BUSCA DE ATIVO ──
  let _ativoSelectorCtx = 'rotinas';

  function openAtivoSelectorModal() { openAtivoSelectorCtx('rotinas'); }

  function openAtivoSelectorCtx(ctx) {
    _ativoSelectorCtx = ctx;
    document.getElementById('ativo-selector-search').value = '';
    renderAtivoSelectorList();
    openModal('modal-ativo-selector');
  }

  function renderAtivoSelectorList() {
    const q = document.getElementById('ativo-selector-search').value.toLowerCase();
    const container = document.getElementById('ativo-selector-list');
    // Setor selecionado no dropdown do módulo de rotinas
    const fSetorRotina = (_ativoSelectorCtx === 'rotinas')
      ? (document.getElementById('filter-setor-rotina-val')?.value || '')
      : '';
    const fUnidadeRotina = (_ativoSelectorCtx === 'rotinas')
      ? (document.getElementById('filter-unidade-rotina-val')?.value || '')
      : '';
    const found = state.ativos
      .map((a, i) => ({ a, i }))
      .filter(({ a }) => {
        // Respeita filtro da topbar (permissões + seleção de setor da topbar)
        if (typeof _userCanSeeAtivo === 'function' && !_userCanSeeAtivo(a)) return false;
        // Respeita setor selecionado no dropdown do módulo
        if (!_orgAtivoPassa(a, fUnidadeRotina, fSetorRotina)) return false;
        return !q || (a.nome || '').toLowerCase().includes(q) || (a.codigo || '').toLowerCase().includes(q) || _orgRotuloAtivo(a).toLowerCase().includes(q);
      })
      .sort((x, y) => {
        const sa = _orgChaveOrdemAtivo(x.a);
        const sb = _orgChaveOrdemAtivo(y.a);
        if (sa !== sb) return sa < sb ? -1 : 1;
        const ca = (x.a.codigo || '').toLowerCase();
        const cb = (y.a.codigo || '').toLowerCase();
        return ca < cb ? -1 : ca > cb ? 1 : 0;
      });

    if (found.length === 0) {
      container.innerHTML = `<div class="ativo-search-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        Nenhum ativo encontrado
      </div>`;
      return;
    }
    container.innerHTML = found.map(({ a, i }) => `
      <div class="ativo-search-card" onclick="selectAtivoCtx(${i})">
        <div class="ativo-search-card-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 16V7a2 2 0 00-2-2H6a2 2 0 00-2 2v9m16 0H4"/></svg>
        </div>
        <div>
          <div class="ativo-search-card-name">${a.nome}</div>
          <div class="ativo-search-card-meta">${a.codigo} &bull; ${_orgEsc(_orgRotuloAtivo(a))} &bull; ${a.categoria}</div>
        </div>
      </div>`).join('');
  }

  function selectAtivoCtx(idx) {
    if (_ativoSelectorCtx === 'rotinas') setAtivoFiltro(idx);
    else if (_ativoSelectorCtx === 'tarefas') setAtivoFiltroTarefas(idx);
    else if (_ativoSelectorCtx === 'atividades') setAtivoFiltroAtividades(idx);
    else if (_ativoSelectorCtx === 'agenda' && typeof setAtivoFiltroAgenda === 'function') setAtivoFiltroAgenda(idx);
  }

  // ══════════════════════════════════════════
  // ── DRAWER DE ROTINA ──
  // ══════════════════════════════════════════
  let rotinaEdicaoId = null;

  function openRotinaDrawer(id = null) {
    rotinaEdicaoId = id;
    const editing = id ? state.rotinas.find(r => r.id === id) : null;

    document.getElementById('drawer-rotina-title').textContent = id ? 'Editar Rotina' : 'Nova Rotina';
    const btnHistRotina = document.getElementById('btn-hist-rotina');
    if (btnHistRotina) btnHistRotina.style.display = id ? '' : 'none';
    document.getElementById('drawer-rotina-subtitle').textContent = id ? 'Altere os dados da rotina' : 'Preencha os dados da rotina de manutenção';
    document.getElementById('drawer-save-label').textContent = id ? 'Salvar Alterações' : 'Salvar Rotina';

    // Limpar / preencher campos
    const el = v => document.getElementById(v);
    if (!id) {
      el('rotina-nome').value = '';
      el('rotina-equip-input').value = '';
      el('rotina-tipo').value = '';
      setRotinaEquipDisplay(null);
    } else {
      const r = editing;
      const ativo = state.ativos[r.equipamentoIdx];
      el('rotina-nome').value = r.nome;
      el('rotina-equip-input').value = ativo?.nome || '';
      el('rotina-tipo').value = r.tipo;
      setRotinaEquipDisplay(r.equipamentoIdx);
      _selectedEquipIdx = r.equipamentoIdx;
    }

    populateTipoSelect();
    switchDrawerTab('operacao');

    // Campos isento preventiva
    _rotinaAnexoFiles = [];
    const isentoCheck = document.getElementById('rotina-isento-check');
    const isentoDesc  = document.getElementById('rotina-isento-descricao');
    if (editing && editing.tipo === 'Preventivo') {
      isentoCheck.checked = !!editing.isentoPreventiva;
      isentoDesc.value = editing.isentoDescricao || '';
      _rotinaAnexoFiles = (editing.isentoAnexos || []).map(a => ({ titulo: a.titulo, url: a.url, fileId: a.fileId || null, name: a.titulo }));
    } else {
      isentoCheck.checked = false;
      isentoDesc.value = '';
    }
    toggleIsentoPreventiva();
    if (typeof initUploadZone === 'function') initUploadZone('isento-rotina');
    if (typeof resetUploadZone === 'function') resetUploadZone('isento-rotina');
    _renderIsentoAnexosLista();

    document.getElementById('right-drawer').classList.add('open');
    document.getElementById('drawer-backdrop').classList.add('open');
  }

  // ── ISENTO PREVENTIVA ──
  let _rotinaAnexoFiles = [];

  function toggleIsentoPreventiva() {
    const tipo = document.getElementById('rotina-tipo').value;
    const bloco = document.getElementById('bloco-isento-preventiva');
    if (bloco) bloco.style.display = tipo === 'Preventivo' ? '' : 'none';
    if (tipo !== 'Preventivo') {
      const chk = document.getElementById('rotina-isento-check');
      if (chk) chk.checked = false;
    }
    toggleIsentoFields();
  }

  function toggleIsentoFields() {
    const checked = document.getElementById('rotina-isento-check')?.checked;
    const fields = document.getElementById('bloco-isento-fields');
    if (fields) fields.style.display = checked ? '' : 'none';
  }

  // ── UPLOAD ISENTO PREVENTIVA (via Google Drive) ──

  async function doUploadIsentoAnexo() {
    await doUploadAnexo('isento-rotina', ({ titulo, url, fileId }) => {
      _rotinaAnexoFiles.push({ titulo, url, fileId, name: titulo });
      _renderIsentoAnexosLista();
    }, () => 'Isento');
  }

  async function removeRotinaAnexo(idx) {
    const a = _rotinaAnexoFiles[idx];
    if (!a) return;
    if (a.fileId) {
      try { await driveDelete(a.fileId); } catch (_) {}
    }
    _rotinaAnexoFiles.splice(idx, 1);
    _renderIsentoAnexosLista();
  }

  function _renderIsentoAnexosLista() {
    const container = document.getElementById('rotina-anexos-lista');
    if (!container) return;
    if (_rotinaAnexoFiles.length === 0) { container.innerHTML = ''; return; }
    container.innerHTML = _rotinaAnexoFiles.map((a, i) => `
      <div class="anexo-row-item" style="margin-bottom:6px;">
        <div class="anexo-row-icon" onclick="window.open('${a.url}','_blank')" title="Abrir no Drive" style="cursor:pointer;">
          ${_anexoIcon(a.titulo || a.name, '')}
        </div>
        <div class="anexo-row-body">
          <div class="anexo-titulo-input" style="font-weight:600;font-size:12px;color:var(--text-primary);padding:2px 0;">${a.titulo || a.name}</div>
          <div class="anexo-row-filename">
            <a href="${a.url}" target="_blank" style="color:var(--cyan);text-decoration:none;font-size:10px;">Abrir no Drive ↗</a>
          </div>
        </div>
        <button class="anexo-preview-remove" style="position:static;width:24px;height:24px;flex-shrink:0;" onclick="removeRotinaAnexo(${i})" title="Remover">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" style="width:10px;height:10px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>`).join('');
  }

  function _anexoIcon(name, type) {
    const ext = (name || '').split('.').pop().toLowerCase();
    const isPdf = type === 'application/pdf' || ext === 'pdf';
    const isImg = type && type.startsWith('image/');
    if (isPdf) return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:28px;height:28px;color:#e63946;"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="12" y2="17"/></svg>`;
    if (isImg) return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:28px;height:28px;color:var(--cyan);"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:28px;height:28px;color:var(--text-muted);"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
  }


  function closeRotinaDrawer() {
    document.getElementById('right-drawer').classList.remove('open');
    document.getElementById('drawer-backdrop').classList.remove('open');
    _selectedEquipIdx = null;
    _rotinaAnexoFiles = [];
    if (typeof resetUploadZone === 'function') resetUploadZone('isento-rotina');
  }

  function switchDrawerTab(tab) {
    ['operacao'].forEach(t => {
      document.getElementById('dtab-' + t).classList.toggle('active', t === tab);
      document.getElementById('dtab-btn-' + t).classList.toggle('active', t === tab);
    });
  }

  function toggleTarefaVezesField() {
    const val = document.getElementById('tarefa-repetir').value;
    document.getElementById('tarefa-field-vezes').style.display = val === 'Por' ? '' : 'none';
  }

  // ── EQUIPMENT AUTOCOMPLETE ──
  let _selectedEquipIdx = null;

  function filterEquipAutocomplete() {
    const q = document.getElementById('rotina-equip-input').value.toLowerCase();
    const dd = document.getElementById('rotina-equip-dropdown');
    if (!q) { dd.innerHTML = ''; dd.classList.remove('open'); return; }
    const matches = state.ativos.map((a, i) => ({ a, i }))
      .filter(({ a }) =>
        a.statusUso !== 'em_desuso' &&
        (a.nome.toLowerCase().includes(q) || a.codigo.toLowerCase().includes(q)))
      .sort((x, y) => {
        const sa = _orgChaveOrdemAtivo(x.a), sb = _orgChaveOrdemAtivo(y.a);
        if (sa !== sb) return sa < sb ? -1 : 1;
        const ca = (x.a.codigo || '').toLowerCase(), cb = (y.a.codigo || '').toLowerCase();
        return ca < cb ? -1 : ca > cb ? 1 : 0;
      });
    if (matches.length === 0) {
      dd.innerHTML = '<div class="autocomplete-empty">Nenhum equipamento encontrado</div>';
    } else {
      dd.innerHTML = matches.map(({ a, i }) => `
        <div class="autocomplete-opt" onclick="selectEquip(${i})">
          <div class="autocomplete-opt-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 16V7a2 2 0 00-2-2H6a2 2 0 00-2 2v9m16 0H4"/></svg>
          </div>
          <div>
            <div class="autocomplete-opt-name">${a.nome}</div>
            <div class="autocomplete-opt-meta">${a.codigo} &bull; ${_orgEsc(_orgRotuloAtivo(a))} &bull; ${a.categoria}</div>
          </div>
        </div>`).join('');
    }
    dd.classList.add('open');
  }

  function selectEquip(idx) {
    _selectedEquipIdx = idx;
    const ativo = state.ativos[idx];
    document.getElementById('rotina-equip-input').value = ativo.nome;
    setRotinaEquipDisplay(idx);
    closeEquipDropdown();
  }

  function closeEquipDropdown() {
    document.getElementById('rotina-equip-dropdown')?.classList.remove('open');
  }

  function setRotinaEquipDisplay(idx) {
    const ativo = idx !== null && idx !== undefined ? state.ativos[idx] : null;
    const s = document.getElementById('rotina-setor-display');
    const c = document.getElementById('rotina-cat-display');
    if (ativo) {
      s.innerHTML = `<span class="read-field-badge">${_orgEsc(_orgRotuloAtivo(ativo))}</span>`;
      c.innerHTML = `<span class="read-field-badge">${ativo.categoria}</span>`;
    } else {
      s.innerHTML = `<span class="read-field-placeholder">— automático —</span>`;
      c.innerHTML = `<span class="read-field-placeholder">— automático —</span>`;
    }
  }

  // ── SALVAR ROTINA ──
  function saveRotina() {
    const isNew = !rotinaEdicaoId;
    if (isNew && !_can('rotinas.criar'))  { showToast('Sem permissão para criar rotinas.', 'error'); return; }
    if (!isNew && !_can('rotinas.editar')) { showToast('Sem permissão para editar rotinas.', 'error'); return; }
    const nome = document.getElementById('rotina-nome').value.trim();
    const tipo = document.getElementById('rotina-tipo').value;

    if (!nome) { showToast('Informe o nome da rotina.', 'error'); return; }
    if (_selectedEquipIdx === null || _selectedEquipIdx === undefined) {
      const typed = document.getElementById('rotina-equip-input').value.trim().toLowerCase();
      const found = state.ativos.findIndex(a => a.nome.toLowerCase() === typed);
      if (found === -1) { showToast('Selecione um equipamento válido da lista.', 'error'); return; }
      _selectedEquipIdx = found;
    }
    if (!tipo) { showToast('Selecione o tipo da rotina.', 'error'); return; }

    const rotinaExistente = rotinaEdicaoId ? state.rotinas.find(r => r.id === rotinaEdicaoId) : null;

    // Campos isento preventiva
    const isentoCheck = document.getElementById('rotina-isento-check');
    const isentoDesc  = document.getElementById('rotina-isento-descricao');
    const isentoAtivo = tipo === 'Preventivo' && isentoCheck?.checked;
    const isentoDescricao = isentoAtivo ? (isentoDesc?.value.trim() || '') : '';

    const _buildRotina = (anexosSalvos) => {
      const rotina = {
        id: rotinaEdicaoId || uid(),
        nome, tipo, equipamentoIdx: _selectedEquipIdx,
        equipamentoId: state.ativos[_selectedEquipIdx]?.id || null,
        status: rotinaExistente?.status || 'Ativo',
        _historico: rotinaExistente?._historico || [],
        isentoPreventiva: isentoAtivo,
        isentoDescricao: isentoDescricao,
        isentoAnexos: isentoAtivo ? anexosSalvos : []
      };
      _registrarEdicao(rotina, rotinaExistente);
      if (rotinaEdicaoId) {
        const idx = state.rotinas.findIndex(r => r.id === rotinaEdicaoId);
        if (idx >= 0) state.rotinas[idx] = rotina;
        showToast('Rotina atualizada!', 'success');
      } else {
        state.rotinas.push(rotina);
        showToast('Rotina cadastrada!', 'success');
      }
      saveState();
      closeRotinaDrawer();
    };

    // Anexos já foram enviados ao Drive individualmente — salvar apenas metadados
    const anexosSalvos = _rotinaAnexoFiles.map(a => ({ titulo: a.titulo || a.name, url: a.url, fileId: a.fileId || null }));
    _buildRotina(anexosSalvos);
  }


  // ── TIPOS DE ROTINA ──
  function populateTipoSelect() {
    const sel = document.getElementById('rotina-tipo');
    const cur = sel.value;
    const filt = document.getElementById('filter-tipo');
    sel.innerHTML = `<option value="">Selecione...</option>` +
      state.tiposRotina.map(t => `<option value="${t}">${t}</option>`).join('');
    if (cur) sel.value = cur;
    filt.innerHTML = `<option value="">Tipo (Todos)</option>` +
      state.tiposRotina.map(t => `<option value="${t}">${t}</option>`).join('');
  }

  function openTipoModal() {
    _tipoEdicaoIdx = -1;
    renderTipoList();
    document.getElementById('input-novo-tipo').value = '';
    const btn = document.getElementById('tipo-save-btn');
    if (btn) btn.textContent = 'Adicionar';
    openModal('modal-tipo');
  }

  function renderTipoList() {
    const container = document.getElementById('tipo-list');
    const fixed = ['Preventivo', 'Rotina'];
    container.innerHTML = state.tiposRotina.map((t, i) => `
      <div class="list-item-row">
        <span class="list-item-name">${t}${fixed.includes(t) ? ' <span style="font-size:10px;color:var(--text-muted);">(padrão)</span>' : ''}</span>
        <span class="list-item-actions">
          ${!fixed.includes(t) ? `
          <button class="btn btn-outline btn-icon" onclick="editarTipo(${i})" title="Editar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn btn-outline btn-icon" onclick="removerTipo(${i})" style="color:var(--red);" title="Remover">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
          </button>` : ''}
        </span>
      </div>`).join('');
  }

  function salvarTipo() {
    salvarTipoEdicao();
  }

  function removerTipo(idx) {
    const fixed = ['Preventivo', 'Rotina'];
    if (fixed.includes(state.tiposRotina[idx])) return;
    const nome = state.tiposRotina[idx];
    const emUso = state.rotinas.some(r => r.tipo === nome);
    if (emUso) { showToast('Não é possível excluir: há rotinas cadastradas com este tipo.', 'error'); return; }
    state.tiposRotina.splice(idx, 1);
    saveState();
    renderTipoList();
    populateTipoSelect();
  }

  let _tipoEdicaoIdx = -1;

  function editarTipo(idx) {
    const fixed = ['Preventivo', 'Rotina'];
    if (fixed.includes(state.tiposRotina[idx])) return;
    _tipoEdicaoIdx = idx;
    document.getElementById('input-novo-tipo').value = state.tiposRotina[idx];
    const btn = document.getElementById('tipo-save-btn');
    if (btn) { btn.textContent = 'Salvar'; }
  }

  function salvarTipoEdicao() {
    const val = document.getElementById('input-novo-tipo').value.trim();
    if (!val) return;
    if (_tipoEdicaoIdx >= 0) {
      const oldVal = state.tiposRotina[_tipoEdicaoIdx];
      if (oldVal !== val) {
        if (state.tiposRotina.includes(val)) { showToast('Já existe um tipo com esse nome.', 'error'); return; }
        state.tiposRotina[_tipoEdicaoIdx] = val;
        state.rotinas.forEach(r => { if (r.tipo === oldVal) r.tipo = val; });
      }
      _tipoEdicaoIdx = -1;
      const btn = document.getElementById('tipo-save-btn');
      if (btn) btn.textContent = 'Adicionar';
    } else {
      if (state.tiposRotina.includes(val)) return;
      state.tiposRotina.push(val);
    }
    saveState();
    renderTipoList();
    populateTipoSelect();
    document.getElementById('input-novo-tipo').value = '';
  }

  // ── VER / EDITAR / DELETAR ROTINA ──
  let rotinaViewId = null;

  // Helper: mostra/esconde botão por ID com base em permissão
  function _mbtn(id, visible) {
    const el = document.getElementById(id);
    if (el) el.style.display = visible ? '' : 'none';
  }
  function _can(key) {
    return typeof authHasPermission !== 'function' || authHasPermission(key);
  }

  function viewRotina(id) {
    rotinaViewId = id;
    renderRotinaViewInfo();
    openModal('modal-rotina-view');
    // Permissões
    _mbtn('btn-editar-rotina',  _can('rotinas.editar'));
    _mbtn('btn-toggle-rotina',  _can('rotinas.editar'));
    // Excluir: só visível se não há tarefas vinculadas
    const temTarefasRotina = state.tarefas.some(t => t.rotinaId === rotinaViewId);
    const btnDelRotina = document.getElementById('btn-excluir-rotina');
    if (btnDelRotina) btnDelRotina.style.display = (!temTarefasRotina && _can('rotinas.excluir')) ? '' : 'none';
  }

  function renderRotinaViewInfo() {
    const r = state.rotinas.find(r => r.id === rotinaViewId);
    if (!r) return;
    const ativo  = state.ativos[r.equipamentoIdx];
    const isInativo = r.status === 'Inativo';

    document.getElementById('rotina-view-title').textContent = r.nome;
    document.getElementById('rotina-view-subtitle').textContent = isInativo ? 'Rotina Inativa' : 'Informações completas';

    // Atualiza botão toggle
    const btnToggle = document.getElementById('btn-toggle-rotina');
    if (btnToggle) {
      if (isInativo) {
        btnToggle.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:16px;height:16px;"><polygon points="5 3 19 12 5 21 5 3"/></svg> Ativar`;
        btnToggle.style.color = 'var(--green)';
        btnToggle.style.borderColor = 'rgba(42,157,143,0.4)';
      } else {
        btnToggle.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:16px;height:16px;"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Inativar`;
        btnToggle.style.color = '';
        btnToggle.style.borderColor = '';
      }
    }

    document.getElementById('rotina-view-body').innerHTML = `
      <div class="view-hero">
        <div class="view-hero-name">${r.nome}</div>
        <div class="view-badges" style="margin-top:10px;">
          <span class="view-badge">${r.tipo}</span>
          ${isInativo ? '<span class="view-badge" style="background:rgba(230,57,70,0.15);border-color:rgba(230,57,70,0.3);color:var(--red);">Inativa</span>' : ''}
        </div>
      </div>
      <div class="rotina-view-grid">
        <div class="detail-card"><div class="detail-label">Equipamento</div><div class="detail-value">${ativo?.nome||'—'}</div></div>
        <div class="detail-card"><div class="detail-label">Código</div><div class="detail-value" style="font-family:'DM Mono',monospace;">${ativo?.codigo||'—'}</div></div>
        <div class="detail-card"><div class="detail-label">Setor</div><div class="detail-value">${_orgEsc(_orgRotuloAtivo(ativo)) || '—'}</div></div>
        <div class="detail-card"><div class="detail-label">Categoria</div><div class="detail-value">${ativo?.categoria||'—'}</div></div>
      </div>
      ${r.checklist?.length > 0 ? `
        <div style="margin-top:16px;">
          <div class="form-section-title" style="margin-bottom:10px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 11 12 14 22 4"/></svg>
            Checklist (${r.checklist.length} item${r.checklist.length>1?'s':''})
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;">
            ${r.checklist.map((it,i) => `<div class="checklist-item-row" style="cursor:default;">
              <div class="checklist-item-num">${i+1}</div>
              <div class="checklist-item-text">${it.texto}</div>
            </div>`).join('')}
          </div>
        </div>` : ''}
      ${r.tipo === 'Preventivo' && r.isentoPreventiva ? `
        <div class="isento-view-card">
          <div class="isento-view-header">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="width:18px;height:18px;flex-shrink:0;"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
            Isento de Manutenção Preventiva
          </div>
          ${r.isentoDescricao ? `<div class="isento-view-desc">${r.isentoDescricao}</div>` : ''}
          ${(r.isentoAnexos && r.isentoAnexos.length > 0) ? `
            <div>
              <div class="isento-view-anexos-title">Documentos anexados</div>
              <div class="isento-view-anexos-grid">
                ${r.isentoAnexos.map(a => {
                  const label = (a.titulo || a.name || 'Documento').trim();
                  return `<div class="anexo-preview-item" onclick="window.open('${a.url}','_blank')" style="cursor:pointer;" title="Abrir no Drive">
                    <div class="anexo-preview-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:28px;height:28px;color:#e63946;"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="12" y2="17"/></svg>
                    </div>
                    <div class="anexo-preview-name">${label}</div>
                  </div>`;
                }).join('')}
              </div>
            </div>` : ''}
        </div>` : ''}
    `;
  }

  function toggleRotinaStatus() {
    const r = state.rotinas.find(r => r.id === rotinaViewId);
    if (!r) return;
    if (r.status !== 'Inativo') {
      _showPausarRotinaConfirm();
      return;
    }
    r.status = 'Ativo';
    saveState();
    renderRotinaViewInfo();
    renderRotinasTable();
    showToast('Rotina ativada com sucesso!', 'success');
  }

  function _showPausarRotinaConfirm() {
    const existing = document.getElementById('modal-pausar-rotina');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'modal-pausar-rotina';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:9999;backdrop-filter:blur(4px);';
    overlay.innerHTML = `
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:16px;padding:36px 32px;max-width:400px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.4);">
        <div style="width:64px;height:64px;border-radius:50%;background:rgba(230,160,0,0.15);border:2px solid rgba(230,160,0,0.4);display:flex;align-items:center;justify-content:center;margin:0 auto 20px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="rgb(230,160,0)" stroke-width="2" stroke-linecap="round" style="width:32px;height:32px;">
            <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
          </svg>
        </div>
        <div style="font-size:18px;font-weight:700;color:var(--text-primary);margin-bottom:8px;">Pausar Rotina?</div>
        <div style="font-size:14px;color:var(--text-muted);line-height:1.6;margin-bottom:28px;">
          A rotina será <strong style="color:rgb(230,160,0);">inativada</strong> e não gerará novas tarefas enquanto estiver pausada.<br>Você pode reativar a qualquer momento.
        </div>
        <div style="display:flex;gap:10px;justify-content:center;">
          <button onclick="document.getElementById('modal-pausar-rotina').remove()" style="flex:1;padding:10px 0;border-radius:8px;border:1px solid var(--border);background:transparent;color:var(--text-secondary);font-size:14px;cursor:pointer;">Cancelar</button>
          <button onclick="_confirmarPausarRotina()" style="flex:1;padding:10px 0;border-radius:8px;border:none;background:rgb(230,160,0);color:#000;font-size:14px;font-weight:600;cursor:pointer;">Sim, pausar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }

  function _confirmarPausarRotina() {
    const overlay = document.getElementById('modal-pausar-rotina');
    if (overlay) overlay.remove();
    const r = state.rotinas.find(r => r.id === rotinaViewId);
    if (!r) return;
    r.status = 'Inativo';
    saveState();
    renderRotinaViewInfo();
    renderRotinasTable();
    showToast('Rotina inativada com sucesso!', 'success');
  }

  function editarRotinaAtual() {
    openRotinaDrawer(rotinaViewId);
  }

  async function confirmarDeleteRotina() {
    if (!_can('rotinas.excluir')) { showToast('Sem permissão para excluir rotinas.', 'error'); return; }
    if (!(await uiConfirmar({
      tipo: 'perigo', titulo: 'Excluir rotina?', confirmar: 'Excluir rotina',
      mensagem: 'A rotina deixa de gerar novas tarefas.',
      detalhe: 'As tarefas vinculadas a ela também serão removidas.',
    }))) return;
    state.rotinas = state.rotinas.filter(r => r.id !== rotinaViewId);
    state.tarefas = state.tarefas.filter(t => t.rotinaId !== rotinaViewId);
    saveState();
    closeModal('modal-rotina-view');
    renderRotinasTable();
  }

  // ── FILTROS DA ABA ROTINA ──
  // Valores: ids de setor/unidade (org.js); o campo mostra o rótulo
  let _rotinaSetorOpts = [];
  let _rotinaCatOpts = [];

  function atualizarFiltrosRotina() {
    _rotinaSetorOpts = (typeof _getFilteredSetores === 'function') ? _getFilteredSetores() : [];
    _rotinaCatOpts = [...state.categorias].sort((a, b) => a.localeCompare(b, 'pt'));
    const unEl = document.getElementById('filter-unidade-rotina');
    if (unEl && state._ativoFiltroIdx == null) unEl.style.display = _orgMigrado() ? '' : 'none';
    // Setor fora da unidade escolhida (ou que saiu da topbar) volta para "Todos"
    const hid = document.getElementById('filter-setor-rotina-val');
    if (hid?.value && (!_rotinaSetorOpts.includes(hid.value) || !_orgSetorNaUnidade(hid.value, document.getElementById('filter-unidade-rotina-val')?.value || ''))) {
      hid.value = '';
      const inp = document.getElementById('filter-setor-rotina-input'); if (inp) inp.value = '';
    }
  }

  function _rotinaSetorRotulo(id) { return id ? _orgRotuloSetor(id, { semUnidade: !!document.getElementById('filter-unidade-rotina-val')?.value }) : ''; }

  function rotinaSetorFilter() {
    const input = document.getElementById('filter-setor-rotina-input');
    const drop = document.getElementById('filter-setor-rotina-drop');
    if (!input || !drop) return;
    const q = input.value.trim().toLowerCase();
    // Campo vazio → seleciona "Todos" automaticamente
    if (!q) {
      const hidden = document.getElementById('filter-setor-rotina-val');
      if (hidden && hidden.value !== '') { hidden.value = ''; renderRotinasTable(); updateNotifBadge(); }
    }
    const fUn = document.getElementById('filter-unidade-rotina-val')?.value || '';
    const opts = _orgOpcoesSetores(_rotinaSetorOpts, fUn);
    const matches = q ? opts.filter(o => o.label.toLowerCase().includes(q)) : opts;
    drop.innerHTML = [
      `<div class="autocomplete-opt" onmousedown="rotinaSetorSelect('')"><em style="color:var(--text-muted)">Todos os setores</em></div>`,
      ...matches.map(o => `<div class="autocomplete-opt" onmousedown="rotinaSetorSelect('${_orgJsAttr(o.value)}')"><div class="autocomplete-opt-name">${_orgEsc(o.label)}</div></div>`)
    ].join('');
    drop.classList.add('open');
  }

  function rotinaSetorSelect(val) {
    const input = document.getElementById('filter-setor-rotina-input');
    const hidden = document.getElementById('filter-setor-rotina-val');
    const drop = document.getElementById('filter-setor-rotina-drop');
    if (input) input.value = _rotinaSetorRotulo(val);
    if (hidden) hidden.value = val;
    if (drop) drop.classList.remove('open');
    renderRotinasTable(); renderTarefasTable(); renderAtividadesTable(); updateNotifBadge();
  }

  function rotinaSetorClose() {
    const drop = document.getElementById('filter-setor-rotina-drop');
    if (drop) drop.classList.remove('open');
    // restaura texto ao valor selecionado se digitou algo inválido
    const input = document.getElementById('filter-setor-rotina-input');
    const hidden = document.getElementById('filter-setor-rotina-val');
    if (input && hidden) input.value = _rotinaSetorRotulo(hidden.value);
  }

  function rotinaUnidadeFilter() {
    const input = document.getElementById('filter-unidade-rotina-input');
    const drop = document.getElementById('filter-unidade-rotina-drop');
    if (!input || !drop) return;
    const q = input.value.trim().toLowerCase();
    if (!q) {
      const hidden = document.getElementById('filter-unidade-rotina-val');
      if (hidden && hidden.value !== '') { rotinaUnidadeSelect(''); drop.classList.add('open'); }
    }
    const opts = _orgUnidadesDosSetores(_rotinaSetorOpts);
    const matches = q ? opts.filter(o => (o.label + ' ' + o.sub).toLowerCase().includes(q)) : opts;
    drop.innerHTML = [
      `<div class="autocomplete-opt" onmousedown="rotinaUnidadeSelect('')"><em style="color:var(--text-muted)">Todas as unidades</em></div>`,
      ...matches.map(o => `<div class="autocomplete-opt" onmousedown="rotinaUnidadeSelect('${_orgJsAttr(o.value)}')"><div class="autocomplete-opt-name">${_orgEsc(o.label)}${o.sub ? ` <small style="color:var(--text-muted)">${_orgEsc(o.sub)}</small>` : ''}</div></div>`)
    ].join('');
    drop.classList.add('open');
  }

  function _rotinaUnidadeRotulo(id) { return id === '__sem__' ? 'Sem unidade' : (id ? _orgSiglaUnidade(id) : ''); }

  function rotinaUnidadeSelect(val) {
    const input = document.getElementById('filter-unidade-rotina-input');
    const hidden = document.getElementById('filter-unidade-rotina-val');
    const drop = document.getElementById('filter-unidade-rotina-drop');
    if (input) input.value = _rotinaUnidadeRotulo(val);
    if (hidden) hidden.value = val;
    if (drop) drop.classList.remove('open');
    atualizarFiltrosRotina();
    rotinaSetorClose();
    renderRotinasTable(); renderTarefasTable(); renderAtividadesTable(); updateNotifBadge();
  }

  function rotinaUnidadeClose() {
    const drop = document.getElementById('filter-unidade-rotina-drop');
    if (drop) drop.classList.remove('open');
    const input = document.getElementById('filter-unidade-rotina-input');
    const hidden = document.getElementById('filter-unidade-rotina-val');
    if (input && hidden) input.value = _rotinaUnidadeRotulo(hidden.value);
  }

  function rotinaCatFilter() {
    const input = document.getElementById('filter-cat-rotina-input');
    const drop = document.getElementById('filter-cat-rotina-drop');
    if (!input || !drop) return;
    const q = input.value.trim().toLowerCase();
    // Campo vazio → seleciona "Todas" automaticamente
    if (!q) {
      const hidden = document.getElementById('filter-cat-rotina-val');
      if (hidden && hidden.value !== '') { hidden.value = ''; renderRotinasTable(); updateNotifBadge(); }
    }
    const matches = q ? _rotinaCatOpts.filter(c => c.toLowerCase().includes(q)) : _rotinaCatOpts;
    drop.innerHTML = [
      `<div class="autocomplete-opt" onmousedown="rotinaCatSelect('')"><em style="color:var(--text-muted)">Todas as categorias</em></div>`,
      ...matches.map(c => `<div class="autocomplete-opt" onmousedown="rotinaCatSelect('${c.replace(/'/g,"\\'")}')"><div class="autocomplete-opt-name">${c}</div></div>`)
    ].join('');
    drop.classList.add('open');
  }

  function rotinaCatSelect(val) {
    const input = document.getElementById('filter-cat-rotina-input');
    const hidden = document.getElementById('filter-cat-rotina-val');
    const drop = document.getElementById('filter-cat-rotina-drop');
    if (input) input.value = val;
    if (hidden) hidden.value = val;
    if (drop) drop.classList.remove('open');
    renderRotinasTable(); updateNotifBadge();
  }

  function rotinaCatClose() {
    const drop = document.getElementById('filter-cat-rotina-drop');
    if (drop) drop.classList.remove('open');
    const input = document.getElementById('filter-cat-rotina-input');
    const hidden = document.getElementById('filter-cat-rotina-val');
    if (input && hidden) input.value = hidden.value;
  }

  function isAtivosFilterOpen() {
    return document.getElementById('ativos-filter-inline')?.classList.contains('open');
  }

  function openAtivosFilter() {
    const panel = document.getElementById('ativos-filter-inline');
    const btn   = document.getElementById('btn-ativos-filtro');
    panel?.classList.add('open');
    if (panel) panel.setAttribute('aria-hidden', 'false');
    btn?.classList.add('active');
    if (btn) btn.setAttribute('aria-expanded', 'true');
  }

  function closeAtivosFilter() {
    const panel = document.getElementById('ativos-filter-inline');
    const btn   = document.getElementById('btn-ativos-filtro');
    panel?.classList.remove('open');
    if (panel) panel.setAttribute('aria-hidden', 'true');
    btn?.classList.remove('active');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function toggleAtivosFilter() {
    if (isAtivosFilterOpen()) closeAtivosFilter();
    else openAtivosFilter();
  }

  function limparAtivosFiltros() {
    _categorySearchVal = 'todas';
    const cinp = document.getElementById('main-category-filter-input');
    if (cinp) cinp.value = '';
    renderCards();
    updateNotifBadge();
    updateAtivosFiltroBtn();
  }

  function updateAtivosFiltroBtn() {
    const btn = document.getElementById('btn-ativos-filtro');
    if (!btn) return;
    const hasFilter = _categorySearchVal !== 'todas';
    if (!isAtivosFilterOpen()) btn.classList.toggle('active', hasFilter);
  }

  // ── MODAIS ──
  // Pilha de modais abertos — o anterior fica oculto (visibility:hidden) enquanto
  // há outro na frente, evitando repaint desnecessário.
  const _modalStack = [];

  function _applyModalVisibility() {
    _modalStack.forEach((mid, i) => {
      const el = document.getElementById(mid);
      if (!el) return;
      el.style.visibility = i < _modalStack.length - 1 ? 'hidden' : '';
    });
  }

  function openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('open');
    // Remove da pilha se já estava (reabertura), depois empurra ao topo
    const existing = _modalStack.indexOf(id);
    if (existing !== -1) _modalStack.splice(existing, 1);
    _modalStack.push(id);
    _applyModalVisibility();
  }

  function closeModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('open');
    el.style.visibility = '';
    const idx = _modalStack.indexOf(id);
    if (idx !== -1) _modalStack.splice(idx, 1);
    _applyModalVisibility();
  }

  let ativoEdicaoIndex = null;
  let categoriaEdicaoIndex = -1;

  // openSetorModal: ver org.js (Unidades e setores)

  function openCategoriaModal(index = -1) {
    categoriaEdicaoIndex = index;
    renderCategoriaModal();
    openModal('modal-categoria');
  }

  function openAtivoModal(index = null) {
    ativoEdicaoIndex = index;
    document.getElementById('modal-ativo-title').textContent = index === null ? 'Novo Ativo' : 'Editar Ativo';
    const btnHistAtivo = document.getElementById('btn-hist-ativo');
    if (btnHistAtivo) btnHistAtivo.style.display = index !== null ? '' : 'none';
    document.querySelector('#modal-ativo .drawer-subtitle').textContent = index === null ? 'Preencha os dados do equipamento' : 'Altere os dados do equipamento';

    if (index === null) {
      document.querySelectorAll('#modal-ativo input[type=text], #modal-ativo textarea').forEach(el => el.value = '');
      document.getElementById('ativo-setor').value = '';
      document.getElementById('ativo-categoria').value = '';
      document.getElementById('ativo-tipo').value = 'Equipamento';
      const si = document.getElementById('ativo-setor-input'); if (si) si.value = '';
      const ci = document.getElementById('ativo-categoria-input'); if (ci) ci.value = '';
      document.getElementById('ativo-ambiente').value = '';
      _formCompSel = new Set();
      _formAmbienteSync();
      onAtivoTipoChange('Equipamento');
      _ativoStatusUI('em_uso', []);
    } else {
      const ativo = state.ativos[index];
      document.getElementById('ativo-nome').value = ativo.nome;
      document.getElementById('ativo-codigo').value = ativo.codigo;
      document.getElementById('ativo-setor').value = _orgSetorDoAtivo(ativo) ? _orgSetorIdDoAtivo(ativo) : '';
      document.getElementById('ativo-categoria').value = ativo.categoria;
      const tipo = ativo.tipo || 'Equipamento';
      document.getElementById('ativo-tipo').value = tipo;
      const si2 = document.getElementById('ativo-setor-input'); if (si2) si2.value = _orgSetorDoAtivo(ativo) ? _orgRotuloAtivo(ativo) : '';
      const ci2 = document.getElementById('ativo-categoria-input'); if (ci2) ci2.value = ativo.categoria || '';
      document.getElementById('ativo-ambiente').value = ativo.ambienteId || '';
      _formCompSel = new Set(_orgSetoresCompDoAtivo(ativo));
      _formAmbienteSync();
      document.getElementById('ativo-marca').value = ativo.marca !== '-' ? ativo.marca : '';
      document.getElementById('ativo-modelo').value = ativo.modelo !== '-' ? ativo.modelo : '';
      document.getElementById('ativo-serie').value = ativo.serie !== '-' ? ativo.serie : '';
      document.getElementById('ativo-nota').value = ativo.nota;
      onAtivoTipoChange(tipo);
      _ativoStatusUI(ativo.statusUso || 'em_uso', ativo.pausaOTs || []);
    }

    document.getElementById('modal-ativo').classList.add('open');
  }

  function onAtivoTipoChange(tipo) {
    const espSection = document.getElementById('ativo-especificacoes-section');
    if (espSection) espSection.style.display = tipo === 'Equipamento' ? '' : 'none';
  }

  function visualizarAtivo(index, initialTab = 'info') {
    ativoEdicaoIndex = index;
    _avRotinasFechadas.clear();
    const ativo = state.ativos[index];
    document.getElementById('visualizar-title').textContent = ativo.nome;
    document.getElementById('visualizar-subtitle').textContent = `${_orgRotuloAtivo(ativo, { ambiente: true, compartilhado: true })} · ${ativo.categoria}`;

    document.getElementById('visualizar-body').innerHTML = `
      <div class="view-hero">
        <div class="view-hero-name">${ativo.nome}</div>
        <div class="view-hero-code">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:12px;height:12px;"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          ${ativo.codigo}
        </div>
        <div class="view-badges">
          ${ativo.tipo && ativo.tipo !== 'Equipamento' ? `<span class="view-badge" style="background:rgba(99,102,241,0.1);color:#6366f1;border-color:rgba(99,102,241,0.3);">${ativo.tipo}</span>` : ''}
          <span class="view-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:11px;height:11px;"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>${_orgEsc(_orgRotuloAtivo(ativo, { compartilhado: true }))}</span>
          ${ativo.ambienteId && _orgAmbiente(ativo.ambienteId) ? `<span class="view-badge" title="Ambiente"><svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M6 21V4a1 1 0 011-1h10a1 1 0 011 1v17"/><circle cx="14.5" cy="12" r=".9" fill="currentColor"/></svg>${_orgEsc(_orgRotuloAmbiente(ativo.ambienteId))}</span>` : ''}
          <span class="view-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:11px;height:11px;"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>${ativo.categoria}</span>
          ${ativo.statusUso === 'em_pausa'
            ? `<span class="view-badge" style="background:rgba(244,162,97,0.12);color:#b45309;border-color:#f4a261;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:11px;height:11px;"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                Em Pausa
               </span>`
            : ativo.statusUso === 'em_desuso'
            ? `<span class="view-badge" style="background:rgba(148,163,184,0.14);color:#475569;border-color:#94a3b8;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:11px;height:11px;"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                Em Desuso
               </span>`
            : `<span class="view-badge" style="background:rgba(42,157,143,0.1);color:#2a9d8f;border-color:#2a9d8f;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:11px;height:11px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                Em Uso
               </span>`}
        </div>
      </div>
      <div class="detail-grid">
        ${(ativo.tipo || 'Equipamento') === 'Equipamento' ? `
        <div class="detail-card"><div class="detail-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>Marca</div><div class="detail-value">${ativo.marca}</div></div>
        <div class="detail-card"><div class="detail-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/></svg>Modelo</div><div class="detail-value">${ativo.modelo}</div></div>
        <div class="detail-card"><div class="detail-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>Nº de Série</div><div class="detail-value">${ativo.serie}</div></div>
` : ''}
        <div class="detail-note"><div class="detail-label" style="margin-bottom:6px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:11px;height:11px;color:var(--cyan);"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>Observações</div>
          <div class="detail-value" style="font-weight:400;font-size:13px;color:var(--text-secondary);white-space:pre-line;">${ativo.nota || '<span style="color:var(--text-muted);font-style:italic;">Nenhuma observação cadastrada.</span>'}</div>
        </div>
      </div>
      ${ativo.statusUso === 'em_pausa' && ativo.pausaOTs && ativo.pausaOTs.length > 0 ? `
      <div class="view-pausa-ots">
        <div class="detail-label" style="margin-bottom:8px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:12px;height:12px;color:#b45309;"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          OTs Associadas à Pausa
        </div>
        ${ativo.pausaOTs.map(otId => {
          const ot = (typeof otState !== 'undefined' ? otState.ordens : []).find(o => o.id === otId);
          if (!ot) return `<div class="view-pausa-ot-item"><span class="view-pausa-ot-num">${otId}</span><span class="view-pausa-ot-title" style="color:var(--text-muted);font-style:italic;">OT não encontrada</span></div>`;
          const dataParadaFmt = ot.dataParada
            ? new Date(ot.dataParada + 'T00:00:00').toLocaleDateString('pt-BR')
            : '';
          return `<div class="view-pausa-ot-item" onclick="otOpenView('${ot.id}')" title="Abrir OT">
            <span class="view-pausa-ot-num">${ot.numero || otId}</span>
            <span class="view-pausa-ot-title">${ot.titulo || '—'}</span>
            ${dataParadaFmt ? `<span class="view-pausa-ot-data">Parada em ${dataParadaFmt}</span>` : ''}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:12px;height:12px;flex-shrink:0;color:var(--cyan);"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </div>`;
        }).join('')}
      </div>` : ''}
      ${ativo.statusUso === 'em_pausa' && typeof ocState !== 'undefined' && (ativo.pausaOcorrencias || []).some(id => !ocPausaResolvida(id, ativo.id)) ? `
      <div class="view-pausa-ots">
        <div class="detail-label" style="margin-bottom:8px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:12px;height:12px;color:var(--red);"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          Ocorrências aguardando liberação formal
        </div>
        ${ativo.pausaOcorrencias.filter(id => !ocPausaResolvida(id, ativo.id)).map(id => {
          const oc = ocState.ocorrencias[id];
          return `<div class="view-pausa-ot-item" onclick="ocOpenView('${id}','eficacia')" title="Abrir ocorrência">
            <span class="view-pausa-ot-num">${oc?.numero || id}</span>
            <span class="view-pausa-ot-title">${_ocEsc(oc?.titulo) || '—'}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:12px;height:12px;flex-shrink:0;color:var(--cyan);"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </div>`;
        }).join('')}
      </div>` : ''}`;

    // Atualiza badges das abas
    _atualizarBadgesAtivoTabs(index);
    switchAtivoTab(initialTab);
    openModal('modal-visualizar');
    // Permissões
    _mbtn('btn-editar-ativo', _can('ativos.editar'));
    // Excluir: só visível se não há rotinas vinculadas, sem OTs publicadas e tem permissão
    const temRotinas = state.rotinas.some(r => r.equipamentoIdx === index);
    const tarefasDoAtivo = state.tarefas.filter(t => t.equipamentoIdx === index).map(t => t.id);
    const temOTsPublicadas = tarefasDoAtivo.some(arqTemPubs);
    const btnDelAtivo = document.getElementById('btn-excluir-ativo');
    if (btnDelAtivo) btnDelAtivo.style.display = (!temRotinas && !temOTsPublicadas && !_ativoTemHistoricoVinculado(index) && _can('ativos.excluir')) ? '' : 'none';
  }

  // OTs e ocorrências são evidências do histórico do ativo: impedem a exclusão
  function _ativoTemHistoricoVinculado(index) {
    const ativo = state.ativos[index];
    if (!ativo) return false;
    const temOT = (typeof otState !== 'undefined' ? otState.ordens : [])
      .some(o => (ativo.id && otAtivoIds(o).includes(ativo.id)) || otTemAtivo(o, index));
    const temOc = typeof ocListarPorAtivo === 'function' && ocListarPorAtivo(ativo.id, { incluirCanceladas: true }).length > 0;
    return temOT || temOc;
  }

  window.excluirAtivoAtual = async function () {
    if (!_can('ativos.excluir')) { showToast('Sem permissão para excluir ativos.', 'error'); return; }
    const index = ativoEdicaoIndex;
    if (index === null || index === undefined) return;
    const temRotinas = state.rotinas.some(r => r.equipamentoIdx === index);
    if (temRotinas) { showToast('Este ativo possui rotinas vinculadas e não pode ser excluído.', 'error'); return; }
    const tarefasDoAtivo = state.tarefas.filter(t => t.equipamentoIdx === index).map(t => t.id);
    const temOTsPublicadas = tarefasDoAtivo.some(arqTemPubs);
    if (temOTsPublicadas) { showToast('Este ativo possui OTs publicadas e não pode ser excluído.', 'error'); return; }
    if (_ativoTemHistoricoVinculado(index)) { showToast('Este ativo possui OTs ou ocorrências registradas e não pode ser excluído.', 'error'); return; }
    if (!(await uiConfirmar({
      tipo: 'perigo', titulo: 'Excluir ativo?', confirmar: 'Excluir ativo',
      mensagem: `O ativo <b>${uiEsc(state.ativos[index]?.nome || '')}</b> será removido do cadastro.`,
      detalhe: 'Esta ação não pode ser desfeita.',
    }))) return;
    if (ativoEdicaoIndex !== index) return; // a tela mudou enquanto a janela estava aberta
    // Ajusta índices de rotinas/tarefas/OTs que referenciam ativos após o removido
    state.rotinas.forEach(r => { if (r.equipamentoIdx > index) r.equipamentoIdx--; });
    state.tarefas.forEach(t => { if (t.equipamentoIdx > index) t.equipamentoIdx--; });
    let otsAjustadas = false;
    (typeof otState !== 'undefined' ? otState.ordens : []).forEach(o => {
      if (o.ativoIdx !== null && o.ativoIdx !== undefined && Number(o.ativoIdx) > index) {
        o.ativoIdx = Number(o.ativoIdx) - 1;
        otsAjustadas = true;
      }
    });
    state.ativos.splice(index, 1);
    saveState();
    if (otsAjustadas && typeof otSave === 'function') otSave();
    closeModal('modal-visualizar');
    renderCards();
    showToast('Ativo excluído.', 'success');
  };

  function _atualizarBadgesAtivoTabs(index) {
    // Rotinas: badge colorido apenas se houver tarefas vencidas ou próximas
    const tarefasAtivas = state.tarefas.filter(t => t.equipamentoIdx === index && t.status === 'Ativo');
    let danger = 0, warning = 0;
    tarefasAtivas.forEach(t => {
      const f = getTaskFlag(t);
      if (f.cls === 'flag-danger')       danger++;
      else if (f.cls === 'flag-warning') warning++;
    });
    const total = danger + warning;
    const lbR = document.getElementById('avtab-label-rotinas');
    if (lbR) {
      if (total > 0) {
        const cor = danger > 0 ? 'var(--red)' : 'var(--amber)';
        lbR.innerHTML = `Rotinas <span style="display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 4px;border-radius:20px;font-size:10px;font-weight:700;background:${cor};color:#fff;margin-left:4px;">${total}</span>`;
      } else {
        lbR.textContent = 'Rotinas';
      }
    }

    // OTs: badge com contagem de OTs abertas do ativo
    const lbO = document.getElementById('avtab-label-ots');
    if (lbO) {
      const otsAbertas = (typeof otState !== 'undefined' ? otState.ordens : [])
        .filter(o => otTemAtivo(o, index) && !['concluida','cancelada'].includes(o.status));
      if (otsAbertas.length > 0) {
        lbO.innerHTML = `OT's <span style="display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 4px;border-radius:20px;font-size:10px;font-weight:700;background:var(--cyan);color:#fff;margin-left:4px;">${otsAbertas.length}</span>`;
      } else {
        lbO.textContent = `OT's`;
      }
    }
  }

  function switchAtivoTab(tab) {
    ['info','rotinas','ots','ocorrencias'].forEach(t => {
      document.getElementById('avtab-' + t).style.display = t === tab ? 'block' : 'none';
      document.getElementById('avtab-btn-' + t).classList.toggle('active', t === tab);
    });
    if (tab === 'rotinas')    _renderAtivoRotinas();
    if (tab === 'ots')        _renderAtivoOTs();
    if (tab === 'ocorrencias' && typeof _renderAtivoOcorrencias === 'function') _renderAtivoOcorrencias();
  }

  function _renderAtivoOTs() {
    const idx = ativoEdicaoIndex;
    const container = document.getElementById('ativo-ots-list');
    if (!container) return;

    const canCreate = typeof authHasPermission !== 'function' || authHasPermission('ot.criarOT');
    const btnNovaOT = canCreate
      ? `<button class="btn btn-primary btn-sm" style="gap:6px;font-size:12.5px;"
            onclick="otOpenFormForAtivo(${idx})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="width:14px;height:14px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nova OT
        </button>`
      : '';

    const ordens = (typeof otState !== 'undefined' ? otState.ordens : [])
      .filter(o => otTemAtivo(o, idx) && !['concluida','cancelada'].includes(o.status))
      .sort((a, b) => (b.criadoEm || '') < (a.criadoEm || '') ? -1 : 1);

    if (ordens.length === 0) {
      container.innerHTML = `
        <div style="display:flex;justify-content:flex-end;margin-bottom:12px;">${btnNovaOT}</div>
        <div class="avot-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <strong>Nenhuma OT em aberto</strong>
          <span>Este ativo não possui ordens de trabalho ativas no momento</span>
        </div>`;
      return;
    }

    const SEV_CFG = {
      critica:  { label: 'Crítica',  cls: 'avot-sev-critica'  },
      alta:     { label: 'Alta',     cls: 'avot-sev-alta'     },
      media:    { label: 'Média',    cls: 'avot-sev-media'    },
      baixa:    { label: 'Baixa',    cls: 'avot-sev-baixa'    },
    };
    const ST_CFG = {
      pendente:    { label: 'Pendente',    cls: 'avot-st-pendente'    },
      em_processo: { label: 'Em Processo', cls: 'avot-st-processo'    },
      em_revisao:  { label: 'Em Revisão',  cls: 'avot-st-revisao'     },
    };
    const TIPO_CFG = {
      corretiva:   { label: 'Corretiva',   cls: 'avot-tipo-corretiva'   },
      implantacao: { label: 'Implantação', cls: 'avot-tipo-implantacao' },
      melhoria:    { label: 'Melhoria',    cls: 'avot-tipo-melhoria'    },
      alteracao:   { label: 'Alteração',   cls: 'avot-tipo-alteracao'   },
    };

    const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
    const isVencida = o => o.prazo && new Date(o.prazo + 'T00:00:00') < new Date();

    container.innerHTML = `<div style="display:flex;justify-content:flex-end;margin-bottom:12px;">${btnNovaOT}</div>
    <div class="avot-list">` + ordens.map(o => {
      const sev  = SEV_CFG[o.severidade]  || { label: o.severidade || '—', cls: 'avot-sev-media' };
      const st   = ST_CFG[o.status]       || { label: o.status || '—',     cls: 'avot-st-pendente' };
      const tipo = TIPO_CFG[o.tipo]       || { label: o.tipo || '—',       cls: 'avot-tipo-corretiva' };
      const vencida = isVencida(o);
      const prazoHtml = o.prazo
        ? `<span class="avot-prazo${vencida ? ' avot-prazo-vencida' : ''}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:11px;height:11px;"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            ${vencida ? 'Vencida · ' : ''}${fmtDate(o.prazo)}
          </span>`
        : '';
      const falhaHtml = o.ativoFalhou
        ? `<span class="avot-falha-tag">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:10px;height:10px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Falha registrada
          </span>`
        : '';

      return `<div class="avot-card" onclick="otOpenView('${o.id}')">
        <div class="avot-card-top">
          <span class="avot-num">${o.numero || '—'}</span>
          <span class="avot-badge ${tipo.cls}">${tipo.label}</span>
          <span class="avot-badge ${sev.cls}">${sev.label}</span>
          <span class="avot-badge ${st.cls}">${st.label}</span>
          <svg class="avot-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </div>
        <div class="avot-titulo">${o.titulo || '—'}</div>
        <div class="avot-card-bot">
          ${prazoHtml}
          ${falhaHtml}
          ${o.responsavelNome ? `<span class="avot-resp">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:11px;height:11px;"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
            ${o.responsavelNome}
          </span>` : ''}
        </div>
      </div>`;
    }).join('') + `</div>`;
  }
  window._renderAtivoOTs = _renderAtivoOTs;

  // Rotinas expansíveis: cada rotina mostra/oculta as próprias tarefas (abertas por padrão)
  const _avRotinasFechadas = new Set();

  function toggleAtivoRotinaTarefas(rotinaId) {
    if (_avRotinasFechadas.has(rotinaId)) _avRotinasFechadas.delete(rotinaId);
    else _avRotinasFechadas.add(rotinaId);
    _renderAtivoRotinas();
  }

  function _renderAtivoRotinaTarefasHtml(r) {
    const tarefas = state.tarefas.filter(t => t.rotinaId === r.id)
      .sort((a, b) => (a.status === 'Inativo') - (b.status === 'Inativo'));
    const addBtn = _can('tarefas.criar') && r.status !== 'Inativo'
      ? `<button class="btn btn-outline av-rotina-nova-tarefa" onclick="openTarefaDrawerParaRotina('${r.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nova Tarefa
        </button>`
      : '';
    if (tarefas.length === 0) {
      return `<div class="av-rotina-tarefas"><div class="av-rotina-tarefas-vazio">Nenhuma tarefa nesta rotina</div>${addBtn}</div>`;
    }
    return `<div class="av-rotina-tarefas">` + tarefas.map(t => {
      const isInativo = t.status === 'Inativo';
      const flag  = getTaskFlag(t);
      const nPubs = arqContarPubs(t.id);
      return `<div class="list-item-row av-rotina-tarefa${isInativo ? ' inativa' : ''}" onclick="openTarefaDetalhe('${t.id}')">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <strong style="font-size:12.5px;">${t.titulo || r.nome || '—'}</strong>
            ${isInativo ? '' : `<span class="task-flag ${flag.cls}" style="font-size:10.5px;">${flag.label}</span>`}
            ${nPubs > 0 ? `<span class="chip chip-cyan" style="font-size:10px;">${nPubs} pub.</span>` : ''}
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Data: ${formatDate(t.dataTarefa)} · Próxima: ${t.proximaData ? formatDate(t.proximaData) : '—'}</div>
        </div>
        <span class="chip ${isInativo ? 'chip-gray' : 'chip-green'}" style="font-size:10px;">${t.status}</span>
      </div>`;
    }).join('') + addBtn + `</div>`;
  }

  function _renderAtivoRotinas() {
    const idx = ativoEdicaoIndex;
    const container = document.getElementById('ativo-rotinas-list');
    const filtro = getRotinaStatusFilter('av');
    const rotinas = state.rotinas.filter(r => r.equipamentoIdx === idx && rotinaPassesStatusFilter(r, 'av'));
    const addBtn = _can('rotinas.criar') ? `<div style="display:flex;justify-content:flex-end;margin-bottom:10px;">
      <button class="btn btn-primary" style="font-size:12px;padding:7px 14px;" onclick="openRotinaDrawerParaAtivo(${idx})">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="width:14px;height:14px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Nova Rotina
      </button>
    </div>` : '';
    if (rotinas.length === 0) {
      const msgFiltro = filtro !== 'ambos'
        ? '<p>Nenhuma rotina com o filtro selecionado. Tente "Ambos".</p>'
        : _can('rotinas.criar') ? '<p>Clique em "Nova Rotina" para criar uma</p>' : '';
      container.innerHTML = addBtn + `<div class="data-table-empty" style="padding:24px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg><strong>Nenhuma rotina vinculada</strong>${msgFiltro}</div>`;
      return;
    }
    const tipoCls = { Preventivo:'chip-blue', Rotina:'chip-cyan' };
    container.innerHTML = addBtn + `<div style="display:flex;flex-direction:column;gap:8px;">` +
      rotinas.map(r => {
        const isInativo = r.status === 'Inativo';
        const alerts = getRotinaAlerts(r.id);
        const aberta = !_avRotinasFechadas.has(r.id);
        const nTarefas = state.tarefas.filter(t => t.rotinaId === r.id).length;
        let badge = '';
        if (!isInativo && alerts.total > 0) {
          const cls = alerts.danger > 0 ? 'flag-danger' : 'flag-warning';
          badge = `<span class="task-flag ${cls}" style="font-size:10px;padding:2px 7px;margin-left:6px;">${alerts.total}</span>`;
        }
        return `<div class="av-rotina${aberta ? ' aberta' : ''}">
          <div class="list-item-row" style="cursor:pointer;${isInativo?'opacity:0.6;':''}" onclick="viewRotina('${r.id}')">
            <button class="av-rotina-toggle" onclick="event.stopPropagation();toggleAtivoRotinaTarefas('${r.id}')" title="${aberta ? 'Ocultar' : 'Mostrar'} tarefas (${nTarefas})" aria-expanded="${aberta}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 6 15 12 9 18"/></svg>
            </button>
            <div style="flex:1;">
              <div style="display:flex;align-items:center;"><strong style="font-size:13px;">${r.nome}</strong>${badge}${isInativo?'<span class="chip chip-gray" style="margin-left:6px;font-size:10px;">Inativa</span>':''}</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${r.tipo}</div>
            </div>
            <span class="chip ${tipoCls[r.tipo]||'chip-gray'}">${r.tipo}</span>
          </div>
          ${aberta ? _renderAtivoRotinaTarefasHtml(r) : ''}
        </div>`;
      }).join('') + `</div>`;
  }

  // Abrir drawer de rotina pré-selecionando o ativo
  function openRotinaDrawerParaAtivo(idx) {
    openRotinaDrawer(null);
    setTimeout(() => {
      _selectedEquipIdx = idx;
      const ativo = state.ativos[idx];
      if (ativo) {
        document.getElementById('rotina-equip-input').value = ativo.nome;
        setRotinaEquipDisplay(idx);
      }
    }, 50);
  }

  function editarAtivoAtual() {
    openAtivoModal(ativoEdicaoIndex);
  }

  function renderCategoriaModal() {
    const container = document.getElementById('categoria-list');
    const sorted = state.categorias.map((c, i) => ({ c, i })).sort((a, b) => a.c.localeCompare(b.c, 'pt'));
    container.innerHTML = sorted.length === 0
      ? `<div style="grid-column:1/-1;text-align:center;padding:12px 0;color:var(--text-muted);font-size:13px;">Nenhuma categoria cadastrada.</div>`
      : sorted.map(({ c: categoria, i: index }) => `
      <div class="setor-chip${categoriaEdicaoIndex === index ? ' editing' : ''}">
        <span class="setor-chip-name" title="${categoria}">${categoria}</span>
        <span class="setor-chip-actions">
          <button onclick="openCategoriaModal(${index})" title="Editar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:11px;height:11px;"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z"/></svg></button>
          <button onclick="removerCategoria(${index})" title="Excluir"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:11px;height:11px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </span>
      </div>
    `).join('');
    document.getElementById('input-nova-categoria').value = categoriaEdicaoIndex >= 0 ? state.categorias[categoriaEdicaoIndex] : '';
    document.getElementById('categoria-save-btn').textContent = categoriaEdicaoIndex >= 0 ? 'Salvar' : 'Adicionar';
  }

  function removerCategoria(index) {
    const nome = state.categorias[index];
    const emUso = state.ativos.some(a => a.categoria === nome);
    if (emUso) { showToast('Não é possível excluir: há ativos cadastrados nesta categoria.', 'error'); return; }
    state.categorias.splice(index, 1);
    saveState();
    atualizarSelects();
    categoriaEdicaoIndex = -1;
    renderCategoriaModal();
  }

  function atualizarSelects() {
    const setores = (typeof _getFilteredSetores === 'function') ? _getFilteredSetores() : [];
    sectorSearchSetOptions(setores);
    formSetorSetOptions(setores.filter(id => _orgSetor(id)?.ativo !== false));
    if (document.getElementById('modal-ativo')?.classList.contains('open')) _formAmbienteSync();
    const cats = [...state.categorias].sort((a, b) => a.localeCompare(b, 'pt'));
    formCategoriaSetOptions(cats);
    atualizarFiltrosRotina();
    populateTipoSelect();
    updateAtivosFiltroBtn();
  }

  function salvarCategoria() {
    const val = document.getElementById('input-nova-categoria').value.trim();
    if (!val) return;
    if (categoriaEdicaoIndex >= 0) {
      const oldVal = state.categorias[categoriaEdicaoIndex];
      if (oldVal && oldVal !== val) {
        state.ativos.forEach(a => { if (a.categoria === oldVal) a.categoria = val; });
      }
      state.categorias[categoriaEdicaoIndex] = val;
    } else if (!state.categorias.includes(val)) {
      state.categorias.push(val);
    }
    saveState();
    atualizarSelects();
    document.getElementById('input-nova-categoria').value = '';
    const wasEditingCat = categoriaEdicaoIndex >= 0;
    categoriaEdicaoIndex = -1;
    renderCategoriaModal();
    if (wasEditingCat) closeModal('modal-categoria');
    document.getElementById('input-nova-categoria')?.focus();
    showToast('Categoria salva!', 'success');
  }

  function salvarAtivo() {
    const isNew = ativoEdicaoIndex === null;
    if (isNew && !_can('ativos.criar'))  { showToast('Sem permissão para criar ativos.', 'error'); return; }
    if (!isNew && !_can('ativos.editar')) { showToast('Sem permissão para editar ativos.', 'error'); return; }
    const nome = document.getElementById('ativo-nome').value.trim();
    const codigo = document.getElementById('ativo-codigo').value.trim();
    const setorRec = _orgSetor(document.getElementById('ativo-setor').value);
    const setor = setorRec ? setorRec.nome : '';
    const categoria = document.getElementById('ativo-categoria').value;
    
    if(!nome || !codigo || !setor || !categoria) {
      showToast('Preencha os campos obrigatórios (*).', 'error'); return;
    }
    // Ambiente: obrigatório quando o setor tem ambientes vinculados
    const ambOpts = setorRec && !setorRec.virtual ? _formAmbienteOpts() : [];
    const ambienteId = document.getElementById('ativo-ambiente')?.value || '';
    if (ambOpts.length && !ambOpts.some(x => x.id === ambienteId)) {
      showToast('Escolha o ambiente (sala) do ativo.', 'error');
      document.getElementById('ativo-ambiente-input')?.focus();
      return;
    }

    // status de uso
    const statusUso = document.getElementById('btn-ativo-em-pausa')?.classList.contains('active') ? 'em_pausa'
      : document.getElementById('btn-ativo-em-desuso')?.classList.contains('active') ? 'em_desuso'
      : 'em_uso';
    const ativoExistente = ativoEdicaoIndex !== null ? state.ativos[ativoEdicaoIndex] : null;
    // Ocorrências que retiraram o ativo de uso só se resolvem pela liberação formal na própria ocorrência
    const pausaOcorrencias = (ativoExistente?.pausaOcorrencias || [])
      .filter(oid => typeof ocPausaResolvida !== 'function' || !ocPausaResolvida(oid, ativoExistente.id));
    if (pausaOcorrencias.length > 0 && statusUso !== 'em_pausa') {
      showToast('Ativo retirado de uso por ocorrência. Registre o retorno ao uso ou a retirada de uso (fora de uso / desativado) na ocorrência.', 'error'); return;
    }
    const pausaOTs  = statusUso === 'em_pausa' ? _ativoGetPausaOTs() : [];
    if (statusUso === 'em_pausa' && pausaOTs.length === 0 && pausaOcorrencias.length === 0) {
      showToast('Adicione ao menos uma OT associada à pausa.', 'error'); return;
    }

    const tipo = document.getElementById('ativo-tipo').value || 'Equipamento';
    const ativo = {
      id: ativoExistente?.id || uid(),
      nome, codigo, setor, categoria, tipo,
      // Depois da organização em unidades o vínculo é pelo id (o nome fica para exibição)
      setorId: setorRec && !setorRec.virtual ? setorRec.id : undefined,
      ambienteId: ambOpts.length ? ambienteId : undefined,
      // Outros setores do mesmo ambiente que também usam o ativo (o responsável continua sendo setorId)
      setoresCompartilhados: (() => {
        if (!ambOpts.length || !ambienteId) return undefined;
        const ids = _formCompOpts().filter(id => _formCompSel.has(id));
        return ids.length ? ids : undefined;
      })(),
      marca: tipo === 'Equipamento' ? (document.getElementById('ativo-marca').value.trim() || "-") : "-",
      modelo: tipo === 'Equipamento' ? (document.getElementById('ativo-modelo').value.trim() || "-") : "-",
      serie: tipo === 'Equipamento' ? (document.getElementById('ativo-serie').value.trim() || "-") : "-",
      nota: document.getElementById('ativo-nota').value.trim(),
      statusUso, pausaOTs, pausaOcorrencias,
      _historico: ativoExistente?._historico || []
    };

    _registrarEdicao(ativo, ativoExistente);
    if (ativoEdicaoIndex === null) {
      state.ativos.push(ativo);
    } else {
      state.ativos[ativoEdicaoIndex] = ativo;
    }
    saveState();

    const editedIdx = ativoEdicaoIndex;
    const wasEditing = editedIdx !== null;
    ativoEdicaoIndex = null;
    document.querySelectorAll('#modal-ativo input, #modal-ativo textarea').forEach(el => el.value = '');
    document.getElementById('ativo-setor').value = '';
    document.getElementById('ativo-categoria').value = '';
    document.getElementById('ativo-ambiente').value = '';
    const _si = document.getElementById('ativo-setor-input'); if (_si) _si.value = '';
    const _ci = document.getElementById('ativo-categoria-input'); if (_ci) _ci.value = '';
    document.getElementById('modal-ativo').classList.remove('open');
    if (wasEditing && isModalOpen('modal-visualizar')) {
      visualizarAtivo(editedIdx, getActiveSubTab('avtab', ['info', 'rotinas', 'ots', 'ocorrencias']) || 'info');
    }
    showToast('Ativo salvo com sucesso!', 'success');
  }

  // ── STATUS DE USO DO ATIVO ───────────────────────────────────
  function _ativoStatusUI(status, pausaOTs) {
    const btnUso    = document.getElementById('btn-ativo-em-uso');
    const btnPausa  = document.getElementById('btn-ativo-em-pausa');
    const btnDesuso = document.getElementById('btn-ativo-em-desuso');
    const section   = document.getElementById('ativo-pausa-section');
    if (!btnUso) return;
    btnUso.classList.toggle('active',    status === 'em_uso');
    btnPausa.classList.toggle('active',  status === 'em_pausa');
    btnDesuso?.classList.toggle('active', status === 'em_desuso');
    section.style.display = status === 'em_pausa' ? '' : 'none';
    _ativoRenderPausaOTs(pausaOTs || []);
  }

  function _ativoRenderPausaOTs(ids) {
    const list = document.getElementById('ativo-pausa-ots-list');
    if (!list) return;
    if (ids.length === 0) { list.innerHTML = '<div class="ativo-pausa-empty">Nenhuma OT adicionada.</div>'; return; }
    list.innerHTML = ids.map(id => {
      const ot = otState.ordens.find(o => o.id === id);
      return `<div class="ativo-pausa-ot-item">
        <div class="ativo-pausa-ot-info">
          <span class="ativo-pausa-ot-num">${ot ? (ot.numero || id) : id}</span>
          <span class="ativo-pausa-ot-title">${ot ? (ot.titulo || '—') : 'OT não encontrada'}</span>
        </div>
        <button type="button" class="ativo-pausa-ot-rm" onclick="ativoRemovePausaOT('${id}')" title="Remover">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>`;
    }).join('');
  }

  function _ativoGetPausaOTs() {
    return Array.from(document.querySelectorAll('#ativo-pausa-ots-list [data-ot-id]'))
      .map(el => el.dataset.otId);
  }

  window.ativoSetStatus = function (status) {
    const section   = document.getElementById('ativo-pausa-section');
    const btnUso    = document.getElementById('btn-ativo-em-uso');
    const btnPausa  = document.getElementById('btn-ativo-em-pausa');
    const btnDesuso = document.getElementById('btn-ativo-em-desuso');
    if (!btnUso) return;
    btnUso.classList.toggle('active',    status === 'em_uso');
    btnPausa.classList.toggle('active',  status === 'em_pausa');
    btnDesuso?.classList.toggle('active', status === 'em_desuso');
    section.style.display = status === 'em_pausa' ? '' : 'none';
    if (status === 'em_pausa') {
      const list = document.getElementById('ativo-pausa-ots-list');
      if (list && list.children.length === 0) _ativoRenderPausaOTs([]);
    }
  };

  window.ativoAddPausaOT = function () {
    _openOTPickerForPausa();
  };

  function _openOTPickerForPausa() {
    // Filtra OTs relacionadas ao ativo (por ativoIdx) ou todas abertas
    const idx = ativoEdicaoIndex;
    const candidatas = otState.ordens.filter(o =>
      !['concluida','cancelada'].includes(o.status) &&
      (idx === null || otTemAtivo(o, idx) || o.ativoIdx == null)
    );

    // Monta modal simples
    let overlay = document.getElementById('ativo-ot-picker-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'ativo-ot-picker-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:3000;background:rgba(14,22,40,0.5);display:flex;align-items:center;justify-content:center;padding:24px;backdrop-filter:blur(3px);';
      document.body.appendChild(overlay);
    }

    const existentes = new Set(
      Array.from(document.querySelectorAll('#ativo-pausa-ots-list .ativo-pausa-ot-item'))
        .map(el => el.dataset.otId)
    );

    overlay.innerHTML = `
      <div style="background:#fff;border-radius:12px;width:100%;max-width:600px;max-height:70vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(14,22,40,0.22);overflow:hidden;">
        <div style="display:flex;align-items:center;gap:10px;padding:16px 20px;border-bottom:1px solid var(--border);">
          <span style="font-size:15px;font-weight:700;flex:1;">Selecionar OT</span>
          <button onclick="document.getElementById('ativo-ot-picker-overlay').style.display='none'"
            style="width:32px;height:32px;border:1px solid var(--border);border-radius:8px;background:none;cursor:pointer;display:flex;align-items:center;justify-content:center;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div style="padding:12px 16px;border-bottom:1px solid var(--border);">
          <input type="text" id="ot-picker-search" placeholder="Buscar por número ou título..."
            style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;"
            oninput="ativoFilterOTPicker(this.value)">
        </div>
        <div id="ot-picker-list" style="overflow-y:auto;flex:1;padding:8px 0;">
          ${candidatas.length === 0
            ? '<div style="text-align:center;padding:32px;color:var(--text-muted);font-size:13px;">Nenhuma OT em aberto encontrada.</div>'
            : candidatas.map(o => {
                const disabled = existentes.has(o.id);
                return `<div class="ot-pick-row${disabled ? ' ot-pick-disabled' : ''}" data-ot-id="${o.id}"
                  data-search="${(o.numero + ' ' + (o.titulo||'')).toLowerCase()}"
                  ${!disabled ? `onclick="ativoSelectPausaOT('${o.id}')"` : ''}>
                  <div style="display:flex;align-items:center;gap:10px;padding:10px 16px;cursor:${disabled?'default':'pointer'};opacity:${disabled?'0.4':'1'};">
                    <div style="font-size:12px;font-weight:700;color:var(--cyan);min-width:60px;">${o.numero||'—'}</div>
                    <div style="flex:1;font-size:13px;">${o.titulo||'—'}</div>
                    ${disabled ? '<span style="font-size:11px;color:var(--text-muted);">Já adicionada</span>' : ''}
                  </div>
                </div>`;
              }).join('')}
        </div>
      </div>`;
    overlay.style.display = 'flex';
  }

  window.ativoFilterOTPicker = function (q) {
    const rows = document.querySelectorAll('#ot-picker-list .ot-pick-row');
    const lq = q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    rows.forEach(r => {
      const match = r.dataset.search.includes(lq);
      r.style.display = match ? '' : 'none';
    });
  };

  window.ativoSelectPausaOT = function (id) {
    document.getElementById('ativo-ot-picker-overlay').style.display = 'none';
    const list = document.getElementById('ativo-pausa-ots-list');
    if (!list) return;
    // Remove empty state
    list.querySelectorAll('.ativo-pausa-empty').forEach(el => el.remove());
    // Avoid duplicate
    if (list.querySelector(`[data-ot-id="${id}"]`)) return;
    const ot = otState.ordens.find(o => o.id === id);
    const item = document.createElement('div');
    item.className = 'ativo-pausa-ot-item';
    item.dataset.otId = id;
    item.innerHTML = `
      <div class="ativo-pausa-ot-info">
        <span class="ativo-pausa-ot-num">${ot ? (ot.numero || id) : id}</span>
        <span class="ativo-pausa-ot-title">${ot ? (ot.titulo || '—') : '—'}</span>
      </div>
      <button type="button" class="ativo-pausa-ot-rm" onclick="ativoRemovePausaOT('${id}')" title="Remover">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>`;
    list.appendChild(item);
  };

  window.ativoRemovePausaOT = function (id) {
    const item = document.querySelector(`#ativo-pausa-ots-list [data-ot-id="${id}"]`);
    if (item) item.remove();
    const list = document.getElementById('ativo-pausa-ots-list');
    if (list && list.children.length === 0) {
      list.innerHTML = '<div class="ativo-pausa-empty">Nenhuma OT adicionada.</div>';
    }
  };

  function _normalizeSearch(str) {
    return (str || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  // ── SECTOR / CATEGORY SEARCH STATE ──
  let _sectorSearchVal  = 'todos';
  let _sectorSearchOpts = [];
  let _categorySearchVal = 'todas';
  let _tipoSearchVal = 'todos';
  let _tipoSearchClickBound = false;

  const ATIVO_TIPOS = ['Equipamento', 'Infraestrutura', 'Procedimento', 'Diversos'];

  // Valores do filtro de setor: ids (org.js); o campo mostra o rótulo
  function sectorSearchSetOptions(setores) {
    _sectorSearchOpts = setores;
    // Mantém valor atual se ainda existe, senão reseta
    if (_sectorSearchVal !== 'todos' && !setores.includes(_sectorSearchVal)) {
      _sectorSearchVal = 'todos';
    }
    if (_unitSearchVal !== 'todas' && !_orgUnidadesDosSetores(setores).some(o => o.value === _unitSearchVal)) {
      _unitSearchVal = 'todas';
    }
    _sectorSearchSyncInputs();
  }

  function _sectorSearchRotulo(val) {
    return val === 'todos' ? '' : _orgRotuloSetor(val, { semUnidade: _unitSearchVal !== 'todas' });
  }
  function _unitSearchRotulo(val) {
    return val === 'todas' ? '' : (val === '__sem__' ? 'Sem unidade' : _orgSiglaUnidade(val));
  }
  function _sectorSearchSyncInputs() {
    const inp = document.getElementById('main-sector-filter-input');
    if (inp && document.activeElement !== inp) inp.value = _sectorSearchRotulo(_sectorSearchVal);
    const uinp = document.getElementById('main-unit-filter-input');
    if (uinp && document.activeElement !== uinp) uinp.value = _unitSearchRotulo(_unitSearchVal);
    const uwrap = document.getElementById('unit-search-wrap');
    if (uwrap) uwrap.style.display = _orgMigrado() ? '' : 'none';
    const ainp = document.getElementById('main-amb-filter-input');
    if (ainp && document.activeElement !== ainp) ainp.value = _ambSearchRotulo(_ambSearchVal);
    const awrap = document.getElementById('amb-search-wrap');
    if (awrap) awrap.style.display = _orgTemAmbientes() ? '' : 'none';
  }

  function sectorSearchGetValue() {
    return _sectorSearchVal;
  }

  function sectorSearchSetValue(val) {
    _sectorSearchVal = val;
    _sectorSearchSyncInputs();
  }

  let _sectorSearchClickBound = false;

  function sectorSearchOpen() {
    _sectorSearchRenderDropdown('');
    const dd = document.getElementById('sector-search-dropdown');
    if (dd) dd.style.display = '';
    if (!_sectorSearchClickBound) {
      document.addEventListener('mousedown', (e) => {
        if (!e.target.closest('#sector-search-wrap')) _sectorSearchClose();
        if (!e.target.closest('#unit-search-wrap')) _unitSearchClose();
        if (!e.target.closest('#amb-search-wrap')) _ambSearchClose();
      });
      _sectorSearchClickBound = true;
    }
  }

  function sectorSearchToggle() {
    const dd = document.getElementById('sector-search-dropdown');
    if (!dd) return;
    if (dd.style.display === 'none' || !dd.style.display) {
      document.getElementById('main-sector-filter-input')?.focus();
      sectorSearchOpen();
    } else {
      _sectorSearchClose();
    }
  }

  function sectorSearchFilter(q) {
    if (!q.trim() && _sectorSearchVal !== 'todos') sectorSearchSelect('todos', null);
    _sectorSearchRenderDropdown(q.toLowerCase());
    const dd = document.getElementById('sector-search-dropdown');
    if (dd) dd.style.display = '';
  }

  function sectorSearchKey(e) {
    if (e.key === 'Escape') { _sectorSearchClose(); e.target.blur(); }
    if (e.key === 'Enter') {
      const first = document.querySelector('#sector-search-dropdown .sector-dd-item');
      if (first) first.dispatchEvent(new MouseEvent('mousedown'));
    }
  }

  // Ativos visíveis no subtab, na topbar e na categoria escolhida
  function _ativosVisiveisParaFiltro(ignorarUnidade) {
    const fCat = _categorySearchVal;
    return state.ativos.filter(a => {
      if (_ativosSubtab === 'em_desuso') { if (a.statusUso !== 'em_desuso') return false; }
      else { if (a.statusUso === 'em_desuso') return false; }
      if (typeof _userCanSeeAtivo === 'function' && !_userCanSeeAtivo(a)) return false;
      if (fCat !== 'todas' && a.categoria !== fCat) return false;
      if (!ignorarUnidade && !_orgAtivoPassa(a, _unitSearchVal, '')) return false;
      return true;
    });
  }

  function _getSectorOptsFromAtivos() {
    const setores = new Set(_ativosVisiveisParaFiltro(false).flatMap(a => _orgSetorIdsDoAtivo(a)).filter(Boolean));
    // mantém apenas os que estão em _sectorSearchOpts (respeita filtro de topbar)
    return _sectorSearchOpts.filter(s => setores.has(s));
  }

  function _sectorSearchRenderDropdown(q) {
    const dd = document.getElementById('sector-search-dropdown');
    if (!dd) return;
    const opts = [{ val: 'todos', label: 'Todos os setores' },
      ..._orgOpcoesSetores(_getSectorOptsFromAtivos(), _unitSearchVal === 'todas' ? '' : _unitSearchVal).map(o => ({ val: o.value, label: o.label }))];
    const filtered = q ? opts.filter(o => o.label.toLowerCase().includes(q)) : opts;
    dd.innerHTML = filtered.length === 0
      ? `<div class="sector-dd-empty">Nenhum setor encontrado</div>`
      : filtered.map(o => `<div class="sector-dd-item${_sectorSearchVal === o.val ? ' active' : ''}"
          onmousedown="sectorSearchSelect('${_orgJsAttr(o.val)}',event)">${_orgEsc(o.label)}</div>`).join('');
  }

  function sectorSearchSelect(val, event) {
    if (event) event.preventDefault();
    _sectorSearchVal = val;
    _sectorSearchClose();
    document.getElementById('main-sector-filter-input')?.blur();
    _sectorSearchSyncInputs();
    // Reseta filtro de categoria se não existir nas novas opções
    if (_categorySearchVal !== 'todas') {
      const newCats = _getCategoryOptsFromAtivos();
      if (!newCats.includes(_categorySearchVal)) {
        _categorySearchVal = 'todas';
        const cinp = document.getElementById('main-category-filter-input');
        if (cinp) cinp.value = '';
      }
    }
    renderCards();
    if (typeof updateNotifBadge === 'function') updateNotifBadge();
  }

  function _sectorSearchClose() {
    const dd = document.getElementById('sector-search-dropdown');
    if (dd) dd.style.display = 'none';
  }

  // ── UNIT SEARCH (filtro de unidade na aba Ativos, em par com o de setor) ──
  let _unitSearchVal = 'todas';

  function unitSearchOpen() {
    _unitSearchRenderDropdown('');
    const dd = document.getElementById('unit-search-dropdown');
    if (dd) dd.style.display = '';
    if (!_sectorSearchClickBound) sectorSearchOpen(), _sectorSearchClose();
  }

  function unitSearchToggle() {
    const dd = document.getElementById('unit-search-dropdown');
    if (!dd) return;
    if (dd.style.display === 'none' || !dd.style.display) {
      document.getElementById('main-unit-filter-input')?.focus();
      unitSearchOpen();
    } else {
      _unitSearchClose();
    }
  }

  function unitSearchFilter(q) {
    if (!q.trim() && _unitSearchVal !== 'todas') unitSearchSelect('todas', null);
    _unitSearchRenderDropdown(q.toLowerCase());
    const dd = document.getElementById('unit-search-dropdown');
    if (dd) dd.style.display = '';
  }

  function unitSearchKey(e) {
    if (e.key === 'Escape') { _unitSearchClose(); e.target.blur(); }
    if (e.key === 'Enter') {
      const first = document.querySelector('#unit-search-dropdown .sector-dd-item');
      if (first) first.dispatchEvent(new MouseEvent('mousedown'));
    }
  }

  function _unitSearchRenderDropdown(q) {
    const dd = document.getElementById('unit-search-dropdown');
    if (!dd) return;
    const setores = new Set(_ativosVisiveisParaFiltro(true).flatMap(a => _orgSetorIdsDoAtivo(a)).filter(Boolean));
    const opts = [{ val: 'todas', label: 'Todas as unidades', sub: '' },
      ..._orgUnidadesDosSetores(_sectorSearchOpts.filter(s => setores.has(s))).map(o => ({ val: o.value, label: o.label, sub: o.sub }))];
    const filtered = q ? opts.filter(o => (o.label + ' ' + o.sub).toLowerCase().includes(q)) : opts;
    dd.innerHTML = filtered.length === 0
      ? `<div class="sector-dd-empty">Nenhuma unidade encontrada</div>`
      : filtered.map(o => `<div class="sector-dd-item${_unitSearchVal === o.val ? ' active' : ''}"
          onmousedown="unitSearchSelect('${_orgJsAttr(o.val)}',event)">${_orgEsc(o.label)}${o.sub ? ` <small style="color:var(--text-muted)">${_orgEsc(o.sub)}</small>` : ''}</div>`).join('');
  }

  function unitSearchSelect(val, event) {
    if (event) event.preventDefault();
    _unitSearchVal = val;
    // Setor escolhido fora da nova unidade volta para "Todos"
    if (_sectorSearchVal !== 'todos' && !_orgSetorNaUnidade(_sectorSearchVal, val === 'todas' ? '' : val)) _sectorSearchVal = 'todos';
    _unitSearchClose();
    document.getElementById('main-unit-filter-input')?.blur();
    _sectorSearchSyncInputs();
    if (_categorySearchVal !== 'todas' && !_getCategoryOptsFromAtivos().includes(_categorySearchVal)) {
      _categorySearchVal = 'todas';
      const cinp = document.getElementById('main-category-filter-input');
      if (cinp) cinp.value = '';
    }
    renderCards();
    if (typeof updateNotifBadge === 'function') updateNotifBadge();
  }

  function _unitSearchClose() {
    const dd = document.getElementById('unit-search-dropdown');
    if (dd) dd.style.display = 'none';
  }

  // ── AMBIENTE (filtro de sala na aba Ativos; restrito por unidade e setor) ──
  let _ambSearchVal = 'todos';

  function _ambSearchRotulo(val) {
    return val === 'todos' ? '' : (val === '__sem__' ? 'Sem ambiente' : _orgRotuloAmbiente(val));
  }
  // Ambientes dos ativos visíveis que passam em unidade + setor (e se há ativos sem ambiente)
  function _ambSearchOpcoes() {
    const vis = _ativosVisiveisParaFiltro(false).filter(a => _orgAtivoPassa(a, '', _sectorSearchVal));
    const ids = new Set();
    let sem = false;
    vis.forEach(a => { const x = _orgAmbienteDoAtivo(a); if (x) ids.add(x.id); else sem = true; });
    const lista = [...ids].map(_orgAmbiente).filter(Boolean)
      .sort((a, b) => _orgSiglaUnidade(a.unidadeId).localeCompare(_orgSiglaUnidade(b.unidadeId), 'pt-BR')
        || (a.nome || '').localeCompare(b.nome || '', 'pt-BR', { numeric: true }))
      .map(x => ({
        val: x.id, label: _orgRotuloAmbiente(x.id), unidade: _orgSiglaUnidade(x.unidadeId),
        sub: _orgSetorIdsDoAmbiente(x).map(id => _orgSetor(id)?.nome).filter(Boolean).join(', ')
      }));
    return { lista, sem };
  }
  // Valor fora das opções atuais volta para "Todos"
  function _ambSearchValida() {
    if (_ambSearchVal === 'todos') return;
    const { lista, sem } = _ambSearchOpcoes();
    if (_ambSearchVal === '__sem__' ? !sem : !lista.some(o => o.val === _ambSearchVal)) _ambSearchVal = 'todos';
  }

  function ambSearchOpen() {
    _ambSearchRenderDropdown('');
    const dd = document.getElementById('amb-search-dropdown');
    if (dd) dd.style.display = '';
    if (!_sectorSearchClickBound) sectorSearchOpen(), _sectorSearchClose();
  }

  function ambSearchToggle() {
    const dd = document.getElementById('amb-search-dropdown');
    if (!dd) return;
    if (dd.style.display === 'none' || !dd.style.display) {
      document.getElementById('main-amb-filter-input')?.focus();
      ambSearchOpen();
    } else {
      _ambSearchClose();
    }
  }

  function ambSearchFilter(q) {
    if (!q.trim() && _ambSearchVal !== 'todos') ambSearchSelect('todos', null);
    _ambSearchRenderDropdown(q.toLowerCase());
    const dd = document.getElementById('amb-search-dropdown');
    if (dd) dd.style.display = '';
  }

  function ambSearchKey(e) {
    if (e.key === 'Escape') { _ambSearchClose(); e.target.blur(); }
    if (e.key === 'Enter') {
      const first = document.querySelector('#amb-search-dropdown .sector-dd-item');
      if (first) first.dispatchEvent(new MouseEvent('mousedown'));
    }
  }

  function _ambSearchRenderDropdown(q) {
    const dd = document.getElementById('amb-search-dropdown');
    if (!dd) return;
    const { lista, sem } = _ambSearchOpcoes();
    const opts = [{ val: 'todos', label: 'Todos os ambientes', sub: '', unidade: null }, ...lista,
      ...(sem ? [{ val: '__sem__', label: 'Sem ambiente', sub: '', unidade: null }] : [])];
    const filtered = q ? opts.filter(o => (o.label + ' ' + o.sub).toLowerCase().includes(q)) : opts;
    const agrupar = _unitSearchVal === 'todas' && new Set(lista.map(o => o.unidade)).size > 1;
    let grupo = null;
    dd.innerHTML = filtered.length === 0
      ? `<div class="sector-dd-empty">Nenhum ambiente encontrado</div>`
      : filtered.map(o => {
          const head = agrupar && o.unidade && o.unidade !== grupo ? `<div class="sector-dd-group">${_orgEsc(o.unidade)}</div>` : '';
          if (o.unidade) grupo = o.unidade;
          return head + `<div class="sector-dd-item${_ambSearchVal === o.val ? ' active' : ''}"
          onmousedown="ambSearchSelect('${_orgJsAttr(o.val)}',event)">${_orgEsc(o.label)}${o.sub ? ` <small style="color:var(--text-muted)">${_orgEsc(o.sub)}</small>` : ''}</div>`;
        }).join('');
  }

  function ambSearchSelect(val, event) {
    if (event) event.preventDefault();
    _ambSearchVal = val;
    _ambSearchClose();
    document.getElementById('main-amb-filter-input')?.blur();
    _sectorSearchSyncInputs();
    if (_categorySearchVal !== 'todas' && !_getCategoryOptsFromAtivos().includes(_categorySearchVal)) {
      _categorySearchVal = 'todas';
      const cinp = document.getElementById('main-category-filter-input');
      if (cinp) cinp.value = '';
    }
    renderCards();
    if (typeof updateNotifBadge === 'function') updateNotifBadge();
  }

  function _ambSearchClose() {
    const dd = document.getElementById('amb-search-dropdown');
    if (dd) dd.style.display = 'none';
  }

  // ── CATEGORY SEARCH (filtro digitável de categoria na aba Ativos) ──
  let _categorySearchClickBound = false;

  function categorySearchGetValue() { return _categorySearchVal; }

  function _getCategoryOptsFromAtivos() {
    const fSetor = (typeof sectorSearchGetValue === 'function') ? sectorSearchGetValue() : 'todos';
    const visible = state.ativos.filter(a => {
      if (_ativosSubtab === 'em_desuso') { if (a.statusUso !== 'em_desuso') return false; }
      else { if (a.statusUso === 'em_desuso') return false; }
      if (typeof _userCanSeeAtivo === 'function' && !_userCanSeeAtivo(a)) return false;
      if (!_orgAtivoPassa(a, _unitSearchVal, fSetor, _ambSearchVal)) return false;
      return true;
    });
    const cats = [...new Set(visible.map(a => a.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt'));
    return cats;
  }

  function categorySearchOpen() {
    _categorySearchRenderDropdown('');
    const dd = document.getElementById('category-search-dropdown');
    if (dd) dd.style.display = '';
    if (!_categorySearchClickBound) {
      document.addEventListener('mousedown', (e) => {
        if (!e.target.closest('#category-search-wrap')) _categorySearchClose();
      });
      _categorySearchClickBound = true;
    }
  }

  function categorySearchToggle() {
    const dd = document.getElementById('category-search-dropdown');
    if (!dd) return;
    if (dd.style.display === 'none' || !dd.style.display) {
      document.getElementById('main-category-filter-input')?.focus();
      categorySearchOpen();
    } else {
      _categorySearchClose();
    }
  }

  function categorySearchFilter(q) {
    if (!q.trim() && _categorySearchVal !== 'todas') categorySearchSelect('todas', null);
    _categorySearchRenderDropdown(q.toLowerCase());
    const dd = document.getElementById('category-search-dropdown');
    if (dd) dd.style.display = '';
  }

  function categorySearchKey(e) {
    if (e.key === 'Escape') { _categorySearchClose(); e.target.blur(); }
    if (e.key === 'Enter') {
      const first = document.querySelector('#category-search-dropdown .sector-dd-item');
      if (first) first.click();
    }
  }

  function _categorySearchRenderDropdown(q) {
    const dd = document.getElementById('category-search-dropdown');
    if (!dd) return;
    const cats = _getCategoryOptsFromAtivos();
    const opts = [{ val: 'todas', label: 'Todas as categorias' }, ...cats.map(c => ({ val: c, label: c }))];
    const filtered = q ? opts.filter(o => o.label.toLowerCase().includes(q)) : opts;
    dd.innerHTML = filtered.length === 0
      ? `<div class="sector-dd-empty">Nenhuma categoria encontrada</div>`
      : filtered.map(o => `<div class="sector-dd-item${_categorySearchVal === o.val ? ' active' : ''}"
          onmousedown="categorySearchSelect('${o.val.replace(/'/g,"\\'")}',event)">${o.label}</div>`).join('');
  }

  function categorySearchSelect(val, event) {
    if (event) event.preventDefault();
    _categorySearchVal = val;
    const inp = document.getElementById('main-category-filter-input');
    if (inp) inp.value = val === 'todas' ? '' : val;
    _categorySearchClose();
    // Reseta filtro de setor se não tiver ativos na nova categoria
    if (_sectorSearchVal !== 'todos') {
      const newSetores = _getSectorOptsFromAtivos();
      if (!newSetores.includes(_sectorSearchVal)) {
        _sectorSearchVal = 'todos';
        const sinp = document.getElementById('main-sector-filter-input');
        if (sinp) sinp.value = '';
      }
    }
    renderCards();
    if (typeof updateNotifBadge === 'function') updateNotifBadge();
  }

  function _categorySearchClose() {
    const dd = document.getElementById('category-search-dropdown');
    if (dd) dd.style.display = 'none';
  }

  // ── TIPO SEARCH (filtro de tipo na aba Ativos) ──

  function tipoSearchOpen() {
    _tipoSearchRenderDropdown();
    const dd = document.getElementById('tipo-search-dropdown');
    if (dd) dd.style.display = '';
    if (!_tipoSearchClickBound) {
      document.addEventListener('mousedown', (e) => {
        if (!e.target.closest('#tipo-filter-wrap')) _tipoSearchClose();
      });
      _tipoSearchClickBound = true;
    }
  }

  function tipoSearchToggle() {
    const dd = document.getElementById('tipo-search-dropdown');
    if (!dd) return;
    if (dd.style.display === 'none' || !dd.style.display) {
      document.getElementById('main-tipo-filter-input')?.focus();
      tipoSearchOpen();
    } else {
      _tipoSearchClose();
    }
  }

  function tipoSearchKey(e) {
    if (e.key === 'Escape') { _tipoSearchClose(); e.target.blur(); }
    if (e.key === 'Enter') {
      const first = document.querySelector('#tipo-search-dropdown .sector-dd-item');
      if (first) first.click();
    }
  }

  function _tipoSearchRenderDropdown() {
    const dd = document.getElementById('tipo-search-dropdown');
    if (!dd) return;
    const tiposUsados = [...new Set(state.ativos.filter(a => {
      if (_ativosSubtab === 'em_desuso') return a.statusUso === 'em_desuso';
      return a.statusUso !== 'em_desuso';
    }).map(a => a.tipo || 'Equipamento'))].sort();
    const opts = [{ val: 'todos', label: 'Todos os tipos' }, ...tiposUsados.map(t => ({ val: t, label: t }))];
    dd.innerHTML = opts.map(o => `<div class="sector-dd-item${_tipoSearchVal === o.val ? ' active' : ''}"
      onmousedown="tipoSearchSelect('${o.val}',event)">${o.label}</div>`).join('');
  }

  function tipoSearchSelect(val, event) {
    if (event) event.preventDefault();
    _tipoSearchVal = val;
    const inp = document.getElementById('main-tipo-filter-input');
    if (inp) inp.value = val === 'todos' ? '' : val;
    _tipoSearchClose();
    renderCards();
    if (typeof updateNotifBadge === 'function') updateNotifBadge();
  }

  function _tipoSearchClose() {
    const dd = document.getElementById('tipo-search-dropdown');
    if (dd) dd.style.display = 'none';
  }

  // ── FORM SETOR SEARCH (campo digitável de setor no modal Novo Ativo) ──
  let _formSetorOpts = [];
  let _formSetorClickBound = false;

  function formSetorSetOptions(opts) { _formSetorOpts = opts; }

  function formSetorOpen() {
    _formSetorRenderDropdown(document.getElementById('ativo-setor-input')?.value?.toLowerCase() || '');
    const dd = document.getElementById('form-setor-dropdown');
    if (dd) dd.style.display = '';
    if (!_formSetorClickBound) {
      document.addEventListener('mousedown', (e) => {
        if (!e.target.closest('#form-setor-wrap')) _formSetorClose();
      });
      _formSetorClickBound = true;
    }
  }

  function formSetorToggle() {
    const dd = document.getElementById('form-setor-dropdown');
    if (!dd) return;
    if (dd.style.display === 'none' || !dd.style.display) {
      document.getElementById('ativo-setor-input')?.focus();
      formSetorOpen();
    } else {
      _formSetorClose();
    }
  }

  function formSetorFilter(q) {
    _formSetorRenderDropdown(q.toLowerCase());
    const dd = document.getElementById('form-setor-dropdown');
    if (dd) dd.style.display = '';
    document.getElementById('ativo-setor').value = '';
  }

  function formSetorKey(e) {
    if (e.key === 'Escape') { _formSetorClose(); e.target.blur(); }
    if (e.key === 'Enter') {
      const first = document.querySelector('#form-setor-dropdown .sector-dd-item');
      if (first) first.click();
    }
  }

  function _formSetorRenderDropdown(q) {
    const dd = document.getElementById('form-setor-dropdown');
    if (!dd) return;
    const curVal = document.getElementById('ativo-setor').value;
    const opts = _orgOpcoesSetores(_formSetorOpts, '');
    const filtered = q ? opts.filter(o => o.label.toLowerCase().includes(q)) : opts;
    let grupo = null;
    dd.innerHTML = filtered.length === 0
      ? `<div class="sector-dd-empty">Nenhum setor encontrado</div>`
      : filtered.map(o => {
          const head = _orgMigrado() && o.unidade !== grupo ? `<div class="sector-dd-group">${_orgEsc(o.unidade || 'Sem unidade')}</div>` : '';
          grupo = o.unidade;
          return head + `<div class="sector-dd-item${curVal === o.value ? ' active' : ''}"
          onmousedown="formSetorSelect('${_orgJsAttr(o.value)}',event)">${_orgEsc(_orgMigrado() ? _orgRotuloSetor(o.value, { semUnidade: true }) : o.label)}</div>`;
        }).join('');
  }

  function formSetorSelect(val, event) {
    if (event) event.preventDefault();
    document.getElementById('ativo-setor').value = val;
    document.getElementById('ativo-setor-input').value = _orgRotuloSetor(val);
    _formSetorClose();
    _formAmbienteSync();
  }

  // ── FORM AMBIENTE (sala do ativo; opções = ambientes vinculados ao setor escolhido) ──
  let _formAmbienteClickBound = false;

  // Ambientes do setor do formulário (inativo só se já é o do ativo)
  function _formAmbienteOpts() {
    const setorId = document.getElementById('ativo-setor')?.value || '';
    const atual = document.getElementById('ativo-ambiente')?.value || '';
    return _orgAmbientesDoSetor(setorId, { todos: true }).filter(x => x.ativo !== false || x.id === atual);
  }

  // Mostra/oculta o campo conforme o setor; um ambiente só → já selecionado
  function _formAmbienteSync() {
    const row = document.getElementById('ativo-ambiente-row');
    const hid = document.getElementById('ativo-ambiente');
    const inp = document.getElementById('ativo-ambiente-input');
    if (!row || !hid || !inp) return;
    const opts = _formAmbienteOpts();
    if (hid.value && !opts.some(x => x.id === hid.value)) hid.value = '';
    if (!hid.value && opts.length === 1) hid.value = opts[0].id;
    row.style.display = opts.length ? '' : 'none';
    if (document.activeElement !== inp) inp.value = hid.value ? _orgRotuloAmbiente(hid.value) : '';
    const s = _orgSetor(document.getElementById('ativo-setor')?.value);
    const hint = document.getElementById('ativo-ambiente-hint');
    if (hint) hint.textContent = s && opts.length > 1 ? `${opts.length} salas de ${s.nome}` : '';
    _formCompSync();
  }

  // ── COMPARTILHAR COM (outros setores do ambiente escolhido) ──
  let _formCompSel = new Set();

  // Setores do ambiente além do responsável (inativo só se já marcado)
  function _formCompOpts() {
    const amb = _orgAmbiente(document.getElementById('ativo-ambiente')?.value || '');
    const principal = document.getElementById('ativo-setor')?.value || '';
    if (!amb) return [];
    return _orgSetorIdsDoAmbiente(amb).filter(id => {
      const s = orgState.setores?.[id];
      return s && id !== principal && (s.ativo !== false || _formCompSel.has(id));
    });
  }

  function _formCompSync() {
    const row = document.getElementById('ativo-comp-row');
    const box = document.getElementById('ativo-comp-chips');
    if (!row || !box) return;
    const opts = _formCompOpts();
    row.style.display = opts.length ? '' : 'none';
    if (!opts.length) _formCompPopClose();
    box.innerHTML = opts.map(id => {
      const on = _formCompSel.has(id);
      return `<button type="button" class="org-pop-item${on ? ' on' : ''}" role="menuitemcheckbox" aria-checked="${on}" onclick="formCompToggle(this,'${_orgJsAttr(id)}')">
        <span class="org-toggle-chk"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg></span><span class="org-pop-nome">${_orgEsc(_orgSetor(id)?.nome || id)}</span></button>`;
    }).join('');
    _formCompRotulo();
  }

  // Resumo no botão: nenhum / nome do setor / "N setores"
  function _formCompRotulo() {
    const btn = document.getElementById('ativo-comp-btn');
    const rot = document.getElementById('ativo-comp-rot');
    if (!btn || !rot) return;
    const ids = _formCompOpts().filter(id => _formCompSel.has(id));
    rot.textContent = !ids.length ? 'Nenhum setor'
      : ids.length === 1 ? (_orgSetor(ids[0])?.nome || ids[0])
      : `${ids.length} setores`;
    btn.title = ids.map(id => _orgSetor(id)?.nome || id).join(', ');
    btn.classList.toggle('vazio', !ids.length);
  }

  function formCompToggle(btn, id) {
    const on = !_formCompSel.has(id);
    if (on) _formCompSel.add(id); else _formCompSel.delete(id);
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-checked', on);
    _formCompRotulo();
  }

  let _formCompPopBound = false;
  function formCompPopToggle() {
    const pop = document.getElementById('ativo-comp-pop');
    if (!pop) return;
    if (pop.classList.contains('open')) { _formCompPopClose(); return; }
    pop.classList.add('open');
    document.getElementById('ativo-comp-btn')?.setAttribute('aria-expanded', 'true');
    if (!_formCompPopBound) {
      document.addEventListener('mousedown', (e) => {
        if (!e.target.closest('#ativo-comp-wrap')) _formCompPopClose();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.getElementById('ativo-comp-pop')?.classList.contains('open')) {
          e.stopPropagation();
          _formCompPopClose();
          document.getElementById('ativo-comp-btn')?.focus();
        }
      }, true);
      _formCompPopBound = true;
    }
  }

  function _formCompPopClose() {
    document.getElementById('ativo-comp-pop')?.classList.remove('open');
    document.getElementById('ativo-comp-btn')?.setAttribute('aria-expanded', 'false');
  }

  function formAmbienteOpen() {
    _formAmbienteRenderDropdown(document.getElementById('ativo-ambiente-input')?.value?.toLowerCase() || '');
    const dd = document.getElementById('form-ambiente-dropdown');
    if (dd) dd.style.display = '';
    if (!_formAmbienteClickBound) {
      document.addEventListener('mousedown', (e) => {
        if (!e.target.closest('#form-ambiente-wrap')) _formAmbienteClose();
      });
      _formAmbienteClickBound = true;
    }
  }

  function formAmbienteToggle() {
    const dd = document.getElementById('form-ambiente-dropdown');
    if (!dd) return;
    if (dd.style.display === 'none' || !dd.style.display) {
      document.getElementById('ativo-ambiente-input')?.focus();
      formAmbienteOpen();
    } else {
      _formAmbienteClose();
    }
  }

  function formAmbienteFilter(q) {
    _formAmbienteRenderDropdown(q.toLowerCase());
    const dd = document.getElementById('form-ambiente-dropdown');
    if (dd) dd.style.display = '';
    document.getElementById('ativo-ambiente').value = '';
  }

  function formAmbienteKey(e) {
    if (e.key === 'Escape') { _formAmbienteClose(); e.target.blur(); }
    if (e.key === 'Enter') {
      const first = document.querySelector('#form-ambiente-dropdown .sector-dd-item');
      if (first) first.dispatchEvent(new MouseEvent('mousedown'));
    }
  }

  function _formAmbienteRenderDropdown(q) {
    const dd = document.getElementById('form-ambiente-dropdown');
    if (!dd) return;
    const setorId = document.getElementById('ativo-setor')?.value || '';
    const curVal = document.getElementById('ativo-ambiente').value;
    const opts = _formAmbienteOpts().map(x => ({
      val: x.id, label: _orgRotuloAmbiente(x.id),
      // Outros setores que dividem a sala
      tambem: _orgSetorIdsDoAmbiente(x).filter(id => id !== setorId).map(id => _orgSetor(id)?.nome).filter(Boolean)
    }));
    const filtered = q ? opts.filter(o => o.label.toLowerCase().includes(q)) : opts;
    dd.innerHTML = filtered.length === 0
      ? `<div class="sector-dd-empty">Nenhum ambiente encontrado</div>`
      : filtered.map(o => `<div class="sector-dd-item amb-dd-item${curVal === o.val ? ' active' : ''}"
          onmousedown="formAmbienteSelect('${_orgJsAttr(o.val)}',event)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M6 21V4a1 1 0 011-1h10a1 1 0 011 1v17"/><circle cx="14.5" cy="12" r=".9" fill="currentColor"/></svg><span>${_orgEsc(o.label)}${o.tambem.length ? `<small>também: ${_orgEsc(o.tambem.join(', '))}</small>` : ''}</span></div>`).join('');
  }

  function formAmbienteSelect(val, event) {
    if (event) event.preventDefault();
    document.getElementById('ativo-ambiente').value = val;
    document.getElementById('ativo-ambiente-input').value = _orgRotuloAmbiente(val);
    _formAmbienteClose();
    _formCompSync();
  }

  function _formAmbienteClose() {
    const dd = document.getElementById('form-ambiente-dropdown');
    if (dd) dd.style.display = 'none';
  }

  // Abre a janela da unidade do setor escolhido, na aba Ambientes
  function formAmbienteGerenciar() {
    const un = _orgUnidadeIdDoSetor(document.getElementById('ativo-setor')?.value || '');
    if (un && typeof orgAbrirAmbientes === 'function') orgAbrirAmbientes(un);
    else openSetorModal();
  }

  function _formSetorClose() {
    const dd = document.getElementById('form-setor-dropdown');
    if (dd) dd.style.display = 'none';
  }

  // ── FORM CATEGORIA SEARCH (campo digitável de categoria no modal Novo Ativo) ──
  let _formCategoriaOpts = [];
  let _formCategoriaClickBound = false;

  function formCategoriaSetOptions(opts) { _formCategoriaOpts = opts; }

  function formCategoriaOpen() {
    _formCategoriaRenderDropdown(document.getElementById('ativo-categoria-input')?.value?.toLowerCase() || '');
    const dd = document.getElementById('form-categoria-dropdown');
    if (dd) dd.style.display = '';
    if (!_formCategoriaClickBound) {
      document.addEventListener('mousedown', (e) => {
        if (!e.target.closest('#form-categoria-wrap')) _formCategoriaClose();
      });
      _formCategoriaClickBound = true;
    }
  }

  function formCategoriaToggle() {
    const dd = document.getElementById('form-categoria-dropdown');
    if (!dd) return;
    if (dd.style.display === 'none' || !dd.style.display) {
      document.getElementById('ativo-categoria-input')?.focus();
      formCategoriaOpen();
    } else {
      _formCategoriaClose();
    }
  }

  function formCategoriaFilter(q) {
    _formCategoriaRenderDropdown(q.toLowerCase());
    const dd = document.getElementById('form-categoria-dropdown');
    if (dd) dd.style.display = '';
    document.getElementById('ativo-categoria').value = '';
  }

  function formCategoriaKey(e) {
    if (e.key === 'Escape') { _formCategoriaClose(); e.target.blur(); }
    if (e.key === 'Enter') {
      const first = document.querySelector('#form-categoria-dropdown .sector-dd-item');
      if (first) first.click();
    }
  }

  function _formCategoriaRenderDropdown(q) {
    const dd = document.getElementById('form-categoria-dropdown');
    if (!dd) return;
    const curVal = document.getElementById('ativo-categoria').value;
    const filtered = q ? _formCategoriaOpts.filter(c => c.toLowerCase().includes(q)) : _formCategoriaOpts;
    dd.innerHTML = filtered.length === 0
      ? `<div class="sector-dd-empty">Nenhuma categoria encontrada</div>`
      : filtered.map(c => `<div class="sector-dd-item${curVal === c ? ' active' : ''}"
          onmousedown="formCategoriaSelect('${c.replace(/'/g,"\\'")}',event)">${c}</div>`).join('');
  }

  function formCategoriaSelect(val, event) {
    if (event) event.preventDefault();
    document.getElementById('ativo-categoria').value = val;
    document.getElementById('ativo-categoria-input').value = val;
    _formCategoriaClose();
  }

  function _formCategoriaClose() {
    const dd = document.getElementById('form-categoria-dropdown');
    if (dd) dd.style.display = 'none';
  }

  let _ativosSearchOpen = false;

  function toggleAtivosSearch() {
    _ativosSearchOpen = !_ativosSearchOpen;
    const field = document.getElementById('ativos-search-field');
    const input = document.getElementById('ativos-search-input');
    const btn   = document.getElementById('btn-ativos-search');
    if (_ativosSearchOpen) {
      field.style.display = '';
      // Trigger reflow para animar width
      requestAnimationFrame(() => { field.style.width = 'auto'; });
      input?.focus();
      btn?.classList.add('active');
    } else {
      field.style.display = 'none';
      if (input) input.value = '';
      btn?.classList.remove('active');
      renderCards();
    }
  }

  let _ativosSubtab = 'em_operacao';

  window.ativosSetSubtab = function (tab) {
    _ativosSubtab = tab;
    _tipoSearchVal = 'todos';
    const tipoInp = document.getElementById('main-tipo-filter-input');
    if (tipoInp) tipoInp.value = '';
    document.getElementById('subtab-em-operacao')?.classList.toggle('active', tab === 'em_operacao');
    document.getElementById('subtab-em-desuso')?.classList.toggle('active', tab === 'em_desuso');
    renderCards();
  };

  function renderCards() {
    const grid = document.getElementById('assets-grid');
    const fSetor = (typeof sectorSearchGetValue === 'function') ? sectorSearchGetValue() : 'todos';
    const fCat = (typeof categorySearchGetValue === 'function') ? categorySearchGetValue() : 'todas';
    const fBusca = _normalizeSearch(document.getElementById('ativos-search-input')?.value);
    _ambSearchValida();

    // Atualizar visibilidade do filtro de tipo (só mostra se existir mais de 1 tipo nos ativos visíveis)
    const tiposUsados = [...new Set(state.ativos.filter(a => {
      if (_ativosSubtab === 'em_desuso') return a.statusUso === 'em_desuso';
      return a.statusUso !== 'em_desuso';
    }).map(a => a.tipo || 'Equipamento'))];
    const tipoWrap = document.getElementById('tipo-filter-wrap');
    if (tipoWrap) tipoWrap.style.display = tiposUsados.length > 1 ? '' : 'none';
    _sectorSearchSyncInputs();

    const filtrados = state.ativos
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => {
        // sub-tab filter: em_desuso shows only em_desuso, em_operacao shows all others
        if (_ativosSubtab === 'em_desuso') {
          if (item.statusUso !== 'em_desuso') return false;
        } else {
          if (item.statusUso === 'em_desuso') return false;
        }
        if (typeof _userCanSeeAtivo === 'function' && !_userCanSeeAtivo(item)) return false;
        const matchSetor = _orgAtivoPassa(item, _unitSearchVal, fSetor, _ambSearchVal);
        const matchCat = fCat === 'todas' || item.categoria === fCat;
        const matchTipo = _tipoSearchVal === 'todos' || (item.tipo || 'Equipamento') === _tipoSearchVal;
        if (!matchSetor || !matchCat || !matchTipo) return false;
        if (fBusca) {
          const haystack = _normalizeSearch(item.nome + item.codigo + item.marca + item.modelo + item.serie);
          if (!haystack.includes(fBusca)) return false;
        }
        return true;
      })
      .sort((x, y) => {
        const sa = _orgChaveOrdemAtivo(x.item);
        const sb = _orgChaveOrdemAtivo(y.item);
        if (sa !== sb) return sa < sb ? -1 : 1;
        const ca = (x.item.codigo || '').toLowerCase();
        const cb = (y.item.codigo || '').toLowerCase();
        return ca < cb ? -1 : ca > cb ? 1 : 0;
      });

    if (filtrados.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          <h3>Nenhum ativo encontrado</h3>
          <p>Clique no botão "+" abaixo para cadastrar um novo equipamento.</p>
        </div>`;
      return;
    }

    grid.innerHTML = filtrados.map(({ item: a, index }) => {
      const { danger, warning, total } = getAtivoAlertCounts(index);
      const emPausa = a.statusUso === 'em_pausa';
      const emDesuso = a.statusUso === 'em_desuso';
      const alertCls = emDesuso ? 'asset-desuso' : (emPausa ? 'asset-paused' : (danger > 0 ? 'alert-danger' : (warning > 0 ? 'alert-warning' : '')));

      let flagHtml = '';
      if (emDesuso) {
        flagHtml = `<span class="task-flag flag-desuso" style="font-size:11px;padding:3px 8px;white-space:nowrap;" title="Ativo em desuso">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:11px;height:11px;flex-shrink:0;"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>&nbsp;Em Desuso</span>`;
      } else if (emPausa) {
        flagHtml = `<span class="task-flag flag-paused" style="font-size:11px;padding:3px 8px;white-space:nowrap;" title="Ativo em pausa">
          <svg viewBox="0 0 24 24" fill="currentColor" style="width:11px;height:11px;flex-shrink:0;"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>&nbsp;Em Pausa</span>`;
      } else if (total > 0) {
        const cls  = danger > 0 ? 'flag-danger' : 'flag-warning';
        const icon = danger > 0
          ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:11px;height:11px;flex-shrink:0;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
          : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:11px;height:11px;flex-shrink:0;"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/></svg>`;
        const tip  = [danger > 0 ? `${danger} vencida(s)` : '', warning > 0 ? `${warning} próxima(s)` : ''].filter(Boolean).join(', ');
        flagHtml = `<span class="task-flag ${cls}" style="font-size:11px;padding:3px 8px;white-space:nowrap;" title="${tip}" onclick="event.stopPropagation();openAtivoAlertasResumo(${index})">${icon}&nbsp;${total} alerta${total > 1 ? 's' : ''}</span>`;
      }

      return `
      <div class="asset-card ${alertCls}" onclick="visualizarAtivo(${index})">
        <div class="asset-header">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
            <div style="min-width:0;">
              <div class="asset-title">${a.nome}</div>
              <div class="asset-sub">
                <span class="asset-code">${a.codigo}</span>
                ${a.categoria ? `<span class="asset-cat" title="Categoria: ${_orgEsc(a.categoria)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg><span>${_orgEsc(a.categoria)}</span></span>` : ''}
              </div>
            </div>
            ${flagHtml}
          </div>
        </div>
        ${(a.tipo || 'Equipamento') === 'Equipamento' ? `
        <div class="asset-body">
          <div class="asset-row"><span class="asset-label">Marca</span><span class="asset-val">${a.marca}</span></div>
          <div class="asset-row"><span class="asset-label">Modelo</span><span class="asset-val">${a.modelo}</span></div>
          <div class="asset-row"><span class="asset-label">Nº Série</span><span class="asset-val">${a.serie}</span></div>
        </div>` : a.nota ? `<div class="asset-body"><div class="asset-row" style="flex-direction:column;align-items:flex-start;gap:2px;"><span class="asset-label">Observações</span><span class="asset-val" style="font-weight:400;color:var(--text-secondary);font-size:12px;white-space:pre-line;max-height:52px;overflow:hidden;">${a.nota}</span></div></div>` : `<div class="asset-body" style="min-height:32px;"></div>`}
        ${_assetLocHTML(a)}
      </div>`;
    }).join('');
  }

  // Rodapé do card: trilha "[NTO] Setor › Sala" em uma linha (rótulo completo no title)
  function _assetLocHTML(a) {
    const s = _orgSetorDoAtivo(a);
    const un = s?.unidadeId ? _orgUnidade(s.unidadeId) : null;
    const setor = s?.nome || a.setor || '—';
    const amb = _orgAmbienteDoAtivo(a);
    const tipo = a.tipo && a.tipo !== 'Equipamento' ? a.tipo : '';
    const comp = _orgSetoresCompDoAtivo(a).map(id => orgState.setores[id].nome);
    return `<div class="asset-loc" title="${_orgEsc(_orgRotuloAtivo(a, { ambiente: true, compartilhado: true }))}">
      ${un ? `<span class="asset-loc-un" style="--org-cor:${_orgCor(un)}">${_orgEsc(un.sigla)}</span>` : ''}
      <span class="asset-loc-setor${amb ? '' : ' so'}">${_orgEsc(setor)}</span>
      ${comp.length ? `<span class="asset-loc-mais" title="Compartilhado com: ${_orgEsc(comp.join(', '))}">+${comp.length}</span>` : ''}
      ${amb ? `<span class="asset-loc-sep">›</span><span class="asset-loc-amb"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M6 21V4a1 1 0 011-1h10a1 1 0 011 1v17"/><circle cx="14.5" cy="12" r=".9" fill="currentColor"/></svg><span>${_orgEsc(_orgRotuloAmbiente(amb.id))}</span></span>` : ''}
      ${tipo ? `<span class="asset-loc-tipo">${_orgEsc(tipo)}</span>` : ''}
    </div>`;
  }

  function openAtivoAlertasResumo(equipamentoIdx) {
    visualizarAtivo(equipamentoIdx, 'rotinas');
  }

  // ══════════════════════════════════════════
  // ── CONFIGURAÇÕES — BACKUP ──
  // ══════════════════════════════════════════

  let _backupFile = null;

  function renderSysInfo() {
    const grid = document.getElementById('cfg-sysinfo-grid');
    if (!grid) return;
    const nAtivos    = state.ativos.length;
    const nRotinas   = state.rotinas.length;
    const nTarefas   = state.tarefas.length;
    const nPubs      = state.publicacoes.length;
    const nPubsArq   = typeof arqTotalArquivadas === 'function' ? arqTotalArquivadas() : 0;
    const nSetores   = _orgSetores().length;
    const nUnidades  = _orgUnidades().length;
    const nCats      = state.categorias.length;
    const raw        = JSON.stringify(state) || '';
    const sizeKb     = (new Blob([raw]).size / 1024).toFixed(1);
    grid.innerHTML = [
      ['Ativos cadastrados', nAtivos],
      ['Rotinas', nRotinas],
      ['Tarefas', nTarefas],
      ['Publicações', nPubsArq ? `${nPubs} + ${nPubsArq} arquivadas` : nPubs],
      ...(_orgMigrado() ? [['Unidades', nUnidades]] : []),
      ['Setores', nSetores],
      ...(_orgTemAmbientes() ? [['Ambientes', _orgAmbientes().length]] : []),
      ['Categorias', nCats],
      ['Tamanho do banco', sizeKb + ' KB'],
      ['Chave de armazenamento', STORAGE_KEY],
    ].map(([label, value]) => `
      <div class="cfg-sysinfo-item">
        <div class="cfg-sysinfo-label">${label}</div>
        <div class="cfg-sysinfo-value">${value}</div>
      </div>`).join('');
  }

  async function exportarBackup() {
    // Admin: backup completo do banco (todos os nós: ativos, CQ, OT, ocorrências, empresas...)
    if (typeof currentSession !== 'undefined' && currentSession?.isAdmin && typeof baixarBackupCompleto === 'function') {
      if (await baixarBackupCompleto()) {
        const label = document.getElementById('backup-last-export-label');
        if (label) label.textContent = `Último export: ${new Date().toLocaleString('pt-BR')}`;
      }
      return;
    }
    // Inclui dados de auth se disponíveis
    const exportData = { ...state };
    // Publicações arquivadas vão no formato compactado do banco (grupos + índice + execuções)
    if (typeof arqExportarDados === 'function') {
      const arquivo = await arqExportarDados();
      if (arquivo) exportData.arquivoPublicacoes = arquivo;
    }
    // Unidades e setores (nó próprio, compartilhado com o CQ)
    if (typeof _orgParaBackup === 'function') exportData.organizacao = _orgParaBackup();
    if (typeof authState !== 'undefined') {
      exportData.auth = {
        users:             authState.users,
        groups:            authState.groups,
        cargos:            authState.cargos,
        allowRegistration: authState.allowRegistration
      };
    }
    const data     = JSON.stringify(exportData, null, 2);
    const blob     = new Blob([data], { type: 'application/json' });
    const url      = URL.createObjectURL(blob);
    const now      = new Date();
    const stamp    = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const a        = document.createElement('a');
    a.href         = url;
    a.download     = `backup-gestao-ativos-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    const label = document.getElementById('backup-last-export-label');
    if (label) label.textContent = `Último export: ${now.toLocaleString('pt-BR')}`;
    showToast('Backup exportado com sucesso!', 'success');
  }

  function backupDragOver(e) {
    e.preventDefault();
    document.getElementById('backup-drop-zone')?.classList.add('drag-over');
  }
  function backupDragLeave() {
    document.getElementById('backup-drop-zone')?.classList.remove('drag-over');
  }
  function backupDrop(e) {
    e.preventDefault();
    document.getElementById('backup-drop-zone')?.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (file) _processarArquivoBackup(file);
  }
  function backupFileSelected(e) {
    const file = e.target.files?.[0];
    if (file) _processarArquivoBackup(file);
    e.target.value = '';
  }

  function _processarArquivoBackup(file) {
    if (!file.name.endsWith('.json')) {
      showToast('Selecione um arquivo .json válido.', 'error');
      return;
    }
    _backupFile = file;
    const nameEl = document.getElementById('backup-file-name');
    const infoEl = document.getElementById('backup-file-info');
    const btnEl  = document.getElementById('btn-restaurar-backup');
    if (nameEl) nameEl.textContent = file.name;
    if (infoEl) infoEl.style.display = 'flex';
    if (btnEl)  btnEl.disabled = false;
  }

  function limparArquivoBackup() {
    _backupFile = null;
    const infoEl = document.getElementById('backup-file-info');
    const btnEl  = document.getElementById('btn-restaurar-backup');
    if (infoEl) infoEl.style.display = 'none';
    if (btnEl)  btnEl.disabled = true;
  }

  function restaurarBackup() {
    if (!_backupFile) return;
    const input = document.getElementById('restauracao-confirm-input');
    if (input) input.value = '';
    const btn = document.getElementById('btn-executar-restauracao');
    if (btn) { btn.disabled = true; btn.style.opacity = '.4'; btn.style.cursor = 'not-allowed'; }
    openModal('modal-confirmar-restauracao');
    setTimeout(() => input?.focus(), 120);
  }

  function validarConfirmRestauracao() {
    const input = document.getElementById('restauracao-confirm-input');
    const btn   = document.getElementById('btn-executar-restauracao');
    if (!input || !btn) return;
    const ok = input.value.trim().toUpperCase() === 'SIM';
    btn.disabled      = !ok;
    btn.style.opacity = ok ? '1' : '.4';
    btn.style.cursor  = ok ? 'pointer' : 'not-allowed';
  }

  function executarRestauracao() {
    const input = document.getElementById('restauracao-confirm-input');
    if (!input || input.value.trim().toUpperCase() !== 'SIM') return;
    if (!_backupFile) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
      try {
        const parsed = JSON.parse(e.target.result);
        // Backup completo (formato do sistema antigo ou o nosso): vai para a restauração completa
        if (parsed && (parsed.formato === 'backup-completo' || parsed._tipo === 'manutencao-completo')) {
          closeModal('modal-confirmar-restauracao');
          return restaurarBackupCompleto({ files: [_backupFile], value: '' });
        }
        const requiredKeys = ['setores', 'categorias', 'ativos', 'rotinas', 'tarefas', 'publicacoes'];
        const missing = requiredKeys.filter(k => !(k in parsed));
        if (missing.length > 0) {
          closeModal('modal-confirmar-restauracao');
          showToast(`Arquivo inválido: campos ausentes (${missing.join(', ')}).`, 'error');
          return;
        }
        // Separa dados de auth dos dados de sistema
        const { auth: authBackup, arquivoPublicacoes, organizacao, ...stateData } = parsed;
        state = stateData;
        // Grava direto e espera a resposta: erro de permissão aparece em vez de "sucesso" falso
        try {
          await _db.ref(STORAGE_KEY).set(JSON.parse(JSON.stringify(state)));
          if (organizacao && typeof ORG_KEY !== 'undefined') await _db.ref(ORG_KEY).set(JSON.parse(JSON.stringify(organizacao)));
        } catch (errGrava) {
          console.error('[restauração]', errGrava);
          closeModal('modal-confirmar-restauracao');
          showToast('Falha ao gravar no banco: ' + (errGrava.code || errGrava.message) + '. Confira as regras do Firebase (nó manutencao).', 'error');
          return;
        }
        _stateFirebaseReady = true;
        refreshTaskFlagsUI();
        if (arquivoPublicacoes && typeof arqRestaurarDados === 'function') arqRestaurarDados(arquivoPublicacoes);

        // Restaura dados de auth (se presentes no backup)
        if (authBackup && typeof authState !== 'undefined' && typeof _saveAuth === 'function') {
          if (Array.isArray(authBackup.users)) {
            // Mantém os vínculos com o Dados LAMIC (mesmo id) e quem já entrou pelo Dados e não está no backup
            const atuais = authState.users || [];
            const restaurados = authBackup.users.map(u => {
              const a = atuais.find(x => x.id === u.id);
              return a && a.dadosLogin ? { ...u, dadosLogin: a.dadosLogin, username: a.username, nomeCompleto: a.nomeCompleto } : u;
            });
            // Conta criada no primeiro acesso (id novo) e que existe no backup: o vínculo passa para o
            // usuário do backup (CPF ou nome igual) — é ele que tem o histórico. Sem par, fica como está.
            const cpfDe = (c) => String(c || '').replace(/\D/g, '');
            const nomeDe = (n) => (typeof _authNomeChave === 'function' ? _authNomeChave(n) : String(n || '').toUpperCase().trim());
            atuais.filter(a => a.dadosLogin && !restaurados.some(u => u.id === a.id) && !restaurados.some(u => u.dadosLogin === a.dadosLogin))
              .forEach(a => {
                const par = restaurados.find(u => !u.dadosLogin && cpfDe(a.cpf) && cpfDe(u.cpf) === cpfDe(a.cpf))
                  || restaurados.find(u => !u.dadosLogin && nomeDe(u.nomeCompleto) === nomeDe(a.nomeCompleto));
                if (par) { par.dadosLogin = a.dadosLogin; par.username = a.username; par.nomeCompleto = a.nomeCompleto; if (a.isAdmin) par.isAdmin = true; }
                else restaurados.push(a);
              });
            authState.users = restaurados;
          }
          if (Array.isArray(authBackup.groups)) authState.groups = authBackup.groups;
          if (Array.isArray(authBackup.cargos)) authState.cargos = authBackup.cargos;
          authState.allowRegistration = authBackup.allowRegistration !== false;
          _saveAuth();
          // Verifica se o usuário atual ainda existe nos dados restaurados
          if (typeof currentSession !== 'undefined' && currentSession) {
            const aindaExiste = authState.users.some(u =>
              u.id === currentSession.userId && u.ativo !== false);
            if (!aindaExiste) {
              // Recarrega: a sessão do Dados é religada ao usuário restaurado (CPF / nome)
              closeModal('modal-confirmar-restauracao');
              showToast('Backup restaurado. Recarregando para religar sua conta…', 'info');
              setTimeout(() => location.reload(), 1500);
              return;
            }
          }
          if (typeof renderUsersTable  === 'function') renderUsersTable();
          if (typeof renderGroupsTable === 'function') renderGroupsTable();
        }

        limparArquivoBackup();
        renderSysInfo();
        closeModal('modal-confirmar-restauracao');
        showToast('Dados restaurados com sucesso!', 'success');
      } catch {
        closeModal('modal-confirmar-restauracao');
        showToast('Erro ao ler o arquivo. Verifique se é um backup válido.', 'error');
      }
    };
    reader.readAsText(_backupFile);
  }
// Impressão sem abrir aba: o HTML vai para um iframe oculto e só aparece o diálogo de impressão.
// O HTML traz o próprio window.print() no onload (roda no iframe). O iframe sai depois de imprimir
// ou na próxima impressão.
function imprimirEmSegundoPlano(html) {
  document.getElementById('print-frame')?.remove();
  const f = document.createElement('iframe');
  f.id = 'print-frame';
  f.setAttribute('aria-hidden', 'true');
  f.tabIndex = -1;
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(f);
  const doc = f.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
  f.contentWindow.addEventListener('afterprint', () => setTimeout(() => f.remove(), 500));
  return true;
}


// ═══════════════════════════════════════════════════════════════
// Backup completo: o nó "manutencao" inteiro (todas as chaves do sistema).
// Restaurar substitui o nó inteiro; antes baixa uma cópia do que está no banco.
// ═══════════════════════════════════════════════════════════════
function _backupCompletoPode() {
  const ok = typeof currentSession !== 'undefined' && currentSession?.isAdmin;
  if (!ok && typeof showToast === 'function') showToast('Só administradores fazem backup completo.', 'error');
  return ok;
}
function _baixarJson(obj, nome) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const _carimbo = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

// Formato único de backup completo (o mesmo do sistema antigo):
// { formato: 'backup-completo', versao: 3, geradoEm, geradoPor, contagens, nos: { <nó>: dados } }
function _montarBackupCompleto(dados) {
  const nos = dados || {};
  const contar = v => v && typeof v === 'object' ? Object.keys(v).length : (v == null ? 0 : 1);
  return {
    formato: 'backup-completo', versao: 3, geradoEm: new Date().toISOString(),
    geradoPor: (typeof currentSession !== 'undefined' && currentSession?.nomeCompleto) || '',
    contagens: Object.fromEntries(Object.entries(nos).map(([k, v]) => [k, contar(v)])),
    nos,
  };
}

async function baixarBackupCompleto(nomeArquivo) {
  if (!_backupCompletoPode()) return false;
  try {
    const dados = await window.dbGet('');
    if (!dados) { showToast('O banco da Manutenção está vazio.', 'info'); return false; }
    _baixarJson(_montarBackupCompleto(dados), nomeArquivo || `backup-gestao-ativos-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`);
    showToast('Backup completo baixado.', 'success');
    return true;
  } catch (e) {
    console.error(e); showToast('Falha ao ler o banco: ' + (e.code || e.message), 'error');
    return false;
  }
}

async function restaurarBackupCompleto(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file || !_backupCompletoPode()) return;
  let j;
  try { j = JSON.parse(await file.text()); } catch (e) { showToast('Arquivo JSON inválido.', 'error'); return; }
  // Aceita: nosso backup completo, o export do Firebase antigo (chaves na raiz)
  // ou um export do applamic inteiro (pega só o nó manutencao).
  // Também aceita o backup completo do sistema antigo: { formato: 'backup-completo', versao, nos: {...} }.
  let dados = j && j._tipo === 'manutencao-completo' ? j.dados
    : (j && j.formato === 'backup-completo' && j.nos && typeof j.nos === 'object') ? j.nos
    : (j && j.manutencao && typeof j.manutencao === 'object' ? j.manutencao : j);
  // nós vazios do arquivo (null) não apagam nada: só entram os que têm dado
  dados = Object.fromEntries(Object.entries(dados || {}).filter(([, v]) => v !== null && v !== undefined));
  const chaves = Object.keys(dados || {});
  const conhecidas = ['gestao-ativos-v2', 'auth-key-v1', 'gestao-org-v1', 'gestao-ot-v1', 'gestao-ocorrencias-v1', 'gestao-empresas-v1', 'gestao-pubs-arquivo-v1'];
  if (!chaves.some(k => conhecidas.includes(k) || k.startsWith('gestao-cq-'))) {
    showToast('Este arquivo não parece um backup completo da Manutenção (para o backup simples use "Importar" abaixo).', 'error'); return;
  }
  const ok = await uiConfirmar({
    tipo: 'perigo', titulo: 'Restaurar backup completo?', confirmar: 'Restaurar tudo',
    mensagem: `Os dados atuais da Manutenção serão substituídos por ${chaves.length} nós do arquivo "${file.name}". Antes, uma cópia do banco atual será baixada.`,
  });
  if (!ok) return;
  try {
    const atual = await window.dbGet('');
    if (atual) _baixarJson(_montarBackupCompleto(atual), `manutencao_antes_restaurar_${_carimbo()}.json`);
    // Grava nó a nó: os que vêm no arquivo são substituídos; os que não vêm ficam como estão.
    await _db.ref('').update(dados);
    showToast('Backup completo restaurado. Recarregando…', 'success');
    setTimeout(() => location.reload(), 1500);
  } catch (e) {
    console.error(e); showToast('Falha ao restaurar: ' + (e.code || e.message), 'error');
  }
}
window.baixarBackupCompleto = baixarBackupCompleto;
window.restaurarBackupCompleto = restaurarBackupCompleto;

// ═══════════════════════════════════════════════════════════════
// Completar do banco antigo (manutecao-51789, leitura pública): copia para "manutencao/"
// só os nós que ainda NÃO existem aqui (CQ, ocorrências, empresas...). O que já existe
// não é tocado. Antes baixa uma cópia do banco antigo e uma do atual.
// ═══════════════════════════════════════════════════════════════
async function completarDoBancoAntigo() {
  if (!_backupCompletoPode()) return;
  const ANTIGO = 'https://manutecao-51789-default-rtdb.firebaseio.com/.json';
  let antigo;
  try {
    const r = await fetch(ANTIGO);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    antigo = await r.json();
  } catch (e) { showToast('Não foi possível ler o banco antigo: ' + e.message, 'error'); return; }
  if (!antigo || typeof antigo !== 'object') { showToast('O banco antigo está vazio.', 'info'); return; }
  let atual;
  try { atual = (await window.dbGet('')) || {}; }
  catch (e) { showToast('Falha ao ler o banco atual: ' + (e.code || e.message), 'error'); return; }
  const faltam = Object.keys(antigo).filter(k => atual[k] === undefined || atual[k] === null);
  const existem = Object.keys(antigo).filter(k => !faltam.includes(k));
  if (!faltam.length) { showToast('Nada a completar: todos os nós do banco antigo já existem aqui.', 'info'); return; }
  const ok = await uiConfirmar({
    tipo: 'aviso', titulo: 'Completar do banco antigo?', confirmar: 'Copiar ' + faltam.length + ' nó(s)',
    mensagem: `Serão copiados: ${faltam.join(', ')}.\nJá existem aqui e NÃO serão alterados: ${existem.join(', ') || '—'}.\nAntes, cópias do banco antigo e do atual serão baixadas.`,
  });
  if (!ok) return;
  _baixarJson(_montarBackupCompleto(antigo), `manutencao_banco_antigo_${_carimbo()}.json`);
  _baixarJson(_montarBackupCompleto(atual), `manutencao_antes_completar_${_carimbo()}.json`);
  const falhas = [];
  for (const k of faltam) {
    try { await _db.ref(k).set(antigo[k]); } catch (e) { falhas.push(k + ': ' + (e.code || e.message)); }
  }
  if (falhas.length) { showToast('Copiado com falhas: ' + falhas.join('; '), 'error'); return; }
  showToast(faltam.length + ' nó(s) copiado(s). Recarregando…', 'success');
  setTimeout(() => location.reload(), 1500);
}
window.completarDoBancoAntigo = completarDoBancoAntigo;
