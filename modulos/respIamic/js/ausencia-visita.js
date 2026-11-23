// Registro de ausência (falta / não comparecimento) a partir da visualização.
//
// Espelha a conclusão fracionada de concluir-visita.js: nas agendas com vários
// pacientes por visita marca-se quem faltou, e o status do agendamento passa a
// ser derivado dos pacientes.
//
// Diferença essencial em relação ao cancelamento: a ausência MANTÉM a vaga
// consumida na agenda. O horário foi perdido pela falta e não é reaproveitado —
// por isso `vagaLiberada()` só vale para o cancelamento.

let _ausenciaVisitaId = null;
// Rev do registro quando a janela foi aberta — ver revDe/persistirAgendamento.
let _ausenciaVisitaRev = null;

function abrirAusenciaVisita(id) {
    const app = appointments.find(a => a.id == (id != null ? id : _viewRecordId));
    if (!app) return;

    _ausenciaVisitaId = app.id;
    _ausenciaVisitaRev = revDe(app);

    const lista = document.getElementById('ausencia-lista');
    const pacientes = pacientesDaVisita(app);

    lista.innerHTML = pacientes.map(p => {
        const encerrado = pacienteEncerrado(p.status);
        const tema = p.status === 'Ausente'   ? 'border-amber-300 bg-amber-50'
                   : p.status === 'Concluído' ? 'border-green-200 bg-green-50'
                   : p.status === 'Cancelado' ? 'border-slate-200 bg-slate-100'
                   : 'border-slate-200 bg-white';
        const selo = p.status === 'Ausente'   ? '<span class="text-[9px] font-black uppercase text-amber-700">Ausente</span>'
                   : p.status === 'Concluído' ? '<span class="text-[9px] font-black uppercase text-green-700">Concluído</span>'
                   : p.status === 'Cancelado' ? '<span class="text-[9px] font-black uppercase text-slate-500">Cancelado</span>'
                   : '<span class="text-[9px] font-black uppercase text-amber-600">Pendente</span>';

        // Concluídos e cancelados não entram: já têm desfecho próprio. Só quem
        // está pendente (ou já ausente, para poder desmarcar) é editável aqui.
        const bloqueado = encerrado && p.status !== 'Ausente';

        return `
        <label class="flex items-center gap-3 p-3 rounded-xl border ${tema} ${bloqueado ? 'opacity-60' : 'cursor-pointer'}">
            <input type="checkbox" class="ausencia-check h-4 w-4 accent-amber-500"
                data-indice="${p.indice}" ${p.status === 'Ausente' ? 'checked' : ''} ${bloqueado ? 'disabled' : ''}>
            <div class="flex-1 min-w-0">
                <div class="text-xs font-black uppercase text-navy-900 truncate">${_avEscape(p.nome)}${p.titular ? ' <span class="text-[9px] font-bold text-slate-400">(principal)</span>' : ''}</div>
                <div class="text-[10px] font-bold text-slate-400">${idadeLabel(p.idade) || '—'}${p.pedido ? ` · Pedido ${_avEscape(p.pedido)}` : ''}</div>
            </div>
            ${selo}
        </label>`;
    }).join('');

    const pendentes = pacientes.filter(p => !pacienteEncerrado(p.status)).length;
    document.getElementById('ausencia-resumo').textContent =
        `${pendentes} paciente${pendentes === 1 ? '' : 's'} pendente${pendentes === 1 ? '' : 's'} nesta visita`;

    document.getElementById('ausencia-comentario').value = '';

    document.getElementById('modal-view-record').classList.remove('active');
    document.getElementById('modal-ausencia-visita').classList.add('active');
}

function fecharAusenciaVisita() {
    document.getElementById('modal-ausencia-visita').classList.remove('active');
    _ausenciaVisitaId = null;
}

function marcarTodosAusenciaVisita() {
    document.querySelectorAll('#modal-ausencia-visita .ausencia-check:not(:disabled)')
        .forEach(c => { c.checked = true; });
}

function confirmarAusenciaVisita() {
    const app = appointments.find(a => a.id == _ausenciaVisitaId);
    if (!app) return fecharAusenciaVisita();

    const marcados = {};
    document.querySelectorAll('#modal-ausencia-visita .ausencia-check').forEach(c => {
        marcados[c.dataset.indice] = c.checked;
    });

    const algum = Object.values(marcados).some(Boolean);
    if (!algum) {
        showNotification('Selecione ao menos um paciente ausente.', 'error');
        return;
    }

    const justificativa = document.getElementById('ausencia-comentario').value.trim();

    const oldRecord = { ...app, acompanhantes: (app.acompanhantes || []).map(a => ({ ...a })) };

    // Só mexe em quem ainda não tem outro desfecho — concluído e cancelado
    // continuam intocados; desmarcar devolve o paciente para "Agendado".
    const acompanhantes = (app.acompanhantes || []).map((a, i) => {
        const st = statusPaciente(a);
        if (st === 'Concluído' || st === 'Cancelado') return { ...a };
        return { ...a, status: marcados[i] ? 'Ausente' : 'Agendado' };
    });

    const record = { ...app, acompanhantes };
    if (app.status !== 'Concluído' && app.status !== 'Cancelado') {
        record.status = marcados['-1'] ? 'Ausente' : 'Agendado';
    }
    record.status = statusDerivadoDaVisita(record);
    record.chkConcluido = record.status === 'Concluído';

    // Sem paciente pendente a visita deixa de estar "em coleta" no local
    if (!resumoPacientes(record).pendentes) record.coletaAtiva = false;

    // A justificativa entra nos comentários com carimbo de data e autor, sem
    // apagar o que já estava escrito — o histórico da visita é cumulativo.
    if (justificativa) {
        const carimbo = new Date().toLocaleDateString('pt-BR');
        const autor = currentUser?.fullName || currentUser?.username || 'sistema';
        const nota = `[Ausência · ${carimbo} · ${autor}] ${justificativa}`;
        record.comentarios = record.comentarios ? `${record.comentarios}\n${nota}` : nota;
    }

    setAppointments(appointments.map(a => a.id == record.id ? record : a));

    const r = resumoPacientes(record);
    persistirAgendamento(record, {
        rev: _ausenciaVisitaRev,
        audit: { action: 'edit', oldRecord },
        mensagem: r.ausentes === 1
            ? 'Ausência registrada para 1 paciente.'
            : `Ausência registrada para ${r.ausentes} pacientes.`
    });

    fecharAusenciaVisita();
    renderTable(); renderCalendar(); updateFilterDropdowns();
}

function _avEscape(v) {
    return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
