// Aba Histórico (Configurações): tabela única com todos os resultados de
// avaliação de todas as categorias — equivalente à planilha que existia no
// Google Sheets antes da migração para o Firebase. Clique na linha abre o
// detalhe (gabarito completo + avaliação/comentário do curso).
(function () {
    const U = window.UniAdmin;
    const ref = U.ref, get = U.get, db = U.db, dbRoot = U.dbRoot;
    const showWarning = U.showWarning;
    const normalizeName = U.normalizeName;

    // Formata nota com 1 casa decimal (vírgula), ex.: 8,2/10
    function formatScore(score) {
        const n = Number(score);
        if (!Number.isFinite(n)) return score;
        return n.toFixed(1).replace('.', ',');
    }

    // Duração da avaliação (segundos) em mm:ss — ausente em registros antigos
    // (anteriores ao timer) ou importados sem essa coluna.
    function formatDuration(seconds) {
        const n = Number(seconds);
        if (!Number.isFinite(n) || n < 0) return '—';
        const m = Math.floor(n / 60).toString().padStart(2, '0');
        const s = Math.floor(n % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    }

    // Aceita "mm:ss" (formato exportado por esta tela) ou segundos puros
    // (planilha editada manualmente). Ausente/inválido vira null, não 0 —
    // evita mostrar "00:00" para registros que nunca tiveram esse dado.
    function parseDurationValue(raw) {
        const text = String(raw ?? '').trim();
        if (!text) return null;
        const clockMatch = text.match(/^(\d+):(\d{1,2})$/);
        if (clockMatch) return (Number(clockMatch[1]) * 60) + Number(clockMatch[2]);
        const n = Number(text);
        return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
    }

    // Tempo ATIVO com o curso aberto até a aprovação (campo activeMs de
    // progress/byUser, ver resumeActiveCourseTimer/pauseActiveCourseTimer em
    // js/main.js), em HH:MM:SS — HH sem teto. Ausente (registro anterior a
    // essa métrica, ou reprovado/estágio sem conta vinculada) vira "—".
    function formatHHMMSS(ms) {
        const n = Number(ms);
        if (!Number.isFinite(n) || n <= 0) return '—';
        const totalSeconds = Math.round(n / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    // Mesmo valor de formatHHMMSS, mas para preencher o <input> do formulário
    // de edição — string vazia (não "—") quando não há valor.
    function toHHMMSSInputValue(ms) {
        const n = Number(ms);
        if (!Number.isFinite(n) || n <= 0) return '';
        const totalSeconds = Math.round(n / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    // Aceita "HH:MM:SS" e converte para milissegundos (activeMs). Vazio/
    // inválido vira null, não 0 — evita gravar "00:00:00" para quem nunca
    // teve essa métrica.
    function parseHHMMSSValue(raw) {
        const text = String(raw ?? '').trim();
        if (!text) return null;
        const match = text.match(/^(\d{1,3}):([0-5]?\d):([0-5]?\d)$/);
        if (!match) return null;
        const hours = Number(match[1]), minutes = Number(match[2]), seconds = Number(match[3]);
        return ((hours * 3600) + (minutes * 60) + seconds) * 1000;
    }

    const CATEGORY_LABELS = { treinamentos: 'Treinamentos', educacao_continuada: 'Educação Continuada', estagios: 'Estágios' };

    let allRows = [];
    let sortKey = 'submittedAt';
    let sortDir = 'desc';
    const PAGE_SIZE = 20;
    let currentPage = 1;

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }

    function starsHtml(rating) {
        if (!rating) return '<span class="stars-empty">—</span>';
        let html = '<span class="star-rating">';
        for (let i = 1; i <= 5; i++) html += `<i class="fas fa-star ${i <= rating ? 'is-on' : 'is-off'}"></i>`;
        return html + '</span>';
    }
    U.starsHtml = starsHtml;

    async function fetchCourseNames() {
        const slugs = Object.keys(CATEGORY_LABELS);
        const snapshots = await Promise.all(slugs.map(slug => get(ref(db, `/${dbRoot}/${slug}/trainingData`))));
        const names = {};
        slugs.forEach((slug, i) => {
            const trainingData = snapshots[i].exists() ? snapshots[i].val() : {};
            names[slug] = {};
            Object.keys(trainingData).forEach(subjectId => {
                const themes = trainingData[subjectId]?.themes || {};
                Object.keys(themes).forEach(themeId => {
                    names[slug][`${subjectId}_${themeId}`] = {
                        subject: trainingData[subjectId]?.name || subjectId,
                        theme: themes[themeId]?.name || themeId
                    };
                });
            });
        });
        return names;
    }

    // Índice pesquisável de cursos cadastrados, usado só no import: valida a
    // linha da planilha e fornece as questões do quiz para casar o gabarito
    // com as respostas erradas.
    //
    // ATENÇÃO à nomenclatura invertida entre a planilha e o schema interno:
    // - Planilha: coluna "Assunto" = tema-pai (ex.: "Controle de Temperatura"),
    //   coluna "Tema" = curso específico (ex.: "Sistemas e Processos").
    // - Schema interno (trainingData): `trainingData[subjectId].name` é o
    //   TEMA-PAI que o painel Configurações rotula como "Tema" no formulário,
    //   e `themes[themeId].name` é o CURSO que o painel rotula como "Assunto".
    // Ou seja: planilha.Assunto <-> trainingData[subjectId].name (tema-pai),
    //          planilha.Tema    <-> themes[themeId].name (curso).
    async function fetchCourseIndex() {
        const slugs = Object.keys(CATEGORY_LABELS);
        const snapshots = await Promise.all(slugs.map(slug => get(ref(db, `/${dbRoot}/${slug}`))));
        const index = new Map(); // key: normalizeName(`${planilhaAssunto}|${planilhaTema}`) -> { slug, subjectId, themeId, questions }
        slugs.forEach((slug, i) => {
            const data = snapshots[i].exists() ? snapshots[i].val() : {};
            const trainingData = data.trainingData || {};
            const quizData = data.quizData || {};
            Object.keys(trainingData).forEach(subjectId => {
                const planilhaAssunto = trainingData[subjectId]?.name; // tema-pai
                if (!planilhaAssunto) return;
                const themes = trainingData[subjectId]?.themes || {};
                Object.keys(themes).forEach(themeId => {
                    const themeData = themes[themeId];
                    const planilhaTema = themeData?.name; // curso
                    if (!planilhaTema) return;
                    const key = normalizeName(`${planilhaAssunto}|${planilhaTema}`);
                    index.set(key, {
                        slug, subjectId, themeId,
                        subject: planilhaAssunto, theme: planilhaTema,
                        image: themeData.image || null,
                        imageVersion: themeData.imageVersion || 0,
                        description: themeData.description || '',
                        moduleCount: (themeData.modules || []).length,
                        certificateEnabled: !!themeData.certificateEnabled,
                        certificateTitle: themeData.certificateTitle || '',
                        certificateHours: themeData.certificateHours || null,
                        certificateTopics: themeData.certificateTopics || '',
                        questions: quizData[`${subjectId}_${themeId}`] || []
                    });
                });
            });
        });
        return index;
    }

    // Ramos de /results que `flatten` consome. O espelho `byCourse` fica de
    // fora de propósito: ele duplica `byUser` (~1,3 MB dos ~4 MB da árvore) e
    // nenhuma listagem o lê — só existe para consulta pontual por curso
    // (js/admin-dashboard.js). Baixar a raiz `/results` trazia essa cópia
    // junto em toda abertura de Histórico, Dashboard, Usuários, Perfil do
    // aluno e ranking do portal.
    const RESULT_BRANCHES = ['byUser', 'estagiosLivre', 'imported'];

    async function fetchAllData() {
        const [usersSnap, progressSnap, courseNames, ...branchSnaps] = await Promise.all([
            get(ref(db, `/${dbRoot}/users`)),
            get(ref(db, `/${dbRoot}/progress/byUser`)),
            fetchCourseNames(),
            ...RESULT_BRANCHES.map(branch => get(ref(db, `/${dbRoot}/results/${branch}`)))
        ]);
        const users = usersSnap.exists() ? usersSnap.val() : {};
        const progress = progressSnap.exists() ? progressSnap.val() : {};
        const results = {};
        RESULT_BRANCHES.forEach((branch, i) => {
            results[branch] = branchSnaps[i].exists() ? branchSnaps[i].val() : {};
        });
        return { users, results, progress, courseNames };
    }

    function flatten({ users, results, progress, courseNames }) {
        const rows = [];

        Object.keys(results.byUser || {}).forEach(userId => {
            const user = users[userId];
            Object.keys(results.byUser[userId] || {}).forEach(slug => {
                Object.keys(results.byUser[userId][slug] || {}).forEach(subjectId => {
                    Object.keys(results.byUser[userId][slug][subjectId] || {}).forEach(themeId => {
                        const r = results.byUser[userId][slug][subjectId][themeId];
                        const course = courseNames[slug]?.[`${subjectId}_${themeId}`];
                        // Tempo ativo com o curso aberto (ver formatHHMMSS) —
                        // vive em progress/byUser, não em results, pois é
                        // acumulado durante o curso, não só no momento do envio.
                        const activeMs = progress?.[userId]?.[slug]?.[subjectId]?.[themeId]?.activeMs ?? null;
                        rows.push({
                            userId, slug, subjectId, themeId,
                            fullName: user?.fullName || '(conta excluída)',
                            unit: user?.unit || '',
                            role: user?.role || '',
                            subject: course?.subject || subjectId,
                            theme: course?.theme || themeId,
                            ...r,
                            activeMs
                        });
                    });
                });
            });
        });

        Object.keys(results.estagiosLivre || {}).forEach(slug => {
            Object.keys(results.estagiosLivre[slug] || {}).forEach(subjectId => {
                Object.keys(results.estagiosLivre[slug][subjectId] || {}).forEach(themeId => {
                    const entries = results.estagiosLivre[slug][subjectId][themeId] || {};
                    const course = courseNames[slug]?.[`${subjectId}_${themeId}`];
                    Object.keys(entries).forEach(entryId => {
                        const r = entries[entryId];
                        rows.push({
                            userId: null, entryId, slug, subjectId, themeId,
                            fullName: r.name || '—',
                            unit: '', role: '',
                            subject: course?.subject || subjectId,
                            theme: course?.theme || themeId,
                            ...r
                        });
                    });
                });
            });
        });

        // Registros importados de planilha (js/admin-history.js import) —
        // texto livre, sem vínculo com trainingData/conta; já vêm com
        // subject/theme/unit/role prontos, não precisam de lookup.
        Object.keys(results.imported || {}).forEach(slug => {
            Object.entries(results.imported[slug] || {}).forEach(([entryId, r]) => {
                rows.push({
                    // entryId é o que permite editar/excluir a linha depois.
                    userId: null, entryId, slug,
                    subjectId: r.subjectId || null, themeId: r.themeId || null,
                    fullName: r.name || '—',
                    unit: r.unit || '',
                    role: r.role || '',
                    subject: r.subject || '—',
                    theme: r.theme || '—',
                    score: r.score, approved: r.approved, rating: r.rating,
                    comment: r.comment, submittedAt: r.submittedAt,
                    deadlineStatus: r.deadlineStatus,
                    answers: r.answers || [],
                    errorsText: r.errorsText || '',
                    imported: true
                });
            });
        });

        return rows;
    }

    function applySort(rows) {
        const sorted = [...rows].sort((a, b) => {
            let va = a[sortKey], vb = b[sortKey];
            if (sortKey === 'fullName' || sortKey === 'subject' || sortKey === 'theme' || sortKey === 'unit' || sortKey === 'role') {
                va = (va || '').toString().toLowerCase(); vb = (vb || '').toString().toLowerCase();
                return sortDir === 'asc' ? va.localeCompare(vb, 'pt-BR') : vb.localeCompare(va, 'pt-BR');
            }
            va = va ?? 0; vb = vb ?? 0;
            return sortDir === 'asc' ? va - vb : vb - va;
        });
        return sorted;
    }

    // Filtros avançados: uma linha de "chips", um por campo — cada um abre
    // seu próprio popover com busca (combobox) em vez de um painel único com
    // vários <select>. Estado guardado aqui em vez de lido de <select>s.
    // minScore/maxScore = faixa da NOTA (0 a 10) do resultado; maxRating = as
    // estrelas que o aluno deu ao curso. São filtros distintos — o chip "Nota"
    // controlava as estrelas, o que fazia a filtragem por nota nunca bater.
    // O filtro de estrelas é um TETO ("até 3 estrelas" = 3 ou menos): serve
    // para achar os cursos mal avaliados, que é o que interessa revisar.
    const filterState = {
        subject: '', theme: '', name: '', role: '', unit: '',
        minScore: null, maxScore: null, maxRating: 0, onlyComments: false
    };
    // Rótulo visível de cada campo — `subject` (tema-pai) aparece como "Tema"
    // e `theme` (curso) como "Assunto", igual às colunas da tabela.
    const FIELD_LABELS = { subject: 'Tema', theme: 'Assunto', name: 'Nome', role: 'Cargo', unit: 'Unidade' };

    function countActiveFilters() {
        return Object.entries(filterState).filter(([k, v]) => {
            if (k === 'maxRating') return v > 0;
            // A faixa de nota é um chip só, conte-a uma vez.
            if (k === 'minScore') return v !== null || filterState.maxScore !== null;
            if (k === 'maxScore') return false;
            if (k === 'onlyComments') return v === true;
            return !!v;
        }).length;
    }

    // Linhas restritas à categoria/plataforma escolhida em Configurações
    // (badge no topo do painel) — todas as abas seguem essa mesma seleção,
    // não há mais um filtro de categoria independente aqui.
    function rowsForCurrentCategory() {
        const slug = U.currentCategorySlug;
        return slug ? allRows.filter(r => r.slug === slug) : allRows;
    }

    function applyFilters(rows) {
        const f = filterState;
        return rows.filter(r => {
            if (f.subject && r.subject !== f.subject) return false;
            if (f.theme && r.theme !== f.theme) return false;
            if (f.name && r.fullName !== f.name) return false;
            if (f.role && (r.role || '') !== f.role) return false;
            if (f.unit && (r.unit || '') !== f.unit) return false;
            // Nota vinda de import pode chegar como texto ("8"), por isso o Number().
            const score = Number(r.score);
            if (f.minScore !== null && !(score >= f.minScore)) return false;
            if (f.maxScore !== null && !(score <= f.maxScore)) return false;
            // "Até N estrelas": só linhas avaliadas; quem não avaliou o curso
            // não conta como nota baixa.
            if (f.maxRating && !(r.rating >= 1 && r.rating <= f.maxRating)) return false;
            if (f.onlyComments && !(r.comment || '').trim()) return false;
            return true;
        });
    }

    // Valores distintos disponíveis para um campo, respeitando a categoria
    // ativa e — para assunto/tema — o valor escolhido no outro dos dois
    // (filtro cruzado: Tema só lista temas do Assunto escolhido e vice-versa).
    function optionsForField(field) {
        const base = rowsForCurrentCategory().filter(r => {
            if (field === 'subject' && filterState.theme) return r.theme === filterState.theme;
            if (field === 'theme' && filterState.subject) return r.subject === filterState.subject;
            return true;
        });
        const getter = { subject: r => r.subject, theme: r => r.theme, name: r => r.fullName, role: r => r.role, unit: r => r.unit }[field];
        return [...new Set(base.map(getter).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    }

    // ─── Nomenclatura das colunas Assunto/Tema ───
    // No banco, `r.subject` é o TEMA-pai (trainingData[subjectId].name) e
    // `r.theme` é o ASSUNTO/curso (themes[themeId].name) — é assim que o
    // painel Configurações rotula os dois no cadastro. Esta tabela mostrava
    // invertido; agora a coluna "Assunto" lê r.theme e a coluna "Tema" lê
    // r.subject, mantendo os nomes dos campos internos intactos.

    // Ícone genérico por COLUNA (não por palavra-chave do texto): assuntos,
    // temas e cargos novos aparecem com o mesmo ícone dos já existentes, sem
    // depender de o nome bater com alguma regra. A cor continua variando por
    // texto (hashHue), o que já diferencia visualmente os valores.
    // Matiz estável por texto: o mesmo assunto/unidade/cargo recebe sempre a
    // mesma cor, sem precisar de paleta cadastrada em lugar nenhum.
    function hashHue(text) {
        const normalized = normalizeName(text);
        let hash = 0;
        for (let i = 0; i < normalized.length; i++) hash = (hash * 31 + normalized.charCodeAt(i)) % 360;
        return hash;
    }

    const TAG_ICONS = { subject: '📘', theme: '🗂️', unit: '🏢', role: '💼' };

    function tagHtml(text, kind) {
        const value = (text || '').toString().trim();
        if (!value || value === '—') return '<span class="stars-empty">—</span>';
        return `<span class="hist-tag hist-tag-${kind}" style="--tag-hue:${hashHue(value)};" title="${escapeHtml(value)}">`
            + `<span class="hist-tag-emoji">${TAG_ICONS[kind] || '🏷️'}</span>${escapeHtml(value)}</span>`;
    }

    function dateCellHtml(r) {
        if (!r.submittedAt) return '<span class="stars-empty">—</span>';
        const date = new Date(r.submittedAt);
        return `<span class="hist-date"><i class="far fa-calendar-check"></i><span class="hist-date-text">`
            + `<strong>${date.toLocaleDateString('pt-BR')}</strong>`
            + `<small>${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small>`
            + `</span></span>`;
    }

    function scoreHtml(r) {
        const score = Number(r.score);
        if (!Number.isFinite(score)) return '<span class="stars-empty">—</span>';
        const cls = score >= 8 ? 'is-high' : score >= 6 ? 'is-mid' : 'is-low';
        return `<span class="hist-score ${cls}"><b>${formatScore(score)}</b><small>/10</small></span>`;
    }

    // Quantos erros a linha teve. Prefere o gabarito estruturado (answers[]);
    // cai para a contagem de blocos "N)" do texto solto dos importados.
    function errorCount(r) {
        if (Array.isArray(r.answers) && r.answers.length > 0) {
            return r.answers.filter(a => a.selected !== a.correct).length;
        }
        const text = r.errorsText || r.errors || '';
        if (!text.trim()) return 0;
        return parseErrorBlocks(text).length || 1;
    }

    function errorsBadge(r) {
        // Sem gabarito nem texto de erros não dá para afirmar "sem erros" —
        // só quando a nota é 10 (ou o registro traz o detalhe) o balão verde
        // é honesto; nos demais casos a célula fica neutra.
        const hasDetail = (Array.isArray(r.answers) && r.answers.length > 0)
            || !!(r.errorsText || r.errors || '').trim();
        if (!hasDetail && Number(r.score) < 10) return '<span class="stars-empty">—</span>';

        const count = errorCount(r);
        if (count === 0) return '<span class="hist-errors is-none"><i class="fas fa-circle-check"></i> Sem erros</span>';
        return `<span class="hist-errors is-some" title="Clique na linha para ver o gabarito">`
            + `<i class="fas fa-circle-xmark"></i> ${count} erro${count > 1 ? 's' : ''}</span>`;
    }

    function commentCellHtml(r, index) {
        const text = (r.comment || '').trim();
        if (!text) return '<span class="hist-comment-btn is-off" title="Sem comentário"><i class="far fa-comment"></i></span>';
        return `<button type="button" class="hist-comment-btn is-on" data-comment-index="${index}" title="Ver comentário"><i class="fas fa-comment-dots"></i></button>`;
    }

    function actionsCellHtml(r, index) {
        return `<span class="hist-actions">`
            + `<button type="button" class="hist-act-btn" data-edit-index="${index}" title="Editar registro"><i class="fas fa-pen"></i></button>`
            + `<button type="button" class="hist-act-btn is-danger" data-delete-index="${index}" title="Excluir registro"><i class="fas fa-trash-can"></i></button>`
            + `</span>`;
    }

    // Rótulo do prazo — congelado no momento do envio (r.deadlineStatus),
    // nunca recalculado depois. Só aparece com destaque quando de fato houve
    // atraso; cursos sem prazo ou entregues no prazo ficam neutros.
    function deadlinePreview(r) {
        const status = r.deadlineStatus;
        if (!status || status === 'livre' || status === 'on_time' || status === 'not_started') {
            return '<span class="stars-empty">—</span>';
        }
        const label = U.Deadlines?.STATUS_LABELS?.[status] || status;
        const cls = status === 'forgiven' ? 'is-forgiven' : 'is-late';
        return `<span class="history-deadline-pill ${cls}"><i class="fas fa-triangle-exclamation"></i> ${escapeHtml(label)}</span>`;
    }

    // `colClass` casa com as larguras definidas em css/admin.css
    // (#cfg-root .history-table-wrap col.hc-*) — mantém as 14 colunas
    // cabendo na largura do painel sem scroll horizontal.
    const COLUMNS = [
        { key: 'submittedAt', label: 'Data/Hora', colClass: 'hc-date', render: dateCellHtml },
        // Rótulo x campo interno propositalmente cruzados — ver bloco
        // "Nomenclatura das colunas Assunto/Tema" acima.
        { key: 'subject', label: 'Tema', colClass: 'hc-subject', render: r => tagHtml(r.subject, 'theme') },
        { key: 'theme', label: 'Assunto', colClass: 'hc-theme', render: r => tagHtml(r.theme, 'subject') },
        { key: 'fullName', label: 'Nome', colClass: 'hc-name', render: r => `<span class="hist-name">${escapeHtml(r.fullName)}</span>` },
        // Só em Estágios: sem conta vinculada, o email digitado no formulário é
        // o único canal de contato do estagiário (ver estagiosOnly abaixo).
        {
            key: 'email', label: 'Email', colClass: 'hc-email', estagiosOnly: true,
            render: r => (r.email
                ? `<span class="hist-email"><span class="hist-email-text" title="${escapeHtml(r.email)}">${escapeHtml(r.email)}</span>`
                    + `<button type="button" class="email-copy-btn" data-copy-email="${escapeHtml(r.email)}" title="Copiar email"><i class="fas fa-copy"></i></button></span>`
                : '<span class="stars-empty">—</span>')
        },
        { key: 'score', label: 'Nota', colClass: 'hc-score', render: scoreHtml },
        { key: 'durationSeconds', label: 'Tempo', colClass: 'hc-duration', render: r => `<span class="hist-duration">${formatDuration(r.durationSeconds)}</span>` },
        // Tempo ATIVO com o curso aberto até a aprovação (ver formatHHMMSS) —
        // não confundir com "Tempo" acima, que é a duração da PROVA em si.
        { key: 'activeMs', label: 'Conclusão', colClass: 'hc-conclusion', render: r => `<span class="hist-duration">${formatHHMMSS(r.activeMs)}</span>` },
        { key: '__errors', label: 'Erros', colClass: 'hc-errors', sortable: false, render: errorsBadge },
        { key: 'rating', label: 'Avaliação', colClass: 'hc-rating', render: r => starsHtml(r.rating) },
        { key: 'deadlineStatus', label: 'Prazo', colClass: 'hc-deadline', render: deadlinePreview },
        { key: 'unit', label: 'Unidade', colClass: 'hc-unit', render: r => tagHtml(r.unit, 'unit') },
        { key: 'role', label: 'Cargo', colClass: 'hc-role', render: r => tagHtml(r.role, 'role') },
        { key: 'comment', label: 'Coment.', colClass: 'hc-comment', sortable: false, render: commentCellHtml },
        { key: 'approved', label: 'Situação', colClass: 'hc-approved', render: r => `<span class="history-status-pill ${r.approved ? 'is-approved' : 'is-reproved'}">${r.approved ? 'Aprovado' : 'Reprovado'}</span>` },
        { key: '__actions', label: 'Ações', colClass: 'hc-actions', sortable: false, render: actionsCellHtml }
    ];

    function visibleColumns() {
        const isEstagios = U.currentCategorySlug === 'estagios';
        return COLUMNS.filter(col => !col.estagiosOnly || isEstagios);
    }

    // Atalho de copiar email, usado na coluna da tabela e no modal de detalhe.
    // O clique não pode borbulhar: na tabela ele abriria o detalhe da linha.
    function handleEmailCopyClick(event) {
        const btn = event.target.closest('[data-copy-email]');
        if (!btn) return;
        event.stopPropagation();
        navigator.clipboard.writeText(btn.dataset.copyEmail)
            .then(() => {
                btn.classList.add('is-copied');
                btn.innerHTML = '<i class="fas fa-check"></i>';
                setTimeout(() => {
                    btn.classList.remove('is-copied');
                    btn.innerHTML = '<i class="fas fa-copy"></i>';
                }, 1400);
            })
            .catch(() => showWarning('Não foi possível copiar o email.'));
    }

    function renderTable() {
        const container = document.getElementById('cfg-history-table-wrap');
        if (!container) return;
        const rows = applySort(applyFilters(rowsForCurrentCategory()));

        if (rows.length === 0) {
            currentPage = 1;
            container.innerHTML = '<p class="dashboard-table-empty">Nenhum resultado encontrado.</p>';
            return;
        }

        const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;
        const pageStart = (currentPage - 1) * PAGE_SIZE;
        const pageRows = rows.slice(pageStart, pageStart + PAGE_SIZE);

        const columns = visibleColumns();
        const colgroupHtml = `<colgroup>${columns.map(col => `<col class="${col.colClass}">`).join('')}</colgroup>`;

        const headerHtml = columns.map(col => {
            if (col.sortable === false) return `<th style="cursor:default;">${col.label}</th>`;
            const isActive = sortKey === col.key;
            const icon = isActive ? (sortDir === 'asc' ? 'fa-arrow-up' : 'fa-arrow-down') : 'fa-sort';
            return `<th data-key="${col.key}">${col.label} <i class="fas ${icon}"></i></th>`;
        }).join('');

        // Índice absoluto (dentro de `rows`) guardado em data-index — os
        // handlers de clique usam esse valor para achar o registro correto
        // mesmo a linha pertencendo a uma página diferente da primeira.
        const bodyHtml = pageRows.map((r, i) => `
            <tr data-index="${pageStart + i}">
                ${columns.map(col => `<td>${col.render(r, pageStart + i)}</td>`).join('')}
            </tr>
        `).join('');

        container.innerHTML = `<table class="history-table">${colgroupHtml}<thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>${paginationHtml(rows.length, totalPages)}`;

        container.querySelectorAll('thead th[data-key]').forEach(th => {
            th.addEventListener('click', () => {
                const key = th.dataset.key;
                if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
                else { sortKey = key; sortDir = 'asc'; }
                currentPage = 1;
                renderTable();
            });
        });

        // Clique na linha abre o detalhe, exceto quando o alvo é um dos
        // controles próprios da linha (comentário / editar / excluir).
        container.querySelectorAll('tbody tr').forEach(tr => {
            tr.addEventListener('click', (event) => {
                if (event.target.closest('.hist-actions, .hist-comment-btn.is-on, [data-copy-email]')) return;
                openDetail(rows[Number(tr.dataset.index)]);
            });
        });

        container.querySelectorAll('[data-comment-index]').forEach(btn => {
            btn.addEventListener('click', (event) => {
                event.stopPropagation();
                openCommentModal(rows[Number(btn.dataset.commentIndex)]);
            });
        });
        container.querySelectorAll('[data-edit-index]').forEach(btn => {
            btn.addEventListener('click', (event) => {
                event.stopPropagation();
                openRecordForm('edit', rows[Number(btn.dataset.editIndex)]);
            });
        });
        container.querySelectorAll('[data-delete-index]').forEach(btn => {
            btn.addEventListener('click', (event) => {
                event.stopPropagation();
                deleteRecord(rows[Number(btn.dataset.deleteIndex)]);
            });
        });

        container.querySelectorAll('[data-page]').forEach(btn => {
            btn.addEventListener('click', () => {
                const target = btn.dataset.page;
                currentPage = target === 'prev' ? currentPage - 1 : target === 'next' ? currentPage + 1 : Number(target);
                renderTable();
            });
        });
    }

    // Botões "anterior/1..N/próxima", com reticências quando há muitas
    // páginas — mantém sempre visíveis a primeira, a última e uma janela em
    // torno da página atual.
    function paginationHtml(totalRows, totalPages) {
        if (totalPages <= 1) return '';
        const pages = new Set([1, totalPages, currentPage, currentPage - 1, currentPage + 1]);
        let lastRendered = 0;
        let itemsHtml = '';
        for (let p = 1; p <= totalPages; p++) {
            if (!pages.has(p)) continue;
            if (p - lastRendered > 1) itemsHtml += '<span class="history-pagination-ellipsis">…</span>';
            itemsHtml += `<button type="button" class="history-pagination-btn ${p === currentPage ? 'is-active' : ''}" data-page="${p}">${p}</button>`;
            lastRendered = p;
        }
        return `
            <div class="history-pagination">
                <span class="history-pagination-info">${totalRows} registro${totalRows === 1 ? '' : 's'}</span>
                <div class="history-pagination-controls">
                    <button type="button" class="history-pagination-btn" data-page="prev" ${currentPage === 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>
                    ${itemsHtml}
                    <button type="button" class="history-pagination-btn" data-page="next" ${currentPage === totalPages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>
                </div>
            </div>`;
    }

    function showSpinner(show) {
        const el = document.getElementById('cfg-history-loading');
        if (el) el.style.display = show ? 'block' : 'none';
    }

    // Carrega/atualiza allRows SEM tocar na tabela. Outras abas (Usuários,
    // Dashboard) só querem os dados — montar o HTML do histórico inteiro para
    // elas era trabalho jogado fora. A promessa em voo é compartilhada para
    // que chamadas simultâneas não baixem /results duas vezes.
    let rowsPromise = null;
    // Idade máxima do cache. Antes ele valia para sempre: uma vez carregado,
    // abas como Usuários e Dashboard reusavam as mesmas linhas pelo resto da
    // sessão, e uma conclusão de curso feita nesse meio-tempo simplesmente não
    // aparecia. O TTL é a rede de segurança; a invalidação por evento (abaixo)
    // é o caminho normal.
    const ROWS_TTL_MS = 30000;
    let rowsLoadedAt = 0;

    function invalidateRows() {
        rowsLoadedAt = 0;
    }
    U.invalidateHistoryRows = invalidateRows;

    // Recarga já agendada para depois da que está em voo. Vários `force`
    // simultâneos compartilham esta — uma emenda basta para todos.
    let queuedForcePromise = null;

    function startLoad() {
        rowsPromise = fetchAllData()
            .then(data => { allRows = flatten(data); rowsLoadedAt = Date.now(); return allRows; })
            .finally(() => { rowsPromise = null; });
        return rowsPromise;
    }

    function loadRows(force = false) {
        const isFresh = allRows.length > 0 && (Date.now() - rowsLoadedAt) < ROWS_TTL_MS;
        if (!force && isFresh) return Promise.resolve(allRows);
        if (!rowsPromise) return startLoad();
        // Leitura em andamento e o chamador quer dado novo. Pegar carona na
        // que está em voo seria errado: ela pode ter começado ANTES da escrita
        // que motivou o `force`, e devolvê-la como "atualizada" entrega
        // exatamente o dado velho que o `force` existe para evitar. Emenda
        // outra leitura no fim desta.
        if (!force) return rowsPromise;
        if (!queuedForcePromise) {
            queuedForcePromise = rowsPromise
                .catch(() => {})
                .then(() => startLoad())
                .finally(() => { queuedForcePromise = null; });
        }
        return queuedForcePromise;
    }

    // Qualquer gravação de resultado/progresso derruba o cache na hora, para
    // que a próxima leitura de qualquer aba já venha do servidor.
    document.addEventListener('uniadmin:results-changed', invalidateRows);
    // Depois de uma queda de rede o cache é suspeito por definição: foi
    // montado antes da janela em que não houve como saber o que mudou.
    document.addEventListener('uniadmin:connection-restored', invalidateRows);

    async function populateHistory() {
        showSpinner(true);
        try {
            await loadRows(true);
            refreshAllChipLists();
            renderTable();
        } catch (error) {
            showWarning('Erro ao carregar histórico: ' + error.message);
        } finally {
            showSpinner(false);
        }
    }
    U.populateHistory = populateHistory;

    // A categoria/plataforma é a mesma selecionada no topo do painel
    // Configurações — quando o usuário troca de plataforma lá, o histórico
    // re-filtra e as opções de cada chip são recalculadas para essa categoria.
    document.addEventListener('uniadmin:category-changed', () => {
        if (allRows.length > 0) { currentPage = 1; refreshAllChipLists(); renderTable(); }
    });

    // ─── Linha de filtros: um chip por campo, cada um com seu popover de busca ───
    const filterRow = document.getElementById('cfg-history-filter-row');
    const filterClearChip = document.getElementById('cfg-history-filter-clear');
    const commentsChip = document.getElementById('cfg-history-filter-comments');
    const ratingWidget = document.getElementById('cfg-history-filter-rating');
    const ratingLabel = ratingWidget?.querySelector('.history-filter-stars-label');
    const scoreMinInput = document.getElementById('cfg-history-filter-score-min');
    const scoreMaxInput = document.getElementById('cfg-history-filter-score-max');
    const scoreClearBtn = document.getElementById('cfg-history-filter-score-clear');

    function chipLabelEl(field) {
        return filterRow?.querySelector(`.hfilter-chip[data-field="${field}"] .hfilter-chip-label`);
    }

    function refreshChipLabels() {
        Object.keys(FIELD_LABELS).forEach(field => {
            const el = chipLabelEl(field);
            if (!el) return;
            const value = filterState[field];
            el.textContent = value || el.dataset.default;
            el.closest('.hfilter-chip')?.classList.toggle('is-active', !!value);
        });
        const ratingChip = ratingWidget?.closest('.hfilter-chip');
        ratingChip?.classList.toggle('is-active', filterState.maxRating > 0);
        const ratingChipLabel = ratingChip?.querySelector('.hfilter-chip-label');
        if (ratingChipLabel) ratingChipLabel.textContent = filterState.maxRating > 0 ? `Até ${filterState.maxRating} estrela${filterState.maxRating > 1 ? 's' : ''}` : ratingChipLabel.dataset.default;

        const scoreChipLabel = chipLabelEl('score');
        if (scoreChipLabel) {
            const { minScore, maxScore } = filterState;
            const active = minScore !== null || maxScore !== null;
            let text = scoreChipLabel.dataset.default;
            if (minScore !== null && maxScore !== null) text = minScore === maxScore ? `Nota ${minScore}` : `Nota ${minScore} a ${maxScore}`;
            else if (minScore !== null) text = `Nota ≥ ${minScore}`;
            else if (maxScore !== null) text = `Nota ≤ ${maxScore}`;
            scoreChipLabel.textContent = text;
            scoreChipLabel.closest('.hfilter-chip')?.classList.toggle('is-active', active);
        }

        commentsChip?.classList.toggle('is-active', filterState.onlyComments);
        filterClearChip.style.display = countActiveFilters() > 0 ? 'inline-flex' : 'none';
    }

    // Reconstrói a lista de opções (com busca) de um campo, filtrando pelo
    // termo digitado no combobox do próprio chip.
    function renderChipList(field, searchTerm = '') {
        const listEl = document.getElementById(`cfg-history-filter-${field}-list`);
        if (!listEl) return;
        const term = normalizeName(searchTerm);
        const options = optionsForField(field).filter(v => !term || normalizeName(v).includes(term));

        const allLabel = field === 'unit' ? 'Todas' : 'Todos';
        const itemsHtml = [`<div class="hfilter-chip-item ${!filterState[field] ? 'is-selected' : ''}" data-value="">${allLabel}</div>`]
            .concat(options.map(v => `<div class="hfilter-chip-item ${filterState[field] === v ? 'is-selected' : ''}" data-value="${escapeHtml(v)}">${escapeHtml(v)}</div>`));
        listEl.innerHTML = options.length === 0 && term
            ? `<div class="hfilter-chip-empty">Nada encontrado.</div>`
            : itemsHtml.join('');

        listEl.querySelectorAll('.hfilter-chip-item[data-value]').forEach(item => {
            item.addEventListener('click', () => {
                filterState[field] = item.dataset.value;
                closeAllChipPopovers();
                onFilterChange(field === 'subject' || field === 'theme');
            });
        });
    }

    function refreshAllChipLists() {
        Object.keys(FIELD_LABELS).forEach(field => {
            const search = filterRow?.querySelector(`.hfilter-chip[data-field="${field}"] .hfilter-chip-search`);
            renderChipList(field, search?.value || '');
        });
        refreshChipLabels();
    }

    function onFilterChange(isCrossField) {
        if (isCrossField) refreshAllChipLists();
        else refreshChipLabels();
        currentPage = 1;
        renderTable();
    }

    function closeAllChipPopovers() {
        filterRow?.querySelectorAll('.hfilter-chip.is-open').forEach(chip => chip.classList.remove('is-open'));
    }

    filterRow?.querySelectorAll('.hfilter-chip').forEach(chip => {
        const field = chip.dataset.field;
        const btn = chip.querySelector('.hfilter-chip-btn');
        const search = chip.querySelector('.hfilter-chip-search');

        btn?.addEventListener('click', (event) => {
            event.stopPropagation();
            const isOpen = chip.classList.contains('is-open');
            closeAllChipPopovers();
            if (!isOpen) {
                chip.classList.add('is-open');
                if (search) { renderChipList(field, ''); search.value = ''; search.focus(); }
            }
        });
        chip.addEventListener('click', (event) => event.stopPropagation());
        search?.addEventListener('input', () => renderChipList(field, search.value));
    });
    document.addEventListener('click', closeAllChipPopovers);

    function setRating(value) {
        ratingWidget.dataset.value = String(value);
        ratingWidget.querySelectorAll('i[data-star]').forEach(star => {
            star.classList.toggle('is-filled', Number(star.dataset.star) <= value);
        });
        if (ratingLabel) ratingLabel.textContent = value > 0 ? `Até ${value} estrela${value > 1 ? 's' : ''}` : 'Qualquer';
    }
    ratingWidget?.querySelectorAll('i[data-star]').forEach(star => {
        star.addEventListener('click', (event) => {
            event.stopPropagation();
            const value = Number(star.dataset.star);
            const next = ratingWidget.dataset.value === String(value) ? 0 : value;
            setRating(next);
            filterState.maxRating = next;
            closeAllChipPopovers();
            onFilterChange(false);
        });
    });

    // Faixa de nota: campo vazio = sem limite daquele lado. O valor é lido a
    // cada digitação (sem botão "aplicar"), como os demais chips.
    function readScoreInput(input) {
        const raw = (input?.value ?? '').trim();
        if (raw === '') return null;
        const value = Number(raw);
        if (!Number.isFinite(value)) return null;
        return Math.min(10, Math.max(0, value));
    }

    function onScoreInput() {
        filterState.minScore = readScoreInput(scoreMinInput);
        filterState.maxScore = readScoreInput(scoreMaxInput);
        onFilterChange(false);
    }
    scoreMinInput?.addEventListener('input', onScoreInput);
    scoreMaxInput?.addEventListener('input', onScoreInput);
    scoreClearBtn?.addEventListener('click', () => {
        if (scoreMinInput) scoreMinInput.value = '';
        if (scoreMaxInput) scoreMaxInput.value = '';
        filterState.minScore = null;
        filterState.maxScore = null;
        closeAllChipPopovers();
        onFilterChange(false);
    });

    commentsChip?.addEventListener('click', () => {
        filterState.onlyComments = !filterState.onlyComments;
        onFilterChange(false);
    });

    filterClearChip?.addEventListener('click', () => {
        Object.assign(filterState, {
            subject: '', theme: '', name: '', role: '', unit: '',
            minScore: null, maxScore: null, maxRating: 0, onlyComments: false
        });
        if (scoreMinInput) scoreMinInput.value = '';
        if (scoreMaxInput) scoreMaxInput.value = '';
        setRating(0);
        refreshAllChipLists();
        renderTable();
    });

    // ─── Exportar (visão atual, respeitando busca/filtro/ordenação) ───
    async function exportHistory() {
        const rows = applySort(applyFilters(rowsForCurrentCategory()));
        if (rows.length === 0) { showWarning('Nada para exportar com os filtros atuais.'); return; }

        // A xlsx (881 KB) sai do HTML e é buscada aqui — ver js/vendor-loader.js.
        try {
            if (U.loadVendor) await U.loadVendor('xlsx');
        } catch (error) {
            showWarning('Não foi possível carregar a biblioteca de planilha. Verifique sua conexão e tente novamente.');
            return;
        }

        // Cabeçalhos seguem a nomenclatura da tela (Assunto = curso, Tema =
        // tema-pai). O import aceita as duas ordens, então planilhas antigas
        // (formato do Google Sheets) continuam válidas — ver parseImportRows.
        // A coluna Email acompanha a tabela: só sai em Estágios.
        const exportEmail = U.currentCategorySlug === 'estagios';
        const sheetRows = rows.map(r => ({
            'Data/Hora': r.submittedAt ? new Date(r.submittedAt).toLocaleString('pt-BR') : '',
            'Assunto': r.theme,
            'Tema': r.subject,
            'Nome': r.fullName,
            ...(exportEmail && { 'Email': r.email || '' }),
            'Nota': r.score,
            'Tempo': formatDuration(r.durationSeconds),
            'Conclusão': formatHHMMSS(r.activeMs),
            'Erros': r.errorsText || r.errors || '',
            'Avaliação': r.rating || '',
            'Comentários': r.comment || '',
            'Situação': r.approved ? 'Aprovado' : 'Reprovado',
            'Prazo': (r.deadlineStatus && r.deadlineStatus !== 'livre' && r.deadlineStatus !== 'on_time' && r.deadlineStatus !== 'not_started')
                ? (U.Deadlines?.STATUS_LABELS?.[r.deadlineStatus] || r.deadlineStatus) : '',
            'Unidade': r.unit || '',
            'Cargo': r.role || '',
            'Categoria': CATEGORY_LABELS[r.slug] || r.slug
        }));

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetRows), 'Histórico');
        const date = new Date().toISOString().split('T')[0];
        XLSX.writeFile(wb, `historico_avaliacoes_${date}.xlsx`);
        showWarning('Histórico exportado com sucesso!');
    }
    document.getElementById('cfg-history-export-btn')?.addEventListener('click', exportHistory);

    // ─── Limpar lista (apaga TODO o histórico, todas as categorias) ───
    document.getElementById('cfg-history-clear-btn')?.addEventListener('click', async () => {
        if (allRows.length === 0) { showWarning('Não há histórico para apagar.'); return; }

        const confirmed = await U.showConfirm({
            title: 'Limpar histórico',
            message: `Todos os ${allRows.length} registro(s) de avaliação serão apagados permanentemente.`,
            icon: 'fa-trash-can',
            details: [
                'Afeta Treinamentos, Educação Continuada e Estágios.',
                'O progresso local do aluno (localStorage) não é afetado, só o histórico central.',
                'Contadores de tentativas e cursos bloqueados também são zerados.',
                { text: 'Não há como desfazer — exporte um backup antes, se precisar.', alert: true }
            ],
            requireWord: 'SIM',
            confirmText: 'Apagar tudo'
        });
        if (!confirmed) { showWarning('Operação cancelada.'); return; }

        showSpinner(true);
        try {
            const updates = {
                [`/${dbRoot}/results/byUser`]: null,
                [`/${dbRoot}/results/byCourse`]: null,
                [`/${dbRoot}/results/estagiosLivre`]: null,
                [`/${dbRoot}/results/imported`]: null,
                // Contador de tentativas (js/attempts.js) é derivado do
                // histórico — some junto para não deixar cursos travados
                // "órfãos" sem nenhum resultado que os explique.
                [`/${dbRoot}/attempts/byUser`]: null
            };
            await db.ref().update(updates);
            showWarning('Histórico apagado com sucesso.');
            await populateHistory();
        } catch (error) {
            showWarning('Erro ao apagar histórico: ' + error.message);
        } finally {
            showSpinner(false);
        }
    });

    // ─── Importar (adiciona registros novos, não casa com existentes) ───
    // Cada linha da planilha vira um resultado avulso em results/imported —
    // não vinculado a conta/usuário, uso previsto para trazer dados antigos
    // (ex.: histórico anterior à migração para o Firebase). Não sobrescreve
    // nada: sempre soma novos registros.
    //
    // Formato esperado (igual à planilha do Google Sheets antiga):
    // Data/Hora | Assunto | Tema | Nome | Nota | Erros | Avaliação | Comentários | Situação | Unidade | Cargo
    // "Assunto" aqui é o Tema-pai (categoria de curso) e "Tema" é o curso
    // específico — nomenclatura da planilha antiga, diferente da usada
    // internamente no sistema (onde "Assunto" = curso).
    //
    // Assunto+Tema precisam bater (mesmo nome) com um curso já cadastrado —
    // linhas que não casam são puladas, contadas e reportadas ao final.
    // "Avaliação" é sempre um número de 1 a 5.

    // "Erros" só lista as questões erradas, no formato:
    //   N) pergunta
    //   Resposta: <o que o aluno marcou>
    //   Gabarito: <resposta correta>
    // O número N indica a posição da questão no quiz cadastrado (1-indexed).
    // Questões cadastradas que não aparecem no texto são consideradas
    // acertadas automaticamente (selected = correct).
    function parseErrorBlocks(text) {
        if (!text) return [];
        // Cada bloco começa com "N)" no início de linha; captura até o próximo "N)" ou fim do texto.
        const blocks = text.split(/(?=^\s*\d+\)\s)/m).map(b => b.trim()).filter(Boolean);
        return blocks.map(block => {
            const numMatch = block.match(/^(\d+)\)/);
            // O ";" antes de "Gabarito:" vem do texto que o próprio sistema
            // gera (getDetailedIncorrectAnswers, em js/main.js). Sem aceitá-lo
            // o delimitador não casa e a "Resposta" engolia o gabarito inteiro
            // — aí o match de opção apontava para a alternativa correta e a
            // questão errada aparecia como acerto.
            const respostaMatch = block.match(/Resposta:\s*([\s\S]*?)(?:\n\s*;?\s*Gabarito:|$)/i);
            const gabaritoMatch = block.match(/Gabarito:\s*([\s\S]*?)(?:\n\s*-{3,}\s*$|$)/i);
            return {
                num: numMatch ? Number(numMatch[1]) : null,
                userAnswerText: respostaMatch ? respostaMatch[1].trim() : '',
                correctAnswerText: gabaritoMatch ? gabaritoMatch[1].trim() : ''
            };
        }).filter(b => b.num);
    }

    // Acha o índice da opção do quiz cujo texto mais se aproxima do texto
    // dado (comparação normalizada — a planilha pode truncar/formatar
    // ligeiramente diferente do texto original da opção).
    function matchOptionIndex(options, text) {
        if (!text) return -1;
        const target = normalizeName(text);
        let bestIndex = -1, bestScore = 0;
        (options || []).forEach((opt, idx) => {
            const optNorm = normalizeName(opt);
            if (optNorm === target) { bestIndex = idx; bestScore = Infinity; return; }
            if (bestScore === Infinity) return;
            if (optNorm.includes(target) || target.includes(optNorm)) {
                const score = Math.min(optNorm.length, target.length);
                if (score > bestScore) { bestScore = score; bestIndex = idx; }
            }
        });
        return bestIndex;
    }

    // Monta o array completo de respostas (todas as questões cadastradas),
    // preenchendo erradas a partir do texto e marcando o resto como certo.
    function buildAnswersFromErrorsText(errorsText, questions) {
        if (!questions || questions.length === 0) return [];
        const errorBlocks = parseErrorBlocks(errorsText);
        const errorsByNum = new Map(errorBlocks.map(b => [b.num, b]));

        return questions.map((q, idx) => {
            const num = idx + 1;
            const block = errorsByNum.get(num);
            if (!block) {
                // Não listada como erro: acertou.
                return { question: q.question, options: q.options, correct: q.correct, selected: q.correct };
            }
            const selected = matchOptionIndex(q.options, block.userAnswerText);
            return {
                question: q.question, options: q.options, correct: q.correct,
                // Se não achou a opção pelo texto, marca como "errada" genérica
                // (qualquer índice diferente do correto) para não perder a
                // informação de que a questão foi errada.
                selected: selected >= 0 ? selected : (q.correct === 0 ? 1 : 0)
            };
        });
    }

    // Data/Hora da planilha → timestamp. `new Date(texto)` sozinho não serve:
    // o formato brasileiro ("01/04/2026, 08:33:40" — o mesmo que a exportação
    // desta tela gera) é lido pelo JS como mês/dia, trocando 1º de abril por 4
    // de janeiro, e virando Invalid Date quando o dia passa de 12. Ordem de
    // tentativas: Date (cellDates), serial do Excel, dd/mm/aaaa, ISO.
    function parseSheetDate(raw) {
        if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw.getTime();

        // Número = serial de data do Excel (dias desde 1899-12-30).
        if (typeof raw === 'number' && Number.isFinite(raw)) {
            const parts = XLSX.SSF?.parse_date_code(raw);
            if (!parts) return null;
            return new Date(parts.y, parts.m - 1, parts.d, parts.H || 0, parts.M || 0, Math.floor(parts.S || 0)).getTime();
        }

        const text = String(raw ?? '').trim();
        if (!text) return null;

        // dd/mm/aaaa [hh:mm[:ss]] — com ou sem a vírgula do toLocaleString.
        const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
        if (br) {
            const [, d, m, y, h, min, s] = br;
            const date = new Date(Number(y), Number(m) - 1, Number(d), Number(h || 0), Number(min || 0), Number(s || 0));
            return Number.isNaN(date.getTime()) ? null : date.getTime();
        }

        const parsed = new Date(text);
        return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
    }

    // Coluna "Prazo" da planilha → deadlineStatus. Aceita tanto o rótulo da
    // tela ("No Prazo", "Em atraso") quanto a própria chave ('on_time').
    function parseDeadlineStatus(raw) {
        const text = normalizeName(String(raw ?? ''));
        if (!text) return 'livre';
        const labels = U.Deadlines?.STATUS_LABELS || {};
        if (labels[text]) return text; // já veio como chave
        const match = Object.keys(labels).find(key => normalizeName(labels[key]) === text);
        return match || 'livre';
    }

    // `pairOverrides`: Map opcional de "subjectRaw | themeRaw" (texto bruto da
    // linha) -> chave normalizada do courseIndex, definida pelo usuário na
    // etapa de "unificar temas/assuntos" quando o par não bate automaticamente.
    function parseImportRows(sheet, slug, courseIndex, pairOverrides) {
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        let skippedInvalidCourse = 0;
        const invalidPairs = new Set();

        const parsed = rows.map(row => {
            const get = (...keys) => { for (const k of keys) { if (row[k] !== undefined && row[k] !== '') return row[k]; } return ''; };
            const name = get('Nome', 'nome').toString().trim();
            if (!name) return null;

            const subjectRaw = get('Assunto', 'assunto').toString().trim();
            const themeRaw = get('Tema', 'tema').toString().trim();
            const pairText = `${subjectRaw} | ${themeRaw}`;
            const overrideKey = pairOverrides?.get(pairText);
            // A chave do courseIndex é `tema-pai|curso` sem espaços em volta
            // do "|" — por isso a normalização é feita sobre o par colado, não
            // sobre `pairText` (que só serve de rótulo/chave de override).
            // A segunda tentativa cobre planilhas na ordem inversa (as
            // exportadas por esta tela, onde Assunto = curso).
            const courseMatch = overrideKey
                ? courseIndex.get(overrideKey)
                : (courseIndex.get(normalizeName(`${subjectRaw}|${themeRaw}`))
                    || courseIndex.get(normalizeName(`${themeRaw}|${subjectRaw}`)));
            if (!courseMatch) { skippedInvalidCourse++; invalidPairs.add(pairText); return null; }

            const score = Math.round((Number(get('Nota', 'nota')) || 0) * 10) / 10;
            const ratingRaw = Number(get('Avaliação', 'Avaliacao', 'avaliação', 'avaliacao'));
            const rating = Number.isFinite(ratingRaw) && ratingRaw >= 1 && ratingRaw <= 5 ? ratingRaw : null;
            const dateRaw = get('Data/Hora', 'Data', 'data');
            const submittedAt = parseSheetDate(dateRaw) ?? Date.now();
            const situacao = get('Situação', 'situacao').toString().trim().toLowerCase();
            const errorsText = get('Erros', 'erros').toString().trim();
            const answers = buildAnswersFromErrorsText(errorsText, courseMatch.questions);
            const durationSeconds = parseDurationValue(get('Tempo', 'tempo', 'Duração', 'duracao'));

            return {
                name,
                slug: courseMatch.slug,
                subjectId: courseMatch.subjectId,
                themeId: courseMatch.themeId,
                subject: courseMatch.subject,
                theme: courseMatch.theme,
                score,
                approved: situacao ? situacao.startsWith('aprov') : U.isApproved(score, courseMatch.slug),
                rating,
                errorsText,
                answers,
                comment: get('Comentários', 'Comentário', 'comentarios', 'comentario').toString().trim(),
                unit: get('Unidade', 'unidade').toString().trim(),
                role: get('Cargo', 'cargo').toString().trim(),
                submittedAt,
                durationSeconds,
                deadlineStatus: parseDeadlineStatus(get('Prazo', 'prazo')),
                imported: true
            };
        }).filter(Boolean);

        return { parsed, skippedInvalidCourse, invalidPairs: [...invalidPairs] };
    }

    const importModal = document.getElementById('cfg-history-import-modal');
    const importCategorySelect = document.getElementById('cfg-history-import-category');
    const importOkBtn = document.getElementById('cfg-history-import-ok');
    const importCancelBtn = document.getElementById('cfg-history-import-cancel');
    let pendingImportFile = null;

    const mappingModal = document.getElementById('cfg-history-mapping-modal');
    const mappingList = document.getElementById('cfg-history-mapping-list');
    const mappingOkBtn = document.getElementById('cfg-history-mapping-ok');
    const mappingCancelBtn = document.getElementById('cfg-history-mapping-cancel');

    // Mostra o modal de mapeamento para os pares Assunto/Tema não
    // reconhecidos e resolve com um Map "subjectRaw | themeRaw" -> chave do
    // courseIndex (só as linhas que o usuário de fato escolheu um curso).
    // Resolve com null se o usuário cancelar.
    function resolveInvalidPairs(invalidPairs, courseIndex) {
        return new Promise(resolve => {
            const courseOptions = [...courseIndex.entries()]
                .map(([key, c]) => ({ key, label: `${CATEGORY_LABELS[c.slug]} — ${c.theme} (${c.subject})` }))
                .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));

            mappingList.innerHTML = invalidPairs.map((pair, i) => `
                <div class="mapping-row">
                    <label for="cfg-mapping-select-${i}">${escapeHtml(pair)}</label>
                    <select id="cfg-mapping-select-${i}" data-pair="${escapeHtml(pair)}">
                        <option value="">Ignorar (não importar estas linhas)</option>
                        ${courseOptions.map(o => `<option value="${escapeHtml(o.key)}">${escapeHtml(o.label)}</option>`).join('')}
                    </select>
                </div>
            `).join('');

            mappingModal.style.display = 'flex';

            function cleanup() {
                mappingModal.style.display = 'none';
                mappingOkBtn.removeEventListener('click', onOk);
                mappingCancelBtn.removeEventListener('click', onCancel);
                mappingModal.removeEventListener('click', onBackdrop);
            }
            function onOk() {
                const overrides = new Map();
                mappingList.querySelectorAll('select').forEach(sel => {
                    if (sel.value) overrides.set(sel.dataset.pair, sel.value);
                });
                cleanup();
                resolve(overrides);
            }
            function onCancel() { cleanup(); resolve(null); }
            function onBackdrop(event) { if (event.target === mappingModal) onCancel(); }

            mappingOkBtn.addEventListener('click', onOk);
            mappingCancelBtn.addEventListener('click', onCancel);
            mappingModal.addEventListener('click', onBackdrop);
        });
    }

    document.getElementById('cfg-history-import-file')?.addEventListener('change', (event) => {
        const file = event.target.files[0];
        event.target.value = ''; // permite reimportar o mesmo arquivo depois
        if (!file) return;
        pendingImportFile = file;
        importModal.style.display = 'flex';
    });

    function closeImportModal() { importModal.style.display = 'none'; pendingImportFile = null; }
    importCancelBtn?.addEventListener('click', closeImportModal);
    importModal?.addEventListener('click', (event) => { if (event.target === importModal) closeImportModal(); });

    importOkBtn?.addEventListener('click', async () => {
        const file = pendingImportFile;
        const slug = importCategorySelect.value;
        closeImportModal();
        if (!file) return;

        showSpinner(true);
        try {
            const [buffer, courseIndex] = await Promise.all([
                file.arrayBuffer(),
                fetchCourseIndex(),
                // Leitor de planilha sob demanda — ver js/vendor-loader.js.
                U.loadVendor ? U.loadVendor('xlsx') : Promise.resolve()
            ]);
            // cellDates: células de data chegam como Date em vez de serial.
            const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            if (!sheet) throw new Error('Nenhuma aba encontrada no arquivo.');

            let { parsed, skippedInvalidCourse, invalidPairs } = parseImportRows(sheet, slug, courseIndex);

            // Pares de Assunto/Tema que não bateram automaticamente: pede ao
            // usuário para unificar cada um com um curso já cadastrado, em vez
            // de simplesmente descartar as linhas.
            if (invalidPairs.length > 0) {
                showSpinner(false);
                const overrides = await resolveInvalidPairs(invalidPairs, courseIndex);
                showSpinner(true);
                if (overrides === null) { showWarning('Importação cancelada.'); return; }
                if (overrides.size > 0) {
                    ({ parsed, skippedInvalidCourse, invalidPairs } = parseImportRows(sheet, slug, courseIndex, overrides));
                }
            }

            if (parsed.length === 0) {
                throw new Error(skippedInvalidCourse > 0
                    ? `Nenhuma linha válida: todas as ${skippedInvalidCourse} linha(s) têm Assunto/Tema não cadastrado.\nPares não encontrados: ${invalidPairs.join(' ; ')}`
                    : 'Nenhuma linha válida encontrada (é preciso ao menos a coluna Nome).');
            }

            showSpinner(false);
            const details = [`Arquivo: ${file.name}`, 'Não substituem nem se vinculam a contas existentes — servem para trazer dados antigos.'];
            if (skippedInvalidCourse > 0) {
                details.push({ text: `${skippedInvalidCourse} linha(s) ignorada(s) por Assunto/Tema não cadastrado: ${invalidPairs.join(' ; ')}`, alert: true });
            }
            const confirmed = await U.showConfirm({
                title: 'Importar histórico',
                message: `${parsed.length} registro(s) de ${CATEGORY_LABELS[slug]} serão adicionados como histórico avulso.`,
                icon: 'fa-file-import',
                tone: 'neutral',
                details,
                confirmText: 'Importar'
            });
            if (!confirmed) { showWarning('Importação cancelada.'); return; }

            showSpinner(true);
            const updates = {};
            parsed.forEach(r => {
                const path = `/${dbRoot}/results/imported/${r.slug}`;
                const entryId = ref(db, path).push().key;
                updates[`${path}/${entryId}`] = r;
            });
            await db.ref().update(updates);
            showWarning(`${parsed.length} registro(s) importado(s)${skippedInvalidCourse ? `, ${skippedInvalidCourse} ignorado(s)` : ''} com sucesso!`);
            await populateHistory();
        } catch (error) {
            showWarning('Erro ao importar histórico: ' + error.message);
        } finally {
            showSpinner(false);
        }
    });

    // ─── Modal de comentário (ícone da coluna "Coment.") ───
    const commentModal = document.getElementById('cfg-history-comment-modal');
    const commentMeta = document.getElementById('cfg-history-comment-meta');
    const commentText = document.getElementById('cfg-history-comment-text');

    function openCommentModal(row) {
        if (!commentModal || !row) return;
        const date = row.submittedAt ? new Date(row.submittedAt).toLocaleString('pt-BR') : '—';
        commentMeta.innerHTML = `<strong>${escapeHtml(row.fullName)}</strong>`
            + `<span>${escapeHtml(row.theme)} &bull; ${date}</span>`
            + (row.rating ? `<span class="history-comment-stars">${starsHtml(row.rating)}</span>` : '');
        commentText.textContent = row.comment || '';
        commentModal.style.display = 'flex';
    }
    function closeCommentModal() { if (commentModal) commentModal.style.display = 'none'; }
    document.getElementById('cfg-history-comment-close')?.addEventListener('click', closeCommentModal);
    commentModal?.addEventListener('click', (event) => { if (event.target === commentModal) closeCommentModal(); });

    // ─── Localização do registro no banco ───
    // Cada linha da tabela vem de uma das três origens de results/. Só com o
    // caminho certo (mais o espelho byCourse, quando existe) dá para editar
    // ou excluir sem deixar dado órfão.
    function recordTarget(r) {
        if (r.userId && r.subjectId && r.themeId) {
            return {
                kind: 'byUser',
                paths: [
                    `/${dbRoot}/results/byUser/${r.userId}/${r.slug}/${r.subjectId}/${r.themeId}`,
                    `/${dbRoot}/results/byCourse/${r.slug}/${r.subjectId}/${r.themeId}/${r.userId}`
                ]
            };
        }
        if (r.imported && r.entryId) {
            return { kind: 'imported', paths: [`/${dbRoot}/results/imported/${r.slug}/${r.entryId}`] };
        }
        if (r.entryId && r.subjectId && r.themeId) {
            return { kind: 'estagiosLivre', paths: [`/${dbRoot}/results/estagiosLivre/${r.slug}/${r.subjectId}/${r.themeId}/${r.entryId}`] };
        }
        return null;
    }

    async function deleteRecord(row) {
        const target = recordTarget(row);
        if (!target) { showWarning('Não foi possível localizar este registro no banco.'); return; }

        const date = row.submittedAt ? new Date(row.submittedAt).toLocaleString('pt-BR') : 'sem data';
        const confirmed = await U.showConfirm({
            title: 'Excluir registro',
            message: `O resultado de ${row.fullName} em "${row.theme}" será apagado.`,
            icon: 'fa-trash-can',
            details: [
                `Enviado em ${date} — nota ${formatScore(row.score)}/10.`,
                { text: 'Não há como desfazer.', alert: true }
            ],
            confirmText: 'Excluir'
        });
        if (!confirmed) return;

        showSpinner(true);
        try {
            const updates = {};
            target.paths.forEach(path => { updates[path] = null; });
            await db.ref().update(updates);
            showWarning('Registro excluído com sucesso.');
            await populateHistory();
        } catch (error) {
            showWarning('Erro ao excluir registro: ' + error.message);
        } finally {
            showSpinner(false);
        }
    }

    // ─── Modal de adicionar/editar registro ───
    // Adicionar sempre grava em results/imported (registro avulso, sem
    // vínculo com conta) — mesma trilha do import de planilha. Editar respeita
    // a origem da linha: em byUser/estagiosLivre só os campos do resultado
    // mudam, porque nome/unidade/cargo vêm da conta e o curso vem do caminho.
    const formModal = document.getElementById('cfg-history-form-modal');
    const formTitle = document.getElementById('cfg-history-form-title');
    const formHint = document.getElementById('cfg-history-form-hint');
    const formCategory = document.getElementById('cfg-history-form-category');
    const formCourse = document.getElementById('cfg-history-form-course');
    const formName = document.getElementById('cfg-history-form-name');
    const formUnit = document.getElementById('cfg-history-form-unit');
    const formRole = document.getElementById('cfg-history-form-role');
    const formDate = document.getElementById('cfg-history-form-date');
    const formScore = document.getElementById('cfg-history-form-score');
    const formDuration = document.getElementById('cfg-history-form-duration');
    const formConclusion = document.getElementById('cfg-history-form-conclusion');
    const formApproved = document.getElementById('cfg-history-form-approved');
    const formRating = document.getElementById('cfg-history-form-rating');
    // Prazo: gravado congelado no envio (deadlineStatus). Editável aqui porque
    // é o mesmo ajuste do "desconsiderar atraso" do Dashboard, e registros
    // avulsos/importados entram sempre como 'livre' até serem corrigidos.
    const formDeadline = document.getElementById('cfg-history-form-deadline');
    const formComment = document.getElementById('cfg-history-form-comment');
    const formErrors = document.getElementById('cfg-history-form-errors');
    const formErrorsWrap = document.getElementById('cfg-history-form-errors-wrap');
    const formSaveBtn = document.getElementById('cfg-history-form-save');

    let formMode = 'add';
    let formRow = null;
    let formTargetKind = 'imported';
    let courseIndexCache = null;

    async function ensureCourseIndex(force) {
        if (!courseIndexCache || force) courseIndexCache = await fetchCourseIndex();
        return courseIndexCache;
    }

    function courseKeyOf(row) { return normalizeName(`${row.subject}|${row.theme}`); }

    // Lista de cursos da categoria escolhida, rotulada na nomenclatura da
    // tela: "Assunto (Tema)".
    function fillCourseSelect(index, slug, selectedKey) {
        const options = [...index.entries()]
            .filter(([, course]) => !slug || course.slug === slug)
            .map(([key, course]) => ({ key, label: `${course.theme} (${course.subject})` }))
            .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));

        formCourse.innerHTML = options.length > 0
            ? options.map(o => `<option value="${escapeHtml(o.key)}">${escapeHtml(o.label)}</option>`).join('')
            : '<option value="">Nenhum curso cadastrado nesta categoria</option>';
        if (selectedKey && options.some(o => o.key === selectedKey)) formCourse.value = selectedKey;
    }

    function toDateInputValue(timestamp) {
        const date = timestamp ? new Date(timestamp) : new Date();
        const pad = n => String(n).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    function setFieldEnabled(input, enabled, hint) {
        if (!input) return;
        input.disabled = !enabled;
        const field = input.closest('.history-form-field');
        field?.classList.toggle('is-locked', !enabled);
        const note = field?.querySelector('.history-form-lock');
        if (note) note.textContent = enabled ? '' : (hint || '');
    }

    async function openRecordForm(mode, row) {
        if (!formModal) return;
        formMode = mode;
        formRow = row || null;
        formTargetKind = 'imported';

        showSpinner(true);
        let index;
        try {
            // Recarrega a cada abertura: cursos podem ter sido criados ou
            // renomeados em outra aba desde o último uso do formulário.
            index = await ensureCourseIndex(true);
        } catch (error) {
            showSpinner(false);
            showWarning('Erro ao carregar cursos: ' + error.message);
            return;
        }
        showSpinner(false);

        if (mode === 'add') {
            formTitle.textContent = 'Adicionar registro';
            formHint.textContent = 'O registro entra como histórico avulso (mesma origem dos importados de planilha), sem vínculo com uma conta de aluno.';
            formCategory.value = U.currentCategorySlug || formCategory.value || 'treinamentos';
            fillCourseSelect(index, formCategory.value, null);
            formName.value = '';
            formUnit.value = '';
            formRole.value = '';
            formDate.value = toDateInputValue(null);
            formScore.value = '10';
            formDuration.value = '';
            formConclusion.value = '';
            formApproved.value = 'auto';
            formRating.value = '';
            if (formDeadline) formDeadline.value = 'livre';
            formComment.value = '';
            formErrors.value = '';
            [formCategory, formCourse, formName, formUnit, formRole].forEach(el => setFieldEnabled(el, true));
            formErrorsWrap.style.display = '';
        } else {
            const target = recordTarget(row);
            if (!target) { showWarning('Não foi possível localizar este registro no banco.'); return; }
            formTargetKind = target.kind;

            formTitle.textContent = 'Editar registro';
            formCategory.value = row.slug;
            const courseKey = courseKeyOf(row);
            fillCourseSelect(index, row.slug, courseKey);
            // Curso renomeado/removido depois do registro: em vez de deixar o
            // <select> cair no primeiro item (o que trocaria o curso sem o
            // usuário perceber), obriga uma escolha explícita.
            if (formCourse.value !== courseKey) {
                formCourse.insertAdjacentHTML('afterbegin',
                    `<option value="">— curso não cadastrado: ${escapeHtml(row.theme)} —</option>`);
                formCourse.value = '';
            }
            formName.value = row.fullName === '(conta excluída)' ? '' : (row.fullName || '');
            formUnit.value = row.unit || '';
            formRole.value = row.role || '';
            formDate.value = toDateInputValue(row.submittedAt);
            formScore.value = Number.isFinite(Number(row.score)) ? String(row.score) : '';
            formDuration.value = Number.isFinite(Number(row.durationSeconds)) ? formatDuration(row.durationSeconds) : '';
            formConclusion.value = toHHMMSSInputValue(row.activeMs);
            formApproved.value = row.approved ? '1' : '0';
            formRating.value = row.rating ? String(row.rating) : '';
            if (formDeadline) formDeadline.value = row.deadlineStatus || 'livre';
            formComment.value = row.comment || '';
            formErrors.value = row.errorsText || '';

            const isImported = target.kind === 'imported';
            const lockHint = target.kind === 'byUser'
                ? 'Definido pela conta do aluno / pelo curso respondido.'
                : 'Definido pelo curso respondido.';
            setFieldEnabled(formCategory, isImported, lockHint);
            setFieldEnabled(formCourse, isImported, lockHint);
            setFieldEnabled(formName, isImported || target.kind === 'estagiosLivre', 'Vem do cadastro do aluno.');
            setFieldEnabled(formUnit, isImported, 'Vem do cadastro do aluno.');
            setFieldEnabled(formRole, isImported, 'Vem do cadastro do aluno.');
            // O texto de erros só é reconstruído em gabarito nos registros
            // importados; nos demais o gabarito real vem do quiz respondido e
            // não deve ser reescrito à mão.
            formErrorsWrap.style.display = isImported ? '' : 'none';

            formHint.textContent = isImported
                ? 'Registro avulso — todos os campos podem ser editados.'
                : 'Resultado vinculado ao curso respondido: nome, curso e dados de cadastro não são editáveis aqui.';
        }

        formModal.style.display = 'flex';
        setTimeout(() => formName?.focus(), 60);
    }

    function closeRecordForm() { if (formModal) formModal.style.display = 'none'; formRow = null; }
    document.getElementById('cfg-history-form-close')?.addEventListener('click', closeRecordForm);
    document.getElementById('cfg-history-form-cancel')?.addEventListener('click', closeRecordForm);
    formModal?.addEventListener('click', (event) => { if (event.target === formModal) closeRecordForm(); });

    formCategory?.addEventListener('change', async () => {
        const index = await ensureCourseIndex();
        fillCourseSelect(index, formCategory.value, null);
    });

    async function saveRecordForm() {
        let score = Number(formScore.value);
        if (!Number.isFinite(score) || score < 0 || score > 10) { showWarning('Informe uma nota entre 0 e 10.'); return; }
        score = Math.round(score * 10) / 10;

        const parsedDate = formDate.value ? new Date(formDate.value) : null;
        if (!parsedDate || Number.isNaN(parsedDate.getTime())) { showWarning('Informe uma data/hora válida.'); return; }
        const submittedAt = parsedDate.getTime();

        const durationText = formDuration.value.trim();
        if (durationText && parseDurationValue(durationText) === null) { showWarning('Informe o tempo no formato MM:SS.'); return; }
        const durationSeconds = durationText ? parseDurationValue(durationText) : null;

        const conclusionText = formConclusion.value.trim();
        if (conclusionText && parseHHMMSSValue(conclusionText) === null) { showWarning('Informe a conclusão no formato HH:MM:SS.'); return; }
        const activeMs = conclusionText ? parseHHMMSSValue(conclusionText) : null;

        const approved = formApproved.value === 'auto'
            ? U.isApproved(score, formCategory.value)
            : formApproved.value === '1';
        const rating = formRating.value ? Number(formRating.value) : null;
        const deadlineStatus = formDeadline?.value || 'livre';
        const comment = formComment.value.trim();
        const name = formName.value.trim();

        showSpinner(true);
        try {
            if (formMode === 'add' || formTargetKind === 'imported') {
                if (!name) { showWarning('Informe o nome.'); return; }
                const index = await ensureCourseIndex();
                const course = index.get(formCourse.value);
                if (!course) { showWarning('Selecione um curso cadastrado.'); return; }

                const errorsText = formErrors.value.trim();
                const record = {
                    name,
                    slug: course.slug,
                    subjectId: course.subjectId,
                    themeId: course.themeId,
                    subject: course.subject,
                    theme: course.theme,
                    score, approved,
                    durationSeconds,
                    activeMs,
                    rating,
                    errorsText,
                    answers: buildAnswersFromErrorsText(errorsText, course.questions),
                    comment,
                    unit: formUnit.value.trim(),
                    role: formRole.value.trim(),
                    submittedAt,
                    deadlineStatus,
                    imported: true
                };

                if (formMode === 'add') {
                    const path = `/${dbRoot}/results/imported/${course.slug}`;
                    const entryId = ref(db, path).push().key;
                    await db.ref().update({ [`${path}/${entryId}`]: record });
                    showWarning('Registro adicionado com sucesso.');
                } else {
                    // Trocar a categoria muda o nó pai: apaga o antigo e grava
                    // o novo na mesma operação, para não duplicar a linha.
                    const updates = {};
                    if (course.slug !== formRow.slug) {
                        updates[`/${dbRoot}/results/imported/${formRow.slug}/${formRow.entryId}`] = null;
                        const path = `/${dbRoot}/results/imported/${course.slug}`;
                        updates[`${path}/${ref(db, path).push().key}`] = record;
                    } else {
                        updates[`/${dbRoot}/results/imported/${formRow.slug}/${formRow.entryId}`] = record;
                    }
                    await db.ref().update(updates);
                    showWarning('Registro atualizado com sucesso.');
                }
            } else {
                const target = recordTarget(formRow);
                if (!target) throw new Error('Registro não localizado no banco.');
                const patch = { score, approved, durationSeconds, activeMs, rating, comment, submittedAt, deadlineStatus };
                if (target.kind === 'estagiosLivre') {
                    if (!name) { showWarning('Informe o nome.'); return; }
                    patch.name = name;
                }
                const updates = {};
                target.paths.forEach(path => {
                    Object.entries(patch).forEach(([field, value]) => { updates[`${path}/${field}`] = value; });
                });
                // "Conclusão" (activeMs) de linhas byUser não vem de results,
                // e sim de progress/byUser (ver flatten) — sem isso a edição
                // gravava em results e a tela continuava lendo o valor antigo.
                if (target.kind === 'byUser') {
                    updates[`/${dbRoot}/progress/byUser/${formRow.userId}/${formRow.slug}/${formRow.subjectId}/${formRow.themeId}/activeMs`] = activeMs;
                }
                await db.ref().update(updates);
                showWarning('Registro atualizado com sucesso.');
            }

            closeRecordForm();
            await populateHistory();
        } catch (error) {
            showWarning('Erro ao salvar registro: ' + error.message);
        } finally {
            showSpinner(false);
        }
    }
    formSaveBtn?.addEventListener('click', saveRecordForm);

    document.getElementById('cfg-history-add-btn')?.addEventListener('click', () => openRecordForm('add'));

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        if (formModal?.style.display === 'flex') closeRecordForm();
        else if (commentModal?.style.display === 'flex') closeCommentModal();
    });

    // ─── Modal de detalhe ───
    const detailModal = document.getElementById('cfg-history-detail-modal');
    const detailTitle = document.getElementById('cfg-history-detail-title');
    const detailAttempts = document.getElementById('cfg-history-detail-attempts');
    const detailSummary = document.getElementById('cfg-history-detail-summary');
    const satisfactionBox = document.getElementById('cfg-history-detail-satisfaction');
    const satisfactionBody = document.getElementById('cfg-history-detail-satisfaction-body');
    const questionsBox = document.getElementById('cfg-history-detail-questions');
    const onlyWrongToggle = document.getElementById('cfg-history-detail-only-wrong');
    const closeBtn = document.getElementById('cfg-history-detail-close');

    let currentDetailRow = null;

    function renderQuestions() {
        const row = currentDetailRow;
        if (!row) return;
        const answers = row.answers || [];
        const onlyWrong = onlyWrongToggle?.checked;

        // Fallback: quando o import não conseguiu montar answers[] (curso sem
        // quiz cadastrado no momento da importação), sobra só o texto solto
        // da coluna "Erros" — sem gabarito estruturado por questão, então o
        // filtro "só erradas" não se aplica, e o toggle é ocultado. Na maioria
        // dos casos (Assunto/Tema válidos com quiz cadastrado), answers[] já
        // vem completo do import e cai no fluxo normal abaixo.
        if (answers.length === 0 && row.errorsText) {
            if (onlyWrongToggle) onlyWrongToggle.closest('.history-only-wrong-toggle').style.display = 'none';
            questionsBox.innerHTML = `<div class="history-detail-question is-wrong">
                <div class="q-title wrong"><i class="fas fa-file-lines"></i><span>Erros registrados (planilha importada, sem gabarito estruturado)</span></div>
                <pre style="white-space:pre-wrap;font-family:inherit;font-size:12.5px;color:var(--text-2);margin:0;">${escapeHtml(row.errorsText)}</pre>
            </div>`;
            return;
        }
        if (onlyWrongToggle) { const wrap = onlyWrongToggle.closest('.history-only-wrong-toggle'); if (wrap) wrap.style.display = ''; }

        const visible = answers.filter(a => !onlyWrong || a.selected !== a.correct);
        if (answers.length === 0) {
            questionsBox.innerHTML = '<p class="dashboard-table-empty">Nenhum detalhe de questões disponível para este resultado.</p>';
            return;
        }
        if (visible.length === 0) {
            questionsBox.innerHTML = '<p class="dashboard-table-empty">Nenhuma questão errada — acertou tudo!</p>';
            return;
        }

        questionsBox.innerHTML = visible.map((a, idx) => {
            // Registros antigos podem não ter `selected` (o Realtime Database
            // apaga chaves gravadas como null, caso das questões deixadas em
            // branco no envio automático por tempo) — normaliza para -1 e
            // avisa na tela, em vez de exibir a questão como errada "muda",
            // sem nenhuma alternativa marcada.
            const selected = Number.isFinite(a.selected) ? a.selected : -1;
            const unanswered = selected < 0;
            const isCorrect = selected === a.correct;
            const originalIndex = answers.indexOf(a);
            return `
            <div class="history-detail-question ${isCorrect ? 'is-correct' : 'is-wrong'}">
                <div class="q-title ${isCorrect ? 'correct' : 'wrong'}">
                    <i class="fas ${isCorrect ? 'fa-circle-check' : 'fa-circle-xmark'}"></i>
                    <span>${originalIndex + 1}. ${escapeHtml(a.question)}</span>
                </div>
                ${unanswered ? '<div class="q-option q-option-unanswered">Sem resposta registrada</div>' : ''}
                ${(a.options || []).map((opt, optIdx) => {
                    const wasSelected = optIdx === selected;
                    const isKey = optIdx === a.correct;
                    let cls = 'q-option';
                    if (wasSelected && isKey) cls += ' was-selected is-right';
                    else if (wasSelected && !isKey) cls += ' was-selected is-wrong';
                    else if (isKey) cls += ' is-answer-key';
                    const marker = wasSelected ? '<i class="fas fa-arrow-right" style="margin-right:6px;"></i>' : '';
                    const keyMarker = isKey ? ' <i class="fas fa-check" style="margin-left:6px;"></i>' : '';
                    return `<div class="${cls}">${marker}${escapeHtml(opt)}${keyMarker}</div>`;
                }).join('')}
            </div>`;
        }).join('');
    }

    // O botão de certificado depende do cadastro do curso (courseIndex), que
    // é buscado sob demanda — por isso entra depois que o modal já abriu, em
    // vez de tornar openDetail assíncrono.
    async function renderDetailCertificateButton(row) {
        const holder = document.getElementById('cfg-history-detail-cert');
        if (!holder) return;
        holder.innerHTML = '';
        if (!row.approved) return;

        const courseIndex = await fetchCourseIndex();
        const course = courseIndex.get(normalizeName(`${row.subject}|${row.theme}`));
        if (!U.Certificate?.isEnabled(course)) return;
        if (currentDetailRow !== row) return; // usuário já trocou de tentativa

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'history-cert-btn';
        btn.innerHTML = '<i class="fas fa-award"></i> Baixar certificado';
        btn.addEventListener('click', () => U.Certificate.download({
            studentName: row.fullName,
            course,
            courseName: row.theme,
            submittedAt: row.submittedAt
        }));
        holder.appendChild(btn);
    }

    // `attempts`: opcional, lista de tentativas do mesmo curso (mais recente
    // primeiro) — quando presente, mostra uma barra de pílulas para trocar
    // entre tentativas sem fechar o modal. Usado pelo card de curso do
    // histórico do usuário (admin-users.js) quando há mais de uma tentativa.
    function openDetail(row, attempts) {
        currentDetailRow = row;
        detailTitle.textContent = `${row.theme} — ${row.fullName}`;

        if (attempts && attempts.length > 1) {
            detailAttempts.style.display = 'flex';
            const approvedAttempts = attempts.filter(a => a.approved);
            const reprovedAttempts = attempts.filter(a => !a.approved);
            const pillLabel = a => `${a.submittedAt ? new Date(a.submittedAt).toLocaleDateString('pt-BR') : '—'} &bull; ${formatScore(a.score)}/10`;

            const attemptGroupHtml = (list, kind) => {
                if (list.length === 0) return '';
                const isReproved = kind === 'reproved';
                const btnId = `history-attempt-${kind}-btn`;
                const popoverId = `history-attempt-${kind}-popover`;
                return `
                <div class="history-attempt-group-chip">
                    <button type="button" class="history-attempt-pill history-attempt-group-btn ${isReproved ? 'is-reproved-group' : 'is-approved-group'} ${list.includes(row) ? 'is-active' : ''}" id="${btnId}">
                        <i class="fas ${isReproved ? 'fa-circle-xmark' : 'fa-circle-check'}"></i> ${isReproved ? 'Reprovações' : 'Aprovações'}
                        <span class="user-reproved-count">${list.length}</span>
                    </button>
                    <div class="hfilter-chip-popover" id="${popoverId}">
                        <div class="hfilter-chip-list">
                            ${list.map(a => `
                                <div class="hfilter-chip-item history-attempt-group-item" data-index="${attempts.indexOf(a)}">
                                    ${pillLabel(a)}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>`;
            };

            detailAttempts.innerHTML = attemptGroupHtml(approvedAttempts, 'approved') + attemptGroupHtml(reprovedAttempts, 'reproved');

            detailAttempts.querySelectorAll('.history-attempt-group-btn').forEach(btn => {
                btn.addEventListener('click', (event) => {
                    event.stopPropagation();
                    document.getElementById(btn.id.replace('-btn', '-popover'))?.classList.toggle('is-open');
                });
            });
            detailAttempts.querySelectorAll('.history-attempt-group-item').forEach(item => {
                item.addEventListener('click', () => {
                    detailAttempts.querySelectorAll('.hfilter-chip-popover').forEach(p => p.classList.remove('is-open'));
                    openDetail(attempts[Number(item.dataset.index)], attempts);
                });
            });
        } else {
            detailAttempts.style.display = 'none';
            detailAttempts.innerHTML = '';
        }

        const dateLabel = row.submittedAt ? new Date(row.submittedAt).toLocaleString('pt-BR') : '—';
        detailSummary.innerHTML = `
            <div class="history-detail-summary-item"><span class="label">Categoria</span><span class="value">${escapeHtml(CATEGORY_LABELS[row.slug] || row.slug)}</span></div>
            <div class="history-detail-summary-item"><span class="label">Nota</span><span class="value">${formatScore(row.score)}/10</span></div>
            <div class="history-detail-summary-item"><span class="label">Situação</span><span class="value">${row.approved ? 'Aprovado' : 'Reprovado'}</span></div>
            <div class="history-detail-summary-item"><span class="label">Tempo</span><span class="value">${formatDuration(row.durationSeconds)}</span></div>
            <div class="history-detail-summary-item"><span class="label">Conclusão</span><span class="value">${formatHHMMSS(row.activeMs)}</span></div>
            <div class="history-detail-summary-item"><span class="label">Data</span><span class="value">${dateLabel}</span></div>
            ${(row.deadlineStatus && row.deadlineStatus !== 'livre' && row.deadlineStatus !== 'on_time' && row.deadlineStatus !== 'not_started') ? `<div class="history-detail-summary-item"><span class="label">Prazo</span><span class="value">${escapeHtml(U.Deadlines?.STATUS_LABELS?.[row.deadlineStatus] || row.deadlineStatus)}</span></div>` : ''}
            ${row.unit ? `<div class="history-detail-summary-item"><span class="label">Unidade</span><span class="value">${escapeHtml(row.unit)}</span></div>` : ''}
            ${row.role ? `<div class="history-detail-summary-item"><span class="label">Cargo</span><span class="value">${escapeHtml(row.role)}</span></div>` : ''}
            ${row.email ? `<div class="history-detail-summary-item is-email"><span class="label">Email</span><span class="value">
                <span class="email-text" title="${escapeHtml(row.email)}">${escapeHtml(row.email)}</span>
                <button type="button" class="email-copy-btn" data-copy-email="${escapeHtml(row.email)}" title="Copiar email"><i class="fas fa-copy"></i></button>
            </span></div>` : ''}
        `;

        renderDetailCertificateButton(row);

        if (row.rating || row.comment) {
            satisfactionBox.style.display = 'block';
            satisfactionBody.innerHTML = `
                ${row.rating ? `<div class="stars">${starsHtml(row.rating)}</div>` : ''}
                ${row.comment ? `<div class="comment">${escapeHtml(row.comment)}</div>` : '<div class="comment" style="color:var(--text-3);">Sem comentário.</div>'}
            `;
        } else {
            satisfactionBox.style.display = 'none';
        }

        if (onlyWrongToggle) onlyWrongToggle.checked = false;
        renderQuestions();

        detailModal.style.display = 'flex';
    }

    function closeDetail() { detailModal.style.display = 'none'; }

    // Um listener só para os dois pontos onde o botão aparece (a tabela é
    // remontada a cada render, então o handler fica no container, em captura,
    // para rodar antes do clique de linha que abre o detalhe).
    detailSummary?.addEventListener('click', handleEmailCopyClick);
    document.getElementById('cfg-history-table-wrap')?.addEventListener('click', handleEmailCopyClick, true);

    // Popovers "Aprovações"/"Reprovações" da barra de tentativas: um único
    // listener global (os botões são remontados a cada troca de tentativa,
    // então não podem religar um novo listener por vez sem acumular).
    document.addEventListener('click', (event) => {
        if (event.target.closest('#cfg-history-detail-attempts')) return;
        detailAttempts?.querySelectorAll('.hfilter-chip-popover.is-open').forEach(p => p.classList.remove('is-open'));
    });

    closeBtn?.addEventListener('click', closeDetail);
    detailModal?.addEventListener('click', (event) => { if (event.target === detailModal) closeDetail(); });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && detailModal?.style.display === 'flex') closeDetail();
    });
    onlyWrongToggle?.addEventListener('change', renderQuestions);

    // Exposto para o card de usuário (admin-users.js) abrir o detalhe de uma
    // avaliação a partir do histórico do usuário.
    U.openHistoryDetail = openDetail;
    // Garante allRows carregado e devolve a lista completa (todas categorias)
    // para quem precisar filtrar por usuário sem duplicar fetch/flatten.
    U.getHistoryRows = function () {
        return loadRows();
    };
    // Força um refetch (ex.: depois de "Desconsiderar atraso" no Dashboard,
    // que grava direto no Firebase sem passar por esta aba).
    U.refreshHistoryRows = async function () {
        const rows = await loadRows(true);
        // A tabela só é remontada se a aba Histórico estiver aberta — fora
        // dela seria DOM descartado.
        if (document.getElementById('cfg-history-tab')?.classList.contains('active')) {
            refreshAllChipLists();
            renderTable();
        }
        return rows;
    };
    // Índice de cursos (imagem, descrição, nº de módulos) para os cards do
    // modal de histórico do usuário. Recarrega a cada chamada — não há
    // eventos de invalidação de cache entre abas, e o custo é baixo.
    U.getCourseIndex = function () {
        return fetchCourseIndex();
    };
})();
