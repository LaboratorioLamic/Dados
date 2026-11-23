// Exportação em Excel (Configurações > Backup), complementar ao backup/restore
// em JSON já existente (que cobre trainingData/quizData de uma categoria).
// Este arquivo lida com dados de PESSOAS: colaboradores, usuários e
// resultados — ortogonal ao conteúdo de curso, formatos não se misturam.
// Só exportação: a lista de colaboradores é alimentada exclusivamente pela
// sincronização automática com a planilha (js/colaboradores-sync.js), sem
// import manual de arquivo.
(function () {
    const U = window.UniAdmin;
    const ref = U.ref, get = U.get, db = U.db, dbRoot = U.dbRoot;
    const showWarning = U.showWarning;
    const { fetchColaboradores } = U.ColaboradoresSync;

    const CATEGORY_SLUGS = { treinamentos: 'Treinamentos', educacao_continuada: 'Educação Continuada', estagios: 'Estágios' };

    // Duração da avaliação (segundos) em mm:ss — ausente em registros
    // anteriores ao timer da prova.
    function formatDuration(seconds) {
        const n = Number(seconds);
        if (!Number.isFinite(n) || n < 0) return '';
        const m = Math.floor(n / 60).toString().padStart(2, '0');
        const s = Math.floor(n % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    }

    async function fetchUsers() {
        const snapshot = await get(ref(db, `/${dbRoot}/users`));
        return snapshot.exists() ? snapshot.val() : {};
    }

    async function fetchCourseNames() {
        const slugs = Object.keys(CATEGORY_SLUGS);
        const snapshots = await Promise.all(slugs.map(slug => get(ref(db, `/${dbRoot}/${slug}/trainingData`))));
        const names = {};
        slugs.forEach((slug, i) => {
            const trainingData = snapshots[i].exists() ? snapshots[i].val() : {};
            names[slug] = {};
            Object.keys(trainingData).forEach(subjectId => {
                const themes = trainingData[subjectId]?.themes || {};
                Object.keys(themes).forEach(themeId => {
                    names[slug][`${subjectId}_${themeId}`] = {
                        subjectName: trainingData[subjectId]?.name || subjectId,
                        themeName: themes[themeId]?.name || themeId
                    };
                });
            });
        });
        return names;
    }

    // Só os ramos que a planilha usa. A raiz `/results` traria junto o espelho
    // `byCourse` (~1,3 MB), que é cópia de `byUser` e não vai para nenhuma aba.
    async function fetchAllResults() {
        const branches = ['byUser', 'estagiosLivre'];
        const snapshots = await Promise.all(
            branches.map(branch => get(ref(db, `/${dbRoot}/results/${branch}`)))
        );
        const results = {};
        branches.forEach((branch, i) => {
            results[branch] = snapshots[i].exists() ? snapshots[i].val() : {};
        });
        return results;
    }

    function flattenByUserResults(byUser, users, courseNames) {
        const rows = [];
        Object.keys(byUser || {}).forEach(userId => {
            const user = users[userId];
            const fullName = user?.fullName || '(conta excluída)';
            Object.keys(byUser[userId] || {}).forEach(categorySlug => {
                Object.keys(byUser[userId][categorySlug] || {}).forEach(subjectId => {
                    Object.keys(byUser[userId][categorySlug][subjectId] || {}).forEach(themeId => {
                        const r = byUser[userId][categorySlug][subjectId][themeId];
                        const courseInfo = courseNames[categorySlug]?.[`${subjectId}_${themeId}`];
                        rows.push({
                            'Data/Hora': r.submittedAt ? new Date(r.submittedAt).toLocaleString('pt-BR') : '',
                            'Categoria': CATEGORY_SLUGS[categorySlug] || categorySlug,
                            'Assunto': courseInfo?.subjectName || subjectId,
                            'Curso': courseInfo?.themeName || themeId,
                            'Nome': fullName,
                            'Nota': r.score,
                            'Tempo': formatDuration(r.durationSeconds),
                            'Avaliação (estrelas)': r.rating || '',
                            'Situação': r.approved ? 'Aprovado' : 'Reprovado',
                            'Unidade': user?.unit || '',
                            'Cargo': user?.role || '',
                            'Tentativa': r.attempt || 1,
                            'Status do prazo': U.Deadlines?.STATUS_LABELS?.[r.deadlineStatus] || r.deadlineStatus || '—',
                            'Comentário': r.comment || ''
                        });
                    });
                });
            });
        });
        return rows;
    }

    function flattenEstagiosResults(estagiosLivre, courseNames) {
        const rows = [];
        Object.keys(estagiosLivre || {}).forEach(categorySlug => {
            Object.keys(estagiosLivre[categorySlug] || {}).forEach(subjectId => {
                Object.keys(estagiosLivre[categorySlug][subjectId] || {}).forEach(themeId => {
                    const entries = estagiosLivre[categorySlug][subjectId][themeId] || {};
                    const courseInfo = courseNames[categorySlug]?.[`${subjectId}_${themeId}`];
                    Object.values(entries).forEach(r => {
                        rows.push({
                            'Data/Hora': r.submittedAt ? new Date(r.submittedAt).toLocaleString('pt-BR') : '',
                            'Categoria': CATEGORY_SLUGS[categorySlug] || categorySlug,
                            'Assunto': courseInfo?.subjectName || subjectId,
                            'Curso': courseInfo?.themeName || themeId,
                            'Nome': r.name || '—',
                            'Nota': r.score,
                            'Tempo': formatDuration(r.durationSeconds),
                            'Avaliação (estrelas)': r.rating || '',
                            'Situação': r.approved ? 'Aprovado' : 'Reprovado',
                            'Unidade': '',
                            'Cargo': '',
                            'Tentativa': '',
                            'Status do prazo': U.Deadlines?.STATUS_LABELS?.[r.deadlineStatus] || r.deadlineStatus || '—',
                            'Comentário': r.comment || ''
                        });
                    });
                });
            });
        });
        return rows;
    }

    async function exportExcel() {
        showWarning('Gerando planilha...');
        try {
            const [colaboradores, users, courseNames, results] = await Promise.all([
                fetchColaboradores(), fetchUsers(), fetchCourseNames(), fetchAllResults()
            ]);

            const colaboradoresRows = Object.values(colaboradores).map(c => ({
                'Nome': c.fullName,
                'Unidade': c.unit || '',
                'Cargo': c.role || '',
                'Status': c.accountUserId ? 'Com conta' : 'Sem conta',
                'Importado em': c.importedAt ? new Date(c.importedAt).toLocaleDateString('pt-BR') : ''
            }));

            const usersRows = Object.values(users).map(u => ({
                'Nome': u.fullName,
                'Login': u.username || '',
                'Unidade': u.unit || '',
                'Cargo': u.role || '',
                'Situação': u.disabled ? 'Desativado' : 'Ativo',
                'Criado em': u.createdAt ? new Date(u.createdAt).toLocaleDateString('pt-BR') : ''
            }));

            const resultRows = [
                ...flattenByUserResults(results.byUser, users, courseNames),
                ...flattenEstagiosResults(results.estagiosLivre, courseNames)
            ];

            // A xlsx (881 KB) sai do HTML e é buscada aqui — ver js/vendor-loader.js.
            if (U.loadVendor) await U.loadVendor('xlsx');

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(colaboradoresRows), 'Colaboradores');
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(usersRows), 'Usuários');
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resultRows), 'Resultados');

            const date = new Date().toISOString().split('T')[0];
            XLSX.writeFile(wb, `uniadmin_dados_${date}.xlsx`);
            showWarning('Planilha baixada com sucesso!');
        } catch (error) {
            showWarning('Erro ao gerar planilha: ' + error.message);
        }
    }

    document.getElementById('cfg-excel-download-btn')?.addEventListener('click', exportExcel);
})();
