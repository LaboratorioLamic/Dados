// ─── OPORTUNIDADES DE VENDA ────────────────────────────────────────────────────

let _oppSubTab = 'aprazamento'; // 'aprazamento' | 'oferta'

let _oppFilter = {
    aprazamento: { search: '', vacina: '', vacinaIds: new Set(), urgencia: '', proxDias: 30, vencDias: 30, ticketMin: '', ticketMax: '' },
    oferta:      { search: '', vacina: '', vacinaIds: new Set(), ticketMin: '', ticketMax: '',
                   idadeMinAnos: '', idadeMinMeses: '', idadeMaxAnos: '', idadeMaxMeses: '',
                   genero: '', fidMin: '', fidMax: '' }
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function _urgency(date, today, in30) {
    if (!date) return 'sem_data';
    if (date < today) return 'vencida';
    if (date <= in30) return 'proxima';
    return 'futura';
}

function _urgencyLabel(u) {
    return { vencida:'Vencida', proxima:'Próxima', futura:'Futura', sem_data:'Sem data' }[u] || u;
}

function _urgencyClasses(u) {
    return {
        vencida:  'bg-red-100 text-red-700 border-red-200',
        proxima:  'bg-amber-100 text-amber-700 border-amber-200',
        futura:   'bg-green-100 text-green-700 border-green-200',
        sem_data: 'bg-slate-100 text-slate-500 border-slate-200'
    }[u] || 'bg-slate-100 text-slate-500 border-slate-200';
}

function _typeIcon(type) {
    return { proxima_dose:'fa-syringe', dose_unica_repetivel:'fa-redo-alt', reforco:'fa-shield-virus' }[type] || 'fa-syringe';
}

// Contagem de doses aplicadas por paciente. Cacheada porque _sortGroups() chama
// isto duas vezes por comparação — sem cache é uma varredura completa de
// `appointments` a cada passo do sort (O(N log N × M)).
let _appliedCountCache = null;
let _appliedCountSrc = null;
let _appliedCountLen = -1;

function _appliedCountMap() {
    if (_appliedCountSrc !== appointments || _appliedCountLen !== appointments.length) {
        const m = new Map();
        for (const a of appointments) {
            if (a.status !== 'Aplicado') continue;
            const k = String(a.patientId);
            m.set(k, (m.get(k) || 0) + 1);
        }
        _appliedCountCache = m;
        _appliedCountSrc = appointments;
        _appliedCountLen = appointments.length;
    }
    return _appliedCountCache;
}

function _appliedCount(patId) {
    return _appliedCountMap().get(String(patId)) || 0;
}

// Agrupa appointments por paciente numa passada só. calcAprazamento() e
// calcOferta() faziam um appointments.filter() por paciente — O(pacientes ×
// agendamentos). Construído por render, não cacheado entre renders, porque
// edições in-place de status não seriam detectadas.
function _appointmentsByPatient() {
    const m = new Map();
    for (const a of appointments) {
        const k = String(a.patientId);
        let bucket = m.get(k);
        if (!bucket) { bucket = []; m.set(k, bucket); }
        bucket.push(a);
    }
    return m;
}

function _patientFitsVaccine(patient, vac) {
    // Restrição de gênero
    if (vac.sexo && vac.sexo !== 'Ambos' && patient.genero && patient.genero !== vac.sexo) return false;

    // Restrição de idade
    if (patient.dtNasc) {
        const ai = getAgeInMonths(patient.dtNasc);
        const totalMeses = ai.years * 12 + ai.months;

        if (vac.esquemas && vac.esquemas.length) {
            return vac.esquemas.some(esq => {
                if (esq.minAnos == null) return true;
                const minT = (esq.minAnos || 0) * 12 + (esq.minMeses || 0);
                const hasMax = esq.maxAnos != null || esq.maxMeses != null;
                const maxT = hasMax ? ((esq.maxAnos || 0) * 12 + (esq.maxMeses || 0)) : Infinity;
                return totalMeses >= minT && totalMeses <= maxT;
            });
        }

        const minMeses = (vac.idadeMinimaAnos || 0) * 12 + (vac.idadeMinimaMeses || 0);
        if (minMeses > 0 && totalMeses < minMeses) return false;
    }
    return true;
}

function _firstDoseLabel(vac, patient) {
    // Vacina somente reforço: o 1º marco é o próprio Reforço (é a dose atual).
    if (isVaccineSomenteReforco(vac)) return reforcoLabel(1);
    const esq = getEsquemaPaciente(vac, patient ? patient.dtNasc : null);
    const n = esq ? (esq.numDoses || 1) : (vac.numDoses || 1);
    return n === 1 ? 'Dose Única' : '1ª Dose';
}

// ── Calc: Aprazamento ─────────────────────────────────────────────────────────

function calcAprazamento() {
    const today = new Date(); today.setHours(0,0,0,0);
    const dias  = Number(_oppFilter.aprazamento.proxDias) || 30;
    const in30  = new Date(today); in30.setDate(in30.getDate() + dias);
    const byPatient = {};
    const appsByPat = _appointmentsByPatient();
    const vacIdx = getVaccinesIndex();

    patients.forEach(patient => {
        const patApps    = appsByPat.get(String(patient.id)) || [];
        // "Efetivamente tomada" = Aplicado OU Perdido com aplicadaOutroLocal=true
        const appliedApps = patApps.filter(a =>
            a.status === 'Aplicado' || (a.status === 'Perdido' && a.aplicadaOutroLocal)
        );
        if (!appliedApps.length) return;
        // "Ativa" = tudo exceto Aplicado e Perdido+outroLocal.
        // Perdido sem outroLocal SUPRIME — a oportunidade já foi descartada/perdida.
        const activeApps = patApps.filter(a =>
            a.status !== 'Aplicado' && !(a.status === 'Perdido' && a.aplicadaOutroLocal)
        );

        const byVac = {};
        appliedApps.forEach(a => { if (!byVac[a.vaccineId]) byVac[a.vaccineId] = []; byVac[a.vaccineId].push(a); });

        const opps = [];

        Object.keys(byVac).forEach(vacId => {
            const vac = vacIdx.get(String(vacId));
            if (!vac || vac.ativo === false) return;

            const applied   = byVac[vacId]; // apenas Aplicado
            const active    = activeApps.filter(a => a.vaccineId == vacId); // ativas (suprimem)
            const esq       = getEsquemaPaciente(vac, patient.dtNasc);
            const numDoses  = esq ? (esquemaSemDoses(esq) ? 0 : (esq.numDoses || 1)) : (vac.numDoses || 1);

            // Case 1 — próxima dose
            // Usa o máximo de doses entre todos os esquemas da vacina, não só o esquema atual
            // do paciente. Assim, "1ª Dose" sempre gera "2ª Dose" mesmo que o paciente tenha
            // envelhecido para fora da faixa do esquema multi-dose.
            const appliedNums = applied
                .filter(a => a.doseAtual && /^\d+ª Dose$/.test(a.doseAtual))
                .map(a => parseInt(a.doseAtual));

            if (appliedNums.length) {
                const maxApplied = Math.max(...appliedNums);
                const totalDoses = vac.esquemas && vac.esquemas.length
                    ? Math.max(...vac.esquemas.map(e => e.numDoses || 1))
                    : numDoses;
                if (maxApplied < totalDoses) {
                    const nextDoseStr = `${maxApplied + 1}ª Dose`;
                    // Suprime se já existe registro ativo (não-Perdido) para esta dose
                    if (!active.some(a => a.doseAtual === nextDoseStr)) {
                        const lastBase = applied
                            .filter(a => a.doseAtual === `${maxApplied}ª Dose`)
                            .sort((a, b) => new Date(b.data) - new Date(a.data))[0];

                        let suggestedDate = null;
                        if (lastBase) {
                            const intervalos = (esq && esq.intervalos && esq.intervalos.length) ? esq.intervalos
                                : (vac.intervalos && vac.intervalos.length ? vac.intervalos
                                    : (vac.intervaloDias > 0 ? [vac.intervaloDias] : []));
                            let intervalo = intervalos.length
                                ? (intervalos[maxApplied - 1] != null ? intervalos[maxApplied - 1] : intervalos[intervalos.length - 1])
                                : 30;
                            if (!intervalo || intervalo <= 0) intervalo = 30;
                            const baseDate = new Date(lastBase.data + 'T00:00:00');
                            const calcDate = new Date(baseDate); calcDate.setDate(calcDate.getDate() + intervalo);
                            // Data real de aprazamento, mesmo no passado: é ela que marca a dose
                            // como 'vencida' e mantém coerência com a Rotina e o modal da Agenda.
                            // NÃO fixar em hoje — isso mascarava atrasos como se fossem do dia.
                            suggestedDate = calcDate;
                        }
                        opps.push({ type:'proxima_dose', vaccine:vac, dose:nextDoseStr, suggestedDate, revenue: parseBRL(String(vac.valor||'0'))||0, urgency:_urgency(suggestedDate,today,in30) });
                    }
                }
            }

            // Case 2 — dose única repetível
            // Só dispara se o esquema aplicável ao paciente for de dose única (numDoses===1).
            // Se o paciente se encaixa num esquema multi-dose, o repeat anual não se aplica a ele.
            const repScheme = vac.esquemas && vac.esquemas.find(e => e.numDoses===1 && e.repete && e.repeteMeses>0);
            if (repScheme && numDoses === 1) {
                const lastDU = applied.filter(a=>a.doseAtual==='Dose Única').sort((a,b)=>new Date(b.data)-new Date(a.data))[0];
                // Suprime se já existe registro ativo futuro para Dose Única
                const hasActiveDU = active.some(a => a.doseAtual === 'Dose Única' && new Date(a.data+'T00:00:00') >= today);
                if (lastDU && !hasActiveDU) {
                    const nextDate = new Date(lastDU.data+'T00:00:00');
                    nextDate.setMonth(nextDate.getMonth() + repScheme.repeteMeses);
                    opps.push({ type:'dose_unica_repetivel', vaccine:vac, dose:'Dose Única', suggestedDate:nextDate, revenue:parseBRL(String(vac.valor||'0'))||0, urgency:_urgency(nextDate,today,in30) });
                }
            }

            // Case 3 — reforço(s): percorre em ordem, só oferece o próximo ainda
            // sem registro cuja base (reforço anterior aplicado, ou esquema
            // completo p/ o 1º) já exista.
            const reforcos = getVaccineReforcos(vac);
            const completedEsquema = numDoses===0
                ? true // somente reforço: não há esquema primário a completar
                : numDoses===1
                ? applied.some(a=>a.doseAtual==='Dose Única'||a.doseAtual==='1ª Dose')
                : applied.some(a=>a.doseAtual===`${numDoses}ª Dose`);
            for (let ri = 0; ri < reforcos.length; ri++) {
                const lbl = reforcoLabel(ri + 1);
                const hasReforco = applied.some(a=>a.doseAtual===lbl);
                const hasActiveReforco = active.some(a => a.doseAtual === lbl);
                if (hasReforco || hasActiveReforco) continue;
                let baseApp, baseCompleted;
                if (ri === 0) {
                    baseApp = applied.sort((a,b)=>new Date(b.data)-new Date(a.data))[0];
                    baseCompleted = completedEsquema;
                } else {
                    const prevLbl = reforcoLabel(ri);
                    baseApp = applied.find(a => a.doseAtual === prevLbl);
                    baseCompleted = !!baseApp;
                }
                if (!baseCompleted) break;
                let suggestedDate = null;
                if (baseApp) {
                    const d = new Date(baseApp.data+'T00:00:00');
                    if (reforcos[ri].meses > 0) {
                        d.setMonth(d.getMonth() + reforcos[ri].meses);
                    } else {
                        const intervalos = (esq && esq.intervalos && esq.intervalos.length) ? esq.intervalos : [];
                        const intervalo = intervalos[numDoses] || vac.intervaloDias || 365;
                        d.setDate(d.getDate() + intervalo);
                    }
                    suggestedDate = d;
                }
                opps.push({ type:'reforco', vaccine:vac, dose:lbl, suggestedDate, revenue:parseBRL(String(vac.valor||'0'))||0, urgency:_urgency(suggestedDate,today,in30) });
                break; // apenas o próximo reforço pendente vira oportunidade
            }
        });

        if (opps.length) byPatient[patient.id] = { patient, opps };
    });

    return Object.values(byPatient);
}

// ── Calc: Oferta ──────────────────────────────────────────────────────────────

function calcOferta() {
    const byPatient = {};
    const appsByPat = _appointmentsByPatient();
    // Vacinas ativas são as mesmas para todos os pacientes — filtra uma vez só.
    const activeVaccines = vaccines.filter(v => v.ativo !== false);

    patients.forEach(patient => {
        const usedVacIds = new Set(
            (appsByPat.get(String(patient.id)) || []).map(a => Number(a.vaccineId))
        );

        const offers = activeVaccines
            .filter(v => !usedVacIds.has(Number(v.id)) && _patientFitsVaccine(patient, v))
            .map(v => ({
                type: 'oferta',
                vaccine: v,
                dose: _firstDoseLabel(v, patient),
                suggestedDate: null,
                revenue: parseBRL(String(v.valor || '0')) || 0,
                urgency: 'sem_data'
            }));

        if (offers.length) byPatient[patient.id] = { patient, opps: offers };
    });

    return Object.values(byPatient);
}

// ── Sort ──────────────────────────────────────────────────────────────────────

function _sortGroups(groups, isAprazamento) {
    const urgOrder = { vencida:0, proxima:1, futura:2, sem_data:3 };

    return groups.sort((a, b) => {
        // Primário: mais vacinas aplicadas (fidelidade)
        const ca = _appliedCount(a.patient.id);
        const cb = _appliedCount(b.patient.id);
        if (cb !== ca) return cb - ca;

        // Secundário (só aprazamento): urgência
        if (isAprazamento) {
            const aU = Math.min(...a.opps.map(o => urgOrder[o.urgency] ?? 9));
            const bU = Math.min(...b.opps.map(o => urgOrder[o.urgency] ?? 9));
            if (aU !== bU) return aU - bU;
        }

        // Terciário: receita potencial
        const ra = a.opps.reduce((s,o)=>s+o.revenue,0);
        const rb = b.opps.reduce((s,o)=>s+o.revenue,0);
        return rb - ra;
    });
}

// ── Sub-abas ──────────────────────────────────────────────────────────────────

function switchOppSubTab(tab) {
    // Aprazamento é restrito a quem tem permissão de aplicar vacina
    if (tab === 'aprazamento' && typeof canEditLoteAplicador === 'function' && !canEditLoteAplicador()) {
        tab = 'oferta';
    }
    _oppSubTab = tab;
    ['aprazamento','oferta'].forEach(t => {
        const btn = document.getElementById(`btn-opp-sub-${t}`);
        const fil = document.getElementById(`opp-filters-${t}`);
        const active = t === tab;
        if (btn) {
            btn.classList.toggle('bg-navy-900', active);
            btn.classList.toggle('text-white',   active);
            btn.classList.toggle('border-navy-800', active);
            btn.classList.toggle('bg-white',      !active);
            btn.classList.toggle('text-slate-500',!active);
            btn.classList.toggle('border-slate-300',!active);
        }
        if (fil) fil.classList.toggle('hidden', !active);
    });
    closeTicketPopover();
    populateOppVacinaFilter();
    renderOportunidadesReset();
}

// ── Ticket Popover ────────────────────────────────────────────────────────────

let _ticketAnchorTab = '';

function openTicketPopover(btn) {
    _ticketAnchorTab = _oppSubTab;
    const pop = document.getElementById('opp-ticket-popover');
    if (!pop) return;

    const f = _oppFilter[_ticketAnchorTab];
    document.getElementById('opp-ticket-min').value = f.ticketMin || '';
    document.getElementById('opp-ticket-max').value = f.ticketMax || '';

    const rect = btn.getBoundingClientRect();
    pop.style.top  = (rect.bottom + 8) + 'px';
    pop.style.left = Math.max(8, rect.left - 200 + rect.width) + 'px';
    pop.classList.remove('hidden');

    setTimeout(() => document.addEventListener('click', _ticketOutside, { once:true }), 10);
}

function _ticketOutside(e) {
    const pop = document.getElementById('opp-ticket-popover');
    if (pop && !pop.contains(e.target)) closeTicketPopover();
}

function closeTicketPopover() {
    const pop = document.getElementById('opp-ticket-popover');
    if (pop) pop.classList.add('hidden');
}

function applyTicketFilter() {
    const minVal = parseFloat(document.getElementById('opp-ticket-min').value) || '';
    const maxVal = parseFloat(document.getElementById('opp-ticket-max').value) || '';
    _oppFilter[_ticketAnchorTab].ticketMin = minVal;
    _oppFilter[_ticketAnchorTab].ticketMax = maxVal;
    closeTicketPopover();
    _updateTicketBadge(_ticketAnchorTab);
    renderOportunidadesReset();
}

function clearTicketFilter() {
    _oppFilter[_ticketAnchorTab].ticketMin = '';
    _oppFilter[_ticketAnchorTab].ticketMax = '';
    document.getElementById('opp-ticket-min').value = '';
    document.getElementById('opp-ticket-max').value = '';
    closeTicketPopover();
    _updateTicketBadge(_ticketAnchorTab);
    renderOportunidadesReset();
}

function _updateTicketBadge(tab) {
    const btn = document.getElementById(`opp-ticket-btn-${tab}`);
    if (!btn) return;
    const f = _oppFilter[tab];
    const active = f.ticketMin !== '' || f.ticketMax !== '';
    btn.classList.toggle('bg-indigo-600', active);
    btn.classList.toggle('text-white', active);
    btn.classList.toggle('border-indigo-600', active);
    btn.classList.toggle('bg-white', !active);
    btn.classList.toggle('text-slate-600', !active);
    btn.classList.toggle('border-slate-200', !active);
    const lbl = btn.querySelector('.ticket-lbl');
    if (lbl) {
        if (active) {
            const min = f.ticketMin !== '' ? `R$ ${Number(f.ticketMin).toFixed(0)}` : '';
            const max = f.ticketMax !== '' ? `R$ ${Number(f.ticketMax).toFixed(0)}` : '';
            lbl.textContent = [min, max].filter(Boolean).join(' – ');
        } else {
            lbl.textContent = 'Ticket';
        }
    }
}

function _passTicket(revenue, tab) {
    const f = _oppFilter[tab];
    if (f.ticketMin !== '' && revenue < f.ticketMin) return false;
    if (f.ticketMax !== '' && revenue > f.ticketMax) return false;
    return true;
}

// ── Render principal ──────────────────────────────────────────────────────────

function renderOportunidades() {
    // Status muda in-place (Agendado → Aplicado), o que não altera identidade nem
    // tamanho do array — o cache precisa ser descartado explicitamente a cada
    // render. Dentro de um render ele ainda evita as N log N varreduras do sort.
    _appliedCountSrc = null;
    _appliedCountLen = -1;
    // Sem permissão de aplicar, Aprazamento não é renderizado nem como estado inicial
    if (_oppSubTab === 'aprazamento' && typeof canEditLoteAplicador === 'function' && !canEditLoteAplicador()) {
        switchOppSubTab('oferta');
        return;
    }
    if (_oppSubTab === 'aprazamento') _renderAprazamento();
    else _renderOferta();
}

function _applyCommonFilters(groups, tab) {
    const f       = _oppFilter[tab];
    const search  = normalizeStr(f.search || '');
    const vacFilt = f.vacina || '';
    const vacinaIds = f.vacinaIds && f.vacinaIds.size ? f.vacinaIds : null;

    return groups.map(pg => ({
        ...pg,
        opps: pg.opps.filter(o => {
            const id = String(o.vaccine ? o.vaccine.id : o.vaccineId);
            if (vacinaIds) { if (!vacinaIds.has(id)) return false; }
            else if (vacFilt && id !== String(vacFilt)) return false;
            return true;
        })
    })).filter(pg => {
        if (!pg.opps.length) return false;
        // Ticket aplica sobre o potencial total do paciente
        const totalRev = pg.opps.reduce((s, o) => s + o.revenue, 0);
        if (!_passTicket(totalRev, tab)) return false;
        if (search) {
            const p = pg.patient;
            return normalizeStr(p.nome).includes(search) || normalizeStr(p.cpf||'').includes(search);
        }
        return true;
    });
}

function _renderAprazamento() {
    const urgOrder = { vencida:0, proxima:1, futura:2, sem_data:3 };
    const f = _oppFilter.aprazamento;

    let groups = calcAprazamento();
    if (f.urgencia) {
        // "Vencidas" recorta a janela retroativa: só doses vencidas há até vencDias.
        let keep = o => o.urgency === f.urgencia;
        if (f.urgencia === 'vencida') {
            const limite = new Date(); limite.setHours(0,0,0,0);
            limite.setDate(limite.getDate() - (Number(f.vencDias) || 30));
            keep = o => {
                if (o.urgency !== 'vencida' || !o.suggestedDate) return false;
                const d = new Date(o.suggestedDate); d.setHours(0,0,0,0);
                return d >= limite;
            };
        }
        groups = groups.map(pg => ({ ...pg, opps: pg.opps.filter(keep) })).filter(pg=>pg.opps.length);
    }
    groups = _applyCommonFilters(groups, 'aprazamento');
    _updateAprPrazoBadge();
    groups.forEach(pg => pg.opps.sort((a,b)=>(urgOrder[a.urgency]??9)-(urgOrder[b.urgency]??9)));
    _sortGroups(groups, true);

    const totOpps = groups.reduce((s,pg)=>s+pg.opps.length,0);
    const totRev  = groups.reduce((s,pg)=>s+pg.opps.reduce((ss,o)=>ss+o.revenue,0),0);
    const totVenc = groups.reduce((s,pg)=>s+pg.opps.filter(o=>o.urgency==='vencida').length,0);
    const totProx = groups.reduce((s,pg)=>s+pg.opps.filter(o=>o.urgency==='proxima').length,0);

    _renderStats(groups.length, totOpps, totRev, totVenc, totProx, false, _oppFilter.aprazamento.proxDias);
    _renderCards(groups, 'aprazamento');
}

function _renderOferta() {
    let groups = calcOferta();
    groups = _applyOfertaPatientFilters(groups);
    groups = _applyCommonFilters(groups, 'oferta');
    _sortGroups(groups, false);

    const totOpps = groups.reduce((s,pg)=>s+pg.opps.length,0);
    const totRev  = groups.reduce((s,pg)=>s+pg.opps.reduce((ss,o)=>ss+o.revenue,0),0);

    _renderStats(groups.length, totOpps, totRev, 0, 0, true);
    _renderCards(groups, 'oferta');
}

function _renderStats(npat, nopps, rev, nvenc, nprox, isOferta=false, proxDias=30) {
    const el = document.getElementById('oport-stats');
    if (!el) return;
    const _d = document.body.classList.contains('dark-mode');
    const chipBase   = _d ? 'background:#1e293b;border-color:#334155;' : 'background:#ffffff;border-color:#e2e8f0;';
    const chipText   = _d ? '#f1f5f9' : '#172554';
    const chipMeta   = _d ? '#64748b' : '#64748b';
    const chipGreen  = _d ? 'background:#052e16;border-color:#166534;' : 'background:#f0fdf4;border-color:#bbf7d0;';
    const chipGreenT = _d ? '#4ade80' : '#15803d';
    const chipGreenM = _d ? '#16a34a' : '#16a34a';
    const chipRed    = _d ? 'background:#2d0a0a;border-color:#7f1d1d;' : 'background:#fff1f2;border-color:#fecdd3;';
    const chipRedT   = _d ? '#fca5a5' : '#b91c1c';
    const chipAmber  = _d ? 'background:#1c1500;border-color:#78350f;' : 'background:#fffbeb;border-color:#fde68a;';
    const chipAmberT = _d ? '#fbbf24' : '#92400e';
    el.innerHTML = `
        <div class="flex flex-wrap gap-3 items-center mb-4">
            <div class="flex items-center gap-2 rounded-xl px-4 py-2 shadow-sm border" style="${chipBase}">
                <i class="fas fa-users text-indigo-500 text-sm"></i>
                <span class="font-black" style="color:${chipText}">${npat}</span>
                <span class="text-xs uppercase tracking-wide" style="color:${chipMeta}">Pacientes</span>
            </div>
            <div class="flex items-center gap-2 rounded-xl px-4 py-2 shadow-sm border" style="${chipBase}">
                <i class="fas fa-bullseye text-clinic-500 text-sm"></i>
                <span class="font-black" style="color:${chipText}">${nopps}</span>
                <span class="text-xs uppercase tracking-wide" style="color:${chipMeta}">${isOferta ? 'Vacinas a oferecer' : 'Oportunidades'}</span>
            </div>
            <div class="flex items-center gap-2 rounded-xl px-4 py-2 shadow-sm border" style="${chipGreen}">
                <i class="fas fa-dollar-sign text-sm" style="color:${chipGreenM}"></i>
                <span class="font-black" style="color:${chipGreenT}">${formatCurrency(rev)}</span>
                <span class="text-xs uppercase tracking-wide" style="color:${chipGreenM}">Receita potencial</span>
            </div>
            ${nvenc > 0 ? `<div class="flex items-center gap-2 rounded-xl px-4 py-2 shadow-sm border" style="${chipRed}"><i class="fas fa-exclamation-circle text-sm" style="color:${chipRedT}"></i><span class="font-black" style="color:${chipRedT}">${nvenc}</span><span class="text-xs uppercase tracking-wide" style="color:${chipRedT}">Vencidas</span></div>` : ''}
            ${nprox > 0 ? `<div class="flex items-center gap-2 rounded-xl px-4 py-2 shadow-sm border" style="${chipAmber}"><i class="fas fa-clock text-sm" style="color:${chipAmberT}"></i><span class="font-black" style="color:${chipAmberT}">${nprox}</span><span class="text-xs uppercase tracking-wide" style="color:${chipAmberT}">Próx. ${proxDias} dias</span></div>` : ''}
        </div>`;
}

function _renderCards(groups, tab) {
    const container = document.getElementById('oport-cards-container');
    const emptyEl   = document.getElementById('oport-empty');
    if (!container) return;

    if (!groups.length) {
        container.innerHTML = '';
        _renderOppPagination(null);
        if (emptyEl) emptyEl.classList.remove('hidden');
        return;
    }
    if (emptyEl) emptyEl.classList.add('hidden');

    // Só os cards da página são montados: cada card gera um micro-card por
    // oportunidade, então renderizar todos os pacientes de uma vez é o gargalo.
    const pageInfo = paginate(groups, _oppPage[tab], _OPP_PAGE_SIZE);
    _oppPage[tab] = pageInfo.page;
    container.innerHTML = pageInfo.items.map(pg => _renderPatientCard(pg, tab)).join('');
    _renderOppPagination(pageInfo);
}

// ── Paginação ─────────────────────────────────────────────────────────────────
function _renderOppPagination(pageInfo) {
    const container = document.getElementById('oport-cards-container');
    if (!container) return;
    let bar = document.getElementById('oport-pagination');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'oport-pagination';
        bar.className = 'mt-4 rounded-2xl border overflow-hidden';
        container.insertAdjacentElement('afterend', bar);
    }
    if (!pageInfo) { bar.innerHTML = ''; bar.classList.add('hidden'); return; }
    const html = renderPagination(pageInfo, 'goOppPage', 'pacientes');
    bar.innerHTML = html;
    bar.classList.toggle('hidden', !html);
    bar.style.borderColor = document.body.classList.contains('dark-mode') ? '#334155' : '#e2e8f0';
}

function goOppPage(page) {
    _oppPage[_oppSubTab] = page;
    renderOportunidades();
    const container = document.getElementById('oport-cards-container');
    if (container) container.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Todo handler de filtro passa por aqui: trocar o conjunto filtrado sem voltar
// à página 1 deixaria o usuário numa página que já não existe.
function renderOportunidadesReset() {
    _oppPage[_oppSubTab] = 0;
    renderOportunidades();
}

// O botão de atualizar da barra de filtros também zera os filtros da aba ativa:
// re-renderizar mantendo tudo selecionado não é o que se espera de um "reset".
function resetOportunidadesFiltros() {
    const tab = _oppSubTab;
    const f   = _oppFilter[tab];

    f.search = '';
    f.vacina = '';
    f.vacinaIds.clear();
    f.ticketMin = '';
    f.ticketMax = '';

    const bar = document.getElementById(`opp-filters-${tab}`);
    const searchEl = bar ? bar.querySelector('input[type="text"]') : null;
    if (searchEl) searchEl.value = '';

    ['opp-ticket-min','opp-ticket-max'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    closeTicketPopover();
    _updateTicketBadge(tab);

    if (tab === 'aprazamento') {
        f.urgencia = '';
        f.proxDias = 30;
        f.vencDias = 30;
        const diasEl = document.getElementById('apr-prazo-dias');      if (diasEl) diasEl.value = 30;
        const vencEl = document.getElementById('apr-prazo-venc-dias'); if (vencEl) vencEl.value = 30;
        const vacSearch = document.getElementById('apr-vacina-search');
        if (vacSearch) { vacSearch.value = ''; filterAprVacinaList(''); }
        _renderAprPrazoSelection();
        _updateAprPrazoBadge();
        _updateAprVacinaBadge();
        closeAprPrazoPopover();
        closeAprVacinaPopover();
    } else {
        f.idadeMinAnos = f.idadeMinMeses = f.idadeMaxAnos = f.idadeMaxMeses = '';
        f.genero = '';
        f.fidMin = f.fidMax = '';
        ['ofe-idade-min-anos','ofe-idade-min-meses','ofe-idade-max-anos','ofe-idade-max-meses','ofe-fid-min','ofe-fid-max']
            .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        _updateGeneroSelection('');
        ['idade','genero','fidelidade'].forEach(t => _closeOfertaPop(t));
        const vacSearch = document.getElementById('ofe-vacina-search');
        if (vacSearch) { vacSearch.value = ''; filterOfertaVacinaList(''); }
        _updateOfertaVacinaBadge();
        _updateOfertaFilterBadges();
        closeOfertaVacinaPopover();
    }

    renderOportunidadesReset();
}

// ── Cards ─────────────────────────────────────────────────────────────────────

function _renderPatientCard({ patient, opps }, tab) {
    const totalRev = opps.reduce((s,o)=>s+o.revenue,0);
    const applCount = _appliedCount(patient.id);
    const hasVenc  = opps.some(o=>o.urgency==='vencida');
    const hasProx  = opps.some(o=>o.urgency==='proxima');
    const _isDark  = document.body.classList.contains('dark-mode');

    const borderCls = _isDark
        ? (hasVenc ? 'border-red-900' : hasProx ? 'border-amber-900' : 'border-slate-700')
        : (hasVenc ? 'border-red-300' : hasProx ? 'border-amber-300' : 'border-slate-200');
    const topBg = _isDark
        ? (hasVenc ? 'from-red-950 to-slate-800' : hasProx ? 'from-amber-950 to-slate-800' : 'from-slate-800 to-slate-800')
        : (hasVenc ? 'from-red-50 to-white' : hasProx ? 'from-amber-50 to-white' : 'from-slate-50 to-white');

    const age   = patient.dtNasc ? getAgeDisplay(patient.dtNasc) : '';
    const phone = patient.contato ? formatPhone(patient.contato) : '';
    const waNum = patient.contato ? ('55' + patient.contato.replace(/\D/g,'')) : '';
    const waHref = waNum ? `https://wa.me/${waNum}` : '';

    const micro = opps.map(o => tab==='oferta' ? _renderMicroOferta(patient, o) : _renderMicroAprazamento(patient, o)).join('');

    return `
    <div class="${_isDark ? 'bg-slate-800' : 'bg-white'} rounded-2xl shadow-sm border ${borderCls} overflow-hidden transition hover:shadow-md">
        <div class="px-5 py-4 bg-gradient-to-r ${topBg} border-b ${_isDark ? 'border-slate-700' : 'border-slate-100'} flex flex-wrap justify-between items-start gap-3">
            <div class="flex items-center gap-3 min-w-0">
                <div class="h-10 w-10 rounded-xl ${_isDark ? 'bg-indigo-900 text-indigo-300' : 'bg-indigo-100 text-indigo-600'} flex items-center justify-center shrink-0 font-black text-sm">
                    ${(patient.nome||'?')[0].toUpperCase()}
                </div>
                <div class="min-w-0">
                    <p class="font-black text-sm" style="color:${_isDark?'#f1f5f9':'#172554'}">${patient.nome||'—'}</p>
                    <div class="flex items-center gap-2 mt-0.5">
                        <p class="text-[11px] truncate" style="color:${_isDark?'#64748b':'#64748b'}">${patient.cpf||''}${age?` · ${age}`:''}${phone?` · ${phone}`:''}</p>
                        ${waHref ? `<a href="${waHref}" target="_blank" rel="noopener" title="Abrir WhatsApp" class="shrink-0 h-6 w-6 rounded-lg flex items-center justify-center transition hover:bg-green-500 hover:text-white" style="background:${_isDark?'rgba(34,197,94,0.15)':'#dcfce7'};color:${_isDark?'#4ade80':'#16a34a'};border:1px solid ${_isDark?'rgba(34,197,94,0.25)':'#bbf7d0'}"><i class="fab fa-whatsapp text-[11px]"></i></a>` : ''}
                    </div>
                </div>
            </div>
            <div class="flex items-center gap-3 shrink-0">
                <div class="text-right" title="Vacinas já aplicadas com a clínica">
                    <div class="text-[10px] uppercase tracking-wide" style="color:${_isDark?'#64748b':'#94a3b8'}">Fidelidade</div>
                    <div class="font-black text-sm" style="color:${_isDark?'#818cf8':'#4f46e5'}">${applCount} dose${applCount!==1?'s':''}</div>
                </div>
                <div class="text-right">
                    <div class="text-[10px] uppercase tracking-wide" style="color:${_isDark?'#64748b':'#94a3b8'}">Potencial</div>
                    <div class="font-black text-emerald-500 text-sm">${formatCurrency(totalRev)}</div>
                </div>
                <div class="text-right">
                    <div class="text-[10px] uppercase tracking-wide" style="color:${_isDark?'#64748b':'#94a3b8'}">Oport.</div>
                    <div class="font-black text-sm" style="color:${_isDark?'#f1f5f9':'#172554'}">${opps.length}</div>
                </div>
                <button onclick="viewPatientHistory(${patient.id})" title="Ver prontuário vacinal"
                    class="${_isDark?'bg-indigo-900 text-indigo-300 border-indigo-800':'bg-indigo-50 text-indigo-500 border-indigo-100'} h-8 w-8 rounded-xl hover:bg-indigo-600 hover:text-white flex items-center justify-center transition border hover:border-indigo-600 shrink-0">
                    <i class="fas fa-clipboard-list text-xs"></i>
                </button>
            </div>
        </div>
        <div class="${_isDark?'bg-slate-900':'bg-white'} p-4 flex flex-wrap gap-2 max-h-80 overflow-y-auto">${micro}</div>
    </div>`;
}

function _renderMicroAprazamento(patient, opp) {
    const urg    = opp.urgency;
    const urgCls = _urgencyClasses(urg);
    const bCls   = urgCls.split(' ').find(c=>c.startsWith('border-')) || 'border-slate-200';
    const icon   = _typeIcon(opp.type);
    const dateStr = opp.suggestedDate ? toLocalISO(opp.suggestedDate).split('-').reverse().join('/') : '—';
    const isoDate = opp.suggestedDate ? toLocalISO(opp.suggestedDate) : '';

    const daysLabel = opp.suggestedDate ? (() => {
        const t = new Date(); t.setHours(0,0,0,0);
        const d = Math.round((opp.suggestedDate - t) / 86400000);
        if (d < 0) return `<span class="text-red-500 font-bold">${Math.abs(d)}d atraso</span>`;
        if (d === 0) return `<span class="text-amber-600 font-bold">Hoje</span>`;
        return `<span class="text-slate-400">em ${d}d</span>`;
    })() : '';

    const _isDarkM = document.body.classList.contains('dark-mode');
    return `
    <div class="flex flex-col gap-1.5 border ${bCls} rounded-xl px-3 py-2.5 min-w-[155px] max-w-[215px] flex-1" style="background:${_isDarkM?'#0f172a':'#f8fafc'}">
        <div class="flex items-center gap-1.5">
            <i class="fas ${icon} text-indigo-400 text-[10px]"></i>
            <span class="text-[11px] font-black truncate leading-tight" style="color:${_isDarkM?'#e2e8f0':'#172554'}">${opp.vaccine.nome}</span>
        </div>
        <div class="flex items-center justify-between gap-1">
            <span class="text-[10px] font-bold" style="color:${_isDarkM?'#94a3b8':'#475569'}">${opp.dose}</span>
            <span class="text-[10px] px-1.5 py-0.5 rounded-full border font-bold ${urgCls}">${_urgencyLabel(urg)}</span>
        </div>
        <div class="flex items-center justify-between gap-1 text-[10px]" style="color:${_isDarkM?'#64748b':'#64748b'}">
            <span>${dateStr} ${daysLabel}</span>
            <span class="font-bold text-emerald-500">${formatCurrency(opp.revenue)}</span>
        </div>
        <div class="mt-0.5 flex gap-1">
            <button onclick="agendarOportunidade(${patient.id},${opp.vaccine.id},'${opp.dose.replace(/'/g,"\\'")}','${isoDate}')"
                class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-wide py-1.5 rounded-lg transition shadow-sm">
                <i class="fas fa-calendar-plus mr-1"></i>Agendar
            </button>
            <button onclick="openDismissOppModal(${patient.id},${opp.vaccine.id},'${opp.dose.replace(/'/g,"\\'")}')"
                title="Descartar oportunidade"
                class="h-[30px] w-7 bg-slate-200 hover:bg-red-500 text-slate-500 hover:text-white rounded-lg flex items-center justify-center transition shrink-0">
                <i class="fas fa-trash text-[9px]"></i>
            </button>
        </div>
    </div>`;
}

function _renderMicroOferta(patient, opp) {
    const esq = getEsquemaPaciente(opp.vaccine, patient.dtNasc);
    const numDoses = esq ? (esq.numDoses || 1) : (opp.vaccine.numDoses || 1);
    const doseInfo = numDoses > 1 ? `${numDoses} doses` : 'Dose única';
    const nReforcosMO = getVaccineReforcos(opp.vaccine).length;
    const reforco  = nReforcosMO > 1 ? ` + ${nReforcosMO} Reforços` : nReforcosMO === 1 ? ' + Reforço' : '';

    const _isDarkO = document.body.classList.contains('dark-mode');
    return `
    <div class="flex flex-col gap-1.5 border rounded-xl px-3 py-2.5 min-w-[155px] max-w-[215px] flex-1" style="background:${_isDarkO?'#052e16':'#f0fdf4'};border-color:${_isDarkO?'#166534':'#bbf7d0'}">
        <div class="flex items-center gap-1.5">
            <i class="fas fa-tags text-emerald-500 text-[10px]"></i>
            <span class="text-[11px] font-black truncate leading-tight" style="color:${_isDarkO?'#e2e8f0':'#172554'}">${opp.vaccine.nome}</span>
        </div>
        <div class="flex items-center justify-between gap-1">
            <span class="text-[10px] font-bold" style="color:${_isDarkO?'#94a3b8':'#475569'}">${doseInfo}${reforco}</span>
            <span class="text-[10px] px-1.5 py-0.5 rounded-full border font-bold" style="background:${_isDarkO?'#14532d':'#d1fae5'};color:${_isDarkO?'#34d399':'#065f46'};border-color:${_isDarkO?'#166534':'#6ee7b7'}">Nova</span>
        </div>
        <div class="flex items-center justify-end gap-1 text-[10px]">
            <span class="font-black" style="color:${_isDarkO?'#34d399':'#059669'}">${formatCurrency(opp.revenue)}</span>
        </div>
        <div class="mt-0.5 flex gap-1">
            <button onclick="agendarOportunidade(${patient.id},${opp.vaccine.id},'${opp.dose.replace(/'/g,"\\'")}','')"
                class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-wide py-1.5 rounded-lg transition shadow-sm">
                <i class="fas fa-calendar-plus mr-1"></i>Agendar
            </button>
            <button onclick="openDismissOppModal(${patient.id},${opp.vaccine.id},'${opp.dose.replace(/'/g,"\\'")}')"
                title="Descartar oportunidade"
                class="h-[30px] w-7 bg-slate-200 hover:bg-red-500 text-slate-500 hover:text-white rounded-lg flex items-center justify-center transition shrink-0">
                <i class="fas fa-trash text-[9px]"></i>
            </button>
        </div>
    </div>`;
}

// ── Descartar oportunidade ────────────────────────────────────────────────────

let _dismissPending = null; // { patId, vacId, dose }

// opts.fromRotina: aberto por um card "Não definido" da aba Rotina — mostra o
// atalho para incluir a dose manualmente como registro do CPNI.
function openDismissOppModal(patId, vacId, dose, opts) {
    const p = patients.find(x => x.id == patId);
    const v = vaccines.find(x => x.id == vacId);
    _dismissPending = { patId, vacId, dose };

    const cpniWrap = document.getElementById('dismiss-opp-cpni-wrap');
    if (cpniWrap) cpniWrap.classList.toggle('hidden', !(opts && opts.fromRotina));

    const infoEl = document.getElementById('dismiss-opp-info');
    if (infoEl) infoEl.textContent = `${p ? p.nome : '—'} · ${v ? v.nome : '—'} · ${dose}`;

    const sel = document.getElementById('dismiss-opp-reason');
    if (sel) {
        const sortedReasons = (typeof cancelReasons !== 'undefined' ? [...cancelReasons] : [])
            .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
        sel.innerHTML = '<option value="">Selecione o motivo...</option>' +
            sortedReasons.map(r => `<option value="${r}">${r}</option>`).join('');
        sel.value = '';
    }

    const errEl = document.getElementById('dismiss-opp-err');
    if (errEl) errEl.classList.add('hidden');

    const dataInput = document.getElementById('dismiss-opp-data');
    if (dataInput) dataInput.value = new Date().toISOString().split('T')[0];

    const chkLocal = document.getElementById('dismiss-opp-outro-local');
    if (chkLocal) { chkLocal.checked = false; toggleDismissOutroLocal(chkLocal); }
    const chkOV = document.getElementById('dismiss-opp-outra-vacina');
    if (chkOV) { chkOV.checked = false; toggleDismissOutraVacina(chkOV); }

    document.getElementById('modal-dismiss-opp').classList.add('active');
}

function closeDismissOppModal() {
    document.getElementById('modal-dismiss-opp').classList.remove('active');
    _dismissPending = null;
    const chk = document.getElementById('dismiss-opp-outro-local');
    if (chk) { chk.checked = false; toggleDismissOutroLocal(chk); }
    const chkOV = document.getElementById('dismiss-opp-outra-vacina');
    if (chkOV) { chkOV.checked = false; toggleDismissOutraVacina(chkOV); }
}

// Bloqueia/libera o select de motivo conforme os atalhos marcados
function _syncDismissMotivoState() {
    const motivoSel = document.getElementById('dismiss-opp-reason');
    if (!motivoSel) return;
    const bloqueia = (document.getElementById('dismiss-opp-outro-local')?.checked || false)
        || (document.getElementById('dismiss-opp-outra-vacina')?.checked || false);
    motivoSel.disabled = bloqueia;
    motivoSel.classList.toggle('opacity-40', bloqueia);
    motivoSel.classList.toggle('cursor-not-allowed', bloqueia);
    motivoSel.classList.toggle('bg-slate-100', bloqueia);
    if (bloqueia) motivoSel.value = '';
}

function toggleDismissOutraVacina(chk) {
    // Mutuamente exclusivo com "Outro Local"
    if (chk.checked) {
        const outroLocal = document.getElementById('dismiss-opp-outro-local');
        if (outroLocal && outroLocal.checked) { outroLocal.checked = false; toggleDismissOutroLocal(outroLocal); }
    }
    if (typeof _paintOutraVacinaToggle === 'function') _paintOutraVacinaToggle('dismiss', chk.checked);
    _syncDismissMotivoState();
}

function toggleDismissOutroLocal(chk) {
    const icon      = document.getElementById('icon-dismiss-outro-local');
    const box       = chk.closest('label') && chk.closest('label').querySelector('div');
    const label     = box && box.querySelector('span');
    // Mutuamente exclusivo com "Outra Vacina"
    if (chk.checked) {
        const outraVacina = document.getElementById('dismiss-opp-outra-vacina');
        if (outraVacina && outraVacina.checked) {
            outraVacina.checked = false;
            if (typeof _paintOutraVacinaToggle === 'function') _paintOutraVacinaToggle('dismiss', false);
        }
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
    _syncDismissMotivoState();
}

function confirmDismissOpp() {
    const aplicadaOutroLocal = document.getElementById('dismiss-opp-outro-local')?.checked || false;
    const outraVacina        = document.getElementById('dismiss-opp-outra-vacina')?.checked || false;
    const motivo = document.getElementById('dismiss-opp-reason').value;
    if (!motivo && !aplicadaOutroLocal && !outraVacina) {
        document.getElementById('dismiss-opp-err').classList.remove('hidden');
        return;
    }
    if (!_dismissPending) return;

    const outraVacinaRef = outraVacina ? (document.getElementById('dismiss-outra-vacina-ref')?.value || '') : '';
    if (outraVacina && !outraVacinaRef) {
        showNotification('Selecione a vacina aplicada que supriu esta dose.', 'error');
        document.getElementById('dismiss-outra-vacina-search')?.focus();
        return;
    }
    const outraVacinaApp = outraVacinaRef ? appointments.find(x => x.id == outraVacinaRef) : null;
    if (outraVacina && outraVacinaApp && outraVacinaApp.doseAtual !== _dismissPending.dose) {
        showNotification(`A vacina selecionada deve ser da mesma dosagem (${_dismissPending.dose}) da oportunidade perdida.`, 'error');
        return;
    }

    const { patId, vacId, dose } = _dismissPending;
    const vac   = vaccines.find(x => x.id == vacId);
    const motivoFinal = aplicadaOutroLocal ? 'Aplicou em outro local'
        : outraVacina ? 'Tomou outra vacina'
        : motivo;
    const dataPerda = document.getElementById('dismiss-opp-data')?.value || new Date().toISOString().split('T')[0];
    const vendedorNome = (typeof currentUser !== 'undefined' && currentUser)
        ? (currentUser.nome || '').toUpperCase()
        : '';

    const newApp = {
        id:                 Date.now(),
        patientId:          Number(patId),
        vaccineId:          Number(vacId),
        data:               dataPerda,
        hora:               '',
        doseAtual:          dose,
        valorAplicado:      String(vac ? (vac.valor || '0,00') : '0,00').replace('R$','').trim(),
        valorCheio:         null,
        descontoPct:        null,
        status:             'Perdido',
        loteId:             null,
        lote:               '',
        motivoCancelamento: motivoFinal,
        aplicadaOutroLocal: aplicadaOutroLocal,
        outraVacina:        outraVacina,
        outraVacinaAppId:   outraVacina ? Number(outraVacinaRef) : null,
        outraVacinaLabel:   outraVacinaApp && typeof outraVacinaLabel === 'function' ? outraVacinaLabel(outraVacinaApp) : '',
        vendedor:           vendedorNome,
        aplicador:          '',
        endereco:           (typeof enderecoParaNovoAgendamento === 'function')
                                ? enderecoParaNovoAgendamento(patId) : null
    };

    appointments.push(newApp);
    if (typeof logAppointmentAudit === 'function') {
        logAppointmentAudit(null, newApp, `Oportunidade descartada · Motivo: ${motivoFinal}`);
    }
    if (typeof syncAllLoteStatus === 'function') syncAllLoteStatus();
    saveAll();
    renderCalendar();
    renderTable();
    renderDashboard();

    closeDismissOppModal();
    renderOportunidades();
    // Se aberta a partir da aba Rotina do prontuário, reflete o novo registro sem precisar reabrir.
    const prontuario = document.getElementById('modal-patient-history');
    if (prontuario && prontuario.classList.contains('active') && prontuario.dataset.patientId == patId
        && typeof renderRotinaTab === 'function') {
        renderRotinaTab(patId);
    }
    showNotification('Oportunidade descartada e registrada como perdida.', 'success');
}

// ── Agendar ───────────────────────────────────────────────────────────────────

function agendarOportunidade(patId, vacId, dose, dataIso) {
    closeModals();
    openRecordModal();

    setTimeout(() => {
        const p = patients.find(x => x.id == patId);
        if (!p) return;

        const psEl = document.getElementById('reg-patient-search');
        psEl.value = `${p.cpf} - ${p.nome}`;
        psEl.setCustomValidity('');
        psEl.classList.remove('border-red-400');
        psEl.classList.add('border-slate-200');
        document.getElementById('hidden-patient-id').value = p.id;
        document.getElementById('reg-cpf').value = p.cpf;
        document.getElementById('reg-dtnasc').value = p.dtNasc;
        updateIdadeField();
        document.getElementById('reg-contato').value = formatPhone(p.contato);
        if (typeof updateRecordPatientAlert === 'function') updateRecordPatientAlert(p);
        if (p.responsavel) {
            document.getElementById('div-responsavel').style.display = 'block';
            document.getElementById('div-responsavel-placeholder').style.display = 'none';
            document.getElementById('reg-responsavel').value = p.responsavel;
        }
        if (typeof autoFillEnderecoPaciente === 'function') autoFillEnderecoPaciente(p.id);
        _enableVaccineFields();

        const vac = vaccines.find(x => x.id == vacId);
        document.getElementById('reg-vacina').value = vacId;
        document.getElementById('reg-vacina-search').value = vac ? vac.nome : '';
        autoFillVaccine();
        if (typeof checkVacinaSemEstoque === 'function') checkVacinaSemEstoque(vacId, vac ? vac.nome : '');

        setTimeout(() => {
            document.getElementById('reg-dose').value = dose;
            document.getElementById('reg-data').value = toLocalISO(new Date());
            updateSuggestedDate();
        }, 80);
    }, 120);
}

// ── Populadores de filtros ────────────────────────────────────────────────────

function populateOppVacinaFilter() {
    // Selects foram substituídos por popovers — badges atualizados separadamente
    _updateAprVacinaBadge();
    _updateOfertaVacinaBadge();
}

// ── Handlers de filtro ────────────────────────────────────────────────────────

function oppFilterSearch(val, tab) { _oppFilter[tab].search = val; renderOportunidadesReset(); }
function oppFilterVacina(val, tab) { _oppFilter[tab].vacina = val; renderOportunidadesReset(); }
function oppFilterUrgencia(val)    { _oppFilter.aprazamento.urgencia = val; renderOportunidadesReset(); }

// ── Popover Multi-Vacina genérico ─────────────────────────────────────────────

function _openVacinaPopover({ popId, searchId, listId, clearId, allVacs, filterFn, closeFn, anchorBtn }) {
    const pop = document.getElementById(popId);
    if (!pop) return;

    const searchEl = document.getElementById(searchId);
    if (searchEl) searchEl.value = '';
    filterFn('');

    const rect = anchorBtn.getBoundingClientRect();
    pop.style.top  = (rect.bottom + 8) + 'px';
    pop.style.left = '8px';
    pop.classList.remove('hidden');

    requestAnimationFrame(() => {
        const maxLeft = window.innerWidth - pop.offsetWidth - 8;
        pop.style.left = Math.max(8, Math.min(rect.left, maxLeft)) + 'px';
    });
}

function _renderVacinaList({ listId, allVacs, selSet, toggleFn, searchVal }) {
    const list = document.getElementById(listId);
    if (!list) return;
    const q = normalizeStr(searchVal || '');
    const filtered = q ? allVacs.filter(v => normalizeStr(v.nome).includes(q)) : allVacs;

    list.innerHTML = filtered.map(v => {
        const checked = selSet.has(String(v.id));
        return `<div class="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer select-none transition vac-row ${checked ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-slate-50 border border-transparent'}" data-id="${v.id}">
            <div class="h-4 w-4 rounded flex items-center justify-center shrink-0 border-2 transition ${checked ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white'}">
                ${checked ? '<i class="fas fa-check text-white" style="font-size:8px"></i>' : ''}
            </div>
            <span class="text-sm text-navy-900 font-bold flex-1 leading-tight">${v.nome}</span>
        </div>`;
    }).join('') || '<p class="text-xs text-slate-400 text-center py-4">Nenhuma vacina encontrada</p>';

    list.querySelectorAll('.vac-row').forEach(row => {
        row.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFn(row.dataset.id);
        });
    });
}

function _updateVacinaBadge({ btnId, lblClass, selSet }) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const lbl = btn.querySelector(`.${lblClass}`);
    const hasFilter = selSet.size > 0;

    btn.classList.toggle('bg-indigo-600', hasFilter);
    btn.classList.toggle('text-white', hasFilter);
    btn.classList.toggle('border-indigo-600', hasFilter);
    btn.classList.toggle('bg-white', !hasFilter);
    btn.classList.toggle('text-slate-600', !hasFilter);
    btn.classList.toggle('border-slate-200', !hasFilter);

    if (lbl) {
        if (!hasFilter) { lbl.textContent = 'Todas as vacinas'; return; }
        if (selSet.size === 1) {
            const vac = vaccines.find(v => String(v.id) === [...selSet][0]);
            lbl.textContent = vac ? vac.nome : '1 vacina';
        } else {
            lbl.textContent = `${selSet.size} vacinas`;
        }
    }
}

// ── Popover Vacina — Oferta ───────────────────────────────────────────────────

let _ofertaVacinaOutside = null;
let _ofertaVacinaAllVacs = [];

function openOfertaVacinaPopover(btn) {
    ['idade','genero','fidelidade'].forEach(t => _closeOfertaPop(t));
    closeTicketPopover();
    closeAprVacinaPopover();
    closeAprPrazoPopover();

    _ofertaVacinaAllVacs = vaccines.filter(v => v.ativo !== false).sort((a,b) => a.nome.localeCompare(b.nome,'pt-BR'));
    _openVacinaPopover({ popId:'ofe-vacina-popover', searchId:'ofe-vacina-search', listId:'ofe-vacina-list',
        allVacs: _ofertaVacinaAllVacs, filterFn: filterOfertaVacinaList, closeFn: closeOfertaVacinaPopover, anchorBtn: btn });

    if (_ofertaVacinaOutside) document.removeEventListener('click', _ofertaVacinaOutside);
    const pop = document.getElementById('ofe-vacina-popover');
    _ofertaVacinaOutside = (e) => {
        if (pop && !e.composedPath().includes(pop) && e.target !== btn) closeOfertaVacinaPopover();
        else setTimeout(() => document.addEventListener('click', _ofertaVacinaOutside, { once: true }), 10);
    };
    setTimeout(() => document.addEventListener('click', _ofertaVacinaOutside, { once: true }), 10);
}

function closeOfertaVacinaPopover() {
    const pop = document.getElementById('ofe-vacina-popover');
    if (pop) pop.classList.add('hidden');
    if (_ofertaVacinaOutside) { document.removeEventListener('click', _ofertaVacinaOutside); _ofertaVacinaOutside = null; }
    _updateOfertaVacinaBadge();
    renderOportunidadesReset();
}

function filterOfertaVacinaList(val) {
    const clear = document.getElementById('ofe-vacina-search-clear');
    if (clear) clear.classList.toggle('hidden', !val);
    _renderVacinaList({ listId:'ofe-vacina-list', allVacs:_ofertaVacinaAllVacs,
        selSet:_oppFilter.oferta.vacinaIds, toggleFn:toggleOfertaVacina, searchVal:val });
}

function toggleOfertaVacina(id) {
    const sel = _oppFilter.oferta.vacinaIds;
    if (sel.has(id)) sel.delete(id); else sel.add(id);
    filterOfertaVacinaList(document.getElementById('ofe-vacina-search')?.value || '');
}

function clearOfertaVacinas() {
    _oppFilter.oferta.vacinaIds.clear();
    filterOfertaVacinaList(document.getElementById('ofe-vacina-search')?.value || '');
    _updateOfertaVacinaBadge();
    renderOportunidadesReset();
}

function _updateOfertaVacinaBadge() {
    _updateVacinaBadge({ btnId:'ofe-vacina-btn', lblClass:'ofe-vacina-lbl', selSet:_oppFilter.oferta.vacinaIds });
}

// ── Popover Vacina — Aprazamento ──────────────────────────────────────────────

let _aprVacinaOutside = null;
let _aprVacinaAllVacs = [];

function openAprVacinaPopover(btn) {
    closeTicketPopover();
    closeAprPrazoPopover();

    _aprVacinaAllVacs = vaccines.filter(v => v.ativo !== false)
        .filter(v => appointments.some(a => a.vaccineId == v.id && a.status === 'Aplicado'))
        .sort((a,b) => a.nome.localeCompare(b.nome,'pt-BR'));

    _openVacinaPopover({ popId:'apr-vacina-popover', searchId:'apr-vacina-search', listId:'apr-vacina-list',
        allVacs: _aprVacinaAllVacs, filterFn: filterAprVacinaList, closeFn: closeAprVacinaPopover, anchorBtn: btn });

    if (_aprVacinaOutside) document.removeEventListener('click', _aprVacinaOutside);
    const pop = document.getElementById('apr-vacina-popover');
    _aprVacinaOutside = (e) => {
        if (pop && !e.composedPath().includes(pop) && e.target !== btn) closeAprVacinaPopover();
        else setTimeout(() => document.addEventListener('click', _aprVacinaOutside, { once: true }), 10);
    };
    setTimeout(() => document.addEventListener('click', _aprVacinaOutside, { once: true }), 10);
}

function closeAprVacinaPopover() {
    const pop = document.getElementById('apr-vacina-popover');
    if (pop) pop.classList.add('hidden');
    if (_aprVacinaOutside) { document.removeEventListener('click', _aprVacinaOutside); _aprVacinaOutside = null; }
    _updateAprVacinaBadge();
    renderOportunidadesReset();
}

function filterAprVacinaList(val) {
    const clear = document.getElementById('apr-vacina-search-clear');
    if (clear) clear.classList.toggle('hidden', !val);
    _renderVacinaList({ listId:'apr-vacina-list', allVacs:_aprVacinaAllVacs,
        selSet:_oppFilter.aprazamento.vacinaIds, toggleFn:toggleAprVacina, searchVal:val });
}

function toggleAprVacina(id) {
    const sel = _oppFilter.aprazamento.vacinaIds;
    if (sel.has(id)) sel.delete(id); else sel.add(id);
    filterAprVacinaList(document.getElementById('apr-vacina-search')?.value || '');
}

function clearAprVacinas() {
    _oppFilter.aprazamento.vacinaIds.clear();
    filterAprVacinaList(document.getElementById('apr-vacina-search')?.value || '');
    _updateAprVacinaBadge();
    renderOportunidadesReset();
}

function _updateAprVacinaBadge() {
    _updateVacinaBadge({ btnId:'apr-vacina-btn', lblClass:'apr-vacina-lbl', selSet:_oppFilter.aprazamento.vacinaIds });
}

// ── Popover Prazo — Aprazamento ───────────────────────────────────────────────

let _aprPrazoOutside = null;

function openAprPrazoPopover(btn) {
    closeTicketPopover();
    closeAprVacinaPopover();

    const pop = document.getElementById('apr-prazo-popover');
    if (!pop) return;

    const diasEl = document.getElementById('apr-prazo-dias');
    if (diasEl) diasEl.value = _oppFilter.aprazamento.proxDias || 30;
    const vencEl = document.getElementById('apr-prazo-venc-dias');
    if (vencEl) vencEl.value = _oppFilter.aprazamento.vencDias || 30;
    _renderAprPrazoSelection();

    const rect = btn.getBoundingClientRect();
    pop.style.top  = (rect.bottom + 8) + 'px';
    pop.style.left = '8px';
    pop.classList.remove('hidden');

    requestAnimationFrame(() => {
        const maxLeft = window.innerWidth - pop.offsetWidth - 8;
        pop.style.left = Math.max(8, Math.min(rect.left, maxLeft)) + 'px';
    });

    if (_aprPrazoOutside) document.removeEventListener('click', _aprPrazoOutside);
    _aprPrazoOutside = (e) => {
        if (!e.composedPath().includes(pop) && e.target !== btn) closeAprPrazoPopover();
        else setTimeout(() => document.addEventListener('click', _aprPrazoOutside, { once: true }), 10);
    };
    setTimeout(() => document.addEventListener('click', _aprPrazoOutside, { once: true }), 10);
}

function closeAprPrazoPopover() {
    const pop = document.getElementById('apr-prazo-popover');
    if (pop) pop.classList.add('hidden');
    if (_aprPrazoOutside) { document.removeEventListener('click', _aprPrazoOutside); _aprPrazoOutside = null; }
}

function _renderAprPrazoSelection() {
    const cur = _oppFilter.aprazamento.urgencia;
    const colorMap = { '':'slate', 'vencida':'red', 'proxima':'amber', 'futura':'green', 'sem_data':'slate' };
    document.querySelectorAll('.apr-prazo-opt').forEach(btn => {
        const val = btn.dataset.prazo;
        const active = val === cur;
        const color = colorMap[val] || 'slate';
        btn.classList.toggle(`border-${color}-400`, active);
        btn.classList.toggle(`bg-${color}-50`, active);
        btn.classList.toggle('border-slate-200', !active);
        btn.classList.toggle('bg-white', !active);
    });
}

function selectAprPrazo(val) {
    _oppFilter.aprazamento.urgencia = val;
    _renderAprPrazoSelection();
    _updateAprPrazoBadge();
    renderOportunidadesReset();
}

function onAprPrazoDiasChange() {
    const val = parseInt(document.getElementById('apr-prazo-dias')?.value) || 30;
    _oppFilter.aprazamento.proxDias = Math.max(1, val);
    if (_oppFilter.aprazamento.urgencia === 'proxima') renderOportunidadesReset();
}

function onAprPrazoVencDiasChange() {
    const val = parseInt(document.getElementById('apr-prazo-venc-dias')?.value) || 30;
    _oppFilter.aprazamento.vencDias = Math.max(1, val);
    _updateAprPrazoBadge();
    if (_oppFilter.aprazamento.urgencia === 'vencida') renderOportunidadesReset();
}

function clearAprPrazo() {
    _oppFilter.aprazamento.urgencia = '';
    _oppFilter.aprazamento.proxDias = 30;
    _oppFilter.aprazamento.vencDias = 30;
    const vencEl = document.getElementById('apr-prazo-venc-dias');
    if (vencEl) vencEl.value = 30;
    const diasEl = document.getElementById('apr-prazo-dias');
    if (diasEl) diasEl.value = 30;
    _renderAprPrazoSelection();
    _updateAprPrazoBadge();
    closeAprPrazoPopover();
    renderOportunidadesReset();
}

function _updateAprPrazoBadge() {
    const btn = document.getElementById('apr-prazo-btn');
    if (!btn) return;
    const f = _oppFilter.aprazamento;
    const lbl = btn.querySelector('.apr-prazo-lbl');
    const hasFilter = !!f.urgencia;

    const colorOn  = { vencida:'red', proxima:'amber', futura:'green', sem_data:'slate' };
    const c = colorOn[f.urgencia] || 'orange';

    btn.className = btn.className
        .replace(/\bbg-\S+\b/g,'').replace(/\bborder-\S+\b/g,'').replace(/\btext-\S+\b/g,'').trim();
    btn.classList.add('flex','items-center','gap-1.5','px-3','py-2','rounded-xl','border','font-black','text-xs','uppercase','tracking-wide','transition');

    if (hasFilter) {
        btn.classList.add(`bg-${c}-500`,'text-white',`border-${c}-500`,`hover:bg-${c}-600`);
    } else {
        btn.classList.add('bg-white','text-slate-600','border-slate-200','hover:bg-orange-50','hover:border-orange-300','hover:text-orange-600');
    }

    if (lbl) {
        const labels = { vencida:`Vencidas (${f.vencDias}d)`, proxima:`Próximas (${f.proxDias}d)`, futura:'Futuras', sem_data:'Sem data' };
        lbl.textContent = hasFilter ? (labels[f.urgencia] || 'Prazo') : 'Prazo';
    }
}

// ── Popovers de Oferta (Idade / Gênero / Fidelidade) ─────────────────────────

let _ofertaPopoverOutsideHandlers = {};

function openOfertaPopover(type, btn) {
    // Fecha todos os outros popovers
    ['idade','genero','fidelidade'].forEach(t => { if (t !== type) _closeOfertaPop(t); });
    closeTicketPopover();

    const pop = document.getElementById(`ofe-${type}-popover`);
    if (!pop) return;

    // Preenche valores atuais
    const f = _oppFilter.oferta;
    if (type === 'idade') {
        document.getElementById('ofe-idade-min-anos').value  = f.idadeMinAnos  || '';
        document.getElementById('ofe-idade-min-meses').value = f.idadeMinMeses || '';
        document.getElementById('ofe-idade-max-anos').value  = f.idadeMaxAnos  || '';
        document.getElementById('ofe-idade-max-meses').value = f.idadeMaxMeses || '';
    } else if (type === 'fidelidade') {
        document.getElementById('ofe-fid-min').value = f.fidMin || '';
        document.getElementById('ofe-fid-max').value = f.fidMax || '';
    } else if (type === 'genero') {
        _updateGeneroSelection(f.genero);
    }

    const rect = btn.getBoundingClientRect();
    pop.style.top  = (rect.bottom + 8) + 'px';
    pop.style.left = Math.max(8, rect.left - pop.offsetWidth + rect.width) + 'px';
    pop.classList.remove('hidden');

    // Aguarda render para calcular left correto
    requestAnimationFrame(() => {
        const maxLeft = window.innerWidth - pop.offsetWidth - 8;
        pop.style.left = Math.max(8, Math.min(rect.left - pop.offsetWidth + rect.width, maxLeft)) + 'px';
    });

    const handler = (e) => { if (!pop.contains(e.target)) _closeOfertaPop(type); };
    _ofertaPopoverOutsideHandlers[type] = handler;
    setTimeout(() => document.addEventListener('click', handler, { once: true }), 10);
}

function _closeOfertaPop(type) {
    const pop = document.getElementById(`ofe-${type}-popover`);
    if (pop) pop.classList.add('hidden');
}

function closeOfertaPopover(type) { _closeOfertaPop(type); }

function _updateGeneroSelection(val) {
    ['ambos','masculino','feminino'].forEach(g => {
        const btn = document.getElementById(`ofe-gen-${g}`);
        if (!btn) return;
        const active = val && val.toLowerCase() === g;
        btn.classList.toggle('border-pink-500', active);
        btn.classList.toggle('bg-pink-50', active);
        btn.classList.toggle('border-slate-200', !active);
    });
}

function applyOfertaFilter(type, value) {
    const f = _oppFilter.oferta;
    if (type === 'idade') {
        f.idadeMinAnos  = parseInt(document.getElementById('ofe-idade-min-anos').value)  || '';
        f.idadeMinMeses = parseInt(document.getElementById('ofe-idade-min-meses').value) || '';
        f.idadeMaxAnos  = parseInt(document.getElementById('ofe-idade-max-anos').value)  || '';
        f.idadeMaxMeses = parseInt(document.getElementById('ofe-idade-max-meses').value) || '';
        _closeOfertaPop('idade');
    } else if (type === 'genero') {
        f.genero = (value === f.genero) ? '' : value;
        if (f.genero === 'Ambos') f.genero = '';
        _updateGeneroSelection(f.genero);
        _closeOfertaPop('genero');
    } else if (type === 'fidelidade') {
        f.fidMin = parseInt(document.getElementById('ofe-fid-min').value) >= 0 ? parseInt(document.getElementById('ofe-fid-min').value) : '';
        f.fidMax = parseInt(document.getElementById('ofe-fid-max').value) >= 0 ? parseInt(document.getElementById('ofe-fid-max').value) : '';
        _closeOfertaPop('fidelidade');
    }
    _updateOfertaFilterBadges();
    renderOportunidadesReset();
}

function clearOfertaFilter(type) {
    const f = _oppFilter.oferta;
    if (type === 'idade') {
        f.idadeMinAnos = f.idadeMinMeses = f.idadeMaxAnos = f.idadeMaxMeses = '';
        ['ofe-idade-min-anos','ofe-idade-min-meses','ofe-idade-max-anos','ofe-idade-max-meses'].forEach(id => {
            const el = document.getElementById(id); if (el) el.value = '';
        });
        _closeOfertaPop('idade');
    } else if (type === 'genero') {
        f.genero = '';
        _updateGeneroSelection('');
        _closeOfertaPop('genero');
    } else if (type === 'fidelidade') {
        f.fidMin = f.fidMax = '';
        ['ofe-fid-min','ofe-fid-max'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        _closeOfertaPop('fidelidade');
    }
    _updateOfertaFilterBadges();
    renderOportunidadesReset();
}

function _updateOfertaFilterBadges() {
    const f = _oppFilter.oferta;

    // Idade
    const idadeBtn = document.getElementById('ofe-idade-btn');
    if (idadeBtn) {
        const hasIdade = f.idadeMinAnos !== '' || f.idadeMinMeses !== '' || f.idadeMaxAnos !== '' || f.idadeMaxMeses !== '';
        idadeBtn.classList.toggle('bg-violet-600', hasIdade);
        idadeBtn.classList.toggle('text-white', hasIdade);
        idadeBtn.classList.toggle('border-violet-600', hasIdade);
        idadeBtn.classList.toggle('bg-white', !hasIdade);
        idadeBtn.classList.toggle('text-slate-600', !hasIdade);
        idadeBtn.classList.toggle('border-slate-200', !hasIdade);
        const lbl = idadeBtn.querySelector('.ofe-idade-lbl');
        if (lbl) {
            if (hasIdade) {
                const minStr = (f.idadeMinAnos !== '' || f.idadeMinMeses !== '')
                    ? `${f.idadeMinAnos||0}a ${f.idadeMinMeses||0}m` : '';
                const maxStr = (f.idadeMaxAnos !== '' || f.idadeMaxMeses !== '')
                    ? `${f.idadeMaxAnos||0}a ${f.idadeMaxMeses||0}m` : '';
                lbl.textContent = [minStr, maxStr].filter(Boolean).join(' – ') || 'Idade';
            } else { lbl.textContent = 'Idade'; }
        }
    }

    // Gênero
    const genBtn = document.getElementById('ofe-genero-btn');
    if (genBtn) {
        const hasGen = !!f.genero;
        const isMasc = f.genero === 'Masculino';
        genBtn.classList.toggle('bg-blue-500',  hasGen && isMasc);
        genBtn.classList.toggle('border-blue-500', hasGen && isMasc);
        genBtn.classList.toggle('hover:bg-blue-400', hasGen && isMasc);
        genBtn.classList.toggle('bg-pink-500',  hasGen && !isMasc);
        genBtn.classList.toggle('border-pink-500', hasGen && !isMasc);
        genBtn.classList.toggle('hover:bg-pink-400', hasGen && !isMasc);
        genBtn.classList.toggle('hover:bg-pink-50', !hasGen);
        genBtn.classList.toggle('hover:border-pink-300', !hasGen);
        genBtn.classList.toggle('hover:text-pink-600', !hasGen);
        genBtn.classList.toggle('text-white', hasGen);
        genBtn.classList.toggle('bg-white', !hasGen);
        genBtn.classList.toggle('text-slate-600', !hasGen);
        genBtn.classList.toggle('border-slate-200', !hasGen);
        const lbl = genBtn.querySelector('.ofe-genero-lbl');
        if (lbl) lbl.textContent = f.genero || 'Gênero';
    }

    // Fidelidade
    const fidBtn = document.getElementById('ofe-fidelidade-btn');
    if (fidBtn) {
        const hasFid = f.fidMin !== '' || f.fidMax !== '';
        fidBtn.classList.toggle('bg-amber-500', hasFid);
        fidBtn.classList.toggle('text-white', hasFid);
        fidBtn.classList.toggle('border-amber-500', hasFid);
        fidBtn.classList.toggle('bg-white', !hasFid);
        fidBtn.classList.toggle('text-slate-600', !hasFid);
        fidBtn.classList.toggle('border-slate-200', !hasFid);
        const lbl = fidBtn.querySelector('.ofe-fidelidade-lbl');
        if (lbl) {
            if (hasFid) {
                const min = f.fidMin !== '' ? `${f.fidMin}` : '';
                const max = f.fidMax !== '' ? `${f.fidMax}` : '';
                lbl.textContent = [min, max].filter(Boolean).join(' – ') + ' doses';
            } else { lbl.textContent = 'Fidelidade'; }
        }
    }
}

// ── Aplica filtros de paciente na renderOferta ────────────────────────────────

function _applyOfertaPatientFilters(groups) {
    const f = _oppFilter.oferta;

    return groups.filter(pg => {
        const p = pg.patient;

        // Gênero
        if (f.genero) {
            const pGen = (p.genero || '').toLowerCase();
            if (pGen !== f.genero.toLowerCase()) return false;
        }

        // Fidelidade (doses aplicadas)
        if (f.fidMin !== '' || f.fidMax !== '') {
            const doses = _appliedCount(p.id);
            if (f.fidMin !== '' && doses < f.fidMin) return false;
            if (f.fidMax !== '' && doses > f.fidMax) return false;
        }

        // Faixa etária
        if (f.idadeMinAnos !== '' || f.idadeMinMeses !== '' || f.idadeMaxAnos !== '' || f.idadeMaxMeses !== '') {
            if (!p.dtNasc) return false;
            const ai = getAgeInMonths(p.dtNasc);
            const totalMeses = ai.years * 12 + ai.months;
            const minT = (parseInt(f.idadeMinAnos) || 0) * 12 + (parseInt(f.idadeMinMeses) || 0);
            const hasMax = f.idadeMaxAnos !== '' || f.idadeMaxMeses !== '';
            const maxT = hasMax ? ((parseInt(f.idadeMaxAnos) || 0) * 12 + (parseInt(f.idadeMaxMeses) || 0)) : Infinity;
            if (totalMeses < minT || totalMeses > maxT) return false;
        }

        return true;
    });
}
