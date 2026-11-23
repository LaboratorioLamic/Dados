// ===== js/ui/views/agenda.js =====
(function () {
'use strict';

/**
 * Tela Agenda: visitas agrupadas por proximidade da data, com três
 * visualizações — Cards (padrão), Semana e Mês — sobre os mesmos dados.
 *
 * Os mapas aqui são placeholders clicáveis, nunca auto-lazy: com 7 visitas
 * no dia, carregar todos os iframes de uma vez é o caminho mais curto para
 * ser bloqueado pelo Google.
 */

var html = NS.core.dom.html;
var raw = NS.core.dom.raw;
var delegarAcoes = NS.core.dom.delegarAcoes;
var pluralizar = NS.core.dom.pluralizar;
var hojeISO = NS.core.dom.hojeISO;
var formatarData = NS.core.dom.formatarData;
var on = NS.core.events.on;
var EVENTOS = NS.core.events.EVENTOS;
var icone = NS.ui.icons.icone;
var cardVisita = NS.ui.components.card.cardVisita;
var estadoVazio = NS.ui.components.card.estadoVazio;
var criarMapa = NS.ui.components.mapa.criarMapa;
var limparMapas = NS.ui.components.mapa.limparMapas;
var renderSemana = NS.ui.components.calendario.renderSemana;
var renderMes = NS.ui.components.calendario.renderMes;
var ligarDragDrop = NS.ui.components.calendario.ligarDragDrop;
var periodoSemana = NS.ui.components.calendario.periodoSemana;
var periodoMes = NS.ui.components.calendario.periodoMes;
var avancar = NS.ui.components.calendario.avancar;
var rotuloPeriodo = NS.ui.components.calendario.rotuloPeriodo;
var visitas = NS.domain.visita;
var medicos = NS.domain.medico;
var especialidades = NS.domain.especialidade;
var marcadores = NS.domain.marcador;
var formatarEndereco = NS.domain.enderecoUtils.formatarEndereco;
var abrirFormularioVisita = NS.ui.forms.visitaForm.abrirFormularioVisita;
var abrirDetalheMedico = NS.ui.views.medicoDetalhe.abrirDetalheMedico;
var modal = NS.ui.modal;
var toast = NS.ui.toast;
var abrirRegistrarVisita = NS.ui.forms.visitaAcoes.abrirRegistrarVisita;
var abrirMarcarAusente = NS.ui.forms.visitaAcoes.abrirMarcarAusente;
var abrirReagendar = NS.ui.forms.visitaAcoes.abrirReagendar;
var confirmarCancelamento = NS.ui.forms.visitaAcoes.confirmarCancelamento;
var confirmarExclusao = NS.ui.forms.visitaAcoes.confirmarExclusao;
var abrirVisualizarVisita = NS.ui.forms.visitaAcoes.abrirVisualizarVisita;
var pode = NS.domain.permissoes.pode;
var abrirGerenciarMarcadores = NS.ui.forms.marcadorForm.abrirGerenciarMarcadores;
let desinscrever = [];
let desligarDrag = null;
let filtroSecao = '';
// Ids de marcadores selecionados no filtro. Vazio = sem filtro (mostra tudo).
let filtroMarcadores = [];
let modoVisao = 'cards'; // 'cards' | 'semana' | 'mes' | 'rotina'
let dataRef = hojeISO();
// Concluídas podem ser centenas: a seção pagina em blocos, então só 10 cards
// (e 10 slots de mapa) existem no DOM por vez.
const POR_PAGINA_CONCLUIDAS = 10;
let paginaConcluidas = 1;

// Chaves de SECOES recolhidas pelo usuário — persiste entre re-renders da view.
// `concluidas` já nasce recolhida: é histórico, não trabalho pendente.
const secoesOcultas = new Set(['concluidas']);

const SECOES = [
    { chave: 'atrasadas', titulo: 'Atrasadas', modificador: 'secao--atrasadas', icone: 'alerta', corIcone: 'perigo' },
    { chave: 'hoje', titulo: 'Hoje', modificador: '', icone: 'relogio', corIcone: 'info' },
    { chave: 'amanha', titulo: 'Amanhã', modificador: '', icone: 'agenda', corIcone: 'roxa' },
    { chave: 'proximas', titulo: 'Próximas', modificador: '', icone: 'setaDireita', corIcone: 'neutra' },
    { chave: 'concluidas', titulo: 'Concluídos', modificador: 'secao--concluidas', icone: 'checkCirculo', corIcone: 'sucesso' }
];

const VISOES = [
    { chave: 'cards', rotulo: 'Cards', icone: 'listaCards' },
    { chave: 'semana', rotulo: 'Semana', icone: 'colunas' },
    { chave: 'mes', rotulo: 'Mês', icone: 'grade' },
    { chave: 'rotina', rotulo: 'Rotina', icone: 'repetir' }
];

/* ------------------------------------------------------------------ *
 * Visão em cards (comportamento original)
 * ------------------------------------------------------------------ */

function renderSecao({ chave, titulo, modificador }, lista, { mostrarData = true, contador = null, rodape = '' } = {}) {
    if (!lista.length) return '';

    const cards = lista.map(visita => {
        const medico = medicos.obter(visita.medicoId);
        return cardVisita(visita, medico, { mostrarData });
    }).join('');

    const oculta = secoesOcultas.has(chave);

    return html`
        <section class="secao ${raw(modificador)}">
            <button type="button" class="secao__titulo" data-acao="alternarSecao" data-id="${chave}" aria-expanded="${!oculta}">
                ${raw(icone('setaBaixo', { classe: 'secao__seta' }))}
                ${titulo}
                <span class="secao__contador">${contador ?? lista.length}</span>
            </button>
            <div class="grid-cards" ${raw(oculta ? 'hidden' : '')}>${raw(cards)}</div>
            ${raw(rodape ? html`<div class="secao__rodape" ${raw(oculta ? 'hidden' : '')}>${raw(rodape)}</div>` : '')}
        </section>
    `;
}

/** Controles de página das concluídas. Some quando cabe tudo numa página só. */
function paginacaoConcluidas(pagina, totalPaginas, total) {
    if (totalPaginas <= 1) return '';

    return html`
        <button type="button" class="btn btn--outline btn--icone btn--sm" data-acao="paginaConcluidas" data-id="${pagina - 1}"
            aria-label="Página anterior"${raw(pagina <= 1 ? ' disabled' : '')}>
            ${raw(icone('setaEsquerda'))}
        </button>
        <span class="secao__paginacao-info">Página ${pagina} de ${totalPaginas} · ${pluralizar(total, 'visita concluída', 'visitas concluídas')}</span>
        <button type="button" class="btn btn--outline btn--icone btn--sm" data-acao="paginaConcluidas" data-id="${pagina + 1}"
            aria-label="Próxima página"${raw(pagina >= totalPaginas ? ' disabled' : '')}>
            ${raw(icone('setaDireita'))}
        </button>
    `;
}

/** Injeta os placeholders de mapa nos slots dos cards já renderizados. */
function montarMapas(container) {
    container.querySelectorAll('.mapa-slot').forEach(slot => {
        const medico = medicos.obter(slot.dataset.enderecoDe);
        if (!medico) return;

        const endereco = formatarEndereco(medico.endereco);
        if (!endereco) return;

        slot.appendChild(criarMapa(medico.endereco, { auto: false, rotulo: 'Ver no mapa' }));
    });
}

/**
 * Lista já filtrada pelos marcadores escolhidos. Todo caminho de render
 * passa por aqui — Cards, Semana e Mês filtram pelo mesmo critério, senão
 * trocar de visão faria visitas "sumirem e voltarem" sem explicação.
 */
function visitasVisiveis() {
    return visitas.filtrarVisitas(visitas.listar(), { marcadores: filtroMarcadores });
}

function renderVisaoCards(conteudo) {
    const grupos = visitas.agruparParaAgenda(visitasVisiveis());
    const secoesFiltradas = filtroSecao ? SECOES.filter(s => s.chave === filtroSecao) : SECOES;

    const temAlgo = secoesFiltradas.some(secao => grupos[secao.chave].length);

    if (!temAlgo) {
        const semMedicos = !medicos.listar().length;

        conteudo.innerHTML = semMedicos
            ? estadoVazio({
                icone: 'medicos',
                titulo: 'Comece cadastrando um médico',
                texto: 'A agenda é montada a partir da sua carteira de médicos.',
                acao: html`
                    <a class="btn btn--primario" href="#/medicos">
                        ${raw(icone('usuarioAdicionar'))} Ir para Médicos
                    </a>
                `
            })
            : estadoVazio({
                icone: 'agenda',
                titulo: filtroSecao || filtroMarcadores.length ? 'Nada com esse filtro' : 'Agenda vazia',
                texto: filtroSecao || filtroMarcadores.length
                    ? 'Nenhuma visita com esses filtros. Ajuste o grupo ou os marcadores para ver as demais.'
                    : 'Agende a primeira visita para começar a acompanhar sua rotina.',
                acao: filtroSecao || filtroMarcadores.length || !pode('agenda.criar') ? '' : html`
                    <button type="button" class="btn btn--primario" data-acao="nova">
                        ${raw(icone('agendaAdicionar'))} Agendar visita
                    </button>
                `
            });
        return;
    }

    conteudo.innerHTML = secoesFiltradas
        .map(secao => {
            const lista = grupos[secao.chave];
            const opcoes = { mostrarData: secao.chave !== 'hoje' && secao.chave !== 'amanha' };

            if (secao.chave !== 'concluidas') return renderSecao(secao, lista, opcoes);

            const totalPaginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA_CONCLUIDAS));
            // A lista encolhe quando uma visita é excluída: sem isso a view
            // ficaria travada numa página que não existe mais.
            paginaConcluidas = Math.min(Math.max(paginaConcluidas, 1), totalPaginas);
            const inicio = (paginaConcluidas - 1) * POR_PAGINA_CONCLUIDAS;

            return renderSecao(secao, lista.slice(inicio, inicio + POR_PAGINA_CONCLUIDAS), {
                ...opcoes,
                contador: lista.length,
                rodape: paginacaoConcluidas(paginaConcluidas, totalPaginas, lista.length)
            });
        })
        .join('');

    montarMapas(conteudo);
}

/* ------------------------------------------------------------------ *
 * Visões de calendário (Semana / Mês)
 * ------------------------------------------------------------------ */

/**
 * Agrupa por data ISO. O calendário mostra as agendadas e as concluídas
 * (estas em verde, via `TAG_STATUS.realizada`); ausentes e canceladas
 * ficam só no histórico do médico.
 */
const NO_CALENDARIO = new Set([visitas.STATUS.AGENDADA, visitas.STATUS.REALIZADA]);

function agruparPorDia(lista) {
    const mapa = {};
    for (const visita of lista) {
        if (!NO_CALENDARIO.has(visita.status)) continue;
        (mapa[visita.data] ||= []).push(visita);
    }
    for (const dia of Object.values(mapa)) {
        dia.sort((a, b) => (a.horario || '99:99').localeCompare(b.horario || '99:99'));
    }
    return mapa;
}

function mapaMedicos() {
    const mapa = {};
    for (const medico of medicos.listar()) mapa[medico.id] = medico;
    return mapa;
}

function renderVisaoCalendario(conteudo) {
    const porDia = agruparPorDia(visitasVisiveis());
    const porMedico = mapaMedicos();
    const hojeIso = hojeISO();

    const grade = modoVisao === 'semana'
        ? renderSemana(dataRef, porDia, porMedico, { hojeIso })
        : renderMes(dataRef, porDia, porMedico, { hojeIso });

    conteudo.innerHTML = html`
        <div class="calendario-nav">
            <button type="button" class="btn btn--outline btn--sm calendario-nav__hoje" data-acao="periodoHoje" aria-label="Ir para hoje" title="Hoje">
                ${raw(icone('agenda'))} <span class="calendario-nav__hoje-texto">Hoje</span>
            </button>
            <div class="calendario-nav__periodo">
                <button type="button" class="btn btn--outline btn--icone btn--sm" data-acao="periodoAnterior" aria-label="Período anterior">
                    ${raw(icone('setaEsquerda'))}
                </button>
                <span class="calendario-nav__rotulo">${rotuloPeriodo(dataRef, modoVisao)}</span>
                <button type="button" class="btn btn--outline btn--icone btn--sm" data-acao="periodoSeguinte" aria-label="Próximo período">
                    ${raw(icone('setaDireita'))}
                </button>
            </div>
        </div>
        ${raw(grade)}
    `;

    desligarDrag?.();
    const alvoDrag = conteudo.querySelector(modoVisao === 'semana' ? '.semana' : '.mes');
    if (alvoDrag) {
        desligarDrag = ligarDragDrop(alvoDrag, moverVisita);
    }
}

function moverVisita(visitaId, novaData, novoHorario) {
    const visita = visitas.obter(visitaId);
    if (!visita) return;

    // Arrastar no calendário é reagendar: mesma permissão do botão.
    if (!pode('agenda.reagendar')) {
        toast.alerta('Seu grupo não permite reagendar visitas.');
        return;
    }

    if (visita.status !== visitas.STATUS.AGENDADA) {
        toast.alerta('Só visitas agendadas podem ser movidas no calendário.');
        return;
    }

    const semMudanca = visita.data === novaData && (novoHorario === null || novoHorario === visita.horario);
    if (semMudanca) return;

    const patch = { data: novaData };
    // Soltar na área "sem horário" da semana limpa o horário; nas células
    // com hora e no mês (sem granularidade de hora) o horário existente é preservado.
    if (novoHorario !== null) patch.horario = novoHorario;

    visitas.atualizar(visitaId, patch);
    toast.sucesso(`Movida para ${formatarData(novaData)}${patch.horario ? ' às ' + patch.horario : ''}.`);
}

/** Janela de visualização ao clicar num evento do calendário (Semana/Mês). */
function abrirAcoesVisita(visitaId) {
    abrirVisualizarVisita(visitaId, { aoAlterar: () => renderLista(document.getElementById('app')) });
}

/** Modal do dia (clique no número do dia ou no "+N visitas" do mês): lista o dia inteiro usando os cards normais. */
function abrirDiaCompleto(iso) {
    const doDia = agruparPorDia(visitasVisiveis())[iso] || [];

    modal.abrir({
        titulo: formatarData(iso),
        subtitulo: doDia.length ? pluralizar(doDia.length, 'visita', 'visitas') : 'Nenhuma visita agendada',
        largo: true,
        corpo: doDia.length ? html`
            <div class="grid-cards">
                ${raw(doDia.map(v => cardVisita(v, medicos.obter(v.medicoId), { mostrarData: false })).join(''))}
            </div>
        ` : estadoVazio({
            icone: 'agenda',
            titulo: 'Nada agendado neste dia',
            texto: 'Agende uma visita para este dia.',
            acao: pode('agenda.criar') ? html`
                <button type="button" class="btn btn--primario" data-acao="novaNoDia">
                    ${raw(icone('agendaAdicionar'))} Agendar visita
                </button>
            ` : ''
        }),
        aoMontar({ corpo, fechar }) {
            montarMapas(corpo);
            delegarAcoes(corpo, {
                realizar: async ({ id }) => { if (!pode('agenda.concluir')) return; fechar(); await abrirRegistrarVisita(id); },
                editar: async ({ id }) => { if (!pode('agenda.criar')) return; fechar(); const v = visitas.obter(id); if (v) await abrirFormularioVisita({ visita: v }); },
                ausente: async ({ id }) => { if (!pode('agenda.concluir')) return; fechar(); await abrirMarcarAusente(id); },
                reagendar: async ({ id }) => { if (!pode('agenda.reagendar')) return; fechar(); await abrirReagendar(id); },
                cancelar: async ({ id }) => { if (!pode('agenda.cancelar')) return; fechar(); await confirmarCancelamento(id); },
                excluir: async ({ id }) => { if (!pode('agenda.cancelar')) return; fechar(); await confirmarExclusao(id); },
                detalheMedico: ({ id }) => { fechar(); if (id) abrirDetalheMedico(id, {}); },
                novaNoDia: async () => { if (!pode('agenda.criar')) return; fechar(); await abrirFormularioVisita({ rascunho: { data: iso } }); }
            });
        }
    });
}

/* ------------------------------------------------------------------ *
 * Visão Rotina (DOM–SÁB, médicos pela rotina do cadastro)
 * ------------------------------------------------------------------ */

/** Próxima ocorrência do dia da semana `dia` (0 = domingo), contando hoje. */
function proximaDataDoDia(dia) {
    const [ano, mes, diaMes] = hojeISO().split('-').map(Number);
    const hoje = new Date(ano, mes - 1, diaMes);
    const data = new Date(ano, mes - 1, diaMes + (dia - hoje.getDay() + 7) % 7);
    return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

function cardRotina(medico, iso, agendado) {
    const info = [especialidades.obter(medico.especialidadeId)?.nome, medico.endereco?.bairro].filter(Boolean).join(' · ');

    return html`
        <button type="button" class="rotina__card${raw(agendado ? ' rotina__card--agendado' : '')}"
                data-acao="agendarRotina" data-id="${medico.id}" data-data="${iso}"
                title="${agendado ? 'Já há visita agendada neste dia' : 'Agendar visita em ' + formatarData(iso)}">
            <span class="rotina__nome">${medico.nome}</span>
            ${raw(info ? html`<span class="rotina__info">${info}</span>` : '')}
            ${raw(agendado ? html`<span class="rotina__status">${raw(icone('check'))} Agendada</span>` : '')}
        </button>
    `;
}

/**
 * Colunas DOM–SÁB com os médicos de rotina em cada dia. A data de cada
 * coluna é a próxima ocorrência daquele dia; o card marca quem já tem
 * visita agendada nela, para não agendar em dobro.
 */
function renderVisaoRotina(conteudo) {
    const todos = medicos.listar();

    if (!todos.some(m => medicos.normalizarRotina(m.rotina).length)) {
        conteudo.innerHTML = estadoVazio({
            icone: 'repetir',
            titulo: 'Nenhuma rotina cadastrada',
            texto: 'Marque os dias de rotina no cadastro de cada médico para montar a semana.',
            acao: html`
                <a class="btn btn--primario" href="#/medicos">
                    ${raw(icone('medicos'))} Ir para Médicos
                </a>
            `
        });
        return;
    }

    const agendadas = new Set(
        visitas.listar()
            .filter(v => v.status === visitas.STATUS.AGENDADA)
            .map(v => `${v.medicoId}|${v.data}`)
    );
    const hojeIso = hojeISO();

    const colunas = medicos.DIAS_ROTINA.map(({ dia, curto }) => {
        const iso = proximaDataDoDia(dia);
        const doDia = medicos.listarPorDiaRotina(dia);
        const [, mes, diaMes] = iso.split('-');

        return html`
            <section class="rotina__dia${raw(iso === hojeIso ? ' rotina__dia--hoje' : '')}">
                <header class="rotina__cab">
                    <span class="rotina__cab-nome">${curto}</span>
                    <span class="rotina__cab-data">${diaMes}/${mes}</span>
                    <span class="rotina__cab-contador">${doDia.length}</span>
                </header>
                <div class="rotina__lista">
                    ${raw(doDia.length
                        ? doDia.map(m => cardRotina(m, iso, agendadas.has(`${m.id}|${iso}`))).join('')
                        : html`<span class="rotina__vazio">—</span>`)}
                </div>
            </section>
        `;
    }).join('');

    conteudo.innerHTML = html`<div class="rotina">${raw(colunas)}</div>`;
}

/* ------------------------------------------------------------------ *
 * Orquestração
 * ------------------------------------------------------------------ */

function renderLista(container) {
    const conteudo = container.querySelector('[data-conteudo]');
    limparMapas(conteudo);
    desligarDrag?.();
    desligarDrag = null;

    if (modoVisao === 'cards') {
        renderVisaoCards(conteudo);
    } else if (modoVisao === 'rotina') {
        renderVisaoRotina(conteudo);
    } else {
        renderVisaoCalendario(conteudo);
    }

    const gruposResumo = visitas.agruparParaAgenda(visitasVisiveis());
    const abertas = gruposResumo.atrasadas.length + gruposResumo.hoje.length;
    const resumo = container.querySelector('[data-resumo]');
    resumo.textContent = abertas
        ? `${pluralizar(abertas, 'visita', 'visitas')} para hoje`
        : 'Nenhuma visita pendente para hoje';
}

function atualizarBotoesVisao(container) {
    container.querySelectorAll('[data-visao]').forEach(botao => {
        botao.classList.toggle('segmentado__opcao--ativa', botao.dataset.visao === modoVisao);
    });
    container.querySelector('[data-conteudo]').classList.toggle('view-calendario', modoVisao === 'semana' || modoVisao === 'mes');

    // O filtro por grupo só faz sentido na visão Cards — Semana/Mês mostram tudo.
    const filtroWrap = container.querySelector('[data-filtro-wrap]');
    if (filtroWrap) filtroWrap.hidden = modoVisao !== 'cards';

    // Marcadores pertencem às visitas; a Rotina lista médicos, então o filtro não se aplica.
    const marcadoresWrap = container.querySelector('[data-marcadores-filtro-wrap]');
    if (marcadoresWrap) marcadoresWrap.hidden = modoVisao === 'rotina';
}

/**
 * Popover do filtro "Filtrar por grupo" (substitui o antigo <select>).
 * Devolve uma função de limpeza — o listener de clique-fora em `document`
 * precisa ser removido quando a view troca, senão acumula a cada render.
 */
function ligarFiltroSecao(container, opcoesSecao, aoMudar) {
    const gatilho = container.querySelector('[data-filtro-gatilho]');
    const popover = container.querySelector('[data-filtro-popover]');
    const wrap = container.querySelector('.popover-filtro-wrap');

    function fecharPopover() {
        popover.hidden = true;
        gatilho.setAttribute('aria-expanded', 'false');
    }

    function abrirPopover() {
        popover.hidden = false;
        gatilho.setAttribute('aria-expanded', 'true');
    }

    /** Atualiza gatilho + marcação do item ativo sem re-renderizar a barra inteira. */
    function refletirSelecao() {
        const secaoAtiva = opcoesSecao.find(s => s.chave === filtroSecao) || opcoesSecao[0];

        gatilho.querySelector('.seletor-filtro__ponto').className = `seletor-filtro__ponto seletor-filtro__ponto--${secaoAtiva.corIcone}`;
        gatilho.querySelector('.seletor-filtro__texto').textContent = secaoAtiva.titulo;

        popover.querySelectorAll('[data-filtro-valor]').forEach(item => {
            const ativo = item.dataset.filtroValor === filtroSecao;
            item.classList.toggle('popover-filtro__item--ativo', ativo);
            item.setAttribute('aria-selected', String(ativo));
            item.querySelector('.popover-filtro__check')?.remove();
            if (ativo) item.insertAdjacentHTML('beforeend', icone('check', { classe: 'popover-filtro__check' }));
        });
    }

    gatilho.addEventListener('click', e => {
        e.stopPropagation();
        if (popover.hidden) abrirPopover(); else fecharPopover();
    });

    popover.addEventListener('click', e => {
        e.stopPropagation();
        const item = e.target.closest('[data-filtro-valor]');
        if (!item) return;

        filtroSecao = item.dataset.filtroValor;
        fecharPopover();
        refletirSelecao();
        aoMudar();
    });

    function aoClicarFora(e) {
        if (!popover.hidden && !wrap.contains(e.target)) fecharPopover();
    }
    document.addEventListener('click', aoClicarFora);

    function aoTeclar(e) {
        if (e.key === 'Escape' && !popover.hidden) fecharPopover();
    }
    document.addEventListener('keydown', aoTeclar);

    return function destruir() {
        document.removeEventListener('click', aoClicarFora);
        document.removeEventListener('keydown', aoTeclar);
    };
}

/**
 * Popover "Marcadores" da barra de filtros: multisseleção, aplicada em
 * OU (uma visita aparece se tiver qualquer um dos marcados).
 *
 * Devolve a função de limpeza do listener de clique-fora em `document`.
 */
function ligarFiltroMarcadores(container, aoMudar) {
    const wrap = container.querySelector('[data-marcadores-filtro-wrap]');
    if (!wrap) return () => {};

    const gatilho = wrap.querySelector('[data-marcadores-filtro-gatilho]');
    const popover = wrap.querySelector('[data-marcadores-filtro-popover]');
    const lista = wrap.querySelector('[data-marcadores-filtro-lista]');
    const contador = wrap.querySelector('[data-marcadores-filtro-contador]');
    const limpar = wrap.querySelector('[data-marcadores-filtro-limpar]');

    function refletirGatilho() {
        const total = filtroMarcadores.length;
        wrap.classList.toggle('popover-filtro-wrap--ativo', total > 0);
        contador.textContent = total ? String(total) : '';
        contador.hidden = !total;
        gatilho.setAttribute('aria-label', total
            ? `Marcadores: ${total} selecionado${total > 1 ? 's' : ''}`
            : 'Filtrar por marcadores');
    }

    function desenharLista() {
        const itens = marcadores.listar();

        lista.innerHTML = itens.length
            ? itens.map(m => {
                const ativo = filtroMarcadores.includes(m.id);
                return html`
                    <button type="button" class="popover-marcadores__item${raw(ativo ? ' popover-marcadores__item--ativo' : '')}"
                            role="option" aria-selected="${ativo}" data-marcador-filtro="${m.id}">
                        <span class="popover-marcadores__ponto" style="background: ${m.cor}"></span>
                        <span class="popover-marcadores__nome">${m.nome}</span>
                        ${raw(ativo ? icone('check', { classe: 'popover-filtro__check' }) : '')}
                    </button>
                `;
            }).join('')
            : html`<div class="popover-marcadores__vazio">Nenhum marcador cadastrado ainda.</div>`;

        limpar.hidden = !filtroMarcadores.length;
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
        e.stopPropagation();
        if (popover.hidden) abrirPopover(); else fecharPopover();
    });

    popover.addEventListener('click', async e => {
        e.stopPropagation();

        if (e.target.closest('[data-marcadores-filtro-limpar]')) {
            filtroMarcadores = [];
            refletirGatilho();
            desenharLista();
            aoMudar();
            return;
        }

        if (e.target.closest('[data-marcadores-filtro-gerenciar]')) {
            fecharPopover();
            await abrirGerenciarMarcadores();
            // Marcadores excluídos não podem continuar filtrando a lista.
            filtroMarcadores = filtroMarcadores.filter(id => marcadores.obter(id));
            refletirGatilho();
            aoMudar();
            return;
        }

        const item = e.target.closest('[data-marcador-filtro]');
        if (!item) return;

        const id = item.dataset.marcadorFiltro;
        filtroMarcadores = filtroMarcadores.includes(id)
            ? filtroMarcadores.filter(m => m !== id)
            : [...filtroMarcadores, id];

        refletirGatilho();
        desenharLista();
        aoMudar();
    });

    function aoClicarFora(e) {
        if (!popover.hidden && !wrap.contains(e.target)) fecharPopover();
    }
    document.addEventListener('click', aoClicarFora);

    function aoTeclar(e) {
        if (e.key === 'Escape' && !popover.hidden) fecharPopover();
    }
    document.addEventListener('keydown', aoTeclar);

    refletirGatilho();

    return function destruir() {
        document.removeEventListener('click', aoClicarFora);
        document.removeEventListener('keydown', aoTeclar);
    };
}

const viewAgenda = {
    render(container) {
        const opcoesSecao = [
            { chave: '', titulo: 'Todos os grupos', icone: 'listaCards', corIcone: 'neutra' },
            ...SECOES
        ];
        const secaoAtiva = opcoesSecao.find(s => s.chave === filtroSecao) || opcoesSecao[0];

        container.innerHTML = html`
            <div class="view-header">
                <div class="view-header__titulo">
                    <h1>Agenda</h1>
                    <p data-resumo></p>
                </div>
                ${raw(pode('agenda.criar') ? html`
                    <button type="button" class="btn btn--primario" data-acao="nova">
                        ${raw(icone('agendaAdicionar'))} Agendar visita
                    </button>
                ` : '')}
            </div>

            <div class="barra-filtros barra-filtros--agenda">
                <div class="segmentado" role="tablist" aria-label="Modo de visualização">
                    ${raw(VISOES.map(v => html`
                        <button type="button" class="segmentado__opcao" role="tab" data-visao="${v.chave}" aria-selected="${v.chave === modoVisao}">
                            ${raw(icone(v.icone))} ${v.rotulo}
                        </button>
                    `).join(''))}
                </div>

                <div class="campo popover-filtro-wrap" data-filtro-wrap${raw(modoVisao !== 'cards' ? ' hidden' : '')}>
                    <button type="button" class="seletor-filtro" data-filtro-gatilho aria-haspopup="true" aria-expanded="false">
                        <span class="seletor-filtro__ponto seletor-filtro__ponto--${raw(secaoAtiva.corIcone)}"></span>
                        <span class="seletor-filtro__texto">${secaoAtiva.titulo}</span>
                        ${raw(icone('setaBaixo'))}
                    </button>

                    <div class="popover-filtro" data-filtro-popover hidden role="listbox" aria-label="Filtrar por grupo">
                        <div class="popover-filtro__titulo">Filtrar por grupo</div>
                        ${raw(opcoesSecao.map(s => html`
                            <button type="button" class="popover-filtro__item${raw(s.chave === filtroSecao ? ' popover-filtro__item--ativo' : '')}" role="option" aria-selected="${s.chave === filtroSecao}" data-filtro-valor="${s.chave}">
                                <span class="popover-filtro__icone popover-filtro__icone--${raw(s.corIcone)}">${raw(icone(s.icone))}</span>
                                <span class="popover-filtro__nome">${s.titulo}</span>
                                ${raw(s.chave === filtroSecao ? icone('check', { classe: 'popover-filtro__check' }) : '')}
                            </button>
                        `).join(''))}
                    </div>
                </div>

                <div class="campo popover-filtro-wrap popover-filtro-wrap--marcadores" data-marcadores-filtro-wrap>
                    <button type="button" class="seletor-filtro" data-marcadores-filtro-gatilho
                            aria-haspopup="true" aria-expanded="false" aria-label="Filtrar por marcadores">
                        ${raw(icone('marcador', { classe: 'seletor-filtro__icone' }))}
                        <span class="seletor-filtro__texto">Marcadores</span>
                        <span class="seletor-filtro__contador" data-marcadores-filtro-contador hidden></span>
                        ${raw(icone('setaBaixo'))}
                    </button>

                    <div class="popover-marcadores popover-marcadores--filtro" data-marcadores-filtro-popover hidden
                         role="listbox" aria-multiselectable="true" aria-label="Filtrar por marcadores">
                        <div class="popover-marcadores__cabecalho">
                            <span class="popover-filtro__titulo">Filtrar por marcador</span>
                            <button type="button" class="popover-marcadores__limpar" data-marcadores-filtro-limpar hidden>Limpar</button>
                        </div>
                        <div class="popover-marcadores__lista" data-marcadores-filtro-lista></div>
                        ${raw(pode('catalogos.gerenciar') ? html`
                            <button type="button" class="popover-marcadores__gerenciar" data-marcadores-filtro-gerenciar>
                                ${raw(icone('config'))} Gerenciar marcadores
                            </button>
                        ` : '')}
                    </div>
                </div>
            </div>

            <div data-conteudo></div>
        `;

        renderLista(container);
        atualizarBotoesVisao(container);
        const destruirFiltro = ligarFiltroSecao(container, opcoesSecao, () => renderLista(container));
        const destruirFiltroMarcadores = ligarFiltroMarcadores(container, () => renderLista(container));
        desinscrever.push(destruirFiltro, destruirFiltroMarcadores);

        container.querySelector('.segmentado').addEventListener('click', e => {
            const botao = e.target.closest('[data-visao]');
            if (!botao) return;
            modoVisao = botao.dataset.visao;
            if (modoVisao === 'semana' || modoVisao === 'mes') dataRef = hojeISO();
            renderLista(container);
            atualizarBotoesVisao(container);
        });

        const atualizar = () => renderLista(container);

        desinscrever.push(
            on(EVENTOS.DADOS_ALTERADOS, atualizar),
            // As checagens se repetem aqui: o markup pode ter sido renderizado
            // antes de uma troca de permissão ou de sessão.
            delegarAcoes(container, {
                nova: async () => {
                    if (!pode('agenda.criar')) return;
                    await abrirFormularioVisita();
                },
                realizar: async ({ id }) => {
                    if (!pode('agenda.concluir')) return;
                    await abrirRegistrarVisita(id);
                },
                editar: async ({ id }) => {
                    if (!pode('agenda.criar')) return;
                    const v = visitas.obter(id);
                    if (v) await abrirFormularioVisita({ visita: v });
                },
                ausente: async ({ id }) => {
                    if (!pode('agenda.concluir')) return;
                    await abrirMarcarAusente(id);
                },
                reagendar: async ({ id }) => {
                    if (!pode('agenda.reagendar')) return;
                    await abrirReagendar(id);
                },
                cancelar: async ({ id }) => {
                    if (!pode('agenda.cancelar')) return;
                    await confirmarCancelamento(id);
                },
                excluir: async ({ id }) => {
                    if (!pode('agenda.cancelar')) return;
                    await confirmarExclusao(id);
                },
                detalheMedico: ({ id }) => {
                    if (id) abrirDetalheMedico(id, { aoAlterar: atualizar });
                },
                abrirVisita: ({ id }) => {
                    if (id) abrirAcoesVisita(id);
                },
                verDia: ({ id }) => {
                    if (id) abrirDiaCompleto(id);
                },
                agendarRotina: async ({ id, data }) => {
                    if (!id) return;
                    // Sem permissão de agendar, o card ainda serve para consultar o médico.
                    if (!pode('agenda.criar')) {
                        abrirDetalheMedico(id, { aoAlterar: atualizar });
                        return;
                    }
                    await abrirFormularioVisita({ medicoId: id, rascunho: { data } });
                },
                periodoAnterior: () => {
                    dataRef = avancar(dataRef, modoVisao, -1);
                    renderLista(container);
                },
                periodoSeguinte: () => {
                    dataRef = avancar(dataRef, modoVisao, 1);
                    renderLista(container);
                },
                periodoHoje: () => {
                    dataRef = hojeISO();
                    renderLista(container);
                },
                paginaConcluidas: ({ id }) => {
                    const alvo = Number(id);
                    if (!Number.isFinite(alvo) || alvo < 1) return;
                    paginaConcluidas = alvo;
                    renderLista(container);
                },
                alternarSecao: ({ id }, alvo) => {
                    if (secoesOcultas.has(id)) secoesOcultas.delete(id);
                    else secoesOcultas.add(id);

                    const secao = alvo.closest('.secao');
                    const expandida = !secoesOcultas.has(id);
                    secao.querySelector('.grid-cards').hidden = !expandida;
                    const rodape = secao.querySelector('.secao__rodape');
                    if (rodape) rodape.hidden = !expandida;
                    alvo.setAttribute('aria-expanded', String(expandida));
                }
            })
        );
    },

    destroy() {
        // Sem isso, cada troca de tela deixaria observers de mapa pendurados.
        limparMapas(document.getElementById('app'));
        desligarDrag?.();
        desligarDrag = null;
        desinscrever.forEach(fn => fn?.());
        desinscrever = [];
    }
};

NS.ui = NS.ui || {};
NS.ui.views = NS.ui.views || {};
NS.ui.views.agenda = { viewAgenda };
})();
