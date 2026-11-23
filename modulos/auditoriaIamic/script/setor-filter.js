// === FILTRO RÁPIDO DE SETORES (header) ===

// null = sem filtro ativo (mostra tudo que a permissão permite)
// array = mostrar apenas estes setores
var activeSetorFilter = null;

// Seleção temporária enquanto o modal está aberto
var _tempSetorSelection = null;

function openSetorFilterModal() {
    const modal = document.getElementById('modalSetorFilter');
    if (!modal) return;

    if (currentTab === 'dashboard' && typeof updateDashboardFilterOptions === 'function') {
        updateDashboardFilterOptions();
    }

    const setores = _getVisibleSetores();
    _tempSetorSelection = activeSetorFilter ? [...activeSetorFilter] : [];

    const searchEl = document.getElementById('setorFilterSearch');
    if (searchEl) searchEl.value = '';

    _renderSetorFilterGrid(setores);
    _updateSetorFilterCount();
    modal.style.display = 'flex';
    if (searchEl) setTimeout(() => searchEl.focus(), 80);
}

function closeSetorFilterModal() {
    const modal = document.getElementById('modalSetorFilter');
    if (modal) modal.style.display = 'none';
    _tempSetorSelection = null;
}

function confirmSetorFilter() {
    if (!_tempSetorSelection) return;
    const setores = _getVisibleSetores();
    // Se tudo selecionado ou nada selecionado, limpar filtro (= sem restrição)
    if (_tempSetorSelection.length === 0 || _tempSetorSelection.length === setores.length) {
        activeSetorFilter = null;
    } else {
        activeSetorFilter = [..._tempSetorSelection];
    }
    closeSetorFilterModal();
    _updateSetorFilterBtn();
    try { if (typeof renderCards === 'function') renderCards(); } catch (err) { console.error('confirmSetorFilter/renderCards', err); }
    try { if (typeof renderDashboard === 'function' && currentTab === 'dashboard') renderDashboard(); } catch (err) { console.error('confirmSetorFilter/renderDashboard', err); }
}

function setorFilterDeselectAll() {
    _tempSetorSelection = [];
    _renderSetorFilterGrid(_getVisibleSetores());
    _updateSetorFilterCount();
}

function setorFilterSelectAll() {
    _tempSetorSelection = _getVisibleSetores().slice();
    _renderSetorFilterGrid(_getVisibleSetores());
    _updateSetorFilterCount();
}

function setorFilterToggleAll() {
    const total = _getVisibleSetores().length;
    const allSelected = _tempSetorSelection && _tempSetorSelection.length === total;
    if (allSelected) {
        setorFilterDeselectAll();
    } else {
        setorFilterSelectAll();
    }
}

// Retorna setores baseados apenas nas permissões do usuário, SEM aplicar o filtro ativo
// (usado dentro do modal para exibir todos os setores disponíveis para seleção)
var _getAllowedSetoresBase = null;

function _getVisibleSetores() {
    const all = (masterLists && masterLists.setores) ? [...masterLists.setores] : [];
    const baseFn = _getAllowedSetoresBase || getAllowedSetores;
    const allowed = baseFn();
    const result = allowed === null ? all : all.filter(s => allowed.includes(s));
    return result.sort((a, b) => String(a).localeCompare(String(b), 'pt'));
}

function _renderSetorFilterGrid(setores) {
    const grid = document.getElementById('setorFilterGrid');
    const subtitle = document.getElementById('setorFilterSubtitle');
    if (!grid) return;

    if (subtitle) subtitle.textContent = `${setores.length} setor${setores.length !== 1 ? 'es' : ''} disponível${setores.length !== 1 ? 'is' : ''}`;

    grid.innerHTML = setores.map(s => {
        const sel = _tempSetorSelection && _tempSetorSelection.includes(s);
        return `<div class="setor-chip ${sel ? 'selected' : ''}" onclick="_toggleSetorChip(this, '${_escHtml(s)}')">
            <div class="setor-chip-check"><i class="fas fa-check"></i></div>
            <span class="setor-chip-label" title="${_escHtml(s)}">${_escHtml(s)}</span>
        </div>`;
    }).join('');
}

function _toggleSetorChip(el, setor) {
    if (!_tempSetorSelection) return;
    const idx = _tempSetorSelection.indexOf(setor);
    if (idx === -1) {
        _tempSetorSelection.push(setor);
        el.classList.add('selected');
    } else {
        _tempSetorSelection.splice(idx, 1);
        el.classList.remove('selected');
    }
    _updateSetorFilterCount();
}

function _updateSetorFilterCount() {
    const el = document.getElementById('setorFilterCount');
    const btn = document.getElementById('setorFilterToggleAllBtn');
    const total = _getVisibleSetores().length;
    const sel = _tempSetorSelection ? _tempSetorSelection.length : total;
    if (el) el.textContent = `${sel} de ${total} selecionados`;
    if (btn) {
        const allSelected = sel === total;
        btn.innerHTML = allSelected
            ? '<i class="fas fa-times"></i> Desmarcar todos'
            : '<i class="fas fa-check"></i> Marcar todos';
    }
}

function _updateSetorFilterBtn() {
    const btn = document.getElementById('btnSetorFilter');
    const label = document.getElementById('setorFilterLabel');
    if (!btn || !label) return;

    const setores = _getVisibleSetores();
    if (!activeSetorFilter || activeSetorFilter.length === setores.length) {
        label.textContent = 'Setores';
        btn.classList.remove('active');
    } else {
        label.textContent = `${activeSetorFilter.length} setor${activeSetorFilter.length !== 1 ? 'es' : ''}`;
        btn.classList.add('active');
    }
}

// Sobrescreve getAllowedSetores para incluir o filtro ativo do header
// Guarda a referência original e envolve
(function _patchGetAllowedSetores() {
    // Aguarda o carregamento do filters.js
    const _ready = () => {
        if (typeof getAllowedSetores !== 'function') {
            setTimeout(_ready, 50);
            return;
        }
        const _original = getAllowedSetores;
        _getAllowedSetoresBase = _original; // referência salva para _getVisibleSetores
        getAllowedSetores = function() {
            const base = _original();
            if (!activeSetorFilter) return base; // sem filtro ativo
            if (base === null) return activeSetorFilter; // admin sem permissão restrita
            // interseção
            return base.filter(s => activeSetorFilter.includes(s));
        };
    };
    _ready();
})();

// Mostra/oculta o botão no header conforme aba ativa
function _syncSetorFilterBtn() {
    const hide = (currentTab === 'backup' || currentTab === 'configuracoes');
    const btn = document.getElementById('btnSetorFilter');
    if (btn) btn.style.display = hide ? 'none' : 'inline-flex';
    const dateBtn = document.getElementById('fbarDateBtn');
    if (dateBtn) dateBtn.style.display = hide ? 'none' : 'inline-flex';
    _updateSetorFilterBtn();
    if (typeof _updateFbarDateBtn === 'function') _updateFbarDateBtn();
}

// _syncSetorFilterBtn é chamado pelo tabs.js ao trocar de aba

function _filterSetorChips(query, gridId) {
    const q = query.trim().toLowerCase();
    const id = gridId || 'setorFilterGrid';
    const chips = document.querySelectorAll(`#${id} .setor-chip`);
    chips.forEach(chip => {
        const label = chip.querySelector('.setor-chip-label');
        const text = label ? label.textContent.toLowerCase() : '';
        chip.style.display = (!q || text.includes(q)) ? '' : 'none';
    });
}

function _escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
