// ===== js/ui/forms/marcadorForm.js =====
(function () {
'use strict';

/**
 * Gerenciador de marcadores: criar, editar (nome + cor) e excluir.
 *
 * Não reaproveita `catalogoForm` porque marcador tem um segundo campo — a
 * cor — e uma edição em duas etapas (escolher a cor num seletor, confirmar).
 * Forçar os dois casos no mesmo modal genérico deixaria os dois piores.
 *
 * O seletor de cores é feito à mão (matriz saturação/valor + trilho de
 * matiz + HEX), não `<input type="color">`: o nativo abre o diálogo do
 * sistema operacional, que no Windows aparece fora do modal e ignora
 * inteiramente o visual do app.
 */

var html = NS.core.dom.html;
var raw = NS.core.dom.raw;
var modal = NS.ui.modal;
var toast = NS.ui.toast;
var icone = NS.ui.icons.icone;
var carregando = NS.ui.carregando;
var marcadores = NS.domain.marcador;

/* ------------------------------------------------------------------ *
 * Conversão de cor (HSV <-> HEX)
 * ------------------------------------------------------------------ */

function hexParaRgb(hex) {
    const valor = marcadores.normalizarCor(hex) || marcadores.COR_PADRAO;
    return {
        r: parseInt(valor.slice(1, 3), 16),
        g: parseInt(valor.slice(3, 5), 16),
        b: parseInt(valor.slice(5, 7), 16)
    };
}

function rgbParaHex(r, g, b) {
    const canal = v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
    return `#${canal(r)}${canal(g)}${canal(b)}`;
}

/** @returns {{h: number, s: number, v: number}} h em graus, s/v de 0 a 1 */
function hexParaHsv(hex) {
    const { r, g, b } = hexParaRgb(hex);
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const delta = max - min;

    let h = 0;
    if (delta) {
        if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
        else if (max === gn) h = 60 * ((bn - rn) / delta + 2);
        else h = 60 * ((rn - gn) / delta + 4);
    }
    if (h < 0) h += 360;

    return { h, s: max ? delta / max : 0, v: max };
}

function hsvParaHex(h, s, v) {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    const setor = Math.floor((((h % 360) + 360) % 360) / 60);

    const tabela = [
        [c, x, 0], [x, c, 0], [0, c, x],
        [0, x, c], [x, 0, c], [c, 0, x]
    ];
    const [r, g, b] = tabela[setor] || tabela[0];

    return rgbParaHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/* ------------------------------------------------------------------ *
 * Seletor de cores
 * ------------------------------------------------------------------ */

function markupSeletorCor(corInicial) {
    return html`
        <div class="seletor-cor" data-seletor-cor>
            <div class="seletor-cor__topo">
                <span class="seletor-cor__amostra" data-cor-amostra style="background: ${corInicial}"></span>
                <div class="seletor-cor__hex-wrap">
                    <label class="seletor-cor__hex-rotulo" for="campo-cor-hex">HEX</label>
                    <input type="text" class="seletor-cor__hex" id="campo-cor-hex" data-cor-hex
                           value="${corInicial}" maxlength="7" spellcheck="false" autocomplete="off">
                </div>
            </div>

            <div class="seletor-cor__area" data-cor-area tabindex="0" role="slider"
                 aria-label="Saturação e brilho" aria-valuetext="${corInicial}">
                <span class="seletor-cor__alca" data-cor-alca></span>
            </div>

            <div class="seletor-cor__matiz" data-cor-matiz tabindex="0" role="slider"
                 aria-label="Matiz" aria-valuemin="0" aria-valuemax="360" aria-valuenow="0">
                <span class="seletor-cor__alca seletor-cor__alca--matiz" data-cor-alca-matiz></span>
            </div>

            <div class="seletor-cor__paleta" role="group" aria-label="Cores sugeridas">
                ${raw(marcadores.CORES_SUGERIDAS.map(cor => html`
                    <button type="button" class="seletor-cor__atalho" data-cor-atalho="${cor}"
                            style="background: ${cor}" title="${cor}" aria-label="Usar a cor ${cor}"></button>
                `).join(''))}
            </div>
        </div>
    `;
}

/**
 * Liga o seletor de cores já renderizado dentro de `escopo`.
 * @returns {{cor: () => string, definir: (hex: string) => void}}
 */
function ligarSeletorCor(escopo, corInicial, aoMudar) {
    const raizSeletor = escopo.querySelector('[data-seletor-cor]');
    const area = raizSeletor.querySelector('[data-cor-area]');
    const alca = raizSeletor.querySelector('[data-cor-alca]');
    const matiz = raizSeletor.querySelector('[data-cor-matiz]');
    const alcaMatiz = raizSeletor.querySelector('[data-cor-alca-matiz]');
    const amostra = raizSeletor.querySelector('[data-cor-amostra]');
    const campoHex = raizSeletor.querySelector('[data-cor-hex]');

    let { h, s, v } = hexParaHsv(corInicial);
    let corAtual = marcadores.normalizarCor(corInicial) || marcadores.COR_PADRAO;

    /** Repinta tudo a partir de h/s/v. */
    function refletir({ atualizarCampo = true } = {}) {
        corAtual = hsvParaHex(h, s, v);

        area.style.setProperty('--matiz', hsvParaHex(h, 1, 1));
        alca.style.left = `${s * 100}%`;
        alca.style.top = `${(1 - v) * 100}%`;
        alca.style.background = corAtual;
        alcaMatiz.style.left = `${(h / 360) * 100}%`;
        alcaMatiz.style.background = hsvParaHex(h, 1, 1);
        amostra.style.background = corAtual;
        area.setAttribute('aria-valuetext', corAtual);
        matiz.setAttribute('aria-valuenow', String(Math.round(h)));

        if (atualizarCampo) campoHex.value = corAtual;
        aoMudar?.(corAtual);
    }

    /** Fração 0..1 da posição do ponteiro dentro do elemento. */
    function fracao(evento, elemento, eixo) {
        const caixa = elemento.getBoundingClientRect();
        const ponto = eixo === 'x'
            ? (evento.clientX - caixa.left) / caixa.width
            : (evento.clientY - caixa.top) / caixa.height;
        return Math.min(1, Math.max(0, ponto));
    }

    /**
     * Arraste com Pointer Events + `setPointerCapture`: o ponteiro pode sair
     * da área (ou do modal) no meio do gesto e os eventos continuam chegando,
     * sem precisar pendurar listener em `document` e removê-lo depois.
     */
    function ligarArraste(elemento, aplicar) {
        function aoMover(e) {
            e.preventDefault();
            aplicar(e);
        }

        elemento.addEventListener('pointerdown', e => {
            e.preventDefault();
            // A captura é um reforço, não um pré-requisito: ela lança quando o
            // ponteiro já não está ativo, e deixar a exceção subir aqui mataria
            // o resto do handler — o clique não pintaria cor nenhuma.
            try {
                elemento.setPointerCapture(e.pointerId);
            } catch { /* segue sem captura: o arraste ainda funciona dentro da área */ }

            elemento.addEventListener('pointermove', aoMover);
            aplicar(e);
        });

        elemento.addEventListener('pointerup', e => {
            elemento.removeEventListener('pointermove', aoMover);
            try {
                if (elemento.hasPointerCapture(e.pointerId)) elemento.releasePointerCapture(e.pointerId);
            } catch { /* nada a liberar */ }
        });

        elemento.addEventListener('pointercancel', () => {
            elemento.removeEventListener('pointermove', aoMover);
        });
    }

    ligarArraste(area, e => {
        s = fracao(e, area, 'x');
        v = 1 - fracao(e, area, 'y');
        refletir();
    });

    ligarArraste(matiz, e => {
        h = fracao(e, matiz, 'x') * 360;
        refletir();
    });

    // Teclado: setas dão um passo, Shift dá um passo grande — o seletor
    // inteiro é operável sem mouse, que é o mínimo para um campo assim.
    area.addEventListener('keydown', e => {
        const passo = e.shiftKey ? 0.1 : 0.02;
        if (e.key === 'ArrowLeft') s = Math.max(0, s - passo);
        else if (e.key === 'ArrowRight') s = Math.min(1, s + passo);
        else if (e.key === 'ArrowUp') v = Math.min(1, v + passo);
        else if (e.key === 'ArrowDown') v = Math.max(0, v - passo);
        else return;
        e.preventDefault();
        refletir();
    });

    matiz.addEventListener('keydown', e => {
        const passo = e.shiftKey ? 30 : 4;
        if (e.key === 'ArrowLeft') h = (h - passo + 360) % 360;
        else if (e.key === 'ArrowRight') h = (h + passo) % 360;
        else return;
        e.preventDefault();
        refletir();
    });

    campoHex.addEventListener('input', () => {
        const normalizada = marcadores.normalizarCor(campoHex.value);
        if (!normalizada) return;
        ({ h, s, v } = hexParaHsv(normalizada));
        // Sem reescrever o campo: o usuário ainda pode estar digitando.
        refletir({ atualizarCampo: false });
    });

    // Ao sair do campo, o texto volta a ser o da cor válida — nada de deixar
    // um "#12" pendurado prometendo uma cor que não foi aplicada.
    campoHex.addEventListener('blur', () => { campoHex.value = corAtual; });

    raizSeletor.addEventListener('click', e => {
        const atalho = e.target.closest('[data-cor-atalho]');
        if (!atalho) return;
        ({ h, s, v } = hexParaHsv(atalho.dataset.corAtalho));
        refletir();
    });

    refletir();

    return {
        cor: () => corAtual,
        definir(hex) {
            ({ h, s, v } = hexParaHsv(hex));
            refletir();
        }
    };
}

/* ------------------------------------------------------------------ *
 * Modal de criar / editar um marcador
 * ------------------------------------------------------------------ */

/** Aplica a cor de um marcador nas variáveis que o chip usa. */
function pintarChip(elemento, cor) {
    elemento.style.setProperty('--marcador-cor', cor);
    elemento.style.setProperty('--marcador-fundo', marcadores.corComAlfa(cor, 0.12));
    elemento.style.setProperty('--marcador-borda', marcadores.corComAlfa(cor, 0.34));
}

/** Estilo inline do chip, para quando ele nasce de uma string de markup. */
function estiloChip(cor) {
    return `--marcador-cor: ${cor}; --marcador-fundo: ${marcadores.corComAlfa(cor, 0.12)}; --marcador-borda: ${marcadores.corComAlfa(cor, 0.34)}`;
}

function abrirEditorMarcador(existente = null) {
    return new Promise(resolve => {
        const corInicial = existente?.cor || marcadores.COR_PADRAO;
        const nomeInicial = existente?.nome || '';
        let salvo = null;

        modal.abrir({
            titulo: existente ? 'Editar marcador' : 'Novo marcador',
            subtitulo: 'Escolha o nome e a cor da etiqueta',
            corpo: html`
                <form class="form" id="form-marcador" novalidate>
                    <div class="campo" data-campo="nome">
                        <label class="campo__label" for="campo-marcador-nome">Nome <span class="campo__obrigatorio" aria-hidden="true">*</span></label>
                        <input type="text" class="campo__controle" id="campo-marcador-nome" name="nome"
                               value="${nomeInicial}" maxlength="28" autocomplete="off" placeholder="Ex: Prioridade">
                        <span class="campo__erro" data-erro="nome"></span>
                    </div>

                    <div class="campo">
                        <span class="campo__label">Cor do marcador</span>
                        ${raw(markupSeletorCor(corInicial))}
                    </div>

                    <div class="campo">
                        <span class="campo__label">Prévia</span>
                        <div class="marcador-previa">
                            <span class="marcador-chip" data-previa-chip>
                                ${raw(icone('marcador'))}
                                <span data-previa-nome>${nomeInicial || 'Marcador'}</span>
                            </span>
                        </div>
                    </div>

                    <div class="form__acoes">
                        <button type="button" class="btn btn--outline" data-modal-fechar>Cancelar</button>
                        <button type="submit" class="btn btn--primario">
                            ${raw(icone('check'))} Salvar
                        </button>
                    </div>
                </form>
            `,

            aoMontar({ corpo, fechar }) {
                const form = corpo.querySelector('#form-marcador');
                const campoNome = form.querySelector('[name="nome"]');
                const erro = form.querySelector('[data-erro="nome"]');
                const chip = form.querySelector('[data-previa-chip]');
                const previaNome = form.querySelector('[data-previa-nome]');

                const seletor = ligarSeletorCor(form, corInicial, cor => pintarChip(chip, cor));

                campoNome.addEventListener('input', () => {
                    previaNome.textContent = campoNome.value.trim() || 'Marcador';
                    erro.textContent = '';
                    form.querySelector('[data-campo="nome"]').classList.remove('campo--invalido');
                });

                form.addEventListener('submit', async e => {
                    e.preventDefault();

                    const nome = campoNome.value.trim();
                    const mensagem = marcadores.validar(nome, { ignorarId: existente?.id || null });

                    if (mensagem) {
                        erro.textContent = mensagem;
                        form.querySelector('[data-campo="nome"]').classList.add('campo--invalido');
                        campoNome.focus();
                        return;
                    }

                    const cor = seletor.cor();
                    const gravar = () => existente
                        ? marcadores.atualizar(existente.id, { nome, cor })
                        : marcadores.criar(nome, cor);

                    const resultado = await carregando.acaoRemota(gravar, { mensagem: 'Salvando marcador…' });
                    if (!resultado.ok) return;

                    salvo = resultado.valor;
                    fechar();
                });

                requestAnimationFrame(() => campoNome.focus());
            },

            aoFechar() {
                resolve(salvo);
            }
        });
    });
}

/* ------------------------------------------------------------------ *
 * Modal de gerenciamento (lista)
 * ------------------------------------------------------------------ */

function rotuloUsos(quantidade) {
    if (!quantidade) return 'Sem uso';
    return quantidade === 1 ? '1 visita' : `${quantidade} visitas`;
}

function itemGerenciar(marcador) {
    return html`
        <div class="marcador-linha" data-marcador="${marcador.id}">
            <span class="marcador-chip" style="${estiloChip(marcador.cor)}">
                ${raw(icone('marcador'))}
                <span>${marcador.nome}</span>
            </span>
            <span class="marcador-linha__usos">${rotuloUsos(marcadores.contarUsos(marcador.id))}</span>
            <button type="button" class="btn btn--sutil btn--icone btn--sm" data-editar-marcador="${marcador.id}"
                    aria-label="Editar ${marcador.nome}" title="Editar">
                ${raw(icone('editar'))}
            </button>
            <button type="button" class="btn btn--sutil btn--icone btn--sm" data-excluir-marcador="${marcador.id}"
                    aria-label="Excluir ${marcador.nome}" title="Excluir">
                ${raw(icone('excluir'))}
            </button>
        </div>
    `;
}

/** @returns {Promise<boolean>} true se o catálogo mudou */
function abrirGerenciarMarcadores() {
    return new Promise(resolve => {
        let alterou = false;

        modal.abrir({
            titulo: 'Marcadores',
            subtitulo: 'Crie, edite ou remova as etiquetas das visitas',
            corpo: html`
                <div class="form" id="form-marcadores">
                    <div class="marcador-gerenciar" data-marcador-lista></div>

                    <button type="button" class="btn btn--outline btn--bloco" data-novo-marcador>
                        ${raw(icone('adicionar'))} Novo marcador
                    </button>

                    <div class="form__acoes">
                        <button type="button" class="btn btn--primario btn--bloco" data-modal-fechar>Concluído</button>
                    </div>
                </div>
            `,

            aoMontar({ corpo }) {
                const lista = corpo.querySelector('[data-marcador-lista]');

                function renderizar() {
                    const itens = marcadores.listar();
                    lista.innerHTML = itens.length
                        ? itens.map(itemGerenciar).join('')
                        : html`<div class="catalogo-vazio">Nenhum marcador cadastrado ainda.</div>`;
                }

                renderizar();

                corpo.querySelector('[data-novo-marcador]').addEventListener('click', async () => {
                    const criado = await abrirEditorMarcador();
                    if (!criado) return;
                    alterou = true;
                    toast.sucesso('Marcador criado.');
                    renderizar();
                });

                lista.addEventListener('click', async e => {
                    const botaoEditar = e.target.closest('[data-editar-marcador]');
                    if (botaoEditar) {
                        const marcador = marcadores.obter(botaoEditar.dataset.editarMarcador);
                        if (!marcador) return;

                        const salvo = await abrirEditorMarcador(marcador);
                        if (!salvo) return;

                        alterou = true;
                        toast.sucesso('Marcador atualizado.');
                        renderizar();
                        return;
                    }

                    const botaoExcluir = e.target.closest('[data-excluir-marcador]');
                    if (!botaoExcluir) return;

                    const id = botaoExcluir.dataset.excluirMarcador;
                    const marcador = marcadores.obter(id);
                    if (!marcador) return;

                    const usos = marcadores.contarUsos(id);
                    const confirmado = await modal.confirmar({
                        titulo: `Excluir "${marcador.nome}"?`,
                        // Excluir tira a etiqueta das visitas que a usavam; o aviso
                        // diz de quantas, porque é a parte que não se desfaz sozinha.
                        mensagem: usos
                            ? `O marcador será removido de ${rotuloUsos(usos)}. As visitas em si continuam intactas.`
                            : 'Este marcador não está sendo usado por nenhuma visita.',
                        confirmarTexto: 'Excluir',
                        perigo: true
                    });
                    if (!confirmado) return;

                    const gravacao = await carregando.acaoRemota(() => marcadores.remover(id), { mensagem: 'Excluindo…' });
                    if (!gravacao.ok) return;

                    alterou = true;
                    toast.sucesso('Marcador excluído.');
                    renderizar();
                });
            },

            aoFechar() {
                resolve(alterou);
            }
        });
    });
}

NS.ui = NS.ui || {};
NS.ui.forms = NS.ui.forms || {};
NS.ui.forms.marcadorForm = {
    abrirEditorMarcador, abrirGerenciarMarcadores, estiloChip,
    hexParaHsv, hsvParaHex, ligarSeletorCor, markupSeletorCor, pintarChip
};
})();
