// ═══════════════════════════════════════════════════════════════
// tutorial.js — Central de treinamento: botão da barra do topo, painel
// de tutoriais e o passo a passo guiado (tela escurecida, só o local do
// clique liberado e legenda) — COMERCIAL LAMIC
// ═══════════════════════════════════════════════════════════════
//
// Os tutoriais (dados) ficam em tutoriais.js e estão descritos em Tutorial.md.
// Todo treinamento roda em modo simulação (simulacao.js).
//
// Passo: { alvo, titulo, texto, icone, cor?, dica?, acao: 'clique' | 'digitar' | 'ver',
//          valor?, esperar?, antes?, pular? }
//   alvo     seletor CSS, lista de seletores (vale o primeiro visível) ou função → elemento; sem alvo = cartão central
//   acao     clique: clicar no destaque avança · digitar: Enter ou Próximo avança · ver: só observar (destaque não clicável)
//   valor    digitar: sugestão (texto ou função → texto) que o botão "Preencher para mim" escreve no campo
//   avancaSe clique: função → true quando o clique deu certo (ex.: gaveta fechou ao salvar); senão o passo fica
//   esperar  seletor que precisa existir antes do passo começar (ex.: '#gaveta.open')
//   antes    função chamada ao entrar no passo (prepara a tela)
//   pular    função → true quando o passo não se aplica (o tutorial segue para o próximo)

const TUT_ESPERA = 6000;      // ms procurando o alvo antes de oferecer "Pular passo"
const TUT_PAD = 6;            // folga do destaque em volta do alvo

// Grupos do painel (ordem de exibição)
const TUT_MODULOS = {
  geral:      { nome: 'Primeiros passos',     icone: 'fa-compass',               cor: '#00a8cc' },
  inicio:     { nome: 'Início',               icone: 'fa-house',                 cor: '#0e7490' },
  exames:     { nome: 'Exames',               icone: 'fa-flask-vial',            cor: '#2a9d8f' },
  custos:     { nome: 'Custos',               icone: 'fa-boxes-stacked',         cor: '#e8913a' },
  tabelas:    { nome: 'Tabelas de Preço',     icone: 'fa-table-list',            cor: '#6366f1' },
  simulador:  { nome: 'Simulador',            icone: 'fa-chart-line',            cor: '#8b5cf6' },
  pendencias: { nome: 'Pendências',           icone: 'fa-triangle-exclamation',  cor: '#e63946' },
  instrucoes: { nome: 'Instruções',           icone: 'fa-book-medical',          cor: '#0e7490' },
  importar:   { nome: 'Importar / Exportar',  icone: 'fa-file-import',           cor: '#16a34a' },
  config:     { nome: 'Configurações',        icone: 'fa-gear',                  cor: '#64748b' }
};

// ── Permissão e progresso ─────────────────────────────────────
// requer: todas as permissões; permitido (opcional): regra extra, ex.: precisar de um OU outro módulo
const tutorialPermitido = t => (t.requer || []).every(([m, a = 'ver']) => pode(m, a)) && t.permitido?.() !== false;
const tutoriaisPermitidos = () => (typeof TUTORIAIS === 'undefined' ? [] : TUTORIAIS).filter(tutorialPermitido);
const _tutFeitoChave = () => `tutFeito:${usuarioAtual()?.id || ''}`;
function tutFeitos() { try { return JSON.parse(localStorage.getItem(_tutFeitoChave()) || '{}') || {}; } catch { return {}; } }
function marcarTutFeito(id) {
  const f = tutFeitos(); f[id] = Date.now();
  try { localStorage.setItem(_tutFeitoChave(), JSON.stringify(f)); } catch {}
}
const minutosTut = t => Math.max(1, Math.round(t.passos.length * 20 / 60));

// ── Botão e painel da barra do topo ───────────────────────────
let _tutAberto = false, _tutBusca = '';

function atualizarTutorialBtn() {
  const el = document.getElementById('tb-tutorial');
  if (!el) return;
  if (!usuarioAtual()) { el.innerHTML = ''; return; }
  const ts = tutoriaisPermitidos(), feitos = tutFeitos(), novos = ts.filter(t => !feitos[t.id]).length;
  el.innerHTML = `<div class="tut-menu ${_tutAberto ? 'open' : ''}" id="tut-menu">
      <button class="tut-btn" data-tut="tb-tutorial" onclick="event.stopPropagation();alternarTutoriais()" title="Central de treinamento" aria-haspopup="true" aria-expanded="${_tutAberto}">
        <i class="fa-solid fa-graduation-cap"></i><span>Tutorial</span>${novos && novos === ts.length ? '<b class="tut-novo"></b>' : ''}</button>
      <div class="tut-pan" id="tut-pan" onclick="event.stopPropagation()">${_tutAberto ? painelTutoriais() : ''}</div></div>`;
}

function alternarTutoriais() {
  const el = document.getElementById('tut-menu');
  if (!el) return;
  fecharPop();
  if (typeof fecharSino === 'function') fecharSino();
  _tutAberto = !_tutAberto;
  if (_tutAberto) { _tutBusca = ''; document.getElementById('tut-pan').innerHTML = painelTutoriais(); }
  el.classList.toggle('open', _tutAberto);
  el.querySelector('.tut-btn').setAttribute('aria-expanded', _tutAberto);
  if (_tutAberto) setTimeout(() => document.getElementById('tut-q')?.focus(), 60);
}
function fecharTutoriais() { if (_tutAberto) alternarTutoriais(); _tutAberto = false; }
document.addEventListener('click', fecharTutoriais);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && _tutAberto && !TUT.t) fecharTutoriais(); });

function painelTutoriais() {
  const ts = tutoriaisPermitidos(), feitos = tutFeitos(), nFeitos = ts.filter(t => feitos[t.id]).length;
  return `
    <div class="tut-h"><span class="tut-h-ic"><i class="fa-solid fa-graduation-cap"></i></span>
      <div><b>Central de treinamento</b><span>${ts.length} tutoriais para o seu acesso · ${nFeitos} concluído${nFeitos === 1 ? '' : 's'}</span></div>
      <button class="pop-x" onclick="fecharTutoriais()" title="Fechar"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="tut-prog-g" title="${nFeitos} de ${ts.length} concluídos"><span style="width:${ts.length ? nFeitos / ts.length * 100 : 0}%"></span></div>
    <div class="tut-aviso"><i class="fa-solid fa-flask"></i><span>Os treinamentos rodam em <b>modo simulação</b>: você usa o sistema de verdade, mas nada é gravado.</span></div>
    <div class="tut-busca"><div class="search"><i class="fa-solid fa-magnifying-glass"></i>
      <input id="tut-q" placeholder="Buscar tutorial…" value="${esc(_tutBusca)}" oninput="_tutBusca=this.value;document.getElementById('tut-l').innerHTML=listaTutoriais()"></div></div>
    <div class="tut-l" id="tut-l">${listaTutoriais()}</div>`;
}

function listaTutoriais() {
  const feitos = tutFeitos();
  const ts = tutoriaisPermitidos().filter(t => contem(`${t.titulo} ${t.desc} ${TUT_MODULOS[t.modulo]?.nome || ''}`, _tutBusca));
  if (!ts.length) return `<div class="sino-vazio"><i class="fa-solid fa-magnifying-glass" style="color:var(--text-muted)"></i><b>Nenhum tutorial encontrado</b><span>Tente outra palavra.</span></div>`;
  let i = 0;
  return Object.entries(TUT_MODULOS).map(([k, m]) => {
    const doGrupo = ts.filter(t => t.modulo === k);
    if (!doGrupo.length) return '';
    return `<div class="tut-g"><div class="tut-g-h" style="--c:${m.cor}"><i class="fa-solid ${m.icone}"></i>${m.nome}<span>${doGrupo.length}</span></div>
      ${doGrupo.map(t => `<button class="tut-it ${feitos[t.id] ? 'feito' : ''}" style="--c:${m.cor};animation-delay:${Math.min(i++, 10) * 30}ms" onclick="iniciarTutorial('${t.id}')">
        <span class="tut-it-ic"><i class="fa-solid ${t.icone || m.icone}"></i></span>
        <span class="tut-it-c"><b>${esc(t.titulo)}</b><span>${esc(t.desc)}</span>
          <span class="tut-it-m"><span><i class="fa-solid fa-shoe-prints"></i>${t.passos.length} passos</span><span><i class="fa-regular fa-clock"></i>~${minutosTut(t)} min</span>
            ${feitos[t.id] ? '<span class="ok"><i class="fa-solid fa-circle-check"></i>concluído</span>' : ''}</span></span>
        <span class="tut-play" title="Iniciar treinamento"><i class="fa-solid ${feitos[t.id] ? 'fa-rotate-right' : 'fa-play'}"></i></span></button>`).join('')}</div>`;
  }).join('');
}

// ── Passo a passo ─────────────────────────────────────────────
const TUT = { t: null, i: 0, el: null, desde: 0, rolou: false, raf: 0, ultimo: '', pausa: false, apertou: -1, esperando: -1 };
const valorTut = p => typeof p.valor === 'function' ? p.valor() : p.valor;

async function iniciarTutorial(id) {
  const t = (typeof TUTORIAIS === 'undefined' ? [] : TUTORIAIS).find(x => x.id === id);
  fecharTutoriais();
  if (!t || !tutorialPermitido(t)) return toast('Tutorial indisponível para o seu acesso', 'aviso');
  if (!SIM.ativo) {
    const ok = await confirmar({
      titulo: 'Entrar no modo simulação?', icone: 'fa-flask', tom: 'play', botao: 'Iniciar treinamento', cancelar: 'Agora não',
      texto: `<span class="modal-ex"><b>${esc(t.titulo)}</b><span>${t.passos.length} passos · cerca de ${minutosTut(t)} min</span></span>
        <span class="modal-li">
          <span><i class="fa-solid fa-flask"></i><span>Você usa o sistema de verdade, mas <b>nada é gravado</b> no banco de dados</span></span>
          <span><i class="fa-solid fa-hand-pointer"></i><span>A tela escurece e só o local destacado fica liberado para clicar</span></span>
          <span><i class="fa-solid fa-rotate-left"></i><span>Ao encerrar, tudo o que foi feito no treinamento é descartado</span></span></span>
        <small>Uma faixa no topo da tela mostra que a simulação está ligada.</small>`
    });
    if (!ok) return;
    iniciarSimulacao();
  }
  if (document.getElementById('gaveta').classList.contains('open')) fecharGaveta();
  fecharPop();
  TUT.t = t;
  montarCamadaTut();
  irPassoTut(0);
}

function montarCamadaTut() {
  document.getElementById('tut-camada')?.remove();
  const c = document.createElement('div');
  c.id = 'tut-camada'; c.className = 'tut-camada';
  c.innerHTML = `<div class="tut-bloq" data-b="c"></div><div class="tut-bloq" data-b="b"></div><div class="tut-bloq" data-b="e"></div><div class="tut-bloq" data-b="d"></div>
    <div class="tut-tampa"></div><div class="tut-foco"></div><div class="tut-card" role="dialog" aria-live="polite"></div>`;
  c.querySelectorAll('.tut-bloq, .tut-tampa').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); chamarAtencaoTut(); }));
  document.body.appendChild(c);
  document.documentElement.classList.add('tut-ativo');
  document.addEventListener('click', cliqueTut, true);
  document.addEventListener('pointerdown', apertoTut, true);
  document.addEventListener('pointerup', soltouTut, true);
  document.addEventListener('keydown', teclaTut, true);
  cancelAnimationFrame(TUT.raf);
  TUT.raf = requestAnimationFrame(quadroTut);
}

function fecharCamadaTut() {
  cancelAnimationFrame(TUT.raf);
  document.removeEventListener('click', cliqueTut, true);
  document.removeEventListener('pointerdown', apertoTut, true);
  document.removeEventListener('pointerup', soltouTut, true);
  document.removeEventListener('keydown', teclaTut, true);
  document.getElementById('tut-camada')?.remove();
  document.documentElement.classList.remove('tut-ativo');
  TUT.t = null; TUT.el = null;
}

const passoTut = () => TUT.t?.passos[TUT.i];

function irPassoTut(i, dir = 1) {
  const ps = TUT.t.passos;
  while (i >= 0 && i < ps.length && ps[i].pular?.()) i += dir;
  if (i >= ps.length) return concluirTut();
  if (i < 0) i = 0;
  TUT.i = i; TUT.el = null; TUT.desde = Date.now(); TUT.rolou = false; TUT.ultimo = '';
  const p = ps[i];
  try { p.antes?.(); } catch (e) { console.warn('[Tutorial] antes do passo falhou:', e); }
  TUT.el = acharAlvoTut(p);
  desenharCardTut();
}

const avancarTut = () => irPassoTut(TUT.i + 1, 1);
const voltarTut = () => irPassoTut(TUT.i - 1, -1);

// Localiza o alvo do passo (precisa estar visível na largura da tela)
function acharAlvoTut(p) {
  if (!p.alvo) return null;
  if (p.esperar && !document.querySelector(p.esperar)) return null;
  const cands = typeof p.alvo === 'function' ? [p.alvo()] : (Array.isArray(p.alvo) ? p.alvo : [p.alvo]).map(s => document.querySelector(s));
  return cands.find(el => {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.right > 0 && r.left < innerWidth;
  }) || null;
}

// Uma janela de confirmação que não faz parte do passo: libera a tela até ela fechar
const modalAbertoTut = () => document.getElementById('modal').classList.contains('open');

function quadroTut() {
  const c = document.getElementById('tut-camada'), p = passoTut();
  if (!c || !p) return;
  TUT.raf = requestAnimationFrame(quadroTut);
  const el = p.alvo ? acharAlvoTut(p) : null;
  const pausa = modalAbertoTut() && !(el && document.getElementById('modal').contains(el));
  if (pausa !== TUT.pausa) { TUT.pausa = pausa; TUT.ultimo = ''; c.classList.toggle('pausa', pausa); }
  if (pausa) return;

  // a tela pode redesenhar o alvo (outro elemento, mesmo lugar): a legenda só muda quando ele aparece ou some
  const mudou = !!el !== !!TUT.el;
  TUT.el = el;
  if (mudou) desenharCardTut();
  if (el && !TUT.rolou) {
    TUT.rolou = true;
    const r = el.getBoundingClientRect(), topo = document.querySelector('.topbar')?.getBoundingClientRect().bottom || 0;
    if (r.top < topo + 8 || r.bottom > innerHeight - 8) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  atualizarProximoTut(c, p);
  // sem alvo (cartão central) ou ainda procurando: tela toda escurecida
  const procurando = p.alvo && !el;
  if (procurando && Date.now() - TUT.desde > TUT_ESPERA && !c.classList.contains('perdido')) desenharCardTut(true);
  const r = el ? el.getBoundingClientRect() : null;
  const h = r ? { x: r.left - TUT_PAD, y: r.top - TUT_PAD, w: r.width + TUT_PAD * 2, h: r.height + TUT_PAD * 2 }
    : { x: innerWidth / 2, y: innerHeight / 2, w: 0, h: 0 };
  const chave = `${Math.round(h.x)},${Math.round(h.y)},${Math.round(h.w)},${Math.round(h.h)},${innerWidth},${innerHeight}`;
  if (chave === TUT.ultimo) return;
  TUT.ultimo = chave;
  posicionarTut(c, h, !!el);
}

function posicionarTut(c, h, comAlvo) {
  const W = innerWidth, H = innerHeight, x2 = h.x + h.w, y2 = h.y + h.h;
  const css = (sel, s) => Object.assign(c.querySelector(sel).style, s);
  const px = v => `${Math.max(0, v)}px`;
  css('[data-b="c"]', { left: 0, top: 0, width: '100%', height: px(h.y) });
  css('[data-b="b"]', { left: 0, top: px(y2), width: '100%', height: px(H - y2) });
  css('[data-b="e"]', { left: 0, top: px(h.y), width: px(h.x), height: px(h.h) });
  css('[data-b="d"]', { left: px(x2), top: px(h.y), width: px(W - x2), height: px(h.h) });
  css('.tut-tampa', { left: px(h.x), top: px(h.y), width: px(h.w), height: px(h.h) });
  css('.tut-foco', { left: `${h.x}px`, top: `${h.y}px`, width: `${h.w}px`, height: `${h.h}px` });
  c.classList.toggle('sem-alvo', !comAlvo);
  posicionarCardTut(c, comAlvo ? h : null);
}

// Legenda: abaixo, acima, à direita ou à esquerda do destaque; no celular, presa embaixo (ou em cima)
function posicionarCardTut(c, h) {
  const card = c.querySelector('.tut-card'), W = innerWidth, H = innerHeight, m = 12, g = 16;
  const cw = card.offsetWidth, ch = card.offsetHeight;
  let lado = 'centro', left = (W - cw) / 2, top = (H - ch) / 2, seta = 0;
  if (h && W <= 640) {
    lado = h.y + h.h / 2 > H / 2 ? 'cel-topo' : 'cel-base';
    top = lado === 'cel-topo' ? Math.max(m, Math.min(h.y - ch - g, 70)) : H - ch - m;
    left = m;
  } else if (h) {
    const cx = h.x + h.w / 2, cabeX = l => Math.max(m, Math.min(W - cw - m, l));
    if (h.y + h.h + g + ch <= H - m) { lado = 'baixo'; top = h.y + h.h + g; left = cabeX(cx - cw / 2); }
    else if (h.y - g - ch >= m) { lado = 'cima'; top = h.y - g - ch; left = cabeX(cx - cw / 2); }
    else if (h.x + h.w + g + cw <= W - m) { lado = 'dir'; left = h.x + h.w + g; top = Math.max(m, Math.min(H - ch - m, h.y + h.h / 2 - ch / 2)); }
    else if (h.x - g - cw >= m) { lado = 'esq'; left = h.x - g - cw; top = Math.max(m, Math.min(H - ch - m, h.y + h.h / 2 - ch / 2)); }
    else { lado = 'canto'; left = W - cw - m; top = H - ch - m; }
    seta = lado === 'baixo' || lado === 'cima' ? Math.max(18, Math.min(cw - 18, cx - left))
      : Math.max(18, Math.min(ch - 18, h.y + h.h / 2 - top));
  }
  card.dataset.lado = lado;
  card.style.left = `${Math.round(left)}px`;
  card.style.top = `${Math.round(top)}px`;
  card.style.setProperty('--seta', `${Math.round(seta)}px`);
}

function desenharCardTut(perdido = false, falhou = false) {
  const c = document.getElementById('tut-camada'), p = passoTut();
  if (!c || !p) return;
  const t = TUT.t, m = TUT_MODULOS[t.modulo] || TUT_MODULOS.geral, n = t.passos.length, cor = p.cor || m.cor;
  const procurando = p.alvo && !TUT.el;
  c.classList.toggle('perdido', !!(procurando && perdido));
  c.classList.toggle('so-ver', !p.alvo || p.acao === 'ver' || !!procurando);
  const acao = !p.alvo ? '' : procurando
    ? (perdido ? `<div class="tut-acao aviso"><i class="fa-solid fa-circle-question"></i><span>Não encontrei este local na tela. Ele pode depender dos dados cadastrados — pule este passo para continuar.</span></div>`
      : `<div class="tut-acao"><i class="fa-solid fa-circle-notch fa-spin"></i><span>Preparando a tela…</span></div>`)
    : falhou ? `<div class="tut-acao aviso"><i class="fa-solid fa-triangle-exclamation"></i><span>Ainda não deu certo: veja o aviso na tela, volte e complete os campos, depois clique de novo.</span></div>`
    : p.acao === 'clique' ? `<div class="tut-acao"><i class="fa-solid fa-hand-pointer"></i><span>Clique no local destacado para continuar (o botão Próximo fica bloqueado)</span></div>`
    : p.acao === 'digitar' ? `<div class="tut-acao"><i class="fa-solid fa-keyboard"></i><span>Digite no campo destacado${valorTut(p) != null ? `. Sugestão: <b>${esc(valorTut(p))}</b>` : ''}. Próximo libera quando o campo estiver preenchido</span>
        ${valorTut(p) != null ? `<button onclick="preencherTut()"><i class="fa-solid fa-wand-magic-sparkles"></i>Preencher para mim</button>` : ''}</div>`
    : `<div class="tut-acao ver"><i class="fa-solid fa-eye"></i><span>Observe o destaque e clique em Próximo</span></div>`;
  const ultimo = TUT.i >= n - 1, rotProx = procurando && perdido ? 'Pular passo' : ultimo ? 'Concluir' : 'Próximo';
  c.querySelector('.tut-card').innerHTML = `
    <div class="tut-c-top">
      <span class="tut-c-ic" style="--c:${cor}"><i class="fa-solid ${p.icone || t.icone || m.icone}"></i></span>
      <div class="tut-c-tt"><span class="tut-c-mod"><i class="fa-solid fa-flask"></i>Simulação · ${esc(t.titulo)}</span><h4>${esc(p.titulo)}</h4></div>
      <button class="tut-c-x" onclick="sairTut()" title="Sair do treinamento"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="tut-c-txt">${p.texto || ''}</div>
    ${p.dica ? `<div class="tut-dica"><i class="fa-solid fa-lightbulb"></i><span>${p.dica}</span></div>` : ''}
    ${acao}
    <div class="tut-c-pe">
      <div class="tut-passos"><span>${TUT.i + 1} de ${n}</span><div class="tut-barra"><span style="width:${(TUT.i + 1) / n * 100}%;background:${cor}"></span></div></div>
      <button class="btn sm" ${TUT.i ? '' : 'disabled'} onclick="voltarTut()"><i class="fa-solid fa-arrow-left"></i>Voltar</button>
      <button class="btn sm pri" onclick="proximoTut()">${rotProx}<i class="fa-solid ${ultimo && !procurando ? 'fa-flag-checkered' : 'fa-arrow-right'}"></i></button></div>`;
  TUT.ultimo = '';                 // tamanho da legenda mudou: reposiciona no próximo quadro
  const card = c.querySelector('.tut-card');
  card.classList.remove('entra'); void card.offsetWidth; card.classList.add('entra');
}

// Obrigatório: passo de clique só avança clicando no destaque; passo de digitar, só com o campo preenchido
const campoTut = () => !TUT.el ? null : TUT.el.matches('input, textarea') ? TUT.el : TUT.el.querySelector('input, textarea');
function bloqueioTut(p = passoTut()) {
  if (!p?.alvo || !TUT.el) return '';                     // alvo ausente: Próximo vira "Pular passo"
  if (p.acao === 'clique') return 'Clique no local destacado para continuar';
  if (p.acao === 'digitar' && !String(campoTut()?.value ?? '').trim()) return 'Preencha o campo destacado para continuar';
  return '';
}
function atualizarProximoTut(c, p) {
  const b = c.querySelector('.tut-c-pe .btn.pri'), motivo = bloqueioTut(p);
  if (!b || b.disabled === !!motivo) return;
  b.disabled = !!motivo;
  b.title = motivo;
}
function proximoTut() {
  if (bloqueioTut()) return chamarAtencaoTut();
  avancarTut();
}

function preencherTut() {
  const p = passoTut(), el = TUT.el, v = valorTut(p);
  if (!el || v == null) return;
  const inp = el.matches('input, textarea') ? el : el.querySelector('input, textarea');
  if (!inp) return;
  inp.focus();
  inp.value = v;
  inp.dispatchEvent(new Event('input', { bubbles: true }));
}

// Clique de verdade no alvo: deixa a tela reagir e segue para o próximo passo.
// Também vale apertar e soltar (itens que agem no mousedown, como as sugestões de busca)
const noAlvoTut = e => { const p = passoTut(); return p && !TUT.pausa && p.acao === 'clique' && TUT.el && TUT.el.contains(e.target) && !e.target.closest?.('#tut-camada, #sim-faixa'); };
function cliqueTut(e) { if (noAlvoTut(e)) depoisDoCliqueTut(); }
function apertoTut(e) { TUT.apertou = noAlvoTut(e) ? TUT.i : -1; }
function soltouTut() { if (TUT.apertou === TUT.i && TUT.t) { TUT.apertou = -1; depoisDoCliqueTut(); } }
function depoisDoCliqueTut() {
  const i = TUT.i, p = passoTut();
  if (TUT.esperando === i) return;
  TUT.esperando = i;
  // avancaSe: espera até 1,5 s o resultado do clique (ex.: salvar e fechar a gaveta)
  const ini = Date.now(), checar = () => {
    if (!TUT.t || TUT.i !== i) { TUT.esperando = -1; return; }
    if (!p.avancaSe || p.avancaSe()) { TUT.esperando = -1; return avancarTut(); }
    if (modalAbertoTut()) return setTimeout(checar, 150);          // aguardando a resposta de uma confirmação
    if (Date.now() - ini < 1500) return setTimeout(checar, 120);
    TUT.esperando = -1;
    desenharCardTut(false, true);
  };
  setTimeout(checar, 90);
}

function teclaTut(e) {
  if (!TUT.t || TUT.pausa || modalAbertoTut()) return;
  const p = passoTut();
  if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); sairTut(); return; }
  if (e.key === 'Enter' && p.acao === 'digitar' && TUT.el?.contains(document.activeElement)) { e.preventDefault(); e.stopImmediatePropagation(); bloqueioTut(p) ? chamarAtencaoTut() : avancarTut(); }
}

function chamarAtencaoTut() {
  const c = document.getElementById('tut-camada');
  if (!c) return;
  const card = c.querySelector('.tut-card'), foco = c.querySelector('.tut-foco');
  [card, foco].forEach(x => { x.classList.remove('chama'); void x.offsetWidth; x.classList.add('chama'); });
}

// Sair no meio: encerra o treinamento (descarta a simulação) ou volta ao passo
async function sairTut() {
  const c = document.getElementById('tut-camada');
  if (c) c.hidden = true;
  const r = await confirmar({ titulo: 'Sair do treinamento?', icone: 'fa-door-open', tom: 'pausa', botao: 'Encerrar treinamento', cancelar: 'Explorar livremente',
    texto: 'Encerrar descarta tudo o que foi feito na simulação. Em <b>Explorar livremente</b> você continua no modo simulação, sem o passo a passo.' });
  if (r === true) { fecharCamadaTut(); encerrarSimulacao(); return; }
  if (r === false) { fecharCamadaTut(); toast('Modo simulação continua ligado. Use a faixa do topo para encerrar.', 'aviso'); return; }
  if (c) c.hidden = false;
  TUT.ultimo = '';
}

// Fim do tutorial: cartão de conclusão
function concluirTut() {
  const t = TUT.t, c = document.getElementById('tut-camada');
  marcarTutFeito(t.id);
  const prox = tutoriaisPermitidos().find(x => x.modulo === t.modulo && x.id !== t.id && !tutFeitos()[x.id])
    || tutoriaisPermitidos().find(x => !tutFeitos()[x.id]);
  TUT.i = t.passos.length; TUT.el = null;
  cancelAnimationFrame(TUT.raf);
  c.className = 'tut-camada sem-alvo so-ver fim';
  posicionarTut(c, { x: innerWidth / 2, y: innerHeight / 2, w: 0, h: 0 }, false);
  const card = c.querySelector('.tut-card');
  card.innerHTML = `
    <div class="tut-fim-ic"><i class="fa-solid fa-trophy"></i></div>
    <h4>Treinamento concluído!</h4>
    <div class="tut-c-txt">Você terminou <b>${esc(t.titulo)}</b>. Lembre-se: tudo foi feito em simulação e será descartado ao encerrar.</div>
    ${prox ? `<button class="tut-prox" onclick="seguirTut('${prox.id}')"><i class="fa-solid fa-forward"></i><span><small>Próximo sugerido</small>${esc(prox.titulo)}</span></button>` : ''}
    <div class="tut-c-pe fim">
      <button class="btn sm" onclick="fecharCamadaTut();toast('Modo simulação continua ligado. Use a faixa do topo para encerrar.','aviso')"><i class="fa-solid fa-compass"></i>Explorar livremente</button>
      <button class="btn sm pri" onclick="fecharCamadaTut();encerrarSimulacao()"><i class="fa-solid fa-power-off"></i>Encerrar treinamento</button></div>`;
  card.classList.remove('entra'); void card.offsetWidth; card.classList.add('entra');
  posicionarCardTut(c, null);
}

// Próximo tutorial sem sair da simulação
function seguirTut(id) { fecharCamadaTut(); iniciarTutorial(id); }

addEventListener('resize', () => { TUT.ultimo = ''; });

// ── Ajudas para escrever os passos (usadas em tutoriais.js) ──
const celularTut = () => innerWidth <= 768;
// Item do menu lateral (no celular abre o menu antes)
const passoMenuTut = (tela, titulo, texto, extra = {}) => ({
  alvo: `#nav a[data-s="${tela}"]`, titulo, texto, icone: extra.icone || 'fa-hand-pointer', acao: 'clique',
  antes: () => { if (celularTut()) abrirMenu(); }, ...extra
});
// Garante a tela e a aba interna antes do passo
const irTelaTut = (tela, prep) => () => {
  if (prep) prep();
  if (telaAtual !== tela) irPara(tela); else renderTela();
};
