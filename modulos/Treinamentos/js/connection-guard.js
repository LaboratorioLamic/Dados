// Guarda de conexão: enquanto o navegador ou o Realtime Database estiverem
// offline, um overlay cobre a página inteira e bloqueia qualquer interação.
//
// Por que isso existe: o SDK do Firebase serve leituras do cache em memória e
// enfileira escritas quando não há rede. Sem esta guarda o site continuava
// "funcionando" offline — mostrando números velhos das Configurações e
// aceitando envios que só chegariam ao servidor muito depois, sem aviso. Para
// um painel administrativo isso é pior que uma falha visível: o administrador
// toma decisão sobre dado que não é o dado atual.
//
// A verdade sobre a conexão vem de /.info/connected (o próprio RTDB), com
// navigator.onLine como sinal auxiliar — o navegador sabe na hora que o cabo
// caiu, enquanto o socket do Firebase leva alguns segundos para perceber.
(function () {
    var U = window.UniAdmin;
    if (!U || !U.db) return;

    // Tolerância antes de acusar queda: quedas de um piscar de olhos (troca de
    // torre de celular, wi-fi reassociando) não devem jogar um overlay na cara
    // de quem está no meio de uma avaliação.
    var OFFLINE_GRACE_MS = 2500;

    var overlay = null;
    var offlineTimer = null;
    var isBlocked = false;
    var dbConnected = null; // null enquanto o primeiro evento não chega
    var wentOfflineAt = 0;

    function buildOverlay() {
        var el = document.createElement('div');
        el.id = 'connection-overlay';
        el.setAttribute('role', 'alertdialog');
        el.setAttribute('aria-modal', 'true');
        el.setAttribute('aria-live', 'assertive');
        el.setAttribute('aria-label', 'Sem conexão. Reconectando.');
        el.innerHTML = ''
            + '<div class="connection-overlay-card">'
            + '  <div class="connection-overlay-spinner" aria-hidden="true"></div>'
            + '  <h2>Reconectando…</h2>'
            + '  <p>Você está sem conexão com o servidor. Para não exibir informações'
            + '  desatualizadas, o site fica bloqueado até a conexão voltar.</p>'
            + '  <p class="connection-overlay-hint">A liberação é automática — não é'
            + '  preciso recarregar a página.</p>'
            + '</div>';
        return el;
    }

    // Enquanto bloqueado, nenhum evento de interação chega à página. O overlay
    // sozinho (só visual) não impediria atalhos de teclado nem cliques em
    // elementos com z-index maior, então os eventos são interceptados na fase
    // de captura, no topo da árvore.
    var BLOCKED_EVENTS = ['click', 'mousedown', 'mouseup', 'keydown', 'keypress',
                          'keyup', 'submit', 'touchstart', 'wheel'];

    function swallowEvent(event) {
        if (!isBlocked) return;
        if (overlay && overlay.contains(event.target)) return;
        event.stopImmediatePropagation();
        event.preventDefault();
    }

    function block() {
        if (isBlocked) return;
        isBlocked = true;
        wentOfflineAt = Date.now();
        if (!overlay) overlay = buildOverlay();
        if (!overlay.isConnected) document.body.appendChild(overlay);
        // Força reflow antes da classe para a transição de opacidade rodar.
        void overlay.offsetWidth;
        overlay.classList.add('is-visible');
        document.body.classList.add('is-connection-blocked');
        BLOCKED_EVENTS.forEach(function (type) {
            document.addEventListener(type, swallowEvent, true);
        });
        document.dispatchEvent(new CustomEvent('uniadmin:connection-lost'));
    }

    function unblock() {
        if (!isBlocked) return;
        isBlocked = false;
        var downtimeMs = Date.now() - wentOfflineAt;
        if (overlay) overlay.classList.remove('is-visible');
        document.body.classList.remove('is-connection-blocked');
        BLOCKED_EVENTS.forEach(function (type) {
            document.removeEventListener(type, swallowEvent, true);
        });
        // Quem estava na tela leu dados de antes da queda. Avisa a aplicação
        // para refazer as leituras: as Configurações recarregam sozinhas em
        // vez de deixar o administrador olhando números de minutos atrás.
        document.dispatchEvent(new CustomEvent('uniadmin:connection-restored', {
            detail: { downtimeMs: downtimeMs }
        }));
    }

    // Só bloqueia depois da carência, e só quando os dois sinais concordam que
    // não há conexão utilizável.
    function evaluate() {
        var online = navigator.onLine !== false && dbConnected !== false;
        if (online) {
            clearTimeout(offlineTimer);
            offlineTimer = null;
            unblock();
            return;
        }
        if (isBlocked || offlineTimer) return;
        offlineTimer = setTimeout(function () {
            offlineTimer = null;
            if (navigator.onLine === false || dbConnected === false) block();
        }, OFFLINE_GRACE_MS);
    }

    U.db.ref('.info/connected').on('value', function (snapshot) {
        dbConnected = snapshot.val() === true;
        evaluate();
    });

    // Se o socket nunca chegar a abrir, /.info/connected não emite `false` —
    // simplesmente não emite nada, e dbConnected fica em `null` para sempre.
    // Sem este prazo a página seguiria liberada, sem dado e sem aviso, que é
    // exatamente o estado que esta guarda existe para não deixar acontecer.
    var FIRST_CONNECT_DEADLINE_MS = 8000;
    setTimeout(function () {
        if (dbConnected === null) { dbConnected = false; evaluate(); }
    }, FIRST_CONNECT_DEADLINE_MS);

    window.addEventListener('online', evaluate);
    window.addEventListener('offline', evaluate);

    // A aba volta do segundo plano com dados possivelmente parados há horas —
    // o mesmo tratamento de uma reconexão.
    //
    // Mas só depois de um tempo real fora. Antes o evento saía a CADA foco da
    // aba: um Alt-Tab derrubava o cache do Histórico e fazia o Dashboard
    // rebaixar a base inteira (~4 MB), sem nada ter mudado. Enquanto a aba
    // está aberta os listeners ao vivo já mantêm tudo em dia — o refetch só
    // se justifica quando a aba ficou escondida tempo suficiente para que
    // esses listeners tenham sido estrangulados pelo navegador.
    var STALE_AFTER_HIDDEN_MS = 5 * 60 * 1000;
    var hiddenSince = 0;

    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState !== 'visible') { hiddenSince = Date.now(); return; }
        var hiddenMs = hiddenSince ? Date.now() - hiddenSince : 0;
        hiddenSince = 0;
        evaluate();
        if (isBlocked) return;
        if (hiddenMs < STALE_AFTER_HIDDEN_MS) return;
        document.dispatchEvent(new CustomEvent('uniadmin:connection-restored', {
            detail: { downtimeMs: hiddenMs, reason: 'visibility' }
        }));
    });

    U.Connection = {
        isOnline: function () { return !isBlocked; },
        // Portão para gravações: recusa de imediato quando não há conexão, em
        // vez de deixar o Firebase enfileirar a escrita e a interface dizer
        // "salvo" para algo que não saiu daqui.
        assertOnline: function () {
            if (isBlocked || navigator.onLine === false || dbConnected === false) {
                throw new Error('Sem conexão com o servidor. Aguarde a reconexão e tente novamente.');
            }
        }
    };
})();
