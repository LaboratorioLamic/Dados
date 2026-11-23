// ===== js/ui/views/medicos.js =====
(function () {
'use strict';

/** Tela de Médicos: grid de cards com busca. */

var html = NS.core.dom.html;
var raw = NS.core.dom.raw;
var delegarAcoes = NS.core.dom.delegarAcoes;
var pluralizar = NS.core.dom.pluralizar;
var on = NS.core.events.on;
var EVENTOS = NS.core.events.EVENTOS;
var icone = NS.ui.icons.icone;
var cardMedico = NS.ui.components.card.cardMedico;
var estadoVazio = NS.ui.components.card.estadoVazio;
var medicos = NS.domain.medico;
var abrirFormularioMedico = NS.ui.forms.medicoForm.abrirFormularioMedico;
var abrirFormularioVisita = NS.ui.forms.visitaForm.abrirFormularioVisita;
var abrirDetalheMedico = NS.ui.views.medicoDetalhe.abrirDetalheMedico;
var pode = NS.domain.permissoes.pode;
let desinscrever = [];
let termoBusca = '';

function renderLista(container) {
    const lista = medicos.buscar(termoBusca);
    const grid = container.querySelector('[data-grid]');
    const contador = container.querySelector('[data-contador]');

    contador.textContent = lista.length
        ? pluralizar(lista.length, 'médico', 'médicos')
        : '';

    if (!lista.length) {
        grid.innerHTML = termoBusca
            ? estadoVazio({
                icone: 'busca',
                titulo: 'Nenhum resultado',
                texto: `Nada encontrado para "${termoBusca}". Tente outro nome, especialidade ou bairro.`
            })
            : estadoVazio({
                icone: 'medicos',
                titulo: 'Nenhum médico cadastrado',
                texto: 'Cadastre os médicos da sua carteira para começar a montar a agenda de visitas.',
                acao: pode('medicos.criar') ? html`
                    <button type="button" class="btn btn--primario" data-acao="novo">
                        ${raw(icone('usuarioAdicionar'))} Cadastrar primeiro médico
                    </button>
                ` : ''
            });
        return;
    }

    grid.innerHTML = lista.map(cardMedico).join('');
}

const viewMedicos = {
    render(container) {
        container.innerHTML = html`
            <div class="view-header">
                <div class="view-header__titulo">
                    <h1>Médicos</h1>
                    <p data-contador></p>
                </div>
                ${raw(pode('medicos.criar') ? html`
                    <button type="button" class="btn btn--primario" data-acao="novo">
                        ${raw(icone('usuarioAdicionar'))} Novo médico
                    </button>
                ` : '')}
            </div>

            <div class="barra-filtros">
                <div class="campo barra-filtros__busca">
                    <label class="visualmente-oculto" for="busca-medicos">Buscar médico</label>
                    <input
                        class="campo__controle"
                        type="search"
                        id="busca-medicos"
                        placeholder="Buscar por nome, especialidade, CRM ou bairro"
                        value="${termoBusca}"
                    >
                </div>
            </div>

            <div class="grid-cards" data-grid></div>
        `;

        renderLista(container);

        const busca = container.querySelector('#busca-medicos');
        busca.addEventListener('input', () => {
            termoBusca = busca.value.trim();
            // Re-render só do grid: o campo de busca mantém o foco e o cursor.
            renderLista(container);
        });

        const atualizar = () => renderLista(container);

        desinscrever.push(
            on(EVENTOS.DADOS_ALTERADOS, atualizar),
            // A checagem se repete no handler: o markup pode ter sido
            // renderizado antes de uma troca de permissão.
            delegarAcoes(container, {
                novo: async () => {
                    if (!pode('medicos.criar')) return;
                    await abrirFormularioMedico();
                },
                detalhe: ({ id }) => abrirDetalheMedico(id, { aoAlterar: atualizar }),
                editar: async ({ id }) => {
                    if (!pode('medicos.editar')) return;
                    await abrirFormularioMedico(medicos.obter(id));
                },
                agendar: async ({ id }) => {
                    if (!pode('agenda.criar')) return;
                    await abrirFormularioVisita({ medicoId: id });
                }
            })
        );
    },

    destroy() {
        desinscrever.forEach(fn => fn?.());
        desinscrever = [];
    }
};

NS.ui = NS.ui || {};
NS.ui.views = NS.ui.views || {};
NS.ui.views.medicos = { viewMedicos };
})();
