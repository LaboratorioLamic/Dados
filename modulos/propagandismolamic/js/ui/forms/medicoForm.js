// ===== js/ui/forms/medicoForm.js =====
(function () {
'use strict';

/**
 * Formulário de cadastro/edição de médico.
 *
 * Renderiza uma vez e é lido com FormData no submit — nunca re-renderiza
 * durante a digitação.
 */

var html = NS.core.dom.html;
var raw = NS.core.dom.raw;
var modal = NS.ui.modal;
var toast = NS.ui.toast;
var carregando = NS.ui.carregando;
var campoTexto = NS.ui.components.formField.campoTexto;
var campoTextarea = NS.ui.components.formField.campoTextarea;
var aplicarErros = NS.ui.components.formField.aplicarErros;
var limparErros = NS.ui.components.formField.limparErros;
var mostrarAviso = NS.ui.components.formField.mostrarAviso;
var lerFormulario = NS.ui.components.formField.lerFormulario;
var icone = NS.ui.icons.icone;
var medicos = NS.domain.medico;
var especialidades = NS.domain.especialidade;
var ESTADOS_BR = NS.domain.enderecoUtils.ESTADOS_BR;
var aplicarMascaraTelefone = NS.domain.telefone.aplicarMascaraTelefone;
var ehTelefoneValido = NS.domain.telefone.ehTelefoneValido;
var ehCelular = NS.domain.telefone.ehCelular;
var ligarBuscaAutomatica = NS.services.viacep.ligarBuscaAutomatica;
var enderecoAutocomplete = NS.services.enderecoAutocomplete;
var abrirGerenciarCatalogo = NS.ui.forms.catalogoForm.abrirGerenciarCatalogo;
var pode = NS.domain.permissoes.pode;

function opcoesEspecialidade(selecionadaId) {
    const lista = especialidades.listar();
    const itens = lista.map(e => html`
        <option value="${e.id}"${raw(e.id === selecionadaId ? ' selected' : '')}>${e.nome}</option>
    `).join('');
    return html`<option value="">Selecione...</option>${raw(itens)}`;
}

/**
 * Dias de rotina como checkboxes com o mesmo `name`. FormData guardaria só
 * o último marcado, então o submit lê esses campos à parte.
 */
function campoRotina(selecionados) {
    return html`
        <fieldset class="campo campo-rotina" data-campo="rotina">
            <legend class="campo__label">Rotina de visita</legend>
            <div class="campo-rotina__dias">
                ${raw(medicos.DIAS_ROTINA.map(({ dia, curto, nome }) => html`
                    <label class="campo-rotina__dia" title="${nome}">
                        <input type="checkbox" name="rotina" value="${dia}"${raw(selecionados.includes(dia) ? ' checked' : '')}>
                        <span>${curto}</span>
                    </label>
                `).join(''))}
            </div>
            <span class="campo__ajuda">Opcional — o médico aparece nesses dias na visão Rotina da Agenda.</span>
        </fieldset>
    `;
}

function corpoFormulario(medico) {
    const endereco = medico.endereco || {};

    return html`
        <form class="form" id="form-medico" novalidate>
            ${raw(campoTexto({
                nome: 'nome',
                label: 'Nome do médico',
                valor: medico.nome,
                placeholder: 'Dr. Nome Sobrenome',
                obrigatorio: true,
                autocomplete: 'name'
            }))}

            <div class="form-linha form-linha--2">
                ${raw(campoTexto({
                    nome: 'crm',
                    label: 'CRM',
                    valor: medico.crm,
                    placeholder: '00000-CE'
                }))}

                <div class="campo" data-campo="especialidadeId">
                    <label class="campo__label" for="campo-especialidadeId">Especialidade</label>
                    <div class="campo-com-botao">
                        <select class="campo__controle" id="campo-especialidadeId" name="especialidadeId" data-select-especialidade>
                            ${raw(opcoesEspecialidade(medico.especialidadeId))}
                        </select>
                        ${raw(pode('catalogos.gerenciar') ? html`
                            <button type="button" class="btn btn--outline btn--icone" data-gerenciar-especialidades aria-label="Gerenciar especialidades" title="Gerenciar especialidades">
                                ${raw(icone('config'))}
                            </button>
                        ` : '')}
                    </div>
                    <span class="campo__erro" data-erro="especialidadeId"></span>
                </div>
            </div>

            <div class="form-secao">
                <span class="form-secao__titulo">Contato</span>
                <div class="form-linha form-linha--2">
                    ${raw(campoTexto({
                        nome: 'telefone',
                        label: 'Telefone do consultório',
                        valor: medico.telefone,
                        placeholder: '(88) 3344-1122',
                        inputmode: 'tel',
                        maxlength: '16',
                        ajuda: 'Recepção / secretária'
                    }))}
                    ${raw(campoTexto({
                        nome: 'whatsapp',
                        label: 'WhatsApp',
                        valor: medico.whatsapp,
                        placeholder: '(88) 99844-1122',
                        inputmode: 'tel',
                        maxlength: '16',
                        ajuda: 'Celular direto — habilita o botão de conversa'
                    }))}
                </div>
            </div>

            <div class="form-secao">
                <span class="form-secao__titulo">Endereço do consultório</span>

                <div class="form-linha form-linha--cep">
                    ${raw(campoTexto({
                        nome: 'cep',
                        label: 'CEP',
                        valor: endereco.cep,
                        placeholder: '00000-000',
                        inputmode: 'numeric',
                        maxlength: '9',
                        ajuda: 'Preenche o endereço sozinho'
                    }))}
                    ${raw(campoTexto({
                        nome: 'rua',
                        label: 'Rua',
                        valor: endereco.rua,
                        placeholder: 'Av. Exemplo'
                    }))}
                </div>

                <div class="form-linha form-linha--num-bairro">
                    ${raw(campoTexto({
                        nome: 'numero',
                        label: 'Número',
                        valor: endereco.numero,
                        placeholder: '1000',
                        inputmode: 'numeric'
                    }))}
                    ${raw(campoTexto({
                        nome: 'bairro',
                        label: 'Bairro',
                        valor: endereco.bairro,
                        placeholder: 'Centro'
                    }))}
                </div>

                <div class="form-linha form-linha--cidade-uf">
                    ${raw(campoTexto({
                        nome: 'cidade',
                        label: 'Cidade',
                        valor: endereco.cidade,
                        placeholder: 'Sobral'
                    }))}
                    ${raw(campoTexto({
                        nome: 'estado',
                        label: 'UF',
                        valor: endereco.estado,
                        placeholder: 'CE',
                        maxlength: '20',
                        atributos: 'list=\"lista-estados\"'
                    }))}
                </div>

                <datalist id="lista-estados">
                    ${raw(ESTADOS_BR.map(uf => html`<option value="${uf}"></option>`).join(''))}
                </datalist>

                ${raw(campoTexto({
                    nome: 'complemento',
                    label: 'Complemento',
                    valor: endereco.complemento,
                    placeholder: 'Sala, bloco, andar'
                }))}

                ${raw(campoTexto({
                    nome: 'referencia',
                    label: 'Ponto de referência',
                    valor: medico.referencia,
                    placeholder: 'Ed. Médico Central, sala 402'
                }))}
            </div>

            <div class="form-secao">
                <span class="form-secao__titulo">Atendimento</span>
                ${raw(campoTextarea({
                    nome: 'diasHorarios',
                    label: 'Dias e horários',
                    valor: medico.diasHorarios,
                    placeholder: 'Seg e Qua (08h-12h), Sex (14h-18h)',
                    linhas: 2
                }))}

                ${raw(campoRotina(medicos.normalizarRotina(medico.rotina)))}
            </div>

            <div class="form__acoes">
                <button type="button" class="btn btn--outline" data-modal-fechar>Cancelar</button>
                <button type="submit" class="btn btn--primario">
                    ${raw(icone('check'))} Salvar
                </button>
            </div>
        </form>
    `;
}

/**
 * Abre o formulário. `medicoExistente` ausente = novo cadastro.
 * @returns {Promise<object|null>} o médico salvo, ou null se cancelado
 */
function abrirFormularioMedico(medicoExistente = null) {
    return new Promise(resolve => {
        const medico = medicoExistente
            ? { ...medicos.medicoVazio(), ...medicoExistente }
            : medicos.medicoVazio();

        let salvo = null;

        modal.abrir({
            titulo: medicoExistente ? 'Editar médico' : 'Novo médico',
            subtitulo: medicoExistente ? medico.nome : 'Cadastre um médico na sua carteira',
            corpo: corpoFormulario(medico),

            aoMontar({ corpo, fechar }) {
                const form = corpo.querySelector('#form-medico');

                aplicarMascaraTelefone(form.querySelector('[name="telefone"]'));
                aplicarMascaraTelefone(form.querySelector('[name="whatsapp"]'));

                corpo.querySelector('[data-gerenciar-especialidades]')?.addEventListener('click', async () => {
                    const select = form.querySelector('[data-select-especialidade]');
                    const selecionadaId = select.value;

                    await abrirGerenciarCatalogo({
                        titulo: 'Especialidades',
                        rotuloItem: 'Especialidade',
                        dominio: especialidades
                    });

                    select.innerHTML = opcoesEspecialidade(selecionadaId);
                });

                ligarBuscaAutomatica(form, {
                    aoFalhar: mensagem => toast.alerta(mensagem)
                });
                enderecoAutocomplete.ligarAutocompletar(form);

                // Aviso de fixo no campo WhatsApp: sinaliza, não bloqueia.
                const whatsapp = form.querySelector('[name="whatsapp"]');
                whatsapp.addEventListener('blur', () => {
                    const valor = whatsapp.value.trim();
                    const suspeito = valor && ehTelefoneValido(valor) && !ehCelular(valor);
                    mostrarAviso(form, 'whatsapp', suspeito
                        ? 'Parece um telefone fixo — WhatsApp normalmente é celular.'
                        : '');
                });

                form.addEventListener('submit', async e => {
                    e.preventDefault();
                    limparErros(form);

                    const dados = medicos.montarDoFormulario({
                        ...lerFormulario(form),
                        rotina: [...form.querySelectorAll('[name="rotina"]:checked')].map(c => c.value)
                    });
                    const erros = medicos.validar(dados);

                    if (Object.keys(erros).length) {
                        aplicarErros(form, erros);
                        return;
                    }

                    // O modal só fecha depois que o servidor confirma: sem isso
                    // o usuário fecharia a tela achando que gravou.
                    const resultado = await carregando.acaoRemota(
                        () => medicoExistente
                            ? medicos.atualizar(medicoExistente.id, dados)
                            : medicos.criar(dados),
                        { mensagem: 'Salvando médico…' }
                    );
                    if (!resultado.ok) return;

                    salvo = resultado.valor;
                    toast.sucesso(medicoExistente ? 'Médico atualizado.' : 'Médico cadastrado.');
                    fechar();
                });
            },

            aoFechar() {
                resolve(salvo);
            }
        });
    });
}

NS.ui = NS.ui || {};
NS.ui.forms = NS.ui.forms || {};
NS.ui.forms.medicoForm = { abrirFormularioMedico };
})();
