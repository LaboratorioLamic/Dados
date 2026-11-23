// ═══════════════════════════════════════════════════════════════
// autocomplete.js — Campos de Setor e Categoria com autocomplete
// ═══════════════════════════════════════════════════════════════
//
// Substitui visualmente os <select> de setor/categoria por inputs
// digitáveis com dropdown, mantendo os <select> ocultos como fonte
// de verdade para o código existente (onCategoryChange, .value, etc).

(function () {

// Prefixos dos drawers que possuem setor + categoria
var AC_PREFIXES = ['audit', 'ativ', 'doc', 'mant'];

// ── Inicializa o autocomplete para um <select> existente ──────
function initAcField(selectEl, opts) {
    if (!selectEl || selectEl._acInit) return;
    selectEl._acInit = true;

    var wrapper = selectEl.closest('.select-wrapper');
    if (!wrapper) return;

    // Oculta o select original
    selectEl.style.display = 'none';

    // Cria o input visível
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'ac-input';
    input.placeholder = opts.placeholder || 'Selecione ou digite...';
    input.autocomplete = 'off';
    input.setAttribute('spellcheck', 'false');

    // Dropdown
    var dropdown = document.createElement('div');
    dropdown.className = 'ac-dropdown';
    dropdown.style.display = 'none';

    // Insere antes do botão "+"
    var plusBtn = wrapper.querySelector('button');
    wrapper.insertBefore(input, plusBtn || null);
    wrapper.insertBefore(dropdown, plusBtn || null);

    // Sincroniza o input com o valor atual do select
    function syncFromSelect() {
        var val = selectEl.value;
        if (val) {
            var opt = selectEl.querySelector('option[value="' + val.replace(/"/g, '\\"') + '"]');
            input.value = opt ? opt.textContent : val;
        } else {
            input.value = '';
        }
    }
    syncFromSelect();

    // Observa mudanças externas no select (ex: resetModal, editItem)
    var mo = new MutationObserver(function () {
        syncFromSelect();
    });
    mo.observe(selectEl, { attributes: true, childList: true, subtree: true });

    // Abre dropdown com os itens do select filtrados pelo input
    function openDropdown(filterText) {
        var options = Array.from(selectEl.options).filter(function (o) {
            return o.value !== '' && o.value !== undefined;
        });
        if (!options.length) { dropdown.style.display = 'none'; return; }

        var q = (filterText || '').toLowerCase().trim();
        var filtered = q
            ? options.filter(function (o) { return o.textContent.toLowerCase().includes(q); })
            : options;

        if (!filtered.length) { dropdown.style.display = 'none'; return; }

        dropdown.innerHTML = filtered.map(function (o) {
            var label = o.textContent;
            var highlighted = q
                ? label.replace(new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'),
                    '<strong>$1</strong>')
                : label;
            return '<div class="ac-option" data-value="' + o.value.replace(/"/g, '&quot;') + '">'
                + highlighted + '</div>';
        }).join('');

        dropdown.querySelectorAll('.ac-option').forEach(function (item) {
            item.addEventListener('mousedown', function (e) {
                e.preventDefault();
                selectValue(item.dataset.value, item.textContent);
            });
        });

        // Posiciona abaixo do input
        dropdown.style.display = 'block';
    }

    function closeDropdown() {
        dropdown.style.display = 'none';
    }

    function selectValue(val, label) {
        selectEl.value = val;
        input.value = label || val;
        closeDropdown();
        // Dispara o onchange do select original
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        // Se tiver callback extra (ex: onCategoryChange)
        if (typeof opts.onChange === 'function') opts.onChange(val);
    }

    // Eventos do input
    input.addEventListener('focus', function () {
        openDropdown(input.value);
    });

    input.addEventListener('input', function () {
        openDropdown(input.value);
        // Se o campo for apagado, limpa o select
        if (input.value.trim() === '') {
            selectEl.value = '';
            if (typeof opts.onChange === 'function') opts.onChange('');
        }
    });

    input.addEventListener('blur', function () {
        // Pequeno delay para permitir o mousedown no item
        setTimeout(function () {
            closeDropdown();
            // Se o texto não corresponde a nenhuma opção, reverte para o valor do select
            syncFromSelect();
        }, 150);
    });

    input.addEventListener('keydown', function (e) {
        var items = dropdown.querySelectorAll('.ac-option');
        var active = dropdown.querySelector('.ac-option.ac-active');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!items.length) return;
            var next = active ? active.nextElementSibling : items[0];
            if (active) active.classList.remove('ac-active');
            if (next) { next.classList.add('ac-active'); next.scrollIntoView({ block: 'nearest' }); }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (!items.length) return;
            var prev = active ? active.previousElementSibling : items[items.length - 1];
            if (active) active.classList.remove('ac-active');
            if (prev) { prev.classList.add('ac-active'); prev.scrollIntoView({ block: 'nearest' }); }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (active) { selectValue(active.dataset.value, active.textContent); }
        } else if (e.key === 'Escape') {
            closeDropdown();
            syncFromSelect();
        }
    });

    // Expõe sync para ser chamado externamente após populate
    selectEl._acSync = syncFromSelect;
}

// ── Inicializa autocomplete para um <select> sem .select-wrapper ──
function initAcFieldDirect(selectEl, opts) {
    if (!selectEl || selectEl._acInit) return;
    selectEl._acInit = true;

    var container = selectEl.parentElement;
    if (!container) return;

    // Oculta o select original
    selectEl.style.display = 'none';

    // Cria wrapper relativo para o dropdown
    var wrapper = document.createElement('div');
    wrapper.className = 'ac-direct-wrapper';
    container.insertBefore(wrapper, selectEl.nextSibling);

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'ac-input';
    input.placeholder = opts.placeholder || 'Selecione ou digite...';
    input.autocomplete = 'off';
    input.setAttribute('spellcheck', 'false');

    var dropdown = document.createElement('div');
    dropdown.className = 'ac-dropdown';
    dropdown.style.display = 'none';

    wrapper.appendChild(input);
    wrapper.appendChild(dropdown);

    function syncFromSelect() {
        var val = selectEl.value;
        if (val) {
            var opt = selectEl.querySelector('option[value="' + val.replace(/"/g, '\\"') + '"]');
            input.value = opt ? opt.textContent : val;
        } else {
            input.value = '';
        }
    }
    syncFromSelect();

    var mo = new MutationObserver(function () { syncFromSelect(); });
    mo.observe(selectEl, { attributes: true, childList: true, subtree: true });

    // Sincroniza quando o valor é alterado externamente (ex: resetModal, editItem)
    selectEl.addEventListener('change', function () { syncFromSelect(); });

    function openDropdown(filterText) {
        var options = Array.from(selectEl.options).filter(function (o) {
            return o.value !== '' && o.value !== undefined;
        });
        if (!options.length) { dropdown.style.display = 'none'; return; }

        var q = (filterText || '').toLowerCase().trim();
        var filtered = q
            ? options.filter(function (o) { return o.textContent.toLowerCase().includes(q); })
            : options;

        if (!filtered.length) { dropdown.style.display = 'none'; return; }

        dropdown.innerHTML = filtered.map(function (o) {
            var label = o.textContent;
            var highlighted = q
                ? label.replace(new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'),
                    '<strong>$1</strong>')
                : label;
            return '<div class="ac-option" data-value="' + o.value.replace(/"/g, '&quot;') + '">'
                + highlighted + '</div>';
        }).join('');

        dropdown.querySelectorAll('.ac-option').forEach(function (item) {
            item.addEventListener('mousedown', function (e) {
                e.preventDefault();
                selectValue(item.dataset.value, item.textContent);
            });
        });

        dropdown.style.display = 'block';
    }

    function closeDropdown() { dropdown.style.display = 'none'; }

    function selectValue(val, label) {
        selectEl.value = val;
        input.value = label || val;
        closeDropdown();
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        if (typeof opts.onChange === 'function') opts.onChange(val);
    }

    input.addEventListener('focus', function () { openDropdown(input.value); });

    input.addEventListener('input', function () {
        openDropdown(input.value);
        if (input.value.trim() === '') {
            selectEl.value = '';
            if (typeof opts.onChange === 'function') opts.onChange('');
        }
    });

    input.addEventListener('blur', function () {
        setTimeout(function () {
            closeDropdown();
            syncFromSelect();
        }, 150);
    });

    input.addEventListener('keydown', function (e) {
        var items = dropdown.querySelectorAll('.ac-option');
        var active = dropdown.querySelector('.ac-option.ac-active');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            var next = active ? active.nextElementSibling : items[0];
            if (active) active.classList.remove('ac-active');
            if (next) { next.classList.add('ac-active'); next.scrollIntoView({ block: 'nearest' }); }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            var prev = active ? active.previousElementSibling : items[items.length - 1];
            if (active) active.classList.remove('ac-active');
            if (prev) { prev.classList.add('ac-active'); prev.scrollIntoView({ block: 'nearest' }); }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (active) { selectValue(active.dataset.value, active.textContent); }
        } else if (e.key === 'Escape') {
            closeDropdown();
            syncFromSelect();
        }
    });

    selectEl._acSync = syncFromSelect;
}

// ── Inicializa todos os campos de categoria ───────────────────
// Setor é um popover multi-select (ver setor-multiselect.js) em todos os
// drawers; o "<prefix>Setor" é apenas o hidden que guarda o JSON do array.
function initAllAcFields() {
    AC_PREFIXES.forEach(function (prefix) {
        var catSel   = document.getElementById(prefix + 'Categoria');

        if (catSel) {
            initAcField(catSel, {
                placeholder: 'Categoria...',
                onChange: function () {}
            });
        }
    });

    // Responsável e Revisor agora são gerenciados pelo multi-select (ms-field)
    // e os hidden inputs não precisam de autocomplete.
}

// ── Após populate dos selects, sincroniza o input ─────────────
// Patch no objeto global para re-sincronizar após resetModal/editItem
var _origOnCatChange = window.onCategoryChange;
// onCategoryChange é definido dentro de filters.js; patchamos após DOMContentLoaded

document.addEventListener('DOMContentLoaded', function () {
    initAllAcFields();

    // Após qualquer mudança nas options do select (populate), re-sincroniza
    AC_PREFIXES.forEach(function (prefix) {
        var sel = document.getElementById(prefix + 'Categoria');
        if (!sel) return;
        var observer = new MutationObserver(function () {
            if (sel._acSync) sel._acSync();
        });
        observer.observe(sel, { childList: true });
    });

    // Responsável e Revisor gerenciados pelo ms-field — sem autocomplete aqui.
});

// Expõe para chamada manual se necessário
window.acSyncAll = function () {
    AC_PREFIXES.forEach(function (prefix) {
        var sel = document.getElementById(prefix + 'Categoria');
        if (sel && sel._acSync) sel._acSync();
    });
    // Responsável e Revisor: gerenciados pelo ms-field.
};

})();
