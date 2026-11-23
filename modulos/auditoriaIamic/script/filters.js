// === FILTROS DAS ABAS E DASHBOARD ===

    // Filtro do Dashboard
    function onFilterDashboardChange() {
        if (document.getElementById('fDashDateType').value !== 'all') {
            updateDateInputs('Dash');
        }
        updateDashboardFilterOptions();
        saveFiltersToFirebase();
        renderDashboard();
    }

    function updateDashboardFilterOptions() {
        // Obtém as abas que o usuário tem permissão
        const allowedTabs = userAllowedTabs();

        // Constrói uma lista completa de todos os itens (filtrando apenas abas permitidas)
        let rawItems = [];

        if (!allowedTabs || allowedTabs.includes('auditoria')) {
            rawItems = rawItems.concat(audits.map(a => ({ ...a, type: 'audit' })));
        }
        if (!allowedTabs || allowedTabs.includes('atividades')) {
            rawItems = rawItems.concat(activities.map(a => ({ ...a, type: 'ativ' })));
        }
        if (!allowedTabs || allowedTabs.includes('manutencao')) {
            rawItems = rawItems.concat(maintenances.map(m => ({ ...m, type: 'mant' })));
        }
        if (!allowedTabs || allowedTabs.includes('documentos')) {
            rawItems = rawItems.concat(documents.map(d => ({ ...d, type: 'doc' })));
        }

        // SOFT DELETE: Filtrar itens deletados do dashboard
        rawItems = rawItems.filter(item => !item.deleted);

        // Aplicar filtro de permissões de setores
        const allowedSetores = getAllowedSetores();
        if (allowedSetores !== null) {
            rawItems = rawItems.filter(item => setorMatchesAny(item.setor, allowedSetores));
        }

        // Obtém valores atuais dos filtros (exceto o que estamos atualizando)
        const fArea = document.getElementById('fDashArea')?.value || '';
        const fSetor = document.getElementById('fDashSetor')?.value || '';
        const fCat = document.getElementById('fDashCat')?.value || '';
        const fStatus = document.getElementById('fDashStatus')?.value || '';
        const fResponsavel = document.getElementById('fDashResponsavel')?.value || '';
        const fDateType = document.getElementById('fDashDateType')?.value || 'all';
        const fMonth = parseInt(document.getElementById('fDashMonth')?.value || currentMonth);
        const fYearForMonth = parseInt(document.getElementById('fDashYearForMonth')?.value || currentYear);
        const fYearOnly = parseInt(document.getElementById('fDashYearOnly')?.value || currentYear);
        const fYear = (fDateType === 'year') ? fYearOnly : fYearForMonth;
        const fDataIni = document.getElementById('fDashDataIni')?.value || '';
        const fDataFim = document.getElementById('fDashDataFim')?.value || '';
        const fTitleQuery = titleSearchDashEnabled ? titleSearchDashQuery : '';

        // Função auxiliar para verificar se um item passa pelos filtros (exceto o filtro sendo atualizado)
        const passesOtherFilters = (item, excludeFilter) => {
            // Filtro por Área/Aba (exceto se estiver sendo atualizado)
            if (excludeFilter !== 'area' && fArea && item.type !== fArea) return false;

            // Filtro por Setor (exceto se estiver sendo atualizado)
            if (excludeFilter !== 'setor') {
                if (fSetor && !setorMatchesAny(item.setor, fSetor)) return false;
            }

            // Filtro por Categoria (exceto se estiver sendo atualizado)
            if (excludeFilter !== 'cat' && fCat && item.categoria !== fCat) return false;

            // Filtro por Status (exceto se estiver sendo atualizado)
            if (excludeFilter !== 'status' && fStatus && item.status !== fStatus) return false;

            // Filtro por Responsável (exceto se estiver sendo atualizado)
            if (excludeFilter !== 'responsavel' && fResponsavel) {
                if (item.type === 'mant') {
                    // Para manutenção, verifica apenas responsável técnico
                    const respTec = normalizeResponsavel(item.responsavelTecnico);
                    const filterLower = fResponsavel.toLowerCase();
                    if (!respTec.includes(filterLower)) return false;
                } else {
                    itemResponsavel = normalizeResponsavel(item.responsavel);
                    const filterLower = fResponsavel.toLowerCase();
                    if (!itemResponsavel || !itemResponsavel.includes(filterLower)) return false;
                }
            }

            // Filtro por Título
            if (fTitleQuery) {
                const t = normalizeText(item.titulo || '');
                if (!t.includes(fTitleQuery)) return false;
            }

            // Filtro por Período
            if (fDateType !== 'all') {
                const dateField = item.type === 'audit' ? item.dataPublicacao :
                                 item.type === 'ativ' ? item.dataInicio :
                                 item.type === 'mant' ? item.ultima :
                                 item.dataCriacao;
                if (!dateField) return false;

                const itemDate = new Date(dateField);
                if (fDateType === 'month') {
                    if (itemDate.getMonth() !== fMonth || itemDate.getFullYear() !== fYear) return false;
                } else if (fDateType === 'year') {
                    if (itemDate.getFullYear() !== fYear) return false;
                } else if (fDateType === 'custom') {
                    if (fDataIni && dateField < fDataIni) return false;
                    if (fDataFim && dateField > fDataFim) return false;
                }
            }
            return true;
        };

        // Área: gerenciada pelo botão/chips (fDashArea é hidden); apenas garantir valor padrão
        {
            const el = document.getElementById('fDashArea');
            if (el && !el.value) el.value = 'ativ';
        }

        // Atualiza filtro de Setor
        {
            const availableSetores = new Set();
            rawItems.forEach(item => {
                if (passesOtherFilters(item, 'setor')) {
                    const itemSetores = (typeof setorArr === 'function' ? setorArr(item.setor) : [item.setor]).filter(Boolean);
                    (itemSetores.length ? itemSetores : ['Setor Não Definido']).forEach(s => availableSetores.add(s));
                }
            });
            // Exposto globalmente para o filtro de header (setor-filter.js) só listar setores com dados
            window.dashboardAvailableSetores = availableSetores;

            const el = document.getElementById('fDashSetor');
            if (el) {
                const currentValue = el.value || '';
                const masterSetores = getMasterSetores();
                const ordered = masterSetores.filter(s => availableSetores.has(s));
                const extras = [...availableSetores].filter(s => !masterSetores.includes(s)).sort();
                setSelectOptions(el, 'Setor: Todos', [...ordered, ...extras], currentValue);
            }
        }

        // Atualiza filtro de Categoria
        {
            const el = document.getElementById('fDashCat');
            if (el) {
                const currentValue = el.value || '';
                const availableCategorias = new Set();
                rawItems.forEach(item => {
                    if (passesOtherFilters(item, 'cat') && item.categoria) {
                        availableCategorias.add(item.categoria);
                    }
                });
                // Coleta todas as categorias das listas mestre
                const allCategorias = [];
                ['auditCategorias', 'ativCategorias', 'mantCategorias', 'docCategorias'].forEach(key => {
                    (masterLists[key] || []).forEach(cat => { if (cat) allCategorias.push(cat); });
                });
                const masterCategorias = [...new Set(allCategorias)].sort();
                const ordered = masterCategorias.filter(c => availableCategorias.has(c));
                const extras = [...availableCategorias].filter(c => !masterCategorias.includes(c)).sort();
                setSelectOptions(el, 'Categoria: Todas', [...ordered, ...extras], currentValue);
            }
        }

        // Atualiza filtro de Status
        {
            const el = document.getElementById('fDashStatus');
            if (el) {
                const currentValue = el.value || '';
                const availableStatus = new Set();
                rawItems.forEach(item => {
                    if (passesOtherFilters(item, 'status') && item.status) {
                        availableStatus.add(item.status);
                    }
                });
                // Coleta todos os status das listas mestre
                const allStatusnames = [];
                ['auditStatus', 'ativStatus', 'mantStatus', 'docStatus'].forEach(key => {
                    (masterLists[key] || []).forEach(s => { if (s.name) allStatusnames.push(s.name); });
                });
                const masterStatus = [...new Set(allStatusnames)].sort();
                const ordered = masterStatus.filter(s => availableStatus.has(s));
                const extras = [...availableStatus].filter(s => !masterStatus.includes(s)).sort();
                setSelectOptions(el, 'Status: Todos', [...ordered, ...extras], currentValue);
            }
        }

        // Atualiza filtro de Responsável (Dashboard) - mostra apenas dos cards visíveis
        {
            const el = document.getElementById('fDashResponsavel');
            if (el) {
                const currentValue = el.value || '';
                const availableResponsaveis = new Set();
                rawItems.forEach(item => {
                    if (passesOtherFilters(item, 'responsavel')) {
                        if (item.type === 'mant') {
                            const respTec = normalizeResponsavel(item.responsavelTecnico);
                            if (respTec) availableResponsaveis.add(respTec);
                        } else if (item.responsavel) {
                            const resp = normalizeResponsavel(item.responsavel);
                            if (resp) availableResponsaveis.add(resp);
                        }
                    }
                });
                const realNames = new Set();
                [...availableResponsaveis].forEach(normalized => {
                    const user = users?.find(u => u.name && u.name.toLowerCase() === normalized);
                    if (user) {
                        realNames.add(user.name);
                    } else {
                        const resp = masterLists.responsaveis?.find(r => r && r.toLowerCase() === normalized);
                        if (resp) realNames.add(resp);
                        else realNames.add(normalized);
                    }
                });
                const sorted = [...realNames].sort((a, b) => a.localeCompare(b));
                const html = '<option value="">Responsável: Todos</option>' + sorted.map(r => `<option value="${r}">${r}</option>`).join('');
                el.innerHTML = html;
                el.value = currentValue;
            }
        }

        // Atualiza filtro de Revisor (Dashboard) - mostra apenas dos cards visíveis
        {
            const el = document.getElementById('fDashRevisor');
            if (el) {
                const currentValue = el.value || '';
                const availableRevisores = new Set();
                rawItems.forEach(item => {
                    if (passesOtherFilters(item, 'revisor') && item.revisor && item.type !== 'mant') {
                        const rev = normalizeResponsavel(item.revisor);
                        if (rev) availableRevisores.add(rev);
                    }
                });
                const realNames = new Set();
                [...availableRevisores].forEach(normalized => {
                    const user = users?.find(u => u.name && u.name.toLowerCase() === normalized);
                    if (user) {
                        realNames.add(user.name);
                    } else {
                        const resp = masterLists.responsaveis?.find(r => r && r.toLowerCase() === normalized);
                        if (resp) realNames.add(resp);
                        else realNames.add(normalized);
                    }
                });
                const sorted = [...realNames].sort((a, b) => a.localeCompare(b));
                const html = '<option value="">Revisor: Todos</option>' + sorted.map(r => `<option value="${r}">${r}</option>`).join('');
                el.innerHTML = html;
                el.value = currentValue;
            }
        }
    }

    // Limpa filtros do Dashboard
    function clearDashboardFilters() {
        document.getElementById('fDashArea').value = "ativ";
        document.getElementById('fDashSetor').value = "";
        document.getElementById('fDashCat').value = "";
        document.getElementById('fDashStatus').value = "";
        document.getElementById('fDashResponsavel').value = "";
        document.getElementById('fDashRevisor').value = "";
        document.getElementById('fDashDateType').value = 'all';
        document.getElementById('fDashDataIni').value = "";
        document.getElementById('fDashDataFim').value = "";

        // Limpa selects do dropdown avançado
        ['dropDashArea','dropDashCatAdv'].forEach(id => {
            const el = document.getElementById(id); if (el) el.value = '';
        });

        // Sincroniza botão de área para padrão
        if (typeof syncDashAreaBtn === 'function') syncDashAreaBtn();

        // Reseta Minhas Tarefas e filtros de pessoa do dashboard
        if (typeof dashMyTasksActive !== 'undefined') {
            dashMyTasksActive = true;
            dashMyTasksMode   = 'responsavel';
            dashRespFilter    = '';
            dashRevFilter     = '';
            if (typeof _updateDashPeopleBtnUI === 'function') {
                _updateDashPeopleBtnUI('responsavel');
                _updateDashPeopleBtnUI('revisor');
            }
            if (typeof _syncDashPeopleBtnsVisibility === 'function') _syncDashPeopleBtnsVisibility();
            const myBtn = document.getElementById('fbarMyTasksDash');
            if (myBtn) myBtn.classList.add('active');
        }

        setTitleSearchEnabled('dash', false);
        updateDateInputs('Dash');
        updateDashboardFilterOptions();
        saveFiltersToFirebase();
        renderDashboard();
    }


    function clearFilters() {
        // Mapeia a aba atual para o prefixo dos filtros
        const tabPrefix = {
            'auditoria': 'Audit',
            'atividades': 'Ativ',
            'manutencao': 'Mant',
            'documentos': 'Doc'
        }[currentTab] || 'Audit';

        const filterPrefix = `f${tabPrefix}`;

        // Limpa apenas os filtros da aba atual
        ['Responsavel','Revisor','Status','Cat','Setor','Marcador'].forEach(suffix => {
            const el = document.getElementById(`${filterPrefix}${suffix}`);
            if (el) el.value = '';
        });

        // Limpa apenas a data type da aba atual
        const dateTypeId = `f${tabPrefix}DateType`;
        const dateTypeEl = document.getElementById(dateTypeId);
        if (dateTypeEl) dateTypeEl.value = 'all';

        // Limpa inputs de data da aba atual
        const dataIniId = `f${tabPrefix}DataIni`;
        const dataFimId = `f${tabPrefix}DataFim`;
        const dataIniEl = document.getElementById(dataIniId);
        const dataFimEl = document.getElementById(dataFimId);
        if (dataIniEl) dataIniEl.value = "";
        if (dataFimEl) dataFimEl.value = "";

        setTitleSearchEnabled('cards', false);

        updateDateInputs(tabPrefix);

        saveFiltersToFirebase();

        onFilterSetorChange(tabPrefix);
        renderCards();
    }


    // Função para obter setores permitidos do usuário atual
    function getAllowedSetores() {
        if (!currentuser) return null; // null = todos os setores (admin ou sem restrição)
        if (userIsAdmin()) return null;
        if (currentuser.canManageLists === true) return null; // Usuários com permissão de gerenciar listas veem todos
        if (Array.isArray(currentuser.allowedSetores) && currentuser.allowedSetores.length > 0) {
            return currentuser.allowedSetores;
        }
        return []; // Se não tem setores permitidos, não vê nenhum
    }

    function populateSelects() {
    var setores = masterLists.setores || [];
    var allowedSetores = getAllowedSetores(); // null = todos, array = apenas os permitidos

    // Captura os valores selecionados antes de reconstruir os selects para evitar o reset
    var currentValues = {
        // MODAIS
        audit: { setor: document.getElementById('auditSetor')?.value, cat: document.getElementById('auditCategoria')?.value, status: document.getElementById('auditStatus')?.value, mark: document.getElementById('auditMarcador')?.value },
        ativ: { setor: document.getElementById('ativSetor')?.value, cat: document.getElementById('ativCategoria')?.value, status: document.getElementById('ativStatus')?.value, mark: document.getElementById('ativMarcador')?.value },
        mant: { setor: document.getElementById('mantSetor')?.value, cat: document.getElementById('mantCategoria')?.value, status: document.getElementById('mantStatus')?.value, mark: document.getElementById('mantMarcador')?.value, tipo: document.getElementById('mantTipo')?.value },
        doc: { setor: document.getElementById('docSetor')?.value, cat: document.getElementById('docCategoria')?.value, status: document.getElementById('docStatus')?.value, mark: document.getElementById('docMarcador')?.value },

        // FILTROS (persistência ao editar listas)
        dash: {
            area: document.getElementById('fDashArea')?.value,
            setor: document.getElementById('fDashSetor')?.value,
            cat: document.getElementById('fDashCat')?.value,
            sub: document.getElementById('fDashSub')?.value,
            status: document.getElementById('fDashStatus')?.value,
            responsavel: document.getElementById('fDashResponsavel')?.value,
            revisor: document.getElementById('fDashRevisor')?.value,
            dateType: document.getElementById('fDashDateType')?.value,
            month: document.getElementById('fDashMonth')?.value,
            yearForMonth: document.getElementById('fDashYearForMonth')?.value,
            yearOnly: document.getElementById('fDashYearOnly')?.value,
            dataIni: document.getElementById('fDashDataIni')?.value,
            dataFim: document.getElementById('fDashDataFim')?.value
        },
        Audit: {
            setor: document.getElementById('fAuditSetor')?.value,
            cat: document.getElementById('fAuditCat')?.value,
            sub: document.getElementById('fAuditSub')?.value,
            status: document.getElementById('fAuditStatus')?.value,
            marcador: document.getElementById('fAuditMarcador')?.value || ''
        },
        Ativ: {
            setor: document.getElementById('fAtivSetor')?.value,
            cat: document.getElementById('fAtivCat')?.value,
            sub: document.getElementById('fAtivSub')?.value,
            status: document.getElementById('fAtivStatus')?.value,
            marcador: document.getElementById('fAtivMarcador')?.value || ''
        },
        Mant: {
            setor: document.getElementById('fMantSetor')?.value,
            cat: document.getElementById('fMantCat')?.value,
            item: document.getElementById('fMantItem')?.value,
            tipo: document.getElementById('fMantTipo')?.value,
            status: document.getElementById('fMantStatus')?.value,
            marcador: document.getElementById('fMantMarcador')?.value || ''
        },
        Doc: {
            setor: document.getElementById('fDocSetor')?.value,
            cat: document.getElementById('fDocCat')?.value,
            sub: document.getElementById('fDocSub')?.value,
            status: document.getElementById('fDocStatus')?.value,
            marcador: document.getElementById('fDocMarcador')?.value || ''
        }
    };

    // Coleta TODOS os status para o Dashboard
    var allStatusnames = [];
    ['auditStatus', 'ativStatus', 'mantStatus', 'docStatus'].forEach(key => {
        (masterLists[key] || []).forEach(s => { if (s.name) allStatusnames.push(s.name); });
    });
    var unifiedStatusnames = [...new Set(allStatusnames)].sort();

    // Função auxiliar para extrair valor de um item (string ou objeto)
    var extractValue = (item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && item.value) return item.value;
        if (item && typeof item === 'object' && item.name) return item.name;
        return String(item);
    };

    // Função auxiliar para extrair nome de um item para exibição (string ou objeto)
    var extractDisplayName = (item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && item.name) return item.name;
        if (item && typeof item === 'object' && item.value) return item.value;
        return String(item);
    };

    var makeOpts = (list) => (list || [])
        .filter(i => {
            // Filtra itens deletados e objetos malformados
            if (typeof i === 'object') {
                return i && !i.deleted && (i.name || i.value);
            }
            return i; // Strings simples são mantidas
        })
        .map(i => {
            const val = extractValue(i);
            const display = extractDisplayName(i);
            return `<option value="${val}">${display}</option>`;
        })
        .join('');

    var makeStatusOpts = (list) => (list || [])
        .filter(i => i && !i.deleted && i.name)
        .map(i => `<option value="${i.name}">${i.name}</option>`)
        .join('');

    var makeFilterOpts = (list, label) => `<option value="">${label}</option>` + (list || [])
        .filter(i => {
            if (typeof i === 'object') {
                return i && !i.deleted && (i.name || i.value);
            }
            return i;
        })
        .map(i => {
            const val = extractValue(i);
            const display = extractDisplayName(i);
            return `<option value="${val}">${display}</option>`;
        })
        .join('');

    var makeStatusFilterOpts = (list, label) => `<option value="">${label}</option>` + (list || [])
        .filter(i => i && !i.deleted && i.name)
        .map(i => `<option value="${i.name}">${i.name}</option>`)
        .join('');

    // Filtra setores baseado nas permissões do usuário e ordena alfabeticamente
    var filteredSetores = (allowedSetores === null ? setores : setores.filter(s => allowedSetores.includes(s)))
        .slice().sort((a, b) => String(a).localeCompare(String(b), 'pt'));

    // Setores para os modais de criação/edição: usa permissões base, SEM aplicar filtro ativo do header
    var baseAllowedSetores = (typeof _getAllowedSetoresBase === 'function' ? _getAllowedSetoresBase() : allowedSetores);
    var modalSetores = (baseAllowedSetores === null ? setores : setores.filter(s => baseAllowedSetores.includes(s)))
        .slice().sort((a, b) => String(a).localeCompare(String(b), 'pt'));

    // --- FILTROS DASHBOARD ---
    document.getElementById('fDashSetor').innerHTML = makeFilterOpts(filteredSetores, "Setor: Todos");
    // Categoria será populada dinamicamente por updateDashboardFilterOptions
    document.getElementById('fDashCat').innerHTML = '<option value="">Categoria: Todas</option>';
    // subcategoria removida
    document.getElementById('fDashStatus').innerHTML = makeFilterOpts(unifiedStatusnames, "Status: Todos");
    if (currentValues.dash.area != null) document.getElementById('fDashArea').value = currentValues.dash.area;
    if (currentValues.dash.setor != null) document.getElementById('fDashSetor').value = currentValues.dash.setor;
    if (currentValues.dash.cat != null) document.getElementById('fDashCat').value = currentValues.dash.cat;
    // subcategoria removida da interface
    if (currentValues.dash.status != null) document.getElementById('fDashStatus').value = currentValues.dash.status;
    // Restaura filtros de Data e Responsável/Revisor do Dashboard (serão atualizados dinamicamente em updateDashboardFilterOptions)
    if (currentValues.dash.dateType != null) document.getElementById('fDashDateType').value = currentValues.dash.dateType;
    if (currentValues.dash.month != null) document.getElementById('fDashMonth').value = currentValues.dash.month;
    if (currentValues.dash.yearForMonth != null) document.getElementById('fDashYearForMonth').value = currentValues.dash.yearForMonth;
    if (currentValues.dash.yearOnly != null) document.getElementById('fDashYearOnly').value = currentValues.dash.yearOnly;
    if (currentValues.dash.dataIni != null) document.getElementById('fDashDataIni').value = currentValues.dash.dataIni;
    if (currentValues.dash.dataFim != null) document.getElementById('fDashDataFim').value = currentValues.dash.dataFim;
    // Responsável e Revisor serão restaurados após updateDashboardFilterOptions
    var dashResponsavelValue = currentValues.dash.responsavel;
    var dashRevisorValue = currentValues.dash.revisor;

    // --- POPULAR MODAIS (Setores e Categorias) ---
    var _prefixToKbCfg = {
        audit: { statusKey: 'auditStatus', colOrderKey: 'kanban_audit_col_order' },
        ativ:  { statusKey: 'ativStatus',  colOrderKey: 'kanban_ativ_col_order' },
        doc:   { statusKey: 'docStatus',   colOrderKey: 'kanban_doc_col_order' }
    };
    ['audit', 'ativ', 'doc'].forEach(p => {
        // Setor destes módulos é um popover multi-select (ver setor-multiselect.js),
        // não um <select> — nada a repopular aqui, o estado já vive no próprio módulo.
        const isSetorMulti = true;
        const setorEl = isSetorMulti ? null : document.getElementById(`${p}Setor`);
        const catEl = document.getElementById(`${p}Categoria`);
        const statusEl = document.getElementById(`${p}Status`);
        if ((!isSetorMulti && !setorEl) || !catEl || !statusEl) return;
        if (setorEl) setorEl.innerHTML = '<option value=""></option>' + makeOpts(modalSetores);
        catEl.innerHTML = '<option value=""></option>' + makeOpts(masterLists[`${p}Categorias`] || []);
        // Mesma ordem exibida no Kanban (respeita reordenação por arrasto das colunas)
        const statusList = typeof _kbGetSortedStatuses === 'function'
            ? _kbGetSortedStatuses(_prefixToKbCfg[p])
            : (masterLists[`${p}Status`] || []);
        statusEl.innerHTML = makeStatusOpts(statusList);

        const markerSelect = document.getElementById(`${p}Marcador`);
        if (markerSelect) markerSelect.innerHTML = `<option value="">Selecionar marcador</option>` + makeStatusOpts(masterLists[`${p}Marcadores`] || []);

        if (setorEl && currentValues[p] && currentValues[p].setor) setorEl.value = currentValues[p].setor;
        if (currentValues[p] && currentValues[p].cat) catEl.value = currentValues[p].cat;
        if (currentValues[p] && currentValues[p].status) statusEl.value = currentValues[p].status;
        if (markerSelect && currentValues[p] && currentValues[p].mark) markerSelect.value = currentValues[p].mark;
    });

    // Atualiza Subcategorias/Itens baseado na categoria restaurada
    onCategoryChange('audit');
    onCategoryChange('ativ');
    onCategoryChange('doc');

    // Popula os selects de responsáveis e revisores
    // GARANTE que TODOS os usuários disponíveis apareçam, sem nenhuma filtragem
    var responsaveisOptions = ['<option value="">Selecione um responsável...</option>'];

    // Adiciona TODOS os nomes de usuários cadastrados (sem filtragem)
    if (typeof users !== 'undefined') {
        users.forEach(user => {
            if (user.name && user.name.trim()) {
                responsaveisOptions.push(`<option value="${user.name}">${user.name}</option>`);
            }
        });
    }

    // Adiciona responsáveis da lista mestre (se houver)
    if (masterLists.responsaveis) {
        masterLists.responsaveis.forEach(r => {
            if (r && r.trim()) {
                responsaveisOptions.push(`<option value="${r}">${r}</option>`);
            }
        });
    }

    // Remove duplicatas e ordena
    var uniqueOptions = [...new Set(responsaveisOptions)];
    var sortedOptions = uniqueOptions.sort((a, b) => {
        const aText = a.match(/>(.*?)</)[1] || '';
        const bText = b.match(/>(.*?)</)[1] || '';
        return aText.localeCompare(bText);
    });

    // Popula o select de responsável de manutenção (ainda é select comum)
    ['mantResponsavelTecnico'].forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            const currentValue = select.value;
            select.innerHTML = sortedOptions.join('');
            select.value = currentValue;
        }
    });
    // Atualiza a lista de usuários do ms-field após populate
    if (typeof msRefreshUsers === 'function') msRefreshUsers();

    // --- FILTROS DAS ABAS ---
    document.getElementById('fAuditSetor').innerHTML = makeFilterOpts(filteredSetores, "Setor: Todos");
    document.getElementById('fAtivSetor').innerHTML = makeFilterOpts(filteredSetores, "Setor: Todos");
    document.getElementById('fDocSetor').innerHTML = makeFilterOpts(filteredSetores, "Setor: Todos");

    document.getElementById('fAuditCat').innerHTML = makeFilterOpts(masterLists.auditCategorias, "Categoria: Todas");
    document.getElementById('fAuditStatus').innerHTML = makeStatusFilterOpts(masterLists.auditStatus, "Status: Todos");
    document.getElementById('fAtivCat').innerHTML = makeFilterOpts(masterLists.ativCategorias, "Categoria: Todas");
    document.getElementById('fAtivStatus').innerHTML = makeStatusFilterOpts(masterLists.ativStatus, "Status: Todos");
    document.getElementById('fDocCat').innerHTML = makeFilterOpts(masterLists.docCategorias, "Categoria: Todas");
    document.getElementById('fDocStatus').innerHTML = makeStatusFilterOpts(masterLists.docStatus, "Status: Todos");

    // Popula selects ocultos de Marcador
    document.getElementById('fAuditMarcador').innerHTML = makeStatusOpts(masterLists.auditMarcadores || []);
    document.getElementById('fAtivMarcador').innerHTML = makeStatusOpts(masterLists.ativMarcadores || []);
    document.getElementById('fDocMarcador').innerHTML = makeStatusOpts(masterLists.docMarcadores || []);

    // Restaura valores de filtros para evitar voltar ao primeiro item após editar listas
    if (currentValues.Audit?.setor != null) document.getElementById('fAuditSetor').value = currentValues.Audit.setor;
    if (currentValues.Ativ?.setor != null) document.getElementById('fAtivSetor').value = currentValues.Ativ.setor;
    if (currentValues.Doc?.setor != null) document.getElementById('fDocSetor').value = currentValues.Doc.setor;

    if (currentValues.Audit?.cat != null) document.getElementById('fAuditCat').value = currentValues.Audit.cat;
    if (currentValues.Ativ?.cat != null) document.getElementById('fAtivCat').value = currentValues.Ativ.cat;
    if (currentValues.Doc?.cat != null) document.getElementById('fDocCat').value = currentValues.Doc.cat;

    if (currentValues.Audit?.status != null) document.getElementById('fAuditStatus').value = currentValues.Audit.status;
    if (currentValues.Ativ?.status != null) document.getElementById('fAtivStatus').value = currentValues.Ativ.status;
    if (currentValues.Doc?.status != null) document.getElementById('fDocStatus').value = currentValues.Doc.status;

    if (currentValues.Audit?.marcador != null) document.getElementById('fAuditMarcador').value = currentValues.Audit.marcador;
    if (currentValues.Ativ?.marcador != null) document.getElementById('fAtivMarcador').value = currentValues.Ativ.marcador;
    if (currentValues.Doc?.marcador != null) document.getElementById('fDocMarcador').value = currentValues.Doc.marcador;

    // Subcategoria/Item são facetados dinamicamente; tenta restaurar seleção e, em seguida, recalcula opções visíveis
    if (typeof updateFilterFacetOptions === 'function') {
        ['Audit', 'Ativ', 'Mant', 'Doc'].forEach(p => updateFilterFacetOptions(p));
        // restaura sub/itens após recálculo (se ainda existirem)
        const aSub = document.getElementById('fAuditSub'); if (aSub && currentValues.Audit.sub != null) aSub.value = currentValues.Audit.sub;
        const tSub = document.getElementById('fAtivSub'); if (tSub && currentValues.Ativ.sub != null) tSub.value = currentValues.Ativ.sub;
        const mItem = document.getElementById('fMantItem'); if (mItem && currentValues.Mant.item != null) mItem.value = currentValues.Mant.item;
        const dSub = document.getElementById('fDocSub'); if (dSub && currentValues.Doc.sub != null) dSub.value = currentValues.Doc.sub;
    }

    // Atualiza filtros dinâmicos do Dashboard (Responsável, Revisor, etc)
    updateDashboardFilterOptions();

    // Restaura valores de Responsável e Revisor do Dashboard após updateDashboardFilterOptions populá-los
    // Note: Os valores são passados como variáveis globais de populateSelects
    if (typeof dashResponsavelValue !== 'undefined' && dashResponsavelValue != null) {
        const elResp = document.getElementById('fDashResponsavel');
        if (elResp) elResp.value = dashResponsavelValue;
    }
    if (typeof dashRevisorValue !== 'undefined' && dashRevisorValue != null) {
        const elRev = document.getElementById('fDashRevisor');
        if (elRev) elRev.value = dashRevisorValue;
    }
}

    // Funções auxiliares para obter prefixos de ID corretos
    function getTabPrefix(tab) {
        if (tab === 'auditoria') return 'audit';
        if (tab === 'atividades') return 'ativ';
        if (tab === 'manutencao') return 'mant';
        if (tab === 'documentos') return 'doc';
        return '';
    }

    // Funções de atualização em cascata para MODAIS (Setor não interfere, mantido apenas para CategoryChange)
    function onCategoryChange(prefix) {
    var catSelect = document.getElementById(`${prefix}Categoria`);
    if (!catSelect || !masterLists) return;

    var subcatSelect;
    var listKey;
    var subcatFieldGroup;

    if (prefix === 'mant') {
        subcatSelect = document.getElementById(`${prefix}Item`);
        listKey = 'mantItens';
        // Para manutenção não há subcategoria, então não precisa ocultar
    } else {
        subcatSelect = document.getElementById(`${prefix}Sub`);
        listKey = `${prefix}Subcats`;
        // Encontra o field-group pai da subcategoria para ocultar/mostrar
        if (subcatSelect) {
            subcatFieldGroup = subcatSelect.closest('.field-group');
        }
    }

    var selectedCat = catSelect.value;

    // Se categoria estiver vazia ou for "todas", oculta o campo de subcategoria
    if (!selectedCat || selectedCat === '') {
        if (subcatFieldGroup) {
            subcatFieldGroup.style.display = 'none';
        }
        if (subcatSelect) {
            subcatSelect.innerHTML = '<option value="">Nenhuma opção disponível</option>';
        }
        return;
    }

    // Subcategoria removida da interface — mantém sempre oculto
    if (subcatFieldGroup) {
        subcatFieldGroup.style.display = 'none';
    }

    if (!subcatSelect) return;

    var currentSubcat = subcatSelect.value;

    // Debug: Garante que a estrutura de dados exista antes do acesso
    masterLists[listKey] = masterLists[listKey] || {};
    var subcats = masterLists[listKey][selectedCat] || [];

    // Função auxiliar para extrair valor de um item (string ou objeto)
    var extractItemValue = (item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && item.value) return item.value;
        if (item && typeof item === 'object' && item.name) return item.name;
        return String(item);
    };

    // Filtra itens deletados e malformados
    subcats = subcats.filter(i => {
        if (typeof i === 'object') {
            return i && !i.deleted && (i.value || i.name);
        }
        return i;
    });

    subcatSelect.innerHTML = subcats.length > 0 ?
        subcats.map(i => {
            const val = extractItemValue(i);
            return `<option value="${val}">${val}</option>`;
        }).join('') :
        `<option value="">Nenhuma opção disponível</option>`;

    // Tenta restaurar a seleção anterior se ela ainda existir na nova lista
    var subcatValues = subcats.map(extractItemValue);
    if (subcatValues.includes(currentSubcat)) subcatSelect.value = currentSubcat;
}

    // NOVO: Filtro de Setor (Setor NÃO afeta a Categoria no cadastro/filtro)
    function onFilterSetorChange(prefix) {
        closeFilters();
        renderCards();
    }

    // Função para fechar a janela de filtros
    function closeFilters() {
        // Fechar filtros das abas
        const dd = document.getElementById('filtersDropdown');
        if (dd) dd.style.display = 'none';

        // Fechar filtros do dashboard
        const ddDash = document.getElementById('filtersDropdownDashboard');
        if (ddDash) ddDash.style.display = 'none';
    }

    // Opções de Subcategoria/Item (FILTROS):
    // - Se Categoria = Todas: listar opções baseadas nos itens já filtrados pelos demais filtros
    // - Se Categoria selecionada: listar opções do array mestre daquela categoria
    function getItemsForFilterPrefix(prefix) {
        let items = [];
        if (prefix === 'Audit') items = audits || [];
        else if (prefix === 'Ativ') items = activities || [];
        else if (prefix === 'Mant') items = maintenances || [];
        else if (prefix === 'Doc') items = documents || [];

        // SOFT DELETE: Filtrar itens deletados
        items = items.filter(item => !item.deleted);

        // Aplicar filtro de permissões de setores
        const allowedSetores = getAllowedSetores();
        if (allowedSetores !== null) {
            items = items.filter(item => setorMatchesAny(item.setor, allowedSetores));
        }

        // Aplica filtro de finalizados se o checkbox estiver desmarcado
        const showFinalized = document.getElementById('showFinalizedCheckbox')?.checked !== false;
        if (!showFinalized) {
            items = items.filter(item => {
                const statusNormalized = normalizeStatusName(item.status || '');
                return statusNormalized !== 'concluído' && statusNormalized !== 'cancelado';
            });
        }

        return items;
    }

    function getDateStrForFilterPrefix(prefix, item) {
        if (prefix === 'Audit') return item?.dataPrevisao;
        if (prefix === 'Ativ') return item?.dataConclusao;
        if (prefix === 'Mant') return getMaintenanceCardDate(item); // Data (publicação)
        if (prefix === 'Doc') return getDocumentCardDate(item);      // Data (publicação)
        return null;
    }

    function passesDateFilter(prefix, item) {
        const dateType = document.getElementById(`f${prefix}DateType`)?.value || 'all';
        if (dateType === 'all') return true;

        const dateStr = getDateStrForFilterPrefix(prefix, item);
        if (!dateStr) return false;

        const itemDate = new Date(dateStr);
        if (Number.isNaN(itemDate.getTime())) return false;

        if (dateType === 'month') {
            const m = parseInt(document.getElementById(`f${prefix}Month`)?.value);
            const y = parseInt(document.getElementById(`f${prefix}YearForMonth`)?.value);
            if (itemDate.getMonth() !== m || itemDate.getFullYear() !== y) return false;
        } else if (dateType === 'year') {
            const y = parseInt(document.getElementById(`f${prefix}YearOnly`)?.value);
            if (itemDate.getFullYear() !== y) return false;
        } else if (dateType === 'custom') {
            const ini = document.getElementById(`f${prefix}DataIni`)?.value;
            const fim = document.getElementById(`f${prefix}DataFim`)?.value;
            if (ini && dateStr < ini) return false;
            if (fim && dateStr > fim) return false;
        }
        return true;
    }

    function passesOtherFilters(prefix, item) {
        // Backward compat: agora usa passesFilters (sem exclusões)
        return passesFilters(prefix, item, {});
    }

    function passesFilters(prefix, item, excluded = {}) {
    // 1. Setor
        if (!excluded.setor) {
            const setor = document.getElementById(`f${prefix}Setor`)?.value || '';
            if (setor && !setorMatchesAny(item.setor, setor)) return false;
        }

    // 2. Categoria
        if (!excluded.cat) {
            const cat = document.getElementById(`f${prefix}Cat`)?.value || '';
            if (cat && (item.categoria || '') !== cat) return false;
        }

    // 3. Subcategoria / Item / Equipamento
        if (!excluded.sub) {
            let subVal = '';
            if (prefix === 'Mant') subVal = document.getElementById('fMantItem')?.value || '';
            else subVal = document.getElementById(`f${prefix}Sub`)?.value || '';

            if (subVal) {
                const itemSub = (prefix === 'Mant') ? (item.item || '') : (item.subcategoria || '');
                if (itemSub !== subVal) return false;
            }
        }

    // 4. Status
        if (!excluded.status) {
            const stat = document.getElementById(`f${prefix}Status`)?.value || '';
            if (stat && (item.status || '') !== stat) return false;
        }

    // 5. Responsável (suporta multi-select: JSON array ou string simples)
    if (!excluded.responsavel) {
        const filterResp = (document.getElementById(`f${prefix}Responsavel`)?.value || '').toLowerCase().trim();
        if (filterResp) {
            const itemRespRaw = (prefix === 'Mant') ? (item.responsavelTecnico || '') : (item.responsavel || '');
            // Filtro manual: resolve IDs para nomes e compara
            const normResp = typeof normalizeResponsavel === 'function' ? normalizeResponsavel(itemRespRaw) : itemRespRaw.toLowerCase();
            if (!normResp || !normResp.includes(filterResp)) return false;
        }
    }

    // 7. Revisor (Exceto para Manutenção)
    if (prefix !== 'Mant' && !excluded.revisor) {
        const filterRev = (document.getElementById(`f${prefix}Revisor`)?.value || '').toLowerCase().trim();
        if (filterRev) {
            const revNorm = normalizeResponsavel(item.revisor || '');
            if (!revNorm || !revNorm.includes(filterRev)) return false;
        }
    }

    // 7. Marcador
        if (!excluded.marcador) {
            const marcador = document.getElementById(`f${prefix}Marcador`)?.value || '';
            if (marcador && (item.marcador || '') !== marcador) return false;
        }

    // 8. Tipo (Somente Manutenção)
        if (prefix === 'Mant' && !excluded.tipo) {
            const tipo = document.getElementById('fMantTipo')?.value || '';
            if (tipo && (item.tipo || '') !== tipo) return false;
        }

    // 9. Data
        if (!excluded.date) {
            if (!passesDateFilter(prefix, item)) return false;
        }

    // 10. Título (Lupa Search)
        if (!excluded.title) {
            if (titleSearchCardsEnabled && titleSearchCardsQuery) {
                if (!normalizeText(item.titulo || '').includes(titleSearchCardsQuery)) return false;
            }
        }

        return true;
    }

    function uniq(list) {
        return [...new Set((list || []).filter(Boolean))];
    }

    function setSelectOptions(el, placeholder, options, currentValue) {
        if (!el) return;
        const html = `<option value="">${placeholder}</option>` + options.map(v => `<option value="${v}">${v}</option>`).join('');
        el.innerHTML = html;
        if (currentValue && options.includes(currentValue)) el.value = currentValue;
        else el.value = '';
    }

    function getMasterSetores() {
        return (masterLists?.setores || []).slice();
    }
    function getMasterCategorias(prefix) {
        if (prefix === 'Audit') return (masterLists?.auditCategorias || []).slice();
        if (prefix === 'Ativ') return (masterLists?.ativCategorias || []).slice();
        if (prefix === 'Mant') return (masterLists?.mantCategorias || []).slice();
        if (prefix === 'Doc') return (masterLists?.docCategorias || []).slice();
        return [];
    }
    function getMasterStatus(prefix) {
        if (prefix === 'Audit') return (masterLists?.auditStatus || []).slice();
        if (prefix === 'Ativ') return (masterLists?.ativStatus || []).slice();
        if (prefix === 'Mant') return (masterLists?.mantStatus || []).slice();
        if (prefix === 'Doc') return (masterLists?.docStatus || []).slice();
        return [];
    }
    function getMasterMarcadores(prefix) {
        if (prefix === 'Audit') return (masterLists?.auditMarcadores || []).slice();
        if (prefix === 'Ativ') return (masterLists?.ativMarcadores || []).slice();
        if (prefix === 'Mant') return (masterLists?.mantMarcadores || []).slice();
        if (prefix === 'Doc') return (masterLists?.docMarcadores || []).slice();
        return [];
    }

    function updateFilterFacetOptions(prefix) {
        // Setor
        {
            const el = document.getElementById(`f${prefix}Setor`);
            const currentValue = el?.value || '';
            const items = getItemsForFilterPrefix(prefix).filter(it => passesFilters(prefix, it, { setor: true }));
            const present = new Set(items.flatMap(it => setorArr(it.setor)));
            const master = getMasterSetores();
            const ordered = master.filter(v => present.has(v));
            const extras = [...present].filter(v => !master.includes(v)).sort();
            setSelectOptions(el, 'Setor: Todos', [...ordered, ...extras], currentValue);
            // Exposto globalmente para o filtro de header (setor-filter.js) só listar setores com dados
            window.tabAvailableSetores = window.tabAvailableSetores || {};
            window.tabAvailableSetores[prefix] = present;
        }

        // Categoria
        {
            const el = document.getElementById(`f${prefix}Cat`);
            const currentValue = el?.value || '';
            const items = getItemsForFilterPrefix(prefix).filter(it => passesFilters(prefix, it, { cat: true }));
            const present = new Set(uniq(items.map(it => it.categoria || '').filter(Boolean)));
            const master = getMasterCategorias(prefix);
            const ordered = master.filter(v => present.has(v));
            const extras = [...present].filter(v => !master.includes(v)).sort();
            setSelectOptions(el, 'Categoria: Todas', [...ordered, ...extras], currentValue);
        }

        // Status
        {
            const el = document.getElementById(`f${prefix}Status`);
            const currentValue = el?.value || '';
            const items = getItemsForFilterPrefix(prefix).filter(it => passesFilters(prefix, it, { status: true }));
            const present = new Set(uniq(items.map(it => it.status || '').filter(Boolean)));
            const master = getMasterStatus(prefix).map(s => s.name).filter(Boolean);
            const ordered = master.filter(v => present.has(v));
            const extras = [...present].filter(v => !master.includes(v)).sort();
            setSelectOptions(el, 'Status: Todos', [...ordered, ...extras], currentValue);
        }

        // Marcador
        {
            const el = document.getElementById(`f${prefix}Marcador`);
            if (el) {
                const currentValue = el?.value || '';
                const items = getItemsForFilterPrefix(prefix).filter(it => passesFilters(prefix, it, { marcador: true }));
                const present = new Set(uniq(items.map(it => it.marcador || '').filter(Boolean)));
                const master = getMasterMarcadores(prefix).map(m => m.name).filter(Boolean);
                const ordered = master.filter(v => present.has(v));
                const extras = [...present].filter(v => !master.includes(v)).sort();
                let options = [...ordered, ...extras];

                if (currentValue && !options.includes(currentValue)) {
                    options = [currentValue, ...options];
                }

                if (options.length > 0 || currentValue) {
                    el.style.display = 'block';
                    setSelectOptions(el, 'Marcador: Todos', options, currentValue || '');
                } else {
                    el.style.display = 'none';
                    el.value = '';
                }
            }
        }

        // Tipo (Manutenção)
        if (prefix === 'Mant') {
            const el = document.getElementById('fMantTipo');
            const currentValue = el?.value || '';
            const items = getItemsForFilterPrefix(prefix).filter(it => passesFilters(prefix, it, { tipo: true }));
            const present = new Set(uniq(items.map(it => it.tipo || '').filter(Boolean)));
            const master = (masterLists?.mantTipos || []).slice();
            const ordered = master.filter(v => present.has(v));
            const extras = [...present].filter(v => !master.includes(v)).sort();
            setSelectOptions(el, 'Tipo: Todos', [...ordered, ...extras], currentValue);
        }

    // Responsável - mostra apenas dos cards visíveis
    {
        const el = document.getElementById(`f${prefix}Responsavel`);
        if (el) {
            const currentValue = el?.value || '';
            const items = getItemsForFilterPrefix(prefix).filter(it => passesFilters(prefix, it, { responsavel: true }));
            const availableResponsaveis = new Set();
            items.forEach(item => {
                if (prefix === 'Mant') {
                    const respTec = normalizeResponsavel(item.responsavelTecnico);
                    if (respTec) availableResponsaveis.add(respTec);
                } else if (item.responsavel) {
                    const resp = normalizeResponsavel(item.responsavel);
                    if (resp) availableResponsaveis.add(resp);
                }
            });
            const realNames = new Set();
            [...availableResponsaveis].forEach(normalized => {
                const user = users?.find(u => u.name && u.name.toLowerCase() === normalized);
                if (user) {
                    realNames.add(user.name);
                } else {
                    const resp = masterLists.responsaveis?.find(r => r && r.toLowerCase() === normalized);
                    if (resp) realNames.add(resp);
                    else realNames.add(normalized);
                }
            });
            const sorted = [...realNames].sort((a, b) => a.localeCompare(b));
            const html = '<option value="">Responsável: Todos</option>' + sorted.map(r => `<option value="${r}">${r}</option>`).join('');
            el.innerHTML = html;
            el.value = currentValue;
            el.style.display = 'block';
        }
    }

    // Revisor - mostra apenas dos cards visíveis (CORRIGIDO)
    if (prefix !== 'Mant') {
        const revEl = document.getElementById(`f${prefix}Revisor`);
        if (revEl) {
            const currentRevValue = revEl.value || '';
            const items = getItemsForFilterPrefix(prefix).filter(it => passesFilters(prefix, it, { revisor: true }));
            const availableRevisores = new Set();
            items.forEach(item => {
                if (item.revisor) {
                    const rev = normalizeResponsavel(item.revisor);
                    if (rev) availableRevisores.add(rev);
                }
            });
            const realNames = new Set();
            [...availableRevisores].forEach(normalized => {
                const user = users?.find(u => u.name && u.name.toLowerCase() === normalized);
                if (user) {
                    realNames.add(user.name);
                } else {
                    const resp = masterLists.responsaveis?.find(r => r && r.toLowerCase() === normalized);
                    if (resp) realNames.add(resp);
                    else realNames.add(normalized);
                }
            });
            const sorted = [...realNames].sort((a, b) => a.localeCompare(b));
            const html = '<option value="">Revisor: Todos</option>' + sorted.map(r => `<option value="${r}">${r}</option>`).join('');
            revEl.innerHTML = html;
            revEl.value = currentRevValue;
            revEl.style.display = 'block';
        }
    }

    // Subcategoria/Item
        updateFilterSubcatOptions(prefix);
    }

    function updateFilterSubcatOptions(prefix) {
        const catSelect = document.getElementById(`f${prefix}Cat`);
        if (!catSelect) return;

        let subcatSelect;
        let listKey;
        let label;
        let valueGetter;

        if (prefix === 'Mant') {
            subcatSelect = document.getElementById(`f${prefix}Item`);
            listKey = 'mantItens';
            label = 'Item: Todos';
            valueGetter = (it) => it.item;
        } else {
            subcatSelect = document.getElementById(`f${prefix}Sub`);
            listKey = `${prefix.toLowerCase()}Subcats`;
            label = 'Subcategoria: Todas';
            valueGetter = (it) => it.subcategoria;
        }
        if (!subcatSelect) return;

        const selectedCat = catSelect.value;
        const currentSubcat = subcatSelect.value;

        let options = [];

        // Base: itens possíveis com os demais filtros (exclui o próprio filtro de subcat/item)
        const itemsPossible = getItemsForFilterPrefix(prefix).filter(it => passesFilters(prefix, it, { sub: true }));
        const present = new Set(uniq(itemsPossible.map(valueGetter)).filter(Boolean));

        if (selectedCat !== "") {
            // Categoria selecionada => usa array mestre daquela categoria,
            // porém oculta itens/subcats que não possuem cards visíveis com os demais filtros
            const masterArr = (masterLists?.[listKey]?.[selectedCat] || []).slice();
            const ordered = masterArr.filter(v => present.has(v));
            const extras = [...present].filter(v => !masterArr.includes(v)).sort();
            options = [...ordered, ...extras];
        } else {
            // Categoria = Todas => opções baseadas nos itens filtrados pelos demais filtros
            options = [...present].sort();
        }

        subcatSelect.innerHTML = `<option value="">${label}</option>` + options.map(v => `<option value="${v}">${v}</option>`).join('');

        // preserva seleção se ainda existir, senão volta para "Todos"
        if (options.includes(currentSubcat)) subcatSelect.value = currentSubcat;
        else subcatSelect.value = "";
    }

    // Funções de atualização em cascata para FILTROS
    function onFilterCategoryChange(prefix) {
        const catSelect = document.getElementById(`f${prefix}Cat`);
        if (!catSelect) return;

        updateFilterSubcatOptions(prefix);
        closeFilters();
        renderCards();
    }

    // Função de cálculo para Manutenção e Documentos (Periodicidade)
    function calculateNextDate(prefix = 'mant') {
        let ultima, intervaloId, proximaDisplayId, intervalValue;

        if (prefix === 'mant') {
            ultima = document.getElementById('mantUltima').value;
            intervaloId = 'mantIntervalo';
            proximaDisplayId = 'mantProxima';
            const intervalStr = (document.getElementById(intervaloId).value || '').trim();
            intervalValue = intervalStr === '' ? null : parseInt(intervalStr);
        } else {
            return;
        }

        if (!ultima) return;
        if (!Number.isFinite(intervalValue) || intervalValue <= 0) {
            document.getElementById(proximaDisplayId).textContent = 'N/A';
            return;
        }
        if (ultima) {
            const next = new Date(ultima);
            next.setDate(next.getDate() + intervalValue);
            const nextStr = next.toISOString().split('T')[0];
            document.getElementById(proximaDisplayId).textContent = formatBR(nextStr);
        }
    }
