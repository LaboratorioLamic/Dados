// =========================================================================
//  GESTÃO DE N/C — RNC (Relatório de Não Conformidade)
//  Módulo independente: Kanban, Lista (cards), Calendário
//  Filtros: Setor e Data próprios no header + sino próprio
//  Persistência: array global `rncItems` (Firebase) + masterLists
// =========================================================================
(function () {
    'use strict';

    // ── Estado global ──
    if (typeof window.rncItems === 'undefined') window.rncItems = [];

    // ── Estado de UI ──
    var rncView = 'kanban';
    var rncSearch = '';
    var rncClassFilter = '';       // '' | 'critica' | 'maior' | 'menor'
    var rncMyMode = 'all'; // 'responsavel' | 'revisor' | 'all'
    var rncSetorFilter = [];
    var rncOrigemFilter = [];
    var rncDetFilter = [];
    var _rncColPage = {}; // chave: nome do status -> página atual (1-based)
    var RNC_CARDS_PER_PAGE = 10;
    var rncDateFilter = { type: 'all', month: null, year: null, ini: '', fim: '' };
    var rncPage = 1;
    var rncTableSort = { col: 'dataConclusao', dir: 'asc' };
    var rncEditingId = null;
    var rncViewId = null;
    var rncCalYear = null;
    var rncCalMonth = null;
    var rncManagerKind = null;

    // ── Pastas abertas (Origens/Detalhamento) — persistido em localStorage ──
    var RNC_OPEN_FOLDERS_KEY = 'rncOpenFolders';
    function _loadOpenFolders() {
        try {
            var raw = localStorage.getItem(RNC_OPEN_FOLDERS_KEY);
            var data = raw ? JSON.parse(raw) : null;
            if (!data || typeof data !== 'object') data = {};
            if (!Array.isArray(data.origens)) data.origens = [];
            if (!Array.isArray(data.detalhamento)) data.detalhamento = [];
            return data;
        } catch (e) {
            return { origens: [], detalhamento: [] };
        }
    }
    var rncOpenFolders = _loadOpenFolders();
    function _saveOpenFolders() {
        try { localStorage.setItem(RNC_OPEN_FOLDERS_KEY, JSON.stringify(rncOpenFolders)); } catch (e) {}
    }
    window.rncToggleFolderOpen = function(kind, key) {
        var list = rncOpenFolders[kind];
        var idx = list.indexOf(key);
        if (idx === -1) list.push(key); else list.splice(idx, 1);
        _saveOpenFolders();
    };

    var MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    var MONTH_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

    // ── Marcadores: somente os cadastrados pelo usuário (sem pré-cadastro) ──
    function getMarker(id) {
        if (!id) return null;
        var custom = (typeof masterLists !== 'undefined' && Array.isArray(masterLists.rncMarcadores)) ? masterLists.rncMarcadores : [];
        return custom.find(function(m){ return String(m.id) === String(id); }) || null;
    }
    function getAllMarkers() {
        return (typeof masterLists !== 'undefined' && Array.isArray(masterLists.rncMarcadores)) ? masterLists.rncMarcadores : [];
    }
    function _updateMarkerDisplay(id) {
        var disp = document.getElementById('rncFMarcadorDisplay');
        if (!disp) return;
        var mk = getMarker(id);
        if (mk) {
            disp.innerHTML = '<span class="rnc-marker-badge" style="background:' + mk.bg + ';color:' + mk.color + '"><i class="fas ' + mk.icon + '"></i> ' + esc(mk.label) + '</span>';
        } else {
            disp.innerHTML = '<span style="color:#94a3b8">Nenhum</span>';
        }
    }
    window.rncToggleMarkerDropdown = function() {
        var dd = document.getElementById('rncMarkerDropdown');
        if (!dd) return;
        if (dd.classList.contains('open')) { dd.classList.remove('open'); return; }
        var selectedId = (document.getElementById('rncFMarcador') || {}).value || '';
        var markers = getAllMarkers();
        dd.innerHTML =
            '<button class="rnc-ac-option rnc-marker-opt' + (!selectedId ? ' active' : '') + '" onclick="rncPickMarker(\'\')" style="display:flex;align-items:center;gap:8px">' +
                '<span class="rnc-marker-badge" style="background:#f1f5f9;color:#64748b"><i class="fas fa-ban"></i> Nenhum</span>' +
            '</button>' +
            markers.map(function(m) {
                return '<button class="rnc-ac-option rnc-marker-opt' + (selectedId === m.id ? ' active' : '') + '" onclick="rncPickMarker(\'' + esc(m.id) + '\')" style="display:flex;align-items:center;gap:8px">' +
                    '<span class="rnc-marker-badge" style="background:' + (m.bg || '#f1f5f9') + ';color:' + m.color + '"><i class="fas ' + m.icon + '"></i> ' + esc(m.label || m.name) + '</span>' +
                '</button>';
            }).join('') +
            '<button class="rnc-ac-option rnc-marker-opt" onclick="rncOpenMarkerManager()" style="display:flex;align-items:center;gap:8px;color:#8b5cf6;font-weight:600;border-top:1px solid #f1f5f9;margin-top:4px">' +
                '<i class="fas fa-plus"></i> Gerenciar marcadores' +
            '</button>';
        dd.classList.add('open');
    };
    window.rncPickMarker = function(id) {
        var inp = document.getElementById('rncFMarcador');
        if (inp) inp.value = id;
        _updateMarkerDisplay(id);
        var dd = document.getElementById('rncMarkerDropdown');
        if (dd) dd.classList.remove('open');
    };
    // ── Editor de marcadores (modal dedicado, criar/editar com ícone e cor) ──
    var RNC_MK_COLORS = [
        '#ef4444','#f97316','#f59e0b','#eab308','#84cc16','#22c55e',
        '#14b8a6','#06b6d4','#3b82f6','#6366f1','#8b5cf6','#a855f7',
        '#ec4899','#f43f5e','#64748b','#0f172a'
    ];
    var RNC_MK_ICONS = [
        'fa-tag','fa-fire','fa-triangle-exclamation','fa-clock','fa-magnifying-glass',
        'fa-circle-check','fa-ban','fa-star','fa-flag','fa-bookmark','fa-bolt','fa-heart',
        'fa-thumbtack','fa-bell','fa-shield-halved','fa-gem','fa-rocket','fa-bug',
        'fa-wrench','fa-leaf','fa-lightbulb','fa-lock','fa-hourglass-half','fa-thumbs-up'
    ];
    var _rncMkColor = RNC_MK_COLORS[0];
    var _rncMkIcon  = RNC_MK_ICONS[0];
    var _rncMkEditId = null;

    function _rncHexToBg(hex) { return hex + '22'; }

    window.rncOpenMarkerManager = function() {
        if (!canManage()) { toast('Sem permissão para gerenciar marcadores.', 'error'); return; }
        ensureLists();
        rncMkResetForm();
        _rncMkRenderExisting();
        _rncMkRenderColors();
        _rncMkRenderIcons();
        rncMkUpdatePreview();
        var modal = document.getElementById('rncMarkerEditorModal');
        if (modal) modal.style.display = 'flex';
    };
    window.rncCloseMarkerEditor = function() {
        var modal = document.getElementById('rncMarkerEditorModal');
        if (modal) modal.style.display = 'none';
    };

    function _rncMkRenderExisting() {
        var wrap = document.getElementById('rncMkExisting');
        if (!wrap) return;
        var list = getAllMarkers();
        if (!list.length) {
            wrap.innerHTML = '<div class="rnc-mk-empty"><i class="fas fa-tags"></i><span>Nenhum marcador cadastrado ainda.</span></div>';
            return;
        }
        wrap.innerHTML = list.map(function(m, i){
            return '<div class="rnc-mk-chip-row">' +
                '<span class="rnc-marker-badge" style="background:' + (m.bg || _rncHexToBg(m.color)) + ';color:' + m.color + '"><i class="fas ' + m.icon + '"></i> ' + esc(m.label || m.name) + '</span>' +
                '<div class="rnc-mk-chip-actions">' +
                    '<button onclick="rncMkEdit(' + i + ')" title="Editar"><i class="fas fa-pen"></i></button>' +
                    '<button class="danger" onclick="rncMkRemove(' + i + ')" title="Remover"><i class="fas fa-trash"></i></button>' +
                '</div>' +
            '</div>';
        }).join('');
    }

    function _rncMkRenderColors() {
        var wrap = document.getElementById('rncMkColors');
        if (!wrap) return;
        wrap.innerHTML = RNC_MK_COLORS.map(function(c){
            return '<button type="button" class="rnc-mk-color' + (_rncMkColor===c?' active':'') + '" style="background:' + c + '" onclick="rncMkPickColor(\'' + c + '\')"><i class="fas fa-check"></i></button>';
        }).join('');
    }
    function _rncMkRenderIcons() {
        var wrap = document.getElementById('rncMkIcons');
        if (!wrap) return;
        wrap.innerHTML = RNC_MK_ICONS.map(function(ic){
            return '<button type="button" class="rnc-mk-icon' + (_rncMkIcon===ic?' active':'') + '" onclick="rncMkPickIcon(\'' + ic + '\')"><i class="fas ' + ic + '"></i></button>';
        }).join('');
    }
    window.rncMkPickColor = function(c){ _rncMkColor = c; _rncMkRenderColors(); rncMkUpdatePreview(); };
    window.rncMkPickIcon  = function(ic){ _rncMkIcon = ic; _rncMkRenderIcons(); rncMkUpdatePreview(); };

    window.rncMkUpdatePreview = function() {
        var prev = document.getElementById('rncMkPreview');
        if (!prev) return;
        var name = (document.getElementById('rncMkName') || {}).value || 'Marcador';
        prev.style.background = _rncHexToBg(_rncMkColor);
        prev.style.color = _rncMkColor;
        prev.innerHTML = '<i class="fas ' + _rncMkIcon + '"></i> ' + esc(name);
    };

    window.rncMkResetForm = function() {
        _rncMkEditId = null;
        _rncMkColor = RNC_MK_COLORS[0];
        _rncMkIcon  = RNC_MK_ICONS[0];
        var n = document.getElementById('rncMkName'); if (n) n.value = '';
        var ft = document.getElementById('rncMkFormTitle'); if (ft) ft.textContent = 'Novo marcador';
        var sl = document.getElementById('rncMkSaveLabel'); if (sl) sl.textContent = 'Adicionar marcador';
        var cb = document.getElementById('rncMkCancelBtn'); if (cb) cb.style.display = 'none';
        _rncMkRenderColors(); _rncMkRenderIcons(); rncMkUpdatePreview();
    };

    window.rncMkEdit = function(idx) {
        var list = getAllMarkers();
        var m = list[idx]; if (!m) return;
        _rncMkEditId = m.id;
        _rncMkColor = m.color || RNC_MK_COLORS[0];
        _rncMkIcon  = m.icon || RNC_MK_ICONS[0];
        var n = document.getElementById('rncMkName'); if (n) n.value = m.label || m.name || '';
        var ft = document.getElementById('rncMkFormTitle'); if (ft) ft.textContent = 'Editar marcador';
        var sl = document.getElementById('rncMkSaveLabel'); if (sl) sl.textContent = 'Salvar alterações';
        var cb = document.getElementById('rncMkCancelBtn'); if (cb) cb.style.display = '';
        _rncMkRenderColors(); _rncMkRenderIcons(); rncMkUpdatePreview();
    };

    window.rncMkSave = function() {
        ensureLists();
        var n = document.getElementById('rncMkName');
        var name = n ? n.value.trim() : '';
        if (!name) { toast('Informe o nome do marcador.', 'error'); if (n) n.focus(); return; }
        var list = masterLists.rncMarcadores;
        var dup = list.some(function(x){ return String(x.id) !== String(_rncMkEditId) && String(x.label || x.name).trim().toLowerCase() === name.toLowerCase(); });
        if (dup) { toast('Já existe um marcador com este nome.', 'warn'); return; }

        if (_rncMkEditId) {
            var m = list.find(function(x){ return String(x.id) === String(_rncMkEditId); });
            if (m) { m.name = name; m.label = name; m.color = _rncMkColor; m.icon = _rncMkIcon; m.bg = _rncHexToBg(_rncMkColor); }
            toast('Marcador atualizado.', 'success');
        } else {
            list.push({ id: String(Date.now()), name: name, label: name, color: _rncMkColor, icon: _rncMkIcon, bg: _rncHexToBg(_rncMkColor) });
            toast('Marcador adicionado.', 'success');
        }
        persist();
        rncMkResetForm();
        _rncMkRenderExisting();
        renderRnc();
    };

    window.rncMkRemove = function(idx) {
        var list = getAllMarkers();
        var m = list[idx]; if (!m) return;
        rncConfirm({
            title: 'Remover marcador',
            message: 'Remover o marcador "' + (m.label || m.name) + '"?',
            confirmLabel: 'Remover', icon: 'fa-trash'
        }, function() {
            masterLists.rncMarcadores.splice(idx, 1);
            persist(); _rncMkRenderExisting(); renderRnc();
            toast('Marcador removido.', 'success');
        });
    };
    // Inicializa display do marcador ao carregar o form
    function renderMarkerChips(selectedId) {
        _updateMarkerDisplay(selectedId);
        var inp = document.getElementById('rncFMarcador');
        if (inp) inp.value = selectedId || '';
    }

    // ── Classificações (com ícones e cores) ──
    var CLASSES = [
        { id: 'critica', label: 'NC - Crítica',  icon: 'fa-circle-exclamation',  color: '#dc2626', bg: '#fef2f2', border: '#fecaca', darkColor: '#f87171', darkBg: 'rgba(220,38,38,0.15)',  darkBorder: 'rgba(248,113,113,0.30)' },
        { id: 'maior',   label: 'NC - Maior',    icon: 'fa-triangle-exclamation', color: '#d97706', bg: '#fffbeb', border: '#fde68a', darkColor: '#fbbf24', darkBg: 'rgba(217,119,6,0.15)',  darkBorder: 'rgba(251,191,36,0.30)' },
        { id: 'menor',   label: 'NC - Menor',    icon: 'fa-circle-info',          color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe', darkColor: '#60a5fa', darkBg: 'rgba(37,99,235,0.15)',  darkBorder: 'rgba(96,165,250,0.30)' }
    ];

    function rncClassStyle(ci) {
        if (document.body.classList.contains('dark-mode')) {
            return 'background:' + ci.darkBg + ';color:' + ci.darkColor + ';border-color:' + ci.darkBorder;
        }
        return 'background:' + ci.bg + ';color:' + ci.color + ';border-color:' + ci.border;
    }

    // ══════════════════════════════════════════════════════════════════
    //  HELPERS
    // ══════════════════════════════════════════════════════════════════

    // ── Donut de progresso do checklist (espelha o módulo de Atividades) ──
    function rncDonutHtml(done, total, size) {
        size = size || 46;
        var pct = total > 0 ? Math.round((done / total) * 100) : 0;
        var sw = size <= 32 ? 3 : 4;
        var r = (size / 2) - sw - 1;
        var cx = size / 2;
        var circ = 2 * Math.PI * r;
        var filled = circ * (pct / 100);
        var gap = circ - filled;
        var offset = circ * 0.25;
        var trackColor = pct === 100 ? '#86efac' : '#e5e7eb';
        var fillColor  = pct === 100 ? '#22c55e' : pct >= 50 ? '#2563eb' : '#f59e0b';
        var textColor  = pct === 100 ? '#15803d' : fillColor;
        var fs = size <= 32 ? 7 : 9;
        var ty = cx + fs * 0.38;
        return '' +
            '<div class="rnc-cl-donut-wrap">' +
                '<svg class="rnc-cl-donut" viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '">' +
                    '<circle cx="' + cx + '" cy="' + cx + '" r="' + r + '" fill="none" stroke="' + trackColor + '" stroke-width="' + sw + '"/>' +
                    '<circle cx="' + cx + '" cy="' + cx + '" r="' + r + '" fill="none" stroke="' + fillColor + '" stroke-width="' + sw + '"' +
                        ' stroke-dasharray="' + filled.toFixed(2) + ' ' + gap.toFixed(2) + '"' +
                        ' stroke-dashoffset="' + offset.toFixed(2) + '"' +
                        ' stroke-linecap="round" transform="rotate(-90 ' + cx + ' ' + cx + ')"/>' +
                    '<text x="' + cx + '" y="' + ty + '" text-anchor="middle" font-size="' + fs + '" font-weight="700" fill="' + textColor + '">' + pct + '%</text>' +
                '</svg>' +
                '<span class="rnc-cl-donut-label">' + done + '/' + total + '</span>' +
            '</div>';
    }

    // numeric, compatível com renderViewChecklist — *1000 + sufixo aleatório evita
    // colisão de ids quando dois itens são criados no mesmo milissegundo (a colisão
    // funde itens no merge 3-vias por id → perda de dados).
    function uid() {
        return (typeof generateId === 'function') ? generateId() : (Date.now() * 1000 + Math.floor(Math.random() * 1000));
    }
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }
    // Gera um literal de string JS seguro para uso dentro de atributo onclick="..."
    function attrStr(s) {
        var jsLit = "'" + String(s == null ? '' : s).replace(/\\/g,'\\\\').replace(/'/g,"\\'") + "'";
        return esc(jsLit);
    }
    function fmtDate(d) {
        if (!d) return '—';
        if (typeof formatBR === 'function') return formatBR(d);
        var p = String(d).split('-');
        return p.length === 3 ? (p[2] + '/' + p[1] + '/' + p[0]) : d;
    }
    function fmtDateTime(iso) {
        if (!iso) return '';
        try {
            var dt = new Date(iso);
            return String(dt.getDate()).padStart(2,'0') + '/' +
                   String(dt.getMonth()+1).padStart(2,'0') + '/' +
                   String(dt.getFullYear()).slice(-2) + ' ' +
                   String(dt.getHours()).padStart(2,'0') + ':' +
                   String(dt.getMinutes()).padStart(2,'0');
        } catch(e) { return ''; }
    }
    function toast(msg, type) {
        if (typeof window.showToast === 'function') window.showToast(msg, type || 'info');
    }
    function canEdit(item) { return typeof userCanEditRnc !== 'function' || userCanEditRnc(item); }
    function canDeleteRnc() { return typeof userIsAdmin === 'function' && userIsAdmin() || (typeof currentuser !== 'undefined' && currentuser && _normTriPerm(currentuser.rncCanEdit, 'total') === 'total'); }
    function canManage() { return typeof userCanManageLists !== 'function' || userCanManageLists('rnc'); }
    function meName() {
        if (typeof currentuser === 'undefined' || !currentuser) return '';
        return String(currentuser.name || currentuser.user || '').trim();
    }
    function persist() { if (typeof saveAll === 'function') saveAll(); }
    function getCI(id) { return CLASSES.find(function(c){ return c.id === id; }) || CLASSES[0]; }

    // Retorna array normalizado de IDs/nomes de responsavel ou revisor (suporta legado string)
    function rncArrField(val) {
        if (Array.isArray(val)) return val;
        if (val && typeof val === 'string') {
            if (val.startsWith('[')) { try { return JSON.parse(val); } catch(_){} }
            return val.trim() ? [val.trim()] : [];
        }
        return [];
    }
    // Resolve array de IDs para nomes, com fallback para o próprio valor
    function rncResolveNames(arr) {
        return arr.map(function(id) {
            if (typeof resolveUserId === 'function') { var n = resolveUserId(id); if (n) return n; }
            var u = (typeof users !== 'undefined' ? users : []).find(function(u){ return u.id === id; });
            return u ? u.name : id;
        });
    }
    function rncNamesHtml(arr) {
        var names = rncResolveNames(arr);
        return names.length ? names.map(function(n){ return esc(n); }).join(', ') : '—';
    }
    function rncNamesChips(arr) {
        var names = rncResolveNames(arr);
        if (!names.length) return '<em class="rnc-vrow-empty">—</em>';
        return '<span class="rnc-person-chips">' +
            names.map(function(n) {
                var initials = n.trim().split(/\s+/).map(function(w){ return w[0]; }).slice(0,2).join('').toUpperCase();
                return '<span class="rnc-person-chip"><span class="rnc-person-chip-avatar">' + esc(initials) + '</span><span class="rnc-person-chip-name">' + esc(n) + '</span></span>';
            }).join('') +
        '</span>';
    }
    function setVal(id, val) { var el = document.getElementById(id); if (el) el.value = val || ''; }
    function getVal(id) { var el = document.getElementById(id); return el ? el.value : ''; }
    function focusEl(id) { var el = document.getElementById(id); if (el) el.focus(); }

    // ── Listas em masterLists ──
    function ensureLists() {
        if (typeof masterLists === 'undefined' || !masterLists) return;
        if (!Array.isArray(masterLists.rncOrigens)) masterLists.rncOrigens = [];
        if (!Array.isArray(masterLists.rncDetalhamentos)) masterLists.rncDetalhamentos = [];
        if (!Array.isArray(masterLists.rncStatus)) masterLists.rncStatus = [];
        if (!Array.isArray(masterLists.rncMarcadores)) masterLists.rncMarcadores = [];
        if (!Array.isArray(masterLists.setores)) masterLists.setores = [];
    }
    function getOrigens() { ensureLists(); return masterLists.rncOrigens; }
    function getDetalhamentos() { ensureLists(); return masterLists.rncDetalhamentos; }
    function getRncStatusList() { ensureLists(); return masterLists.rncStatus; }
    function getSetores() {
        ensureLists();
        return (masterLists.setores || []).slice().sort(function(a,b){
            return String(a).localeCompare(String(b),'pt');
        });
    }
    // Expostas para reuso fora do módulo (ex.: criação rápida de RNC no modal de publicação de rotinas)
    window.getRncOrigens = getOrigens;
    window.getRncDetalhamentos = getDetalhamentos;
    window.getRncSetores = getSetores;

    // ── Confirm modal ──
    function rncConfirm(opts, callback) {
        var el = document.getElementById('rncConfirmModal');
        if (!el) { el = document.createElement('div'); el.id = 'rncConfirmModal'; document.body.appendChild(el); }
        var icon = opts.icon || 'fa-triangle-exclamation';
        var cc = opts.confirmClass || 'oc-confirm-btn-danger';
        el.innerHTML =
            '<div class="oc-confirm-backdrop" id="rncConfirmBackdrop">' +
                '<div class="oc-confirm-box">' +
                    '<div class="oc-confirm-icon-wrap"><i class="fas ' + esc(icon) + ' oc-confirm-icon"></i></div>' +
                    '<div class="oc-confirm-title">' + esc(opts.title || 'Confirmar') + '</div>' +
                    '<div class="oc-confirm-msg">' + esc(opts.message || '') + '</div>' +
                    '<div class="oc-confirm-actions">' +
                        '<button class="oc-confirm-btn-cancel" onclick="document.getElementById(\'rncConfirmModal\').innerHTML=\'\'">Cancelar</button>' +
                        '<button class="' + esc(cc) + '" id="rncConfOkBtn">' + esc(opts.confirmLabel || 'Confirmar') + '</button>' +
                    '</div>' +
                '</div>' +
            '</div>';
        document.getElementById('rncConfOkBtn').onclick = function() { el.innerHTML = ''; callback(); };
        document.getElementById('rncConfirmBackdrop').addEventListener('click', function(e) {
            if (e.target === e.currentTarget) el.innerHTML = '';
        });
    }

    // ── Date matching ──
    function dateMatches(dateStr) {
        var f = rncDateFilter;
        if (f.type === 'all') return true;
        if (!dateStr) return false;
        var d = new Date(dateStr + 'T00:00:00');
        if (f.type === 'month') return d.getFullYear() === f.year && d.getMonth() === f.month;
        if (f.type === 'year')  return d.getFullYear() === f.year;
        if (f.type === 'custom') {
            if (f.ini && dateStr < f.ini) return false;
            if (f.fim && dateStr > f.fim) return false;
            return true;
        }
        return true;
    }

    // ══════════════════════════════════════════════════════════════════
    //  FILTROS
    // ══════════════════════════════════════════════════════════════════

    function getFiltered() {
        var arr = (window.rncItems || []).filter(function(r){ return r && !r.deleted; });
        var restrictToSelf = (typeof userRncTaskView === 'function') && userRncTaskView() === 'usuario';
        var effMode = (restrictToSelf && rncMyMode === 'all') ? 'responsavel' : rncMyMode;
        if (effMode === 'responsavel') {
            var meId = (typeof currentuser !== 'undefined' && currentuser && currentuser.id) ? currentuser.id : null;
            var meName_ = meName().toLowerCase();
            arr = arr.filter(function(r){
                var a = rncArrField(r.responsavel);
                if (!a.length) return false;
                return a.some(function(v){ return (meId && v === meId) || v.toLowerCase() === meName_; });
            });
        } else if (effMode === 'revisor') {
            var meId2 = (typeof currentuser !== 'undefined' && currentuser && currentuser.id) ? currentuser.id : null;
            var meName2 = meName().toLowerCase();
            arr = arr.filter(function(r){
                var a = rncArrField(r.revisor);
                if (!a.length) return false;
                return a.some(function(v){ return (meId2 && v === meId2) || v.toLowerCase() === meName2; });
            });
        }
        if (rncClassFilter) arr = arr.filter(function(r){ return r.classificacao === rncClassFilter; });
        if (rncSetorFilter.length) {
            var ss = rncSetorFilter.map(function(s){ return s.trim().toLowerCase(); });
            arr = arr.filter(function(r){ return setorMatchesAnyCI(r.setor, ss); });
        }
        if (rncOrigemFilter.length) {
            var so = rncOrigemFilter.map(function(s){ return s.trim().toLowerCase(); });
            arr = arr.filter(function(r){ return so.indexOf(String(r.origem || '').trim().toLowerCase()) !== -1; });
        }
        if (rncDetFilter.length) {
            var sd = rncDetFilter.map(function(s){ return s.trim().toLowerCase(); });
            arr = arr.filter(function(r){ return sd.indexOf(String(r.detalhamento || '').trim().toLowerCase()) !== -1; });
        }
        if (rncDateFilter.type !== 'all') {
            arr = arr.filter(function(r){ return dateMatches(r.dataConclusao || r.dataInicio || (r.createdAt || '').slice(0,10)); });
        }
        if (rncSearch) {
            var s = rncSearch;
            arr = arr.filter(function(r){
                var respNames = rncResolveNames(rncArrField(r.responsavel)).join(' ');
                return [r.titulo, setorText(r.setor), r.origem, r.detalhamento, r.descricao, respNames]
                    .some(function(v){ return String(v || '').toLowerCase().indexOf(s) !== -1; });
            });
        }
        arr.sort(function(a,b){
            var da = a.dataConclusao || '';
            var db = b.dataConclusao || '';
            if (!da && !db) return 0;
            if (!da) return 1;
            if (!db) return -1;
            return da > db ? 1 : (da < db ? -1 : 0);
        });
        return arr;
    }

    // ── Helpers de card (metadados + alerta) compartilhados entre vistas ──
    // Linhas de informação no estilo do módulo de Atividades (ícone + texto)
    function rncCardInfoRows(r) {
        var rows = '';
        rows += setorCardRow(r.setor, 'rnc-card-info-row');
        var respArr = rncArrField(r.responsavel);
        if (respArr.length) rows += '<div class="rnc-card-info-row"><i class="fas fa-user"></i> <span>' + rncNamesHtml(respArr) + '</span></div>';
        rows += '<div class="rnc-card-info-row"><i class="far fa-calendar-check"></i> <span>Conclusão: <strong>' + esc(fmtDate(r.dataConclusao)) + '</strong></span></div>';
        return rows;
    }
    function rncCardMetaHtml(r) {
        return '<div class="rnc-card-meta">' + rncCardInfoRows(r) + '</div>';
    }
    // Constrói um card padrão (estilo Atividades) reutilizado em Cards/Origens
    function rncBuildCard(r, opts) {
        opts = opts || {};
        var ci = getCI(r.classificacao);
        var mk = getMarker(r.marcador);
        var cl  = Array.isArray(r.checklist) ? r.checklist : [];
        var clD = cl.filter(function(c){ return c.checked; }).length;
        var donut = cl.length > 0 ? rncDonutHtml(clD, cl.length, 46) : '';
        var actions = (opts.actions && (canEdit(r) || canDeleteRnc())) ?
            '<div class="rnc-card-actions" onclick="event.stopPropagation()">' +
                (canEdit(r) ? '<i class="fas fa-pen" onclick="rncOpenEdit(' + r.id + ')" title="Editar"></i>' : '') +
                (canDeleteRnc() ? '<i class="fas fa-trash danger" onclick="rncDelete(' + r.id + ')" title="Excluir"></i>' : '') +
            '</div>' : '';
        return '<div class="rnc-card' + rncAlertClass(r) + (donut ? ' has-donut' : '') + '" onclick="rncOpenView(' + r.id + ')" style="--rnc-card-accent:' + ci.color + '">' +
            '<div class="rnc-card-main">' +
                '<div class="rnc-card-header">' +
                    '<span class="rnc-class-badge rnc-class-badge--sm" style="' + rncClassStyle(ci) + '">' +
                        '<i class="fas ' + ci.icon + '"></i> ' + esc(ci.label) +
                    '</span>' +
                    rncAlertBadgeHtml(r) +
                    actions +
                '</div>' +
                '<div class="rnc-card-title"><i class="fas ' + ci.icon + '" style="color:' + ci.color + ';margin-right:6px"></i><span class="rnc-card-title-text">' + esc(r.titulo || 'Sem título') + '</span></div>' +
                '<div class="rnc-card-body">' +
                    rncCardInfoRows(r) +
                    '<div class="rnc-card-status-row">' +
                        (r.status ? '<span class="rnc-card-status" style="' + rncStatusColorStyle(r.status) + '">' + esc(r.status) + '</span>' : '<span></span>') +
                        (mk ? '<div class="rnc-card-marker" style="background:' + mk.color + '"><i class="fas ' + mk.icon + '"></i> ' + esc(mk.label) + '</div>' : '') +
                    '</div>' +
                '</div>' +
            '</div>' +
            donut +
        '</div>';
    }
    function rncAlertBadgeHtml(r) {
        var a = (typeof rncAlertState === 'function') ? rncAlertState(r) : null;
        if (!a) return '';
        if (a.state === 'overdue') {
            var n = Math.abs(a.diff);
            return '<span class="rnc-alert-badge rnc-alert-overdue"><i class="fas fa-circle-exclamation"></i> ' + n + ' dia' + (n!==1?'s':'') + ' em atraso</span>';
        }
        var txt = a.diff === 0 ? 'Vence hoje' : 'Vence em ' + a.diff + ' dia' + (a.diff!==1?'s':'');
        return '<span class="rnc-alert-badge rnc-alert-warn"><i class="fas fa-bell"></i> ' + txt + '</span>';
    }
    function rncAlertClass(r) {
        var a = (typeof rncAlertState === 'function') ? rncAlertState(r) : null;
        return a ? (' rnc-card--' + a.state) : '';
    }

    // ── Filter bar actions ──
    window.rncOnSearch = function() {
        rncSearch = (document.getElementById('rncSearchInput').value || '').trim().toLowerCase();
        rncPage = 1; renderRnc();
    };
    window.rncToggleSearch = function() {
        var wrap = document.getElementById('rncSearchWrap');
        var input = document.getElementById('rncSearchInput');
        var btn = document.getElementById('rncSearchToggleBtn');
        if (!wrap || !input) return;
        var show = wrap.style.display === 'none';
        wrap.style.display = show ? '' : 'none';
        if (btn) btn.classList.toggle('active', show);
        if (show) input.focus();
        else { input.value = ''; rncSearch = ''; rncPage = 1; renderRnc(); }
    };
    // No mobile, a barra de filtros tem scroll horizontal — dropdowns absolutos
    // ficariam presos dentro desse scroll. Promove para position:fixed e calcula
    // a posição via JS para flutuar livremente sobre a página.
    function _rncPositionDropdownMobile(btn, dd) {
        if (!btn || !dd) return;
        if (window.innerWidth > 768) {
            dd.classList.remove('rnc-dd-fixed');
            dd.style.top = ''; dd.style.left = ''; dd.style.right = '';
            return;
        }
        var rect = btn.getBoundingClientRect();
        dd.classList.add('rnc-dd-fixed');
        dd.style.top = (rect.bottom + 8) + 'px';
        var ddWidth = dd.offsetWidth || 220;
        var left = rect.right - ddWidth;
        if (left < 8) left = 8;
        if (left + ddWidth > window.innerWidth - 8) left = window.innerWidth - 8 - ddWidth;
        dd.style.left = left + 'px';
        dd.style.right = 'auto';
    }

    var RNC_CLASS_LABELS = { critica: 'NC - Crítica', maior: 'NC - Maior', menor: 'NC - Menor' };
    window.rncToggleClassFilter = function(cls) {
        rncClassFilter = rncClassFilter === cls ? '' : cls;
        var dd = document.getElementById('rncClassDropdown');
        if (dd) dd.querySelectorAll('button').forEach(function(b){
            b.classList.toggle('active', b.getAttribute('data-cls') === rncClassFilter);
        });
        var btn = document.getElementById('rncClassBtn');
        var lbl = document.getElementById('rncClassLabel');
        if (lbl) lbl.textContent = rncClassFilter ? RNC_CLASS_LABELS[rncClassFilter] : 'Classificação';
        if (btn) btn.classList.toggle('active', !!rncClassFilter);
        if (dd) dd.classList.remove('open');
        rncPage = 1; renderRnc();
    };
    window.rncToggleClassDropdown = function() {
        var dd = document.getElementById('rncClassDropdown');
        var btn = document.getElementById('rncClassBtn');
        if (!dd) return;
        var opening = !dd.classList.contains('open');
        dd.classList.toggle('open', opening);
        if (opening) _rncPositionDropdownMobile(btn, dd);
    };

    // ── Filtros de Origem / Detalhamento (multi-seleção, opções só dos cards publicados) ──
    function rncPublishedItems() {
        return (window.rncItems || []).filter(function(r){ return r && !r.deleted; });
    }
    function rncDistinctValues(field) {
        var seen = {}, out = [];
        rncPublishedItems().forEach(function(r){
            var v = String(r[field] || '').trim();
            if (!v || seen[v]) return;
            seen[v] = true; out.push(v);
        });
        return out.sort(function(a,b){ return a.localeCompare(b, 'pt'); });
    }
    function _renderRncFilterChecklist(ddId, values, selected, toggleFn) {
        var dd = document.getElementById(ddId);
        if (!dd) return;
        if (!values.length) {
            dd.innerHTML = '<div class="rnc-filter-empty">Nenhuma opção disponível</div>';
            return;
        }
        dd.innerHTML = values.map(function(v){
            var active = selected.indexOf(v) !== -1;
            return '<button class="' + (active ? 'active' : '') + '" onclick="' + toggleFn + '(\'' + esc(v) + '\')">' +
                '<i class="fas ' + (active ? 'fa-square-check' : 'fa-square') + '"></i> ' + esc(v) +
            '</button>';
        }).join('');
    }
    function updateRncOrigemFilterLabel() {
        var lbl = document.getElementById('rncOrigemFilterLabel');
        var btn = document.getElementById('rncOrigemBtn');
        var n = rncOrigemFilter.length;
        if (lbl) lbl.textContent = n === 0 ? 'Origem' : (n === 1 ? rncOrigemFilter[0] : n + ' origens');
        if (btn) btn.classList.toggle('active', n > 0);
    }
    function updateRncDetFilterLabel() {
        var lbl = document.getElementById('rncDetFilterLabel');
        var btn = document.getElementById('rncDetBtn');
        var n = rncDetFilter.length;
        if (lbl) lbl.textContent = n === 0 ? 'Detalhamento' : (n === 1 ? rncDetFilter[0] : n + ' detalhamentos');
        if (btn) btn.classList.toggle('active', n > 0);
    }
    window.rncToggleOrigemFilterDropdown = function() {
        var dd = document.getElementById('rncOrigemFilterDropdown');
        var btn = document.getElementById('rncOrigemBtn');
        if (!dd) return;
        var opening = !dd.classList.contains('open');
        if (opening) _renderRncFilterChecklist('rncOrigemFilterDropdown', rncDistinctValues('origem'), rncOrigemFilter, 'rncToggleOrigemFilterValue');
        dd.classList.toggle('open', opening);
        if (opening) _rncPositionDropdownMobile(btn, dd);
    };
    window.rncToggleDetFilterDropdown = function() {
        var dd = document.getElementById('rncDetFilterDropdown');
        var btn = document.getElementById('rncDetBtn');
        if (!dd) return;
        var opening = !dd.classList.contains('open');
        if (opening) _renderRncFilterChecklist('rncDetFilterDropdown', rncDistinctValues('detalhamento'), rncDetFilter, 'rncToggleDetFilterValue');
        dd.classList.toggle('open', opening);
        if (opening) _rncPositionDropdownMobile(btn, dd);
    };
    window.rncToggleOrigemFilterValue = function(v) {
        var idx = rncOrigemFilter.indexOf(v);
        if (idx === -1) rncOrigemFilter.push(v); else rncOrigemFilter.splice(idx, 1);
        _renderRncFilterChecklist('rncOrigemFilterDropdown', rncDistinctValues('origem'), rncOrigemFilter, 'rncToggleOrigemFilterValue');
        updateRncOrigemFilterLabel();
        rncPage = 1; renderRnc();
    };
    window.rncToggleDetFilterValue = function(v) {
        var idx = rncDetFilter.indexOf(v);
        if (idx === -1) rncDetFilter.push(v); else rncDetFilter.splice(idx, 1);
        _renderRncFilterChecklist('rncDetFilterDropdown', rncDistinctValues('detalhamento'), rncDetFilter, 'rncToggleDetFilterValue');
        updateRncDetFilterLabel();
        rncPage = 1; renderRnc();
    };
    window.rncSetMyMode = function(mode) {
        rncMyMode = mode;
        var btn = document.getElementById('rncMyBtn');
        var lbl = document.getElementById('rncMyLabel');
        var labels = { responsavel: 'Como responsável', revisor: 'Como revisor', all: "Todas RNC's" };
        if (lbl) lbl.textContent = labels[mode] || "Todas RNC's";
        if (btn) btn.classList.toggle('active', mode !== 'all');
        var dd = document.getElementById('rncMyDropdown');
        if (dd) {
            dd.querySelectorAll('button').forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-mode') === mode); });
            dd.classList.remove('open');
        }
        rncPage = 1; renderRnc();
    };
    window.rncToggleMyDropdown = function() {
        var dd = document.getElementById('rncMyDropdown');
        var btn = document.getElementById('rncMyBtn');
        if (!dd) return;
        var opening = !dd.classList.contains('open');
        dd.classList.toggle('open', opening);
        if (opening) _rncPositionDropdownMobile(btn, dd);
    };
    window.rncClearFilters = function() {
        rncSearch = ''; var si = document.getElementById('rncSearchInput'); if (si) si.value = '';
        rncClassFilter = '';
        var cdd = document.getElementById('rncClassDropdown');
        if (cdd) cdd.querySelectorAll('button').forEach(function(b){ b.classList.remove('active'); });
        var cbtn = document.getElementById('rncClassBtn'); if (cbtn) cbtn.classList.remove('active');
        var clbl = document.getElementById('rncClassLabel'); if (clbl) clbl.textContent = 'Classificação';
        rncSetorFilter = []; rncDateFilter = { type:'all', month:null, year:null, ini:'', fim:'' };
        rncOrigemFilter = []; rncDetFilter = [];
        updateRncOrigemFilterLabel(); updateRncDetFilterLabel();
        var restrictToSelf = (typeof userRncTaskView === 'function') && userRncTaskView() === 'usuario';
        window.rncSetMyMode(restrictToSelf ? 'responsavel' : 'all');
        updateRncSetorHeadLabel(); updateRncDateHeadLabel();
        rncPage = 1; renderRnc();
    };

    // ── Manage dropdown ──
    window.rncToggleManageDropdown = function() {
        var dd = document.getElementById('rncManageDropdown');
        var btn = document.getElementById('rncManageBtn');
        if (!dd) return;
        var opening = !dd.classList.contains('open');
        dd.classList.toggle('open', opening);
        if (opening) _rncPositionDropdownMobile(btn, dd);
    };
    window.rncCloseManageDropdown = function() {
        var dd = document.getElementById('rncManageDropdown'); if (dd) dd.classList.remove('open');
    };

    // ══════════════════════════════════════════════════════════════════
    //  VIEW SYSTEM (Lista / Kanban / Calendário)
    // ══════════════════════════════════════════════════════════════════

    window.switchRncView = function(view) {
        rncView = view;
        ['cards','kanban','calendar'].forEach(function(v) {
            var btn = document.getElementById('rncViewBtn-' + v);
            var pnl = document.getElementById('rncPane-' + v);
            if (btn) btn.classList.toggle('active', v === view);
            if (pnl) pnl.style.display = v === view ? '' : 'none';
        });
        renderRnc();
    };

    function renderRnc() {
        if (rncView === 'cards') {
            var activeSub = document.querySelector('.rnc-list-subtab.active');
            var sub = activeSub ? activeSub.id.replace('rncSubTab','').toLowerCase() : 'origens';
            if (sub === 'table') _renderRncTable();
            else if (sub === 'detalhamento') _renderRncDetalhamentos();
            else _renderRncOrigens();
        }
        else if (rncView === 'kanban')   renderRncKanban();
        else if (rncView === 'calendar') renderRncCalendar();
    }

    window.rncRerender = function () { renderRnc(); };

    // ── Sub-abas da Lista (Tabela / Origens) ──
    window.rncSwitchListTab = function(tab, btn) {
        document.querySelectorAll('.rnc-list-subtab').forEach(function(b){ b.classList.remove('active'); });
        if (btn) btn.classList.add('active');
        ['table','origens','detalhamento'].forEach(function(t){
            var p = document.getElementById('rncListPane-' + t);
            if (p) p.style.display = t === tab ? '' : 'none';
        });
        if (tab === 'table')         { _renderRncTable(); }
        if (tab === 'origens')       { _renderRncOrigens(); }
        if (tab === 'detalhamento')  { _renderRncDetalhamentos(); }
    };

    var rncTableCols = [
        { key: 'titulo', label: 'Título' },
        { key: 'setor', label: 'Setor' },
        { key: 'classificacao', label: 'Classificação' },
        { key: 'origem', label: 'Origem' },
        { key: 'marcador', label: 'Marcador' },
        { key: 'responsavel', label: 'Responsável' },
        { key: 'dataConclusao', label: 'Conclusão' },
        { key: 'status', label: 'Status' }
    ];
    window.rncSortTable = function(col) {
        if (rncTableSort.col === col) {
            rncTableSort.dir = rncTableSort.dir === 'asc' ? 'desc' : 'asc';
        } else {
            rncTableSort.col = col;
            rncTableSort.dir = 'asc';
        }
        _renderRncTable();
    };
    function _sortRncArr(arr) {
        var col = rncTableSort.col, dir = rncTableSort.dir;
        arr.sort(function(a, b) {
            var va = col === 'setor' ? setorText(a.setor) : String(a[col] || '');
            var vb = col === 'setor' ? setorText(b.setor) : String(b[col] || '');
            if (!va && !vb) return 0;
            if (!va) return 1;
            if (!vb) return -1;
            var cmp = va > vb ? 1 : (va < vb ? -1 : 0);
            return dir === 'asc' ? cmp : -cmp;
        });
        return arr;
    }
    function _renderRncTable() {
        var container = document.getElementById('rncTableContent');
        if (!container) return;
        var arr = _sortRncArr(getFiltered());
        if (!arr.length) {
            container.innerHTML = '<div class="rnc-empty"><i class="fas fa-table"></i><p>Nenhuma RNC encontrada.</p></div>';
            return;
        }
        container.innerHTML =
            '<div class="rnc-table-wrap">' +
            '<table class="rnc-table">' +
            '<thead><tr>' +
                rncTableCols.map(function(c) {
                    var active = rncTableSort.col === c.key;
                    var arrow = active ? (rncTableSort.dir === 'asc' ? ' <i class="fas fa-arrow-up"></i>' : ' <i class="fas fa-arrow-down"></i>') : '';
                    return '<th class="rnc-table-th-sort' + (active ? ' active' : '') + '" onclick="rncSortTable(\'' + c.key + '\')">' + c.label + arrow + '</th>';
                }).join('') +
                '<th></th>' +
            '</tr></thead>' +
            '<tbody>' +
            arr.map(function(r) {
                var ci = getCI(r.classificacao);
                var mk = getMarker(r.marcador);
                return '<tr class="rnc-table-row" onclick="rncOpenView(' + r.id + ')">' +
                    '<td class="rnc-table-title">' + esc(r.titulo || '—') + '</td>' +
                    '<td>' + setorCompactHtml(r.setor, '—') + '</td>' +
                    '<td><span class="rnc-class-badge rnc-class-badge--sm" style="' + rncClassStyle(ci) + '"><i class="fas ' + ci.icon + '"></i> ' + esc(ci.label) + '</span></td>' +
                    '<td>' + esc(r.origem || '—') + '</td>' +
                    '<td>' + (mk ? '<span class="rnc-marker-badge" style="background:' + mk.bg + ';color:' + mk.color + '"><i class="fas ' + mk.icon + '"></i> ' + esc(mk.label) + '</span>' : '<span style="color:#cbd5e1">—</span>') + '</td>' +
                    '<td>' + rncNamesHtml(rncArrField(r.responsavel)) + '</td>' +
                    '<td>' + (r.dataConclusao ? esc(fmtDate(r.dataConclusao)) : '<span style="color:#cbd5e1">—</span>') + '</td>' +
                    '<td>' + (r.status ? '<span class="rnc-card-status" style="' + rncStatusColorStyle(r.status) + '">' + esc(r.status) + '</span>' : '<span style="color:#cbd5e1">—</span>') + '</td>' +
                    '<td onclick="event.stopPropagation()">' +
                        ((canEdit(r) || canDeleteRnc()) ? '<div style="display:flex;gap:4px">' +
                            (canEdit(r) ? '<button class="rnc-tbl-btn" onclick="rncOpenEdit(' + r.id + ')" title="Editar"><i class="fas fa-pen"></i></button>' : '') +
                            (canDeleteRnc() ? '<button class="rnc-tbl-btn danger" onclick="rncDelete(' + r.id + ')" title="Excluir"><i class="fas fa-trash"></i></button>' : '') +
                        '</div>' : '') +
                    '</td>' +
                '</tr>';
            }).join('') +
            '</tbody></table></div>';
    }

    function _renderRncOrigens() {
        var container = document.getElementById('rncOrigensContent');
        if (!container) return;
        var arr = getFiltered();
        if (!arr.length) {
            container.innerHTML = '<div class="rnc-empty"><i class="fas fa-folder-open"></i><p>Nenhuma RNC encontrada.</p></div>';
            return;
        }
        var groups = {};
        arr.forEach(function(r) {
            var key = r.origem || 'Sem Origem';
            if (!groups[key]) groups[key] = [];
            groups[key].push(r);
        });
        var keys = Object.keys(groups).sort(function(a,b){ return a.localeCompare(b,'pt'); });
        container.innerHTML = keys.map(function(orig) {
            var items = groups[orig];
            var isOpen = rncOpenFolders.origens.indexOf(orig) !== -1;
            return '<div class="rnc-origem-folder' + (isOpen ? ' open' : '') + '">' +
                '<div class="rnc-origem-folder-header" onclick="rncToggleFolderOpen(\'origens\',' + attrStr(orig) + ');this.parentElement.classList.toggle(\'open\')">' +
                    '<div class="rnc-origem-folder-title">' +
                        '<i class="fas fa-folder rnc-folder-icon-closed"></i>' +
                        '<i class="fas fa-folder-open rnc-folder-icon-open"></i>' +
                        '<span>' + esc(orig) + '</span>' +
                    '</div>' +
                    '<span class="rnc-origem-folder-count">' + items.length + '</span>' +
                '</div>' +
                '<div class="rnc-origem-folder-body">' +
                '<div class="rnc-origem-cards-grid">' +
                items.map(function(r) {
                    return rncBuildCard(r, { actions: false });
                }).join('') +
                '</div>' +
                '</div>' +
            '</div>';
        }).join('');
    }

    function _renderRncDetalhamentos() {
        var container = document.getElementById('rncDetalhamentoContent');
        if (!container) return;
        var arr = getFiltered();
        if (!arr.length) {
            container.innerHTML = '<div class="rnc-empty"><i class="fas fa-folder-open"></i><p>Nenhuma RNC encontrada.</p></div>';
            return;
        }
        var groups = {};
        arr.forEach(function(r) {
            var key = r.detalhamento || 'Sem Detalhamento';
            if (!groups[key]) groups[key] = [];
            groups[key].push(r);
        });
        var keys = Object.keys(groups).sort(function(a,b){ return a.localeCompare(b,'pt'); });
        container.innerHTML = keys.map(function(det) {
            var items = groups[det];
            var isOpen = rncOpenFolders.detalhamento.indexOf(det) !== -1;
            return '<div class="rnc-origem-folder' + (isOpen ? ' open' : '') + '">' +
                '<div class="rnc-origem-folder-header" onclick="rncToggleFolderOpen(\'detalhamento\',' + attrStr(det) + ');this.parentElement.classList.toggle(\'open\')">' +
                    '<div class="rnc-origem-folder-title">' +
                        '<i class="fas fa-folder rnc-folder-icon-closed"></i>' +
                        '<i class="fas fa-folder-open rnc-folder-icon-open"></i>' +
                        '<span>' + esc(det) + '</span>' +
                    '</div>' +
                    '<span class="rnc-origem-folder-count">' + items.length + '</span>' +
                '</div>' +
                '<div class="rnc-origem-folder-body">' +
                '<div class="rnc-origem-cards-grid">' +
                items.map(function(r) {
                    return rncBuildCard(r, { actions: false });
                }).join('') +
                '</div>' +
                '</div>' +
            '</div>';
        }).join('');
    }

    // ── Mapa de cores do kanban (igual ao kanban.js) ──
    var RNC_COLOR_MAP = {
        blue:    'var(--rnc-blue,    #3b82f6)',
        green:   'var(--rnc-green,   #22c55e)',
        red:     'var(--rnc-red,     #ef4444)',
        orange:  'var(--rnc-orange,  #f97316)',
        yellow:  'var(--rnc-yellow,  #eab308)',
        purple:  'var(--rnc-purple,  #a855f7)',
        pink:    'var(--rnc-pink,    #ec4899)',
        teal:    'var(--rnc-teal,    #14b8a6)',
        default: 'var(--rnc-default, #94a3b8)'
    };
    function rncResolveColor(colorKey) {
        return RNC_COLOR_MAP[colorKey] || RNC_COLOR_MAP.default;
    }
    // Estilo inline (bg/cor/borda) para o badge de status, igual ao usado no Kanban
    function rncStatusColorStyle(statusName) {
        var s = getRncStatusList().find(function(x){ return x.name === statusName; });
        var color = rncResolveColor(s ? s.color : null);
        if (document.body.classList.contains('dark-mode')) {
            return 'background:color-mix(in srgb,' + color + ' 18%,#1e293b);color:' + color + ';border-color:color-mix(in srgb,' + color + ' 40%,#334155)';
        }
        return 'background:color-mix(in srgb,' + color + ' 14%,#fff);color:' + color + ';border-color:color-mix(in srgb,' + color + ' 35%,#fff)';
    }

    // ── KANBAN ──
    function renderRncKanban() {
        var board = document.getElementById('rncKanbanBoard');
        if (!board) return;
        _rncCloseManagePopover();
        ensureLists();
        var statuses = getRncStatusList();
        var arr = getFiltered();
        if (statuses.length === 0) {
            board.innerHTML =
                '<div class="rnc-empty" style="flex-direction:column;align-items:center;">' +
                    '<i class="fas fa-columns" style="font-size:48px;opacity:.3;margin-bottom:16px;"></i>' +
                    '<p>Nenhum status cadastrado.</p>' +
                    (canManage() ? '<button class="rnc-btn-add-status" style="margin-top:12px" onclick="rncOpenManager(\'status\')"><i class="fas fa-plus"></i> Adicionar Status</button>' : '') +
                '</div>';
            return;
        }
        var canMng = canManage();
        board.innerHTML = statuses.map(function(s, idx) {
            var color = rncResolveColor(s.color);
            var itemsAll = arr.filter(function(r){ return r.status === s.name; });
            if (s.finalKind === 'concluido' || s.finalKind === 'cancelado') {
                itemsAll = itemsAll.slice().sort(function(a,b){ return (b.id||0) - (a.id||0); });
            }
            var collapsed = !!s.collapsed;

            var totalPages = Math.max(1, Math.ceil(itemsAll.length / RNC_CARDS_PER_PAGE));
            var curPage = _rncColPage[s.name] || 1;
            if (curPage > totalPages) curPage = totalPages;
            if (curPage < 1) curPage = 1;
            _rncColPage[s.name] = curPage;
            var pageStart = (curPage - 1) * RNC_CARDS_PER_PAGE;
            var items = itemsAll.slice(pageStart, pageStart + RNC_CARDS_PER_PAGE);

            return '<div class="rnc-kb-col">' +
                '<div class="rnc-kb-col-header" style="--rnc-col-color:' + color + '">' +
                    '<div class="rnc-kb-col-title-row">' +
                        '<span class="rnc-kb-col-dot"></span>' +
                        '<span class="rnc-kb-col-name">' + esc(s.name) + '</span>' +
                        '<span class="rnc-kb-col-count">' + itemsAll.length + '</span>' +
                    '</div>' +
                    '<div class="rnc-kb-col-bottom">' +
                        '<div class="rnc-kb-col-ctrl">' +
                        (canMng ? '<button class="rnc-kb-col-act rnc-kb-manage-btn" title="Gerenciar coluna" onclick="rncToggleManagePopover(event,' + idx + ')"><i class="fas fa-ellipsis-v"></i></button>' : '') +
                        '</div>' +
                        '<div class="rnc-kb-col-pagination">' +
                        (totalPages > 1 ?
                            '<button class="rnc-kb-page-btn" title="Página anterior" onclick="rncChangeColPage(\'' + esc(s.name) + '\',-1)"' + (curPage <= 1 ? ' disabled' : '') + '><i class="fas fa-chevron-left"></i></button>' +
                            '<span class="rnc-kb-page-info">' + curPage + ' / ' + totalPages + '</span>' +
                            '<button class="rnc-kb-page-btn" title="Próxima página" onclick="rncChangeColPage(\'' + esc(s.name) + '\',1)"' + (curPage >= totalPages ? ' disabled' : '') + '><i class="fas fa-chevron-right"></i></button>'
                        : '') +
                        '</div>' +
                        '<div class="rnc-kb-col-ctrl-right">' +
                        '<button class="rnc-kb-col-act rnc-kb-col-collapse" title="' + (collapsed ? 'Mostrar coluna' : 'Ocultar coluna') + '" onclick="rncToggleColCollapse(' + idx + ')"><i class="fas fa-chevron-' + (collapsed ? 'down' : 'up') + '"></i></button>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                (collapsed ?
                    '<div class="rnc-kb-cards rnc-kb-cards-collapsed" data-status="' + esc(s.name) + '"></div>'
                :
                    '<div class="rnc-kb-cards" data-status="' + esc(s.name) + '">' +
                        (items.length > 0 ? items.map(function(r) {
                            var ci = getCI(r.classificacao);
                            var mk = getMarker(r.marcador);
                            var cl  = Array.isArray(r.checklist) ? r.checklist : [];
                            var clD = cl.filter(function(c){ return c.checked; }).length;
                            var donut = cl.length > 0 ? rncDonutHtml(clD, cl.length, 38) : '';
                            var canEditCard = canEdit(r);
                            var kbActions = (canEditCard || canDeleteRnc()) ?
                                '<div class="rnc-kb-card-actions" onclick="event.stopPropagation()">' +
                                    (canEditCard ? '<button class="rnc-kb-card-act" onclick="rncOpenEdit(' + r.id + ')" title="Editar"><i class="fas fa-pen"></i></button>' : '') +
                                    (canDeleteRnc() ? '<button class="rnc-kb-card-act danger" onclick="rncDelete(' + r.id + ')" title="Excluir"><i class="fas fa-trash"></i></button>' : '') +
                                '</div>' : '';
                            return '<div class="rnc-kb-card' + rncAlertClass(r) + (donut ? ' has-donut' : '') + (mk ? ' has-marker' : '') + '"' +
                                (canEditCard ? ' draggable="true"' : '') + ' data-id="' + r.id + '"' +
                                ' onclick="rncOpenView(' + r.id + ')" style="--rnc-kb-card-color:' + ci.color + '">' +
                                '<div class="rnc-kb-card-main">' +
                                    '<div class="rnc-kb-card-title-row">' +
                                        '<div class="rnc-kb-card-title"><i class="fas ' + ci.icon + '" style="color:' + ci.color + ';margin-right:5px"></i><span class="rnc-kb-card-title-text">' + esc(r.titulo || 'Sem título') + '</span></div>' +
                                        kbActions +
                                    '</div>' +
                                    rncCardMetaHtml(r) +
                                    rncAlertBadgeHtml(r) +
                                    (mk ? '<span class="rnc-kb-card-marker" style="background:' + mk.color + '"><i class="fas ' + mk.icon + '"></i> ' + esc(mk.label) + '</span>' : '') +
                                '</div>' +
                                donut +
                            '</div>';
                        }).join('') : '') +
                        '<div class="rnc-kb-empty"' + (itemsAll.length > 0 ? ' style="display:none"' : '') + '><i class="fas fa-inbox"></i><span>Nenhum item</span></div>' +
                    '</div>'
                ) +
            '</div>';
        }).join('');
        _rncKanbanBindDnd(board);
        initRncKanbanMobileSwipe();
    }

    // ── Ações do cabeçalho da coluna (mover / ocultar) ──
    window.rncMoveStatusCol = function(idx, dir) {
        if (!canManage()) { toast('Sem permissão para gerenciar listas.', 'error'); return; }
        var list = getRncStatusList();
        var newIdx = idx + dir;
        if (newIdx < 0 || newIdx >= list.length) return;
        var tmp = list[idx]; list[idx] = list[newIdx]; list[newIdx] = tmp;
        persist(); renderRncKanban();
    };
    window.rncToggleColCollapse = function(idx) {
        var list = getRncStatusList();
        var s = list[idx]; if (!s) return;
        s.collapsed = !s.collapsed;
        persist(); renderRncKanban();
    };
    window.rncEditStatusCol = function(idx) {
        rncOpenColumnEditModal(idx);
    };
    window.rncChangeColPage = function(statusName, delta) {
        _rncColPage[statusName] = (_rncColPage[statusName] || 1) + delta;
        if (_rncColPage[statusName] < 1) _rncColPage[statusName] = 1;
        renderRncKanban();
    };

    // ── Popover de gerenciamento de coluna (mover / editar / excluir) ──
    function _rncCloseManagePopover() {
        var existing = document.getElementById('rncManagePopover');
        if (existing) existing.remove();
        document.removeEventListener('click', _rncManagePopoverOutsideClick, true);
    }
    function _rncManagePopoverOutsideClick(e) {
        var pop = document.getElementById('rncManagePopover');
        if (pop && !pop.contains(e.target)) _rncCloseManagePopover();
    }
    window.rncToggleManagePopover = function(event, idx) {
        event.stopPropagation();
        var existing = document.getElementById('rncManagePopover');
        if (existing) {
            var wasSameCol = existing.dataset.idx === String(idx);
            _rncCloseManagePopover();
            if (wasSameCol) return;
        }
        var list = getRncStatusList();
        var isFirst = idx === 0;
        var isLast = idx === list.length - 1;

        var pop = document.createElement('div');
        pop.id = 'rncManagePopover';
        pop.className = 'rnc-kb-manage-popover';
        pop.dataset.idx = String(idx);
        pop.innerHTML =
            '<button class="rnc-kb-manage-item"' + (isFirst ? ' disabled' : '') + ' onclick="_rncCloseManagePopoverPublic(); rncMoveStatusCol(' + idx + ',-1)"><i class="fas fa-arrow-left"></i> Mover esquerda</button>' +
            '<button class="rnc-kb-manage-item"' + (isLast ? ' disabled' : '') + ' onclick="_rncCloseManagePopoverPublic(); rncMoveStatusCol(' + idx + ',1)"><i class="fas fa-arrow-right"></i> Mover direita</button>' +
            '<button class="rnc-kb-manage-item" onclick="_rncCloseManagePopoverPublic(); rncEditStatusCol(' + idx + ')"><i class="fas fa-pen"></i> Editar coluna</button>' +
            '<button class="rnc-kb-manage-item rnc-kb-manage-item-danger" onclick="_rncCloseManagePopoverPublic(); rncRemoveStatusCol(' + idx + ')"><i class="fas fa-trash"></i> Excluir coluna</button>';

        var btn = event.currentTarget;
        btn.parentElement.style.position = 'relative';
        btn.parentElement.appendChild(pop);
        setTimeout(function(){ document.addEventListener('click', _rncManagePopoverOutsideClick, true); }, 0);
    };
    window._rncCloseManagePopoverPublic = _rncCloseManagePopover;

    // ── Modal moderno de edição de coluna do Kanban ──
    var _rncColEditIdx = null;
    var _rncColEditColor = 'default';
    function rncOpenColumnEditModal(idx) {
        var list = getRncStatusList();
        var item = list[idx]; if (!item) return;
        _rncColEditIdx = idx;
        _rncColEditColor = item.color || 'default';
        var el = document.getElementById('rncColEditModal');
        if (!el) { el = document.createElement('div'); el.id = 'rncColEditModal'; document.body.appendChild(el); }
        el.innerHTML =
            '<div class="rnc-coledit-backdrop" id="rncColEditBackdrop" onclick="if(event.target===this)rncCloseColumnEditModal()">' +
                '<div class="rnc-coledit-box">' +
                    '<div class="rnc-coledit-header">' +
                        '<div class="rnc-coledit-icon"><i class="fas fa-columns"></i></div>' +
                        '<div>' +
                            '<div class="rnc-coledit-title">Editar coluna</div>' +
                            '<div class="rnc-coledit-subtitle">Personalize o nome, a cor e o tipo de encerramento</div>' +
                        '</div>' +
                        '<button class="rnc-coledit-close" onclick="rncCloseColumnEditModal()"><i class="fas fa-times"></i></button>' +
                    '</div>' +
                    '<div class="rnc-coledit-body">' +
                        '<div class="field-group">' +
                            '<label class="field-label">Nome da coluna</label>' +
                            '<input type="text" id="rncColEditName" class="form-input" value="' + esc(item.name) + '" placeholder="Nome do status...">' +
                        '</div>' +
                        '<div class="field-group">' +
                            '<label class="field-label">Cor</label>' +
                            '<div class="rnc-coledit-colors" id="rncColEditColors"></div>' +
                        '</div>' +
                        '<div class="field-group">' +
                            '<label class="field-label">Encerramento</label>' +
                            '<div class="rnc-coledit-final">' +
                                '<button type="button" class="rnc-final-toggle' + (item.finalKind === 'concluido' ? ' active-ok' : '') + '" id="rncColEditFinalOk" onclick="rncColEditPickFinal(\'concluido\')"><i class="fas fa-circle-check"></i> Concluído</button>' +
                                '<button type="button" class="rnc-final-toggle' + (item.finalKind === 'cancelado' ? ' active-cancel' : '') + '" id="rncColEditFinalCancel" onclick="rncColEditPickFinal(\'cancelado\')"><i class="fas fa-circle-xmark"></i> Cancelado</button>' +
                            '</div>' +
                            '<span class="rnc-coledit-hint">Cards nesta coluna param de gerar alertas de prazo quando marcada como Concluído ou Cancelado.</span>' +
                        '</div>' +
                    '</div>' +
                    '<div class="rnc-coledit-footer">' +
                        '<button class="btn-cancel" onclick="rncCloseColumnEditModal()">Cancelar</button>' +
                        '<button class="btn-save" onclick="rncSaveColumnEditModal()"><i class="fas fa-check"></i> Salvar</button>' +
                    '</div>' +
                '</div>' +
            '</div>';
        _renderRncColEditColors();
        requestAnimationFrame(function(){ el.querySelector('.rnc-coledit-backdrop').classList.add('open'); });
        var nameInput = document.getElementById('rncColEditName');
        if (nameInput) { nameInput.focus(); nameInput.select(); }
    }
    function _renderRncColEditColors() {
        var wrap = document.getElementById('rncColEditColors');
        if (!wrap) return;
        wrap.innerHTML = RNC_PALETTE.map(function(p) {
            return '<button type="button" class="rnc-color-dot-btn' + (_rncColEditColor===p.key?' active':'') + '" ' +
                'style="background:' + p.hex + '" title="' + p.key + '" onclick="rncColEditPickColor(\'' + p.key + '\')">' +
                '<i class="fas fa-check"></i>' +
            '</button>';
        }).join('');
    }
    window.rncColEditPickColor = function(key) {
        _rncColEditColor = key;
        _renderRncColEditColors();
    };
    window.rncColEditPickFinal = function(kind) {
        var list = getRncStatusList();
        var item = list[_rncColEditIdx]; if (!item) return;
        var current = item._pendingFinalKind !== undefined ? item._pendingFinalKind : item.finalKind;
        item._pendingFinalKind = (current === kind) ? null : kind;
        var ok = document.getElementById('rncColEditFinalOk');
        var cancel = document.getElementById('rncColEditFinalCancel');
        if (ok) ok.classList.toggle('active-ok', item._pendingFinalKind === 'concluido');
        if (cancel) cancel.classList.toggle('active-cancel', item._pendingFinalKind === 'cancelado');
    };
    window.rncCloseColumnEditModal = function() {
        var el = document.getElementById('rncColEditModal');
        if (!el) return;
        var bk = el.querySelector('.rnc-coledit-backdrop');
        if (bk) bk.classList.remove('open');
        setTimeout(function(){ el.innerHTML = ''; }, 150);
        var list = getRncStatusList();
        var item = list[_rncColEditIdx];
        if (item) delete item._pendingFinalKind;
        _rncColEditIdx = null;
    };
    window.rncSaveColumnEditModal = function() {
        var list = getRncStatusList();
        var item = list[_rncColEditIdx]; if (!item) { rncCloseColumnEditModal(); return; }
        var newName = (getVal('rncColEditName') || '').trim();
        if (!newName) { toast('Informe o nome.', 'error'); return; }
        if (list.some(function(x, i){ return i !== _rncColEditIdx && String(x.name).trim().toLowerCase() === newName.toLowerCase(); })) {
            toast('Já existe uma coluna com este nome.', 'warn'); return;
        }
        item.name = newName;
        item.color = _rncColEditColor;
        if (item._pendingFinalKind !== undefined) {
            var finalKind = item._pendingFinalKind;
            if (finalKind) list.forEach(function(s, i){ if (i !== _rncColEditIdx && s.finalKind === finalKind) s.finalKind = null; });
            item.finalKind = finalKind;
            delete item._pendingFinalKind;
        }
        persist(); renderRnc();
        toast('Coluna atualizada.', 'success');
        rncCloseColumnEditModal();
    };
    window.rncRemoveStatusCol = function(idx) {
        rncManagerKind = 'status';
        rncManagerRemove(idx);
    };

    // ── Drag & drop entre colunas do kanban ──
    var _rncDragId = null;
    function _rncKanbanBindDnd(board) {
        var cards = board.querySelectorAll('.rnc-kb-card[draggable="true"]');
        cards.forEach(function(card) {
            card.addEventListener('dragstart', function(e) {
                _rncDragId = card.getAttribute('data-id');
                card.classList.add('rnc-kb-card-dragging');
                if (e.dataTransfer) {
                    e.dataTransfer.effectAllowed = 'move';
                    try { e.dataTransfer.setData('text/plain', _rncDragId); } catch (_) {}
                }
            });
            card.addEventListener('dragend', function() {
                card.classList.remove('rnc-kb-card-dragging');
                _rncDragId = null;
                board.querySelectorAll('.rnc-kb-cards.rnc-kb-drop-over')
                     .forEach(function(z){ z.classList.remove('rnc-kb-drop-over'); });
            });
        });
        var zones = board.querySelectorAll('.rnc-kb-cards[data-status]');
        zones.forEach(function(zone) {
            zone.addEventListener('dragover', function(e) {
                if (_rncDragId == null) return;
                e.preventDefault();
                if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
                zone.classList.add('rnc-kb-drop-over');
            });
            zone.addEventListener('dragleave', function(e) {
                if (e.target === zone) zone.classList.remove('rnc-kb-drop-over');
            });
            zone.addEventListener('drop', function(e) {
                e.preventDefault();
                zone.classList.remove('rnc-kb-drop-over');
                var id = _rncDragId || (e.dataTransfer && e.dataTransfer.getData('text/plain'));
                if (id == null) return;
                _rncMoveCardToStatus(Number(id), zone.getAttribute('data-status'));
            });
        });
    }

    function _rncMoveCardToStatus(id, newStatus) {
        var r = (window.rncItems || []).find(function(x){ return x.id === id; });
        if (!r || r.status === newStatus) return;
        if (!canEdit(r)) { toast('Sem permissão para mover este card.', 'error'); return; }
        r.status = newStatus;
        r.updatedAt = new Date().toISOString();
        // Overlay de carregamento enquanto o novo status vai pro banco
        if (typeof window._saveAllWithLoading === 'function') {
            window._saveAllWithLoading('Movendo card para "' + newStatus + '"...');
        } else {
            persist();
        }
        renderRncKanban();
    }

    // ══════════════════════════════════════════════════════════════════
    //  CALENDÁRIO (espelha o módulo de Atividades: mensal/semanal,
    //  visualização por RNC / Publicação / Ambos)
    // ══════════════════════════════════════════════════════════════════
    var rncCalMode   = 'monthly';                       // 'monthly' | 'weekly'
    var rncCalWeek   = _rncWeekStart(new Date());       // segunda-feira da semana
    var rncCalFilter = 'rnc';                           // 'rnc' | 'publicacoes' | 'ambos'
    var RNC_WEEKDAYS = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];

    function _rncWeekStart(date) {
        var d = new Date(date);
        var day = d.getDay();
        var diff = (day === 0) ? -6 : 1 - day;
        d.setDate(d.getDate() + diff);
        d.setHours(0,0,0,0);
        return d;
    }
    function _rncDateStr(d) {
        return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    }
    function _rncToday() { var t = new Date(); t.setHours(0,0,0,0); return t; }
    function _rncTrunc(s, max) { s = s || ''; return s.length > max ? s.slice(0, max) + '…' : s; }

    // ── Monta mapa dia → eventos (tarefas RNC + publicações) ──
    function _rncCalBuildDayMap(rangeStart, rangeEnd) {
        var arr = getFiltered();
        var map = {};
        function push(ds, entry) { if (!map[ds]) map[ds] = []; map[ds].push(entry); }

        arr.forEach(function(r) {
            // RNCs: no dia da conclusão (ou início como fallback)
            if (rncCalFilter !== 'publicacoes') {
                var ds = (r.dataConclusao || r.dataInicio || '').slice(0,10);
                if (ds) {
                    var d = new Date(ds + 'T00:00:00');
                    if (d >= rangeStart && d <= rangeEnd) push(ds, { item: r, type: 'rnc' });
                }
            }
            // Publicações registradas
            if (rncCalFilter !== 'rnc') {
                (r.publicacoes || []).forEach(function(pub, pubIdx) {
                    if (!pub.data) return;
                    var pd = new Date(pub.data + 'T00:00:00');
                    if (pd >= rangeStart && pd <= rangeEnd) {
                        push(pub.data.slice(0,10), { item: r, type: 'publicacao', pub: pub, pubIdx: pubIdx });
                    }
                });
            }
        });
        return map;
    }

    function renderRncCalendar() {
        var board = document.getElementById('rncCalendarBoard');
        if (!board) return;
        var now = new Date();
        if (!rncCalYear) rncCalYear = now.getFullYear();
        if (rncCalMonth === null) rncCalMonth = now.getMonth();

        board.innerHTML = '';
        board.appendChild(_rncCalHeader());
        var grade = document.createElement('div');
        grade.id = 'rncCalGrade';
        board.appendChild(grade);
        _rncCalRenderGrade();
    }

    function _rncCalRenderGrade() {
        var grade = document.getElementById('rncCalGrade');
        if (!grade) return;
        if (rncCalMode === 'monthly') _rncCalRenderMonthly(grade);
        else _rncCalRenderWeekly(grade);
    }

    // ── Header (navegação + filtros de visualização/modo) ──
    function _rncCalHeader() {
        var wrap = document.createElement('div');
        wrap.className = 'rnc-cal-header';

        var nav = document.createElement('div');
        nav.className = 'rnc-cal-nav-area';
        var prev = document.createElement('button');
        prev.className = 'rnc-cal-nav-btn';
        prev.innerHTML = '<i class="fas fa-chevron-left"></i>';
        prev.onclick = function(){ _rncCalNavigate(-1); };
        var today = document.createElement('button');
        today.className = 'rnc-cal-today-btn';
        today.textContent = 'Hoje';
        today.onclick = _rncCalGoToday;
        var title = document.createElement('span');
        title.className = 'rnc-cal-nav-title';
        title.id = 'rncCalNavTitle';
        title.textContent = _rncCalNavTitle();
        var next = document.createElement('button');
        next.className = 'rnc-cal-nav-btn';
        next.innerHTML = '<i class="fas fa-chevron-right"></i>';
        next.onclick = function(){ _rncCalNavigate(1); };
        nav.appendChild(prev); nav.appendChild(today); nav.appendChild(title); nav.appendChild(next);

        var ctrl = document.createElement('div');
        ctrl.className = 'rnc-cal-ctrl-area';
        ctrl.appendChild(_rncCalViewFilter());
        ctrl.appendChild(_rncCalModeToggle());

        wrap.appendChild(nav);
        wrap.appendChild(ctrl);
        return wrap;
    }

    function _rncCalNavTitle() {
        if (rncCalMode === 'monthly') return MONTH_NAMES[rncCalMonth] + ' ' + rncCalYear;
        var end = new Date(rncCalWeek); end.setDate(end.getDate() + 6);
        var sm = MONTH_NAMES[rncCalWeek.getMonth()], em = MONTH_NAMES[end.getMonth()];
        if (sm === em) return rncCalWeek.getDate() + ' – ' + end.getDate() + ' de ' + sm + ' ' + end.getFullYear();
        return rncCalWeek.getDate() + ' ' + sm + ' – ' + end.getDate() + ' ' + em + ' ' + end.getFullYear();
    }

    function _rncCalViewFilter() {
        var wrap = document.createElement('div');
        wrap.className = 'rnc-cal-vf-wrap';
        var labels = { rnc: 'RNCs', publicacoes: 'Publicações', ambos: 'Ambos' };
        var btn = document.createElement('button');
        btn.className = 'rnc-cal-vf-btn' + (rncCalFilter !== 'ambos' ? ' active' : '');
        btn.id = 'rncCalVfBtn';
        btn.innerHTML = '<i class="fas fa-eye"></i> <span>' + labels[rncCalFilter] + '</span> <i class="fas fa-caret-down" style="margin-left:4px;font-size:11px"></i>';
        btn.onclick = function(e){
            e.stopPropagation();
            var dd = document.getElementById('rncCalVfDropdown');
            if (!dd) return;
            var opening = dd.style.display !== 'block';
            dd.style.display = opening ? 'block' : 'none';
            if (opening) _rncPositionDropdownMobile(btn, dd);
            else { dd.classList.remove('rnc-dd-fixed'); dd.style.top = ''; dd.style.left = ''; dd.style.right = ''; }
        };
        var dd = document.createElement('div');
        dd.className = 'rnc-cal-vf-dropdown';
        dd.id = 'rncCalVfDropdown';
        var opts = [
            { v:'rnc',         l:'RNCs',        d:'Exibe as RNCs na agenda',        icon:'fa-clipboard-list' },
            { v:'publicacoes', l:'Publicações', d:'Exibe as publicações na agenda', icon:'fa-paper-plane' },
            { v:'ambos',       l:'Ambos',       d:'RNCs e publicações',             icon:'fa-layer-group' }
        ];
        dd.innerHTML = opts.map(function(o){
            return '<button class="rnc-cal-vf-opt' + (rncCalFilter===o.v?' active':'') + '" data-v="' + o.v + '">' +
                '<i class="fas ' + o.icon + '"></i>' +
                '<span class="rnc-cal-vf-opt-txt"><span class="rnc-cal-vf-opt-l">' + o.l + '</span><span class="rnc-cal-vf-opt-d">' + o.d + '</span></span>' +
            '</button>';
        }).join('');
        dd.querySelectorAll('.rnc-cal-vf-opt').forEach(function(b){
            b.onclick = function(){ rncCalFilter = b.getAttribute('data-v'); dd.style.display = 'none'; renderRncCalendar(); };
        });
        wrap.appendChild(btn); wrap.appendChild(dd);
        return wrap;
    }

    function _rncCalModeToggle() {
        var wrap = document.createElement('div');
        wrap.className = 'rnc-cal-mode-toggle';
        var m = document.createElement('button');
        m.className = 'rnc-cal-mode-tab' + (rncCalMode === 'monthly' ? ' active' : '');
        m.innerHTML = '<i class="fas fa-calendar-alt"></i> Mensal';
        m.onclick = function(){ rncCalMode = 'monthly'; renderRncCalendar(); };
        var w = document.createElement('button');
        w.className = 'rnc-cal-mode-tab' + (rncCalMode === 'weekly' ? ' active' : '');
        w.innerHTML = '<i class="fas fa-calendar-week"></i> Semanal';
        w.onclick = function(){ rncCalMode = 'weekly'; renderRncCalendar(); };
        wrap.appendChild(m); wrap.appendChild(w);
        return wrap;
    }

    function _rncCalNavigate(dir) {
        if (rncCalMode === 'monthly') {
            rncCalMonth += dir;
            if (rncCalMonth < 0)  { rncCalMonth = 11; rncCalYear--; }
            if (rncCalMonth > 11) { rncCalMonth = 0;  rncCalYear++; }
        } else {
            var d = new Date(rncCalWeek); d.setDate(d.getDate() + dir * 7); rncCalWeek = d;
        }
        var t = document.getElementById('rncCalNavTitle');
        if (t) t.textContent = _rncCalNavTitle();
        _rncCalRenderGrade();
    }
    function _rncCalGoToday() {
        var now = new Date();
        rncCalYear = now.getFullYear(); rncCalMonth = now.getMonth();
        rncCalWeek = _rncWeekStart(now);
        renderRncCalendar();
    }
    // Compat: navegação antiga
    window.rncCalPrev = function(){ _rncCalNavigate(-1); };
    window.rncCalNext = function(){ _rncCalNavigate(1); };

    // ── Renderização mensal ──
    function _rncCalRenderMonthly(container) {
        var rangeStart = new Date(rncCalYear, rncCalMonth, 1);
        var rangeEnd   = new Date(rncCalYear, rncCalMonth + 1, 0);
        var map = _rncCalBuildDayMap(rangeStart, rangeEnd);
        var today = _rncToday();

        var grid = document.createElement('div');
        grid.className = 'rnc-cal-monthly-grid';
        RNC_WEEKDAYS.forEach(function(d){
            var th = document.createElement('div'); th.className = 'rnc-cal-wd-header'; th.textContent = d; grid.appendChild(th);
        });

        var startDow = rangeStart.getDay(); startDow = (startDow === 0) ? 6 : startDow - 1;
        for (var i = 0; i < startDow; i++) {
            var em = document.createElement('div'); em.className = 'rnc-cal-day-cell rnc-cal-day-other'; grid.appendChild(em);
        }
        var daysInMonth = rangeEnd.getDate();
        for (var dd = 1; dd <= daysInMonth; dd++) {
            (function(dd){
                var dateObj = new Date(rncCalYear, rncCalMonth, dd);
                var ds = _rncDateStr(dateObj);
                var isToday = dateObj.getTime() === today.getTime();
                var entries = map[ds] || [];
                var cell = document.createElement('div');
                cell.className = 'rnc-cal-day-cell' + (isToday ? ' rnc-cal-day-today' : '');
                cell.dataset.date = ds;
                cell.addEventListener('dragover', function(e){ e.preventDefault(); cell.classList.add('rnc-cal-drag-over'); });
                cell.addEventListener('dragleave', function(){ cell.classList.remove('rnc-cal-drag-over'); });
                cell.addEventListener('drop', function(e){
                    e.preventDefault();
                    cell.classList.remove('rnc-cal-drag-over');
                    _rncCalHandleDrop(e, ds);
                });

                var num = document.createElement('span');
                num.className = 'rnc-cal-day-num'; num.textContent = dd;
                cell.appendChild(num);

                if (entries.length) {
                    var ew = document.createElement('div'); ew.className = 'rnc-cal-events-wrap';
                    var maxShow = 3;
                    entries.slice(0, maxShow).forEach(function(e){ ew.appendChild(_rncCalChip(e)); });
                    if (entries.length > maxShow) {
                        var more = document.createElement('button');
                        more.className = 'rnc-cal-more-btn';
                        more.textContent = '+' + (entries.length - maxShow) + ' mais';
                        more.onclick = function(ev){ ev.stopPropagation(); _rncCalDayModal(ds, entries); };
                        ew.appendChild(more);
                    }
                    cell.appendChild(ew);
                    cell.style.cursor = 'pointer';
                    cell.onclick = function(){ _rncCalDayModal(ds, entries); };
                }
                grid.appendChild(cell);
            })(dd);
        }
        var total = startDow + daysInMonth, rem = total % 7;
        if (rem !== 0) for (var k = 0; k < 7 - rem; k++) {
            var ec = document.createElement('div'); ec.className = 'rnc-cal-day-cell rnc-cal-day-other'; grid.appendChild(ec);
        }
        container.innerHTML = '';
        container.appendChild(grid);
        _rncCalMonthTouchAttachChips();
    }

    // ── Renderização semanal ──
    function _rncCalRenderWeekly(container) {
        var rangeStart = new Date(rncCalWeek);
        var rangeEnd = new Date(rncCalWeek); rangeEnd.setDate(rangeEnd.getDate() + 6);
        var map = _rncCalBuildDayMap(rangeStart, rangeEnd);
        var today = _rncToday();

        var grid = document.createElement('div');
        grid.className = 'rnc-cal-weekly-grid';
        for (var i = 0; i < 7; i++) {
            (function(i){
                var dateObj = new Date(rncCalWeek); dateObj.setDate(dateObj.getDate() + i);
                var ds = _rncDateStr(dateObj);
                var isToday = dateObj.getTime() === today.getTime();
                var entries = map[ds] || [];
                var col = document.createElement('div');
                col.className = 'rnc-cal-week-col' + (isToday ? ' rnc-cal-week-col-today' : '');
                col.dataset.date = ds;
                col.addEventListener('dragover', function(e){ e.preventDefault(); col.classList.add('rnc-cal-drag-over'); });
                col.addEventListener('dragleave', function(){ col.classList.remove('rnc-cal-drag-over'); });
                col.addEventListener('drop', function(e){
                    e.preventDefault();
                    col.classList.remove('rnc-cal-drag-over');
                    _rncCalHandleDrop(e, ds);
                });
                var head = document.createElement('div');
                head.className = 'rnc-cal-week-col-header';
                head.innerHTML = '<span class="rnc-cal-wk-dayname">' + RNC_WEEKDAYS[i] + '</span>' +
                    '<span class="rnc-cal-wk-daynum' + (isToday ? ' rnc-cal-wk-today-num' : '') + '">' + dateObj.getDate() + '</span>';
                col.appendChild(head);
                var ew = document.createElement('div'); ew.className = 'rnc-cal-week-events';
                if (!entries.length) {
                    var e0 = document.createElement('div'); e0.className = 'rnc-cal-week-empty'; e0.textContent = '—'; ew.appendChild(e0);
                } else entries.forEach(function(e){ ew.appendChild(_rncCalCard(e)); });
                col.appendChild(ew);
                grid.appendChild(col);
            })(i);
        }
        container.innerHTML = '';
        container.appendChild(grid);
        initRncCalWeekMobileSwipe();
    }

    // ── Chip de evento (mensal) ──
    function _rncCalChip(entry) {
        var chip = document.createElement('button');
        chip.className = 'rnc-cal-event-chip';
        if (entry.type === 'publicacao') {
            var pub = entry.pub;
            chip.classList.add('rnc-cal-evt-pub');
            chip.innerHTML = '<i class="fas fa-paper-plane"></i> ' + esc(_rncTrunc(entry.item.titulo || 'RNC', 16));
            chip.title = (pub.tipo || 'Publicação') + ' — ' + (entry.item.titulo || '');
            chip.onclick = function(ev){ ev.stopPropagation(); _rncCalOpenEntry(entry); };
        } else {
            var ci = getCI(entry.item.classificacao);
            chip.classList.add('rnc-cal-evt-rnc');
            chip.style.setProperty('--rnc-evt-color', ci.color);
            chip.innerHTML = '<span class="rnc-cal-evt-dot" style="background:' + ci.color + '"></span>' + esc(_rncTrunc(entry.item.titulo || 'RNC', 16));
            chip.title = entry.item.titulo || 'RNC';
            chip.onclick = function(ev){ ev.stopPropagation(); _rncCalOpenEntry(entry); };
            if (canEdit(entry.item)) {
                chip.draggable = true;
                chip._rncCalItemId = entry.item.id;
                chip.addEventListener('dragstart', function(ev){
                    ev.stopPropagation();
                    ev.dataTransfer.setData('text/plain', JSON.stringify({ rncId: entry.item.id }));
                    chip.classList.add('rnc-cal-dragging');
                });
                chip.addEventListener('dragend', function(){ chip.classList.remove('rnc-cal-dragging'); });
            }
        }
        return chip;
    }

    // ── Card de evento (semanal / modal do dia) ──
    function _rncCalCard(entry) {
        var card = document.createElement('button');
        card.className = 'rnc-cal-event-card';
        if (entry.type === 'publicacao') {
            var pub = entry.pub;
            card.classList.add('rnc-cal-evt-pub');
            card.innerHTML =
                '<div class="rnc-cal-ecard-top"><i class="fas fa-paper-plane" style="color:#8b5cf6"></i>' +
                    '<span class="rnc-cal-ecard-type">' + esc(pub.tipo || 'Publicação') + '</span></div>' +
                '<div class="rnc-cal-ecard-title">' + esc(entry.item.titulo || 'RNC') + '</div>' +
                (pub.descricao ? '<div class="rnc-cal-ecard-desc">' + esc(_rncTrunc(pub.descricao, 60)) + '</div>' : '') +
                (pub.usuario ? '<div class="rnc-cal-ecard-meta"><i class="fas fa-user"></i> ' + esc(pub.usuario) + '</div>' : '');
        } else {
            var ci = getCI(entry.item.classificacao);
            var mk = getMarker(entry.item.marcador);
            card.classList.add('rnc-cal-evt-rnc');
            card.style.setProperty('--rnc-evt-color', ci.color);
            card.innerHTML =
                '<div class="rnc-cal-ecard-top">' +
                    '<span class="rnc-class-badge rnc-class-badge--sm" style="' + rncClassStyle(ci) + '"><i class="fas ' + ci.icon + '"></i> ' + esc(ci.label) + '</span>' +
                    rncAlertBadgeHtml(entry.item) +
                '</div>' +
                '<div class="rnc-cal-ecard-title">' + esc(entry.item.titulo || 'RNC') + '</div>' +
                (entry.item.responsavel ? '<div class="rnc-cal-ecard-meta"><i class="fas fa-user"></i> ' + esc(entry.item.responsavel) + '</div>' : '') +
                (setorArr(entry.item.setor).length ? '<div class="rnc-cal-ecard-meta"><i class="fas fa-building"></i> ' + esc(setorText(entry.item.setor)) + '</div>' : '') +
                (mk ? '<div class="rnc-cal-ecard-marker" style="background:' + mk.color + '"><i class="fas ' + mk.icon + '"></i> ' + esc(mk.label) + '</div>' : '');
            if (canEdit(entry.item)) {
                card.draggable = true;
                card._rncCalItemId = entry.item.id;
                card.addEventListener('dragstart', function(ev){
                    ev.stopPropagation();
                    ev.dataTransfer.setData('text/plain', JSON.stringify({ rncId: entry.item.id }));
                    card.classList.add('rnc-cal-dragging');
                });
                card.addEventListener('dragend', function(){ card.classList.remove('rnc-cal-dragging'); });
            }
        }
        card.onclick = function(){ _rncCalOpenEntry(entry); };
        return card;
    }

    // ── Drag & drop: move a RNC para a data alvo, atualizando dataConclusao ──
    function _rncCalHandleDrop(e, targetDateStr) {
        var data;
        try { data = JSON.parse(e.dataTransfer.getData('text/plain')); } catch (err) { return; }
        if (!data || !data.rncId) return;
        _rncCalMoveItemToDate(data.rncId, targetDateStr);
    }

    function _rncCalMoveItemToDate(rncId, targetDateStr) {
        var item = (window.rncItems || []).find(function(r){ return r.id === rncId; });
        if (!item) return;
        if (!canEdit(item)) return;
        if ((item.dataConclusao || '').slice(0,10) === targetDateStr) return;
        item.dataConclusao = targetDateStr;
        persist();
        _rncCalRenderGrade();
        if (rncView === 'cards') renderRnc();
    }

    function _rncCalOpenEntry(entry) {
        var modal = document.getElementById('rncCalDayModal');
        if (modal) modal.style.display = 'none';
        if (entry.type === 'publicacao') {
            // Abre a RNC e ativa a aba de publicações
            window.rncOpenView(entry.item.id);
            setTimeout(function(){
                var tab = document.querySelector('.rnc-view-tab[onclick*="rnc-vpub"]');
                if (tab) tab.click();
            }, 150);
        } else {
            window.rncOpenView(entry.item.id);
        }
    }

    // ── Modal do dia (+N mais) ──
    function _rncCalDayModal(ds, entries) {
        var modal = document.getElementById('rncCalDayModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'rncCalDayModal';
            modal.className = 'rnc-cal-day-modal-overlay';
            modal.onclick = function(e){ if (e.target === modal) modal.style.display = 'none'; };
            document.body.appendChild(modal);
        }
        var d = new Date(ds + 'T00:00:00');
        var label = d.toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
        modal.innerHTML =
            '<div class="rnc-cal-day-modal">' +
                '<div class="rnc-cal-day-modal-header">' +
                    '<span class="rnc-cal-day-modal-title">' + esc(label) + '</span>' +
                    '<button class="rnc-cal-day-modal-close" onclick="document.getElementById(\'rncCalDayModal\').style.display=\'none\'"><i class="fas fa-times"></i></button>' +
                '</div>' +
                '<div class="rnc-cal-day-modal-body" id="rncCalDayModalBody"></div>' +
            '</div>';
        var body = modal.querySelector('#rncCalDayModalBody');
        entries.forEach(function(e){ body.appendChild(_rncCalCard(e)); });
        modal.style.display = 'flex';
    }

    // Fecha dropdown de visualização ao clicar fora
    document.addEventListener('click', function(e){
        var dd = document.getElementById('rncCalVfDropdown');
        var btn = document.getElementById('rncCalVfBtn');
        if (dd && dd.style.display === 'block' && !dd.contains(e.target) && btn && !btn.contains(e.target)) {
            dd.style.display = 'none';
        }
    });

    // ══════════════════════════════════════════════════════════════════
    //  HEADER FILTERS (Data e Setor, mesmos padrões de Ocorrências)
    // ══════════════════════════════════════════════════════════════════

    window.rncToggleHeadDate = function() {
        var dd = document.getElementById('rncHeadDateDropdown');
        if (!dd) return;
        var open = dd.classList.contains('open');
        rncCloseHeadDropdowns();
        if (!open) { renderRncDateDropdown(); dd.style.display = 'block'; dd.classList.add('open'); }
    };

    function renderRncDateDropdown() {
        var dd = document.getElementById('rncHeadDateDropdown');
        if (!dd) return;
        var f = rncDateFilter, now = new Date();
        var y0 = now.getFullYear();
        var years = [];
        for (var y = y0 + 1; y >= y0 - 4; y--) years.push(y);

        var typeOpts = [
            { v:'all',    l:'Todas',   icon:'fa-infinity' },
            { v:'month',  l:'Mensal',  icon:'fa-calendar-days' },
            { v:'year',   l:'Anual',   icon:'fa-calendar' },
            { v:'custom', l:'Período', icon:'fa-calendar-range' }
        ];

        var html = '<div class="rnc-date-dd">' +
            '<div class="rnc-date-dd-header"><span class="rnc-date-dd-title"><i class="fas fa-calendar-alt"></i> Filtro de Data</span></div>' +
            '<div class="rnc-date-type-btns">' +
            typeOpts.map(function(t){
                return '<button class="rnc-date-type-btn' + (f.type===t.v?' active':'') + '" onclick="rncSetDateFilter(\'' + t.v + '\')">' +
                    '<i class="fas ' + t.icon + '"></i><span>' + t.l + '</span>' +
                '</button>';
            }).join('') +
            '</div>';

        if (f.type === 'month') {
            var selYear = f.year || y0;
            html += '<div class="rnc-date-year-nav">' +
                '<button class="rnc-date-yn-btn" onclick="rncSetDateFilterYear(' + (selYear-1) + ')"><i class="fas fa-chevron-left"></i></button>' +
                '<span class="rnc-date-yn-label">' + selYear + '</span>' +
                '<button class="rnc-date-yn-btn" onclick="rncSetDateFilterYear(' + (selYear+1) + ')"><i class="fas fa-chevron-right"></i></button>' +
            '</div>' +
            '<div class="rnc-date-month-grid">' +
            MONTH_SHORT.map(function(m, i){
                var isActive = f.month === i && f.year === selYear;
                return '<button class="rnc-date-month-btn' + (isActive?' active':'') + '" onclick="rncPickMonth(' + i + ',' + selYear + ')">' +
                    '<span class="rnc-month-abbr">' + m + '</span>' +
                '</button>';
            }).join('') +
            '</div>';
        }

        if (f.type === 'year') {
            html += '<div class="rnc-date-year-grid">' +
            years.map(function(yi){
                return '<button class="rnc-date-year-btn' + (f.year===yi?' active':'') + '" onclick="rncSetDateFilterYear(' + yi + ')">' + yi + '</button>';
            }).join('') +
            '</div>';
        }

        if (f.type === 'custom') {
            html += '<div class="rnc-date-custom">' +
                '<div class="rnc-date-custom-field">' +
                    '<label class="rnc-date-custom-label"><i class="fas fa-calendar-plus"></i> De</label>' +
                    '<input type="date" class="rnc-date-input" value="'+(f.ini||'')+'" onchange="rncSetCustomDate(\'ini\',this.value)">' +
                '</div>' +
                '<div class="rnc-date-custom-sep"><i class="fas fa-arrow-right"></i></div>' +
                '<div class="rnc-date-custom-field">' +
                    '<label class="rnc-date-custom-label"><i class="fas fa-calendar-minus"></i> Até</label>' +
                    '<input type="date" class="rnc-date-input" value="'+(f.fim||'')+'" onchange="rncSetCustomDate(\'fim\',this.value)">' +
                '</div>' +
            '</div>';
        }

        if (f.type !== 'all') {
            html += '<div class="rnc-date-dd-footer">' +
                '<button class="rnc-date-clear-btn" onclick="rncSetDateFilter(\'all\')"><i class="fas fa-times"></i> Limpar filtro</button>' +
            '</div>';
        }

        html += '</div>';
        dd.innerHTML = html;
    }

    window.rncSetDateFilter = function(type) {
        var now = new Date();
        rncDateFilter.type = type;
        if (type === 'month' && rncDateFilter.month === null) { rncDateFilter.month = now.getMonth(); rncDateFilter.year = now.getFullYear(); }
        if (type === 'year' && !rncDateFilter.year) rncDateFilter.year = now.getFullYear();
        renderRncDateDropdown(); updateRncDateHeadLabel(); rncPage = 1; renderRnc();
    };
    window.rncPickMonth = function(m, y) {
        rncDateFilter.month = m; rncDateFilter.year = parseInt(y);
        renderRncDateDropdown(); updateRncDateHeadLabel(); rncPage = 1; renderRnc();
    };
    window.rncSetDateFilterYear = function(y) {
        rncDateFilter.year = parseInt(y);
        if (rncDateFilter.type === 'month') {
            renderRncDateDropdown(); updateRncDateHeadLabel(); rncPage = 1; renderRnc();
        } else {
            rncDateFilter.type = 'year';
            renderRncDateDropdown(); updateRncDateHeadLabel(); rncPage = 1; renderRnc();
        }
    };
    window.rncSetCustomDate = function(key, val) {
        rncDateFilter[key] = val; updateRncDateHeadLabel(); rncPage = 1; renderRnc();
    };

    function updateRncDateHeadLabel() {
        var lbl = document.getElementById('rncHeadDateLabel');
        var btn = document.getElementById('rncHeadDateBtn');
        if (!lbl) return;
        var f = rncDateFilter, txt = 'Data', act = false;
        if (f.type === 'all') { txt = 'Data'; act = false; }
        else if (f.type === 'month' && f.month !== null) { txt = MONTH_SHORT[f.month] + (f.year ? '/' + f.year : ''); act = true; }
        else if (f.type === 'year' && f.year) { txt = String(f.year); act = true; }
        else if (f.type === 'custom' && (f.ini || f.fim)) { txt = 'Período'; act = true; }
        lbl.textContent = txt;
        if (btn) btn.classList.toggle('active', act);
    }

    // ── Filtro Setor ──
    var _rncTempSetorSelection = null;

    window.rncToggleHeadSetor = function() {
        rncOpenSetorModal();
    };

    function rncOpenSetorModal() {
        var modal = document.getElementById('modalRncSetorFilter');
        if (!modal) return;
        var setores = getSetores();
        _rncTempSetorSelection = rncSetorFilter.length ? rncSetorFilter.slice() : setores.slice();
        var rncSearch = document.getElementById('rncSetorFilterSearch');
        if (rncSearch) rncSearch.value = '';
        _filterSetorChips('', 'rncSetorFilterGrid');
        _renderRncSetorFilterGrid(setores);
        _updateRncSetorFilterCount();
        modal.style.display = 'flex';
        if (rncSearch) setTimeout(function() { rncSearch.focus(); }, 80);
    }

    window.rncCloseSetorModal = function() {
        var modal = document.getElementById('modalRncSetorFilter');
        if (modal) modal.style.display = 'none';
        _rncTempSetorSelection = null;
    };

    window.rncConfirmSetorFilter = function() {
        if (!_rncTempSetorSelection) return;
        var setores = getSetores();
        rncSetorFilter = (_rncTempSetorSelection.length === setores.length) ? [] : _rncTempSetorSelection.slice();
        rncCloseSetorModal();
        updateRncSetorHeadLabel();
        rncPage = 1; renderRnc();
    };

    function _renderRncSetorFilterGrid(setores) {
        var grid = document.getElementById('rncSetorFilterGrid');
        var subtitle = document.getElementById('rncSetorFilterSubtitle');
        if (!grid) return;
        if (subtitle) subtitle.textContent = setores.length + ' setor' + (setores.length !== 1 ? 'es' : '') + ' disponí' + (setores.length !== 1 ? 'veis' : 'vel');
        grid.innerHTML = setores.map(function(s) {
            var sel = _rncTempSetorSelection && _rncTempSetorSelection.indexOf(s) !== -1;
            return '<div class="setor-chip' + (sel ? ' selected' : '') + '" onclick="_rncToggleSetorChip(this, \'' + esc(s) + '\')">' +
                '<div class="setor-chip-check"><i class="fas fa-check"></i></div>' +
                '<span class="setor-chip-label" title="' + esc(s) + '">' + esc(s) + '</span>' +
            '</div>';
        }).join('');
    }

    window._rncToggleSetorChip = function(el, s) {
        if (!_rncTempSetorSelection) return;
        var idx = _rncTempSetorSelection.indexOf(s);
        if (idx === -1) { _rncTempSetorSelection.push(s); el.classList.add('selected'); }
        else { _rncTempSetorSelection.splice(idx, 1); el.classList.remove('selected'); }
        _updateRncSetorFilterCount();
    };

    function _updateRncSetorFilterCount() {
        var el = document.getElementById('rncSetorFilterCount');
        var btn = document.getElementById('rncSetorFilterToggleAllBtn');
        var total = getSetores().length;
        var sel = _rncTempSetorSelection ? _rncTempSetorSelection.length : total;
        if (el) el.textContent = sel + ' de ' + total + ' selecionados';
        if (btn) {
            var allSelected = sel === total;
            btn.innerHTML = allSelected
                ? '<i class="fas fa-times"></i> Desmarcar todos'
                : '<i class="fas fa-check"></i> Marcar todos';
        }
    }

    window.rncSetorFilterToggleAll = function() {
        var total = getSetores().length;
        var allSelected = _rncTempSetorSelection && _rncTempSetorSelection.length === total;
        _rncTempSetorSelection = allSelected ? [] : getSetores().slice();
        _renderRncSetorFilterGrid(getSetores());
        _updateRncSetorFilterCount();
    };

    window.rncSelectAllSetores = function() {
        rncSetorFilter = getSetores().slice();
        updateRncSetorHeadLabel(); rncPage = 1; renderRnc();
    };
    window.rncClearSetores = function() {
        rncSetorFilter = [];
        updateRncSetorHeadLabel(); rncPage = 1; renderRnc();
    };
    function updateRncSetorHeadLabel() {
        var lbl = document.getElementById('rncHeadSetorLabel');
        var btn = document.getElementById('rncHeadSetorBtn');
        if (!lbl) return;
        var n = rncSetorFilter.length;
        var txt = n === 0 ? 'Setores' : (n === 1 ? rncSetorFilter[0] : n + ' setores');
        lbl.textContent = txt;
        if (btn) btn.classList.toggle('active', n > 0);
    }

    function rncCloseHeadDropdowns() {
        var dateEl = document.getElementById('rncHeadDateDropdown');
        if (dateEl) { dateEl.style.display = 'none'; dateEl.classList.remove('open'); }
        var setorEl = document.getElementById('rncHeadSetorDropdown');
        if (setorEl) setorEl.style.display = 'none';
    }
    window.rncCloseHeadDropdowns = rncCloseHeadDropdowns;

    // ── Mostra/oculta filtros do header e sino ──
    window.rncSetHeaderFilters = function(show) {
        ['rncHeadDateWrap','rncHeadSetorWrap'].forEach(function(id) {
            var el = document.getElementById(id); if (el) el.style.display = show ? 'block' : 'none';
        });
        var bell = document.getElementById('notificationContainer');
        if (bell) bell.style.display = show ? 'none' : '';
        var rncBell = document.getElementById('rncNotificationContainer');
        if (rncBell) rncBell.style.display = show ? 'flex' : 'none';
        if (!show) rncCloseHeadDropdowns();
    };

    // ══════════════════════════════════════════════════════════════════
    //  SINO DE NOTIFICAÇÕES RNC
    // ══════════════════════════════════════════════════════════════════

    // Calcula o estado de alerta de uma RNC.
    // Retorna { state:'overdue'|'alert', diff } ou null se ainda não deve alertar.
    // Status concluído/cancelado nunca alerta.
    function rncStatusIsFinal(name) {
        var item = getRncStatusList().find(function(s){ return s.name === name; });
        if (item && (item.finalKind === 'concluido' || item.finalKind === 'cancelado')) return true;
        var st = String(name || '').toLowerCase();
        return st.indexOf('conclu') !== -1 || st.indexOf('cancel') !== -1;
    }
    window.rncStatusIsFinal = rncStatusIsFinal;

    function rncAlertState(r) {
        if (!r || r.deleted) return null;
        if (rncStatusIsFinal(r.status)) return null;
        var df = r.dataConclusao || r.dataInicio;
        if (!df) return null;
        var now = new Date(); now.setHours(0,0,0,0);
        var d = new Date(String(df).slice(0,10) + 'T00:00:00');
        if (isNaN(d.getTime())) return null;
        var diff = Math.floor((d - now) / (1000*60*60*24)); // dias até a data (negativo = atrasado)
        // janela de alerta: alertaDias do card, ou 7 como padrão
        var window = (r.alertaDias != null && r.alertaDias !== '') ? Number(r.alertaDias) : 7;
        if (diff < 0) return { state: 'overdue', diff: diff };
        if (diff <= window) return { state: 'alert', diff: diff };
        return null;
    }
    window.rncAlertState = rncAlertState;

    function getRncNotifications() {
        var arr = (window.rncItems || []).filter(function(r){ return r && !r.deleted; });
        if (typeof userRncTaskView === 'function' && userRncTaskView() === 'usuario') {
            var me = meName().toLowerCase();
            var meId3 = (typeof currentuser !== 'undefined' && currentuser && currentuser.id) ? currentuser.id : null;
            arr = arr.filter(function(r){
                var resp = rncArrField(r.responsavel);
                var rev = rncArrField(r.revisor);
                return resp.concat(rev).some(function(v){ return (meId3 && v === meId3) || v.toLowerCase() === me; });
            });
        }
        var notifs = [];
        arr.forEach(function(r) {
            var a = rncAlertState(r);
            if (!a) return;
            notifs.push({
                id: r.id, titulo: r.titulo, diff: a.diff, state: a.state,
                ci: getCI(r.classificacao), priority: a.state === 'overdue' ? 0 : 1,
                df: r.dataConclusao || r.dataInicio
            });
        });
        notifs.sort(function(a,b){ return a.priority - b.priority || (new Date(a.df) - new Date(b.df)); });
        return notifs;
    }

    function updateRncNotificationBell() {
        var badge = document.getElementById('rncNotificationBadge');
        if (!badge) return;
        var n = getRncNotifications().length;
        badge.textContent = n;
        badge.style.display = n > 0 ? '' : 'none';
    }
    window.updateRncNotificationBell = updateRncNotificationBell;

    window.rncToggleNotifications = function() {
        var modal = document.getElementById('rncNotificationModal');
        if (!modal) return;
        var open = modal.classList.contains('open');
        if (open) { modal.classList.remove('open'); return; }
        var notifs = getRncNotifications();
        var content = document.getElementById('rncNotifContent');
        if (content) {
            if (notifs.length === 0) {
                content.innerHTML = '<div class="rnc-notif-empty"><i class="fas fa-check-circle"></i><p>Nenhuma RNC com prazo próximo.</p></div>';
            } else {
                content.innerHTML = notifs.map(function(n) {
                    var diffText = n.state === 'overdue'
                        ? (Math.abs(n.diff) + ' dia' + (Math.abs(n.diff)!==1?'s':'') + ' em atraso')
                        : (n.diff === 0 ? 'Vence hoje' : 'Vence em ' + n.diff + ' dia' + (n.diff!==1?'s':''));
                    var ic = n.state === 'overdue' ? '#dc2626' : '#f59e0b';
                    var icBg = n.state === 'overdue' ? '#fef2f2' : '#fffbeb';
                    return '<div class="rnc-notif-item" onclick="rncCloseNotifications();rncOpenView(' + n.id + ')">' +
                        '<div class="rnc-notif-icon" style="background:' + icBg + ';color:' + ic + '">' +
                            '<i class="fas ' + (n.state === 'overdue' ? 'fa-circle-exclamation' : 'fa-bell') + '"></i>' +
                        '</div>' +
                        '<div class="rnc-notif-body">' +
                            '<div class="rnc-notif-title">' + esc(n.titulo || 'RNC') + '</div>' +
                            '<div class="rnc-notif-meta">' + esc(diffText) + '</div>' +
                        '</div>' +
                    '</div>';
                }).join('');
            }
        }
        modal.classList.add('open');
    };
    window.rncCloseNotifications = function() {
        var modal = document.getElementById('rncNotificationModal');
        if (modal) modal.classList.remove('open');
    };

    // ══════════════════════════════════════════════════════════════════
    //  DRAWER — FORMULÁRIO
    // ══════════════════════════════════════════════════════════════════

    window.rncOpenNew = function() {
        if (!canEdit()) { toast('Você não tem permissão para criar RNCs.', 'error'); return; }
        ensureLists();
        rncEditingId = null;
        document.getElementById('rncDrawerTitle').textContent = 'Nova RNC';
        document.getElementById('rncDrawerSubtitle').textContent = 'Preencha os dados abaixo';
        clearRncForm();
        if (typeof clearAnexosUpload === 'function') clearAnexosUpload('rnc');
        if (typeof clearChecklist === 'function') clearChecklist('rnc');
        rncCloseAllDropdowns();
        openRncDrawer();
    };

    window.rncOpenEdit = function(id) {
        id = Number(id);
        var r = (window.rncItems || []).find(function(x){ return x.id === id; });
        if (!r) return;
        if (!canEdit(r)) { toast('Você não tem permissão para editar.', 'error'); return; }
        ensureLists();
        rncEditingId = id;
        document.getElementById('rncDrawerTitle').textContent = 'Editar RNC';
        document.getElementById('rncDrawerSubtitle').textContent = 'Atualize os dados abaixo';
        fillRncForm(r);
        if (typeof restoreAnexosUpload === 'function') restoreAnexosUpload('rnc', r.anexos);
        if (typeof restoreChecklist === 'function') restoreChecklist('rnc', r.checklist, r.checklistPublicacao);
        rncCloseAllDropdowns();
        openRncDrawer();
    };

    window.rncDuplicate = function() {
        if (!canEdit()) { toast('Você não tem permissão para duplicar RNCs.', 'error'); return; }
        var original = (window.rncItems || []).find(function(x){ return x.id === rncEditingId; });
        if (!original) return;

        var formData = {
            titulo: getVal('rncFTitulo'),
            setor: (typeof smsGetValue === 'function') ? JSON.stringify(smsGetValue('rnc')) : getVal('rncFSetor'),
            origem: getVal('rncFOrigem'),
            detalhamento: getVal('rncFDetalhamento'),
            descricao: getVal('rncFDescricao'),
            planoAcao: getVal('rncFPlanoAcao'),
            status: getVal('rncFStatus'),
            dataInicio: getVal('rncFDataInicio'),
            dataConclusao: getVal('rncFDataConclusao'),
            classificacao: (function(){ var c = document.querySelector('.rnc-class-chip.active'); return c ? c.getAttribute('data-cls') : 'critica'; })(),
            marcador: getVal('rncFMarcador'),
            responsavel: (typeof msGetValue === 'function') ? msGetValue('rnc-resp') : [],
            revisor: (typeof msGetValue === 'function') ? msGetValue('rnc-rev') : [],
            alerta: getVal('rncFAlerta'),
            anexos: (typeof getAnexosUpload === 'function') ? getAnexosUpload('rnc') : []
        };

        var dupChecklist = JSON.parse(JSON.stringify({ checklist: original.checklist || [], checklistPublicacao: original.checklistPublicacao || [] }));
        if (typeof resetChecklistItems === 'function') resetChecklistItems(dupChecklist);

        rncCloseDrawer();

        setTimeout(function() {
            rncEditingId = null;
            document.getElementById('rncDrawerTitle').textContent = 'Nova RNC';
            document.getElementById('rncDrawerSubtitle').textContent = 'Preencha os dados abaixo';

            setVal('rncFTitulo', formData.titulo);
            if (typeof smsSetValue === 'function') smsSetValue('rnc', formData.setor || '');
            setVal('rncFOrigem', formData.origem);
            setVal('rncFDetalhamento', formData.detalhamento);
            setVal('rncFDescricao', formData.descricao);
            setVal('rncFPlanoAcao', formData.planoAcao);
            setVal('rncFStatus', formData.status);
            setVal('rncFDataInicio', formData.dataInicio);
            setVal('rncFDataConclusao', formData.dataConclusao);
            if (typeof msRefreshUsers === 'function') msRefreshUsers();
            if (typeof msSetValue === 'function') {
                msSetValue('rnc-resp', formData.responsavel || []);
                msSetValue('rnc-rev', formData.revisor || []);
            }
            setVal('rncFAlerta', formData.alerta);
            setVal('rncFMarcador', formData.marcador);
            renderMarkerChips(formData.marcador || '');
            document.querySelectorAll('.rnc-class-chip').forEach(function(b){
                b.classList.toggle('active', b.getAttribute('data-cls') === formData.classificacao);
            });

            if (typeof clearAnexosUpload === 'function') clearAnexosUpload('rnc');
            if (typeof restoreAnexosUpload === 'function') restoreAnexosUpload('rnc', formData.anexos);
            if (typeof restoreChecklist === 'function') restoreChecklist('rnc', dupChecklist.checklist, dupChecklist.checklistPublicacao);

            rncCloseAllDropdowns();
            openRncDrawer();
        }, 200);
    };

    function clearRncForm() {
        var todayVal = typeof today === 'function' ? today() : new Date().toISOString().split('T')[0];
        setVal('rncFTitulo', '');
        if (typeof smsReset === 'function') smsReset('rnc');
        setVal('rncFOrigem', '');
        setVal('rncFDetalhamento', '');
        setVal('rncFDescricao', '');
        setVal('rncFPlanoAcao', '');
        var stList = getRncStatusList();
        setVal('rncFStatus', (stList && stList.length) ? stList[0].name : '');
        setVal('rncFDataInicio', todayVal);
        setVal('rncFDataConclusao', '');
        if (typeof msRefreshUsers === 'function') msRefreshUsers();
        if (typeof msSetValue === 'function') {
            var meId = (typeof currentuser !== 'undefined' && currentuser && currentuser.id) ? currentuser.id : meName();
            msSetValue('rnc-resp', meId ? [meId] : []);
            msSetValue('rnc-rev', []);
        }
        setVal('rncFAlerta', '');
        setVal('rncFMarcador', '');
        renderMarkerChips('');
        document.querySelectorAll('.rnc-class-chip').forEach(function(b){
            b.classList.toggle('active', b.getAttribute('data-cls') === 'critica');
        });
    }

    function fillRncForm(r) {
        setVal('rncFTitulo', r.titulo);
        if (typeof smsSetValue === 'function') smsSetValue('rnc', r.setor || '');
        setVal('rncFOrigem', r.origem);
        setVal('rncFDetalhamento', r.detalhamento);
        setVal('rncFDescricao', r.descricao);
        setVal('rncFPlanoAcao', r.planoAcao);
        setVal('rncFStatus', r.status);
        setVal('rncFDataInicio', r.dataInicio);
        setVal('rncFDataConclusao', r.dataConclusao);
        if (typeof msRefreshUsers === 'function') msRefreshUsers();
        if (typeof msSetValue === 'function') {
            msSetValue('rnc-resp', r.responsavel || []);
            msSetValue('rnc-rev', r.revisor || []);
        }
        setVal('rncFAlerta', (r.alertaDias != null ? r.alertaDias : ''));
        setVal('rncFMarcador', r.marcador || '');
        renderMarkerChips(r.marcador || '');
        document.querySelectorAll('.rnc-class-chip').forEach(function(b){
            b.classList.toggle('active', b.getAttribute('data-cls') === (r.classificacao || 'critica'));
        });
        var respLocked = (typeof userRncResponsavelLocked === 'function') && userRncResponsavelLocked(r);
        if (typeof msSetDisabled === 'function') msSetDisabled('rnc-resp', !!respLocked);
    }

    function openRncDrawer() {
        var d = document.getElementById('modalRnc');
        var bk = document.getElementById('formDrawerBackdrop');
        if (typeof closeFormDrawer === 'function') closeFormDrawer();
        if (d) d.classList.add('open');
        if (bk) bk.classList.add('open');
        var firstTab = d && d.querySelector('.drawer-tab');
        if (firstTab && typeof switchDrawerTab === 'function') switchDrawerTab('rnc', 'info', firstTab);
        // Mostra botão Duplicar apenas ao editar (não ao criar novo)
        var dupBtn = document.getElementById('btnDuplicateRnc');
        if (dupBtn) dupBtn.style.display = rncEditingId ? '' : 'none';

        // Começa a rastrear alterações não salvas deste drawer
        if (typeof window._armDrawerDirty === 'function') window._armDrawerDirty('modalRnc');
    }

    // Fechamento vindo da UI (X, Cancelar, backdrop, ESC): confirma antes de
    // descartar o que já foi digitado. Salvar/duplicar chamam rncCloseDrawer direto.
    window.rncCloseDrawerGuarded = function() {
        if (typeof window._confirmDiscardDrawer === 'function') {
            window._confirmDiscardDrawer('modalRnc', window.rncCloseDrawer);
        } else {
            window.rncCloseDrawer();
        }
    };

    window.rncCloseDrawer = function() {
        if (typeof window._resetDrawerDirty === 'function') window._resetDrawerDirty('modalRnc');
        var d = document.getElementById('modalRnc');
        var bk = document.getElementById('formDrawerBackdrop');
        if (d) d.classList.remove('open');
        if (bk) bk.classList.remove('open');
        rncCloseAllDropdowns();
        // Descarta imagens enviadas mas não salvas (preserva as já persistidas)
        if (typeof window._discardSessionImgBlobs === 'function') window._discardSessionImgBlobs('rnc');
    };

    window.rncSelectClass = function(cls) {
        document.querySelectorAll('.rnc-class-chip').forEach(function(b){
            b.classList.toggle('active', b.getAttribute('data-cls') === cls);
        });
    };

    window.rncSaveForm = function() {
        var titulo       = getVal('rncFTitulo').trim();
        var setorArrRnc  = (typeof smsGetValue === 'function') ? smsGetValue('rnc') : [];
        var setor        = JSON.stringify(setorArrRnc);
        var origem       = getVal('rncFOrigem').trim();
        var detalhamento = getVal('rncFDetalhamento').trim();
        var descricao    = getVal('rncFDescricao').trim();
        var planoAcao    = getVal('rncFPlanoAcao').trim();
        var status       = getVal('rncFStatus').trim();
        var dataInicio   = getVal('rncFDataInicio');
        var dataConclusao= getVal('rncFDataConclusao');
        var chip = document.querySelector('.rnc-class-chip.active');
        var classificacao = chip ? chip.getAttribute('data-cls') : 'critica';
        var marcador = getVal('rncFMarcador');
        var responsavel = (typeof msGetValue === 'function') ? msGetValue('rnc-resp') : [];
        var revisor = (typeof msGetValue === 'function') ? msGetValue('rnc-rev') : [];
        var alertaRaw = getVal('rncFAlerta');
        var alertaDias = (alertaRaw === '' || alertaRaw == null) ? null : Math.max(0, parseInt(alertaRaw, 10) || 0);

        // Validações
        if (!titulo)       { toast('Informe o título.', 'error');                 focusEl('rncFTitulo');       return; }
        if (!setorArrRnc.length) { toast('Informe o setor.', 'error'); document.getElementById('sms-rnc')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
        if (!classificacao){ toast('Selecione a classificação.', 'error');                                     return; }
        if (!origem)       { toast('Informe a origem.', 'error');                 focusEl('rncFOrigem');       return; }
        if (!detalhamento) { toast('Informe o detalhamento.', 'error');           focusEl('rncFDetalhamento'); return; }
        if (!descricao)    { toast('Informe a descrição do ocorrido.', 'error');  focusEl('rncFDescricao');    return; }

        var anexos             = (typeof getAnexosUpload === 'function') ? getAnexosUpload('rnc') : [];
        var checklist          = (typeof getChecklist === 'function') ? getChecklist('rnc') : [];
        var checklistPublicacao= (typeof getChecklistPub === 'function') ? getChecklistPub('rnc') : [];

        ensureLists();
        // Auto-adiciona origem/detalhamento se não existirem
        var origens = getOrigens();
        if (!origens.some(function(o){ return String(o.name).trim().toLowerCase() === origem.toLowerCase(); })) {
            origens.push({ id: Date.now() + '_o', name: origem });
            origens.sort(function(a,b){ return String(a.name).localeCompare(String(b.name), 'pt'); });
        }
        var dets = getDetalhamentos();
        if (!dets.some(function(d){ return String(d.name).trim().toLowerCase() === detalhamento.toLowerCase(); })) {
            dets.push({ id: Date.now() + '_d', name: detalhamento });
            dets.sort(function(a,b){ return String(a.name).localeCompare(String(b.name), 'pt'); });
        }

        if (rncEditingId) {
            var r = (window.rncItems || []).find(function(x){ return x.id === rncEditingId; });
            if (r) {
                if (typeof userRncResponsavelLocked === 'function' && userRncResponsavelLocked(r)) {
                    responsavel = r.responsavel;
                }
                r.titulo = titulo; r.setor = setor; r.classificacao = classificacao;
                r.origem = origem; r.detalhamento = detalhamento; r.descricao = descricao;
                r.planoAcao = planoAcao; r.status = status; r.marcador = marcador;
                r.responsavel = responsavel; r.revisor = revisor;
                r.alertaDias = alertaDias;
                r.dataInicio = dataInicio; r.dataConclusao = dataConclusao;
                if (typeof syncChecklistPublicacaoHistory === 'function') syncChecklistPublicacaoHistory(r, checklistPublicacao);
                r.anexos = anexos; r.checklist = checklist; r.checklistPublicacao = checklistPublicacao;
                r.updatedAt = new Date().toISOString();
                if (!r.historico) r.historico = [];
                r.historico.push({ acao: 'Editado', usuario: meName(), data: new Date().toISOString() });
            }
            toast('RNC atualizada.', 'success');
        } else {
            if (!window.rncItems) window.rncItems = [];
            window.rncItems.push({
                id: uid(),
                titulo: titulo, setor: setor, classificacao: classificacao,
                origem: origem, detalhamento: detalhamento, descricao: descricao,
                planoAcao: planoAcao, status: status, marcador: marcador,
                dataInicio: dataInicio, dataConclusao: dataConclusao,
                responsavel: responsavel, revisor: revisor,
                alertaDias: alertaDias,
                anexos: anexos, checklist: checklist, checklistPublicacao: checklistPublicacao,
                publicacoes: [],
                historico: [{ acao: 'Criado', usuario: meName(), data: new Date().toISOString() }],
                createdAt: new Date().toISOString()
            });
            toast('RNC registrada.', 'success');
        }
        persist();
        window.rncCloseDrawer();
        renderRnc();
        updateRncNotificationBell();
    };

    // Criação rápida de RNC a partir do modal de publicação de rotinas.
    // Cria e persiste imediatamente uma RNC com os campos mínimos exigidos pelo form completo
    // (título, setor, origem, detalhamento, descrição); demais detalhes editáveis depois no card.
    window.rncQuickCreate = function(data) {
        data = data || {};
        var titulo = String(data.titulo || '').trim();
        var setor = String(data.setor || '').trim();
        var origem = String(data.origem || '').trim();
        var detalhamento = String(data.detalhamento || '').trim();
        var descricao = String(data.descricao || '').trim();
        if (!titulo || !setor || !origem || !detalhamento || !descricao) return null;
        var cls = ['critica', 'maior', 'menor'].indexOf(data.classificacao) !== -1 ? data.classificacao : 'menor';
        var stList = (typeof getRncStatusList === 'function') ? getRncStatusList() : [];

        ensureLists();
        var origens = getOrigens();
        if (!origens.some(function(o){ return String(o.name).trim().toLowerCase() === origem.toLowerCase(); })) {
            origens.push({ id: Date.now() + '_o', name: origem });
            origens.sort(function(a,b){ return String(a.name).localeCompare(String(b.name), 'pt'); });
        }
        var dets = getDetalhamentos();
        if (!dets.some(function(d){ return String(d.name).trim().toLowerCase() === detalhamento.toLowerCase(); })) {
            dets.push({ id: Date.now() + '_d', name: detalhamento });
            dets.sort(function(a,b){ return String(a.name).localeCompare(String(b.name), 'pt'); });
        }

        var meId = (typeof currentuser !== 'undefined' && currentuser && currentuser.id) ? currentuser.id : meName();
        var newRnc = {
            id: uid(),
            titulo: titulo, setor: setorSerialize(setor), classificacao: cls,
            origem: origem, detalhamento: detalhamento,
            descricao: descricao,
            planoAcao: '', status: (stList && stList.length) ? stList[0].name : '',
            marcador: '',
            dataInicio: '', dataConclusao: '',
            responsavel: meId ? [meId] : [], revisor: [],
            alertaDias: null,
            anexos: [], checklist: [], checklistPublicacao: [],
            publicacoes: [],
            historico: [{ acao: 'Criado (via publicação de rotina)', usuario: meName(), data: new Date().toISOString() }],
            createdAt: new Date().toISOString()
        };
        if (!window.rncItems) window.rncItems = [];
        window.rncItems.push(newRnc);
        persist();
        renderRnc();
        updateRncNotificationBell();
        return newRnc.id;
    };

    window.rncDelete = function(id) {
        id = Number(id);
        if (!canDeleteRnc()) { toast('Sem permissão para excluir.', 'error'); return; }
        _rncDeleteMotivo(id);
    };

    function _rncDeleteMotivo(id) {
        var wrap = document.getElementById('rncDeleteMotivoModal');
        if (!wrap) { wrap = document.createElement('div'); wrap.id = 'rncDeleteMotivoModal'; document.body.appendChild(wrap); }
        wrap.innerHTML =
            '<div class="rnc-dmot-backdrop" id="rncDmotBackdrop">' +
                '<div class="rnc-dmot-box">' +
                    '<div class="rnc-dmot-icon"><i class="fas fa-trash-can"></i></div>' +
                    '<div class="rnc-dmot-title">Mover para a lixeira</div>' +
                    '<div class="rnc-dmot-msg">Informe o motivo da exclusão desta RNC. <strong>Mínimo 10 caracteres.</strong></div>' +
                    '<textarea class="rnc-dmot-textarea" id="rncDmotTextarea" placeholder="Descreva o motivo da exclusão..." maxlength="500" rows="3" autofocus></textarea>' +
                    '<div class="rnc-dmot-counter"><span id="rncDmotCounter">0</span>/500 <span id="rncDmotMin" style="color:#ef4444;font-weight:600;margin-left:4px;">mín. 10</span></div>' +
                    '<div class="rnc-dmot-actions">' +
                        '<button class="oc-confirm-btn-cancel" onclick="document.getElementById(\'rncDeleteMotivoModal\').innerHTML=\'\'">Cancelar</button>' +
                        '<button class="oc-confirm-btn-danger" id="rncDmotOkBtn"><i class="fas fa-trash-can"></i> Excluir</button>' +
                    '</div>' +
                '</div>' +
            '</div>';

        var ta = document.getElementById('rncDmotTextarea');
        var counter = document.getElementById('rncDmotCounter');
        var minEl = document.getElementById('rncDmotMin');
        if (ta) {
            ta.addEventListener('input', function() {
                var len = ta.value.length;
                if (counter) {
                    counter.textContent = len;
                    counter.style.color = len < 10 ? '#ef4444' : '';
                    counter.style.fontWeight = len < 10 ? '600' : '';
                }
                if (minEl) minEl.style.display = len >= 10 ? 'none' : '';
                if (len >= 10) ta.classList.remove('rnc-dmot-error');
            });
            setTimeout(function(){ ta.focus(); }, 80);
        }

        document.getElementById('rncDmotOkBtn').onclick = function() {
            var motivo = (ta ? ta.value : '').trim();
            if (motivo.length < 10) {
                ta.classList.add('rnc-dmot-error');
                ta.placeholder = 'Mínimo de 10 caracteres!';
                ta.focus();
                return;
            }
            wrap.innerHTML = '';
            var arr = window.rncItems || [];
            var idx = arr.findIndex(function(x){ return x.id === id; });
            if (idx !== -1) {
                arr[idx].deleted = true;
                arr[idx].deletedAt = new Date().toISOString();
                arr[idx].deletedBy = meName();
                arr[idx].deletedMotivo = motivo;
            }
            persist(); renderRnc(); updateRncNotificationBell(); updateRncTrashBadge();
            toast('RNC movida para a lixeira.', 'success');
            if (rncViewId === id) window.rncCloseView();
        };

        document.getElementById('rncDmotBackdrop').addEventListener('click', function(e) {
            if (e.target === e.currentTarget) wrap.innerHTML = '';
        });
    }

    // ── Autocomplete dos campos ──
    function rncCloseAllDropdowns() {
        ['rncOrigemDropdown','rncDetalhamentoDropdown','rncStatusDropdown',
         'rncMarkerDropdown'].forEach(function(id){
            var el = document.getElementById(id); if (el) el.classList.remove('open');
        });
    }
    window.rncCloseAllDropdowns = rncCloseAllDropdowns;

    function buildRncAcFull(inputId, dropId, items, selectFn) {
        var input = document.getElementById(inputId), dd = document.getElementById(dropId);
        if (!input || !dd) return;
        var val = (input.value || '').toLowerCase();
        var filtered = val ? items.filter(function(x){ return String(x).toLowerCase().indexOf(val) !== -1; }) : items;
        if (!filtered.length) { dd.classList.remove('open'); return; }
        dd.innerHTML = filtered.map(function(x){
            return '<button class="rnc-ac-option" onclick="' + selectFn + '(\'' + esc(x) + '\')">' + esc(x) + '</button>';
        }).join('');
        dd.classList.add('open');
    }

    window.rncOrigemInput = function() {
        buildRncAcFull('rncFOrigem', 'rncOrigemDropdown', getOrigens().map(function(o){ return o.name; }), 'rncSelectOrigem');
    };
    window.rncSelectOrigem = function(v) {
        setVal('rncFOrigem', v);
        var dd = document.getElementById('rncOrigemDropdown'); if (dd) dd.classList.remove('open');
    };
    window.rncDetalhamentoInput = function() {
        buildRncAcFull('rncFDetalhamento', 'rncDetalhamentoDropdown', getDetalhamentos().map(function(d){ return d.name; }), 'rncSelectDetalhamento');
    };
    window.rncSelectDetalhamento = function(v) {
        setVal('rncFDetalhamento', v);
        var dd = document.getElementById('rncDetalhamentoDropdown'); if (dd) dd.classList.remove('open');
    };
    window.rncStatusInput = function() {
        buildRncAcFull('rncFStatus', 'rncStatusDropdown', getRncStatusList().map(function(s){ return s.name; }), 'rncSelectStatus');
    };
    window.rncSelectStatus = function(v) {
        setVal('rncFStatus', v);
        var dd = document.getElementById('rncStatusDropdown'); if (dd) dd.classList.remove('open');
    };


    // ══════════════════════════════════════════════════════════════════
    //  VIEW MODAL (modal de visualização)
    // ══════════════════════════════════════════════════════════════════

    // Guarda o card (rotina/atividade/etc.) que estava aberto por trás, para restaurar
    // ao fechar a visualização da RNC aberta como referência (ex.: a partir de uma publicação).
    var _rncViewPrevContext = null;

    window.rncOpenView = function(id) {
        id = Number(id);
        var r = (window.rncItems || []).find(function(x){ return x.id === id; });
        if (!r) return;
        rncViewId = id;
        rncPubSubtab = 'Geral';
        rncPubPage = 1;
        // Preserva o contexto anterior (outro card pode estar aberto por trás desta RNC)
        if (window._currentViewTab !== 'rnc' || window._currentViewId !== id) {
            _rncViewPrevContext = { id: window._currentViewId, tab: window._currentViewTab, itemId: window.currentViewItemId };
        }
        // Expõe para o sistema de publicações reutilizar o #modalPublicacao
        window._currentViewId = id;
        window._currentViewTab = 'rnc';
        window.currentViewItemId = id;
        _renderRncView(r);
        var modal = document.getElementById('rncViewModal');
        var bk = document.getElementById('rncViewBackdrop');
        if (modal) modal.classList.add('open');
        if (bk) bk.classList.add('open');
        // Ativa primeira aba
        var firstTab = modal && modal.querySelector('.rnc-view-tab');
        if (firstTab) rncSwitchViewTab('rnc-vinfo', firstTab);
    };

    window.rncCloseView = function() {
        var modal = document.getElementById('rncViewModal');
        var bk = document.getElementById('rncViewBackdrop');
        if (modal) modal.classList.remove('open');
        if (bk) bk.classList.remove('open');
        rncViewId = null;
        // Restaura o contexto do card que estava aberto por trás (se houver)
        if (_rncViewPrevContext) {
            window._currentViewId = _rncViewPrevContext.id;
            window._currentViewTab = _rncViewPrevContext.tab;
            window.currentViewItemId = _rncViewPrevContext.itemId;
            _rncViewPrevContext = null;
        } else {
            window._currentViewId = null;
            window._currentViewTab = null;
            window.currentViewItemId = null;
        }
    };

    window.rncSwitchViewTab = function(panelId, btn) {
        var modal = document.getElementById('rncViewModal');
        if (!modal) return;
        modal.querySelectorAll('.rnc-view-tab').forEach(function(t){ t.classList.remove('active'); });
        modal.querySelectorAll('.rnc-view-panel').forEach(function(p){ p.classList.remove('active'); });
        if (btn) btn.classList.add('active');
        var panel = document.getElementById(panelId);
        if (panel) panel.classList.add('active');
        // FAB "Nova Publicação" fixo no rodapé: visível apenas na aba de Publicações
        var fab = document.getElementById('rncViewPubFab');
        var fabItem = (typeof window.rncViewEditId !== 'undefined') ? (window.rncItems || []).find(function(x){ return x.id === window.rncViewEditId; }) : null;
        if (fab) fab.style.display = (panelId === 'rnc-vpub' && canEdit(fabItem)) ? '' : 'none';
    };
    function rncSwitchViewTab(panelId, btn) { window.rncSwitchViewTab(panelId, btn); }

    function _renderRncView(r) {
        var ci = getCI(r.classificacao);
        var mk = getMarker(r.marcador);
        window.rncViewEditId = r.id;

        // Header com gradiente (espelha a visualização de Ocorrência)
        var hdr = document.getElementById('rncViewHeader');
        if (hdr) hdr.style.setProperty('--rnc-view-accent', ci.color);
        var hicon = document.getElementById('rncViewHeaderIcon');
        if (hicon) hicon.innerHTML = '<i class="fas ' + ci.icon + '"></i>';
        var hedit = document.getElementById('rncViewHeaderEdit');
        if (hedit) hedit.style.display = canEdit(r) ? '' : 'none';

        // Título
        var t = document.getElementById('rncViewTitle'); if (t) t.textContent = r.titulo || 'RNC';

        // Linha de metadados (setor · responsável · conclusão)
        var meta = [];
        if (setorArr(r.setor).length) meta.push('<span><i class="fas fa-building"></i> ' + esc(setorText(r.setor)) + '</span>');
        var _respArr = rncArrField(r.responsavel);
        if (_respArr.length) meta.push('<span><i class="fas fa-user"></i> ' + rncNamesHtml(_respArr) + '</span>');
        if (r.dataConclusao) meta.push('<span><i class="far fa-calendar-check"></i> ' + esc(fmtDate(r.dataConclusao)) + '</span>');
        var sub = document.getElementById('rncViewSubtitle');
        if (sub) sub.innerHTML = meta.join('<span class="rnc-view-meta-sep">·</span>');

        // Chips (classificação + marcador)
        var chips = document.getElementById('rncViewHeaderChips');
        if (chips) chips.innerHTML =
            '<span class="rnc-view-hchip"><i class="fas ' + ci.icon + '"></i> ' + esc(ci.label) + '</span>' +
            (mk ? '<span class="rnc-view-hchip"><i class="fas ' + mk.icon + '"></i> ' + esc(mk.label) + '</span>' : '') +
            (r.status ? '<span class="rnc-view-hchip"><i class="fas fa-circle-dot"></i> ' + esc(r.status) + '</span>' : '');

        // Painel Info
        var info = document.getElementById('rncViewInfoContent');
        if (info) {
            var mkv = getMarker(r.marcador);
            info.innerHTML =
                '<div class="rnc-view-groups">' +
                _vgroup('fa-triangle-exclamation', '#2563eb', 'Identificação',
                    _vrow('fa-heading', 'Título', '<strong>' + esc(r.titulo || '—') + '</strong>') +
                    _vrow('fa-building', 'Setor', setorChipsHtml(r.setor, '<em class="rnc-vrow-empty">—</em>')) +
                    _vrow('fa-tag', 'Classificação', '<span class="rnc-class-badge rnc-class-badge--sm" style="' + rncClassStyle(ci) + '"><i class="fas ' + ci.icon + '"></i> ' + esc(ci.label) + '</span>') +
                    _vrow('fa-circle-dot', 'Status', r.status ? '<span class="rnc-vrow-pill" style="' + rncStatusColorStyle(r.status) + '">' + esc(r.status) + '</span>' : '<em class="rnc-vrow-empty">Não definido</em>') +
                    _vrow('fa-bookmark', 'Marcador', mkv ? '<span class="rnc-vrow-pill" style="background:' + mkv.bg + ';color:' + mkv.color + ';border-color:' + mkv.color + '33"><i class="fas ' + mkv.icon + '"></i> ' + esc(mkv.label) + '</span>' : '<em class="rnc-vrow-empty">Nenhum</em>')
                ) +
                _vgroup('fa-calendar-days', '#7c3aed', 'Datas & Responsabilidade',
                    _vrow('fa-calendar-plus', 'Início', r.dataInicio ? esc(fmtDate(r.dataInicio)) : '<em class="rnc-vrow-empty">—</em>') +
                    _vrow('fa-calendar-check', 'Conclusão prevista', r.dataConclusao ? esc(fmtDate(r.dataConclusao)) : '<em class="rnc-vrow-empty">—</em>') +
                    _vrow('fa-user-tie', 'Responsável', rncNamesChips(rncArrField(r.responsavel))) +
                    (rncArrField(r.revisor).length ? _vrow('fa-user-check', 'Revisor', rncNamesChips(rncArrField(r.revisor))) : '') +
                    _vrow('fa-clock', 'Registrado em', esc(fmtDateTime(r.createdAt)))
                ) +
                _vgroup('fa-map-pin', '#0891b2', 'Origem & Detalhamento',
                    _vrow('fa-location-dot', 'Origem', esc(r.origem || '—')) +
                    _vrow('fa-list-ul', 'Detalhamento', esc(r.detalhamento || '—'))
                ) +
                _vgroup('fa-file-lines', '#16a34a', 'Descrição & Plano de Ação',
                    _vtext('Descrição do Ocorrido', esc(r.descricao || '—').replace(/\n/g,'<br>')) +
                    _vtext('Plano de Ação', r.planoAcao ? esc(r.planoAcao).replace(/\n/g,'<br>') : '<em class="rnc-vrow-empty">Não informado</em>')
                ) +
                '</div>';
        }

        // Painel Checklist
        _renderRncViewCl(r);

        // Painel Publicações
        _renderRncViewPubs(r);

        // Painel Anexos
        _renderRncViewAx(r);

        // Badges
        _updateRncViewBadges(r);
    }

    function _field(label, valueHtml) {
        return '<div class="rnc-view-field"><label>' + esc(label) + '</label><div>' + valueHtml + '</div></div>';
    }
    function _vgroup(icon, color, title, fields) {
        return '<div class="rnc-vgroup" style="--vg-color:' + color + '">' +
            '<div class="rnc-vgroup-header">' +
                '<span class="rnc-vgroup-icon"><i class="fas ' + icon + '"></i></span>' +
                '<span class="rnc-vgroup-title">' + title + '</span>' +
            '</div>' +
            '<div class="rnc-vgroup-body">' + fields + '</div>' +
        '</div>';
    }
    function _vrow(icon, label, valueHtml) {
        return '<div class="rnc-vrow">' +
            '<span class="rnc-vrow-icon"><i class="fas ' + icon + '"></i></span>' +
            '<span class="rnc-vrow-label">' + esc(label) + '</span>' +
            '<span class="rnc-vrow-value">' + valueHtml + '</span>' +
        '</div>';
    }
    function _vtext(label, valueHtml) {
        return '<div class="rnc-vtext-block"><label>' + esc(label) + '</label><div class="rnc-vtext-body">' + valueHtml + '</div></div>';
    }

    function _updateRncViewBadges(r) {
        var cl = r.checklist || []; var clDone = cl.filter(function(c){ return c.checked; }).length;
        var el = document.getElementById('rncViewClBadge');
        if (el) { el.textContent = cl.length > 0 ? clDone+'/'+cl.length : ''; el.style.display = cl.length > 0 ? '' : 'none'; }
        var pb = document.getElementById('rncViewPubBadge');
        if (pb) { var np = (r.publicacoes||[]).length; pb.textContent = np||''; pb.style.display = np>0?'':'none'; }
        var ab = document.getElementById('rncViewAxBadge');
        if (ab) { var na = (r.anexos||[]).length; ab.textContent = na||''; ab.style.display = na>0?'':'none'; }
    }

    // ── Checklist no view modal ──
    function _renderRncViewCl(r) {
        var container = document.getElementById('rncViewClContent');
        if (!container) return;
        var cl = r.checklist || [];
        if (cl.length === 0) {
            container.innerHTML = '<div class="rnc-pub-empty"><i class="fas fa-list-check"></i><p>Nenhum item de checklist cadastrado.</p></div>';
            return;
        }
        var done = cl.filter(function(c){ return c.checked; }).length;
        var pct = Math.round((done/cl.length)*100);
        container.innerHTML =
            '<div class="rnc-view-cl-progress">' +
                '<div class="rnc-view-cl-bar"><div class="rnc-view-cl-bar-fill" style="width:' + pct + '%"></div></div>' +
                '<span class="rnc-view-cl-count">' + done + '/' + cl.length + ' (' + pct + '%)</span>' +
            '</div>' +
            cl.map(function(item, i) {
                var disabled = !canEdit(r) || (!item.checked && item.requiresComment && !(item.comment||'').trim());
                return '<div class="rnc-view-cl-item' + (item.checked?' checked':'') + '" id="rncvcl-' + r.id + '-' + i + '">' +
                    '<input type="checkbox" ' + (item.checked?'checked':'') + (disabled?' disabled':'') +
                        ' onchange="rncToggleCl(' + r.id + ',' + i + ')">' +
                    '<span class="cl-text">' + esc(item.texto||'') + '</span>' +
                '</div>';
            }).join('');
    }

    window.rncToggleCl = function(id, idx) {
        id = Number(id);
        var r = (window.rncItems||[]).find(function(x){ return x.id===id; });
        if (!r || !r.checklist) return;
        var c = r.checklist[idx]; if (!c) return;
        if (!canEdit(r)) return;
        if (!c.checked && c.requiresComment && !(c.comment||'').trim()) return;
        c.checked = !c.checked;
        persist();
        _renderRncViewCl(r);
        _updateRncViewBadges(r);
        renderRnc();
    };

    // ── Publicações no view modal (sub-abas: Geral / Comentário / Atualização / Evidência) ──
    var RNC_PUB_TIPOS = [
        { key: 'Comentário',  label: 'Comentário',  icon: 'fa-comment-dots',        color: '#2563eb' },
        { key: 'Atualização', label: 'Atualização', icon: 'fa-rotate',              color: '#0891b2' },
        { key: 'Evidência',   label: 'Evidência',   icon: 'fa-file-circle-check',   color: '#16a34a' }
    ];
    var rncPubSubtab = 'Geral';
    var rncPubPage = 1;
    var RNC_PUB_PER_PAGE = 10;

    function _rncPubItemHtml(r, p, i, canMg) {
        return '<div class="rnc-pub-item" onclick="rncOpenPubView(' + JSON.stringify(r.id) + ',' + i + ',' + canMg + ')">' +
            '<div class="rnc-pub-item-header">' +
                '<div class="rnc-pub-item-meta">' +
                    '<span class="rnc-pub-item-type">' + esc(p.tipo||'Comentário') + '</span>' +
                    '<span class="rnc-pub-item-date"><i class="fas fa-calendar"></i> ' + esc(fmtDate(p.data)) + (p.hora ? ' ' + esc(p.hora) : '') + '</span>' +
                    (p.usuario ? '<span class="rnc-pub-item-user"><i class="fas fa-user"></i> ' + esc(p.usuario) + '</span>' : '') +
                '</div>' +
            '</div>' +
            '<div class="rnc-pub-item-desc">' + esc(p.descricao||'').replace(/\n/g,'<br>') + '</div>' +
            (p.anexos && p.anexos.length > 0 ? '<div style="margin-top:6px;font-size:12px;color:#94a3b8"><i class="fas fa-paperclip"></i> ' + p.anexos.length + ' anexo(s)</div>' : '') +
        '</div>';
    }

    // Paleta por tipo de publicação
    var _PUB_META = {
        'Comentário':  { icon: 'fa-comment-dots',      color: '#2563eb' },
        'Atualização': { icon: 'fa-rotate',             color: '#0891b2' },
        'Evidência':   { icon: 'fa-file-circle-check',  color: '#16a34a' }
    };

    window.rncOpenPubView = function(rncId, pubIdx, canMg) {
        var r = (window.rncItems || []).find(function(x){ return x.id === rncId; });
        if (!r) return;
        var p = (r.publicacoes || [])[pubIdx];
        if (!p) return;

        var tipo = p.tipo || 'Comentário';
        var meta = _PUB_META[tipo] || _PUB_META['Comentário'];
        var modal = document.getElementById('rncPubViewModal');
        if (!modal) return;

        // Cor temática
        modal.querySelector('.rnc-pubview-box').style.setProperty('--rnc-pv-color', meta.color);

        // Hero cabeçalho
        var hero = document.getElementById('rncPubViewHero');
        if (hero) hero.style.setProperty('--rnc-pv-color', meta.color);
        var heroIcon = document.getElementById('rncPubViewHeroIcon');
        if (heroIcon) heroIcon.className = 'fas ' + meta.icon;
        var heroLabel = document.getElementById('rncPubViewHeroLabel');
        if (heroLabel) heroLabel.textContent = tipo;

        // Meta info
        var metaEl = document.getElementById('rncPubViewMeta');
        var metaItems = [];
        if (p.data) metaItems.push('<span class="rnc-pubview-meta-item"><i class="fas fa-calendar-alt"></i> <strong>' + esc(fmtDate(p.data)) + (p.hora ? ' ' + esc(p.hora) : '') + '</strong></span>');
        if (p.usuario) metaItems.push('<span class="rnc-pubview-meta-item"><i class="fas fa-user-circle"></i> <strong>' + esc(p.usuario) + '</strong></span>');
        metaEl.innerHTML = metaItems.join('');

        // Corpo
        document.getElementById('rncPubViewBody').innerHTML = esc(p.descricao || '').replace(/\n/g, '<br>') || '<em style="color:#94a3b8">Sem descrição.</em>';

        // Anexos
        var axWrap = document.getElementById('rncPubViewAnexos');
        var axList = document.getElementById('rncPubViewAnexosList');
        var anexos = p.anexos || [];
        if (anexos.length > 0) {
            axList.innerHTML = anexos.map(function(a) {
                var name = a.titulo || a.url || 'Arquivo';
                var ext = name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : '';
                var icon = ext === '.pdf' ? 'fa-file-pdf' :
                           ['.xls','.xlsx'].includes(ext) ? 'fa-file-excel' :
                           ['.jpg','.jpeg','.png','.gif','.webp'].includes(ext) ? 'fa-file-image' :
                           ['.ppt','.pptx'].includes(ext) ? 'fa-file-powerpoint' : 'fa-file';
                return '<a href="' + esc(a.url||'#') + '" target="_blank" class="rnc-pubview-anexo-link"><i class="fas ' + icon + '"></i>' + esc(name) + '</a>';
            }).join('');
            axWrap.style.display = '';
        } else {
            axWrap.style.display = 'none';
        }

        // Botões de ação
        var footer = document.getElementById('rncPubViewFooter');
        if (canMg) {
            footer.style.display = '';
            document.getElementById('rncPubViewEditBtn').onclick = function() { rncClosePubView(); rncOpenPubModal(pubIdx); };
            document.getElementById('rncPubViewDelBtn').onclick = function() { rncClosePubView(); rncDeletePub(rncId, pubIdx); };
        } else {
            footer.style.display = 'none';
        }

        modal.style.display = 'flex';
    };

    window.rncClosePubView = function() {
        var modal = document.getElementById('rncPubViewModal');
        if (modal) modal.style.display = 'none';
    };

    function _renderRncViewPubs(r) {
        var container = document.getElementById('rncViewPubContent');
        if (!container) return;
        var pubs = r.publicacoes || [];
        var canMg = canEdit(r);

        // Conta por tipo (mapeia tipos legados para "Comentário")
        function tipoOf(p) {
            var t = p.tipo || 'Comentário';
            return (t === 'Comentário' || t === 'Atualização' || t === 'Evidência') ? t : 'Comentário';
        }
        var counts = { 'Comentário': 0, 'Atualização': 0, 'Evidência': 0 };
        pubs.forEach(function(p){ counts[tipoOf(p)]++; });

        // Barra de sub-abas
        var geralActive = rncPubSubtab === 'Geral';
        var subtabs = '<div class="rnc-pub-subtabs">' +
            '<button class="rnc-pub-subtab' + (geralActive ? ' active' : '') + '" style="--rnc-pst-color:#64748b" onclick="rncSwitchPubSubtab(\'Geral\')">' +
                '<i class="fas fa-layer-group"></i> Geral' +
            '</button>' +
            RNC_PUB_TIPOS.map(function(t){
                var active = rncPubSubtab === t.key;
                return '<button class="rnc-pub-subtab' + (active ? ' active' : '') + '" style="--rnc-pst-color:' + t.color + '" onclick="rncSwitchPubSubtab(\'' + t.key + '\')">' +
                    '<i class="fas ' + t.icon + '"></i> ' + t.label +
                    (counts[t.key] > 0 ? '<span class="rnc-pub-subtab-badge">' + counts[t.key] + '</span>' : '') +
                '</button>';
            }).join('') +
        '</div>';

        // Lista filtrada pela sub-aba ativa (invertida = mais recente primeiro)
        var pool;
        if (rncPubSubtab === 'Geral') {
            pool = pubs.map(function(p, idx){ return { p: p, i: idx }; }).slice().reverse();
        } else {
            pool = pubs.map(function(p, idx){ return { p: p, i: idx }; })
                       .filter(function(o){ return tipoOf(o.p) === rncPubSubtab; })
                       .slice().reverse();
        }

        var listHtml;
        if (pool.length === 0) {
            if (rncPubSubtab === 'Geral') {
                listHtml = '<div class="rnc-pub-empty"><i class="fas fa-layer-group"></i><p>Nenhuma publicação registrada.</p></div>';
            } else {
                var cur = RNC_PUB_TIPOS.find(function(t){ return t.key === rncPubSubtab; }) || RNC_PUB_TIPOS[0];
                listHtml = '<div class="rnc-pub-empty"><i class="fas ' + cur.icon + '"></i><p>Nenhuma publicação do tipo "' + cur.label + '".</p></div>';
            }
        } else {
            var totalPages = Math.max(1, Math.ceil(pool.length / RNC_PUB_PER_PAGE));
            if (rncPubPage > totalPages) rncPubPage = totalPages;
            var pageItems = pool.slice((rncPubPage - 1) * RNC_PUB_PER_PAGE, rncPubPage * RNC_PUB_PER_PAGE);

            var paginationHtml = '';
            if (totalPages > 1) {
                var pages = '';
                for (var pg = 1; pg <= totalPages; pg++) {
                    pages += '<button class="rnc-pub-pgbtn' + (pg === rncPubPage ? ' active' : '') + '" onclick="rncGoToPubPage(' + pg + ')">' + pg + '</button>';
                }
                paginationHtml = '<div class="rnc-pub-pagination">' +
                    '<button class="rnc-pub-pgbtn" onclick="rncGoToPubPage(' + (rncPubPage - 1) + ')" ' + (rncPubPage === 1 ? 'disabled' : '') + '><i class="fas fa-chevron-left"></i></button>' +
                    pages +
                    '<button class="rnc-pub-pgbtn" onclick="rncGoToPubPage(' + (rncPubPage + 1) + ')" ' + (rncPubPage === totalPages ? 'disabled' : '') + '><i class="fas fa-chevron-right"></i></button>' +
                    '<span class="rnc-pub-pgcount">' + pool.length + ' publicaç' + (pool.length !== 1 ? 'ões' : 'ão') + '</span>' +
                '</div>';
            } else {
                paginationHtml = '<div class="rnc-pub-pagination"><span class="rnc-pub-pgcount">' + pool.length + ' publicaç' + (pool.length !== 1 ? 'ões' : 'ão') + '</span></div>';
            }

            listHtml = '<div class="rnc-pub-list">' +
                pageItems.map(function(o){ return _rncPubItemHtml(r, o.p, o.i, canMg); }).join('') +
            '</div>' + paginationHtml;
        }
        container.innerHTML = subtabs + listHtml;
    }

    window.rncSwitchPubSubtab = function(key) {
        rncPubSubtab = key;
        rncPubPage = 1;
        if (!rncViewId) return;
        var r = (window.rncItems||[]).find(function(x){ return x.id === rncViewId; });
        if (r) _renderRncViewPubs(r);
    };

    window.rncGoToPubPage = function(page) {
        rncPubPage = page;
        if (!rncViewId) return;
        var r = (window.rncItems||[]).find(function(x){ return x.id === rncViewId; });
        if (r) _renderRncViewPubs(r);
    };

    window.rncOpenPubModal = function(editIndex) {
        if (!rncViewId) return;
        // Usa o modal de publicação existente configurando o contexto para 'rnc'
        if (typeof openPublicacaoModal === 'function') {
            openPublicacaoModal(editIndex);
            // Em nova publicação, pré-seleciona o tipo conforme a sub-aba ativa
            var isNew = (editIndex === undefined || editIndex === null);
            if (isNew) {
                var sel = document.getElementById('pubTipo');
                if (sel) sel.value = rncPubSubtab;
            }
        }
    };

    window.rncDeletePub = function(id, index) {
        id = Number(id);
        var r = (window.rncItems||[]).find(function(x){ return x.id===id; });
        if (!r || !r.publicacoes) return;
        rncConfirm({
            title: 'Excluir publicação?',
            message: 'Esta publicação será removida permanentemente.',
            confirmLabel: 'Excluir', icon: 'fa-trash'
        }, function() {
            var pubRemovida = r.publicacoes[index];
            (pubRemovida && pubRemovida.anexos || []).forEach(function(a) {
                if (a && a.tipo === 'imagem' && a.fileId && typeof window._deleteImgBlob === 'function') window._deleteImgBlob(a.fileId);
            });
            r.publicacoes.splice(index, 1);
            persist();
            _renderRncViewPubs(r);
            _updateRncViewBadges(r);
            renderRnc();
            toast('Publicação excluída.', 'success');
        });
    };

    // Chamado após confirmarPublicacao quando tab='rnc'
    window.rncRefreshViewPubs = function() {
        if (!rncViewId) return;
        var r = (window.rncItems||[]).find(function(x){ return x.id===rncViewId; });
        if (!r) return;
        _renderRncViewPubs(r);
        _updateRncViewBadges(r);
        renderRnc();
    };

    // ── Anexos no view modal ──
    function _renderRncViewAx(r) {
        var container = document.getElementById('rncViewAxContent');
        if (!container) return;
        var anexos = r.anexos || [];
        if (anexos.length === 0) {
            container.innerHTML = '<div class="rnc-pub-empty"><i class="fas fa-paperclip"></i><p>Nenhum anexo cadastrado.</p></div>';
            return;
        }
        container.innerHTML = '<div class="view-anexos-grid">' +
            anexos.map(function(a) {
                var name = a.titulo || a.url || 'Arquivo';
                var ext = name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : '';
                var icon = 'fa-file';
                if (ext==='.pdf') icon='fa-file-pdf';
                else if (['.xls','.xlsx'].includes(ext)) icon='fa-file-excel';
                else if (['.jpg','.jpeg','.png','.gif','.webp'].includes(ext)) icon='fa-file-image';
                else if (['.ppt','.pptx'].includes(ext)) icon='fa-file-powerpoint';
                return '<a href="' + esc(a.url||'') + '" target="_blank" class="view-anexo-card">' +
                    '<i class="fas ' + icon + ' anexo-icon"></i>' +
                    '<span class="anexo-name">' + esc(name) + '</span>' +
                '</a>';
            }).join('') +
        '</div>';
    }

    // ══════════════════════════════════════════════════════════════════
    //  GERENCIADOR DE LISTAS
    // ══════════════════════════════════════════════════════════════════

    window.rncOpenManager = function(kind) {
        if (!canManage()) { toast('Sem permissão para gerenciar listas.', 'error'); return; }
        rncManagerKind = kind;
        _rncManagerNewColor = 'default';
        var titles = { origens: 'Origens', detalhamentos: 'Detalhamentos', status: 'Status (Kanban)' };
        var el = document.getElementById('rncManagerTitle');
        if (el) el.textContent = 'Gerenciar ' + (titles[kind] || kind);
        // Mostra/oculta seletor de cores
        var needsColor = kind === 'status';
        var cp = document.getElementById('rncManagerColorPicker');
        if (cp) { cp.style.display = needsColor ? 'flex' : 'none'; }
        if (needsColor) _renderRncManagerColorPicker();
        _renderRncManagerList();
        var modal = document.getElementById('rncManagerModal');
        if (modal) modal.style.display = 'flex';
    };

    window.rncCloseManager = function() {
        var modal = document.getElementById('rncManagerModal');
        if (modal) modal.style.display = 'none';
        rncManagerKind = null;
    };

    function _getManagerList() {
        ensureLists();
        if (rncManagerKind === 'origens')       return masterLists.rncOrigens;
        if (rncManagerKind === 'detalhamentos') return masterLists.rncDetalhamentos;
        if (rncManagerKind === 'status')        return masterLists.rncStatus;
        return [];
    }
    // Origens/Detalhamentos ficam em ordem alfabética; Status (Kanban) mantém a ordem manual.
    function _sortManagerListIfNeeded() {
        if (rncManagerKind === 'origens' || rncManagerKind === 'detalhamentos') {
            _getManagerList().sort(function(a,b){ return String(a.name).localeCompare(String(b.name), 'pt'); });
        }
    }

    var RNC_PALETTE = [
        { key:'default', hex:'#94a3b8' }, { key:'blue',   hex:'#3b82f6' },
        { key:'green',   hex:'#22c55e' }, { key:'red',    hex:'#ef4444' },
        { key:'orange',  hex:'#f97316' }, { key:'yellow', hex:'#eab308' },
        { key:'purple',  hex:'#a855f7' }, { key:'pink',   hex:'#ec4899' },
        { key:'teal',    hex:'#14b8a6' }
    ];
    var _rncManagerNewColor = 'default';

    function _renderRncManagerList() {
        _sortManagerListIfNeeded();
        var list = _getManagerList();
        var body = document.getElementById('rncManagerList');
        if (!body) return;
        var isStatus = rncManagerKind === 'status';
        if (!list.length) {
            body.innerHTML = '<div style="text-align:center;padding:28px;color:#94a3b8;font-size:13px;">Nenhum item cadastrado.</div>';
            return;
        }
        body.innerHTML = list.map(function(item, i) {
            var color = isStatus ? rncResolveColor(item.color) : null;
            return '<div class="rnc-manager-item">' +
                '<div class="rnc-manager-item-left">' +
                    (isStatus ? '<span class="rnc-manager-item-dot" style="background:' + color + '"></span>' : '') +
                    '<span>' + esc(item.name) + '</span>' +
                '</div>' +
                (isStatus ?
                '<div class="rnc-manager-item-final">' +
                    '<button class="rnc-final-toggle' + (item.finalKind === 'concluido' ? ' active-ok' : '') + '" title="Marcar como status de conclusão" onclick="rncSetStatusFinalKind(' + i + ',\'concluido\')"><i class="fas fa-circle-check"></i> Concluído</button>' +
                    '<button class="rnc-final-toggle' + (item.finalKind === 'cancelado' ? ' active-cancel' : '') + '" title="Marcar como status de cancelamento" onclick="rncSetStatusFinalKind(' + i + ',\'cancelado\')"><i class="fas fa-circle-xmark"></i> Cancelado</button>' +
                '</div>' : '') +
                '<div class="rnc-manager-item-actions">' +
                    '<button onclick="rncManagerEdit(' + i + ')" title="Editar"><i class="fas fa-pen"></i></button>' +
                    '<button class="danger" onclick="rncManagerRemove(' + i + ')" title="Remover"><i class="fas fa-trash"></i></button>' +
                '</div>' +
            '</div>';
        }).join('');
    }

    function _renderRncManagerColorPicker() {
        var wrap = document.getElementById('rncManagerColorPicker');
        if (!wrap) return;
        wrap.innerHTML = '<span class="rnc-color-picker-label">Cor:</span>' +
            RNC_PALETTE.map(function(p) {
                return '<button type="button" class="rnc-color-dot-btn' + (_rncManagerNewColor===p.key?' active':'') + '" ' +
                    'style="background:' + p.hex + '" ' +
                    'title="' + p.key + '" ' +
                    'onclick="rncManagerPickColor(\'' + p.key + '\')">' +
                    '<i class="fas fa-check"></i>' +
                '</button>';
            }).join('');
    }

    window.rncSetStatusFinalKind = function(idx, kind) {
        var list = _getManagerList();
        var item = list[idx]; if (!item) return;
        var turningOn = item.finalKind !== kind;
        list.forEach(function(s, i) { if (i !== idx && s.finalKind === kind) s.finalKind = null; });
        item.finalKind = turningOn ? kind : null;
        persist(); _renderRncManagerList(); renderRnc();
    };

    window.rncManagerPickColor = function(key) {
        _rncManagerNewColor = key;
        _renderRncManagerColorPicker();
    };

    window.rncManagerAdd = function() {
        var input = document.getElementById('rncManagerInput');
        if (!input) return;
        var name = input.value.trim();
        if (!name) { toast('Informe o nome.', 'error'); return; }
        var list = _getManagerList();
        if (list.some(function(x){ return String(x.name).trim().toLowerCase() === name.toLowerCase(); })) {
            toast('Já existe um item com este nome.', 'warn'); return;
        }
        var item = { id: String(Date.now()), name: name };
        if (rncManagerKind === 'status')    item.color = _rncManagerNewColor;
        list.push(item);
        _sortManagerListIfNeeded();
        input.value = ''; input.focus();
        persist(); _renderRncManagerList();
        toast('Item adicionado.', 'success');
    };

    window.rncManagerEdit = function(idx) {
        var list = _getManagerList();
        var item = list[idx]; if (!item) return;
        var newName = prompt('Editar: ' + item.name, item.name);
        if (!newName || !newName.trim()) return;
        item.name = newName.trim();
        _sortManagerListIfNeeded();
        persist(); _renderRncManagerList(); renderRnc();
        toast('Item atualizado.', 'success');
    };

    window.rncManagerRemove = function(idx) {
        var list = _getManagerList();
        if (!list[idx]) return;
        rncConfirm({
            title: 'Remover item',
            message: 'Tem certeza que deseja remover "' + list[idx].name + '"?',
            confirmLabel: 'Remover', icon: 'fa-trash'
        }, function() {
            list.splice(idx, 1);
            persist(); _renderRncManagerList(); renderRnc();
            toast('Item removido.', 'success');
        });
    };

    // ══════════════════════════════════════════════════════════════════
    //  ATIVAÇÃO DA ABA
    // ══════════════════════════════════════════════════════════════════

    window.rncActivateTab = function() {
        ensureLists();
        rncPage = 1;
        window.rncSetHeaderFilters(true);
        updateRncSetorHeadLabel();
        updateRncDateHeadLabel();
        updateRncNotificationBell();
        updateRncTrashBadge();
        applyRncTaskViewPermission();
        applyRncManagePermission();
        // Reset view toggle
        window.switchRncView(rncView);
    };

    // Oculta os botões de gerenciar/adicionar listas (origens, detalhamentos, kanban, marcadores) sem permissão.
    function applyRncManagePermission() {
        var allowed = canManage();
        var wrap = document.querySelector('.rnc-manage-wrap');
        if (wrap) wrap.style.display = allowed ? '' : 'none';
        document.querySelectorAll('.rnc-field-plus[onclick*="rncOpenManager"]').forEach(function(b){
            b.style.display = allowed ? '' : 'none';
        });
    }
    window.applyRncManagePermission = applyRncManagePermission;

    // Restringe a visualização de RNC conforme permissão "Visualizar RNC" (cfgRncTaskView).
    // 'usuario': remove a opção "Todas RNC's" e força modo "Como responsável" por padrão.
    function applyRncTaskViewPermission() {
        var restrict = (typeof userRncTaskView === 'function') && userRncTaskView() === 'usuario';
        var dd = document.getElementById('rncMyDropdown');
        if (dd) {
            var allBtn = dd.querySelector('button[data-mode="all"]');
            if (allBtn) allBtn.style.display = restrict ? 'none' : '';
        }
        if (restrict && rncMyMode === 'all') {
            window.rncSetMyMode('responsavel');
        }
    }
    window.applyRncTaskViewPermission = applyRncTaskViewPermission;

    // Expõe para o listener do Firebase
    window.rncRenderTable = function() { renderRnc(); updateRncTrashBadge(); };

    // ══════════════════════════════════════════════════════════════════
    //  CLICK OUTSIDE
    // ══════════════════════════════════════════════════════════════════

    document.addEventListener('click', function(e) {
        // My dropdown
        if (!e.target.closest('.rnc-my-wrap')) {
            var dd = document.getElementById('rncMyDropdown'); if (dd) dd.classList.remove('open');
        }
        // Classificação / Origem / Detalhamento dropdowns
        if (!e.target.closest('.rnc-class-wrap')) {
            ['rncClassDropdown','rncOrigemFilterDropdown','rncDetFilterDropdown'].forEach(function(id){
                var d = document.getElementById(id); if (d) d.classList.remove('open');
            });
        }
        // Manage dropdown
        if (!e.target.closest('.rnc-manage-wrap')) {
            window.rncCloseManageDropdown();
        }
        // Head dropdowns
        if (!e.target.closest('.rnc-head-filter')) {
            rncCloseHeadDropdowns();
        }
        // Autocomplete e marcador
        if (!e.target.closest('.rnc-ac-wrap') && !e.target.closest('.rnc-field-inline') && !e.target.closest('.rnc-marker-trigger')) {
            rncCloseAllDropdowns();
            var mdd = document.getElementById('rncMarkerDropdown');
            if (mdd) mdd.classList.remove('open');
        }
        // Notification modal
        var nm = document.getElementById('rncNotificationModal');
        var nc = document.getElementById('rncNotificationContainer');
        if (nm && nc && !nm.contains(e.target) && !nc.contains(e.target)) {
            nm.classList.remove('open');
        }
    });

    // ══════════════════════════════════════════════════════════════════
    //  KANBAN MOBILE — paginação por swipe (uma coluna por vez)
    //  Espelha o comportamento de _kbMobile em kanban.js (módulo Atividades)
    // ══════════════════════════════════════════════════════════════════

    var _rncKbMobile = {
        active: false,
        currentIdx: 0,
        touchStartX: 0,
        touchStartY: 0,
        dragging: false
    };

    function _rncKbIsMobile() {
        return window.innerWidth <= 768;
    }

    function initRncKanbanMobileSwipe() {
        var board = document.getElementById('rncKanbanBoard');
        if (!board) return;

        _rncKbMobile.active = _rncKbIsMobile();
        _rncKbMobile.currentIdx = 0;

        if (!_rncKbMobile.active) {
            _rncKbDestroyMobileDots();
            board.classList.remove('rnc-kb-mobile-paged');
            var cols0 = board.querySelectorAll('.rnc-kb-col');
            cols0.forEach(function(c) {
                c.style.transform = ''; c.style.opacity = '';
                c.classList.remove('kb-col-active', 'kb-col-left', 'kb-col-right');
            });
            return;
        }

        board.classList.add('rnc-kb-mobile-paged');
        _rncKbMobileShowCol(0, false);
        _rncKbBuildDots();
        _rncKbTouchAttachCards();

        board.removeEventListener('touchstart', _rncKbTouchStart, { passive: true });
        board.removeEventListener('touchmove',  _rncKbTouchMove,  { passive: false });
        board.removeEventListener('touchend',   _rncKbTouchEnd);
        board.addEventListener('touchstart', _rncKbTouchStart, { passive: true });
        board.addEventListener('touchmove',  _rncKbTouchMove,  { passive: false });
        board.addEventListener('touchend',   _rncKbTouchEnd);
    }
    window.initRncKanbanMobileSwipe = initRncKanbanMobileSwipe;

    function _rncKbMobileShowCol(idx, animate) {
        var board = document.getElementById('rncKanbanBoard');
        if (!board) return;
        var cols = Array.from(board.querySelectorAll('.rnc-kb-col'));
        if (!cols.length) return;
        idx = Math.max(0, Math.min(idx, cols.length - 1));
        _rncKbMobile.currentIdx = idx;

        cols.forEach(function(col, i) {
            col.classList.remove('kb-col-active', 'kb-col-left', 'kb-col-right');
            if (animate) col.classList.add('kb-col-anim');
            else col.classList.remove('kb-col-anim');

            if (i === idx) col.classList.add('kb-col-active');
            else if (i < idx) col.classList.add('kb-col-left');
            else col.classList.add('kb-col-right');
        });

        _rncKbUpdateDots(idx, cols.length);
    }

    function _rncKbBuildDots() {
        _rncKbDestroyMobileDots();
        var board = document.getElementById('rncKanbanBoard');
        if (!board) return;
        var cols = board.querySelectorAll('.rnc-kb-col');
        if (cols.length <= 1) return;

        var dotsWrap = document.createElement('div');
        dotsWrap.className = 'kb-mobile-dots';
        dotsWrap.id = 'rncKbMobileDots';
        for (var i = 0; i < cols.length; i++) {
            (function(idx) {
                var dot = document.createElement('span');
                dot.className = 'kb-mobile-dot' + (idx === _rncKbMobile.currentIdx ? ' kb-dot-active' : '');
                dot.addEventListener('click', function() { _rncKbMobileShowCol(idx, true); });
                dotsWrap.appendChild(dot);
            })(i);
        }
        board.parentNode.insertBefore(dotsWrap, board.nextSibling);
    }

    function _rncKbUpdateDots(activeIdx) {
        var wrap = document.getElementById('rncKbMobileDots');
        if (!wrap) return;
        var dots = wrap.querySelectorAll('.kb-mobile-dot');
        dots.forEach(function(d, i) { d.classList.toggle('kb-dot-active', i === activeIdx); });
    }

    function _rncKbDestroyMobileDots() {
        var el = document.getElementById('rncKbMobileDots');
        if (el) el.remove();
    }

    function _rncKbTouchStart(e) {
        if (!_rncKbMobile.active) return;
        if (_rncKbCardTouch.active || _rncKbCardTouch.longPressTimer) return; // card drag tem prioridade
        var t = e.touches[0];
        _rncKbMobile.touchStartX = t.clientX;
        _rncKbMobile.touchStartY = t.clientY;
        _rncKbMobile.dragging = false;
    }

    function _rncKbTouchMove(e) {
        if (!_rncKbMobile.active) return;
        if (_rncKbCardTouch.active || _rncKbCardTouch.longPressTimer) return; // card drag tem prioridade
        var t = e.touches[0];
        var dx = t.clientX - _rncKbMobile.touchStartX;
        var dy = t.clientY - _rncKbMobile.touchStartY;
        if (!_rncKbMobile.dragging) {
            if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) {
                _rncKbMobile.dragging = true;
            } else {
                return;
            }
        }
        e.preventDefault();

        var board = document.getElementById('rncKanbanBoard');
        if (!board) return;
        var cols = Array.from(board.querySelectorAll('.rnc-kb-col'));
        var idx = _rncKbMobile.currentIdx;

        cols.forEach(function(col, i) {
            col.classList.remove('kb-col-anim');
            var base = (i - idx) * 100;
            col.style.transform = 'translateX(calc(' + base + '% + ' + dx + 'px))';
            if (i === idx) {
                col.style.opacity = String(Math.max(0.6, 1 - Math.abs(dx) / 300));
            } else if ((i === idx - 1 && dx > 0) || (i === idx + 1 && dx < 0)) {
                col.style.opacity = String(Math.min(1, Math.abs(dx) / 200));
            } else {
                col.style.opacity = '0';
            }
        });
    }

    function _rncKbTouchEnd(e) {
        if (!_rncKbMobile.active || !_rncKbMobile.dragging) return;
        _rncKbMobile.dragging = false;

        var board = document.getElementById('rncKanbanBoard');
        if (!board) return;
        var cols = Array.from(board.querySelectorAll('.rnc-kb-col'));
        cols.forEach(function(c) { c.style.transform = ''; c.style.opacity = ''; });

        var dx = e.changedTouches[0].clientX - _rncKbMobile.touchStartX;
        var threshold = 60;
        var next = _rncKbMobile.currentIdx;
        if (dx < -threshold) next = Math.min(_rncKbMobile.currentIdx + 1, cols.length - 1);
        else if (dx > threshold) next = Math.max(_rncKbMobile.currentIdx - 1, 0);

        _rncKbMobileShowCol(next, true);
    }

    window.addEventListener('resize', function() {
        if (rncView !== 'kanban') return;
        var wasMobile = _rncKbMobile.active;
        var isMobile = _rncKbIsMobile();
        if (wasMobile !== isMobile) {
            initRncKanbanMobileSwipe();
        }
    });

    // ══════════════════════════════════════════════════════════════════
    //  KANBAN MOBILE — long-press para arrastar card entre colunas
    //  Espelha o comportamento de _kbTouch em kanban.js (módulo Atividades)
    // ══════════════════════════════════════════════════════════════════

    var _rncKbCardTouch = {
        longPressTimer: null,
        itemId: null,
        cardEl: null,
        ghostEl: null,
        active: false,
        startX: 0,
        startY: 0,
        edgeTimer: null,
        edgeDir: 0
    };

    var RNC_KB_LONG_PRESS_MS = 500;
    var RNC_KB_EDGE_ZONE     = 0.18;
    var RNC_KB_EDGE_DELAY_MS = 350;

    function _rncKbTouchAttachCards() {
        var board = document.getElementById('rncKanbanBoard');
        if (!board) return;
        board.querySelectorAll('.rnc-kb-card').forEach(function(card) {
            card.removeEventListener('touchstart', _rncKbCardTouchStart);
            card.removeEventListener('touchmove',  _rncKbCardTouchMove);
            card.removeEventListener('touchend',   _rncKbCardTouchEnd);
            card.removeEventListener('touchcancel',_rncKbCardTouchCancel);

            if (card.getAttribute('draggable') !== 'true') return;
            card.addEventListener('touchstart',  _rncKbCardTouchStart,  { passive: false });
            card.addEventListener('touchmove',   _rncKbCardTouchMove,   { passive: false });
            card.addEventListener('touchend',    _rncKbCardTouchEnd,    { passive: false });
            card.addEventListener('touchcancel', _rncKbCardTouchCancel, { passive: true  });
        });
    }

    function _rncKbCardTouchStart(e) {
        if (!_rncKbMobile.active) return;
        if (e.touches.length !== 1) return;

        var card = e.currentTarget;
        var t = e.touches[0];
        _rncKbCardTouch.startX = t.clientX;
        _rncKbCardTouch.startY = t.clientY;
        _rncKbCardTouch.cardEl = card;
        _rncKbCardTouch.itemId = parseInt(card.getAttribute('data-id'), 10);
        _rncKbCardTouch.active = false;

        _rncKbCardTouch.longPressTimer = setTimeout(function() {
            _rncKbActivateDrag(card, t.clientX, t.clientY);
        }, RNC_KB_LONG_PRESS_MS);
    }

    function _rncKbCardTouchMove(e) {
        if (!_rncKbCardTouch.cardEl) return;
        var t = e.touches[0];

        if (!_rncKbCardTouch.active) {
            var dx0 = Math.abs(t.clientX - _rncKbCardTouch.startX);
            var dy0 = Math.abs(t.clientY - _rncKbCardTouch.startY);
            if (dx0 > 8 || dy0 > 8) _rncKbCancelCardDrag();
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        _rncKbMoveGhost(t.clientX, t.clientY);
        _rncKbTouchEdgeCheck(t.clientX);
    }

    function _rncKbCardTouchEnd(e) {
        if (!_rncKbCardTouch.active) { _rncKbCancelCardDrag(); return; }
        e.preventDefault();
        e.stopPropagation();

        var t = e.changedTouches[0];
        _rncKbTouchDrop(t.clientX, t.clientY);
        _rncKbCancelCardDrag();
    }

    function _rncKbCardTouchCancel() {
        _rncKbCancelCardDrag();
    }

    function _rncKbActivateDrag(card, cx, cy) {
        _rncKbCardTouch.active = true;
        if (navigator.vibrate) navigator.vibrate(40);

        card.classList.add('kb-touch-holding');

        var ghost = document.createElement('div');
        ghost.className = 'kb-touch-ghost';
        ghost.innerHTML = card.innerHTML;
        ghost.style.width = card.offsetWidth + 'px';
        document.body.appendChild(ghost);
        _rncKbCardTouch.ghostEl = ghost;
        _rncKbMoveGhost(cx, cy);
    }

    function _rncKbMoveGhost(cx, cy) {
        var g = _rncKbCardTouch.ghostEl;
        if (!g) return;
        g.style.left = (cx - g.offsetWidth / 2) + 'px';
        g.style.top  = (cy - 30) + 'px';
    }

    function _rncKbTouchEdgeCheck(cx) {
        var board = document.getElementById('rncKanbanBoard');
        if (!board) return;
        var rect = board.getBoundingClientRect();
        var zone = rect.width * RNC_KB_EDGE_ZONE;
        var dir = 0;
        if (cx < rect.left + zone) dir = -1;
        else if (cx > rect.right - zone) dir = 1;

        if (dir === 0) { _rncKbTouchClearEdge(); return; }
        if (dir === _rncKbCardTouch.edgeDir) return;

        _rncKbTouchClearEdge();
        _rncKbCardTouch.edgeDir = dir;

        _rncKbCardTouch.edgeTimer = setTimeout(function() {
            var cols = board.querySelectorAll('.rnc-kb-col');
            var next = _rncKbMobile.currentIdx + dir;
            if (next >= 0 && next < cols.length) {
                _rncKbMobileShowCol(next, true);
                if (navigator.vibrate) navigator.vibrate(20);
            }
            _rncKbCardTouch.edgeDir = 0;
            _rncKbCardTouch.edgeTimer = null;
        }, RNC_KB_EDGE_DELAY_MS);
    }

    function _rncKbTouchClearEdge() {
        if (_rncKbCardTouch.edgeTimer) { clearTimeout(_rncKbCardTouch.edgeTimer); _rncKbCardTouch.edgeTimer = null; }
        _rncKbCardTouch.edgeDir = 0;
    }

    function _rncKbTouchDrop(cx, cy) {
        if (!_rncKbCardTouch.itemId) return;

        var board = document.getElementById('rncKanbanBoard');
        if (!board) return;
        var activeCol = board.querySelector('.rnc-kb-col.kb-col-active');
        if (!activeCol) return;

        var zone = activeCol.querySelector('.rnc-kb-cards[data-status]');
        if (!zone) return;
        var targetStatus = zone.getAttribute('data-status');
        if (!targetStatus) return;

        _rncMoveCardToStatus(_rncKbCardTouch.itemId, targetStatus);
    }

    function _rncKbCancelCardDrag() {
        if (_rncKbCardTouch.longPressTimer) { clearTimeout(_rncKbCardTouch.longPressTimer); _rncKbCardTouch.longPressTimer = null; }
        _rncKbTouchClearEdge();

        if (_rncKbCardTouch.cardEl) _rncKbCardTouch.cardEl.classList.remove('kb-touch-holding');
        if (_rncKbCardTouch.ghostEl) { _rncKbCardTouch.ghostEl.remove(); _rncKbCardTouch.ghostEl = null; }

        _rncKbCardTouch.active = false;
        _rncKbCardTouch.itemId = null;
        _rncKbCardTouch.cardEl = null;
    }

    // ══════════════════════════════════════════════════════════════════
    //  CALENDÁRIO SEMANAL MOBILE — paginação por swipe (1 dia por vez)
    //  Espelha o comportamento de _calMobile em calendar.js (módulo Atividades)
    // ══════════════════════════════════════════════════════════════════

    var _rncCalMobile = {
        active: false,
        currentIdx: 0,
        touchStartX: 0,
        touchStartY: 0,
        dragging: false
    };

    function _rncCalIsMobile() {
        return window.innerWidth <= 768;
    }

    function initRncCalWeekMobileSwipe() {
        var board = document.getElementById('rncCalendarBoard');
        if (!board) return;

        if (rncCalMode !== 'weekly') {
            _rncCalDestroyMobileDots();
            return;
        }

        _rncCalMobile.active = _rncCalIsMobile();
        var grid = board.querySelector('.rnc-cal-weekly-grid');
        if (!grid) return;

        if (!_rncCalMobile.active) {
            _rncCalDestroyMobileDots();
            grid.classList.remove('rnc-cal-weekly-mobile-paged');
            var cols0 = grid.querySelectorAll('.rnc-cal-week-col');
            cols0.forEach(function(c) {
                c.style.transform = ''; c.style.opacity = '';
                c.classList.remove('cal-col-active', 'cal-col-left', 'cal-col-right');
            });
            return;
        }

        grid.classList.add('rnc-cal-weekly-mobile-paged');

        var cols = Array.from(grid.querySelectorAll('.rnc-cal-week-col'));
        var startIdx = 0;
        cols.forEach(function(col, i) {
            if (col.classList.contains('rnc-cal-week-col-today')) startIdx = i;
        });
        _rncCalMobile.currentIdx = startIdx;
        _rncCalMobileShowDay(startIdx, false, grid);
        _rncCalBuildDayDots(cols.length, board);
        _rncCalTouchAttachCards();

        grid.removeEventListener('touchstart', _rncCalTouchStart, { passive: true });
        grid.removeEventListener('touchmove',  _rncCalTouchMove,  { passive: false });
        grid.removeEventListener('touchend',   _rncCalTouchEnd);
        grid.addEventListener('touchstart', _rncCalTouchStart, { passive: true });
        grid.addEventListener('touchmove',  _rncCalTouchMove,  { passive: false });
        grid.addEventListener('touchend',   _rncCalTouchEnd);
    }
    window.initRncCalWeekMobileSwipe = initRncCalWeekMobileSwipe;

    function _rncCalMobileShowDay(idx, animate, grid) {
        if (!grid) grid = document.querySelector('#rncCalendarBoard .rnc-cal-weekly-grid');
        if (!grid) return;
        var cols = Array.from(grid.querySelectorAll('.rnc-cal-week-col'));
        if (!cols.length) return;
        idx = Math.max(0, Math.min(idx, cols.length - 1));
        _rncCalMobile.currentIdx = idx;

        cols.forEach(function(col, i) {
            col.classList.remove('cal-col-active', 'cal-col-left', 'cal-col-right');
            if (animate) col.classList.add('cal-col-anim');
            else col.classList.remove('cal-col-anim');

            if (i === idx) col.classList.add('cal-col-active');
            else if (i < idx) col.classList.add('cal-col-left');
            else col.classList.add('cal-col-right');
        });

        _rncCalUpdateDayDots(idx);
    }

    var _rncCalWeekDayNames = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];

    function _rncCalBuildDayDots(total, board) {
        _rncCalDestroyMobileDots();
        if (total <= 1) return;

        var dotsWrap = document.createElement('div');
        dotsWrap.className = 'cal-day-pills';
        dotsWrap.id = 'rncCalMobileDots';

        for (var i = 0; i < total; i++) {
            (function(idx) {
                var pill = document.createElement('button');
                pill.className = 'cal-day-pill' + (idx === _rncCalMobile.currentIdx ? ' cal-day-pill--active' : '');
                pill.textContent = _rncCalWeekDayNames[idx] || String(idx + 1);
                pill.addEventListener('click', function() { _rncCalMobileShowDay(idx, true); });
                dotsWrap.appendChild(pill);
            })(i);
        }

        if (board) board.appendChild(dotsWrap);
    }

    function _rncCalUpdateDayDots(activeIdx) {
        var wrap = document.getElementById('rncCalMobileDots');
        if (!wrap) return;
        var pills = wrap.querySelectorAll('.cal-day-pill');
        pills.forEach(function(p, i) { p.classList.toggle('cal-day-pill--active', i === activeIdx); });
    }

    function _rncCalDestroyMobileDots() {
        var el = document.getElementById('rncCalMobileDots');
        if (el) el.remove();
    }

    function _rncCalTouchStart(e) {
        if (!_rncCalMobile.active) return;
        if (_rncCalCardTouch.active || _rncCalCardTouch.longPressTimer) return; // card drag tem prioridade
        var t = e.touches[0];
        _rncCalMobile.touchStartX = t.clientX;
        _rncCalMobile.touchStartY = t.clientY;
        _rncCalMobile.dragging = false;
    }

    function _rncCalTouchMove(e) {
        if (!_rncCalMobile.active) return;
        if (_rncCalCardTouch.active || _rncCalCardTouch.longPressTimer) return; // card drag tem prioridade
        var t = e.touches[0];
        var dx = t.clientX - _rncCalMobile.touchStartX;
        var dy = t.clientY - _rncCalMobile.touchStartY;
        if (!_rncCalMobile.dragging) {
            if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) {
                _rncCalMobile.dragging = true;
            } else {
                return;
            }
        }
        e.preventDefault();

        var grid = document.querySelector('#rncCalendarBoard .rnc-cal-weekly-grid');
        if (!grid) return;
        var cols = Array.from(grid.querySelectorAll('.rnc-cal-week-col'));
        var idx = _rncCalMobile.currentIdx;

        cols.forEach(function(col, i) {
            col.classList.remove('cal-col-anim');
            var base = (i - idx) * 100;
            col.style.transform = 'translateX(calc(' + base + '% + ' + dx + 'px))';
            if (i === idx) {
                col.style.opacity = String(Math.max(0.6, 1 - Math.abs(dx) / 300));
            } else if ((i === idx - 1 && dx > 0) || (i === idx + 1 && dx < 0)) {
                col.style.opacity = String(Math.min(1, Math.abs(dx) / 200));
            } else {
                col.style.opacity = '0';
            }
        });
    }

    function _rncCalTouchEnd(e) {
        if (!_rncCalMobile.active || !_rncCalMobile.dragging) return;
        _rncCalMobile.dragging = false;

        var grid = document.querySelector('#rncCalendarBoard .rnc-cal-weekly-grid');
        if (!grid) return;
        var cols = Array.from(grid.querySelectorAll('.rnc-cal-week-col'));
        cols.forEach(function(c) { c.style.transform = ''; c.style.opacity = ''; });

        var dx = e.changedTouches[0].clientX - _rncCalMobile.touchStartX;
        var threshold = 60;
        var next = _rncCalMobile.currentIdx;
        if (dx < -threshold) next = Math.min(_rncCalMobile.currentIdx + 1, cols.length - 1);
        else if (dx > threshold) next = Math.max(_rncCalMobile.currentIdx - 1, 0);

        _rncCalMobileShowDay(next, true);
    }

    window.addEventListener('resize', function() {
        if (rncView === 'calendar' && rncCalMode === 'weekly') {
            var wasMobile = _rncCalMobile.active;
            var isMobile = _rncCalIsMobile();
            if (wasMobile !== isMobile) {
                initRncCalWeekMobileSwipe();
            }
        }
    });

    // ══════════════════════════════════════════════════════════════════
    //  CALENDÁRIO SEMANAL MOBILE — long-press para mover card de dia
    //  Espelha o comportamento de _calTouch em calendar.js (módulo Atividades)
    // ══════════════════════════════════════════════════════════════════

    var _rncCalCardTouch = {
        longPressTimer: null,
        itemId: null,
        cardEl: null,
        ghostEl: null,
        active: false,
        startX: 0,
        startY: 0,
        edgeTimer: null,
        edgeDir: 0
    };

    var RNC_CAL_LONG_PRESS_MS = 500;
    var RNC_CAL_EDGE_ZONE     = 0.18;
    var RNC_CAL_EDGE_DELAY_MS = 350;

    function _rncCalTouchAttachCards() {
        var grid = document.querySelector('#rncCalendarBoard .rnc-cal-weekly-grid');
        if (!grid) return;
        grid.querySelectorAll('.rnc-cal-event-card').forEach(function(card) {
            card.removeEventListener('touchstart',  _rncCalCardTouchStart);
            card.removeEventListener('touchmove',   _rncCalCardTouchMove);
            card.removeEventListener('touchend',    _rncCalCardTouchEnd);
            card.removeEventListener('touchcancel', _rncCalCardTouchCancel);
            if (!card.draggable) return;
            card.addEventListener('touchstart',  _rncCalCardTouchStart,  { passive: false });
            card.addEventListener('touchmove',   _rncCalCardTouchMove,   { passive: false });
            card.addEventListener('touchend',    _rncCalCardTouchEnd,    { passive: false });
            card.addEventListener('touchcancel', _rncCalCardTouchCancel, { passive: true  });
        });
    }

    function _rncCalCardTouchStart(e) {
        if (!_rncCalMobile.active) return;
        if (e.touches.length !== 1) return;
        var card = e.currentTarget;
        var t = e.touches[0];
        _rncCalCardTouch.startX = t.clientX;
        _rncCalCardTouch.startY = t.clientY;
        _rncCalCardTouch.cardEl = card;
        _rncCalCardTouch.itemId = card._rncCalItemId || null;
        _rncCalCardTouch.active = false;

        _rncCalCardTouch.longPressTimer = setTimeout(function() {
            _rncCalActivateDrag(card, t.clientX, t.clientY);
        }, RNC_CAL_LONG_PRESS_MS);
    }

    function _rncCalCardTouchMove(e) {
        if (!_rncCalCardTouch.cardEl) return;
        var t = e.touches[0];
        if (!_rncCalCardTouch.active) {
            var dx0 = Math.abs(t.clientX - _rncCalCardTouch.startX);
            var dy0 = Math.abs(t.clientY - _rncCalCardTouch.startY);
            if (dx0 > 8 || dy0 > 8) _rncCalCancelCardDrag();
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        _rncCalMoveGhost(t.clientX, t.clientY);
        _rncCalCardTouchEdgeCheck(t.clientX);
    }

    function _rncCalCardTouchEnd(e) {
        if (!_rncCalCardTouch.active) { _rncCalCancelCardDrag(); return; }
        e.preventDefault();
        e.stopPropagation();
        _rncCalCardTouchDrop();
        _rncCalCancelCardDrag();
    }

    function _rncCalCardTouchCancel() { _rncCalCancelCardDrag(); }

    function _rncCalActivateDrag(card, cx, cy) {
        _rncCalCardTouch.active = true;
        if (navigator.vibrate) navigator.vibrate(40);
        card.classList.add('kb-touch-holding');

        var ghost = document.createElement('div');
        ghost.className = 'kb-touch-ghost';
        ghost.innerHTML = card.innerHTML;
        ghost.style.width = card.offsetWidth + 'px';
        document.body.appendChild(ghost);
        _rncCalCardTouch.ghostEl = ghost;
        _rncCalMoveGhost(cx, cy);
    }

    function _rncCalMoveGhost(cx, cy) {
        var g = _rncCalCardTouch.ghostEl;
        if (!g) return;
        g.style.left = (cx - g.offsetWidth / 2) + 'px';
        g.style.top  = (cy - 30) + 'px';
    }

    function _rncCalCardTouchEdgeCheck(cx) {
        var grid = document.querySelector('#rncCalendarBoard .rnc-cal-weekly-grid');
        if (!grid) return;
        var rect = grid.getBoundingClientRect();
        var zone = rect.width * RNC_CAL_EDGE_ZONE;
        var dir = 0;
        if (cx < rect.left + zone) dir = -1;
        else if (cx > rect.right - zone) dir = 1;

        if (dir === 0) { _rncCalCardTouchClearEdge(); return; }
        if (dir === _rncCalCardTouch.edgeDir) return;

        _rncCalCardTouchClearEdge();
        _rncCalCardTouch.edgeDir = dir;
        _rncCalCardTouch.edgeTimer = setTimeout(function() {
            var cols = grid.querySelectorAll('.rnc-cal-week-col');
            var next = _rncCalMobile.currentIdx + dir;
            if (next >= 0 && next < cols.length) {
                _rncCalMobileShowDay(next, true, grid);
                _rncCalTouchAttachCards();
                if (navigator.vibrate) navigator.vibrate(20);
            }
            _rncCalCardTouch.edgeDir = 0;
            _rncCalCardTouch.edgeTimer = null;
        }, RNC_CAL_EDGE_DELAY_MS);
    }

    function _rncCalCardTouchClearEdge() {
        if (_rncCalCardTouch.edgeTimer) { clearTimeout(_rncCalCardTouch.edgeTimer); _rncCalCardTouch.edgeTimer = null; }
        _rncCalCardTouch.edgeDir = 0;
    }

    function _rncCalCardTouchDrop() {
        var grid = document.querySelector('#rncCalendarBoard .rnc-cal-weekly-grid');
        if (!grid) return;
        var activeCol = grid.querySelector('.rnc-cal-week-col.cal-col-active');
        if (!activeCol) return;
        var targetDateStr = activeCol.getAttribute('data-date');
        if (!targetDateStr) return;
        if (!_rncCalCardTouch.itemId) return;
        _rncCalMoveItemToDate(_rncCalCardTouch.itemId, targetDateStr);
    }

    function _rncCalCancelCardDrag() {
        if (_rncCalCardTouch.longPressTimer) { clearTimeout(_rncCalCardTouch.longPressTimer); _rncCalCardTouch.longPressTimer = null; }
        _rncCalCardTouchClearEdge();
        if (_rncCalCardTouch.cardEl) _rncCalCardTouch.cardEl.classList.remove('kb-touch-holding');
        if (_rncCalCardTouch.ghostEl) { _rncCalCardTouch.ghostEl.remove(); _rncCalCardTouch.ghostEl = null; }
        _rncCalCardTouch.active = false;
        _rncCalCardTouch.itemId = null;
        _rncCalCardTouch.cardEl = null;
    }

    // ══════════════════════════════════════════════════════════════════
    //  CALENDÁRIO MENSAL MOBILE — long-press para mover chip de dia
    //  Grid completo (sem paginação): o destino é a célula sob o dedo.
    // ══════════════════════════════════════════════════════════════════

    var _rncCalMonthTouch = {
        longPressTimer: null,
        itemId: null,
        chipEl: null,
        ghostEl: null,
        active: false,
        startX: 0,
        startY: 0
    };

    var RNC_CAL_MONTH_LONG_PRESS_MS = 500;

    function _rncCalMonthTouchAttachChips() {
        var grid = document.querySelector('#rncCalendarBoard .rnc-cal-monthly-grid');
        if (!grid) return;
        grid.querySelectorAll('.rnc-cal-event-chip').forEach(function(chip) {
            chip.removeEventListener('touchstart',  _rncCalMonthChipTouchStart);
            chip.removeEventListener('touchmove',   _rncCalMonthChipTouchMove);
            chip.removeEventListener('touchend',     _rncCalMonthChipTouchEnd);
            chip.removeEventListener('touchcancel',  _rncCalMonthChipTouchCancel);
            if (!chip.draggable) return;
            chip.addEventListener('touchstart',  _rncCalMonthChipTouchStart,  { passive: false });
            chip.addEventListener('touchmove',   _rncCalMonthChipTouchMove,   { passive: false });
            chip.addEventListener('touchend',    _rncCalMonthChipTouchEnd,    { passive: false });
            chip.addEventListener('touchcancel', _rncCalMonthChipTouchCancel, { passive: true  });
        });
    }

    function _rncCalMonthChipTouchStart(e) {
        if (window.innerWidth > 768) return;
        if (e.touches.length !== 1) return;
        var chip = e.currentTarget;
        var t = e.touches[0];
        _rncCalMonthTouch.startX = t.clientX;
        _rncCalMonthTouch.startY = t.clientY;
        _rncCalMonthTouch.chipEl = chip;
        _rncCalMonthTouch.itemId = chip._rncCalItemId || null;
        _rncCalMonthTouch.active = false;

        _rncCalMonthTouch.longPressTimer = setTimeout(function() {
            _rncCalMonthActivateDrag(chip, t.clientX, t.clientY);
        }, RNC_CAL_MONTH_LONG_PRESS_MS);
    }

    function _rncCalMonthChipTouchMove(e) {
        if (!_rncCalMonthTouch.chipEl) return;
        var t = e.touches[0];
        if (!_rncCalMonthTouch.active) {
            var dx0 = Math.abs(t.clientX - _rncCalMonthTouch.startX);
            var dy0 = Math.abs(t.clientY - _rncCalMonthTouch.startY);
            if (dx0 > 8 || dy0 > 8) _rncCalMonthCancelDrag();
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        _rncCalMonthMoveGhost(t.clientX, t.clientY);

        document.querySelectorAll('.rnc-cal-day-cell.rnc-cal-touch-over').forEach(function(c){ c.classList.remove('rnc-cal-touch-over'); });
        var under = document.elementFromPoint(t.clientX, t.clientY);
        var cell = under ? under.closest('.rnc-cal-day-cell[data-date]') : null;
        if (cell) cell.classList.add('rnc-cal-touch-over');
    }

    function _rncCalMonthChipTouchEnd(e) {
        if (!_rncCalMonthTouch.active) { _rncCalMonthCancelDrag(); return; }
        e.preventDefault();
        e.stopPropagation();
        var t = e.changedTouches[0];
        _rncCalMonthTouchDrop(t.clientX, t.clientY);
        _rncCalMonthCancelDrag();
    }

    function _rncCalMonthChipTouchCancel() { _rncCalMonthCancelDrag(); }

    function _rncCalMonthActivateDrag(chip, cx, cy) {
        _rncCalMonthTouch.active = true;
        if (navigator.vibrate) navigator.vibrate(40);
        chip.classList.add('kb-touch-holding');

        var ghost = document.createElement('div');
        ghost.className = 'kb-touch-ghost';
        ghost.innerHTML = chip.innerHTML;
        ghost.style.width = chip.offsetWidth + 'px';
        document.body.appendChild(ghost);
        _rncCalMonthTouch.ghostEl = ghost;
        _rncCalMonthMoveGhost(cx, cy);
    }

    function _rncCalMonthMoveGhost(cx, cy) {
        var g = _rncCalMonthTouch.ghostEl;
        if (!g) return;
        g.style.left = (cx - g.offsetWidth / 2) + 'px';
        g.style.top  = (cy - 30) + 'px';
    }

    function _rncCalMonthTouchDrop(cx, cy) {
        if (!_rncCalMonthTouch.itemId) return;
        var under = document.elementFromPoint(cx, cy);
        var cell = under ? under.closest('.rnc-cal-day-cell[data-date]') : null;
        if (!cell) return;
        var targetDateStr = cell.getAttribute('data-date');
        if (!targetDateStr) return;
        _rncCalMoveItemToDate(_rncCalMonthTouch.itemId, targetDateStr);
    }

    function _rncCalMonthCancelDrag() {
        if (_rncCalMonthTouch.longPressTimer) { clearTimeout(_rncCalMonthTouch.longPressTimer); _rncCalMonthTouch.longPressTimer = null; }
        document.querySelectorAll('.rnc-cal-day-cell.rnc-cal-touch-over').forEach(function(c){ c.classList.remove('rnc-cal-touch-over'); });
        if (_rncCalMonthTouch.chipEl) _rncCalMonthTouch.chipEl.classList.remove('kb-touch-holding');
        if (_rncCalMonthTouch.ghostEl) { _rncCalMonthTouch.ghostEl.remove(); _rncCalMonthTouch.ghostEl = null; }
        _rncCalMonthTouch.active = false;
        _rncCalMonthTouch.itemId = null;
        _rncCalMonthTouch.chipEl = null;
    }

    // ══════════════════════════════════════════════════════════════════
    //  LIXEIRA DE RNC
    // ══════════════════════════════════════════════════════════════════

    function _getDeletedRncs() {
        return (window.rncItems || []).filter(function(x){ return x.deleted; });
    }

    function updateRncTrashBadge() {
        var count = _getDeletedRncs().length;
        var badge = document.getElementById('rncTrashBadge');
        var btn   = document.getElementById('rncTrashBtn');
        if (badge) {
            badge.textContent = count > 99 ? '99+' : String(count);
            badge.style.display = count > 0 ? '' : 'none';
        }
        if (btn) btn.classList.toggle('rnc-trash-btn--has-items', count > 0);
    }
    window.updateRncTrashBadge = updateRncTrashBadge;

    function _fmtTrashDate(iso) {
        if (!iso) return '—';
        var d = new Date(iso);
        if (isNaN(d)) return iso;
        return d.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' }) +
               ' às ' + d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
    }

    function _rncTrashExpiryHtml(deletedAt) {
        var e = (typeof window.trashExpiry === 'function') ? window.trashExpiry(deletedAt) : null;
        if (!e) return '';
        var dateStr = e.expiresAt.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });
        var warn = e.daysLeft <= 7;
        var faltam = e.expired ? 'exclusão pendente'
            : (e.daysLeft === 1 ? 'falta 1 dia' : 'faltam ' + e.daysLeft + ' dias');
        return '<div class="rnc-trash-item-expiry" style="color:' + (warn ? '#ef4444' : '#f59e0b') + ';">' +
            '<i class="fas fa-clock"></i> Exclusão automática em ' + dateStr + ' · ' + faltam +
            '</div>';
    }

    function _renderRncTrashList() {
        var list = document.getElementById('rncTrashList');
        if (!list) return;
        var items = _getDeletedRncs().slice().sort(function(a,b){
            return new Date(b.deletedAt||0) - new Date(a.deletedAt||0);
        });
        var sub = document.getElementById('rncTrashSubtitle');
        if (sub) sub.textContent = items.length + (items.length === 1 ? ' item excluído' : ' itens excluídos');

        if (items.length === 0) {
            list.innerHTML =
                '<div class="rnc-trash-empty">' +
                    '<div class="rnc-trash-empty-icon"><i class="fas fa-trash-can"></i></div>' +
                    '<p class="rnc-trash-empty-title">Lixeira vazia</p>' +
                    '<p class="rnc-trash-empty-sub">Nenhuma RNC foi excluída ainda.</p>' +
                '</div>';
            return;
        }

        var isAdmin = typeof userIsAdmin === 'function' && userIsAdmin();

        list.innerHTML = items.map(function(r) {
            var ci = getCI(r.classificacao);
            var deletedInfo = r.deletedBy
                ? 'Excluído por <strong>' + esc(r.deletedBy) + '</strong> em ' + _fmtTrashDate(r.deletedAt)
                : 'Excluído em ' + _fmtTrashDate(r.deletedAt);
            return '<div class="rnc-trash-item" data-id="' + r.id + '">' +
                '<div class="rnc-trash-item-icon" style="' + rncClassStyle(ci) + '">' +
                    '<i class="fas ' + ci.icon + '"></i>' +
                '</div>' +
                '<div class="rnc-trash-item-info">' +
                    '<div class="rnc-trash-item-title">' + esc(r.titulo || 'Sem título') + '</div>' +
                    '<div class="rnc-trash-item-meta">' +
                        (setorArr(r.setor).length ? '<span><i class="fas fa-building"></i> ' + esc(setorText(r.setor)) + '</span>' : '') +
                        (r.origem ? '<span><i class="fas fa-location-dot"></i> ' + esc(r.origem) + '</span>' : '') +
                        '<span><i class="fas fa-circle-dot"></i> ' + esc(ci.label) + '</span>' +
                    '</div>' +
                    '<div class="rnc-trash-item-deleted">' + deletedInfo + '</div>' +
                    _rncTrashExpiryHtml(r.deletedAt) +
                    (r.deletedMotivo ? '<div class="rnc-trash-item-motivo"><i class="fas fa-comment-slash"></i> ' + esc(r.deletedMotivo) + '</div>' : '') +
                '</div>' +
                '<div class="rnc-trash-item-actions">' +
                    '<button class="rnc-trash-act-btn rnc-trash-act-view" onclick="rncOpenTrashView(' + r.id + ')" title="Visualizar"><i class="fas fa-eye"></i></button>' +
                    '<button class="rnc-trash-act-btn rnc-trash-act-restore" onclick="rncRestoreFromTrash(' + r.id + ')" title="Restaurar"><i class="fas fa-rotate-left"></i></button>' +
                    (isAdmin ? '<button class="rnc-trash-act-btn rnc-trash-act-delete" onclick="rncPermanentDelete(' + r.id + ')" title="Excluir permanentemente"><i class="fas fa-trash"></i></button>' : '') +
                '</div>' +
            '</div>';
        }).join('');
    }

    window.rncOpenTrash = function() {
        _renderRncTrashList();
        var modal = document.getElementById('rncTrashModal');
        if (modal) { modal.style.display = 'flex'; requestAnimationFrame(function(){ modal.classList.add('open'); }); }
    };

    window.rncCloseTrash = function() {
        var modal = document.getElementById('rncTrashModal');
        if (modal) {
            modal.classList.remove('open');
            setTimeout(function(){ if (modal) modal.style.display = 'none'; }, 280);
        }
    };

    window.rncRestoreFromTrash = function(id) {
        id = Number(id);
        var arr = window.rncItems || [];
        var idx = arr.findIndex(function(x){ return x.id === id; });
        if (idx === -1) return;
        rncConfirm({
            title: 'Restaurar RNC',
            message: 'A RNC será restaurada e voltará à lista normal.',
            confirmLabel: 'Restaurar', confirmClass: 'oc-confirm-btn-primary', icon: 'fa-rotate-left'
        }, function() {
            arr[idx].deleted = false;
            delete arr[idx].deletedAt;
            delete arr[idx].deletedBy;
            delete arr[idx].deletedMotivo;
            persist(); renderRnc(); updateRncNotificationBell(); updateRncTrashBadge();
            _renderRncTrashList();
            toast('RNC restaurada com sucesso.', 'success');
        });
    };

    window.rncPermanentDelete = function(id) {
        if (!(typeof userIsAdmin === 'function' && userIsAdmin())) {
            toast('Apenas administradores podem excluir permanentemente.', 'error');
            return;
        }
        id = Number(id);
        rncConfirm({
            title: 'Excluir permanentemente',
            message: 'Esta ação não pode ser desfeita. A RNC será removida para sempre.',
            confirmLabel: 'Excluir definitivamente', confirmClass: 'oc-confirm-btn-danger', icon: 'fa-circle-exclamation'
        }, function() {
            var arr = window.rncItems || [];
            var idx = arr.findIndex(function(x){ return x.id === id; });
            if (idx !== -1) {
                if (typeof window._deleteItemImgBlobs === 'function') window._deleteItemImgBlobs(arr[idx]);
                arr.splice(idx, 1);
            }
            persist(); renderRnc(); updateRncNotificationBell(); updateRncTrashBadge();
            _renderRncTrashList();
            toast('RNC excluída permanentemente.', 'success');
        });
    };

    // ── Visualização de item da lixeira (somente leitura) ──

    window.rncOpenTrashView = function(id) {
        id = Number(id);
        var r = (window.rncItems || []).find(function(x){ return x.id === id; });
        if (!r) return;
        _renderRncTrashView(r);
        var modal = document.getElementById('rncTrashViewModal');
        if (modal) { modal.style.display = 'flex'; requestAnimationFrame(function(){ modal.classList.add('open'); }); }
    };

    window.rncCloseTrashView = function() {
        var modal = document.getElementById('rncTrashViewModal');
        if (modal) {
            modal.classList.remove('open');
            setTimeout(function(){ if (modal) modal.style.display = 'none'; }, 280);
        }
    };

    var _rncTrashViewId = null;

    function _renderRncTrashView(r) {
        _rncTrashViewId = r.id;
        var ci = getCI(r.classificacao);
        var mk = getMarker(r.marcador);

        var hdr = document.getElementById('rncTrashViewHeader');
        if (hdr) hdr.style.setProperty('--rnc-trash-view-accent', ci.color);

        var hicon = document.getElementById('rncTrashViewHIcon');
        if (hicon) hicon.innerHTML = '<i class="fas ' + ci.icon + '"></i>';
        if (hicon) { hicon.style.background = ci.bg; hicon.style.color = ci.color; hicon.style.borderColor = ci.border; }

        var htitle = document.getElementById('rncTrashViewTitle');
        if (htitle) htitle.textContent = r.titulo || 'RNC';

        var hmeta = document.getElementById('rncTrashViewMeta');
        if (hmeta) {
            var metaChips = [
                '<span class="rnc-tv-chip" style="' + rncClassStyle(ci) + '"><i class="fas ' + ci.icon + '"></i> ' + esc(ci.label) + '</span>',
                r.status ? '<span class="rnc-tv-chip"><i class="fas fa-circle-dot"></i> ' + esc(r.status) + '</span>' : '',
                mk ? '<span class="rnc-tv-chip"><i class="fas ' + mk.icon + '"></i> ' + esc(mk.label) + '</span>' : '',
                '<span class="rnc-tv-chip rnc-tv-chip--deleted"><i class="fas fa-clock-rotate-left"></i> Excluído em ' + _fmtTrashDate(r.deletedAt) + '</span>',
                (function(){
                    var e = (typeof window.trashExpiry === 'function') ? window.trashExpiry(r.deletedAt) : null;
                    if (!e) return '';
                    var ds = e.expiresAt.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });
                    var f = e.expired ? 'exclusão pendente' : (e.daysLeft === 1 ? 'falta 1 dia' : 'faltam ' + e.daysLeft + ' dias');
                    return '<span class="rnc-tv-chip rnc-tv-chip--deleted"><i class="fas fa-clock"></i> Exclusão em ' + ds + ' · ' + f + '</span>';
                })()
            ].filter(Boolean).join('');
            hmeta.innerHTML = metaChips;
        }

        // Aba Dados
        var body = document.getElementById('rncTrashViewBody');
        if (body) {
            var mkv = mk;
            body.innerHTML =
                '<div class="rnc-trash-view-groups">' +
                _vgroup('fa-triangle-exclamation', '#2563eb', 'Identificação',
                    _vrow('fa-heading', 'Título', '<strong>' + esc(r.titulo || '—') + '</strong>') +
                    _vrow('fa-building', 'Setor', setorChipsHtml(r.setor, '<em class="rnc-vrow-empty">—</em>')) +
                    _vrow('fa-tag', 'Classificação', '<span class="rnc-class-badge rnc-class-badge--sm" style="' + rncClassStyle(ci) + '"><i class="fas ' + ci.icon + '"></i> ' + esc(ci.label) + '</span>') +
                    _vrow('fa-circle-dot', 'Status', r.status ? '<span class="rnc-vrow-pill" style="' + rncStatusColorStyle(r.status) + '">' + esc(r.status) + '</span>' : '<em class="rnc-vrow-empty">Não definido</em>') +
                    _vrow('fa-bookmark', 'Marcador', mkv ? '<span class="rnc-vrow-pill" style="background:' + mkv.bg + ';color:' + mkv.color + ';border-color:' + mkv.color + '33"><i class="fas ' + mkv.icon + '"></i> ' + esc(mkv.label) + '</span>' : '<em class="rnc-vrow-empty">Nenhum</em>')
                ) +
                _vgroup('fa-calendar-days', '#7c3aed', 'Datas & Responsabilidade',
                    _vrow('fa-calendar-plus', 'Início', r.dataInicio ? esc(fmtDate(r.dataInicio)) : '<em class="rnc-vrow-empty">—</em>') +
                    _vrow('fa-calendar-check', 'Conclusão prevista', r.dataConclusao ? esc(fmtDate(r.dataConclusao)) : '<em class="rnc-vrow-empty">—</em>') +
                    _vrow('fa-user-tie', 'Responsável', rncNamesChips(rncArrField(r.responsavel))) +
                    (rncArrField(r.revisor).length ? _vrow('fa-user-check', 'Revisor', rncNamesChips(rncArrField(r.revisor))) : '') +
                    _vrow('fa-clock', 'Registrado em', esc(fmtDateTime(r.createdAt)))
                ) +
                _vgroup('fa-map-pin', '#0891b2', 'Origem & Detalhamento',
                    _vrow('fa-location-dot', 'Origem', esc(r.origem || '—')) +
                    _vrow('fa-list-ul', 'Detalhamento', esc(r.detalhamento || '—'))
                ) +
                _vgroup('fa-file-lines', '#16a34a', 'Descrição & Plano de Ação',
                    _vtext('Descrição do Ocorrido', esc(r.descricao || '—').replace(/\n/g,'<br>')) +
                    _vtext('Plano de Ação', r.planoAcao ? esc(r.planoAcao).replace(/\n/g,'<br>') : '<em class="rnc-vrow-empty">Não informado</em>')
                ) +
                _vgroup('fa-trash-can', '#dc2626', 'Informações de Exclusão',
                    _vrow('fa-clock-rotate-left', 'Excluído em', esc(_fmtTrashDate(r.deletedAt))) +
                    (r.deletedBy ? _vrow('fa-user-xmark', 'Excluído por', esc(r.deletedBy)) : '') +
                    _vtext('Motivo da exclusão', r.deletedMotivo ? esc(r.deletedMotivo).replace(/\n/g,'<br>') : '<em class="rnc-vrow-empty">Não informado</em>')
                ) +
                '</div>';
        }

        // Aba Checklist
        _renderRncTvCl(r);

        // Aba Publicações
        _renderRncTvPubs(r);

        // Aba Anexos
        _renderRncTvAx(r);

        // Badges
        _updateRncTvBadges(r);

        // Volta para a aba Dados ao abrir
        var modal = document.getElementById('rncTrashViewModal');
        if (modal) {
            modal.querySelectorAll('.rnc-tv-tab').forEach(function(t){ t.classList.remove('active'); });
            modal.querySelectorAll('.rnc-tv-panel').forEach(function(p){ p.classList.remove('active'); });
            var firstTab = modal.querySelector('.rnc-tv-tab');
            if (firstTab) firstTab.classList.add('active');
            var firstPanel = document.getElementById('rnctv-info');
            if (firstPanel) firstPanel.classList.add('active');
        }
    }

    window.rncSwitchTrashViewTab = function(panelId, btn) {
        var modal = document.getElementById('rncTrashViewModal');
        if (!modal) return;
        modal.querySelectorAll('.rnc-tv-tab').forEach(function(t){ t.classList.remove('active'); });
        modal.querySelectorAll('.rnc-tv-panel').forEach(function(p){ p.classList.remove('active'); });
        if (btn) btn.classList.add('active');
        var panel = document.getElementById(panelId);
        if (panel) panel.classList.add('active');
    };

    function _updateRncTvBadges(r) {
        var cl = r.checklist || [];
        var clDone = cl.filter(function(c){ return c.checked; }).length;
        var elCl = document.getElementById('rncTvClBadge');
        if (elCl) { elCl.textContent = cl.length > 0 ? clDone + '/' + cl.length : ''; elCl.style.display = cl.length > 0 ? '' : 'none'; }
        var elPub = document.getElementById('rncTvPubBadge');
        if (elPub) { var np = (r.publicacoes||[]).length; elPub.textContent = np || ''; elPub.style.display = np > 0 ? '' : 'none'; }
        var elAx = document.getElementById('rncTvAxBadge');
        if (elAx) { var na = (r.anexos||[]).length; elAx.textContent = na || ''; elAx.style.display = na > 0 ? '' : 'none'; }
    }

    function _renderRncTvCl(r) {
        var container = document.getElementById('rncTvClContent');
        if (!container) return;
        var cl = r.checklist || [];
        if (cl.length === 0) {
            container.innerHTML = '<div class="rnc-pub-empty"><i class="fas fa-list-check"></i><p>Nenhum item de checklist cadastrado.</p></div>';
            return;
        }
        var done = cl.filter(function(c){ return c.checked; }).length;
        var pct = Math.round((done / cl.length) * 100);
        container.innerHTML =
            '<div class="rnc-view-cl-progress">' +
                '<div class="rnc-view-cl-bar"><div class="rnc-view-cl-bar-fill" style="width:' + pct + '%"></div></div>' +
                '<span class="rnc-view-cl-count">' + done + '/' + cl.length + ' (' + pct + '%)</span>' +
            '</div>' +
            cl.map(function(item) {
                return '<div class="rnc-view-cl-item' + (item.checked ? ' checked' : '') + '">' +
                    '<input type="checkbox" ' + (item.checked ? 'checked' : '') + ' disabled>' +
                    '<span class="cl-text">' + esc(item.texto || '') + '</span>' +
                '</div>';
            }).join('');
    }

    function _renderRncTvPubs(r) {
        var container = document.getElementById('rncTvPubContent');
        if (!container) return;
        var pubs = r.publicacoes || [];
        if (pubs.length === 0) {
            container.innerHTML = '<div class="rnc-pub-empty"><i class="fas fa-paper-plane"></i><p>Nenhuma publicação registrada.</p></div>';
            return;
        }

        function tipoOf(p) {
            var t = p.tipo || 'Comentário';
            return (t === 'Comentário' || t === 'Atualização' || t === 'Evidência') ? t : 'Comentário';
        }
        var counts = { 'Comentário': 0, 'Atualização': 0, 'Evidência': 0 };
        pubs.forEach(function(p){ counts[tipoOf(p)]++; });

        var subtabs = '<div class="rnc-pub-subtabs">' +
            RNC_PUB_TIPOS.map(function(t){
                var isFirst = t.key === RNC_PUB_TIPOS[0].key;
                return '<button class="rnc-pub-subtab' + (isFirst ? ' active' : '') + '" style="--rnc-pst-color:' + t.color + '" onclick="rncTvSwitchPubSubtab(this,\'' + t.key + '\')">' +
                    '<i class="fas ' + t.icon + '"></i> ' + t.label +
                    (counts[t.key] > 0 ? '<span class="rnc-pub-subtab-badge">' + counts[t.key] + '</span>' : '') +
                '</button>';
            }).join('') +
        '</div>';

        var firstKey = RNC_PUB_TIPOS[0].key;
        var filtered = pubs.filter(function(p){ return tipoOf(p) === firstKey; });
        var listHtml = _rncTvPubListHtml(r, pubs, firstKey);
        container.innerHTML = subtabs + listHtml;
    }

    window.rncTvSwitchPubSubtab = function(btn, key) {
        var container = document.getElementById('rncTvPubContent');
        if (!container) return;
        container.querySelectorAll('.rnc-pub-subtab').forEach(function(b){ b.classList.remove('active'); });
        if (btn) btn.classList.add('active');
        var r = _rncTrashViewId ? (window.rncItems||[]).find(function(x){ return x.id === _rncTrashViewId; }) : null;
        if (!r) return;
        var listWrap = container.querySelector('.rnc-tv-pub-list-wrap');
        if (listWrap) listWrap.outerHTML = _rncTvPubListHtml(r, r.publicacoes || [], key);
    };

    function _rncTvPubListHtml(r, pubs, key) {
        function tipoOf(p) {
            var t = p.tipo || 'Comentário';
            return (t === 'Comentário' || t === 'Atualização' || t === 'Evidência') ? t : 'Comentário';
        }
        var filtered = pubs.map(function(p, i){ return { p: p, i: i }; })
                           .filter(function(o){ return tipoOf(o.p) === key; });
        if (filtered.length === 0) {
            var cur = RNC_PUB_TIPOS.find(function(t){ return t.key === key; }) || RNC_PUB_TIPOS[0];
            return '<div class="rnc-tv-pub-list-wrap"><div class="rnc-pub-empty"><i class="fas ' + cur.icon + '"></i><p>Nenhuma publicação do tipo "' + cur.label + '".</p></div></div>';
        }
        return '<div class="rnc-tv-pub-list-wrap"><div class="rnc-pub-list">' +
            filtered.slice().reverse().map(function(o){ return _rncPubItemHtml(r, o.p, o.i, false); }).join('') +
        '</div></div>';
    }

    function _renderRncTvAx(r) {
        var container = document.getElementById('rncTvAxContent');
        if (!container) return;
        var anexos = r.anexos || [];
        if (anexos.length === 0) {
            container.innerHTML = '<div class="rnc-pub-empty"><i class="fas fa-paperclip"></i><p>Nenhum anexo cadastrado.</p></div>';
            return;
        }
        container.innerHTML = '<div class="view-anexos-grid">' +
            anexos.map(function(a) {
                var name = a.titulo || a.url || 'Arquivo';
                var ext = name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : '';
                var icon = 'fa-file';
                if (ext === '.pdf') icon = 'fa-file-pdf';
                else if (['.xls','.xlsx'].includes(ext)) icon = 'fa-file-excel';
                else if (['.jpg','.jpeg','.png','.gif','.webp'].includes(ext)) icon = 'fa-file-image';
                else if (['.ppt','.pptx'].includes(ext)) icon = 'fa-file-powerpoint';
                return '<a href="' + esc(a.url||'') + '" target="_blank" class="view-anexo-card">' +
                    '<i class="fas ' + icon + ' anexo-icon"></i>' +
                    '<span class="anexo-name">' + esc(name) + '</span>' +
                '</a>';
            }).join('') +
        '</div>';
    }

})();
