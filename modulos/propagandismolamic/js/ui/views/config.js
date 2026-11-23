// ===== js/ui/views/config.js =====
(function () {
'use strict';

/**
 * Tela de Configurações: usuários, minha conta e backup.
 *
 * Duas abas. A de Usuários só existe para quem tem `usuarios.gerenciar`; a de
 * Backup mostra apenas os botões que o grupo permite. Esconder em vez de
 * desabilitar é a regra do projeto — um botão morto só informa ao usuário o
 * que ele não pode fazer.
 */

var html = NS.core.dom.html;
var raw = NS.core.dom.raw;
var iniciais = NS.core.dom.iniciais;
var delegarAcoes = NS.core.dom.delegarAcoes;
var pluralizar = NS.core.dom.pluralizar;
var formatarData = NS.core.dom.formatarData;
var on = NS.core.events.on;
var EVENTOS = NS.core.events.EVENTOS;
var modal = NS.ui.modal;
var toast = NS.ui.toast;
var carregando = NS.ui.carregando;
var icone = NS.ui.icons.icone;
var campoTexto = NS.ui.components.formField.campoTexto;
var campoSenha = NS.ui.components.formField.campoSenha;
var ligarRevelarSenha = NS.ui.components.formField.ligarRevelarSenha;
var lerFormulario = NS.ui.components.formField.lerFormulario;
var usuarioForm = NS.ui.forms.usuarioForm;
var grupoForm = NS.ui.forms.grupoForm;
var config = NS.domain.config;
var permissoes = NS.domain.permissoes;
var usuario = NS.domain.usuario;
var backup = NS.services.backup;
var dadosTeste = NS.services.dadosTeste;
let desinscrever = [];

/** Aba e sub-aba sobrevivem ao re-render disparado por `dados:alterados`. */
let abaAtiva = 'backup';
let subAbaAtiva = 'lista';

function podeGerenciarUsuarios() {
    return permissoes.pode('usuarios.gerenciar');
}

/* ------------------------------------------------------------------ *
 * Aba Usuários
 * ------------------------------------------------------------------ */

function markupUsuario(item) {
    const grupo = item.grupoId ? permissoes.obterGrupo(item.grupoId) : null;
    const inativo = item.ativo === false;

    const detalhes = [
        item.dadosLogin ? `Dados: ${item.dadosLogin}` : 'Sem vínculo com o Dados LAMIC',
        item.admin ? 'Administrador Geral' : (grupo?.nome || 'Sem grupo'),
        item.ultimoAcesso ? `Último acesso: ${formatarData(item.ultimoAcesso.slice(0, 10))}` : 'Nunca acessou'
    ].join(' · ');

    return html`
        <div class="registro${raw(inativo ? ' registro--inativo' : '')}" data-usuario="${item.id}">
            <span class="avatar">${iniciais(item.nome)}</span>
            <span class="registro__info">
                <span class="registro__nome">
                    ${item.nome}
                    ${raw(item.admin ? html`<span class="selo selo--admin">${raw(icone('escudo'))} ADM</span>` : '')}
                    ${raw(inativo ? html`<span class="selo selo--inativo">INATIVO</span>` : '')}
                    ${raw(item.dadosLogin ? '' : html`<span class="selo selo--inativo">SEM VÍNCULO</span>`)}
                </span>
                <span class="registro__meta">${detalhes}</span>
            </span>
            <span class="registro__acoes">
                <button type="button" class="btn btn--sutil btn--icone" data-acao="vincularUsuario"
                        data-id="${item.id}" aria-label="Vincular ${item.nome}" title="${item.dadosLogin ? 'Trocar ou remover vínculo com o Dados LAMIC' : 'Vincular a uma conta do Dados LAMIC'}">
                    ${raw(icone(item.dadosLogin ? 'usuarios' : 'usuarioAdicionar'))}
                </button>
                <button type="button" class="btn btn--sutil btn--icone" data-acao="editarUsuario"
                        data-id="${item.id}" aria-label="Editar ${item.nome}" title="Editar">
                    ${raw(icone('editar'))}
                </button>
                <button type="button" class="btn btn--sutil btn--icone" data-acao="alternarAtivo"
                        data-id="${item.id}" aria-label="${inativo ? 'Reativar' : 'Desativar'} ${item.nome}"
                        title="${inativo ? 'Reativar' : 'Desativar'}">
                    ${raw(icone(inativo ? 'checkCirculo' : 'fecharCirculo'))}
                </button>
                <button type="button" class="btn btn--sutil btn--icone" data-acao="excluirUsuario"
                        data-id="${item.id}" aria-label="Excluir ${item.nome}" title="Excluir">
                    ${raw(icone('excluir'))}
                </button>
            </span>
        </div>
    `;
}

function markupAbaUsuarios() {
    const lista = usuario.listar();

    const subAbas = [
        { id: 'lista', rotulo: 'Lista de usuários', icone: 'listaCards' },
        { id: 'grupos', rotulo: 'Grupos e permissões', icone: 'grupos' }
    ];

    return html`
        <div class="sub-abas">
            ${raw(subAbas.map(sub => html`
                <button type="button" class="sub-aba${raw(sub.id === subAbaAtiva ? ' sub-aba--ativa' : '')}"
                        data-acao="subAba" data-id="${sub.id}">
                    ${raw(icone(sub.icone))} ${sub.rotulo}
                </button>
            `).join(''))}
        </div>

        <div data-painel-usuarios>
            ${raw(subAbaAtiva === 'lista' ? html`
                <div class="lista-registros">
                    ${raw(lista.length
                        ? lista.map(markupUsuario).join('')
                        : html`<div class="lista-vazia">Nenhum usuário cadastrado.</div>`)}
                </div>
            ` : '')}

            ${raw(subAbaAtiva === 'novo' ? '<article class="card" data-slot-novo-usuario></article>' : '')}
            ${raw(subAbaAtiva === 'grupos' ? '<div data-slot-grupos></div>' : '')}
        </div>
    `;
}

/* ------------------------------------------------------------------ *
 * Aba Backup / conta
 * ------------------------------------------------------------------ */

function markupAbaBackup() {
    const atual = usuario.atual();
    const podeExportar = permissoes.pode('backup.exportar');
    const podeImportar = permissoes.pode('backup.importar');
    const podeApagar = permissoes.pode('backup.apagar');
    const grupo = atual?.grupoId ? permissoes.obterGrupo(atual.grupoId) : null;

    return html`
        <div class="grid-cards">
            <article class="card">
                <div class="bloco-titulo">
                    <span class="avatar">${iniciais(atual?.nome || '')}</span>
                    <span class="bloco-titulo__texto">
                        <strong>Minha conta</strong>
                        <span>
                            ${atual ? atual.login : ''} ·
                            ${atual?.admin ? 'Administrador Geral' : (grupo?.nome || 'Sem grupo')}
                        </span>
                    </span>
                </div>

                <form class="form" id="form-config">
                    ${raw(campoTexto({
                        nome: 'nomeUsuario',
                        label: 'Nome',
                        valor: atual?.nome || config.nomeUsuario(),
                        placeholder: 'Ex: Ana Beatriz',
                        autocomplete: 'name',
                        atributos: 'readonly disabled'
                    }))}
                    <div class="card__nota">Nome, login e senha são os do Dados LAMIC e só mudam por lá.</div>
                </form>

                ${raw(usuario.hashForteDisponivel() ? '' : html`
                    <div class="card__nota">
                        Este navegador não oferece hash forte de senha (<code>crypto.subtle</code>).
                        As contas funcionam, mas com proteção reduzida.
                    </div>
                `)}
            </article>

            ${raw(podeExportar || podeImportar ? html`
                <article class="card">
                    <div class="card__nome">Backup</div>
                    <p class="card__sub">
                        Os dados ficam no servidor e são os mesmos para toda a equipe.
                        O backup é a sua rede de proteção contra exclusões acidentais —
                        exporte com frequência.
                    </p>

                    <div class="card__bloco">
                        <strong>Agora:</strong> <span data-resumo-dados></span>
                    </div>

                    <div class="card__acoes">
                        ${raw(podeExportar ? html`
                            <button type="button" class="btn btn--outline btn--cresce" data-acao="exportar">
                                ${raw(icone('download'))} Exportar
                            </button>
                        ` : '')}
                        ${raw(podeImportar ? html`
                            <button type="button" class="btn btn--outline btn--cresce" data-acao="importar">
                                ${raw(icone('upload'))} Importar
                            </button>
                        ` : '')}
                    </div>

                    ${raw(podeImportar ? html`
                        <button type="button" class="btn btn--sutil btn--sm" data-acao="desfazer">
                            ${raw(icone('reagendar'))} Desfazer última importação
                        </button>
                    ` : '')}

                    <div class="card__nota">
                        O arquivo exportado contém também as contas de usuário e os grupos
                        (senhas em forma de hash). Trate-o como material sensível.
                    </div>

                    <input type="file" accept="application/json,.json" class="oculto" data-input-arquivo>
                </article>
            ` : '')}

            ${raw(podeApagar ? html`
                <article class="card card--faixa card--atrasada">
                    <div class="card__nome">Zona de risco</div>
                    <p class="card__sub">
                        Preencher com dados de exemplo ou apagar tudo. As duas ações
                        substituem médicos e visitas — usuários, grupos e catálogos
                        permanecem. "Desfazer última importação" também desfaz estas.
                    </p>

                    <div class="card__acoes">
                        <button type="button" class="btn btn--outline btn--cresce" data-acao="dadosTeste">
                            ${raw(icone('agenda'))} Gerar dados de teste
                        </button>
                        <button type="button" class="btn btn--perigo btn--cresce" data-acao="apagarTudo">
                            ${raw(icone('excluir'))} Apagar todos os dados
                        </button>
                    </div>
                </article>
            ` : '')}

            <article class="card">
                <div class="card__nome">Sobre</div>
                <p class="card__sub">
                    Propagandismo LAMIC · Onda 1<br>
                    Agenda de visitas e carteira de médicos.
                </p>
                <div class="card__bloco texto-sm">
                    O mapa usa o Google Maps sem chave de API e o preenchimento de
                    endereço usa o ViaCEP. Se algum deles ficar indisponível, o app
                    continua funcionando com preenchimento manual.
                </div>
                <div class="card__nota">
                    O login organiza o acesso entre as pessoas da equipe. Os dados ficam
                    num banco compartilhado, sem senha própria de servidor — mantenha a
                    pasta do app e o endereço do banco só com quem deve usá-los.
                </div>
            </article>
        </div>
    `;
}

/* ------------------------------------------------------------------ *
 * Ações
 * ------------------------------------------------------------------ */

function atualizarResumo(container) {
    const atual = backup.resumoAtual();
    const alvo = container.querySelector('[data-resumo-dados]');
    if (alvo) {
        alvo.textContent = `${pluralizar(atual.medicos, 'médico', 'médicos')} · ${pluralizar(atual.visitas, 'visita', 'visitas')}`;
    }
}

/* ------------------------------------------------------------------ *
 * Vínculo com o Dados LAMIC
 * ------------------------------------------------------------------ */

async function abrirVinculo(alvo) {
    if (!alvo) return false;
    const ds = NS.core.dadosSessao;
    let contas;
    const fim = carregando.mostrar('Buscando contas do Dados LAMIC…');
    try { contas = await ds.contasDados(); }
    catch { toast.alerta('Não foi possível ler as contas do Dados LAMIC.'); return false; }
    finally { fim(); }

    const usados = new Map(usuario.listar().filter(u => u.dadosLogin && u.id !== alvo.id).map(u => [u.dadosLogin, u.nome]));
    const sug = alvo.dadosLogin ? contas.find(c => c.login === alvo.dadosLogin) : ds.sugerir(alvo, contas);

    return new Promise(resolve => {
        let mudou = false;
        modal.abrir({
            titulo: 'Vincular ao Dados LAMIC',
            subtitulo: `${alvo.nome} (${alvo.login || 'sem login'})`,
            corpo: html`
                <form class="form" id="form-vinculo" novalidate>
                    <p class="card__nota">Escolha a conta do Dados LAMIC desta pessoa. As visitas e médicos dela continuam iguais;
                    o nome e o login passam a ser os do Dados. Se a conta já estiver em outro cadastro daqui, aquele cadastro é desativado (nada é apagado).</p>
                    <input class="campo__input" type="search" placeholder="Buscar por nome ou login…" data-busca>
                    <select class="campo__input" name="conta" size="8" required>
                        ${raw(contas.map(c => html`<option value="${c.login}" ${raw(sug && sug.login === c.login ? 'selected' : '')}>${c.nome} (${c.login})${c.cargo ? ' · ' + c.cargo : ''}${usados.has(c.login) ? ' — já em: ' + usados.get(c.login) : ''}</option>`).join(''))}
                    </select>
                    <span class="campo__erro auth-form__erro" data-erro-geral></span>
                    <div class="form__acoes">
                        ${raw(alvo.dadosLogin ? '<button type="button" class="btn btn--outline" data-desvincular>Remover vínculo</button>' : '')}
                        <button type="button" class="btn btn--outline" data-modal-fechar>Cancelar</button>
                        <button type="submit" class="btn btn--primario">${raw(icone('check'))} Vincular</button>
                    </div>
                </form>
            `,
            aoMontar({ corpo, fechar }) {
                const form = corpo.querySelector('#form-vinculo');
                const sel = form.querySelector('[name="conta"]');
                const erro = form.querySelector('[data-erro-geral]');
                const normB = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                form.querySelector('[data-busca]').addEventListener('input', e => {
                    const q = normB(e.target.value);
                    [...sel.options].forEach(o => { o.hidden = !!q && !normB(o.textContent).includes(q); });
                });
                form.querySelector('[data-desvincular]')?.addEventListener('click', async () => {
                    const r = ds.desvincular(alvo.id);
                    if (!r.ok) { erro.textContent = r.motivo; return; }
                    await NS.core.db.pendente().catch(() => {});
                    toast.sucesso('Vínculo removido. O cadastro ficou desativado.');
                    mudou = true; fechar();
                });
                form.addEventListener('submit', async e => {
                    e.preventDefault();
                    const conta = contas.find(c => c.login === sel.value);
                    if (!conta) { erro.textContent = 'Escolha uma conta.'; return; }
                    const r = ds.vincular(alvo.id, conta);
                    if (!r.ok) { erro.textContent = r.motivo; return; }
                    await NS.core.db.pendente().catch(() => {});
                    toast.sucesso(`${alvo.nome} vinculado a ${conta.nome}.`);
                    mudou = true; fechar();
                });
            },
            aoFechar() { resolve(mudou); }
        });
    });
}

function abrirTrocarSenha() {
    const atual = usuario.atual();
    if (!atual) return;

    modal.abrir({
        titulo: 'Trocar senha',
        subtitulo: atual.login,
        corpo: html`
            <form class="form" id="form-senha" novalidate>
                ${raw(campoSenha({ nome: 'senhaAtual', label: 'Senha atual', autocomplete: 'current-password' }))}
                ${raw(campoSenha({
                    nome: 'senhaNova',
                    label: 'Nova senha',
                    ajuda: `Mínimo de ${usuario.SENHA_MINIMA} caracteres.`,
                    autocomplete: 'new-password'
                }))}
                ${raw(campoSenha({ nome: 'confirmarSenha', label: 'Confirmar nova senha', autocomplete: 'new-password' }))}

                <span class="campo__erro auth-form__erro" data-erro-geral></span>

                <div class="form__acoes">
                    <button type="button" class="btn btn--outline" data-modal-fechar>Cancelar</button>
                    <button type="submit" class="btn btn--primario">${raw(icone('check'))} Trocar senha</button>
                </div>
            </form>
        `,
        aoMontar({ corpo, fechar }) {
            const form = corpo.querySelector('#form-senha');
            const erro = form.querySelector('[data-erro-geral]');
            ligarRevelarSenha(form);

            form.addEventListener('submit', async e => {
                e.preventDefault();
                erro.textContent = '';

                const dados = lerFormulario(form);

                if (dados.senhaNova !== dados.confirmarSenha) {
                    erro.textContent = 'As senhas não conferem.';
                    return;
                }

                const fimCarregando = carregando.mostrar('Trocando senha…');
                let resultado;
                try {
                    resultado = await usuario.trocarSenha(atual.id, dados.senhaAtual, dados.senhaNova);
                    await NS.core.db.pendente();
                } catch (falha) {
                    erro.textContent = falha?.name === 'ErroSemConexao'
                        ? 'Sem conexão com o servidor. A senha não foi alterada.'
                        : 'Não foi possível alterar a senha. Tente novamente.';
                    return;
                } finally {
                    fimCarregando();
                }

                if (!resultado.ok) {
                    erro.textContent = resultado.motivo;
                    return;
                }

                toast.sucesso('Senha alterada.');
                fechar();
            });
        }
    });
}

async function processarArquivo(arquivo, container) {
    let texto;
    try {
        texto = await arquivo.text();
    } catch {
        toast.erro('Não foi possível ler o arquivo.');
        return;
    }

    const resultado = backup.validarBackup(texto);

    if (!resultado.ok) {
        await modal.confirmar({
            titulo: 'Backup não aceito',
            mensagem: resultado.erros[0],
            detalhe: resultado.erros.slice(1).map(e => `<div>• ${e}</div>`).join(''),
            confirmarTexto: 'Entendi',
            cancelarTexto: 'Fechar',
            perigo: true
        });
        return;
    }

    const atual = backup.resumoAtual();
    const { resumo, avisos } = resultado;

    const detalhe = [
        avisos.length ? `<div><strong>${pluralizar(avisos.length, 'aviso', 'avisos')}:</strong></div>` : '',
        ...avisos.slice(0, 10).map(a => `<div>• ${a}</div>`),
        avisos.length > 10 ? `<div>• … e mais ${avisos.length - 10}.</div>` : ''
    ].filter(Boolean).join('');

    const confirmado = await modal.confirmar({
        titulo: 'Importar backup',
        mensagem: `O backup contém ${pluralizar(resumo.medicos, 'médico', 'médicos')} e ${pluralizar(resumo.visitas, 'visita', 'visitas')}. Isso substituirá seus dados atuais (${pluralizar(atual.medicos, 'médico', 'médicos')}, ${pluralizar(atual.visitas, 'visita', 'visitas')}).`,
        detalhe,
        confirmarTexto: 'Substituir dados',
        perigo: true
    });

    if (!confirmado) return;

    const gravacao = await carregando.acaoRemota(
        () => backup.importar(resultado.dados),
        { mensagem: 'Importando backup…' }
    );
    if (!gravacao.ok) return;

    atualizarResumo(container);
    toast.sucesso('Backup importado. Use "Desfazer" se algo saiu errado.');
}

/* ------------------------------------------------------------------ *
 * View
 * ------------------------------------------------------------------ */

const viewConfig = {
    render(container) {
        const abas = [
            ...(podeGerenciarUsuarios() ? [{ id: 'usuarios', rotulo: 'Usuários', icone: 'usuarios' }] : []),
            { id: 'backup', rotulo: 'Backup', icone: 'download' }
        ];

        if (!abas.some(a => a.id === abaAtiva)) abaAtiva = abas[0].id;

        container.innerHTML = html`
            <div class="view-header">
                <div class="view-header__titulo">
                    <h1>Configurações</h1>
                    <p>Usuários, permissões e backup dos seus dados</p>
                </div>
            </div>

            ${raw(abas.length > 1 ? html`
                <div class="abas">
                    ${raw(abas.map(aba => html`
                        <button type="button" class="aba${raw(aba.id === abaAtiva ? ' aba--ativa' : '')}"
                                data-acao="aba" data-id="${aba.id}">
                            ${raw(icone(aba.icone))} ${aba.rotulo}
                        </button>
                    `).join(''))}
                </div>
            ` : '')}

            <div data-conteudo-aba>
                ${raw(abaAtiva === 'usuarios' ? markupAbaUsuarios() : markupAbaBackup())}
            </div>
        `;

        if (abaAtiva === 'usuarios') this.montarUsuarios(container);
        else this.montarBackup(container);

        desinscrever.push(
            on(EVENTOS.DADOS_ALTERADOS, () => atualizarResumo(container)),
            delegarAcoes(container, this.acoes(container))
        );
    },

    /** Handlers comuns às duas abas. */
    acoes(container) {
        const recarregar = () => {
            this.destroy();
            this.render(container);
        };

        return {
            aba: ({ id }) => {
                abaAtiva = id;
                recarregar();
            },
            subAba: ({ id }) => {
                subAbaAtiva = id;
                recarregar();
            },

            /* --- Usuários --- */
            vincularUsuario: async ({ id }) => {
                if (!podeGerenciarUsuarios()) return;
                if (await abrirVinculo(usuario.obter(id))) recarregar();
            },
            editarUsuario: async ({ id }) => {
                if (!podeGerenciarUsuarios()) return;
                const alterou = await usuarioForm.abrirFormularioUsuario(usuario.obter(id));
                if (alterou) recarregar();
            },
            alternarAtivo: async ({ id }) => {
                if (!podeGerenciarUsuarios()) return;

                const alvo = usuario.obter(id);
                const gravacao = await carregando.acaoRemota(
                    () => usuario.definirAtivo(id, alvo.ativo === false),
                    { mensagem: 'Atualizando usuário…' }
                );
                if (!gravacao.ok) return;

                if (!gravacao.valor.ok) {
                    toast.alerta(gravacao.valor.motivo);
                    return;
                }

                toast.sucesso(alvo.ativo === false ? 'Usuário reativado.' : 'Usuário desativado.');
                recarregar();
            },
            excluirUsuario: async ({ id }) => {
                if (!podeGerenciarUsuarios()) return;

                const alvo = usuario.obter(id);
                const confirmado = await modal.confirmar({
                    titulo: 'Excluir usuário',
                    mensagem: `Excluir a conta de ${alvo.nome} (${alvo.login})?`,
                    detalhe: 'Os médicos e as visitas continuam na base — só o acesso é removido.',
                    confirmarTexto: 'Excluir',
                    perigo: true
                });
                if (!confirmado) return;

                const gravacao = await carregando.acaoRemota(
                    () => usuario.remover(id),
                    { mensagem: 'Excluindo usuário…' }
                );
                if (!gravacao.ok) return;

                if (!gravacao.valor.ok) {
                    toast.alerta(gravacao.valor.motivo);
                    return;
                }

                toast.sucesso('Usuário excluído.');
                recarregar();
            },

            /* --- Conta --- */
            trocarSenha: () => abrirTrocarSenha(),

            /* --- Backup --- */
            exportar: () => {
                if (!permissoes.pode('backup.exportar')) return;
                const resumo = backup.exportar();
                toast.sucesso(`Backup gerado: ${pluralizar(resumo.medicos, 'médico', 'médicos')}, ${pluralizar(resumo.visitas, 'visita', 'visitas')}.`);
            },
            importar: () => {
                if (!permissoes.pode('backup.importar')) return;
                container.querySelector('[data-input-arquivo]')?.click();
            },
            desfazer: async () => {
                if (!permissoes.pode('backup.importar')) return;

                const confirmado = await modal.confirmar({
                    titulo: 'Desfazer importação',
                    mensagem: 'Restaurar os dados que existiam antes da última importação?',
                    confirmarTexto: 'Restaurar'
                });
                if (!confirmado) return;

                const gravacao = await carregando.acaoRemota(
                    () => backup.desfazerImportacao(),
                    { mensagem: 'Restaurando dados…' }
                );
                if (!gravacao.ok) return;

                if (gravacao.valor) {
                    atualizarResumo(container);
                    toast.sucesso('Dados restaurados.');
                } else {
                    toast.alerta('Não há importação recente para desfazer.');
                }
            },
            dadosTeste: async () => {
                if (!permissoes.pode('backup.apagar')) return;

                const atual = backup.resumoAtual();
                const confirmado = await modal.confirmar({
                    titulo: 'Gerar dados de teste',
                    mensagem: 'Isso substitui sua base atual por um conjunto de médicos e visitas de exemplo, só para visualizar o app populado.',
                    detalhe: atual.medicos || atual.visitas
                        ? `Seus dados atuais (${pluralizar(atual.medicos, 'médico', 'médicos')}, ${pluralizar(atual.visitas, 'visita', 'visitas')}) serão substituídos — dá para restaurar em "Desfazer última importação". Usuários e grupos não são afetados.`
                        : 'Usuários e grupos não são afetados.',
                    confirmarTexto: 'Gerar dados de teste',
                    perigo: true
                });
                if (!confirmado) return;

                const gravacao = await carregando.acaoRemota(
                    () => backup.importar(dadosTeste.gerar()),
                    { mensagem: 'Gerando dados de teste…' }
                );
                if (!gravacao.ok) return;

                atualizarResumo(container);
                toast.sucesso('Dados de teste gerados. Use "Desfazer" para voltar ao que você tinha.');
            },
            apagarTudo: async () => {
                if (!permissoes.pode('backup.apagar')) return;

                const atual = backup.resumoAtual();
                if (!atual.medicos && !atual.visitas) {
                    toast.alerta('Já não há dados para apagar.');
                    return;
                }

                const confirmado = await modal.confirmar({
                    titulo: 'Apagar todos os dados',
                    mensagem: `Apagar ${pluralizar(atual.medicos, 'médico', 'médicos')} e ${pluralizar(atual.visitas, 'visita', 'visitas')}? Esvazia a agenda e a carteira por completo.`,
                    detalhe: 'Usuários, grupos e catálogos permanecem. Dá para restaurar em "Desfazer última importação" logo em seguida — mas se você sair da tela ou importar outra coisa antes, perde essa chance.',
                    confirmarTexto: 'Apagar tudo',
                    perigo: true
                });
                if (!confirmado) return;

                const gravacao = await carregando.acaoRemota(
                    () => backup.limparTudo(),
                    { mensagem: 'Apagando dados…' }
                );
                if (!gravacao.ok) return;

                atualizarResumo(container);
                toast.sucesso('Todos os dados foram apagados.');
            }
        };
    },

    montarUsuarios(container) {
        const recarregar = () => {
            this.destroy();
            this.render(container);
        };

        const slotNovo = container.querySelector('[data-slot-novo-usuario]');
        if (slotNovo) {
            usuarioForm.renderFormulario(slotNovo, {
                aoSalvar: () => {
                    subAbaAtiva = 'lista';
                    recarregar();
                }
            });
        }

        const slotGrupos = container.querySelector('[data-slot-grupos]');
        if (slotGrupos) grupoForm.renderPainelGrupos(slotGrupos);
    },

    montarBackup(container) {
        atualizarResumo(container);

        const inputArquivo = container.querySelector('[data-input-arquivo]');
        if (inputArquivo) {
            inputArquivo.addEventListener('change', async () => {
                const arquivo = inputArquivo.files?.[0];
                inputArquivo.value = '';
                if (arquivo) await processarArquivo(arquivo, container);
            });
        }

        container.querySelector('#form-config').addEventListener('submit', async e => {
            e.preventDefault();

            const valor = e.target.querySelector('[name="nomeUsuario"]').value.trim();
            const atual = usuario.atual();

            if (!valor) {
                toast.alerta('Informe um nome.');
                return;
            }

            // O nome vive na conta; a config guarda um espelho só para o
            // header e para bases antigas, sem usuário.
            let resultado = { ok: true };
            const gravacao = await carregando.acaoRemota(async () => {
                if (atual) resultado = await usuario.atualizar(atual.id, { nome: valor });
                if (resultado.ok) config.definirNomeUsuario(valor);
            }, { mensagem: 'Salvando…' });
            if (!gravacao.ok) return;

            if (!resultado.ok) {
                toast.erro(resultado.motivo);
                return;
            }

            toast.sucesso('Nome salvo.');
        });
    },

    destroy() {
        desinscrever.forEach(fn => fn?.());
        desinscrever = [];
    }
};

NS.ui = NS.ui || {};
NS.ui.views = NS.ui.views || {};
NS.ui.views.config = { viewConfig };
})();
