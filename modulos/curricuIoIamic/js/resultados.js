// ===== Resultados consolidados: Geral | Rotatividade | Perfil | Eventos RH | Custos =====

const RES_TABS = [
    { id: 'geral', label: 'Geral' },
    { id: 'rotatividade', label: 'Rotatividade' },
    { id: 'perfil', label: 'Perfil da equipe' },
    { id: 'eventos', label: 'Eventos RH' },
    { id: 'bancohoras', label: 'Banco de horas' },
    { id: 'financeiro', label: 'Custos' }
];

// view: 'grafico' | 'tabela'. Gráfico é o padrão — a leitura de tendência vem primeiro;
// a tabela continua a um clique para quem precisa do número exato.
// A aba Geral são indicadores de valor único (não têm série mensal): sempre tabela.
const resState = { tab: 'geral', ano: new Date().getFullYear(), unidade: '', view: 'grafico', dados: null, anosOrd: [] };
const RES_TEM_GRAFICO = t => t !== 'geral';

registerPage({
    id: 'resultados',
    title: 'Resultados',
    icon: 'chart',
    order: 5,
    perm: 'ver_resultados',
    wide: true,     // tabelas Jan–Dez + Média + Total: 15 colunas
    async render(el) {
        el.innerHTML = '<div class="loading-center"><div class="spinner-dark"></div></div>';
        const [funcionarios, cargos, unidades, beneficios, ausencias, demissoes, treinamentos, promocoes, folha, params, banco, bhFechamentos, bhQuitacoes, extras, decimos] = await Promise.all([
            DB.getAll(PATHS.funcionarios), DB.getAll(PATHS.cargos), DB.getAll(PATHS.unidades),
            DB.getAll(PATHS.beneficios), DB.getAll(PATHS.ausencias), DB.getAll(PATHS.demissoes),
            DB.getAll(PATHS.treinamentos), DB.getAll(PATHS.promocoes),
            DB.getObj(PATHS.folha), DB.getObj(PATHS.parametros),
            DB.getObj(PATHS.bancoHoras), DB.getAll(PATHS.bancoHorasFechamentos), DB.getAll(PATHS.bancoHorasQuitacoes),
            DB.getAll(PATHS.extraBanco),
            // Origem da coluna derivada "13º (calc)": sem ela o relatório anual leria a folha
            // sem as parcelas do 13º e mostraria um custo menor que o da tela de Folha mensal.
            DB.getAll(PATHS.decimos)
        ]);
        resState.dados = { funcionarios, cargos, unidades, beneficios, ausencias, demissoes, treinamentos, promocoes, folha: folha || {}, params: params || {}, banco: banco || {}, bhFechamentos, bhQuitacoes, extras, decimos };

        const anos = new Set([new Date().getFullYear()]);
        funcionarios.forEach(f => { if (f.admissao) anos.add(Number(f.admissao.slice(0, 4))); });
        demissoes.forEach(d => { if (d.data) anos.add(Number(d.data.slice(0, 4))); });
        Object.keys(resState.dados.folha).forEach(k => anos.add(Number(k.slice(0, 4))));
        Object.keys(resState.dados.banco).forEach(k => anos.add(Number(k.slice(0, 4))));
        const anosOrd = [...anos].sort((a, b) => b - a);
        if (!anosOrd.includes(resState.ano)) resState.ano = anosOrd[0];
        resState.anosOrd = anosOrd;
        resState.unidades = unidades;

        el.innerHTML = `
            <div class="page-header">
                <div>
                    <h2>Resultados consolidados</h2>
                    <div class="page-sub">Indicadores anuais derivados automaticamente dos cadastros e lançamentos.</div>
                </div>
                <div class="actions">
                    <div class="view-toggle" id="resView" hidden>
                        <button data-view="grafico" title="Ver como gráfico">${icon('chart')}<span>Gráfico</span></button>
                        <button data-view="tabela" title="Ver como tabela">${icon('table')}<span>Tabela</span></button>
                    </div>
                    <button type="button" class="btn btn-secondary btn-filter" id="resUnidadeBtn">${icon('filter')}<span id="resUnidadeLbl"></span></button>
                    <div class="res-ano-nav">
                        <button type="button" class="btn-icon btn-icon-sm" id="resAnoPrev" title="Ano anterior">${icon('chevronLeft')}</button>
                        <span class="res-ano-lbl" id="resAnoLbl"></span>
                        <button type="button" class="btn-icon btn-icon-sm" id="resAnoNext" title="Próximo ano">${icon('chevronRight')}</button>
                    </div>
                </div>
            </div>
            <div class="tabs" id="resTabs">
                ${RES_TABS.map(t => `<div class="tab${t.id === resState.tab ? ' active' : ''}" data-tab="${t.id}">${t.label}</div>`).join('')}
            </div>
            <div class="mt-16" id="resContent"></div>`;

        const unidadeBtn = el.querySelector('#resUnidadeBtn');
        const atualizaUnidadeLbl = () => {
            const u = unidades.find(x => x.id === resState.unidade);
            unidadeBtn.querySelector('#resUnidadeLbl').textContent = u ? u.nome : 'Todas as unidades';
        };
        atualizaUnidadeLbl();
        unidadeBtn.onclick = () => openFilterPopover(unidadeBtn, {
            options: unidades.map(u => ({ value: u.id, label: u.nome })),
            value: resState.unidade,
            allLabel: 'Todas as unidades',
            onPick: v => { resState.unidade = v; atualizaUnidadeLbl(); renderResTab(); }
        });

        const anoLbl = el.querySelector('#resAnoLbl');
        const anoPrev = el.querySelector('#resAnoPrev');
        const anoNext = el.querySelector('#resAnoNext');
        const atualizaAnoNav = () => {
            const i = resState.anosOrd.indexOf(resState.ano);
            anoLbl.textContent = resState.ano;
            // anosOrd é decrescente: "anterior" (ano menor) é o próximo índice; "próximo" (ano maior) é o índice de trás.
            anoPrev.disabled = i < 0 || i >= resState.anosOrd.length - 1;
            anoNext.disabled = i <= 0;
        };
        atualizaAnoNav();
        anoPrev.onclick = () => {
            const i = resState.anosOrd.indexOf(resState.ano);
            if (i < resState.anosOrd.length - 1) { resState.ano = resState.anosOrd[i + 1]; atualizaAnoNav(); renderResTab(); }
        };
        anoNext.onclick = () => {
            const i = resState.anosOrd.indexOf(resState.ano);
            if (i > 0) { resState.ano = resState.anosOrd[i - 1]; atualizaAnoNav(); renderResTab(); }
        };

        el.querySelectorAll('#resTabs .tab').forEach(tab => {
            tab.onclick = () => {
                resState.tab = tab.dataset.tab;
                el.querySelectorAll('#resTabs .tab').forEach(t => t.classList.toggle('active', t === tab));
                renderResTab();
            };
        });
        el.querySelectorAll('#resView button').forEach(b => {
            b.onclick = () => { resState.view = b.dataset.view; renderResTab(); };
        });
        renderResTab();
    }
});

// ---- Base de cálculo do ano/unidade selecionados ----
function resBase() {
    const { ano, unidade, dados } = resState;
    const funcs = dados.funcionarios.filter(f => !unidade || f.unidadeId === unidade);
    const ids = new Set(funcs.map(f => f.id));
    const fim = m => `${mesKey(ano, m)}-31`;
    const iniM = m => `${mesKey(ano, m)}-01`;
    const head = d => funcs.filter(f => f.admissao && f.admissao <= d && (!f.demissao || f.demissao > d)).length;

    const meses = [];
    for (let m = 0; m < 12; m++) {
        const adm = funcs.filter(f => f.admissao >= iniM(m) && f.admissao <= fim(m)).length;
        const dem = funcs.filter(f => f.demissao && f.demissao >= iniM(m) && f.demissao <= fim(m)).length;
        const hIni = head(m === 0 ? `${ano - 1}-12-31` : fim(m - 1));
        const hFim = head(fim(m));
        const hMedio = (hIni + hFim) / 2;
        // A HE do banco é derivada: sem injetá-la aqui, o relatório anual somaria a folha
        // crua e mostraria um custo menor que o da tela de Folha mensal — a mesma empresa
        // com dois números.
        const mk = mesKey(ano, m);
        const folhaMes = folhaComHeBanco(dados.folha[mk] || {}, mk, dados.bhFechamentos, dados.extras, dados.bhQuitacoes, feriasCtx(dados));
        const linhas = Object.entries(folhaMes).filter(([id]) => ids.has(id)).map(([, l]) => l);
        const soma = k => linhas.reduce((s, l) => s + (Number(l[k]) || 0), 0);
        // Custo da empresa = bruto − a parte da coparticipação que cabe dentro do benefício.
        // O excedente sai do salário do funcionário e não reduz custo nenhum (ver
        // descontoEfetivoLinha em folha.js).
        const folhaBruto = linhas.reduce((s, l) => s + brutoLinha(l), 0);
        const descontos = linhas.reduce((s, l) => s + descontoLinha(l), 0);
        const folhaTotal = linhas.reduce((s, l) => s + totalLinha(l), 0);
        // Piso zero por linha: benefício 440 com desconto 600 custa 0, não −160.
        const beneficiosLiq = linhas.reduce((s, l) => s + beneficioLinha(l), 0);
        meses.push({
            adm, dem, hIni, hFim, hMedio,
            turnover: hMedio > 0 ? ((adm + dem) / 2) / hMedio * 100 : 0,
            folhaBruto,
            descontos,
            folhaTotal,
            beneficiosLiq,
            // Custo dos funcionários = custo da folha menos os benefícios líquidos
            funcionariosCusto: folhaTotal - beneficiosLiq,
            treinos: dados.treinamentos.reduce((s, t) => s + custoTreinoNoMes(t, ano, m), 0),
            beneficios: soma('beneficios'),
            encargos: soma('encargos'),
            // INSS: desconto do empregado (por faixa), NÃO é custo da empresa — não entra em
            // folhaTotal/funcionariosCusto (baseados em totalLinha, que já o exclui). Exposto
            // à parte só para quem quiser acompanhar o volume retido.
            inss: soma(FOLHA_INSS),
            // Hora extra do mês = banco de horas (fechamentos pagos, quitações, Extra Banco)
            // + o legado manual dos meses lançados antes do banco existir. São a mesma
            // natureza de custo; separá-las no relatório anual mostraria uma queda inventada
            // no mês em que a coluna manual foi aposentada.
            horaExtra: soma(FOLHA_HE_BANCO) + soma(FOLHA_HE_MANUAL),
            outros: soma('outros'),
            promoCusto: dados.promocoes.filter(p => ids.has(p.funcionarioId) && (p.data || '').startsWith(mesKey(ano, m)))
                .reduce((s, p) => s + Math.max(0, (Number(p.salarioNovo) || 0) - (Number(p.salarioAntigo) || 0)), 0)
        });
    }
    return { funcs, ids, meses, head, fim };
}

function renderResTab() {
    const cont = document.getElementById('resContent');
    chartDestroy('resultados');
    cont.innerHTML = '<div class="loading-center"><div class="spinner-dark"></div></div>';

    // O toggle só existe onde há série mensal para desenhar (Geral são valores únicos)
    const tv = document.getElementById('resView');
    if (tv) {
        tv.hidden = !RES_TEM_GRAFICO(resState.tab);
        tv.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.view === resState.view));
    }

    try {
        ({ geral: resGeral, rotatividade: resRotatividade, perfil: resPerfil, eventos: resEventos, bancohoras: resBancoHoras, financeiro: resFinanceiro })[resState.tab](cont);
    } catch (e) {
        console.error(e);
        cont.innerHTML = emptyState({ icon: 'alert', title: 'Erro ao calcular', text: e.message || '' });
    }
}

// Modo gráfico ativo na aba atual?
const resGrafico = () => resState.view === 'grafico' && RES_TEM_GRAFICO(resState.tab);

// ---- Explicações dos gráficos ("o que é / objetivo") para o botão "i" ----
// Chave = o texto do label/título tal como aparece na tela. Indicadores sem entrada aqui
// simplesmente não ganham botão de info — melhor omitir do que mostrar um texto genérico.
const RES_EXPLICACOES = {
    // Aba Geral (rótulos com o ano interpolado usam chave estática — ver chaveInfo em resGeral)
    permanencia: { oQue: 'Tempo médio, em meses ou anos, que os funcionários que trabalharam neste ano permaneceram (ou permanecem) na empresa.', objetivo: 'Indicar se a empresa está retendo talentos ou perdendo pessoas cedo demais — quanto maior, melhor a retenção.' },
    admissoesAno: { oQue: 'Quantidade total de funcionários admitidos no ano selecionado.', objetivo: 'Medir o ritmo de crescimento/reposição da equipe.' },
    demissoesAno: { oQue: 'Quantidade total de funcionários desligados no ano selecionado, por qualquer motivo.', objetivo: 'Medir o volume de saídas do ano, base para calcular turnover e planejar reposições.' },
    headcountFim: { oQue: 'Quantidade de funcionários ativos no último dia do ano selecionado.', objetivo: 'Fotografia do tamanho real da equipe ao final do período, para comparar ano a ano.' },
    'Índice de aprovação após período de experiência': { oQue: 'Percentual de admitidos no ano que já completaram o período de experiência e não foram desligados por não terem sido aprovados nele.', objetivo: 'Medir a qualidade do processo seletivo — um índice baixo sugere revisão em como as vagas são triadas ou descritas.' },
    cotaAprendiz: { oQue: `Quantidade de aprendizes ativos e o quanto representam do headcount médio do ano. O art. 429 da CLT exige entre ${COTA_APRENDIZ_MIN_PCT}% e ${COTA_APRENDIZ_MAX_PCT}% de aprendizes.`, objetivo: 'Acompanhar se a empresa está dentro da faixa da cota legal de aprendizagem e antecipar contratações antes de uma fiscalização.', leitura: `Atenção: é uma aproximação, não o cálculo oficial. A base legal conta apenas os cargos cujas funções demandam formação profissional (e exclui os próprios aprendizes), enquanto aqui o denominador é o headcount médio do ano inteiro. Use como termômetro — o número declarado ao MTE precisa ser apurado sobre a base correta.` },
    'Quantidade de treinamentos ofertados': { oQue: 'Número de turmas ou eventos de treinamento iniciados no ano selecionado (não conta participações individuais).', objetivo: 'Acompanhar o volume de iniciativas de capacitação oferecidas pela empresa.' },
    'Total de horas de treinamento': { oQue: 'Soma de todas as horas de treinamento ministradas no ano, multiplicando a carga horária de cada evento pelo número de participantes.', objetivo: 'Dimensionar o investimento total em capacitação, em tempo.' },
    'Média de horas de treinamento por funcionário treinado': { oQue: 'Total de horas de treinamento dividido pelo número de funcionários distintos que participaram de pelo menos um treinamento.', objetivo: 'Medir a intensidade média de capacitação por pessoa alcançada — não por toda a empresa.' },
    'Número de funcionários treinados': { oQue: 'Quantidade de funcionários distintos que participaram de ao menos um treinamento no ano.', objetivo: 'Medir o alcance (não o volume) das iniciativas de capacitação.' },
    'Valor gasto com treinamentos': { oQue: 'Custo total dos treinamentos do ano, considerando o regime de parcelamento de cada um.', objetivo: 'Quantificar o investimento financeiro em capacitação.' },
    'Média de gasto mensal com treinamentos': { oQue: 'Valor gasto com treinamentos no ano dividido por 12 meses.', objetivo: 'Facilitar a comparação com outras despesas recorrentes mensais da folha.' },
    'Custo total com hora extra': { oQue: 'Soma de todos os pagamentos de hora extra lançados na folha ao longo do ano.', objetivo: 'Identificar se a equipe está dimensionada corretamente — hora extra alta e recorrente pode ser mais cara que contratar.' },
    'Custo total com folha de pagamento (benefícios + custos)': { oQue: 'Soma de tudo que a empresa gastou com a folha no ano: remuneração, encargos e benefícios.', objetivo: 'É o número consolidado de custo de pessoal do ano.' },
    '% do custo total de treinamentos sobre o total da folha': { oQue: 'Quanto o gasto com treinamentos representa, em percentual, do custo total da folha do ano.', objetivo: 'Comparar o investimento em capacitação com o tamanho da folha, um jeito comum de benchmarking de RH.' },
    'Custo médio por funcionário treinado': { oQue: 'Valor gasto com treinamentos dividido pelo número de funcionários que participaram de algum treinamento.', objetivo: 'Medir o investimento médio por pessoa efetivamente capacitada.' },
    'Custo dos funcionários (empresa, sem benefícios)': { oQue: 'Custo anual da empresa com remuneração e encargos, excluindo benefícios.', objetivo: 'Isolar o custo de "empregar" de cada pessoa, sem o componente de benefícios.' },
    'Custo dos benefícios (empresa, após coparticipação)': { oQue: 'Custo anual líquido dos benefícios pagos pela empresa, já descontada a parte que os funcionários pagam.', objetivo: 'Medir o investimento real da empresa em benefícios.' },
    'Coparticipação descontada dos funcionários': { oQue: 'Total que os próprios funcionários pagaram no ano pela parte deles nos benefícios.', objetivo: 'Mostrar quanto do custo dos benefícios é, na prática, compartilhado com a equipe.' },
    '% dos benefícios sobre o custo da folha': { oQue: 'Quanto os benefícios representam, em percentual, do custo total da folha do ano.', objetivo: 'Comparar o peso dos benefícios frente ao custo total de pessoal.' },
    'Proporção benefícios ÷ funcionários': { oQue: 'Razão entre o custo dos benefícios e o custo dos funcionários (remuneração) no ano.', objetivo: 'Outra forma de medir o peso relativo dos benefícios frente à remuneração direta.' },
    'Custo médio dos funcionários para a empresa': { oQue: 'Custo anual com funcionários dividido pelo headcount médio do ano.', objetivo: 'Estimar quanto custa, em média, manter uma pessoa na empresa (sem benefícios).' },
    'Custo médio dos benefícios para cada funcionário': { oQue: 'Custo anual com benefícios dividido pelo headcount médio do ano.', objetivo: 'Estimar quanto a empresa investe, em média, em benefícios por pessoa.' },
    'Custo médio da folha gerado por cada funcionário': { oQue: 'Custo total da folha do ano dividido pelo headcount médio do ano.', objetivo: 'É o "custo médio por cabeça" mais completo, somando remuneração e benefícios.' },
    'Número de novas contratações': { oQue: 'Quantidade de funcionários admitidos em cada mês do ano selecionado.', objetivo: 'Acompanhar o ritmo de contratação ao longo do ano e identificar picos sazonais de crescimento do time.' },
    'Total de desligamentos': { oQue: 'Quantidade de funcionários desligados em cada mês, por qualquer motivo.', objetivo: 'Identificar meses com concentração de saídas, que costumam preceder ou seguir problemas de clima, sazonalidade ou reestruturação.' },
    'Variação do número de funcionários': { oQue: 'Admissões menos desligamentos em cada mês — o saldo líquido de pessoas.', objetivo: 'Ver rapidamente se o time está crescendo, estável ou encolhendo mês a mês, sem precisar comparar duas séries separadas.' },
    'Nº de funcionários no início do mês': { oQue: 'Headcount (quantidade de ativos) no primeiro dia de cada mês.', objetivo: 'Servir de base para o cálculo de turnover e para dimensionar a folha do mês.' },
    'Nº de funcionários no final do mês': { oQue: 'Headcount no último dia de cada mês, já refletindo admissões e desligamentos do período.', objetivo: 'Mostrar a evolução real do tamanho do time mês a mês.' },
    'Nº de funcionários no início e no final do mês': { oQue: 'Headcount no primeiro e no último dia de cada mês, lado a lado.', objetivo: 'Comparar as duas leituras num único gráfico: a diferença entre as barras do mesmo mês é o saldo líquido de admissões e desligamentos.' },
    'Taxa de Turnover %': { oQue: 'Rotatividade do mês: (admissões + desligamentos) ÷ 2, dividido pelo headcount médio do período.', objetivo: 'É o indicador padrão de RH para medir a estabilidade da equipe — valores altos e sustentados custam caro em treinamento e produtividade perdida.', leitura: 'Compare com a linha de média tracejada: picos muito acima dela merecem investigação do motivo.' },
    'Desligamentos por motivo': { oQue: 'Todos os desligamentos do ano, empilhados por mês e coloridos por motivo (pedido de demissão, justa causa, fim de experiência etc.).', objetivo: 'Distinguir desligamentos que a empresa decidiu dos que o funcionário decidiu — a ação corretiva é diferente em cada caso.', leitura: 'A altura da barra empilhada é o total de saídas do mês; cada cor é um motivo. Use o botão "Legenda" para isolar motivos específicos.' },
    'Ranking por motivo': { oQue: 'Os mesmos desligamentos do gráfico ao lado, agora somados no ano inteiro e ordenados do motivo mais frequente para o menos frequente.', objetivo: 'Responder rapidamente "qual é o principal motivo de saída este ano?", sem precisar somar barras mentalmente.' },
    'Ranking por tipo': { oQue: 'O total de dias de ausência no ano, por tipo (férias, faltas, licenças), do maior para o menor.', objetivo: 'Mostrar qual tipo de ausência mais pesa no ano — férias é esperado ser o maior; faltas e licenças em destaque merecem atenção.' },
    'Ranking por benefício': { oQue: 'O custo anual de cada benefício oferecido, do maior para o menor.', objetivo: 'Identificar quais benefícios concentram o orçamento, para priorizar renegociação com fornecedores ou revisão do pacote.' },
    'Escolaridade': { oQue: 'Quantidade de funcionários ativos em cada nível de escolaridade cadastrado.', objetivo: 'Entender o perfil educacional da equipe para planejar programas de capacitação e requisitos de vagas futuras.' },
    'Tipo de cargo': { oQue: 'Quantidade de funcionários ativos por tipo de cargo (operacional, administrativo etc., conforme cadastrado).', objetivo: 'Visualizar a distribuição da equipe entre as categorias de função da empresa.' },
    'Sexo': { oQue: 'Distribuição de funcionários ativos por sexo.', objetivo: 'Acompanhar a diversidade de gênero da equipe ao longo do tempo.' },
    'Promoções / ajustes salariais': { oQue: 'Quantidade de promoções ou ajustes salariais registrados em cada mês.', objetivo: 'Acompanhar a frequência de reconhecimento salarial ao longo do ano.' },
    'Custo mensal adicional (Δ salários)': { oQue: 'A soma dos aumentos salariais (salário novo − salário antigo) de cada promoção, por mês em que ela ocorreu.', objetivo: 'Dimensionar o impacto financeiro recorrente que as promoções do mês adicionam à folha.' },
    'Todas as ausências': { oQue: 'Todas as férias, faltas e licenças do ano, empilhadas por mês e coloridas por tipo — em dias corridos ou em quantidade de registros, conforme o modo escolhido.', objetivo: 'Ver a carga total de ausências mês a mês e identificar concentrações (ex.: muitas férias em julho/dezembro).', leitura: 'Use "Contar por" para alternar entre dias e quantidade de ocorrências, e "Legenda" para isolar tipos específicos — o Ranking ao lado acompanha a mesma seleção.' },
    'Custo dos funcionários (empresa)': { oQue: 'Custo mensal da folha atribuído aos funcionários (salário, encargos e demais custos), excluindo benefícios.', objetivo: 'Isolar o custo de remuneração pura, sem o componente de benefícios, para análises de custo por cabeça.' },
    'Custo dos benefícios (empresa)': { oQue: 'Custo mensal dos benefícios pago pela empresa, já descontada a coparticipação dos funcionários.', objetivo: 'Medir o investimento líquido da empresa em benefícios, separado da remuneração.' },
    'Custo total com folha (empresa)': { oQue: 'Soma de tudo que a empresa paga pela folha no mês: remuneração, encargos e benefícios líquidos.', objetivo: 'É o número que efetivamente sai do caixa da empresa com pessoal em cada mês.' },
    'Benefícios ÷ funcionários (%)': { oQue: 'Custo dos benefícios do mês dividido pelo custo dos funcionários (remuneração) do mesmo mês, em percentual.', objetivo: 'Mostrar o peso relativo dos benefícios frente à remuneração direta, mês a mês, sem depender do tamanho absoluto da folha.' },
    'Custo médio dos funcionários por funcionário': { oQue: 'Custo dos funcionários do mês dividido pelo headcount médio do mês (média entre início e fim do mês).', objetivo: 'Estimar quanto custa, em média, manter uma pessoa na empresa naquele mês, sem o componente de benefícios.' },
    'Custo médio dos benefícios por funcionário': { oQue: 'Custo dos benefícios do mês dividido pelo headcount médio do mês.', objetivo: 'Estimar quanto a empresa investe, em média, em benefícios por pessoa naquele mês.' },
    'Descontos de benefícios (funcionário)': { oQue: 'Total que os funcionários pagaram no mês pela parte deles (coparticipação) nos benefícios, descontado em folha.', objetivo: 'Mostrar quanto do custo dos benefícios é, na prática, compartilhado com a equipe naquele mês.' },
    'Custo com treinamentos (parcelas)': { oQue: 'Custo de treinamentos atribuído ao mês, considerando o regime de parcelamento de cada treinamento lançado.', objetivo: 'Ver a distribuição mensal do investimento em capacitação, já rateada pelas parcelas.' },
    'Custo com promoções (Δ salários)': { oQue: 'Soma dos aumentos salariais (salário novo − salário antigo) das promoções ocorridas no mês.', objetivo: 'Dimensionar o impacto financeiro recorrente que as promoções do mês adicionam à folha.' },
    'Encargos': { oQue: 'Soma do FGTS lançado na folha do mês — custo da empresa, sem contar o INSS (que é desconto do empregado, não custo da empresa).', objetivo: 'Isolar o custo tributário da folha que efetivamente sai do caixa da empresa, separado da remuneração e dos benefícios.' },
    'Outros custos': { oQue: 'Soma de custos lançados na folha do mês que não se enquadram em remuneração, encargos, benefícios ou hora extra.', objetivo: 'Capturar despesas de pessoal que não têm categoria própria, para que o custo total da folha feche corretamente.' },
    'Todos os benefícios': { oQue: 'O custo mensal de cada benefício ativo, empilhado por mês.', objetivo: 'Ver como o gasto com benefícios se distribui entre os diferentes tipos oferecidos, mês a mês.', leitura: 'Use "Legenda" para isolar um benefício específico e acompanhar sua evolução sozinho.' },

    // ---- Banco de horas ----
    // A aba inteira é conceito novo para quem lê: um KPI de banco de horas sem explicação
    // é um número que ninguém confia — e, portanto, que ninguém usa.
    'Horas extras geradas': { oQue: 'Total de horas extras lançadas no banco em cada mês, somando todos os funcionários.', objetivo: 'Dimensionar quanto trabalho além da jornada a operação está consumindo — extra alta e recorrente costuma ser sinal de equipe subdimensionada, não de esforço pontual.' },
    'Atrasos e faltas de horário': { oQue: 'Total de horas de atraso, saída antecipada e falta de horário lançadas no banco em cada mês.', objetivo: 'Medir o lado devedor do banco. É com estas horas que a extra é compensada — sem elas, o saldo só cresce até virar pagamento.' },
    'Saldo líquido do mês': { oQue: 'Horas extras menos atrasos em cada mês. Positivo = a empresa deve horas; negativo = o funcionário deve.', objetivo: 'Ver se o banco está se equilibrando mês a mês ou acumulando dívida em uma direção só.', leitura: 'Meses seguidos de saldo positivo sem meses negativos compensando significam que o banco não está funcionando como banco — está virando hora extra com prazo.' },
    'Saldo acumulado (fim do mês)': { oQue: 'A soma de todos os saldos em aberto ao final de cada mês, considerando apenas ciclos ainda não liquidados.', objetivo: 'É o passivo em horas da empresa ao longo do ano — a linha que precisa voltar para perto de zero antes de cada fechamento de ciclo.', leitura: 'Uma curva que só sobe é o retrato de um banco que nunca compensa. Quedas bruscas são fechamentos de ciclo (pagamento ou compensação).' },
    'Taxa de compensação': { oQue: 'Quanto das horas extras geradas foi efetivamente compensado com atrasos e folgas, em percentual, mês a mês.', objetivo: 'Mede se o banco de horas está cumprindo sua função. O banco existe para trocar hora por hora — se a taxa é baixa e sustentada, ele virou hora extra disfarçada com prazo de validade, e o acordo de compensação não está sendo cumprido na prática.', leitura: 'Acima de 100% significa que se compensou mais do que se gerou no mês (o saldo antigo está sendo quitado) — é o comportamento saudável depois de um pico.' },
    'Passivo estimado em aberto': { oQue: 'Estimativa em reais do custo dos saldos positivos ainda não liquidados: horas × valor-hora × adicional de hora extra.', objetivo: 'Traduzir o saldo em horas para a linguagem do financeiro. É o valor que a empresa desembolsa se nada for compensado até o fim dos ciclos.', leitura: 'É uma estimativa para dimensionar risco, calculada com o divisor 220 e o adicional configurado em Parâmetros. Não substitui o cálculo da folha.' },
    'Ranking por saldo em aberto': { oQue: 'Os funcionários com ciclo em aberto, ordenados pelo saldo acumulado, do maior para o menor.', objetivo: 'Responder "quem concentra o problema?" sem varrer a lista inteira — banco de horas costuma se concentrar em poucas pessoas.' },
    'Mapa de ciclos': { oQue: 'Uma linha por funcionário, mostrando o período do ciclo de compensação dele e a data em que fecha. A cor indica a situação; o losango marca o fechamento.', objetivo: 'Responder de uma olhada o que uma grade Jan–Dez não consegue: quem fecha primeiro, com quanto saldo, e em que ordem agir. Cada funcionário tem um ciclo próprio, ancorado no primeiro mês de saldo lançado para ele — o ano civil não tem relação com esses prazos.', leitura: 'Ciclos vencidos (hachurados) já passaram do prazo legal de compensação: o saldo positivo neles é devido como hora extra.' }
};

// ---- Ponte tabela↔gráfico ----
// As abas montam suas linhas no formato de tabelaMensal ({label, fmt, vals, total}).
// Em vez de duplicar isso em outra estrutura para os gráficos, os renderizadores abaixo
// consomem as MESMAS linhas — número mostrado é sempre o número calculado.

// Soma, por label, os itens que origemFn(li, m) devolve em cada um dos 12 meses — vira o
// "Cálculo" do card (barra horizontal): os itens DE VERDADE (funcionários, treinamentos,
// benefícios...) que somados chegam no total do ano, não os 12 meses do próprio gráfico.
function origemAnual(li, origemFn) {
    if (!origemFn) return null;
    const acc = {};
    for (let m = 0; m < 12; m++) {
        const itens = origemFn(li, m);
        if (!itens) return null;
        itens.forEach(it => { acc[it.label] = (acc[it.label] || 0) + it.valor; });
    }
    return Object.entries(acc).map(([label, valor]) => ({ label, valor })).filter(it => it.valor);
}

// HTML de um grupo de cards (um por linha). `cols` fixa quantos por linha (padrão: auto-fill).
// `origemFn(li, mesIndex)`: mesma função passada a pintarPorLinha() para o clique na coluna —
// reaproveitada aqui, agregada nos 12 meses, para popular o "Cálculo" do botão "i". Sem ela
// (ou quando devolve null), o card não tem um "de onde veio" real e a seção fica de fora —
// nunca se inventa uma barra por mês só para preencher o espaço.
// Desenhar fica para pintarPorLinha().
// `extraCardsHtml`: cards adicionais (já prontos, ex.: htmlCardDuasSeries) para entrar no
// MESMO grid — um grid CSS por card faria o card extra ficar sozinho na própria linha, com
// as colunas vazias sobrando ao lado, em vez de completar a fileira dos demais.
function htmlPorLinha(prefixo, titulo, linhas, cols = 0, origemFn, extraCardsHtml = '') {
    const cards = linhas.map((li, i) => {
        const media = li.vals.reduce((a, b) => a + b, 0) / 12;
        const total = li.total === 'none' ? null
            : li.total === 'last' ? li.vals[11]
            : li.vals.reduce((a, b) => a + b, 0);
        const fmtT = li.fmt === 'num' ? 'num' : li.fmt;
        return chartCard({
            id: `${prefixo}_${i}`,
            titulo: escapeHtml(li.label),
            total: total == null ? null : dvValorFmt(li.totalValor ?? total, fmtT),
            media: `média ${dvValorFmt(media, li.fmt === 'num' ? 'dec' : li.fmt)}${li.total === 'none' ? '' : '/mês'}`,
            info: RES_EXPLICACOES[li.label],
            calculoItens: origemAnual(li, origemFn),
            calculoFmt: li.fmt
        });
    }).join('') + extraCardsHtml;

    const clsCols = cols ? ` chart-grid-${cols}` : '';
    return `${titulo ? `<div class="res-grupo-tit">${titulo}</div>` : ''}<div class="chart-grid${clsCols}">${cards}</div>`;
}

// Desenha os gráficos de um grupo montado por htmlPorLinha() (canvas já no DOM).
// `origemFn(li, mesIndex)`, se passada, habilita o clique na coluna: retorna os itens
// individuais (funcionários, treinamentos, promoções...) que somados compõem aquele mês.
// Sem origemFn (ou quando ela devolve null p/ aquela linha), a coluna não reage ao clique —
// nem todo indicador tem um "de onde veio" além do próprio número (ex.: uma razão/percentual).
function pintarPorLinha(prefixo, linhas, origemFn) {
    linhas.forEach((li, i) => {
        const media = li.vals.reduce((a, b) => a + b, 0) / 12;
        mkChart('resultados', `${prefixo}_${i}`, {
            type: 'bar',
            data: { labels: MESES, datasets: [dvBarra(li.label, li.vals, dvCor(i)), dvLinhaMedia(media)] },
            options: dvOpts({
                fmt: li.fmt,
                onClick: origemFn ? (evt, els) => {
                    const el = els.find(e => e.datasetIndex === 0) || els[0];
                    if (!el) return;
                    const m = el.index;
                    const itens = origemFn(li, m);
                    if (!itens) return;
                    abrirOrigemDados(li.label, MESES[m],
                        itens.map(it => ({ label: it.label, valorFmt: dvValorFmt(it.valor, li.fmt === 'num' ? 'dec' : li.fmt) })),
                        dvValorFmt(li.vals[m], li.fmt));
                } : undefined
            })
        });
    });
}

// Um único card com DUAS séries lado a lado por mês (barras agrupadas, não empilhadas) —
// para comparar duas leituras do mesmo mês (ex.: headcount no início vs. no final), que
// faziam mais sentido num gráfico só do que em dois cards separados e desalinhados.
// Sem wrapper de grid: entra como card extra dentro do grid de quem chamar (ver htmlPorLinha).
function cardDuasSeries(id, titulo, liA, liB) {
    const mediaA = liA.vals.reduce((a, b) => a + b, 0) / 12;
    const mediaB = liB.vals.reduce((a, b) => a + b, 0) / 12;
    return chartCard({
        id, titulo: escapeHtml(titulo),
        media: `média ${dvValorFmt(mediaA, 'dec')} → ${dvValorFmt(mediaB, 'dec')}/mês`,
        info: RES_EXPLICACOES[titulo]
    });
}

function pintarDuasSeries(id, liA, liB) {
    mkChart('resultados', id, {
        type: 'bar',
        data: { labels: MESES, datasets: [dvBarra(liA.label, liA.vals, dvCor(0)), dvBarra(liB.label, liB.vals, dvCor(1))] },
        options: dvOpts({
            fmt: liA.fmt, legenda: true,
            tooltipExtra: {
                callbacks: {
                    footer: items => {
                        const m = items[0].dataIndex;
                        const saldo = liB.vals[m] - liA.vals[m];
                        return `Saldo do mês: ${saldo > 0 ? '+' : ''}${dvValorFmt(saldo, liA.fmt)}`;
                    }
                }
            }
        })
    });
}

// Um único gráfico empilhado por mês (categorias somando no mesmo mês).
const somaLinhasMes = linhas => MESES.map((_, m) => linhas.reduce((s, li) => s + li.vals[m], 0));

// Quais séries do empilhado estão visíveis, por id de gráfico. A legenda virou botão:
// clicar abre um popover onde se marca/desmarca cada série (e restaura). O estado precisa
// sobreviver ao redesenho do Chart.js, então mora fora dele.
const _empVis = {};

// Card do empilhado (com botão "Legenda"). Sozinho, ocupa a faixa toda.
function htmlEmpilhado(id, titulo, linhas, fmt = 'num') {
    return `<div class="chart-grid chart-grid-full">${cardEmpilhado(id, titulo, linhas, fmt)}</div>`;
}

function cardEmpilhado(id, titulo, linhas, fmt, chaveInfo) {
    const totalGeral = linhas.reduce((s, li) => s + li.vals.reduce((a, b) => a + b, 0), 0);
    // Cálculo do empilhado: cada série (motivo, benefício, tipo...) somada no ano — os
    // mesmos itens que compõem as cores da barra, só que agregados em 12 meses.
    const calculoItens = linhas.map(li => ({ label: li.label, valor: li.vals.reduce((a, b) => a + b, 0) }));
    return chartCard({
        id, titulo,
        sub: 'Empilhado por mês — clique em “Legenda” para filtrar séries',
        acao: `<button class="chart-legenda-btn" data-emp="${id}">${icon('filter')}<span>Legenda</span></button>`,
        total: dvValorFmt(totalGeral, fmt),
        media: `média ${dvValorFmt(totalGeral / 12, fmt === 'num' ? 'dec' : fmt)}/mês`,
        info: RES_EXPLICACOES[chaveInfo || titulo],
        calculoItens, calculoFmt: fmt
    });
}

// Par lado a lado: empilhado mensal (esquerda) + ranking horizontal por categoria no
// ano (direita, maior→menor com quantidade e %). Mesmo dado, duas leituras.
// `chaveInfoEmp`: chave estática opcional para o dicionário de explicações, quando o
// título do empilhado varia em runtime (ex.: "(dias)" ↔ "(ocorrências)").
function htmlEmpilhadoComRanking(idEmp, idRank, tituloEmp, tituloRank, linhas, fmt = 'num', chaveInfoEmp) {
    const totalGeral = linhas.reduce((s, li) => s + li.vals.reduce((a, b) => a + b, 0), 0);
    const calculoItens = linhas.map(li => ({ label: li.label, valor: li.vals.reduce((a, b) => a + b, 0) }));
    return `<div class="chart-duo">
        ${cardEmpilhado(idEmp, tituloEmp, linhas, fmt, chaveInfoEmp)}
        ${chartCard({ id: idRank, titulo: tituloRank, sub: 'No ano — maior para o menor', total: dvValorFmt(totalGeral, fmt), info: RES_EXPLICACOES[tituloRank], calculoItens, calculoFmt: fmt })}
    </div>`;
}

// Desenha o par: empilhado (com filtro de legenda) + ranking horizontal.
// A legenda do empilhado é a fonte da verdade de "quais séries estão em foco" — o ranking
// ao lado é redesenhado junto, respeitando a mesma seleção (ver rankId em pintarEmpilhado).
function pintarEmpilhadoComRanking(idEmp, idRank, linhas, fmt = 'num') {
    pintarEmpilhado(idEmp, linhas, fmt, idRank);
}

function pintarEmpilhado(id, linhas, fmt = 'num', rankId = null) {
    // Estado inicial: todas as séries com algum valor no ano.
    if (!_empVis[id]) _empVis[id] = new Set(linhas.map((li, i) => String(i)).filter(k => linhas[+k].vals.some(v => v)));
    const visiveis = () => linhas.map((li, i) => ({ li, i })).filter(({ i }) => _empVis[id].has(String(i)));

    const desenha = () => {
        chartDestroyOne('resultados', id);
        const vis = visiveis();
        const somaMes = MESES.map((_, m) => vis.reduce((s, { li }) => s + li.vals[m], 0));
        mkChart('resultados', id, {
            type: 'bar',
            data: { labels: MESES, datasets: vis.map(({ li, i }) => dvBarra(li.label, li.vals, dvCor(i), { borderRadius: 3 })) },
            options: dvOpts({
                fmt, legenda: false, empilhado: true,
                tooltipExtra: {
                    // Some com o que não tem valor no mês: uma legenda inteira de zeros polui.
                    filter: item => item.parsed.y > 0,
                    callbacks: { footer: items => `Total do mês: ${dvValorFmt(somaMes[items[0].dataIndex], fmt)}` }
                },
                // Empilhado: a "origem" de uma coluna é genérica e sempre disponível — é a
                // própria composição por série (cada cor do empilhado já é um item somado).
                // Não depende de metadado extra por gráfico, ao contrário de pintarPorLinha().
                onClick: (evt, els) => {
                    if (!els.length) return;
                    const m = els[0].index;
                    const itens = vis
                        .map(({ li }) => ({ label: li.label, valor: li.vals[m] }))
                        .filter(it => it.valor)
                        .sort((a, b) => b.valor - a.valor);
                    abrirOrigemDados('Composição do mês', MESES[m],
                        itens.map(it => ({ label: it.label, valorFmt: dvValorFmt(it.valor, fmt) })),
                        dvValorFmt(somaMes[m], fmt));
                }
            })
        });
        if (rankId) pintarRankingHorizontal('resultados', rankId, linhas, fmt, _empVis[id]);
    };
    desenha();

    const btn = document.querySelector(`.chart-legenda-btn[data-emp="${id}"]`);
    if (btn) btn.onclick = () => openMultiPopover(btn, {
        items: linhas.map((li, i) => ({ key: String(i), label: li.label, cor: dvCor(i) })),
        selected: _empVis[id],
        onChange: () => desenha(),
        onReset: () => { _empVis[id] = new Set(linhas.map((li, i) => String(i)).filter(k => linhas[+k].vals.some(v => v))); desenha(); }
    });
}

// ---- Formatação ----
// `null` = sem dado (mês futuro, mês sem base de cálculo) e não é zero: "00:00" afirma que
// o saldo é nulo, "—" admite que não há informação. A diferença importa quando o número
// vira decisão.
const fmtVal = (v, fmt) =>
    v == null ? '—'
    : fmt === 'brl' ? fmtBRL(v)
    : fmt === 'pct' ? fmtPct(v)
    : fmt === 'hhmm' ? fmtHHMM(v)
    : fmt === 'dec' ? (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
    : fmtNum(Math.round(Number(v) || 0));

// Painel "Indicador | Resultado" da aba Geral.
// Cada linha: [rótulo, valor, ícone?, tom?]. O ícone é âncora visual para varrer a lista
// sem ler — por isso o tom acompanha o significado (custo, alerta, positivo), não a estética.
// A aba Geral não tem gráfico (valores únicos), então o botão "i" vira a própria linha:
// clicar em qualquer lugar dela abre a explicação, em vez de um ícone "i" isolado.
// Registro linha→{titulo, info} para o clique achar o conteúdo já resolvido: o rótulo
// exibido pode ter o ano interpolado ("Admissões em 2026"), então a info é resolvida
// aqui (na hora do render, com chaveInfo disponível) e não recalculada a partir do DOM.
let _indInfoSeq = 0;
const _indInfoReg = {};

function tabelaIndicadores(titulo, linhas, opts = {}) {
    return `
        <div class="ind-card">
            <div class="ind-head">
                ${opts.icone ? `<span class="ind-head-ico ${opts.tom ? `tom-${opts.tom}` : ''}">${icon(opts.icone)}</span>` : ''}
                <strong>${titulo}</strong>
            </div>
            <div class="ind-list">
                ${linhas.map(([rotulo, valor, ico, tom, chaveInfo]) => {
                    const info = RES_EXPLICACOES[chaveInfo || rotulo];
                    let attrId = '';
                    if (info) { attrId = String(++_indInfoSeq); _indInfoReg[attrId] = { titulo: rotulo, info }; }
                    return `
                    <div class="ind-row${info ? ' ind-row-info' : ''}"${info ? ` data-ind-info="${attrId}"` : ''}>
                        <span class="ind-ico ${tom ? `tom-${tom}` : ''}">${icon(ico || 'chart')}</span>
                        <span class="ind-lbl">${rotulo}</span>
                        <span class="ind-val ${tom ? `txt-tom-${tom}` : ''}">${valor}</span>
                        ${info ? `<span class="ind-info-chevron">${icon('chevronRight')}</span>` : ''}
                    </div>`;
                }).join('')}
            </div>
        </div>`;
}

document.addEventListener('click', e => {
    const row = e.target.closest('.ind-row-info');
    if (!row) return;
    const entry = _indInfoReg[row.dataset.indInfo];
    if (entry) openChartInfo(entry.titulo, entry.info);
});

// Tabela mensal Jan–Dez + Média + Total
function tabelaMensal(titulo, linhas) {
    return `
        <div class="table-wrap" style="margin-bottom:18px">
            <div class="table-toolbar"><strong>${titulo}</strong></div>
            <div class="table-scroll"><table class="table res-mensal">
                <thead><tr><th></th>${MESES.map(m => `<th class="num">${m}</th>`).join('')}<th class="num">Média</th><th class="num">Total</th></tr></thead>
                <tbody>${linhas.map(li => {
                    const vals = li.vals;
                    // Média sobre os meses COM dado: dividir por 12 sempre faria um mês
                    // futuro (null) contar como zero e afundar a média de um ano em curso.
                    const comDado = vals.filter(v => v != null);
                    const media = comDado.length ? comDado.reduce((a, b) => a + b, 0) / comDado.length : 0;
                    // 'last-real': último mês COM dado, para estoques num ano em curso —
                    // 'last' pegaria dezembro e anunciaria saldo zero em julho.
                    const total = li.total === 'none' ? null
                        : li.total === 'last' ? vals[11]
                        : li.total === 'last-real' ? (vals.filter(v => v != null).slice(-1)[0] ?? 0)
                        : vals.reduce((a, b) => a + b, 0);
                    return `<tr>
                        <td style="white-space:nowrap">${escapeHtml(li.label)}</td>
                        ${vals.map(v => `<td class="num">${fmtVal(v, li.fmt)}</td>`).join('')}
                        <td class="num text-2">${fmtVal(media, li.fmt === 'num' ? 'dec' : li.fmt)}</td>
                        <td class="num"><strong>${total == null ? '—' : fmtVal(li.totalValor ?? total, li.fmt)}</strong></td>
                    </tr>`;
                }).join('')}</tbody>
            </table></div>
        </div>`;
}

// ============ GERAL ============
function resGeral(cont) {
    const { ano, dados } = resState;
    const { funcs, ids, meses } = resBase();
    const fin = can('ver_financeiro');

    const admAno = meses.reduce((s, m) => s + m.adm, 0);
    const demAno = meses.reduce((s, m) => s + m.dem, 0);
    const headFimAno = meses[11].hFim;
    const headMedioAno = meses.reduce((s, m) => s + m.hFim, 0) / 12 || 0;
    const turnoverAno = headMedioAno > 0 ? ((admAno + demAno) / 2) / headMedioAno * 100 : 0;

    // Média de permanência (funcionários que trabalharam no ano)
    const noAno = funcs.filter(f => f.admissao && f.admissao <= `${ano}-12-31` && (!f.demissao || f.demissao >= `${ano}-01-01`));
    const mesesPermanencia = noAno.map(f => {
        const fimP = f.demissao || hoje();
        return Math.max(0, diasEntre(f.admissao, fimP)) / 30.44;
    });
    const mediaPerm = mesesPermanencia.length ? mesesPermanencia.reduce((a, b) => a + b, 0) / mesesPermanencia.length : 0;
    const permTexto = mediaPerm >= 12 ? `${(mediaPerm / 12).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} anos` : `${Math.round(mediaPerm)} meses`;

    // Aprovação após experiência
    const diasExp = Number(dados.params.diasExperiencia) || 90;
    const motivosExp = MOTIVOS_DEMISSAO.filter(m => m.includes('experiência'));
    const admitidosAno = funcs.filter(f => (f.admissao || '').startsWith(String(ano)));
    // Fim do período de experiência (parse local: ver dataLocal em utils.js)
    const fimExperiencia = f => {
        const d = dataLocal(f.admissao);
        d.setDate(d.getDate() + diasExp);
        return d;
    };
    const completaram = admitidosAno.filter(f => fimExperiencia(f) <= new Date());
    const aprovados = completaram.filter(f => {
        if (!f.demissao) return true;
        const dem = dados.demissoes.find(d => d.funcionarioId === f.id);
        return !(dem && motivosExp.includes(dem.motivo) && dataLocal(f.demissao) <= fimExperiencia(f));
    });
    const aprovacao = completaram.length ? aprovados.length / completaram.length * 100 : null;

    // Treinamentos do ano (custo pelo regime de parcelas)
    const treinosAno = dados.treinamentos.filter(t => (t.inicio || '').startsWith(String(ano)));
    let horasTotais = 0;
    const treinados = new Set();
    treinosAno.forEach(t => {
        const parts = (t.participantes || []).filter(id => ids.has(id));
        horasTotais += (Number(t.cargaHoraria) || 0) * parts.length;
        parts.forEach(id => treinados.add(id));
    });
    const custoTreinos = meses.reduce((s, m) => s + m.treinos, 0);

    // Custos do ano (folha = custo empresa; benefícios líquidos de coparticipação)
    const folhaAno = meses.reduce((s, m) => s + m.folhaTotal, 0);
    const horaExtraAno = meses.reduce((s, m) => s + m.horaExtra, 0);
    const descontosAno = meses.reduce((s, m) => s + m.descontos, 0);
    const benefAno = meses.reduce((s, m) => s + m.beneficios, 0) - descontosAno;
    const funcAno = folhaAno - benefAno;

    // ---- Cota de aprendizes (art. 429 da CLT: 5% a 15%) ----
    // Aproximação declarada, não o cálculo oficial: a base legal conta só as funções que
    // demandam formação profissional, e o sistema não sabe quais são. Usa o headcount médio do
    // ano como denominador — o mesmo dos custos médios logo abaixo, para os números da página
    // não divergirem entre si. Serve para o RH saber se está perto do piso, não para declarar.
    const aprendizesAtivos = dados.funcionarios
        .filter(f => !f.demissao && ehAprendiz(dados.cargos.find(c => c.id === f.cargoId))).length;
    const cotaPct = headMedioAno > 0 ? aprendizesAtivos / headMedioAno * 100 : null;
    const cotaForaDaFaixa = cotaPct != null && (cotaPct < COTA_APRENDIZ_MIN_PCT || cotaPct > COTA_APRENDIZ_MAX_PCT);

    cont.innerHTML = `
        <div class="res-grid">
        ${tabelaIndicadores(`Indicadores de rotatividade para ${ano}`, [
            ['Média de permanência de funcionários na empresa', permTexto, 'clock', null, 'permanencia'],
            [`Admissões em ${ano}`, fmtNum(admAno), 'userPlus', 'ok', 'admissoesAno'],
            [`Demissões em ${ano}`, fmtNum(demAno), 'userMinus', 'alerta', 'demissoesAno'],
            [`Total de funcionários em ${ano} (fim do ano)`, fmtNum(headFimAno), 'users', null, 'headcountFim'],
            ['Índice de aprovação após período de experiência', aprovacao == null ? 'Sem admissões elegíveis' : fmtPct(aprovacao), 'check', 'ok'],
            // Turnover alto é problema: acima de 25%/ano acende alerta em vez de neutro.
            ['Índice de Turnover (rotatividade)', fmtPct(turnoverAno), turnoverAno > 25 ? 'trendDown' : 'percent', turnoverAno > 25 ? 'alerta' : null],
            ['Aprendizes sobre o quadro (cota legal)',
                cotaPct == null ? '—' : `${fmtNum(aprendizesAtivos)} · ${fmtPct(cotaPct)} (faixa ${COTA_APRENDIZ_MIN_PCT}%–${COTA_APRENDIZ_MAX_PCT}%)`,
                'briefcase', cotaForaDaFaixa ? 'alerta' : 'ok', 'cotaAprendiz']
        ], { icone: 'refresh', tom: 'info' })}
        ${tabelaIndicadores(`Indicadores de treinamento para ${ano}`, [
            // "Ofertados" conta turmas/eventos iniciados no ano — não participações.
            ['Quantidade de treinamentos ofertados', fmtNum(treinosAno.length), 'book', 'info'],
            ['Total de horas de treinamento', `${fmtNum(horasTotais)}h`, 'clock', 'info'],
            ['Média de horas de treinamento por funcionário treinado', treinados.size ? `${(horasTotais / treinados.size).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}h` : '—', 'trendUp', 'info'],
            ['Número de funcionários treinados', fmtNum(treinados.size), 'users'],
            // Valor gasto e média mensal seguem o regime de parcelas (custoTreinoNoMes),
            // igual ao usado na aba Custos — some com o que a folha lança em cada mês.
            ...(fin ? [
                ['Valor gasto com treinamentos', fmtBRL(custoTreinos), 'money', 'custo'],
                ['Média de gasto mensal com treinamentos', fmtBRL(custoTreinos / 12), 'chart', 'custo']
            ] : [])
        ], { icone: 'book', tom: 'info' })}
        ${fin ? tabelaIndicadores(`Custos para ${ano}`, [
            ['Custo total com hora extra', fmtBRL(horaExtraAno), 'clock', 'custo'],
            ['Custo total com folha de pagamento (benefícios + custos)', fmtBRL(folhaAno), 'money', 'custo'],
            ['% do custo total de treinamentos sobre o total da folha', folhaAno ? fmtPct(custoTreinos / folhaAno * 100) : '—', 'percent'],
            ['Custo médio por funcionário treinado', treinados.size ? fmtBRL(custoTreinos / treinados.size) : '—', 'book'],
            ['Custo dos funcionários (empresa, sem benefícios)', fmtBRL(funcAno), 'users', 'custo'],
            ['Custo dos benefícios (empresa, após coparticipação)', fmtBRL(benefAno), 'gift', 'custo']
        ], { icone: 'money', tom: 'custo' }) + tabelaIndicadores(`Custos médios e proporções para ${ano}`, [
            ['Coparticipação descontada dos funcionários', fmtBRL(descontosAno), 'trendDown', 'ok'],
            ['% dos benefícios sobre o custo da folha', folhaAno ? fmtPct(benefAno / folhaAno * 100) : '—', 'percent'],
            ['Proporção benefícios ÷ funcionários', funcAno ? fmtPct(benefAno / funcAno * 100) : '—', 'percent'],
            ['Custo médio dos funcionários para a empresa', headMedioAno ? fmtBRL(funcAno / headMedioAno) : '—', 'user', 'custo'],
            ['Custo médio dos benefícios para cada funcionário', headMedioAno ? fmtBRL(benefAno / headMedioAno) : '—', 'gift', 'custo'],
            ['Custo médio da folha gerado por cada funcionário', headMedioAno ? fmtBRL(folhaAno / headMedioAno) : '—', 'money', 'custo']
        ], { icone: 'chart', tom: 'info' }) : `<div style="grid-column:1/-1">${emptyState({ icon: 'lock', title: 'Custos ocultos', text: 'A seção de custos exige a permissão "Ver valores financeiros".' })}</div>`}
        </div>`;
}

// ============ ROTATIVIDADE ============
function resRotatividade(cont) {
    const { ano, dados } = resState;
    const { ids, meses } = resBase();
    const headMedioAno = meses.reduce((s, m) => s + m.hFim, 0) / 12 || 0;
    const admAno = meses.reduce((s, m) => s + m.adm, 0);
    const demAno = meses.reduce((s, m) => s + m.dem, 0);
    const turnoverAno = headMedioAno > 0 ? ((admAno + demAno) / 2) / headMedioAno * 100 : 0;

    const demissoesAno = dados.demissoes.filter(d => ids.has(d.funcionarioId) && (d.data || '').startsWith(String(ano)));
    const porMotivo = MOTIVOS_DEMISSAO.map(motivo => ({
        label: motivo,
        fmt: 'num',
        vals: MESES.map((_, m) => demissoesAno.filter(d => (d.data || '').startsWith(mesKey(ano, m)) && d.motivo === motivo).length)
    }));

    const liHIni = { label: 'Nº de funcionários no início do mês', fmt: 'num', vals: meses.map(m => m.hIni), total: 'none' };
    const liHFim = { label: 'Nº de funcionários no final do mês', fmt: 'num', vals: meses.map(m => m.hFim), total: 'none' };
    const resumo = [
        { label: 'Número de novas contratações', fmt: 'num', vals: meses.map(m => m.adm) },
        { label: 'Total de desligamentos', fmt: 'num', vals: meses.map(m => m.dem) },
        { label: 'Variação do número de funcionários', fmt: 'num', vals: meses.map(m => m.adm - m.dem) },
        liHIni, liHFim,
        { label: 'Taxa de Turnover %', fmt: 'pct', vals: meses.map(m => m.turnover), totalValor: turnoverAno }
    ];
    const tituloResumo = `Resumo de indicadores de rotatividade (mensal) para ${ano}`;
    const tituloDet = `Detalhamento dos indicadores de rotatividade (mensal) para ${ano}`;

    if (!resGrafico()) {
        cont.innerHTML = tabelaMensal(tituloResumo, resumo) + tabelaMensal(tituloDet, porMotivo);
        return;
    }

    // Resumo em 3 por linha; início e final do mês viram um único card com as duas séries
    // lado a lado (mesma comparação, um gráfico só). Detalhamento = empilhado + ranking.
    const resumoGrafico = resumo.filter(li => li !== liHIni && li !== liHFim);
    const cardHeadcount = cardDuasSeries('rot_headcount', 'Nº de funcionários no início e no final do mês', liHIni, liHFim);
    cont.innerHTML =
        htmlPorLinha('rot', tituloResumo, resumoGrafico, 3, null, cardHeadcount) +
        `<div class="res-grupo-tit">${tituloDet}</div>` +
        htmlEmpilhadoComRanking('rot_motivos', 'rot_motivos_rank', 'Desligamentos por motivo', 'Ranking por motivo', porMotivo);
    pintarPorLinha('rot', resumoGrafico);
    pintarDuasSeries('rot_headcount', liHIni, liHFim);
    pintarEmpilhadoComRanking('rot_motivos', 'rot_motivos_rank', porMotivo);
}

// ============ PERFIL DA EQUIPE ============
function resPerfil(cont) {
    const { dados } = resState;
    const { funcs } = resBase();
    const ativos = funcs.filter(f => !f.demissao);

    const bloco = (titulo, contagem) => {
        const total = Object.values(contagem).reduce((a, b) => a + b, 0);
        return `
        <div class="table-wrap" style="margin-bottom:18px">
            <div class="table-toolbar"><strong>${titulo}</strong><div class="grow"></div><span class="badge badge-neutral">${total} ativos</span></div>
            <div class="table-scroll"><table class="table">
                <thead><tr><th></th><th class="num" style="width:120px">Quantidade</th><th class="num" style="width:100px">%</th></tr></thead>
                <tbody>${Object.entries(contagem).map(([k, v]) => `
                    <tr><td>${escapeHtml(k)}</td><td class="num">${fmtNum(v)}</td><td class="num text-2">${total ? fmtPct(v / total * 100) : '—'}</td></tr>`).join('')}</tbody>
            </table></div>
        </div>`;
    };

    const conta = chave => {
        const c = {};
        ativos.forEach(f => { const k = chave(f) || '—'; c[k] = (c[k] || 0) + 1; });
        return c;
    };
    const esc = {};
    ESCOLARIDADES.forEach(e => { const c = conta(f => f.escolaridade)[e]; if (c) esc[e] = c; });

    const grupos = [
        { id: 'esc', titulo: 'Escolaridade', dados: esc },
        { id: 'cargo', titulo: 'Tipo de cargo', dados: conta(f => dados.cargos.find(c => c.id === f.cargoId)?.tipo) },
        { id: 'sexo', titulo: 'Sexo', dados: conta(f => f.sexo) }
    ];

    if (!resGrafico()) {
        cont.innerHTML = `<div class="res-grid">${grupos.map(g => bloco(g.titulo, g.dados)).join('')}</div>`;
        return;
    }

    // 3 por linha: escolaridade e cargo em barras horizontais; sexo em donut.
    cont.innerHTML = `<div class="chart-grid chart-grid-3">${grupos.map(g => {
        const total = Object.values(g.dados).reduce((a, b) => a + b, 0);
        const cats = Object.keys(g.dados).length;
        return chartCard({
            id: `perf_${g.id}`, titulo: g.titulo,
            total: `${fmtNum(total)} ativos`,
            media: `${cats} categoria${cats !== 1 ? 's' : ''}`,
            info: RES_EXPLICACOES[g.titulo]
        });
    }).join('')}</div>`;

    grupos.forEach(g => {
        const labels = Object.keys(g.dados), vals = Object.values(g.dados);
        const total = vals.reduce((a, b) => a + b, 0);
        const rotuloQtdPct = v => `${fmtNum(v)} ${v === 1 ? 'funcionário' : 'funcionários'}` + (total ? ` · ${fmtPct(v / total * 100)}` : '');

        if (g.id === 'sexo') {
            // Donut com convenção de cor pedida: azul = masculino, rosa = feminino.
            const corSexo = l => /^f/i.test(l) ? '#e0559b' : /^m/i.test(l) ? '#2a78d6' : DV.s3;
            mkChart('resultados', 'perf_sexo', {
                type: 'doughnut',
                data: { labels, datasets: [{ data: vals, backgroundColor: labels.map(corSexo), borderWidth: 2, borderColor: '#fff', hoverOffset: 6 }] },
                options: {
                    responsive: true, maintainAspectRatio: false, cutout: '62%',
                    plugins: {
                        legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, font: { size: 11 } } },
                        tooltip: { padding: 10, backgroundColor: '#23233f', cornerRadius: 8, callbacks: { label: ctx => `${ctx.label}: ${rotuloQtdPct(ctx.parsed)}` } }
                    }
                }
            });
            return;
        }

        // Escolaridade e cargo: barras horizontais, quantidade e % no tooltip.
        mkChart('resultados', `perf_${g.id}`, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    data: vals,
                    backgroundColor: labels.map((_, i) => dvCor(i) + 'cc'),
                    hoverBackgroundColor: labels.map((_, i) => dvCor(i)),
                    borderRadius: 5, maxBarThickness: 30
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { padding: 10, backgroundColor: '#23233f', cornerRadius: 8, callbacks: { label: ctx => rotuloQtdPct(ctx.parsed.x) } }
                },
                scales: {
                    x: { beginAtZero: true, grid: { color: DV.grid }, border: { display: false }, ticks: { color: DV.ink, font: { size: 10 }, precision: 0 } },
                    y: { grid: { display: false }, ticks: { color: DV.ink, font: { size: 11 }, autoSkip: false } }
                }
            }
        });
    });
}

// Contagem dos gráficos de ausência: 'dias' soma a duração; 'qtd' conta ocorrências
// (quantos registros de ausência), independente de quantos dias cada um durou.
// Estado próprio da aba — não precisa sobreviver a navegação para outra aba.
const _evAusModo = { modo: 'dias' };

// ============ EVENTOS RH ============
function resEventos(cont) {
    const { ano, dados } = resState;
    const { ids } = resBase();
    const fin = can('ver_financeiro');

    const promosAno = dados.promocoes.filter(p => ids.has(p.funcionarioId) && (p.data || '').startsWith(String(ano)));
    const linhasPromo = [
        { label: 'Promoções / ajustes salariais', fmt: 'num', vals: MESES.map((_, m) => promosAno.filter(p => (p.data || '').startsWith(mesKey(ano, m))).length) }
    ];
    if (fin) linhasPromo.push({
        label: 'Custo mensal adicional (Δ salários)', fmt: 'brl',
        vals: MESES.map((_, m) => promosAno.filter(p => (p.data || '').startsWith(mesKey(ano, m)))
            .reduce((s, p) => s + Math.max(0, (Number(p.salarioNovo) || 0) - (Number(p.salarioAntigo) || 0)), 0))
    });

    const ausAno = dados.ausencias.filter(a => ids.has(a.funcionarioId) && (a.inicio || '').startsWith(String(ano)));
    const modo = _evAusModo.modo;
    const sufixo = modo === 'dias' ? '(dias)' : '(ocorrências)';
    // Em modo 'dias' soma a duração; em 'qtd' cada registro conta 1, não importa a duração —
    // são duas perguntas diferentes ("quantas pessoas-dia?" vs. "quantos eventos?").
    const valorAus = lista => modo === 'dias' ? lista.reduce((s, a) => s + (Number(a.dias) || 0), 0) : lista.length;
    const linhasAus = TIPOS_AUSENCIA.map(tipo => ({
        label: `${tipo} ${sufixo}`, fmt: 'num',
        vals: MESES.map((_, m) => valorAus(ausAno.filter(a => (a.inicio || '').startsWith(mesKey(ano, m)) && a.tipo === tipo)))
    }));
    // "Total de ocorrências" sempre conta eventos, mesmo em modo 'dias' — é uma pergunta
    // à parte (quantos registros, não quantos dias) e não pode ser confundida com um tipo.
    linhasAus.push({
        label: 'Total de ocorrências', fmt: 'num',
        vals: MESES.map((_, m) => ausAno.filter(a => (a.inicio || '').startsWith(mesKey(ano, m))).length)
    });

    const tPromo = `Promoções (mensal) para ${ano}`;
    const tAus = `Férias, Faltas e Licenças (mensal) para ${ano}`;

    if (!resGrafico()) {
        cont.innerHTML = tabelaMensal(tPromo, linhasPromo) + tabelaMensal(tAus, linhasAus);
        return;
    }

    // Ausências: um card por tipo + um card com todos os tipos empilhados.
    // O "Total de ocorrências" da tabela conta eventos, não dias — não empilha com dias.
    // Tipos zerados no ano viram cards vazios que só ocupam espaço: no modo gráfico
    // ficam de fora (a tabela continua mostrando todos os tipos, inclusive os zeros).
    const temDado = li => li.vals.some(v => v);
    // "Férias" fica fora do empilhado/ranking — são eventos de calendário, não ausências
    // no sentido de imprevisto/afastamento, e distorcem a comparação entre os demais tipos.
    const tiposAus = linhasAus.filter(li => li.label !== 'Total de ocorrências' && !li.label.startsWith('Férias ') && temDado(li));
    const cardsAus = linhasAus.filter(temDado);
    const empilharAus = tiposAus.length > 1;

    const btnModo = `<button class="chart-legenda-btn" id="evAusModoBtn">${icon('filter')}<span>Contar por: ${modo === 'dias' ? 'dias' : 'quantidade'}</span></button>`;

    cont.innerHTML =
        htmlPorLinha('ev', tPromo, linhasPromo, 3) +
        `<div class="res-grupo-tit flex-between">${tAus}${btnModo}</div>` +
        (empilharAus
            ? htmlEmpilhadoComRanking('ev_aus_all', 'ev_aus_rank', `Todas as ausências ${sufixo}`, 'Ranking por tipo', tiposAus, 'num', 'Todas as ausências')
            : '') +
        (cardsAus.length ? htmlPorLinha('ev_aus', '', cardsAus, 3)
                         : emptyState({ icon: 'calendar', title: 'Sem ausências', text: `Nenhuma ausência registrada em ${ano}.` }));

    pintarPorLinha('ev', linhasPromo);
    if (empilharAus) pintarEmpilhadoComRanking('ev_aus_all', 'ev_aus_rank', tiposAus);
    if (cardsAus.length) pintarPorLinha('ev_aus', cardsAus);

    document.getElementById('evAusModoBtn').onclick = e => openFilterPopover(e.currentTarget, {
        options: [{ value: 'dias', label: 'Dias (soma a duração)' }, { value: 'qtd', label: 'Quantidade (conta ocorrências)' }],
        value: modo, searchable: false,
        onPick: v => { _evAusModo.modo = v; renderResTab(); }
    });
}

// ============ CUSTOS: FUNCIONÁRIOS × BENEFÍCIOS ============
function resFinanceiro(cont) {
    if (!can('ver_financeiro')) {
        cont.innerHTML = emptyState({ icon: 'lock', title: 'Acesso restrito', text: 'Esta aba exige a permissão "Ver valores financeiros".' });
        return;
    }
    const { ano, dados } = resState;
    const { ids, meses } = resBase();

    const linhas = [
        { label: 'Custo dos funcionários (empresa)', fmt: 'brl', vals: meses.map(m => m.funcionariosCusto) },
        { label: 'Custo dos benefícios (empresa)', fmt: 'brl', vals: meses.map(m => m.beneficiosLiq) },
        { label: 'Custo total com folha (empresa)', fmt: 'brl', vals: meses.map(m => m.folhaTotal) },
        { label: 'Benefícios ÷ funcionários (%)', fmt: 'pct', vals: meses.map(m => m.funcionariosCusto ? m.beneficiosLiq / m.funcionariosCusto * 100 : 0), total: 'none' },
        { label: 'Custo médio dos funcionários por funcionário', fmt: 'brl', vals: meses.map(m => m.hMedio ? m.funcionariosCusto / m.hMedio : 0), total: 'none' },
        { label: 'Custo médio dos benefícios por funcionário', fmt: 'brl', vals: meses.map(m => m.hMedio ? m.beneficiosLiq / m.hMedio : 0), total: 'none' },
        { label: 'Descontos de benefícios (funcionário)', fmt: 'brl', vals: meses.map(m => m.descontos) },
        { label: 'Custo com treinamentos (parcelas)', fmt: 'brl', vals: meses.map(m => m.treinos) },
        { label: 'Custo com promoções (Δ salários)', fmt: 'brl', vals: meses.map(m => m.promoCusto) },
        { label: 'Encargos', fmt: 'brl', vals: meses.map(m => m.encargos) },
        { label: 'Outros custos', fmt: 'brl', vals: meses.map(m => m.outros) },
        { label: 'INSS (desconto do empregado)', fmt: 'brl', vals: meses.map(m => m.inss) }
    ];

    // Detalhamento por benefício: adesões atuais × funcionários presentes na folha do mês
    const linhasBenef = dados.beneficios.map(b => ({
        label: b.nome || '', fmt: 'brl',
        vals: MESES.map((_, m) => {
            const folhaMes = dados.folha[mesKey(ano, m)] || {};
            let total = 0;
            Object.keys(folhaMes).forEach(fid => {
                if (!ids.has(fid)) return;
                const f = dados.funcionarios.find(x => x.id === fid);
                (f?.beneficios || []).forEach(fb => {
                    if (fb.beneficioId !== b.id) return;
                    total += (Number(b.custoTitular) || 0) + (fb.dependentes || []).length * (Number(b.custoDependente) || 0);
                });
            });
            return total;
        })
    }));

    const tCusto = `Custo dos funcionários × custo dos benefícios (mensal) para ${ano}`;
    const tBenef = `Detalhamento dos custos com benefícios (mensal) para ${ano}`;
    const notaBenef = '<p class="muted" style="font-size:12px">Detalhamento estimado a partir das adesões atuais × funcionários presentes na folha de cada mês.</p>';

    if (!resGrafico()) {
        cont.innerHTML = tabelaMensal(tCusto, linhas)
            + (dados.beneficios.length ? tabelaMensal(tBenef, linhasBenef) + notaBenef : '');
        return;
    }

    // Empilhar só compara se houver o que comparar: com 1 benefício o empilhado e o
    // card individual seriam o mesmo gráfico repetido.
    const empilharBenef = linhasBenef.length > 1;

    // Linhas por funcionário da folha do mês `m` (já com HE do banco embutida) — mesma base
    // usada por resBase() para somar os totais, só que aqui mantemos o id de cada linha para
    // poder fragmentar a soma de volta em "quem contribuiu com quanto". Definidas ANTES do
    // HTML porque tanto o "Cálculo" do botão "i" (agregado no ano) quanto o clique na coluna
    // (um mês) usam a mesma função — ver origemAnual() em htmlPorLinha().
    const finLinhasDoMes = m => {
        const mk = mesKey(ano, m);
        const folhaMes = folhaComHeBanco(dados.folha[mk] || {}, mk, dados.bhFechamentos, dados.extras, dados.bhQuitacoes, feriasCtx(dados));
        return Object.entries(folhaMes).filter(([id]) => ids.has(id));
    };
    // Nome do funcionário a partir do dataset já carregado por ESTA página (resState.dados).
    // Nada de lancFuncNome() aqui: ela cai para lancState/funcState, que só existem depois de
    // visitar Lançamentos/Funcionários na sessão — abrindo Resultados direto, ambos vêm vazios
    // e todo mundo virava "(removido)", colapsando o Cálculo numa única barra.
    const finNomeFunc = id => dados.funcionarios.find(f => f.id === id)?.nome || '(removido)';
    // Fragmenta um valor por funcionário, ordenado do maior para o menor — omite quem não
    // contribuiu (zero) para não poluir a janela de origem com uma lista cheia de "R$ 0,00".
    const finOrigemPorFuncionario = campo => (li, m) =>
        finLinhasDoMes(m)
            .map(([id, l]) => ({ label: finNomeFunc(id), valor: campo(l) }))
            .filter(x => x.valor)
            .sort((a, b) => b.valor - a.valor);

    // Todas as rubricas que compõem o bruto da folha (FOLHA_COLS + derivadas), na mesma
    // ordem/nome usados na grade de Lançamentos — ver brutoLinha em folha.js. "Benefícios"
    // fica de fora aqui porque quem pede esse detalhamento quer o bruto por rubrica; o líquido
    // de benefícios (após coparticipação) é a própria linha "Custo dos benefícios (empresa)".
    const FIN_RUBRICAS_BRUTO = [
        ...FOLHA_COLS.filter(([k]) => k !== 'beneficios'),
        [FOLHA_HE_BANCO, FOLHA_COL_LABEL[FOLHA_HE_BANCO]],
        [FOLHA_HE_MANUAL, FOLHA_COL_LABEL[FOLHA_HE_MANUAL]],
        [FOLHA_FERIAS_CALC, FOLHA_COL_LABEL[FOLHA_FERIAS_CALC]],
        [FOLHA_DECIMO_CALC, FOLHA_COL_LABEL[FOLHA_DECIMO_CALC]],
        [FOLHA_DESC_ATRASO, FOLHA_COL_LABEL[FOLHA_DESC_ATRASO]]
    ];
    // Fragmenta um valor por TIPO de custo (rubrica da folha), somando todas as linhas de
    // funcionário do mês para cada rubrica — em vez de "quem", mostra "em quê" o total se
    // decompõe, que é o que o card explica no cálculo.
    const finOrigemPorTipo = rubricas => (li, m) => {
        const linhas = finLinhasDoMes(m).map(([, l]) => l);
        return rubricas
            .map(([k, label]) => ({ label, valor: linhas.reduce((s, l) => s + (Number(l?.[k]) || 0), 0) }))
            .filter(x => x.valor)
            .sort((a, b) => b.valor - a.valor);
    };
    // Igual a finOrigemPorTipo, mas a rubrica "Benefícios" entra já LÍQUIDA da coparticipação
    // (mesmo teto de descontoEfetivoLinha: benefício 100 com coparticipação 90 aparece como
    // 10), em vez de uma linha de desconto separada — é assim que o valor entra em totalLinha,
    // e a barra "Benefícios" deve mostrar o que sobra, não o bruto do benefício.
    const finOrigemPorTipoBeneficioLiquido = rubricas => (li, m) => {
        const linhas = finLinhasDoMes(m).map(([, l]) => l);
        return rubricas
            .map(([k, label]) => ({
                label,
                valor: k === 'beneficios'
                    ? linhas.reduce((s, l) => s + beneficioLinha(l), 0)
                    : linhas.reduce((s, l) => s + (Number(l?.[k]) || 0), 0)
            }))
            .filter(x => x.valor)
            .sort((a, b) => b.valor - a.valor);
    };

    // Custos/mês (label -> como fragmentar). Razões e médias (Benefícios ÷ funcionários,
    // Custo médio...) ficam de fora: dividir não é somar, não há "itens" para listar.
    const finOrigem = {
        'Custo dos funcionários (empresa)': finOrigemPorTipo(FIN_RUBRICAS_BRUTO),
        'Custo dos benefícios (empresa)': finOrigemPorFuncionario(beneficioLinha),
        'Custo total com folha (empresa)': finOrigemPorTipoBeneficioLiquido([...FIN_RUBRICAS_BRUTO, ['beneficios', FOLHA_COL_LABEL.beneficios]]),
        'Descontos de benefícios (funcionário)': finOrigemPorFuncionario(descontoLinha),
        'Encargos': finOrigemPorFuncionario(l => Number(l?.encargos) || 0),
        'Outros custos': finOrigemPorFuncionario(l => Number(l?.outros) || 0),
        'INSS (desconto do empregado)': finOrigemPorFuncionario(l => Number(l?.[FOLHA_INSS]) || 0),
        'Custo com treinamentos (parcelas)': (li, m) => dados.treinamentos
            .map(t => ({ label: t.nome || '(sem nome)', valor: custoTreinoNoMes(t, ano, m) }))
            .filter(x => x.valor)
            .sort((a, b) => b.valor - a.valor),
        'Custo com promoções (Δ salários)': (li, m) => dados.promocoes
            .filter(p => ids.has(p.funcionarioId) && (p.data || '').startsWith(mesKey(ano, m)))
            .map(p => ({ label: finNomeFunc(p.funcionarioId), valor: Math.max(0, (Number(p.salarioNovo) || 0) - (Number(p.salarioAntigo) || 0)) }))
            .filter(x => x.valor)
            .sort((a, b) => b.valor - a.valor)
    };
    const finOrigemDispatch = (li, m) => finOrigem[li.label] ? finOrigem[li.label](li, m) : null;

    // Detalhamento por benefício: fragmenta por funcionário aderido (titular + dependentes).
    const finOrigemBenef = (li, m) => {
        const b = dados.beneficios.find(x => (x.nome || '') === li.label);
        if (!b) return [];
        const folhaMes = dados.folha[mesKey(ano, m)] || {};
        return Object.keys(folhaMes).filter(fid => ids.has(fid)).flatMap(fid => {
            const f = dados.funcionarios.find(x => x.id === fid);
            return (f?.beneficios || []).filter(fb => fb.beneficioId === b.id).map(fb => ({
                label: f.nome + (fb.dependentes?.length ? ` (+${fb.dependentes.length} dep.)` : ''),
                valor: (Number(b.custoTitular) || 0) + (fb.dependentes || []).length * (Number(b.custoDependente) || 0)
            }));
        }).filter(x => x.valor).sort((a, b) => b.valor - a.valor);
    };

    cont.innerHTML =
        htmlPorLinha('fin', tCusto, linhas, 4, finOrigemDispatch)
        + (linhasBenef.length
            ? `<div class="res-grupo-tit">${tBenef}</div>`
              + (empilharBenef ? htmlEmpilhadoComRanking('fin_benef_all', 'fin_benef_rank', 'Todos os benefícios', 'Ranking por benefício', linhasBenef, 'brl') : '')
              + htmlPorLinha('fin_benef', '', linhasBenef, 4, finOrigemBenef)
              + notaBenef
            : '');

    pintarPorLinha('fin', linhas, finOrigemDispatch);
    if (linhasBenef.length) {
        if (empilharBenef) pintarEmpilhadoComRanking('fin_benef_all', 'fin_benef_rank', linhasBenef, 'brl');
        pintarPorLinha('fin_benef', linhasBenef, finOrigemBenef);
    }
}

// ============ BANCO DE HORAS ============
//
// A aba que o print de referência não conseguiria ser. Lá, tudo é grade Jan–Dez; aqui, o
// eixo do calendário serve só para a série mensal agregada (que de fato é do ano), e o que
// manda é o CICLO de cada pessoa — que começa no primeiro mês lançado para ela e fecha 6
// meses depois, atravessando o ano civil sem pedir licença.
//
// Filtro de status: popover multi-seleção, mesma mecânica da legenda do empilhado.
const _bhStatusVis = { set: null };
// Ranking por saldo: pagina de 10 em 10 — a lista cresce com o quadro de funcionários e um
// gráfico de barras horizontais com dezenas de nomes vira ilegível (e o canvas cresceria sem fim).
const BH_RANK_PAGE_SIZE = 10;
const _bhRankPag = { page: 0 };
const BH_STATUS_FILTRO = [
    { key: 'vencido', label: 'Ciclo vencido' },
    { key: 'critico', label: 'Fecha em breve' },
    { key: 'atencao', label: 'Saldo alto' },
    { key: 'em_dia', label: 'Em dia' }
];

function resBancoHoras(cont) {
    const { ano, dados } = resState;
    const { ids } = resBase();
    const fin = can('ver_financeiro');

    // Só o que está no filtro de unidade — resBase já resolveu isso em `ids`.
    const funcs = dados.funcionarios.filter(f => ids.has(f.id));
    const banco = dados.banco;
    const mesesDoAno = MESES.map((_, m) => mesKey(ano, m));

    // ---- Séries mensais do ano (agregado da empresa) ----
    const somaMes = (mk, campo) => Object.entries(banco[mk] || {})
        .filter(([id]) => ids.has(id))
        .reduce((s, [, l]) => s + (Number(l[campo]) || 0), 0);

    // Mês futuro é `null`, não zero: "00:00 de hora extra em novembro" afirma que ninguém
    // fez hora extra num mês que ainda não aconteceu. Mês passado sem lançamento continua
    // 0 — ali o zero é um fato apurado, não ausência de dado.
    const mkAtual = mesHoje();
    const futuro = mk => mk > mkAtual;
    const extraVals = mesesDoAno.map(mk => futuro(mk) ? null : somaMes(mk, 'extraMin'));
    // Atraso inclui as ausências parciais descontadas (parcialMin): é a mesma hora não
    // trabalhada, só apurada por lançamento com declaração em vez de digitada na grade.
    const atrasoVals = mesesDoAno.map(mk => futuro(mk)
        ? null
        : somaMes(mk, 'atrasoMin') + somaMes(mk, 'parcialMin') + somaMes(mk, 'liberacaoMin'));
    const saldoVals = extraVals.map((e, i) => e == null ? null : e - atrasoVals[i]);

    // Taxa de compensação: quanto do que se gerou foi devolvido em folga/atraso.
    //
    // Mês sem hora extra NÃO é 0% — é ausência de dado. Zero desenharia uma barra vazia
    // dizendo "não compensou nada" sobre um mês em que não havia nada a compensar, e a
    // média do ano seria puxada para baixo por meses que nunca existiram. `null` faz o
    // Chart.js pular o ponto, e a média anual é calculada só sobre os meses com extra.
    const taxaVals = extraVals.map((e, i) => e > 0 ? atrasoVals[i] / e * 100 : null);
    const soma = arr => arr.reduce((a, b) => a + (b ?? 0), 0);

    // Saldo acumulado ao fim de cada mês, considerando só ciclos em aberto. É o passivo em
    // horas ao longo do ano — a linha que precisa voltar a zero antes de cada fechamento.
    //
    // Meses futuros ficam `null`, não repetindo o último valor: prolongar a linha reta até
    // dezembro afirma que o saldo VAI continuar aquele, quando na verdade ninguém lançou
    // nada ainda. A linha para onde o dado para.
    const acumVals = mesesDoAno.map(mk => futuro(mk) ? null : funcs.reduce((s, f) => {
        const sit = cicloBhFunc(f, banco, dados.bhFechamentos, `${mk}-28`, dados.bhQuitacoes, resCargoDoFunc(f));
        if (bhSemCiclo(sit) || sit.fechado) return s;
        return s + sit.meses.filter(x => x.mes <= mk).reduce((a, b) => a + b.saldoMin, 0);
    }, 0));

    // Totais do ano — usados na tabela e nos KPIs. A taxa do ano é a razão dos TOTAIS, não
    // a média das taxas mensais: senão um mês com 2h de extra pesaria igual a um com 200h.
    const extraAnoT = soma(extraVals);
    const atrasoAnoT = soma(atrasoVals);

    const linhas = [
        { label: 'Horas extras geradas', fmt: 'hhmm', vals: extraVals },
        { label: 'Atrasos e faltas de horário', fmt: 'hhmm', vals: atrasoVals },
        { label: 'Saldo líquido do mês', fmt: 'hhmm', vals: saldoVals },
        // Acumulado não soma no ano (é um estoque, não um fluxo). O total é o saldo do
        // último mês COM DADO — 'last' pegaria dezembro, que num ano em curso é zero e
        // anunciaria passivo zerado justamente quando ele existe.
        { label: 'Saldo acumulado (fim do mês)', fmt: 'hhmm', vals: acumVals, total: 'last-real' },
        // Taxa não soma; e o total do ano não é a média das taxas mensais (isso daria peso
        // igual a um mês de 2h e a um de 200h) — é a razão dos totais. Daí o totalValor.
        { label: 'Taxa de compensação', fmt: 'pct', vals: taxaVals, totalValor: extraAnoT > 0 ? atrasoAnoT / extraAnoT * 100 : 0 }
    ];

    const titulo = `Banco de horas (mensal) para ${ano}`;

    if (!resGrafico()) {
        cont.innerHTML = tabelaMensal(titulo, linhas) + bhTabelaCiclos(funcs, banco, dados.bhFechamentos, fin, dados.bhQuitacoes);
        return;
    }

    // ---- Situação atual por funcionário (base do mapa e do ranking) ----
    const sits = funcs
        .map(f => ({ f, sit: cicloBhFunc(f, banco, dados.bhFechamentos, null, dados.bhQuitacoes, resCargoDoFunc(f)) }))
        .filter(x => !bhSemCiclo(x.sit));

    if (!_bhStatusVis.set) _bhStatusVis.set = new Set(BH_STATUS_FILTRO.map(s => s.key));
    const visiveis = () => sits.filter(x => _bhStatusVis.set.has(x.sit.status));

    const passivoTotal = sits
        .filter(x => !x.sit.fechado && x.sit.acumuladoMin > 0)
        .reduce((s, x) => s + passivoBh(x.sit.acumuladoMin, resSalarioDoFunc(x.f), jornadaDe(x.f)), 0);
    const extraAno = extraAnoT, atrasoAno = atrasoAnoT;
    const taxaAno = extraAno > 0 ? atrasoAno / extraAno * 100 : 0;
    const saldoAberto = sits.filter(x => !x.sit.fechado).reduce((s, x) => s + x.sit.acumuladoMin, 0);
    const vencendo = sits.filter(x => x.sit.status === 'critico' || x.sit.status === 'vencido').length;

    // KPIs: cada um responde uma pergunta que as barras não respondem sozinhas.
    const kpis = [
        { lbl: 'Saldo em aberto', val: fmtHHMM(saldoAberto), sub: `${sits.filter(x => !x.sit.fechado).length} ciclo(s) sem liquidar`, tom: saldoAberto > 0 ? 'alerta' : 'ok', ico: 'clock' },
        ...(fin ? [{ lbl: 'Passivo estimado', val: fmtBRL(passivoTotal), sub: `com adicional de ${bhParams.adicionalPct}%`, tom: 'custo', ico: 'money' }] : []),
        { lbl: 'Ciclos exigindo ação', val: fmtNum(vencendo), sub: `vencidos ou fechando em ≤${bhParams.alertaDias} dias`, tom: vencendo ? 'alerta' : 'ok', ico: 'alert' },
        { lbl: 'Taxa de compensação', val: fmtPct(taxaAno), sub: `${fmtHHMM(atrasoAno)} compensados de ${fmtHHMM(extraAno)}`, tom: taxaAno >= 70 ? 'ok' : 'custo', ico: 'refresh' }
    ];

    cont.innerHTML = `
        <div class="bh-kpi-row">
            ${kpis.map(k => `
                <div class="bh-kpi">
                    <span class="bh-kpi-ico tom-${k.tom}">${icon(k.ico)}</span>
                    <div class="bh-kpi-txt">
                        <span class="bh-kpi-lbl">${k.lbl}</span>
                        <span class="bh-kpi-val">${k.val}</span>
                        <span class="bh-kpi-sub">${escapeHtml(k.sub)}</span>
                    </div>
                </div>`).join('')}
        </div>

        <div class="chart-duo">
            ${chartCard({
                id: 'bh_fluxo', titulo: 'Extra × Atraso por mês',
                sub: 'Barras: horas geradas e compensadas · Linha: saldo acumulado em aberto',
                total: fmtHHMM(soma(saldoVals)),
                media: `saldo médio ${fmtHHMM(soma(saldoVals) / Math.max(1, saldoVals.filter(v => v != null).length))}/mês`,
                info: RES_EXPLICACOES['Saldo acumulado (fim do mês)']
            })}
            ${chartCard({
                id: 'bh_rank', titulo: 'Ranking por saldo em aberto',
                sub: 'Ciclos não liquidados — maior para o menor',
                total: fmtHHMM(saldoAberto),
                info: RES_EXPLICACOES['Ranking por saldo em aberto'],
                rodape: chartPagerHtml('bhRankPager')
            })}
        </div>

        <div class="chart-grid chart-grid-full">
            ${chartCard({
                id: 'bh_taxa', titulo: 'Taxa de compensação',
                sub: 'Quanto da hora extra virou folga, e não pagamento',
                total: fmtPct(taxaAno),
                info: RES_EXPLICACOES['Taxa de compensação']
            })}
        </div>

        <div class="res-grupo-tit">Mapa de ciclos</div>
        <div class="bh-mapa-card">
            <div class="bh-mapa-head">
                <div>
                    <div class="chart-card-title">Ciclos individuais de compensação
                        <button class="chart-info-btn" data-bh-info title="O que é este gráfico?">${icon('info')}</button>
                    </div>
                    <div class="chart-card-sub">Cada funcionário tem seu ciclo, ancorado no primeiro mês lançado para ele — por isso as barras não se alinham ao ano civil.</div>
                </div>
                <button class="chart-legenda-btn" id="bhMapaFiltro">${icon('filter')}<span>Situação</span></button>
            </div>
            <div id="bhMapaBody"></div>
        </div>`;

    // ---- Gráfico 1: barras Extra/Atraso + linha do acumulado no eixo secundário ----
    // Eixo secundário porque o acumulado é um ESTOQUE e as barras são FLUXO: na mesma
    // escala, um saldo de 200h achataria as barras mensais de 8h até virarem risco.
    mkChart('resultados', 'bh_fluxo', {
        type: 'bar',
        data: {
            labels: MESES,
            datasets: [
                dvBarra('Extra', extraVals, dvCor(0)),
                dvBarra('Atraso', atrasoVals, dvCor(3)),
                {
                    type: 'line', label: 'Acumulado em aberto', data: acumVals,
                    borderColor: '#dc2626', borderWidth: 2, pointRadius: 2.5, tension: .3,
                    yAxisID: 'y2', order: 0
                }
            ]
        },
        options: dvOpts({
            fmt: 'hhmm', legenda: true,
            extras: {
                scales: {
                    y2: {
                        position: 'right', beginAtZero: true, grid: { display: false },
                        border: { display: false },
                        ticks: { color: '#dc2626', font: { size: 10 }, callback: v => fmtHorasDec(v) }
                    }
                }
            }
        })
    });

    // Taxa: barras só nos meses que tiveram hora extra (null pula o ponto). A tracejada é a
    // taxa do ANO — razão dos totais, não média das taxas mensais: um mês com 2h de extra
    // não pode pesar igual a um com 200h.
    mkChart('resultados', 'bh_taxa', {
        type: 'bar',
        data: {
            labels: MESES,
            datasets: [dvBarra('Taxa de compensação', taxaVals, dvCor(1)), dvLinhaMedia(taxaAno)]
        },
        options: dvOpts({
            fmt: 'pct',
            tooltipExtra: {
                callbacks: {
                    label: ctx => ctx.parsed.y == null ? 'Sem hora extra no mês'
                        : `${ctx.dataset.label}: ${fmtPct(ctx.parsed.y)} (${fmtHHMM(atrasoVals[ctx.dataIndex])} de ${fmtHHMM(extraVals[ctx.dataIndex])})`
                }
            }
        })
    });

    // ---- Ranking por saldo ----
    // Não reusa pintarRankingHorizontal: ela filtra `val > 0` e mostra % do total. Aqui o
    // saldo NEGATIVO é informação real (o funcionário deve horas) e some naquele filtro; e
    // "% do total" não significa nada numa soma que mistura sinais opostos. Barras divergem
    // de um zero central, com a cor dizendo a direção — igual ao resto da aba.
    const desenhaRank = () => {
        const todos = visiveis()
            .filter(x => !x.sit.fechado && x.sit.acumuladoMin !== 0)
            .sort((a, b) => b.sit.acumuladoMin - a.sit.acumuladoMin);
        const totalPaginas = Math.max(1, Math.ceil(todos.length / BH_RANK_PAGE_SIZE));
        _bhRankPag.page = Math.min(_bhRankPag.page, totalPaginas - 1);
        const vis = todos.slice(_bhRankPag.page * BH_RANK_PAGE_SIZE, (_bhRankPag.page + 1) * BH_RANK_PAGE_SIZE);
        chartDestroyOne('resultados', 'bh_rank');
        mkChart('resultados', 'bh_rank', {
            type: 'bar',
            data: {
                labels: vis.map(x => x.f.nome),
                datasets: [{
                    data: vis.map(x => x.sit.acumuladoMin),
                    backgroundColor: vis.map(x => (x.sit.acumuladoMin > 0 ? '#5b5bd6' : '#d97706') + 'cc'),
                    hoverBackgroundColor: vis.map(x => x.sit.acumuladoMin > 0 ? '#5b5bd6' : '#d97706'),
                    borderRadius: 5, maxBarThickness: 26
                }]
            },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        padding: 10, backgroundColor: '#23233f', cornerRadius: 8,
                        callbacks: {
                            label: ctx => {
                                const x = vis[ctx.dataIndex].sit;
                                return `${fmtHHMM(x.acumuladoMin)} — ${x.label}`;
                            }
                        }
                    }
                },
                scales: {
                    x: { grid: { color: DV.grid }, border: { display: false }, ticks: { color: DV.ink, font: { size: 10 }, callback: v => fmtHorasDec(v) } },
                    y: { grid: { display: false }, ticks: { color: DV.ink, font: { size: 11 }, autoSkip: false } }
                }
            }
        });
        bindChartPager('bhRankPager', todos.length, _bhRankPag.page, BH_RANK_PAGE_SIZE, p => { _bhRankPag.page = p; desenhaRank(); });
    };

    // ---- Mapa de ciclos ----
    const desenhaMapa = () => {
        const vis = visiveis().sort((a, b) => (BH_ORDEM[a.sit.status] - BH_ORDEM[b.sit.status]) || ((a.sit.dias ?? 0) - (b.sit.dias ?? 0)));
        const body = document.getElementById('bhMapaBody');
        if (!vis.length) {
            body.innerHTML = `<div class="table-empty">${icon('filter')}<span>Nenhum ciclo na seleção atual.</span></div>`;
            return;
        }

        // Janela do mapa: do ciclo que começou mais cedo ao que fecha mais tarde. É o
        // recorte que faz os ciclos individuais caberem lado a lado — e é justamente o que
        // uma grade Jan–Dez não consegue mostrar.
        const iniMin = vis.reduce((m, x) => x.sit.inicio < m ? x.sit.inicio : m, vis[0].sit.inicio);
        const fimMax = vis.reduce((m, x) => x.sit.fimMes > m ? x.sit.fimMes : m, vis[0].sit.fimMes);
        const totalMeses = mesDiff(iniMin, fimMax) + 1;
        const col = mk => (mesDiff(iniMin, mk) / totalMeses) * 100;
        const larg = (a, b) => ((mesDiff(a, b) + 1) / totalMeses) * 100;
        const hojeMk = mesHoje();
        const hojeDentro = hojeMk >= iniMin && hojeMk <= fimMax;

        body.innerHTML = `
            <div class="bh-mapa">
                <div class="bh-mapa-eixo">
                    ${Array.from({ length: totalMeses }, (_, i) => {
                        const mk = mesAdd(iniMin, i);
                        // Janela curta (o normal aqui: ciclo de poucos meses por pessoa): rotula
                        // todo mês, senão o mapa mostrava só janeiro/julho — às vezes nenhum dos
                        // dois caía dentro do intervalo. Só em janelas longas (>14 meses) volta a
                        // marcar de 6 em 6 (jan/jul), senão os rótulos verticais viram ruído.
                        const [, m] = mk.split('-');
                        const marca = totalMeses <= 14 || m === '01' || m === '07';
                        return `<div class="bh-eixo-cel${marca ? ' is-marca' : ''}">${marca ? mesLabel(mk) : ''}</div>`;
                    }).join('')}
                </div>
                ${hojeDentro ? `<div class="bh-mapa-hoje" style="left:${col(hojeMk) + (100 / totalMeses / 2)}%" title="Hoje: ${mesLabel(hojeMk)}"></div>` : ''}
                ${vis.map(({ f, sit }) => {
                    const s = BH_STATUS[sit.status];
                    const passivo = passivoBh(sit.acumuladoMin, resSalarioDoFunc(f), jornadaDe(f));
                    const tip = `${f.nome} — ${sit.label}\nCiclo ${mesLabel(sit.inicio)} → ${mesLabel(sit.fimMes)} (fecha ${fmtDate(sit.fim)})\nSaldo ${fmtHHMM(sit.acumuladoMin)} (${fmtHHMM(sit.extraMin)} extra, ${fmtHHMM(sit.atrasoMin)} atraso)${fin && passivo > 0 ? `\nPassivo estimado ${fmtBRL(passivo)}` : ''}`;
                    return `
                    <div class="bh-mapa-linha" title="${escapeHtml(tip)}">
                        <div class="bh-mapa-nome">
                            <span class="prog-dot ${s.dot}"></span>
                            <span class="bh-mapa-nome-txt">${escapeHtml(f.nome)}</span>
                        </div>
                        <div class="bh-mapa-trilho">
                            <div class="bh-mapa-barra st-${sit.status}"
                                 style="left:${col(sit.inicio)}%;width:${larg(sit.inicio, sit.fimMes)}%">
                                <span class="bh-mapa-saldo">${fmtHHMM(sit.acumuladoMin)}</span>
                            </div>
                            <span class="bh-mapa-marco st-${sit.status}" style="left:${col(sit.fimMes) + (100 / totalMeses)}%" title="Fecha em ${fmtDate(sit.fim)}"></span>
                        </div>
                    </div>`;
                }).join('')}
            </div>
            <div class="bh-mapa-legenda">
                ${BH_STATUS_FILTRO.map(s => `<span class="bh-leg-item"><i class="bh-leg-cor st-${s.key}"></i>${s.label}</span>`).join('')}
                <span class="bh-leg-item"><i class="bh-leg-marco"></i>Fechamento do ciclo</span>
            </div>`;
    };

    desenhaRank();
    desenhaMapa();

    document.querySelector('[data-bh-info]').onclick = () =>
        openChartInfo('Mapa de ciclos', RES_EXPLICACOES['Mapa de ciclos']);

    const btnFiltro = document.getElementById('bhMapaFiltro');
    btnFiltro.onclick = () => openMultiPopover(btnFiltro, {
        items: BH_STATUS_FILTRO.map(s => ({ key: s.key, label: s.label, cor: BH_MAPA_COR[s.key] })),
        selected: _bhStatusVis.set,
        onChange: () => { _bhRankPag.page = 0; desenhaRank(); desenhaMapa(); },
        onReset: () => { _bhStatusVis.set = new Set(BH_STATUS_FILTRO.map(s => s.key)); _bhRankPag.page = 0; desenhaRank(); desenhaMapa(); }
    });
}

// Cores do mapa — espelham os tokens de status do CSS para o popover mostrar a mesma cor
// que a barra. Duplicar aqui é feio, mas ler var() do CSS em runtime é pior.
const BH_MAPA_COR = { vencido: '#dc2626', critico: '#d97706', atencao: '#d97706', em_dia: '#5b5bd6' };

// Salário para a estimativa de passivo. Resultados não carrega folhaState, então resolve
// pelo cargo do próprio dados — mesma precedência de salarioDoFunc em bancohoras.js.
// Mesmo ponto único da folha e do banco de horas: resolve `salarioBase`/`salario` (legado) e
// o salário mínimo dos cargos marcados como "usa mínimo".
const resCargoDoFunc = f => resState.dados.cargos.find(c => c.id === f?.cargoId) || null;
const resSalarioDoFunc = f =>
    salarioDe(f, resCargoDoFunc(f), resState.dados.params);

// Modo tabela: a série mensal já sai em tabelaMensal; os ciclos individuais precisam de
// tabela própria — eles não cabem no eixo Jan–Dez, que é o ponto da aba inteira.
function bhTabelaCiclos(funcs, banco, fechamentos, fin, quitacoes) {
    const sits = funcs
        .map(f => ({ f, sit: cicloBhFunc(f, banco, fechamentos, null, quitacoes, resCargoDoFunc(f)) }))
        .filter(x => !bhSemCiclo(x.sit))
        .sort((a, b) => (BH_ORDEM[a.sit.status] - BH_ORDEM[b.sit.status]) || ((a.sit.dias ?? 0) - (b.sit.dias ?? 0)));

    if (!sits.length) return '';

    return `
        <div class="table-wrap" style="margin-bottom:18px">
            <div class="table-toolbar"><strong>Ciclos individuais de compensação</strong>
                <span class="muted" style="font-size:12px;margin-left:8px">Cada ciclo começa no primeiro mês lançado para o funcionário — não no ano civil.</span>
            </div>
            <div class="table-scroll"><table class="table">
                <thead><tr>
                    <th>Funcionário</th><th>Situação</th><th>Ciclo</th><th>Fecha em</th>
                    <th class="num">Extra</th><th class="num">Atraso</th><th class="num">Saldo</th>
                    ${fin ? '<th class="num">Passivo est.</th>' : ''}
                </tr></thead>
                <tbody>${sits.map(({ f, sit }) => {
                    const passivo = passivoBh(sit.acumuladoMin, resSalarioDoFunc(f), jornadaDe(f));
                    return `<tr>
                        <td style="white-space:nowrap"><strong>${escapeHtml(f.nome)}</strong></td>
                        <td><span class="badge ${BH_STATUS[sit.status].cls}" title="${escapeHtml(sit.desc)}">${escapeHtml(sit.label)}</span></td>
                        <td class="text-2" style="white-space:nowrap">${mesLabel(sit.inicio)} → ${mesLabel(sit.fimMes)}</td>
                        <td class="text-2">${fmtDate(sit.fim)}</td>
                        <td class="num text-2">${fmtHHMM(sit.extraMin)}</td>
                        <td class="num text-2">${fmtHHMM(sit.atrasoMin)}</td>
                        <td class="num"><strong>${fmtHHMM(sit.acumuladoMin)}</strong></td>
                        ${fin ? `<td class="num text-2">${passivo > 0 ? fmtBRL(passivo) : '—'}</td>` : ''}
                    </tr>`;
                }).join('')}</tbody>
            </table></div>
        </div>`;
}

