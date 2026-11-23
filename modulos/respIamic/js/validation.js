// Regras de negócio e validação de agendamentos (dirigidas pela config da agenda)

const _DIAS_NOME = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

// Sinaliza que a última validação passou usando a margem excepcional do horário
// (endereço além do limite). Lida por save.js para pedir confirmação.
let _slotExcedenteNaValidacao = false;

function validateAppointment(dataObj) {
    const agenda = currentAgenda();
    _slotExcedenteNaValidacao = false;

    // Paciente menor de 18 anos: responsável e grau de parentesco são obrigatórios.
    if (!isNaN(dataObj.idade) && dataObj.idade < 18 &&
        (!dataObj.responsavelNome || !dataObj.responsavelParentesco)) {
        return "PACIENTE MENOR DE IDADE: informe o nome do responsável e o grau de parentesco.";
    }

    const appDate = new Date(dataObj.data + 'T12:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Verificar se a data é anterior a hoje
    if (appDate < today) {
        return "DATA_PASSADA";
    }

    const dayOfWeek = appDate.getDay();

    // Dia da semana atendido por esta agenda
    if (!agenda.dias.includes(dayOfWeek)) {
        return `A agenda ${agenda.nome} não atende ${_DIAS_NOME[dayOfWeek]}.`;
    }

    // Janela de horário de início (pode ter mais de um turno)
    const faixas = janelaAgenda(dayOfWeek, agenda);
    const inicioMin = timeToMin(dataObj.horaInicio);
    if (!faixas.length || inicioMin === null) {
        return "Horário de início inválido.";
    }

    const faixa = faixaDoMinuto(inicioMin, faixas);
    if (!faixa) {
        const brutas = faixasBrutas(dayOfWeek, agenda);
        const turnos = brutas.map(([i, f]) => `${minToTime(i)}–${minToTime(f)}`).join(' e ');
        const complemento = agenda.slotMin && agenda.duracao.tipo === 'fixa'
            ? ` (último início de cada turno recuado em ${agenda.duracao.fixaMin} minutos, a duração do atendimento)`
            : '';
        return `O horário permitido nesta agenda é ${turnos}${complemento}.`;
    }

    // Reserva etária: nas agendas que declaram `idadeMinima`, o começo da janela
    // fica reservado para pacientes mais novos. A regra vale só para marcações
    // ativas — cancelar um agendamento que já está no horário continua liberado.
    const reserva = agenda.idadeMinima;
    const desdeMin = reservaDesdeMin(dayOfWeek, agenda);
    if (reserva && desdeMin != null && dataObj.status !== 'Cancelado' &&
        !isNaN(dataObj.idade) && dataObj.idade >= reserva.idade &&
        inicioMin < desdeMin) {
        const limiteDia = faixas[faixas.length - 1][1];
        return limiteDia < desdeMin
            ? `Pacientes com ${reserva.idade} anos ou mais só podem ser agendados a partir das ${minToTime(desdeMin)}, e ${_DIAS_NOME[dayOfWeek]} a agenda ${agenda.nome} atende só até ${minToTime(limiteDia)}. Escolha outro dia.`
            : `${_DIAS_NOME[dayOfWeek]}, pacientes com ${reserva.idade} anos ou mais só podem ser agendados a partir das ${minToTime(desdeMin)}. O intervalo anterior fica reservado para pacientes mais novos.`;
    }

    // Alinhamento à grade de slots, relativo ao início do turno
    if (agenda.slotMin && (inicioMin - faixa[0]) % agenda.slotMin !== 0) {
        return `Os agendamentos desta agenda ocorrem de ${agenda.slotMin} em ${agenda.slotMin} minutos. Escolha um horário válido da grade.`;
    }

    // Horário desabilitado pelo setor responsável neste dia. Editar um
    // agendamento que já ocupava o horário continua permitido — o bloqueio vale
    // para marcações novas e para remarcações vindas de outro horário.
    if (dataObj.status !== 'Cancelado' && slotBloqueado(dataObj.data, dataObj.horaInicio, agenda)) {
        const original = appointments.find(a => a.id == dataObj.id);
        if (!original || original.data !== dataObj.data || original.horaInicio !== dataObj.horaInicio) {
            return MSG_SLOT_BLOQUEADO;
        }
    }

    // Ocupação do dia: só o cancelamento devolve a vaga. Uma ausência mantém o
    // horário consumido — a vaga foi perdida pela falta e não é reaproveitada.
    const doDia = appointments.filter(a =>
        a.data === dataObj.data && a.id !== dataObj.id && !vagaLiberada(a.status)
    );

    // Lotação do horário — nas agendas que agrupam por endereço, vários pacientes
    // do MESMO endereço dividem uma única vaga (a coleta é a mesma visita).
    if (agenda.slotUnico && dataObj.status !== 'Cancelado') {
        const noSlot = doDia.filter(a => a.horaInicio === dataObj.horaInicio);
        if (!slotAceita(dataObj, noSlot, agenda)) {
            // Margem excepcional (domiciliares): o endereço extra passa, mas o
            // salvamento pede confirmação com a equipe de coleta.
            if (slotAceitaComExcecao(dataObj, noSlot, agenda)
                || diaAceitaExcedente(dataObj.data, doDia, noSlot, agenda)) {
                _slotExcedenteNaValidacao = true;
            } else {
                const limiteSlot = limiteDoSlot(agenda);
                return limiteSlot > 1
                    ? `O horário das ${dataObj.horaInicio} já tem ${limiteSlot} endereços. Só é possível encaixar mais um agendamento se for no mesmo endereço de um dos existentes.`
                    : `Já existe um agendamento às ${dataObj.horaInicio}. Escolha outro horário.`;
            }
        }
    }

    // Limite diário — conta vagas (endereços), não agendamentos
    const limite = limiteDoDia(dayOfWeek, agenda);
    const vagasDia = vagasOcupadasNoDia(doDia, agenda);
    const jaTemEndereco = agenda.agrupaPorEndereco
        && doDia.some(a => a.horaInicio === dataObj.horaInicio && mesmoEndereco(a, dataObj));
    // O encaixe excepcional de horário também abre a margem do dia: barrar aqui
    // anularia a exceção sempre que a grade estivesse cheia.
    // Margem do dia (ex.: sábado do espermograma): passa só com confirmação.
    if (vagasDia >= limite && !jaTemEndereco && dataObj.status !== 'Cancelado'
        && !_slotExcedenteNaValidacao
        && diaAceitaExcedente(dataObj.data, doDia, doDia.filter(a => a.horaInicio === dataObj.horaInicio), agenda)) {
        _slotExcedenteNaValidacao = true;
    }
    const margemDia = _slotExcedenteNaValidacao
        ? Math.max(agenda.limiteSlotExcedivel || 0, margemDiaExcedivel(dayOfWeek, agenda)) : 0;
    if (vagasDia >= limite + margemDia && !jaTemEndereco && dataObj.status !== 'Cancelado') {
        return `Limite diário alcançado (Máx ${limite} ativos).`;
    }

    // Abstinência obrigatória apenas ao concluir
    if (temCampo('abstinencia', agenda) && dataObj.status === 'Concluído') {
        const dias = dataObj.abstinencia;
        if (dias === '' || dias === null || dias === undefined || isNaN(dias)) {
            return "Informe os dias de abstinência para concluir o agendamento.";
        }
    }

    // Endereço obrigatório nas agendas domiciliares
    if (temCampo('endereco', agenda) && dataObj.status !== 'Cancelado') {
        const faltando = [];
        if (!dataObj.logradouro) faltando.push('Logradouro');
        if (!dataObj.numero) faltando.push('Número');
        if (!dataObj.bairro) faltando.push('Bairro');
        if (!dataObj.cidade) faltando.push('Cidade');
        if (faltando.length) {
            return `Endereço incompleto. Preencha: ${faltando.join(', ')}.`;
        }
        if (!dataObj.taxaColetaPaga && !(dataObj.taxaColeta > 0)) {
            return "Informe o valor do Pedido e/ou a Taxa, ou marque como Pago.";
        }
        if (!Array.isArray(dataObj.taxaColetaTipos) || !dataObj.taxaColetaTipos.length) {
            return "Selecione o Tipo da coleta: Particular e/ou Convênio.";
        }
        if (dataObj.taxaColetaTipos.includes('Convênio') &&
            (!Array.isArray(dataObj.taxaColetaConvenios) || !dataObj.taxaColetaConvenios.length)) {
            return "Selecione o(s) Convênio(s) da coleta.";
        }
    }

    // Intervalo mínimo entre marcações do mesmo paciente
    if (agenda.regra48h) {
        const samePatient = appointments.filter(a =>
            normalizeStr(a.paciente) === normalizeStr(dataObj.paciente) &&
            a.id !== dataObj.id &&
            a.status !== 'Cancelado'
        );

        for (let app of samePatient) {
            const existingDate = new Date(app.data + 'T12:00:00');
            const diffDays = Math.ceil(Math.abs(appDate - existingDate) / (1000 * 60 * 60 * 24));
            if (diffDays < 2 && dataObj.status !== 'Cancelado') {
                return "Intervalo insuficiente. Só é permitido marcar após 48 Horas da última marcação do paciente.";
            }
        }
    }

    return null;
}
