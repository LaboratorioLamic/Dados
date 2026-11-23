// ═══════════════════════════════════════════════════════════════
// popover.js — Substitui <select>: botão com rótulo + valor e painel
// com busca, grupos, ícones, contagem e teclado (↑ ↓ Enter Esc).
// No celular o painel vira bottom sheet.
// ═══════════════════════════════════════════════════════════════
//
// criarPop('id-do-container', {
//   rotulo, titulo, icone, padrao, busca: 'placeholder', limpavel,
//   opcoes: [{ valor, rotulo, icone, cor, desc, qtd, grupo }] | () => [...],
//   aoMudar: valor => {}
// })
// multi: true → valor é uma lista (vazia = todos), o clique alterna sem fechar e o rodapé ganha "Inverter"
// (st.inv = vale tudo menos os marcados)

const POPS = {};
let popAberto = null;

function criarPop(id, cfg) {
  const wrap = document.getElementById(id);
  if (!wrap) return null;
  const st = Object.assign({ valor: cfg.multi ? [] : cfg.padrao ?? '', inv: false }, cfg, { id, wrap });
  if (POPS[id]) { st.valor = POPS[id].valor; st.inv = POPS[id].inv; }           // mantém a escolha ao recriar
  POPS[id] = st;
  wrap.classList.add('pop-wrap');
  wrap.innerHTML = `<button type="button" class="pop-btn" aria-haspopup="listbox" aria-expanded="false"></button><div class="pop" role="listbox" tabindex="-1"></div>`;
  st.btn = wrap.querySelector('.pop-btn');
  st.painel = wrap.querySelector('.pop');
  st.btn.onclick = () => popAberto === id ? fecharPop() : abrirPop(id);
  desenharBotaoPop(id);
  return st;
}

const opcoesPop = st => typeof st.opcoes === 'function' ? st.opcoes() : st.opcoes;
const valorPop = id => POPS[id]?.valor ?? '';
const invPop = id => !!POPS[id]?.inv;
// multi: o item passa no filtro?
const passaPop = (id, v) => { const s = valorPop(id); return !s.length || s.includes(v) !== invPop(id); };

function desenharBotaoPop(id) {
  // soIcone: botão sem texto, não precisa montar as opções só para desenhar
  const st = POPS[id], todas = st.soIcone ? [] : opcoesPop(st);
  let o = todas.find(x => x.valor === st.valor) || todas[0] || { rotulo: '—' };
  const marcado = st.multi ? st.valor.length > 0 : st.valor !== (st.padrao ?? '');
  if (st.multi && marcado) {
    const um = st.valor.length === 1 ? todas.find(x => x.valor === st.valor[0]) : null;
    o = { icone: st.inv ? 'fa-right-left' : um?.icone, rotulo: (st.inv ? 'Exceto ' : '') + (um ? um.rotulo : `${st.valor.length} selecionados`) };
  }
  st.btn.classList.toggle('set', marcado && !!st.limpavel);
  st.btn.innerHTML = `<span class="pb-ic"><i class="fa-solid ${marcado && o.icone ? o.icone : st.icone}"></i></span>
    <span class="pb-txt"><span class="pb-l">${esc(st.rotulo)}</span><span class="pb-v">${esc(o.rotulo)}</span></span>
    ${marcado && st.limpavel ? `<span class="pb-clear" title="Limpar" onclick="event.stopPropagation();definirPop('${id}','${esc(st.padrao ?? '')}')"><i class="fa-solid fa-xmark"></i></span>` : ''}
    <i class="fa-solid fa-chevron-down pb-chev"></i>`;
}

function abrirPop(id) {
  fecharPop();
  const st = POPS[id];
  popAberto = id; st.q = '';
  st.wrap.classList.add('open');
  st.btn.setAttribute('aria-expanded', 'true');
  st.painel.classList.toggle('right', st.wrap.getBoundingClientRect().left + 330 > window.innerWidth);
  document.getElementById('pop-fundo').classList.add('open');
  desenharPainelPop(id);
  const wr = st.wrap.getBoundingClientRect(), ph = st.painel.offsetHeight;
  st.painel.classList.toggle('up', wr.bottom + ph + 12 > window.innerHeight && wr.top > window.innerHeight - wr.bottom);
  st.hi = Math.max(0, st.vis.findIndex(o => o.valor === st.valor));
  desenharListaPop(id);
  const busca = st.painel.querySelector('.pop-search input');
  (busca && window.innerWidth > 768 ? busca : st.painel).focus({ preventScroll: true });
}

function fecharPop() {
  if (!popAberto) return;
  const st = POPS[popAberto];
  if (st) {
    st.wrap.classList.remove('open');
    st.btn.setAttribute('aria-expanded', 'false');
  }
  document.getElementById('pop-fundo').classList.remove('open');
  popAberto = null;
}

function desenharPainelPop(id) {
  const st = POPS[id];
  st.painel.innerHTML = `
    <div class="pop-head"><span>${esc(st.titulo || st.rotulo)}</span><button class="pop-x" onclick="fecharPop()"><i class="fa-solid fa-xmark"></i></button></div>
    ${st.busca ? `<div class="pop-search"><i class="fa-solid fa-magnifying-glass"></i><input placeholder="${esc(st.busca)}" oninput="POPS['${id}'].q=this.value;POPS['${id}'].hi=0;desenharListaPop('${id}')"></div>` : ''}
    <div class="pop-list"></div>
    <div class="pop-foot"><span class="keys"><kbd>↑↓</kbd> navegar · <kbd>Enter</kbd> · <kbd>Esc</kbd></span>
      ${st.multi ? `<button class="${st.inv ? 'on' : ''}" title="Vale tudo menos os marcados" onclick="inverterPop('${id}')"><i class="fa-solid fa-right-left"></i> Inverter</button>` : ''}
      ${st.limpavel ? `<button onclick="definirPop('${id}','${esc(st.padrao ?? '')}')"><i class="fa-solid fa-rotate-left"></i> Limpar</button>` : ''}</div>`;
  desenharListaPop(id);
}

function desenharListaPop(id) {
  const st = POPS[id];
  st.vis = opcoesPop(st).filter(o => contem(o.rotulo + ' ' + (o.desc || ''), st.q));
  let h = '', g = null;
  st.vis.forEach((o, i) => {
    if (o.grupo && o.grupo !== g) { g = o.grupo; h += `<div class="pop-group">${esc(g)}</div>`; }
    const sel = st.multi ? (o.valor === '' ? !st.valor.length : st.valor.includes(o.valor)) : o.valor === st.valor;
    h += `<button class="pop-opt ${sel ? 'sel' : ''} ${i === st.hi ? 'hi' : ''}" role="option" aria-selected="${sel}"
        onmouseenter="POPS['${id}'].hi=${i};marcarPop('${id}')" onclick="escolherPop('${id}',${i})">
      <span class="po-ic" style="--c:${o.cor || 'var(--cyan)'}"><i class="fa-solid ${o.icone || 'fa-circle'}"></i></span>
      <span class="po-txt"><span class="po-l">${esc(o.rotulo)}</span>${o.desc ? `<span class="po-d">${esc(o.desc)}</span>` : ''}</span>
      ${o.qtd != null ? `<span class="po-n">${o.qtd}</span>` : ''}<i class="fa-solid fa-check po-ck"></i></button>`;
  });
  st.painel.querySelector('.pop-list').innerHTML = h || `<div class="pop-empty"><i class="fa-solid fa-magnifying-glass"></i>Nada encontrado</div>`;
}

function marcarPop(id) {
  const st = POPS[id], itens = st.painel.querySelectorAll('.pop-opt'), lista = st.painel.querySelector('.pop-list');
  itens.forEach((b, i) => b.classList.toggle('hi', i === st.hi));
  const el = itens[st.hi];
  if (!el) return;
  // rola só a lista, nunca a página
  if (el.offsetTop < lista.scrollTop) lista.scrollTop = el.offsetTop - 6;
  else if (el.offsetTop + el.offsetHeight > lista.scrollTop + lista.clientHeight) lista.scrollTop = el.offsetTop + el.offsetHeight - lista.clientHeight + 6;
}

function escolherPop(id, i) {
  const st = POPS[id], v = st.vis[i].valor;
  if (!st.multi) return definirPop(id, v);
  st.valor = v === '' ? [] : st.valor.includes(v) ? st.valor.filter(x => x !== v) : [...st.valor, v];
  if (!st.valor.length) st.inv = false;
  atualizarMultiPop(id);
}
function inverterPop(id) {
  const st = POPS[id];
  st.inv = !st.inv;
  atualizarMultiPop(id);
}
// multi: redesenha sem fechar o painel
function atualizarMultiPop(id) {
  const st = POPS[id], lista = st.painel.querySelector('.pop-list'), y = lista.scrollTop;
  desenharBotaoPop(id);
  desenharListaPop(id);
  lista.scrollTop = y;
  st.painel.querySelectorAll('.pop-foot button').forEach(b => b.querySelector('.fa-right-left') && b.classList.toggle('on', st.inv));
  st.aoMudar?.(st.valor);
}

function definirPop(id, valor) {
  const st = POPS[id];
  if (st.multi) { valor = Array.isArray(valor) ? valor : []; st.inv = false; }
  st.valor = valor;
  desenharBotaoPop(id);
  fecharPop();
  st.aoMudar?.(valor);
}

document.addEventListener('keydown', e => {
  if (!popAberto) return;
  const st = POPS[popAberto];
  if (e.key === 'Escape') { fecharPop(); st.btn.focus(); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); st.hi = Math.min(st.vis.length - 1, st.hi + 1); marcarPop(popAberto); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); st.hi = Math.max(0, st.hi - 1); marcarPop(popAberto); }
  else if (e.key === 'Enter' && st.vis[st.hi]) { e.preventDefault(); escolherPop(popAberto, st.hi); }
});

let _larguraPop = window.innerWidth;
window.addEventListener('resize', () => {
  if (Math.abs(window.innerWidth - _larguraPop) > 80) fecharPop();
  _larguraPop = window.innerWidth;
});
