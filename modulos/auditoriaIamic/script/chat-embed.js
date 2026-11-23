// === BATE-PAPO NO DADOS LAMIC ===
// ?modo=chat  → a Auditoria vira só o painel de mensagens (janela flutuante do Dados LAMIC).
// Sem o modo  → quando aberta dentro do Dados, aceita pedidos para abrir um card citado no chat.
// Conversa com a página pai por postMessage { tipo: 'lamic-chat', acao, ... }, só na mesma origem.
(function () {
    const MODO_CHAT = new URLSearchParams(location.search).get('modo') === 'chat';
    // aberto como arquivo (file://): origem opaca, postMessage só aceita '*'
    const ARQUIVO = location.protocol === 'file:';
    const ORIGEM = ARQUIVO ? '*' : location.origin;
    const pai = window.parent !== window ? window.parent : null;
    const enviar = (acao, dados) => { if (pai) pai.postMessage({ tipo: 'lamic-chat', acao, ...(dados || {}) }, ORIGEM); };

    const logado = () => typeof currentuser !== 'undefined' && currentuser && typeof window.msgOpenDrawer === 'function';
    const semAcesso = () => { const t = document.getElementById('tela-dados'); return t && t.style.display === 'flex'; };

    function abrirCard(area, id) {
        if (typeof window._msgOpenCardOriginal === 'function') window._msgOpenCardOriginal(area, id);
        else if (typeof window.msgOpenCard === 'function') window.msgOpenCard(area, id);
    }

    // Pedidos da página pai
    window.addEventListener('message', (e) => {
        if ((!ARQUIVO && e.origin !== location.origin) || e.source !== pai) return;
        const d = e.data || {};
        if (d.tipo !== 'lamic-chat') return;
        if (d.acao === 'abrirCard' && !MODO_CHAT) abrirCard(d.area, d.id);
        if (d.acao === 'estado' && MODO_CHAT) marcarSino(!!d.notif, !!d.grande);
    });

    function marcarSino(notif, grande) {
        const s = document.getElementById('chatSinoBtn');
        if (s) { s.innerHTML = `<i class="fas ${notif ? 'fa-bell' : 'fa-bell-slash'}"></i>`; s.title = notif ? 'Avisos do navegador ligados' : 'Ligar avisos do navegador'; }
        const x = document.getElementById('chatExpandirBtn');
        if (x) { x.innerHTML = `<i class="fas ${grande ? 'fa-down-left-and-up-right-to-center' : 'fa-up-right-and-down-left-from-center'}"></i>`; x.title = grande ? 'Reduzir' : 'Expandir'; }
    }

    function modoChat() {
        const css = document.createElement('style');
        css.textContent = `
body.modo-chat{overflow:hidden}
body.modo-chat .msg-drawer{width:100vw!important;max-width:100vw;transform:none!important;border:0;box-shadow:none;z-index:1250;transition:none}
body.modo-chat .msg-backdrop{display:none!important}
body.modo-chat .msg-drawer-head{background:#162036}`;
        document.head.appendChild(css);
        document.body.classList.add('modo-chat');

        // Fechar do painel = minimizar a janela do Dados
        window.msgCloseDrawer = () => enviar('fechar');
        // Card citado: abre a Auditoria completa no Dados
        window._msgOpenCardOriginal = window.msgOpenCard;
        window.msgOpenCard = (area, id) => enviar('abrirCard', { area: String(area), id: String(id) });
        // Lembra a conversa aberta
        const abrirThread = window.msgOpenThread, voltar = window.msgBackToList;
        if (abrirThread) window.msgOpenThread = (id) => { abrirThread(id); enviar('thread', { id: String(id) }); };
        if (voltar) window.msgBackToList = () => { voltar(); enviar('thread', { id: '' }); };

        const acoes = document.querySelector('.msg-drawer-head-actions');
        const fechar = document.getElementById('msgCloseBtn');
        if (acoes && fechar) {
            fechar.innerHTML = '<i class="fas fa-minus"></i>';
            fechar.title = 'Minimizar';
            const mk = (id, acao) => {
                const b = document.createElement('button');
                b.className = 'msg-icon-btn'; b.id = id; b.type = 'button';
                b.onclick = () => enviar(acao);
                acoes.insertBefore(b, fechar);
            };
            mk('chatSinoBtn', 'notif');
            if (!window.matchMedia('(max-width: 640px)').matches) mk('chatExpandirBtn', 'expandir');
            marcarSino(false, false);
        }
    }

    // Espera a sessão do Dados ligar o usuário
    const inicio = Date.now();
    (function esperar() {
        if (semAcesso()) {
            const t = document.getElementById('tela-dados-msg');
            return enviar('erro', { msg: (t && t.textContent) || 'Sem acesso à Auditoria.' });
        }
        if (!logado()) {
            if (Date.now() - inicio > 120000) return enviar('erro', { msg: 'A Auditoria demorou para responder.' });
            return setTimeout(esperar, 200);
        }
        if (MODO_CHAT) {
            try { modoChat(); } catch (e) { console.error('[chat-embed]', e); document.body.classList.add('modo-chat'); }
            window.msgOpenDrawer();
            const t = new URLSearchParams(location.search).get('t');
            if (t && window.msgOpenThread) { try { window.msgOpenThread(t); } catch (_) {} }
            setTimeout(() => window.LamicCarregando && window.LamicCarregando.fim(), 0);
        } else {
            // Aberta em aba própria com ?abrir=area:id
            const ab = new URLSearchParams(location.search).get('abrir');
            if (ab && ab.includes(':')) { const i = ab.indexOf(':'); setTimeout(() => abrirCard(ab.slice(0, i), ab.slice(i + 1)), 600); }
        }
        enviar('pronto', { chat: MODO_CHAT });
    })();
})();
