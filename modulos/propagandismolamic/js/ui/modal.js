// ===== js/ui/modal.js =====
(function () {
'use strict';

/**
 * Modais empilháveis.
 *
 * Fora do sistema de navegação de propósito: modal é estado efêmero,
 * não destino. Sincronizar histórico com pilha de modais custaria
 * complexidade sem retorno num app local.
 */

var html = NS.core.dom.html;
var raw = NS.core.dom.raw;
var criarElemento = NS.core.dom.criarElemento;
var icone = NS.ui.icons.icone;
const pilha = [];
let raiz = null;

function obterRaiz() {
    if (!raiz) raiz = document.getElementById('modal-root');
    return raiz;
}

const FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function prenderFoco(overlay, e) {
    if (e.key !== 'Tab') return;

    const focaveis = Array.from(overlay.querySelectorAll(FOCAVEIS))
        .filter(el => el.offsetParent !== null);
    if (!focaveis.length) return;

    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];

    if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
    }
}

/**
 * Abre um modal.
 *
 * @param {object} opcoes
 * @param {string} opcoes.titulo
 * @param {string} [opcoes.subtitulo]
 * @param {string} opcoes.corpo         markup já confiável
 * @param {boolean} [opcoes.largo]
 * @param {Function} [opcoes.aoMontar]  recebe ({ corpo, fechar })
 * @param {Function} [opcoes.aoFechar]
 * @returns {{ fechar: Function, elemento: HTMLElement }}
 */
function abrir({ titulo, subtitulo = '', corpo = '', largo = false, aoMontar, aoFechar }) {
    const container = obterRaiz();
    const focoAnterior = document.activeElement;

    const overlay = criarElemento(html`
        <div class="modal-overlay" role="dialog" aria-modal="true" aria-label="${titulo}">
            <div class="modal${raw(largo ? ' modal--largo' : '')}">
                <div class="modal__header">
                    <div>
                        <h2 class="modal__titulo">${titulo}</h2>
                        ${raw(subtitulo ? html`<p class="modal__sub">${subtitulo}</p>` : '')}
                    </div>
                    <button type="button" class="modal__fechar" data-modal-fechar aria-label="Fechar">
                        ${raw(icone('fechar'))}
                    </button>
                </div>
                <div class="modal__corpo"></div>
            </div>
        </div>
    `);

    overlay.querySelector('.modal__corpo').innerHTML = corpo;
    container.appendChild(overlay);

    let fechado = false;

    const fechar = resultado => {
        if (fechado) return;
        fechado = true;

        document.removeEventListener('keydown', aoTeclar);
        overlay.classList.remove('modal-overlay--visivel');

        const indice = pilha.indexOf(instancia);
        if (indice !== -1) pilha.splice(indice, 1);
        if (!pilha.length) document.body.style.overflow = '';

        setTimeout(() => {
            overlay.remove();
            if (focoAnterior?.isConnected) focoAnterior.focus();
        }, 220);

        aoFechar?.(resultado);
    };

    function aoTeclar(e) {
        // Só o modal do topo responde ao teclado.
        if (pilha[pilha.length - 1] !== instancia) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            fechar();
        } else {
            prenderFoco(overlay, e);
        }
    }

    overlay.addEventListener('click', e => {
        if (e.target === overlay) fechar();
        else if (e.target.closest('[data-modal-fechar]')) fechar();
    });

    document.addEventListener('keydown', aoTeclar);

    const instancia = { overlay, fechar };
    pilha.push(instancia);
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(() => {
        overlay.classList.add('modal-overlay--visivel');

        const corpoEl = overlay.querySelector('.modal__corpo');
        aoMontar?.({ corpo: corpoEl, fechar, overlay });

        // Foca o primeiro campo útil e visível; senão, o botão de fechar.
        const candidatos = corpoEl.querySelectorAll('input:not([type="hidden"]), select, textarea');
        const alvo = Array.from(candidatos).find(el => el.offsetParent !== null)
            || overlay.querySelector('[data-modal-fechar]');
        alvo?.focus({ preventScroll: true });
    });

    return instancia;
}

function fecharTodos() {
    [...pilha].reverse().forEach(instancia => instancia.fechar());
}

/**
 * Modal de confirmação. Resolve para true/false.
 */
function confirmar({
    titulo,
    mensagem,
    detalhe = '',
    confirmarTexto = 'Confirmar',
    cancelarTexto = 'Cancelar',
    perigo = false
}) {
    return new Promise(resolve => {
        let resultado = false;

        abrir({
            titulo,
            corpo: html`
                <div class="confirmacao">
                    <div class="confirmacao__aviso${raw(perigo ? ' confirmacao__aviso--perigo' : '')}">
                        ${mensagem}
                    </div>
                    ${raw(detalhe ? html`<div class="confirmacao__lista">${raw(detalhe)}</div>` : '')}
                    <div class="form__acoes">
                        <button type="button" class="btn btn--outline" data-acao="cancelar">${cancelarTexto}</button>
                        <button type="button" class="btn ${raw(perigo ? 'btn--perigo' : 'btn--primario')}" data-acao="confirmar">
                            ${confirmarTexto}
                        </button>
                    </div>
                </div>
            `,
            aoMontar({ corpo, fechar }) {
                corpo.querySelector('[data-acao="cancelar"]').addEventListener('click', () => fechar());
                corpo.querySelector('[data-acao="confirmar"]').addEventListener('click', () => {
                    resultado = true;
                    fechar();
                });
            },
            aoFechar() {
                resolve(resultado);
            }
        });
    });
}

NS.ui = NS.ui || {};
NS.ui.modal = { abrir, confirmar, fecharTodos };
})();
