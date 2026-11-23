// ═══════════════════════════════════════════════════════════════════════════
//  ALMOXARIFADO — Controle de Estoque, Lotes, Reservas e Movimentação
// ═══════════════════════════════════════════════════════════════════════════
//
//  MODELO DE ESTOQUE (por lote)
//  ─────────────────────────────────────────────────────────────────────────
//  • lote.quantidade        → total recebido (entradas acumuladas no cadastro)
//  • Saídas automáticas      → agendamentos com status "Aplicado"  (consumo real)
//  • Reservas                → agendamentos com status "Agendado"   (reservado)
//  • Saídas manuais          → stockMovements tipo 'saida' (descarte / ajuste)
//  • Entradas manuais        → stockMovements tipo 'entrada' (reabastecimento)
//
//  disponível = quantidadeTotal − aplicado − reservado − saídasManuais
//  Quando disponível ≤ 0  →  lote é desativado (status 'fechado') automaticamente.
//  Recebendo nova entrada  →  lote é reativado (status 'aberto').
// ═══════════════════════════════════════════════════════════════════════════

// ─── CÁLCULO DE ESTOQUE ───────────────────────────────────────────────────────

// Total recebido = quantidade base do lote + entradas manuais registradas
function getLoteEntradas(loteId) {
    const base = Number(vaccineLots.find(l => l.id == loteId)?.quantidade) || 0;
    const manuais = stockMovements
        .filter(m => m.loteId == loteId && m.tipo === 'entrada')
        .reduce((s, m) => s + (Number(m.qtd) || 0), 0);
    return base + manuais;
}

// Doses aplicadas (saída real de estoque) vinculadas ao lote
function getLoteAplicado(loteId) {
    return appointments.filter(a => a.loteId == loteId && a.status === 'Aplicado').length;
}

// Doses reservadas (agendadas, ainda não aplicadas) vinculadas ao lote
function getLoteReservado(loteId) {
    return appointments.filter(a => a.loteId == loteId && a.status === 'Agendado').length;
}

// Saídas manuais (descarte / ajuste) registradas na movimentação
// Movs gerados automaticamente por agendamento (appointmentId presente) são excluídos
// pois já entram no cálculo via getLoteAplicado / getLoteReservado
function getLoteSaidasManuais(loteId) {
    return stockMovements
        .filter(m => m.loteId == loteId && m.tipo === 'saida' && !m.appointmentId)
        .reduce((s, m) => s + (Number(m.qtd) || 0), 0);
}

// Retorna o panorama completo de estoque de um lote
function getLoteEstoque(loteId) {
    const total      = getLoteEntradas(loteId);
    const aplicado   = getLoteAplicado(loteId);
    const reservado  = getLoteReservado(loteId);
    const saidaManual = getLoteSaidasManuais(loteId);
    const disponivel = total - aplicado - reservado - saidaManual;
    return { total, aplicado, reservado, saidaManual, disponivel: Math.max(0, disponivel), _disponivelRaw: disponivel };
}

// Estoque consolidado de uma vacina (somando todos os lotes)
function getVaccineEstoque(vaccineId) {
    const lotes = vaccineLots.filter(l => l.vaccineId == vaccineId);
    return lotes.reduce((acc, l) => {
        const e = getLoteEstoque(l.id);
        acc.total += e.total; acc.aplicado += e.aplicado;
        acc.reservado += e.reservado; acc.saidaManual += e.saidaManual;
        acc.disponivel += e.disponivel;
        acc.lotesAtivos += (l.status === 'aberto' && e.disponivel > 0) ? 1 : 0;
        acc.lotesTotal += 1;
        return acc;
    }, { total:0, aplicado:0, reservado:0, saidaManual:0, disponivel:0, lotesAtivos:0, lotesTotal:0 });
}

// ─── CUSTO DO LOTE ────────────────────────────────────────────────────────────
// O custo é informado como UNITÁRIO (lote.custoUnit) — valor de uma dose.
// O total do lote é derivado das doses que entraram, e a valorização do
// estoque acompanha o consumo das doses.
// Compatibilidade: lotes antigos gravaram custoTotal + custoQtd; nesse caso o
// unitário é derivado dessa dupla.
function getLoteCusto(loteId) {
    const l = vaccineLots.find(x => x.id == loteId);
    return getLoteCustoFrom(l, loteId);
}

// Unitário do lote (null se não informado) — trata o formato legado.
function getLoteCustoUnit(l) {
    if (!l) return null;
    const u = Number(l.custoUnit);
    if (l.custoUnit != null && l.custoUnit !== '' && isFinite(u)) return u;
    const total = Number(l.custoTotal);
    if (l.custoTotal == null || l.custoTotal === '' || !isFinite(total)) return null;
    const qtd = Number(l.custoQtd) || 0;
    return qtd > 0 ? total / qtd : null;
}

function getLoteCustoFrom(l, loteId) {
    const vazio = { informado: false, total: null, qtd: 0, unit: null, valorDisponivel: null, valorReservado: null, valorEstoque: null };
    if (!l) return vazio;
    const unit = getLoteCustoUnit(l);
    if (unit == null) return vazio;
    const id = loteId != null ? loteId : l.id;
    const qtd = getLoteEntradas(id);
    const est = getLoteEstoque(id);
    return {
        informado: true,
        total: unit * qtd,
        qtd,
        unit,
        valorDisponivel: unit * est.disponivel,
        valorReservado:  unit * est.reservado,
        valorEstoque:    unit * (est.disponivel + est.reservado)
    };
}

// Custo consolidado de uma vacina (todos os lotes com custo informado).
// unitMedio é ponderado pelas doses ainda em estoque — não média simples.
function getVaccineCusto(vaccineId) {
    const acc = { informado: false, lotesComCusto: 0, totalNotas: 0, valorDisponivel: 0, valorEstoque: 0, dosesComCusto: 0, unitMedio: null };
    vaccineLots.filter(l => l.vaccineId == vaccineId).forEach(l => {
        const c = getLoteCustoFrom(l);
        if (!c.informado || c.unit == null) return;
        const est = getLoteEstoque(l.id);
        acc.informado = true;
        acc.lotesComCusto++;
        acc.totalNotas      += c.total;
        acc.valorDisponivel += c.valorDisponivel;
        acc.valorEstoque    += c.valorEstoque;
        acc.dosesComCusto   += est.disponivel + est.reservado;
    });
    if (acc.dosesComCusto > 0) acc.unitMedio = acc.valorEstoque / acc.dosesComCusto;
    return acc;
}

// Valor total imobilizado em estoque (todos os lotes que tenham custo)
function getEstoqueValorTotal() {
    let valor = 0, informado = false;
    vaccineLots.forEach(l => {
        const c = getLoteCustoFrom(l);
        if (c.informado && c.valorEstoque != null) { valor += c.valorEstoque; informado = true; }
    });
    return { valor, informado };
}

// Mostra/esconde os campos de custo conforme permissão e atualiza o preview
// do total do lote enquanto o usuário digita o custo por dose.
function aplicarVisibilidadeCusto() {
    const pode = (typeof canSeeCusto === 'function') && canSeeCusto();
    ['novo-lote-custo-wrap', 'fab-lote-custo-wrap', 'edit-lote-custo-wrap'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden', !pode);
    });
}

function _custoQtdBase(prefixo) {
    if (prefixo === 'edit') {
        const l = vaccineLots.find(x => x.id == document.getElementById('edit-lote-id').value);
        return l ? getLoteEntradas(l.id) : 0;
    }
    return parseInt(document.getElementById(prefixo + '-lote-qtd').value, 10) || 0;
}

// Mostra o total do lote enquanto o usuário digita o custo por dose.
function atualizarCustoUnitPreview(prefixo) {
    const lbl = document.getElementById(prefixo + '-lote-custo-unit');
    if (!lbl) return;
    const unit = parseCusto(document.getElementById(prefixo + '-lote-custo').value);
    const qtd = _custoQtdBase(prefixo);
    if (unit == null || qtd <= 0) { lbl.innerHTML = '&nbsp;'; return; }
    lbl.textContent = `Total do lote ${fmtCusto(unit * qtd)} · ${qtd} dose(s)`;
}

// Disponível considerando que um agendamento já reserva 1 dose deste lote
// (usado para validar edição sem contar a própria reserva em dobro)
function getLoteDisponivelParaAgendamento(loteId, ignoreAppointmentId) {
    const total      = getLoteEntradas(loteId);
    const aplicado   = appointments.filter(a => a.loteId == loteId && a.status === 'Aplicado' && a.id != ignoreAppointmentId).length;
    const reservado  = appointments.filter(a => a.loteId == loteId && a.status === 'Agendado' && a.id != ignoreAppointmentId).length;
    const saidaManual = getLoteSaidasManuais(loteId);
    return total - aplicado - reservado - saidaManual;
}

// ─── MOVIMENTAÇÃO AUTOMÁTICA POR AGENDAMENTO ─────────────────────────────────
// Mantém exatamente 1 stockMovement por agendamento (appointmentId = a.id).
// - loteId preenchido + status Agendado  → tipo 'reserva'
// - loteId preenchido + status Aplicado  → tipo 'saida'
// - loteId removido ou status Cancelado  → remove o mov
// Movs de tipo 'reserva' e 'saida' com appointmentId NÃO entram em getLoteSaidasManuais.
function syncAppointmentMovement(appointment) {
    const { id, loteId, vaccineId, status } = appointment;
    // Remove mov anterior deste agendamento (garante 1 por card)
    stockMovements = stockMovements.filter(m => m.appointmentId != id);

    if (!loteId || status === 'Perdido') return;

    let tipo;
    if (status === 'Agendado') tipo = 'reserva';
    else if (status === 'Aplicado') tipo = 'saida';
    else return; // outros status não geram mov

    const lote = vaccineLots.find(l => l.id == loteId);
    stockMovements.push({
        id: Date.now(),
        appointmentId: id,
        loteId: Number(loteId),
        vaccineId: lote ? Number(lote.vaccineId) : (vaccineId ? Number(vaccineId) : null),
        tipo,
        qtd: 1,
        motivo: tipo === 'reserva' ? 'Reserva automática (agendamento)' : 'Saída automática (aplicação)',
        descarte: false,
        data: new Date().toISOString(),
        usuario: currentUser ? currentUser.nome : '—'
    });
}

// ─── DESATIVAÇÃO / REATIVAÇÃO AUTOMÁTICA DE LOTES ──────────────────────────────
// Lote com disponível ≤ 0 e que já teve entrada → fechado.
// Lote com disponível > 0 → aberto.  Retorna true se algo mudou.
function syncLoteStatus(loteId) {
    const lote = vaccineLots.find(l => l.id == loteId);
    if (!lote) return false;
    const e = getLoteEstoque(loteId);
    let changed = false;
    if (e.total > 0 && e.disponivel <= 0 && lote.status !== 'fechado') {
        lote.status = 'fechado';
        lote._autoFechado = true; // marca que foi automático (zerou estoque)
        changed = true;
    } else if (e.disponivel > 0 && lote.status === 'fechado' && lote._autoFechado) {
        lote.status = 'aberto';
        lote._autoFechado = false;
        changed = true;
    }
    return changed;
}

// Re-sincroniza todos os lotes (chamar após qualquer alteração de estoque)
function syncAllLoteStatus() {
    let changed = false;
    vaccineLots.forEach(l => { if (syncLoteStatus(l.id)) changed = true; });
    return changed;
}

// ─── NAVEGAÇÃO ENTRE MÓDULOS ───────────────────────────────────────────────────
function switchAlmoxModulo(modulo) {
    almoxModulo = modulo;
    // oculta todos os módulos
    document.querySelectorAll('.alm-modulo').forEach(el => el.classList.add('hidden'));
    // reseta estilo de todos os botões da barra lateral
    document.querySelectorAll('.alm-mod-btn').forEach(btn => {
        btn.classList.remove('active-alm');
    });
    // exibe módulo ativo
    document.getElementById('alm-modulo-' + modulo)?.classList.remove('hidden');
    // destaca botão ativo
    const activeBtn = document.getElementById('alm-btn-' + modulo);
    if (activeBtn) {
        activeBtn.classList.add('active-alm');
    }
    const fab = document.getElementById('fab-novo-lote');
    if (fab) fab.classList.toggle('hidden', modulo !== 'lotes');
    const fabVac = document.getElementById('fab-nova-vacina');
    if (fabVac) fabVac.classList.toggle('hidden', modulo !== 'produtos');
    if (modulo === 'estoque')           renderEstoqueDashboard();
    else if (modulo === 'produtos')     renderVaccines();
    else if (modulo === 'lotes')        renderAlmoxLotes();
    else if (modulo === 'movimentacao') renderMovimentacao();
}

// Re-renderiza o módulo ativo quando os dados mudam via sync
function refreshAlmoxIfActive() {
    if (!document.getElementById('tab-vacinas')?.classList.contains('active')) return;
    if (almoxModulo === 'estoque')           renderEstoqueDashboard();
    else if (almoxModulo === 'produtos')     renderVaccines();
    else if (almoxModulo === 'lotes')        renderAlmoxLotes();
    else if (almoxModulo === 'movimentacao') renderMovimentacao();
}

// ═══════════════════════════════════════════════════════════════════════════
//  MÓDULO: ESTOQUE (Dashboard)
// ═══════════════════════════════════════════════════════════════════════════
let estoqueSearch = '';
let estoqueFilter = 'todos'; // 'todos' | 'baixo' | 'sem'

function setEstoqueSearch(val) { estoqueSearch = normalizeStr(val); renderEstoqueDashboard(); }

function toggleEstoqueSearch() {
    const wrap = document.getElementById('wrap-estoque-search');
    const input = document.getElementById('input-estoque-search');
    const isOpen = wrap.style.maxWidth !== '0px' && wrap.style.maxWidth !== '0';
    if (isOpen) {
        wrap.style.maxWidth = '0'; wrap.style.opacity = '0';
        input.value = ''; setEstoqueSearch('');
    } else {
        wrap.style.maxWidth = '200px'; wrap.style.opacity = '1';
        setTimeout(() => input.focus(), 50);
    }
}

function setEstoqueFilter(filter) {
    estoqueFilter = filter;
    ['todos', 'baixo', 'sem'].forEach(f => {
        const btn = document.getElementById(`estoque-filter-${f}`);
        if (!btn) return;
        const active = f === filter;
        btn.className = `px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition ${active ? 'bg-navy-900 text-white shadow' : 'text-slate-500 hover:bg-white'}`;
    });
    renderEstoqueDashboard();
}

function renderEstoqueDashboard() {
    const ativos = vaccines.filter(v => v.ativo !== false);
    // KPIs gerais
    let kDisp = 0, kReserv = 0, lotesVencidos = 0, lotesVencendo = 0;
    const today = new Date(); today.setHours(0,0,0,0);
    const twoMonths = new Date(); twoMonths.setMonth(twoMonths.getMonth() + 2); twoMonths.setHours(0,0,0,0);
    vaccineLots.forEach(l => {
        const e = getLoteEstoque(l.id);
        kDisp += e.disponivel; kReserv += e.reservado;
        if (l.validade) {
            const exp = new Date(l.validade + 'T00:00:00');
            if (exp < today && e.disponivel > 0) lotesVencidos++;
            else if (exp <= twoMonths && e.disponivel > 0) lotesVencendo++;
        }
    });
    const kBaixo = ativos.filter(v => { const e = getVaccineEstoque(v.id); return e.disponivel > 0 && e.disponivel <= (v.estoqueMinimo || 5); }).length;
    const kSem   = ativos.filter(v => getVaccineEstoque(v.id).disponivel <= 0).length;
    setText('estoque-kpi-disponivel', kDisp);
    setText('estoque-kpi-reservado', kReserv);
    setText('estoque-kpi-baixo', kBaixo);
    setText('estoque-kpi-sem', kSem);
    setText('estoque-kpi-vencidos', lotesVencidos);
    setText('estoque-kpi-vencendo', lotesVencendo);
    const kpiValorBox = document.getElementById('estoque-kpi-valor-box');
    if (kpiValorBox) {
        const podeC = (typeof canSeeCusto === 'function') && canSeeCusto();
        kpiValorBox.classList.toggle('hidden', !podeC);
        if (podeC) {
            const tot = getEstoqueValorTotal();
            setText('estoque-kpi-valor', tot.informado ? fmtCusto(tot.valor) : '—');
        }
    }

    // Cards por produto
    const grid = document.getElementById('estoque-body');
    if (!grid) return;
    const rows = ativos
        .filter(v => !estoqueSearch || normalizeStr(v.nome).includes(estoqueSearch) ||
            (v.mnemonico && normalizeStr(v.mnemonico).includes(estoqueSearch)) ||
            vaccineLots.some(l => l.vaccineId == v.id && l.fabricante && normalizeStr(l.fabricante).includes(estoqueSearch)))
        .map(v => ({ v, e: getVaccineEstoque(v.id) }))
        .filter(({ v, e }) => {
            if (estoqueFilter === 'sem')   return e.disponivel <= 0;
            if (estoqueFilter === 'baixo') return e.disponivel > 0 && e.disponivel <= (v.estoqueMinimo || 5);
            return true;
        })
        .sort((a, b) => a.v.nome.localeCompare(b.v.nome, 'pt-BR'));

    if (!rows.length) {
        grid.innerHTML = `<div class="col-span-full p-10 text-center text-slate-400 text-xs font-bold uppercase tracking-wider"><i class="fas fa-box-open text-3xl mb-3 block text-slate-300"></i>Nenhum produto encontrado</div>`;
        return;
    }

    const _isDark = document.body.classList.contains('dark-mode');
    const _d = (light, dark) => _isDark ? dark : light;

    grid.innerHTML = rows.map(({ v, e }) => {
        const semEstoque = e.disponivel <= 0;
        const baixo = !semEstoque && e.disponivel <= (v.estoqueMinimo || 5);

        const tema = semEstoque ? {
            card:       _d('bg-red-50 border-red-200',    'border-red-900/60'),
            cardBg:     _d('#fff',                         '#2d0a0a'),
            iconBg:     _d('bg-red-100 text-red-500',      'bg-red-900/40 text-red-400'),
            acento:     _d('text-red-500',                 'text-red-400'),
            label:      _d('text-red-400',                 'text-red-500/70'),
            valor:      _d('text-red-700',                 'text-red-400'),
            badge:      _d('bg-red-100 text-red-600 border-red-200',    'bg-red-900/40 text-red-400 border-red-700/50'),
            bar:        _d('bg-red-300',                   'bg-red-700'),
            barBg:      _d('bg-red-100',                   'bg-red-900/40'),
            divisor:    _d('border-red-100',               'border-red-900/40'),
            statusBg:   _d('bg-red-100 text-red-600 border-red-200',    'bg-red-900/40 text-red-400 border-red-700/50'),
            statusIcon: 'fa-circle-xmark',
            statusLabel:'Sem estoque',
            hover:      'hover:shadow-red-900/20',
            metaColor:  _d('text-slate-400',               'text-slate-500'),
            nameColor:  _d('text-slate-800',               'text-slate-200'),
            numColor:   _d('text-slate-700',               'text-slate-300'),
            valorBg:    _d('bg-white',                     'bg-red-900/20'),
        } : baixo ? {
            card:       _d('bg-amber-50 border-amber-200', 'border-amber-700/60'),
            cardBg:     _d('#fff',                         '#1c1500'),
            iconBg:     _d('bg-amber-100 text-amber-500',  'bg-amber-900/40 text-amber-400'),
            acento:     _d('text-amber-500',               'text-amber-400'),
            label:      _d('text-amber-400',               'text-amber-500/70'),
            valor:      _d('text-amber-700',               'text-amber-400'),
            badge:      _d('bg-amber-100 text-amber-600 border-amber-200', 'bg-amber-900/40 text-amber-400 border-amber-700/50'),
            bar:        _d('bg-amber-400',                 'bg-amber-600'),
            barBg:      _d('bg-amber-100',                 'bg-amber-900/40'),
            divisor:    _d('border-amber-100',             'border-amber-900/40'),
            statusBg:   _d('bg-amber-100 text-amber-600 border-amber-200', 'bg-amber-900/40 text-amber-400 border-amber-700/50'),
            statusIcon: 'fa-triangle-exclamation',
            statusLabel:'Estoque baixo',
            hover:      'hover:shadow-amber-900/20',
            metaColor:  _d('text-slate-400',               'text-slate-500'),
            nameColor:  _d('text-slate-800',               'text-slate-200'),
            numColor:   _d('text-slate-700',               'text-slate-300'),
            valorBg:    _d('bg-white',                     'bg-amber-900/20'),
        } : {
            card:       _d('bg-sky-50 border-sky-200',     'border-sky-800/60'),
            cardBg:     _d('#fff',                         '#0c1929'),
            iconBg:     _d('bg-sky-100 text-sky-500',      'bg-sky-900/40 text-sky-400'),
            acento:     _d('text-sky-500',                 'text-sky-400'),
            label:      _d('text-sky-400',                 'text-sky-500/70'),
            valor:      _d('text-sky-700',                 'text-sky-400'),
            badge:      _d('bg-sky-100 text-sky-600 border-sky-200',     'bg-sky-900/40 text-sky-400 border-sky-700/50'),
            bar:        _d('bg-sky-400',                   'bg-sky-600'),
            barBg:      _d('bg-sky-100',                   'bg-sky-900/40'),
            divisor:    _d('border-sky-100',               'border-sky-900/40'),
            statusBg:   _d('bg-emerald-100 text-emerald-600 border-emerald-200', 'bg-emerald-900/40 text-emerald-400 border-emerald-700/50'),
            statusIcon: 'fa-circle-check',
            statusLabel:'Disponível',
            hover:      'hover:shadow-sky-900/20',
            metaColor:  _d('text-slate-400',               'text-slate-500'),
            nameColor:  _d('text-slate-800',               'text-slate-200'),
            numColor:   _d('text-slate-700',               'text-slate-300'),
            valorBg:    _d('bg-white',                     'bg-sky-900/20'),
        };

        const estoqueAtual = e.disponivel + e.reservado;
        const pct = estoqueAtual > 0 ? Math.round((e.disponivel / estoqueAtual) * 100) : 0;

        const today = new Date(); today.setHours(0,0,0,0);
        const twoMonths = new Date(); twoMonths.setMonth(twoMonths.getMonth() + 2); twoMonths.setHours(0,0,0,0);
        const lotesVac = vaccineLots.filter(l => l.vaccineId == v.id && l.status === 'aberto');
        const lotesVencidos = lotesVac.filter(l => l.validade && new Date(l.validade + 'T00:00:00') < today).length;
        const lotesVencendo = lotesVac.filter(l => { const d = new Date(l.validade + 'T00:00:00'); return d >= today && d <= twoMonths; }).length;
        const proximaValidade = lotesVac.filter(l => l.validade).sort((a, b) => new Date(a.validade) - new Date(b.validade))[0];
        const proxVal = proximaValidade ? proximaValidade.validade.split('-').reverse().join('/') : null;
        const valorStr = v.valor ? `R$ ${String(v.valor).replace('R$','').trim()}` : null;
        const custoVac = ((typeof canSeeCusto === 'function') && canSeeCusto()) ? getVaccineCusto(v.id) : null;
        const custoStr = (custoVac && custoVac.informado && custoVac.unitMedio != null) ? fmtCusto(custoVac.unitMedio) : null;

        const alertaHtml = (lotesVencidos > 0 || lotesVencendo > 0) ? `
            <div class="flex flex-wrap gap-1 mt-2">
                ${lotesVencidos > 0 ? `<span class="flex items-center gap-1 px-1.5 py-0.5 ${_d('bg-red-100 border-red-200 text-red-600','bg-red-900/40 border-red-700/50 text-red-400')} border rounded-full text-[8px] font-black"><i class="fas fa-skull-crossbones"></i>${lotesVencidos} vencido${lotesVencidos > 1 ? 's' : ''}</span>` : ''}
                ${lotesVencendo > 0 ? `<span class="flex items-center gap-1 px-1.5 py-0.5 ${_d('bg-amber-100 border-amber-200 text-amber-600','bg-amber-900/40 border-amber-700/50 text-amber-400')} border rounded-full text-[8px] font-black"><i class="fas fa-hourglass-half"></i>${lotesVencendo} vencendo</span>` : ''}
            </div>` : '';

        return `
        <div class="group relative border ${tema.card} rounded-2xl shadow-sm ${tema.hover} overflow-hidden cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
             style="background:${tema.cardBg};"
             onclick="openVaccineViewModal(${v.id})">

            <!-- Topo -->
            <div class="p-3.5 pb-2">
                <div class="flex items-start justify-between gap-2 mb-1.5">
                    <div class="flex items-center gap-2 min-w-0">
                        <div class="h-8 w-8 ${tema.iconBg} rounded-xl flex items-center justify-center shrink-0">
                            <i class="fas fa-syringe text-xs"></i>
                        </div>
                        <div class="min-w-0">
                            <h3 class="font-black ${tema.nameColor} text-xs leading-tight truncate" title="${v.nome}">${v.nome}</h3>
                            <p class="${tema.label} text-[9px] font-bold">${v.mnemonico ? `<span class="inline-flex items-center bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full text-[9px] font-black normal-case mr-1">${v.mnemonico}</span>` : ''}${(() => {
                                const n = getVaccineReforcos(v).length;
                                const suf = n > 1 ? `${n} reforços` : n === 1 ? 'reforço' : '';
                                if (typeof isVaccineSomenteReforco === 'function' && isVaccineSomenteReforco(v)) return `Somente ${suf || 'reforço'}`;
                                const nd = v.numDoses || 1;
                                return `${nd} dose${nd > 1 ? 's' : ''}${suf ? ` + ${suf}` : ''}${v.doseUnica ? ' · única' : ''}`;
                            })()}</p>
                        </div>
                    </div>
                    <span class="shrink-0 flex items-center gap-1 px-1.5 py-0.5 ${tema.statusBg} border rounded-lg text-[8px] font-black uppercase whitespace-nowrap">
                        <i class="fas ${tema.statusIcon} text-[8px]"></i>${tema.statusLabel}
                    </span>
                </div>
                ${alertaHtml}
            </div>

            <!-- Disponível em destaque -->
            <div class="px-3.5 pb-2">
                <div class="flex items-baseline gap-1.5">
                    <span class="text-4xl font-black ${tema.acento} leading-none">${e.disponivel}</span>
                    <span class="${tema.metaColor} text-[10px] font-bold">disponíveis</span>
                    <span class="ml-auto flex items-center gap-1 px-2 py-0.5 ${tema.badge} border rounded-full text-[11px] font-black whitespace-nowrap" title="Estoque mínimo configurado"><i class="fas fa-arrow-down-short-wide"></i>Mín. ${v.estoqueMinimo || 5}</span>
                </div>
                <div class="mt-1.5 h-1 ${tema.barBg} rounded-full overflow-hidden">
                    <div class="${tema.bar} h-full rounded-full transition-all duration-500" style="width:${pct}%"></div>
                </div>
                <p class="${tema.metaColor} text-[8px] font-bold mt-0.5">${pct}% do total</p>
            </div>

            <!-- Divisor -->
            <div class="mx-3.5 border-t ${tema.divisor}"></div>

            <!-- Métricas -->
            <div class="grid grid-cols-2 px-3.5 py-2">
                <div class="text-center">
                    <p class="${tema.metaColor} text-[8px] font-black uppercase tracking-wide">Reserv.</p>
                    <p class="${tema.numColor} font-black text-sm leading-tight">${e.reservado}</p>
                </div>
                <div class="text-center border-l ${tema.divisor}">
                    <p class="${tema.metaColor} text-[8px] font-black uppercase tracking-wide">Total</p>
                    <p class="${tema.numColor} font-black text-sm leading-tight">${e.disponivel + e.reservado}</p>
                </div>
            </div>

            <!-- Rodapé -->
            <div class="border-t ${tema.divisor} px-3.5 py-2 flex items-center justify-between gap-1">
                <div class="flex items-center gap-2 min-w-0">
                    <span class="${tema.metaColor} text-[8px] font-black flex items-center gap-0.5 whitespace-nowrap">
                        <i class="fas fa-layer-group text-[8px]"></i>${e.lotesAtivos} lote${e.lotesAtivos !== 1 ? 's' : ''}
                    </span>
                    ${proxVal ? `<span class="${tema.metaColor} text-[8px] font-black flex items-center gap-0.5 truncate"><i class="fas fa-calendar-alt text-[8px]"></i>${proxVal}</span>` : ''}
                    ${custoStr ? `<span class="${tema.metaColor} text-[8px] font-black flex items-center gap-0.5 truncate" title="Custo médio por dose em estoque"><i class="fas fa-tag text-[8px]"></i>${custoStr}</span>` : ''}
                </div>
                ${valorStr ? `<span class="${tema.valor} font-black text-[9px] ${tema.valorBg} border ${tema.badge.split(' ').slice(2).join(' ')} px-1.5 py-0.5 rounded-lg whitespace-nowrap">${valorStr}</span>` : ''}
            </div>
        </div>`;
    }).join('');
}

// ═══════════════════════════════════════════════════════════════════════════
//  MÓDULO: LOTES
// ═══════════════════════════════════════════════════════════════════════════
let _loteVaccineFilter = null; // null = todas, number = vaccineId

function toggleLoteVaccineSearch(e) {
    e && e.stopPropagation();
    const dd = document.getElementById('lote-vaccine-dropdown');
    const isOpen = !dd.classList.contains('hidden');
    if (isOpen) {
        dd.classList.add('hidden');
    } else {
        dd.classList.remove('hidden');
        document.getElementById('lote-vaccine-search-input').value = '';
        filterLoteVaccineDropdown('');
        setTimeout(() => document.getElementById('lote-vaccine-search-input').focus(), 50);
    }
}

function filterLoteVaccineDropdown(q) {
    const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
    const list = vaccines
        .filter(v => v.ativo !== false && (!q || norm(v.nome).includes(norm(q)) ||
            (v.mnemonico && norm(v.mnemonico).includes(norm(q))) ||
            vaccineLots.some(l => l.vaccineId == v.id && l.fabricante && norm(l.fabricante).includes(norm(q)))))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    const el = document.getElementById('lote-vaccine-dropdown-list');
    if (!list.length) {
        el.innerHTML = '<p class="text-center text-slate-400 text-xs font-bold py-4">Nenhuma vacina encontrada</p>';
        return;
    }
    el.innerHTML = list.map(v => {
        const isActive = _loteVaccineFilter == v.id;
        return `<button onclick="selectLoteVaccineFilter(${v.id}, '${v.nome.replace(/'/g, "\\'")}')"
            class="w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${isActive ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-indigo-50 hover:text-indigo-700'}">
            <span class="h-5 w-5 ${isActive ? 'bg-white/20' : 'bg-slate-100'} rounded-lg flex items-center justify-center shrink-0">
                <i class="fas fa-syringe text-[9px] ${isActive ? 'text-white' : 'text-slate-400'}"></i>
            </span>
            <span class="flex-1 min-w-0">${v.nome}</span>
            ${v.mnemonico ? `<span class="inline-flex items-center bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full text-[9px] font-black normal-case shrink-0">${v.mnemonico}</span>` : ''}
        </button>`;
    }).join('');
}

function selectLoteVaccineFilter(vaccineId, label) {
    _loteVaccineFilter = vaccineId;
    const btn = document.getElementById('btn-lote-vaccine-search');
    const hasFilter = vaccineId !== null;
    btn.className = `h-9 w-9 border rounded-xl transition shadow-sm flex items-center justify-center ${
        hasFilter ? 'bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-600'
    }`;
    btn.title = hasFilter ? `Filtro: ${label}` : 'Filtrar por vacina';
    document.getElementById('lote-vaccine-dropdown').classList.add('hidden');
    renderAlmoxLotes();
}

// Fecha dropdown ao clicar fora
document.addEventListener('click', function(e) {
    const wrap = document.getElementById('lote-vaccine-search-wrap');
    if (wrap && !wrap.contains(e.target)) {
        const dd = document.getElementById('lote-vaccine-dropdown');
        if (dd) dd.classList.add('hidden');
    }
});

function setLoteFilter(tipo) {
    loteFilter = tipo;
    document.querySelectorAll('.lf-btn').forEach(b => {
        b.classList.remove('bg-green-600', 'text-white', 'shadow');
        b.classList.add('text-slate-500', 'hover:bg-white');
    });
    const active = document.getElementById('lf-btn-' + tipo);
    if (active) { active.classList.add('bg-green-600', 'text-white', 'shadow'); active.classList.remove('text-slate-500', 'hover:bg-white'); }
    renderAlmoxLotes();
}

function renderAlmoxLotes() {
    const tbody = document.getElementById('alm-lotes-body');
    if (!tbody) return;
    const thCusto = document.getElementById('alm-lotes-th-custo');
    if (thCusto) thCusto.classList.toggle('hidden', !((typeof canSeeCusto === 'function') && canSeeCusto()));
    const today = new Date(); today.setHours(0,0,0,0);

    const allLotes = vaccineLots.map(l => {
        const v = vaccines.find(x => x.id == l.vaccineId);
        return { lote: l, vaccine: v, vaccineName: v ? v.nome : '—', estoque: getLoteEstoque(l.id) };
    });

    const filtered = allLotes.filter(({ lote }) => {
        const ativo = lote.status === 'aberto';
        if (loteFilter === 'ativos')   { if (!ativo) return false; }
        else if (loteFilter === 'inativos') { if (ativo) return false; }
        if (_loteVaccineFilter !== null && lote.vaccineId != _loteVaccineFilter) return false;
        return true;
    });

    if (!filtered.length) {
        const _cols = ((typeof canSeeCusto === 'function') && canSeeCusto()) ? 11 : 10;
        tbody.innerHTML = `<tr><td colspan="${_cols}" class="p-8 text-center text-slate-400 text-xs font-bold uppercase tracking-wider">Nenhum lote encontrado</td></tr>`;
        return;
    }

    filtered.sort((a, b) => {
        if (a.vaccineName !== b.vaccineName) return a.vaccineName.localeCompare(b.vaccineName, 'pt-BR');
        return new Date(a.lote.validade || 0) - new Date(b.lote.validade || 0);
    });

    tbody.innerHTML = filtered.map(({ lote, vaccine, vaccineName, estoque }) => {
        const ativo = lote.status === 'aberto';
        const _podeCusto = (typeof canSeeCusto === 'function') && canSeeCusto();
        const exp = lote.validade ? new Date(lote.validade + 'T00:00:00') : null;
        const twoMonths = new Date(today); twoMonths.setMonth(twoMonths.getMonth() + 2);
        const vencido   = exp && exp < today;
        const vencendo  = exp && !vencido && exp <= twoMonths;
        const validade  = lote.validade ? lote.validade.split('-').reverse().join('/') : '—';
        const validadeCel = vencido
            ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-red-100 text-red-700 font-black text-xs"><i class="fas fa-skull-crossbones text-[9px]"></i>${validade}</span>`
            : vencendo
                ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-100 text-amber-700 font-black text-xs"><i class="fas fa-hourglass-half text-[9px]"></i>${validade}</span>`
                : `<span class="text-slate-600 text-xs">${validade}</span>`;
        const _estMin = (vaccine && vaccine.estoqueMinimo) || 5;
        const dispCls = estoque.disponivel <= 0 ? 'bg-slate-100 text-slate-400' : estoque.disponivel <= _estMin ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700';
        const saidaTotal = estoque.aplicado + estoque.saidaManual;
        const totalDisp = estoque.total - saidaTotal;
        return `<tr class="hover:bg-slate-50 transition cursor-pointer ${!ativo ? 'opacity-60' : ''}" onclick="editLote(${lote.id})">
            <td class="p-3">
                <p class="font-bold text-slate-700">${vaccineName}${vaccine && vaccine.mnemonico ? `<span class="inline-flex items-center bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full text-[9px] font-black normal-case ml-1.5">${vaccine.mnemonico}</span>` : ''}</p>
                ${(lote.fabricante || lote.fabricanteNome || lote.fornecedor) ? `<p class="text-[10px] text-slate-400 font-bold mt-0.5">${[lote.fabricante, lote.fabricanteNome, lote.fornecedor].filter(Boolean).join(' · ')}</p>` : ''}
            </td>
            <td class="p-3 text-xs font-mono font-bold">${lote.numero || '—'}</td>
            <td class="p-3 text-center text-xs font-bold text-emerald-600">${estoque.total}</td>
            <td class="p-3 text-center text-xs font-bold text-indigo-600">${estoque.reservado}</td>
            <td class="p-3 text-center text-xs font-bold text-orange-600">${saidaTotal}</td>
            <td class="p-3 text-center"><span class="px-2.5 py-1 rounded-full text-xs font-black ${dispCls}">${estoque.disponivel}</span></td>
            <td class="p-3 text-center text-xs font-bold text-slate-700">${totalDisp}</td>
            ${_podeCusto ? (() => {
                const c = getLoteCustoFrom(lote);
                return `<td class="p-3 text-center text-xs">${c.informado
                    ? `<span class="font-black text-amber-600">${fmtCusto(c.unit)}</span><span class="block text-[9px] text-slate-400 font-bold">por dose</span>`
                    : '<span class="text-slate-300 font-bold">—</span>'}</td>`;
            })() : ''}
            <td class="p-3">${validadeCel}</td>
            <td class="p-3 text-center">
                <span class="px-2 py-1 rounded-full text-[10px] font-black uppercase ${ativo ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}">${ativo ? 'Ativo' : 'Inativo'}</span>
                ${(!ativo && lote._autoFechado) ? '<span class="block text-[8px] text-slate-400 font-bold mt-0.5">zerado</span>' : ''}
            </td>
            <td class="p-3 text-center" onclick="event.stopPropagation()">
                <div class="flex justify-center gap-1.5">
                    ${permBtn('edicao_movimentacao', `<button onclick="openMovimentacaoEntrada(${lote.id})" class="h-8 w-8 bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white rounded transition shadow-sm" title="Registrar entrada"><i class="fas fa-arrow-down text-[10px]"></i></button>`)}
                    ${permBtn('edicao_movimentacao', `<button onclick="openMovimentacaoSaida(${lote.id})" class="h-8 w-8 bg-orange-50 text-orange-600 hover:bg-orange-500 hover:text-white rounded transition shadow-sm" title="Registrar saída / descarte"><i class="fas fa-arrow-up text-[10px]"></i></button>`)}
                </div>
            </td>
        </tr>`;
    }).join('');
}

let _fabLoteVaccines = [];

function openAddLoteModal() {
    if (!checkPerm('edicao_lotes')) return;
    _fabLoteVaccines = vaccines.filter(v => v.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    document.getElementById('fab-lote-vaccine-search').value = '';
    document.getElementById('fab-lote-vaccine').value = '';
    document.getElementById('fab-lote-fabricante').value = '';
    document.getElementById('fab-lote-fabnome').value = '';
    document.getElementById('fab-lote-numero').value = '';
    document.getElementById('fab-lote-validade').value = '';
    document.getElementById('fab-lote-qtd').value = '';
    document.getElementById('fab-lote-custo').value = '';
    aplicarVisibilidadeCusto();
    atualizarCustoUnitPreview('fab');
    document.getElementById('modal-add-lote-fab').classList.add('active');
}

function _renderFabLoteDropdown(list) {
    const dd = document.getElementById('fab-lote-vaccine-dropdown');
    if (!list.length) {
        dd.innerHTML = '<p class="px-3 py-2 text-xs text-slate-400 font-bold">Nenhuma vacina encontrada</p>';
    } else {
        dd.innerHTML = list.map(v => `
            <button type="button" onmousedown="selectFabLoteVaccine(${v.id}, '${v.nome.replace(/'/g,"\\'")}')
"
                class="w-full text-left px-3 py-2 text-sm font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition">
                ${v.nome}
            </button>`).join('');
    }
    dd.classList.remove('hidden');
}

function showFabLoteDropdown() {
    _renderFabLoteDropdown(_fabLoteVaccines);
}

function hideFabLoteDropdown() {
    setTimeout(() => document.getElementById('fab-lote-vaccine-dropdown').classList.add('hidden'), 150);
}

function filterFabLoteVaccines(q) {
    const norm = normalizeStr(q);
    const filtered = norm ? _fabLoteVaccines.filter(v =>
        normalizeStr(v.nome).includes(norm) ||
        (v.mnemonico && normalizeStr(v.mnemonico).includes(norm)) ||
        vaccineLots.some(l => l.vaccineId == v.id && l.fabricante && normalizeStr(l.fabricante).includes(norm))
    ) : _fabLoteVaccines;
    document.getElementById('fab-lote-vaccine').value = '';
    _renderFabLoteDropdown(filtered);
}

function selectFabLoteVaccine(id, nome) {
    document.getElementById('fab-lote-vaccine').value = id;
    document.getElementById('fab-lote-vaccine-search').value = nome;
    document.getElementById('fab-lote-vaccine-dropdown').classList.add('hidden');
    document.getElementById('fab-lote-vaccine-search').classList.remove('border-red-400');
}

function salvarFabLote() {
    const vaccineId = parseInt(document.getElementById('fab-lote-vaccine').value);
    if (!vaccineId) {
        document.getElementById('fab-lote-vaccine-search').classList.add('border-red-400');
        document.getElementById('fab-lote-vaccine-search').focus();
        showNotification('Selecione uma vacina.', 'error'); return;
    }
    const fabricante = document.getElementById('fab-lote-fabricante').value.trim();
    const fabricanteNome = document.getElementById('fab-lote-fabnome').value.trim();
    const numero = document.getElementById('fab-lote-numero').value.trim().toUpperCase();
    const validade = document.getElementById('fab-lote-validade').value;
    const qtd = parseInt(document.getElementById('fab-lote-qtd').value) || 0;
    const fornecedor = document.getElementById('fab-lote-fornecedor').value.trim();
    const nota = document.getElementById('fab-lote-nota').value.trim();
    const custoUnit = (typeof canSeeCusto === 'function' && canSeeCusto()) ? parseCusto(document.getElementById('fab-lote-custo').value) : null;
    if (!numero || !validade) { showNotification('Preencha número e validade.', 'error'); return; }
    if (custoUnit != null && custoUnit < 0) { showNotification('O custo unitário não pode ser negativo.', 'error'); return; }
    const newId = Date.now();
    const novoLote = { id: newId, vaccineId, numero, fabricante, fabricanteNome, validade, status: 'aberto', fornecedor, nota };
    if (custoUnit != null) novoLote.custoUnit = custoUnit;
    vaccineLots.push(novoLote);
    if (qtd > 0) {
        stockMovements.push({ id: Date.now() + 1, loteId: newId, vaccineId: vaccineId, tipo: 'entrada', qtd: qtd, motivo: 'Cadastro inicial', descarte: false, data: new Date().toISOString(), usuario: currentUser ? currentUser.nome : '—' });
    }
    const v = vaccines.find(x => x.id == vaccineId);
    logAudit('Criado', 'lote', String(vaccineId), `Lote ${numero}`, `Vacina: ${v ? v.nome : vaccineId} | Validade: ${validade} | Qtd: ${qtd}${fabricanteNome ? ' | Fabricante: ' + fabricanteNome : ''}${fornecedor ? ' | Fornecedor: ' + fornecedor : ''}${nota ? ' | NF: ' + nota : ''}${custoUnit != null ? ' | Custo unitário: ' + fmtCusto(custoUnit) : ''}`);
    saveAll(); renderAlmoxLotes(); updateExpiryBadge();
    document.getElementById('modal-add-lote-fab').classList.remove('active');
    document.getElementById('fab-lote-fabricante').value = '';
    document.getElementById('fab-lote-fabnome').value = '';
    document.getElementById('fab-lote-fornecedor').value = '';
    document.getElementById('fab-lote-nota').value = '';
    document.getElementById('fab-lote-custo').value = '';
    atualizarCustoUnitPreview('fab');
    refreshVaccineViewModal(vaccineId);
    showNotification('Lote cadastrado com sucesso!', 'success');
}

// ═══════════════════════════════════════════════════════════════════════════
//  MÓDULO: MOVIMENTAÇÃO
// ═══════════════════════════════════════════════════════════════════════════
let _movPendingTipo = 'entrada';   // entrada | saida
let _movPendingLoteId = null;
let _movSaidaDescarte = false;
let _movFilter = 'ambos'; // ambos | entrada | saida
let _movVaccineFilter = null; // null = todas, number = vaccineId

function setMovFilter(f) {
    _movFilter = f;
    ['ambos','entrada','saida'].forEach(x => {
        const btn = document.getElementById(`movf-${x}`);
        if (btn) btn.className = `px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition ${x === f ? 'bg-navy-900 text-white shadow' : 'text-slate-500 hover:bg-white'}`;
    });
    renderMovimentacao();
}

function renderMovimentacao() {
    const tbody = document.getElementById('mov-body');
    if (!tbody) return;
    let movs = [...stockMovements].sort((a, b) => new Date(b.data) - new Date(a.data));
    if (_movFilter === 'entrada') movs = movs.filter(m => m.tipo === 'entrada');
    if (_movFilter === 'saida')   movs = movs.filter(m => m.tipo !== 'entrada');
    if (_movVaccineFilter !== null) movs = movs.filter(m => {
        const lote = vaccineLots.find(l => l.id == m.loteId);
        return lote && lote.vaccineId == _movVaccineFilter;
    });
    if (!movs.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-slate-400 text-xs font-bold uppercase tracking-wider">Nenhuma movimentação registrada</td></tr>`;
        return;
    }
    tbody.innerHTML = movs.map(m => {
        const lote = vaccineLots.find(l => l.id == m.loteId);
        const v = lote ? vaccines.find(x => x.id == lote.vaccineId) : null;
        const isEntrada  = m.tipo === 'entrada';
        const isReserva  = m.tipo === 'reserva';
        const isAuto     = !!m.appointmentId;
        const isAplicado = m.tipo === 'saida' && isAuto;

        // Dados inválidos: automático sem lote ou sem vacina associada
        const isInvalid = isAuto && (!lote || !v);

        const tipoBadge = isEntrada
            ? `<span class="px-2 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-700"><i class="fas fa-arrow-down mr-1"></i>Entrada</span>`
            : isReserva
                ? `<span class="px-2 py-1 rounded-full text-[10px] font-black uppercase bg-blue-100 text-blue-700"><i class="fas fa-calendar-check mr-1"></i>Reservado</span>`
                : isAplicado
                    ? `<span class="px-2 py-1 rounded-full text-[10px] font-black uppercase bg-violet-100 text-violet-700"><i class="fas fa-syringe mr-1"></i>Aplicado</span>`
                    : m.descarte
                        ? `<span class="px-2 py-1 rounded-full text-[10px] font-black uppercase bg-red-100 text-red-700"><i class="fas fa-trash mr-1"></i>Descarte</span>`
                        : `<span class="px-2 py-1 rounded-full text-[10px] font-black uppercase bg-orange-100 text-orange-700"><i class="fas fa-arrow-up mr-1"></i>Saída</span>`;
        const qtdColor = isEntrada ? 'text-emerald-600' : isReserva ? 'text-blue-600' : isAplicado ? 'text-violet-600' : 'text-orange-600';
        const qtdSign  = isEntrada ? '+' : '−';
        const dataStr = m.data ? new Date(m.data).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
        const acoes = isAuto
            ? `<button onclick="viewRecord(${m.appointmentId})" class="h-8 w-8 bg-slate-50 text-slate-400 hover:bg-clinic-50 hover:text-clinic-600 border border-slate-200 rounded transition shadow-sm flex items-center justify-center mx-auto" title="Ver agendamento"><i class="fas fa-eye text-[10px]"></i></button>`
            : `<div class="flex justify-center gap-1.5">
                ${permBtn('edicao_movimentacao', `<button onclick="openEditMovModal(${m.id})" class="h-8 w-8 bg-slate-100 text-slate-600 hover:bg-clinic-600 hover:text-white rounded transition shadow-sm" title="Editar"><i class="fas fa-pen text-[10px]"></i></button>`)}
                ${permBtn('edicao_movimentacao', `<button onclick="deleteMovimentacao(${m.id})" class="h-8 w-8 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white rounded transition shadow-sm" title="Excluir"><i class="fas fa-trash text-[10px]"></i></button>`)}
               </div>`;

        const produtoCell = isInvalid
            ? `<td class="p-3 text-xs">
                <div class="flex items-center gap-2">
                    <span class="flex-shrink-0 w-6 h-6 rounded-full bg-red-100 flex items-center justify-center" title="Dado inválido: vacina ou lote não encontrado">
                        <i class="fas fa-triangle-exclamation text-red-600 text-[10px]"></i>
                    </span>
                    <div>
                        <span class="font-black text-red-700">${v ? v.nome : 'Vacina não encontrada'}</span>
                        <span class="block text-[10px] text-red-400 font-mono">Lote ${lote ? lote.numero : 'não encontrado'}</span>
                        <span class="block text-[9px] text-red-400 uppercase tracking-wide font-bold mt-0.5">Registro com dado inválido</span>
                    </div>
                </div>
               </td>`
            : `<td class="p-3 font-bold text-slate-700 text-xs">${v ? v.nome : '—'}${v && v.mnemonico ? `<span class="inline-flex items-center bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full text-[9px] font-black normal-case ml-1.5">${v.mnemonico}</span>` : ''}<span class="block text-[10px] text-slate-400 font-mono">Lote ${lote ? lote.numero : '—'}</span></td>`;

        const rowClass = isInvalid
            ? 'bg-red-50 border-l-4 border-red-500 hover:bg-red-100 transition'
            : 'hover:bg-slate-50 transition';

        return `<tr class="${rowClass}">
            <td class="p-3 text-xs ${isInvalid ? 'text-red-500' : 'text-slate-500'} font-bold whitespace-nowrap">${dataStr}</td>
            <td class="p-3">${tipoBadge}</td>
            ${produtoCell}
            <td class="p-3 text-center"><span class="font-black ${isInvalid ? 'text-red-600' : qtdColor}">${qtdSign}${m.qtd}</span></td>
            <td class="p-3 text-xs ${isInvalid ? 'text-red-500' : 'text-slate-600'}">${m.motivo || '—'}</td>
            <td class="p-3 text-xs ${isInvalid ? 'text-red-400' : 'text-slate-400'} font-bold">${m.usuario || '—'}</td>
            <td class="p-3 text-center">${acoes}</td>
        </tr>`;
    }).join('');
}

// Abre o modal de movimentação a partir de um lote específico
function openMovimentacaoEntrada(loteId) { openMovModal('entrada', loteId); }
function openMovimentacaoSaida(loteId)   { openMovModal('saida', loteId); }

function openMovModal(tipo, loteId) {
    if (!checkPerm('edicao_movimentacao')) return;
    _movPendingTipo = tipo;
    _movPendingLoteId = loteId || null;
    _movSaidaDescarte = false;

    document.getElementById('mov-form').reset();
    document.getElementById('mov-qtd').value = '';
    document.getElementById('mov-motivo').value = '';

    // Cabeçalho conforme tipo
    const isEntrada = tipo === 'entrada';
    document.getElementById('mov-modal-title').textContent = isEntrada ? 'Registrar Entrada' : 'Registrar Saída';
    const head = document.getElementById('mov-modal-head');
    head.className = `p-5 text-white flex items-center gap-3 ${isEntrada ? 'bg-gradient-to-br from-emerald-600 to-emerald-800' : 'bg-gradient-to-br from-orange-600 to-orange-800'}`;
    document.getElementById('mov-modal-icon').className = `fas ${isEntrada ? 'fa-arrow-down' : 'fa-arrow-up'} text-white text-base`;

    // Bloco de descarte só aparece em saída
    document.getElementById('mov-descarte-wrap').classList.toggle('hidden', isEntrada);
    document.getElementById('mov-motivo-label').textContent = isEntrada ? 'Observação (opcional)' : 'Justificativa *';
    setMovDescarte(false);

    // Reset campo de vacina
    document.getElementById('mov-vacina-search').value = '';
    document.getElementById('mov-vacina').value = '';
    document.getElementById('mov-vacina-dropdown').classList.add('hidden');
    document.getElementById('mov-vacina-search').classList.remove('border-red-400');

    if (loteId) {
        const lote = vaccineLots.find(l => l.id == loteId);
        if (lote) {
            const v = vaccines.find(x => x.id == lote.vaccineId);
            document.getElementById('mov-vacina').value = lote.vaccineId;
            if (v) document.getElementById('mov-vacina-search').value = v.nome;
            populateMovLoteSelect(lote.vaccineId);
            document.getElementById('mov-lote').value = loteId;
            onMovLoteChange();
        }
    } else if (arguments[2]) {
        const vaccineId = arguments[2];
        const v = vaccines.find(x => x.id == vaccineId);
        document.getElementById('mov-vacina').value = vaccineId;
        if (v) document.getElementById('mov-vacina-search').value = v.nome;
        populateMovLoteSelect(vaccineId);
    } else {
        populateMovLoteSelect(null);
    }
    document.getElementById('modal-movimentacao').classList.add('active');
}

let _movVaccineList = [];

function _renderMovVaccineDropdown(list) {
    const dd = document.getElementById('mov-vacina-dropdown');
    if (!list.length) {
        dd.innerHTML = '<p class="px-3 py-2 text-xs text-slate-400 font-bold">Nenhuma vacina encontrada</p>';
    } else {
        dd.innerHTML = list.map(v => `
            <button type="button" onmousedown="selectMovVaccine(${v.id},'${v.nome.replace(/'/g,"\\'")}')"
                class="w-full text-left px-3 py-2 text-sm font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition flex items-center gap-2">
                <i class="fas fa-syringe text-[10px] text-slate-300"></i>
                <span class="flex-1 min-w-0">${v.nome}</span>
                ${v.mnemonico ? `<span class="inline-flex items-center bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full text-[9px] font-black normal-case shrink-0">${v.mnemonico}</span>` : ''}
            </button>`).join('');
    }
    dd.classList.remove('hidden');
}

function showMovVaccineDropdown() {
    _movVaccineList = vaccines.filter(v => v.ativo !== false).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
    _renderMovVaccineDropdown(_movVaccineList);
}

function hideMovVaccineDropdown() {
    setTimeout(() => document.getElementById('mov-vacina-dropdown').classList.add('hidden'), 150);
}

function filterMovVaccineSearch(q) {
    const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
    _movVaccineList = vaccines.filter(v => v.ativo !== false).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
    const filtered = q ? _movVaccineList.filter(v => norm(v.nome).includes(norm(q)) ||
        (v.mnemonico && norm(v.mnemonico).includes(norm(q))) ||
        vaccineLots.some(l => l.vaccineId == v.id && l.fabricante && norm(l.fabricante).includes(norm(q)))) : _movVaccineList;
    document.getElementById('mov-vacina').value = '';
    _renderMovVaccineDropdown(filtered);
}

function selectMovVaccine(id, nome) {
    document.getElementById('mov-vacina').value = id;
    document.getElementById('mov-vacina-search').value = nome;
    document.getElementById('mov-vacina-dropdown').classList.add('hidden');
    document.getElementById('mov-vacina-search').classList.remove('border-red-400');
    populateMovLoteSelect(id);
    onMovLoteChange();
}

function onMovVaccineChange() {
    const vId = document.getElementById('mov-vacina').value;
    populateMovLoteSelect(vId);
    onMovLoteChange();
}

function populateMovLoteSelect(vaccineId) {
    const sel = document.getElementById('mov-lote');
    sel.innerHTML = '<option value="">Selecione o lote...</option>';
    if (!vaccineId) return;
    // Em entrada mostramos todos os lotes (inclusive fechados/zerados, para reabastecer)
    // Em saída mostramos apenas lotes com disponível > 0
    const lotes = vaccineLots.filter(l => l.vaccineId == vaccineId)
        .sort((a, b) => new Date(a.validade || 0) - new Date(b.validade || 0));
    lotes.forEach(l => {
        const e = getLoteEstoque(l.id);
        if (_movPendingTipo === 'saida' && e.disponivel <= 0) return;
        const validade = l.validade ? l.validade.split('-').reverse().join('/') : 's/ val';
        sel.innerHTML += `<option value="${l.id}">Lote ${l.numero} — ${validade} (disp: ${e.disponivel})</option>`;
    });
}

function onMovLoteChange() {
    const loteId = document.getElementById('mov-lote').value;
    const info = document.getElementById('mov-estoque-info');
    if (!loteId) { info.classList.add('hidden'); return; }
    const e = getLoteEstoque(loteId);
    document.getElementById('mov-info-disp').textContent = e.disponivel;
    document.getElementById('mov-info-reserv').textContent = e.reservado;
    document.getElementById('mov-info-total').textContent = e.disponivel + e.reservado;
    info.classList.remove('hidden');
}

function setMovDescarte(isDescarte) {
    _movSaidaDescarte = isDescarte;
    const btnSim = document.getElementById('mov-descarte-sim');
    const btnNao = document.getElementById('mov-descarte-nao');
    if (isDescarte) {
        btnSim.className = 'flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-wide transition bg-red-600 text-white shadow';
        btnNao.className = 'flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-wide transition text-slate-500 hover:bg-slate-100';
    } else {
        btnNao.className = 'flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-wide transition bg-slate-600 text-white shadow';
        btnSim.className = 'flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-wide transition text-slate-500 hover:bg-slate-100';
    }
}

function confirmMovimentacao(e) {
    e.preventDefault();
    const loteId = document.getElementById('mov-lote').value;
    const qtd = parseInt(document.getElementById('mov-qtd').value, 10);
    const motivo = document.getElementById('mov-motivo').value.trim();
    const isEntrada = _movPendingTipo === 'entrada';

    if (!document.getElementById('mov-vacina').value) {
        document.getElementById('mov-vacina-search').classList.add('border-red-400');
        document.getElementById('mov-vacina-search').focus();
        showNotification('Selecione a vacina.', 'error'); return;
    }
    if (!loteId) { showNotification('Selecione o lote.', 'error'); return; }
    if (!qtd || qtd <= 0) { showNotification('Informe uma quantidade válida (maior que zero).', 'error'); return; }

    const lote = vaccineLots.find(l => l.id == loteId);
    const v = lote ? vaccines.find(x => x.id == lote.vaccineId) : null;
    const estoque = getLoteEstoque(loteId);

    if (isEntrada) {
        // nada a validar além de qtd > 0
    } else {
        // SAÍDA: justificativa obrigatória e não permitir estoque negativo
        if (!motivo) { showNotification('A justificativa é obrigatória para saídas.', 'error'); return; }
        if (qtd > estoque.disponivel) {
            showNotification(`Saída inválida: disponível é ${estoque.disponivel}, não é possível retirar ${qtd}.`, 'error');
            return;
        }
    }

    const mov = {
        id: Date.now(),
        loteId: Number(loteId),
        vaccineId: lote ? Number(lote.vaccineId) : null,
        tipo: _movPendingTipo,
        qtd,
        motivo: motivo || (isEntrada ? 'Entrada de estoque' : ''),
        descarte: !isEntrada && _movSaidaDescarte,
        data: new Date().toISOString(),
        usuario: currentUser ? currentUser.nome : '—'
    };
    stockMovements.push(mov);

    // Atualiza status do lote (reativa se entrou estoque / fecha se zerou)
    syncLoteStatus(loteId);

    const acao = isEntrada ? 'Entrada' : (_movSaidaDescarte ? 'Descarte' : 'Saída');
    logAudit(acao, 'lote', String(lote ? lote.vaccineId : loteId),
        `Lote ${lote ? lote.numero : loteId}`,
        `${v ? v.nome : '—'} | ${isEntrada ? '+' : '−'}${qtd} un.${motivo ? ' | ' + motivo : ''}`);

    saveAll();
    document.getElementById('modal-movimentacao').classList.remove('active');
    renderMovimentacao(); renderAlmoxLotes(); renderEstoqueDashboard(); renderVaccines();
    updateExpiryBadge();
    if (lote) refreshVaccineViewModal(lote.vaccineId);
    if (typeof refreshOpenModals === 'function') refreshOpenModals();
    showNotification(`${acao} registrada com sucesso!`, 'success');
}

function openEditMovModal(movId) {
    if (!checkPerm('edicao_movimentacao')) return;
    const m = stockMovements.find(x => x.id == movId);
    if (!m) return;
    const lote = vaccineLots.find(l => l.id == m.loteId);
    const v = lote ? vaccines.find(x => x.id == lote.vaccineId) : null;
    const dataStr = m.data ? new Date(m.data).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
    const tipoStr = m.tipo === 'entrada' ? 'Entrada' : m.descarte ? 'Descarte' : 'Saída';
    document.getElementById('edit-mov-id').value = m.id;
    document.getElementById('edit-mov-qtd').value = m.qtd;
    document.getElementById('edit-mov-motivo').value = m.motivo || '';
    document.getElementById('edit-mov-info-produto').textContent = `${tipoStr} — ${v ? v.nome : '—'} | Lote ${lote ? lote.numero : '—'}`;
    document.getElementById('edit-mov-info-data').textContent = dataStr;
    const isEntrada = m.tipo === 'entrada';
    const head = document.getElementById('edit-mov-head');
    head.className = `p-5 text-white flex items-center gap-3 ${isEntrada ? 'bg-gradient-to-br from-emerald-600 to-emerald-800' : 'bg-gradient-to-br from-orange-600 to-orange-800'}`;
    document.getElementById('edit-mov-icon').className = `fas ${isEntrada ? 'fa-arrow-down' : 'fa-arrow-up'} text-white text-base`;
    document.getElementById('modal-edit-mov').classList.add('active');
}

function salvarEdicaoMov() {
    const id = document.getElementById('edit-mov-id').value;
    const qtd = parseInt(document.getElementById('edit-mov-qtd').value);
    const motivo = document.getElementById('edit-mov-motivo').value.trim();
    if (!qtd || qtd < 1) { showNotification('Quantidade inválida.', 'error'); return; }
    const idx = stockMovements.findIndex(x => x.id == id);
    if (idx === -1) return;
    const old = {...stockMovements[idx]};

    // Valida se a alteração resultaria em estoque negativo
    // Para entradas: reduzir qtd diminui o total disponível
    // Para saídas manuais: aumentar qtd diminui o disponível
    const est = getLoteEstoque(old.loteId);
    let dispSimulado;
    if (old.tipo === 'entrada') {
        // disponível atual considera qtd antiga; nova qtd pode ser menor
        dispSimulado = est._disponivelRaw - (old.qtd - qtd); // delta = old - new aplicado ao disponível
    } else {
        // saída/descarte manual: aumentar qtd reduz disponível
        dispSimulado = est._disponivelRaw - (qtd - old.qtd);
    }
    if (dispSimulado < 0) {
        const loteBlk = vaccineLots.find(l => l.id == old.loteId);
        showNotification(
            `Alteração bloqueada: resultaria em estoque negativo no lote ${loteBlk ? loteBlk.numero : old.loteId} (−${Math.abs(dispSimulado)} dose${Math.abs(dispSimulado) > 1 ? 's' : ''}).`,
            'error'
        );
        return;
    }

    stockMovements[idx].qtd = qtd;
    stockMovements[idx].motivo = motivo;
    const lote = vaccineLots.find(l => l.id == old.loteId);
    const v = lote ? vaccines.find(x => x.id == lote.vaccineId) : null;
    logAudit('Editado', 'lote', String(lote ? lote.vaccineId : old.loteId),
        `Lote ${lote ? lote.numero : old.loteId}`,
        `Movimentação editada | Qtd: ${old.qtd}→${qtd}${motivo ? ' | ' + motivo : ''}`);
    saveAll();
    syncLoteStatus(old.loteId);
    renderMovimentacao(); renderAlmoxLotes(); renderEstoqueDashboard(); renderVaccines();
    updateExpiryBadge();
    if (typeof refreshOpenModals === 'function') refreshOpenModals();
    document.getElementById('modal-edit-mov').classList.remove('active');
    showNotification('Movimentação atualizada!', 'success');
}

let _pendingDeleteMovId = null;

function deleteMovimentacao(movId) {
    if (!checkPerm('edicao_movimentacao')) return;
    const m = stockMovements.find(x => x.id == movId);
    if (!m) return;
    const lote  = vaccineLots.find(l => l.id == m.loteId);
    const v     = lote ? vaccines.find(x => x.id == lote.vaccineId) : null;

    // Verifica se exclusão deixaria estoque negativo
    // Entradas reduzem total, saídas manuais reduzem consumo
    const est   = getLoteEstoque(m.loteId);
    let ficariaNegativo = false;
    if (m.tipo === 'entrada') {
        ficariaNegativo = (est._disponivelRaw - Number(m.qtd)) < 0;
    }

    const tipoLabels = { entrada: 'Entrada', saida: 'Saída', reserva: 'Reserva', descarte: 'Descarte' };
    const tipoLabel  = tipoLabels[m.tipo] || m.tipo;
    const sinal      = m.tipo === 'entrada' ? '+' : '−';
    const qtdColor   = m.tipo === 'entrada' ? 'text-emerald-600' : 'text-orange-600';
    const dataStr    = m.data ? new Date(m.data).toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';

    document.getElementById('delmov-tipo').textContent = tipoLabel + (m.motivo ? ` — ${m.motivo}` : '');
    document.getElementById('delmov-info').textContent = `Lote ${lote ? lote.numero : '—'} · ${v ? v.nome : '—'} · ${dataStr}`;
    document.getElementById('delmov-qtd').className    = `ml-auto font-black text-lg shrink-0 ${qtdColor}`;
    document.getElementById('delmov-qtd').textContent  = `${sinal}${m.qtd}`;

    const avisoEl  = document.getElementById('delmov-aviso-negativo');
    const confirmBtn = document.getElementById('delmov-confirm-btn');
    avisoEl.classList.toggle('hidden', !ficariaNegativo);
    confirmBtn.disabled = ficariaNegativo;
    confirmBtn.className = ficariaNegativo
        ? 'flex-1 bg-slate-300 text-slate-500 py-2.5 rounded-xl font-black text-xs uppercase cursor-not-allowed'
        : 'flex-1 bg-red-600 text-white py-2.5 rounded-xl font-black text-xs uppercase hover:bg-red-700 transition shadow';

    _pendingDeleteMovId = movId;
    document.getElementById('modal-delete-mov').classList.add('active');
}

function confirmDeleteMovimentacao() {
    if (!_pendingDeleteMovId) return;
    const m = stockMovements.find(x => x.id == _pendingDeleteMovId);
    if (!m) return;
    const lote = vaccineLots.find(l => l.id == m.loteId);
    logAudit('Excluído', 'lote', String(lote ? lote.vaccineId : m.loteId),
        `Lote ${lote ? lote.numero : m.loteId}`,
        `Movimentação removida | Tipo: ${m.tipo} | Qtd: ${m.qtd}`);
    const vaccineId = lote ? lote.vaccineId : null;
    stockMovements = stockMovements.filter(x => x.id != _pendingDeleteMovId);
    _pendingDeleteMovId = null;
    document.getElementById('modal-delete-mov').classList.remove('active');
    saveAll();
    syncLoteStatus(m.loteId);
    renderMovimentacao(); renderAlmoxLotes(); renderEstoqueDashboard(); renderVaccines();
    updateExpiryBadge();
    if (vaccineId) refreshVaccineViewModal(vaccineId);
    // Atualiza viewer de lote se estiver aberto
    if (typeof renderViewLoteMov === 'function' && document.getElementById('modal-view-lote')?.classList.contains('active')) {
        renderViewLoteMov();
        if (typeof _refreshViewLoteHeader === 'function') _refreshViewLoteHeader();
    }
    showNotification('Movimentação excluída!', 'success');
}

// ─── Helper ───────────────────────────────────────────────────────────────────
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

// Sincroniza modais de lotes e de visualização de vacina que possam estar abertos.
// Chamado após qualquer alteração de agendamento para manter abas em sincronia.
function refreshOpenModals() {
    // Modal do dia (openDayModal)
    if (document.getElementById('modal-day-details')?.classList.contains('active') &&
        typeof selectedDayDate !== 'undefined' && selectedDayDate) {
        const [_y, _m, _d] = selectedDayDate.split('-');
        if (typeof openDayModal === 'function') openDayModal(selectedDayDate, parseInt(_d), parseInt(_m) - 1, parseInt(_y));
    }
    // Modal de listagem de lotes (openLoteModal)
    if (document.getElementById('modal-lotes')?.classList.contains('active')) {
        if (typeof renderLoteLists === 'function') renderLoteLists();
    }
    // Modal de visualização de lote (editLote)
    if (document.getElementById('modal-view-lote')?.classList.contains('active')) {
        if (typeof renderViewLoteMov === 'function') renderViewLoteMov();
        if (typeof _refreshViewLoteHeader === 'function') _refreshViewLoteHeader();
        if (typeof _viewLoteId !== 'undefined' && typeof getLoteEstoque === 'function') {
            const est = getLoteEstoque(_viewLoteId);
            if (est) {
                setText('view-lote-disp',   est.disponivel);
                setText('view-lote-reserv', est.reservado);
                setText('view-lote-saida',  est.aplicado + est.saidaManual);
                setText('view-lote-total',  est.disponivel + est.reservado);
            }
        }
    }
    // Modal de visualização de vacina (openVaccineViewModal)
    if (document.getElementById('modal-view-vaccine')?.classList.contains('active') && typeof _vvVaccineId !== 'undefined') {
        if (typeof refreshVaccineViewModal === 'function') refreshVaccineViewModal(_vvVaccineId);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  MODAL VISUALIZAR VACINA (cards do Estoque)
// ═══════════════════════════════════════════════════════════════════════════
let _vvVaccineId  = null;
let _vvLoteFilter = 'aberto';
let _vvLotePage   = 0;
let _vvMovFilter  = 'ambos';
let _vvMovPage    = 0;
const _VV_PAGE_SIZE = 10;

function openVaccineViewModal(vaccineId) {
    _vvVaccineId  = vaccineId;
    _vvLoteFilter = 'aberto';
    _vvLotePage   = 0;
    _vvMovFilter  = 'ambos';
    _vvMovPage    = 0;

    const v = vaccines.find(x => x.id == vaccineId);
    if (!v) return;
    const e = getVaccineEstoque(vaccineId);

    // Header
    document.getElementById('vv-nome').innerHTML = v.nome + (v.mnemonico ? ` <span class="inline-flex items-center bg-white/15 text-white/80 border border-white/20 px-1.5 py-0.5 rounded-full text-[9px] font-black normal-case">${v.mnemonico}</span>` : '');
    const statusTxt = v.ativo !== false ? '● Ativa' : '● Inativa';
    const statusEl = document.getElementById('vv-status-badge');
    statusEl.textContent = statusTxt;
    statusEl.className = v.ativo !== false ? 'text-[10px] font-black uppercase mt-0.5 text-emerald-300' : 'text-[10px] font-black uppercase mt-0.5 text-red-300';
    document.getElementById('vv-kpi-disp').textContent  = e.disponivel;
    document.getElementById('vv-kpi-reserv').textContent = e.reservado;
    document.getElementById('vv-kpi-total').textContent  = e.disponivel + e.reservado;

    // Header color por estoque
    const hdr = document.getElementById('vv-header');
    const _vEstMin = v.estoqueMinimo || 5;
    hdr.className = `p-5 text-white shrink-0 bg-gradient-to-br ${e.disponivel <= 0 ? 'from-red-700 to-red-900' : e.disponivel <= _vEstMin ? 'from-amber-600 to-amber-900' : 'from-indigo-700 to-navy-900'}`;

    // Aba info
    const esquemas = (v.esquemas && v.esquemas.length) ? v.esquemas : null;
    const multiEsquema = esquemas && esquemas.length > 1;

    // Tipo — hierarquia: Multi amostra > Dose única > Reforço
    const nReforcosInfo = getVaccineReforcos(v).length;
    const tipoTxt = multiEsquema ? 'Multi amostra' : v.doseUnica ? 'Dose única' : nReforcosInfo > 1 ? `Multidose c/ ${nReforcosInfo} reforços` : nReforcosInfo === 1 ? 'Multidose c/ reforço' : 'Multidose';
    document.getElementById('vv-info-tipo').textContent = tipoTxt;
    document.getElementById('vv-info-valor').textContent = v.valor ? `R$ ${String(v.valor).replace('R$','').trim()}` : '—';
    const vvCustoBox = document.getElementById('vv-info-custo-box');
    if (vvCustoBox) {
        const podeC = (typeof canSeeCusto === 'function') && canSeeCusto();
        vvCustoBox.classList.toggle('hidden', !podeC);
        if (podeC) {
            const c = getVaccineCusto(vaccineId);
            document.getElementById('vv-info-custo').textContent = (c.informado && c.unitMedio != null) ? `${fmtCusto(c.unitMedio)} / dose` : '—';
            document.getElementById('vv-info-custo-estoque').textContent = c.informado ? `${fmtCusto(c.valorEstoque)} em estoque` : '';
            // Último lote cadastrado com custo (id = Date.now() no cadastro)
            const ultimo = vaccineLots
                .filter(l => l.vaccineId == vaccineId)
                .map(l => ({ l, c: getLoteCustoFrom(l) }))
                .filter(x => x.c.informado && x.c.unit != null)
                .sort((a, b) => Number(b.l.id) - Number(a.l.id))[0];
            document.getElementById('vv-info-custo-ultimo').textContent = ultimo ? `${fmtCusto(ultimo.c.unit)} / dose` : '—';
            document.getElementById('vv-info-custo-ultimo-lote').textContent = ultimo ? `Lote ${ultimo.l.numero || ''}` : '';
        }
    }

    if (multiEsquema) {
        // Doses: uma linha por esquema
        document.getElementById('vv-info-doses').innerHTML = esquemas.map(esq => {
            const faixa = (typeof formatFaixaEtaria === 'function') ? formatFaixaEtaria(esq) : '—';
            const nd = esq.numDoses || 1;
            return `<span class="block text-xs font-bold text-slate-700"><span class="text-[9px] text-slate-400">${faixa}:</span> ${nd} dose${nd > 1 ? 's' : ''}</span>`;
        }).join('');
        // Idade: apenas a idade mínima do primeiro esquema
        const primeiroEsq = esquemas[0];
        const idadeMinPrimeiro = primeiroEsq
            ? (primeiroEsq.minAnos > 0 && primeiroEsq.minMeses > 0 ? `${primeiroEsq.minAnos}a ${primeiroEsq.minMeses}m`
                : primeiroEsq.minAnos > 0 ? `A partir de ${primeiroEsq.minAnos} ano(s)`
                : primeiroEsq.minMeses > 0 ? `A partir de ${primeiroEsq.minMeses} mês(es)`
                : 'Sem restrição')
            : '—';
        document.getElementById('vv-info-idade').textContent = idadeMinPrimeiro;
        // Intervalos: por esquema
        document.getElementById('vv-info-intervalos').innerHTML = esquemas.map(esq => {
            const faixa = (typeof formatFaixaEtaria === 'function') ? formatFaixaEtaria(esq) : '—';
            const ivs = esq.intervalos && esq.intervalos.length
                ? esq.intervalos.map((x, i) => `D${i+1}→D${i+2}: ${x}d`).join(' · ')
                : '—';
            return `<span class="block"><span class="text-[9px] font-black text-slate-400">${faixa}:</span> <span class="font-bold text-slate-700">${ivs}</span></span>`;
        }).join('');
    } else {
        const esq = esquemas ? esquemas[0] : null;
        const soReforco = (typeof esquemaSemDoses === 'function') && esquemaSemDoses(esq);
        const numDoses = soReforco ? 0 : ((esq ? esq.numDoses : null) || v.numDoses || 1);
        const sufReforco = nReforcosInfo > 1 ? `${nReforcosInfo} reforços` : nReforcosInfo === 1 ? 'reforço' : '';
        document.getElementById('vv-info-doses').textContent = soReforco
            ? `Somente ${sufReforco || 'reforço'}`
            : `${numDoses} dose${numDoses > 1 ? 's' : ''}${sufReforco ? ` + ${sufReforco}` : ''}`;
        const idadeMin = esq
            ? ((typeof formatFaixaEtaria === 'function') ? formatFaixaEtaria(esq) : '—')
            : (v.idadeMinimaAnos > 0 ? `${v.idadeMinimaAnos} ano(s)` : v.idadeMinimaMeses > 0 ? `${v.idadeMinimaMeses} mês(es)` : '—');
        document.getElementById('vv-info-idade').textContent = idadeMin;
        const ivs = esq && esq.intervalos && esq.intervalos.length
            ? esq.intervalos.map((x, i) => `D${i+1}→D${i+2}: ${x} dias`).join(' · ')
            : v.intervalos && v.intervalos.length
                ? v.intervalos.map((x, i) => `D${i+1}→D${i+2}: ${x} dias`).join(' · ')
                : v.intervaloDias > 0 ? `${v.intervaloDias} dias` : '—';
        document.getElementById('vv-info-intervalos').textContent = ivs;
    }
    const estoqueAtual = e.disponivel + e.reservado;
    const pct = estoqueAtual > 0 ? Math.round((e.disponivel / estoqueAtual) * 100) : 0;
    document.getElementById('vv-bar').style.width = pct + '%';
    document.getElementById('vv-bar').className = `h-full rounded-full transition-all duration-500 ${e.disponivel <= 0 ? 'bg-red-400' : e.disponivel <= _vEstMin ? 'bg-amber-400' : 'bg-indigo-500'}`;
    document.getElementById('vv-bar-label').textContent = `${e.disponivel} disponíveis de ${estoqueAtual} (${pct}%)`;

    switchVaccineViewTab('info');
    document.getElementById('modal-view-vaccine').classList.add('active');
}

function switchVaccineViewTab(tab) {
    ['info','lotes','movs'].forEach(t => {
        const panel = document.getElementById(`vvpanel-${t}`);
        const btn   = document.getElementById(`vvtab-${t}`);
        const active = t === tab;
        if (panel) panel.classList.toggle('hidden', !active);
        if (btn) {
            btn.className = `flex-1 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition ${
                active ? 'text-indigo-700 bg-white border-indigo-500' : 'text-slate-500 hover:bg-white border-transparent'
            }`;
        }
    });
    if (tab === 'lotes') renderVVLotes();
    if (tab === 'movs')  renderVVMovs();
}

function setVVLoteFilter(f) {
    _vvLoteFilter = f;
    _vvLotePage   = 0;
    ['aberto','fechado','ambos'].forEach(x => {
        const btn = document.getElementById(`vvlf-${x}`);
        if (btn) btn.className = `px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition ${x === f ? 'bg-navy-900 text-white shadow' : 'text-slate-500 hover:bg-white'}`;
    });
    renderVVLotes();
}

function vvLotePage(dir) {
    _vvLotePage = Math.max(0, _vvLotePage + dir);
    renderVVLotes();
}

function renderVVLotes() {
    const today = new Date(); today.setHours(0,0,0,0);
    const twoMonths = new Date(); twoMonths.setMonth(twoMonths.getMonth() + 2); twoMonths.setHours(0,0,0,0);
    const _vvVaccine = vaccines.find(x => x.id == _vvVaccineId);
    const _vvEstMin = (_vvVaccine && _vvVaccine.estoqueMinimo) || 5;

    let lotes = vaccineLots.filter(l => l.vaccineId == _vvVaccineId);
    if (_vvLoteFilter === 'aberto')  lotes = lotes.filter(l => l.status === 'aberto');
    if (_vvLoteFilter === 'fechado') lotes = lotes.filter(l => l.status !== 'aberto');
    lotes.sort((a, b) => new Date(a.validade || 0) - new Date(b.validade || 0));

    const total = lotes.length;
    const pages = Math.ceil(total / _VV_PAGE_SIZE) || 1;
    _vvLotePage = Math.min(_vvLotePage, pages - 1);
    const slice = lotes.slice(_vvLotePage * _VV_PAGE_SIZE, (_vvLotePage + 1) * _VV_PAGE_SIZE);

    const list = document.getElementById('vv-lotes-list');
    if (!slice.length) {
        list.innerHTML = '<p class="text-center text-slate-400 text-xs font-bold py-8">Nenhum lote encontrado.</p>';
    } else {
        list.innerHTML = slice.map(l => {
            const est     = getLoteEstoque(l.id);
            const exp     = l.validade ? new Date(l.validade + 'T00:00:00') : null;
            const vencido = exp && exp < today;
            const vencendo = exp && !vencido && exp <= twoMonths;
            const valStr  = l.validade ? l.validade.split('-').reverse().join('/') : '—';
            const dispCls = est.disponivel <= 0 ? 'bg-red-100 text-red-700' : est.disponivel <= _vvEstMin ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700';
            const badge   = vencido ? '<span class="px-1.5 py-0.5 rounded text-[8px] font-black bg-red-100 text-red-600 ml-1">VENCIDO</span>'
                          : vencendo ? '<span class="px-1.5 py-0.5 rounded text-[8px] font-black bg-amber-100 text-amber-600 ml-1">VENCENDO</span>' : '';
            return `<div class="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition cursor-pointer" onclick="editLote(${l.id})">
                <div>
                    <p class="font-black text-slate-800 text-sm">Lote ${l.numero || '—'}${badge}</p>
                    ${(l.fabricante || l.fabricanteNome || l.fornecedor) ? `<p class="text-[9px] text-slate-400 font-bold mt-0.5">${[l.fabricante, l.fabricanteNome, l.fornecedor].filter(Boolean).join(' · ')}</p>` : ''}
                    <p class="text-[10px] text-slate-500 font-bold mt-0.5">Val: ${valStr} · <span class="${l.status === 'aberto' ? 'text-emerald-600' : 'text-slate-400'}">${l.status === 'aberto' ? 'Aberto' : 'Fechado'}</span></p>
                </div>
                <div class="text-right">
                    <span class="px-2.5 py-1 rounded-full text-xs font-black ${dispCls}">${est.disponivel} disp.</span>
                    <p class="text-[9px] text-slate-400 font-bold mt-0.5">${est.reservado} reserv. · ${est.disponivel + est.reservado} total</p>
                    ${(() => {
                        if (!((typeof canSeeCusto === 'function') && canSeeCusto())) return '';
                        const c = getLoteCustoFrom(l);
                        return `<p class="text-[9px] font-black text-amber-600 mt-0.5"><i class="fas fa-tag mr-0.5"></i>${c.informado ? `${fmtCusto(c.unit)}/dose` : '—'}</p>`;
                    })()}
                </div>
            </div>`;
        }).join('');
    }

    const pag = document.getElementById('vv-lotes-pagination');
    pag.classList.toggle('hidden', pages <= 1);
    document.getElementById('vv-lote-page-info').textContent = `Página ${_vvLotePage + 1} de ${pages}`;
    document.getElementById('vv-lote-prev').disabled = _vvLotePage === 0;
    document.getElementById('vv-lote-next').disabled = _vvLotePage >= pages - 1;
}

function setVVMovFilter(f) {
    _vvMovFilter = f;
    _vvMovPage   = 0;
    ['ambos','entrada','saida'].forEach(x => {
        const btn = document.getElementById(`vvmf-${x}`);
        if (btn) btn.className = `px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition ${x === f ? 'bg-navy-900 text-white shadow' : 'text-slate-500 hover:bg-white'}`;
    });
    renderVVMovs();
}

function vvMovPage(dir) {
    _vvMovPage = Math.max(0, _vvMovPage + dir);
    renderVVMovs();
}

function renderVVMovs() {
    let movs = stockMovements.filter(m => {
        const lote = vaccineLots.find(l => l.id == m.loteId);
        return lote && lote.vaccineId == _vvVaccineId;
    });
    if (_vvMovFilter === 'entrada') movs = movs.filter(m => m.tipo === 'entrada');
    if (_vvMovFilter === 'saida')   movs = movs.filter(m => m.tipo !== 'entrada');
    movs.sort((a, b) => new Date(b.data) - new Date(a.data));

    const total = movs.length;
    const pages = Math.ceil(total / _VV_PAGE_SIZE) || 1;
    _vvMovPage  = Math.min(_vvMovPage, pages - 1);
    const slice = movs.slice(_vvMovPage * _VV_PAGE_SIZE, (_vvMovPage + 1) * _VV_PAGE_SIZE);

    const list = document.getElementById('vv-movs-list');
    const pag  = document.getElementById('vv-movs-pagination');

    if (!slice.length) {
        list.innerHTML = '<p class="text-center text-slate-400 text-xs font-bold py-8">Nenhuma movimentação.</p>';
        if (pag) pag.classList.add('hidden');
        return;
    }

    list.innerHTML = slice.map(m => {
        const lote      = vaccineLots.find(l => l.id == m.loteId);
        const isEntrada = m.tipo === 'entrada';
        const isReserva = m.tipo === 'reserva';
        const tipoBadge = isEntrada
            ? `<span class="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-100 text-emerald-700"><i class="fas fa-arrow-down mr-0.5"></i>Entrada</span>`
            : isReserva
                ? `<span class="px-2 py-0.5 rounded-full text-[9px] font-black bg-indigo-100 text-indigo-700"><i class="fas fa-lock mr-0.5"></i>Reserva</span>`
                : m.descarte
                    ? `<span class="px-2 py-0.5 rounded-full text-[9px] font-black bg-red-100 text-red-700"><i class="fas fa-trash mr-0.5"></i>Descarte</span>`
                    : `<span class="px-2 py-0.5 rounded-full text-[9px] font-black bg-orange-100 text-orange-700"><i class="fas fa-arrow-up mr-0.5"></i>Saída</span>`;
        const qtdColor = isEntrada ? 'text-emerald-600' : isReserva ? 'text-indigo-600' : 'text-orange-600';
        const dataStr  = m.data ? new Date(m.data).toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
        const isAuto   = !!m.appointmentId;
        const acoesBtns = isAuto
            ? `<button onclick="viewRecord(${m.appointmentId})" class="h-7 w-7 bg-slate-50 border border-slate-200 text-slate-400 hover:text-clinic-600 rounded-lg flex items-center justify-center transition" title="Ver agendamento"><i class="fas fa-eye text-[10px]"></i></button>`
            : `<div class="flex gap-1">
                ${permBtn('edicao_movimentacao', `<button onclick="openEditMovModal(${m.id})" class="h-7 w-7 bg-slate-100 text-slate-600 hover:bg-clinic-600 hover:text-white rounded-lg flex items-center justify-center transition" title="Editar"><i class="fas fa-pen text-[10px]"></i></button>`)}
                ${permBtn('edicao_movimentacao', `<button onclick="deleteMovimentacao(${m.id})" class="h-7 w-7 bg-red-50 text-red-400 hover:bg-red-500 hover:text-white rounded-lg flex items-center justify-center transition" title="Excluir"><i class="fas fa-trash text-[10px]"></i></button>`)}
               </div>`;
        return `<div class="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition">
            <div class="shrink-0">${tipoBadge}</div>
            <div class="flex-1 min-w-0">
                <p class="text-xs font-bold text-slate-700 truncate">${m.motivo || '—'}</p>
                <p class="text-[9px] text-slate-400 font-bold">Lote ${lote ? lote.numero : '—'} · ${dataStr}</p>
            </div>
            <span class="font-black text-sm ${qtdColor} shrink-0">${isEntrada ? '+' : '−'}${m.qtd}</span>
            ${acoesBtns}
        </div>`;
    }).join('');

    if (pag) {
        pag.classList.toggle('hidden', pages <= 1);
        document.getElementById('vv-mov-page-info').textContent  = `Página ${_vvMovPage + 1} de ${pages}`;
        document.getElementById('vv-mov-prev').disabled = _vvMovPage === 0;
        document.getElementById('vv-mov-next').disabled = _vvMovPage >= pages - 1;
    }
}

function openAddLoteFromVaccineView() {
    if (!checkPerm('edicao_lotes')) return;
    const v = vaccines.find(x => x.id == _vvVaccineId);
    if (!v) return;
    _fabLoteVaccines = vaccines.filter(x => x.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    document.getElementById('fab-lote-vaccine-search').value = v.nome;
    document.getElementById('fab-lote-vaccine').value = v.id;
    document.getElementById('fab-lote-fabnome').value = '';
    document.getElementById('fab-lote-numero').value = '';
    document.getElementById('fab-lote-validade').value = '';
    document.getElementById('fab-lote-qtd').value = '';
    document.getElementById('fab-lote-custo').value = '';
    aplicarVisibilidadeCusto();
    atualizarCustoUnitPreview('fab');
    document.getElementById('modal-add-lote-fab').classList.add('active');
}

function openVVMovEntrada() { openMovModal('entrada', null, _vvVaccineId); }
function openVVMovSaida()   { openMovModal('saida',   null, _vvVaccineId); }
// ─── Busca por vacina na aba Movimentação ─────────────────────────────────────
function toggleMovVaccineSearch(e) {
    e && e.stopPropagation();
    const dd = document.getElementById('mov-vaccine-dropdown');
    const isOpen = !dd.classList.contains('hidden');
    if (isOpen) {
        dd.classList.add('hidden');
    } else {
        dd.classList.remove('hidden');
        document.getElementById('mov-vaccine-search-input').value = '';
        filterMovVaccineDropdown('');
        setTimeout(() => document.getElementById('mov-vaccine-search-input').focus(), 50);
    }
}

function filterMovVaccineDropdown(q) {
    const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
    const list = vaccines
        .filter(v => v.ativo !== false && (!q || norm(v.nome).includes(norm(q)) ||
            (v.mnemonico && norm(v.mnemonico).includes(norm(q))) ||
            vaccineLots.some(l => l.vaccineId == v.id && l.fabricante && norm(l.fabricante).includes(norm(q)))))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    const el = document.getElementById('mov-vaccine-dropdown-list');
    if (!list.length) {
        el.innerHTML = '<p class="text-center text-slate-400 text-xs font-bold py-4">Nenhuma vacina encontrada</p>';
        return;
    }
    el.innerHTML = list.map(v => {
        const isActive = _movVaccineFilter == v.id;
        return `<button onclick="selectMovVaccineFilter(${v.id},'${v.nome.replace(/'/g,"\\'")}')"
            class="w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${isActive ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-indigo-50 hover:text-indigo-700'}">
            <span class="h-5 w-5 ${isActive ? 'bg-white/20' : 'bg-slate-100'} rounded-lg flex items-center justify-center shrink-0">
                <i class="fas fa-syringe text-[9px] ${isActive ? 'text-white' : 'text-slate-400'}"></i>
            </span>
            <span class="flex-1 min-w-0">${v.nome}</span>
            ${v.mnemonico ? `<span class="inline-flex items-center bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full text-[9px] font-black normal-case shrink-0">${v.mnemonico}</span>` : ''}
        </button>`;
    }).join('');
}

function selectMovVaccineFilter(vaccineId, label) {
    _movVaccineFilter = vaccineId || null;
    const btn = document.getElementById('btn-mov-vaccine-search');
    const hasFilter = _movVaccineFilter !== null;
    btn.className = `h-9 w-9 border rounded-xl transition shadow-sm flex items-center justify-center ${
        hasFilter ? 'bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-600'
    }`;
    btn.title = hasFilter ? `Filtro: ${label}` : 'Filtrar por vacina';
    document.getElementById('mov-vaccine-dropdown').classList.add('hidden');
    renderMovimentacao();
}

document.addEventListener('click', function(e) {
    const wrap = document.getElementById('mov-vaccine-search-wrap');
    if (wrap && !wrap.contains(e.target)) {
        const dd = document.getElementById('mov-vaccine-dropdown');
        if (dd) dd.classList.add('hidden');
    }
});
function refreshVaccineViewModal(vaccineId) {
    const modal = document.getElementById('modal-view-vaccine');
    if (!modal || !modal.classList.contains('active')) return;
    if (_vvVaccineId != vaccineId) return;
    openVaccineViewModal(vaccineId);
    // Restaura a aba que estava aberta
    const activeTab = ['info','lotes','movs'].find(t => !document.getElementById('vvpanel-' + t)?.classList.contains('hidden'));
    if (activeTab && activeTab !== 'info') switchVaccineViewTab(activeTab);
}