// Calendário — visões mensal e semanal

const MONTH_NAMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const MONTH_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// Janela horária exibida na visão semanal (base vem da config da agenda)
const WEEK_HOUR_PX = 56;

// HELPERS DE DATA
function toDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function startOfDay(d) { const c = new Date(d); c.setHours(0, 0, 0, 0); return c; }
function getWeekStart(date) {
    const d = startOfDay(date);
    d.setDate(d.getDate() - d.getDay()); // domingo
    return d;
}
function timeToMin(hhmm) {
    if (!hhmm) return null;
    const [h, m] = hhmm.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
}
function minToTime(min) {
    return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

// Faixas de horário inicial permitidas por dia da semana (config da agenda ativa)
function allowedStartWindow(dayOfWeek) {
    return janelaAgenda(dayOfWeek);
}

// CONTROLE DE VISÃO
function setCalendarView(view) {
    calendarView = view === 'week' ? 'week' : 'month';
    localStorage.setItem('respiroCalendarView', calendarView);
    renderCalendar();
}

function goToToday() {
    currentDate = new Date();
    renderCalendar();
}

function navigatePeriod(dir) {
    if (calendarView === 'week') {
        currentDate.setDate(currentDate.getDate() + dir * 7);
    } else {
        currentDate.setDate(1);
        currentDate.setMonth(currentDate.getMonth() + dir);
    }
    renderCalendar();
}

// Mantido por compatibilidade com chamadas existentes
function changeMonth(dir) { navigatePeriod(dir); }

function syncViewTabs() {
    ['month', 'week'].forEach(v => {
        const tab = document.getElementById(`view-tab-${v}`);
        if (!tab) return;
        const active = calendarView === v;
        tab.classList.toggle('view-tab-active', active);
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    const monthEl = document.getElementById('calendar-month-view');
    const weekEl = document.getElementById('calendar-week-view');
    if (monthEl) monthEl.classList.toggle('hidden', calendarView !== 'month');
    if (weekEl) weekEl.classList.toggle('hidden', calendarView !== 'week');

    const prev = document.getElementById('btn-period-prev');
    const next = document.getElementById('btn-period-next');
    if (prev) prev.title = calendarView === 'week' ? 'Semana anterior' : 'Mês anterior';
    if (next) next.title = calendarView === 'week' ? 'Próxima semana' : 'Próximo mês';
}

// DISPATCHER
function renderCalendar() {
    syncViewTabs();
    if (calendarView === 'week') renderWeekView();
    else renderMonthView();
}

// Cor de destaque do agendamento: por exame quando a agenda tem exames, senão a cor da agenda
function accentDoAgendamento(app, agenda) {
    const ag = agenda || currentAgenda();
    if (!temCampo('exame', ag)) return agendaCores(ag).accent;
    return app.exame === 'TRESP' ? 'bg-blue-600' : 'bg-emerald-600';
}

// TEMA COMPARTILHADO DE AGENDAMENTO
function getAppointmentTheme(app, isPastDate) {
    const agenda = currentAgenda();
    const cores = agendaCores(agenda);
    const accent = accentDoAgendamento(app, agenda);
    // Ausente já é um desfecho: não vira "atrasado" quando a data passa.
    const isOverdue = isPastDate && !pacienteEncerrado(app.status);

    if (isOverdue) return { bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-700', accent: 'bg-red-600', overdue: true };
    // Ausente — âmbar de alerta, distinto do vermelho de atrasado (que ainda
    // pode ser resolvido) e do cinza apagado do cancelado.
    if (app.status === 'Ausente') return { bg: 'bg-amber-50', border: 'border-amber-400', text: 'text-amber-800', accent: 'bg-amber-500', absent: true };
    if (app.status === 'Cancelado') return { bg: 'bg-slate-100', border: 'border-slate-200', text: 'text-slate-400', accent: 'bg-slate-400', canceled: true };
    if (app.status === 'Em andamento') return { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', accent: 'bg-purple-600' };
    // Concluído: além do verde, ganha um selo de check no card. A cor sozinha
    // ficava perto demais dos agendados/em andamento em cards pequenos.
    // Concluído com checklist pendente troca o verde sólido pelo listrado
    // verde/amarelo — a visita foi concluída mesmo assim, só fica sinalizada.
    if (app.status === 'Concluído') {
        const checklistPendente = agenda.checklist.some(item => !app[CHECKLIST_ITENS[item].chave]);
        return checklistPendente
            ? { bg: '', border: 'border-yellow-400', text: 'text-green-700', accent: 'bg-green-600', done: true, checklistPendente: true }
            : { bg: 'bg-green-50', border: 'border-green-300', text: 'text-green-700', accent: 'bg-green-600', done: true };
    }

    const faixa = faixaEtariaDe(app, agenda);
    const t = temaFaixaEtaria(app, agenda);
    if (t) {
        return { bg: t.bg, border: t.border, text: t.text, accent, faixa };
    }
    return { bg: cores.bg, border: cores.border, text: cores.text, accent };
}

// ── RESUMO DO DIA NA VISÃO MENSAL ───────────────────────────
// A célula do mês não mostra mais uma bolinha por agendamento: mesmo em agendas
// pequenas a nuvem de pontos só dizia "tem gente", sem dizer quanto falta nem o
// que precisa de ação — e na domiciliar (27 vagas/dia) virava ilegível.
// Todas as agendas passam a usar o mesmo resumo: contador de ocupação, barra
// segmentada por status e selos só das exceções. O que muda por agenda é o
// conteúdo: a composição por exame só existe onde há exame, o selo de
// localidade distante e o de coleta em andamento só na domiciliar, e assim por
// diante — cada peça aparece quando a agenda declara aquele campo.

// Faixas etárias presentes no dia, só as que a agenda realça. Vira um selo por
// faixa não-adulta: quem lê o mês quer saber se há criança ou RN na rota, e não
// a idade de cada paciente — essa está no detalhe do dia.
function faixasDoDia(dayApps, agenda) {
    return ['rn', 'infantil', 'adolescente']
        .filter(f => agenda.faixaEtaria.includes(f))
        .map(f => ({ faixa: f, n: dayApps.filter(a => faixaEtariaDe(a, agenda) === f).length }))
        .filter(x => x.n);
}

// Composição do dia por modalidade de exame — só faz sentido onde a agenda
// separa TRESP de TSBAC; nas demais o status já conta a história toda.
function examesDoDia(dayApps, agenda) {
    if (!temCampo('exame', agenda)) return null;
    const tresp = dayApps.filter(a => a.exame === 'TRESP').length;
    const tsbac = dayApps.filter(a => a.exame === 'TSBAC').length;
    return (tresp || tsbac) ? { tresp, tsbac } : null;
}

// Quebra o dia por status, na mesma precedência de cor usada nos cards.
// Quem ainda está agendado é separado por exame nas agendas que têm exame, para
// a barra distinguir TRESP de TSBAC do mesmo jeito que os cards da semana.
function statusDoDia(dayApps, agenda, isPastDate) {
    const conta = { concluidos: 0, andamento: 0, atrasados: 0, ausentes: 0, agendados: 0, agendadosTresp: 0, agendadosTsbac: 0 };
    dayApps.forEach(a => {
        if (a.status === 'Concluído') conta.concluidos++;
        else if (a.status === 'Ausente') conta.ausentes++;
        else if (isPastDate) conta.atrasados++;
        else if (a.status === 'Em andamento') conta.andamento++;
        else {
            conta.agendados++;
            if (a.exame === 'TRESP') conta.agendadosTresp++;
            else if (a.exame === 'TSBAC') conta.agendadosTsbac++;
        }
    });
    return conta;
}

// Barra de ocupação: cada segmento é uma fatia proporcional ao limite do dia,
// então o vazio restante já comunica quantas vagas sobram.
function barraOcupacaoHtml(conta, ocupadas, limiteDia, cores, agenda) {
    const total = Math.max(limiteDia || ocupadas || 1, ocupadas);
    const seg = (n, cls) => n ? `<span class="day-bar-seg ${cls}" style="width:${(n / total) * 100}%"></span>` : '';
    // Agendados: por modalidade onde ela existe, senão na cor da agenda.
    const porExame = temCampo('exame', agenda);
    const agendados = porExame
        ? seg(conta.agendadosTresp, 'bg-blue-500')
          + seg(conta.agendadosTsbac, 'bg-emerald-500')
          + seg(conta.agendados - conta.agendadosTresp - conta.agendadosTsbac, cores.dot)
        : seg(conta.agendados, cores.dot);
    return `<span class="day-bar">
        ${seg(conta.concluidos, 'bg-green-500')}
        ${seg(conta.atrasados, 'bg-red-500')}
        ${seg(conta.ausentes, 'bg-amber-500')}
        ${seg(conta.andamento, 'bg-purple-500')}
        ${agendados}
    </span>`;
}

// Quantos selos cabem na célula do mês antes de quebrar a linha e empurrar o
// resto para fora. O excedente vira um "+n" com a lista completa no title.
const DAY_CHIPS_MAX = 3;

// Selos do dia — primeiro o que exige ação do setor, depois a composição do dia
// (modalidade, faixa etária). Um dia tranquilo mostra só contador e barra.
// Cada peça depende do que a agenda declara: exame só onde há exame, distância
// e coleta em curso só onde há endereço.
function selosDoDia(dayApps, canceledApps, agenda) {
    const selos = [];

    const pendentes = dayApps.filter(a =>
        a.status !== 'Cancelado' && a.status !== 'Em andamento'
        && agenda.checklist.some(item => !a[CHECKLIST_ITENS[item].chave])).length;
    // Campos exclusivos da domiciliar: sem endereço não há distância nem coleta
    // em curso para sinalizar.
    const domiciliar = temCampo('endereco', agenda);
    const distantes = domiciliar ? dayApps.filter(a => a.distante).length : 0;
    const emColeta = domiciliar ? dayApps.filter(a => a.coletaAtiva && resumoPacientes(a).pendentes > 0).length : 0;

    if (emColeta) selos.push({ rotulo: `${emColeta} em coleta agora`, html: `<span class="day-chip day-chip-live" title="${emColeta} coleta(s) em andamento agora"><i class="fas fa-play"></i>${emColeta > 1 ? emColeta : ''}</span>` });
    if (pendentes) selos.push({ rotulo: `${pendentes} com checklist pendente`, html: `<span class="day-chip day-chip-warn" title="${pendentes} com checklist pendente"><i class="fas fa-clipboard-list"></i>${pendentes}</span>` });
    if (distantes) selos.push({ rotulo: `${distantes} em localidade distante`, html: `<span class="day-chip day-chip-far" title="${distantes} em localidade distante"><i class="fas ${DISTANTE_TEMA.icon}"></i>${distantes > 1 ? distantes : ''}</span>` });
    if (canceledApps.length) selos.push({ rotulo: `${canceledApps.length} cancelado(s)`, html: `<span class="day-chip day-chip-cancel" title="${canceledApps.length} cancelado(s)"><i class="fas fa-ban"></i>${canceledApps.length}</span>` });

    // Composição por exame (respiratório): quantos TRESP e quantos TSBAC.
    const exames = examesDoDia(dayApps, agenda);
    if (exames) {
        if (exames.tresp) selos.push({ rotulo: `${exames.tresp} TRESP`, html: `<span class="day-chip day-chip-tresp" title="${exames.tresp} TRESP">TRESP ${exames.tresp}</span>` });
        if (exames.tsbac) selos.push({ rotulo: `${exames.tsbac} TSBAC`, html: `<span class="day-chip day-chip-tsbac" title="${exames.tsbac} TSBAC">TSBAC ${exames.tsbac}</span>` });
    }

    // Faixas etárias que exigem preparo diferente (RN, infantil, adolescente).
    // Com mais de uma no mesmo dia elas viram um selo só: na domiciliar quase
    // todo dia tem as três, e três selos de idade empurravam para fora da
    // célula justamente as exceções que precisam de ação.
    const faixas = faixasDoDia(dayApps, agenda);
    if (faixas.length === 1) {
        const { faixa, n } = faixas[0];
        const t = FAIXA_ETARIA_TEMA[faixa];
        const rotulo = `${n} ${t.rotulo.toLowerCase()}`;
        selos.push({ rotulo, html: `<span class="day-chip day-chip-faixa day-chip-${faixa}" title="${rotulo}">${t.rotulo.slice(0, 3)} ${n}</span>` });
    } else if (faixas.length > 1) {
        const rotulo = faixas.map(({ faixa, n }) => `${n} ${FAIXA_ETARIA_TEMA[faixa].rotulo.toLowerCase()}`).join(' · ');
        const menores = faixas.reduce((s, f) => s + f.n, 0);
        selos.push({ rotulo, html: `<span class="day-chip day-chip-faixa day-chip-menores" title="${rotulo}"><i class="fas fa-child"></i>${menores}</span>` });
    }

    if (selos.length <= DAY_CHIPS_MAX) return selos.map(s => s.html).join('');
    // Corta em DAY_CHIPS_MAX - 1 para o próprio "+n" caber na mesma linha
    const visiveis = selos.slice(0, DAY_CHIPS_MAX - 1);
    const ocultos = selos.slice(DAY_CHIPS_MAX - 1);
    return visiveis.map(s => s.html).join('')
        + `<span class="day-chip day-chip-mais" title="${ocultos.map(s => s.rotulo).join(' · ')}">+${ocultos.length}</span>`;
}

// VISÃO MENSAL
function renderMonthView() {
    const agenda = currentAgenda();
    const cores = agendaCores(agenda);
    const body = document.getElementById('calendar-body'); body.innerHTML = '';
    const year = currentDate.getFullYear(); const month = currentDate.getMonth();
    document.getElementById('current-month-label').innerText = `${MONTH_NAMES[month]} ${year}`;
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let i = 0; i < firstDay; i++) body.innerHTML += `<div class="p-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60"></div>`;
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dateObj = new Date(year, month, day);
        const isClosed = !agenda.dias.includes(dateObj.getDay());   // dia sem atendimento nesta agenda
        const isSunday = dateObj.getDay() === 0;
        const isHoliday = holidays[dateStr];

        // Exclui os cancelados da contagem de lotação do dia
        const dayApps = appointments.filter(a => a.data === dateStr && a.status !== 'Cancelado');
        const limiteDia = limiteDoDia(dateObj.getDay(), agenda);

        // Verifica se há agendamentos cancelados no dia
        const canceledApps = appointments.filter(a => a.data === dateStr && a.status === 'Cancelado');

        // Verifica se todos os agendamentos do dia estão concluídos
        const allCompleted = dayApps.length > 0 && dayApps.every(a => a.status === 'Concluído');

        // Verifica se há agendamentos atrasados (data menor que hoje e não concluídos)
        const today = startOfDay(new Date());
        const calendarDate = startOfDay(new Date(year, month, day));
        const isPastDate = calendarDate < today;
        // Ausente é desfecho, não pendência: pinta âmbar, não vermelho.
        // Vermelho fica reservado ao que passou da data e segue em aberto.
        const hasAbsent = dayApps.some(a => a.status === 'Ausente');
        const hasOverdue = isPastDate && dayApps.some(a => a.status !== 'Concluído' && a.status !== 'Ausente');

        // Define classes baseado no estado do dia
        let boxClass, textColor, clickAction;

        if (isHoliday) {
            // Estilo de feriado (cinza, como domingo)
            boxClass = 'bg-slate-100 border-slate-300 opacity-60 cursor-pointer';
            textColor = 'text-slate-400';
            clickAction = `openDayDetails('${dateStr}')`;
        } else if (isClosed) {
            // Dia sem atendimento nesta agenda
            boxClass = isSunday
                ? 'bg-red-50/30 border-red-100 opacity-60 cursor-not-allowed'
                : 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed';
            textColor = isSunday ? 'text-red-400' : 'text-slate-400';
            clickAction = '';
        } else {
            boxClass = `bg-white ${cores.ring} border-slate-200 cursor-pointer`;
            textColor = 'text-navy-900';
            clickAction = `openDayDetails('${dateStr}')`;

            if(dayApps.length > 0) {
                // Prioridade: Atrasado > Concluído > Em andamento > Infantil > Normal
                if(hasOverdue) {
                    // Dias com agendamentos atrasados ficam vermelhos
                    boxClass = 'bg-red-50 border-red-300 cursor-pointer';
                    textColor = 'text-red-700';
                } else if(hasAbsent) {
                    // Ausência é desfecho de alerta: âmbar, sem confundir com atraso
                    boxClass = 'bg-amber-50 border-amber-300 cursor-pointer';
                    textColor = 'text-amber-700';
                } else if(allCompleted) {
                    // Dias com todos agendamentos concluídos ficam verdes
                    boxClass = 'bg-green-50 border-green-300 cursor-pointer';
                    textColor = 'text-green-700';
                } else {
                    // Verifica se há agendamentos "Em andamento" para priorizar a cor roxa
                    const hasAndamento = dayApps.some(a => a.status === 'Em andamento');

                    if(hasAndamento) {
                        boxClass = 'bg-purple-50 border-purple-300 cursor-pointer';
                    } else {
                        // O fundo do dia fica reservado ao estado operacional.
                        // Faixa etária virou selo no rodapé da célula: pintar o dia
                        // pela idade do primeiro paciente encontrado dizia pouco e
                        // competia com a leitura de ocupação.
                        boxClass = `${cores.bg} ${cores.border} cursor-pointer`;
                    }
                }
            }
        }

        const holidayIcon = isHoliday ? '<div class="absolute top-1 right-1 text-red-400"><i class="fas fa-calendar-times text-xs"></i></div>' : '';
        const isToday = calendarDate.getTime() === today.getTime();

        // Resumo compacto do dia — no celular a coluna é estreita demais para uma
        // bolinha por agendamento (quebravam em várias linhas e empurravam o
        // rótulo de vagas para fora da célula). Vira contador + barra de ocupação.
        const ocupadas = vagasOcupadasNoDia(dayApps, agenda);
        const pct = limiteDia ? Math.min(100, Math.round((ocupadas / limiteDia) * 100)) : 0;
        const barraCor = hasOverdue ? 'bg-red-500' : hasAbsent ? 'bg-amber-500' : allCompleted ? 'bg-green-500' : pct >= 100 ? 'bg-amber-500' : cores.dot;
        const resumoMobile = isHoliday
            ? '<span class="day-compact-tag text-red-400">Feriado</span>'
            : dayApps.length
                ? `<span class="day-compact-count ${textColor}">${ocupadas}<span class="day-compact-limit">/${limiteDia}</span></span>
                   <span class="day-compact-bar"><span class="day-compact-bar-fill ${barraCor}" style="width:${pct}%"></span></span>`
                : '';

        // Corpo do dia: contador de ocupação + barra por status + selos.
        // Substitui a antiga nuvem de bolinhas em todas as agendas.
        let corpoDenso = '';
        if (!isHoliday && dayApps.length) {
            const conta = statusDoDia(dayApps, agenda, isPastDate);
            const livres = Math.max(0, (limiteDia || 0) - ocupadas);
            // Dia já vivido não tem "vaga livre" a oferecer: o que importa ali é
            // quanto ficou em aberto (atrasado/ausente) ou se fechou tudo.
            const rotulo = isPastDate
                ? (conta.atrasados
                    ? `<span class="day-dense-free day-dense-late">${conta.atrasados} em aberto</span>`
                    : conta.ausentes
                        ? `<span class="day-dense-free day-dense-full">${conta.ausentes} ausente${conta.ausentes > 1 ? 's' : ''}</span>`
                        : '<span class="day-dense-free day-dense-done">Fechado</span>')
                : livres
                    ? `<span class="day-dense-free">${livres} livre${livres > 1 ? 's' : ''}</span>`
                    : '<span class="day-dense-free day-dense-full">Lotado</span>';
            corpoDenso = `<div class="day-dense">
                <div class="day-dense-top">
                    <span class="day-dense-count ${textColor}">${ocupadas}<span class="day-dense-limit">/${limiteDia}</span></span>
                    ${rotulo}
                </div>
                ${barraOcupacaoHtml(conta, ocupadas, limiteDia, cores, agenda)}
                <div class="day-chips">${selosDoDia(dayApps, canceledApps, agenda)}</div>
            </div>`;
        } else if (!isHoliday && canceledApps.length) {
            // Dia só com cancelados: ainda vale sinalizar que houve movimento
            corpoDenso = `<div class="day-dense day-dense-vazio"><div class="day-chips">${selosDoDia(dayApps, canceledApps, agenda)}</div></div>`;
        }

        body.innerHTML += `<div onclick="${clickAction}" class="calendar-day calendar-day-dense h-24 border rounded-2xl flex flex-col group relative ${boxClass} ${isToday ? 'calendar-day-today' : ''}">
            ${holidayIcon}
            <span class="font-black text-sm ${textColor}">${day}</span>
            ${corpoDenso}
            ${isHoliday ? '<span class="day-vagas text-[8px] font-black uppercase tracking-wider mt-auto text-red-400">Feriado</span>' : ''}
            <div class="day-compact">${resumoMobile}</div>
        </div>`;
    }
}

// VISÃO SEMANAL
function renderWeekView() {
    const head = document.getElementById('week-head');
    const canvas = document.getElementById('week-canvas');
    if (!head || !canvas) return;

    const agenda = currentAgenda();
    const slotMin = agenda.slotMin || 30;

    const weekStart = getWeekStart(currentDate);
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6);
    const today = startOfDay(new Date());

    // Rótulo do período
    const sameYear = weekStart.getFullYear() === weekEnd.getFullYear();
    const left = `${String(weekStart.getDate()).padStart(2, '0')} ${MONTH_SHORT[weekStart.getMonth()]}${sameYear ? '' : ' ' + weekStart.getFullYear()}`;
    const right = `${String(weekEnd.getDate()).padStart(2, '0')} ${MONTH_SHORT[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`;
    document.getElementById('current-month-label').innerText = `${left} – ${right}`;

    // CABEÇALHO
    let headHtml = '<div class="week-gutter-head"></div>';
    for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart); d.setDate(d.getDate() + i);
        const dateStr = toDateStr(d);
        const isToday = d.getTime() === today.getTime();
        const isHoliday = !!holidays[dateStr];
        // Vagas consumidas — agendamentos do mesmo endereço dividem uma vaga
        const activeCount = vagasOcupadasNoDia(
            appointments.filter(a => a.data === dateStr && a.status !== 'Cancelado'), agenda);

        const isClosed = !agenda.dias.includes(d.getDay());

        let stateClass = '';
        if (isHoliday) stateClass = 'week-day-head-holiday';
        else if (isClosed) stateClass = 'week-day-head-sunday';

        const clickable = !isClosed;
        headHtml += `<div class="week-day-head ${stateClass} ${isToday ? 'week-day-head-today' : ''} ${clickable ? 'week-day-head-clickable' : ''}"
            ${clickable ? `onclick="openDayDetails('${dateStr}')" title="Ver detalhes do dia"` : ''}>
            <span class="week-day-name">${WEEKDAY_SHORT[d.getDay()]}</span>
            <span class="week-day-number">${d.getDate()}</span>
            ${isHoliday ? '<span class="week-day-tag week-day-tag-holiday">Feriado</span>'
                : isClosed ? '<span class="week-day-tag week-day-tag-off">Fechado</span>'
                : `<span class="week-day-tag">${activeCount}/${limiteDoDia(d.getDay(), agenda)} vagas</span>`}
        </div>`;
    }
    head.innerHTML = headHtml;

    // GRADE HORÁRIA — janela padrão expandida se houver agendamentos fora dela
    const weekEndStr = toDateStr(weekEnd);
    const weekStartStr = toDateStr(weekStart);
    let firstHour = agenda.semana.startHour;
    let lastHour = agenda.semana.endHour;
    appointments.filter(a => a.data >= weekStartStr && a.data <= weekEndStr).forEach(a => {
        const s = timeToMin(a.horaInicio);
        const e = timeToMin(a.horaFim);
        if (s !== null) firstHour = Math.min(firstHour, Math.floor(s / 60));
        if (e !== null && e > (s ?? 0)) lastHour = Math.max(lastHour, Math.ceil(e / 60));
    });
    const viewStart = firstHour * 60;
    const viewEnd = lastHour * 60;
    const colHeight = ((viewEnd - viewStart) / 60) * WEEK_HOUR_PX;

    let gutter = `<div class="week-gutter" style="height:${colHeight}px">`;
    for (let h = firstHour; h <= lastHour; h++) {
        gutter += `<div class="week-gutter-label" style="top:${(h - firstHour) * WEEK_HOUR_PX}px">${String(h).padStart(2, '0')}:00</div>`;
    }
    gutter += '</div>';

    let colsHtml = '';
    for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart); d.setDate(d.getDate() + i);
        const dateStr = toDateStr(d);
        const isPastDate = d < today;
        const isToday = d.getTime() === today.getTime();
        const isHoliday = !!holidays[dateStr];
        const startWindows = allowedStartWindow(d.getDay());
        const diaApps = appointments.filter(a => a.data === dateStr && a.status !== 'Cancelado');
        const activeCount = diaApps.length;
        const dayOpen = startWindows.length > 0 && !isHoliday && !isPastDate
            && (vagasOcupadasNoDia(diaApps, agenda) < limiteDoDia(d.getDay(), agenda)
                || diaAceitaExcedente(dateStr, diaApps, null, agenda));

        // Slots de fundo (+ botões de encaixe, renderizados acima dos cards)
        // A grade é montada em duas camadas: os minutos "cegos" (fora de qualquer
        // turno) só pintam o fundo fechado, enquanto cada turno gera seus próprios
        // horários ancorados em faixa[0]. Sem essa âncora, um turno que não começa
        // num múltiplo de slotMin a partir de viewStart nunca produzia um minuto
        // alinhado — e o dia inteiro ficava sem alvo de arrastar-e-soltar.
        let slots = '';
        let addBtns = '';

        const minutosDaGrade = [];
        for (let m = viewStart; m < viewEnd; m += slotMin) {
            if (!faixaDoMinuto(m, startWindows)) minutosDaGrade.push(m);
        }
        startWindows.forEach(([ini, fim]) => {
            const passo = agenda.slotMin || slotMin;
            for (let m = Math.max(ini, viewStart); m <= Math.min(fim, viewEnd - 1); m += passo) {
                minutosDaGrade.push(m);
            }
        });
        // Um minuto pode vir das duas camadas (ex.: turno alinhado ao viewStart);
        // sem deduplicar, dois slots iguais se sobrepõem e o de baixo rouba o drop.
        const minutosUnicos = [...new Set(minutosDaGrade)].sort((a, b) => a - b);

        for (let idx = 0; idx < minutosUnicos.length; idx++) {
            const m = minutosUnicos[idx];
            // Cada slot vai até o próximo horário da grade, para os alvos ladrilharem
            // a coluna sem sobrepor — turnos podem ter passo diferente do fundo.
            const fimDoSlot = Math.min(minutosUnicos[idx + 1] ?? viewEnd, viewEnd);
            const faixa = faixaDoMinuto(m, startWindows);
            const inWindow = !!faixa;
            // Alinhamento é relativo ao início da faixa (turno) em que o minuto cai
            const alinhado = !agenda.slotMin || !faixa || (m - faixa[0]) % agenda.slotMin === 0;
            const hora = minToTime(m);
            // Horário disponível: ainda cabe um endereço novo na lotação do slot
            // Inclui a margem de encaixe excepcional: o horário cheio segue
            // clicável nas domiciliares, e a confirmação acontece ao salvar.
            const livre = !agenda.slotUnico
                || slotAceita(null, diaApps.filter(a => a.horaInicio === hora), agenda)
                || slotAceitaComExcecao(null, diaApps.filter(a => a.horaInicio === hora), agenda)
                || diaAceitaExcedente(dateStr, diaApps, diaApps.filter(a => a.horaInicio === hora), agenda);
            // Horário desabilitado pelo setor responsável: sai da grade clicável
            // e deixa de aceitar arrastar-e-soltar, mas continua visível listrado.
            const bloqueado = inWindow && slotBloqueado(dateStr, hora, agenda);
            const selectable = dayOpen && inWindow && alinhado && livre && !bloqueado;
            const top = ((m - viewStart) / 60) * WEEK_HOUR_PX;
            // Alvo de arrastar-e-soltar: qualquer horário da grade dentro da
            // janela do dia. A validação real (lotação, limite, etc.) roda no
            // drop, reaproveitando as mesmas regras do formulário.
            const dropOk = inWindow && alinhado && !isHoliday && !bloqueado && startWindows.length > 0;

            slots += `<div class="week-slot ${m % 60 === 0 ? 'week-slot-hour' : ''} ${inWindow ? 'week-slot-open' : 'week-slot-closed'} ${selectable ? 'week-slot-selectable' : ''} ${bloqueado ? 'week-slot-blocked' : ''} ${dropOk ? 'week-slot-drop' : ''}"
                style="top:${top}px;height:${(Math.max(fimDoSlot - m, 1) / 60) * WEEK_HOUR_PX}px"
                ${dropOk ? `data-drop-data="${dateStr}" data-drop-hora="${hora}"` : ''}
                ${selectable ? `onclick="openRecordModalWithDate('${dateStr}','${hora}')" title="Agendar às ${hora}"` : ''}
                ${bloqueado ? `onclick="avisarSlotBloqueado()" title="Horário indisponível para marcação"` : ''}>
                ${selectable ? '<span class="week-slot-plus"><i class="fas fa-plus"></i></span>' : ''}
                ${bloqueado ? '<i class="fas fa-hourglass-end week-slot-block-icon"></i>' : ''}
            </div>`;

            // Horário já ocupado e com vaga sobrando: os cards cobrem a célula,
            // então o encaixe ganha um "+" próprio acima deles.
            if (selectable && diaApps.some(a => a.horaInicio === hora)) {
                addBtns += `<button type="button" class="week-slot-add"
                    style="top:${top + 3}px"
                    onclick="event.stopPropagation(); openRecordModalWithDate('${dateStr}','${hora}')"
                    title="Encaixar outro agendamento às ${hora}"><i class="fas fa-plus"></i></button>`;
            }
        }

        // Eventos do dia, com layout de sobreposição
        const dayApps = appointments
            .filter(a => a.data === dateStr)
            .map(a => {
                let start = timeToMin(a.horaInicio);
                let end = timeToMin(a.horaFim);
                if (start === null) start = viewStart;
                if (end === null || end <= start) end = start + 60;
                return { app: a, start, end };
            })
            .sort((a, b) => a.start - b.start || a.end - b.end);

        layoutOverlaps(dayApps);

        const events = dayApps.map(ev => {
            const a = ev.app;
            const theme = getAppointmentTheme(a, isPastDate);
            const top = ((Math.max(ev.start, viewStart) - viewStart) / 60) * WEEK_HOUR_PX;
            const height = Math.max(24, ((Math.min(ev.end, viewEnd) - Math.max(ev.start, viewStart)) / 60) * WEEK_HOUR_PX - 3);
            const width = 100 / ev.cols;
            const leftPct = ev.col * width;
            const compact = height < 52;
            // Card muito baixo (ex.: 30 min = 25px): não cabem duas linhas, então
            // horário, idade e nome vão para uma única linha, sem corte vertical.
            const tight = height < 34;
            const detalhe = temCampo('exame', agenda)
                ? `${a.exame} · ${a.substrato}${a.metano === 'Sim' ? ' (metano)' : ''}`
                : temCampo('endereco', agenda)
                    ? [a.logradouro, a.numero].filter(Boolean).join(', ') || agenda.nome
                    : (temCampo('abstinencia', agenda) && a.abstinencia != null ? `Abstinência: ${a.abstinencia} dia(s)` : agenda.nome);
            // Dividindo o horário com outro paciente, o card fica estreito:
            // encurta o nome para primeiro nome + iniciais.
            const dividindo = ev.cols > 1;
            const idade = idadeLabel(a.idade);
            const nomeExibido = dividindo || tight ? abreviarNome(a.paciente) : a.paciente;
            const distante = temCampo('endereco', agenda) && a.distante;
            const extras = extraPacientesLabel(a);
            const listaNomes = extras ? `\nPacientes: ${nomesPacientes(a).join(', ')}` : '';
            const tooltip = `${a.horaInicio} – ${a.horaFim} | ${a.paciente}${idade ? ` (${idade})` : ''}${listaNomes}\n${detalhe}${distante ? '\n⚠ Localidade distante' : ''}\nStatus: ${a.status}\nAtendente: ${formatAtendenteName(a.atendente)}`;

            // Remarcar arrastando: só faz sentido em quem ainda vai acontecer.
            // Encerrados (concluído, cancelado, ausente) ficam fixos para não
            // reescrever histórico — remarcar uma falta é criar outro agendamento.
            const movivel = !pacienteEncerrado(a.status);

            // Coleta em andamento — coletador no local, coletando (exclusivo domiciliar).
            // Contorno azul tracejado sobreposto ao tema de cor já existente do card,
            // mais um selo de play com anel girando, fixo à direita central do card.
            const coletaAtivaOn = temCampo('endereco', agenda) && !!a.coletaAtiva && resumoPacientes(a).pendentes > 0;
            const coletaPlay = coletaAtivaOn
                ? `<span class="coleta-play-selo week-event-play-selo" title="Coleta em andamento"><i class="fas fa-play"></i></span>`
                : '';

            return `<div class="week-event ${theme.bg} ${theme.border} ${tight ? 'week-event-tight' : ''} ${theme.done && !theme.checklistPendente ? 'week-event-done' : ''} ${theme.checklistPendente ? 'checklist-pendente-stripes' : ''} ${theme.absent ? 'week-event-absent' : ''} ${theme.canceled ? 'week-event-canceled' : ''} ${distante ? 'card-distante' : ''} ${coletaAtivaOn ? 'week-event-coleta-ativa' : ''} ${movivel ? 'week-event-movivel' : ''}"
                style="top:${top}px;height:${height}px;left:calc(${leftPct}% + 2px);width:calc(${width}% - 5px)"
                ${movivel
                    // Card móvel: o clique é resolvido no pointerup (clique curto
                    // abre o registro, pressão longa vira arrasto), então NÃO leva
                    // onclick próprio — senão abriria o registro ao soltar o card.
                    ? `data-app-id="${a.id}" onpointerdown="event.stopPropagation(); weekPointerDown(event, ${a.id})"`
                    : `onclick="event.stopPropagation(); viewRecord(${a.id})"`}
                title="${(tooltip + (coletaAtivaOn ? '\n▶ Coleta em andamento' : '') + (movivel ? '\n↔ Segure para mover e remarcar' : '')).replace(/"/g, '&quot;')}">
                <span class="week-event-accent ${theme.accent}"></span>
                ${coletaPlay}
                <div class="week-event-body">
                    <div class="week-event-time ${theme.text}">
                        <span>${a.horaInicio}${compact || dividindo ? '' : ` – ${a.horaFim}`}</span>
                        ${idade ? `<span class="week-event-idade">${idade}</span>` : ''}
                    </div>
                    <div class="week-event-name"><span class="week-event-nome-texto">${nomeExibido}</span>${extras ? `<span class="week-event-extras" title="${totalPacientes(a)} pacientes nesta visita">${extras}</span>` : ''}</div>
                    ${compact ? '' : `<div class="week-event-meta ${theme.text}">${distante ? `<i class="fas ${DISTANTE_TEMA.icon} ${DISTANTE_TEMA.text} mr-1" title="Localidade distante"></i>` : ''}${detalhe}${theme.faixa ? ` · ${FAIXA_ETARIA_TEMA[theme.faixa].rotulo}` : ''}</div>`}
                </div>
                ${theme.overdue ? '<span class="week-event-badge"><i class="fas fa-exclamation-triangle"></i></span>' : ''}
                ${theme.absent ? '<span class="week-event-badge week-event-badge-absent" title="Paciente ausente"><i class="fas fa-user-xmark"></i></span>' : ''}
                ${theme.checklistPendente ? '<span class="week-event-badge week-event-badge-checklist-pendente" title="Concluído com checklist pendente"><i class="fas fa-triangle-exclamation"></i></span>'
                    : theme.done ? '<span class="week-event-badge week-event-badge-done" title="Concluído"><i class="fas fa-check"></i></span>' : ''}
            </div>`;
        }).join('');

        // Linha do horário atual
        let nowLine = '';
        if (isToday) {
            const now = new Date();
            const nowMin = now.getHours() * 60 + now.getMinutes();
            if (nowMin >= viewStart && nowMin <= viewEnd) {
                nowLine = `<div class="week-now" style="top:${((nowMin - viewStart) / 60) * WEEK_HOUR_PX}px"></div>`;
            }
        }

        colsHtml += `<div class="week-col ${isToday ? 'week-col-today' : ''} ${isHoliday || !startWindows.length ? 'week-col-off' : ''}" style="height:${colHeight}px">
            ${slots}${events}${addBtns}${nowLine}
        </div>`;
    }

    canvas.innerHTML = gutter + colsHtml;
}

// ── REMARCAR ARRASTANDO (visão semanal) ─────────────────────
// Clicar e segurar "suspende" o card, que passa a seguir o cursor até ser solto
// em outro horário/dia da grade. O destino passa pela mesma validateAppointment()
// do formulário, então as regras de dia atendido, turno, alinhamento da grade,
// lotação do horário e limite diário valem igual.
//
// Implementado com Pointer Events em vez do drag-and-drop nativo do HTML5: o
// nativo não tem gesto de "segurar para levantar", não dá feedback de card
// suspenso e não funciona no toque. Aqui o mesmo código serve mouse e toque.
const WEEK_HOLD_MS = 180;   // tempo segurando até o card levantar
const WEEK_MOVE_TOL = 6;    // px de folga antes de considerar que houve arrasto

let _weekDrag = null;       // arrasto em curso
let _weekHold = null;       // pressão aguardando virar arrasto

// Início da pressão no card. Ainda não é arrasto: só agenda o "levantar".
function weekPointerDown(e, id) {
    // Só botão principal; toque e caneta entram normalmente.
    if (e.button != null && e.button !== 0) return;

    const card = e.currentTarget;
    cancelWeekHold();

    _weekHold = {
        id,
        card,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        // Deslocamento do cursor dentro do card, para ele não "pular" ao levantar
        grabX: e.clientX - card.getBoundingClientRect().left,
        grabY: e.clientY - card.getBoundingClientRect().top,
        moved: false,
        timer: setTimeout(() => startWeekDrag(), WEEK_HOLD_MS)
    };

    card.classList.add('week-event-pressing');

    document.addEventListener('pointermove', weekPointerMove, { passive: false });
    document.addEventListener('pointerup', weekPointerUp);
    document.addEventListener('pointercancel', weekPointerUp);
}

// Levanta o card: vira um "fantasma" que segue o cursor.
function startWeekDrag() {
    if (!_weekHold) return;
    const { id, card, grabX, grabY } = _weekHold;
    if (_weekHold.timer) clearTimeout(_weekHold.timer);

    const rect = card.getBoundingClientRect();
    const ghost = card.cloneNode(true);
    ghost.classList.add('week-event-ghost');
    ghost.classList.remove('week-event-pressing');
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    document.body.appendChild(ghost);

    card.classList.remove('week-event-pressing');
    card.classList.add('week-event-dragging');
    document.getElementById('week-canvas')?.classList.add('week-dragging');
    document.body.classList.add('week-dragging-body');

    _weekDrag = { id, card, ghost, grabX, grabY, alvo: null };
    _weekHold = { ..._weekHold, timer: null };
}

function weekPointerMove(e) {
    if (_weekDrag) {
        // Impede o scroll por toque enquanto o card está suspenso
        e.preventDefault();
        const { ghost, grabX, grabY } = _weekDrag;
        ghost.style.left = `${e.clientX - grabX}px`;
        ghost.style.top = `${e.clientY - grabY}px`;
        realcarAlvo(e.clientX, e.clientY);
        return;
    }

    if (!_weekHold) return;
    // Antes de levantar, sair da tolerância significa scroll/clique arrastado:
    // desiste da pressão para não sequestrar o gesto do usuário.
    const dx = Math.abs(e.clientX - _weekHold.startX);
    const dy = Math.abs(e.clientY - _weekHold.startY);
    if (dx > WEEK_MOVE_TOL || dy > WEEK_MOVE_TOL) {
        _weekHold.moved = true;
        cancelWeekHold();
        limparListeners();
    }
}

// Slot sob o cursor, ignorando o fantasma que viaja junto com ele
function slotSobCursor(x, y) {
    const ghost = _weekDrag?.ghost;
    if (ghost) ghost.style.visibility = 'hidden';
    const el = document.elementFromPoint(x, y);
    if (ghost) ghost.style.visibility = '';
    return el?.closest?.('.week-slot-drop') || null;
}

function realcarAlvo(x, y) {
    const alvo = slotSobCursor(x, y);
    if (alvo === _weekDrag.alvo) return;
    _weekDrag.alvo?.classList.remove('week-slot-dropover');
    alvo?.classList.add('week-slot-dropover');
    _weekDrag.alvo = alvo;
}

function weekPointerUp(e) {
    const arrasto = _weekDrag;
    const segurando = _weekHold;
    limparListeners();

    if (!arrasto) {
        // Soltou antes de levantar: era um clique comum, abre o registro.
        cancelWeekHold();
        if (segurando && !segurando.moved) viewRecord(segurando.id);
        return;
    }

    const alvo = slotSobCursor(e.clientX, e.clientY);
    encerrarWeekDrag();

    if (!alvo) return;
    const { dropData, dropHora } = alvo.dataset;
    if (!dropData || !dropHora) return;

    remarcarAgendamento(arrasto.id, dropData, dropHora);
}

function encerrarWeekDrag() {
    if (!_weekDrag) return;
    _weekDrag.ghost.remove();
    _weekDrag.card.classList.remove('week-event-dragging');
    _weekDrag.alvo?.classList.remove('week-slot-dropover');
    _weekDrag = null;
    _weekHold = null;
    document.getElementById('week-canvas')?.classList.remove('week-dragging');
    document.body.classList.remove('week-dragging-body');
    document.querySelectorAll('.week-slot-dropover')
        .forEach(el => el.classList.remove('week-slot-dropover'));
}

function cancelWeekHold() {
    if (!_weekHold) return;
    if (_weekHold.timer) clearTimeout(_weekHold.timer);
    _weekHold.card.classList.remove('week-event-pressing');
    if (!_weekDrag) _weekHold = null;
}

function limparListeners() {
    document.removeEventListener('pointermove', weekPointerMove);
    document.removeEventListener('pointerup', weekPointerUp);
    document.removeEventListener('pointercancel', weekPointerUp);
}

// Move um agendamento para outra data/horário, validando como se fosse edição
function remarcarAgendamento(id, novaData, novaHora) {
    const atual = appointments.find(a => a.id == id);
    if (!atual) return;
    if (atual.data === novaData && atual.horaInicio === novaHora) return;

    // O alvo de feriado nem é renderizado, mas a grade pode estar defasada se o
    // feriado chegou pelo Firebase durante o arrasto — checa de novo no drop.
    if (holidays[novaData]) {
        showNotification('Não é possível remarcar para um feriado.', 'error');
        return;
    }

    const agenda = currentAgenda();
    // Recalcula o fim mantendo a duração do agendamento
    const duracao = Math.max(
        1,
        (timeToMin(atual.horaFim) ?? 0) - (timeToMin(atual.horaInicio) ?? 0)
            || duracaoAgenda(atual.exame, agenda)
    );
    const novoFim = minToTime(timeToMin(novaHora) + duracao);

    const candidato = { ...atual, data: novaData, horaInicio: novaHora, horaFim: novoFim };

    const erro = validateAppointment(candidato);
    if (erro) {
        showNotification(erro === 'DATA_PASSADA'
            ? 'Não é possível remarcar para uma data que já passou.'
            : erro, 'error');
        return;
    }
    // Ler logo após validar: uma nova validação zera o sinal.
    const slotExcedente = _slotExcedenteNaValidacao;

    const gravar = () => {
        setAppointments(appointments.map(a => a.id == id ? candidato : a));
        persistirAgendamento(candidato, {
            rev: revDe(atual),
            audit: { action: 'edit', oldRecord: atual },
            mensagem: `${atual.paciente} remarcado para ${novaData.split('-').reverse().join('/')} às ${novaHora}.`
        });
        renderTable(); renderCalendar(); updateFilterDropdowns();
    };

    // Horário já no limite: o encaixe extra passa pela mesma confirmação do formulário.
    if (slotExcedente) {
        showSlotExcedenteModal(candidato, gravar);
        return;
    }
    gravar();
}

// Distribui colunas para agendamentos que se sobrepõem no mesmo dia
function layoutOverlaps(events) {
    let cluster = [];
    let clusterEnd = -1;

    const flush = () => {
        if (!cluster.length) return;
        const cols = [];
        cluster.forEach(ev => {
            let placed = false;
            for (let c = 0; c < cols.length; c++) {
                if (cols[c] <= ev.start) { ev.col = c; cols[c] = ev.end; placed = true; break; }
            }
            if (!placed) { ev.col = cols.length; cols.push(ev.end); }
        });
        cluster.forEach(ev => ev.cols = cols.length);
        cluster = [];
    };

    events.forEach(ev => {
        if (cluster.length && ev.start >= clusterEnd) { flush(); clusterEnd = -1; }
        cluster.push(ev);
        clusterEnd = Math.max(clusterEnd, ev.end);
    });
    flush();
}
