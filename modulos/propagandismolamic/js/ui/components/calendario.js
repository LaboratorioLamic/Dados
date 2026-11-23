// ===== js/ui/components/calendario.js =====
(function () {
'use strict';

/**
 * Visualizações de calendário da Agenda: grade Semana (por horário) e
 * grade Mês (por dia). Cards da lista continuam existindo — isto é
 * só mais um jeito de olhar para as mesmas visitas.
 *
 * Drag-and-drop é nativo (HTML5 DnD), sem dependência: cada visita
 * agendada vira um `<article draggable>`; soltar num slot novo chama
 * `aoMover(visitaId, novaData, novoHorario)`, que o chamador liga ao
 * domínio (`visitas.atualizar`). Este módulo não conhece `visitas.js`
 * nem grava nada — só monta HTML e dispara callbacks.
 */

var html = NS.core.dom.html;
var raw = NS.core.dom.raw;
var TAG_STATUS = NS.domain.visita.TAG_STATUS;
var estaAtrasada = NS.domain.visita.estaAtrasada;
var horarioFim = NS.domain.visita.horarioFim;
var marcadoresDaVisita = NS.domain.visita.marcadoresDe;
var marcadores = NS.domain.marcador;
var icone = NS.ui.icons.icone;
const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MESES_NOME = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
];

const HORA_INICIO = 7;
const HORA_FIM = 19;

/** Granularidade da grade Semana: cada hora vira N sub-linhas, para o card ocupar altura proporcional à duração. */
const SUBLINHAS_POR_HORA = 4; // 60min / 4 = blocos de 15min
const MINUTOS_POR_SUBLINHA = 60 / SUBLINHAS_POR_HORA;

/* ------------------------------------------------------------------ *
 * Utilidades de data (evitam Date para não cair em fuso horário)
 * ------------------------------------------------------------------ */

function paraDate(iso) {
    const [ano, mes, dia] = String(iso).split('-').map(Number);
    return new Date(ano, mes - 1, dia);
}

function paraISO(date) {
    const ano = date.getFullYear();
    const mes = String(date.getMonth() + 1).padStart(2, '0');
    const dia = String(date.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
}

function somarDias(iso, quantidade) {
    const data = paraDate(iso);
    data.setDate(data.getDate() + quantidade);
    return paraISO(data);
}

/** Domingo da semana que contém `iso`. */
function inicioDaSemana(iso) {
    const data = paraDate(iso);
    data.setDate(data.getDate() - data.getDay());
    return paraISO(data);
}

/** Primeiro dia do mês de `iso`. */
function inicioDoMes(iso) {
    const data = paraDate(iso);
    data.setDate(1);
    return paraISO(data);
}

function ultimoDiaDoMes(iso) {
    const [ano, mes] = String(iso).split('-').map(Number);
    return new Date(ano, mes, 0).getDate();
}

function horaParaMinutos(horario) {
    if (!horario) return null;
    const [h, m] = horario.split(':').map(Number);
    if (Number.isNaN(h)) return null;
    return h * 60 + (m || 0);
}

/* ------------------------------------------------------------------ *
 * Navegação de período — usada pelo controlador (agenda.js)
 * ------------------------------------------------------------------ */

function periodoSemana(iso) {
    const inicio = inicioDaSemana(iso);
    return { inicio, fim: somarDias(inicio, 6) };
}

function periodoMes(iso) {
    const inicio = inicioDoMes(iso);
    return { inicio, fim: somarDias(inicio, ultimoDiaDoMes(inicio) - 1) };
}

function avancar(iso, modo, direcao) {
    if (modo === 'semana') return somarDias(iso, 7 * direcao);
    const data = paraDate(iso);
    data.setDate(1);
    data.setMonth(data.getMonth() + direcao);
    return paraISO(data);
}

/** Maiúscula só na primeira letra do texto — não em cada palavra. */
function comInicialMaiuscula(texto) {
    return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function rotuloPeriodo(iso, modo) {
    if (modo === 'semana') {
        const { inicio, fim } = periodoSemana(iso);
        const di = paraDate(inicio), df = paraDate(fim);
        const mesmoMes = di.getMonth() === df.getMonth();
        const a = `${di.getDate()} ${MESES_NOME[di.getMonth()].slice(0, 3)}`;
        const b = mesmoMes ? `${df.getDate()}` : `${df.getDate()} ${MESES_NOME[df.getMonth()].slice(0, 3)}`;
        return comInicialMaiuscula(`${a} – ${b} de ${di.getFullYear()}`);
    }
    const data = paraDate(inicioDoMes(iso));
    return comInicialMaiuscula(`${MESES_NOME[data.getMonth()]} de ${data.getFullYear()}`);
}

/* ------------------------------------------------------------------ *
 * Cartão compacto de evento (usado nas duas grades)
 * ------------------------------------------------------------------ */

function eventoCompacto(visita, medico, { estilo = '' } = {}) {
    const atrasada = estaAtrasada(visita);
    const classeTag = atrasada ? 'perigo' : TAG_STATUS[visita.status];
    const nome = medico?.nome || 'Médico removido';
    const arrastavel = visita.status === 'agendada';
    const fim = horarioFim(visita.horario, visita.duracao);
    const faixaHorario = visita.horario && fim ? `${visita.horario}–${fim}` : visita.horario;
    const itensMarcador = marcadores.dosIds(marcadoresDaVisita(visita));

    // No evento compacto não cabe o nome do marcador: só o símbolo na cor
    // dele, com o nome no `title` para quem passar o mouse.
    const simbolos = itensMarcador.length ? html`
        <span class="evento__marcadores" title="${itensMarcador.map(m => m.nome).join(', ')}">
            ${raw(itensMarcador.map(m => html`<span class="evento__marcador" style="color: ${m.cor}">${raw(icone('marcador'))}</span>`).join(''))}
        </span>
    ` : '';

    return html`
        <article
            class="evento evento--${raw(classeTag)}"
            data-visita-id="${visita.id}"
            data-acao="abrirVisita"
            data-id="${visita.id}"
            ${raw(estilo ? `style="${estilo}"` : '')}
            ${raw(arrastavel ? 'draggable="true"' : '')}
        >
            ${raw(faixaHorario ? html`<span class="evento__hora">${faixaHorario}</span>` : '')}
            <span class="evento__nome">${nome}</span>
            ${raw(simbolos)}
        </article>
    `;
}

/* ------------------------------------------------------------------ *
 * Grade Semana — colunas = dias, linhas = horários
 * ------------------------------------------------------------------ */

/**
 * Distribui os eventos (já ordenados por horário) de um dia em "pistas"
 * lado a lado quando os intervalos se sobrepõem — mesma ideia do Google
 * Calendar, só que sem redistribuir largura dinamicamente: cada evento
 * fica preso à sua pista e a coluna do dia se divide em `totalPistas`.
 */
function distribuirEmPistas(lista) {
    const comIntervalo = lista
        .map(v => {
            const ini = horaParaMinutos(v.horario);
            if (ini === null) return null;
            const fimStr = horarioFim(v.horario, v.duracao);
            const fim = Math.max(horaParaMinutos(fimStr) ?? ini + 60, ini + 15);
            return { visita: v, ini, fim };
        })
        .filter(Boolean)
        .sort((a, b) => a.ini - b.ini || a.fim - b.fim);

    const pistas = []; // pistas[i] = fim (min) do último evento alocado na pista i

    comIntervalo.forEach(item => {
        let pista = pistas.findIndex(fimPista => fimPista <= item.ini);
        if (pista === -1) {
            pista = pistas.length;
            pistas.push(0);
        }
        pistas[pista] = item.fim;
        item.pista = pista;
    });

    const totalPistas = pistas.length || 1;
    comIntervalo.forEach(item => { item.totalPistas = totalPistas; });
    return comIntervalo;
}

function renderSemana(dataRef, visitasPorDia, medicosPorId, { hojeIso }) {
    const { inicio } = periodoSemana(dataRef);
    const dias = Array.from({ length: 7 }, (_, i) => somarDias(inicio, i));
    const horas = Array.from({ length: HORA_FIM - HORA_INICIO + 1 }, (_, i) => HORA_INICIO + i);
    const totalSublinhas = horas.length * SUBLINHAS_POR_HORA;

    const cabecalho = dias.map(iso => {
        const data = paraDate(iso);
        const ehHoje = iso === hojeIso;
        const lista = visitasPorDia[iso] || [];
        const semHorario = lista.filter(v => !v.horario);

        return html`
            <div class="semana__dia-cab ${raw(ehHoje ? 'semana__dia-cab--hoje' : '')}" data-drop-dia="${iso}">
                <span class="semana__dia-nome">${DIAS_CURTOS[data.getDay()]}</span>
                <span class="semana__dia-numero">${data.getDate()}</span>
                ${raw(semHorario.length ? html`
                    <div class="semana__sem-horario" data-drop-dia="${iso}" data-drop-horario="">
                        ${raw(semHorario.map(v => eventoCompacto(v, medicosPorId[v.medicoId])).join(''))}
                    </div>
                ` : '')}
            </div>
        `;
    }).join('');

    // Grade de fundo: uma célula por hora/dia, só como drop-target visual — sem eventos dentro.
    const celulasFundo = horas.map(hora => dias.map((iso, colIndex) => html`
        <div
            class="semana__celula"
            data-drop-dia="${iso}"
            data-drop-horario="${String(hora).padStart(2, '0')}:00"
            style="grid-column:${colIndex + 2};grid-row:${(hora - HORA_INICIO) * SUBLINHAS_POR_HORA + 1} / span ${SUBLINHAS_POR_HORA};"
        ></div>
    `).join('')).join('');

    const rotulosHora = horas.map(hora => html`
        <div class="semana__hora-rotulo" style="grid-column:1;grid-row:${(hora - HORA_INICIO) * SUBLINHAS_POR_HORA + 1} / span ${SUBLINHAS_POR_HORA};">
            ${String(hora).padStart(2, '0')}:00
        </div>
    `).join('');

    // Eventos: uma camada por dia, posicionados por horário/duração real.
    const eventos = dias.map((iso, colIndex) => {
        const doDia = (visitasPorDia[iso] || []).filter(v => v.horario);
        const alocados = distribuirEmPistas(doDia);

        return alocados.map(({ visita, ini, fim, pista, totalPistas }) => {
            const linhaInicio = Math.round((ini - HORA_INICIO * 60) / MINUTOS_POR_SUBLINHA) + 1;
            const linhaFim = Math.round((fim - HORA_INICIO * 60) / MINUTOS_POR_SUBLINHA) + 1;
            const span = Math.max(linhaFim - linhaInicio, 1);
            if (linhaInicio < 1 || linhaInicio > totalSublinhas) return '';

            const larguraPct = 100 / totalPistas;
            const esquerdaPct = larguraPct * pista;
            const estilo = `grid-column:${colIndex + 2};grid-row:${linhaInicio} / span ${span};margin-left:${esquerdaPct}%;width:calc(${larguraPct}% - 3px);`;

            return eventoCompacto(visita, medicosPorId[visita.medicoId], { estilo });
        }).join('');
    }).join('');

    const indiceHoje = dias.indexOf(hojeIso);
    const linhaAgora = indiceHoje !== -1 ? linhaDoAgora(indiceHoje, horas.length) : '';

    return html`
        <div class="semana">
            <div class="semana__cabecalho">
                <div class="semana__hora-rotulo semana__hora-rotulo--vazio"></div>
                ${raw(cabecalho)}
            </div>
            <div class="semana__corpo" style="grid-template-rows: repeat(${totalSublinhas}, ${MINUTOS_POR_SUBLINHA}px);">
                ${raw(rotulosHora)}
                ${raw(celulasFundo)}
                ${raw(eventos)}
                ${raw(linhaAgora)}
            </div>
        </div>
    `;
}

/**
 * Linha vermelha do horário atual, só na coluna do dia de hoje.
 * Fica dentro de `.semana__corpo`, posicionada em % do topo da grade
 * (não em linhas do grid — o horário atual raramente cai numa sub-linha
 * redonda de 15min).
 */
function linhaDoAgora(colIndex, totalHoras) {
    const agora = new Date();
    const minutosAgora = agora.getHours() * 60 + agora.getMinutes();
    const inicioMin = HORA_INICIO * 60;
    const fimMin = HORA_FIM * 60 + 60; // grade cobre a hora cheia de HORA_FIM inteira

    if (minutosAgora < inicioMin || minutosAgora > fimMin) return '';

    const percentualTopo = ((minutosAgora - inicioMin) / (totalHoras * 60)) * 100;
    const larguraDia = `((100% - var(--semana-col-hora)) / 7)`;
    const estilo = `top:${percentualTopo}%;left:calc(var(--semana-col-hora) + ${colIndex} * ${larguraDia});width:calc(${larguraDia});`;

    return html`
        <div class="semana__linha-agora" style="${estilo}" aria-hidden="true">
            <span class="semana__linha-agora__bolinha"></span>
        </div>
    `;
}

/* ------------------------------------------------------------------ *
 * Grade Mês — células = dias, mostra até N eventos + "mais"
 * ------------------------------------------------------------------ */

const MAX_EVENTOS_CELULA_MES = 3;

function renderMes(dataRef, visitasPorDia, medicosPorId, { hojeIso }) {
    const inicioMes = inicioDoMes(dataRef);
    const inicioGrade = inicioDaSemana(inicioMes);
    const totalDiasMes = ultimoDiaDoMes(inicioMes);
    const fimMes = somarDias(inicioMes, totalDiasMes - 1);
    const fimGrade = (() => {
        const data = paraDate(fimMes);
        const restante = 6 - data.getDay();
        return somarDias(fimMes, restante);
    })();

    const dias = [];
    let cursor = inicioGrade;
    while (cursor <= fimGrade) {
        dias.push(cursor);
        cursor = somarDias(cursor, 1);
    }

    const cabecalho = DIAS_CURTOS.map(nome => html`<div class="mes__cab-dia">${nome}</div>`).join('');

    const celulas = dias.map(iso => {
        const [, mesIso] = iso.split('-');
        const mesRef = inicioMes.split('-')[1];
        const foraDoMes = mesIso !== mesRef;
        const ehHoje = iso === hojeIso;
        const data = paraDate(iso);
        const lista = (visitasPorDia[iso] || []);
        const visiveis = lista.slice(0, MAX_EVENTOS_CELULA_MES);
        const excedente = lista.length - visiveis.length;

        return html`
            <div class="mes__dia ${raw(foraDoMes ? 'mes__dia--fora' : '')} ${raw(ehHoje ? 'mes__dia--hoje' : '')}" data-drop-dia="${iso}" data-acao="verDia" data-id="${iso}" role="button" tabindex="0" aria-label="Ver visitas de ${data.getDate()}">
                <span class="mes__dia-numero">${data.getDate()}</span>
                <div class="mes__eventos">
                    ${raw(visiveis.map(v => eventoCompacto(v, medicosPorId[v.medicoId])).join(''))}
                    ${raw(excedente > 0 ? html`
                        <span class="mes__mais">+${excedente} ${excedente === 1 ? 'visita' : 'visitas'}</span>
                    ` : '')}
                </div>
            </div>
        `;
    }).join('');

    return html`
        <div class="mes">
            <div class="mes__cabecalho">${raw(cabecalho)}</div>
            <div class="mes__grade">${raw(celulas)}</div>
        </div>
    `;
}

/* ------------------------------------------------------------------ *
 * Drag and drop
 * ------------------------------------------------------------------ */

/**
 * Liga o drag-and-drop num container já renderizado (semana ou mês).
 * `aoMover(visitaId, novaData, novoHorario)` decide se aceita e persiste;
 * devolvendo `false` a célula não é marcada como sucesso (sem side-effect visual).
 */
function ligarDragDrop(container, aoMover) {
    let arrastando = null;

    const limparAlvos = () => {
        container.querySelectorAll('.slot-alvo').forEach(el => el.classList.remove('slot-alvo'));
    };

    const onDragStart = e => {
        const cartao = e.target.closest('[draggable="true"]');
        if (!cartao) return;
        arrastando = cartao.dataset.visitaId;
        cartao.classList.add('evento--arrastando');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', arrastando);
    };

    const onDragEnd = e => {
        e.target.closest('[draggable="true"]')?.classList.remove('evento--arrastando');
        limparAlvos();
        arrastando = null;
    };

    const onDragOver = e => {
        const slot = e.target.closest('[data-drop-dia]');
        if (!slot || !arrastando) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (!slot.classList.contains('slot-alvo')) {
            limparAlvos();
            slot.classList.add('slot-alvo');
        }
    };

    const onDrop = e => {
        const slot = e.target.closest('[data-drop-dia]');
        limparAlvos();
        if (!slot) return;
        e.preventDefault();

        const visitaId = e.dataTransfer.getData('text/plain') || arrastando;
        arrastando = null;
        if (!visitaId) return;

        const novaData = slot.dataset.dropDia;
        const novoHorario = slot.dataset.dropHorario;
        aoMover(visitaId, novaData, novoHorario === undefined ? null : novoHorario);
    };

    container.addEventListener('dragstart', onDragStart);
    container.addEventListener('dragend', onDragEnd);
    container.addEventListener('dragover', onDragOver);
    container.addEventListener('drop', onDrop);

    return () => {
        container.removeEventListener('dragstart', onDragStart);
        container.removeEventListener('dragend', onDragEnd);
        container.removeEventListener('dragover', onDragOver);
        container.removeEventListener('drop', onDrop);
    };
}

NS.ui = NS.ui || {};
NS.ui.components = NS.ui.components || {};
NS.ui.components.calendario = { avancar, ligarDragDrop, periodoMes, periodoSemana, renderMes, renderSemana, rotuloPeriodo };
})();
