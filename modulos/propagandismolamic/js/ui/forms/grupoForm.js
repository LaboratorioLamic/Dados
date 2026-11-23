// ===== js/ui/forms/grupoForm.js =====
(function () {
'use strict';

/**
 * Painel "Grupos & Permissões".
 *
 * Os interruptores são gerados a partir de `MODULOS`, em
 * `js/domain/permissoes.js` — não existe lista de permissões escrita em HTML.
 * Acrescentar uma permissão lá faz o editor crescer sozinho, e um grupo
 * antigo simplesmente não a tem marcada.
 *
 * O grupo padrão é o atribuído no autocadastro; a marcação é exclusiva.
 */

var html = NS.core.dom.html;
var raw = NS.core.dom.raw;
var iniciais = NS.core.dom.iniciais;
var pluralizar = NS.core.dom.pluralizar;
var modal = NS.ui.modal;
var toast = NS.ui.toast;
var carregando = NS.ui.carregando;
var icone = NS.ui.icons.icone;
var permissoes = NS.domain.permissoes;
var db = NS.core.db;
/** Editor de permissões: um bloco colapsável por módulo. */
function editorPermissoes(marcadas, prefixo) {
    const selecionadas = new Set(marcadas || []);

    return html`
        <div class="permissoes-editor" data-editor="${prefixo}">
            ${raw(permissoes.MODULOS.map((modulo, indice) => html`
                <div class="modulo${raw(indice === 0 ? ' modulo--aberto' : '')}" data-modulo>
                    <button type="button" class="modulo__cab" data-abrir-modulo>
                        ${raw(icone(modulo.icone))}
                        <span>${modulo.rotulo}</span>
                        <span class="modulo__seta">${raw(icone('setaBaixo'))}</span>
                    </button>
                    <div class="modulo__corpo">
                        ${raw(modulo.permissoes.map(permissao => html`
                            <div class="perm-opcao">
                                <span class="perm-opcao__texto">
                                    <span class="perm-opcao__rotulo">${permissao.rotulo}</span>
                                    ${raw(permissao.ajuda ? html`<span class="perm-opcao__ajuda">${permissao.ajuda}</span>` : '')}
                                </span>
                                <label class="toggle toggle--sm">
                                    <input type="checkbox" value="${permissao.chave}" data-permissao
                                           ${raw(selecionadas.has(permissao.chave) ? 'checked' : '')}>
                                    <span class="toggle__trilho"></span>
                                    <span class="visualmente-oculto">${permissao.rotulo}</span>
                                </label>
                            </div>
                        `).join(''))}
                    </div>
                </div>
            `).join(''))}
        </div>
    `;
}

function lerPermissoes(raiz) {
    return Array.from(raiz.querySelectorAll('[data-permissao]:checked')).map(el => el.value);
}

/**
 * Colapsar/expandir os módulos dentro de um editor, em modo sanfona: abrir
 * um fecha os outros do MESMO editor (grupo novo e cada grupo existente
 * têm o seu). Com Agenda, Médicos, Catálogos, Ajustes e Usuários, deixar
 * vários abertos ao mesmo tempo empilha demais para a altura disponível —
 * cada um mostra só o título espremido contra o próximo.
 */
function ligarModulos(raiz) {
    raiz.addEventListener('click', e => {
        const cab = e.target.closest('[data-abrir-modulo]');
        if (!cab || !raiz.contains(cab)) return;

        const modulo = cab.closest('[data-modulo]');
        const editor = cab.closest('[data-editor]');
        const jaAberto = modulo.classList.contains('modulo--aberto');

        editor.querySelectorAll('[data-modulo]').forEach(m => m.classList.remove('modulo--aberto'));
        if (!jaAberto) modulo.classList.add('modulo--aberto');
    });
}

/* ------------------------------------------------------------------ *
 * Markup do painel
 * ------------------------------------------------------------------ */

function markupGrupo(grupo) {
    const usuarios = permissoes.usuariosDoGrupo(grupo.id).length;
    const total = (grupo.permissoes || []).length;

    return html`
        <div class="grupo-item" data-grupo="${grupo.id}">
            <button type="button" class="grupo-item__cab" data-abrir-grupo>
                <span class="avatar avatar--sm">${iniciais(grupo.nome)}</span>
                <span class="registro__info">
                    <span class="registro__nome">
                        ${grupo.nome}
                        ${raw(grupo.padrao ? html`<span class="selo selo--padrao">${raw(icone('estrela'))} PADRÃO</span>` : '')}
                    </span>
                    <span class="registro__meta contagem">
                        <strong>${usuarios}</strong> ${raw(usuarios === 1 ? 'usuário' : 'usuários')} ·
                        <strong>${total}</strong> ${raw(total === 1 ? 'permissão' : 'permissões')}
                    </span>
                </span>
                <span class="grupo-item__seta">${raw(icone('setaBaixo'))}</span>
            </button>

            <div class="grupo-item__corpo">
                <form class="form" data-form-grupo="${grupo.id}" novalidate>
                    <div class="campo" data-campo="nome">
                        <label class="campo__label" for="campo-grupo-${grupo.id}">Nome do grupo</label>
                        <input class="campo__controle" id="campo-grupo-${grupo.id}" name="nome"
                               value="${grupo.nome}" autocomplete="off">
                        <span class="campo__erro" data-erro="nome"></span>
                    </div>

                    ${raw(editorPermissoes(grupo.permissoes, grupo.id))}

                    <div class="perm-opcao">
                        <span class="perm-opcao__texto">
                            <span class="perm-opcao__rotulo">Grupo padrão do autocadastro</span>
                            <span class="perm-opcao__ajuda">Quem criar a própria conta entra neste grupo.</span>
                        </span>
                        <label class="toggle toggle--sm">
                            <input type="checkbox" data-padrao ${raw(grupo.padrao ? 'checked' : '')}>
                            <span class="toggle__trilho"></span>
                            <span class="visualmente-oculto">Grupo padrão</span>
                        </label>
                    </div>

                    <div class="form__acoes">
                        <button type="button" class="btn btn--perigo btn--sm" data-excluir-grupo>
                            ${raw(icone('excluir'))} Excluir
                        </button>
                        <button type="submit" class="btn btn--primario btn--sm">
                            ${raw(icone('check'))} Salvar
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

function markup() {
    const grupos = permissoes.listarGrupos();
    const config = db.lerConfig();

    return html`
        <div class="grupos-layout">
            <article class="card">
                <div class="bloco-titulo">
                    <span class="bloco-titulo__icone">${raw(icone('adicionar'))}</span>
                    <span class="bloco-titulo__texto">
                        <strong>Novo grupo</strong>
                        <span>Defina o que este perfil pode fazer</span>
                    </span>
                </div>

                <form class="form" id="form-novo-grupo" novalidate>
                    <div class="campo" data-campo="nome">
                        <label class="campo__label" for="campo-novo-grupo">
                            Nome do grupo <span class="campo__obrigatorio" aria-hidden="true">*</span>
                        </label>
                        <input class="campo__controle" id="campo-novo-grupo" name="nome"
                               placeholder="Ex: RECEPCIONISTA" autocomplete="off">
                        <span class="campo__erro" data-erro="nome"></span>
                    </div>

                    <span class="form-secao__titulo">Permissões do grupo</span>
                    ${raw(editorPermissoes([], 'novo'))}

                    <button type="submit" class="btn btn--primario btn--bloco">
                        ${raw(icone('adicionar'))} Criar grupo
                    </button>
                </form>
            </article>

            <div class="grid-cards">
                <article class="card">
                    <div class="perm-opcao">
                        <span class="perm-opcao__texto">
                            <span class="perm-opcao__rotulo">${raw(icone('usuarioAdicionar'))} Autocadastro de usuários</span>
                            <span class="perm-opcao__ajuda">
                                Permite que novos usuários criem a própria conta na tela de login.
                                O grupo marcado como padrão é atribuído automaticamente.
                            </span>
                        </span>
                        <label class="toggle">
                            <input type="checkbox" data-autocadastro ${raw(config.autocadastro ? 'checked' : '')}>
                            <span class="toggle__trilho"></span>
                            <span class="visualmente-oculto">Autocadastro de usuários</span>
                        </label>
                    </div>

                    ${raw(config.autocadastro && !permissoes.grupoPadrao() ? html`
                        <div class="auth-aviso">
                            ${raw(icone('alerta'))}
                            <div>Nenhum grupo está marcado como padrão — o autocadastro
                            ficará bloqueado até você marcar um abaixo.</div>
                        </div>
                    ` : '')}
                </article>

                <article class="card card--sem-recorte">
                    <div class="bloco-titulo">
                        <span class="bloco-titulo__icone">${raw(icone('grupos'))}</span>
                        <span class="bloco-titulo__texto">
                            <strong>Grupos cadastrados</strong>
                            <span>${pluralizar(grupos.length, 'grupo', 'grupos')}</span>
                        </span>
                    </div>

                    ${raw(grupos.length
                        ? grupos.map(markupGrupo).join('')
                        : html`<div class="lista-vazia">Nenhum grupo cadastrado ainda.</div>`)}
                </article>
            </div>
        </div>
    `;
}

/* ------------------------------------------------------------------ *
 * Montagem
 * ------------------------------------------------------------------ */

/** Renderiza o painel em `container`. `aoAlterar` avisa a tela pai. */
function renderPainelGrupos(container, { aoAlterar } = {}) {
    const rerender = () => {
        renderPainelGrupos(container, { aoAlterar });
        aoAlterar?.();
    };

    container.innerHTML = markup();

    const raiz = container.querySelector('.grupos-layout');
    ligarModulos(raiz);

    /* --- Novo grupo --- */
    const formNovo = raiz.querySelector('#form-novo-grupo');
    formNovo.addEventListener('submit', async e => {
        e.preventDefault();

        const campoNome = formNovo.querySelector('[name="nome"]');
        const erro = formNovo.querySelector('[data-erro="nome"]');
        const mensagem = permissoes.validarGrupo(campoNome.value);

        if (mensagem) {
            erro.textContent = mensagem;
            campoNome.focus();
            return;
        }

        const escolhidas = lerPermissoes(formNovo.querySelector('[data-editor]'));
        const gravacao = await carregando.acaoRemota(
            () => permissoes.criarGrupo(campoNome.value, escolhidas),
            { mensagem: 'Criando grupo…' }
        );
        if (!gravacao.ok) return;

        toast.sucesso('Grupo criado.');
        rerender();
    });

    /* --- Autocadastro --- */
    raiz.querySelector('[data-autocadastro]').addEventListener('change', async e => {
        const ligado = e.target.checked;

        if (ligado && !permissoes.grupoPadrao()) {
            e.target.checked = false;
            toast.alerta('Marque antes um grupo como padrão — é ele que o autocadastro atribui.');
            return;
        }

        const gravacao = await carregando.acaoRemota(
            () => db.gravarConfig({ autocadastro: ligado }),
            { mensagem: 'Salvando…' }
        );
        if (!gravacao.ok) {
            e.target.checked = !ligado;
            return;
        }

        toast.sucesso(ligado ? 'Autocadastro ativado.' : 'Autocadastro desativado.');
        rerender();
    });

    /* --- Grupos existentes --- */
    raiz.addEventListener('click', e => {
        const cab = e.target.closest('[data-abrir-grupo]');
        if (cab && raiz.contains(cab)) cab.closest('.grupo-item').classList.toggle('grupo-item--aberto');
    });

    raiz.querySelectorAll('[data-form-grupo]').forEach(form => {
        const id = form.dataset.formGrupo;

        form.addEventListener('submit', async e => {
            e.preventDefault();

            const campoNome = form.querySelector('[name="nome"]');
            const erro = form.querySelector('[data-erro="nome"]');
            const mensagem = permissoes.validarGrupo(campoNome.value, { ignorarId: id });

            if (mensagem) {
                erro.textContent = mensagem;
                campoNome.focus();
                return;
            }

            const querPadrao = form.querySelector('[data-padrao]').checked;
            const eraPadrao = permissoes.obterGrupo(id)?.padrao;
            let desligouAutocadastro = false;

            // Nome, permissões e grupo padrão numa escrita só: o grupo nunca
            // fica salvo pela metade para os outros usuários.
            const gravacao = await carregando.acaoRemota(() => {
                permissoes.atualizarGrupo(id, {
                    nome: campoNome.value,
                    permissoes: lerPermissoes(form.querySelector('[data-editor]'))
                });

                if (querPadrao) permissoes.definirGrupoPadrao(id);
                // Desmarcar o padrão deixa o sistema sem grupo de autocadastro:
                // desliga o autocadastro junto, em vez de virar um botão morto.
                else if (eraPadrao) {
                    permissoes.definirGrupoPadrao('');
                    if (db.lerConfig().autocadastro) {
                        db.gravarConfig({ autocadastro: false });
                        desligouAutocadastro = true;
                    }
                }
            }, { mensagem: 'Salvando grupo…' });
            if (!gravacao.ok) return;

            if (desligouAutocadastro) toast.alerta('Sem grupo padrão, o autocadastro foi desativado.');
            toast.sucesso('Grupo salvo.');
            rerender();
        });

        form.querySelector('[data-excluir-grupo]').addEventListener('click', async () => {
            const grupo = permissoes.obterGrupo(id);
            const emUso = permissoes.usuariosDoGrupo(id).length;

            if (emUso) {
                toast.alerta(`"${grupo.nome}" tem ${pluralizar(emUso, 'usuário', 'usuários')}. Mova-os para outro grupo antes de excluir.`);
                return;
            }

            const confirmado = await modal.confirmar({
                titulo: 'Excluir grupo',
                mensagem: `Excluir o grupo "${grupo.nome}"?`,
                confirmarTexto: 'Excluir',
                perigo: true
            });
            if (!confirmado) return;

            const gravacao = await carregando.acaoRemota(
                () => permissoes.removerGrupo(id),
                { mensagem: 'Excluindo grupo…' }
            );
            if (!gravacao.ok) return;

            toast.sucesso('Grupo excluído.');
            rerender();
        });
    });
}

NS.ui = NS.ui || {};
NS.ui.forms = NS.ui.forms || {};
NS.ui.forms.grupoForm = { renderPainelGrupos };
})();
