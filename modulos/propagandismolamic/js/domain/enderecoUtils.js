// ===== js/domain/enderecoUtils.js =====
(function () {
'use strict';

/**
 * Endereço: formatação, normalização e URLs de mapa.
 *
 * Nenhuma coordenada é persistida — só o texto. O Google geocodifica
 * do lado dele a partir da string.
 */

const ESTADOS_BR = [
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
    'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

function enderecoVazio() {
    return { cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '' };
}

/** Sem acento e sem caixa — só para comparação e busca, nunca para exibição. */
function normalizeStr(valor) {
    return String(valor || '')
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .trim();
}

function formatarCep(valor) {
    const d = String(valor || '').replace(/\D/g, '').slice(0, 8);
    return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/**
 * Monta a string do endereço.
 * `filter(Boolean)` derruba os campos vazios — funciona com preenchimento
 * parcial em vez de exigir tudo preenchido.
 */
function formatarEndereco(endereco, { incluirCep = true } = {}) {
    if (!endereco) return '';
    const { rua, numero, complemento, bairro, cidade, estado, cep } = endereco;

    return [rua, numero, complemento, bairro, cidade, estado, incluirCep ? formatarCep(cep) : '']
        .map(parte => String(parte || '').trim())
        .filter(Boolean)
        .join(', ');
}

/** Versão curta para cards: rua, número — bairro. */
function resumirEndereco(endereco) {
    if (!endereco) return '';
    const linha = [endereco.rua, endereco.numero].filter(Boolean).join(', ');
    return [linha, endereco.bairro].filter(Boolean).join(' — ');
}

/** Há texto suficiente para o Google tentar localizar? */
function temEnderecoUtil(endereco) {
    return formatarEndereco(endereco).length > 0;
}

/**
 * Iframe embutido.
 *
 * RISCO CONHECIDO: `output=embed` não é documentado pelo Google.
 * Pode ser descontinuado ou passar a exigir key sem aviso. Todo o
 * acoplamento está aqui — trocar por OpenStreetMap é alteração local.
 */
function urlMapsEmbed(endereco) {
    const texto = typeof endereco === 'string' ? endereco : formatarEndereco(endereco);
    if (!texto) return null;
    return `https://www.google.com/maps?q=${encodeURIComponent(texto)}&output=embed`;
}

/** Endpoint oficial e estável — o fallback que sempre funciona. */
function urlMapsExterno(endereco) {
    const texto = typeof endereco === 'string' ? endereco : formatarEndereco(endereco);
    if (!texto) return null;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(texto)}`;
}

/** Normaliza a UF a partir de sigla ou nome por extenso. */
function normalizarEstado(valor) {
    const bruto = String(valor || '').trim();
    if (!bruto) return '';

    const sigla = bruto.toUpperCase();
    if (ESTADOS_BR.includes(sigla)) return sigla;

    const NOMES = {
        acre: 'AC', alagoas: 'AL', amapa: 'AP', amazonas: 'AM', bahia: 'BA',
        ceara: 'CE', 'distrito federal': 'DF', 'espirito santo': 'ES', goias: 'GO',
        maranhao: 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS',
        'minas gerais': 'MG', para: 'PA', paraiba: 'PB', parana: 'PR',
        pernambuco: 'PE', piaui: 'PI', 'rio de janeiro': 'RJ',
        'rio grande do norte': 'RN', 'rio grande do sul': 'RS', rondonia: 'RO',
        roraima: 'RR', 'santa catarina': 'SC', 'sao paulo': 'SP',
        sergipe: 'SE', tocantins: 'TO'
    };

    return NOMES[normalizeStr(bruto)] || '';
}

NS.domain = NS.domain || {};
NS.domain.enderecoUtils = { ESTADOS_BR, enderecoVazio, formatarCep, formatarEndereco, normalizarEstado, normalizeStr, resumirEndereco, temEnderecoUtil, urlMapsEmbed, urlMapsExterno };
})();
