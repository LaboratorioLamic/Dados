// Salvamento de agendamentos e modal de checklist

// SALVAR
function saveRecord(e) {
    e.preventDefault();
    const agenda = currentAgenda();
    const id = document.getElementById('reg-id').value;
    const atendenteInput = document.getElementById('reg-atendente').value.trim();

    // Validação Checklist & Status — só os itens que a agenda usa
    const statusVal = document.getElementById('reg-status').value;
    const valores = lerChecklist();
    const itensAtivos = agenda.checklist;
    const faltando = itensAtivos.filter(item => !valores[item]);

    // Em "Em andamento", "Cancelado" e "Ausente" o checklist não é obrigatório —
    // no ausente o atendimento não chegou a acontecer, não há o que conferir.
    if (statusVal === 'Em andamento' || statusVal === 'Cancelado' || statusVal === 'Ausente') {
        resetChecklistUI({});
        proceedWithSave(id, atendenteInput, {}, statusVal);
        return;
    }

    // Checklist pendente não bloqueia mais salvar como Concluído — só avisa.
    // O registro concluído com pendência fica listrado verde/amarelo com
    // ícone de alerta (ver table.js, calendar.js e modals.js).
    if (faltando.length) {
        pendingChecklistAction = () => {
            proceedWithSave(id, atendenteInput, valores, statusVal);
        };
        showChecklistConfirmModal(faltando.map(i => CHECKLIST_ITENS[i].aviso));
        return;
    }

    proceedWithSave(id, atendenteInput, valores, statusVal);
}

function proceedWithSave(id, atendenteInput, chkValores, statusVal) {
    // Forçar nome do paciente para maiúsculas
    const pacienteInput = document.getElementById('reg-paciente').value.trim();
    document.getElementById('reg-paciente').value = pacienteInput.toUpperCase();
    
    const agenda = currentAgenda();

    // Atendente e coletador são campos de "pesquisar e selecionar": só aceitam
    // nomes da lista oficial. `nomeOficialDe` devolve a grafia canônica (então
    // um nome digitado com acento/caixa diferente é corrigido) ou null.
    const atendenteOficial = nomeOficialDe(atendenteInput);
    if (atendenteOficial === null) {
        marcarCampoNomeValido('atendente', false);
        document.getElementById('reg-atendente').focus();
        showNotification(`ATENDENTE INVÁLIDO: "${atendenteInput}" não está na lista de atendentes. Digite para pesquisar e selecione um nome da lista.`, 'error');
        return;
    }
    document.getElementById('reg-atendente').value = atendenteOficial;
    marcarCampoNomeValido('atendente', true);

    if (temCampo('coletador', agenda)) {
        const coletadorInput = document.getElementById('reg-coletador').value.trim();
        // Coletador não é obrigatório: vazio passa, preenchido tem que conferir.
        const coletadorOficial = nomeOficialDe(coletadorInput);
        if (coletadorOficial === null) {
            marcarCampoNomeValido('coletador', false);
            document.getElementById('reg-coletador').focus();
            showNotification(`COLETADOR INVÁLIDO: "${coletadorInput}" não está na lista de atendentes. Digite para pesquisar e selecione um nome da lista.`, 'error');
            return;
        }
        document.getElementById('reg-coletador').value = coletadorOficial;
        marcarCampoNomeValido('coletador', true);

        // Coletador auxiliar segue a mesma regra: opcional, mas se preenchido
        // tem que ser nome da lista — e não pode repetir o responsável.
        const auxInput = document.getElementById('reg-coletador-auxiliar').value.trim();
        const auxOficial = nomeOficialDe(auxInput);
        if (auxOficial === null) {
            marcarCampoNomeValido('coletador-auxiliar', false);
            document.getElementById('reg-coletador-auxiliar').focus();
            showNotification(`COLETADOR AUXILIAR INVÁLIDO: "${auxInput}" não está na lista de atendentes. Digite para pesquisar e selecione um nome da lista.`, 'error');
            return;
        }
        if (auxOficial && coletadorOficial && normalizeStr(auxOficial) === normalizeStr(coletadorOficial)) {
            marcarCampoNomeValido('coletador-auxiliar', false);
            document.getElementById('reg-coletador-auxiliar').focus();
            showNotification('COLETADOR AUXILIAR INVÁLIDO: escolha uma pessoa diferente do coletador responsável.', 'error');
            return;
        }
        document.getElementById('reg-coletador-auxiliar').value = auxOficial;
        marcarCampoNomeValido('coletador-auxiliar', true);
    }

    const record = {
        id: id ? parseInt(id) : Date.now(),
        agendaId: agenda.id,
        data: document.getElementById('reg-data').value,
        horaInicio: document.getElementById('reg-hora-inicio').value,
        horaFim: document.getElementById('reg-hora-fim').value,
        duracao: document.getElementById('reg-duracao').value,
        paciente: document.getElementById('reg-paciente').value,
        idade: parseInt(document.getElementById('reg-idade').value),
        contato: document.getElementById('reg-contato').value,
        responsavelNome: document.getElementById('reg-responsavel-nome').value.trim().toUpperCase(),
        responsavelParentesco: document.getElementById('reg-responsavel-parentesco').value,
        pedido: document.getElementById('reg-pedido').value,
        atendente: document.getElementById('reg-atendente').value,
        chkConcluido: statusVal === 'Concluído', // legado/garantia
        status: statusVal,
        comentarios: document.getElementById('reg-comentarios').value,
        motivoPerda: statusVal === 'Cancelado' ? document.getElementById('reg-motivo-perda').value : '',
        anexos: getAnexosUpload('reg')
    };

    // Checklist — grava sempre as três chaves para manter o formato estável
    Object.keys(CHECKLIST_ITENS).forEach(item => {
        record[CHECKLIST_ITENS[item].chave] = temChecklist(item, agenda) ? !!chkValores[item] : false;
    });

    // Campos específicos da agenda
    if (temCampo('exame', agenda))     record.exame = document.getElementById('reg-exame').value;
    if (temCampo('substrato', agenda)) record.substrato = document.getElementById('reg-substrato').value;
    if (temCampo('metano', agenda))    record.metano = document.getElementById('reg-metano').value;
    if (temCampo('abstinencia', agenda)) {
        const val = document.getElementById('reg-abstinencia').value;
        record.abstinencia = val === '' ? null : parseInt(val);
    }
    if (temCampo('endereco', agenda)) {
        record.cep         = document.getElementById('reg-cep').value.trim();
        record.logradouro  = document.getElementById('reg-logradouro').value.trim().toUpperCase();
        record.numero      = document.getElementById('reg-numero').value.trim();
        record.complemento = document.getElementById('reg-complemento').value.trim();
        record.bairro      = document.getElementById('reg-bairro').value.trim().toUpperCase();
        record.cidade      = document.getElementById('reg-cidade').value.trim().toUpperCase();
        record.estado      = document.getElementById('reg-estado').value.trim().toUpperCase();
        record.distante    = document.getElementById('reg-distante').checked;
        record.taxaColetaPedido = taxaColetaPedidoNumerico();
        record.taxaColetaTaxa   = taxaColetaTaxaNumerico();
        record.taxaColeta       = taxaColetaValorNumerico();
        record.taxaColetaPedidoPago = taxaColetaParcelaPaga('pedido');
        record.taxaColetaTaxaPago    = taxaColetaParcelaPaga('taxa');
        record.taxaColetaTipos       = taxaColetaTiposSelecionados();
        record.taxaColetaConvenios   = taxaColetaConveniosSelecionados();
        // Mantido para o restante do sistema (filtros, conclusão, validação):
        // só é true quando nada ficou em aberto.
        record.taxaColetaPaga = taxaColetaTudoPago();
    }
    if (temCampo('multiPaciente', agenda)) {
        record.acompanhantes = lerAcompanhantes();
        // Concluir pela tela de edição encerra a visita inteira; a conclusão
        // fracionada é feita pelo botão "Concluir Agenda" da visualização.
        if (statusVal === 'Concluído') {
            record.acompanhantes = record.acompanhantes.map(a =>
                statusPaciente(a) === 'Cancelado' ? a : { ...a, status: 'Concluído' });
        } else if (statusVal === 'Ausente') {
            // Marcar a visita inteira como ausente: quem já foi atendido ou
            // cancelado mantém seu desfecho; o resto passa a ausente. Sem isso,
            // statusDerivadoDaVisita reverteria o status logo em seguida.
            record.acompanhantes = record.acompanhantes.map(a =>
                pacienteEncerrado(statusPaciente(a)) ? a : { ...a, status: 'Ausente' });
        } else if (statusVal !== 'Cancelado') {
            record.status = statusDerivadoDaVisita(record);
            record.chkConcluido = record.status === 'Concluído';
        } else {
            // Cancelar a visita cancela todo mundo que ainda estava pendente
            record.acompanhantes = record.acompanhantes.map(a =>
                statusPaciente(a) === 'Concluído' ? a : { ...a, status: 'Cancelado' });
        }
    }
    if (temCampo('pontoReferencia', agenda)) {
        record.pontoReferencia = document.getElementById('reg-ponto-referencia').value.trim();
    }
    if (temCampo('coletador', agenda)) {
        // Já validado acima e normalizado para a grafia da lista oficial —
        // um toUpperCase() aqui desfaria essa grafia.
        record.coletador = document.getElementById('reg-coletador').value.trim();
        record.coletadorAuxiliar = document.getElementById('reg-coletador-auxiliar').value.trim();
    }

    // NOTA: O status "atrasado" é calculado dinamicamente nas funções de renderização
    // (renderCalendar, openDayDetails, renderTable) com base na data atual vs data do agendamento
    // Ao alterar a data para hoje ou futuro, a visualização será atualizada automaticamente
    
    const error = validateAppointment(record);
    // Precisa ser lido logo após validar: uma nova validação zera o sinal.
    const slotExcedente = !error && _slotExcedenteNaValidacao;
    if (error) {
        if (error === "DATA_PASSADA") {
            // Mostrar modal elegante de confirmação para data passada
            showPastDateModal(() => {
                // Usuário confirmou, continuar com o salvamento
                proceedWithSaveAfterValidation(record, id);
            });
            return;
        } else {
            showNotification(error, "error");
            return;
        }
    }
    
    // Endereço além do limite do horário: só segue após confirmar que a equipe
    // de coleta domiciliar foi comunicada.
    if (slotExcedente) {
        showSlotExcedenteModal(record, () => proceedWithSaveAfterValidation(record, id));
        return;
    }

    // Se não houver erro, continuar com salvamento normal
    proceedWithSaveAfterValidation(record, id);
}

// Agendas que exigem anexo avisam (sem bloquear) quando o registro vai sem nenhum.
function exigeAnexo(agenda) {
    return ['coletaDomiciliar', 'coletaDomiciliarMilagres'].includes((agenda || currentAgenda()).id);
}

// Aviso de horário de exceção (06h–07h coleta domiciliar Crajubar; domingo inteiro é exceção)
let _horarioExcecaoConfirmado = false;

function _horarioExigeAlertaExcecao(record) {
    if (record.agendaId !== 'coletaDomiciliar') return false;
    // Domingo: qualquer horário é exceção
    const [y, m, d] = record.data.split('-').map(Number);
    if (new Date(y, m - 1, d).getDay() === 0) return true;
    // Demais dias: só a faixa 06h–07h
    return record.horaInicio === '06:00';
}

function proceedWithSaveAfterValidation(record, id) {
    // Aviso de horário de exceção — 06h–07h nos demais dias, ou qualquer horário no domingo
    if (_horarioExigeAlertaExcecao(record) && !_horarioExcecaoConfirmado) {
        showHorarioExcecaoModal(() => {
            _horarioExcecaoConfirmado = true;
            proceedWithSaveAfterValidation(record, id);
        });
        return;
    }
    _horarioExcecaoConfirmado = false;

    // Aviso de anexo faltando — cancelado não precisa de anexo
    if (exigeAnexo(currentAgenda()) && !(record.anexos || []).length
        && record.status !== 'Cancelado' && !_anexoAvisoConfirmado) {
        pendingAnexoAction = () => proceedWithSaveAfterValidation(record, id);
        showAnexoFaltandoModal();
        return;
    }
    _anexoAvisoConfirmado = false;

    const isNew = !id;
    const oldRecord = isNew ? null : appointments.find(a => a.id == id) || null;
    if(id) setAppointments(appointments.map(a => a.id == id ? record : a)); else setAppointments([...appointments, record]);

    // A tela atualiza na hora (o registro já está na lista local), mas a
    // auditoria e o aviso de sucesso só saem depois que o Firebase confirmar —
    // ver persistirAgendamento em firebase-data.js.
    closeModals(); renderTable(); renderCalendar(); updateDatalists(); updateFilterDropdowns();
    persistirAgendamento(record, {
        // Só edição checa conflito: na criação não há versão anterior no servidor.
        rev: isNew ? null : _revEmEdicao,
        audit: { action: isNew ? 'create' : 'edit', oldRecord },
        mensagem: id ? "Agendamento atualizado com sucesso!" : "Agendamento criado com sucesso!"
    });
}

// MODAL DE AVISO — AGENDAMENTO SEM ANEXO
let pendingAnexoAction = null;
let _anexoAvisoConfirmado = false;

function showAnexoFaltandoModal() {
    document.getElementById('modal-anexo-faltando').classList.add('active');
}

function confirmAnexoFaltando() {
    document.getElementById('modal-anexo-faltando').classList.remove('active');
    _anexoAvisoConfirmado = true;
    if (pendingAnexoAction) {
        const acao = pendingAnexoAction;
        pendingAnexoAction = null;
        acao();
    }
}

function cancelAnexoFaltando() {
    document.getElementById('modal-anexo-faltando').classList.remove('active');
    pendingAnexoAction = null;
    _anexoAvisoConfirmado = false;
}

// FUNÇÕES DA MODAL DE CHECKLIST
function showChecklistConfirmModal(checklistItems) {
    const itemsContainer = document.getElementById('checklist-missing-items');
    itemsContainer.innerHTML = checklistItems.map(item => `
        <div class="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div class="h-6 w-6 bg-red-500 rounded-full flex items-center justify-center">
                <i class="fas fa-times text-white text-xs"></i>
            </div>
            <span class="text-red-800 font-medium text-sm">${item}</span>
        </div>
    `).join('');
    
    document.getElementById('modal-checklist-confirm').classList.add('active');
}

function confirmChecklistIncomplete() {
    document.getElementById('modal-checklist-confirm').classList.remove('active');
    if (pendingChecklistAction) {
        pendingChecklistAction();
        pendingChecklistAction = null;
    }
}

function cancelChecklistConfirm() {
    document.getElementById('modal-checklist-confirm').classList.remove('active');
    pendingChecklistAction = null;
}
