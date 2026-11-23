// ===== js/ui/components/card.js =====
(function () {
'use strict';

/**
 * Cards de médico e de visita, mais os fragmentos compartilhados
 * (botão de WhatsApp, avatar, estado vazio).
 */

var html = NS.core.dom.html;
var raw = NS.core.dom.raw;
var iniciais = NS.core.dom.iniciais;
var formatarData = NS.core.dom.formatarData;
var formatarDataExtensa = NS.core.dom.formatarDataExtensa;
var icone = NS.ui.icons.icone;
var urlWhatsApp = NS.domain.telefone.urlWhatsApp;
var resumirEndereco = NS.domain.enderecoUtils.resumirEndereco;
var ROTULOS_STATUS = NS.domain.visita.ROTULOS_STATUS;
var TAG_STATUS = NS.domain.visita.TAG_STATUS;
var nomeObjetivo = NS.domain.objetivo.nomeDe;
var marcadores = NS.domain.marcador;
var marcadoresDaVisita = NS.domain.visita.marcadoresDe;
var especialidades = NS.domain.especialidade;
var estaAtrasada = NS.domain.visita.estaAtrasada;
var ehTerminal = NS.domain.visita.ehTerminal;
var horarioFim = NS.domain.visita.horarioFim;
var pode = NS.domain.permissoes.pode;
/**
 * Botão de WhatsApp. Devolve string vazia quando o número não serve —
 * o ícone nunca aparece prometendo uma conversa que não abre.
 */
function botaoWhatsApp(numero, nome, { comRotulo = false } = {}) {
    const url = urlWhatsApp(numero);
    if (!url) return '';

    const rotuloAcessivel = `Abrir conversa no WhatsApp com ${nome || 'o médico'}`;

    if (comRotulo) {
        return html`
            <a class="btn btn--whatsapp" href="${url}" target="_blank" rel="noopener" aria-label="${rotuloAcessivel}">
                ${raw(icone('whatsapp'))} WhatsApp
            </a>
        `;
    }

    return html`
        <a class="link-whatsapp" href="${url}" target="_blank" rel="noopener"
           title="${rotuloAcessivel}" aria-label="${rotuloAcessivel}">
            ${raw(icone('whatsapp'))}
        </a>
    `;
}

function avatar(nome, { pequeno = false } = {}) {
    return html`<span class="avatar${raw(pequeno ? ' avatar--sm' : '')}" aria-hidden="true">${iniciais(nome)}</span>`;
}

function estadoVazio({ icone: nomeIcone = 'documento', titulo, texto, acao = '' }) {
    return html`
        <div class="vazio">
            <span class="vazio__icone">${raw(icone(nomeIcone))}</span>
            <span class="vazio__titulo">${titulo}</span>
            <p class="vazio__texto">${texto}</p>
            ${raw(acao)}
        </div>
    `;
}

/**
 * Fita de marcadores de uma visita. String vazia quando não há nenhum —
 * o card não ganha um espaço em branco por causa de uma lista vazia.
 *
 * Cada chip carrega a cor como variável CSS, então a folha de estilo
 * define a forma uma vez só e cada etiqueta só troca o valor.
 */
function chipsMarcadores(visita) {
    const itens = marcadores.dosIds(marcadoresDaVisita(visita));
    if (!itens.length) return '';

    return html`
        <div class="card__marcadores">
            ${raw(itens.map(m => html`
                <span class="marcador-chip marcador-chip--sm"
                      style="--marcador-cor: ${m.cor}; --marcador-fundo: ${marcadores.corComAlfa(m.cor, 0.12)}; --marcador-borda: ${marcadores.corComAlfa(m.cor, 0.34)}">
                    ${raw(icone('marcador'))}
                    <span>${m.nome}</span>
                </span>
            `).join(''))}
        </div>
    `;
}

/* ------------------------------------------------------------------ *
 * Card de médico
 * ------------------------------------------------------------------ */

function cardMedico(medico) {
    const endereco = resumirEndereco(medico.endereco);
    const local = [endereco, medico.referencia].filter(Boolean).join(' · ');
    const nomeEspecialidade = especialidades.obter(medico.especialidadeId)?.nome;

    return html`
        <article class="card" data-medico-id="${medico.id}">
            <div class="card__topo">
                <div class="card__identidade">
                    ${raw(avatar(medico.nome))}
                    <div>
                        <div class="card__nome">${medico.nome}</div>
                        <div class="card__sub">
                            ${[nomeEspecialidade, medico.crm].filter(Boolean).join(' · ') || 'Sem especialidade informada'}
                        </div>
                    </div>
                </div>
                ${raw(botaoWhatsApp(medico.whatsapp, medico.nome))}
            </div>

            ${raw(local ? html`
                <div class="card__linha">
                    ${raw(icone('mapa'))}
                    <span>${local}</span>
                </div>
            ` : '')}

            ${raw(medico.diasHorarios ? html`
                <div class="card__linha">
                    ${raw(icone('relogio'))}
                    <span>${medico.diasHorarios}</span>
                </div>
            ` : '')}

            <div class="card__acoes">
                <button type="button" class="btn btn--outline btn--sm btn--cresce" data-acao="detalhe" data-id="${medico.id}">
                    ${raw(icone('info'))} Detalhes
                </button>
                ${raw(pode('agenda.criar') ? html`
                    <button type="button" class="btn btn--primario btn--sm btn--cresce" data-acao="agendar" data-id="${medico.id}">
                        ${raw(icone('agendaAdicionar'))} Agendar
                    </button>
                ` : '')}
                ${raw(pode('medicos.editar') ? html`
                    <button type="button" class="btn btn--sutil btn--sm" data-acao="editar" data-id="${medico.id}" aria-label="Editar ${medico.nome}" title="Editar">
                        ${raw(icone('editar'))}
                    </button>
                ` : '')}
            </div>
        </article>
    `;
}

/* ------------------------------------------------------------------ *
 * Card de visita
 * ------------------------------------------------------------------ */

function acoesDaVisita(visita, medico) {
    if (visita.status === 'agendada') {
        return html`
            ${raw(pode('agenda.concluir') ? html`
                <button type="button" class="btn btn--primario btn--sm btn--cresce" data-acao="realizar" data-id="${visita.id}">
                    ${raw(icone('checkCirculo'))} Registrar
                </button>
                <button type="button" class="btn btn--outline btn--sm" data-acao="ausente" data-id="${visita.id}">
                    ${raw(icone('usuarioAusente'))} Não atendeu
                </button>
            ` : '')}
            ${raw(pode('agenda.reagendar') ? html`
                <button type="button" class="btn btn--sutil btn--sm" data-acao="reagendar" data-id="${visita.id}" title="Reagendar" aria-label="Reagendar visita">
                    ${raw(icone('reagendar'))}
                </button>
            ` : '')}
            ${raw(pode('agenda.criar') ? html`
                <button type="button" class="btn btn--sutil btn--sm" data-acao="editar" data-id="${visita.id}" title="Editar" aria-label="Editar visita">
                    ${raw(icone('editar'))}
                </button>
            ` : '')}
            ${raw(pode('agenda.cancelar') ? html`
                <button type="button" class="btn btn--sutil btn--sm" data-acao="cancelar" data-id="${visita.id}" title="Cancelar" aria-label="Cancelar visita">
                    ${raw(icone('fechar'))}
                </button>
            ` : '')}
        `;
    }

    if (visita.status === 'ausente' && pode('agenda.reagendar')) {
        return html`
            <button type="button" class="btn btn--outline btn--sm btn--cresce" data-acao="reagendar" data-id="${visita.id}">
                ${raw(icone('reagendar'))} Reagendar
            </button>
        `;
    }

    // Encerrada (concluída, ausente ou cancelada): segue gerenciável — dá para
    // corrigir os dados do registro ou apagá-lo do histórico.
    return html`
        <button type="button" class="btn btn--sutil btn--sm btn--cresce" data-acao="detalheMedico" data-id="${medico?.id || ''}">
            ${raw(icone('info'))} Ver médico
        </button>
        ${raw(ehTerminal(visita.status) && pode('agenda.criar') ? html`
            <button type="button" class="btn btn--sutil btn--sm" data-acao="editar" data-id="${visita.id}" title="Gerenciar" aria-label="Gerenciar visita">
                ${raw(icone('editar'))}
            </button>
        ` : '')}
        ${raw(ehTerminal(visita.status) && pode('agenda.cancelar') ? html`
            <button type="button" class="btn btn--sutil btn--sm" data-acao="excluir" data-id="${visita.id}" title="Excluir" aria-label="Excluir visita">
                ${raw(icone('excluir'))}
            </button>
        ` : '')}
    `;
}

function cardVisita(visita, medico, { mostrarData = true } = {}) {
    const atrasada = estaAtrasada(visita);
    const classeFaixa = atrasada ? 'atrasada' : visita.status;
    const nome = medico?.nome || 'Médico removido';

    const fim = horarioFim(visita.horario, visita.duracao);
    const faixaHorario = visita.horario && fim ? `${visita.horario}–${fim}` : visita.horario;

    const quando = [
        mostrarData ? formatarDataExtensa(visita.data) : '',
        faixaHorario
    ].filter(Boolean).join(' · ');

    return html`
        <article class="card card--faixa card--${classeFaixa}" data-visita-id="${visita.id}">
            <div class="card__topo">
                <div class="card__identidade">
                    ${raw(avatar(nome, { pequeno: true }))}
                    <div>
                        <div class="card__nome">${nome}</div>
                        <div class="card__sub">
                            ${[especialidades.obter(medico?.especialidadeId)?.nome, medico?.crm].filter(Boolean).join(' · ') || 'Sem especialidade'}
                        </div>
                    </div>
                </div>
                <div class="card__meta">
                    ${raw(botaoWhatsApp(medico?.whatsapp, nome))}
                    <span class="tag tag--${raw(atrasada ? 'perigo' : TAG_STATUS[visita.status])}">
                        ${atrasada ? 'Atrasada' : ROTULOS_STATUS[visita.status]}
                    </span>
                </div>
            </div>

            ${raw(quando ? html`
                <div class="card__linha">
                    ${raw(icone('relogio'))}
                    <span>${quando}</span>
                </div>
            ` : '')}

            ${raw(visita.objetivo ? html`
                <div class="card__linha">
                    ${raw(icone('alvo'))}
                    <span>${nomeObjetivo(visita.objetivo) || visita.objetivo}</span>
                </div>
            ` : '')}

            ${raw(chipsMarcadores(visita))}

            ${raw(visita.motivoAusencia ? html`
                <div class="card__bloco">
                    <strong>Motivo:</strong> ${visita.motivoAusencia}
                </div>
            ` : '')}

            ${raw(visita.notas ? html`<div class="card__nota">${visita.notas}</div>` : '')}

            ${raw(visita.visitaOrigemId ? html`
                <div class="card__linha texto-xs">
                    ${raw(icone('reagendar'))}
                    <span>Reagendada de uma visita anterior</span>
                </div>
            ` : '')}

            <div class="mapa-slot" data-endereco-de="${medico?.id || ''}"></div>

            <div class="card__acoes">
                ${raw(acoesDaVisita(visita, medico))}
            </div>
        </article>
    `;
}

/** Item de histórico clicável — abre a janela de visualização da visita. */
function itemHistorico(visita) {
    const fim = horarioFim(visita.horario, visita.duracao);
    const faixaHorario = visita.horario && fim ? `${visita.horario}–${fim}` : visita.horario;

    return html`
        <button type="button" class="historico__item historico__item--clicavel" data-acao="abrirVisita" data-id="${visita.id}">
            <span>
                <strong>${formatarData(visita.data)}</strong>
                ${raw(faixaHorario ? html` · ${faixaHorario}` : '')}
            </span>
            <span class="tag tag--${raw(TAG_STATUS[visita.status])}">${ROTULOS_STATUS[visita.status]}</span>
        </button>
    `;
}

NS.ui = NS.ui || {};
NS.ui.components = NS.ui.components || {};
NS.ui.components.card = { avatar, botaoWhatsApp, cardMedico, chipsMarcadores, cardVisita, estadoVazio, itemHistorico };
})();
