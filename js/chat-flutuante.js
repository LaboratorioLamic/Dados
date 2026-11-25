/* Bate-papo flutuante — o mesmo chat da Auditoria, numa janela no canto inferior direito do Dados LAMIC.
 * A janela carrega a própria Auditoria em ?modo=chat (só no primeiro clique) e conversa por postMessage.
 * O contador de não lidas vem de uma leitura direta de auditoria/messages, com a mesma regra do chat.
 * Some dentro dos módulos (a Auditoria já tem o chat dela) e para quem não tem acesso à Auditoria.
 */
(() => {
  'use strict';
  const CH = 'lamic_chat';
  // aberto como arquivo (file://): frames têm origem opaca; só dá para conversar por postMessage com '*'
  const ARQUIVO = location.protocol === 'file:';
  const ORIGEM = ARQUIVO ? '*' : location.origin;
  const ler = () => { try { return JSON.parse(localStorage.getItem(CH)) || {}; } catch { return {}; } };
  const gravar = (p) => { try { localStorage.setItem(CH, JSON.stringify({ ...ler(), ...p })); } catch {} };
  const $ = (s, r = document) => r.querySelector(s);

  let raiz = null, iframe = null, link = null, aberto = false, pronto = false, timer = null;
  let meuId = null, offMsgs = null, ultimoTotal = null, cardPendente = null;
  let audio = null, totalAtual = 0;

  // Dentro de um sistema aberto (iframe), o balão só aparece com mensagem não lida,
  // com o botão home ativo ou com a janela do chat aberta.
  function visibilidade() {
    if (!raiz) return;
    const home = !!document.querySelector('#viewer .vhome.on');
    raiz.classList.toggle('cf-sistema', sistemaAberto());
    raiz.classList.toggle('cf-mostra', totalAtual > 0 || home || aberto);
  }
  // Ao abrir um sistema (iframe), o chat aberto minimiza e o balão some (volta só com mensagem não lida)
  // sistema aberto = #viewer à vista (lat-viewer só marca a lateral suspensa pelo botão home)
  const sistemaAberto = () => { const v = document.getElementById('viewer'); return !!v && !v.hidden; };
  let noViewer = false;
  function aoMudarTela() {
    const agora = sistemaAberto();
    if (agora && !noViewer && aberto) minimizar();
    noViewer = agora;
    visibilidade();
  }
  new MutationObserver(aoMudarTela).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'id', 'hidden'] });

  function css() {
    if ($('#cf-css')) return;
    const st = document.createElement('style');
    st.id = 'cf-css';
    st.textContent = `
.cf-fab{position:fixed;right:22px;bottom:22px;z-index:190;width:58px;height:58px;border-radius:50%;border:0;cursor:pointer;
  background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;font-size:24px;display:grid;place-items:center;
  box-shadow:0 10px 28px rgba(37,99,235,.42),0 2px 6px rgba(0,0,0,.18);transition:transform .18s,box-shadow .18s}
.cf-fab:hover{transform:translateY(-2px) scale(1.04);box-shadow:0 14px 34px rgba(37,99,235,.5),0 2px 6px rgba(0,0,0,.2)}
.cf-fab:focus-visible{outline:3px solid #93c5fd;outline-offset:3px}
.cf-fab.cf-pulsa{animation:cfPulsa .9s ease 2}
@keyframes cfPulsa{0%,100%{transform:scale(1)}40%{transform:scale(1.14)}70%{transform:scale(.96)}}
.cf-badge{position:absolute;top:-3px;right:-3px;min-width:22px;height:22px;padding:0 6px;border-radius:11px;background:#ef4444;color:#fff;
  font:700 12px/22px "DM Sans",system-ui,sans-serif;text-align:center;border:2px solid #fff;box-sizing:border-box}
.cf-badge[hidden]{display:none}
.cf-win{position:fixed;right:22px;bottom:92px;z-index:191;width:min(440px,calc(100vw - 44px));height:min(720px,calc(100dvh - 116px));border-radius:16px;overflow:hidden;
  background:#fff;box-shadow:0 24px 60px rgba(22,32,54,.32),0 4px 14px rgba(22,32,54,.16);border:1px solid rgba(22,32,54,.08);
  transform-origin:bottom right;transition:opacity .2s,transform .2s,width .25s,height .25s}
.cf-win.cf-oculta{opacity:0;transform:translateY(14px) scale(.96);pointer-events:none;visibility:hidden;transition:opacity .2s,transform .2s,visibility 0s .2s}
.cf-win.cf-grande{width:min(820px,calc(100vw - 44px));height:calc(100dvh - 116px)}
/* reunião/card aberto dentro do chat: janela quase tela cheia para dar para interagir */
.cf-win.cf-foco{width:min(1180px,calc(100vw - 44px));height:calc(100dvh - 116px)}
.cf-win iframe{width:100%;height:100%;border:0;display:block}
.cf-cobre{position:absolute;inset:0;background:#162036;color:#fff;display:grid;place-items:center;text-align:center;font-family:"DM Sans",system-ui,sans-serif;padding:24px}
.cf-cobre[hidden]{display:none}
.cf-circ{width:84px;height:84px;border-radius:50%;background:#fff url(assents/circulo.png) center/72% no-repeat;position:relative;margin:0 auto 14px}
.cf-circ::after{content:"";position:absolute;inset:-8px;border-radius:50%;border:3px solid transparent;border-top-color:#2AA7BE;animation:cfGira 1s linear infinite}
@keyframes cfGira{to{transform:rotate(360deg)}}
.cf-cobre strong{display:block;font-size:15px}
.cf-cobre small{letter-spacing:.2em;text-transform:uppercase;opacity:.7;font-size:11px}
.cf-cobre p{font-size:14px;color:#c7d2fe;margin:10px 0 18px}
.cf-cobre button{border:0;border-radius:10px;padding:10px 18px;font:600 14px "DM Sans",system-ui,sans-serif;cursor:pointer;margin:0 4px}
.cf-cobre .cf-tentar{background:#2563eb;color:#fff}
.cf-cobre .cf-x{background:rgba(255,255,255,.12);color:#fff}
#chat-flutuante.cf-espera .cf-fab::after{content:"";position:absolute;inset:-4px;border-radius:50%;border:2px solid transparent;border-top-color:rgba(37,99,235,.55);animation:cfGira 1.1s linear infinite;pointer-events:none}
#chat-flutuante.cf-sistema:not(.cf-mostra) .cf-fab,#chat-flutuante.cf-sistema:not(.cf-mostra) .cf-win{display:none}
@media (max-width:640px){
  .cf-fab{right:16px;bottom:84px;width:54px;height:54px;font-size:22px}
  .cf-win,.cf-win.cf-grande,.cf-win.cf-foco{right:0;bottom:0;width:100vw;height:100dvh;border-radius:0;border:0}
}`;
    document.head.appendChild(st);
  }

  // ---------- janela ----------
  function montar() {
    if (raiz) return;
    css();
    raiz = document.createElement('div');
    raiz.id = 'chat-flutuante';
    raiz.className = 'cf-espera';   // anel girando no balão enquanto o chat carrega em segundo plano
    raiz.innerHTML = `<div class="cf-win cf-oculta" role="dialog" aria-label="Bate-papo"></div>
      <button class="cf-fab" type="button" title="Bate-papo" aria-label="Abrir bate-papo"><i class="fas fa-comment-dots"></i><span class="cf-badge" hidden>0</span></button>`;
    document.body.appendChild(raiz);
    $('.cf-fab', raiz).onclick = () => (aberto ? minimizar() : abrir());
    if (ler().grande) $('.cf-win', raiz).classList.add('cf-grande');
    if (ler().aberto) abrir();
  }

  function desmontar() {
    clearTimeout(timer);
    if (offMsgs) { offMsgs(); offMsgs = null; }
    raiz?.remove();
    raiz = iframe = link = null; aberto = pronto = false; meuId = null; ultimoTotal = null; cardPendente = null;
  }

  function cobrir(html) {
    const win = $('.cf-win', raiz);
    let c = $('.cf-cobre', win);
    if (!c) { c = document.createElement('div'); c.className = 'cf-cobre'; win.appendChild(c); }
    c.hidden = !html;
    if (html) c.innerHTML = html;
    return c;
  }
  const carregando = () => cobrir('<div><div class="cf-circ"></div><strong>Bate-papo</strong><small>Carregando</small></div>');
  // Sem permissão na Auditoria (link, grupo ou usuário inativo): o chat não existe para a pessoa
  function semAcesso() { clearTimeout(timer); desmontar(); }
  function falha(msg) {
    raiz?.classList.remove('cf-espera');   // erro técnico: mostra o balão para dar "Tentar de novo"
    clearTimeout(timer);
    const c = cobrir(`<div><i class="fas fa-comment-slash" style="font-size:34px;opacity:.8"></i>
      <strong style="margin-top:12px">Não foi possível abrir o bate-papo</strong><p></p>
      <button class="cf-tentar" type="button">Tentar de novo</button><button class="cf-x" type="button">Fechar</button></div>`);
    $('p', c).textContent = msg || 'Verifique a conexão e tente de novo.';
    $('.cf-tentar', c).onclick = () => { iframe?.remove(); iframe = null; carregar(); };
    $('.cf-x', c).onclick = minimizar;
  }

  function carregar() {
    if (iframe) return;
    const win = $('.cf-win', raiz);
    const u = new URL(link.chat || link.url);
    u.searchParams.set('modo', 'chat');
    const t = ler().t;
    if (t) u.searchParams.set('t', t);
    iframe = document.createElement('iframe');
    iframe.title = 'Bate-papo';
    iframe.src = u.href;
    pronto = false;
    win.prepend(iframe);
    carregando();
    clearTimeout(timer);
    vigiar(Date.now());
  }

  // Confere a Auditoria direto (mesma origem), sem depender só do postMessage.
  function vigiar(inicio) {
    clearTimeout(timer);
    if (pronto || !iframe) return;
    let cw = null;
    try { cw = iframe.contentWindow; void cw.document; } catch {
      cw = null;
      if (!ARQUIVO && Date.now() - inicio > 6000) return falha('A Auditoria abriu em outro endereço (origem diferente do portal) e não pode ser ligada ao bate-papo.');
    }
    // about:blank inicial do iframe também fica 'complete': só confere depois que a Auditoria começou a carregar
    const carregou = (() => { try { return cw && /auditoriaIamic/i.test(cw.location.href); } catch { return false; } })();
    if (carregou && cw.document.readyState !== 'loading') {
      const doc = cw.document;
      const tela = doc.getElementById('tela-dados');
      if (tela && tela.style.display === 'flex')
        return semAcesso();
      if (doc.body && doc.body.classList.contains('modo-chat')) return marcarPronto();
      if (doc.readyState === 'complete' && !doc.querySelector('script[src*="chat-embed"]'))
        return falha('A Auditoria publicada ainda não tem o bate-papo. Publique (push) a versão nova da Auditoria.');
      const logado = (() => { try { return !!cw.eval('typeof currentuser !== "undefined" && currentuser'); } catch { return false; } })();
      if (logado && typeof cw.msgOpenDrawer === 'function' && Date.now() - inicio > 8000 && !doc.body.classList.contains('modo-chat'))
        return falha('A Auditoria entrou, mas o modo bate-papo não iniciou (script/chat-embed.js). Veja o console (F12).');
    }
    // etapa atual embaixo do círculo (ajuda a achar onde trava)
    try {
      const sm = raiz && raiz.querySelector('.cf-cobre small');
      if (sm) {
        let etapa = 'Abrindo';
        if (carregou) {
          etapa = !cw.firebaseDatabase ? 'Conectando' : !cw.dadosUsuario ? 'Conectando' : 'Entrando';
          if (cw.eval('typeof currentuser !== "undefined" && !!currentuser')) etapa = 'Montando o chat';
        }
        sm.textContent = `${etapa} · ${Math.round((Date.now() - inicio) / 1000)}s`;
      }
    } catch {}
    if (Date.now() - inicio > 90000) return falha('A Auditoria demorou para responder. Verifique a conexão.');
    timer = setTimeout(() => vigiar(inicio), 400);
  }
  function marcarPronto() {
    if (pronto) return;
    pronto = true; clearTimeout(timer); cobrir(''); raiz.classList.remove('cf-espera'); enviarEstado(); if (!offMsgs) ouvirContador();
  }

  function abrir() {
    if (!raiz || !link) return;
    destravarSom();
    carregar();
    aberto = true;
    visibilidade();
    $('.cf-win', raiz).classList.remove('cf-oculta');
    $('.cf-fab', raiz).setAttribute('aria-label', 'Minimizar bate-papo');
    gravar({ aberto: true });
    enviarEstado();
    setTimeout(() => iframe?.focus(), 220);
  }

  function minimizar() {
    if (!raiz) return;
    aberto = false;
    visibilidade();
    $('.cf-win', raiz).classList.add('cf-oculta');
    $('.cf-fab', raiz).setAttribute('aria-label', 'Abrir bate-papo');
    gravar({ aberto: false });
  }

  function expandir() {
    const g = $('.cf-win', raiz).classList.toggle('cf-grande');
    gravar({ grande: g });
    enviarEstado();
  }

  const notifLigada = () => ler().notif === true && 'Notification' in window && Notification.permission === 'granted';
  async function alternarNotif() {
    if (!('Notification' in window)) return window.alert('Este navegador não mostra avisos.');
    if (notifLigada()) gravar({ notif: false });
    else {
      const p = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
      if (p !== 'granted') window.alert('Os avisos estão bloqueados no navegador. Libere nas configurações do site para usar.');
      gravar({ notif: p === 'granted' });
    }
    enviarEstado();
  }
  function enviarEstado() {
    if (pronto && iframe?.contentWindow)
      iframe.contentWindow.postMessage({ tipo: 'lamic-chat', acao: 'estado', notif: notifLigada(), grande: $('.cf-win', raiz).classList.contains('cf-grande') }, ORIGEM);
  }

  // Card citado no chat: abre a Auditoria completa já nele
  function abrirCard(area, id) {
    minimizar();
    if (link.modo !== 'iframe') {
      const u = new URL(link.url); u.searchParams.set('abrir', `${area}:${id}`);
      return window.open(u.href, '_blank', 'noopener');
    }
    window.LamicPortal.abrirViewer(link.url, link.nome);
    const f = window.LamicPortal.iframeDe(link.url);
    cardPendente = { area, id, f };
    if (f && f.dataset.lamicPronto === '1') entregarCard();
  }
  function entregarCard() {
    const c = cardPendente;
    if (!c?.f?.contentWindow) return;
    c.f.contentWindow.postMessage({ tipo: 'lamic-chat', acao: 'abrirCard', area: c.area, id: c.id }, ORIGEM);
    cardPendente = null;
  }

  window.addEventListener('message', (e) => {
    if (!ARQUIVO && e.origin !== location.origin) return;
    const d = e.data || {};
    if (d.tipo !== 'lamic-chat' || !raiz) return;
    // Auditoria completa aberta no portal
    const fv = link && window.LamicPortal.iframeDe(link.url);
    if (fv && e.source === fv.contentWindow) {
      if (d.acao === 'pronto') { fv.dataset.lamicPronto = '1'; if (cardPendente) { cardPendente.f = fv; entregarCard(); } }
      return;
    }
    if (!iframe || e.source !== iframe.contentWindow) return;
    if (d.acao === 'pronto') marcarPronto();
    else if (d.acao === 'erro') { if (/acesso|inativ|desativ|cadastro/i.test(d.msg || '')) semAcesso(); else falha(d.msg); }
    else if (d.acao === 'fechar') minimizar();
    else if (d.acao === 'expandir') expandir();
    else if (d.acao === 'foco') $('.cf-win', raiz).classList.toggle('cf-foco', !!d.on);
    else if (d.acao === 'notif') alternarNotif();
    else if (d.acao === 'thread') gravar({ t: d.id || '' });
    else if (d.acao === 'abrirCard') abrirCard(d.area, d.id);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && aberto && !document.querySelector('.modal-bg, .modal')) minimizar();
  });

  // ---------- não lidas (mesma regra do chat da Auditoria) ----------
  function naoLidas(t) {
    const nivel = (t.mutedBy && t.mutedBy[meuId]) || 'todas';
    if (nivel === 'mudo') return [];
    const visto = (t.lidoPor && t.lidoPor[meuId]) || 0;
    return Object.values(t.mensagens || {}).filter((m) => m && !m.sistema && (m.createdAt || 0) > visto
      && String(m.autor && m.autor.id) !== meuId
      && (nivel !== 'mencoes' || (Array.isArray(m.mencoes) && m.mencoes.some((id) => String(id) === meuId))));
  }

  function atualizarContador(threads) {
    let total = 0, ultima = null;
    for (const t of Object.values(threads || {})) {
      if (!t || !Array.isArray(t.participants) || !t.participants.some((p) => String(p) === meuId)) continue;
      const ms = naoLidas(t);
      total += ms.length;
      for (const m of ms) if (!ultima || (m.createdAt || 0) > (ultima.createdAt || 0)) ultima = m;
    }
    const b = raiz && $('.cf-badge', raiz);
    if (!b) return;
    b.hidden = total === 0;
    totalAtual = total;
    visibilidade();
    b.textContent = total > 99 ? '99+' : String(total);
    $('.cf-fab', raiz).title = total ? `Bate-papo · ${total} não lida${total > 1 ? 's' : ''}` : 'Bate-papo';
    if (ultimoTotal !== null && total > ultimoTotal) chegou(ultima);
    ultimoTotal = total;
  }

  function chegou(m) {
    const fab = $('.cf-fab', raiz);
    fab.classList.remove('cf-pulsa'); void fab.offsetWidth; fab.classList.add('cf-pulsa');
    if (aberto && !document.hidden) return;   // janela à vista: o próprio chat mostra
    tocar();
    if (notifLigada() && document.hidden) {
      try {
        const n = new Notification(m?.autor?.name ? `${m.autor.name} no bate-papo` : 'Nova mensagem no bate-papo',
          { body: String(m?.texto || '').slice(0, 120) || 'Você tem mensagem nova.', icon: 'assents/circulo.png', tag: 'lamic-chat' });
        n.onclick = () => { window.focus(); abrir(); n.close(); };
      } catch {}
    }
  }

  function destravarSom() {
    if (audio) return;
    try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch { audio = null; }
  }
  function tocar() {
    if (!audio || audio.state !== 'running') return;
    const t = audio.currentTime;
    [[660, 0], [880, 0.11]].forEach(([f, d]) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(0.12, t + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.18);
      o.connect(g).connect(audio.destination);
      o.start(t + d); o.stop(t + d + 0.2);
    });
  }
  document.addEventListener('pointerdown', () => { destravarSom(); audio?.state === 'suspended' && audio.resume().catch(() => {}); }, { once: false, passive: true });

  async function ouvirContador() {
    const db = window.LamicPortal.db(), me = window.LamicPortal.me();
    if (!db || !me || offMsgs) return;
    try {
      const snap = await db.ref('auditoria/passwords').once('value');
      const lista = Object.values(snap.val() || {});
      const eu = lista.find((u) => u && u.dadosLogin === me.login);
      if (!eu) return;   // ainda não entrou na Auditoria: o vínculo nasce no primeiro acesso
      meuId = String(eu.id || eu.user || '');
    } catch { return; }   // sem permissão de leitura: só o botão
    const ref = db.ref('auditoria/messages');
    const cb = (s) => atualizarContador(s.val());
    ref.on('value', cb, () => {});
    offMsgs = () => ref.off('value', cb);
  }

  // ---------- ciclo de vida (eventos do js/app.js) ----------
  window.addEventListener('lamic:pronto', () => {
    if (!window.LamicPortal) return;
    const l = window.LamicPortal.linkAuditoria();
    if (!l) return desmontar();                   // sem acesso à Auditoria
    if (raiz && link && link.url === l.url) return;
    desmontar();
    link = l;
    montar();
    ouvirContador();
    // Pré-carrega o chat em segundo plano (janela fechada), sem atrasar a abertura do portal
    const l0 = link;
    setTimeout(() => { if (raiz && link === l0 && !iframe) carregar(); }, 2500);
  });
  window.addEventListener('lamic:saiu', desmontar);
})();
