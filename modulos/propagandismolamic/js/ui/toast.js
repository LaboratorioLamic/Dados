// ===== js/ui/toast.js =====
(function () {
'use strict';

/** Notificações efêmeras no canto da tela. */

var html = NS.core.dom.html;
var raw = NS.core.dom.raw;
var icone = NS.ui.icons.icone;
const ICONES = {
    sucesso: 'checkCirculo',
    erro: 'fecharCirculo',
    alerta: 'alerta',
    info: 'info'
};

let raiz = null;

function obterRaiz() {
    if (!raiz) raiz = document.getElementById('toast-root');
    return raiz;
}

function toast(mensagem, tipo = 'sucesso', duracao = 3600) {
    const container = obterRaiz();
    if (!container) return;

    const elemento = document.createElement('div');
    elemento.className = `toast toast--${tipo}`;
    elemento.innerHTML = html`
        ${raw(icone(ICONES[tipo] || ICONES.info))}
        <span class="toast__msg">${mensagem}</span>
    `;

    container.appendChild(elemento);
    requestAnimationFrame(() => elemento.classList.add('toast--visivel'));

    const remover = () => {
        elemento.classList.remove('toast--visivel');
        setTimeout(() => elemento.remove(), 220);
    };

    const timer = setTimeout(remover, duracao);
    elemento.addEventListener('click', () => {
        clearTimeout(timer);
        remover();
    });
}

const sucesso = (msg, duracao) => toast(msg, 'sucesso', duracao);
const erro = (msg, duracao) => toast(msg, 'erro', duracao ?? 5000);
const alerta = (msg, duracao) => toast(msg, 'alerta', duracao ?? 4500);
const info = (msg, duracao) => toast(msg, 'info', duracao);

NS.ui = NS.ui || {};
NS.ui.toast = { alerta, erro, info, sucesso, toast };
})();
