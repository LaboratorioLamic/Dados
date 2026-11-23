// === RENDERIZAÇÃO DE CARDS E DASHBOARD ===

function _clDonutHtml(done, total, pct, size, absolute) {
    size = size || 40;
    const sw = size <= 32 ? 3 : 4;
    const r = (size / 2) - sw - 1;
    const cx = size / 2;
    const circ = 2 * Math.PI * r;
    const filled = circ * (pct / 100);
    const gap = circ - filled;
    // Inicia no topo (12h): offset = -25% da circunferência
    const offset = circ * 0.25;
    // 100% = todo verde; >=50% = azul; <50% = âmbar
    const isDark     = document.body.classList.contains('dark-mode');
    const trackColor = pct === 100 ? (isDark ? '#166534' : '#86efac') : (isDark ? '#334155' : '#e5e7eb');
    const fillColor  = pct === 100 ? '#22c55e' : pct >= 50 ? '#2563eb' : '#f59e0b';
    const textColor  = isDark
        ? (pct === 100 ? '#4ade80' : pct >= 50 ? '#60a5fa' : '#fbbf24')
        : (pct === 100 ? '#15803d' : fillColor);
    const fs = size <= 32 ? 7 : 9;
    const ty = cx + fs * 0.38;
    const wrapClass = absolute ? 'card-cl-donut-abs' : 'card-cl-donut-wrap';
    return `
        <div class="${wrapClass}">
            <svg class="card-cl-donut" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
                <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${trackColor}" stroke-width="${sw}"/>
                <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${fillColor}" stroke-width="${sw}"
                    stroke-dasharray="${filled.toFixed(2)} ${gap.toFixed(2)}"
                    stroke-dashoffset="${offset.toFixed(2)}"
                    stroke-linecap="round"
                    transform="rotate(-90 ${cx} ${cx})"/>
                <text x="${cx}" y="${ty}" text-anchor="middle" font-size="${fs}" font-weight="700" fill="${textColor}">${pct}%</text>
            </svg>
            <span class="card-cl-donut-label">${done}/${total}</span>
        </div>`;
}

// Badge de Nota da Qualidade no rodapé do card (aba Rotinas/auditoria).
// Mostra a nota da ÚLTIMA publicação (grupo de conclusão mais recente) que
// possua não conformidades. Ao clicar, abre "Indicadores por Checklist Geral".
function _cardQualityBadgeHtml(item, tab) {
    if (typeof _getPubGroupsWithQuality !== 'function' || typeof _computePubGeralScores !== 'function') return '';
    let groups;
    try { groups = _getPubGroupsWithQuality(item); } catch (_) { return ''; }
    if (!groups || !groups.length) return '';
    // _getPubGroupsWithQuality retorna cronológico (antigo → recente): último = mais recente
    const last = groups[groups.length - 1];
    let scores;
    try { scores = _computePubGeralScores(item, last.pubs); } catch (_) { return ''; }
    if (!scores || !scores.total) return '';
    // Só exibe quando há não conformidade
    if (!(scores.ncCount > 0)) return '';

    const tier = (typeof _pubGeralTierPct === 'function') ? _pubGeralTierPct(scores.pctGeral) : 'good';
    const notaStr = scores.nota.toFixed(1).replace('.0', '').replace('.', ',');
    const groupKey = _fmtAttr(last.key);
    return `
        <button type="button" class="card-quality-badge card-quality-${tier}"
                onclick="event.stopPropagation(); window._openCardQualityChart(${item.id}, '${tab}', '${groupKey}')"
                title="Nota da qualidade da última publicação — ${scores.ncCount} não conformidade(s). Clique para ver os indicadores.">
            <i class="fas fa-award card-quality-icon"></i>
            <span class="card-quality-value">${notaStr}<small>/10</small></span>
            <span class="card-quality-nc"><i class="fas fa-triangle-exclamation"></i>${scores.ncCount}</span>
        </button>`;
}

// Ícone de gráfico nas ações do card/tabela (listas/grupos/setores).
// Só aparece quando o card tem dados de qualidade — igual ao kanban.
function _chartIconHtml(item, asButton) {
    const has = typeof window._pubHasChartData === 'function' && window._pubHasChartData(item);
    if (!has) return '';
    return asButton
        ? `<button onclick="openChartView(${item.id}, '${currentTab}')" title="Ver gráfico de indicadores"><i class="fas fa-chart-line"></i></button>`
        : `<i class="fas fa-chart-line" onclick="openChartView(${item.id}, '${currentTab}')" title="Ver gráfico de indicadores"></i>`;
}

// Abre a visualização do card já na aba Publicações > sub-aba Gráfico (fora do kanban).
function openChartView(itemId, tab) {
    if (typeof openView === 'function') openView(itemId, tab || currentTab);
    let tries = 0;
    const go = () => {
        const pubTab = document.querySelector('.view-modal-tab[onclick*="publicacoes"]');
        if (pubTab && typeof switchViewTab === 'function') switchViewTab('publicacoes', pubTab);
        const grafBtn = document.getElementById('pubSubtabGrafico');
        if (grafBtn && grafBtn.style.display !== 'none') {
            if (typeof switchPubSubtab === 'function') switchPubSubtab('Gráfico', grafBtn);
            return;
        }
        if (++tries < 10) setTimeout(go, 60);
    };
    setTimeout(go, 60);
}
window.openChartView = openChartView;

function _fmtAttr(s) {
    return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

// Abre o modal "Indicadores por Checklist Geral" a partir de um card,
// definindo o contexto de visualização exigido por openPubGeralChart.
window._openCardQualityChart = function(id, tab, groupKey) {
    window._currentViewId = id;
    window._currentViewTab = tab;
    if (typeof openPubGeralChart === 'function') openPubGeralChart(groupKey);
};

    // --- CONFIGURAÇÃO DE DATAS ---
    function populateYearSelects() {
        const years = [];
        for(let i = currentYear - 4; i <= currentYear + 1; i++) {
            years.push(i);
        }
        const options = years.map(y => `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`).join('');

        ['fAuditYearForMonth', 'fAuditYearOnly', 'fAtivYearForMonth', 'fAtivYearOnly', 'fMantYearForMonth', 'fMantYearOnly', 'fDocYearForMonth', 'fDocYearOnly', 'fDashYearForMonth', 'fDashYearOnly'].forEach(id => {
            const el = document.getElementById(id);
            if(el) el.innerHTML = options;
        });

        ['fAuditMonth', 'fAtivMonth', 'fMantMonth', 'fDocMonth', 'fDashMonth'].forEach(id => {
            const el = document.getElementById(id);
            if(el) el.value = currentMonth;
        });
    }

    function updateDateInputs(prefix) {
        const type = document.getElementById(`f${prefix}DateType`).value;
        document.getElementById(`f${prefix}GroupMonth`).style.display = type === 'month' ? 'flex' : 'none';
        document.getElementById(`f${prefix}YearOnly`).style.display = type === 'year' ? 'block' : 'none';
        document.getElementById(`f${prefix}GroupCustom`).style.display = type === 'custom' ? 'flex' : 'none';

        if (prefix === 'Dash') {
            renderDashboard();
        } else {
            renderCards();
        }
    }

    // --- RENDERIZAÇÃO DE CARDS E FILTROS ---
    function renderCards() {
        if(currentTab === 'backup' || currentTab === 'dashboard' || currentTab === 'configuracoes') return;
        if (typeof applyOverdueStatuses === 'function') applyOverdueStatuses();
        if (typeof KANBAN_TABS !== 'undefined' && KANBAN_TABS.includes(currentTab) &&
            typeof isKanbanActive === 'function' && isKanbanActive()) {
            if (typeof renderKanban === 'function') renderKanban();
            updateNotificationCount();
            return;
        }
        if (typeof isCalendarActive === 'function' && isCalendarActive()) {
            if (typeof renderCalendar === 'function') renderCalendar();
            return;
        }

        // Sub-aba lista: desviar para tabela ou grupos se necessário
        if (currentListSubtab === 'table') { _renderListTable(); return; }
        if (currentListSubtab === 'groups') { _renderListGroups(); return; }
        if (currentListSubtab === 'setores') { _renderListSetores(); return; }

        // Atualiza dinamicamente os filtros (selects) para mostrar apenas opções
        // que possuem ao menos 1 card possível com os filtros atuais
        const tabToFilterPrefix = (tab) => {
            if (tab === 'auditoria') return 'Audit';
            if (tab === 'atividades') return 'Ativ';
            if (tab === 'manutencao') return 'Mant';
            if (tab === 'documentos') return 'Doc';
            return '';
        };
        const currentFilterPrefix = tabToFilterPrefix(currentTab);
        if (currentFilterPrefix) updateFilterFacetOptions(currentFilterPrefix);

        const grid = document.getElementById('cardsGrid');
        grid.style.display = 'grid';
        grid.innerHTML = '';
        const _tv = document.getElementById('tableView'); if (_tv) _tv.style.display = 'none';
        const _gv = document.getElementById('groupsView'); if (_gv) _gv.style.display = 'none';

        let data = [];
        let statusList = [];
        let dateField = '';
        let getSortDate = null;     // data usada para ordenar e para filtro de data (especial em mant/doc)
        let getDeadlineDate = null; // data usada para indicador/prazo (N/A => null)
        let filterCatId = '';
        let filterSubcatId = '';

        if (currentTab === 'auditoria') {
            statusList = masterLists.auditStatus || [];
            dateField = 'dataPrevisao';
            getSortDate = (it) => it.dataPrevisao;
            getDeadlineDate = (it) => it.dataPrevisao;
            filterSetorId = 'fAuditSetor';
            filterCatId = 'fAuditCat';

            const setor = document.getElementById(filterSetorId)?.value || '';
            const cat = document.getElementById(filterCatId)?.value || '';
            const sub = '';
            const stat = document.getElementById('fAuditStatus')?.value || '';
            const marcador = document.getElementById('fAuditMarcador')?.value || '';
            const responsavel = document.getElementById('fAuditResponsavel')?.value || '';
            const revisor = document.getElementById('fAuditRevisor')?.value || '';
            const dateType = document.getElementById('fAuditDateType')?.value || 'all';

            data = audits;

            // SOFT DELETE: Filtrar itens deletados
            data = data.filter(item => !item.deleted);

            // Aplicar filtro de permissões de setores
            const allowedSetores = getAllowedSetores();
            if (allowedSetores !== null) {
                data = data.filter(item => setorMatchesAny(item.setor, allowedSetores));
            }

            data = data.filter(item => {
                if (setor && !setorMatchesAny(item.setor, setor)) return false;
                if (cat && item.categoria !== cat) return false;
                if (sub && item.subcategoria !== sub) return false;
                if (stat && item.status !== stat) return false;
                if (marcador && item.marcador !== marcador) return false;
                if (revisor) { const _rv = normalizeResponsavel(item.revisor); if (!_rv || !_rv.includes(revisor.toLowerCase())) return false; } // CORREÇÃO: Filtro Revisor

                if (responsavel) {
                    const itemResponsavel = normalizeResponsavel(item.responsavel);
                    const filterLower = responsavel.toLowerCase();
                    if (!itemResponsavel || !itemResponsavel.includes(filterLower)) return false;
                }

                if (dateType !== 'all') {
                    const itemDate = new Date(item[dateField]);
                    if (dateType === 'month') {
                        if (itemDate.getMonth() !== parseInt(document.getElementById('fAuditMonth').value) ||
                            itemDate.getFullYear() !== parseInt(document.getElementById('fAuditYearForMonth').value)) return false;
                    } else if (dateType === 'year') {
                        if (itemDate.getFullYear() !== parseInt(document.getElementById('fAuditYearOnly').value)) return false;
                    } else if (dateType === 'custom') {
                        const ini = document.getElementById('fAuditDataIni').value;
                        const fim = document.getElementById('fAuditDataFim').value;
                        if (ini && item[dateField] < ini) return false;
                        if (fim && item[dateField] > fim) return false;
                    }
                }
                if (typeof passesFbarMyTasks === 'function' && !passesFbarMyTasks(item)) return false;
                return true;
            });

        } else if (currentTab === 'atividades') {
            statusList = masterLists.ativStatus || [];
            dateField = 'dataConclusao';
            getSortDate = (it) => it.dataConclusao;
            getDeadlineDate = (it) => it.dataConclusao;
            filterSetorId = 'fAtivSetor';
            filterCatId = 'fAtivCat';

            const setor = document.getElementById(filterSetorId)?.value || '';
            const cat = document.getElementById(filterCatId)?.value || '';
            const stat = document.getElementById('fAtivStatus')?.value || '';
            const marcador = document.getElementById('fAtivMarcador')?.value || '';
            const responsavel = document.getElementById('fAtivResponsavel')?.value || '';
            const revisor = document.getElementById('fAtivRevisor')?.value || '';
            const dateType = document.getElementById('fAtivDateType')?.value || 'all';

            data = activities;

            // SOFT DELETE: Filtrar itens deletados
            data = data.filter(item => !item.deleted);

            // Aplicar filtro de permissões de setores
            const allowedSetores = getAllowedSetores();
            if (allowedSetores !== null) {
                data = data.filter(item => setorMatchesAny(item.setor, allowedSetores));
            }

            data = data.filter(item => {
                if (setor && !setorMatchesAny(item.setor, setor)) return false;
                if (cat && item.categoria !== cat) return false;
                if (stat && item.status !== stat) return false;
                if (marcador && item.marcador !== marcador) return false;
                if (revisor) { const _rv = normalizeResponsavel(item.revisor); if (!_rv || !_rv.includes(revisor.toLowerCase())) return false; }

                if (responsavel) {
                    const itemResponsavel = normalizeResponsavel(item.responsavel);
                    const filterLower = responsavel.toLowerCase();
                    if (!itemResponsavel || !itemResponsavel.includes(filterLower)) return false;
                }

                if (dateType !== 'all') {
                    const itemDate = new Date(item[dateField]);
                    if (dateType === 'month') {
                        if (itemDate.getMonth() !== parseInt(document.getElementById('fAtivMonth').value) ||
                            itemDate.getFullYear() !== parseInt(document.getElementById('fAtivYearForMonth').value)) return false;
                    } else if (dateType === 'year') {
                        if (itemDate.getFullYear() !== parseInt(document.getElementById('fAtivYearOnly').value)) return false;
                    } else if (dateType === 'custom') {
                        const ini = document.getElementById('fAtivDataIni').value;
                        const fim = document.getElementById('fAtivDataFim').value;
                        if (ini && item[dateField] < ini) return false;
                        if (fim && item[dateField] > fim) return false;
                    }
                }
                if (typeof passesFbarMyTasks === 'function' && !passesFbarMyTasks(item)) return false;
                return true;
            });

        } else if (currentTab === 'manutencao') {
            statusList = masterLists.mantStatus || [];
            dateField = 'proxima';
            // ordenar sempre pela "próxima" manutenção (mais próxima primeiro)
            getSortDate = (it) => getMaintenanceDeadlineDate(it) || ''; // Data de próxima manutenção
            getDeadlineDate = (it) => getMaintenanceDeadlineDate(it);
            filterSetorId = 'fMantSetor';
            filterCatId = 'fMantCat';
            filterSubcatId = 'fMantItem';

            const setor = document.getElementById(filterSetorId).value;
            const cat = document.getElementById(filterCatId).value;
            const itemVal = document.getElementById(filterSubcatId).value;
            const tipo = document.getElementById('fMantTipo').value;
            const stat = document.getElementById('fMantStatus').value;
            const marcador = document.getElementById('fMantMarcador')?.value || '';
            const responsavel = document.getElementById('fMantResponsavel')?.value || '';
            const dateType = document.getElementById('fMantDateType').value;

            data = maintenances;

            // SOFT DELETE: Filtrar itens deletados
            data = data.filter(item => !item.deleted);

            // Aplicar filtro de permissões de setores
            const allowedSetores = getAllowedSetores();
            if (allowedSetores !== null) {
                data = data.filter(item => setorMatchesAny(item.setor, allowedSetores));
            }

            data = data.filter(item => {
                if (setor && !setorMatchesAny(item.setor, setor)) return false;
                if (cat && item.categoria !== cat) return false;
                if (itemVal && item.item !== itemVal) return false;
                if (tipo && item.tipo !== tipo) return false;
                if (stat && item.status !== stat) return false;
                if (marcador && item.marcador !== marcador) return false;

                if (responsavel) {
                    const responsavelTec = normalizeResponsavel(item.responsavelTecnico);
                    const filterLower = responsavel.toLowerCase();
                    if (!responsavelTec.includes(filterLower)) return false;
                }

                if (dateType !== 'all') {
                    const dateForFilter = getMaintenanceCardDate(item); // Data (publicação)
                    const itemDate = new Date(dateForFilter);
                    if (dateType === 'month') {
                        if (itemDate.getMonth() !== parseInt(document.getElementById('fMantMonth').value) ||
                            itemDate.getFullYear() !== parseInt(document.getElementById('fMantYearForMonth').value)) return false;
                    } else if (dateType === 'year') {
                        if (itemDate.getFullYear() !== parseInt(document.getElementById('fMantYearOnly').value)) return false;
                    } else if (dateType === 'custom') {
                        const ini = document.getElementById('fMantDataIni').value;
                        const fim = document.getElementById('fMantDataFim').value;
                        if (ini && dateForFilter < ini) return false;
                        if (fim && dateForFilter > fim) return false;
                    }
                }
                if (typeof passesFbarMyTasks === 'function' && !passesFbarMyTasks(item)) return false;
                return true;
            });
        } else if (currentTab === 'documentos') {
            statusList = masterLists.docStatus || [];
            dateField = 'dataProximaRevisao';
            getSortDate = (it) => getDocumentCardDate(it); // Data (publicação)
            getDeadlineDate = (it) => getDocumentDeadlineDate(it);
            filterSetorId = 'fDocSetor';
            filterCatId = 'fDocCat';

            const setor = document.getElementById(filterSetorId)?.value || '';
            const cat = document.getElementById(filterCatId)?.value || '';
            const stat = document.getElementById('fDocStatus')?.value || '';
            const marcador = document.getElementById('fDocMarcador')?.value || '';
            const responsavel = document.getElementById('fDocResponsavel')?.value || '';
            const revisor = document.getElementById('fDocRevisor')?.value || '';
            const dateType = document.getElementById('fDocDateType')?.value || 'all';

            data = documents;

            // SOFT DELETE: Filtrar itens deletados
            data = data.filter(item => !item.deleted);

            // Aplicar filtro de permissões de setores
            const allowedSetores = getAllowedSetores();
            if (allowedSetores !== null) {
                data = data.filter(item => setorMatchesAny(item.setor, allowedSetores));
            }

            data = data.filter(item => {
                if (setor && !setorMatchesAny(item.setor, setor)) return false;
                if (cat && item.categoria !== cat) return false;
                if (stat && item.status !== stat) return false;
                if (marcador && item.marcador !== marcador) return false;
                if (revisor) { const _rv = normalizeResponsavel(item.revisor); if (!_rv || !_rv.includes(revisor.toLowerCase())) return false; }

                if (responsavel) {
                    const itemResponsavel = normalizeResponsavel(item.responsavel);
                    const filterLower = responsavel.toLowerCase();
                    if (!itemResponsavel || !itemResponsavel.includes(filterLower)) return false;
                }

                if (dateType !== 'all') {
                    const dateForFilter = getDocumentCardDate(item);
                    const itemDate = new Date(dateForFilter);
                    if (dateType === 'month') {
                        if (itemDate.getMonth() !== parseInt(document.getElementById('fDocMonth').value) ||
                            itemDate.getFullYear() !== parseInt(document.getElementById('fDocYearForMonth').value)) return false;
                    } else if (dateType === 'year') {
                        if (itemDate.getFullYear() !== parseInt(document.getElementById('fDocYearOnly').value)) return false;
                    } else if (dateType === 'custom') {
                        const ini = document.getElementById('fDocDataIni').value;
                        const fim = document.getElementById('fDocDataFim').value;
                        if (ini && dateForFilter < ini) return false;
                        if (fim && dateForFilter > fim) return false;
                    }
                }
                if (typeof passesFbarMyTasks === 'function' && !passesFbarMyTasks(item)) return false;
                return true;
            });
        }

        // Busca por Título (lupa) - só quando o campo estiver ativo
        if (titleSearchCardsEnabled && titleSearchCardsQuery) {
            data = data.filter(item => normalizeText(item.titulo || '').includes(titleSearchCardsQuery));
        }

        // Filtro de finalizados (Concluído e Cancelado)
        const showFinalized = document.getElementById('showFinalizedCheckbox')?.checked !== false;
        if (!showFinalized) {
            data = data.filter(item => {
                const statusNormalized = normalizeStatusName(item.status || '');
                return statusNormalized !== 'concluído' && statusNormalized !== 'cancelado';
            });
        }

        // ORDENAÇÃO
        if (dateField) {
            data.sort((a, b) => {
                // 1) Concluído/Cancelado vão para o final — exceto recorrentes com prazo iminente
                const isAClosed = (typeof _kbStatusIsFinal === 'function' ? _kbStatusIsFinal(a.status) : (a.status === 'Concluído' || a.status === 'Cancelado')) && !isConcludedRecurring(a, currentTab);
                const isBClosed = (typeof _kbStatusIsFinal === 'function' ? _kbStatusIsFinal(b.status) : (b.status === 'Concluído' || b.status === 'Cancelado')) && !isConcludedRecurring(b, currentTab);

                if (isAClosed !== isBClosed) {
                    return isAClosed ? 1 : -1;
                }

                // 2) Entre itens "abertos" (e recorrentes), os que estão no prazo de alerta vêm primeiro
                if (!isAClosed && !isBClosed) {
                    const flagA = (a.flagDias === 0 || a.flagDias === '0') ? 0 : (a.flagDias || 7);
                    const flagB = (b.flagDias === 0 || b.flagDias === '0') ? 0 : (b.flagDias || 7);
                    const dA = daysDiff(getDeadlineDate ? getDeadlineDate(a) : a[dateField]);
                    const dB = daysDiff(getDeadlineDate ? getDeadlineDate(b) : b[dateField]);
                    const isAAlert = flagA > 0 && dA <= flagA;
                    const isBAlert = flagB > 0 && dB <= flagB;

                    if (isAAlert !== isBAlert) {
                        return isAAlert ? -1 : 1;
                    }
                }

                // 2.5) Entre itens "abertos" sem alerta, os com data válida vêm antes dos com "ND"
                const sortA = getSortDate ? (getSortDate(a) || '') : (a[dateField] || '');
                const sortB = getSortDate ? (getSortDate(b) || '') : (b[dateField] || '');
                const dateA = new Date(sortA);
                const dateB = new Date(sortB);
                const isAInvalid = isNaN(dateA.getTime());
                const isBInvalid = isNaN(dateB.getTime());

                if (isAInvalid !== isBInvalid) {
                    return isAInvalid ? 1 : -1;  // Datas inválidas ("ND") por último
                }

                // 3) Dentro do mesmo grupo, ordena por data (mais antiga primeiro)
                return dateA - dateB;
            });
        }

        if (typeof currentTab !== 'undefined' && currentTab === 'reunioes') { grid.innerHTML = ''; return; }
        if(data.length === 0) {
            grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:#9ca3af"><i class="fas fa-search fa-2x"></i><p>Nenhum registro encontrado.</p></div>';
            return;
        }

        data.forEach(item => {
        const canEdit = userCanEditCards(item);
        const canDelete = userCanDeleteCards(item);
            try {
            const div = document.createElement('div');
            const flagDays = (item.flagDias === 0 || item.flagDias === '0') ? 0 : (item.flagDias || 7);
            let targetDate = (getDeadlineDate ? getDeadlineDate(item) : null);
            const fullTitle = item.titulo || '';
            const displayTitle = truncateText(fullTitle, 55);

            const d = daysDiff(targetDate);

            let indicatorClass = 'ind-green';
            // Concluído recorrente (doc com periodicidade) continua monitorando prazo
            const _skipFlag = (typeof _kbStatusIsConcluido === 'function' ? _kbStatusIsConcluido(item.status) : item.status === 'Concluído') && !isConcludedRecurring(item, currentTab);
            if (!_skipFlag && d !== Infinity) {
                if (d < 0) indicatorClass = 'ind-red';
                else if (flagDays > 0 && d <= flagDays) indicatorClass = 'ind-yellow';
            }

            const statusObj = statusList.find(s => s.name === item.status) || { color: 'default' };
            const statusColorVar = colorMap[statusObj.color] || colorMap['default'];

            // Marcador do card
            const marcadorText = item.marcador || '';
            const marcadorColorVar = colorMap[item.marcadorCor] || colorMap['default'];

            // layout interativo original dos cards
            div.className = `card ${indicatorClass}`;
            div.onclick = () => {
                currentHistoryPage = 1; // Reseta a página ao abrir a visualização
                openView(item.id, currentTab);
            };

            let specificContent = '';

                // Formata responsável para exibição no card (primeiro nome + badge "+N" se houver mais)
                const _fmtEsc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
                const formatResponsavel = (responsavel) => {
                    if (!responsavel) return { name: '', badge: '' };
                    try {
                        const p = JSON.parse(responsavel);
                        if (Array.isArray(p) && p.length > 0) {
                            const name = (typeof resolveUserId === 'function' ? resolveUserId(p[0]) : null) || String(p[0]);
                            const extra = p.length - 1;
                            return {
                                name: _fmtEsc(name),
                                badge: extra > 0 ? `<span class="card-resp-extra">+${extra}</span>` : ''
                            };
                        }
                    } catch (_) {}
                    return { name: _fmtEsc(String(responsavel)), badge: '' };
                };
                const _respRow = (raw) => {
                    const { name, badge } = formatResponsavel(raw);
                    if (!name) return '';
                    return `<div class="card-info-row"><i class="fas fa-user"></i><span class="card-resp-wrap"><span class="card-resp-name">${name}</span>${badge}</span></div>`;
                };

            if (currentTab === 'auditoria') {
                specificContent = `
                    ${setorCardRow(item.setor)}
                    <div class="card-info-row"><i class="far fa-folder"></i> <span>${item.categoria || '-'}</span></div>
                    ${_respRow(item.responsavel)}
                    <div class="card-info-row"><i class="far fa-calendar"></i> <span>Pub: <strong>${formatBR(item.dataPublicacao)}</strong></span></div>
                    <div class="card-info-row"><i class="far fa-calendar-check"></i> <span>Prev: <strong>${formatBR(item.dataPrevisao)}</strong></span></div>
                `;
            } else if (currentTab === 'atividades') {
                specificContent = `
                    ${setorCardRow(item.setor)}
                    <div class="card-info-row"><i class="far fa-folder"></i> <span>${item.categoria || '-'}</span></div>
                    ${_respRow(item.responsavel)}
                    <div class="card-info-row"><i class="far fa-calendar"></i> <span>Inicio: <strong>${formatBR(item.dataInicio)}</strong></span></div>
                    <div class="card-info-row"><i class="far fa-calendar-check"></i> <span>Fim: <strong>${formatBR(item.dataConclusao)}</strong></span></div>
                `;
            } else if (currentTab === 'manutencao') {
                const isNA = isBlankPeriodicity(item.intervalo);
                specificContent = `
                    ${setorCardRow(item.setor)}
                    <div class="card-info-row"><i class="far fa-folder"></i> <span>${item.categoria || '-'}</span></div>
                    <div class="card-info-row"><i class="fas fa-tag"></i> <span>${item.tipo || 'ND'}</span></div>
                    ${_respRow(item.responsavelTecnico)}
                    <div class="card-info-row"><i class="far fa-calendar-check"></i> <span>Próx: <strong>${isNA ? 'N/A' : formatBR(item.proxima)}</strong></span></div>
                `;
            } else { // Documentos
                const isPontualDoc = !item.rotina || item.rotina === 'pontual';
                specificContent = `
                    ${setorCardRow(item.setor)}
                    <div class="card-info-row"><i class="far fa-folder"></i> <span>${item.categoria || '-'}</span></div>
                    ${_respRow(item.responsavel)}
                    <div class="card-info-row"><i class="far fa-calendar-check"></i> <span>Próx: <strong>${isPontualDoc && !item.dataProximaRevisao ? 'N/A' : formatBR(item.dataProximaRevisao)}</strong></span></div>
                `;
            }

            // Garante que specificContent seja sempre uma string válida
            if (!specificContent || typeof specificContent !== 'string') {
                specificContent = '';
            }

            const editIconHtml = canEdit
                ? `<i class="fas fa-pen" onclick="editItem(${item.id}, '${currentTab}')" title="Editar"></i>`
                : '';

            const deleteIconHtml = canDelete
                ? `<i class="fas fa-trash" onclick="deleteItem(${item.id}, '${currentTab}')" title="Excluir"></i>`
                : '';

            const checklist = item.checklist || [];
            const clTotal = checklist.length;
            const clDone = checklist.filter(c => c.checked).length;
            const clPct = clTotal > 0 ? Math.round((clDone / clTotal) * 100) : 0;
            const _noChecklist = currentTab === 'documentos';
            const donutHtml = (!_noChecklist && clTotal > 0) ? _clDonutHtml(clDone, clTotal, clPct, 40, true) : '';
            // Nota da qualidade só aparece com o checklist 100% concluído.
            const qualityBadgeHtml = (currentTab === 'auditoria' && clTotal > 0 && clPct === 100)
                ? _cardQualityBadgeHtml(item, currentTab) : '';

            div.innerHTML = `
                <div class="card-header">
                    <span class="tag" style="background-color:${statusColorVar}">${item.status || 'Novo'}</span>
                    <div class="card-actions" onclick="event.stopPropagation()">
                        ${_chartIconHtml(item)}
                        ${editIconHtml}
                        ${deleteIconHtml}
                    </div>
                </div>
                <div class="card-title">
                    <h4 title="${fullTitle}">${displayTitle}</h4>
                </div>
                <div class="card-body">
                    ${specificContent}
                </div>
                ${(marcadorText || qualityBadgeHtml) ? `<div class="card-footer">
                    ${marcadorText ? `<span class="card-marker" style="background:${marcadorColorVar}"><i class="fas fa-bookmark"></i> ${marcadorText}</span>` : ''}
                    ${qualityBadgeHtml}
                </div>` : ''}
                ${donutHtml}
            `;
            grid.appendChild(div);
            } catch (error) {
                console.error('Erro ao renderizar card:', error, item);
                // Cria um card de fallback mesmo que ocorra erro
                const fallbackDiv = document.createElement('div');
                fallbackDiv.className = 'card ind-green';
                fallbackDiv.innerHTML = `
                    <div class="card-header">
                        <span class="tag" style="background-color:#6b7280">Erro</span>
                    </div>
                    <div class="card-title">
                        <h4>Erro ao exibir item</h4>
                    </div>
                    <div class="card-body">
                        <div class="card-info-row"><i class="fas fa-exclamation-triangle"></i> <span>Item ID: ${item.id}</span></div>
                    </div>
                `;
                grid.appendChild(fallbackDiv);
            }
        });

        // Atualiza contador de notificações após renderizar cards
        updateNotificationCount();
    }

    // ── SUB-ABAS DA LISTA ──────────────────────────────────────────────────

    function setListSubtab(mode) {
        currentListSubtab = mode;
        document.querySelectorAll('.list-subtab').forEach(b => b.classList.remove('active'));
        const btn = document.getElementById('listSubtab' + mode.charAt(0).toUpperCase() + mode.slice(1));
        if (btn) btn.classList.add('active');
        renderCards();
    }

    // Retorna os dados filtrados da aba atual (reutiliza a lógica de renderCards)
    function _getFilteredData() {
        let data = [];
        let statusList = [];
        let getDeadlineDate = null;

        if (currentTab === 'auditoria') {
            statusList = masterLists.auditStatus || [];
            getDeadlineDate = it => it.dataPrevisao;
            const setor = document.getElementById('fAuditSetor')?.value || '';
            const cat = document.getElementById('fAuditCat')?.value || '';
            const stat = document.getElementById('fAuditStatus')?.value || '';
            const marcador = document.getElementById('fAuditMarcador')?.value || '';
            const responsavel = document.getElementById('fAuditResponsavel')?.value || '';
            const revisor = document.getElementById('fAuditRevisor')?.value || '';
            const dateType = document.getElementById('fAuditDateType')?.value || 'all';
            data = audits.filter(item => {
                if (item.deleted) return false;
                const allowedSetores = getAllowedSetores();
                if (allowedSetores !== null && !setorMatchesAny(item.setor, allowedSetores)) return false;
                if (setor && !setorMatchesAny(item.setor, setor)) return false;
                if (cat && item.categoria !== cat) return false;
                if (stat && item.status !== stat) return false;
                if (marcador && item.marcador !== marcador) return false;
                if (revisor) { const _rv = normalizeResponsavel(item.revisor); if (!_rv || !_rv.includes(revisor.toLowerCase())) return false; }
                if (responsavel) { const r = normalizeResponsavel(item.responsavel); if (!r || !r.includes(responsavel.toLowerCase())) return false; }
                if (typeof passesFbarMyTasks === 'function' && !passesFbarMyTasks(item)) return false;
                return true;
            });
        } else if (currentTab === 'atividades') {
            statusList = masterLists.ativStatus || [];
            getDeadlineDate = it => it.dataConclusao;
            const setor = document.getElementById('fAtivSetor')?.value || '';
            const cat = document.getElementById('fAtivCat')?.value || '';
            const stat = document.getElementById('fAtivStatus')?.value || '';
            const responsavel = document.getElementById('fAtivResponsavel')?.value || '';
            const revisor = document.getElementById('fAtivRevisor')?.value || '';
            data = activities.filter(item => {
                if (item.deleted) return false;
                const allowedSetores = getAllowedSetores();
                if (allowedSetores !== null && !setorMatchesAny(item.setor, allowedSetores)) return false;
                if (setor && !setorMatchesAny(item.setor, setor)) return false;
                if (cat && item.categoria !== cat) return false;
                if (stat && item.status !== stat) return false;
                if (revisor) { const _rv = normalizeResponsavel(item.revisor); if (!_rv || !_rv.includes(revisor.toLowerCase())) return false; }
                if (responsavel) { const r = normalizeResponsavel(item.responsavel); if (!r || !r.includes(responsavel.toLowerCase())) return false; }
                if (typeof passesFbarMyTasks === 'function' && !passesFbarMyTasks(item)) return false;
                return true;
            });
        } else if (currentTab === 'documentos') {
            statusList = masterLists.docStatus || [];
            getDeadlineDate = it => it.dataProximaRevisao;
            const setor = document.getElementById('fDocSetor')?.value || '';
            const cat = document.getElementById('fDocCat')?.value || '';
            const stat = document.getElementById('fDocStatus')?.value || '';
            const responsavel = document.getElementById('fDocResponsavel')?.value || '';
            data = documents.filter(item => {
                if (item.deleted) return false;
                const allowedSetores = getAllowedSetores();
                if (allowedSetores !== null && !setorMatchesAny(item.setor, allowedSetores)) return false;
                if (setor && !setorMatchesAny(item.setor, setor)) return false;
                if (cat && item.categoria !== cat) return false;
                if (stat && item.status !== stat) return false;
                if (responsavel) { const r = normalizeResponsavel(item.responsavel); if (!r || !r.includes(responsavel.toLowerCase())) return false; }
                if (typeof passesFbarMyTasks === 'function' && !passesFbarMyTasks(item)) return false;
                return true;
            });
        } else if (currentTab === 'manutencao') {
            statusList = masterLists.mantStatus || [];
            getDeadlineDate = it => getMaintenanceDeadlineDate(it);
            const setor = document.getElementById('fMantSetor')?.value || '';
            const cat = document.getElementById('fMantCat')?.value || '';
            const stat = document.getElementById('fMantStatus')?.value || '';
            data = maintenances.filter(item => {
                if (item.deleted) return false;
                const allowedSetores = getAllowedSetores();
                if (allowedSetores !== null && !setorMatchesAny(item.setor, allowedSetores)) return false;
                if (setor && !setorMatchesAny(item.setor, setor)) return false;
                if (cat && item.categoria !== cat) return false;
                if (stat && item.status !== stat) return false;
                if (typeof passesFbarMyTasks === 'function' && !passesFbarMyTasks(item)) return false;
                return true;
            });
        }

        // Filtro de busca por título
        if (titleSearchCardsEnabled && titleSearchCardsQuery) {
            data = data.filter(item => normalizeText(item.titulo || '').includes(titleSearchCardsQuery));
        }
        // Filtro finalizados
        const showFinalized = document.getElementById('showFinalizedCheckbox')?.checked !== false;
        if (!showFinalized) {
            data = data.filter(item => {
                const s = normalizeStatusName(item.status || '');
                return s !== 'concluído' && s !== 'cancelado';
            });
        }

        return { data, statusList, getDeadlineDate };
    }

    function _getItemIndicatorClass(item, getDeadlineDate) {
        const d = daysDiff(getDeadlineDate ? getDeadlineDate(item) : null);
        const flagDays = (item.flagDias === 0 || item.flagDias === '0') ? 0 : (item.flagDias || 7);
        const _skipFlag = (typeof _kbStatusIsConcluido === 'function' ? _kbStatusIsConcluido(item.status) : item.status === 'Concluído') && !isConcludedRecurring(item, currentTab);
        if (_skipFlag || d === Infinity) return 'green';
        if (d < 0) return 'red';
        if (flagDays > 0 && d <= flagDays) return 'yellow';
        return 'green';
    }

    function _getDateDisplay(item) {
        if (currentTab === 'auditoria') return formatBR(item.dataPrevisao);
        if (currentTab === 'atividades') return formatBR(item.dataConclusao);
        if (currentTab === 'manutencao') {
            const isNA = isBlankPeriodicity(item.intervalo);
            return isNA ? 'N/A' : formatBR(item.proxima);
        }
        if (currentTab === 'documentos') {
            const isPontual = !item.rotina || item.rotina === 'pontual';
            return isPontual && !item.dataProximaRevisao ? 'N/A' : formatBR(item.dataProximaRevisao);
        }
        return '';
    }

    // Estado de ordenação da tabela: { col: string, dir: 'asc'|'desc' }
    var _tableSort = { col: null, dir: 'asc' };

    // Seta a coluna de ordenação padrão por módulo (coluna de data de conclusão/previsão)
    function _tableDefaultSortCol() {
        if (currentTab === 'auditoria')    return 'dataPrevisao';
        if (currentTab === 'atividades')   return 'dataConclusao';
        if (currentTab === 'manutencao')   return 'proxima';
        if (currentTab === 'documentos')   return 'dataProximaRevisao';
        return null;
    }

    // Retorna o valor de uma coluna de um item para fins de ordenação
    function _tableSortValue(item, col) {
        switch (col) {
            case 'titulo':       return (item.titulo || '').toLowerCase();
            case 'status':       return (item.status || '').toLowerCase();
            case 'setor':        return ((typeof setorText === 'function' ? setorText(item.setor) : item.setor) || '').toLowerCase();
            case 'categoria':    return (item.categoria || '').toLowerCase();
            case 'responsavel':  return (item.responsavel || '').toLowerCase();
            case 'revisor':      return (item.revisor || '').toLowerCase();
            case 'tipo':         return (item.tipo || '').toLowerCase();
            case 'dataPublicacao':       return item.dataPublicacao || '';
            case 'dataPrevisao':         return item.dataPrevisao || '';
            case 'dataInicio':           return item.dataInicio || '';
            case 'dataConclusao':        return item.dataConclusao || '';
            case 'proxima': {
                const isNA = isBlankPeriodicity(item.intervalo);
                return isNA ? '' : (item.proxima || '');
            }
            case 'dataProximaRevisao': {
                const isPontual = !item.rotina || item.rotina === 'pontual';
                return (isPontual && !item.dataProximaRevisao) ? '' : (item.dataProximaRevisao || '');
            }
            case 'dataCriacao':          return item.dataCriacao || '';
            default: return '';
        }
    }

    function _tableSortData(data, col, dir) {
        if (!col) return data;
        const isDate = col.startsWith('data') || col === 'proxima';
        return data.slice().sort((a, b) => {
            const va = _tableSortValue(a, col);
            const vb = _tableSortValue(b, col);
            // ND (string vazia) sempre por último, independente de direção
            const aEmpty = va === '';
            const bEmpty = vb === '';
            if (aEmpty && bEmpty) return 0;
            if (aEmpty) return 1;
            if (bEmpty) return -1;
            let cmp;
            if (isDate) {
                cmp = new Date(va) - new Date(vb);
            } else {
                cmp = va < vb ? -1 : va > vb ? 1 : 0;
            }
            return dir === 'desc' ? -cmp : cmp;
        });
    }

    window._tableClickSort = function(col) {
        if (_tableSort.col === col) {
            _tableSort.dir = _tableSort.dir === 'asc' ? 'desc' : 'asc';
        } else {
            _tableSort.col = col;
            _tableSort.dir = 'asc';
        }
        _renderListTable();
    };

    function _renderListTable() {
        const grid = document.getElementById('cardsGrid');
        if (grid) grid.style.display = 'none';
        const gv = document.getElementById('groupsView');
        if (gv) gv.style.display = 'none';

        const tv = document.getElementById('tableView');
        if (!tv) return;
        tv.style.display = 'block';

        // Aplica ordenação padrão se ainda não definida para este módulo
        if (!_tableSort.col) {
            _tableSort.col = _tableDefaultSortCol();
            _tableSort.dir = 'asc';
        }

        const { data: rawData, statusList, getDeadlineDate } = _getFilteredData();
        const data = _tableSortData(rawData, _tableSort.col, _tableSort.dir);

        if (data.length === 0) {
            tv.innerHTML = '<div style="text-align:center;padding:40px;color:#9ca3af"><i class="fas fa-search fa-2x"></i><p>Nenhum registro encontrado.</p></div>';
            updateNotificationCount();
            return;
        }

        // Monta cabeçalhos clicáveis
        function _th(label, col) {
            const active = _tableSort.col === col;
            const icon = active
                ? (_tableSort.dir === 'asc' ? '<i class="fas fa-sort-up lt-sort-icon active"></i>' : '<i class="fas fa-sort-down lt-sort-icon active"></i>')
                : '<i class="fas fa-sort lt-sort-icon"></i>';
            return `<th class="lt-sortable${active?' lt-sort-active':''}" onclick="_tableClickSort('${col}')">${label}${icon}</th>`;
        }

        let colHeaders = '';
        if (currentTab === 'auditoria') {
            colHeaders = _th('Setor','setor')+_th('Categoria','categoria')+_th('Responsável','responsavel')+_th('Pub.','dataPublicacao')+_th('Previsão','dataPrevisao');
        } else if (currentTab === 'atividades') {
            colHeaders = _th('Setor','setor')+_th('Categoria','categoria')+_th('Responsável','responsavel')+_th('Início','dataInicio')+_th('Conclusão','dataConclusao');
        } else if (currentTab === 'manutencao') {
            colHeaders = _th('Setor','setor')+_th('Categoria','categoria')+_th('Tipo','tipo')+_th('Resp. Técnico','responsavel')+_th('Próxima','proxima');
        } else if (currentTab === 'documentos') {
            colHeaders = _th('Setor','setor')+_th('Categoria','categoria')+_th('Responsável','responsavel')+_th('Criação','dataCriacao')+_th('Próx. Revisão','dataProximaRevisao');
        }

        const _fmtRespTd = (raw) => {
            if (!raw) return '-';
            const _e = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            try {
                const p = JSON.parse(raw);
                if (Array.isArray(p) && p.length > 0) {
                    const name = (typeof resolveUserId === 'function' ? resolveUserId(p[0]) : null) || p[0] || '-';
                    const extra = p.length - 1;
                    const badge = extra > 0 ? `<span class="card-resp-extra" style="margin-left:5px">+${extra}</span>` : '';
                    return `<span style="display:inline-flex;align-items:center;gap:0">${_e(name)}${badge}</span>`;
                }
            } catch (_) {}
            return _e(String(raw));
        };

        const _fmtSetorTd = (raw) => {
            const { first, extra } = (typeof setorDisplay === 'function') ? setorDisplay(raw) : { first: raw || '', extra: 0 };
            if (!first) return 'ND';
            const _e = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            const badge = extra > 0 ? `<span class="card-resp-extra" style="margin-left:5px">+${extra}</span>` : '';
            return `<span style="display:inline-flex;align-items:center;gap:0">${_e(first)}${badge}</span>`;
        };

        let rows = '';
        const indColors = { green: 'lt-ind-green', yellow: 'lt-ind-yellow', red: 'lt-ind-red' };
        data.forEach(item => {
            const canEdit = userCanEditCards(item);
            const canDelete = userCanDeleteCards(item);
            const statusObj = statusList.find(s => s.name === item.status) || { color: 'default' };
            const statusColorVar = colorMap[statusObj.color] || colorMap['default'];
            const ind = _getItemIndicatorClass(item, getDeadlineDate);

            let specificCols = '';
            if (currentTab === 'auditoria') {
                specificCols = `<td>${_fmtSetorTd(item.setor)}</td><td>${item.categoria||'-'}</td><td>${_fmtRespTd(item.responsavel)}</td><td>${formatBR(item.dataPublicacao)}</td><td>${formatBR(item.dataPrevisao)}</td>`;
            } else if (currentTab === 'atividades') {
                specificCols = `<td>${_fmtSetorTd(item.setor)}</td><td>${item.categoria||'-'}</td><td>${_fmtRespTd(item.responsavel)}</td><td>${formatBR(item.dataInicio)}</td><td>${formatBR(item.dataConclusao)}</td>`;
            } else if (currentTab === 'manutencao') {
                const isNA = isBlankPeriodicity(item.intervalo);
                specificCols = `<td>${_fmtSetorTd(item.setor)}</td><td>${item.categoria||'-'}</td><td>${item.tipo||'-'}</td><td>${_fmtRespTd(item.responsavelTecnico)}</td><td>${isNA?'N/A':formatBR(item.proxima)}</td>`;
            } else if (currentTab === 'documentos') {
                const isPontual = !item.rotina || item.rotina === 'pontual';
                specificCols = `<td>${_fmtSetorTd(item.setor)}</td><td>${item.categoria||'-'}</td><td>${_fmtRespTd(item.responsavel)}</td><td>${formatBR(item.dataCriacao)}</td><td>${isPontual&&!item.dataProximaRevisao?'N/A':formatBR(item.dataProximaRevisao)}</td>`;
            }

            rows += `<tr onclick="openView(${item.id},'${currentTab}')">
                <td><span class="lt-ind ${indColors[ind]||'lt-ind-green'}"></span>${(item.titulo||'').replace(/</g,'&lt;').substring(0,60)}</td>
                <td><span class="lt-status" style="background:${statusColorVar}">${item.status||'Novo'}</span></td>
                ${specificCols}
                <td><div class="lt-actions" onclick="event.stopPropagation()">
                    ${_chartIconHtml(item, true)}
                    ${canEdit ? `<button onclick="editItem(${item.id},'${currentTab}')" title="Editar"><i class="fas fa-pen"></i></button>` : ''}
                    ${canDelete ? `<button onclick="deleteItem(${item.id},'${currentTab}')" title="Excluir"><i class="fas fa-trash"></i></button>` : ''}
                </div></td>
            </tr>`;
        });

        tv.innerHTML = `<table class="list-table">
            <thead><tr>${_th('Título','titulo')}${_th('Status','status')}${colHeaders}<th></th></tr></thead>
            <tbody>${rows}</tbody>
        </table>`;
        updateNotificationCount();
    }

    function _renderListGroups() {
        const grid = document.getElementById('cardsGrid');
        if (grid) grid.style.display = 'none';
        const tv = document.getElementById('tableView');
        if (tv) tv.style.display = 'none';
        const sv = document.getElementById('setoresView');
        if (sv) sv.style.display = 'none';

        const gv = document.getElementById('groupsView');
        if (!gv) return;
        gv.style.display = 'flex';

        const { data, statusList, getDeadlineDate } = _getFilteredData();

        if (data.length === 0) {
            gv.innerHTML = '<div style="text-align:center;padding:40px;color:#9ca3af"><i class="fas fa-search fa-2x"></i><p>Nenhum registro encontrado.</p></div>';
            updateNotificationCount();
            return;
        }

        // Agrupa por categoria
        const groups = {};
        data.forEach(item => {
            const cat = item.categoria || 'Sem Categoria';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(item);
        });

        let html = '';
        Object.keys(groups).sort().forEach(cat => {
            const items = groups[cat];
            const folderId = 'gf_' + cat.replace(/\W/g,'_');
            let cardsHtml = '';
            items.forEach(item => {
                const canEdit = userCanEditCards(item);
                const canDelete = userCanDeleteCards(item);
                const statusObj = statusList.find(s => s.name === item.status) || { color: 'default' };
                const statusColorVar = colorMap[statusObj.color] || colorMap['default'];
                const ind = _getItemIndicatorClass(item, getDeadlineDate);
                const indClass = ind === 'red' ? 'ind-red' : ind === 'yellow' ? 'ind-yellow' : 'ind-green';
                const fullTitle = item.titulo || '';
                const displayTitle = truncateText(fullTitle, 55);
                const marcadorText = item.marcador || '';
                const marcadorColorVar = colorMap[item.marcadorCor] || colorMap['default'];

                const checklist = item.checklist || [];
                const clTotal = checklist.length;
                const clDone = checklist.filter(c => c.checked).length;
                const clPct = clTotal > 0 ? Math.round((clDone / clTotal) * 100) : 0;
                const donutHtml = clTotal > 0 ? _clDonutHtml(clDone, clTotal, clPct, 40, true) : '';
                const qualityBadgeHtml = (currentTab === 'auditoria' && clTotal > 0 && clPct === 100)
                    ? _cardQualityBadgeHtml(item, currentTab) : '';

                let specificContent = '';
                const _fmtEsc2 = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
                const _respRow2 = (raw) => {
                    if (!raw) return '';
                    try {
                        const p = JSON.parse(raw);
                        if (Array.isArray(p) && p.length > 0) {
                            const name = (typeof resolveUserId === 'function' ? resolveUserId(p[0]) : null) || p[0] || '';
                            const extra = p.length - 1;
                            const badge = extra > 0 ? `<span class="card-resp-extra">+${extra}</span>` : '';
                            return `<div class="card-info-row"><i class="fas fa-user"></i><span class="card-resp-wrap"><span class="card-resp-name">${_fmtEsc2(name)}</span>${badge}</span></div>`;
                        }
                    } catch (_) {}
                    return `<div class="card-info-row"><i class="fas fa-user"></i><span class="card-resp-wrap"><span class="card-resp-name">${_fmtEsc2(String(raw))}</span></span></div>`;
                };
                if (currentTab === 'auditoria') {
                    specificContent = `${setorCardRow(item.setor)}
                        ${_respRow2(item.responsavel)}
                        <div class="card-info-row"><i class="far fa-calendar-check"></i> <span>Prev: <strong>${formatBR(item.dataPrevisao)}</strong></span></div>`;
                } else if (currentTab === 'atividades') {
                    specificContent = `${setorCardRow(item.setor)}
                        ${_respRow2(item.responsavel)}
                        <div class="card-info-row"><i class="far fa-calendar-check"></i> <span>Fim: <strong>${formatBR(item.dataConclusao)}</strong></span></div>`;
                } else if (currentTab === 'manutencao') {
                    const isNA = isBlankPeriodicity(item.intervalo);
                    specificContent = `${setorCardRow(item.setor)}
                        <div class="card-info-row"><i class="fas fa-tag"></i> <span>${item.tipo||'ND'}</span></div>
                        <div class="card-info-row"><i class="far fa-calendar-check"></i> <span>Próx: <strong>${isNA?'N/A':formatBR(item.proxima)}</strong></span></div>`;
                } else {
                    const isPontual = !item.rotina || item.rotina === 'pontual';
                    specificContent = `${setorCardRow(item.setor)}
                        ${_respRow2(item.responsavel)}
                        <div class="card-info-row"><i class="far fa-calendar-check"></i> <span>Próx: <strong>${isPontual&&!item.dataProximaRevisao?'N/A':formatBR(item.dataProximaRevisao)}</strong></span></div>`;
                }

                cardsHtml += `<div class="card ${indClass}" onclick="openView(${item.id},'${currentTab}')">
                    <div class="card-header">
                        <span class="tag" style="background-color:${statusColorVar}">${item.status||'Novo'}</span>
                        <div class="card-actions" onclick="event.stopPropagation()">
                            ${_chartIconHtml(item)}
                            ${canEdit?`<i class="fas fa-pen" onclick="editItem(${item.id},'${currentTab}')" title="Editar"></i>`:''}
                            ${canDelete?`<i class="fas fa-trash" onclick="deleteItem(${item.id},'${currentTab}')" title="Excluir"></i>`:''}
                        </div>
                    </div>
                    <div class="card-title"><h4 title="${fullTitle}">${displayTitle}</h4></div>
                    <div class="card-body">${specificContent}</div>
                    ${(marcadorText || qualityBadgeHtml) ? `<div class="card-footer">
                        ${marcadorText ? `<span class="card-marker" style="background:${marcadorColorVar}"><i class="fas fa-bookmark"></i> ${marcadorText}</span>` : ''}
                        ${qualityBadgeHtml}
                    </div>` : ''}
                    ${donutHtml}
                </div>`;
            });

            const _gfKey = `gf_collapsed_${currentTab}_${folderId}`;
            const _gfCollapsed = localStorage.getItem(_gfKey) === '1';
            html += `<div class="groups-folder${_gfCollapsed ? '' : ' open'}" id="${folderId}">
                <div class="groups-folder-header" onclick="(function(el){el.classList.toggle('open');localStorage.setItem('gf_collapsed_${currentTab}_${folderId}',el.classList.contains('open')?'0':'1');})(document.getElementById('${folderId}'))">
                    <i class="fas fa-chevron-right groups-folder-icon"></i>
                    <span class="groups-folder-name"><i class="fas fa-folder" style="margin-right:6px;color:#f59e0b;"></i>${cat}</span>
                    <span class="groups-folder-count">${items.length}</span>
                </div>
                <div class="groups-folder-body">${cardsHtml}</div>
            </div>`;
        });

        gv.innerHTML = html;
        updateNotificationCount();
    }

    function _renderListSetores() {
        const grid = document.getElementById('cardsGrid');
        if (grid) grid.style.display = 'none';
        const tv = document.getElementById('tableView');
        if (tv) tv.style.display = 'none';
        const gv = document.getElementById('groupsView');
        if (gv) gv.style.display = 'none';

        const sv = document.getElementById('setoresView');
        if (!sv) return;
        sv.style.display = 'flex';

        const { data, statusList, getDeadlineDate } = _getFilteredData();

        if (data.length === 0) {
            sv.innerHTML = '<div style="text-align:center;padding:40px;color:#9ca3af"><i class="fas fa-search fa-2x"></i><p>Nenhum registro encontrado.</p></div>';
            updateNotificationCount();
            return;
        }

        // Agrupa por setor (um item com múltiplos setores aparece em cada grupo)
        const groups = {};
        data.forEach(item => {
            const itemSetores = (typeof setorArr === 'function' ? setorArr(item.setor) : [item.setor]).filter(Boolean);
            const list = itemSetores.length ? itemSetores : ['Sem Setor'];
            list.forEach(setor => {
                if (!groups[setor]) groups[setor] = [];
                groups[setor].push(item);
            });
        });

        let html = '';
        Object.keys(groups).sort().forEach(setor => {
            const items = groups[setor];
            const folderId = 'sf_' + setor.replace(/\W/g,'_');
            let cardsHtml = '';
            items.forEach(item => {
                const canEdit = userCanEditCards(item);
                const canDelete = userCanDeleteCards(item);
                const statusObj = statusList.find(s => s.name === item.status) || { color: 'default' };
                const statusColorVar = colorMap[statusObj.color] || colorMap['default'];
                const ind = _getItemIndicatorClass(item, getDeadlineDate);
                const indClass = ind === 'red' ? 'ind-red' : ind === 'yellow' ? 'ind-yellow' : 'ind-green';
                const fullTitle = item.titulo || '';
                const displayTitle = truncateText(fullTitle, 55);
                const marcadorText = item.marcador || '';
                const marcadorColorVar = colorMap[item.marcadorCor] || colorMap['default'];

                const checklist = item.checklist || [];
                const clTotal = checklist.length;
                const clDone = checklist.filter(c => c.checked).length;
                const clPct = clTotal > 0 ? Math.round((clDone / clTotal) * 100) : 0;
                const donutHtml = clTotal > 0 ? _clDonutHtml(clDone, clTotal, clPct, 40, true) : '';
                const qualityBadgeHtml = (currentTab === 'auditoria' && clTotal > 0 && clPct === 100)
                    ? _cardQualityBadgeHtml(item, currentTab) : '';

                let specificContent = '';
                const _fmtEsc3 = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
                const _respRow3 = (raw) => {
                    if (!raw) return '';
                    try {
                        const p = JSON.parse(raw);
                        if (Array.isArray(p) && p.length > 0) {
                            const name = (typeof resolveUserId === 'function' ? resolveUserId(p[0]) : null) || p[0] || '';
                            const extra = p.length - 1;
                            const badge = extra > 0 ? `<span class="card-resp-extra">+${extra}</span>` : '';
                            return `<div class="card-info-row"><i class="fas fa-user"></i><span class="card-resp-wrap"><span class="card-resp-name">${_fmtEsc3(name)}</span>${badge}</span></div>`;
                        }
                    } catch (_) {}
                    return `<div class="card-info-row"><i class="fas fa-user"></i><span class="card-resp-wrap"><span class="card-resp-name">${_fmtEsc3(String(raw))}</span></span></div>`;
                };
                if (currentTab === 'auditoria') {
                    specificContent = `<div class="card-info-row"><i class="fas fa-layer-group"></i> <span>${item.categoria||'ND'}</span></div>
                        ${_respRow3(item.responsavel)}
                        <div class="card-info-row"><i class="far fa-calendar-check"></i> <span>Prev: <strong>${formatBR(item.dataPrevisao)}</strong></span></div>`;
                } else if (currentTab === 'atividades') {
                    specificContent = `<div class="card-info-row"><i class="fas fa-layer-group"></i> <span>${item.categoria||'ND'}</span></div>
                        ${_respRow3(item.responsavel)}
                        <div class="card-info-row"><i class="far fa-calendar-check"></i> <span>Fim: <strong>${formatBR(item.dataConclusao)}</strong></span></div>`;
                } else if (currentTab === 'manutencao') {
                    const isNA = isBlankPeriodicity(item.intervalo);
                    specificContent = `<div class="card-info-row"><i class="fas fa-layer-group"></i> <span>${item.categoria||'ND'}</span></div>
                        <div class="card-info-row"><i class="fas fa-tag"></i> <span>${item.tipo||'ND'}</span></div>
                        <div class="card-info-row"><i class="far fa-calendar-check"></i> <span>Próx: <strong>${isNA?'N/A':formatBR(item.proxima)}</strong></span></div>`;
                } else {
                    const isPontual = !item.rotina || item.rotina === 'pontual';
                    specificContent = `<div class="card-info-row"><i class="fas fa-layer-group"></i> <span>${item.categoria||'ND'}</span></div>
                        ${_respRow3(item.responsavel)}
                        <div class="card-info-row"><i class="far fa-calendar-check"></i> <span>Próx: <strong>${isPontual&&!item.dataProximaRevisao?'N/A':formatBR(item.dataProximaRevisao)}</strong></span></div>`;
                }

                cardsHtml += `<div class="card ${indClass}" onclick="openView(${item.id},'${currentTab}')">
                    <div class="card-header">
                        <span class="tag" style="background-color:${statusColorVar}">${item.status||'Novo'}</span>
                        <div class="card-actions" onclick="event.stopPropagation()">
                            ${_chartIconHtml(item)}
                            ${canEdit?`<i class="fas fa-pen" onclick="editItem(${item.id},'${currentTab}')" title="Editar"></i>`:''}
                            ${canDelete?`<i class="fas fa-trash" onclick="deleteItem(${item.id},'${currentTab}')" title="Excluir"></i>`:''}
                        </div>
                    </div>
                    <div class="card-title"><h4 title="${fullTitle}">${displayTitle}</h4></div>
                    <div class="card-body">${specificContent}</div>
                    ${(marcadorText || qualityBadgeHtml) ? `<div class="card-footer">
                        ${marcadorText ? `<span class="card-marker" style="background:${marcadorColorVar}"><i class="fas fa-bookmark"></i> ${marcadorText}</span>` : ''}
                        ${qualityBadgeHtml}
                    </div>` : ''}
                    ${donutHtml}
                </div>`;
            });

            const _sfKey = `sf_collapsed_${currentTab}_${folderId}`;
            const _sfCollapsed = localStorage.getItem(_sfKey) === '1';
            html += `<div class="groups-folder${_sfCollapsed ? '' : ' open'}" id="${folderId}">
                <div class="groups-folder-header" onclick="(function(el){el.classList.toggle('open');localStorage.setItem('sf_collapsed_${currentTab}_${folderId}',el.classList.contains('open')?'0':'1');})(document.getElementById('${folderId}'))">
                    <i class="fas fa-chevron-right groups-folder-icon"></i>
                    <span class="groups-folder-name"><i class="fas fa-folder" style="margin-right:6px;color:#3b82f6;"></i>${setor}</span>
                    <span class="groups-folder-count">${items.length}</span>
                </div>
                <div class="groups-folder-body">${cardsHtml}</div>
            </div>`;
        });

        sv.innerHTML = html;
        updateNotificationCount();
    }

    function calculateDashboardData() {

        // --- OBTENÇÃO DOS VALORES DE FILTRO ---
        const fArea = document.getElementById('fDashArea').value;
        const fSetor = document.getElementById('fDashSetor').value;
        const fCat = document.getElementById('fDashCat')?.value || '';
        const fStatus = document.getElementById('fDashStatus').value;
        // Usa filtros de pessoas do dashboard (dashRespFilter/dashRevFilter/dashMyTasksActive)
        const fResponsavel = (typeof dashRespFilter !== 'undefined') ? dashRespFilter : document.getElementById('fDashResponsavel').value;
        const fRevisor = (typeof dashRevFilter !== 'undefined') ? dashRevFilter : document.getElementById('fDashRevisor').value;
        const fDashMy = (typeof dashMyTasksActive !== 'undefined') ? dashMyTasksActive : false;
        const fDashMyMode = (typeof dashMyTasksMode !== 'undefined') ? dashMyTasksMode : 'all';
        // Usa o filtro de data global do header (fbarDateMode/fbarDateYear/fbarDateMonth)
        const fDateType = (typeof fbarDateMode !== 'undefined') ? fbarDateMode : 'all';
        const fMonth = (typeof fbarDateMonth !== 'undefined') ? fbarDateMonth : new Date().getMonth();
        const fYear = (typeof fbarDateYear !== 'undefined') ? fbarDateYear : new Date().getFullYear();
        const fDataIni = '';
        const fDataFim = '';
        const fTitleQuery = titleSearchDashEnabled ? titleSearchDashQuery : '';

        // Obtém as abas que o usuário tem permissão
        const allowedTabs = userAllowedTabs();
        const areaMapping = {
            'audit': 'auditoria',
            'ativ': 'atividades',
            'mant': 'manutencao',
            'doc': 'documentos'
        };

        // Constrói uma lista completa de todos os itens com metadados unificados
        // Filtra apenas dados das abas que o usuário tem permissão
        let rawItems = [];

        if (!allowedTabs || allowedTabs.includes('auditoria')) {
            rawItems = rawItems.concat(
                audits.map(a => ({ ...a, type: 'audit', statusType: getStatusType(a.status, 'audit'), dateField: a.dataPublicacao, deadlineField: a.dataPrevisao, color: getStatusColor(a.status, 'audit') }))
            );
        }
        if (!allowedTabs || allowedTabs.includes('atividades')) {
            rawItems = rawItems.concat(
                activities.map(a => ({ ...a, type: 'ativ', statusType: getStatusType(a.status, 'ativ'), dateField: a.dataInicio, deadlineField: a.dataConclusao, color: getStatusColor(a.status, 'ativ') }))
            );
        }
        if (!allowedTabs || allowedTabs.includes('documentos')) {
            rawItems = rawItems.concat(
                documents.map(d => ({ ...d, type: 'doc', statusType: getStatusType(d.status, 'doc'), dateField: d.dataCriacao, deadlineField: d.dataProximaRevisao || null, color: getStatusColor(d.status, 'doc') }))
            );
        }

        // SOFT DELETE: Filtrar itens deletados do dashboard
        rawItems = rawItems.filter(item => !item.deleted);

        // Aplicar filtro de permissões de setores
        const allowedSetores = getAllowedSetores();
        if (allowedSetores !== null) {
            rawItems = rawItems.filter(item => setorMatchesAny(item.setor, allowedSetores));
        }

        // --- FILTRAGEM ---
        let filteredItems = rawItems.filter(item => {

            // 1. Filtro por Área/Aba
            if (fArea && item.type !== fArea) return false;

            // 2. Filtro por Setor
            if (fSetor && !setorMatchesAny(item.setor, fSetor)) return false;

            // 2.1. Filtro por Categoria
            if (fCat && item.categoria !== fCat) return false;

            // 3. Filtro por Status Consolidado
            if (fStatus && item.status !== fStatus) return false;

            // 3.2 Filtro por Responsável (manual) — resolve IDs para nomes
            if (fResponsavel) {
                const _rawResp = item.type === 'mant'
                    ? (item.responsavelTecnico || item.responsavelManutencao || '')
                    : (item.responsavel || '');
                const _normResp = typeof normalizeResponsavel === 'function' ? normalizeResponsavel(_rawResp) : _rawResp.toLowerCase();
                if (!_normResp || !_normResp.includes(fResponsavel.toLowerCase())) return false;
            }

            // 3.3 Filtro por Revisor
            if (fRevisor) {
                const _rv = normalizeResponsavel(item.revisor || '');
                if (!_rv || !_rv.includes(fRevisor.toLowerCase())) return false;
            }

            // 3.4 Filtro "Minhas Tarefas" do dashboard — compara por ID
            if (fDashMy && currentuser) {
                const _hasMe = (raw) => typeof _fieldHasCurrentUser === 'function' ? _fieldHasCurrentUser(raw) : false;
                if (fDashMyMode === 'responsavel') {
                    if (!_hasMe(item.responsavelTecnico || item.responsavel || '')) return false;
                } else if (fDashMyMode === 'revisor') {
                    if (!_hasMe(item.revisor || '')) return false;
                } else {
                    if (!_hasMe(item.responsavelTecnico || item.responsavel || '') && !_hasMe(item.revisor || '')) return false;
                }
            }

            // 3.1 Filtro por Título (lupa)
            if (fTitleQuery) {
                const t = normalizeText(item.titulo || '');
                if (!t.includes(fTitleQuery)) return false;
            }

            // 4. Filtro por Período de Publicação/Criação (dateField)
            if (fDateType !== 'all') {
                const date = item.dateField;
                if (!date) return false;
                const itemDate = new Date(date);
                if (fDateType === 'month') {
                    if (itemDate.getMonth() !== fMonth || itemDate.getFullYear() !== fYear) return false;
                } else if (fDateType === 'year') {
                    if (itemDate.getFullYear() !== fYear) return false;
                } else if (fDateType === 'week') {
                    const now = new Date();
                    const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay()); startOfWeek.setHours(0,0,0,0);
                    const endOfWeek = new Date(startOfWeek); endOfWeek.setDate(startOfWeek.getDate() + 6); endOfWeek.setHours(23,59,59,999);
                    if (itemDate < startOfWeek || itemDate > endOfWeek) return false;
                } else if (fDateType === 'custom') {
                    if (fDataIni && date < fDataIni) return false;
                    if (fDataFim && date > fDataFim) return false;
                }
            }
            return true;
        });

        // --- CÁLCULOS E AGRUPAMENTOS ---
        const totalCount = filteredItems.length;

        const activeItems = filteredItems.filter(item => item.statusType === 'ativo');
        const activeCount = activeItems.length;

        const completedCount = filteredItems.filter(item => item.statusType === 'finalizado').length;
        const cancelledCount = filteredItems.filter(item => isStatusCancelled(item.status)).length;
        const standbyCount = filteredItems.filter(item => isStatusStandby(item.status)).length;

        const activeItemsWithDeadline = activeItems.filter(item => !!item.deadlineField);
        const activeDeadlineCount = activeItemsWithDeadline.length;

        const overdueCount = activeItemsWithDeadline.filter(item => {
            const d = daysDiff(item.deadlineField);
            return d < 0;
        }).length;

        // G1: Status Consolidado
        const statusCounts = {};
        activeItems.forEach(item => {
            const key = item.status;
            if (!statusCounts[key]) {
                statusCounts[key] = { count: 0, color: item.color, type: item.type.toUpperCase() };
            }
            statusCounts[key].count++;
        });

        // G2: Distribuição por Setor (item com múltiplos setores conta em cada um)
        const setorCounts = {};
        activeItems.forEach(item => {
            const itemSetores = (typeof setorArr === 'function' ? setorArr(item.setor) : [item.setor]).filter(Boolean);
            const list = itemSetores.length ? itemSetores : ['Setor Não Definido'];
            list.forEach(setor => { setorCounts[setor] = (setorCounts[setor] || 0) + 1; });
        });

        // G_CAT: Por Categoria (todos filteredItems)
        const categoriaCounts = {};
        filteredItems.forEach(item => {
            const cat = item.categoria || 'Sem Categoria';
            categoriaCounts[cat] = (categoriaCounts[cat] || 0) + 1;
        });

        // G3: Alerta de Prazos
        const prazoCounts = {
            atrasados: { count: 0, color: 'var(--ind-red)', percent: 0 },
            criticos: { count: 0, color: 'var(--ind-yellow)', percent: 0 },
            curtoPrazo: { count: 0, color: 'var(--c-orange)', percent: 0 },
            medioPrazo: { count: 0, color: 'var(--c-blue)', percent: 0 },
            longoPrazo: { count: 0, color: 'var(--ind-green)', percent: 0 }
        };

        activeItemsWithDeadline.forEach(item => {
            const d = daysDiff(item.deadlineField);
            if (d < 0) prazoCounts.atrasados.count++;
            else if (d <= 7) prazoCounts.criticos.count++;
            else if (d <= 30) prazoCounts.curtoPrazo.count++;
            else if (d <= 90) prazoCounts.medioPrazo.count++;
            else prazoCounts.longoPrazo.count++;
        });

        // Calcula porcentagens para G3 (baseado apenas nos itens ativos)
        Object.keys(prazoCounts).forEach(key => {
            prazoCounts[key].percent = activeDeadlineCount > 0 ? (prazoCounts[key].count / activeDeadlineCount) * 100 : 0;
        });

        return { totalCount, activeCount, completedCount, cancelledCount, standbyCount, overdueCount, statusCounts, setorCounts, prazoCounts, categoriaCounts, filteredItems, rawItems };
    }

    function renderDashboard() {
        if (typeof syncDashAreaBtn === 'function') syncDashAreaBtn();
        updateDashboardFilterOptions();

        const { totalCount, activeCount, completedCount, cancelledCount, standbyCount, overdueCount, statusCounts, setorCounts, prazoCounts, categoriaCounts, filteredItems, rawItems } = calculateDashboardData();

        // --- KPI Cards ---
        const _setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        _setText('summaryTotalCount', totalCount);
        _setText('summaryActiveCount', activeCount);
        _setText('summaryCompletedCount', completedCount);
        _setText('summaryCancelledCount', cancelledCount);
        _setText('summaryOverdueCount', overdueCount);

        const _setBar = (id, pct) => { const el = document.getElementById(id); if (el) el.style.width = pct + '%'; };
        const completedPct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
        const activePct    = totalCount > 0 ? (activeCount / totalCount) * 100 : 0;
        const overduePct   = activeCount > 0 ? (overdueCount / activeCount) * 100 : 0;
        const cancelledPct = totalCount > 0 ? (cancelledCount / totalCount) * 100 : 0;
        _setBar('scBarCompleted', completedPct);
        _setBar('scBarActive', activePct);
        _setBar('scBarOverdue', overduePct);
        _setBar('scBarCancelled', cancelledPct);

        // --- Atividade Mensal (gráfico de linha) ---
        // Passa rawItems para mostrar todos os meses do ano; filtros de área/cat/responsável
        // são aplicados internamente, mas o filtro de data é ignorado para exibir o ano completo
        _initActivityYearSelect(rawItems);
        _renderAtividadeMensal(rawItems);

        // --- Status por Área (funil) ---
        // Ordena na mesma ordem que o kanban do módulo filtrado
        const _isFinal = n => typeof _kbStatusIsFinal === 'function' ? _kbStatusIsFinal(n) : /conclu|cancel/i.test(n);
        const allStatusEntries = Object.entries(statusCounts);
        const activeEntries = allStatusEntries.filter(([k]) => !_isFinal(k));

        // Determina a statusKey do módulo a partir do filtro de área
        const _areaToStatusKey = { audit: 'auditStatus', ativ: 'ativStatus', doc: 'docStatus', mant: 'mantStatus' };
        const _fAreaChart = document.getElementById('fDashArea')?.value || '';
        const _statusKey = _areaToStatusKey[_fAreaChart] || null;

        let sortedStatus;
        if (_statusKey && masterLists && masterLists[_statusKey] && typeof _kbGetSortedStatuses === 'function') {
            // Usa a ordem do kanban para o módulo filtrado
            const _kbCfg = Object.values(window._KB_MODULES || {}).find(m => m.statusKey === _statusKey) || { statusKey: _statusKey, colOrderKey: '' };
            const _orderedStatuses = _kbGetSortedStatuses(_kbCfg).filter(s => !_isFinal(s.name));
            const _orderedNames = _orderedStatuses.map(s => s.name);
            sortedStatus = activeEntries.sort(([a], [b]) => {
                const ia = _orderedNames.indexOf(a);
                const ib = _orderedNames.indexOf(b);
                if (ia === -1 && ib === -1) return 0;
                if (ia === -1) return 1;
                if (ib === -1) return -1;
                return ia - ib;
            });
        } else if (!_statusKey && typeof _kbGetSortedStatuses === 'function') {
            // Sem filtro de área: ordena por posição média entre todos os módulos
            const _allKeys = ['auditStatus', 'ativStatus', 'docStatus'];
            const _posMap = {};
            _allKeys.forEach(key => {
                const _cfg = { statusKey: key, colOrderKey: '' };
                (_kbGetSortedStatuses(_cfg) || []).filter(s => !_isFinal(s.name)).forEach((s, i) => {
                    if (!_posMap[s.name]) _posMap[s.name] = [];
                    _posMap[s.name].push(i);
                });
            });
            sortedStatus = activeEntries.sort(([a], [b]) => {
                const pa = _posMap[a] ? _posMap[a].reduce((s, v) => s + v, 0) / _posMap[a].length : 9999;
                const pb = _posMap[b] ? _posMap[b].reduce((s, v) => s + v, 0) / _posMap[b].length : 9999;
                return pa - pb;
            });
        } else {
            sortedStatus = activeEntries;
        }
        const badgeStatus = document.getElementById('badgeStatusAtivos');
        if (badgeStatus) badgeStatus.textContent = activeCount + ' ativos';
        _renderStatusPizza(sortedStatus, activeCount);

        // --- Por Setor (barras com scroll) ---
        const listSetor = document.getElementById('chartDistribuicaoSetor');
        const sortedSetores = Object.entries(setorCounts).sort(([, a], [, b]) => b - a);
        const badgeSetores = document.getElementById('badgeSetores');
        if (badgeSetores) badgeSetores.textContent = sortedSetores.length + ' setor' + (sortedSetores.length !== 1 ? 'es' : '');

        const _paletteA = ['#2563eb','#16a34a','#ca8a04','#9333ea','#ea580c','#0369a1','#be123c','#0d9488','#7c3aed','#c026d3'];
        if (sortedSetores.length === 0) {
            listSetor.innerHTML = '<div class="chart-empty"><i class="fas fa-building"></i><span>Nenhum dado</span></div>';
        } else {
            listSetor.innerHTML = sortedSetores.map(([setor, count], i) => {
                const pct = activeCount > 0 ? (count / activeCount) * 100 : 0;
                const color = _paletteA[i % _paletteA.length];
                return `<li>
                    <div class="chart-list-header">
                        <span class="status-info"><span class="color-dot" style="background:${color}"></span>${setor}</span>
                        <div><span class="value">${count}</span><span class="percent">(${pct.toFixed(1)}%)</span></div>
                    </div>
                    <div class="chart-bar"><div class="chart-bar-fill" style="width:${pct}%;background:${color}"></div></div>
                </li>`;
            }).join('');
        }

        // --- Por Categoria (barras) ---
        const listCat = document.getElementById('chartCategoria');
        const sortedCats = Object.entries(categoriaCounts).sort(([, a], [, b]) => b - a);
        const badgeCat = document.getElementById('badgeCategorias');
        if (badgeCat) badgeCat.textContent = sortedCats.length + ' categoria' + (sortedCats.length !== 1 ? 's' : '');

        const _paletteB = ['#7c3aed','#0369a1','#be123c','#0d9488','#2563eb','#16a34a','#ca8a04','#9333ea','#ea580c'];
        if (sortedCats.length === 0) {
            listCat.innerHTML = '<div class="chart-empty"><i class="fas fa-tags"></i><span>Nenhum dado</span></div>';
        } else {
            listCat.innerHTML = sortedCats.map(([cat, count], i) => {
                const pct = totalCount > 0 ? (count / totalCount) * 100 : 0;
                const color = _paletteB[i % _paletteB.length];
                return `<li>
                    <div class="chart-list-header">
                        <span class="status-info"><span class="color-dot" style="background:${color}"></span>${cat}</span>
                        <div><span class="value">${count}</span><span class="percent">(${pct.toFixed(1)}%)</span></div>
                    </div>
                    <div class="chart-bar"><div class="chart-bar-fill" style="width:${pct}%;background:${color}"></div></div>
                </li>`;
            }).join('');
        }

        // --- Alerta de Prazos ---
        const listPrazos = document.getElementById('chartAlertaPrazos');
        const badgeAtrasados = document.getElementById('badgeAtrasados');
        if (badgeAtrasados) badgeAtrasados.textContent = prazoCounts.atrasados.count + ' atrasado' + (prazoCounts.atrasados.count !== 1 ? 's' : '');

        const prazoData = [
            { label: 'Atrasados', key: 'atrasados', icon: 'fas fa-exclamation-circle', color: 'var(--ind-red)' },
            { label: 'Críticos (≤ 7d)', key: 'criticos', icon: 'fas fa-exclamation-triangle', color: 'var(--ind-yellow)' },
            { label: 'Curto (8–30d)', key: 'curtoPrazo', icon: 'fas fa-hourglass-start', color: 'var(--c-orange)' },
            { label: 'Médio (31–90d)', key: 'medioPrazo', icon: 'fas fa-clock', color: 'var(--c-blue)' },
            { label: 'Longo (> 90d)', key: 'longoPrazo', icon: 'fas fa-check-circle', color: 'var(--ind-green)' }
        ];

        if (activeCount === 0) {
            listPrazos.innerHTML = '<div class="chart-empty"><i class="fas fa-clock"></i><span>Nenhum item ativo</span></div>';
        } else {
            listPrazos.innerHTML = prazoData.map(item => {
                const data = prazoCounts[item.key];
                const count = data.count;
                const pct = data.percent;
                return `<li>
                    <div class="chart-list-header">
                        <span class="status-info"><i class="${item.icon}" style="color:${item.color}"></i>${item.label}</span>
                        <div><span class="deadline-info" style="color:${item.color}">${count}</span><span class="percent">(${pct.toFixed(1)}%)</span></div>
                    </div>
                    <div class="chart-bar"><div class="chart-bar-fill" style="width:${pct}%;background:${item.color}"></div></div>
                </li>`;
            }).join('');
        }

        // --- Donut por Módulo ---
        _renderDonutModulo();

        // --- Taxa de Conclusão ---
        _renderRadialConclusion(totalCount, completedCount, activeCount, cancelledCount);

        // --- Publicações ---
        _dashPubCurrentPage = 1;
        _renderDashPublicacoes();

        // --- Minhas Revisões ---
        _minhasRevisoesPage = 1;
        _renderMinhasRevisoes();

        updateNotificationCount();
    }

    // ── Status por Área — Funil Pipeline ─────────────────────────────────
    function _renderStatusPizza(sortedStatus, activeCount) {
        const container = document.getElementById('statusFunnelChart');
        if (!container) return;

        if (sortedStatus.length === 0) {
            container.innerHTML = '<div class="chart-empty" style="padding:20px 0"><i class="fas fa-filter"></i><span>Nenhum item encontrado</span></div>';
            return;
        }

        const maxCount = sortedStatus.reduce((m, [, d]) => Math.max(m, d.count), 0);

        container.innerHTML = sortedStatus.map(([key, data]) => {
            const colorVar = colorMap[data.color] || colorMap['default'];
            const resolvedColor = _resolveCssVar(colorVar);
            const pct = activeCount > 0 ? ((data.count / activeCount) * 100).toFixed(1) : 0;
            // Largura relativa ao maior valor: mínimo 20% para sempre ser visível
            const barW = maxCount > 0 ? Math.max(20, Math.round((data.count / maxCount) * 100)) : 20;
            return `<div class="funnel-row" title="${key}: ${data.count} (${pct}%)">
                <div class="funnel-bar-label">${key}</div>
                <div class="funnel-bar" style="width:${barW}%;background:${resolvedColor}">
                    <span class="funnel-bar-count">${data.count}</span>
                    <span class="funnel-bar-pct">${pct}%</span>
                </div>
            </div>`;
        }).join('');
    }

    // Resolve CSS variable to hex for canvas (approximate from known palette)
    function _resolveCssVar(cssVar) {
        const map = {
            'var(--c-blue)': '#2563eb', 'var(--c-green)': '#16a34a', 'var(--c-red)': '#dc2626',
            'var(--c-orange)': '#ea580c', 'var(--c-yellow)': '#ca8a04', 'var(--c-purple)': '#9333ea',
            'var(--c-default)': '#64748b', 'var(--ind-green)': '#16a34a', 'var(--ind-yellow)': '#ca8a04',
            'var(--ind-red)': '#dc2626'
        };
        return map[cssVar] || cssVar;
    }

    // ── Atividade Mensal — gráfico de linha ──────────────────────────────
    var _dashActivityYear = new Date().getFullYear();

    function _initActivityYearSelect(rawItems) {
        const sel = document.getElementById('dashActivityYear');
        if (!sel) return;
        const years = new Set();
        const thisYear = new Date().getFullYear();
        years.add(thisYear); years.add(thisYear - 1); years.add(thisYear - 2);
        rawItems.forEach(item => {
            const d = item.dateField;
            if (d) { const y = parseInt(d.substring(0, 4)); if (y >= 2000 && y <= thisYear + 1) years.add(y); }
        });
        const sorted = Array.from(years).sort((a, b) => b - a);
        // Only rebuild if options changed
        const current = parseInt(sel.value) || _dashActivityYear;
        sel.innerHTML = sorted.map(y => `<option value="${y}" ${y === current ? 'selected' : ''}>${y}</option>`).join('');
        if (!sel.value) sel.value = _dashActivityYear;
        _dashActivityYear = parseInt(sel.value);
    }

    window.onDashActivityYearChange = function() {
        const sel = document.getElementById('dashActivityYear');
        if (sel) _dashActivityYear = parseInt(sel.value);
        const { rawItems } = calculateDashboardData();
        _renderAtividadeMensal(rawItems);
    };

    // Guarda estado do gráfico para o tooltip
    var _activityChartState = null;

    function _renderAtividadeMensal(rawItems) {
        const canvas = document.getElementById('chartAtividadeMensal');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
        const monthsFull = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
        const year = _dashActivityYear;

        const allowedSetores = getAllowedSetores();
        const _fArea = document.getElementById('fDashArea')?.value || '';
        const _fCat  = document.getElementById('fDashCat')?.value  || '';
        const _fResp = (typeof dashRespFilter !== 'undefined') ? dashRespFilter : (document.getElementById('fDashResponsavel')?.value || '');
        const _fMyTasks = (typeof dashMyTasksActive !== 'undefined') ? dashMyTasksActive : false;
        const _fMyMode  = (typeof dashMyTasksMode  !== 'undefined') ? dashMyTasksMode  : 'all';
        const _me = (typeof currentuser !== 'undefined' && currentuser && currentuser.name)
            ? currentuser.name.toLowerCase().trim() : '';
        let items = rawItems.filter(item => {
            if (item.deleted) return false;
            if (allowedSetores !== null && !setorMatchesAny(item.setor, allowedSetores)) return false;
            if (_fArea && item.type !== _fArea) return false;
            if (_fCat  && item.categoria !== _fCat) return false;
            if (_fResp) {
                const _r = normalizeResponsavel(item.responsavelTecnico || item.responsavel || '');
                if (!_r || !_r.includes(_fResp.toLowerCase())) return false;
            }
            if (_fMyTasks && currentuser) {
                const _hasMe = (raw) => typeof _fieldHasCurrentUser === 'function' ? _fieldHasCurrentUser(raw) : false;
                if (_fMyMode === 'revisor') {
                    if (!_hasMe(item.revisor || '')) return false;
                } else if (_fMyMode === 'responsavel') {
                    if (!_hasMe(item.responsavelTecnico || item.responsavel || '')) return false;
                } else {
                    if (!_hasMe(item.responsavelTecnico || item.responsavel || '') && !_hasMe(item.revisor || '')) return false;
                }
            }
            if (!item.dateField) return false;
            return parseInt((item.dateField || '').substring(0, 4)) === year;
        });

        const wrap = canvas.parentElement;
        const W = wrap ? wrap.clientWidth : 600;
        const H = wrap ? wrap.clientHeight : 280;
        canvas.width = W || 600;
        canvas.height = H || 280;
        const PAD = { top: 24, right: 24, bottom: 42, left: 46 };
        const chartW = canvas.width - PAD.left - PAD.right;
        const chartH = canvas.height - PAD.top - PAD.bottom;

        const counts = Array(12).fill(0);
        items.forEach(item => {
            const m = parseInt((item.dateField || '').substring(5, 7)) - 1;
            if (m >= 0 && m <= 11) counts[m]++;
        });

        const color = '#2563eb';

        if (counts.every(v => v === 0)) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#94a3b8';
            ctx.font = '13px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Nenhum dado para o período', canvas.width / 2, canvas.height / 2);
            _activityChartState = null;
            _activityBaseDrawFn = null;
            return;
        }

        const maxVal = Math.max(...counts, 1);
        const nTicks = 5;
        const rawStep = maxVal / nTicks;
        const step = rawStep <= 1 ? 1 : Math.ceil(rawStep);
        const gridMax = step * nTicks;

        const pts = counts.map((v, i) => ({
            x: PAD.left + (i / 11) * chartW,
            y: PAD.top + chartH - (v / gridMax) * chartH,
            v
        }));

        // Salva estado e função de redraw base (sem highlight)
        _activityChartState = { pts, counts, PAD, chartW, chartH, color, months: monthsFull, year, gridMax };
        _activityBaseDrawFn = function() {
            _drawActivityBase(ctx, canvas, pts, PAD, chartW, chartH, color, gridMax, months, monthsFull);
        };

        // Renderiza pela primeira vez
        _activityBaseDrawFn();
        _initActivityTooltip(canvas);
    }

    // Guarda a função de redraw base para uso no mousemove
    var _activityBaseDrawFn = null;

    // Desenha o gráfico base (grid + linha + dots) sem highlight — reutilizável
    function _drawActivityBase(ctx, canvas, pts, PAD, chartW, chartH, color, gridMax, months, monthsFull) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const nTicks = 5;

        // Grid lines + Y labels
        for (let i = 0; i <= nTicks; i++) {
            const cy = PAD.top + chartH - (i / nTicks) * chartH;
            ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(PAD.left, cy); ctx.lineTo(PAD.left + chartW, cy); ctx.stroke();
            ctx.fillStyle = '#94a3b8'; ctx.font = '10px Inter,sans-serif'; ctx.textAlign = 'right';
            ctx.fillText(String(Math.round((i / nTicks) * gridMax)), PAD.left - 8, cy + 3.5);
        }

        // X month labels
        ctx.fillStyle = '#94a3b8'; ctx.font = '10px Inter,sans-serif'; ctx.textAlign = 'center';
        months.forEach((m, i) => {
            const cx = PAD.left + (i / 11) * chartW;
            ctx.fillText(m, cx, PAD.top + chartH + 18);
        });

        function _smoothLine(points) {
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 0; i < points.length - 1; i++) {
                const cp1x = points[i].x + (points[i + 1].x - points[i].x) * 0.4;
                const cp1y = points[i].y;
                const cp2x = points[i + 1].x - (points[i + 1].x - points[i].x) * 0.4;
                const cp2y = points[i + 1].y;
                ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, points[i + 1].x, points[i + 1].y);
            }
        }

        // Area fill
        const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + chartH);
        grad.addColorStop(0, color + '30');
        grad.addColorStop(1, color + '00');
        ctx.save();
        _smoothLine(pts);
        ctx.lineTo(pts[pts.length - 1].x, PAD.top + chartH);
        ctx.lineTo(pts[0].x, PAD.top + chartH);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();

        // Line
        ctx.save();
        _smoothLine(pts);
        ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.stroke();
        ctx.restore();

        // Dots
        pts.forEach(p => {
            ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
            ctx.fillStyle = color; ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
        });
    }

    // ── Tooltip interativo ───────────────────────────────────────────────
    var _activityTooltipBound = false;
    var _activityLastHighlightIdx = -1;

    function _initActivityTooltip(canvas) {
        if (_activityTooltipBound) return;
        _activityTooltipBound = true;

        const tooltip = document.getElementById('dashActivityTooltip');
        if (!tooltip) return;

        function _getHoveredPoint(e) {
            if (!_activityChartState) return null;
            const { pts } = _activityChartState;
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const mx = (e.clientX - rect.left) * scaleX;

            const colW = pts.length > 1 ? (pts[1].x - pts[0].x) : 60;
            let best = null, bestDist = Infinity;
            pts.forEach((p, i) => {
                const dist = Math.abs(mx - p.x);
                if (dist < bestDist && dist < colW * 0.7) { bestDist = dist; best = { ...p, i }; }
            });
            return best;
        }

        canvas.addEventListener('mousemove', function(e) {
            const pt = _getHoveredPoint(e);
            if (!pt || !_activityChartState) {
                tooltip.classList.remove('visible');
                if (_activityLastHighlightIdx !== -1) {
                    _activityLastHighlightIdx = -1;
                    if (_activityBaseDrawFn) _activityBaseDrawFn();
                }
                return;
            }

            const { months, year, color, PAD, chartH } = _activityChartState;
            const rect = canvas.getBoundingClientRect();
            const scaleX = rect.width / canvas.width;
            const scaleY = rect.height / canvas.height;

            // Só redesenha se mudou de mês — evita flickering desnecessário
            if (pt.i !== _activityLastHighlightIdx) {
                _activityLastHighlightIdx = pt.i;

                // Redesenha base limpo primeiro
                if (_activityBaseDrawFn) _activityBaseDrawFn();

                // Overlay: linha vertical + dot ampliado
                const ctx = canvas.getContext('2d');
                ctx.save();
                ctx.setLineDash([4, 4]);
                ctx.strokeStyle = color + '55'; ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(pt.x, PAD.top);
                ctx.lineTo(pt.x, PAD.top + chartH);
                ctx.stroke();
                ctx.setLineDash([]);

                ctx.beginPath(); ctx.arc(pt.x, pt.y, 8, 0, Math.PI * 2);
                ctx.fillStyle = color + '20'; ctx.fill();
                ctx.beginPath(); ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
                ctx.fillStyle = color; ctx.fill();
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.stroke();
                ctx.restore();
            }

            tooltip.innerHTML = `
                <span class="dash-chart-tooltip-dot" style="background:${color}"></span>
                <span>${months[pt.i]} ${year}</span>
                <strong style="margin-left:4px">${pt.v} registro${pt.v !== 1 ? 's' : ''}</strong>`;
            tooltip.style.left = (pt.x * scaleX) + 'px';
            tooltip.style.top  = (pt.y * scaleY) + 'px';
            tooltip.classList.add('visible');
        });

        canvas.addEventListener('mouseleave', function() {
            tooltip.classList.remove('visible');
            _activityLastHighlightIdx = -1;
            if (_activityBaseDrawFn) _activityBaseDrawFn();
        });
    }

    // Redraw activity chart on window resize
    (function() {
        var _activityResizeTimer;
        window.addEventListener('resize', function() {
            clearTimeout(_activityResizeTimer);
            _activityResizeTimer = setTimeout(function() {
                if (document.getElementById('dashboardContent') && document.getElementById('dashboardContent').style.display !== 'none') {
                    const { rawItems } = calculateDashboardData();
                    _renderAtividadeMensal(rawItems);
                }
            }, 150);
        });
    })();

    // ── Donut por Módulo ─────────────────────────────────────────────────
    var _donutModuloSlices = [];

    function _renderDonutModulo() {
        const allowedTabs = userAllowedTabs();
        const moduleData = [];
        const moduleColors = { audit: '#2563eb', ativ: '#16a34a', mant: '#ca8a04', doc: '#9333ea' };
        const moduleLabels = { audit: 'Rotinas', ativ: 'Atividades', mant: 'Manutenção', doc: 'Documentos' };
        const moduleIcons  = { audit: 'fas fa-clipboard-check', ativ: 'fas fa-tasks', mant: 'fas fa-wrench', doc: 'fas fa-file-lines' };
        const sources = [
            { key: 'audit', arr: typeof audits !== 'undefined' ? audits : [] },
            { key: 'ativ',  arr: typeof activities !== 'undefined' ? activities : [] },
            { key: 'mant',  arr: typeof maintenances !== 'undefined' ? maintenances : [] },
            { key: 'doc',   arr: typeof documents !== 'undefined' ? documents : [] }
        ];

        sources.forEach(({ key, arr }) => {
            if (allowedTabs && !allowedTabs.includes(key === 'audit' ? 'auditoria' : key === 'ativ' ? 'atividades' : key === 'mant' ? 'manutencao' : 'documentos')) return;
            const count = arr.filter(i => !i.deleted).length;
            if (count > 0) moduleData.push({ key, label: moduleLabels[key], color: moduleColors[key], count, icon: moduleIcons[key] });
        });

        const total = moduleData.reduce((s, d) => s + d.count, 0);
        const donutTotal = document.getElementById('donutTotal');
        if (donutTotal) donutTotal.textContent = total;

        const legend = document.getElementById('donutLegend');
        if (legend) {
            legend.innerHTML = moduleData.map(d => `
                <li>
                    <span class="dl-dot" style="background:${d.color}"></span>
                    <i class="${d.icon}" style="color:${d.color};font-size:11px"></i>
                    <span>${d.label}</span>
                    <span class="dl-count">${d.count}</span>
                </li>`).join('');
        }

        const canvas = document.getElementById('chartDonutModulo');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.width, H = canvas.height;
        const cx = W / 2, cy = H / 2, r = Math.min(W, H) * 0.38, inner = r * 0.58;
        ctx.clearRect(0, 0, W, H);

        if (total === 0) {
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.strokeStyle = '#e2e8f0';
            ctx.lineWidth = r - inner;
            ctx.stroke();
            _donutModuloSlices = [];
            return;
        }

        _donutModuloSlices = [];
        let startAngle = -Math.PI / 2;
        moduleData.forEach(d => {
            const slice = (d.count / total) * Math.PI * 2;
            const pct = ((d.count / total) * 100).toFixed(1);
            _donutModuloSlices.push({ start: startAngle, end: startAngle + slice, color: d.color, label: d.label, count: d.count, pct });
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, r, startAngle, startAngle + slice);
            ctx.closePath();
            ctx.fillStyle = d.color;
            ctx.fill();
            startAngle += slice;
        });

        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(cx, cy, inner, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,1)';
        ctx.fill();
        ctx.restore();

        _initDonutTooltip(canvas, 'donutModuloTooltip', () => _donutModuloSlices, cx, cy, r, inner);
    }

    // ── Tooltip genérico para gráficos de rosca/pizza ───────────────────
    var _donutTooltipInstances = {};
    function _initDonutTooltip(canvas, tooltipId, getSlices, cx, cy, r, inner) {
        if (_donutTooltipInstances[canvas.id]) return;
        _donutTooltipInstances[canvas.id] = true;

        // Cria tooltip se não existir
        let tooltip = document.getElementById(tooltipId);
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = tooltipId;
            tooltip.className = 'dash-chart-tooltip donut-tooltip';
            document.body.appendChild(tooltip);
        }

        canvas.style.cursor = 'pointer';

        canvas.addEventListener('mousemove', function(e) {
            const slices = getSlices();
            if (!slices.length) return;
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            const mx = (e.clientX - rect.left) * scaleX;
            const my = (e.clientY - rect.top) * scaleY;
            const dx = mx - cx, dy = my - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < inner || dist > r) {
                tooltip.classList.remove('visible');
                return;
            }

            let angle = Math.atan2(dy, dx);
            // Normalize to same range as drawing (-π/2 start)
            const found = slices.find(s => {
                let start = s.start, end = s.end;
                // atan2 returns [-π, π]; our slices start at -π/2
                // Normalize angle to [-π/2, 3π/2]
                let a = angle;
                if (a < -Math.PI / 2) a += Math.PI * 2;
                return a >= start && a < end;
            });

            if (found) {
                tooltip.innerHTML = `
                    <span class="dash-chart-tooltip-dot" style="background:${found.color}"></span>
                    <span>${found.label}</span>
                    <strong style="margin-left:4px">${found.count} (${found.pct}%)</strong>`;
                // Position near mouse, offset above
                const tipX = e.clientX;
                const tipY = e.clientY;
                tooltip.style.position = 'fixed';
                tooltip.style.left = tipX + 'px';
                tooltip.style.top  = (tipY - 12) + 'px';
                tooltip.classList.add('visible');
            } else {
                tooltip.classList.remove('visible');
            }
        });

        canvas.addEventListener('mouseleave', function() {
            tooltip.classList.remove('visible');
        });
    }

    // ── Radial taxa de conclusão ─────────────────────────────────────────
    function _renderRadialConclusion(total, concluded, active, cancelled) {
        const pct = total > 0 ? concluded / total : 0;
        const circumference = 314.16;
        const offset = circumference - pct * circumference;

        const fill = document.getElementById('radialFill');
        if (fill) fill.style.strokeDashoffset = offset;

        const pctEl = document.getElementById('radialPct');
        if (pctEl) pctEl.textContent = Math.round(pct * 100) + '%';

        const _s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        _s('radialConcluidos', concluded);
        _s('radialAtivos', active);
        _s('radialCancelados', cancelled);
    }

    // ── Dashboard Publicações ────────────────────────────────────────────
    var _dashPubCurrentPage = 1;
    var _dashPubTypeFilter = '';
    var _dashPubSearchQuery = '';
    var _DASH_PUB_PER_PAGE = 5;
    var _DASH_PUB_MAX_PAGES = 10;

    window.onDashPubTypeTab = function(btn, type) {
        document.querySelectorAll('.dpt-tab').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        _dashPubTypeFilter = type;
        _dashPubCurrentPage = 1;
        _renderDashPublicacoes();
    };
    window.onDashPubSearchChange = function() {
        const el = document.getElementById('dashPubSearch');
        _dashPubSearchQuery = el ? (el.value || '').toLowerCase().trim() : '';
        _dashPubCurrentPage = 1;
        _renderDashPublicacoes();
    };
    window.goToDashPubPage = function(page) {
        _dashPubCurrentPage = page;
        _renderDashPublicacoes();
    };

    function _collectAllPublicacoes() {
        const allowedTabs = userAllowedTabs();
        const allowedSetores = getAllowedSetores();
        const result = [];

        const sources = [
            { arr: typeof audits      !== 'undefined' ? audits      : [], tab: 'auditoria',   typeKey: 'audit', label: 'Rotinas', icon: 'fas fa-clipboard-check', color: '#2563eb' },
            { arr: typeof activities  !== 'undefined' ? activities  : [], tab: 'atividades',  typeKey: 'ativ',  label: 'Atividades',        icon: 'fas fa-tasks',           color: '#16a34a' },
            { arr: typeof documents   !== 'undefined' ? documents   : [], tab: 'documentos',  typeKey: 'doc',   label: 'Documentos',        icon: 'fas fa-file-lines',      color: '#9333ea' }
        ];

        sources.forEach(({ arr, tab, typeKey, label, icon, color }) => {
            if (allowedTabs && !allowedTabs.includes(tab)) return;
            arr.forEach(item => {
                if (item.deleted) return;
                if (allowedSetores !== null && !setorMatchesAny(item.setor, allowedSetores)) return;
                (item.publicacoes || []).forEach((pub, idx) => {
                    result.push({ pub, item, tab, typeKey, label, icon, color, idx });
                });
            });
        });

        result.sort((a, b) => {
            const da = (a.pub.data || '') + (a.pub.hora || '');
            const db = (b.pub.data || '') + (b.pub.hora || '');
            return db.localeCompare(da);
        });
        return result;
    }

    // Mostra/oculta tabs de tipo de publicação conforme a área selecionada
    function _syncPubTypeTabs(area) {
        // ativ: Comentário, Atualização, Evidência
        // doc:  Documento
        // audit: Auditoria (publica como tipo)
        // '' (todas): mostra tudo
        const areaTabMap = {
            'ativ':  ['Comentário','Atualização','Evidência'],
            'doc':   ['Documento'],
            'audit': ['Auditoria','Comentário','Atualização','Evidência']
        };
        const allowed = area ? (areaTabMap[area] || []) : null; // null = todas visíveis

        document.querySelectorAll('#dashPubTypeTabs .dpt-tab[data-type]').forEach(btn => {
            const type = btn.dataset.type;
            if (!type) return; // "Todas" sempre visível
            const visible = !allowed || allowed.includes(type);
            btn.classList.toggle('dpt-tab--hidden', !visible);
            // Se o tab ativo ficou oculto, volta para "Todas"
            if (!visible && btn.classList.contains('active')) {
                btn.classList.remove('active');
                _dashPubTypeFilter = '';
                document.querySelector('#dashPubTypeTabs .dpt-tab[data-type=""]')?.classList.add('active');
            }
        });
    }

    function _renderDashPublicacoes() {
        const tbody = document.getElementById('dashPubTableBody');
        const emptyEl = document.getElementById('dashPubEmpty');
        const countEl = document.getElementById('dashPubCount');
        const paginationEl = document.getElementById('dashPubPagination');
        if (!tbody) return;

        let allPubs = _collectAllPublicacoes();

        // Filtro por área selecionada + ajusta tabs visíveis
        const _fArea = document.getElementById('fDashArea')?.value || '';
        _syncPubTypeTabs(_fArea);
        if (_fArea) {
            allPubs = allPubs.filter(p => p.typeKey === _fArea);
        }

        // Apply type filter (reset se não é válido para a área)
        if (_dashPubTypeFilter) {
            allPubs = allPubs.filter(p => p.pub.tipo === _dashPubTypeFilter);
        }

        // Filtro "Minhas Tarefas" — filtra publicações cujo item tem o usuário como responsável/revisor
        const _pubMyTasks = (typeof dashMyTasksActive !== 'undefined') ? dashMyTasksActive : false;
        const _pubMyMode  = (typeof dashMyTasksMode  !== 'undefined') ? dashMyTasksMode  : 'responsavel';
        if (_pubMyTasks && currentuser) {
            const _hasMe = (raw) => typeof _fieldHasCurrentUser === 'function' ? _fieldHasCurrentUser(raw) : false;
            allPubs = allPubs.filter(p => {
                const rawResp = p.item.responsavelTecnico || p.item.responsavel || '';
                const rawRev  = p.item.revisor || '';
                if (_pubMyMode === 'responsavel') return _hasMe(rawResp);
                if (_pubMyMode === 'revisor')     return _hasMe(rawRev);
                return _hasMe(rawResp) || _hasMe(rawRev);
            });
        }

        // Apply search
        if (_dashPubSearchQuery) {
            allPubs = allPubs.filter(p => {
                const haystack = [
                    p.pub.descricao || '', p.pub.titulo || '', p.item.titulo || '',
                    p.pub.usuario || '', p.pub.tipo || '', (typeof setorText === 'function' ? setorText(p.item.setor) : p.item.setor) || ''
                ].join(' ').toLowerCase();
                return haystack.includes(_dashPubSearchQuery);
            });
        }

        const totalPubs = allPubs.length;
        const maxPages = Math.min(_DASH_PUB_MAX_PAGES, Math.ceil(totalPubs / _DASH_PUB_PER_PAGE));
        const totalPages = Math.max(1, maxPages);
        if (_dashPubCurrentPage > totalPages) _dashPubCurrentPage = totalPages;

        const start = (_dashPubCurrentPage - 1) * _DASH_PUB_PER_PAGE;
        const pagePubs = allPubs.slice(start, start + _DASH_PUB_PER_PAGE);

        if (countEl) countEl.textContent = totalPubs + ' publicaç' + (totalPubs !== 1 ? 'ões' : 'ão');

        const typeChipClass = {
            'Comentário': 'pub-type-chip--comment',
            'Atualização': 'pub-type-chip--update',
            'Evidência':  'pub-type-chip--evidence',
            'Documento':  'pub-type-chip--document'
        };
        const typeIcon = {
            'Comentário': 'fas fa-comment',
            'Atualização':'fas fa-rotate',
            'Evidência':  'fas fa-paperclip',
            'Documento':  'fas fa-file-lines'
        };

        if (pagePubs.length === 0) {
            tbody.innerHTML = '';
            if (emptyEl) emptyEl.style.display = 'flex';
        } else {
            if (emptyEl) emptyEl.style.display = 'none';
            tbody.innerHTML = pagePubs.map(({ pub, item, tab, label, icon, color, idx }) => {
                const tipo = pub.tipo || 'Comentário';
                const chipClass = typeChipClass[tipo] || '';
                const ico = typeIcon[tipo] || 'fas fa-paper-plane';
                const itemTitulo = item.titulo || '—';
                const desc = pub.titulo || pub.descricao || '';
                const setor = (typeof setorText === 'function' ? setorText(item.setor) : item.setor) || '—';
                const _rawUsuario = pub.usuario || '';
                const _resolvedUsuario = (_rawUsuario && typeof resolveUserId === 'function') ? (resolveUserId(_rawUsuario) || _rawUsuario) : _rawUsuario;
                const usuario = _resolvedUsuario || '—';
                const initials = usuario.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
                const usuarioShort = _formatResponsavelShort(usuario);
                const dateBR = pub.data ? pub.data.split('-').reverse().join('/') : '—';
                const hora = pub.hora ? pub.hora : '';
                const numAnexos = (pub.anexos || []).length;
                const anexosBadge = numAnexos > 0
                    ? `<span class="dash-pub-attach-badge"><i class="fas fa-paperclip"></i>${numAnexos}</span>`
                    : '<span style="color:var(--text-muted);font-size:12px">—</span>';

                return `<tr onclick="verPublicacao(${item.id},'${tab}',${idx})" title="Ver publicação">
                    <td><span class="pub-type-chip ${chipClass}"><i class="${ico}"></i>${tipo}</span></td>
                    <td>
                        <span class="dash-pub-title">${_escHtml(itemTitulo)}</span>
                        ${desc ? `<span class="dash-pub-subtitle">${_escHtml(desc)}</span>` : ''}
                    </td>
                    <td>
                        <div class="dash-pub-user">
                            <span class="dash-pub-avatar">${initials}</span>
                            <span>${_escHtml(usuarioShort)}</span>
                        </div>
                    </td>
                    <td>
                        <div class="dash-pub-date">${dateBR}<small>${hora}</small></div>
                    </td>
                    <td>${anexosBadge}</td>
                </tr>`;
            }).join('');
        }

        // Pagination
        if (paginationEl) {
            paginationEl.innerHTML = _buildDashPubPagination(_dashPubCurrentPage, totalPages);
        }
    }

    function _escHtml(str) {
        return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // Retorna primeiro + segundo nome, respeitando artigos de ligação (de, da, do, dos, das, e)
    function _formatResponsavelShort(name) {
        const articles = new Set(['de','da','do','dos','das','e']);
        const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
        if (parts.length <= 2) return parts.join(' ');
        const result = [];
        for (let i = 0; i < parts.length; i++) {
            result.push(parts[i]);
            if (result.length >= 2 && !articles.has(parts[i].toLowerCase())) break;
        }
        return result.join(' ');
    }

    // ── Minhas Revisões ─────────────────────────────────────────────────
    var _minhasRevisoesPage = 1;
    var _MINREV_PER_PAGE = 5;

    window.goToMinRevPage = function(page) {
        _minhasRevisoesPage = page;
        _renderMinhasRevisoes();
    };

    function _renderMinhasRevisoes() {
        const listEl  = document.getElementById('chartMinhasRevisoes');
        const badgeEl = document.getElementById('badgeMinhasRevisoes');
        const countEl = document.getElementById('minhasRevisoesCount');
        const pagEl   = document.getElementById('minhasRevisoesPagination');
        if (!listEl) return;

        const me = (currentuser && currentuser.name ? currentuser.name : '').toLowerCase().trim();
        const allowedTabs    = userAllowedTabs();
        const allowedSetores = getAllowedSetores();
        const fArea = document.getElementById('fDashArea')?.value || '';
        const _isMeRevisor = (raw) => typeof _fieldHasCurrentUser === 'function' ? _fieldHasCurrentUser(raw) : (normalizeResponsavel(raw).includes(me));

        const sources = [
            { arr: typeof audits     !== 'undefined' ? audits     : [], tab: 'auditoria',   typeKey: 'audit', tabLabel: 'auditoria',    dateField: 'dataPublicacao' },
            { arr: typeof activities !== 'undefined' ? activities : [], tab: 'atividades',  typeKey: 'ativ',  tabLabel: 'atividades',   dateField: 'dataInicio'    },
            { arr: typeof documents  !== 'undefined' ? documents  : [], tab: 'documentos',  typeKey: 'doc',   tabLabel: 'documentos',   dateField: 'dataCriacao'   }
        ];

        const canceledTypes = new Set(['Concluído','Concluido','Finalizado','Cancelado','Arquivado']);

        let items = [];
        sources.forEach(({ arr, tab, typeKey, tabLabel, dateField }) => {
            if (allowedTabs && !allowedTabs.includes(tab)) return;
            if (fArea && fArea !== typeKey) return;
            arr.forEach(item => {
                if (item.deleted) return;
                if (allowedSetores !== null && !setorMatchesAny(item.setor, allowedSetores)) return;
                // Exclui concluídos e cancelados
                if (canceledTypes.has(item.status)) return;
                if (!me || !_isMeRevisor(item.revisor || '')) return;
                items.push({ item, tab: tabLabel, typeKey, dateField });
            });
        });

        items.sort((a, b) => {
            const da = a.item[a.dateField] || '';
            const db = b.item[b.dateField] || '';
            return db.localeCompare(da);
        });

        const total = items.length;
        const totalPages = Math.max(1, Math.ceil(total / _MINREV_PER_PAGE));
        if (_minhasRevisoesPage > totalPages) _minhasRevisoesPage = totalPages;
        const start = (_minhasRevisoesPage - 1) * _MINREV_PER_PAGE;
        const pageItems = items.slice(start, start + _MINREV_PER_PAGE);

        if (badgeEl) badgeEl.textContent = total + ' ite' + (total !== 1 ? 'ns' : 'm');
        if (countEl) countEl.textContent = total > 0 ? `${start + 1}–${Math.min(start + _MINREV_PER_PAGE, total)} de ${total}` : '';

        const tabLabels = { audit: 'Rotina', ativ: 'Atividade', doc: 'Documento' };

        if (pageItems.length === 0) {
            listEl.innerHTML = `<div class="chart-empty"><i class="fas fa-user-check"></i><span>${me ? 'Nenhum item pendente de revisão' : 'Usuário não identificado'}</span></div>`;
        } else {
            listEl.innerHTML = pageItems.map(({ item, tab, typeKey, dateField }) => {
                const titulo = _escHtml(item.titulo || item.descricao || '—');
                const status = _escHtml(item.status || '');
                const setor  = _escHtml((typeof setorText === 'function' ? setorText(item.setor) : item.setor) || '');
                const date   = item[dateField] ? item[dateField].substring(0, 10) : '—';
                const typeL  = tabLabels[typeKey] || typeKey;
                // Flags de prazo
                const _dl = item.dataPrevisao || item.dataConclusao || item.dataProximaRevisao || null;
                const _d  = (_dl && typeof daysDiff === 'function') ? daysDiff(_dl) : Infinity;
                const isAtrasado = _d < 0;
                const _flagDays = (item.flagDias === 0 || item.flagDias === '0') ? 0 : (item.flagDias || 7);
                const isAlerta = !isAtrasado && _flagDays > 0 && _d !== Infinity && _d <= _flagDays;
                const color = isAtrasado ? '#dc2626' : isAlerta ? '#ca8a04' : '#64748b';
                const _dAbs = _d === Infinity ? 0 : Math.abs(Math.round(_d));
                const overdueFlag = isAtrasado
                    ? `<span style="display:inline-flex;align-items:center;gap:2px;background:#dc2626;color:#fff;font-size:9px;font-weight:700;padding:1px 5px 1px 4px;border-radius:99px;line-height:1.4;flex-shrink:0;" title="Vencido"><i class="fas fa-exclamation-circle" style="font-size:8px;"></i>Vencido há ${_dAbs}d</span>`
                    : '';
                const alertaFlag = isAlerta
                    ? `<span style="display:inline-flex;align-items:center;gap:2px;background:#ca8a04;color:#fff;font-size:9px;font-weight:700;padding:1px 5px 1px 4px;border-radius:99px;line-height:1.4;flex-shrink:0;" title="Prazo de alerta"><i class="fas fa-exclamation-triangle" style="font-size:8px;"></i>${Math.round(_d) === 0 ? 'Vence hoje' : 'Vence em ' + Math.round(_d) + 'd'}</span>`
                    : '';
                const pubCount = (item.publicacoes || []).length;
                const pubBadge = pubCount > 0
                    ? `<span style="display:inline-flex;align-items:center;gap:3px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-size:9px;font-weight:700;padding:1px 5px 1px 4px;border-radius:99px;line-height:1.4;letter-spacing:0.2px;flex-shrink:0;" title="${pubCount} publicaç${pubCount===1?'ão':'ões'}"><i class="fas fa-layer-group" style="font-size:8px;"></i>${pubCount}</span>`
                    : '';
                return `<li style="cursor:pointer;" onclick="openView(${item.id},'${tab}')" title="Abrir card">
                    <div class="chart-list-header">
                        <span class="status-info" style="min-width:0;flex:1;overflow:hidden;">
                            <span class="color-dot" style="background:${color}"></span>
                            <span style="max-width:145px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${titulo}">${titulo}</span>
                            ${pubBadge}
                        </span>
                        <span style="display:inline-flex;align-items:center;gap:4px;flex-shrink:0;">${overdueFlag}${alertaFlag}<span style="font-size:10.5px;font-weight:600;color:${color};">${status}</span></span>
                    </div>
                    <div style="display:flex;gap:6px;align-items:center;margin-top:2px;">
                        <span style="font-size:10px;color:var(--text-muted);background:var(--bg-elevated);padding:1px 6px;border-radius:99px;">${typeL}</span>
                        <span style="font-size:10px;color:var(--text-muted);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${setor}</span>
                        <span style="font-size:10px;color:var(--text-muted)">${date}</span>
                        <i class="fas fa-chevron-right" style="font-size:9px;color:var(--border-strong);"></i>
                    </div>
                </li>`;
            }).join('');
        }

        if (pagEl) {
            if (totalPages <= 1) { pagEl.innerHTML = ''; return; }
            let html = `<button class="dpg-btn" onclick="goToMinRevPage(${_minhasRevisoesPage - 1})" ${_minhasRevisoesPage === 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>`;
            for (let i = 1; i <= totalPages; i++) {
                html += `<button class="dpg-btn ${i === _minhasRevisoesPage ? 'active' : ''}" onclick="goToMinRevPage(${i})">${i}</button>`;
            }
            html += `<button class="dpg-btn" onclick="goToMinRevPage(${_minhasRevisoesPage + 1})" ${_minhasRevisoesPage === totalPages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>`;
            pagEl.innerHTML = html;
        }
    }

    function _buildDashPubPagination(current, total) {
        if (total <= 1) return '';
        let html = `<button class="dpg-btn" onclick="goToDashPubPage(${current - 1})" ${current === 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>`;

        const pages = [];
        if (total <= 7) {
            for (let i = 1; i <= total; i++) pages.push(i);
        } else {
            pages.push(1);
            if (current > 3) pages.push('...');
            for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
            if (current < total - 2) pages.push('...');
            pages.push(total);
        }

        pages.forEach(p => {
            if (p === '...') {
                html += `<span class="dpg-ellipsis">…</span>`;
            } else {
                html += `<button class="dpg-btn ${p === current ? 'active' : ''}" onclick="goToDashPubPage(${p})">${p}</button>`;
            }
        });

        html += `<button class="dpg-btn" onclick="goToDashPubPage(${current + 1})" ${current === total ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>`;
        return html;
    }

    window.renderDashboard = renderDashboard;
    window.renderCards = renderCards;
