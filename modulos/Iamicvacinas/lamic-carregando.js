/* Carregamento padrão dos módulos do Dados LAMIC.
 * Cobre a tela com o mesmo círculo de carregamento do portal enquanto a sessão do
 * Dados LAMIC é validada. Copie este arquivo igual em cada módulo.
 *
 * Uso: <script src="lamic-carregando.js" data-espera="#seletor"></script> logo após <body>.
 *  - data-espera: elemento que mostra o estado da validação ("Verificando…", "Conectando…").
 *    O carregamento some quando esse elemento, depois de visto validando, some, fica oculto
 *    ou troca de texto (ex.: mensagem de "sem acesso").
 *  - data-nome: nome do módulo mostrado abaixo do círculo.
 *  - Sem data-espera, o módulo chama window.LamicCarregando.fim().
 *  - Some sozinho após 25 s, para nunca travar a tela.
 */
(function () {
  if (window.LamicCarregando) return;
  var script = document.currentScript;
  var espera = script && script.getAttribute('data-espera');
  // nome do módulo abaixo do círculo (data-nome; sem ele, o título da página)
  var nome = (script && script.getAttribute('data-nome')) || document.title || 'Lamic';
  var VALIDANDO = /verificando|conectando|carregando/i;
  var LOGO = 'assents/circulo.png';   // cópia local do logo do Dados LAMIC

  var css = document.createElement('style');
  css.textContent =
    '#lamic-carregando{position:fixed;inset:0;z-index:2147483000;background:#162036;display:grid;place-items:center;transition:opacity .4s!important;transition-duration:.4s!important;font-family:"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}' +
    '#lamic-carregando.fora{opacity:0;pointer-events:none}' +
    '#lamic-carregando .lc-box{text-align:center;color:#fff}' +
    '#lamic-carregando .lc-circ{width:96px;height:96px;border-radius:50%;background:#fff url(' + LOGO + ') center/72% no-repeat;position:relative;margin:0 auto 14px}' +
    '#lamic-carregando .lc-circ::after{content:"";position:absolute;inset:-8px;border-radius:50%;border:3px solid transparent;border-top-color:#2AA7BE;animation:lcGira 1s linear infinite!important;animation-duration:1s!important}' +
    '#lamic-carregando strong{font-size:16px}' +
    '#lamic-carregando small{letter-spacing:.2em;text-transform:uppercase;opacity:.7;font-size:11px}' +
    '@keyframes lcGira{to{transform:rotate(360deg)}}';
  var el = document.createElement('div');
  el.id = 'lamic-carregando';
  el.setAttribute('role', 'status');
  el.innerHTML = '<div class="lc-box"><div class="lc-circ"></div><strong class="lc-nome"></strong><br><small>carregando</small></div>';
  el.querySelector('.lc-nome').textContent = nome;
  (document.head || document.documentElement).appendChild(css);
  (document.body || document.documentElement).appendChild(el);

  var acabou = false, timer, vigia;
  function fim() {
    if (acabou) return;
    acabou = true;
    clearInterval(vigia); clearTimeout(timer);
    el.classList.add('fora');
    setTimeout(function () { el.remove(); css.remove(); }, 450);
  }
  window.LamicCarregando = { fim: fim };
  timer = setTimeout(fim, 25000);

  if (espera) {
    var visto = false;
    vigia = setInterval(function () {
      var alvo = document.querySelector(espera);
      var validando = !!alvo && alvo.getClientRects().length > 0 && VALIDANDO.test(alvo.textContent || '');
      if (validando) visto = true;
      // terminou: já foi visto validando, ou o texto já mudou (mensagem final)
      else if (visto || (alvo && !VALIDANDO.test(alvo.textContent || ''))) fim();
    }, 120);
  }
})();
