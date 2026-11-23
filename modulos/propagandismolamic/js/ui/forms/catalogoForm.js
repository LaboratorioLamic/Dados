// ===== js/ui/forms/catalogoForm.js =====
(function () {
'use strict';

/**
 * Modal genérico de gerenciamento de catálogo (especialidades, objetivos):
 * adicionar, renomear e excluir itens simples de { id, nome }. Cada
 * domínio expõe listar/criar/atualizar/remover/validar/emUso com a
 * mesma assinatura, então um único modal serve os dois.
 */

var html = NS.core.dom.html;
var raw = NS.core.dom.raw;
var modal = NS.ui.modal;
var icone = NS.ui.icons.icone;
var carregando = NS.ui.carregando;

/**
 * @param {object} opcoes
 * @param {string} opcoes.titulo
 * @param {string} opcoes.rotuloItem      singular, usado nos placeholders ("Especialidade")
 * @param {object} opcoes.dominio         { listar, criar, atualizar, remover, validar, emUso }
 * @returns {Promise<boolean>} true se algo mudou (adicionado/editado/removido)
 */
function abrirGerenciarCatalogo({ titulo, rotuloItem, dominio }) {
    return new Promise(resolve => {
        let alterou = false;

        modal.abrir({
            titulo,
            subtitulo: `Adicione, renomeie ou remova ${rotuloItem.toLowerCase()}s`,
            corpo: html`
                <div class="form" id="form-catalogo">
                    <div class="catalogo-lista" data-catalogo-lista></div>

                    <form class="catalogo-novo" data-form-novo>
                        <input type="text" class="campo__controle" placeholder="Nova ${rotuloItem.toLowerCase()}..." data-input-novo autocomplete="off">
                        <button type="submit" class="btn btn--primario btn--icone" aria-label="Adicionar">
                            ${raw(icone('adicionar'))}
                        </button>
                    </form>
                    <span class="campo__erro" data-erro-catalogo></span>

                    <div class="form__acoes">
                        <button type="button" class="btn btn--primario btn--bloco" data-modal-fechar>Concluído</button>
                    </div>
                </div>
            `,

            aoMontar({ corpo, fechar }) {
                const lista = corpo.querySelector('[data-catalogo-lista]');
                const formNovo = corpo.querySelector('[data-form-novo]');
                const inputNovo = corpo.querySelector('[data-input-novo]');
                const erro = corpo.querySelector('[data-erro-catalogo]');

                function renderizar() {
                    const itens = dominio.listar();
                    erro.textContent = '';

                    lista.innerHTML = itens.length
                        ? itens.map(item => html`
                            <div class="catalogo-item" data-item="${item.id}">
                                <input type="text" class="catalogo-item__campo" value="${item.nome}" data-editar="${item.id}">
                                <button type="button" class="btn btn--sutil btn--icone" data-excluir="${item.id}" aria-label="Excluir">
                                    ${raw(icone('excluir'))}
                                </button>
                            </div>
                        `).join('')
                        : html`<div class="catalogo-vazio">Nenhuma ${rotuloItem.toLowerCase()} cadastrada ainda.</div>`;
                }

                renderizar();

                formNovo.addEventListener('submit', async e => {
                    e.preventDefault();
                    const nome = inputNovo.value.trim();
                    const mensagem = dominio.validar(nome);

                    if (mensagem) {
                        erro.textContent = mensagem;
                        return;
                    }

                    const gravacao = await carregando.acaoRemota(() => dominio.criar(nome), { mensagem: 'Salvando…' });
                    if (!gravacao.ok) return;

                    inputNovo.value = '';
                    alterou = true;
                    renderizar();
                    inputNovo.focus();
                });

                lista.addEventListener('change', async e => {
                    const campo = e.target.closest('[data-editar]');
                    if (!campo) return;

                    const id = campo.dataset.editar;
                    const nome = campo.value.trim();
                    const mensagem = dominio.validar(nome, { ignorarId: id });

                    if (mensagem) {
                        erro.textContent = mensagem;
                        renderizar();
                        return;
                    }

                    const gravacao = await carregando.acaoRemota(() => dominio.atualizar(id, nome), { mensagem: 'Salvando…' });
                    if (!gravacao.ok) {
                        // A escrita falhou: o campo ainda mostra o texto digitado.
                        renderizar();
                        return;
                    }

                    alterou = true;
                    renderizar();
                });

                lista.addEventListener('click', async e => {
                    const botao = e.target.closest('[data-excluir]');
                    if (!botao) return;

                    const id = botao.dataset.excluir;
                    if (dominio.emUso(id)) {
                        erro.textContent = `Esta ${rotuloItem.toLowerCase()} está em uso e não pode ser excluída.`;
                        return;
                    }

                    const gravacao = await carregando.acaoRemota(() => dominio.remover(id), { mensagem: 'Excluindo…' });
                    if (gravacao.ok && gravacao.valor) {
                        alterou = true;
                        renderizar();
                    }
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
NS.ui.forms.catalogoForm = { abrirGerenciarCatalogo };
})();
