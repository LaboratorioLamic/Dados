// Gráficos nativos do Excel dentro das planilhas exportadas pelo painel.
//
// A SheetJS (e o fork com estilo, xlsx-js-style) escreve células, formatos e
// filtros, mas não tem qualquer suporte a gráfico — nem na versão community
// nem na Pro. A saída dela é um .xlsx, ou seja, um zip de partes XML; então a
// estratégia aqui é pós-processar esse zip: gerar o arquivo normalmente,
// abrir, acrescentar as partes DrawingML do gráfico e fechar de novo.
//
// As partes que entram, por gráfico:
//   xl/charts/chartN.xml              definição do gráfico (séries, eixos, cores)
//   xl/drawings/drawingN.xml          âncora: onde o gráfico fica na planilha
//   xl/drawings/_rels/drawingN.xml.rels   liga a âncora ao gráfico
//   xl/worksheets/_rels/sheetN.xml.rels   liga a planilha ao desenho
// mais um <drawing r:id="..."/> no fim do XML da planilha e os <Override> em
// [Content_Types].xml.
//
// Gráfico nativo (em vez de uma imagem colada) mantém o vínculo com as
// células: quem receber o arquivo pode alterar um número e ver o gráfico
// mudar, ou copiar o gráfico para um slide sem perder qualidade.
(function () {
    var U = window.UniAdmin = window.UniAdmin || {};

    var NS_CHART = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
    var NS_DRAWING_MAIN = 'http://schemas.openxmlformats.org/drawingml/2006/main';
    var NS_SSDRAWING = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';
    var NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    var NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
    var CT_CHART = 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml';
    var CT_DRAWING = 'application/vnd.openxmlformats-officedocument.drawing+xml';

    var enc = new TextEncoder();
    var dec = new TextDecoder('utf-8');

    function esc(text) {
        return String(text == null ? '' : text)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    }

    // Nome de planilha sempre entre aspas simples nas referências: "Gráficos"
    // tem acento e o Excel exige aspas para qualquer nome que não seja
    // puramente alfanumérico. Aspas simples internas dobram, como no Excel.
    function sheetRef(sheetName, range) {
        return "'" + String(sheetName).replace(/'/g, "''") + "'!" + range;
    }

    // <c:strCache>/<c:numCache>: o Excel desenha o gráfico a partir do cache
    // já na abertura, sem precisar recalcular. Sem ele, alguns visualizadores
    // (e o Excel Online) mostram o gráfico vazio até a primeira edição.
    function strCacheXml(values) {
        return '<c:strCache><c:ptCount val="' + values.length + '"/>' +
            values.map(function (v, i) { return '<c:pt idx="' + i + '"><c:v>' + esc(v) + '</c:v></c:pt>'; }).join('') +
            '</c:strCache>';
    }
    function numCacheXml(values) {
        return '<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="' + values.length + '"/>' +
            values.map(function (v, i) {
                var n = Number(v);
                return '<c:pt idx="' + i + '"><c:v>' + (isFinite(n) ? n : 0) + '</c:v></c:pt>';
            }).join('') +
            '</c:numCache>';
    }

    function catXml(sheetName, chart) {
        return '<c:cat><c:strRef><c:f>' + esc(sheetRef(sheetName, chart.catRef)) + '</c:f>' +
            strCacheXml(chart.categories) + '</c:strRef></c:cat>';
    }
    function valXml(sheetName, series) {
        return '<c:val><c:numRef><c:f>' + esc(sheetRef(sheetName, series.valRef)) + '</c:f>' +
            numCacheXml(series.values) + '</c:numRef></c:val>';
    }
    function txXml(sheetName, series) {
        return '<c:tx><c:strRef><c:f>' + esc(sheetRef(sheetName, series.nameRef)) + '</c:f>' +
            strCacheXml([series.name]) + '</c:strRef></c:tx>';
    }
    function solidFill(rgb) {
        return '<c:spPr><a:solidFill><a:srgbClr val="' + rgb + '"/></a:solidFill></c:spPr>';
    }

    // Rótulos: a ordem dos filhos de <c:dLbls> é fixa no schema e o Excel
    // recusa o arquivo se ela mudar.
    function dLblsXml(options) {
        return '<c:dLbls>' +
            '<c:showLegendKey val="0"/>' +
            '<c:showVal val="' + (options.value ? 1 : 0) + '"/>' +
            '<c:showCatName val="0"/>' +
            '<c:showSerName val="0"/>' +
            '<c:showPercent val="' + (options.percent ? 1 : 0) + '"/>' +
            '<c:showBubbleSize val="0"/>' +
            '</c:dLbls>';
    }

    function titleXml(text) {
        return '<c:title><c:tx><c:rich>' +
            '<a:bodyPr rot="0" spcFirstLastPara="1" vertOverflow="ellipsis" vert="horz" wrap="square" anchor="ctr" anchorCtr="1"/>' +
            '<a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"><a:solidFill><a:srgbClr val="1F2937"/></a:solidFill>' +
            '<a:latin typeface="Calibri"/></a:defRPr></a:pPr>' +
            '<a:r><a:rPr lang="pt-BR" sz="1200" b="1"/><a:t>' + esc(text) + '</a:t></a:r></a:p>' +
            '</c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>';
    }

    function axesXml(catAxId, valAxId, catTitle, valTitle) {
        var axText = '<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"><a:solidFill><a:srgbClr val="475569"/></a:solidFill><a:latin typeface="Calibri"/></a:defRPr></a:pPr><a:endParaRPr lang="pt-BR"/></a:p></c:txPr>';
        return '<c:catAx><c:axId val="' + catAxId + '"/><c:scaling><c:orientation val="minMax"/></c:scaling>' +
            '<c:delete val="0"/><c:axPos val="b"/>' +
            (catTitle ? titleAxXml(catTitle) : '') +
            '<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>' +
            axText +
            '<c:crossAx val="' + valAxId + '"/><c:crosses val="autoZero"/><c:auto val="1"/>' +
            '<c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>' +
            '<c:valAx><c:axId val="' + valAxId + '"/><c:scaling><c:orientation val="minMax"/></c:scaling>' +
            '<c:delete val="0"/><c:axPos val="l"/>' +
            '<c:majorGridlines><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="E2E8F0"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>' +
            (valTitle ? titleAxXml(valTitle) : '') +
            '<c:numFmt formatCode="General" sourceLinked="0"/>' +
            '<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>' +
            axText +
            '<c:crossAx val="' + catAxId + '"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>';
    }
    function titleAxXml(text) {
        return '<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900" b="0">' +
            '<a:solidFill><a:srgbClr val="64748B"/></a:solidFill><a:latin typeface="Calibri"/></a:defRPr></a:pPr>' +
            '<a:r><a:rPr lang="pt-BR" sz="900"/><a:t>' + esc(text) + '</a:t></a:r></a:p></c:rich></c:tx>' +
            '<c:overlay val="0"/></c:title>';
    }

    function plotAreaXml(sheetName, chart, index) {
        // Os ids de eixo só precisam ser únicos dentro do gráfico; derivar do
        // índice evita colisão entre gráficos da mesma planilha.
        var catAxId = 100000000 + index * 2;
        var valAxId = 100000001 + index * 2;

        if (chart.type === 'pie') {
            var serie = chart.series[0];
            var points = (chart.pointColors || []).map(function (rgb, i) {
                return '<c:dPt><c:idx val="' + i + '"/><c:bubble3D val="0"/>' + solidFill(rgb) + '</c:dPt>';
            }).join('');
            return '<c:plotArea><c:layout/><c:pieChart><c:varyColors val="1"/>' +
                '<c:ser><c:idx val="0"/><c:order val="0"/>' + txXml(sheetName, serie) + points +
                dLblsXml({ percent: true }) +
                catXml(sheetName, chart) + valXml(sheetName, serie) + '</c:ser>' +
                dLblsXml({ percent: true }) +
                '<c:firstSliceAng val="0"/></c:pieChart></c:plotArea>';
        }

        var barDir = chart.horizontal ? 'bar' : 'col';
        var grouping = chart.stacked ? 'stacked' : 'clustered';
        var series = chart.series.map(function (s, i) {
            // Barra única com cor por ponto (ex.: histograma de notas, onde
            // cada faixa tem a sua cor) usa <c:dPt>; várias séries usam a cor
            // da própria série.
            var points = (chart.pointColors || []).map(function (rgb, p) {
                return '<c:dPt><c:idx val="' + p + '"/><c:invertIfNegative val="0"/><c:bubble3D val="0"/>' + solidFill(rgb) + '</c:dPt>';
            }).join('');
            return '<c:ser><c:idx val="' + i + '"/><c:order val="' + i + '"/>' + txXml(sheetName, s) +
                (s.color ? solidFill(s.color) : '') +
                '<c:invertIfNegative val="0"/>' + points +
                catXml(sheetName, chart) + valXml(sheetName, s) + '</c:ser>';
        }).join('');

        return '<c:plotArea><c:layout/><c:barChart>' +
            '<c:barDir val="' + barDir + '"/><c:grouping val="' + grouping + '"/><c:varyColors val="0"/>' +
            series +
            '<c:gapWidth val="' + (chart.stacked ? 60 : 50) + '"/>' +
            '<c:overlap val="' + (chart.stacked ? 100 : -10) + '"/>' +
            '<c:axId val="' + catAxId + '"/><c:axId val="' + valAxId + '"/></c:barChart>' +
            axesXml(catAxId, valAxId, chart.catTitle, chart.valTitle) +
            '</c:plotArea>';
    }

    function chartXml(sheetName, chart, index) {
        var legend = chart.legend === false ? '' : '<c:legend><c:legendPos val="b"/><c:overlay val="0"/>' +
            '<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"><a:latin typeface="Calibri"/></a:defRPr></a:pPr><a:endParaRPr lang="pt-BR"/></a:p></c:txPr></c:legend>';
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<c:chartSpace xmlns:c="' + NS_CHART + '" xmlns:a="' + NS_DRAWING_MAIN + '" xmlns:r="' + NS_REL + '">' +
            '<c:roundedCorners val="0"/>' +
            '<c:chart>' + titleXml(chart.title) + plotAreaXml(sheetName, chart, index) + legend +
            '<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>' +
            '<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>' +
            '<a:ln><a:solidFill><a:srgbClr val="E2E8F0"/></a:solidFill></a:ln></c:spPr>' +
            '</c:chartSpace>';
    }

    // Uma âncora por gráfico, presa a duas células (twoCellAnchor): o gráfico
    // acompanha o tamanho das colunas/linhas em vez de flutuar solto.
    function drawingXml(charts) {
        var anchors = charts.map(function (chart, i) {
            var a = chart.anchor;
            return '<xdr:twoCellAnchor>' +
                '<xdr:from><xdr:col>' + a.col + '</xdr:col><xdr:colOff>0</xdr:colOff>' +
                '<xdr:row>' + a.row + '</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>' +
                '<xdr:to><xdr:col>' + (a.col + a.colSpan) + '</xdr:col><xdr:colOff>0</xdr:colOff>' +
                '<xdr:row>' + (a.row + a.rowSpan) + '</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>' +
                '<xdr:graphicFrame macro="">' +
                '<xdr:nvGraphicFramePr><xdr:cNvPr id="' + (i + 2) + '" name="' + esc(chart.title) + '"/>' +
                '<xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>' +
                '<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>' +
                '<a:graphic><a:graphicData uri="' + NS_CHART + '">' +
                '<c:chart xmlns:c="' + NS_CHART + '" xmlns:r="' + NS_REL + '" r:id="rId' + (i + 1) + '"/>' +
                '</a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>';
        }).join('');
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<xdr:wsDr xmlns:xdr="' + NS_SSDRAWING + '" xmlns:a="' + NS_DRAWING_MAIN + '">' + anchors + '</xdr:wsDr>';
    }

    // Descobre qual xl/worksheets/sheetN.xml corresponde a um nome de aba —
    // a ordem do arquivo não é necessariamente a de wb.SheetNames, então o
    // caminho certo é seguir workbook.xml -> rels.
    function findSheetPath(files, sheetName) {
        var workbook = dec.decode(files['xl/workbook.xml'] || new Uint8Array());
        var rels = dec.decode(files['xl/_rels/workbook.xml.rels'] || new Uint8Array());
        var sheetTag = new RegExp('<sheet[^>]*name="' + sheetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^>]*/>');
        var match = workbook.match(sheetTag);
        if (!match) return null;
        var relId = (match[0].match(/r:id="([^"]+)"/) || [])[1];
        if (!relId) return null;
        var relTag = rels.match(new RegExp('<Relationship[^>]*Id="' + relId + '"[^>]*/>'));
        if (!relTag) return null;
        var target = (relTag[0].match(/Target="([^"]+)"/) || [])[1];
        if (!target) return null;
        return 'xl/' + target.replace(/^\.?\//, '');
    }

    /**
     * Acrescenta gráficos nativos a uma planilha do workbook e devolve os
     * bytes do .xlsx pronto.
     *
     * @param {object} XLSX          a biblioteca já carregada (xlsx-js-style)
     * @param {object} fflate        a biblioteca de zip já carregada
     * @param {object} workbook      workbook montado pelo chamador
     * @param {string} sheetName     aba onde os gráficos serão ancorados
     * @param {Array}  charts        [{ type:'pie'|'bar', title, anchor:{col,row,colSpan,rowSpan},
     *                                 catRef, categories, series:[{name,nameRef,valRef,values,color}],
     *                                 stacked, horizontal, pointColors, legend, catTitle, valTitle }]
     * @returns {Uint8Array}
     */
    function withCharts(XLSX, fflate, workbook, sheetName, charts) {
        var raw = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
        var files = fflate.unzipSync(new Uint8Array(raw));

        var sheetPath = findSheetPath(files, sheetName);
        // Sem a aba não dá pra ancorar nada; devolve a planilha sem gráficos
        // em vez de derrubar a exportação inteira.
        if (!sheetPath || charts.length === 0) return fflate.zipSync(files, { level: 6 });

        var sheetFile = sheetPath.split('/').pop();
        var drawingPath = 'xl/drawings/drawing1.xml';

        charts.forEach(function (chart, i) {
            files['xl/charts/chart' + (i + 1) + '.xml'] = enc.encode(chartXml(sheetName, chart, i));
        });
        files[drawingPath] = enc.encode(drawingXml(charts));
        files['xl/drawings/_rels/drawing1.xml.rels'] = enc.encode(
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<Relationships xmlns="' + NS_PKG_REL + '">' +
            charts.map(function (_, i) {
                return '<Relationship Id="rId' + (i + 1) + '" Type="' + NS_REL + '/chart" Target="../charts/chart' + (i + 1) + '.xml"/>';
            }).join('') + '</Relationships>');

        // A planilha pode já ter rels (hiperlinks, por exemplo): acrescenta em
        // vez de sobrescrever, com um Id que ainda não exista ali.
        var sheetRelsPath = 'xl/worksheets/_rels/' + sheetFile + '.rels';
        var existing = files[sheetRelsPath] ? dec.decode(files[sheetRelsPath]) : null;
        var drawingRelId = 'rIdDrawing1';
        var drawingRel = '<Relationship Id="' + drawingRelId + '" Type="' + NS_REL + '/drawing" Target="../drawings/drawing1.xml"/>';
        files[sheetRelsPath] = enc.encode(existing
            ? existing.replace('</Relationships>', drawingRel + '</Relationships>')
            : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="' + NS_PKG_REL + '">' + drawingRel + '</Relationships>');

        // <drawing> é o último filho de <worksheet> no schema — colar logo
        // antes do fechamento mantém a ordem válida.
        var sheetXml = dec.decode(files[sheetPath]);
        if (sheetXml.indexOf('<drawing ') === -1) {
            sheetXml = sheetXml.replace('</worksheet>', '<drawing r:id="' + drawingRelId + '"/></worksheet>');
            files[sheetPath] = enc.encode(sheetXml);
        }

        var types = dec.decode(files['[Content_Types].xml']);
        var overrides = '<Override PartName="/' + drawingPath + '" ContentType="' + CT_DRAWING + '"/>' +
            charts.map(function (_, i) {
                return '<Override PartName="/xl/charts/chart' + (i + 1) + '.xml" ContentType="' + CT_CHART + '"/>';
            }).join('');
        files['[Content_Types].xml'] = enc.encode(types.replace('</Types>', overrides + '</Types>'));

        return fflate.zipSync(files, { level: 6 });
    }

    // Entrega o arquivo ao navegador. XLSX.writeFile não serve aqui porque o
    // conteúdo passou pelo pós-processamento e já está em bytes.
    function downloadXlsx(bytes, filename) {
        var blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        // Revogar na hora corta o download em alguns navegadores.
        setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    }

    U.XlsxCharts = { withCharts: withCharts, download: downloadXlsx };
})();
