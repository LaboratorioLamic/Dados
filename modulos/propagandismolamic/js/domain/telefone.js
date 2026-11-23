// ===== js/domain/telefone.js =====
(function () {
'use strict';

/**
 * Telefone e WhatsApp.
 *
 * O wa.me exige o número só com dígitos e com código do país:
 * `https://wa.me/5588998441122` — sem `+`, parênteses ou traço.
 */

const DDI_BR = '55';

function apenasDigitos(valor) {
    return String(valor || '').replace(/\D/g, '');
}

/** Máscara progressiva: (88) 99844-1122 ou (88) 3344-1122. */
function formatarTelefone(valor) {
    const d = apenasDigitos(valor).slice(0, 11);
    if (!d) return '';
    if (d.length <= 2) return `(${d}`;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Celular brasileiro: 11 dígitos com 9 na frente do número, após o DDD. */
function ehCelular(valor) {
    const d = apenasDigitos(valor);
    return d.length === 11 && d[2] === '9';
}

/** Aceita fixo (10) e celular (11). */
function ehTelefoneValido(valor) {
    const d = apenasDigitos(valor);
    return d.length === 10 || d.length === 11;
}

/**
 * Monta a URL do WhatsApp. Devolve null quando o número não serve —
 * quem chama decide se renderiza o ícone.
 */
function urlWhatsApp(valor) {
    let d = apenasDigitos(valor);
    if (!d) return null;

    // Já veio com DDI: 55 + DDD + número.
    if (d.length > 11 && d.startsWith(DDI_BR)) d = d.slice(DDI_BR.length);
    if (d.length !== 10 && d.length !== 11) return null;

    return `https://wa.me/${DDI_BR}${d}`;
}

/** Liga direto pelo dispositivo. */
function urlTelefone(valor) {
    const d = apenasDigitos(valor);
    return d ? `tel:+${DDI_BR}${d}` : null;
}

/** Liga a máscara a um input, preservando a posição do cursor no fim. */
function aplicarMascaraTelefone(input) {
    if (!input) return;
    input.addEventListener('input', () => {
        const fim = input.selectionStart === input.value.length;
        input.value = formatarTelefone(input.value);
        if (fim) input.setSelectionRange(input.value.length, input.value.length);
    });
}

NS.domain = NS.domain || {};
NS.domain.telefone = { apenasDigitos, aplicarMascaraTelefone, ehCelular, ehTelefoneValido, formatarTelefone, urlTelefone, urlWhatsApp };
})();
