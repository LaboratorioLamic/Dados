// === SISTEMA DE NOTIFICAÇÕES ===

    // --- SISTEMA DE NOTIFICAÇÕES ---

    function getNotificationsForTab() {
        let data = [];
        let tabType = '';

        if (currentTab === 'auditoria') {
            data = audits;
            tabType = 'audit';
        } else if (currentTab === 'atividades') {
            data = activities;
            tabType = 'ativ';
        } else if (currentTab === 'manutencao') {
            data = maintenances;
            tabType = 'mant';
        } else if (currentTab === 'documentos') {
            data = documents;
            tabType = 'doc';
        } else if (currentTab === 'dashboard') {
            // Dashboard mostra notificações de todos, respeitando filtros
            const dashboardFilters = getDashboardFilters();
            const allowedTabs = userAllowedTabs(); // Abas que o usuário tem permissão de acessar

            let allData = [
                { items: audits, type: 'audit', tabName: 'auditoria' },
                { items: activities, type: 'ativ', tabName: 'atividades' },
                { items: maintenances, type: 'mant', tabName: 'manutencao' },
                { items: documents, type: 'doc', tabName: 'documentos' }
            ];

            // Aplicar filtro de permissões de setores
            const allowedSetores = getAllowedSetores();
            if (allowedSetores !== null) {
                allData.forEach(d => {
                    d.items = d.items.filter(item => setorMatchesAny(item.setor, allowedSetores));
                });
            }

            // Filtra apenas as abas que o usuário tem permissão de acessar
            if (allowedTabs && allowedTabs.length > 0) {
                allData = allData.filter(d => allowedTabs.includes(d.tabName));
            }

            // Filtra por área se selecionada
            if (dashboardFilters.area) {
                allData = allData.filter(d => d.type === dashboardFilters.area);
            }

            // SOFT DELETE: remover itens deletados das notificações do dashboard
            allData.forEach(d => {
                d.items = d.items.filter(item => !item.deleted);
            });

            // Aplica todos os filtros e coleta notificações
            const allNotifications = [];
            allData.forEach(({ items, type }) => {
                const filtered = applyDashboardFiltersToData(items, type, dashboardFilters);
                allNotifications.push(...getFilteredNotifications(filtered, type));
            });

            // Ordena: atrasados primeiro, depois alertas
            return allNotifications.sort((a, b) => {
                if (a.priority !== b.priority) {
                    return a.priority - b.priority;
                }
                return new Date(a.dateField) - new Date(b.dateField);
            });
        }

        // SOFT DELETE: remover itens deletados das notificações
        data = data.filter(item => !item.deleted);

        // Aplicar filtro de permissões de setores para abas específicas
        const allowedSetores = getAllowedSetores();
        if (allowedSetores !== null) {
            data = data.filter(item => setorMatchesAny(item.setor, allowedSetores));
        }

        // Para abas específicas, aplica filtros
        const filteredData = applyCurrentTabFilters(data, tabType);
        return getFilteredNotifications(filteredData, tabType).sort((a, b) => {
            if (a.priority !== b.priority) {
                return a.priority - b.priority;
            }
            return new Date(a.dateField) - new Date(b.dateField);
        });
    }

    function getDashboardFilters() {
        return {
            area:          document.getElementById('fDashArea')?.value || '',
            setor:         document.getElementById('fDashSetor')?.value || '',
            categoria:     document.getElementById('fDashCat')?.value || '',
            status:        document.getElementById('fDashStatus')?.value || '',
            // Usa filtros de pessoa do dashboard (variáveis globais do fbar)
            responsavel:   (typeof dashRespFilter !== 'undefined') ? dashRespFilter : '',
            revisor:       (typeof dashRevFilter  !== 'undefined') ? dashRevFilter  : '',
            myTasksActive: (typeof dashMyTasksActive !== 'undefined') ? dashMyTasksActive : false,
            myTasksMode:   (typeof dashMyTasksMode   !== 'undefined') ? dashMyTasksMode   : 'all',
            // Usa filtro de data global do header
            dateType:      (typeof fbarDateMode  !== 'undefined') ? fbarDateMode  : 'all',
            month:         (typeof fbarDateMonth !== 'undefined') ? fbarDateMonth : new Date().getMonth(),
            year:          (typeof fbarDateYear  !== 'undefined') ? fbarDateYear  : new Date().getFullYear(),
        };
    }

    function applyDashboardFiltersToData(data, type, filters) {
        return data.filter(item => {
            // Filtro por Setor
            if (filters.setor) {
                if (!setorMatchesAny(item.setor, filters.setor)) return false;
            }

            // Filtro por Categoria
            if (filters.categoria && item.categoria !== filters.categoria) return false;

            // Filtro por Status
            if (filters.status && item.status !== filters.status) return false;

            // Filtro por Responsável (direto, quando não é Minhas Tarefas) — resolve IDs para nomes
            if (filters.responsavel) {
                const raw = type === 'mant'
                    ? (item.responsavelTecnico || item.responsavelManutencao || '')
                    : (item.responsavel || '');
                const _nr = typeof normalizeResponsavel === 'function' ? normalizeResponsavel(raw) : raw.toLowerCase();
                if (!_nr || !_nr.includes(filters.responsavel.toLowerCase())) return false;
            }

            // Filtro por Revisor
            if (filters.revisor) {
                const _rv = typeof normalizeResponsavel === 'function' ? normalizeResponsavel(item.revisor || '') : (item.revisor || '').toLowerCase();
                if (!_rv || !_rv.includes(filters.revisor.toLowerCase())) return false;
            }

            // Filtro "Minhas Tarefas"
            if (filters.myTasksActive && currentuser) {
                const _hasMe = (raw) => typeof _fieldHasCurrentUser === 'function'
                    ? _fieldHasCurrentUser(raw)
                    : (typeof normalizeResponsavel === 'function' && normalizeResponsavel(raw).includes((currentuser.name||'').toLowerCase().trim()));
                const rawResp = type === 'mant'
                    ? (item.responsavelTecnico || item.responsavelManutencao || '')
                    : (item.responsavel || '');
                const isResp = _hasMe(rawResp);
                const isRev  = _hasMe(item.revisor || '');
                if (filters.myTasksMode === 'responsavel' && !isResp) return false;
                if (filters.myTasksMode === 'revisor'     && !isRev)  return false;
                if (filters.myTasksMode !== 'responsavel' && filters.myTasksMode !== 'revisor' && !isResp && !isRev) return false;
            }

            // Filtro por Período (usa fbarDateMode do header)
            if (filters.dateType !== 'all') {
                const dateField = type === 'audit' ? item.dataPublicacao :
                                  type === 'ativ'  ? item.dataInicio :
                                  type === 'mant'  ? item.ultima :
                                  item.dataCriacao;
                if (!dateField) return false;
                const itemDate = new Date(dateField);

                if (filters.dateType === 'month') {
                    if (itemDate.getMonth() !== filters.month || itemDate.getFullYear() !== filters.year) return false;
                } else if (filters.dateType === 'year') {
                    if (itemDate.getFullYear() !== filters.year) return false;
                } else if (filters.dateType === 'week') {
                    const now = new Date();
                    const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay()); startOfWeek.setHours(0,0,0,0);
                    const endOfWeek   = new Date(startOfWeek); endOfWeek.setDate(startOfWeek.getDate() + 6); endOfWeek.setHours(23,59,59,999);
                    if (itemDate < startOfWeek || itemDate > endOfWeek) return false;
                }
            }

            return true;
        });
    }

    function applyCurrentTabFilters(data, tabType) {
        if (currentTab === 'dashboard') return data;
        const prefix = getFilterPrefixForTab(currentTab);
        if (!prefix || typeof passesFilters !== 'function') return data;
        // Usa passesFilters diretamente — inclui todos os filtros ativos (setor, categoria,
        // subcategoria, status, responsável, revisor, marcador, data, Minhas Tarefas, etc.)
        return data.filter(item => passesFilters(prefix, item));
    }

    function getFilterPrefixForTab(tab) {
        if (tab === 'auditoria') return 'Audit';
        if (tab === 'atividades') return 'Ativ';
        if (tab === 'manutencao') return 'Mant';
        if (tab === 'documentos') return 'Doc';
        return '';
    }

    function getFilteredNotifications(data, tabType) {
        const notifications = [];

        data.forEach(item => {
        // 1. Excluir itens finalizados — exceto recorrentes (doc com periodicidade)
            if (item.status === 'Concluído' || item.status === 'Cancelado') {
                if (!isConcludedRecurring(item, tabType)) return;
            }

            const deadlineField = getDeadlineFieldForTab(tabType, item);
            if (!deadlineField) return;

            const flagDays = item.flagDias || (tabType === 'ativ' ? 3 : 7);
            const d = daysDiff(deadlineField);

            // Somente atrasados e alertas
            if (d < 0) {
                // ATRASADO
                notifications.push({
                    id: item.id,
                    type: tabType,
                    title: item.titulo,
                    status: item.status,
                    statusColor: getStatusColor(item.status, tabType),
                    setor: item.setor,
                    categoria: item.categoria,
                    subcatOrItem: tabType === 'mant' ? item.item : item.subcategoria,
                responsavel: tabType === 'mant' ? (item.responsavelTecnico || item.responsavelManutencao || '') : (item.responsavel || ''),
                    marcador: item.marcador || '',
                    marcadorCor: item.marcadorCor || 'default',
                    dateField: deadlineField,
                    priority: 0, // 0 = atrasado (maior prioridade)
                    indicatorType: 'overdue',
                    daysInfo: `${Math.abs(d)} dia${Math.abs(d) > 1 ? 's' : ''} atrasado`
                });
            } else if (d <= flagDays) {
                // ALERTA
                notifications.push({
                    id: item.id,
                    type: tabType,
                    title: item.titulo,
                    status: item.status,
                    statusColor: getStatusColor(item.status, tabType),
                    setor: item.setor,
                    categoria: item.categoria,
                    subcatOrItem: tabType === 'mant' ? item.item : item.subcategoria,
                responsavel: tabType === 'mant' ? (item.responsavelTecnico || item.responsavelManutencao || '') : (item.responsavel || ''),
                    marcador: item.marcador || '',
                    marcadorCor: item.marcadorCor || 'default',
                    dateField: deadlineField,
                    priority: 1, // 1 = alerta
                    indicatorType: 'alert',
                    daysInfo: `${d} dia${d > 1 ? 's' : ''} para vencer`
                });
            }
        });

        return notifications;
    }

    function getDeadlineFieldForTab(tabType, item) {
        if (tabType === 'audit') return item.dataPrevisao;
        if (tabType === 'ativ') return item.dataConclusao;
        if (tabType === 'mant') return isBlankPeriodicity(item.intervalo) ? null : item.proxima;
        if (tabType === 'doc') return (item.rotina && item.rotina !== 'pontual') || item.dataProximaRevisao ? item.dataProximaRevisao : null;
        return null;
    }

    function updateNotificationCount() {
        const notifications = getNotificationsForTab();
        const badge = document.getElementById('notificationBadge');
        const count = notifications.length;

        if (count > 0) {
            badge.textContent = count;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }

        updateNewCardsBadge();
    }

    function toggleNotificationModal() {
        const modal = document.getElementById('notificationModal');
        const newCardsModal = document.getElementById('newCardsModal');
        if (newCardsModal) newCardsModal.classList.remove('active');
        modal.classList.toggle('active');

        if (modal.classList.contains('active')) {
            renderNotificationModal();
        }
    }

    function closeNotificationModal() {
        document.getElementById('notificationModal').classList.remove('active');
    }

    function renderNotificationModal() {
        const notifications = getNotificationsForTab();
        const content = document.getElementById('notificationModalContent');

        if (notifications.length === 0) {
            content.innerHTML = `
                <div class="notification-empty">
                    <i class="fas fa-bell-slash"></i>
                    <p>Nenhuma notificação</p>
                </div>
            `;
            return;
        }

        const _fmtNotifResp = (raw) => {
            if (!raw) return '';
            const _e = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            try {
                const p = JSON.parse(raw);
                if (Array.isArray(p) && p.length > 0) {
                    const name = (typeof resolveUserId === 'function' ? resolveUserId(p[0]) : null) || p[0] || '';
                    const extra = p.length - 1;
                    const badge = extra > 0 ? `<span class="card-resp-extra" style="margin-left:5px">+${extra}</span>` : '';
                    return `<span style="display:inline-flex;align-items:center">${_e(name)}${badge}</span>`;
                }
            } catch (_) {}
            return _e(String(raw));
        };

        content.innerHTML = notifications.map(notif => {
            const statusColorVar = colorMap[notif.statusColor] || colorMap['default'];
            const indicatorClass = notif.indicatorType === 'overdue' ? 'overdue' : 'alert';
            const subcatDisplay = notif.subcatOrItem ? ` (${notif.subcatOrItem})` : '';
            const marcadorColorVar = colorMap[notif.marcadorCor] || colorMap['default'];
            const marcadorHtml = notif.marcador ? `<div style="background: ${marcadorColorVar}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; width: fit-content; display: flex; align-items: center; gap: 4px;"><i class="fas fa-bookmark" style="color: white; font-size: 10px;"></i>${notif.marcador}</div>` : '';
            const respHtml = _fmtNotifResp(notif.responsavel);

            return `
                <div class="notification-item ${indicatorClass}" onclick="closeNotificationModal(); currentHistoryPage = 1; openView(${notif.id}, '${notif.type}')">
                    <div class="notification-item-header">
                        <span class="notification-item-title" title="${notif.title}">${truncateText(notif.title, 40)}</span>
                        <span class="notification-item-status" style="background-color: ${statusColorVar}">${notif.status}</span>
                    </div>
                    <div class="notification-item-details">
                        <div class="notification-item-details-row">
                            <i class="fas fa-building"></i>
                            <span>${(typeof setorText === 'function' ? setorText(notif.setor) : notif.setor) || 'ND'}</span>
                        </div>
                        <div class="notification-item-details-row">
                            <i class="fas fa-folder"></i>
                            <span>${notif.categoria || '-'} ${subcatDisplay}</span>
                        </div>
                        ${respHtml ? `
                        <div class="notification-item-details-row">
                            <i class="fas fa-user"></i>
                            ${respHtml}
                        </div>
                        ` : ''}
                        <div class="notification-item-details-row">
                            <i class="${notif.indicatorType === 'overdue' ? 'fas fa-exclamation-circle' : 'fas fa-exclamation-triangle'}"></i>
                            <span style="color: ${notif.indicatorType === 'overdue' ? 'var(--c-red)' : 'var(--c-yellow)'}; font-weight: 600;">${notif.daysInfo}</span>
                        </div>
                        ${marcadorHtml}
                    </div>
                    <div class="notification-item-actions" onclick="event.stopPropagation()">
                        <button title="Visualizar" onclick="closeNotificationModal(); currentHistoryPage = 1; openView(${notif.id}, '${notif.type}')">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button title="Editar" onclick="closeNotificationModal(); editItem(${notif.id}, '${notif.type}')">
                            <i class="fas fa-pen"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ---- Novos cards (botão carta) ----

    // Mapeamento de aba → tipo(s) de card exibidos no botão de carta
    var _tabToTypes = {
        auditoria:    ['audit'],
        atividades:   ['ativ'],
        documentos:   ['doc'],
        manutencao:   ['mant'],
        dashboard:    ['audit', 'ativ', 'doc', 'mant']
    };

    function _getNewCardsForMe() {
        if (typeof currentuser === 'undefined' || !currentuser) return [];
        const myId = String(currentuser.id || currentuser.user || '').toLowerCase();
        const myName = String(currentuser.name || currentuser.user || '').toLowerCase();

        const tab = typeof currentTab !== 'undefined' ? currentTab : 'dashboard';
        const allowedTypes = _tabToTypes[tab] || _tabToTypes['dashboard'];

        const allSources = [
            { items: typeof audits       !== 'undefined' ? audits       : [], type: 'audit' },
            { items: typeof activities   !== 'undefined' ? activities   : [], type: 'ativ'  },
            { items: typeof documents    !== 'undefined' ? documents    : [], type: 'doc'   },
            { items: typeof maintenances !== 'undefined' ? maintenances : [], type: 'mant'  }
        ];

        const sources = allSources.filter(s => allowedTypes.includes(s.type));

        const result = [];
        sources.forEach(({ items, type }) => {
            (items || []).forEach(item => {
                if (item.deleted) return;
                if (typeof _kbIsNew !== 'function' || !_kbIsNew(item)) return;
                const raw = item.responsavel;
                if (!raw) return;
                let ids = [];
                try { const p = JSON.parse(String(raw)); ids = Array.isArray(p) ? p.map(String) : [String(p)]; }
                catch { ids = [String(raw)]; }
                const isMe = ids.some(id => {
                    const resolved = typeof resolveUserId === 'function' ? (resolveUserId(id) || '').toLowerCase() : '';
                    return String(id).toLowerCase() === myId || String(id).toLowerCase() === myName || resolved === myName || resolved === myId;
                });
                if (isMe) result.push({ ...item, _type: type });
            });
        });
        return result;
    }

    function updateNewCardsBadge() {
        const badge = document.getElementById('newCardsBadge');
        if (!badge) return;
        const count = _getNewCardsForMe().length;
        if (count > 0) {
            badge.textContent = count;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    function toggleNewCardsModal() {
        const modal = document.getElementById('newCardsModal');
        if (!modal) return;
        const notifModal = document.getElementById('notificationModal');
        if (notifModal) notifModal.classList.remove('active');
        modal.classList.toggle('active');
        if (modal.classList.contains('active')) renderNewCardsModal();
    }

    function closeNewCardsModal() {
        const modal = document.getElementById('newCardsModal');
        if (modal) modal.classList.remove('active');
    }

    function renderNewCardsModal() {
        const content = document.getElementById('newCardsModalContent');
        if (!content) return;
        const cards = _getNewCardsForMe();
        if (!cards.length) {
            content.innerHTML = `<div class="notification-empty"><i class="fas fa-envelope-open"></i><p>Nenhum card novo</p></div>`;
            return;
        }
        const _e = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const typeLabel = { audit: 'Auditoria', ativ: 'Atividade', doc: 'Documento' };
        content.innerHTML = cards.map(card => {
            const age = Math.floor((Date.now() - new Date(card.createdAt).getTime()) / 86400000);
            const ageStr = age === 0 ? 'Hoje' : `${age} dia${age > 1 ? 's' : ''} atrás`;

            const deadlineField = getDeadlineFieldForTab(card._type, card);
            let prazoHtml = '';
            if (deadlineField) {
                const dt = new Date(deadlineField);
                const dd = String(dt.getDate()).padStart(2, '0');
                const mm = String(dt.getMonth() + 1).padStart(2, '0');
                const yyyy = dt.getFullYear();
                const d = daysDiff(deadlineField);
                const venceStr = d < 0
                    ? `Venceu há ${Math.abs(d)} dia${Math.abs(d) > 1 ? 's' : ''}`
                    : d === 0
                        ? 'Vence hoje'
                        : `Vence em ${d} dia${d > 1 ? 's' : ''}`;
                const venceColor = d < 0 ? 'var(--c-red)' : 'var(--c-yellow)';
                prazoHtml = `<div class="notification-item-details-row"><i class="fas fa-calendar-alt"></i><span>Prazo: ${dd}/${mm}/${yyyy} - <span style="color:${venceColor};font-weight:600">${venceStr}</span></span></div>`;
            }

            return `
                <div class="notification-item" onclick="closeNewCardsModal(); currentHistoryPage = 1; openView(${card.id}, '${card._type}')">
                    <div class="notification-item-header">
                        <span class="notification-item-title">${_e(card.titulo || 'Sem título')}</span>
                        <span class="notification-item-status" style="background:var(--c-yellow);color:#fff">${_e(typeLabel[card._type] || card._type)}</span>
                    </div>
                    <div class="notification-item-details">
                        ${card.setor ? `<div class="notification-item-details-row"><i class="fas fa-building"></i><span>${_e((typeof setorText === 'function' ? setorText(card.setor) : card.setor))}</span></div>` : ''}
                        <div class="notification-item-details-row"><i class="fas fa-clock"></i><span>${ageStr}</span></div>
                        ${prazoHtml}
                    </div>
                </div>`;
        }).join('');
    }

    window.toggleNewCardsModal = toggleNewCardsModal;
    window.closeNewCardsModal  = closeNewCardsModal;
    window.updateNewCardsBadge = updateNewCardsBadge;
