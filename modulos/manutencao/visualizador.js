// Visualizador de anexos (mesmo modelo do portal Dados LAMIC, js/app.js → lightbox):
// imagens com zoom (botões, roda, clique, pinça), arrastar, girar, anterior/próxima, baixar,
// abrir original e tela cheia. PDFs abrem no próprio visualizador (pré-visualização do Drive).
// itens = [{ id (Drive), nome, tipo: 'img' | 'pdf', src? }]
(function () {
  const SVG = {
    out:    '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/>',
    in:     '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/><line x1="11" y1="8" x2="11" y2="14"/>',
    reset:  '<polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/>',
    anti:   '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><polyline points="3 3 3 8 8 8"/>',
    hora:   '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><polyline points="21 3 21 8 16 8"/>',
    baixar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    abrir:  '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
    cheia:  '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><polyline points="21 15 21 21 15 21"/><polyline points="3 9 3 3 9 3"/>',
    fechar: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    ant:    '<polyline points="15 18 9 12 15 6"/>',
    prox:   '<polyline points="9 18 15 12 9 6"/>',
  };
  const ico = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${SVG[k]}</svg>`;
  const enc = encodeURIComponent;
  const srcImg = it => it.src || `https://drive.google.com/thumbnail?id=${enc(it.id)}&sz=w2400`;
  const srcPdf = it => it.id ? `https://drive.google.com/file/d/${enc(it.id)}/preview` : it.src;

  window.lamicVisualizador = function (itens, inicio = 0) {
    if (!itens?.length) return;
    document.querySelector('.lmv')?.remove();
    const MIN = 1, MAX = 5, PASSO = 0.5;
    let i = inicio, zoom = 1, px = 0, py = 0, giro = 0;
    const m = document.createElement('div');
    m.className = 'lmv';
    const bt = (k, t, cl = '') => `<button type="button" class="lmv-bt ${cl}" data-lb="${k}" title="${t}" aria-label="${t}">${ico(k)}</button>`;
    m.innerHTML = `<div class="lmv-barra">
        <span class="lmv-so-img">${bt('out', 'Diminuir (−)')}<span class="lmv-nivel">100%</span>${bt('in', 'Aumentar (+)')}
        ${bt('reset', 'Ajustar à tela (0)')}<span class="lmv-sep"></span>
        ${bt('anti', 'Girar à esquerda (,)')}${bt('hora', 'Girar à direita (.)')}<span class="lmv-sep"></span></span>
        ${bt('baixar', 'Baixar')}${bt('abrir', 'Abrir original')}${bt('cheia', 'Tela cheia (F)')}
        <span class="lmv-sep"></span>${bt('fechar', 'Fechar (Esc)')}</div>
      ${itens.length > 1 ? `${bt('ant', 'Anterior (←)', 'lmv-nav lmv-ant')}${bt('prox', 'Próxima (→)', 'lmv-nav lmv-prox')}<span class="lmv-cont"></span>` : ''}
      <div class="lmv-nome"></div>
      <div class="lmv-palco"><img class="lmv-img" alt="" draggable="false" referrerpolicy="no-referrer"><iframe class="lmv-pdf" title="PDF" allow="autoplay"></iframe></div>`;
    document.body.appendChild(m);
    const $ = s => m.querySelector(s);
    const img = $('.lmv-img'), pdf = $('.lmv-pdf'), palco = $('.lmv-palco'), nivel = $('.lmv-nivel');
    const ehPdf = () => itens[i].tipo === 'pdf';

    const aplicar = (anim = true) => {
      if (zoom <= 1) { px = 0; py = 0; }
      img.style.transition = anim ? 'transform .25s cubic-bezier(.22,1,.36,1)' : 'none';
      img.style.transform = `translate(${px}px, ${py}px) scale(${zoom}) rotate(${giro}deg)`;
      nivel.textContent = `${Math.round(zoom * 100)}%`;
      palco.classList.toggle('ampliado', zoom > 1);
    };
    const setZoom = z => { if (ehPdf()) return; zoom = Math.min(MAX, Math.max(MIN, z)); aplicar(); };
    const mostrar = n => {
      i = (n + itens.length) % itens.length; zoom = 1; giro = 0; aplicar(false);
      const it = itens[i];
      m.classList.toggle('lmv-modo-pdf', ehPdf());
      $('.lmv-nome').textContent = it.nome || '';
      if (ehPdf()) { img.removeAttribute('src'); pdf.src = srcPdf(it); }
      else { pdf.removeAttribute('src'); img.style.opacity = 0; img.src = srcImg(it); img.alt = it.nome || ''; }
      const c = $('.lmv-cont'); if (c) c.textContent = `${i + 1} / ${itens.length}`;
    };
    img.onload = () => { img.style.opacity = ''; img.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220 }); };
    const fechar = () => {
      document.removeEventListener('keydown', tecla, true);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      m.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180 }).onfinish = () => m.remove();
    };
    const url = (it, baixar) => it.id
      ? (baixar ? `https://drive.google.com/uc?export=download&id=${enc(it.id)}` : `https://drive.google.com/file/d/${enc(it.id)}/view`)
      : it.src;
    const acoes = {
      in: () => setZoom(zoom + PASSO), out: () => setZoom(zoom - PASSO), reset: () => { zoom = 1; giro = 0; aplicar(); },
      hora: () => { if (!ehPdf()) { giro += 90; aplicar(); } }, anti: () => { if (!ehPdf()) { giro -= 90; aplicar(); } },
      ant: () => mostrar(i - 1), prox: () => mostrar(i + 1), fechar,
      abrir: () => window.open(url(itens[i], false), '_blank', 'noopener'),
      baixar: () => window.open(url(itens[i], true), '_blank', 'noopener'),
      cheia: () => document.fullscreenElement ? document.exitFullscreen() : m.requestFullscreen?.().catch(() => {}),
    };
    let arrastou = false;
    m.addEventListener('click', e => {
      const b = e.target.closest('[data-lb]');
      if (b) return acoes[b.dataset.lb]?.();
      if (e.target === palco && zoom === 1 && !arrastou) fechar();
    });
    // clique na imagem: amplia 2x no ponto clicado / volta ao normal
    img.addEventListener('click', e => {
      if (arrastou) return;
      if (zoom > 1) { zoom = 1; return aplicar(); }
      const r = img.getBoundingClientRect();
      zoom = 2; px = (r.left + r.width / 2) - e.clientX; py = (r.top + r.height / 2) - e.clientY; aplicar();
    });
    palco.addEventListener('wheel', e => { if (ehPdf()) return; e.preventDefault(); setZoom(zoom + (e.deltaY < 0 ? PASSO : -PASSO)); }, { passive: false });
    // arrastar com zoom; pinça para zoom; deslizar sem zoom troca de item
    let ini = null, dist0 = 0, zoom0 = 1;
    const toques = new Map();
    palco.addEventListener('pointerdown', e => {
      toques.set(e.pointerId, e); arrastou = false;
      if (toques.size === 2) { const [a, b] = [...toques.values()]; dist0 = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1; zoom0 = zoom; ini = null; }
      else ini = { x: e.clientX - px, y: e.clientY - py, ox: e.clientX, oy: e.clientY };
    });
    palco.addEventListener('pointermove', e => {
      if (!toques.has(e.pointerId)) return;
      toques.set(e.pointerId, e);
      if (toques.size === 2 && !ehPdf()) {
        const [a, b] = [...toques.values()];
        zoom = Math.min(MAX, Math.max(MIN, zoom0 * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / dist0)); aplicar(false); arrastou = true;
      } else if (ini) {
        if (Math.abs(e.clientX - ini.ox) + Math.abs(e.clientY - ini.oy) > 5) arrastou = true;
        if (zoom > 1) { px = e.clientX - ini.x; py = e.clientY - ini.y; aplicar(false); }
      }
    });
    const solta = e => {
      toques.delete(e.pointerId);
      if (ini && zoom === 1 && itens.length > 1 && Math.abs(e.clientX - ini.ox) > 60) mostrar(i + (e.clientX < ini.ox ? 1 : -1));
      ini = null;
    };
    palco.addEventListener('pointerup', solta); palco.addEventListener('pointercancel', solta);
    function tecla(e) {
      const k = { Escape: 'fechar', '+': 'in', '=': 'in', '-': 'out', '0': 'reset', '.': 'hora', ',': 'anti', ArrowLeft: 'ant', ArrowRight: 'prox', f: 'cheia', F: 'cheia' }[e.key];
      if (!k || ((k === 'ant' || k === 'prox') && itens.length < 2)) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) && k !== 'fechar') return;
      e.preventDefault(); e.stopPropagation(); acoes[k]();
    }
    document.addEventListener('keydown', tecla, true);
    m.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
    mostrar(inicio);
  };
})();
