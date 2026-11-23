// ===== js/domain/marcador.js =====
(function () {
'use strict';

/**
 * Domínio: Marcador de visita.
 *
 * Catálogo editável de etiquetas coloridas ({ id, nome, cor }). Ao
 * contrário de objetivo — uma escolha única e obrigatória —, a visita
 * referencia VÁRIOS marcadores por id, em `visita.marcadores` (array).
 *
 * A cor é sempre um HEX `#rrggbb` normalizado: o seletor grava neste
 * formato e `corValida` recusa qualquer outra coisa, então o CSS pode
 * interpolar o valor direto sem sanitizar de novo.
 */

var db = NS.core.db;
var normalizeStr = NS.domain.enderecoUtils.normalizeStr;
const COLECAO = 'marcadores';

/** Cor de partida do seletor quando o usuário cria um marcador novo. */
const COR_PADRAO = '#2563eb';

/** Paleta de atalho do seletor — uma volta completa do círculo cromático. */
const CORES_SUGERIDAS = [
    '#ef4444', '#f97316', '#f59e0b', '#eab308',
    '#84cc16', '#22c55e', '#10b981', '#14b8a6',
    '#06b6d4', '#3b82f6', '#2563eb', '#6366f1',
    '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
    '#f43f5e', '#78716c', '#64748b', '#0f172a'
];

function corValida(cor) {
    return /^#[0-9a-f]{6}$/i.test(String(cor || '').trim());
}

/** Aceita `#abc` e `abc123`; devolve `#rrggbb` minúsculo, ou '' se não der. */
function normalizarCor(cor) {
    let valor = String(cor || '').trim().toLowerCase();
    if (!valor) return '';
    if (valor[0] !== '#') valor = '#' + valor;

    if (/^#[0-9a-f]{3}$/.test(valor)) {
        valor = '#' + valor.slice(1).split('').map(c => c + c).join('');
    }

    return corValida(valor) ? valor : '';
}

/**
 * Luminância relativa (WCAG) — decide se o texto sobre a cor sai preto
 * ou branco. Sem isto, um marcador amarelo com texto branco fica ilegível.
 */
function corDoTexto(cor) {
    const hex = normalizarCor(cor) || COR_PADRAO;
    const canal = i => {
        const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    const luminancia = 0.2126 * canal(0) + 0.7152 * canal(1) + 0.0722 * canal(2);
    return luminancia > 0.45 ? '#0f172a' : '#ffffff';
}

/** `#rrggbb` -> `rgba(r, g, b, alfa)`, para os fundos suaves dos chips. */
function corComAlfa(cor, alfa) {
    const hex = normalizarCor(cor) || COR_PADRAO;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alfa})`;
}

function listar() {
    return db.listar(COLECAO)
        .map(m => ({ ...m, cor: normalizarCor(m.cor) || COR_PADRAO }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

function obter(id) {
    const item = db.obter(COLECAO, id);
    return item ? { ...item, cor: normalizarCor(item.cor) || COR_PADRAO } : undefined;
}

function nomeDe(id) {
    return obter(id)?.nome || '';
}

/** Resolve uma lista de ids em marcadores existentes, ignorando os órfãos. */
function dosIds(ids) {
    if (!Array.isArray(ids) || !ids.length) return [];
    return ids.map(obter).filter(Boolean);
}

function porNome(nome) {
    const alvo = normalizeStr(nome);
    return listar().find(m => normalizeStr(m.nome) === alvo) || null;
}

function validar(nome, { ignorarId = null } = {}) {
    const valor = (nome || '').trim();
    if (!valor) return 'Informe o nome do marcador.';
    if (valor.length < 2) return 'Nome muito curto.';
    if (valor.length > 28) return 'Nome muito longo (máx. 28 caracteres).';

    const existente = porNome(valor);
    if (existente && existente.id !== ignorarId) return 'Já existe um marcador com esse nome.';

    return '';
}

function criar(nome, cor) {
    return db.criar(COLECAO, { nome: String(nome).trim(), cor: normalizarCor(cor) || COR_PADRAO });
}

function atualizar(id, { nome, cor } = {}) {
    const patch = {};
    if (nome !== undefined) patch.nome = String(nome).trim();
    if (cor !== undefined) patch.cor = normalizarCor(cor) || COR_PADRAO;
    return db.atualizar(COLECAO, id, patch);
}

/** true se alguma visita usa este marcador — vira aviso antes de excluir. */
function emUso(id) {
    return db.listar('visitas').some(v => Array.isArray(v.marcadores) && v.marcadores.includes(id));
}

function contarUsos(id) {
    return db.listar('visitas').filter(v => Array.isArray(v.marcadores) && v.marcadores.includes(id)).length;
}

/**
 * Excluir um marcador o remove de todas as visitas que o usavam.
 *
 * Diferente de objetivo (que bloqueia a exclusão em uso): marcador é uma
 * etiqueta acessória, e travar a limpeza do catálogo por causa de uma
 * visita antiga só empurraria o usuário a renomear o item para "não usar".
 */
function remover(id) {
    for (const visita of db.listar('visitas')) {
        if (Array.isArray(visita.marcadores) && visita.marcadores.includes(id)) {
            db.atualizar('visitas', visita.id, { marcadores: visita.marcadores.filter(m => m !== id) });
        }
    }
    return db.remover(COLECAO, id);
}

NS.domain = NS.domain || {};
NS.domain.marcador = {
    CORES_SUGERIDAS, COR_PADRAO, atualizar, contarUsos, corComAlfa, corDoTexto, corValida,
    criar, dosIds, emUso, listar, nomeDe, normalizarCor, obter, porNome, remover, validar
};
})();
