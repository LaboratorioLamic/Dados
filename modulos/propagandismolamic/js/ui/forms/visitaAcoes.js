// ===== js/ui/forms/visitaAcoes.js =====
(function () {
'use strict';

/**
 * Modais das transições de estado da visita.
 *
 * Toda mudança de status passa pelo domínio (`aplicarTransicao` /
 * `reagendar`) — nenhum destes handlers escreve `visita.status`.
 */

var html = NS.core.dom.html;
var raw = NS.core.dom.raw;
var hojeISO = NS.core.dom.hojeISO;
var formatarData = NS.core.dom.formatarData;
var formatarDataExtensa = NS.core.dom.formatarDataExtensa;
var modal = NS.ui.modal;
var toast = NS.ui.toast;
var carregando = NS.ui.carregando;
var campoTexto = NS.ui.components.formField.campoTexto;
var campoTextarea = NS.ui.components.formField.campoTextarea;
var lerFormulario = NS.ui.components.formField.lerFormulario;
var aplicarErros = NS.ui.components.formField.aplicarErros;
var limparErros = NS.ui.components.formField.limparErros;
var icone = NS.ui.icons.icone;
var avatar = NS.ui.components.card.avatar;
var botaoWhatsApp = NS.ui.components.card.botaoWhatsApp;
var chipsMarcadores = NS.ui.components.card.chipsMarcadores;
var resumirEndereco = NS.domain.enderecoUtils.resumirEndereco;
var visitas = NS.domain.visita;
var medicos = NS.domain.medico;
var objetivos = NS.domain.objetivo;
var motivosAusencia = NS.domain.motivoAusencia;
var especialidades = NS.domain.especialidade;
var abrirFormularioVisita = NS.ui.forms.visitaForm.abrirFormularioVisita;
var abrirGerenciarCatalogo = NS.ui.forms.catalogoForm.abrirGerenciarCatalogo;
var pode = NS.domain.permissoes.pode;

function opcoesObjetivoHtml(selecionado) {
    return html`
        <option value="">Selecione...</option>
        ${raw(objetivos.listar().map(o => html`
            <option value="${o.id}"${raw(o.id === selecionado ? ' selected' : '')}>${o.nome}</option>
        `).join(''))}
    `;
}

/**
 * Registrar visita realizada. Ao concluir, abre uma confirmação que
 * pergunta se a próxima visita deve ser agendada junto — com um único
 * fluxo de reagendamento (não dois).
 */
function abrirRegistrarVisita(visitaId) {
    return new Promise(resolve => {
        const visita = visitas.obter(visitaId);
        if (!visita) {
            toast.erro('Visita não encontrada.');
            resolve(false);
            return;
        }

        const medico = medicos.obter(visita.medicoId);
        let concluida = false;

        modal.abrir({
            titulo: 'Registrar visita',
            subtitulo: `${medico?.nome || 'Médico'} · ${formatarData(visita.data)}`,
            corpo: html`
                <form class="form" id="form-registrar" novalidate>
                    <div class="campo" data-campo="objetivo">
                        <label class="campo__label" for="campo-objetivo-registrar">Objetivo trabalhado</label>
                        <div class="campo-com-botao">
                            <select class="campo__controle" id="campo-objetivo-registrar" name="objetivo" data-select-objetivo>
                                ${raw(opcoesObjetivoHtml(visita.objetivo))}
                            </select>
                            ${raw(pode('catalogos.gerenciar') ? html`
                                <button type="button" class="btn btn--outline btn--icone" data-gerenciar-objetivos aria-label="Gerenciar objetivos" title="Gerenciar objetivos">
                                    ${raw(icone('config'))}
                                </button>
                            ` : '')}
                        </div>
                    </div>

                    ${raw(campoTextarea({
                        nome: 'notas',
                        label: 'Feedback do médico e próximos passos',
                        valor: visita.notas,
                        placeholder: 'Ex: demonstrou interesse na genotipagem de HPV; pediu material sobre painel de ISTs.',
                        linhas: 4
                    }))}

                    <div class="form__acoes">
                        <button type="button" class="btn btn--outline" data-modal-fechar>Cancelar</button>
                        <button type="submit" class="btn btn--primario">
                            ${raw(icone('checkCirculo'))} Concluir visita
                        </button>
                    </div>
                </form>
            `,

            aoMontar({ corpo, fechar }) {
                const form = corpo.querySelector('#form-registrar');

                corpo.querySelector('[data-gerenciar-objetivos]')?.addEventListener('click', async () => {
                    const select = form.querySelector('[data-select-objetivo]');
                    const selecionado = select.value;
                    await abrirGerenciarCatalogo({ titulo: 'Objetivos de visita', rotuloItem: 'Objetivo', dominio: objetivos });
                    select.innerHTML = opcoesObjetivoHtml(selecionado);
                });

                form.addEventListener('submit', async e => {
                    e.preventDefault();
                    const dados = lerFormulario(form);

                    const confirmacao = await abrirConfirmarConclusao(visita, medico);
                    if (!confirmacao) return;

                    // As duas escritas entram no mesmo `update()`: ninguém vê a
                    // visita com o objetivo novo e o status velho.
                    let transicao;
                    const gravacao = await carregando.acaoRemota(() => {
                        visitas.atualizar(visitaId, { objetivo: dados.objetivo });
                        transicao = visitas.aplicarTransicao(visitaId, visitas.STATUS.REALIZADA, {
                            notas: dados.notas
                        });
                    }, { mensagem: 'Registrando visita…' });

                    if (!gravacao.ok) return;

                    if (!transicao.ok) {
                        toast.erro(transicao.erro);
                        return;
                    }

                    concluida = true;
                    toast.sucesso('Visita registrada.');
                    fechar();

                    if (confirmacao.reagendar) {
                        await abrirFormularioVisita({
                            medicoId: visita.medicoId,
                            rascunho: {
                                data: confirmacao.data,
                                horario: confirmacao.horario,
                                duracao: confirmacao.duracao,
                                objetivo: dados.objetivo
                            }
                        });
                    }
                });
            },

            aoFechar() {
                resolve(concluida);
            }
        });
    });
}

/**
 * Confirmação exibida ao concluir uma visita: finalizar simples ou já
 * com o reagendamento da próxima. Clicar no cartão de reagendamento
 * revela os campos de data/horário. Resolve `false` se cancelado, ou
 * `{ reagendar, data, horario, duracao }` se confirmado.
 */
function abrirConfirmarConclusao(visita, medico) {
    return new Promise(resolve => {
        const [ano, mes, dia] = hojeISO().split('-').map(Number);
        const amanha = new Date(ano, mes - 1, dia + 1);
        const dataSugerida = `${amanha.getFullYear()}-${String(amanha.getMonth() + 1).padStart(2, '0')}-${String(amanha.getDate()).padStart(2, '0')}`;

        let confirmado = false;

        modal.abrir({
            titulo: 'Concluir visita',
            subtitulo: `${medico?.nome || 'Médico'} · ${formatarData(visita.data)}`,
            corpo: html`
                <form class="form" id="form-confirmar-conclusao" novalidate>
                    <div class="confirmacao__aviso">
                        Confirma a conclusão desta visita?
                    </div>

                    <button type="button" class="toggle-reagendar" data-toggle-reagendar aria-pressed="false">
                        <span class="toggle-reagendar__icone">${raw(icone('reagendar'))}</span>
                        <span class="toggle-reagendar__texto">
                            <strong>Já agendar a próxima visita</strong>
                            <small>Reserve data e horário com este médico agora</small>
                        </span>
                        <span class="toggle-reagendar__check">${raw(icone('check'))}</span>
                    </button>

                    <div class="toggle-reagendar__campos" data-bloco-reagendar hidden>
                        <div class="form-linha form-linha--3">
                            ${raw(campoTexto({
                                nome: 'data',
                                label: 'Nova data',
                                tipo: 'date',
                                valor: dataSugerida
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
                    </div>

                    <div class="form__acoes">
                        <button type="button" class="btn btn--outline" data-modal-fechar>Voltar</button>
                        <button type="button" class="btn btn--primario" data-acao="confirmar">
                            ${raw(icone('checkCirculo'))} Concluir
                        </button>
                    </div>
                </form>
            `,

            aoMontar({ corpo, fechar }) {
                const form = corpo.querySelector('#form-confirmar-conclusao');
                const toggle = corpo.querySelector('[data-toggle-reagendar]');
                const bloco = corpo.querySelector('[data-bloco-reagendar]');
                let ativo = false;

                toggle.addEventListener('click', () => {
                    ativo = !ativo;
                    toggle.classList.toggle('toggle-reagendar--ativo', ativo);
                    toggle.setAttribute('aria-pressed', String(ativo));
                    bloco.hidden = !ativo;
                });

                corpo.querySelector('[data-acao="confirmar"]').addEventListener('click', () => {
                    const dados = lerFormulario(form);

                    if (ativo && !dados.data) {
                        aplicarErros(form, { data: 'Informe a data.' });
                        return;
                    }

                    confirmado = ativo
                        ? { reagendar: true, data: dados.data, horario: dados.horario, duracao: dados.duracao || visitas.DURACAO_PADRAO }
                        : { reagendar: false };

                    fechar();
                });
            },

            aoFechar() {
                resolve(confirmado);
            }
        });
    });
}

/** Médico não atendeu — exige motivo. */
function abrirMarcarAusente(visitaId) {
    return new Promise(resolve => {
        const visita = visitas.obter(visitaId);
        if (!visita) {
            toast.erro('Visita não encontrada.');
            resolve(false);
            return;
        }

        const medico = medicos.obter(visita.medicoId);
        let marcada = false;
        let motivo = '';

        const opcoesMotivo = () => motivosAusencia.listar().map(item => html`
            <button type="button" class="opcao${raw(item.nome === motivo ? ' opcao--ativa' : '')}" data-motivo="${item.nome}">
                ${raw(icone('fecharCirculo'))} ${item.nome}
            </button>
        `).join('');

        modal.abrir({
            titulo: 'Médico não atendeu',
            subtitulo: medico?.nome || '',
            corpo: html`
                <div class="form">
                    ${raw(medico?.whatsapp ? html`
                        <div class="detalhe__contato">
                            <span class="texto-sm">Avisar que passou no consultório?</span>
                            ${raw(botaoWhatsApp(medico.whatsapp, medico.nome, { comRotulo: true }))}
                        </div>
                    ` : '')}

                    <div class="campo">
                        <div class="campo__label-linha">
                            <span class="campo__label">Motivo</span>
                            ${raw(pode('catalogos.gerenciar') ? html`
                                <button type="button" class="btn btn--sutil btn--sm" data-gerenciar-motivos>
                                    ${raw(icone('config'))} Gerenciar motivos
                                </button>
                            ` : '')}
                        </div>
                        <div class="form" data-opcoes>${raw(opcoesMotivo())}</div>
                        <span class="campo__erro" data-erro="motivo"></span>
                    </div>

                    ${raw(campoTextarea({
                        nome: 'notas',
                        label: 'Observação',
                        valor: '',
                        placeholder: 'Ex: secretária pediu para retornar na próxima terça.',
                        linhas: 2
                    }))}

                    <div class="form__acoes">
                        <button type="button" class="btn btn--outline" data-modal-fechar>Cancelar</button>
                        <button type="button" class="btn btn--primario" data-acao="salvar">
                            ${raw(icone('check'))} Salvar
                        </button>
                    </div>
                </div>
            `,

            aoMontar({ corpo, fechar }) {
                const slotErro = corpo.querySelector('[data-erro="motivo"]');
                const listaOpcoes = corpo.querySelector('[data-opcoes]');

                corpo.querySelector('[data-gerenciar-motivos]')?.addEventListener('click', async () => {
                    await abrirGerenciarCatalogo({ titulo: 'Motivos de ausência', rotuloItem: 'Motivo', dominio: motivosAusencia });
                    // O motivo escolhido pode ter sido renomeado ou removido:
                    // a seleção só sobrevive se o texto ainda existir no catálogo.
                    if (motivo && !motivosAusencia.porNome(motivo)) motivo = '';
                    listaOpcoes.innerHTML = opcoesMotivo();
                });

                listaOpcoes.addEventListener('click', e => {
                    const botao = e.target.closest('[data-motivo]');
                    if (!botao) return;

                    listaOpcoes.querySelectorAll('.opcao').forEach(el => el.classList.remove('opcao--ativa'));
                    botao.classList.add('opcao--ativa');
                    motivo = botao.dataset.motivo;
                    slotErro.textContent = '';
                });

                corpo.querySelector('[data-acao="salvar"]').addEventListener('click', async () => {
                    if (!motivo) {
                        slotErro.textContent = 'Selecione o motivo.';
                        return;
                    }

                    const notas = corpo.querySelector('[name="notas"]').value.trim();
                    const gravacao = await carregando.acaoRemota(
                        () => visitas.aplicarTransicao(visitaId, visitas.STATUS.AUSENTE, {
                            motivoAusencia: motivo,
                            notas
                        }),
                        { mensagem: 'Registrando ausência…' }
                    );
                    if (!gravacao.ok) return;

                    if (!gravacao.valor.ok) {
                        toast.erro(gravacao.valor.erro);
                        return;
                    }

                    marcada = true;
                    toast.sucesso('Registrado como não atendida.');
                    fechar();
                });
            },

            aoFechar() {
                resolve(marcada);
            }
        });
    });
}

/** Reagendar: move a própria visita para a nova data/hora, sem duplicar. */
function abrirReagendar(visitaId) {
    return new Promise(resolve => {
        const visita = visitas.obter(visitaId);
        if (!visita) {
            toast.erro('Visita não encontrada.');
            resolve(false);
            return;
        }

        const medico = medicos.obter(visita.medicoId);
        let feito = false;

        modal.abrir({
            titulo: 'Reagendar visita',
            subtitulo: `${medico?.nome || 'Médico'} · originalmente ${formatarData(visita.data)}`,
            corpo: html`
                <form class="form" id="form-reagendar" novalidate>
                    <div class="confirmacao__aviso">
                        A visita será <strong>movida</strong> para a nova data e horário —
                        nada é duplicado.
                    </div>

                    <div class="form-linha form-linha--3">
                        ${raw(campoTexto({
                            nome: 'data',
                            label: 'Nova data',
                            tipo: 'date',
                            valor: hojeISO(),
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

                    ${raw(campoTextarea({
                        nome: 'notas',
                        label: 'Notas para a nova visita',
                        valor: visita.notas,
                        linhas: 2
                    }))}

                    <div class="form__acoes">
                        <button type="button" class="btn btn--outline" data-modal-fechar>Cancelar</button>
                        <button type="submit" class="btn btn--primario">
                            ${raw(icone('reagendar'))} Reagendar
                        </button>
                    </div>
                </form>
            `,

            aoMontar({ corpo, fechar }) {
                const form = corpo.querySelector('#form-reagendar');

                form.addEventListener('submit', async e => {
                    e.preventDefault();
                    limparErros(form);

                    const dados = lerFormulario(form);
                    if (!dados.data) {
                        aplicarErros(form, { data: 'Informe a nova data.' });
                        return;
                    }

                    const gravacao = await carregando.acaoRemota(
                        () => visitas.reagendar(visitaId, {
                            data: dados.data,
                            horario: dados.horario,
                            duracao: dados.duracao || visitas.DURACAO_PADRAO,
                            notas: dados.notas
                        }),
                        { mensagem: 'Reagendando…' }
                    );
                    if (!gravacao.ok) return;

                    if (!gravacao.valor.ok) {
                        toast.erro(gravacao.valor.erro);
                        return;
                    }

                    feito = true;
                    toast.sucesso(`Reagendada para ${formatarData(dados.data)}.`);
                    fechar();
                });
            },

            aoFechar() {
                resolve(feito);
            }
        });
    });
}

/** Cancelar visita — estado terminal, pede confirmação. */
async function confirmarCancelamento(visitaId) {
    const visita = visitas.obter(visitaId);
    if (!visita) return false;

    const medico = medicos.obter(visita.medicoId);

    const confirmado = await modal.confirmar({
        titulo: 'Cancelar visita',
        mensagem: `Cancelar a visita a ${medico?.nome || 'este médico'} em ${formatarData(visita.data)}?`,
        detalhe: 'Uma visita cancelada não pode ser reaberta — só é possível agendar uma nova.',
        confirmarTexto: 'Cancelar visita',
        cancelarTexto: 'Voltar',
        perigo: true
    });

    if (!confirmado) return false;

    const gravacao = await carregando.acaoRemota(
        () => visitas.aplicarTransicao(visitaId, visitas.STATUS.CANCELADA),
        { mensagem: 'Cancelando visita…' }
    );
    if (!gravacao.ok) return false;

    if (!gravacao.valor.ok) {
        toast.erro(gravacao.valor.erro);
        return false;
    }

    toast.sucesso('Visita cancelada.');
    return true;
}

/**
 * Exclusão definitiva de uma visita já encerrada (concluída, ausente ou
 * cancelada). Diferente de cancelar: aqui o registro some do histórico,
 * então a confirmação é explícita e sem desfazer.
 */
async function confirmarExclusao(visitaId) {
    const visita = visitas.obter(visitaId);
    if (!visita) {
        toast.erro('Visita não encontrada.');
        return false;
    }

    const medico = medicos.obter(visita.medicoId);

    const confirmado = await modal.confirmar({
        titulo: 'Excluir visita',
        mensagem: `Excluir a visita a ${medico?.nome || 'este médico'} em ${formatarData(visita.data)}?`,
        detalhe: 'O registro sai do histórico do médico e não há como recuperar.',
        confirmarTexto: 'Excluir',
        cancelarTexto: 'Voltar',
        perigo: true
    });
    if (!confirmado) return false;

    const gravacao = await carregando.acaoRemota(
        () => visitas.remover(visitaId),
        { mensagem: 'Excluindo visita…' }
    );
    if (!gravacao.ok) return false;

    if (!gravacao.valor) {
        toast.erro('Não foi possível excluir a visita.');
        return false;
    }

    toast.sucesso('Visita excluída.');
    return true;
}

/**
 * Janela de visualização da visita: mostra as informações principais e,
 * abaixo, as ações possíveis em botões compactos. Usada pelo calendário
 * (Semana/Mês) e pelo histórico do médico — mesma janela nos dois lugares.
 */
function abrirVisualizarVisita(visitaId, { aoAlterar } = {}) {
    const visita = visitas.obter(visitaId);
    if (!visita) {
        toast.erro('Visita não encontrada.');
        return;
    }

    const medico = medicos.obter(visita.medicoId);
    const nome = medico?.nome || 'Médico removido';
    const fim = visitas.horarioFim(visita.horario, visita.duracao);
    const faixaHorario = visita.horario && fim ? `${visita.horario}–${fim}` : visita.horario;
    const atrasada = visitas.estaAtrasada(visita);
    const classeFaixa = atrasada ? 'atrasada' : visita.status;
    const endereco = medico ? resumirEndereco(medico.endereco) : '';

    modal.abrir({
        titulo: nome,
        subtitulo: [especialidades.obter(medico?.especialidadeId)?.nome, medico?.crm].filter(Boolean).join(' · '),
        corpo: html`
            <div class="visita-preview">
                <div class="visita-preview__faixa visita-preview__faixa--${raw(classeFaixa)}"></div>

                <div class="visita-preview__topo">
                    <div class="card__identidade">
                        ${raw(avatar(nome))}
                        <div>
                            <div class="card__nome">${nome}</div>
                            <div class="card__sub">${medico?.telefone || medico?.whatsapp || 'Sem contato informado'}</div>
                        </div>
                    </div>
                    <span class="tag tag--${raw(atrasada ? 'perigo' : visitas.TAG_STATUS[visita.status])}">
                        ${atrasada ? 'Atrasada' : visitas.ROTULOS_STATUS[visita.status]}
                    </span>
                </div>

                <div class="visita-preview__info">
                    <div class="card__linha">
                        ${raw(icone('relogio'))}
                        <span>${formatarDataExtensa(visita.data)}${faixaHorario ? ' · ' + faixaHorario : ''}</span>
                    </div>

                    ${raw(visita.objetivo ? html`
                        <div class="card__linha">
                            ${raw(icone('alvo'))}
                            <span>${objetivos.nomeDe(visita.objetivo) || visita.objetivo}</span>
                        </div>
                    ` : '')}

                    ${raw(endereco ? html`
                        <div class="card__linha">
                            ${raw(icone('mapa'))}
                            <span>${endereco}</span>
                        </div>
                    ` : '')}

                    ${raw(chipsMarcadores(visita))}

                    ${raw(visita.motivoAusencia ? html`
                        <div class="card__bloco"><strong>Motivo:</strong> ${visita.motivoAusencia}</div>
                    ` : '')}

                    ${raw(visita.notas ? html`<div class="card__nota">${visita.notas}</div>` : '')}
                </div>

                <div class="visita-preview__acoes" data-acoes-visita></div>
            </div>
        `,
        aoMontar({ corpo, fechar }) {
            const slot = corpo.querySelector('[data-acoes-visita]');
            const botoes = [];

            // Cada botão depende da permissão correspondente; sem nenhuma,
            // resta "Ver médico" e a janela vira só consulta.
            if (visita.status === visitas.STATUS.AGENDADA) {
                if (pode('agenda.concluir')) botoes.push(html`<button type="button" class="btn btn--primario btn--sm" data-acao="realizar">${raw(icone('checkCirculo'))} Registrar</button>`);
                if (pode('agenda.criar')) botoes.push(html`<button type="button" class="btn btn--outline btn--sm" data-acao="editar">${raw(icone('editar'))} Editar</button>`);
                if (pode('agenda.concluir')) botoes.push(html`<button type="button" class="btn btn--outline btn--sm" data-acao="ausente">${raw(icone('usuarioAusente'))} Não atendeu</button>`);
                if (pode('agenda.reagendar')) botoes.push(html`<button type="button" class="btn btn--outline btn--sm" data-acao="reagendar">${raw(icone('reagendar'))} Reagendar</button>`);
                if (pode('agenda.cancelar')) botoes.push(html`<button type="button" class="btn btn--perigo btn--sm" data-acao="cancelar">${raw(icone('fechar'))} Cancelar</button>`);
            } else if (visita.status === visitas.STATUS.AUSENTE && pode('agenda.reagendar')) {
                botoes.push(html`<button type="button" class="btn btn--primario btn--sm" data-acao="reagendar">${raw(icone('reagendar'))} Reagendar</button>`);
            }

            // Visita já encerrada continua editável (corrigir data, objetivo ou
            // anotações depois do registro) e pode ser excluída de vez.
            if (visitas.ehTerminal(visita.status)) {
                if (pode('agenda.criar')) botoes.push(html`<button type="button" class="btn btn--outline btn--sm" data-acao="editar">${raw(icone('editar'))} Gerenciar</button>`);
                if (pode('agenda.cancelar')) botoes.push(html`<button type="button" class="btn btn--perigo btn--sm" data-acao="excluir">${raw(icone('excluir'))} Excluir</button>`);
            }

            botoes.push(html`<button type="button" class="btn btn--sutil btn--sm" data-acao="verMedico">${raw(icone('info'))} Ver médico</button>`);
            slot.innerHTML = botoes.join('');

            slot.addEventListener('click', async e => {
                const acao = e.target.closest('[data-acao]')?.dataset.acao;
                if (!acao) return;

                if (acao === 'realizar') { fechar(); await abrirRegistrarVisita(visitaId); aoAlterar?.(); }
                else if (acao === 'editar') { fechar(); await abrirFormularioVisita({ visita }); aoAlterar?.(); }
                else if (acao === 'ausente') { fechar(); await abrirMarcarAusente(visitaId); aoAlterar?.(); }
                else if (acao === 'reagendar') { fechar(); await abrirReagendar(visitaId); aoAlterar?.(); }
                else if (acao === 'cancelar') { fechar(); await confirmarCancelamento(visitaId); aoAlterar?.(); }
                else if (acao === 'excluir') { fechar(); await confirmarExclusao(visitaId); aoAlterar?.(); }
                else if (acao === 'verMedico') {
                    fechar();
                    if (medico) NS.ui.views.medicoDetalhe.abrirDetalheMedico(medico.id, { aoAlterar });
                }
            });
        }
    });
}

NS.ui = NS.ui || {};
NS.ui.forms = NS.ui.forms || {};
NS.ui.forms.visitaAcoes = { abrirMarcarAusente, abrirReagendar, abrirRegistrarVisita, abrirVisualizarVisita, confirmarCancelamento, confirmarExclusao };
})();
