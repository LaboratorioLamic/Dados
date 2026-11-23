// ===== ASO — Atestado de Saúde Ocupacional (NR-7 / PCMSO) =====
//
// Arquivo próprio, não dentro de lancamentos.js: aquele arquivo já passa de 1.700 linhas.
// O motor de cálculo (situacaoAsoFunc, asosPendentesPorEvento, programacaoAso) vive em
// utils.js, junto do de férias — aqui fica só a interface.
//
// LGPD: resultado clínico, restrições e laudo são dado de saúde (categoria especial,
// art. 11). Ficam atrás de `ver_medico`. Sem a permissão, a aba continua útil para o RH —
// mostra datas, vencimentos e a fila de urgência, que é o que evita autuação — mas não
// expõe o conteúdo médico. Controlar prazo não exige ler diagnóstico.

let asoSub = 'programacao';       // programacao | tabela | agenda
let asoFiltroUnidade = '';
let asoFiltroCargo = '';
let asoFiltroTipo = '';           // '' = todos
let asoAno = new Date().getFullYear();
let asoMostrarPrev = true;        // agenda: exibir projeção calculada além do lançado
const asoState = { asos: [], eventos: {} };

const podeVerMedico = () => can('ver_medico');

const asoPassaFiltro = f =>
    (!asoFiltroUnidade || f.unidadeId === asoFiltroUnidade) &&
    (!asoFiltroCargo || f.cargoId === asoFiltroCargo);

const cargoDoFunc = f => lancState.cargos.find(c => c.id === f?.cargoId) || null;

// Badge do resultado. Sem ver_medico o resultado nunca chega à tela.
const ASO_RESULTADO_CLS = {
    'Apto': 'badge-success',
    'Apto com restrições': 'badge-warning',
    'Inapto': 'badge-danger'
};

const badgeResultado = r => r
    ? `<span class="badge ${ASO_RESULTADO_CLS[r] || 'badge-neutral'}">${escapeHtml(r)}</span>`
    : '<span class="muted">—</span>';

// Marcador de dado oculto — honesto sobre a existência do dado sem revelar o conteúdo.
const restritoHtml = () =>
    `<span class="muted" title="Requer a permissão 'Ver dados médicos'">${icon('lock')} restrito</span>`;

// ---- Filtros compartilhados pelas sub-abas (mesmo padrão de feriasFiltrosHtml) ----
function asoFiltrosHtml(idUni, idCargo) {
    const un = lancState.unidades.find(u => u.id === asoFiltroUnidade);
    const cg = lancState.cargos.find(c => c.id === asoFiltroCargo);
    return `
        <button class="btn btn-secondary btn-filter${asoFiltroUnidade ? ' active' : ''}" id="${idUni}">${icon('building')} ${escapeHtml(un?.nome || 'Todas as unidades')}</button>
        <button class="btn btn-secondary btn-filter${asoFiltroCargo ? ' active' : ''}" id="${idCargo}">${icon('briefcase')} ${escapeHtml(cg?.nome || 'Todos os cargos')}</button>`;
}

function asoBindFiltros(idUni, idCargo, rerender) {
    const unis = lancState.unidades.slice().sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    const cargos = lancState.cargos.slice().sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    const bUni = document.getElementById(idUni);
    if (bUni) bUni.onclick = () => openFilterPopover(bUni, {
        allLabel: 'Todas as unidades',
        options: unis.map(u => ({ value: u.id, label: u.nome })),
        value: asoFiltroUnidade,
        searchable: unis.length > 6,
        onPick: v => { asoFiltroUnidade = v; rerender(); }
    });
    const bCargo = document.getElementById(idCargo);
    if (bCargo) bCargo.onclick = () => openFilterPopover(bCargo, {
        allLabel: 'Todos os cargos',
        options: cargoOpcoes(cargos),
        value: asoFiltroCargo,
        searchable: cargos.length > 6,
        onPick: v => { asoFiltroCargo = v; rerender(); }
    });
}

// ============ SHELL DA ABA ============
async function renderAso() {
    // Os 4 tipos não-periódicos derivam de eventos já registrados — buscados junto.
    const [asos, demissoes, ausencias, promocoes, transferencias] = await Promise.all([
        DB.getAll(PATHS.asos),
        DB.getAll(PATHS.demissoes),
        DB.getAll(PATHS.ausencias),
        DB.getAll(PATHS.promocoes),
        DB.getAll(PATHS.transferencias)
    ]);
    asoState.asos = asos.sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    asoState.eventos = { demissoes, ausencias, promocoes, transferencias };

    const cont = document.getElementById('lancContent');

    // Contador de urgência na sub-aba: vencidos + sem histórico = ação imediata
    const sits = lancAtivos()
        .map(f => situacaoAsoFunc(f, asos, cargoDoFunc(f)))
        .filter(Boolean);
    const urgentes = sits.filter(s => s.status === 'vencido' || s.status === 'sem_historico').length;

    cont.innerHTML = `
        <div class="flex-between" style="margin-bottom:14px">
            <div class="tabs tabs-sub" id="asoSubs" style="max-width:440px">
                <div class="tab" data-sub="programacao">${icon('alert')} Programação${urgentes ? `<span class="tab-count tab-count-alert">${urgentes}</span>` : ''}</div>
                <div class="tab" data-sub="tabela">${icon('launch')} Tabela</div>
                <div class="tab" data-sub="agenda">${icon('calendar')} Agenda</div>
            </div>
            ${!podeVerMedico() ? `<span class="badge badge-neutral" title="Você vê prazos e vencimentos, mas não o conteúdo clínico.">${icon('lock')} Dados médicos ocultos</span>` : ''}
        </div>
        <div id="asoBody"></div>`;

    const subs = cont.querySelectorAll('#asoSubs .tab');
    const setSub = id => {
        asoSub = id;
        subs.forEach(t => t.classList.toggle('active', t.dataset.sub === id));
        ({ programacao: asoProgramacao, tabela: asoTabela, agenda: asoAgenda })[id]();
    };
    subs.forEach(t => t.onclick = () => setSub(t.dataset.sub));
    setSub(asoSub);
}

// ============ SUB-ABA: PROGRAMAÇÃO ============
// Fila derivada, nada gravado — igual à programação de férias. Quem vence primeiro aparece
// primeiro; a data prevista já vem escalonada para não marcar 20 exames no mesmo dia.
function asoProgramacao() {
    const box = document.getElementById('asoBody');
    const podeEditar = can('editar_lancamentos');

    const todos = lancAtivos()
        .map(f => ({ f, sit: situacaoAsoFunc(f, asoState.asos, cargoDoFunc(f)) }))
        .filter(x => x.sit);
    // Escalona sobre a equipe inteira (não só o filtro) — a capacidade da clínica é real
    const plano = programacaoAso(todos);

    const linhas = todos
        .filter(x => asoPassaFiltro(x.f))
        .sort((a, b) => (ASO_ORDEM[a.sit.status] - ASO_ORDEM[b.sit.status]) || (a.sit.dias - b.sit.dias));

    const n = st => linhas.filter(x => x.sit.status === st).length;
    // Quem está em cargo "Não se aplica" não some em silêncio: uma fila mais curta sem
    // explicação parece dado faltando. O número é dito, o motivo também.
    const isentos = lancAtivos().filter(f => asoPassaFiltro(f) && asoIsento(cargoDoFunc(f))).length;

    box.innerHTML = `
        <div class="prog-resumo">
            ${[['vencido', 'Vencidos — sem ASO válido'], ['sem_historico', 'Nunca realizaram'], ['critico', `Vencem em até ${asoParams.alertaDias} dias`], ['em_dia', 'Em dia']]
                .map(([st, txt]) => `
                <div class="prog-kpi prog-${st === 'vencido' || st === 'sem_historico' ? 'vencida' : st === 'critico' ? 'critica' : 'aquisitivo'}">
                    <span class="prog-n">${n(st)}</span>
                    <span class="prog-lbl">${txt}</span>
                </div>`).join('')}
        </div>
        ${isentos ? `<div class="aso-isentos">${icon('info')} <span><strong>${fmtNum(isentos)}</strong> ${isentos > 1 ? 'funcionários ficam' : 'funcionário fica'} fora desta fila — cargo com ASO marcado como <strong>"Não se aplica"</strong> em Configurações → Cargos.</span></div>` : ''}
        <div class="table-wrap">
            <div class="table-toolbar">
                <div class="search-box">${icon('search')}<input class="input" id="lancSearch" placeholder="Buscar por funcionário..."></div>
                ${asoFiltrosHtml('asoProgUni', 'asoProgCargo')}
                <div class="grow"></div>
            </div>
            <div class="table-scroll">
                <table class="table">
                    <thead><tr>
                        <th>Funcionário</th><th>Unidade</th>
                        <th title="Situação do exame periódico (NR-7)">Situação</th>
                        <th>Último exame</th>
                        <th title="Vencimento = último exame + periodicidade do cargo">Vence em</th>
                        <th title="Data sugerida pelo sistema, já distribuída por dia/unidade">Data prevista</th>
                        <th style="width:140px"></th>
                    </tr></thead>
                    <tbody id="lancTbody">${linhas.map(({ f, sit }) => {
                        const s = ASO_STATUS[sit.status];
                        const p = plano.get(f.id);
                        const cargo = cargoDoFunc(f);
                        return `
                        <tr data-id="${f.id}" data-search="${escapeHtml((f.nome + ' ' + unidadeNomeDe(f.unidadeId)).toLowerCase())}">
                            <td>
                                <div class="flex" style="gap:8px;align-items:center">
                                    ${avatarHtml(f)}
                                    <span class="prog-dot ${s.dot}"></span>
                                    <strong>${escapeHtml(f.nome)}</strong>
                                </div>
                                <div class="prog-aq">${escapeHtml(cargo?.nome || 'Sem cargo')} — a cada ${sit.meses} meses</div>
                            </td>
                            <td class="text-2">${escapeHtml(unidadeNomeDe(f.unidadeId))}</td>
                            <td>
                                <span class="badge ${s.cls}" title="${escapeHtml(sit.desc)}">${escapeHtml(sit.label)}</span>
                            </td>
                            <td class="text-2">${sit.ultimo ? `${fmtDate(sit.ultimo)}<div class="prog-aq">${escapeHtml(sit.ultimoTipo)}</div>` : '<span class="muted">nunca</span>'}</td>
                            <td class="text-2">${sit.vencimento
                                ? `${fmtDate(sit.vencimento)}<div class="prog-dias ${sit.dias < 0 ? 'txt-danger' : ''}">${sit.dias < 0 ? '−' : ''}${fmtNum(Math.abs(sit.dias))} dias</div>`
                                : '—'}</td>
                            <td class="text-2">
                                <div>${fmtDate(p.data)}</div>
                                ${p.adiado ? `<span class="prog-adiado" title="Adiado de ${fmtDate(p.base)} para não concentrar exames no mesmo dia na unidade">escalonado</span>` : ''}
                            </td>
                            <td>${podeEditar ? `<button class="btn btn-sm ${sit.status === 'vencido' || sit.status === 'sem_historico' ? 'btn-primary' : 'btn-secondary'}" data-lancar>${icon('plus')} Lançar ASO</button>` : ''}</td>
                        </tr>`;
                    }).join('')}</tbody>
                </table>
            </div>
        </div>`;

    if (!linhas.length) {
        document.getElementById('lancTbody').innerHTML =
            `<tr><td colspan="10"><div class="table-empty">${icon('check')}<span>Nenhum funcionário ativo com admissão registrada.</span></div></td></tr>`;
    }
    document.getElementById('lancSearch').addEventListener('input', () => lancAplicaFiltros());
    bindAvatarFotos(box);
    asoBindFiltros('asoProgUni', 'asoProgCargo', asoProgramacao);

    box.querySelectorAll('#lancTbody tr[data-id]').forEach(tr => {
        const item = linhas.find(x => x.f.id === tr.dataset.id);
        const btn = tr.querySelector('[data-lancar]');
        if (btn) btn.onclick = e => {
            e.stopPropagation();
            const p = plano.get(item.f.id);
            // Pré-preenche com a data escalonada; o RH ajusta antes de salvar.
            formAso({ funcionarioId: item.f.id, tipo: ASO_TIPO_PERIODICO, data: p.data }, item.sit);
        };
    });
}

// ============ SUB-ABA: TABELA ============
function asoTabela() {
    const box = document.getElementById('asoBody');
    const podeEditar = can('editar_lancamentos');
    const medico = podeVerMedico();

    const lista = asoState.asos.filter(a => {
        const f = lancState.funcionarios.find(x => x.id === a.funcionarioId);
        return f ? asoPassaFiltro(f) : true;
    });

    const chipTipo = t => `<button class="btn btn-sm ${asoFiltroTipo === t ? 'btn-primary' : 'btn-secondary'}" data-tipo="${escapeHtml(t)}">${escapeHtml(t || 'Todos')}</button>`;

    box.innerHTML = `
        <div class="table-wrap">
            <div class="table-toolbar">
                <div class="search-box">${icon('search')}<input class="input" id="lancSearch" placeholder="Buscar por funcionário..."></div>
                ${asoFiltrosHtml('asoTabUni', 'asoTabCargo')}
                <div class="grow"></div>
                ${podeEditar ? `<button class="btn btn-primary" id="lancNew">${icon('plus')} Lançar ASO</button>` : ''}
            </div>
            <div class="flex" style="gap:6px;padding:0 14px 12px;flex-wrap:wrap">
                ${['', ...ASO_TIPOS].map(chipTipo).join('')}
            </div>
            <div class="table-scroll">
                <table class="table">
                    <thead><tr>
                        <th>Funcionário</th><th>Tipo</th><th>Data</th>
                        <th>Resultado</th><th>Médico</th><th>Laudo</th>
                        <th style="width:48px"></th>
                    </tr></thead>
                    <tbody id="lancTbody">${lista.map(a => `
                        <tr data-id="${a.id}" data-tipo="${escapeHtml(a.tipo || '')}" data-search="${escapeHtml((lancFuncNome(a.funcionarioId) + ' ' + (a.tipo || '')).toLowerCase())}">
                            <td>${lancFuncCellHtml(a.funcionarioId)}</td>
                            <td><span class="badge badge-accent">${escapeHtml(a.tipo || '—')}</span></td>
                            <td>${fmtDate(a.data)}</td>
                            <td>${medico ? badgeResultado(a.resultado) : restritoHtml()}</td>
                            <td class="text-2">${medico ? escapeHtml(a.medico || '—') : restritoHtml()}</td>
                            <td>${medico
                                ? (anexosDe(a).length ? anexoChip(anexosDe(a)) : '<span class="muted">—</span>')
                                : restritoHtml()}</td>
                            <td>${podeEditar ? `<button class="btn-icon" data-menu>${icon('dots')}</button>` : ''}</td>
                        </tr>`).join('')}</tbody>
                </table>
            </div>
        </div>`;

    if (!lista.length) {
        document.getElementById('lancTbody').innerHTML =
            `<tr><td colspan="10"><div class="table-empty">${icon('launch')}<span>Nenhum ASO lançado.</span></div></td></tr>`;
    }

    const aplicar = () => lancAplicaFiltros(tr => !asoFiltroTipo || tr.dataset.tipo === asoFiltroTipo);
    const btnNew = document.getElementById('lancNew');
    if (btnNew) btnNew.onclick = () => formAso(null);
    document.getElementById('lancSearch').addEventListener('input', aplicar);
    box.querySelectorAll('[data-tipo]').forEach(b => {
        if (b.tagName !== 'BUTTON') return;
        b.onclick = () => { asoFiltroTipo = b.dataset.tipo; asoTabela(); };
    });
    asoBindFiltros('asoTabUni', 'asoTabCargo', asoTabela);
    bindLancFuncCells(document.getElementById('lancTbody'));
    if (medico) bindAnexoChips(document.getElementById('lancTbody'), el => anexosDe(asoState.asos.find(x => x.id === el.closest('tr').dataset.id)));
    aplicar();

    box.querySelectorAll('#lancTbody tr[data-id]').forEach(tr => {
        const a = asoState.asos.find(x => x.id === tr.dataset.id);
        lancRowClick(tr, () => detalheAso(a));
        lancRowMenu(tr, [
            { label: 'Ver detalhes', icon: 'eye', onClick: () => detalheAso(a) },
            { label: 'Editar', icon: 'edit', onClick: () => formAso(a) },
            'sep',
            { label: 'Excluir', icon: 'trash', danger: true, onClick: () => excluirAso(a) }
        ]);
    });
}

// Selo curto ao lado do nome na agenda. Só para quem precisa de ação — quem está em dia
// não ganha selo, senão a coluna vira ruído e o olho para de achar o que importa.
// "vencido há 30 dias" vira "vencido": o rótulo é um aviso, o detalhe está no title.
function seloSitAgenda(sit) {
    if (!sit || sit.status === 'em_dia') return '';
    const txt = {
        vencido: '● vencido',
        sem_historico: '● sem ASO',
        critico: sit.dias === 0 ? '● hoje' : `● ${sit.dias}d`
    }[sit.status];
    const cls = sit.status === 'critico' ? 'critica' : 'vencida';
    return `<span class="gt-sit gt-sit-${cls}" title="${escapeHtml(sit.label)}">${txt}</span>`;
}

// ============ SUB-ABA: AGENDA ============
// Linha do tempo anual, uma linha por colaborador. Exame é MARCO pontual (losango), não
// barra: férias ocupam um período, um exame acontece num dia. A forma comunica isso.
//
// Lançado (sólido) vs. projetado (vazado, tracejado): o projetado não é um registro — é
// último exame + periodicidade, recalculado a cada render. Some sozinho quando o exame
// real é lançado, porque aí ele vira o novo "último".
function asoAgenda() {
    const box = document.getElementById('asoBody');
    const ini = `${asoAno}-01-01`, fim = `${asoAno}-12-31`;
    const totalDias = diasEntre(ini, fim) + 1;
    const pct = d => (diasEntre(ini, d) / totalDias) * 100;

    const doAno = asoState.asos.filter(a => a.data >= ini && a.data <= fim);
    const elegiveis = lancAtivos()
        .map(f => ({ f, sit: situacaoAsoFunc(f, asoState.asos, cargoDoFunc(f)) }))
        .filter(x => x.sit);
    const plano = asoMostrarPrev ? programacaoAso(elegiveis) : new Map();

    // Uma linha por colaborador com algo no ano (lançado ou projetado)
    const linhasFunc = lancState.funcionarios
        .filter(f => !f.demissao)
        .filter(asoPassaFiltro)
        .map(f => {
            const reais = doAno.filter(a => a.funcionarioId === f.id).sort((a, b) => a.data.localeCompare(b.data));
            const p = plano.get(f.id);
            // Projeção só aparece se cair no ano exibido e não coincidir com exame já lançado
            const prevista = p && p.data >= ini && p.data <= fim
                && !reais.some(a => a.data === p.data) ? p : null;
            return { f, reais, prevista, sit: elegiveis.find(x => x.f.id === f.id)?.sit };
        })
        .filter(x => x.reais.length || x.prevista)
        .sort((a, b) => {
            const da = a.reais[0]?.data || a.prevista?.data || '9';
            const db = b.reais[0]?.data || b.prevista?.data || '9';
            return da.localeCompare(db) || (a.f.nome || '').localeCompare(b.f.nome || '');
        });

    const reguaMeses = MESES.map((m, i) => {
        const dm = new Date(asoAno, i + 1, 0).getDate();
        return `<div class="gt-m" style="left:${pct(`${mesKey(asoAno, i)}-01`)}%;width:${(dm / totalDias) * 100}%">${m}</div>`;
    }).join('');

    const hojeNoAno = hoje() >= ini && hoje() <= fim;
    // Projeções que já estouraram o prazo: o exame está atrasado, não "planejado"
    const atrasados = linhasFunc.filter(x => x.prevista && x.sit
        && (x.sit.status === 'vencido' || x.sit.status === 'sem_historico')).length;

    box.innerHTML = `
        <div class="table-wrap" style="padding:14px">
            <div class="flex-between" style="margin-bottom:12px;gap:10px;flex-wrap:wrap">
                <div class="month-nav">
                    <button id="asoAgPrev" title="Ano anterior">‹</button>
                    <span class="month-label">${asoAno}</span>
                    <button id="asoAgNext" title="Próximo ano">›</button>
                </div>
                <div class="flex" style="gap:8px">
                    ${atrasados ? `<span class="badge badge-danger" title="Exames projetados para quem já está vencido ou nunca fez">${icon('alert')} ${atrasados} atrasado(s)</span>` : ''}
                    <button class="btn btn-secondary btn-filter${asoMostrarPrev ? ' active' : ''}" id="asoAgPrevBtn" title="Alternar projeção calculada">${icon('calendar')} Projeção</button>
                    ${asoFiltrosHtml('asoAgUni', 'asoAgCargo')}
                </div>
            </div>

            ${linhasFunc.length ? `
            <div class="gt-scroll">
                <div class="gt">
                    <div class="gt-row gt-head">
                        <div class="gt-lbl"></div>
                        <div class="gt-track gt-regua">${reguaMeses}</div>
                    </div>
                    ${linhasFunc.map(({ f, reais, prevista, sit }) => `
                        <div class="gt-row" data-fid="${f.id}">
                            <div class="gt-lbl" ${sit ? `title="${escapeHtml(sit.desc)}"` : ''}>
                                <div class="gt-nome">
                                    ${avatarHtml(f, 'xs')}
                                    <span class="gt-nome-txt">${escapeHtml(f.nome)}</span>
                                    ${seloSitAgenda(sit)}
                                </div>
                                <div class="gt-uni">${escapeHtml(unidadeNomeDe(f.unidadeId))}</div>
                            </div>
                            <div class="gt-track">
                                ${MESES.map((_, i) => `<span class="gt-grid" style="left:${pct(`${mesKey(asoAno, i)}-01`)}%"></span>`).join('')}
                                ${hojeNoAno ? `<span class="gt-hoje" style="left:${pct(hoje())}%"></span>` : ''}
                                ${reais.map(a => `
                                    <span class="gt-mark gt-mark-real" data-id="${a.id}" style="left:${pct(a.data)}%"
                                        title="${escapeHtml(`${a.tipo} · ${fmtDate(a.data)}${podeVerMedico() && a.resultado ? ' · ' + a.resultado : ''}`)}"></span>`).join('')}
                                ${prevista ? `
                                    <span class="gt-mark gt-mark-prev${sit && (sit.status === 'vencido' || sit.status === 'sem_historico') ? ' gt-mark-vencido' : ''}"
                                        data-prev="${f.id}" style="left:${pct(prevista.data)}%"
                                        title="${escapeHtml(`Projetado: ${fmtDate(prevista.data)}${sit ? ` — ${sit.desc}` : ''}`)}"></span>` : ''}
                            </div>
                        </div>`).join('')}
                </div>
            </div>
            <div class="gt-legenda">
                <span class="gt-leg"><span class="gt-chip gt-mark-chip gt-mark-real"></span>Lançado</span>
                <span class="gt-leg"><span class="gt-chip gt-mark-chip gt-mark-prev"></span>Projetado</span>
                <span class="gt-leg"><span class="gt-chip gt-mark-chip gt-mark-vencido"></span>Vencido / sem ASO</span>
            </div>`
            : `<p class="muted" style="text-align:center;padding:28px 0">Nenhum exame lançado ou projetado em ${asoAno}${asoFiltroUnidade || asoFiltroCargo ? ' com os filtros aplicados' : ''}.</p>`}
        </div>`;

    document.getElementById('asoAgPrevBtn').onclick = () => { asoMostrarPrev = !asoMostrarPrev; asoAgenda(); };
    const navAno = d => { asoAno += d; asoAgenda(); };
    document.getElementById('asoAgPrev').onclick = () => navAno(-1);
    document.getElementById('asoAgNext').onclick = () => navAno(1);
    asoBindFiltros('asoAgUni', 'asoAgCargo', asoAgenda);
    bindAvatarFotos(box);

    // Marco lançado → detalhe. Marco projetado → form pré-preenchido (não existe registro).
    box.querySelectorAll('.gt-mark[data-id]').forEach(el => {
        el.onclick = () => detalheAso(asoState.asos.find(x => x.id === el.dataset.id));
    });
    box.querySelectorAll('.gt-mark[data-prev]').forEach(el => {
        el.onclick = () => {
            if (!can('editar_lancamentos')) return;
            const fid = el.dataset.prev;
            const item = linhasFunc.find(x => x.f.id === fid);
            formAso({ funcionarioId: fid, tipo: ASO_TIPO_PERIODICO, data: item.prevista.data }, item.sit);
        };
    });
}

// ============ DETALHE ============
function detalheAso(a, onClose) {
    const medico = podeVerMedico();
    // Aberto também pela ficha do funcionário, quando a página Lançamentos nunca renderizou
    // e lancState está vazio — mesmo fallback que lancFuncNome usa.
    const f = lancState.funcionarios.find(x => x.id === a.funcionarioId)
        || funcState.funcionarios.find(x => x.id === a.funcionarioId);
    const cargo = f && (lancState.cargos.find(c => c.id === f.cargoId) || funcState.cargos.find(c => c.id === f.cargoId));
    // asoState.asos idem: se veio da ficha, usa o próprio registro como base mínima
    const sit = f ? situacaoAsoFunc(f, asoState.asos.length ? asoState.asos : [a], cargo) : null;

    abrirDetalheLanc({
        titulo: lancFuncNome(a.funcionarioId),
        funcionarioId: a.funcionarioId,
        sub: 'ASO — Atestado de Saúde Ocupacional',
        badgeHtml: `<span class="badge badge-accent">${escapeHtml(a.tipo || '—')}</span>`
            + (medico && a.resultado ? ' ' + badgeResultado(a.resultado) : ''),
        linhas: [
            ['Data do exame', fmtDate(a.data)],
            ['Tipo', escapeHtml(a.tipo || '—')],
            // Prazo é dado de gestão, não clínico: fica visível para todos.
            sit && sit.vencimento && a.tipo === ASO_TIPO_PERIODICO
                ? ['Próximo periódico', `${fmtDate(sit.vencimento)} <span class="muted">(a cada ${sit.meses} meses)</span>`]
                : null,
            ['Resultado', medico ? badgeResultado(a.resultado) : restritoHtml()],
            medico && a.resultado === 'Apto com restrições' ? ['Restrições', escapeHtml(a.restricoes || '—')] : null,
            ['Médico examinador', medico ? escapeHtml(a.medico || '—') : restritoHtml()],
            ['CRM', medico ? escapeHtml(a.crm || '—') : restritoHtml()],
            ['Observação', medico ? escapeHtml(a.obs || '—') : restritoHtml()]
        ],
        anexo: medico ? anexosDe(a) : [],
        // Propaga o retorno: editar/excluir a partir da ficha deve voltar para a ficha
        onEdit: () => formAso(a, null, onClose),
        onDelete: () => excluirAso(a, onClose),
        onClose
    });
}

const excluirAso = async (a, onDone) => {
    if (await confirmDialog({
        title: 'Excluir ASO',
        message: `Excluir o ASO ${escapeHtml(a.tipo || '')} de <strong>${escapeHtml(lancFuncNome(a.funcionarioId))}</strong> (${fmtDate(a.data)})?`,
        confirmText: 'Excluir', danger: true
    })) {
        await excluirAnexoRemoto(anexosDe(a));
        await DB.remove(PATHS.asos, a.id);
        toast('ASO excluído.');
        (onDone || renderLancTab)();
    }
};

// ============ FORMULÁRIO ============
// `sugerido`: situação vinda da Programação — o registro ainda não existe, não é edição.
// `onDone`: para onde voltar depois de salvar. O form é usado tanto pela aba ASO quanto
// pela ficha do funcionário; sem isso, salvar a partir da ficha tentaria re-renderizar
// uma aba de Lançamentos que não está na tela.
function formAso(a, sugerido, onDone) {
    const isEdit = !!a?.id;
    const selFunc = selectFuncionario('fasFunc', a?.funcionarioId);
    if (!selFunc) return toast('Nenhum funcionário ativo cadastrado.', 'info');

    // Sem ver_medico não dá para editar o que não se pode ver: o save reescreveria os
    // campos clínicos com vazio. Bloqueia a edição em vez de destruir dado em silêncio.
    if (isEdit && !podeVerMedico())
        return toast('Editar um ASO exige a permissão "Ver dados médicos".', 'error');

    const m = openModal({
        title: isEdit ? 'Editar ASO' : 'Lançar ASO',
        body: `
            ${sugerido?.desc ? `<div class="form-note form-note-${sugerido.status === 'em_dia' ? 'info' : 'alert'}">${icon('alert')} <span>${escapeHtml(sugerido.desc)}</span></div>` : ''}
            <div class="field"><label>Funcionário <span class="req">*</span></label>${selFunc}
                <div class="field-hint" id="fasIsentoHint" hidden></div>
            </div>
            <div class="form-row">
                <div class="field"><label>Tipo de exame <span class="req">*</span></label>
                    <select class="select" id="fasTipo">${ASO_TIPOS.map(t =>
                        `<option ${(a?.tipo || ASO_TIPO_PERIODICO) === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
                    <div class="field-hint" id="fasTipoHint"></div>
                </div>
                <div class="field"><label>Data do exame <span class="req">*</span></label>
                    <input class="input" id="fasData" type="date" max="${hoje()}" value="${a?.data || ''}">
                    <div class="field-hint">Data de realização — não pode ser futura.</div>
                </div>
            </div>
            <div class="field"><label>Resultado <span class="req">*</span></label>
                <select class="select" id="fasResultado">${ASO_RESULTADOS.map(r =>
                    `<option ${a?.resultado === r ? 'selected' : ''}>${r}</option>`).join('')}</select>
            </div>
            <div class="field" id="fasRestricoesBox" style="display:none">
                <label>Restrições <span class="req">*</span></label>
                <textarea class="input" id="fasRestricoes" rows="2" placeholder="Ex: não pode realizar esforço físico intenso por 90 dias">${escapeHtml(a?.restricoes || '')}</textarea>
                <div class="field-hint">Obrigatório quando o resultado é "Apto com restrições" — sem isso a restrição não chega a quem escala a equipe.</div>
            </div>
            <div class="form-row">
                <div class="field"><label>Médico examinador</label><input class="input" id="fasMedico" value="${escapeHtml(a?.medico || '')}" placeholder="Nome do médico"></div>
                <div class="field"><label>CRM</label><input class="input" id="fasCrm" value="${escapeHtml(a?.crm || '')}" placeholder="Ex: 123456/SP"></div>
            </div>
            <div class="field"><label>Observação</label><textarea class="input" id="fasObs" rows="2" placeholder="Detalhes (opcional)">${escapeHtml(a?.obs || '')}</textarea></div>
            <div class="field"><label>Laudo (PDF do ASO)</label><div id="fasAnexo"></div></div>`,
        footer: ''
    });

    bindSelectFuncionario(m.body, 'fasFunc', a?.funcionarioId);
    const anexoCtl = initAnexoField(m.body.querySelector('#fasAnexo'), anexosDe(a));
    const tipoEl = m.body.querySelector('#fasTipo');
    const dataEl = m.body.querySelector('#fasData');
    const resEl = m.body.querySelector('#fasResultado');
    const restrBox = m.body.querySelector('#fasRestricoesBox');
    const restrEl = m.body.querySelector('#fasRestricoes');
    const hintEl = m.body.querySelector('#fasTipoHint');

    // Só Admissional e Periódico reiniciam o ciclo — o form diz isso, não esconde.
    const HINTS = {
        'Admissional': 'Inicia a contagem do periódico.',
        'Periódico': 'Reinicia a contagem até o próximo exame.',
        'Demissional': 'Exame pontual — não reinicia o periódico.',
        'Retorno ao trabalho': 'Exame pontual — não reinicia o periódico.',
        'Mudança de risco': 'Exame pontual — não reinicia o periódico.'
    };
    const applyTipo = () => { hintEl.textContent = HINTS[tipoEl.value] || ''; };

    // Lançar continua permitido para cargo isento (um exame feito é um fato, e o histórico
    // deve guardá-lo) — mas o aviso evita a expectativa de que ele vá gerar próximo
    // vencimento: sem periodicidade, não há próximo periódico a calcular.
    const isentoHint = m.body.querySelector('#fasIsentoHint');
    const funcEl = m.body.querySelector('#fasFunc');
    const syncIsento = () => {
        const f = lancFuncObj(funcEl.value);
        const cargo = f && (lancState.cargos.find(c => c.id === f.cargoId) || funcState.cargos.find(c => c.id === f.cargoId));
        const isento = !!f && asoIsento(cargo);
        isentoHint.hidden = !isento;
        if (isento) isentoHint.innerHTML = `O cargo <strong>${escapeHtml(cargo?.nome || '')}</strong> está marcado como "ASO — Não se aplica": o exame fica registrado no histórico, mas não gera vencimento nem alerta.`;
    };
    funcEl.addEventListener('change', syncIsento);
    syncIsento();
    const applyResultado = () => { restrBox.style.display = resEl.value === 'Apto com restrições' ? '' : 'none'; };
    tipoEl.onchange = applyTipo;
    resEl.onchange = applyResultado;
    if (a?.tipo) tipoEl.value = a.tipo;
    if (sugerido && !a?.tipo) tipoEl.value = ASO_TIPO_PERIODICO;
    applyTipo();
    applyResultado();

    m.footer.innerHTML = `
        <button class="btn btn-secondary" data-cancel>Cancelar</button>
        <button class="btn btn-primary" data-save>${isEdit ? 'Salvar' : 'Lançar'}</button>`;
    m.footer.querySelector('[data-cancel]').onclick = m.close;
    const btnSave = m.footer.querySelector('[data-save]');
    btnSave.onclick = async () => {
        const fid = m.body.querySelector('#fasFunc').value;
        const data = dataEl.value;
        if (!data) return toast('Informe a data do exame.', 'error');
        // Mesma regra da admissão: exame que ainda não aconteceu não pode zerar um alerta
        // que está correndo. Sem isso, lançar um exame agendado apagaria o vencido de hoje.
        if (data > hoje()) return toast('A data do exame não pode ser futura.', 'error');
        const resultado = resEl.value;
        if (resultado === 'Apto com restrições' && !restrEl.value.trim())
            return toast('Descreva as restrições — elas orientam a escala da equipe.', 'error');

        // Exame duplicado no mesmo dia/tipo é quase sempre clique duplo, não dois exames.
        const dup = asoState.asos.find(x => x.id !== a?.id && x.funcionarioId === fid
            && x.data === data && x.tipo === tipoEl.value);
        if (dup) return toast(`Já existe um ASO ${tipoEl.value} para este funcionário em ${fmtDate(data)}.`, 'error');

        btnSave.disabled = true;
        btnSave.innerHTML = '<span class="spinner"></span> Salvando...';
        try {
            const { anexos, removidos } = await anexoCtl.getAnexos();
            await DB.save(PATHS.asos, a?.id || null, {
                funcionarioId: fid,
                tipo: tipoEl.value,
                data,
                resultado,
                restricoes: resultado === 'Apto com restrições' ? restrEl.value.trim() : '',
                medico: m.body.querySelector('#fasMedico').value.trim(),
                crm: m.body.querySelector('#fasCrm').value.trim(),
                obs: m.body.querySelector('#fasObs').value.trim(),
                anexos
            });
            await excluirAnexoRemoto(removidos);
            toast(isEdit ? 'ASO atualizado.' : 'ASO lançado.');
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
