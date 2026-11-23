// === GERENCIADOR DE CONEXÃO FIREBASE (economia de conexões simultâneas) ===
// Reduz o nº de conexões WebSocket simultâneas contadas pelo RTDB:
//   (1) desconecta abas em background / ao fechar (com carência p/ não churnar
//       em troca rápida de aba);
//   (4) desconecta após inatividade prolongada e reconecta na 1ª interação.
// A conexão só é gerenciada enquanto há usuário logado (start/stop chamados no
// login/logout). Desconexões daqui são "intencionais": marcam
// window._intentionalOffline para que offline.js NÃO exiba o overlay de offline.
(function () {
    'use strict';

    // Carência antes de desconectar uma aba escondida: evita desconectar/reconectar
    // em troca rápida de aba no desktop (só reap de fato quem ficou em background).
    var HIDDEN_GRACE_MS = 60 * 1000;
    // Inatividade: 60min sem interação → desconecta; reconecta na 1ª atividade.
    var IDLE_MS = 60 * 60 * 1000;

    var _active = false;          // gerenciador ligado (usuário logado)
    var _hiddenTimer = null;
    var _idleTimer = null;
    var _activityBound = false;

    function _goOffline() {
        if (!window.firebaseGoOffline) return;
        window._intentionalOffline = true;
        try { window.firebaseGoOffline(); } catch (_) {}
    }
    function _goOnline() {
        window._intentionalOffline = false;
        if (!window.firebaseGoOnline) return;
        try { window.firebaseGoOnline(); } catch (_) {}
    }

    // --- (4) Inatividade ---
    function _resetIdle() {
        if (!_active) return;
        // Qualquer atividade reconecta se estávamos desconectados de propósito.
        if (window._intentionalOffline && !document.hidden) _goOnline();
        clearTimeout(_idleTimer);
        _idleTimer = setTimeout(function () {
            if (_active && !document.hidden) _goOffline();
        }, IDLE_MS);
    }

    // --- (1) Visibilidade / fechamento ---
    function _onVisibility() {
        if (!_active) return;
        if (document.hidden) {
            clearTimeout(_hiddenTimer);
            _hiddenTimer = setTimeout(_goOffline, HIDDEN_GRACE_MS);
        } else {
            clearTimeout(_hiddenTimer);
            if (window._intentionalOffline) _goOnline();
            _resetIdle();
        }
    }
    function _onPageHide() {
        // Aba fechando / indo pro background (mobile): best-effort reap imediato.
        if (_active) _goOffline();
    }

    var _ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll'];

    window.startConnectionManager = function () {
        if (_active) return;
        _active = true;
        window._intentionalOffline = false;
        document.addEventListener('visibilitychange', _onVisibility);
        window.addEventListener('pagehide', _onPageHide);
        if (!_activityBound) {
            _ACTIVITY_EVENTS.forEach(function (ev) {
                window.addEventListener(ev, _resetIdle, { passive: true });
            });
            _activityBound = true;
        }
        _resetIdle();
    };

    window.stopConnectionManager = function () {
        _active = false;
        clearTimeout(_hiddenTimer); _hiddenTimer = null;
        clearTimeout(_idleTimer);   _idleTimer = null;
        document.removeEventListener('visibilitychange', _onVisibility);
        window.removeEventListener('pagehide', _onPageHide);
        window._intentionalOffline = false;
    };
})();
