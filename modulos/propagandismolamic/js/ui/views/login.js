// ===== js/ui/views/login.js =====
(function () {
'use strict';

/**
 * Tela de acesso — fora do sistema de navegação.
 *
 * Enquanto não há sessão, `js/main.js` renderiza esta tela direto no `#app` e
 * marca `body.sessao-fechada` (esconde header e nav). Só depois de autenticar
 * o app monta shell e rotas: não existe estado intermediário em que a agenda
 * apareça sem usuário.
 *
 * Três modos no mesmo arquivo, porque compartilham cartão, campos e validação:
 *   login          entrar com login e senha
 *   autocadastro   criar a própria conta, no grupo padrão
 *   primeiroAdmin  base sem administrador — configura o ADM inicial
 */

var html = NS.core.dom.html;
var raw = NS.core.dom.raw;
var delegarAcoes = NS.core.dom.delegarAcoes;
var icone = NS.ui.icons.icone;
var toast = NS.ui.toast;
var carregando = NS.ui.carregando;
var campoTexto = NS.ui.components.formField.campoTexto;
var campoSenha = NS.ui.components.formField.campoSenha;
var ligarRevelarSenha = NS.ui.components.formField.ligarRevelarSenha;
var aplicarErros = NS.ui.components.formField.aplicarErros;
var limparErros = NS.ui.components.formField.limparErros;
var lerFormulario = NS.ui.components.formField.lerFormulario;
var usuario = NS.domain.usuario;
var permissoes = NS.domain.permissoes;
var db = NS.core.db;
/* ------------------------------------------------------------------ *
 * Corpos por modo
 * ------------------------------------------------------------------ */

function corpoLogin() {
    const autocadastroLigado = !!db.lerConfig().autocadastro && !!permissoes.grupoPadrao();

    return {
        titulo: 'ACESSO AO SISTEMA',
        subtitulo: 'Digite suas credenciais para continuar',
        markup: html`
            <form class="form auth-form" id="form-acesso" novalidate>
                ${raw(campoTexto({
                    nome: 'login',
                    label: 'Login',
                    obrigatorio: true,
                    autocomplete: 'username',
                    atributos: 'autocapitalize="none" spellcheck="false"'
                }))}
                ${raw(campoSenha({ nome: 'senha', label: 'Senha' }))}

                <span class="campo__erro auth-form__erro" data-erro-geral></span>

                <button type="submit" class="btn btn--primario btn--bloco btn--alto">
                    ${raw(icone('entrar'))} ENTRAR
                </button>

                ${raw(autocadastroLigado ? html`
                    <button type="button" class="btn btn--sutil btn--bloco" data-acao="irAutocadastro">
                        ${raw(icone('usuarioAdicionar'))} CRIAR MINHA CONTA
                    </button>
                ` : '')}
            </form>
        `
    };
}

function corpoCadastro(modo) {
    const primeiro = modo === 'primeiroAdmin';

    return {
        titulo: primeiro ? 'CONFIGURAÇÃO INICIAL' : 'CRIAR MINHA CONTA',
        subtitulo: primeiro
            ? 'Nenhum administrador cadastrado — crie o seu acesso'
            : 'Preencha os dados para criar seu acesso',
        markup: html`
            <form class="form auth-form" id="form-acesso" novalidate>
                ${raw(primeiro ? html`
                    <div class="auth-aviso">
                        ${raw(icone('escudo'))}
                        <div>
                            <strong>Esta conta será o Administrador Geral.</strong>
                            Ela tem acesso total ao sistema e é quem cadastra os demais
                            usuários. Guarde bem a senha: não há como recuperá-la.
                        </div>
                    </div>
                ` : '')}

                ${raw(campoTexto({ nome: 'nome', label: 'Nome completo', obrigatorio: true, autocomplete: 'name' }))}
                ${raw(campoTexto({
                    nome: 'login',
                    label: 'Login',
                    obrigatorio: true,
                    ajuda: 'Usado para entrar no sistema.',
                    autocomplete: 'username',
                    atributos: 'autocapitalize="none" spellcheck="false"'
                }))}
                ${raw(campoSenha({
                    nome: 'senha',
                    label: 'Senha',
                    ajuda: `Mínimo de ${usuario.SENHA_MINIMA} caracteres.`,
                    autocomplete: 'new-password'
                }))}
                ${raw(campoSenha({ nome: 'confirmarSenha', label: 'Confirmar senha', autocomplete: 'new-password' }))}

                <span class="campo__erro auth-form__erro" data-erro-geral></span>

                <button type="submit" class="btn btn--primario btn--bloco btn--alto">
                    ${raw(icone('check'))} ${primeiro ? 'CRIAR ADMINISTRADOR' : 'CRIAR CONTA'}
                </button>

                ${raw(primeiro ? '' : html`
                    <button type="button" class="btn btn--sutil btn--bloco" data-acao="irLogin">
                        Já tenho conta — voltar ao login
                    </button>
                `)}
            </form>
        `
    };
}

/* ------------------------------------------------------------------ *
 * Render
 * ------------------------------------------------------------------ */

/**
 * @param {HTMLElement} container
 * @param {object} opcoes
 * @param {'login'|'autocadastro'|'primeiroAdmin'} [opcoes.modo]
 * @param {Function} opcoes.aoEntrar   chamado quando a sessão é aberta
 */
function render(container, { modo = 'login', aoEntrar } = {}) {
    // Base sem administrador tem um caminho só: criar o ADM inicial.
    if (usuario.precisaPrimeiroAdmin()) modo = 'primeiroAdmin';

    const { titulo, subtitulo, markup } = modo === 'login' ? corpoLogin() : corpoCadastro(modo);

    document.body.classList.add('sessao-fechada');

    container.innerHTML = html`
        <div class="auth">
            <p class="auth__sistema">SISTEMA DE GESTÃO DE VISITAS</p>

            <div class="auth-card">
                <div class="auth-card__topo">
                    <h1 class="auth-card__titulo">${titulo}</h1>
                    <p class="auth-card__sub">${subtitulo}</p>
                </div>
                <div class="auth-card__corpo">
                    ${raw(markup)}
                </div>
            </div>

            ${raw(usuario.hashForteDisponivel() ? '' : html`
                <p class="auth__nota auth__nota--alerta">
                    Este navegador não oferece hash forte de senha. As contas continuam
                    funcionando, mas com proteção reduzida.
                </p>
            `)}

            <p class="auth__nota">
                Os dados ficam num banco compartilhado pela equipe e precisam de
                internet. O login organiza o acesso ao sistema — não é uma barreira
                contra quem já tem o endereço do banco.
            </p>
        </div>
    `;

    const form = container.querySelector('#form-acesso');
    const erroGeral = container.querySelector('[data-erro-geral]');
    const botaoEnviar = form.querySelector('button[type="submit"]');

    ligarRevelarSenha(form);

    // Delegação presa à raiz recém-criada, não ao #app: trocar de modo
    // re-renderiza, e um listener no container acumularia a cada troca.
    delegarAcoes(container.querySelector('.auth'), {
        irAutocadastro: () => render(container, { modo: 'autocadastro', aoEntrar }),
        irLogin: () => render(container, { modo: 'login', aoEntrar })
    });

    form.addEventListener('submit', async e => {
        e.preventDefault();
        limparErros(form);
        erroGeral.textContent = '';

        const dados = lerFormulario(form);
        botaoEnviar.disabled = true;
        const fimCarregando = carregando.mostrar(modo === 'login' ? 'Entrando…' : 'Criando conta…');

        try {
            const resultado = modo === 'login'
                ? await enviarLogin(dados, form, erroGeral)
                : await enviarCadastro(modo, dados, form, erroGeral);

            // Cadastro grava no servidor; login grava o `ultimoAcesso`. Nos
            // dois casos, esperar a confirmação evita entrar no app com uma
            // gravação ainda no ar.
            await NS.core.db.pendente();

            if (resultado?.ok) {
                document.body.classList.remove('sessao-fechada');
                aoEntrar?.(resultado.usuario);
            }
        } catch (erro) {
            erroGeral.textContent = erro?.name === 'ErroSemConexao'
                ? 'Sem conexão com o servidor. Tente novamente em instantes.'
                : 'Não foi possível concluir. Tente novamente.';
        } finally {
            fimCarregando();
            botaoEnviar.disabled = false;
        }
    });
}

async function enviarLogin(dados, form, erroGeral) {
    if (!dados.login || !dados.senha) {
        aplicarErros(form, {
            ...(dados.login ? {} : { login: 'Informe o login.' }),
            ...(dados.senha ? {} : { senha: 'Informe a senha.' })
        });
        return null;
    }

    const resultado = await usuario.autenticar(dados.login, dados.senha);

    if (!resultado.ok) {
        erroGeral.textContent = resultado.motivo;
        form.querySelector('[name="senha"]').value = '';
        form.querySelector('[name="senha"]').focus();
        return null;
    }

    toast.sucesso(`Bem-vindo(a), ${resultado.usuario.nome.split(/\s+/)[0]}.`);
    return resultado;
}

async function enviarCadastro(modo, dados, form, erroGeral) {
    const primeiro = modo === 'primeiroAdmin';

    // No autocadastro o grupo não é escolhido pela pessoa: vem do grupo
    // padrão. Ele entra na validação para não disparar "escolha um grupo"
    // num formulário que nem tem esse campo.
    const grupoPadrao = primeiro ? null : permissoes.grupoPadrao();

    if (!primeiro && !grupoPadrao) {
        erroGeral.textContent = 'Nenhum grupo padrão configurado. Procure um administrador.';
        return null;
    }

    const erros = usuario.validar({
        ...dados,
        admin: primeiro,
        grupoId: grupoPadrao?.id || ''
    });

    if (Object.keys(erros).length) {
        aplicarErros(form, erros);
        return null;
    }

    const resultado = modo === 'primeiroAdmin'
        ? await usuario.criarPrimeiroAdmin(dados)
        : await usuario.autocadastrar(dados);

    if (!resultado.ok) {
        erroGeral.textContent = resultado.motivo;
        return null;
    }

    toast.sucesso(modo === 'primeiroAdmin'
        ? 'Administrador criado. Você já está no sistema.'
        : 'Conta criada. Bem-vindo(a)!');

    return resultado;
}

NS.ui = NS.ui || {};
NS.ui.views = NS.ui.views || {};
NS.ui.views.login = { render };
})();
