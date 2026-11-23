// === CONTROLE DE ABAS + EVENT LISTENERS INICIAIS ===

    // --- TAB CONTROL ---
    function switchTab(tab) {
    currentTab = tab;

    // Fechar janela de filtros ao mudar de aba
    closeFilters();

    // Resetar sub-aba da lista e ordenação ao mudar de módulo
    currentListSubtab = 'cards';
    if (typeof _tableSort !== 'undefined') _tableSort = { col: null, dir: 'asc' };
    document.querySelectorAll('.list-subtab').forEach(b => b.classList.remove('active'));
    var _stCards = document.getElementById('listSubtabCards');
    if (_stCards) _stCards.classList.add('active');

    // 1. Gerenciamento visual dos botões da sidebar
    document.querySelectorAll('.sidebar button').forEach(b => b.classList.remove('active'));
    var tabId = 'tab' + tab.charAt(0).toUpperCase() + tab.slice(1);
    var btn = document.getElementById(tabId);
    if(btn) btn.classList.add('active');

    // 2. Atualização de títulos e subtítulos
    var titles = {
        dashboard: 'Dashboard',
        auditoria: 'Rotinas',
        atividades: 'Gestão de Atividades',
        manutencao: 'Manutenção',
        documentos: 'Documentos',
        ocorrencias: 'Ocorrências',
        rnc: 'RNC',
        reunioes: 'Reuniões',
        backup: 'Backup do Sistema'
    };
    var subtitles = {
        dashboard: 'Visão geral e indicadores de desempenho',
        auditoria: 'Planejamento e execução de rotinas',
        atividades: 'Controle de tarefas, reuniões e projetos',
        manutencao: 'Controle preventivo de equipamentos',
        documentos: 'Gerenciamento e controle de revisões',
        ocorrencias: 'Gestão de N/C — registro de ocorrências',
        rnc: 'Gestão de N/C — relatórios de não conformidade',
        reunioes: 'Agenda, pauta e atas de reuniões',
        backup: 'Segurança dos dados'
    };

    document.getElementById('pageTitle').textContent = titles[tab];
    document.getElementById('pageSubtitle').textContent = subtitles[tab];

    // 3. Controle de visibilidade das seções principais
    var isBackup = tab === 'backup';
    var isDashboard = tab === 'dashboard';
    var isConfig = tab === 'configuracoes';
    var isOcorrencias = tab === 'ocorrencias';
    var isRnc = tab === 'rnc';
    var isReunioes = tab === 'reunioes';

    // Garante que a busca por título só atue quando o campo estiver ativo/visível
    if (isDashboard) setTitleSearchEnabled('cards', false);
    else setTitleSearchEnabled('dash', false);

    document.getElementById('filtersBarWrap').style.display = (isBackup || isDashboard || isConfig || isOcorrencias || isRnc || isReunioes) ? 'none' : 'flex';
    // Abas Tarefas/Ocorrências do dashboard
    var _dsb = document.getElementById('dashSubtabsBar');
    if (_dsb) _dsb.style.display = isDashboard ? 'flex' : 'none';
    document.getElementById('filtersBarDashboard').style.display = isDashboard ? 'flex' : 'none';
    if (!isDashboard) {
        var _fbo = document.getElementById('filtersBarDashOc'); if (_fbo) _fbo.style.display = 'none';
        var _doc0 = document.getElementById('dashboardOcContent'); if (_doc0) _doc0.style.display = 'none';
    }

    // Kanban/Calendário: controla grid vs board kanban vs board calendário
    var _hasKanban = typeof KANBAN_TABS !== 'undefined' && KANBAN_TABS.includes(tab);
    var _isKanbanMode = _hasKanban && typeof isKanbanActive === 'function' && isKanbanActive(tab);
    var _isCalMode = _hasKanban && typeof isCalendarActive === 'function' && isCalendarActive(tab);
    var _hideGrid = isBackup || isDashboard || isConfig || isOcorrencias || isRnc || isReunioes || _isKanbanMode || _isCalMode;
    var _showListMode = !isBackup && !isDashboard && !isConfig && !isOcorrencias && !isRnc && !isReunioes && !_isKanbanMode && !_isCalMode;
    document.getElementById('cardsGrid').style.display = (_hideGrid || currentListSubtab !== 'cards') ? 'none' : 'grid';
    var _lsBar = document.getElementById('listSubtabsBar');
    if (_lsBar) _lsBar.style.display = (_showListMode && tab === 'atividades') ? 'flex' : 'none';
    var _tv = document.getElementById('tableView');
    if (_tv) _tv.style.display = (_showListMode && currentListSubtab === 'table') ? 'block' : 'none';
    var _gv = document.getElementById('groupsView');
    if (_gv) _gv.style.display = (_showListMode && currentListSubtab === 'groups') ? 'flex' : 'none';
    var _sv = document.getElementById('setoresView');
    if (_sv) _sv.style.display = (_showListMode && currentListSubtab === 'setores') ? 'flex' : 'none';
    var _kbBoard = document.getElementById('kanbanBoard');
    if (_kbBoard) _kbBoard.style.display = _isKanbanMode ? 'flex' : 'none';
    var _calBoard = document.getElementById('calendarBoard');
    if (_calBoard) _calBoard.style.display = _isCalMode ? 'block' : 'none';

    // Toggle Lista/Kanban/Calendário — módulos com visualização kanban
    var _kbToggle = document.getElementById('viewToggleModuleBar');
    if (_kbToggle) _kbToggle.style.display = _hasKanban ? 'flex' : 'none';
    if (typeof _kbUpdateToggleBtns === 'function') _kbUpdateToggleBtns();
    if (typeof _calUpdateToggleBtns === 'function') _calUpdateToggleBtns();

    // --- Controle do botão "Novo Registro" e "Nova Coluna" ---
    var addBtn     = document.getElementById('addBtn');
    var addColRow  = document.getElementById('fbarAddcolRow');
    var _isKanbanNow = _isKanbanMode;
    var canUserEdit  = userCanEditCards();
    var showActions  = (!isBackup && !isDashboard && !isConfig && !isOcorrencias && !isRnc && !isReunioes && canUserEdit)
                       || (isOcorrencias && canUserEdit)
                       || (isRnc && canUserEdit);
    var showAddCol   = showActions && _isKanbanNow && !isOcorrencias && !isRnc;

    if (addBtn)    addBtn.style.display   = showActions ? 'flex' : 'none';
    if (addColRow) addColRow.style.display = showAddCol ? 'flex' : 'none';

    // --- Controle do botão de LIXEIRA ---
    var trashBtn = document.getElementById('trashBtn');
    if (trashBtn) {
        // O botão de lixeira aparece se NÃO for backup/dash/config/ocorrências/rnc
        if (!isBackup && !isDashboard && !isConfig && !isOcorrencias && !isRnc && !isReunioes) {
            trashBtn.style.display = 'flex';
        } else {
            trashBtn.style.display = 'none';
        }
    }
    updateTrashBadge();

    // --- Controle do botão "Novos cards como responsável" ---
    var newCardsContainer = document.getElementById('newCardsContainer');
    if (newCardsContainer) {
        var hideNewCards = isBackup || isConfig || isOcorrencias || isRnc || isReunioes;
        newCardsContainer.style.display = hideNewCards ? 'none' : 'flex';
        if (hideNewCards) {
            var _ncModal = document.getElementById('newCardsModal');
            if (_ncModal) _ncModal.classList.remove('active');
        }
    }
    if (typeof updateNewCardsBadge === 'function') updateNewCardsBadge();

    // Botão filtro de setores
    if (typeof _syncSetorFilterBtn === 'function') _syncSetorFilterBtn();

    // 4. Exibição do conteúdo específico das abas
    document.getElementById('backupContent').style.display = isBackup ? 'flex' : 'none';
    document.getElementById('dashboardContent').style.display = isDashboard ? 'flex' : 'none';
    var ocEl = document.getElementById('ocorrenciasContent');
    if (ocEl) ocEl.style.display = isOcorrencias ? 'flex' : 'none';
    var rncEl = document.getElementById('rncContent');
    if (rncEl) rncEl.style.display = isRnc ? 'flex' : 'none';
    var reuEl = document.getElementById('reunioesContent');
    if (reuEl) reuEl.style.display = isReunioes ? 'flex' : 'none';
    // Na aba de Ocorrências ou RNC, oculta filtros de setor/data padrão do header
    if (isOcorrencias || isRnc || isReunioes) {
        var _sf = document.getElementById('btnSetorFilter'); if (_sf) _sf.style.display = 'none';
        var _df = document.getElementById('fbarDateBtn'); if (_df) _df.style.display = 'none';
    }
    // Mostra os filtros próprios de Ocorrências (e o sino) conforme a aba
    if (typeof window.ocSetHeaderFilters === 'function') window.ocSetHeaderFilters(isOcorrencias);
    // Mostra os filtros próprios de RNC (e o sino RNC) conforme a aba
    if (typeof window.rncSetHeaderFilters === 'function') window.rncSetHeaderFilters(isRnc);
    var cfgEl = document.getElementById('configContent');
    if (cfgEl) {
        cfgEl.style.display = isConfig ? 'block' : 'none';
        if (isConfig) {
            renderusersConfigTable();
            if (typeof window.renderConfigGroupsUI === 'function') window.renderConfigGroupsUI();
            // Atualiza o botão de setores se necessário
            if (masterLists && masterLists.setores && typeof updateSetoresButtonText === 'function') {
                updateSetoresButtonText();
            }
        }
    }

    // 5. Ativação dos grupos de filtros específicos
    document.getElementById('filtersAuditoria').style.display = tab === 'auditoria' ? 'flex' : 'none';
    document.getElementById('filtersAtividades').style.display = tab === 'atividades' ? 'flex' : 'none';
    document.getElementById('filtersDocumentos').style.display = tab === 'documentos' ? 'flex' : 'none';

    // 6. Sincroniza filtro de data para a aba antes de renderizar
    if (typeof _syncDateHiddenSelects === 'function' && typeof _tabPrefix === 'function') {
        _syncDateHiddenSelects(_tabPrefix());
    }

    // 6. Renderização inicial dos dados da aba
    if(isDashboard) {
        renderDashboard();
        if (typeof window.applyDashSubtab === 'function') window.applyDashSubtab();
    } else if(isOcorrencias) {
        if (typeof window.ocActivateTab === 'function') window.ocActivateTab();
    } else if(isRnc) {
        if (typeof window.rncActivateTab === 'function') window.rncActivateTab();
    } else if(isReunioes) {
        if (typeof window.reuActivateTab === 'function') window.reuActivateTab();
    } else if(!isBackup && !isConfig) {
        if (_isCalMode && typeof renderCalendar === 'function') {
            renderCalendar();
        } else {
            renderCards();
        }
    }

    // 7. Atualiza o contador de notificações para a aba
    updateNotificationCount();

    // 8. Salva os filtros no Firebase
    saveFiltersToFirebase();
}

    document.getElementById('tabDashboard').onclick = () => switchTab('dashboard');
    document.getElementById('tabAuditoria').onclick = () => switchTab('auditoria');
    document.getElementById('tabAtividades').onclick = () => switchTab('atividades');
    document.getElementById('tabDocumentos').onclick = () => switchTab('documentos');
    document.getElementById('tabOcorrencias').onclick = () => switchTab('ocorrencias');
    document.getElementById('tabRnc').onclick = () => switchTab('rnc');
    document.getElementById('tabReunioes').onclick = () => switchTab('reunioes');
    document.getElementById('tabBackup').onclick = () => switchTab('backup');
    document.getElementById('tabConfiguracoes').onclick = () => {
        if (!userIsAdmin()) {
            alert('Aba Configurações disponível apenas para o usuário "admin".');
            return;
        }
        switchTab('configuracoes');
    };

    // Fechar notificações ao clicar fora do modal
    document.addEventListener('click', (e) => {
        const modal = document.getElementById('notificationModal');
        const container = document.getElementById('notificationContainer');
        if (modal && !modal.contains(e.target) && !container.contains(e.target)) {
            closeNotificationModal();
        }
        const newCardsModal = document.getElementById('newCardsModal');
        const newCardsContainer = document.getElementById('newCardsContainer');
        if (newCardsModal && newCardsContainer &&
            !newCardsModal.contains(e.target) && !newCardsContainer.contains(e.target)) {
            if (typeof closeNewCardsModal === 'function') closeNewCardsModal();
        }
    });
