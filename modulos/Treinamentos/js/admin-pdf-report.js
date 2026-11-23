// Relatório em PDF do botão "Baixar relatório" — serve tanto ao modal do
// colaborador quanto ao da unidade. O que muda entre os dois é o payload:
// `kind` ('colaborador' | 'unidade') troca títulos e vocabulário, e o
// relatório de unidade traz duas coisas a mais — a folha "Curva de
// comportamento" e o card de curso com veredito por bloco.
//
// O irmão deste arquivo é js/admin-xlsx-charts.js: lá a saída é uma planilha
// para analisar, aqui é um documento para ler, enviar ou projetar. O formato
// segue o modelo impresso que o relatório substitui — folhas 16:9 de 960x540,
// uma ideia por folha, com os números sempre acompanhados da leitura que se
// espera deles.
//
// Divisão de responsabilidades: js/admin-dashboard.js sabe filtrar, calcular e
// formatar (é dele o recorte por categoria e por data); este módulo só recebe
// um payload pronto e o transforma em folhas. Nada aqui lê o estado do
// dashboard, então o relatório nunca pode divergir do que a tela mostra.
//
// A montagem é a mesma do certificado (js/certificate.js): palco fora da tela,
// html2canvas por folha, jsPDF juntando as imagens. Os gráficos são desenhados
// com Chart.js num canvas solto e entram como <img> já rasterizada — capturar
// um <canvas> vivo com html2canvas é justamente onde a biblioteca costuma
// divergir do que está na tela.
(function () {
    var U = window.UniAdmin = window.UniAdmin || {};

    var PAGE_W = 960;
    var PAGE_H = 540;

    // Escala de desenho dos gráficos: o canvas é feito com o dobro do tamanho
    // final e encolhido no HTML, senão a folha sai com o gráfico borrado.
    var S = 2;

    var COLORS = {
        ink: '#06333b',
        inkSoft: '#24484f',
        deep: '#0b4753',
        muted: '#55666b',
        accent: '#028090',
        good: '#00a896',
        goodAlt: '#02c39a',
        warn: '#c98a21',
        bad: '#e76f51',
        line: '#dceaec',
        surface: '#f4f9f9'
    };

    var TIME_BARS = 6;
    // Até quantas barras o histórico de notas mostra a data de cada uma.
    var SCORE_LABELS_MAX = 24;
    var CURVE_SERIES = 5;
    // O eixo da curva para no 10º dia; o 11º ponto é o balde de tudo que veio
    // depois (quem monta o payload já colapsa os dias seguintes nele).
    var CURVE_MAX_DAY = 10;
    var CURVE_OVERFLOW_LABEL = ">10 dias";

    function curveDayLabel(day) {
        return day > CURVE_MAX_DAY ? CURVE_OVERFLOW_LABEL : day + "º dia";
    }

    // ─── Utilidades ───

    function esc(value) {
        return String(value === null || value === undefined ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }


    function pad2(n) { return n < 10 ? '0' + n : String(n); }

    // ─── Paginação por altura medida ───
    // Contar cards por folha não basta: nome de curso em duas linhas ou a
    // dica "83% da meta (00:28:00)" quebrando deixam o card mais alto, e o
    // quarto card da folha saía cortado pelo overflow do corpo. Aqui cada
    // item é desenhado de verdade num palco invisível, com a mesma largura e
    // CSS da folha, e o que não cabe vai para a folha seguinte.
    // .rp-body tem max-height 383px com 20px de padding-top; os 3px a menos
    // são folga para arredondamento de subpixel.
    var MEASURED_BUDGET = 360;

    function withMeasureBody(fn) {
        var stage = document.createElement('div');
        stage.className = 'report-stage';
        stage.innerHTML = '<div class="rp-slide"><div class="rp-body" style="max-height:none"></div></div>';
        document.body.appendChild(stage);
        try {
            return fn(stage.querySelector('.rp-body'));
        } finally {
            stage.remove();
        }
    }

    // Altura de cada bloco solto (card de curso) e a margem que ele deixa
    // para o próximo — a margem do último da folha não ocupa espaço útil.
    function measureBlocks(htmlList) {
        return withMeasureBody(function (body) {
            return htmlList.map(function (html) {
                body.innerHTML = html;
                var el = body.firstElementChild;
                return {
                    height: el.getBoundingClientRect().height,
                    gap: parseFloat(window.getComputedStyle(el).marginBottom) || 0
                };
            });
        });
    }

    function pageFits(sizes, budget) {
        var used = 0;
        sizes.forEach(function (size, i) { used += size.height + (i < sizes.length - 1 ? size.gap : 0); });
        return used <= budget;
    }

    // Quantas folhas o empacotamento guloso precisa; depois tenta a mesma
    // quantidade de folhas com divisão equilibrada (5 viram 3+2, não 4+1):
    // uma folha quase vazia no fim é o que mais denuncia relatório gerado
    // por máquina. Se o equilíbrio estourar alguma folha, fica o guloso.
    // Item mais alto que a folha inteira vai sozinho para a sua.
    function paginateMeasured(items, sizes, budget) {
        if (!items.length) return [];
        var greedy = [];
        var current = [];
        var currentSizes = [];
        items.forEach(function (item, i) {
            if (current.length && !pageFits(currentSizes.concat([sizes[i]]), budget)) {
                greedy.push(current);
                current = [];
                currentSizes = [];
            }
            current.push(item);
            currentSizes.push(sizes[i]);
        });
        greedy.push(current);
        if (greedy.length === 1) return greedy;

        // Mesma quantidade de folhas, com a sobra distribuída pelas
        // primeiras: 10 itens em 4 folhas viram 3+3+2+2, não 3+3+3+1.
        var pagesCount = greedy.length;
        var base = Math.floor(items.length / pagesCount);
        var extra = items.length % pagesCount;
        var balanced = [];
        var start = 0;
        for (var p = 0; p < pagesCount; p++) {
            var size = base + (p < extra ? 1 : 0);
            if (!pageFits(sizes.slice(start, start + size), budget)) return greedy;
            balanced.push(items.slice(start, start + size));
            start += size;
        }
        return balanced;
    }

    // ─── Gráficos ───
    // Um canvas solto, desenhado em 2x, devolvido como data URL. O Chart.js
    // pinta de forma síncrona com `animation: false`, mas o frame extra
    // garante que a pintura terminou antes do toDataURL.
    function chartImage(width, height, config) {
        if (!window.Chart) return Promise.resolve(null);
        var canvas = document.createElement('canvas');
        canvas.width = width * S;
        canvas.height = height * S;
        var chart = new window.Chart(canvas.getContext('2d'), config);
        return new Promise(function (resolve) {
            requestAnimationFrame(function () {
                var url;
                try { url = canvas.toDataURL('image/png'); } catch (error) { url = null; }
                chart.destroy();
                resolve(url);
            });
        });
    }

    function baseChartOptions(extra) {
        var options = {
            responsive: false,
            maintainAspectRatio: false,
            animation: false,
            devicePixelRatio: 1,
            layout: { padding: 4 * S },
            plugins: {
                legend: {
                    display: false,
                    labels: { font: { size: 11 * S, family: 'Inter, Arial, sans-serif' }, color: COLORS.muted, boxWidth: 10 * S }
                },
                tooltip: { enabled: false }
            },
            scales: {}
        };
        return Object.assign(options, extra || {});
    }

    function axisFont() { return { size: 10 * S, family: 'Inter, Arial, sans-serif' }; }

    function imageTag(url, alt) {
        if (!url) return '<div class="rp-empty">Gráfico indisponível.</div>';
        return '<img src="' + url + '" alt="' + esc(alt) + '">';
    }

    // ─── Base do cumprimento de prazo ───
    // O payload do colaborador separa os cursos sem prazo (`deadlineCount`
    // conta só os que tinham limite); o da unidade ainda não, e aí a base é
    // o total de conclusões.
    function deadlineBase(s) {
        return s.deadlineCount !== undefined ? s.deadlineCount : s.lastAttemptsCount;
    }

    function deadlineNoun(s, count) {
        return (count === 1 ? 'curso' : 'cursos') + (s.deadlineCount !== undefined ? ' com prazo' : '');
    }

    function noDeadlineText(count) {
        return count + (count === 1 ? ' curso sem prazo' : ' cursos sem prazo');
    }

    function deadlineKpiHint(s) {
        if (!s.lastAttemptsCount) return 'Sem conclusões no período';
        var base = deadlineBase(s);
        if (!base) return 'Nenhum curso com prazo';
        return s.onTime + ' de ' + base + ' dentro do limite' + (s.noDeadline ? ' · ' + noDeadlineText(s.noDeadline) : '');
    }

    // ─── Leitura executiva e plano de ação ───
    // Frases determinísticas: cada regra olha um número do payload e só entra
    // quando aquele número existe. Sem dado, a folha diz que não há dado — em
    // vez de afirmar algo que o período não sustenta.

    function executiveReading(data) {
        var s = data.summary;
        var isUnit = data.kind === 'unidade';
        var notes = [];

        if (s.avgScore !== null && s.avgRating !== null && s.avgScore >= 9 && s.avgRating < 3) {
            notes.push('<b>Aprende bem, mas não gosta.</b> A média das notas é ' + esc(s.avgScoreLabel) +
                ', enquanto a satisfação com os cursos fica em ' + esc(s.avgRatingLabel) +
                ' — o conteúdo é absorvido, mas a experiência é rejeitada.');
        } else if (s.avgScore !== null && s.avgScore >= 8) {
            notes.push('<b>Aproveitamento consistente.</b> Média de ' + esc(s.avgScoreLabel) + ' em ' +
                s.attempts + ' ' + (s.attempts === 1 ? 'prova' : 'provas') + ', com ' +
                esc(s.approvalPctLabel) + ' de aprovação.');
        } else if (s.avgScore !== null) {
            notes.push('<b>Aproveitamento abaixo do esperado.</b> Média de ' + esc(s.avgScoreLabel) +
                ', com ' + s.reproved + ' ' + (s.reproved === 1 ? 'reprovação' : 'reprovações') + ' no período.');
        }

        var withDeadline = deadlineBase(s);
        if (withDeadline > 0) {
            if (s.onTimePct !== null && s.onTimePct < 70) {
                notes.push('<b>Adesão fora do prazo.</b> ' + s.late + ' de ' + withDeadline + ' ' +
                    deadlineNoun(s, withDeadline) + ' foram concluídos depois do limite (' + esc(s.onTimePctLabel) + ' no prazo).');
            } else if (s.late === 0) {
                notes.push('<b>Prazo em dia.</b> ' + (withDeadline === 1 ? 'O único ' : 'Todos os ' + withDeadline + ' ') +
                    deadlineNoun(s, withDeadline) + (withDeadline === 1 ? ' ficou' : ' ficaram') + ' dentro do limite.');
            } else {
                // Atraso abaixo do limiar de alerta ainda é atraso: sem esta
                // nota a leitura ficava muda sobre um curso fora do prazo.
                notes.push('<b>Atraso pontual.</b> ' + s.late + ' de ' + withDeadline + ' ' +
                    deadlineNoun(s, withDeadline) + ' ' + (s.late === 1 ? 'foi concluído' : 'foram concluídos') +
                    ' depois do limite (' + esc(s.onTimePctLabel) + ' no prazo).');
            }
        }

        if (s.stillFailing > 0) {
            notes.push('<b>Curso sem aprovação.</b> ' + s.stillFailing + ' ' +
                (s.stillFailing === 1 ? 'curso terminou' : 'cursos terminaram') + ' o período com situação final reprovada.');
        }

        if (s.retryApproved > 0) {
            notes.push('<b>Aprovação após retentativa.</b> ' + s.retryApproved + ' ' +
                (s.retryApproved === 1 ? 'curso exigiu' : 'cursos exigiram') +
                ' mais de uma tentativa para ser aprovado.');
        }

        if (s.underGoalCourses > 0) {
            notes.push('<b>Tempo abaixo da meta.</b> ' + s.underGoalCourses + ' ' +
                (s.underGoalCourses === 1 ? 'curso ficou' : 'cursos ficaram') +
                ' abaixo de 60% do tempo previsto' +
                (s.worstUnderGoalLabel ? ' (' + esc(s.worstUnderGoalLabel) + ')' : '') +
                ' — indício de conteúdo não assistido por inteiro.');
        }

        if (s.lowRatingsWithoutComment > 0) {
            notes.push('<b>Nota baixa sem justificativa.</b> ' + s.lowRatingsWithoutComment + ' ' +
                (s.lowRatingsWithoutComment === 1 ? 'avaliação' : 'avaliações') +
                ' de até 3 estrelas ' + (s.lowRatingsWithoutComment === 1 ? 'veio' : 'vieram') +
                ' sem comentário escrito — a insatisfação existe, mas não é acionável.');
        }

        if (s.pendingCount > 0) {
            notes.push('<b>Pendências em aberto.</b> ' + s.pendingCount + ' ' +
                (isUnit
                    ? (s.pendingCount === 1 ? 'curso ainda não foi concluído por toda a unidade' : 'cursos ainda não foram concluídos por toda a unidade')
                    : (s.pendingCount === 1 ? 'curso do público-alvo ainda não foi concluído' : 'cursos do público-alvo ainda não foram concluídos')) +
                (s.pendingAvgPctLabel ? ', com ' + esc(s.pendingAvgPctLabel) + ' assistidos em média' : '') + '.');
        }

        if (!notes.length) {
            notes.push('Não há realizações suficientes no período selecionado para uma leitura do desempenho.');
        }
        return notes.slice(0, 4);
    }

    // Leitura da curva de comportamento. As três perguntas do modelo, nesta
    // ordem: a unidade responde ao lançamento ou ao limite? alguém começou
    // cedo? sobrou cauda longa?
    function curveNotes(data) {
        var curves = (data.completionCurves || []).slice(0, CURVE_SERIES);
        if (!curves.length) return ['Sem conclusões suficientes no período para desenhar a curva.'];

        var notes = [];
        var halfDays = curves.map(function (c) {
            var point = null;
            c.points.forEach(function (p) { if (!point && p.pct >= 50) point = p; });
            return point ? point.day : c.points[c.points.length - 1].day;
        });
        var lastDays = curves.map(function (c) { return c.points[c.points.length - 1].day; });
        var maxDay = Math.max.apply(null, lastDays);
        var avgHalf = halfDays.reduce(function (a, b) { return a + b; }, 0) / halfDays.length;

        if (maxDay > 1 && avgHalf >= maxDay * 0.6) {
            notes.push('<b>Efeito prazo:</b> a unidade só passa da metade das conclusões perto do fim da janela — responde ao limite, não ao lançamento.');
        } else if (maxDay > 1) {
            notes.push('<b>Adesão distribuída:</b> metade das conclusões acontece até o ' + Math.round(avgHalf) + 'º dia, bem antes do fim da janela.');
        }

        var early = curves.filter(function (c) { return c.points[0].day <= 2; });
        notes.push(early.length
            ? '<b>Início antecipado:</b> ' + early.length + ' ' + (early.length === 1 ? 'curso teve' : 'cursos tiveram') +
              ' conclusões já nos dois primeiros dias.'
            : '<b>Sem início antecipado:</b> nenhum curso teve conclusão nos dois primeiros dias da janela.');

        var longTail = curves.filter(function (c) { return c.points[c.points.length - 1].day >= 7; })
            .sort(function (a, b) { return b.points[b.points.length - 1].day - a.points[a.points.length - 1].day; })[0];
        if (longTail) {
            var last = longTail.points[longTail.points.length - 1];
            notes.push('<b>Cauda longa:</b> em ' + esc(longTail.name) + ', a unidade só chegou a ' + last.pct +
                '% ' + (last.day > CURVE_MAX_DAY ? 'depois do 10º dia' : 'no ' + last.day + 'º dia') + '.');
        }

        var incomplete = curves.filter(function (c) { return c.points[c.points.length - 1].pct < 100; });
        if (incomplete.length) {
            notes.push('<b>Ainda em aberto:</b> ' + incomplete.length + ' ' +
                (incomplete.length === 1 ? 'curso não chegou' : 'cursos não chegaram') + ' a 100% da audiência da unidade.');
        }
        return notes.slice(0, 4);
    }

    function actionPlan(data) {
        var s = data.summary;
        var isUnit = data.kind === 'unidade';
        var actions = [];

        if (s.onTimePct !== null && s.onTimePct < 70) {
            actions.push({
                title: 'Corrigir a adesão fora do prazo',
                text: isUnit
                    ? 'Acompanhar nominalmente quem concluiu depois do limite (' + s.late + ' ' + (s.late === 1 ? 'caso' : 'casos') + ') e combinar um lembrete antes do prazo.'
                    : 'Acompanhar nominalmente os ' + s.late + ' cursos concluídos em atraso e combinar um lembrete antes do limite.'
            });
        } else if (s.late > 0) {
            actions.push({
                title: 'Rever os atrasos pontuais',
                text: s.late + ' ' + (s.late === 1 ? 'curso foi concluído' : 'cursos foram concluídos') +
                    ' depois do limite. ' + (isUnit
                        ? 'Identificar quem atrasou e combinar um lembrete antes do prazo.'
                        : 'Entender o motivo com o colaborador e combinar um lembrete antes do prazo.')
            });
        }
        if (s.underGoalCourses > 0) {
            actions.push({
                title: 'Verificar os cursos assistidos abaixo da meta',
                text: s.underGoalCourses + ' ' + (s.underGoalCourses === 1 ? 'curso ficou' : 'cursos ficaram') +
                    ' abaixo de 60% do tempo previsto' + (s.worstUnderGoalLabel ? ' (' + s.worstUnderGoalLabel + ')' : '') +
                    '. Confirmar se o conteúdo foi assistido por inteiro.'
            });
        }
        if (s.lowRatingsWithoutComment > 0) {
            actions.push({
                title: 'Tornar o feedback obrigatório',
                text: 'Exigir justificativa escrita para notas de satisfação iguais ou inferiores a 3 — hoje a insatisfação não chega acionável.'
            });
        }
        // Só cobra retorno quando há insatisfação sem justificativa (até 3
        // estrelas sem comentário). Avaliação de 4 ou 5 estrelas não exige
        // comentário, então a ausência dele não vira pendência.
        if (s.lowRatingsWithoutComment > 0) {
            actions.push({
                title: 'Dar retorno às avaliações baixas',
                text: s.lowRatingsWithoutComment + ' ' +
                    (s.lowRatingsWithoutComment === 1 ? 'avaliação de até 3 estrelas veio' : 'avaliações de até 3 estrelas vieram') +
                    ' sem comentário. ' + (isUnit ? 'Procurar a unidade para entender o motivo.' : 'Procurar o colaborador para entender o motivo.')
            });
        }
        if (s.pendingCount > 0) {
            actions.push({
                title: 'Concluir os cursos pendentes',
                text: s.pendingCount + ' ' + (s.pendingCount === 1 ? 'curso pendente' : 'cursos pendentes') +
                    ' do público-alvo' + (s.pendingAvgPctLabel ? ', com ' + esc(s.pendingAvgPctLabel) + ' assistidos em média' : '') + '.'
            });
        }
        if (s.stillFailing > 0) {
            actions.push({
                title: 'Retomar os cursos ainda reprovados',
                text: s.stillFailing + ' ' + (s.stillFailing === 1 ? 'curso segue' : 'cursos seguem') +
                    ' sem aprovação depois das tentativas do período.'
            });
        }
        if (actions.length < 5 && s.avgScore !== null && s.avgScore >= 8 && s.late === 0 && s.pendingCount === 0) {
            actions.push({
                title: 'Preservar o que já funciona',
                text: 'Conclusão dentro do prazo, notas acima de 8,0 e nenhuma pendência são o padrão a ser mantido.'
            });
        }
        if (!actions.length) {
            actions.push({
                title: 'Acompanhar o próximo ciclo',
                text: 'O período selecionado não traz desvios de prazo, nota ou satisfação que exijam ação imediata.'
            });
        }
        return actions.slice(0, 5);
    }

    function closingLine(data) {
        var s = data.summary;
        if (s.avgScore === null) {
            return 'Sem provas enviadas no período selecionado — o relatório reflete apenas os cursos pendentes e o cadastro ' + (data.kind === 'unidade' ? 'da unidade.' : 'do colaborador.');
        }
        if (s.avgScore >= 9 && s.onTimePct !== null && s.onTimePct >= 90 && s.pendingCount === 0) {
            return '<b>Conclusão:</b> desempenho proficiente em execução, prazo e aprendizagem. O esforço do próximo ciclo pode migrar do "fazer" para o "como se sente".';
        }
        if (s.onTimePct !== null && s.onTimePct < 70) {
            return '<b>Conclusão:</b> o resultado técnico se sustenta, mas o cumprimento de prazo é o ponto que decide o próximo ciclo.';
        }
        return '<b>Conclusão:</b> desempenho dentro do esperado, com os pontos acima como prioridades do próximo ciclo.';
    }

    // ─── Folhas ───

    function footHtml(data, index, total) {
        return '<div class="rp-foot">' +
            '<span><b>' + esc(data.colab.fullName) + '</b> · ' + esc(data.categoryName) + '</span>' +
            '<span>Período: ' + esc(periodText(data)) + '</span>' +
            '<span>' + index + '/' + total + '</span>' +
            '</div>';
    }

    // Recorte de data no topo de TODA folha: uma folha solta, impressa ou
    // colada numa apresentacao, precisa dizer sozinha de que periodo fala.
    function periodTagHtml(data) {
        return '<span class="rp-eyebrow-period">' + esc(periodText(data)) + '</span>';
    }

    function periodText(data) {
        var base = data.dataRangeLabel
            ? data.periodLabel + ' (' + data.dataRangeLabel + ')'
            : data.periodLabel;
        // O recorte por funcao viaja junto do periodo em toda tarja: um slide
        // solto precisa dizer que nao fala do time inteiro.
        return data.roleLabel ? base + ' · ' + data.roleLabel : base;
    }

    function slideHtml(data, index, total, options) {
        return '<div class="rp-slide">' +
            '<div class="rp-head">' +
            '<div class="rp-eyebrow">' + esc(options.eyebrow) + periodTagHtml(data) + '</div>' +
            '<h1 class="rp-title">' + esc(options.title) + '</h1>' +
            (options.sub ? '<p class="rp-sub">' + esc(options.sub) + '</p>' : '') +
            '</div>' +
            '<div class="rp-body' + (options.sub ? '' : ' is-tall') + '">' + options.body + '</div>' +
            footHtml(data, index, total) +
            '</div>';
    }

    // A capa tem altura fixa: o bloco de texto começa em 92px e os KPIs estão
    // ancorados no pé, então sobram ~267px. Um nome comprido quebrava o
    // título em três linhas de 44px e empurrava o período por cima dos KPIs.
    // A fonte encolhe conforme o nome cresce, mantendo o título em duas
    // linhas — em vez de truncar o nome de alguém, que é o pior resultado.
    function coverTitleSizeClass(fullName) {
        var length = String(fullName || '').length;
        if (length > 38) return ' is-xs';
        if (length > 30) return ' is-sm';
        if (length > 22) return ' is-md';
        return '';
    }

    function coverHtml(data) {
        var s = data.summary;
        var kpis = [
            { value: s.coursesCount, label: s.coursesCount === 1 ? 'curso realizado' : 'cursos realizados' },
            { value: s.avgScore === null ? '—' : s.avgScoreLabel + '/10', label: 'nota média' },
            { value: s.avgRating === null ? '—' : s.avgRatingLabel + '/5', label: 'satisfação com os cursos' }
        ];
        var meta = [];
        if (data.colab.role) meta.push('<span>' + esc(data.colab.role) + '</span>');
        if (data.colab.unit) meta.push('<span>' + esc(data.colab.unit) + '</span>');
        meta.push('<span>' + esc(data.categoryName) + '</span>');

        return '<div class="rp-slide is-cover">' +
            '<div class="rp-cover-mark"></div>' +
            '<div class="rp-cover-bar"></div>' +
            '<div class="rp-cover-inner">' +
            '<div class="rp-cover-eyebrow">Relatório de ' + esc(data.categoryName) + '</div>' +
            '<h1 class="rp-cover-title' + coverTitleSizeClass(data.colab.fullName) + '">' +
            esc(data.coverLead || 'Proficiência de') + '<br>' + esc(data.colab.fullName) + '</h1>' +
            '<p class="rp-cover-sub">' + esc(data.coverSub || 'Desempenho na realização dos cursos, cumprimento de prazo e percepção do colaborador.') + '</p>' +
            '<div class="rp-cover-meta">' + meta.join('') + '</div>' +
            '<div class="rp-cover-period">Período de referência: <b>' + esc(data.periodLabel) + '</b>' +
            (data.dataRangeLabel ? ' · dados de ' + esc(data.dataRangeLabel) : ' · sem provas no recorte') +
            (data.roleLabel ? '<br>Recorte: <b>' + esc(data.roleLabel) + '</b>' : '') + '</div>' +
            '</div>' +
            '<div class="rp-cover-kpis">' +
            kpis.map(function (k) {
                return '<div class="rp-cover-kpi">' +
                    '<div class="rp-cover-kpi-value">' + esc(k.value) + '</div>' +
                    '<div class="rp-cover-kpi-label">' + esc(k.label) + '</div>' +
                    '</div>';
            }).join('') +
            '</div>' +
            '<div class="rp-cover-base">Base: provas enviadas, tempos de execução, situação de prazo e pesquisas de satisfação registradas no sistema.' +
            ' Gerado em ' + esc(data.generatedAt) + '.</div>' +
            '</div>';
    }

    function kpiHtml(value, label, hint, tone) {
        return '<div class="rp-kpi">' +
            '<div class="rp-kpi-value' + (tone ? ' ' + tone : '') + '">' + esc(value) + '</div>' +
            '<div class="rp-kpi-label">' + esc(label) + '</div>' +
            (hint ? '<div class="rp-kpi-hint">' + esc(hint) + '</div>' : '') +
            '</div>';
    }

    function overviewBody(data) {
        var s = data.summary;
        var kpis = '<div class="rp-kpis">' +
            kpiHtml(s.coursesCount, s.coursesCount === 1 ? 'Curso realizado' : 'Cursos realizados',
                s.attempts + (s.attempts === 1 ? ' prova enviada' : ' provas enviadas')) +
            kpiHtml(s.avgScore === null ? '—' : s.avgScoreLabel + '/10', 'Nota média',
                s.avgScore === null ? 'Sem provas no período' : 'Entre ' + s.minScoreLabel + ' e ' + s.maxScoreLabel) +
            kpiHtml(s.onTimePct === null ? '—' : s.onTimePctLabel, 'Cursos no prazo',
                deadlineKpiHint(s),
                s.onTimePct !== null && s.onTimePct < 70 ? 'is-bad' : null) +
            kpiHtml(s.avgRating === null ? '—' : s.avgRatingLabel + '/5', 'Satisfação com os cursos',
                s.ratingsCount ? s.ratingsCount + (s.ratingsCount === 1 ? ' pesquisa respondida' : ' pesquisas respondidas') : 'Sem pesquisas respondidas',
                s.avgRating !== null && s.avgRating < 3 ? 'is-warn' : null) +
            '</div>';

        var notes = executiveReading(data);
        return kpis +
            '<div style="margin-top:22px">' +
            '<div class="rp-section-title">Leitura executiva</div>' +
            '<ul class="rp-notes">' + notes.map(function (n) { return '<li>' + n + '</li>'; }).join('') + '</ul>' +
            '</div>';
    }

    // Card do modelo impresso: quatro blocos por curso, cada um com um
    // veredito ("Ótimo", "Excelente", "Atenção") acima do número. Quem calcula
    // o veredito é quem monta o payload — ele depende de público-alvo, prazo e
    // meta, que só o dashboard conhece.
    function blockCourseCardHtml(course, position) {
        return '<div class="rp-course is-blocks">' +
            '<div class="rp-course-index">' + pad2(position) + '</div>' +
            '<div class="rp-course-main">' +
            '<div class="rp-course-name">' + esc(course.name) + '</div>' +
            '<div class="rp-course-sub">' + esc(course.subject || '—') + '</div>' +
            '</div>' +
            '<div class="rp-metrics">' +
            course.blocks.map(function (block) {
                return '<div class="rp-metric">' +
                    '<div class="rp-metric-label">' + esc(block.label) + '</div>' +
                    '<div class="rp-metric-value ' + (block.tone || '') + '">' + esc(block.value) + '</div>' +
                    (block.verdict ? '<div class="rp-metric-verdict ' + (block.tone || '') + '">' + esc(block.verdict) + '</div>' : '') +
                    '<div class="rp-metric-hint">' + esc(block.hint || '—') + '</div>' +
                    '</div>';
            }).join('') +
            '</div>' +
            '</div>';
    }

    function courseCardHtml(course, position) {
        if (course.blocks) return blockCourseCardHtml(course, position);
        var scoreTone = course.score === null ? '' : (course.score >= 8 ? 'is-ok' : course.score >= 6 ? 'is-warn' : 'is-bad');
        // Tempo de curso: passar da meta é aceitável; o alerta é ficar abaixo
        // dela, que sugere conteúdo não assistido por inteiro.
        var timeTone = course.timeLevel === 'critico' ? 'is-bad'
            : course.timeLevel === 'alerta' ? 'is-warn'
                : course.timeLevel ? 'is-ok' : '';
        return '<div class="rp-course">' +
            '<div class="rp-course-index">' + pad2(position) + '</div>' +
            '<div class="rp-course-main">' +
            '<div class="rp-course-name">' + esc(course.name) + '</div>' +
            '<div class="rp-course-sub">' + esc(course.subject || '—') +
            (course.submittedLabel ? ' · ' + esc(course.submittedLabel) : '') + '</div>' +
            '</div>' +
            '<div class="rp-metrics">' +
            '<div class="rp-metric">' +
            '<div class="rp-metric-label">Prazo</div>' +
            '<div class="rp-metric-value ' + (course.noDeadline ? '' : course.onTime ? 'is-ok' : 'is-bad') + '">' + esc(course.deadlineLabel) + '</div>' +
            '<div class="rp-metric-hint">' + esc(course.attempts) + (course.attempts === 1 ? ' tentativa' : ' tentativas') + '</div>' +
            '</div>' +
            '<div class="rp-metric">' +
            '<div class="rp-metric-label">Tempo de curso</div>' +
            '<div class="rp-metric-value ' + timeTone + '">' + esc(course.activeLabel) + '</div>' +
            '<div class="rp-metric-hint">' + esc(course.goalHint) + '</div>' +
            '</div>' +
            '<div class="rp-metric">' +
            '<div class="rp-metric-label">Nota</div>' +
            '<div class="rp-metric-value ' + scoreTone + '">' + esc(course.scoreLabel) + '</div>' +
            '<div class="rp-metric-hint">' + (course.approved ? 'Aprovado' : 'Reprovado') + '</div>' +
            '</div>' +
            '<div class="rp-metric">' +
            '<div class="rp-metric-label">Avaliação</div>' +
            '<div class="rp-metric-value ' + (course.rating === null ? '' : course.rating >= 4 ? 'is-ok' : course.rating >= 3 ? 'is-warn' : 'is-bad') + '">' +
            esc(course.ratingLabel) + '</div>' +
            '<div class="rp-metric-hint">' + esc(course.comment ? 'Com comentário' : 'Sem comentário') + '</div>' +
            '</div>' +
            '</div>' +
            '</div>';
    }

    // O curso já é o título do bloco, então o item traz só quem avaliou, a
    // nota e o que foi escrito.
    function feedbackHtml(item) {
        return '<div class="rp-fb">' +
            '<div class="rp-fb-top">' +
            (item.author ? '<span class="rp-fb-course">' + esc(item.author) + '</span>' : '<span></span>') +
            '<span class="rp-fb-stars ' + (item.rating === null ? '' : item.rating >= 4 ? 'is-ok' : item.rating >= 3 ? 'is-warn' : 'is-bad') + '">' +
            esc(item.ratingLabel) + '</span>' +
            '</div>' +
            (item.comment ? '<div class="rp-fb-text">' + esc(item.comment) + '</div>' : '') +
            '<div class="rp-fb-date">' + esc(item.dateLabel) + (item.comment ? '' : ' · avaliação sem comentário escrito') + '</div>' +
            '</div>';
    }

    function hiddenPositiveHtml(count) {
        return '<div class="rp-fb-note">' +
            '<b>' + count + '</b> ' + (count === 1
                ? 'avaliação de 4 ou 5 estrelas sem comentário escrito não está listada acima.'
                : 'avaliações de 4 ou 5 estrelas sem comentário escrito não estão listadas acima.') +
            '</div>';
    }

    // ─── Paginação dos feedbacks por altura ───
    // Contar itens não serve aqui: a altura de um feedback varia com o
    // comentário (uma linha ou duas, já que .rp-fb-text corta em 34px) e cada
    // troca de curso ainda insere um cabeçalho. Com contagem fixa, quatro
    // itens "grandes" estouravam a folha e o texto saía por cima do rodapé.
    // Por isso cada bloco declara o que ocupa e a folha é fechada quando o
    // orçamento vertical acaba.
    // .rp-body tem max-height 383px em border-box, dos quais 20px são o
    // padding-top — sobram 363px para os blocos. O orçamento fica abaixo
    // disso porque as alturas aqui são estimativas do texto renderizado.
    var FB_BUDGET = 350;
    var FB_COURSE_HEAD = 30;      // cabeçalho do curso + espaço antes do 1º item
    var FB_BASE = 54;             // .rp-fb sem comentário (topo + data + padding + margem)
    var FB_LINE = 16;             // cada linha de comentário renderizada
    var FB_CHARS_PER_LINE = 95;   // ~largura útil da folha na fonte de 12px
    var FB_MAX_LINES = 2;         // .rp-fb-text corta em 34px ≈ 2 linhas
    var FB_NOTE = 46;             // .rp-fb-note do rodapé da última folha

    function feedbackHeight(item, startsCourse) {
        var height = FB_BASE + (startsCourse ? FB_COURSE_HEAD : 0);
        if (item.comment) {
            var lines = Math.min(FB_MAX_LINES, Math.max(1, Math.ceil(item.comment.length / FB_CHARS_PER_LINE)));
            height += lines * FB_LINE;
        }
        return height;
    }

    // Quebra a lista em folhas que cabem no orçamento. `noteHeight` é
    // reservado na última folha, onde entra o aviso das avaliações ocultas.
    function paginateFeedbacks(items, noteHeight) {
        var pages = [];
        var current = [];
        var used = 0;
        var lastCourse = null;
        items.forEach(function (item) {
            var startsCourse = item.course !== lastCourse;
            var cost = feedbackHeight(item, startsCourse);
            // Sempre cabe pelo menos um item por folha: sem isso um comentário
            // muito alto entraria num laço sem fim de folhas vazias.
            if (current.length && used + cost > FB_BUDGET) {
                pages.push(current);
                current = [];
                used = 0;
                // Na folha nova o curso é reaberto, então o cabeçalho volta a
                // custar — recalcula em vez de reaproveitar o custo anterior.
                cost = feedbackHeight(item, true);
            }
            current.push(item);
            used += cost;
            lastCourse = item.course;
        });
        if (current.length) pages.push(current);

        // O aviso final precisa de espaço na última folha; se não sobrou,
        // ele ganha uma folha só para ele (tratado por quem chama).
        if (noteHeight && pages.length) {
            var last = pages[pages.length - 1];
            var lastUsed = 0;
            var course = pages.length > 1 ? null : undefined;
            last.forEach(function (item, index) {
                lastUsed += feedbackHeight(item, index === 0 || item.course !== course);
                course = item.course;
            });
            if (lastUsed + noteHeight > FB_BUDGET) pages.push([]);
        }
        return pages;
    }

    // ─── Pendentes por curso, com quem falta (relatório da unidade) ───
    // Mesma lógica de orçamento dos feedbacks: a altura de um grupo depende
    // de quantas pessoas ele lista, então contar cursos por folha não serve.
    var PG_BUDGET = 350;      // igual ao dos feedbacks: altura útil de .rp-body
    var PG_HEAD = 40;         // título do curso + linha de assunto
    var PG_PERSON = 21;       // cada pessoa listada
    var PG_GAP = 14;          // espaço entre um grupo e o seguinte
    var PG_CONT = 16;         // linha "(continuação)" quando o grupo quebra

    function pendingGroupHeight(group) {
        return PG_HEAD + (group.people || []).length * PG_PERSON + PG_GAP +
            (group.continued ? PG_CONT : 0);
    }

    // Quebra os cursos em folhas. Um curso com muita gente é dividido entre
    // folhas em vez de estourar: a parte seguinte reabre o mesmo curso
    // marcado como continuação, para o leitor não achar que é outro.
    function paginatePendingGroups(pending) {
        var pages = [];
        var current = [];
        var used = 0;
        pending.forEach(function (course) {
            var people = (course.people || []).slice();
            var continued = false;
            do {
                var available = PG_BUDGET - used;
                var overhead = PG_HEAD + PG_GAP + (continued ? PG_CONT : 0);
                var fits = Math.floor((available - overhead) / PG_PERSON);
                // Não cabe nem o cabeçalho com uma pessoa: fecha a folha e
                // recomeça com o orçamento inteiro.
                if (fits < 1 && current.length) {
                    pages.push(current);
                    current = [];
                    used = 0;
                    available = PG_BUDGET;
                    fits = Math.floor((available - overhead) / PG_PERSON);
                }
                // Folha vazia que ainda não comporta uma pessoa: leva uma
                // assim mesmo, senão o laço não avança.
                if (fits < 1) fits = 1;
                var slice = people.splice(0, fits);
                var group = {
                    name: course.name,
                    subject: course.subject,
                    pct: course.pct,
                    people: slice,
                    continued: continued
                };
                current.push(group);
                used += pendingGroupHeight(group);
                continued = true;
            } while (people.length);
        });
        if (current.length) pages.push(current);
        return pages;
    }

    function pendingGroupHtml(group) {
        var people = group.people || [];
        return '<div class="rp-pend-group">' +
            '<div class="rp-pend-head">' + esc(group.name) +
            (group.continued ? ' <span class="rp-fb-cont">(continuação)</span>' : '') + '</div>' +
            '<div class="rp-pend-sub">' + esc(group.subject || '—') + '</div>' +
            people.map(function (person) {
                var tone = person.pct >= 75 ? 'is-ok' : person.pct > 0 ? 'is-warn' : 'is-bad';
                return '<div class="rp-pend-person">' +
                    '<span class="rp-pend-name">' + esc(person.name) + '</span>' +
                    '<span class="rp-pend-pct ' + tone + '">' + esc(person.pct) + '%</span>' +
                    '</div>';
            }).join('') +
            '</div>';
    }

    // Um bloco por curso. `continued` marca o bloco que atravessou a quebra
    // de folha, para o leitor não achar que começou outro curso.
    function feedbackBlocksHtml(page, continuedCourse) {
        var html = '';
        var current = null;
        page.forEach(function (item) {
            if (item.course !== current) {
                current = item.course;
                var cont = (html === '' && item.course === continuedCourse);
                html += '<div class="rp-fb-course-head">' + esc(item.course) +
                    (cont ? ' <span class="rp-fb-cont">(continuação)</span>' : '') + '</div>';
            }
            html += feedbackHtml(item);
        });
        return html;
    }

    // ─── Gráficos das folhas ───

    function scoresChart(data) {
        var history = data.scoreHistory;
        if (!history.length) return Promise.resolve(null);
        return chartImage(600, 330, {
            type: 'bar',
            data: {
                labels: history.map(function (h) { return h.label; }),
                datasets: [
                    { label: 'Nota', data: history.map(function (h) { return h.score; }), backgroundColor: COLORS.accent, borderRadius: 3 * S, maxBarThickness: 26 * S },
                    { label: 'Média', type: 'line', data: data.scoreTrend, borderColor: COLORS.bad, borderWidth: 2 * S, pointRadius: 0, tension: 0 }
                ]
            },
            options: baseChartOptions({
                plugins: {
                    legend: { display: true, position: 'top', labels: { font: axisFont(), color: COLORS.muted, boxWidth: 10 * S, padding: 8 * S } },
                    tooltip: { enabled: false }
                },
                scales: {
                    y: { min: 0, max: 10, ticks: { font: axisFont(), color: COLORS.muted, stepSize: 2 }, grid: { color: COLORS.line } },
                    // Até 24 provas, toda barra leva a data: pular rótulos
                    // deixava metade das barras sem dia. Acima disso o
                    // eixo volta a amostrar para não virar borrão.
                    x: { ticks: { font: axisFont(), color: COLORS.muted, maxRotation: 90, minRotation: history.length > 12 ? 60 : 0, autoSkip: history.length > SCORE_LABELS_MAX, maxTicksLimit: history.length > SCORE_LABELS_MAX ? 12 : history.length }, grid: { display: false } }
                }
            })
        });
    }

    function deadlineChart(data) {
        var months = data.deadlineByMonth;
        if (!months.length) return Promise.resolve(null);
        var datasets = [
            { label: 'No prazo', data: months.map(function (m) { return m.onTime; }), backgroundColor: COLORS.good, borderRadius: 3 * S, maxBarThickness: 34 * S },
            { label: 'Fora do prazo', data: months.map(function (m) { return m.late; }), backgroundColor: COLORS.bad, borderRadius: 3 * S, maxBarThickness: 34 * S }
        ];
        // Série "Sem prazo" só quando o payload a traz e há algum curso nela.
        if (months.some(function (m) { return m.noDeadline > 0; })) {
            datasets.push({ label: 'Sem prazo', data: months.map(function (m) { return m.noDeadline; }), backgroundColor: '#b7c7ca', borderRadius: 3 * S, maxBarThickness: 34 * S });
        }
        return chartImage(600, 330, {
            type: 'bar',
            data: {
                labels: months.map(function (m) { return m.label; }),
                datasets: datasets
            },
            options: baseChartOptions({
                plugins: {
                    legend: { display: true, position: 'top', labels: { font: axisFont(), color: COLORS.muted, boxWidth: 10 * S, padding: 8 * S } },
                    tooltip: { enabled: false }
                },
                scales: {
                    x: { stacked: true, ticks: { font: axisFont(), color: COLORS.muted }, grid: { display: false } },
                    y: { stacked: true, beginAtZero: true, ticks: { font: axisFont(), color: COLORS.muted, precision: 0 }, grid: { color: COLORS.line } }
                }
            })
        });
    }

    function timeChart(data) {
        var items = data.timeVsGoal.slice(0, TIME_BARS);
        if (!items.length) return Promise.resolve(null);
        return chartImage(600, 330, {
            type: 'bar',
            data: {
                labels: items.map(function (i) { return i.shortLabel; }),
                datasets: [
                    { label: data.timeSeriesLabel || 'Este colaborador', data: items.map(function (i) { return i.userMin; }), backgroundColor: COLORS.accent, borderRadius: 3 * S, maxBarThickness: 16 * S },
                    { label: 'Média do curso', data: items.map(function (i) { return i.avgMin; }), backgroundColor: '#9bc0c5', borderRadius: 3 * S, maxBarThickness: 16 * S },
                    { label: 'Meta', data: items.map(function (i) { return i.goalMin; }), backgroundColor: COLORS.good, borderRadius: 3 * S, maxBarThickness: 16 * S }
                ]
            },
            options: baseChartOptions({
                indexAxis: 'y',
                plugins: {
                    legend: { display: true, position: 'top', labels: { font: axisFont(), color: COLORS.muted, boxWidth: 10 * S, padding: 8 * S } },
                    tooltip: { enabled: false }
                },
                scales: {
                    x: { beginAtZero: true, title: { display: true, text: 'minutos', font: axisFont(), color: COLORS.muted }, ticks: { font: axisFont(), color: COLORS.muted }, grid: { color: COLORS.line } },
                    y: { ticks: { font: axisFont(), color: COLORS.muted }, grid: { display: false } }
                }
            })
        });
    }

    // Curva de comportamento: % acumulado de conclusão por dia, uma linha por
    // curso. O eixo X é "Nº dia" desde o início do prazo, não a data — é o
    // que deixa cursos lançados em meses diferentes comparáveis na mesma
    // folha.
    var CURVE_COLORS = [COLORS.accent, COLORS.good, COLORS.warn, '#7b5ea7', COLORS.bad];

    function curveChart(data) {
        var curves = (data.completionCurves || []).slice(0, CURVE_SERIES);
        if (!curves.length) return Promise.resolve(null);
        var maxDay = 1;
        curves.forEach(function (c) { maxDay = Math.max(maxDay, c.points[c.points.length - 1].day); });
        var labels = [];
        for (var d = 1; d <= maxDay; d++) labels.push(curveDayLabel(d));
        return chartImage(600, 330, {
            type: 'line',
            data: {
                labels: labels,
                datasets: curves.map(function (curve, i) {
                    // Degrau: entre duas conclusões o percentual não muda.
                    var last = 0;
                    var series = labels.map(function (_, dayIndex) {
                        for (var k = 0; k < curve.points.length; k++) {
                            if (curve.points[k].day === dayIndex + 1) { last = curve.points[k].pct; break; }
                        }
                        return last;
                    });
                    return {
                        label: curve.name,
                        data: series,
                        borderColor: CURVE_COLORS[i % CURVE_COLORS.length],
                        backgroundColor: CURVE_COLORS[i % CURVE_COLORS.length],
                        borderWidth: 2 * S, pointRadius: 1.5 * S, tension: 0.25, fill: false
                    };
                })
            },
            options: baseChartOptions({
                plugins: {
                    legend: { display: true, position: 'top', labels: { font: axisFont(), color: COLORS.muted, boxWidth: 10 * S, padding: 8 * S } },
                    tooltip: { enabled: false }
                },
                scales: {
                    y: { min: 0, max: 100, ticks: { font: axisFont(), color: COLORS.muted, stepSize: 25, callback: function (v) { return v + '%'; } }, grid: { color: COLORS.line } },
                    x: { ticks: { font: axisFont(), color: COLORS.muted, autoSkip: true, maxTicksLimit: 12 }, grid: { display: false } }
                }
            })
        });
    }

    function ratingChart(data) {
        var counts = data.ratingCounts;
        if (!counts.some(function (c) { return c > 0; })) return Promise.resolve(null);
        return chartImage(560, 310, {
            type: 'bar',
            data: {
                labels: ['1★', '2★', '3★', '4★', '5★'],
                datasets: [{ label: 'Avaliações', data: counts, backgroundColor: COLORS.warn, borderRadius: 3 * S, maxBarThickness: 26 * S }]
            },
            options: baseChartOptions({
                indexAxis: 'y',
                scales: {
                    x: { beginAtZero: true, ticks: { font: axisFont(), color: COLORS.muted, precision: 0 }, grid: { color: COLORS.line } },
                    y: { ticks: { font: axisFont(), color: COLORS.ink }, grid: { display: false } }
                }
            })
        });
    }

    // ─── Montagem das folhas ───

    async function buildSlides(data) {
        var s = data.summary;
        var slides = [];

        // A numeração do rodapé precisa do total, então as folhas são montadas
        // com um marcador e o rodapé é preenchido no fim.
        function push(builder) { slides.push(builder); }

        push(function () { return coverHtml(data); });

        var isUnit = data.kind === 'unidade';

        push(function (i, t) {
            return slideHtml(data, i, t, {
                eyebrow: 'Panorama geral',
                title: isUnit ? 'Panorama da unidade' : 'Panorama do colaborador',
                sub: 'Consolidado de ' + s.coursesCount + (s.coursesCount === 1 ? ' curso realizado' : ' cursos realizados') + ' no período',
                body: overviewBody(data)
            });
        });

        // Curso a curso
        if (data.courses.length) {
            // Paginação pela altura real de cada card (ver paginateMeasured).
            // A fonte precisa estar carregada antes da medida, senão o texto
            // medido em fonte de sistema quebra diferente do capturado.
            await ensureFontsLoaded();
            var courseSizes = measureBlocks(data.courses.map(function (course, idx) {
                return courseCardHtml(course, idx + 1);
            }));
            var pages = paginateMeasured(data.courses, courseSizes, MEASURED_BUDGET);
            var courseOffset = 0;
            pages.forEach(function (page, pageIndex) {
                var firstPosition = courseOffset + 1;
                courseOffset += page.length;
                push(function (i, t) {
                    return slideHtml(data, i, t, {
                        eyebrow: 'Desempenho curso a curso' + (pages.length > 1 ? ' (' + (pageIndex + 1) + '/' + pages.length + ')' : ''),
                        title: isUnit ? 'Conclusão, tempo, aprendizagem e avaliação' : 'Prazo, tempo, nota e avaliação',
                        sub: isUnit ? 'Como a unidade se saiu em cada curso do período' : 'Situação final de cada curso concluído no período',
                        body: page.map(function (course, idx) {
                            return courseCardHtml(course, firstPosition + idx);
                        }).join('')
                    });
                });
            });
        } else {
            push(function (i, t) {
                return slideHtml(data, i, t, {
                    eyebrow: 'Desempenho curso a curso',
                    title: 'Prazo, tempo, nota e avaliação',
                    body: '<div class="rp-empty">Nenhum curso concluído no período selecionado.</div>'
                });
            });
        }

        // Curva de comportamento — só faz sentido com um grupo de pessoas
        // atrás de cada ponto, então é folha exclusiva do relatório de unidade.
        if (data.completionCurves && data.completionCurves.length) {
            var curveImg = await curveChart(data);
            push(function (i, t) {
                var side = '<div class="rp-side">' +
                    '<div class="rp-section-title">O que a curva mostra</div>' +
                    '<ul class="rp-notes">' +
                    curveNotes(data).map(function (n) { return '<li>' + n + '</li>'; }).join('') +
                    '</ul></div>';
                return slideHtml(data, i, t, {
                    eyebrow: 'Curva de comportamento',
                    title: 'Percentual acumulado de conclusão por dia',
                    sub: 'Dia 1 é o início do prazo do curso; sem prazo definido, o primeiro dia com conclusão',
                    body: '<div class="rp-split"><div class="rp-chart">' + imageTag(curveImg, 'Curva de conclusão') +
                        '<div class="rp-chart-caption">Até ' + CURVE_SERIES + ' cursos com mais conclusões no período</div></div>' + side + '</div>'
                });
            });
        }

        // Evolução das notas
        var scoresImg = await scoresChart(data);
        push(function (i, t) {
            var side = '<div class="rp-side">' +
                '<div class="rp-section-title">O que o gráfico mostra</div>' +
                '<ul class="rp-notes">' +
                (s.avgScore === null
                    ? '<li>Sem provas enviadas no período selecionado.</li>'
                    : [
                        '<li>Média de <b>' + esc(s.avgScoreLabel) + '</b> em ' + s.attempts +
                        (s.attempts === 1 ? ' prova' : ' provas') + ', entre <b>' + esc(s.minScoreLabel) + '</b> e <b>' + esc(s.maxScoreLabel) + '</b>.</li>',
                        '<li>' + s.approved + ' ' + (s.approved === 1 ? 'aprovação' : 'aprovações') + ' e ' +
                        s.reproved + ' ' + (s.reproved === 1 ? 'reprovação' : 'reprovações') + ' (' + esc(s.approvalPctLabel) + ' de aproveitamento).</li>',
                        '<li>' + (s.retryApproved > 0
                            ? s.retryApproved + ' ' + (s.retryApproved === 1 ? 'curso precisou' : 'cursos precisaram') + ' de retentativa até aprovar.'
                            : 'Nenhum curso precisou de retentativa para aprovar.') + '</li>',
                        // Provas antigas não têm cronômetro: a média diz sobre
                        // quantas provas ela foi feita quando não são todas.
                        s.avgEvalLabel ? '<li>Tempo médio de prova: <b>' + esc(s.avgEvalLabel) + '</b>' +
                            (s.evalCount !== undefined && s.evalCount < s.attempts
                                ? ' (' + s.evalCount + ' de ' + s.attempts + ' provas com tempo registrado)'
                                : '') + '.</li>' : ''
                    ].join('')) +
                '</ul></div>';
            return slideHtml(data, i, t, {
                eyebrow: 'Evolução da aprendizagem',
                title: data.scoreChartTitle || 'Histórico de notas',
                sub: data.scoreChartSub || 'Uma barra por prova enviada, com a média fixa do período',
                body: '<div class="rp-split"><div class="rp-chart">' + imageTag(scoresImg, 'Histórico de notas') + '</div>' + side + '</div>'
            });
        });

        // Prazo por mês
        var deadlineImg = await deadlineChart(data);
        push(function (i, t) {
            var side = '<div class="rp-side">' +
                '<div class="rp-section-title">Cumprimento de prazo</div>' +
                '<ul class="rp-notes">' +
                (s.lastAttemptsCount === 0
                    ? '<li>Nenhum curso concluído no período selecionado.</li>'
                    : [
                        deadlineBase(s) > 0
                            ? '<li><b>' + esc(s.onTimePctLabel) + '</b> dos ' + deadlineNoun(s, 2) + ' ficaram dentro do limite (' +
                              s.onTime + ' de ' + deadlineBase(s) + ').</li>'
                            : '<li>Nenhum dos cursos concluídos tinha prazo definido.</li>',
                        '<li>' + (s.late > 0
                            ? '<b>' + s.late + '</b> ' + (s.late === 1 ? 'curso foi concluído' : 'cursos foram concluídos') + ' fora do limite.'
                            : 'Nenhuma conclusão fora do limite no período.') + '</li>',
                        s.noDeadline ? '<li><b>' + s.noDeadline + '</b> ' + (s.noDeadline === 1 ? 'curso não tinha' : 'cursos não tinham') +
                            ' prazo definido e ' + (s.noDeadline === 1 ? 'fica' : 'ficam') + ' fora do percentual.</li>' : '',
                        s.worstMonthLabel ? '<li>Mês com mais atrasos: <b>' + esc(s.worstMonthLabel) + '</b>.</li>' : ''
                    ].join('')) +
                '</ul></div>';
            return slideHtml(data, i, t, {
                eyebrow: 'Comportamento de conclusão',
                title: 'Prazo mês a mês',
                sub: 'Cursos concluídos em cada mês, pela situação da última tentativa',
                body: '<div class="rp-split"><div class="rp-chart">' + imageTag(deadlineImg, 'Prazo por mês') + '</div>' + side + '</div>'
            });
        });

        // Tempo x meta
        if (data.timeVsGoal.length) {
            var timeImg = await timeChart(data);
            push(function (i, t) {
                var side = '<div class="rp-side">' +
                    '<div class="rp-section-title">Tempo de execução</div>' +
                    '<ul class="rp-notes">' +
                    data.timeVsGoal.slice(0, TIME_BARS).map(function (item) {
                        return '<li><b>' + esc(item.shortLabel) + '</b> — ' + esc(item.verdict) + '</li>';
                    }).join('') +
                    '</ul></div>';
                return slideHtml(data, i, t, {
                    eyebrow: 'Tempo de execução x meta',
                    title: 'Quanto tempo cada curso levou',
                    sub: (isUnit ? 'Tempo ativo médio da unidade' : 'Tempo ativo do colaborador') + ' comparado à média de quem fez o mesmo curso e à meta cadastrada',
                    body: '<div class="rp-split"><div class="rp-chart">' + imageTag(timeImg, 'Tempo por curso') +
                        '<div class="rp-chart-caption">Valores em minutos · até ' + TIME_BARS + ' cursos mais longos do período</div></div>' + side + '</div>'
                });
            });
        }

        // Aprendizagem x satisfação
        var ratingImg = await ratingChart(data);
        push(function (i, t) {
            var side = '<div class="rp-side">' +
                '<div class="rp-section-title">Destaques</div>' +
                '<ul class="rp-notes">' +
                (s.ratingsCount === 0
                    ? '<li>Nenhuma pesquisa de satisfação respondida no período.</li>'
                    : [
                        '<li>Satisfação média de <b>' + esc(s.avgRatingLabel) + '/5</b> em ' + s.ratingsCount +
                        (s.ratingsCount === 1 ? ' pesquisa' : ' pesquisas') + '.</li>',
                        '<li>Nota média de aprendizagem de <b>' + esc(s.avgScoreLabel || '—') + '/10</b> — ' +
                        (s.avgScore !== null && s.avgRating !== null && s.avgScore >= 9 && s.avgRating < 3
                            ? 'o conteúdo é absorvido, mas a experiência é rejeitada.'
                            : 'resultado e percepção seguem na mesma direção.') + '</li>',
                        // Sem nenhuma nota baixa, "todas vieram com comentário"
                        // é verdade vazia — diz-se que não houve nenhuma.
                        '<li>' + (s.lowRatingsWithoutComment > 0
                            ? '<b>' + s.lowRatingsWithoutComment + '</b> ' + (s.lowRatingsWithoutComment === 1 ? 'nota baixa veio' : 'notas baixas vieram') + ' sem feedback escrito.'
                            : s.lowRatingsCount === 0
                                ? 'Nenhuma avaliação de até 3 estrelas no período.'
                                : 'Todas as notas baixas vieram acompanhadas de comentário.') + '</li>',
                        '<li>' + s.commentsCount + ' ' + (s.commentsCount === 1 ? 'comentário deixado' : 'comentários deixados') + ' no período.</li>'
                    ].join('')) +
                '</ul></div>';
            return slideHtml(data, i, t, {
                eyebrow: 'Aprendizagem x satisfação',
                title: 'O resultado técnico e a percepção',
                sub: 'Distribuição das avaliações de satisfação registradas no período',
                body: '<div class="rp-split"><div class="rp-chart">' + imageTag(ratingImg, 'Distribuição da satisfação') + '</div>' + side + '</div>'
            });
        });

        // Feedbacks — só o que é acionável: nota de até 3 estrelas (com ou
        // sem comentário) e nota alta que veio acompanhada de texto. As notas
        // 4 e 5 em branco viram uma contagem no fim, porque listá-las uma a
        // uma enche folhas sem dizer nada.
        var hiddenPositive = data.feedbackHiddenCount || 0;
        if (data.feedbacks.length) {
            var fbPages = paginateFeedbacks(data.feedbacks, hiddenPositive > 0 ? FB_NOTE : 0);
            fbPages.forEach(function (page, pageIndex) {
                var previousPage = pageIndex > 0 ? fbPages[pageIndex - 1] : null;
                var continuedCourse = previousPage && previousPage.length
                    ? previousPage[previousPage.length - 1].course : null;
                var isLast = pageIndex === fbPages.length - 1;
                push(function (i, t) {
                    return slideHtml(data, i, t, {
                        eyebrow: 'Feedback dos cursos' + (fbPages.length > 1 ? ' (' + (pageIndex + 1) + '/' + fbPages.length + ')' : ''),
                        title: isUnit ? 'O que a unidade registrou' : 'O que o colaborador registrou',
                        sub: 'Por curso, da pior para a melhor avaliação',
                        // Folha sem itens é a que sobrou só para o aviso das
                        // avaliações ocultas, quando ele não cabia na anterior.
                        body: (page.length
                            ? feedbackBlocksHtml(page, continuedCourse)
                            : '<div class="rp-empty">Continuação da folha anterior.</div>') +
                            (isLast && hiddenPositive > 0 ? hiddenPositiveHtml(hiddenPositive) : '')
                    });
                });
            });
        } else if (hiddenPositive > 0) {
            push(function (i, t) {
                return slideHtml(data, i, t, {
                    eyebrow: 'Feedback dos cursos',
                    title: isUnit ? 'O que a unidade registrou' : 'O que o colaborador registrou',
                    sub: 'Por curso, da pior para a melhor avaliação',
                    body: '<div class="rp-empty">Nenhuma avaliação exigiu atenção no período.</div>' + hiddenPositiveHtml(hiddenPositive)
                });
            });
        }

        // Pendentes. No relatório da unidade cada curso abre a lista de quem
        // ainda falta, com o progresso de cada um — saber que "faltam 2 de 5"
        // não diz a quem cobrar. No do colaborador a pessoa é uma só, então
        // a tabela por curso continua sendo a leitura certa.
        if (data.pending.length) {
            var hasPeople = isUnit && data.pending.some(function (p) { return (p.people || []).length; });
            if (hasPeople) {
                var pendGroups = paginatePendingGroups(data.pending);
                pendGroups.forEach(function (page, pageIndex) {
                    push(function (i, t) {
                        return slideHtml(data, i, t, {
                            eyebrow: 'Cursos pendentes' + (pendGroups.length > 1 ? ' (' + (pageIndex + 1) + '/' + pendGroups.length + ')' : ''),
                            title: 'O que ainda falta concluir',
                            sub: 'Quem ainda não concluiu cada curso do público-alvo, com o quanto já assistiu',
                            body: page.map(pendingGroupHtml).join('')
                        });
                    });
                });
            } else {
                // Coluna "Situação" só no payload que a traz (o do colaborador).
                var hasStatus = data.pending.some(function (p) { return p.statusLabel; });
                var pendHead = '<thead><tr>' +
                    '<th>Curso</th><th>Assunto</th>' + (hasStatus ? '<th>Situação</th>' : '') +
                    '<th style="text-align:right">% assistido</th>' +
                    '</tr></thead>';
                var pendRowHtml = function (p) {
                    var hasPct = p.pct !== null && p.pct !== undefined;
                    var tone = !hasPct ? '' : p.pct >= 75 ? 'is-ok' : p.pct > 0 ? 'is-warn' : 'is-bad';
                    return '<tr><td>' + esc(p.name) + '</td><td>' + esc(p.subject || '—') + '</td>' +
                        (hasStatus ? '<td class="' + (p.failed ? 'is-bad' : '') + '">' + esc(p.statusLabel || '—') + '</td>' : '') +
                        '<td class="rp-td-num ' + tone + '">' + (hasPct ? esc(p.pct) + '%' : '—') + '</td></tr>';
                };
                // Linha com nome longo ou situação quebra em duas; a folha é
                // fechada pela altura medida de cada linha, não por contagem.
                await ensureFontsLoaded();
                var pendMeasure = withMeasureBody(function (body) {
                    body.innerHTML = '<table class="rp-table">' + pendHead + '<tbody>' + data.pending.map(pendRowHtml).join('') + '</tbody></table>';
                    return {
                        head: body.querySelector('thead').getBoundingClientRect().height,
                        rows: Array.prototype.map.call(body.querySelectorAll('tbody tr'), function (tr) {
                            return { height: tr.getBoundingClientRect().height, gap: 0 };
                        })
                    };
                });
                var pendPages = paginateMeasured(data.pending, pendMeasure.rows, MEASURED_BUDGET - pendMeasure.head);
                pendPages.forEach(function (page, pageIndex) {
                    push(function (i, t) {
                        return slideHtml(data, i, t, {
                            eyebrow: 'Cursos pendentes' + (pendPages.length > 1 ? ' (' + (pageIndex + 1) + '/' + pendPages.length + ')' : ''),
                            title: 'O que ainda falta concluir',
                            sub: 'Cursos que terminaram o período reprovados e cursos do público-alvo ainda não aprovados',
                            body: '<table class="rp-table">' + pendHead + '<tbody>' + page.map(pendRowHtml).join('') + '</tbody></table>'
                        });
                    });
                });
            }
        }

        // Diagnóstico e plano de ação
        push(function (i, t) {
            var actions = actionPlan(data);
            return slideHtml(data, i, t, {
                eyebrow: 'Diagnóstico e plano de ação',
                title: 'Prioridades para o próximo ciclo',
                sub: esc(data.colab.fullName) + ' · ' + esc(data.categoryName),
                body: actions.map(function (action, idx) {
                    return '<div class="rp-action">' +
                        '<div class="rp-action-num">' + (idx + 1) + '</div>' +
                        '<div><div class="rp-action-title">' + esc(action.title) + '</div>' +
                        '<div class="rp-action-text">' + esc(action.text) + '</div></div>' +
                        '</div>';
                }).join('') +
                    '<div class="rp-closing">' + closingLine(data) + '</div>'
            });
        });

        var total = slides.length;
        return slides.map(function (builder, index) { return builder(index + 1, total); });
    }

    // ─── Captura e PDF ───

    function waitForImages(container) {
        var images = Array.prototype.slice.call(container.querySelectorAll('img'));
        return Promise.all(images.map(function (img) {
            if (img.complete) return Promise.resolve();
            return new Promise(function (resolve) {
                var timer = setTimeout(resolve, 8000);
                var done = function () { clearTimeout(timer); resolve(); };
                img.addEventListener('load', done, { once: true });
                img.addEventListener('error', done, { once: true });
            });
        }));
    }

    async function ensureFontsLoaded() {
        if (!document.fonts) return;
        try {
            await Promise.all([
                document.fonts.load('800 44px "Inter"'),
                document.fonts.load('700 28px "Inter"'),
                document.fonts.load('400 13px "Inter"')
            ]);
            await document.fonts.ready;
        } catch (error) { /* a fonte de sistema resolve a renderização */ }
    }

    // O palco fica com visibility:hidden na página real; dentro do clone do
    // html2canvas ele precisa voltar a ser visível, senão a folha sai branca.
    function sanitizeClone(clonedDoc) {
        clonedDoc.querySelectorAll('.report-stage').forEach(function (stage) {
            stage.classList.add('is-capturing');
        });
    }

    function captureSlide(el) {
        return window.html2canvas(el, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            width: PAGE_W,
            height: PAGE_H,
            windowWidth: PAGE_W,
            windowHeight: PAGE_H,
            scrollX: 0,
            scrollY: 0,
            onclone: sanitizeClone
        });
    }

    async function download(data) {
        try {
            if (U.loadVendor) await U.loadVendor('pdf');
        } catch (error) {
            U.showWarning?.('Não foi possível carregar a biblioteca de PDF. Verifique sua conexão e tente novamente.');
            return false;
        }
        if (!window.jspdf?.jsPDF || !window.html2canvas) {
            U.showWarning?.('Biblioteca de PDF não carregada. Recarregue a página e tente novamente.');
            return false;
        }

        U.Certificate?.showOverlay?.({
            icon: 'fa-file-pdf',
            title: 'Gerando relatório',
            hint: 'Aguarde, estamos montando o PDF de ' + data.colab.fullName + '...'
        });

        var stage = document.createElement('div');
        stage.className = 'report-stage';
        document.body.appendChild(stage);

        try {
            var slides = await buildSlides(data);
            var jsPDF = window.jspdf.jsPDF;
            var pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [PAGE_W, PAGE_H] });

            // Uma folha por vez no palco: com todas empilhadas, só a primeira
            // ficaria dentro da janela de captura e as demais sairiam cortadas.
            for (var i = 0; i < slides.length; i++) {
                stage.innerHTML = slides[i];
                var slideEl = stage.querySelector('.rp-slide');
                await waitForImages(stage);
                if (i === 0) await ensureFontsLoaded();
                var canvas = await captureSlide(slideEl);
                if (!canvas || !canvas.width || !canvas.height) throw new Error('folha ' + (i + 1) + ' renderizada com dimensão zero');
                if (i > 0) pdf.addPage([PAGE_W, PAGE_H], 'landscape');
                pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, PAGE_W, PAGE_H);
            }

            pdf.save(data.filename);
            return true;
        } catch (error) {
            console.error('[relatório] falha ao gerar o PDF:', error);
            U.showWarning?.('Erro ao gerar o relatório: ' + (error?.message || error));
            return false;
        } finally {
            stage.remove();
            U.Certificate?.hideOverlay?.();
        }
    }

    // `buildSlides` fica exposto para conferir o layout das folhas sem gerar
    // PDF (útil para ajustar o que cabe em 960x540 sem depender de login).
    U.UserPdfReport = { download: download, buildSlides: buildSlides };
})();
