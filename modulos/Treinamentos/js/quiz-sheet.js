// Planilha de questões — exportar/importar .xlsx.
//
// Serve às duas listas de perguntas do painel, que têm o mesmo formato de
// item ({ question, options: [A,B,C,D], correct: 0..3, explanation?, image? }):
//   - Avaliação do curso        (js/admin.js, sem explicação)
//   - Módulo do tipo Quiz       (js/admin-courses.js, com explicação)
//
// Uma linha por questão. A coluna "Correta" leva a letra (A–D); na importação
// também aceita 1–4. Imagens NÃO vão para a planilha: são data URLs que
// estouram o limite de 32.767 caracteres por célula do Excel — ficam só no
// painel, e questões importadas chegam sem imagem.
(function () {
    const U = window.UniAdmin = window.UniAdmin || {};

    const LETTERS = ['A', 'B', 'C', 'D'];
    const COL_QUESTION = 'Pergunta';
    const COL_OPTIONS = LETTERS.map(l => `Alternativa ${l}`);
    const COL_CORRECT = 'Correta';
    const COL_EXPLANATION = 'Explicação';

    // Cabeçalho normalizado → campo. Tolera acento, caixa e as variações que
    // uma pessoa editando a planilha à mão costuma usar.
    const HEADER_ALIASES = {
        pergunta: 'question', questao: 'question',
        'alternativa a': 0, 'opcao 1': 0, a: 0,
        'alternativa b': 1, 'opcao 2': 1, b: 1,
        'alternativa c': 2, 'opcao 3': 2, c: 2,
        'alternativa d': 3, 'opcao 4': 3, d: 3,
        correta: 'correct', 'resposta correta': 'correct', resposta: 'correct', gabarito: 'correct',
        explicacao: 'explanation'
    };

    function normalizeHeader(value) {
        return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
            .toLowerCase().replace(/\s+/g, ' ').trim();
    }

    function cellText(value) {
        return value === null || value === undefined ? '' : String(value).trim();
    }

    function parseCorrect(value) {
        const text = cellText(value).toUpperCase();
        const letter = LETTERS.indexOf(text);
        if (letter !== -1) return letter;
        const n = Number(text);
        return Number.isInteger(n) && n >= 1 && n <= 4 ? n - 1 : null;
    }

    function safeFileName(name) {
        return String(name || 'questoes').normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'questoes';
    }

    /**
     * Baixa as questões em .xlsx. Com a lista vazia sai só o cabeçalho, que
     * serve de modelo para preencher e importar.
     */
    async function exportQuestions(items, { fileName, withExplanation = false } = {}) {
        await U.loadVendor('xlsx');
        const header = [COL_QUESTION, ...COL_OPTIONS, COL_CORRECT, ...(withExplanation ? [COL_EXPLANATION] : [])];
        const rows = (items || []).filter(Boolean).map(item => [
            item.question || '',
            ...LETTERS.map((_, i) => item.options?.[i] || ''),
            LETTERS[item.correct] || 'A',
            ...(withExplanation ? [item.explanation || ''] : [])
        ]);
        const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
        sheet['!cols'] = header.map((_, i) => ({ wch: i === 0 ? 60 : i === 5 ? 9 : i === 6 ? 50 : 30 }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, sheet, 'Questões');
        XLSX.writeFile(wb, `${safeFileName(fileName)}.xlsx`);
    }

    /**
     * Lê a primeira aba de uma planilha e devolve
     * { items, skipped: [números de linha inválidos] }.
     * Linhas totalmente vazias são ignoradas sem contar como erro.
     */
    async function importQuestions(file, { withExplanation = false } = {}) {
        await U.loadVendor('xlsx');
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        if (!sheet) throw new Error('A planilha está vazia.');
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
        if (!rows.length) throw new Error('A planilha está vazia.');

        const columns = {};
        rows[0].forEach((title, index) => {
            const field = HEADER_ALIASES[normalizeHeader(title)];
            if (field !== undefined && columns[field] === undefined) columns[field] = index;
        });
        const missing = ['question', 0, 1, 2, 3, 'correct'].filter(f => columns[f] === undefined);
        if (missing.length) {
            throw new Error(`Cabeçalho inválido. Colunas esperadas: ${COL_QUESTION}, ${COL_OPTIONS.join(', ')}, ${COL_CORRECT}. Exporte para obter o modelo.`);
        }

        const items = [];
        const skipped = [];
        rows.slice(1).forEach((row, i) => {
            if (!row.some(cell => cellText(cell) !== '')) return;
            const question = cellText(row[columns.question]);
            const options = [0, 1, 2, 3].map(n => cellText(row[columns[n]]));
            const correct = parseCorrect(row[columns.correct]);
            if (!question || options.some(o => !o) || correct === null) { skipped.push(i + 2); return; }
            const item = { question, options, correct };
            const explanation = withExplanation && columns.explanation !== undefined
                ? cellText(row[columns.explanation]) : '';
            if (explanation) item.explanation = explanation;
            items.push(item);
        });
        return { items, skipped };
    }

    // Mensagem única para o aviso pós-importação.
    function describeImport(added, skipped) {
        const parts = [`${added} questão(ões) importada(s).`];
        if (skipped.length) {
            const lines = skipped.length > 8 ? `${skipped.slice(0, 8).join(', ')}…` : skipped.join(', ');
            parts.push(`${skipped.length} linha(s) ignorada(s) por campos faltando ou "Correta" inválida (linha ${lines}).`);
        }
        return parts.join(' ');
    }

    U.QuizSheet = { exportQuestions, importQuestions, describeImport };
})();
