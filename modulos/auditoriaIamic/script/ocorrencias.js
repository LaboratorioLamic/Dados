// =========================================================================
//  GESTÃO DE N/C — OCORRÊNCIAS
//  Aba independente: tabela paginada, filtros, tipos (como sub-abas),
//  e gestão de listas (tipos, setores, categorias, motivos).
//  Persistência: array global `ocorrencias` (Firebase) + masterLists.
// =========================================================================
(function () {
    'use strict';

    // ── Estado global persistido (declarado aqui se ainda não existir) ──
    if (typeof window.ocorrencias === 'undefined') window.ocorrencias = [];

    // ── Estado de UI (efêmero) ──
    var ocCurrentTipoId = null;       // tipo (sub-aba) ativo
    var ocPage = 1;
    var ocPerPage = 20;
    var ocSort = { col: 'data', dir: 'desc' };   // padrão: data, mais recente primeiro
    var ocSearch = '';
    var ocMyMode = localStorage.getItem('ocMyMode') || 'responsavel';     // 'responsavel' | 'all'
    var ocEditingId = null;

    // Filtros adicionais
    var ocCatFilter = '';             // categoria selecionada (nome) — '' = todas
    var ocSetorFilter = [];           // setores selecionados (vazio = todos)
    var ocDateFilter = { type: 'all', month: null, year: null, ini: '', fim: '' };
    var ocColabList = [];             // colaboradores importados do Sheets
    var ocColabLoaded = false;
    var ocColabLoading = false;

    var COLAB_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbwkz5S9wF_r48owBYBAQy1XFKWOI6zcyWwMWNlKD3kHNCXb6SDPjiYDarLZjBupDjL38A/exec';

    // Estado do modal de gestão genérico
    var ocManagerKind = null;         // 'tipos' | 'setores' | 'categorias' | 'motivos'

    // ── Confirm modal moderno ──────────────────────────────────────────
    function ocConfirm(opts, callback) {
        // opts: { title, message, confirmLabel, confirmClass, icon, requireText }
        var title        = opts.title        || 'Confirmar';
        var message      = opts.message      || '';
        var confirmLabel = opts.confirmLabel || 'Confirmar';
        var confirmClass = opts.confirmClass || 'oc-confirm-btn-danger';
        var icon         = opts.icon         || 'fa-triangle-exclamation';
        var requireText  = opts.requireText  || null;

        var el = document.getElementById('ocConfirmModal');
        if (!el) {
            el = document.createElement('div');
            el.id = 'ocConfirmModal';
            document.body.appendChild(el);
        }
        var inputHtml = requireText
            ? '<input type="text" class="oc-confirm-input" id="ocConfirmInput" autocomplete="off" placeholder="Digite ' + esc(requireText) + '">'
            : '';
        el.innerHTML =
            '<div class="oc-confirm-backdrop" id="ocConfirmBackdrop">' +
                '<div class="oc-confirm-box">' +
                    '<div class="oc-confirm-icon-wrap"><i class="fas ' + esc(icon) + ' oc-confirm-icon"></i></div>' +
                    '<div class="oc-confirm-title">' + esc(title) + '</div>' +
                    '<div class="oc-confirm-msg">' + esc(message) + '</div>' +
                    inputHtml +
                    '<div class="oc-confirm-actions">' +
                        '<button class="oc-confirm-btn-cancel" onclick="document.getElementById(\'ocConfirmModal\').innerHTML=\'\'">Cancelar</button>' +
                        '<button class="' + esc(confirmClass) + '" id="ocConfirmOkBtn"' + (requireText ? ' disabled' : '') + '>' + esc(confirmLabel) + '</button>' +
                    '</div>' +
                '</div>' +
            '</div>';
        var okBtn = document.getElementById('ocConfirmOkBtn');
        if (requireText) {
            var input = document.getElementById('ocConfirmInput');
            input.addEventListener('input', function () {
                okBtn.disabled = input.value.trim().toUpperCase() !== requireText.toUpperCase();
            });
            setTimeout(function () { input.focus(); }, 50);
        }
        okBtn.onclick = function () {
            if (okBtn.disabled) return;
            el.innerHTML = '';
            callback();
        };
        el.querySelector('.oc-confirm-backdrop').addEventListener('click', function (e) {
            if (e.target === e.currentTarget) el.innerHTML = '';
        });
    }

    // ── Helpers ────────────────────────────────────────────────────────
    function uid() { return 'oc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function fmtDate(d) {
        if (!d) return '—';
        if (typeof formatBR === 'function') return formatBR(d);
        var p = String(d).split('-'); return p.length === 3 ? (p[2] + '/' + p[1] + '/' + p[0]) : d;
    }
    function fmtDateTime(iso) {
        if (!iso) return '';
        try {
            var dt = new Date(iso);
            var dd = String(dt.getDate()).padStart(2, '0');
            var mm = String(dt.getMonth() + 1).padStart(2, '0');
            var yy = String(dt.getFullYear()).slice(-2);
            var hh = String(dt.getHours()).padStart(2, '0');
            var mi = String(dt.getMinutes()).padStart(2, '0');
            return dd + '/' + mm + '/' + yy + ' ' + hh + ':' + mi;
        } catch (e) { return ''; }
    }
    function toast(msg, type) {
        if (typeof window.showToast === 'function') window.showToast(msg, type || 'info');
    }
    function canEdit() {
        return typeof userCanEditCards !== 'function' || userCanEditCards();
    }
    // "Gerenciar motivos" = Total também libera gerenciar categorias
    // "Apenas Motivo" libera só motivos; "Não" bloqueia ambos
    function canManageMotivos(kind) {
        if (typeof currentuser === 'undefined' || !currentuser) return false;
        if (typeof userIsAdmin === 'function' && userIsAdmin()) return true;
        var p = currentuser.canManageMotivos || 'total';
        if (p === 'total') return true;
        return kind === 'motivos' && p === 'motivo';
    }
    function canManage(kind) {
        return typeof userCanManageLists !== 'function' || userCanManageLists(kind === 'setores' ? 'areas' : 'tipos');
    }
    function meName() {
        if (typeof currentuser === 'undefined' || !currentuser) return '';
        return String(currentuser.name || currentuser.user || '').trim();
    }
    function canEditResponsavel() {
        return typeof userOcPerm === 'function' && userOcPerm() === 'total';
    }
    function getUserNames() {
        var u = typeof users !== 'undefined' ? users : [];
        return u.filter(function (x) { return x && x.name; }).map(function (x) { return x.name; })
            .sort(function (a, b) { return a.localeCompare(b, 'pt'); });
    }
    window.ocResponsavelInput = function () {
        if (!canEditResponsavel()) return;
        var q = (document.getElementById('ocFResponsavel').value || '').trim().toLowerCase();
        var list = getUserNames().filter(function (s) { return !q || s.toLowerCase().indexOf(q) !== -1; }).slice(0, 30);
        renderAC('ocResponsavelDropdown', list, function (name) {
            document.getElementById('ocFResponsavel').value = name;
            document.getElementById('ocResponsavelDropdown').classList.remove('open');
        }, false);
    };
    function persist() {
        if (typeof saveAll === 'function') saveAll();
    }

    // ── Acesso às listas em masterLists ────────────────────────────────
    function ensureLists() {
        if (typeof masterLists === 'undefined' || !masterLists) return;
        if (!Array.isArray(masterLists.ncTipos)) masterLists.ncTipos = [];
        masterLists.ncTipos.sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'pt'); });
        // ncCategorias agora é um objeto { [tipoId]: [{id,name},...] }
        // Migração automática: se for array global, converte para objeto vazio
        if (Array.isArray(masterLists.ncCategorias)) masterLists.ncCategorias = {};
        if (typeof masterLists.ncCategorias !== 'object' || masterLists.ncCategorias === null) masterLists.ncCategorias = {};
        // ncMotivos: { [catId]: [{id,name},...] }
        if (typeof masterLists.ncMotivos !== 'object' || masterLists.ncMotivos === null || Array.isArray(masterLists.ncMotivos)) masterLists.ncMotivos = {};
        if (!Array.isArray(masterLists.setores)) masterLists.setores = [];
    }
    function sortByName(arr) { arr.sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'pt'); }); return arr; }
    function getTipos() { ensureLists(); return masterLists.ncTipos; }
    // Retorna categorias do tipo ativo (ou do tipoId fornecido), em ordem alfabética
    function getCategorias(tipoId) {
        ensureLists();
        var tid = tipoId !== undefined ? tipoId : ocCurrentTipoId;
        if (!tid) {
            // Sem tipo selecionado: retorna todas as categorias de todos os tipos (para filtros)
            var all = [];
            Object.values(masterLists.ncCategorias).forEach(function(arr) { if (Array.isArray(arr)) all = all.concat(arr); });
            return sortByName(all);
        }
        if (!Array.isArray(masterLists.ncCategorias[tid])) masterLists.ncCategorias[tid] = [];
        return masterLists.ncCategorias[tid];
    }
    function getSetores() { ensureLists(); return masterLists.setores.slice().sort(function(a,b){ return String(a).localeCompare(String(b),'pt'); }); }
    function getMotivos(catId) {
        ensureLists();
        if (!catId) return [];
        if (!Array.isArray(masterLists.ncMotivos[catId])) masterLists.ncMotivos[catId] = [];
        return masterLists.ncMotivos[catId];
    }
    // Área escolhida no formulário (drawer); fallback para a área do filtro
    function formTipoId() {
        var s = document.getElementById('ocFTipo');
        return (s && s.value) ? s.value : null;
    }
    // ── Popover pesquisável de Área (formulário) ──
    var ocAreaOptions = [];   // áreas disponíveis no formulário atual
    var ocAreaActive = -1;    // índice destacado via teclado
    var ocAreaShown = [];     // lista filtrada exibida
    function fillFormTipoSelect(selectedId) {
        var tipos = getAllowedTipos().slice();
        // Mantém a área atual da ocorrência mesmo que o usuário não tenha acesso a ela
        if (selectedId && !tipos.some(function (t) { return t.id === selectedId; })) {
            var cur = getTipos().find(function (t) { return t.id === selectedId; });
            if (cur) tipos.push(cur);
        }
        ocAreaOptions = tipos;
        setFormArea(selectedId || '', true);
    }
    function setFormArea(id, silent) {
        var h = document.getElementById('ocFTipo');
        var txt = document.getElementById('ocFTipoText');
        if (!h || !txt) return;
        var prev = h.value;
        var t = ocAreaOptions.find(function (x) { return x.id === id; });
        h.value = t ? t.id : '';
        txt.value = t ? t.name : '';
        if (!silent && prev !== h.value) window.ocFormTipoChanged();
    }
    function renderAreaPopover(q) {
        var dd = document.getElementById('ocAreaDropdown');
        if (!dd) return;
        var cur = document.getElementById('ocFTipo').value;
        q = (q || '').trim().toLowerCase();
        ocAreaShown = ocAreaOptions.filter(function (t) { return !q || String(t.name).toLowerCase().indexOf(q) !== -1; });
        if (!ocAreaShown.length) {
            dd.innerHTML = '<div class="oc-ac-empty"><i class="fas fa-magnifying-glass"></i> Nenhuma área encontrada</div>';
        } else {
            dd.innerHTML = ocAreaShown.map(function (t, i) {
                var cls = 'oc-ac-opt oc-area-opt' + (t.id === cur ? ' selected' : '') + (i === ocAreaActive ? ' active' : '');
                return '<div class="' + cls + '" data-i="' + i + '"><i class="fas fa-tag"></i><span>' + esc(t.name) + '</span>' +
                    (t.id === cur ? '<i class="fas fa-check oc-area-check"></i>' : '') + '</div>';
            }).join('');
            Array.prototype.forEach.call(dd.querySelectorAll('.oc-area-opt'), function (el) {
                el.addEventListener('mousedown', function (e) {
                    e.preventDefault();
                    pickArea(ocAreaShown[parseInt(el.getAttribute('data-i'), 10)]);
                });
            });
        }
        dd.classList.add('open');
    }
    function pickArea(t) {
        if (!t) return;
        setFormArea(t.id, false);
        document.getElementById('ocAreaDropdown').classList.remove('open');
        document.getElementById('ocFTipoText').blur();
    }
    window.ocAreaInput = function (typing) {
        var txt = document.getElementById('ocFTipoText');
        ocAreaActive = -1;
        if (!typing) txt.select();   // ao focar mostra todas e permite digitar por cima
        renderAreaPopover(typing ? txt.value : '');
    };
    window.ocAreaBlur = function () {
        document.getElementById('ocAreaDropdown').classList.remove('open');
        // Texto livre não vale: volta ao nome da área selecionada
        setFormArea(document.getElementById('ocFTipo').value, true);
    };
    window.ocAreaKey = function (e) {
        var n = ocAreaShown.length;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!n) return;
            ocAreaActive = e.key === 'ArrowDown' ? (ocAreaActive + 1) % n : (ocAreaActive - 1 + n) % n;
            renderAreaPopover(document.getElementById('ocFTipoText').value);
            var a = document.querySelector('#ocAreaDropdown .oc-area-opt.active');
            if (a) a.scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter') {
            e.preventDefault();
            pickArea(ocAreaShown[ocAreaActive >= 0 ? ocAreaActive : 0]);
        } else if (e.key === 'Escape') {
            e.target.blur();
        }
    };
    window.ocFormTipoChanged = function () {
        document.getElementById('ocFCategoria').value = '';
        document.getElementById('ocFMotivo').value = '';
        document.getElementById('ocMotivoWrap').style.display = 'none';
        ocCloseAllDropdowns();
    };
    function catByName(name, tipoId) {
        if (tipoId === undefined) tipoId = formTipoId();
        var n = String(name || '').trim().toLowerCase();
        return getCategorias(tipoId !== undefined ? tipoId : ocCurrentTipoId).find(function (c) { return String(c.name).trim().toLowerCase() === n; }) || null;
    }
    function catById(id, tipoId) { return getCategorias(tipoId !== undefined ? tipoId : ocCurrentTipoId).find(function (c) { return c.id === id; }) || null; }

    // =====================================================================
    //  RENDER — Sub-abas de Tipo (dropdown)
    // =====================================================================
    function getAllowedTipos() {
        var all = getTipos().slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'pt'); });
        var allowed = (typeof window.userAllowedTiposOc === 'function') ? window.userAllowedTiposOc() : null;
        if (!allowed) return all;
        return all.filter(function(t) { return allowed.includes(t.id); });
    }

    function renderTipoDropdown() {
        var dd = document.getElementById('ocTypeDropdown');
        if (!dd) return;
        var tipos = getAllowedTipos();
        var html = '';
        if (tipos.length === 0) {
            html += '<div class="oc-type-empty">Nenhum tipo cadastrado.<br>Use o botão de edição ao lado.</div>';
        } else {
            tipos.forEach(function (t) {
                html += '<button class="oc-type-option' + (ocCurrentTipoId === t.id ? ' active' : '') +
                    '" onclick="ocSelectTipo(\'' + t.id + '\')"><i class="fas fa-tag"></i> ' + esc(t.name) + '</button>';
            });
        }
        dd.innerHTML = html;
    }
    function updateTipoLabel() {
        var lbl = document.getElementById('ocTypeLabel');
        if (!lbl) return;
        var t = ocCurrentTipoId ? getTipos().find(function (x) { return x.id === ocCurrentTipoId; }) : null;
        lbl.textContent = t ? t.name : 'Selecionar Área';
    }
    // Garante que ocCurrentTipoId aponta para um tipo válido; se inválido, volta para nenhum (Selecionar Área)
    function ensureValidTipo() {
        var tipos = getAllowedTipos();
        if (!tipos.length) { ocCurrentTipoId = null; return; }
        var exists = tipos.some(function(t) { return t.id === ocCurrentTipoId; });
        if (!exists) ocCurrentTipoId = null;   // padrão: nenhuma área selecionada
    }

    // No mobile, a barra de filtros tem scroll horizontal — dropdowns absolutos
    // ficariam presos dentro desse scroll. Promove para position:fixed e calcula
    // a posição via JS para flutuar livremente sobre a página.
    function _ocPositionDropdownMobile(btn, dd) {
        if (!btn || !dd) return;
        if (window.innerWidth > 768) {
            dd.classList.remove('oc-dd-fixed');
            dd.style.top = ''; dd.style.left = ''; dd.style.right = '';
            return;
        }
        var rect = btn.getBoundingClientRect();
        dd.classList.add('oc-dd-fixed');
        dd.style.top = (rect.bottom + 8) + 'px';
        var ddWidth = dd.offsetWidth || 220;
        var left = rect.right - ddWidth;
        if (left < 8) left = 8;
        if (left + ddWidth > window.innerWidth - 8) left = window.innerWidth - 8 - ddWidth;
        dd.style.left = left + 'px';
        dd.style.right = 'auto';
    }

    window.ocToggleTypeDropdown = function () {
        var dd = document.getElementById('ocTypeDropdown');
        var btn = document.getElementById('ocTypeBtn');
        if (!dd) return;
        var open = dd.classList.contains('open');
        ocCloseAllDropdowns();
        if (!open) { renderTipoDropdown(); dd.classList.add('open'); _ocPositionDropdownMobile(btn, dd); }
    };
    window.ocSelectTipo = function (id) {
        ocCurrentTipoId = id;
        ensureValidTipo();
        ocPage = 1;
        document.getElementById('ocTypeDropdown').classList.remove('open');
        updateTipoLabel();
        renderTable();
    };

    window.ocToggleMyDropdown = function () {
        var dd = document.getElementById('ocMyDropdown');
        var btn = document.getElementById('ocMyBtn');
        if (!dd) return;
        var open = dd.classList.contains('open');
        ocCloseAllDropdowns();
        if (!open) { dd.classList.add('open'); _ocPositionDropdownMobile(btn, dd); }
    };
    window.ocSetMyMode = function (mode) {
        if (mode === 'all' && !ocCanViewAll()) mode = 'responsavel';
        ocMyMode = mode;
        localStorage.setItem('ocMyMode', mode);
        ocPage = 1;
        document.getElementById('ocMyResp').classList.toggle('active', mode === 'responsavel');
        document.getElementById('ocMyAll').classList.toggle('active', mode === 'all');
        var btn = document.getElementById('ocMyBtn');
        var lbl = document.getElementById('ocMyLabel');
        if (mode === 'all') { lbl.textContent = 'Visualizar todos'; btn.classList.remove('active'); }
        else { lbl.textContent = 'Minhas ocorrências'; btn.classList.add('active'); }
        document.getElementById('ocMyDropdown').classList.remove('open');
        renderTable();
    };

    function ocCloseAllDropdowns() {
        ['ocTypeDropdown', 'ocMyDropdown', 'ocColabDropdown', 'ocCategoriaDropdown', 'ocMotivoDropdown', 'ocCatFilterDropdown', 'ocResponsavelDropdown']
            .forEach(function (id) {
                var el = document.getElementById(id);
                if (!el) return;
                el.classList.remove('open');
                el.classList.remove('oc-dd-fixed');
                el.style.top = ''; el.style.left = ''; el.style.right = '';
            });
    }

    window.ocOnSearch = function () {
        ocSearch = (document.getElementById('ocSearchInput').value || '').trim().toLowerCase();
        ocPage = 1;
        renderTable();
    };
    window.ocToggleSearch = function () {
        var wrap = document.getElementById('ocSearchWrap');
        var input = document.getElementById('ocSearchInput');
        var btn = document.getElementById('ocSearchToggleBtn');
        if (!wrap || !input) return;
        var show = wrap.style.display === 'none';
        wrap.style.display = show ? '' : 'none';
        if (btn) btn.classList.toggle('active', show);
        if (show) input.focus();
        else { input.value = ''; ocSearch = ''; ocPage = 1; renderTable(); }
    };
    window.ocClearFilters = function () {
        ocSearch = '';
        var si = document.getElementById('ocSearchInput'); if (si) si.value = '';
        var sw = document.getElementById('ocSearchWrap'); if (sw) sw.style.display = 'none';
        var sb = document.getElementById('ocSearchToggleBtn'); if (sb) sb.classList.remove('active');
        ocCurrentTipoId = null;
        ensureValidTipo();
        ocCatFilter = '';
        ocSetorFilter = [];
        ocDateFilter = { type: 'all', month: null, year: null, ini: '', fim: '' };
        var cfb = document.getElementById('ocCatFilterBtn'); if (cfb) cfb.classList.remove('active');
        if (typeof updateSetorHeadLabel === 'function') updateSetorHeadLabel();
        if (typeof updateDateHeadLabel === 'function') updateDateHeadLabel();
        ocSetMyMode('responsavel');
        ocSort = { col: 'data', dir: 'desc' };
        ocPage = 1;
        updateTipoLabel();
        renderTable();
    };

    window.ocSort = function (col) {
        if (ocSort.col === col) ocSort.dir = (ocSort.dir === 'asc' ? 'desc' : 'asc');
        else { ocSort.col = col; ocSort.dir = (col === 'data' ? 'desc' : 'asc'); }
        renderTable();
    };

    // =====================================================================
    //  RENDER — Tabela
    // =====================================================================
    function getFiltered(skipSetor) {
        var arr = (window.ocorrencias || []).filter(function (o) { return o && !o.deleted; });

        // Restrição de tipos permitidos para o usuário
        var allowedTipos = (typeof window.userAllowedTiposOc === 'function') ? window.userAllowedTiposOc() : null;
        if (allowedTipos) arr = arr.filter(function (o) { return allowedTipos.includes(o.tipoId); });

        if (ocCurrentTipoId !== null) arr = arr.filter(function (o) { return o.tipoId === ocCurrentTipoId; });

        if (ocMyMode === 'responsavel' || !ocCanViewAll()) {
            var me = meName().toLowerCase();
            arr = arr.filter(function (o) { return String(o.responsavel || '').trim().toLowerCase() === me; });
        }

        // Filtro por categoria
        if (ocCatFilter) {
            var cf = ocCatFilter.trim().toLowerCase();
            arr = arr.filter(function (o) { return String(o.categoria || '').trim().toLowerCase() === cf; });
        }

        // Filtro por setor (multi-seleção; vazio = todos)
        if (!skipSetor && ocSetorFilter.length) {
            var setSet = ocSetorFilter.map(function (s) { return s.trim().toLowerCase(); });
            arr = arr.filter(function (o) { return setorMatchesAnyCI(o.setor, setSet); });
        }

        // Filtro por data
        if (ocDateFilter.type !== 'all') {
            arr = arr.filter(function (o) { return dateMatches(o.data); });
        }

        if (ocSearch) {
            arr = arr.filter(function (o) {
                return [o.colaborador, setorText(o.setor), o.categoria, o.motivo, o.comentario]
                    .some(function (v) { return String(v || '').toLowerCase().indexOf(ocSearch) !== -1; });
            });
        }

        var col = ocSort.col, dir = ocSort.dir === 'asc' ? 1 : -1;
        arr.sort(function (a, b) {
            var va, vb;
            if (col === 'data') { va = a.data || ''; vb = b.data || ''; }
            else { va = String(a[col] || '').toLowerCase(); vb = String(b[col] || '').toLowerCase(); }
            if (va < vb) return -1 * dir;
            if (va > vb) return 1 * dir;
            // desempate estável por createdAt desc
            return (String(b.createdAt || '') > String(a.createdAt || '') ? 1 : -1);
        });
        return arr;
    }

    // Setores presentes na tabela de ocorrências, respeitando os demais filtros ativos
    // (tipo, "meus/todos", categoria, data, busca) mas ignorando o próprio filtro de setor.
    function getAvailableSetoresTable() {
        var arr = getFiltered(true);
        var set = {};
        arr.forEach(function (o) {
            setorArr(o.setor).forEach(function (s) { set[s] = true; });
        });
        return Object.keys(set);
    }

    // Escolhe a fonte de setores disponíveis conforme a visão ativa (tabela ou dashboard de ocorrências)
    function getAvailableSetores() {
        var isDashOc = (typeof currentTab !== 'undefined' && currentTab === 'dashboard' && dashSubtab === 'ocorrencias');
        if (isDashOc && typeof window.getOcDashAvailableSetores === 'function') {
            return window.getOcDashAvailableSetores().sort(function (a, b) { return String(a).localeCompare(String(b), 'pt'); });
        }
        return getAvailableSetoresTable().sort(function (a, b) { return String(a).localeCompare(String(b), 'pt'); });
    }

    // Permissão "Visualizar ocorrências": parcial = só as minhas; total = todas
    function ocCanViewAll() {
        if (typeof currentuser === 'undefined' || !currentuser) return true;
        if (typeof userIsAdmin === 'function' && userIsAdmin()) return true;
        return (currentuser.canViewOc || 'total') !== 'parcial';
    }

    function syncMyModeUI() {
        if (!ocCanViewAll()) ocMyMode = 'responsavel';
        var allBtn = document.getElementById('ocMyAll');
        if (allBtn) allBtn.style.display = ocCanViewAll() ? '' : 'none';
        var resp = document.getElementById('ocMyResp');
        var all = document.getElementById('ocMyAll');
        var btn = document.getElementById('ocMyBtn');
        var lbl = document.getElementById('ocMyLabel');
        if (!resp || !all || !btn || !lbl) return;
        resp.classList.toggle('active', ocMyMode === 'responsavel');
        all.classList.toggle('active', ocMyMode === 'all');
        if (ocMyMode === 'all') { lbl.textContent = 'Visualizar todos'; btn.classList.remove('active'); }
        else { lbl.textContent = 'Minhas ocorrências'; btn.classList.add('active'); }
    }

    function renderTable() {
        if (typeof masterLists === 'undefined') return;
        syncMyModeUI();
        // Se o dashboard de ocorrências estiver visível, re-renderiza ele também
        var ocDashContent = document.getElementById('dashboardOcContent');
        if (ocDashContent && ocDashContent.style.display !== 'none' &&
            typeof window.renderOcDashboard === 'function') {
            window.renderOcDashboard();
        }
        var body = document.getElementById('ocTableBody');
        var empty = document.getElementById('ocEmpty');
        var pag = document.getElementById('ocPagination');
        if (!body) return;

        updateSortHeaders();

        var all = getFiltered();
        var total = all.length;

        if (total === 0) {
            body.innerHTML = '';
            if (empty) empty.style.display = 'block';
            if (pag) pag.style.display = 'none';
            return;
        }
        if (empty) empty.style.display = 'none';

        var pages = Math.max(1, Math.ceil(total / ocPerPage));
        if (ocPage > pages) ocPage = pages;
        var start = (ocPage - 1) * ocPerPage;
        var slice = all.slice(start, start + ocPerPage);
        var editable = canEdit();

        body.innerHTML = slice.map(function (o) {
            var actions = '';
            if (editable) {
                actions = '<button onclick="event.stopPropagation();ocOpenEdit(\'' + o.id + '\')" title="Editar"><i class="fas fa-pen"></i></button>' +
                    '<button class="oc-del" onclick="event.stopPropagation();ocDelete(\'' + o.id + '\')" title="Excluir"><i class="fas fa-trash"></i></button>';
            }
            var nAnexos = Array.isArray(o.anexos) ? o.anexos.length : 0;
            var anexosCell = nAnexos > 0
                ? '<span class="oc-attach-count"><i class="fas fa-paperclip"></i> ' + nAnexos + '</span>'
                : '<span class="oc-attach-none">—</span>';
            return '<tr onclick="ocOpenView(\'' + o.id + '\')">' +
                '<td class="oc-cell-date">' + esc(fmtDate(o.data)) + '</td>' +
                '<td class="oc-cell-colab">' + esc(o.colaborador || '—') + '</td>' +
                '<td>' + (setorArr(o.setor).length ? setorArr(o.setor).map(function (s) { return '<span class="oc-chip oc-chip--setor">' + esc(s) + '</span>'; }).join(' ') : '—') + '</td>' +
                '<td>' + (o.categoria ? '<span class="oc-chip">' + esc(o.categoria) + '</span>' : '—') + '</td>' +
                '<td>' + (o.motivo ? '<span class="oc-chip oc-chip--motivo">' + esc(o.motivo) + '</span>' : '—') + '</td>' +
                '<td class="oc-cell-pub">' + (o.responsavel ? esc(o.responsavel) + (o.createdAt ? '<div class="oc-cell-pub-date">' + fmtDateTime(o.createdAt) + '</div>' : '') : '—') + '</td>' +
                '<td class="oc-cell-attach">' + anexosCell + '</td>' +
                '<td class="text-right"><div class="oc-row-actions">' + actions + '</div></td>' +
                '</tr>';
        }).join('');

        renderPagination(total, pages, start, slice.length);
    }

    function updateSortHeaders() {
        var head = document.getElementById('ocTableHead');
        if (!head) return;
        head.querySelectorAll('th[data-col]').forEach(function (th) {
            var col = th.getAttribute('data-col');
            var ico = th.querySelector('.oc-sort-ico');
            if (col === ocSort.col) {
                th.classList.add('sorted');
                if (ico) ico.className = 'fas oc-sort-ico ' + (ocSort.dir === 'asc' ? 'fa-sort-up' : 'fa-sort-down');
            } else {
                th.classList.remove('sorted');
                if (ico) ico.className = 'fas fa-sort oc-sort-ico';
            }
        });
    }

    function renderPagination(total, pages, start, count) {
        var pag = document.getElementById('ocPagination');
        var info = document.getElementById('ocPagInfo');
        var ctrls = document.getElementById('ocPagControls');
        if (!pag) return;
        pag.style.display = 'flex';
        info.textContent = (start + 1) + '–' + (start + count) + ' de ' + total + ' ocorrência' + (total !== 1 ? 's' : '');

        var html = '<button onclick="ocGoPage(' + (ocPage - 1) + ')"' + (ocPage <= 1 ? ' disabled' : '') + '><i class="fas fa-chevron-left"></i></button>';
        var win = pageWindow(ocPage, pages);
        win.forEach(function (p) {
            if (p === '...') html += '<button disabled>…</button>';
            else html += '<button class="' + (p === ocPage ? 'active' : '') + '" onclick="ocGoPage(' + p + ')">' + p + '</button>';
        });
        html += '<button onclick="ocGoPage(' + (ocPage + 1) + ')"' + (ocPage >= pages ? ' disabled' : '') + '><i class="fas fa-chevron-right"></i></button>';
        ctrls.innerHTML = html;
    }
    function pageWindow(cur, total) {
        var out = [];
        if (total <= 7) { for (var i = 1; i <= total; i++) out.push(i); return out; }
        out.push(1);
        if (cur > 3) out.push('...');
        for (var p = Math.max(2, cur - 1); p <= Math.min(total - 1, cur + 1); p++) out.push(p);
        if (cur < total - 2) out.push('...');
        out.push(total);
        return out;
    }
    window.ocGoPage = function (p) {
        var total = getFiltered().length;
        var pages = Math.max(1, Math.ceil(total / ocPerPage));
        if (p < 1 || p > pages) return;
        ocPage = p;
        renderTable();
    };

    // =====================================================================
    //  DRAWER — Formulário de ocorrência
    // =====================================================================
    window.ocOpenNew = function () {
        if (!canEdit()) { toast('Você não tem permissão para criar ocorrências.', 'error'); return; }
        ensureLists();
        ocEditingId = null;
        document.getElementById('ocDrawerTitle').textContent = 'Nova Ocorrência';
        document.getElementById('ocDrawerSubtitle').textContent = 'Preencha os dados abaixo';
        document.getElementById('ocFData').value = (typeof today === 'function') ? today() : new Date().toISOString().split('T')[0];
        document.getElementById('ocFColab').value = '';
        if (typeof smsReset === 'function') smsReset('oc');
        fillFormTipoSelect(ocCurrentTipoId);
        document.getElementById('ocFCategoria').value = '';
        document.getElementById('ocFMotivo').value = '';
        document.getElementById('ocFComentario').value = '';
        document.getElementById('ocFResponsavel').value = meName();
        document.getElementById('ocFResponsavel').disabled = !canEditResponsavel();
        document.getElementById('ocMotivoWrap').style.display = 'none';
        if (typeof clearAnexosUpload === 'function') clearAnexosUpload('oc');
        ocCloseAllDropdowns();
        openDrawer();
        ocLoadColaboradores();
    };
    window.ocOpenEdit = function (id) {
        if (!canEdit()) { toast('Você não tem permissão para editar.', 'error'); return; }
        var o = (window.ocorrencias || []).find(function (x) { return x.id === id; });
        if (!o) return;
        ensureLists();
        ocEditingId = id;
        document.getElementById('ocDrawerTitle').textContent = 'Editar Ocorrência';
        document.getElementById('ocDrawerSubtitle').textContent = 'Atualize os dados abaixo';
        document.getElementById('ocFData').value = o.data || '';
        document.getElementById('ocFColab').value = o.colaborador || '';
        if (typeof smsSetValue === 'function') smsSetValue('oc', o.setor || '');
        fillFormTipoSelect(o.tipoId);
        document.getElementById('ocFCategoria').value = o.categoria || '';
        document.getElementById('ocFComentario').value = o.comentario || '';
        document.getElementById('ocFResponsavel').value = o.responsavel || meName();
        document.getElementById('ocFResponsavel').disabled = !canEditResponsavel();
        var cat = catByName(o.categoria, o.tipoId);
        if (cat) {
            document.getElementById('ocMotivoWrap').style.display = '';
            document.getElementById('ocFMotivo').value = o.motivo || '';
        } else {
            document.getElementById('ocMotivoWrap').style.display = 'none';
            document.getElementById('ocFMotivo').value = '';
        }
        if (typeof restoreAnexosUpload === 'function') restoreAnexosUpload('oc', o.anexos);
        ocCloseAllDropdowns();
        openDrawer();
        ocLoadColaboradores();
    };

    function openDrawer() {
        var d = document.getElementById('modalOcorrencia');
        var bk = document.getElementById('formDrawerBackdrop');
        if (typeof closeFormDrawer === 'function') closeFormDrawer();
        if (d) d.classList.add('open');
        if (bk) bk.classList.add('open');
        // Reset drawer tabs to Informações
        if (typeof switchDrawerTab === 'function') switchDrawerTab('oc', 'info', d && d.querySelector('.drawer-tab'));
    }
    window.ocCloseDrawer = function () {
        var d = document.getElementById('modalOcorrencia');
        var bk = document.getElementById('formDrawerBackdrop');
        if (d) d.classList.remove('open');
        if (bk) bk.classList.remove('open');
        ocCloseAllDropdowns();
        // Descarta imagens enviadas mas não salvas (preserva as já persistidas)
        if (typeof window._discardSessionImgBlobs === 'function') window._discardSessionImgBlobs('oc');
    };

    window.ocSaveForm = function () {
        var data = document.getElementById('ocFData').value;
        var colab = document.getElementById('ocFColab').value.trim();
        var setorArrOc = (typeof smsGetValue === 'function') ? smsGetValue('oc') : [];
        var categoria = document.getElementById('ocFCategoria').value.trim();
        var motivo = document.getElementById('ocFMotivo').value.trim();
        var comentario = document.getElementById('ocFComentario').value.trim();
        var responsavel = document.getElementById('ocFResponsavel').value.trim() || meName();

        var tipoId = formTipoId();
        if (!tipoId) { toast('Selecione a área.', 'error'); return; }
        if (!data) { toast('Informe a data.', 'error'); return; }
        if (!colab) { toast('Informe o colaborador.', 'error'); return; }
        if (!isColabValido(colab)) {
            toast('Selecione um colaborador da lista importada.', 'error');
            ocLoadColaboradores();
            var ci = document.getElementById('ocFColab'); if (ci) ci.focus();
            return;
        }
        if (!setorArrOc.length) { toast('Informe o setor.', 'error'); return; }
        var _setoresValidosOc = getSetores().map(function (s) { return String(s).trim().toLowerCase(); });
        var setorValido = setorArrOc.every(function (s) { return _setoresValidosOc.indexOf(String(s).trim().toLowerCase()) > -1; });
        if (!setorValido) { toast('Selecione um setor válido da lista.', 'error'); return; }
        var setor = JSON.stringify(setorArrOc);
        if (!categoria) { toast('Informe a categoria.', 'error'); return; }
        var cat = catByName(categoria);
        if (!motivo) { toast('Informe o motivo.', 'error'); return; }
        var motivoValido = cat ? getMotivos(cat.id).some(function (m) { return String(m.name).trim().toLowerCase() === motivo.toLowerCase(); }) : false;
        if (!motivoValido) { toast('Selecione um motivo válido da lista.', 'error'); return; }

        var anexos = (typeof getAnexosUpload === 'function') ? getAnexosUpload('oc') : [];
        ensureLists();
        if (ocEditingId) {
            var o = window.ocorrencias.find(function (x) { return x.id === ocEditingId; });
            if (o) {
                o.tipoId = tipoId;
                o.data = data; o.colaborador = colab; o.setor = setor;
                o.categoria = categoria; o.motivo = motivo; o.comentario = comentario;
                o.responsavel = responsavel;
                o.anexos = anexos;
                o.updatedAt = new Date().toISOString();
            }
            toast('Ocorrência atualizada.', 'success');
        } else {
            window.ocorrencias.push({
                id: uid(),
                tipoId: tipoId,
                data: data,
                colaborador: colab,
                setor: setor,
                categoria: categoria,
                motivo: motivo,
                comentario: comentario,
                responsavel: responsavel,
                anexos: anexos,
                createdAt: new Date().toISOString()
            });
            toast('Ocorrência registrada.', 'success');
        }
        persist();
        ocCloseDrawer();
        renderTable();
    };

    window.ocDelete = function (id) {
        if (!canEdit()) { toast('Sem permissão para excluir.', 'error'); return; }
        ocConfirm({
            title: 'Excluir ocorrência',
            message: 'Esta ação não pode ser desfeita. Deseja continuar?',
            confirmLabel: 'Excluir',
            icon: 'fa-trash'
        }, function () {
            var alvo = (window.ocorrencias || []).find(function (x) { return x.id === id; });
            if (alvo && typeof window._deleteItemImgBlobs === 'function') window._deleteItemImgBlobs(alvo);
            window.ocorrencias = (window.ocorrencias || []).filter(function (x) { return x.id !== id; });
            persist();
            renderTable();
            toast('Ocorrência excluída.', 'info');
        });
    };

    window.ocDeleteAllOfType = function () {
        if (typeof userIsAdmin !== 'function' || !userIsAdmin()) {
            toast('Apenas administradores podem apagar todos os registros.', 'error');
            return;
        }
        if (!ocCurrentTipoId) { toast('Selecione um tipo de ocorrência.', 'error'); return; }
        var tipo = getTipos().find(function (t) { return t.id === ocCurrentTipoId; });
        var tipoNome = tipo ? tipo.name : '';
        var count = (window.ocorrencias || []).filter(function (x) { return x.tipoId === ocCurrentTipoId; }).length;
        if (!count) { toast('Não há registros deste tipo para apagar.', 'info'); return; }
        ocConfirm({
            title: 'Apagar todos os registros',
            message: 'Esta ação é irreversível e vai apagar ' + count + ' registro(s) do tipo "' + tipoNome + '". Digite SIM para confirmar.',
            confirmLabel: 'Apagar tudo',
            icon: 'fa-trash',
            requireText: 'SIM'
        }, function () {
            if (typeof window._deleteItemImgBlobs === 'function') {
                (window.ocorrencias || []).forEach(function (x) { if (x.tipoId === ocCurrentTipoId) window._deleteItemImgBlobs(x); });
            }
            window.ocorrencias = (window.ocorrencias || []).filter(function (x) { return x.tipoId !== ocCurrentTipoId; });
            persist();
            ocPage = 1;
            renderTable();
            toast('Todos os registros do tipo "' + tipoNome + '" foram apagados.', 'info');
        });
    };

    // =====================================================================
    //  MODAL DE VISUALIZAÇÃO
    // =====================================================================
    var ocViewingId = null;

    var VIEW_FIELD_ICONS = {
        'Data': 'fa-calendar', 'Colaborador': 'fa-user', 'Setor': 'fa-building',
        'Categoria': 'fa-tag', 'Motivo': 'fa-circle-dot', 'Responsável': 'fa-user-shield'
    };

    window.ocOpenView = function (id) {
        var o = (window.ocorrencias || []).find(function (x) { return x.id === id; });
        if (!o) return;
        ocViewingId = id;

        var tipo = getTipos().find(function (t) { return t.id === o.tipoId; });

        // Hero
        document.getElementById('ocViewTitle').textContent = tipo ? tipo.name : 'Ocorrência';
        var subParts = [];
        if (o.data) subParts.push('<i class="fas fa-calendar" style="opacity:.7"></i>' + esc(fmtDate(o.data)));
        if (o.colaborador) subParts.push('<span class="oc-view-sub-dot"></span><i class="fas fa-user" style="opacity:.7"></i>' + esc(o.colaborador));
        if (setorArr(o.setor).length) subParts.push('<span class="oc-view-sub-dot"></span><i class="fas fa-building" style="opacity:.7"></i>' + esc(setorText(o.setor)));
        document.getElementById('ocViewSub').innerHTML = subParts.join(' ');
        document.getElementById('ocViewEditBtn').style.display = canEdit() ? '' : 'none';

        // Chips de categoria/motivo no hero
        var chipsEl = document.getElementById('ocViewHeroChips');
        var chips = [];
        if (o.categoria) chips.push('<span class="oc-view-chip"><i class="fas fa-tag"></i>' + esc(o.categoria) + '</span>');
        if (o.motivo) chips.push('<span class="oc-view-chip"><i class="fas fa-circle-dot"></i>' + esc(o.motivo) + '</span>');
        if (chipsEl) chipsEl.innerHTML = chips.join('');

        // Info grid (excluindo categoria e motivo — já estão nos chips)
        var pairs = [
            ['Data', fmtDate(o.data)],
            ['Colaborador', o.colaborador],
            ['Setor', setorArr(o.setor).length ? o.setor : ''],
            ['Responsável', o.responsavel]
        ];
        var gridHtml = '';
        gridHtml += pairs.filter(function(p) { return p[1]; }).map(function(p) {
            var ico = VIEW_FIELD_ICONS[p[0]] || 'fa-circle-info';
            return '<div class="oc-view-card">' +
                '<label><i class="fas ' + ico + '"></i>' + esc(p[0]) + '</label>' +
                '<div>' + (p[0] === 'Setor' ? setorChipsHtml(p[1]) : esc(p[1])) + '</div>' +
            '</div>';
        }).join('');
        document.getElementById('ocViewGrid').innerHTML = gridHtml;

        // Comentário
        var descWrap = document.getElementById('ocViewDescWrap');
        if (o.comentario) {
            descWrap.innerHTML =
                '<div class="oc-view-desc-block">' +
                    '<div class="oc-view-desc-block-label"><i class="fas fa-comment-dots"></i> Comentário</div>' +
                    '<div class="oc-view-desc-text">' + esc(o.comentario).replace(/\n/g, '<br>') + '</div>' +
                '</div>';
        } else {
            descWrap.innerHTML = '';
        }

        // Anexos
        var anexos = Array.isArray(o.anexos) ? o.anexos : [];
        var anexosList = document.getElementById('ocViewAnexosList');
        var tabBadge = document.getElementById('ocViewAnexosTab');

        if (tabBadge) {
            tabBadge.innerHTML = '<i class="fas fa-paperclip"></i> Anexos' +
                (anexos.length ? ' <span class="oc-view-tab-badge">' + anexos.length + '</span>' : '');
        }

        if (!anexos.length) {
            anexosList.innerHTML =
                '<div class="oc-view-anexos-empty">' +
                    '<div class="oc-view-anexos-empty-icon"><i class="fas fa-paperclip"></i></div>' +
                    '<p>Nenhum anexo nesta ocorrência.</p>' +
                '</div>';
        } else {
            anexosList.innerHTML = '<div class="oc-view-anexos-grid">' + anexos.map(function(a) {
                var isLink = a.tipo === 'link';
                var icon = isLink ? 'fa-link' : 'fa-file-alt';
                var typeLabel = isLink ? 'Link' : 'Arquivo';
                var titulo = esc(a.titulo || a.url || 'Anexo');
                return '<a href="' + esc(a.url) + '" target="_blank" rel="noopener" class="oc-view-anexo-card">' +
                    '<div class="oc-view-anexo-icon"><i class="fas ' + icon + '"></i></div>' +
                    '<span class="oc-view-anexo-name">' + titulo + '</span>' +
                    '<span class="oc-view-anexo-type">' + typeLabel + '</span>' +
                '</a>';
            }).join('') + '</div>';
        }

        // Reset tabs
        ocSwitchViewTab('info', document.querySelector('#ocViewBackdrop .oc-view-tab'));
        document.getElementById('ocViewBackdrop').classList.add('open');
    };

    window.ocCloseView = function () {
        document.getElementById('ocViewBackdrop').classList.remove('open');
        ocViewingId = null;
    };

    window.ocSwitchViewTab = function (tab, btn) {
        document.querySelectorAll('#ocViewBackdrop .oc-view-tab').forEach(function(b) { b.classList.remove('active'); });
        document.querySelectorAll('#ocViewBackdrop .oc-view-panel').forEach(function(p) { p.classList.remove('active'); });
        if (btn) btn.classList.add('active');
        var panel = document.getElementById(tab === 'info' ? 'ocViewPanelInfo' : 'ocViewPanelAnexos');
        if (panel) panel.classList.add('active');
    };

    window.ocViewEdit = function () {
        if (ocViewingId) {
            var id = ocViewingId;
            ocCloseView();
            ocOpenEdit(id);
        }
    };

    // =====================================================================
    //  COLABORADORES — importados do Google Sheets
    // =====================================================================
    function ocLoadColaboradores() {
        if (ocColabLoaded || ocColabLoading) return;
        ocColabLoading = true;
        var ld = document.getElementById('ocColabLoading');
        if (ld) ld.style.display = 'block';
        fetch(COLAB_SHEETS_URL)
            .then(function (r) { return r.json(); })
            .then(function (json) {
                if (json && json.error) throw new Error(json.error);
                ocColabList = normalizeColabs(json);
                ocColabLoaded = true;
                // Se o dropdown está aberto, re-renderiza agora que há dados.
                var dd = document.getElementById('ocColabDropdown');
                if (dd && dd.classList.contains('open')) ocColabInput();
            })
            .catch(function (e) {
                console.error('Falha ao importar colaboradores do Sheets:', e);
                toast('Não foi possível importar colaboradores: ' + (e && e.message ? e.message : 'erro de conexão'), 'error');
            })
            .finally(function () {
                ocColabLoading = false;
                if (ld) ld.style.display = 'none';
            });
    }
    // Aceita vários formatos comuns de payload do Apps Script
    function normalizeColabs(json) {
        var rows = [];
        if (Array.isArray(json)) rows = json;
        else if (json && Array.isArray(json.data)) rows = json.data;
        else if (json && Array.isArray(json.colaboradores)) rows = json.colaboradores;
        else if (json && Array.isArray(json.values)) rows = json.values;
        else if (json && typeof json === 'object') rows = Object.values(json).find(Array.isArray) || [];

        // Chaves possíveis para nome e setor. O Apps Script atual retorna
        // { colunaB: <nome>, colunaE: <setor> } (ver doGet da planilha).
        var nameKeys = ['nome', 'name', 'colaborador', 'funcionario', 'funcionário', 'colunab'];
        var setorKeys = ['setor', 'sector', 'departamento', 'area', 'área', 'colunae'];

        return rows.map(function (row) {
            if (typeof row === 'string') return { nome: row, setor: '' };
            if (Array.isArray(row)) return { nome: row[0] || '', setor: row[1] || '' };
            // Caso direto do payload atual: { colunaB, colunaE }
            if (row && (row.colunaB !== undefined || row.colunaE !== undefined)) {
                return { nome: String(row.colunaB || '').trim(), setor: String(row.colunaE || '').trim() };
            }
            var nome = '', setor = '';
            Object.keys(row).forEach(function (k) {
                var lk = k.trim().toLowerCase();
                if (!nome && nameKeys.indexOf(lk) !== -1) nome = String(row[k] || '').trim();
                if (!setor && setorKeys.indexOf(lk) !== -1) setor = String(row[k] || '').trim();
            });
            return { nome: nome, setor: setor };
        }).filter(function (c) { return c.nome; });
    }

    // =====================================================================
    //  AUTOCOMPLETE — colaborador / setor / categoria / motivo
    // =====================================================================
    function renderAC(dropId, items, onPick, withSub, emptyMsg) {
        var dd = document.getElementById(dropId);
        if (!dd) return;
        if (items.length === 0) {
            dd.innerHTML = '<div class="oc-ac-empty">' + esc(emptyMsg || 'Nenhuma opção. Digite para criar.') + '</div>';
            dd.classList.add('open');
            return;
        }
        dd.innerHTML = items.map(function (it, i) {
            var main = withSub ? it.nome : it;
            var sub = withSub && it.setor ? '<small>' + esc(it.setor) + '</small>' : '';
            return '<div class="oc-ac-opt" data-i="' + i + '">' + esc(main) + sub + '</div>';
        }).join('');
        Array.prototype.forEach.call(dd.querySelectorAll('.oc-ac-opt'), function (el) {
            el.addEventListener('mousedown', function (e) {
                e.preventDefault();
                onPick(items[parseInt(el.getAttribute('data-i'), 10)]);
                dd.classList.remove('open');
            });
        });
        dd.classList.add('open');
    }

    // Colaborador deve ser EXCLUSIVAMENTE da lista importada do Google Sheets.
    function isColabValido(nome) {
        var n = String(nome || '').trim().toLowerCase();
        return ocColabList.some(function (c) { return c.nome.trim().toLowerCase() === n; });
    }
    // Ao sair do campo, limpa qualquer texto digitado que não seja da lista.
    window.ocColabBlur = function () {
        // Pequeno atraso para permitir o clique numa opção do dropdown.
        setTimeout(function () {
            var input = document.getElementById('ocFColab');
            if (!input) return;
            var val = input.value.trim();
            if (val && !isColabValido(val) && !ocColabLoading) {
                input.value = '';
                toast('Selecione um colaborador da lista importada.', 'error');
            }
        }, 200);
    };

    window.ocColabInput = function () {
        ocLoadColaboradores();
        var q = (document.getElementById('ocFColab').value || '').trim().toLowerCase();
        var emptyMsg;
        if (ocColabLoading) emptyMsg = 'Carregando colaboradores...';
        else if (ocColabList.length === 0) emptyMsg = 'Nenhum colaborador importado.';
        else emptyMsg = 'Nenhum colaborador encontrado.';
        var list = ocColabList.filter(function (c) { return !q || c.nome.toLowerCase().indexOf(q) !== -1; }).slice(0, 50);
        renderAC('ocColabDropdown', list, function (c) {
            document.getElementById('ocFColab').value = c.nome;
            // Preenche setor automaticamente se for um setor válido no sistema
            if (c.setor) {
                var valid = getSetores().some(function (s) { return String(s).trim().toLowerCase() === c.setor.trim().toLowerCase(); });
                if (valid && typeof smsSetValue === 'function') smsSetValue('oc', [c.setor]);
            }
            document.getElementById('ocColabDropdown').classList.remove('open');
        }, true, emptyMsg);
    };

    window.ocCategoriaInput = function () {
        var q = (document.getElementById('ocFCategoria').value || '').trim().toLowerCase();
        if (!formTipoId()) { toast('Selecione a área primeiro.', 'error'); return; }
        var list = getCategorias(formTipoId()).map(function (c) { return c.name; })
            .filter(function (s) { return !q || s.toLowerCase().indexOf(q) !== -1; }).slice(0, 30);
        renderAC('ocCategoriaDropdown', list, function (name) {
            document.getElementById('ocFCategoria').value = name;
            document.getElementById('ocCategoriaDropdown').classList.remove('open');
            onCategoriaChosen(name);
        }, false);
    };
    function onCategoriaChosen(name) {
        var cat = catByName(name);
        var wrap = document.getElementById('ocMotivoWrap');
        if (cat) {
            wrap.style.display = '';
        } else {
            wrap.style.display = 'none';
            document.getElementById('ocFMotivo').value = '';
        }
    }

    window.ocMotivoInput = function () {
        var cat = catByName(document.getElementById('ocFCategoria').value);
        var motivos = cat ? getMotivos(cat.id).map(function (m) { return m.name; }) : [];
        var q = (document.getElementById('ocFMotivo').value || '').trim().toLowerCase();
        var list = motivos.filter(function (s) { return !q || s.toLowerCase().indexOf(q) !== -1; }).slice(0, 30);
        renderAC('ocMotivoDropdown', list, function (name) {
            document.getElementById('ocFMotivo').value = name;
            document.getElementById('ocMotivoDropdown').classList.remove('open');
        }, false);
    };

    // =====================================================================
    //  MODAL DE GESTÃO — tipos / setores / categorias / motivos
    // =====================================================================
    var MANAGER_META = {
        tipos: { title: 'Gerenciar Tipos', sub: 'Cada tipo agrupa suas próprias ocorrências', icon: 'fa-layer-group', ph: 'Novo tipo...' },
        setores: { title: 'Gerenciar Setores', sub: 'Setores disponíveis no sistema', icon: 'fa-building', ph: 'Novo setor...' },
        categorias: { title: 'Gerenciar Categorias', sub: 'Categorias de motivos', icon: 'fa-tags', ph: 'Nova categoria...' },
        motivos: { title: 'Gerenciar Motivos', sub: '', icon: 'fa-list-ul', ph: 'Novo motivo...' }
    };

    window.ocOpenManager = function (kind) {
        if (kind === 'categorias' || kind === 'motivos') {
            if (!canManageMotivos(kind)) { toast('Você não tem permissão para gerenciar categorias e motivos.', 'error'); return; }
        } else if (!canManage(kind)) { toast('Você não tem permissão para gerenciar listas.', 'error'); return; }
        // Capture context: tipo ativo e categoria ativa
        var _drawer = document.getElementById('modalOcorrencia');
        ocManagerTipoId = (_drawer && _drawer.classList.contains('open') && formTipoId()) || ocCurrentTipoId;
        if (kind === 'categorias') {
            if (!ocManagerTipoId) { toast('Selecione um tipo primeiro.', 'error'); return; }
            var tipoObj = getTipos().find(function(t) { return t.id === ocManagerTipoId; });
            MANAGER_META.categorias.sub = tipoObj ? ('Tipo: ' + tipoObj.name) : 'Categorias do tipo';
        }
        if (kind === 'motivos') {
            var cat = catByName(document.getElementById('ocFCategoria').value);
            if (!cat) { toast('Selecione uma categoria válida primeiro.', 'error'); return; }
            ocManagerCatId = cat.id;
            ocManagerCatName = cat.name;
        }
        ensureLists();
        ocManagerKind = kind;
        var meta = MANAGER_META[kind];
        document.getElementById('ocManagerIcon').className = 'fas ' + meta.icon;
        document.getElementById('ocManagerTitle').textContent = meta.title;
        document.getElementById('ocManagerSub').textContent = kind === 'motivos' ? ('Categoria: ' + ocManagerCatName) : meta.sub;
        document.getElementById('ocManagerInput').placeholder = meta.ph;
        document.getElementById('ocManagerInput').value = '';
        renderManagerList();
        document.getElementById('ocManagerBackdrop').classList.add('open');
        setTimeout(function () { document.getElementById('ocManagerInput').focus(); }, 60);
    };
    window.ocCloseManager = function () {
        document.getElementById('ocManagerBackdrop').classList.remove('open');
        ocManagerKind = null;
    };

    var ocManagerCatId = null, ocManagerCatName = '', ocManagerTipoId = null;

    function managerItems() {
        if (ocManagerKind === 'tipos') return getTipos();
        if (ocManagerKind === 'categorias') return getCategorias(ocManagerTipoId);
        if (ocManagerKind === 'motivos') return getMotivos(ocManagerCatId);
        if (ocManagerKind === 'setores') return getSetores().map(function (s) { return { id: s, name: s, _setor: true }; });
        return [];
    }

    function renderManagerList() {
        var box = document.getElementById('ocManagerList');
        if (!box) return;
        var items = managerItems();
        if (items.length === 0) {
            box.innerHTML = '<div class="oc-list-empty">Nenhum item cadastrado ainda.</div>';
            return;
        }
        box.innerHTML = items.map(function (it) {
            return '<div class="oc-list-item" data-key="' + esc(it.id) + '">' +
                '<span class="oc-li-name">' + esc(it.name) + '</span>' +
                '<div class="oc-li-btns">' +
                '<button class="oc-li-edit-btn" title="Editar"><i class="fas fa-pen"></i></button>' +
                '<button class="oc-li-del" title="Remover"><i class="fas fa-trash"></i></button>' +
                '</div></div>';
        }).join('');
        Array.prototype.forEach.call(box.querySelectorAll('.oc-list-item'), function (row) {
            var key = row.getAttribute('data-key');
            row.querySelector('.oc-li-edit-btn').addEventListener('click', function () { ocManagerEdit(row.querySelector('.oc-li-edit-btn'), key); });
            row.querySelector('.oc-li-del').addEventListener('click', function () { ocManagerRemove(key); });
        });
    }

    window.ocManagerAdd = function () {
        var input = document.getElementById('ocManagerInput');
        var name = input.value.trim();
        if (!name) return;
        ensureLists();
        if (ocManagerKind === 'tipos') {
            if (getTipos().some(function (t) { return t.name.toLowerCase() === name.toLowerCase(); })) { toast('Tipo já existe.', 'error'); return; }
            getTipos().push({ id: uid(), name: name });
            sortByName(getTipos());
        } else if (ocManagerKind === 'categorias') {
            if (getCategorias(ocManagerTipoId).some(function (c) { return c.name.toLowerCase() === name.toLowerCase(); })) { toast('Categoria já existe.', 'error'); return; }
            masterLists.ncCategorias[ocManagerTipoId].push({ id: uid(), name: name });
            sortByName(masterLists.ncCategorias[ocManagerTipoId]);
        } else if (ocManagerKind === 'motivos') {
            var mo = getMotivos(ocManagerCatId);
            if (mo.some(function (m) { return m.name.toLowerCase() === name.toLowerCase(); })) { toast('Motivo já existe.', 'error'); return; }
            mo.push({ id: uid(), name: name });
            sortByName(mo);
        } else if (ocManagerKind === 'setores') {
            if (window.setorEhRH && window.setorEhRH(name)) { toast('Setores vêm do cadastro do RH (Dados LAMIC). Aqui só se editam as Áreas.', 'error'); return; }
            if (masterLists.setores.some(function (s) { return String(s).toLowerCase() === name.toLowerCase(); })) { toast('Setor já existe.', 'error'); return; }
            masterLists.setores.push(name);
        }
        input.value = '';
        persist();
        renderManagerList();
        afterListChange();
    };

    window.ocManagerEdit = function (btn, key) {
        var row = btn.closest('.oc-list-item');
        if (!row) return;
        var nameEl = row.querySelector('.oc-li-name');
        var current = nameEl.textContent;
        nameEl.outerHTML = '<input class="oc-li-edit" type="text" value="' + esc(current) + '">';
        var input = row.querySelector('.oc-li-edit');
        input.focus(); input.select();
        var btns = row.querySelector('.oc-li-btns');
        btns.innerHTML = '<button class="oc-li-save" title="Salvar"><i class="fas fa-check"></i></button>' +
            '<button title="Cancelar"><i class="fas fa-times"></i></button>';
        var save = btns.children[0], cancel = btns.children[1];
        function commit() {
            var nv = input.value.trim();
            if (nv) { ocApplyRename(key, nv); }
            renderManagerList();
        }
        save.onclick = commit;
        cancel.onclick = function () { renderManagerList(); };
        input.onkeydown = function (e) { if (e.key === 'Enter') commit(); if (e.key === 'Escape') renderManagerList(); };
    };

    function ocApplyRename(key, nv) {
        ensureLists();
        if (ocManagerKind === 'setores') {
            var old = key;
            if (window.setorEhRH && window.setorEhRH(old)) { toast('Setores vêm do cadastro do RH (Dados LAMIC). Aqui só se editam as Áreas.', 'error'); return; }
            var realIdx = masterLists.setores.indexOf(old);
            if (realIdx !== -1) masterLists.setores[realIdx] = nv;
            // Setor pode ser multi-valor (JSON de array): renomeia em todos os módulos
            [window.ocorrencias || [], window.rncItems || [], audits, activities, maintenances, documents].forEach(function (list) {
                list.forEach(function (o) { o.setor = setorRename(o.setor, old, nv); });
            });
        } else {
            var list = ocManagerKind === 'tipos' ? getTipos() : (ocManagerKind === 'categorias' ? getCategorias(ocManagerTipoId) : getMotivos(ocManagerCatId));
            var item = list.find(function (x) { return x.id === key; });
            if (item) {
                var oldName = item.name;
                item.name = nv;
                sortByName(list);
                var _oldLow = oldName.trim().toLowerCase();
                if (ocManagerKind === 'categorias') {
                    (window.ocorrencias || []).forEach(function (o) {
                        if (String(o.categoria || '').trim().toLowerCase() === _oldLow) o.categoria = nv;
                    });
                } else if (ocManagerKind === 'motivos') {
                    var catObj = catById(ocManagerCatId, ocManagerTipoId);
                    var currentCatName = catObj ? catObj.name : ocManagerCatName;
                    var _catLow = currentCatName.trim().toLowerCase();
                    (window.ocorrencias || []).forEach(function (o) {
                        if (String(o.motivo || '').trim().toLowerCase() === _oldLow &&
                            String(o.categoria || '').trim().toLowerCase() === _catLow) o.motivo = nv;
                    });
                }
            }
        }
        persist();
        afterListChange();
    }

    window.ocManagerRemove = function (key) {
        function doRemove() {
            ensureLists();
            if (ocManagerKind === 'tipos') {
                var t = getTipos().find(function (x) { return String(x.id) === String(key); });
                var hasOcc = (window.ocorrencias || []).some(function (o) { return t && o.tipoId === t.id; });
                if (hasOcc) {
                    ocConfirm({
                        title: 'Tipo com ocorrências',
                        message: 'Há ocorrências vinculadas a este tipo. Elas ficarão sem tipo. Deseja continuar?',
                        confirmLabel: 'Remover mesmo assim',
                        icon: 'fa-triangle-exclamation'
                    }, function () {
                        masterLists.ncTipos = getTipos().filter(function (x) { return String(x.id) !== String(key); });
                        if (t && ocCurrentTipoId === t.id) ocCurrentTipoId = null;
                        persist();
                        renderManagerList();
                        afterListChange();
                    });
                    return;
                }
                masterLists.ncTipos = getTipos().filter(function (x) { return String(x.id) !== String(key); });
                if (t && ocCurrentTipoId === t.id) ocCurrentTipoId = null;
            } else if (ocManagerKind === 'categorias') {
                var c = getCategorias(ocManagerTipoId).find(function (x) { return String(x.id) === String(key); });
                masterLists.ncCategorias[ocManagerTipoId] = getCategorias(ocManagerTipoId).filter(function (x) { return String(x.id) !== String(key); });
                if (c && masterLists.ncMotivos) delete masterLists.ncMotivos[c.id];
            } else if (ocManagerKind === 'motivos') {
                masterLists.ncMotivos[ocManagerCatId] = getMotivos(ocManagerCatId).filter(function (x) { return String(x.id) !== String(key); });
            } else if (ocManagerKind === 'setores') {
                if (window.setorEhRH && window.setorEhRH(key)) { toast('Setores vêm do cadastro do RH (Dados LAMIC). Aqui só se editam as Áreas.', 'error'); return; }
                var ridx = masterLists.setores.indexOf(key);
                if (ridx !== -1) masterLists.setores.splice(ridx, 1);
            }
            persist();
            renderManagerList();
            afterListChange();
        }

        ocConfirm({
            title: 'Remover item',
            message: 'Tem certeza que deseja remover este item?',
            confirmLabel: 'Remover',
            icon: 'fa-trash'
        }, doRemove);
    };

    // Após alterar qualquer lista, atualiza UI dependente
    function afterListChange() {
        renderTipoDropdown();
        updateTipoLabel();
        // se categoria do form deixou de existir, esconde motivo
        var catInput = document.getElementById('ocFCategoria');
        if (catInput && catInput.value && !catByName(catInput.value)) {
            document.getElementById('ocMotivoWrap').style.display = 'none';
        }
        renderTable();
    }

    // =====================================================================
    //  FILTRO POR CATEGORIA (ícone ao lado de "Minhas ocorrências")
    // =====================================================================
    function renderCatFilterDropdown() {
        var dd = document.getElementById('ocCatFilterDropdown');
        if (!dd) return;
        // Show categories of the current tipo only (or all if no tipo selected)
        var cats = getCategorias(ocCurrentTipoId);
        var html = '<div class="oc-head-dd-title">Filtrar por categoria</div>';
        html += '<button class="oc-type-option' + (ocCatFilter === '' ? ' active' : '') +
            '" onclick="ocSelectCatFilter(\'\')"><i class="fas fa-border-all"></i> Todas as categorias</button>';
        if (cats.length === 0) {
            html += '<div class="oc-type-empty">Nenhuma categoria cadastrada.</div>';
        } else {
            cats.forEach(function (c) {
                var sel = ocCatFilter.toLowerCase() === String(c.name).toLowerCase();
                html += '<button class="oc-type-option' + (sel ? ' active' : '') +
                    '" onclick="ocSelectCatFilter(\'' + esc(c.name).replace(/'/g, "\\'") + '\')"><i class="fas fa-tag"></i> ' + esc(c.name) + '</button>';
            });
        }
        dd.innerHTML = html;
    }
    window.ocToggleCatFilter = function () {
        var dd = document.getElementById('ocCatFilterDropdown');
        var btn = document.getElementById('ocCatFilterBtn');
        if (!dd) return;
        var open = dd.classList.contains('open');
        ocCloseAllDropdowns();
        if (!open) { renderCatFilterDropdown(); dd.classList.add('open'); _ocPositionDropdownMobile(btn, dd); }
    };
    window.ocSelectCatFilter = function (name) {
        ocCatFilter = name || '';
        ocPage = 1;
        var btn = document.getElementById('ocCatFilterBtn');
        if (btn) btn.classList.toggle('active', !!ocCatFilter);
        var dd = document.getElementById('ocCatFilterDropdown'); if (dd) dd.classList.remove('open');
        renderTable();
    };

    // =====================================================================
    //  FILTRO POR SETOR — modal moderno
    // =====================================================================
    var _ocSetorPending = [];   // seleção temporária dentro do modal

    function ocEnsureSetorModal() {
        if (document.getElementById('ocSetorBackdrop')) return;
        var el = document.createElement('div');
        el.id = 'ocSetorBackdrop';
        el.className = 'oc-setor-backdrop';
        el.innerHTML =
            '<div class="oc-setor-modal" onclick="event.stopPropagation()">' +
                '<div class="oc-setor-modal-header">' +
                    '<h3><i class="fas fa-building"></i> Filtrar por Setor</h3>' +
                    '<button class="oc-setor-modal-close" onclick="ocCloseSetorModal()"><i class="fas fa-times"></i></button>' +
                '</div>' +
                '<div class="oc-setor-modal-toolbar">' +
                    '<button class="oc-setor-toggle-all" id="ocSetorToggleAll" onclick="ocToggleAllSetores()">' +
                        '<i class="fas fa-check-double"></i><span id="ocSetorToggleAllLbl">Desmarcar todos</span>' +
                    '</button>' +
                    '<span class="oc-setor-count"><span id="ocSetorSelCount">0</span> selecionados</span>' +
                '</div>' +
                '<div class="setor-filter-search" style="border-top:1px solid var(--border);">' +
                    '<i class="fas fa-search setor-filter-search-icon"></i>' +
                    '<input type="text" id="ocSetorSearch" class="setor-filter-search-input" placeholder="Buscar setor..." oninput="ocFilterSetorSearch(this.value)" autocomplete="off">' +
                '</div>' +
                '<div class="oc-setor-modal-body" id="ocSetorModalBody"></div>' +
                '<div class="oc-setor-modal-footer">' +
                    '<button class="oc-setor-btn-cancel" onclick="ocCloseSetorModal()">Cancelar</button>' +
                    '<button class="oc-setor-btn-apply" onclick="ocApplySetorModal()"><i class="fas fa-check"></i> Aplicar</button>' +
                '</div>' +
            '</div>';
        el.addEventListener('click', function () { ocCloseSetorModal(); });
        document.body.appendChild(el);
    }

    function ocRenderSetorModalBody() {
        var body = document.getElementById('ocSetorModalBody');
        var countEl = document.getElementById('ocSetorSelCount');
        var toggleLbl = document.getElementById('ocSetorToggleAllLbl');
        if (!body) return;
        var setores = getAvailableSetores();
        if (!setores.length) {
            body.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px;">Nenhum setor com ocorrências para os filtros atuais.</div>';
            return;
        }
        body.innerHTML = setores.map(function (s) {
            var sel = _ocSetorPending.indexOf(s) !== -1;
            return '<div class="oc-setor-item' + (sel ? ' selected' : '') + '" onclick="ocToggleSetorPending(\'' + esc(s).replace(/'/g, "\\'") + '\')">' +
                '<div class="oc-setor-checkbox"><i class="fas fa-check"></i></div>' +
                '<span class="oc-setor-name">' + esc(s) + '</span>' +
            '</div>';
        }).join('');
        if (countEl) countEl.textContent = _ocSetorPending.length;
        var allSel = _ocSetorPending.length === setores.length;
        if (toggleLbl) toggleLbl.textContent = allSel ? 'Desmarcar todos' : 'Marcar todos';
    }

    window.ocFilterSetorSearch = function(query) {
        var q = query.trim().toLowerCase();
        var items = document.querySelectorAll('#ocSetorModalBody .oc-setor-item');
        items.forEach(function(item) {
            var name = item.querySelector('.oc-setor-name');
            var text = name ? name.textContent.toLowerCase() : '';
            item.style.display = (!q || text.indexOf(q) !== -1) ? '' : 'none';
        });
    };

    window.ocToggleSetorPending = function (s) {
        var i = _ocSetorPending.indexOf(s);
        if (i === -1) _ocSetorPending.push(s); else _ocSetorPending.splice(i, 1);
        ocRenderSetorModalBody();
    };
    window.ocToggleAllSetores = function () {
        var setores = getAvailableSetores();
        var allSel = _ocSetorPending.length === setores.length;
        _ocSetorPending = allSel ? [] : setores.slice();
        ocRenderSetorModalBody();
    };
    window.ocToggleHeadSetor = function () {
        ocEnsureSetorModal();
        var setores = getAvailableSetores();
        // Abre com seleção igual ao filtro atual restrito aos setores disponíveis (ou todos se vazio)
        _ocSetorPending = ocSetorFilter.length ? ocSetorFilter.filter(function (s) { return setores.indexOf(s) !== -1; }) : setores.slice();
        ocRenderSetorModalBody();
        document.getElementById('ocSetorBackdrop').classList.add('open');
        var searchEl = document.getElementById('ocSetorSearch');
        if (searchEl) { searchEl.value = ''; setTimeout(function() { searchEl.focus(); }, 80); }
    };
    window.ocCloseSetorModal = function () {
        var bd = document.getElementById('ocSetorBackdrop');
        if (bd) bd.classList.remove('open');
    };
    window.ocApplySetorModal = function () {
        var setores = getAvailableSetores();
        // Se todos selecionados, equivale a "sem filtro"
        ocSetorFilter = (_ocSetorPending.length === setores.length) ? [] : _ocSetorPending.slice();
        ocPage = 1;
        updateSetorHeadLabel();
        ocCloseSetorModal();
        renderTable();
    };
    // Mantido para compatibilidade com ocorrencias-dashboard.js
    window.ocToggleSetorFilter = function (s) {
        var i = ocSetorFilter.indexOf(s);
        if (i === -1) ocSetorFilter.push(s); else ocSetorFilter.splice(i, 1);
        ocPage = 1;
        updateSetorHeadLabel();
        renderTable();
    };
    window.ocClearSetorFilter = function () {
        ocSetorFilter = [];
        ocPage = 1;
        updateSetorHeadLabel();
        renderTable();
    };
    function updateSetorHeadLabel() {
        var lbl = document.getElementById('ocHeadSetorLabel');
        var btn = document.getElementById('ocHeadSetorBtn');
        if (!lbl) return;
        if (ocSetorFilter.length === 0) { lbl.textContent = 'Setores'; if (btn) btn.classList.remove('active'); }
        else { lbl.textContent = ocSetorFilter.length === 1 ? ocSetorFilter[0] : (ocSetorFilter.length + ' setores'); if (btn) btn.classList.add('active'); }
    }

    // =====================================================================
    //  FILTRO POR DATA — picker moderno
    // =====================================================================
    var _ocDatePickerYear = new Date().getFullYear(); // ano navegável no picker de mês

    function dateMatches(dateStr) {
        if (!dateStr) return false;
        var f = ocDateFilter;
        if (f.type === 'month') {
            var p = String(dateStr).split('-');
            return parseInt(p[0], 10) === f.year && (parseInt(p[1], 10) - 1) === f.month;
        }
        if (f.type === 'year') {
            return parseInt(String(dateStr).split('-')[0], 10) === f.year;
        }
        if (f.type === 'custom') {
            if (f.ini && dateStr < f.ini) return false;
            if (f.fim && dateStr > f.fim) return false;
            return true;
        }
        return true;
    }

    var MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    function renderDateHeadDropdown() {
        var dd = document.getElementById('ocHeadDateDropdown');
        if (!dd) return;
        dd.className = 'oc-date-dd';
        var f = ocDateFilter;
        var curY = new Date().getFullYear();

        var modeIcons  = { all: 'fa-calendar-xmark', month: 'fa-calendar-days', year: 'fa-calendar', custom: 'fa-sliders' };
        var modeLabels = { all: 'Todas', month: 'Mês', year: 'Ano', custom: 'Período' };

        var html = '';
        // Barra de modos
        html += '<div class="oc-date-dd-modes">';
        ['all', 'month', 'year', 'custom'].forEach(function (type) {
            html += '<button class="oc-date-dd-mode' + (f.type === type ? ' active' : '') +
                '" onclick="ocSetDateType(\'' + type + '\')">' +
                '<i class="fas ' + modeIcons[type] + '"></i>' + modeLabels[type] + '</button>';
        });
        html += '</div>';

        if (f.type === 'month') {
            // Calendário de meses com navegação de ano
            var navY = _ocDatePickerYear;
            var selM = (f.year === navY && f.month != null) ? f.month : -1;
            html += '<div class="oc-month-picker">';
            html += '<div class="oc-month-picker-nav">' +
                '<button onclick="ocDatePickerPrevYear()"><i class="fas fa-chevron-left"></i></button>' +
                '<span>' + navY + '</span>' +
                '<button onclick="ocDatePickerNextYear()"><i class="fas fa-chevron-right"></i></button>' +
            '</div>';
            html += '<div class="oc-month-grid">';
            MONTH_NAMES.forEach(function (m, i) {
                html += '<button class="oc-month-cell' + (selM === i ? ' active' : '') +
                    '" onclick="ocPickMonth(' + i + ',' + navY + ')">' + m + '</button>';
            });
            html += '</div></div>';

        } else if (f.type === 'year') {
            // Grade de anos clicáveis
            var selY = f.year || curY;
            html += '<div class="oc-year-picker"><div class="oc-year-grid">';
            for (var y = curY + 1; y >= curY - 6; y--) {
                html += '<button class="oc-year-cell' + (y === selY ? ' active' : '') +
                    '" onclick="ocPickYear(' + y + ')">' + y + '</button>';
            }
            html += '</div></div>';

        } else if (f.type === 'custom') {
            html += '<div class="oc-custom-picker">' +
                '<label>De</label>' +
                '<input type="date" id="ocDateIni" value="' + esc(f.ini || '') + '">' +
                '<label>Até</label>' +
                '<input type="date" id="ocDateFim" value="' + esc(f.fim || '') + '">' +
                '<button class="oc-custom-apply" onclick="ocDateCustomApply()"><i class="fas fa-check"></i> Aplicar</button>' +
            '</div>';
        }

        dd.innerHTML = html;
    }

    window.ocToggleHeadDate = function () {
        var dd = document.getElementById('ocHeadDateDropdown');
        if (!dd) return;
        var open = dd.style.display === 'block';
        if (open) {
            dd.style.display = 'none';
            dd.className = 'oc-head-dropdown';
            return;
        }
        // Sincroniza ano de navegação com o filtro atual
        _ocDatePickerYear = ocDateFilter.year || new Date().getFullYear();
        renderDateHeadDropdown();
        dd.style.display = 'block';
    };
    window.ocSetDateType = function (type) {
        var now = new Date();
        ocDateFilter.type = type;
        if (type === 'month') {
            if (ocDateFilter.month == null) ocDateFilter.month = now.getMonth();
            if (!ocDateFilter.year) ocDateFilter.year = now.getFullYear();
            _ocDatePickerYear = ocDateFilter.year;
        }
        if (type === 'year') { if (!ocDateFilter.year) ocDateFilter.year = now.getFullYear(); }
        ocPage = 1;
        renderDateHeadDropdown();
        updateDateHeadLabel();
        if (type !== 'custom') renderTable();
    };
    window.ocDatePickerPrevYear = function () {
        _ocDatePickerYear--;
        renderDateHeadDropdown();
    };
    window.ocDatePickerNextYear = function () {
        _ocDatePickerYear++;
        renderDateHeadDropdown();
    };
    window.ocPickMonth = function (month, year) {
        ocDateFilter.month = month;
        ocDateFilter.year = year;
        ocPage = 1;
        updateDateHeadLabel();
        renderDateHeadDropdown();
        renderTable();
    };
    window.ocPickYear = function (year) {
        ocDateFilter.year = year;
        ocPage = 1;
        updateDateHeadLabel();
        renderDateHeadDropdown();
        renderTable();
    };
    // Mantido para compatibilidade interna
    window.ocDateMonthChange = function () {};
    window.ocDateYearChange = function () {};
    window.ocDateCustomApply = function () {
        var ini = document.getElementById('ocDateIni');
        var fim = document.getElementById('ocDateFim');
        ocDateFilter.ini = ini ? ini.value : '';
        ocDateFilter.fim = fim ? fim.value : '';
        ocPage = 1;
        updateDateHeadLabel();
        renderTable();
        // Fecha explicitamente apenas ao clicar em Aplicar
        var dd = document.getElementById('ocHeadDateDropdown');
        if (dd) { dd.style.display = 'none'; dd.className = 'oc-head-dropdown'; }
    };
    function updateDateHeadLabel() {
        var lbl = document.getElementById('ocHeadDateLabel');
        var btn = document.getElementById('ocHeadDateBtn');
        if (!lbl) return;
        var f = ocDateFilter;
        var txt = 'Data', act = true;
        if (f.type === 'all') { txt = 'Data'; act = false; }
        else if (f.type === 'month') txt = MONTH_NAMES[f.month] + '/' + f.year;
        else if (f.type === 'year') txt = String(f.year);
        else if (f.type === 'custom') txt = (f.ini || f.fim) ? 'Período' : 'Data';
        if (f.type === 'custom' && !f.ini && !f.fim) act = false;
        lbl.textContent = txt;
        if (btn) btn.classList.toggle('active', act);
    }

    function ocCloseHeadDropdowns() {
        var dateEl = document.getElementById('ocHeadDateDropdown');
        // Não fecha o picker de data enquanto o modo personalizado está ativo
        if (dateEl && !(ocDateFilter.type === 'custom' && dateEl.style.display === 'block')) {
            dateEl.style.display = 'none';
            dateEl.className = 'oc-head-dropdown';
        }
        var setorEl = document.getElementById('ocHeadSetorDropdown');
        if (setorEl) setorEl.style.display = 'none';
    }

    // =====================================================================
    //  INTEGRAÇÃO COM A ABA
    // =====================================================================
    window.ocActivateTab = function () {
        ensureLists();
        ensureValidTipo();
        ocPage = 1;
        // Mostra os filtros de setor/data no header e oculta o sino de notificações
        ocSetHeaderFilters(true);
        renderTipoDropdown();
        updateTipoLabel();
        updateSetorHeadLabel();
        updateDateHeadLabel();
        renderTable();
        if (typeof window.applyOcorrenciasPermissions === 'function') window.applyOcorrenciasPermissions();
    };

    // Mostra/oculta os filtros de header exclusivos da aba e o sino
    window.ocSetHeaderFilters = function (show) {
        var wraps = ['ocHeadDateWrap', 'ocHeadSetorWrap'];
        wraps.forEach(function (id) { var el = document.getElementById(id); if (el) el.style.display = show ? 'block' : 'none'; });
        var bell = document.getElementById('notificationContainer');
        if (bell) bell.style.display = show ? 'none' : '';
        if (!show) ocCloseHeadDropdowns();
    };

    // Fecha dropdowns ao clicar fora
    document.addEventListener('click', function (e) {
        if (!e.target.closest('.oc-type-wrap') && !e.target.closest('.oc-ac-wrap')) {
            ocCloseAllDropdowns();
        }
        // Não fecha o dropdown de data se o clique foi dentro dele (mês, ano, nav)
        var dateDD = document.getElementById('ocHeadDateDropdown');
        var insideDateDD = dateDD && dateDD.contains(e.target);
        if (!e.target.closest('.oc-head-filter') && !insideDateDD) {
            ocCloseHeadDropdowns();
        }
    });

    // Expor render para o listener do Firebase, se desejar
    window.ocRenderTable = renderTable;

    // Expor filtros globais para o dashboard de ocorrências
    Object.defineProperty(window, 'ocDateFilter', {
        get: function () { return ocDateFilter; },
        set: function (v) { ocDateFilter = v; },
        configurable: true
    });
    Object.defineProperty(window, 'ocSetorFilter', {
        get: function () { return ocSetorFilter; },
        set: function (v) { ocSetorFilter = v; },
        configurable: true
    });
    Object.defineProperty(window, 'ocColabList', {
        get: function () { return ocColabList; },
        configurable: true
    });

    // =====================================================================
    //  DASHBOARD — abas Tarefas / Ocorrências
    // =====================================================================
    var dashSubtab = 'tarefas';            // 'tarefas' | 'ocorrencias'
    var dashOcTipoId = null;               // filtro de tipo do dashboard de ocorrências
    var _dashOcDateInitialized = false;    // garante que o filtro padrão é aplicado apenas uma vez

    // Aplica a visibilidade conforme a sub-aba ativa do dashboard.
    // Chamado pelo switchTab após renderDashboard().
    window.applyDashSubtab = function () {
        var isOc = dashSubtab === 'ocorrencias';
        var tTab = document.getElementById('dashSubtabTarefas');
        var oTab = document.getElementById('dashSubtabOcorrencias');
        if (tTab) tTab.classList.toggle('active', !isOc);
        if (oTab) oTab.classList.toggle('active', isOc);

        var fbTar = document.getElementById('filtersBarDashboard');
        var fbOc = document.getElementById('filtersBarDashOc');
        var ctTar = document.getElementById('dashboardContent');
        var ctOc = document.getElementById('dashboardOcContent');

        if (fbTar) fbTar.style.display = isOc ? 'none' : 'flex';
        if (fbOc) fbOc.style.display = isOc ? 'flex' : 'none';
        if (ctTar) ctTar.style.display = isOc ? 'none' : 'flex';
        if (ctOc) ctOc.style.display = isOc ? 'flex' : 'none';

        // Mostra/oculta filtros de data e setor no header conforme sub-aba
        if (typeof window.ocSetHeaderFilters === 'function') window.ocSetHeaderFilters(isOc);
        // Oculta os filtros globais (tarefas) quando sub-aba é ocorrências
        var _sfBtn = document.getElementById('btnSetorFilter');
        var _dfBtn = document.getElementById('fbarDateBtn');
        if (_sfBtn) _sfBtn.style.display = isOc ? 'none' : 'inline-flex';
        if (_dfBtn) _dfBtn.style.display = isOc ? 'none' : 'inline-flex';
        // Oculta botão de carta na sub-aba de ocorrências do dashboard
        var _ncBtn = document.getElementById('newCardsContainer');
        if (_ncBtn) {
            _ncBtn.style.display = isOc ? 'none' : 'flex';
            if (isOc) {
                var _ncModal = document.getElementById('newCardsModal');
                if (_ncModal) _ncModal.classList.remove('active');
            }
        }

        if (isOc) {
            // Define filtro padrão de data como ano atual na primeira vez
            if (!_dashOcDateInitialized) {
                _dashOcDateInitialized = true;
                var _now = new Date();
                ocDateFilter = { type: 'year', year: _now.getFullYear(), month: null, ini: '', fim: '' };
                updateDateHeadLabel();
            }
            renderDashOcTypeDropdown();
            updateDashOcTypeLabel();
            if (typeof window.renderOcDashboard === 'function') window.renderOcDashboard();
        }
    };

    window.setDashSubtab = function (which) {
        dashSubtab = which;
        window.applyDashSubtab();
    };

    // Dropdown de tipo no filtro do dashboard de ocorrências
    function renderDashOcTypeDropdown() {
        var dd = document.getElementById('dashOcTypeDropdown');
        if (!dd) return;
        var tipos = getAllowedTipos();
        var html = '<button class="oc-type-option' + (dashOcTipoId === null ? ' active' : '') +
            '" onclick="dashOcSelectTipo(null)"><i class="fas fa-border-all"></i> Todas as ocorrências</button>';
        if (tipos.length === 0) {
            html += '<div class="oc-type-empty">Nenhum tipo cadastrado.</div>';
        } else {
            tipos.forEach(function (t) {
                html += '<button class="oc-type-option' + (dashOcTipoId === t.id ? ' active' : '') +
                    '" onclick="dashOcSelectTipo(\'' + t.id + '\')"><i class="fas fa-tag"></i> ' + esc(t.name) + '</button>';
            });
        }
        dd.innerHTML = html;
    }
    function updateDashOcTypeLabel() {
        var lbl = document.getElementById('dashOcTypeLabel');
        if (!lbl) return;
        if (dashOcTipoId !== null && !getAllowedTipos().some(function (x) { return x.id === dashOcTipoId; })) {
            dashOcTipoId = null;
        }
        if (dashOcTipoId === null) { lbl.textContent = 'Tipo: Todas'; return; }
        var t = getAllowedTipos().find(function (x) { return x.id === dashOcTipoId; });
        lbl.textContent = t ? t.name : 'Tipo';
    }
    window.dashOcToggleTypeDropdown = function () {
        var dd = document.getElementById('dashOcTypeDropdown');
        if (!dd) return;
        var open = dd.classList.contains('open');
        ocCloseAllDropdowns();
        dd.classList.remove('open');
        if (!open) { renderDashOcTypeDropdown(); dd.classList.add('open'); }
    };
    window.dashOcSelectTipo = function (id) {
        dashOcTipoId = id;
        var dd = document.getElementById('dashOcTypeDropdown'); if (dd) dd.classList.remove('open');
        updateDashOcTypeLabel();
        if (typeof window.renderOcDashboard === 'function') window.renderOcDashboard();
    };
    window.dashOcClearFilters = function () {
        dashOcTipoId = null;
        updateDashOcTypeLabel();
        if (typeof window.renderOcDashboard === 'function') window.renderOcDashboard();
    };
    // Expor dashOcTipoId para acesso do dashboard externo
    Object.defineProperty(window, 'dashOcTipoId', {
        get: function () { return dashOcTipoId; },
        configurable: true
    });

    // Fecha também o dropdown do dashboard ao clicar fora
    document.addEventListener('click', function (e) {
        if (!e.target.closest('#filtersBarDashOc .oc-type-wrap')) {
            var dd = document.getElementById('dashOcTypeDropdown');
            if (dd) dd.classList.remove('open');
        }
    });

    // ── Expor tipo atual ──────────────────────────────────────────────────
    window.ocGetCurrentTipoId = function () { return ocCurrentTipoId; };

    // ── XLSX EXPORT / IMPORT ──────────────────────────────────────────────
    var _ocXlsxPendingRows = [];

    window.ocOpenXlsx = function () {
        var tipoId = ocCurrentTipoId;
        var tipo = tipoId ? getTipos().find(function (t) { return t.id === tipoId; }) : null;
        if (!tipo) { toast('Selecione um tipo antes de usar o exportar/importar.', 'error'); return; }
        document.getElementById('ocXlsxModalSub').textContent = 'Tipo: ' + tipo.name;
        document.getElementById('ocXlsxPreview').style.display = 'none';
        document.getElementById('ocXlsxResult').style.display = 'none';
        document.getElementById('ocXlsxLoading').style.display = 'none';
        document.getElementById('ocXlsxFileInput').value = '';
        _ocXlsxPendingRows = [];
        document.getElementById('ocXlsxBackdrop').classList.add('open');
    };

    window.ocCloseXlsx = function () {
        document.getElementById('ocXlsxBackdrop').classList.remove('open');
    };

    window.ocXlsxExport = function () {
        if (typeof XLSX === 'undefined') { toast('Biblioteca XLSX não carregada.', 'error'); return; }
        var tipoId = ocCurrentTipoId;
        var rows = (window.ocorrencias || []).filter(function (o) { return !o.deleted && o.tipoId === tipoId; });
        if (rows.length === 0) { toast('Nenhuma ocorrência para exportar.', 'info'); return; }
        var data = [['Data', 'Colaborador', 'Setor', 'Categoria', 'Motivo', 'Responsavel', 'Comentario']].concat(
            rows.map(function (o) {
                return [o.data || '', o.colaborador || '', setorText(o.setor), o.categoria || '', o.motivo || '', o.responsavel || '', o.comentario || ''];
            })
        );
        var ws = XLSX.utils.aoa_to_sheet(data);
        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Ocorrencias');
        var tipo = getTipos().find(function (t) { return t.id === tipoId; });
        XLSX.writeFile(wb, 'ocorrencias_' + (tipo ? tipo.name : 'export').replace(/\s+/g, '_') + '.xlsx');
    };

    // Converte data vinda do Excel (serial numérico, Date ou texto DD/MM/YYYY) para YYYY-MM-DD.
    function _ocParseXlsxDate(v) {
        if (v == null || v === '') return '';
        if (v instanceof Date) {
            if (isNaN(v.getTime())) return '';
            var yy = v.getFullYear(), mm = String(v.getMonth() + 1).padStart(2, '0'), dd = String(v.getDate()).padStart(2, '0');
            return yy + '-' + mm + '-' + dd;
        }
        if (typeof v === 'number') {
            var parsed = (typeof XLSX !== 'undefined' && XLSX.SSF) ? XLSX.SSF.parse_date_code(v) : null;
            if (parsed) {
                return parsed.y + '-' + String(parsed.m).padStart(2, '0') + '-' + String(parsed.d).padStart(2, '0');
            }
            return '';
        }
        var s = String(v).trim();
        if (!s) return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        var m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (m) return m[3] + '-' + m[2] + '-' + m[1];
        return '';
    }

    window.ocXlsxFileChosen = function (input) {
        var file = input.files && input.files[0];
        if (!file) return;
        if (typeof XLSX === 'undefined') { toast('Biblioteca XLSX não carregada.', 'error'); return; }
        _ocXlsxSetLoading(true, 'Lendo arquivo...');
        var reader = new FileReader();
        reader.onload = function (e) {
            try {
                var wb = XLSX.read(e.target.result, { type: 'array' });
                var ws = wb.Sheets[wb.SheetNames[0]];
                var rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
                if (!rows || rows.length < 2) { _ocXlsxSetLoading(false); toast('Planilha vazia ou sem dados.', 'error'); return; }
                var header = rows[0].map(function (h) { return String(h).trim().toLowerCase(); });
                var colMap = { data: -1, colaborador: -1, setor: -1, categoria: -1, motivo: -1, responsavel: -1, comentario: -1 };
                header.forEach(function (h, i) {
                    if (['data', 'date'].indexOf(h) !== -1) colMap.data = i;
                    else if (['colaborador', 'colaboradora', 'funcionario', 'nome'].indexOf(h) !== -1) colMap.colaborador = i;
                    else if (['setor', 'departamento'].indexOf(h) !== -1) colMap.setor = i;
                    else if (['categoria', 'category'].indexOf(h) !== -1) colMap.categoria = i;
                    else if (['motivo', 'reason'].indexOf(h) !== -1) colMap.motivo = i;
                    else if (['responsavel', 'responsável', 'responsable'].indexOf(h) !== -1) colMap.responsavel = i;
                    else if (['comentario', 'comentário', 'comment', 'observacao', 'observação'].indexOf(h) !== -1) colMap.comentario = i;
                });
                var valid = [], invalid = 0;
                rows.slice(1).forEach(function (row, idx) {
                    var dataRaw = colMap.data >= 0 ? row[colMap.data] : '';
                    var dataVal = _ocParseXlsxDate(dataRaw);
                    var colab = colMap.colaborador >= 0 ? String(row[colMap.colaborador] || '').trim() : '';
                    if (!dataVal || !colab) { invalid++; return; }
                    valid.push({
                        _rowNum: idx + 2,
                        data: dataVal,
                        colaborador: colab,
                        setor: colMap.setor >= 0 ? String(row[colMap.setor] || '').trim() : '',
                        categoria: colMap.categoria >= 0 ? String(row[colMap.categoria] || '').trim() : '',
                        motivo: colMap.motivo >= 0 ? String(row[colMap.motivo] || '').trim() : '',
                        responsavel: colMap.responsavel >= 0 ? String(row[colMap.responsavel] || '').trim() : '',
                        comentario: colMap.comentario >= 0 ? String(row[colMap.comentario] || '').trim() : ''
                    });
                });
                _ocXlsxSetLoading(false);
                _ocXlsxPendingRows = valid;
                _ocXlsxShowPreview(valid, invalid, rows.length - 1);
            } catch (err) {
                _ocXlsxSetLoading(false);
                toast('Erro ao ler o arquivo: ' + (err.message || err), 'error');
            }
        };
        reader.readAsArrayBuffer(file);
    };

    function _ocXlsxSetLoading(on, msg) {
        var ld = document.getElementById('ocXlsxLoading');
        var closeBtn = document.getElementById('ocXlsxCloseBtn');
        var confirmBtn = document.getElementById('ocXlsxConfirmBtn');
        var exportBtn = document.querySelector('.oc-xlsx-export-btn');
        if (ld) ld.style.display = on ? 'flex' : 'none';
        if (on && msg) { var lm = document.getElementById('ocXlsxLoadingMsg'); if (lm) lm.textContent = msg; }
        if (closeBtn) closeBtn.disabled = on;
        if (confirmBtn) confirmBtn.disabled = on;
        if (exportBtn) exportBtn.disabled = on;
    }

    function _ocXlsxShowPreview(valid, invalid, total) {
        var infoEl = document.getElementById('ocXlsxPreviewInfo');
        var tableEl = document.getElementById('ocXlsxPreviewTable');
        var previewEl = document.getElementById('ocXlsxPreview');
        var resultEl = document.getElementById('ocXlsxResult');
        if (resultEl) resultEl.style.display = 'none';
        if (infoEl) infoEl.textContent = valid.length + ' linha(s) válidas de ' + total + ' (' + invalid + ' falha(s))';
        if (tableEl) {
            var html = '<thead><tr><th>#</th><th>Data</th><th>Colaborador</th><th>Setor</th><th>Categoria</th><th>Motivo</th><th>Responsável</th><th>Comentário</th></tr></thead><tbody>';
            valid.slice(0, 50).forEach(function (r) {
                html += '<tr><td class="oc-xlsx-row-num">' + r._rowNum + '</td><td>' + esc(r.data) + '</td><td>' + esc(r.colaborador) + '</td><td>' + esc(r.setor) + '</td><td>' + esc(r.categoria) + '</td><td>' + esc(r.motivo) + '</td><td>' + esc(r.responsavel) + '</td><td>' + esc(r.comentario) + '</td></tr>';
            });
            if (valid.length > 50) html += '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);font-size:12px;padding:8px;">... e mais ' + (valid.length - 50) + ' linha(s)</td></tr>';
            html += '</tbody>';
            tableEl.innerHTML = html;
        }
        if (previewEl) previewEl.style.display = valid.length > 0 ? 'block' : 'none';
        if (valid.length === 0) { toast('Nenhuma linha válida encontrada no arquivo.', 'error'); }
    }

    window.ocXlsxConfirmImport = function () {
        if (!_ocXlsxPendingRows.length) return;
        _ocXlsxSetLoading(true, 'Importando ' + _ocXlsxPendingRows.length + ' ocorrências...');
        var tipoId = ocCurrentTipoId;
        var success = 0, fail = 0;
        _ocXlsxPendingRows.forEach(function (r) {
            try {
                window.ocorrencias.push({
                    id: uid(),
                    tipoId: tipoId,
                    data: r.data,
                    colaborador: r.colaborador,
                    setor: setorSerialize(r.setor),
                    categoria: r.categoria,
                    motivo: r.motivo,
                    responsavel: r.responsavel || meName(),
                    comentario: r.comentario,
                    anexos: [],
                    createdAt: new Date().toISOString(),
                    importedAt: new Date().toISOString()
                });
                success++;
            } catch (e) { fail++; }
        });
        persist();
        renderTable();
        _ocXlsxPendingRows = [];
        _ocXlsxSetLoading(false);
        document.getElementById('ocXlsxPreview').style.display = 'none';
        var res = document.getElementById('ocXlsxResult');
        if (res) {
            res.style.display = 'flex';
            res.innerHTML = '<i class="fas fa-check-circle" style="color:#22c55e;margin-right:8px;"></i>' +
                '<strong>' + success + ' ocorrência(s) importada(s)</strong>' +
                (fail > 0 ? ' <span style="color:#ef4444;margin-left:6px;">(' + fail + ' falha(s))</span>' : '');
        }
        toast(success + ' ocorrência(s) importada(s) com sucesso!', 'success');
        document.getElementById('ocXlsxFileInput').value = '';
    };

})();
