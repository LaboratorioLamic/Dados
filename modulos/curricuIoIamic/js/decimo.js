// ===== 13º Salário (Lei 4.090/62, Lei 4.749/65, CF art. 7º VIII) =====
//
// Aba de Lançamentos. O motor de cálculo (avos13, calculo13, situacao13Func, decimoDoMes)
// vive em utils.js, junto das demais réguas derivadas; aqui está só a tela.
//
// Arquitetura espelhada do banco de horas e das férias:
//   - competência DERIVADA (avos recalculados a cada render), nunca gravada
//   - o que se grava é o PAGAMENTO (a parcela), com memória de cálculo congelada
//   - a folha recebe uma coluna própria read-only (`decimoCalc`), não a soma na célula manual

const decimoState = {
    ano: new Date().getFullYear(),
    funcionarios: [], cargos: [], unidades: [], ausencias: [], demissoes: [],
    decimos: [], params: {},
    bhFechamentos: [], bhQuitacoes: [], extras: [],
    // Âncora do 13º: primeiro mês de folha publicado por funcionário — ver anoAncoraFolha.
    folha: {},
    carregado: false
};
let decimoSub = 'programacao';     // programacao | parcelas
let decimoFiltroUnidade = '';
let decimoFiltroEstado = '';       // '' = todos

const decimoPassaFiltro = f => (!decimoFiltroUnidade || f.unidadeId === decimoFiltroUnidade);

// Invalida os caches que dependem de ausências/parcelas. Quem grava férias, demissão ou
// parcela chama isto — sem ele, um adiantamento de 13º lançado na aba Férias não chega ao
// abatimento da 1ª parcela na mesma sessão, e o sistema sugeriria pagar de novo o que já foi
// pago. Função única em vez de flags espalhadas: quem adicionar um cache novo tem um lugar
// só para registrá-lo.
function invalidarCaches13() {
    decimoState.carregado = false;
    if (typeof folhaState !== 'undefined') folhaState.carregado = false;
}

// Contexto de cálculo. `mediaHe13` lê as MESMAS fontes da folha e das férias (banco de horas +
// Extra Banco) — se a média viesse de outro lugar, o sistema teria duas respostas para "quanto
// de extra ele recebeu", e o 13º divergiria das férias do mesmo funcionário.
//
// Período da média = o ano civil da competência (não o aquisitivo de férias): o 13º é do ano.
const decimoCtx = () => ({
    ano: decimoState.ano,
    funcionarios: decimoState.funcionarios,
    cargos: decimoState.cargos,
    ausencias: decimoState.ausencias,
    demissoes: decimoState.demissoes,
    decimos: decimoState.decimos,
    params: decimoState.params,
    // Âncora do 13º (ver anoAncoraFolha em utils.js) — sem isto, uma empresa que adere ao
    // sistema com funcionários antigos veria pendência de 13º de anos anteriores à adoção.
    folha: decimoState.folha,
    mediaHe13: (f, ano) => {
        if (!feriasParams.mediaHe) return 0;
        return mediaHeFerias(f.id, `${ano}-01-01`, `${ano}-12-31`,
            decimoState.bhFechamentos, decimoState.extras, decimoState.bhQuitacoes).media;
    }
});

async function loadDecimoBase(force) {
    if (decimoState.carregado && !force) return;
    const [funcionarios, cargos, unidades, ausencias, demissoes, decimos, params,
           bhFechamentos, bhQuitacoes, extras, folha] = await Promise.all([
        DB.getAll(PATHS.funcionarios), DB.getAll(PATHS.cargos), DB.getAll(PATHS.unidades),
        DB.getAll(PATHS.ausencias), DB.getAll(PATHS.demissoes), DB.getAll(PATHS.decimos),
        DB.getObj(PATHS.parametros),
        // Fontes da média de HE (Súmula 45) — as mesmas da folha
        DB.getAll(PATHS.bancoHorasFechamentos), DB.getAll(PATHS.bancoHorasQuitacoes),
        DB.getAll(PATHS.extraBanco),
        // Âncora do 13º: primeiro mês de folha publicado por funcionário — ver anoAncoraFolha.
        DB.getObj(PATHS.folha)
    ]);
    Object.assign(decimoState, {
        funcionarios, cargos, unidades, ausencias, demissoes, decimos,
        params: params || {}, bhFechamentos, bhQuitacoes, extras, folha: folha || {}, carregado: true
    });
}

// Badge de estado da competência
const DECIMO_ESTADOS = {
    aberto:      { txt: 'Em aberto',   cls: 'badge-info' },
    parcial:     { txt: 'Parcial',     cls: 'badge-ferias' },
    quitado:     { txt: 'Quitado',     cls: 'badge-success' },
    rescisao:    { txt: 'Rescisão',    cls: 'badge-warning' },
    sem_direito: { txt: 'Sem direito', cls: 'badge-neutral' }
};

async function renderDecimo() {
    await loadDecimoBase();
    const cont = document.getElementById('lancContent');
    // formDecimo (lançar/editar/excluir parcela) chama renderDecimo() diretamente ao salvar —
    // inclusive quando aberto a partir da ficha do funcionário (aba Dados → 13º Salário), fora
    // da página de Lançamentos, onde #lancContent não existe.
    if (!cont) {
        const fdCont = document.getElementById('fdContent');
        if (fdCont?.dataset.fdDadosSub === 'decimo13' && fdDadosRefresh) fdDadosRefresh();
        return;
    }
    const anos = new Set([new Date().getFullYear(), decimoState.ano]);
    decimoState.decimos.forEach(d => anos.add(Number(d.ano)));
    decimoState.funcionarios.forEach(f => { if (f.admissao) anos.add(Number(f.admissao.slice(0, 4))); });
    const anosOrd = [...anos].filter(a => a).sort((a, b) => b - a);

    // Fila de pendências no contador da aba: o mesmo sinal que a Programação de férias usa —
    // quem tem parcela vencida ou a vencer dentro da janela de alerta.
    const pend = decimoSituacoes().filter(s => !s.semDireito && s.saldo > 0.01).length;

    cont.innerHTML = `
        <div class="flex-between" style="margin-bottom:14px">
            <div class="tabs tabs-sub" id="dcSubs" style="max-width:440px">
                <div class="tab" data-sub="programacao">${icon('gift')} Competência${pend ? `<span class="tab-count tab-count-alert">${pend}</span>` : ''}</div>
                <div class="tab" data-sub="parcelas">${icon('table')} Parcelas lançadas</div>
            </div>
            <button class="filter-btn" id="dcAno"></button>
        </div>
        <div id="dcPane"></div>`;

    const subs = cont.querySelectorAll('#dcSubs .tab');
    subs.forEach(t => {
        t.classList.toggle('active', t.dataset.sub === decimoSub);
        t.onclick = () => { decimoSub = t.dataset.sub; renderDecimo(); };
    });
    const btnAno = cont.querySelector('#dcAno');
    btnAno.innerHTML = `${icon('calendar')}<span>${decimoState.ano}</span>${icon('chevronDown')}`;
    btnAno.onclick = () => openFilterPopover(btnAno, {
        options: anosOrd.map(a => ({ value: String(a), label: String(a) })),
        value: String(decimoState.ano), searchable: false,
        onPick: v => { decimoState.ano = Number(v); renderDecimo(); }
    });

    if (decimoSub === 'programacao') renderDecimoProgramacao();
    else renderDecimoParcelas();
}

// ---- Situações de todos os funcionários do ano (ordenadas por urgência) ----
function decimoSituacoes() {
    const ctx = decimoCtx();
    return decimoState.funcionarios
        .filter(decimoPassaFiltro)
        .map(f => situacao13Func(f, decimoState.ano, ctx))
        .filter(Boolean)
        .filter(s => !decimoFiltroEstado || s.estado === decimoFiltroEstado)
        // Quem deve mais primeiro: rescisão (prazo curto), depois saldo em aberto.
        .sort((a, b) => {
            const peso = s => s.estado === 'rescisao' ? 0 : s.estado === 'aberto' || s.estado === 'parcial' ? 1 : 2;
            return peso(a) - peso(b) || b.saldo - a.saldo || a.funcionario.nome.localeCompare(b.funcionario.nome);
        });
}

function renderDecimoProgramacao() {
    const pane = document.getElementById('dcPane');
    const sits = decimoSituacoes();
    const podeEditar = can('editar_lancamentos');
    const pz = prazos13(decimoState.ano);
    const h = hoje();

    // `devido` é o que a empresa PAGA nesta competência (ano inteiro para quem é da casa,
    // proporcional para quem entrou ou saiu no ano). `provisao` é quanto já venceu até hoje —
    // número contábil, para dimensionar a reserva mês a mês. Os dois são corretos e respondem
    // perguntas diferentes; trocá-los faria a 1ª parcela sair menor que a lei manda.
    const devido = sits.reduce((s, x) => s + x.devido, 0);
    const provisao = sits.reduce((s, x) => s + x.provisao, 0);
    const pago = sits.reduce((s, x) => s + x.pagoTotal, 0);
    const saldo = sits.reduce((s, x) => s + Math.max(0, x.saldo), 0);
    const adiantado = sits.reduce((s, x) => s + x.adiantamentoFerias, 0);

    const prazoCard = (id, label, data, feitos, total) => {
        const dias = diasEntre(h, data);
        const ok = feitos >= total && total > 0;
        const cls = ok ? 'is-ok' : dias < 0 ? 'is-late' : dias <= decimoParams.alertaDias ? 'is-warn' : '';
        return `<div class="dc-prazo ${cls}">
            <div class="dc-prazo-top">
                <span>${label}</span>
                <strong>${fmtDate(data)}</strong>
            </div>
            <div class="dc-prazo-bar"><div class="dc-prazo-fill" style="width:${total ? Math.round(feitos / total * 100) : 0}%"></div></div>
            <div class="dc-prazo-nums">
                <span>${feitos} de ${total} lançados</span>
                <span class="${dias < 0 && !ok ? 'txt-danger' : ''}">${ok ? 'concluído' : dias < 0 ? `venceu há ${prazoTexto(dias)}` : `${prazoTexto(dias)}`}</span>
            </div>
        </div>`;
    };

    // Variante sem prazo legal único: rescisão vence no acerto de CADA pessoa (não numa data
    // comum), e o resumo geral agrega as duas vias de quitação — nenhuma das duas tem um
    // "dia X" para contar dias restantes. Mesma barra visual, sem a régua de urgência por data.
    const progressoCard = (label, sub, feitos, total) => {
        const ok = feitos >= total && total > 0;
        return `<div class="dc-prazo ${ok ? 'is-ok' : ''}">
            <div class="dc-prazo-top">
                <span>${label}</span>
                <strong>${total ? Math.round(feitos / total * 100) : 0}%</strong>
            </div>
            <div class="dc-prazo-bar"><div class="dc-prazo-fill" style="width:${total ? Math.round(feitos / total * 100) : 0}%"></div></div>
            <div class="dc-prazo-nums">
                <span>${feitos} de ${total} ${sub}</span>
                <span>${ok ? 'concluído' : ''}</span>
            </div>
        </div>`;
    };

    // Quem já tem cada parcela. Adiantamento de férias conta como 1ª: ele É a antecipação
    // da primeira parcela (Lei 4.749 art. 2º §2º) — contar de novo pediria pagamento em dobro.
    const elegiveis = sits.filter(s => !s.semDireito);

    // ---- Barra 1ª parcela: só quem está (ou pode entrar) no fluxo PARCELADO ----
    // Quem já pagou integral não "está em aberto" para a 1ª — nunca vai ter uma, porque a
    // competência foi resolvida de uma vez só. Incluí-lo no total inflaria o denominador com
    // gente que a barra não descreve. Rescisão também sai: tem prazo e fluxo próprios (ver
    // barra de rescisão), não os 30/11 e 20/12 do parcelamento.
    const univ1 = elegiveis.filter(s => s.estado !== 'rescisao' && !(s.estado === 'quitado' && !s.temPrimeira));
    const com1 = univ1.filter(s => s.temPrimeira || s.adiantamentoFerias > 0).length;

    // ---- Barra 2ª parcela: só quem já tem a 1ª publicada ----
    // O universo AQUI é quem já parcelou (tem a 1ª), não todo mundo elegível — quem pagou
    // integral nunca vai ter uma 2ª parcela, e contá-lo geraria um total que a barra não
    // consegue preencher mesmo quando o RH fez tudo certo.
    const univ2 = elegiveis.filter(s => s.temPrimeira || s.adiantamentoFerias > 0);
    const com2 = univ2.filter(s => s.estado === 'quitado').length;

    // ---- Barra rescisão: só quem foi desligado com direito ao proporcional ----
    const univRes = elegiveis.filter(s => s.estado === 'rescisao' || (s.demissao && s.estado === 'quitado'));
    const comRes = univRes.filter(s => s.estado === 'quitado').length;

    // ---- Barra resumo geral: todo mundo com direito × todos quitados, qualquer via ----
    const comQuitados = elegiveis.filter(s => s.estado === 'quitado').length;

    pane.innerHTML = `
        <div class="bh-kpi-row">
            <div class="bh-kpi">
                <span class="bh-kpi-ico tom-custo">${icon('gift')}</span>
                <div class="bh-kpi-txt">
                    <span class="bh-kpi-lbl">13º devido ${decimoState.ano}</span>
                    <span class="bh-kpi-val">${fmtBRL(devido)}</span>
                    <span class="bh-kpi-sub">a pagar na competência · ${elegiveis.length} com direito</span>
                </div>
            </div>
            <div class="bh-kpi">
                <span class="bh-kpi-ico tom-custo">${icon('calendar')}</span>
                <div class="bh-kpi-txt">
                    <span class="bh-kpi-lbl">Provisão contábil</span>
                    <span class="bh-kpi-val">${fmtBRL(provisao)}</span>
                    <span class="bh-kpi-sub">avos já vencidos até hoje</span>
                </div>
            </div>
            <div class="bh-kpi">
                <span class="bh-kpi-ico tom-ok">${icon('check')}</span>
                <div class="bh-kpi-txt">
                    <span class="bh-kpi-lbl">Pago</span>
                    <span class="bh-kpi-val">${fmtBRL(pago)}</span>
                    <span class="bh-kpi-sub">${adiantado > 0 ? `inclui ${fmtBRL(adiantado)} adiantado nas férias` : 'parcelas lançadas'}</span>
                </div>
            </div>
            <div class="bh-kpi">
                <span class="bh-kpi-ico ${saldo > 0 ? 'tom-alerta' : 'tom-ok'}">${icon('money')}</span>
                <div class="bh-kpi-txt">
                    <span class="bh-kpi-lbl">A pagar</span>
                    <span class="bh-kpi-val">${fmtBRL(saldo)}</span>
                    <span class="bh-kpi-sub">saldo em aberto</span>
                </div>
            </div>
        </div>

        <div class="dc-prazos">
            ${prazoCard('p1', '1ª parcela — adiantamento, só FGTS', pz.primeira, com1, univ1.length)}
            ${prazoCard('p2', '2ª parcela — com encargos sobre o total', pz.segunda, com2, univ2.length)}
            ${progressoCard('Rescisão — proporcional no desligamento', 'quitadas', comRes, univRes.length)}
            ${progressoCard('Geral — 13º da competência', 'quitados (qualquer via)', comQuitados, elegiveis.length)}
        </div>

        <div class="table-wrap mt-16">
            <div class="table-toolbar">
                <div class="search-box">${icon('search')}<input class="input" id="dcSearch" placeholder="Buscar funcionário..."></div>
                <button class="filter-btn" id="dcUni"></button>
                <button class="filter-btn" id="dcEstado"></button>
                <div class="grow"></div>
                ${podeEditar ? `<button class="btn btn-secondary" id="dcLote">${icon('users')} Lançar em lote</button>` : ''}
                ${podeEditar ? `<button class="btn btn-primary" id="dcNovo">${icon('plus')} Lançar parcela</button>` : ''}
            </div>
            <div class="table-scroll">
                <table class="table dc-table">
                    <thead><tr>
                        <th>Funcionário</th>
                        <th class="num">Avos</th>
                        <th class="num">Base</th>
                        <th class="num">13º devido</th>
                        <th class="num">Adiant. férias</th>
                        <th class="num">Pago</th>
                        <th class="num">Saldo</th>
                        <th>Situação</th>
                        <th></th>
                    </tr></thead>
                    <tbody id="dcRows">${decimoRowsHtml(sits)}</tbody>
                </table>
            </div>
        </div>`;

    // Filtros no padrão do sistema (filter-btn + popover), como Dashboard e Férias — um
    // <select> nativo estica na toolbar flex e empurra os botões de ação para fora da linha.
    const uni = pane.querySelector('#dcUni');
    const syncUni = () => {
        const u = decimoState.unidades.find(x => x.id === decimoFiltroUnidade);
        uni.innerHTML = `${icon('building')}<span>${escapeHtml(u ? u.nome : 'Todas as unidades')}</span>${icon('chevronDown')}`;
        uni.classList.toggle('active', !!decimoFiltroUnidade);
    };
    uni.onclick = () => openFilterPopover(uni, {
        options: decimoState.unidades.map(u => ({ value: u.id, label: u.nome })),
        value: decimoFiltroUnidade, allLabel: 'Todas as unidades',
        searchable: decimoState.unidades.length > 6,
        onPick: v => { decimoFiltroUnidade = v; renderDecimoProgramacao(); }
    });
    syncUni();

    const est = pane.querySelector('#dcEstado');
    const syncEst = () => {
        const e = DECIMO_ESTADOS[decimoFiltroEstado];
        est.innerHTML = `${icon('filter')}<span>${e ? e.txt : 'Todos os estados'}</span>${icon('chevronDown')}`;
        est.classList.toggle('active', !!decimoFiltroEstado);
    };
    est.onclick = () => openFilterPopover(est, {
        options: Object.entries(DECIMO_ESTADOS).map(([k, v]) => ({ value: k, label: v.txt })),
        value: decimoFiltroEstado, allLabel: 'Todos os estados', searchable: false,
        onPick: v => { decimoFiltroEstado = v; renderDecimoProgramacao(); }
    });
    syncEst();

    const busca = pane.querySelector('#dcSearch');
    busca.oninput = () => {
        const q = busca.value.toLowerCase().trim();
        pane.querySelectorAll('#dcRows tr[data-nome]').forEach(tr => {
            tr.hidden = !!q && !tr.dataset.nome.includes(q);
        });
    };

    const novo = pane.querySelector('#dcNovo');
    if (novo) novo.onclick = () => formDecimo({});
    const lote = pane.querySelector('#dcLote');
    if (lote) lote.onclick = () => formDecimoLote(sits);

    bindDecimoRows(pane);
    bindAvatarFotos(pane);
}

function decimoRowsHtml(sits) {
    if (!sits.length) return `<tr><td colspan="9"><div class="dc-vazio">${icon('gift')} Nenhum funcionário com 13º nesta competência.</div></td></tr>`;
    return sits.map(s => {
        const e = DECIMO_ESTADOS[s.estado];
        const f = s.funcionario;
        return `<tr data-fid="${f.id}" data-nome="${escapeHtml(f.nome.toLowerCase())}" class="is-click">
            <td>
                <div class="dc-func" style="display:flex;gap:8px;align-items:center">
                    ${avatarHtml(f)}
                    <div>
                        <strong>${escapeHtml(f.nome)}</strong>
                        <div class="muted">${escapeHtml(s.cargo?.nome || '—')}${f.demissao ? ` · desligado em ${fmtDate(f.demissao)}` : ''}</div>
                    </div>
                </div>
            </td>
            <td class="num"><span class="dc-avos" title="${s.avos === 12 ? 'Ano completo' : s.estado === 'rescisao' ? 'Proporcional até o desligamento' : 'Proporcional desde a admissão'}">${s.avos}<em>/12</em></span></td>
            <td class="num">${s.semDireito ? '—' : fmtBRL(s.base)}</td>
            <td class="num">${s.semDireito ? '—' : fmtBRL(s.devido)}</td>
            <td class="num">${s.adiantamentoFerias ? `<span class="dc-adiant" title="Adiantado junto das férias — abate a 1ª parcela">${fmtBRL(s.adiantamentoFerias)}</span>` : '—'}</td>
            <td class="num">${s.pagoTotal ? fmtBRL(s.pagoTotal) : '—'}</td>
            <td class="num"><strong class="${s.saldo > 0.01 ? 'txt-warn' : ''}">${s.semDireito ? '—' : fmtBRL(Math.max(0, s.saldo))}</strong></td>
            <td><span class="badge ${e.cls}">${e.txt}</span></td>
            <td class="num">${icon('chevronRight')}</td>
        </tr>`;
    }).join('');
}

function bindDecimoRows(scope) {
    scope.querySelectorAll('#dcRows tr[data-fid]').forEach(tr => {
        tr.onclick = () => janelaDecimo(tr.dataset.fid);
    });
}

// ---- Janela do funcionário: avos mês a mês + parcelas + adiantamentos ----
//
// Espelha a janela de competências das férias e a do ciclo do banco de horas: o RH precisa VER
// a régua que produziu o número, senão o valor é só um total que ninguém confere nem defende.
function janelaDecimo(fid) {
    const f = decimoState.funcionarios.find(x => x.id === fid);
    if (!f) return;
    const s = situacao13Func(f, decimoState.ano, decimoCtx());
    if (!s) return;
    const podeEditar = can('editar_lancamentos');
    const e = DECIMO_ESTADOS[s.estado];

    const mesesHtml = s.meses.map(m => {
        const cls = m.conta ? 'is-on' : m.dias > 0 ? 'is-parcial' : 'is-off';
        const tit = m.dias === 0 ? 'Fora do vínculo'
            : m.conta ? `${m.dias} dias${m.faltas ? ` − ${m.faltas} falta(s)` : ''} → avo integral`
            : `${m.efetivos} dia(s) efetivo(s) — abaixo de ${decimoParams.diasParaAvo}, não gera avo`;
        return `<div class="dc-mes ${cls}" title="${escapeHtml(tit)}">
            <span>${MESES[m.mes]}</span>
            <em>${m.dias === 0 ? '—' : m.conta ? '1/12' : '0'}</em>
        </div>`;
    }).join('');

    const m = openModal({
        titleHtml: dhFuncCardHtml(f, { eyebrow: `13º Salário ${decimoState.ano}` }),
        size: 'modal-lg',
        body: `
            <div class="dc-jan-head">
                <div>
                    <span class="badge ${e.cls}">${e.txt}</span>
                    ${s.semDireito ? `<div class="dc-alerta is-danger mt-8">
                        ${icon('alert')} <div><strong>Sem direito a 13º proporcional</strong>
                        <div class="muted">Desligado por ${escapeHtml(s.motivoSemDireito)} — Súmula 14 do TST e Lei 4.090 art. 3º.</div></div>
                    </div>` : ''}
                </div>
            </div>

            <div class="dc-jan-nums">
                <div><span>Avos</span><strong>${s.avos}/12</strong></div>
                <div><span>Base de cálculo</span><strong>${fmtBRL(s.base)}</strong></div>
                <div><span>13º devido</span><strong>${fmtBRL(s.devido)}</strong></div>
                <div><span>Saldo a pagar</span><strong class="${s.saldo > 0.01 ? 'txt-warn' : ''}">${fmtBRL(Math.max(0, s.saldo))}</strong></div>
            </div>

            <div class="dc-sec">
                <div class="dc-sec-tit">${icon('calendar')} Avos da competência — mês com ${decimoParams.diasParaAvo} dias ou mais conta integral (Lei 4.090 art. 1º §2º)</div>
                <div class="dc-meses">${mesesHtml}</div>
                <div class="dc-nota">${icon('info')} <span>${
                    s.estado === 'rescisao'
                        ? `Proporcional até o desligamento em <strong>${fmtDate(s.funcionario.demissao)}</strong> — só a rescisão fraciona o 13º.`
                        : s.avos === 12
                        ? 'Ano completo: o 13º é integral, independentemente de quantos meses do ano já se passaram.'
                        : `Admitido em <strong>${fmtDate(s.funcionario.admissao)}</strong> — conta a partir da entrada.`
                }${s.avosAcumulados < s.avos ? ` Provisionados até hoje: <strong>${s.avosAcumulados}/12</strong> (${fmtBRL(s.provisao)}).` : ''}</span></div>
            </div>

            <div class="dc-sec">
                <div class="dc-sec-tit">${icon('money')} Composição da base</div>
                <div class="bx-calc">
                    <div class="bx-calc-grid">
                        <span>Salário</span><strong>${fmtBRL(s.salario)}</strong>
                        ${s.insalubridade ? `<span>+ Insalubridade</span><strong>${fmtBRL(s.insalubridade)}</strong>` : ''}
                        ${s.periculosidade ? `<span>+ Periculosidade</span><strong>${fmtBRL(s.periculosidade)}</strong>` : ''}
                        ${s.mediaHe ? `<span>+ Média de HE <em class="bx-calc-nota">(Súmula 45 TST)</em></span><strong>${fmtBRL(s.mediaHe)}</strong>` : ''}
                        <span>= Base</span><strong>${fmtBRL(s.base)}</strong>
                        <span>÷ 12 × ${s.avos} avo${s.avos !== 1 ? 's' : ''}</span><strong>${fmtBRL(s.devido)}</strong>
                        ${s.adiantamentoFerias ? `<span>− Adiantado nas férias</span><strong>−${fmtBRL(s.adiantamentoFerias)}</strong>` : ''}
                        ${s.pagoParcelas ? `<span>− Parcelas lançadas</span><strong>−${fmtBRL(s.pagoParcelas)}</strong>` : ''}
                    </div>
                    <div class="bx-calc-total"><span>Saldo a pagar</span><strong>${fmtBRL(Math.max(0, s.saldo))}</strong></div>
                </div>
            </div>

            ${s.adiantamentoItens.length ? `
            <div class="dc-sec">
                <div class="dc-sec-tit">${icon('sun')} Adiantado junto das férias — abate a 1ª parcela</div>
                <div class="dc-lista">
                    ${s.adiantamentoItens.map(i => `
                        <div class="dc-item is-link">
                            <span class="dc-item-ico">${icon('sun')}</span>
                            <div class="grow">
                                <strong>Adiantamento de 13º</strong>
                                <div class="muted">Pago com as férias iniciadas em ${fmtDate(i.data)} · Lei 4.749 art. 2º §2º</div>
                            </div>
                            <strong class="num">${fmtBRL(i.valor)}</strong>
                        </div>`).join('')}
                </div>
            </div>` : ''}

            <div class="dc-sec">
                <div class="dc-sec-tit">${icon('table')} Parcelas lançadas</div>
                ${s.parcelas.length ? `
                <div class="dc-lista">
                    ${s.parcelas.map(p => `
                        <div class="dc-item is-link" data-parc="${p.id}">
                            <span class="dc-item-ico">${icon('gift')}</span>
                            <div class="grow">
                                <strong>${decimoTipo(p.tipo).label}</strong>
                                <div class="muted">Pago em ${fmtDate(p.data)}${
                                    p.avosParcela != null ? ` · ${fmtNum(p.avosParcela)} avo${p.avosParcela !== 1 ? 's' : ''}` : ''}${
                                    p.encargos ? ` · encargos ${fmtBRL(p.encargos)}` : ' · sem encargos'}${
                                    p.inss ? ` · INSS −${fmtBRL(p.inss)}` : ''}${p.obs ? ` — ${escapeHtml(p.obs)}` : ''}</div>
                            </div>
                            <strong class="num">${fmtBRL(p.bruto)}</strong>
                            ${icon('chevronRight')}
                        </div>`).join('')}
                </div>` : `<div class="dc-vazio">${icon('gift')} Nenhuma parcela lançada nesta competência.</div>`}
            </div>`,
        footer: `
            <button class="btn btn-secondary" data-cancel>Fechar</button>
            ${podeEditar && !s.semDireito && s.saldo > 0.01 ? `<button class="btn btn-primary" data-lancar>${icon('plus')} Lançar parcela</button>` : ''}`
    });

    bindAvatarFotos(m.el);
    const funcCard = m.el.querySelector('.dh-func-card');
    if (funcCard) funcCard.onclick = () => { m.close(); abrirFichaFuncionario(f.id); };

    m.footer.querySelector('[data-cancel]').onclick = m.close;
    const bl = m.footer.querySelector('[data-lancar]');
    if (bl) bl.onclick = () => { m.close(); formDecimo({ funcionarioId: f.id }); };

    m.body.querySelectorAll('[data-parc]').forEach(el => {
        el.onclick = () => {
            const p = s.parcelas.find(x => x.id === el.dataset.parc);
            if (p) { m.close(); formDecimo(p); }
        };
    });
}

// Régua de 12 marcas (mesma linguagem visual em todo o 13º): cheia até `valor`, riscada acima
// de `direito` (avos que a pessoa não tem, ex.: admitida no meio do ano).
function avosReguaHtml(valor, direito) {
    return `<span class="avos-regua">${Array.from({ length: 12 }, (_, i) => {
        const k = i + 1;
        return `<i class="${k > direito ? 'is-fora' : k <= valor ? 'is-on' : 'is-resto'}"></i>`;
    }).join('')}</span>`;
}

// ---- Popover ilustrado das opções de avo quando o direito é ímpar ----
//
// Cada opção mostra a PRÓPRIA régua (não só o número), porque é a régua que o RH confere antes
// de escolher — mesma ideia do resto do módulo: nenhum valor aparece sem a conta por trás.
// Popover próprio (não `openFilterPopover`) porque a linha aqui é mais rica que texto simples.
let _avosPop = null;
function closeAvosPopover() { if (_avosPop) { _avosPop.remove(); _avosPop = null; } }

function openAvosPopover(anchorEl, { opcoes, direito, valorAvo, jaPago, atual, onPick }) {
    closePopover();
    closeAvosPopover();
    const pop = document.createElement('div');
    pop.className = 'popover avos-pop';
    pop.innerHTML = opcoes.map(o => {
        const bruto = Math.max(0, valorAvo * o.valor - jaPago);
        return `
            <div class="avos-pop-item${o.modo === atual ? ' selected' : ''}" data-modo="${o.modo}">
                ${avosReguaHtml(o.valor, direito)}
                <div class="avos-pop-info">
                    <span class="avos-pop-lbl">${fmtNum(o.valor)} avo${o.valor !== 1 ? 's' : ''}${o.modo === 'meio' ? ' <em>(padrão)</em>' : ''}</span>
                    <span class="avos-pop-val">${fmtBRL(bruto)}</span>
                </div>
                ${o.modo === atual ? icon('check') : ''}
            </div>`;
    }).join('');
    document.body.appendChild(pop);

    pop.querySelectorAll('.avos-pop-item').forEach(el => el.onclick = () => {
        closeAvosPopover();
        onPick(el.dataset.modo);
    });

    const r = anchorEl.getBoundingClientRect();
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let x = r.left, y = r.bottom + 6;
    if (x + pw > window.innerWidth - 8) x = r.right - pw;
    if (y + ph > window.innerHeight - 8) y = r.top - ph - 6;
    pop.style.left = `${Math.max(8, x)}px`;
    pop.style.top = `${Math.max(8, y)}px`;
    _avosPop = pop;

    setTimeout(() => {
        document.addEventListener('mousedown', function h(e) {
            if (_avosPop && !_avosPop.contains(e.target) && e.target !== anchorEl && !anchorEl.contains(e.target)) {
                closeAvosPopover();
                document.removeEventListener('mousedown', h);
            }
        });
        document.addEventListener('keydown', function esc(e) {
            if (e.key === 'Escape') { closeAvosPopover(); document.removeEventListener('keydown', esc); }
        });
    });
}

// ---- Formulário de parcela ----
//
// Valor pago e encargos são sempre a conta do sistema, travados (readonly): o RH não negocia
// o 13º parcela a parcela, então não há campo para digitar um valor diferente do sugerido.
// A memória de cálculo (bx-calc) continua visível para auditoria mostrar de onde veio o número.
function formDecimo(d) {
    const isEdit = !!d?.id;
    const ano = d?.ano || decimoState.ano;

    // Select próprio em vez de `selectFuncionario`: aquele esconde demitidos (correto para
    // férias e ASO — quem saiu não tira férias), mas a rescisão do 13º SÓ existe para quem
    // saiu. Sem eles na lista, o proporcional de rescisão seria impossível de lançar pelo
    // botão "Lançar parcela".
    //
    // A lista é quem tem 13º nesta competência: `situacao13Func` já devolve null para
    // estagiário, admissão futura e quem saiu antes do ano — as três exclusões corretas.
    const candidatos = decimoState.funcionarios
        .map(f => ({ f, s: situacao13Func(f, ano, decimoCtx()) }))
        .filter(x => x.s)
        .sort((a, b) => (a.f.nome || '').localeCompare(b.f.nome || ''));
    if (!candidatos.length) return toast(`Nenhum funcionário com 13º em ${ano}.`, 'info');
    const selFunc = `<select class="select" id="dfFunc">${candidatos.map(({ f, s }) =>
        `<option value="${f.id}"${f.id === d?.funcionarioId ? ' selected' : ''}>${escapeHtml(f.nome)}${
            f.demissao ? ` — desligado em ${fmtDate(f.demissao)}` : ''}</option>`).join('')}</select>`;

    const m = openModal({
        title: isEdit ? 'Editar parcela do 13º' : `Lançar parcela do 13º — ${ano}`,
        body: `
            <div class="field"><label>Funcionário <span class="req">*</span></label>${selFunc}</div>

            <div class="field" id="dfParcBox" hidden>
                <label>Parcelamento</label>
                <label class="flex" style="gap:8px;align-items:center;cursor:pointer">
                    <span class="switch"><input type="checkbox" id="dfParcelar"><span class="track"></span></span>
                    <span id="dfParcelarLbl">Pagar em 2 vezes</span>
                </label>
                <div class="field-hint" id="dfTipoHint"></div>
            </div>
            <select class="select" id="dfTipo" hidden>${DECIMO_TIPOS.map(t =>
                `<option value="${t.id}">${t.label}</option>`).join('')}</select>

            <div class="form-row">
                <div class="field">
                    <label>Data do pagamento <span class="req">*</span></label>
                    <input class="input" id="dfData" type="date" value="${d?.data || ''}">
                    <div class="field-hint" id="dfPrazo"></div>
                </div>
                <div class="field" id="dfAvosBox" hidden>
                    <label>Avos nesta parcela</label>
                    <div class="avos-btn is-static" id="dfAvos"></div>
                    <div class="field-hint" id="dfAvosHint"></div>
                </div>
            </div>

            <div class="bx-calc" id="dfCalc"></div>

            <div class="form-row">
                <div class="field">
                    <label>Valor pago <span class="req">*</span></label>
                    <input class="input" id="dfBruto" type="number" step="0.01" min="0" value="${d?.bruto ?? ''}" readonly>
                    <div class="field-hint" id="dfBrutoHint">Calculado automaticamente — não editável.</div>
                </div>
                <div class="field">
                    <label>Encargos (FGTS)</label>
                    <input class="input" id="dfEnc" type="number" step="0.01" min="0" value="${d?.encargos ?? ''}" readonly>
                    <div class="field-hint" id="dfEncHint"></div>
                </div>
            </div>
            <div class="form-row">
                <div class="field">
                    <label>INSS (desconto do empregado)</label>
                    <input class="input" id="dfInss" type="number" step="0.01" min="0" value="${d?.inss ?? ''}" readonly>
                    <div class="field-hint" id="dfInssHint"></div>
                </div>
                <div class="field">
                    <label>Valor líquido</label>
                    <input class="input" id="dfLiquido" type="number" step="0.01" min="0" value="${d?.liquido ?? ''}" readonly>
                    <div class="field-hint">Valor pago − INSS. O que efetivamente chega ao funcionário.</div>
                </div>
            </div>

            <div class="field"><label>Observação</label><textarea class="input" id="dfObs" rows="2" placeholder="Observações adicionais...">${escapeHtml(d?.obs || '')}</textarea></div>`,
        footer: `
            ${isEdit ? `<button class="btn btn-danger" data-del>${icon('trash')} Excluir</button>` : ''}
            <div class="grow"></div>
            <button class="btn btn-secondary" data-cancel>Cancelar</button>
            <button class="btn btn-primary" data-save>${icon('check')} ${isEdit ? 'Salvar' : 'Lançar'}</button>`
    });

    const $ = s => m.body.querySelector(s);
    const funcEl = $('#dfFunc'), tipoEl = $('#dfTipo'), dataEl = $('#dfData');
    const avosEl = $('#dfAvos'), brutoEl = $('#dfBruto'), encEl = $('#dfEnc'), inssEl = $('#dfInss'), liquidoEl = $('#dfLiquido');
    const parcelarEl = $('#dfParcelar');

    let sugerido = null;
    // Avos da 1ª parcela são metade do direito — mas quando o direito é ímpar, a metade não é
    // exata. `avosModoImpar` é a escolha do RH nesse caso, entre três opções (ver `avosOpcoes`
    // no recalc): a metade EXATA — fracionária, 3,5 de 7 avos, por exemplo — que é o padrão por
    // dividir o avo do meio ao meio em vez de jogar o arredondamento inteiro para um lado só;
    // a metade para baixo; ou a metade para cima. Só existe quando há de fato uma fração a
    // decidir; volta ao padrão sempre que o funcionário ou o parcelamento mudam.
    let avosModoImpar = 'meio';
    if (d?.avosParcela != null && d?.avos != null && d.avos % 2 !== 0) {
        const baixo = Math.floor(d.avos / 2);
        avosModoImpar = d.avosParcela === baixo + 1 ? 'cima' : d.avosParcela === baixo ? 'baixo' : 'meio';
    }
    let avosSel = null;
    let avosTeto = 12;
    let avosCtx = { direito: 12, valorAvo: 0, jaPago: 0 };
    // Preenchido pelo `recalc()` só quando o direito é ímpar — as três opções válidas que o
    // popover oferece: {valor, modo}. `null` quando a divisão é exata: aí não há nada para
    // escolher, e a régua volta a ser só visual (sem clique).
    let avosOpcoes = null;

    // Face do "botão" de avos: régua visual + valor. Quando o direito é ímpar (`avosOpcoes`
    // preenchido), o próprio campo vira clicável e abre um popover com as opções — não há
    // mais escolha livre de avos, só a ambiguidade da metade não-inteira.
    const syncAvosBtn = () => {
        const bruto = Math.max(0, avosCtx.valorAvo * avosSel - avosCtx.jaPago);
        avosEl.classList.toggle('is-static', !avosOpcoes);
        avosEl.innerHTML = `
            ${avosReguaHtml(avosSel, avosCtx.direito)}
            <span class="avos-btn-lbl">${fmtNum(avosSel)} <em>de ${avosCtx.direito} avos</em></span>
            <span class="avos-btn-val">${fmtBRL(bruto)}</span>
            ${avosOpcoes ? icon('chevronDown') : ''}`;
        avosEl.onclick = avosOpcoes ? () => openAvosPopover(avosEl, {
            opcoes: avosOpcoes, direito: avosCtx.direito, valorAvo: avosCtx.valorAvo, jaPago: avosCtx.jaPago,
            atual: avosModoImpar,
            onPick: v => { avosModoImpar = v; recalc(); }
        }) : null;
    };

    // Tipo efetivo DEPENDE do estado do funcionário nesta competência — não é mais escolha
    // livre do RH, e sim decorrência de três coisas: se ele já saiu (rescisão), se a 1ª
    // parcela já foi lançada (aí só resta completar com a 2ª) e se a competência já estava
    // QUITADA e o saldo reapareceu (reajuste retroativo — aí é complemento, não uma repetição
    // do pagamento cheio).
    //
    // Desligado → "Rescisão" (ou "Complemento" se a rescisão já foi paga e reajustou depois).
    // O proporcional vence com o acerto, não em 30/11 nem 20/12. Quem está ativo não recebe
    // rescisão — não há rescisão para lançar.
    //
    // Ativo, sem 1ª parcela ainda (nem adiantamento nas férias) e SEM pagamento anterior →
    // o switch "Parcelamento" decide: ligado grava "primeira" (metade dos avos, sem encargos
    // exceto FGTS); desligado grava "integral" (tudo de uma vez, com encargos). Ligar o switch
    // pela primeira vez é exatamente o pedido de não cobrar encargo nesse momento — só nasce no
    // dia em que o RH publica a 1ª parcela, nunca depois.
    //
    // Ativo, já com 1ª parcela (ou adiantamento de férias) → não há mais escolha: só falta a
    // "segunda", que fecha o saldo com os encargos (menos FGTS, que já saiu na 1ª). O switch
    // some porque reperguntar "parcelar?" quando já se parcelou não faz sentido.
    //
    // Ativo, JÁ pagou tudo de uma vez (sem 1ª parcela própria) e o saldo voltou a existir →
    // "Complemento": o integral ANTIGO já teve encargo recolhido, só a diferença leva encargo
    // de novo (ver calculo13).
    const syncTipos = () => {
        const f = decimoState.funcionarios.find(x => x.id === funcEl.value);
        // Situação sem a parcela em edição: reabrir a 1ª parcela não pode fazê-la "já existir"
        // e liberar a 2ª — é a mesma armadilha de `ignorarParcela` no cálculo.
        const s = f ? situacao13Func(f, ano, { ...decimoCtx(), ignorarParcela: d?.id }) : null;
        const parcBox = $('#dfParcBox');

        if (f?.demissao) {
            // Rescisão já paga e o saldo reapareceu (reajuste retroativo após o acerto)? É
            // complemento, não uma segunda "rescisão" — a de baixo já cobrou o integral antigo.
            const jaRescisao = !!s && s.parcelas.some(p => p.tipo === 'rescisao');
            tipoEl.value = jaRescisao && s.saldo > 0.01 && d?.tipo !== 'integral' ? 'complemento' : 'rescisao';
            parcBox.hidden = true;
            return;
        }

        const temPrimeira = !!s && (s.temPrimeira || s.adiantamentoFerias > 0);
        if (temPrimeira && d?.tipo !== 'integral') {
            // Complementa o que falta — nunca mais "primeira" nem escolha de parcelamento.
            tipoEl.value = 'segunda';
            parcBox.hidden = true;
            return;
        }

        // Competência já foi quitada de uma vez (parcela única) e o saldo voltou a existir por
        // reajuste/promoção lançada depois — complemento da diferença, não uma nova "parcela
        // única" (que recobraria encargo sobre o 13º inteiro de novo).
        if (!temPrimeira && s && s.pagoTotal > 0 && s.saldo > 0.01 && d?.tipo !== 'integral') {
            tipoEl.value = 'complemento';
            parcBox.hidden = true;
            return;
        }

        // Ninguém pagou nada ainda (ou está editando a própria 1ª/parcela única): o switch
        // decide. Na edição, herda o tipo gravado; num lançamento novo, começa DESLIGADO
        // (pagamento integral) — é o padrão mais simples e o que quita a competência de uma
        // vez, sem deixar saldo pendente. `dataset.init` evita que o valor seja resetado a
        // cada `recalc()` — só a troca de funcionário (que limpa a flag) ou a mudança manual
        // do switch devem mexer nele.
        parcBox.hidden = false;
        if (parcelarEl.dataset.init !== '1') {
            parcelarEl.checked = isEdit ? d.tipo === 'primeira' : false;
            parcelarEl.dataset.init = '1';
        }
        tipoEl.value = parcelarEl.checked ? 'primeira' : 'integral';
        $('#dfParcelarLbl').textContent = parcelarEl.checked
            ? 'Sim — 1ª parcela agora (metade, sem encargos exceto FGTS), resto na 2ª'
            : 'Não — parcela única (tudo de uma vez, com encargos)';
    };

    const recalc = () => {
        const f = decimoState.funcionarios.find(x => x.id === funcEl.value);
        const tipo = tipoEl.value;
        $('#dfTipoHint').textContent = decimoTipo(tipo).desc;

        // Na edição, a própria parcela não pode contar como "já pago" (ver situacao13Func).
        const s = f ? situacao13Func(f, ano, { ...decimoCtx(), ignorarParcela: d?.id }) : null;
        const calcEl = $('#dfCalc');

        if (!s) {
            calcEl.innerHTML = `<div class="bx-calc-vazio">${icon('info')} Funcionário sem 13º nesta competência (admissão posterior ou estagiário).</div>`;
            sugerido = null;
            return;
        }
        if (s.semDireito) {
            calcEl.innerHTML = `<div class="form-note form-note-vencida">${icon('alert')} <span><strong>Sem direito a 13º.</strong> Desligado por ${escapeHtml(s.motivoSemDireito)} — Súmula 14 do TST.</span></div>`;
            sugerido = null;
            return;
        }

        // ---- Avos: só a 1ª parcela é dimensionável, e mesmo assim só a AMBIGUIDADE da metade
        // ímpar (Lei 4.749 art. 2º). Direito par não tem o que escolher: a régua é só visual.
        $('#dfAvosBox').hidden = tipo !== 'primeira';
        if (tipo === 'primeira') {
            // Avos já antecipados por OUTRA 1ª parcela (raro, mas o RH pode fracionar em duas).
            const jaAvos = s.parcelas.filter(p => p.tipo === 'primeira')
                .reduce((acc, p) => acc + (Number(p.avosParcela) || 0), 0);
            avosTeto = Math.max(1, s.avos - jaAvos);
            // Metade do DIREITO REAL (s.avos), não de 12 fixo — quem tem 10 avos de direito
            // recebe metade de 10 = 5, não 6. Quando é ímpar, a metade cai numa fração: o
            // popover oferece as três opções válidas — a metade EXATA (fracionária, padrão,
            // dividindo o avo do meio ao meio), a metade para baixo ou a metade para cima.
            const metadeBaixo = Math.floor(s.avos / 2);
            const isOdd = s.avos % 2 !== 0;
            avosOpcoes = isOdd && metadeBaixo + 1 <= avosTeto
                ? [{ valor: metadeBaixo, modo: 'baixo' }, { valor: s.avos / 2, modo: 'meio' }, { valor: metadeBaixo + 1, modo: 'cima' }]
                : null;
            if (!avosOpcoes) avosModoImpar = 'meio';
            const valorEscolhido = { baixo: metadeBaixo, meio: s.avos / 2, cima: metadeBaixo + 1 }[avosModoImpar];
            avosSel = Math.min(avosOpcoes ? valorEscolhido : metadeBaixo, avosTeto);
            avosCtx = { direito: s.avos, valorAvo: s.base / 12, jaPago: s.pagoTotal };
            syncAvosBtn();
            $('#dfAvosHint').innerHTML = avosOpcoes
                ? `Direito ímpar de ${s.avos} avos — a metade cai numa fração. Clique nos avos acima para escolher.`
                : `Metade dos avos de direito (Lei 4.749 art. 2º). O restante sai na 2ª parcela.`;
        }

        // Na rescisão o direito é o dos avos até o desligamento (já resolvido em situacao13Func).
        const c = calculo13(s.funcionario, s.cargo, decimoState.params, s.avos, {
            mediaHe: s.mediaHe, tipo, jaPago: s.pagoTotal,
            avosParcela: tipo === 'primeira' ? avosSel : undefined
        });
        sugerido = c;

        // Memória de cálculo: cada parcela visível. Um valor sugerido sem origem é um número
        // que o RH não confere e não defende numa reclamatória. Mesmo componente da tela de
        // férias (bx-calc-grid): a conta do 13º e a das férias têm que ser lidas do mesmo jeito.
        const detalheJaPago = s.adiantamentoFerias > 0 && s.pagoParcelas > 0
            ? `${fmtBRL(s.adiantamentoFerias)} nas férias + ${fmtBRL(s.pagoParcelas)} em parcelas`
            : s.adiantamentoFerias > 0 ? 'adiantado junto das férias (Lei 4.749 art. 2º §2º)' : 'parcelas já lançadas';

        calcEl.innerHTML = `
            <div class="bx-calc-tit">${icon('gift')} ${decimoTipo(tipo).label} — 13º de ${ano}</div>
            <div class="bx-calc-grid">
                <span>Salário</span><strong>${fmtBRL(c.salario)}</strong>
                ${c.insalubridade ? `<span>+ Insalubridade</span><strong>${fmtBRL(c.insalubridade)}</strong>` : ''}
                ${c.periculosidade ? `<span>+ Periculosidade</span><strong>${fmtBRL(c.periculosidade)}</strong>` : ''}
                ${c.mediaHe ? `<span>+ Média de HE <em class="bx-calc-nota">(Súmula 45 TST)</em></span><strong>${fmtBRL(c.mediaHe)}</strong>` : ''}
                <span>= Base</span><strong>${fmtBRL(c.base)}</strong>
                <span>÷ 12 <em class="bx-calc-nota">(valor de 1 avo)</em></span><strong>${fmtBRL(c.valorAvo)}</strong>
                ${tipo === 'primeira'
                    ? `<span>× ${fmtNum(c.avosParcela)} avo${c.avosParcela !== 1 ? 's' : ''} nesta parcela <em class="bx-calc-nota">(de ${c.avos} — o resto sai na 2ª)</em></span><strong>${fmtBRL(c.valorAvo * c.avosParcela)}</strong>`
                    : `<span>× ${c.avos} avo${c.avos !== 1 ? 's' : ''} <em class="bx-calc-nota">(13º integral da competência)</em></span><strong>${fmtBRL(c.integral)}</strong>`}
                ${c.jaPago > 0 ? `<span>− Já pago <em class="bx-calc-nota">(${detalheJaPago})</em></span><strong>−${fmtBRL(c.jaPago)}</strong>` : ''}
            </div>
            <div class="bx-calc-total"><span>Valor desta parcela</span><strong>${fmtBRL(c.bruto)}</strong></div>
            ${c.fgts ? `<div class="bx-calc-total" style="border-top:0;padding-top:0"><span>FGTS ${fmtPct(c.fgtsPct, 2)} <em class="bx-calc-nota">(sobre esta parcela — incide sempre, inclusive na 1ª; custo da empresa)</em></span><strong>${fmtBRL(c.fgts)}</strong></div>` : ''}
            ${c.inss ? `<div class="bx-calc-total" style="border-top:0;padding-top:0"><span>− INSS <em class="bx-calc-nota">(por faixa, sobre o 13º integral — desconto do empregado)</em></span><strong>−${fmtBRL(c.inss)}</strong></div>` : ''}
            ${c.inss ? `<div class="bx-calc-total"><span>Valor líquido</span><strong>${fmtBRL(c.liquido)}</strong></div>` : ''}
            ${dataEl.value ? `<div class="qt-restante">${icon('info')} Cai na folha de <strong>${mesLabel(mesDe(dataEl.value))}</strong>, na coluna <strong>13º (calc)</strong> — definida pela data do pagamento.</div>` : ''}`;

        // Sempre a conta do sistema, sem exceção — parcela única, 1ª ou 2ª: nenhuma delas é
        // negociável para menos, então o campo trava no valor sugerido.
        brutoEl.value = c.bruto ? c.bruto.toFixed(2) : '';
        $('#dfBrutoHint').textContent = tipo === 'integral'
            ? 'Parcela única: quita o total devido.'
            : 'Calculado automaticamente — não editável.';
        encEl.value = c.encargos ? c.encargos.toFixed(2) : '';
        $('#dfEncHint').textContent = decimoTipo(tipo).encargos
            ? `FGTS ${c.fgtsPct}% sobre a parcela — custo da empresa.`
            : c.fgts ? `Adiantamento: só FGTS (${c.fgtsPct}% sobre a parcela).`
            : 'A 1ª parcela é adiantamento: sem encargos.';
        inssEl.value = c.inss ? c.inss.toFixed(2) : '';
        $('#dfInssHint').textContent = tipo === 'complemento'
            ? `INSS por faixa sobre a diferença (${fmtBRL(c.bruto)}) — o INSS da parte já paga foi retido na época.`
            : decimoTipo(tipo).encargos
            ? `INSS por faixa sobre ${fmtBRL(c.integral)} (13º integral) — desconto do empregado, não sobre a parcela.`
            : 'A 1ª parcela é adiantamento: sem INSS (Lei 4.749 art. 2º §2º).';
        liquidoEl.value = c.liquido != null ? c.liquido.toFixed(2) : '';

        // Prazo legal do tipo escolhido.
        const pz = prazos13(ano);
        const alvo = tipo === 'primeira' ? pz.primeira : tipo === 'segunda' || tipo === 'integral' ? pz.segunda : null;
        const pe = $('#dfPrazo');
        if (alvo && dataEl.value) {
            const atraso = diasEntre(alvo, dataEl.value);
            pe.textContent = atraso > 0 ? `⚠ ${atraso} dia(s) após o prazo legal (${fmtDate(alvo)})` : `Prazo legal: ${fmtDate(alvo)}`;
            pe.className = 'field-hint' + (atraso > 0 ? ' is-danger' : '');
        } else if (alvo) {
            pe.textContent = `Prazo legal: ${fmtDate(alvo)}`;
            pe.className = 'field-hint';
        } else if (tipo === 'complemento') {
            pe.textContent = 'Diferença retroativa: sem prazo legal próprio — regularize assim que o reajuste for aprovado.';
            pe.className = 'field-hint';
        } else {
            pe.textContent = 'Rescisão: pago junto do acerto.';
            pe.className = 'field-hint';
        }
    };

    // Trocar de funcionário pode mudar QUAIS parcelas existem (ativo × desligado), então os
    // tipos são remontados antes do recálculo. Zera também a escolha de parcelamento: o
    // switch deve voltar ao padrão para a nova pessoa, não herdar a anterior.
    funcEl.onchange = () => { avosModoImpar = 'meio'; parcelarEl.dataset.init = ''; syncTipos(); recalc(); };
    // Switch "Parcelamento": liga/desliga entre 1ª parcela (metade, sem encargos exceto
    // FGTS) e parcela única (tudo de uma vez, com encargos).
    parcelarEl.onchange = () => { avosModoImpar = 'meio'; syncTipos(); recalc(); };
    dataEl.onchange = recalc;
    syncTipos();
    recalc();

    m.footer.querySelector('[data-cancel]').onclick = m.close;
    const del = m.footer.querySelector('[data-del]');
    if (del) del.onclick = async () => {
        if (!await confirmDialog({
            title: 'Excluir parcela',
            message: 'A parcela sai da folha do mês em que foi paga — a coluna 13º (calc) é derivada e se corrige sozinha. Excluir?',
            confirmText: 'Excluir', danger: true
        })) return;
        await DB.remove(PATHS.decimos, d.id);
        m.close();
        toast('Parcela excluída.');
        await loadDecimoBase(true);
        invalidarCaches13();   // folha (coluna derivada) + situação do 13º
        renderDecimo();
    };

    m.footer.querySelector('[data-save]').onclick = async () => {
        const fid = funcEl.value;
        const data = dataEl.value;
        if (!fid || !data) return toast('Funcionário e data do pagamento são obrigatórios.', 'error');
        if (!sugerido) return toast('Este funcionário não tem 13º a lançar nesta competência.', 'error');
        // Sempre o valor calculado — o campo é readonly, não há mais negociação por lançamento.
        const bruto = sugerido.bruto;
        if (!(bruto > 0)) return toast('Informe o valor pago.', 'error');

        // Saldo SEM a parcela em edição: senão a própria parcela contaria contra si mesma e o
        // alerta dispararia ao reabrir um lançamento que não mudou de valor.
        const s = situacao13Func(decimoState.funcionarios.find(x => x.id === fid), ano,
            { ...decimoCtx(), ignorarParcela: isEdit ? d.id : null });
        // Alerta, não bloqueio: pagar acima do devido é decisão do RH (acordo, correção), mas
        // não pode passar despercebido. Vale na edição também — aumentar o valor de uma
        // parcela existente estoura o saldo do mesmo jeito que criar uma nova.
        if (bruto > s.saldo + 0.01) {
            const ok = await confirmDialog({
                title: 'Valor acima do saldo',
                message: `O saldo devido é ${fmtBRL(Math.max(0, s.saldo))} e você está lançando ${fmtBRL(bruto)}. Confirmar assim mesmo?`,
                confirmText: 'Lançar'
            });
            if (!ok) return;
        }

        const reg = {
            funcionarioId: fid,
            ano: Number(ano),
            tipo: tipoEl.value,
            data,
            bruto: Number(bruto.toFixed(2)),
            encargos: Number(Number(encEl.value || 0).toFixed(2)),
            inss: Number(Number(inssEl.value || 0).toFixed(2)),
            liquido: Number(Number(liquidoEl.value || 0).toFixed(2)),
            // `avos` = o direito da competência; `avosParcela` = quantos esta parcela paga.
            // Sem o segundo, a 2ª parcela não saberia quantos avos a 1ª já cobriu.
            avos: sugerido.avos,
            avosParcela: sugerido.avosParcela,
            obs: $('#dfObs').value.trim(),
            // Memória de cálculo CONGELADA: promoção posterior não reescreve o que já foi pago.
            // Mesma regra do lançamento de férias e da quitação do banco de horas. As faixas de
            // INSS vigentes no momento também ficam congeladas — mudar a tabela depois não pode
            // reescrever a memória de cálculo de uma parcela já paga.
            calculo: {
                base: sugerido.base, salario: sugerido.salario,
                insalubridade: sugerido.insalubridade, periculosidade: sugerido.periculosidade, mediaHe: sugerido.mediaHe,
                integral: sugerido.integral, avos: sugerido.avos,
                avosParcela: sugerido.avosParcela, valorAvo: sugerido.valorAvo,
                jaPago: sugerido.jaPago, sugerido: sugerido.bruto,
                fgtsPct: sugerido.fgtsPct, fgts: sugerido.fgts,
                inss: sugerido.inss, liquido: sugerido.liquido,
                inssFaixas: decimoState.params.inssFaixas || INSS_FAIXAS_PADRAO
            }
        };
        await DB.save(PATHS.decimos, isEdit ? d.id : null, reg);

        m.close();
        toast(isEdit ? 'Parcela atualizada.' : 'Parcela lançada — já consta na folha do mês.');
        await loadDecimoBase(true);
        invalidarCaches13();   // folha (coluna derivada) + situação do 13º
        renderDecimo();
    };
}

// ---- Lançamento em LOTE ----
//
// Sem isto o RH digitaria uma parcela por funcionário em novembro — e o 13º é justamente a
// verba que todo mundo recebe no mesmo dia. Cada linha vem com o sugerido já calculado e é
// desmarcável: o lote propõe, o RH decide.
//
// Quem já está quitado ou sem direito não aparece: oferecer a linha convidaria ao pagamento
// em dobro, que é exatamente o risco que o abatimento do adiantamento existe para evitar.
function formDecimoLote(sits) {
    const pz = prazos13(decimoState.ano);
    const h = hoje();

    // Adiantamento das férias conta como primeira (Lei 4.749 art. 2º §2º).
    const temPrim = s => s.temPrimeira || s.adiantamentoFerias > 0;
    // Complemento = competência já quitada de vez (sem 1ª parcela própria) cujo saldo voltou a
    // existir por reajuste retroativo. É caso individual, como a rescisão: misturar num lote
    // com "parcela única" cobraria encargo sobre o 13º inteiro de novo (ver calculo13).
    const ehComplemento = s => !temPrim(s) && s.pagoTotal > 0;

    // Elegíveis do lote: quem ainda deve e não é rescisão nem complemento (ambos se lançam
    // individualmente).
    const eleg = sits.filter(s => !s.semDireito && s.saldo > 0.01 && s.estado !== 'rescisao' && !ehComplemento(s));

    // "2ª parcela" só é oferecida quando ALGUÉM já tem a primeira — mesma regra do formulário
    // individual, aplicada ao conjunto: sem nenhuma primeira lançada, uma "2ª parcela" em
    // lote seria a primeira com nome errado, cobrando encargos que ainda não incidem e num
    // prazo (20/12) que não é o que se aplica.
    const tiposLote = DECIMO_TIPOS.filter(t =>
        t.id === 'rescisao' || t.id === 'complemento' ? false
        : t.id === 'segunda' ? eleg.some(temPrim)
        : true);

    // Padrão: a parcela cujo prazo está mais próximo e ainda não passou — desde que ela exista
    // na lista (senão o select abriria numa opção que não está lá).
    const prefer = h <= pz.primeira ? 'primeira' : 'segunda';
    const tipoPadrao = tiposLote.some(t => t.id === prefer) ? prefer : tiposLote[0]?.id;

    const m = openModal({
        title: `Lançar 13º em lote — ${decimoState.ano}`,
        size: 'modal-lg',
        body: `
            <div class="form-row">
                <div class="field">
                    <label>Parcela <span class="req">*</span></label>
                    <select class="select" id="dlTipo"${tiposLote.length === 1 ? ' disabled' : ''}>
                        ${tiposLote.map(t =>
                            `<option value="${t.id}"${t.id === tipoPadrao ? ' selected' : ''}>${t.label}</option>`).join('')}
                    </select>
                    <div class="field-hint" id="dlHint"></div>
                </div>
                <div class="field">
                    <label>Data do pagamento <span class="req">*</span></label>
                    <input class="input" id="dlData" type="date" value="${tipoPadrao === 'primeira' ? pz.primeira : pz.segunda}">
                    <div class="field-hint">Mês do pagamento define em qual folha o valor entra.</div>
                </div>
            </div>
            <div class="field" id="dlAvosBox" hidden>
                <label>Avos na 1ª parcela</label>
                <div class="avos-btn is-static" id="dlAvos"></div>
                <div class="field-hint">Metade dos avos de cada um — padrão fixo (Lei 4.749 art. 2º), sem alteração manual. Quem tem menos avos de direito recebe a metade do que tem.</div>
            </div>
            <div class="dc-lote-head">
                <label class="flex" style="gap:8px;align-items:center;cursor:pointer">
                    <input type="checkbox" id="dlAll" checked><span>Selecionar todos</span>
                </label>
                <div class="grow"></div>
                <div class="dc-lote-tot" id="dlTot"></div>
            </div>
            <div class="dc-lote" id="dlLista"></div>`,
        footer: `
            <button class="btn btn-secondary" data-cancel>Cancelar</button>
            <button class="btn btn-primary" data-save>${icon('check')} Lançar selecionados</button>`
    });

    const $ = s => m.body.querySelector(s);
    const tipoEl = $('#dlTipo'), dataEl = $('#dlData'), listaEl = $('#dlLista'), avosEl = $('#dlAvos');
    let linhas = [];

    // No lote os avos valem para várias pessoas com direitos DIFERENTES — cada uma recebe
    // metade do PRÓPRIO direito (5 de 10, 6 de 12...), não um corte único aplicado a todas. Por
    // isso não há mais uma única `avosSel` global: `calculo13` calcula a metade de cada linha
    // (fallback `Math.floor(a/2)` quando `avosParcela` não é passado — ver utils.js). A régua
    // do cabeçalho é só ilustrativa (12 avos cheios, mostrando a proporção "metade"); o valor
    // real de cada pessoa aparece na lista abaixo.
    const syncAvosBtn = () => {
        avosEl.innerHTML = `
            <span class="avos-regua">
                ${Array.from({ length: 12 }, (_, i) =>
                    `<i class="${i + 1 <= 6 ? 'is-on' : 'is-resto'}"></i>`).join('')}
            </span>
            <span class="avos-btn-lbl">Metade do direito de cada um<span class="avos-tag">metade</span></span>`;
    };

    const montar = () => {
        const tipo = tipoEl.value;
        $('#dlHint').textContent = decimoTipo(tipo).desc;
        // Avos só dimensionam a 1ª parcela — as demais fecham o que falta.
        $('#dlAvosBox').hidden = tipo !== 'primeira';
        // `eleg` já excluiu quitados, sem direito e rescisões (ver o topo da função).
        //
        // Numa 2ª parcela, só entra quem JÁ TEM a primeira: para quem não tem, a próxima
        // parcela é a primeira, não a segunda — lançá-la como segunda cobraria encargos que
        // ainda não incidem. Quem adiantou nas férias tem a primeira cumprida (Lei 4.749
        // art. 2º §2º) e entra normalmente.
        linhas = eleg
            .filter(s => tipo !== 'segunda' || temPrim(s))
            .map(s => {
                const c = calculo13(s.funcionario, s.cargo, decimoState.params, s.avos, {
                    mediaHe: s.mediaHe, tipo, jaPago: s.pagoTotal
                    // Sem `avosParcela`: `calculo13` usa metade do direito INDIVIDUAL (`s.avos`)
                    // de cada linha — quem tem 10 avos recebe metade de 10 (5), não 6.
                });
                return { sit: s, calc: c };
            })
            .filter(x => x.calc.bruto > 0.01);

        listaEl.innerHTML = linhas.length ? linhas.map((x, i) => `
            <label class="dc-lote-item">
                <input type="checkbox" data-i="${i}" checked>
                <div class="grow">
                    <strong>${escapeHtml(x.sit.funcionario.nome)}</strong>
                    <div class="muted">${tipo === 'primeira' ? `${x.calc.avosParcela} de ${x.calc.avos} avos` : `${x.calc.avos}/12 avos`} · base ${fmtBRL(x.calc.base)}${x.sit.adiantamentoFerias > 0 ? ` · ${fmtBRL(x.sit.adiantamentoFerias)} já adiantado nas férias` : ''}</div>
                </div>
                <div class="dc-lote-val">
                    <strong>${fmtBRL(x.calc.bruto)}</strong>
                    ${x.calc.fgts ? `<em>+ ${fmtBRL(x.calc.fgts)} FGTS</em>` : ''}
                    ${x.calc.inss ? `<em>− ${fmtBRL(x.calc.inss)} INSS</em>` : ''}
                </div>
            </label>`).join('')
            : `<div class="dc-vazio">${icon('check')} ${tipo === 'segunda'
                ? 'Ninguém com 1ª parcela lançada e saldo em aberto — a 2ª parcela complementa a primeira.'
                : 'Ninguém com saldo em aberto nesta competência.'}</div>`;

        listaEl.querySelectorAll('input[data-i]').forEach(cb => cb.onchange = totalizar);
        totalizar();
    };

    const selecionados = () => [...listaEl.querySelectorAll('input[data-i]:checked')].map(cb => linhas[Number(cb.dataset.i)]);

    const totalizar = () => {
        const sel = selecionados();
        const t = sel.reduce((s, x) => s + x.calc.bruto, 0);
        const e = sel.reduce((s, x) => s + x.calc.encargos, 0);
        const i = sel.reduce((s, x) => s + x.calc.inss, 0);
        $('#dlTot').innerHTML = `<span>${sel.length} selecionado(s)</span> <strong>${fmtBRL(t)}</strong>${e ? ` <em>+ ${fmtBRL(e)} encargos</em>` : ''}${i ? ` <em>− ${fmtBRL(i)} INSS</em>` : ''}`;
    };

    tipoEl.onchange = () => {
        dataEl.value = tipoEl.value === 'primeira' ? pz.primeira : pz.segunda;
        montar();
    };
    $('#dlAll').onchange = e => {
        listaEl.querySelectorAll('input[data-i]').forEach(cb => cb.checked = e.target.checked);
        totalizar();
    };
    syncAvosBtn();
    montar();

    m.footer.querySelector('[data-cancel]').onclick = m.close;
    m.footer.querySelector('[data-save]').onclick = async () => {
        const sel = selecionados();
        if (!sel.length) return toast('Selecione ao menos um funcionário.', 'error');
        if (!dataEl.value) return toast('Informe a data do pagamento.', 'error');

        const ok = await confirmDialog({
            title: 'Confirmar lançamento em lote',
            message: `${sel.length} parcela(s) de ${decimoTipo(tipoEl.value).label} serão lançadas, totalizando ${fmtBRL(sel.reduce((s, x) => s + x.calc.bruto, 0))}. Os valores entram na folha de ${MESES_FULL[Number(dataEl.value.slice(5, 7)) - 1]}. Confirmar?`,
            confirmText: 'Lançar'
        });
        if (!ok) return;

        for (const x of sel) {
            await DB.save(PATHS.decimos, null, {
                funcionarioId: x.sit.funcionario.id,
                ano: Number(decimoState.ano),
                tipo: tipoEl.value,
                data: dataEl.value,
                bruto: x.calc.bruto,
                encargos: x.calc.encargos,
                inss: x.calc.inss,
                liquido: x.calc.liquido,
                avos: x.calc.avos,
                avosParcela: x.calc.avosParcela,
                obs: '',
                calculo: {
                    base: x.calc.base, salario: x.calc.salario,
                    insalubridade: x.calc.insalubridade, periculosidade: x.calc.periculosidade, mediaHe: x.calc.mediaHe,
                    integral: x.calc.integral, avos: x.calc.avos,
                    avosParcela: x.calc.avosParcela, valorAvo: x.calc.valorAvo,
                    jaPago: x.calc.jaPago, sugerido: x.calc.bruto,
                    fgtsPct: x.calc.fgtsPct, fgts: x.calc.fgts,
                    inss: x.calc.inss, liquido: x.calc.liquido,
                    inssFaixas: decimoState.params.inssFaixas || INSS_FAIXAS_PADRAO
                }
            });
        }
        m.close();
        toast(`${sel.length} parcela(s) lançada(s) — já constam na folha.`);
        await loadDecimoBase(true);
        invalidarCaches13();
        renderDecimo();
    };
}

// ---- Diagnóstico para o sino de notificações ----
//
// Mesma assinatura de diagnosticoAso/diagnosticoBh: uma linha por unidade, com as pessoas
// dentro. O sino é sobre PRAZO — 30/11 e 20/12 são datas legais com multa administrativa,
// e a única coisa pior que pagar 13º atrasado é descobrir isso em dezembro.
//
// Só alerta dentro da janela do alerta ou depois do prazo: um aviso de 13º em março seria
// ruído por oito meses e treinaria o RH a ignorar o sino.
function diagnosticoDecimo(u, funcionarios, ctx) {
    const ano = new Date().getFullYear();
    const h = hoje();
    const pz = prazos13(ano);
    const c = ctx || {};

    const pessoas = [];
    funcionarios.filter(f => f.unidadeId === u.id).forEach(f => {
        const s = situacao13Func(f, ano, c);
        if (!s || s.semDireito || s.saldo <= 0.01) return;

        // Rescisão pendente: o proporcional vence com o acerto, não em dezembro.
        if (s.estado === 'rescisao') {
            pessoas.push({ funcionarioId: f.id, nome: f.nome, status: 'rescisao', label: 'rescisão a pagar', valor: s.saldo });
            return;
        }
        // 1ª parcela: cobra só quem não tem nada — nem parcela, nem adiantamento nas férias.
        const jaTem1 = s.temPrimeira || s.adiantamentoFerias > 0;
        const d1 = diasEntre(h, pz.primeira);
        if (!jaTem1 && d1 <= decimoParams.alertaDias) {
            pessoas.push({
                funcionarioId: f.id,
                nome: f.nome,
                status: d1 < 0 ? 'vencido' : 'critico',
                label: d1 < 0 ? `1ª venceu há ${prazoTexto(d1)}` : `1ª em ${prazoTexto(d1)}`,
                valor: s.devido / 2
            });
            return;
        }
        // 2ª parcela: cobra quem ainda tem saldo.
        const d2 = diasEntre(h, pz.segunda);
        if (d2 <= decimoParams.alertaDias) {
            pessoas.push({
                funcionarioId: f.id,
                nome: f.nome,
                status: d2 < 0 ? 'vencido' : 'critico',
                label: d2 < 0 ? `2ª venceu há ${prazoTexto(d2)}` : `2ª em ${prazoTexto(d2)}`,
                valor: s.saldo
            });
        }
    });

    if (!pessoas.length) return null;
    const ordem = { vencido: 0, rescisao: 1, critico: 2 };
    pessoas.sort((a, b) => ordem[a.status] - ordem[b.status] || b.valor - a.valor);
    return {
        nome: u.nome,
        pessoas,
        vencidos: pessoas.filter(p => p.status === 'vencido').length,
        rescisoes: pessoas.filter(p => p.status === 'rescisao').length,
        criticos: pessoas.filter(p => p.status === 'critico').length,
        total: pessoas.reduce((s, p) => s + p.valor, 0)
    };
}

const DECIMO_STATUS = {
    vencido:  { cls: 'badge-danger',  dot: 'st-vencida' },
    rescisao: { cls: 'badge-warning', dot: 'st-critica' },
    critico:  { cls: 'badge-warning', dot: 'st-critica' }
};

// ---- Sub-aba: parcelas lançadas ----
function renderDecimoParcelas() {
    const pane = document.getElementById('dcPane');
    const podeEditar = can('editar_lancamentos');
    const doAno = decimoState.decimos
        .filter(d => Number(d.ano) === Number(decimoState.ano))
        .sort((a, b) => (b.data || '').localeCompare(a.data || ''));

    const func = fid => decimoState.funcionarios.find(f => f.id === fid);
    const nome = fid => func(fid)?.nome || '—';
    const totalBruto = doAno.reduce((s, d) => s + (Number(d.bruto) || 0), 0);
    const totalEnc = doAno.reduce((s, d) => s + (Number(d.encargos) || 0), 0);
    const totalInss = doAno.reduce((s, d) => s + (Number(d.inss) || 0), 0);

    pane.innerHTML = `
        <div class="table-wrap">
            <div class="table-toolbar">
                <div class="search-box">${icon('search')}<input class="input" id="dpSearch" placeholder="Buscar funcionário..."></div>
                <div class="grow"></div>
                ${podeEditar ? `<button class="btn btn-primary" id="dpNovo">${icon('plus')} Lançar parcela</button>` : ''}
            </div>
            <div class="table-scroll">
                <table class="table">
                    <thead><tr>
                        <th>Funcionário</th><th>Parcela</th><th>Pagamento</th>
                        <th class="num">Avos</th><th class="num">Valor</th><th class="num">Encargos</th><th class="num">INSS</th><th></th>
                    </tr></thead>
                    <tbody id="dpRows">
                        ${doAno.length ? doAno.map(d => `
                            <tr data-id="${d.id}" data-nome="${escapeHtml(nome(d.funcionarioId).toLowerCase())}" class="is-click">
                                <td>
                                    <div class="flex" style="gap:8px;align-items:center">
                                        ${func(d.funcionarioId) ? avatarHtml(func(d.funcionarioId)) : `<div class="avatar">?</div>`}
                                        <strong>${escapeHtml(nome(d.funcionarioId))}</strong>
                                    </div>
                                </td>
                                <td><span class="badge ${d.tipo === 'rescisao' ? 'badge-warning' : 'badge-info'}">${decimoTipo(d.tipo).label}</span></td>
                                <td>${fmtDate(d.data)}</td>
                                <td class="num">${d.avosParcela != null && d.avosParcela !== d.avos
                                    ? `${fmtNum(d.avosParcela)} de ${d.avos}` : `${d.avos ?? '—'}/12`}</td>
                                <td class="num"><strong>${fmtBRL(d.bruto)}</strong></td>
                                <td class="num">${d.encargos ? fmtBRL(d.encargos) : '—'}</td>
                                <td class="num">${d.inss ? fmtBRL(d.inss) : '—'}</td>
                                <td class="num">${icon('chevronRight')}</td>
                            </tr>`).join('')
                        : `<tr><td colspan="8"><div class="dc-vazio">${icon('gift')} Nenhuma parcela lançada em ${decimoState.ano}.</div></td></tr>`}
                    </tbody>
                    ${doAno.length ? `<tfoot><tr>
                        <td colspan="4"><strong>Total</strong></td>
                        <td class="num"><strong>${fmtBRL(totalBruto)}</strong></td>
                        <td class="num"><strong>${fmtBRL(totalEnc)}</strong></td>
                        <td class="num"><strong>${fmtBRL(totalInss)}</strong></td>
                        <td></td>
                    </tr></tfoot>` : ''}
                </table>
            </div>
        </div>`;

    const busca = pane.querySelector('#dpSearch');
    busca.oninput = () => {
        const q = busca.value.toLowerCase().trim();
        pane.querySelectorAll('#dpRows tr[data-nome]').forEach(tr => {
            tr.hidden = !!q && !tr.dataset.nome.includes(q);
        });
    };
    const novo = pane.querySelector('#dpNovo');
    if (novo) novo.onclick = () => formDecimo({});
    bindAvatarFotos(pane);
    pane.querySelectorAll('#dpRows tr[data-id]').forEach(tr => {
        tr.onclick = () => {
            const d = doAno.find(x => x.id === tr.dataset.id);
            if (d) formDecimo(d);
        };
    });
}

