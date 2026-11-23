// ===== js/core/navegacao.js =====
(function () {
'use strict';

/**
 * Navegação por hash (#/agenda, #/medicos, #/config).
 *
 * Funciona em servidor estático sem configuração de rewrite.
 * Modais não entram na navegação — são estado efêmero, não destino.
 */

const telas = new Map();

let container = null;
let telaAtual = null;
let caminhoPadrao = '/agenda';
let aoTrocar = null;

function parsear() {
    const bruto = (location.hash || '').replace(/^#/, '');
    if (!bruto) return { caminho: caminhoPadrao, params: {} };

    const [caminho, query = ''] = bruto.split('?');
    const params = {};
    new URLSearchParams(query).forEach((valor, chave) => {
        params[chave] = valor;
    });

    return { caminho: caminho || caminhoPadrao, params };
}

async function resolver() {
    const { caminho, params } = parsear();
    const tela = telas.get(caminho);

    if (!tela) {
        navegar(caminhoPadrao, {}, { substituir: true });
        return;
    }

    // destroy() é obrigatório nas views: o componente de mapa registra
    // IntersectionObserver que vazaria a cada troca de tela.
    try {
        telaAtual?.destroy?.();
    } catch (erro) {
        console.error('Erro ao destruir a tela anterior:', erro);
    }

    container.innerHTML = '';
    telaAtual = tela;
    aoTrocar?.(caminho, params);

    try {
        await tela.render(container, params);
    } catch (erro) {
        console.error('Erro ao renderizar a tela:', erro);
        container.innerHTML = '<p class="texto-muted">Não foi possível carregar esta tela.</p>';
    }

    container.scrollTop = 0;
}

function registrar(caminho, tela) {
    telas.set(caminho, tela);
}

function iniciar(elemento, { padrao = '/agenda', onTrocar } = {}) {
    container = elemento;
    caminhoPadrao = padrao;
    aoTrocar = onTrocar;

    window.addEventListener('hashchange', resolver);

    if (!location.hash) navegar(caminhoPadrao, {}, { substituir: true });
    else resolver();
}

function navegar(caminho, params = {}, { substituir = false } = {}) {
    const query = new URLSearchParams(params).toString();
    const destino = `#${caminho}${query ? `?${query}` : ''}`;

    if (location.hash === destino) {
        resolver();
        return;
    }

    if (substituir) {
        history.replaceState(null, '', destino);
        resolver();
    } else {
        location.hash = destino;
    }
}

function caminhoAtual() {
    return parsear().caminho;
}

NS.core = NS.core || {};
NS.core.navegacao = { caminhoAtual, iniciar, navegar, registrar };
})();
