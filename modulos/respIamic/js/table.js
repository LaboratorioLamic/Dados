// Tabela de agendamentos: filtros, paginação e renderização

// FILTROS E PAGINAÇÃO (TABELA)
function updateTableFilters() {
    tablePage = 1;
    renderTable();
}

function changePage(dir) {
    tablePage += dir;
    renderTable();
}

function renderTable() {
    const agenda = currentAgenda();
    const cores = agendaCores(agenda);
    const body = document.getElementById('table-body');
    const search = normalizeStr(document.getElementById('filter-search').value);
    const atendente = document.getElementById('filter-atendente').value;
    const substrato = document.getElementById('filter-substrato').value;
    const status = document.getElementById('filter-status').value;

    // Nas agendas domiciliares o 3º filtro passa a ser o Bairro
    const filtraPorBairro = temCampo('endereco', agenda);

    let filtered = appointments.filter(a => {
        const matchSearch = !search || normalizeStr(a.paciente).includes(search) || normalizeStr(a.pedido).includes(search);
        const matchAtendente = !atendente || a.atendente === atendente;
        const matchTerceiro = !substrato || (filtraPorBairro ? a.bairro === substrato : a.substrato === substrato);
        const matchStatus = !status || a.status === status;
        return matchSearch && matchAtendente && matchTerceiro && matchStatus;
    });

    filtered.sort((a,b) => b.id - a.id);

    const total = filtered.length;
    const totalPages = Math.ceil(total / itemsPerPage);
    const start = (tablePage - 1) * itemsPerPage;
    const pageData = filtered.slice(start, start + itemsPerPage);

    body.innerHTML = '';
    pageData.forEach(app => {
        const temaFaixa = temaFaixaEtaria(app, agenda);
        const isCanceled = app.status === 'Cancelado';
        const isComplete = app.status === 'Concluído';
        const isAbsent   = app.status === 'Ausente';
        const isChecklistComplete = agenda.checklist.every(item => !!app[CHECKLIST_ITENS[item].chave]);
        
        // Verifica se agendamento está atrasado
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const [year, month, day] = app.data.split('-').map(Number);
        const appointmentDate = new Date(year, month - 1, day);
        appointmentDate.setHours(0, 0, 0, 0);
        // Ausente já é desfecho: não conta como atrasado
        const isOverdue = appointmentDate < today && !pacienteEncerrado(app.status);

        // Concluído com checklist pendente: listrado verde/amarelo em vez do
        // verde sólido, para sinalizar a pendência sem impedir a conclusão.
        const isCompleteChecklistPendente = isComplete && !isChecklistComplete;

        let rowClass = 'hover:bg-slate-50';
        if (isOverdue) rowClass = 'bg-red-50 hover:bg-red-100';
        else if (isAbsent) rowClass = 'bg-amber-50 hover:bg-amber-100';
        else if (isCanceled) rowClass = 'opacity-60 bg-slate-50';
        else if (isCompleteChecklistPendente) rowClass = 'checklist-pendente-stripes hover:brightness-95';
        else if (isComplete) rowClass = 'bg-green-50 hover:bg-green-100';
        else if (temaFaixa) rowClass = `${temaFaixa.bg} hover:brightness-95`;
        else rowClass = `${cores.bg} hover:brightness-95`; // Agendado normal

        const tr = document.createElement('tr');
        tr.className = `transition-colors group ${rowClass}`;

        const exameColor = app.exame === 'TRESP' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800';
        
        const statusIcon = isOverdue ? '<div class="h-8 w-8 mx-auto rounded-full flex items-center justify-center bg-red-100 text-red-600" title="Atrasado"><i class="fas fa-exclamation-triangle"></i></div>' :
                           isCompleteChecklistPendente ? '<div class="h-8 w-8 mx-auto rounded-full flex items-center justify-center" title="Concluído com checklist pendente"><i class="fas fa-triangle-exclamation text-yellow-500 text-lg"></i></div>' :
                           app.status === 'Concluído' ? '<div class="h-8 w-8 mx-auto rounded-full flex items-center justify-center bg-green-100 text-green-600" title="Concluído"><i class="fas fa-check-double"></i></div>' :
                           app.status === 'Ausente' ? '<div class="h-8 w-8 mx-auto rounded-full flex items-center justify-center bg-amber-100 text-amber-700" title="Paciente ausente"><i class="fas fa-user-xmark"></i></div>' :
                           app.status === 'Cancelado' ? '<div class="h-8 w-8 mx-auto rounded-full flex items-center justify-center bg-red-100 text-red-600" title="Cancelado"><i class="fas fa-ban"></i></div>' :
                           app.status === 'Em andamento' ? '<div class="h-8 w-8 mx-auto rounded-full flex items-center justify-center bg-purple-100 text-purple-600" title="Em andamento"><i class="fas fa-spinner"></i></div>' :
                           '<div class="h-8 w-8 mx-auto rounded-full flex items-center justify-center bg-yellow-100 text-yellow-600" title="Agendado"><i class="fas fa-clock"></i></div>';
        
        const checklistIcon = isChecklistComplete 
            ? '<div class="h-8 w-8 mx-auto rounded-full flex items-center justify-center bg-blue-100 text-blue-600" title="Checklist Completo"><i class="fas fa-clipboard-check"></i></div>' 
            : '<div class="h-8 w-8 mx-auto rounded-full flex items-center justify-center bg-slate-100 text-slate-400" title="Checklist Incompleto"><i class="fas fa-clipboard-list"></i></div>';
        
        tr.innerHTML = `
            <td class="p-5">
                <div class="font-black text-navy-900 ${isCanceled ? 'line-through' : ''}">${app.data.split('-').reverse().join('/')}</div>
                <div class="text-[10px] text-slate-500 font-bold uppercase">${app.horaInicio} - ${app.horaFim}</div>
            </td>
            <td class="p-5">
                <div class="font-bold text-slate-700 uppercase text-xs flex items-center gap-2 ${isCanceled ? 'line-through' : ''}">
                    ${app.paciente} ${extraPacientesLabel(app) ? `<span class="bg-navy-900 text-white text-[8px] px-1.5 rounded-full" title="${nomesPacientes(app).join(', ')}">${extraPacientesLabel(app)}</span><span class="bg-slate-200 text-slate-700 text-[8px] px-1.5 rounded-full" title="Pacientes concluídos">${progressoPacientesLabel(app)}</span>` : ''}${isOverdue ? '<span class="bg-red-600 text-white text-[8px] px-1 rounded"><i class="fas fa-exclamation-triangle mr-1"></i>ATRASADO</span>' : ''} ${temaFaixa && !isComplete && !isCanceled ? `<span class="${temaFaixa.badge} text-white text-[8px] px-1 rounded">${temaFaixa.rotulo}</span>` : ''}
                </div>
                <div class="text-[10px] text-slate-400 font-bold">${idadeLabel(app.idade)}</div>
            </td>
            <td class="p-5 ${temCampo('exame', agenda) ? '' : 'hidden'}">
                <span class="px-2 py-1 rounded text-[9px] font-black uppercase border ${exameColor}">${app.exame || '—'}</span>
                <div class="text-[10px] font-bold text-slate-600 mt-1 uppercase">${app.substrato || ''}${app.metano === 'Sim' ? ' (metano)' : ''}</div>
            </td>
            <td class="p-5 ${temCampo('abstinencia', agenda) ? '' : 'hidden'}">
                <div class="font-black text-slate-600 text-xs">${app.abstinencia != null ? `${app.abstinencia} dia${app.abstinencia === 1 ? '' : 's'}` : '—'}</div>
            </td>
            <td class="p-5 ${temCampo('endereco', agenda) ? '' : 'hidden'}">
                <div class="font-bold text-slate-700 text-xs">${[app.logradouro, app.numero].filter(Boolean).join(', ') || '—'}${app.complemento ? ` <span class="text-slate-400 font-normal">(${app.complemento})</span>` : ''}</div>
                <div class="text-[10px] text-slate-400 font-bold uppercase">${[app.bairro, app.cidade].filter(Boolean).join(' · ')}</div>
                ${app.distante ? `<div class="mt-1"><span class="inline-flex items-center gap-1 ${DISTANTE_TEMA.badge} text-white text-[8px] font-black px-1.5 py-0.5 rounded uppercase"><i class="fas ${DISTANTE_TEMA.icon}"></i>${DISTANTE_TEMA.rotulo}</span></div>` : ''}
                ${app.pontoReferencia ? `<div class="text-[10px] text-slate-400 mt-0.5"><i class="fas fa-location-dot mr-1"></i>${app.pontoReferencia}</div>` : ''}
            </td>
            <td class="p-5 ${temCampo('coletador', agenda) ? '' : 'hidden'}">
                <div class="text-[10px] font-bold text-slate-600 uppercase">${app.coletador ? formatAtendenteName(app.coletador) : '—'}</div>
                ${app.coletadorAuxiliar ? `<div class="text-[9px] font-bold text-slate-400 uppercase mt-0.5"><i class="fas fa-user-plus mr-1"></i>${formatAtendenteName(app.coletadorAuxiliar)}</div>` : ''}
            </td>
            <td class="p-5">
                <div class="font-black text-slate-600 text-xs">${app.pedido}</div>
                <div class="text-[10px] text-slate-400"><i class="fas fa-user-circle mr-1"></i>${app.atendente}</div>
            </td>
            <td class="p-5 text-center">
                ${checklistIcon}
            </td>
            <td class="p-5 text-center">
                ${statusIcon}
            </td>
            <td class="p-5">
                <div class="flex justify-center gap-2">
                    <a href="https://wa.me/55${app.contato.replace(/\D/g, '')}" target="_blank" class="h-8 w-8 rounded-lg flex items-center justify-center text-green-500 border border-green-200 hover:bg-green-500 hover:text-white transition-all"><i class="fab fa-whatsapp"></i></a>
                    <button onclick="openObsModal(${app.id})" class="h-8 w-8 rounded-lg flex items-center justify-center ${app.comentarios ? 'bg-blue-50 text-blue-600 border border-blue-200' : 'text-slate-400 hover:bg-slate-100'} transition-all"><i class="fas fa-comment"></i></button>
                    <button onclick="viewRecord(${app.id})" title="Visualizar" class="h-8 w-8 rounded-lg flex items-center justify-center text-blue-600 border border-blue-200 hover:bg-blue-600 hover:text-white transition-all"><i class="fas fa-eye"></i></button>
                    <button onclick="editRecord(${app.id})" title="Editar" class="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 border border-slate-100 hover:bg-navy-900 hover:text-white transition-all"><i class="fas fa-edit"></i></button>
                    ${isAdmin() ? `<button onclick="deleteRecord(${app.id})" class="h-8 w-8 rounded-lg flex items-center justify-center text-red-500 border border-red-200 hover:bg-red-500 hover:text-white transition-all"><i class="fas fa-trash"></i></button>` : ''}
                </div>
            </td>
        `;
        body.appendChild(tr);
    });

    document.getElementById('pagination-info').innerText = `Mostrando ${total === 0 ? 0 : start + 1} a ${Math.min(start + itemsPerPage, total)} de ${total}`;
    document.querySelectorAll('button[onclick^="changePage"]').forEach((btn, idx) => {
        if(idx === 0) btn.disabled = tablePage === 1;
        else btn.disabled = tablePage >= totalPages || total === 0;
    });
}
