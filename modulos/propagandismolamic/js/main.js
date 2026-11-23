// ===== js/main.js =====
(function () {
'use strict';

/**
 * Bootstrap: Firebase -> base -> sessão -> (login | shell + navegação).
 *
 * Nada é renderizado antes do primeiro snapshot do banco: o overlay de
 * carregamento cobre a tela desde o primeiro frame (ele vem estático no
 * index.html) e só sai com o app montado ou com a tela de erro.
 *
 * A decisão de acesso acontece antes de montar o shell: sem sessão, nada do
 * app é renderizado — nem header, nem nav, nem rota. É aqui também que mora a
 * guarda de rota, porque `js/core/navegacao.js` não conhece permissão (a
 * camada `core` nunca depende de `domain`).
 */

var html = NS.core.dom.html;
var raw = NS.core.dom.raw;
var db = NS.core.db;
var sessao = NS.core.sessao;
var navegacao = NS.core.navegacao;
var permissoes = NS.domain.permissoes;
var usuario = NS.domain.usuario;
var iniciarShell = NS.ui.shell.iniciarShell;
var toast = NS.ui.toast;
var modal = NS.ui.modal;
var carregando = NS.ui.carregando;
var firebase = NS.core.firebase;
var migracaoLocal = NS.core.migracaoLocal;
var conexaoBanner = NS.ui.conexaoBanner;
var on = NS.core.events.on;
var EVENTOS = NS.core.events.EVENTOS;
var icone = NS.ui.icons.icone;
var dadosSessao = NS.core.dadosSessao;
var viewLogin = NS.ui.views.login;
var viewAgenda = NS.ui.views.agenda.viewAgenda;
var viewMedicos = NS.ui.views.medicos.viewMedicos;
var viewConfig = NS.ui.views.config.viewConfig;
let appIniciado = false;

function renderSemAcesso(container) {
    container.innerHTML = html`
        <div class="sem-acesso">
            ${raw(icone('cadeado'))}
            <h1>Sem acesso a esta tela</h1>
            <p>
                Seu grupo de permissões não inclui esta área. Se você precisa dela,
                peça a um administrador para ajustar seu grupo em Ajustes › Usuários.
            </p>
        </div>
    `;
}

/**
 * Envolve uma view com a checagem de permissão. O usuário sem acesso vê a
 * tela de bloqueio — nunca o conteúdo, mesmo digitando a hash na barra.
 */
function protegida(view, chave) {
    return {
        render(container, params) {
            if (!permissoes.pode(chave)) {
                renderSemAcesso(container);
                return;
            }
            return view.render(container, params);
        },
        destroy() {
            view.destroy?.();
        }
    };
}

/** Primeira rota permitida — evita cair numa tela bloqueada logo ao entrar. */
function rotaPadrao() {
    if (permissoes.pode('agenda.ver')) return '/agenda';
    if (permissoes.pode('medicos.ver')) return '/medicos';
    return '/config';
}

function iniciarApp() {
    const app = document.getElementById('app');
    document.body.classList.remove('sessao-fechada');
    app.innerHTML = '';

    const shell = iniciarShell({ aoSair: mostrarLogin });

    // registrar() sobrescreve por caminho, então reentrar depois de um logout
    // apenas atualiza as rotas — não duplica nada.
    navegacao.registrar('/agenda', protegida(viewAgenda, 'agenda.ver'));
    navegacao.registrar('/medicos', protegida(viewMedicos, 'medicos.ver'));
    navegacao.registrar('/config', viewConfig);

    const padrao = rotaPadrao();

    if (appIniciado) {
        // Segunda sessão na mesma aba: a navegação já está viva, só realinha.
        navegacao.navegar(padrao, {}, { substituir: true });
        shell.aoTrocarTela(padrao);
        return;
    }

    appIniciado = true;
    navegacao.iniciar(app, {
        padrao,
        onTrocar: caminho => shell.aoTrocarTela(caminho)
    });
}

// Sem login próprio: ao sair (ou perder o acesso) mostra o aviso e o caminho de volta pelo Dados LAMIC.
function mostrarLogin() {
    const app = document.getElementById('app');
    document.body.classList.add('sessao-fechada');
    app.innerHTML = html`
        <div class="sem-acesso">
            ${raw(icone('cadeado'))}
            <h1>Sessão encerrada</h1>
            <p>O acesso ao Propagandismo é feito pelo Dados LAMIC.</p>
            <p><button type="button" class="btn btn--primario" onclick="location.reload()">Entrar de novo</button>
               <a class="btn btn--outline" href="${dadosSessao.DADOS_URL}" target="_top">Abrir o Dados LAMIC</a></p>
        </div>
    `;
}

function mostrarLoginAntigo() {
    const app = document.getElementById('app');

    // Depois de um logout a navegação continua ouvindo `hashchange`. Apontar
    // todas as rotas para a própria tela de login faz com que digitar
    // "#/medicos" na barra devolva o login, nunca a tela por baixo.
    if (appIniciado) {
        const telaLogin = { render: container => viewLogin.render(container, { aoEntrar: iniciarApp }) };
        for (const caminho of ['/agenda', '/medicos', '/config']) navegacao.registrar(caminho, telaLogin);
    }

    viewLogin.render(app, { aoEntrar: iniciarApp });
}

/** Um app desatualizado não pode gravar no formato antigo. */
function versaoObsoleta(minima) {
    return !!minima && String(minima) > String(NS.APP_VERSION || '');
}

/**
 * Derruba a sessão quando a conta some ou é desativada em outra máquina —
 * agora que a base é compartilhada, isso acontece enquanto o app está aberto.
 */
function vigiarSessao() {
    on(EVENTOS.DADOS_ALTERADOS, () => {
        if (!sessao.estaAutenticado() || usuario.atual()) return;

        modal.fecharTodos();
        sessao.encerrar();
        toast.alerta('Seu acesso foi alterado por um administrador. Entre novamente.', 8000);
        mostrarLogin();
    });
}

async function iniciar() {
    carregando.boot.mostrar('Conectando ao servidor…');

    try {
        firebase.iniciar();
    } catch {
        carregando.boot.erro({
            titulo: 'Não foi possível carregar o sistema',
            mensagem: 'Os arquivos do Firebase não foram encontrados. Baixe a pasta do app novamente.'
        });
        return;
    }

    carregando.boot.texto('Conferindo sua sessão do Dados LAMIC…');
    const prep = await dadosSessao.preparar();
    if (!prep.ok) {
        carregando.boot.erro({ titulo: prep.titulo, mensagem: prep.motivo });
        return;
    }

    carregando.boot.texto('Carregando dados…');

    let estado;
    try {
        estado = await carregando.comTimeout(db.iniciar(), 20000);
    } catch (erro) {
        const texto = String(erro?.message || erro || '');
        // Regras do Realtime Database ainda fechadas é o erro de instalação
        // mais comum — dizer isso poupa uma hora de caça ao fantasma.
        const semPermissao = /permission|denied/i.test(texto);

        carregando.boot.erro({
            titulo: semPermissao ? 'Sem acesso ao Propagandismo' : 'Sem conexão com o banco de dados',
            mensagem: semPermissao
                ? 'Seu grupo no Dados LAMIC não tem acesso a este módulo. Peça a um administrador do Dados LAMIC.'
                : `Verifique sua internet e tente de novo. Este app não funciona offline. (${texto || 'tempo esgotado'})`
        });
        return;
    }

    if (versaoObsoleta(estado.versaoMinima)) {
        carregando.boot.erro({
            titulo: 'Nova versão disponível',
            mensagem: 'Este computador está com uma versão antiga do sistema. Atualize a pasta do app e recarregue.'
        });
        return;
    }

    // Base na nuvem ainda vazia e dados presos no navegador: oferta única.
    if (estado.baseVazia && migracaoLocal.temDadosLocais()) {
        carregando.boot.esconder();
        await migracaoLocal.oferecerUpload();
        carregando.boot.mostrar('Carregando dados…');
    }

    sessao.iniciar();
    conexaoBanner.iniciar();

    // Sessão apontando para um usuário apagado ou desativado não vale nada.
    if (sessao.estaAutenticado() && !usuario.atual()) sessao.encerrar();
    vigiarSessao();

    // Liga (ou cria) o usuário daqui à conta do Dados e abre a sessão — sem tela de login.
    const entrada = await dadosSessao.entrar();
    if (!entrada.ok) {
        carregando.boot.erro({ titulo: entrada.titulo, mensagem: entrada.motivo });
        return;
    }
    iniciarApp();

    carregando.boot.esconder();
    // A partir daqui o overlay é das ações do usuário, não do boot.
    window.__bootConcluido?.();
}

/** Falha no boot nunca pode virar spinner eterno. */
function iniciarProtegido() {
    Promise.resolve()
        .then(iniciar)
        .catch(erro => {
            const detalhe = erro?.stack || erro?.message || String(erro);
            if (window.__erroBoot) window.__erroBoot(detalhe);
            else console.error(erro);
        });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarProtegido);
} else {
    iniciarProtegido();
}

NS.main = { iniciarApp, mostrarLogin };
})();
