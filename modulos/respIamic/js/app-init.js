// Inicialização da aplicação e listeners em tempo real

// Versão da build carregada. Vem do `?v=` do próprio <script> no index.html,
// então denuncia na hora um navegador servindo arquivo antigo do cache: se este
// log não bater com o `?v=` publicado, é cache — não bug de dados.
function _versaoCarregada() {
    const atual = document.currentScript || Array.from(document.scripts).find(s => (s.src || '').includes('app-init.js'));
    const m = /[?&]v=([^&]*)/.exec((atual && atual.src) || '');
    return m ? m[1] : 'sem-versao';
}
const APP_VERSION = _versaoCarregada();

// INICIALIZAÇÃO
function iniciarApp() {
    console.log(`AgendaLAMIC — build ${APP_VERSION}`);
    loadAtendentes();
    applyAgendaConfig();
    loadAppointmentsFromFirebase();
    loadMotivosPerdaFromFirebase();
    setupHolidaysRealtimeListener();
    setupBlockedSlotsRealtimeListener();
    setupAuditLogRealtimeListener();

    // Verificar sincronização inicial após carregar
    setTimeout(() => {
        syncLocalStorageToFirebase();
    }, 2000);

    // Listener em tempo real por agenda — Firebase sempre tem prioridade
    AGENDA_IDS.forEach(agendaId => {
        const agenda = getAgenda(agendaId);
        database.ref(`${agenda.fbPath}/appointments`).on('value', (snapshot) => {
            const lista = _toAppointmentList(snapshot.val());
            setAppointments(lista, agendaId);
            // Cota estourada / navegação anônima não podem derrubar o listener:
            // sem o backup local a tela continua funcionando (ver _gravarBackupLocal).
            _gravarBackupLocal(agenda.lsKey, lista);

            renderHomeCards();
            if (agendaId === currentAgendaId) {
                renderTable();
                renderCalendar();
                updateDatalists();
                updateFilterDropdowns();
            }
            console.log(`Agenda '${agendaId}' sincronizada do Firebase (${lista.length} registros).`);
        });
    });
};

// Sessão do Dados LAMIC primeiro; os listeners do banco só ligam depois do login.
window.onload = () => iniciarComDados(iniciarApp);
