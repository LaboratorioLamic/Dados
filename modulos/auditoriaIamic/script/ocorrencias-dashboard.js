// =========================================================================
//  DASHBOARD DE OCORRÊNCIAS — KPIs, gráficos e filtros
//  Depende de: Chart.js, ocorrencias.js (window.ocorrencias, window.dashOcTipoId,
//              window.ocDateFilter, window.ocSetorFilter, window.ocColabList)
// =========================================================================
(function () {
    'use strict';

    // ── Estado local do dashboard ────────────────────────────────────────
    var dashOcCatFilter = '';       // nome da categoria selecionada ou ''
    var dashOcMotivoFilter = '';    // nome do motivo selecionado ou ''
    var dashOcColabFilter = '';     // nome do colaborador selecionado ou ''

    // Chart.js instances (para destruir antes de re-renderizar)
    var charts = {};

    var MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    // Paleta de cores para gráficos
    var PALETTE = [
        '#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626',
        '#0891b2', '#9333ea', '#16a34a', '#ca8a04', '#b91c1c',
        '#0369a1', '#6d28d9', '#047857', '#b45309', '#991b1b'
    ];

    // ── Helpers ─────────────────────────────────────────────────────────
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function getTipos() {
        if (typeof masterLists === 'undefined' || !masterLists) return [];
        return Array.isArray(masterLists.ncTipos) ? masterLists.ncTipos : [];
    }

    function getCategoriasForTipo(tipoId) {
        if (typeof masterLists === 'undefined' || !masterLists) return [];
        var nc = masterLists.ncCategorias;
        if (!nc || typeof nc !== 'object') return [];
        if (tipoId) return Array.isArray(nc[tipoId]) ? nc[tipoId] : [];
        // Sem tipo selecionado: apenas categorias dos tipos que o usuário pode visualizar
        var allowedTipos = (typeof window.userAllowedTiposOc === 'function') ? window.userAllowedTiposOc() : null;
        var all = [];
        Object.keys(nc).forEach(function (tid) {
            if (allowedTipos && !allowedTipos.includes(tid)) return;
            var arr = nc[tid];
            if (Array.isArray(arr)) all = all.concat(arr);
        });
        return all;
    }

    function getMotivosForCat(catId) {
        if (!catId || typeof masterLists === 'undefined' || !masterLists) return [];
        var nm = masterLists.ncMotivos;
        if (!nm || typeof nm !== 'object') return [];
        return Array.isArray(nm[catId]) ? nm[catId] : [];
    }

    function catObjByName(name, tipoId) {
        var cats = getCategoriasForTipo(tipoId || null);
        var n = String(name || '').trim().toLowerCase();
        return cats.find(function (c) { return String(c.name || '').trim().toLowerCase() === n; }) || null;
    }

    // ── Dados filtrados ──────────────────────────────────────────────────

    // Retorna o ano de referência do filtro de data (ou ano atual se 'all')
    function getRefYear() {
        var df = window.ocDateFilter;
        if (df && df.year && df.type !== 'all') return df.year;
        return new Date().getFullYear();
    }

    // Aplica filtros comuns: tipo, categoria, motivo, colaborador, setor
    function applyCommonFilters(arr, skipSetor) {
        var allowedTipos = (typeof window.userAllowedTiposOc === 'function') ? window.userAllowedTiposOc() : null;
        if (allowedTipos) arr = arr.filter(function (o) { return allowedTipos.includes(o.tipoId); });

        var tipoId = typeof window.dashOcTipoId !== 'undefined' ? window.dashOcTipoId : null;
        if (tipoId) arr = arr.filter(function (o) { return o.tipoId === tipoId; });

        if (dashOcCatFilter) {
            var cf = dashOcCatFilter.trim().toLowerCase();
            arr = arr.filter(function (o) { return String(o.categoria || '').trim().toLowerCase() === cf; });
        }
        if (dashOcMotivoFilter) {
            var mf = dashOcMotivoFilter.trim().toLowerCase();
            arr = arr.filter(function (o) { return String(o.motivo || '').trim().toLowerCase() === mf; });
        }
        if (dashOcColabFilter) {
            var colF = dashOcColabFilter.trim().toLowerCase();
            arr = arr.filter(function (o) { return String(o.colaborador || '').trim().toLowerCase() === colF; });
        }

        // Filtro de setor global
        var setorFilter = window.ocSetorFilter;
        if (!skipSetor && Array.isArray(setorFilter) && setorFilter.length) {
            var setSet = setorFilter.map(function (s) { return s.trim().toLowerCase(); });
            arr = arr.filter(function (o) { return setorMatchesAnyCI(o.setor, setSet); });
        }

        return arr;
    }

    // Setores presentes nos dados do dashboard, respeitando os demais filtros ativos
    // (tipo, categoria, motivo, colaborador, data) mas ignorando o próprio filtro de setor.
    window.getOcDashAvailableSetores = function () {
        var arr = (window.ocorrencias || []).filter(function (o) { return o && !o.deleted; });
        arr = applyCommonFilters(arr, true);

        var df = window.ocDateFilter;
        if (df && df.type !== 'all') {
            var year = getRefYear();
            arr = arr.filter(function (o) {
                return o.data && parseInt(String(o.data).split('-')[0], 10) === year;
            });
        } else {
            var now = new Date();
            var cutoff = new Date(now.getFullYear(), now.getMonth() - 11, 1);
            var cutoffStr = cutoff.getFullYear() + '-' + String(cutoff.getMonth() + 1).padStart(2, '0') + '-01';
            arr = arr.filter(function (o) { return o.data && o.data >= cutoffStr; });
        }

        var set = {};
        arr.forEach(function (o) {
            setorArr(o.setor).forEach(function (s) { set[s] = true; });
        });
        return Object.keys(set);
    };

    // Filtragem por ano/últimos 12 meses — usada por TODOS os gráficos do dashboard.
    // - filtro 'all': últimos 12 meses a partir de hoje
    // - qualquer outro filtro: filtra pelo ano de referência (month/custom extraem o ano)
    function getOcDashFiltered() {
        var arr = (window.ocorrencias || []).filter(function (o) { return o && !o.deleted; });
        arr = applyCommonFilters(arr);

        var df = window.ocDateFilter;
        if (!df || df.type === 'all') {
            // Últimos 12 meses
            var now = new Date();
            var cutoff = new Date(now.getFullYear(), now.getMonth() - 11, 1);
            var cutoffStr = cutoff.getFullYear() + '-' +
                String(cutoff.getMonth() + 1).padStart(2, '0') + '-01';
            arr = arr.filter(function (o) { return o.data && o.data >= cutoffStr; });
        } else {
            var year = getRefYear();
            arr = arr.filter(function (o) {
                return o.data && parseInt(String(o.data).split('-')[0], 10) === year;
            });
        }

        return arr;
    }

    // Alias — gráfico de linha e KPIs usam o mesmo conjunto de dados
    function getOcDashYearFiltered() {
        return getOcDashFiltered();
    }

    // Filtragem precisa pelo filtro de data ativo (respeita mês/intervalo, não só o ano).
    // Usada pelos gráficos que não são de tendência mensal: categoria, motivos, setores e ranking.
    function getOcDashPreciseFiltered() {
        var arr = (window.ocorrencias || []).filter(function (o) { return o && !o.deleted; });
        arr = applyCommonFilters(arr);

        var df = window.ocDateFilter;
        if (!df || df.type === 'all') {
            var now = new Date();
            var cutoff = new Date(now.getFullYear(), now.getMonth() - 11, 1);
            var cutoffStr = cutoff.getFullYear() + '-' +
                String(cutoff.getMonth() + 1).padStart(2, '0') + '-01';
            arr = arr.filter(function (o) { return o.data && o.data >= cutoffStr; });
        } else {
            arr = arr.filter(function (o) { return dateMatchesDash(o.data, df); });
        }

        return arr;
    }

    function dateMatchesDash(dateStr, f) {
        if (!dateStr) return false;
        if (f.type === 'month') {
            var p = String(dateStr).split('-');
            return parseInt(p[0], 10) === f.year && (parseInt(p[1], 10) - 1) === f.month;
        }
        if (f.type === 'year') {
            return parseInt(String(dateStr).split('-')[0], 10) === f.year;
        }
        if (f.type === 'custom') {
            if (f.ini && dateStr < f.ini) return false;
            if (f.fim && dateStr > f.fim) return false;
            return true;
        }
        return true;
    }

    // ── Agrupa por mês (chave YYYY-MM) ──────────────────────────────────
    function groupByMonth(arr) {
        var map = {};
        arr.forEach(function (o) {
            var d = String(o.data || '');
            if (!d) return;
            var key = d.slice(0, 7); // YYYY-MM
            map[key] = (map[key] || 0) + 1;
        });
        return map;
    }

    // ── KPIs ─────────────────────────────────────────────────────────────
    function computeKPIs(arr, totalOverride) {
        var byMonth = groupByMonth(arr);
        var months = Object.keys(byMonth).sort();
        var counts = months.map(function (k) { return byMonth[k]; });

        var total = (totalOverride !== undefined) ? totalOverride : arr.length;
        var media = months.length ? (total / months.length) : 0;

        // Tendência: regressão linear sobre os últimos 12 meses com dados
        // Retorna a variação % media mensal projetada pelo slope
        var tendStr = '—';
        var tendUp = null; // true = up, false = down, null = neutral
        var tendSub = 'últimos 12 meses';
        var window12 = months.slice(-12);
        var counts12 = window12.map(function (k) { return byMonth[k]; });
        if (window12.length >= 2) {
            var n12 = counts12.length;
            var sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
            for (var i = 0; i < n12; i++) {
                sumX += i; sumY += counts12[i];
                sumXY += i * counts12[i]; sumX2 += i * i;
            }
            var denom = (n12 * sumX2 - sumX * sumX);
            if (denom !== 0) {
                var slope = (n12 * sumXY - sumX * sumY) / denom;
                var meanY = sumY / n12;
                if (meanY > 0) {
                    // slope mensal como % da média
                    var pct = (slope / meanY) * 100;
                    tendStr = (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
                    tendUp = pct >= 0;
                } else if (slope > 0) {
                    tendStr = '+∞%';
                    tendUp = true;
                }
            }
            if (window12.length < 12) tendSub = 'últimos ' + window12.length + ' meses';
        }

        // Maior e menor mês
        var maiorMes = '—', menorMes = '—';
        var maiorMesSub = '', menorMesSub = '';
        if (months.length) {
            var maxI = counts.indexOf(Math.max.apply(null, counts));
            var minI = counts.indexOf(Math.min.apply(null, counts));
            var pctMax = total ? ((counts[maxI] / total) * 100).toFixed(1) : 0;
            var pctMin = total ? ((counts[minI] / total) * 100).toFixed(1) : 0;
            maiorMes = formatMonthKey(months[maxI]);
            maiorMesSub = counts[maxI] + ' ocorrências · ' + pctMax + '% do total';
            menorMes = formatMonthKey(months[minI]);
            menorMesSub = counts[minI] + ' ocorrências · ' + pctMin + '% do total';
        }

        return { total: total, media: media, tendStr: tendStr, tendUp: tendUp, tendSub: tendSub, maiorMes: maiorMes, maiorMesSub: maiorMesSub, menorMes: menorMes, menorMesSub: menorMesSub, byMonth: byMonth, months: months, counts: counts };
    }

    function formatMonthKey(key) {
        if (!key) return '—';
        var p = key.split('-');
        var m = parseInt(p[1], 10) - 1;
        return (MONTHS[m] || p[1]) + '/' + p[0];
    }

    // ── Renderiza KPI cards ───────────────────────────────────────────────
    function renderKPIs(kpis) {
        var row = document.getElementById('ocDashKpiRow');
        if (!row) return;

        var isDarkPre = document.body.classList.contains('dark-mode');
        var tendIconColorUp   = isDarkPre ? '#4ade80' : '#16a34a';
        var tendIconColorDown = isDarkPre ? '#f87171' : '#dc2626';
        var tendIconColorFlat = isDarkPre ? '#64748b' : '#94a3b8';
        var tendIcon = kpis.tendUp === true ? '<i class="fas fa-arrow-trend-up" style="color:' + tendIconColorUp + ';"></i>' :
                       kpis.tendUp === false ? '<i class="fas fa-arrow-trend-down" style="color:' + tendIconColorDown + ';"></i>' :
                       '<i class="fas fa-minus" style="color:' + tendIconColorFlat + ';"></i>';
        var tendColor = kpis.tendUp === true ? '#16a34a' : kpis.tendUp === false ? '#dc2626' : '#94a3b8';

        var isDark = document.body.classList.contains('dark-mode');
        var tendValueColor = isDark
            ? (kpis.tendUp === true ? '#4ade80' : kpis.tendUp === false ? '#f87171' : '#64748b')
            : tendColor;

        row.innerHTML =
            kpiCard('fa-triangle-exclamation', 'Total', kpis.total, '', '#2563eb', '#eff6ff') +
            kpiCard('fa-chart-line', 'Média / mês', kpis.media.toFixed(1), 'apenas meses com dados', '#7c3aed', '#f5f3ff') +
            '<div class="oc-dash-kpi">' +
                '<div class="oc-dash-kpi-icon" style="' + kpiIconStyle('#d97706', '#fffbeb') + '"><i class="fas fa-bolt"></i></div>' +
                '<div class="oc-dash-kpi-body">' +
                    '<div class="oc-dash-kpi-label">Tendência</div>' +
                    '<div class="oc-dash-kpi-value" style="color:' + tendValueColor + ';">' + kpis.tendStr + ' ' + tendIcon + '</div>' +
                    '<div class="oc-dash-kpi-sub">' + (kpis.tendSub || 'últimos 12 meses') + '</div>' +
                '</div>' +
            '</div>' +
            kpiCard('fa-arrow-up', 'Maior mês', kpis.maiorMes, kpis.maiorMesSub, '#059669', '#f0fdf4') +
            kpiCard('fa-arrow-down', 'Menor mês', kpis.menorMes, kpis.menorMesSub, '#dc2626', '#fef2f2');
    }

    function kpiIconStyle(color, bg) {
        if (document.body.classList.contains('dark-mode')) {
            var darkBg = {
                '#eff6ff': 'rgba(37,99,235,0.18)',
                '#f5f3ff': 'rgba(124,58,237,0.18)',
                '#fffbeb': 'rgba(217,119,6,0.18)',
                '#f0fdf4': 'rgba(5,150,105,0.18)',
                '#fef2f2': 'rgba(220,38,38,0.18)',
            };
            var darkColor = {
                '#2563eb': '#60a5fa',
                '#7c3aed': '#c084fc',
                '#d97706': '#fbbf24',
                '#059669': '#34d399',
                '#dc2626': '#f87171',
            };
            return 'color:' + (darkColor[color] || color) + ';background:' + (darkBg[bg] || 'rgba(100,116,139,0.15)') + ';';
        }
        return 'color:' + color + ';background:' + bg + ';';
    }

    function kpiCard(icon, label, value, sub, color, bg) {
        return '<div class="oc-dash-kpi">' +
            '<div class="oc-dash-kpi-icon" style="' + kpiIconStyle(color, bg) + '"><i class="fas ' + icon + '"></i></div>' +
            '<div class="oc-dash-kpi-body">' +
                '<div class="oc-dash-kpi-label">' + esc(label) + '</div>' +
                '<div class="oc-dash-kpi-value">' + esc(String(value)) + '</div>' +
                (sub ? '<div class="oc-dash-kpi-sub">' + esc(sub) + '</div>' : '') +
            '</div>' +
        '</div>';
    }

    // ── Destroy all charts ───────────────────────────────────────────────
    function destroyChart(key) {
        if (charts[key]) { charts[key].destroy(); delete charts[key]; }
    }
    function destroyAllCharts() {
        Object.keys(charts).forEach(destroyChart);
    }

    // Mostra estado vazio sem destruir o canvas
    function showEmpty(canvasId, icon, msg) {
        var canvas = document.getElementById(canvasId);
        if (!canvas) return;
        var wrap = canvas.parentElement;
        canvas.style.display = 'none';
        var existing = wrap.querySelector('.oc-dash-empty-overlay');
        if (!existing) {
            var div = document.createElement('div');
            div.className = 'oc-dash-empty-overlay oc-dash-empty';
            wrap.appendChild(div);
            existing = div;
        }
        existing.innerHTML = '<i class="fas ' + icon + '"></i><p>' + msg + '</p>';
        existing.style.display = 'flex';
    }
    function hideEmpty(canvasId) {
        var canvas = document.getElementById(canvasId);
        if (!canvas) return;
        canvas.style.display = '';
        var overlay = canvas.parentElement.querySelector('.oc-dash-empty-overlay');
        if (overlay) overlay.style.display = 'none';
    }

    // ── Chart: Linha geral (com linha de tendência e média) ──────────────
    var lineSubtab = 'geral'; // 'geral' | 'categorias' | 'setores'

    function renderLineChart(arr, kpis) {
        destroyChart('line');
        var ctx = document.getElementById('ocDashLineChart');
        if (!ctx) return;

        if (lineSubtab === 'geral') {
            renderLineChartGeral(ctx, kpis);
        } else if (lineSubtab === 'setores') {
            renderLineChartSetores(ctx, arr);
        } else {
            renderLineChartCategorias(ctx, arr);
        }
    }

    function renderLineChartGeral(ctx, kpis) {
        var labels = kpis.months.map(formatMonthKey);
        var data = kpis.counts;
        var mediaVal = kpis.media;

        // Linha de tendência linear simples (regressão linear)
        var n = data.length;
        var trendData = [];
        if (n >= 2) {
            var sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
            for (var i = 0; i < n; i++) { sumX += i; sumY += data[i]; sumXY += i * data[i]; sumX2 += i * i; }
            var slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
            var intercept = (sumY - slope * sumX) / n;
            for (var j = 0; j < n; j++) trendData.push(parseFloat((intercept + slope * j).toFixed(2)));
        }

        var datasets = [
            {
                label: 'Ocorrências',
                data: data,
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37,99,235,0.10)',
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#2563eb',
                pointRadius: 5,
                pointHoverRadius: 7,
                borderWidth: 2.5,
                order: 1
            },
            {
                label: 'Média',
                data: data.map(function () { return parseFloat(mediaVal.toFixed(2)); }),
                borderColor: '#f59e0b',
                borderDash: [6, 4],
                borderWidth: 2,
                pointRadius: 0,
                fill: false,
                tension: 0,
                order: 2
            }
        ];
        if (trendData.length) {
            datasets.push({
                label: 'Tendência',
                data: trendData,
                borderColor: '#7c3aed',
                borderDash: [4, 4],
                borderWidth: 2,
                pointRadius: 0,
                fill: false,
                tension: 0,
                order: 3
            });
        }

        charts['line'] = new Chart(ctx, {
            type: 'line',
            data: { labels: labels, datasets: datasets },
            options: lineChartOptions('Ocorrências por mês')
        });
    }

    function renderLineChartCategorias(ctx, arr) {
        // Agrupa por mês e categoria
        var monthSet = {};
        var catSet = {};
        arr.forEach(function (o) {
            var d = String(o.data || '');
            if (!d) return;
            var key = d.slice(0, 7);
            var cat = o.categoria || '(sem categoria)';
            monthSet[key] = true;
            catSet[cat] = true;
        });
        var months = Object.keys(monthSet).sort();
        var cats = Object.keys(catSet).sort();

        // Conta
        var dataMap = {};
        arr.forEach(function (o) {
            var d = String(o.data || '');
            if (!d) return;
            var key = d.slice(0, 7);
            var cat = o.categoria || '(sem categoria)';
            if (!dataMap[cat]) dataMap[cat] = {};
            dataMap[cat][key] = (dataMap[cat][key] || 0) + 1;
        });

        var datasets = cats.map(function (cat, i) {
            return {
                label: cat,
                data: months.map(function (m) { return (dataMap[cat] && dataMap[cat][m]) || 0; }),
                borderColor: PALETTE[i % PALETTE.length],
                backgroundColor: PALETTE[i % PALETTE.length] + '22',
                fill: false,
                tension: 0.4,
                pointRadius: 4,
                pointHoverRadius: 6,
                borderWidth: 2
            };
        });

        charts['line'] = new Chart(ctx, {
            type: 'line',
            data: { labels: months.map(formatMonthKey), datasets: datasets },
            options: lineChartOptions('Por categoria')
        });
    }

    // Setores da ocorrência (multi-valor) — conta a ocorrência em cada um deles
    function _ocSetoresOf(o) {
        var list = setorArr(o.setor);
        return list.length ? list : ['(sem setor)'];
    }

    function renderLineChartSetores(ctx, arr) {
        var monthSet = {};
        var setorSet = {};
        arr.forEach(function (o) {
            var d = String(o.data || '');
            if (!d) return;
            var key = d.slice(0, 7);
            monthSet[key] = true;
            _ocSetoresOf(o).forEach(function (setor) { setorSet[setor] = true; });
        });
        var months = Object.keys(monthSet).sort();
        var setores = Object.keys(setorSet).sort();

        var dataMap = {};
        arr.forEach(function (o) {
            var d = String(o.data || '');
            if (!d) return;
            var key = d.slice(0, 7);
            _ocSetoresOf(o).forEach(function (setor) {
                if (!dataMap[setor]) dataMap[setor] = {};
                dataMap[setor][key] = (dataMap[setor][key] || 0) + 1;
            });
        });

        // Remove setores sem dados em nenhum mês visível
        setores = setores.filter(function (setor) {
            return months.some(function (m) { return dataMap[setor] && dataMap[setor][m]; });
        });

        var datasets = setores.map(function (setor, i) {
            return {
                label: setor,
                data: months.map(function (m) { return (dataMap[setor] && dataMap[setor][m]) || 0; }),
                borderColor: PALETTE[i % PALETTE.length],
                backgroundColor: PALETTE[i % PALETTE.length] + '22',
                fill: false,
                tension: 0.4,
                pointRadius: 4,
                pointHoverRadius: 6,
                borderWidth: 2
            };
        });

        charts['line'] = new Chart(ctx, {
            type: 'line',
            data: { labels: months.map(formatMonthKey), datasets: datasets },
            options: lineChartOptions('Por setor')
        });
    }

    function lineChartOptions(title) {
        var isDark = document.body.classList.contains('dark-mode');
        var legendCol = isDark ? '#94a3b8' : '#475569';
        var tickCol   = isDark ? '#64748b' : '#64748b';
        var gridCol   = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
        return {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    position: 'top',
                    labels: { usePointStyle: true, pointStyle: 'circle', font: { size: 12 }, color: legendCol }
                },
                tooltip: { backgroundColor: '#1e293b', titleColor: '#f8fafc', bodyColor: '#cbd5e1', cornerRadius: 8 }
            },
            scales: {
                x: { grid: { color: gridCol }, ticks: { color: tickCol, font: { size: 12 } } },
                y: { beginAtZero: true, grid: { color: gridCol }, ticks: { color: tickCol, font: { size: 12 }, precision: 0 } }
            },
            animation: { duration: 600, easing: 'easeInOutQuart' }
        };
    }

    // ── Chart: Donut por categoria ────────────────────────────────────────
    function renderDonutChart(arr) {
        destroyChart('donut');
        var ctx = document.getElementById('ocDashDonutChart');
        if (!ctx) return;

        var counts = {};
        arr.forEach(function (o) {
            var cat = o.categoria || '(sem categoria)';
            counts[cat] = (counts[cat] || 0) + 1;
        });

        var entries = Object.entries(counts).sort(function (a, b) { return b[1] - a[1]; });
        var labels = entries.map(function (e) { return e[0]; });
        var data = entries.map(function (e) { return e[1]; });
        var colors = labels.map(function (_, i) { return PALETTE[i % PALETTE.length]; });

        if (!data.length) {
            showEmpty('ocDashDonutChart', 'fa-chart-pie', 'Sem dados');
            return;
        }
        hideEmpty('ocDashDonutChart');
        var isDark = document.body.classList.contains('dark-mode');
        var borderCol = isDark ? '#1e293b' : '#fff';
        var legendCol = isDark ? '#94a3b8' : '#475569';
        charts['donut'] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{ data: data, backgroundColor: colors, hoverOffset: 8, borderWidth: 2, borderColor: borderCol }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '62%',
                plugins: {
                    legend: { position: 'right', labels: { usePointStyle: true, pointStyle: 'circle', font: { size: 12 }, color: legendCol, boxWidth: 10 } },
                    tooltip: {
                        backgroundColor: '#1e293b', titleColor: '#f8fafc', bodyColor: '#cbd5e1', cornerRadius: 8,
                        callbacks: {
                            label: function (c) {
                                var total = c.dataset.data.reduce(function (a, b) { return a + b; }, 0);
                                var pct = total ? ((c.parsed / total) * 100).toFixed(1) : 0;
                                return ' ' + c.label + ': ' + c.parsed + ' (' + pct + '%)';
                            }
                        }
                    }
                },
                animation: { duration: 700, easing: 'easeInOutQuart' }
            }
        });
    }

    // ── Tabela: ranking de motivos ─────────────────────────────────────────
    function renderMotivosTable(arr) {
        var tbl = document.getElementById('ocDashMotivosBody');
        if (!tbl) return;

        var counts = {};
        arr.forEach(function (o) {
            var m = o.motivo || '(sem motivo)';
            counts[m] = (counts[m] || 0) + 1;
        });

        renderRankingTable(tbl, counts, arr.length);
    }

    // ── Tabela: ranking de setores ──────────────────────────────────────────
    function renderSetoresTable(arr) {
        var tbl = document.getElementById('ocDashSetoresBody');
        if (!tbl) return;

        var counts = {};
        arr.forEach(function (o) {
            _ocSetoresOf(o).forEach(function (s) { counts[s] = (counts[s] || 0) + 1; });
        });

        renderRankingTable(tbl, counts, arr.length);
    }

    function renderRankingTable(tbl, counts, total) {
        var entries = Object.entries(counts).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 20);

        if (!entries.length) {
            tbl.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:24px;">Sem dados</td></tr>';
            return;
        }

        var max = entries[0][1];
        tbl.innerHTML = entries.map(function (e, i) {
            var pct = total ? ((e[1] / total) * 100).toFixed(1) : 0;
            var barW = max ? ((e[1] / max) * 100).toFixed(1) : 0;
            return '<tr>' +
                '<td style="font-weight:600;color:var(--text-muted);text-align:center;">' + (i + 1) + '</td>' +
                '<td>' +
                    '<div style="font-weight:600;color:var(--text);font-size:13px;">' + esc(e[0]) + '</div>' +
                    '<div style="margin-top:4px;height:5px;background:var(--surface-muted);border-radius:3px;">' +
                        '<div style="height:100%;width:' + barW + '%;background:var(--grad-accent);border-radius:3px;transition:width 0.5s;"></div>' +
                    '</div>' +
                '</td>' +
                '<td style="text-align:right;">' +
                    '<span style="font-weight:700;color:var(--text);">' + e[1] + '</span>' +
                    '<span style="color:var(--text-muted);font-size:12px;margin-left:4px;">(' + pct + '%)</span>' +
                '</td>' +
            '</tr>';
        }).join('');
    }

    // ── Chart: Waterfall — evolução mês a mês ─────────────────────────────
    function renderWaterfallChart(kpis) {
        destroyChart('waterfall');
        var ctx = document.getElementById('ocDashWaterfallChart');
        if (!ctx) return;

        var months = kpis.months;
        var counts = kpis.counts;

        if (months.length < 2) {
            showEmpty('ocDashWaterfallChart', 'fa-chart-bar', 'Dados insuficientes (mín. 2 meses)');
            return;
        }
        hideEmpty('ocDashWaterfallChart');

        var labels = [];
        var colors = [];
        var deltas = [];
        var pcts = [];
        var subtotals = [];
        var bases = [];
        var base = counts[0];
        for (var i = 1; i < months.length; i++) {
            var prev = counts[i - 1];
            var curr = counts[i];
            var delta = curr - prev;
            // Variação % apenas informativa (não acumulada), pois % relativo não é somável de forma justa
            var pct = prev > 0 ? parseFloat(((delta / prev) * 100).toFixed(1)) : (curr > 0 ? 100 : 0);
            labels.push(formatMonthKey(months[i - 1]) + ' → ' + formatMonthKey(months[i]));
            bases.push(base);
            deltas.push(delta);
            pcts.push(pct);
            base += delta;
            subtotals.push(base);
            colors.push(delta > 0 ? 'rgba(220,38,38,0.82)' : (delta < 0 ? 'rgba(22,163,74,0.82)' : 'rgba(148,163,184,0.82)'));
        }

        // Garante altura mínima visível quando não há variação (delta = 0),
        // já que Chart.js não renderiza barras com [base, base] (altura zero)
        var maxVal = Math.max.apply(null, counts.concat(subtotals));
        var minBarHeight = maxVal * 0.02;
        var data = bases.map(function (b, i) {
            return (deltas[i] === 0) ? [b, b + minBarHeight] : [b, b + deltas[i]];
        });

        charts['waterfall'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Variação',
                    data: data,
                    backgroundColor: colors,
                    borderColor: colors.map(function (c) { return c.replace('0.82', '1'); }),
                    borderWidth: 1.5,
                    borderRadius: 5,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1e293b', titleColor: '#f8fafc', bodyColor: '#cbd5e1', cornerRadius: 8,
                        callbacks: {
                            label: function (c) {
                                var delta = deltas[c.dataIndex];
                                var pct = pcts[c.dataIndex];
                                var deltaLabel = ' ' + (delta >= 0 ? '+' : '') + delta + ' ocorrências (' + (pct >= 0 ? '+' : '') + pct + '%)';
                                return [deltaLabel];
                            }
                        }
                    }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 11 } } },
                    y: {
                        grid: { color: 'rgba(0,0,0,0.06)' },
                        ticks: {
                            color: '#64748b', font: { size: 12 }
                        }
                    }
                },
                animation: { duration: 600, easing: 'easeInOutQuart' }
            }
        });
    }

    // ── Ranking de colaboradores ──────────────────────────────────────────
    function renderRanking(arr) {
        var tbl = document.getElementById('ocDashRankingBody');
        if (!tbl) return;

        var counts = {};
        arr.forEach(function (o) {
            var c = o.colaborador || '(sem colaborador)';
            counts[c] = (counts[c] || 0) + 1;
        });

        var entries = Object.entries(counts).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 20);
        var total = arr.length;

        if (!entries.length) {
            tbl.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:24px;">Sem dados</td></tr>';
            return;
        }

        var max = entries[0][1];
        tbl.innerHTML = entries.map(function (e, i) {
            var pct = total ? ((e[1] / total) * 100).toFixed(1) : 0;
            var barW = max ? ((e[1] / max) * 100).toFixed(1) : 0;
            return '<tr>' +
                '<td style="font-weight:600;color:var(--text-muted);text-align:center;">' + (i + 1) + '</td>' +
                '<td>' +
                    '<div style="font-weight:600;color:var(--text);font-size:13px;">' + esc(e[0]) + '</div>' +
                    '<div style="margin-top:4px;height:5px;background:var(--surface-muted);border-radius:3px;">' +
                        '<div style="height:100%;width:' + barW + '%;background:var(--grad-accent);border-radius:3px;transition:width 0.5s;"></div>' +
                    '</div>' +
                '</td>' +
                '<td style="text-align:right;">' +
                    '<span style="font-weight:700;color:var(--text);">' + e[1] + '</span>' +
                    '<span style="color:var(--text-muted);font-size:12px;margin-left:4px;">(' + pct + '%)</span>' +
                '</td>' +
            '</tr>';
        }).join('');
    }

    // ── Build HTML structure for dashboard content ────────────────────────
    function buildDashboardHTML() {
        return '' +
            // KPI Row
            '<div class="oc-dash-kpi-row" id="ocDashKpiRow"></div>' +

            // Row 1: Line chart + Donut
            '<div class="oc-dash-charts-row" style="grid-template-columns:1.65fr 1fr;">' +
                '<div class="oc-dash-chart-card">' +
                    '<div class="oc-dash-chart-header">' +
                        '<h3><i class="fas fa-chart-line"></i> Ocorrências ao Longo do Tempo</h3>' +
                        '<div class="oc-dash-line-tabs">' +
                            '<button class="oc-dash-line-tab" id="ocDashLineTabGeral" onclick="ocDashSetLineTab(\'geral\')">Geral</button>' +
                            '<button class="oc-dash-line-tab" id="ocDashLineTabCats" onclick="ocDashSetLineTab(\'categorias\')">Categorias</button>' +
                            '<button class="oc-dash-line-tab" id="ocDashLineTabSetores" onclick="ocDashSetLineTab(\'setores\')">Setores</button>' +
                        '</div>' +
                    '</div>' +
                    '<div class="oc-dash-canvas-wrap" style="height:260px;"><canvas id="ocDashLineChart"></canvas></div>' +
                '</div>' +
                '<div class="oc-dash-chart-card">' +
                    '<div class="oc-dash-chart-header">' +
                        '<h3><i class="fas fa-chart-pie"></i> Por Categoria</h3>' +
                    '</div>' +
                    '<div class="oc-dash-canvas-wrap" style="height:260px;"><canvas id="ocDashDonutChart"></canvas></div>' +
                '</div>' +
            '</div>' +

            // Row 2: Motivos + Setores
            '<div class="oc-dash-charts-row" style="grid-template-columns:1fr 1fr;">' +
                '<div class="oc-dash-chart-card">' +
                    '<div class="oc-dash-chart-header">' +
                        '<h3><i class="fas fa-chart-bar"></i> Motivos de Ocorrência</h3>' +
                    '</div>' +
                    '<div style="overflow-y:auto;max-height:240px;">' +
                        '<table class="oc-dash-ranking-table">' +
                            '<thead><tr>' +
                                '<th style="width:40px;">#</th>' +
                                '<th>Motivo</th>' +
                                '<th style="text-align:right;">Qtd</th>' +
                            '</tr></thead>' +
                            '<tbody id="ocDashMotivosBody"></tbody>' +
                        '</table>' +
                    '</div>' +
                '</div>' +
                '<div class="oc-dash-chart-card">' +
                    '<div class="oc-dash-chart-header">' +
                        '<h3><i class="fas fa-building"></i> Ocorrência por Setor</h3>' +
                    '</div>' +
                    '<div style="overflow-y:auto;max-height:240px;">' +
                        '<table class="oc-dash-ranking-table">' +
                            '<thead><tr>' +
                                '<th style="width:40px;">#</th>' +
                                '<th>Setor</th>' +
                                '<th style="text-align:right;">Qtd</th>' +
                            '</tr></thead>' +
                            '<tbody id="ocDashSetoresBody"></tbody>' +
                        '</table>' +
                    '</div>' +
                '</div>' +
            '</div>' +

            // Row 3: Waterfall + Ranking
            '<div class="oc-dash-charts-row" style="grid-template-columns:1fr 1fr;">' +
                '<div class="oc-dash-chart-card">' +
                    '<div class="oc-dash-chart-header">' +
                        '<h3><i class="fas fa-chart-waterfall"></i> Evolução Mensal (Nº Ocorrências)</h3>' +
                    '</div>' +
                    '<div class="oc-dash-canvas-wrap" style="height:240px;"><canvas id="ocDashWaterfallChart"></canvas></div>' +
                '</div>' +
                '<div class="oc-dash-chart-card">' +
                    '<div class="oc-dash-chart-header">' +
                        '<h3><i class="fas fa-ranking-star"></i> Colaboradores com Mais Ocorrências</h3>' +
                    '</div>' +
                    '<div style="overflow-y:auto;max-height:240px;">' +
                        '<table class="oc-dash-ranking-table">' +
                            '<thead><tr>' +
                                '<th style="width:40px;">#</th>' +
                                '<th>Colaborador</th>' +
                                '<th style="text-align:right;">Qtd</th>' +
                            '</tr></thead>' +
                            '<tbody id="ocDashRankingBody"></tbody>' +
                        '</table>' +
                    '</div>' +
                '</div>' +
            '</div>';
    }

    // ── Render principal ─────────────────────────────────────────────────
    window.renderOcDashboard = function () {
        var container = document.getElementById('dashboardOcContent');
        if (!container) return;

        // Destrói todos os charts antes de recriar o HTML para evitar canvas órfão
        destroyAllCharts();
        container.innerHTML = buildDashboardHTML();

        // Restaura o botão ativo da sub-aba de linha após reconstruir o HTML
        var btnG = document.getElementById('ocDashLineTabGeral');
        var btnC = document.getElementById('ocDashLineTabCats');
        var btnS = document.getElementById('ocDashLineTabSetores');
        if (btnG) btnG.classList.toggle('active', lineSubtab === 'geral');
        if (btnC) btnC.classList.toggle('active', lineSubtab === 'categorias');
        if (btnS) btnS.classList.toggle('active', lineSubtab === 'setores');

        // Dados filtrados por ano (linha do tempo, KPIs maior/menor mês)
        var arrYear = getOcDashYearFiltered();

        // Dados com filtro preciso de data (respeita mês/intervalo, não só o ano)
        var arr = getOcDashPreciseFiltered();

        // Total respeita o filtro preciso; tendência/maior/menor usam a visão anual
        var kpis = computeKPIs(arrYear, arr.length);

        renderKPIs(kpis);
        renderLineChart(arrYear, kpis);
        renderDonutChart(arr);
        renderMotivosTable(arr);
        renderSetoresTable(arr);
        renderWaterfallChart(kpis);
        renderRanking(arr);
        window._ocDashLastKpis = kpis;
    };

    window.ocDashRerender = function () {
        if (window._ocDashLastKpis) renderKPIs(window._ocDashLastKpis);
    };

    // ── Sub-aba da linha (Geral / Categorias / Setores) ──────────────────
    window.ocDashSetLineTab = function (tab) {
        lineSubtab = tab;
        var btnG = document.getElementById('ocDashLineTabGeral');
        var btnC = document.getElementById('ocDashLineTabCats');
        var btnS = document.getElementById('ocDashLineTabSetores');
        if (btnG) btnG.classList.toggle('active', tab === 'geral');
        if (btnC) btnC.classList.toggle('active', tab === 'categorias');
        if (btnS) btnS.classList.toggle('active', tab === 'setores');
        var arr = getOcDashFiltered();
        var kpis = computeKPIs(arr);
        renderLineChart(arr, kpis);
    };

    // ── Filtros: Categoria ────────────────────────────────────────────────
    window.dashOcToggleCatDropdown = function () {
        var dd = document.getElementById('dashOcCatDropdown');
        if (!dd) return;
        var open = dd.classList.contains('open');
        closeAllDashDropdowns();
        if (!open) {
            renderCatDropdown(dd);
            dd.classList.add('open');
        }
    };

    function renderCatDropdown(dd) {
        var tipoId = typeof window.dashOcTipoId !== 'undefined' ? window.dashOcTipoId : null;
        var cats = getCategoriasForTipo(tipoId);
        var html = '<button class="oc-type-option' + (!dashOcCatFilter ? ' active' : '') + '" onclick="dashOcSelectCat(\'\')"><i class="fas fa-border-all"></i> Todas as categorias</button>';
        cats.forEach(function (c) {
            html += '<button class="oc-type-option' + (dashOcCatFilter === c.name ? ' active' : '') + '" onclick="dashOcSelectCat(\'' + c.name.replace(/'/g, "\\'") + '\')">' +
                '<i class="fas fa-tag"></i> ' + esc(c.name) + '</button>';
        });
        if (!cats.length) html += '<div class="oc-type-empty">Nenhuma categoria cadastrada.</div>';
        dd.innerHTML = html;
    }

    window.dashOcSelectCat = function (name) {
        dashOcCatFilter = name;
        dashOcMotivoFilter = '';
        var dd = document.getElementById('dashOcCatDropdown'); if (dd) dd.classList.remove('open');
        updateCatBtnState();
        updateMotivoBtnVisibility();
        window.renderOcDashboard();
    };

    function updateCatBtnState() {
        var btn = document.getElementById('dashOcCatBtn');
        if (btn) btn.classList.toggle('active', !!dashOcCatFilter);
    }

    // ── Filtros: Motivo ───────────────────────────────────────────────────
    window.dashOcToggleMotivoDropdown = function () {
        var dd = document.getElementById('dashOcMotivoDropdown');
        if (!dd) return;
        var open = dd.classList.contains('open');
        closeAllDashDropdowns();
        if (!open) {
            renderMotivoDropdown(dd);
            dd.classList.add('open');
        }
    };

    function renderMotivoDropdown(dd) {
        var tipoId = typeof window.dashOcTipoId !== 'undefined' ? window.dashOcTipoId : null;
        var catObj = catObjByName(dashOcCatFilter, tipoId);
        var motivos = catObj ? getMotivosForCat(catObj.id) : [];
        var html = '<button class="oc-type-option' + (!dashOcMotivoFilter ? ' active' : '') + '" onclick="dashOcSelectMotivo(\'\')"><i class="fas fa-border-all"></i> Todos os motivos</button>';
        motivos.forEach(function (m) {
            html += '<button class="oc-type-option' + (dashOcMotivoFilter === m.name ? ' active' : '') + '" onclick="dashOcSelectMotivo(\'' + m.name.replace(/'/g, "\\'") + '\')">' +
                '<i class="fas fa-circle-dot"></i> ' + esc(m.name) + '</button>';
        });
        if (!motivos.length) html += '<div class="oc-type-empty">Nenhum motivo para esta categoria.</div>';
        dd.innerHTML = html;
    }

    window.dashOcSelectMotivo = function (name) {
        dashOcMotivoFilter = name;
        var dd = document.getElementById('dashOcMotivoDropdown'); if (dd) dd.classList.remove('open');
        var btn = document.getElementById('dashOcMotivoBtn');
        if (btn) btn.classList.toggle('active', !!dashOcMotivoFilter);
        window.renderOcDashboard();
    };

    function updateMotivoBtnVisibility() {
        var wrap = document.getElementById('dashOcMotivoWrap');
        if (wrap) wrap.style.display = dashOcCatFilter ? 'block' : 'none';
    }

    // ── Filtros: Colaborador ──────────────────────────────────────────────
    window.dashOcToggleColabDropdown = function () {
        var dd = document.getElementById('dashOcColabDropdown');
        if (!dd) return;
        var open = dd.classList.contains('open');
        closeAllDashDropdowns();
        if (!open) {
            renderColabDropdown(dd);
            dd.classList.add('open');
        }
    };

    function renderColabDropdown(dd) {
        var list = window.ocColabList || [];
        var html = '<div style="padding:8px;">' +
            '<input class="oc-dash-colab-search" id="ocDashColabSearchInput" type="text" placeholder="Buscar colaborador..." oninput="ocDashColabSearch(this.value)" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:7px;font-size:13px;font-family:inherit;outline:none;">' +
            '</div>' +
            '<div id="ocDashColabList">' + renderColabListItems(list, '') + '</div>';
        dd.innerHTML = html;
        // Focus input
        setTimeout(function () {
            var inp = document.getElementById('ocDashColabSearchInput');
            if (inp) inp.focus();
        }, 50);
    }

    function renderColabListItems(list, query) {
        var q = String(query || '').trim().toLowerCase();
        var filtered = q ? list.filter(function (c) { return c.nome.toLowerCase().indexOf(q) !== -1; }) : list;
        filtered = filtered.slice(0, 60);

        var html = '<button class="oc-type-option' + (!dashOcColabFilter ? ' active' : '') + '" onclick="dashOcSelectColab(\'\')"><i class="fas fa-users"></i> Todos os colaboradores</button>';
        if (!filtered.length && !q) {
            // Pull unique names from data
            var fromData = {};
            (window.ocorrencias || []).forEach(function (o) { if (o && o.colaborador) fromData[o.colaborador] = true; });
            var names = Object.keys(fromData).sort();
            names.slice(0, 60).forEach(function (n) {
                html += '<button class="oc-type-option' + (dashOcColabFilter === n ? ' active' : '') + '" onclick="dashOcSelectColab(\'' + n.replace(/'/g, "\\'") + '\')">' +
                    '<i class="fas fa-user"></i> ' + esc(n) + '</button>';
            });
            if (!names.length) html += '<div class="oc-type-empty">Nenhum colaborador encontrado.</div>';
        } else {
            filtered.forEach(function (c) {
                html += '<button class="oc-type-option' + (dashOcColabFilter === c.nome ? ' active' : '') + '" onclick="dashOcSelectColab(\'' + c.nome.replace(/'/g, "\\'") + '\')">' +
                    '<i class="fas fa-user"></i> ' + esc(c.nome) + (c.setor ? ' <span style="color:var(--text-muted);font-size:12px;">— ' + esc(c.setor) + '</span>' : '') + '</button>';
            });
            if (!filtered.length) html += '<div class="oc-type-empty">Nenhum resultado.</div>';
        }
        return html;
    }

    window.ocDashColabSearch = function (val) {
        var listEl = document.getElementById('ocDashColabList');
        if (!listEl) return;
        var list = window.ocColabList || [];
        // If list empty, build from data
        if (!list.length) {
            var fromData = {};
            (window.ocorrencias || []).forEach(function (o) { if (o && o.colaborador) fromData[o.colaborador] = true; });
            list = Object.keys(fromData).sort().map(function (n) { return { nome: n, setor: '' }; });
        }
        listEl.innerHTML = renderColabListItems(list, val);
    };

    window.dashOcSelectColab = function (name) {
        dashOcColabFilter = name;
        var dd = document.getElementById('dashOcColabDropdown'); if (dd) dd.classList.remove('open');
        var lbl = document.getElementById('dashOcColabLabel');
        if (lbl) lbl.textContent = name || 'Selecionar colaborador';
        var btn = document.getElementById('dashOcColabBtn');
        if (btn) btn.classList.toggle('active', !!dashOcColabFilter);
        var badge = document.getElementById('dashOcColabBadge');
        if (badge) { badge.style.display = name ? 'inline-flex' : 'none'; badge.textContent = name ? '1' : ''; }
        window.renderOcDashboard();
    };

    // ── Clear all dashboard filters ───────────────────────────────────────
    var _origDashOcClearFilters = window.dashOcClearFilters;
    window.dashOcClearFilters = function () {
        dashOcCatFilter = '';
        dashOcMotivoFilter = '';
        dashOcColabFilter = '';
        updateCatBtnState();
        updateMotivoBtnVisibility();
        var lbl = document.getElementById('dashOcColabLabel'); if (lbl) lbl.textContent = 'Selecionar colaborador';
        var btn = document.getElementById('dashOcColabBtn'); if (btn) btn.classList.remove('active');
        var badge = document.getElementById('dashOcColabBadge'); if (badge) badge.style.display = 'none';
        var mBtn = document.getElementById('dashOcMotivoBtn'); if (mBtn) mBtn.classList.remove('active');
        if (typeof _origDashOcClearFilters === 'function') _origDashOcClearFilters();
        // _origDashOcClearFilters will call renderOcDashboard already
    };

    function closeAllDashDropdowns() {
        ['dashOcCatDropdown', 'dashOcMotivoDropdown', 'dashOcColabDropdown'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.classList.remove('open');
        });
    }

    // Close dropdowns on outside click
    document.addEventListener('click', function (e) {
        if (!e.target.closest('#dashOcCatWrap') && !e.target.closest('#dashOcMotivoWrap') &&
            !e.target.closest('#dashOcColabWrap')) {
            closeAllDashDropdowns();
        }
    });

})();
