// ===== js/domain/visita.js =====
(function () {
'use strict';

/**
 * Domínio: Visita.
 *
 * Máquina de estados declarativa. Nenhuma view escreve `visita.status`
 * diretamente — toda mudança passa por `aplicarTransicao` ou `reagendar`.
 */

var db = NS.core.db;
var hojeISO = NS.core.dom.hojeISO;
var diffDias = NS.core.dom.diffDias;
const COLECAO = 'visitas';

const STATUS = {
    AGENDADA: 'agendada',
    REALIZADA: 'realizada',
    AUSENTE: 'ausente',
    CANCELADA: 'cancelada',
    REAGENDADA: 'reagendada'
};

/**
 * Estados terminais têm lista vazia — a transição é rejeitada na função.
 * `reagendada` não é mais um destino de `aplicarTransicao` (ver `reagendar`,
 * que move a própria visita); o status fica só para exibir dados antigos.
 */
const TRANSICOES = {
    agendada: ['realizada', 'ausente', 'cancelada'],
    ausente: [],
    realizada: [],
    cancelada: [],
    reagendada: []
};

const ROTULOS_STATUS = {
    agendada: 'Agendada',
    realizada: 'Realizada',
    ausente: 'Não atendeu',
    cancelada: 'Cancelada',
    reagendada: 'Reagendada'
};

/** Usados nas mensagens de erro, onde o rótulo curto soa quebrado. */
const DESCRICAO_STATUS = {
    agendada: 'já agendada',
    realizada: 'já registrada como realizada',
    ausente: 'registrada como não atendida',
    cancelada: 'cancelada',
    reagendada: 'já reagendada'
};

const TAG_STATUS = {
    agendada: 'info',
    realizada: 'sucesso',
    ausente: 'alerta',
    cancelada: 'neutra',
    reagendada: 'roxa'
};

const DURACAO_PADRAO = '01:00';

function visitaVazia() {
    return {
        medicoId: '',
        status: STATUS.AGENDADA,
        data: hojeISO(),
        horario: '',
        duracao: DURACAO_PADRAO,
        objetivo: 'fortalecer_relacionamento',
        notas: '',
        motivoAusencia: '',
        marcadores: [],
        visitaOrigemId: null
    };
}

/** Soma "HH:MM" + "HH:MM" (duração) em minutos, sem estourar o dia (cap 23:59). */
function horarioFim(horario, duracao) {
    if (!horario) return '';
    const [h, m] = String(horario).split(':').map(Number);
    if (Number.isNaN(h)) return '';

    const [dh, dm] = String(duracao || DURACAO_PADRAO).split(':').map(Number);
    const total = h * 60 + (m || 0) + (Number.isNaN(dh) ? 60 : dh * 60 + (dm || 0));
    const minutos = Math.min(total, 23 * 60 + 59);

    const hf = Math.floor(minutos / 60);
    const mf = minutos % 60;
    return `${String(hf).padStart(2, '0')}:${String(mf).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ *
 * Máquina de estados
 * ------------------------------------------------------------------ */

function podeTransicionar(de, para) {
    return (TRANSICOES[de] || []).includes(para);
}

function acoesDisponiveis(status) {
    return TRANSICOES[status] || [];
}

function ehTerminal(status) {
    return (TRANSICOES[status] || []).length === 0;
}

/**
 * Única porta de entrada para mudar o status de uma visita.
 * @returns {{ok: boolean, visita?: object, erro?: string}}
 */
function aplicarTransicao(visitaId, novoStatus, dados = {}) {
    const visita = db.obter(COLECAO, visitaId);
    if (!visita) return { ok: false, erro: 'Visita não encontrada.' };

    if (!podeTransicionar(visita.status, novoStatus)) {
        return {
            ok: false,
            erro: `Esta visita está ${DESCRICAO_STATUS[visita.status] || visita.status} e não aceita mais essa mudança.`
        };
    }

    if (novoStatus === STATUS.AUSENTE && !String(dados.motivoAusencia || '').trim()) {
        return { ok: false, erro: 'Informe o motivo da ausência.' };
    }

    const patch = { status: novoStatus };
    if (dados.notas !== undefined) patch.notas = String(dados.notas).trim();
    if (dados.motivoAusencia !== undefined) patch.motivoAusencia = String(dados.motivoAusencia).trim();

    return { ok: true, visita: db.atualizar(COLECAO, visitaId, patch) };
}

/**
 * Reagendamento: move a própria visita para a nova data/hora, sem duplicar
 * o registro. Se estava `ausente`, volta a ficar `agendada`.
 */
function reagendar(visitaId, { data, horario = '', duracao = '', notas = '' }) {
    const origem = db.obter(COLECAO, visitaId);
    if (!origem) return { ok: false, erro: 'Visita não encontrada.' };

    if (origem.status !== STATUS.AGENDADA && origem.status !== STATUS.AUSENTE) {
        return { ok: false, erro: 'Esta visita não pode ser reagendada.' };
    }

    if (!data) return { ok: false, erro: 'Informe a nova data.' };

    const patch = {
        status: STATUS.AGENDADA,
        data,
        horario,
        duracao: duracao || origem.duracao || DURACAO_PADRAO
    };
    if (notas) patch.notas = notas;

    const visita = db.atualizar(COLECAO, visitaId, patch);
    return { ok: true, visita };
}

/* ------------------------------------------------------------------ *
 * Consultas
 * ------------------------------------------------------------------ */

function ordenar(a, b) {
    if (a.data !== b.data) return a.data.localeCompare(b.data);
    return (a.horario || '99:99').localeCompare(b.horario || '99:99');
}

function listar() {
    return db.listar(COLECAO).sort(ordenar);
}

function obter(id) {
    return db.obter(COLECAO, id);
}

function doMedico(medicoId) {
    return db.visitasDoMedico(medicoId).sort((a, b) => ordenar(b, a));
}

function criar(dados) {
    return db.criar(COLECAO, { ...visitaVazia(), ...dados });
}

function atualizar(id, dados) {
    return db.atualizar(COLECAO, id, dados);
}

function remover(id) {
    return db.remover(COLECAO, id);
}

/** Visitas ainda abertas de um médico — bloqueiam a exclusão do cadastro. */
function agendadasDoMedico(medicoId) {
    return db.visitasDoMedico(medicoId).filter(v => v.status === STATUS.AGENDADA);
}

function estaAtrasada(visita) {
    return visita.status === STATUS.AGENDADA && diffDias(visita.data, hojeISO()) > 0;
}

/** Ids dos marcadores de uma visita, tolerando registros anteriores à v5. */
function marcadoresDe(visita) {
    return Array.isArray(visita?.marcadores) ? visita.marcadores : [];
}

/**
 * true se a visita carrega ao menos um dos marcadores pedidos.
 *
 * O filtro é OU, não E: marcar "Prioridade" e "Retorno" mostra tudo que é
 * uma coisa OU a outra — a leitura natural de quem vai clicando etiquetas
 * para ampliar a lista, não para cruzá-las.
 */
function temAlgumMarcador(visita, ids) {
    if (!ids || !ids.length) return true;
    const daVisita = marcadoresDe(visita);
    return ids.some(id => daVisita.includes(id));
}

/** Filtro único e extensível — Ondas 2/3 acrescentam chaves aqui. */
function filtrarVisitas(visitas, { status = '', medicoId = '', periodo = '', marcadores = [] } = {}) {
    const hoje = hojeISO();

    return visitas.filter(visita => {
        if (status && visita.status !== status) return false;
        if (medicoId && visita.medicoId !== medicoId) return false;
        if (!temAlgumMarcador(visita, marcadores)) return false;

        if (periodo === 'abertas' && visita.status !== STATUS.AGENDADA) return false;
        if (periodo === 'hoje' && visita.data !== hoje) return false;
        if (periodo === 'semana') {
            const dias = diffDias(hoje, visita.data);
            if (dias < 0 || dias > 7) return false;
        }

        return true;
    });
}

/**
 * Agrupa para a Agenda: atrasadas, hoje, amanhã, próximas e concluídas.
 *
 * `concluidas` reúne as visitas já realizadas, independentemente da data,
 * da mais recente para a mais antiga — é o grupo que a Agenda mostra
 * recolhido por padrão. Ausentes e canceladas continuam fora: elas não
 * foram concluídas e vivem no histórico do médico.
 */
function agruparParaAgenda(visitas) {
    const hoje = hojeISO();
    const grupos = {
        atrasadas: [],
        hoje: [],
        amanha: [],
        proximas: [],
        concluidas: []
    };

    for (const visita of visitas) {
        if (visita.status === STATUS.REALIZADA) {
            grupos.concluidas.push(visita);
            continue;
        }
        if (visita.status !== STATUS.AGENDADA) continue;

        const dias = diffDias(hoje, visita.data);
        if (dias < 0) grupos.atrasadas.push(visita);
        else if (dias === 0) grupos.hoje.push(visita);
        else if (dias === 1) grupos.amanha.push(visita);
        else grupos.proximas.push(visita);
    }

    grupos.concluidas.sort((a, b) => (b.data || '').localeCompare(a.data || '')
        || (b.horario || '').localeCompare(a.horario || ''));

    return grupos;
}

NS.domain = NS.domain || {};
NS.domain.visita = { COLECAO, DURACAO_PADRAO, ROTULOS_STATUS, STATUS, TAG_STATUS, TRANSICOES, acoesDisponiveis, agendadasDoMedico, agruparParaAgenda, aplicarTransicao, atualizar, criar, doMedico, ehTerminal, estaAtrasada, filtrarVisitas, horarioFim, listar, marcadoresDe, obter, podeTransicionar, reagendar, remover, temAlgumMarcador, visitaVazia };
})();
