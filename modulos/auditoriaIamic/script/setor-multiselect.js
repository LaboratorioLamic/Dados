// === MULTI-SELECT DE SETORES (popover com busca) ===
// Usado no campo "Setor" de todos os módulos de formulário: permite marcar
// mais de um setor simultaneamente. Armazena os nomes selecionados como
// array; o hidden input guarda um JSON stringificado (mesmo padrão de
// Responsáveis/Revisores em multi-select.js), consumido por cada módulo
// ao salvar o registro.

(function () {

    var SMS_PREFIXES = ['ativ', 'audit', 'doc', 'oc', 'rnc'];

    // Id do input hidden que guarda o JSON do array, por prefixo.
    // Padrão é "<prefix>Setor"; oc/rnc usam os ids legados dos campos de setor.
    var SMS_HIDDEN_ID = { oc: 'ocFSetor', rnc: 'rncFSetor' };
    function _hiddenId(prefix) { return SMS_HIDDEN_ID[prefix] || (prefix + 'Setor'); }

    // Estado interno: prefix → array de nomes de setor selecionados
    var _state = {};
    SMS_PREFIXES.forEach(function (p) { _state[p] = []; });

    function _escHtml(s) {
        return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function _allSetores() {
        if (typeof masterLists === 'undefined' || !masterLists.setores) return [];
        return masterLists.setores
            .filter(function (s) { return typeof s === 'string' ? s : (s && !s.deleted); })
            .map(function (s) { return typeof s === 'string' ? s : s.name; })
            .filter(Boolean);
    }

    function _renderTags(prefix) {
        var tagsEl = document.getElementById('sms-' + prefix + '-tags');
        var hiddenEl = document.getElementById(_hiddenId(prefix));
        if (!tagsEl) return;
        var selected = _state[prefix];
        if (!selected.length) {
            tagsEl.innerHTML = '<span class="sms-placeholder">Selecionar setor...</span>';
        } else {
            tagsEl.innerHTML = selected.map(function (s) {
                var safe = s.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                return '<span class="sms-tag">'
                    + '<span>' + _escHtml(s) + '</span>'
                    + '<button type="button" onclick="smsRemove(\'' + prefix + '\',\'' + safe + '\',event)" title="Remover"><i class="fas fa-times"></i></button>'
                    + '</span>';
            }).join('');
        }
        if (hiddenEl) hiddenEl.value = JSON.stringify(selected);
    }

    function _renderOptions(prefix) {
        var optEl = document.getElementById('sms-' + prefix + '-options');
        var inputEl = document.getElementById('sms-' + prefix + '-input');
        if (!optEl) return;
        var q = (inputEl ? inputEl.value : '').toLowerCase().trim();
        var selected = _state[prefix];
        var all = _allSetores();
        var filtered = all.filter(function (s) { return !q || s.toLowerCase().includes(q); });
        if (!filtered.length) {
            optEl.innerHTML = '<div class="sms-empty"><i class="fas fa-building" style="margin-right:6px;opacity:.5"></i>Nenhum setor encontrado</div>';
            return;
        }
        optEl.innerHTML = filtered.map(function (s) {
            var isSel = selected.includes(s);
            var safe = s.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            return '<div class="sms-option' + (isSel ? ' sms-option--sel' : '') + '" onclick="smsToggle(\'' + prefix + '\',\'' + safe + '\',event)">'
                + '<span class="sms-option-icon"><i class="fas fa-building"></i></span>'
                + '<span class="sms-option-name">' + _escHtml(s) + '</span>'
                + '<i class="fas fa-check sms-option-check"></i>'
                + '</div>';
        }).join('');
    }

    function _closeAll() {
        SMS_PREFIXES.forEach(function (p) {
            var fieldEl = document.getElementById('sms-' + p);
            if (fieldEl) fieldEl.classList.remove('sms-field--open');
        });
    }

    window.smsToggleOpen = function (prefix, e) {
        if (e) e.stopPropagation();
        var fieldEl = document.getElementById('sms-' + prefix);
        if (!fieldEl) return;
        var wasOpen = fieldEl.classList.contains('sms-field--open');
        _closeAll();
        if (wasOpen) return;
        fieldEl.classList.add('sms-field--open');
        _renderOptions(prefix);
        var inputEl = document.getElementById('sms-' + prefix + '-input');
        if (inputEl) { inputEl.value = ''; setTimeout(function () { inputEl.focus(); }, 0); }

        var dropEl = document.getElementById('sms-' + prefix + '-drop');
        if (dropEl) {
            dropEl.classList.remove('sms-drop--above');
            var rect = fieldEl.getBoundingClientRect();
            var spaceBelow = window.innerHeight - rect.bottom;
            var dropH = Math.min(240, dropEl.scrollHeight || 240);
            if (spaceBelow < dropH + 12 && rect.top > dropH + 12) {
                dropEl.classList.add('sms-drop--above');
            }
        }
    };

    window.smsFilter = function (prefix) {
        _renderOptions(prefix);
    };

    window.smsToggle = function (prefix, name, e) {
        if (e) e.stopPropagation();
        var arr = _state[prefix];
        var idx = arr.indexOf(name);
        if (idx > -1) { arr.splice(idx, 1); } else { arr.push(name); }
        _renderTags(prefix);
        _renderOptions(prefix);
        var inputEl = document.getElementById('sms-' + prefix + '-input');
        if (inputEl) inputEl.focus();
    };

    window.smsRemove = function (prefix, name, e) {
        if (e) e.stopPropagation();
        var arr = _state[prefix];
        var idx = arr.indexOf(name);
        if (idx > -1) arr.splice(idx, 1);
        _renderTags(prefix);
        var fieldEl = document.getElementById('sms-' + prefix);
        if (fieldEl && fieldEl.classList.contains('sms-field--open')) _renderOptions(prefix);
    };

    // Carrega valor (string legada, array, ou JSON stringificado) pro estado interno
    window.smsSetValue = function (prefix, value) {
        var arr = (typeof setorArr === 'function') ? setorArr(value) : [];
        _state[prefix] = arr;
        _renderTags(prefix);
    };

    window.smsGetValue = function (prefix) {
        return _state[prefix].slice();
    };

    window.smsReset = function (prefix) {
        _state[prefix] = [];
        _renderTags(prefix);
        var hiddenEl = document.getElementById(_hiddenId(prefix));
        if (hiddenEl) hiddenEl.value = '';
    };

    document.addEventListener('click', function (e) {
        if (!e.target.closest('.sms-field')) _closeAll();
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') _closeAll();
    });

})();
