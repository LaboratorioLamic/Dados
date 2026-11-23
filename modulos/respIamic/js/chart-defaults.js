// Estética global dos gráficos (Chart.js)

// Estética global dos gráficos
if (window.Chart) {
    Chart.defaults.font.family = "'Inter', ui-sans-serif, system-ui, sans-serif";
    Chart.defaults.font.size = 11;
    Chart.defaults.font.weight = '600';
    Chart.defaults.color = '#64748b';
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.boxWidth = 8;
    Chart.defaults.plugins.legend.labels.padding = 14;
    Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(14,22,40,.95)';
    Chart.defaults.plugins.tooltip.padding = 12;
    Chart.defaults.plugins.tooltip.cornerRadius = 10;
    Chart.defaults.plugins.tooltip.titleFont = { weight: '800', size: 11 };
    Chart.defaults.plugins.tooltip.displayColors = false;
    Chart.defaults.borderColor = 'rgba(14,22,40,.07)';
    Chart.defaults.elements.bar.borderRadius = 6;
    Chart.defaults.elements.line.tension = 0.35;
    Chart.defaults.elements.point.radius = 3;
    Chart.defaults.elements.point.hoverRadius = 6;
}

// Rótulo de valor sobre as barras. Ativado por gráfico com
// `options.plugins.rotuloValor = { display: true, formato?: v => texto }`.
if (window.Chart) {
    Chart.register({
        id: 'rotuloValor',
        afterDatasetsDraw(chart, _args, opts) {
            if (!opts || !opts.display) return;
            const { ctx } = chart;
            const horizontal = chart.options.indexAxis === 'y';
            const formato = opts.formato || (v => v);
            ctx.save();
            ctx.font = "800 10px 'Inter', ui-sans-serif, system-ui, sans-serif";
            ctx.fillStyle = opts.cor || '#2563eb';
            chart.data.datasets.forEach((ds, i) => {
                const meta = chart.getDatasetMeta(i);
                if (meta.hidden || meta.type !== 'bar') return;
                meta.data.forEach((el, j) => {
                    const v = ds.data[j];
                    if (v === null || v === undefined) return;
                    const texto = String(formato(v));
                    if (horizontal) {
                        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
                        ctx.fillText(texto, el.x + 6, el.y);
                    } else {
                        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
                        ctx.fillText(texto, el.x, el.y - 4);
                    }
                });
            });
            ctx.restore();
        }
    });
}
