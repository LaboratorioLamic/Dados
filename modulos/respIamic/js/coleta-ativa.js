// Sinalização de "coleta em andamento" — exclusiva da coleta domiciliar.
//
// É um estado à parte do status do agendamento (Agendado/Concluído/...):
// só indica que o coletador está no local, agora, coletando. Por isso vive
// num campo próprio (`coletaAtiva`) em vez de reaproveitar "Em andamento",
// que já tem outro significado (visita com pacientes parcialmente concluídos).

// Só faz sentido em agendas com endereço (coleta domiciliar) e enquanto a
// visita ainda tiver paciente pendente — igual à regra de Concluir/Ausente.
function _coletaAtivaDisponivel(app, agenda) {
    if (!temCampo('endereco', agenda)) return false;
    return resumoPacientes(app).pendentes > 0;
}

function toggleColetaAtiva() {
    const app = appointments.find(a => a.id == _viewRecordId);
    if (!app) return;

    const agenda = getAgenda(app.agendaId || currentAgendaId);
    if (!_coletaAtivaDisponivel(app, agenda)) return;

    const oldRecord = { ...app };
    const record = { ...app, coletaAtiva: !app.coletaAtiva };

    setAppointments(appointments.map(a => a.id == record.id ? record : a));
    persistirAgendamento(record, {
        rev: revDe(app),
        audit: { action: 'edit', oldRecord },
        mensagem: record.coletaAtiva
            ? 'Coleta iniciada — visita marcada como em andamento no local.'
            : 'Coleta pausada.'
    });

    // Reflete o novo estado em tudo que está na tela agora
    if (_viewRecordId === record.id) viewRecord(record.id);
    if (typeof renderTable === 'function') renderTable();
    if (typeof renderCalendar === 'function') renderCalendar();
    const dayModal = document.getElementById('modal-day-details');
    if (dayModal && dayModal.classList.contains('active')) {
        const dateStr = document.getElementById('day-details-date').innerText.split('/').reverse().join('-');
        openDayDetails(dateStr);
    }
}

// Aplica o estado visual (botão + tracejado do card) na janela de visualização.
// Chamado a partir de viewRecord() depois que o corpo já foi montado.
function _vwAplicarColetaAtiva(app, agenda) {
    const btn = document.getElementById('view-btn-coleta-ativa');
    const card = document.getElementById('view-card');
    if (!btn || !card) return;

    const disponivel = _coletaAtivaDisponivel(app, agenda);
    btn.classList.toggle('hidden', !disponivel);

    const ativa = disponivel && !!app.coletaAtiva;
    card.classList.toggle('coleta-ativa', ativa);

    btn.classList.toggle('view-btn-coleta-ativa-on', ativa);
    btn.innerHTML = ativa ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
    btn.title = ativa ? 'Pausar coleta' : 'Iniciar coleta';
    btn.setAttribute('aria-label', btn.title);
}
