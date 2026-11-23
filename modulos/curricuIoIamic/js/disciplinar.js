// ===== Medidas disciplinares — notificação, advertência e suspensão =====
//
// Arquivo próprio pelo mesmo motivo do ASO e da CAT: lancamentos.js já passa de 2.900 linhas.
//
// A medida disciplinar é o exercício do poder diretivo do empregador. O que o sistema registra
// aqui é a PENALIDADE APLICADA — um fato datado, com ciência do colaborador e documento
// assinado. Não há status "revogada": corrigir é editar ou excluir, como nas demais abas.
//
// A SUSPENSÃO gera dias parados, mas eles continuam sendo lançados em Faltas e Licenças e aqui
// só se REFERENCIA a ausência (ausenciaId) — mesmo padrão da CAT. Duas fontes para os mesmos
// dias fariam a ficha e a folha divergirem.
//
// Cuidado com as duas réguas de data: `fim` aqui é INCLUSIVO (é o último dia de punição no
// documento que o colaborador assinou), enquanto rh_ausencias.retorno é EXCLUSIVO (é o dia em
// que a pessoa volta). O papel disciplinar diz "suspenso de 10 a 12"; a ausência diz "volta dia
// 13". Por isso dias = diasEntre(inicio, fim) + 1, e derivar de uma ausência usa fim = retorno - 1.
//
// Base legal que o formulário cobra:
//   • CLT art. 474 — suspensão por mais de 30 dias importa em rescisão injusta do contrato.
//   • Imediatidade — punir muito depois do fato enfraquece a medida (perdão tácito).
//   • Non bis in idem — o mesmo fato não se pune duas vezes.
//   • Gradação da pena — suspensão sem advertência prévia é questionável, salvo falta grave.
// Nenhuma dessas regras (fora o teto do art. 474) bloqueia o registro: elas avisam. Quem decide
// a penalidade é o RH, e o sistema documenta o que foi decidido, não o que deveria ter sido.
//
// LGPD: o relato do fato, o motivo detalhado, quem aplicou, as testemunhas e o documento são
// dado de conduta — ficam atrás de `ver_disciplinar`, mesma régua de `ver_medico` no ASO/CAT.
// Sem a permissão a aba continua útil: tipo, data, período da suspensão e ciência são gestão
// (impactam escala e folha), não julgamento. A EXISTÊNCIA da medida nunca é escondida — ocultá-la
// distorceria a trajetória do colaborador; o que se oculta é o conteúdo do episódio.
//
// A aba e a permissão sensível são OPT-IN: grupos de acesso que já existem não as recebem
// automaticamente (expandirPerms só cobre o caso legado). Um admin precisa marcar
// "Medidas disciplinares" e "Dados disciplinares" em Configurações → Grupos.

const DISC_NOTIFICACAO = 'Notificação';
const DISC_ADVERTENCIA = 'Advertência';
const DISC_SUSPENSAO = 'Suspensão';
const DISC_TIPOS = [DISC_NOTIFICACAO, DISC_ADVERTENCIA, DISC_SUSPENSAO];

// Degrau da pena. Usado só para AVISAR quando a medida pula ou retrocede em relação ao que já
// foi aplicado nos últimos 12 meses — a decisão continua sendo de quem está registrando.
const DISC_GRAU = {
    [DISC_NOTIFICACAO]: 1,
    [DISC_ADVERTENCIA]: 2,
    [DISC_SUSPENSAO]: 3
};

const DISC_TIPO_CLS = {
    [DISC_NOTIFICACAO]: 'badge-info',
    [DISC_ADVERTENCIA]: 'badge-warning',
    [DISC_SUSPENSAO]: 'badge-danger'
};

// Cor do evento na linha do tempo da ficha — mesma leitura de gravidade da badge da tabela.
const DISC_TIPO_TL = {
    [DISC_NOTIFICACAO]: 'info',
    [DISC_ADVERTENCIA]: 'warning',
    [DISC_SUSPENSAO]: 'danger'
};

const DISC_TIPO_HINT = {
    [DISC_NOTIFICACAO]: 'Registro formal do fato, sem penalidade. Serve de base à gradação.',
    [DISC_ADVERTENCIA]: 'Penalidade sem perda de remuneração. Costuma preceder a suspensão.',
    [DISC_SUSPENSAO]: 'Afastamento punitivo sem remuneração. Acima de 30 dias a CLT (art. 474) converte em rescisão injusta.'
};

const DISC_MOTIVOS = [
    'Atraso reiterado', 'Falta injustificada', 'Abandono de posto',
    'Descumprimento de norma interna', 'Descumprimento de norma de segurança / EPI',
    'Insubordinação', 'Indisciplina', 'Desídia no desempenho',
    'Conduta inadequada com colegas', 'Conduta inadequada com cliente',
    'Dano a patrimônio da empresa', 'Uso indevido de recurso da empresa'
];

// Última opção da lista: abre um campo de texto e o que for digitado vira o próprio `motivo`.
// Gravar 'Outro' e jogar o motivo real na descrição faria a tabela e a ficha exibirem "Outro"
// numa coluna que existe justamente para dizer o porquê da penalidade.
const DISC_MOTIVO_LIVRE = '__livre__';
const DISC_MOTIVO_LIVRE_LABEL = 'Descreva o motivo';

// Falta grave dispensa a gradação: ninguém precisa advertir antes de suspender quem se recusou
// a usar EPI. Cobrar gradação nesses casos treinaria o usuário a ignorar o aviso.
const DISC_MOTIVOS_GRAVES = [
    'Insubordinação', 'Dano a patrimônio da empresa',
    'Descumprimento de norma de segurança / EPI', 'Abandono de posto'
];

const DISC_CIENCIA = ['Assinou', 'Recusou a assinar', 'Com testemunhas'];
const DISC_CIENCIA_CLS = {
    'Assinou': 'badge-success',
    'Recusou a assinar': 'badge-danger',
    'Com testemunhas': 'badge-neutral'
};

// CLT art. 474 — teto absoluto, não recomendação.
const DISC_MAX_DIAS_CLT = 30;
// Suspensão longa é rara na prática; acima disso costuma ser erro de digitação na data fim.
const DISC_SUSPENSAO_LONGA = 5;
// Janela de leitura de reincidência e gradação. Penalidade antiga não sustenta gradação — o
// poder disciplinar é imediato.
const DISC_JANELA_MESES = 12;

const discState = { itens: [], ausencias: [] };
let discFiltroUnidade = '';
let discFiltroCargo = '';
let discFiltroTipo = '';   // '' = todos

const podeVerDisciplinar = () => can('ver_disciplinar');

// Marcador de dado oculto — honesto sobre a existência do dado sem revelar o conteúdo.
const discRestritoHtml = () =>
    `<span class="muted" title="Requer a permissão 'Dados disciplinares'">${icon('lock')} restrito</span>`;

const discPassaFiltro = f =>
    (!discFiltroUnidade || f.unidadeId === discFiltroUnidade) &&
    (!discFiltroCargo || f.cargoId === discFiltroCargo);

const badgeTipoDisc = t => t
    ? `<span class="badge ${DISC_TIPO_CLS[t] || 'badge-neutral'}">${escapeHtml(t)}</span>`
    : '<span class="muted">—</span>';

const badgeCienciaDisc = c => c
    ? `<span class="badge ${DISC_CIENCIA_CLS[c] || 'badge-neutral'}">${escapeHtml(c)}</span>`
    : '<span class="muted">—</span>';

// Dias de suspensão: o que está na ausência vinculada manda, porque é ela que a ficha e a folha
// usam. O número gravado aqui é o que o documento disciplinar declarou.
const discDias = d => {
    if (d.tipo !== DISC_SUSPENSAO) return 0;
    const aus = d.ausenciaId && discState.ausencias.find(a => a.id === d.ausenciaId);
    if (aus) return Number(aus.dias) || diasEntre(aus.inicio, aus.retorno) || 0;
    if (Number(d.dias)) return Number(d.dias);
    return d.inicio && d.fim ? (diasEntre(d.inicio, d.fim) + 1) : 0;
};

// Histórico do colaborador, mais recente primeiro. `ateData` exclui a própria medida em edição
// do cálculo de gradação — senão ela contaria como antecedente de si mesma.
const discDoFunc = (fid, exceptId) => discState.itens
    .filter(d => d.funcionarioId === fid && d.id !== exceptId)
    .sort((a, b) => (b.data || '').localeCompare(a.data || ''));

const discNaJanela = (fid, ref, exceptId) => {
    const corte = addMeses(ref || hoje(), -DISC_JANELA_MESES);
    return discDoFunc(fid, exceptId).filter(d => (d.data || '') >= corte && (d.data || '') <= (ref || hoje()));
};

// Maior degrau já aplicado na janela — base do aviso de salto/retrocesso.
const discMaiorGrau = (fid, ref, exceptId) =>
    discNaJanela(fid, ref, exceptId).reduce((mx, d) => Math.max(mx, DISC_GRAU[d.tipo] || 0), 0);

// ---- Filtros de unidade/cargo (mesmo padrão de catFiltrosHtml) ----
function discFiltrosHtml(idUni, idCargo) {
    const un = lancState.unidades.find(u => u.id === discFiltroUnidade);
    const cg = lancState.cargos.find(c => c.id === discFiltroCargo);
    return `
        <button class="btn btn-secondary btn-filter${discFiltroUnidade ? ' active' : ''}" id="${idUni}">${icon('building')} ${escapeHtml(un?.nome || 'Todas as unidades')}</button>
        <button class="btn btn-secondary btn-filter${discFiltroCargo ? ' active' : ''}" id="${idCargo}">${icon('briefcase')} ${escapeHtml(cg?.nome || 'Todos os cargos')}</button>`;
}

function discBindFiltros(idUni, idCargo, rerender) {
    const unis = lancState.unidades.slice().sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    const cargos = lancState.cargos.slice().sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    const bUni = document.getElementById(idUni);
    if (bUni) bUni.onclick = () => openFilterPopover(bUni, {
        allLabel: 'Todas as unidades',
        options: unis.map(u => ({ value: u.id, label: u.nome })),
        value: discFiltroUnidade,
        searchable: unis.length > 6,
        onPick: v => { discFiltroUnidade = v; rerender(); }
    });
    const bCargo = document.getElementById(idCargo);
    if (bCargo) bCargo.onclick = () => openFilterPopover(bCargo, {
        allLabel: 'Todos os cargos',
        options: cargoOpcoes(cargos),
        value: discFiltroCargo,
        searchable: cargos.length > 6,
        onPick: v => { discFiltroCargo = v; rerender(); }
    });
}

// ============ ABA ============
// As ausências vêm junto porque a suspensão pode estar vinculada a um afastamento lançado em
// Faltas e Licenças — sem elas o detalhe mostraria o vínculo como texto morto.
async function renderDisciplinar() {
    const [itens, ausencias] = await Promise.all([
        DB.getAll(PATHS.disciplinares),
        DB.getAll(PATHS.ausencias)
    ]);
    discState.itens = itens.sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    discState.ausencias = ausencias;
    discTabela();
}

function discTabela() {
    const cont = document.getElementById('lancContent');
    const podeEditar = can('editar_lancamentos');
    const verDet = podeVerDisciplinar();

    const lista = discState.itens.filter(d => {
        const f = lancFuncObj(d.funcionarioId);
        return f ? discPassaFiltro(f) : true;
    });

    // Janela de 12 meses: é a régua com que a reincidência é lida na prática, e a mesma que o
    // formulário usa para avisar sobre gradação.
    const corte = addMeses(hoje(), -DISC_JANELA_MESES);
    const recentes = lista.filter(d => (d.data || '') >= corte);
    const suspensoes = recentes.filter(d => d.tipo === DISC_SUSPENSAO);
    const diasSusp = suspensoes.reduce((s, d) => s + discDias(d), 0);
    // Reincidente: duas ou mais medidas na janela. É o número que antecipa a próxima rescisão
    // por justa causa — e o único da faixa que fala de pessoa, não de volume.
    const porFunc = {};
    recentes.forEach(d => { porFunc[d.funcionarioId] = (porFunc[d.funcionarioId] || 0) + 1; });
    const reincidentes = Object.values(porFunc).filter(n => n >= 2).length;

    // Todos os KPIs são contagem, não conteúdo: continuam válidos sem ver_disciplinar.
    const kpis = [
        [fmtNum(recentes.length), 'Medidas nos últimos 12 meses', recentes.length ? 'vencida' : 'aquisitivo'],
        [fmtNum(suspensoes.length), 'Suspensões (12 meses)', suspensoes.length ? 'critica' : 'aquisitivo'],
        [fmtNum(diasSusp), 'Dias de suspensão (12 meses)', diasSusp ? 'critica' : 'aquisitivo'],
        [fmtNum(reincidentes), 'Colaboradores reincidentes', reincidentes ? 'vencida' : 'aquisitivo']
    ];

    const chipTipo = t => `<button class="btn btn-sm ${discFiltroTipo === t ? 'btn-primary' : 'btn-secondary'}" data-disc-tipo="${escapeHtml(t)}">${escapeHtml(t || 'Todas')}</button>`;

    cont.innerHTML = `
        <div class="flex-between" style="margin-bottom:14px;gap:10px">
            <div class="page-sub">Notificações, advertências e suspensões — o documento assinado pelo colaborador fica anexado ao registro.</div>
            ${!verDet ? `<span class="badge badge-neutral" title="Você vê tipo, data, período e ciência, mas não o motivo detalhado nem o relato do fato.">${icon('lock')} Dados disciplinares ocultos</span>` : ''}
        </div>
        <div class="prog-resumo">
            ${kpis.map(([n, txt, cls]) => `
                <div class="prog-kpi prog-${cls}">
                    <span class="prog-n">${n}</span>
                    <span class="prog-lbl">${txt}</span>
                </div>`).join('')}
        </div>
        <div class="table-wrap">
            <div class="table-toolbar">
                <div class="search-box">${icon('search')}<input class="input" id="lancSearch" placeholder="Buscar por funcionário..."></div>
                ${discFiltrosHtml('discUni', 'discCargo')}
                <div class="grow"></div>
                ${podeEditar ? `<button class="btn btn-primary" id="lancNew">${icon('plus')} Registrar medida</button>` : ''}
            </div>
            <div class="flex" style="gap:6px;padding:0 14px 12px;flex-wrap:wrap">
                ${['', ...DISC_TIPOS].map(chipTipo).join('')}
            </div>
            <div class="table-scroll">
                <table class="table">
                    <thead><tr>
                        <th>Funcionário</th><th>Tipo</th><th>Data</th><th>Motivo</th>
                        <th title="Período da suspensão — do lançamento vinculado em Faltas e Licenças, quando houver">Período</th>
                        <th title="Como o colaborador tomou ciência da medida">Ciência</th>
                        <th title="Documento assinado, comunicado, evidências">Documento</th>
                        <th style="width:48px"></th>
                    </tr></thead>
                    <tbody id="lancTbody">${lista.map(d => {
                        const dias = discDias(d);
                        // O motivo fica fora do data-search quando oculto: uma busca que acha a
                        // linha por um termo que o usuário não pode ler vaza o dado assim mesmo.
                        const busca = (lancFuncNome(d.funcionarioId) + ' ' + (d.tipo || '')
                            + (verDet ? ' ' + (d.motivo || '') : '')).toLowerCase();
                        return `
                        <tr data-id="${d.id}" data-disc="${escapeHtml(d.tipo || '')}" data-search="${escapeHtml(busca)}">
                            <td>${lancFuncCellHtml(d.funcionarioId)}</td>
                            <td>${badgeTipoDisc(d.tipo)}</td>
                            <td>${fmtDate(d.data)}</td>
                            <td class="text-2">${verDet ? escapeHtml(d.motivo || '—') : discRestritoHtml()}</td>
                            <td class="text-2">${d.tipo === DISC_SUSPENSAO && d.inicio
                                ? `${fmtDate(d.inicio)} → ${fmtDate(d.fim)}<div class="prog-aq"><strong>${fmtNum(dias)}</strong> dia(s) · ${d.ausenciaId ? 'vinculada' : 'sem lançamento'}</div>`
                                : '<span class="muted">—</span>'}</td>
                            <td>${badgeCienciaDisc(d.ciencia)}</td>
                            <td>${verDet
                                ? (anexosDe(d).length ? anexoChip(anexosDe(d)) : `<span class="badge badge-warning" title="A medida foi registrada, mas o documento assinado não está arquivado aqui">${icon('alert')} pendente</span>`)
                                : discRestritoHtml()}</td>
                            <td>${podeEditar ? `<button class="btn-icon" data-menu>${icon('dots')}</button>` : ''}</td>
                        </tr>`;
                    }).join('')}</tbody>
                </table>
            </div>
        </div>`;

    if (!lista.length) {
        document.getElementById('lancTbody').innerHTML =
            `<tr><td colspan="8"><div class="table-empty">${icon('check')}<span>Nenhuma medida disciplinar registrada${discFiltroUnidade || discFiltroCargo ? ' com os filtros aplicados' : ''}.</span></div></td></tr>`;
    }

    const aplicar = () => lancAplicaFiltros(tr => !discFiltroTipo || tr.dataset.disc === discFiltroTipo);
    const btnNew = document.getElementById('lancNew');
    if (btnNew) btnNew.onclick = () => formDisciplinar(null);
    document.getElementById('lancSearch').addEventListener('input', aplicar);
    cont.querySelectorAll('button[data-disc-tipo]').forEach(b => {
        b.onclick = () => { discFiltroTipo = b.dataset.discTipo; discTabela(); };
    });
    discBindFiltros('discUni', 'discCargo', discTabela);
    bindLancFuncCells(document.getElementById('lancTbody'));
    if (verDet) bindAnexoChips(document.getElementById('lancTbody'),
        el => anexosDe(discState.itens.find(x => x.id === el.closest('tr').dataset.id)));
    aplicar();

    cont.querySelectorAll('#lancTbody tr[data-id]').forEach(tr => {
        const d = discState.itens.find(x => x.id === tr.dataset.id);
        lancRowClick(tr, () => detalheDisciplinar(d));
        lancRowMenu(tr, [
            { label: 'Ver detalhes', icon: 'eye', onClick: () => detalheDisciplinar(d) },
            { label: 'Editar', icon: 'edit', onClick: () => formDisciplinar(d) },
            'sep',
            { label: 'Excluir', icon: 'trash', danger: true, onClick: () => excluirDisciplinar(d) }
        ]);
    });
}

// ============ DETALHE ============
function detalheDisciplinar(d, onClose) {
    const verDet = podeVerDisciplinar();
    // Aberto também pela ficha do funcionário, quando a página Lançamentos nunca renderizou:
    // ali discState.ausencias pode estar vazio e o vínculo não vira link — o período e os dias
    // gravados na própria medida continuam aparecendo.
    const aus = d.ausenciaId ? discState.ausencias.find(a => a.id === d.ausenciaId) : null;
    const dias = discDias(d);

    const linhaPeriodo = d.tipo === DISC_SUSPENSAO
        ? (aus
            ? `${fmtDate(d.inicio)} → ${fmtDate(d.fim)} · <strong>${fmtNum(dias)}</strong> dia(s) — <button type="button" class="link-inline" data-abrir-aus>${escapeHtml(aus.tipo || 'afastamento')} · ${fmtDate(aus.inicio)} → ${fmtDate(aus.retorno)}</button>`
            : `${fmtDate(d.inicio)} → ${fmtDate(d.fim)} · <strong>${fmtNum(dias)}</strong> dia(s) <span class="muted">(sem lançamento vinculado em Faltas e Licenças)</span>`)
        : null;

    const det = abrirDetalheLanc({
        titulo: lancFuncNome(d.funcionarioId),
        funcionarioId: d.funcionarioId,
        sub: 'Medida disciplinar',
        badgeHtml: badgeTipoDisc(d.tipo) + ' ' + badgeCienciaDisc(d.ciencia)
            + (d.reflexoFolha ? ` <span class="badge badge-warning">${icon('money')} Reflexo em folha</span>` : ''),
        linhas: [
            ['Data de aplicação', fmtDate(d.data)],
            verDet && d.dataFato ? ['Data do fato', fmtDate(d.dataFato)] : null,
            ['Motivo', verDet ? escapeHtml(d.motivo || '—') : discRestritoHtml()],
            ['Descrição do fato', verDet ? escapeHtml(d.descricao || '—') : discRestritoHtml()],
            ['Aplicada por', verDet
                ? `${escapeHtml(d.aplicadorNome || '—')}${d.aplicadorCargo ? ` <span class="muted">· ${escapeHtml(d.aplicadorCargo)}</span>` : ''}`
                : discRestritoHtml()],
            ['Ciência do colaborador', escapeHtml(d.ciencia || '—')],
            d.ciencia && d.ciencia !== 'Assinou'
                ? ['Testemunhas', verDet ? escapeHtml(d.testemunhas || '—') : discRestritoHtml()]
                : null,
            linhaPeriodo ? ['Período da suspensão', linhaPeriodo] : null,
            ['Reflexo em folha', d.reflexoFolha ? 'Sim — desconto de dias/DSR no mês' : 'Não'],
            ['Observação', verDet ? escapeHtml(d.obs || '—') : discRestritoHtml()]
        ],
        anexo: verDet ? anexosDe(d) : [],
        // Propaga o retorno: editar/excluir a partir da ficha deve voltar para a ficha
        onEdit: () => formDisciplinar(d, null, onClose),
        onDelete: () => excluirDisciplinar(d, onClose),
        onClose
    });

    // A suspensão vinculada abre o detalhe da ausência; fechar aquele traz de volta a esta
    // medida, senão o usuário perde o contexto de onde clicou.
    const bAus = det.body.querySelector('[data-abrir-aus]');
    if (bAus) bAus.onclick = () => { det.close(); detalheAusencia(aus, null, () => detalheDisciplinar(d, onClose)); };
}

const excluirDisciplinar = async (d, onDone) => {
    if (await confirmDialog({
        title: 'Excluir medida disciplinar',
        message: `Excluir a ${escapeHtml((d.tipo || 'medida').toLowerCase())} de <strong>${escapeHtml(lancFuncNome(d.funcionarioId))}</strong> (${fmtDate(d.data)})?<br><span class="muted">O afastamento lançado em Faltas e Licenças não é excluído. Excluir a medida apaga o antecedente que sustenta a gradação de futuras penalidades.</span>`,
        confirmText: 'Excluir', danger: true
    })) {
        await excluirAnexoRemoto(anexosDe(d));
        await DB.remove(PATHS.disciplinares, d.id);
        toast('Medida disciplinar excluída.');
        (onDone || renderLancTab)();
    }
};

// ============ FORMULÁRIO ============
// `onDone`: para onde voltar depois de salvar. O form é usado tanto pela aba quanto pela ficha
// do funcionário; sem isso, salvar a partir da ficha tentaria re-renderizar uma aba de
// Lançamentos que não está na tela.
function formDisciplinar(d, _sugerido, onDone) {
    const isEdit = !!d?.id;
    const selFunc = selectFuncionario('fdiscFunc', d?.funcionarioId);
    if (!selFunc) return toast('Nenhum funcionário ativo cadastrado.', 'info');

    // Sem ver_disciplinar não dá para editar o que não se pode ver: o save reescreveria motivo,
    // descrição, aplicador e testemunhas com vazio. Bloqueia em vez de destruir dado em silêncio.
    if (isEdit && !podeVerDisciplinar())
        return toast('Editar uma medida disciplinar exige a permissão "Dados disciplinares".', 'error');

    const opts = (lista, sel, vazio) =>
        (vazio ? `<option value="">${vazio}</option>` : '')
        + lista.map(t => `<option ${sel === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('');

    // Motivo gravado que não está no catálogo veio do campo livre — reabre nele, e não vazio.
    // Registro antigo gravado como 'Outro' cai aqui e continua editável.
    const motivoCatalogado = !!d?.motivo && DISC_MOTIVOS.includes(d.motivo);
    const motivoLivre = d?.motivo && !motivoCatalogado ? d.motivo : '';

    const m = openModal({
        title: isEdit ? 'Editar medida disciplinar' : 'Registrar medida disciplinar',
        body: `
            <div class="field"><label>Funcionário <span class="req">*</span></label>${selFunc}</div>
            <div id="fdiscHistorico"></div>
            <div class="form-row">
                <div class="field"><label>Tipo <span class="req">*</span></label>
                    <select class="select" id="fdiscTipo">${opts(DISC_TIPOS, d?.tipo || DISC_NOTIFICACAO)}</select>
                    <div class="field-hint" id="fdiscTipoHint"></div>
                </div>
                <div class="field"><label>Motivo <span class="req">*</span></label>
                    <button type="button" id="fdiscMotivo"></button>
                    <input class="input mt-8" id="fdiscMotivoLivre" style="display:none" maxlength="120"
                        value="${escapeHtml(motivoLivre)}" placeholder="Qual foi o motivo da medida">
                </div>
            </div>
            <div class="form-row">
                <div class="field"><label>Data de aplicação <span class="req">*</span></label>
                    <input class="input" id="fdiscData" type="date" max="${hoje()}" value="${d?.data || ''}">
                    <div class="field-hint">Quando a medida foi entregue ao colaborador.</div>
                </div>
                <div class="field"><label>Data do fato</label>
                    <input class="input" id="fdiscDataFato" type="date" max="${hoje()}" value="${d?.dataFato || ''}">
                    <div class="field-hint">Quando a ocorrência aconteceu — punir muito depois enfraquece a medida.</div>
                </div>
            </div>
            <div class="field"><label>Descrição do fato <span class="req">*</span></label>
                <textarea class="input" id="fdiscDescricao" rows="3" placeholder="O que aconteceu, quando e em que circunstância — é o que sustenta a medida em eventual litígio">${escapeHtml(d?.descricao || '')}</textarea>
            </div>
            <div class="form-row">
                <div class="field"><label>Aplicada por <span class="req">*</span></label>
                    <input class="input" id="fdiscAplicador" value="${escapeHtml(d?.aplicadorNome || '')}" placeholder="Nome de quem aplicou a medida">
                </div>
                <div class="field"><label>Cargo / função</label>
                    <input class="input" id="fdiscAplicadorCargo" value="${escapeHtml(d?.aplicadorCargo || '')}" placeholder="Ex: Coordenador de laboratório">
                </div>
            </div>
            <div class="form-row">
                <div class="field"><label>Ciência do colaborador <span class="req">*</span></label>
                    <select class="select" id="fdiscCiencia">${opts(DISC_CIENCIA, d?.ciencia || 'Assinou')}</select>
                </div>
                <div class="field" id="fdiscTestBox" style="display:none"><label>Testemunhas <span class="req">*</span></label>
                    <input class="input" id="fdiscTestemunhas" value="${escapeHtml(d?.testemunhas || '')}" placeholder="Nomes separados por vírgula">
                    <div class="field-hint">A recusa de assinatura só se prova com testemunhas nomeadas.</div>
                </div>
            </div>
            <div id="fdiscSuspBox" style="display:none">
                <div class="form-row">
                    <div class="field"><label>Início da suspensão <span class="req">*</span></label>
                        <input class="input" id="fdiscInicio" type="date" value="${d?.inicio || ''}">
                    </div>
                    <div class="field"><label>Último dia <span class="req">*</span></label>
                        <input class="input" id="fdiscFim" type="date" value="${d?.fim || ''}">
                        <div class="field-hint">Último dia de punição, não o dia do retorno.</div>
                    </div>
                    <div class="field"><label>Dias</label>
                        <input class="input" id="fdiscDias" type="number" min="1" value="${d?.dias || ''}">
                    </div>
                </div>
                <div class="field"><label>Afastamento relacionado</label>
                    <button type="button" class="input select-picker" id="fdiscAusBtn">
                        <span class="select-picker-lbl muted" id="fdiscAusLbl">Nenhum / lançar depois</span>
                        ${icon('chevronDown')}
                    </button>
                    <input type="hidden" id="fdiscAusId" value="${d?.ausenciaId || ''}">
                </div>
                <div class="form-note form-note-info">${icon('info')}
                    <span>Os dias que contam na ficha e na folha são os do lançamento em <strong>Faltas e Licenças</strong> — vincule o afastamento existente ou
                    <button type="button" class="link-inline" id="fdiscAusNovo">lance a ausência agora</button>.</span>
                </div>
            </div>
            <div class="toggle-cards" style="margin-bottom:14px">
                <label class="toggle-card">
                    <div class="grow"><strong>Reflexo em folha</strong><span>Desconto de dias e DSR no mês</span></div>
                    <span class="switch"><input type="checkbox" id="fdiscFolha" ${d?.reflexoFolha ? 'checked' : ''}><span class="track"></span></span>
                </label>
            </div>
            <div class="field"><label>Observação</label>
                <textarea class="input" id="fdiscObs" rows="2" placeholder="Detalhes de gestão (opcional)">${escapeHtml(d?.obs || '')}</textarea>
            </div>
            <div class="field"><label>Documentos (medida assinada, comunicado, evidências)</label><div id="fdiscAnexo"></div></div>`,
        footer: ''
    });

    bindSelectFuncionario(m.body, 'fdiscFunc', d?.funcionarioId);
    const anexoCtl = initAnexoField(m.body.querySelector('#fdiscAnexo'), anexosDe(d));

    // Motivo em popover: a lista tem 12 itens e ganha busca, o que um <select> nativo não dá.
    const motivoEl = m.body.querySelector('#fdiscMotivo');
    const motivoLivreEl = m.body.querySelector('#fdiscMotivoLivre');
    const applyMotivo = () => {
        const livre = motivoEl.value === DISC_MOTIVO_LIVRE;
        motivoLivreEl.style.display = livre ? '' : 'none';
        if (livre) motivoLivreEl.focus();
    };
    initPickerField(motivoEl, {
        options: [
            ...DISC_MOTIVOS.map(t => ({ value: t, label: t })),
            { value: DISC_MOTIVO_LIVRE, label: DISC_MOTIVO_LIVRE_LABEL, sub: 'Escrever um motivo que não está na lista', icon: 'edit' }
        ],
        value: motivoLivre ? DISC_MOTIVO_LIVRE : (d?.motivo || ''),
        placeholder: 'Selecione o motivo',
        onPick: applyMotivo
    });
    applyMotivo();

    const el = id => m.body.querySelector('#' + id);
    const funcEl = el('fdiscFunc'), tipoEl = el('fdiscTipo'), dataEl = el('fdiscData');
    const cienciaEl = el('fdiscCiencia'), testBox = el('fdiscTestBox');
    const suspBox = el('fdiscSuspBox'), inicioEl = el('fdiscInicio'), fimEl = el('fdiscFim'), diasEl = el('fdiscDias');
    const ausIdEl = el('fdiscAusId'), ausLblEl = el('fdiscAusLbl'), histBox = el('fdiscHistorico');

    // Painel de antecedentes: mostrado ao escolher o funcionário, antes de escolher o tipo. A
    // gradação vira decisão informada em vez de aviso tardio no save — e sem ver_disciplinar
    // não aparece, porque listar as medidas anteriores é justamente o dado protegido.
    const syncHistorico = () => {
        if (!podeVerDisciplinar() || !funcEl.value) { histBox.innerHTML = ''; return; }
        const ant = discNaJanela(funcEl.value, dataEl.value || hoje(), d?.id);
        if (!ant.length) {
            histBox.innerHTML = `<div class="form-note form-note-aquisitivo">${icon('check')}
                <span>Sem medidas disciplinares nos últimos ${DISC_JANELA_MESES} meses.</span></div>`;
            return;
        }
        const resumo = ant.slice(0, 4).map(x => `${escapeHtml(x.tipo)} (${fmtDate(x.data)})`).join(' · ');
        const grau = discMaiorGrau(funcEl.value, dataEl.value || hoje(), d?.id);
        const sugerido = DISC_TIPOS[Math.min(grau, DISC_TIPOS.length - 1)];
        histBox.innerHTML = `<div class="form-note form-note-critica">${icon('alert')}
            <span><strong>${ant.length} medida(s)</strong> nos últimos ${DISC_JANELA_MESES} meses: ${resumo}${ant.length > 4 ? ' …' : ''}.
            Próximo degrau da gradação: <strong>${escapeHtml(sugerido)}</strong>.</span></div>`;
    };

    const applyTipo = () => {
        el('fdiscTipoHint').textContent = DISC_TIPO_HINT[tipoEl.value] || '';
        suspBox.style.display = tipoEl.value === DISC_SUSPENSAO ? '' : 'none';
    };

    const applyCiencia = () => {
        testBox.style.display = cienciaEl.value === 'Assinou' ? 'none' : '';
    };

    // Só afastamentos do funcionário escolhido — vincular a ausência de outra pessoa é sempre
    // erro, então nem entra na lista. Férias ficam de fora: não são afastamento punitivo.
    const ausenciasDoFunc = () => discState.ausencias
        .filter(a => a.funcionarioId === funcEl.value && a.tipo !== TIPO_FERIAS)
        .sort((a, b) => (b.inicio || '').localeCompare(a.inicio || ''));

    const ausLabel = a => `${a.tipo || 'Ausência'} · ${fmtDate(a.inicio)} → ${fmtDate(a.retorno)} (${fmtNum(a.dias ?? diasEntre(a.inicio, a.retorno))}d)`;

    const syncAusLbl = () => {
        const a = discState.ausencias.find(x => x.id === ausIdEl.value);
        ausLblEl.textContent = a ? ausLabel(a) : 'Nenhum / lançar depois';
        ausLblEl.classList.toggle('muted', !a);
        // Vinculada, o período vem do lançamento — digitar outras datas aqui criaria uma segunda
        // verdade sobre os mesmos dias. `retorno` é exclusivo e `fim` é inclusivo: daí o -1.
        const travar = !!a;
        if (a) {
            inicioEl.value = a.inicio || '';
            fimEl.value = a.retorno ? addDias(a.retorno, -1) : '';
            diasEl.value = a.dias ?? diasEntre(a.inicio, a.retorno) ?? '';
        }
        [inicioEl, fimEl, diasEl].forEach(x => { x.readOnly = travar; });
    };

    // Datas e dias são a mesma informação vista de dois jeitos: quem digita o período quer o
    // total calculado, quem digita o total quer a data fim calculada.
    const recalcDias = () => {
        if (diasEl.readOnly) return;
        if (inicioEl.value && fimEl.value && fimEl.value >= inicioEl.value)
            diasEl.value = diasEntre(inicioEl.value, fimEl.value) + 1;
    };
    const recalcFim = () => {
        if (fimEl.readOnly) return;
        const n = Number(diasEl.value);
        if (inicioEl.value && n >= 1) fimEl.value = addDias(inicioEl.value, n - 1);
    };

    el('fdiscAusBtn').onclick = e => {
        const lista = ausenciasDoFunc();
        openFilterPopover(e.currentTarget, {
            allLabel: 'Nenhum / lançar depois',
            options: lista.map(a => ({ value: a.id, label: ausLabel(a) })),
            value: ausIdEl.value,
            searchable: lista.length > 6,
            onPick: v => { ausIdEl.value = v; syncAusLbl(); }
        });
    };

    // Atalho para lançar a ausência: o form é o mesmo de Faltas e Licenças. Nada é gravado
    // automaticamente daqui — quem decide o tipo e o período do afastamento é o RH.
    el('fdiscAusNovo').onclick = () => {
        if (!can('editar_lancamentos')) return;
        if (!funcEl.value) return toast('Selecione o funcionário primeiro.', 'error');
        // O 3º argumento (`sugerido`) diz a formAusencia que este objeto é um pré-preenchimento,
        // não um registro existente — sem ele o form se intitula "Editar".
        formAusencia(
            { funcionarioId: funcEl.value, tipo: 'Outra licença', inicio: inicioEl.value || dataEl.value || '' },
            false,
            { status: 'info', desc: 'Afastamento decorrente da suspensão disciplinar sendo registrada. Ajuste o motivo e o período; depois volte à medida para vinculá-lo.' }
        );
    };

    tipoEl.onchange = applyTipo;
    cienciaEl.onchange = applyCiencia;
    inicioEl.onchange = recalcDias;
    fimEl.onchange = recalcDias;
    diasEl.onchange = recalcFim;
    dataEl.addEventListener('change', syncHistorico);
    // Trocar de funcionário invalida um vínculo escolhido para o anterior — e muda os antecedentes.
    funcEl.addEventListener('change', () => { ausIdEl.value = ''; syncAusLbl(); syncHistorico(); });
    applyTipo();
    applyCiencia();
    syncAusLbl();
    syncHistorico();

    m.footer.innerHTML = `
        <button class="btn btn-secondary" data-cancel>Cancelar</button>
        <button class="btn btn-primary" data-save>${isEdit ? 'Salvar' : 'Registrar'}</button>`;
    m.footer.querySelector('[data-cancel]').onclick = m.close;
    const btnSave = m.footer.querySelector('[data-save]');
    btnSave.onclick = async () => {
        const fid = funcEl.value;
        if (!fid) return toast('Selecione o funcionário.', 'error');

        const tipo = tipoEl.value;
        const data = dataEl.value;
        if (!data) return toast('Informe a data de aplicação.', 'error');
        // Medida que ainda não foi aplicada não se registra: o histórico disciplinar é registro
        // do que aconteceu, não de intenção.
        if (data > hoje()) return toast('A data de aplicação não pode ser futura.', 'error');

        const dataFato = el('fdiscDataFato').value;
        if (dataFato && dataFato > hoje()) return toast('A data do fato não pode ser futura.', 'error');
        if (dataFato && dataFato > data) return toast('O fato não pode ser posterior à aplicação da medida.', 'error');

        // Nada pode ter acontecido antes do vínculo existir.
        const f = lancFuncObj(fid);
        if (f?.admissao) {
            if (data < f.admissao) return toast(`A medida é anterior à admissão (${fmtDate(f.admissao)}).`, 'error');
            if (dataFato && dataFato < f.admissao) return toast(`O fato é anterior à admissão (${fmtDate(f.admissao)}).`, 'error');
        }

        // O que vai para o banco é sempre o TEXTO do motivo — o marcador de campo livre nunca
        // é gravado, senão a coluna Motivo exibiria um valor interno.
        const motivoSel = motivoEl.value;
        if (!motivoSel) return toast('Informe o motivo da medida.', 'error');
        const motivo = motivoSel === DISC_MOTIVO_LIVRE ? motivoLivreEl.value.trim() : motivoSel;
        if (!motivo) return toast('Descreva o motivo da medida.', 'error');
        if (motivoSel === DISC_MOTIVO_LIVRE && motivo.length < 4)
            return toast('O motivo descrito está curto demais para identificar a falta.', 'error');

        const descricao = el('fdiscDescricao').value.trim();
        if (!descricao) return toast('Descreva o fato — é o que sustenta a medida em eventual litígio.', 'error');

        const aplicadorNome = el('fdiscAplicador').value.trim();
        if (!aplicadorNome) return toast('Informe quem aplicou a medida.', 'error');

        const ciencia = cienciaEl.value;
        const testemunhas = el('fdiscTestemunhas').value.trim();
        if (ciencia !== 'Assinou' && !testemunhas)
            return toast('Informe as testemunhas — a recusa de assinatura só se prova com testemunhas nomeadas.', 'error');

        const suspensao = tipo === DISC_SUSPENSAO;
        const inicio = suspensao ? inicioEl.value : '';
        const fim = suspensao ? fimEl.value : '';
        let dias = 0;

        if (suspensao) {
            if (!inicio) return toast('Informe o início da suspensão.', 'error');
            if (!fim) return toast('Informe o último dia da suspensão.', 'error');
            if (fim < inicio) return toast('O último dia não pode ser anterior ao início.', 'error');
            dias = Number(diasEl.value) || (diasEntre(inicio, fim) + 1);
            if (dias < 1) return toast('A suspensão precisa de ao menos 1 dia.', 'error');
            // CLT art. 474 — único limite que bloqueia, porque acima dele a punição deixa de ser
            // suspensão e passa a ser rescisão injusta do contrato.
            if (dias > DISC_MAX_DIAS_CLT)
                return toast(`Suspensão de ${fmtNum(dias)} dias. O art. 474 da CLT limita a ${DISC_MAX_DIAS_CLT} dias — acima disso a punição é tida como rescisão injusta do contrato.`, 'error');
            // Vínculo de outra pessoa: defesa contra trocar o funcionário depois de escolher.
            if (ausIdEl.value) {
                const aus = discState.ausencias.find(a => a.id === ausIdEl.value);
                if (aus && aus.funcionarioId !== fid)
                    return toast('O afastamento vinculado é de outro funcionário.', 'error');
            }
        }

        // Clique duplo: mesma pessoa, mesma data, mesmo tipo. Penalidade legítima repetida vem
        // em outra data.
        const dup = discState.itens.find(x => x.id !== d?.id && x.funcionarioId === fid
            && x.data === data && x.tipo === tipo);
        if (dup) return toast(`Já existe uma ${tipo.toLowerCase()} para este funcionário em ${fmtDate(data)}.`, 'error');

        // ---- A partir daqui são AVISOS: orientam, mas quem decide a penalidade é o RH. ----

        if (suspensao && dias > DISC_SUSPENSAO_LONGA) {
            if (!await confirmDialog({
                title: 'Suspensão longa',
                message: `Suspensão de <strong>${fmtNum(dias)} dias</strong> (${fmtDate(inicio)} → ${fmtDate(fim)}).<br><span class="muted">Suspensões acima de ${DISC_SUSPENSAO_LONGA} dias são raras — confira se as datas estão corretas.</span>`,
                confirmText: 'Registrar assim mesmo'
            })) return;
        }

        if (suspensao && inicio < data) {
            if (!await confirmDialog({
                title: 'Suspensão anterior à aplicação',
                message: `A suspensão começa em ${fmtDate(inicio)}, antes de a medida ser aplicada em ${fmtDate(data)}.<br><span class="muted">Confira as datas.</span>`,
                confirmText: 'Registrar assim mesmo'
            })) return;
        }

        // Imediatidade: o poder disciplinar é imediato. Demora prolongada entre o fato e a
        // punição pode caracterizar perdão tácito e derrubar a medida.
        if (dataFato && diasEntre(dataFato, data) > 30) {
            if (!await confirmDialog({
                title: 'Medida tardia',
                message: `O fato ocorreu há <strong>${fmtNum(diasEntre(dataFato, data))} dias</strong>.<br><span class="muted">A demora entre o fato e a punição enfraquece a medida (princípio da imediatidade) e pode caracterizar perdão tácito.</span>`,
                confirmText: 'Registrar assim mesmo'
            })) return;
        }

        // Non bis in idem: o mesmo fato não se pune duas vezes.
        if (dataFato) {
            const mesmoFato = discState.itens.find(x => x.id !== d?.id
                && x.funcionarioId === fid && x.dataFato && x.dataFato === dataFato);
            if (mesmoFato && !await confirmDialog({
                title: 'Fato já punido',
                message: `Já existe uma ${escapeHtml((mesmoFato.tipo || 'medida').toLowerCase())} para o fato de ${fmtDate(dataFato)}.<br><span class="muted">O mesmo fato não pode ser punido duas vezes (non bis in idem).</span>`,
                confirmText: 'Registrar assim mesmo'
            })) return;
        }

        // Gradação da pena — falta grave dispensa, e nesses casos o aviso só treinaria o
        // usuário a clicar em "continuar" sem ler.
        if (!DISC_MOTIVOS_GRAVES.includes(motivo)) {
            const grauAtual = DISC_GRAU[tipo] || 0;
            const grauAnterior = discMaiorGrau(fid, data, d?.id);
            if (grauAtual > grauAnterior + 1) {
                if (!await confirmDialog({
                    title: 'Salto na gradação da pena',
                    message: `Este colaborador não tem ${grauAnterior ? 'advertência' : 'medida disciplinar'} registrada nos últimos ${DISC_JANELA_MESES} meses.<br><span class="muted">Aplicar ${escapeHtml(tipo.toLowerCase())} direto pode ser questionado por falta de gradação.</span>`,
                    confirmText: 'Registrar assim mesmo'
                })) return;
            } else if (grauAnterior && grauAtual < grauAnterior) {
                if (!await confirmDialog({
                    title: 'Retrocesso na gradação',
                    message: `Este colaborador já recebeu medida mais grave nos últimos ${DISC_JANELA_MESES} meses.<br><span class="muted">Aplicar ${escapeHtml(tipo.toLowerCase())} agora quebra a progressão da pena.</span>`,
                    confirmText: 'Registrar assim mesmo'
                })) return;
            }
        }

        btnSave.disabled = true;
        btnSave.innerHTML = '<span class="spinner"></span> Salvando...';
        try {
            const { anexos, removidos } = await anexoCtl.getAnexos();
            await DB.save(PATHS.disciplinares, d?.id || null, {
                funcionarioId: fid,
                tipo,
                data,
                dataFato: dataFato || '',
                motivo,
                descricao,
                aplicadorNome,
                aplicadorCargo: el('fdiscAplicadorCargo').value.trim(),
                ciencia,
                testemunhas: ciencia !== 'Assinou' ? testemunhas : '',
                dias: suspensao ? dias : 0,
                inicio,
                fim,
                ausenciaId: suspensao ? (ausIdEl.value || null) : null,
                reflexoFolha: el('fdiscFolha').checked,
                obs: el('fdiscObs').value.trim(),
                anexos,
                anexo: null
            });
            await excluirAnexoRemoto(removidos);
            toast(isEdit ? 'Medida disciplinar atualizada.' : 'Medida disciplinar registrada.');
            m.close();
            (onDone || renderLancTab)();
        } catch (e) {
            toast(e.message || 'Erro ao salvar.', 'error');
        } finally {
            btnSave.disabled = false;
            btnSave.innerHTML = isEdit ? 'Salvar' : 'Registrar';
        }
    };
}
