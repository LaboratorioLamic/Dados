// ===== Funcionários: fichas, benefícios e histórico =====

const ESCOLARIDADES = ['Fundamental incompleto', 'Fundamental completo', 'Médio incompleto', 'Médio completo', 'Técnico', 'Superior incompleto', 'Superior completo', 'Pós-graduação', 'Mestrado', 'Doutorado'];
const SEXOS = ['Masculino', 'Feminino', 'Outro'];
const VESTIMENTAS = ['PP', 'P', 'M', 'G', 'GG'];

// ---- Pagamento ----
// Forma de pagamento e dados bancários ficam na ficha porque quem paga a folha precisa do
// destino junto do valor — sem isso o dado vive numa planilha paralela, que é onde erro de
// conta acontece.
//
// É uma LISTA, não um campo único: a mesma pessoa costuma ter mais de um destino cadastrado
// (Pix do dia a dia + conta para o depósito do 13º, por exemplo). Com um campo só, o segundo
// destino vira observação solta ou sobrescreve o primeiro.
//
// `campos` diz o que cada forma pede: as que não pedem nada (dinheiro, cheque) entram na
// lista só como registro do combinado. `titular` é comum às que têm destino identificável.
const FORMAS_PAGAMENTO = [
    { id: 'pix', label: 'Pix', icon: 'key', campos: ['pix', 'titular'] },
    { id: 'transferencia', label: 'Transferência bancária', icon: 'building', campos: ['conta', 'titular'] },
    { id: 'boleto', label: 'Boleto', icon: 'paperclip', campos: [] },
    { id: 'dinheiro', label: 'Dinheiro', icon: 'money', campos: [] },
    { id: 'cheque', label: 'Cheque', icon: 'table', campos: [] }
];
const formaPagDe = id => FORMAS_PAGAMENTO.find(fp => fp.id === id);
const TIPOS_CONTA = ['Conta corrente', 'Conta poupança', 'Conta salário', 'Conta pagamento'];
// Tipo da chave define a máscara/validação do campo Chave Pix — a chave aleatória e o e-mail
// não têm formato numérico, então mascarar tudo como CPF corromperia a chave gravada.
const TIPOS_CHAVE_PIX = ['CPF', 'CNPJ', 'Telefone', 'E-mail', 'Chave aleatória'];
const PIX_PLACEHOLDER = {
    CPF: '000.000.000-00', CNPJ: '00.000.000/0000-00', Telefone: '(00) 00000-0000',
    'E-mail': 'nome@email.com', 'Chave aleatória': '00000000-0000-0000-0000-000000000000'
};

// Ficha antiga guardava uma forma só (`formaPagamento` + `banco`). Convertida na leitura para
// a lista nova: sem isto, quem já tinha dado cadastrado veria a seção vazia depois do deploy.
// A gravação só escreve `pagamentos`, então o formato antigo some no primeiro save da ficha.
function pagamentosDe(f) {
    if (Array.isArray(f?.pagamentos)) return f.pagamentos;
    if (!f?.formaPagamento) return [];
    const b = f.banco || {};
    const forma = FORMAS_PAGAMENTO.find(fp => fp.label === f.formaPagamento);
    return forma ? [{ forma: forma.id, ...b }] : [];
}

// Resumo de uma linha de pagamento para leitura rápida (chip da visualização e subtítulo do
// card no formulário): o destino em si, não a lista de campos.
function pagamentoResumo(p) {
    if (p.forma === 'pix') return p.pixChave || 'Chave não informada';
    if (p.forma === 'transferencia') {
        const partes = [p.nome, p.agencia && `Ag. ${p.agencia}`, p.conta && `C/C ${p.conta}`].filter(Boolean);
        return partes.length ? partes.join(' · ') : 'Conta não informada';
    }
    return '';
}

const funcState = {
    funcionarios: [], cargos: [], unidades: [], beneficios: [], treinamentos: [], ausencias: [],
    // `params` alimenta salarioDe: sem ele, cargo marcado com "usa salário mínimo" resolveria
    // para zero na ficha, enquanto a folha mostraria o valor certo.
    params: {},
    filtro: { q: '', unidade: '', cargo: '', status: 'ativos' }
};

// Tipos de documento = as sub-abas de Documentos. Cada aba publica no seu próprio tipo,
// então o tipo não é mais um campo do formulário — é o contexto de onde você clicou.
//
// ASO NÃO está aqui: deixou de ser "um documento com tipo ASO" solto na ficha e passou a
// ser a aba própria, lida de rh_asos (o mesmo registro da aba ASO em Lançamentos). Ter os
// dois seria duas verdades sobre o mesmo exame — a ficha diria uma coisa, a fila de
// vencimento diria outra.
const TIPOS_DOCUMENTO = ['Certificado de treinamento', 'Contrato de trabalho', 'Documento pessoal', 'Documento escolar', 'Outro'];

// Rótulo curto de cada aba. O drawer é estreito e as 6 abas dividem uma linha só: o nome
// por extenso empurrava "Outro" para fora da borda. O tipo completo continua no título do
// formulário e no dado gravado — encurta-se o rótulo, não o registro.
const FD_DOC_LABEL = {
    'Certificado de treinamento': 'Certificado',
    'Contrato de trabalho': 'Contrato',
    'Documento pessoal': 'Doc. pessoal',
    'Documento escolar': 'Doc. escolar',
    'Outro': 'Outro'
};

// Abas da seção Documentos: os tipos acima + ASO (que vem de outra fonte)
const FD_DOC_ABAS = [
    { id: 'aso', label: 'ASO', aso: true },
    ...TIPOS_DOCUMENTO.map(t => ({ id: t, label: FD_DOC_LABEL[t] || t }))
];
let fdDocAba = 'aso';
// Redesenha a aba Horas do drawer aberto, se for a ativa — setada por drawerFuncionario,
// chamada por bhReload() (bancohoras.js) depois de um fechamento/quitação salvo pela ficha.
let fdHorasRefresh = null;
// Sub-aba ativa dentro de Horas: ciclo vigente (o que está correndo agora) vs. ciclos
// anteriores (histórico fechado/liquidado) — mesmo padrão de fdDocAba/fdHistSub.
let fdHorasSub = 'vigente';
// Sub-aba ativa dentro de Dados: Informações / Pagamentos / 13º Salário / Férias.
let fdDadosSub = 'informacoes';
// Redesenha a aba Dados do drawer aberto — setada por drawerFuncionario, chamada por
// renderLancTab() (lancamentos.js) e renderDecimo() (decimo.js) quando um formulário de
// férias ou de parcela do 13º é salvo a partir da ficha (fdDadosSub === 'ferias'/'decimo13'),
// fora da página de Lançamentos onde essas funções normalmente redesenham a própria página.
let fdDadosRefresh = null;
// Ano selecionado na sub-aba Pagamentos — null até o primeiro render, quando cai no ano mais
// recente com dado. Persiste entre trocas de sub-aba (mesmo padrão de fdHorasSub/fdDadosSub).
let fdPagAno = null;
// Mesma ideia para a sub-aba 13º Salário — ano selecionado, null até o primeiro render.
let fdDecimo13Ano = null;

// Tipo gravado antes de o ASO virar aba própria (lia-se de f.documentos, não de rh_asos).
// Sem isto o registro existiria no banco sem nenhuma aba que o exibisse — sumiria da tela
// sem ninguém apagar nada. Cai em "Outro", que é onde o usuário vai procurar o que sobrou.
const FD_DOC_TIPO_ASO_LEGADO = 'ASO (exame ocupacional)';
const fdDocTipoDe = doc => {
    const t = doc?.tipo;
    if (!t || t === FD_DOC_TIPO_ASO_LEGADO) return 'Outro';
    return TIPOS_DOCUMENTO.includes(t) ? t : 'Outro';
};

const cargoDe = f => funcState.cargos.find(c => c.id === f.cargoId);
// Salário efetivo: individual (definido na ficha ou por promoção/ajuste) ou base do cargo
// `salarioDe` vive em utils.js e é o ponto único de resolução (funcionário → cargo → mínimo).
// Havia aqui uma segunda declaração, com a assinatura antiga (f, cargos) e lendo o campo
// legado `cargo.salario`: além de ignorar `usaSalarioMinimo` e `salarioBase`, duas `const` de
// mesmo nome no escopo global são SyntaxError — este arquivo inteiro deixava de carregar, e
// com ele a página de Funcionários. Resolve pelo cargo do funcionário; params vem do state.
const funcSalarioDe = f => salarioDe(f, funcState.cargos.find(c => c.id === f?.cargoId), funcState.params);
const unidadeDe = f => funcState.unidades.find(u => u.id === f.unidadeId);
const funcAtivo = f => !f.demissao;

registerPage({
    id: 'funcionarios',
    title: 'Funcionários',
    icon: 'users',
    order: 2,
    perm: 'ver_funcionarios',
    async render(el) {
        el.innerHTML = '<div class="loading-center"><div class="spinner-dark"></div></div>';
        const [funcionarios, cargos, unidades, beneficios, treinamentos, ausencias, params] = await Promise.all([
            DB.getAll(PATHS.funcionarios), DB.getAll(PATHS.cargos),
            DB.getAll(PATHS.unidades), DB.getAll(PATHS.beneficios), DB.getAll(PATHS.treinamentos),
            DB.getAll(PATHS.ausencias),
            // Necessário para salarioDe resolver cargos marcados com "usa salário mínimo".
            DB.getObj(PATHS.parametros)
        ]);
        Object.assign(funcState, { funcionarios, cargos, unidades, beneficios, treinamentos, ausencias, params: params || {} });

        el.innerHTML = `
            <div class="page-header">
                <div>
                    <h2>Funcionários</h2>
                    <div class="page-sub" id="funcCount"></div>
                </div>
                <div class="actions">
                    <button class="btn btn-secondary" id="funcRelatorio">${icon('report')} Baixar relatório ${icon('chevronDown')}</button>
                    ${can('editar_funcionarios') ? `<button class="btn btn-primary" id="funcNew">${icon('plus')} Novo funcionário</button>` : ''}
                </div>
            </div>
            <div class="filters-bar">
                <div class="search-box">${icon('search')}<input class="input" id="funcSearch" placeholder="Buscar por nome..." value="${escapeHtml(funcState.filtro.q)}"></div>
                <button class="filter-btn" id="funcFUnidade" data-icon="building"></button>
                <button class="filter-btn" id="funcFCargo" data-icon="briefcase"></button>
                <button class="filter-btn" id="funcFStatus" data-icon="user"></button>
            </div>
            <div id="funcGrid"></div>`;

        const btnNew = el.querySelector('#funcNew');
        if (btnNew) btnNew.onclick = () => formFuncionario(null);
        const btnRel = el.querySelector('#funcRelatorio');
        btnRel.onclick = () => abrirMenuRelatorio(btnRel);
        el.querySelector('#funcSearch').addEventListener('input', e => { funcState.filtro.q = e.target.value; renderFuncGrid(); });

        // Filtros em popover (no lugar dos selects nativos)
        const STATUS = [
            { value: 'ativos', label: 'Ativos' },
            { value: 'ferias', label: 'De férias' },
            { value: 'ferias_vencendo', label: 'Férias vencendo' },
            { value: 'ferias_vencidas', label: 'Férias vencidas' },
            { value: 'desligados', label: 'Desligados' },
            { value: '', label: 'Todos' }
        ];
        const bindFilter = (id, icone, campo, options, allLabel, isDefault) => {
            const btn = el.querySelector(`#${id}`);
            const sync = () => {
                const sel = options.find(o => o.value === funcState.filtro[campo]);
                const ativo = !isDefault(funcState.filtro[campo]);
                btn.innerHTML = `${icon(icone)}<span>${escapeHtml(ativo && sel ? sel.label : allLabel)}</span>${icon('chevronDown')}`;
                btn.classList.toggle('active', ativo);
            };
            btn.onclick = () => openFilterPopover(btn, {
                options, value: funcState.filtro[campo], searchable: options.length > 6,
                onPick: v => { funcState.filtro[campo] = v; sync(); renderFuncGrid(); }
            });
            sync();
        };
        bindFilter('funcFUnidade', 'building', 'unidade',
            [{ value: '', label: 'Todas as unidades' }, ...unidades.map(u => ({ value: u.id, label: u.nome }))],
            'Todas as unidades', v => !v);
        bindFilter('funcFCargo', 'briefcase', 'cargo',
            [{ value: '', label: 'Todos os cargos' }, ...cargoOpcoes(cargos)],
            'Todos os cargos', v => !v);
        bindFilter('funcFStatus', 'user', 'status', STATUS, 'Ativos', v => v === 'ativos');
        renderFuncGrid();
    }
});

// Férias em curso do funcionário (usa as ausências já carregadas na página)
const funcFerias = f => feriasVigente(f.id, funcState.ausencias);

// Cor do ponto no card, por prioridade: desligado → de férias (azul) → vencida (laranja)
// → vencendo (amarelo) → ativo (verde). Gozo em curso vence o alerta: quem está de férias
// agora está resolvendo o ciclo, não acumulando risco.
function funcStatusDot(f, fer, sit) {
    if (!funcAtivo(f)) return { cls: 'off', txt: 'Desligado' };
    // Antes de qualquer alerta: admissão futura invalida tudo que se deriva dela.
    if (admissaoFutura(f)) return { cls: 'futuro', txt: `Admissão em ${fmtDate(f.admissao)} — data futura` };
    if (fer) return { cls: 'ferias', txt: `De férias até ${fmtDate(fer.retorno)}` };
    if (sit?.status === 'vencida') return { cls: 'vencida', txt: `Férias vencidas — ${sit.label}` };
    if (sit?.status === 'critica') return { cls: 'vencendo', txt: `Férias vencendo — ${sit.label}` };
    return { cls: 'on', txt: 'Ativo' };
}

function funcFiltrados() {
    const { q, unidade, cargo, status } = funcState.filtro;
    const porStatus = f => {
        if (status === '') return true;
        if (status === 'ativos') return funcAtivo(f);
        if (status === 'ferias') return funcAtivo(f) && !!funcFerias(f);   // de férias continua ativo
        // Vencendo = dentro do alerta legal (status 'critica'), ainda no prazo. Quem já
        // está gozando não está "vencendo" — o gozo em curso resolve o ciclo.
        if (status === 'ferias_vencendo') return !funcFerias(f) && situacaoFeriasFunc(f, funcState.ausencias)?.status === 'critica';
        // Vencidas = prazo concessivo estourado (art. 137 CLT, férias em dobro).
        if (status === 'ferias_vencidas') return !funcFerias(f) && situacaoFeriasFunc(f, funcState.ausencias)?.status === 'vencida';
        return !funcAtivo(f);
    };
    return funcState.funcionarios
        .filter(f => !q || (f.nome || '').toLowerCase().includes(q.toLowerCase()))
        .filter(f => !unidade || f.unidadeId === unidade)
        .filter(f => !cargo || f.cargoId === cargo)
        .filter(porStatus)
        .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
}

function renderFuncGrid() {
    const grid = document.getElementById('funcGrid');
    const lista = funcFiltrados();
    const ativos = funcState.funcionarios.filter(funcAtivo).length;
    const nFerias = funcState.funcionarios.filter(f => funcAtivo(f) && funcFerias(f)).length;
    const contaSit = st => funcState.funcionarios.filter(f =>
        !funcFerias(f) && situacaoFeriasFunc(f, funcState.ausencias)?.status === st).length;
    const nVencendo = contaSit('critica');
    const nVencidas = contaSit('vencida');
    document.getElementById('funcCount').innerHTML =
        `${ativos} ativo${ativos !== 1 ? 's' : ''} · ${funcState.funcionarios.length} no total`
        + (nFerias ? ` · <span class="txt-ferias">${nFerias} de férias hoje</span>` : '')
        + (nVencendo ? ` · <span class="txt-warning">${nVencendo} com férias vencendo</span>` : '')
        + (nVencidas ? ` · <span class="txt-danger">${nVencidas} com férias vencidas</span>` : '');

    if (!lista.length) {
        grid.innerHTML = emptyState({
            icon: 'users',
            title: 'Nenhum funcionário encontrado',
            text: funcState.funcionarios.length ? 'Ajuste os filtros de busca.' : 'Cadastre o primeiro funcionário para começar.'
        });
        return;
    }

    grid.innerHTML = `<div class="func-grid">${lista.map(f => {
        const cargo = cargoDe(f), unidade = unidadeDe(f);
        const nTrein = funcState.treinamentos.filter(t => (t.participantes || []).includes(f.id)).length;
        const fer = funcAtivo(f) ? funcFerias(f) : null;
        const sit = situacaoFeriasFunc(f, funcState.ausencias);
        const dot = funcStatusDot(f, fer, sit);
        return `
        <div class="func-card${fer ? ' em-ferias' : ''}" data-id="${f.id}">
            <span class="func-status ${dot.cls}" title="${escapeHtml(dot.txt)}"></span>
            <div class="func-top">
                ${avatarHtml(f, 'lg')}
                <div class="grow">
                    <div class="func-nome">${escapeHtml(f.nome)}</div>
                    <div class="func-cargo">${escapeHtml(cargo?.nome || 'Sem cargo')}</div>
                </div>
            </div>
            <div class="func-tags">
                <span class="chip-soft">${icon('building')} ${escapeHtml(unidade?.nome || 'Sem unidade')}</span>
                ${admissaoFutura(f)
                    ? `<span class="chip-soft chip-futuro" title="Tempo de casa, férias e experiência não são calculáveis enquanto a admissão estiver no futuro. Verifique a data.">${icon('alert')} Admissão em ${fmtDate(f.admissao)}</span>`
                    : fer
                    ? `<span class="chip-soft chip-ferias" title="Volta em ${fmtDate(fer.retorno)}">${icon('sun')} Férias · volta em ${diasAteRetorno(fer)}d</span>`
                    : sit ? `<span class="chip-soft chip-prog chip-prog-${sit.status}" title="${escapeHtml(sit.desc)}">${icon(sit.status === 'aquisitivo' ? 'calendar' : 'alert')} ${escapeHtml(sit.label)}</span>` : ''}
            </div>
            <div class="func-meta">
                <span class="flex" style="gap:5px" title="Tempo de empresa">${icon('calendar')} ${tempoEmpresa(f.admissao, f.demissao)}</span>
                <span class="flex" style="gap:5px" title="Treinamentos">${icon('book')} ${nTrein}</span>
            </div>
        </div>`;
    }).join('')}</div>`;

    grid.querySelectorAll('.func-card').forEach(card => {
        card.onclick = () => drawerFuncionario(funcState.funcionarios.find(f => f.id === card.dataset.id));
    });
    bindAvatarFotos(grid);
}

// ---- Drawer de detalhe ----
function drawerFuncionario(f, abaInicial = 'dados') {
    const cargo = cargoDe(f), unidade = unidadeDe(f);
    const podeEditar = can('editar_funcionarios');
    const fer = funcAtivo(f) ? funcFerias(f) : null;
    const sitF = situacaoFeriasFunc(f, funcState.ausencias);
    const d = openDrawer({
        headerHtml: `
            <div class="drawer-title-row">
                ${avatarHtml(f, 'foto-media', true)}
                <div class="grow">
                    <h3>${escapeHtml(f.nome)}</h3>
                    <div class="drawer-sub">${escapeHtml(cargo?.nome || 'Sem cargo')}</div>
                    <div class="drawer-tags">
                        <span class="badge ${funcAtivo(f) ? 'badge-success' : 'badge-danger'}">${funcAtivo(f) ? 'Ativo' : 'Desligado'}</span>
                        ${fer ? `<span class="badge badge-ferias" title="De ${fmtDate(fer.inicio)} a ${fmtDate(fer.retorno)}">${icon('sun')} De férias · volta em ${diasAteRetorno(fer)}d</span>` : ''}
                        ${sitF && !fer && sitF.status !== 'aquisitivo' ? `<span class="badge ${FERIAS_STATUS[sitF.status].cls}" title="${escapeHtml(sitF.desc)}">${icon('alert')} Férias: ${escapeHtml(sitF.label)}</span>` : ''}
                        <span class="badge badge-neutral">${icon('building')} ${escapeHtml(unidade?.nome || 'Sem unidade')}</span>
                    </div>
                </div>
                ${podeEditar ? `<button class="btn btn-secondary btn-sm" id="fdEdit">${icon('edit')} Editar</button>` : ''}
            </div>`,
        // Sem isto, um fechamento/quitação/parcela/férias salvos depois que o drawer já
        // fechou chamariam setTab num #fdContent que não existe mais no DOM.
        onClose: () => { fdHorasRefresh = null; fdDadosRefresh = null; chartDestroy('fdHoras'); chartDestroy('fdDados'); }
    });
    bindAvatarFotos(d.el);

    d.body.innerHTML = `
        <div class="tabs tabs-full" id="fdTabs">
            <div class="tab" data-tab="dados">Dados</div>
            <div class="tab" data-tab="beneficios">Benefícios</div>
            <div class="tab" data-tab="documentos">Documentos</div>
            <div class="tab" data-tab="horas">Horas</div>
            <div class="tab" data-tab="historico">Histórico</div>
        </div>
        <div class="mt-16" id="fdContent"></div>`;

    const btnEdit = d.el.querySelector('#fdEdit');
    if (btnEdit) btnEdit.onclick = () => { d.close(); formFuncionario(f); };

    const tabs = d.body.querySelectorAll('#fdTabs .tab');
    const setTab = id => {
        tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === id));
        const contEl = d.body.querySelector('#fdContent');
        contEl.dataset.fdTab = id;
        ({ dados: fdDados, beneficios: fdBeneficios, documentos: fdDocumentos, horas: fdHoras, historico: fdHistorico })[id](f, contEl);
    };
    tabs.forEach(t => t.onclick = () => setTab(t.dataset.tab));
    setTab(abaInicial);
    // Fechamento/quitação de banco de horas abertos a partir desta aba precisam redesenhar
    // a mesma aba depois de salvar — bhReload() (bancohoras.js) chama isto se a aba Horas
    // estiver ativa no momento.
    fdHorasRefresh = () => setTab('horas');
    // Mesma ideia para férias/13º, que vivem dentro da aba Dados — renderLancTab()
    // (lancamentos.js) e renderDecimo() (decimo.js) chamam isto se a sub-aba certa estiver ativa.
    // Recarrega funcState.ausencias antes de redesenhar: sem isto, o form de férias aberto
    // pela própria ficha salva no banco mas a aba Férias continua lendo o array carregado no
    // render da página (comentário em fdFeriasAba), e o período recém-lançado nunca aparece
    // sem sair e reabrir a ficha.
    fdDadosRefresh = async () => {
        funcState.ausencias = await DB.getAll(PATHS.ausencias);
        setTab('dados');
    };
}

// ---- Dados: shell de sub-abas ----
// Informações é o antigo conteúdo único da aba; Pagamentos/13º Salário/Férias são views novas
// que reaproveitam os motores de folha.js, decimo.js e utils.js — mesmo padrão de fdHoras.
async function fdDados(f, cont) {
    const subs = [
        { id: 'informacoes', label: 'Informações' },
        { id: 'pagamentos', label: 'Pagamentos' },
        { id: 'decimo13', label: '13º Salário' },
        { id: 'ferias', label: 'Férias' }
    ];

    cont.innerHTML = `
        <div class="tabs tabs-sub" id="fdDadosSubs">${subs.map(s => `
            <div class="tab" data-sub="${s.id}">${s.label}</div>`).join('')}
        </div>
        <div class="mt-12" id="fdDadosBody"></div>`;

    const box = cont.querySelector('#fdDadosBody');
    const views = {
        informacoes: () => fdInformacoes(f, box),
        pagamentos: () => fdPagamentos(f, box),
        decimo13: () => fdDecimo13(f, box),
        ferias: () => fdFeriasAba(f, box)
    };

    const subEls = cont.querySelectorAll('#fdDadosSubs .tab');
    const setSub = id => {
        fdDadosSub = id;
        cont.dataset.fdDadosSub = id;
        subEls.forEach(t => t.classList.toggle('active', t.dataset.sub === id));
        views[id]();
    };
    subEls.forEach(t => t.onclick = () => setSub(t.dataset.sub));
    setSub(views[fdDadosSub] ? fdDadosSub : 'informacoes');
}

function fdInformacoes(f, cont) {
    const cargo = cargoDe(f);
    const idadeF = idade(f.nascimento);
    const fin = can('ver_financeiro');

    // Agrupado em seções temáticas em vez de um grid chapado
    const secoes = [
        { titulo: 'Dados pessoais', icon: 'user', itens: [
            ['Sexo', f.sexo || '—'],
            ['Nascimento', `${fmtDate(f.nascimento)}${idadeF != null ? ` · ${idadeF} anos` : ''}`],
            ['Escolaridade', f.escolaridade || '—'],
            ['Vestimenta', f.vestimenta || '—']
        ]},
        { titulo: 'Contato', icon: 'user', itens: [
            ['Telefone', f.telefone || '—'],
            ['E-mail', f.email || '—']
        ]},
        { titulo: 'Contrato', icon: 'briefcase', itens: [
            ['Admissão', fmtDate(f.admissao)],
            ['Demissão', f.demissao ? fmtDate(f.demissao) : '—'],
            ['Tempo de empresa', tempoEmpresa(f.admissao, f.demissao)],
            ...(cargo?.insalubridade ? [['Insalubridade', `Grau ${cargo.insalubridade}%`]] : []),
            ...(cargo?.periculosidade ? [['Periculosidade', `${PERICULOSIDADE_PCT}%`]] : [])
        ]}
    ];
    if (fin) secoes.push({ titulo: 'Financeiro', icon: 'money', itens: [
        ['Salário', `${fmtBRL(funcSalarioDe(f))}${f.salario == null ? ' · base do cargo' : ''}`]
    ]});

    // Pagamento: mesmo gate do salário (ver_financeiro). Fora de `secoes` porque não é
    // chave/valor — são N formas, cada uma com o próprio bloco de dados. Só as linhas que a
    // forma usa: para quem recebe em dinheiro, uma lista de "Agência —, Conta —" seria ruído.
    const pagsHtml = !fin ? '' : (() => {
        const lista = pagamentosDe(f);
        const linhasDe = p => {
            if (p.forma === 'pix') return [
                ['Tipo da chave', p.pixTipo || '—'],
                ['Chave Pix', p.pixChave || '—']
            ];
            if (p.forma === 'transferencia') return [
                ['Banco', p.nome ? `${p.codigo ? `${p.codigo} · ` : ''}${p.nome}` : '—'],
                ['Tipo de conta', p.tipoConta || '—'],
                ['Agência', p.agencia || '—'],
                ['Conta', p.conta || '—'],
                ...(p.titularDoc ? [['CPF/CNPJ do titular', p.titularDoc]] : [])
            ];
            return [];
        };
        return `
        <div class="fd-section">
            <div class="fd-section-head">${icon('money')}<span>Pagamento</span></div>
            <div class="fd-section-body">
                ${!lista.length ? `<div class="fd-row"><span class="fd-k">Forma de pagamento</span><span class="fd-v">—</span></div>` : lista.map((p, i) => {
                    const forma = formaPagDe(p.forma);
                    const resumo = pagamentoResumo(p);
                    // Titular só aparece quando é de terceiro: em branco significa o próprio
                    // funcionário, e repetir o nome dele em toda ficha não informa nada.
                    const linhas = [...linhasDe(p), ...(p.titular ? [['Titular da conta', p.titular]] : [])];
                    return `
                    <div class="fd-pag">
                        <div class="fd-pag-head">
                            <span class="fd-pag-ico">${icon(forma?.icon || 'money')}</span>
                            <strong>${escapeHtml(forma?.label || p.forma)}</strong>
                            ${i === 0 && lista.length > 1 ? '<span class="badge badge-info">Principal</span>' : ''}
                            ${resumo ? `<span class="fd-pag-resumo">${escapeHtml(resumo)}</span>` : ''}
                        </div>
                        ${linhas.map(([l, v]) => `
                            <div class="fd-row"><span class="fd-k">${l}</span><span class="fd-v">${escapeHtml(v)}</span></div>`).join('')}
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    })();

    cont.innerHTML = secoes.map(s => `
        <div class="fd-section">
            <div class="fd-section-head">${icon(s.icon)}<span>${s.titulo}</span></div>
            <div class="fd-section-body">${s.itens.map(([l, v]) => `
                <div class="fd-row"><span class="fd-k">${l}</span><span class="fd-v">${escapeHtml(v)}</span></div>`).join('')}</div>
        </div>`).join('') + pagsHtml;
}

// ---- Pagamentos (histórico da folha) ----
// Reusa o motor de folha.js (folhaComHeBanco, brutoLinha, totalLinha, feriasCtx) — nenhuma
// regra nova, só a leitura por-funcionário do que já é lançado em Lançamentos → Folha mensal.
// Sensível: mesmo gate de permissão da própria página Folha & Custos.
async function fdPagamentos(f, box) {
    if (!can('ver_folha') || !can('ver_financeiro')) {
        box.innerHTML = emptyState({
            icon: 'lock', title: 'Acesso restrito',
            text: 'Ver o histórico de pagamentos exige as permissões "Ver Folha & Custos" e "Ver valores financeiros".'
        });
        return;
    }
    box.innerHTML = '<div class="loading-center"><div class="spinner-dark"></div></div>';
    const [folhaAll, bhFechamentos, bhQuitacoes, extras, decimos, params] = await Promise.all([
        DB.getObj(PATHS.folha),
        DB.getAll(PATHS.bancoHorasFechamentos),
        DB.getAll(PATHS.bancoHorasQuitacoes),
        DB.getAll(PATHS.extraBanco),
        DB.getAll(PATHS.decimos),
        DB.getObj(PATHS.parametros)
    ]);

    // Mesmo ctx que a Folha usa para as colunas derivadas (HE banco, férias, 13º) — sem ele o
    // total ficaria menor do que o que a folha mensal realmente mostra para este mês.
    const ctx = feriasCtx({
        ausencias: funcState.ausencias, funcionarios: funcState.funcionarios, cargos: funcState.cargos,
        params: params || {}, decimos, bhFechamentos, extras, bhQuitacoes
    });

    const todosMeses = Object.keys(folhaAll || {})
        .filter(mk => folhaAll[mk]?.[f.id])
        .sort((a, b) => b.localeCompare(a))
        .map(mk => {
            const linha = folhaComHeBanco({ [f.id]: folhaAll[mk][f.id] }, mk, bhFechamentos, extras, bhQuitacoes, ctx)[f.id];
            const total = totalLinha(linha);
            // Líquido real: custo total menos o INSS do empregado (ver liquidoLinha em
            // folha.js). Encargos (FGTS) já não entra aqui — é custo da empresa, nunca passa
            // pelo bolso do funcionário, então já está fora do que se chama de líquido.
            const liquido = liquidoLinha(linha);
            return { mk, linha, total, liquido };
        });

    if (!todosMeses.length) {
        box.innerHTML = emptyState({
            icon: 'money', title: 'Nenhum pagamento lançado',
            text: 'Nenhum mês de folha lançado para este funcionário ainda. Os lançamentos são feitos em Lançamentos → Folha mensal.'
        });
        return;
    }

    // Anos com dado, do mais recente para o mais antigo — só estes entram na navegação, um
    // ano sem nenhum mês lançado não é um "anterior"/"próximo" válido para o funcionário.
    const anosComDados = [...new Set(todosMeses.map(m => Number(m.mk.slice(0, 4))))].sort((a, b) => b - a);
    if (!anosComDados.includes(fdPagAno)) fdPagAno = anosComDados[0];

    const render = () => {
        const meses = todosMeses.filter(m => Number(m.mk.slice(0, 4)) === fdPagAno);
        const idxAno = anosComDados.indexOf(fdPagAno);
        const temAnterior = idxAno < anosComDados.length - 1;   // existe ano mais antigo com dado
        const temProximo = idxAno > 0;                          // existe ano mais recente com dado

        // Gráfico em ordem cronológica (mais antigo → mais recente); os cards abaixo continuam
        // do mais recente para o mais antigo, que é a ordem de leitura natural de um histórico.
        const doGrafico = meses.slice().reverse();

        box.innerHTML = `
            <div style="display:flex;justify-content:flex-end;margin-bottom:14px">
                <div class="month-nav">
                    ${temAnterior ? `<button id="fdPagAnoPrev" title="Ano anterior com pagamentos">‹</button>` : ''}
                    <span class="month-label">${fdPagAno}</span>
                    ${temProximo ? `<button id="fdPagAnoNext" title="Próximo ano com pagamentos">›</button>` : ''}
                </div>
            </div>
            <div class="chart-grid chart-grid-full">
                ${chartCard({
                    id: 'fdPagFluxo', titulo: 'Custo total por mês',
                    sub: 'Remuneração + encargos + benefícios + HE (banco) + férias + 13º — meses lançados',
                    total: fmtBRL(meses.reduce((s, m) => s + m.total, 0)),
                    acao: `<button class="chart-legenda-btn" id="fdPagToggle" title="Alternar entre custo total (empresa) e valor líquido (o que o funcionário recebeu)">${icon('money')}<span>Custo total</span></button>`
                })}
            </div>
            <div class="bh-ciclos-grid" id="fdPagGrid">
                ${meses.map(m => {
                    const l = m.linha;
                    const partes = [
                        l.salario ? `${fmtBRL(l.salario)} salário` : '',
                        l[FOLHA_HE_BANCO] ? `${fmtBRL(l[FOLHA_HE_BANCO])} HE` : '',
                        l[FOLHA_FERIAS_CALC] ? `${fmtBRL(l[FOLHA_FERIAS_CALC])} férias` : '',
                        l[FOLHA_DECIMO_CALC] ? `${fmtBRL(l[FOLHA_DECIMO_CALC])} 13º` : '',
                        l[FOLHA_DESC_ATRASO] ? `${fmtBRL(l[FOLHA_DESC_ATRASO])} desc. atraso` : '',
                        `${fmtBRL(m.liquido)} líquido`
                    ].filter(Boolean);
                    return `
                    <div class="bh-ciclo-card row-clickable" data-mk="${m.mk}">
                        <div class="bh-ciclo-head">
                            <div><strong>${mesLabel(m.mk)}</strong></div>
                            ${icon('chevronRight')}
                        </div>
                        <div class="bh-ciclo-saldo">
                            <div class="bh-saldo-big">${fmtBRL(m.total)}</div>
                            <div class="bh-saldo-comp">${escapeHtml(partes.join(' · '))}</div>
                        </div>
                    </div>`;
                }).join('')}
            </div>`;

        // Alterna o gráfico entre custo total (empresa) e valor líquido (o que o funcionário
        // recebeu), sem refazer os cards abaixo — só o gráfico e o total do cabeçalho mudam.
        let modoLiquido = false;
        const desenhaChart = () => {
            const campo = modoLiquido ? 'liquido' : 'total';
            const label = modoLiquido ? 'Valor líquido' : 'Custo total';
            mkChart('fdDados', 'fdPagFluxo', {
                type: 'bar',
                data: {
                    labels: doGrafico.map(m => mesLabel(m.mk)),
                    datasets: [dvBarra(label, doGrafico.map(m => m[campo]), dvCor(modoLiquido ? 1 : 0))]
                },
                options: dvOpts({ fmt: 'brl' })
            });
            const totalStat = box.querySelector('.chart-card .cc-total');
            if (totalStat) totalStat.textContent = fmtBRL(meses.reduce((s, m) => s + m[campo], 0));
        };
        desenhaChart();

        const btnToggle = box.querySelector('#fdPagToggle');
        if (btnToggle) btnToggle.onclick = () => {
            modoLiquido = !modoLiquido;
            btnToggle.classList.toggle('active', modoLiquido);
            // O rótulo diz o que o gráfico ESTÁ mostrando agora, não o que o clique mudaria para.
            btnToggle.querySelector('span').textContent = modoLiquido ? 'Valor líquido' : 'Custo total';
            desenhaChart();
        };

        box.querySelectorAll('[data-mk]').forEach(card => {
            card.onclick = () => detalheFolhaMes(f, meses.find(m => m.mk === card.dataset.mk));
        });

        const btnPrev = box.querySelector('#fdPagAnoPrev');
        if (btnPrev) btnPrev.onclick = () => { fdPagAno = anosComDados[idxAno + 1]; render(); };
        const btnNext = box.querySelector('#fdPagAnoNext');
        if (btnNext) btnNext.onclick = () => { fdPagAno = anosComDados[idxAno - 1]; render(); };
    };
    render();
}

// ---- Janela: detalhe do custo de um mês (recibo simplificado) ----
function detalheFolhaMes(f, item) {
    const l = item.linha;
    // Todas as verbas que compõem brutoLinha/totalLinha (folha.js) têm que aparecer aqui —
    // faltava a HE legada (FOLHA_HE_MANUAL): a soma das linhas mostradas divergia do "Custo
    // total" sempre que o mês tinha hora extra lançada à mão antes do banco de horas.
    const linhas = [
        ...FOLHA_COLS.map(([k, label]) => [label, Number(l[k]) || 0]),
        [FOLHA_COL_LABEL[FOLHA_HE_BANCO], Number(l[FOLHA_HE_BANCO]) || 0],
        [FOLHA_COL_LABEL[FOLHA_HE_MANUAL], Number(l[FOLHA_HE_MANUAL]) || 0],
        [FOLHA_COL_LABEL[FOLHA_FERIAS_CALC], Number(l[FOLHA_FERIAS_CALC]) || 0],
        [FOLHA_COL_LABEL[FOLHA_DECIMO_CALC], Number(l[FOLHA_DECIMO_CALC]) || 0],
        [FOLHA_COL_LABEL[FOLHA_DESC_ATRASO], Number(l[FOLHA_DESC_ATRASO]) || 0]
    ].filter(([, v]) => v);
    const desconto = descontoEfetivoLinha(l);

    // Valor líquido: o que chega às mãos do funcionário — o custo total MENOS o INSS
    // (desconto do empregado, por faixa). Encargos (FGTS) fica de fora: é custo da empresa,
    // nunca passa pelo bolso dele, então já não compõe o "total" na perspectiva do
    // funcionário. IRRF não é lançado pelo sistema, então este ainda não é o líquido exato
    // do holerite — só falta essa retenção.
    const inss = Number(l[FOLHA_INSS]) || 0;
    const liquido = item.total - inss;

    const m = openModal({
        title: `Custo de ${mesLabel(item.mk)} — ${f.nome}`,
        size: 'md',
        body: `
            <div class="bx-calc">
                <div class="bx-calc-tit">${icon('money')} Composição do custo</div>
                <div class="bx-calc-grid">
                    ${linhas.map(([label, v]) => `<span>${escapeHtml(label)}</span><strong>${fmtBRL(v)}</strong>`).join('')}
                    ${desconto ? `<span>− Coparticipação do funcionário</span><strong>−${fmtBRL(desconto)}</strong>` : ''}
                </div>
                <div class="bx-calc-total"><span>Custo total (empresa)</span><strong>${fmtBRL(item.total)}</strong></div>
            </div>
            <div class="bx-calc">
                <div class="bx-calc-tit">${icon('money')} Valor líquido</div>
                <div class="bx-calc-grid">
                    <span>Custo total</span><strong>${fmtBRL(item.total)}</strong>
                    ${inss ? `<span>− INSS <em class="bx-calc-nota">(desconto do empregado, por faixa)</em></span><strong>−${fmtBRL(inss)}</strong>` : ''}
                </div>
                <div class="bx-calc-total"><span>Valor líquido</span><strong>${fmtBRL(liquido)}</strong></div>
                <p class="muted" style="font-size:11px;margin-top:8px">
                    O que chega às mãos do funcionário, já descontado o INSS. Não desconta IRRF —
                    o sistema não lança essa retenção, então este ainda não é o líquido exato do holerite.
                </p>
            </div>`,
        footer: `<button class="btn btn-secondary" data-cancel>Fechar</button>`
    });
    m.footer.querySelector('[data-cancel]').onclick = m.close;
}

// ---- 13º Salário ----
// Reusa situacao13Func (utils.js) — o mesmo motor da aba Lançamentos → 13º Salário — e o
// HTML de janelaDecimo (decimo.js). Filtro de ano com navegação ‹ › (mesmo padrão da aba
// Pagamentos): mostra a competência do ano selecionado, começando no ano corrente, ciclando
// só entre anos com competência aplicável.
async function fdDecimo13(f, box) {
    box.innerHTML = '<div class="loading-center"><div class="spinner-dark"></div></div>';
    const podeEditar = can('editar_lancamentos');
    const anoCorrente = new Date().getFullYear();

    const [demissoes, decimos, bhFechamentos, bhQuitacoes, extras, params, folha] = await Promise.all([
        DB.getAll(PATHS.demissoes), DB.getAll(PATHS.decimos),
        DB.getAll(PATHS.bancoHorasFechamentos), DB.getAll(PATHS.bancoHorasQuitacoes), DB.getAll(PATHS.extraBanco),
        DB.getObj(PATHS.parametros),
        // Âncora do 13º: primeiro mês de folha publicado para o funcionário — ver
        // anoAncoraFolha (utils.js). Sem isso, um funcionário antigo cadastrado com dados
        // retroativos mostraria pendência de anos que a empresa nunca gerenciou no sistema.
        DB.getObj(PATHS.folha)
    ]);

    // Mesmas chaves de decimoCtx() (decimo.js), montadas aqui para não depender de
    // decimoState estar carregado só para LER a situação do funcionário.
    const ctx = {
        funcionarios: funcState.funcionarios, cargos: funcState.cargos,
        ausencias: funcState.ausencias, demissoes, decimos, params: params || {}, folha: folha || {},
        mediaHe13: (ff, ano) => {
            if (!feriasParams.mediaHe) return 0;
            return mediaHeFerias(ff.id, `${ano}-01-01`, `${ano}-12-31`, bhFechamentos, extras, bhQuitacoes).media;
        }
    };

    // Anos candidatos: da admissão até o ano corrente, mais qualquer ano com parcela lançada
    // (cobre o caso de o funcionário ter saído antes do ano corrente). Só entram na navegação
    // os que de fato têm competência aplicável — situacao13Func null (estagiário, admissão
    // futura) não é um ano "anterior"/"próximo" válido.
    const anosCand = new Set([anoCorrente]);
    if (f.admissao) for (let a = Number(f.admissao.slice(0, 4)); a <= anoCorrente; a++) anosCand.add(a);
    decimos.filter(d => d.funcionarioId === f.id).forEach(d => anosCand.add(Number(d.ano)));
    const anosComSit = [...anosCand].filter(Boolean)
        .sort((a, b) => b - a)
        .map(a => ({ ano: a, sit: situacao13Func(f, a, ctx) }))
        .filter(x => x.sit);

    if (!anosComSit.length) {
        box.innerHTML = emptyState({
            icon: 'gift', title: 'Sem 13º salário',
            text: 'Este funcionário não tem direito a 13º (estagiário) ou ainda não tem competência aplicável.'
        });
        return;
    }

    const anosDisp = anosComSit.map(x => x.ano);
    if (!anosDisp.includes(fdDecimo13Ano)) fdDecimo13Ano = anosDisp.includes(anoCorrente) ? anoCorrente : anosDisp[0];

    const heroHtml = s => {
        const e = DECIMO_ESTADOS[s.estado];
        const mesesHtml = s.meses.map(m => {
            const cls = m.conta ? 'is-on' : m.dias > 0 ? 'is-parcial' : 'is-off';
            return `<div class="dc-mes ${cls}"><span>${MESES[m.mes]}</span><em>${m.dias === 0 ? '—' : m.conta ? '1/12' : '0'}</em></div>`;
        }).join('');
        return `
            <div class="dc-hero ${s.estado === 'rescisao' || s.saldo > 0.01 ? 'is-critico' : 'is-ok'}">
                <div class="dc-hero-top">
                    <div>
                        <span class="dc-lbl">13º devido — ${s.ano}</span>
                        <div class="dc-saldo">${fmtBRL(s.devido)}</div>
                        <div class="dc-decomp">${s.avos}/12 avos${s.pagoTotal ? ` · ${fmtBRL(s.pagoTotal)} já pago` : ''}</div>
                    </div>
                    <div class="dc-hero-right">
                        <span class="badge ${e.cls}">${e.txt}</span>
                        ${s.saldo > 0.01 ? `<div class="dc-passivo">${fmtBRL(Math.max(0, s.saldo))}<span>saldo a pagar</span></div>` : ''}
                    </div>
                </div>
                ${s.semDireito ? `<p class="dc-desc">Sem direito a 13º proporcional — desligado por ${escapeHtml(s.motivoSemDireito)} (Súmula 14 TST).</p>` : ''}
            </div>
            <div class="dc-sec">
                <div class="dc-sec-tit">${icon('calendar')} Avos da competência</div>
                <div class="dc-meses">${mesesHtml}</div>
            </div>
            <div class="dc-sec">
                <div class="dc-sec-tit">${icon('money')} Composição da base</div>
                <div class="bx-calc">
                    <div class="bx-calc-grid">
                        <span>Salário</span><strong>${fmtBRL(s.salario)}</strong>
                        ${s.insalubridade ? `<span>+ Insalubridade</span><strong>${fmtBRL(s.insalubridade)}</strong>` : ''}
                        ${s.periculosidade ? `<span>+ Periculosidade</span><strong>${fmtBRL(s.periculosidade)}</strong>` : ''}
                        ${s.mediaHe ? `<span>+ Média de HE</span><strong>${fmtBRL(s.mediaHe)}</strong>` : ''}
                        <span>= Base</span><strong>${fmtBRL(s.base)}</strong>
                        ${s.adiantamentoFerias ? `<span>− Adiantado nas férias</span><strong>−${fmtBRL(s.adiantamentoFerias)}</strong>` : ''}
                        ${s.pagoParcelas ? `<span>− Parcelas lançadas</span><strong>−${fmtBRL(s.pagoParcelas)}</strong>` : ''}
                    </div>
                    <div class="bx-calc-total"><span>Saldo a pagar</span><strong>${fmtBRL(Math.max(0, s.saldo))}</strong></div>
                </div>
            </div>
            <div class="dc-sec">
                <div class="dc-sec-tit">${icon('table')} Parcelas lançadas</div>
                ${s.parcelas.length ? `
                <div class="dc-lista">
                    ${s.parcelas.map(p => `
                        <div class="dc-item is-link" data-parc="${p.id}">
                            <span class="dc-item-ico">${icon('gift')}</span>
                            <div class="grow">
                                <strong>${escapeHtml(decimoTipo(p.tipo).label)}</strong>
                                <div class="muted">Pago em ${fmtDate(p.data)}${p.obs ? ` — ${escapeHtml(p.obs)}` : ''}</div>
                            </div>
                            <strong class="num">${fmtBRL(p.bruto)}</strong>
                            ${icon('chevronRight')}
                        </div>`).join('')}
                </div>` : `<div class="dc-vazio">${icon('gift')} Nenhuma parcela lançada nesta competência.</div>`}
            </div>
            ${podeEditar && !s.semDireito && s.saldo > 0.01 ? `
            <div class="flex" style="gap:8px;margin-bottom:18px">
                <button class="btn btn-primary btn-sm" data-lancar-ano="${s.ano}">${icon('plus')} Lançar parcela</button>
            </div>` : ''}`;
    };

    const abrirDecimoForm = async (seed) => {
        // formDecimo (decimo.js) lê decimoState internamente (funcionários, contexto) — sem
        // carregar antes, abrir pela ficha (fora de Lançamentos) apresentaria a lista vazia.
        if (typeof decimoState !== 'undefined' && !decimoState.carregado) await loadDecimoBase();
        formDecimo(seed);
    };

    const render = () => {
        const idxAno = anosDisp.indexOf(fdDecimo13Ano);
        const temAnterior = idxAno < anosDisp.length - 1;   // existe ano mais antigo com competência
        const temProximo = idxAno > 0;                      // existe ano mais recente com competência
        const sit = anosComSit.find(x => x.ano === fdDecimo13Ano).sit;

        box.innerHTML = `
            <div style="display:flex;justify-content:flex-end;margin-bottom:14px">
                <div class="month-nav">
                    ${temAnterior ? `<button id="fdDec13Prev" title="Ano anterior com competência">‹</button>` : ''}
                    <span class="month-label">${fdDecimo13Ano}</span>
                    ${temProximo ? `<button id="fdDec13Next" title="Próximo ano com competência">›</button>` : ''}
                </div>
            </div>
            ${heroHtml(sit)}`;

        const bLancar = box.querySelector('[data-lancar-ano]');
        if (bLancar) bLancar.onclick = () => abrirDecimoForm({ funcionarioId: f.id, ano: Number(bLancar.dataset.lancarAno) });
        box.querySelectorAll('[data-parc]').forEach(el => {
            el.onclick = () => {
                const p = sit.parcelas.find(x => x.id === el.dataset.parc);
                if (p) abrirDecimoForm(p);
            };
        });

        const btnPrev = box.querySelector('#fdDec13Prev');
        if (btnPrev) btnPrev.onclick = () => { fdDecimo13Ano = anosDisp[idxAno + 1]; render(); };
        const btnNext = box.querySelector('#fdDec13Next');
        if (btnNext) btnNext.onclick = () => { fdDecimo13Ano = anosDisp[idxAno - 1]; render(); };
    };
    render();
}

// ---- Férias ----
// Reusa situacaoFeriasFunc/competenciasFerias/tetoDiasFerias (utils.js) e o HTML de
// detalheFeriasFunc (lancamentos.js) — mesmo motor da Programação de férias — num painel
// único (competência vigente + histórico), sem a divisão em abas daquela janela.
// funcState.ausencias já está carregado (drawerFuncionario/render da lista): nenhum fetch novo.
function fdFeriasAba(f, box) {
    const ausencias = funcState.ausencias;
    const sit = situacaoFeriasFunc(f, ausencias);
    const publicadas = ausencias
        .filter(a => a.funcionarioId === f.id && a.tipo === TIPO_FERIAS)
        .sort((a, b) => (b.inicio || '').localeCompare(a.inicio || ''));

    if (!sit && !publicadas.length) {
        box.innerHTML = emptyState({
            icon: 'sun', title: 'Sem férias',
            text: f.demissao ? 'Funcionário desligado — sem ciclo de férias em aberto.' : 'Nenhum período aquisitivo aplicável ainda.'
        });
        return;
    }

    const podeEditar = can('editar_lancamentos');
    const comps = sit ? competenciasFerias(f, ausencias) : [];
    const fer = feriasVigente(f.id, ausencias);
    const t = sit ? tetoDiasFerias(f, ausencias) : null;
    const diasDevidos = comps.reduce((acc, c) => acc + c.emDobra, 0);

    const ESTADO = {
        vencida:  { cls: 'badge-danger',  txt: 'Vencida' },
        vigente:  { cls: 'badge-info',    txt: 'Vigente' },
        formacao: { cls: 'badge-neutral', txt: 'Em formação' },
        gozada:   { cls: 'badge-success', txt: 'Gozada' }
    };

    box.innerHTML = `
        ${sit ? `
        <div class="df-hero ${sit.status === 'vencida' ? 'is-vencida' : sit.status === 'critica' ? 'is-critica' : 'is-ok'}">
            <div class="df-hero-top">
                <div>
                    <span class="dc-lbl">${sit.status === 'aquisitivo' ? 'Direito em formação' : 'Dias em aberto'}</span>
                    <div class="df-saldo">${t.max}<small>dias</small></div>
                    <div class="df-decomp">${t.competencias} competência${t.competencias > 1 ? 's' : ''} em aberto${t.vencidas ? ` · <strong class="txt-danger">${t.vencidas} atrasada${t.vencidas > 1 ? 's' : ''}</strong>` : ''}</div>
                </div>
                <div class="dc-hero-right">
                    <span class="badge ${FERIAS_STATUS[sit.status].cls}">${escapeHtml(sit.label)}</span>
                    ${fer ? `<div class="df-emcurso">${icon('sun')} De férias até ${fmtDate(fer.retorno)}</div>` : ''}
                </div>
            </div>
            <p class="dc-desc">${escapeHtml(sit.desc)}</p>
            ${diasDevidos ? `<div class="df-dobra">${icon('alert')} <span><strong>${diasDevidos} dias</strong> já vencidos são devidos <strong>em dobro</strong> (art. 137 CLT).</span></div>` : ''}
            ${f.feriasBase ? `<div class="df-nota">${icon('info')} <span>Controle reancorado em <strong>${fmtDate(f.feriasBase)}</strong> (funcionário antigo). Ciclos anteriores a essa data não são calculados — a admissão real é ${fmtDate(f.admissao)}.</span></div>` : ''}
        </div>
        ${podeEditar && !fer ? `<div class="flex" style="gap:8px;margin-bottom:18px"><button class="btn btn-primary btn-sm" id="fdFerLancar">${icon('plus')} Lançar férias</button></div>` : ''}
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
        </div>` : `<div class="dc-vazio">${icon('sun')} ${f.demissao ? 'Funcionário desligado — sem ciclo de férias em aberto.' : 'Sem período aquisitivo aplicável.'}</div>`}

        <div class="dc-sec">
            <div class="dc-sec-tit">${icon('clock')} Histórico de férias gozadas <span class="dc-sec-badge">${publicadas.length}</span></div>
            ${publicadas.length ? `
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
            </div>` : `<div class="dc-vazio">${icon('sun')} Nenhuma férias publicada ainda.</div>`}
        </div>`;

    const bLancar = box.querySelector('#fdFerLancar');
    if (bLancar) bLancar.onclick = () => formAusencia({ funcionarioId: f.id }, true, sit);

    box.querySelectorAll('[data-lanc]').forEach(el => {
        el.onclick = () => {
            const a = publicadas.find(x => x.id === el.dataset.lanc)
                || comps.flatMap(c => c.lancamentos).find(x => x.id === el.dataset.lanc);
            if (a) detalheAusencia(a, excluirFerias, () => fdDadosRefresh && fdDadosRefresh());
        };
    });
}

// ---- Benefícios do funcionário ----
function custoBeneficioFunc(fb) {
    const b = funcState.beneficios.find(x => x.id === fb.beneficioId);
    if (!b) return 0;
    return (Number(b.custoTitular) || 0) + (fb.dependentes || []).length * (Number(b.custoDependente) || 0);
}

function fdBeneficios(f, cont) {
    const adesoes = f.beneficios || [];
    const podeEditar = can('editar_funcionarios');
    const total = adesoes.reduce((s, fb) => s + custoBeneficioFunc(fb), 0);
    const descontoDe = fb => {
        const b = funcState.beneficios.find(x => x.id === fb.beneficioId);
        return custoBeneficioFunc(fb) * (Number(b?.descontoPct) || 0) / 100;
    };
    const descontoTotal = adesoes.reduce((s, fb) => s + descontoDe(fb), 0);

    cont.innerHTML = `
        ${podeEditar ? `<button class="btn btn-secondary btn-sm" id="fbAdd" style="margin-bottom:12px">${icon('plus')} Adicionar benefício</button>` : ''}
        ${adesoes.length ? adesoes.map((fb, i) => {
            const b = funcState.beneficios.find(x => x.id === fb.beneficioId);
            const deps = fb.dependentes || [];
            return `
            <div class="benef-item">
                <div class="benef-top">
                    <span style="color:var(--accent)">${icon('gift')}</span>
                    <div class="benef-nome">${escapeHtml(b?.nome || 'Benefício removido')}<div class="muted" style="font-size:11.5px;font-weight:500">${escapeHtml(b?.tipo || '')}${b?.descontoPct ? ` · funcionário paga ${b.descontoPct}%` : ' · empresa paga 100%'}</div></div>
                    ${can('ver_financeiro') ? `<strong>${fmtBRL(custoBeneficioFunc(fb))}/mês${descontoDe(fb) ? `<div class="muted" style="font-size:11px;font-weight:500;text-align:right">− ${fmtBRL(descontoDe(fb))} desc.</div>` : ''}</strong>` : ''}
                    ${podeEditar ? `<button class="btn-icon" data-edit="${i}">${icon('edit')}</button><button class="btn-icon danger" data-del="${i}">${icon('trash')}</button>` : ''}
                </div>
                ${deps.length ? `<div class="benef-deps">${deps.map(dp => `<span class="badge badge-neutral">${icon('user')} ${escapeHtml(dp)}</span>`).join('')}</div>` : ''}
            </div>`;
        }).join('') : `<p class="muted">Nenhum benefício cadastrado para este funcionário.</p>`}
        ${adesoes.length && can('ver_financeiro') ? `
        <div class="mt-16" style="border-top:1px solid var(--border);padding-top:12px">
            <div class="flex-between"><span class="text-2">Custo total do pacote</span><strong>${fmtBRL(total)}</strong></div>
            <div class="flex-between"><span class="text-2">Desconto do funcionário (coparticipação)</span><strong style="color:var(--danger)">− ${fmtBRL(descontoTotal)}</strong></div>
            <div class="flex-between"><strong>Custo da empresa</strong><strong style="color:var(--accent)">${fmtBRL(total - descontoTotal)}</strong></div>
        </div>` : ''}`;

    if (podeEditar) {
        const btnAdd = cont.querySelector('#fbAdd');
        if (btnAdd) btnAdd.onclick = () => formBeneficioFunc(f, null);
        cont.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => formBeneficioFunc(f, Number(b.dataset.edit)));
        cont.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
            const i = Number(b.dataset.del);
            const ben = funcState.beneficios.find(x => x.id === adesoes[i].beneficioId);
            if (await confirmDialog({ title: 'Remover benefício', message: `Remover <strong>${escapeHtml(ben?.nome || 'benefício')}</strong> de ${escapeHtml(f.nome)}?`, confirmText: 'Remover', danger: true })) {
                const novos = adesoes.filter((_, idx) => idx !== i);
                await DB.save(PATHS.funcionarios, f.id, { beneficios: novos });
                f.beneficios = novos;
                toast('Benefício removido.');
                fdBeneficios(f, cont);
            }
        });
    }
}

function formBeneficioFunc(f, idx) {
    const isEdit = idx !== null;
    const adesoes = f.beneficios || [];
    const fb = isEdit ? adesoes[idx] : null;
    const disponiveis = funcState.beneficios.filter(b =>
        isEdit ? true : !adesoes.some(a => a.beneficioId === b.id));

    if (!disponiveis.length) return toast('Nenhum benefício disponível. Cadastre em Configurações → Benefícios.', 'info');

    const m = openModal({
        title: isEdit ? 'Editar benefício do funcionário' : 'Adicionar benefício',
        body: `
            <div class="field"><label>Benefício <span class="req">*</span></label>
                <select class="select" id="fbfBen" ${isEdit ? 'disabled' : ''}>
                    ${disponiveis.map(b => `<option value="${b.id}" ${fb?.beneficioId === b.id ? 'selected' : ''}>${escapeHtml(b.nome)} (${escapeHtml(b.tipo || '')})</option>`).join('')}
                </select>
            </div>
            <div class="field"><label>Dependentes</label>
                <textarea class="input" id="fbfDeps" rows="3" placeholder="Um nome por linha (deixe vazio se não houver)">${(fb?.dependentes || []).join('\n')}</textarea>
                <div class="field-hint" id="fbfCusto"></div>
            </div>`,
        footer: ''
    });

    const sel = m.body.querySelector('#fbfBen');
    const depsEl = m.body.querySelector('#fbfDeps');
    const custoEl = m.body.querySelector('#fbfCusto');
    const atualizaCusto = () => {
        const b = funcState.beneficios.find(x => x.id === sel.value);
        const nDeps = depsEl.value.split('\n').map(s => s.trim()).filter(Boolean).length;
        if (b && can('ver_financeiro')) {
            const total = (Number(b.custoTitular) || 0) + nDeps * (Number(b.custoDependente) || 0);
            custoEl.textContent = `Custo mensal: ${fmtBRL(b.custoTitular)} titular${nDeps ? ` + ${nDeps} × ${fmtBRL(b.custoDependente)} dependente(s)` : ''} = ${fmtBRL(total)}`;
        } else custoEl.textContent = '';
    };
    sel.onchange = atualizaCusto;
    depsEl.addEventListener('input', atualizaCusto);
    atualizaCusto();

    m.footer.innerHTML = `
        <button class="btn btn-secondary" data-cancel>Cancelar</button>
        <button class="btn btn-primary" data-save>${isEdit ? 'Salvar' : 'Adicionar'}</button>`;
    m.footer.querySelector('[data-cancel]').onclick = m.close;
    m.footer.querySelector('[data-save]').onclick = async () => {
        const dependentes = depsEl.value.split('\n').map(s => s.trim()).filter(Boolean);
        const novo = { beneficioId: sel.value, dependentes };
        const novos = isEdit ? adesoes.map((a, i) => i === idx ? novo : a) : [...adesoes, novo];
        await DB.save(PATHS.funcionarios, f.id, { beneficios: novos });
        f.beneficios = novos;
        toast(isEdit ? 'Benefício atualizado.' : 'Benefício adicionado.');
        m.close();
        const cont = document.querySelector('#fdContent');
        if (cont) fdBeneficios(f, cont);
    };
}

// Reabre a ficha em Documentos, na mesma sub-aba — o drawer é único, então detalhes
// abertos a partir daqui precisam devolver o usuário ao contexto de onde saiu.
function fdVoltarDocumentos(f, aba) {
    fdDocAba = aba;
    drawerFuncionario(f, 'documentos');
}

// ---- Documentos: uma sub-aba por tipo ----
// O tipo deixou de ser campo do formulário: cada aba publica no seu próprio tipo. Escolher
// "Contrato" num select depois de já ter clicado em "Contrato" era pedir a mesma informação
// duas vezes — e permitia divergir (estar na aba X e salvar como Y).
async function fdDocumentos(f, cont) {
    cont.innerHTML = '<div class="loading-center"><div class="spinner-dark"></div></div>';
    // ASO vem de rh_asos (fonte única, compartilhada com Lançamentos → ASO)
    const asos = (await DB.getAll(PATHS.asos))
        .filter(a => a.funcionarioId === f.id)
        .sort((a, b) => (b.data || '').localeCompare(a.data || ''));

    const docs = f.documentos || [];
    const contaDe = ab => ab.aso ? asos.length : docs.filter(d => fdDocTipoDe(d) === ab.id).length;

    cont.innerHTML = `
        <div class="tabs tabs-sub" id="fdDocSubs">${FD_DOC_ABAS.map(ab => `
            <div class="tab" data-sub="${escapeHtml(ab.id)}">${escapeHtml(ab.label)}${contaDe(ab) ? ` <span class="tab-count">${contaDe(ab)}</span>` : ''}</div>`).join('')}
        </div>
        <div class="mt-12" id="fdDocBody"></div>`;

    const box = cont.querySelector('#fdDocBody');
    const subs = cont.querySelectorAll('#fdDocSubs .tab');
    const setSub = id => {
        fdDocAba = id;
        subs.forEach(t => t.classList.toggle('active', t.dataset.sub === id));
        const ab = FD_DOC_ABAS.find(x => x.id === id);
        (ab?.aso ? fdDocAso : fdDocLista)(f, box, id, asos);
    };
    subs.forEach(t => t.onclick = () => setSub(t.dataset.sub));
    setSub(FD_DOC_ABAS.some(a => a.id === fdDocAba) ? fdDocAba : 'aso');
}

// ---- Sub-aba ASO: mesma fonte e mesmo formulário da aba ASO em Lançamentos ----
function fdDocAso(f, box, _id, asos) {
    // editar_lancamentos (não editar_funcionarios): o ASO é um lançamento, e quem pode
    // lançá-lo na aba ASO tem de poder lançá-lo aqui — é o mesmo registro.
    const podeEditar = can('editar_lancamentos');
    const medico = can('ver_medico');
    const cargo = cargoDe(f);
    const sit = situacaoAsoFunc(f, asos, cargo);

    // Cabeçalho de situação: é o que a ficha precisa responder — este colaborador pode
    // exercer a função hoje? Some para desligado/admissão futura (sit = null).
    // Cargo isento tem cabeçalho próprio: aqui o silêncio seria lido como "sem dados",
    // quando na verdade é "não há exigência".
    const cab = !sit && asoIsento(cargo) ? `
        <div class="fd-aso-sit">
            <span class="prog-dot st-ok"></span>
            <div class="grow">
                <strong>ASO não se aplica a este cargo</strong>
                <div class="muted" style="font-size:11.5px">O cargo ${escapeHtml(cargo?.nome || '')} está marcado como "Não se aplica" em Configurações → Cargos: sem exame periódico obrigatório, sem alerta de vencimento. Exames lançados aqui continuam registrados.</div>
            </div>
        </div>` : sit ? `
        <div class="fd-aso-sit fd-aso-${sit.status}">
            <span class="prog-dot ${ASO_STATUS[sit.status].dot}"></span>
            <div class="grow">
                <strong>${escapeHtml(sit.label)}</strong>
                <div class="muted" style="font-size:11.5px">${escapeHtml(sit.desc)}</div>
            </div>
        </div>` : '';

    box.innerHTML = `
        ${cab}
        ${podeEditar ? `<button class="btn btn-secondary btn-sm" id="asoAdd" style="margin:12px 0">${icon('plus')} Lançar ASO</button>` : ''}
        ${!medico ? `<p class="muted" style="font-size:11.5px;margin-bottom:8px">${icon('lock')} Resultado, restrições e laudo exigem a permissão "Ver dados médicos".</p>` : ''}
        ${asos.length ? `<div class="hist-list">${asos.map((a, i) => `
            <div class="hist-row" data-i="${i}" tabindex="0" role="button">
                <div class="hist-main">
                    <div class="hist-top">
                        <span class="hist-per">${escapeHtml(a.tipo || 'ASO')}</span>
                        <span class="hist-dias">${fmtDate(a.data)}</span>
                    </div>
                    <div class="hist-sub">
                        ${medico && a.resultado
                            ? `<span class="badge ${a.resultado === 'Inapto' ? 'badge-danger' : a.resultado === 'Apto com restrições' ? 'badge-warning' : 'badge-success'}">${escapeHtml(a.resultado)}</span>`
                            : `<span class="muted" style="font-size:11.5px">${icon('lock')} restrito</span>`}
                        ${medico && anexosDe(a).length ? `<span class="hist-clip" title="Laudo anexado">${icon('paperclip')}</span>` : ''}
                    </div>
                </div>
                <span class="hist-go">${icon('chevronRight')}</span>
            </div>`).join('')}</div>`
            : '<p class="muted">Nenhum ASO registrado para este colaborador.</p>'}`;

    const btn = box.querySelector('#asoAdd');
    // Abre o MESMO formulário da aba ASO, já com o funcionário fixado. Ao fechar, devolve
    // à ficha — senão o usuário cairia em Lançamentos, que não é de onde ele veio.
    if (btn) btn.onclick = () => formAso({ funcionarioId: f.id }, sit, () => fdVoltarDocumentos(f, 'aso'));
    box.querySelectorAll('.hist-row').forEach(row => {
        const a = asos[Number(row.dataset.i)];
        const abrir = () => detalheAso(a, () => fdVoltarDocumentos(f, 'aso'));
        row.onclick = abrir;
        row.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } };
    });
}

// ---- Sub-abas de documento comum: lista filtrada pelo tipo da aba ----
function fdDocLista(f, box, tipo) {
    const docs = f.documentos || [];
    const podeEditar = can('editar_funcionarios');
    // Índice no array original: o save/exclusão precisa dele, não do índice do filtro
    const daAba = docs.map((d, i) => ({ d, i })).filter(x => fdDocTipoDe(x.d) === tipo);

    box.innerHTML = `
        ${podeEditar ? `<button class="btn btn-secondary btn-sm" id="docAdd" style="margin-bottom:12px">${icon('plus')} Adicionar ${escapeHtml(tipo.toLowerCase())}</button>` : ''}
        ${daAba.length ? daAba.map(({ d: doc, i }) => {
            const trein = doc.treinamentoId ? funcState.treinamentos.find(t => t.id === doc.treinamentoId) : null;
            // Documento espelhado de uma liberação coletiva: a fonte da verdade é a liberação
            // (mesmo anexo compartilhado entre todos os alcançados), então editar ou excluir
            // por aqui deixaria a prova do acordo divergente entre as pessoas. Só se mexe nele
            // de volta na liberação, em Lançamentos → Banco de horas → Liberações.
            const daLiberacao = !!doc.origemLiberacaoId;
            return `
            <div class="benef-item">
                <div class="benef-top">
                    ${doc.anexo ? `<span data-doc-open="${i}" class="anexo-chip">${anexoIcone(doc.anexo.formato, 34)}</span>` : anexoIcone('outro', 34)}
                    <div class="benef-nome">
                        ${escapeHtml(doc.nome || 'Documento')}
                        <div class="muted" style="font-size:11.5px;font-weight:500">
                            ${trein ? `${escapeHtml(trein.nome)} · ` : ''}${fmtDate(doc.data)}
                        </div>
                        ${doc.descricao ? `<div class="text-2" style="font-size:12px;font-weight:400;margin-top:2px">${escapeHtml(doc.descricao)}</div>` : ''}
                    </div>
                    ${doc.anexo ? `<button class="btn btn-secondary btn-sm" data-doc-open="${i}">Abrir</button>` : '<span class="muted" style="font-size:11.5px">sem anexo</span>'}
                    ${daLiberacao ? `<span class="muted" style="font-size:11.5px" title="Vinculado a uma liberação coletiva — edite ou exclua pela liberação, em Lançamentos → Banco de horas → Liberações">${icon('lock')}</span>`
                        : podeEditar ? `<button class="btn-icon" data-edit="${i}">${icon('edit')}</button><button class="btn-icon danger" data-del="${i}">${icon('trash')}</button>` : ''}
                </div>
            </div>`;
        }).join('') : `<p class="muted">Nenhum documento nesta seção.</p>`}`;

    box.querySelectorAll('[data-doc-open]').forEach(el =>
        el.addEventListener('click', () => abrirAnexo(docs[Number(el.dataset.docOpen)].anexo)));

    if (!podeEditar) return;
    const btnAdd = box.querySelector('#docAdd');
    // O tipo vem da aba, não de um select no form
    if (btnAdd) btnAdd.onclick = () => formDocumento(f, null, tipo);
    box.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => formDocumento(f, Number(b.dataset.edit), tipo));
    box.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
        const i = Number(b.dataset.del);
        if (await confirmDialog({ title: 'Excluir documento', message: `Excluir <strong>${escapeHtml(docs[i].nome || 'documento')}</strong>?${docs[i].anexo ? ' O anexo também será excluído.' : ''}`, confirmText: 'Excluir', danger: true })) {
            await excluirAnexoRemoto(docs[i].anexo);
            const novos = docs.filter((_, idx) => idx !== i);
            await DB.save(PATHS.funcionarios, f.id, { documentos: novos });
            f.documentos = novos;
            toast('Documento excluído.');
            const cont = document.querySelector('#fdContent');
            if (cont) fdDocumentos(f, cont);
        }
    });
}

// `tipo` vem da sub-aba de onde o usuário clicou — não há select de tipo no form.
function formDocumento(f, idx, tipo) {
    const isEdit = idx !== null;
    const docs = f.documentos || [];
    const doc = isEdit ? docs[idx] : null;
    const tipoDoc = tipo || doc?.tipo || 'Outro';
    const ehCertificado = tipoDoc.startsWith('Certificado');
    const treinosDoFunc = funcState.treinamentos.filter(t => (t.participantes || []).includes(f.id));

    const m = openModal({
        title: `${isEdit ? 'Editar' : 'Adicionar'} — ${tipoDoc}`,
        body: `
            <div class="form-row">
                <div class="field"><label>Nome do documento <span class="req">*</span></label>
                    <input class="input" id="fdcNome" placeholder="${ehCertificado ? 'Ex: Certificado NR-35' : 'Ex: Contrato assinado'}" value="${escapeHtml(doc?.nome || '')}">
                </div>
                <div class="field"><label>Data</label><input class="input" id="fdcData" type="date" value="${doc?.data || hoje()}"></div>
            </div>
            ${ehCertificado ? `
            <div class="field"><label>Treinamento vinculado</label>
                <select class="select" id="fdcTreino">
                    <option value="">— Nenhum —</option>
                    ${treinosDoFunc.map(t => `<option value="${t.id}" ${doc?.treinamentoId === t.id ? 'selected' : ''}>${escapeHtml(t.nome)} (${fmtDate(t.inicio)})</option>`).join('')}
                </select>
            </div>` : ''}
            <div class="field"><label>Observação</label><textarea class="input" id="fdcDesc" rows="2">${escapeHtml(doc?.descricao || '')}</textarea></div>
            <div class="field">
                <label>Anexo</label>
                <div id="fdcAnexo"></div>
            </div>`,
        footer: ''
    });

    const anexoCtl = initAnexoField(m.body.querySelector('#fdcAnexo'), doc?.anexo || null);

    m.footer.innerHTML = `
        <button class="btn btn-secondary" data-cancel>Cancelar</button>
        <button class="btn btn-primary" data-save>${isEdit ? 'Salvar' : 'Adicionar'}</button>`;
    m.footer.querySelector('[data-cancel]').onclick = m.close;
    const btnSave = m.footer.querySelector('[data-save]');
    btnSave.onclick = async () => {
        const nome = m.body.querySelector('#fdcNome').value.trim();
        if (!nome) return toast('Informe o nome do documento.', 'error');
        btnSave.disabled = true;
        btnSave.innerHTML = '<span class="spinner"></span> Salvando...';
        try {
            const { anexos, removidos } = await anexoCtl.getAnexos();
            const novo = {
                tipo: tipoDoc,                    // vem da aba, não de um select
                nome,
                data: m.body.querySelector('#fdcData').value || hoje(),
                descricao: m.body.querySelector('#fdcDesc').value.trim(),
                treinamentoId: ehCertificado ? (m.body.querySelector('#fdcTreino').value || null) : null,
                anexo: anexos[0] || null
            };
            const novos = isEdit ? docs.map((d, i) => i === idx ? novo : d) : [...docs, novo];
            await DB.save(PATHS.funcionarios, f.id, { documentos: novos });
            await excluirAnexoRemoto(removidos);
            f.documentos = novos;
            toast(isEdit ? 'Documento atualizado.' : 'Documento adicionado.');
            m.close();
            const cont = document.querySelector('#fdContent');
            if (cont) fdDocumentos(f, cont);
        } catch (e) {
            toast(e.message || 'Erro ao salvar o documento.', 'error');
        } finally {
            btnSave.disabled = false;
            btnSave.innerHTML = isEdit ? 'Salvar' : 'Adicionar';
        }
    };
}

// ---- Horas (banco de horas do funcionário) ----
// Reusa inteiramente o motor de bancohoras.js/utils.js (cicloBhFunc, historicoCiclosBh,
// passivoBh) — a ficha é só mais um lugar que LÊ o mesmo banco de horas da aba Lançamentos.
// Nenhuma regra nova aqui: mesmo ciclo, mesmo saldo, mesmas janelas de detalhe/quitação, só
// que no contexto de "este funcionário" em vez de "todos os funcionários".
//
// Duas sub-abas: "Ciclo vigente" (o que está correndo e pede ação) e "Ciclos anteriores"
// (histórico fechado/liquidado) — misturados numa lista só, o card do ciclo em curso
// (o que importa agora) ficava perdido no meio de ciclos que já foram resolvidos.
async function fdHoras(f, cont) {
    cont.innerHTML = '<div class="loading-center"><div class="spinner-dark"></div></div>';
    const [banco, fechamentos, quitacoes] = await Promise.all([
        DB.getObj(PATHS.bancoHoras),
        DB.getAll(PATHS.bancoHorasFechamentos),
        DB.getAll(PATHS.bancoHorasQuitacoes)
    ]);
    // A grade/quitação de bancohoras.js lê os cargos de lancState — fora daquela aba (ex.:
    // entrando direto pela lista de funcionários) lancState.cargos pode estar vazio, e o
    // valor de hora saía zerado sem ninguém perceber. funcState já tem os cargos carregados.
    if (typeof lancState !== 'undefined' && !lancState.cargos?.length && funcState.cargos?.length) {
        lancState.cargos = funcState.cargos;
    }

    const sit = cicloBhFunc(f, banco, fechamentos, null, quitacoes, cargoDe(f));
    const hist = historicoCiclosBh(f, banco, fechamentos, null, quitacoes).slice().reverse();

    if (bhSemCiclo(sit)) {
        cont.innerHTML = emptyState({
            icon: sit?.status === 'vedado' ? 'lock' : 'clock',
            title: sit?.status === 'vedado' ? 'Banco de horas vedado' : 'Sem banco de horas',
            text: sit?.desc || 'Nenhum saldo lançado. O ciclo nasce no primeiro mês publicado na Grade mensal (Lançamentos → Banco de horas).'
        });
        return;
    }

    const anteriores = hist.filter(c => !c.corrente);

    const subs = [
        { id: 'vigente', label: 'Ciclo vigente' },
        { id: 'anteriores', label: 'Ciclos anteriores', n: anteriores.length }
    ];

    cont.innerHTML = `
        <div class="tabs tabs-sub" id="fdHorasSubs">${subs.map(s => `
            <div class="tab" data-sub="${s.id}">${s.label}${s.n ? ` <span class="tab-count">${s.n}</span>` : ''}</div>`).join('')}
        </div>
        <div class="mt-12" id="fdHorasBody"></div>`;

    const box = cont.querySelector('#fdHorasBody');
    const views = {
        vigente: () => fdHorasVigente(f, box, sit, quitacoes),
        anteriores: () => fdHorasAnteriores(box, anteriores)
    };

    const subEls = cont.querySelectorAll('#fdHorasSubs .tab');
    const setSub = id => {
        fdHorasSub = id;
        subEls.forEach(t => t.classList.toggle('active', t.dataset.sub === id));
        views[id]();
    };
    subEls.forEach(t => t.onclick = () => setSub(t.dataset.sub));
    setSub(views[fdHorasSub] ? fdHorasSub : 'vigente');
}

// ---- Sub-aba: ciclo vigente ----
function fdHorasVigente(f, box, sit, quitacoes) {
    const fin = can('ver_financeiro');
    const podeEditar = can('editar_lancamentos');
    const s = BH_STATUS[sit.status];
    const passivo = passivoBh(sit.acumuladoMin, salarioDoFunc(f), jornadaDe(f));
    const decorridos = Math.min(bhParams.cicloMeses, Math.max(0, mesDiff(sit.inicio, mesHoje()) + 1));
    const pct = Math.max(0, Math.min(100, decorridos / bhParams.cicloMeses * 100));

    // Série do ciclo corrente para o gráfico: um ponto por mês do ciclo, extra/atraso/saldo
    // acumulado — a mesma leitura da barra "Acumulado no ciclo" da grade, mas em curva.
    const mesesCiclo = Array.from({ length: bhParams.cicloMeses }, (_, i) => mesAdd(sit.inicio, i));
    let corrida = 0;
    const extraVals = [], atrasoVals = [], acumVals = [];
    mesesCiclo.forEach(mk => {
        const lanc = sit.meses.find(m => m.mes === mk);
        const q = sit.quitados.some(x => x.mes === mk);
        extraVals.push(lanc ? lanc.extraMin : null);
        atrasoVals.push(lanc ? -lanc.atrasoMin : null);
        if (lanc && !q) corrida += lanc.saldoMin;
        acumVals.push(lanc ? corrida : null);
    });

    box.innerHTML = `
        <div class="dc-hero ${sit.status === 'vencido' ? 'is-vencido' : sit.status === 'critico' || sit.status === 'atencao' ? 'is-critico' : 'is-ok'}">
            <div class="dc-hero-top">
                <div>
                    <span class="dc-lbl">Saldo em aberto</span>
                    <div class="dc-saldo">${fmtHHMM(sit.acumuladoMin)}</div>
                    <div class="dc-decomp">
                        <span class="bh-pos">${fmtHHMM(sit.extraMin)}</span> extra
                        <span class="bh-sep">·</span>
                        <span class="bh-neg">${fmtHHMM(sit.atrasoMin)}</span> atraso
                        ${sit.liberacaoMin ? `<span class="bh-sep">·</span> <span title="Dispensa coletiva por acordo — indescontável">${fmtHHMM(sit.liberacaoMin)} liberação</span>` : ''}
                    </div>
                </div>
                <div class="dc-hero-right">
                    <span class="badge ${s.cls}">${escapeHtml(sit.label)}</span>
                    ${fin && passivo > 0 ? `<div class="dc-passivo" title="Estimativa: saldo × valor-hora × adicional de ${bhParams.adicionalPct}%">${fmtBRL(passivo)}<span>se não compensar</span></div>` : ''}
                </div>
            </div>
            <p class="dc-desc">${escapeHtml(sit.desc)}</p>
        </div>

        <div class="chart-grid chart-grid-full">
            ${chartCard({
                id: 'fdHorasFluxo', titulo: 'Extra × atraso no ciclo corrente',
                sub: `Ciclo ${mesLabel(sit.inicio)} → ${mesLabel(sit.fimMes)} · linha é o acumulado em aberto`,
                total: fmtHHMM(sit.acumuladoMin)
            })}
        </div>

        <div class="dc-sec">
            <div class="dc-sec-tit">${icon('refresh')} Meses do ciclo</div>
            <div class="bh-prog-bar ${sit.status === 'vencido' ? 'is-estourado' : ''}" style="margin-bottom:8px">
                <div class="bh-prog-fill ${sit.status === 'vencido' ? 'is-vencido' : sit.status === 'critico' || sit.status === 'atencao' ? 'is-critico' : ''}" style="width:${pct}%"></div>
            </div>
            <div class="dc-meses">
                ${mesesCiclo.map(mk => {
                    const lanc = sit.meses.find(x => x.mes === mk);
                    const q = sit.quitados.some(x => x.mes === mk);
                    const cls = q ? 'is-quitado' : !lanc ? 'is-vazio' : lanc.saldoMin > 0 ? 'is-pos' : lanc.saldoMin < 0 ? 'is-neg' : 'is-zero';
                    return `
                    <div class="dc-mes ${cls}">
                        <span class="dc-mes-lbl">${mesLabel(mk).split('/')[0]}</span>
                        <span class="dc-mes-val">${lanc ? fmtHHMM(lanc.saldoMin) : '–'}</span>
                        ${q ? `<span class="dc-mes-tag">${icon('lock')}</span>` : ''}
                    </div>`;
                }).join('')}
            </div>
            <div class="dc-datas">
                <span>Início ${fmtDate(sit.inicio + '-01')}</span>
                <span class="${sit.dias != null && sit.dias < 0 ? 'txt-danger' : ''}">${sit.dias == null ? '' : sit.dias < 0 ? `venceu há ${prazoTexto(sit.dias)}` : `${prazoTexto(sit.dias)} restantes`}</span>
                <span>Fecha ${fmtDate(sit.fim)}</span>
            </div>
        </div>

        <div class="dc-sec">
            <div class="dc-sec-tit">${icon('money')} Quitações deste ciclo
                ${sit.quitacoes.length ? `<span class="dc-sec-badge">${fmtHHMM(sit.quitadoMin)}${fin && sit.quitadoValor ? ` · ${fmtBRL(sit.quitadoValor)}` : ''}</span>` : ''}
            </div>
            ${sit.quitacoes.length ? `
            <div class="dc-quits">
                ${sit.quitacoes.map(q => `
                    <div class="dc-quit" data-q="${q.id}">
                        <span class="dc-quit-ico">${icon('check')}</span>
                        <div class="grow">
                            <strong>${fmtHHMM(q.minutos)}</strong> — ${(q.meses || []).map(mesLabel).join(', ')}
                            <div class="muted">${fmtDate(q.data)} · ${escapeHtml(destinoQuitacao(q))}${q.obs ? ` · ${escapeHtml(q.obs)}` : ''}</div>
                        </div>
                        ${fin ? `<strong class="num">${fmtBRL(q.valor)}</strong>` : ''}
                        ${icon('chevronRight')}
                    </div>`).join('')}
            </div>` : `
            <div class="dc-vazio">${icon('info')} Nenhuma hora quitada neste ciclo. O saldo em aberto ainda pode ser compensado com folgas até ${fmtDate(sit.fim)}.</div>`}
        </div>

        ${sit.fechado ? `
        <div class="dc-fech">
            ${icon('check')}
            <div class="grow">
                <strong>Ciclo fechado em ${fmtDate(sit.fechado.data)}</strong>
                <div class="muted">${escapeHtml(sit.fechado.destino)}${fin && sit.fechado.valor ? ` · ${fmtBRL(sit.fechado.valor)}` : ''}${sit.fechado.obs ? ` — ${escapeHtml(sit.fechado.obs)}` : ''}</div>
            </div>
        </div>` : podeEditar && sit.acumuladoMin !== 0 ? `
        <div class="flex" style="gap:8px">
            ${sit.podeFechar
                ? `<button class="btn btn-primary btn-sm" id="fdBhFechar">${icon('check')} Fechar ciclo</button>`
                : `<button class="btn btn-secondary btn-sm" id="fdBhQuitar">${icon('money')} Quitar horas</button>`}
        </div>` : ''}`;

    mkChart('fdHoras', 'fdHorasFluxo', {
        type: 'bar',
        data: {
            labels: mesesCiclo.map(mk => mesLabel(mk).split('/')[0]),
            datasets: [
                dvBarra('Extra', extraVals, dvCor(0)),
                dvBarra('Atraso', atrasoVals, dvCor(3)),
                {
                    type: 'line', label: 'Acumulado em aberto', data: acumVals,
                    borderColor: '#dc2626', borderWidth: 2, pointRadius: 2.5, tension: .3,
                    yAxisID: 'y2', order: 0, spanGaps: true
                }
            ]
        },
        options: dvOpts({
            fmt: 'hhmm', legenda: true,
            extras: {
                scales: {
                    y2: {
                        position: 'right', grid: { display: false },
                        border: { display: false },
                        ticks: { color: '#dc2626', font: { size: 10 }, callback: v => fmtHorasDec(v) }
                    }
                }
            }
        })
    });

    box.querySelectorAll('[data-q]').forEach(el => {
        el.onclick = () => {
            const q = quitacoes.find(x => x.id === el.dataset.q);
            if (q) detalheQuitacao(q);
        };
    });
    const bFechar = box.querySelector('#fdBhFechar');
    if (bFechar) bFechar.onclick = () => formFechamentoBh(f, sit);
    const bQuitar = box.querySelector('#fdBhQuitar');
    if (bQuitar) bQuitar.onclick = () => formQuitacaoBh(f, sit);
}

// ---- Sub-aba: ciclos anteriores (histórico fechado/liquidado) ----
function fdHorasAnteriores(box, anteriores) {
    const fin = can('ver_financeiro');

    if (!anteriores.length) {
        box.innerHTML = emptyState({
            icon: 'clock', title: 'Nenhum ciclo anterior',
            text: 'Este é o primeiro ciclo de banco de horas do funcionário — ainda não há histórico para mostrar.'
        });
        return;
    }

    box.innerHTML = `
        <div class="dc-hist">
            ${anteriores.slice().reverse().map(c => {
                const fech = c.fechamento;
                const pagoFech = fech?.destino === BH_DESTINO_PAGO ? Number(fech.valor) || 0 : 0;
                const estado = fech ? 'fechado' : c.acumuladoMin !== 0 ? 'aberto' : 'zerado';
                const rot = { fechado: 'Fechado', aberto: 'Em aberto', zerado: 'Encerrado sem saldo' }[estado];
                return `
                <div class="dc-hist-item is-${estado}">
                    <div class="dc-hist-per">
                        <strong>${mesLabel(c.inicio)} → ${mesLabel(c.fimMes)}</strong>
                        <span class="badge ${estado === 'fechado' ? 'badge-success' : estado === 'aberto' ? 'badge-danger' : ''}">${rot}</span>
                    </div>
                    <div class="dc-hist-nums">
                        <div><span>Saldo${fech ? ' no fechamento' : ' em aberto'}</span>
                            <strong class="${(fech ? Number(fech.saldoMin) || 0 : c.acumuladoMin) > 0 ? 'bh-pos' : (fech ? Number(fech.saldoMin) || 0 : c.acumuladoMin) < 0 ? 'bh-neg' : ''}">${fmtHHMM(fech ? Number(fech.saldoMin) || 0 : c.acumuladoMin)}</strong></div>
                        <div><span>Meses lançados</span><strong>${c.meses.length}</strong></div>
                        <div><span>Quitações</span><strong>${c.quitacoes.length || '—'}</strong></div>
                        ${fin ? `<div><span>Pago</span><strong>${(c.quitadoValor + pagoFech) ? fmtBRL(c.quitadoValor + pagoFech) : '—'}</strong></div>` : ''}
                    </div>
                    ${fech ? `
                    <div class="dc-hist-fech">
                        ${icon('check')} <span>Fechado em <strong>${fmtDate(fech.data)}</strong> — ${escapeHtml(fech.destino)}${fin && pagoFech ? ` · ${fmtBRL(pagoFech)}` : ''}${fech.obs ? ` — ${escapeHtml(fech.obs)}` : ''}</span>
                    </div>` : ''}
                </div>`;
            }).join('')}
        </div>`;
}

// ---- Histórico (alimentado pelos Lançamentos) ----
// Sub-abas: linha do tempo + recortes por natureza da ausência (CLT) + treinamentos.
// "Atestado" não é tipo de ausência, é o comprovante (campo anexo) — por isso o recorte
// documental aparece como selo de anexo dentro de Afastamentos, não como aba própria.
const FD_HIST_FALTAS = ['Falta justificada', 'Falta injustificada'];
const FD_HIST_AFAST = ['Licença médica', 'Licença maternidade/paternidade', 'Outra licença'];
let fdHistSub = 'timeline';
// Ano do gráfico empilhado de Faltas/Afastamentos — null até o primeiro render, quando cai
// no ano mais recente com lançamento (mesmo padrão de fdPagAno).
let fdHistFaltasAno = null;
let fdHistAfastAno = null;
// Contagem do gráfico: 'dias' soma a duração, 'qtd' conta ocorrências — mesmo par usado em
// resEventos (resultados.js). Cada sub-aba guarda o próprio modo.
let fdHistFaltasModo = 'dias';
let fdHistAfastModo = 'dias';

// Reabre a ficha na aba Histórico, na mesma sub-aba — o drawer é único (openDrawer
// fecha o anterior), então detalhes de item precisam devolver o usuário ao contexto.
function fdVoltarHistorico(f, sub) {
    fdHistSub = sub;
    drawerFuncionario(f, 'historico');
}

async function fdHistorico(f, cont) {
    cont.innerHTML = '<div class="loading-center"><div class="spinner-dark"></div></div>';
    // detalheLiberacao e libAlcanceTexto leem nomes e unidades de lancState — a ficha pode ser
    // aberta sem a página Lançamentos ter renderizado, e sem isso o detalhe de uma liberação
    // listaria "(removido)" no lugar de todo mundo.
    await ensureLancFuncBase();
    const [ausencias, demissoes, treinamentos, promocoes, transferencias, cats,
        parciais, bhBanco, bhFech, bhQuit, bhLiberacoesAll, discs] = await Promise.all([
        DB.getAll(PATHS.ausencias), DB.getAll(PATHS.demissoes),
        DB.getAll(PATHS.treinamentos), DB.getAll(PATHS.promocoes), DB.getAll(PATHS.transferencias),
        DB.getAll(PATHS.cats), DB.getAll(PATHS.ausenciasParciais),
        DB.getObj(PATHS.bancoHoras), DB.getAll(PATHS.bancoHorasFechamentos), DB.getAll(PATHS.bancoHorasQuitacoes),
        DB.getAll(PATHS.liberacoes), DB.getAll(PATHS.disciplinares)
    ]);
    // detalheAusParcial reabre o form e a exclusão a partir do drawer — apState precisa estar
    // abastecido mesmo quando a ficha foi aberta sem passar pela página de Lançamentos.
    apState.itens = parciais;
    apState.ausencias = ausencias;
    // E o banco junto: apImpedimentoBanco decide com bhState se o mês está quitado ou o ciclo
    // fechado. Com bhState vazio ele responderia "liberado" para tudo, e uma edição feita da
    // ficha escreveria parcialMin em cima de horas que já viraram pagamento.
    bhState.banco = bhBanco || {};
    bhState.fechamentos = bhFech;
    bhState.quitacoes = bhQuit;
    bhState.liberacoes = bhLiberacoesAll;
    // detalheCat/catDiasAfastado leem o vínculo com o afastamento de catState — a ficha pode
    // ser aberta sem a página Lançamentos ter renderizado, então abastece aqui.
    catState.cats = cats;
    catState.ausencias = ausencias;
    // discDias/detalheDisciplinar leem o vínculo com o afastamento de discState — mesma razão:
    // a ficha pode ser aberta sem a página Lançamentos ter renderizado.
    discState.itens = discs;
    discState.ausencias = ausencias;

    const ausF = ausencias.filter(a => a.funcionarioId === f.id)
        .sort((a, b) => (b.inicio || '').localeCompare(a.inicio || ''));
    const treF = treinamentos.filter(t => (t.participantes || []).includes(f.id))
        .sort((a, b) => (b.inicio || '').localeCompare(a.inicio || ''));
    const catsF = cats.filter(c => c.funcionarioId === f.id)
        .sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    const discsF = discs.filter(x => x.funcionarioId === f.id)
        .sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    const porTipo = tipos => ausF.filter(a => tipos.includes(a.tipo));
    const faltas = porTipo(FD_HIST_FALTAS), afast = porTipo(FD_HIST_AFAST);
    // Sub-aba própria e não dentro de Faltas: a unidade aqui é HORA, e a lista de faltas
    // mostra "N dias" na mesma coluna — misturar as duas tornaria a coluna ilegível.
    const parciaisF = parciais.filter(p => p.funcionarioId === f.id)
        .sort((a, b) => (b.data || '').localeCompare(a.data || ''));

    const promoF = promocoes.filter(p => p.funcionarioId === f.id);
    const ultimaPromoData = promoF.reduce((mx, p) => p.data > mx ? p.data : mx, '');
    const transfF = transferencias.filter(t => t.funcionarioId === f.id);
    const ultimaTransfData = transfF.reduce((mx, t) => t.data > mx ? t.data : mx, '');

    // `abrir` liga cada evento à mesma janela de detalhe usada nas outras sub-abas/telas —
    // sem ela a linha do tempo é só leitura, e o RH precisa sair para achar o lançamento de
    // novo em Faltas/Afastamentos/Histórico da empresa. Admissão fica sem `abrir`: é derivada
    // do cadastro do funcionário, não um lançamento com janela própria.
    // Falta/afastamento/férias viram tipo e cor próprios na timeline — mesma distinção (e
    // mesmas cores) da badge de cada um em Faltas/Afastamentos/Dados → Férias, para o RH
    // reconhecer a natureza do evento sem abrir o detalhe.
    const tlTipoAus = a => FD_HIST_FALTAS.includes(a.tipo) ? 'danger'
        : FD_HIST_AFAST.includes(a.tipo) ? 'warning'
        : a.tipo === TIPO_FERIAS ? 'info'
        : 'warning';

    const eventos = [];
    if (f.admissao) eventos.push({ data: f.admissao, tipo: 'success', titulo: 'Admissão', desc: '' });
    ausencias.filter(a => a.funcionarioId === f.id).forEach(a =>
        eventos.push({
            data: a.inicio, tipo: tlTipoAus(a), titulo: a.tipo || 'Ausência',
            desc: `${fmtDate(a.inicio)} → ${fmtDate(a.retorno)} · ${a.dias || diasEntre(a.inicio, a.retorno)} dia(s)`,
            abrir: () => detalheAusencia(a, null, () => fdVoltarHistorico(f, 'timeline'))
        }));
    // Liberação coletiva: evento da empresa, não do funcionário — cor neutra e o alcance no
    // texto, para o RH ver na ficha que aquele saldo negativo não é falta dele.
    bhLiberacoesAll.filter(x => libAtinge(x, f.id)).forEach(x =>
        eventos.push({
            // O documento da liberação é a via individual deste colaborador — dizer na linha
            // do tempo que ela existe (ou que falta) evita abrir o detalhe só para descobrir.
            data: x.data, tipo: 'info', titulo: 'Liberação coletiva',
            desc: `${fmtHHMM(libMinutosDe(x, f.id))} · ${escapeHtml(x.motivo || '')} · ${escapeHtml(libAlcanceTexto(x))}${libAnexosDe(x, f.id).length ? ' · documento anexado' : ''}`,
            abrir: () => detalheLiberacao(x)
        }));
    // Ausência parcial é hora, não dia — entra na timeline com a janela do dia, não com "N
    // dia(s)", para não parecer uma falta curta.
    parciais.filter(x => x.funcionarioId === f.id).forEach(x =>
        eventos.push({
            data: x.data, tipo: 'warning', titulo: 'Ausência parcial',
            desc: `${escapeHtml(x.horaSaida || '')} → ${escapeHtml(x.horaRetorno || '')} · ${fmtHHMM(apMinDe(x))} · ${escapeHtml(x.motivo || '')}`,
            abrir: () => detalheAusParcial(x, () => fdVoltarHistorico(f, 'timeline'))
        }));
    promoF.forEach(p =>
        eventos.push({
            data: p.data, tipo: '', titulo: 'Promoção',
            desc: `${p.cargoAnteriorNome || ''} → ${p.cargoNovoNome || ''}${can('ver_financeiro') && p.pctAumento != null ? ` (+${Number(p.pctAumento).toFixed(1)}%)` : ''}`,
            abrir: () => detalhePromocao(p, p.data === ultimaPromoData, null, () => fdVoltarHistorico(f, 'timeline'))
        }));
    transfF.forEach(t =>
        eventos.push({
            data: t.data, tipo: 'info', titulo: 'Transferência de unidade',
            desc: `${t.unidadeOrigemNome || '—'} → ${t.unidadeDestinoNome || '—'}${t.motivo ? ` · ${t.motivo}` : ''}`,
            abrir: () => detalheTransferencia(t, t.data === ultimaTransfData, null, () => fdVoltarHistorico(f, 'timeline'))
        }));
    treinamentos.filter(t => (t.participantes || []).includes(f.id)).forEach(t =>
        eventos.push({
            data: t.inicio, tipo: '', titulo: `Treinamento: ${t.nome}`,
            desc: `${t.cargaHoraria || 0}h · ${t.tipo || ''}${t.responsavel ? ` · Resp.: ${t.responsavel}` : ''}`,
            abrir: () => detalheTreinamento(t, null, () => fdVoltarHistorico(f, 'timeline'))
        }));
    // O acidente é o evento mais grave da trajetória: omiti-lo da linha do tempo faria a
    // sequência mentir justamente onde ela mais importa (acidente → afastamento → retorno).
    catsF.forEach(c =>
        eventos.push({
            data: c.data, tipo: 'danger', titulo: 'Acidente de trabalho (CAT)',
            desc: `${c.natureza || ''}${c.houveAfastamento ? ` · ${fmtNum(catDiasAfastado(c))} dia(s) de afastamento` : ' · sem afastamento'}`,
            abrir: () => detalheCat(c, () => fdVoltarHistorico(f, 'cat'))
        }));
    // A medida disciplinar é o que explica um desligamento por justa causa; fora da linha do
    // tempo, a sequência (fato → penalidade → reincidência → rescisão) some. O evento aparece
    // sempre — o que `ver_disciplinar` protege é o motivo, não a existência da medida.
    discsF.forEach(x =>
        eventos.push({
            data: x.data, tipo: DISC_TIPO_TL[x.tipo] || 'warning',
            titulo: `Medida disciplinar: ${x.tipo || '—'}`,
            desc: `${podeVerDisciplinar() && x.motivo ? `${x.motivo} · ` : ''}${x.tipo === DISC_SUSPENSAO ? `${fmtNum(discDias(x))} dia(s) · ` : ''}ciência: ${x.ciencia || '—'}`,
            abrir: () => detalheDisciplinar(x, () => fdVoltarHistorico(f, 'disciplinar'))
        }));
    demissoes.filter(dm => dm.funcionarioId === f.id).forEach(dm =>
        eventos.push({
            data: dm.data, tipo: 'danger', titulo: 'Desligamento', desc: dm.motivo || '',
            abrir: () => detalheDemissao(dm, null, () => fdVoltarHistorico(f, 'timeline'))
        }));

    eventos.sort((a, b) => (b.data || '').localeCompare(a.data || ''));

    const subs = [
        { id: 'timeline', label: 'Linha do tempo', n: eventos.length },
        { id: 'faltas', label: 'Faltas', n: faltas.length },
        { id: 'afastamentos', label: 'Afastamentos', n: afast.length },
        { id: 'ausparcial', label: 'AUS', n: parciaisF.length, title: 'Ausências parciais — saída no meio do turno ou mais cedo, com declaração' },
        { id: 'cat', label: 'CAT', n: catsF.length },
        { id: 'disciplinar', label: 'Disciplinar', n: discsF.length, title: 'Notificações, advertências e suspensões' },
        { id: 'treinamentos', label: 'Treinamentos', n: treF.length }
    ];

    cont.innerHTML = `
        <div class="tabs tabs-sub" id="fdHistSubs">${subs.map(s => `
            <div class="tab" data-sub="${s.id}"${s.title ? ` title="${escapeHtml(s.title)}"` : ''}>${s.label}${s.n ? ` <span class="tab-count">${s.n}</span>` : ''}</div>`).join('')}
        </div>
        <div class="mt-12" id="fdHistBody"></div>`;

    const box = cont.querySelector('#fdHistBody');
    // Eventos com `abrir` (tudo que tem janela de detalhe própria) viram linhas clicáveis —
    // Admissão fica como texto simples, sem role de botão, por não ter para onde abrir.
    const timelineHtml = () => eventos.length ? `
        <div class="timeline">${eventos.map((e, i) => `
            <div class="tl-item tl-${e.tipo}${e.abrir ? ' tl-clicavel' : ''}" ${e.abrir ? `data-tl-i="${i}" tabindex="0" role="button"` : ''}>
                <div class="tl-date">${fmtDate(e.data)}</div>
                <div class="tl-title">${escapeHtml(e.titulo)}</div>
                ${e.desc ? `<div class="tl-desc">${escapeHtml(e.desc)}</div>` : ''}
            </div>`).join('')}</div>`
        : '<p class="muted">Nenhum evento registrado.</p>';

    const bindTimeline = () => {
        box.querySelectorAll('[data-tl-i]').forEach(el => {
            const ev = eventos[Number(el.dataset.tlI)];
            if (!ev?.abrir) return;
            el.onclick = ev.abrir;
            el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ev.abrir(); } };
        });
    };

    // Linha enxuta: período · dias · rótulo · selo de anexo. Clique abre o detalhe completo.
    const listaHtml = (itens, vazio, linha) => itens.length
        ? `<div class="hist-list">${itens.map((it, i) => `
            <div class="hist-row" data-i="${i}" tabindex="0" role="button">${linha(it)}</div>`).join('')}</div>`
        : `<p class="muted">${vazio}</p>`;

    const selo = anexo => anexo ? `<span class="hist-clip" title="Com comprovante anexado">${icon('paperclip')}</span>` : '';
    const seta = `<span class="hist-go">${icon('chevronRight')}</span>`;
    const linhaAus = (a, badgeCls, rotulo) => `
        <div class="hist-main">
            <div class="hist-top">
                <span class="hist-per">${fmtDate(a.inicio)} → ${fmtDate(a.retorno)}</span>
                <span class="hist-dias">${fmtNum(a.dias ?? diasEntre(a.inicio, a.retorno))}d</span>
            </div>
            <div class="hist-sub">
                <span class="badge ${badgeCls}">${escapeHtml(rotulo(a))}</span>${selo(a.anexo)}
            </div>
        </div>
        ${seta}`;

    // Bloco comum a Faltas/Afastamentos: gráfico empilhado por tipo, mês a mês, com navegação
    // de ano — mesma régua de fdPagamentos (mkChart no dono 'fdDados', destruído ao fechar a
    // ficha). `anoGet`/`anoSet` leem e gravam a variável de módulo de cada sub-aba
    // (fdHistFaltasAno / fdHistAfastAno), que persiste o ano ao trocar de sub-aba. `modoGet`/
    // `modoSet` fazem o mesmo para o par dias/quantidade (mesmo par de resEventos, resultados.js).
    const renderHistEmpilhado = (itens, tipos, chartId, corBase, anoGet, anoSet, modoGet, modoSet, montar) => {
        const anosComDado = [...new Set(itens.map(a => Number((a.inicio || '').slice(0, 4))))]
            .filter(Boolean).sort((a, b) => b - a);
        if (!anosComDado.length) return '';
        let ano = anoGet();
        if (!anosComDado.includes(ano)) { ano = anosComDado[0]; anoSet(ano); }
        const idxAno = anosComDado.indexOf(ano);
        const temAnterior = idxAno < anosComDado.length - 1;
        const temProximo = idxAno > 0;

        const modo = modoGet();
        // Em 'dias' soma a duração de cada lançamento; em 'qtd' cada lançamento conta 1, não
        // importa quantos dias durou — mesma distinção de resEventos (resultados.js).
        const valorItens = lista => modo === 'dias'
            ? lista.reduce((s, a) => s + (Number(a.dias) || diasEntre(a.inicio, a.retorno) || 0), 0)
            : lista.length;
        const porMesTipo = tipos.map(tp => ({
            tipo: tp,
            vals: MESES.map((_, m) => valorItens(itens.filter(a => a.tipo === tp
                && Number((a.inicio || '').slice(0, 4)) === ano
                && Number((a.inicio || '').slice(5, 7)) - 1 === m)))
        }));
        const total = porMesTipo.reduce((s, s2) => s + s2.vals.reduce((a, b) => a + b, 0), 0);
        const sufixo = modo === 'dias' ? 'dia' : 'ocorrência';

        const html = `
            <div class="flex-between" style="margin-bottom:12px">
                <div class="month-nav">
                    ${temAnterior ? `<button data-ano-prev title="Ano anterior com lançamento">‹</button>` : ''}
                    <span class="month-label">${ano}</span>
                    ${temProximo ? `<button data-ano-next title="Próximo ano com lançamento">›</button>` : ''}
                </div><div></div>
            </div>
            <div class="chart-grid chart-grid-full" style="margin-bottom:16px">
                ${chartCard({
                    id: chartId, titulo: `${modo === 'dias' ? 'Dias' : 'Ocorrências'} por mês — ${ano}`,
                    sub: 'Empilhado por tipo',
                    total: `${fmtNum(total)} ${sufixo}${total === 1 ? '' : 's'}`,
                    acao: `<button class="chart-legenda-btn" data-modo-btn title="Alternar entre dias e ocorrências">${icon('filter')}<span>Contar por: ${modo === 'dias' ? 'dias' : 'quantidade'}</span></button>`
                })}
            </div>`;

        // Chamado depois que o HTML acima já está no DOM (canvas precisa existir antes do
        // Chart.js poder desenhar nele) e liga a navegação de ano e o filtro de modo do bloco.
        montar(() => {
            mkChart('fdDados', chartId, {
                type: 'bar',
                data: {
                    labels: MESES,
                    datasets: porMesTipo.map((s, i) => dvBarra(s.tipo, s.vals, dvCor(corBase + i)))
                },
                options: dvOpts({ fmt: 'num', legenda: true, empilhado: true })
            });
            const prev = box.querySelector('[data-ano-prev]'), next = box.querySelector('[data-ano-next]');
            if (prev) prev.onclick = () => { anoSet(anosComDado[idxAno + 1]); views[fdHistSub](); };
            if (next) next.onclick = () => { anoSet(anosComDado[idxAno - 1]); views[fdHistSub](); };
            const btnModo = box.querySelector('[data-modo-btn]');
            if (btnModo) btnModo.onclick = e => openFilterPopover(e.currentTarget, {
                options: [{ value: 'dias', label: 'Dias (soma a duração)' }, { value: 'qtd', label: 'Quantidade (conta ocorrências)' }],
                value: modo, searchable: false,
                onPick: v => { modoSet(v); views[fdHistSub](); }
            });
        });

        return html;
    };

    const views = {
        timeline: () => { box.innerHTML = timelineHtml(); bindTimeline(); },

        faltas: () => {
            let montarChart = () => {};
            box.innerHTML =
                renderHistEmpilhado(faltas, FD_HIST_FALTAS, 'fdHistFaltasChart', 5,
                    () => fdHistFaltasAno, v => fdHistFaltasAno = v,
                    () => fdHistFaltasModo, v => fdHistFaltasModo = v,
                    fn => montarChart = fn) +
                listaHtml(faltas, 'Nenhuma falta registrada.', a => linhaAus(a, 'badge-danger', x => x.tipo || '—'));
            montarChart();
            bindLinhas(faltas, a => detalheAusencia(a, null, () => fdVoltarHistorico(f, 'faltas')));
        },

        afastamentos: () => {
            let montarChart = () => {};
            box.innerHTML =
                renderHistEmpilhado(afast, FD_HIST_AFAST, 'fdHistAfastChart', 0,
                    () => fdHistAfastAno, v => fdHistAfastAno = v,
                    () => fdHistAfastModo, v => fdHistAfastModo = v,
                    fn => montarChart = fn) +
                listaHtml(afast, 'Nenhum afastamento registrado.', a => linhaAus(a, 'badge-warning', x => x.tipo || '—'));
            montarChart();
            bindLinhas(afast, a => detalheAusencia(a, null, () => fdVoltarHistorico(f, 'afastamentos')));
        },

        ausparcial: () => {
            box.innerHTML = listaHtml(parciaisF, 'Nenhuma ausência parcial registrada.', p => `
                <div class="hist-main">
                    <div class="hist-top">
                        <span class="hist-per">${fmtDate(p.data)} · ${escapeHtml(p.horaSaida || '')} → ${escapeHtml(p.horaRetorno || '')}</span>
                        <span class="hist-dias">${fmtHHMM(apMinDe(p))}</span>
                    </div>
                    <div class="hist-sub">
                        <span class="badge ${apBadgeTrat(p.tratamento)}">${escapeHtml(p.tratamento || '—')}</span>
                        <span class="hist-meta">${escapeHtml(p.motivo || '')}${p.naoRetornou ? ' · não retornou no dia' : ''}</span>${anexosDe(p).length ? `<span class="hist-clip" title="Declaração anexada">${icon('paperclip')}</span>` : ''}
                    </div>
                </div>
                ${seta}`);
            bindLinhas(parciaisF, p => detalheAusParcial(p, () => fdVoltarHistorico(f, 'ausparcial')));
        },

        cat: () => {
            const medico = can('ver_medico');
            box.innerHTML = listaHtml(catsF, 'Nenhum acidente de trabalho registrado.', c => `
                <div class="hist-main">
                    <div class="hist-top">
                        <span class="hist-per">${fmtDate(c.data)}${c.hora ? ` · ${escapeHtml(c.hora)}` : ''}</span>
                        <span class="hist-dias">${c.houveAfastamento ? `${fmtNum(catDiasAfastado(c))}d` : '—'}</span>
                    </div>
                    <div class="hist-sub">
                        <span class="badge ${CAT_NATUREZA_CLS[c.natureza] || 'badge-neutral'}">${escapeHtml(c.natureza || '—')}</span>
                        ${c.tipo === CAT_TIPO_OBITO ? `<span class="badge badge-danger">${escapeHtml(c.tipo)}</span>` : ''}
                        <span class="hist-meta">${escapeHtml(c.local || '')}</span>${medico && anexosDe(c).length ? `<span class="hist-clip" title="CAT/laudo anexado">${icon('paperclip')}</span>` : ''}
                    </div>
                </div>
                ${seta}`);
            bindLinhas(catsF, c => detalheCat(c, () => fdVoltarHistorico(f, 'cat')));
        },

        disciplinar: () => {
            const verDet = podeVerDisciplinar();
            box.innerHTML = listaHtml(discsF, 'Nenhuma medida disciplinar registrada.', x => `
                <div class="hist-main">
                    <div class="hist-top">
                        <span class="hist-per">${fmtDate(x.data)}${x.tipo === DISC_SUSPENSAO && x.inicio ? ` · ${fmtDate(x.inicio)} → ${fmtDate(x.fim)}` : ''}</span>
                        <span class="hist-dias">${x.tipo === DISC_SUSPENSAO ? `${fmtNum(discDias(x))}d` : '—'}</span>
                    </div>
                    <div class="hist-sub">
                        <span class="badge ${DISC_TIPO_CLS[x.tipo] || 'badge-neutral'}">${escapeHtml(x.tipo || '—')}</span>
                        <span class="badge ${DISC_CIENCIA_CLS[x.ciencia] || 'badge-neutral'}">${escapeHtml(x.ciencia || '—')}</span>
                        <span class="hist-meta">${verDet ? escapeHtml(x.motivo || '') : ''}</span>${verDet && anexosDe(x).length ? `<span class="hist-clip" title="Documento assinado anexado">${icon('paperclip')}</span>` : ''}
                    </div>
                </div>
                ${seta}`);
            bindLinhas(discsF, x => detalheDisciplinar(x, () => fdVoltarHistorico(f, 'disciplinar')));
        },

        treinamentos: () => {
            box.innerHTML = listaHtml(treF, 'Nenhum treinamento registrado.', t => `
                <div class="hist-main">
                    <div class="hist-top">
                        <span class="hist-per">${escapeHtml(t.nome || 'Treinamento')}</span>
                        <span class="hist-dias">${fmtNum(t.cargaHoraria)}h</span>
                    </div>
                    <div class="hist-sub">
                        <span class="badge badge-info">${escapeHtml(t.tipo || '—')}</span>
                        <span class="hist-meta">${fmtDate(t.inicio)}${t.termino && t.termino !== t.inicio ? ` → ${fmtDate(t.termino)}` : ''}</span>${selo(t.anexo)}
                    </div>
                </div>
                ${seta}`);
            bindLinhas(treF, t => detalheTreinamento(t, null, () => fdVoltarHistorico(f, 'treinamentos')));
        }
    };

    function bindLinhas(itens, onOpen) {
        box.querySelectorAll('.hist-row').forEach(row => {
            const it = itens[Number(row.dataset.i)];
            const abrir = () => onOpen(it);
            row.onclick = abrir;
            row.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } };
        });
    }

    const subEls = cont.querySelectorAll('#fdHistSubs .tab');
    const setSub = id => {
        fdHistSub = id;
        subEls.forEach(t => t.classList.toggle('active', t.dataset.sub === id));
        views[id]();
    };
    subEls.forEach(t => t.onclick = () => setSub(t.dataset.sub));
    setSub(views[fdHistSub] ? fdHistSub : 'timeline');
}

// ---- Formulário da ficha ----
function formFuncionario(f) {
    const isEdit = !!f;
    if (!funcState.cargos.length || !funcState.unidades.length)
        return toast('Cadastre ao menos um cargo e uma unidade em Configurações antes.', 'info');

    const m = openModal({
        title: isEdit ? 'Editar funcionário' : 'Novo funcionário',
        size: 'modal-lg',
        body: `
            <div class="form-section">
                <div class="form-section-title">Dados pessoais</div>
                <div class="field" style="display:flex;align-items:center;gap:14px">
                    <div class="avatar xl" id="ffFotoPreview" style="cursor:pointer">${f?.fotoKey ? '' : iniciais(f?.nome || '')}</div>
                    <div>
                        <input type="file" id="ffFotoInput" accept="image/*" hidden>
                        <button type="button" class="btn btn-secondary btn-sm" id="ffFotoBtn">${icon('camera')} Alterar foto</button>
                        <button type="button" class="btn btn-ghost btn-sm" id="ffFotoRemove" style="color:var(--danger);${f?.fotoKey ? '' : 'display:none'}">Remover</button>
                        <div class="field-hint">Recortada e reduzida para 256x256 automaticamente.</div>
                    </div>
                </div>
                <div class="field"><label>Nome completo <span class="req">*</span></label><input class="input" id="ffNome" placeholder="Nome e sobrenome" value="${escapeHtml(f?.nome || '')}"></div>
                <div class="field"><label>Conta no Dados LAMIC</label><button type="button" class="picker-btn" id="ffLogin"></button>
                    <div class="field-hint" id="ffLoginHint">Vincula a ficha ao login do colaborador: cargo e unidade passam a valer também no Dados LAMIC e no UniLAMIC.</div></div>
                <div class="form-row">
                    <div class="field"><label>Sexo <span class="req">*</span></label>
                        <select class="select" id="ffSexo">${SEXOS.map(s => `<option ${f?.sexo === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
                    </div>
                    <div class="field"><label>Data de nascimento <span class="req">*</span></label><input class="input" id="ffNasc" type="date" value="${f?.nascimento || ''}"></div>
                </div>
                <div class="form-row">
                    <div class="field" style="margin-bottom:0"><label>Escolaridade <span class="req">*</span></label>
                        <select class="select" id="ffEsc">${ESCOLARIDADES.map(e => `<option ${f?.escolaridade === e ? 'selected' : ''}>${e}</option>`).join('')}</select>
                    </div>
                    <div class="field" style="margin-bottom:0"><label>Vestimenta</label>
                        <select class="select" id="ffVest"><option value="">—</option>${VESTIMENTAS.map(v => `<option ${f?.vestimenta === v ? 'selected' : ''}>${v}</option>`).join('')}</select>
                    </div>
                </div>
                <div class="field" style="margin-bottom:0"><label>Pessoa com deficiência</label>
                    <label class="fc-min">
                        <span class="switch"><input type="checkbox" id="ffPcd" ${f?.pcd ? 'checked' : ''}><span class="track"></span></span>
                        <span>PcD</span>
                    </label>
                    <div class="field-hint">No contrato de aprendizagem, dispensa o limite de ${APRENDIZ_IDADE_MAX} anos e o prazo de ${APRENDIZ_CONTRATO_MESES_MAX} meses (art. 428 §§5º e 8º da CLT).</div>
                </div>
            </div>

            <div class="form-section">
                <div class="form-section-title">Contato</div>
                <div class="form-row" style="margin-bottom:0">
                    <div class="field" style="margin-bottom:0"><label>Telefone</label><input class="input" id="ffFone" inputmode="numeric" placeholder="(00) 00000-0000" value="${escapeHtml(f?.telefone || '')}"></div>
                    <div class="field" style="margin-bottom:0"><label>E-mail</label><input class="input" id="ffEmail" type="email" placeholder="nome@empresa.com" value="${escapeHtml(f?.email || '')}"></div>
                </div>
            </div>

            <div class="form-section" ${can('ver_financeiro') ? '' : 'style="margin-bottom:0"'}>
                <div class="form-section-title">Contrato</div>
                <div class="form-row">
                    <div class="field"><label>Cargo <span class="req">*</span></label>
                        <button type="button" class="picker-btn" id="ffCargo"></button>
                    </div>
                    <div class="field"><label>Unidade <span class="req">*</span></label>
                        <select class="select" id="ffUnidade">${funcState.unidades.map(u => `<option value="${u.id}" ${f?.unidadeId === u.id ? 'selected' : ''}>${escapeHtml(u.nome)}</option>`).join('')}</select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="field" style="margin-bottom:0"><label>Data de admissão <span class="req">*</span></label><input class="input" id="ffAdm" type="date" max="${hoje()}" value="${f?.admissao || ''}"></div>
                    <div class="field" style="margin-bottom:0"><label>Jornada mensal (horas)</label>
                        <input class="input" id="ffJornada" type="number" min="1" max="744" step="1" placeholder="${JORNADA_MENSAL_PADRAO}" value="${f?.jornadaMensal ?? ''}">
                        <div class="field-hint">Divisor do valor-hora no cálculo de hora extra. Vazio = ${JORNADA_MENSAL_PADRAO}h (44h semanais). Jornada de 40h/semana usa 200.</div>
                    </div>
                </div>
                <div class="form-row"${isEdit && f.demissao ? '' : ' style="margin-bottom:0"'}>
                    <div class="field" style="margin-bottom:0"><label>Início do controle de férias</label>
                        <input class="input" id="ffFeriasBase" type="date" max="${hoje()}" value="${f?.feriasBase || ''}">
                        <div class="field-hint" id="ffFeriasBaseHint"></div>
                    </div>
                    <div class="field" style="margin-bottom:0" id="ffContratoFimBox" hidden>
                        <label>Fim do contrato de aprendizagem <span class="req">*</span></label>
                        <input class="input" id="ffContratoFim" type="date" value="${f?.contratoFim || ''}">
                        <div class="field-hint" id="ffContratoFimHint"></div>
                    </div>
                </div>
                ${isEdit && f.demissao ? `
                <div class="form-row" style="margin-bottom:0">
                    <div class="field" style="margin-bottom:0"><label>Data de demissão</label>
                        <input class="input" id="ffDem" type="date" value="${f.demissao}">
                        <div class="field-hint">Registrada pelo lançamento de demissão. Ajuste apenas para correção.</div>
                    </div>
                    <div></div>
                </div>` : ''}
            </div>

            ${can('ver_financeiro') ? `
            <div class="form-section">
                <div class="form-section-title">Financeiro</div>
                <div class="field" style="margin-bottom:0"><label>Salário individual (R$)</label>
                    <input class="input" id="ffSalario" type="number" min="0" step="0.01" placeholder="Base do cargo" value="${f?.salario ?? ''}">
                    <div class="field-hint">Deixe vazio para usar o salário base do cargo. Promoções e ajustes atualizam este valor.</div>
                </div>
            </div>

            <div class="form-section" style="margin-bottom:0">
                <div class="form-section-title">Pagamento</div>
                <div id="ffPagLista"></div>
                <button type="button" class="btn btn-secondary btn-sm" id="ffPagAdd">${icon('plus')} Adicionar forma de pagamento</button>
            </div>` : ''}`,
        footer: ''
    });

    const foneInput = m.body.querySelector('#ffFone');
    foneInput.addEventListener('input', () => foneInput.value = maskFone(foneInput.value));

    // ---- Início do controle de férias (funcionário antigo) ----
    // Reancora o cálculo de férias sem exigir folha retroativa: mesmo dia/mês da admissão,
    // ano no ponto em que se passa a controlar. Vazio = cálculo legal puro pela admissão.
    const admInput = m.body.querySelector('#ffAdm');
    const febInput = m.body.querySelector('#ffFeriasBase');
    const febHint = m.body.querySelector('#ffFeriasBaseHint');
    const atualizaFeb = () => {
        const adm = admInput.value;
        febInput.min = adm || '';
        if (!adm) { febHint.textContent = 'Preencha a admissão primeiro.'; return; }
        const sug = feriasBaseSugerida(adm, hoje());
        if (!sug) {
            febHint.textContent = 'Deixe vazio: para admissão recente o cálculo já parte da própria data.';
            return;
        }
        febHint.innerHTML = `Só para <strong>funcionário antigo</strong> — evita lançar folha retroativa. `
            + `Vazio = férias contadas desde a admissão (todos os ciclos passados aparecem). `
            + `Sugerido: <a href="#" id="ffFebUsar">${fmtDate(sug)}</a>.`;
        febHint.querySelector('#ffFebUsar').onclick = e => { e.preventDefault(); febInput.value = sug; };
    };
    admInput.addEventListener('change', atualizaFeb);
    atualizaFeb();

    // ---- Contrato de aprendizagem ----
    // O termo final só existe para o aprendiz: é contrato por PRAZO DETERMINADO (art. 428 §3º),
    // e sem a data gravada nada avisa o RH antes de o vínculo virar indeterminado por descuido.
    // O campo aparece/some conforme o cargo escolhido, mesmo padrão de `data-verba` no cargo.
    const cargoInput = m.body.querySelector('#ffCargo');
    // Cargo em popover (nome + CBO): dois cargos podem se chamar igual e ter CBO diferente.
    initPickerField(cargoInput, {
        options: cargoOpcoes(funcState.cargos),
        value: f?.cargoId || '',
        placeholder: funcState.cargos.length ? 'Selecione o cargo' : 'Nenhum cargo cadastrado',
        icon: 'briefcase'
    });
    const pcdInput = m.body.querySelector('#ffPcd');
    const jornadaInput = m.body.querySelector('#ffJornada');
    const escInput = m.body.querySelector('#ffEsc');
    const cfBox = m.body.querySelector('#ffContratoFimBox');
    const cfInput = m.body.querySelector('#ffContratoFim');
    const cfHint = m.body.querySelector('#ffContratoFimHint');
    const cargoSelecionado = () => funcState.cargos.find(c => c.id === cargoInput.value);
    const atualizaAprendiz = () => {
        const aprendiz = ehAprendiz(cargoSelecionado());
        cfBox.hidden = !aprendiz;
        // Restaura o padrão ao sair do perfil: senão o teto do aprendiz fica sugerido para um
        // cargo comum depois de trocar o select.
        if (!aprendiz) { jornadaInput.placeholder = String(JORNADA_MENSAL_PADRAO); return; }
        const adm = admInput.value;
        const semLimite = pcdInput.checked;
        const teto = adm ? addMeses(adm, APRENDIZ_CONTRATO_MESES_MAX) : '';
        cfInput.min = adm || '';
        cfInput.max = semLimite ? '' : teto;
        const jorMax = aprendizJornadaMax({ escolaridade: escInput.value });
        jornadaInput.placeholder = String(jorMax);
        if (!adm) { cfHint.textContent = 'Preencha a admissão primeiro.'; return; }
        cfHint.innerHTML = semLimite
            ? `Aprendiz com deficiência: sem o teto de ${APRENDIZ_CONTRATO_MESES_MAX} meses (art. 428 §8º). Jornada máxima de ${jorMax}h/mês.`
            : `Máximo ${APRENDIZ_CONTRATO_MESES_MAX} meses (art. 428 §3º) — até <a href="#" id="ffCfUsar">${fmtDate(teto)}</a>. Jornada máxima de ${jorMax}h/mês.`;
        const usar = cfHint.querySelector('#ffCfUsar');
        if (usar) usar.onclick = e => { e.preventDefault(); cfInput.value = teto; };
    };
    cargoInput.addEventListener('change', atualizaAprendiz);
    admInput.addEventListener('change', atualizaAprendiz);
    pcdInput.addEventListener('change', atualizaAprendiz);
    escInput.addEventListener('change', atualizaAprendiz);
    atualizaAprendiz();

    // ---- Pagamento ----
    // Lista editável: cada item é uma forma com os campos que ela pede (Pix → chave;
    // transferência → conta; dinheiro/boleto/cheque → nada). Só existe quando o formulário
    // tem a seção Financeiro (gate ver_financeiro).
    //
    // O estado vive no array `pags`, não no DOM: como um item pode ser removido do meio da
    // lista, ler os campos só no salvar exigiria casar índice do DOM com índice do array a
    // cada remoção. Aqui cada input grava direto no seu objeto, e o array é a única verdade.
    const pagListaEl = m.body.querySelector('#ffPagLista');
    const pags = pagListaEl ? pagamentosDe(f).map(p => ({ ...p })) : [];
    if (pagListaEl) {
        const btnAdd = m.body.querySelector('#ffPagAdd');

        // Campo de texto de um item: devolve o HTML e registra o binding que escreve no objeto.
        // `mask` é aplicada a cada tecla — o valor gravado é o já formatado, igual ao telefone
        // da ficha, para o que se lê na visualização ser o que está no banco.
        const bindings = [];
        const campo = (p, key, label, { placeholder = '', hint = '', mask = null, attrs = '' } = {}) => {
            const id = `ffPag${bindings.length}`;
            bindings.push({ id, p, key, mask });
            return `
                <div class="field"><label>${label}</label>
                    <input class="input" id="${id}" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(p[key] || '')}" ${attrs}>
                    ${hint ? `<div class="field-hint">${hint}</div>` : ''}
                </div>`;
        };
        const combo = (p, key, label, opcoes) => {
            const id = `ffPag${bindings.length}`;
            bindings.push({ id, p, key, mask: null });
            return `
                <div class="field"><label>${label}</label>
                    <select class="select" id="${id}">
                        <option value="">—</option>
                        ${opcoes.map(o => `<option ${p[key] === o ? 'selected' : ''}>${o}</option>`).join('')}
                    </select>
                </div>`;
        };

        // O titular só é pedido a quem tem destino identificável (Pix, conta): em dinheiro não
        // existe "titular", e o campo em branco só ocuparia espaço.
        const camposTitular = p => campo(p, 'titular', 'Nome do titular da conta', {
            placeholder: 'Deixe vazio se for o próprio funcionário',
            hint: 'Preencha apenas quando a conta for de terceiro.'
        });

        const corpoDe = p => {
            const forma = formaPagDe(p.forma);
            if (!forma?.campos.length) return '';
            if (p.forma === 'pix') return `
                <div class="form-row">
                    ${combo(p, 'pixTipo', 'Tipo da chave Pix', TIPOS_CHAVE_PIX)}
                    ${campo(p, 'pixChave', 'Chave Pix', { placeholder: PIX_PLACEHOLDER[p.pixTipo] || 'Chave', mask: 'pix' })}
                </div>
                ${camposTitular(p)}`;
            return `
                <div class="form-row">
                    ${campo(p, 'nome', 'Banco', { placeholder: 'Ex.: Banco do Brasil' })}
                    ${campo(p, 'codigo', 'Código do banco', { placeholder: '001', hint: 'Código de compensação (3 dígitos).', mask: 'cod', attrs: 'inputmode="numeric" maxlength="3"' })}
                </div>
                <div class="form-row">
                    ${combo(p, 'tipoConta', 'Tipo de conta', TIPOS_CONTA)}
                    ${campo(p, 'agencia', 'Agência', { placeholder: '0000' })}
                </div>
                <div class="form-row">
                    ${campo(p, 'conta', 'Conta (com dígito)', { placeholder: '00000-0' })}
                    ${campo(p, 'titularDoc', 'CPF/CNPJ do titular', { placeholder: '000.000.000-00', mask: 'doc', attrs: 'inputmode="numeric"' })}
                </div>
                ${camposTitular(p)}`;
        };

        const renderPags = () => {
            bindings.length = 0;
            pagListaEl.innerHTML = !pags.length
                ? `<div class="pag-vazio">${icon('money')} Nenhuma forma de pagamento cadastrada. Adicione ao menos uma para saber como este funcionário recebe.</div>`
                : pags.map((p, i) => {
                    const forma = formaPagDe(p.forma);
                    const corpo = corpoDe(p);
                    return `
                    <div class="pag-card${corpo ? '' : ' is-simples'}">
                        <div class="pag-card-head">
                            <span class="pag-card-ico">${icon(forma?.icon || 'money')}</span>
                            <div class="grow">
                                <strong>${escapeHtml(forma?.label || p.forma)}</strong>
                                ${i === 0 && pags.length > 1 ? '<span class="badge badge-info">Principal</span>' : ''}
                            </div>
                            <button type="button" class="btn btn-ghost btn-sm pag-card-rm" data-rm="${i}" title="Remover forma de pagamento">${icon('trash')}</button>
                        </div>
                        ${corpo ? `<div class="pag-card-body">${corpo}</div>` : ''}
                    </div>`;
                }).join('');

            // Cópia: um handler pode disparar renderPags() (troca do tipo da chave), que zera
            // `bindings` — iterar o array vivo abortaria o registro dos campos restantes.
            bindings.slice().forEach(({ id, p, key, mask }) => {
                const el = pagListaEl.querySelector(`#${id}`);
                if (!el) return;
                const grava = () => { p[key] = el.value.trim(); };
                if (el.tagName === 'SELECT') {
                    el.addEventListener('change', () => {
                        grava();
                        // Trocar o tipo da chave muda máscara e placeholder do campo ao lado —
                        // redesenhar é mais simples do que sincronizar os dois à mão.
                        if (key === 'pixTipo') renderPags();
                    });
                    return;
                }
                el.addEventListener('input', () => {
                    // A máscara da chave Pix segue o tipo: CPF/CNPJ/telefone têm formato fixo;
                    // e-mail e chave aleatória vão crus (mascarar corromperia o valor).
                    if (mask === 'pix') {
                        if (p.pixTipo === 'CPF') el.value = maskCPF(el.value);
                        else if (p.pixTipo === 'CNPJ') el.value = maskCNPJ(el.value);
                        else if (p.pixTipo === 'Telefone') el.value = maskFone(el.value);
                    } else if (mask === 'doc') {
                        // Titular pode ser PF ou PJ — a máscara acompanha o tamanho digitado.
                        const dig = el.value.replace(/\D/g, '');
                        el.value = dig.length > 11 ? maskCNPJ(dig) : maskCPF(dig);
                    } else if (mask === 'cod') {
                        el.value = el.value.replace(/\D/g, '').slice(0, 3);
                    }
                    grava();
                });
            });

            pagListaEl.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => {
                pags.splice(Number(b.dataset.rm), 1);
                renderPags();
            });
        };
        renderPags();

        // Formas já adicionadas saem do popover: repetir "Pix" duas vezes na mesma ficha seria
        // dois destinos concorrentes para a mesma forma, sem nada que diga qual vale.
        btnAdd.onclick = () => {
            const disp = FORMAS_PAGAMENTO.filter(fp => !pags.some(p => p.forma === fp.id));
            if (!disp.length) return toast('Todas as formas de pagamento já foram adicionadas.', 'info');
            openFilterPopover(btnAdd, {
                options: disp.map(fp => ({ value: fp.id, label: fp.label, icon: fp.icon })),
                value: '',
                searchable: false,
                onPick: id => { pags.push({ forma: id }); renderPags(); }
            });
        };
    }

    // ---- Foto: comprime (256x256) e só sobe ao banco no salvar — evita gravar upload de
    // quem desistiu do formulário. `preview` guarda o dataURL já comprimido; `removida` marca
    // remoção explícita de uma foto existente.
    const fotoState = { preview: null, removida: false, fotoKeyAtual: f?.fotoKey || null };
    // Contas do Dados LAMIC para o vínculo (sugere a de mesmo nome completo quando a ficha ainda não tem).
    (async () => {
        const sel = m.body.querySelector('#ffLogin');
        const pick = initPickerField(sel, { options: [], value: f?.login || '', placeholder: 'Carregando contas…', icon: 'users' });
        try {
            const [usuarios, funcs] = await Promise.all([DB.getObj('usuarios'), DB.getAll(PATHS.funcionarios)]);
            const chave = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
            const usados = new Map(funcs.filter(x => x.login && x.id !== f?.id).map(x => [x.login, x.nome]));
            const contas = Object.entries(usuarios || {}).filter(([, u]) => u && u.ativo === true)
                .sort((a, b) => (a[1].nome || '').localeCompare(b[1].nome || '', 'pt-BR'));
            let atual = f?.login || '';
            let sugerido = false;
            if (!atual) {
                const nomeFicha = chave(m.body.querySelector('#ffNome').value);
                const iguais = contas.filter(([l, u]) => !usados.has(l) && chave(u.nome) === nomeFicha);
                if (nomeFicha && iguais.length === 1) { atual = iguais[0][0]; sugerido = true; }
            }
            // Só contas livres (mais a já vinculada a esta ficha): as tomadas por outra ficha não aparecem.
            const livres = contas.filter(([l]) => !usados.has(l) || l === f?.login);
            pick.setOptions([{ value: '', label: '— Sem vínculo —', sub: 'A ficha não fica ligada a nenhuma conta' }]
                .concat(livres.map(([l, u]) => ({ value: l, label: u.nome || l, sub: '@' + l }))), atual);
            if (sugerido) m.body.querySelector('#ffLoginHint').innerHTML = '💡 Conta sugerida pelo nome completo — confira antes de salvar.';
        } catch (e) {
            pick.setOptions(f?.login ? [{ value: f.login, label: '@' + f.login }] : [], f?.login || '');
            if (!f?.login) m.body.querySelector('#ffLoginHint').textContent = 'Não foi possível carregar as contas do Dados LAMIC.';
        }
    })();

    const fotoPreviewEl = m.body.querySelector('#ffFotoPreview');
    const fotoBtnRemove = m.body.querySelector('#ffFotoRemove');
    if (fotoState.fotoKeyAtual) {
        obterFoto(fotoState.fotoKeyAtual).then(data => {
            if (data && !fotoState.removida) fotoPreviewEl.innerHTML = `<img src="${data}" alt="">`;
        }).catch(() => {});
    }
    m.body.querySelector('#ffFotoBtn').onclick = () => m.body.querySelector('#ffFotoInput').click();
    fotoPreviewEl.onclick = () => m.body.querySelector('#ffFotoInput').click();
    m.body.querySelector('#ffFotoInput').onchange = async e => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            fotoState.preview = await comprimirFoto(file);
            fotoState.removida = false;
            fotoPreviewEl.innerHTML = `<img src="${fotoState.preview}" alt="">`;
            fotoBtnRemove.style.display = '';
        } catch {
            toast('Erro ao processar a imagem.', 'error');
        }
    };
    fotoBtnRemove.onclick = () => {
        fotoState.preview = null;
        fotoState.removida = true;
        fotoPreviewEl.innerHTML = iniciais(m.body.querySelector('#ffNome').value || '');
        fotoBtnRemove.style.display = 'none';
    };

    m.footer.innerHTML = `
        ${isEdit && can('editar_funcionarios') ? `<button class="btn btn-ghost" data-delete style="margin-right:auto;color:var(--danger)">${icon('trash')} Excluir</button>` : ''}
        <button class="btn btn-secondary" data-cancel>Cancelar</button>
        <button class="btn btn-primary" data-save>${isEdit ? 'Salvar' : 'Cadastrar'}</button>`;
    m.footer.querySelector('[data-cancel]').onclick = m.close;

    const btnDel = m.footer.querySelector('[data-delete]');
    if (btnDel) btnDel.onclick = async () => {
        const [aus, dem, tre, pro, trf] = await Promise.all([
            DB.getAll(PATHS.ausencias), DB.getAll(PATHS.demissoes),
            DB.getAll(PATHS.treinamentos), DB.getAll(PATHS.promocoes), DB.getAll(PATHS.transferencias)
        ]);
        const temLanc = aus.some(x => x.funcionarioId === f.id) || dem.some(x => x.funcionarioId === f.id) ||
            pro.some(x => x.funcionarioId === f.id) || trf.some(x => x.funcionarioId === f.id) ||
            tre.some(x => (x.participantes || []).includes(f.id));
        if (temLanc) return toast('Funcionário possui lançamentos e não pode ser excluído. Use o desligamento.', 'error');
        if (await confirmDialog({ title: 'Excluir funcionário', message: `Excluir <strong>${escapeHtml(f.nome)}</strong> permanentemente? Documentos e anexos também serão excluídos. Prefira registrar demissão para manter o histórico.`, confirmText: 'Excluir', danger: true })) {
            for (const doc of (f.documentos || [])) await excluirAnexoRemoto(doc.anexo);
            await excluirFotoRemota(f.fotoKey);
            await DB.remove(PATHS.funcionarios, f.id);
            funcState.funcionarios = funcState.funcionarios.filter(x => x.id !== f.id);
            toast('Funcionário excluído.');
            m.close();
            renderFuncGrid();
        }
    };

    m.footer.querySelector('[data-save]').onclick = async () => {
        const nome = m.body.querySelector('#ffNome').value.trim();
        const nascimento = m.body.querySelector('#ffNasc').value;
        const admissao = m.body.querySelector('#ffAdm').value;
        if (!nome || !nascimento || !admissao) return toast('Preencha nome, nascimento e admissão.', 'error');
        // O picker começa vazio (não há mais "primeira opção" implícita do select).
        if (!cargoInput.value) return toast('Selecione o cargo.', 'error');
        if (nascimento >= admissao) return toast('Data de nascimento deve ser anterior à admissão.', 'error');
        // Barra o defeito na entrada: admissão futura zera a base de tempo de casa, férias
        // e experiência. Corrigir aqui é mais barato do que sinalizar em toda tela derivada.
        if (admissao > hoje()) return toast('Data de admissão não pode ser futura.', 'error');

        // Base de controle de férias (funcionário antigo). Igual à admissão = redundante →
        // guarda null para o cálculo cair no fallback pela própria admissão.
        const feriasBaseRaw = m.body.querySelector('#ffFeriasBase').value || null;
        if (feriasBaseRaw) {
            if (feriasBaseRaw < admissao) return toast('O início do controle de férias não pode ser anterior à admissão.', 'error');
            if (feriasBaseRaw > hoje()) return toast('O início do controle de férias não pode ser futuro.', 'error');
        }
        const feriasBase = feriasBaseRaw && feriasBaseRaw !== admissao ? feriasBaseRaw : null;

        // Jornada zero dividiria o salário por zero no valor-hora. Vazio é legítimo (usa o
        // padrão); zero não é — barrar aqui evita um Infinity chegando à folha.
        const jornadaRaw = m.body.querySelector('#ffJornada').value;
        const jornada = jornadaRaw === '' ? null : Number(jornadaRaw);
        if (jornada !== null && !(jornada >= 1 && jornada <= 744))
            return toast('Jornada mensal deve ficar entre 1 e 744 horas (o máximo de horas de um mês).', 'error');

        const escolaridade = m.body.querySelector('#ffEsc').value;
        const pcd = pcdInput.checked;
        const cargoSel = funcState.cargos.find(c => c.id === cargoInput.value);
        const contratoFim = cfInput.value || null;

        // ---- Contrato de aprendizagem (CLT arts. 402-433) ----
        // Barra na entrada, como a admissão futura: um aprendiz cadastrado fora dos limites
        // legais contamina folha, cota e o alerta de término, e a irregularidade só apareceria
        // numa fiscalização. Todas as regras aqui são de lei, não de política interna.
        if (ehAprendiz(cargoSel)) {
            // Idade na ADMISSÃO, não hoje: a faixa do art. 428 é requisito da contratação.
            // Quem entrou aos 23 e já fez 25 segue num contrato válido — validar pela idade
            // atual recusaria a edição de uma ficha correta.
            const anos = idadeEm(nascimento, admissao);
            if (anos != null && anos < APRENDIZ_IDADE_MIN)
                return toast(`Contrato de aprendizagem exige no mínimo ${APRENDIZ_IDADE_MIN} anos na admissão (art. 428 da CLT). Idade na admissão: ${anos}.`, 'error');
            // O teto de 24 anos não se aplica ao aprendiz com deficiência (art. 428 §5º).
            if (anos != null && anos > APRENDIZ_IDADE_MAX && !pcd)
                return toast(`Contrato de aprendizagem vai até ${APRENDIZ_IDADE_MAX} anos (art. 428 da CLT) — sem limite apenas para aprendiz com deficiência. Idade na admissão: ${anos}.`, 'error');

            // Prorrogação e compensação são vedadas (art. 432): a jornada é teto, não média.
            const jorMax = aprendizJornadaMax({ escolaridade });
            if (jornada !== null && jornada > jorMax)
                return toast(`Jornada do aprendiz limitada a ${jorMax}h/mês (art. 432 da CLT)${jorMax === APRENDIZ_JORNADA_MES_MAX ? ' — as 8h diárias só valem para quem concluiu o ensino fundamental' : ''}.`, 'error');

            if (!contratoFim)
                return toast('Informe o fim do contrato de aprendizagem — é contrato por prazo determinado (art. 428 §3º da CLT).', 'error');
            if (contratoFim <= admissao)
                return toast('O fim do contrato de aprendizagem deve ser posterior à admissão.', 'error');
            if (!pcd && contratoFim > addMeses(admissao, APRENDIZ_CONTRATO_MESES_MAX))
                return toast(`O contrato de aprendizagem não pode passar de ${APRENDIZ_CONTRATO_MESES_MAX} meses (art. 428 §3º da CLT) — no máximo até ${fmtDate(addMeses(admissao, APRENDIZ_CONTRATO_MESES_MAX))}.`, 'error');

            // Menor de 18 não trabalha em local insalubre ou perigoso (CF art. 7º XXXIII e
            // art. 405 I da CLT). O risco é do CARGO; a idade é da ficha — só aqui os dois se
            // encontram, por isso a checagem vive no save do funcionário.
            const risco = (Number(cargoSel.insalubridade) || 0) > 0 || !!cargoSel.periculosidade;
            if (risco && anos != null && anos < 18)
                return toast(`O cargo "${cargoSel.nome}" tem insalubridade/periculosidade: menores de 18 anos não podem ser alocados (CF art. 7º XXXIII e art. 405 da CLT).`, 'error');
        }

        const data = {
            nome,
            login: m.body.querySelector('#ffLogin').value || null,
            sexo: m.body.querySelector('#ffSexo').value,
            nascimento,
            escolaridade,
            pcd,
            cargoId: cargoInput.value,
            unidadeId: m.body.querySelector('#ffUnidade').value,
            telefone: foneInput.value.trim(),
            email: m.body.querySelector('#ffEmail').value.trim(),
            vestimenta: m.body.querySelector('#ffVest').value,
            admissao,
            feriasBase,
            jornadaMensal: jornada,
            // Fora do perfil aprendiz o campo não existe: gravar `null` limpa um termo que
            // sobrou de quando a pessoa era aprendiz e foi efetivada.
            contratoFim: ehAprendiz(cargoSel) ? contratoFim : null
        };
        const demInput = m.body.querySelector('#ffDem');
        if (demInput) data.demissao = demInput.value || null;
        const salInput = m.body.querySelector('#ffSalario');
        if (salInput) data.salario = salInput.value === '' ? null : Number(salInput.value);

        // Pagamento: só grava se a seção existe no formulário. Quem não tem `ver_financeiro`
        // não vê os campos — sem esta guarda, salvar por esse perfil apagaria os dados
        // bancários de quem tem.
        if (pagListaEl) {
            for (const p of pags) {
                const forma = formaPagDe(p.forma);
                if (p.forma === 'pix') {
                    if (!p.pixChave) return toast(`Informe a chave Pix.`, 'error');
                    if (p.pixTipo === 'CPF' && !validaCPF((p.pixChave || '').replace(/\D/g, '')))
                        return toast('Chave Pix do tipo CPF inválida.', 'error');
                }
                if (p.forma === 'transferencia' && !p.conta)
                    return toast(`Informe a conta da ${forma.label.toLowerCase()}.`, 'error');
                if (p.titularDoc) {
                    const dig = p.titularDoc.replace(/\D/g, '');
                    if (dig.length === 11 && !validaCPF(dig))
                        return toast('CPF do titular da conta inválido.', 'error');
                }
            }
            // Campos vazios saem do objeto: melhor a linha não ter a chave do que carregar
            // strings vazias que a visualização teria de filtrar item a item.
            data.pagamentos = pags.map(p => Object.fromEntries(
                Object.entries(p).filter(([, v]) => v !== '' && v != null)));
            // Formato antigo (uma forma só) fica explicitamente nulo depois de migrado — sem
            // isto, `pagamentosDe` continuaria com dois candidatos a verdade na mesma ficha.
            data.formaPagamento = null;
            data.banco = null;
        }

        // Só mexe no fotoKey se algo mudou: nova foto (sobe e substitui a antiga) ou remoção
        // explícita. Sem alteração, o campo fica de fora — DB.save() faz update parcial.
        if (fotoState.preview) data.fotoKey = await salvarFotoDB(fotoState.preview, fotoState.fotoKeyAtual);
        else if (fotoState.removida && fotoState.fotoKeyAtual) {
            await excluirFotoRemota(fotoState.fotoKeyAtual);
            data.fotoKey = null;
        }

        // Um login só pode estar em uma ficha: tira de outra que o tivesse.
        if (data.login) {
            for (const o of funcState.funcionarios.filter(x => x.login === data.login && x.id !== f?.id)) {
                await db.ref(`${PATHS.funcionarios}/${o.id}/login`).remove(); o.login = null;
            }
        }
        const id = await DB.save(PATHS.funcionarios, f?.id || null, data);
        if (isEdit) Object.assign(funcState.funcionarios.find(x => x.id === f.id), data);
        else funcState.funcionarios.push({ id, ...data, beneficios: [] });

        toast(isEdit ? 'Ficha atualizada.' : 'Funcionário cadastrado.');
        m.close();
        renderFuncGrid();
    };
}
