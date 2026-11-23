// ===== Folha & Custos (RELATÓRIO) + helpers compartilhados de folha =====
// A grade editável é lançada em Lançamentos → Folha mensal.

const FOLHA_COLS = [
    ['salario', 'Salários'],
    ['insalubridade', 'Insalubridade'],
    ['periculosidade', 'Periculosidade'],
    ['bolsa', 'Bolsa estágio'],
    ['prolabore', 'Pró-labore'],
    ['encargos', 'Encargos (FGTS)'],
    ['outros', 'Outros custos'],
    ['beneficios', 'Benefícios']
];
// Coparticipação: parte do benefício descontada do funcionário (abate do custo da empresa)
const FOLHA_DESC = 'beneficiosDesconto';

// Coluna DESCONTO DO EMPREGADO: INSS por faixa progressiva sobre salário+insalubridade+
// pró-labore. Fica FORA de FOLHA_COLS de propósito — ao contrário de "Encargos" (FGTS,
// custo da empresa, soma no bruto), o INSS é retenção sobre o que o funcionário já
// receberia. Somá-lo em brutoLinha inflaria o custo da empresa com um valor que na
// verdade sai do bolso do próprio funcionário.
const FOLHA_INSS = 'inss';

// Coluna DERIVADA: hora extra vinda do banco de horas (fechamentos pagos + Extra Banco).
// Não está em FOLHA_COLS porque não é editável nem gravada — é recalculada a cada render
// (ver heBancoDoMes em utils.js). Fica fora do loop de células justamente para que nenhuma
// edição manual consiga sobrescrevê-la.
const FOLHA_HE_BANCO = 'heBanco';

// Coluna LEGADA: a hora extra manual foi aposentada quando o banco de horas passou a cobrir
// as duas origens — HE do ciclo (fechamento/quitação) e HE fora do banco (Extra Banco). Ter
// as duas convidava ao lançamento em dobro: o mesmo dinheiro digitado à mão e postado pelo
// sistema.
//
// O campo continua existindo apenas para LER meses já lançados. Some da grade quando está
// zerado (todo mês novo), aparece read-only quando tem valor — apagá-la do total mudaria
// retroativamente o custo de um mês já fechado, e um relatório anual passaria a divergir de
// si mesmo sem ninguém ter editado nada.
const FOLHA_HE_MANUAL = 'horaExtra';
const folhaTemHeManual = dados =>
    Object.values(dados || {}).some(l => Number(l?.[FOLHA_HE_MANUAL]) > 0);

// Coluna DERIVADA: remuneração de férias dos lançamentos do mês (gozo + 1/3 + abono).
// Única fonte de "Férias" na grade — a coluna manual foi removida: convenção coletiva que
// mude o cálculo se ajusta na aba Férias (onde o lançamento vive), não numa célula solta na
// folha que divergia do que a aba dizia.
const FOLHA_FERIAS_CALC = 'feriasCalc';

// Coluna DERIVADA: parcelas do 13º lançadas na aba 13º Salário (1ª, 2ª, única, rescisão) +
// o adiantamento pago junto das férias. Única fonte de "13º" na grade — a coluna manual foi
// removida pelo mesmo motivo da de férias: o lançamento vive na aba própria, e uma célula
// solta na folha só divergia do que a aba já sabia.
const FOLHA_DECIMO_CALC = 'decimoCalc';

// Coluna DERIVADA: desconto de atraso do banco de horas — quitação ou fechamento de um ciclo
// com saldo NEGATIVO e destino "Descontado" (ver descAtrasoDoMes em utils.js). Valor sempre
// NEGATIVO: reduz o bruto, rubrica própria de desconto, distinta de "HE (banco)" (que só soma
// o que é PAGO ao funcionário).
const FOLHA_DESC_ATRASO = 'descAtrasoCalc';

// ---- Grupos de colunas (ocultar/mostrar categorias) ----
// cols = chaves de FOLHA_COLS/FOLHA_DESC. "aberto padrão" = Remuneração; Custo empresa é sempre fixo.
const FOLHA_GRUPOS = [
    { id: 'remuneracao', label: 'Remuneração', cols: ['salario', 'insalubridade', 'periculosidade', 'bolsa', 'prolabore'], def: true },
    { id: 'feriasDecimo', label: 'Férias e 13º', cols: [FOLHA_FERIAS_CALC, FOLHA_DECIMO_CALC], def: false },
    { id: 'encargos', label: 'Encargos', cols: ['encargos', FOLHA_INSS], def: false },
    { id: 'beneficios', label: 'Benefícios', cols: ['beneficios', FOLHA_DESC], def: false },
    { id: 'extras', label: 'Extras', cols: [FOLHA_HE_BANCO, FOLHA_HE_MANUAL, FOLHA_DESC_ATRASO, 'outros'], def: false }
];
const FOLHA_COL_LABEL = Object.fromEntries([
    ...FOLHA_COLS,
    [FOLHA_DESC, 'Desconto benef.'],
    [FOLHA_HE_BANCO, 'HE (banco)'],
    [FOLHA_HE_MANUAL, 'Hora extra (legado)'],
    [FOLHA_FERIAS_CALC, 'Férias (calc)'],
    [FOLHA_DECIMO_CALC, '13º (calc)'],
    [FOLHA_DESC_ATRASO, 'Desc. Atraso'],
    [FOLHA_INSS, 'INSS (desconto)']
]);
// Estado de grupos visíveis (compartilhado entre folha mensal e detalhamento)
const folhaGruposVis = new Set(FOLHA_GRUPOS.filter(g => g.def).map(g => g.id));
const colVisivel = k => FOLHA_GRUPOS.some(g => folhaGruposVis.has(g.id) && g.cols.includes(k));

// Renderiza os chips de grupo; onToggle() é chamado após cada mudança
function gruposChipsHtml() {
    return `<div class="col-groups">
        ${FOLHA_GRUPOS.map(g => `<button class="grp-chip${folhaGruposVis.has(g.id) ? ' on' : ''}" data-grp="${g.id}">
            <span class="grp-dot"></span>${g.label}</button>`).join('')}
        <span class="grp-chip fixed"><span class="grp-dot"></span>Custo empresa</span>
    </div>`;
}
function bindGruposChips(scope, onToggle) {
    scope.querySelectorAll('.grp-chip[data-grp]').forEach(btn => {
        btn.onclick = () => {
            const id = btn.dataset.grp;
            if (folhaGruposVis.has(id)) folhaGruposVis.delete(id); else folhaGruposVis.add(id);
            onToggle();
        };
    });
}

const _hj = new Date();
const folhaState = {
    ano: _hj.getFullYear(),
    mes: _hj.getMonth(),          // 0–11
    visao: 'mensal',
    funcionarios: [], cargos: [], beneficios: [], treinamentos: [], params: {},
    bhFechamentos: [], bhQuitacoes: [], extras: [], decimos: [], carregado: false
};

async function loadFolhaBase(force) {
    if (folhaState.carregado && !force) return;
    const [funcionarios, cargos, beneficios, treinamentos, params, bhFechamentos, bhQuitacoes, extras, ausencias, decimos] = await Promise.all([
        DB.getAll(PATHS.funcionarios), DB.getAll(PATHS.cargos),
        DB.getAll(PATHS.beneficios), DB.getAll(PATHS.treinamentos), DB.getObj(PATHS.parametros),
        // Origens da coluna derivada "HE (banco)" — ver folhaComHeBanco
        DB.getAll(PATHS.bancoHorasFechamentos), DB.getAll(PATHS.bancoHorasQuitacoes), DB.getAll(PATHS.extraBanco),
        // Origem da coluna derivada "Férias (calc)" — os lançamentos de férias do mês
        DB.getAll(PATHS.ausencias),
        // Origem da coluna derivada "13º (calc)" — as parcelas pagas do 13º
        DB.getAll(PATHS.decimos)
    ]);
    Object.assign(folhaState, { funcionarios, cargos, beneficios, treinamentos, params: params || {}, bhFechamentos, bhQuitacoes, extras, ausencias, decimos, carregado: true });
}

// Custo bruto (todas as colunas + a HE derivada do banco) e custo da empresa (bruto −
// desconto do funcionário).
//
// `heBanco` entra no bruto mas NÃO está em FOLHA_COLS: ele chega na linha em memória
// (ver folhaComHeBanco), nunca é gravado, e nenhuma célula editável o alcança. Se um dia
// entrar em FOLHA_COLS, vira coluna editável e a garantia se perde.
// A HE do banco (derivada) e a HE manual legada entram fora do loop de FOLHA_COLS: a
// primeira nunca esteve lá, a segunda saiu quando foi aposentada. Ambas continuam somando —
// o custo de um mês já lançado não pode mudar porque a coluna deixou de ser oferecida.
const brutoLinha = l => FOLHA_COLS.reduce((s, [k]) => s + (Number(l?.[k]) || 0), 0)
    + (Number(l?.[FOLHA_HE_BANCO]) || 0)
    + (Number(l?.[FOLHA_HE_MANUAL]) || 0)
    + (Number(l?.[FOLHA_FERIAS_CALC]) || 0)
    + (Number(l?.[FOLHA_DECIMO_CALC]) || 0)
    // Desc. Atraso já vem NEGATIVO (ver descAtrasoDoMes) — somar reduz o bruto.
    + (Number(l?.[FOLHA_DESC_ATRASO]) || 0);
// Coparticipação lançada: o que o funcionário paga do próprio benefício.
const descontoLinha = l => Number(l?.[FOLHA_DESC]) || 0;

// Quanto da coparticipação REALMENTE abate o custo da empresa.
//
// O desconto só pode abater aquilo que ele custeia — o benefício. Descontar do bruto inteiro
// (o que se fazia aqui) criava economia do nada: R$ 100 de coparticipação numa linha sem
// benefício nenhum derrubava o custo da empresa de 3.000 para 2.900, como se o funcionário
// tivesse pago parte do próprio salário de volta. Ele não pagou: a coparticipação sai do
// salário líquido dele, e o salário bruto continua custando o mesmo para a empresa.
//
// Por isso o teto é o valor do benefício. Desconto igual ou maior que o benefício zera o
// custo daquele benefício — nunca menos que zero.
const descontoEfetivoLinha = l => Math.min(descontoLinha(l), Number(l?.beneficios) || 0);
const totalLinha = l => brutoLinha(l) - descontoEfetivoLinha(l);
// Valor que efetivamente chega ao funcionário: custo total menos INSS (desconto sobre o
// próprio salário dele, nunca custo da empresa — ver FOLHA_INSS) e menos a coparticipação.
const liquidoLinha = l => totalLinha(l) - (Number(l?.[FOLHA_INSS]) || 0);

// Injeta a HE derivada do banco nas linhas de um mês. Recebe o objeto {fid: linha} da folha
// e devolve um NOVO objeto — mutar o original faria o valor derivado vazar para o próximo
// DB.save e virar dado gravado, exatamente o que a coluna existe para evitar.
// Contexto para a coluna derivada de férias. A média de HE (Súmula 45) é resolvida aqui, uma
// vez por funcionário/lançamento, lendo as MESMAS fontes da coluna HE (banco) — se a média
// viesse de outro lugar, o sistema teria duas respostas para "quanto de extra ele recebeu".
const feriasCtx = (o) => ({
    ausencias: o.ausencias || [],
    funcionarios: o.funcionarios || [],
    cargos: o.cargos || [],
    params: o.params || {},
    // Origem da coluna derivada "13º (calc)" — ver decimoDoMes.
    decimos: o.decimos || [],
    mediaHe: (f, a) => {
        if (!feriasParams.mediaHe) return 0;
        const sit = situacaoFeriasFunc(f, (o.ausencias || []).filter(x => x.id !== a.id), a.inicio);
        if (!sit) return 0;
        return mediaHeFerias(f.id, sit.aquisitivoIni, sit.aquisitivoFim,
            o.bhFechamentos || [], o.extras || [], o.bhQuitacoes || []).media;
    }
});

function folhaComHeBanco(dados, mesKey, fechamentos, extras, quitacoes, ctx) {
    const c = ctx || {};
    const out = {};
    Object.entries(dados || {}).forEach(([fid, linha]) => {
        const he = heBancoDoMes(fid, mesKey, fechamentos, extras, quitacoes);
        // Desconto de atraso: quitação/fechamento de saldo negativo com destino "Descontado".
        // Mesma arquitetura da HE do banco, mas em rubrica própria e sempre negativa — ver
        // descAtrasoDoMes em utils.js.
        const da = descAtrasoDoMes(fid, mesKey, fechamentos, quitacoes);
        // Férias: mesma regra da HE do banco — derivada, nunca gravada. O adiantamento do 13º
        // soma na coluna "13º salário", não na de férias: são rubricas distintas no holerite,
        // e juntá-las faria o custo de férias parecer 50% maior do que é.
        const fe = c.ausencias
            ? feriasDoMes(fid, mesKey, c.ausencias, c.funcionarios, c.cargos, c.params, c)
            : { total: 0, total13: 0 };
        // 13º: parcelas lançadas na aba própria. Coluna derivada, mesma regra das outras duas.
        const de = c.decimos ? decimoDoMes(fid, mesKey, c.decimos) : { total: 0, encargos: 0, inss: 0 };
        if (!he.total && !da.total && !fe.total && !fe.total13 && !de.total && !de.encargos && !de.inss) { out[fid] = linha; return; }
        const nova = { ...linha };
        if (he.total) nova[FOLHA_HE_BANCO] = he.total;
        if (da.total) nova[FOLHA_DESC_ATRASO] = da.total;
        if (fe.total) nova[FOLHA_FERIAS_CALC] = fe.total;
        // O adiantamento de 13º pago junto das férias soma na MESMA coluna derivada das
        // parcelas — a coluna manual "13º salário" não existe mais, e o adiantamento não
        // deixa de ser dinheiro que saiu só porque não passou pela aba 13º Salário.
        const decimoCalcTotal = (de.total || 0) + (fe.total13 || 0);
        if (decimoCalcTotal) nova[FOLHA_DECIMO_CALC] = decimoCalcTotal;
        // Encargos do 13º (FGTS) somam na coluna de encargos existente, não criam coluna
        // própria: é o mesmo encargo, só que sobre outra base. Uma coluna separada faria o
        // relatório anual ter duas linhas de encargo para a mesma natureza de custo.
        // Soma ao lançado — a célula manual continua editável e não é sobrescrita.
        if (de.encargos) nova.encargos = (Number(linha.encargos) || 0) + de.encargos;
        // INSS do 13º soma na mesma coluna de INSS mensal — mesma natureza (desconto do
        // empregado por faixa), só que sobre outra base.
        if (de.inss) nova[FOLHA_INSS] = (Number(linha[FOLHA_INSS]) || 0) + de.inss;
        out[fid] = nova;
    });
    return out;
}
// Custo dos benefícios para a empresa nesta linha (coluna benefícios − coparticipação).
// Piso zero: benefício 440 com desconto 600 custa 0 à empresa, não −160. Coparticipação que
// excede o benefício sai do salário do funcionário — não vira crédito para a empresa.
const beneficioLinha = l => Math.max(0, (Number(l?.beneficios) || 0) - descontoLinha(l));
// Custo do funcionário para a empresa (folha sem os benefícios líquidos)
const funcionarioLinha = l => totalLinha(l) - beneficioLinha(l);

// Elegível no mês: trabalhou ao menos um dia
function elegiveisNoMes(ano, mes) {
    const iniMes = mesKey(ano, mes) + '-01';
    const fimMes = mesKey(ano, mes) + '-31';
    return folhaState.funcionarios.filter(f =>
        f.admissao && f.admissao <= fimMes && (!f.demissao || f.demissao >= iniMes));
}

// Custos do benefício de um funcionário: {total, desconto} (desconto = coparticipação)
function beneficiosDoFunc(f, catalogo) {
    let total = 0, desconto = 0;
    (f.beneficios || []).forEach(fb => {
        const b = (catalogo || folhaState.beneficios).find(x => x.id === fb.beneficioId);
        if (!b) return;
        const custo = (Number(b.custoTitular) || 0) + (fb.dependentes || []).length * (Number(b.custoDependente) || 0);
        total += custo;
        desconto += custo * (Number(b.descontoPct) || 0) / 100;
    });
    return { total: Number(total.toFixed(2)), desconto: Number(desconto.toFixed(2)) };
}

// Pré-preenchimento da linha da folha
function prefillLinha(f) {
    const cargo = folhaState.cargos.find(c => c.id === f.cargoId);
    const params = folhaState.params;
    const linha = {};
    FOLHA_COLS.forEach(([k]) => linha[k] = 0);
    linha[FOLHA_DESC] = 0;
    linha[FOLHA_INSS] = 0;

    // Verbas vêm do PERFIL do cargo, não do tipo: um diretor pode ter salário base E
    // pró-labore, o que o campo único `salario` (que mudava de significado) impedia.
    // O salário do funcionário, quando existe, sobrepõe o do cargo — é o valor individual
    // negociado; o do cargo é só a referência.
    // `f` entra em remuneracaoCargo por causa do aprendiz: o salário dele é o mínimo-HORA
    // multiplicado pela jornada individual da ficha (art. 428 §2º), não um valor do cargo.
    const r = remuneracaoCargo(cargo, params, f);
    const salBase = Number(f.salario) || r.salarioBase;

    if (r.perfil === 'estagiario') {
        // Bolsa não é salário (Lei 11.788): sem insalubridade, sem encargos e sem INSS.
        linha.bolsa = Number(f.salario) || r.bolsa;
    } else {
        linha.salario = salBase;
        linha.prolabore = r.prolabore;
        // Insalubridade: grau do cargo × base configurada (salário do funcionário ou mínimo)
        linha.insalubridade = calculoInsalubridade(cargo, params, salBase);
        // Periculosidade: 30% fixo sobre o salário total (nunca sobre o mínimo).
        linha.periculosidade = calculoPericulosidade(cargo, salBase);
        // Encargos (FGTS, custo da empresa) sobre a remuneração (salário + insalubridade +
        // periculosidade + pró-labore).
        const baseEnc = salBase + linha.insalubridade + linha.periculosidade + linha.prolabore;
        // Alíquota do CARGO: aprendiz recolhe 2% (art. 15 §7º da Lei 8.036/90).
        linha.encargos = Number((baseEnc * fgtsPctDe(cargo, params) / 100).toFixed(2));
        // INSS (desconto do EMPREGADO, por faixa progressiva) sobre a mesma base — não é
        // custo da empresa, por isso fica fora de `linha.encargos` (ver FOLHA_INSS).
        linha[FOLHA_INSS] = calculoInss(baseEnc, params.inssFaixas);
    }
    const ben = beneficiosDoFunc(f);
    linha.beneficios = ben.total;
    linha[FOLHA_DESC] = ben.desconto;
    return linha;
}

// Custo de treinamento no mês (parcelas a partir da data de pagamento)
function custoTreinoNoMes(t, ano, mes) {
    const custo = Number(t.custo) || 0;
    if (!custo) return 0;
    const inicio = t.dataPagamento || t.inicio;
    if (!inicio) return 0;
    const n = Math.max(1, Number(t.parcelas) || 1);
    const idx = (ano - Number(inicio.slice(0, 4))) * 12 + (mes - (Number(inicio.slice(5, 7)) - 1));
    return idx >= 0 && idx < n ? custo / n : 0;
}

// ============ PÁGINA: RELATÓRIO ============
registerPage({
    id: 'folha',
    title: 'Folha & Custos',
    icon: 'money',
    order: 4,
    perm: 'ver_folha',
    wide: true,     // grade de ~12 colunas: usar a tela toda evita scroll horizontal
    async render(el) {
        if (!can('ver_financeiro')) {
            el.innerHTML = emptyState({ icon: 'lock', title: 'Acesso restrito', text: 'Este módulo exige a permissão "Ver valores financeiros". Contate um administrador.' });
            return;
        }
        el.innerHTML = '<div class="loading-center"><div class="spinner-dark"></div></div>';
        await loadFolhaBase(true);

        el.innerHTML = `
            <div class="page-header">
                <div>
                    <h2>Folha & Custos</h2>
                    <div class="page-sub">Relatório — os valores são lançados em Lançamentos → Folha mensal.</div>
                </div>
            </div>
            <div class="tabs" id="frTabs">
                <div class="tab${folhaState.visao === 'mensal' ? ' active' : ''}" data-v="mensal">Visão mensal</div>
                <div class="tab${folhaState.visao === 'anual' ? ' active' : ''}" data-v="anual">Visão anual</div>
            </div>
            <div class="mt-16" id="frContent"></div>`;

        el.querySelectorAll('#frTabs .tab').forEach(tab => {
            tab.onclick = () => {
                folhaState.visao = tab.dataset.v;
                el.querySelectorAll('#frTabs .tab').forEach(t => t.classList.toggle('active', t === tab));
                renderFolhaRel();
            };
        });
        renderFolhaRel();
    }
});

function renderFolhaRel() {
    document.getElementById('frContent').innerHTML = '<div class="loading-center"><div class="spinner-dark"></div></div>';
    (folhaState.visao === 'mensal' ? relFolhaMensal() : relFolhaAnual()).catch(e => {
        console.error(e);
        document.getElementById('frContent').innerHTML = emptyState({ icon: 'alert', title: 'Erro ao carregar', text: e.message || '' });
    });
}

async function relFolhaMensal() {
    const { ano, mes } = folhaState;
    const key = mesKey(ano, mes);
    const brutos = await DB.getObj(`${PATHS.folha}/${key}`);
    // Sem isto o relatório mensal mostraria zero em "Férias" e "13º" para todo mês: as duas
    // colunas manuais foram removidas, e o valor só existe como derivado (heBanco/feriasCalc/
    // decimoCalc), injetado aqui em memória — nunca gravado, mesma regra da grade de
    // Lançamentos → Folha mensal.
    const dados = brutos
        ? folhaComHeBanco(brutos, key, folhaState.bhFechamentos, folhaState.extras, folhaState.bhQuitacoes, {
            ausencias: folhaState.ausencias, funcionarios: folhaState.funcionarios,
            cargos: folhaState.cargos, params: folhaState.params, decimos: folhaState.decimos,
            mediaHe: feriasCtx(folhaState).mediaHe
        })
        : null;
    const cont = document.getElementById('frContent');

    const treinosMes = folhaState.treinamentos.reduce((s, t) => s + custoTreinoNoMes(t, ano, mes), 0);

    const nav = `
        <div class="month-nav">
            <button id="frPrev" title="Mês anterior">‹</button>
            <span class="month-label">${MESES_FULL[mes]} ${ano}</span>
            <button id="frNext" title="Próximo mês">›</button>
        </div>`;

    if (!dados) {
        cont.innerHTML = `
            <div class="flex-between" style="margin-bottom:16px">${nav}<div></div></div>
            ${emptyState({ icon: 'money', title: `Folha de ${MESES_FULL[mes]} ${ano} não lançada`, text: 'Gere a folha em Lançamentos → Folha mensal.' })}`;
        bindFrNav(cont);
        return;
    }

    const linhas = Object.entries(dados)
        .map(([id, linha]) => ({ f: folhaState.funcionarios.find(x => x.id === id), linha }))
        .sort((a, b) => (a.f?.nome || '').localeCompare(b.f?.nome || ''));

    const bruto = linhas.reduce((s, l) => s + brutoLinha(l.linha), 0);
    // Lançado × efetivo: o RH lança 264 de coparticipação, mas só a parte que cabe dentro do
    // benefício abate o custo da empresa. O resto sai do salário do funcionário e não é
    // economia de ninguém — somar o lançado aqui inventaria uma redução que não aconteceu.
    const descontos = linhas.reduce((s, l) => s + descontoLinha(l.linha), 0);
    const descontosEfetivos = linhas.reduce((s, l) => s + descontoEfetivoLinha(l.linha), 0);
    const custoEmpresa = bruto - descontosEfetivos;
    const custoBeneficios = linhas.reduce((s, l) => s + beneficioLinha(l.linha), 0);
    const custoFuncionarios = custoEmpresa - custoBeneficios;
    const pctBenef = custoEmpresa ? custoBeneficios / custoEmpresa * 100 : 0;

    // Colunas derivadas (Férias/13º/HE do banco) entram ao lado das manuais, mesma posição e
    // mesmo motivo da grade de Lançamentos → Folha mensal — sem elas o relatório mostraria
    // "—" para todo mundo, já que o valor não vive mais numa célula gravada.
    const iPro = FOLHA_COLS.findIndex(([k]) => k === 'prolabore');
    const COLS_REL = [...FOLHA_COLS];
    COLS_REL.splice(iPro + 1, 0,
        [FOLHA_FERIAS_CALC, FOLHA_COL_LABEL[FOLHA_FERIAS_CALC]],
        [FOLHA_DECIMO_CALC, FOLHA_COL_LABEL[FOLHA_DECIMO_CALC]]);
    const iEnc = COLS_REL.findIndex(([k]) => k === 'encargos');
    COLS_REL.splice(iEnc + 1, 0,
        [FOLHA_INSS, FOLHA_COL_LABEL[FOLHA_INSS]],
        [FOLHA_HE_BANCO, FOLHA_COL_LABEL[FOLHA_HE_BANCO]],
        [FOLHA_DESC_ATRASO, FOLHA_COL_LABEL[FOLHA_DESC_ATRASO]]);

    cont.innerHTML = `
        <div class="flex-between" style="margin-bottom:16px">${nav}<div></div></div>
        <div class="grid grid-4">
            <div class="kpi"><span class="kpi-label">Custo empresa (folha)</span><span class="kpi-value" style="font-size:20px">${fmtBRL(custoEmpresa)}</span><span class="kpi-delta" ${descontos > descontosEfetivos ? `title="Foram lançados ${fmtBRL(descontos)} de coparticipação, mas só ${fmtBRL(descontosEfetivos)} abatem o custo: o excedente sai do salário do funcionário, não do benefício."` : ''}>bruto ${fmtBRL(bruto)} − ${fmtBRL(descontosEfetivos)} coparticipação${descontos > descontosEfetivos ? ` <span class="txt-warn">*</span>` : ''}</span></div>
            <div class="kpi"><span class="kpi-label">Custo dos funcionários</span><span class="kpi-value" style="font-size:20px">${fmtBRL(custoFuncionarios)}</span><span class="kpi-delta">remuneração, encargos e demais custos</span></div>
            <div class="kpi"><span class="kpi-label">Custo dos benefícios</span><span class="kpi-value" style="font-size:20px">${fmtBRL(custoBeneficios)}</span><span class="kpi-delta">${fmtPct(pctBenef)} do custo da folha</span></div>
            <div class="kpi"><span class="kpi-label">Treinamentos (parcelas)</span><span class="kpi-value" style="font-size:20px">${fmtBRL(treinosMes)}</span></div>
        </div>
        <div class="table-wrap mt-16">
            <div class="table-toolbar" style="flex-wrap:wrap;gap:10px">
                <strong>Detalhamento por funcionário — ${MESES_FULL[mes]} ${ano}</strong>
                <div class="grow"></div>
                ${gruposChipsHtml()}
            </div>
            <div class="table-scroll">
                <table class="table folha-table">
                    <thead><tr>
                        <th>Funcionário</th>
                        ${COLS_REL.map(([k, l]) => `<th class="num col-${k}">${l}</th>`).join('')}
                        <th class="num col-${FOLHA_DESC}">Desconto benef.</th>
                        <th class="num">Custo empresa</th>
                    </tr></thead>
                    <tbody>
                        ${linhas.map(({ f, linha }) => `
                        <tr>
                            <td style="white-space:nowrap"><strong>${escapeHtml(f?.nome || '(removido)')}</strong></td>
                            ${COLS_REL.map(([k]) => `<td class="num col-${k}">${Number(linha[k]) ? fmtBRL(linha[k]) : '—'}</td>`).join('')}
                            <td class="num col-${FOLHA_DESC}" style="color:var(--danger)">${descontoLinha(linha)
                                ? `− ${fmtBRL(descontoLinha(linha))}${descontoLinha(linha) > descontoEfetivoLinha(linha)
                                    ? ` <span class="folha-desc-x" title="Coparticipação de ${fmtBRL(descontoLinha(linha))} maior que o benefício de ${fmtBRL(Number(linha.beneficios) || 0)}. Só ${fmtBRL(descontoEfetivoLinha(linha))} abatem o custo da empresa — o excedente sai do salário do funcionário.">*</span>`
                                    : ''}`
                                : '—'}</td>
                            <td class="num"><strong>${fmtBRL(totalLinha(linha))}</strong></td>
                        </tr>`).join('')}
                    </tbody>
                    <tfoot><tr>
                        <td><strong>Total</strong></td>
                        ${COLS_REL.map(([k]) => `<td class="num col-${k}"><strong>${fmtBRL(linhas.reduce((s, l) => s + (Number(l.linha[k]) || 0), 0))}</strong></td>`).join('')}
                        <td class="num col-${FOLHA_DESC}" style="color:var(--danger)"><strong>− ${fmtBRL(descontos)}</strong></td>
                        <td class="num"><strong>${fmtBRL(custoEmpresa)}</strong></td>
                    </tr></tfoot>
                </table>
            </div>
        </div>`;
    bindFrNav(cont);

    // Grupos de coluna ocultáveis
    const COLS_DET = [...COLS_REL.map(([k]) => k), FOLHA_DESC];
    const aplicaGruposDet = () => COLS_DET.forEach(k => {
        const vis = colVisivel(k);
        cont.querySelectorAll(`.col-${k}`).forEach(el => el.classList.toggle('hidden', !vis));
    });
    aplicaGruposDet();
    bindGruposChips(cont, () => {
        cont.querySelectorAll('.grp-chip[data-grp]').forEach(b => b.classList.toggle('on', folhaGruposVis.has(b.dataset.grp)));
        aplicaGruposDet();
    });
}

function bindFrNav(cont) {
    const prev = cont.querySelector('#frPrev'), next = cont.querySelector('#frNext');
    if (prev) prev.onclick = () => {
        folhaState.mes--;
        if (folhaState.mes < 0) { folhaState.mes = 11; folhaState.ano--; }
        renderFolhaRel();
    };
    if (next) next.onclick = () => {
        folhaState.mes++;
        if (folhaState.mes > 11) { folhaState.mes = 0; folhaState.ano++; }
        renderFolhaRel();
    };
}

let folhaCharts = [];
function destroyFolhaCharts() { folhaCharts.forEach(c => c.destroy()); folhaCharts = []; }

// Explicações do botão "i" nos cards da Visão anual (mesmo formato de RES_EXPLICACOES em resultados.js).
const FOLHA_ANUAL_EXPLICACOES = {
    'Custo empresa (folha)': { oQue: 'Custo mensal da folha que efetivamente sai do caixa da empresa: remuneração bruta menos a coparticipação efetiva dos funcionários nos benefícios.', objetivo: 'É o número consolidado de custo de pessoal de cada mês do ano.' },
    'Custo dos funcionários': { oQue: 'Custo mensal da folha atribuído aos funcionários (remuneração, encargos e demais custos), excluindo benefícios.', objetivo: 'Isolar o custo de remuneração pura, sem o componente de benefícios, para análises de custo por cabeça.' },
    'Custo dos benefícios': { oQue: 'Custo mensal dos benefícios pago pela empresa, já descontada a coparticipação dos funcionários.', objetivo: 'Medir o investimento líquido da empresa em benefícios, separado da remuneração.' },
    'Remuneração bruta (folha)': { oQue: 'Soma de tudo o que foi lançado na folha do mês antes de qualquer desconto de coparticipação.', objetivo: 'Servir de base de comparação para o custo empresa, que é a remuneração bruta menos os descontos efetivos.' },
    'Descontos (coparticipação)': { oQue: 'Total lançado de coparticipação dos funcionários nos benefícios em cada mês.', objetivo: 'Mostrar quanto do custo dos benefícios é, na prática, compartilhado com a equipe — parte pode exceder o benefício e não abater o custo da empresa.' },
    'Treinamentos (parcelas)': { oQue: 'Custo de treinamentos atribuído a cada mês, considerando o regime de parcelamento de cada treinamento lançado.', objetivo: 'Ver a distribuição mensal do investimento em capacitação ao longo do ano.' }
};

async function relFolhaAnual() {
    destroyFolhaCharts();
    const ano = folhaState.ano;
    const folhaAll = await DB.getObj(PATHS.folha);
    const cont = document.getElementById('frContent');

    const rows = { bruto: [], descontos: [], empresa: [], funcionarios: [], beneficios: [], treinos: [] };
    for (let m = 0; m < 12; m++) {
        const mk = mesKey(ano, m);
        // Colunas derivadas (HE do banco, férias) precisam ser injetadas: sem isso o gráfico
        // soma a folha crua e mostra custo menor que a tela de Folha mensal — mesma empresa,
        // dois números.
        const dados = folhaComHeBanco(folhaAll?.[mk] || {}, mk, folhaState.bhFechamentos,
            folhaState.extras, folhaState.bhQuitacoes, feriasCtx(folhaState));
        const linhas = Object.values(dados);
        const bruto = linhas.reduce((s, l) => s + brutoLinha(l), 0);
        const desc = linhas.reduce((s, l) => s + descontoLinha(l), 0);
        // Só o desconto EFETIVO abate o custo — ver descontoEfetivoLinha.
        const descEf = linhas.reduce((s, l) => s + descontoEfetivoLinha(l), 0);
        const beneficios = linhas.reduce((s, l) => s + beneficioLinha(l), 0);
        const treinos = folhaState.treinamentos.reduce((s, t) => s + custoTreinoNoMes(t, ano, m), 0);
        rows.bruto.push(bruto);
        rows.descontos.push(desc);
        rows.empresa.push(bruto - descEf);
        rows.beneficios.push(beneficios);
        rows.funcionarios.push(bruto - descEf - beneficios);
        rows.treinos.push(treinos);
    }

    // Métricas → cada uma vira um gráfico de barras com linha de média e total
    const metricas = [
        { id: 'empresa', label: 'Custo empresa (folha)', vals: rows.empresa, cor: DV.s1 },
        { id: 'funcionarios', label: 'Custo dos funcionários', vals: rows.funcionarios, cor: DV.s5 },
        { id: 'beneficios', label: 'Custo dos benefícios', vals: rows.beneficios, cor: DV.s2 },
        { id: 'bruto', label: 'Remuneração bruta (folha)', vals: rows.bruto, cor: DV.s8 },
        { id: 'descontos', label: 'Descontos (coparticipação)', vals: rows.descontos, cor: DV.s6 },
        { id: 'treinos', label: 'Treinamentos (parcelas)', vals: rows.treinos, cor: DV.s3 }
    ];

    cont.innerHTML = `
        <div class="flex-between" style="margin-bottom:16px">
            <div class="month-nav">
                <button id="fraPrev" title="Ano anterior">‹</button>
                <span class="month-label" style="min-width:80px">${ano}</span>
                <button id="fraNext" title="Próximo ano">›</button>
            </div><div></div>
        </div>
        <div class="chart-grid chart-grid-3">
            ${metricas.map(mt => {
                const total = mt.vals.reduce((a, b) => a + b, 0);
                const media = total / 12;
                return chartCard({
                    id: `fra_${mt.id}`, titulo: mt.label,
                    total: fmtBRL(total),
                    media: `média ${fmtBRL(media)}/mês`,
                    info: FOLHA_ANUAL_EXPLICACOES[mt.label]
                });
            }).join('')}
        </div>
        ${tabelaMensal(`Resumo de custos — funcionários × benefícios — ${ano}`, [
            { label: 'Remuneração bruta (folha)', fmt: 'brl', vals: rows.bruto },
            { label: 'Descontos de benefícios (funcionário)', fmt: 'brl', vals: rows.descontos },
            { label: 'Custo empresa (folha)', fmt: 'brl', vals: rows.empresa },
            { label: 'Custo dos funcionários (empresa)', fmt: 'brl', vals: rows.funcionarios },
            { label: 'Custo dos benefícios (empresa)', fmt: 'brl', vals: rows.beneficios },
            { label: 'Treinamentos (parcelas)', fmt: 'brl', vals: rows.treinos }
        ])}`;

    cont.querySelector('#fraPrev').onclick = () => { folhaState.ano--; renderFolhaRel(); };
    cont.querySelector('#fraNext').onclick = () => { folhaState.ano++; renderFolhaRel(); };

    metricas.forEach(mt => {
        const el = document.getElementById(`fra_${mt.id}`);
        if (!el) return;
        const media = mt.vals.reduce((a, b) => a + b, 0) / 12;
        const c = new Chart(el, {
            type: 'bar',
            data: {
                labels: MESES,
                datasets: [
                    {
                        label: mt.label, data: mt.vals,
                        backgroundColor: mt.cor + 'cc', hoverBackgroundColor: mt.cor,
                        borderRadius: 5, maxBarThickness: 34, order: 2
                    },
                    {
                        type: 'line', label: 'Média', data: Array(12).fill(media),
                        borderColor: DV.s6, borderWidth: 1.5, borderDash: [5, 4],
                        pointRadius: 0, tension: 0, order: 1
                    }
                ]
            },
            options: folhaChartOpts()
        });
        folhaCharts.push(c);
    });
}

// Opções base para os gráficos anuais (barras com eixo em R$)
function folhaChartOpts() {
    return {
        responsive: true, maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                padding: 10, backgroundColor: '#23233f', cornerRadius: 8,
                callbacks: { label: ctx => `${ctx.dataset.label}: ${fmtBRL(ctx.parsed.y)}` }
            }
        },
        scales: {
            x: { grid: { display: false }, ticks: { color: DV.ink, font: { size: 10 } } },
            y: {
                beginAtZero: true, grid: { color: DV.grid }, border: { display: false },
                ticks: { color: DV.ink, font: { size: 10 }, callback: v => 'R$ ' + Number(v).toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }) }
            }
        }
    };
}
