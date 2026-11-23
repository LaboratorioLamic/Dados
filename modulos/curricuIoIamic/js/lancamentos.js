// ===== Lançamentos: Ausências, Demissões, Treinamentos, Promoções =====

const TIPOS_AUSENCIA = ['Férias', 'Falta justificada', 'Falta injustificada', 'Licença médica', 'Licença maternidade/paternidade', 'Outra licença'];
const MOTIVOS_DEMISSAO = [
    'Pedido de demissão',
    'Dispensa sem justa causa',
    'Dispensa com justa causa',
    'Término de contrato de experiência',
    'Rescisão antecipada do contrato de experiência por iniciativa do empregador',
    'Rescisão antecipada do contrato de experiência por iniciativa do empregado',
    // Aprendizagem tem motivos próprios porque o contrato é outro: prazo determinado de até
    // 2 anos, com hipóteses de extinção antecipada listadas no art. 433 da CLT. Encaixá-lo em
    // "término de experiência" contaminaria a rotatividade com um motivo que não é o dele.
    'Término do contrato de aprendizagem',
    'Rescisão antecipada do contrato de aprendizagem',
    'Falecimento do empregado',
    'Outro'
];
const TIPOS_TREINAMENTO = ['Integração', 'Técnico', 'Comportamental', 'Segurança', 'Liderança', 'Outro'];

// Férias têm aba própria: são planejadas (agenda, cobertura), enquanto faltas e licenças
// são eventos não programados. Regras e leitura gerencial diferentes.
const TIPO_FERIAS = 'Férias';
const TIPOS_AUSENCIA_NAO_FERIAS = TIPOS_AUSENCIA.filter(t => t !== TIPO_FERIAS);

const MOTIVOS_TRANSFERENCIA = [
    'Necessidade da operação',
    'Solicitação do colaborador',
    'Promoção / mudança de cargo',
    'Abertura de nova unidade',
    'Realocação por reestruturação',
    'Outro'
];

const LANC_TABS = [
    { id: 'ferias', label: 'Férias' },
    { id: 'ausencias', label: 'Faltas e Licenças' },
    // Ausência parcial: sai no meio do turno e volta no mesmo dia, ou sai mais cedo. Aba
    // própria porque a unidade é hora, não dia — misturar na grade de Faltas e Licenças
    // colocaria "2:00" e "3 dias" na mesma coluna.
    { id: 'ausparcial', label: 'Ausências parciais' },
    { id: 'cat', label: 'CAT' },
    { id: 'aso', label: 'ASO' },
    { id: 'demissoes', label: 'Demissões' },
    { id: 'treinamentos', label: 'Treinamentos' },
    { id: 'promocoes', label: 'Promoções' },
    { id: 'transferencias', label: 'Transferências' },
    // Medidas disciplinares: penalidade tem gradação e prazo próprios; diluída em Faltas
    // esconderia justamente a leitura que importa — quantas, de quem e se houve reincidência.
    { id: 'disciplinar', label: 'Medidas disciplinares' },
    { id: 'bancohoras', label: 'Banco de horas' },
    // 13º: a aba inteira é dinheiro (base de cálculo, parcelas, provisão) — sem ver_financeiro
    // não há o que mostrar que não seja valor. Mesma régua da Folha mensal.
    { id: 'decimo', label: '13º Salário', fin: true },
    // Lançamentos financeiros: exigem permissão de folha + financeiro
    { id: 'folhagrid', label: 'Folha mensal', fin: true }
];
let lancTab = 'ferias';

const lancState = { funcionarios: [], cargos: [], unidades: [] };
let ausFiltroTipo = ''; // '' = todos
let feriasSub = 'programacao';  // programacao | tabela | agenda
let feriasFiltroUnidade = '';   // '' = todas
let feriasFiltroCargo = '';     // '' = todos
let feriasAno = new Date().getFullYear();
let feriasMostrarPrev = true;   // agenda: exibir previsão calculada além do lançado

// Filtros compartilhados por Programação e Agenda — a leitura tem que ser a mesma nas duas.
const feriasPassaFiltro = f =>
    (!feriasFiltroUnidade || f.unidadeId === feriasFiltroUnidade) &&
    (!feriasFiltroCargo || f.cargoId === feriasFiltroCargo);

// Botões de filtro (unidade + cargo) reaproveitados nas duas sub-abas
function feriasFiltrosHtml(idUni, idCargo) {
    const un = lancState.unidades.find(u => u.id === feriasFiltroUnidade);
    const cg = lancState.cargos.find(c => c.id === feriasFiltroCargo);
    return `
        <button class="btn btn-secondary btn-filter${feriasFiltroUnidade ? ' active' : ''}" id="${idUni}">${icon('building')} ${escapeHtml(un?.nome || 'Todas as unidades')}</button>
        <button class="btn btn-secondary btn-filter${feriasFiltroCargo ? ' active' : ''}" id="${idCargo}">${icon('briefcase')} ${escapeHtml(cg?.nome || 'Todos os cargos')}</button>`;
}

function feriasBindFiltros(idUni, idCargo, rerender) {
    const unis = lancState.unidades.slice().sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    const cargos = lancState.cargos.slice().sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    const bUni = document.getElementById(idUni);
    if (bUni) bUni.onclick = () => openFilterPopover(bUni, {
        allLabel: 'Todas as unidades',
        options: unis.map(u => ({ value: u.id, label: u.nome })),
        value: feriasFiltroUnidade,
        searchable: unis.length > 6,
        onPick: v => { feriasFiltroUnidade = v; rerender(); }
    });
    const bCargo = document.getElementById(idCargo);
    if (bCargo) bCargo.onclick = () => openFilterPopover(bCargo, {
        allLabel: 'Todos os cargos',
        options: cargoOpcoes(cargos),
        value: feriasFiltroCargo,
        searchable: cargos.length > 6,
        onPick: v => { feriasFiltroCargo = v; rerender(); }
    });
}

// ---- Filtros de Unidade/Cargo da Folha mensal (aba Lançamentos → Folha mensal) ----
// Filtra só a VISUALIZAÇÃO da grade — a folha continua tendo todos os funcionários
// lançados; os totais de rodapé recalculam sobre o subconjunto visível, senão o "Total"
// mentiria enquanto o filtro está ativo.
let folhaFiltroUnidade = '';
let folhaFiltroCargo = '';
const folhaPassaFiltro = f =>
    (!folhaFiltroUnidade || f?.unidadeId === folhaFiltroUnidade) &&
    (!folhaFiltroCargo || f?.cargoId === folhaFiltroCargo);

function folhaFiltrosHtml(idUni, idCargo) {
    const un = lancState.unidades.find(u => u.id === folhaFiltroUnidade);
    const cg = lancState.cargos.find(c => c.id === folhaFiltroCargo);
    return `
        <button class="btn btn-secondary btn-filter${folhaFiltroUnidade ? ' active' : ''}" id="${idUni}">${icon('building')} ${escapeHtml(un?.nome || 'Todas as unidades')}</button>
        <button class="btn btn-secondary btn-filter${folhaFiltroCargo ? ' active' : ''}" id="${idCargo}">${icon('briefcase')} ${escapeHtml(cg?.nome || 'Todos os cargos')}</button>`;
}

function folhaBindFiltros(idUni, idCargo, rerender) {
    const unis = lancState.unidades.slice().sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    const cargos = lancState.cargos.slice().sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    const bUni = document.getElementById(idUni);
    if (bUni) bUni.onclick = () => openFilterPopover(bUni, {
        allLabel: 'Todas as unidades',
        options: unis.map(u => ({ value: u.id, label: u.nome })),
        value: folhaFiltroUnidade,
        searchable: unis.length > 6,
        onPick: v => { folhaFiltroUnidade = v; rerender(); }
    });
    const bCargo = document.getElementById(idCargo);
    if (bCargo) bCargo.onclick = () => openFilterPopover(bCargo, {
        allLabel: 'Todos os cargos',
        options: cargoOpcoes(cargos),
        value: folhaFiltroCargo,
        searchable: cargos.length > 6,
        onPick: v => { folhaFiltroCargo = v; rerender(); }
    });
}

// Detalhes de lançamento também abrem a partir da ficha do funcionário, quando a página
// Lançamentos nunca renderizou e lancState está vazio — daí o fallback para funcState.
const lancFuncNome = id =>
    (lancState.funcionarios.find(f => f.id === id) || funcState.funcionarios.find(f => f.id === id))?.nome || '(removido)';
const lancAtivos = () => lancState.funcionarios.filter(f => !f.demissao).sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
const lancFuncObj = id => lancState.funcionarios.find(f => f.id === id) || funcState.funcionarios.find(f => f.id === id);
const lancCargoObj = f => lancState.cargos.find(c => c.id === f?.cargoId) || funcState.cargos.find(c => c.id === f?.cargoId);

// Célula "Funcionário" enriquecida (foto + nome + cargo/idade/contato) usada nas tabelas de
// Lançamentos. Nome e foto são clicáveis e abrem a ficha completa — mesma janela usada em
// Funcionários — sem duplicar aqui o que já é mostrado lá.
function lancFuncCellHtml(id) {
    const f = lancFuncObj(id);
    if (!f) return `<div class="lanc-func-cell"><div class="avatar">?</div><div class="lanc-func-info"><span class="lanc-func-nome">(removido)</span></div></div>`;
    const cargo = lancCargoObj(f);
    const idadeF = idade(f.nascimento);
    const meta = [cargo?.nome || 'Sem cargo', idadeF != null ? `${idadeF} anos` : null, f.telefone || null]
        .filter(Boolean).join(' · ');
    return `
        <div class="lanc-func-cell">
            ${avatarHtml(f)}
            <div class="lanc-func-info">
                <span class="lanc-func-nome">${escapeHtml(f.nome)}</span>
                ${meta ? `<span class="lanc-func-meta">${escapeHtml(meta)}</span>` : ''}
            </div>
        </div>`;
}

// Cabeçalho "foto + nome + cargo/idade/contato" das janelas de detalhe (modal ou drawer).
// Nome e foto clicáveis abrem a ficha completa — quem liga o clique é quem monta a janela
// (o card em si não sabe se está num modal ou num drawer único).
function dhFuncCardHtml(f, { eyebrow } = {}) {
    const cargo = lancCargoObj(f);
    const idadeF = idade(f.nascimento);
    const meta = [cargo?.nome || 'Sem cargo', idadeF != null ? `${idadeF} anos` : null, f.telefone || null].filter(Boolean);
    return `
        <div class="dh-func-card" title="Abrir ficha de ${escapeHtml(f.nome)}">
            ${avatarHtml(f, 'lg')}
            <div class="grow">
                ${eyebrow ? `<div class="dh-eyebrow">${eyebrow}</div>` : ''}
                <h3 class="dh-nome">${escapeHtml(f.nome)}</h3>
                ${meta.length ? `<div class="dh-meta">${meta.map(escapeHtml).join(' · ')}</div>` : ''}
            </div>
        </div>`;
}

// Garante que funcState (usado pela ficha) esteja carregado mesmo quando o usuário nunca
// visitou a página Funcionários nesta sessão — mesma lógica de fallback de lancFuncNome,
// mas completa (benefícios/treinamentos/ausências/parâmetros) porque a ficha tem abas que
// dependem desses dados.
async function abrirFichaFuncionario(id) {
    if (!funcState.funcionarios.length) {
        const [funcionarios, cargos, unidades, beneficios, treinamentos, ausencias, params] = await Promise.all([
            DB.getAll(PATHS.funcionarios), DB.getAll(PATHS.cargos), DB.getAll(PATHS.unidades),
            DB.getAll(PATHS.beneficios), DB.getAll(PATHS.treinamentos), DB.getAll(PATHS.ausencias),
            DB.getObj(PATHS.parametros)
        ]);
        Object.assign(funcState, { funcionarios, cargos, unidades, beneficios, treinamentos, ausencias, params: params || {} });
    }
    const f = funcState.funcionarios.find(x => x.id === id) || lancFuncObj(id);
    if (!f) return toast('Funcionário não encontrado (pode ter sido removido).', 'info');
    drawerFuncionario(f);
}

// Carrega as fotos das células "Funcionário" nas linhas da tabela (só exibição — a ficha
// completa abre a partir da janela de detalhe do lançamento, não daqui).
function bindLancFuncCells(container) {
    if (!container) return;
    bindAvatarFotos(container);
}

registerPage({
    id: 'lancamentos',
    title: 'Lançamentos',
    icon: 'launch',
    order: 3,
    perm: 'ver_lancamentos',
    async render(el) {
        el.innerHTML = '<div class="loading-center"><div class="spinner-dark"></div></div>';
        const [funcionarios, cargos, unidades] = await Promise.all([
            DB.getAll(PATHS.funcionarios), DB.getAll(PATHS.cargos), DB.getAll(PATHS.unidades)
        ]);
        Object.assign(lancState, { funcionarios, cargos, unidades });

        // Visualização por aba: cada aba só aparece se o grupo do usuário libera ver aquela aba
        // (podeVerLanc). As abas financeiras (13º, Folha mensal) exigem, além disso, ver_folha
        // + ver_financeiro — mesma régua da Folha mensal.
        const abasVisiveis = LANC_TABS.filter(t =>
            podeVerLanc(t.id) && (!t.fin || (can('ver_folha') && can('ver_financeiro'))));
        // Se a aba ativa não está entre as visíveis (mudou de grupo, etc.), cai na primeira.
        if (abasVisiveis.length && !abasVisiveis.some(t => t.id === lancTab)) lancTab = abasVisiveis[0].id;

        el.innerHTML = `
            <div class="page-header">
                <div>
                    <h2>Lançamentos</h2>
                    <div class="page-sub">Eventos de RH — alimentam automaticamente as fichas, o Dashboard e os Resultados.</div>
                </div>
            </div>
            <div class="tabs" id="lancTabs">
                ${abasVisiveis.map(t => `<div class="tab${t.id === lancTab ? ' active' : ''}" data-tab="${t.id}">${t.label}</div>`).join('')}
            </div>
            <div class="mt-16" id="lancContent"></div>`;

        el.querySelectorAll('#lancTabs .tab').forEach(tab => {
            tab.onclick = () => {
                lancTab = tab.dataset.tab;
                el.querySelectorAll('#lancTabs .tab').forEach(t => t.classList.toggle('active', t === tab));
                renderLancTab();
            };
        });
        renderLancTab();
    }
});

function renderLancTab() {
    const el = document.getElementById('lancContent');
    // Formulários de férias (formAusencia/detalheAusencia) também abrem a partir da ficha do
    // funcionário (aba Dados → Férias), fora da página de Lançamentos — lá #lancContent não
    // existe no DOM. Sem esta guarda, salvar férias pela ficha lançava exceção em cima de um
    // innerHTML de elemento nulo.
    if (!el) {
        const fdCont = document.getElementById('fdContent');
        if (fdCont?.dataset.fdDadosSub === 'ferias' && fdDadosRefresh) fdDadosRefresh();
        return;
    }
    el.innerHTML = '<div class="loading-center"><div class="spinner-dark"></div></div>';
    ({
        ferias: renderFerias,
        ausencias: renderAusencias,
        ausparcial: renderAusParcial,
        cat: renderCat,
        aso: renderAso,
        demissoes: renderDemissoes,
        treinamentos: renderTreinamentos,
        promocoes: renderPromocoes,
        transferencias: renderTransferencias,
        disciplinar: renderDisciplinar,
        bancohoras: renderBancoHoras,
        decimo: renderDecimo,
        folhagrid: renderLancFolha
    })[lancTab]().catch(e => {
        console.error(e);
        el.innerHTML = emptyState({ icon: 'alert', title: 'Erro ao carregar', text: e.message || '' });
    });
}

// Toolbar + tabela genérica (mesmo padrão das Configurações)
function lancList({ searchPh, btnLabel, thead, rowsHtml, onNew, emptyText, toolbarExtra }) {
    const cont = document.getElementById('lancContent');
    const podeEditar = can('editar_lancamentos');
    cont.innerHTML = `
        <div class="table-wrap">
            <div class="table-toolbar">
                <div class="search-box">${icon('search')}<input class="input" id="lancSearch" placeholder="${searchPh}"></div>
                ${toolbarExtra || ''}
                <div class="grow"></div>
                ${podeEditar ? `<button class="btn btn-primary" id="lancNew">${icon('plus')} ${btnLabel}</button>` : ''}
            </div>
            <div class="table-scroll">
                <table class="table">
                    <thead><tr>${thead}</tr></thead>
                    <tbody id="lancTbody">${rowsHtml || ''}</tbody>
                </table>
            </div>
        </div>`;
    if (!rowsHtml) {
        document.getElementById('lancTbody').innerHTML =
            `<tr><td colspan="10"><div class="table-empty">${icon('launch')}<span>${emptyText}</span></div></td></tr>`;
    }
    const btnNew = document.getElementById('lancNew');
    if (btnNew) btnNew.onclick = onNew;
    document.getElementById('lancSearch').addEventListener('input', () => lancAplicaFiltros());
}

// Aplica busca + filtros extras (data-* atributos) sobre as linhas visíveis
function lancAplicaFiltros(extra) {
    const q = (document.getElementById('lancSearch')?.value || '').toLowerCase();
    document.querySelectorAll('#lancTbody tr[data-search]').forEach(tr => {
        const okBusca = tr.dataset.search.includes(q);
        const okExtra = !extra || extra(tr);
        tr.style.display = okBusca && okExtra ? '' : 'none';
    });
}

function lancRowMenu(tr, items) {
    const btn = tr.querySelector('[data-menu]');
    if (btn) btn.onclick = e => { e.stopPropagation(); openPopover(btn, items); };
}

// Também usado por formulários abertos da ficha do funcionário (ex.: ASO na aba Documentos),
// quando a página Lançamentos nunca renderizou e lancState está vazio — daí o fallback para
// funcState, o mesmo que lancFuncNome faz.
//
// Renderiza um botão "Funcionário" que abre popover buscável, no lugar do antigo <select>
// simples — a lista de funcionários costuma passar de uma tela e rolar um <select> nativo é
// pior do que digitar o nome. Guarda o valor num <input type="hidden"> com o MESMO id que o
// <select> tinha, para que .value e .onchange dos formulários existentes continuem funcionando
// sem precisar tocar em cada form: só quem monta o HTML chama bindSelectFuncionario() depois.
const listaFuncSelecionavel = incluirId => {
    const fonte = lancState.funcionarios.length ? lancState.funcionarios : funcState.funcionarios;
    const lista = fonte.filter(f => !f.demissao).sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    if (incluirId && !lista.some(f => f.id === incluirId)) {
        const f = fonte.find(x => x.id === incluirId);
        if (f) lista.unshift(f);
    }
    return lista;
};

const selectFuncionario = (id, incluirId) => {
    const lista = listaFuncSelecionavel(incluirId);
    if (!lista.length) return null;
    const atual = lista.find(f => f.id === incluirId);
    return `<div class="func-picker">
        <input type="hidden" id="${id}" value="${incluirId || ''}">
        <button type="button" class="input select-picker" data-fp-btn="${id}">
            <span class="select-picker-lbl${atual ? '' : ' muted'}">${atual ? escapeHtml(atual.nome) : 'Selecionar funcionário...'}</span>
            ${icon('chevronDown')}
        </button>
    </div>`;
};

// Liga o clique do botão ao popover de busca — precisa rodar depois que o HTML de
// selectFuncionario() já está no DOM. `container`: escopo da busca (m.body do modal).
function bindSelectFuncionario(container, id, incluirId) {
    const btn = container.querySelector(`[data-fp-btn="${id}"]`);
    const hidden = container.querySelector(`#${id}`);
    if (!btn || !hidden) return;
    const lista = listaFuncSelecionavel(incluirId);
    btn.onclick = () => openFilterPopover(btn, {
        options: lista.map(f => ({ value: f.id, label: f.nome })),
        value: hidden.value,
        searchable: true,
        onPick: v => {
            hidden.value = v;
            const f = lista.find(x => x.id === v);
            btn.querySelector('.select-picker-lbl').textContent = f ? f.nome : 'Selecionar funcionário...';
            btn.querySelector('.select-picker-lbl').classList.toggle('muted', !f);
            hidden.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });
}

// ============ AUSÊNCIAS ============
async function renderAusencias() {
    // Férias saem daqui: têm aba própria (planejadas, com agenda e cobertura).
    const ausencias = (await DB.getAll(PATHS.ausencias))
        .filter(a => a.tipo !== TIPO_FERIAS)
        .sort((a, b) => (b.inicio || '').localeCompare(a.inicio || ''));
    const badgeTipo = t => t?.startsWith('Falta') ? 'badge-danger' : 'badge-warning';

    const filtroLabel = ausFiltroTipo || 'Todos os tipos';
    lancList({
        searchPh: 'Buscar por funcionário ou tipo...',
        btnLabel: 'Lançar falta ou licença',
        emptyText: 'Nenhuma falta ou licença lançada.',
        toolbarExtra: `<button class="btn btn-secondary btn-filter${ausFiltroTipo ? ' active' : ''}" id="ausFiltro">${icon('filter')} ${escapeHtml(filtroLabel)}</button>`,
        thead: '<th>Funcionário</th><th>Tipo</th><th>Início</th><th>Retorno</th><th class="num">Dias ausentes</th><th>Observação</th><th>Anexo</th><th style="width:48px"></th>',
        rowsHtml: ausencias.map(a => `
            <tr data-id="${a.id}" data-tipo="${escapeHtml(a.tipo || '')}" data-search="${escapeHtml((lancFuncNome(a.funcionarioId) + ' ' + (a.tipo || '')).toLowerCase())}">
                <td>${lancFuncCellHtml(a.funcionarioId)}</td>
                <td><span class="badge ${badgeTipo(a.tipo)}">${escapeHtml(a.tipo || '—')}</span></td>
                <td>${fmtDate(a.inicio)}</td>
                <td>${fmtDate(a.retorno)}</td>
                <td class="num"><strong>${fmtNum(a.dias)}</strong></td>
                <td class="text-2">${escapeHtml(a.obs || '—')}</td>
                <td>${anexosDe(a).length ? anexoChip(anexosDe(a)) : '<span class="muted">—</span>'}</td>
                <td>${can('editar_lancamentos') ? `<button class="btn-icon" data-menu>${icon('dots')}</button>` : ''}</td>
            </tr>`).join(''),
        onNew: () => formAusencia(null)
    });
    bindLancFuncCells(document.getElementById('lancTbody'));
    bindAnexoChips(document.getElementById('lancTbody'), el => anexosDe(ausencias.find(x => x.id === el.closest('tr').dataset.id)));

    // Filtro por tipo (popover)
    const applyTipo = () => lancAplicaFiltros(tr => !ausFiltroTipo || tr.dataset.tipo === ausFiltroTipo);
    applyTipo();
    const btnFiltro = document.getElementById('ausFiltro');
    if (btnFiltro) btnFiltro.onclick = () => openFilterPopover(btnFiltro, {
        allLabel: 'Todos os tipos',
        options: TIPOS_AUSENCIA_NAO_FERIAS.map(t => ({ value: t, label: t })),
        value: ausFiltroTipo,
        searchable: false,
        onPick: v => {
            ausFiltroTipo = v;
            btnFiltro.classList.toggle('active', !!v);
            btnFiltro.innerHTML = `${icon('filter')} ${escapeHtml(v || 'Todos os tipos')}`;
            applyTipo();
        }
    });

    const excluirAus = async a => {
        if (await confirmDialog({ title: 'Excluir ausência', message: `Excluir a ausência de <strong>${escapeHtml(lancFuncNome(a.funcionarioId))}</strong>?`, confirmText: 'Excluir', danger: true })) {
            await excluirAnexoRemoto(anexosDe(a));
            await DB.remove(PATHS.ausencias, a.id);
            invalidarCaches13();   // faltas injustificadas alteram os avos do 13º
            toast('Ausência excluída.');
            renderLancTab();
        }
    };

    document.querySelectorAll('#lancTbody tr[data-id]').forEach(tr => {
        const a = ausencias.find(x => x.id === tr.dataset.id);
        lancRowClick(tr, () => detalheAusencia(a, excluirAus));
        lancRowMenu(tr, [
            { label: 'Ver detalhes', icon: 'eye', onClick: () => detalheAusencia(a, excluirAus) },
            { label: 'Editar', icon: 'edit', onClick: () => formAusencia(a) },
            'sep',
            { label: 'Excluir', icon: 'trash', danger: true, onClick: () => excluirAus(a) }
        ]);
    });
}

// Torna a linha inteira clicável (ignora cliques em botões/links/inputs)
function lancRowClick(tr, onOpen) {
    tr.classList.add('row-clickable');
    tr.addEventListener('click', e => {
        if (e.target.closest('button, a, input, .anexo-balao, [data-menu]')) return;
        onOpen();
    });
}

// ---- Drawer de detalhe genérico ----
// header: {titulo, sub, badge}; linhas: [[label, valueHtml], ...]; anexo; onEdit/onDelete opcionais
// onClose: usado quando o detalhe foi aberto de dentro de outro drawer (ex.: ficha do
// funcionário) — o drawer é único, então ao fechar precisamos devolver o contexto anterior.
function abrirDetalheLanc({ titulo, sub, badgeHtml, heroHtml, linhas, anexo, funcionarioId, onEdit, onDelete, onClose }) {
    const podeEditar = can('editar_lancamentos');
    const anexos = Array.isArray(anexo) ? anexo : (anexo ? [anexo] : []);
    const rows = linhas.filter(Boolean).map(([l, v]) => `
        <div class="detail-row">
            <div class="detail-label">${l}</div>
            <div class="detail-value">${v ?? '—'}</div>
        </div>`).join('');

    // Cabeçalho rico (foto + cargo/idade/contato) quando o lançamento pertence a um único
    // funcionário — foto e nome abrem a ficha completa. Cai no cabeçalho simples (ex.: um
    // treinamento com vários participantes) quando não há funcionarioId.
    const f = funcionarioId ? lancFuncObj(funcionarioId) : null;

    let voltar = onClose; // suprimido quando o fechamento leva a outra tela (editar/excluir/ficha)
    const d = openDrawer({
        onClose: () => voltar && voltar(),
        headerHtml: f ? `
            <div class="detail-head">
                ${dhFuncCardHtml(f, { eyebrow: sub })}
                ${badgeHtml ? `<div class="mt-8">${badgeHtml}</div>` : ''}
            </div>` : `
            <div class="detail-head">
                <h3>${escapeHtml(titulo)}</h3>
                ${sub ? `<div class="detail-sub">${sub}</div>` : ''}
                ${badgeHtml ? `<div class="mt-8">${badgeHtml}</div>` : ''}
            </div>`,
        body: `
            <div class="detail-list">${rows}</div>
            ${heroHtml || ''}
            ${anexos.length ? `<div class="detail-section"><div class="detail-label" style="margin-bottom:8px">Anexo${anexos.length > 1 ? 's' : ''}</div><div class="anexo-galeria" id="detAnexo"></div></div>` : ''}
            ${(onEdit || onDelete) && podeEditar ? `
            <div class="detail-actions">
                ${onEdit ? `<button class="btn btn-secondary" data-edit>${icon('edit')} Editar</button>` : ''}
                ${onDelete ? `<button class="btn btn-danger" data-del>${icon('trash')} Excluir</button>` : ''}
            </div>` : ''}`
    });
    if (f) {
        bindAvatarFotos(d.el);
        const card = d.el.querySelector('.dh-func-card');
        if (card) card.onclick = () => { voltar = null; d.close(); abrirFichaFuncionario(f.id); };
    }
    if (anexos.length) {
        const box = d.body.querySelector('#detAnexo');
        box.innerHTML = anexos.map((a, i) => `
            <button type="button" class="anexo-galeria-item" data-anexo-idx="${i}" title="${escapeHtml(a.titulo || '')}">
                ${anexoIcone(a.formato, 72)}
                <span>${escapeHtml(a.titulo || '')}</span>
            </button>`).join('');
        box.querySelectorAll('[data-anexo-idx]').forEach(btn => btn.onclick = () => abrirAnexo(anexos[Number(btn.dataset.anexoIdx)]));
    }
    const be = d.body.querySelector('[data-edit]');
    if (be) be.onclick = () => { voltar = null; d.close(); onEdit(); };
    const bd = d.body.querySelector('[data-del]');
    if (bd) bd.onclick = () => { voltar = null; d.close(); onDelete(); };
    return d;
}

const badgeTipoAus = t => t === TIPO_FERIAS ? 'badge-info' : t?.startsWith('Falta') ? 'badge-danger' : 'badge-warning';

// Selo de férias em curso — mesmo componente em Lançamentos, Funcionários e detalhes.
function seloFeriasHtml(a) {
    const dias = diasAteRetorno(a);
    return `<span class="badge badge-ferias" title="De férias até ${fmtDate(a.retorno)}">${icon('sun')} De férias · volta em ${dias}d</span>`;
}

function detalheAusencia(a, onDelete, onClose) {
    const emCurso = ausenciaVigente(a);
    const ferias = a.tipo === TIPO_FERIAS;
    const c = a.calculo;
    abrirDetalheLanc({
        titulo: lancFuncNome(a.funcionarioId),
        funcionarioId: a.funcionarioId,
        sub: ferias ? 'Férias' : 'Faltas e licenças',
        badgeHtml: `<span class="badge ${badgeTipoAus(a.tipo)}">${escapeHtml(a.tipo || '—')}</span>`
            + (emCurso && ferias ? ' ' + seloFeriasHtml(a) : ''),
        linhas: [
            ['Início', fmtDate(a.inicio)],
            ['Data do retorno', fmtDate(a.retorno)],
            [ferias ? 'Dias de férias' : 'Dias ausentes', `<strong>${fmtNum(a.dias)}</strong>`],
            ...(ferias && a.abonoDias ? [['Abono pecuniário', `${fmtNum(a.abonoDias)} dia(s)`]] : []),
            ['Observação', escapeHtml(a.obs || '—')]
        ],
        heroHtml: ferias && c && can('ver_financeiro') ? `
            <div class="bx-calc">
                <div class="bx-calc-tit">${icon('money')} Remuneração de férias</div>
                <div class="bx-calc-grid">
                    <span>Salário</span><strong>${fmtBRL(c.salario)}</strong>
                    ${c.insalubridade ? `<span>+ Insalubridade</span><strong>${fmtBRL(c.insalubridade)}</strong>` : ''}
                    ${c.periculosidade ? `<span>+ Periculosidade</span><strong>${fmtBRL(c.periculosidade)}</strong>` : ''}
                    ${c.mediaHe ? `<span>+ Média de HE</span><strong>${fmtBRL(c.mediaHe)}</strong>` : ''}
                    <span>= Base</span><strong>${fmtBRL(c.base)}</strong>
                    <span>÷ 30 <em class="bx-calc-nota">(divisor legal, art. 142)</em></span><strong>${fmtBRL(c.valorDia)}</strong>
                    <span>× ${a.dias} dias de gozo</span><strong>${fmtBRL(c.gozo)}</strong>
                    ${c.abono ? `<span>+ Abono de ${a.abonoDias} dias</span><strong>${fmtBRL(c.abono)}</strong>` : ''}
                    <span>+ Terço constitucional <em class="bx-calc-nota">(${fmtPct(c.tercoPct, 2)})</em></span><strong>${fmtBRL(c.terco)}</strong>
                </div>
                <div class="bx-calc-total"><span>Férias (calc)</span><strong>${fmtBRL(c.total)}</strong></div>
                ${c.adiantamento13 ? `<div class="bx-calc-total" style="border-top:0;padding-top:0"><span>13º adiantado <em class="bx-calc-nota">(coluna separada)</em></span><strong>${fmtBRL(c.adiantamento13)}</strong></div>` : ''}
                <div class="qt-restante">${icon('info')} Caiu na folha de <strong>${mesLabel(mesDe(a.inicio))}</strong> — definida pelo início das férias (art. 145).</div>
            </div>` : '',
        anexo: anexosDe(a),
        onEdit: () => formAusencia(a, ferias),
        onDelete: onDelete ? () => onDelete(a) : null,
        onClose
    });
}

// modoFerias: form dedicado da aba Férias (tipo fixo, sem seletor de motivo)
// sugerido: `a` traz valores pré-calculados mas ainda não existe no banco — não é edição
function formAusencia(a, modoFerias, sugerido) {
    const isEdit = !!a && !sugerido;
    const ferias = modoFerias ?? (a?.tipo === TIPO_FERIAS);
    const selFunc = selectFuncionario('faFunc', a?.funcionarioId);
    if (!selFunc) return toast('Nenhum funcionário ativo cadastrado.', 'info');

    const m = openModal({
        title: isEdit
            ? (ferias ? 'Editar férias' : 'Editar falta ou licença')
            : (ferias ? 'Lançar férias' : 'Lançar falta ou licença'),
        body: `
            ${sugerido && sugerido.desc ? `<div class="form-note form-note-${sugerido.status || 'info'}">${icon('alert')} <span>${escapeHtml(sugerido.desc)}</span></div>` : ''}
            <div class="field"><label>Funcionário <span class="req">*</span></label>${selFunc}</div>
            ${ferias ? `<input type="hidden" id="faTipo" value="${TIPO_FERIAS}">` : `
            <div class="field"><label>Motivo da ausência <span class="req">*</span></label>
                <select class="select" id="faTipo">${TIPOS_AUSENCIA_NAO_FERIAS.map(t => `<option ${a?.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
            </div>`}
            <div class="form-row">
                <div class="field"><label>Início <span class="req">*</span></label><input class="input" id="faIni" type="date" value="${a?.inicio || ''}"></div>
                <div class="field"><label>Data do retorno <span class="req">*</span></label><input class="input" id="faRet" type="date" value="${a?.retorno || ''}">
                    <div class="field-hint" id="faDias"></div>
                </div>
            </div>
            ${ferias ? `
            <div class="form-row">
                <div class="field">
                    <label>Abono pecuniário (dias)</label>
                    <input class="input" id="faAbono" type="number" min="0" step="1" value="${a?.abonoDias || 0}">
                    <div class="field-hint" id="faAbonoHint">Dias vendidos (art. 143). Contam para a competência.</div>
                </div>
                <div class="field">
                    <label>Adiantamento do 13º</label>
                    <label class="flex" style="gap:8px;align-items:center;margin-top:6px;cursor:pointer">
                        <span class="switch"><input type="checkbox" id="faAdiant13" ${a?.adiantar13 ? 'checked' : ''}><span class="track"></span></span>
                        <span>Pagar 50% do 13º junto</span>
                    </label>
                    <div class="field-hint">Lei 4.749 art. 2º §2º — sai na coluna 13º.</div>
                </div>
            </div>
            <div class="bx-calc" id="faCalc"></div>
            <div class="fa-comp" id="faComp"></div>
            <div class="fa-comp" id="faEscolar"></div>` : ''}
            <div class="field"><label>Observação</label><textarea class="input" id="faObs" rows="2" placeholder="${ferias ? 'Período aquisitivo, acordo com o gestor...' : 'Detalhes (opcional)'}">${escapeHtml(a?.obs || '')}</textarea></div>
            <div class="field"><label>Anexo (${ferias ? 'aviso de férias, recibo' : 'atestado, comprovante'})</label><div id="faAnexo"></div></div>`,
        footer: ''
    });

    bindSelectFuncionario(m.body, 'faFunc', a?.funcionarioId);
    const faAnexoCtl = initAnexoField(m.body.querySelector('#faAnexo'), anexosDe(a));
    const iniEl = m.body.querySelector('#faIni'), retEl = m.body.querySelector('#faRet'), diasEl = m.body.querySelector('#faDias');
    const calcDias = () => {
        const d = diasEntre(iniEl.value, retEl.value);
        diasEl.textContent = iniEl.value && retEl.value
            ? (d > 0 ? `${d} dia(s) ${ferias ? 'de férias' : 'de ausência'}` : 'Retorno deve ser após o início')
            : '';
        return d;
    };

    // ---- Férias: memória de cálculo + efeito na competência ----
    const fin = can('ver_financeiro');
    const abonoEl = m.body.querySelector('#faAbono');
    const adiantEl = m.body.querySelector('#faAdiant13');
    const calcEl = m.body.querySelector('#faCalc');
    const compEl = m.body.querySelector('#faComp');
    const escolarEl = m.body.querySelector('#faEscolar');
    const funcEl = m.body.querySelector('#faFunc');

    // O cálculo precisa das ausências (para saber a competência) e das fontes de HE (para a
    // média da Súmula 45). O form é síncrono: carrega uma vez ao abrir e recalcula em memória
    // — buscar o banco a cada tecla digitada seria uma consulta por caractere.
    const ctxFerias = { ausencias: [], fechamentos: [], extras: [], quitacoes: [], pronto: false };
    if (ferias) (async () => {
        const [aus, fechs, ext, quits] = await Promise.all([
            DB.getAll(PATHS.ausencias), DB.getAll(PATHS.bancoHorasFechamentos),
            DB.getAll(PATHS.extraBanco), DB.getAll(PATHS.bancoHorasQuitacoes)
        ]);
        Object.assign(ctxFerias, { ausencias: aus, fechamentos: fechs, extras: ext, quitacoes: quits, pronto: true });
        recalcFerias();
    })();

    const recalcFerias = () => {
        if (!ferias || !calcEl) return null;
        const dias = Math.max(0, calcDias());
        const f = lancState.funcionarios.find(x => x.id === funcEl.value);
        const abono = Math.max(0, Number(abonoEl.value) || 0);

        // Teto do abono é 1/3 do período (art. 143) — sobre a competência inteira, não sobre
        // o fracionamento: quem goza 15 dias hoje ainda pode vender 10 da mesma competência.
        const teto = abonoMaxFerias(feriasParams.diasPorCiclo);
        m.body.querySelector('#faAbonoHint').innerHTML = abono > teto
            ? `<span class="txt-danger">Máximo ${teto} dias (art. 143: até 1/3 do período).</span>`
            : `Dias vendidos (art. 143, máx. ${teto}). Contam para a competência.`;

        // Menor de 18: as férias devem coincidir com as escolares (art. 136 §2º da CLT). É
        // aviso, não trava — o sistema não conhece o calendário da escola, e só o RH sabe se a
        // data combina. Fica fora do `if (!f || dias <= 0)` abaixo porque depende só de quem
        // é a pessoa, não de o período já estar preenchido.
        // Idade no INÍCIO das férias, não hoje: quem faz 18 antes do período já não está
        // sujeito à regra, e o aviso apareceria por engano no lançamento seguinte.
        const anosNoInicio = f ? idadeEm(f.nascimento, iniEl.value || null) : null;
        escolarEl.innerHTML = anosNoInicio != null && anosNoInicio < 18 ? `
            <div class="fa-comp-box is-parcial">
                ${icon('alert')}
                <div>
                    <strong>Menor de 18 anos — férias devem coincidir com as escolares</strong>
                    <div class="muted">Art. 136 §2º da CLT: o empregado menor de 18 tem direito a fazer coincidir suas férias com as férias escolares. Confirme o calendário da instituição antes de lançar.</div>
                </div>
            </div>` : '';

        if (!f || dias <= 0) { calcEl.innerHTML = ''; compEl.innerHTML = ''; return null; }

        const cargo = lancState.cargos.find(x => x.id === f.cargoId);
        // A média de HE lê o mesmo dado da folha — banco de horas + Extra Banco — para não
        // existirem duas verdades sobre quanto de extra a pessoa recebeu.
        // Ao editar, a própria ausência tem que sair do cálculo da competência: senão ela se
        // conta duas vezes e "15 dias" viraria "30 já gozados".
        const outras = ctxFerias.ausencias.filter(x => x.id !== a?.id);
        const sitPrev = situacaoFeriasFunc(f, outras, null);
        const mh = sitPrev && feriasParams.mediaHe
            ? mediaHeFerias(f.id, sitPrev.aquisitivoIni, sitPrev.aquisitivoFim,
                ctxFerias.fechamentos, ctxFerias.extras, ctxFerias.quitacoes)
            : { media: 0, meses: 0, comValor: 0 };
        const c = calculoFerias(f, cargo, folhaState.params, dias, abono, {
            mediaHe: mh.media, adiantar13: adiantEl.checked
        });

        calcEl.innerHTML = fin ? `
            <div class="bx-calc-tit">${icon('money')} Remuneração de férias</div>
            <div class="bx-calc-grid">
                <span>Salário</span><strong>${fmtBRL(c.salario)}</strong>
                ${c.insalubridade ? `<span>+ Insalubridade</span><strong>${fmtBRL(c.insalubridade)}</strong>` : ''}
                ${c.mediaHe ? `<span>+ Média de HE <em class="bx-calc-nota">(${mh.comValor} de ${mh.meses} meses)</em></span><strong>${fmtBRL(c.mediaHe)}</strong>` : ''}
                <span>= Base</span><strong>${fmtBRL(c.base)}</strong>
                <span>÷ 30 <em class="bx-calc-nota">(divisor legal, art. 142)</em></span><strong>${fmtBRL(c.valorDia)}</strong>
                <span>× ${c.dias} dias de gozo</span><strong>${fmtBRL(c.gozo)}</strong>
                ${c.abono ? `<span>+ Abono de ${c.abonoDias} dias</span><strong>${fmtBRL(c.abono)}</strong>` : ''}
                <span>+ Terço constitucional <em class="bx-calc-nota">(${fmtPct(c.tercoPct, 2)})</em></span><strong>${fmtBRL(c.terco)}</strong>
            </div>
            <div class="bx-calc-total"><span>Férias (calc)</span><strong>${fmtBRL(c.total)}</strong></div>
            ${c.adiantamento13 ? `<div class="bx-calc-total" style="border-top:0;padding-top:0"><span>13º adiantado <em class="bx-calc-nota">(coluna separada)</em></span><strong>${fmtBRL(c.adiantamento13)}</strong></div>` : ''}
            <div class="qt-restante">${icon('info')} Cai na folha de <strong>${mesLabel(mesDe(iniEl.value))}</strong> — definida pelo início das férias (art. 145).</div>`
            : '';

        // O RH precisa ver ANTES de salvar se este lançamento fecha a competência ou a deixa
        // pela metade: é a diferença entre o prazo legal parar ou continuar correndo.
        if (sitPrev) {
            // sitPrev já exclui esta ausência, então o que está sendo digitado sempre soma —
            // tanto no lançamento novo quanto na edição.
            const jaTem = sitPrev.diasNaCorrente || 0;
            const total = sitPrev.diasPorCiclo || 30;
            const depois = jaTem + dias + abono;
            const fecha = depois >= total;
            const t = tetoDiasFerias(f, outras, null);
            const excede = dias + abono > t.max;

            compEl.innerHTML = excede ? `
                <div class="fa-comp-box is-erro">
                    ${icon('alert')}
                    <div>
                        <strong>${dias + abono} dias excedem o direito em aberto (${t.max})</strong>
                        <div class="muted">${t.vencidas
                            ? `São ${t.competencias} competências: ${t.saldoCorrente} dias da atual + ${t.vencidas * total} de ${t.vencidas} atrasada${t.vencidas > 1 ? 's' : ''}. Confira a data de retorno.`
                            : `A competência tem ${total} dias. Só se goza mais que isso quando há competências atrasadas acumuladas (art. 137) — não é o caso aqui.`}</div>
                    </div>
                </div>`
                : `
                <div class="fa-comp-box ${fecha ? 'is-fecha' : 'is-parcial'}">
                    ${icon(fecha ? 'check' : 'alert')}
                    <div>
                        <strong>${fecha ? 'Fecha a competência' : `Competência segue aberta — faltam ${Math.max(0, total - depois)} dias`}</strong>
                        <div class="muted">${fecha
                            ? `${Math.min(depois, total)} de ${total} dias. O próximo período aquisitivo passa a valer, e o prazo legal reinicia.`
                            : `${depois} de ${total} dias lançados. O prazo legal continua correndo até ${fmtDate(sitPrev.concessivoFim)} sobre os dias restantes.`}</div>
                        ${t.vencidas ? `<div class="fa-comp-acum">${icon('info')} <span>Há <strong>${t.competencias} competências em aberto</strong> (${t.max} dias no total). Podem ser gozadas juntas — art. 137.</span></div>` : ''}
                    </div>
                </div>`;
        }
        return c;
    };

    iniEl.onchange = retEl.onchange = () => { calcDias(); recalcFerias(); };
    if (ferias) {
        abonoEl.oninput = recalcFerias;
        adiantEl.onchange = recalcFerias;
        funcEl.onchange = recalcFerias;
    }
    calcDias();
    recalcFerias();

    m.footer.innerHTML = `
        <button class="btn btn-secondary" data-cancel>Cancelar</button>
        <button class="btn btn-primary" data-save>${isEdit ? 'Salvar' : 'Lançar'}</button>`;
    m.footer.querySelector('[data-cancel]').onclick = m.close;
    const faBtnSave = m.footer.querySelector('[data-save]');
    faBtnSave.onclick = async () => {
        const dias = calcDias();
        if (!iniEl.value || !retEl.value) return toast('Informe início e retorno.', 'error');
        if (dias <= 0) return toast('A data de retorno deve ser posterior ao início.', 'error');

        // Tetos: regra de negócio, não pode viver só no hint do campo.
        if (ferias) {
            const abono = Math.max(0, Number(abonoEl.value) || 0);
            const tetoAb = abonoMaxFerias(feriasParams.diasPorCiclo);
            if (abono > tetoAb)
                return toast(`O abono pecuniário é limitado a ${tetoAb} dias (art. 143: até 1/3 do período).`, 'error');

            // Um lançamento não pode passar da competência — salvo quando há competências
            // atrasadas acumuladas, que podem ser gozadas juntas (art. 137).
            const f = lancState.funcionarios.find(x => x.id === m.body.querySelector('#faFunc').value);
            const t = f ? tetoDiasFerias(f, ctxFerias.ausencias.filter(x => x.id !== a?.id), null) : null;
            if (t && dias + abono > t.max) {
                return toast(t.vencidas
                    ? `${dias + abono} dias excedem o direito em aberto: ${t.max} dias (${t.competencias} competências — ${t.saldoCorrente} da atual + ${t.vencidas * feriasParams.diasPorCiclo} de ${t.vencidas} atrasada${t.vencidas > 1 ? 's' : ''}).`
                    : `${dias} dias de gozo${abono ? ` + ${abono} de abono` : ''} somam ${dias + abono} — acima dos ${t.max} dias da competência. Só há mais de ${feriasParams.diasPorCiclo} dias quando há competências atrasadas acumuladas.`,
                    'error');
            }
        }

        const fid = m.body.querySelector('#faFunc').value;
        // Um funcionário não pode estar em dois lugares ao mesmo tempo: bloqueia períodos
        // sobrepostos (ex.: férias lançadas por cima de uma licença médica já registrada).
        const todas = await DB.getAll(PATHS.ausencias);
        const choque = todas.find(x => x.id !== a?.id && x.funcionarioId === fid &&
            x.inicio < retEl.value && iniEl.value < x.retorno);
        if (choque) return toast(
            `Período conflita com ${choque.tipo} de ${fmtDate(choque.inicio)} a ${fmtDate(choque.retorno)}.`, 'error');

        faBtnSave.disabled = true;
        faBtnSave.innerHTML = '<span class="spinner"></span> Salvando...';
        try {
            const { anexos, removidos } = await faAnexoCtl.getAnexos();
            const cf = ferias ? recalcFerias() : null;
            await DB.save(PATHS.ausencias, a?.id || null, {
                funcionarioId: fid,
                tipo: m.body.querySelector('#faTipo').value,
                inicio: iniEl.value,
                retorno: retEl.value,
                dias,
                ...(ferias ? {
                    abonoDias: Math.max(0, Number(abonoEl.value) || 0),
                    adiantar13: !!adiantEl.checked,
                    // Memória congelada, como no fechamento do banco: promoção posterior não
                    // reescreve o que já foi pago. O recibo saiu com estes números.
                    calculo: cf ? {
                        salario: cf.salario, insalubridade: cf.insalubridade, periculosidade: cf.periculosidade, mediaHe: cf.mediaHe,
                        base: cf.base, valorDia: cf.valorDia, gozo: cf.gozo, abono: cf.abono,
                        terco: cf.terco, tercoPct: cf.tercoPct,
                        adiantamento13: cf.adiantamento13, total: cf.total
                    } : null
                } : {}),
                obs: m.body.querySelector('#faObs').value.trim(),
                anexos,
                anexo: null
            });
            await excluirAnexoRemoto(removidos);
            // Férias alimentam o 13º (adiantar13 abate a 1ª parcela) e a folha (coluna
            // derivada). Faltas injustificadas alteram os avos. Sem invalidar, a aba do 13º
            // seguiria com o cache velho e sugeriria pagar de novo o que já foi adiantado.
            invalidarCaches13();
            toast(isEdit
                ? (ferias ? 'Férias atualizadas.' : 'Lançamento atualizado.')
                : (ferias ? 'Férias lançadas.' : 'Lançamento registrado.'));
            m.close();
            renderLancTab();
        } catch (e) {
            toast(e.message || 'Erro ao salvar.', 'error');
        } finally {
            faBtnSave.disabled = false;
            faBtnSave.innerHTML = isEdit ? 'Salvar' : 'Lançar';
        }
    };
}

// ============ FÉRIAS ============

const unidadeNomeDe = uid => lancState.unidades.find(u => u.id === uid)?.nome || 'Sem unidade';
const feriasUnidadeDe = fid => lancState.funcionarios.find(f => f.id === fid)?.unidadeId || '';
const feriasUnidadeNome = fid => unidadeNomeDe(feriasUnidadeDe(fid));

// Situação do período em relação a hoje — orienta a leitura gerencial da lista.
function situacaoFerias(a) {
    const h = hoje();
    if (ausenciaVigente(a, h)) return { cls: 'badge-ferias', txt: `Em curso · volta em ${diasAteRetorno(a, h)}d` };
    if (a.inicio > h) return { cls: 'badge-info', txt: `Agendadas · em ${diasEntre(h, a.inicio)}d` };
    return { cls: 'badge-neutral', txt: 'Encerradas' };
}

async function renderFerias() {
    const ferias = (await DB.getAll(PATHS.ausencias))
        .filter(a => a.tipo === TIPO_FERIAS)
        .sort((a, b) => (b.inicio || '').localeCompare(a.inicio || ''));

    const cont = document.getElementById('lancContent');
    const emCurso = ferias.filter(a => ausenciaVigente(a)).length;

    // Fila de vencimento — quantos precisam de ação agora
    const sits = lancAtivos().map(f => situacaoFeriasFunc(f, ferias)).filter(Boolean);
    const urgentes = sits.filter(s => s.status === 'vencida' || s.status === 'critica').length;

    cont.innerHTML = `
        <div class="flex-between" style="margin-bottom:14px">
            <div class="tabs tabs-sub" id="feriasSubs" style="max-width:440px">
                <div class="tab" data-sub="programacao">${icon('alert')} Programação${urgentes ? `<span class="tab-count tab-count-alert">${urgentes}</span>` : ''}</div>
                <div class="tab" data-sub="tabela">${icon('launch')} Tabela</div>
                <div class="tab" data-sub="agenda">${icon('calendar')} Agenda</div>
            </div>
            ${emCurso ? `<span class="badge badge-ferias">${icon('sun')} ${emCurso} de férias hoje</span>` : ''}
        </div>
        <div id="feriasBody"></div>`;

    const subs = cont.querySelectorAll('#feriasSubs .tab');
    const setSub = id => {
        feriasSub = id;
        subs.forEach(t => t.classList.toggle('active', t.dataset.sub === id));
        ({ programacao: feriasProgramacao, tabela: feriasTabela, agenda: feriasAgenda })[id](ferias);
    };
    subs.forEach(t => t.onclick = () => setSub(t.dataset.sub));
    setSub(feriasSub);
}

// ---- Férias: Programação (fila calculada por urgência legal) ----
// Nada é gravado: a fila deriva de admissão + férias já lançadas, então nunca diverge da
// realidade. O RH lê quem vence primeiro e lança as férias reais quando decidir.
function feriasProgramacao(ferias) {
    const box = document.getElementById('feriasBody');
    const podeEditar = can('editar_lancamentos');

    const todos = lancAtivos()
        .map(f => ({ f, sit: situacaoFeriasFunc(f, ferias), fer: feriasVigente(f.id, ferias) }))
        .filter(x => x.sit);
    // Escalona sobre a equipe inteira (não só a unidade filtrada) — a fila real considera todos
    const plano = programacaoEscalonada(todos, ferias);

    const linhas = todos
        .filter(x => feriasPassaFiltro(x.f))
        .sort((a, b) => (FERIAS_ORDEM[a.sit.status] - FERIAS_ORDEM[b.sit.status]) || (a.sit.dias - b.sit.dias));

    const n = st => linhas.filter(x => x.sit.status === st).length;

    box.innerHTML = `
        <div class="prog-resumo">
            ${[['vencida', 'Vencidas — dobra devida'], ['critica', 'Vencem em até 60 dias'], ['atencao', 'Direito adquirido'], ['aquisitivo', 'Em formação']]
                .map(([st, txt]) => `
                <div class="prog-kpi prog-${st}">
                    <span class="prog-n">${n(st)}</span>
                    <span class="prog-lbl">${txt}</span>
                </div>`).join('')}
        </div>
        <div class="table-wrap">
            <div class="table-toolbar">
                <div class="search-box">${icon('search')}<input class="input" id="lancSearch" placeholder="Buscar por funcionário..."></div>
                ${feriasFiltrosHtml('progUni', 'progCargo')}
                <div class="grow"></div>
            </div>
            <div class="table-scroll">
                <table class="table">
                    <thead><tr>
                        <th>Funcionário</th><th>Unidade</th>
                        <th title="Prazo legal: fim do período concessivo — estourar gera pagamento em dobro (art. 137 CLT)">Prazo legal</th>
                        <th>Conceder até</th>
                        <th title="Data sugerida pelo sistema e quanto falta para ela">Data prevista</th>
                        <th style="width:150px"></th>
                    </tr></thead>
                    <tbody id="lancTbody">${linhas.map(({ f, sit, fer }) => {
                        const s = FERIAS_STATUS[sit.status];
                        const p = plano.get(f.id);
                        return `
                        <tr data-id="${f.id}" class="row-clickable" data-search="${escapeHtml((f.nome + ' ' + (unidadeNomeDe(f.unidadeId))).toLowerCase())}">
                            <td>
                                <div class="flex" style="gap:8px;align-items:center">
                                    ${avatarHtml(f)}
                                    <span class="prog-dot ${s.dot}"></span>
                                    <strong>${escapeHtml(f.nome)}</strong>
                                    ${fer ? `<span class="badge badge-ferias" title="Volta ${fmtDate(fer.retorno)}">${icon('sun')} de férias</span>` : ''}
                                </div>
                                <div class="prog-aq">Aquisitivo ${fmtDate(sit.aquisitivoIni)} → ${fmtDate(sit.aquisitivoFim)}</div>
                            </td>
                            <td class="text-2">${escapeHtml(unidadeNomeDe(f.unidadeId))}</td>
                            <td>
                                <span class="badge ${s.cls}" title="${escapeHtml(sit.desc)}">${escapeHtml(sit.label)}</span>
                                ${sit.status !== 'aquisitivo' ? `<div class="prog-dias ${sit.status === 'vencida' ? 'txt-danger' : ''}">${sit.dias < 0 ? '−' : ''}${fmtNum(Math.abs(sit.dias))} dias</div>` : ''}
                            </td>
                            <td class="text-2">${sit.status === 'aquisitivo' ? '—' : fmtDate(sit.concessivoFim)}</td>
                            <td class="text-2">
                                ${fer ? '<span class="muted">em curso</span>' : (() => {
                                    const av = alertaPrevisto(sit, p);
                                    return `
                                    <div>${fmtDate(p.inicio)} → ${fmtDate(p.retorno)}</div>
                                    <div class="prog-prev prog-prev-${av.nivel}" title="${escapeHtml(
                                        av.nivel === 'estoura' ? `A data prevista ultrapassa o prazo legal (${fmtDate(sit.concessivoFim)}) — antecipe ou aceite a dobra.`
                                        : av.nivel === 'atrasado' ? 'A data prevista já passou sem lançamento.'
                                        : 'Contagem até a data prevista pelo sistema.')}">
                                        ${av.nivel === 'estoura' ? `${icon('alert')} ` : ''}${escapeHtml(av.txt)}
                                    </div>
                                    ${p.adiado ? `<span class="prog-adiado" title="Adiado de ${fmtDate(p.base)} para não coincidir com colega do mesmo cargo/unidade">escalonado</span>` : ''}`;
                                })()}
                            </td>
                            <td>${podeEditar && !fer ? `<button class="btn btn-sm ${sit.status === 'vencida' || sit.status === 'critica' ? 'btn-primary' : 'btn-secondary'}" data-lancar>${icon('plus')} Lançar férias</button>` : ''}</td>
                        </tr>`;
                    }).join('')}</tbody>
                </table>
            </div>
        </div>`;

    if (!linhas.length) {
        document.getElementById('lancTbody').innerHTML =
            `<tr><td colspan="10"><div class="table-empty">${icon('sun')}<span>Nenhum funcionário ativo com admissão registrada.</span></div></td></tr>`;
    }
    document.getElementById('lancSearch').addEventListener('input', () => lancAplicaFiltros());
    bindAvatarFotos(box);
    feriasBindFiltros('progUni', 'progCargo', () => feriasProgramacao(ferias));

    box.querySelectorAll('#lancTbody tr[data-id]').forEach(tr => {
        const item = linhas.find(x => x.f.id === tr.dataset.id);
        // A linha mostra só a competência corrente. Clicar abre todas — as vencidas que ainda
        // devem, a vigente, a em formação — e o histórico do que já foi publicado.
        tr.onclick = () => detalheFeriasFunc(item.f, ferias, item.sit, plano);
        const btn = tr.querySelector('[data-lancar]');
        if (btn) btn.onclick = e => {
            e.stopPropagation();
            // Pré-preenche com a data escalonada (não a bruta); o RH ajusta antes de salvar.
            const p = plano.get(item.f.id);
            formAusencia({ funcionarioId: item.f.id, inicio: p.inicio, retorno: p.retorno, dias: p.dias }, true, item.sit);
        };
    });
}

// ============ JANELA: SITUAÇÃO DE FÉRIAS DO FUNCIONÁRIO ============
// Abre pela linha da Programação. A tabela mostra a competência CORRENTE; aqui estão todas —
// as vencidas que continuam devendo, a vigente e a que está em formação — mais o histórico do
// que já foi publicado.
function detalheFeriasFunc(f, ausencias, sit, plano) {
    const podeEditar = can('editar_lancamentos');
    const comps = competenciasFerias(f, ausencias);
    const emAberto = comps.filter(c => c.estado !== 'gozada' && c.estado !== 'formacao');
    const publicadas = (ausencias || [])
        .filter(a => a.funcionarioId === f.id && a.tipo === 'Férias')
        .sort((a, b) => (b.inicio || '').localeCompare(a.inicio || ''));

    const s = FERIAS_STATUS[sit.status];
    const fer = feriasVigente(f.id, ausencias);
    const t = tetoDiasFerias(f, ausencias);
    const diasDevidos = comps.reduce((acc, c) => acc + c.emDobra, 0);

    const ESTADO = {
        vencida:  { cls: 'badge-danger',  txt: 'Vencida',      ico: 'alert' },
        vigente:  { cls: 'badge-info',    txt: 'Vigente',      ico: 'clock' },
        formacao: { cls: 'badge-neutral', txt: 'Em formação',  ico: 'refresh' },
        gozada:   { cls: 'badge-success', txt: 'Gozada',       ico: 'check' }
    };

    const m = openModal({
        titleHtml: dhFuncCardHtml(f),
        size: 'md',
        body: `
            <div class="dc-tabs" role="tablist">
                <button class="dc-tab is-active" data-dftab="situacao" role="tab">${icon('sun')} Competências
                    ${emAberto.length ? `<span class="dc-tab-badge">${emAberto.length}</span>` : ''}</button>
                <button class="dc-tab" data-dftab="historico" role="tab">${icon('clock')} Histórico
                    ${publicadas.length ? `<span class="dc-tab-badge">${publicadas.length}</span>` : ''}</button>
            </div>

            <div data-dfpane="situacao">
                <div class="df-hero ${sit.status === 'vencida' ? 'is-vencida' : sit.status === 'critica' ? 'is-critica' : 'is-ok'}">
                    <div class="df-hero-top">
                        <div>
                            <span class="dc-lbl">${sit.status === 'aquisitivo' ? 'Direito em formação' : 'Dias em aberto'}</span>
                            <div class="df-saldo">${t.max}<small>dias</small></div>
                            <div class="df-decomp">${t.competencias} competência${t.competencias > 1 ? 's' : ''} em aberto${t.vencidas ? ` · <strong class="txt-danger">${t.vencidas} atrasada${t.vencidas > 1 ? 's' : ''}</strong>` : ''}</div>
                        </div>
                        <div class="dc-hero-right">
                            <span class="badge ${s.cls}">${escapeHtml(sit.label)}</span>
                            ${fer ? `<div class="df-emcurso">${icon('sun')} De férias até ${fmtDate(fer.retorno)}</div>` : ''}
                        </div>
                    </div>
                    <p class="dc-desc">${escapeHtml(sit.desc)}</p>
                    ${diasDevidos ? `<div class="df-dobra">${icon('alert')} <span><strong>${diasDevidos} dias</strong> já vencidos são devidos <strong>em dobro</strong> (art. 137 CLT). A dobra incide só sobre o que falta conceder, não sobre a competência inteira.</span></div>` : ''}
                </div>

                <div class="dc-sec">
                    <div class="dc-sec-tit">${icon('calendar')} Períodos aquisitivos</div>
                    <div class="df-comps">
                        ${comps.slice().reverse().map(c => {
                            const e = ESTADO[c.estado];
                            const pct = Math.round(c.usados / c.total * 100);
                            return `
                            <div class="df-comp is-${c.estado}">
                                <div class="df-comp-top">
                                    <div>
                                        <strong>${fmtDate(c.aquisitivoIni)} → ${fmtDate(c.aquisitivoFim)}</strong>
                                        <div class="muted">${c.estado === 'formacao'
                                            ? `Direito completo em ${fmtDate(c.aquisitivoFim)}`
                                            : `Conceder até ${fmtDate(c.concessivoFim)}${c.dias < 0 ? ` — venceu há ${prazoTexto(c.dias)}` : c.estado === 'gozada' ? '' : ` — ${prazoTexto(c.dias)} restantes`}`}</div>
                                    </div>
                                    <span class="badge ${e.cls}">${e.txt}</span>
                                </div>
                                <div class="df-comp-bar" title="${c.usados} de ${c.total} dias">
                                    <div class="df-comp-fill is-${c.estado}" style="width:${pct}%"></div>
                                </div>
                                <div class="df-comp-nums">
                                    <span>${c.usados} de ${c.total} dias gozados</span>
                                    ${c.restantes && c.estado !== 'formacao' ? `<strong class="${c.estado === 'vencida' ? 'txt-danger' : ''}">faltam ${c.restantes}</strong>` : ''}
                                    ${c.fracionada ? '<span class="df-frac">fracionada</span>' : ''}
                                </div>
                                ${c.lancamentos.length ? `
                                <div class="df-comp-lancs">
                                    ${c.lancamentos.map(l => `
                                        <button class="df-lanc" data-lanc="${l.id}">
                                            ${icon('sun')} ${fmtDate(l.inicio)} → ${fmtDate(l.retorno)}
                                            <span>${l.diasNaCompetencia}d${l.abonoDias ? ` · ${l.abonoDias} abono` : ''}</span>
                                        </button>`).join('')}
                                </div>` : ''}
                            </div>`;
                        }).join('')}
                    </div>
                </div>
            </div>

            <div data-dfpane="historico" hidden>
                ${publicadas.length ? `
                <div class="dc-hist-resumo">
                    <div><span>Lançamentos</span><strong>${publicadas.length}</strong></div>
                    <div><span>Dias gozados</span><strong>${publicadas.reduce((s2, a) => s2 + (Number(a.dias) || 0), 0)}</strong></div>
                    <div><span>Dias vendidos</span><strong>${publicadas.reduce((s2, a) => s2 + (Number(a.abonoDias) || 0), 0) || '—'}</strong></div>
                </div>
                <div class="df-hist">
                    ${publicadas.map(a => {
                        const emCurso = ausenciaVigente(a, hoje());
                        const futura = a.inicio > hoje();
                        return `
                        <div class="df-hist-item ${emCurso ? 'is-curso' : futura ? 'is-futura' : ''}" data-lanc="${a.id}">
                            <span class="df-hist-ico">${icon('sun')}</span>
                            <div class="grow">
                                <strong>${fmtDate(a.inicio)} → ${fmtDate(a.retorno)}</strong>
                                ${emCurso ? '<span class="badge badge-ferias">em curso</span>' : futura ? '<span class="badge badge-info">programada</span>' : ''}
                                <div class="muted">${a.dias} dias${a.abonoDias ? ` + ${a.abonoDias} de abono` : ''}${a.adiantar13 ? ' · 13º adiantado' : ''}${a.obs ? ` — ${escapeHtml(a.obs)}` : ''}</div>
                            </div>
                            ${a.calculo?.total ? `<strong class="num">${fmtBRL(a.calculo.total)}</strong>` : ''}
                            ${icon('chevronRight')}
                        </div>`;
                    }).join('')}
                </div>` : `
                <div class="dc-vazio">${icon('sun')} Nenhuma férias publicada para ${escapeHtml(f.nome.split(' ')[0])} ainda.</div>`}
            </div>`,
        footer: `
            <button class="btn btn-secondary" data-cancel>Fechar</button>
            ${podeEditar && !fer ? `<button class="btn btn-primary" data-lancar>${icon('plus')} Lançar férias</button>` : ''}`
    });

    bindAvatarFotos(m.el);
    const funcCard = m.el.querySelector('.dh-func-card');
    if (funcCard) funcCard.onclick = () => { m.close(); abrirFichaFuncionario(f.id); };

    m.footer.querySelector('[data-cancel]').onclick = m.close;
    const bl = m.footer.querySelector('[data-lancar]');
    if (bl) bl.onclick = () => {
        m.close();
        const p = plano?.get(f.id);
        formAusencia(p ? { funcionarioId: f.id, inicio: p.inicio, retorno: p.retorno, dias: p.dias } : { funcionarioId: f.id }, true, sit);
    };

    // Abas. A ação do rodapé é sobre a competência corrente; no histórico ela não faz sentido.
    m.body.querySelectorAll('[data-dftab]').forEach(tab => {
        tab.onclick = () => {
            const alvo = tab.dataset.dftab;
            m.body.querySelectorAll('[data-dftab]').forEach(t2 => t2.classList.toggle('is-active', t2 === tab));
            m.body.querySelectorAll('[data-dfpane]').forEach(p => p.hidden = p.dataset.dfpane !== alvo);
            if (bl) bl.hidden = alvo !== 'situacao';
        };
    });

    // Qualquer lançamento (na competência ou no histórico) abre o detalhe já existente.
    m.body.querySelectorAll('[data-lanc]').forEach(el => {
        el.onclick = () => {
            const a = (ausencias || []).find(x => x.id === el.dataset.lanc);
            if (a) { m.close(); detalheAusencia(a, excluirFerias, () => renderLancTab()); }
        };
    });
}

const excluirFerias = async a => {
    if (await confirmDialog({ title: 'Excluir férias', message: `Excluir as férias de <strong>${escapeHtml(lancFuncNome(a.funcionarioId))}</strong> (${fmtDate(a.inicio)} → ${fmtDate(a.retorno)})?`, confirmText: 'Excluir', danger: true })) {
        await excluirAnexoRemoto(anexosDe(a));
        await DB.remove(PATHS.ausencias, a.id);
        // Sem isto, o adiantamento de 13º de umas férias excluídas continuaria abatendo a 1ª
        // parcela — o RH pagaria a menos.
        invalidarCaches13();
        toast('Férias excluídas.');
        renderLancTab();
    }
};

// ---- Férias: Tabela ----
function feriasTabela(ferias) {
    const box = document.getElementById('feriasBody');
    const podeEditar = can('editar_lancamentos');
    box.innerHTML = `
        <div class="table-wrap">
            <div class="table-toolbar">
                <div class="search-box">${icon('search')}<input class="input" id="lancSearch" placeholder="Buscar por funcionário ou unidade..."></div>
                <div class="grow"></div>
                ${podeEditar ? `<button class="btn btn-primary" id="lancNew">${icon('plus')} Lançar férias</button>` : ''}
            </div>
            <div class="table-scroll">
                <table class="table">
                    <thead><tr><th>Funcionário</th><th>Unidade</th><th>Início</th><th>Retorno</th><th class="num">Dias</th><th>Situação</th><th>Anexo</th><th style="width:48px"></th></tr></thead>
                    <tbody id="lancTbody">${ferias.map(a => {
                        const s = situacaoFerias(a);
                        return `
                        <tr data-id="${a.id}" data-search="${escapeHtml((lancFuncNome(a.funcionarioId) + ' ' + feriasUnidadeNome(a.funcionarioId)).toLowerCase())}">
                            <td>${lancFuncCellHtml(a.funcionarioId)}</td>
                            <td class="text-2">${escapeHtml(feriasUnidadeNome(a.funcionarioId))}</td>
                            <td>${fmtDate(a.inicio)}</td>
                            <td>${fmtDate(a.retorno)}</td>
                            <td class="num"><strong>${fmtNum(a.dias)}</strong></td>
                            <td><span class="badge ${s.cls}">${escapeHtml(s.txt)}</span></td>
                            <td>${anexosDe(a).length ? anexoChip(anexosDe(a)) : '<span class="muted">—</span>'}</td>
                            <td>${podeEditar ? `<button class="btn-icon" data-menu>${icon('dots')}</button>` : ''}</td>
                        </tr>`;
                    }).join('')}</tbody>
                </table>
            </div>
        </div>`;

    if (!ferias.length) {
        document.getElementById('lancTbody').innerHTML =
            `<tr><td colspan="10"><div class="table-empty">${icon('sun')}<span>Nenhum período de férias lançado.</span></div></td></tr>`;
    }
    const btnNew = document.getElementById('lancNew');
    if (btnNew) btnNew.onclick = () => formAusencia(null, true);
    document.getElementById('lancSearch').addEventListener('input', () => lancAplicaFiltros());
    bindLancFuncCells(document.getElementById('lancTbody'));
    bindAnexoChips(document.getElementById('lancTbody'), el => anexosDe(ferias.find(x => x.id === el.closest('tr').dataset.id)));

    document.querySelectorAll('#lancTbody tr[data-id]').forEach(tr => {
        const a = ferias.find(x => x.id === tr.dataset.id);
        lancRowClick(tr, () => detalheAusencia(a, excluirFerias));
        lancRowMenu(tr, [
            { label: 'Ver detalhes', icon: 'eye', onClick: () => detalheAusencia(a, excluirFerias) },
            { label: 'Editar', icon: 'edit', onClick: () => formAusencia(a, true) },
            'sep',
            { label: 'Excluir', icon: 'trash', danger: true, onClick: () => excluirFerias(a) }
        ]);
    });
}

// ---- Férias: Agenda (linha do tempo anual, uma linha por colaborador) ----
// Uma linha por pessoa, com nome e unidade fixos à esquerda: a identificação está na própria
// linha, então a cor fica livre para significar ESTADO (realizado / em curso / previsto) em
// vez de "quem é". Legenda de N pessoas era lista de conferência, não legenda.
// Conflito = 2+ do MESMO cargo e MESMA unidade fora no mesmo dia — marcado sobre a barra.
function feriasAgenda(ferias) {
    const box = document.getElementById('feriasBody');
    const ini = `${feriasAno}-01-01`, fim = `${feriasAno}-12-31`;
    const totalDias = diasEntre(ini, fim) + 1;
    const pct = d => (diasEntre(ini, d) / totalDias) * 100;
    // Recorta o período ao ano exibido (férias podem atravessar o réveillon)
    const barra = (i, f) => {
        const a = i < ini ? ini : i, b = f > fim ? fim : f;
        return { left: pct(a), width: Math.max((diasEntre(a, b) / totalDias) * 100, 0.5), corta: i < ini || f > fim };
    };

    const doAno = ferias.filter(a => a.inicio <= fim && a.retorno > ini);
    const elegiveis = lancAtivos().map(f => ({ f, sit: situacaoFeriasFunc(f, ferias) })).filter(x => x.sit);
    const planoAg = feriasMostrarPrev ? programacaoEscalonada(elegiveis, ferias) : new Map();

    // Uma linha por colaborador que tenha algo no ano (lançado ou previsto)
    const linhasFunc = lancState.funcionarios
        .filter(f => !f.demissao)
        .filter(feriasPassaFiltro)
        .map(f => {
            const reais = doAno.filter(a => a.funcionarioId === f.id);
            const p = planoAg.get(f.id);
            const prevista = p && p.inicio <= fim && p.retorno > ini
                && !reais.some(a => a.inicio < p.retorno && p.inicio < a.retorno) ? p : null;
            return { f, reais, prevista, sit: elegiveis.find(x => x.f.id === f.id)?.sit };
        })
        .filter(x => x.reais.length || x.prevista)
        .sort((a, b) => {
            // Quem está de férias agora primeiro, depois por data de início no ano
            const da = a.reais[0]?.inicio || a.prevista?.inicio || '9';
            const db = b.reais[0]?.inicio || b.prevista?.inicio || '9';
            return da.localeCompare(db) || (a.f.nome || '').localeCompare(b.f.nome || '');
        });

    // Conflito: mesmo dia, mesma unidade+cargo, 2+ pessoas
    const grupoDe = f => `${f.unidadeId || '-'}|${f.cargoId || '-'}`;
    const conflitoDe = (f, a) => doAno.some(o => {
        if (o.id === a.id || o.funcionarioId === f.id) return false;
        const of = lancState.funcionarios.find(x => x.id === o.funcionarioId);
        return of && grupoDe(of) === grupoDe(f) && o.inicio < a.retorno && a.inicio < o.retorno;
    });
    const totalConflitos = doAno.filter(a => {
        const f = lancState.funcionarios.find(x => x.id === a.funcionarioId);
        return f && conflitoDe(f, a);
    }).length;

    // Régua de meses
    const reguaMeses = MESES.map((m, i) => {
        const dm = new Date(feriasAno, i + 1, 0).getDate();
        return `<div class="gt-m" style="left:${pct(`${mesKey(feriasAno, i)}-01`)}%;width:${(dm / totalDias) * 100}%">${m}</div>`;
    }).join('');

    // Marcos legais da competência em aberto: quando o direito nasce (verde) e o último dia
    // para conceder sem dobra (vermelho). São as duas datas que governam a linha inteira —
    // ficavam só no tooltip da barra, então a agenda não mostrava por que aquela pessoa era
    // urgente e a de baixo não. Só desenha o marco que cai dentro do ano exibido.
    const marcoHtml = (data, cls, titulo) => data >= ini && data <= fim
        ? `<span class="gt-mark ${cls}" style="left:${pct(data)}%" title="${escapeHtml(titulo)}"></span>`
        : '';
    // Entre os dois marcos vai a janela legal — a faixa em que estas férias podem ser
    // concedidas. Dois losangos soltos obrigavam a ler a régua para saber o que havia entre
    // eles; a faixa mostra o intervalo inteiro de uma vez, inclusive quando um dos extremos
    // cai fora do ano e só a continuação aparece na tela.
    const janelaHtml = sit => {
        if (sit.aquisitivoFim > fim || sit.concessivoFim < ini) return '';
        const b = barra(sit.aquisitivoFim, sit.concessivoFim);
        return `<span class="gt-janela" style="left:${b.left}%;width:${b.width}%"
            title="${escapeHtml(`Janela legal: ${fmtDate(sit.aquisitivoFim)} → ${fmtDate(sit.concessivoFim)} — período em que estas férias podem ser concedidas.`)}"></span>`;
    };

    const marcosLegais = sit => !sit ? '' : `
        ${janelaHtml(sit)}
        ${marcoHtml(sit.aquisitivoFim, 'gt-mark-direito',
            `Direito adquirido em ${fmtDate(sit.aquisitivoFim)} — a partir daqui as férias podem ser concedidas.`)}
        ${marcoHtml(sit.concessivoFim, 'gt-mark-prazo',
            `Conceder até ${fmtDate(sit.concessivoFim)} — depois desta data, férias em dobro (art. 137 CLT).`)}`;

    const hojeNoAno = hoje() >= ini && hoje() <= fim;

    box.innerHTML = `
        <div class="table-wrap" style="padding:14px">
            <div class="flex-between" style="margin-bottom:12px;gap:10px;flex-wrap:wrap">
                <div class="month-nav">
                    <button id="agPrev" title="Ano anterior">‹</button>
                    <span class="month-label">${feriasAno}</span>
                    <button id="agNext" title="Próximo ano">›</button>
                </div>
                <div class="flex" style="gap:8px">
                    ${totalConflitos ? `<span class="badge badge-warning" title="Períodos coincidindo com colega do mesmo cargo e unidade">${icon('alert')} ${totalConflitos} conflito(s)</span>` : ''}
                    <button class="btn btn-secondary btn-filter${feriasMostrarPrev ? ' active' : ''}" id="agPrev2" title="Alternar previsão calculada">${icon('calendar')} Previsão</button>
                    ${feriasFiltrosHtml('agUni', 'agCargo')}
                </div>
            </div>

            ${linhasFunc.length ? `
            <div class="gt-scroll">
                <div class="gt">
                    <div class="gt-row gt-head">
                        <div class="gt-lbl"></div>
                        <div class="gt-track gt-regua">${reguaMeses}</div>
                    </div>
                    ${linhasFunc.map(({ f, reais, prevista, sit }) => {
                        const fer = feriasVigente(f.id, ferias);
                        return `
                        <div class="gt-row" data-fid="${f.id}">
                            <div class="gt-lbl" ${sit ? `title="${escapeHtml(sit.desc)}"` : ''}>
                                <div class="gt-nome">
                                    ${avatarHtml(f, 'xs')}
                                    <span class="gt-nome-txt">${escapeHtml(f.nome)}</span>
                                    ${sit && sit.status !== 'aquisitivo' && !fer
                                        ? `<span class="gt-sit gt-sit-${sit.status}" title="${escapeHtml(sit.label)}">${sit.status === 'vencida' ? '● vencida' : `● ${sit.dias}d`}</span>` : ''}
                                </div>
                                <div class="gt-uni">${escapeHtml(unidadeNomeDe(f.unidadeId))}</div>
                            </div>
                            <div class="gt-track">
                                ${MESES.map((_, i) => `<span class="gt-grid" style="left:${pct(`${mesKey(feriasAno, i)}-01`)}%"></span>`).join('')}
                                ${hojeNoAno ? `<span class="gt-hoje" style="left:${pct(hoje())}%"></span>` : ''}
                                ${marcosLegais(sit)}
                                ${reais.map(a => {
                                    const b = barra(a.inicio, a.retorno);
                                    const emCurso = ausenciaVigente(a);
                                    const conf = conflitoDe(f, a);
                                    return `<span class="gt-bar ${emCurso ? 'gt-curso' : 'gt-real'}${conf ? ' gt-conf' : ''}"
                                        data-id="${a.id}" style="left:${b.left}%;width:${b.width}%"
                                        title="${escapeHtml(`${fmtDate(a.inicio)} → ${fmtDate(a.retorno)} · ${a.dias}d${emCurso ? ' · em curso' : ''}${conf ? ' · ⚠ coincide com colega do mesmo cargo/unidade' : ''}`)}"
                                        >${b.width > 6 ? `<span class="gt-txt">${a.dias}d</span>` : ''}</span>`;
                                }).join('')}
                                ${prevista ? (() => {
                                    const b = barra(prevista.inicio, prevista.retorno);
                                    return `<span class="gt-bar gt-prev" data-fid="${f.id}" style="left:${b.left}%;width:${b.width}%;cursor:pointer"
                                        title="${escapeHtml(`Previsto: ${fmtDate(prevista.inicio)} → ${fmtDate(prevista.retorno)}${sit ? ` — ${sit.desc}` : ''} · clique para lançar`)}"
                                        >${b.width > 6 ? `<span class="gt-txt">previsto</span>` : ''}</span>`;
                                })() : ''}
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            </div>
            <div class="gt-legenda">
                <span class="gt-leg"><span class="gt-chip gt-real"></span>Realizado</span>
                <span class="gt-leg"><span class="gt-chip gt-curso"></span>Em curso</span>
                <span class="gt-leg"><span class="gt-chip gt-prev"></span>Previsto (prazo legal)</span>
                <span class="gt-leg" title="Fim do período aquisitivo: o direito às férias nasce nesta data"><span class="gt-chip gt-mark-chip gt-mark-direito"></span>Direito adquirido</span>
                <span class="gt-leg" title="Fim do período concessivo: conceder depois disso paga em dobro (art. 137 CLT)"><span class="gt-chip gt-mark-chip gt-mark-prazo"></span>Conceder até</span>
                <span class="gt-leg" title="Intervalo entre os dois marcos — quando estas férias podem ser concedidas"><span class="gt-chip gt-janela-chip"></span>Janela legal</span>
                ${totalConflitos ? `<span class="gt-leg"><span class="gt-chip gt-conf-leg"></span>Conflito de cobertura</span>` : ''}
            </div>`
            : `<p class="muted" style="text-align:center;padding:28px 0">Ninguém de férias em ${feriasAno}${feriasFiltroUnidade || feriasFiltroCargo ? ' com os filtros aplicados' : ''}.</p>`}
        </div>`;

    document.getElementById('agPrev2').onclick = () => { feriasMostrarPrev = !feriasMostrarPrev; feriasAgenda(ferias); };

    const navAno = delta => { feriasAno += delta; feriasAgenda(ferias); };
    document.getElementById('agPrev').onclick = () => navAno(-1);
    document.getElementById('agNext').onclick = () => navAno(1);

    feriasBindFiltros('agUni', 'agCargo', () => feriasAgenda(ferias));
    bindAvatarFotos(box);

    box.querySelectorAll('.gt-bar[data-id]').forEach(b => {
        b.onclick = () => detalheAusencia(ferias.find(x => x.id === b.dataset.id), excluirFerias);
    });
    box.querySelectorAll('.gt-bar.gt-prev[data-fid]').forEach(b => {
        b.onclick = () => {
            const { f, prevista, sit } = linhasFunc.find(x => x.f.id === b.dataset.fid);
            formAusencia({ funcionarioId: f.id, inicio: prevista.inicio, retorno: prevista.retorno, dias: prevista.dias }, true, sit);
        };
    });
}

// ============ DEMISSÕES ============
async function renderDemissoes() {
    const demissoes = (await DB.getAll(PATHS.demissoes)).sort((a, b) => (b.data || '').localeCompare(a.data || ''));

    lancList({
        searchPh: 'Buscar por funcionário ou motivo...',
        btnLabel: 'Lançar demissão',
        emptyText: 'Nenhuma demissão lançada.',
        thead: '<th>Funcionário</th><th>Data</th><th>Motivo</th><th>Observações</th><th>Anexo</th><th style="width:48px"></th>',
        rowsHtml: demissoes.map(d => `
            <tr data-id="${d.id}" data-search="${escapeHtml((lancFuncNome(d.funcionarioId) + ' ' + (d.motivo || '')).toLowerCase())}">
                <td>${lancFuncCellHtml(d.funcionarioId)}</td>
                <td>${fmtDate(d.data)}</td>
                <td><span class="badge badge-danger">${escapeHtml(d.motivo || '—')}</span></td>
                <td class="text-2">${escapeHtml(d.obs || '—')}</td>
                <td>${anexosDe(d).length ? anexoChip(anexosDe(d)) : '<span class="muted">—</span>'}</td>
                <td>${can('editar_lancamentos') ? `<button class="btn-icon" data-menu>${icon('dots')}</button>` : ''}</td>
            </tr>`).join(''),
        onNew: () => formDemissao(null)
    });
    bindLancFuncCells(document.getElementById('lancTbody'));
    bindAnexoChips(document.getElementById('lancTbody'), el => anexosDe(demissoes.find(x => x.id === el.closest('tr').dataset.id)));

    const excluirDem = async d => {
        if (await confirmDialog({ title: 'Excluir demissão', message: `Excluir o desligamento de <strong>${escapeHtml(lancFuncNome(d.funcionarioId))}</strong>? O funcionário voltará ao status ativo.`, confirmText: 'Excluir', danger: true })) {
            await excluirAnexoRemoto(anexosDe(d));
            await DB.remove(PATHS.demissoes, d.id);
            await DB.save(PATHS.funcionarios, d.funcionarioId, { demissao: null });
            const f = lancState.funcionarios.find(x => x.id === d.funcionarioId);
            if (f) f.demissao = null;
            invalidarCaches13();   // reativado volta a ter avos até dezembro
            toast('Demissão excluída; funcionário reativado.');
            renderLancTab();
        }
    };

    document.querySelectorAll('#lancTbody tr[data-id]').forEach(tr => {
        const d = demissoes.find(x => x.id === tr.dataset.id);
        lancRowClick(tr, () => detalheDemissao(d, excluirDem));
        lancRowMenu(tr, [
            { label: 'Ver detalhes', icon: 'eye', onClick: () => detalheDemissao(d, excluirDem) },
            { label: 'Editar', icon: 'edit', onClick: () => formDemissao(d) },
            'sep',
            { label: 'Excluir (reintegrar)', icon: 'trash', danger: true, onClick: () => excluirDem(d) }
        ]);
    });
}

function detalheDemissao(d, onDelete, onClose) {
    abrirDetalheLanc({
        titulo: lancFuncNome(d.funcionarioId),
        funcionarioId: d.funcionarioId,
        sub: 'Desligamento',
        badgeHtml: `<span class="badge badge-danger">${escapeHtml(d.motivo || '—')}</span>`,
        linhas: [
            ['Data da demissão', fmtDate(d.data)],
            ['Motivo', escapeHtml(d.motivo || '—')],
            ['Observações', escapeHtml(d.obs || '—')]
        ],
        anexo: anexosDe(d),
        onEdit: () => formDemissao(d),
        onDelete: onDelete ? () => onDelete(d) : null,
        onClose
    });
}

function formDemissao(d) {
    const isEdit = !!d;
    const selFunc = selectFuncionario('fdFunc', d?.funcionarioId);
    if (!selFunc) return toast('Nenhum funcionário ativo para desligar.', 'info');

    const m = openModal({
        title: isEdit ? 'Editar demissão' : 'Lançar demissão',
        body: `
            <div class="field"><label>Funcionário <span class="req">*</span></label>${isEdit ? `<input class="input" disabled value="${escapeHtml(lancFuncNome(d.funcionarioId))}">` : selFunc}</div>
            <div class="form-row">
                <div class="field"><label>Data da demissão <span class="req">*</span></label><input class="input" id="fdData" type="date" value="${d?.data || hoje()}"></div>
                <div class="field"><label>Motivo <span class="req">*</span></label>
                    <select class="select" id="fdMotivo">${MOTIVOS_DEMISSAO.map(mo => `<option ${d?.motivo === mo ? 'selected' : ''}>${mo}</option>`).join('')}</select>
                </div>
            </div>
            <div class="field"><label>Observações</label><textarea class="input" id="fdObs" rows="2">${escapeHtml(d?.obs || '')}</textarea></div>
            <div class="field"><label>Anexo (termo de rescisão, aviso prévio)</label><div id="fdAnexo"></div></div>`,
        footer: ''
    });

    if (!isEdit) bindSelectFuncionario(m.body, 'fdFunc');
    const fdAnexoCtl = initAnexoField(m.body.querySelector('#fdAnexo'), anexosDe(d));

    m.footer.innerHTML = `
        <button class="btn btn-secondary" data-cancel>Cancelar</button>
        <button class="btn ${isEdit ? 'btn-primary' : 'btn-danger'}" data-save>${isEdit ? 'Salvar' : 'Confirmar desligamento'}</button>`;
    m.footer.querySelector('[data-cancel]').onclick = m.close;
    const fdBtnSave = m.footer.querySelector('[data-save]');
    fdBtnSave.onclick = async () => {
        const data = m.body.querySelector('#fdData').value;
        if (!data) return toast('Informe a data da demissão.', 'error');
        const funcionarioId = isEdit ? d.funcionarioId : m.body.querySelector('#fdFunc').value;
        const f = lancState.funcionarios.find(x => x.id === funcionarioId);
        if (f?.admissao && data < f.admissao) return toast('Demissão não pode ser anterior à admissão.', 'error');

        fdBtnSave.disabled = true;
        fdBtnSave.innerHTML = '<span class="spinner"></span> Salvando...';
        try {
            const { anexos, removidos } = await fdAnexoCtl.getAnexos();
            await DB.save(PATHS.demissoes, d?.id || null, {
                funcionarioId, data,
                motivo: m.body.querySelector('#fdMotivo').value,
                obs: m.body.querySelector('#fdObs').value.trim(),
                anexos,
                anexo: null
            });
            await excluirAnexoRemoto(removidos);
            // Conexão automática: atualiza a ficha
            await DB.save(PATHS.funcionarios, funcionarioId, { demissao: data });
            if (f) f.demissao = data;
            // A demissão define os avos do 13º (param na data) e o direito ao proporcional —
            // justa causa não gera (Súmula 14 TST). Ver situacao13Func.
            invalidarCaches13();
            toast(isEdit ? 'Demissão atualizada.' : 'Desligamento registrado.');
            m.close();
            renderLancTab();
        } catch (e) {
            toast(e.message || 'Erro ao salvar.', 'error');
        } finally {
            fdBtnSave.disabled = false;
            fdBtnSave.innerHTML = isEdit ? 'Salvar' : 'Confirmar desligamento';
        }
    };
}

// ============ TREINAMENTOS ============
async function renderTreinamentos() {
    const treinamentos = (await DB.getAll(PATHS.treinamentos)).sort((a, b) => (b.inicio || '').localeCompare(a.inicio || ''));

    lancList({
        searchPh: 'Buscar treinamento...',
        btnLabel: 'Lançar treinamento',
        emptyText: 'Nenhum treinamento lançado.',
        thead: `<th>Treinamento</th><th>Tipo</th><th>Responsável</th><th class="num">Carga</th><th>Período</th><th class="num">Participantes</th>${can('ver_financeiro') ? '<th class="num">Custo</th><th>Pagamento</th>' : ''}<th>Anexo</th><th style="width:48px"></th>`,
        rowsHtml: treinamentos.map(t => `
            <tr data-id="${t.id}" data-search="${escapeHtml((t.nome + ' ' + (t.tipo || '') + ' ' + (t.responsavel || '')).toLowerCase())}">
                <td><div class="flex"><span style="color:var(--accent)">${icon('book')}</span><strong>${escapeHtml(t.nome)}</strong></div></td>
                <td><span class="badge badge-info">${escapeHtml(t.tipo || '—')}</span></td>
                <td class="text-2">${escapeHtml(t.responsavel || '—')}</td>
                <td class="num">${fmtNum(t.cargaHoraria)}h</td>
                <td>${fmtDate(t.inicio)} → ${fmtDate(t.termino)}</td>
                <td class="num"><span class="badge badge-accent">${(t.participantes || []).length}</span></td>
                ${can('ver_financeiro') ? `
                <td class="num">${t.custo ? fmtBRL(t.custo) : '—'}</td>
                <td class="text-2">${t.dataPagamento ? `${fmtDate(t.dataPagamento)}${(t.parcelas || 1) > 1 ? ` · ${t.parcelas}×` : ''}` : '—'}</td>` : ''}
                <td>${anexosDe(t).length ? anexoChip(anexosDe(t)) : '<span class="muted">—</span>'}</td>
                <td>${can('editar_lancamentos') ? `<button class="btn-icon" data-menu>${icon('dots')}</button>` : ''}</td>
            </tr>`).join(''),
        onNew: () => formTreinamento(null)
    });
    bindAnexoChips(document.getElementById('lancTbody'), el => anexosDe(treinamentos.find(x => x.id === el.closest('tr').dataset.id)));

    const excluirTr = async t => {
        if (await confirmDialog({ title: 'Excluir treinamento', message: `Excluir <strong>${escapeHtml(t.nome)}</strong>?`, confirmText: 'Excluir', danger: true })) {
            await excluirAnexoRemoto(anexosDe(t));
            await DB.remove(PATHS.treinamentos, t.id);
            toast('Treinamento excluído.');
            renderLancTab();
        }
    };

    document.querySelectorAll('#lancTbody tr[data-id]').forEach(tr => {
        const t = treinamentos.find(x => x.id === tr.dataset.id);
        lancRowClick(tr, () => detalheTreinamento(t, excluirTr));
        lancRowMenu(tr, [
            { label: 'Ver detalhes', icon: 'eye', onClick: () => detalheTreinamento(t, excluirTr) },
            { label: 'Editar', icon: 'edit', onClick: () => formTreinamento(t) },
            'sep',
            { label: 'Excluir', icon: 'trash', danger: true, onClick: () => excluirTr(t) }
        ]);
    });
}

function detalheTreinamento(t, onDelete, onClose) {
    const fin = can('ver_financeiro');
    const partsIds = (t.participantes || []).slice().sort((a, b) => (lancFuncNome(a) || '').localeCompare(lancFuncNome(b) || ''));
    const parts = partsIds.map(id => lancFuncNome(id));
    const duracao = diasEntre(t.inicio, t.termino) + 1;

    // Faixa de indicadores no topo — carga, duração e nº de participantes de relance, antes
    // de qualquer detalhe. O nome e o tipo já estão no cabeçalho do drawer, então não se repetem aqui.
    const heroHtml = `
        <div class="dt-stats">
            <div class="dt-stat">
                <span class="dt-stat-n">${fmtNum(t.cargaHoraria)}h</span>
                <span class="dt-stat-lbl">Carga horária</span>
            </div>
            <div class="dt-stat">
                <span class="dt-stat-n">${duracao > 0 ? duracao : '—'}${duracao > 0 ? 'd' : ''}</span>
                <span class="dt-stat-lbl">Duração</span>
            </div>
            <div class="dt-stat">
                <span class="dt-stat-n">${parts.length}</span>
                <span class="dt-stat-lbl">Participante${parts.length !== 1 ? 's' : ''}</span>
            </div>
        </div>`;

    const d = abrirDetalheLanc({
        titulo: t.nome,
        sub: 'Treinamento',
        badgeHtml: `<span class="badge badge-info">${icon('book')} ${escapeHtml(t.tipo || '—')}</span>`,
        heroHtml,
        linhas: [
            ['Responsável', escapeHtml(t.responsavel || '—')],
            ['Período', `${fmtDate(t.inicio)} → ${fmtDate(t.termino)}`],
            fin ? ['Custo', t.custo ? fmtBRL(t.custo) : '—'] : null,
            fin ? ['Pagamento', t.dataPagamento ? `${fmtDate(t.dataPagamento)}${(t.parcelas || 1) > 1 ? ` · ${t.parcelas}×` : ''}` : '—'] : null,
            ['Participantes', parts.length
                ? `<button type="button" class="btn btn-secondary btn-sm" id="dtVerParticipantes">${icon('users')} Ver participantes</button>`
                : '<span class="muted">Nenhum</span>']
        ],
        anexo: anexosDe(t),
        onEdit: () => formTreinamento(t),
        onDelete: onDelete ? () => onDelete(t) : null,
        onClose
    });

    const btnParts = d.body.querySelector('#dtVerParticipantes');
    if (btnParts) btnParts.onclick = () => abrirListaParticipantes(btnParts, partsIds);
}

// Popover "Ver participantes": cada linha é a mesma célula rica (foto + nome + cargo/idade/
// contato) das tabelas de Lançamentos — clicar abre a ficha completa do funcionário, igual
// ao nome nas tabelas. openFilterPopover não serve aqui porque só sabe renderizar uma linha
// de texto por item; participantes precisa da célula completa.
function abrirListaParticipantes(anchorEl, ids) {
    closePopover();
    const pop = document.createElement('div');
    pop.className = 'popover pop-filter pop-participantes';
    const showSearch = ids.length > 6;
    pop.innerHTML = `
        ${showSearch ? `<div class="pop-search">${icon('search')}<input class="input" placeholder="Buscar..." data-pop-q></div>` : ''}
        <div class="pop-list" data-pop-list>${ids.map(id => `
            <div class="pop-item pop-part" data-id="${id}" data-search="${escapeHtml((lancFuncNome(id) || '').toLowerCase())}">
                ${lancFuncCellHtml(id)}
            </div>`).join('')}</div>`;
    document.body.appendChild(pop);
    bindLancFuncCells(pop);

    pop.querySelectorAll('.pop-part').forEach(el => el.onclick = () => { closePopover(); abrirFichaFuncionario(el.dataset.id); });
    const q = pop.querySelector('[data-pop-q]');
    if (q) {
        q.addEventListener('input', () => {
            const v = q.value.toLowerCase();
            pop.querySelectorAll('.pop-part').forEach(it => it.style.display = it.dataset.search.includes(v) ? '' : 'none');
        });
        setTimeout(() => q.focus(), 30);
    }

    const r = anchorEl.getBoundingClientRect();
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let x = r.left, y = r.bottom + 6;
    if (x + pw > window.innerWidth - 8) x = r.right - pw;
    if (y + ph > window.innerHeight - 8) y = r.top - ph - 6;
    pop.style.left = `${Math.max(8, x)}px`;
    pop.style.top = `${Math.max(8, y)}px`;
    _popover = pop;
    setTimeout(() => {
        document.addEventListener('mousedown', function h(e) {
            if (_popover && !_popover.contains(e.target) && e.target !== anchorEl && !anchorEl.contains(e.target)) {
                closePopover(); document.removeEventListener('mousedown', h);
            }
        });
    });
}

function formTreinamento(t) {
    const isEdit = !!t;
    const participantes = new Set(t?.participantes || []);
    const lista = lancState.funcionarios
        .filter(f => !f.demissao || participantes.has(f.id))
        .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    if (!lista.length) return toast('Nenhum funcionário cadastrado.', 'info');

    const m = openModal({
        title: isEdit ? 'Editar treinamento' : 'Lançar treinamento',
        size: 'modal-lg',
        body: `
            <div class="form-row">
                <div class="field"><label>Nome do treinamento <span class="req">*</span></label><input class="input" id="ftNome" placeholder="Ex: NR-35 Trabalho em Altura" value="${escapeHtml(t?.nome || '')}"></div>
                <div class="field"><label>Tipo <span class="req">*</span></label>
                    <select class="select" id="ftTipo">${TIPOS_TREINAMENTO.map(x => `<option ${t?.tipo === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
                </div>
            </div>
            <div class="form-row">
                <div class="field"><label>Responsável pelo treinamento</label><input class="input" id="ftResp" placeholder="Instrutor ou empresa" value="${escapeHtml(t?.responsavel || '')}"></div>
                <div class="field"><label>Carga horária (horas) <span class="req">*</span></label><input class="input" id="ftCarga" type="number" min="0" step="0.5" value="${t?.cargaHoraria ?? ''}"></div>
            </div>
            <div class="form-row">
                <div class="field"><label>Início <span class="req">*</span></label><input class="input" id="ftIni" type="date" value="${t?.inicio || ''}"></div>
                <div class="field"><label>Término <span class="req">*</span></label><input class="input" id="ftFim" type="date" value="${t?.termino || ''}"></div>
            </div>
            <div class="form-row">
                <div class="field"><label>Custo do treinamento (R$)</label><input class="input" id="ftCusto" type="number" min="0" step="0.01" value="${t?.custo ?? ''}">
                    <div class="field-hint" id="ftParcInfo"></div>
                </div>
                <div class="form-row" style="gap:14px">
                    <div class="field"><label>Data do pagamento</label><input class="input" id="ftPgto" type="date" value="${t?.dataPagamento || ''}"></div>
                    <div class="field"><label>Parcelas</label><input class="input" id="ftParc" type="number" min="1" step="1" value="${t?.parcelas ?? 1}"></div>
                </div>
            </div>
            <div class="field"><label>Anexo (material, lista de presença, certificado padrão)</label><div id="ftAnexo"></div></div>
            <div class="field">
                <label>Participantes <span class="req">*</span> <span class="badge badge-accent" id="ftCount">0</span></label>
                <div class="flex" style="gap:8px;margin-bottom:8px">
                    <div class="search-box grow">${icon('search')}<input class="input" id="ftBusca" placeholder="Filtrar por nome..." style="width:100%"></div>
                    <button type="button" class="btn btn-secondary btn-filter" id="ftCargoFiltro">${icon('briefcase')} Todos os cargos</button>
                </div>
                <label class="perm-check" style="margin-bottom:6px;border-bottom:1px solid var(--border);padding-bottom:8px">
                    <input type="checkbox" id="ftSelAll"> <strong>Selecionar todos os visíveis</strong>
                </label>
                <div class="part-list" id="ftLista">
                    ${lista.map(f => `
                        <label class="perm-check" data-nome="${escapeHtml((f.nome || '').toLowerCase())}" data-cargo="${f.cargoId || ''}">
                            <input type="checkbox" data-fid="${f.id}" ${participantes.has(f.id) ? 'checked' : ''}>
                            ${escapeHtml(f.nome)}${f.demissao ? ' <span class="badge badge-danger" style="margin-left:4px">Desligado</span>' : ''}
                        </label>`).join('')}
                </div>
            </div>`,
        footer: ''
    });

    const ftAnexoCtl = initAnexoField(m.body.querySelector('#ftAnexo'), anexosDe(t));

    // Preview do parcelamento
    const custoEl = m.body.querySelector('#ftCusto'), parcEl = m.body.querySelector('#ftParc'), parcInfo = m.body.querySelector('#ftParcInfo');
    const previewParc = () => {
        const custo = Number(custoEl.value) || 0, n = Math.max(1, Number(parcEl.value) || 1);
        parcInfo.textContent = custo && n > 1 ? `${n}× de ${fmtBRL(custo / n)} — lançadas mês a mês no relatório` : custo ? 'Custo integral no mês do pagamento' : '';
    };
    custoEl.addEventListener('input', previewParc);
    parcEl.addEventListener('input', previewParc);
    previewParc();

    const countEl = m.body.querySelector('#ftCount');
    const selAllEl = m.body.querySelector('#ftSelAll');
    const atualizaCount = () => {
        countEl.textContent = m.body.querySelectorAll('[data-fid]:checked').length;
        // "Selecionar todos" reflete o estado dos VISÍVEIS: some marcado, todo desmarcado, e
        // indeterminate quando é uma mistura — senão o checkbox mentiria sobre o que está selecionado.
        const visiveis = [...m.body.querySelectorAll('#ftLista .perm-check')].filter(l => l.style.display !== 'none');
        const marcados = visiveis.filter(l => l.querySelector('[data-fid]').checked);
        selAllEl.checked = visiveis.length > 0 && marcados.length === visiveis.length;
        selAllEl.indeterminate = marcados.length > 0 && marcados.length < visiveis.length;
    };
    m.body.querySelectorAll('[data-fid]').forEach(c => c.onchange = atualizaCount);
    atualizaCount();

    let ftFiltroCargo = '';
    const aplicaFiltroParticipantes = () => {
        const q = m.body.querySelector('#ftBusca').value.toLowerCase();
        m.body.querySelectorAll('#ftLista .perm-check').forEach(l => {
            const okNome = l.dataset.nome.includes(q);
            const okCargo = !ftFiltroCargo || l.dataset.cargo === ftFiltroCargo;
            l.style.display = okNome && okCargo ? '' : 'none';
        });
        atualizaCount();
    };
    m.body.querySelector('#ftBusca').addEventListener('input', aplicaFiltroParticipantes);

    const cargoBtn = m.body.querySelector('#ftCargoFiltro');
    cargoBtn.onclick = () => openFilterPopover(cargoBtn, {
        allLabel: 'Todos os cargos',
        options: cargoOpcoes(lancState.cargos),
        value: ftFiltroCargo,
        searchable: lancState.cargos.length > 6,
        onPick: v => {
            ftFiltroCargo = v;
            const cargo = lancState.cargos.find(c => c.id === v);
            cargoBtn.classList.toggle('active', !!v);
            cargoBtn.innerHTML = `${icon('briefcase')} ${escapeHtml(cargo ? cargo.nome : 'Todos os cargos')}`;
            aplicaFiltroParticipantes();
        }
    });

    selAllEl.onchange = () => {
        m.body.querySelectorAll('#ftLista .perm-check').forEach(l => {
            if (l.style.display === 'none') return;
            l.querySelector('[data-fid]').checked = selAllEl.checked;
        });
        atualizaCount();
    };

    m.footer.innerHTML = `
        <button class="btn btn-secondary" data-cancel>Cancelar</button>
        <button class="btn btn-primary" data-save>${isEdit ? 'Salvar' : 'Lançar'}</button>`;
    m.footer.querySelector('[data-cancel]').onclick = m.close;
    const ftBtnSave = m.footer.querySelector('[data-save]');
    ftBtnSave.onclick = async () => {
        const nome = m.body.querySelector('#ftNome').value.trim();
        const cargaHoraria = Number(m.body.querySelector('#ftCarga').value);
        const inicio = m.body.querySelector('#ftIni').value;
        const termino = m.body.querySelector('#ftFim').value;
        const parts = [...m.body.querySelectorAll('[data-fid]:checked')].map(c => c.dataset.fid);

        if (!nome || !inicio || !termino) return toast('Preencha nome, início e término.', 'error');
        if (!(cargaHoraria > 0)) return toast('Informe a carga horária.', 'error');
        if (termino < inicio) return toast('Término deve ser igual ou após o início.', 'error');
        if (!parts.length) return toast('Selecione ao menos um participante.', 'error');

        ftBtnSave.disabled = true;
        ftBtnSave.innerHTML = '<span class="spinner"></span> Salvando...';
        try {
            const { anexos, removidos } = await ftAnexoCtl.getAnexos();
            await DB.save(PATHS.treinamentos, t?.id || null, {
                nome, tipo: m.body.querySelector('#ftTipo').value,
                responsavel: m.body.querySelector('#ftResp').value.trim(),
                cargaHoraria,
                custo: Number(custoEl.value) || 0,
                dataPagamento: m.body.querySelector('#ftPgto').value || null,
                parcelas: Math.max(1, Number(parcEl.value) || 1),
                inicio, termino, participantes: parts,
                anexos,
                anexo: null
            });
            await excluirAnexoRemoto(removidos);
            toast(isEdit ? 'Treinamento atualizado.' : 'Treinamento lançado.');
            m.close();
            renderLancTab();
        } catch (e) {
            toast(e.message || 'Erro ao salvar.', 'error');
        } finally {
            ftBtnSave.disabled = false;
            ftBtnSave.innerHTML = isEdit ? 'Salvar' : 'Lançar';
        }
    };
}

// ============ FOLHA MENSAL (grade editável) ============
async function renderLancFolha() {
    await loadFolhaBase(true);
    const { ano, mes } = folhaState;
    const key = mesKey(ano, mes);
    const gravado = (await DB.getObj(`${PATHS.folha}/${key}`)) || null;
    // A HE do banco entra aqui, em memória: `dados` é o que a tela lê e soma; `gravado` é o
    // que o banco tem. Os saves continuam indo para as linhas gravadas, sem a derivada.
    const dados = gravado ? folhaComHeBanco(gravado, key, folhaState.bhFechamentos, folhaState.extras, folhaState.bhQuitacoes, feriasCtx(folhaState)) : null;
    const podeEditar = can('editar_folha');
    const cont = document.getElementById('lancContent');

    const nav = `
        <div class="month-nav">
            <button id="lfPrev" title="Mês anterior">‹</button>
            <span class="month-label">${MESES_FULL[mes]} ${ano}</span>
            <button id="lfNext" title="Próximo mês">›</button>
        </div>`;
    const bindNav = () => {
        cont.querySelector('#lfPrev').onclick = () => {
            folhaState.mes--;
            if (folhaState.mes < 0) { folhaState.mes = 11; folhaState.ano--; }
            renderLancTab();
        };
        cont.querySelector('#lfNext').onclick = () => {
            folhaState.mes++;
            if (folhaState.mes > 11) { folhaState.mes = 0; folhaState.ano++; }
            renderLancTab();
        };
    };

    if (!dados) {
        const eleg = elegiveisNoMes(ano, mes);
        cont.innerHTML = `
            <div class="flex-between" style="margin-bottom:16px">${nav}<div></div></div>
            <div class="empty-state">
                <div class="empty-icon">${icon('money')}</div>
                <h3>Folha de ${MESES_FULL[mes]} ${ano} não gerada</h3>
                <p>${eleg.length} funcionário(s) elegível(is). A grade nasce pré-preenchida com salário, insalubridade, periculosidade, encargos (FGTS ${folhaState.params.fgtsPct ?? 0}%, ou ${FGTS_PCT_APRENDIZ}% nos contratos de aprendizagem), INSS por faixa, benefícios e coparticipação.</p>
                ${podeEditar && eleg.length ? `<button class="btn btn-primary mt-16" id="lfGerar">${icon('plus')} Gerar folha do mês</button>` : ''}
            </div>`;
        bindNav();
        const btn = cont.querySelector('#lfGerar');
        if (btn) btn.onclick = async () => {
            const obj = {};
            eleg.forEach(f => obj[f.id] = prefillLinha(f));
            await DB.set(`${PATHS.folha}/${key}`, obj);
            toast(`Folha de ${MESES_FULL[mes]} gerada com ${eleg.length} funcionário(s).`);
            renderLancTab();
        };
        return;
    }

    const eleg = elegiveisNoMes(ano, mes);
    const faltantes = eleg.filter(f => !dados[f.id]);
    const ids = Object.keys(dados);
    const linhasTodas = ids
        .map(id => ({ f: folhaState.funcionarios.find(x => x.id === id), id, linha: dados[id] }))
        .sort((a, b) => (a.f?.nome || '').localeCompare(b.f?.nome || ''));
    // Unidade/cargo filtram só a exibição: a linha continua lançada, some da grade e dos totais.
    const linhas = linhasTodas.filter(({ f }) => folhaPassaFiltro(f));
    const idsVis = linhas.map(l => l.id);
    const COLS_EDIT = [...FOLHA_COLS, [FOLHA_DESC, FOLHA_COL_LABEL[FOLHA_DESC]]];
    const COLS_VIEW = [...COLS_EDIT];
    // "Férias (calc)" e "13º (calc)": únicas colunas de férias/13º na grade — não há mais
    // célula manual ao lado, o valor vem inteiro dos lançamentos das abas próprias. Entram
    // depois de "Pró-labore": mesma posição que as colunas manuais ocupavam antes de serem
    // removidas. Inserido ANTES do bloco de HE abaixo, para que o índice de "encargos"
    // recalculado já reflita essas duas colunas novas.
    const iPro = COLS_VIEW.findIndex(([k]) => k === 'prolabore');
    COLS_VIEW.splice(iPro + 1, 0,
        [FOLHA_FERIAS_CALC, FOLHA_COL_LABEL[FOLHA_FERIAS_CALC]],
        [FOLHA_DECIMO_CALC, FOLHA_COL_LABEL[FOLHA_DECIMO_CALC]]);
    // INSS (desconto do empregado) entra logo depois de "Encargos" (FGTS, custo empresa):
    // mesma família de coluna calculada/travada, mas natureza oposta — não soma no custo
    // empresa, só reduz o líquido do funcionário (ver FOLHA_INSS em folha.js).
    // A HE do banco é exibida junto das demais, mas nunca vira <input>: a coluna é derivada
    // dos fechamentos e do Extra Banco. Entra depois do INSS, onde ficava a hora extra
    // manual que ela substituiu. Desc. Atraso é a mesma arquitetura, mas em rubrica negativa
    // própria — entra logo ao lado.
    const iEnc = COLS_VIEW.findIndex(([k]) => k === 'encargos');
    COLS_VIEW.splice(iEnc + 1, 0,
        [FOLHA_INSS, FOLHA_COL_LABEL[FOLHA_INSS]],
        [FOLHA_HE_BANCO, FOLHA_COL_LABEL[FOLHA_HE_BANCO]],
        [FOLHA_DESC_ATRASO, FOLHA_COL_LABEL[FOLHA_DESC_ATRASO]]);
    // Hora extra manual: aposentada pelo banco de horas, mas meses antigos podem ter valor.
    // Só entra na grade quando existe — e como leitura, nunca como <input>: reabrir a edição
    // recriaria a duplicidade que a aposentadoria resolveu.
    const temHeLegado = folhaTemHeManual(dados);
    if (temHeLegado) COLS_VIEW.splice(iEnc + 4, 0, [FOLHA_HE_MANUAL, FOLHA_COL_LABEL[FOLHA_HE_MANUAL]]);
    const custoEmpresa = () => idsVis.reduce((s, i) => s + totalLinha(dados[i]), 0);
    const filtrado = folhaFiltroUnidade || folhaFiltroCargo;
    // Insalubridade: grau do cargo × base configurada — mesma regra de prefillLinha (folha.js),
    // recalculada aqui pra reagir em tempo real quando o salário da linha muda.
    const calcInsalubridade = fid => {
        const f = folhaState.funcionarios.find(x => x.id === fid);
        const cargo = folhaState.cargos.find(c => c.id === f?.cargoId);
        const salBase = Number(dados[fid].salario) || 0;
        return calculoInsalubridade(cargo, folhaState.params, salBase);
    };
    // Periculosidade: 30% fixo sobre o salário total da linha — nunca sobre o mínimo.
    const calcPericulosidade = fid => {
        const f = folhaState.funcionarios.find(x => x.id === fid);
        const cargo = folhaState.cargos.find(c => c.id === f?.cargoId);
        const salBase = Number(dados[fid].salario) || 0;
        return calculoPericulosidade(cargo, salBase);
    };

    cont.innerHTML = `
        <div class="flex-between" style="margin-bottom:12px;flex-wrap:wrap;gap:10px">
            ${nav}
            <div class="flex" style="flex-wrap:wrap;gap:8px">
                ${folhaFiltrosHtml('lfFiltroUni', 'lfFiltroCargo')}
                ${faltantes.length && podeEditar ? `<button class="btn btn-secondary btn-sm" id="lfSync">${icon('plus')} Incluir ${faltantes.length} novo(s)</button>` : ''}
                <span class="badge badge-accent" id="lfTotalBadge">Custo empresa: ${fmtBRL(custoEmpresa())}${filtrado ? ` (${linhas.length} de ${linhasTodas.length})` : ''}</span>
                ${podeEditar ? `<button class="btn-icon" id="lfMenu" title="Ações da folha">${icon('dots')}</button>` : ''}
            </div>
        </div>
        ${gruposChipsHtml()}
        <div class="table-wrap mt-8">
            <div class="table-scroll">
                <table class="table folha-table">
                    <thead><tr>
                        <th>Funcionário</th>
                        ${COLS_VIEW.map(([k, l]) => {
                            const tips = {
                                [FOLHA_HE_BANCO]: 'Somado automaticamente dos fechamentos de ciclo pagos e dos lançamentos de Extra Banco deste mês. Não editável — clique no valor para ver a origem.',
                                [FOLHA_HE_MANUAL]: 'Hora extra lançada à mão antes do banco de horas. Coluna aposentada: aparece só nos meses que já têm valor e não é mais editável.',
                                [FOLHA_FERIAS_CALC]: 'Remuneração de férias (gozo + 1/3 + abono) somada automaticamente dos lançamentos deste mês, pelo início do período. Não editável — clique para ver o cálculo. Ajuste em Lançamentos → Férias.',
                                [FOLHA_DECIMO_CALC]: '13º somado automaticamente das parcelas lançadas (1ª, 2ª, única, rescisão) e do adiantamento pago junto das férias. Não editável — clique para ver o cálculo. Ajuste em Lançamentos → 13º Salário.',
                                [FOLHA_DESC_ATRASO]: 'Desconto de saldo negativo do banco de horas, somado automaticamente das quitações e fechamentos com destino "Descontado" pagos neste mês. Valor negativo. Não editável — clique para ver a origem.'
                            };
                            return `<th class="num col-${k}" data-col-h="${k}"${tips[k] ? ` title="${escapeHtml(tips[k])}"` : ''}>${l}</th>`;
                        }).join('')}
                        <th class="num">Custo empresa</th>
                    </tr></thead>
                    <tbody>
                        ${linhas.length ? linhas.map(({ f, id, linha }) => `
                        <tr data-fid="${id}">
                            <td style="white-space:nowrap">
                                <div class="flex" style="gap:8px;align-items:center">
                                    ${f ? avatarHtml(f) : `<div class="avatar">?</div>`}
                                    <strong>${escapeHtml(f?.nome || '(removido)')}</strong>
                                    ${f?.demissao && f.demissao >= key + '-01' && f.demissao <= key + '-31' ? `<span class="badge badge-danger" style="margin-left:2px">Desligado ${fmtDate(f.demissao)}</span>` : ''}
                                    ${podeEditar ? `<button class="btn-icon btn-icon-sm lf-row-menu" title="Ações da linha">${icon('dots')}</button>` : ''}
                                </div>
                            </td>
                            ${COLS_VIEW.map(([k]) => k === FOLHA_HE_BANCO
                                ? `<td class="num col-${k}" data-col-c="${k}">${Number(linha[k])
                                    ? `<button class="folha-he-banco" data-he-banco="${id}" title="Ver a origem deste valor">${fmtBRL(linha[k])}</button>`
                                    : '<span class="muted">—</span>'}</td>`
                                : k === FOLHA_HE_MANUAL
                                ? `<td class="num col-${k}" data-col-c="${k}">${Number(linha[k])
                                    ? `<span class="folha-legado" title="Hora extra lançada à mão antes do banco de horas. Mantida para não alterar o custo já fechado deste mês; não é mais editável — use Extra Banco ou o fechamento do ciclo.">${fmtBRL(linha[k])} ${icon('lock')}</span>`
                                    : '<span class="muted">—</span>'}</td>`
                                : k === FOLHA_FERIAS_CALC
                                ? `<td class="num col-${k}" data-col-c="${k}">${Number(linha[k])
                                    ? `<button class="folha-he-banco" data-ferias-calc="${id}" title="Ver a memória de cálculo">${fmtBRL(linha[k])}</button>`
                                    : '<span class="muted">—</span>'}</td>`
                                : k === FOLHA_DECIMO_CALC
                                ? `<td class="num col-${k}" data-col-c="${k}">${Number(linha[k])
                                    ? `<button class="folha-he-banco" data-decimo-calc="${id}" title="Ver a memória de cálculo">${fmtBRL(linha[k])}</button>`
                                    : '<span class="muted">—</span>'}</td>`
                                : k === FOLHA_DESC_ATRASO
                                ? `<td class="num col-${k}" data-col-c="${k}">${Number(linha[k])
                                    ? `<button class="folha-he-banco" data-desc-atraso="${id}" title="Ver a origem deste desconto" style="color:var(--danger)">${fmtBRL(linha[k])}</button>`
                                    : '<span class="muted">—</span>'}</td>`
                                : k === 'beneficios' || k === FOLHA_DESC
                                ? `<td class="num col-${k}" data-col-c="${k}">${podeEditar
                                    ? `<span class="folha-legado folha-legado-lock" data-unlock-benef="${k}" title="Calculado do cadastro de benefícios ao gerar a folha. Clique no cadeado para editar manualmente esta célula.">${fmtBRL(linha[k])} <button type="button" class="btn-icon btn-icon-sm" data-unlock-benef-btn>${icon('lock')}</button></span>`
                                    : (Number(linha[k]) ? fmtBRL(linha[k]) : '<span class="muted">—</span>')}</td>`
                                : k === 'encargos'
                                ? `<td class="num col-${k}" data-col-c="${k}">
                                    <span class="folha-legado" title="Calculado automaticamente: FGTS sobre salário, insalubridade e periculosidade. Custo da empresa. Não editável."><span data-encargos-val>${fmtBRL(linha[k])}</span><button type="button" class="btn-icon btn-icon-sm" data-encargos-info="${id}">${icon('info')}</button></span>
                                   </td>`
                                : k === FOLHA_INSS
                                ? `<td class="num col-${k}" data-col-c="${k}">
                                    <span class="folha-legado" title="Calculado automaticamente: INSS por faixa progressiva sobre salário, insalubridade e periculosidade. Desconto do empregado — não editável."><span data-inss-val>${fmtBRL(linha[k])}</span><button type="button" class="btn-icon btn-icon-sm" data-inss-info="${id}">${icon('info')}</button></span>
                                   </td>`
                                : k === 'insalubridade'
                                ? `<td class="num col-${k}" data-col-c="${k}">
                                    <span class="folha-legado" title="Calculado automaticamente: grau de insalubridade do cargo × base configurada. Não editável."><span data-insal-val>${fmtBRL(linha[k])}</span><button type="button" class="btn-icon btn-icon-sm" data-insal-info="${id}">${icon('info')}</button></span>
                                   </td>`
                                : k === 'periculosidade'
                                ? `<td class="num col-${k}" data-col-c="${k}">
                                    <span class="folha-legado" title="Calculado automaticamente: ${PERICULOSIDADE_PCT}% fixo sobre o salário total, quando o cargo é marcado como perigoso. Não editável."><span data-pericul-val>${fmtBRL(linha[k])}</span><button type="button" class="btn-icon btn-icon-sm" data-pericul-info="${id}">${icon('info')}</button></span>
                                   </td>`
                                : `<td class="num col-${k}" data-col-c="${k}">${podeEditar
                                ? `<input class="input folha-cell" data-col="${k}" type="number" min="0" step="0.01" value="${Number(linha[k]) || 0}">`
                                : fmtBRL(linha[k])}</td>`).join('')}
                            <td class="num"><strong data-total>${fmtBRL(totalLinha(linha))}</strong></td>
                        </tr>`).join('') : `<tr><td colspan="${COLS_VIEW.length + 2}">${emptyState({ icon: 'filter', title: 'Nenhum funcionário no filtro', text: 'Ajuste unidade/cargo para ver linhas da folha.' })}</td></tr>`}
                    </tbody>
                    <tfoot><tr>
                        <td><strong>Total${filtrado ? ' (filtrado)' : ''}</strong></td>
                        ${COLS_VIEW.map(([k]) => `<td class="num col-${k}" data-col-c="${k}"><strong data-tcol="${k}">${fmtBRL(idsVis.reduce((s, i) => s + (Number(dados[i][k]) || 0), 0))}</strong></td>`).join('')}
                        <td class="num"><strong data-tgeral>${fmtBRL(custoEmpresa())}</strong></td>
                    </tr></tfoot>
                </table>
            </div>
        </div>
        <p class="muted" style="margin-top:10px;font-size:12px">Pré-preenchido pelos cadastros; edite as células liberadas — salvamento automático. Insalubridade, Periculosidade, Encargos (FGTS ${fmtPct(folhaState.params.fgtsPct ?? 0, 1)}; ${fmtPct(FGTS_PCT_APRENDIZ, 1)} nos contratos de aprendizagem) e INSS (desconto do empregado, por faixa) são só calculados — não editáveis — e recalculam sozinhos ao alterar o salário; clique no ícone ${icon('info')} para ver a memória de cálculo. "Benefícios" e "Desconto benef." (coparticipação, abate do custo da empresa) vêm do cadastro de benefícios da folha; clique no cadeado ${icon('lock')} para editar manualmente uma célula, ou use "Resetar linha" para recalcular pelo cadastro atual.</p>`;
    bindNav();
    bindAvatarFotos(cont);
    folhaBindFiltros('lfFiltroUni', 'lfFiltroCargo', renderLancTab);

    // Aplica visibilidade dos grupos de coluna
    const aplicaGrupos = () => {
        COLS_VIEW.forEach(([k]) => {
            const vis = colVisivel(k);
            cont.querySelectorAll(`.col-${k}`).forEach(el => el.classList.toggle('hidden', !vis));
        });
    };
    aplicaGrupos();

    // Origem da HE do banco: de onde vem cada centavo daquela célula. Sem isso, a coluna
    // seria um número que aparece sozinho na folha — e número sem origem, o RH não assina.
    cont.querySelectorAll('[data-he-banco]').forEach(btn => {
        btn.onclick = () => {
            const fid = btn.dataset.heBanco;
            const f = folhaState.funcionarios.find(x => x.id === fid);
            const he = heBancoDoMes(fid, key, folhaState.bhFechamentos, folhaState.extras, folhaState.bhQuitacoes);
            openModal({
                title: `Hora extra do banco — ${f?.nome || ''}`,
                body: `
                    <p class="muted" style="font-size:12px;margin-bottom:14px">
                        Valor somado automaticamente na folha de ${MESES_FULL[mes]}/${ano}.
                        Não é editável aqui: para alterar, ajuste o fechamento do ciclo ou o lançamento de Extra Banco que o originou.
                    </p>
                    <div class="he-origem-lista">
                        ${he.itens.map(i => `
                            <div class="he-origem-row">
                                <span class="he-origem-ico ${i.tipo === 'fechamento' ? 'is-fech' : 'is-extra'}">${icon(i.tipo === 'fechamento' ? 'refresh' : 'clock')}</span>
                                <div class="grow">
                                    <strong>${escapeHtml(i.desc)}</strong>
                                    <div class="muted">${i.tipo === 'fechamento' ? `Saldo de ${fmtHHMM(i.saldoMin)} liquidado em ${fmtDate(i.data)}` : `Lançado em ${fmtDate(i.data)}`}</div>
                                </div>
                                <strong class="num">${fmtBRL(i.valor)}</strong>
                            </div>`).join('')}
                    </div>
                    <div class="he-origem-total">
                        <span>Total somado na folha</span>
                        <strong>${fmtBRL(he.total)}</strong>
                    </div>`,
                footer: ''
            });
        };
    });

    // Memória de cálculo das férias do mês. Mesma lógica da HE do banco: o valor é derivado,
    // e quem o vê na folha precisa chegar até o lançamento que o gerou.
    cont.querySelectorAll('[data-ferias-calc]').forEach(btn => {
        btn.onclick = () => {
            const fid = btn.dataset.feriasCalc;
            const f = folhaState.funcionarios.find(x => x.id === fid);
            const fe = feriasDoMes(fid, key, folhaState.ausencias, folhaState.funcionarios,
                folhaState.cargos, folhaState.params, feriasCtx(folhaState));
            openModal({
                title: `Férias — ${f?.nome || ''}`,
                body: `
                    <p class="muted" style="font-size:12px;margin-bottom:14px">
                        Remuneração de férias somada automaticamente na folha de ${MESES_FULL[mes]}/${ano},
                        pelo mês de <strong>início</strong> do período (art. 145). Não é editável aqui: para alterar,
                        ajuste o lançamento em Lançamentos → Férias.
                    </p>
                    <div class="he-origem-lista">
                        ${fe.itens.map(i => `
                            <div class="he-origem-row">
                                <span class="he-origem-ico is-fech">${icon('sun')}</span>
                                <div class="grow">
                                    <strong>${escapeHtml(i.desc)}</strong>
                                    <div class="muted">Início em ${fmtDate(i.data)}${i.adiantamento13 ? ` · 13º adiantado: ${fmtBRL(i.adiantamento13)} (coluna 13º)` : ''}</div>
                                </div>
                                <strong class="num">${fmtBRL(i.valor)}</strong>
                            </div>`).join('')}
                    </div>
                    <div class="he-origem-total">
                        <span>Total somado na folha</span>
                        <strong>${fmtBRL(fe.total)}</strong>
                    </div>`,
                footer: ''
            });
        };
    });

    // Memória de cálculo do 13º do mês: parcelas lançadas (1ª, 2ª, única, rescisão) + o
    // adiantamento pago junto das férias. Mesma lógica das duas anteriores — valor derivado,
    // e quem o vê na folha precisa chegar até o lançamento que o gerou.
    cont.querySelectorAll('[data-decimo-calc]').forEach(btn => {
        btn.onclick = () => {
            const fid = btn.dataset.decimoCalc;
            const f = folhaState.funcionarios.find(x => x.id === fid);
            const de = decimoDoMes(fid, key, folhaState.decimos);
            const fe = feriasDoMes(fid, key, folhaState.ausencias, folhaState.funcionarios,
                folhaState.cargos, folhaState.params, feriasCtx(folhaState));
            const itens = [
                ...de.itens.map(i => ({ desc: i.desc, data: i.data, valor: i.valor, ico: 'gift' })),
                ...(fe.total13 ? [{ desc: '13º adiantado nas férias', data: fe.itens[0]?.data, valor: fe.total13, ico: 'sun' }] : [])
            ];
            openModal({
                title: `13º Salário — ${f?.nome || ''}`,
                body: `
                    <p class="muted" style="font-size:12px;margin-bottom:14px">
                        13º somado automaticamente na folha de ${MESES_FULL[mes]}/${ano}, pela data de pagamento
                        de cada parcela. Não é editável aqui: para alterar, ajuste o lançamento em
                        Lançamentos → 13º Salário (ou em Férias, para o adiantamento).
                    </p>
                    <div class="he-origem-lista">
                        ${itens.map(i => `
                            <div class="he-origem-row">
                                <span class="he-origem-ico is-fech">${icon(i.ico)}</span>
                                <div class="grow">
                                    <strong>${escapeHtml(i.desc)}</strong>
                                    <div class="muted">Pago em ${fmtDate(i.data)}</div>
                                </div>
                                <strong class="num">${fmtBRL(i.valor)}</strong>
                            </div>`).join('')}
                    </div>
                    <div class="he-origem-total">
                        <span>Total somado na folha</span>
                        <strong>${fmtBRL(de.total + (fe.total13 || 0))}</strong>
                    </div>`,
                footer: ''
            });
        };
    });

    // Origem do desconto de atraso: quitações/fechamentos de saldo negativo com destino
    // "Descontado". Mesma lógica das anteriores — valor derivado, e quem o vê na folha
    // precisa chegar até o registro do banco de horas que o gerou.
    cont.querySelectorAll('[data-desc-atraso]').forEach(btn => {
        btn.onclick = () => {
            const fid = btn.dataset.descAtraso;
            const f = folhaState.funcionarios.find(x => x.id === fid);
            const da = descAtrasoDoMes(fid, key, folhaState.bhFechamentos, folhaState.bhQuitacoes);
            openModal({
                title: `Desconto de atraso — ${f?.nome || ''}`,
                body: `
                    <p class="muted" style="font-size:12px;margin-bottom:14px">
                        Descontado automaticamente na folha de ${MESES_FULL[mes]}/${ano} — saldo negativo do banco
                        de horas (atrasos não compensados) resolvido como "Descontado". Não é editável aqui: para
                        alterar, ajuste a quitação ou o fechamento do ciclo em Lançamentos → Banco de horas.
                    </p>
                    <div class="he-origem-lista">
                        ${da.itens.map(i => `
                            <div class="he-origem-row">
                                <span class="he-origem-ico ${i.tipo === 'fechamento' ? 'is-fech' : 'is-extra'}">${icon(i.tipo === 'fechamento' ? 'refresh' : 'clock')}</span>
                                <div class="grow">
                                    <strong>${escapeHtml(i.desc)}</strong>
                                    <div class="muted">${fmtHHMM(i.saldoMin)} devidos — pago em ${fmtDate(i.data)}</div>
                                </div>
                                <strong class="num" style="color:var(--danger)">− ${fmtBRL(i.valor)}</strong>
                            </div>`).join('')}
                    </div>
                    <div class="he-origem-total">
                        <span>Total descontado na folha</span>
                        <strong style="color:var(--danger)">${fmtBRL(da.total)}</strong>
                    </div>`,
                footer: ''
            });
        };
    });

    // Memória de cálculo dos encargos: base (salário + insalubridade + periculosidade) × FGTS%.
    // Só existe pra explicar o número — a coluna não é editável, ela sempre segue
    // automaticamente a base quando salário/insalubridade/periculosidade mudam.
    cont.querySelectorAll('[data-encargos-info]').forEach(btn => {
        btn.onclick = () => {
            const fid = btn.dataset.encargosInfo;
            const f = folhaState.funcionarios.find(x => x.id === fid);
            const linha = dados[fid];
            const base = (Number(linha.salario) || 0) + (Number(linha.insalubridade) || 0) + (Number(linha.periculosidade) || 0);
            // Alíquota do CARGO, não a global: aprendiz recolhe 2% (art. 15 §7º Lei 8.036/90).
            const cargoEnc = folhaState.cargos.find(c => c.id === f?.cargoId);
            const fgtsPct = fgtsPctDe(cargoEnc, folhaState.params);
            const fgtsVal = Number((base * fgtsPct / 100).toFixed(2));
            openModal({
                title: `Encargos (FGTS) — ${f?.nome || ''}`,
                body: `
                    <p class="muted" style="font-size:12px;margin-bottom:14px">
                        Calculado automaticamente sobre salário + insalubridade + periculosidade. Custo
                        da empresa — não é editável aqui: ${ehAprendiz(cargoEnc)
                            ? `a alíquota do contrato de aprendizagem é fixada em ${FGTS_PCT_APRENDIZ}% pelo art. 15 §7º da Lei 8.036/90 e não segue o parâmetro geral`
                            : 'o percentual fica em Configurações → Parâmetros'}, e o valor se atualiza
                        sozinho quando salário, insalubridade ou periculosidade mudam nesta linha.
                    </p>
                    <div class="he-origem-lista">
                        <div class="he-origem-row">
                            <div class="grow">
                                <strong>Base de cálculo</strong>
                                <div class="muted">Salário + insalubridade + periculosidade</div>
                            </div>
                            <strong class="num">${fmtBRL(base)}</strong>
                        </div>
                        <div class="he-origem-row">
                            <span class="he-origem-ico is-fech">${icon('lock')}</span>
                            <div class="grow">
                                <strong>FGTS (${fgtsPct}%)</strong>
                                <div class="muted">Incide sobre a base, sempre. Custo da empresa.</div>
                            </div>
                            <strong class="num">${fmtBRL(fgtsVal)}</strong>
                        </div>
                    </div>
                    <div class="he-origem-total">
                        <span>Total (encargos)</span>
                        <strong>${fmtBRL(fgtsVal)}</strong>
                    </div>`,
                footer: ''
            });
        };
    });

    // Memória de cálculo do INSS: base (salário + insalubridade + periculosidade) dividida em
    // fatias pelas faixas configuradas, cada fatia com a alíquota da sua própria faixa.
    // Desconto do empregado — não é custo da empresa, por isso vem separado dos Encargos
    // (FGTS) acima.
    cont.querySelectorAll('[data-inss-info]').forEach(btn => {
        btn.onclick = () => {
            const fid = btn.dataset.inssInfo;
            const f = folhaState.funcionarios.find(x => x.id === fid);
            const linha = dados[fid];
            const base = (Number(linha.salario) || 0) + (Number(linha.insalubridade) || 0) + (Number(linha.periculosidade) || 0);
            const faixas = (folhaState.params.inssFaixas && folhaState.params.inssFaixas.length
                ? folhaState.params.inssFaixas : INSS_FAIXAS_PADRAO).slice().sort((a, b) => a.ate - b.ate);
            let restante = base, anterior = 0;
            const fatias = [];
            faixas.forEach(faixa => {
                if (restante <= 0) return;
                const largura = faixa.ate - anterior;
                const nesta = Math.min(restante, largura);
                if (nesta > 0) fatias.push({ de: anterior, ate: faixa.ate, aliquota: faixa.aliquota, base: nesta, valor: Number((nesta * faixa.aliquota / 100).toFixed(2)) });
                restante -= nesta;
                anterior = faixa.ate;
            });
            const total = Number(fatias.reduce((s, f) => s + f.valor, 0).toFixed(2));
            openModal({
                title: `INSS — ${f?.nome || ''}`,
                body: `
                    <p class="muted" style="font-size:12px;margin-bottom:14px">
                        Calculado automaticamente sobre salário + insalubridade + periculosidade, por
                        faixa progressiva. Desconto do empregado — não é custo da empresa. As faixas
                        ficam em Configurações → Parâmetros.
                    </p>
                    <div class="he-origem-lista">
                        <div class="he-origem-row">
                            <div class="grow">
                                <strong>Base de cálculo</strong>
                                <div class="muted">Salário + insalubridade + periculosidade</div>
                            </div>
                            <strong class="num">${fmtBRL(base)}</strong>
                        </div>
                        ${fatias.map(f => `
                        <div class="he-origem-row">
                            <span class="he-origem-ico is-extra">${icon('percent')}</span>
                            <div class="grow">
                                <strong>${fmtBRL(f.de)} a ${fmtBRL(f.ate)} (${fmtPct(f.aliquota, 2)})</strong>
                                <div class="muted">Fatia de ${fmtBRL(f.base)}</div>
                            </div>
                            <strong class="num">${fmtBRL(f.valor)}</strong>
                        </div>`).join('')}
                        ${!fatias.length ? `<div class="he-origem-row"><div class="grow muted">Sem faixas aplicáveis à base.</div></div>` : ''}
                    </div>
                    <div class="he-origem-total">
                        <span>Total (INSS)</span>
                        <strong>−${fmtBRL(total)}</strong>
                    </div>`,
                footer: ''
            });
        };
    });

    // Memória de cálculo da insalubridade: grau do cargo × base configurada (salário
    // da linha ou salário mínimo). Só existe pra explicar o número — não é editável,
    // recalcula sozinha quando o salário muda (se a base for "salário").
    cont.querySelectorAll('[data-insal-info]').forEach(btn => {
        btn.onclick = () => {
            const fid = btn.dataset.insalInfo;
            const f = folhaState.funcionarios.find(x => x.id === fid);
            const cargo = folhaState.cargos.find(c => c.id === f?.cargoId);
            const grauPct = Number(cargo?.insalubridade) || 0;
            const usaMinimo = (folhaState.params.insalubridadeBase || 'salario') === 'minimo';
            const base = usaMinimo ? (Number(folhaState.params.salarioMinimo) || 0) : (Number(dados[fid].salario) || 0);
            openModal({
                title: `Insalubridade — ${f?.nome || ''}`,
                body: `
                    <p class="muted" style="font-size:12px;margin-bottom:14px">
                        Calculado automaticamente: grau de insalubridade do cargo × base configurada
                        em Configurações → Parâmetros. Não é editável aqui: para alterar, ajuste o
                        grau no cadastro do cargo (<strong>${escapeHtml(cargo?.nome || '—')}</strong>) ou o parâmetro de base.
                    </p>
                    <div class="he-origem-lista">
                        <div class="he-origem-row">
                            <div class="grow">
                                <strong>Base de cálculo</strong>
                                <div class="muted">${usaMinimo ? 'Salário mínimo (parâmetro)' : 'Salário desta linha'}</div>
                            </div>
                            <strong class="num">${fmtBRL(base)}</strong>
                        </div>
                        <div class="he-origem-row">
                            <span class="he-origem-ico is-fech">${icon('percent')}</span>
                            <div class="grow">
                                <strong>Grau de insalubridade (${grauPct}%)</strong>
                                <div class="muted">Definido no cargo</div>
                            </div>
                            <strong class="num">${fmtBRL(Number((base * grauPct / 100).toFixed(2)))}</strong>
                        </div>
                    </div>
                    <div class="he-origem-total">
                        <span>Total (insalubridade)</span>
                        <strong>${fmtBRL(Number((base * grauPct / 100).toFixed(2)))}</strong>
                    </div>`,
                footer: ''
            });
        };
    });

    // Memória de cálculo da periculosidade: 30% fixo (art. 193 CLT) sobre o salário total da
    // linha — nunca sobre o mínimo, ao contrário da insalubridade. Só existe pra explicar o
    // número — não é editável, recalcula sozinha quando o salário muda.
    cont.querySelectorAll('[data-pericul-info]').forEach(btn => {
        btn.onclick = () => {
            const fid = btn.dataset.periculInfo;
            const f = folhaState.funcionarios.find(x => x.id === fid);
            const cargo = folhaState.cargos.find(c => c.id === f?.cargoId);
            const base = Number(dados[fid].salario) || 0;
            const valor = Number((base * PERICULOSIDADE_PCT / 100).toFixed(2));
            openModal({
                title: `Periculosidade — ${f?.nome || ''}`,
                body: `
                    <p class="muted" style="font-size:12px;margin-bottom:14px">
                        Calculado automaticamente: ${PERICULOSIDADE_PCT}% fixo sobre o salário total desta
                        linha (art. 193 CLT). Não é editável aqui: para alterar, desmarque "cargo
                        perigoso" no cadastro do cargo (<strong>${escapeHtml(cargo?.nome || '—')}</strong>).
                    </p>
                    <div class="he-origem-lista">
                        <div class="he-origem-row">
                            <div class="grow">
                                <strong>Base de cálculo</strong>
                                <div class="muted">Salário desta linha</div>
                            </div>
                            <strong class="num">${fmtBRL(base)}</strong>
                        </div>
                        <div class="he-origem-row">
                            <span class="he-origem-ico is-fech">${icon('percent')}</span>
                            <div class="grow">
                                <strong>Adicional de periculosidade (${PERICULOSIDADE_PCT}%)</strong>
                                <div class="muted">Definido no cargo</div>
                            </div>
                            <strong class="num">${fmtBRL(valor)}</strong>
                        </div>
                    </div>
                    <div class="he-origem-total">
                        <span>Total (periculosidade)</span>
                        <strong>${fmtBRL(valor)}</strong>
                    </div>`,
                footer: ''
            });
        };
    });

    bindGruposChips(cont, () => {
        cont.querySelectorAll('.grp-chip[data-grp]').forEach(b => b.classList.toggle('on', folhaGruposVis.has(b.dataset.grp)));
        aplicaGrupos();
    });

    const btnSync = cont.querySelector('#lfSync');
    if (btnSync) btnSync.onclick = async () => {
        for (const f of faltantes) await DB.save(`${PATHS.folha}/${key}`, f.id, prefillLinha(f));
        toast(`${faltantes.length} funcionário(s) incluído(s).`);
        renderLancTab();
    };

    // Totais do rodapé/badge seguem o subconjunto FILTRADO (idsVis), não todos os
    // lançamentos — senão editar uma célula faria o total "pular" de volta ao valor
    // sem filtro, contradizendo o que a tabela filtrada está mostrando.
    const recalcTotais = () => {
        COLS_EDIT.forEach(([k]) => {
            const el = cont.querySelector(`[data-tcol="${k}"]`);
            if (el) el.textContent = fmtBRL(idsVis.reduce((s, i) => s + (Number(dados[i][k]) || 0), 0));
        });
        cont.querySelector('[data-tgeral]').textContent = fmtBRL(custoEmpresa());
        cont.querySelector('#lfTotalBadge').textContent =
            `Custo empresa: ${fmtBRL(custoEmpresa())}${filtrado ? ` (${linhas.length} de ${linhasTodas.length})` : ''}`;
    };

    if (podeEditar) {
        // Ações da folha inteira
        cont.querySelector('#lfMenu').onclick = e => {
            e.stopPropagation();
            openPopover(e.currentTarget, [
                { label: 'Resetar tudo (recalcular pelos cadastros)', icon: 'refresh', onClick: () => resetFolhaTudo(ano, mes, key) },
                'sep',
                { label: 'Apagar folha do mês', icon: 'trash', danger: true, onClick: () => apagarFolhaMes(ano, mes, key) }
            ]);
        };

        cont.querySelectorAll('tr[data-fid]').forEach(tr => {
            const fid = tr.dataset.fid;
            const f = folhaState.funcionarios.find(x => x.id === fid);
            // Menu da linha do funcionário
            const rowMenu = tr.querySelector('.lf-row-menu');
            if (rowMenu) rowMenu.onclick = e => {
                e.stopPropagation();
                openPopover(e.currentTarget, [
                    { label: 'Resetar linha (recalcular pelos cadastros)', icon: 'refresh', onClick: () => resetFolhaLinha(fid, f, key) }
                ]);
            };

            const bindFolhaCell = inp => {
                inp.addEventListener('change', async () => {
                    const val = Number(inp.value) || 0;
                    dados[fid][inp.dataset.col] = val;
                    const patch = { [inp.dataset.col]: val };
                    // Salário muda → insalubridade e periculosidade reagem primeiro, e só então
                    // encargos, que depende da base salário+insalubridade+periculosidade já atualizada.
                    if (inp.dataset.col === 'salario') {
                        const insal = calcInsalubridade(fid);
                        dados[fid].insalubridade = insal;
                        patch.insalubridade = insal;
                        const insalValEl = tr.querySelector('.col-insalubridade [data-insal-val]');
                        if (insalValEl) {
                            insalValEl.textContent = fmtBRL(insal);
                            insalValEl.classList.add('cell-flash');
                            setTimeout(() => insalValEl.classList.remove('cell-flash'), 600);
                        }
                        const pericul = calcPericulosidade(fid);
                        dados[fid].periculosidade = pericul;
                        patch.periculosidade = pericul;
                        const periculValEl = tr.querySelector('.col-periculosidade [data-pericul-val]');
                        if (periculValEl) {
                            periculValEl.textContent = fmtBRL(pericul);
                            periculValEl.classList.add('cell-flash');
                            setTimeout(() => periculValEl.classList.remove('cell-flash'), 600);
                        }
                    }
                    // Recalcula encargos (FGTS) e INSS automaticamente quando a base (salário) muda
                    if (inp.dataset.col === 'salario') {
                        const base = (Number(dados[fid].salario) || 0) + (Number(dados[fid].insalubridade) || 0) + (Number(dados[fid].periculosidade) || 0);
                        // Alíquota do CARGO: aprendiz recolhe 2% (art. 15 §7º Lei 8.036/90).
                        const fgtsPct = fgtsPctDe(
                            folhaState.cargos.find(c => c.id === folhaState.funcionarios.find(x => x.id === fid)?.cargoId),
                            folhaState.params);
                        if (fgtsPct > 0) {
                            const enc = Number((base * fgtsPct / 100).toFixed(2));
                            dados[fid].encargos = enc;
                            patch.encargos = enc;
                            const encVal = tr.querySelector('.col-encargos [data-encargos-val]');
                            if (encVal) {
                                encVal.textContent = fmtBRL(enc);
                                encVal.classList.add('cell-flash');
                                setTimeout(() => encVal.classList.remove('cell-flash'), 600);
                            }
                        }
                        const inss = calculoInss(base, folhaState.params.inssFaixas);
                        dados[fid][FOLHA_INSS] = inss;
                        patch[FOLHA_INSS] = inss;
                        const inssVal = tr.querySelector(`.col-${FOLHA_INSS} [data-inss-val]`);
                        if (inssVal) {
                            inssVal.textContent = fmtBRL(inss);
                            inssVal.classList.add('cell-flash');
                            setTimeout(() => inssVal.classList.remove('cell-flash'), 600);
                        }
                    }
                    await DB.save(`${PATHS.folha}/${key}`, fid, patch);
                    tr.querySelector('[data-total]').textContent = fmtBRL(totalLinha(dados[fid]));
                    recalcTotais();
                });
            };
            tr.querySelectorAll('.folha-cell').forEach(bindFolhaCell);

            // Cadeado do Benefícios/Desconto benef.: destrava a célula pra edição manual
            // pontual, sem perder o valor calculado. Cadeado aberto ao lado do input
            // re-trava a célula (volta ao visual read-only, mantendo o último valor salvo).
            const lockCellHtml = (col, val) =>
                `<span class="folha-legado folha-legado-lock" data-unlock-benef="${col}" title="Calculado do cadastro de benefícios ao gerar a folha. Clique no cadeado para editar manualmente esta célula.">${fmtBRL(val)} <button type="button" class="btn-icon btn-icon-sm" data-unlock-benef-btn>${icon('lock')}</button></span>`;
            const unlockCellHtml = (col, val) =>
                `<span class="folha-unlock-wrap"><input class="input folha-cell" data-col="${col}" type="number" min="0" step="0.01" value="${val}"><button type="button" class="btn-icon btn-icon-sm" data-relock-benef-btn title="Travar novamente">${icon('unlock')}</button></span>`;
            const bindLockSpan = span => {
                const btn = span.querySelector('[data-unlock-benef-btn]');
                btn.onclick = e => {
                    e.stopPropagation();
                    const col = span.dataset.unlockBenef;
                    const td = span.closest('td');
                    const val = Number(dados[fid][col]) || 0;
                    td.innerHTML = unlockCellHtml(col, val);
                    const inp = td.querySelector('.folha-cell');
                    bindFolhaCell(inp);
                    inp.focus();
                    inp.select();
                    td.querySelector('[data-relock-benef-btn]').onclick = e2 => {
                        e2.stopPropagation();
                        const valAtual = Number(dados[fid][col]) || 0;
                        td.innerHTML = lockCellHtml(col, valAtual);
                        bindLockSpan(td.querySelector('[data-unlock-benef]'));
                    };
                };
            };
            tr.querySelectorAll('[data-unlock-benef]').forEach(bindLockSpan);
        });
    }
}

// ---- Ações de reset/apagar da folha mensal ----
async function apagarFolhaMes(ano, mes, key) {
    if (await confirmDialog({
        title: 'Apagar folha do mês',
        message: `Apagar <strong>toda</strong> a folha de <strong>${MESES_FULL[mes]} ${ano}</strong>? Todos os lançamentos deste mês serão removidos. Você poderá gerá-la novamente depois.`,
        confirmText: 'Apagar folha', danger: true
    })) {
        await DB.set(`${PATHS.folha}/${key}`, null);
        toast(`Folha de ${MESES_FULL[mes]} apagada.`);
        renderLancTab();
    }
}

async function resetFolhaTudo(ano, mes, key) {
    if (await confirmDialog({
        title: 'Resetar folha do mês',
        message: `Recalcular <strong>toda</strong> a folha de <strong>${MESES_FULL[mes]} ${ano}</strong> a partir dos cadastros (salário, insalubridade, periculosidade, encargos, benefícios)? Todas as edições manuais deste mês serão perdidas.`,
        confirmText: 'Resetar tudo', danger: true
    })) {
        const eleg = elegiveisNoMes(ano, mes);
        const obj = {};
        eleg.forEach(f => obj[f.id] = prefillLinha(f));
        await DB.set(`${PATHS.folha}/${key}`, obj);
        toast('Folha recalculada pelos cadastros.');
        renderLancTab();
    }
}

async function resetFolhaLinha(fid, f, key) {
    if (!f) return toast('Funcionário não encontrado.', 'error');
    if (await confirmDialog({
        title: 'Resetar linha',
        message: `Recalcular a linha de <strong>${escapeHtml(f.nome)}</strong> a partir dos cadastros? As edições manuais desta linha serão perdidas.`,
        confirmText: 'Resetar linha', danger: true
    })) {
        await DB.save(`${PATHS.folha}/${key}`, fid, prefillLinha(f));
        toast('Linha recalculada.');
        renderLancTab();
    }
}

// ============ PROMOÇÕES ============
async function renderPromocoes() {
    const promocoes = (await DB.getAll(PATHS.promocoes)).sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    const fin = can('ver_financeiro');

    lancList({
        searchPh: 'Buscar por funcionário...',
        btnLabel: 'Lançar promoção',
        emptyText: 'Nenhuma promoção lançada.',
        thead: `<th>Funcionário</th><th>Data</th><th>Cargo anterior → novo</th>${fin ? '<th class="num">Salário anterior</th><th class="num">Salário novo</th><th class="num">% aumento</th>' : ''}<th style="width:48px"></th>`,
        rowsHtml: promocoes.map(p => {
            const ajuste = p.cargoAnteriorId === p.cargoNovoId;
            return `
            <tr data-id="${p.id}" data-search="${escapeHtml((lancFuncNome(p.funcionarioId)).toLowerCase())}">
                <td>${lancFuncCellHtml(p.funcionarioId)}</td>
                <td>${fmtDate(p.data)}</td>
                <td>${ajuste ? `<span class="badge badge-info">Ajuste salarial</span> <span class="text-2">${escapeHtml(p.cargoNovoNome || '')}</span>`
                    : `<span class="text-2">${escapeHtml(p.cargoAnteriorNome || '—')}</span> → <strong>${escapeHtml(p.cargoNovoNome || '—')}</strong>`}</td>
                ${fin ? `
                <td class="num">${fmtBRL(p.salarioAntigo)}</td>
                <td class="num"><strong>${fmtBRL(p.salarioNovo)}</strong></td>
                <td class="num"><span class="badge ${p.pctAumento >= 0 ? 'badge-success' : 'badge-danger'}">${p.pctAumento >= 0 ? '+' : ''}${Number(p.pctAumento || 0).toFixed(1)}%</span></td>` : ''}
                <td>${can('editar_lancamentos') ? `<button class="btn-icon" data-menu>${icon('dots')}</button>` : ''}</td>
            </tr>`;
        }).join(''),
        onNew: () => formPromocao(promocoes)
    });
    bindLancFuncCells(document.getElementById('lancTbody'));

    const excluirPromo = async (p, maisRecente) => {
        const msg = maisRecente
            ? `Excluir a promoção de <strong>${escapeHtml(lancFuncNome(p.funcionarioId))}</strong>? O cargo e salário anteriores serão restaurados na ficha.`
            : `Excluir a promoção de <strong>${escapeHtml(lancFuncNome(p.funcionarioId))}</strong>? (Há promoção mais recente; a ficha não será alterada.)`;
        if (await confirmDialog({ title: 'Excluir promoção', message: msg, confirmText: 'Excluir', danger: true })) {
            await DB.remove(PATHS.promocoes, p.id);
            if (maisRecente) {
                await DB.save(PATHS.funcionarios, p.funcionarioId, { cargoId: p.cargoAnteriorId, salario: p.salarioAntigo });
                const f = lancState.funcionarios.find(x => x.id === p.funcionarioId);
                if (f) { f.cargoId = p.cargoAnteriorId; f.salario = p.salarioAntigo; }
            }
            toast('Promoção excluída.');
            renderLancTab();
        }
    };

    document.querySelectorAll('#lancTbody tr[data-id]').forEach(tr => {
        const p = promocoes.find(x => x.id === tr.dataset.id);
        const maisRecente = !promocoes.some(x => x.funcionarioId === p.funcionarioId && (x.data || '') > (p.data || ''));
        lancRowClick(tr, () => detalhePromocao(p, maisRecente, excluirPromo));
        lancRowMenu(tr, [
            { label: 'Ver detalhes', icon: 'eye', onClick: () => detalhePromocao(p, maisRecente, excluirPromo) },
            'sep',
            { label: 'Excluir', icon: 'trash', danger: true, onClick: () => excluirPromo(p, maisRecente) }
        ]);
    });
}

function detalhePromocao(p, maisRecente, onDelete, onClose) {
    const fin = can('ver_financeiro');
    const ajuste = p.cargoAnteriorId === p.cargoNovoId;
    const pctBadge = `<span class="badge ${p.pctAumento >= 0 ? 'badge-success' : 'badge-danger'}">${p.pctAumento >= 0 ? '+' : ''}${Number(p.pctAumento || 0).toFixed(1)}%</span>`;
    abrirDetalheLanc({
        titulo: lancFuncNome(p.funcionarioId),
        funcionarioId: p.funcionarioId,
        sub: ajuste ? 'Ajuste salarial' : 'Promoção',
        badgeHtml: fin ? pctBadge : `<span class="badge badge-info">${ajuste ? 'Ajuste salarial' : 'Promoção'}</span>`,
        linhas: [
            ['Data', fmtDate(p.data)],
            ['Cargo anterior', escapeHtml(p.cargoAnteriorNome || '—')],
            ['Cargo novo', `<strong>${escapeHtml(p.cargoNovoNome || '—')}</strong>`],
            fin ? ['Salário anterior', fmtBRL(p.salarioAntigo)] : null,
            fin ? ['Salário novo', `<strong>${fmtBRL(p.salarioNovo)}</strong>`] : null,
            fin ? ['% de aumento', pctBadge] : null,
            !maisRecente ? ['Observação', '<span class="text-2">Há promoção mais recente para este funcionário.</span>'] : null
        ],
        onDelete: onDelete ? () => onDelete(p, maisRecente) : null,
        onClose
    });
}

function formPromocao(promocoes) {
    const selFunc = selectFuncionario('fpFunc');
    if (!selFunc) return toast('Nenhum funcionário ativo cadastrado.', 'info');
    if (!lancState.cargos.length) return toast('Cadastre cargos em Configurações antes.', 'info');
    const fin = can('ver_financeiro');

    const m = openModal({
        title: 'Lançar promoção / ajuste salarial',
        size: 'modal-lg',
        body: `
            <div class="form-row">
                <div class="field"><label>Funcionário <span class="req">*</span></label>${selFunc}</div>
                <div class="field"><label>Data da promoção <span class="req">*</span></label><input class="input" id="fpData" type="date" value="${hoje()}"></div>
            </div>
            <div class="form-row">
                <div class="field"><label>Cargo anterior</label><input class="input" id="fpCargoAnt" disabled></div>
                <div class="field"><label>Salário anterior</label><input class="input" id="fpSalAnt" disabled></div>
            </div>
            <div class="form-row">
                <div class="field"><label>Cargo novo <span class="req">*</span></label>
                    <button type="button" class="picker-btn" id="fpCargoNovo"></button>
                    <div class="field-hint">Mesmo cargo = ajuste salarial</div>
                </div>
                <div class="field"><label>Salário novo (R$) <span class="req">*</span></label>
                    <input class="input" id="fpSalNovo" type="number" min="0" step="0.01">
                    <div class="field-hint" id="fpPct"></div>
                </div>
            </div>`,
        footer: ''
    });

    bindSelectFuncionario(m.body, 'fpFunc');
    const funcSel = m.body.querySelector('#fpFunc');
    const cargoAntEl = m.body.querySelector('#fpCargoAnt');
    const salAntEl = m.body.querySelector('#fpSalAnt');
    const cargoNovoSel = m.body.querySelector('#fpCargoNovo');
    const salNovoEl = m.body.querySelector('#fpSalNovo');
    const pctEl = m.body.querySelector('#fpPct');
    // Cargo novo em popover (nome + CBO): promover para o homônimo de CBO errado trocaria
    // a ocupação da ficha sem ninguém perceber.
    const cargoNovoPicker = initPickerField(cargoNovoSel, {
        options: cargoOpcoes(lancState.cargos),
        placeholder: 'Selecione o cargo',
        icon: 'briefcase'
    });

    let salarioAntigo = 0, cargoAnterior = null;
    const carregaAtual = () => {
        const f = lancState.funcionarios.find(x => x.id === funcSel.value);
        cargoAnterior = lancState.cargos.find(c => c.id === f?.cargoId) || null;
        salarioAntigo = f?.salario ?? cargoAnterior?.salario ?? 0;
        const cboAnt = cargoAnterior ? cargoCboTexto(cargoAnterior) : '';
        cargoAntEl.value = cargoAnterior ? (cboAnt ? `${cargoAnterior.nome} — ${cboAnt}` : cargoAnterior.nome) : '—';
        salAntEl.value = fin ? fmtBRL(salarioAntigo) : '•••';
        if (cargoAnterior) cargoNovoPicker.set(cargoAnterior.id);
        calcPct();
    };
    const calcPct = () => {
        const novo = Number(salNovoEl.value);
        if (fin && novo > 0 && salarioAntigo > 0) {
            const pct = (novo - salarioAntigo) / salarioAntigo * 100;
            pctEl.textContent = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% de ${pct >= 0 ? 'aumento' : 'redução'}`;
        } else pctEl.textContent = '';
    };
    funcSel.onchange = carregaAtual;
    salNovoEl.addEventListener('input', calcPct);
    cargoNovoSel.onchange = () => {
        // Sugere o salário base do cargo novo se campo vazio
        if (!salNovoEl.value) {
            const c = lancState.cargos.find(x => x.id === cargoNovoSel.value);
            if (c?.salario) { salNovoEl.value = c.salario; calcPct(); }
        }
    };
    carregaAtual();

    m.footer.innerHTML = `
        <button class="btn btn-secondary" data-cancel>Cancelar</button>
        <button class="btn btn-primary" data-save>Lançar promoção</button>`;
    m.footer.querySelector('[data-cancel]').onclick = m.close;
    m.footer.querySelector('[data-save]').onclick = async () => {
        const salarioNovo = Number(salNovoEl.value);
        const data = m.body.querySelector('#fpData').value;
        if (!data) return toast('Informe a data.', 'error');
        if (!(salarioNovo > 0)) return toast('Informe o salário novo.', 'error');

        const funcionarioId = funcSel.value;
        const cargoNovo = lancState.cargos.find(c => c.id === cargoNovoSel.value);
        if (!cargoNovo) return toast('Selecione o cargo novo.', 'error');
        const pctAumento = salarioAntigo > 0 ? (salarioNovo - salarioAntigo) / salarioAntigo * 100 : 0;

        await DB.save(PATHS.promocoes, null, {
            funcionarioId, data,
            cargoAnteriorId: cargoAnterior?.id || null,
            cargoAnteriorNome: cargoAnterior?.nome || '',
            cargoNovoId: cargoNovo.id,
            cargoNovoNome: cargoNovo.nome,
            salarioAntigo, salarioNovo,
            pctAumento: Number(pctAumento.toFixed(2))
        });
        // Conexão automática: atualiza cargo e salário na ficha
        await DB.save(PATHS.funcionarios, funcionarioId, { cargoId: cargoNovo.id, salario: salarioNovo });
        const f = lancState.funcionarios.find(x => x.id === funcionarioId);
        if (f) { f.cargoId = cargoNovo.id; f.salario = salarioNovo; }

        toast('Promoção lançada; ficha atualizada.');
        m.close();
        renderLancTab();
    };
}

// ============ TRANSFERÊNCIAS ============
// Mesmo padrão de Promoção/Demissão: o lançamento registra o EVENTO (com data e origem) e a
// ficha é atualizada na hora. A ficha responde "onde está agora"; o lançamento, "quando mudou".
// Nota: Dashboard e Resultados filtram por unidadeId da ficha, então relatórios de meses
// anteriores passam a contar o colaborador na unidade nova. Decisão consciente — o evento
// fica registrado no histórico para auditoria.

async function renderTransferencias() {
    const transferencias = (await DB.getAll(PATHS.transferencias)).sort((a, b) => (b.data || '').localeCompare(a.data || ''));

    lancList({
        searchPh: 'Buscar por funcionário ou unidade...',
        btnLabel: 'Lançar transferência',
        emptyText: 'Nenhuma transferência lançada.',
        thead: '<th>Funcionário</th><th>Data</th><th>Origem → Destino</th><th>Motivo</th><th>Observações</th><th style="width:48px"></th>',
        rowsHtml: transferencias.map(t => `
            <tr data-id="${t.id}" data-search="${escapeHtml((lancFuncNome(t.funcionarioId) + ' ' + (t.unidadeOrigemNome || '') + ' ' + (t.unidadeDestinoNome || '')).toLowerCase())}">
                <td>${lancFuncCellHtml(t.funcionarioId)}</td>
                <td>${fmtDate(t.data)}</td>
                <td>
                    <span class="text-2">${escapeHtml(t.unidadeOrigemNome || '—')}</span>
                    <span class="transf-seta">→</span>
                    <strong>${escapeHtml(t.unidadeDestinoNome || '—')}</strong>
                </td>
                <td><span class="badge badge-accent">${escapeHtml(t.motivo || '—')}</span></td>
                <td class="text-2">${escapeHtml(t.obs || '—')}</td>
                <td>${can('editar_lancamentos') ? `<button class="btn-icon" data-menu>${icon('dots')}</button>` : ''}</td>
            </tr>`).join(''),
        onNew: () => formTransferencia()
    });
    bindLancFuncCells(document.getElementById('lancTbody'));

    // Só a transferência MAIS RECENTE do funcionário reflete a ficha — excluir uma antiga não
    // pode reverter a unidade atual (mesma regra de Promoção).
    const excluirTransf = async (t, maisRecente) => {
        const msg = maisRecente
            ? `Excluir a transferência de <strong>${escapeHtml(lancFuncNome(t.funcionarioId))}</strong>? O colaborador voltará para <strong>${escapeHtml(t.unidadeOrigemNome || 'a unidade anterior')}</strong> na ficha.`
            : `Excluir a transferência de <strong>${escapeHtml(lancFuncNome(t.funcionarioId))}</strong>? (Há transferência mais recente; a ficha não será alterada.)`;
        if (await confirmDialog({ title: 'Excluir transferência', message: msg, confirmText: 'Excluir', danger: true })) {
            await DB.remove(PATHS.transferencias, t.id);
            if (maisRecente && t.unidadeOrigemId) {
                await DB.save(PATHS.funcionarios, t.funcionarioId, { unidadeId: t.unidadeOrigemId });
                const f = lancState.funcionarios.find(x => x.id === t.funcionarioId);
                if (f) f.unidadeId = t.unidadeOrigemId;
            }
            toast('Transferência excluída.');
            renderLancTab();
        }
    };

    document.querySelectorAll('#lancTbody tr[data-id]').forEach(tr => {
        const t = transferencias.find(x => x.id === tr.dataset.id);
        const maisRecente = !transferencias.some(x => x.funcionarioId === t.funcionarioId && (x.data || '') > (t.data || ''));
        lancRowClick(tr, () => detalheTransferencia(t, maisRecente, excluirTransf));
        lancRowMenu(tr, [
            { label: 'Ver detalhes', icon: 'eye', onClick: () => detalheTransferencia(t, maisRecente, excluirTransf) },
            'sep',
            { label: 'Excluir', icon: 'trash', danger: true, onClick: () => excluirTransf(t, maisRecente) }
        ]);
    });
}

function detalheTransferencia(t, maisRecente, onDelete, onClose) {
    abrirDetalheLanc({
        titulo: lancFuncNome(t.funcionarioId),
        funcionarioId: t.funcionarioId,
        sub: 'Transferência de unidade',
        badgeHtml: `<span class="badge badge-accent">${escapeHtml(t.motivo || '—')}</span>`,
        linhas: [
            ['Data', fmtDate(t.data)],
            ['Unidade de origem', escapeHtml(t.unidadeOrigemNome || '—')],
            ['Unidade de destino', `<strong>${escapeHtml(t.unidadeDestinoNome || '—')}</strong>`],
            ['Motivo', escapeHtml(t.motivo || '—')],
            ['Observações', escapeHtml(t.obs || '—')],
            !maisRecente ? ['Observação', '<span class="text-2">Há transferência mais recente para este colaborador.</span>'] : null
        ],
        anexo: anexosDe(t),
        onDelete: onDelete ? () => onDelete(t, maisRecente) : null,
        onClose
    });
}

function formTransferencia(destinoUnidadeId) {
    const selFunc = selectFuncionario('ftrFunc');
    if (!selFunc) return toast('Nenhum funcionário ativo cadastrado.', 'info');
    if (lancState.unidades.length < 2)
        return toast('É necessário ter ao menos duas unidades cadastradas para transferir.', 'info');

    const m = openModal({
        title: 'Lançar transferência de unidade',
        size: 'modal-lg',
        body: `
            <div class="form-row">
                <div class="field"><label>Funcionário <span class="req">*</span></label>${selFunc}</div>
                <div class="field"><label>Data da transferência <span class="req">*</span></label><input class="input" id="ftrData" type="date" value="${hoje()}"></div>
            </div>
            <div class="form-row">
                <div class="field"><label>Unidade atual</label><input class="input" id="ftrOrigem" disabled></div>
                <div class="field"><label>Unidade de destino <span class="req">*</span></label>
                    <select class="select" id="ftrDestino"></select>
                </div>
            </div>
            <div class="field"><label>Motivo <span class="req">*</span></label>
                <select class="select" id="ftrMotivo">${MOTIVOS_TRANSFERENCIA.map(mo => `<option>${mo}</option>`).join('')}</select>
            </div>
            <div class="field"><label>Observações</label><textarea class="input" id="ftrObs" rows="2" placeholder="Detalhes (opcional)"></textarea></div>
            <div class="field"><label>Anexo (comunicado, aditivo contratual)</label><div id="ftrAnexo"></div></div>
            <div class="form-note form-note-info" id="ftrAviso"></div>`,
        footer: ''
    });

    bindSelectFuncionario(m.body, 'ftrFunc');
    const anexoCtl = initAnexoField(m.body.querySelector('#ftrAnexo'), null);
    const funcSel = m.body.querySelector('#ftrFunc');
    const origemEl = m.body.querySelector('#ftrOrigem');
    const destinoSel = m.body.querySelector('#ftrDestino');
    const avisoEl = m.body.querySelector('#ftrAviso');

    let unidadeOrigem = null;
    const carregaAtual = () => {
        const f = lancState.funcionarios.find(x => x.id === funcSel.value);
        unidadeOrigem = lancState.unidades.find(u => u.id === f?.unidadeId) || null;
        origemEl.value = unidadeOrigem?.nome || 'Sem unidade';
        // Destino nunca oferece a unidade atual — transferir para onde já está não é evento
        destinoSel.innerHTML = lancState.unidades
            .filter(u => u.id !== unidadeOrigem?.id)
            .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''))
            .map(u => `<option value="${u.id}">${escapeHtml(u.nome)}</option>`).join('');
        // Veio de um atalho de "equipe incompleta"/"cobertura reduzida": a unidade com o
        // buraco já é o destino óbvio — poupa o clique, mas o RH ainda pode trocar.
        if (destinoUnidadeId && destinoSel.querySelector(`option[value="${destinoUnidadeId}"]`)) destinoSel.value = destinoUnidadeId;
        atualizaAviso();
    };

    // Aviso de cobertura: a origem fica desfalcada? É a informação que o RH precisa ANTES de
    // confirmar, não depois — mesma régua do alerta "Equipe incompleta" do Dashboard.
    const atualizaAviso = () => {
        const f = lancState.funcionarios.find(x => x.id === funcSel.value);
        if (!f || !unidadeOrigem) { avisoEl.style.display = 'none'; return; }
        const restantes = lancState.funcionarios.filter(x =>
            x.id !== f.id && x.unidadeId === unidadeOrigem.id && x.cargoId === f.cargoId && !x.demissao).length;
        const meta = (unidadeOrigem.recomendados || []).find(r => r.cargoId === f.cargoId);
        const cargoNome = lancState.cargos.find(c => c.id === f.cargoId)?.nome || 'cargo';
        if (meta && restantes < (Number(meta.qtd) || 0)) {
            avisoEl.className = 'form-note form-note-critica';
            avisoEl.innerHTML = `${icon('alert')} <span><strong>${escapeHtml(unidadeOrigem.nome)}</strong> ficará com ${restantes}/${meta.qtd} em <strong>${escapeHtml(cargoNome)}</strong> — abaixo do quadro recomendado. A transferência abre uma vaga na origem.</span>`;
            avisoEl.style.display = '';
        } else {
            avisoEl.style.display = 'none';
        }
    };

    funcSel.onchange = carregaAtual;
    carregaAtual();

    m.footer.innerHTML = `
        <button class="btn btn-secondary" data-cancel>Cancelar</button>
        <button class="btn btn-primary" data-save>Lançar transferência</button>`;
    m.footer.querySelector('[data-cancel]').onclick = m.close;

    const btnSave = m.footer.querySelector('[data-save]');
    btnSave.onclick = async () => {
        const data = m.body.querySelector('#ftrData').value;
        const funcionarioId = funcSel.value;
        const destino = lancState.unidades.find(u => u.id === destinoSel.value);
        if (!data) return toast('Informe a data da transferência.', 'error');
        if (!destino) return toast('Selecione a unidade de destino.', 'error');
        if (destino.id === unidadeOrigem?.id) return toast('A unidade de destino deve ser diferente da atual.', 'error');

        const f = lancState.funcionarios.find(x => x.id === funcionarioId);
        if (f?.admissao && data < f.admissao)
            return toast('A transferência não pode ser anterior à data de admissão.', 'error');

        btnSave.disabled = true;
        btnSave.innerHTML = '<span class="spinner"></span> Salvando...';
        try {
            const { anexos } = await anexoCtl.getAnexos();
            await DB.save(PATHS.transferencias, null, {
                funcionarioId, data,
                unidadeOrigemId: unidadeOrigem?.id || null,
                unidadeOrigemNome: unidadeOrigem?.nome || '',
                unidadeDestinoId: destino.id,
                unidadeDestinoNome: destino.nome,
                motivo: m.body.querySelector('#ftrMotivo').value,
                obs: m.body.querySelector('#ftrObs').value.trim(),
                anexos
            });
            // Conexão automática: atualiza a unidade na ficha em tempo real
            await DB.save(PATHS.funcionarios, funcionarioId, { unidadeId: destino.id });
            if (f) f.unidadeId = destino.id;

            toast(`Transferência lançada; ${f?.nome || 'colaborador'} agora está em ${destino.nome}.`);
            m.close();
            renderLancTab();
        } catch (e) {
            toast(e.message || 'Erro ao salvar.', 'error');
        } finally {
            btnSave.disabled = false;
            btnSave.innerHTML = 'Lançar transferência';
        }
    };
}
