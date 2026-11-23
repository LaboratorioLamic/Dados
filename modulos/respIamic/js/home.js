// Tela inicial: cards de seleção de agenda

// Estatísticas ao vivo de uma agenda
function agendaStats(agendaId) {
    const agenda = getAgenda(agendaId);
    const lista = appointmentsDe(agendaId);

    const hojeStr = toDateStr(new Date());
    const inicioSemana = getWeekStart(new Date());
    const fimSemana = new Date(inicioSemana); fimSemana.setDate(fimSemana.getDate() + 6);
    const iniStr = toDateStr(inicioSemana);
    const fimStr = toDateStr(fimSemana);
    const hoje = startOfDay(new Date());

    const ativos = lista.filter(a => a.status !== 'Cancelado');
    const doDia = ativos.filter(a => a.data === hojeStr);
    const daSemana = ativos.filter(a => a.data >= iniStr && a.data <= fimStr);
    const pendentes = ativos.filter(a => a.status === 'Agendado');
    const ausentes = ativos.filter(a => a.status === 'Ausente');
    const atrasados = ativos.filter(a => {
        if (a.status === 'Concluído' || a.status === 'Ausente') return false;
        const [y, m, d] = a.data.split('-').map(Number);
        return new Date(y, m - 1, d) < hoje;
    });

    // Capacidade do dia corrente (varia por dia em agendas com limiteDia: 'slots')
    const capacidade = limiteDoDia(new Date().getDay(), agenda);
    const ocupacao = capacidade
        ? Math.min(100, Math.round((vagasOcupadasNoDia(doDia, agenda) / capacidade) * 100))
        : 0;

    return {
        hoje: doDia.length,
        semana: daSemana.length,
        pendentes: pendentes.length,
        ausentes: ausentes.length,
        atrasados: atrasados.length,
        total: lista.length,
        capacidade,
        aberta: capacidade > 0,
        ocupacao
    };
}

// Descrição legível da janela de atendimento (pode ter mais de um turno)
function agendaHorarioLabel(agenda) {
    const faixas = faixasBrutas(null, agenda);
    if (!faixas.length) return '—';
    return faixas.map(([i, f]) => `${minToTime(i)}–${minToTime(f)}`).join(' · ');
}

// Intervalo entre pacientes
function agendaIntervaloLabel(agenda) {
    return agenda.slotMin ? `${agenda.slotMin} min entre pacientes` : 'Horário livre';
}

function agendaDiasLabel(agenda) {
    const nomes = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const dias = [...agenda.dias].sort();
    const seq = dias.every((d, i) => i === 0 || d === dias[i - 1] + 1);
    return seq && dias.length > 1 ? `${nomes[dias[0]]} a ${nomes[dias[dias.length - 1]]}` : dias.map(d => nomes[d]).join(', ');
}

function renderHomeCards() {
    const grid = document.getElementById('home-cards-grid');
    if (!grid) return;

    grid.innerHTML = AGENDA_IDS.map(id => {
        const agenda = getAgenda(id);
        const st = agendaStats(id);
        const ativa = id === currentAgendaId;

        const alerta = `
            ${st.ausentes > 0 ? `<span class="home-card-alert home-card-alert-ausente"><i class="fas fa-user-xmark"></i>${st.ausentes} ausente${st.ausentes > 1 ? 's' : ''}</span>` : ''}
            ${st.atrasados > 0 ? `<span class="home-card-alert home-card-alert-atrasado"><i class="fas fa-triangle-exclamation"></i>${st.atrasados} atrasado${st.atrasados > 1 ? 's' : ''}</span>` : ''}
        `.trim();

        return `
        <article class="home-card home-card-${agenda.cor} ${ativa ? 'is-current' : ''}" data-agenda-card="${id}">
            <button type="button" class="home-card-main" onclick="openAgendaFrom('${id}','dashboard')"
                aria-label="Abrir agenda ${agenda.nome}">

                <div class="home-card-top">
                    <span class="home-card-icon"><i class="fas ${agenda.icon}"></i></span>
                    <div class="home-card-title">
                        <h3>${agenda.nome}${agenda.cidadeTag ? ` <span class="agenda-cidade-tag"><i class="fas fa-city"></i>${agenda.cidadeTag}</span>` : ''}</h3>
                        <p>${agenda.subtitulo}</p>
                    </div>
                    ${ativa ? '<span class="home-card-flag">Ativa</span>' : ''}
                </div>

                <p class="home-card-desc">${agenda.descricao}</p>

                <div class="home-card-meta">
                    <span><i class="fas fa-clock"></i>${agendaHorarioLabel(agenda)}</span>
                    <span><i class="fas fa-calendar-week"></i>${agendaDiasLabel(agenda)}</span>
                    <span><i class="fas fa-hourglass-half"></i>${duracaoLabel(agenda.duracao.tipo === 'fixa' ? agenda.duracao.fixaMin : 0) || 'Por exame'}</span>
                    <span><i class="fas fa-stopwatch"></i>${agendaIntervaloLabel(agenda)}</span>
                </div>

                <div class="home-card-stats">
                    <div class="home-stat"><strong>${st.hoje}</strong><span>Hoje</span></div>
                    <div class="home-stat"><strong>${st.semana}</strong><span>Semana</span></div>
                    <div class="home-stat"><strong>${st.pendentes}</strong><span>Pendentes</span></div>
                    <div class="home-stat"><strong>${st.total}</strong><span>Total</span></div>
                </div>

                <div class="home-card-gauge">
                    <div class="home-gauge-head">
                        <span>Ocupação de hoje</span>
                        <span>${st.aberta ? `${st.hoje}/${st.capacidade} vagas` : 'Fechado hoje'}</span>
                    </div>
                    <div class="home-gauge-track"><div class="home-gauge-fill" style="width:${st.ocupacao}%"></div></div>
                </div>
                ${alerta ? `<div class="home-card-alerts">${alerta}</div>` : ''}
            </button>

            <div class="home-card-actions">
                <button type="button" onclick="openAgendaFrom('${id}','dashboard')" title="Abrir agenda">
                    <i class="fas fa-calendar-alt"></i><span>Agenda</span>
                </button>
                <button type="button" onclick="openAgendaFrom('${id}','dados')" title="Abrir tabela">
                    <i class="fas fa-table-list"></i><span>Tabela</span>
                </button>
                <button type="button" onclick="openAgendaFrom('${id}','indicadores')" title="Abrir indicadores">
                    <i class="fas fa-chart-line"></i><span>Indicadores</span>
                </button>
            </div>
        </article>`;
    }).join('');
}
