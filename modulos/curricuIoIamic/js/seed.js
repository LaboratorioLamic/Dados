// ===== Dados de exemplo: gerar/limpar (validação de todos os KPIs) =====

const SEED_PATH = 'rh_seed';

const SEED_NOMES = [
    'Ana Carolina Souza', 'Bruno Henrique Lima', 'Camila Ferreira Alves', 'Daniel Oliveira Santos',
    'Eduarda Martins Rocha', 'Felipe Augusto Costa', 'Gabriela Nunes Pereira', 'Henrique Barbosa Silva',
    'Isabela Cristina Ramos', 'João Pedro Carvalho', 'Karina Lopes Mendes', 'Lucas Gabriel Teixeira',
    'Mariana Duarte Castro', 'Nicolas Andrade Pinto', 'Olívia Fernandes Dias', 'Paulo Ricardo Moreira',
    'Rafaela Cardoso Gomes', 'Samuel Vieira Araújo', 'Tatiane Ribeiro Melo', 'Vinícius Correia Freitas'
];

const _rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const _pick = arr => arr[_rnd(0, arr.length - 1)];
const _dataIso = (ano, mes, dia) => `${ano}-${String(mes + 1).padStart(2, '0')}-${String(Math.min(dia, 28)).padStart(2, '0')}`;

async function gerarDadosExemplo() {
    const anoAtual = new Date().getFullYear();
    const seed = { cargos: [], unidades: [], beneficios: [], funcionarios: [], ausencias: [], parciais: [], liberacoes: [], asos: [], demissoes: [], treinamentos: [], promocoes: [], folhaMeses: [], bancoMeses: [], bhFechamentos: [] };

    // Parâmetros (só preenche se vazios)
    const params = (await DB.getObj(PATHS.parametros)) || {};
    await DB.set(PATHS.parametros, {
        fgtsPct: params.fgtsPct ?? 8,
        inssFaixas: params.inssFaixas && params.inssFaixas.length ? params.inssFaixas : INSS_FAIXAS_PADRAO,
        diasExperiencia: params.diasExperiencia ?? 90,
        salarioMinimo: params.salarioMinimo || 1518,
        insalubridadeBase: params.insalubridadeBase || 'salario',
        asoAlertaDias: params.asoAlertaDias ?? ASO_PARAMS_PADRAO.alertaDias,
        bhCicloMeses: params.bhCicloMeses ?? BH_PARAMS_PADRAO.cicloMeses,
        bhAlertaDias: params.bhAlertaDias ?? BH_PARAMS_PADRAO.alertaDias,
        bhTetoMensalMin: params.bhTetoMensalMin ?? BH_PARAMS_PADRAO.tetoMensalMin,
        bhAdicionalPct: params.bhAdicionalPct ?? BH_PARAMS_PADRAO.adicionalPct
    });

    // Cargos — asoPeriodicidadeMeses reflete risco ocupacional (PCMSO), não o grau de
    // insalubridade: o Coordenador tem insalubridade 0 e ainda assim exame anual.
    const cargosDef = [
        { nome: 'Auxiliar de Produção', tipo: 'Operacional', salario: 1900, insalubridade: 20, periculosidade: false, asoPeriodicidadeMeses: 6 },
        { nome: 'Técnico de Laboratório', tipo: 'Operacional', salario: 2800, insalubridade: 40, periculosidade: true, asoPeriodicidadeMeses: 6 },
        { nome: 'Analista Administrativo', tipo: 'Administrativo', salario: 3200, insalubridade: 0, periculosidade: false, asoPeriodicidadeMeses: 12 },
        { nome: 'Coordenador de Equipe', tipo: 'Gestão', salario: 5600, insalubridade: 0, periculosidade: false, asoPeriodicidadeMeses: 12 },
        { nome: 'Estagiário', tipo: 'Estágio', salario: 1100, insalubridade: 0, periculosidade: false, asoPeriodicidadeMeses: 12 },
        { nome: 'Diretor de Operações', tipo: 'Diretoria', salario: 12000, insalubridade: 0, periculosidade: false, asoPeriodicidadeMeses: 24 },
        // Aprendiz não tem valor fixo: o salário é o mínimo-HORA × jornada da ficha (art. 428
        // §2º), por isso `usaSalarioMinimo` e nenhum `salario` semeado. Grava `perfil` explícito
        // — os demais cargos de exemplo ainda dependem da migração por `tipo` em perfilCargo.
        { nome: 'Jovem Aprendiz', tipo: 'Aprendizagem', perfil: 'aprendiz', usaSalarioMinimo: true, salario: 0, insalubridade: 0, periculosidade: false, asoPeriodicidadeMeses: 12 }
    ];
    const cargoIds = [];
    for (const c of cargosDef) { const id = await DB.save(PATHS.cargos, null, c); cargoIds.push(id); seed.cargos.push(id); }

    // Unidades — quadro recomendado por cargo (impacta o alerta do Dashboard)
    const unidadesDef = [
        { nome: 'Matriz — Centro', endereco: 'Av. Principal, 1000 — Centro', cnpj: '12.345.678/0001-90',
            recomendados: [{ cargoId: cargoIds[0], qtd: 5 }, { cargoId: cargoIds[2], qtd: 3 }, { cargoId: cargoIds[3], qtd: 2 }] },
        { nome: 'Filial — Distrito Industrial', endereco: 'Rua das Indústrias, 250', cnpj: '12.345.678/0002-71',
            recomendados: [{ cargoId: cargoIds[0], qtd: 5 }, { cargoId: cargoIds[1], qtd: 3 }] }
    ];
    const unidadeIds = [];
    for (const u of unidadesDef) { const id = await DB.save(PATHS.unidades, null, u); unidadeIds.push(id); seed.unidades.push(id); }

    // Benefícios
    const benefDef = [
        { nome: 'Plano de Saúde Empresarial', tipo: 'Plano de saúde', custoTitular: 320, custoDependente: 180, descontoPct: 20 },
        { nome: 'Vale Alimentação', tipo: 'Vale alimentação', custoTitular: 440, custoDependente: 0, descontoPct: 0 },
        { nome: 'Seguro de Vida em Grupo', tipo: 'Seguro de vida', custoTitular: 45, custoDependente: 0, descontoPct: 0 }
    ];
    const benefIds = [];
    for (const b of benefDef) { const id = await DB.save(PATHS.beneficios, null, b); benefIds.push(id); seed.beneficios.push(id); }

    // Funcionários (20): admissões espalhadas nos últimos 3 anos
    const funcs = [];
    for (let i = 0; i < SEED_NOMES.length; i++) {
        const nome = SEED_NOMES[i];
        const cargoIdx = i < 8 ? 0 : i < 11 ? 1 : i < 14 ? 2 : i < 16 ? 3 : i < 18 ? 4 : i < 19 ? 6 : 5;
        const aprendizSeed = cargoIdx === 6;
        // Admissão sempre no passado: no ano/mês corrente o sorteio precisa parar em hoje,
        // senão gera admitidos "no futuro" e contamina tempo de casa, turnover,
        // permanência e aprovação de experiência.
        const admAno = anoAtual - _pick([0, 0, 1, 1, 2, 3]);
        const mesMax = admAno === anoAtual ? new Date().getMonth() : 11;
        const admMes = _rnd(0, mesMax);
        const diaMax = (admAno === anoAtual && admMes === new Date().getMonth()) ? new Date().getDate() : 28;
        const admissao = _dataIso(admAno, admMes, _rnd(1, diaMax));
        const beneficios = [];
        if (i % 2 === 0) beneficios.push({ beneficioId: benefIds[0], dependentes: i % 4 === 0 ? ['Dependente A', 'Dependente B'].slice(0, _rnd(1, 2)) : [] });
        if (i % 3 !== 0) beneficios.push({ beneficioId: benefIds[1], dependentes: [] });
        if (i % 5 === 0) beneficios.push({ beneficioId: benefIds[2], dependentes: [] });
        const f = {
            nome,
            sexo: i % 2 === 0 ? 'Feminino' : 'Masculino',
            // Aprendiz tem faixa etária própria (art. 428: 14 a 24) — o sorteio geral começa em
            // 20 anos e geraria um "aprendiz" de 50 que a ficha recusaria ao ser reeditado.
            nascimento: aprendizSeed
                ? _dataIso(anoAtual - _rnd(APRENDIZ_IDADE_MIN + 2, APRENDIZ_IDADE_MAX - 3), _rnd(0, 11), _rnd(1, 28))
                : _dataIso(anoAtual - _rnd(20, 58), _rnd(0, 11), _rnd(1, 28)),
            escolaridade: aprendizSeed ? 'Médio incompleto' : _pick(ESCOLARIDADES.slice(2)),
            cargoId: cargoIds[cargoIdx],
            unidadeId: unidadeIds[i % 2],
            telefone: `(11) 9${_rnd(1000, 9999)}-${_rnd(1000, 9999)}`,
            email: nome.toLowerCase().split(' ')[0] + '.' + nome.toLowerCase().split(' ').pop() + '@empresa.com',
            vestimenta: _pick(VESTIMENTAS),
            admissao,
            demissao: null,
            beneficios,
            // Contrato de aprendizagem: jornada de 6h/dia e termo final dentro dos 2 anos
            // (arts. 432 e 428 §3º). Sem a jornada gravada, salarioBaseCargo cairia nas 220h
            // padrão e pagaria o mínimo cheio a quem trabalha 180h.
            ...(aprendizSeed ? {
                jornadaMensal: APRENDIZ_JORNADA_MES_MAX,
                contratoFim: addMeses(admissao, APRENDIZ_CONTRATO_MESES_MAX)
            } : {})
        };
        const id = await DB.save(PATHS.funcionarios, null, f);
        f.id = id;
        funcs.push(f);
        seed.funcionarios.push(id);
    }

    // Demissões (5, meses variados do ano atual, funcionários admitidos antes)
    const motivosSeed = ['Pedido de demissão', 'Dispensa sem justa causa', 'Término de contrato de experiência', 'Pedido de demissão', 'Dispensa com justa causa'];
    const candidatos = funcs.filter(f => Number(f.admissao.slice(0, 4)) < anoAtual).slice(0, 5);
    for (let i = 0; i < candidatos.length; i++) {
        const f = candidatos[i];
        const data = _dataIso(anoAtual, _rnd(0, Math.max(0, new Date().getMonth() - 1)), _rnd(1, 28));
        const id = await DB.save(PATHS.demissoes, null, { funcionarioId: f.id, data, motivo: motivosSeed[i], obs: 'Registro de exemplo' });
        await DB.save(PATHS.funcionarios, f.id, { demissao: data });
        f.demissao = data;
        seed.demissoes.push(id);
    }

    const ativos = funcs.filter(f => !f.demissao);

    // Ausências (10)
    for (let i = 0; i < 10; i++) {
        const f = _pick(ativos);
        const mes = _rnd(0, new Date().getMonth());
        const dia = _rnd(1, 20);
        const dur = _pick([1, 2, 3, 5, 10, 30]);
        const inicio = _dataIso(anoAtual, mes, dia);
        const ret = new Date(inicio); ret.setDate(ret.getDate() + dur);
        const id = await DB.save(PATHS.ausencias, null, {
            funcionarioId: f.id,
            tipo: dur >= 10 ? _pick(['Férias', 'Licença médica']) : _pick(TIPOS_AUSENCIA),
            inicio, retorno: ret.toISOString().slice(0, 10), dias: dur, obs: ''
        });
        seed.ausencias.push(id);
    }

    // Ausências parciais (8) — sempre `Abonado`, para não escrever parcialMin no banco de
    // horas semeado: a grade de exemplo já traz extra e atraso próprios, e um débito vindo
    // daqui faria os dois números do saldo brigarem sem que ninguém tenha lançado nada.
    const AP_JANELAS = [['08:00', '10:00'], ['12:00', '14:00'], ['13:30', '15:00'], ['16:00', '17:30']];
    for (let i = 0; i < 8; i++) {
        const f = _pick(ativos);
        const [saida, retorno] = _pick(AP_JANELAS);
        const dataAp = _dataIso(anoAtual, _rnd(0, new Date().getMonth()), _rnd(1, 28));
        const id = await DB.save(PATHS.ausenciasParciais, null, {
            funcionarioId: f.id,
            data: dataAp,
            mesRef: mesDe(dataAp),
            horaSaida: saida, horaRetorno: retorno,
            naoRetornou: false,
            minutos: parseHHMM(retorno) - parseHHMM(saida),
            motivo: _pick(MOTIVOS_AUS_PARCIAL),
            tratamento: TRAT_ABONADO,
            obs: ''
        });
        seed.parciais.push(id);
    }

    // Uma liberação coletiva de exemplo, atingindo a primeira unidade. Serve para a sub-aba
    // nascer com o caso que ela existe para resolver: saldo negativo que NÃO pode ser
    // descontado. Aprendiz fica de fora (art. 432), igual à publicação real.
    {
        const uniAlvo = unidadeIds[0];
        const cargoDe = f => cargosDef[cargoIds.indexOf(f.cargoId)] || null;
        const alvo = ativos.filter(f => f.unidadeId === uniAlvo && !ehAprendiz(cargoDe(f)));
        if (alvo.length) {
            const dataLib = _dataIso(anoAtual, Math.max(0, new Date().getMonth() - 1), 14);
            const id = await DB.save(PATHS.liberacoes, null, {
                data: dataLib,
                mesRef: mesDe(dataLib),
                motivo: 'Acordo coletivo',
                tipo: 'Dispensa antecipada',
                escopo: 'unidade',
                unidadeId: uniAlvo,
                minutosPadrao: 180,
                itens: alvo.map(f => ({ funcionarioId: f.id, minutos: 180 })),
                obs: 'Dispensa às 15h por acordo — horas a compensar quando a operação precisar.',
                anexos: []
            });
            seed.liberacoes.push(id);
            for (const f of alvo) {
                const mk = mesDe(dataLib);
                const linha = { ...((await DB.getObj(`${PATHS.bancoHoras}/${mk}/${f.id}`)) || { extraMin: 0, atrasoMin: 0 }), liberacaoMin: 180, lancadoEm: hoje() };
                await DB.save(`${PATHS.bancoHoras}/${mk}`, f.id, linha);
            }
            if (!seed.bancoMeses.includes(mesDe(dataLib))) seed.bancoMeses.push(mesDe(dataLib));
        }
    }

    // ASOs — coerentes com a admissão e com a periodicidade do cargo de cada um.
    // Datas derivadas (não sorteadas soltas): o exame admissional sai na admissão e os
    // periódicos seguem de N em N meses até hoje. Assim a aba de ASO nasce com um retrato
    // realista — a maioria em dia, alguns vencendo, alguns vencidos — em vez de ruído.
    //
    // A distribuição é proposital, para exercitar os 4 status da fila:
    //   i % 7 === 0 → nunca fez exame            (status "sem ASO")
    //   i % 5 === 0 → último periódico atrasado  (status "vencido")
    //   demais      → em dia (o último cai dentro da janela vigente)
    const MEDICOS = [
        { nome: 'Dra. Helena Prado', crm: '54321/SP' },
        { nome: 'Dr. Marcos Ribeiro', crm: '18902/SP' },
        { nome: 'Dra. Patrícia Nunes', crm: '77310/SP' }
    ];
    for (let i = 0; i < funcs.length; i++) {
        const f = funcs[i];
        const cargo = cargosDef[cargoIds.indexOf(f.cargoId)];
        const meses = cargo.asoPeriodicidadeMeses || 12;
        const nunca = i % 7 === 0;
        const atrasado = !nunca && i % 5 === 0;
        if (nunca) continue;                                  // sem nenhum ASO: pendência real

        const salvarAso = async (tipo, data, resultado, restricoes) => {
            const med = MEDICOS[i % MEDICOS.length];
            const id = await DB.save(PATHS.asos, null, {
                funcionarioId: f.id, tipo, data, resultado,
                restricoes: restricoes || '',
                medico: med.nome, crm: med.crm,
                obs: 'Registro de exemplo', anexos: []
            });
            seed.asos.push(id);
        };

        // Admissional — na data de admissão, sempre
        await salvarAso('Admissional', f.admissao, 'Apto');

        // Periódicos de N em N meses. Para o "atrasado", para um ciclo antes do devido.
        const limite = f.demissao || hoje();
        let data = addMeses(f.admissao, meses);
        let ultimo = null;
        while (data <= limite) { ultimo = data; data = addMeses(data, meses); }
        if (ultimo) {
            const alvo = atrasado ? addMeses(ultimo, -meses) : ultimo;   // recua 1 ciclo = vencido
            if (alvo > f.admissao) {
                // 1 em cada 4 sai com restrição — exercita o campo condicional do form
                const comRestricao = i % 4 === 0;
                await salvarAso('Periódico', alvo,
                    comRestricao ? 'Apto com restrições' : 'Apto',
                    comRestricao ? 'Evitar esforço físico intenso; reavaliar em 6 meses.' : '');
            }
        }

        // Demissional — quem foi desligado precisa dele (até 10 dias do desligamento)
        if (f.demissao) await salvarAso('Demissional', f.demissao, 'Apto');
    }

    // Treinamentos (4)
    const treinosDef = [
        { nome: 'Integração de Novos Colaboradores', tipo: 'Integração', cargaHoraria: 8, custo: 1200, parcelas: 1, responsavel: 'RH Interno' },
        { nome: 'NR-35 Trabalho em Altura', tipo: 'Segurança', cargaHoraria: 16, custo: 3600, parcelas: 3, responsavel: 'SafeWork Treinamentos' },
        { nome: 'Comunicação e Feedback', tipo: 'Comportamental', cargaHoraria: 6, custo: 1800, parcelas: 2, responsavel: 'Consultoria Evoluir' },
        { nome: 'Excel Avançado', tipo: 'Técnico', cargaHoraria: 20, custo: 2400, parcelas: 1, responsavel: 'TechClass' }
    ];
    for (let i = 0; i < treinosDef.length; i++) {
        const mes = _rnd(0, Math.max(0, new Date().getMonth()));
        const inicio = _dataIso(anoAtual, mes, _rnd(1, 20));
        const fim = new Date(inicio); fim.setDate(fim.getDate() + _rnd(1, 5));
        const parts = [...new Set(Array.from({ length: _rnd(4, 9) }, () => _pick(ativos).id))];
        const id = await DB.save(PATHS.treinamentos, null, {
            ...treinosDef[i], inicio, termino: fim.toISOString().slice(0, 10),
            dataPagamento: inicio, participantes: parts
        });
        seed.treinamentos.push(id);
    }

    // Promoções (3)
    for (let i = 0; i < 3; i++) {
        const f = ativos[i * 3];
        const cargoAnt = cargosDef[cargoIds.indexOf(f.cargoId)];
        const salAntigo = f.salario ?? cargoAnt.salario;
        const salNovo = Number((salAntigo * (1 + _rnd(8, 18) / 100)).toFixed(2));
        const data = _dataIso(anoAtual, _rnd(1, Math.max(1, new Date().getMonth())), _rnd(1, 28));
        const id = await DB.save(PATHS.promocoes, null, {
            funcionarioId: f.id, data,
            cargoAnteriorId: f.cargoId, cargoAnteriorNome: cargoAnt.nome,
            cargoNovoId: f.cargoId, cargoNovoNome: cargoAnt.nome,
            salarioAntigo: salAntigo, salarioNovo: salNovo,
            pctAumento: Number(((salNovo - salAntigo) / salAntigo * 100).toFixed(2))
        });
        await DB.save(PATHS.funcionarios, f.id, { salario: salNovo });
        f.salario = salNovo;
        seed.promocoes.push(id);
    }

    // Folha: 12 meses do ano atual (até o mês corrente)
    const paramsNow = (await DB.getObj(PATHS.parametros)) || {};
    const benefCatalogo = benefDef.map((b, i) => ({ ...b, id: benefIds[i] }));
    const mesLimite = new Date().getMonth();
    for (let m = 0; m <= mesLimite; m++) {
        const key = mesKey(anoAtual, m);
        const iniMes = `${key}-01`, fimMes = `${key}-31`;
        const obj = {};
        funcs.filter(f => f.admissao <= fimMes && (!f.demissao || f.demissao >= iniMes)).forEach(f => {
            const cargo = cargosDef[cargoIds.indexOf(f.cargoId)];
            // Ramifica por PERFIL, não por `tipo`: é o perfil que decide as verbas desde que
            // ele existe, e o seed continuava decidindo pelo nome do tipo — um cargo de
            // aprendizagem cairia no ramo genérico com o FGTS errado.
            const perfil = perfilCargo(cargo);
            // `salarioBaseCargo` resolve o mínimo (e o mínimo-hora do aprendiz, que depende da
            // jornada da ficha) — o seed não pode reimplementar essa conta.
            const sal = f.salario ?? salarioBaseCargo(cargo, paramsNow, f);
            const linha = {};
            FOLHA_COLS.forEach(([k]) => linha[k] = 0);
            linha[FOLHA_DESC] = 0;
            linha[FOLHA_INSS] = 0;
            if (perfil === 'estagiario') linha.bolsa = sal;
            else if (perfil === 'diretor') linha.prolabore = sal;
            else {
                linha.salario = sal;
                const base = (paramsNow.insalubridadeBase || 'salario') === 'minimo' ? (paramsNow.salarioMinimo || 0) : sal;
                linha.insalubridade = Number(((cargo.insalubridade || 0) / 100 * base).toFixed(2));
                linha.periculosidade = cargo.periculosidade ? Number((sal * PERICULOSIDADE_PCT / 100).toFixed(2)) : 0;
                const baseEncSeed = sal + linha.insalubridade + linha.periculosidade;
                linha.encargos = Number((baseEncSeed * fgtsPctDe(cargo, paramsNow) / 100).toFixed(2));
                linha[FOLHA_INSS] = calculoInss(baseEncSeed, paramsNow.inssFaixas);
            }
            // Hora extra não é semeada na folha: a coluna manual foi aposentada pelo banco de
            // horas. A HE dos dados de exemplo vem dos fechamentos/quitações e do Extra
            // Banco, e chega à folha pela coluna derivada.
            let benTotal = 0, benDesc = 0;
            (f.beneficios || []).forEach(fb => {
                const b = benefCatalogo.find(x => x.id === fb.beneficioId);
                if (!b) return;
                const custo = b.custoTitular + (fb.dependentes || []).length * b.custoDependente;
                benTotal += custo;
                benDesc += custo * (b.descontoPct || 0) / 100;
            });
            linha.beneficios = Number(benTotal.toFixed(2));
            linha[FOLHA_DESC] = Number(benDesc.toFixed(2));
            obj[f.id] = linha;
        });
        await DB.set(`${PATHS.folha}/${key}`, obj);
        seed.folhaMeses.push(key);
    }

    // ---- Banco de horas ----
    // Nem todo mundo tem banco: ele nasce de um acordo de compensação, não do contrato.
    // Um terço da equipe basta para exercitar a aba sem fingir que é universal.
    //
    // Os cenários são escolhidos, não sorteados: sem um ciclo vencido e um saldo negativo
    // no seed, quem abre a tela pela primeira vez vê tudo verde e conclui que a aba não faz
    // nada. Os casos que importam são justamente os incômodos.
    const bhCiclo = BH_PARAMS_PADRAO.cicloMeses;
    // Quem pode ter banco: ATIVO (a lista pós-demissões, não `funcs` — as demissões acima
    // consomem os primeiros da lista, e cair num demitido faz cicloBhFunc devolver null e o
    // cenário sumir sem aviso) e admitido há tempo suficiente para um ciclo caber atrás.
    //
    // O filtro de admissão é uma PREFERÊNCIA, não um requisito: as datas de admissão são
    // sorteadas, e em algumas execuções sobravam só 2 candidatos "antigos" — aí os índices
    // 2 e 3 do plano não existiam e os cenários prometidos sumiam. Completa-se com os demais
    // ativos, em vez de prometer o que a lista não comporta.
    const _antigo = f => f.admissao <= _dataIso(anoAtual - 1, 0, 1);
    const bhCandidatos = [...ativos.filter(_antigo), ...ativos.filter(f => !_antigo(f))];
    const bhSorteio = bhCandidatos.slice(0, Math.max(4, Math.floor(ativos.length / 3)));

    // Os cenários são atribuídos, não sorteados, e cada um é construído para produzir
    // exatamente a situação que promete — um seed onde "vencido" e "devedor" não aparecem
    // abre a tela toda verde e faz a aba parecer inútil justamente para quem a vê pela
    // primeira vez.
    const BH_CENARIOS = ['vencido', 'fechado', 'devedor'];
    const bhPlano = bhSorteio.map((f, i) => ({ f, cenario: BH_CENARIOS[i] || 'corrente' }));

    const bancoPorMes = {};   // {mesKey: {fid: linha}}
    const addLanc = (mk, fid, extraMin, atrasoMin) => {
        (bancoPorMes[mk] ||= {})[fid] = { extraMin, atrasoMin, obs: '', lancadoEm: `${mk}-28` };
    };

    for (const { f, cenario } of bhPlano) {
        // Âncora = primeiro mês lançado. Para "vencido"/"fechado" o ciclo inteiro precisa
        // estar ATRÁS de hoje (senão ainda está em curso e não venceu), daí o recuo maior.
        const recuo = cenario === 'vencido' || cenario === 'fechado' ? bhCiclo + _rnd(1, 3) : _rnd(1, bhCiclo - 1);
        const inicio = mesAdd(mesHoje(), -recuo);
        const meses = Math.min(recuo + 1, bhCiclo);

        for (let i = 0; i < meses; i++) {
            const mk = mesAdd(inicio, i);
            if (mk > mesHoje()) break;
            // Buraco no meio do ciclo é realista (mês sem hora extra nenhuma), mas o
            // PRIMEIRO mês nunca pode faltar: é ele que ancora o ciclo. Pular o primeiro
            // move a âncora e desmonta o cenário inteiro.
            if (i > 0 && Math.random() < .2) continue;

            // Devedor: o atraso tem que superar a extra em TODO mês, não "na média" —
            // senão um sorteio infeliz zera o saldo e o cenário some do seed.
            if (cenario === 'devedor') { const e = _rnd(0, 45); addLanc(mk, f.id, e, e + _rnd(30, 240)); }
            // "vencido" precisa de saldo POSITIVO garantido no fim: saldo zero encerra o
            // ciclo sem nada a cobrar e o motor pula para o ciclo seguinte, vazio.
            else if (cenario === 'vencido') { const a = _rnd(0, 45); addLanc(mk, f.id, a + _rnd(120, 420), a); }
            else addLanc(mk, f.id, _rnd(30, 300), _rnd(0, 180));
        }

        // O cenário "fechado" precisa de um fechamento registrado — senão vira só mais um
        // vencido, e o histórico de ciclos anteriores fica sempre vazio na sub-aba Ciclos.
        if (cenario === 'fechado') {
            const fimMes = mesAdd(inicio, bhCiclo - 1);
            const saldo = Object.entries(bancoPorMes)
                .filter(([mk, l]) => l[f.id] && mk >= inicio && mk <= fimMes)
                .reduce((s, [, l]) => s + (l[f.id].extraMin - l[f.id].atrasoMin), 0);
            const cargo = cargosDef[cargoIds.indexOf(f.cargoId)];
            const id = await DB.save(PATHS.bancoHorasFechamentos, null, {
                funcionarioId: f.id,
                cicloInicio: inicio,
                cicloFim: fimMes,
                saldoMin: saldo,
                destino: saldo > 0 ? 'Pago como hora extra' : 'Compensado',
                // Usa o motor em vez de repetir a fórmula: um 220 hardcoded aqui divergiria
                // silenciosamente no dia em que a jornada do funcionário deixar de ser a padrão.
                valor: saldo > 0 ? calculoHoraExtra(f, cargo, paramsNow, saldo, BH_PARAMS_PADRAO.adicionalPct).total : 0,
                data: addDias(fimDoMes(fimMes), _rnd(1, 8)),
                obs: 'Fechamento de exemplo — acordo registrado com o gestor.',
                anexos: []
            });
            seed.bhFechamentos.push(id);
        }
    }

    for (const [mk, linhas] of Object.entries(bancoPorMes)) {
        await DB.set(`${PATHS.bancoHoras}/${mk}`, linhas);
        seed.bancoMeses.push(mk);
    }

    await DB.set(SEED_PATH, seed);
    return seed;
}

async function limparDadosExemplo() {
    const seed = await DB.getObj(SEED_PATH);
    if (!seed) return false;
    const del = (path, ids) => Promise.all((ids || []).map(id => DB.remove(path, id)));
    await Promise.all([
        del(PATHS.ausencias, seed.ausencias),
        del(PATHS.ausenciasParciais, seed.parciais),
        del(PATHS.liberacoes, seed.liberacoes),
        del(PATHS.asos, seed.asos),
        del(PATHS.demissoes, seed.demissoes),
        del(PATHS.treinamentos, seed.treinamentos),
        del(PATHS.promocoes, seed.promocoes),
        del(PATHS.bancoHorasFechamentos, seed.bhFechamentos)
    ]);
    // Folha e banco de horas: mesmo formato {mes}/{funcionarioId}, mesma limpeza — remove
    // só os funcionários de exemplo e apaga o mês se ele ficar vazio. Nunca `remove` no mês
    // inteiro: pode haver lançamento real do RH no mesmo mês.
    const limpaMensal = async (path, meses) => {
        for (const key of meses || []) {
            const mes = (await DB.getObj(`${path}/${key}`)) || {};
            for (const fid of Object.keys(mes)) {
                if ((seed.funcionarios || []).includes(fid)) await db.ref(`${path}/${key}/${fid}`).remove();
            }
            const resto = await DB.getObj(`${path}/${key}`);
            if (!resto || !Object.keys(resto).length) await db.ref(`${path}/${key}`).remove();
        }
    };
    await limpaMensal(PATHS.folha, seed.folhaMeses);
    await limpaMensal(PATHS.bancoHoras, seed.bancoMeses);
    await del(PATHS.funcionarios, seed.funcionarios);
    await Promise.all([
        del(PATHS.cargos, seed.cargos),
        del(PATHS.unidades, seed.unidades),
        del(PATHS.beneficios, seed.beneficios)
    ]);
    await db.ref(SEED_PATH).remove();
    return true;
}
