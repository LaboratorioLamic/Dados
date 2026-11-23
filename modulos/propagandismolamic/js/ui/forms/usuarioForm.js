// ===== js/ui/forms/usuarioForm.js =====
(function () {
'use strict';

/**
 * Formulário de usuário — criação e edição.
 *
 * O mesmo markup serve à sub-aba "Novo usuário" (renderizado em tela) e à
 * edição (dentro de um modal). Por isso a montagem é separada da abertura:
 * `renderFormulario` monta em qualquer container, `abrirFormularioUsuario`
 * só embrulha isso num modal.
 *
 * Na edição a senha é opcional: em branco mantém a atual.
 */

var html = NS.core.dom.html;
var raw = NS.core.dom.raw;
var modal = NS.ui.modal;
var toast = NS.ui.toast;
var carregando = NS.ui.carregando;
var icone = NS.ui.icons.icone;
var campoTexto = NS.ui.components.formField.campoTexto;
var campoSelect = NS.ui.components.formField.campoSelect;
var campoSenha = NS.ui.components.formField.campoSenha;
var ligarRevelarSenha = NS.ui.components.formField.ligarRevelarSenha;
var aplicarErros = NS.ui.components.formField.aplicarErros;
var limparErros = NS.ui.components.formField.limparErros;
var lerFormulario = NS.ui.components.formField.lerFormulario;
var usuario = NS.domain.usuario;
var permissoes = NS.domain.permissoes;
var sessao = NS.core.sessao;
function markup(existente) {
    const edicao = !!existente;
    const grupos = permissoes.listarGrupos();
    if (edicao && existente.dadosLogin) return markupLigado(existente, grupos);

    return html`
        <form class="form" id="form-usuario" novalidate>
            ${raw(campoTexto({
                nome: 'nome',
                label: 'Nome completo',
                valor: existente?.nome || '',
                obrigatorio: true,
                autocomplete: 'name'
            }))}

            <div class="form-linha form-linha--2">
                ${raw(campoTexto({
                    nome: 'cpf',
                    label: 'CPF',
                    valor: existente?.cpf || '',
                    placeholder: '000.000.000-00',
                    inputmode: 'numeric',
                    maxlength: '14'
                }))}
                ${raw(campoSelect({
                    nome: 'grupoId',
                    label: 'Grupo',
                    valor: existente?.grupoId || '',
                    obrigatorio: true,
                    vazio: 'Selecione...',
                    opcoes: grupos.map(g => ({ valor: g.id, texto: g.nome }))
                }))}
            </div>

            <div class="form-linha form-linha--2">
                ${raw(campoTexto({
                    nome: 'login',
                    label: 'Login',
                    valor: existente?.login || '',
                    obrigatorio: true,
                    autocomplete: 'off',
                    atributos: 'autocapitalize="none" spellcheck="false"'
                }))}
                ${raw(campoSenha({
                    nome: 'senha',
                    label: 'Senha',
                    obrigatorio: !edicao,
                    ajuda: edicao
                        ? 'Deixe em branco para manter a senha atual.'
                        : `Mínimo de ${usuario.SENHA_MINIMA} caracteres.`,
                    autocomplete: 'new-password'
                }))}
            </div>

            ${raw(campoSenha({
                nome: 'confirmarSenha',
                label: 'Confirmar senha',
                obrigatorio: !edicao,
                autocomplete: 'new-password'
            }))}

            <label class="destaque-check">
                <input type="checkbox" name="admin" ${raw(existente?.admin ? 'checked' : '')}>
                <span>
                    <strong>Administrador Geral</strong>
                    <em>Acesso total ao sistema — isento de grupo</em>
                </span>
            </label>

            ${raw(grupos.length ? '' : html`
                <div class="auth-aviso">
                    ${raw(icone('alerta'))}
                    <div>Nenhum grupo cadastrado. Crie um em <strong>Grupos e permissões</strong>
                    ou marque este usuário como Administrador Geral.</div>
                </div>
            `)}

            <span class="campo__erro auth-form__erro" data-erro-geral></span>

            <div class="form__acoes">
                ${raw(edicao ? html`
                    <button type="button" class="btn btn--outline" data-cancelar>Cancelar</button>
                ` : '')}
                <button type="submit" class="btn btn--primario">
                    ${raw(icone('check'))} ${edicao ? 'Salvar alterações' : 'Cadastrar usuário'}
                </button>
            </div>
        </form>
    `;
}

// Conta do Dados LAMIC: nome, CPF e login só leitura; sem senha. Aqui só grupo e administrador.
function markupLigado(existente, grupos) {
    const so = (rotulo, valor) => html`
        <label class="campo campo--desativado">
            <span class="campo__label">${rotulo}</span>
            <input class="campo__input" value="${valor || '—'}" readonly disabled>
        </label>`;
    return html`
        <form class="form" id="form-usuario" novalidate>
            <div class="auth-aviso">
                ${raw(icone('escudo'))}
                <div>Nome, CPF, login e senha vêm do <strong>Dados LAMIC</strong> e só podem ser alterados lá.</div>
            </div>
            ${raw(so('Nome completo', existente.nome))}
            <div class="form-linha form-linha--2">
                ${raw(so('CPF', existente.cpf))}
                ${raw(so('Login', existente.dadosLogin))}
            </div>
            ${raw(campoSelect({
                nome: 'grupoId',
                label: 'Grupo',
                valor: existente?.grupoId || '',
                obrigatorio: true,
                vazio: 'Selecione...',
                opcoes: grupos.map(g => ({ valor: g.id, texto: g.nome }))
            }))}
            <label class="destaque-check">
                <input type="checkbox" name="admin" ${raw(existente?.admin ? 'checked' : '')}>
                <span>
                    <strong>Administrador Geral</strong>
                    <em>Acesso total ao sistema — isento de grupo</em>
                </span>
            </label>
            <span class="campo__erro auth-form__erro" data-erro-geral></span>
            <div class="form__acoes">
                <button type="button" class="btn btn--outline" data-cancelar>Cancelar</button>
                <button type="submit" class="btn btn--primario">${raw(icone('check'))} Salvar alterações</button>
            </div>
        </form>
    `;
}

/**
 * Monta o formulário dentro de `container`.
 *
 * @param {HTMLElement} container
 * @param {object} [opcoes]
 * @param {object} [opcoes.usuario]     usuário existente (edição)
 * @param {Function} [opcoes.aoSalvar]  recebe o usuário salvo
 * @param {Function} [opcoes.aoCancelar]
 */
function renderFormulario(container, { usuario: existente = null, aoSalvar, aoCancelar } = {}) {
    container.innerHTML = markup(existente);

    const form = container.querySelector('#form-usuario');
    const erroGeral = form.querySelector('[data-erro-geral]');
    const checkAdmin = form.querySelector('[name="admin"]');
    const selectGrupo = form.querySelector('[name="grupoId"]');
    const campoCpf = form.querySelector('[name="cpf"]');
    const botaoEnviar = form.querySelector('button[type="submit"]');

    ligarRevelarSenha(form);

    // Admin é isento de grupo: o select some do caminho em vez de exigir
    // um valor que seria descartado.
    function sincronizarAdmin() {
        const ehAdmin = checkAdmin.checked;
        selectGrupo.disabled = ehAdmin;
        selectGrupo.required = !ehAdmin;
        selectGrupo.closest('.campo').classList.toggle('campo--desativado', ehAdmin);
    }

    checkAdmin.addEventListener('change', sincronizarAdmin);
    sincronizarAdmin();

    if (campoCpf) campoCpf.addEventListener('input', () => {
        const posicaoFinal = campoCpf.selectionStart === campoCpf.value.length;
        campoCpf.value = usuario.formatarCpf(campoCpf.value);
        if (posicaoFinal) campoCpf.setSelectionRange(campoCpf.value.length, campoCpf.value.length);
    });

    form.querySelector('[data-cancelar]')?.addEventListener('click', () => aoCancelar?.());

    form.addEventListener('submit', async e => {
        e.preventDefault();
        limparErros(form);
        erroGeral.textContent = '';

        const dados = lerFormulario(form);
        dados.admin = checkAdmin.checked;
        if (dados.admin) dados.grupoId = '';
        // Conta do Dados: só grupo/admin mudam; o resto é o que já está gravado
        if (existente?.dadosLogin) Object.assign(dados, { nome: existente.nome, cpf: '', login: existente.login, senha: '', confirmarSenha: '' });
        if (!existente) { erroGeral.textContent = 'Usuários vêm do Dados LAMIC: dê acesso ao módulo pelo grupo da pessoa no Dados.'; return; }

        const erros = usuario.validar(dados, {
            ignorarId: existente?.id || null,
            senhaOpcional: !!existente
        });

        if (Object.keys(erros).length) {
            aplicarErros(form, erros);
            return;
        }

        botaoEnviar.disabled = true;
        const fimCarregando = carregando.mostrar(existente ? 'Salvando usuário…' : 'Criando usuário…');

        try {
            if (existente) {
                const resultado = await usuario.atualizar(existente.id, dados);
                await NS.core.db.pendente();
                if (!resultado.ok) {
                    erroGeral.textContent = resultado.motivo;
                    return;
                }

                // Trocar as próprias permissões exige recarregar para o app
                // se realinhar (nav, rotas, botões) — avisamos em vez de
                // deixar a tela mentindo sobre o que dá para fazer.
                if (existente.id === sessao.usuarioId()) {
                    toast.alerta('Você alterou a própria conta. Recarregue a página para aplicar tudo.', 7000);
                } else {
                    toast.sucesso('Usuário atualizado.');
                }

                aoSalvar?.(resultado.usuario);
            } else {
                const criado = await usuario.criar(dados);
                await NS.core.db.pendente();
                toast.sucesso(`Usuário "${criado.nome}" cadastrado.`);
                renderFormulario(container, { aoSalvar, aoCancelar });
                aoSalvar?.(criado);
            }
        } catch (erro) {
            erroGeral.textContent = erro?.name === 'ErroSemConexao'
                ? 'Sem conexão com o servidor. Nada foi salvo.'
                : 'Não foi possível salvar. Tente novamente.';
        } finally {
            fimCarregando();
            botaoEnviar.disabled = false;
        }
    });

    return form;
}

/** Edição em modal, a partir da lista de usuários. @returns {Promise<boolean>} */
function abrirFormularioUsuario(existente) {
    return new Promise(resolve => {
        let salvou = false;

        modal.abrir({
            titulo: existente ? 'Editar usuário' : 'Novo usuário',
            subtitulo: existente ? existente.login : 'Cadastro de acesso ao sistema',
            largo: true,
            corpo: '<div data-slot-usuario></div>',
            aoMontar({ corpo, fechar }) {
                renderFormulario(corpo.querySelector('[data-slot-usuario]'), {
                    usuario: existente,
                    aoCancelar: fechar,
                    aoSalvar: () => {
                        salvou = true;
                        fechar();
                    }
                });
            },
            aoFechar() {
                resolve(salvou);
            }
        });
    });
}

NS.ui = NS.ui || {};
NS.ui.forms = NS.ui.forms || {};
NS.ui.forms.usuarioForm = { abrirFormularioUsuario, renderFormulario };
})();
