// ===== js/core/dom.js =====
(function () {
'use strict';

/**
 * Helpers de DOM e templating.
 *
 * Regra central: toda interpolação em `html` é escapada por padrão.
 * Isso mata a classe inteira de bugs com aspas em nomes de médicos e
 * notas de visita. Para inserir markup já confiável (SVG, sub-componente),
 * usa-se `raw()` explicitamente.
 */

const MARCA_RAW = Symbol('raw');

function esc(valor) {
    if (valor === null || valor === undefined || valor === false) return '';
    return String(valor)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** Marca uma string como HTML confiável, dispensando o escape. */
function raw(texto) {
    return { [MARCA_RAW]: true, valor: String(texto ?? '') };
}

function interpolar(valor) {
    if (valor === null || valor === undefined || valor === false) return '';
    if (Array.isArray(valor)) return valor.map(interpolar).join('');
    if (typeof valor === 'object' && valor[MARCA_RAW]) return valor.valor;
    return esc(valor);
}

/** Tagged template: html`<p>${nomeDoMedico}</p>` */
function html(strings, ...valores) {
    let saida = '';
    for (let i = 0; i < strings.length; i++) {
        saida += strings[i];
        if (i < valores.length) saida += interpolar(valores[i]);
    }
    return saida;
}

/* ------------------------------------------------------------------ *
 * Manipulação
 * ------------------------------------------------------------------ */

function $(seletor, escopo = document) {
    return escopo.querySelector(seletor);
}

function $$(seletor, escopo = document) {
    return Array.from(escopo.querySelectorAll(seletor));
}

/** Substitui o conteúdo de um container por markup. */
function montar(container, markup) {
    container.innerHTML = markup;
    return container;
}

/** Cria um elemento a partir de markup, devolvendo o primeiro nó. */
function criarElemento(markup) {
    const molde = document.createElement('template');
    molde.innerHTML = markup.trim();
    return molde.content.firstElementChild;
}

/**
 * Delegação de eventos: um listener por container, sobrevive a re-renders
 * internos. Substitui `onclick=` inline, que o projeto não usa em lugar nenhum.
 */
function delegar(container, evento, seletor, handler) {
    const ouvinte = e => {
        const alvo = e.target.closest(seletor);
        if (alvo && container.contains(alvo)) handler(e, alvo);
    };
    container.addEventListener(evento, ouvinte);
    return () => container.removeEventListener(evento, ouvinte);
}

/** Delegação por atributo `data-acao`, mapeando para um objeto de handlers. */
function delegarAcoes(container, acoes, evento = 'click') {
    return delegar(container, evento, '[data-acao]', (e, alvo) => {
        const acao = acoes[alvo.dataset.acao];
        if (!acao) return;
        e.preventDefault();
        acao(alvo.dataset, alvo, e);
    });
}

/* ------------------------------------------------------------------ *
 * Formatação
 * ------------------------------------------------------------------ */

function iniciais(nome) {
    if (!nome) return '?';
    const partes = String(nome)
        .replace(/^(dr|dra|drª)\.?\s+/i, '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    if (!partes.length) return '?';
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/** 'YYYY-MM-DD' -> 'DD/MM/AAAA', sem passar por Date (evita fuso). */
function formatarData(iso) {
    if (!iso) return '';
    const [ano, mes, dia] = String(iso).split('-');
    return ano && mes && dia ? `${dia}/${mes}/${ano}` : String(iso);
}

const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** 'YYYY-MM-DD' -> 'terça-feira, 12 ago'. Monta a data em horário local. */
function formatarDataExtensa(iso) {
    if (!iso) return '';
    const [ano, mes, dia] = String(iso).split('-').map(Number);
    if (!ano || !mes || !dia) return String(iso);
    const data = new Date(ano, mes - 1, dia);
    return `${DIAS_SEMANA[data.getDay()]}, ${dia} ${MESES[mes - 1]}`;
}

/** Data de hoje como 'YYYY-MM-DD' no fuso local. */
function hojeISO() {
    const agora = new Date();
    const mes = String(agora.getMonth() + 1).padStart(2, '0');
    const dia = String(agora.getDate()).padStart(2, '0');
    return `${agora.getFullYear()}-${mes}-${dia}`;
}

/** Diferença em dias entre duas datas ISO (b - a). */
function diffDias(isoA, isoB) {
    const [aA, mA, dA] = String(isoA).split('-').map(Number);
    const [aB, mB, dB] = String(isoB).split('-').map(Number);
    if (!aA || !aB) return 0;
    const inicio = new Date(aA, mA - 1, dA);
    const fim = new Date(aB, mB - 1, dB);
    return Math.round((fim - inicio) / 86400000);
}

function pluralizar(quantidade, singular, plural) {
    return `${quantidade} ${quantidade === 1 ? singular : plural}`;
}

NS.core = NS.core || {};
NS.core.dom = { $, $$, criarElemento, delegar, delegarAcoes, diffDias, esc, formatarData, formatarDataExtensa, hojeISO, html, iniciais, montar, pluralizar, raw };
})();
