// ===== js/services/enderecoAutocomplete.js =====
(function () {
'use strict';

/**
 * Autocompletar endereço a partir dos médicos já cadastrados.
 *
 * Dois papéis, no mesmo campo:
 *  1. Sugestão: popover de opções já cadastradas, filtradas pelo que foi
 *     digitado E pelos campos irmãos já preenchidos — uma rua de outro
 *     bairro nunca aparece. (Substitui `<datalist>`: o nativo do browser
 *     não é estilizável e sai com fundo escuro forçado pelo tema do SO.)
 *  2. Preenchimento em cascata, do mais para o menos específico:
 *     - Rua: identifica o endereço sozinha — preenche bairro/cidade/UF/CEP.
 *     - Bairro: pode existir em mais de uma cidade — só preenche se todos
 *       os médicos daquele bairro concordarem no resto (senão é ambíguo).
 *     - Cidade: mesma ideia, só preenche a UF (bairro é mais específico
 *       que cidade — não seria seguro herdar um bairro só pela cidade bater).
 *
 * Nunca sobrescreve o que o usuário já digitou — mesma regra do ViaCEP.
 */

var html = NS.core.dom.html;
var raw = NS.core.dom.raw;
var criarElemento = NS.core.dom.criarElemento;
var normalizeStr = NS.domain.enderecoUtils.normalizeStr;

/** Valor único (não normalizado) entre os candidatos, ou '' se houver mais de um. */
function valorUnico(itens, seletor) {
    const encontrados = new Map(); // normalizado -> original
    for (const item of itens) {
        const original = (seletor(item) || '').trim();
        if (!original) continue;
        encontrados.set(normalizeStr(original), original);
        if (encontrados.size > 1) return '';
    }
    return encontrados.size === 1 ? [...encontrados.values()][0] : '';
}

/** Endereços de todos os médicos, ignorando os sem nenhum campo relevante. */
function enderecosCadastrados() {
    return NS.domain.medico.listar()
        .map(m => m.endereco)
        .filter(e => e && (e.rua || e.bairro || e.cidade));
}

function porRua(rua) {
    const alvo = normalizeStr(rua);
    if (!alvo) return [];
    return enderecosCadastrados().filter(e => normalizeStr(e.rua) === alvo);
}

function porBairro(bairro) {
    const alvo = normalizeStr(bairro);
    if (!alvo) return [];
    return enderecosCadastrados().filter(e => normalizeStr(e.bairro) === alvo);
}

function porCidade(cidade) {
    const alvo = normalizeStr(cidade);
    if (!alvo) return [];
    return enderecosCadastrados().filter(e => normalizeStr(e.cidade) === alvo);
}

/**
 * Valores únicos de um campo, ordenados, restritos aos endereços que
 * casam com `filtros` — sugerir uma rua de outro bairro só atrapalha.
 */
function opcoesDoCampo(seletor, filtros = {}) {
    const vistos = new Set();
    const saida = [];

    const candidatos = enderecosCadastrados().filter(e =>
        Object.keys(filtros).every(chave => {
            const esperado = normalizeStr(filtros[chave]);
            return !esperado || normalizeStr(e[chave]) === esperado;
        })
    );

    for (const e of candidatos) {
        const valor = (seletor(e) || '').trim();
        if (!valor) continue;
        const chave = normalizeStr(valor);
        if (vistos.has(chave)) continue;
        vistos.add(chave);
        saida.push(valor);
    }
    return saida.sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/** Trecho que casou com a digitação, destacado em <mark>. */
function opcaoComDestaque(opcao, termo) {
    if (!termo) return html`${opcao}`;
    const alvo = normalizeStr(termo);
    const indice = normalizeStr(opcao).indexOf(alvo);
    if (indice === -1) return html`${opcao}`;

    const antes = opcao.slice(0, indice);
    const meio = opcao.slice(indice, indice + termo.length);
    const depois = opcao.slice(indice + termo.length);
    return html`${antes}${raw(`<mark>${NS.core.dom.esc(meio)}</mark>`)}${depois}`;
}

/**
 * Liga um popover de sugestões a um input de texto simples.
 * @param {HTMLInputElement} input
 * @param {() => string[]} listarOpcoes
 */
function ligarSugestoes(input, listarOpcoes) {
    const container = input.closest('.campo') || input.parentElement;
    if (!container) return;
    container.classList.add('campo-autocomplete');

    const lista = criarElemento('<div class="campo-autocomplete__lista" hidden role="listbox"></div>');
    container.appendChild(lista);

    let ativos = [];
    let indiceAtivo = -1;

    function fechar() {
        lista.hidden = true;
        lista.innerHTML = '';
        ativos = [];
        indiceAtivo = -1;
    }

    function escolher(valor) {
        input.value = valor;
        fechar();
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function marcarAtiva() {
        [...lista.children].forEach((el, i) => {
            el.classList.toggle('campo-autocomplete__opcao--ativa', i === indiceAtivo);
        });
        lista.children[indiceAtivo]?.scrollIntoView({ block: 'nearest' });
    }

    function abrir() {
        const termo = input.value.trim();
        const todas = listarOpcoes();
        const alvo = normalizeStr(termo);
        ativos = (termo ? todas.filter(op => normalizeStr(op).includes(alvo)) : todas).slice(0, 8);

        if (!ativos.length) { fechar(); return; }

        lista.innerHTML = ativos.map(opcao => html`
            <button type="button" class="campo-autocomplete__opcao" role="option">${raw(opcaoComDestaque(opcao, termo))}</button>
        `).join('');
        indiceAtivo = -1;
        lista.hidden = false;
    }

    input.addEventListener('input', abrir);
    input.addEventListener('focus', abrir);

    input.addEventListener('keydown', e => {
        if (lista.hidden) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            indiceAtivo = Math.min(indiceAtivo + 1, ativos.length - 1);
            marcarAtiva();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            indiceAtivo = Math.max(indiceAtivo - 1, 0);
            marcarAtiva();
        } else if (e.key === 'Enter' && indiceAtivo >= 0) {
            e.preventDefault();
            escolher(ativos[indiceAtivo]);
        } else if (e.key === 'Escape') {
            fechar();
        }
    });

    lista.addEventListener('mousedown', e => {
        const botao = e.target.closest('.campo-autocomplete__opcao');
        if (!botao) return;
        e.preventDefault(); // não rouba o foco do input antes do click
        escolher(ativos[[...lista.children].indexOf(botao)]);
    });

    document.addEventListener('click', e => {
        if (!container.contains(e.target)) fechar();
    });
}

/**
 * Liga o autocompletar (sugestão + preenchimento em cascata) aos campos
 * de endereço do formulário.
 * @param {HTMLElement} form
 */
function ligarAutocompletar(form) {
    const campo = nome => form.querySelector(`[name="${nome}"]`);
    const rua = campo('rua');
    const bairro = campo('bairro');
    const cidade = campo('cidade');
    const estado = campo('estado');
    const cep = campo('cep');
    if (!rua || !bairro || !cidade) return;

    // Cada lista respeita o que já foi preenchido: rua de outro bairro, ou
    // bairro de outra cidade, não entram nas sugestões.
    ligarSugestoes(rua, () => opcoesDoCampo(e => e.rua, {
        bairro: bairro.value,
        cidade: cidade.value
    }));
    ligarSugestoes(bairro, () => opcoesDoCampo(e => e.bairro, {
        cidade: cidade.value
    }));
    ligarSugestoes(cidade, () => opcoesDoCampo(e => e.cidade));

    /** Só entra em campo vazio — nunca apaga o que o humano já escreveu. */
    function preencherSeVazio(el, valor) {
        if (el && valor && !el.value.trim()) el.value = valor;
    }

    function aplicarDeUmEndereco(origem) {
        preencherSeVazio(bairro, origem.bairro);
        preencherSeVazio(cidade, origem.cidade);
        preencherSeVazio(estado, origem.estado);
        preencherSeVazio(cep, origem.cep);
    }

    rua.addEventListener('change', () => {
        const candidatos = porRua(rua.value);
        if (!candidatos.length) return;
        // Rua já identifica o endereço: usa o cadastro mais recente como fonte.
        aplicarDeUmEndereco(candidatos[candidatos.length - 1]);
    });

    bairro.addEventListener('change', () => {
        if (rua.value.trim()) return; // rua já manda, bairro não precisa arbitrar
        const candidatos = porBairro(bairro.value);
        if (!candidatos.length) return;

        const cidadeUnica = valorUnico(candidatos, e => e.cidade);
        const estadoUnico = valorUnico(candidatos, e => e.estado);
        // Bairro em mais de uma cidade: ambíguo, deixa manual.
        if (!cidadeUnica) return;

        preencherSeVazio(cidade, cidadeUnica);
        preencherSeVazio(estado, estadoUnico);
    });

    cidade.addEventListener('change', () => {
        if (rua.value.trim() || bairro.value.trim()) return;
        const candidatos = porCidade(cidade.value);
        if (!candidatos.length) return;

        const estadoUnico = valorUnico(candidatos, e => e.estado);
        if (estadoUnico) preencherSeVazio(estado, estadoUnico);
    });
}

NS.services = NS.services || {};
NS.services.enderecoAutocomplete = { ligarAutocompletar };
})();
