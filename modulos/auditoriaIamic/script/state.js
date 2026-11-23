// === ESTADO GLOBAL / VARIÁVEIS ===

    // Referências do Firebase Realtime Database
    var dataListener = null; // Listener para dados em tempo real
    var usersListener = null; // Listener para usuários em tempo real

    var failedAttempts = 0;
    var lockoutTimer = null;

    // --- DADOS E ESTADO (Iniciam vazios) ---
    var audits = [];
    var activities = [];
    var maintenances = [];
    var documents = [];
    var ocorrencias = [];      // Gestão de N/C — registros de ocorrências
    var rncItems = [];         // Gestão de N/C — Relatórios de Não Conformidade
    var users = [];            // usuários carregados do bin de usuários
    var currentuser = null;    // usuário atualmente logado

    // NOVO: Armazena o item original no momento da abertura do modal de edição
    var originalItem = null;

    // --- CORREÇÃO: ZERANDO ESTRUTURAS PRÉ-CADASTRADAS DE STATUS ---
    var defaultMasterLists = {
        // Listas Principais (Limpas)
        setores: [],
        auditCategorias: [],
        ativCategorias: [],
        mantCategorias: [],
        docCategorias: [],

        // Listas de Subcategorias/Itens (Limpas)
        auditSubcats: {},
        ativSubcats: {},
        mantItens: {},
        docSubcats: {},

        // Listas de Status: ZERADAS (Serão preenchidas via interface/API)
        // Se estiverem vazias, o usuário deve criá-las via modal.
        auditStatus: [],
        ativStatus: [],
        mantStatus: [],
        docStatus: [],

        // Listas de Marcadores (objetos { name, color })
        auditMarcadores: [],
        ativMarcadores: [],
        mantMarcadores: [],
        docMarcadores: [],

        // Lista de Tipos para Manutenção
        mantTipos: [],

        // Lista de Responsáveis
        responsaveis: [],

        // Gestão de N/C — Ocorrências
        ncTipos: [],         // [{ id, name }]  — cada tipo é uma "sub-aba"
        ncCategorias: {},    // { [tipoId]: [{ id, name }] }
        ncMotivos: {},       // { [categoriaId]: [{ id, name }] }

        // Gestão de N/C — RNC
        rncOrigens: [],       // [{ id, name }]
        rncDetalhamentos: [], // [{ id, name }]
        rncStatus: [],        // [{ id, name }]  — usado no Kanban

        // Histórico de exclusões permanentes
        deletionHistory: [],

        // O unifiedStatusMap também será removido ou gerado dinamicamente para usar apenas os nomes das listas acima.
    };

    var masterLists = JSON.parse(JSON.stringify(defaultMasterLists)); // Clone inicial

    var kanbanOrder = {};   // ordem das colunas kanban (compartilhada entre todos os usuários)

    var currentTab = 'dashboard';
    var editingAuditId = null;
    var editingAtivId = null;
    var editingMantId = null;
    var editingDocId = null;
    var currentListKey = null;
    var selectedColorTemp = 'default';
    var currentHistoryPage = 1; // NOVO: Para controle da paginação do histórico
    var currentViewItemId = null;   // ID do item atualmente aberto na visualização
    var currentViewTab = null;      // Aba do item atualmente aberto na visualização

    // Sub-aba da view Lista: 'cards' | 'table' | 'groups'
    var currentListSubtab = 'cards';
