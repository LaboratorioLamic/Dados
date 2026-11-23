// === FILTROS DROPDOWN ===

    // --- Dropdown de Filtros (sincroniza com os selects reais das abas) ---
    function toggleFiltersDropdown() {
        const dd = document.getElementById('filtersDropdown');
        if (!dd) return;
        const isOpen = dd.style.display === 'block';
        if (isOpen) {
            dd.style.display = 'none';
        } else {
            populateFiltersDropdown();
            dd.style.display = 'block';
        }
    }

    function populateFiltersDropdown() {
        const map = { 'auditoria':'Audit', 'atividades':'Ativ', 'manutencao':'Mant', 'documentos':'Doc' };
        const prefix = map[currentTab] || 'Audit';

        const ids = {
            setor: `f${prefix}Setor`,
            categoria: `f${prefix}Cat`,
            subcategoria: prefix === 'Mant' ? `f${prefix}Item` : `f${prefix}Sub`,
            marcador: `f${prefix}Marcador`
        };

        // Copia opções e valor dos selects reais para os selects do dropdown
        Object.entries(ids).forEach(([key, realId]) => {
            const realEl = document.getElementById(realId);
            const dropEl = document.getElementById('drop' + (key === 'categoria' ? 'Cat' : (key === 'subcategoria' ? 'Sub' : key.charAt(0).toUpperCase() + key.slice(1))));
            if (!dropEl) return;
            if (realEl) {
                dropEl.innerHTML = realEl.innerHTML;
                try { dropEl.value = realEl.value; } catch(_) { dropEl.selectedIndex = 0; }
            } else {
                dropEl.innerHTML = '<option value="">Nenhuma opção</option>';
                dropEl.value = '';
            }
        });
    }

    function onDropdownFilterChange(type) {
        const map = { 'auditoria':'Audit', 'atividades':'Ativ', 'manutencao':'Mant', 'documentos':'Doc' };
        const prefix = map[currentTab] || 'Audit';

        const realIds = {
            setor: `f${prefix}Setor`,
            categoria: `f${prefix}Cat`,
            subcategoria: prefix === 'Mant' ? `f${prefix}Item` : `f${prefix}Sub`,
            marcador: `f${prefix}Marcador`
        };

        const dropIdMap = { setor: 'dropSetor', categoria: 'dropCat', subcategoria: 'dropSub', marcador: 'dropMarcador' };
        const dropEl = document.getElementById(dropIdMap[type]);
        const realEl = document.getElementById(realIds[type]);
        if (!dropEl || !realEl) return;

        // Atualiza o select real e re-renderiza
        try { realEl.value = dropEl.value; } catch(_) { realEl.selectedIndex = 0; }

        // Se a categoria mudou, atualiza subcategorias reais antes de repopular o dropdown
        if (type === 'categoria') {
            // chama a função de mudança de categoria para reconstruir subcategoria real
            const modalPrefix = prefix.toLowerCase(); // 'audit','ativ','mant','doc'
            try { onCategoryChange(modalPrefix); } catch (_) {}
            // Re-popula o dropdown para refletir novas opções de sub
            populateFiltersDropdown();
        }

        closeFilters();
        saveFiltersToFirebase();
        renderCards();
    }

    // ── Dropdown de Área do Dashboard ────────────────────────────────────
    var _dashAreaTabMap = { ativ: 'atividades', audit: 'auditoria', doc: 'documentos' };

    window.applyDashAreaPermissions = function() {
        const allowed = (typeof userAllowedTabs === 'function') ? userAllowedTabs() : null;
        const chips = document.querySelectorAll('.fbar-area-chip');
        let activeStillAllowed = false;
        let firstAllowed = null;
        chips.forEach(chip => {
            const tab = _dashAreaTabMap[chip.dataset.value];
            const permitted = !allowed || allowed.includes(tab);
            chip.style.display = permitted ? '' : 'none';
            if (permitted && !firstAllowed) firstAllowed = chip;
            if (permitted && chip.classList.contains('fbar-area-chip--active')) activeStillAllowed = true;
        });
        if (!activeStillAllowed && firstAllowed) {
            selectDashArea(firstAllowed.dataset.value, firstAllowed.textContent.trim());
        }
    };

    window.toggleDashAreaDropdown = function() {
        const dd = document.getElementById('fbarAreaDropdown');
        if (!dd) return;
        const isOpen = dd.style.display === 'flex' || dd.style.display === 'block';
        if (!isOpen) applyDashAreaPermissions();
        dd.style.display = isOpen ? 'none' : 'flex';
        if (!isOpen) {
            // Fecha ao clicar fora
            setTimeout(() => {
                function _closeOnOut(e) {
                    const wrap = document.getElementById('fbarAreaBtn')?.closest('.fbar-area-wrap');
                    if (wrap && !wrap.contains(e.target)) {
                        dd.style.display = 'none';
                        document.removeEventListener('click', _closeOnOut);
                    }
                }
                document.addEventListener('click', _closeOnOut);
            }, 0);
        }
    };

    var _dashAreaIconMap = {
        ativ:  'fa-tasks',
        audit: 'fa-clipboard-check',
        doc:   'fa-file-lines'
    };

    function _updateDashAreaBtnIcon(value) {
        const btn = document.getElementById('fbarAreaBtn');
        if (!btn) return;
        const iconEl = btn.querySelector('i:first-child');
        if (!iconEl) return;
        const cls = _dashAreaIconMap[value] || 'fa-layer-group';
        iconEl.className = 'fas ' + cls;
    }

    window.selectDashArea = function(value, label) {
        // Atualiza selects ocultos
        const fDashArea = document.getElementById('fDashArea');
        if (fDashArea) { fDashArea.value = value; }
        const dropDashArea = document.getElementById('dropDashArea');
        if (dropDashArea) { dropDashArea.value = value; }

        // Atualiza label do botão
        const lblEl = document.getElementById('fbarAreaLabel');
        if (lblEl) lblEl.textContent = label;

        // Atualiza ícone do botão
        _updateDashAreaBtnIcon(value);

        // Atualiza chip ativo
        document.querySelectorAll('.fbar-area-chip').forEach(c => {
            c.classList.toggle('fbar-area-chip--active', c.dataset.value === value);
        });

        // Fecha dropdown
        const dd = document.getElementById('fbarAreaDropdown');
        if (dd) dd.style.display = 'none';

        // Dispara filtro
        onFilterDashboardChange();
    };

    // Sincroniza o botão de área com o valor atual de fDashArea
    window.syncDashAreaBtn = function() {
        const areaEl = document.getElementById('fDashArea');
        const val = areaEl ? areaEl.value : 'ativ';
        const labelMap = { ativ: 'Gestão de Atividades', audit: 'Rotinas', doc: 'Documentos', '': 'Gestão de Atividades' };
        const lbl = labelMap[val] || 'Gestão de Atividades';
        const effectiveVal = val || 'ativ';

        const lblEl = document.getElementById('fbarAreaLabel');
        if (lblEl) lblEl.textContent = lbl;

        _updateDashAreaBtnIcon(effectiveVal);

        document.querySelectorAll('.fbar-area-chip').forEach(c => {
            c.classList.toggle('fbar-area-chip--active', c.dataset.value === effectiveVal);
        });
    };

    function toggleFiltersDropdownDashboard() {
        const dd = document.getElementById('filtersDropdownDashboard');
        if (!dd) return;
        const isOpen = dd.style.display === 'block';
        if (isOpen) {
            dd.style.display = 'none';
        } else {
            populateFiltersDropdownDashboard();
            dd.style.display = 'block';
        }
    }

    function populateFiltersDropdownDashboard() {
        const map = {
            categoria: { real: 'fDashCat', drop: 'dropDashCatAdv' }
        };
        Object.values(map).forEach(({ real, drop }) => {
            const realEl = document.getElementById(real);
            const dropEl = document.getElementById(drop);
            if (!dropEl || !realEl) return;
            dropEl.innerHTML = realEl.innerHTML;
            try { dropEl.value = realEl.value; } catch(_) { dropEl.selectedIndex = 0; }
        });
    }

    function onDropdownFilterChangeDashboard(type) {
        const map = {
            area:      { real: 'fDashArea', drop: 'dropDashArea'    },
            categoria: { real: 'fDashCat',  drop: 'dropDashCatAdv'  }
        };
        const entry = map[type];
        if (!entry) return;
        const dropEl = document.getElementById(entry.drop);
        const realEl = document.getElementById(entry.real);
        if (!dropEl || !realEl) return;
        try { realEl.value = dropEl.value; } catch(_) { realEl.selectedIndex = 0; }
        if (type === 'categoria') populateFiltersDropdownDashboard();
        closeFilters();
        onFilterDashboardChange();
    }

    function updateDashboardSubcategorias() {
        const fDashArea = document.getElementById('fDashArea')?.value || '';
        const fDashCat = document.getElementById('fDashCat')?.value || '';
        const fDashSub = document.getElementById('fDashSub');
        if (!fDashSub) return;

        // Limpa subcategorias
        fDashSub.innerHTML = '<option value="">Subcategoria: Todas</option>';

        if (!fDashCat) return;

        // Baseado no tipo de área, obtém as subcategorias
        let subcategories = [];

        // Se temos a área definida, filtra por ela
        if (fDashArea === 'mant') {
            // Para manutenção, mostra itens
            subcategories = (masterLists.mantItens || []).filter(s => s.categoria === fDashCat);
        } else {
            // Para outras áreas, mostra subcategorias
            subcategories = (masterLists.subcategorias || []).filter(s => s.categoria === fDashCat);
        }

        subcategories.forEach(sub => {
            const opt = document.createElement('option');
            opt.value = sub.subcategoria || sub.item || '';
            opt.textContent = sub.subcategoria || sub.item || '';
            fDashSub.appendChild(opt);
        });
    }
