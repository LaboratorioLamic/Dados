// ===== Dashboard: abas Geral | Funcionários =====
//
// "Geral" é a visão executiva agregada (rotatividade, turnover, financeiro).
// "Funcionários" cruza três filtros (funcionário × cargo × unidade) para responder
// perguntas no nível do indivíduo/cargo/unidade que a aba Geral não cobre.
// Os alertas de equipe incompleta/cobertura reduzida saíram daqui: agora vivem no
// sino de notificações do topbar (js/notificacoes.js) — ver diagnosticoUnidade/Cobertura.

const DASH_TABS = [
    { id: 'geral', label: 'Geral' },
    { id: 'funcionarios', label: 'Funcionários' }
];

const dashState = { tab: 'geral', ano: new Date().getFullYear(), unidade: '', dados: null };
const dashFuncState = { funcionario: '', cargo: '', unidade: '' };
// '' = dados gerais (todo o histórico); ano específico filtra ausências/treinos daquele ano
let dashFuncAno = '';
// Empilhamento do card de faltas/licenças em "Dados gerais": por padrão agrega por mês
// (Jan–Dez, somando todos os anos); o botão alterna para por ano. Com um ano selecionado o
// card já é mensal por natureza, então o botão nem aparece.
const _dfAusModo = { modo: 'mes' };

registerPage({
    id: 'dashboard',
    title: 'Dashboard',
    icon: 'dashboard',
    order: 1,
    perm: 'ver_dashboard',
    async render(el) {
        chartDestroy('dash');
        el.innerHTML = '<div class="loading-center"><div class="spinner-dark"></div></div>';

        const [funcionarios, cargos, unidades, demissoes, treinamentos, ausencias, folha] = await Promise.all([
            DB.getAll(PATHS.funcionarios), DB.getAll(PATHS.cargos), DB.getAll(PATHS.unidades),
            DB.getAll(PATHS.demissoes), DB.getAll(PATHS.treinamentos), DB.getAll(PATHS.ausencias),
            DB.getObj(PATHS.folha)
        ]);
        const dados = { funcionarios, cargos, unidades, demissoes, treinamentos, ausencias, folha: folha || {} };
        dashState.dados = dados;

        // Notificações refletem o mesmo carregamento — sem novo fetch (ver js/notificacoes.js)
        if (typeof refreshNotificacoes === 'function') refreshNotificacoes(dados);

        // Anos disponíveis (admissões, demissões e ano atual)
        const anos = new Set([new Date().getFullYear()]);
        funcionarios.forEach(f => { if (f.admissao) anos.add(Number(f.admissao.slice(0, 4))); });
        demissoes.forEach(d => { if (d.data) anos.add(Number(d.data.slice(0, 4))); });
        const anosOrd = [...anos].sort((a, b) => b - a);
        if (!anosOrd.includes(dashState.ano)) dashState.ano = anosOrd[0];

        el.innerHTML = `
            <div class="page-header">
                <div>
                    <h2>Bem-vindo, ${escapeHtml((currentUser.nome || '').split(' ')[0])} 👋</h2>
                    <div class="page-sub">Visão executiva de pessoas, rotatividade e custos.</div>
                </div>
                <div class="actions" id="dashActions"></div>
            </div>
            <div class="tabs" id="dashTabs">
                ${DASH_TABS.map(t => `<div class="tab${t.id === dashState.tab ? ' active' : ''}" data-tab="${t.id}">${t.label}</div>`).join('')}
            </div>
            <div class="mt-16" id="dashContent"></div>`;

        el.querySelectorAll('#dashTabs .tab').forEach(tab => {
            tab.onclick = () => {
                dashState.tab = tab.dataset.tab;
                el.querySelectorAll('#dashTabs .tab').forEach(t => t.classList.toggle('active', t === tab));
                renderDashActions();
                renderDashTab();
            };
        });

        renderDashActions();
        renderDashTab();
    }
});

// Ações do cabeçalho variam por aba: "Geral" tem unidade+ano, "Funcionários" tem seus 3 filtros.
function renderDashActions() {
    const box = document.getElementById('dashActions');
    if (dashState.tab === 'geral') {
        box.innerHTML = `
            <button class="filter-btn" id="dbUnidade" data-icon="building"></button>
            <button class="filter-btn" id="dbAno" data-icon="calendar"></button>`;

        const { unidades } = dashState.dados;
        const btnUni = box.querySelector('#dbUnidade');
        const syncUni = () => {
            const u = unidades.find(x => x.id === dashState.unidade);
            btnUni.innerHTML = `${icon('building')}<span>${escapeHtml(u ? u.nome : 'Todas as unidades')}</span>${icon('chevronDown')}`;
            btnUni.classList.toggle('active', !!dashState.unidade);
        };
        btnUni.onclick = () => openFilterPopover(btnUni, {
            options: [{ value: '', label: 'Todas as unidades' }, ...unidades.map(u => ({ value: u.id, label: u.nome }))],
            value: dashState.unidade, searchable: unidades.length > 6,
            onPick: v => { dashState.unidade = v; syncUni(); renderDashTab(); }
        });
        syncUni();

        const anos = new Set([new Date().getFullYear()]);
        dashState.dados.funcionarios.forEach(f => { if (f.admissao) anos.add(Number(f.admissao.slice(0, 4))); });
        dashState.dados.demissoes.forEach(d => { if (d.data) anos.add(Number(d.data.slice(0, 4))); });
        const anosOrd = [...anos].sort((a, b) => b - a);

        const btnAno = box.querySelector('#dbAno');
        const syncAno = () => { btnAno.innerHTML = `${icon('calendar')}<span>${dashState.ano}</span>${icon('chevronDown')}`; };
        btnAno.onclick = () => openFilterPopover(btnAno, {
            options: anosOrd.map(a => ({ value: String(a), label: String(a) })),
            value: String(dashState.ano), searchable: false,
            onPick: v => { dashState.ano = Number(v); syncAno(); renderDashTab(); }
        });
        syncAno();
    } else {
        box.innerHTML = `
            <button class="filter-btn" id="dfFuncionario" data-icon="user"></button>
            <button class="filter-btn" id="dfCargo" data-icon="briefcase"></button>
            <button class="filter-btn" id="dfUnidade" data-icon="building"></button>
            <button class="filter-btn" id="dfAno" data-icon="calendar"></button>
            <button class="btn-icon" id="dfLimpar" title="Limpar filtros">${icon('refresh')}</button>`;
        bindDashFuncFiltros();

        const anos = new Set([new Date().getFullYear()]);
        dashState.dados.funcionarios.forEach(f => { if (f.admissao) anos.add(Number(f.admissao.slice(0, 4))); });
        dashState.dados.demissoes.forEach(d => { if (d.data) anos.add(Number(d.data.slice(0, 4))); });
        const anosOrd = [...anos].sort((a, b) => b - a);

        const btnAno = box.querySelector('#dfAno');
        const syncAnoDf = () => {
            btnAno.innerHTML = `${icon('calendar')}<span>${dashFuncAno || 'Dados gerais'}</span>${icon('chevronDown')}`;
            btnAno.classList.toggle('active', !!dashFuncAno);
        };
        btnAno.onclick = () => openFilterPopover(btnAno, {
            options: anosOrd.map(a => ({ value: String(a), label: String(a) })),
            value: String(dashFuncAno || ''), allLabel: 'Dados gerais', searchable: false,
            onPick: v => { dashFuncAno = v; syncAnoDf(); renderDashTab(); }
        });
        syncAnoDf();
    }
}

function renderDashTab() {
    const cont = document.getElementById('dashContent');
    chartDestroy('dash');
    cont.innerHTML = '<div class="loading-center"><div class="spinner-dark"></div></div>';
    try {
        if (dashState.tab === 'geral') renderDashGeral(cont, dashState.dados);
        else renderDashFuncionarios(cont, dashState.dados);
    } catch (e) {
        console.error(e);
        cont.innerHTML = emptyState({ icon: 'alert', title: 'Erro ao calcular', text: e.message || '' });
    }
}

// Headcount em uma data (funcionários do filtro atual)
const headcountEm = (funcs, dataIso) =>
    funcs.filter(f => f.admissao && f.admissao <= dataIso && (!f.demissao || f.demissao > dataIso)).length;

// Limite superior do mês para COMPARAÇÃO de datas ISO, não uma data real: '2025-02-31' não
// existe no calendário, mas ordena depois de qualquer dia de fevereiro, que é o que os
// filtros abaixo precisam. Por isso não usa o `fimDoMes(mesKey)` de utils.js — aquele devolve
// o último dia REAL do mês (para o fim do ciclo do banco de horas), e as duas funções não são
// intercambiáveis. Nomes iguais em escopo global também eram SyntaxError: este arquivo
// inteiro deixava de carregar, e com ele o Dashboard.
const fimDoMesCmp = (ano, mes) => `${mesKey(ano, mes)}-31`;

// Opções de doughnut: `dvOpts()` foi feito para barras/linhas (tooltip lê ctx.parsed.y,
// que não existe em doughnut — o valor vem em ctx.parsed puro). Mesmo padrão de
// resultados.js (perf_sexo): options manuais, sem scales, tooltip com % do total.
function dvOptsDonut(vals) {
    const total = vals.reduce((a, b) => a + b, 0);
    return {
        responsive: true, maintainAspectRatio: false, cutout: '62%',
        plugins: {
            legend: { display: true, position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, font: { size: 11 } } },
            tooltip: {
                padding: 10, backgroundColor: '#23233f', cornerRadius: 8,
                callbacks: { label: ctx => `${ctx.label}: ${fmtNum(ctx.parsed)}${total ? ` · ${fmtPct(ctx.parsed / total * 100)}` : ''}` }
            }
        }
    };
}

// ---- Perfil da equipe (escolaridade/tipo de cargo/sexo/faixa etária) ----
// Compartilhado pelas duas abas: a Geral usa o quadro completo (ou filtrado por unidade),
// a Funcionários usa o recorte cruzado dos 3 filtros. Mesma leitura, dado diferente.
function perfilEquipe(ativos, cargos) {
    const conta = (lista, chave) => {
        const c = {};
        lista.forEach(x => { const k = chave(x) || '—'; c[k] = (c[k] || 0) + 1; });
        return c;
    };
    const porEscolaridade = conta(ativos, f => f.escolaridade);
    const porTipoCargo = conta(ativos, f => cargos.find(c => c.id === f.cargoId)?.tipo);
    const porSexo = conta(ativos, f => f.sexo);
    // A primeira faixa começa em 14, não em 18: o contrato de aprendizagem admite menor de
    // idade (art. 428 da CLT), e o ternário abaixo não tinha piso — um aprendiz de 15 anos
    // era contado como "18–25", uma faixa etária que ele não tem.
    const faixas = { '14–17': 0, '18–25': 0, '26–35': 0, '36–45': 0, '46–55': 0, '56+': 0 };
    ativos.forEach(f => {
        const i = idade(f.nascimento);
        if (i == null) return;
        faixas[i <= 17 ? '14–17' : i <= 25 ? '18–25' : i <= 35 ? '26–35' : i <= 45 ? '36–45' : i <= 55 ? '46–55' : '56+']++;
    });
    return { porEscolaridade, porTipoCargo, porSexo, faixas };
}

function pintarPerfilEquipe(dono, sufixo, perfil) {
    const escLabels = ESCOLARIDADES.filter(e => perfil.porEscolaridade[e]);
    const optEsc = dvOpts({ fmt: 'num' });
    optEsc.indexAxis = 'y';
    optEsc.scales = {
        x: { beginAtZero: true, grid: { color: DV.grid }, border: { display: false }, ticks: { precision: 0, color: DV.ink, font: { size: 11 } } },
        y: { grid: { display: false }, ticks: { color: DV.ink, font: { size: 11 } } }
    };
    mkChart(dono, `chEscolaridade${sufixo}`, {
        type: 'bar',
        data: { labels: escLabels, datasets: [dvBarra('Funcionários', escLabels.map(k => perfil.porEscolaridade[k]), DV.s1)] },
        options: optEsc
    });

    const cargoLabels = TIPOS_CARGO.filter(t => perfil.porTipoCargo[t]);
    const cargoVals = cargoLabels.map(k => perfil.porTipoCargo[k]);
    mkChart(dono, `chCargos${sufixo}`, {
        type: 'doughnut',
        data: { labels: cargoLabels, datasets: [{ data: cargoVals, backgroundColor: DV_SLOTS.slice(0, cargoLabels.length), borderColor: '#fff', borderWidth: 2 }] },
        options: dvOptsDonut(cargoVals)
    });

    const sexoLabels = SEXOS.filter(s => perfil.porSexo[s]);
    const sexoVals = sexoLabels.map(k => perfil.porSexo[k]);
    mkChart(dono, `chSexo${sufixo}`, {
        type: 'doughnut',
        data: { labels: sexoLabels, datasets: [{ data: sexoVals, backgroundColor: [DV.s1, DV.s7, DV.s3].slice(0, sexoLabels.length), borderColor: '#fff', borderWidth: 2 }] },
        options: dvOptsDonut(sexoVals)
    });

    mkChart(dono, `chFaixa${sufixo}`, {
        type: 'bar',
        data: { labels: Object.keys(perfil.faixas), datasets: [dvBarra('Funcionários', Object.values(perfil.faixas), DV.s5)] },
        options: dvOpts({ fmt: 'num' })
    });
}

function htmlPerfilEquipe(sufixo, titulo = true) {
    return `
        ${titulo ? `<h3 class="mt-24" style="font-size:16px">Perfil da equipe <span class="muted" style="font-weight:500;font-size:12.5px">(recorte atual)</span></h3>` : ''}
        <div class="grid grid-2 mt-16">
            ${chartCard({ id: `chEscolaridade${sufixo}`, titulo: 'Escolaridade' })}
            ${chartCard({ id: `chCargos${sufixo}`, titulo: 'Tipos de cargo' })}
        </div>
        <div class="grid grid-2 mt-16">
            ${chartCard({ id: `chSexo${sufixo}`, titulo: 'Sexo' })}
            ${chartCard({ id: `chFaixa${sufixo}`, titulo: 'Faixa etária' })}
        </div>`;
}

// ============================================================
// ABA GERAL
// ============================================================
function renderDashGeral(cont, dados) {
    const { ano, unidade } = dashState;
    const fin = can('ver_financeiro');

    const funcs = dados.funcionarios.filter(f => !unidade || f.unidadeId === unidade);
    const idsFuncs = new Set(funcs.map(f => f.id));
    const demissoes = dados.demissoes.filter(d => idsFuncs.has(d.funcionarioId));

    // ---- Séries mensais de rotatividade ----
    const admMes = [], demMes = [], turnoverMes = [], headFimMes = [];
    for (let m = 0; m < 12; m++) {
        const ini = `${mesKey(ano, m)}-01`, fim = fimDoMesCmp(ano, m);
        const adm = funcs.filter(f => f.admissao >= ini && f.admissao <= fim).length;
        const dem = funcs.filter(f => f.demissao && f.demissao >= ini && f.demissao <= fim).length;
        const hIni = headcountEm(funcs, m === 0 ? `${ano - 1}-12-31` : fimDoMesCmp(ano, m - 1));
        const hFim = headcountEm(funcs, fim);
        const hMedio = (hIni + hFim) / 2;
        admMes.push(adm); demMes.push(dem); headFimMes.push(hFim);
        turnoverMes.push(hMedio > 0 ? Number((((adm + dem) / 2) / hMedio * 100).toFixed(1)) : 0);
    }
    const admAno = admMes.reduce((a, b) => a + b, 0);
    const demAno = demMes.reduce((a, b) => a + b, 0);
    const ativosHoje = headcountEm(funcs, hoje());
    const headMedioAno = headFimMes.reduce((a, b) => a + b, 0) / 12;
    const turnoverAno = headMedioAno > 0 ? ((admAno + demAno) / 2) / headMedioAno * 100 : 0;

    // ---- Motivos de desligamento no ano ----
    const motivosCount = {};
    demissoes.filter(d => (d.data || '').startsWith(String(ano))).forEach(d =>
        motivosCount[d.motivo || 'Outro'] = (motivosCount[d.motivo || 'Outro'] || 0) + 1);

    // ---- Perfil da equipe (ativos hoje) ----
    const ativos = funcs.filter(f => !f.demissao);
    const perfil = perfilEquipe(ativos, dados.cargos);

    // ---- Treinamentos por mês (horas × participantes do filtro) ----
    const treinoHorasMes = Array(12).fill(0);
    dados.treinamentos.forEach(t => {
        if (!(t.inicio || '').startsWith(String(ano))) return;
        const m = Number(t.inicio.slice(5, 7)) - 1;
        const parts = (t.participantes || []).filter(id => idsFuncs.has(id)).length;
        treinoHorasMes[m] += (Number(t.cargaHoraria) || 0) * parts;
    });

    // ---- Financeiro: custo funcionários × custo benefícios ----
    const funcMes = Array(12).fill(0), benefMes = Array(12).fill(0);
    for (let m = 0; m < 12; m++) {
        const mesData = dados.folha?.[mesKey(ano, m)] || {};
        Object.entries(mesData).forEach(([fid, linha]) => {
            if (!idsFuncs.has(fid)) return;
            benefMes[m] += beneficioLinha(linha);
            funcMes[m] += totalLinha(linha) - beneficioLinha(linha);
        });
    }

    cont.innerHTML = `
        <div class="grid grid-4">
            <div class="kpi kpi-accent">
                <div class="kpi-ico">${icon('users')}</div>
                <div class="kpi-txt"><span class="kpi-label">Funcionários ativos</span><span class="kpi-value">${fmtNum(ativosHoje)}</span></div>
            </div>
            <div class="kpi kpi-success">
                <div class="kpi-ico">${icon('trendUp')}</div>
                <div class="kpi-txt"><span class="kpi-label">Admissões em ${ano}</span><span class="kpi-value">${fmtNum(admAno)}</span></div>
            </div>
            <div class="kpi kpi-danger">
                <div class="kpi-ico">${icon('logout')}</div>
                <div class="kpi-txt"><span class="kpi-label">Demissões em ${ano}</span><span class="kpi-value">${fmtNum(demAno)}</span></div>
            </div>
            <div class="kpi kpi-warning">
                <div class="kpi-ico">${icon('chart')}</div>
                <div class="kpi-txt"><span class="kpi-label">Turnover ${ano}</span><span class="kpi-value">${fmtPct(turnoverAno)}</span></div>
            </div>
        </div>

        <div class="grid grid-2 mt-16">
            <div class="card"><div class="card-title">Rotatividade por mês</div><div class="card-sub">Admissões × demissões — ${ano}</div><div class="chart-box"><canvas id="chRotatividade"></canvas></div></div>
            <div class="card"><div class="card-title">Taxa de turnover</div><div class="card-sub">((admissões+demissões)/2) ÷ headcount médio — ${ano}</div><div class="chart-box"><canvas id="chTurnover"></canvas></div></div>
        </div>
        <div class="grid grid-2 mt-16">
            <div class="card"><div class="card-title">Funcionários no fim do mês</div><div class="card-sub">Headcount — ${ano}</div><div class="chart-box"><canvas id="chHeadcount"></canvas></div></div>
            <div class="card"><div class="card-title">Motivos de desligamento</div><div class="card-sub">${ano}</div><div class="chart-box"><canvas id="chMotivos"></canvas></div></div>
        </div>

        ${htmlPerfilEquipe('')}

        <div class="grid ${fin ? 'grid-2' : ''} mt-16">
            <div class="card"><div class="card-title">Treinamentos</div><div class="card-sub">Horas × participantes por mês — ${ano}</div><div class="chart-box"><canvas id="chTreinos"></canvas></div></div>
            ${fin ? `<div class="card"><div class="card-title">Funcionários × Benefícios</div><div class="card-sub">Custo mensal para a empresa — ${ano}</div><div class="chart-box"><canvas id="chFinanceiro"></canvas></div></div>` : ''}
        </div>`;

    mkChart('dash', 'chRotatividade', {
        type: 'bar',
        data: { labels: MESES, datasets: [dvBarra('Admissões', admMes, DV.s1), dvBarra('Demissões', demMes, DV.s6)] },
        options: dvOpts({ fmt: 'num', legenda: true })
    });

    mkChart('dash', 'chTurnover', {
        type: 'line',
        data: { labels: MESES, datasets: [{ label: 'Turnover %', data: turnoverMes, borderColor: DV.s1, borderWidth: 2, pointRadius: 3, pointBackgroundColor: DV.s1, tension: .3, fill: false }] },
        options: dvOpts({ fmt: 'pct' })
    });

    mkChart('dash', 'chHeadcount', {
        type: 'line',
        data: { labels: MESES, datasets: [{ label: 'Funcionários', data: headFimMes, borderColor: DV.s2, borderWidth: 2, pointRadius: 3, pointBackgroundColor: DV.s2, tension: .3, fill: false }] },
        options: dvOpts({ fmt: 'num' })
    });

    const motivoLabels = Object.keys(motivosCount);
    const motivoVals = motivoLabels.map(k => motivosCount[k]);
    mkChart('dash', 'chMotivos', motivoLabels.length ? {
        type: 'doughnut',
        data: { labels: motivoLabels, datasets: [{ data: motivoVals, backgroundColor: DV_SLOTS.slice(0, motivoLabels.length), borderColor: '#fff', borderWidth: 2 }] },
        options: dvOptsDonut(motivoVals)
    } : {
        type: 'doughnut',
        data: { labels: ['Sem desligamentos'], datasets: [{ data: [1], backgroundColor: [DV.grid], borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { display: true, position: 'bottom' }, tooltip: { enabled: false } } }
    });

    pintarPerfilEquipe('dash', '', perfil);

    mkChart('dash', 'chTreinos', {
        type: 'bar',
        data: { labels: MESES, datasets: [dvBarra('Horas de treinamento', treinoHorasMes, DV.s2)] },
        options: dvOpts({ fmt: 'num' })
    });

    if (fin) {
        mkChart('dash', 'chFinanceiro', {
            type: 'bar',
            data: { labels: MESES, datasets: [dvBarra('Custo funcionários', funcMes, DV.s1), dvBarra('Custo benefícios', benefMes, DV.s3)] },
            options: dvOpts({ fmt: 'brl', legenda: true })
        });
    }
}

// ============================================================
// ABA FUNCIONÁRIOS — filtros cruzados (funcionário × cargo × unidade)
// ============================================================

// Recalcula as opções de cada filtro a partir da lista de funcionários filtrada
// pelos OUTROS dois filtros — assim nenhum popover jamais oferece uma opção sem
// correlação com o que já está selecionado.
function opcoesCruzadas(dados) {
    const { funcionario, cargo, unidade } = dashFuncState;
    const { funcionarios, cargos, unidades } = dados;

    const porUnidadeCargo = (semUnidade, semCargo) => funcionarios.filter(f =>
        (semUnidade || !unidade || f.unidadeId === unidade) &&
        (semCargo || !cargo || f.cargoId === cargo));

    const baseParaCargo = porUnidadeCargo(false, true);
    const baseParaUnidade = porUnidadeCargo(true, false);
    const baseParaFuncionario = porUnidadeCargo(false, false);

    const cargoIds = new Set(baseParaCargo.map(f => f.cargoId));
    const unidadeIds = new Set(baseParaUnidade.map(f => f.unidadeId));

    return {
        opcoesCargo: cargos.filter(c => cargoIds.has(c.id)),
        opcoesUnidade: unidades.filter(u => unidadeIds.has(u.id)),
        opcoesFuncionario: baseParaFuncionario.filter(f => !funcionario || f.id === funcionario || true)
            .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''))
    };
}

function dashFuncFiltrados(dados) {
    const { funcionario, cargo, unidade } = dashFuncState;
    return dados.funcionarios
        .filter(f => !funcionario || f.id === funcionario)
        .filter(f => !cargo || f.cargoId === cargo)
        .filter(f => !unidade || f.unidadeId === unidade);
}

function bindDashFuncFiltros() {
    const dados = dashState.dados;
    if (!dados) return;

    const sync = () => {
        const { opcoesCargo, opcoesUnidade, opcoesFuncionario } = opcoesCruzadas(dados);

        const btnF = document.getElementById('dfFuncionario');
        const fSel = dados.funcionarios.find(f => f.id === dashFuncState.funcionario);
        btnF.innerHTML = `${icon('user')}<span>${escapeHtml(fSel ? fSel.nome : 'Todos os funcionários')}</span>${icon('chevronDown')}`;
        btnF.classList.toggle('active', !!dashFuncState.funcionario);
        btnF.onclick = () => openFilterPopover(btnF, {
            options: [{ value: '', label: 'Todos os funcionários' }, ...opcoesFuncionario.map(f => ({ value: f.id, label: f.nome }))],
            value: dashFuncState.funcionario, searchable: true,
            onPick: v => {
                dashFuncState.funcionario = v;
                // Selecionar uma pessoa fixa o cargo/unidade dela — visão individual explícita.
                const f = dados.funcionarios.find(x => x.id === v);
                if (f) { dashFuncState.cargo = f.cargoId || ''; dashFuncState.unidade = f.unidadeId || ''; }
                sync(); renderDashTab();
            }
        });

        const btnC = document.getElementById('dfCargo');
        const cSel = dados.cargos.find(c => c.id === dashFuncState.cargo);
        btnC.innerHTML = `${icon('briefcase')}<span>${escapeHtml(cSel ? cSel.nome : 'Todos os cargos')}</span>${icon('chevronDown')}`;
        btnC.classList.toggle('active', !!dashFuncState.cargo);
        btnC.onclick = () => openFilterPopover(btnC, {
            options: [{ value: '', label: 'Todos os cargos' }, ...cargoOpcoes(opcoesCargo)],
            value: dashFuncState.cargo, searchable: opcoesCargo.length > 6,
            onPick: v => { dashFuncState.cargo = v; sync(); renderDashTab(); }
        });

        const btnU = document.getElementById('dfUnidade');
        const uSel = dados.unidades.find(u => u.id === dashFuncState.unidade);
        btnU.innerHTML = `${icon('building')}<span>${escapeHtml(uSel ? uSel.nome : 'Todas as unidades')}</span>${icon('chevronDown')}`;
        btnU.classList.toggle('active', !!dashFuncState.unidade);
        btnU.onclick = () => openFilterPopover(btnU, {
            options: [{ value: '', label: 'Todas as unidades' }, ...opcoesUnidade.map(u => ({ value: u.id, label: u.nome }))],
            value: dashFuncState.unidade, searchable: opcoesUnidade.length > 6,
            onPick: v => { dashFuncState.unidade = v; sync(); renderDashTab(); }
        });

        document.getElementById('dfLimpar').onclick = () => {
            dashFuncState.funcionario = ''; dashFuncState.cargo = ''; dashFuncState.unidade = '';
            sync(); renderDashTab();
        };
    };
    sync();
}

// Eixo do período: com ano selecionado, Jan-Dez; em "Dados gerais", um ponto por ano do
// histórico (soma o ano inteiro) — juntar todos os anos em 12 barras de mês misturaria
// janeiros de anos diferentes na mesma barra, o que não responde pergunta nenhuma.
function periodoEixo(ano, dados) {
    if (ano) return { labels: MESES, bucket: iso => (iso || '').startsWith(String(ano)) ? Number(iso.slice(5, 7)) - 1 : -1 };
    const anosSet = new Set();
    (dados.ausencias || []).forEach(a => { if (a.inicio) anosSet.add(Number(a.inicio.slice(0, 4))); });
    (dados.treinamentos || []).forEach(t => { if (t.inicio) anosSet.add(Number(t.inicio.slice(0, 4))); });
    if (!anosSet.size) anosSet.add(new Date().getFullYear());
    const anosOrd = [...anosSet].sort((a, b) => a - b);
    return { labels: anosOrd.map(String), bucket: iso => iso ? anosOrd.indexOf(Number(iso.slice(0, 4))) : -1 };
}

function renderDashFuncionarios(cont, dados) {
    const funcs = dashFuncFiltrados(dados);
    const ativos = funcs.filter(f => !f.demissao);
    const idsFuncs = new Set(funcs.map(f => f.id));
    // '' = dados gerais (todo o histórico, sem recorte de ano); caso contrário, um ano específico
    const ano = dashFuncAno;
    const periodoTxt = ano ? String(ano) : 'todo o período';

    // ---- KPIs ----
    // Tempo médio na empresa: média do tempo de permanência de cada funcionário ativo,
    // da admissão até hoje — não é afetado pelo filtro de ano (é sempre "até agora").
    const tempoMedioMeses = ativos.length
        ? ativos.reduce((s, f) => s + Math.max(0, mesesEntre(f.admissao, hoje())), 0) / ativos.length
        : 0;
    const anosMedio = Math.floor(tempoMedioMeses / 12), mesesResto = Math.round(tempoMedioMeses % 12);
    const tempoMedioTxt = ativos.length ? `${anosMedio}a ${mesesResto}m` : '—';

    const sits = ativos.map(f => situacaoFeriasFunc(f, dados.ausencias)).filter(Boolean);
    const emGozo = ativos.filter(f => feriasVigente(f.id, dados.ausencias)).length;
    const vencidas = sits.filter(s => s.status === 'vencida').length;
    const criticas = sits.filter(s => s.status === 'critica').length;

    const ausAno = dados.ausencias.filter(a => idsFuncs.has(a.funcionarioId) && (!ano || (a.inicio || '').startsWith(String(ano))));

    cont.innerHTML = `
        <div class="grid grid-4">
            <div class="kpi kpi-accent">
                <div class="kpi-ico">${icon('users')}</div>
                <div class="kpi-txt"><span class="kpi-label">Funcionários no recorte</span><span class="kpi-value">${fmtNum(funcs.length)}</span></div>
            </div>
            <div class="kpi kpi-success">
                <div class="kpi-ico">${icon('clock')}</div>
                <div class="kpi-txt"><span class="kpi-label">Tempo médio na empresa</span><span class="kpi-value">${tempoMedioTxt}</span></div>
            </div>
            <div class="kpi kpi-warning">
                <div class="kpi-ico">${icon('sun')}</div>
                <div class="kpi-txt"><span class="kpi-label">Em gozo de férias</span><span class="kpi-value">${fmtNum(emGozo)}</span></div>
            </div>
            <div class="kpi kpi-danger">
                <div class="kpi-ico">${icon('alert')}</div>
                <div class="kpi-txt"><span class="kpi-label">Férias vencidas / críticas</span><span class="kpi-value">${fmtNum(vencidas)} / ${fmtNum(criticas)}</span></div>
            </div>
        </div>

        <div class="grid grid-2 mt-16">
            ${chartCard({ id: 'dfHeadCargo', titulo: 'Headcount por cargo', sub: 'Ativos no recorte de unidade/funcionário atual', info: { oQue: 'Quantidade de funcionários ativos em cada cargo, dentro do recorte de unidade e funcionário selecionado (ignora o próprio filtro de cargo, para permitir comparação).', objetivo: 'Ver rapidamente onde a equipe está concentrada por função.' } })}
            ${chartCard({ id: 'dfHeadUnidade', titulo: 'Headcount por unidade', sub: 'Ativos no recorte de cargo/funcionário atual', info: { oQue: 'Quantidade de funcionários ativos em cada unidade, dentro do recorte de cargo e funcionário selecionado (ignora o próprio filtro de unidade).', objetivo: 'Comparar o tamanho das equipes entre unidades.' } })}
        </div>

        <div class="grid grid-2 mt-16">
            ${chartCard({ id: 'dfFerias', titulo: 'Férias — status atual', sub: 'Recorte filtrado, hoje', info: { oQue: 'Situação de férias de cada funcionário ativo do recorte: em dia, atenção, crítica, vencida ou em gozo agora.', objetivo: 'Priorizar quem precisa programar férias antes de virar passivo (dobra por vencimento, art. 137 CLT).' } })}
            ${chartCard({ id: 'dfTreinos', titulo: 'Treinamentos', sub: ano ? `Horas por mês — ${ano}` : 'Horas por ano — dados gerais', info: { oQue: 'Soma de horas de treinamento (carga horária × participantes do recorte) por período.', objetivo: 'Acompanhar o investimento em capacitação para o recorte selecionado.' } })}
        </div>

        <div class="grid grid-2 mt-16" id="dfAusenciasGrid"></div>

        <div class="grid grid-2 mt-16" id="dfRankAusGrid"></div>

        ${htmlPerfilEquipe('Rec', false)}`;

    // ---- Headcount por cargo (ignora o filtro de cargo) ----
    const funcsSemCargo = dados.funcionarios
        .filter(f => !dashFuncState.funcionario || f.id === dashFuncState.funcionario)
        .filter(f => !dashFuncState.unidade || f.unidadeId === dashFuncState.unidade)
        .filter(f => !f.demissao);
    const linhasCargo = dados.cargos.map(c => ({ label: c.nome, vals: Array(12).fill(funcsSemCargo.filter(f => f.cargoId === c.id).length) }));
    pintarRankingHorizontal('dash', 'dfHeadCargo', linhasCargo, 'num');

    // ---- Headcount por unidade (ignora o filtro de unidade) ----
    const funcsSemUnidade = dados.funcionarios
        .filter(f => !dashFuncState.funcionario || f.id === dashFuncState.funcionario)
        .filter(f => !dashFuncState.cargo || f.cargoId === dashFuncState.cargo)
        .filter(f => !f.demissao);
    const linhasUnidade = dados.unidades.map(u => ({ label: u.nome, vals: Array(12).fill(funcsSemUnidade.filter(f => f.unidadeId === u.id).length) }));
    pintarRankingHorizontal('dash', 'dfHeadUnidade', linhasUnidade, 'num');

    // ---- Férias — status atual (doughnut) ----
    const statusCount = { aquisitivo: 0, atencao: 0, critica: 0, vencida: 0 };
    sits.forEach(s => { if (statusCount[s.status] != null) statusCount[s.status]++; });
    const statusCores = [DV.s5, DV.s2, DV.s3, DV.s8, DV.s6];
    const idxComDado = [emGozo, statusCount.aquisitivo, statusCount.atencao, statusCount.critica, statusCount.vencida]
        .map((v, i) => ({ v, i })).filter(x => x.v > 0);
    const feriasVals = idxComDado.map(x => x.v);
    mkChart('dash', 'dfFerias', idxComDado.length ? {
        type: 'doughnut',
        data: {
            labels: idxComDado.map(x => ['Em gozo', 'Em dia', 'Atenção', 'Crítica', 'Vencida'][x.i]),
            datasets: [{ data: feriasVals, backgroundColor: idxComDado.map(x => statusCores[x.i]), borderColor: '#fff', borderWidth: 2 }]
        },
        options: dvOptsDonut(feriasVals)
    } : {
        type: 'doughnut',
        data: { labels: ['Sem funcionários no recorte'], datasets: [{ data: [1], backgroundColor: [DV.grid], borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { display: true, position: 'bottom' }, tooltip: { enabled: false } } }
    });

    // ---- Treinamentos por período (mês no ano selecionado; por ano em "Dados gerais") ----
    const eixo = periodoEixo(ano, dados);
    const treinoHoras = Array(eixo.labels.length).fill(0);
    dados.treinamentos.forEach(t => {
        const idx = eixo.bucket(t.inicio);
        if (idx < 0) return;
        const parts = (t.participantes || []).filter(id => idsFuncs.has(id)).length;
        treinoHoras[idx] += (Number(t.cargaHoraria) || 0) * parts;
    });
    mkChart('dash', 'dfTreinos', {
        type: 'bar',
        data: { labels: eixo.labels, datasets: [dvBarra('Horas de treinamento', treinoHoras, DV.s2)] },
        options: dvOpts({ fmt: 'num' })
    });

    // ---- Faltas × licenças, empilhado + ranking + legenda-popover ----
    // Própria implementação (não as helpers de resultados.js): aquelas têm o toggle de
    // legenda hardcoded no dono 'resultados' — usá-las aqui registraria os canvases sob o
    // dono errado, e chartDestroy('dash') nunca os destruiria ao trocar de filtro/aba.
    //
    // Com um ano selecionado o eixo já é mensal (periodoEixo acima). Em "dados gerais" o
    // padrão de periodoEixo é por ano — mas aqui o padrão do CARD é por mês (Jan–Dez,
    // somando todos os anos), com o botão _dfAusModo alternando para por ano.
    const eixoAus = ano ? eixo
        : _dfAusModo.modo === 'ano' ? eixo
        : { labels: MESES, bucket: iso => (iso || '').length >= 7 ? Number(iso.slice(5, 7)) - 1 : -1 };
    const porAno = !ano && _dfAusModo.modo === 'ano';

    const valorAus = tipo => eixoAus.labels.map((_, i) => ausAno.filter(a => a.tipo === tipo && eixoAus.bucket(a.inicio) === i)
        .reduce((s, a) => s + (Number(a.dias) || diasEntre(a.inicio, a.retorno)), 0));
    const linhasAus = TIPOS_AUSENCIA.filter(t => t !== 'Férias').map(tipo => ({ label: tipo, vals: valorAus(tipo) }));
    const linhasAusComDado = linhasAus.filter(li => li.vals.some(v => v));

    const btnModoAus = !ano ? `<button class="chart-legenda-btn" id="dfAusModoBtn">${icon('filter')}<span>Empilhar por: ${porAno ? 'ano' : 'mês'}</span></button>` : '';
    const gridAus = document.getElementById('dfAusenciasGrid');
    if (linhasAusComDado.length) {
        const totalGeral = linhasAusComDado.reduce((s, li) => s + li.vals.reduce((a, b) => a + b, 0), 0);
        gridAus.outerHTML = `<div id="dfAusenciasGrid" class="chart-duo">
            ${chartCard({
                id: 'dfAus', titulo: `Faltas e licenças (dias) — ${ano || 'dados gerais'}`,
                sub: `Empilhado por ${porAno ? 'ano' : 'mês'} — clique em “Legenda” para filtrar tipos`,
                acao: `<button class="chart-legenda-btn" data-emp="dfAus">${icon('filter')}<span>Legenda</span></button>${btnModoAus}`,
                total: fmtNum(totalGeral), media: `média ${(totalGeral / eixoAus.labels.length).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}/${porAno ? 'ano' : 'mês'}`
            })}
            ${chartCard({ id: 'dfAusRank', titulo: 'Ranking por tipo', sub: `${ano ? 'No ano' : 'No período'} — maior para o menor`, total: fmtNum(totalGeral) })}
        </div>`;
        pintarEmpilhadoDash('dfAus', 'dfAusRank', linhasAus, eixoAus.labels);
    } else {
        gridAus.outerHTML = `<div id="dfAusenciasGrid" class="grid-2">${emptyState({ icon: 'calendar', title: 'Sem faltas ou licenças', text: `Nenhum registro no recorte atual para ${ano || 'o período'}.` })}</div>`;
    }
    if (btnModoAus) document.getElementById('dfAusModoBtn').onclick = e => openFilterPopover(e.currentTarget, {
        options: [{ value: 'mes', label: 'Mês (Jan–Dez, todos os anos)' }, { value: 'ano', label: 'Ano' }],
        value: _dfAusModo.modo, searchable: false,
        onPick: v => { _dfAusModo.modo = v; renderDashTab(); }
    });

    // ---- Ranking por funcionário: Faltas (empilhado por justificada/injustificada) e
    // Licenças (empilhado por tipo) — lado a lado, barras horizontais com qtd e % ----
    const nomeFunc = fid => dados.funcionarios.find(f => f.id === fid)?.nome || '(removido)';
    const rankPorFuncPorTipo = tipos => {
        const porFunc = {};
        ausAno.filter(a => tipos.includes(a.tipo)).forEach(a => {
            (porFunc[a.funcionarioId] ||= {});
            porFunc[a.funcionarioId][a.tipo] = (porFunc[a.funcionarioId][a.tipo] || 0) + 1;
        });
        // linhas = uma por TIPO (empilha), cada .vals é indexado pelos funcionários ordenados
        // pelo total (maior primeiro) — mesma leitura de pintarRankingHorizontal, mas com pilha.
        const totalPorFunc = fid => tipos.reduce((s, t) => s + (porFunc[fid]?.[t] || 0), 0);
        const funcsOrd = Object.keys(porFunc).sort((a, b) => totalPorFunc(b) - totalPorFunc(a));
        return { funcsOrd, tipos, porFunc };
    };

    const gridRank = document.getElementById('dfRankAusGrid');
    const temFaltas = ausAno.some(a => a.tipo === 'Falta justificada' || a.tipo === 'Falta injustificada');
    const temLicencas = ausAno.some(a => a.tipo && a.tipo !== 'Falta justificada' && a.tipo !== 'Falta injustificada');
    if (temFaltas || temLicencas) {
        gridRank.outerHTML = `<div id="dfRankAusGrid" class="grid grid-2 mt-16">
            ${chartCard({ id: 'dfRankFaltas', titulo: 'Ranking de faltas por funcionário', sub: `Empilhado por justificada/injustificada — ${ano || 'dados gerais'}` })}
            ${chartCard({ id: 'dfRankLic', titulo: 'Ranking de licenças por funcionário', sub: `Empilhado por tipo — ${ano || 'dados gerais'}` })}
        </div>`;
        pintarRankEmpilhadoFunc('dfRankFaltas', rankPorFuncPorTipo(['Falta justificada', 'Falta injustificada']), nomeFunc);
        pintarRankEmpilhadoFunc('dfRankLic', rankPorFuncPorTipo(TIPOS_AUSENCIA.filter(t => t !== 'Férias' && !t.startsWith('Falta'))), nomeFunc);
    } else {
        gridRank.outerHTML = `<div id="dfRankAusGrid" class="mt-16">${emptyState({ icon: 'users', title: 'Sem faltas ou licenças por funcionário', text: `Nenhum registro no recorte atual para ${ano || 'o período'}.` })}</div>`;
    }

    // ---- Perfil da equipe do recorte ----
    pintarPerfilEquipe('dash', 'Rec', perfilEquipe(ativos, dados.cargos));
}

// Empilhado (com legenda-popover, dono 'dash') + ranking horizontal ao lado, sincronizados
// pela mesma seleção de séries — mesmo padrão de pintarEmpilhado em resultados.js, mas sob
// o dono 'dash' para que chartDestroy('dash') realmente destrua os canvases ao trocar de aba.
const _dashEmpVis = {};
function pintarEmpilhadoDash(idEmp, idRank, linhas, labels) {
    if (!_dashEmpVis[idEmp]) _dashEmpVis[idEmp] = new Set(linhas.map((li, i) => String(i)).filter(k => linhas[+k].vals.some(v => v)));
    const visiveis = () => linhas.map((li, i) => ({ li, i })).filter(({ i }) => _dashEmpVis[idEmp].has(String(i)));

    const desenha = () => {
        const vis = visiveis();
        mkChart('dash', idEmp, {
            type: 'bar',
            data: { labels, datasets: vis.map(({ li, i }) => dvBarra(li.label, li.vals, dvCor(i), { borderRadius: 3 })) },
            options: dvOpts({ fmt: 'num', legenda: false, empilhado: true, tooltipExtra: { filter: item => item.parsed.y > 0 } })
        });
        pintarRankingHorizontal('dash', idRank, linhas, 'num', _dashEmpVis[idEmp]);
    };
    desenha();

    const btn = document.querySelector(`.chart-legenda-btn[data-emp="${idEmp}"]`);
    if (btn) btn.onclick = () => openMultiPopover(btn, {
        items: linhas.map((li, i) => ({ key: String(i), label: li.label, cor: dvCor(i) })),
        selected: _dashEmpVis[idEmp],
        onChange: () => desenha(),
        onReset: () => { _dashEmpVis[idEmp] = new Set(linhas.map((li, i) => String(i)).filter(k => linhas[+k].vals.some(v => v))); desenha(); }
    });
}

// Ranking horizontal por funcionário, empilhado por tipo (falta/licença) — mostra qtd e %
// no tooltip. `rank`: {funcsOrd, tipos, porFunc}; `nomeFunc`: fid → nome.
function pintarRankEmpilhadoFunc(id, { funcsOrd, tipos, porFunc }, nomeFunc) {
    if (!funcsOrd.length) {
        const el = document.getElementById(id);
        if (el) el.closest('.chart-card').outerHTML = emptyState({ icon: 'users', title: 'Sem dados', text: 'Nenhum registro no recorte atual.' });
        return;
    }
    const labels = funcsOrd.map(nomeFunc);
    const totalPorFunc = funcsOrd.map(fid => tipos.reduce((s, t) => s + (porFunc[fid]?.[t] || 0), 0));
    const totalGeral = totalPorFunc.reduce((a, b) => a + b, 0);

    mkChart('dash', id, {
        type: 'bar',
        data: {
            labels,
            datasets: tipos.map((tipo, i) => ({
                label: tipo,
                data: funcsOrd.map(fid => porFunc[fid]?.[tipo] || 0),
                backgroundColor: dvCor(i) + 'cc', hoverBackgroundColor: dvCor(i),
                borderRadius: 4, maxBarThickness: 22
            }))
        },
        options: {
            indexAxis: 'y',
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: true, position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, font: { size: 11 } } },
                tooltip: {
                    padding: 10, backgroundColor: '#23233f', cornerRadius: 8,
                    filter: item => item.parsed.x > 0,
                    callbacks: {
                        label: ctx => `${ctx.dataset.label}: ${fmtNum(ctx.parsed.x)}${totalGeral ? ` · ${fmtPct(ctx.parsed.x / totalGeral * 100)}` : ''}`,
                        footer: items => `Total: ${fmtNum(totalPorFunc[items[0].dataIndex])}`
                    }
                }
            },
            scales: {
                x: { stacked: true, beginAtZero: true, grid: { color: DV.grid }, border: { display: false }, ticks: { color: DV.ink, font: { size: 10 }, precision: 0 } },
                y: { stacked: true, grid: { display: false }, ticks: { color: DV.ink, font: { size: 11 }, autoSkip: false } }
            }
        }
    });
}
