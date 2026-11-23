// Indicadores e gráficos (dirigidos pela config da agenda)

const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const IND_STATUS = ['Agendado', 'Em andamento', 'Concluído', 'Ausente', 'Cancelado'];
const IND_STATUS_COR = { 'Agendado': '#f59e0b', 'Em andamento': '#8b5cf6', 'Concluído': '#22c55e', 'Ausente': '#d97706', 'Cancelado': '#ef4444' };
const IND_COR_MEDIA = '#ef4444';

// ── ESTADO DOS FILTROS ─────────────────────────────────────
const _hojeInd = new Date();
const indFiltro = {
    modo: 'year',                 // 'all' | 'year' | 'range'
    ano: _hojeInd.getFullYear(),  // ano do modo 'year'
    viewAno: _hojeInd.getFullYear(), // ano exibido na grade de meses
    ini: null, fim: null,         // 'YYYY-MM' do modo 'range'
    pendente: false,              // aguardando o 2º clique do intervalo
    granul: 'mes',                // 'mes' | 'dia'
    passoHorario: 60,             // agrupamento do gráfico por horário (min)
    horaDe: '', horaAte: '',
    status: [],                   // vazio = todos
    tipos: [],                    // 'Particular' e/ou 'Convênio'
    convenios: [],                // nomes de convênio (vazio = todos)
    buscaConvenio: '',
    cidades: [],                  // cidades normalizadas (vazio = todas)
    buscaCidade: ''
};

const _ym = (ano, mes) => `${ano}-${String(mes + 1).padStart(2, '0')}`;
const _rotuloYm = ym => `${MESES_CURTOS[+ym.slice(5, 7) - 1]}/${ym.slice(2, 4)}`;

// ── POPOVERS ───────────────────────────────────────────────
function toggleIndPopover(nome, forcarFechar) {
    document.querySelectorAll('.ind-pop').forEach(p => {
        if (p.id === `ind-pop-${nome}` && !forcarFechar) p.classList.toggle('hidden');
        else p.classList.add('hidden');
    });
    if (nome === 'periodo') _renderIndPeriodo();
}

document.addEventListener('click', e => {
    // Alvo removido por um re-render (ex.: grade de meses) conta como clique dentro
    if (document.contains(e.target) && !e.target.closest('[data-ind-pop-wrap]')) {
        document.querySelectorAll('.ind-pop').forEach(p => p.classList.add('hidden'));
    }
});

// ── PERÍODO ────────────────────────────────────────────────
function setIndModo(modo) {
    indFiltro.modo = modo;
    indFiltro.pendente = false;
    if (modo === 'year') indFiltro.ano = indFiltro.viewAno;
    if (modo === 'range' && !indFiltro.ini) {
        indFiltro.ini = indFiltro.fim = _ym(indFiltro.viewAno, _hojeInd.getMonth());
    }
    _rerenderInd();
}

function mudarIndAno(delta) {
    indFiltro.viewAno += delta;
    if (indFiltro.modo === 'year') { indFiltro.ano = indFiltro.viewAno; _rerenderInd(); }
    else _renderIndPeriodo();
}

function clicarIndMes(mes) {
    const ym = _ym(indFiltro.viewAno, mes);
    if (indFiltro.modo !== 'range' || !indFiltro.pendente) {
        indFiltro.modo = 'range';
        indFiltro.ini = indFiltro.fim = ym;
        indFiltro.pendente = true;
    } else {
        if (ym < indFiltro.ini) { indFiltro.fim = indFiltro.ini; indFiltro.ini = ym; }
        else indFiltro.fim = ym;
        indFiltro.pendente = false;
    }
    _rerenderInd();
}

function _textoPeriodo() {
    if (indFiltro.modo === 'all') return 'Todo o período';
    if (indFiltro.modo === 'year') return `Ano ${indFiltro.ano}`;
    return indFiltro.ini === indFiltro.fim
        ? _rotuloYm(indFiltro.ini)
        : `${_rotuloYm(indFiltro.ini)} — ${_rotuloYm(indFiltro.fim)}`;
}

function _renderIndPeriodo() {
    document.querySelectorAll('[data-ind-modo]').forEach(b =>
        b.classList.toggle('ativo', b.dataset.indModo === indFiltro.modo));
    const grade = document.getElementById('ind-periodo-grade');
    if (grade) grade.classList.toggle('hidden', indFiltro.modo === 'all');
    const label = document.getElementById('ind-ano-label');
    if (label) label.innerText = indFiltro.viewAno;

    const meses = document.getElementById('ind-meses');
    if (meses) {
        meses.innerHTML = MESES_CURTOS.map((nome, m) => {
            const ym = _ym(indFiltro.viewAno, m);
            let cls = '';
            if (indFiltro.modo === 'year' && indFiltro.ano === indFiltro.viewAno) cls = 'meio';
            if (indFiltro.modo === 'range') {
                if (ym === indFiltro.ini || ym === indFiltro.fim) cls = 'ponta';
                else if (ym > indFiltro.ini && ym < indFiltro.fim) cls = 'meio';
            }
            return `<button type="button" onclick="clicarIndMes(${m})" class="ind-mes ${cls}">${nome}</button>`;
        }).join('');
    }
    const rodape = document.getElementById('ind-periodo-rodape');
    if (rodape) {
        rodape.innerText = indFiltro.pendente ? 'Escolha o mês final' : _textoPeriodo();
    }
}

// ── HORÁRIO ────────────────────────────────────────────────
function aplicarIndHorario() {
    indFiltro.horaDe = document.getElementById('ind-hora-de').value;
    indFiltro.horaAte = document.getElementById('ind-hora-ate').value;
    _rerenderInd();
}

function limparIndHorario() {
    indFiltro.horaDe = indFiltro.horaAte = '';
    document.getElementById('ind-hora-de').value = '';
    document.getElementById('ind-hora-ate').value = '';
    toggleIndPopover('horario', true);
    _rerenderInd();
}

// ── LISTAS MULTI-SELEÇÃO (status, tipo) ────────────────────
function _opcaoInd(grupo, valor, marcado, rotulo) {
    return `<button type="button" class="ind-opcao ${marcado ? 'ativo' : ''}" data-ind-grupo="${grupo}" data-ind-valor="${valor}">
        <span class="caixa">${marcado ? '<i class="fas fa-check"></i>' : ''}</span>${rotulo || valor}</button>`;
}

function _renderIndListas() {
    const st = document.getElementById('ind-status-lista');
    if (st) {
        st.innerHTML = IND_STATUS.map(s => _opcaoInd('status', s, indFiltro.status.includes(s),
            `<span class="h-2 w-2 rounded-full" style="background:${IND_STATUS_COR[s]}"></span>${s}`)).join('');
    }
    const tp = document.getElementById('ind-tipo-lista');
    if (tp) {
        const conv = typeof TAXA_COLETA_CONVENIOS !== 'undefined' ? TAXA_COLETA_CONVENIOS : [];
        tp.innerHTML = ['Particular', 'Convênio'].map(t => _opcaoInd('tipos', t, indFiltro.tipos.includes(t))).join('');
    }
    const cd = document.getElementById('ind-cidade-lista');
    if (cd) {
        // Cidades presentes nos agendamentos da agenda, por volume
        const cont = {};
        appointments.forEach(a => { const c = _cidadeInd(a); if (c) cont[c] = (cont[c] || 0) + 1; });
        const norm = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
        const busca = norm(indFiltro.buscaCidade);
        const lista = Object.entries(cont).sort((a, b) => b[1] - a[1]).filter(([c]) => !busca || c.includes(busca));
        cd.innerHTML = lista.length
            ? lista.map(([c, n]) => _opcaoInd('cidades', c, indFiltro.cidades.includes(c),
                `<span class="flex-1">${c}</span><span class="text-[10px] text-slate-400">${n}</span>`)).join('')
            : '<p class="text-xs text-slate-400 px-2 py-2">Nenhuma cidade.</p>';
    }
    const cv = document.getElementById('ind-convenio-lista');
    if (cv) {
        const conv = typeof TAXA_COLETA_CONVENIOS !== 'undefined' ? TAXA_COLETA_CONVENIOS : [];
        const norm = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const busca = norm(indFiltro.buscaConvenio);
        // Particular primeiro: entra no mesmo filtro que os convênios
        const lista = ['Particular', ...conv, CONV_NAO_ESPECIFICADO, CONV_NAO_INFORMADO].filter(c => !busca || norm(c).includes(busca));
        cv.innerHTML = lista.length
            ? lista.map(c => _opcaoInd('convenios', c, indFiltro.convenios.includes(c))).join('')
            : '<p class="text-xs text-slate-400 px-2 py-2">Nenhum convênio.</p>';
    }
}

document.addEventListener('click', e => {
    const op = e.target.closest('.ind-opcao');
    if (!op) return;
    const lista = indFiltro[op.dataset.indGrupo];
    const v = op.dataset.indValor;
    const i = lista.indexOf(v);
    if (i >= 0) lista.splice(i, 1); else lista.push(v);
    _rerenderInd();
});

function setIndPassoHorario(min) {
    indFiltro.passoHorario = min;
    _rerenderInd();
}

// Categorias de cobrança de registros antigos, anteriores aos campos de tipo/convênio
const CONV_NAO_ESPECIFICADO = 'Convênio não especificado';
const CONV_NAO_INFORMADO = 'Tipo não informado';

// Convênios do registro, com 'Particular' quando o tipo inclui particular.
// Sempre devolve ao menos uma categoria, para as partes somarem 100%.
function _conveniosDoRegistro(a) {
    const tipos = a.taxaColetaTipos || [];
    const convs = a.taxaColetaConvenios || [];
    const lista = tipos.includes('Particular') ? ['Particular'] : [];
    if (convs.length) lista.push(...convs);
    else if (tipos.includes('Convênio')) lista.push(CONV_NAO_ESPECIFICADO);
    if (!lista.length) lista.push(CONV_NAO_INFORMADO);
    return lista;
}

// Cidade normalizada (maiúsculas, sem acento) — mesma regra da Demografia
const _cidadeInd = a => String(a.cidade || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/\s+/g, ' ').trim();

function buscarIndCidade(v) {
    indFiltro.buscaCidade = v;
    _renderIndListas();
}

function buscarIndConvenio(v) {
    indFiltro.buscaConvenio = v;
    _renderIndListas();
}

// ── GRANULARIDADE / LIMPAR ─────────────────────────────────
function setIndGranularidade(g) {
    indFiltro.granul = g;
    _rerenderInd();
}

function limparIndFiltros() {
    Object.assign(indFiltro, {
        modo: 'year', ano: _hojeInd.getFullYear(), viewAno: _hojeInd.getFullYear(),
        ini: null, fim: null, pendente: false, horaDe: '', horaAte: '', status: [], tipos: [], convenios: [], buscaConvenio: '', cidades: [], buscaCidade: ''
    });
    ['ind-hora-de', 'ind-hora-ate'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    _rerenderInd();
}

// ── FILTRAGEM ──────────────────────────────────────────────
// Intervalo de datas [inicio, fim] (YYYY-MM-DD) do período escolhido
function _indIntervaloDatas(dados) {
    if (indFiltro.modo === 'year') return [`${indFiltro.ano}-01-01`, `${indFiltro.ano}-12-31`];
    if (indFiltro.modo === 'range') {
        const [a, m] = indFiltro.fim.split('-').map(Number);
        const ultimo = new Date(a, m, 0).getDate();
        return [`${indFiltro.ini}-01`, `${indFiltro.fim}-${String(ultimo).padStart(2, '0')}`];
    }
    if (!dados.length) return [null, null];
    const datas = dados.map(a => a.data).sort();
    return [datas[0], datas[datas.length - 1]];
}

function filterIndData() {
    const agenda = currentAgenda();
    const de = timeToMin(indFiltro.horaDe);
    const ate = timeToMin(indFiltro.horaAte);
    const usaTipo = temCampo('endereco', agenda) && indFiltro.tipos.length;
    const usaConv = temCampo('endereco', agenda) && indFiltro.convenios.length;
    const usaCidade = temCampo('endereco', agenda) && indFiltro.cidades.length;

    const base = appointments.filter(a => {
        if (!a.data) return false;
        if (indFiltro.modo === 'year' && !a.data.startsWith(String(indFiltro.ano))) return false;
        if (indFiltro.modo === 'range') {
            const ym = a.data.slice(0, 7);
            if (ym < indFiltro.ini || ym > indFiltro.fim) return false;
        }
        const min = timeToMin(a.horaInicio);
        if (de !== null && (min === null || min < de)) return false;
        if (ate !== null && (min === null || min > ate)) return false;
        if (indFiltro.status.length && !indFiltro.status.includes(a.status)) return false;
        if (usaTipo && !(a.taxaColetaTipos || []).some(t => indFiltro.tipos.includes(t))) return false;
        if (usaConv && !_conveniosDoRegistro(a).some(c => indFiltro.convenios.includes(c))) return false;
        if (usaCidade && !indFiltro.cidades.includes(_cidadeInd(a))) return false;
        return true;
    });
    return base;
}

// ── GRÁFICOS ───────────────────────────────────────────────
function _resetChart(chave) {
    if (charts[chave]) { charts[chave].destroy(); charts[chave] = null; }
}

// Média dos baldes com movimento (zeros de meses futuros não puxam a média)
function _mediaComMovimento(valores) {
    const v = valores.filter(n => n > 0);
    return v.length ? Math.round(v.reduce((s, n) => s + n, 0) / v.length) : 0;
}

// Barras verticais + linha de média
function _graficoVolume(chave, canvasId, labels, valores, cor) {
    _resetChart(chave);
    const el = document.getElementById(canvasId);
    if (!el) return;
    const media = _mediaComMovimento(valores);
    charts[chave] = new Chart(el, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { type: 'bar', label: 'Volume', data: valores, backgroundColor: cor, order: 2, maxBarThickness: 46 },
                { type: 'line', label: `Média (${media})`, data: labels.map(() => media), borderColor: IND_COR_MEDIA,
                  borderWidth: 2, pointRadius: 0, pointHoverRadius: 0, order: 1, tension: 0 }
            ]
        },
        options: {
            maintainAspectRatio: false,
            layout: { padding: { top: 18 } },
            plugins: { legend: { position: 'top' }, rotuloValor: { display: labels.length <= 40 } },
            scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } }
        }
    });
}

// Barras horizontais (rankings)
function _graficoRanking(chave, canvasId, pares, cor, formato) {
    _resetChart(chave);
    const el = document.getElementById(canvasId);
    if (!el) return;
    charts[chave] = new Chart(el, {
        type: 'bar',
        data: {
            labels: pares.map(p => p[0]),
            datasets: [{ data: pares.map(p => p[1]), backgroundColor: pares.map(p => p[2] || cor), maxBarThickness: 22 }]
        },
        options: {
            indexAxis: 'y',
            maintainAspectRatio: false,
            layout: { padding: { right: 34 } },
            plugins: { legend: { display: false }, rotuloValor: { display: true, formato } },
            scales: { x: { beginAtZero: true, ticks: { precision: 0 } }, y: { grid: { display: false } } }
        }
    });
}

function _contar(dados, chaveFn) {
    const mapa = {};
    dados.forEach(a => {
        [].concat(chaveFn(a) || []).forEach(k => { if (k) mapa[k] = (mapa[k] || 0) + 1; });
    });
    return Object.entries(mapa).sort((x, y) => y[1] - x[1]);
}

function _volumeSeries(dados, intervalo) {
    const [ini, fim] = intervalo;
    const labels = [], chaves = [];
    if (ini && fim) {
        if (indFiltro.granul === 'dia') {
            const d = new Date(ini + 'T12:00:00');
            const f = new Date(fim + 'T12:00:00');
            const varioAnos = ini.slice(0, 4) !== fim.slice(0, 4);
            while (d <= f) {
                const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                chaves.push(iso);
                labels.push(`${iso.slice(8, 10)}/${iso.slice(5, 7)}${varioAnos ? '/' + iso.slice(2, 4) : ''}`);
                d.setDate(d.getDate() + 1);
            }
        } else {
            let a = +ini.slice(0, 4), m = +ini.slice(5, 7) - 1;
            const fimYm = fim.slice(0, 7);
            const mesmoAno = ini.slice(0, 4) === fim.slice(0, 4);
            while (_ym(a, m) <= fimYm) {
                chaves.push(_ym(a, m));
                labels.push(mesmoAno ? MESES_CURTOS[m] : _rotuloYm(_ym(a, m)));
                if (++m > 11) { m = 0; a++; }
            }
        }
    }
    const pos = Object.fromEntries(chaves.map((k, i) => [k, i]));
    const valores = new Array(chaves.length).fill(0);
    const tam = indFiltro.granul === 'dia' ? 10 : 7;
    dados.forEach(a => { const i = pos[a.data.slice(0, tam)]; if (i !== undefined) valores[i]++; });
    return { labels, valores };
}

function _horarioSeries(dados, agenda) {
    const PASSO = indFiltro.passoHorario;
    let ini = Infinity, fim = -Infinity;
    // Janela configurada da agenda (todas as faixas de todos os dias)
    (agenda.dias || []).forEach(d => faixasBrutas(d, agenda).forEach(([i, f]) => {
        ini = Math.min(ini, i); fim = Math.max(fim, f);
    }));
    const mins = dados.map(a => timeToMin(a.horaInicio)).filter(m => m !== null);
    mins.forEach(m => { ini = Math.min(ini, m); fim = Math.max(fim, m); });
    const de = timeToMin(indFiltro.horaDe), ate = timeToMin(indFiltro.horaAte);
    if (de !== null) ini = de;
    if (ate !== null) fim = ate;
    if (!isFinite(ini) || !isFinite(fim) || fim < ini) return { labels: [], valores: [] };
    ini = Math.floor(ini / PASSO) * PASSO;
    fim = Math.floor(fim / PASSO) * PASSO;

    const labels = [], valores = [];
    for (let m = ini; m <= fim; m += PASSO) { labels.push(minToTime(m)); valores.push(0); }
    mins.forEach(m => {
        const i = Math.floor((m - ini) / PASSO);
        if (i >= 0 && i < valores.length) valores[i]++;
    });
    return { labels, valores };
}

// Média por dia da semana: total do dia ÷ nº de datas com movimento naquele dia
function _semanaSeries(dados, agenda) {
    const total = new Array(7).fill(0);
    const datas = Array.from({ length: 7 }, () => new Set());
    dados.forEach(a => {
        const d = new Date(a.data + 'T12:00:00').getDay();
        total[d]++; datas[d].add(a.data);
    });
    const ordem = [1, 2, 3, 4, 5, 6, 0].filter(d => (agenda.dias || []).includes(d) || total[d]);
    return ordem.map(d => [DIAS_CURTOS[d], datas[d].size ? +(total[d] / datas[d].size).toFixed(1) : 0]);
}

const _fmtBRL = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

// ── RENDER ─────────────────────────────────────────────────
// Re-render da aba ativa que usa a barra de filtros (Indicadores ou Demografia)
function _rerenderInd() {
    const demo = document.getElementById('tab-demografia');
    if (demo && demo.classList.contains('active') && typeof renderDemografia === 'function') renderDemografia();
    else renderIndicadores();
}

// Receita de um registro: pedido + taxa (registros antigos sem a divisão contam tudo como taxa)
function _receitaRegistro(a) {
    const dividido = a.taxaColetaPedido !== undefined || a.taxaColetaTaxa !== undefined;
    return dividido
        ? { pedido: Number(a.taxaColetaPedido) || 0, taxa: Number(a.taxaColetaTaxa) || 0 }
        : { pedido: 0, taxa: Number(a.taxaColeta) || 0 };
}

// Atualiza botões, popovers e textos da barra de filtros
function _renderIndFiltrosUI(dados) {
    document.querySelectorAll('[data-ind-granul]').forEach(b =>
        b.classList.toggle('ativo', b.dataset.indGranul === indFiltro.granul));
    document.querySelectorAll('[data-ind-passo]').forEach(b =>
        b.classList.toggle('ativo', +b.dataset.indPasso === indFiltro.passoHorario));
    _renderIndPeriodo();
    _renderIndListas();
    const setTexto = (id, t) => { const el = document.getElementById(id); if (el) el.innerText = t; };
    setTexto('ind-periodo-texto', _textoPeriodo());
    const temHora = indFiltro.horaDe || indFiltro.horaAte;
    setTexto('ind-horario-texto', temHora ? `${indFiltro.horaDe || '…'} – ${indFiltro.horaAte || '…'}` : 'Todo horário');
    setTexto('ind-status-texto', indFiltro.status.length
        ? (indFiltro.status.length === 1 ? indFiltro.status[0] : `${indFiltro.status.length} status`) : 'Todos status');
    setTexto('ind-tipo-texto', indFiltro.tipos.length
        ? (indFiltro.tipos.length === 1 ? indFiltro.tipos[0] : `${indFiltro.tipos.length} tipos`) : 'Todos tipos');
    const marcar = (nome, ativo) => {
        const btn = document.querySelector(`[onclick="toggleIndPopover('${nome}')"]`);
        if (btn) btn.classList.toggle('ativo', !!ativo);
    };
    marcar('periodo', indFiltro.modo !== 'year' || indFiltro.ano !== _hojeInd.getFullYear());
    marcar('horario', temHora);
    marcar('status', indFiltro.status.length);
    marcar('tipo', indFiltro.tipos.length);
    marcar('convenio', indFiltro.convenios.length);
    marcar('cidade', indFiltro.cidades.length);
    setTexto('ind-cidade-texto', indFiltro.cidades.length
        ? (indFiltro.cidades.length === 1 ? indFiltro.cidades[0] : `${indFiltro.cidades.length} cidades`) : 'Todas cidades');
    setTexto('ind-convenio-texto', indFiltro.convenios.length
        ? (indFiltro.convenios.length === 1 ? indFiltro.convenios[0] : `${indFiltro.convenios.length} convênios`) : 'Todos convênios');
    setTexto('ind-resumo-filtro', `${_textoPeriodo()} · ${dados.length} registro(s)`);

}

function renderIndicadores() {
    const agenda = currentAgenda();
    const cor = agendaCores(agenda).chart;
    const dados = filterIndData();
    const usa = nome => agenda.charts.includes(nome);
    _renderIndFiltrosUI(dados);
    const setTexto = (id, t) => { const el = document.getElementById(id); if (el) el.innerText = t; };

    // KPIs
    const conta = s => dados.filter(a => a.status === s).length;
    const pct = n => dados.length ? ` <small>${Math.round(n / dados.length * 100)}%</small>` : '';
    const setHtml = (id, h) => { const el = document.getElementById(id); if (el) el.innerHTML = h; };
    const aus = conta('Ausente'), canc = conta('Cancelado');
    const diasComMov = new Set(dados.map(a => a.data)).size;
    setHtml('kpi-total', dados.length);
    setHtml('kpi-tresp', dados.filter(a => a.exame === 'TRESP').length);
    setHtml('kpi-tsbac', dados.filter(a => a.exame === 'TSBAC').length);
    setHtml('kpi-concluidos', conta('Concluído') + pct(conta('Concluído')));
    setHtml('kpi-ausentes', aus + pct(aus));
    setHtml('kpi-cancelados', canc + pct(canc));
    setHtml('kpi-media-dia', diasComMov ? (dados.length / diasComMov).toFixed(1).replace('.', ',') : '0');
    let recPedido = 0, recTaxa = 0;
    dados.filter(a => a.status !== 'Cancelado').forEach(a => {
        const r = _receitaRegistro(a);
        recPedido += r.pedido; recTaxa += r.taxa;
    });
    setHtml('kpi-receita', _fmtBRL(recPedido + recTaxa));
    setHtml('kpi-receita-pedido', _fmtBRL(recPedido));
    setHtml('kpi-receita-taxa', _fmtBRL(recTaxa));

    // Volume (mensal/diário)
    if (usa('volume')) {
        const { labels, valores } = _volumeSeries(dados, _indIntervaloDatas(dados));
        setTexto('ind-titulo-volume', indFiltro.granul === 'dia' ? 'Volume diário' : 'Volume mensal');
        _graficoVolume('volume', 'chart-ind-volume', labels, valores, cor);
    } else _resetChart('volume');

    // Volume por horário (30 min)
    if (usa('horario')) {
        const { labels, valores } = _horarioSeries(dados, agenda);
        _graficoVolume('horario', 'chart-ind-horario', labels, valores, cor);
    } else _resetChart('horario');

    if (usa('semana')) _graficoRanking('semana', 'chart-ind-semana', _semanaSeries(dados, agenda), cor,
        v => String(v).replace('.', ','));
    else _resetChart('semana');

    if (usa('status')) _graficoRanking('status', 'chart-ind-status',
        IND_STATUS.map(s => [s, conta(s), IND_STATUS_COR[s]]), cor);
    else _resetChart('status');

    if (usa('exame')) _graficoRanking('exame', 'chart-ind-exame', _contar(dados, a => a.exame), cor);
    else _resetChart('exame');

    if (usa('substrato')) _graficoRanking('substrato', 'chart-ind-substrato', _contar(dados, a => a.substrato), cor);
    else _resetChart('substrato');

    if (usa('convenio')) _graficoRanking('convenio', 'chart-ind-convenio',
        _contar(dados, _conveniosDoRegistro), '#8b5cf6');
    else _resetChart('convenio');

    if (usa('coletador')) _graficoRanking('coletador', 'chart-ind-coletador',
        _contar(dados, a => a.coletador ? String(a.coletador).trim() : null).slice(0, 12), cor);
    else _resetChart('coletador');

    if (usa('motivoPerda')) _graficoRanking('motivoPerda', 'chart-ind-motivo',
        _contar(dados.filter(a => a.status === 'Cancelado'), a => a.motivoPerda || 'Sem motivo').slice(0, 10), '#ef4444');
    else _resetChart('motivoPerda');
}
