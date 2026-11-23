// Conclusão da visita a partir da janela de visualização.
// Nas agendas com vários pacientes por visita (coleta domiciliar) a conclusão
// pode ser fracionada: marca-se quem foi atendido e quem ficou pendente.
// O status do agendamento passa a ser derivado dos pacientes.

let _concluirVisitaId = null;
// Rev do registro quando a janela foi aberta — ver revDe/persistirAgendamento.
let _concluirVisitaRev = null;
// Pedido e taxa são quitados separadamente.
let _concluirTaxaPaga = { pedido: false, taxa: false };
let _concluirTaxaValores = { pedido: 0, taxa: 0 };

function abrirConcluirVisita(id) {
    const app = appointments.find(a => a.id == (id != null ? id : _viewRecordId));
    if (!app) return;

    const agenda = getAgenda(app.agendaId || currentAgendaId);
    _concluirVisitaId = app.id;
    _concluirVisitaRev = revDe(app);

    // Checklist pendente não bloqueia mais a conclusão — só avisa. O card/linha
    // do agendamento concluído fica com o tema listrado verde/amarelo (ver
    // isChecklistComplete em table.js e calendar.js) para sinalizar a pendência.
    const faltando = agenda.checklist.filter(item => !app[CHECKLIST_ITENS[item].chave]);
    const aviso = document.getElementById('concluir-aviso-checklist');
    if (faltando.length) {
        aviso.innerHTML = `<i class="fas fa-triangle-exclamation mr-1"></i>Checklist pendente: ${
            faltando.map(i => CHECKLIST_ITENS[i].rotulo).join(', ')}. É possível concluir mesmo assim — o registro ficará sinalizado.`;
        aviso.classList.remove('hidden');
    } else {
        aviso.classList.add('hidden');
    }

    const lista = document.getElementById('concluir-lista');
    const pacientes = pacientesDaVisita(app);
    lista.innerHTML = pacientes.map(p => {
        const encerrado = p.status === 'Concluído' || p.status === 'Cancelado';
        const tema = p.status === 'Concluído' ? 'border-green-200 bg-green-50'
                   : p.status === 'Cancelado' ? 'border-slate-200 bg-slate-100'
                   : 'border-slate-200 bg-white';
        const selo = p.status === 'Concluído' ? '<span class="text-[9px] font-black uppercase text-green-700">Concluído</span>'
                   : p.status === 'Cancelado' ? '<span class="text-[9px] font-black uppercase text-slate-500">Cancelado</span>'
                   : '<span class="text-[9px] font-black uppercase text-amber-600">Pendente</span>';
        return `
        <label class="flex items-center gap-3 p-3 rounded-xl border ${tema} cursor-pointer">
            <input type="checkbox" class="concluir-check h-4 w-4 accent-green-600"
                data-indice="${p.indice}" ${p.status === 'Concluído' ? 'checked' : ''} ${p.status === 'Cancelado' ? 'disabled' : ''}>
            <div class="flex-1 min-w-0">
                <div class="text-xs font-black uppercase text-navy-900 truncate">${_cvEscape(p.nome)}${p.titular ? ' <span class="text-[9px] font-bold text-slate-400">(principal)</span>' : ''}</div>
                <div class="text-[10px] font-bold text-slate-400">${idadeLabel(p.idade) || '—'}${p.pedido ? ` · Pedido ${_cvEscape(p.pedido)}` : ''}</div>
            </div>
            ${selo}
        </label>`;
    }).join('');

    document.getElementById('concluir-resumo').textContent =
        `${pacientes.length} paciente${pacientes.length === 1 ? '' : 's'} nesta visita`;

    // Abstinência: obrigatória para concluir nas agendas que usam o campo
    const blocoAbst = document.getElementById('concluir-abstinencia-bloco');
    const inputAbst = document.getElementById('concluir-abstinencia');
    const usaAbst = temCampo('abstinencia', agenda);
    blocoAbst.classList.toggle('hidden', !usaAbst);
    inputAbst.value = usaAbst && app.abstinencia != null ? app.abstinencia : '';

    // Coleta domiciliar: quem confirma a conclusão assume o coletador responsável.
    // O aviso aparece antes de confirmar para que a troca não seja silenciosa.
    const blocoColetador = document.getElementById('concluir-coletador-bloco');
    const usaColetador = temCampo('coletador', agenda);
    blocoColetador.classList.toggle('hidden', !usaColetador);
    if (usaColetador) {
        const nome = coletadorDoUsuarioAtual();
        document.getElementById('concluir-coletador-nome').textContent =
            nome || 'Usuário sem nome na lista de atendentes';
    }

    // Taxa de coleta — só mostra o botão de pagamento quando há valor a receber
    const blocoTaxa = document.getElementById('concluir-taxa-bloco');
    const temTaxa = temCampo('endereco', agenda) && app.taxaColeta > 0;
    blocoTaxa.classList.toggle('hidden', !temTaxa);

    const taxaValor = app.taxaColetaTaxa || 0;
    const pedidoValor = app.taxaColetaPedido != null ? app.taxaColetaPedido : (app.taxaColeta || 0) - taxaValor;
    _concluirTaxaValores = { pedido: pedidoValor, taxa: taxaValor };
    // Registros antigos só têm o flag geral: ele vale para as duas parcelas.
    _concluirTaxaPaga = {
        pedido: app.taxaColetaPedidoPago != null ? !!app.taxaColetaPedidoPago : !!app.taxaColetaPaga,
        taxa:   app.taxaColetaTaxaPago   != null ? !!app.taxaColetaTaxaPago   : !!app.taxaColetaPaga
    };
    if (temTaxa) {
        const brl = v => `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`;
        document.getElementById('concluir-taxa-pedido-valor').textContent = brl(pedidoValor);
        document.getElementById('concluir-taxa-taxa-valor').textContent = brl(taxaValor);
        document.getElementById('concluir-taxa-valor').textContent = brl(app.taxaColeta);
        // Parcela zerada não tem o que quitar: some da janela.
        document.getElementById('concluir-taxa-pedido-linha').classList.toggle('hidden', !pedidoValor);
        document.getElementById('concluir-taxa-taxa-linha').classList.toggle('hidden', !taxaValor);
        _atualizarConcluirTaxaUI();
    }

    document.getElementById('modal-view-record').classList.remove('active');
    document.getElementById('modal-concluir-visita').classList.add('active');
}

function marcarTaxaColetaPagaConcluir(parcela) {
    if (parcela === 'taxa') _concluirTaxaPaga.taxa = !_concluirTaxaPaga.taxa;
    else                    _concluirTaxaPaga.pedido = !_concluirTaxaPaga.pedido;
    _atualizarConcluirTaxaUI();
}

function _pintarBotaoConcluirTaxa(parcela, pago, rotulo) {
    const btn = document.getElementById(`concluir-taxa-${parcela}-btn`);
    const icone = document.getElementById(`concluir-taxa-${parcela}-icone`);
    const texto = document.getElementById(`concluir-taxa-${parcela}-texto`);
    if (!btn) return;

    btn.classList.toggle('border-amber-300', !pago);
    btn.classList.toggle('text-amber-700', !pago);
    btn.classList.toggle('hover:bg-amber-100', !pago);
    btn.classList.toggle('bg-white', !pago);
    btn.classList.toggle('bg-emerald-600', pago);
    btn.classList.toggle('border-emerald-600', pago);
    btn.classList.toggle('text-white', pago);
    btn.classList.toggle('hover:bg-emerald-700', pago);

    icone.classList.toggle('fa-circle-notch', !pago);
    icone.classList.toggle('fa-circle-check', pago);
    texto.textContent = pago ? (parcela === 'taxa' ? 'Paga' : 'Pago') : rotulo;
}

function _atualizarConcluirTaxaUI() {
    const bloco = document.getElementById('concluir-taxa-bloco');
    if (!bloco) return;

    const tudoPago = concluirTaxaTudoPaga();

    bloco.classList.toggle('border-amber-200', !tudoPago);
    bloco.classList.toggle('bg-amber-50/60', !tudoPago);
    bloco.classList.toggle('border-emerald-200', tudoPago);
    bloco.classList.toggle('bg-emerald-50/60', tudoPago);

    _pintarBotaoConcluirTaxa('pedido', _concluirTaxaPaga.pedido, 'Marcar como pago');
    _pintarBotaoConcluirTaxa('taxa', _concluirTaxaPaga.taxa, 'Marcar como paga');
}

// Só conta como quitado quando nenhuma parcela com valor ficou em aberto.
function concluirTaxaTudoPaga() {
    const { pedido, taxa } = _concluirTaxaValores;
    if (!pedido && !taxa) return _concluirTaxaPaga.pedido || _concluirTaxaPaga.taxa;
    return (!pedido || _concluirTaxaPaga.pedido) && (!taxa || _concluirTaxaPaga.taxa);
}

function fecharConcluirVisita() {
    document.getElementById('modal-concluir-visita').classList.remove('active');
    _concluirVisitaId = null;
    _concluirTaxaPaga = { pedido: false, taxa: false };
    _concluirTaxaValores = { pedido: 0, taxa: 0 };
}

function marcarTodosConcluirVisita() {
    document.querySelectorAll('#concluir-lista .concluir-check:not(:disabled)')
        .forEach(c => { c.checked = true; });
}

function confirmarConcluirVisita() {
    const app = appointments.find(a => a.id == _concluirVisitaId);
    if (!app) return fecharConcluirVisita();

    const agenda = getAgenda(app.agendaId || currentAgendaId);

    const marcados = {};
    document.querySelectorAll('#concluir-lista .concluir-check').forEach(c => {
        marcados[c.dataset.indice] = c.checked;
    });

    // Abstinência é obrigatória quando alguém está sendo concluído nesta agenda.
    // `?? null`: o Firebase Realtime Database rejeita `undefined` em .set()
    // (lança na hora, antes de salvar/fechar o modal) — registros antigos sem
    // o campo preenchido tinham `app.abstinencia` undefined.
    let abstinencia = app.abstinencia ?? null;
    if (temCampo('abstinencia', agenda) && Object.values(marcados).some(Boolean)) {
        const val = document.getElementById('concluir-abstinencia').value;
        const dias = val === '' ? null : parseInt(val);
        if (dias == null || isNaN(dias) || dias < 0) {
            showNotification('ERRO: Informe os dias de abstinência para concluir o agendamento.', 'error');
            document.getElementById('concluir-abstinencia').focus();
            return;
        }
        abstinencia = dias;
    }

    const oldRecord = { ...app, acompanhantes: (app.acompanhantes || []).map(a => ({ ...a })) };

    // Só mexe em quem não está cancelado — cancelamento continua saindo da edição
    const acompanhantes = (app.acompanhantes || []).map((a, i) => {
        if (statusPaciente(a) === 'Cancelado') return { ...a };
        return { ...a, status: marcados[i] ? 'Concluído' : 'Agendado' };
    });

    const record = { ...app, acompanhantes, abstinencia };
    if (temCampo('endereco', agenda) && app.taxaColeta > 0) {
        record.taxaColetaPedidoPago = _concluirTaxaPaga.pedido;
        record.taxaColetaTaxaPago    = _concluirTaxaPaga.taxa;
        record.taxaColetaPaga        = concluirTaxaTudoPaga();
    }

    // Na coleta domiciliar o coletador é quem de fato realizou a coleta, então
    // quem conclui a visita substitui o nome previsto no agendamento.
    if (temCampo('coletador', agenda) && Object.values(marcados).some(Boolean)) {
        const coletador = coletadorDoUsuarioAtual();
        if (coletador) record.coletador = coletador;
    }
    if (record.coletador === undefined) record.coletador = null;
    // Auxiliar é do agendamento, não de quem conclui: só normaliza o undefined
    // dos registros anteriores ao campo (o Firebase rejeita undefined em .set()).
    if (record.coletadorAuxiliar === undefined) record.coletadorAuxiliar = null;

    if (app.status !== 'Cancelado') {
        record.status = marcados['-1'] ? 'Concluído' : 'Agendado';
    }
    record.status = statusDerivadoDaVisita(record);
    record.chkConcluido = record.status === 'Concluído';

    // Sem paciente pendente a visita deixa de estar "em coleta" no local
    if (!resumoPacientes(record).pendentes) record.coletaAtiva = false;

    setAppointments(appointments.map(a => a.id == record.id ? record : a));

    const r = resumoPacientes(record);
    persistirAgendamento(record, {
        rev: _concluirVisitaRev,
        audit: { action: 'edit', oldRecord },
        mensagem: r.pendentes
            ? `Conclusão parcial: ${r.concluidos} de ${r.total} paciente(s) concluído(s).`
            : 'Visita concluída para todos os pacientes.'
    });

    fecharConcluirVisita();
    renderTable(); renderCalendar(); updateFilterDropdowns();
}

// Nome do usuário logado na grafia da lista oficial de atendentes. O campo
// coletador só aceita nomes da lista — usuário fora dela não vira coletador.
function coletadorDoUsuarioAtual() {
    const nome = currentUser?.fullName;
    if (!nome) return '';
    return nomeOficialDe(nome) || '';
}

function _cvEscape(v) {
    return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
