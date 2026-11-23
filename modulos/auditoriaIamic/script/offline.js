// === DETECÇÃO DE CONEXÃO OFFLINE / RECONEXÃO ===
(function () {
    'use strict';

    // --- Estado interno ---
    let wasEverConnected = false;
    let isOverlayVisible = false;
    let reconnectAttempts = 0;
    let firebaseListenerSetup = false;
    let reconnectDebounce = null;

    // --- Elementos do DOM ---
    const overlay       = document.getElementById('offlineOverlay');
    const iconWrap      = document.getElementById('offlineIconWrap');
    const icon          = document.getElementById('offlineIcon');
    const statusDot     = document.getElementById('offlineStatusDot');
    const statusText    = document.getElementById('offlineStatusText');
    const btnReconnect  = document.getElementById('btnReconnect');
    const reconnectIcon = document.getElementById('reconnectIcon');

    if (!overlay) return; // segurança caso o DOM não esteja pronto

    // --- Utilitários de UI ---
    function setStatus(state, text) {
        statusText.textContent = text;
        statusDot.className = 'offline-status-dot' + (state === 'online' ? ' is-online' : state === 'checking' ? ' is-checking' : '');
        iconWrap.className = 'offline-icon-wrap' + (state === 'online' ? ' is-online' : state === 'checking' ? ' is-checking' : '');

        if (state === 'online') {
            icon.className = 'fas fa-circle-check';
        } else if (state === 'checking') {
            icon.className = 'fas fa-rotate-right icon-spin';
        } else {
            icon.className = 'fas fa-triangle-exclamation';
        }
    }

    function setButtonLoading(loading) {
        btnReconnect.disabled = loading;
        if (loading) {
            reconnectIcon.className = 'fas fa-rotate-right icon-spin';
        } else {
            reconnectIcon.className = 'fas fa-rotate-right';
        }
    }

    function showOfflineOverlay() {
        if (isOverlayVisible) return;
        isOverlayVisible = true;
        overlay.style.display = 'flex';

        icon.className = 'fas fa-triangle-exclamation';
        setStatus('offline', navigator.onLine ? 'Servidor inacessível' : 'Sem internet');
        setButtonLoading(false);
    }

    function hideOfflineOverlay() {
        if (!isOverlayVisible) return;
        isOverlayVisible = false;

        setStatus('online', 'Conectado!');
        setButtonLoading(false);

        // Animação de saída suave
        overlay.style.transition = 'opacity 0.4s ease';
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.style.display = 'none';
            overlay.style.opacity = '';
            overlay.style.transition = '';
        }, 420);
    }

    // --- Listener do Firebase .info/connected ---
    function setupFirebaseListener() {
        if (firebaseListenerSetup) return;

        const db       = window.firebaseDatabase;
        const refFn    = window.firebaseRef;
        const onValFn  = window.firebaseOnValue;

        if (!db || !refFn || !onValFn) {
            // Firebase ainda não carregou; aguarda
            setTimeout(setupFirebaseListener, 600);
            return;
        }

        firebaseListenerSetup = true;

        try {
            const connectedRef = refFn(db, '.info/connected');
            onValFn(connectedRef, (snap) => {
                if (snap.val() === true) {
                    wasEverConnected = true;
                    reconnectAttempts = 0;
                    hideOfflineOverlay();
                } else {
                    // Firebase desconectado — só exibe overlay se já houve conexão antes,
                    // evitando falso-positivo no carregamento inicial.
                    // NÃO exibe quando a desconexão foi intencional (connection-manager:
                    // aba em background / inatividade) — senão o overlay pisca à toa.
                    if (wasEverConnected && !window._intentionalOffline) {
                        showOfflineOverlay();
                    }
                }
            });
        } catch (e) {
            // Silencia erros de inicialização; o listener de browser continuará funcionando
        }
    }

    // --- Listeners do browser ---
    window.addEventListener('offline', () => {
        showOfflineOverlay();
    });

    window.addEventListener('online', () => {
        // Browser voltou; tenta reconectar o Firebase automaticamente
        if (isOverlayVisible) {
            setStatus('checking', 'Reconectando...');
        }
        triggerFirebaseReconnect();
    });

    // --- Reconexão pelo Firebase ---
    function triggerFirebaseReconnect() {
        if (!window.firebaseGoOnline) return;
        try {
            window.firebaseGoOnline();
        } catch (e) {
            // silencia
        }
    }

    // --- Ação do botão Reconectar ---
    window.reconnectApp = function () {
        if (!navigator.onLine) {
            setStatus('offline', 'Sem internet — verifique sua conexão');
            setButtonLoading(false);
            return;
        }

        reconnectAttempts++;
        setStatus('checking', 'Reconectando...');
        setButtonLoading(true);

        // Força o Firebase a reconectar
        triggerFirebaseReconnect();

        // Fallback: se após 6s ainda sem resposta, sugere recarregar
        clearTimeout(reconnectDebounce);
        reconnectDebounce = setTimeout(() => {
            if (isOverlayVisible) {
                setStatus('offline', 'Servidor não respondeu');
                setButtonLoading(false);

                if (reconnectAttempts >= 3) {
                    // Após 3 tentativas, oferece reload da página
                    btnReconnect.innerHTML = '<i class="fas fa-arrows-rotate"></i> <span>Recarregar página</span>';
                    btnReconnect.onclick = () => location.reload();
                }
            }
        }, 6000);
    };

    // Exposto para ser ligado APÓS o login (economia de conexões): antes de logar,
    // não abrimos socket ao RTDB via .info/connected — evita que bots, preview de
    // link e abas paradas na tela de login contem como conexão simultânea.
    window.setupOfflineDetection = setupFirebaseListener;

    // --- Verificação inicial ao carregar a página ---
    function initialCheck() {
        if (!navigator.onLine) {
            // Já começou sem internet
            showOfflineOverlay();
            setStatus('offline', 'Sem internet');
        }
        // NÃO inicia o listener .info/connected aqui: ele é ligado no login
        // (window.setupOfflineDetection) para não abrir conexão antes de logar.
    }

    // Inicia após o DOM estar pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialCheck);
    } else {
        initialCheck();
    }
})();
