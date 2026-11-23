// ===== js/ui/conexaoBanner.js =====
(function () {
'use strict';

/**
 * Faixa fixa avisando que o app está sem servidor.
 *
 * Não desabilita botões: o app já segue "esconder em vez de desabilitar",
 * e um botão morto por oscilação de rede explica menos que um clique que
 * responde com uma mensagem clara (quem recusa é `carregando.acaoRemota`).
 */

var html = NS.core.dom.html;
var raw = NS.core.dom.raw;
var criarElemento = NS.core.dom.criarElemento;
var on = NS.core.events.on;
var EVENTOS = NS.core.events.EVENTOS;
var icone = NS.ui.icons.icone;
var toast = NS.ui.toast;

/** Blip de rede não merece faixa; queda de verdade, sim. */
const ATRASO_MOSTRAR = 1500;

let faixa = null;
let temporizador = null;
let jaEsteveConectado = false;

function elemento() {
    if (faixa) return faixa;

    faixa = criarElemento(html`
        <div class="faixa-offline" role="alert" hidden>
            ${raw(icone('alerta'))}
            <span>Sem conexão com o servidor. Você pode consultar, mas não salvar.</span>
        </div>
    `);

    const header = document.querySelector('.app-header');
    header?.insertAdjacentElement('afterend', faixa);
    return faixa;
}

function mostrar() {
    elemento().hidden = false;
    document.body.classList.add('sem-conexao');
}

function esconder() {
    if (faixa) faixa.hidden = true;
    document.body.classList.remove('sem-conexao');
}

function refletir(conectado) {
    clearTimeout(temporizador);

    if (conectado) {
        esconder();
        if (jaEsteveConectado) toast.sucesso('Conexão restabelecida.');
        jaEsteveConectado = true;
        return;
    }

    temporizador = setTimeout(mostrar, ATRASO_MOSTRAR);
}

/** @returns {Function} desinscrição */
function iniciar() {
    jaEsteveConectado = NS.core.db.conectado();
    refletir(jaEsteveConectado);
    return on(EVENTOS.CONEXAO_ALTERADA, refletir);
}

NS.ui = NS.ui || {};
NS.ui.conexaoBanner = { iniciar };
})();
