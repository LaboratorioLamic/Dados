// ===== js/ui/forms/visitaForm.js =====
(function () {
'use strict';

/** Formulário de agendamento de visita. */

var html = NS.core.dom.html;
var raw = NS.core.dom.raw;
var hojeISO = NS.core.dom.hojeISO;
var modal = NS.ui.modal;
var toast = NS.ui.toast;
var carregando = NS.ui.carregando;
var campoTexto = NS.ui.components.formField.campoTexto;
var campoTextarea = NS.ui.components.formField.campoTextarea;
var aplicarErros = NS.ui.components.formField.aplicarErros;
var limparErros = NS.ui.components.formField.limparErros;
var lerFormulario = NS.ui.components.formField.lerFormulario;
var icone = NS.ui.icons.icone;
var avatar = NS.ui.components.card.avatar;
var medicos = NS.domain.medico;
var visitas = NS.domain.visita;
var objetivos = NS.domain.objetivo;
var marcadores = NS.domain.marcador;
var especialidades = NS.domain.especialidade;
var abrirGerenciarCatalogo = NS.ui.forms.catalogoForm.abrirGerenciarCatalogo;
var abrirGerenciarMarcadores = NS.ui.forms.marcadorForm.abrirGerenciarMarcadores;
var estiloChip = NS.ui.forms.marcadorForm.estiloChip;
var pode = NS.domain.permissoes.pode;

function nomeEspecialidade(medico) {
    return especialidades.obter(medico?.especialidadeId)?.nome || '';
}

function opcoesObjetivo() {
    return objetivos.listar().map(o => ({ valor: o.id, texto: o.nome }));
}

/* ------------------------------------------------------------------ *
 * Campo de marcadores (multisseleção)
 * ------------------------------------------------------------------ */

function chipMarcador(marcador, { removivel = false } = {}) {
    return html`
        <span class="marcador-chip marcador-chip--sm" style="${raw(estiloChip(marcador.cor))}" data-chip="${marcador.id}">
            ${raw(icone('marcador'))}
            <span>${marcador.nome}</span>
            ${raw(removivel ? html`
                <span class="marcador-chip__x" data-remover-marcador="${marcador.id}"
                      role="button" tabindex="-1" aria-label="Remover ${marcador.nome}" title="Remover">
                    ${raw(icone('fechar'))}
                </span>
            ` : '')}
        </span>
    `;
}

/**
 * Campo de marcadores: um gatilho que mostra os chips já escolhidos, um
 * popover de multisseleção e o botão de gerenciar ao lado — o mesmo par
 * visual do campo de objetivo, que fica à esquerda dele.
 */
function campoMarcadores(selecionadosIniciais) {
    return html`
        <div class="campo campo--marcadores" data-campo="marcadores">
            <label class="campo__label" for="campo-marcadores-gatilho">Marcadores</label>
            <div class="campo-com-botao">
                <div class="popover-marcadores-wrap">
                    <button type="button" class="seletor-marcadores" id="campo-marcadores-gatilho"
                            data-marcadores-gatilho aria-haspopup="true" aria-expanded="false">
                        <span class="seletor-marcadores__chips" data-marcadores-chips></span>
                        ${raw(icone('setaBaixo'))}
                    </button>

                    <div class="popover-marcadores" data-marcadores-popover hidden role="listbox"
                         aria-multiselectable="true" aria-label="Selecionar marcadores">
                        <div class="popover-filtro__titulo">Marcar esta visita</div>
                        <div class="popover-marcadores__lista" data-marcadores-lista></div>
                    </div>
                </div>
                ${raw(pode('catalogos.gerenciar') ? html`
                    <button type="button" class="btn btn--outline btn--icone" data-gerenciar-marcadores
                            aria-label="Gerenciar marcadores" title="Gerenciar marcadores">
                        ${raw(icone('editar'))}
                    </button>
                ` : '')}
            </div>
            <input type="hidden" name="marcadores" value="${(selecionadosIniciais || []).join(',')}">
        </div>
    `;
}

/**
 * Liga o campo de marcadores. Devolve `{ selecionados, redesenhar, destruir }`
 * — `destruir` remove o listener de clique-fora em `document`, que de outro
 * modo se acumularia a cada abertura do formulário.
 */
function ligarSeletorMarcadores(form, selecionadosIniciais) {
    const wrap = form.querySelector('.popover-marcadores-wrap');
    const gatilho = form.querySelector('[data-marcadores-gatilho]');
    const popover = form.querySelector('[data-marcadores-popover]');
    const lista = form.querySelector('[data-marcadores-lista]');
    const chips = form.querySelector('[data-marcadores-chips]');
    const hidden = form.querySelector('[name="marcadores"]');

    // Só ids que ainda existem: um marcador excluído entre a abertura do
    // formulário e o salvamento não pode voltar ao banco por este caminho.
    const escolhidos = new Set(marcadores.dosIds(selecionadosIniciais).map(m => m.id));

    function desenharChips() {
        const itens = marcadores.dosIds([...escolhidos]);
        chips.innerHTML = itens.length
            ? itens.map(m => chipMarcador(m, { removivel: true })).join('')
            : html`<span class="seletor-marcadores__vazio">Nenhum marcador</span>`;
        hidden.value = [...escolhidos].join(',');
    }

    function desenharLista() {
        const itens = marcadores.listar();

        lista.innerHTML = itens.length
            ? itens.map(m => html`
                <button type="button" class="popover-marcadores__item${raw(escolhidos.has(m.id) ? ' popover-marcadores__item--ativo' : '')}"
                        role="option" aria-selected="${escolhidos.has(m.id)}" data-marcador-valor="${m.id}">
                    <span class="popover-marcadores__ponto" style="background: ${m.cor}"></span>
                    <span class="popover-marcadores__nome">${m.nome}</span>
                    ${raw(escolhidos.has(m.id) ? icone('check', { classe: 'popover-filtro__check' }) : '')}
                </button>
            `).join('')
            : html`<div class="popover-marcadores__vazio">Nenhum marcador cadastrado ainda.</div>`;
    }

    function redesenhar() {
        // Um marcador apagado no gerenciador sai da seleção junto.
        for (const id of [...escolhidos]) if (!marcadores.obter(id)) escolhidos.delete(id);
        desenharChips();
        desenharLista();
    }

    function fecharPopover() {
        popover.hidden = true;
        gatilho.setAttribute('aria-expanded', 'false');
    }

    function abrirPopover() {
        desenharLista();
        popover.hidden = false;
        gatilho.setAttribute('aria-expanded', 'true');
    }

    gatilho.addEventListener('click', e => {
        // O "x" de cada chip vive dentro do gatilho: remover não pode,
        // no mesmo clique, abrir o popover.
        const remover = e.target.closest('[data-remover-marcador]');
        if (remover) {
            e.preventDefault();
            e.stopPropagation();
            escolhidos.delete(remover.dataset.removerMarcador);
            desenharChips();
            desenharLista();
            return;
        }

        e.stopPropagation();
        if (popover.hidden) abrirPopover(); else fecharPopover();
    });

    popover.addEventListener('click', e => {
        e.stopPropagation();
        const item = e.target.closest('[data-marcador-valor]');
        if (!item) return;

        const id = item.dataset.marcadorValor;
        // Multisseleção: o popover segue aberto, dá para marcar vários seguidos.
        if (escolhidos.has(id)) escolhidos.delete(id);
        else escolhidos.add(id);

        desenharChips();
        desenharLista();
    });

    function aoClicarFora(e) {
        if (!popover.hidden && !wrap.contains(e.target)) fecharPopover();
    }
    document.addEventListener('click', aoClicarFora);

    // Esc fecha só o popover; o modal continua aberto (o listener do modal
    // não chega a ver o evento porque o popover para a propagação).
    function aoTeclar(e) {
        if (e.key === 'Escape' && !popover.hidden) {
            e.stopPropagation();
            fecharPopover();
        }
    }
    form.addEventListener('keydown', aoTeclar);

    redesenhar();

    return {
        selecionados: () => [...escolhidos],
        redesenhar,
        destruir() {
            document.removeEventListener('click', aoClicarFora);
        }
    };
}

/**
 * Campo de médico: um botão-gatilho que abre um popover pesquisável
 * (por nome ou CRM), mais um campo de especialidade somente-leitura ao
 * lado, que acompanha a seleção.
 */
function campoMedico(valorInicial) {
    const lista = medicos.listar();
    const selecionado = lista.find(m => m.id === valorInicial) || null;

    return html`
        <div class="form-linha form-linha--medico">
            <div class="campo" data-campo="medicoId">
                <label class="campo__label" for="campo-medico-gatilho">Médico <span class="campo__obrigatorio" aria-hidden="true">*</span></label>
                <input type="hidden" name="medicoId" value="${selecionado?.id || ''}">
                <button type="button" class="seletor-medico" id="campo-medico-gatilho" data-medico-gatilho aria-haspopup="true" aria-expanded="false">
                    ${raw(selecionado ? html`
                        ${raw(avatar(selecionado.nome, { pequeno: true }))}
                        <span class="seletor-medico__texto">
                            <strong>${selecionado.nome}</strong>
                            ${raw(selecionado.crm ? html`<small>CRM ${selecionado.crm}</small>` : '')}
                        </span>
                    ` : html`
                        <span class="seletor-medico__texto seletor-medico__texto--vazio">Selecione o médico</span>
                    `)}
                    ${raw(icone('setaBaixo'))}
                </button>
                <span class="campo__erro" data-erro="medicoId"></span>

                <div class="popover-medico" data-popover-medico hidden>
                    <div class="popover-medico__busca">
                        ${raw(icone('busca'))}
                        <input type="text" placeholder="Buscar por nome ou CRM..." data-busca-medico autocomplete="off">
                    </div>
                    <div class="popover-medico__lista" data-lista-medico role="listbox"></div>
                </div>
            </div>

            <div class="campo">
                <span class="campo__label">Especialidade</span>
                <div class="campo__controle campo__controle--somente-leitura" data-especialidade-exibicao>
                    ${selecionado ? (nomeEspecialidade(selecionado) || '—') : '—'}
                </div>
            </div>
        </div>
    `;
}

function itemMedico(m) {
    return html`
        <button type="button" class="popover-medico__item" role="option" data-medico-id="${m.id}">
            ${raw(avatar(m.nome, { pequeno: true }))}
            <span class="popover-medico__item-texto">
                <strong>${m.nome}</strong>
                ${raw(m.crm ? html`<small>CRM ${m.crm}</small>` : '')}
            </span>
        </button>
    `;
}

/**
 * Liga o gatilho + popover de busca do campo de médico a um formulário já
 * montado. Devolve uma função de limpeza — o chamador precisa executá-la
 * no fechamento do modal, senão o listener de `document` (clique fora)
 * fica pendurado e se acumula a cada abertura do formulário.
 */
function ligarSeletorMedico(form, aoSelecionar) {
    const gatilho = form.querySelector('[data-medico-gatilho]');
    const popover = form.querySelector('[data-popover-medico]');
    const inputBusca = form.querySelector('[data-busca-medico]');
    const lista = form.querySelector('[data-lista-medico]');
    const hidden = form.querySelector('[name="medicoId"]');
    const exibicaoEspecialidade = form.querySelector('[data-especialidade-exibicao]');
    const erro = form.querySelector('[data-erro="medicoId"]');

    function renderizarLista(termo) {
        const todos = medicos.listar();
        const filtrados = termo
            ? todos.filter(m => {
                const alvo = `${m.nome} ${m.crm || ''}`.toLowerCase();
                return alvo.includes(termo.toLowerCase());
            })
            : todos;

        lista.innerHTML = filtrados.length
            ? filtrados.map(itemMedico).join('')
            : html`<div class="popover-medico__vazio">Nenhum médico encontrado.</div>`;
    }

    function abrirPopover() {
        renderizarLista(inputBusca.value.trim());
        popover.hidden = false;
        gatilho.setAttribute('aria-expanded', 'true');
        requestAnimationFrame(() => inputBusca.focus());
    }

    function fecharPopover() {
        popover.hidden = true;
        gatilho.setAttribute('aria-expanded', 'false');
    }

    function selecionar(id) {
        const m = medicos.obter(id);
        if (!m) return;

        hidden.value = m.id;
        exibicaoEspecialidade.textContent = nomeEspecialidade(m) || '—';
        gatilho.innerHTML = html`
            ${raw(avatar(m.nome, { pequeno: true }))}
            <span class="seletor-medico__texto">
                <strong>${m.nome}</strong>
                ${raw(m.crm ? html`<small>CRM ${m.crm}</small>` : '')}
            </span>
            ${raw(icone('setaBaixo'))}
        `;
        if (erro) erro.textContent = '';
        form.querySelector('[data-campo="medicoId"]')?.classList.remove('campo--invalido');

        fecharPopover();
        aoSelecionar?.(m);
    }

    gatilho.addEventListener('click', e => {
        e.stopPropagation();
        if (popover.hidden) abrirPopover(); else fecharPopover();
    });

    inputBusca.addEventListener('input', () => renderizarLista(inputBusca.value.trim()));

    lista.addEventListener('click', e => {
        const item = e.target.closest('[data-medico-id]');
        if (item) selecionar(item.dataset.medicoId);
    });

    function aoClicarFora(e) {
        if (!popover.hidden && !form.querySelector('.campo[data-campo="medicoId"]').contains(e.target) && !popover.contains(e.target)) {
            fecharPopover();
        }
    }
    document.addEventListener('click', aoClicarFora);

    popover.addEventListener('click', e => e.stopPropagation());

    function aoTeclar(e) {
        if (e.key === 'Escape' && !popover.hidden) fecharPopover();
    }
    form.addEventListener('keydown', aoTeclar);

    // O chamador deve executar isto ao fechar o modal — senão o listener
    // de "clique fora" em `document` fica pendurado indefinidamente.
    return function destruir() {
        document.removeEventListener('click', aoClicarFora);
    };
}

/**
 * @param {object} opcoes
 * @param {string} [opcoes.medicoId]   pré-seleciona o médico
 * @param {object} [opcoes.visita]     edição de visita existente (precisa de `id`)
 * @param {object} [opcoes.rascunho]   pré-preenche uma visita nova (sem tratar como edição)
 */
function abrirFormularioVisita({ medicoId = '', visita: existente = null, rascunho = null } = {}) {
    return new Promise(resolve => {
        const lista = medicos.listar();

        if (!lista.length) {
            toast.alerta('Cadastre um médico antes de agendar uma visita.');
            resolve(null);
            return;
        }

        const visita = existente
            ? { ...visitas.visitaVazia(), ...existente }
            : { ...visitas.visitaVazia(), medicoId: medicoId || lista[0].id, ...rascunho };

        let salva = null;
        let destruirSeletorMedico = null;
        let destruirSeletorMarcadores = null;

        modal.abrir({
            titulo: existente ? 'Editar visita' : 'Agendar visita',
            subtitulo: existente ? '' : 'Defina o médico, a data e o objetivo',
            corpo: html`
                <form class="form" id="form-visita" novalidate>
                    ${raw(campoMedico(visita.medicoId))}

                    <div class="form-linha form-linha--3">
                        ${raw(campoTexto({
                            nome: 'data',
                            label: 'Data',
                            tipo: 'date',
                            valor: visita.data || hojeISO(),
                            obrigatorio: true
                        }))}
                        ${raw(campoTexto({
                            nome: 'horario',
                            label: 'Horário',
                            tipo: 'time',
                            valor: visita.horario
                        }))}
                        ${raw(campoTexto({
                            nome: 'duracao',
                            label: 'Duração',
                            tipo: 'time',
                            valor: visita.duracao || visitas.DURACAO_PADRAO
                        }))}
                    </div>

                    <div class="form-linha form-linha--objetivo">
                        <div class="campo" data-campo="objetivo">
                            <label class="campo__label" for="campo-objetivo">Objetivo da visita <span class="campo__obrigatorio" aria-hidden="true">*</span></label>
                            <div class="campo-com-botao">
                                <select class="campo__controle" id="campo-objetivo" name="objetivo" required data-select-objetivo>
                                    <option value="">Selecione...</option>
                                    ${raw(opcoesObjetivo().map(o => html`
                                        <option value="${o.valor}"${raw(o.valor === visita.objetivo ? ' selected' : '')}>${o.texto}</option>
                                    `).join(''))}
                                </select>
                                ${raw(pode('catalogos.gerenciar') ? html`
                                    <button type="button" class="btn btn--outline btn--icone" data-gerenciar-objetivos aria-label="Gerenciar objetivos" title="Gerenciar objetivos">
                                        ${raw(icone('config'))}
                                    </button>
                                ` : '')}
                            </div>
                            <span class="campo__erro" data-erro="objetivo"></span>
                        </div>

                        ${raw(campoMarcadores(visita.marcadores))}
                    </div>

                    ${raw(campoTextarea({
                        nome: 'notas',
                        label: 'Notas',
                        valor: visita.notas,
                        placeholder: 'Ex: apresentar o painel de ISTs; levar folheto de citologia',
                        linhas: 3
                    }))}

                    <div class="form__acoes">
                        <button type="button" class="btn btn--outline" data-modal-fechar>Cancelar</button>
                        <button type="submit" class="btn btn--primario">
                            ${raw(icone('check'))} ${existente ? 'Salvar' : 'Agendar'}
                        </button>
                    </div>
                </form>
            `,

            aoMontar({ corpo, fechar }) {
                const form = corpo.querySelector('#form-visita');
                destruirSeletorMedico = ligarSeletorMedico(form);

                const seletorMarcadores = ligarSeletorMarcadores(form, visita.marcadores);
                destruirSeletorMarcadores = seletorMarcadores.destruir;

                corpo.querySelector('[data-gerenciar-marcadores]')?.addEventListener('click', async () => {
                    await abrirGerenciarMarcadores();
                    // O catálogo pode ter mudado embaixo do campo: renome, cor
                    // nova ou exclusão precisam aparecer nos chips já escolhidos.
                    seletorMarcadores.redesenhar();
                });

                corpo.querySelector('[data-gerenciar-objetivos]')?.addEventListener('click', async () => {
                    const select = form.querySelector('[data-select-objetivo]');
                    const selecionado = select.value;

                    await abrirGerenciarCatalogo({
                        titulo: 'Objetivos de visita',
                        rotuloItem: 'Objetivo',
                        dominio: objetivos
                    });

                    select.innerHTML = html`
                        <option value="">Selecione...</option>
                        ${raw(opcoesObjetivo().map(o => html`
                            <option value="${o.valor}"${raw(o.valor === selecionado ? ' selected' : '')}>${o.texto}</option>
                        `).join(''))}
                    `;
                });

                form.addEventListener('submit', async e => {
                    e.preventDefault();
                    limparErros(form);

                    const dados = lerFormulario(form);
                    const erros = {};

                    if (!dados.medicoId) erros.medicoId = 'Selecione o médico.';
                    if (!dados.data) erros.data = 'Informe a data.';

                    if (Object.keys(erros).length) {
                        aplicarErros(form, erros);
                        return;
                    }

                    const marcadoresEscolhidos = seletorMarcadores.selecionados();

                    const gravar = () => existente
                        ? visitas.atualizar(existente.id, {
                            medicoId: dados.medicoId,
                            data: dados.data,
                            horario: dados.horario,
                            duracao: dados.duracao || visitas.DURACAO_PADRAO,
                            objetivo: dados.objetivo,
                            marcadores: marcadoresEscolhidos,
                            notas: dados.notas
                        })
                        : visitas.criar({
                            medicoId: dados.medicoId,
                            data: dados.data,
                            horario: dados.horario,
                            duracao: dados.duracao || visitas.DURACAO_PADRAO,
                            objetivo: dados.objetivo,
                            marcadores: marcadoresEscolhidos,
                            notas: dados.notas,
                            status: visitas.STATUS.AGENDADA
                        });

                    const resultado = await carregando.acaoRemota(gravar, { mensagem: 'Salvando visita…' });
                    if (!resultado.ok) return;

                    salva = resultado.valor;
                    toast.sucesso(existente ? 'Visita atualizada.' : 'Visita agendada.');
                    fechar();
                });
            },

            aoFechar() {
                destruirSeletorMedico?.();
                destruirSeletorMarcadores?.();
                resolve(salva);
            }
        });
    });
}

NS.ui = NS.ui || {};
NS.ui.forms = NS.ui.forms || {};
NS.ui.forms.visitaForm = { abrirFormularioVisita };
})();
