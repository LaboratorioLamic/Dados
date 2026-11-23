// ─── GLOBAL STATE VARIABLES (from index.html lines 2018-2020, 2054-2056, 2131-2156) ─

// Data arrays
let patients = [], vaccines = [], appointments = [], cancelReasons = [];
let holidays = [], vaccineLots = [], auditLog = [];
let stockMovements = []; // [{id, loteId, vaccineId, tipo:'entrada'|'saida', qtd, motivo, descarte, data, usuario}]
let patientContacts = []; // [{id, patientId, autor, tipo, texto, criadoEm, agendadoPara, status:'aberto'|'concluido', concluidoEm}]
// Unidades de coleta — onde a vacina é aplicada quando o local é "Laboratório".
// [{id, nome, apelido, ativo, endereco:{cep,logradouro,numero,bairro,cidade,estado,referencia}}]
let unidades = [];          // lista montada: unidades do RH + antigas (legado) só para histórico
let unidadesRh = {};        // rh_unidades (Dados LAMIC > RH): fonte oficial, só leitura aqui
let unidadesLegado = [];    // vacinas/unidades: cadastro antigo, mantido para não perder vínculo
let _prontuarioTab = 'info'; // 'info' | 'contato'
let currentLoteModalVaccineId = null;

// Almoxarifado state
let almoxModulo = 'estoque'; // estoque | produtos | lotes | movimentacao

// App readiness
let _appReady = false;
let _fbSaveTimer = null;

// Calendar / date state
let currentDate = new Date();

// Chart instances
let chartStatus, chartVaccine, chartLineVaccine, chartFinVaccine, chartFinMonth, chartAge, chartGender;

// Dashboard state
let dashView = 'analitico';

// Table state
let tableSortField = 'data', tableSortDir = 'asc';
let tableView = 'planilhas';
let _tablePage = 0;
const _TABLE_PAGE_SIZE = 10;

// Oportunidades pagination — página por sub-aba (aprazamento | oferta)
let _oppPage = { aprazamento: 0, oferta: 0 };
const _OPP_PAGE_SIZE = 15;

// User filter state
let userStatusFilter = 'ativos';

// Kanban state
let _kanbanSortDir = 'asc';
let _kanbanDragId = null;
let _kanbanPendingCancelId = null;
let _kanbanPage = {}; // { [colKey]: pageIndex (0-based) }
let _kanbanGroupDragPatId = null;
let _kanbanGroupDragFromStatus = null;
let _kanbanColGroupSort = {}; // { [colKey]: 'asc'|'desc'|null } — sort por data no modo agrupado
let _kanbanColVaccinesHidden = {}; // { [colKey]: bool } — estado do botão "mostrar/ocultar vacinas de todos os grupos", persiste entre paginações
let _agendarGrupoPending = null;
let _agendarGrupoRemovedIds = new Set();
let _agendarGrupoRemovePending = null;
let _aplicarGrupoPending = null;
let _aplicarGrupoRemovedIds = new Set();
let _aplicarGrupoRemovePending = null;
let _moverGrupoPerdidoPending = null;
let _editarOportunidadePending = null;
let _oportunidadeDescontoTarget = null;
let _oportunidadeDescontoTab = 'pct';
let _oportNewLineSeq = 0;

// Agenda day selection
let selectedDayDate = null;

// Auth state
let appUsers  = [];
let appGroups = [];
localStorage.removeItem('ig_session');
let currentUser = null;

// System settings (autocadastro / grupo padrão)
let appSettings = { allowSelfRegister: false, defaultGroupId: null };

// Audit state
let _auditCtx = { entityType: null, entityId: null, entityName: null };
let _auditFilterMonth = null; // { year, month } ou null
let _auditCalYear = new Date().getFullYear();
let _auditPage = 0;
const _AUDIT_PAGE_SIZE = 10;

// Financial formatting
const fmtBRL = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Ranking state
const rankSortState = {};
const rankData      = {};

// Name utilities
const _nameArticles = new Set(['da','do','das','dos','de','du','e']);

// Vaccine schema state (used in vaccine modal)
let _esquemas = []; // [{minAnos, minMeses, maxAnos, maxMeses, numDoses, intervalos}]
let _reforcos = []; // [{meses}] — até REFORCO_MAX reforços

// Discount state
let _descontoAtivo = false;   // há desconto aplicado?
let _valorCheio = '';         // valor cheio sem desconto (string mascarada)
let _descontoTab = 'pct';     // aba ativa: 'pct' | 'val'
let _cortesia = false;        // vacina gratuita por cortesia (não entra no faturamento)

// Pending action IDs
let pendingDeleteId = null;
let pendingDeletePatientId = null;
let _pendingDeleteUserId = null;
let pendingAgendarId = null;
let pendingConcluirId = null;

// Patient modal state
let _patientModalOpenedFromRecord = false;
let _patientModalOpenedFromHistory = false;

// Backup pending data
let pendingBackupData = null;

// CPNI import state
let cpniImunoMap = {}; // { [nomeImunobiologicoNormalizado]: vaccineId } — persistido no Firebase
let _cpniParsedRows = []; // linhas cruas parseadas da planilha, pendentes de revisão
let _cpniInvalidDoseMap = {}; // { [textoDoseOriginal]: doseCanonica } — resolvido na revisão, não persistido
let _cpniStep = 1;
let _cpniImportRunning = false;

// Permission labels
const PERM_LABELS = {
    agendar: 'Visualizar Agendamento', criar_agendamento: 'Agendar', aplicar: 'Aplicar', definir_feriados: 'Definir Feriados',
    adicionar_paciente: 'Adicionar Paciente', editar_paciente: 'Editar Paciente',
    leitura_estoque: 'Leitura do Estoque', criar_produtos: 'Criar Produtos',
    edicao_lotes: 'Edição de Lotes', edicao_movimentacao: 'Edição de Movimentação',
    baixar_pdf: 'Baixar PDF',
    ver_dashboard: 'Ver Dashboard', ver_dash_financeiro: 'Painel Financeiro', ver_agenda: 'Ver Agenda', ver_tabela: 'Ver Tabela', ver_pacientes: 'Ver Pacientes', ver_vacinas: 'Ver Vacinas', ver_configuracoes: 'Ver Configurações',
    excluir_agendamento: 'Excluir Agendamento', excluir_paciente: 'Excluir Paciente',
    excluir_produto: 'Excluir Produto', excluir_lote: 'Excluir Lote', excluir_movimentacao: 'Excluir Movimentação',
    criar_editar_usuarios: 'Criar/Editar Usuários', criar_editar_grupos: 'Criar/Editar Grupos',
    gerenciar_unidades: 'Gerenciar Unidades',
    backup: 'Função de Backup', alterar_propria_senha: 'Alterar Própria Senha'
};

// Estado do formulário de registro: marcador "Pago" do agendamento em edição.
let _regPago = false;
