// === OTIMIZAÇÃO BASE — anti-empilhamento de blur ===
// Quando várias janelas (overlays com backdrop-filter) ficam abertas ao mesmo
// tempo, o blur de cada uma soma com o das de baixo: fica pesado e "borrado
// demais". Aqui mantemos o blur só na janela do topo e desligamos o das de
// baixo (que ficam escondidas atrás dela). Uma janela sozinha mantém o blur.
(function () {
    'use strict';

    // Candidatos prováveis a overlay (barato para filtrar em mutações).
    const SEL = '[class*="overlay"],[class*="backdrop"],.modal,[style*="backdrop-filter"]';

    function hasBlur(el) {
        const cs = getComputedStyle(el);
        const bf = cs.backdropFilter || cs.webkitBackdropFilter || '';
        return bf.indexOf('blur') !== -1;
    }

    // Só contam janelas de tela cheia (fixed cobrindo o viewport). Isso exclui
    // elementos decorativos com blur (login-box, ícones de herói, header etc.).
    function isScreenOverlay(el) {
        const cs = getComputedStyle(el);
        if (cs.position !== 'fixed') return false;
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
        const r = el.getBoundingClientRect();
        return r.width >= window.innerWidth * 0.85 && r.height >= window.innerHeight * 0.85;
    }

    function zIndexOf(el) {
        const z = parseInt(getComputedStyle(el).zIndex, 10);
        return isNaN(z) ? 0 : z;
    }

    function reconcile() {
        const overlays = [];
        document.querySelectorAll(SEL).forEach(function (el) {
            // Marca uma vez que o elemento tem blur (o dataset persiste mesmo
            // depois de suprimirmos o blur via classe).
            if (!el.dataset.blurOverlay) {
                if (el.classList.contains('perf-blur-stacked') || !hasBlur(el)) return;
                el.dataset.blurOverlay = '1';
            }
            if (isScreenOverlay(el)) overlays.push(el);
        });

        if (overlays.length < 2) {
            // 0 ou 1 janela → ninguém suprimido (mantém o blur da única aberta).
            overlays.forEach(function (el) { el.classList.remove('perf-blur-stacked'); });
            return;
        }

        // Ordena da mais baixa para a mais alta (z-index, depois ordem no DOM).
        overlays.sort(function (a, b) {
            const dz = zIndexOf(a) - zIndexOf(b);
            if (dz) return dz;
            return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
        });

        overlays.forEach(function (el, i) {
            // Só a do topo (última) mantém o blur.
            el.classList.toggle('perf-blur-stacked', i < overlays.length - 1);
        });
    }

    let scheduled = false;
    function schedule() {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(function () { scheduled = false; reconcile(); });
    }

    function matchesOverlay(n) {
        return n.nodeType === 1 &&
            ((n.matches && n.matches(SEL)) || (n.querySelector && n.querySelector(SEL)) || n.dataset.blurOverlay);
    }

    const obs = new MutationObserver(function (muts) {
        for (let i = 0; i < muts.length; i++) {
            const m = muts[i];
            for (let j = 0; j < m.addedNodes.length; j++) {
                if (matchesOverlay(m.addedNodes[j])) { schedule(); return; }
            }
            for (let k = 0; k < m.removedNodes.length; k++) {
                if (matchesOverlay(m.removedNodes[k])) { schedule(); return; }
            }
        }
    });

    function start() {
        obs.observe(document.body, { childList: true, subtree: true });
        reconcile();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
