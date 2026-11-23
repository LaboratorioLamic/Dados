// ─── ABA "ROTINA" DO PRONTUÁRIO — aprazamento vacinal por vacina/dose ──────────
//
// Mostra, por vacina, um card por dose (aplicada, agendada ou apenas prevista),
// coloridos por status:
//   Verde   = Aplicada aqui (com data)
//   Azul    = Próxima dose / agendamento futuro (fora da janela de 30 dias)
//   Amarelo = A vencer (até 30 dias, aplicada ou não)
//   Laranja = Atrasada
//   Vermelho= Cancelada (agendamento perdido, sem ser "outro local")
//   Roxo    = Aplicada em outro local (registrada como tal).
//             Dose aplicada (aqui ou importada do CPNI) é sempre "Aplicada"
//             (verde), mesmo sem as doses anteriores no sistema.
//   Ciano   = Perdida, mas suprida pela aplicação de outra vacina.
//   Cinza   = "Não definido": card fantasma de dose faltante (sem nenhum
//             registro) abaixo de uma dose já aplicada/importada do CPNI —
//             clicável p/ abrir a janela de Perda da Oportunidade e definir o motivo.

const ROTINA_STATUS_STYLE = {
    aplicada:   { bar: 'bg-green-500',  bg: 'bg-green-50/60',  border: 'border-green-200 hover:border-green-400',  text: 'text-green-700',  icon: 'fa-check',                dot: 'bg-green-500'  },
    proxima:    { bar: 'bg-blue-500',   bg: 'bg-blue-50/60',   border: 'border-blue-200 hover:border-blue-400',    text: 'text-blue-700',   icon: 'fa-calendar-alt',         dot: 'bg-blue-500'   },
    a_vencer:   { bar: 'bg-amber-500',  bg: 'bg-amber-50/60',  border: 'border-amber-200 hover:border-amber-400',  text: 'text-amber-700',  icon: 'fa-hourglass-half',       dot: 'bg-amber-500'  },
    atrasada:   { bar: 'bg-orange-500', bg: 'bg-orange-50/60', border: 'border-orange-200 hover:border-orange-400',text: 'text-orange-700', icon: 'fa-triangle-exclamation', dot: 'bg-orange-500' },
    cancelada:  { bar: 'bg-red-500',    bg: 'bg-red-50/60',    border: 'border-red-200 hover:border-red-400',      text: 'text-red-700',    icon: 'fa-ban',                   dot: 'bg-red-500'    },
    outro_local:{ bar: 'bg-violet-500', bg: 'bg-violet-50/60', border: 'border-violet-200 hover:border-violet-400',text: 'text-violet-700', icon: 'fa-map-marker-alt',       dot: 'bg-violet-500' },
    outra_vacina:{bar: 'bg-cyan-500',   bg: 'bg-cyan-50/60',   border: 'border-cyan-200 hover:border-cyan-400',    text: 'text-cyan-700',   icon: 'fa-syringe',              dot: 'bg-cyan-500'   },
    nao_definido:{bar: 'bg-slate-400',  bg: 'bg-slate-50/60',  border: 'border-slate-200 hover:border-slate-400',  text: 'text-slate-500',  icon: 'fa-circle-question',      dot: 'bg-slate-400'  }
};

const ROTINA_STATUS_LABEL = {
    aplicada: 'Aplicada', proxima: 'Próxima dose', a_vencer: 'A vencer', atrasada: 'Atrasada',
    cancelada: 'Cancelada', outro_local: 'Outro local', outra_vacina: 'Outra vacina', nao_definido: 'Não definido'
};

function _rotinaTodayISO() { return toLocalISO(new Date()); }

function _rotinaDoseOrdinal(doseStr) {
    if (!doseStr) return null;
    const m = /^(\d+)ª Dose$/.exec(doseStr);
    if (m) return parseInt(m[1]);
    if (doseStr === 'Dose Única') return 1;
    if (doseStr === 'Dose Zero') return 0;
    return null; // 'Reforço' tratado à parte
}

// Classifica uma data (string YYYY-MM-DD) frente à janela de 30 dias.
function _rotinaDateBucket(dateStr) {
    const today = _rotinaTodayISO();
    const in30 = new Date(); in30.setHours(0,0,0,0); in30.setDate(in30.getDate() + 30);
    const in30Str = toLocalISO(in30);
    if (dateStr < today) return 'atrasada';
    if (dateStr <= in30Str) return 'a_vencer';
    return 'proxima';
}

function _rotinaFmtDate(dateStr) {
    return dateStr ? dateStr.split('-').reverse().join('/') : '—';
}

// Vacina de dose única que se repete periodicamente (ex.: Influenza anual):
// esquema com numDoses 1 e repete=true/repeteMeses definido.
//
// A busca do esquema usa a idade ATUAL do paciente — mas as doses já aplicadas
// podem ter sido registradas quando ele estava em outra faixa etária (ex.:
// esquema pediátrico de 2 doses aplicado ainda criança, hoje já fora dessa
// faixa). Por isso, mesmo achando um esquema "repete" pela idade atual, só o
// confirma se o histórico de aplicações for de fato compatível com repetição
// periódica — doses aplicadas com intervalo muito menor que repeteMeses
// indicam esquema primário de doses múltiplas mal rotulado como "Dose Única",
// não repetição anual.
function _rotinaEsquemaRepeteDoseUnica(vac, patient, apps) {
    const esq = (typeof getEsquemaPaciente === 'function') ? getEsquemaPaciente(vac, patient.dtNasc) : null;
    const candidate = (esq && esq.repete && esq.repeteMeses > 0 && (esq.numDoses || 1) === 1) ? esq
        : ((!esq && vac.esquemas && vac.esquemas.length)
            ? (vac.esquemas.find(e => e.repete && e.repeteMeses > 0 && (e.numDoses || 1) === 1) || null)
            : null);
    if (!candidate) return null;

    // Confere se as aplicações de "Dose Única" no histórico respeitam o intervalo
    // mínimo esperado de repetição (com folga de 50% pra não rejeitar antecipações legítimas).
    //
    // Exceção: a própria vacina pode ter um esquema PRIMÁRIO multi-dose em outra
    // faixa etária (ex.: Influenza — 2 doses na primeira vacinação infantil, depois
    // 1 dose anual). Nesse caso as primeiras aplicações naturalmente têm intervalo
    // curto, e isso não desmente a repetição anual: as doses do esquema primário
    // são "consumidas" antes de avaliar os gaps.
    if (apps && apps.length) {
        const appliedDoseUnica = apps
            .filter(a => a.status === 'Aplicado' && a.doseAtual === 'Dose Única' && a.data)
            .sort((a, b) => new Date(a.data) - new Date(b.data));
        // Maior esquema primário configurado na vacina (numDoses > 1)
        const primario = (vac.esquemas || []).reduce(
            (max, e) => ((e.numDoses || 1) > (max ? (max.numDoses || 1) : 1) ? e : max), null);
        const dosesPrimario = primario ? (primario.numDoses || 1) : 1;
        // Ignora os gaps internos do esquema primário (dosesPrimario - 1 intervalos)
        const startIdx = Math.max(1, dosesPrimario);
        const minGapDias = candidate.repeteMeses * 30 * 0.5;
        for (let i = startIdx; i < appliedDoseUnica.length; i++) {
            const gapDias = (new Date(appliedDoseUnica[i].data) - new Date(appliedDoseUnica[i - 1].data)) / 86400000;
            if (gapDias < minGapDias) return null;
        }
    }
    return candidate;
}

// Monta as "linhas" (uma por dose/marco) de uma vacina para o paciente, a
// partir dos appointments existentes + a próxima dose prevista (se houver).
function _rotinaBuildVaccineRow(vac, patient, apps) {
    const cards = [];
    const esqRepete = _rotinaEsquemaRepeteDoseUnica(vac, patient, apps);

    // "Dose Única" sempre mapeia pro ordinal 1 — correto pra esquema de repetição
    // periódica (cada aplicação substitui a anterior no mesmo slot). Mas quando NÃO é
    // repetição (esqRepete null) e existem várias aplicações de "Dose Única" pro mesmo
    // paciente/vacina, elas são, na prática, doses sequenciais de um esquema primário
    // mal rotulado — renumeramos por ordem de data (1ª, 2ª, ...) pra não colapsar
    // registros distintos no mesmo card.
    const ordinalOverride = new Map(); // appointment.id -> ordinal efetivo
    let doseUnicaRelabel = false;      // renumerar rótulo "Dose Única" -> "Nª Dose"?

    const doseUnicaApps = apps
        .filter(a => a.doseAtual === 'Dose Única')
        .sort((a, b) => new Date(a.data || 0) - new Date(b.data || 0));
    // Maior ordinal já ocupado por uma dose NUMERADA ('1ª Dose', '2ª Dose', ...).
    const maxNumbered = apps.reduce((max, a) => {
        const m = /^(\d+)ª Dose$/.exec(a.doseAtual || '');
        return m ? Math.max(max, parseInt(m[1])) : max;
    }, 0);
    const doseUnicaAppliedCount = doseUnicaApps.filter(a => a.status === 'Aplicado').length;

    if (doseUnicaApps.length && maxNumbered >= 1) {
        // A vacina tem doses numeradas E aplicações "Dose Única" (ex.: Influenza —
        // esquema primário de 2 doses na infância, depois a dose anual). "Dose Única"
        // mapeia pro ordinal 1 por padrão, colidindo com a '1ª Dose': o card do ordinal
        // escolhe um único registro e as Dose Única somem do prontuário. Empilhamos
        // elas ACIMA do maior numerado, cada uma no seu card, mantendo o rótulo.
        // Vale inclusive com esquema de repetição anual — cada ano é uma aplicação real
        // que precisa aparecer, não um slot que a seguinte substitui.
        let n = maxNumbered + 1;
        doseUnicaApps.forEach(a => { ordinalOverride.set(a.id, n++); });
    } else if (!esqRepete && doseUnicaAppliedCount > 1) {
        // Sem doses numeradas e sem repetição periódica: várias "Dose Única" são, na
        // prática, um esquema primário mal rotulado — renumera 1ª, 2ª, ...
        doseUnicaRelabel = true;
        let n = 1;
        doseUnicaApps.forEach(a => { ordinalOverride.set(a.id, n++); });
    }
    const _ordinalOf = a => ordinalOverride.has(a.id) ? ordinalOverride.get(a.id) : _rotinaDoseOrdinal(a.doseAtual);

    // Doses numeradas + Dose Única + Dose Zero, na ordem em que ocorreram/estão previstas.
    const numbered = apps
        .filter(a => _ordinalOf(a) !== null)
        .sort((a, b) => _ordinalOf(a) - _ordinalOf(b) || new Date(a.data) - new Date(b.data));

    // Agrupa por número de dose (pode haver mais de um registro pra mesma dose: ex. cancelado + reagendado)
    const byOrdinal = new Map();
    numbered.forEach(a => {
        const n = _ordinalOf(a);
        if (!byOrdinal.has(n)) byOrdinal.set(n, []);
        byOrdinal.get(n).push(a);
    });

    let maxAppliedOrdinal = -1;
    let lastAppliedApp = null;
    const missingGhosts = new Set(); // ordinais sem nenhum registro, abaixo da maior dose aplicada

    Array.from(byOrdinal.keys()).sort((a, b) => a - b).forEach(ordinal => {
        const regs = byOrdinal.get(ordinal);
        // Prioriza o registro "vivo" mais relevante: Aplicado > Agendado/Em negociação/Nova oportunidade > Perdido
        const applied = regs.find(a => a.status === 'Aplicado');
        const outroLocalReg = regs.find(a => a.status === 'Perdido' && a.aplicadaOutroLocal);
        const outraVacinaReg = regs.find(a => a.status === 'Perdido' && a.outraVacina);
        const pending = regs.filter(a => a.status === 'Agendado' || a.status === 'Em negociação' || a.status === 'Nova oportunidade')
            .sort((a, b) => new Date(a.data) - new Date(b.data))[0];
        const cancelled = regs.find(a => a.status === 'Perdido' && !a.aplicadaOutroLocal && !a.outraVacina);

        const reg = applied || outroLocalReg || outraVacinaReg || pending || cancelled;
        if (!reg) return;

        // Roxo só quando o registro foi marcado como outro local. Uma dose aplicada é
        // sempre "Aplicada", mesmo sem as doses anteriores no sistema — essas lacunas
        // viram cards "Não definido" (abaixo), onde o usuário define o que houve.
        let status;
        if (outroLocalReg && !applied) {
            status = 'outro_local';
        } else if (outraVacinaReg && !applied) {
            status = 'outra_vacina';
        } else if (applied) {
            status = 'aplicada';
            maxAppliedOrdinal = ordinal;
            lastAppliedApp = applied;
            // Doses anteriores sem nenhum registro no sistema: viram cards fantasma
            // "não definido", clicáveis pra abrir a janela de Perda da Oportunidade.
            if (ordinal > 1 && !esqRepete) {
                for (let n = 1; n < ordinal; n++) {
                    // Só vira card fantasma se não houver NENHUM registro pra essa dose —
                    // qualquer registro (aplicado, cancelado, outro local, outra vacina,
                    // pendente) já gera seu próprio card no loop principal.
                    const hasRegN = byOrdinal.has(n) && byOrdinal.get(n).length > 0;
                    if (!hasRegN) missingGhosts.add(n);
                }
            }
        } else if (cancelled && !pending) {
            status = 'cancelada';
        } else if (pending) {
            status = _rotinaDateBucket(pending.data);
        } else {
            status = 'cancelada';
        }

        const outraVacinaCoverDate = outraVacinaReg
            ? (appointments.find(x => x.id == outraVacinaReg.outraVacinaAppId)?.data || outraVacinaReg.data)
            : null;

        const doseUnicaRenumbered = doseUnicaRelabel && ordinalOverride.has(reg.id);
        cards.push({
            _ordinal: ordinal,
            label: (esqRepete && reg.doseAtual === 'Dose Única') ? 'Dose Única' : (doseUnicaRenumbered ? `${ordinal}ª Dose` : reg.doseAtual),
            date: applied ? applied.data
                : outroLocalReg ? outroLocalReg.data
                : outraVacinaReg ? outraVacinaCoverDate
                : (pending ? pending.data : (cancelled ? cancelled.data : null)),
            status,
            appointmentId: reg.id,
            hasAppointment: true
        });
    });

    missingGhosts.forEach(n => {
        cards.push({
            _ordinal: n,
            label: `${n}ª Dose`,
            date: null,
            status: 'nao_definido',
            appointmentId: null,
            hasAppointment: false,
            ghostNaoDefinido: true,
            suggestedDose: `${n}ª Dose`
        });
    });
    cards.sort((a, b) => (a._ordinal || 0) - (b._ordinal || 0));

    // Reforço(s) (se aplicável) — mesmo tratamento, um card por reforço com registro.
    // Percorre até REFORCO_MAX (não só os reforços configurados na vacina hoje):
    // um agendamento já existente com rótulo "2º Reforço"/"3º Reforço" precisa
    // continuar visível mesmo que a vacina tenha sido reconfigurada depois para
    // menos reforços do que tinha quando o registro foi criado/importado.
    for (let i = 0; i < REFORCO_MAX; i++) {
        const lbl = reforcoLabel(i + 1);
        const reforcoRegs = apps.filter(a => a.doseAtual === lbl);
        if (!reforcoRegs.length) continue;
        const applied = reforcoRegs.find(a => a.status === 'Aplicado');
        const outroLocalReg = reforcoRegs.find(a => a.status === 'Perdido' && a.aplicadaOutroLocal);
        const outraVacinaReg = reforcoRegs.find(a => a.status === 'Perdido' && a.outraVacina);
        const pending = reforcoRegs.filter(a => a.status === 'Agendado' || a.status === 'Em negociação' || a.status === 'Nova oportunidade')
            .sort((a, b) => new Date(a.data) - new Date(b.data))[0];
        const cancelled = reforcoRegs.find(a => a.status === 'Perdido' && !a.aplicadaOutroLocal && !a.outraVacina);
        const reg = applied || outroLocalReg || outraVacinaReg || pending || cancelled;
        let status;
        if (outroLocalReg && !applied) status = 'outro_local';
        else if (outraVacinaReg && !applied) status = 'outra_vacina';
        else if (applied) { status = 'aplicada'; lastAppliedApp = applied; }
        else if (cancelled && !pending) status = 'cancelada';
        else if (pending) status = _rotinaDateBucket(pending.data);
        else status = 'cancelada';

        const outraVacinaCoverDateReforco = outraVacinaReg
            ? (appointments.find(x => x.id == outraVacinaReg.outraVacinaAppId)?.data || outraVacinaReg.data)
            : null;

        cards.push({
            label: lbl,
            date: applied ? applied.data
                : outroLocalReg ? outroLocalReg.data
                : outraVacinaReg ? outraVacinaCoverDateReforco
                : (pending ? pending.data : (cancelled ? cancelled.data : null)),
            status,
            appointmentId: reg.id,
            hasAppointment: true
        });
    }

    // Próxima dose prevista (sem registro ainda) — card azul/amarelo/laranja "fantasma", clicável p/ agendar.
    const next = _rotinaNextDoseSuggestion(vac, patient, apps, maxAppliedOrdinal, lastAppliedApp, esqRepete);
    if (next) cards.push(next);

    return cards;
}

// Calcula a próxima dose/reforço ainda sem nenhum registro no sistema.
function _rotinaNextDoseSuggestion(vac, patient, apps, maxAppliedOrdinal, lastAppliedApp, esqRepete) {
    // Vacina somente reforço (esquema com 0 doses): não há dose numerada, a base
    // da sugestão é o próprio reforço já aplicado.
    const somenteReforco = (typeof isVaccineSomenteReforco === 'function') && isVaccineSomenteReforco(vac);
    if (!lastAppliedApp) return null;
    if (maxAppliedOrdinal < 0 && !somenteReforco) return null;
    // Vacina desativada: não sugere próxima dose/reforço, só mantém o histórico já aplicado.
    if (vac.ativo === false) return null;

    // Dose única que se repete periodicamente (ex.: Influenza anual): sempre
    // sugere a próxima aplicação a partir da última, ignorando numDoses/reforço.
    if (esqRepete) {
        const d = new Date(lastAppliedApp.data + 'T00:00:00');
        d.setMonth(d.getMonth() + esqRepete.repeteMeses);
        const dateStr = d.toISOString().split('T')[0];
        return {
            label: 'Dose Única',
            date: dateStr,
            status: _rotinaDateBucket(dateStr),
            appointmentId: null,
            hasAppointment: false,
            suggestedDose: 'Dose Única'
        };
    }

    const esq = (typeof getEsquemaPaciente === 'function') ? getEsquemaPaciente(vac, patient.dtNasc) : null;
    const _nd = e => (typeof esquemaSemDoses === 'function' && esquemaSemDoses(e)) ? 0 : (e.numDoses || 1);
    const totalDoses = (vac.esquemas && vac.esquemas.length)
        ? Math.max(...vac.esquemas.map(_nd))
        : (esq ? _nd(esq) : (vac.numDoses || 1));

    // Já existe registro (mesmo que só previsto) para a próxima dose numerada? _rotinaBuildVaccineRow já cobre isso.
    const nextOrdinal = maxAppliedOrdinal + 1;
    const alreadyHasNext = apps.some(a => _rotinaDoseOrdinal(a.doseAtual) === nextOrdinal);

    if (!alreadyHasNext && nextOrdinal <= totalDoses && totalDoses > 1) {
        const intervalos = (esq && esq.intervalos && esq.intervalos.length) ? esq.intervalos
            : (vac.intervalos && vac.intervalos.length ? vac.intervalos
                : (vac.intervaloDias > 0 ? [vac.intervaloDias] : []));
        let intervalo = intervalos.length
            ? (intervalos[maxAppliedOrdinal - 1] != null ? intervalos[maxAppliedOrdinal - 1] : intervalos[intervalos.length - 1])
            : 30;
        if (!intervalo || intervalo <= 0) intervalo = 30;
        const baseDate = new Date(lastAppliedApp.data + 'T00:00:00');
        const calcDate = new Date(baseDate); calcDate.setDate(calcDate.getDate() + intervalo);
        const dateStr = toLocalISO(calcDate);
        return {
            label: `${nextOrdinal}ª Dose`,
            date: dateStr,
            status: _rotinaDateBucket(dateStr),
            appointmentId: null,
            hasAppointment: false,
            suggestedDose: `${nextOrdinal}ª Dose`
        };
    }

    // Reforço previsto (esquema completo, vacina prevê reforço, ainda sem registro).
    // Percorre os reforços em ordem: sugere o primeiro ainda sem registro cuja
    // base (reforço anterior aplicado, ou esquema completo p/ o 1º) já exista.
    const reforcos = getVaccineReforcos(vac);
    if (reforcos.length) {
        const completed = totalDoses === 0
            ? true // somente reforço: não há esquema primário a completar
            : totalDoses === 1
            ? apps.some(a => (a.doseAtual === 'Dose Única' || a.doseAtual === '1ª Dose') && (a.status === 'Aplicado' || (a.status === 'Perdido' && a.aplicadaOutroLocal)))
            : maxAppliedOrdinal >= totalDoses;
        for (let i = 0; i < reforcos.length; i++) {
            const lbl = reforcoLabel(i + 1);
            const hasReforcoReg = apps.some(a => a.doseAtual === lbl);
            if (hasReforcoReg) continue;
            let baseApp, baseCompleted;
            if (i === 0) {
                baseApp = lastAppliedApp;
                baseCompleted = completed;
            } else {
                const prevLbl = reforcoLabel(i);
                baseApp = apps.find(a => a.doseAtual === prevLbl && a.status === 'Aplicado');
                baseCompleted = !!baseApp;
            }
            if (!baseCompleted || !baseApp) return null; // reforços seguintes dependem do anterior aplicado
            const d = new Date(baseApp.data + 'T00:00:00');
            if (reforcos[i].meses > 0) d.setMonth(d.getMonth() + reforcos[i].meses);
            else {
                const intervalos = (esq && esq.intervalos && esq.intervalos.length) ? esq.intervalos : [];
                const intervalo = intervalos[totalDoses] || vac.intervaloDias || 365;
                d.setDate(d.getDate() + intervalo);
            }
            const dateStr = d.toISOString().split('T')[0];
            return {
                label: lbl,
                date: dateStr,
                status: _rotinaDateBucket(dateStr),
                appointmentId: null,
                hasAppointment: false,
                suggestedDose: lbl
            };
        }
    }

    return null;
}

function _rotinaCardHtml(vac, patient, card) {
    const style = ROTINA_STATUS_STYLE[card.status] || ROTINA_STATUS_STYLE.proxima;
    const label = ROTINA_STATUS_LABEL[card.status] || card.status;
    const dateLine = card.date ? `Aplicada em ${_rotinaFmtDate(card.date)}` : 'Sem data';
    const dateLineOther = {
        proxima: card.date ? `Prevista para ${_rotinaFmtDate(card.date)}` : 'Data a definir',
        a_vencer: card.date ? `Prevista para ${_rotinaFmtDate(card.date)}` : 'Data a definir',
        atrasada: card.date ? `Prevista para ${_rotinaFmtDate(card.date)}` : 'Data a definir',
        cancelada: card.date ? `Cancelada • ${_rotinaFmtDate(card.date)}` : 'Cancelada',
        outro_local: card.date ? `Registrada em ${_rotinaFmtDate(card.date)}` : 'Aplicada em outro local',
        outra_vacina: card.date ? `Suprida em ${_rotinaFmtDate(card.date)}` : 'Suprida por outra vacina',
        nao_definido: 'Não registrada — clique p/ definir'
    };
    const line = card.status === 'aplicada' ? dateLine : (dateLineOther[card.status] || dateLine);

    const onclick = card.ghostNaoDefinido
        ? `rotinaAbrirPerdaOportunidade(${patient.id}, ${vac.id}, '${card.suggestedDose}')`
        : (card.hasAppointment
            ? `viewRecord(${card.appointmentId})`
            : `rotinaAgendarSugestao(${patient.id}, ${vac.id}, '${card.suggestedDose}', '${card.date}')`);

    const actionLabel = card.ghostNaoDefinido ? 'Definir motivo' : (card.hasAppointment ? 'Ver detalhes' : 'Agendar');
    const actionIcon = card.ghostNaoDefinido ? 'fa-circle-question' : (card.hasAppointment ? 'fa-arrow-right' : 'fa-calendar-plus');

    return `
    <button onclick="${onclick}" class="rotina-card relative w-36 shrink-0 text-left ${style.bg} border ${style.border} rounded-xl shadow-sm hover:shadow-md transition overflow-hidden group">
        <div class="h-1 w-full ${style.bar}"></div>
        <div class="p-3">
            <div class="flex items-center justify-between mb-1.5">
                <span class="text-xs font-black text-navy-900">${card.label}</span>
                <span class="h-5 w-5 rounded-full bg-white flex items-center justify-center shadow-sm border border-slate-100 ${style.text}"><i class="fas ${style.icon} text-[9px]"></i></span>
            </div>
            <p class="text-[9px] font-black uppercase tracking-wider ${style.text} mb-1">${label}</p>
            <p class="text-[10px] text-slate-500 font-bold leading-tight">${line}</p>
            <p class="mt-2 text-[9px] font-black uppercase tracking-wider ${style.text} opacity-0 group-hover:opacity-100 transition flex items-center gap-1">${actionLabel} <i class="fas ${actionIcon} text-[8px]"></i></p>
        </div>
    </button>`;
}

function renderRotinaTab(patientId) {
    const wrap = document.getElementById('rotina-list');
    if (!wrap) return;
    const patient = patients.find(p => p.id == patientId);
    if (!patient) { wrap.innerHTML = ''; return; }

    const apps = appointments.filter(a => a.patientId == patientId);
    if (!apps.length) {
        wrap.innerHTML = '<div class="text-center py-10"><i class="fas fa-syringe text-4xl text-slate-200 mb-3"></i><p class="text-sm text-slate-400 font-bold uppercase">Nenhuma vacina registrada</p></div>';
        return;
    }

    const vacIds = Array.from(new Set(apps.map(a => a.vaccineId)));
    const rows = vacIds
        .map(vacId => vaccines.find(v => v.id == vacId))
        .filter(Boolean)
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
        .map(vac => {
            const vacApps = apps.filter(a => a.vaccineId == vac.id);
            const cards = _rotinaBuildVaccineRow(vac, patient, vacApps);
            if (!cards.length) return '';
            return `
            <div class="border-b border-slate-100 pb-5 last:border-0 last:pb-0">
                <h5 class="text-xs font-black text-navy-900 uppercase tracking-wide mb-2.5">${vac.nome}</h5>
                <div class="flex gap-3 overflow-x-auto pb-1">${cards.map(c => _rotinaCardHtml(vac, patient, c)).join('')}</div>
            </div>`;
        })
        .join('');

    wrap.innerHTML = rows || '<div class="text-center py-10"><i class="fas fa-syringe text-4xl text-slate-200 mb-3"></i><p class="text-sm text-slate-400 font-bold uppercase">Nenhuma vacina registrada</p></div>';
}

// Abre o formulário de agendamento pré-preenchido com a dose sugerida, por
// cima do prontuário (mesmo padrão de openAgendarFromProntuario).
function rotinaAgendarSugestao(patId, vacId, dose, dataIso) {
    if (!checkPerm('criar_agendamento')) return;
    window._agendaOpenedFromProntuario = true;
    if (typeof agendarOportunidade === 'function') {
        agendarOportunidade(patId, vacId, dose, dataIso);
        setTimeout(() => { document.getElementById('modal-record').style.zIndex = '130'; }, 0);
    }
}

// Dose faltante (sem nenhum registro no sistema, "buraco" abaixo de uma dose
// CPNI/aplicada): abre a janela de "Perda da Oportunidade" pra que o usuário
// defina o motivo real — outro local, outra vacina ou um motivo de perda comum.
function rotinaAbrirPerdaOportunidade(patId, vacId, dose) {
    if (!checkPerm('criar_agendamento')) return;
    if (typeof openDismissOppModal !== 'function') return;
    openDismissOppModal(patId, vacId, dose, { fromRotina: true });
}

// Atalho do modal de Perda (aberto pela Rotina): a dose consta no CPNI — troca
// para o formulário de inclusão manual, já com vacina e dose preenchidas.
function dismissOppIncluirCpni() {
    if (!_dismissPending) return;
    const { patId, vacId, dose } = _dismissPending;
    closeDismissOppModal();
    openCpniManualModal(patId, vacId, dose);
}
