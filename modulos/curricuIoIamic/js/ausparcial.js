// ===== Ausências parciais — saída no meio do turno / saída antecipada =====
//
// Arquivo próprio pelo mesmo motivo do ASO e da CAT: lancamentos.js já passa de 2.900 linhas.
//
// O que este módulo registra NÃO é falta: o dia foi trabalhado, faltaram horas dele. O
// funcionário sai das 12h às 14h e volta, ou sai mais cedo — sempre com uma declaração.
//
// Por que não entra em rh_ausencias: lá a unidade é o DIA, no intervalo [inicio, retorno) com
// retorno exclusivo (ver ausenciaVigente em utils.js). Uma ausência que começa e termina no
// mesmo dia daria `dias = 0`, e os gráficos de dias perdidos do Dashboard e dos Resultados
// leriam esse zero como "ninguém faltou". Fato de natureza diferente, path diferente.
//
// Por que não entra direto na grade do banco de horas: a coluna "Atraso" é um total mensal
// digitado à mão — não guarda o dia, o horário, o motivo nem a declaração. Ela responde
// "quantas horas faltaram no mês"; esta aba responde "que dia foi isso, por quê, e cadê o
// papel". O elo entre as duas é o campo `parcialMin`, escrito por apRecalcBanco.
//
// O destino das horas é decisão do RH, lançamento a lançamento (`tratamento`), porque a mesma
// declaração é abonada num caso e descontada em outro conforme o acordo da empresa. Só
// `Descontar no banco de horas` toca rh_banco_horas.

const MOTIVOS_AUS_PARCIAL = [
    'Consulta médica',
    'Consulta odontológica',
    'Exame / procedimento',
    'Acompanhamento de familiar',
    'Compromisso escolar',
    'Assunto pessoal',
    'Convocação judicial / eleitoral',
    'Outro'
];

const TRAT_ABONADO = 'Abonado';
const TRAT_BANCO = 'Descontar no banco de horas';
const TRAT_COMPENSAR = 'Compensar';
const TRATAMENTOS_AUS_PARCIAL = [TRAT_ABONADO, TRAT_BANCO, TRAT_COMPENSAR];

const TRAT_DESC = {
    [TRAT_ABONADO]: 'Declaração aceita — as horas não são cobradas nem descontadas.',
    [TRAT_BANCO]: 'As horas entram como atraso no banco de horas do mês e reduzem o saldo do ciclo.',
    [TRAT_COMPENSAR]: 'Combinado de reposição fora do banco — fica registrado, mas não move saldo nenhum.'
};

// Teto de sanidade: mais que isso não é ausência parcial, é falta do dia — que se lança em
// Faltas e Licenças, onde a unidade é o dia e a folha e o 13º sabem ler.
const AP_MAX_MIN = 12 * 60;

const apState = { itens: [], ausencias: [] };
let apFiltroTrat = '';      // '' = todos
let apFiltroUnidade = '';
let apFiltroCargo = '';

// ---- Helpers ----

// "HH:MM" → minutos desde a meia-noite. parseHHMM é o parser da casa e já normaliza o que o
// RH digita; aqui a entrada vem sempre de <input type="time">, então é só reuso.
const apHoraMin = hhmm => parseHHMM(hhmm);

// Minutos ausentes entre duas horas do MESMO dia. Sem virada de meia-noite de propósito: uma
// janela que atravessa o dia não é saída no meio do turno, e aceitar isso em silêncio
// produziria um número negativo ou um plantão inteiro debitado por engano.
function apMinutos(x) {
    const ini = apHoraMin(x?.horaSaida);
    const fim = apHoraMin(x?.horaRetorno);
    if (ini == null || fim == null) return 0;
    return Math.max(0, fim - ini);
}

const apMinDe = x => Number(x?.minutos) || apMinutos(x);

const apBadgeTrat = t => t === TRAT_BANCO ? 'badge-warning' : t === TRAT_COMPENSAR ? 'badge-neutral' : 'badge-info';

const apPassaFiltro = f =>
    (!apFiltroUnidade || f?.unidadeId === apFiltroUnidade) &&
    (!apFiltroCargo || f?.cargoId === apFiltroCargo);

// ---- Filtros de unidade/cargo (mesmo padrão de catFiltrosHtml) ----
function apFiltrosHtml(idUni, idCargo) {
    const un = lancState.unidades.find(u => u.id === apFiltroUnidade);
    const cg = lancState.cargos.find(c => c.id === apFiltroCargo);
    return `
        <button class="btn btn-secondary btn-filter${apFiltroUnidade ? ' active' : ''}" id="${idUni}">${icon('building')} ${escapeHtml(un?.nome || 'Todas as unidades')}</button>
        <button class="btn btn-secondary btn-filter${apFiltroCargo ? ' active' : ''}" id="${idCargo}">${icon('briefcase')} ${escapeHtml(cg?.nome || 'Todos os cargos')}</button>`;
}

function apBindFiltros(idUni, idCargo, rerender) {
    const unis = lancState.unidades.slice().sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    const cargos = lancState.cargos.slice().sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    const bUni = document.getElementById(idUni);
    if (bUni) bUni.onclick = () => openFilterPopover(bUni, {
        allLabel: 'Todas as unidades',
        options: unis.map(u => ({ value: u.id, label: u.nome })),
        value: apFiltroUnidade,
        searchable: unis.length > 6,
        onPick: v => { apFiltroUnidade = v; rerender(); }
    });
    const bCargo = document.getElementById(idCargo);
    if (bCargo) bCargo.onclick = () => openFilterPopover(bCargo, {
        allLabel: 'Todos os cargos',
        options: cargoOpcoes(cargos),
        value: apFiltroCargo,
        searchable: cargos.length > 6,
        onPick: v => { apFiltroCargo = v; rerender(); }
    });
}

// ============ ABA ============
async function renderAusParcial() {
    // O banco de horas vem junto porque as guardas (mês quitado, ciclo fechado) e o recálculo
    // de parcialMin dependem dele — e esta aba pode ser a primeira que o usuário abre, com
    // bhState ainda vazio.
    const [itens, ausencias, banco, fechamentos, quitacoes] = await Promise.all([
        DB.getAll(PATHS.ausenciasParciais),
        DB.getAll(PATHS.ausencias),
        DB.getObj(PATHS.bancoHoras),
        DB.getAll(PATHS.bancoHorasFechamentos),
        DB.getAll(PATHS.bancoHorasQuitacoes)
    ]);
    apState.itens = itens.sort((a, b) =>
        (b.data || '').localeCompare(a.data || '') || (b.horaSaida || '').localeCompare(a.horaSaida || ''));
    apState.ausencias = ausencias;
    bhState.banco = banco || {};
    bhState.fechamentos = fechamentos;
    bhState.quitacoes = quitacoes;

    apTabela();
}

function apTabela() {
    const cont = document.getElementById('lancContent');
    const podeEditar = can('editar_lancamentos');

    const lista = apState.itens.filter(x => apPassaFiltro(lancFuncObj(x.funcionarioId)));

    // Janela de 12 meses: é o horizonte que o RH usa para julgar recorrência ("de novo?"), e o
    // mesmo recorte da faixa de KPIs da CAT.
    const desde = addMeses(hoje(), -12);
    const recentes = lista.filter(x => (x.data || '') >= desde);
    const somaMin = arr => arr.reduce((s, x) => s + apMinDe(x), 0);
    const mkAtual = mesHoje();
    const semDoc = recentes.filter(x => !anexosDe(x).length).length;

    const kpis = [
        [fmtHHMM(somaMin(lista.filter(x => (x.data || '').slice(0, 7) === mkAtual))), `Horas em ${mesLabel(mkAtual)}`, 'aquisitivo'],
        [fmtHHMM(somaMin(recentes.filter(x => x.tratamento === TRAT_ABONADO))), 'Abonadas (12 meses)', 'atencao'],
        [fmtHHMM(somaMin(recentes.filter(x => x.tratamento === TRAT_BANCO))), 'No banco de horas (12 meses)', 'critica'],
        [fmtNum(semDoc), 'Sem declaração anexada', semDoc ? 'vencida' : 'aquisitivo']
    ];

    const chipTrat = t => `<button class="btn btn-sm ${apFiltroTrat === t ? 'btn-primary' : 'btn-secondary'}" data-trat="${escapeHtml(t)}">${escapeHtml(t || 'Todos')}</button>`;

    cont.innerHTML = `
        <div class="page-sub" style="margin-bottom:14px">Saída no meio do turno ou mais cedo, com declaração — o dia continua trabalhado. Falta do dia inteiro se lança em <strong>Faltas e Licenças</strong>.</div>
        <div class="prog-resumo">
            ${kpis.map(([n, txt, cls]) => `
                <div class="prog-kpi prog-${cls}">
                    <span class="prog-n">${n}</span>
                    <span class="prog-lbl">${txt}</span>
                </div>`).join('')}
        </div>
        <div class="table-wrap">
            <div class="table-toolbar">
                <div class="search-box">${icon('search')}<input class="input" id="lancSearch" placeholder="Buscar por funcionário ou motivo..."></div>
                ${apFiltrosHtml('apUni', 'apCargo')}
                <div class="grow"></div>
                ${podeEditar ? `<button class="btn btn-primary" id="lancNew">${icon('plus')} Lançar ausência parcial</button>` : ''}
            </div>
            <div class="flex" style="gap:6px;padding:0 14px 12px;flex-wrap:wrap">
                ${['', ...TRATAMENTOS_AUS_PARCIAL].map(chipTrat).join('')}
            </div>
            <div class="table-scroll">
                <table class="table">
                    <thead><tr>
                        <th>Funcionário</th><th>Data</th>
                        <th title="Janela em que o funcionário esteve ausente">Saída → Retorno</th>
                        <th class="num">Horas</th>
                        <th>Motivo</th>
                        <th title="O que o RH decidiu fazer com as horas">Tratamento</th>
                        <th title="Declaração apresentada pelo funcionário">Declaração</th>
                        <th style="width:48px"></th>
                    </tr></thead>
                    <tbody id="lancTbody">${lista.map(x => `
                        <tr data-id="${x.id}" data-trat="${escapeHtml(x.tratamento || '')}" data-search="${escapeHtml((lancFuncNome(x.funcionarioId) + ' ' + (x.motivo || '') + ' ' + (x.obs || '')).toLowerCase())}">
                            <td>${lancFuncCellHtml(x.funcionarioId)}</td>
                            <td>${fmtDate(x.data)}</td>
                            <td class="text-2" style="white-space:nowrap">${escapeHtml(x.horaSaida || '—')} → ${escapeHtml(x.horaRetorno || '—')}${x.naoRetornou ? '<div class="prog-aq">não retornou no dia</div>' : ''}</td>
                            <td class="num"><strong>${fmtHHMM(apMinDe(x))}</strong></td>
                            <td class="text-2">${escapeHtml(x.motivo || '—')}</td>
                            <td><span class="badge ${apBadgeTrat(x.tratamento)}" title="${escapeHtml(TRAT_DESC[x.tratamento] || '')}">${escapeHtml(x.tratamento || '—')}</span></td>
                            <td>${anexosDe(x).length
                                ? anexoChip(anexosDe(x))
                                : `<span class="badge badge-warning" title="A ausência foi registrada, mas a declaração não está arquivada aqui">${icon('alert')} pendente</span>`}</td>
                            <td>${podeEditar ? `<button class="btn-icon" data-menu>${icon('dots')}</button>` : ''}</td>
                        </tr>`).join('')}</tbody>
                </table>
            </div>
        </div>`;

    if (!lista.length) {
        document.getElementById('lancTbody').innerHTML =
            `<tr><td colspan="10"><div class="table-empty">${icon('clock')}<span>Nenhuma ausência parcial lançada${apFiltroUnidade || apFiltroCargo ? ' com os filtros aplicados' : ''}.</span></div></td></tr>`;
    }

    const aplicar = () => lancAplicaFiltros(tr => !apFiltroTrat || tr.dataset.trat === apFiltroTrat);
    const btnNew = document.getElementById('lancNew');
    if (btnNew) btnNew.onclick = () => formAusParcial(null);
    document.getElementById('lancSearch').addEventListener('input', aplicar);
    cont.querySelectorAll('button[data-trat]').forEach(b => {
        b.onclick = () => { apFiltroTrat = b.dataset.trat; apTabela(); };
    });
    apBindFiltros('apUni', 'apCargo', apTabela);
    bindLancFuncCells(document.getElementById('lancTbody'));
    bindAnexoChips(document.getElementById('lancTbody'),
        el => anexosDe(apState.itens.find(x => x.id === el.closest('tr').dataset.id)));
    aplicar();

    cont.querySelectorAll('#lancTbody tr[data-id]').forEach(tr => {
        const x = apState.itens.find(i => i.id === tr.dataset.id);
        lancRowClick(tr, () => detalheAusParcial(x));
        lancRowMenu(tr, [
            { label: 'Ver detalhes', icon: 'eye', onClick: () => detalheAusParcial(x) },
            { label: 'Editar', icon: 'edit', onClick: () => formAusParcial(x) },
            'sep',
            { label: 'Excluir', icon: 'trash', danger: true, onClick: () => excluirAusParcial(x) }
        ]);
    });
}

// ============ DETALHE ============
function detalheAusParcial(x, onClose) {
    abrirDetalheLanc({
        titulo: lancFuncNome(x.funcionarioId),
        sub: `Ausência parcial · ${fmtDate(x.data)}`,
        funcionarioId: x.funcionarioId,
        badgeHtml: `<span class="badge ${apBadgeTrat(x.tratamento)}">${escapeHtml(x.tratamento || '—')}</span>`,
        linhas: [
            ['Data', fmtDate(x.data)],
            [x.naoRetornou ? 'Saiu às' : 'Saída', escapeHtml(x.horaSaida || '—')],
            [x.naoRetornou ? 'Fim previsto da jornada' : 'Retorno', escapeHtml(x.horaRetorno || '—')],
            ['Horas ausentes', `<strong>${fmtHHMM(apMinDe(x))}</strong>`],
            ['Motivo', escapeHtml(x.motivo || '—')],
            ['Tratamento', `${escapeHtml(x.tratamento || '—')}<div class="prog-aq">${escapeHtml(TRAT_DESC[x.tratamento] || '')}</div>`],
            x.tratamento === TRAT_BANCO ? ['Mês no banco de horas', mesLabel(x.mesRef || mesDe(x.data))] : null,
            x.obs ? ['Observação', escapeHtml(x.obs)] : null
        ],
        anexo: anexosDe(x),
        // Propaga o retorno: editar/excluir a partir da ficha deve voltar para a ficha.
        onEdit: () => formAusParcial(x, onClose),
        onDelete: () => excluirAusParcial(x, onClose),
        onClose
    });
}

// ============ BANCO DE HORAS ============
// Recalcula `parcialMin` do mês INTEIRO a partir dos lançamentos, nunca por delta: se um save
// falhar no meio, o próximo recálculo se autocorrige em vez de acumular desvio. Mesma doutrina
// dos avos do 13º — o sistema guarda o fato e deriva o número toda vez.
async function apRecalcBanco(fid, mesRef) {
    if (!fid || !mesRef) return;
    const total = apState.itens
        .filter(x => x.funcionarioId === fid && x.tratamento === TRAT_BANCO && (x.mesRef || mesDe(x.data)) === mesRef)
        .reduce((s, x) => s + apMinDe(x), 0);

    const atual = bhState.banco[mesRef]?.[fid] || null;
    const eraNovo = !atual;

    if (!total) {
        if (!atual) return;
        // Linha que só existia por causa das parciais some junto: uma linha 00:00 ancoraria o
        // ciclo de quem talvez nem tenha acordo de compensação.
        if (!(Number(atual.extraMin) || 0) && !(Number(atual.atrasoMin) || 0)) {
            await DB.remove(`${PATHS.bancoHoras}/${mesRef}`, fid);
            delete bhState.banco[mesRef][fid];
            return;
        }
        const zerada = { ...atual, parcialMin: 0, lancadoEm: hoje() };
        await DB.save(`${PATHS.bancoHoras}/${mesRef}`, fid, zerada);
        bhState.banco[mesRef][fid] = zerada;
        return;
    }

    const linha = { ...(atual || { extraMin: 0, atrasoMin: 0 }), parcialMin: total, lancadoEm: hoje() };
    await DB.save(`${PATHS.bancoHoras}/${mesRef}`, fid, linha);
    bhState.banco[mesRef] = { ...(bhState.banco[mesRef] || {}), [fid]: linha };

    // Primeira linha do funcionário naquele mês pode ter movido a âncora do ciclo — mesmo
    // aviso que a grade dá quando o RH digita direto lá.
    if (eraNovo) bhAvisaAncora(fid, mesRef);
}

// Por que o desconto no banco pode ser recusado. Devolve a mensagem, ou null se está liberado.
function apImpedimentoBanco(fid, mesRef) {
    const f = lancFuncObj(fid);
    // CLT art. 432: o contrato de aprendizagem não admite compensação de jornada, então não
    // existe banco onde debitar. A ausência continua registrável — só não vira saldo.
    if (ehAprendiz(bhCargoDoFunc(f)))
        return 'Aprendiz não tem banco de horas (CLT art. 432). Use Abonado ou Compensar.';

    const quit = mesBhQuitado(fid, mesRef, bhState.quitacoes);
    if (quit)
        return `O banco de ${mesLabel(mesRef)} já foi quitado em ${fmtDate(quit.data)} — aquelas horas viraram pagamento. Exclua a quitação antes de mexer no mês.`;

    const fech = (bhState.fechamentos || []).find(x => x.funcionarioId === fid
        && x.cicloInicio <= mesRef && mesRef <= (x.cicloFim || '').slice(0, 7));
    if (fech)
        return `O ciclo que cobre ${mesLabel(mesRef)} foi fechado em ${fmtDate(fech.data)}. Reabra o ciclo antes de lançar horas nele.`;

    return null;
}

// ============ FORMULÁRIO ============
// `onDone`: para onde voltar depois de salvar. O form é usado tanto pela aba quanto pela ficha
// do funcionário; sem isso, salvar a partir da ficha tentaria re-renderizar uma aba de
// Lançamentos que não está na tela. Mesmo contrato de formCat.
function formAusParcial(x, onDone) {
    const isEdit = !!x?.id;
    const selFunc = selectFuncionario('apFunc', x?.funcionarioId);
    if (!selFunc) return toast('Nenhum funcionário ativo cadastrado.', 'info');

    const el = id => m.body.querySelector('#' + id);
    const opts = (lista, sel) => lista.map(o => `<option ${o === sel ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('');

    const m = openModal({
        title: isEdit ? 'Editar ausência parcial' : 'Lançar ausência parcial',
        size: 'modal-lg',
        body: `
            <div class="field"><label>Funcionário <span class="req">*</span></label>${selFunc}</div>
            <div class="form-row">
                <div class="field"><label>Data <span class="req">*</span></label>
                    <input class="input" id="apData" type="date" max="${hoje()}" value="${x?.data || hoje()}">
                    <div class="field-hint">O dia foi trabalhado — só faltaram horas dele.</div>
                </div>
                <div class="field"><label>Motivo <span class="req">*</span></label>
                    <select class="select" id="apMotivo">${opts(MOTIVOS_AUS_PARCIAL, x?.motivo || MOTIVOS_AUS_PARCIAL[0])}</select>
                </div>
            </div>
            <div class="field">
                <label class="flex" style="gap:8px;align-items:center;cursor:pointer">
                    <span class="switch"><input type="checkbox" id="apNaoRet" ${x?.naoRetornou ? 'checked' : ''}><span class="track"></span></span>
                    <span>Saiu e não retornou no dia</span>
                </label>
                <div class="field-hint">Ligue quando o funcionário foi liberado mais cedo. A ficha não guarda horário de jornada, então o fim do expediente precisa ser informado.</div>
            </div>
            <div class="form-row">
                <div class="field"><label>Saída <span class="req">*</span></label>
                    <input class="input" id="apSaida" type="time" value="${escapeHtml(x?.horaSaida || '')}">
                </div>
                <div class="field"><label id="apLblFim">Retorno <span class="req">*</span></label>
                    <input class="input" id="apRetorno" type="time" value="${escapeHtml(x?.horaRetorno || '')}">
                    <div class="field-hint" id="apHintFim"></div>
                </div>
            </div>
            <div class="field"><label>Tratamento das horas <span class="req">*</span></label>
                <select class="select" id="apTrat">${opts(TRATAMENTOS_AUS_PARCIAL, x?.tratamento || TRAT_ABONADO)}</select>
                <div class="field-hint" id="apTratHint"></div>
            </div>
            <div class="fa-comp" id="apComp"></div>
            <div class="field"><label>Observação</label>
                <textarea class="input" id="apObs" rows="2" placeholder="Detalhes (opcional)">${escapeHtml(x?.obs || '')}</textarea>
            </div>
            <div class="field"><label>Declaração (atestado de comparecimento, convocação)</label><div id="apAnexo"></div></div>`,
        footer: ''
    });

    bindSelectFuncionario(m.body, 'apFunc', x?.funcionarioId);
    const anexoCtl = initAnexoField(el('apAnexo'), anexosDe(x));

    const funcEl = el('apFunc'), dataEl = el('apData'), saidaEl = el('apSaida'),
        retEl = el('apRetorno'), tratEl = el('apTrat'), naoRetEl = el('apNaoRet');

    // Memória de cálculo ao vivo: o RH digita duas horas e precisa ver o que isso vira antes de
    // salvar — inclusive em que mês do banco vai cair e se aquele mês está travado.
    const recalc = () => {
        const min = apMinutos({ horaSaida: saidaEl.value, horaRetorno: retEl.value });
        const box = el('apComp');
        const trat = tratEl.value;

        el('apLblFim').innerHTML = naoRetEl.checked
            ? 'Fim previsto da jornada <span class="req">*</span>'
            : 'Retorno <span class="req">*</span>';
        el('apHintFim').textContent = naoRetEl.checked ? 'Hora em que o expediente dele terminaria.' : '';
        el('apTratHint').textContent = TRAT_DESC[trat] || '';

        const caixa = (cls, ico, titulo, detalhe) => {
            box.innerHTML = `
                <div class="fa-comp-box ${cls}">
                    ${icon(ico)}
                    <div>
                        <strong>${titulo}</strong>
                        <div class="muted">${detalhe}</div>
                    </div>
                </div>`;
        };

        if (!saidaEl.value || !retEl.value) { box.innerHTML = ''; return 0; }
        if (min <= 0) {
            caixa('is-erro', 'alert', `${naoRetEl.checked ? 'O fim da jornada' : 'O retorno'} precisa ser depois da saída`,
                'A janela da ausência é dentro do mesmo dia — não atravessa a meia-noite.');
            return 0;
        }
        if (min > AP_MAX_MIN) {
            caixa('is-erro', 'alert', `${fmtHHMM(min)} é o dia inteiro, não uma ausência parcial`,
                'Falta do dia todo se lança em Faltas e Licenças, onde a unidade é o dia — é de lá que a ficha e o 13º leem os dias perdidos.');
            return 0;
        }

        const mesRef = dataEl.value ? mesDe(dataEl.value) : '';
        const impedimento = trat === TRAT_BANCO && funcEl.value && mesRef
            ? apImpedimentoBanco(funcEl.value, mesRef) : null;
        if (impedimento) {
            caixa('is-erro', 'alert', `${fmtHHMM(min)} de ausência — não dá para descontar no banco`, escapeHtml(impedimento));
            return min;
        }
        caixa('is-parcial', 'clock', `${fmtHHMM(min)} de ausência`,
            trat === TRAT_BANCO ? `Serão debitadas no banco de horas de <strong>${mesLabel(mesRef)}</strong>, somando na coluna Ausências parciais daquele mês.`
            : trat === TRAT_COMPENSAR ? 'A repor fora do banco de horas — nenhum saldo é movido.'
            : 'Abonadas: ficam registradas com a declaração, sem desconto.');
        return min;
    };

    [saidaEl, retEl].forEach(e => e.oninput = recalc);
    [dataEl, tratEl, naoRetEl].forEach(e => e.onchange = recalc);
    funcEl.addEventListener('change', recalc);
    recalc();

    m.footer.innerHTML = `
        <button class="btn btn-secondary" data-cancel>Cancelar</button>
        <button class="btn btn-primary" data-save>${isEdit ? 'Salvar' : 'Lançar'}</button>`;
    m.footer.querySelector('[data-cancel]').onclick = m.close;
    const btnSave = m.footer.querySelector('[data-save]');

    btnSave.onclick = async () => {
        const fid = funcEl.value;
        const data = dataEl.value;
        const trat = tratEl.value;

        if (!fid) return toast('Selecione o funcionário.', 'error');
        if (!data) return toast('Informe a data da ausência.', 'error');
        // Mesma regra da hora extra: ausência se lança depois de acontecida — a declaração que
        // a justifica só existe depois do fato.
        if (data > hoje()) return toast('A data não pode ser futura.', 'error');
        if (!saidaEl.value) { saidaEl.focus(); return toast('Informe o horário de saída.', 'error'); }
        if (!retEl.value) {
            retEl.focus();
            return toast(naoRetEl.checked
                ? 'Informe o fim previsto da jornada — sem ele não dá para calcular as horas perdidas.'
                : 'Informe o horário de retorno.', 'error');
        }

        const min = apMinutos({ horaSaida: saidaEl.value, horaRetorno: retEl.value });
        if (min <= 0) return toast('O retorno precisa ser depois da saída — a janela é dentro do mesmo dia.', 'error');
        if (min > AP_MAX_MIN) return toast(`${fmtHHMM(min)} é o dia inteiro. Lance em Faltas e Licenças.`, 'error');

        // Não se sai mais cedo de um dia em que não se trabalhou: se já existe falta, férias ou
        // licença cobrindo a data, os dois registros contariam a mesma hora perdida.
        const cobre = apState.ausencias.find(a => a.funcionarioId === fid && ausenciaVigente(a, data));
        if (cobre) return toast(`${fmtDate(data)} já está coberto por ${cobre.tipo} (${fmtDate(cobre.inicio)} → ${fmtDate(cobre.retorno)}).`, 'error');

        // Duas janelas sobrepostas no mesmo dia contariam a mesma hora duas vezes no banco.
        const choque = apState.itens.find(o => o.id !== x?.id && o.funcionarioId === fid && o.data === data
            && apHoraMin(o.horaSaida) < apHoraMin(retEl.value) && apHoraMin(saidaEl.value) < apHoraMin(o.horaRetorno));
        if (choque) return toast(`Já existe uma ausência parcial de ${choque.horaSaida} a ${choque.horaRetorno} nesse dia.`, 'error');

        const mesRef = mesDe(data);
        if (trat === TRAT_BANCO) {
            const impedimento = apImpedimentoBanco(fid, mesRef);
            if (impedimento) return toast(impedimento, 'error');
        }

        // Retroativo é permitido (a declaração chega depois), mas nunca em silêncio quando o mês
        // já foi apurado: o saldo do banco alimenta a folha daquele mês.
        if (mesRef < mesHoje() && (trat === TRAT_BANCO || x?.tratamento === TRAT_BANCO)) {
            const folhaMes = await DB.getObj(`${PATHS.folha}/${mesRef}`);
            if (folhaMes && !await confirmDialog({
                title: 'Lançamento em mês anterior',
                message: `A folha de <strong>${mesLabel(mesRef)}</strong> já está lançada. Mexer no banco de horas daquele mês muda o saldo do ciclo. Lançar mesmo assim?`,
                confirmText: 'Lançar mesmo assim'
            })) return;
        }

        btnSave.disabled = true;
        btnSave.innerHTML = '<span class="spinner"></span> Salvando...';
        try {
            const { anexos, removidos } = await anexoCtl.getAnexos();
            const dados = {
                funcionarioId: fid,
                data,
                mesRef,
                horaSaida: saidaEl.value,
                horaRetorno: retEl.value,
                naoRetornou: naoRetEl.checked,
                minutos: min,
                motivo: el('apMotivo').value,
                tratamento: trat,
                obs: el('apObs').value.trim(),
                anexos
            };
            const id = await DB.save(PATHS.ausenciasParciais, x?.id || null, dados);
            await excluirAnexoRemoto(removidos);

            // Estado local antes do recálculo: apRecalcBanco soma a partir de apState.itens.
            const i = apState.itens.findIndex(o => o.id === id);
            if (i >= 0) apState.itens[i] = { id, ...dados };
            else apState.itens.unshift({ id, ...dados });

            // Uma edição pode ter tirado o lançamento de um mês e posto em outro (mudou a data,
            // ou o tratamento deixou de ser banco) — os dois precisam ser refeitos, não só o novo.
            const meses = new Set([mesRef]);
            if (x) meses.add(x.mesRef || mesDe(x.data));
            for (const mk of meses) await apRecalcBanco(fid, mk);
            // Funcionário trocado numa edição deixaria saldo órfão no banco do antigo.
            if (x && x.funcionarioId !== fid) {
                for (const mk of meses) await apRecalcBanco(x.funcionarioId, mk);
            }

            // A folha lê o banco pela coluna derivada de atraso — o total pode ter mudado.
            folhaState.carregado = false;
            toast(isEdit ? 'Ausência parcial atualizada.' : `Ausência parcial de ${fmtHHMM(min)} registrada.`);
            m.close();
            (onDone || renderLancTab)();
        } catch (e) {
            toast(e.message || 'Erro ao salvar.', 'error');
        } finally {
            btnSave.disabled = false;
            btnSave.innerHTML = isEdit ? 'Salvar' : 'Lançar';
        }
    };
}

// ============ EXCLUSÃO ============
async function excluirAusParcial(x, onDone) {
    if (!await confirmDialog({
        title: 'Excluir ausência parcial',
        message: `Excluir a ausência de <strong>${fmtHHMM(apMinDe(x))}</strong> de <strong>${escapeHtml(lancFuncNome(x.funcionarioId))}</strong> em ${fmtDate(x.data)}?${x.tratamento === TRAT_BANCO ? ' O débito sai do banco de horas.' : ''}`,
        confirmText: 'Excluir', danger: true
    })) return;

    const mesRef = x.mesRef || mesDe(x.data);
    if (x.tratamento === TRAT_BANCO) {
        const impedimento = apImpedimentoBanco(x.funcionarioId, mesRef);
        if (impedimento) return toast(impedimento, 'error');
    }

    try {
        await excluirAnexoRemoto(anexosDe(x));
        await DB.remove(PATHS.ausenciasParciais, x.id);
        apState.itens = apState.itens.filter(o => o.id !== x.id);
        await apRecalcBanco(x.funcionarioId, mesRef);
        folhaState.carregado = false;
        toast('Ausência parcial excluída.');
        (onDone || renderLancTab)();
    } catch (e) {
        toast(e.message || 'Erro ao excluir.', 'error');
    }
}
