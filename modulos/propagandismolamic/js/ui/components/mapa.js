// ===== js/ui/components/mapa.js =====
(function () {
'use strict';

/**
 * Mapa do Google embutido.
 *
 * Nunca devolve um iframe pronto: devolve um placeholder que só vira
 * iframe quando faz sentido carregar. Isso contém o risco de disparar
 * N requisições simultâneas a um endpoint não documentado.
 *
 * - Agenda        -> placeholder clicável (usuário decide)
 * - Detalhe médico-> auto-lazy via IntersectionObserver
 *
 * O link externo usa o endpoint OFICIAL e funciona sempre, mesmo que
 * o embed seja bloqueado.
 */

var html = NS.core.dom.html;
var raw = NS.core.dom.raw;
var criarElemento = NS.core.dom.criarElemento;
var formatarEndereco = NS.domain.enderecoUtils.formatarEndereco;
var urlMapsEmbed = NS.domain.enderecoUtils.urlMapsEmbed;
var urlMapsExterno = NS.domain.enderecoUtils.urlMapsExterno;
var icone = NS.ui.icons.icone;
const TIMEOUT_CARGA = 8000;

/** Um único observer para todos os mapas — não um por card. */
let observer = null;

function obterObserver() {
    if (observer) return observer;
    if (typeof IntersectionObserver === 'undefined') return null;

    observer = new IntersectionObserver(entradas => {
        for (const entrada of entradas) {
            if (!entrada.isIntersecting) continue;
            observer.unobserve(entrada.target);
            entrada.target.__carregarMapa?.();
        }
    }, { rootMargin: '200px' });

    return observer;
}

function blocoIndisponivel(mensagem, urlExterna, endereco) {
    return html`
        <div class="mapa mapa--indisponivel">
            <div class="mapa__placeholder">
                <span class="mapa__icone">${raw(icone('alerta'))}</span>
                <span class="mapa__texto">
                    <span class="mapa__endereco">${mensagem}</span>
                    ${raw(endereco ? html`<span class="mapa__acao">${endereco}</span>` : '')}
                </span>
            </div>
            ${raw(urlExterna ? html`
                <div class="mapa__rodape">
                    <span class="texto-muted">Mapa indisponível</span>
                    <a href="${urlExterna}" target="_blank" rel="noopener">Abrir no Google Maps</a>
                </div>
            ` : '')}
        </div>
    `;
}

/**
 * @param {object|string} endereco
 * @param {object} opcoes
 * @param {boolean} [opcoes.auto]   true = carrega ao entrar na viewport
 * @param {string}  [opcoes.rotulo] texto do placeholder
 * @returns {HTMLElement}
 */
function criarMapa(endereco, { auto = false, rotulo = 'Ver mapa' } = {}) {
    const texto = typeof endereco === 'string' ? endereco : formatarEndereco(endereco);
    const urlExterna = urlMapsExterno(texto);
    const urlEmbed = urlMapsEmbed(texto);

    if (!texto || !urlEmbed) {
        return criarElemento(blocoIndisponivel(
            'Endereço não informado',
            null,
            'Complete o cadastro para ver o mapa.'
        ));
    }

    const container = criarElemento(html`
        <div class="mapa" data-mapa>
            <button type="button" class="mapa__placeholder" data-mapa-abrir>
                <span class="mapa__icone">${raw(icone('mapa'))}</span>
                <span class="mapa__texto">
                    <span class="mapa__endereco">${texto}</span>
                    <span class="mapa__acao">${rotulo}</span>
                </span>
            </button>
        </div>
    `);

    let carregado = false;
    let timer = null;

    const mostrarFalha = () => {
        clearTimeout(timer);
        container.innerHTML = '';
        container.className = 'mapa mapa--indisponivel';
        container.innerHTML = html`
            <div class="mapa__placeholder">
                <span class="mapa__icone">${raw(icone('alerta'))}</span>
                <span class="mapa__texto">
                    <span class="mapa__endereco">Não foi possível carregar o mapa</span>
                    <span class="mapa__acao">${texto}</span>
                </span>
            </div>
            <div class="mapa__rodape">
                <span class="texto-muted">Sem conexão ou bloqueado</span>
                <a href="${urlExterna}" target="_blank" rel="noopener">Abrir no Google Maps</a>
            </div>
        `;
    };

    const carregar = () => {
        if (carregado) return;
        carregado = true;

        container.innerHTML = html`
            <iframe
                class="mapa__frame"
                src="${urlEmbed}"
                title="Mapa de ${texto}"
                loading="lazy"
                referrerpolicy="no-referrer-when-downgrade"
            ></iframe>
            <div class="mapa__rodape">
                <button type="button" class="btn btn--sutil btn--sm" data-mapa-fechar>Ocultar mapa</button>
                <a href="${urlExterna}" target="_blank" rel="noopener">Abrir no Google Maps</a>
            </div>
        `;

        const frame = container.querySelector('iframe');
        timer = setTimeout(mostrarFalha, TIMEOUT_CARGA);
        frame.addEventListener('load', () => clearTimeout(timer));
        frame.addEventListener('error', mostrarFalha);
    };

    const recolher = () => {
        clearTimeout(timer);

        // Zerar o src antes de remover: mata o request pendente.
        const frame = container.querySelector('iframe');
        if (frame) frame.src = 'about:blank';

        carregado = false;
        container.className = 'mapa';
        container.innerHTML = html`
            <button type="button" class="mapa__placeholder" data-mapa-abrir>
                <span class="mapa__icone">${raw(icone('mapa'))}</span>
                <span class="mapa__texto">
                    <span class="mapa__endereco">${texto}</span>
                    <span class="mapa__acao">${rotulo}</span>
                </span>
            </button>
        `;
    };

    container.addEventListener('click', e => {
        if (e.target.closest('[data-mapa-abrir]')) carregar();
        else if (e.target.closest('[data-mapa-fechar]')) recolher();
    });

    container.__carregarMapa = carregar;
    container.__limparMapa = () => {
        clearTimeout(timer);
        const frame = container.querySelector('iframe');
        if (frame) frame.src = 'about:blank';
        obterObserver()?.unobserve(container);
    };

    if (auto) obterObserver()?.observe(container);

    return container;
}

/**
 * Desmonta todos os mapas de um container.
 * Chamado pelo `destroy()` das views — sem isso, os observers vazam
 * a cada troca de tela.
 */
function limparMapas(escopo = document) {
    escopo.querySelectorAll('[data-mapa]').forEach(el => el.__limparMapa?.());
}

NS.ui = NS.ui || {};
NS.ui.components = NS.ui.components || {};
NS.ui.components.mapa = { criarMapa, limparMapas };
})();
