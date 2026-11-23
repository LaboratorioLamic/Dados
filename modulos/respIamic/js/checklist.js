// UI de checklist, comentários e duplicação de agendamento

// UI CHECKLIST E COMENTARIOS
function toggleComentario() {
    const box = document.getElementById('box-motivo');
    box.classList.toggle('hidden');
}

function toggleCheck(type) {
    const input = document.getElementById(`chk-${type}-val`);
    const isChecked = input.value === 'true';
    input.value = !isChecked ? 'true' : 'false';
    updateCheckUI(type, !isChecked);
}

// Lê/escreve todos os itens de checklist de uma vez
function lerChecklist() {
    const valores = {};
    Object.keys(CHECKLIST_ITENS).forEach(item => {
        const el = document.getElementById(CHECKLIST_ITENS[item].input);
        valores[item] = !!el && el.value === 'true';
    });
    return valores;
}

function resetChecklistUI(valores) {
    Object.keys(CHECKLIST_ITENS).forEach(item => {
        const marcado = !!(valores && valores[item]);
        const el = document.getElementById(CHECKLIST_ITENS[item].input);
        if (el) el.value = marcado ? 'true' : 'false';
        updateCheckUI(item, marcado);
    });
}

function updateCheckUI(type, isChecked) {
    const btn = document.getElementById(`btn-chk-${type}`);
    if (!btn) return;
    if (isChecked) {
        btn.classList.add('border-blue-500', 'bg-blue-50', 'text-blue-600');
        btn.classList.remove('border-slate-200', 'bg-white', 'text-slate-400');
    } else {
        btn.classList.remove('border-blue-500', 'bg-blue-50', 'text-blue-600');
        btn.classList.add('border-slate-200', 'bg-white', 'text-slate-400');
    }
}

// Dias de abstinência só é obrigatório quando o status é "Concluído"
function updateAbstinenciaRequisito(status) {
    if (!temCampo('abstinencia')) return;
    const campo = document.getElementById('reg-abstinencia');
    const lbl = document.getElementById('lbl-abstinencia-obrig');
    if (!campo) return;

    const obrigatorio = status === 'Concluído';
    campo.required = obrigatorio;
    campo.dataset.eraObrigatorio = obrigatorio ? '1' : '0';

    campo.classList.toggle('border-amber-300', obrigatorio);
    campo.classList.toggle('bg-amber-50', obrigatorio);
    campo.classList.toggle('border-slate-200', !obrigatorio);

    if (lbl) {
        lbl.innerText = obrigatorio ? '*' : '(obrigatório ao concluir)';
        lbl.classList.toggle('text-red-500', obrigatorio);
        lbl.classList.toggle('text-slate-300', !obrigatorio);
    }
}

function toggleCancelado() {
    const status = document.getElementById('reg-status').value;
    const boxMotivo = document.getElementById('box-motivo');
    const txtMotivo = document.getElementById('reg-comentarios');
    const lblMotivo = document.getElementById('lbl-comentario');
    const btnToggle = document.getElementById('btn-toggle-comentario');
    const campoPedido = document.getElementById('reg-pedido');
    const campoPedidoContainer = document.getElementById('campo-pedido-container');
    const checklistBox = document.getElementById('box-checklist');

    // Abstinência: obrigatória apenas ao concluir
    updateAbstinenciaRequisito(status);

    // Ajusta campos obrigatórios baseado no status
    if (status === 'Em andamento') {
        campoPedido.required = false;
        campoPedido.classList.remove('border-red-300');
        campoPedido.classList.add('border-slate-200');
        
        // Oculta campo Nº do Pedido completamente
        if (campoPedidoContainer) campoPedidoContainer.classList.add('hidden');
        
        // Esconde checklist
        if (checklistBox) checklistBox.classList.add('hidden');
    } else if (status === 'Cancelado') {
        campoPedido.required = false;
        campoPedido.classList.remove('border-red-300');
        campoPedido.classList.add('border-slate-200');
        
        // Mostra campo Nº do Pedido (mas não obrigatório)
        if (campoPedidoContainer) campoPedidoContainer.classList.remove('hidden');
        
        // Mostra checklist (mas não obrigatório)
        if (checklistBox) checklistBox.classList.remove('hidden');
    } else {
        campoPedido.required = true;
        // Mantém borda normal, sem vermelho
        campoPedido.classList.remove('border-red-300');
        campoPedido.classList.add('border-slate-200');
        
        // Mostra campo Nº do Pedido
        if (campoPedidoContainer) campoPedidoContainer.classList.remove('hidden');
        
        // Mostra checklist
        if (checklistBox) checklistBox.classList.remove('hidden');
    }
    
    if (status === 'Cancelado') {
        txtMotivo.required = true;
        boxMotivo.classList.remove('hidden');
        btnToggle.classList.add('hidden');

        boxMotivo.classList.add('bg-red-50', 'border-red-200');
        boxMotivo.classList.remove('bg-slate-50', 'border-slate-200');
        lblMotivo.innerText = "Motivo do Cancelamento *";
        lblMotivo.classList.add('text-red-600');
        lblMotivo.classList.remove('text-slate-400');
        txtMotivo.classList.add('focus:ring-red-500');
        txtMotivo.classList.remove('focus:ring-blue-500');

        document.getElementById('box-motivo-perda').classList.remove('hidden');
        updateMotivosPerdaSelect();
    } else {
        txtMotivo.required = false;
        boxMotivo.classList.add('hidden');
        btnToggle.classList.remove('hidden');

        boxMotivo.classList.remove('bg-red-50', 'border-red-200');
        boxMotivo.classList.add('bg-slate-50', 'border-slate-200');
        lblMotivo.innerText = "Comentários Operacionais (Opcional)";
        lblMotivo.classList.remove('text-red-600');
        lblMotivo.classList.add('text-slate-400');
        txtMotivo.classList.remove('focus:ring-red-500');
        txtMotivo.classList.add('focus:ring-blue-500');

        document.getElementById('box-motivo-perda').classList.add('hidden');
        document.getElementById('reg-motivo-perda').value = '';
    }
}

// DUPLICAR AGENDAMENTO
function duplicateRecord() {
    // Campos copiados para o novo agendamento do mesmo paciente
    const campos = ['reg-paciente', 'reg-idade', 'reg-contato', 'reg-pedido'];
    if (temCampo('endereco')) campos.push('reg-cep', 'reg-logradouro', 'reg-numero', 'reg-complemento', 'reg-bairro', 'reg-cidade');
    if (temCampo('pontoReferencia')) campos.push('reg-ponto-referencia');
    if (temCampo('coletador')) campos.push('reg-coletador');
    // Auxiliar não entra em `campos`: só preencher o input deixaria o bloco
    // escondido, com um nome invisível pronto para ser salvo.
    const coletadorAuxiliar = temCampo('coletador')
        ? document.getElementById('reg-coletador-auxiliar').value : '';

    const valores = {};
    campos.forEach(id => { const el = document.getElementById(id); if (el) valores[id] = el.value; });
    // A marca de localidade distante acompanha o endereço copiado
    const distante = temCampo('endereco') && document.getElementById('reg-distante').checked;
    // O tipo de cobrança também acompanha a duplicação
    const tiposTaxa = temCampo('endereco') ? taxaColetaTiposSelecionados() : [];
    const conveniosTaxa = temCampo('endereco') ? taxaColetaConveniosSelecionados() : [];
    // As demais pessoas da visita também vêm junto
    const acompanhantes = temCampo('multiPaciente') ? lerAcompanhantes() : [];

    closeModals();

    // Pequeno delay para garantir que o modal fechou antes de reabrir
    setTimeout(() => {
        openRecordModal();
        Object.keys(valores).forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = valores[id];
        });
        if (temCampo('endereco')) {
            document.getElementById('reg-distante').checked = distante;
            atualizarDistanteUI();
            definirTaxaColetaTipos(tiposTaxa);
            definirTaxaColetaConvenios(conveniosTaxa);
            atualizarTaxaColetaUI();
        }
        if (coletadorAuxiliar) definirColetadorAuxiliar(coletadorAuxiliar);
        acompanhantes.forEach(a => adicionarAcompanhante(a));
    }, 150);
}
