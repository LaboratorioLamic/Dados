// ═══════════════════════════════════════════════════════════════
// ui.js — Componentes de interface: toast, gaveta, confirmação,
// campos e sub-navegação — COMERCIAL LAMIC
// ═══════════════════════════════════════════════════════════════

// ── Toast ─────────────────────────────────────────────────────
let _toastTimer = null;
function toast(texto, tipo = 'ok') {
  const el = document.getElementById('toast');
  const ic = { ok: 'fa-circle-check', erro: 'fa-circle-xmark', aviso: 'fa-triangle-exclamation' }[tipo] || 'fa-circle-check';
  el.className = 'toast ' + tipo;
  el.innerHTML = `<i class="fa-solid ${ic}"></i><span>${esc(texto)}</span>`;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// ── Gaveta lateral ────────────────────────────────────────────
// abrirGaveta({ sobre, titulo, meta, corpo, rodape })
function abrirGaveta({ sobre = '', titulo = '', meta = '', corpo = '', rodape = '', larga = false, centro = false }) {
  fecharPop();
  document.getElementById('g-sobre').textContent = sobre;
  document.getElementById('g-titulo').textContent = titulo;
  document.getElementById('g-meta').innerHTML = meta;
  const c = document.getElementById('g-corpo');
  c.innerHTML = corpo; c.scrollTop = 0;
  document.getElementById('g-rodape').innerHTML = rodape;
  document.getElementById('gaveta').classList.toggle('larga', larga);
  const g = document.getElementById('gaveta');
  // troca lateral ↔ centralizada sem animar o deslocamento: parte já do estado fechado do novo formato
  if (g.classList.contains('centro') !== centro && !g.classList.contains('open')) {
    g.style.transition = 'none';
    g.classList.toggle('centro', centro);
    void g.offsetWidth;
    g.style.transition = '';
  } else g.classList.toggle('centro', centro);
  document.getElementById('gaveta').classList.add('open');
  document.getElementById('gaveta-fundo').classList.add('open');
}
function fecharGaveta() {
  fecharPop();
  document.getElementById('gaveta').classList.remove('open');
  document.getElementById('gaveta-fundo').classList.remove('open');
  if (typeof _renderAdiado !== 'undefined' && _renderAdiado && !campoEmEdicao() && usuarioAtual()) { _renderAdiado = false; renderTela(); }
}

// ── Confirmação ───────────────────────────────────────────────
// confirmar({ titulo, texto, botao, perigo }) → Promise<boolean>
// icone/tom (opcionais) trocam o ícone e a cor do círculo: tom 'pausa' (âmbar) ou 'play' (verde)
// Esc ou clique fora resolvem null (dispensou sem escolher); o botão de cancelar resolve false
function confirmar({ titulo = 'Confirmar', texto = '', botao = 'Confirmar', perigo = false, icone = '', tom = '', cancelar = 'Cancelar' } = {}) {
  return new Promise(resolve => {
    const m = document.getElementById('modal');
    m.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true">
        <button class="modal-x" data-x title="Fechar"><i class="fa-solid fa-xmark"></i></button>
        <div class="modal-ic ${perigo ? 'perigo' : tom}"><i class="fa-solid ${icone || (perigo ? 'fa-triangle-exclamation' : 'fa-circle-question')}"></i></div>
        <h3>${esc(titulo)}</h3><p>${texto}</p>
        <div class="modal-acoes"><button class="btn" data-r="0">${esc(cancelar)}</button><button class="btn ${perigo ? 'perigo' : 'pri'}" data-r="1">${esc(botao)}</button></div>
      </div>`;
    m.classList.add('open');
    const fim = r => { m.classList.remove('open'); document.removeEventListener('keydown', tecla); resolve(r); };
    const tecla = e => { if (e.key === 'Escape') fim(null); if (e.key === 'Enter') fim(true); };
    m.querySelectorAll('[data-r]').forEach(b => b.onclick = () => fim(b.dataset.r === '1'));
    m.querySelector('[data-x]').onclick = () => fim(null);
    m.onclick = e => { if (e.target === m) fim(null); };
    document.addEventListener('keydown', tecla);
    m.querySelector('[data-r="1"]').focus();
  });
}

// ── Campos ────────────────────────────────────────────────────
// Campo numérico com prefixo/sufixo
// moeda: campo de valor em R$ com vírgula automática (os dígitos entram pelos centavos: 5000 → 50,00)
function campo(id, rotulo, valor, { suf = '', pre = '', icone = '', dica = '', aoMudar = '', passo = 'any', tipo = 'number', ph = '', desab = false, moeda = false } = {}) {
  if (moeda) { tipo = 'text'; valor = typeof valor === 'number' ? fmtMoedaCampo(valor) : valor; aoMudar = `mascaraMoeda(this);${aoMudar}`; }
  return `<div class="field"><label for="${id}">${icone ? `<i class="fa-solid ${icone}"></i>` : ''}${rotulo}</label>
    <div class="inp">${pre ? `<span class="pre">${pre}</span>` : ''}<input id="${id}" class="${moeda ? 'moeda' : tipo === 'text' || tipo === 'password' ? 'txt' : ''}" type="${tipo}" ${moeda ? 'inputmode="numeric" autocomplete="off"' : `step="${passo}"`} value="${esc(valor)}" placeholder="${esc(ph)}" ${aoMudar ? `oninput="${aoMudar}"` : ''} ${desab ? 'disabled' : ''}>${suf ? `<span class="suf">${suf}</span>` : ''}</div>
    ${dica ? `<span class="hint">${dica}</span>` : ''}</div>`;
}
const valorCampo = id => document.getElementById(id)?.value ?? '';
// "1.234,56" (campo com máscara de moeda) ou "1234.56" (campo numérico) → número
const numBR = v => { let s = String(v ?? '').trim(); if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); return parseFloat(s); };
const numCampo = id => numBR(valorCampo(id));
const fmtMoedaCampo = v => v == null || v === '' || isNaN(v) ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function mascaraMoeda(el) {
  const d = el.value.replace(/\D/g, '').replace(/^0+/, '');
  el.value = d ? fmtMoedaCampo(parseInt(d, 10) / 100) : '';
}

// Interruptor
const chave = (ligado, aoClicar, desab = false) =>
  `<button type="button" class="switch lt ${ligado ? 'on' : ''}" ${desab ? 'disabled' : ''} onclick="${aoClicar}" role="switch" aria-checked="${!!ligado}"></button>`;

// Estado vazio
const vazio = (icone, texto) => `<div class="vazio"><i class="fa-solid ${icone}"></i><p>${texto}</p></div>`;

// ── Paginação ─────────────────────────────────────────────────
// paginacao(total, pagina, porPagina, 'funcaoQueRecebeAPagina')
function paginacao(total, pag, por, fn) {
  const n = Math.max(1, Math.ceil(total / por));
  if (n <= 1) return `<span>${total} item(ns)</span>`;
  const ini = (pag - 1) * por + 1, fim = Math.min(total, pag * por);
  const nums = [...new Set([1, pag - 1, pag, pag + 1, n])].filter(p => p >= 1 && p <= n).sort((a, b) => a - b);
  let h = '', ant = 0;
  nums.forEach(p => { if (p - ant > 1) h += '<span class="pg-gap">…</span>'; h += `<button class="pg ${p === pag ? 'on' : ''}" onclick="${fn}(${p})">${p}</button>`; ant = p; });
  return `<span>${ini}–${fim} de ${total}</span><div class="pgs">
    <button class="pg" ${pag <= 1 ? 'disabled' : ''} onclick="${fn}(${pag - 1})" title="Anterior"><i class="fa-solid fa-chevron-left"></i></button>${h}
    <button class="pg" ${pag >= n ? 'disabled' : ''} onclick="${fn}(${pag + 1})" title="Próxima"><i class="fa-solid fa-chevron-right"></i></button></div>`;
}

// Cabeçalho de coluna ordenável
const thOrdem = (rotulo, chaveOrd, atual, dir, fn, cls = '') =>
  `<th class="ord ${cls} ${atual === chaveOrd ? 'on' : ''}" onclick="${fn}('${chaveOrd}')">${rotulo} <i class="fa-solid ${atual === chaveOrd ? (dir > 0 ? 'fa-arrow-up-short-wide' : 'fa-arrow-down-wide-short') : 'fa-sort'}"></i></th>`;

// ── Sub-navegação (abas internas de uma tela) ─────────────────
// <div class="subnav" data-grupo="cfg"> com botões data-p; painéis id="cfg-<p>"
const SUBNAV_GANCHO = {};
function iniciarSubnav() {
  document.querySelectorAll('.subnav').forEach(sn => sn.querySelectorAll('button').forEach(b => b.onclick = () => abrirSubaba(sn.dataset.grupo, b.dataset.p)));
}
function abrirSubaba(grupo, p) {
  fecharPop();
  const sn = document.querySelector(`.subnav[data-grupo="${grupo}"]`);
  sn.querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.p === p));
  document.querySelectorAll(`.pane[id^="${grupo}-"]`).forEach(x => x.classList.toggle('on', x.id === `${grupo}-${p}`));
  SUBNAV_GANCHO[grupo]?.(p);
}
const subabaAtual = grupo => document.querySelector(`.subnav[data-grupo="${grupo}"] button.on`)?.dataset.p;
