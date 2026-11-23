// === TELA DE CARREGAMENTO DE DADOS ===
// Cobre a janela entre o login e o primeiro render do dashboard, enquanto
// loadCloudData() baixa as coleções do Firebase. Sem ela o overlay de login
// some na hora e o usuário encara um dashboard zerado ("Nenhum dado") até a
// rede responder — o que parece um sistema vazio, não um sistema carregando.
(function () {
    'use strict';

    // Etapas do boot, na ordem em que loadCloudData as atinge. O percentual é o
    // ponto em que a barra PARA ao entrar na etapa; o avanço é otimista dentro
    // dela (ver _creep) para que a barra nunca fique parada muito tempo.
    var STEPS = {
        connect:  { pct: 8,   text: 'Conectando ao servidor...',        hint: 'Estabelecendo conexão segura' },
        cache:    { pct: 18,  text: 'Restaurando dados locais...',      hint: 'Exibindo a última versão salva neste dispositivo' },
        download: { pct: 30,  text: 'Baixando registros...',            hint: 'Sincronizando com o banco de dados' },
        users:    { pct: 70,  text: 'Carregando usuários e permissões...', hint: 'Aplicando seu perfil de acesso' },
        prefs:    { pct: 82,  text: 'Restaurando suas preferências...', hint: 'Filtros e visualizações salvas' },
        render:   { pct: 92,  text: 'Preparando o painel...',           hint: 'Montando indicadores' },
        done:     { pct: 100, text: 'Pronto!',                          hint: 'Abrindo o painel' }
    };

    var _el, _step, _bar, _hint, _creepTimer, _pct = 0, _visible = false;

    function _cache() {
        _el   = document.getElementById('bootLoader');
        _step = document.getElementById('bootLoaderStep');
        _bar  = document.getElementById('bootLoaderBar');
        _hint = document.getElementById('bootLoaderHint');
        return !!_el;
    }

    function _setPct(p) {
        _pct = Math.max(_pct, Math.min(100, p));
        if (_bar) _bar.style.width = _pct + '%';
    }

    // Avanço otimista: entre duas etapas a barra continua subindo devagar em
    // direção ao teto da etapa seguinte, para não dar a impressão de travamento
    // durante um download longo. Nunca ultrapassa o teto.
    function _creep(ceiling) {
        clearInterval(_creepTimer);
        _creepTimer = setInterval(function () {
            if (_pct >= ceiling) { clearInterval(_creepTimer); return; }
            _setPct(_pct + Math.max(0.3, (ceiling - _pct) * 0.06));
        }, 320);
    }

    window.showBootLoader = function (stepKey) {
        if (!_cache()) return;
        _pct = 0;
        _visible = true;
        _el.classList.add('show');
        _el.setAttribute('aria-busy', 'true');
        window.setBootLoaderStep(stepKey || 'connect');
    };

    window.setBootLoaderStep = function (stepKey, ceiling) {
        if (!_visible || !_cache()) return;
        var s = STEPS[stepKey];
        if (!s) return;
        if (_step) _step.textContent = s.text;
        if (_hint) _hint.textContent = s.hint;
        _setPct(s.pct);
        clearInterval(_creepTimer);
        // Sobe rumo ao teto da PRÓXIMA etapa enquanto esta ainda executa.
        if (stepKey !== 'done') _creep(ceiling || _nextCeiling(stepKey));
    };

    function _nextCeiling(stepKey) {
        var keys = Object.keys(STEPS);
        var i = keys.indexOf(stepKey);
        var next = keys[i + 1];
        // Para 4 pontos antes do teto seguinte: a etapa seguinte é quem o crava.
        return next ? Math.max(STEPS[stepKey].pct, STEPS[next].pct - 4) : 99;
    }

    // `failed` pode ser false, true, uma string ou um Error. Quando traz o motivo,
    // ele vai PARA A TELA: sem isso, uma falha de sincronização só se diagnostica
    // abrindo o console, que é justamente o que o usuário final não vai fazer.
    window.hideBootLoader = function (failed) {
        clearInterval(_creepTimer);
        if (!_cache() || !_visible) return;
        if (failed) {
            var motivo = (failed && failed.message) ? failed.message
                       : (typeof failed === 'string' ? failed : '');
            if (_step) _step.textContent = 'Não foi possível sincronizar.';
            if (_hint) {
                _hint.textContent = motivo
                    ? motivo + ' — exibindo os dados disponíveis offline.'
                    : 'Exibindo os dados disponíveis offline.';
            }
        } else {
            window.setBootLoaderStep('done');
        }
        _visible = false;
        _el.setAttribute('aria-busy', 'false');
        // Em falha, fica tempo suficiente para o motivo ser lido. Em sucesso, só o
        // instante do 100% — sumir no meio da animação passa sensação de corte.
        setTimeout(function () {
            _el.classList.remove('show');
            _setPct(0);
            if (_bar) _bar.style.width = '0%';
        }, failed ? 6000 : 320);
    };

    window.isBootLoaderVisible = function () { return _visible; };
})();
