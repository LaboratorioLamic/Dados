// ===== js/services/dadosTeste.js =====
(function () {
'use strict';

/**
 * Gerador de dados de exemplo, só para visualizar o app populado
 * (cards, mapas, calendário Semana/Mês) sem digitar nada à mão.
 *
 * Usa o mesmo caminho do backup: `backup.importar` tira um snapshot
 * antes de substituir, então "Desfazer última importação" também
 * desfaz a geração de dados de teste.
 */

var novoId = NS.core.id.novoId;
var PREFIXOS = NS.core.id.PREFIXOS;
var storage = NS.core.storage;
var STATUS = NS.domain.visita.STATUS;
var MOTIVOS_PADRAO = NS.core.storage.MOTIVOS_PADRAO;
var MARCADORES_PADRAO = NS.core.storage.MARCADORES_PADRAO;
var DURACAO_PADRAO = NS.domain.visita.DURACAO_PADRAO;
const MEDICOS_EXEMPLO = [
    { nome: 'Dra. Ana Souza', crm: 'CRM/SP 111111', especialidade: 'Ginecologia', cidade: 'São Paulo', estado: 'SP', bairro: 'Pinheiros', rua: 'Rua dos Pinheiros', numero: '500' },
    { nome: 'Dr. Bruno Lima', crm: 'CRM/SP 222222', especialidade: 'Urologia', cidade: 'São Paulo', estado: 'SP', bairro: 'Moema', rua: 'Av. Ibirapuera', numero: '1200' },
    { nome: 'Dra. Carla Dias', crm: 'CRM/SP 333333', especialidade: 'Dermatologia', cidade: 'Guarulhos', estado: 'SP', bairro: 'Centro', rua: 'Rua Dom Pedro II', numero: '80' },
    { nome: 'Dr. Diego Ramos', crm: 'CRM/SP 444444', especialidade: 'Cardiologia', cidade: 'São Paulo', estado: 'SP', bairro: 'Vila Mariana', rua: 'Rua Vergueiro', numero: '2100' },
    { nome: 'Dra. Elisa Prado', crm: 'CRM/SP 555555', especialidade: 'Endocrinologia', cidade: 'Osasco', estado: 'SP', bairro: 'Centro', rua: 'Av. dos Autonomistas', numero: '600' },
    { nome: 'Dr. Fábio Nunes', crm: 'CRM/SP 666666', especialidade: 'Ortopedia', cidade: 'São Paulo', estado: 'SP', bairro: 'Tatuapé', rua: 'Rua Tuiuti', numero: '900' },
    { nome: 'Dra. Gabriela Melo', crm: 'CRM/SP 777777', especialidade: 'Pediatria', cidade: 'São Paulo', estado: 'SP', bairro: 'Santana', rua: 'Rua Voluntários da Pátria', numero: '1500' },
    { nome: 'Dr. Hugo Teixeira', crm: 'CRM/SP 888888', especialidade: 'Neurologia', cidade: 'São Paulo', estado: 'SP', bairro: 'Itaim Bibi', rua: 'Rua Joaquim Floriano', numero: '400' }
];

const HORARIOS = ['08:00', '09:00', '10:00', '11:00', '14:00', '15:00', '16:00', ''];
const OBJETIVOS_EXEMPLO = storage.dbVazio().objetivos;
const OBJETIVOS_LISTA = OBJETIVOS_EXEMPLO.map(o => o.id);

/**
 * Combinações de marcadores distribuídas pelas visitas de exemplo: algumas
 * sem etiqueta nenhuma, uma com duas — é o que mostra o chip simples, o
 * empilhado e o card "limpo" lado a lado na Agenda.
 */
const MARCADORES_LISTA = MARCADORES_PADRAO.map(m => m.id);
const COMBOS_MARCADORES = [
    [MARCADORES_LISTA[0]],
    [],
    [MARCADORES_LISTA[1], MARCADORES_LISTA[3]],
    [MARCADORES_LISTA[2]],
    [],
    [MARCADORES_LISTA[3]]
];

function amostra(lista, indice) {
    return lista[indice % lista.length];
}

function isoComOffset(diasOffset) {
    const data = new Date();
    data.setDate(data.getDate() + diasOffset);
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
}

function medicoDeExemplo(dados, indice, especialidadeIdPorNome) {
    return {
        id: novoId(PREFIXOS.medicos),
        nome: dados.nome,
        crm: dados.crm,
        especialidadeId: especialidadeIdPorNome.get(dados.especialidade) || '',
        telefone: '',
        whatsapp: `1198${String(1000000 + indice * 111).slice(0, 7)}`,
        endereco: {
            cep: '',
            rua: dados.rua,
            numero: dados.numero,
            bairro: dados.bairro,
            cidade: dados.cidade,
            estado: dados.estado
        },
        referencia: '',
        diasHorarios: 'Seg a sex, 8h–18h',
        criadoEm: new Date().toISOString()
    };
}

function visita({ medicoId, diasOffset, horario, status, objetivo, notas = '', motivoAusencia = '', marcadores = [] }) {
    return {
        id: novoId(PREFIXOS.visitas),
        medicoId,
        status,
        data: isoComOffset(diasOffset),
        horario,
        duracao: DURACAO_PADRAO,
        objetivo,
        notas,
        motivoAusencia,
        marcadores,
        visitaOrigemId: null,
        criadoEm: new Date().toISOString()
    };
}

/**
 * Monta um conjunto de médicos + visitas espalhados pela semana atual,
 * pelo mês e um pouco de histórico — dá pra ver Cards, Semana e Mês
 * todos com conteúdo, incluindo atrasada/hoje/concluída/ausente.
 */
function gerar() {
    const nomesEspecialidade = Array.from(new Set(MEDICOS_EXEMPLO.map(m => m.especialidade)));
    const especialidades = nomesEspecialidade.map(nome => ({ id: novoId(PREFIXOS.especialidades), nome }));
    const especialidadeIdPorNome = new Map(especialidades.map(e => [e.nome, e.id]));

    const medicos = MEDICOS_EXEMPLO.map((dados, indice) => medicoDeExemplo(dados, indice, especialidadeIdPorNome));
    const visitas = [];

    const porId = i => medicos[i % medicos.length].id;

    // Atrasada (ontem, ainda "agendada").
    visitas.push(visita({ medicoId: porId(0), diasOffset: -1, horario: '10:00', status: STATUS.AGENDADA, objetivo: amostra(OBJETIVOS_LISTA, 0), marcadores: amostra(COMBOS_MARCADORES, 0) }));

    // Hoje: uma pela manhã, outra à tarde.
    visitas.push(visita({ medicoId: porId(1), diasOffset: 0, horario: '09:00', status: STATUS.AGENDADA, objetivo: amostra(OBJETIVOS_LISTA, 1), marcadores: amostra(COMBOS_MARCADORES, 2) }));
    visitas.push(visita({ medicoId: porId(2), diasOffset: 0, horario: '15:00', status: STATUS.AGENDADA, objetivo: amostra(OBJETIVOS_LISTA, 2), marcadores: amostra(COMBOS_MARCADORES, 3) }));

    // Resto da semana corrente, espalhado, com um sem horário definido.
    for (let i = 0; i < 6; i++) {
        visitas.push(visita({
            medicoId: porId(i + 3),
            diasOffset: i + 1,
            horario: amostra(HORARIOS, i),
            status: STATUS.AGENDADA,
            objetivo: amostra(OBJETIVOS_LISTA, i),
            marcadores: amostra(COMBOS_MARCADORES, i)
        }));
    }

    // Mais adiante no mês.
    for (let i = 0; i < 5; i++) {
        visitas.push(visita({
            medicoId: porId(i + 1),
            diasOffset: 9 + i * 3,
            horario: amostra(HORARIOS, i + 2),
            status: STATUS.AGENDADA,
            objetivo: amostra(OBJETIVOS_LISTA, i + 1),
            marcadores: amostra(COMBOS_MARCADORES, i + 1)
        }));
    }

    // Histórico: concluídas e uma ausência, nos dias anteriores.
    visitas.push(visita({ medicoId: porId(4), diasOffset: -3, horario: '11:00', status: STATUS.REALIZADA, objetivo: amostra(OBJETIVOS_LISTA, 0), notas: 'Demonstrou interesse no novo painel de exames.', marcadores: amostra(COMBOS_MARCADORES, 2) }));
    visitas.push(visita({ medicoId: porId(5), diasOffset: -5, horario: '14:00', status: STATUS.REALIZADA, objetivo: amostra(OBJETIVOS_LISTA, 1), notas: 'Pediu retorno em 30 dias.' }));
    visitas.push(visita({ medicoId: porId(6), diasOffset: -2, horario: '16:00', status: STATUS.AUSENTE, objetivo: amostra(OBJETIVOS_LISTA, 2), motivoAusencia: amostra(MOTIVOS_PADRAO, 0).nome }));
    visitas.push(visita({ medicoId: porId(7), diasOffset: -8, horario: '10:00', status: STATUS.CANCELADA, objetivo: amostra(OBJETIVOS_LISTA, 0) }));

    return {
        medicos,
        visitas,
        especialidades,
        objetivos: OBJETIVOS_EXEMPLO,
        motivosAusencia: MOTIVOS_PADRAO.map(m => ({ ...m })),
        marcadores: MARCADORES_PADRAO.map(m => ({ ...m })),
        config: {}
    };
}

NS.services = NS.services || {};
NS.services.dadosTeste = { gerar };
})();
