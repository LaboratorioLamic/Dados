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
        // area 'aba' → troca o módulo da Auditoria (ex.: agenda de reuniões)
        if (area === 'aba') return abrirAba(id);
        if (typeof window._msgOpenCardOriginal === 'function') window._msgOpenCardOriginal(area, id);
        else if (typeof window.msgOpenCard === 'function') window.msgOpenCard(area, id);
    }

    // Troca o módulo só depois do login e da aba inicial (na 1ª abertura a Auditoria
    // ainda escolhe a aba padrão depois do 'pronto' e sobrescreveria a troca).
    function abrirAba(id) {
        const ini = Date.now();
        let firmes = 0;
        (function tentar() {
            if (Date.now() - ini > 30000) return;
            const ok = typeof window.switchTab === 'function' && typeof currentuser !== 'undefined' && currentuser;
            if (ok && (typeof currentTab === 'undefined' || currentTab !== id)) {
                firmes = 0;
                try { window.switchTab(id); } catch (e) { console.error(e); }
            } else if (ok && ++firmes >= 6) return;   // ficou na aba por ~3s: pronto
            setTimeout(tentar, 500);
        })();
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
body.modo-chat .form-drawer-backdrop{z-index:1290!important}
body.modo-chat .form-drawer{z-index:1291!important}
body.modo-chat .msg-drawer-head{background:#162036;padding:12px 14px;gap:10px}
body.modo-chat .msg-drawer-head-title{min-width:0;flex:1}
body.modo-chat #msgDrawerTitle{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
body.modo-chat .msg-drawer-head-actions{flex-shrink:0}
body.modo-chat #msgCloseBtn{margin-right:0;margin-left:6px}
body.modo-chat #msgViewList{position:relative}
body.modo-chat #msgThreadList{padding-bottom:84px}
.chat-nova-fab{position:absolute;right:18px;bottom:18px;width:54px;height:54px;border-radius:50%;border:0;cursor:pointer;z-index:2;
  background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;font-size:20px;display:grid;place-items:center;
  box-shadow:0 10px 24px rgba(37,99,235,.4),0 2px 6px rgba(0,0,0,.15);transition:transform .15s,box-shadow .15s}
.chat-nova-fab:hover{transform:translateY(-2px) scale(1.05);box-shadow:0 14px 30px rgba(37,99,235,.5)}
.chat-nova-fab:focus-visible{outline:3px solid #93c5fd;outline-offset:3px}
body.modo-chat .msg-drawer-head .chat-fechar{background:#ef4444;color:#fff}
body.modo-chat .msg-drawer-head .chat-fechar:hover{background:#dc2626}
.chat-abas{display:flex;gap:2px;padding:6px 8px 0;background:#162036;flex-shrink:0;overflow-x:auto;scrollbar-width:none}
.chat-abas::-webkit-scrollbar{display:none}
.chat-aba{flex:1;min-width:0;display:flex;align-items:center;justify-content:center;gap:6px;padding:9px 8px;border:0;border-radius:10px 10px 0 0;
  background:transparent;color:rgba(255,255,255,.7);font:600 12.5px Inter,system-ui,sans-serif;cursor:pointer;white-space:nowrap;position:relative}
.chat-aba:hover{color:#fff;background:rgba(255,255,255,.08)}
.chat-aba.on{background:var(--card-bg);color:var(--text)}
.chat-aba-n{min-width:17px;height:17px;padding:0 5px;border-radius:9px;background:#ef4444;color:#fff;font-size:10.5px;line-height:17px;text-align:center}
.chat-aba-n:empty,.chat-aba-n[data-z="1"]{display:none}
body.chat-outra-aba .msg-view{display:none!important}
.chat-dock{flex:1;min-height:0;display:none;flex-direction:column;overflow:hidden;position:relative}
.chat-agenda-fab{display:none}
body.chat-aba-reu .chat-agenda-fab{display:flex!important}
body:has(.form-drawer.open) .chat-agenda-fab,body:has(#reuDrawer.open) .chat-agenda-fab{display:none!important}
.chat-agenda-fab{position:fixed;z-index:2147483000;right:18px;bottom:18px;width:54px;height:54px;border-radius:50%;border:0;cursor:pointer;
  align-items:center;justify-content:center;font-size:20px;color:#fff;background:#2563eb;box-shadow:0 6px 18px rgba(37,99,235,.4);transition:transform .15s,background .15s}
.chat-agenda-fab:hover{background:#1d4ed8;transform:scale(1.06)}
body.chat-aba-reu .reu-bell-body{padding-bottom:84px}
body.chat-outra-aba .chat-dock{display:flex}
.chat-dock>*{display:none!important}
.chat-dock>.chat-dock-on{display:flex!important;flex-direction:column;position:static!important;inset:auto!important;width:auto!important;max-width:none!important;
  max-height:none!important;height:100%!important;flex:1;min-height:0;border:0!important;border-radius:0!important;box-shadow:none!important;
  transform:none!important;opacity:1!important;visibility:visible!important;margin:0!important}
.chat-dock .notification-modal-header,.chat-dock .reu-bell-head{display:none!important}
.chat-dock .notification-modal-content,.chat-dock .reu-bell-body{flex:1;min-height:0;max-height:none!important;overflow-y:auto}`;
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
            fechar.innerHTML = '<i class="fas fa-xmark"></i>';
            fechar.title = 'Fechar'; fechar.classList.add('chat-fechar');
            const mk = (id, acao) => {
                const b = document.createElement('button');
                b.className = 'msg-icon-btn'; b.id = id; b.type = 'button';
                b.onclick = () => enviar(acao);
                acoes.insertBefore(b, fechar);
            };
            // (sem botão de ligar/desligar avisos: função removida)
            // o iframe tem só ~400px: a largura que importa é a da tela, não a do frame
            if ((screen.width || 1024) > 640) mk('chatExpandirBtn', 'expandir');
            marcarSino(false, false);
        }
        // Nova mensagem: botão redondo no canto inferior direito da lista (some ao abrir uma conversa,
        // pois mora dentro de #msgViewList, que só aparece no menu de conversas)
        const nova = document.getElementById('msgNewBtn'), lista = document.getElementById('msgViewList');
        if (nova && lista) {
            nova.className = 'chat-nova-fab';
            nova.innerHTML = '<i class="fas fa-pen-to-square"></i>';
            nova.setAttribute('aria-label', 'Nova mensagem');
            lista.appendChild(nova);
        }
        try { montarAbas(); } catch (e) { console.error('[chat-embed] abas', e); }
        vigiarFoco();
    }

    // ---------- Abas: Conversas · Reuniões · Notificações · Novos cards ----------
    // Reaproveita os painéis que a Auditoria já desenha (sino de reuniões, notificações, novos cards),
    // movendo-os para dentro da janela do chat.
    const ABAS = [
        { id: 'msgs', nome: 'Conversas', icone: 'fa-comments', badge: null },
        { id: 'reu', nome: 'Reuniões', icone: 'fa-calendar-check', badge: 'reuBellBadge', painel: 'reuBellPanel',
          abrir: () => { if (typeof window.reuToggleBell !== 'function' || !document.getElementById('reuBellContainer')) return false;
                         const p = document.getElementById('reuBellPanel'); if (p) p.classList.remove('open'); window.reuToggleBell(); return true; } },
        { id: 'notif', nome: 'Notificações', icone: 'fa-bell', badge: 'notificationBadge', painel: 'notificationModal',
          abrir: () => { const m = document.getElementById('notificationModal'); if (!m || typeof window.toggleNotificationModal !== 'function') return false;
                         m.classList.remove('active'); window.toggleNotificationModal(); return true; } },
        { id: 'novos', nome: 'Novos', icone: 'fa-envelope', badge: 'newCardsBadge', painel: 'newCardsModal',
          abrir: () => { const m = document.getElementById('newCardsModal'); if (!m || typeof window.toggleNewCardsModal !== 'function') return false;
                         m.classList.remove('active'); window.toggleNewCardsModal(); return true; } }
    ];
    let abaAtual = 'msgs';

    function montarAbas() {
        const drawer = document.getElementById('msgDrawer');
        const head = drawer && drawer.querySelector('.msg-drawer-head');
        if (!head || document.getElementById('chatAbas')) return;
        const barra = document.createElement('nav');
        barra.className = 'chat-abas'; barra.id = 'chatAbas'; barra.setAttribute('role', 'tablist');
        barra.innerHTML = ABAS.map((a) => `<button type="button" class="chat-aba${a.id === 'msgs' ? ' on' : ''}" data-aba="${a.id}" role="tab" title="${a.nome}">
            <i class="fas ${a.icone}"></i><span>${a.nome}</span><span class="chat-aba-n" data-z="1"></span></button>`).join('');
        head.after(barra);
        const dock = document.createElement('section');
        dock.className = 'chat-dock'; dock.id = 'chatDock';
        const fab = document.createElement('button');
        fab.type = 'button'; fab.className = 'chat-agenda-fab'; fab.title = 'Abrir agenda de reuniões na Auditoria';
        fab.innerHTML = '<i class="fas fa-calendar-days"></i>';
        fab.onclick = () => enviar('abrirCard', { area: 'aba', id: 'reunioes' });
        drawer.appendChild(dock);
        document.body.appendChild(fab);
        barra.addEventListener('click', (e) => { const b = e.target.closest('.chat-aba'); if (b) trocarAba(b.dataset.aba); });
        // contadores das abas espelham os do cabeçalho da Auditoria
        const espelhar = () => ABAS.forEach((a) => {
            if (!a.badge) return;
            const src = document.getElementById(a.badge), dst = barra.querySelector(`[data-aba="${a.id}"] .chat-aba-n`);
            if (!dst) return;
            const n = src && !src.classList.contains('hidden') && src.style.display !== 'none' ? (parseInt(src.textContent, 10) || 0) : 0;
            const txt = n > 99 ? '99+' : String(n), z = n ? '0' : '1';
            // só escreve se mudou: escrever sempre dispara o próprio observer (loop que travava a página)
            if (dst.textContent !== txt) dst.textContent = txt;
            if (dst.dataset.z !== z) dst.dataset.z = z;
        });
        espelhar();
        // observa só os contadores do cabeçalho da Auditoria, nunca a própria barra de abas
        let pend = false;
        const obs = new MutationObserver(() => { if (!pend) { pend = true; requestAnimationFrame(() => { pend = false; espelhar(); }); } });
        const ligar = () => ABAS.forEach((a) => { const el = a.badge && document.getElementById(a.badge);
            if (el && !el.dataset.chatObs) { el.dataset.chatObs = '1'; obs.observe(el, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] }); } });
        ligar();
        setInterval(() => { ligar(); espelhar(); }, 3000);   // badges criados depois (sino de reuniões)
    }

    function trocarAba(id) {
        const a = ABAS.find((x) => x.id === id) || ABAS[0];
        const dock = document.getElementById('chatDock');
        document.querySelectorAll('#chatAbas .chat-aba').forEach((b) => b.classList.toggle('on', b.dataset.aba === a.id));
        if (dock) dock.querySelectorAll('.chat-dock-on').forEach((p) => p.classList.remove('chat-dock-on'));
        document.body.classList.toggle('chat-aba-reu', a.id === 'reu');
        if (a.id === 'msgs') { abaAtual = 'msgs'; document.body.classList.remove('chat-outra-aba'); return; }
        if (!a.abrir()) { trocarAba('msgs'); return; }   // painel ainda não existe (Auditoria carregando)
        const p = document.getElementById(a.painel);
        if (!p || !dock) { trocarAba('msgs'); return; }
        if (p.parentNode !== dock) dock.appendChild(p);
        p.classList.add('chat-dock-on');
        abaAtual = a.id;
        document.body.classList.add('chat-outra-aba');
    }

    // ---------- Foco: reunião/card aberto dentro do chat pede a janela grande ----------
    const visivel = (el) => {
        if (!el) return false;
        const cs = getComputedStyle(el);
        return el.getClientRects().length > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.05;
    };
    function emFoco() {
        const reu = document.getElementById('reuDrawer');
        if (reu && reu.classList.contains('open')) return true;
        if (document.querySelector('.form-drawer.open')) return true;   // editar/criar card (lápis)
        return ['#viewModal', '.rnc-view-modal', '#reuFormModal', '.reu-form-modal'].some((s) => visivel(document.querySelector(s)));
    }
    function vigiarFoco() {
        let ultimo = false, agendado = false;
        const conferir = () => {
            agendado = false;
            const f = emFoco();
            if (f !== ultimo) { ultimo = f; enviar('foco', { on: f }); }
        };
        new MutationObserver(() => { if (!agendado) { agendado = true; requestAnimationFrame(conferir); } })
            .observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style'] });
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
