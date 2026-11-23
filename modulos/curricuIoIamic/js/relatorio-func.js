// ===== Funcionários: relatório para download (PDF / Excel) =====
//
// Fluxo: botão "Baixar relatório" → popover com o formato → modal com interruptores das
// informações que entram → arquivo gerado no navegador. Nada vai para servidor: os dados
// já estão em funcState (carregados pela página), só o ASO é lido sob demanda, e apenas se
// alguma coluna de ASO foi ligada.
//
// As bibliotecas (jsPDF + autotable, ExcelJS) são carregadas na primeira geração, não no
// index.html: somam ~1 MB e só quem baixa relatório precisa delas.

const REL_LIBS = {
    jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    autotable: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
    exceljs: 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js'
};
const _relScripts = {};
function relCarregarScript(src) {
    if (!_relScripts[src]) _relScripts[src] = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        // Falha não fica em cache: sem isto, uma queda de rede momentânea travaria o
        // relatório até recarregar a página.
        s.onerror = () => { delete _relScripts[src]; s.remove(); reject(new Error('Não foi possível carregar o gerador de relatório. Verifique a conexão.')); };
        document.head.appendChild(s);
    });
    return _relScripts[src];
}

// Paleta do relatório = tokens de css/base.css, em RGB para o jsPDF e ARGB para o ExcelJS.
const REL_COR = {
    navy: [23, 23, 50], navySub: [167, 169, 197],
    accent: [91, 91, 214], accentStrong: [74, 74, 196], accentSoft: [238, 238, 252],
    text: [22, 25, 42], text2: [75, 81, 99], muted: [138, 144, 163],
    border: [232, 234, 243], surface2: [246, 247, 252],
    success: [22, 163, 74], danger: [220, 38, 38], warning: [217, 119, 6],
    ferias: [13, 148, 136], vencendo: [202, 138, 4], vencida: [234, 88, 12], futuro: [124, 58, 237]
};
const relArgb = rgb => 'FF' + rgb.map(n => n.toString(16).padStart(2, '0')).join('').toUpperCase();

// Situação curta por classe do ponto do card (funcStatusDot) — o texto longo do tooltip
// ("Férias vencidas — 2 ciclos") não cabe numa célula de tabela.
const REL_STATUS = {
    on: { txt: 'Ativo', cor: REL_COR.success },
    off: { txt: 'Desligado', cor: REL_COR.muted },
    ferias: { txt: 'De férias', cor: REL_COR.ferias },
    vencida: { txt: 'Férias vencidas', cor: REL_COR.vencida },
    vencendo: { txt: 'Férias vencendo', cor: REL_COR.vencendo },
    futuro: { txt: 'Admissão futura', cor: REL_COR.futuro }
};
const relStatusDe = f => {
    const fer = funcAtivo(f) ? funcFerias(f) : null;
    return funcStatusDot(f, fer, situacaoFeriasFunc(f, funcState.ausencias)).cls;
};

// Data ISO → Date em UTC: o ExcelJS grava Date como UTC, e um Date local de meia-noite
// viraria o dia anterior em fuso negativo (Brasil).
const relDataXls = iso => {
    if (!iso) return null;
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
};

// ---- Catálogo de campos ----
// `txt` = texto exibido (PDF e fallback do Excel). `xls` = valor cru para a planilha (Date,
// número) quando o tipo importa para filtrar/somar; `fmt` = formato numérico do Excel.
// `w` = largura relativa (caracteres no Excel, peso no PDF). `fin` = exige ver_financeiro.
const REL_GRUPOS = [
    { id: 'ident', label: 'Identificação', icon: 'user' },
    { id: 'pessoal', label: 'Dados pessoais', icon: 'users' },
    { id: 'contato', label: 'Contato', icon: 'bell' },
    { id: 'contrato', label: 'Contrato', icon: 'briefcase' },
    { id: 'saude', label: 'Férias e saúde', icon: 'sun' },
    { id: 'benef', label: 'Benefícios e treinamentos', icon: 'gift' },
    { id: 'fin', label: 'Financeiro', icon: 'money', fin: true }
];

const relData = iso => iso ? fmtDate(iso) : '—';
const relBenefs = f => (f.beneficios || []).map(fb => funcState.beneficios.find(b => b.id === fb.beneficioId)).filter(Boolean);

const REL_CAMPOS = [
    { id: 'nome', grupo: 'ident', label: 'Nome', w: 30, fixo: true, txt: f => f.nome || '—' },
    { id: 'cargo', grupo: 'ident', label: 'Cargo', w: 22, txt: f => cargoDe(f)?.nome || 'Sem cargo' },
    { id: 'cbo', grupo: 'ident', label: 'CBO', w: 22, txt: f => cargoCboTexto(cargoDe(f)) || '—' },
    { id: 'unidade', grupo: 'ident', label: 'Unidade', w: 18, txt: f => unidadeDe(f)?.nome || 'Sem unidade' },
    { id: 'status', grupo: 'ident', label: 'Situação', w: 18, txt: f => REL_STATUS[relStatusDe(f)]?.txt || '—' },

    { id: 'sexo', grupo: 'pessoal', label: 'Sexo', w: 11, txt: f => f.sexo || '—' },
    { id: 'nascimento', grupo: 'pessoal', label: 'Nascimento', w: 12, align: 'center', fmt: 'dd/mm/yyyy', txt: f => relData(f.nascimento), xls: f => relDataXls(f.nascimento) },
    { id: 'idade', grupo: 'pessoal', label: 'Idade', w: 7, align: 'center', txt: f => idade(f.nascimento) ?? '—', xls: f => idade(f.nascimento) ?? null },
    { id: 'escolaridade', grupo: 'pessoal', label: 'Escolaridade', w: 20, txt: f => f.escolaridade || '—' },
    { id: 'vestimenta', grupo: 'pessoal', label: 'Vestimenta', w: 10, align: 'center', txt: f => f.vestimenta || '—' },
    { id: 'pcd', grupo: 'pessoal', label: 'PcD', w: 7, align: 'center', txt: f => f.pcd ? 'Sim' : 'Não' },

    { id: 'telefone', grupo: 'contato', label: 'Telefone', w: 16, txt: f => f.telefone || '—' },
    { id: 'email', grupo: 'contato', label: 'E-mail', w: 28, txt: f => f.email || '—' },

    { id: 'admissao', grupo: 'contrato', label: 'Admissão', w: 12, align: 'center', fmt: 'dd/mm/yyyy', txt: f => relData(f.admissao), xls: f => relDataXls(f.admissao) },
    { id: 'demissao', grupo: 'contrato', label: 'Demissão', w: 12, align: 'center', fmt: 'dd/mm/yyyy', txt: f => relData(f.demissao), xls: f => relDataXls(f.demissao) },
    { id: 'tempo', grupo: 'contrato', label: 'Tempo de empresa', w: 17, txt: f => tempoEmpresa(f.admissao, f.demissao) },
    { id: 'jornada', grupo: 'contrato', label: 'Jornada (h/mês)', w: 11, align: 'center', txt: f => jornadaDe(f), xls: f => jornadaDe(f) },
    { id: 'perfil', grupo: 'contrato', label: 'Vínculo', w: 14, txt: f => CARGO_PERFIS.find(p => p.id === perfilCargo(cargoDe(f)))?.label || '—' },
    { id: 'contratoFim', grupo: 'contrato', label: 'Fim do contrato', w: 12, align: 'center', fmt: 'dd/mm/yyyy', txt: f => relData(f.contratoFim), xls: f => relDataXls(f.contratoFim) },
    { id: 'insalubridade', grupo: 'contrato', label: 'Insalubridade', w: 11, align: 'center', txt: f => cargoDe(f)?.insalubridade ? `${cargoDe(f).insalubridade}%` : '—' },
    { id: 'periculosidade', grupo: 'contrato', label: 'Periculosidade', w: 11, align: 'center', txt: f => cargoDe(f)?.periculosidade ? `${PERICULOSIDADE_PCT}%` : '—' },

    { id: 'ferSit', grupo: 'saude', label: 'Férias', w: 22, txt: f => {
        if (!funcAtivo(f)) return '—';
        const fer = funcFerias(f);
        if (fer) return `De férias até ${fmtDate(fer.retorno)}`;
        return situacaoFeriasFunc(f, funcState.ausencias)?.label || '—';
    }},
    { id: 'ferStatus', grupo: 'saude', label: 'Status das férias', w: 13, txt: f => {
        const sit = funcAtivo(f) && !funcFerias(f) ? situacaoFeriasFunc(f, funcState.ausencias) : null;
        return sit ? (FERIAS_STATUS[sit.status]?.txt || '—') : '—';
    }},
    { id: 'asoSit', grupo: 'saude', label: 'ASO', w: 15, aso: true, txt: (f, ctx) => {
        const sit = situacaoAsoFunc(f, ctx.asos, cargoDe(f));
        return sit ? (ASO_STATUS[sit.status]?.txt || '—') : '—';
    }},
    { id: 'asoUltimo', grupo: 'saude', label: 'Último ASO', w: 12, align: 'center', aso: true, fmt: 'dd/mm/yyyy',
        txt: (f, ctx) => relData(asosDoFunc(f.id, ctx.asos)[0]?.data),
        xls: (f, ctx) => relDataXls(asosDoFunc(f.id, ctx.asos)[0]?.data) },

    { id: 'benefNomes', grupo: 'benef', label: 'Benefícios', w: 28, txt: f => relBenefs(f).map(b => b.nome).join(', ') || '—' },
    { id: 'benefQtd', grupo: 'benef', label: 'Nº benefícios', w: 10, align: 'center', txt: f => relBenefs(f).length, xls: f => relBenefs(f).length },
    { id: 'treinQtd', grupo: 'benef', label: 'Treinamentos', w: 11, align: 'center',
        txt: f => funcState.treinamentos.filter(t => (t.participantes || []).includes(f.id)).length,
        xls: f => funcState.treinamentos.filter(t => (t.participantes || []).includes(f.id)).length },

    { id: 'salario', grupo: 'fin', label: 'Salário', w: 17, align: 'right', fin: true, soma: true, fmt: '"R$" #,##0.00',
        txt: f => fmtBRL(funcSalarioDe(f)), xls: f => Number(funcSalarioDe(f)) || 0 },
    { id: 'benefCusto', grupo: 'fin', label: 'Custo benefícios', w: 17, align: 'right', fin: true, soma: true, fmt: '"R$" #,##0.00',
        txt: f => fmtBRL((f.beneficios || []).reduce((s, fb) => s + custoBeneficioFunc(fb), 0)),
        xls: f => (f.beneficios || []).reduce((s, fb) => s + custoBeneficioFunc(fb), 0) },
    { id: 'pagForma', grupo: 'fin', label: 'Forma de pagamento', w: 18, fin: true, txt: f => {
        const l = pagamentosDe(f);
        if (!l.length) return '—';
        const principal = formaPagDe(l[0].forma)?.label || l[0].forma;
        return l.length > 1 ? `${principal} (+${l.length - 1})` : principal;
    }},
    { id: 'pagDados', grupo: 'fin', label: 'Dados de pagamento', w: 26, fin: true, txt: f => {
        const p = pagamentosDe(f)[0];
        return (p && pagamentoResumo(p)) || '—';
    }}
];

const REL_PADRAO = ['nome', 'cargo', 'unidade', 'status', 'admissao', 'tempo', 'telefone'];
const REL_STORAGE = 'rh_relatorio_func_v1';

const relCamposVisiveis = () => REL_CAMPOS.filter(c => !c.fin || can('ver_financeiro'));
const relGruposVisiveis = () => REL_GRUPOS.filter(g => !g.fin || can('ver_financeiro'));

// Preferência do usuário (últimas colunas escolhidas): conveniência por navegador. Se o
// storage falhar, cai no padrão — o relatório não depende disto.
function relLerPrefs() {
    try { return JSON.parse(localStorage.getItem(REL_STORAGE)) || null; } catch { return null; }
}
function relGravarPrefs(p) {
    try { localStorage.setItem(REL_STORAGE, JSON.stringify(p)); } catch { /* sem storage: ignora */ }
}

// ---- Popover de formato ----
function abrirMenuRelatorio(btn) {
    if (_popover && _popover.classList.contains('pop-relatorio')) return closePopover();
    closePopover();
    const pop = document.createElement('div');
    pop.className = 'popover pop-relatorio';
    pop.innerHTML = `
        <div class="rel-pop-title">Baixar relatório</div>
        <button type="button" class="rel-pop-opt" data-fmt="pdf">
            <span class="rel-pop-ico pdf">${icon('filePdf')}</span>
            <span class="grow"><strong>PDF</strong><small>Documento pronto para imprimir e compartilhar</small></span>
            ${icon('chevronRight')}
        </button>
        <button type="button" class="rel-pop-opt" data-fmt="xlsx">
            <span class="rel-pop-ico xlsx">${icon('fileSheet')}</span>
            <span class="grow"><strong>Excel</strong><small>Planilha com filtros, para analisar e editar</small></span>
            ${icon('chevronRight')}
        </button>`;
    document.body.appendChild(pop);

    const r = btn.getBoundingClientRect();
    let x = r.right - pop.offsetWidth, y = r.bottom + 8;
    if (x < 8) x = r.left;
    if (y + pop.offsetHeight > window.innerHeight - 8) y = r.top - pop.offsetHeight - 8;
    pop.style.left = `${Math.max(8, x)}px`;
    pop.style.top = `${Math.max(8, y)}px`;
    _popover = pop;

    pop.querySelectorAll('[data-fmt]').forEach(el => {
        el.onclick = () => { closePopover(); modalRelatorio(el.dataset.fmt); };
    });
    setTimeout(() => {
        document.addEventListener('mousedown', function h(e) {
            if (_popover === pop && !pop.contains(e.target) && !btn.contains(e.target)) closePopover();
            if (_popover !== pop || !pop.isConnected) document.removeEventListener('mousedown', h);
        });
    });
}

// ---- Modal de configuração ----
function modalRelatorio(formato) {
    const campos = relCamposVisiveis();
    const grupos = relGruposVisiveis();
    const prefs = relLerPrefs() || {};
    const idsValidos = new Set(campos.map(c => c.id));
    const sel = new Set((prefs.campos || REL_PADRAO).filter(id => idsValidos.has(id)));
    sel.add('nome');
    const opt = {
        formato,
        titulo: 'Relatório de funcionários',
        escopo: prefs.escopo || 'filtro',
        agrupar: prefs.agrupar ?? false,
        resumo: prefs.resumo ?? true,
        paisagem: prefs.paisagem ?? true
    };

    const ESCOPOS = [
        { id: 'filtro', label: 'Filtro atual', n: () => funcFiltrados().length },
        { id: 'ativos', label: 'Todos os ativos', n: () => funcState.funcionarios.filter(funcAtivo).length },
        { id: 'todos', label: 'Todos', n: () => funcState.funcionarios.length }
    ];

    const m = openModal({
        titleHtml: `<div class="rel-modal-head">
            <span class="rel-pop-ico" id="relHeadIco"></span>
            <div><h3 id="relHeadTit"></h3><div class="rel-modal-sub">Escolha o que entra no relatório</div></div>
        </div>`,
        size: 'modal-lg',
        body: `
            <div class="rel-topo">
                <div class="field" style="margin-bottom:0">
                    <label>Título do relatório</label>
                    <input class="input" id="relTitulo" maxlength="80" value="${escapeHtml(opt.titulo)}">
                </div>
                <div class="field" style="margin-bottom:0">
                    <label>Formato</label>
                    <div class="rel-seg" id="relFormato">
                        <button type="button" data-v="pdf">${icon('filePdf')} PDF</button>
                        <button type="button" data-v="xlsx">${icon('fileSheet')} Excel</button>
                    </div>
                </div>
            </div>

            <div class="field">
                <label>Funcionários</label>
                <div class="rel-seg rel-seg-wide" id="relEscopo">
                    ${ESCOPOS.map(e => `<button type="button" data-v="${e.id}">${e.label}<span class="rel-seg-n">${e.n()}</span></button>`).join('')}
                </div>
            </div>

            <div class="rel-opcoes">
                <label class="rel-opc"><span class="switch"><input type="checkbox" id="relAgrupar"><span class="track"></span></span>
                    <span><strong>Agrupar por unidade</strong><small>Uma seção por unidade, com subtotal</small></span></label>
                <label class="rel-opc"><span class="switch"><input type="checkbox" id="relResumo"><span class="track"></span></span>
                    <span><strong>Incluir resumo</strong><small id="relResumoHint"></small></span></label>
                <label class="rel-opc" id="relPaisagemBox"><span class="switch"><input type="checkbox" id="relPaisagem"><span class="track"></span></span>
                    <span><strong>Página na horizontal</strong><small>Mais colunas por página</small></span></label>
            </div>

            <div class="rel-campos-head">
                <div><strong>Informações</strong><span class="muted" id="relContagem"></span></div>
                <div class="rel-campos-acoes">
                    <button type="button" class="btn btn-ghost btn-sm" id="relPadrao">${icon('refresh')} Padrão</button>
                    <button type="button" class="btn btn-ghost btn-sm" id="relTodos">Marcar todas</button>
                    <button type="button" class="btn btn-ghost btn-sm" id="relNenhum">Limpar</button>
                </div>
            </div>
            <div class="rel-grupos">
                ${grupos.map(g => {
                    const cs = campos.filter(c => c.grupo === g.id);
                    return `
                    <div class="rel-grupo" data-grupo="${g.id}">
                        <div class="rel-grupo-head">
                            <span class="rel-grupo-ico">${icon(g.icon)}</span>
                            <strong>${g.label}</strong>
                            <span class="rel-grupo-n" data-n></span>
                            <label class="switch" title="Ligar/desligar o grupo"><input type="checkbox" data-grupo-all><span class="track"></span></label>
                        </div>
                        <div class="rel-grupo-body">
                            ${cs.map(c => `
                            <label class="rel-campo${c.fixo ? ' fixo' : ''}">
                                <span>${escapeHtml(c.label)}${c.fixo ? ' <small>sempre</small>' : ''}</span>
                                <span class="switch"><input type="checkbox" data-campo="${c.id}" ${c.fixo ? 'disabled' : ''}><span class="track"></span></span>
                            </label>`).join('')}
                        </div>
                    </div>`;
                }).join('')}
            </div>`,
        footer: ''
    });
    m.footer.innerHTML = `
        <div class="rel-foot-info" id="relFootInfo"></div>
        <button class="btn btn-secondary" data-cancel>Cancelar</button>
        <button class="btn btn-primary" id="relGerar"></button>`;
    m.footer.querySelector('[data-cancel]').onclick = () => m.close();

    const $ = s => m.el.querySelector(s);
    const bindSeg = (id, campo, after) => {
        const box = $(id);
        const sync = () => box.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.v === opt[campo]));
        box.querySelectorAll('button').forEach(b => b.onclick = () => { opt[campo] = b.dataset.v; sync(); after && after(); });
        sync();
    };
    const syncFormato = () => {
        const pdf = opt.formato === 'pdf';
        $('#relHeadIco').className = `rel-pop-ico ${opt.formato}`;
        $('#relHeadIco').innerHTML = icon(pdf ? 'filePdf' : 'fileSheet');
        $('#relHeadTit').textContent = pdf ? 'Relatório em PDF' : 'Relatório em Excel';
        $('#relPaisagemBox').hidden = !pdf;
        $('#relResumoHint').textContent = pdf ? 'Indicadores no topo da primeira página' : 'Aba extra com indicadores por unidade e cargo';
        $('#relGerar').innerHTML = `${icon('download')} Baixar ${pdf ? 'PDF' : 'Excel'}`;
    };
    const syncCampos = () => {
        m.el.querySelectorAll('[data-campo]').forEach(i => i.checked = sel.has(i.dataset.campo));
        m.el.querySelectorAll('.rel-grupo').forEach(g => {
            const ins = [...g.querySelectorAll('[data-campo]')];
            const on = ins.filter(i => i.checked).length;
            g.querySelector('[data-n]').textContent = `${on}/${ins.length}`;
            const all = g.querySelector('[data-grupo-all]');
            all.checked = on === ins.length;
            all.indeterminate = on > 0 && on < ins.length;
            g.classList.toggle('on', on > 0);
        });
        const n = sel.size;
        $('#relContagem').textContent = ` · ${n} selecionada${n !== 1 ? 's' : ''}`;
        const nf = ESCOPOS.find(e => e.id === opt.escopo).n();
        // Acima disto nem o A3 comporta a linha inteira e o PDF passa a continuar a tabela
        // em páginas seguintes — vale avisar antes, não depois de abrir o arquivo.
        const largo = opt.formato === 'pdf' && n > 16;
        $('#relFootInfo').innerHTML = `${icon(largo ? 'alert' : 'table')} <span><strong>${n}</strong> coluna${n !== 1 ? 's' : ''} · <strong>${nf}</strong> funcionário${nf !== 1 ? 's' : ''}${largo ? ' · <span class="txt-warning">muitas colunas: a tabela continua nas páginas seguintes (prefira Excel)</span>' : ''}</span>`;
        $('#relGerar').disabled = !nf;
    };

    bindSeg('#relFormato', 'formato', () => { syncFormato(); syncCampos(); });
    bindSeg('#relEscopo', 'escopo', syncCampos);
    [['#relAgrupar', 'agrupar'], ['#relResumo', 'resumo'], ['#relPaisagem', 'paisagem']].forEach(([id, k]) => {
        const i = $(id);
        i.checked = !!opt[k];
        i.onchange = () => { opt[k] = i.checked; };
    });
    m.el.querySelectorAll('[data-campo]').forEach(i => i.onchange = () => {
        i.checked ? sel.add(i.dataset.campo) : sel.delete(i.dataset.campo);
        syncCampos();
    });
    m.el.querySelectorAll('[data-grupo-all]').forEach(i => i.onchange = () => {
        const g = i.closest('.rel-grupo').dataset.grupo;
        campos.filter(c => c.grupo === g && !c.fixo).forEach(c => i.checked ? sel.add(c.id) : sel.delete(c.id));
        syncCampos();
    });
    const setSel = ids => { sel.clear(); ids.forEach(id => idsValidos.has(id) && sel.add(id)); sel.add('nome'); syncCampos(); };
    $('#relTodos').onclick = () => setSel(campos.map(c => c.id));
    $('#relNenhum').onclick = () => setSel([]);
    $('#relPadrao').onclick = () => setSel(REL_PADRAO);

    syncFormato();
    syncCampos();

    $('#relGerar').onclick = async () => {
        const btn = $('#relGerar');
        opt.titulo = $('#relTitulo').value.trim() || 'Relatório de funcionários';
        const cols = campos.filter(c => sel.has(c.id));
        const funcs = opt.escopo === 'filtro' ? funcFiltrados()
            : funcState.funcionarios.filter(f => opt.escopo === 'todos' || funcAtivo(f))
                .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
        if (!funcs.length) return toast('Nenhum funcionário no escopo escolhido.', 'info');

        relGravarPrefs({ campos: [...sel], escopo: opt.escopo, agrupar: opt.agrupar, resumo: opt.resumo, paisagem: opt.paisagem });
        const original = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Gerando...';
        try {
            const ctx = { asos: cols.some(c => c.aso) ? await DB.getAll(PATHS.asos) : [] };
            if (opt.formato === 'pdf') await gerarRelatorioPdf(funcs, cols, opt, ctx);
            else await gerarRelatorioXlsx(funcs, cols, opt, ctx);
            toast('Relatório gerado.');
            m.close();
        } catch (e) {
            console.error(e);
            toast(e.message || 'Erro ao gerar o relatório.', 'error');
            btn.disabled = false;
            btn.innerHTML = original;
        }
    };
}

// ---- Dados comuns aos dois formatos ----
function relDescricaoEscopo(opt) {
    if (opt.escopo === 'todos') return 'Todos os funcionários';
    if (opt.escopo === 'ativos') return 'Funcionários ativos';
    const { q, unidade, cargo, status } = funcState.filtro;
    const partes = [];
    const STATUS_TXT = { ativos: 'Ativos', ferias: 'De férias', ferias_vencendo: 'Férias vencendo', ferias_vencidas: 'Férias vencidas', desligados: 'Desligados', '': 'Todos' };
    partes.push(STATUS_TXT[status] ?? 'Ativos');
    if (unidade) partes.push(funcState.unidades.find(u => u.id === unidade)?.nome || 'Unidade');
    if (cargo) partes.push(funcState.cargos.find(c => c.id === cargo)?.nome || 'Cargo');
    if (q) partes.push(`busca "${q}"`);
    return partes.join(' · ');
}

// Grupos para "agrupar por unidade": em ordem alfabética, "Sem unidade" por último.
function relGrupos(funcs, opt) {
    if (!opt.agrupar) return [{ titulo: null, funcs }];
    const mapa = new Map();
    funcs.forEach(f => {
        const k = f.unidadeId && unidadeDe(f) ? f.unidadeId : '';
        if (!mapa.has(k)) mapa.set(k, []);
        mapa.get(k).push(f);
    });
    return [...mapa.entries()]
        .map(([k, fs]) => ({ titulo: k ? unidadeDe(fs[0]).nome : 'Sem unidade', un: k ? unidadeDe(fs[0]) : null, semUnidade: !k, funcs: fs }))
        .sort((a, b) => (a.semUnidade - b.semUnidade) || a.titulo.localeCompare(b.titulo));
}

function relIndicadores(funcs) {
    const ativos = funcs.filter(funcAtivo);
    const cls = funcs.map(relStatusDe);
    const ind = [
        { label: 'Funcionários', valor: fmtNum(funcs.length), num: funcs.length, cor: REL_COR.accent, tom: 'navy' },
        { label: 'Ativos', valor: fmtNum(ativos.length), num: ativos.length, cor: REL_COR.success, tom: 'verde' },
        { label: 'Desligados', valor: fmtNum(funcs.length - ativos.length), num: funcs.length - ativos.length, cor: REL_COR.muted, tom: 'verdeCinza' },
        { label: 'De férias', valor: fmtNum(cls.filter(c => c === 'ferias').length), num: cls.filter(c => c === 'ferias').length, cor: REL_COR.ferias, tom: 'azul' },
        { label: 'Férias vencidas', valor: fmtNum(cls.filter(c => c === 'vencida').length), num: cls.filter(c => c === 'vencida').length, cor: REL_COR.vencida, tom: 'vermelho' }
    ];
    if (can('ver_financeiro')) {
        const folha = ativos.reduce((s, f) => s + (Number(funcSalarioDe(f)) || 0), 0);
        ind.push({ label: 'Folha salarial (ativos)', valor: fmtBRL(folha), num: folha, fmt: '"R$" #,##0.00', cor: REL_COR.accentStrong, tom: 'navy' });
    }
    return ind;
}

const relNomeArquivo = (opt, ext) => {
    const base = (opt.titulo || 'relatorio-funcionarios').normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'relatorio';
    return `${base}-${hoje()}.${ext}`;
};
const relEmissao = () => {
    const d = new Date();
    return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};

// ---- PDF ----
// Identidade visual do PDF = padrão dos documentos LAMIC (modelo de protocolos): faixa
// azul-marinho com a logo branca na 1ª página, cabeçalho simples com a logo colorida nas
// demais, seções numeradas, tabelas com cabeçalho marinho e linhas alternadas em menta,
// rodapé institucional. A paleta é a do guia de estilo do modelo, não a da interface — o
// arquivo sai do sistema e circula como documento do laboratório.
const REL_PDF = {
    navy: [9, 30, 69], azul: [57, 152, 188], verdeCinza: [139, 170, 173], grafite: [77, 72, 71],
    menta: [244, 255, 248], verde: [30, 158, 106], ambar: [227, 154, 11], vermelho: [214, 69, 69],
    futuro: [107, 91, 184], linha: [221, 230, 228], azulSoft: [235, 244, 249], muted: [125, 133, 140]
};
const REL_PDF_STATUS = { on: 'verde', off: 'verdeCinza', ferias: 'azul', vencida: 'vermelho', vencendo: 'ambar', futuro: 'futuro' };
const REL_EMPRESA = 'LAMIC LABORATÓRIO · Razão social: LABORATORIO LAMIC LTDA · CNPJ: 06.736.219/0001-30 · NTO: Rua Padre Cícero, 759 – Centro – Juazeiro do Norte – CE';
// `r` = largura/altura da imagem, para desenhar sem distorcer.
const REL_IMG = {
    faixa: { src: 'img/relatorio/faixa.jpg', r: 1654 / 181, fmt: 'JPEG' },
    logoBranco: { src: 'img/relatorio/logo-branco.png', r: 520 / 164, fmt: 'PNG' },
    logoCor: { src: 'img/relatorio/logo-cor.png', r: 520 / 163, fmt: 'PNG' },
    // Faixa do rodapé: mesma família da faixa do topo (marinho, moléculas, onda azul),
    // com a onda em cima para "fechar" a página.
    rodape: { src: 'img/relatorio/rodape.jpg', r: 1654 / 110, fmt: 'JPEG' }
};

// Imagem → data URL para o jsPDF. Falha vira `null` (o PDF desenha um substituto vetorial):
// sem a arte, o relatório continua saindo — não é motivo para bloquear o download.
const _relImgs = {};
function relImagem(src) {
    if (!_relImgs[src]) _relImgs[src] = fetch(src)
        .then(r => { if (!r.ok) throw new Error(r.status); return r.blob(); })
        .then(b => new Promise((res, rej) => {
            const fr = new FileReader();
            fr.onload = () => res(fr.result);
            fr.onerror = rej;
            fr.readAsDataURL(b);
        }))
        .catch(() => { delete _relImgs[src]; return null; });
    return _relImgs[src];
}

async function gerarRelatorioPdf(funcs, cols, opt, ctx) {
    await relCarregarScript(REL_LIBS.jspdf);
    await relCarregarScript(REL_LIBS.autotable);
    const { jsPDF } = window.jspdf;
    const fs = cols.length > 12 ? 7 : cols.length > 8 ? 7.6 : 8.4;
    // Texto de cada célula calculado uma vez: serve para medir as colunas e para o corpo.
    const textos = new Map(funcs.map(f => [f.id, cols.map(c => String(c.txt(f, ctx) ?? '—'))]));

    // Largura mínima de cada coluna MEDIDA com a fonte real (não estimada por caracteres):
    // maior palavra do rótulo em negrito (o cabeçalho pode quebrar entre palavras, nunca
    // dentro de uma — "Nasciment/o") ou o maior conteúdo, limitado a 46 mm para textos
    // longos (e-mail, benefícios) quebrarem em linhas em vez de alargar a tabela inteira.
    // Cabendo, as colunas se esticam proporcionalmente até a borda. Não cabendo no A4, a
    // folha sobe para A3 (mesma orientação). Nem no A3: em vez de espremer tudo até quebrar
    // letra por letra, a tabela continua em páginas seguintes (quebra horizontal) repetindo
    // a coluna Nome, para cada linha seguir identificável.
    const PAD = 5.2, TETO = 46;
    const medidor = new jsPDF({ unit: 'mm' });
    const minimos = cols.map((c, i) => {
        medidor.setFont('helvetica', 'bold');
        medidor.setFontSize(fs - 0.6);
        const cab = Math.max(...c.label.toUpperCase().split(' ').map(p => medidor.getTextWidth(p)));
        medidor.setFontSize(fs);
        medidor.setFont('helvetica', c.id === 'nome' || c.id === 'status' ? 'bold' : 'normal');
        let corpo = 0;
        textos.forEach(t => { corpo = Math.max(corpo, medidor.getTextWidth(t[i])); });
        if (c.soma) corpo = Math.max(corpo, medidor.getTextWidth(fmtBRL(funcs.reduce((s, f) => s + (Number(c.xls(f, ctx)) || 0), 0))));
        return Math.max(cab, Math.min(corpo, TETO)) + PAD;
    });
    const somaMin = minimos.reduce((s, v) => s + v, 0);
    const util = { a4: opt.paisagem ? 297 : 210, a3: opt.paisagem ? 420 : 297 };
    const formato = somaMin > util.a4 - 24 && somaMin <= util.a3 - 24 ? 'a3' : 'a4';
    const doc = new jsPDF({ orientation: opt.paisagem ? 'landscape' : 'portrait', unit: 'mm', format: formato });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const MX = 12;
    const P = REL_PDF;
    const emissao = relEmissao();
    const escopoTxt = relDescricaoEscopo(opt);
    const autor = currentUser?.nome ? ` por ${currentUser.nome}` : '';
    const [faixa, logoBranco, logoCor, rodape] = await Promise.all(
        [REL_IMG.faixa, REL_IMG.logoBranco, REL_IMG.logoCor, REL_IMG.rodape].map(i => relImagem(i.src)));
    // Altura da faixa do rodapé (sangrada, largura total) e margem que a tabela respeita.
    const RB = W / REL_IMG.rodape.r;
    const MARGEM_BAIXO = RB + 5;

    // Texto com espaçamento entre letras (eyebrow "R E L A T Ó R I O"). O alinhamento à
    // direita do jsPDF ignora o charSpace, então a largura é calculada aqui.
    const textoEspacado = (t, x, y, cs, direita) => {
        const w = doc.getTextWidth(t) + cs * (t.length - 1);
        doc.text(t, direita ? x - w : x, y, { charSpace: cs });
    };

    // Altura da faixa segue a proporção da arte: largura total da página, sem distorcer.
    const HB = W / REL_IMG.faixa.r;
    const TOPO_N = 17;                      // linha azul do cabeçalho simples (págs. 2+)

    // Cabeçalho e rodapé são desenhados em todas as páginas no fim: a tabela respeita as
    // margens e nunca os cobre.
    const desenhaCabecalho = pagina => {
        if (pagina === 1) {
            if (faixa) doc.addImage(faixa, REL_IMG.faixa.fmt, 0, 0, W, HB, 'rel-faixa', 'FAST');
            else {
                doc.setFillColor(...P.navy); doc.rect(0, 0, W, HB, 'F');
                doc.setFillColor(...P.azul); doc.rect(0, HB - 1.6, W, 1.6, 'F');
            }
            // A onda azul ocupa ~10% de baixo da arte: centraliza no trecho marinho.
            const centro = HB * 0.45;
            const lh = Math.min(HB * 0.5, 17);
            if (logoBranco) doc.addImage(logoBranco, REL_IMG.logoBranco.fmt, MX + 2, centro - lh / 2, lh * REL_IMG.logoBranco.r, lh, 'rel-logo-b', 'FAST');
            else {
                doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(255, 255, 255);
                doc.text('LAMIC', MX + 2, centro + 3);
            }
            doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(255, 255, 255);
            textoEspacado('RECURSOS HUMANOS', W - MX, centro - 1.2, 0.9, true);
            doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(201, 214, 232);
            textoEspacado(`Emitido em ${emissao}`, W - MX, centro + 3.8, 0, true);
            return;
        }
        const lh = 8.5;
        if (logoCor) doc.addImage(logoCor, REL_IMG.logoCor.fmt, MX, TOPO_N - 3 - lh, lh * REL_IMG.logoCor.r, lh, 'rel-logo-c', 'FAST');
        else {
            doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...P.navy);
            doc.text('LAMIC', MX, TOPO_N - 4.5);
        }
        const sub = `RH  ·  Emitido em ${emissao}`;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...P.muted);
        const ws = doc.getTextWidth(sub);
        doc.text(sub, W - MX, TOPO_N - 4.5, { align: 'right' });
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...P.navy);
        doc.text(opt.titulo, W - MX - ws - 2, TOPO_N - 4.5, { align: 'right' });
        doc.setDrawColor(...P.azul); doc.setLineWidth(0.5);
        doc.line(MX, TOPO_N, W - MX, TOPO_N);
    };
    const desenhaRodape = (pagina, total) => {
        const y0 = H - RB;
        if (rodape) doc.addImage(rodape, REL_IMG.rodape.fmt, 0, y0, W, RB, 'rel-rodape', 'FAST');
        else {
            doc.setFillColor(...P.navy); doc.rect(0, y0, W, RB, 'F');
            doc.setFillColor(...P.azul); doc.rect(0, y0, W, 1.8, 'F');
        }
        // Trecho marinho = abaixo da onda (~17% de cima da arte).
        const topo = y0 + RB * 0.19, alto = RB * 0.81, meio = topo + alto / 2;

        // Logo branca à esquerda + filete vertical separando do texto institucional
        const lh = Math.min(alto * 0.62, 8.5);
        let x = MX;
        if (logoBranco) {
            doc.addImage(logoBranco, REL_IMG.logoBranco.fmt, x, meio - lh / 2, lh * REL_IMG.logoBranco.r, lh, 'rel-logo-b', 'FAST');
            x += lh * REL_IMG.logoBranco.r + 5;
        } else {
            doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(255, 255, 255);
            doc.text('LAMIC', x, meio + 1.5);
            x += doc.getTextWidth('LAMIC') + 5;
        }
        doc.setDrawColor(...P.azul); doc.setLineWidth(0.35);
        doc.line(x - 2.5, meio - lh / 2, x - 2.5, meio + lh / 2);

        // Paginação à direita, em destaque
        doc.setFont('helvetica', 'bold'); doc.setFontSize(6.4); doc.setTextColor(...P.azul);
        textoEspacado('PÁGINA', W - MX, meio - 1.6, 0.6, true);
        doc.setFontSize(10.5); doc.setTextColor(255, 255, 255);
        const pg = `${pagina} / ${total}`;
        doc.text(pg, W - MX, meio + 3.2, { align: 'right' });
        const xMax = W - MX - Math.max(doc.getTextWidth(pg), 12) - 6;

        // Texto institucional: quebra em linhas no espaço entre a logo e a paginação
        // (no A4 em pé a linha da empresa não cabe inteira).
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.6);
        const larg = xMax - x;
        const linhasEmp = doc.splitTextToSize(REL_EMPRESA, larg);
        doc.setFont('helvetica', 'italic');
        const linhasDoc = doc.splitTextToSize(`${opt.titulo} · Emitido em ${emissao}${autor} · Uso interno e confidencial`, larg);
        const lhTxt = 2.75;
        let ty = meio - ((linhasEmp.length + linhasDoc.length) * lhTxt) / 2 + 2.1;
        doc.setFont('helvetica', 'normal'); doc.setTextColor(222, 232, 244);
        linhasEmp.forEach(l => { doc.text(l, x, ty); ty += lhTxt; });
        doc.setFont('helvetica', 'italic'); doc.setTextColor(150, 182, 208);
        linhasDoc.forEach(l => { doc.text(l, x, ty); ty += lhTxt; });

        // Moléculas (como as da faixa do topo) no vão entre o texto e a paginação — desenhadas
        // aqui, não na arte, porque a largura do texto varia com a orientação e o título: na
        // imagem fixa elas acabavam atrás das letras. Sem vão suficiente, ficam de fora.
        doc.setFont('helvetica', 'normal');
        const fimTxt = x + Math.max(...linhasEmp.map(l => doc.getTextWidth(l)),
            ...(doc.setFont('helvetica', 'italic'), linhasDoc.map(l => doc.getTextWidth(l))));
        const r = Math.min(alto * 0.2, 2.6), dx = r * Math.sqrt(3);
        const vao = xMax - fimTxt;
        if (vao > dx * 2 + 12) {
            const cx = fimTxt + vao / 2 - dx / 2, cy = meio - r * 0.55;
            const hexa = (hx, hy, hr) => {
                const pts = Array.from({ length: 6 }, (_, i) => {
                    const a = (90 + 60 * i) * Math.PI / 180;
                    return [hx + hr * Math.cos(a), hy + hr * Math.sin(a)];
                });
                doc.setDrawColor(52, 88, 138); doc.setLineWidth(0.3);
                pts.forEach((p, i) => { const q = pts[(i + 1) % 6]; doc.line(p[0], p[1], q[0], q[1]); });
                doc.setFillColor(64, 104, 156);
                pts.forEach(p => doc.circle(p[0], p[1], 0.38, 'F'));
            };
            hexa(cx, cy, r); hexa(cx + dx, cy, r); hexa(cx + dx / 2, cy + 1.5 * r, r);
        }
    };

    // Título de seção numerado (círculo Azul LAMIC + título marinho), como no modelo.
    let nSecao = 0;
    const secao = (titulo, nota, y) => {
        nSecao++;
        doc.setFillColor(...P.azul); doc.circle(MX + 3.3, y, 3.3, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(255, 255, 255);
        doc.text(String(nSecao), MX + 3.3, y + 1.1, { align: 'center' });
        doc.setFontSize(12.5); doc.setTextColor(...P.navy);
        doc.text(titulo, MX + 9, y + 1.6);
        if (nota) {
            const wt = doc.getTextWidth(titulo);
            doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(...P.azul);
            doc.text(nota, MX + 9 + wt + 2.5, y + 1.6);
        }
        return y + 7.5;
    };

    // Bloco de título da 1ª página
    let y = HB + 9;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...P.azul);
    textoEspacado('RELATÓRIO  ·  GESTÃO DE PESSOAS', MX, y, 0.9);
    y += 8;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(opt.titulo.length > 55 ? 15 : 19); doc.setTextColor(...P.navy);
    doc.text(opt.titulo, MX, y);
    y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...P.grafite);
    doc.text(`${funcs.length} funcionário${funcs.length !== 1 ? 's' : ''}  ·  ${escopoTxt}  ·  Documento gerado${autor || ' pelo sistema'}`, MX, y, { maxWidth: W - 2 * MX });
    y += 5;
    doc.setDrawColor(...P.linha); doc.setLineWidth(0.3);
    doc.line(MX, y, W - MX, y);
    y += 9;

    // Visão geral (indicadores)
    if (opt.resumo) {
        y = secao('Visão geral', null, y);
        const ind = relIndicadores(funcs);
        // Cartão abaixo de ~38 mm não comporta "R$ 76.800,00" legível: quebra em duas fileiras.
        const gap = 4, ch = 18, gapY = 4;
        const porLinha = (W - 2 * MX - gap * (ind.length - 1)) / ind.length >= 38 ? ind.length : Math.ceil(ind.length / 2);
        const cw = (W - 2 * MX - gap * (porLinha - 1)) / porLinha;
        const y0 = y;
        ind.forEach((k, i) => {
            const x = MX + (i % porLinha) * (cw + gap);
            const y = y0 + Math.floor(i / porLinha) * (ch + gapY);
            doc.setFillColor(255, 255, 255); doc.setDrawColor(...P.linha); doc.setLineWidth(0.3);
            doc.roundedRect(x, y, cw, ch, 1.8, 1.8, 'FD');
            doc.setFillColor(...P[k.tom || 'navy']); doc.rect(x, y + 0.9, 1.3, ch - 1.8, 'F');
            // Rótulo encolhe (espaçamento, depois fonte) até caber no cartão.
            const rot = k.label.toUpperCase();
            let fsr = 6.6, cs = 0.35;
            doc.setFont('helvetica', 'bold'); doc.setTextColor(...P.muted);
            for (;;) {
                doc.setFontSize(fsr);
                if (doc.getTextWidth(rot) + cs * (rot.length - 1) <= cw - 7 || fsr <= 5) break;
                if (cs > 0) cs = Math.max(0, cs - 0.15); else fsr -= 0.3;
            }
            textoEspacado(rot, x + 5, y + 6, cs);
            let fsv = 16;
            doc.setTextColor(...P.navy);
            do { doc.setFontSize(fsv); fsv -= 0.5; } while (doc.getTextWidth(k.valor) > cw - 8 && fsv > 8);
            doc.text(k.valor, x + 5, y + 14);
        });
        y = y0 + Math.ceil(ind.length / porLinha) * (ch + gapY) - gapY + 10;
    }

    // Funcionários (tabela)
    y = secao('Funcionários', opt.agrupar ? 'agrupados por unidade' : 'em ordem alfabética', y);
    const largura = W - 2 * MX;
    const quebraHorizontal = somaMin > largura;
    const columnStyles = {};
    cols.forEach((c, i) => {
        // Sobra de largura distribuída na proporção do mínimo de cada coluna.
        const cw = quebraHorizontal ? minimos[i] : minimos[i] * largura / somaMin;
        columnStyles[i] = { cellWidth: cw, halign: c.align || 'left' };
        if (c.id === 'nome') Object.assign(columnStyles[i], { fontStyle: 'bold', textColor: P.navy });
    });
    const iStatus = cols.findIndex(c => c.id === 'status');
    const somas = cols.filter(c => c.soma);

    relGrupos(funcs, opt).forEach(g => {
        if (g.titulo) {
            if (y > H - MARGEM_BAIXO - 30) { doc.addPage(); y = TOPO_N + 8; }
            // Cartão informativo do modelo: fundo azul-claro com barra Azul LAMIC à esquerda.
            doc.setFillColor(...P.azulSoft); doc.rect(MX, y, largura, 9, 'F');
            doc.setFillColor(...P.azul); doc.rect(MX, y, 1.2, 9, 'F');
            doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...P.navy);
            doc.text(g.titulo, MX + 5, y + 5.9);
            const det = [g.un?.cnpj && `CNPJ ${g.un.cnpj}`, g.un?.endereco].filter(Boolean).join('  ·  ');
            if (det) {
                const wt = doc.getTextWidth(g.titulo);
                doc.setFont('helvetica', 'normal'); doc.setFontSize(7.8); doc.setTextColor(...P.grafite);
                doc.text(det, MX + 5 + wt + 3, y + 5.9, { maxWidth: largura - wt - 45 });
            }
            doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...P.azul);
            doc.text(`${g.funcs.length} funcionário${g.funcs.length !== 1 ? 's' : ''}`, W - MX - 4, y + 5.9, { align: 'right' });
            y += 11;
        }
        const body = g.funcs.map(f => textos.get(f.id));
        // Linha de total para colunas somáveis (salário, custo de benefícios)
        const foot = somas.length ? [cols.map((c, i) => {
            if (c.soma) return fmtBRL(g.funcs.reduce((s, f) => s + (Number(c.xls(f, ctx)) || 0), 0));
            return i === 0 ? (g.titulo ? 'SUBTOTAL' : 'TOTAL') : '';
        })] : undefined;

        doc.autoTable({
            startY: y,
            head: [cols.map(c => c.label.toUpperCase())],
            body,
            foot,
            showFoot: 'lastPage',
            margin: { top: TOPO_N + 7, bottom: MARGEM_BAIXO, left: MX, right: MX },
            tableWidth: quebraHorizontal ? 'auto' : largura,
            horizontalPageBreak: quebraHorizontal,
            horizontalPageBreakRepeat: quebraHorizontal ? 0 : null,
            rowPageBreak: 'avoid',
            styles: {
                font: 'helvetica', fontSize: fs, cellPadding: { top: 2.4, bottom: 2.4, left: 2.4, right: 2.4 },
                textColor: P.grafite, lineColor: P.linha, lineWidth: { bottom: 0.25 }, overflow: 'linebreak', valign: 'middle'
            },
            headStyles: {
                fillColor: P.navy, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: fs - 0.6,
                cellPadding: { top: 2.8, bottom: 2.8, left: 2.4, right: 2.4 }, lineWidth: 0
            },
            footStyles: { fillColor: P.azulSoft, textColor: P.navy, fontStyle: 'bold', fontSize: fs, lineWidth: 0 },
            alternateRowStyles: { fillColor: P.menta },
            columnStyles,
            didParseCell: d => {
                const c = cols[d.column.index];
                if (d.section === 'head' || d.section === 'foot') d.cell.styles.halign = c.soma && d.section === 'foot' ? 'right' : (c.align || 'left');
                if (d.section === 'body' && d.column.index === iStatus) {
                    const tom = REL_PDF_STATUS[relStatusDe(g.funcs[d.row.index])];
                    if (tom) { d.cell.styles.textColor = P[tom]; d.cell.styles.fontStyle = 'bold'; }
                }
            }
        });
        y = doc.lastAutoTable.finalY + 8;
    });

    const total = doc.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
        doc.setPage(p);
        desenhaCabecalho(p);
        desenhaRodape(p, total);
    }
    doc.setProperties({ title: opt.titulo, subject: escopoTxt, author: currentUser?.nome || 'LAMIC Laboratório', creator: 'RH LAMIC' });
    doc.save(relNomeArquivo(opt, 'pdf'));
}

// ---- Excel ----
async function gerarRelatorioXlsx(funcs, cols, opt, ctx) {
    await relCarregarScript(REL_LIBS.exceljs);
    const C = REL_COR;
    const wb = new ExcelJS.Workbook();
    wb.creator = currentUser?.nome || 'RH LAMIC';
    wb.created = new Date();
    wb.title = opt.titulo;
    // Totais são fórmulas sem valor em cache: força o Excel a calcular ao abrir.
    wb.calcProperties.fullCalcOnLoad = true;

    const fill = rgb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: relArgb(rgb) } });
    const borda = rgb => ({ style: 'thin', color: { argb: relArgb(rgb) } });
    const fonte = (extra = {}) => ({ name: 'Calibri', size: 10.5, color: { argb: relArgb(C.text) }, ...extra });
    const n = Math.max(cols.length, 4);

    // Faixa de título (linhas 1-3) — mesma identidade do PDF
    const faixaTitulo = (ws, larg, subtitulo) => {
        ws.mergeCells(1, 1, 1, larg);
        ws.mergeCells(2, 1, 2, larg);
        const t = ws.getCell(1, 1);
        t.value = opt.titulo;
        t.font = fonte({ size: 18, bold: true, color: { argb: 'FFFFFFFF' } });
        t.alignment = { vertical: 'middle', indent: 1 };
        const s = ws.getCell(2, 1);
        s.value = subtitulo;
        s.font = fonte({ size: 10, color: { argb: relArgb(C.navySub) } });
        s.alignment = { vertical: 'top', indent: 1 };
        for (let c = 1; c <= larg; c++) {
            ws.getCell(1, c).fill = fill(C.navy);
            ws.getCell(2, c).fill = fill(C.navy);
            ws.getCell(3, c).fill = fill(C.accent);
        }
        ws.getRow(1).height = 36;
        ws.getRow(2).height = 22;
        ws.getRow(3).height = 4;
        ws.getRow(4).height = 10;
    };
    const subtitulo = `RH LAMIC · Emitido em ${relEmissao()} · ${funcs.length} funcionário${funcs.length !== 1 ? 's' : ''} · ${relDescricaoEscopo(opt)}`;

    // ---- Aba principal ----
    const HEAD_ROW = 5;
    const ws = wb.addWorksheet('Funcionários', {
        views: [{ state: 'frozen', ySplit: HEAD_ROW, xSplit: 1, showGridLines: false }],
        pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
        headerFooter: { oddFooter: `&L&8${opt.titulo}&R&8Página &P de &N` }
    });
    ws.columns = Array.from({ length: n }, (_, i) => ({ width: cols[i] ? Math.max(cols[i].w * 1.05, cols[i].label.length + 4) : 12 }));
    faixaTitulo(ws, n, subtitulo);

    const head = ws.getRow(HEAD_ROW);
    cols.forEach((c, i) => {
        const cell = head.getCell(i + 1);
        cell.value = c.label;
        cell.font = fonte({ bold: true, color: { argb: 'FFFFFFFF' } });
        cell.fill = fill(C.accent);
        cell.alignment = { vertical: 'middle', horizontal: c.align || 'left', wrapText: true, indent: c.align ? 0 : 1 };
        cell.border = { bottom: borda(C.accentStrong) };
    });
    head.height = 26;
    ws.pageSetup.printTitlesRow = `${HEAD_ROW}:${HEAD_ROW}`;

    let r = HEAD_ROW + 1;
    const iStatus = cols.findIndex(c => c.id === 'status');
    const linhasDados = [];
    const linhaTotal = (rotulo, ini, fim, forte) => {
        const row = ws.getRow(r);
        row.getCell(1).value = rotulo;
        cols.forEach((c, i) => {
            const cell = row.getCell(i + 1);
            if (c.soma) {
                const L = ws.getColumn(i + 1).letter;
                // Fórmula, não valor: quem editar uma linha na planilha vê o total acompanhar.
                cell.value = { formula: `SUBTOTAL(9,${L}${ini}:${L}${fim})` };
                cell.numFmt = c.fmt;
                cell.alignment = { horizontal: 'right', vertical: 'middle' };
            }
            cell.font = fonte({ bold: true, color: { argb: relArgb(C.accentStrong) } });
            cell.fill = fill(forte ? C.accentSoft : C.surface2);
            cell.border = { top: borda(forte ? C.accent : C.border) };
            if (i === 0) cell.alignment = { vertical: 'middle', indent: 1 };
        });
        row.height = 22;
        r++;
    };

    const grupos = relGrupos(funcs, opt);
    const somas = cols.some(c => c.soma);
    grupos.forEach(g => {
        if (g.titulo) {
            ws.mergeCells(r, 1, r, n);
            const cell = ws.getCell(r, 1);
            cell.value = `${g.titulo}  ·  ${g.funcs.length} funcionário${g.funcs.length !== 1 ? 's' : ''}`;
            cell.font = fonte({ bold: true, size: 11, color: { argb: relArgb(C.accentStrong) } });
            cell.fill = fill(C.accentSoft);
            cell.alignment = { vertical: 'middle', indent: 1 };
            cell.border = { left: { style: 'thick', color: { argb: relArgb(C.accent) } } };
            ws.getRow(r).height = 24;
            r++;
        }
        const ini = r;
        g.funcs.forEach((f, idx) => {
            const row = ws.getRow(r);
            cols.forEach((c, i) => {
                const cell = row.getCell(i + 1);
                const v = c.xls ? c.xls(f, ctx) : c.txt(f, ctx);
                cell.value = v === '—' || v == null ? (c.xls ? null : '—') : v;
                if (c.fmt) cell.numFmt = c.fmt;
                cell.font = fonte(c.id === 'nome' ? { bold: true } : {});
                cell.alignment = { vertical: 'middle', horizontal: c.align || 'left', indent: c.align ? 0 : 1, wrapText: c.w >= 22 };
                cell.border = { bottom: borda(C.border) };
                if (idx % 2) cell.fill = fill(C.surface2);
                if (i === iStatus) {
                    const st = REL_STATUS[relStatusDe(f)];
                    if (st) cell.font = fonte({ bold: true, color: { argb: relArgb(st.cor) } });
                }
            });
            row.height = 20;
            linhasDados.push(r);
            r++;
        });
        if (somas && g.titulo) linhaTotal('Subtotal', ini, r - 1, false);
        if (g.titulo) r++;                              // respiro entre unidades
    });
    // Total geral: SUBTOTAL ignora as linhas de subtotal, então somar o intervalo inteiro
    // não conta duas vezes.
    if (somas) linhaTotal('Total geral', HEAD_ROW + 1, r - 1, true);
    if (!opt.agrupar) ws.autoFilter = { from: { row: HEAD_ROW, column: 1 }, to: { row: HEAD_ROW + funcs.length, column: cols.length } };

    // ---- Aba de resumo ----
    if (opt.resumo) {
        const rs = wb.addWorksheet('Resumo', { views: [{ showGridLines: false }], properties: { tabColor: { argb: relArgb(C.accent) } } });
        const fin = can('ver_financeiro');
        const larg = fin ? 5 : 4;
        rs.columns = [{ width: 34 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 20 }].slice(0, larg);
        faixaTitulo(rs, larg, subtitulo);

        let y = 5;
        // Indicadores em cartões (rótulo em cima, valor grande embaixo)
        const ind = relIndicadores(funcs);
        rs.getCell(y, 1).value = 'INDICADORES';
        rs.getCell(y, 1).font = fonte({ bold: true, size: 9, color: { argb: relArgb(C.muted) } });
        y++;
        ind.forEach(k => {
            const a = rs.getCell(y, 1), b = rs.getCell(y, 2);
            rs.mergeCells(y, 2, y, larg);
            a.value = k.label;
            a.font = fonte({ color: { argb: relArgb(C.text2) } });
            a.border = { left: { style: 'thick', color: { argb: relArgb(k.cor) } }, bottom: borda(C.border) };
            a.alignment = { vertical: 'middle', indent: 1 };
            b.value = k.num;
            if (k.fmt) b.numFmt = k.fmt;
            b.font = fonte({ bold: true, size: 13 });
            b.alignment = { vertical: 'middle', horizontal: 'right' };
            for (let c = 1; c <= larg; c++) {
                rs.getCell(y, c).fill = fill(C.surface2);
                if (c > 1) rs.getCell(y, c).border = { bottom: borda(C.border) };
            }
            rs.getRow(y).height = 24;
            y++;
        });

        const tabela = (titulo, rotulo, chaveDe, nomeDe) => {
            y += 1;
            rs.getCell(y, 1).value = titulo.toUpperCase();
            rs.getCell(y, 1).font = fonte({ bold: true, size: 9, color: { argb: relArgb(C.muted) } });
            y++;
            const cab = [rotulo, 'Total', 'Ativos', 'Desligados', ...(fin ? ['Folha (ativos)'] : [])];
            cab.forEach((t, i) => {
                const c = rs.getCell(y, i + 1);
                c.value = t;
                c.font = fonte({ bold: true, color: { argb: 'FFFFFFFF' } });
                c.fill = fill(C.accent);
                c.alignment = { vertical: 'middle', horizontal: i ? 'center' : 'left', indent: i ? 0 : 1 };
            });
            rs.getRow(y).height = 22;
            y++;
            const mapa = new Map();
            funcs.forEach(f => {
                const k = chaveDe(f);
                if (!mapa.has(k)) mapa.set(k, []);
                mapa.get(k).push(f);
            });
            const ini = y;
            [...mapa.entries()].sort((a, b) => b[1].length - a[1].length || nomeDe(a[0]).localeCompare(nomeDe(b[0])))
                .forEach(([k, fs], idx) => {
                    const at = fs.filter(funcAtivo);
                    const vals = [nomeDe(k), fs.length, at.length, fs.length - at.length,
                        ...(fin ? [at.reduce((s, f) => s + (Number(funcSalarioDe(f)) || 0), 0)] : [])];
                    vals.forEach((v, i) => {
                        const c = rs.getCell(y, i + 1);
                        c.value = v;
                        c.font = fonte(i ? {} : { bold: true });
                        c.alignment = { vertical: 'middle', horizontal: i === 4 ? 'right' : i ? 'center' : 'left', indent: i ? 0 : 1 };
                        c.border = { bottom: borda(C.border) };
                        if (i === 4) c.numFmt = '"R$" #,##0.00';
                        if (idx % 2) c.fill = fill(C.surface2);
                    });
                    rs.getRow(y).height = 20;
                    y++;
                });
            ['Total', ...[2, 3, 4, ...(fin ? [5] : [])].map(ci => ({ formula: `SUM(${rs.getColumn(ci).letter}${ini}:${rs.getColumn(ci).letter}${y - 1})` }))]
                .forEach((v, i) => {
                    const c = rs.getCell(y, i + 1);
                    c.value = v;
                    c.font = fonte({ bold: true, color: { argb: relArgb(C.accentStrong) } });
                    c.fill = fill(C.accentSoft);
                    c.border = { top: borda(C.accent) };
                    c.alignment = { vertical: 'middle', horizontal: i === 4 ? 'right' : i ? 'center' : 'left', indent: i ? 0 : 1 };
                    if (i === 4) c.numFmt = '"R$" #,##0.00';
                });
            rs.getRow(y).height = 22;
            y++;
        };
        tabela('Por unidade', 'Unidade', f => (unidadeDe(f) ? f.unidadeId : ''),
            k => funcState.unidades.find(u => u.id === k)?.nome || 'Sem unidade');
        tabela('Por cargo', 'Cargo', f => (cargoDe(f) ? f.cargoId : ''),
            k => funcState.cargos.find(c => c.id === k)?.nome || 'Sem cargo');
    }

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = relNomeArquivo(opt, 'xlsx');
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}
