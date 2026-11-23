// ─── APPOINTMENT MANAGEMENT (from index.html lines ~4972-5787) ───────────────

function _toggleBtnProntuario(show) {
    const btn = document.getElementById('btn-prontuario-agenda');
    if (btn) btn.classList.toggle('hidden', !show);
}

function _toggleBtnAuditAgenda(show) {
    const btn = document.getElementById('btn-audit-agenda');
    if (btn) btn.classList.toggle('hidden', !show);
}

function populatePatientDatalist() { /* substituído por dropdown customizado */ }

function filterPatientDropdown() {
    const input = document.getElementById('reg-patient-search');
    const val = normalizeStr(input.value);
    const dd = document.getElementById('patient-dropdown');

    // Se o campo está vazio, invalida a seleção
    if(!val) { 
        document.getElementById('hidden-patient-id').value = '';
        _toggleBtnProntuario(false);
        input.setCustomValidity('Selecione um paciente válido da lista.');
        input.classList.add('border-red-400');
        input.classList.remove('border-slate-200');
        dd.classList.add('hidden'); 
        _resetAndDisableVaccineFields(); 
        return; 
    }

    // Se há um paciente válido selecionado e o valor não foi alterado, não invalida
    const currentPatientId = document.getElementById('hidden-patient-id').value;
    if (currentPatientId) {
        const currentPatient = patients.find(x => x.id == currentPatientId);
        if (currentPatient) {
            const currentValue = normalizeStr(`${currentPatient.cpf} - ${currentPatient.nome}`);
            if (currentValue === val) {
                // Paciente já está selecionado corretamente, apenas mostra dropdown com opções
                dd.classList.add('hidden'); 
                return;
            }
        }
    }

    // Ao digitar qualquer coisa diferente, invalida a seleção até selecionar novamente
    document.getElementById('hidden-patient-id').value = '';
    _toggleBtnProntuario(false);
    input.setCustomValidity('Selecione um paciente válido da lista.');
    input.classList.add('border-red-400');
    input.classList.remove('border-slate-200');

    // Busca por CPF ou Nome
    const matches = patients.filter(p =>
        normalizeStr(p.nome).includes(val) || normalizeStr(p.cpf).includes(val)
    ).slice(0, 12);
    if(!matches.length) { dd.classList.add('hidden'); return; }
    dd.innerHTML = matches.map(p =>
        `<div class="px-3 py-2 hover:bg-clinic-50 hover:text-clinic-700 cursor-pointer text-sm font-bold text-navy-900 border-b border-slate-100 last:border-0 transition"
              onmousedown="selectPatientFromDropdown(${p.id})">${p.cpf} — ${p.nome}</div>`
    ).join('');
    dd.classList.remove('hidden');
}

function hidePatientDropdown() {
    setTimeout(() => document.getElementById('patient-dropdown').classList.add('hidden'), 150);
}

function filterUserDropdown(inputId, ddId, flag) {
    const input = document.getElementById(inputId);
    const dd    = document.getElementById(ddId);
    if (!input || !dd) return;
    // Campo bloqueado (sem permissão de aplicar) não abre sugestões
    if (input.readOnly || input.disabled) { dd.classList.add('hidden'); return; }
    const val = normalizeStr(input.value);
    // Mostra usuários com a flag (vendedor/aplicador), incluindo admins com a flag
    const matches = appUsers.filter(u => u[flag] && u.ativo !== false && (!val || normalizeStr(u.nome).includes(val))).slice(0, 10);
    if (!matches.length) { dd.classList.add('hidden'); return; }
    dd.innerHTML = matches.map(u =>
        `<div class="px-3 py-2 hover:bg-clinic-50 hover:text-clinic-700 cursor-pointer text-sm font-bold text-navy-900 border-b border-slate-100 last:border-0 transition"
              onmousedown="selectUserFromDropdown('${inputId}','${ddId}','${u.nome}')">${u.nome}</div>`
    ).join('');
    dd.classList.remove('hidden');
}

function hideUserDropdown(ddId) {
    setTimeout(() => { const dd = document.getElementById(ddId); if (dd) dd.classList.add('hidden'); }, 150);
}

function selectUserFromDropdown(inputId, ddId, nome) {
    const input = document.getElementById(inputId);
    if (input) { input.value = nome; }
    const dd = document.getElementById(ddId);
    if (dd) dd.classList.add('hidden');
    if (inputId === 'concluir-aplicador') checkConcluirLote();
}

function selectPatientFromDropdown(id) {
    const p = patients.find(x => x.id == id);
    if(!p) return;
    const input = document.getElementById('reg-patient-search');
    input.value = `${p.cpf} - ${p.nome}`;
    input.setCustomValidity('');
    input.classList.remove('border-red-400');
    input.classList.add('border-slate-200');
    document.getElementById('patient-dropdown').classList.add('hidden');
    autoFillPatient();
}

function updateIdadeField() {
    const dtNasc = document.getElementById('reg-dtnasc').value;
    const dtAgendada = document.getElementById('reg-data').value;
    const el = document.getElementById('reg-idade');
    if (!el) return;
    el.value = dtNasc ? getAgeDisplay(dtNasc, dtAgendada || null) : '';
}

function openRecordModal() {
    if (!checkPerm('criar_agendamento')) return;
    // Reseta estados globais
    window._doseAnteriorConfirmado = false;
    window._pendingDoseAnteriorEvent = null;
    window._aprazamentoJustificativaConfirmada = false;
    window._antecipacaoExcepcionalConfirmada = null;
    window._aprazamentoJustificativaCtx = null;
    document.getElementById('record-form').reset(); document.getElementById('reg-id').value = '';
    _toggleBtnAuditAgenda(false);
    // Limpa inputs hidden que não são resetados automaticamente
    document.getElementById('reg-vacina').value = '';
    document.getElementById('hidden-patient-id').value = '';
    document.getElementById('reg-valor').value = '';
    document.getElementById('btn-desconto').disabled = false;
    document.getElementById('reg-desconto-info').style.display = 'none';
    resetDescontoUI();
    document.getElementById('hidden-patient-id').value = '';
    // Limpa o dropdown de vacina para evitar sobreposição visual
    const _vacinaDropdown = document.getElementById('vacina-dropdown');
    if (_vacinaDropdown) { _vacinaDropdown.innerHTML = ''; _vacinaDropdown.classList.add('hidden'); }
    // Limpa todos os modais de aviso anteriores
    document.getElementById('modal-age-warning')?.classList.remove('active');
    document.getElementById('modal-aprazamento-aviso')?.classList.remove('active');
    document.getElementById('modal-antecipacao-excepcional')?.classList.remove('active');
    document.getElementById('modal-dose-anterior-aviso')?.classList.remove('active');
    document.getElementById('modal-lote-expired-block')?.classList.remove('active');
    document.getElementById('modal-lote-expiry-warning')?.classList.remove('active');
    document.getElementById('modal-vacina-sem-estoque')?.classList.remove('active');
    _toggleBtnProntuario(false);
    updateRecordPatientAlert(null);
    document.getElementById('div-responsavel').style.display = 'none';
    document.getElementById('div-responsavel-placeholder').style.display = 'block';
    document.getElementById('div-motivo-cancelamento').style.display = 'none';
    document.getElementById('sugestao-data').classList.add('hidden');
    document.getElementById('reg-data').removeAttribute('min');
    document.getElementById('reg-data').removeAttribute('readonly');
    document.getElementById('reg-data').classList.remove('bg-slate-50', 'text-slate-500', 'cursor-not-allowed');
    document.getElementById('reg-data').value = new Date().toISOString().split('T')[0];
    document.getElementById('reg-lote-validade-hint').classList.add('hidden');
    const _estoqueHintNew = document.getElementById('reg-lote-estoque-hint');
    if (_estoqueHintNew) _estoqueHintNew.classList.add('hidden');
    document.getElementById('lbl-lote').innerText = 'Lote';
    document.getElementById('reg-lote').required = false;
    document.getElementById('reg-lote').classList.add('border-slate-200');
    document.getElementById('reg-lote').classList.remove('border-clinic-300', 'ring-2', 'ring-clinic-100');
    document.getElementById('lbl-aplicador').innerText = 'Aplicador';
    document.getElementById('reg-aplicador').required = false;
    const regPedido = document.getElementById('reg-pedido');
    if (regPedido) { regPedido.value = ''; regPedido.required = false; }
    populatePatientDatalist(); populateVaccineSelects(); populateCancelReasons(); populateLoteSelect(null);
    // Bloqueia vacina até paciente ser selecionado
    const _vacinaSelNew = document.getElementById('reg-vacina');
    _vacinaSelNew.value = '';
    _vacinaSelNew.disabled = true;
    _vacinaSelNew.classList.add('opacity-50', 'cursor-not-allowed');
    // O formulário de registro é sempre dono do prefixo "reg" dos campos de endereço.
    if (typeof setEnderecoPrefixo === 'function') { setEnderecoPrefixo('reg'); setEnderecoPacienteId(null); }
    if (typeof populateUnidadeSelects === 'function') populateUnidadeSelects();
    if (typeof limparEnderecoForm === 'function') limparEnderecoForm();
    setRegPago(false);
    document.getElementById('modal-title-agenda').innerText = 'Novo Agendamento Clínico';
    document.getElementById('btn-delete-record').classList.add('hidden');
    document.getElementById('btn-duplicar-record').classList.add('hidden');
    const _chkOutroLocalNew = document.getElementById('reg-aplicada-outro-local');
    if (_chkOutroLocalNew) { _chkOutroLocalNew.checked = false; toggleAplicadaOutroLocal(_chkOutroLocalNew); }
    const _chkOutraVacinaNew = document.getElementById('reg-outra-vacina');
    if (_chkOutraVacinaNew) { _chkOutraVacinaNew.checked = false; _paintOutraVacinaToggle('reg', false); }
    if (currentUser) {
        const _fullUser = appUsers.find(u => u.id === currentUser.id);
        if (_fullUser && _fullUser.isVendedor) {
            document.getElementById('reg-vendedor').value = _fullUser.nome;
        }
    }
    document.getElementById('modal-record').classList.add('active');
}

function openRecordModalWithPatient(patId) {
    closeModals();
    openRecordModal();
    const p = patients.find(x=>x.id==patId);
    if(p) {
        setTimeout(() => {
            document.getElementById('reg-patient-search').value = `${p.cpf} - ${p.nome}`;
            autoFillPatient();
        }, 50);
    }
}

// Abre o agendamento por cima do prontuário vacinal, sem fechá-lo
function openAgendarFromProntuario(patId) {
    if (!checkPerm('criar_agendamento')) return;
    window._agendaOpenedFromProntuario = true;
    openRecordModal();
    document.getElementById('modal-record').style.zIndex = '130';
    const p = patients.find(x=>x.id==patId);
    if(p) {
        setTimeout(() => {
            document.getElementById('reg-patient-search').value = `${p.cpf} - ${p.nome}`;
            autoFillPatient();
        }, 50);
    }
}

// Badge "Disponível: N" fixo à direita de cada item do dropdown de vacinas.
function _vacinaDispBadge(vId) {
    const editingId = document.getElementById('reg-id')?.value;
    const disp = getVacinaDisponivelTotal(vId, editingId ? Number(editingId) : null);
    if (disp == null) return '';
    const cor = disp > 0 ? 'text-emerald-600' : 'text-red-500';
    return `<span class="ml-auto text-[9px] font-black normal-case whitespace-nowrap shrink-0 ${cor}">Disponível: ${disp}</span>`;
}

function filterVacinaDropdown() {
    const input = document.getElementById('reg-vacina-search');
    const dd    = document.getElementById('vacina-dropdown');
    if (!input || !dd || input.disabled) return;
    const val = normalizeStr(input.value);
    document.getElementById('reg-vacina').value = '';
    const ativos = vaccines.filter(v => v.ativo !== false);
    const matches = val
        ? ativos.filter(v => {
            if (normalizeStr(v.nome).includes(val)) return true;
            if (v.mnemonico && normalizeStr(v.mnemonico).includes(val)) return true;
            return vaccineLots.some(l =>
                l.vaccineId == v.id && l.fabricante && normalizeStr(l.fabricante).includes(val)
            );
        })
        : ativos;
    if (!matches.length) { dd.classList.add('hidden'); return; }
    dd.innerHTML = matches.map(v =>
        `<div class="px-3 py-2 hover:bg-clinic-50 hover:text-clinic-700 cursor-pointer text-sm font-bold text-navy-900 border-b border-slate-100 last:border-0 transition uppercase"
              onmousedown="selectVacinaFromDropdown(${v.id},'${v.nome.replace(/'/g,"\\'")}')">
            <span>${v.nome}</span>
            <div class="flex items-center gap-2 mt-0.5">
                ${v.mnemonico ? `<span class="inline-flex items-center bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full text-[9px] font-black normal-case shrink-0">${v.mnemonico}</span>` : ''}
                ${_vacinaDispBadge(v.id)}
            </div>
        </div>`
    ).join('');
    dd.classList.remove('hidden');
}
function hideVacinaDropdown() {
    setTimeout(() => { const dd = document.getElementById('vacina-dropdown'); if (dd) dd.classList.add('hidden'); }, 150);
}
function selectVacinaFromDropdown(id, nome) {
    document.getElementById('reg-vacina-search').value = nome;
    document.getElementById('reg-vacina').value = id;
    document.getElementById('vacina-dropdown').classList.add('hidden');
    autoFillVaccine();
    updateVacinaEstoqueHint();
    checkVacinaSemEstoque(id, nome);
}

// Doses disponíveis da vacina (soma dos lotes abertos), exibidas abaixo do campo
// Vacina. Supre a informação de estoque para quem não tem permissão de aplicar e
// portanto não consegue abrir o select de Lote.
function getVacinaDisponivelTotal(vId, ignoreAppointmentId) {
    if (!vId || typeof getLoteDisponivelParaAgendamento !== 'function') return null;
    return (vaccineLots || [])
        .filter(l => l.vaccineId == vId && l.status === 'aberto')
        .reduce((sum, l) => sum + Math.max(0, getLoteDisponivelParaAgendamento(l.id, ignoreAppointmentId)), 0);
}

function updateVacinaEstoqueHint() {
    const hint = document.getElementById('reg-vacina-estoque-hint');
    const span = document.getElementById('span-vacina-disp');
    if (!hint || !span) return;

    const vId = document.getElementById('reg-vacina')?.value;
    if (!vId) { hint.classList.add('hidden'); return; }

    const editingId = document.getElementById('reg-id')?.value;
    const disp = getVacinaDisponivelTotal(vId, editingId ? Number(editingId) : null);
    if (disp == null) { hint.classList.add('hidden'); return; }

    span.innerHTML = `Disponível: <b>${disp}</b> dose${disp !== 1 ? 's' : ''}`;
    hint.classList.toggle('text-red-600', disp <= 0);
    hint.classList.toggle('text-emerald-600', disp > 0);
    hint.classList.remove('hidden');
}

function checkVacinaSemEstoque(vId, nome) {
    if (!vId || typeof getLoteDisponivelParaAgendamento !== 'function') return;
    const editingId = document.getElementById('reg-id')?.value;
    const openLots = vaccineLots.filter(l => l.vaccineId == vId && l.status === 'aberto');
    const totalDisp = openLots.reduce((sum, l) =>
        sum + Math.max(0, getLoteDisponivelParaAgendamento(l.id, editingId ? Number(editingId) : null)), 0);
    if (totalDisp <= 0) {
        document.getElementById('vacina-sem-estoque-msg').innerHTML =
            `A vacina <b>${nome}</b> está sem estoque disponível em nenhum lote no momento.`;
        document.getElementById('modal-vacina-sem-estoque').classList.add('active');
    }
}

function clearVacinaField() {
    const inp = document.getElementById('reg-vacina-search');
    if (inp) inp.value = '';
    document.getElementById('reg-vacina').value = '';
    const doseSel = document.getElementById('reg-dose');
    if (doseSel) { doseSel.innerHTML = '<option value="">Selecione...</option>'; doseSel.value = ''; }
    document.getElementById('reg-valor').value = '';
    document.getElementById('reg-idade-min').value = '';
    populateLoteSelect('');
    resetDescontoUI();
}

function _enableVaccineFields() {
    const inp = document.getElementById('reg-vacina-search');
    if (!inp) return;
    inp.disabled = false;
    inp.placeholder = 'Buscar vacina...';
    inp.classList.remove('opacity-50', 'cursor-not-allowed');
}

function _resetAndDisableVaccineFields() {
    // Limpa e desabilita vacina
    const inp = document.getElementById('reg-vacina-search');
    if (inp) { inp.value = ''; inp.disabled = true; inp.placeholder = 'Selecione o paciente...'; inp.classList.add('opacity-50', 'cursor-not-allowed'); }
    document.getElementById('reg-vacina').value = '';
    // Limpa dose
    const doseSel = document.getElementById('reg-dose');
    doseSel.innerHTML = '<option value="">Selecione a vacina primeiro</option>';
    doseSel.value = '';
    // Limpa lote
    populateLoteSelect(null);
    // Limpa campos derivados
    document.getElementById('reg-idade-min').value = '';
    document.getElementById('reg-valor').value = '';
    document.getElementById('sugestao-data').classList.add('hidden');
    document.getElementById('reg-data').removeAttribute('min');
    resetDescontoUI();
}

// Alerta de cadastro incompleto / sem WhatsApp no formulário de agendamento.
function updateRecordPatientAlert(p) {
    const el = document.getElementById('reg-patient-alert');
    if (!el) return;
    let msg = '', style = '';
    if (p && p.dadosIncompletos) {
        msg = 'Cadastro incompleto';
        style = 'background:#fee2e2;border-color:#fecaca;color:#dc2626';
    } else if (p && !p.contato) {
        msg = 'Sem número de WhatsApp cadastrado';
        style = 'background:#fef3c7;border-color:#fde68a;color:#b45309';
    }
    if (!msg) {
        el.classList.add('hidden');
        el.classList.remove('flex');
        el.innerHTML = '';
        el.removeAttribute('style');
        return;
    }
    el.setAttribute('style', style);
    el.innerHTML = `<i class="fas fa-triangle-exclamation"></i><span>${msg}</span>`;
    el.classList.remove('hidden');
    el.classList.add('flex');
}

function autoFillPatient() {
    const val = document.getElementById('reg-patient-search').value;
    const normVal = normalizeStr(val);
    const p = patients.find(x => normalizeStr(`${x.cpf} - ${x.nome}`) === normVal || normalizeStr(x.cpf) === normVal || normalizeStr(x.nome) === normVal);
    if(p) {
        const si = document.getElementById('reg-patient-search');
        si.setCustomValidity(''); si.classList.remove('border-red-400'); si.classList.add('border-slate-200');
        document.getElementById('hidden-patient-id').value = p.id;
        _toggleBtnProntuario(true);
        document.getElementById('reg-cpf').value = p.cpf;
        document.getElementById('reg-dtnasc').value = p.dtNasc;
        updateIdadeField();
        document.getElementById('reg-contato').value = formatPhone(p.contato);
        updateRecordPatientAlert(p);
        if(p.responsavel) {
            document.getElementById('div-responsavel').style.display = 'block';
            document.getElementById('div-responsavel-placeholder').style.display = 'none';
            document.getElementById('reg-responsavel').value = p.responsavel;
        } else {
            document.getElementById('div-responsavel').style.display = 'none';
            document.getElementById('div-responsavel-placeholder').style.display = 'block';
        }
        // Endereço: herda o mais usado do próprio paciente, sem sobrescrever digitação.
        // Em edição o endereço salvo já foi aplicado, então não reescreve.
        if (typeof autoFillEnderecoPaciente === 'function' && !document.getElementById('reg-id').value) {
            autoFillEnderecoPaciente(p.id);
        }
        _enableVaccineFields();
        checkAgeConstraint(); updateSuggestedDate();
        if (document.getElementById('reg-vacina').value) autoFillVaccine();
        return;
    }
    // Paciente inválido ou apagado — limpa campos e bloqueia vacina
    document.getElementById('hidden-patient-id').value = '';
    _toggleBtnProntuario(false);
    document.getElementById('reg-cpf').value = '';
    document.getElementById('reg-dtnasc').value = '';
    document.getElementById('reg-idade').value = '';
    document.getElementById('reg-contato').value = '';
    updateRecordPatientAlert(null);
    document.getElementById('div-responsavel').style.display = 'none';
    document.getElementById('div-responsavel-placeholder').style.display = 'block';
    document.getElementById('reg-responsavel').value = '';
    // O formulário de registro é sempre dono do prefixo "reg" dos campos de endereço.
    if (typeof setEnderecoPrefixo === 'function') { setEnderecoPrefixo('reg'); setEnderecoPacienteId(null); }
    if (typeof limparEnderecoForm === 'function') limparEnderecoForm();
    _resetAndDisableVaccineFields();
}

function populateLoteSelect(vaccineId, selectedLoteId) {
    const sel = document.getElementById('reg-lote');
    sel.innerHTML = '<option value="">Selecione o lote...</option>';
    document.getElementById('reg-lote-validade-hint').classList.add('hidden');
    if (!vaccineId) { updateVacinaEstoqueHint(); applyLoteAplicadorPermission(); return; }
    const editingId = document.getElementById('reg-id')?.value;
    // Lotes abertos + o lote já vinculado a este agendamento (mesmo que tenha sido auto-fechado)
    const openLots = vaccineLots.filter(l =>
        l.vaccineId == vaccineId && (l.status === 'aberto' || l.id == selectedLoteId)
    ).sort((a, b) => new Date(a.validade) - new Date(b.validade));
    openLots.forEach(l => {
        const disp = (typeof getLoteDisponivelParaAgendamento === 'function')
            ? getLoteDisponivelParaAgendamento(l.id, editingId ? Number(editingId) : null) : null;
        const opt = document.createElement('option');
        opt.value = l.id;
        const dispStr = disp != null ? ` (disp: ${Math.max(0, disp)})` : '';
        opt.textContent = `Lote ${l.numero} — Val: ${l.validade.split('-').reverse().join('/')}${dispStr}`;
        opt.dataset.numero = l.numero;
        opt.dataset.validade = l.validade;
        if (disp != null) opt.dataset.disponivel = disp;
        // Lote sem estoque livre fica desabilitado (a menos que seja o lote já vinculado a este agendamento)
        if (disp != null && disp <= 0 && l.id != selectedLoteId) { opt.disabled = true; opt.textContent += ' — sem estoque'; }
        sel.appendChild(opt);
    });
    if (selectedLoteId) {
        sel.value = selectedLoteId;
        onLoteChange();
    }
    updateVacinaEstoqueHint();
    applyLoteAplicadorPermission();
}

// Bloqueia Lote e Aplicador para quem não tem permissão de aplicar vacina.
// Os campos ficam somente-leitura com aviso; o valor já gravado é preservado.
function applyLoteAplicadorPermission() {
    const pode = (typeof canEditLoteAplicador === 'function') ? canEditLoteAplicador() : true;
    const loteSel = document.getElementById('reg-lote');
    const aplicadorInput = document.getElementById('reg-aplicador');
    const bloqCls = ['bg-slate-100', 'opacity-60', 'cursor-not-allowed'];

    if (loteSel) {
        // Campo bloqueado não pode ser required: travaria o submit de quem não
        // tem permissão (o status "Aplicado" já é barrado em toggleCancelReason).
        if (!pode) loteSel.required = false;
        loteSel.disabled = !pode;
        loteSel.classList.toggle('pointer-events-none', !pode);
        bloqCls.forEach(c => loteSel.classList.toggle(c, !pode));
        loteSel.title = pode ? '' : 'Somente usuários com permissão de aplicar vacina podem definir o lote.';
    }
    if (aplicadorInput) {
        if (!pode) aplicadorInput.required = false;
        aplicadorInput.readOnly = !pode;
        bloqCls.forEach(c => aplicadorInput.classList.toggle(c, !pode));
        aplicadorInput.title = pode ? '' : 'Somente usuários com permissão de aplicar vacina podem definir o aplicador.';
        if (!pode) {
            const dd = document.getElementById('aplicador-dropdown');
            if (dd) dd.classList.add('hidden');
        }
    }
}

function onLoteChange() {
    const sel = document.getElementById('reg-lote');
    const opt = sel.options[sel.selectedIndex];
    const validade = opt && opt.dataset.validade ? opt.dataset.validade : null;
    const hintEl = document.getElementById('reg-lote-validade-hint');
    const spanEl = document.getElementById('span-lote-validade');
    const erroEl = document.getElementById('reg-lote-vencido-erro');
    const submitBtn = document.querySelector('#record-form button[type="submit"]');

    // Fecha ambos os modais e reseta estado visual
    document.getElementById('modal-lote-expired-block').classList.remove('active');
    document.getElementById('modal-lote-expiry-warning').classList.remove('active');
    erroEl.classList.add('hidden');
    hintEl.classList.add('hidden');
    hintEl.style.color = '';
    sel.classList.remove('border-red-400');
    if (submitBtn) { submitBtn.disabled = false; submitBtn.classList.remove('opacity-50', 'cursor-not-allowed'); }

    // Mostra disponibilidade de estoque do lote selecionado
    const estoqueHint = document.getElementById('reg-lote-estoque-hint');
    if (estoqueHint) {
        const loteIdSel = sel.value;
        if (loteIdSel && typeof getLoteDisponivelParaAgendamento === 'function') {
            const editingId = document.getElementById('reg-id')?.value;
            const disp = Math.max(0, getLoteDisponivelParaAgendamento(Number(loteIdSel), editingId ? Number(editingId) : null));
            document.getElementById('span-lote-disp').textContent = disp;
            estoqueHint.classList.toggle('text-red-600', disp <= 0);
            estoqueHint.classList.toggle('text-slate-500', disp > 0);
            estoqueHint.classList.remove('hidden');
        } else {
            estoqueHint.classList.add('hidden');
        }
    }

    if (!validade) return;

    spanEl.textContent = validade.split('-').reverse().join('/');
    hintEl.classList.remove('hidden');

    const expiryDate = new Date(validade + 'T00:00:00');

    // Data de referência: data agendada se preenchida, senão hoje
    const scheduledDateVal = document.getElementById('reg-data').value;
    const refDate = scheduledDateVal
        ? new Date(scheduledDateVal + 'T00:00:00')
        : (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();

    const twoMonthsFromRef = new Date(refDate);
    twoMonthsFromRef.setMonth(twoMonthsFromRef.getMonth() + 2);

    if (expiryDate < refDate) {
        // VENCIDO — abre modal vermelho e bloqueia salvar, mas MANTÉM o lote selecionado
        // para que o usuário veja qual lote gerou a restrição ao mudar a data (reagendamento).
        const refLabel = scheduledDateVal
            ? `data agendada (<b>${scheduledDateVal.split('-').reverse().join('/')}</b>)`
            : `data de hoje`;
        document.getElementById('lote-expired-block-msg').innerHTML =
            `O lote <b>${opt.dataset.numero}</b> vence em <b>${validade.split('-').reverse().join('/')}</b>, anterior à ${refLabel}. Selecione outro lote ou cadastre um novo.`;
        document.getElementById('modal-lote-expired-block').classList.add('active');
        erroEl.classList.remove('hidden');
        sel.classList.add('border-red-400');
        hintEl.style.color = '#dc2626';
        if (submitBtn) { submitBtn.disabled = true; submitBtn.classList.add('opacity-50', 'cursor-not-allowed'); }

    } else if (expiryDate <= twoMonthsFromRef) {
        // A VENCER — abre modal amarelo, seleção permanece válida
        const diffDays = Math.ceil((expiryDate - refDate) / (1000 * 60 * 60 * 24));
        document.getElementById('lote-expiry-warning-msg').innerHTML =
            `O lote <b>${opt.dataset.numero}</b> está próximo do vencimento: <b>${validade.split('-').reverse().join('/')}</b> (em <b>${diffDays} dia(s)</b>). Utilize-o com prioridade antes que expire.`;
        document.getElementById('modal-lote-expiry-warning').classList.add('active');
        hintEl.style.color = '#d97706';
    }
}

function getEsquemaPaciente(v, dtNasc) {
    // Retorna o primeiro esquema que se encaixa na idade do paciente, ou null
    if (!v.esquemas || !v.esquemas.length) return null;
    if (!dtNasc) return v.esquemas[0];
    const ageInfo = getAgeInMonths(dtNasc);
    const totalMeses = ageInfo.years * 12 + ageInfo.months;
    return v.esquemas.find(esq => {
        if (esq.minAnos == null) return true;
        const minTotal = (esq.minAnos || 0) * 12 + (esq.minMeses || 0);
        const hasMax = esq.maxAnos != null || esq.maxMeses != null;
        const maxTotal = hasMax ? ((esq.maxAnos || 0) * 12 + (esq.maxMeses || 0)) : Infinity;
        return totalMeses >= minTotal && totalMeses <= maxTotal;
    }) || null;
}

function getEsquemasPaciente(v, dtNasc, refDateStr) {
    // Retorna TODOS os esquemas compatíveis com a idade do paciente na data de referência (agendada)
    if (!v.esquemas || !v.esquemas.length) return [];
    if (!dtNasc) return v.esquemas;
    const ageInfo = getAgeInMonths(dtNasc, refDateStr || undefined);
    const totalMeses = ageInfo.years * 12 + ageInfo.months;
    return v.esquemas.filter(esq => {
        if (esq.minAnos == null) return true;
        const minTotal = (esq.minAnos || 0) * 12 + (esq.minMeses || 0);
        const hasMax = esq.maxAnos != null || esq.maxMeses != null;
        const maxTotal = hasMax ? ((esq.maxAnos || 0) * 12 + (esq.maxMeses || 0)) : Infinity;
        return totalMeses >= minTotal && totalMeses <= maxTotal;
    });
}

function autoFillVaccine(preserveDose) {
    const vId = document.getElementById('reg-vacina').value;
    const doseSel = document.getElementById('reg-dose');
    const doseAnterior = preserveDose ? doseSel.value : '';
    // Preserva o lote já escolhido ao repopular (ex.: troca da data agendada).
    // O lote só é descartado quando a vacina muda, pois aí ele não pertence mais a ela.
    const loteSelEl = document.getElementById('reg-lote');
    const loteAnterior = preserveDose && loteSelEl ? loteSelEl.value : '';
    const loteAindaDaVacina = loteAnterior &&
        vaccineLots.some(l => String(l.id) === String(loteAnterior) && String(l.vaccineId) === String(vId));
    doseSel.innerHTML = '<option value="">Selecione...</option>';
    document.getElementById('reg-idade-min').value = '';
    document.getElementById('reg-valor').value = '';
    document.getElementById('reg-dose-restricao-aviso')?.classList.add('hidden');
    populateLoteSelect(vId, loteAindaDaVacina ? loteAnterior : undefined);

    if (vId) {
        const v = vaccines.find(x => x.id == vId);
        if (v) {
            // Determina doses de TODOS os esquemas compatíveis com a idade do paciente na data agendada
            const dtNasc = document.getElementById('reg-dtnasc').value;
            const dtAgendada = document.getElementById('reg-data') ? document.getElementById('reg-data').value : '';
            const esqs = getEsquemasPaciente(v, dtNasc, dtAgendada);

            if (esqs.length === 0 && _patientMeetsDoseZero(v, dtNasc, dtAgendada || undefined)) {
                // Paciente não se encaixa em nenhum esquema normal, mas está dentro do
                // critério de idade da Dose Zero: apenas essa opção fica disponível.
                doseSel.innerHTML += `<option value="Dose Zero">Dose Zero</option>`;
            } else {
                // Coleta opções únicas de todos os esquemas compatíveis
                const doseOptions = new Set();
                const esqsToUse = esqs.length ? esqs : (v.esquemas && v.esquemas.length ? [v.esquemas[0]] : [{ numDoses: v.numDoses || 1 }]);
                esqsToUse.forEach(e => {
                    // Esquema somente reforço (0 doses): não oferta dose primária nem Dose Única
                    if (esquemaSemDoses(e)) return;
                    const n = e.numDoses || 1;
                    if (n === 1) {
                        doseOptions.add('__dose_unica__');
                    } else {
                        for (let i = 1; i <= n; i++) doseOptions.add(i);
                    }
                });
                // Renderiza: primeiro doses numeradas em ordem, depois dose única
                const numeradas = [...doseOptions].filter(d => d !== '__dose_unica__').sort((a, b) => a - b);
                numeradas.forEach(i => { doseSel.innerHTML += `<option value="${i}ª Dose">${i}ª Dose</option>`; });
                if (doseOptions.has('__dose_unica__')) {
                    doseSel.innerHTML += `<option value="Dose Única">Dose Única</option>`;
                }
                // Reforço(s): aparece para todos os esquemas quando a vacina tem reforço(s)
                getVaccineReforcos(v).forEach((r, i) => {
                    const lbl = reforcoLabel(i + 1);
                    doseSel.innerHTML += `<option value="${lbl}">${lbl}</option>`;
                });
                // Dose Zero: opção independente do esquema, sempre por último na lista
                if (v.doseZero) doseSel.innerHTML += `<option value="Dose Zero">Dose Zero</option>`;
            }

            // Label de faixas etárias
            let idadeMinStr = '';
            if (v.esquemas && v.esquemas.length > 0) {
                const faixas = v.esquemas.filter(e => e.minAnos != null).map(e => formatFaixaEtaria(e));
                idadeMinStr = faixas.length ? faixas.join(' | ') : 'Sem restrição';
            } else {
                idadeMinStr = 'Sem restrição';
            }
            document.getElementById('reg-idade-min').value = idadeMinStr;
            document.getElementById('reg-valor').value = String(v.valor || '').replace('R$', '').trim();
            if (doseAnterior && [...doseSel.options].some(o => o.value === doseAnterior)) {
                doseSel.value = doseAnterior;
            } else if (doseAnterior) {
                // A dose escolhida deixou de ser compatível com a idade do paciente na nova
                // data agendada. Avisa em vez de removê-la silenciosamente do campo.
                const aviso = document.getElementById('reg-dose-restricao-aviso');
                if (aviso) {
                    aviso.innerHTML = `<i class="fas fa-exclamation-triangle mr-1"></i>A dose <b>${doseAnterior}</b> não é compatível com a idade do paciente na data selecionada. Escolha outra dose.`;
                    aviso.classList.remove('hidden');
                }
            }
            resetDescontoUI();
            checkAgeConstraint();
            updateSuggestedDate();
        }
    }
}


function _patientMeetsDoseZero(v, dtNasc, refDateStr) {
    if (!v.doseZero || !dtNasc) return false;
    const ageInfo = getAgeInMonths(dtNasc, refDateStr || undefined);
    const patientTotalMeses = ageInfo.years * 12 + ageInfo.months;
    const minAgeDoseZero = (v.doseZeroMinAnos || 0) * 12 + (v.doseZeroMinMeses || 0);
    return patientTotalMeses >= minAgeDoseZero;
}

function checkAgeConstraint() {
    const vId = document.getElementById('reg-vacina').value;
    const dtNasc = document.getElementById('reg-dtnasc').value;
    if (!vId || !dtNasc) return false;
    const v = vaccines.find(x => x.id == vId);
    if (!v) return false;
    const dtAgendada = document.getElementById('reg-data') ? document.getElementById('reg-data').value : '';
    const ageInfo = getAgeInMonths(dtNasc, dtAgendada || undefined);
    const patientTotalMeses = ageInfo.years * 12 + ageInfo.months;

    // Dose Zero: idade mínima própria, independente dos esquemas da vacina
    const doseSelecionada = document.getElementById('reg-dose') ? document.getElementById('reg-dose').value : '';
    if (doseSelecionada === 'Dose Zero') {
        const minAgeDoseZero = (v.doseZeroMinAnos || 0) * 12 + (v.doseZeroMinMeses || 0);
        if (patientTotalMeses < minAgeDoseZero) {
            const minStr = v.doseZeroMinAnos > 0 && v.doseZeroMinMeses > 0 ? `${v.doseZeroMinAnos} ano(s) e ${v.doseZeroMinMeses} mês(es)`
                : v.doseZeroMinAnos > 0 ? `${v.doseZeroMinAnos} ano(s)` : `${v.doseZeroMinMeses} mês(es)`;
            const patStr = ageInfo.years > 0 && ageInfo.months > 0 ? `${ageInfo.years} ano(s) e ${ageInfo.months} mês(es)`
                : ageInfo.years > 0 ? `${ageInfo.years} ano(s)` : `${ageInfo.months} mês(es)`;
            document.getElementById('age-warning-msg').innerHTML = `O paciente possui <b>${patStr}</b>, porém a idade mínima para a <b>Dose Zero</b> da vacina <b>${v.nome}</b> é de <b>${minStr}</b>.<br><br>O agendamento desta dose para este paciente <b>não é permitido</b>.`;
            document.getElementById('modal-age-warning').classList.add('active');
            return true;
        }
        return false;
    }

    // Se há esquemas por faixa etária, verifica se o paciente se encaixa em algum
    if (v.esquemas && v.esquemas.length > 0) {
        const encaixa = v.esquemas.some(esq => {
            if (esq.minAnos == null) return true;
            const minTotal = (esq.minAnos || 0) * 12 + (esq.minMeses || 0);
            const hasMax = esq.maxAnos != null || esq.maxMeses != null;
            const maxTotal = hasMax ? ((esq.maxAnos || 0) * 12 + (esq.maxMeses || 0)) : Infinity;
            return patientTotalMeses >= minTotal && patientTotalMeses <= maxTotal;
        });
        if (!encaixa) {
            // Não se encaixa em nenhum esquema normal, mas está dentro do critério de Dose Zero
            if (_patientMeetsDoseZero(v, dtNasc, dtAgendada || undefined)) return false;
            const faixas = v.esquemas.filter(esq => esq.minAnos != null).map(esq => formatFaixaEtaria(esq)).join('; ');
            const patStr = ageInfo.years > 0 ? `${ageInfo.years} ano(s) e ${ageInfo.months} mês(es)` : `${ageInfo.months} mês(es)`;
            document.getElementById('age-warning-msg').innerHTML = `O paciente possui <b>${patStr}</b> e não se enquadra em nenhuma faixa etária cadastrada para a vacina <b>${v.nome}</b>.<br><br><span class="text-[11px] text-slate-500">Faixas permitidas: <b>${faixas || 'Não definidas'}</b></span><br><br>O agendamento desta vacina para este paciente <b>não é permitido</b>.`;
            document.getElementById('modal-age-warning').classList.add('active');
            return true;
        }
        return false;
    }

    // Fallback: usa idadeMinimaAnos/Meses
    const minAgeInMonths = (v.idadeMinimaAnos || 0) * 12 + (v.idadeMinimaMeses || 0);
    if (patientTotalMeses < minAgeInMonths) {
        if (_patientMeetsDoseZero(v, dtNasc, dtAgendada || undefined)) return false;
        const minStr = v.idadeMinimaAnos > 0 && v.idadeMinimaMeses > 0 ? `${v.idadeMinimaAnos} ano(s) e ${v.idadeMinimaMeses} mês(es)`
            : v.idadeMinimaAnos > 0 ? `${v.idadeMinimaAnos} ano(s)` : `${v.idadeMinimaMeses} mês(es)`;
        const patStr = ageInfo.years > 0 && ageInfo.months > 0 ? `${ageInfo.years} ano(s) e ${ageInfo.months} mês(es)`
            : ageInfo.years > 0 ? `${ageInfo.years} ano(s)` : `${ageInfo.months} mês(es)`;
        document.getElementById('age-warning-msg').innerHTML = `O paciente possui <b>${patStr}</b>, porém a idade mínima para a vacina <b>${v.nome}</b> é de <b>${minStr}</b>.<br><br>O agendamento desta vacina para este paciente <b>não é permitido</b>.`;
        document.getElementById('modal-age-warning').classList.add('active');
        return true;
    }
    return false;
}

function updateSuggestedDate() {
    const patId  = document.getElementById('hidden-patient-id').value;
    const vId    = document.getElementById('reg-vacina').value;
    const dose   = document.getElementById('reg-dose').value;
    const sugDiv = document.getElementById('sugestao-data');

    sugDiv.classList.add('hidden');
    document.getElementById('reg-data').removeAttribute('min');

    if (!patId || !vId || !dose || dose.includes('1ª') || dose === 'Dose Zero') return;

    const v = vaccines.find(x => String(x.id) === String(vId));
    if (!v) return;

    // Reforço N: sugere data com base na última dose relevante (reforço N-1, ou
    // a última dose não-reforço quando N=1) + meses do próprio reforço N.
    const reforcoIdx = reforcoIndexFromLabel(dose);
    if (reforcoIdx) {
        const reforcos = getVaccineReforcos(v);
        const reforcoCfg = reforcos[reforcoIdx - 1];
        if (!reforcoCfg || !(reforcoCfg.meses > 0)) return;

        const baseLabel = reforcoIdx > 1 ? reforcoLabel(reforcoIdx - 1) : null;
        const editingId = document.getElementById('reg-id').value;
        const prevApps = appointments.filter(a =>
            String(a.patientId) === String(patId) &&
            String(a.vaccineId) === String(vId) &&
            (!editingId || String(a.id) !== String(editingId)) &&
            (baseLabel ? a.doseAtual === baseLabel : reforcoIndexFromLabel(a.doseAtual) == null)
        ).sort((a, b) => new Date(b.data) - new Date(a.data));

        if (!prevApps.length) return;

        const baseDate = new Date(prevApps[0].data + 'T00:00:00');
        baseDate.setMonth(baseDate.getMonth() + reforcoCfg.meses);
        const isoDate = toLocalISO(baseDate);

        _setSuggestedDate(isoDate);
        return;
    }

    // Dose Única recorrente: sugerir próxima data com base no repeteMeses do esquema
    if (dose === 'Dose Única') {
        const dtNasc = document.getElementById('reg-dtnasc').value;
        const esqs = getEsquemasPaciente(v, dtNasc);
        const esqRepete = esqs.find(e => e.numDoses === 1 && e.repete && e.repeteMeses > 0);
        if (!esqRepete) return;

        const editingId = document.getElementById('reg-id').value;
        const prevApps = appointments.filter(a =>
            String(a.patientId) === String(patId) &&
            String(a.vaccineId) === String(vId) &&
            (!editingId || String(a.id) !== String(editingId)) &&
            a.doseAtual === 'Dose Única'
        ).sort((a, b) => new Date(b.data) - new Date(a.data));

        if (!prevApps.length) return;

        const baseDate = new Date(prevApps[0].data + 'T00:00:00');
        baseDate.setMonth(baseDate.getMonth() + esqRepete.repeteMeses);
        const isoDate = toLocalISO(baseDate);

        _setSuggestedDate(isoDate);
        return;
    }

    const doseNum = Number((dose.match(/(\d+)/) || [])[1] || 2);
    if (doseNum < 2) return;

    const editingId = document.getElementById('reg-id').value;

    // Base = dose anterior específica (doseNum-1), a mais recente caso haja repetições.
    const prevDoseStr = `${doseNum - 1}ª Dose`;
    const prevApps = appointments.filter(a =>
        String(a.patientId) === String(patId) &&
        String(a.vaccineId) === String(vId)   &&
        (!editingId || String(a.id) !== String(editingId)) &&
        a.doseAtual === prevDoseStr
    ).sort((a, b) => new Date(b.data) - new Date(a.data));

    console.debug('[aprazamento] patId', patId, 'vId', vId, 'dose', dose, 'prevApps', prevApps.length, prevApps.map(a => a.doseAtual + ' ' + a.data));

    if (!prevApps.length) return;

    // Usa o agendamento mais recente como base
    const baseApp = prevApps[0];

    // Intervalo do esquema adequado ao paciente
    const dtNasc   = document.getElementById('reg-dtnasc').value;
    const esq      = getEsquemaPaciente(v, dtNasc);
    const intervalos = (esq && esq.intervalos && esq.intervalos.length)
        ? esq.intervalos
        : (v.intervalos && v.intervalos.length
            ? v.intervalos
            : (v.intervaloDias > 0 ? [v.intervaloDias] : []));

    console.debug('[aprazamento] esq', esq, 'intervalos', intervalos, 'doseNum', doseNum);

    let intervalo = intervalos.length
        ? (intervalos[doseNum - 2] != null ? intervalos[doseNum - 2] : intervalos[intervalos.length - 1])
        : 0;

    // Fallback p/ vacinas legadas salvas sem intervalos: usa default de 30 dias
    // para que o aprazamento ainda seja sugerido a partir da dose anterior.
    if (!intervalo || intervalo <= 0) intervalo = 30;

    console.debug('[aprazamento] intervalo', intervalo, 'baseApp.data', baseApp.data);

    const baseDate = new Date(baseApp.data + 'T00:00:00');
    baseDate.setDate(baseDate.getDate() + intervalo);
    const isoDate  = toLocalISO(baseDate);

    _setSuggestedDate(isoDate);
}

// Exibe a data de aprazamento sugerida e libera o campo de data a partir do
// início da validade excepcional (VALIDADE_EXCEPCIONAL_DIAS antes da sugestão).
function _setSuggestedDate(isoDate) {
    const spanEl = document.getElementById('span-sugestao-data');
    const excIso = addDiasIso(isoDate, -VALIDADE_EXCEPCIONAL_DIAS);
    spanEl.innerText = isoDate.split('-').reverse().join('/');
    spanEl.setAttribute('data-iso', isoDate);
    document.getElementById('span-sugestao-excepcional').innerText = excIso.split('-').reverse().join('/');
    document.getElementById('reg-data').min = excIso;
    document.getElementById('sugestao-data').classList.remove('hidden');
}

function applySuggestedDate() {
    const iso = document.getElementById('span-sugestao-data').getAttribute('data-iso');
    if(iso) document.getElementById('reg-data').value = iso;
}

function confirmarSalvarMesmoAssim() {
    document.getElementById('modal-aprazamento-aviso').classList.remove('active');
}

// ─── CARD DE VALORES DA VISUALIZAÇÃO ─────────────────────────────────────────
// Sem taxa (laboratório, ou domiciliar sem deslocamento cobrado) mostra um
// cartão só, com o valor da vacina. Com taxa mostra a conta inteira:
// vacina + taxa = total, cada parcela com seu status de pagamento.

function _vrSelo(pago, rotuloPago, rotuloNao) {
    const cls = pago ? 'vr-val-selo-pago' : 'vr-val-selo-nao';
    const ico = pago ? 'fa-circle-check' : 'fa-circle-xmark';
    return `<span class="vr-val-selo ${cls}"><i class="fas ${ico}"></i>${pago ? rotuloPago : rotuloNao}</span>`;
}

function _vrCard(cls, rotulo, icone, valorTxt, seloHtml, extraHtml) {
    return `<div class="vr-val-card ${cls}">
        <span class="text-[9px] font-black uppercase tracking-widest vr-val-label flex items-center gap-1.5"><i class="fas ${icone}"></i>${rotulo}</span>
        <p class="text-lg font-black vr-val-num mt-1 leading-none">R$ ${valorTxt}</p>
        <div class="mt-1.5 flex items-center gap-1.5 flex-wrap">${seloHtml}${extraHtml || ''}</div>
    </div>`;
}

// Quem registrou o pagamento e quando — vinha da antiga célula "Pagamento".
function _vrCarimboPago(a) {
    if (!a.pago) return '';
    const quando = a.pagoEm ? new Date(a.pagoEm).toLocaleDateString('pt-BR') : '';
    const quem = a.pagoPor ? `por ${a.pagoPor}` : '';
    const txt = [quando, quem].filter(Boolean).join(' · ');
    return txt ? `<span class="text-[9px] font-bold" style="color:#94a3b8">${txt}</span>` : '';
}

function _renderVrValores(a) {
    const box = document.getElementById('vr-valores-box');
    const grid = document.getElementById('vr-valores-grid');
    if (!box || !grid) return;
    if (!a) { box.classList.add('hidden'); grid.innerHTML = ''; return; }

    const taxa = (typeof getTaxaDeslocamento === 'function') ? getTaxaDeslocamento(a.endereco) : 0;

    // Cortesia: não há valor a cobrar da dose, mas a taxa da visita pode existir
    // e ainda precisa ser vista. Este card é a única fonte do dinheiro na tela.
    if (a.cortesia) {
        const cardCortesia = _vrCard('vr-val-card-vac', 'Vacina', 'fa-syringe', formatBRL(0),
            `<span class="vr-val-selo vr-val-selo-cortesia"><i class="fas fa-gift"></i>Cortesia</span>`);
        if (taxa <= 0) {
            grid.innerHTML = cardCortesia;
            box.classList.remove('hidden');
            return;
        }
        const taxaPagaC = (typeof getTaxaPaga === 'function') ? getTaxaPaga(a.endereco) : false;
        grid.innerHTML = cardCortesia
            + `<span class="vr-val-op">+</span>`
            + _vrCard('vr-val-card-taxa', 'Taxa de Deslocamento', 'fa-car',
                formatBRL(taxa), _vrSelo(taxaPagaC, 'Paga', 'Não paga'))
            + `<span class="vr-val-op">=</span>`
            + _vrCard('vr-val-card-total', 'Valor Total', 'fa-sack-dollar', formatBRL(taxa),
                _vrSelo(taxaPagaC, 'Pago', 'Não pago'));
        box.classList.remove('hidden');
        return;
    }

    const vacina = parseBRL(a.valorAplicado);
    // Sem valor e sem taxa (ex.: registro só negociado): mostra o zero com o
    // status, em vez de esconder o bloco e deixar a tela sem nada de financeiro.
    const badgeDesc = (a.descontoPct && a.descontoPct > 0)
        ? `<span class="vr-val-selo vr-val-selo-desc"><i class="fas fa-tag"></i>-${String(a.descontoPct).replace('.', ',')}%</span>`
        : '';

    const cardVacina = _vrCard('vr-val-card-vac', 'Vacina', 'fa-syringe',
        formatBRL(vacina), _vrSelo(!!a.pago, 'Pago', 'Não pago'),
        badgeDesc + _vrCarimboPago(a));

    if (taxa <= 0) {
        // Sem domiciliar: mostra apenas o valor, sem soma nem total.
        grid.innerHTML = cardVacina;
        box.classList.remove('hidden');
        return;
    }

    const taxaPaga = (typeof getTaxaPaga === 'function') ? getTaxaPaga(a.endereco) : false;
    const total = vacina + taxa;
    const tudoPago = !!a.pago && taxaPaga;
    const nadaPago = !a.pago && !taxaPaga;
    const seloTotal = tudoPago
        ? `<span class="vr-val-selo vr-val-selo-pago"><i class="fas fa-circle-check"></i>Pago</span>`
        : nadaPago
            ? `<span class="vr-val-selo vr-val-selo-nao"><i class="fas fa-circle-xmark"></i>Não pago</span>`
            : `<span class="vr-val-selo vr-val-selo-parcial"><i class="fas fa-circle-half-stroke"></i>Parcial</span>`;

    grid.innerHTML = cardVacina
        + `<span class="vr-val-op">+</span>`
        + _vrCard('vr-val-card-taxa', 'Taxa de Deslocamento', 'fa-car',
            formatBRL(taxa), _vrSelo(taxaPaga, 'Paga', 'Não paga'))
        + `<span class="vr-val-op">=</span>`
        + _vrCard('vr-val-card-total', 'Valor Total', 'fa-sack-dollar', formatBRL(total), seloTotal);
    box.classList.remove('hidden');
}

// ─── PAGAMENTO (marcador "Pago" do agendamento) ──────────────────────────────
// Agendado só avisa — o paciente ainda pode pagar no dia. Aplicado bloqueia: a
// dose saiu do estoque e o financeiro não pode ficar sem contrapartida.

function _paintRegPago() {
    const btn  = document.getElementById('btn-reg-pago');
    const icon = document.getElementById('icon-reg-pago');
    const txt  = document.getElementById('txt-reg-pago');
    if (!btn) return;
    if (_regPago) {
        btn.className = 'w-full md:w-[120px] flex items-center justify-center gap-2 border-2 border-emerald-600 bg-emerald-600 rounded-lg py-2 px-3 text-white text-xs font-black uppercase tracking-wide transition hover:bg-emerald-700 hover:border-emerald-700 shadow-sm';
        if (icon) icon.className = 'fas fa-circle-check text-sm';
        if (txt)  txt.textContent = 'Pago';
    } else {
        btn.className = 'w-full md:w-[120px] flex items-center justify-center gap-2 border-2 border-slate-200 bg-white rounded-lg py-2 px-3 text-slate-400 text-xs font-black uppercase tracking-wide transition hover:border-emerald-300';
        if (icon) icon.className = 'fas fa-circle-xmark text-sm';
        if (txt)  txt.textContent = 'Não pago';
    }
}

function _updatePagoAviso() {
    const box = document.getElementById('reg-pago-aviso');
    if (!box) return;
    const status = document.getElementById('reg-status')?.value || '';
    const lbl = document.getElementById('lbl-reg-pago');
    const msg = document.getElementById('reg-pago-aviso-msg');
    const ico = document.getElementById('reg-pago-aviso-icone');

    if (lbl) {
        lbl.innerHTML = status === 'Aplicado'
            ? 'Pagamento <span class="text-red-500">*</span>'
            : 'Pagamento';
    }

    if (_regPago || (status !== 'Agendado' && status !== 'Aplicado')) {
        box.classList.add('hidden');
        box.classList.remove('flex');
        return;
    }
    const bloqueia = status === 'Aplicado';
    box.className = bloqueia
        ? 'col-span-1 md:col-span-4 flex items-start gap-2 rounded-lg px-3 py-2 border bg-red-50 border-red-300'
        : 'col-span-1 md:col-span-4 flex items-start gap-2 rounded-lg px-3 py-2 border bg-amber-50 border-amber-300';
    if (ico) ico.className = bloqueia
        ? 'fas fa-circle-exclamation text-sm mt-0.5 shrink-0 text-red-500'
        : 'fas fa-triangle-exclamation text-sm mt-0.5 shrink-0 text-amber-500';
    if (msg) {
        msg.className = bloqueia
            ? 'text-[11px] font-black leading-tight text-red-600'
            : 'text-[11px] font-black leading-tight text-amber-700';
        msg.innerHTML = bloqueia
            ? 'Pagamento obrigatório: marque <b>Pago</b> para registrar esta aplicação.'
            : 'Pagamento pendente: este agendamento ainda não foi marcado como <b>Pago</b>.';
    }
}

// Grava o marcador no agendamento. O carimbo (quem/quando) só é refeito quando o
// estado realmente muda — reabrir e salvar um agendamento já pago não reescreve
// a autoria do pagamento.
function aplicarPagoAgendamento(alvo, pago, anterior) {
    if (!alvo) return alvo;
    const antes = anterior ? !!anterior.pago : false;
    alvo.pago = !!pago;
    if (!alvo.pago) {
        alvo.pagoEm = null;
        alvo.pagoPor = null;
    } else if (!antes || !anterior || !anterior.pagoEm) {
        alvo.pagoEm = new Date().toISOString();
        alvo.pagoPor = currentUser ? currentUser.nome : '';
    } else {
        alvo.pagoEm = anterior.pagoEm;
        alvo.pagoPor = anterior.pagoPor || '';
    }
    return alvo;
}

// O botão não é <input>/<select>, então escapa do laço que bloqueia o formulário
// em modo somente-leitura — precisa ser desligado à parte.
function _setRegPagoDisabled(off) {
    const btn = document.getElementById('btn-reg-pago');
    if (!btn) return;
    btn.disabled = !!off;
    btn.classList.toggle('opacity-50', !!off);
    btn.classList.toggle('cursor-not-allowed', !!off);
}

function toggleRegPago() {
    const btn = document.getElementById('btn-reg-pago');
    if (btn && btn.disabled) return;
    _regPago = !_regPago;
    _paintRegPago();
    _updatePagoAviso();
}

function setRegPago(valor) {
    _regPago = !!valor;
    _paintRegPago();
    _updatePagoAviso();
}

// ─── DESCONTO NO AGENDAMENTO ──────────────────────────────────────────────────

function openDescontoModal() {
    const valorAtual = document.getElementById('reg-valor').value;
    if (!valorAtual || (valorAtual === '0,00' && !_cortesia)) {
        showNotification('Selecione uma vacina antes de aplicar desconto.', 'error');
        return;
    }
    // Usa o valor cheio real (sem desconto anterior)
    const base = (_descontoAtivo || _cortesia) ? _valorCheio : valorAtual;
    document.getElementById('modal-desc-valor-cheio').textContent = 'R$ ' + base;
    document.getElementById('desc-pct-input').value = '';
    document.getElementById('desc-val-input').value = '';
    document.getElementById('desc-preview').classList.add('hidden');
    document.getElementById('desc-cortesia-check').checked = _cortesia;
    toggleCortesia();
    switchDescontoTab('pct');
    document.getElementById('modal-desconto').classList.add('active');
}

function switchDescontoTab(tab) {
    _descontoTab = tab;
    const isPct = tab === 'pct';
    document.getElementById('desc-pct-panel').classList.toggle('hidden', !isPct);
    document.getElementById('desc-val-panel').classList.toggle('hidden', isPct);
    const erro = document.getElementById('desc-erro');
    if (erro) erro.classList.add('hidden');
    document.getElementById('tab-desc-pct').className = `flex-1 py-2 transition text-[11px] font-black uppercase ${isPct ? 'bg-indigo-600 text-white' : 'bg-white text-slate-400 hover:bg-slate-50'}`;
    document.getElementById('tab-desc-val').className = `flex-1 py-2 transition text-[11px] font-black uppercase ${!isPct ? 'bg-indigo-600 text-white' : 'bg-white text-slate-400 hover:bg-slate-50'}`;
    document.getElementById('desc-preview').classList.add('hidden');
}

function setDescontoPct(pct) {
    document.getElementById('desc-pct-input').value = pct;
    calcDescontoPreview();
}

function calcDescontoPreview() {
    const base = _descontoAtivo ? _valorCheio : document.getElementById('reg-valor').value;
    const baseNum = parseBRL(base);
    if (!baseNum) return;

    const preview = document.getElementById('desc-preview');
    const erro = document.getElementById('desc-erro');

    let finalNum = 0, pct = 0;
    if (_descontoTab === 'pct') {
        pct = parseFloat(document.getElementById('desc-pct-input').value) || 0;
        if (pct < 0 || pct > 100) {
            preview.classList.add('hidden');
            if (erro) { erro.textContent = 'Percentual deve ficar entre 0% e 100%.'; erro.classList.remove('hidden'); }
            return;
        }
        finalNum = baseNum * (1 - pct / 100);
    } else {
        const raw = document.getElementById('desc-val-input').value;
        finalNum = parseBRL(raw);
        if (!raw) {
            preview.classList.add('hidden');
            if (erro) erro.classList.add('hidden');
            return;
        }
        if (finalNum < 0 || finalNum > baseNum) {
            preview.classList.add('hidden');
            if (erro) { erro.textContent = `Valor final não pode passar de R$ ${formatBRL(baseNum)}.`; erro.classList.remove('hidden'); }
            return;
        }
        pct = baseNum > 0 ? ((baseNum - finalNum) / baseNum) * 100 : 0;
    }
    if (erro) erro.classList.add('hidden');

    const economia = baseNum - finalNum;
    document.getElementById('desc-preview-valor').textContent = 'R$ ' + formatBRL(finalNum);
    document.getElementById('desc-preview-pct').textContent = pct.toFixed(1).replace('.', ',') + '% OFF';
    document.getElementById('desc-preview-economia').textContent = 'R$ ' + formatBRL(economia);
    document.getElementById('desc-preview').classList.remove('hidden');
}

function aplicarDesconto() {
    const isCortesia = document.getElementById('desc-cortesia-check').checked;
    const base = (_descontoAtivo || _cortesia) ? _valorCheio : document.getElementById('reg-valor').value;
    const baseNum = parseBRL(base);

    if (isCortesia) {
        _valorCheio = base;
        _cortesia = true;
        _descontoAtivo = false;
        document.getElementById('reg-valor').value = '0,00';
        document.getElementById('reg-valor-cheio-display').textContent = 'R$ ' + _valorCheio;
        document.getElementById('reg-desconto-pct-display').textContent = 'CORTESIA';
        document.getElementById('reg-desconto-info').style.display = 'flex';
        document.getElementById('btn-desconto').classList.remove('ring-indigo-400');
        document.getElementById('btn-desconto').classList.add('ring-2', 'ring-amber-400');
        document.getElementById('modal-desconto').classList.remove('active');
        showNotification('Vacina marcada como cortesia!', 'success');
        return;
    }

    let finalNum = 0, pct = 0;
    if (_descontoTab === 'pct') {
        pct = parseFloat(document.getElementById('desc-pct-input').value) || 0;
        if (pct <= 0 || pct > 100) { showNotification('Informe um percentual entre 0,1% e 100%.', 'error'); return; }
        finalNum = baseNum * (1 - pct / 100);
    } else {
        finalNum = parseBRL(document.getElementById('desc-val-input').value);
        if (finalNum <= 0 || finalNum > baseNum) { showNotification('Informe um valor final válido.', 'error'); return; }
        pct = baseNum > 0 ? ((baseNum - finalNum) / baseNum) * 100 : 0;
    }

    _valorCheio = base;
    _cortesia = false;
    _descontoAtivo = true;
    document.getElementById('reg-valor').value = formatBRL(finalNum);
    document.getElementById('reg-valor-cheio-display').textContent = 'R$ ' + _valorCheio;
    document.getElementById('reg-desconto-pct-display').textContent = pct.toFixed(1).replace('.', ',') + '% OFF';
    document.getElementById('reg-desconto-info').style.display = 'flex';
    document.getElementById('btn-desconto').classList.remove('ring-amber-400');
    document.getElementById('btn-desconto').classList.add('ring-2', 'ring-indigo-400');
    document.getElementById('modal-desconto').classList.remove('active');
    showNotification('Desconto aplicado com sucesso!', 'success');
}

function toggleCortesia() {
    const isCortesia = document.getElementById('desc-cortesia-check').checked;
    const tabs = document.getElementById('desc-tabs-container');
    if (tabs) tabs.classList.toggle('hidden', isCortesia);
    document.getElementById('desc-preview').classList.add('hidden');
    if (isCortesia) {
        document.getElementById('desc-pct-panel').classList.add('hidden');
        document.getElementById('desc-val-panel').classList.add('hidden');
    } else {
        switchDescontoTab(_descontoTab);
    }
}

function closeRecordModal() {
    resetDescontoUI();
    document.getElementById('reg-valor').value = '';
    document.getElementById('reg-desconto-info').style.display = 'none';
    if (window._agendaOpenedFromProntuario) {
        window._agendaOpenedFromProntuario = false;
        document.getElementById('modal-record').classList.remove('active');
        document.getElementById('modal-record').style.removeProperty('z-index');
        return;
    }
    closeModals();
}

function removerDesconto() {
    if (!_descontoAtivo && !_cortesia) return;
    // Fallback: lê o valor cheio do DOM caso _valorCheio tenha sido perdido
    const cheio = _valorCheio || document.getElementById('reg-valor-cheio-display').textContent.replace('R$', '').trim();
    if (cheio) document.getElementById('reg-valor').value = cheio;
    _descontoAtivo = false;
    _cortesia = false;
    _valorCheio = '';
    document.getElementById('reg-desconto-info').style.display = 'none';
    document.getElementById('btn-desconto').classList.remove('ring-2', 'ring-indigo-400', 'ring-amber-400');
}

function resetDescontoUI() {
    _descontoAtivo = false;
    _cortesia = false;
    _valorCheio = '';
    document.getElementById('reg-desconto-info').style.display = 'none';
    document.getElementById('btn-desconto').classList.remove('ring-2', 'ring-indigo-400', 'ring-amber-400');
}

function confirmarDoseAnterior() {
    document.getElementById('modal-dose-anterior-aviso').classList.remove('active');
    window._doseAnteriorConfirmado = true;
    document.getElementById('record-form').requestSubmit();
}

// ─── APLICAR COM JUSTIFICATIVA (bloqueio de aprazamento, antecipação ≤ 15 dias) ──
function toggleAprazamentoJustificativaBox() {
    const box = document.getElementById('aprazamento-justificativa-box');
    const opening = box.classList.contains('hidden');
    box.classList.toggle('hidden', !opening);
    document.getElementById('btn-aprazamento-confirmar-justificativa').classList.toggle('hidden', !opening);
    document.getElementById('btn-aprazamento-justificar').classList.toggle('hidden', opening);
    if (opening) document.getElementById('aprazamento-justificativa-input').focus();
    checkAprazamentoJustificativa();
}

function checkAprazamentoJustificativa() {
    const val = document.getElementById('aprazamento-justificativa-input').value.trim();
    const btn = document.getElementById('btn-aprazamento-confirmar-justificativa');
    if (btn.classList.contains('hidden')) return;
    const ok = val.length > 0;
    btn.disabled = !ok;
    btn.className = ok
        ? 'w-full bg-amber-600 hover:bg-amber-700 text-white font-black py-2.5 rounded-xl transition text-xs uppercase cursor-pointer'
        : 'w-full bg-amber-200 text-amber-400 font-black py-2.5 rounded-xl transition text-xs uppercase cursor-not-allowed';
}

function confirmAprazamentoComJustificativa() {
    const val = document.getElementById('aprazamento-justificativa-input').value.trim();
    if (!val || !window._aprazamentoJustificativaCtx) return;

    // Preenche automaticamente o campo de comentário do agendamento com a justificativa.
    const obsField = document.getElementById('reg-obs');
    const prefixo = `[Aprazamento antecipado — justificativa] ${val}`;
    obsField.value = obsField.value.trim() ? `${obsField.value.trim()}\n${prefixo}` : prefixo;

    document.getElementById('modal-aprazamento-aviso').classList.remove('active');
    window._aprazamentoJustificativaConfirmada = true;
    window._aprazamentoJustificativaCtx = null;
    document.getElementById('record-form').requestSubmit();
}

// ─── VALIDADE EXCEPCIONAL (antecipação ≤ VALIDADE_EXCEPCIONAL_DIAS) ───────────
function _openAntecipacaoExcepcional(dataIso, recomendadaIso, dias) {
    const fmt = iso => iso.split('-').reverse().join('/');
    document.getElementById('antexc-data-recomendada').textContent = fmt(recomendadaIso);
    document.getElementById('antexc-data-escolhida').textContent = fmt(dataIso);
    document.getElementById('antexc-dias').textContent = `${dias} dia${dias !== 1 ? 's' : ''} de antecipação`;
    document.getElementById('antexc-limite').textContent = VALIDADE_EXCEPCIONAL_DIAS;
    document.getElementById('antexc-inicio').textContent = fmt(addDiasIso(recomendadaIso, -VALIDADE_EXCEPCIONAL_DIAS));
    window._antecipacaoExcepcionalPendente = dataIso;
    document.getElementById('modal-antecipacao-excepcional').classList.add('active');
}

function confirmarAntecipacaoExcepcional() {
    document.getElementById('modal-antecipacao-excepcional').classList.remove('active');
    window._antecipacaoExcepcionalConfirmada = window._antecipacaoExcepcionalPendente;
    window._antecipacaoExcepcionalPendente = null;
    document.getElementById('record-form').requestSubmit();
}

function cancelarAntecipacaoExcepcional() {
    document.getElementById('modal-antecipacao-excepcional').classList.remove('active');
    window._antecipacaoExcepcionalPendente = null;
    document.getElementById('reg-data').focus();
}

function openDeleteModal(id) {
    if(!id) return;
    if (!checkPerm('excluir_agendamento')) return;
    const _appToDelete = appointments.find(x => x.id == id);
    if (_appToDelete && _appToDelete.status === 'Aplicado') {
        showNotification('Vacinas com status <b>Aplicado</b> não podem ser excluídas.', 'error');
        return;
    }
    pendingDeleteId = Number(id);
    const a = appointments.find(x=>x.id==pendingDeleteId);
    const p = a ? patients.find(x=>x.id==a.patientId) : null;
    const v = a ? vaccines.find(x=>x.id==a.vaccineId) : null;
    document.getElementById('delete-confirm-info').innerText = p && v ? `${p.nome} — ${v.nome} (${a.doseAtual}) em ${a.data.split('-').reverse().join('/')}` : '';
    document.getElementById('delete-confirm-input').value = '';
    checkDeleteConfirm();
    document.getElementById('modal-delete-confirm').classList.add('active');
}

function checkDeleteConfirm() {
    const val = document.getElementById('delete-confirm-input').value.trim().toUpperCase();
    const btn = document.getElementById('btn-confirm-delete');
    const ok = val === 'SIM';
    btn.disabled = !ok;
    btn.className = ok
        ? 'flex-1 bg-red-600 text-white font-black py-3 rounded-xl uppercase text-xs transition hover:bg-red-700 cursor-pointer shadow-md'
        : 'flex-1 bg-red-200 text-red-400 font-black py-3 rounded-xl uppercase text-xs transition cursor-not-allowed';
}

function confirmDeleteRecord() {
    if(!pendingDeleteId) return;
    const a = appointments.find(x => x.id === pendingDeleteId);
    const pat = a ? patients.find(p => p.id == a.patientId) : null;
    const vac = a ? vaccines.find(v => v.id == a.vaccineId) : null;
    logAudit('Excluído', 'agendamento', pendingDeleteId,
        `${pat ? pat.nome : '—'} | ${vac ? vac.nome : '—'} | ${a ? a.doseAtual : ''} | ${a ? a.data : ''}`,
        null, null, a ? a.patientId : null);
    appointments = appointments.filter(x=>x.id !== pendingDeleteId);
    if (typeof stockMovements !== 'undefined') stockMovements = stockMovements.filter(m => m.appointmentId != pendingDeleteId);
    pendingDeleteId = null;
    document.getElementById('modal-delete-confirm').classList.remove('active');
    document.getElementById('delete-confirm-input').value = '';
    if (typeof syncAllLoteStatus === 'function') syncAllLoteStatus();
    saveAll(); renderCalendar(); renderTable(); renderDashboard(); renderPatients(); closeModals();
    if (typeof refreshAlmoxIfActive === 'function') refreshAlmoxIfActive();
    if (typeof refreshOpenModals === 'function') refreshOpenModals();
    const _oppElDel = document.getElementById('agendaview-oportunidades');
    if (_oppElDel && !_oppElDel.classList.contains('hidden') && typeof renderOportunidades === 'function') renderOportunidades();
    showNotification('Agendamento excluído com sucesso.', 'success');
}

function closeViewRecord() {
    document.getElementById('modal-view-record').classList.remove('active');
    window._vrCurrentId = null;
}

// Abre os detalhes da vacina que supriu a dose perdida (clique no card "Suprida por")
function viewOutraVacinaRef() {
    const refId = window._vrOutraVacinaRefId;
    if (!refId) return;
    viewRecord(refId);
}

function viewRecord(id) {
    if (!isCurrentUserAdmin() && !hasPerm('agendar') && !hasPerm('criar_agendamento')) {
        showNotification('Acesso negado: você não tem permissão para visualizar agendamentos.', 'error');
        return;
    }
    const a = appointments.find(x => x.id == id);
    if (!a) return;
    if (a.importedCPNI && typeof viewCpniRecord === 'function') { viewCpniRecord(id); return; }
    const pat = patients.find(x => x.id == a.patientId);
    const vac = vaccines.find(x => x.id == a.vaccineId);
    window._vrCurrentId = id;

    // Status colors
    const ST = {
        'Aplicado':         { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.3)',   label: 'Aplicado' },
        'Agendado':         { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.3)',  label: 'Agendado' },
        'Em negociação':    { color: '#06b6d4', bg: 'rgba(6,182,212,0.12)',   border: 'rgba(6,182,212,0.3)',   label: 'Em Negociação' },
        'Nova oportunidade':{ color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.3)', label: 'Nova Oportunidade' },
        'Perdido':          { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)',   label: 'Perdido' },
    };
    const todayStr = new Date().toISOString().split('T')[0];
    const isDelayed = a.status === 'Agendado' && a.data < todayStr;
    const st = isDelayed
        ? { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', label: 'Atrasado' }
        : (ST[a.status] || ST['Nova oportunidade']);

    // Header accent gradient by status
    const gradMap = {
        'Aplicado': '#22c55e,#15803d', 'Agendado': '#6366f1,#2563eb',
        'Em negociação': '#0891b2,#0e7490', 'Nova oportunidade': '#475569,#334155', 'Perdido': '#dc2626,#b91c1c',
    };
    const grad = isDelayed ? '#f59e0b,#d97706' : (gradMap[a.status] || gradMap['Nova oportunidade']);
    document.querySelector('#modal-view-record .absolute.top-0').style.background =
        `linear-gradient(90deg,${grad.split(',')[0]},${grad.split(',')[1]},${grad.split(',')[0]})`;

    // Avatar
    const avatarEl = document.getElementById('vr-avatar');
    avatarEl.style.background = `linear-gradient(135deg,${grad.split(',')[0]},${grad.split(',')[1]})`;
    avatarEl.textContent = pat ? (pat.nome || '?')[0].toUpperCase() : '?';

    // Status badge
    document.getElementById('vr-status-dot').style.background = st.color;
    const badge = document.getElementById('vr-status-badge');
    badge.textContent = st.label;
    badge.style.background = st.bg;
    badge.style.color = st.color;
    badge.style.border = `1px solid ${st.border}`;

    // Paciente
    document.getElementById('vr-patient-name').textContent = pat ? pat.nome : '—';
    const vrAlertEl = document.getElementById('vr-patient-alert');
    if (vrAlertEl) vrAlertEl.innerHTML = (typeof patientAlertBadge === 'function') ? patientAlertBadge(pat, 'text-[9px]', true) : '';
    const age = pat && pat.dtNasc ? getAgeDisplay(pat.dtNasc) : '';
    document.getElementById('vr-patient-meta').textContent = [pat?.cpf, age].filter(Boolean).join(' · ');

    // WhatsApp + prontuário
    const waEl = document.getElementById('vr-wa-link');
    waEl.href = pat ? `https://wa.me/55${formatWa(pat.contato || '')}` : '#';
    const prontuarioBtn = document.getElementById('vr-btn-prontuario');
    prontuarioBtn.onclick = (e) => { e.stopPropagation(); closeViewRecord(); if (typeof viewPatientHistory === 'function') viewPatientHistory(a.patientId); };

    // Rastreabilidade: o modal de auditoria tem z-index menor, então fecha este antes de abrir.
    const histBtn = document.getElementById('vr-btn-historico');
    if (histBtn) histBtn.onclick = (e) => {
        e.stopPropagation();
        closeViewRecord();
        if (typeof openAuditModal === 'function') {
            openAuditModal('agendamento', a.id,
                `${pat ? pat.nome : '—'} | ${vac ? vac.nome : '—'} | ${a.doseAtual || '—'}`);
        }
    };

    // Vacina
    document.getElementById('vr-vaccine-name').innerHTML = vac ? `${vac.nome}${vac.mnemonico ? ` <span class="inline-flex items-center bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full text-[9px] font-black normal-case">${vac.mnemonico}</span>` : ''}` : '—';
    document.getElementById('vr-dose').textContent = a.doseAtual || '—';

    // Infos
    const _outraVacinaRefForData = a.outraVacina ? appointments.find(x => x.id == a.outraVacinaAppId) : null;
    const vrDataLabelEl = document.getElementById('vr-data-label');
    if (_outraVacinaRefForData) {
        if (vrDataLabelEl) vrDataLabelEl.textContent = 'Suprida em';
        document.getElementById('vr-data').textContent = _outraVacinaRefForData.data ? _outraVacinaRefForData.data.split('-').reverse().join('/') : '—';
    } else {
        if (vrDataLabelEl) vrDataLabelEl.textContent = 'Data';
        document.getElementById('vr-data').textContent = a.data ? a.data.split('-').reverse().join('/') : '—';
    }
    document.getElementById('vr-hora').textContent = a.hora || '—';
    document.getElementById('vr-pedido').textContent = a.pedido || a.pedidoNumero || '—';

    // Valor, desconto/cortesia e status de pagamento vivem só no card de
    // "Valores do Atendimento" — as células soltas que repetiam isso saíram.
    _renderVrValores(a);

    // Lote + Nome de Fábrica + Aplicador (independentes)
    const loteRow = document.getElementById('vr-lote-row');
    const lotObj = a.loteId ? vaccineLots.find(l => l.id == a.loteId) : null;
    if (a.lote) {
        document.getElementById('vr-lote').textContent = a.lote;
        const nomeFabricaEl = document.getElementById('vr-nome-fabrica');
        if (nomeFabricaEl) nomeFabricaEl.textContent = (lotObj && lotObj.fabricante) ? lotObj.fabricante : '—';
        loteRow.classList.remove('hidden');
    } else { loteRow.classList.add('hidden'); }

    const aplicadorRow = document.getElementById('vr-aplicador-row');
    if (aplicadorRow) {
        if (a.aplicador) { document.getElementById('vr-aplicador').textContent = a.aplicador; aplicadorRow.classList.remove('hidden'); }
        else aplicadorRow.classList.add('hidden');
    } else {
        document.getElementById('vr-aplicador').textContent = a.aplicador || '—';
    }

    // Vendedor
    const vendRow = document.getElementById('vr-vendedor-row');
    if (a.vendedor) { document.getElementById('vr-vendedor').textContent = a.vendedor; vendRow.classList.remove('hidden'); }
    else vendRow.classList.add('hidden');

    // Motivo cancelamento
    const motivoRow = document.getElementById('vr-motivo-row');
    if (a.motivoCancelamento) { document.getElementById('vr-motivo').textContent = a.motivoCancelamento; motivoRow.classList.remove('hidden'); }
    else motivoRow.classList.add('hidden');

    // Vacina substituta
    const outraVacinaRow = document.getElementById('vr-outra-vacina-row');
    if (outraVacinaRow) {
        if (a.outraVacina) {
            const ref = appointments.find(x => x.id == a.outraVacinaAppId);
            document.getElementById('vr-outra-vacina').textContent =
                ref ? outraVacinaLabel(ref) : (a.outraVacinaLabel || '—');
            window._vrOutraVacinaRefId = ref ? ref.id : null;
            outraVacinaRow.classList.toggle('cursor-pointer', !!ref);
            outraVacinaRow.classList.remove('hidden');
        } else {
            window._vrOutraVacinaRefId = null;
            outraVacinaRow.classList.add('hidden');
        }
    }

    // Endereço — mapa já aberto ao (re)abrir o modal, quando há endereço
    const endRow = document.getElementById('vr-endereco-row');
    if (endRow) {
        const _vrBox = document.getElementById('vr-mapa-box');
        const _vrFrame = document.getElementById('vr-mapa-frame');
        const _vrMapaUrl = (typeof _enderecoParaMapaObj === 'function' && typeof _mapaUrl === 'function')
            ? (_enderecoParaMapaObj(a.endereco) ? _mapaUrl(_enderecoParaMapaObj(a.endereco)) : '')
            : '';
        if (_vrFrame) _vrFrame.src = _vrMapaUrl;
        _vrBox?.classList.toggle('hidden', !_vrMapaUrl);
        const _vrChev = document.getElementById('vr-btn-mapa-chevron');
        if (_vrChev) _vrChev.style.transform = _vrMapaUrl ? 'rotate(180deg)' : '';

        const partes = (typeof enderecoPartes === 'function') ? enderecoPartes(a.endereco) : null;
        if (partes) {
            // Cada sub-linha some sozinha quando o endereço é parcial.
            const setPart = (rowId, valId, txt) => {
                document.getElementById(valId).textContent = txt || '';
                document.getElementById(rowId).classList.toggle('hidden', !txt);
            };
            setPart('vr-end-local-row',   'vr-end-local',   partes.local);
            setPart('vr-end-unidade-row', 'vr-end-unidade', partes.unidade);
            setPart('vr-end-linha-row',  'vr-end-linha',  partes.linha);
            setPart('vr-end-cidade-row', 'vr-end-cidade', partes.cidade);
            setPart('vr-end-cep-row',    'vr-end-cep',    partes.cep);
            setPart('vr-end-ref-row',    'vr-end-ref',    partes.referencia);
            // Sem endereço (Laboratório) não há o que mostrar no mapa.
            document.getElementById('vr-btn-mapa')?.classList.toggle('hidden', !_vrMapaUrl);
            endRow.classList.remove('hidden');
        } else {
            endRow.classList.add('hidden');
        }
    }

    // Obs
    const obsRow = document.getElementById('vr-obs-row');
    if (a.obs) { document.getElementById('vr-obs').textContent = a.obs; obsRow.classList.remove('hidden'); }
    else obsRow.classList.add('hidden');

    // Botão editar — só se tiver permissão
    const canEdit = isCurrentUserAdmin() || hasPerm('criar_agendamento');
    document.getElementById('vr-btn-edit').style.display = canEdit ? '' : 'none';

    // Se aberto por trás do prontuário do paciente, mantém-o aberto (não fecha
    // tudo) — só fecha os demais modais concorrentes e empilha por cima dele.
    const _phOpen = document.getElementById('modal-patient-history')?.classList.contains('active');
    if (_phOpen) {
        document.querySelectorAll('.modal').forEach(m => { if (m.id !== 'modal-patient-history') m.classList.remove('active'); });
        const _mr = document.getElementById('modal-record');
        if (_mr) _mr.style.removeProperty('z-index');
        const _mp = document.getElementById('modal-paciente');
        if (_mp) _mp.style.removeProperty('z-index');
        window._agendaOpenedFromProntuario = false;
    } else {
        closeModals();
    }
    document.getElementById('modal-view-record').classList.add('active');
}

function editRecord(id) {
    if (!isCurrentUserAdmin() && !hasPerm('agendar') && !hasPerm('criar_agendamento')) {
        showNotification('Acesso negado: você não tem permissão para visualizar agendamentos.', 'error');
        return;
    }
    const canEdit = isCurrentUserAdmin() || hasPerm('criar_agendamento');
    closeModals();
    // Reseta estados globais
    window._doseAnteriorConfirmado = false;
    window._antecipacaoExcepcionalConfirmada = null;
    window._pendingDoseAnteriorEvent = null;
    // Setup modal sem checar permissão de criação
    document.getElementById('record-form').reset();
    // Limpa inputs hidden que não são resetados automaticamente
    document.getElementById('reg-vacina').value = '';
    document.getElementById('hidden-patient-id').value = '';
    // Limpa o dropdown de vacina para evitar sobreposição visual
    const _vacinaDropdownEdit = document.getElementById('vacina-dropdown');
    if (_vacinaDropdownEdit) { _vacinaDropdownEdit.innerHTML = ''; _vacinaDropdownEdit.classList.add('hidden'); }
    // Limpa todos os modais de aviso anteriores
    document.getElementById('modal-age-warning')?.classList.remove('active');
    document.getElementById('modal-aprazamento-aviso')?.classList.remove('active');
    document.getElementById('modal-antecipacao-excepcional')?.classList.remove('active');
    document.getElementById('modal-dose-anterior-aviso')?.classList.remove('active');
    document.getElementById('modal-lote-expired-block')?.classList.remove('active');
    document.getElementById('modal-lote-expiry-warning')?.classList.remove('active');
    document.getElementById('modal-vacina-sem-estoque')?.classList.remove('active');
    const _chkOutroLocalEdit = document.getElementById('reg-aplicada-outro-local');
    if (_chkOutroLocalEdit) { _chkOutroLocalEdit.checked = false; toggleAplicadaOutroLocal(_chkOutroLocalEdit); }
    const _chkOutraVacinaEdit = document.getElementById('reg-outra-vacina');
    if (_chkOutraVacinaEdit) { _chkOutraVacinaEdit.checked = false; _paintOutraVacinaToggle('reg', false); }
    document.getElementById('reg-id').value = '';
    document.getElementById('hidden-patient-id').value = '';
    _toggleBtnProntuario(false);
    _toggleBtnAuditAgenda(false);
    updateRecordPatientAlert(null);
    document.getElementById('div-responsavel').style.display = 'none';
    document.getElementById('div-responsavel-placeholder').style.display = 'block';
    document.getElementById('div-motivo-cancelamento').style.display = 'none';
    document.getElementById('sugestao-data').classList.add('hidden');
    document.getElementById('reg-data').removeAttribute('min');
    document.getElementById('reg-lote-validade-hint').classList.add('hidden');
    const _estoqueHintEdit = document.getElementById('reg-lote-estoque-hint');
    if (_estoqueHintEdit) _estoqueHintEdit.classList.add('hidden');
    document.getElementById('lbl-lote').innerText = 'Lote';
    document.getElementById('reg-lote').required = false;
    document.getElementById('reg-lote').classList.add('border-slate-200');
    document.getElementById('reg-lote').classList.remove('border-clinic-300', 'ring-2', 'ring-clinic-100');
    document.getElementById('lbl-aplicador').innerText = 'Aplicador';
    document.getElementById('reg-aplicador').required = false;
    populatePatientDatalist(); populateVaccineSelects(); populateCancelReasons(); populateLoteSelect(null);
    document.getElementById('btn-delete-record').classList.add('hidden');

    const a = appointments.find(x=>x.id==id);
    if(!a) return;
    const p = patients.find(x=>x.id==a.patientId);

    document.getElementById('reg-id').value = a.id;
    _toggleBtnAuditAgenda(true);
    document.getElementById('reg-patient-search').value = p ? `${p.cpf} - ${p.nome}` : '';
    autoFillPatient();
    // Endereço salvo tem precedência; sem endereço, herda o mais usado do paciente.
    if (typeof setEnderecoPrefixo === 'function') { setEnderecoPrefixo('reg'); setEnderecoPacienteId(null); }
    setRegPago(a.pago);
    if (typeof limparEnderecoForm === 'function') {
        limparEnderecoForm();
        if (a.endereco) { preencherEnderecoForm(a.endereco); aplicarPadraoEndereco(); }
        else autoFillEnderecoPaciente(a.patientId);
    }

    setTimeout(() => {
        // Limpa completamente os campos de vacina ANTES de preencher com novos dados
        document.getElementById('reg-vacina').value = '';
        document.getElementById('reg-vacina-search').value = '';
        
        // Define a data agendada ANTES de autoFillVaccine para que a idade
        // e a restrição de idade sejam calculadas com base nela
        document.getElementById('reg-data').value = a.data;
        updateIdadeField();

        // Preenche com a nova vacina
        const _vac = vaccines.find(x => x.id == a.vaccineId);
        document.getElementById('reg-vacina').value = a.vaccineId;
        document.getElementById('reg-vacina-search').value = _vac ? _vac.nome : '';
        autoFillVaccine();

        document.getElementById('reg-dose').value = a.doseAtual;
        updateSuggestedDate();
        document.getElementById('reg-data').value = a.data;
        updateIdadeField();
        document.getElementById('reg-hora').value = a.hora || '';
        document.getElementById('reg-valor').value = String(a.valorAplicado || '').replace('R$', '').trim();
        // Restaura estado de desconto
        if (a.cortesia) {
            _cortesia = true;
            _descontoAtivo = false;
            _valorCheio = String(a.valorCheio || '').replace('R$', '').trim();
            document.getElementById('reg-valor-cheio-display').textContent = 'R$ ' + _valorCheio;
            document.getElementById('reg-desconto-pct-display').textContent = 'CORTESIA';
            document.getElementById('reg-desconto-info').style.display = 'flex';
            document.getElementById('btn-desconto').classList.add('ring-2', 'ring-amber-400');
        } else if (a.valorCheio && a.descontoPct) {
            _descontoAtivo = true;
            _cortesia = false;
            _valorCheio = String(a.valorCheio).replace('R$', '').trim();
            document.getElementById('reg-valor-cheio-display').textContent = 'R$ ' + _valorCheio;
            document.getElementById('reg-desconto-pct-display').textContent = String(a.descontoPct).replace('.', ',') + '% OFF';
            document.getElementById('reg-desconto-info').style.display = 'flex';
            document.getElementById('btn-desconto').classList.add('ring-2', 'ring-indigo-400');
        } else {
            resetDescontoUI();
        }
        document.getElementById('reg-status').value = a.status;
        populateLoteSelect(a.vaccineId, a.loteId);
        toggleCancelReason();
        if(a.status === 'Perdido') document.getElementById('reg-motivo-cancelamento').value = a.motivoCancelamento || '';
        document.getElementById('reg-pedido').value = a.pedido || a.pedidoNumero || '';
        document.getElementById('reg-vendedor').value = a.vendedor || '';
        document.getElementById('reg-aplicador').value = a.aplicador || '';
        document.getElementById('reg-obs').value = a.obs || '';
        const chkOutroLocal = document.getElementById('reg-aplicada-outro-local');
        if(chkOutroLocal) { chkOutroLocal.checked = !!a.aplicadaOutroLocal; toggleAplicadaOutroLocal(chkOutroLocal); }
        const chkOutraVacina = document.getElementById('reg-outra-vacina');
        if(chkOutraVacina) {
            chkOutraVacina.checked = !!a.outraVacina;
            _paintOutraVacinaToggle('reg', chkOutraVacina.checked);
            if (a.outraVacina) {
                const ref = appointments.find(x => x.id == a.outraVacinaAppId);
                document.getElementById('reg-outra-vacina-ref').value = a.outraVacinaAppId || '';
                document.getElementById('reg-outra-vacina-search').value = ref ? outraVacinaLabel(ref) : (a.outraVacinaLabel || '');
                _syncOutraVacinaDateLock('reg', ref || null);
            }
            toggleCancelReason();
        }

        if (canEdit) {
            document.getElementById('modal-title-agenda').innerText = 'Editar Agendamento';
            if (a.status === 'Aplicado') {
                document.getElementById('btn-delete-record').classList.add('hidden');
            } else {
                document.getElementById('btn-delete-record').classList.remove('hidden');
            }
            document.getElementById('btn-duplicar-record').classList.remove('hidden');
            document.querySelectorAll('#record-form input:not([type="hidden"]):not(#reg-valor), #record-form select, #record-form textarea').forEach(el => { el.disabled = false; });
            document.getElementById('btn-desconto').disabled = false;
            _setRegPagoDisabled(false);
            const saveBtn = document.querySelector('#record-form button[type="submit"]');
            if (saveBtn) saveBtn.style.display = '';
        } else {
            document.getElementById('modal-title-agenda').innerText = 'Visualizar Agendamento';
            document.getElementById('btn-delete-record').classList.add('hidden');
            document.getElementById('btn-duplicar-record').classList.add('hidden');
            document.querySelectorAll('#record-form input:not([type="hidden"]):not(#reg-valor), #record-form select, #record-form textarea').forEach(el => { el.disabled = true; });
            document.getElementById('btn-desconto').disabled = true;
            _setRegPagoDisabled(true);
            const saveBtn = document.querySelector('#record-form button[type="submit"]');
            if (saveBtn) saveBtn.style.display = 'none';
        }
        document.getElementById('modal-record').classList.add('active');
    }, 50);
}

function duplicarAgendamento() {
    // Captura dados ANTES de resetar o formulário
    const patientId = document.getElementById('hidden-patient-id').value;
    const p         = patients.find(x => x.id == patientId);
    const vendedor  = document.getElementById('reg-vendedor').value;
    const data      = document.getElementById('reg-data').value;
    const hora      = document.getElementById('reg-hora').value;
    const pedido    = document.getElementById('reg-pedido').value;
    const status    = document.getElementById('reg-status').value;

    openRecordModal();

    setTimeout(() => {
        // Paciente — preenche diretamente todos os campos sem depender de busca textual
        if (p) {
            const psEl = document.getElementById('reg-patient-search');
            psEl.value = `${p.cpf} - ${p.nome}`;
            psEl.setCustomValidity('');
            psEl.classList.remove('border-red-400');
            psEl.classList.add('border-slate-200');
            document.getElementById('hidden-patient-id').value = p.id;
            _toggleBtnProntuario(true);
            document.getElementById('reg-cpf').value     = p.cpf;
            document.getElementById('reg-dtnasc').value  = p.dtNasc;
            document.getElementById('reg-contato').value = formatPhone(p.contato);
            updateRecordPatientAlert(p);
            if (p.responsavel) {
                document.getElementById('div-responsavel').style.display = 'block';
                document.getElementById('div-responsavel-placeholder').style.display = 'none';
                document.getElementById('reg-responsavel').value = p.responsavel;
            }
            if (typeof autoFillEnderecoPaciente === 'function') autoFillEnderecoPaciente(p.id);
            _enableVaccineFields();
        }

        // Vacina: não duplica, campo deve ser escolhido novamente
        document.getElementById('reg-vendedor').value = vendedor;

        // Data e hora preenchidas ANTES de calcular idade/dose
        document.getElementById('reg-data').value   = data;
        document.getElementById('reg-hora').value   = hora;
        updateIdadeField();

        // Garante dose/lote limpos já que a vacina não foi duplicada
        if (typeof autoFillVaccine === 'function') autoFillVaccine();

        if (typeof checkAgeConstraint === 'function') checkAgeConstraint();
        if (pedido) {
            document.getElementById('reg-pedido').value = pedido;
        }
        if (status) {
            document.getElementById('reg-status').value = status;
            // Atualiza os campos obrigatórios baseado no status
            if (typeof toggleCancelReason === 'function') toggleCancelReason();
        }

        document.getElementById('modal-title-agenda').innerText = 'Novo Agendamento (Duplicado)';
    }, 120);
}

function toggleCancelReason() {
    const statusSel = document.getElementById('reg-status');
    const s = statusSel.value;
    const avisoEl = document.getElementById('aviso-sem-perm-aplicado');

    if (s === 'Aplicado' && !isCurrentUserAdmin() && !hasPerm('aplicar')) {
        statusSel.value = 'Agendado';
        avisoEl.classList.remove('hidden');
        setTimeout(() => avisoEl.classList.add('hidden'), 5000);
        toggleCancelReason();
        return;
    }
    avisoEl.classList.add('hidden');

    const div = document.getElementById('div-motivo-cancelamento');
    const sel = document.getElementById('reg-motivo-cancelamento');
    const outroLocal = document.getElementById('reg-aplicada-outro-local');
    const outraVacina = document.getElementById('reg-outra-vacina');
    const isOutroLocal = outroLocal && outroLocal.checked;
    const isOutraVacina = outraVacina && outraVacina.checked;
    const bloqueiaMotivo = isOutroLocal || isOutraVacina;
    if (s === 'Perdido') {
        div.style.display = 'block';
        sel.disabled = bloqueiaMotivo;
        sel.required = !bloqueiaMotivo;
        sel.classList.toggle('opacity-40', bloqueiaMotivo);
        sel.classList.toggle('cursor-not-allowed', bloqueiaMotivo);
        sel.classList.toggle('bg-slate-100', bloqueiaMotivo);
        if (bloqueiaMotivo) sel.value = '';
    } else {
        div.style.display = 'none'; sel.required = false; sel.disabled = false; sel.value = '';
        if (isOutraVacina && outraVacina) { outraVacina.checked = false; _paintOutraVacinaToggle('reg', false); }
    }

    const loteSel = document.getElementById('reg-lote');
    const loteLabel = document.getElementById('lbl-lote');
    const aplicadorInput = document.getElementById('reg-aplicador');
    const aplicadorLabel = document.getElementById('lbl-aplicador');
    const pedidoInput = document.getElementById('reg-pedido');
    const pedidoLabel = document.getElementById('lbl-pedido');

    if (s === 'Agendado' || s === 'Aplicado') {
        if (pedidoInput) pedidoInput.required = true;
        if (pedidoLabel) pedidoLabel.innerHTML = 'Nº Pedido <span class="text-red-500">*</span>';
    } else {
        if (pedidoInput) pedidoInput.required = false;
        if (pedidoLabel) pedidoLabel.innerText = 'Nº Pedido';
    }

    if(s === 'Aplicado') {
        loteSel.required = true;
        loteLabel.innerHTML = 'Lote <span class="text-red-500">*</span>';
        loteSel.classList.remove('border-slate-200');
        loteSel.classList.add('border-clinic-300', 'ring-2', 'ring-clinic-100');
        aplicadorInput.required = true;
        aplicadorLabel.innerHTML = 'Aplicador <span class="text-red-500">*</span>';
    } else {
        loteSel.required = false;
        loteLabel.innerText = 'Lote';
        loteSel.classList.add('border-slate-200');
        loteSel.classList.remove('border-clinic-300', 'ring-2', 'ring-clinic-100');
        aplicadorInput.required = false;
        aplicadorLabel.innerText = 'Aplicador';
    }

    _updatePagoAviso();
    applyLoteAplicadorPermission();
}

function toggleAplicadaOutroLocal(chk) {
    const icon  = document.getElementById('icon-aplicada-outro-local');
    const box   = chk.closest('label') && chk.closest('label').querySelector('div');
    const label = box && box.querySelector('span');

    // Mutuamente exclusivo com "Outra Vacina"
    if (chk.checked) {
        const outraVacina = document.getElementById('reg-outra-vacina');
        if (outraVacina && outraVacina.checked) { outraVacina.checked = false; _paintOutraVacinaToggle('reg', false); }
    }

    if (chk.checked) {
        if (icon)  { icon.classList.remove('text-violet-400'); icon.classList.add('text-white'); }
        if (box)   { box.classList.add('bg-violet-600', 'border-violet-600'); box.classList.remove('bg-violet-50', 'border-violet-300'); }
        if (label) { label.classList.remove('text-violet-600'); label.classList.add('text-white'); }
    } else {
        if (icon)  { icon.classList.add('text-violet-400'); icon.classList.remove('text-white'); }
        if (box)   { box.classList.remove('bg-violet-600', 'border-violet-600'); box.classList.add('bg-violet-50', 'border-violet-300'); }
        if (label) { label.classList.add('text-violet-600'); label.classList.remove('text-white'); }
    }
    toggleCancelReason();
}

// ─── OUTRA VACINA (dose suprida por outra vacina) ─────────────────────────────
// Contextos: 'reg' (formulário de agendamento) e 'dismiss' (modal de perda de oportunidade).

const OUTRA_VACINA_CTX = {
    reg: {
        chk:      'reg-outra-vacina',
        icon:     'icon-outra-vacina',
        box:      'box-outra-vacina',
        search:   'reg-outra-vacina-search',
        ref:      'reg-outra-vacina-ref',
        dropdown: 'reg-outra-vacina-dropdown'
    },
    dismiss: {
        chk:      'dismiss-opp-outra-vacina',
        icon:     'icon-dismiss-outra-vacina',
        box:      'box-dismiss-outra-vacina',
        search:   'dismiss-outra-vacina-search',
        ref:      'dismiss-outra-vacina-ref',
        dropdown: 'dismiss-outra-vacina-dropdown'
    }
};

// Paciente ativo em cada contexto
function _outraVacinaPatientId(ctx) {
    if (ctx === 'dismiss') {
        return (typeof _dismissPending !== 'undefined' && _dismissPending) ? Number(_dismissPending.patId) : null;
    }
    const v = document.getElementById('hidden-patient-id')?.value;
    return v ? Number(v) : null;
}

// Agendamento sendo editado (não pode referenciar a si mesmo)
function _outraVacinaSelfId(ctx) {
    if (ctx !== 'reg') return null;
    const v = document.getElementById('reg-id')?.value;
    return v ? Number(v) : null;
}

// Dose da vacina perdida que precisa ser suprida (mesma dosagem exigida na candidata)
function _outraVacinaRequiredDose(ctx) {
    if (ctx === 'dismiss') {
        return (typeof _dismissPending !== 'undefined' && _dismissPending) ? _dismissPending.dose : null;
    }
    return document.getElementById('reg-dose')?.value || null;
}

// Candidatos: doses efetivamente tomadas pelo paciente (aplicadas aqui ou em outro local),
// restritas à mesma dosagem (1ª Dose, 2ª Dose, Reforço...) da dose perdida.
function getOutraVacinaCandidates(ctx) {
    const patId  = _outraVacinaPatientId(ctx);
    const selfId = _outraVacinaSelfId(ctx);
    const dose   = _outraVacinaRequiredDose(ctx);
    if (!patId) return [];
    return appointments
        .filter(a => Number(a.patientId) === patId
            && Number(a.id) !== selfId
            && (!dose || a.doseAtual === dose)
            && (a.status === 'Aplicado' || (a.status === 'Perdido' && a.aplicadaOutroLocal)))
        .sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));
}

function outraVacinaLabel(a) {
    const v = vaccines.find(x => x.id == a.vaccineId);
    const d = (a.data && a.data.includes('-')) ? a.data.split('-').reverse().join('/') : (a.data || '—');
    return `${v ? v.nome : 'Vacina'} · ${a.doseAtual || '—'} · ${d}`;
}

function filterOutraVacinaDropdown(ctx) {
    const c  = OUTRA_VACINA_CTX[ctx];
    const dd = document.getElementById(c.dropdown);
    const input = document.getElementById(c.search);
    if (!dd || !input) return;

    const term = (input.value || '').toLowerCase().trim();
    const list = getOutraVacinaCandidates(ctx)
        .filter(a => !term || outraVacinaLabel(a).toLowerCase().includes(term));

    if (!list.length) {
        const dose = _outraVacinaRequiredDose(ctx);
        dd.innerHTML = `<div class="px-3 py-3 text-[11px] font-bold text-slate-400 text-center">
            <i class="fas fa-circle-info mr-1"></i>Nenhuma ${dose ? `<b>${dose}</b> aplicada` : 'vacina aplicada'} encontrada para este paciente
        </div>`;
        dd.classList.remove('hidden');
        return;
    }

    dd.innerHTML = list.map(a => {
        const v = vaccines.find(x => x.id == a.vaccineId);
        const d = (a.data && a.data.includes('-')) ? a.data.split('-').reverse().join('/') : (a.data || '—');
        const badge = (a.status === 'Perdido')
            ? '<span class="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-violet-100 text-violet-600 tracking-wide">Outro Local</span>'
            : '<span class="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-600 tracking-wide">Aplicada</span>';
        return `<div onmousedown="selectOutraVacina('${ctx}', ${a.id})"
            class="px-3 py-2 hover:bg-teal-50 cursor-pointer border-b border-slate-100 last:border-0 transition">
            <div class="flex items-center justify-between gap-2">
                <span class="text-xs font-black text-slate-700 truncate">${v ? v.nome : 'Vacina'}</span>
                ${badge}
            </div>
            <div class="text-[10px] font-bold text-slate-400 mt-0.5">${a.doseAtual || '—'} · ${d}</div>
        </div>`;
    }).join('');
    dd.classList.remove('hidden');
}

function hideOutraVacinaDropdown(ctx) {
    setTimeout(() => document.getElementById(OUTRA_VACINA_CTX[ctx].dropdown)?.classList.add('hidden'), 150);
}

function selectOutraVacina(ctx, appId) {
    const c = OUTRA_VACINA_CTX[ctx];
    const a = appointments.find(x => x.id == appId);
    if (!a) return;
    document.getElementById(c.ref).value    = a.id;
    document.getElementById(c.search).value = outraVacinaLabel(a);
    document.getElementById(c.dropdown)?.classList.add('hidden');
    _syncOutraVacinaDateLock(ctx, a);
}

function clearOutraVacinaRef(ctx) {
    const c = OUTRA_VACINA_CTX[ctx];
    const ref = document.getElementById(c.ref);
    const se  = document.getElementById(c.search);
    if (ref) ref.value = '';
    if (se)  se.value = '';
    document.getElementById(c.dropdown)?.classList.add('hidden');
    _syncOutraVacinaDateLock(ctx, null);
}

// Trava/libera o campo "Data Agendada" (só existe no contexto 'reg') na data da
// vacina que supriu a dose perdida, e esconde a sugestão de aprazamento nesse caso.
function _syncOutraVacinaDateLock(ctx, coveringApp) {
    if (ctx !== 'reg') return;
    const dataInput = document.getElementById('reg-data');
    const sugDiv     = document.getElementById('sugestao-data');
    if (!dataInput) return;
    if (coveringApp) {
        dataInput.value = coveringApp.data || '';
        dataInput.setAttribute('readonly', 'readonly');
        dataInput.classList.add('bg-slate-50', 'text-slate-500', 'cursor-not-allowed');
        sugDiv?.classList.add('hidden');
    } else {
        dataInput.removeAttribute('readonly');
        dataInput.classList.remove('bg-slate-50', 'text-slate-500', 'cursor-not-allowed');
    }
}

// Liga/desliga o visual do botão + painel de busca
function _paintOutraVacinaToggle(ctx, on) {
    const c    = OUTRA_VACINA_CTX[ctx];
    const chk  = document.getElementById(c.chk);
    const icon = document.getElementById(c.icon);
    const box  = chk && chk.closest('label') && chk.closest('label').querySelector('div');
    const label = box && box.querySelector('span');
    const panel = document.getElementById(c.box);

    if (on) {
        if (icon)  { icon.classList.remove('text-teal-400'); icon.classList.add('text-white'); }
        if (box)   { box.classList.add('bg-teal-600', 'border-teal-600'); box.classList.remove('bg-teal-50', 'border-teal-300'); }
        if (label) { label.classList.remove('text-teal-600'); label.classList.add('text-white'); }
        panel?.classList.remove('hidden');
    } else {
        if (icon)  { icon.classList.add('text-teal-400'); icon.classList.remove('text-white'); }
        if (box)   { box.classList.remove('bg-teal-600', 'border-teal-600'); box.classList.add('bg-teal-50', 'border-teal-300'); }
        if (label) { label.classList.add('text-teal-600'); label.classList.remove('text-white'); }
        panel?.classList.add('hidden');
        clearOutraVacinaRef(ctx);
    }
}

function toggleOutraVacina(chk) {
    // Mutuamente exclusivo com "Outro Local"
    if (chk.checked) {
        const outroLocal = document.getElementById('reg-aplicada-outro-local');
        if (outroLocal && outroLocal.checked) { outroLocal.checked = false; toggleAplicadaOutroLocal(outroLocal); }
    }
    _paintOutraVacinaToggle('reg', chk.checked);
    toggleCancelReason();
}

// ─── MOTIVOS DE CANCELAMENTO (CRUD) ───────────────────────────────────────────
function openCancelReasonsModal() {
    renderCancelReasons();
    document.getElementById('modal-cancel-reasons').classList.add('active');
}

function renderCancelReasons() {
    const list = document.getElementById('reasons-list');
    const sorted = cancelReasons
        .map((r, i) => ({ r, i }))
        .sort((a, b) => a.r.localeCompare(b.r, 'pt-BR', { sensitivity: 'base' }));
    list.innerHTML = sorted.map(({ r, i }) => `
        <li class="py-3 px-2 flex justify-between items-center hover:bg-slate-50 transition rounded-lg">
            <span class="text-sm font-bold text-slate-700">${r}</span>
            <div class="flex gap-2">
                <button onclick="editReason(${i})" class="h-8 w-8 bg-blue-50 text-blue-500 rounded hover:bg-blue-500 hover:text-white transition"><i class="fas fa-pen text-xs"></i></button>
                <button onclick="deleteReason(${i})" class="h-8 w-8 bg-red-50 text-red-500 rounded hover:bg-red-500 hover:text-white transition"><i class="fas fa-trash text-xs"></i></button>
            </div>
        </li>
    `).join('');
    populateCancelReasons();
    // Atualiza o select do modal de cancelamento do kanban se estiver aberto
    const kanbanSel = document.getElementById('kanban-cancel-reason');
    if (kanbanSel) {
        const cur = kanbanSel.value;
        const sortedReasons = [...cancelReasons].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
        kanbanSel.innerHTML = '<option value="">Selecione o motivo...</option>' + sortedReasons.map(r=>`<option value="${r}">${r}</option>`).join('');
        if (cur) kanbanSel.value = cur;
    }
}

function addNewReason() {
    const val = document.getElementById('new-reason-input').value.trim();
    if(val) {
        cancelReasons.push(val);
        logAudit('Criado', 'sistema', 'motivos', 'Motivo de Perda', val);
        document.getElementById('new-reason-input').value = '';
        saveAll(); renderCancelReasons(); showNotification('Motivo adicionado!', 'success');
    }
}

function editReason(i) {
    const newVal = prompt('Editar motivo:', cancelReasons[i]);
    if(newVal && newVal.trim()) {
        logAudit('Editado', 'sistema', 'motivos', 'Motivo de Perda', null,
            [{ field: 'Motivo', de: cancelReasons[i], para: newVal.trim() }]);
        cancelReasons[i] = newVal.trim();
        saveAll(); renderCancelReasons(); showNotification('Motivo editado com sucesso', 'success');
    }
}

function deleteReason(i) {
    showConfirmDanger('Excluir este motivo definitivamente?', () => {
        logAudit('Excluído', 'sistema', 'motivos', 'Motivo de Perda', cancelReasons[i]);
        cancelReasons.splice(i, 1);
        saveAll(); renderCancelReasons(); showNotification('Motivo excluído', 'success');
    });
}

function saveRecord(e) {
    e.preventDefault();
    const id = document.getElementById('reg-id').value;
    const patId = document.getElementById('hidden-patient-id').value;
    // Verifica se existe paciente válido selecionado no dropdown customizado
    if(!patId || !patients.find(x => x.id == patId)) {
        showNotification('Selecione um paciente válido da lista.','error');
        return;
    }

    const dateVal = document.getElementById('reg-data').value;
    // Validação de Domingo e Feriado
    const dObj = new Date(dateVal + "T00:00:00");
    if(dObj.getDay() === 0) {
        showNotification('Bloqueio clínico: Agendamentos aos domingos não são permitidos.', 'error');
        return;
    }
    if(holidays.includes(dateVal)) {
        showNotification('Bloqueio: O dia selecionado está marcado como feriado.', 'error');
        return;
    }

    // Bloqueio de horário: se preenchido, deve ser entre 07:00 e 17:00
    {
        const horaAgend = document.getElementById('reg-hora').value;
        if (horaAgend) {
            const [h, m] = horaAgend.split(':').map(Number);
            const totalMin = h * 60 + m;
            if (totalMin < 7 * 60 || totalMin > 17 * 60) {
                showNotification('Bloqueio: o horário deve estar entre 07:00 e 17:00.', 'error');
                return;
            }
        }
    }

    // Verificação de faixa etária — bloqueante
    if (checkAgeConstraint()) return;

    // Verificação de aprazamento — bloqueante, exceto se o usuário confirmou
    // a aplicação com justificativa (antecipação de até 15 dias).
    if (!window._aprazamentoJustificativaConfirmada) {
        const vIdApr = document.getElementById('reg-vacina').value;
        const doseApr = document.getElementById('reg-dose').value;
        if (vIdApr && doseApr && !doseApr.includes('1ª') && doseApr !== 'Dose Única' && reforcoIndexFromLabel(doseApr) == null && doseApr !== 'Dose Zero') {
            const vApr = vaccines.find(x => x.id == vIdApr);
            const dtNascApr = document.getElementById('reg-dtnasc').value;
            const esqApr = getEsquemaPaciente(vApr, dtNascApr);
            const intervalosApr = (esqApr && esqApr.intervalos && esqApr.intervalos.length) ? esqApr.intervalos
                : (vApr && vApr.intervalos && vApr.intervalos.length ? vApr.intervalos : (vApr && vApr.intervaloDias > 0 ? [vApr.intervaloDias] : []));
            if (intervalosApr.length) {
                const doseNumApr = (doseApr.match(/(\d+)/) || [])[1];
                const dNum = doseNumApr ? Number(doseNumApr) : 2;
                const intervaloApr = intervalosApr[dNum - 2] ?? intervalosApr[intervalosApr.length - 1];
                if (intervaloApr > 0) {
                    const prevDoseStrApr = `${dNum - 1}ª Dose`;
                    const prevAppsApr = appointments.filter(a =>
                            String(a.patientId) === String(patId) && String(a.vaccineId) === String(vIdApr) && a.doseAtual === prevDoseStrApr && String(a.id) !== String(id))
                        .sort((a, b) => new Date(b.data) - new Date(a.data));
                    if (prevAppsApr.length > 0) {
                        const baseApr = new Date(prevAppsApr[0].data + 'T00:00:00');
                        baseApr.setDate(baseApr.getDate() + intervaloApr);
                        const minDateIso = toLocalISO(baseApr);
                        const diffDias = diasAntecipacao(dateVal, minDateIso);
                        if (diffDias > 0 && diffDias <= VALIDADE_EXCEPCIONAL_DIAS) {
                            // Validade excepcional: antecipação permitida mediante confirmação.
                            if (window._antecipacaoExcepcionalConfirmada !== dateVal) {
                                _openAntecipacaoExcepcional(dateVal, minDateIso, diffDias);
                                return;
                            }
                        } else if (diffDias > 0) {
                            const minBr = minDateIso.split('-').reverse().join('/');
                            const prevBr = prevAppsApr[0].data.split('-').reverse().join('/');
                            document.getElementById('aprazamento-aviso-msg').innerHTML =
                                `A data agendada é anterior ao prazo recomendado.<br><br>
                                <span class="text-slate-500 text-xs">Última dose registrada: <b>${prevBr}</b></span><br>
                                <span class="text-slate-500 text-xs">Intervalo recomendado: <b>${intervaloApr} dias</b></span><br>
                                <span class="text-slate-500 text-xs">Diferença: <b class="text-red-600">${diffDias} dia${diffDias !== 1 ? 's' : ''} antes do permitido</b></span><br><br>
                                <span class="font-black text-red-600 text-xs">Data mínima: ${minBr}</span>`;

                            // Permite aplicar com justificativa se a antecipação for de até 15 dias.
                            const btnJustificar = document.getElementById('btn-aprazamento-justificar');
                            if (btnJustificar) {
                                const podeJustificar = diffDias <= 15;
                                btnJustificar.classList.toggle('hidden', !podeJustificar);
                                document.getElementById('aprazamento-justificativa-box').classList.add('hidden');
                                document.getElementById('aprazamento-justificativa-input').value = '';
                                const btnConfirmarJust = document.getElementById('btn-aprazamento-confirmar-justificativa');
                                btnConfirmarJust.classList.add('hidden');
                                btnConfirmarJust.disabled = true;
                                window._aprazamentoJustificativaCtx = podeJustificar ? { diffDias, minDateIso, prevBr, intervaloApr } : null;
                            }

                            document.getElementById('modal-aprazamento-aviso').classList.add('active');
                            return;
                        }
                    }
                }
            }
        }
        // Reforço / Dose Única recorrente: validade excepcional sobre a data sugerida
        // (antecipações maiores já são barradas pelo min do campo de data).
        const sugIsoApr = !document.getElementById('sugestao-data').classList.contains('hidden')
            && document.getElementById('span-sugestao-data').getAttribute('data-iso');
        if (sugIsoApr && (doseApr === 'Dose Única' || reforcoIndexFromLabel(doseApr) != null)) {
            const diffSug = diasAntecipacao(dateVal, sugIsoApr);
            if (diffSug > 0 && diffSug <= VALIDADE_EXCEPCIONAL_DIAS && window._antecipacaoExcepcionalConfirmada !== dateVal) {
                _openAntecipacaoExcepcional(dateVal, sugIsoApr, diffSug);
                return;
            }
        }
    }
    window._aprazamentoJustificativaConfirmada = false;

    // Verificação de intervalo de 1 hora entre agendamentos no mesmo dia
    {
        const horaVal = document.getElementById('reg-hora') ? document.getElementById('reg-hora').value : null;
        if (horaVal) {
            const conflito = appointments.find(a => a.id != id && a.data === dateVal && a.hora && Math.abs(
                (parseInt(horaVal.split(':')[0])*60 + parseInt(horaVal.split(':')[1])) -
                (parseInt(a.hora.split(':')[0])*60 + parseInt(a.hora.split(':')[1]))
            ) < 30);
            if (conflito && conflito.patientId != patId) { // Allow same patient multiple appointments at same time
                const p2 = patients.find(x => x.id == conflito.patientId);
                const v2 = vaccines.find(x => x.id == conflito.vaccineId);
                showNotification(`Conflito de horário: já existe agendamento às ${conflito.hora} para ${p2 ? p2.nome : 'outro paciente'} (${v2 ? v2.nome : ''}). O intervalo mínimo entre agendamentos é de 30 minutos.`, 'error');
                return;
            }
        }
    }

    const vId = document.getElementById('reg-vacina').value;
    const doseAtualStr = document.getElementById('reg-dose').value;

    if (!vId || !vaccines.find(x => String(x.id) === String(vId))) {
        showNotification('Selecione uma vacina válida.', 'error');
        return;
    }
    if (!doseAtualStr) {
        showNotification('Selecione a dose da vacina.', 'error');
        return;
    }

    // Bloqueio de duplicidade: mesma vacina + mesma dose já registrada (não cancelada) para o paciente
    // Dose Única com recorrência habilitada é permitida repetir
    {
        const vDupl = vaccines.find(x => String(x.id) === String(vId));
        const isDoseUnicaRepetivel = doseAtualStr === 'Dose Única' &&
            vDupl && vDupl.esquemas && vDupl.esquemas.some(e => e.numDoses === 1 && e.repete);
        const isReforco = reforcoIndexFromLabel(doseAtualStr) != null;
        const dupl = !isDoseUnicaRepetivel && !isReforco && appointments.find(x =>
            String(x.patientId) === String(patId) &&
            String(x.vaccineId) === String(vId) &&
            x.doseAtual === doseAtualStr &&
            x.status !== 'Perdido' &&
            String(x.id) !== String(id)
        );
        if (dupl) {
            const vNomeDupl = vaccines.find(x => String(x.id) === String(vId))?.nome || '';
            const dataDupl = dupl.data ? dupl.data.split('-').reverse().join('/') : '—';
            showNotification(
                `Duplicidade bloqueada: já existe registro de <b>${doseAtualStr}</b> da vacina <b>${vNomeDupl}</b> para este paciente (${dataDupl}).`,
                'error'
            );
            return;
        }
    }

    if(doseAtualStr.includes('ª Dose') && doseAtualStr !== '1ª Dose' && !window._doseAnteriorConfirmado) {
        const numAtual = parseInt(doseAtualStr);
        const prevDoseStr = `${numAtual - 1}ª Dose`;
        const hasPrev = appointments.some(x => x.patientId == patId && x.vaccineId == vId && x.doseAtual === prevDoseStr && x.id != id);
        if(!hasPrev) {
            const vNome = vaccines.find(x => x.id == vId)?.nome || '';
            document.getElementById('dose-anterior-aviso-msg').innerHTML =
                `Não foi encontrado registro da <b>${prevDoseStr}</b> da vacina <b>${vNome}</b> no sistema para este paciente.<br><br>Deseja registrar a <b>${doseAtualStr}</b> mesmo assim?`;
            window._pendingDoseAnteriorEvent = e;
            document.getElementById('modal-dose-anterior-aviso').classList.add('active');
            return;
        }
    }

    // Validação do lote: verificar vencimento na data agendada
    const loteSel = document.getElementById('reg-lote');
    const loteOpt = loteSel.options[loteSel.selectedIndex];
    if (loteOpt && loteOpt.dataset.validade) {
        const expiryDate = new Date(loteOpt.dataset.validade + 'T00:00:00');
        const schedDate = new Date(dateVal + 'T00:00:00');
        if (expiryDate < schedDate) {
            document.getElementById('lote-expired-block-msg').innerHTML =
                `O lote <b>${loteOpt.dataset.numero}</b> vence em <b>${loteOpt.dataset.validade.split('-').reverse().join('/')}</b>, que é anterior à data agendada. Selecione outro lote.`;
            document.getElementById('modal-lote-expired-block').classList.add('active');
            return;
        }
    }

    const statusVal = document.getElementById('reg-status').value;
    const pedidoVal = document.getElementById('reg-pedido').value.trim();

    if ((statusVal === 'Agendado' || statusVal === 'Aplicado') && !pedidoVal) {
        showNotification('Nº Pedido é obrigatório para status Agendado e Aplicado.', 'error');
        return;
    }

    // Endereço completo é pré-requisito do status Agendado
    if (typeof validarEnderecoObrigatorio === 'function' && !validarEnderecoObrigatorio(statusVal)) return;

    // Pagamento: Aplicado exige o marcador "Pago"; Agendado apenas alerta e segue.
    if (statusVal === 'Aplicado' && !_regPago) {
        showNotification('Marque o pagamento como <b>Pago</b> para registrar esta aplicação.', 'error');
        _updatePagoAviso();
        document.getElementById('btn-reg-pago')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        document.getElementById('btn-reg-pago')?.focus();
        return;
    }

    // Taxa de deslocamento cobrada segue a mesma regra da dose: em "Aplicado",
    // dinheiro pendente da visita não passa.
    if (statusVal === 'Aplicado' && typeof getTaxaValorForm === 'function'
        && getTaxaValorForm() > 0 && !getTaxaPagaForm()) {
        showNotification('Marque a <b>taxa de deslocamento</b> como paga para registrar esta aplicação.', 'error');
        document.getElementById('reg-taxa-pago-btn')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        document.getElementById('reg-taxa-pago-btn')?.focus();
        return;
    }

    // Bloqueio: salvar como Aplicado exige permissão de aplicador
    if (statusVal === 'Aplicado' && !isCurrentUserAdmin() && !hasPerm('aplicar')) {
        showNotification('Apenas usuários com permissão de aplicador podem registrar aplicações.', 'error');
        return;
    }

    const loteId = loteSel.value ? Number(loteSel.value) : null;
    const loteNumero = loteOpt && loteOpt.dataset.numero ? loteOpt.dataset.numero.toUpperCase() : '';

    // ─── BLOQUEIO DE ESTOQUE ───
    // Reserva (Agendado) ou consumo (Aplicado) exigem disponível > 0 no lote.
    if (loteId && (statusVal === 'Agendado' || statusVal === 'Aplicado') && typeof getLoteDisponivelParaAgendamento === 'function') {
        const dispLivre = getLoteDisponivelParaAgendamento(loteId, id ? Number(id) : null);
        if (dispLivre <= 0) {
            const loteRef = vaccineLots.find(l => l.id == loteId);
            showNotification(`Estoque insuficiente: o lote ${loteRef ? loteRef.numero : ''} não possui doses disponíveis. Selecione outro lote ou registre uma entrada.`, 'error');
            return;
        }
    }

    const vendedorVal = document.getElementById('reg-vendedor').value.trim().toUpperCase();
    const aplicadorVal = document.getElementById('reg-aplicador').value.trim().toUpperCase();

    const vendedores = appUsers.filter(u => u.isVendedor && u.ativo !== false);
    const vendedorValido = vendedores.some(u => u.nome.toUpperCase() === vendedorVal);
    if (!vendedorValido) {
        showNotification('Vendedor inválido. Selecione um nome da lista de usuários cadastrados como vendedor.', 'error');
        return;
    }

    if (aplicadorVal) {
        const aplicadores = appUsers.filter(u => u.isAplicador && u.ativo !== false);
        const aplicadorValido = aplicadores.some(u => u.nome.toUpperCase() === aplicadorVal);
        if (!aplicadorValido) {
            showNotification('Aplicador inválido. Selecione um nome da lista de usuários cadastrados como aplicador.', 'error');
            return;
        }
    }

    // Perda suprida por outra vacina: exige a referência do agendamento aplicado
    const _outraVacinaChk = document.getElementById('reg-outra-vacina');
    const _isOutraVacina  = statusVal === 'Perdido' && !!(_outraVacinaChk && _outraVacinaChk.checked);
    const _outraVacinaRef = _isOutraVacina ? (document.getElementById('reg-outra-vacina-ref')?.value || '') : '';
    if (_isOutraVacina && !_outraVacinaRef) {
        showNotification('Selecione a vacina aplicada que supriu esta dose.', 'error');
        document.getElementById('reg-outra-vacina-search')?.focus();
        return;
    }
    const _outraVacinaApp = _outraVacinaRef ? appointments.find(x => x.id == _outraVacinaRef) : null;
    if (_isOutraVacina && _outraVacinaApp && _outraVacinaApp.doseAtual !== doseAtualStr) {
        showNotification(`A vacina selecionada deve ser da mesma dosagem (${doseAtualStr}) da dose perdida.`, 'error');
        return;
    }

    const a = {
        id: id ? Number(id) : Date.now(),
        patientId: Number(patId),
        vaccineId: Number(vId),
        data: dateVal,
        hora: document.getElementById('reg-hora').value,
        doseAtual: doseAtualStr,
        valorAplicado: document.getElementById('reg-valor').value,
        valorCheio: (_descontoAtivo || _cortesia) ? _valorCheio : null,
        descontoPct: _descontoAtivo ? parseFloat((((parseBRL(_valorCheio) - parseBRL(document.getElementById('reg-valor').value)) / parseBRL(_valorCheio)) * 100).toFixed(1)) : null,
        cortesia: _cortesia || false,
        status: statusVal,
        loteId: loteId,
        lote: loteNumero,
        motivoCancelamento: statusVal === 'Perdido'
            ? (document.getElementById('reg-aplicada-outro-local')?.checked ? 'Aplicou em outro local'
               : _isOutraVacina ? 'Tomou outra vacina'
               : document.getElementById('reg-motivo-cancelamento').value)
            : '',
        // "Outro local" só vale para dose perdida; ao virar Aplicado a marcação antiga cai.
        aplicadaOutroLocal: statusVal === 'Perdido' && (document.getElementById('reg-aplicada-outro-local')?.checked || false),
        outraVacina: _isOutraVacina,
        outraVacinaAppId: _isOutraVacina ? Number(_outraVacinaRef) : null,
        outraVacinaLabel: _outraVacinaApp ? outraVacinaLabel(_outraVacinaApp) : '',
        pedido: pedidoVal,
        vendedor: vendedorVal,
        aplicador: aplicadorVal,
        endereco: (typeof coletarEnderecoForm === 'function') ? coletarEnderecoForm() : null,
        obs: document.getElementById('reg-obs').value.trim()
    };

    const isNew = !id;
    const oldApp = isNew ? null : appointments.find(x => x.id == a.id);
    aplicarPagoAgendamento(a, _regPago, oldApp);
    if(id) appointments = appointments.map(x=>x.id==a.id?a:x); else appointments.push(a);
    const pat = patients.find(x => x.id == a.patientId);
    const vac = vaccines.find(x => x.id == a.vaccineId);
    const fmtDate = d => (d && d.includes('-')) ? d.split('-').reverse().join('/') : (d || '—');
    // Endereço vira texto no log: computeChanges compara valores simples, não objetos.
    const fmtEnd = e => (typeof enderecoResumo === 'function' ? enderecoResumo(e) : '') || '';
    const fmtPago = p => p ? 'Pago' : 'Não pago';
    const oldAppFmt = oldApp ? {...oldApp, data: fmtDate(oldApp.data), endereco: fmtEnd(oldApp.endereco), pago: fmtPago(oldApp.pago)} : null;
    const newAppFmt = {...a, data: fmtDate(a.data), endereco: fmtEnd(a.endereco), pago: fmtPago(a.pago)};
    const appChanges = isNew ? null : computeChanges(oldAppFmt, newAppFmt, {data:'Data', hora:'Hora', doseAtual:'Dose', status:'Status', lote:'Lote', valorAplicado:'Valor', vendedor:'Vendedor', aplicador:'Aplicador', pago:'Pagamento', motivoCancelamento:'Motivo de Perda', endereco:'Endereço'});
    logAudit(isNew ? 'Criado' : 'Editado', 'agendamento', a.id,
        `${pat ? pat.nome : '—'} | ${vac ? vac.nome : '—'} | ${a.doseAtual} | ${a.data ? a.data.split('-').reverse().join('/') : '—'}`,
        isNew ? `Status: ${a.status}${a.vendedor ? ' | Vendedor: ' + a.vendedor : ''}` : null, appChanges, a.patientId);
    window._doseAnteriorConfirmado = false;
    window._aprazamentoJustificativaConfirmada = false;
    window._antecipacaoExcepcionalConfirmada = null;
    if (typeof syncAppointmentMovement === 'function') syncAppointmentMovement(a);
    if (typeof syncAllLoteStatus === 'function') syncAllLoteStatus();
    saveAll(); renderCalendar(); renderTable(); renderDashboard(); renderPatients(); closeModals();
    if (typeof refreshAlmoxIfActive === 'function') refreshAlmoxIfActive();
    if (typeof refreshOpenModals === 'function') refreshOpenModals();
    if (typeof updateExpiryBadge === 'function') updateExpiryBadge();
    if (typeof updateSemLoteBadge === 'function') updateSemLoteBadge();
    const _oppElSave = document.getElementById('agendaview-oportunidades');
    if (_oppElSave && !_oppElSave.classList.contains('hidden') && typeof renderOportunidades === 'function') renderOportunidades();
    showNotification('Agendamento salvo com sucesso!', 'success');
}
