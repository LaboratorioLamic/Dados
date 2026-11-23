// Estado global da aplicação

// AGENDA ATIVA
let currentAgendaId = localStorage.getItem('respiroAgendaAtiva') || AGENDA_PADRAO;
if (!AGENDAS[currentAgendaId]) currentAgendaId = AGENDA_PADRAO;

// Dados de TODAS as agendas (mantidos vivos para os cards da tela inicial)
const agendaData = {};
AGENDA_IDS.forEach(id => agendaData[id] = []);

// ESTADO DA APLICAÇÃO
// `appointments` é sempre a lista da agenda ativa. Use setAppointments() para
// substituí-la, para que agendaData continue sincronizado.
let appointments = agendaData[currentAgendaId];

function setAppointments(lista, agendaId) {
    const id = agendaId || currentAgendaId;
    agendaData[id] = lista;
    if (id === currentAgendaId) appointments = lista;
}

function appointmentsDe(agendaId) {
    return agendaData[agendaId] || [];
}

let pendingChecklistAction = null;

let atendentesList = [];
let motivosPerdaList = [];
let currentDate = new Date();

// Visão do calendário: 'week' (padrão) ou 'month'. Quem já escolheu mês
// continua no mês — só a ausência de preferência salva cai no padrão semanal.
let calendarView = localStorage.getItem('respiroCalendarView') === 'month' ? 'month' : 'week';
let tablePage = 1;
const itemsPerPage = 20;

// AUDIT LOG
let auditLog = [];
let historyFilter = { type: 'global' };
let historyPage = 1;
const historyItemsPerPage = 10;

// AUTENTICAÇÃO DE USUÁRIOS (session-only — resetado ao recarregar)
let currentUser = null;

function isAdmin() { return currentUser?.role === 'admin'; }

// Gráficos
let charts = {};
