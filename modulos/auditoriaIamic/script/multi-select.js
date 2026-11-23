// === MULTI-SELECT DE RESPONSÁVEIS E REVISORES ===
// Armazena IDs de usuário internamente; exibe nomes resolvidos via resolveUserId.

(function () {

    var MS_FIELDS = [
        { key: 'audit-resp', hidden: 'auditResponsavel', field: 'ms-audit-resp', tags: 'ms-audit-resp-tags', input: 'ms-audit-resp-input', drop: 'ms-audit-resp-drop' },
        { key: 'audit-rev',  hidden: 'auditRevisor',     field: 'ms-audit-rev',  tags: 'ms-audit-rev-tags',  input: 'ms-audit-rev-input',  drop: 'ms-audit-rev-drop' },
        { key: 'ativ-resp',  hidden: 'ativResponsavel',  field: 'ms-ativ-resp',  tags: 'ms-ativ-resp-tags',  input: 'ms-ativ-resp-input',  drop: 'ms-ativ-resp-drop' },
        { key: 'ativ-rev',   hidden: 'ativRevisor',      field: 'ms-ativ-rev',   tags: 'ms-ativ-rev-tags',   input: 'ms-ativ-rev-input',   drop: 'ms-ativ-rev-drop' },
        { key: 'doc-resp',   hidden: 'docResponsavel',   field: 'ms-doc-resp',   tags: 'ms-doc-resp-tags',   input: 'ms-doc-resp-input',   drop: 'ms-doc-resp-drop' },
        { key: 'doc-rev',    hidden: 'docRevisor',       field: 'ms-doc-rev',    tags: 'ms-doc-rev-tags',    input: 'ms-doc-rev-input',    drop: 'ms-doc-rev-drop' },
        { key: 'rnc-resp',   hidden: 'rncFResponsavel',  field: 'ms-rnc-resp',   tags: 'ms-rnc-resp-tags',   input: 'ms-rnc-resp-input',   drop: 'ms-rnc-resp-drop' },
        { key: 'rnc-rev',    hidden: 'rncFRevisor',      field: 'ms-rnc-rev',    tags: 'ms-rnc-rev-tags',    input: 'ms-rnc-rev-input',    drop: 'ms-rnc-rev-drop' },
    ];

    // Estado interno: key → array de IDs selecionados
    var _state = {};
    MS_FIELDS.forEach(function (f) { _state[f.key] = []; });

    // Lista de usuários disponíveis: [{id, name}]
    var _allUsers = [];

    // Resolve ID → nome para exibição
    function _resolveName(id) {
        var u = _allUsers.find(function(u) { return u.id === id; });
        if (u) return u.name;
        // fallback: tenta resolveUserId global
        if (typeof resolveUserId === 'function') {
            var name = resolveUserId(id);
            if (name) return name;
        }
        return null;
    }

    // Atualiza _allUsers a partir do array global `users`
    window.msRefreshUsers = function () {
        if (typeof users === 'undefined') { _allUsers = []; return; }
        _allUsers = users
            .filter(function(u) { return u.id && u.name; })
            .map(function(u) { return { id: u.id, name: u.name }; })
            .sort(function(a, b) { return a.name.localeCompare(b.name); });
    };

    function _initials(name) {
        var parts = String(name || '').trim().split(/\s+/);
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }

    function _escHtml(s) {
        return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // Renderiza tags com nomes resolvidos a partir dos IDs
    function _renderTags(cfg) {
        var tagsEl = document.getElementById(cfg.tags);
        var hiddenEl = document.getElementById(cfg.hidden);
        if (!tagsEl) return;
        var selected = _state[cfg.key]; // array de IDs
        tagsEl.innerHTML = selected.map(function (id) {
            var name = _resolveName(id) || id;
            var safeId = id.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            return '<span class="ms-tag">'
                + '<span class="ms-tag-avatar">' + _escHtml(_initials(name)) + '</span>'
                + '<span>' + _escHtml(name) + '</span>'
                + '<button type="button" onclick="msRemove(\'' + cfg.key + '\',\'' + safeId + '\')" title="Remover"><i class="fas fa-times"></i></button>'
                + '</span>';
        }).join('');
        if (hiddenEl) hiddenEl.value = JSON.stringify(selected);
    }

    // Renderiza dropdown mostrando nomes, seleção armazena IDs
    function _renderDrop(cfg) {
        var dropEl = document.getElementById(cfg.drop);
        var inputEl = document.getElementById(cfg.input);
        if (!dropEl) return;
        var q = (inputEl ? inputEl.value : '').toLowerCase().trim();
        var selected = _state[cfg.key];
        if (_allUsers.length === 0) msRefreshUsers();
        var filtered = _allUsers.filter(function (u) {
            return !q || u.name.toLowerCase().includes(q);
        });
        if (!filtered.length) {
            dropEl.innerHTML = '<div class="ms-drop-empty"><i class="fas fa-user-slash" style="margin-right:6px;opacity:.5"></i>Nenhum usuário encontrado</div>';
        } else {
            dropEl.innerHTML = filtered.map(function (u) {
                var isSel = selected.includes(u.id);
                var safeId = u.id.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                return '<div class="ms-option' + (isSel ? ' ms-option--sel' : '') + '" onclick="msToggle(\'' + cfg.key + '\',\'' + safeId + '\')">'
                    + '<span class="ms-option-avatar">' + _escHtml(_initials(u.name)) + '</span>'
                    + '<span class="ms-option-name">' + _escHtml(u.name) + '</span>'
                    + '<i class="fas fa-check ms-option-check"></i>'
                    + '</div>';
            }).join('');
        }
        dropEl.classList.add('ms-drop--open');

        var fieldEl = document.getElementById(cfg.field);
        if (fieldEl) {
            var rect = fieldEl.getBoundingClientRect();
            var spaceBelow = window.innerHeight - rect.bottom;
            var dropH = Math.min(220, dropEl.scrollHeight || 220);
            if (spaceBelow < dropH + 12 && rect.top > dropH + 12) {
                dropEl.classList.add('ms-drop--above');
            } else {
                dropEl.classList.remove('ms-drop--above');
            }
        }
    }

    function _closeDrop(cfg) {
        var dropEl = document.getElementById(cfg.drop);
        if (dropEl) { dropEl.classList.remove('ms-drop--open'); dropEl.classList.remove('ms-drop--above'); }
        var inputEl = document.getElementById(cfg.input);
        if (inputEl) inputEl.value = '';
    }

    // ── API pública ──────────────────────────────────────────────

    // Toggle por ID
    window.msToggle = function (key, id) {
        var arr = _state[key];
        var idx = arr.indexOf(id);
        if (idx > -1) { arr.splice(idx, 1); } else { arr.push(id); }
        var cfg = MS_FIELDS.find(function (f) { return f.key === key; });
        if (!cfg) return;
        _renderTags(cfg);
        _renderDrop(cfg);
        var inputEl = document.getElementById(cfg.input);
        if (inputEl) inputEl.focus();
    };

    // Remove por ID
    window.msRemove = function (key, id) {
        var arr = _state[key];
        var idx = arr.indexOf(id);
        if (idx > -1) arr.splice(idx, 1);
        var cfg = MS_FIELDS.find(function (f) { return f.key === key; });
        if (cfg) _renderTags(cfg);
    };

    // Carrega dados do hidden input (JSON array de IDs) para o estado interno
    window.msLoad = function (key) {
        var cfg = MS_FIELDS.find(function (f) { return f.key === key; });
        if (!cfg) return;
        var hiddenEl = document.getElementById(cfg.hidden);
        if (!hiddenEl) return;
        var val = hiddenEl.value || '';
        try {
            var parsed = JSON.parse(val);
            _state[key] = Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : (parsed ? [String(parsed)] : []);
        } catch (_) {
            _state[key] = val ? [val] : [];
        }
        _renderTags(cfg);
    };

    window.msReset = function (key) {
        _state[key] = [];
        var cfg = MS_FIELDS.find(function (f) { return f.key === key; });
        if (!cfg) return;
        _renderTags(cfg);
        _closeDrop(cfg);
        var hiddenEl = document.getElementById(cfg.hidden);
        if (hiddenEl) hiddenEl.value = '';
    };

    window.msResetPrefix = function (prefix) {
        MS_FIELDS.forEach(function (f) {
            if (f.key.startsWith(prefix + '-')) msReset(f.key);
        });
    };

    // Retorna array de IDs selecionados (para salvar no Firebase)
    window.msGetValue = function (key) {
        return _state[key].slice();
    };

    // Define valor: aceita array de IDs; converte nomes legados para IDs se necessário
    window.msSetValue = function (key, value) {
        var arr;
        if (Array.isArray(value)) {
            arr = value.map(String).filter(Boolean);
        } else if (typeof value === 'string' && value.startsWith('[')) {
            try { arr = JSON.parse(value).map(String).filter(Boolean); } catch (_) { arr = value ? [value] : []; }
        } else {
            arr = value ? [String(value)] : [];
        }

        // Converte nomes legados para IDs (para registros ainda não migrados)
        arr = arr.map(function(item) {
            // Já é um ID válido?
            if (_allUsers.find(function(u) { return u.id === item; })) return item;
            // Tenta encontrar por nome (compatibilidade legada)
            var u = _allUsers.find(function(u) { return u.name && u.name.toLowerCase() === item.toLowerCase(); });
            return u ? u.id : item; // mantém o valor original se não encontrar
        }).filter(Boolean);

        _state[key] = arr;
        var cfg = MS_FIELDS.find(function (f) { return f.key === key; });
        if (cfg) {
            _renderTags(cfg);
            var hiddenEl = document.getElementById(cfg.hidden);
            if (hiddenEl) hiddenEl.value = JSON.stringify(arr);
        }
    };

    function _initField(cfg) {
        var fieldEl = document.getElementById(cfg.field);
        var inputEl = document.getElementById(cfg.input);
        var dropEl  = document.getElementById(cfg.drop);
        if (!fieldEl || !inputEl || !dropEl) return;

        fieldEl.addEventListener('click', function (e) {
            if (e.target.closest('.ms-tag')) return;
            if (_allUsers.length === 0) msRefreshUsers();
            _renderDrop(cfg);
            inputEl.focus();
        });

        inputEl.addEventListener('input', function () {
            _renderDrop(cfg);
        });

        inputEl.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') { _closeDrop(cfg); }
            if (e.key === 'Enter') { e.preventDefault(); }
        });
    }

    document.addEventListener('click', function (e) {
        if (!e.target.closest('.ms-field')) {
            MS_FIELDS.forEach(function (cfg) { _closeDrop(cfg); });
        }
    });

    document.addEventListener('DOMContentLoaded', function () {
        MS_FIELDS.forEach(_initField);
    });

    window.msSetDisabled = function (key, disabled) {
        var cfg = MS_FIELDS.find(function (f) { return f.key === key; });
        if (!cfg) return;
        var fieldEl = document.getElementById(cfg.field);
        var inputEl = document.getElementById(cfg.input);
        if (!fieldEl) return;
        if (disabled) {
            fieldEl.classList.add('ms-field--disabled');
            if (inputEl) inputEl.disabled = true;
        } else {
            fieldEl.classList.remove('ms-field--disabled');
            if (inputEl) inputEl.disabled = false;
        }
    };

})();
