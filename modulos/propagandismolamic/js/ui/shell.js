// ===== js/ui/shell.js =====
(function () {
'use strict';

/**
 * Header e navegação.
 * Uma única fonte de dados alimenta a bottom-nav (mobile) e a sidebar (desktop) —
 * a diferença é só CSS.
 *
 * Itens sem permissão não são renderizados. Esconder em vez de desabilitar é
 * proposital: um menu cheio de opções mortas só informa ao usuário o que ele
 * não pode fazer. A rota continua protegida em `js/main.js`, então esconder
 * aqui é conveniência, não a barreira.
 */

var html = NS.core.dom.html;
var raw = NS.core.dom.raw;
var iniciais = NS.core.dom.iniciais;
var on = NS.core.events.on;
var EVENTOS = NS.core.events.EVENTOS;
var icone = NS.ui.icons.icone;
var modal = NS.ui.modal;
var config = NS.domain.config;
var permissoes = NS.domain.permissoes;
var usuario = NS.domain.usuario;
let desinscrever = [];

const ITENS_NAV = [
    { caminho: '/agenda', rotulo: 'Agenda', icone: 'agenda', permissao: 'agenda.ver' },
    { caminho: '/medicos', rotulo: 'Médicos', icone: 'medicos', permissao: 'medicos.ver' },
    { caminho: '/config', rotulo: 'Ajustes', icone: 'config', permissao: '' }
];

function itensVisiveis() {
    return ITENS_NAV.filter(item => !item.permissao || permissoes.pode(item.permissao));
}

function renderNav(nav, caminhoAtivo) {
    nav.innerHTML = itensVisiveis().map(item => html`
        <a class="nav-item${raw(item.caminho === caminhoAtivo ? ' nav-item--ativo' : '')}"
           href="#${item.caminho}"
           ${raw(item.caminho === caminhoAtivo ? 'aria-current="page"' : '')}>
            ${raw(icone(item.icone))}
            <span class="nav-item__label">${item.rotulo}</span>
        </a>
    `).join('');
}

function renderIdentidade() {
    const atual = usuario.atual();
    const nome = atual ? atual.nome : config.nomeUsuario();
    const logo = document.querySelector('.app-header__logo');
    const alvo = document.getElementById('header-usuario');

    if (alvo) {
        alvo.textContent = nome || 'Propagandista';
        alvo.title = atual
            ? `${atual.login}${atual.admin ? ' · Administrador' : ''}`
            : '';
    }
    if (logo) logo.textContent = nome ? iniciais(nome) : 'LR';
}

function renderAcoes(container, aoSair) {
    const atual = usuario.atual();
    if (!container) return;

    container.innerHTML = html`
        ${raw(atual?.admin ? html`
            <span class="selo selo--admin" title="Administrador Geral">
                ${raw(icone('escudo'))} ADM
            </span>
        ` : '')}
        <button type="button" class="btn btn--sutil btn--icone" data-sair aria-label="Sair" title="Sair">
            ${raw(icone('sair'))}
        </button>
    `;

    container.querySelector('[data-sair]').addEventListener('click', async () => {
        const confirmado = await modal.confirmar({
            titulo: 'Sair do sistema',
            mensagem: `Encerrar a sessão de ${atual ? atual.nome : 'usuário'}?`,
            detalhe: 'Os dados continuam no servidor — entrar de novo traz tudo de volta.',
            confirmarTexto: 'Sair'
        });
        if (!confirmado) return;

        modal.fecharTodos();
        usuario.sair();
        aoSair?.();
    });
}

/**
 * @param {object} [opcoes]
 * @param {Function} [opcoes.aoSair]  chamado depois de encerrar a sessão
 */
function iniciarShell({ aoSair } = {}) {
    const nav = document.getElementById('app-nav');
    const acoes = document.getElementById('header-acoes');

    renderNav(nav, location.hash.replace(/^#/, '').split('?')[0] || '/agenda');
    renderIdentidade();
    renderAcoes(acoes, aoSair);

    // Entrar de novo na mesma aba chama iniciarShell outra vez; sem isto os
    // ouvintes se somariam a cada login.
    desinscrever.forEach(fn => fn?.());
    desinscrever = [];

    desinscrever.push(on(EVENTOS.CONFIG_ALTERADA, renderIdentidade));
    desinscrever.push(on(EVENTOS.SESSAO_ALTERADA, () => {
        renderIdentidade();
        renderAcoes(acoes, aoSair);
        renderNav(nav, location.hash.replace(/^#/, '').split('?')[0] || '/agenda');
    }));

    return {
        aoTrocarTela(caminho) {
            renderNav(nav, caminho);
        }
    };
}

NS.ui = NS.ui || {};
NS.ui.shell = { ITENS_NAV, iniciarShell };
})();
