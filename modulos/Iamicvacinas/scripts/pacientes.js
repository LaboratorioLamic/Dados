// ─── PATIENT MANAGEMENT (from index.html lines ~3969-4491) ───────────────────

const PATIENTS_PAGE_SIZE = 20;
let patientsCurrentPage = 1;

// Alerta do paciente (dados incompletos / sem WhatsApp).
// sizeClass ajusta tamanho conforme o contexto; withLabel mostra a descrição ao lado do ícone.
function patientAlertBadge(p, sizeClass = 'h-6 w-6 text-xs', withLabel = false) {
    if (!p) return '';
    let label = '', style = '';
    let pulse = '';
    if (p.dadosIncompletos) {
        label = 'Cadastro incompleto';
        style = 'background:#fee2e2;color:#dc2626';
        pulse = ' animate-pulse';
    } else if (!p.contato) {
        label = 'Sem WhatsApp cadastrado';
        style = 'background:#fef3c7;color:#d97706';
    } else {
        return '';
    }
    const title = p.dadosIncompletos ? 'Cadastro incompleto — cadastre o responsável' : 'Sem número de WhatsApp cadastrado';
    if (!withLabel) {
        return `<span title="${title}" class="rounded-md inline-flex items-center justify-center shrink-0 ${sizeClass}${pulse}" style="${style}"><i class="fas fa-triangle-exclamation"></i></span>`;
    }
    return `<span title="${title}" class="rounded-md inline-flex items-center gap-1.5 px-2 py-0.5 shrink-0 font-black uppercase tracking-wider ${sizeClass}${pulse}" style="${style}"><i class="fas fa-triangle-exclamation"></i>${label}</span>`;
}

function renderPatients(resetPage = true) {
    const btnNovoPac = document.getElementById('btn-novo-paciente');
    if (btnNovoPac) btnNovoPac.style.display = (currentUser && (isCurrentUserAdmin() || hasPerm('adicionar_paciente'))) ? '' : 'none';
    const s = normalizeStr(document.getElementById('filter-patient').value);
    const grid = document.getElementById('patients-grid');
    grid.innerHTML = '';

    if (resetPage) patientsCurrentPage = 1;

    const filtered = patients.filter(p => normalizeStr(p.nome).includes(s) || normalizeStr(p.cpf).includes(s))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

    const totalPages = Math.max(1, Math.ceil(filtered.length / PATIENTS_PAGE_SIZE));
    if (patientsCurrentPage > totalPages) patientsCurrentPage = totalPages;

    const startIdx = (patientsCurrentPage - 1) * PATIENTS_PAGE_SIZE;
    const pageItems = filtered.slice(startIdx, startIdx + PATIENTS_PAGE_SIZE);

    pageItems.forEach(p => {
        const age = getAgeDisplay(p.dtNasc);
        const hasAppointments = appointments.some(a => a.patientId == p.id);

        grid.innerHTML += `<div class="bg-white border border-slate-200 p-3 rounded-xl shadow-sm hover:shadow-md transition relative flex flex-col gap-2 group">
            <div class="absolute top-2 right-2 flex items-center gap-1">
                ${patientAlertBadge(p)}
                ${permBtn('editar_paciente', `<button onclick="editPatient(${p.id})" class="text-slate-300 hover:text-clinic-600 transition text-xs" title="Editar"><i class="fas fa-pen"></i></button>`)}
                ${!hasAppointments ? permBtn('excluir_paciente', `<button onclick="deletePatient(${p.id})" class="text-slate-300 hover:text-red-500 transition text-xs" title="Excluir"><i class="fas fa-trash"></i></button>`) : ''}
            </div>
            <div class="flex items-center gap-2 pr-10">
                <div class="h-9 w-9 shrink-0 bg-gradient-to-br from-navy-800 to-navy-600 text-white rounded-full flex items-center justify-center font-black text-base shadow">${p.nome.charAt(0)}</div>
                <div class="min-w-0">
                    <h4 class="font-black text-navy-900 text-xs leading-tight truncate">${p.nome}</h4>
                    <p class="text-[9px] font-bold text-slate-400 truncate">${age} | ${p.cpf}</p>
                </div>
            </div>
            <div class="text-[9px] text-slate-500 font-bold space-y-0.5">
                <p class="flex items-center gap-1 truncate"><i class="fab fa-whatsapp text-green-500"></i>${p.contato}</p>
                ${p.responsavel ? `<p class="flex items-center gap-1 truncate"><i class="fas fa-user-shield text-slate-300"></i>Resp: ${p.responsavel}${p.responsavelParentesco ? ` <span class="bg-slate-100 px-1 rounded text-[8px] uppercase font-black text-slate-400">${p.responsavelParentesco}</span>` : ''}</p>` : ''}
            </div>
            <div class="flex gap-1 mt-auto pt-2 border-t border-slate-100">
                <button onclick="viewPatientHistory(${p.id})" class="flex-1 flex items-center justify-center gap-1 bg-slate-50 hover:bg-clinic-50 hover:text-clinic-600 px-2 py-1.5 rounded-lg transition border border-slate-100 text-[9px] font-black uppercase text-navy-900">
                    <i class="fas fa-file-medical-alt text-clinic-500"></i>Prontuário
                </button>
                ${permBtn('criar_agendamento', `<button onclick="openRecordModalWithPatient(${p.id})" class="flex-1 border border-clinic-600 text-clinic-600 hover:bg-clinic-600 hover:text-white font-black py-1.5 rounded-lg text-[9px] uppercase tracking-wide transition"><i class="fas fa-plus mr-1"></i>Agendar</button>`)}
            </div>
        </div>`;
    });

    renderPatientsPagination(filtered.length, totalPages);
}

function renderPatientsPagination(totalItems, totalPages) {
    const wrap = document.getElementById('patients-pagination');
    const info = document.getElementById('patients-page-info');
    const btnsWrap = document.getElementById('patients-page-buttons');

    if (totalItems <= PATIENTS_PAGE_SIZE) {
        wrap.classList.add('hidden');
        return;
    }
    wrap.classList.remove('hidden');

    const startIdx = (patientsCurrentPage - 1) * PATIENTS_PAGE_SIZE;
    const endIdx = Math.min(startIdx + PATIENTS_PAGE_SIZE, totalItems);
    info.textContent = `${startIdx + 1}–${endIdx} de ${totalItems}`;

    const pageBtnClass = (active) => active
        ? 'h-8 min-w-[2rem] px-2.5 bg-clinic-600 text-white rounded-lg text-xs font-black shadow transition'
        : 'h-8 min-w-[2rem] px-2.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-black hover:bg-slate-100 transition';

    let html = `<button onclick="goToPatientsPage(${patientsCurrentPage - 1})" ${patientsCurrentPage === 1 ? 'disabled' : ''} class="h-8 px-3 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-black hover:bg-slate-100 transition disabled:opacity-40 disabled:cursor-not-allowed"><i class="fas fa-chevron-left"></i></button>`;

    const pages = [];
    const addRange = (from, to) => { for (let i = from; i <= to; i++) pages.push(i); };
    if (totalPages <= 7) {
        addRange(1, totalPages);
    } else if (patientsCurrentPage <= 4) {
        addRange(1, 5); pages.push('...'); pages.push(totalPages);
    } else if (patientsCurrentPage >= totalPages - 3) {
        pages.push(1); pages.push('...'); addRange(totalPages - 4, totalPages);
    } else {
        pages.push(1); pages.push('...'); addRange(patientsCurrentPage - 1, patientsCurrentPage + 1); pages.push('...'); pages.push(totalPages);
    }

    pages.forEach(p => {
        if (p === '...') {
            html += `<span class="h-8 min-w-[2rem] flex items-center justify-center text-slate-300 text-xs font-black">…</span>`;
        } else {
            html += `<button onclick="goToPatientsPage(${p})" class="${pageBtnClass(p === patientsCurrentPage)}">${p}</button>`;
        }
    });

    html += `<button onclick="goToPatientsPage(${patientsCurrentPage + 1})" ${patientsCurrentPage === totalPages ? 'disabled' : ''} class="h-8 px-3 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-black hover:bg-slate-100 transition disabled:opacity-40 disabled:cursor-not-allowed"><i class="fas fa-chevron-right"></i></button>`;

    btnsWrap.innerHTML = html;
}

function goToPatientsPage(page) {
    patientsCurrentPage = page;
    renderPatients(false);
}

function openPatientModal(id = null) {
    if (id && !checkPerm('editar_paciente')) return;
    if (!id && !checkPerm('adicionar_paciente')) return;
    _patientModalOpenedFromRecord = document.getElementById('modal-record').classList.contains('active');
    _patientModalOpenedFromHistory = document.getElementById('modal-patient-history').classList.contains('active');
    if (_patientModalOpenedFromHistory) document.getElementById('modal-paciente').style.zIndex = '130';
    document.getElementById('paciente-form').reset(); document.getElementById('pac-id').value = '';
    document.getElementById('div-pac-resp').style.display = 'none';
    if(id) {
        const p = patients.find(x=>x.id==id);
        if(p){
            document.getElementById('pac-id').value = p.id; document.getElementById('pac-nome').value = p.nome;
            document.getElementById('pac-cpf').value = p.cpf; document.getElementById('pac-dtnasc').value = p.dtNasc;
            document.getElementById('pac-contato').value = formatPhone(p.contato); document.getElementById('pac-responsavel').value = p.responsavel || '';
            document.getElementById('pac-resp-cpf').value = p.responsavelCPF || '';
            document.getElementById('pac-resp-parentesco').value = p.responsavelParentesco || '';
            document.getElementById('pac-genero').value = p.genero || '';
            checkUnderage();
        }
    }
    document.getElementById('modal-paciente').classList.add('active');
}

function closePatientModal() {
    document.getElementById('modal-paciente').classList.remove('active');
    document.getElementById('modal-paciente').style.removeProperty('z-index');
    if (_patientModalOpenedFromRecord) {
        document.getElementById('modal-record').classList.add('active');
    }
    _patientModalOpenedFromHistory = false;
}

function editPatient(id) { openPatientModal(id); }

function deletePatient(id) {
    if (!checkPerm('excluir_paciente')) return;
    const p = patients.find(x => x.id == id);
    if (!p) return;
    if (appointments.some(a => a.patientId == id)) {
        showNotification('Paciente possui agendamentos e não pode ser excluído.', 'error');
        return;
    }
    pendingDeletePatientId = id;
    document.getElementById('delete-patient-info').textContent = p.nome + ' | ' + p.cpf;
    document.getElementById('delete-patient-input').value = '';
    checkDeletePatientConfirm();
    document.getElementById('modal-delete-patient').classList.add('active');
}

function checkDeletePatientConfirm() {
    const val = document.getElementById('delete-patient-input').value;
    const btn = document.getElementById('btn-confirm-delete-patient');
    if (val.toUpperCase() === 'SIM') {
        btn.disabled = false;
        btn.className = 'flex-1 bg-red-600 text-white font-black py-3 rounded-xl uppercase text-xs transition hover:bg-red-700 cursor-pointer';
    } else {
        btn.disabled = true;
        btn.className = 'flex-1 bg-red-200 text-red-400 font-black py-3 rounded-xl uppercase text-xs transition cursor-not-allowed';
    }
}

function confirmDeletePatient() {
    if (!pendingDeletePatientId) return;
    const delPac = patients.find(x => x.id == pendingDeletePatientId);
    logAudit('Excluído', 'paciente', pendingDeletePatientId, delPac ? delPac.nome : '—', delPac ? `CPF: ${delPac.cpf}` : null);
    patients = patients.filter(x => x.id != pendingDeletePatientId);
    pendingDeletePatientId = null;
    saveAll();
    document.getElementById('modal-delete-patient').classList.remove('active');
    document.getElementById('delete-patient-input').value = '';
    renderPatients();
    showNotification('Paciente excluído com sucesso.', 'success');
}

function viewPatientHistory(id) {
    const p = patients.find(x=>x.id==id);
    if(!p) return;
    document.getElementById('modal-patient-history').dataset.patientId = id;
    document.getElementById('hist-patient-name').innerText = p.nome;
    document.getElementById('hist-patient-avatar').innerText = p.nome.charAt(0).toUpperCase();

    const idade = getAgeDisplay(p.dtNasc);
    const dtNascFmt = p.dtNasc ? p.dtNasc.split('-').reverse().join('/') : '—';
    const waLink = `https://wa.me/55${formatWa(p.contato || '')}`;

    document.getElementById('hist-patient-badges').innerHTML = `
        ${patientAlertBadge(p, 'text-[9px]', true)}
        <span class="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full"><i class="fas fa-birthday-cake text-[8px]"></i>${idade}</span>
        ${p.genero ? `<span class="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full"><i class="fas ${p.genero === 'Feminino' ? 'fa-venus' : 'fa-mars'} text-[8px]"></i>${p.genero}</span>` : ''}
    `;

    document.getElementById('hist-patient-grid').innerHTML = `
        <div class="bg-white border border-slate-200 rounded-xl p-2.5">
            <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5"><i class="fas fa-id-card mr-1 text-clinic-500"></i>CPF</p>
            <p class="text-xs font-black text-navy-900 truncate">${p.cpf || '—'}</p>
        </div>
        <div class="bg-white border border-slate-200 rounded-xl p-2.5">
            <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5"><i class="fas fa-cake-candles mr-1 text-clinic-500"></i>Nascimento</p>
            <p class="text-xs font-black text-navy-900 truncate">${dtNascFmt}</p>
        </div>
        <div class="col-span-2 bg-white border border-slate-200 rounded-xl p-2.5 flex items-center justify-between gap-2">
            <div class="min-w-0">
                <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5"><i class="fas fa-phone mr-1 text-clinic-500"></i>Contato</p>
                <p class="text-xs font-black text-navy-900 truncate">${formatPhone(p.contato || '')}</p>
            </div>
            <a href="${waLink}" target="_blank" title="Abrir WhatsApp" class="shrink-0 h-8 w-8 rounded-lg bg-green-50 hover:bg-green-500 border border-green-200 text-green-600 hover:text-white flex items-center justify-center transition"><i class="fab fa-whatsapp"></i></a>
        </div>
    `;

    const respEl = document.getElementById('hist-patient-resp');
    if (p.responsavel) {
        respEl.classList.remove('hidden');
        respEl.innerHTML = `
            <p class="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1"><i class="fas fa-user-shield mr-1"></i>Responsável</p>
            <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
                <p class="text-xs font-black text-navy-900">${p.responsavel}</p>
                ${p.responsavelParentesco ? `<span class="text-[9px] font-black uppercase text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full">${p.responsavelParentesco}</span>` : ''}
                ${p.responsavelCPF ? `<span class="text-[11px] font-bold text-slate-500"><i class="fas fa-id-card mr-1 text-slate-400"></i>${p.responsavelCPF}</span>` : ''}
            </div>
        `;
    } else {
        respEl.classList.add('hidden');
        respEl.innerHTML = '';
    }

    const btnAgendar = document.getElementById('btn-agendar-prontuario');
    btnAgendar.style.display = (isCurrentUserAdmin() || hasPerm('criar_agendamento')) ? '' : 'none';

    const btnEditar = document.getElementById('btn-editar-prontuario');
    btnEditar.style.display = (isCurrentUserAdmin() || hasPerm('editar_paciente')) ? '' : 'none';

    const list = document.getElementById('patient-history-list');
    const apps = appointments.filter(a=>a.patientId==id).sort((a,b)=>new Date(b.data)-new Date(a.data));

    if(apps.length === 0) {
        list.innerHTML = '<div class="text-center py-10"><i class="fas fa-folder-open text-4xl text-slate-200 mb-3"></i><p class="text-sm text-slate-400 font-bold uppercase">Nenhum registro encontrado</p></div>';
    } else {
        const pendentes   = apps.filter(a => a.status === 'Agendado' || a.status === 'Em negociação' || a.status === 'Nova oportunidade');
        const concluidos  = apps.filter(a => a.status === 'Aplicado');
        const outroLocal  = apps.filter(a => a.status === 'Perdido' && a.aplicadaOutroLocal);
        const outraVacina = apps.filter(a => a.status === 'Perdido' && !a.aplicadaOutroLocal && a.outraVacina);
        const cancelados  = apps.filter(a => a.status === 'Perdido' && !a.aplicadaOutroLocal && !a.outraVacina);

        let html = '';

        if(pendentes.length > 0) {
            html += `<h5 class="text-xs font-black text-slate-500 uppercase tracking-widest mb-3"><i class="fas fa-clock mr-1 text-yellow-500 text-sm"></i> Pendentes / Futuros <span class="ml-2 bg-slate-100 px-2 py-0.5 rounded text-[9px]">${pendentes.length}</span></h5>`;
            html += pendentes.map(a => renderHistCard(a)).join('');
            html += `<div class="mb-6"></div>`;
        }

        if(concluidos.length > 0) {
            html += `<h5 class="text-xs font-black text-slate-500 uppercase tracking-widest mb-3"><i class="fas fa-check-circle mr-1 text-green-500 text-sm"></i> Vacinas Aplicadas <span class="ml-2 bg-slate-100 px-2 py-0.5 rounded text-[9px]">${concluidos.length}</span></h5>`;
            html += concluidos.map(a => renderHistCard(a)).join('');
            html += `<div class="mb-6"></div>`;
        }

        if(outroLocal.length > 0) {
            html += `<h5 class="text-xs font-black text-slate-500 uppercase tracking-widest mb-3"><i class="fas fa-map-marker-alt mr-1 text-violet-500 text-sm"></i> Aplicado em Outro Local <span class="ml-2 bg-slate-100 px-2 py-0.5 rounded text-[9px]">${outroLocal.length}</span></h5>`;
            html += outroLocal.map(a => renderHistCard(a)).join('');
            html += `<div class="mb-6"></div>`;
        }

        if(outraVacina.length > 0) {
            html += `<h5 class="text-xs font-black text-slate-500 uppercase tracking-widest mb-3"><i class="fas fa-syringe mr-1 text-cyan-500 text-sm"></i> Suprida por Outra Vacina <span class="ml-2 bg-slate-100 px-2 py-0.5 rounded text-[9px]">${outraVacina.length}</span></h5>`;
            html += outraVacina.map(a => renderHistCard(a)).join('');
            html += `<div class="mb-6"></div>`;
        }

        if(cancelados.length > 0) {
            html += `<h5 class="text-xs font-black text-slate-500 uppercase tracking-widest mb-3"><i class="fas fa-times-circle mr-1 text-red-500 text-sm"></i> Perdas / Faltas <span class="ml-2 bg-slate-100 px-2 py-0.5 rounded text-[9px]">${cancelados.length}</span></h5>`;
            html += cancelados.map(a => renderHistCard(a)).join('');
        }

        list.innerHTML = html;
    }

    if (typeof updateProntuarioContatoBadge === 'function') updateProntuarioContatoBadge(id);
    if (typeof switchProntuarioTab === 'function') switchProntuarioTab('info');

    document.getElementById('modal-patient-history').classList.add('active');
}

function renderHistCard(a) {
    const vac = vaccines.find(v=>v.id==a.vaccineId);
    if(!vac) return '';
    const todayStr = new Date().toISOString().split('T')[0];
    const isDelayed = a.data < todayStr && a.status === 'Agendado';
    const isOutroLocal = a.status === 'Perdido' && a.aplicadaOutroLocal;
    const isOutraVacina = a.status === 'Perdido' && !a.aplicadaOutroLocal && a.outraVacina;

    let borderClass, bgClass, stTextClass, iconClass;
    if (isOutroLocal) {
        borderClass = 'border-violet-200 hover:border-violet-400';
        bgClass     = 'bg-violet-50/50';
        stTextClass = 'text-violet-600';
        iconClass   = 'fa-map-marker-alt text-violet-500';
    } else if (isOutraVacina) {
        borderClass = 'border-cyan-200 hover:border-cyan-400';
        bgClass     = 'bg-cyan-50/50';
        stTextClass = 'text-cyan-600';
        iconClass   = 'fa-syringe text-cyan-500';
    } else if (a.status === 'Aplicado') {
        borderClass = 'border-green-200 hover:border-green-400';
        bgClass     = 'bg-green-50/50';
        stTextClass = 'text-green-600';
        iconClass   = 'fa-check text-green-500';
    } else if (a.status === 'Perdido') {
        borderClass = 'border-red-200 hover:border-red-400';
        bgClass     = 'bg-red-50/50';
        stTextClass = 'text-red-600';
        iconClass   = 'fa-ban text-red-500';
    } else if (a.status === 'Em negociação') {
        borderClass = 'border-cyan-200 hover:border-cyan-400';
        bgClass     = 'bg-cyan-50/50';
        stTextClass = 'text-cyan-600';
        iconClass   = 'fa-comments text-cyan-500';
    } else if (a.status === 'Nova oportunidade') {
        borderClass = 'border-slate-300 hover:border-slate-500';
        bgClass     = 'bg-slate-50/50';
        stTextClass = 'text-slate-500';
        iconClass   = 'fa-star text-slate-400';
    } else if (isDelayed) {
        borderClass = 'border-yellow-300 hover:border-yellow-500';
        bgClass     = 'bg-yellow-50/50';
        stTextClass = 'text-yellow-600';
        iconClass   = 'fa-exclamation-triangle text-yellow-500';
    } else {
        borderClass = 'border-blue-200 hover:border-blue-400';
        bgClass     = 'bg-blue-50/50';
        stTextClass = 'text-blue-600';
        iconClass   = 'fa-calendar-alt text-blue-500';
    }

    const statusLabel = isOutroLocal ? 'Outro Local' : isOutraVacina ? 'Outra Vacina' : isDelayed ? 'Atrasado' : a.status;
    const outroBadge  = isOutroLocal
        ? `<span class="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider bg-violet-100 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full ml-2"><i class="fas fa-map-marker-alt text-[8px]"></i> Outro local</span>`
        : isOutraVacina
        ? `<span class="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider bg-cyan-100 text-cyan-700 border border-cyan-200 px-2 py-0.5 rounded-full ml-2"><i class="fas fa-syringe text-[8px]"></i> Outra vacina</span>`
        : '';
    const cpniBadge = a.importedCPNI
        ? `<span title="Importado do CPNI" class="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full ml-2"><i class="fas fa-file-import text-[8px]"></i> CPNI</span>`
        : '';

    return `
    <button onclick="viewRecord(${a.id})" class="w-full text-left ${bgClass} p-4 rounded-xl border ${borderClass} shadow-sm hover:shadow-md transition flex flex-col md:flex-row justify-between items-start md:items-center mb-3 group">
        <div class="flex items-center gap-4 mb-2 md:mb-0">
            <div class="h-10 w-10 bg-white rounded-full flex justify-center items-center shadow-sm text-lg border border-slate-100 group-hover:scale-110 transition duration-300 relative">
                <i class="fas ${iconClass}"></i>
                ${a.importedCPNI ? `<span title="Importado do CPNI" class="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-emerald-500 text-white flex items-center justify-center border-2 border-white text-[7px]"><i class="fas fa-file-import"></i></span>` : ''}
            </div>
            <div>
                <p class="font-black text-navy-900 text-[15px] uppercase tracking-tight">${vac.nome}</p>
                <p class="text-[11px] text-slate-500 font-bold flex items-center flex-wrap gap-1">
                    ${a.doseAtual} <span class="mx-1">•</span> <span class="${stTextClass} uppercase tracking-wider">${statusLabel}</span>${outroBadge}${cpniBadge}
                </p>
            </div>
        </div>
        <div class="text-left md:text-right w-full md:w-auto flex flex-row md:flex-col justify-between items-center md:items-end">
            <p class="font-black text-slate-700 text-sm"><i class="fas fa-calendar-day mr-1 text-slate-400"></i> ${a.data.split('-').reverse().join('/')}${a.hora ? ' <span class="text-[10px] text-slate-400">'+a.hora+'</span>' : ''}</p>
            <span class="text-[9px] text-clinic-600 uppercase font-black bg-white px-2 py-1 rounded shadow-sm border border-clinic-100 group-hover:bg-clinic-600 group-hover:text-white transition mt-1">Ver Detalhes <i class="fas fa-arrow-right ml-1"></i></span>
        </div>
    </button>`;
}

function checkUnderage() {
    const age = getAge(document.getElementById('pac-dtnasc').value);
    const divResp = document.getElementById('div-pac-resp');
    const divRespCpf = document.getElementById('div-pac-resp-cpf');
    const divRespParentesco = document.getElementById('div-pac-resp-parentesco');
    const inResp = document.getElementById('pac-responsavel');
    const selParentesco = document.getElementById('pac-resp-parentesco');
    if(age < 18) {
        divResp.style.display = 'block'; divRespCpf.style.display = 'block'; divRespParentesco.style.display = 'block';
        inResp.required = true;
        selParentesco.required = true;
    } else {
        divResp.style.display = 'none'; divRespCpf.style.display = 'none'; divRespParentesco.style.display = 'none';
        inResp.required = false; inResp.value = '';
        document.getElementById('pac-resp-cpf').value = '';
        selParentesco.required = false;
        selParentesco.value = '';
    }
}

function savePatient(e) {
    e.preventDefault();
    const id = document.getElementById('pac-id').value;
    const p = {
        id: id ? Number(id) : Date.now(), nome: document.getElementById('pac-nome').value.toUpperCase(),
        cpf: document.getElementById('pac-cpf').value, dtNasc: document.getElementById('pac-dtnasc').value,
        genero: document.getElementById('pac-genero').value,
        contato: document.getElementById('pac-contato').value.replace(/\D/g,''), responsavel: document.getElementById('pac-responsavel').value.toUpperCase(),
        responsavelCPF: document.getElementById('pac-resp-cpf').value,
        responsavelParentesco: document.getElementById('pac-resp-parentesco').value
    };
    const isNewPac = !id;
    const oldPac = isNewPac ? null : patients.find(x => x.id == p.id);
    // Cadastro passou pelo formulário (que já exige responsável se menor de idade) — dados não estão mais incompletos.
    if (oldPac && oldPac.dadosIncompletos) p.dadosIncompletos = false;

    const dupCpf = p.cpf && patients.find(x => x.id != p.id && x.cpf === p.cpf);
    const dupNomeNasc = patients.find(x => x.id != p.id && normalizeStr(x.nome) === normalizeStr(p.nome) && x.dtNasc === p.dtNasc);
    if (dupCpf) {
        showDuplicatePatientBlock('Já existe um paciente cadastrado com este CPF.', `${dupCpf.nome} • ${dupCpf.cpf}`, dupCpf.id);
        return;
    }
    if (dupNomeNasc) {
        showDuplicatePatientBlock('Já existe um paciente cadastrado com este nome e data de nascimento.', `${dupNomeNasc.nome} • ${dupNomeNasc.dtNasc.split('-').reverse().join('/')}`, dupNomeNasc.id);
        return;
    }

    if(id) patients = patients.map(x=>x.id==p.id?p:x); else patients.push(p);
    const pacChanges = isNewPac ? null : computeChanges(oldPac, p, {nome:'Nome', cpf:'CPF', dtNasc:'Data Nasc.', genero:'Gênero', contato:'Contato', responsavel:'Responsável', responsavelCPF:'CPF Resp.', responsavelParentesco:'Parentesco'});
    logAudit(isNewPac ? 'Criado' : 'Editado', 'paciente', p.id, p.nome, isNewPac ? `CPF: ${p.cpf}` : null, pacChanges);
    const reopenRecord = _patientModalOpenedFromRecord;
    const reopenHistory = _patientModalOpenedFromHistory;
    saveAll(); renderPatients(); closeModals(); showNotification('Paciente salvo com sucesso!','success');
    populatePatientDatalist();
    if(reopenRecord) {
        document.getElementById('modal-record').classList.add('active');
        document.getElementById('reg-patient-search').value = `${p.cpf} - ${p.nome}`;
        autoFillPatient();
    }
    if(reopenHistory) {
        viewPatientHistory(p.id);
    }
}

async function downloadVaccineCalendarPDF() {
    if (!checkPerm('baixar_pdf')) return;
    const modal = document.getElementById('modal-patient-history');
    const id = Number(modal.dataset.patientId);
    const p = patients.find(x => x.id == id);
    if (!p) return;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = 210, H = 297;

    // ── Cores ──────────────────────────────────────────────────────────────────
    const navy    = [15, 23, 42];        // #0f172a
    const navyMid = [23, 37, 84];        // #172554
    const accent  = [37, 99, 235];       // #2563eb
    const white   = [255, 255, 255];
    const light   = [238, 242, 247];     // #eef2f7
    const border  = [226, 232, 240];    // slate-200

    // ── Logo do header (carregada uma vez, reaproveitada em toda página) ────────
    let headerLogo = null; // { dataUrl, lW, lH }
    try {
        const logoUrl = 'https://i.imgur.com/EIxKgPF.png';
        const img = await new Promise((res, rej) => {
            const i = new Image(); i.crossOrigin = 'anonymous';
            i.onload = () => res(i); i.onerror = rej;
            i.src = logoUrl;
        });
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img, 0, 0);
        const ratio = img.naturalWidth / img.naturalHeight;
        const lH = 24, lW = lH * ratio;
        headerLogo = { dataUrl: canvas.toDataURL('image/png'), lW, lH };
    } catch(e) { /* logo opcional */ }

    const hoje = new Date().toLocaleDateString('pt-BR', {day:'2-digit',month:'long',year:'numeric'});

    // Desenha o fundo da página + o header (faixa navy, logo, título, data) — chamado
    // na primeira página e novamente a cada doc.addPage(), pra repetir em todas.
    function drawPageHeader() {
        // ── Fundo ──────────────────────────────────────────────────────────────
        doc.setFillColor(...light);
        doc.rect(0, 0, W, H, 'F');

        // ── Header block ──────────────────────────────────────────────────────
        doc.setFillColor(...navy);
        doc.rect(0, 0, W, 42, 'F');

        // Barra accent lateral esquerda no header
        doc.setFillColor(...accent);
        doc.rect(0, 0, 6, 42, 'F');

        // Logo
        if (headerLogo) {
            const { dataUrl, lW, lH } = headerLogo;
            doc.addImage(dataUrl, 'PNG', W - lW - 14, (42 - lH) / 2 - 3, lW, lH);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6);
            doc.setTextColor(...white);
            const endY = (42 - lH) / 2 - 3 + lH + 3.5;
            doc.text('Rua Padre Cícero, 759 - Centro - Juazeiro do Norte - CE', W - lW - 14 + lW / 2, endY, { align: 'center' });
        }

        // Título no header
        doc.setTextColor(...white);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.text('CALENDÁRIO DE VACINAÇÃO', 14, 18);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...accent);
        doc.text('IMUNOGEST  •  REGISTRO VACINAL DO PACIENTE', 14, 25);

        // Linha separadora decorativa
        doc.setFillColor(...accent);
        doc.rect(14, 30, 60, 0.8, 'F');

        // Data de emissão
        doc.setTextColor(...white);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.text(`Emitido em: ${hoje}`, 14, 38);
    }

    drawPageHeader();

    // ── Card de dados do paciente ──────────────────────────────────────────────
    const cardY = 50;
    const col1x = 22, col2x = 115;
    const cardRightEdge = W - 16;

    // Nome do responsável pode ser longo — quebra em várias linhas dentro da largura da coluna 2
    // e cresce a altura do card conforme necessário, pra nunca estourar a borda.
    const respColW = cardRightEdge - col2x;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    const parentescoStr = p.responsavelParentesco ? ` (${p.responsavelParentesco})` : '';
    const responsavelLines = p.responsavel ? doc.splitTextToSize(p.responsavel, respColW) : [];
    const extraLinesResp = Math.max(0, responsavelLines.length - 1);
    const cardH = 48 + extraLinesResp * 4.2;

    doc.setFillColor(...white);
    doc.roundedRect(12, cardY, W - 24, cardH, 4, 4, 'F');
    doc.setDrawColor(...border);
    doc.setLineWidth(0.3);
    doc.roundedRect(12, cardY, W - 24, cardH, 4, 4, 'S');

    // Barra lateral esquerda accent no card
    doc.setFillColor(...navyMid);
    doc.roundedRect(12, cardY, 4, cardH, 2, 2, 'F');

    // Nome do paciente (grande)
    doc.setTextColor(...navy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(p.nome || '—', 22, cardY + 13);

    // Linha divisória fina
    doc.setDrawColor(...border);
    doc.setLineWidth(0.2);
    doc.line(22, cardY + 17, cardRightEdge, cardY + 17);

    // Dados em duas colunas
    const idade = getAgeDisplay(p.dtNasc);
    const dtFormatada = p.dtNasc ? p.dtNasc.split('-').reverse().join('/') : '—';
    const cpfFormatado = p.cpf ? p.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '—';

    const rowY1 = cardY + 26, rowY2 = cardY + 38;

    const label = (txt, x, y) => {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5);
        doc.setTextColor(...accent); doc.text(txt.toUpperCase(), x, y);
    };
    const value = (txt, x, y) => {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
        doc.setTextColor(...navy); doc.text(txt, x, y + 5);
    };

    label('Idade', col1x, rowY1);        value(idade, col1x, rowY1);
    label('Data de Nascimento', col2x, rowY1); value(dtFormatada, col2x, rowY1);
    label('CPF', col1x, rowY2);           value(cpfFormatado, col1x, rowY2);
    if (p.responsavel) {
        label(`Responsável${parentescoStr}`, col2x, rowY2);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...navy);
        doc.text(responsavelLines, col2x, rowY2 + 5, { maxWidth: respColW, lineHeightFactor: 1.15 });
    }

    // ── Tabela de Vacinas ──────────────────────────────────────────────────────
    const apps = appointments.filter(a => a.patientId == id && (a.status === 'Aplicado' || a.status === 'Agendado'));

    // Agrupar por vacina (nome) e ordenar alfabeticamente
    const grouped = {};
    apps.forEach(a => {
        const vac = vaccines.find(v => v.id == a.vaccineId);
        if (!vac) return;
        if (!grouped[vac.nome]) grouped[vac.nome] = [];
        grouped[vac.nome].push(a);
    });

    const sortedVaccines = Object.keys(grouped).sort((a, b) => a.localeCompare(b, 'pt-BR'));

    const rows = [];
    sortedVaccines.forEach(vacNome => {
        const doseRank = d => d === 'Dose Zero' ? -1 : (parseInt(d) || 0);
        const doses = grouped[vacNome].sort((a, b) => {
            const numA = doseRank(a.doseAtual), numB = doseRank(b.doseAtual);
            return numA !== numB ? numA - numB : a.doseAtual.localeCompare(b.doseAtual, 'pt-BR');
        });
        doses.forEach(a => {
            const loteObj = vaccineLots.find(l => l.vaccineId == (vaccines.find(v => v.nome === vacNome)?.id) && l.numero === a.lote);
            const fab = loteObj?.fabricante || '';
            const forn = loteObj?.fornecedor || '';
            rows.push([vacNome, fab, forn, a.doseAtual, a.lote || '—', a.data.split('-').reverse().join('/'), a.status]);
        });
    });

    const tableStartY = cardY + cardH + 8;

    // Título da seção
    doc.setFillColor(...navyMid);
    doc.roundedRect(12, tableStartY, W - 24, 9, 2, 2, 'F');
    doc.setTextColor(...white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('HISTÓRICO DE VACINAS', 18, tableStartY + 6);

    if (rows.length === 0) {
        doc.setTextColor(148, 163, 184);
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9);
        doc.text('Nenhuma vacina aplicada encontrada.', 18, tableStartY + 20);
    } else {
        // Cabeçalho da tabela (5 colunas) — ordem: VACINA | DOSE | LOTE | DATA | STATUS
        const tY = tableStartY + 11;
        const colX = [18, 82, 116, 152, 170];
        const colW = [62, 32, 34, 16, 28];
        const headers = ['VACINA', 'DOSE', 'LOTE', 'DATA', 'STATUS'];

        doc.setFillColor(241, 245, 249);
        doc.rect(12, tY, W - 24, 7, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(...navyMid);
        headers.forEach((h, i) => {
            const centered = i === 3 || i === 4;
            const x = centered ? colX[i] + colW[i] / 2 : colX[i];
            doc.text(h, x, tY + 5, centered ? { align: 'center' } : {});
        });

        // Linhas da tabela
        // Reserva a faixa do rodapé (imagem da assinatura + linha + nome + rodapé preto) em TODAS as páginas —
        // a assinatura é desenhada depois, por cima de cada página, então a tabela precisa parar bem antes dela.
        // sigLineY = H-27; o topo da imagem da assinatura fica em sigLineY - 9 - 5 = H-41.
        const FOOTER_RESERVED_Y = H - 41;
        let curY = tY + 7;
        rows.forEach((row, idx) => {
            if (curY + 10 > FOOTER_RESERVED_Y) {
                doc.addPage();
                drawPageHeader();
                curY = 50;
            }

            if (idx % 2 === 0) {
                doc.setFillColor(248, 250, 252);
                doc.rect(12, curY, W - 24, 10, 'F');
            }

            // row: [0]=vacNome [1]=fab [2]=forn [3]=dose [4]=lote [5]=data [6]=status
            const status = row[6];
            const btnColor = status === 'Aplicado' ? [22, 163, 74] : [37, 99, 235];

            // Nome da vacina
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8.5);
            doc.setTextColor(...navy);
            doc.text(row[0], colX[0], curY + 4.5, { maxWidth: colW[0] - 2 });

            // Fabricante / fornecedor discretos abaixo do nome
            const subInfo = [row[1], row[2]].filter(Boolean).join(' · ');
            if (subInfo) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(5.5);
                doc.setTextColor(148, 163, 184);
                doc.text(subInfo, colX[0], curY + 8.5, { maxWidth: colW[0] - 2 });
            }

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8.5);
            doc.setTextColor(...navy);
            doc.text(row[3], colX[1], curY + 5.5);
            doc.setTextColor(100, 116, 139);
            doc.text(row[4], colX[2], curY + 5.5);
            doc.setTextColor(...btnColor);
            doc.setFont('helvetica', 'bold');
            doc.text(row[5], colX[3] + colW[3] / 2, curY + 5.5, { align: 'center' });

            // Badge STATUS
            const statusColors = {
                'Aplicado':      [22,  163,  74],
                'Agendado':      [37,   99, 235],
                'Em negociação': [234, 179,   8],
                'Perdido':     [220,  38,  38],
            };
            const badgeColor = statusColors[status] || [100, 116, 139];
            const badgeLabel = status.toUpperCase();
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(5.5);
            const textW = doc.getTextWidth(badgeLabel);
            const padX = 2.5;
            const btnW = textW + padX * 2;
            const btnH = 4;
            const btnX = colX[4] + (colW[4] - btnW) / 2;
            const btnY = curY + 2;
            doc.setFillColor(...badgeColor);
            doc.roundedRect(btnX, btnY, btnW, btnH, 2, 2, 'F');
            doc.setTextColor(...white);
            doc.text(badgeLabel, btnX + btnW / 2, btnY + btnH / 2 + 0.9, { align: 'center' });

            doc.setDrawColor(...border);
            doc.setLineWidth(0.15);
            doc.line(12, curY + 10, W - 12, curY + 10);

            curY += 10;
        });
    }

    // ── Assinatura do Responsável Técnico ─────────────────────────────────────
    let sigDataUrl = null;
    let sigNaturalW = 0, sigNaturalH = 1;
    try {
        const sigImg = await new Promise((res, rej) => {
            const si = new Image(); si.crossOrigin = 'anonymous';
            si.onload = () => res(si); si.onerror = rej;
            si.src = 'https://i.imgur.com/hwy39IM.png';
        });
        const sigCanvas = document.createElement('canvas');
        sigCanvas.width = sigImg.naturalWidth; sigCanvas.height = sigImg.naturalHeight;
        sigCanvas.getContext('2d').drawImage(sigImg, 0, 0);
        sigDataUrl = sigCanvas.toDataURL('image/png');
        sigNaturalW = sigImg.naturalWidth;
        sigNaturalH = sigImg.naturalHeight;
    } catch(e) { /* assinatura opcional */ }

    // ── Rodapé ────────────────────────────────────────────────────────────────
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);

        const sigBlockCenterX = W / 2;
        const sigLineY = H - 27;

        doc.setDrawColor(...navyMid);
        doc.setLineWidth(0.4);
        doc.line(sigBlockCenterX - 30, sigLineY, sigBlockCenterX + 30, sigLineY);

        if (sigDataUrl) {
            const sigH = 18;
            const sigW = sigH * (sigNaturalW / sigNaturalH);
            doc.addImage(sigDataUrl, 'PNG', sigBlockCenterX - sigW / 2, sigLineY - sigH / 2 - 5, sigW, sigH);
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(...navy);
        doc.text('Dr. Leonardo Bezerra - CRF 3710/CE', sigBlockCenterX, sigLineY + 5.5, { align: 'center' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...accent);
        doc.text('Responsável Técnico', sigBlockCenterX, sigLineY + 10.5, { align: 'center' });

        doc.setFillColor(...navy);
        doc.rect(0, H - 12, W, 12, 'F');
        doc.setFillColor(...accent);
        doc.rect(0, H - 12, 6, 12, 'F');
        doc.setTextColor(...white);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.text('ImunoGest  •  Calendário Vacinal  •  LAMIC VACINAS', 14, H - 4.5);
        doc.text(`Página ${i} / ${totalPages}`, W - 14, H - 4.5, { align: 'right' });
    }

    doc.save(`Calendario_Vacinal_${p.nome.replace(/\s+/g,'_')}.pdf`);
}
