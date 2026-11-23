// Dashboard (Configurações): indicadores por colaborador e por curso,
// usando Chart.js. Também abriga a ação "Desconsiderar atraso" (perdão de
// prazo), para não duplicar UI de listagem de resultados em outro lugar.
(function () {
    const U = window.UniAdmin;
    const ref = U.ref, get = U.get, db = U.db, dbRoot = U.dbRoot;
    const showWarning = U.showWarning, showConfirm = U.showConfirm;
    const normalizeName = U.normalizeName;

    // Formata nota com 1 casa decimal (vírgula), ex.: 8,2/10
    function formatScore(score) {
        const n = Number(score);
        if (!Number.isFinite(n)) return score;
        return n.toFixed(1).replace('.', ',');
    }

    // Reconstrói uma data local (meia-noite) a partir do formato "dd/mm/aaaa"
    // usado pelas labels de dia dos gráficos — evita reparsing ambíguo do
    // toLocaleDateString('pt-BR') pelo construtor padrão de Date.
    function parseBrDate(brDate) {
        const [day, month, year] = brDate.split('/').map(Number);
        return new Date(year, month - 1, day).getTime();
    }

    // Duração da avaliação (segundos) em mm:ss — ausente em registros
    // anteriores ao timer da prova.
    function formatDuration(seconds) {
        const n = Number(seconds);
        if (!Number.isFinite(n) || n < 0) return '—';
        const m = Math.floor(n / 60).toString().padStart(2, '0');
        const s = Math.floor(n % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    }

    // Balão colorido da nota (mesmo padrão visual do Histórico).
    function scoreBadgeHtml(score) {
        const n = Number(score);
        if (!Number.isFinite(n)) return '—';
        const cls = n >= 8 ? 'is-high' : n >= 6 ? 'is-mid' : 'is-low';
        return `<span class="hist-score ${cls}"><b>${formatScore(n)}</b><small>/10</small></span>`;
    }

    // Balão colorido da nota numa escala CONTÍNUA vermelho→amarelo→verde
    // (0 a 10), em vez de 3 faixas fixas — usado onde a variação fina de
    // nota importa mais (ex.: comentários da pesquisa de satisfação). Cor
    // calculada inline (não depende de classes CSS) para nunca ficar sem
    // estilo por escopo de seletor.
    function scoreBadgeGradientHtml(score) {
        const n = Number(score);
        if (!Number.isFinite(n)) return '—';
        const t = Math.max(0, Math.min(1, n / 10));
        // vermelho (0) -> amarelo (0.5) -> verde (1), interpolado em HSL
        // (hue 0=vermelho, 50=amarelo, 142=verde) para uma transição suave.
        const hue = t <= 0.5 ? (t / 0.5) * 50 : 50 + ((t - 0.5) / 0.5) * 92;
        const bg = `hsl(${hue.toFixed(0)}, 88%, 94%)`;
        const fg = `hsl(${hue.toFixed(0)}, 70%, 32%)`;
        return `<span class="hist-score" style="background:${bg};color:${fg};"><b>${formatScore(n)}</b><small>/10</small></span>`;
    }

    const CATEGORY_LABELS = { treinamentos: 'Treinamentos', educacao_continuada: 'Educação Continuada', estagios: 'Estágios' };
    const CHART_COLORS = {
        accent: '#4f8ef7', success: '#10b981', danger: '#ef4444', warning: '#f59e0b',
        muted: '#94a3b8', purple: '#8b5cf6', yellow: '#eab308', orange: '#f97316', lime: '#84cc16'
    };
    const MONTH_LABELS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

    // Média de duração de prova (segundos), ignorando linhas sem timer
    // (registros anteriores ao recurso, ver formatDuration).
    function avgDuration(rows) {
        const durations = rows.map(r => Number(r.durationSeconds)).filter(Number.isFinite);
        if (!durations.length) return null;
        return durations.reduce((a, b) => a + b, 0) / durations.length;
    }

    // Agrupa linhas por mês (YYYY-MM de submittedAt), retorna os últimos
    // `months` meses em ordem cronológica, mesmo os sem nenhuma linha (para
    // a tendência não "pular" períodos vazios).
    function groupByMonth(rows, dateField = 'submittedAt', months = 6) {
        const now = new Date();
        const endIndex = monthIndexOf(now.getFullYear(), now.getMonth());
        return countIntoMonthBuckets(rows, buildMonthBuckets(endIndex - (months - 1), endIndex), dateField);
    }

    // Mês como número contínuo (ano * 12 + mês): comparar/contar intervalos de
    // meses vira aritmética simples, sem virada de ano para tratar.
    function monthIndexOf(year, month) { return year * 12 + month; }
    function monthIndexOfDate(ts) {
        const d = new Date(ts);
        return monthIndexOf(d.getFullYear(), d.getMonth());
    }
    // "2026-04" (valor de <input type="month">) → índice contínuo.
    function monthIndexFromInput(value) {
        const match = /^(\d{4})-(\d{2})$/.exec(String(value || ''));
        if (!match) return null;
        return monthIndexOf(Number(match[1]), Number(match[2]) - 1);
    }
    function monthLabelOf(index) {
        const year = Math.floor(index / 12);
        const month = index - year * 12;
        return `${MONTH_LABELS[month]}/${String(year).slice(2)}`;
    }

    function buildMonthBuckets(startIndex, endIndex) {
        const buckets = [];
        for (let i = startIndex; i <= endIndex; i++) {
            const year = Math.floor(i / 12);
            buckets.push({ key: `${year}-${i - year * 12}`, label: monthLabelOf(i), count: 0 });
        }
        return buckets;
    }

    function countIntoMonthBuckets(rows, buckets, dateField = 'submittedAt') {
        const byKey = new Map(buckets.map(b => [b.key, b]));
        rows.forEach(r => {
            const ts = r[dateField];
            if (!ts) return;
            const d = new Date(ts);
            const bucket = byKey.get(`${d.getFullYear()}-${d.getMonth()}`);
            if (bucket) bucket.count++;
        });
        return buckets;
    }

    // Recorte por intervalo de meses (chip "Período"): `range` é
    // { start, end } no formato "AAAA-MM", com qualquer um dos lados podendo
    // vir vazio (aberto daquele lado). Linhas sem data ficam de fora assim
    // que há qualquer limite definido — não dá pra afirmar que caem no
    // intervalo pedido.
    function filterRowsByMonthRange(rows, range) {
        const startIndex = monthIndexFromInput(range?.start);
        const endIndex = monthIndexFromInput(range?.end);
        if (startIndex === null && endIndex === null) return rows;
        const min = startIndex === null ? -Infinity : startIndex;
        const max = endIndex === null ? Infinity : endIndex;
        return rows.filter(r => {
            if (!r.submittedAt) return false;
            const index = monthIndexOfDate(r.submittedAt);
            return index >= min && index <= max;
        });
    }

    // Barras de "Prazo por Mês": seguem o período escolhido no chip quando
    // ele existe; sem período, cobrem do primeiro ao último mês com dados.
    // Teto de 24 barras pra um intervalo largo não espremer o gráfico até
    // virar rabisco.
    const MONTH_BUCKET_MAX = 24;
    function monthBucketsForRange(range, rows, year) {
        let startIndex = monthIndexFromInput(range?.start);
        let endIndex = monthIndexFromInput(range?.end);
        const indexes = rows.map(r => r.submittedAt ? monthIndexOfDate(r.submittedAt) : null).filter(i => i !== null);
        if (startIndex === null && endIndex === null) {
            // Chip de ano sem período: as barras são o ano inteiro. Sem isso
            // as 6 barras continuavam ancoradas no mês de hoje e um filtro de
            // 2025 desenhava meses de 2026 todos zerados — o gráfico parecia
            // ignorar o filtro.
            if (year) return buildMonthBuckets(monthIndexOf(Number(year), 0), monthIndexOf(Number(year), 11));
            // "Todo o histórico": o intervalo real dos dados. A janela fixa
            // dos últimos 6 meses escondia conclusões mais antigas — um
            // atraso de 2025 sumia do gráfico enquanto o texto ao lado o
            // contava.
            if (indexes.length) {
                endIndex = Math.max(...indexes);
                startIndex = Math.max(Math.min(...indexes), endIndex - (MONTH_BUCKET_MAX - 1));
                return buildMonthBuckets(startIndex, endIndex);
            }
            const now = new Date();
            endIndex = monthIndexOf(now.getFullYear(), now.getMonth());
            return buildMonthBuckets(endIndex - 5, endIndex);
        }
        const now = new Date();
        const fallback = monthIndexOf(now.getFullYear(), now.getMonth());
        if (startIndex === null) startIndex = indexes.length ? Math.min(...indexes) : endIndex;
        if (endIndex === null) endIndex = indexes.length ? Math.max(...indexes) : fallback;
        if (startIndex > endIndex) [startIndex, endIndex] = [endIndex, startIndex];
        if (endIndex - startIndex + 1 > MONTH_BUCKET_MAX) startIndex = endIndex - (MONTH_BUCKET_MAX - 1);
        return buildMonthBuckets(startIndex, endIndex);
    }

    // Agrupa linhas por pessoa+curso (mesma chave de personKeysOfRow) para
    // contar quantas tentativas cada um teve e se aprovou ao final —
    // usado no gráfico de retentativas.
    function attemptsByPerson(rows) {
        const byPerson = new Map();
        rows.forEach(row => {
            const keys = personKeysOfRow(row);
            const key = keys[0];
            if (!key) return;
            if (!byPerson.has(key)) byPerson.set(key, []);
            byPerson.get(key).push(row);
        });
        return [...byPerson.values()].map(personRows => {
            const sorted = personRows.slice().sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0));
            const last = sorted[sorted.length - 1];
            return { attempts: sorted.length, approved: !!last.approved };
        });
    }

    // Última tentativa de cada pessoa — usado por gráficos que devem refletir
    // a situação final do curso, não repetir cada tentativa (ex.: prazo de
    // realização não deve contar 2x quem tentou e reenviou).
    function lastAttemptByPerson(rows) {
        const byPerson = new Map();
        rows.forEach(row => {
            const key = personKeysOfRow(row)[0];
            if (!key) return;
            if (!byPerson.has(key)) byPerson.set(key, []);
            byPerson.get(key).push(row);
        });
        return [...byPerson.values()].map(personRows =>
            personRows.slice().sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0)).pop()
        );
    }

    // Categorias sem público definido por função: estágio é individual, não
    // tem "quem falta fazer" a calcular.
    const AUDIENCE_EXEMPT_SLUGS = ['estagios'];

    let initialized = false;
    // Modo do dashboard: 'course' | 'user' | 'unit'. Antes o modo ativo era
    // deduzido do `style.display` do picker de cada modo; com três modos isso
    // virava uma negação de outra negação em cada guard. Agora é estado, e o
    // display é consequência dele.
    let dashMode = 'course';
    // Falso até a primeira `loadBaseData()` terminar. Sem isto os cards
    // renderizavam durante o carregamento com o estado ainda vazio e exibiam
    // "Nenhum tema cadastrado nesta categoria." — a tela dizia que não havia
    // conteúdo quando o que havia era espera. Em uma base de ~4 MB isso durava
    // vários segundos e lia-se como dashboard quebrado.
    let baseDataLoaded = false;
    let baseLoadFailed = false;
    let allUsers = {};
    let allColaboradores = {};
    // Linhas do histórico (mesma fonte que a aba Histórico: results/byUser +
    // estagiosLivre + imported, já com nomes de assunto/tema resolvidos) —
    // o dashboard não lê mais results/byUser diretamente, para não ficar
    // dessincronizado dos dados que o histórico mostra (ex.: registros
    // importados de planilha antiga ficavam de fora dos gráficos).
    let historyRows = [];
    let allTrainingData = {}; // allTrainingData[slug] = trainingData
    let allQuizData = {};     // allQuizData[slug] = quizData (contagem de questões nos cards)
    let allProgress = {};     // allProgress[userId][slug][subjectId][themeId] = { total, done, pct, startedAt, activeMs, updatedAt }
    const chartInstances = {};

    function destroyChart(key) {
        if (chartInstances[key]) { chartInstances[key].destroy(); delete chartInstances[key]; }
    }

    function renderChart(key, canvasId, config) {
        destroyChart(key);
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        chartInstances[key] = new Chart(canvas, config);
    }

    // Charts desenhados enquanto a aba deles ainda está display:none (ex.:
    // abas "Gráficos" dos modais de curso/usuário, que não são a aba ativa
    // por padrão) nascem medindo altura 0 e o Chart.js congela um layout
    // achatado — as coordenadas internas (ex.: as usadas pelo
    // stddevWhiskerPlugin pra desenhar a barra de erro) ficam fora de
    // sincronia com o tamanho real que a barra passa a ter quando a aba
    // fica visível. Chamado ao entrar na aba: resize() força o Chart.js a
    // remedir o canvas agora visível e realinha tudo.
    function resizeChartsIn(container) {
        if (!container) return;
        container.querySelectorAll('canvas').forEach(canvas => {
            const instance = Object.values(chartInstances).find(c => c.canvas === canvas);
            instance?.resize();
        });
    }

    // Tooltip padrão "valor (xx%)" para gráficos de pizza — % sobre o total
    // do dataset.
    function pieTooltipLabel(ctx) {
        const total = ctx.dataset.data.reduce((a, b) => a + (Number(b) || 0), 0);
        const value = Number(ctx.parsed) || 0;
        const pct = total > 0 ? Math.round((value / total) * 100) : 0;
        return `${ctx.label}: ${value} (${pct}%)`;
    }

    // Tooltip padrão "valor (xx%)" para barras empilhadas — % sobre a soma de
    // todos os datasets naquele índice (a categoria inteira), não o total do
    // gráfico.
    function percentTooltipLabel(ctx) {
        const index = ctx.dataIndex;
        const total = ctx.chart.data.datasets.reduce((sum, ds) => sum + (Number(ds.data[index]) || 0), 0);
        const value = Number(ctx.parsed.x ?? ctx.parsed.y) || 0;
        const pct = total > 0 ? Math.round((value / total) * 100) : 0;
        return `${ctx.dataset.label}: ${value} (${pct}%)`;
    }

    // Tooltip padrão "valor (xx%)" para barra com um único dataset (não
    // empilhado) — % sobre a soma de todas as categorias do próprio dataset.
    function singleSeriesTooltipLabel(ctx) {
        const total = ctx.dataset.data.reduce((sum, v) => sum + (Number(v) || 0), 0);
        const value = Number(ctx.parsed.x ?? ctx.parsed.y) || 0;
        const pct = total > 0 ? Math.round((value / total) * 100) : 0;
        return `${value} (${pct}%)`;
    }

    // ─── Carga inicial + sincronização ao vivo ───
    async function loadBaseData() {
        const slugs = Object.keys(CATEGORY_LABELS);
        const [usersSnap, colabsSnap, progressSnap, rows, ...snaps] = await Promise.all([
            get(ref(db, `/${dbRoot}/users`)),
            get(ref(db, `/${dbRoot}/colaboradores`)),
            get(ref(db, `/${dbRoot}/progress/byUser`)),
            U.getHistoryRows(),
            ...slugs.map(slug => get(ref(db, `/${dbRoot}/${slug}/trainingData`))),
            ...slugs.map(slug => get(ref(db, `/${dbRoot}/${slug}/quizData`)))
        ]);
        allUsers = usersSnap.exists() ? usersSnap.val() : {};
        allColaboradores = colabsSnap.exists() ? colabsSnap.val() : {};
        allProgress = progressSnap.exists() ? progressSnap.val() : {};
        historyRows = rows;
        allTrainingData = {};
        allQuizData = {};
        slugs.forEach((slug, i) => {
            allTrainingData[slug] = snaps[i].exists() ? snaps[i].val() : {};
            allQuizData[slug] = snaps[slugs.length + i].exists() ? snaps[slugs.length + i].val() : {};
        });
    }

    // ─── Modo: por colaborador ───
    // Grade de cards (um por colaborador de /colaboradores, a mesma lista
    // que alimenta Usuários), com busca + filtros de unidade/função no
    // mesmo padrão dos chips usados em Usuários/Histórico. Clicar num card
    // abre um modal com histórico + gráficos, espelhando o modal "por curso".
    const userSearchInput = document.getElementById('cfg-dash-user-search');
    const userCardsBox = document.getElementById('cfg-dash-user-cards');
    const userFilterRow = document.getElementById('cfg-dash-user-filter-row');
    const userFilterClear = document.getElementById('cfg-dash-user-filter-clear');
    let selectedUserId = null; // colaboradorId do card/modal aberto
    const userListFilters = { unit: '', role: '' };
    let userSearchTerm = '';

    // Linhas de histórico de um colaborador — casadas pela conta
    // (accountUserId) ou, na falta dela, pelo nome normalizado (mesmo
    // critério de personKeysOfColaborador/personKeysOfRow usado no público
    // dos cursos), para incluir também registros importados sem conta.
    //
    // Sempre recortado pela categoria selecionada nas Configurações: o painel
    // inteiro é por plataforma, então o modal do colaborador não pode somar
    // Treinamentos com Educação Continuada e Estágios num número só.
    function flattenColaboradorResults(colab) {
        const keys = new Set(personKeysOfColaborador(colab));
        const slug = currentSlug();
        return historyRows
            .filter(r => r.slug === slug)
            .filter(r => personKeysOfRow(r).some(key => keys.has(key)))
            .sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0));
    }

    // Chave de curso de uma linha do histórico: prefere os ids (mais
    // precisos), cai para o nome normalizado quando a linha é de importação
    // de planilha/estágio livre e não tem subjectId/themeId.
    function rowCourseKey(row) {
        if (row.slug && row.subjectId && row.themeId) return `${row.slug}_${row.subjectId}_${row.themeId}`;
        return normalizeName(`${row.subject || ''}|${row.theme || ''}`);
    }

    // Última tentativa de cada curso — usado nos gráficos do colaborador, que
    // olham vários cursos de uma só pessoa e não devem repetir cada
    // tentativa/reenvio, só a situação final de cada curso.
    function lastAttemptByCourse(rows) {
        const byCourse = new Map();
        rows.forEach(row => {
            const key = rowCourseKey(row);
            if (!byCourse.has(key)) byCourse.set(key, []);
            byCourse.get(key).push(row);
        });
        return [...byCourse.values()].map(courseRows =>
            courseRows.slice().sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0)).pop()
        );
    }

    // Equivalente a attemptsByPerson, mas do ponto de vista do colaborador:
    // agrupa as linhas DELE por curso para contar quantas tentativas cada
    // curso teve e como terminou — base do gráfico "Retentativas" do modal
    // do colaborador e dos cards do relatório.
    //
    // A situação é a da ÚLTIMA tentativa, a mesma que os cards de "situação
    // final" mostram: quem aprovou, refez e reprovou está reprovado hoje.
    // Contar "aprovou alguma vez" fazia o card dizer "Reprovado" enquanto o
    // resumo e o plano de ação tratavam o curso como resolvido.
    // `attempts` é o total de envios no período, não só até a 1ª aprovação:
    // senão um curso com três provas aparecia como "1 tentativa".
    function attemptsByCourse(rows) {
        const byCourse = new Map();
        rows.forEach(row => {
            const key = rowCourseKey(row);
            if (!byCourse.has(key)) byCourse.set(key, []);
            byCourse.get(key).push(row);
        });
        return [...byCourse.entries()].map(([key, courseRows]) => {
            const sorted = courseRows.slice().sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0));
            const last = sorted[sorted.length - 1];
            const approved = !!last.approved;
            const hadFailure = sorted.some(r => !r.approved);
            return {
                key,
                name: last.theme || last.subject || '—',
                approved,
                attempts: sorted.length,
                firstTry: approved && !hadFailure,
                retried: approved && hadFailure
            };
        });
    }

    // Prazo de um envio. Curso sem prazo ('livre') não tem limite a cumprir
    // nem a perder, então fica fora do percentual de cumprimento — contá-lo
    // como "no prazo" inflava a taxa com cursos que nunca tiveram data.
    function hasDeadline(status) { return !!status && status !== 'livre'; }
    function isLateStatus(status) { return hasDeadline(status) && !isOnTime(status); }
    // Cor da célula "Prazo" nas planilhas: sem prazo fica neutro, não verde.
    function deadlineTone(status) {
        if (!hasDeadline(status)) return undefined;
        return isOnTime(status) ? 'ok' : 'bad';
    }

    // Nome legível do curso de uma linha de histórico — rótulo das barras
    // "por curso" nos gráficos do colaborador.
    function rowCourseLabel(row) { return row.theme || row.subject || '—'; }

    function userCardStats(colab) {
        const rows = flattenColaboradorResults(colab);
        const scores = rows.map(r => Number(r.score) || 0);
        const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
        // "Com atraso" conta cursos, não tentativas: um curso entra na conta
        // uma única vez, mesmo que tenha mais de um resultado atrasado.
        const lateCourseKeys = new Set();
        rows.forEach(r => {
            if (!['on_time', 'livre', 'forgiven'].includes(r.deadlineStatus)) lateCourseKeys.add(rowCourseKey(r));
        });
        const late = lateCourseKeys.size;
        return { rows, avg, attempts: rows.length, late };
    }

    function userFilterOptions(field) {
        const values = new Set();
        Object.values(allColaboradores).forEach(c => { if (c?.[field]) values.add(String(c[field]).trim()); });
        return [...values].filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    }

    function closeUserFilterPopovers() {
        userFilterRow?.querySelectorAll('.hfilter-chip.is-open').forEach(chip => chip.classList.remove('is-open'));
    }

    function refreshUserFilterChips() {
        ['unit', 'role'].forEach(field => {
            const chip = userFilterRow?.querySelector(`.hfilter-chip[data-field="${field}"]`);
            const label = chip?.querySelector('.hfilter-chip-label');
            if (!label) return;
            label.textContent = userListFilters[field] || label.dataset.default;
            chip.classList.toggle('is-active', !!userListFilters[field]);
        });
        const searchChip = userFilterRow?.querySelector('.hfilter-search-chip');
        searchChip?.classList.toggle('is-active', !!userSearchTerm);
        if (userFilterClear) userFilterClear.style.display = (userListFilters.unit || userListFilters.role) ? 'inline-flex' : 'none';
    }

    function renderUserFilterList(field, searchTerm = '') {
        const listEl = document.getElementById(`cfg-dash-user-filter-${field}-list`);
        if (!listEl) return;
        const term = normalizeName(searchTerm);
        const options = userFilterOptions(field).filter(v => !term || normalizeName(v).includes(term));
        const allLabel = field === 'unit' ? 'Todas' : 'Todas as funções';

        listEl.innerHTML = options.length === 0 && term
            ? '<div class="hfilter-chip-empty">Nada encontrado.</div>'
            : [`<div class="hfilter-chip-item ${!userListFilters[field] ? 'is-selected' : ''}" data-value="">${allLabel}</div>`]
                .concat(options.map(v => `<div class="hfilter-chip-item ${userListFilters[field] === v ? 'is-selected' : ''}" data-value="${escapeHtml(v)}">${escapeHtml(v)}</div>`))
                .join('');

        listEl.querySelectorAll('.hfilter-chip-item[data-value]').forEach(item => {
            item.addEventListener('click', () => {
                userListFilters[field] = item.dataset.value;
                closeUserFilterPopovers();
                refreshUserFilterChips();
                renderUserCards();
            });
        });
    }

    userFilterRow?.querySelectorAll('.hfilter-chip').forEach(chip => {
        const field = chip.dataset.field;
        const isSearchChip = field === 'search';
        const btn = chip.querySelector('.hfilter-chip-btn');
        const search = chip.querySelector('.hfilter-chip-search');

        btn?.addEventListener('click', (event) => {
            event.stopPropagation();
            const isOpen = chip.classList.contains('is-open');
            closeUserFilterPopovers();
            if (isOpen) return;
            chip.classList.add('is-open');
            if (isSearchChip) {
                // O autofill do navegador pode preencher o campo sem que o
                // usuário digite nada: abre sempre vazio.
                if (search && search.value) {
                    search.value = '';
                    userSearchTerm = '';
                    renderUserCards();
                    refreshUserFilterChips();
                }
                search?.focus();
                return;
            }
            if (search) search.value = '';
            renderUserFilterList(field, '');
            search?.focus();
        });
        chip.addEventListener('click', (event) => event.stopPropagation());
        if (!isSearchChip) search?.addEventListener('input', () => renderUserFilterList(field, search.value));
    });
    document.addEventListener('click', closeUserFilterPopovers);

    userFilterClear?.addEventListener('click', () => {
        userListFilters.unit = '';
        userListFilters.role = '';
        refreshUserFilterChips();
        renderUserCards();
    });

    userSearchInput?.addEventListener('input', () => {
        userSearchTerm = userSearchInput.value;
        refreshUserFilterChips();
        renderUserCards();
    });

    function buildUserCard(colabId, colab) {
        const stats = userCardStats(colab);
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'dash-user-card';
        if (colabId === selectedUserId) card.classList.add('is-selected');

        card.innerHTML = `
            ${avatarHtml(colab.fullName)}
            <div class="dash-user-card-body">
                <h3>${escapeHtml(colab.fullName)}</h3>
                <div class="dash-user-card-tags">
                    ${colab.role ? `<span class="dash-user-card-tag"><i class="fas fa-briefcase"></i> ${escapeHtml(colab.role)}</span>` : ''}
                    ${colab.unit ? `<span class="dash-user-card-tag"><i class="fas fa-building"></i> ${escapeHtml(colab.unit)}</span>` : ''}
                </div>
                <div class="dash-user-card-stats">
                    <span><i class="fas fa-clipboard-list"></i> ${stats.attempts} ${stats.attempts === 1 ? 'curso' : 'cursos'}</span>
                    <span><i class="fas fa-star"></i> ${stats.avg === null ? '—' : 'Média ' + stats.avg.toFixed(1).replace('.', ',')}</span>
                    ${stats.late > 0 ? `<span class="is-warn"><i class="fas fa-triangle-exclamation"></i> ${stats.late} concluído com atraso</span>` : ''}
                </div>
            </div>`;
        card.onclick = () => {
            selectedUserId = colabId;
            userCardsBox.querySelectorAll('.dash-user-card').forEach(c => c.classList.remove('is-selected'));
            card.classList.add('is-selected');
            openUserModal(colabId, colab);
        };
        return card;
    }

    function renderUserCards() {
        if (!userCardsBox) return;
        const inUserMode = dashMode === 'user';
        const empty = document.getElementById('cfg-dash-empty');
        if (!inUserMode) { userCardsBox.style.display = 'none'; return; }

        if (!baseDataLoaded) {
            userCardsBox.style.display = 'block';
            if (empty) empty.style.display = 'none';
            userCardsBox.innerHTML = pendingCardsHtml();
            return;
        }

        const term = normalizeName(userSearchTerm);
        const entries = Object.keys(allColaboradores)
            .map(id => ({ id, colab: allColaboradores[id] }))
            .filter(({ colab }) => colab?.fullName)
            .filter(({ colab }) => !term || normalizeName(colab.fullName).includes(term))
            .filter(({ colab }) => !userListFilters.unit || (colab.unit || '') === userListFilters.unit)
            .filter(({ colab }) => !userListFilters.role || (colab.role || '') === userListFilters.role)
            .sort((a, b) => a.colab.fullName.localeCompare(b.colab.fullName, 'pt-BR'));

        userCardsBox.style.display = entries.length ? 'grid' : 'block';
        if (empty) empty.style.display = 'none';
        if (entries.length === 0) {
            userCardsBox.innerHTML = '<p class="dashboard-table-empty">Nenhum colaborador encontrado.</p>';
            return;
        }
        userCardsBox.innerHTML = '';
        entries.forEach(({ id, colab }) => userCardsBox.appendChild(buildUserCard(id, colab)));
    }

    // ─── Modal do colaborador ───
    const userModal = document.getElementById('cfg-dash-user-modal');
    const userModalTitle = document.getElementById('cfg-dash-user-modal-title');
    const userModalClose = document.getElementById('cfg-dash-user-modal-close');
    const userHeroThumb = document.getElementById('cfg-dash-user-hero-thumb');
    const userHeroTags = document.getElementById('cfg-dash-user-hero-tags');
    const userHeroStats = document.getElementById('cfg-dash-user-hero-stats');

    // O recorte de data é zerado ao FECHAR, não ao repintar: a sincronização
    // ao vivo chama renderUserDashboard() com o mesmo colaborador várias
    // vezes por sessão e resetar lá apagava o período que o gestor acabou de
    // aplicar, devolvendo os gráficos ao histórico inteiro sozinhos.
    function closeUserModal() {
        if (userModal) userModal.style.display = 'none';
        userChartRangeChip.reset();
        userChartRoleChip.clear();
        userChartCourseChip.clear();
    }

    function openUserModal(colabId, colab) {
        if (!userModal) return;
        userModalTitle.textContent = colab.fullName || 'Colaborador';
        if (userHeroThumb) userHeroThumb.textContent = themeInitials(colab.fullName);
        if (userHeroTags) {
            userHeroTags.innerHTML = `
                ${colab.role ? `<span class="dash-course-subject-tag"><i class="fas fa-briefcase"></i> ${escapeHtml(colab.role)}</span>` : ''}
                ${colab.unit ? `<span class="dash-course-subject-tag"><i class="fas fa-building"></i> ${escapeHtml(colab.unit)}</span>` : ''}`;
        }

        userModal.querySelectorAll('.dash-course-modal-tabs .tab-btn').forEach((btn, i) => btn.classList.toggle('active', i === 0));
        userModal.querySelectorAll('.dash-course-modal-body .tab-content').forEach((tab, i) => tab.classList.toggle('active', i === 0));
        userModal.style.display = 'flex';
        renderUserDashboard(colab, userHeroStats);
    }

    userModal?.querySelectorAll('.dash-course-modal-tabs .tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            userModal.querySelectorAll('.dash-course-modal-tabs .tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const target = btn.dataset.dashUserTab;
            userModal.querySelectorAll('.dash-course-modal-body .tab-content').forEach(tab => {
                tab.classList.toggle('active', tab.id === `cfg-dash-user-tab-${target}`);
            });
            // Ver comentário de resizeChartsIn: aba "charts" some no
            // primeiro paint, gráficos nascem achatados.
            if (target === 'charts') resizeChartsIn(userModal);
        });
    });
    userModalClose?.addEventListener('click', closeUserModal);
    userModal?.addEventListener('click', (event) => { if (event.target === userModal) closeUserModal(); });
    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || userModal?.style.display !== 'flex') return;
        // Escape fecha só o modal do topo: com o detalhamento ou o detalhe da
        // avaliação abertos por cima, fechar o modal do colaborador junto
        // faria perder o contexto inteiro num toque.
        if (isAnyDashboardChildModalOpen()) return;
        closeUserModal();
    });

    function renderUserHistoryTable(rows) {
        const container = document.getElementById('cfg-dash-user-history');
        const countEl = document.getElementById('cfg-dash-user-tabcount-history');
        if (countEl) countEl.textContent = String(rows.length);
        if (!container) return;
        if (rows.length === 0) {
            container.innerHTML = emptyStateHtml('fa-clipboard-list', 'Nenhum curso realizado ainda.');
            return;
        }
        const sorted = rows.slice().sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
        container.innerHTML = `<table class="is-sticky dash-cards">
            <thead><tr><th>Data</th><th>Curso</th><th>Nota</th><th>Tempo</th><th>Conclusão</th><th>Prazo</th><th>Situação</th></tr></thead>
            <tbody>${sorted.map((r, i) => {
                const dateLabel = r.submittedAt ? new Date(r.submittedAt).toLocaleString('pt-BR') : '—';
                const situationOk = !!r.approved;
                // "Tempo" é a duração da prova; "Conclusão" é o tempo ativo
                // com o curso aberto até aprovar (activeMs de progress/byUser,
                // mesma coluna do Histórico). Só existe para quem tem conta e
                // concluiu depois da métrica passar a ser gravada.
                const activeMs = r.userId ? allProgress[r.userId]?.[r.slug]?.[r.subjectId]?.[r.themeId]?.activeMs : null;
                return `<tr style="--row-i:${i}">
                    <td data-label="Data/Hora">${dateLabel}</td>
                    <td data-label="Curso">${escapeHtml(r.theme || r.subject || '—')}</td>
                    <td data-label="Nota">${scoreBadgeHtml(r.score)}</td>
                    <td data-label="Tempo">${formatDuration(r.durationSeconds)}</td>
                    <td data-label="Conclusão">${formatHHMMSS(activeMs)}</td>
                    <td data-label="Prazo">${deadlineBadgeHtml(r.deadlineStatus)}</td>
                    <td data-label="Situação"><span class="conclusion-situation ${situationOk ? 'is-ok' : 'is-bad'}"><i class="fas ${situationOk ? 'fa-circle-check' : 'fa-circle-xmark'}"></i> ${situationOk ? 'Aprovado' : 'Reprovado'}</span></td>
                </tr>`;
            }).join('')}</tbody>
        </table>`;
    }

    // Selo de média no cabeçalho do "Histórico de Notas". Anda junto com os
    // filtros de ano/período: é a média das notas que estão no gráfico, não a
    // média geral do colaborador (essa fica no hero, no topo do modal).
    function paintUserScoresAvg(scores) {
        const el = document.getElementById('cfg-dash-user-scores-avg');
        if (!el) return;
        const valid = scores.map(Number).filter(Number.isFinite);
        if (valid.length === 0) {
            el.className = 'panel-header-stat';
            el.innerHTML = '<i class="fas fa-star"></i> Sem notas no período';
            return;
        }
        const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
        const tone = avg >= 8 ? 'is-high' : avg >= 6 ? 'is-mid' : 'is-low';
        el.className = `panel-header-stat ${tone}`;
        el.innerHTML = `<i class="fas fa-star"></i> Média ${formatScore(avg)} <small>· ${valid.length} ${valid.length === 1 ? 'nota' : 'notas'}</small>`;
    }

    // Média fixa do período: linha horizontal na média de todas as notas, para
    // comparar cada prova com o desempenho geral em vez de uma tendência local.
    function fixedAverageLine(values) {
        const valid = values.map(Number).filter(Number.isFinite);
        if (!valid.length) return values.map(() => null);
        const avgValue = valid.reduce((a, b) => a + b, 0) / valid.length;
        return values.map(() => avgValue);
    }

    let userChartRowsCache = [];
    let userChartColabCache = null;
    function repaintUserCharts() {
        if (!userChartColabCache) return;
        // Repopula as opções de curso antes de desenhar: mudar data ou
        // função muda quais cursos existem no recorte, e `setOptions` já
        // descarta da seleção o que saiu de cena.
        userChartCourseChip.setOptions(userCourseOptions(userChartColabCache, userChartRowsCache));
        renderUserCharts(userChartColabCache, userChartRowsCache);
    }
    const userChartYearChip = createYearFilterChip('cfg-dash-user-year-chip', 'cfg-dash-user-year-list', repaintUserCharts);
    const userChartRangeChip = createMonthRangeChip('cfg-dash-user-range-chip', {
        start: 'cfg-dash-user-range-start',
        end: 'cfg-dash-user-range-end',
        apply: 'cfg-dash-user-range-apply',
        clear: 'cfg-dash-user-range-clear'
    }, repaintUserCharts);
    const userChartRoleChip = createMultiFilterChip(
        'cfg-dash-user-role-chip', 'cfg-dash-user-role-list', repaintUserCharts, null, 'cfg-dash-user-role-search');
    // O chip de curso é o último da cascata: suas opções saem do que sobrou
    // depois de data e função, então marcar uma função reduz a lista de
    // cursos em vez de oferecer opções que já não existem no recorte.
    const userChartCourseChip = createMultiFilterChip(
        'cfg-dash-user-course-chip', 'cfg-dash-user-course-list', repaintUserCharts, null, 'cfg-dash-user-course-search');

    // Os dois chips de data valem juntos: o de ano é o atalho de sempre, o de
    // período recorta mês a mês. Aplicar os dois em sequência mantém o
    // resultado previsível (interseção) em vez de um cancelar o outro.
    function filterUserRowsByDate(rows) {
        return filterRowsByMonthRange(filterRowsByYear(rows, userChartYearChip.getValue()), userChartRangeChip.getRange());
    }

    // Lista de cargos pronta para virar opções de chip: sem repetição, sem
    // vazios e em ordem alfabética pt-BR.
    function sortedRoles(roles) {
        return [...new Set(roles.map(r => String(r || '').trim()).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, 'pt-BR'));
    }

    // Funções marcadas num chip, já normalizadas: os cargos vêm da planilha
    // e variam em acento e caixa entre registros, então a comparação nunca é
    // feita com a string crua.
    function selectedRoleKeys(chip) {
        return new Set([...chip.getValues()].map(role => normalizeName(role)));
    }

    // Funções-alvo de um curso: as configuradas no tema (`theme.roles`).
    // Sem nenhuma marcada, o curso vale para todo mundo e não entra no
    // filtro — aparecer sob uma função específica seria mentira.
    function rowTargetRoles(row) {
        const theme = row.slug && row.subjectId && row.themeId
            ? allTrainingData[row.slug]?.[row.subjectId]?.themes?.[row.themeId]
            : null;
        return Array.isArray(theme?.roles) ? theme.roles.filter(Boolean).map(r => String(r).trim()) : [];
    }

    // No modal do colaborador o recorte é pela função a que o CURSO se
    // destina, não pela função da pessoa: ela tem só uma, então filtrar por
    // ela seria tudo-ou-nada. Assim o gestor vê, por exemplo, só os cursos
    // exigidos de "Técnico de Enfermagem" que aquela pessoa realizou.
    // Várias funções marcadas somam (união): o curso entra se for dirigido a
    // qualquer uma delas. Interseção não faria sentido — quase nenhum curso
    // é exigido de dois cargos ao mesmo tempo, e o gráfico viria vazio.
    function filterUserRowsByRole(rows) {
        const wanted = selectedRoleKeys(userChartRoleChip);
        if (!wanted.size) return rows;
        return rows.filter(row => rowTargetRoles(row).some(r => wanted.has(normalizeName(r))));
    }

    // Cursos marcados são comparados pelo rótulo, mesma convenção do chip de
    // curso dos comentários: registros importados de planilha não têm
    // subjectId/themeId, então a chave técnica deixaria metade de fora.
    function filterRowsByCourseChip(rows, chip) {
        const wanted = chip.getValues();
        if (!wanted.size) return rows;
        return rows.filter(row => wanted.has(rowCourseLabel(row)));
    }

    // Cascata completa do modal do colaborador: data → função → curso.
    function filterUserRows(rows) {
        return filterRowsByCourseChip(filterUserRowsByRole(filterUserRowsByDate(rows)), userChartCourseChip);
    }

    // Recorte anterior ao chip de curso: é dele que saem as opções de curso,
    // para o popover nunca listar algo que o recorte atual já excluiu.
    function userRowsBeforeCourse(rows) {
        return filterUserRowsByRole(filterUserRowsByDate(rows));
    }

    // Só as funções-alvo dos cursos que esta pessoa realizou: oferecer o
    // catálogo inteiro daria recortes vazios.
    function userRoleOptions(rows) {
        const roles = [];
        rows.forEach(row => rowTargetRoles(row).forEach(r => roles.push(r)));
        return sortedRoles(roles);
    }

    // Opções do chip de curso: o que aparece no histórico recortado mais os
    // cursos do público-alvo que ainda não têm nenhuma aprovação — sem eles
    // o gestor não conseguiria isolar justamente o curso que ninguém fez.
    // A deduplicação é pelo nome normalizado, preferindo o rótulo do
    // histórico, que é o que filterRowsByCourseChip compara.
    function courseOptionsOf(rows, extraLabels = []) {
        const byKey = new Map();
        [...rows.map(rowCourseLabel), ...extraLabels].forEach(label => {
            const key = normalizeName(label || '');
            if (key && !byKey.has(key)) byKey.set(key, label);
        });
        return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    }

    // Rótulos dos cursos ativos da categoria atual aceitos por `accept`.
    // Categorias sem público-alvo (estágios) não entram: lá só existe o que
    // foi realizado.
    function audienceCourseLabels(accept) {
        const slug = currentSlug();
        if (AUDIENCE_EXEMPT_SLUGS.includes(slug)) return [];
        const labels = [];
        Object.values(allTrainingData[slug] || {}).forEach(subject => {
            Object.entries(subject?.themes || {}).forEach(([themeId, theme]) => {
                if (!theme || theme.active === false || !accept(theme)) return;
                labels.push(theme.name || subject.name || themeId);
            });
        });
        return labels;
    }

    // Cursos exigidos do colaborador (mesma regra do gráfico de pendentes),
    // já recortados pelo chip de função-alvo: com funções marcadas, só os
    // cursos dirigidos a alguma delas.
    function userCourseOptions(colab, rows) {
        const roleKey = normalizeName(colab?.role || '');
        const wanted = selectedRoleKeys(userChartRoleChip);
        const extra = audienceCourseLabels(theme => {
            const roles = Array.isArray(theme.roles) ? theme.roles.filter(Boolean).map(r => normalizeName(r)) : [];
            if (roles.length && !roles.includes(roleKey)) return false;
            return !wanted.size || roles.some(r => wanted.has(r));
        });
        return courseOptionsOf(userRowsBeforeCourse(rows), extra);
    }

    // Casa um tema do CADASTRO com os rótulos marcados no chip, que vêm do
    // HISTÓRICO. Os dois quase sempre coincidem, mas um curso renomeado
    // depois dos registros guarda o nome antigo nas linhas antigas — por isso
    // a comparação aceita o nome do tema ou o rótulo de qualquer linha
    // daquele curso, normalizados.
    function themeMatchesCourseSelection(selection, theme, themeId, subjectName) {
        if (!selection.size) return true;
        const names = new Set([theme?.name || themeId, subjectName].filter(Boolean).map(normalizeName));
        return [...selection].some(label => names.has(normalizeName(label)));
    }

    // Parte da aba Gráficos que depende de data (Notas, Satisfação,
    // Realização dos Cursos, Tentativas, Retentativas, Tempos, Prazo por
    // Mês) — respeita os filtros de ano e período. "Progresso em Cursos
    // Pendentes" fica de fora: é sobre cursos ainda não feitos, sem data de
    // conclusão para recortar.
    function renderUserCharts(colab, allRows) {
        const rows = filterUserRows(allRows);
        const labels = rows.map(r => new Date(r.submittedAt || 0).toLocaleDateString('pt-BR'));
        const scores = rows.map(r => r.score);
        const trend = fixedAverageLine(scores);

        renderChart('userScores', 'cfg-dash-user-scores-chart', {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { type: 'bar', label: 'Nota', data: scores, backgroundColor: CHART_COLORS.accent, borderRadius: 4 },
                    { type: 'line', label: 'Média', data: trend, borderColor: CHART_COLORS.danger, pointRadius: 0, tension: 0 }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 10 } } }
        });
        paintUserScoresAvg(scores);

        // "Realização dos Cursos": situação final por curso (última
        // tentativa), não uma linha por tentativa/reenvio. Curso sem prazo é
        // fatia própria, fora de "No prazo".
        const lastAttempts = lastAttemptByCourse(rows);
        const late = lastAttempts.filter(r => isLateStatus(r.deadlineStatus)).length;
        const noDeadline = lastAttempts.filter(r => !hasDeadline(r.deadlineStatus)).length;
        const onTime = lastAttempts.length - late - noDeadline;
        renderChart('userDeadline', 'cfg-dash-user-deadline-chart', {
            type: 'pie',
            data: { labels: ['No prazo', 'Fora do prazo', 'Sem prazo'], datasets: [{ data: [onTime, late, noDeadline], backgroundColor: [CHART_COLORS.accent, CHART_COLORS.danger, CHART_COLORS.muted] }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { tooltip: { callbacks: { label: (ctx) => pieTooltipLabel(ctx) } } } }
        });

        // "Tentativas das Avaliações" conta TENTATIVAS, não cursos: cada
        // reprovação seguida de aprovação aparece dos dois lados da pizza.
        const approvedRows = rows.filter(r => r.approved);
        const reprovedRows = rows.filter(r => !r.approved);
        renderChart('userApproval', 'cfg-dash-user-approval-chart', {
            type: 'pie',
            data: { labels: ['Aprovação', 'Reprovação'], datasets: [{ data: [approvedRows.length, reprovedRows.length], backgroundColor: [CHART_COLORS.success, CHART_COLORS.danger] }] },
            options: {
                responsive: true, maintainAspectRatio: false,
                ...drillChartHandlers(({ index }) => {
                    const picked = index === 0 ? approvedRows : reprovedRows;
                    const pct = rows.length ? Math.round((picked.length / rows.length) * 100) : 0;
                    openDrillModal({
                        title: index === 0 ? 'Tentativas aprovadas' : 'Tentativas reprovadas',
                        subtitle: 'Cada linha é uma prova enviada — um mesmo curso pode aparecer mais de uma vez.',
                        icon: index === 0 ? 'fa-circle-check' : 'fa-circle-xmark',
                        tone: index === 0 ? 'is-ok' : 'is-bad',
                        stats: [
                            { label: index === 0 ? 'Aprovações' : 'Reprovações', value: picked.length, tone: index === 0 ? 'is-ok' : 'is-bad' },
                            { label: 'Do total de tentativas', value: `${pct}%` },
                            { label: 'Tentativas no período', value: rows.length }
                        ],
                        rows: picked
                    });
                }),
                plugins: { tooltip: { callbacks: { label: (ctx) => pieTooltipLabel(ctx) } } }
            }
        });

        renderUserSatisfactionChart(rows);
        renderUserRetriesChart(rows);
        renderUserScoresDistChart(rows);
        renderUserEvalTimeChart(rows);
        renderUserCompletionTimeChart(rows);
        renderUserPendingChart(colab, allRows);

        // "Prazo por Mês" segue o mesmo critério: 1 barra por curso concluído
        // (situação final), agrupado pelo mês da última tentativa. As barras
        // acompanham o período escolhido no chip (padrão: do primeiro ao
        // último mês com dados). Curso sem prazo é uma série à parte: não
        // cumpriu nem perdeu limite nenhum.
        const range = userChartRangeChip.getRange();
        const monthBuckets = monthBucketsForRange(range, lastAttempts, userChartYearChip.getValue());
        const bucketsOf = (subset) => countIntoMonthBuckets(subset, monthBucketsForRange(range, lastAttempts, userChartYearChip.getValue()));
        const deadlineSeries = [
            { label: 'No prazo', icon: 'fa-calendar-check', tone: 'is-ok', color: CHART_COLORS.accent, rows: lastAttempts.filter(r => hasDeadline(r.deadlineStatus) && isOnTime(r.deadlineStatus)) },
            { label: 'Fora do prazo', icon: 'fa-triangle-exclamation', tone: 'is-bad', color: CHART_COLORS.danger, rows: lastAttempts.filter(r => isLateStatus(r.deadlineStatus)) },
            { label: 'Sem prazo', icon: 'fa-calendar', tone: '', color: CHART_COLORS.muted, rows: lastAttempts.filter(r => !hasDeadline(r.deadlineStatus)) }
        ].map(series => ({ ...series, byMonth: bucketsOf(series.rows) }));
        renderChart('userDeadlineTrend', 'cfg-dash-user-deadlinetrend-chart', {
            type: 'bar',
            data: {
                labels: monthBuckets.map(b => b.label),
                datasets: deadlineSeries.map(series => ({ label: series.label, data: series.byMonth.map(b => b.count), backgroundColor: series.color }))
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                ...drillChartHandlers(({ datasetIndex, index }) => {
                    const series = deadlineSeries[datasetIndex];
                    const bucket = monthBuckets[index];
                    // O mesmo recorte da barra: status do dataset + mês do
                    // rótulo (a chave do bucket é "ano-mês", base zero).
                    const [year, month] = bucket.key.split('-').map(Number);
                    const picked = series.rows.filter(r => {
                        if (!r.submittedAt) return false;
                        const d = new Date(r.submittedAt);
                        return d.getFullYear() === year && d.getMonth() === month;
                    });
                    const total = deadlineSeries.reduce((sum, s) => sum + s.byMonth[index].count, 0);
                    openDrillModal({
                        title: `${series.label} — ${bucket.label}`,
                        subtitle: 'Um curso por linha, pela situação da última tentativa no mês.',
                        icon: series.icon,
                        tone: series.tone,
                        stats: [
                            { label: series.label, value: picked.length, tone: series.tone },
                            { label: 'Concluídos no mês', value: total },
                            { label: 'Do mês', value: total ? `${Math.round((picked.length / total) * 100)}%` : '—' }
                        ],
                        rows: picked,
                        emptyMessage: 'Nenhum curso concluído neste mês.'
                    });
                }),
                plugins: { tooltip: { callbacks: { label: (ctx) => percentTooltipLabel(ctx) } } },
                scales: { x: { stacked: true }, y: { stacked: true, ticks: { precision: 0 } } }
            }
        });
    }

    function renderUserDashboard(colab, heroStatsEl) {
        const rows = flattenColaboradorResults(colab);
        const scores = rows.map(r => r.score);
        const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

        // O hero (topo do modal) e a aba Histórico sempre mostram o total —
        // só a aba Gráficos recorta por ano.
        const lastAttemptsAll = lastAttemptByCourse(rows);
        const lateAll = lastAttemptsAll.filter(r => !['on_time', 'livre', 'forgiven'].includes(r.deadlineStatus)).length;

        userChartColabCache = colab;
        userChartRowsCache = rows;
        userChartYearChip.setYears(yearsFromRows(rows));
        // Cada colaborador tem seu próprio intervalo de histórico: o período
        // escolhido para o anterior não faz sentido aqui e deixaria o modal
        // abrir já filtrado sem o gestor ter pedido. Quem zera é
        // closeUserModal() — aqui o reset apagaria o filtro a cada repaint
        // vindo da sincronização ao vivo.
        userChartRangeChip.setBounds(rows);
        userChartRoleChip.setOptions(userRoleOptions(rows));
        userChartCourseChip.setOptions(userCourseOptions(colab, rows));
        renderUserCharts(colab, rows);

        if (heroStatsEl) {
            const avgLabel = scores.length ? avg.toFixed(1).replace('.', ',') : '—';
            const durationLabel = formatDuration(avgDuration(rows));
            heroStatsEl.innerHTML = `
                <span class="hero-stat is-ok"><i class="fas fa-circle-check"></i> ${rows.length} ${rows.length === 1 ? 'curso realizado' : 'cursos realizados'}</span>
                <span class="hero-stat"><i class="fas fa-star"></i> Média ${avgLabel}</span>
                <span class="hero-stat"><i class="fas fa-clock"></i> Tempo médio de prova ${durationLabel}</span>
                ${lateAll > 0 ? `<span class="hero-stat is-warn"><i class="fas fa-triangle-exclamation"></i> ${lateAll} concluído com atraso</span>` : ''}
            `;
        }
        renderUserHistoryTable(rows);
        renderUserCommentsTable(rows);
    }

    // Cursos exigidos pelo cargo do colaborador que ele ainda não concluiu,
    // com o % de módulos já assistidos (progress/byUser) — o gráfico mais
    // acionável para o gestor: mostra onde a pessoa está travada, não só o
    // que já foi feito.
    //
    // Só a categoria selecionada nas Configurações, como o resto do painel
    // (ver flattenColaboradorResults). Quando ela não tem público-alvo
    // (estágios) ou a pessoa já concluiu tudo, o gráfico mostra o estado
    // vazio em vez de um eixo 0-100 sem barra.
    const USER_PENDING_PAGE_SIZE = 9;
    let userPendingDataCache = [];
    let userPendingPage = 1;

    function renderUserPendingChart(colab, doneRows) {
        // Só aprovação encerra a pendência — mesmo critério de
        // renderMissingTable. Quem só reprovou ainda precisa refazer a prova,
        // então o curso continua pendente. A chave por nome normalizado entra
        // junto com a de ids para casar também registros importados de
        // planilha, que não têm subjectId/themeId.
        const doneKeys = new Set();
        doneRows.filter(r => r.approved).forEach(r => {
            if (r.slug && r.subjectId && r.themeId) doneKeys.add(`${r.slug}_${r.subjectId}_${r.themeId}`);
            doneKeys.add(normalizeName(`${r.subject || ''}|${r.theme || ''}`));
        });
        const roleKey = normalizeName(colab.role || '');
        const roleFilterKeys = selectedRoleKeys(userChartRoleChip);
        const courseFilter = userChartCourseChip.getValues();
        const slug = currentSlug();
        const pending = [];
        if (!AUDIENCE_EXEMPT_SLUGS.includes(slug)) {
            const trainingData = allTrainingData[slug] || {};
            Object.keys(trainingData).forEach(subjectId => {
                const subject = trainingData[subjectId] || {};
                const themes = subject.themes || {};
                Object.keys(themes).forEach(themeId => {
                    const theme = themes[themeId];
                    if (!theme || theme.active === false) return;
                    const roles = Array.isArray(theme.roles) ? theme.roles.filter(Boolean) : [];
                    const targeted = roles.length === 0 || roles.some(role => normalizeName(role) === roleKey);
                    if (!targeted) return;
                    // Mesmo recorte do chip de função-alvo da aba Gráficos:
                    // com cargos escolhidos, só as pendências de cursos
                    // dirigidos a algum deles. Curso sem função marcada vale
                    // para todos e fica de fora do recorte.
                    if (roleFilterKeys.size && !roles.some(role => roleFilterKeys.has(normalizeName(role)))) return;
                    // O chip de curso também vale aqui: pendência de curso
                    // fora do recorte não é assunto do relatório pedido. Só o
                    // filtro de DATA continua de fora — pendência não tem
                    // data de conclusão para recortar.
                    if (!themeMatchesCourseSelection(courseFilter, theme, themeId, subject.name)) return;
                    if (doneKeys.has(`${slug}_${subjectId}_${themeId}`)) return;
                    if (doneKeys.has(normalizeName(`${subject.name || ''}|${theme.name || ''}`))) return;
                    pending.push({
                        name: theme.name || themeId,
                        subject: subject.name || subjectId,
                        pct: progressPctFor(colab, slug, subjectId, themeId)
                    });
                });
            });
        }

        userPendingDataCache = pending.sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name, 'pt-BR'));
        userPendingPage = 1;
        paintUserPendingPage();
    }

    function paintUserPendingPage() {
        const canvas = document.getElementById('cfg-dash-user-pending-chart');
        const emptyEl = document.getElementById('cfg-dash-user-pending-empty');
        const pager = document.getElementById('cfg-dash-user-pending-pagination');

        // Sem pendência nenhuma, o Chart.js desenharia só o eixo 0-100 vazio
        // — era isso que dava a impressão de gráfico quebrado. Mostra a
        // mensagem e não renderiza.
        if (userPendingDataCache.length === 0) {
            destroyChart('userPending');
            if (canvas) canvas.style.display = 'none';
            if (emptyEl) emptyEl.style.display = 'flex';
            if (pager) pager.innerHTML = '';
            return;
        }
        if (canvas) canvas.style.display = '';
        if (emptyEl) emptyEl.style.display = 'none';

        const totalPages = Math.max(1, Math.ceil(userPendingDataCache.length / USER_PENDING_PAGE_SIZE));
        userPendingPage = Math.min(Math.max(1, userPendingPage), totalPages);
        const start = (userPendingPage - 1) * USER_PENDING_PAGE_SIZE;
        const pageRows = userPendingDataCache.slice(start, start + USER_PENDING_PAGE_SIZE);

        renderChart('userPending', 'cfg-dash-user-pending-chart', {
            type: 'bar',
            data: {
                labels: pageRows.map(p => p.name),
                datasets: [{
                    data: pageRows.map(p => p.pct),
                    backgroundColor: pageRows.map(p => progressBarColor(p.pct)),
                    borderRadius: 4, barPercentage: 0.9, categoryPercentage: 0.85,
                    // Curso com 0% assistido é o caso mais importante do
                    // gráfico (nem começou) e era justamente o que sumia:
                    // barra de largura zero não aparece.
                    minBarLength: 3
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, indexAxis: 'y',
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: {
                        label: (ctx) => `${ctx.parsed.x}% assistido`,
                        afterBody: (items) => {
                            const p = pageRows[items[0]?.dataIndex];
                            return p ? [p.subject] : [];
                        }
                    } }
                },
                scales: { x: { min: 0, max: 100, ticks: { callback: (v) => `${v}%` } }, y: { ticks: truncatedCategoryTicks } }
            }
        });
        paintChartPager(pager, totalPages, userPendingPage, (page) => { userPendingPage = page; paintUserPendingPage(); });
        chartInstances.userPending?.resize();
        chartInstances.userPending?.update('none');
    }

    // Nome de curso é bem mais longo que nome de unidade: sem corte, o eixo Y
    // dos gráficos "por curso" do colaborador come metade da largura do card.
    // Só o rótulo é cortado — o tooltip continua mostrando o nome inteiro.
    function truncateLabel(text, max = 30) {
        const value = String(text ?? '');
        return value.length > max ? `${value.slice(0, max - 1)}…` : value;
    }
    const truncatedCategoryTicks = {
        autoSkip: false,
        callback(value) { return truncateLabel(this.getLabelForValue(value)); }
    };

    // Verde quando está quase lá, vermelho quando nem começou — a cor já diz
    // onde cobrar sem precisar ler o número.
    function progressBarColor(pct) {
        if (pct >= 75) return CHART_COLORS.success;
        if (pct >= 40) return CHART_COLORS.warning;
        if (pct > 0) return CHART_COLORS.orange;
        return CHART_COLORS.danger;
    }

    // Pager padrão dos gráficos paginados do modal do colaborador — mesmo
    // markup/comportamento dos pagers do modal do curso, num helper só
    // porque aqui são cinco gráficos usando o mesmo controle.
    function paintChartPager(pager, totalPages, currentPage, onPage) {
        if (!pager) return;
        if (totalPages <= 1) { pager.innerHTML = ''; return; }
        pager.innerHTML = `<button type="button" class="comments-page-btn" data-page="prev" ${currentPage === 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>` +
            `<span class="comments-page-info">Página ${currentPage} de ${totalPages}</span>` +
            `<button type="button" class="comments-page-btn" data-page="next" ${currentPage === totalPages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>`;
        pager.querySelectorAll('.comments-page-btn').forEach(btn => {
            btn.addEventListener('click', () => onPage(currentPage + (btn.dataset.page === 'prev' ? -1 : 1)));
        });
    }

    // ─── Satisfação do colaborador ───
    // Duas leituras do mesmo dado, como no modal do curso:
    //   geral — quantas vezes ele deu cada nota de estrela;
    //   curso — a estrela que ele deu a cada curso, da pior para a melhor,
    //           que é onde aparece de qual conteúdo ele não gostou.
    const USER_SATISFACTION_PAGE_SIZE = 6;
    let userSatisfactionMode = 'geral';
    let userSatisfactionRowsCache = [];
    let userSatisfactionPage = 1;

    function ratedOnly(rows) {
        return rows.filter(r => {
            const rating = Number(r.rating);
            return Number.isFinite(rating) && rating >= 1 && rating <= 5;
        });
    }

    function renderUserSatisfactionChart(rows) {
        userSatisfactionRowsCache = rows;
        const canvas = document.getElementById('cfg-dash-user-satisfaction-chart');
        const emptyEl = document.getElementById('cfg-dash-user-satisfaction-empty');
        const pager = document.getElementById('cfg-dash-user-satisfaction-pagination');
        const rated = ratedOnly(rows);

        if (rated.length === 0) {
            destroyChart('userSatisfaction');
            if (canvas) canvas.style.display = 'none';
            if (emptyEl) emptyEl.style.display = 'flex';
            if (pager) pager.innerHTML = '';
            return;
        }
        if (canvas) canvas.style.display = '';
        if (emptyEl) emptyEl.style.display = 'none';

        if (userSatisfactionMode === 'curso') {
            // Uma barra por curso: a última avaliação dele naquele curso (os
            // reenvios trazem a pesquisa de novo e duplicariam a barra).
            const all = lastAttemptByCourse(rated)
                .filter(Boolean)
                .map(r => ({ name: rowCourseLabel(r), rating: Number(r.rating) }))
                .sort((a, b) => a.rating - b.rating || a.name.localeCompare(b.name, 'pt-BR'));
            const totalPages = Math.max(1, Math.ceil(all.length / USER_SATISFACTION_PAGE_SIZE));
            userSatisfactionPage = Math.min(Math.max(1, userSatisfactionPage), totalPages);
            const start = (userSatisfactionPage - 1) * USER_SATISFACTION_PAGE_SIZE;
            const pageRows = all.slice(start, start + USER_SATISFACTION_PAGE_SIZE);

            renderChart('userSatisfaction', 'cfg-dash-user-satisfaction-chart', {
                type: 'bar',
                data: {
                    labels: pageRows.map(c => c.name),
                    datasets: [{ data: pageRows.map(c => c.rating), backgroundColor: CHART_COLORS.warning, borderRadius: 4 }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false, indexAxis: 'y',
                    plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: { label: (ctx) => `${ctx.parsed.x}★` } }
                    },
                    scales: {
                        x: { min: 0, max: 5, ticks: { stepSize: 1, callback: (v) => `${v}★` } },
                        y: { ticks: truncatedCategoryTicks }
                    }
                }
            });
            paintChartPager(pager, totalPages, userSatisfactionPage, (page) => {
                userSatisfactionPage = page;
                renderUserSatisfactionChart(userSatisfactionRowsCache);
            });
            return;
        }

        if (pager) pager.innerHTML = '';
        const ratingCounts = [1, 2, 3, 4, 5].map(star => rated.filter(r => Number(r.rating) === star).length);
        renderChart('userSatisfaction', 'cfg-dash-user-satisfaction-chart', {
            type: 'bar',
            data: { labels: ['1★', '2★', '3★', '4★', '5★'], datasets: [{ data: ratingCounts, backgroundColor: CHART_COLORS.warning, borderRadius: 4 }] },
            options: {
                responsive: true, maintainAspectRatio: false, indexAxis: 'y',
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => singleSeriesTooltipLabel(ctx) } } },
                scales: { x: { ticks: { precision: 0 } } }
            }
        });
    }

    document.getElementById('cfg-dash-user-satisfaction-mode')?.querySelectorAll('.dash-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (userSatisfactionMode === btn.dataset.mode) return;
            userSatisfactionMode = btn.dataset.mode;
            userSatisfactionPage = 1;
            btn.parentElement.querySelectorAll('.dash-mode-btn').forEach(b => b.classList.toggle('is-active', b === btn));
            renderUserSatisfactionChart(userSatisfactionRowsCache);
        });
    });

    // ─── Retentativas do colaborador ───
    // Mesma leitura do gráfico do curso, virada para a pessoa: de todos os
    // cursos que ela fez, em quantos passou de primeira, em quantos precisou
    // repetir a prova e em quantos ainda não passou.
    function renderUserRetriesChart(rows) {
        const courses = attemptsByCourse(rows);
        const buckets = [
            { label: 'Aprovado na 1ª tentativa', icon: 'fa-bullseye', tone: 'is-ok', color: CHART_COLORS.success, courses: courses.filter(c => c.firstTry) },
            { label: 'Aprovado após retentativa', icon: 'fa-rotate-right', tone: 'is-warn', color: CHART_COLORS.warning, courses: courses.filter(c => c.retried) },
            { label: 'Ainda reprovado', icon: 'fa-circle-xmark', tone: 'is-bad', color: CHART_COLORS.danger, courses: courses.filter(c => !c.approved) }
        ];
        renderChart('userRetries', 'cfg-dash-user-retries-chart', {
            type: 'bar',
            data: {
                labels: ['Retentativas'],
                datasets: buckets.map(b => ({ label: b.label, data: [b.courses.length], backgroundColor: b.color }))
            },
            options: {
                responsive: true, maintainAspectRatio: false, indexAxis: 'y',
                ...drillChartHandlers(({ datasetIndex }) => {
                    const bucket = buckets[datasetIndex];
                    // Uma linha por CURSO (a última tentativa dele), não por
                    // prova enviada: este gráfico conta cursos, e listar todas
                    // as tentativas daria um número diferente do da barra.
                    const attemptsByKey = new Map(bucket.courses.map(c => [c.key, c.attempts]));
                    const picked = lastAttemptByCourse(rows).filter(r => attemptsByKey.has(rowCourseKey(r)));
                    openDrillModal({
                        title: bucket.label,
                        subtitle: 'Um curso por linha, com quantas tentativas foram precisas.',
                        icon: bucket.icon,
                        tone: bucket.tone,
                        stats: [
                            { label: 'Cursos', value: bucket.courses.length, tone: bucket.tone },
                            { label: 'De um total de', value: courses.length },
                            { label: 'Dos cursos feitos', value: courses.length ? `${Math.round((bucket.courses.length / courses.length) * 100)}%` : '—' }
                        ],
                        rows: picked,
                        extraOf: (r) => {
                            const attempts = attemptsByKey.get(rowCourseKey(r)) || 1;
                            return attempts === 1 ? '1 tentativa' : `${attempts} tentativas`;
                        },
                        emptyMessage: 'Nenhum curso nesta situação.'
                    });
                }),
                plugins: { tooltip: { callbacks: {
                    label: (ctx) => percentTooltipLabel(ctx),
                    afterLabel: (ctx) => {
                        const value = Number(ctx.parsed.x) || 0;
                        return value === 1 ? '1 curso' : `${value} cursos`;
                    }
                } } },
                scales: { x: { stacked: true, ticks: { precision: 0 } }, y: { stacked: true } }
            }
        });
    }

    // ─── Notas do colaborador ───
    // Histograma das notas dele (0-10), nas mesmas faixas de cor do gráfico
    // "Notas" do curso. O tooltip lista os cursos de cada barra — num
    // volume de cursos por pessoa isso cabe e evita mais um modal.
    function renderUserScoresDistChart(rows) {
        const counts = new Array(11).fill(0);
        const coursesByScore = Array.from({ length: 11 }, () => []);
        const rowsByScore = Array.from({ length: 11 }, () => []);
        let total = 0;
        rows.forEach(r => {
            const score = Number(r.score);
            if (!Number.isFinite(score)) return;
            const rounded = Math.min(10, Math.max(0, Math.floor(score)));
            counts[rounded]++;
            coursesByScore[rounded].push(rowCourseLabel(r));
            rowsByScore[rounded].push(r);
            total++;
        });

        renderChart('userScoresDist', 'cfg-dash-user-scoresdist-chart', {
            type: 'bar',
            data: {
                labels: counts.map((_, score) => String(score)),
                datasets: [{ data: counts, backgroundColor: counts.map((_, score) => scoreBarColor(score)), borderRadius: 4 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                ...drillChartHandlers(({ index }) => {
                    const picked = rowsByScore[index];
                    openDrillModal({
                        title: `Nota ${index}`,
                        subtitle: 'Provas cuja nota cai nesta faixa (arredondada para baixo).',
                        icon: 'fa-star',
                        tone: index >= 8 ? 'is-ok' : index >= 6 ? 'is-warn' : 'is-bad',
                        stats: [
                            { label: 'Provas com esta nota', value: picked.length, tone: index >= 8 ? 'is-ok' : index >= 6 ? 'is-warn' : 'is-bad' },
                            { label: 'Do total de provas', value: total ? `${Math.round((picked.length / total) * 100)}%` : '—' },
                            { label: 'Provas no período', value: total }
                        ],
                        rows: picked,
                        emptyMessage: 'Nenhuma prova com esta nota no período.'
                    });
                }),
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: {
                        label: (ctx) => {
                            const value = Number(ctx.parsed.y) || 0;
                            const pct = total > 0 ? Math.round((value / total) * 100) : 0;
                            return `${value} (${pct}%)`;
                        },
                        afterBody: (items) => {
                            const list = coursesByScore[items[0]?.dataIndex] || [];
                            if (list.length === 0) return [];
                            return list.slice(0, 6).concat(list.length > 6 ? [`+${list.length - 6} outros`] : []);
                        }
                    } }
                },
                scales: { x: { title: { display: true, text: 'Nota' } }, y: { ticks: { precision: 0 } } }
            }
        });
    }

    // ─── Tempos do colaborador vs. média do curso ───
    // Os dois gráficos de tempo do modal do curso comparam pessoas entre si
    // dentro de um curso; aqui a pergunta é outra — este colaborador é mais
    // rápido ou mais lento que a média de quem fez o mesmo curso. Por isso
    // cada barra traz duas séries: o tempo dele e a média geral do curso.
    // `durationOf(row)` muda entre os dois gráficos (prova x tempo ativo até
    // aprovar), o resto do cálculo é igual.
    function buildUserTimeComparison(rows, durationOf) {
        const mine = lastAttemptByCourse(rows).filter(r => r && r.approved);
        return mine
            .map(row => {
                const userMs = durationOf(row);
                if (!Number.isFinite(userMs) || userMs <= 0) return null;
                // Média do curso: última tentativa aprovada de CADA pessoa
                // que fez o mesmo curso (inclusive este colaborador), mesma
                // base dos gráficos de tempo do modal do curso. O slug entra
                // à parte porque rowCourseKey só o embute nas linhas com ids;
                // nas casadas por nome, dois cursos homônimos em categorias
                // diferentes cairiam na mesma média.
                const key = rowCourseKey(row);
                const peerMs = lastAttemptByPerson(historyRows.filter(h => h.slug === row.slug && rowCourseKey(h) === key))
                    .filter(h => h && h.approved)
                    .map(durationOf)
                    .filter(ms => Number.isFinite(ms) && ms > 0);
                const avgMs = peerMs.length ? mean(peerMs) : null;
                const theme = row.slug && row.subjectId && row.themeId
                    ? allTrainingData[row.slug]?.[row.subjectId]?.themes?.[row.themeId]
                    : null;
                return {
                    label: rowCourseLabel(row),
                    userMs,
                    avgMs,
                    n: peerMs.length,
                    expectedMs: expectedCompletionMsOf(theme)
                };
            })
            .filter(Boolean)
            .sort((a, b) => b.userMs - a.userMs);
    }

    // Tempo de prova (`durationSeconds`, o mesmo da coluna "Tempo" do
    // histórico) — minutos, formato MM:SS.
    function userEvalDurationOf(row) {
        const seconds = Number(row?.durationSeconds);
        return Number.isFinite(seconds) ? seconds * 1000 : NaN;
    }

    // Tempo ATIVO com o curso aberto até a aprovação (`activeMs` de
    // progress/byUser) — horas, formato HH:MM:SS. Só existe para quem tem
    // conta e concluiu depois da métrica passar a ser gravada.
    function userCompletionDurationOf(row) {
        if (!row?.userId || !row.slug || !row.subjectId || !row.themeId) return NaN;
        const activeMs = allProgress[row.userId]?.[row.slug]?.[row.subjectId]?.[row.themeId]?.activeMs;
        return Number.isFinite(activeMs) ? activeMs : NaN;
    }

    // 5 cursos por página, não 7: cada curso vira DUAS barras aqui (a do
    // colaborador e a média do curso), então 7 já encheria o card alto com 14
    // barras finas demais para comparar a olho.
    const USER_TIME_PAGE_SIZE = 5;
    let userEvalTimeCache = [];
    let userEvalTimePage = 1;
    let userCompletionTimeCache = [];
    let userCompletionTimePage = 1;

    function renderUserEvalTimeChart(rows) {
        userEvalTimeCache = buildUserTimeComparison(rows, userEvalDurationOf);
        userEvalTimePage = 1;
        paintUserEvalTimePage();
    }
    function paintUserEvalTimePage() {
        paintUserTimeChart({
            chartKey: 'userEvalTime',
            canvasId: 'cfg-dash-user-evaltime-chart',
            emptyId: 'cfg-dash-user-evaltime-empty',
            pagerId: 'cfg-dash-user-evaltime-pagination',
            data: userEvalTimeCache,
            page: userEvalTimePage,
            format: formatMsAsDuration,
            // A meta cadastrada é do tempo de CURSO (tempo ativo até
            // aprovar), não da duração da prova — aqui ela não mede nada.
            markerDefs: [MARKER_AVG],
            onPage: (page) => { userEvalTimePage = page; paintUserEvalTimePage(); }
        });
    }

    function renderUserCompletionTimeChart(rows) {
        userCompletionTimeCache = buildUserTimeComparison(rows, userCompletionDurationOf);
        userCompletionTimePage = 1;
        paintUserCompletionTimePage();
    }
    function paintUserCompletionTimePage() {
        paintUserTimeChart({
            chartKey: 'userCompletionTime',
            canvasId: 'cfg-dash-user-completiontime-chart',
            emptyId: 'cfg-dash-user-completiontime-empty',
            pagerId: 'cfg-dash-user-completiontime-pagination',
            data: userCompletionTimeCache,
            page: userCompletionTimePage,
            format: formatHHMMSS,
            // formatHHMMSS devolve "—" para zero (é o que a coluna
            // "Conclusão" do histórico mostra quando não há tempo), o que não
            // serve de marca de eixo — ali vale o HH:MM cru.
            tickFormat: formatHHMM,
            onPage: (page) => { userCompletionTimePage = page; paintUserCompletionTimePage(); }
        });
    }

    // Duas referências desenhadas como risco vertical na altura de cada
    // barra: a média do curso (vermelho) e a meta de tempo esperada do curso
    // (laranja, campo `expectedCompletionMs` do assunto). Substituem uma
    // segunda barra — com barras lado a lado a comparação virava "qual das
    // duas é maior", e o risco deixa na hora se a barra do colaborador
    // passou ou não da referência.
    //
    // `chart.$markerRows` guarda `{ avgMs, expectedMs }` de cada barra,
    // setado por quem monta o gráfico. Ao desenhar, o plugin também grava em
    // `chart.$markerHits` a caixa de cada risco — é o que dá "hover" a algo
    // que não é elemento do Chart.js (ver bindMarkerTooltip).
    const MARKER_AVG = { key: 'avgMs', label: 'Média do curso', color: CHART_COLORS.danger };
    // Verde: a meta é a referência a alcançar, não um limite a não estourar
    // (ver timeCoverage — o risco é ficar abaixo dela, não acima).
    const MARKER_EXPECTED = { key: 'expectedMs', label: 'Meta esperada', color: CHART_COLORS.success };
    const MARKER_DEFS = [MARKER_AVG, MARKER_EXPECTED];

    const timeMarkerPlugin = {
        id: 'timeMarkers',
        afterDatasetsDraw(chart) {
            const rows = chart.$markerRows;
            chart.$markerHits = [];
            if (!rows) return;
            const { ctx, scales: { x: xScale } } = chart;
            const meta = chart.getDatasetMeta(0);
            if (!meta || meta.hidden) return;
            const format = chart.$markerFormat || String;
            const defs = chart.$markerDefs || MARKER_DEFS;
            meta.data.forEach((bar, index) => {
                const row = rows[index];
                if (!row) return;
                // Um pouco mais alto que a barra, pra ficar visível mesmo
                // quando o risco cai bem no meio dela.
                const half = (bar.height || 14) * 0.65;
                defs.forEach(def => {
                    const value = row[def.key];
                    if (!Number.isFinite(value) || value <= 0) return;
                    const x = xScale.getPixelForValue(value);
                    // Fora da área desenhada não vira risco solto na borda.
                    if (x < xScale.left || x > xScale.right) return;
                    ctx.save();
                    ctx.strokeStyle = def.color;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(x, bar.y - half);
                    ctx.lineTo(x, bar.y + half);
                    ctx.stroke();
                    ctx.restore();
                    chart.$markerHits.push({
                        x, yTop: bar.y - half, yBottom: bar.y + half,
                        label: def.label, color: def.color, text: format(value)
                    });
                });
            });
        }
    };

    // Tooltip dos riscos. O Chart.js só sabe fazer hover em elementos que ele
    // mesmo desenhou, então a detecção é feita à mão: a cada mousemove, olha
    // se o cursor está em cima de alguma das caixas que o plugin gravou em
    // `$markerHits` e mostra um balãozinho HTML posicionado sobre o risco.
    const MARKER_HIT_SLOP = 6;

    function bindMarkerTooltip(canvas, chartKey) {
        const holder = canvas.parentElement;
        if (!holder) return;
        holder.classList.add('dash-marker-host');
        let tip = holder.querySelector('.dash-marker-tip');
        if (!tip) {
            tip = document.createElement('div');
            tip.className = 'dash-marker-tip';
            holder.appendChild(tip);
        }
        // renderChart recria o Chart a cada repintura, mas o <canvas> é o
        // mesmo elemento — sem remover o handler anterior eles se acumulam.
        if (canvas._markerMove) canvas.removeEventListener('mousemove', canvas._markerMove);
        if (canvas._markerLeave) canvas.removeEventListener('mouseleave', canvas._markerLeave);

        const hide = () => tip.classList.remove('is-visible');
        const move = (event) => {
            const hits = chartInstances[chartKey]?.$markerHits;
            if (!hits || hits.length === 0) { hide(); return; }
            const rect = canvas.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            const hit = hits.find(h => Math.abs(x - h.x) <= MARKER_HIT_SLOP && y >= h.yTop - MARKER_HIT_SLOP && y <= h.yBottom + MARKER_HIT_SLOP);
            if (!hit) { hide(); return; }
            tip.innerHTML = `<span class="dash-marker-tip-dot" style="background:${hit.color}"></span>` +
                `<span class="dash-marker-tip-label">${escapeHtml(hit.label)}</span>` +
                `<b>${escapeHtml(hit.text)}</b>`;
            tip.style.left = `${canvas.offsetLeft + hit.x}px`;
            tip.style.top = `${canvas.offsetTop + hit.yTop}px`;
            tip.classList.add('is-visible');
        };

        canvas._markerMove = move;
        canvas._markerLeave = hide;
        canvas.addEventListener('mousemove', move);
        canvas.addEventListener('mouseleave', hide);
    }

    // Desenho comum dos dois gráficos de tempo: uma barra por curso com o
    // tempo do colaborador, a média do curso como risco vermelho e a meta
    // esperada como risco laranja. Sem barra de erro de desvio padrão (ao
    // contrário dos gráficos do modal do curso): aqui a leitura é "ele foi
    // mais rápido ou mais lento que a referência", e o bigode da dispersão
    // só atrapalha.
    function paintUserTimeChart({ chartKey, canvasId, emptyId, pagerId, data, page, format, tickFormat, onPage, pageSize = USER_TIME_PAGE_SIZE, seriesLabel = 'Este colaborador', markerDefs = MARKER_DEFS }) {
        const canvas = document.getElementById(canvasId);
        const emptyEl = document.getElementById(emptyId);
        const pager = document.getElementById(pagerId);

        if (data.length === 0) {
            destroyChart(chartKey);
            if (canvas) canvas.style.display = 'none';
            if (emptyEl) emptyEl.style.display = 'flex';
            if (pager) pager.innerHTML = '';
            return;
        }
        if (canvas) canvas.style.display = '';
        if (emptyEl) emptyEl.style.display = 'none';

        const totalPages = Math.max(1, Math.ceil(data.length / pageSize));
        const currentPage = Math.min(Math.max(1, page), totalPages);
        const start = (currentPage - 1) * pageSize;
        const pageRows = data.slice(start, start + pageSize);

        renderChart(chartKey, canvasId, {
            type: 'bar',
            data: {
                labels: pageRows.map(r => r.label),
                datasets: [
                    {
                        label: seriesLabel, data: pageRows.map(r => r.userMs),
                        backgroundColor: CHART_COLORS.accent, borderRadius: 4,
                        barPercentage: 0.9, categoryPercentage: 0.75
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false, indexAxis: 'y',
                plugins: {
                    legend: {
                        // Os riscos não são datasets, então não entram na
                        // legenda sozinhos — são acrescentados à mão. A meta
                        // só aparece quando algum curso da página tem tempo
                        // esperado configurado. Clicar nesses itens não deve
                        // tentar esconder dataset nenhum.
                        labels: {
                            generateLabels: (chart) => {
                                const items = Chart.defaults.plugins.legend.labels.generateLabels(chart);
                                markerDefs.forEach(def => {
                                    // A meta só entra na legenda quando algum
                                    // curso da página tem tempo esperado.
                                    if (def.key === 'expectedMs' && !pageRows.some(r => r.expectedMs)) return;
                                    items.push({
                                        text: def.label,
                                        fillStyle: def.color,
                                        strokeStyle: def.color,
                                        lineWidth: 2,
                                        hidden: false
                                    });
                                });
                                return items;
                            }
                        },
                        onClick: (event, item, legend) => {
                            if (item.datasetIndex === undefined) return;
                            Chart.defaults.plugins.legend.onClick.call(legend, event, item, legend);
                        }
                    },
                    tooltip: { callbacks: {
                        label: (ctx) => `${seriesLabel}: ${format(pageRows[ctx.dataIndex].userMs)}`,
                        // A comparação é a razão de existir do gráfico, então
                        // a diferença vem escrita em vez de ficar a cargo do
                        // olho medindo barra contra risco.
                        afterBody: (items) => {
                            const r = pageRows[items[0]?.dataIndex];
                            if (!r) return [];
                            const lines = [];
                            if (r.avgMs === null) {
                                lines.push('Média do curso: sem dados');
                            } else {
                                const people = r.n === 1 ? '1 pessoa' : `${r.n} pessoas`;
                                lines.push(`Média do curso: ${format(r.avgMs)} (${people})`);
                                const delta = r.userMs - r.avgMs;
                                lines.push(delta === 0
                                    ? 'Exatamente na média do curso'
                                    : `${format(Math.abs(delta))} ${delta > 0 ? 'acima' : 'abaixo'} da média do curso`);
                            }
                            if (r.expectedMs && markerDefs.some(d => d.key === 'expectedMs')) {
                                const coverage = timeCoverage(r.userMs, r.expectedMs);
                                const pct = coverage ? coverage.pct : Math.round((r.userMs / r.expectedMs) * 100);
                                lines.push(`${pct}% do tempo esperado (${format(r.expectedMs)})`);
                                if (coverage) lines.push(coverage.label);
                            }
                            return lines;
                        }
                    } }
                },
                scales: {
                    x: {
                        ticks: { callback: (v) => (tickFormat || format)(v) },
                        // Garante que os riscos de média e meta caibam no
                        // eixo quando são maiores que o tempo do colaborador —
                        // senão a referência ficaria fora da área desenhada.
                        suggestedMax: Math.max(...pageRows.map(r => Math.max(
                            r.userMs,
                            markerDefs.some(d => d.key === 'avgMs') ? (r.avgMs || 0) : 0,
                            markerDefs.some(d => d.key === 'expectedMs') ? (r.expectedMs || 0) : 0
                        ))) * 1.05
                    },
                    y: { ticks: truncatedCategoryTicks }
                }
            },
            plugins: [timeMarkerPlugin]
        });
        if (chartInstances[chartKey]) {
            chartInstances[chartKey].$markerRows = pageRows;
            chartInstances[chartKey].$markerDefs = markerDefs;
            chartInstances[chartKey].$markerFormat = format;
        }
        if (canvas) bindMarkerTooltip(canvas, chartKey);

        // Pager antes do resize, pelo mesmo motivo de paintCompletionTimePage:
        // ele encolhe o canvas e o Chart.js precisa remedir depois disso.
        paintChartPager(pager, totalPages, currentPage, onPage);
        chartInstances[chartKey]?.resize();
        chartInstances[chartKey]?.update('none');
    }

    // ─── Relatório em Excel do colaborador ───
    // Tudo que a aba Gráficos mostra, em planilha: os indicadores do topo, os
    // cursos, as tentativas e as quebras por mês/nota. Respeita os mesmos
    // filtros de ano e período dos gráficos — o que está na tela é o que sai
    // no arquivo (a única exceção, sinalizada na própria aba, são os cursos
    // pendentes, que não têm data de conclusão para recortar).
    //
    // Usa a 'xlsx-style' (ver js/vendor-loader.js) porque a SheetJS community
    // ignora estilo de célula, e sem cor nem negrito o relatório vira um
    // despejo de texto.
    const XLS_FONT = 'Calibri';
    const XLS_BRAND = '1D4ED8';
    const XLS_HEADER_BG = '1E3A8A';
    const XLS_BORDER = { style: 'thin', color: { rgb: 'D8E0EC' } };

    function xlsBox(extra = {}) {
        return { top: XLS_BORDER, bottom: XLS_BORDER, left: XLS_BORDER, right: XLS_BORDER, ...extra };
    }
    // Célula de título da planilha (faixa azul, texto branco grande).
    function xlsTitleCell(text) {
        return {
            v: text, t: 's',
            s: {
                font: { name: XLS_FONT, sz: 16, bold: true, color: { rgb: 'FFFFFF' } },
                fill: { fgColor: { rgb: XLS_BRAND } },
                alignment: { vertical: 'center', horizontal: 'left' }
            }
        };
    }
    function xlsSubtitleCell(text) {
        return {
            v: text, t: 's',
            s: {
                font: { name: XLS_FONT, sz: 10, color: { rgb: 'E8EEFB' } },
                fill: { fgColor: { rgb: XLS_BRAND } },
                alignment: { vertical: 'center', horizontal: 'left' }
            }
        };
    }
    function xlsHeaderCell(text) {
        return {
            v: text, t: 's',
            s: {
                font: { name: XLS_FONT, sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
                fill: { fgColor: { rgb: XLS_HEADER_BG } },
                alignment: { vertical: 'center', horizontal: 'center', wrapText: true },
                border: xlsBox()
            }
        };
    }
    // `tone` pinta o texto: ok (verde), bad (vermelho), warn (laranja),
    // strong (azul, para os números de destaque do resumo).
    const XLS_TONES = { ok: '047857', bad: 'B91C1C', warn: 'B45309', strong: XLS_BRAND, muted: '64748B' };
    function xlsCell(value, { tone, bold, align, zebra, numFmt } = {}) {
        const isNumber = typeof value === 'number' && Number.isFinite(value);
        const cell = { v: isNumber ? value : (value ?? ''), t: isNumber ? 'n' : 's' };
        if (numFmt) cell.z = numFmt;
        cell.s = {
            font: { name: XLS_FONT, sz: 10.5, bold: !!bold, color: { rgb: XLS_TONES[tone] || '1F2937' } },
            alignment: { vertical: 'center', horizontal: align || (isNumber ? 'center' : 'left'), wrapText: false },
            border: xlsBox()
        };
        if (zebra) cell.s.fill = { fgColor: { rgb: 'F4F7FC' } };
        return cell;
    }
    // Rótulo da coluna esquerda do bloco de indicadores.
    function xlsLabelCell(text) {
        return {
            v: text, t: 's',
            s: {
                font: { name: XLS_FONT, sz: 10.5, bold: true, color: { rgb: '334155' } },
                fill: { fgColor: { rgb: 'EEF3FB' } },
                alignment: { vertical: 'center', horizontal: 'left' },
                border: xlsBox()
            }
        };
    }
    function xlsSectionCell(text) {
        return {
            v: text, t: 's',
            s: {
                font: { name: XLS_FONT, sz: 11.5, bold: true, color: { rgb: XLS_BRAND } },
                alignment: { vertical: 'center', horizontal: 'left' }
            }
        };
    }

    // Monta uma aba de tabela: faixa de título + cabeçalho + linhas zebradas.
    // `columns` é [{ header, width, cell(row) }] — `cell` devolve o valor ou
    // um { value, tone, bold } quando a célula precisa de cor.
    function xlsTableSheet(XLSXLib, { title, subtitle, columns, rows, emptyMessage }) {
        const matrix = [];
        const colCount = Math.max(columns.length, 3);
        const pad = (cells) => {
            const line = cells.slice();
            while (line.length < colCount) line.push(xlsCell(''));
            return line;
        };
        matrix.push(pad([xlsTitleCell(title), ...Array(colCount - 1).fill(xlsTitleCell(''))]));
        matrix.push(pad([xlsSubtitleCell(subtitle || ''), ...Array(colCount - 1).fill(xlsSubtitleCell(''))]));
        matrix.push(pad([]));
        matrix.push(columns.map(c => xlsHeaderCell(c.header)));

        if (rows.length === 0) {
            matrix.push(pad([xlsCell(emptyMessage || 'Sem dados neste recorte.', { tone: 'muted' })]));
        } else {
            rows.forEach((row, i) => {
                matrix.push(columns.map(col => {
                    const out = col.cell(row);
                    const spec = (out && typeof out === 'object' && !(out instanceof Date)) ? out : { value: out };
                    return xlsCell(spec.value, { ...spec, zebra: i % 2 === 1 });
                }));
            });
        }

        const ws = XLSXLib.utils.aoa_to_sheet(matrix);
        ws['!cols'] = columns.map(c => ({ wch: c.width || 16 }));
        ws['!rows'] = [{ hpt: 26 }, { hpt: 16 }, { hpt: 6 }, { hpt: 22 }];
        ws['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } }
        ];
        // Autofiltro no cabeçalho: dá ordenação e filtro por coluna já ao
        // abrir o arquivo. (Congelar painel não entra: a SheetJS não escreve
        // <pane> na exportação, então `!freeze` seria código morto.)
        if (rows.length > 0) {
            ws['!autofilter'] = { ref: XLSXLib.utils.encode_range({ s: { r: 3, c: 0 }, e: { r: 3 + rows.length, c: columns.length - 1 } }) };
        }
        return ws;
    }

    function pctLabel(part, total) {
        return total > 0 ? `${Math.round((part / total) * 100)}%` : '—';
    }
    function starsLabel(rating) {
        const n = Number(rating);
        return Number.isFinite(n) && n >= 1 && n <= 5 ? `${n}★` : '—';
    }
    function deadlineStatusLabel(status) {
        return U.Deadlines?.STATUS_LABELS?.[status] || status || '—';
    }
    function isOnTime(status) { return ['on_time', 'livre', 'forgiven'].includes(status); }

    // Texto do período aplicado, pro cabeçalho do relatório deixar explícito
    // qual recorte gerou aqueles números.
    // Recorte real coberto pelo relatório: da primeira à última prova que
    // sobrou depois dos filtros. O rótulo do chip diz o que foi PEDIDO
    // ("ano 2026"); esta linha diz o que o relatório de fato cobre, que é o
    // que permite conferir o PDF meses depois sem lembrar do filtro.
    function rowsDateRangeLabel(rows) {
        const stamps = rows.map(r => r.submittedAt).filter(Number.isFinite);
        if (!stamps.length) return null;
        const first = new Date(Math.min(...stamps)).toLocaleDateString("pt-BR");
        const last = new Date(Math.max(...stamps)).toLocaleDateString("pt-BR");
        return first === last ? first : first + " a " + last;
    }

    function userReportPeriodLabel() {
        const year = userChartYearChip.getValue();
        const range = userChartRangeChip.getRange();
        const startIndex = monthIndexFromInput(range?.start);
        const endIndex = monthIndexFromInput(range?.end);
        const parts = [];
        if (startIndex !== null && endIndex !== null) parts.push(`${monthLabelOf(startIndex)} a ${monthLabelOf(endIndex)}`);
        else if (startIndex !== null) parts.push(`a partir de ${monthLabelOf(startIndex)}`);
        else if (endIndex !== null) parts.push(`até ${monthLabelOf(endIndex)}`);
        if (year) parts.push(`ano ${year}`);
        return parts.length ? parts.join(' • ') : 'Todo o histórico';
    }

    // Lista de itens marcados num chip, para rótulo: acima de três vira
    // "N funções"/"N cursos" em vez de uma linha que estoura a capa do PDF.
    function chipSelectionLabel(chip, plural) {
        const items = [...chip.getValues()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
        if (items.length === 0) return '';
        if (items.length <= 3) return items.join(', ');
        return `${items.length} ${plural}`;
    }

    function roleSelectionLabel(chip) { return chipSelectionLabel(chip, 'funções'); }
    function courseSelectionLabel(chip) { return chipSelectionLabel(chip, 'cursos'); }

    // Uma só linha de recorte para o PDF, com os filtros ativos: sem nenhum
    // ativo devolve null e a capa/tarja não ganha linha vazia.
    function reportScopeLabel(roleLabel, roleChip, courseLabel, courseChip) {
        const parts = [];
        if (roleChip.getValues().size) parts.push(roleLabel);
        if (courseChip.getValues().size) parts.push(courseLabel);
        return parts.length ? parts.join(' · ') : null;
    }

    // Recorte de função-alvo, dito por extenso no relatório: sem isso um PDF
    // filtrado por cargo seria indistinguível de um completo.
    function userReportRoleLabel() {
        const label = roleSelectionLabel(userChartRoleChip);
        return label ? `Cursos destinados a ${label}` : 'Todas as funções';
    }

    function userReportCourseLabel() {
        const label = courseSelectionLabel(userChartCourseChip);
        return label ? `Somente ${label}` : 'Todos os cursos';
    }

    // Os indicadores do topo do relatório — os mesmos números que a aba
    // Gráficos mostra, num lugar só.
    function buildUserReportSummary(rows) {
        const lastAttempts = lastAttemptByCourse(rows);
        const courses = attemptsByCourse(rows);
        const scores = rows.map(r => Number(r.score)).filter(Number.isFinite);
        const durations = rows.map(r => Number(r.durationSeconds)).filter(Number.isFinite);
        const actives = lastAttempts.map(userCompletionDurationOf).filter(ms => Number.isFinite(ms) && ms > 0);
        const ratings = ratedOnly(rows).map(r => Number(r.rating));
        const late = lastAttempts.filter(r => isLateStatus(r.deadlineStatus)).length;
        const noDeadline = lastAttempts.filter(r => !hasDeadline(r.deadlineStatus)).length;
        const onTime = lastAttempts.length - late - noDeadline;
        const approved = rows.filter(r => r.approved).length;
        const avg = (list) => list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;

        return [
            { section: 'Volume' },
            { label: 'Cursos avaliados', value: courses.length, tone: 'strong' },
            { label: 'Tentativas de prova', value: rows.length },
            { label: 'Aprovações', value: approved, tone: 'ok' },
            { label: 'Reprovações', value: rows.length - approved, tone: rows.length - approved > 0 ? 'bad' : undefined },
            { label: 'Taxa de aprovação', value: pctLabel(approved, rows.length), tone: 'strong' },

            { section: 'Notas' },
            { label: 'Média das notas', value: scores.length ? formatScore(avg(scores)) : '—', tone: 'strong' },
            { label: 'Maior nota', value: scores.length ? formatScore(Math.max(...scores)) : '—', tone: 'ok' },
            { label: 'Menor nota', value: scores.length ? formatScore(Math.min(...scores)) : '—', tone: 'bad' },

            { section: 'Prazo' },
            { label: 'Concluídos no prazo', value: onTime, tone: 'ok' },
            { label: 'Concluídos fora do prazo', value: late, tone: late > 0 ? 'bad' : undefined },
            { label: 'Cursos sem prazo', value: noDeadline },
            { label: '% no prazo (cursos com prazo)', value: pctLabel(onTime, onTime + late), tone: 'strong' },

            { section: 'Retentativas' },
            { label: 'Aprovado na 1ª tentativa', value: courses.filter(c => c.firstTry).length, tone: 'ok' },
            { label: 'Aprovado após retentativa', value: courses.filter(c => c.retried).length, tone: 'warn' },
            { label: 'Ainda reprovado', value: courses.filter(c => !c.approved).length, tone: 'bad' },

            { section: 'Tempos' },
            { label: 'Tempo médio de prova', value: durations.length ? formatDuration(avg(durations)) : '—' },
            { label: 'Tempo médio de conclusão', value: actives.length ? formatHHMMSS(avg(actives)) : '—' },

            { section: 'Satisfação' },
            { label: 'Pesquisas respondidas', value: ratings.length },
            { label: 'Satisfação média', value: ratings.length ? `${avg(ratings).toFixed(1).replace('.', ',')}★` : '—', tone: 'strong' },
            { label: 'Comentários deixados', value: rows.filter(r => r.comment).length },

            { section: 'Pendências' },
            { label: 'Cursos pendentes', value: userPendingDataCache.length, tone: userPendingDataCache.length > 0 ? 'warn' : 'ok' },
            { label: 'Progresso médio dos pendentes', value: userPendingDataCache.length ? `${Math.round(avg(userPendingDataCache.map(p => p.pct)))}%` : '—' }
        ];
    }

    function buildUserSummarySheet(XLSXLib, colab, rows) {
        const matrix = [];
        const push = (cells) => {
            const line = cells.slice();
            while (line.length < 3) line.push(xlsCell(''));
            matrix.push(line);
        };
        matrix.push([xlsTitleCell(`Relatório de ${colab.fullName || 'colaborador'}`), xlsTitleCell(''), xlsTitleCell('')]);
        matrix.push([xlsSubtitleCell(`${U.currentCategoryName || CATEGORY_LABELS[currentSlug()] || currentSlug()} • Período: ${userReportPeriodLabel()} • ${userReportRoleLabel()} • ${userReportCourseLabel()}`), xlsSubtitleCell(''), xlsSubtitleCell('')]);
        push([]);

        push([xlsSectionCell('Identificação')]);
        [
            ['Colaborador', colab.fullName || '—'],
            ['Cargo', colab.role || '—'],
            ['Unidade', colab.unit || '—'],
            ['Categoria', U.currentCategoryName || CATEGORY_LABELS[currentSlug()] || currentSlug()],
            ['Período do relatório', userReportPeriodLabel()],
            ['Recorte por função', userReportRoleLabel()],
            ['Recorte por curso', userReportCourseLabel()],
            ['Gerado em', new Date().toLocaleString('pt-BR')]
        ].forEach(([label, value]) => push([xlsLabelCell(label), xlsCell(value, { align: 'left' })]));
        push([]);

        buildUserReportSummary(rows).forEach(item => {
            if (item.section) {
                push([]);
                push([xlsSectionCell(item.section)]);
                push([xlsHeaderCell('Indicador'), xlsHeaderCell('Valor')]);
                return;
            }
            push([xlsLabelCell(item.label), xlsCell(item.value, { tone: item.tone, bold: true, align: 'center' })]);
        });

        const ws = XLSXLib.utils.aoa_to_sheet(matrix);
        ws['!cols'] = [{ wch: 32 }, { wch: 22 }, { wch: 4 }];
        ws['!rows'] = [{ hpt: 28 }, { hpt: 17 }];
        ws['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } }
        ];
        return ws;
    }

    // ─── Aba "Gráficos" do relatório ───
    // Os gráficos do Excel são nativos e leem células, então esta aba guarda
    // as séries em blocos pequenos na esquerda (colunas A:C) e ancora os
    // gráficos à direita, numa grade de duas colunas — tabela e gráfico
    // correspondente ficam na mesma altura.
    const XLS_CHART_COL_A = 4;   // coluna E
    const XLS_CHART_COL_B = 13;  // coluna N
    const XLS_CHART_WIDTH = 8;
    const XLS_CHART_HEIGHT = 17;

    function xlsHex(color) { return String(color).replace('#', '').toUpperCase(); }
    function xlsRange(col, firstRow, lastRow) { return `$${col}$${firstRow}:$${col}$${lastRow}`; }

    // `opts` existe para o relatório da unidade reusar esta aba: lá o
    // agrupamento não é por curso, e sim por par (pessoa, curso).
    function buildUserChartsSheet(XLSXLib, colab, rows, opts) {
        const periodLabel = opts?.periodLabel || userReportPeriodLabel();
        const roleLabel = opts?.roleLabel !== undefined
            ? opts.roleLabel
            : `${userReportRoleLabel()} • ${userReportCourseLabel()}`;
        const attemptsOf = opts?.attemptsOf || attemptsByCourse;
        const lastAttemptsOf = opts?.lastAttemptsOf || lastAttemptByCourse;
        const monthRange = opts?.range || userChartRangeChip.getRange();
        // Sem período, as barras de "Prazo por Mês" seguem o chip de ano.
        const chartYear = opts?.year !== undefined ? opts.year : userChartYearChip.getValue();
        const matrix = [];
        const put = (rowIndex, cells) => {
            while (matrix.length <= rowIndex) matrix.push([]);
            matrix[rowIndex] = cells;
        };
        put(0, [xlsTitleCell('Gráficos do período'), xlsTitleCell(''), xlsTitleCell('')]);
        put(1, [xlsSubtitleCell(`${colab.fullName || 'Colaborador'} • ${periodLabel}${roleLabel ? ` • ${roleLabel}` : ''}`), xlsSubtitleCell(''), xlsSubtitleCell('')]);

        const charts = [];
        // `topRow` é a linha 1-based onde o bloco começa (título da seção).
        // Devolve a linha 1-based da primeira linha de dados.
        const block = (topRow, section, headers, dataRows) => {
            put(topRow - 1, [xlsSectionCell(section)]);
            put(topRow, headers.map(xlsHeaderCell));
            dataRows.forEach((cells, i) => put(topRow + 1 + i, cells));
            return topRow + 2; // 1-based: cabeçalho em topRow+1, dados a partir de topRow+2
        };

        // 1) Tentativas das Avaliações
        const approved = rows.filter(r => r.approved).length;
        const approvalFirst = block(4, 'Tentativas das Avaliações', ['Situação', 'Tentativas'], [
            [xlsCell('Aprovação'), xlsCell(approved, { tone: 'ok', bold: true })],
            [xlsCell('Reprovação', { zebra: true }), xlsCell(rows.length - approved, { tone: 'bad', bold: true, zebra: true })]
        ]);
        charts.push({
            type: 'pie', title: 'Tentativas das Avaliações',
            anchor: { col: XLS_CHART_COL_A, row: 3, colSpan: XLS_CHART_WIDTH, rowSpan: XLS_CHART_HEIGHT },
            catRef: xlsRange('A', approvalFirst, approvalFirst + 1),
            categories: ['Aprovação', 'Reprovação'],
            pointColors: [xlsHex(CHART_COLORS.success), xlsHex(CHART_COLORS.danger)],
            series: [{ name: 'Tentativas', nameRef: '$B$5', valRef: xlsRange('B', approvalFirst, approvalFirst + 1), values: [approved, rows.length - approved] }]
        });

        // 2) Retentativas
        const courses = attemptsOf(rows);
        const retries = [
            { label: 'Aprovado na 1ª tentativa', value: courses.filter(c => c.firstTry).length, color: CHART_COLORS.success, tone: 'ok' },
            { label: 'Aprovado após retentativa', value: courses.filter(c => c.retried).length, color: CHART_COLORS.warning, tone: 'warn' },
            { label: 'Ainda reprovado', value: courses.filter(c => !c.approved).length, color: CHART_COLORS.danger, tone: 'bad' }
        ];
        const retriesFirst = block(9, 'Retentativas', ['Situação', 'Cursos'],
            retries.map((r, i) => [xlsCell(r.label, { zebra: i % 2 === 1 }), xlsCell(r.value, { tone: r.tone, bold: true, zebra: i % 2 === 1 })]));
        charts.push({
            type: 'pie', title: 'Retentativas',
            anchor: { col: XLS_CHART_COL_B, row: 3, colSpan: XLS_CHART_WIDTH, rowSpan: XLS_CHART_HEIGHT },
            catRef: xlsRange('A', retriesFirst, retriesFirst + retries.length - 1),
            categories: retries.map(r => r.label),
            pointColors: retries.map(r => xlsHex(r.color)),
            series: [{ name: 'Cursos', nameRef: '$B$10', valRef: xlsRange('B', retriesFirst, retriesFirst + retries.length - 1), values: retries.map(r => r.value) }]
        });

        // 3) Realização dos Cursos (prazo da última tentativa de cada curso)
        // No relatório do colaborador (sem `opts`) curso sem prazo sai de "No
        // prazo" e vira linha própria, como na tela e no PDF dele. O da
        // unidade ainda soma os dois, igual às telas da unidade.
        const splitNoDeadline = !opts;
        const lastAttempts = lastAttemptsOf(rows);
        const deadlineGroups = splitNoDeadline
            ? [
                { label: 'No prazo', tone: 'ok', color: CHART_COLORS.accent, match: r => hasDeadline(r.deadlineStatus) && isOnTime(r.deadlineStatus) },
                { label: 'Fora do prazo', tone: 'bad', color: CHART_COLORS.danger, match: r => isLateStatus(r.deadlineStatus) },
                { label: 'Sem prazo', tone: undefined, color: CHART_COLORS.muted, match: r => !hasDeadline(r.deadlineStatus) }
            ]
            : [
                { label: 'No prazo', tone: 'ok', color: CHART_COLORS.accent, match: r => isOnTime(r.deadlineStatus) },
                { label: 'Fora do prazo', tone: 'bad', color: CHART_COLORS.danger, match: r => !isOnTime(r.deadlineStatus) }
            ];
        const deadlineTotals = deadlineGroups.map(g => lastAttempts.filter(g.match).length);
        const deadlineFirst = block(15, 'Realização dos Cursos', ['Prazo', 'Cursos'],
            deadlineGroups.map((g, i) => [xlsCell(g.label, { zebra: i % 2 === 1 }), xlsCell(deadlineTotals[i], { tone: g.tone, bold: true, zebra: i % 2 === 1 })]));
        const deadlineLastRow = deadlineFirst + deadlineGroups.length - 1;
        charts.push({
            type: 'pie', title: 'Realização dos Cursos',
            anchor: { col: XLS_CHART_COL_A, row: 21, colSpan: XLS_CHART_WIDTH, rowSpan: XLS_CHART_HEIGHT },
            catRef: xlsRange('A', deadlineFirst, deadlineLastRow),
            categories: deadlineGroups.map(g => g.label),
            pointColors: deadlineGroups.map(g => xlsHex(g.color)),
            series: [{ name: 'Cursos', nameRef: '$B$16', valRef: xlsRange('B', deadlineFirst, deadlineLastRow), values: deadlineTotals }]
        });

        // 4) Satisfação
        const rated = ratedOnly(rows);
        const starCounts = [1, 2, 3, 4, 5].map(star => rated.filter(r => Number(r.rating) === star).length);
        const starFirst = block(20, 'Satisfação com os Cursos', ['Estrelas', 'Avaliações'],
            starCounts.map((count, i) => [xlsCell(`${i + 1}★`, { zebra: i % 2 === 1 }), xlsCell(count, { bold: true, zebra: i % 2 === 1 })]));
        charts.push({
            type: 'bar', title: 'Satisfação com os Cursos', legend: false,
            anchor: { col: XLS_CHART_COL_B, row: 21, colSpan: XLS_CHART_WIDTH, rowSpan: XLS_CHART_HEIGHT },
            catRef: xlsRange('A', starFirst, starFirst + 4),
            categories: ['1★', '2★', '3★', '4★', '5★'],
            catTitle: 'Estrelas', valTitle: 'Avaliações',
            series: [{ name: 'Avaliações', nameRef: '$B$21', valRef: xlsRange('B', starFirst, starFirst + 4), values: starCounts, color: xlsHex(CHART_COLORS.warning) }]
        });

        // 5) Distribuição de notas
        const scoreCounts = new Array(11).fill(0);
        rows.forEach(r => {
            const score = Number(r.score);
            if (!Number.isFinite(score)) return;
            scoreCounts[Math.min(10, Math.max(0, Math.floor(score)))]++;
        });
        const scoreFirst = block(28, 'Distribuição de Notas', ['Nota', 'Provas'],
            scoreCounts.map((count, score) => [xlsCell(score, { bold: true, zebra: score % 2 === 1 }), xlsCell(count, { zebra: score % 2 === 1 })]));
        charts.push({
            type: 'bar', title: 'Distribuição de Notas', legend: false,
            anchor: { col: XLS_CHART_COL_A, row: 39, colSpan: XLS_CHART_WIDTH, rowSpan: XLS_CHART_HEIGHT },
            catRef: xlsRange('A', scoreFirst, scoreFirst + 10),
            categories: scoreCounts.map((_, score) => String(score)),
            catTitle: 'Nota', valTitle: 'Provas',
            // Uma série só, colorida por ponto: cada faixa de nota fica na sua
            // cor, como no gráfico da tela.
            pointColors: scoreCounts.map((_, score) => xlsHex(scoreBarColor(score))),
            series: [{ name: 'Provas', nameRef: '$B$29', valRef: xlsRange('B', scoreFirst, scoreFirst + 10), values: scoreCounts }]
        });

        // 6) Prazo por mês
        const monthBuckets = monthBucketsForRange(monthRange, lastAttempts, chartYear);
        const byMonth = deadlineGroups.map(g => countIntoMonthBuckets(lastAttempts.filter(g.match), monthBucketsForRange(monthRange, lastAttempts, chartYear)));
        const monthFirst = block(42, 'Prazo por Mês', ['Mês', ...deadlineGroups.map(g => g.label)],
            monthBuckets.map((b, i) => [
                xlsCell(b.label, { bold: true, zebra: i % 2 === 1 }),
                ...deadlineGroups.map((g, gi) => xlsCell(byMonth[gi][i].count, { tone: g.tone, zebra: i % 2 === 1 }))
            ]));
        const monthLast = monthFirst + monthBuckets.length - 1;
        const monthCols = ['B', 'C', 'D'];
        charts.push({
            type: 'bar', title: 'Prazo por Mês', stacked: true,
            anchor: { col: XLS_CHART_COL_B, row: 39, colSpan: XLS_CHART_WIDTH, rowSpan: XLS_CHART_HEIGHT },
            catRef: xlsRange('A', monthFirst, monthLast),
            categories: monthBuckets.map(b => b.label),
            valTitle: 'Cursos concluídos',
            series: deadlineGroups.map((g, gi) => ({
                name: g.label, nameRef: `$${monthCols[gi]}$43`,
                valRef: xlsRange(monthCols[gi], monthFirst, monthLast),
                values: byMonth[gi].map(b => b.count), color: xlsHex(g.color)
            }))
        });

        // Preenche buracos deixados pelas linhas em branco entre blocos, senão
        // aoa_to_sheet gera linhas indefinidas.
        for (let i = 0; i < matrix.length; i++) if (!matrix[i]) matrix[i] = [];

        const ws = XLSXLib.utils.aoa_to_sheet(matrix);
        // Objetos distintos por coluna: a SheetJS anota largura calculada em
        // cada um ao escrever, e uma referência compartilhada viraria uma
        // coluna só com o resultado de todas.
        ws['!cols'] = [
            // A coluna D só guarda dados com a série "Sem prazo"; sem ela é
            // o respiro entre as tabelas e os gráficos.
            { wch: 24 }, { wch: 14 }, { wch: 14 }, { wch: splitNoDeadline ? 12 : 3 },
            ...Array.from({ length: 18 }, () => ({ wch: 9 }))
        ];
        ws['!rows'] = [{ hpt: 26 }, { hpt: 16 }];
        ws['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } }
        ];
        return { ws, charts };
    }

    async function exportUserReport() {
        const colab = userChartColabCache;
        if (!colab) { showWarning('Abra um colaborador para gerar o relatório.'); return; }
        const btn = document.getElementById('cfg-dash-user-export-btn');
        if (btn) btn.disabled = true;
        showWarning('Gerando planilha...');
        try {
            // fflate junto: os gráficos entram reabrindo o .xlsx já escrito
            // (ver js/admin-xlsx-charts.js).
            if (U.loadVendor) await Promise.all([U.loadVendor('xlsx-style'), U.loadVendor('fflate')]);
            const XLSXLib = window.XLSX;
            if (!XLSXLib) throw new Error('biblioteca de planilha indisponível');

            const rows = filterUserRows(userChartRowsCache);
            const lastAttempts = lastAttemptByCourse(rows);
            const attemptsByKey = new Map(attemptsByCourse(rows).map(c => [c.key, c.attempts]));
            // Médias e metas dos gráficos de tempo, pra planilha trazer a mesma
            // comparação que a tela mostra como risco vermelho/laranja.
            const evalByLabel = new Map(buildUserTimeComparison(rows, userEvalDurationOf).map(d => [d.label, d]));
            const activeByLabel = new Map(buildUserTimeComparison(rows, userCompletionDurationOf).map(d => [d.label, d]));

            const wb = XLSXLib.utils.book_new();
            XLSXLib.utils.book_append_sheet(wb, buildUserSummarySheet(XLSXLib, colab, rows), 'Resumo');

            // Aba de gráficos logo depois do Resumo: quem abre o arquivo vê o
            // panorama antes das tabelas longas.
            const chartsSheet = buildUserChartsSheet(XLSXLib, colab, rows);
            XLSXLib.utils.book_append_sheet(wb, chartsSheet.ws, 'Gráficos');

            // Cursos — uma linha por curso (situação final), como os gráficos.
            XLSXLib.utils.book_append_sheet(wb, xlsTableSheet(XLSXLib, {
                title: 'Cursos realizados',
                subtitle: `Situação final de cada curso • Período: ${userReportPeriodLabel()}`,
                columns: [
                    { header: 'Curso', width: 42, cell: (r) => ({ value: rowCourseLabel(r), bold: true }) },
                    { header: 'Assunto', width: 26, cell: (r) => r.subject || '—' },
                    { header: 'Conclusão em', width: 18, cell: (r) => r.submittedAt ? new Date(r.submittedAt).toLocaleString('pt-BR') : '—' },
                    { header: 'Nota', width: 8, cell: (r) => ({ value: Number.isFinite(Number(r.score)) ? Number(r.score) : '—', tone: Number(r.score) >= 8 ? 'ok' : Number(r.score) >= 6 ? 'warn' : 'bad', bold: true }) },
                    { header: 'Situação', width: 13, cell: (r) => ({ value: r.approved ? 'Aprovado' : 'Reprovado', tone: r.approved ? 'ok' : 'bad', bold: true }) },
                    { header: 'Tentativas', width: 11, cell: (r) => attemptsByKey.get(rowCourseKey(r)) || 1 },
                    { header: 'Prazo', width: 15, cell: (r) => ({ value: deadlineStatusLabel(r.deadlineStatus), tone: deadlineTone(r.deadlineStatus) }) },
                    { header: 'Tempo de prova', width: 14, cell: (r) => formatDuration(r.durationSeconds) },
                    { header: 'Média de prova do curso', width: 20, cell: (r) => { const d = evalByLabel.get(rowCourseLabel(r)); return d?.avgMs ? formatMsAsDuration(d.avgMs) : '—'; } },
                    { header: 'Tempo de conclusão', width: 17, cell: (r) => formatHHMMSS(userCompletionDurationOf(r)) },
                    { header: 'Média de conclusão do curso', width: 22, cell: (r) => { const d = activeByLabel.get(rowCourseLabel(r)); return d?.avgMs ? formatHHMMSS(d.avgMs) : '—'; } },
                    { header: 'Meta esperada', width: 14, cell: (r) => { const d = activeByLabel.get(rowCourseLabel(r)); return d?.expectedMs ? formatHHMMSS(d.expectedMs) : '—'; } },
                    { header: 'Satisfação', width: 10, cell: (r) => starsLabel(r.rating) },
                    { header: 'Comentário', width: 50, cell: (r) => r.comment || '' }
                ],
                rows: lastAttempts.slice().sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0)),
                emptyMessage: 'Nenhum curso concluído neste período.'
            }), 'Cursos');

            // Tentativas — uma linha por prova enviada, inclusive reprovações.
            XLSXLib.utils.book_append_sheet(wb, xlsTableSheet(XLSXLib, {
                title: 'Tentativas de prova',
                subtitle: `Uma linha por prova enviada • Período: ${userReportPeriodLabel()}`,
                columns: [
                    { header: 'Data/Hora', width: 18, cell: (r) => r.submittedAt ? new Date(r.submittedAt).toLocaleString('pt-BR') : '—' },
                    { header: 'Curso', width: 42, cell: (r) => ({ value: rowCourseLabel(r), bold: true }) },
                    { header: 'Nota', width: 8, cell: (r) => ({ value: Number.isFinite(Number(r.score)) ? Number(r.score) : '—', tone: Number(r.score) >= 8 ? 'ok' : Number(r.score) >= 6 ? 'warn' : 'bad', bold: true }) },
                    { header: 'Situação', width: 13, cell: (r) => ({ value: r.approved ? 'Aprovado' : 'Reprovado', tone: r.approved ? 'ok' : 'bad', bold: true }) },
                    { header: 'Tempo de prova', width: 14, cell: (r) => formatDuration(r.durationSeconds) },
                    { header: 'Tempo de conclusão', width: 17, cell: (r) => formatHHMMSS(userCompletionDurationOf(r)) },
                    { header: 'Prazo', width: 15, cell: (r) => ({ value: deadlineStatusLabel(r.deadlineStatus), tone: deadlineTone(r.deadlineStatus) }) },
                    { header: 'Satisfação', width: 10, cell: (r) => starsLabel(r.rating) },
                    { header: 'Comentário', width: 50, cell: (r) => r.comment || '' }
                ],
                rows: rows.slice().sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0)),
                emptyMessage: 'Nenhuma prova enviada neste período.'
            }), 'Tentativas');

            // Prazo por mês — a mesma quebra do gráfico de barras empilhadas.
            const deadlineByMonth = buildUserDeadlineByMonth(lastAttempts);
            XLSXLib.utils.book_append_sheet(wb, xlsTableSheet(XLSXLib, {
                title: 'Prazo por mês',
                subtitle: 'Cursos concluídos em cada mês, pela situação da última tentativa',
                columns: [
                    { header: 'Mês', width: 14, cell: (b) => ({ value: b.label, bold: true }) },
                    { header: 'No prazo', width: 12, cell: (b) => ({ value: b.onTime, tone: 'ok' }) },
                    { header: 'Fora do prazo', width: 14, cell: (b) => ({ value: b.late, tone: b.late > 0 ? 'bad' : undefined }) },
                    { header: 'Sem prazo', width: 12, cell: (b) => b.noDeadline },
                    { header: 'Total', width: 10, cell: (b) => ({ value: b.onTime + b.late + b.noDeadline, bold: true }) },
                    // Só entre os cursos que tinham prazo: "sem prazo" não
                    // cumpre nem perde limite.
                    { header: '% no prazo', width: 12, cell: (b) => ({ value: pctLabel(b.onTime, b.onTime + b.late), tone: 'strong' }) }
                ],
                rows: deadlineByMonth
            }), 'Prazo por Mês');

            // Distribuição de notas — o histograma do gráfico "Notas".
            const scoreCounts = new Array(11).fill(0);
            rows.forEach(r => {
                const score = Number(r.score);
                if (!Number.isFinite(score)) return;
                scoreCounts[Math.min(10, Math.max(0, Math.floor(score)))]++;
            });
            const scoredTotal = scoreCounts.reduce((a, b) => a + b, 0);
            XLSXLib.utils.book_append_sheet(wb, xlsTableSheet(XLSXLib, {
                title: 'Distribuição de notas',
                subtitle: 'Provas por nota (arredondada para baixo)',
                columns: [
                    { header: 'Nota', width: 10, cell: (s) => ({ value: s.score, bold: true }) },
                    { header: 'Provas', width: 12, cell: (s) => ({ value: s.count, tone: s.score >= 8 ? 'ok' : s.score >= 6 ? 'warn' : 'bad' }) },
                    { header: '% do total', width: 12, cell: (s) => ({ value: pctLabel(s.count, scoredTotal), tone: 'strong' }) }
                ],
                rows: scoreCounts.map((count, score) => ({ score, count }))
            }), 'Notas');

            // Pendentes — único recorte fora do filtro de data, porque são
            // cursos que ainda não têm conclusão para datar.
            XLSXLib.utils.book_append_sheet(wb, xlsTableSheet(XLSXLib, {
                title: 'Cursos pendentes',
                subtitle: 'Cursos do público-alvo ainda não aprovados — não dependem do filtro de data, mas seguem os de função e curso',
                columns: [
                    { header: 'Curso', width: 46, cell: (p) => ({ value: p.name, bold: true }) },
                    { header: 'Assunto', width: 28, cell: (p) => p.subject },
                    { header: '% assistido', width: 13, cell: (p) => ({ value: `${p.pct}%`, tone: p.pct >= 75 ? 'ok' : p.pct > 0 ? 'warn' : 'bad', bold: true }) }
                ],
                rows: userPendingDataCache,
                emptyMessage: 'Nenhum curso pendente: já concluiu tudo que o cargo exige.'
            }), 'Pendentes');

            const safeName = normalizeName(colab.fullName || 'colaborador').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'colaborador';
            const date = new Date().toISOString().split('T')[0];
            const filename = `relatorio_${safeName}_${date}.xlsx`;
            // Com fflate disponível o arquivo sai com os gráficos nativos;
            // se a biblioteca não carregou, cai no writeFile normal — melhor
            // uma planilha sem gráfico do que nenhuma planilha.
            if (U.XlsxCharts && window.fflate) {
                const bytes = U.XlsxCharts.withCharts(XLSXLib, window.fflate, wb, 'Gráficos', chartsSheet.charts);
                U.XlsxCharts.download(bytes, filename);
            } else {
                XLSXLib.writeFile(wb, filename);
            }
            showWarning('Planilha baixada com sucesso!');
        } catch (error) {
            showWarning('Erro ao gerar planilha: ' + error.message);
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    document.getElementById('cfg-dash-user-export-btn')?.addEventListener('click', exportUserReport);

    // ─── Relatório em PDF ───
    // A planilha é para analisar; o PDF é para ler e enviar. Os dois saem do
    // MESMO recorte (`filterUserRows`: data + função), então nenhum número pode
    // divergir entre eles. Este módulo só monta o payload: quem desenha as
    // folhas é js/admin-pdf-report.js, que não enxerga o estado do dashboard.
    function pdfShortLabel(label) {
        const text = String(label || '');
        return text.length > 28 ? `${text.slice(0, 27)}…` : text;
    }

    // Cobertura da meta de tempo: quanto do tempo previsto o colaborador
    // realmente gastou no curso. Passar da meta não é problema — revisitar o
    // conteúdo é legítimo. O risco está embaixo: pouco tempo diante da meta
    // sugere que o conteúdo não foi assistido por inteiro. Faixas combinadas
    // com a coordenação: <40% crítico, 40–60% alerta, 60–90% satisfatório,
    // 90% ou mais excelente.
    const TIME_COVERAGE_LEVELS = [
        { max: 40, level: 'critico', label: 'Crítico', tone: 'is-bad' },
        { max: 60, level: 'alerta', label: 'Alerta', tone: 'is-warn' },
        { max: 90, level: 'satisfatorio', label: 'Satisfatório', tone: 'is-ok' },
        { max: Infinity, level: 'excelente', label: 'Excelente', tone: 'is-ok' }
    ];

    function timeCoverage(userMs, expectedMs) {
        if (!Number.isFinite(userMs) || userMs <= 0) return null;
        if (!Number.isFinite(expectedMs) || expectedMs <= 0) return null;
        const pct = Math.round((userMs / expectedMs) * 100);
        const band = TIME_COVERAGE_LEVELS.find(b => pct < b.max) || TIME_COVERAGE_LEVELS[TIME_COVERAGE_LEVELS.length - 1];
        return { pct, level: band.level, label: band.label, tone: band.tone };
    }

    // Verdito de tempo de um curso: a meta cadastrada manda; sem meta, sobra a
    // comparação com quem fez o mesmo curso.
    function pdfTimeVerdict(item) {
        const coverage = timeCoverage(item.userMs, item.expectedMs);
        if (coverage) {
            return `${formatHHMMSS(item.userMs)} · ${coverage.pct}% da meta · ${coverage.label}`;
        }
        if (Number.isFinite(item.avgMs) && item.avgMs > 0) {
            const deltaMin = Math.round((item.userMs - item.avgMs) / 60000);
            if (deltaMin > 0) return `${formatHHMMSS(item.userMs)} · ${deltaMin} min acima da média do curso`;
            if (deltaMin < 0) return `${formatHHMMSS(item.userMs)} · ${Math.abs(deltaMin)} min abaixo da média do curso`;
        }
        return `${formatHHMMSS(item.userMs)} · sem meta cadastrada`;
    }

    // Feedbacks do relatório, agrupados por curso.
    //
    // O que entra: qualquer avaliação de até 3 estrelas (com ou sem texto,
    // porque a nota baixa já é o sinal) e qualquer comentário escrito, mesmo
    // acompanhando nota alta. O que fica de fora: 4 ou 5 estrelas em branco —
    // são a maioria e não dizem nada, então viram uma contagem no fim da
    // seção em vez de encherem folhas.
    //
    // Ordem: bloco por curso, do curso com a pior avaliação para o com a
    // melhor; dentro do bloco, da menor nota para a maior. Comentário sem
    // nota vai para o fim do bloco (não há nota para ordenar).
    function buildReportFeedbacks(rows, authorOf) {
        const eligible = [];
        let hiddenCount = 0;
        rows.forEach(row => {
            const rating = Number(row.rating);
            const hasRating = Number.isFinite(rating) && rating >= 1 && rating <= 5;
            const hasComment = !!(row.comment && String(row.comment).trim());
            if (hasRating && rating >= 4 && !hasComment) { hiddenCount++; return; }
            if (!hasRating && !hasComment) return;
            eligible.push({ row, rating: hasRating ? rating : null });
        });

        const byCourse = new Map();
        eligible.forEach(item => {
            const course = rowCourseLabel(item.row);
            if (!byCourse.has(course)) byCourse.set(course, []);
            byCourse.get(course).push(item);
        });

        const rank = (item) => (item.rating === null ? 99 : item.rating);
        const groups = [...byCourse.entries()]
            .map(([course, items]) => {
                items.sort((a, b) => rank(a) - rank(b) || (b.row.submittedAt || 0) - (a.row.submittedAt || 0));
                return { course, items, worst: rank(items[0]) };
            })
            .sort((a, b) => a.worst - b.worst || a.course.localeCompare(b.course, 'pt-BR'));

        const feedbacks = [];
        groups.forEach(group => group.items.forEach(item => feedbacks.push({
            course: group.course,
            author: authorOf ? authorOf(item.row) : '',
            dateLabel: item.row.submittedAt ? new Date(item.row.submittedAt).toLocaleDateString('pt-BR') : '—',
            rating: item.rating,
            ratingLabel: starsLabel(item.row.rating),
            comment: item.row.comment || ''
        })));
        return { feedbacks, hiddenCount };
    }

    // Prazo por mês do colaborador: exatamente os mesmos baldes da aba
    // "Prazo por Mês" da planilha e do gráfico empilhado da tela.
    function buildUserDeadlineByMonth(lastAttempts) {
        const range = userChartRangeChip.getRange();
        const year = userChartYearChip.getValue();
        const bucketsOf = (subset) => countIntoMonthBuckets(subset, monthBucketsForRange(range, lastAttempts, year));
        const onTimeByMonth = bucketsOf(lastAttempts.filter(r => hasDeadline(r.deadlineStatus) && isOnTime(r.deadlineStatus)));
        const lateByMonth = bucketsOf(lastAttempts.filter(r => isLateStatus(r.deadlineStatus)));
        const noDeadlineByMonth = bucketsOf(lastAttempts.filter(r => !hasDeadline(r.deadlineStatus)));
        return monthBucketsForRange(range, lastAttempts, year).map((b, i) => ({
            label: b.label,
            onTime: onTimeByMonth[i].count,
            late: lateByMonth[i].count,
            noDeadline: noDeadlineByMonth[i].count
        }));
    }

    function buildUserPdfPayload(colab, rows) {
        const lastAttempts = lastAttemptByCourse(rows);
        const courses = attemptsByCourse(rows);
        const attemptsByKey = new Map(courses.map(c => [c.key, c.attempts]));
        const activeByLabel = new Map(buildUserTimeComparison(rows, userCompletionDurationOf).map(d => [d.label, d]));
        const scores = rows.map(r => Number(r.score)).filter(Number.isFinite);
        const evalSeconds = rows.map(r => Number(r.durationSeconds)).filter(Number.isFinite);
        const rated = ratedOnly(rows);
        const ratings = rated.map(r => Number(r.rating));
        // Cumprimento de prazo só entre os cursos que tinham prazo; os "sem
        // prazo" são contados à parte.
        const late = lastAttempts.filter(r => isLateStatus(r.deadlineStatus)).length;
        const noDeadline = lastAttempts.filter(r => !hasDeadline(r.deadlineStatus)).length;
        const deadlineCount = lastAttempts.length - noDeadline;
        const onTime = deadlineCount - late;
        const approved = rows.filter(r => r.approved).length;
        const avg = (list) => list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
        const avgScore = avg(scores);
        const avgRating = avg(ratings);
        const onTimePct = deadlineCount ? Math.round((onTime / deadlineCount) * 100) : null;

        const deadlineByMonth = buildUserDeadlineByMonth(lastAttempts);
        const worstMonth = deadlineByMonth.filter(m => m.late > 0).sort((a, b) => b.late - a.late)[0] || null;

        const timeVsGoal = buildUserTimeComparison(rows, userCompletionDurationOf).map(item => ({
            shortLabel: pdfShortLabel(item.label),
            userMin: Math.round(item.userMs / 60000),
            avgMin: Number.isFinite(item.avgMs) && item.avgMs > 0 ? Math.round(item.avgMs / 60000) : null,
            goalMin: Number.isFinite(item.expectedMs) && item.expectedMs > 0 ? Math.round(item.expectedMs / 60000) : null,
            verdict: pdfTimeVerdict(item)
        }));

        // Cursos abaixo da meta de tempo (crítico ou alerta, isto é, menos de
        // 60% do tempo previsto): o pior é o de menor cobertura.
        const underGoal = buildUserTimeComparison(rows, userCompletionDurationOf)
            .map(item => ({ item, coverage: timeCoverage(item.userMs, item.expectedMs) }))
            .filter(entry => entry.coverage && (entry.coverage.level === 'critico' || entry.coverage.level === 'alerta'))
            .sort((a, b) => a.coverage.pct - b.coverage.pct);
        const worstUnderGoal = underGoal[0] || null;

        // Sem autor: o relatório inteiro é de uma pessoa só.
        const userFeedbacks = buildReportFeedbacks(rows, null);

        const scoreHistory = rows.map(r => ({
            label: r.submittedAt ? new Date(r.submittedAt).toLocaleDateString('pt-BR') : '—',
            score: Number.isFinite(Number(r.score)) ? Number(r.score) : null
        }));

        const ratingCounts = [1, 2, 3, 4, 5].map(star => rated.filter(r => Number(r.rating) === star).length);

        return {
            colab: { fullName: colab.fullName || 'Colaborador', role: colab.role || '', unit: colab.unit || '' },
            categoryName: U.currentCategoryName || CATEGORY_LABELS[currentSlug()] || currentSlug(),
            periodLabel: userReportPeriodLabel(),
            roleLabel: reportScopeLabel(userReportRoleLabel(), userChartRoleChip, userReportCourseLabel(), userChartCourseChip),
            dataRangeLabel: rowsDateRangeLabel(rows),
            generatedAt: new Date().toLocaleString('pt-BR'),
            filename: `UniLAMIC_relatorio_${normalizeName(colab.fullName || 'colaborador').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'colaborador'}_${new Date().toISOString().split('T')[0]}.pdf`,
            summary: {
                coursesCount: courses.length,
                attempts: rows.length,
                approved,
                reproved: rows.length - approved,
                approvalPctLabel: pctLabel(approved, rows.length),
                avgScore,
                avgScoreLabel: avgScore === null ? null : formatScore(avgScore),
                minScoreLabel: scores.length ? formatScore(Math.min(...scores)) : '—',
                maxScoreLabel: scores.length ? formatScore(Math.max(...scores)) : '—',
                lastAttemptsCount: lastAttempts.length,
                deadlineCount,
                noDeadline,
                onTime,
                late,
                onTimePct,
                onTimePctLabel: pctLabel(onTime, deadlineCount),
                retryApproved: courses.filter(c => c.retried).length,
                stillFailing: courses.filter(c => !c.approved).length,
                avgEvalLabel: evalSeconds.length ? formatDuration(avg(evalSeconds)) : null,
                evalCount: evalSeconds.length,
                ratingsCount: ratings.length,
                lowRatingsCount: rated.filter(r => Number(r.rating) <= 3).length,
                avgRating,
                avgRatingLabel: avgRating === null ? null : avgRating.toFixed(1).replace('.', ','),
                commentsCount: rows.filter(r => r.comment).length,
                lowRatingsWithoutComment: rated.filter(r => Number(r.rating) <= 3 && !r.comment).length,
                pendingCount: userPendingDataCache.length,
                pendingAvgPctLabel: userPendingDataCache.length ? `${Math.round(avg(userPendingDataCache.map(p => p.pct)))}%` : null,
                underGoalCourses: underGoal.length,
                worstUnderGoalLabel: worstUnderGoal
                    ? `${pdfShortLabel(worstUnderGoal.item.label)}, ${worstUnderGoal.coverage.pct}% da meta`
                    : null,
                worstMonthLabel: worstMonth ? `${worstMonth.label} (${worstMonth.late})` : null
            },
            courses: lastAttempts.slice().sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0)).map(row => {
                const time = activeByLabel.get(rowCourseLabel(row));
                const activeMs = userCompletionDurationOf(row);
                const expectedMs = time?.expectedMs;
                const hasBoth = Number.isFinite(activeMs) && activeMs > 0 && Number.isFinite(expectedMs) && expectedMs > 0;
                const coverage = timeCoverage(activeMs, expectedMs);
                return {
                    name: rowCourseLabel(row),
                    subject: row.subject || '',
                    submittedLabel: row.submittedAt ? new Date(row.submittedAt).toLocaleDateString('pt-BR') : '',
                    score: Number.isFinite(Number(row.score)) ? Number(row.score) : null,
                    scoreLabel: Number.isFinite(Number(row.score)) ? `${formatScore(row.score)}/10` : '—',
                    approved: !!row.approved,
                    attempts: attemptsByKey.get(rowCourseKey(row)) || 1,
                    deadlineLabel: deadlineStatusLabel(row.deadlineStatus),
                    onTime: isOnTime(row.deadlineStatus),
                    noDeadline: !hasDeadline(row.deadlineStatus),
                    rating: Number.isFinite(Number(row.rating)) ? Number(row.rating) : null,
                    ratingLabel: starsLabel(row.rating),
                    comment: row.comment || '',
                    activeLabel: formatHHMMSS(activeMs),
                    // Sem tempo gravado (prova anterior à métrica, ou sem conta)
                    // o que falta é o registro, não a meta.
                    goalHint: hasBoth
                        ? `${coverage.pct}% da meta (${formatHHMMSS(expectedMs)})`
                        : !(Number.isFinite(activeMs) && activeMs > 0)
                            ? 'Tempo não registrado'
                            : (time?.avgMs ? `Média do curso ${formatHHMMSS(time.avgMs)}` : 'Sem meta cadastrada'),
                    timeLevel: coverage ? coverage.level : null,
                    timeLevelLabel: coverage ? coverage.label : null,
                    timePct: coverage ? coverage.pct : null
                };
            }),
            scoreHistory,
            // Mesma base do gráfico da tela (`renderUserCharts`): a média fixa
            // corre sobre `score` cru, senão as duas séries divergiriam.
            scoreTrend: fixedAverageLine(rows.map(r => r.score)),
            deadlineByMonth,
            ratingCounts,
            timeVsGoal,
            feedbacks: userFeedbacks.feedbacks,
            feedbackHiddenCount: userFeedbacks.hiddenCount,
            pending: buildUserPdfPending(colab, lastAttempts, attemptsByKey)
        };
    }

    // "O que ainda falta concluir" do PDF. Duas origens:
    // - pendentes do público-alvo (nunca aprovados): único recorte fora do
    //   filtro de data, igual à aba "Pendentes" da planilha — não há
    //   conclusão para datar;
    // - cursos que terminaram o período reprovados (última tentativa
    //   reprovada): já tiveram prova, mas continuam sem aprovação e precisam
    //   ser refeitos. Sem eles a folha não listava justamente o curso que o
    //   plano de ação manda retomar.
    // Um curso que está nos dois grupos aparece uma vez só, com a situação
    // de reprovado.
    function buildUserPdfPending(colab, lastAttempts, attemptsByKey) {
        const failingByName = new Map();
        lastAttempts.filter(r => !r.approved).forEach(r => {
            const attempts = attemptsByKey.get(rowCourseKey(r)) || 1;
            failingByName.set(normalizeName(rowCourseLabel(r)), {
                row: r,
                statusLabel: `Reprovado (nota ${formatScore(r.score)}, ${attempts} ${attempts === 1 ? 'tentativa' : 'tentativas'})`
            });
        });

        const pending = userPendingDataCache.map(p => {
            const key = normalizeName(p.name);
            const failing = failingByName.get(key);
            failingByName.delete(key);
            return { name: p.name, subject: p.subject, pct: p.pct, failed: !!failing, statusLabel: failing ? failing.statusLabel : 'Não concluído' };
        });
        const failingOnly = [...failingByName.values()].map(({ row, statusLabel }) => ({
            name: rowCourseLabel(row),
            subject: row.subject || '',
            pct: row.slug && row.subjectId && row.themeId ? progressPctFor(colab, row.slug, row.subjectId, row.themeId) : null,
            failed: true,
            statusLabel
        }));
        // Reprovados primeiro: são os que já foram tentados e não passaram.
        return [...failingOnly, ...pending].sort((a, b) => (b.failed - a.failed));
    }

    async function exportUserPdf() {
        const colab = userChartColabCache;
        if (!colab) { showWarning('Abra um colaborador para gerar o relatório.'); return; }
        if (!U.UserPdfReport) { showWarning('Módulo de relatório em PDF não carregado. Recarregue a página.'); return; }
        const btn = document.getElementById('cfg-dash-user-pdf-btn');
        if (btn) btn.disabled = true;
        try {
            const rows = filterUserRows(userChartRowsCache);
            const ok = await U.UserPdfReport.download(buildUserPdfPayload(colab, rows));
            if (ok) showWarning('Relatório baixado com sucesso!');
        } catch (error) {
            showWarning('Erro ao gerar o relatório: ' + error.message);
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    document.getElementById('cfg-dash-user-pdf-btn')?.addEventListener('click', exportUserPdf);

    // ─── Modal "de onde vêm os dados" ───
    // Clicar numa fatia/barra dos gráficos do colaborador abre este modal com
    // a lista exata de realizações que formaram aquele número. Cada item leva
    // ao detalhe completo da avaliação (openReviewModal), então o caminho
    // gráfico → recorte → prova fica inteiro sem sair do modal.
    const drillModal = document.getElementById('cfg-dash-drill-modal');
    const drillModalClose = document.getElementById('cfg-dash-drill-modal-close');
    let drillVisibleRows = [];

    function closeDrillModal() { if (drillModal) drillModal.style.display = 'none'; }

    drillModalClose?.addEventListener('click', closeDrillModal);
    drillModal?.addEventListener('click', (event) => { if (event.target === drillModal) closeDrillModal(); });
    // Um modal filho está aberto por cima do modal do colaborador? Usado
    // pelos handlers de Escape para fechar só o de cima.
    function isAnyDashboardChildModalOpen() {
        return drillModal?.style.display === 'flex'
            || document.getElementById('cfg-dash-review-modal')?.style.display === 'flex';
    }

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || drillModal?.style.display !== 'flex') return;
        // O detalhe da avaliação abre por cima deste modal e tem Escape
        // próprio — enquanto ele estiver aberto, este não reage.
        if (document.getElementById('cfg-dash-review-modal')?.style.display === 'flex') return;
        closeDrillModal();
    });

    // `rows` são linhas de histórico (já recortadas pelo clique). `extraOf`,
    // quando passado, devolve um selo extra por linha — usado pelo gráfico de
    // Retentativas, onde o que importa é quantas tentativas o curso exigiu.
    function openDrillModal({ title, subtitle, icon = 'fa-chart-simple', tone = '', stats = [], rows = [], extraOf = null, emptyMessage = 'Nenhuma realização neste recorte.' }) {
        if (!drillModal) return;
        const titleEl = document.getElementById('cfg-dash-drill-modal-title');
        const subtitleEl = document.getElementById('cfg-dash-drill-subtitle');
        const iconEl = document.getElementById('cfg-dash-drill-icon');
        const statsEl = document.getElementById('cfg-dash-drill-stats');
        const bodyEl = document.getElementById('cfg-dash-drill-body');

        if (titleEl) titleEl.textContent = title;
        if (subtitleEl) subtitleEl.textContent = subtitle || '';
        if (iconEl) {
            iconEl.className = `dash-drill-hero-icon ${tone}`;
            iconEl.innerHTML = `<i class="fas ${icon}"></i>`;
        }
        if (statsEl) {
            statsEl.innerHTML = stats.map(s => `
                <div class="dash-drill-stat ${s.tone || ''}">
                    <span class="dash-drill-stat-value">${escapeHtml(String(s.value))}</span>
                    <span class="dash-drill-stat-label">${escapeHtml(s.label)}</span>
                </div>`).join('');
            statsEl.style.display = stats.length ? '' : 'none';
        }

        drillVisibleRows = rows.slice().sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
        if (bodyEl) {
            bodyEl.innerHTML = drillVisibleRows.length === 0
                ? emptyStateHtml('fa-clipboard-list', emptyMessage)
                : `<div class="dash-drill-list">${drillVisibleRows.map((r, i) => {
                    const dateLabel = r.submittedAt ? new Date(r.submittedAt).toLocaleString('pt-BR') : '—';
                    const activeMs = r.userId ? allProgress[r.userId]?.[r.slug]?.[r.subjectId]?.[r.themeId]?.activeMs : null;
                    const extra = extraOf ? extraOf(r) : '';
                    const situationOk = !!r.approved;
                    return `
                    <button type="button" class="dash-drill-card ${situationOk ? 'is-ok' : 'is-bad'}" data-row-i="${i}" title="Ver detalhes da avaliação">
                        <span class="dash-drill-card-top">
                            <span class="dash-drill-card-name">${escapeHtml(rowCourseLabel(r))}</span>
                            ${scoreBadgeHtml(r.score)}
                        </span>
                        <span class="dash-drill-card-meta">
                            <span><i class="fas fa-calendar-day"></i> ${dateLabel}</span>
                            <span><i class="fas fa-stopwatch"></i> Prova ${formatDuration(r.durationSeconds)}</span>
                            <span><i class="fas fa-hourglass-half"></i> Conclusão ${formatHHMMSS(activeMs)}</span>
                        </span>
                        <span class="dash-drill-card-badges">
                            ${deadlineBadgeHtml(r.deadlineStatus)}
                            <span class="conclusion-situation ${situationOk ? 'is-ok' : 'is-bad'}"><i class="fas ${situationOk ? 'fa-circle-check' : 'fa-circle-xmark'}"></i> ${situationOk ? 'Aprovado' : 'Reprovado'}</span>
                            ${extra ? `<span class="dash-drill-card-extra">${escapeHtml(extra)}</span>` : ''}
                        </span>
                    </button>`;
                }).join('')}</div>`;
            bodyEl.querySelectorAll('.dash-drill-card').forEach(card => {
                card.addEventListener('click', () => {
                    const row = drillVisibleRows[Number(card.dataset.rowI)];
                    if (row) openReviewModal(row);
                });
            });
            bodyEl.scrollTop = 0;
        }
        drillModal.style.display = 'flex';
    }

    // Drill das pendências: o modal genérico lista linhas de histórico, e
    // pendência é o oposto — pessoa SEM registro naquele curso. Por isso esta
    // versão monta os cartões a partir das pessoas, sem passar por
    // `drillVisibleRows` (que ordena por data de envio, inexistente aqui).
    function openPendingDrillModal({ title, subtitle, people }) {
        if (!drillModal) return;
        const titleEl = document.getElementById('cfg-dash-drill-modal-title');
        const subtitleEl = document.getElementById('cfg-dash-drill-subtitle');
        const iconEl = document.getElementById('cfg-dash-drill-icon');
        const statsEl = document.getElementById('cfg-dash-drill-stats');
        const bodyEl = document.getElementById('cfg-dash-drill-body');

        if (titleEl) titleEl.textContent = title;
        if (subtitleEl) subtitleEl.textContent = subtitle || '';
        if (iconEl) {
            iconEl.className = 'dash-drill-hero-icon is-warn';
            iconEl.innerHTML = '<i class="fas fa-hourglass-half"></i>';
        }
        if (statsEl) statsEl.style.display = 'none';
        if (bodyEl) {
            bodyEl.innerHTML = people.length === 0
                ? emptyStateHtml('fa-user-check', 'Ninguém pendente neste curso.')
                : `<div class="dash-drill-list">${people.map(person => `
                    <div class="dash-drill-card is-pending">
                        <span class="dash-drill-card-top">
                            <span class="dash-drill-card-name">${escapeHtml(person.name)}</span>
                            <span class="dash-drill-pending-pct ${person.pct >= 75 ? 'is-high' : person.pct > 0 ? 'is-mid' : 'is-low'}">${person.pct}% assistido</span>
                        </span>
                        ${person.role ? `<span class="dash-drill-card-meta"><span><i class="fas fa-briefcase"></i> ${escapeHtml(person.role)}</span></span>` : ''}
                    </div>`).join('')}</div>`;
            bodyEl.scrollTop = 0;
        }
        drillModal.style.display = 'flex';
    }

    // Todo gráfico clicável do colaborador usa o mesmo par de handlers: abrir
    // o detalhamento do elemento clicado e virar a seta do mouse em mãozinha
    // quando há algo sob o cursor.
    function drillChartHandlers(onPick) {
        return {
            onClick: (event, elements) => {
                if (!elements.length) return;
                onPick(elements[0]);
            },
            onHover: (event, elements) => {
                event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
            }
        };
    }

    // ─── Aba "Informações": comentários deixados pelo colaborador ───
    // Espelho do painel de comentários do modal do curso, invertido: lá é um
    // curso e vários alunos, aqui é um aluno e vários cursos. Mesmo card,
    // mesma regra de entrada (comentou, ou avaliou com ≤3★ sem escrever) e
    // mesmo clique abrindo o detalhe da avaliação.
    const USER_COMMENTS_PAGE_SIZE = 6;
    let userCommentsRowsCache = [];
    let userCommentsVisibleRows = [];
    let userCommentsPage = 1;

    function userCommentCourseOf(row) { return rowCourseLabel(row); }

    function filteredUserCommentRows() {
        const courses = userCommentsCourseChip ? userCommentsCourseChip.getValues() : null;
        if (!courses || courses.size === 0) return userCommentsRowsCache;
        return userCommentsRowsCache.filter(r => courses.has(userCommentCourseOf(r)));
    }

    function renderUserCommentsTable(rows) {
        const container = document.getElementById('cfg-dash-user-comments');
        const pager = document.getElementById('cfg-dash-user-comments-pagination');
        const countEl = document.getElementById('cfg-dash-user-tabcount-info');
        userCommentsRowsCache = rows.filter(r => r.comment || (Number(r.rating) || 0) <= 3)
            .sort((a, b) => (Number(a.rating) || 0) - (Number(b.rating) || 0));
        userCommentsPage = 1;
        if (countEl) countEl.textContent = String(userCommentsRowsCache.length);
        userCommentsCourseChip?.setOptions([...new Set(userCommentsRowsCache.map(userCommentCourseOf))]
            .sort((a, b) => a.localeCompare(b, 'pt-BR')));
        if (!container) return;
        if (userCommentsRowsCache.length === 0) {
            userCommentsVisibleRows = [];
            container.innerHTML = '<p class="dashboard-table-empty">Este colaborador ainda não deixou nenhum comentário.</p>';
            if (pager) pager.innerHTML = '';
            return;
        }
        paintUserCommentsPage();
    }

    function paintUserCommentsPage() {
        const container = document.getElementById('cfg-dash-user-comments');
        const pager = document.getElementById('cfg-dash-user-comments-pagination');
        if (!container) return;
        const rows = filteredUserCommentRows();
        userCommentsVisibleRows = rows;
        if (rows.length === 0) {
            container.innerHTML = '<p class="dashboard-table-empty">Nenhum comentário nos cursos selecionados.</p>';
            if (pager) pager.innerHTML = '';
            return;
        }
        const totalPages = Math.max(1, Math.ceil(rows.length / USER_COMMENTS_PAGE_SIZE));
        userCommentsPage = Math.min(Math.max(1, userCommentsPage), totalPages);
        const start = (userCommentsPage - 1) * USER_COMMENTS_PAGE_SIZE;
        const pageRows = rows.slice(start, start + USER_COMMENTS_PAGE_SIZE);

        container.innerHTML = `<div class="comment-cards">${pageRows.map((r, i) => {
            const n = Number(r.rating) || 0;
            const ratingClass = n >= 4 ? 'rating-high' : n === 3 ? 'rating-mid' : 'rating-low';
            const dateLabel = r.submittedAt ? new Date(r.submittedAt).toLocaleDateString('pt-BR') : '—';
            return `
            <div class="comment-card ${ratingClass} is-clickable" data-row-i="${start + i}" title="Ver detalhes da avaliação">
                <div class="comment-card-head">
                    <span class="comment-card-head-left">
                        <span class="comment-card-name"><i class="fas fa-book"></i> ${escapeHtml(userCommentCourseOf(r))}</span>
                        <span class="comment-card-unit"><i class="fas fa-calendar-day"></i> ${dateLabel}</span>
                    </span>
                    <span class="comment-card-rating">${scoreBadgeGradientHtml(r.score)}${starsHtml(r.rating)}</span>
                </div>
                <p class="comment-card-text ${r.comment ? '' : 'is-empty'}">${r.comment ? escapeHtml(r.comment) : 'Em branco'}</p>
                ${r.comment ? '<span class="comment-card-more" data-action="toggle-comment">Ver mais</span>' : ''}
            </div>`;
        }).join('')}</div>`;
        container.querySelectorAll('.comment-card-more').forEach(btn => {
            btn.addEventListener('click', (event) => {
                event.stopPropagation();
                const text = btn.previousElementSibling;
                const expanded = text.classList.toggle('is-expanded');
                btn.textContent = expanded ? 'Ver menos' : 'Ver mais';
            });
        });
        container.querySelectorAll('.comment-card.is-clickable').forEach(card => {
            card.addEventListener('click', () => {
                const row = userCommentsVisibleRows[Number(card.dataset.rowI)];
                if (row) openReviewModal(row);
            });
        });
        paintChartPager(pager, totalPages, userCommentsPage, (page) => { userCommentsPage = page; paintUserCommentsPage(); });
    }

    const userCommentsCourseChip = createMultiFilterChip('cfg-dash-user-comments-course-chip', 'cfg-dash-user-comments-course-list', () => {
        userCommentsPage = 1;
        paintUserCommentsPage();
    });

    document.getElementById('cfg-dash-user-comments-course-clear')?.addEventListener('click', (event) => {
        event.stopPropagation();
        userCommentsCourseChip.clear();
        userCommentsPage = 1;
        paintUserCommentsPage();
    });

    // ═══════════════════════════════════════════════════════════════════
    // Modo: por unidade
    // ═══════════════════════════════════════════════════════════════════
    // O painel já agrupava por unidade em vários lugares, mas sempre dentro
    // de UM curso ("Realização por Unidade", "Notas por Unidade"). Aqui a
    // pergunta se inverte: uma unidade, todos os cursos da categoria.
    //
    // A unidade vem SEMPRE do cadastro (`colab.unit`), nunca de `row.unit`:
    // a linha de histórico carrega a unidade da conta, que é vazia para
    // estágio livre e para quem não tem conta, e pode estar defasada em
    // relação ao cadastro. As linhas são casadas por personKeys, o mesmo
    // critério do público-alvo dos cursos.

    const UNIT_NO_UNIT = 'Sem unidade';

    function unitKeyOf(colab) { return (colab?.unit || '').trim() || UNIT_NO_UNIT; }

    // Mesmo recorte de `courseAudience`: quem saiu da planilha ou foi
    // desativado não entra em denominador nenhum.
    function activeColaboradorEntries() {
        return Object.keys(allColaboradores)
            .map(id => ({ id, ...allColaboradores[id] }))
            .filter(colab => colab.fullName)
            .filter(colab => colab.active !== false && colab.inSheet !== false);
    }

    function unitsFromColaboradores() {
        const byUnit = new Map();
        activeColaboradorEntries().forEach(colab => {
            const key = unitKeyOf(colab);
            if (!byUnit.has(key)) byUnit.set(key, []);
            byUnit.get(key).push(colab);
        });
        // "Sem unidade" sempre por último: é um balde de sobra, não uma
        // unidade de verdade, e no meio da lista alfabética parecia uma.
        return [...byUnit.entries()]
            .map(([unit, colaboradores]) => ({ unit, colaboradores }))
            .sort((a, b) => {
                if (a.unit === UNIT_NO_UNIT) return 1;
                if (b.unit === UNIT_NO_UNIT) return -1;
                return a.unit.localeCompare(b.unit, 'pt-BR');
            });
    }

    function colaboradoresOfUnit(unitKey) {
        return activeColaboradorEntries().filter(colab => unitKeyOf(colab) === unitKey);
    }

    // Índice chave-de-pessoa → linhas, da categoria atual.
    // `flattenColaboradorResults` varre `historyRows` inteiro para cada
    // pessoa; numa unidade de 40 colaboradores isso seriam 40 varreduras do
    // histórico a cada repintura. O índice paga uma varredura só.
    function buildPersonRowIndex() {
        const slug = currentSlug();
        const index = new Map();
        historyRows.forEach(row => {
            if (row.slug !== slug) return;
            personKeysOfRow(row).forEach(key => {
                if (!index.has(key)) index.set(key, []);
                index.get(key).push(row);
            });
        });
        return index;
    }

    // Linhas de todos os colaboradores da unidade, cada uma marcada com quem
    // a gerou (`unitPersonName`) — os gráficos "por colaborador" e a tabela
    // de histórico da unidade precisam desse nome, e `row.fullName` nem
    // sempre existe nas linhas importadas.
    // A mesma linha pode casar por userId E por nome, então a deduplicação é
    // por identidade do objeto original.
    function flattenUnitResults(colaboradores, rowIndexArg) {
        const rowIndex = rowIndexArg || buildPersonRowIndex();
        const seen = new Set();
        const rows = [];
        colaboradores.forEach(colab => {
            personKeysOfColaborador(colab).forEach(key => {
                (rowIndex.get(key) || []).forEach(row => {
                    if (seen.has(row)) return;
                    seen.add(row);
                    rows.push({ ...row, unitPersonName: colab.fullName, unitPersonId: colab.id });
                });
            });
        });
        return rows.sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0));
    }

    // Par (pessoa, curso). Na unidade, "um curso concluído" é uma pessoa
    // tendo concluído um curso: agrupar só por curso juntaria 20 pessoas
    // num item só e a pizza de prazo contaria 1 onde há 20.
    function personCourseKey(row) {
        return `${row.unitPersonId || personKeysOfRow(row)[0] || 'sem-pessoa'}::${rowCourseKey(row)}`;
    }

    function lastAttemptByPersonCourse(rows) {
        const byPair = new Map();
        rows.forEach(row => {
            const key = personCourseKey(row);
            if (!byPair.has(key)) byPair.set(key, []);
            byPair.get(key).push(row);
        });
        return [...byPair.values()].map(pairRows =>
            pairRows.slice().sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0)).pop()
        );
    }

    // Mesma conta de `attemptsByCourse`, por par (pessoa, curso): quantas
    // tentativas aquela pessoa precisou naquele curso até aprovar.
    function attemptsByPersonCourse(rows) {
        const byPair = new Map();
        rows.forEach(row => {
            const key = personCourseKey(row);
            if (!byPair.has(key)) byPair.set(key, []);
            byPair.get(key).push(row);
        });
        return [...byPair.entries()].map(([key, pairRows]) => {
            const sorted = pairRows.slice().sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0));
            const approvedIndex = sorted.findIndex(r => r.approved);
            const last = sorted[sorted.length - 1];
            return {
                key,
                personName: last.unitPersonName || last.fullName || 'Sem nome',
                name: rowCourseLabel(last),
                approved: approvedIndex !== -1,
                attempts: approvedIndex !== -1 ? approvedIndex + 1 : sorted.length,
                // Mesmos campos de attemptsByCourse, para a aba de gráficos
                // da planilha (compartilhada) classificar os dois do mesmo jeito.
                firstTry: approvedIndex === 0,
                retried: approvedIndex > 0
            };
        });
    }

    function unitCardStats(colaboradores, rowIndex) {
        const rows = flattenUnitResults(colaboradores, rowIndex);
        const scores = rows.map(r => Number(r.score)).filter(Number.isFinite);
        const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
        const lateKeys = new Set();
        lastAttemptByPersonCourse(rows).forEach(r => { if (!isOnTime(r.deadlineStatus)) lateKeys.add(personCourseKey(r)); });
        return { rows, avg, attempts: rows.length, people: colaboradores.length, late: lateKeys.size };
    }

    // Pendências da unidade, por curso: quantos do público-alvo daquela
    // unidade ainda não aprovaram, e quanto do conteúdo já assistiram.
    // Inverte a lógica de `renderUserPendingChart` (que varre os temas de uma
    // pessoa) para varrer as pessoas de cada tema — é assim que
    // `renderCourseUnitCompletionChart` já calcula a taxa por unidade, então
    // os dois números batem.
    function unitPendingData(colaboradores, rows) {
        const slug = currentSlug();
        if (AUDIENCE_EXEMPT_SLUGS.includes(slug)) return [];
        const courseFilter = unitChartCourseChip.getValues();
        const unitIds = new Set(colaboradores.map(c => c.id));
        const doneKeys = new Set();
        rows.filter(r => r.approved).forEach(r => {
            const person = r.unitPersonId || personKeysOfRow(r)[0];
            if (!person) return;
            if (r.slug && r.subjectId && r.themeId) doneKeys.add(`${person}::${r.slug}_${r.subjectId}_${r.themeId}`);
            doneKeys.add(`${person}::${normalizeName(`${r.subject || ''}|${r.theme || ''}`)}`);
        });

        const trainingData = allTrainingData[slug] || {};
        const pending = [];
        Object.keys(trainingData).forEach(subjectId => {
            const subject = trainingData[subjectId] || {};
            Object.keys(subject.themes || {}).forEach(themeId => {
                const theme = subject.themes[themeId];
                if (!theme || theme.active === false) return;
                // Com cursos marcados no chip, as pendências mostram só
                // esses: pendência de curso que o gestor tirou do recorte não
                // é assunto do relatório que ele pediu.
                if (!themeMatchesCourseSelection(courseFilter, theme, themeId, subject.name)) return;
                const audience = courseAudience(theme).filter(colab => unitIds.has(colab.id));
                if (audience.length === 0) return;
                const missing = audience.filter(colab => {
                    if (doneKeys.has(`${colab.id}::${slug}_${subjectId}_${themeId}`)) return false;
                    if (doneKeys.has(`${colab.id}::${normalizeName(`${subject.name || ''}|${theme.name || ''}`)}`)) return false;
                    return true;
                });
                if (missing.length === 0) return;
                // Quem falta, com o progresso individual: no relatório da
                // unidade a média do curso não basta — o gestor precisa saber
                // a quem cobrar. Ordem: quem está mais perto de concluir
                // primeiro, que é onde a cobrança rende mais.
                const people = missing
                    .map(colab => ({
                        id: colab.id,
                        name: colab.fullName || 'Sem nome',
                        role: colab.role || '',
                        pct: progressPctFor(colab, slug, subjectId, themeId)
                    }))
                    .sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name, 'pt-BR'));
                const pcts = people.map(p => p.pct);
                pending.push({
                    name: theme.name || themeId,
                    subject: subject.name || subjectId,
                    total: audience.length,
                    missing: missing.length,
                    done: audience.length - missing.length,
                    pct: Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length),
                    missingPct: Math.round((missing.length / audience.length) * 100),
                    people
                });
            });
        });
        return pending.sort((a, b) => b.missing - a.missing || a.name.localeCompare(b.name, 'pt-BR'));
    }

    // Curva de conclusão por curso: % da audiência da unidade que já tinha
    // concluído até cada dia. Mesma régua do gráfico "Taxa de Conclusão" do
    // modal de curso — dia 1 é o início do prazo quando o curso tem prazo
    // definido (senão o gráfico pularia direto para a primeira conclusão e
    // esconderia a demora da adesão); sem prazo, o 1º dia com conclusão.
    //
    // O eixo vai até o 10º dia; o 11º é o balde de tudo que veio depois.
    const CURVE_MAX_DAY = 10;
    const CURVE_OVERFLOW_DAY = CURVE_MAX_DAY + 1;
    const CURVE_OVERFLOW_LABEL = '>10 dias';

    function curveDayLabel(day) {
        return day > CURVE_MAX_DAY ? CURVE_OVERFLOW_LABEL : `${day}º dia`;
    }

    function unitCompletionCurves(colaboradores, rows) {
        const slug = currentSlug();
        const unitIds = new Set(colaboradores.map(c => c.id));
        const trainingData = allTrainingData[slug] || {};
        const byCourse = new Map();
        rows.filter(r => r.approved && r.submittedAt).forEach(row => {
            const key = rowCourseKey(row);
            const person = row.unitPersonId || personKeysOfRow(row)[0];
            if (!person) return;
            if (!byCourse.has(key)) byCourse.set(key, new Map());
            const byPerson = byCourse.get(key);
            // Primeira aprovação da pessoa: é ela que marca o dia em que a
            // pessoa saiu da lista de quem falta.
            if (!byPerson.has(person) || row.submittedAt < byPerson.get(person).submittedAt) byPerson.set(person, row);
        });

        const curves = [];
        Object.keys(trainingData).forEach(subjectId => {
            const subject = trainingData[subjectId] || {};
            Object.keys(subject.themes || {}).forEach(themeId => {
                const theme = subject.themes[themeId];
                if (!theme || theme.active === false) return;
                const audience = AUDIENCE_EXEMPT_SLUGS.includes(slug)
                    ? []
                    : courseAudience(theme).filter(colab => unitIds.has(colab.id));
                const key = `${slug}_${subjectId}_${themeId}`;
                const byPerson = byCourse.get(key) || byCourse.get(normalizeName(`${subject.name || ''}|${theme.name || ''}`));
                if (!byPerson || byPerson.size === 0) return;
                // Mesma régua de unitCourseSummaries: a curva é a adesão do
                // público-alvo. Contar quem concluiu fora dele levaria a
                // curva acima de 100% — antes o Math.min abaixo escondia isso
                // e a folha ficava com "140% de conclusão" ao lado de uma
                // curva empacada em 100%.
                const audienceIds = new Set(audience.map(colab => colab.id));
                const counted = audienceIds.size
                    ? [...byPerson.values()].filter(r => audienceIds.has(r.unitPersonId))
                    : [...byPerson.values()];
                if (counted.length === 0) return;
                const total = audienceIds.size || byPerson.size;

                const byDay = new Map();
                counted.forEach(r => {
                    const day = new Date(r.submittedAt).toLocaleDateString('pt-BR');
                    byDay.set(day, (byDay.get(day) || 0) + 1);
                });
                const dayKeys = [...byDay.keys()].sort((a, b) => parseBrDate(a) - parseBrDate(b));
                const deadline = theme.deadline;
                const firstDay = (deadline?.mode === 'prazo' && deadline.startAt)
                    ? parseBrDate(new Date(deadline.startAt).toLocaleDateString('pt-BR'))
                    : parseBrDate(dayKeys[0]);

                let running = 0;
                const raw = dayKeys.map(day => {
                    running += byDay.get(day);
                    return {
                        day: Math.max(1, Math.round((parseBrDate(day) - firstDay) / 86400000) + 1),
                        pct: Math.min(100, Math.round((running / total) * 100)),
                        count: running,
                        date: day
                    };
                });
                // Tudo que passa do 10º dia cai num balde só. Sem isso, um
                // único curso concluído no 230º dia esticava o eixo por
                // centenas de colunas vazias e achatava a parte que importa,
                // que é a adesão dos primeiros dias.
                const points = [];
                raw.forEach(point => {
                    const day = Math.min(point.day, CURVE_OVERFLOW_DAY);
                    const last = points[points.length - 1];
                    // A série é acumulada: colapsar o balde é ficar com o
                    // último valor dele, não somar de novo.
                    if (last && last.day === day) points[points.length - 1] = { ...point, day };
                    else points.push({ ...point, day });
                });
                curves.push({ name: theme.name || themeId, subject: subject.name || subjectId, total, points });
            });
        });
        return curves.sort((a, b) => b.points.length - a.points.length || a.name.localeCompare(b.name, 'pt-BR'));
    }

    // ─── Cards de unidade ───
    const unitCardsBox = document.getElementById('cfg-dash-unit-cards');
    const unitSearchInput = document.getElementById('cfg-dash-unit-search');
    let unitSearchTerm = '';
    let selectedUnitKey = null;

    unitSearchInput?.addEventListener('input', () => {
        unitSearchTerm = unitSearchInput.value;
        renderUnitCards();
    });

    function buildUnitCard(unit, colaboradores, rowIndex) {
        const stats = unitCardStats(colaboradores, rowIndex);
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'dash-unit-card';
        if (unit === selectedUnitKey) card.classList.add('is-selected');
        card.innerHTML = `
            <span class="dash-unit-card-icon"><i class="fas fa-building"></i></span>
            <div class="dash-unit-card-body">
                <h3>${escapeHtml(unit)}</h3>
                <div class="dash-unit-card-stats">
                    <span><i class="fas fa-users"></i> ${stats.people} ${stats.people === 1 ? 'colaborador' : 'colaboradores'}</span>
                    <span><i class="fas fa-clipboard-list"></i> ${stats.attempts} ${stats.attempts === 1 ? 'prova' : 'provas'}</span>
                    <span><i class="fas fa-star"></i> ${stats.avg === null ? '—' : 'Média ' + formatScore(stats.avg)}</span>
                    ${stats.late > 0 ? `<span class="is-warn"><i class="fas fa-triangle-exclamation"></i> ${stats.late} com atraso</span>` : ''}
                </div>
            </div>`;
        card.onclick = () => {
            selectedUnitKey = unit;
            unitCardsBox.querySelectorAll('.dash-unit-card').forEach(c => c.classList.remove('is-selected'));
            card.classList.add('is-selected');
            openUnitModal(unit);
        };
        return card;
    }

    function renderUnitCards() {
        if (!unitCardsBox) return;
        const empty = document.getElementById('cfg-dash-empty');
        if (dashMode !== 'unit') { unitCardsBox.style.display = 'none'; return; }

        if (!baseDataLoaded) {
            unitCardsBox.style.display = 'block';
            if (empty) empty.style.display = 'none';
            unitCardsBox.innerHTML = pendingCardsHtml();
            return;
        }

        const term = normalizeName(unitSearchTerm);
        const units = unitsFromColaboradores().filter(u => !term || normalizeName(u.unit).includes(term));
        const countEl = document.getElementById('cfg-dash-unit-count');
        if (countEl) countEl.textContent = units.length ? `${units.length} ${units.length === 1 ? 'unidade' : 'unidades'}` : '';

        unitCardsBox.style.display = units.length ? 'grid' : 'block';
        if (empty) empty.style.display = 'none';
        if (units.length === 0) {
            unitCardsBox.innerHTML = '<p class="dashboard-table-empty">Nenhuma unidade encontrada.</p>';
            return;
        }
        // Um índice só para todos os cards: sem ele cada card varreria o
        // histórico inteiro por colaborador.
        const rowIndex = buildPersonRowIndex();
        unitCardsBox.innerHTML = '';
        units.forEach(({ unit, colaboradores }) => unitCardsBox.appendChild(buildUnitCard(unit, colaboradores, rowIndex)));
    }

    // ─── Modal da unidade ───
    const unitModal = document.getElementById('cfg-dash-unit-modal');
    const unitModalTitle = document.getElementById('cfg-dash-unit-modal-title');
    const unitModalClose = document.getElementById('cfg-dash-unit-modal-close');
    const unitHeroThumb = document.getElementById('cfg-dash-unit-hero-thumb');
    const unitHeroTags = document.getElementById('cfg-dash-unit-hero-tags');
    const unitHeroStats = document.getElementById('cfg-dash-unit-hero-stats');

    let unitChartKeyCache = null;
    let unitChartColabsCache = [];
    let unitChartRowsCache = [];
    let unitPendingDataCache = [];

    // Mesma regra do modal do colaborador: zera o período ao fechar, para
    // que um repaint ao vivo não derrube o recorte aplicado.
    function closeUnitModal() {
        if (unitModal) unitModal.style.display = 'none';
        unitChartRangeChip.reset();
        unitChartRoleChip.clear();
        unitChartCourseChip.clear();
    }

    function openUnitModal(unitKey) {
        if (!unitModal) return;
        unitModalTitle.textContent = unitKey;
        if (unitHeroThumb) unitHeroThumb.innerHTML = '<i class="fas fa-building"></i>';
        unitModal.querySelectorAll('.dash-course-modal-tabs .tab-btn').forEach((btn, i) => btn.classList.toggle('active', i === 0));
        unitModal.querySelectorAll('.dash-course-modal-body .tab-content').forEach((tab, i) => tab.classList.toggle('active', i === 0));
        unitModal.style.display = 'flex';
        renderUnitDashboard(unitKey);
    }

    unitModal?.querySelectorAll('.dash-course-modal-tabs .tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            unitModal.querySelectorAll('.dash-course-modal-tabs .tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const target = btn.dataset.dashUnitTab;
            unitModal.querySelectorAll('.dash-course-modal-body .tab-content').forEach(tab => {
                tab.classList.toggle('active', tab.id === `cfg-dash-unit-tab-${target}`);
            });
            if (target === 'charts') resizeChartsIn(unitModal);
        });
    });
    unitModalClose?.addEventListener('click', closeUnitModal);
    unitModal?.addEventListener('click', (event) => { if (event.target === unitModal) closeUnitModal(); });
    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || unitModal?.style.display !== 'flex') return;
        if (isAnyDashboardChildModalOpen()) return;
        closeUnitModal();
    });

    function repaintUnitCharts() {
        if (!unitChartKeyCache) return;
        unitChartCourseChip.setOptions(unitCourseOptions(unitChartColabsCache, unitChartRowsCache));
        renderUnitCharts(unitChartColabsCache, unitChartRowsCache);
        renderUnitHero(unitChartColabsCache, unitChartRowsCache);
    }
    const unitChartYearChip = createYearFilterChip('cfg-dash-unit-year-chip', 'cfg-dash-unit-year-list', repaintUnitCharts);
    const unitChartRangeChip = createMonthRangeChip('cfg-dash-unit-range-chip', {
        start: 'cfg-dash-unit-range-start',
        end: 'cfg-dash-unit-range-end',
        apply: 'cfg-dash-unit-range-apply',
        clear: 'cfg-dash-unit-range-clear'
    }, repaintUnitCharts);
    const unitChartRoleChip = createMultiFilterChip(
        'cfg-dash-unit-role-chip', 'cfg-dash-unit-role-list', repaintUnitCharts, null, 'cfg-dash-unit-role-search');
    const unitChartCourseChip = createMultiFilterChip(
        'cfg-dash-unit-course-chip', 'cfg-dash-unit-course-list', repaintUnitCharts, null, 'cfg-dash-unit-course-search');

    // Funções presentes NA unidade, não o catálogo inteiro: oferecer cargos
    // que ninguém daquela unidade exerce só produziria recortes vazios.
    function unitRoleOptions(colaboradores) {
        return sortedRoles(colaboradores.map(colab => colab.role));
    }

    // Recorte por função na unidade: mantém as linhas de quem exerce alguma
    // das funções marcadas (união — marcar dois cargos mostra os dois times
    // juntos, que é como um gestor compara equipes).
    function filterUnitRowsByRole(rows, colaboradores) {
        const wanted = selectedRoleKeys(unitChartRoleChip);
        if (!wanted.size) return rows;
        const ids = new Set(colaboradores.filter(c => wanted.has(normalizeName(c.role || ''))).map(c => c.id));
        return rows.filter(row => ids.has(row.unitPersonId));
    }

    function filterUnitRowsByDate(rows) {
        return filterRowsByMonthRange(filterRowsByYear(rows, unitChartYearChip.getValue()), unitChartRangeChip.getRange());
    }

    // Data → função → curso, na mesma ordem em todo lugar que desenha a
    // unidade (gráficos, hero, PDF, planilha), para os números não
    // divergirem entre o que a tela mostra e o que o relatório exporta.
    function filterUnitRows(rows, colaboradores) {
        return filterRowsByCourseChip(unitRowsBeforeCourse(rows, colaboradores), unitChartCourseChip);
    }

    // Recorte anterior ao chip de curso: alimenta as opções do popover de
    // cursos, que só deve listar o que sobrou de data e função.
    function unitRowsBeforeCourse(rows, colaboradores) {
        return filterUnitRowsByRole(filterUnitRowsByDate(rows), colaboradores || unitChartColabsCache);
    }

    // Cursos do recorte mais os que têm público-alvo entre os colaboradores
    // da unidade que sobram no chip de função, mesmo sem nenhuma aprovação.
    function unitCourseOptions(colaboradores, rows) {
        const ids = new Set(filterUnitColabsByRole(colaboradores).map(c => c.id));
        const extra = ids.size
            ? audienceCourseLabels(theme => courseAudience(theme).some(colab => ids.has(colab.id)))
            : [];
        return courseOptionsOf(unitRowsBeforeCourse(rows, colaboradores), extra);
    }

    // Colaboradores que sobram no recorte de função — é o denominador de
    // "31 colaboradores" no hero e do público-alvo nos cursos.
    function filterUnitColabsByRole(colaboradores) {
        const wanted = selectedRoleKeys(unitChartRoleChip);
        if (!wanted.size) return colaboradores;
        return colaboradores.filter(c => wanted.has(normalizeName(c.role || '')));
    }

    function unitReportPeriodLabel() {
        const year = unitChartYearChip.getValue();
        const range = unitChartRangeChip.getRange();
        const startIndex = monthIndexFromInput(range?.start);
        const endIndex = monthIndexFromInput(range?.end);
        const parts = [];
        if (startIndex !== null && endIndex !== null) parts.push(`${monthLabelOf(startIndex)} a ${monthLabelOf(endIndex)}`);
        else if (startIndex !== null) parts.push(`a partir de ${monthLabelOf(startIndex)}`);
        else if (endIndex !== null) parts.push(`até ${monthLabelOf(endIndex)}`);
        if (year) parts.push(`ano ${year}`);
        return parts.length ? parts.join(' • ') : 'Todo o histórico';
    }

    function unitReportRoleLabel() {
        const label = roleSelectionLabel(unitChartRoleChip);
        return label ? `Somente ${label}` : 'Todas as funções';
    }

    function unitReportCourseLabel() {
        const label = courseSelectionLabel(unitChartCourseChip);
        return label ? `Somente ${label}` : 'Todos os cursos';
    }

    // Cabeçalho do modal: os mesmos números que a aba Gráficos mostra, no
    // mesmo recorte. Sem isso o topo dizia "133 cursos concluídos • Média
    // 9,1" (histórico inteiro) enquanto o gráfico logo abaixo, já recortado,
    // dizia "53 notas • Média 9,6" — dois totais diferentes na mesma tela.
    function renderUnitHero(allColabs, allRows) {
        const colaboradores = filterUnitColabsByRole(allColabs);
        const rows = filterUnitRows(allRows, allColabs);
        const pairs = lastAttemptByPersonCourse(rows);
        const late = pairs.filter(r => !isOnTime(r.deadlineStatus)).length;
        const scores = rows.map(r => Number(r.score)).filter(Number.isFinite);
        const roleFilter = roleSelectionLabel(unitChartRoleChip);
        const courseFilter = courseSelectionLabel(unitChartCourseChip);
        if (unitHeroTags) {
            unitHeroTags.innerHTML = `<span class="dash-course-subject-tag"><i class="fas fa-layer-group"></i> ${escapeHtml(U.currentCategoryName || CATEGORY_LABELS[currentSlug()] || currentSlug())}</span>`
                + `<span class="dash-course-subject-tag is-period"><i class="fas fa-calendar-week"></i> ${escapeHtml(unitReportPeriodLabel())}</span>`
                + (roleFilter ? `<span class="dash-course-subject-tag is-role"><i class="fas fa-briefcase"></i> ${escapeHtml(roleFilter)}</span>` : '')
                + (courseFilter ? `<span class="dash-course-subject-tag is-role"><i class="fas fa-graduation-cap"></i> ${escapeHtml(courseFilter)}</span>` : '');
        }
        if (unitHeroStats) {
            unitHeroStats.innerHTML = `
                <span class="hero-stat"><i class="fas fa-users"></i> ${colaboradores.length} ${colaboradores.length === 1 ? 'colaborador' : 'colaboradores'}</span>
                <span class="hero-stat"><i class="fas fa-clipboard-check"></i> ${pairs.length} ${pairs.length === 1 ? 'curso concluído' : 'cursos concluídos'}</span>
                <span class="hero-stat"><i class="fas fa-star"></i> ${scores.length ? 'Média ' + formatScore(scores.reduce((a, b) => a + b, 0) / scores.length) : 'Sem notas'}</span>
                ${late > 0 ? `<span class="hero-stat is-warn"><i class="fas fa-triangle-exclamation"></i> ${late} fora do prazo</span>` : ''}`;
        }
    }

    function renderUnitDashboard(unitKey) {
        const colaboradores = colaboradoresOfUnit(unitKey);
        const rows = flattenUnitResults(colaboradores);
        unitChartKeyCache = unitKey;
        unitChartColabsCache = colaboradores;
        unitChartRowsCache = rows;
        unitChartYearChip.setYears(yearsFromRows(rows));
        // Sem reset aqui: ver closeUnitModal().
        unitChartRangeChip.setBounds(rows);
        unitChartRoleChip.setOptions(unitRoleOptions(colaboradores));
        unitChartCourseChip.setOptions(unitCourseOptions(colaboradores, rows));
        renderUnitCharts(colaboradores, rows);

        renderUnitHero(colaboradores, rows);
        renderUnitPeopleTable(colaboradores, rows);
        renderUnitHistoryTable(rows);
        renderUnitCommentsTable(rows);
    }

    function renderUnitPeopleTable(colaboradores, rows) {
        const container = document.getElementById('cfg-dash-unit-people');
        const countEl = document.getElementById('cfg-dash-unit-tabcount-people');
        if (countEl) countEl.textContent = String(colaboradores.length);
        if (!container) return;
        if (colaboradores.length === 0) {
            container.innerHTML = emptyStateHtml('fa-users', 'Nenhum colaborador ativo nesta unidade.');
            return;
        }
        const byPerson = new Map();
        rows.forEach(row => {
            const id = row.unitPersonId;
            if (!byPerson.has(id)) byPerson.set(id, []);
            byPerson.get(id).push(row);
        });
        const people = colaboradores.map(colab => {
            const personRows = byPerson.get(colab.id) || [];
            const scores = personRows.map(r => Number(r.score)).filter(Number.isFinite);
            const pairs = lastAttemptByPersonCourse(personRows);
            return {
                colab,
                courses: pairs.length,
                attempts: personRows.length,
                avg: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
                late: pairs.filter(r => !isOnTime(r.deadlineStatus)).length
            };
        }).sort((a, b) => b.courses - a.courses || a.colab.fullName.localeCompare(b.colab.fullName, 'pt-BR'));

        container.innerHTML = `<table class="is-sticky dash-cards">
            <thead><tr><th>Colaborador</th><th>Função</th><th>Cursos</th><th>Provas</th><th>Média</th><th>Fora do prazo</th></tr></thead>
            <tbody>${people.map((p, i) => `<tr style="--row-i:${i}">
                <td data-label="Colaborador">${escapeHtml(p.colab.fullName)}</td>
                <td data-label="Função">${escapeHtml(p.colab.role || '—')}</td>
                <td data-label="Cursos">${p.courses}</td>
                <td data-label="Provas">${p.attempts}</td>
                <td data-label="Média">${p.avg === null ? '—' : scoreBadgeHtml(p.avg)}</td>
                <td data-label="Fora do prazo">${p.late > 0 ? `<span class="conclusion-situation is-bad"><i class="fas fa-triangle-exclamation"></i> ${p.late}</span>` : '—'}</td>
            </tr>`).join('')}</tbody>
        </table>`;
    }

    const UNIT_HISTORY_PAGE_SIZE = 25;
    let unitHistoryRowsCache = [];
    let unitHistoryPage = 1;

    function renderUnitHistoryTable(rows) {
        unitHistoryRowsCache = rows.slice().sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
        unitHistoryPage = 1;
        const countEl = document.getElementById('cfg-dash-unit-tabcount-history');
        if (countEl) countEl.textContent = String(rows.length);
        paintUnitHistoryPage();
    }

    // Paginada, ao contrário da tabela do colaborador: a unidade soma dezenas
    // de pessoas e a tabela inteira de uma vez travava a rolagem do modal.
    function paintUnitHistoryPage() {
        const container = document.getElementById('cfg-dash-unit-history');
        const pager = document.getElementById('cfg-dash-unit-history-pagination');
        if (!container) return;
        if (unitHistoryRowsCache.length === 0) {
            container.innerHTML = emptyStateHtml('fa-clipboard-list', 'Nenhum curso realizado nesta unidade ainda.');
            if (pager) pager.innerHTML = '';
            return;
        }
        const totalPages = Math.max(1, Math.ceil(unitHistoryRowsCache.length / UNIT_HISTORY_PAGE_SIZE));
        unitHistoryPage = Math.min(Math.max(1, unitHistoryPage), totalPages);
        const start = (unitHistoryPage - 1) * UNIT_HISTORY_PAGE_SIZE;
        const pageRows = unitHistoryRowsCache.slice(start, start + UNIT_HISTORY_PAGE_SIZE);
        container.innerHTML = `<table class="is-sticky dash-cards">
            <thead><tr><th>Data</th><th>Colaborador</th><th>Curso</th><th>Nota</th><th>Tempo</th><th>Prazo</th><th>Situação</th></tr></thead>
            <tbody>${pageRows.map((r, i) => {
                const dateLabel = r.submittedAt ? new Date(r.submittedAt).toLocaleString('pt-BR') : '—';
                const situationOk = !!r.approved;
                return `<tr style="--row-i:${i}">
                    <td data-label="Data/Hora">${dateLabel}</td>
                    <td data-label="Colaborador">${escapeHtml(r.unitPersonName || r.fullName || '—')}</td>
                    <td data-label="Curso">${escapeHtml(rowCourseLabel(r))}</td>
                    <td data-label="Nota">${scoreBadgeHtml(r.score)}</td>
                    <td data-label="Tempo">${formatDuration(r.durationSeconds)}</td>
                    <td data-label="Prazo">${deadlineBadgeHtml(r.deadlineStatus)}</td>
                    <td data-label="Situação"><span class="conclusion-situation ${situationOk ? 'is-ok' : 'is-bad'}"><i class="fas ${situationOk ? 'fa-circle-check' : 'fa-circle-xmark'}"></i> ${situationOk ? 'Aprovado' : 'Reprovado'}</span></td>
                </tr>`;
            }).join('')}</tbody>
        </table>`;
        paintChartPager(pager, totalPages, unitHistoryPage, (page) => { unitHistoryPage = page; paintUnitHistoryPage(); });
    }

    // ─── Comentários da unidade ───
    const UNIT_COMMENTS_PAGE_SIZE = 6;
    let unitCommentsRowsCache = [];
    let unitCommentsVisibleRows = [];
    let unitCommentsPage = 1;

    function filteredUnitCommentRows() {
        const courses = unitCommentsCourseChip ? unitCommentsCourseChip.getValues() : null;
        if (!courses || courses.size === 0) return unitCommentsRowsCache;
        return unitCommentsRowsCache.filter(r => courses.has(rowCourseLabel(r)));
    }

    function renderUnitCommentsTable(rows) {
        const container = document.getElementById('cfg-dash-unit-comments');
        const pager = document.getElementById('cfg-dash-unit-comments-pagination');
        const countEl = document.getElementById('cfg-dash-unit-tabcount-info');
        unitCommentsRowsCache = rows.filter(r => r.comment || (Number(r.rating) || 0) <= 3)
            .sort((a, b) => (Number(a.rating) || 0) - (Number(b.rating) || 0));
        unitCommentsPage = 1;
        if (countEl) countEl.textContent = String(unitCommentsRowsCache.length);
        unitCommentsCourseChip?.setOptions([...new Set(unitCommentsRowsCache.map(rowCourseLabel))]
            .sort((a, b) => a.localeCompare(b, 'pt-BR')));
        if (!container) return;
        if (unitCommentsRowsCache.length === 0) {
            unitCommentsVisibleRows = [];
            container.innerHTML = '<p class="dashboard-table-empty">Nenhum comentário registrado nesta unidade.</p>';
            if (pager) pager.innerHTML = '';
            return;
        }
        paintUnitCommentsPage();
    }

    function paintUnitCommentsPage() {
        const container = document.getElementById('cfg-dash-unit-comments');
        const pager = document.getElementById('cfg-dash-unit-comments-pagination');
        if (!container) return;
        const rows = filteredUnitCommentRows();
        unitCommentsVisibleRows = rows;
        if (rows.length === 0) {
            container.innerHTML = '<p class="dashboard-table-empty">Nenhum comentário nos cursos selecionados.</p>';
            if (pager) pager.innerHTML = '';
            return;
        }
        const totalPages = Math.max(1, Math.ceil(rows.length / UNIT_COMMENTS_PAGE_SIZE));
        unitCommentsPage = Math.min(Math.max(1, unitCommentsPage), totalPages);
        const start = (unitCommentsPage - 1) * UNIT_COMMENTS_PAGE_SIZE;
        container.innerHTML = `<div class="comment-cards">${rows.slice(start, start + UNIT_COMMENTS_PAGE_SIZE).map((r, i) => {
            const n = Number(r.rating) || 0;
            const ratingClass = n >= 4 ? 'rating-high' : n === 3 ? 'rating-mid' : 'rating-low';
            const dateLabel = r.submittedAt ? new Date(r.submittedAt).toLocaleDateString('pt-BR') : '—';
            return `
            <div class="comment-card ${ratingClass} is-clickable" data-row-i="${start + i}" title="Ver detalhes da avaliação">
                <div class="comment-card-head">
                    <span class="comment-card-head-left">
                        <span class="comment-card-name"><i class="fas fa-user"></i> ${escapeHtml(r.unitPersonName || r.fullName || '—')}</span>
                        <span class="comment-card-unit"><i class="fas fa-book"></i> ${escapeHtml(rowCourseLabel(r))}</span>
                        <span class="comment-card-unit"><i class="fas fa-calendar-day"></i> ${dateLabel}</span>
                    </span>
                    <span class="comment-card-rating">${scoreBadgeGradientHtml(r.score)}${starsHtml(r.rating)}</span>
                </div>
                <p class="comment-card-text ${r.comment ? '' : 'is-empty'}">${r.comment ? escapeHtml(r.comment) : 'Em branco'}</p>
                ${r.comment ? '<span class="comment-card-more" data-action="toggle-comment">Ver mais</span>' : ''}
            </div>`;
        }).join('')}</div>`;
        container.querySelectorAll('.comment-card-more').forEach(btn => {
            btn.addEventListener('click', (event) => {
                event.stopPropagation();
                const text = btn.previousElementSibling;
                const expanded = text.classList.toggle('is-expanded');
                btn.textContent = expanded ? 'Ver menos' : 'Ver mais';
            });
        });
        container.querySelectorAll('.comment-card.is-clickable').forEach(card => {
            card.addEventListener('click', () => {
                const row = unitCommentsVisibleRows[Number(card.dataset.rowI)];
                if (row) openReviewModal(row);
            });
        });
        paintChartPager(pager, totalPages, unitCommentsPage, (page) => { unitCommentsPage = page; paintUnitCommentsPage(); });
    }

    const unitCommentsCourseChip = createMultiFilterChip('cfg-dash-unit-comments-course-chip', 'cfg-dash-unit-comments-course-list', () => {
        unitCommentsPage = 1;
        paintUnitCommentsPage();
    });

    document.getElementById('cfg-dash-unit-comments-course-clear')?.addEventListener('click', (event) => {
        event.stopPropagation();
        unitCommentsCourseChip.clear();
        unitCommentsPage = 1;
        paintUnitCommentsPage();
    });

    // ─── Gráficos da unidade ───
    // Espelham os do colaborador. Onde o gráfico do colaborador é "uma barra
    // por prova", aqui vira "uma barra por colaborador": com 40 pessoas, uma
    // barra por prova daria trezentas barras ilegíveis.

    const UNIT_PEOPLE_PAGE_SIZE = 8;
    const UNIT_COURSE_PAGE_SIZE = 7;
    const UNIT_CURVE_PAGE_SIZE = 5;
    const UNIT_TIME_PAGE_SIZE = 5;

    let unitScoresCache = [], unitScoresPage = 1;
    let unitRetriesCache = [], unitRetriesPage = 1;
    let unitPendingPage = 1;
    let unitCurveCache = [], unitCurvePage = 1;
    let unitEvalTimeCache = [], unitEvalTimePage = 1;
    let unitCompletionTimeCache = [], unitCompletionTimePage = 1;
    let unitSatisfactionMode = 'geral';
    let unitSatisfactionRowsCache = [], unitSatisfactionPage = 1;

    // Tempo por curso, visto pela unidade: a barra é a MÉDIA da unidade
    // naquele curso, e os riscos continuam sendo a média geral de quem fez o
    // curso e a meta cadastrada — mesma leitura do gráfico do colaborador,
    // um nível acima.
    function buildUnitTimeComparison(rows, durationOf) {
        const byCourse = new Map();
        lastAttemptByPersonCourse(rows).filter(r => r && r.approved).forEach(row => {
            const ms = durationOf(row);
            if (!Number.isFinite(ms) || ms <= 0) return;
            const key = rowCourseKey(row);
            if (!byCourse.has(key)) byCourse.set(key, { label: rowCourseLabel(row), sample: row, values: [] });
            byCourse.get(key).values.push(ms);
        });
        return [...byCourse.entries()].map(([key, item]) => {
            const sample = item.sample;
            const peerMs = lastAttemptByPerson(historyRows.filter(h => h.slug === sample.slug && rowCourseKey(h) === key))
                .filter(h => h && h.approved)
                .map(durationOf)
                .filter(ms => Number.isFinite(ms) && ms > 0);
            const theme = sample.slug && sample.subjectId && sample.themeId
                ? allTrainingData[sample.slug]?.[sample.subjectId]?.themes?.[sample.themeId]
                : null;
            return {
                label: item.label,
                userMs: mean(item.values),
                avgMs: peerMs.length ? mean(peerMs) : null,
                // `n` é quanta gente forma a média DO CURSO (é o que o
                // tooltip de paintUserTimeChart mostra); `unitCount` é quanta
                // gente da unidade forma a barra.
                n: peerMs.length,
                unitCount: item.values.length,
                expectedMs: expectedCompletionMsOf(theme)
            };
        }).sort((a, b) => b.userMs - a.userMs);
    }

    function renderUnitCharts(allColabs, allRows) {
        const colaboradores = filterUnitColabsByRole(allColabs);
        const rows = filterUnitRows(allRows, allColabs);
        const pairs = lastAttemptByPersonCourse(rows);

        renderUnitScoresChart(colaboradores, rows);
        renderUnitSatisfactionChart(rows);

        // Realização dos cursos — cada par (pessoa, curso) conta uma vez.
        const onTime = pairs.filter(r => isOnTime(r.deadlineStatus)).length;
        renderChart('unitDeadline', 'cfg-dash-unit-deadline-chart', {
            type: 'pie',
            data: {
                labels: ['No prazo', 'Fora do prazo'],
                datasets: [{ data: [onTime, pairs.length - onTime], backgroundColor: [CHART_COLORS.accent, CHART_COLORS.danger] }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: pieTooltipLabel } } }
            }
        });

        // Tentativas das avaliações — mesma pergunta do modal do colaborador,
        // só que por par (pessoa, curso).
        const attempts = attemptsByPersonCourse(rows);
        const firstTry = attempts.filter(a => a.approved && a.attempts === 1).length;
        const afterRetry = attempts.filter(a => a.approved && a.attempts > 1).length;
        const failing = attempts.filter(a => !a.approved).length;
        renderChart('unitApproval', 'cfg-dash-unit-approval-chart', {
            type: 'pie',
            data: {
                labels: ['Aprovado na 1ª', 'Aprovado após retentativa', 'Ainda reprovado'],
                datasets: [{ data: [firstTry, afterRetry, failing], backgroundColor: [CHART_COLORS.success, CHART_COLORS.warning, CHART_COLORS.danger] }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: pieTooltipLabel } } },
                ...drillChartHandlers(({ index }) => {
                    const wanted = [
                        (a) => a.approved && a.attempts === 1,
                        (a) => a.approved && a.attempts > 1,
                        (a) => !a.approved
                    ][index];
                    const keys = new Set(attempts.filter(wanted).map(a => a.key));
                    openDrillModal({
                        title: ['Aprovados na 1ª tentativa', 'Aprovados após retentativa', 'Ainda reprovados'][index],
                        subtitle: `${unitChartKeyCache} • ${unitReportPeriodLabel()}`,
                        icon: 'fa-clipboard-check',
                        rows: pairs.filter(r => keys.has(personCourseKey(r))),
                        extraOf: (r) => escapeHtml(r.unitPersonName || r.fullName || ''),
                        emptyMessage: 'Nenhum curso neste recorte.'
                    });
                })
            }
        });

        renderUnitRetriesChart(rows);
        renderUnitScoresDistChart(rows);
        renderUnitDeadlineTrendChart(rows, pairs);

        unitCurveCache = unitCompletionCurves(colaboradores, rows);
        unitCurvePage = 1;
        paintUnitCurvePage();

        unitEvalTimeCache = buildUnitTimeComparison(rows, userEvalDurationOf);
        unitEvalTimePage = 1;
        paintUnitEvalTimePage();

        unitCompletionTimeCache = buildUnitTimeComparison(rows, userCompletionDurationOf);
        unitCompletionTimePage = 1;
        paintUnitCompletionTimePage();

        // Pendências ficam fora só do filtro de DATA, igual ao colaborador:
        // são cursos sem conclusão, portanto sem data para recortar. Função e
        // curso valem — mudam de quem é a pendência e de qual curso o
        // relatório trata (o recorte por curso é aplicado em unitPendingData).
        unitPendingDataCache = unitPendingData(colaboradores, filterUnitRowsByRole(allRows, allColabs));
        unitPendingPage = 1;
        paintUnitPendingPage();
    }

    function renderUnitScoresChart(colaboradores, rows) {
        const byPerson = new Map();
        rows.forEach(row => {
            const score = Number(row.score);
            if (!Number.isFinite(score)) return;
            const name = row.unitPersonName || row.fullName || 'Sem nome';
            if (!byPerson.has(name)) byPerson.set(name, []);
            byPerson.get(name).push(score);
        });
        unitScoresCache = [...byPerson.entries()]
            .map(([name, scores]) => ({ name, avg: mean(scores), count: scores.length }))
            .sort((a, b) => b.avg - a.avg || a.name.localeCompare(b.name, 'pt-BR'));
        unitScoresPage = 1;

        const all = rows.map(r => Number(r.score)).filter(Number.isFinite);
        const avgEl = document.getElementById('cfg-dash-unit-scores-avg');
        if (avgEl) {
            if (!all.length) {
                avgEl.className = 'panel-header-stat';
                avgEl.textContent = 'Sem notas no período';
            } else {
                const avg = mean(all);
                avgEl.className = `panel-header-stat ${avg >= 8 ? 'is-high' : avg >= 6 ? 'is-mid' : 'is-low'}`;
                avgEl.innerHTML = `<i class="fas fa-star"></i> Média ${formatScore(avg)} <small>· ${all.length} ${all.length === 1 ? 'nota' : 'notas'}</small>`;
            }
        }
        paintUnitScoresPage();
    }

    function paintUnitScoresPage() {
        const canvas = document.getElementById('cfg-dash-unit-scores-chart');
        const emptyEl = document.getElementById('cfg-dash-unit-scores-empty');
        const pager = document.getElementById('cfg-dash-unit-scores-pagination');
        if (unitScoresCache.length === 0) {
            destroyChart('unitScores');
            if (canvas) canvas.style.display = 'none';
            if (emptyEl) emptyEl.style.display = 'flex';
            if (pager) pager.innerHTML = '';
            return;
        }
        if (canvas) canvas.style.display = 'block';
        if (emptyEl) emptyEl.style.display = 'none';
        const totalPages = Math.max(1, Math.ceil(unitScoresCache.length / UNIT_PEOPLE_PAGE_SIZE));
        unitScoresPage = Math.min(Math.max(1, unitScoresPage), totalPages);
        const start = (unitScoresPage - 1) * UNIT_PEOPLE_PAGE_SIZE;
        const page = unitScoresCache.slice(start, start + UNIT_PEOPLE_PAGE_SIZE);
        renderChart('unitScores', 'cfg-dash-unit-scores-chart', {
            type: 'bar',
            data: {
                labels: page.map(p => truncateLabel(p.name, 28)),
                datasets: [{
                    label: 'Média', data: page.map(p => Number(p.avg.toFixed(2))),
                    backgroundColor: page.map(p => scoreBarColor(p.avg)), borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => `Média ${formatScore(ctx.parsed.x)} · ${page[ctx.dataIndex].count} ${page[ctx.dataIndex].count === 1 ? 'prova' : 'provas'}` } }
                },
                scales: { x: { min: 0, max: 10, ticks: { stepSize: 2 } } }
            }
        });
        paintChartPager(pager, totalPages, unitScoresPage, (p) => { unitScoresPage = p; paintUnitScoresPage(); });
    }

    function renderUnitSatisfactionChart(rows) {
        unitSatisfactionRowsCache = ratedOnly(rows);
        unitSatisfactionPage = 1;
        paintUnitSatisfactionPage();
    }

    function paintUnitSatisfactionPage() {
        const canvas = document.getElementById('cfg-dash-unit-satisfaction-chart');
        const emptyEl = document.getElementById('cfg-dash-unit-satisfaction-empty');
        const pager = document.getElementById('cfg-dash-unit-satisfaction-pagination');
        const rated = unitSatisfactionRowsCache;
        if (rated.length === 0) {
            destroyChart('unitSatisfaction');
            if (canvas) canvas.style.display = 'none';
            if (emptyEl) emptyEl.style.display = 'flex';
            if (pager) pager.innerHTML = '';
            return;
        }
        if (canvas) canvas.style.display = 'block';
        if (emptyEl) emptyEl.style.display = 'none';

        if (unitSatisfactionMode === 'geral') {
            if (pager) pager.innerHTML = '';
            const counts = [1, 2, 3, 4, 5].map(star => rated.filter(r => Number(r.rating) === star).length);
            renderChart('unitSatisfaction', 'cfg-dash-unit-satisfaction-chart', {
                type: 'bar',
                data: { labels: ['1★', '2★', '3★', '4★', '5★'], datasets: [{ label: 'Avaliações', data: counts, backgroundColor: CHART_COLORS.warning, borderRadius: 4 }] },
                options: {
                    indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false }, tooltip: { callbacks: { label: singleSeriesTooltipLabel } } },
                    scales: { x: { beginAtZero: true, ticks: { precision: 0 } } }
                }
            });
            return;
        }

        const byCourse = new Map();
        rated.forEach(row => {
            const label = rowCourseLabel(row);
            if (!byCourse.has(label)) byCourse.set(label, []);
            byCourse.get(label).push(Number(row.rating));
        });
        const data = [...byCourse.entries()]
            .map(([label, ratings]) => ({ label, avg: mean(ratings), count: ratings.length }))
            .sort((a, b) => b.avg - a.avg || a.label.localeCompare(b.label, 'pt-BR'));
        const totalPages = Math.max(1, Math.ceil(data.length / UNIT_COURSE_PAGE_SIZE));
        unitSatisfactionPage = Math.min(Math.max(1, unitSatisfactionPage), totalPages);
        const start = (unitSatisfactionPage - 1) * UNIT_COURSE_PAGE_SIZE;
        const page = data.slice(start, start + UNIT_COURSE_PAGE_SIZE);
        renderChart('unitSatisfaction', 'cfg-dash-unit-satisfaction-chart', {
            type: 'bar',
            data: {
                labels: page.map(p => truncateLabel(p.label, 28)),
                datasets: [{ label: 'Satisfação média', data: page.map(p => Number(p.avg.toFixed(2))), backgroundColor: CHART_COLORS.warning, borderRadius: 4 }]
            },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => `${ctx.parsed.x.toFixed(1).replace('.', ',')}★ · ${page[ctx.dataIndex].count} ${page[ctx.dataIndex].count === 1 ? 'resposta' : 'respostas'}` } }
                },
                scales: { x: { min: 0, max: 5, ticks: { stepSize: 1 } } }
            }
        });
        paintChartPager(pager, totalPages, unitSatisfactionPage, (p) => { unitSatisfactionPage = p; paintUnitSatisfactionPage(); });
    }

    document.getElementById('cfg-dash-unit-satisfaction-mode')?.querySelectorAll('.dash-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            unitSatisfactionMode = btn.dataset.mode;
            document.getElementById('cfg-dash-unit-satisfaction-mode').querySelectorAll('.dash-mode-btn')
                .forEach(b => b.classList.toggle('is-active', b === btn));
            unitSatisfactionPage = 1;
            paintUnitSatisfactionPage();
        });
    });

    function renderUnitRetriesChart(rows) {
        const byPerson = new Map();
        attemptsByPersonCourse(rows).forEach(item => {
            if (item.attempts <= 1) return;
            const name = item.personName;
            byPerson.set(name, (byPerson.get(name) || 0) + (item.attempts - 1));
        });
        unitRetriesCache = [...byPerson.entries()]
            .map(([name, retries]) => ({ name, retries }))
            .sort((a, b) => b.retries - a.retries || a.name.localeCompare(b.name, 'pt-BR'));
        unitRetriesPage = 1;
        paintUnitRetriesPage();
    }

    function paintUnitRetriesPage() {
        const canvas = document.getElementById('cfg-dash-unit-retries-chart');
        const emptyEl = document.getElementById('cfg-dash-unit-retries-empty');
        const pager = document.getElementById('cfg-dash-unit-retries-pagination');
        if (unitRetriesCache.length === 0) {
            destroyChart('unitRetries');
            if (canvas) canvas.style.display = 'none';
            if (emptyEl) emptyEl.style.display = 'flex';
            if (pager) pager.innerHTML = '';
            return;
        }
        if (canvas) canvas.style.display = 'block';
        if (emptyEl) emptyEl.style.display = 'none';
        const totalPages = Math.max(1, Math.ceil(unitRetriesCache.length / UNIT_PEOPLE_PAGE_SIZE));
        unitRetriesPage = Math.min(Math.max(1, unitRetriesPage), totalPages);
        const start = (unitRetriesPage - 1) * UNIT_PEOPLE_PAGE_SIZE;
        const page = unitRetriesCache.slice(start, start + UNIT_PEOPLE_PAGE_SIZE);
        renderChart('unitRetries', 'cfg-dash-unit-retries-chart', {
            type: 'bar',
            data: {
                labels: page.map(p => truncateLabel(p.name, 28)),
                datasets: [{ label: 'Retentativas', data: page.map(p => p.retries), backgroundColor: CHART_COLORS.warning, borderRadius: 4 }]
            },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { x: { beginAtZero: true, ticks: { precision: 0 } } }
            }
        });
        paintChartPager(pager, totalPages, unitRetriesPage, (p) => { unitRetriesPage = p; paintUnitRetriesPage(); });
    }

    function renderUnitScoresDistChart(rows) {
        const counts = new Array(11).fill(0);
        rows.forEach(r => {
            const score = Number(r.score);
            if (!Number.isFinite(score)) return;
            counts[Math.min(10, Math.max(0, Math.floor(score)))]++;
        });
        renderChart('unitScoresDist', 'cfg-dash-unit-scoresdist-chart', {
            type: 'bar',
            data: {
                labels: counts.map((_, i) => String(i)),
                datasets: [{ label: 'Provas', data: counts, backgroundColor: counts.map((_, i) => scoreBarColor(i)), borderRadius: 4 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: singleSeriesTooltipLabel } } },
                scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
                ...drillChartHandlers(({ index }) => openDrillModal({
                    title: `Provas com nota ${index}`,
                    subtitle: `${unitChartKeyCache} • ${unitReportPeriodLabel()}`,
                    icon: 'fa-star',
                    rows: rows.filter(r => Number.isFinite(Number(r.score)) && Math.floor(Number(r.score)) === index),
                    extraOf: (r) => escapeHtml(r.unitPersonName || r.fullName || ''),
                    emptyMessage: 'Nenhuma prova com esta nota.'
                }))
            }
        });
    }

    function renderUnitDeadlineTrendChart(rows, pairs) {
        const range = unitChartRangeChip.getRange();
        const buckets = monthBucketsForRange(range, pairs, unitChartYearChip.getValue());
        const onTimeBuckets = countIntoMonthBuckets(pairs.filter(r => isOnTime(r.deadlineStatus)), monthBucketsForRange(range, pairs, unitChartYearChip.getValue()));
        const lateBuckets = countIntoMonthBuckets(pairs.filter(r => !isOnTime(r.deadlineStatus)), monthBucketsForRange(range, pairs, unitChartYearChip.getValue()));
        renderChart('unitDeadlineTrend', 'cfg-dash-unit-deadlinetrend-chart', {
            type: 'bar',
            data: {
                labels: buckets.map(b => b.label),
                datasets: [
                    { label: 'No prazo', data: onTimeBuckets.map(b => b.count), backgroundColor: CHART_COLORS.success, borderRadius: 4 },
                    { label: 'Fora do prazo', data: lateBuckets.map(b => b.count), backgroundColor: CHART_COLORS.danger, borderRadius: 4 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: percentTooltipLabel } } },
                scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } },
                ...drillChartHandlers(({ datasetIndex, index }) => {
                    const bucket = buckets[index];
                    const wantOnTime = datasetIndex === 0;
                    // A chave do bucket é "ano-mês" com mês base zero.
                    const [year, month] = bucket.key.split('-').map(Number);
                    openDrillModal({
                        title: `${wantOnTime ? 'No prazo' : 'Fora do prazo'} — ${bucket.label}`,
                        subtitle: `${unitChartKeyCache} • ${unitReportPeriodLabel()}`,
                        icon: wantOnTime ? 'fa-calendar-check' : 'fa-triangle-exclamation',
                        tone: wantOnTime ? 'is-ok' : 'is-bad',
                        rows: pairs.filter(r => {
                            if (isOnTime(r.deadlineStatus) !== wantOnTime || !r.submittedAt) return false;
                            const d = new Date(r.submittedAt);
                            return d.getFullYear() === year && d.getMonth() === month;
                        }),
                        extraOf: (r) => escapeHtml(r.unitPersonName || r.fullName || ''),
                        emptyMessage: 'Nenhum curso concluído neste mês.'
                    });
                })
            }
        });
    }

    const UNIT_CURVE_COLORS = [CHART_COLORS.accent, CHART_COLORS.success, CHART_COLORS.warning, CHART_COLORS.purple, CHART_COLORS.orange];

    function paintUnitCurvePage() {
        const canvas = document.getElementById('cfg-dash-unit-curve-chart');
        const emptyEl = document.getElementById('cfg-dash-unit-curve-empty');
        const pager = document.getElementById('cfg-dash-unit-curve-pagination');
        if (unitCurveCache.length === 0) {
            destroyChart('unitCurve');
            if (canvas) canvas.style.display = 'none';
            if (emptyEl) emptyEl.style.display = 'flex';
            if (pager) pager.innerHTML = '';
            return;
        }
        if (canvas) canvas.style.display = 'block';
        if (emptyEl) emptyEl.style.display = 'none';
        const totalPages = Math.max(1, Math.ceil(unitCurveCache.length / UNIT_CURVE_PAGE_SIZE));
        unitCurvePage = Math.min(Math.max(1, unitCurvePage), totalPages);
        const start = (unitCurvePage - 1) * UNIT_CURVE_PAGE_SIZE;
        const page = unitCurveCache.slice(start, start + UNIT_CURVE_PAGE_SIZE);
        // Eixo X compartilhado: o maior "Nº dia" entre os cursos da página,
        // para as curvas ficarem comparáveis lado a lado. O teto é o balde
        // ">10 dias" (ver CURVE_OVERFLOW_DAY).
        const maxDay = Math.max(...page.map(c => c.points[c.points.length - 1].day), 1);
        const labels = Array.from({ length: maxDay }, (_, i) => curveDayLabel(i + 1));
        renderChart('unitCurve', 'cfg-dash-unit-curve-chart', {
            type: 'line',
            data: {
                labels,
                datasets: page.map((curve, i) => {
                    // Degrau: entre duas conclusões o percentual não muda, e
                    // interpolar reto inventaria conclusões que não houve.
                    let last = 0;
                    const series = labels.map((_, dayIndex) => {
                        const point = curve.points.find(p => p.day === dayIndex + 1);
                        if (point) last = point.pct;
                        return last;
                    });
                    return {
                        label: truncateLabel(curve.name, 26),
                        data: series,
                        borderColor: UNIT_CURVE_COLORS[i % UNIT_CURVE_COLORS.length],
                        backgroundColor: UNIT_CURVE_COLORS[i % UNIT_CURVE_COLORS.length] + '22',
                        tension: 0.25, pointRadius: 2, fill: false
                    };
                })
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' },
                    tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}%` } }
                },
                scales: { y: { min: 0, max: 100, ticks: { callback: (v) => `${v}%` } } }
            }
        });
        paintChartPager(pager, totalPages, unitCurvePage, (p) => { unitCurvePage = p; paintUnitCurvePage(); });
    }

    function paintUnitEvalTimePage() {
        paintUserTimeChart({
            chartKey: 'unitEvalTime',
            canvasId: 'cfg-dash-unit-evaltime-chart',
            emptyId: 'cfg-dash-unit-evaltime-empty',
            pagerId: 'cfg-dash-unit-evaltime-pagination',
            data: unitEvalTimeCache,
            page: unitEvalTimePage,
            pageSize: UNIT_TIME_PAGE_SIZE,
            format: formatMsAsDuration,
            tickFormat: (ms) => Math.round(ms / 60000),
            seriesLabel: 'Média da unidade',
            // Mesma razão do gráfico do colaborador: a meta é do curso.
            markerDefs: [MARKER_AVG],
            onPage: (p) => { unitEvalTimePage = p; paintUnitEvalTimePage(); }
        });
    }

    function paintUnitCompletionTimePage() {
        paintUserTimeChart({
            chartKey: 'unitCompletionTime',
            canvasId: 'cfg-dash-unit-completiontime-chart',
            emptyId: 'cfg-dash-unit-completiontime-empty',
            pagerId: 'cfg-dash-unit-completiontime-pagination',
            data: unitCompletionTimeCache,
            page: unitCompletionTimePage,
            pageSize: UNIT_TIME_PAGE_SIZE,
            format: formatHHMMSS,
            tickFormat: (ms) => Number((ms / 3600000).toFixed(1)),
            seriesLabel: 'Média da unidade',
            onPage: (p) => { unitCompletionTimePage = p; paintUnitCompletionTimePage(); }
        });
    }

    function paintUnitPendingPage() {
        const canvas = document.getElementById('cfg-dash-unit-pending-chart');
        const emptyEl = document.getElementById('cfg-dash-unit-pending-empty');
        const pager = document.getElementById('cfg-dash-unit-pending-pagination');
        if (unitPendingDataCache.length === 0) {
            destroyChart('unitPending');
            if (canvas) canvas.style.display = 'none';
            if (emptyEl) emptyEl.style.display = 'flex';
            if (pager) pager.innerHTML = '';
            return;
        }
        if (canvas) canvas.style.display = 'block';
        if (emptyEl) emptyEl.style.display = 'none';
        const totalPages = Math.max(1, Math.ceil(unitPendingDataCache.length / UNIT_COURSE_PAGE_SIZE));
        unitPendingPage = Math.min(Math.max(1, unitPendingPage), totalPages);
        const start = (unitPendingPage - 1) * UNIT_COURSE_PAGE_SIZE;
        const page = unitPendingDataCache.slice(start, start + UNIT_COURSE_PAGE_SIZE);
        renderChart('unitPending', 'cfg-dash-unit-pending-chart', {
            type: 'bar',
            data: {
                labels: page.map(p => truncateLabel(p.name, 30)),
                datasets: [{
                    label: '% do público-alvo que falta',
                    data: page.map(p => p.missingPct),
                    backgroundColor: page.map(p => progressBarColor(100 - p.missingPct)),
                    borderRadius: 4, minBarLength: 3
                }]
            },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const item = page[ctx.dataIndex];
                                return `${item.missing} de ${item.total} ainda não concluíram (${item.missingPct}%) · ${item.pct}% assistido em média`;
                            }
                        }
                    }
                },
                scales: { x: { min: 0, max: 100, ticks: { callback: (v) => `${v}%` } } },
                // Clicar na barra abre quem falta naquele curso, com o
                // progresso individual — a média da barra não diz a quem
                // cobrar.
                ...drillChartHandlers(({ index }) => {
                    const item = page[index];
                    if (!item) return;
                    openPendingDrillModal({
                        title: item.name,
                        subtitle: `${unitChartKeyCache} • ${item.missing} de ${item.total} ainda não concluíram`,
                        people: item.people || []
                    });
                })
            }
        });
        paintChartPager(pager, totalPages, unitPendingPage, (p) => { unitPendingPage = p; paintUnitPendingPage(); });
    }

    // ─── Relatórios da unidade (PDF e planilha) ───
    // O relatório impresso que serviu de modelo é justamente um relatório de
    // unidade, e ele não mostra números crus: cada bloco vem com um veredito
    // ("Ótimo", "Excelente", "Atenção"). As regras abaixo são a tradução
    // desse vocabulário, e ficam aqui — e não no módulo de PDF — porque
    // dependem de público-alvo, prazo e meta, que só o dashboard conhece.

    function completionVerdict(pct, lateCount) {
        if (pct === null) return { verdict: 'Sem público', tone: '' };
        if (pct >= 100 && lateCount === 0) return { verdict: 'Ótimo', tone: 'is-ok' };
        if (pct >= 70) return { verdict: lateCount > 0 ? 'Bom' : 'Ótimo', tone: 'is-ok' };
        return { verdict: 'Atenção', tone: 'is-bad' };
    }

    // Mesma régua do relatório do colaborador (ver timeCoverage): passar da
    // meta não é problema — revisitar conteúdo é legítimo. O risco está
    // embaixo, porque pouco tempo diante da meta sugere conteúdo não
    // assistido por inteiro.
    function timeVerdict(avgMs, expectedMs) {
        if (!Number.isFinite(avgMs) || avgMs <= 0) return { verdict: 'Sem dados', tone: '' };
        const coverage = timeCoverage(avgMs, expectedMs);
        if (!coverage) return { verdict: 'Sem meta', tone: '' };
        return { verdict: coverage.label, tone: coverage.tone, pct: coverage.pct };
    }

    function scoreVerdict(avg) {
        if (avg === null) return { verdict: 'Sem notas', tone: '' };
        if (avg >= 10) return { verdict: 'Aproveitamento máximo', tone: 'is-ok' };
        if (avg >= 9) return { verdict: 'Bom aproveitamento', tone: 'is-ok' };
        if (avg >= 7) return { verdict: 'Aproveitamento regular', tone: 'is-warn' };
        return { verdict: 'Atenção', tone: 'is-bad' };
    }

    function ratingVerdict(avg) {
        if (avg === null) return { verdict: 'Sem avaliação', tone: '' };
        if (avg >= 4) return { verdict: 'Bom', tone: 'is-ok' };
        if (avg >= 3) return { verdict: 'Regular', tone: 'is-warn' };
        if (avg >= 2) return { verdict: 'Regular/Ruim', tone: 'is-bad' };
        return { verdict: 'Ruim', tone: 'is-bad' };
    }

    // "1 nota 1 · 2 notas 3", como no modelo.
    function ratingBreakdownLabel(ratings) {
        if (!ratings.length) return 'Sem feedback registrado';
        return [1, 2, 3, 4, 5]
            .map(star => ({ star, count: ratings.filter(r => r === star).length }))
            .filter(item => item.count > 0)
            .map(item => `${item.count} ${item.count === 1 ? 'nota' : 'notas'} ${item.star}`)
            .join(' · ');
    }

    // Uma linha por curso da unidade, já no formato de blocos que a folha
    // "curso a curso" do relatório desenha.
    function unitCourseSummaries(colaboradores, rows, curves) {
        const slug = currentSlug();
        const unitIds = new Set(colaboradores.map(c => c.id));
        const pairs = lastAttemptByPersonCourse(rows);
        const curveByName = new Map(curves.map(c => [c.name, c]));

        const byCourse = new Map();
        pairs.forEach(row => {
            const key = rowCourseKey(row);
            if (!byCourse.has(key)) byCourse.set(key, { sample: row, pairs: [] });
            byCourse.get(key).pairs.push(row);
        });
        const rowsByCourse = new Map();
        rows.forEach(row => {
            const key = rowCourseKey(row);
            if (!rowsByCourse.has(key)) rowsByCourse.set(key, []);
            rowsByCourse.get(key).push(row);
        });

        return [...byCourse.entries()].map(([key, item]) => {
            const sample = item.sample;
            const label = rowCourseLabel(sample);
            const theme = sample.slug && sample.subjectId && sample.themeId
                ? allTrainingData[slug]?.[sample.subjectId]?.themes?.[sample.themeId]
                : null;
            const audience = theme && !AUDIENCE_EXEMPT_SLUGS.includes(slug)
                ? courseAudience(theme).filter(colab => unitIds.has(colab.id))
                : [];
            // Taxa de conclusão é sobre o PÚBLICO-ALVO do curso, não sobre
            // todo mundo que fez. Quem concluiu sem estar no público-alvo
            // (mudou de função depois, ou fez um curso de outra função)
            // entrava só no numerador e a taxa passava de 100% — "140% de
            // conclusão" era 7 conclusões sobre 5 pessoas-alvo.
            const audienceIds = new Set(audience.map(colab => colab.id));
            const approvedPairs = item.pairs.filter(r => r.approved);
            const insideAudience = approvedPairs.filter(r => audienceIds.has(r.unitPersonId)).length;
            const concluded = audienceIds.size ? insideAudience : approvedPairs.length;
            const total = audienceIds.size || approvedPairs.length;
            // Conclusões fora do público-alvo não somem: viram nota no card,
            // senão "3 de 5" com 7 provas na mesma linha não fecha.
            const outsiders = approvedPairs.length - concluded;
            const completionPct = total > 0 ? Math.round((concluded / total) * 100) : null;
            const lateCount = item.pairs.filter(r => !isOnTime(r.deadlineStatus)).length;

            const activeList = item.pairs.filter(r => r.approved).map(userCompletionDurationOf).filter(ms => Number.isFinite(ms) && ms > 0);
            const avgActiveMs = activeList.length ? mean(activeList) : null;
            const expectedMs = expectedCompletionMsOf(theme);

            const courseRows = rowsByCourse.get(key) || [];
            const scores = courseRows.map(r => Number(r.score)).filter(Number.isFinite);
            const avgScore = scores.length ? mean(scores) : null;
            const ratings = courseRows.map(r => Number(r.rating)).filter(n => Number.isFinite(n) && n >= 1 && n <= 5);
            const avgRating = ratings.length ? mean(ratings) : null;

            const curve = curveByName.get(label);
            const completion = completionVerdict(completionPct, lateCount);
            const time = timeVerdict(avgActiveMs, expectedMs);
            const score = scoreVerdict(avgScore);
            const rating = ratingVerdict(avgRating);

            return {
                key,
                name: label,
                subject: sample.subject || '',
                completionPct,
                concluded,
                total,
                lateCount,
                avgScore,
                avgRating,
                avgActiveMs,
                expectedMs,
                attempts: courseRows.length,
                blocks: [
                    {
                        label: 'Taxa de conclusão',
                        value: completionPct === null ? '—' : `${completionPct}%`,
                        verdict: completion.verdict,
                        tone: completion.tone,
                        hint: `${concluded} de ${total} concluíram`
                            + (outsiders > 0 ? ` · ${outsiders} fora do público-alvo` : '')
                            + (curve ? ` · ${curve.points[curve.points.length - 1].pct}% até ${curveDayLabel(curve.points[curve.points.length - 1].day)}` : '')
                    },
                    {
                        label: 'Tempo de curso',
                        value: formatHHMMSS(avgActiveMs),
                        verdict: time.verdict,
                        tone: time.tone,
                        // "% da meta", não "+9 min": a leitura que interessa é
                        // quanto do tempo previsto a unidade cumpriu, e o
                        // sinal do delta sugeriria que passar é ruim.
                        hint: time.pct !== undefined
                            ? `${time.pct}% da meta (${formatHHMMSS(expectedMs)})`
                            : 'Sem meta cadastrada'
                    },
                    {
                        label: 'Nota média',
                        value: avgScore === null ? '—' : `${formatScore(avgScore)}/10`,
                        verdict: score.verdict,
                        tone: score.tone,
                        hint: `${courseRows.length} ${courseRows.length === 1 ? 'prova' : 'provas'}`
                    },
                    {
                        label: 'Avaliação da unidade',
                        value: avgRating === null ? '—' : `${avgRating.toFixed(1).replace('.', ',')}/5`,
                        verdict: rating.verdict,
                        tone: rating.tone,
                        hint: ratingBreakdownLabel(ratings)
                    }
                ]
            };
        }).sort((a, b) => b.concluded - a.concluded || a.name.localeCompare(b.name, 'pt-BR'));
    }

    function buildUnitPdfPayload(unitKey, colaboradores, rows) {
        const pairs = lastAttemptByPersonCourse(rows);
        const attempts = attemptsByPersonCourse(rows);
        const scores = rows.map(r => Number(r.score)).filter(Number.isFinite);
        const evalSeconds = rows.map(r => Number(r.durationSeconds)).filter(Number.isFinite);
        const rated = ratedOnly(rows);
        const ratings = rated.map(r => Number(r.rating));
        const onTime = pairs.filter(r => isOnTime(r.deadlineStatus)).length;
        const approved = rows.filter(r => r.approved).length;
        const avg = (list) => list.length ? mean(list) : null;
        const avgScore = avg(scores);
        const avgRating = avg(ratings);
        const onTimePct = pairs.length ? Math.round((onTime / pairs.length) * 100) : null;

        const curves = unitCompletionCurves(colaboradores, rows);
        const courses = unitCourseSummaries(colaboradores, rows, curves);
        // Mesma régua do relatório do colaborador: o que preocupa não é
        // passar da meta, é ficar MUITO abaixo dela — sinal de conteúdo
        // pulado. O pior é o de menor cobertura.
        const underGoal = buildUnitTimeComparison(rows, userCompletionDurationOf)
            .map(item => ({ item, coverage: timeCoverage(item.userMs, item.expectedMs) }))
            .filter(entry => entry.coverage && (entry.coverage.level === 'critico' || entry.coverage.level === 'alerta'))
            .sort((a, b) => a.coverage.pct - b.coverage.pct);
        const worstUnderGoal = underGoal[0] || null;

        const range = unitChartRangeChip.getRange();
        const monthBuckets = monthBucketsForRange(range, pairs, unitChartYearChip.getValue());
        const onTimeByMonth = countIntoMonthBuckets(pairs.filter(r => isOnTime(r.deadlineStatus)), monthBucketsForRange(range, pairs, unitChartYearChip.getValue()));
        const lateByMonth = countIntoMonthBuckets(pairs.filter(r => !isOnTime(r.deadlineStatus)), monthBucketsForRange(range, pairs, unitChartYearChip.getValue()));
        const deadlineByMonth = monthBuckets.map((b, i) => ({ label: b.label, onTime: onTimeByMonth[i].count, late: lateByMonth[i].count }));
        const worstMonth = deadlineByMonth.filter(m => m.late > 0).sort((a, b) => b.late - a.late)[0] || null;

        const timeVsGoal = buildUnitTimeComparison(rows, userCompletionDurationOf).map(item => ({
            shortLabel: pdfShortLabel(item.label),
            userMin: Math.round(item.userMs / 60000),
            avgMin: Number.isFinite(item.avgMs) && item.avgMs > 0 ? Math.round(item.avgMs / 60000) : null,
            goalMin: Number.isFinite(item.expectedMs) && item.expectedMs > 0 ? Math.round(item.expectedMs / 60000) : null,
            verdict: pdfTimeVerdict(item)
        }));

        // Com autor: numa unidade, saber de quem veio o comentário é metade
        // da informação.
        const unitFeedbacks = buildReportFeedbacks(rows, (row) => row.unitPersonName || row.fullName || "");

        // A curva da unidade vale por si: no gráfico de notas do PDF, uma
        // barra por prova de 40 pessoas seria ilegível, então a série vira a
        // média de cada colaborador, na ordem da melhor para a pior.
        const byPerson = new Map();
        rows.forEach(row => {
            const score = Number(row.score);
            if (!Number.isFinite(score)) return;
            const name = row.unitPersonName || row.fullName || 'Sem nome';
            if (!byPerson.has(name)) byPerson.set(name, []);
            byPerson.get(name).push(score);
        });
        const perPerson = [...byPerson.entries()]
            .map(([name, list]) => ({ name, avg: mean(list) }))
            .sort((a, b) => b.avg - a.avg);

        return {
            kind: 'unidade',
            coverLead: 'Proficiência da',
            coverSub: 'Desempenho da unidade na realização dos cursos, cumprimento de prazo e percepção dos colaboradores.',
            colab: { fullName: unitKey, role: `${colaboradores.length} ${colaboradores.length === 1 ? 'colaborador' : 'colaboradores'}`, unit: '' },
            categoryName: U.currentCategoryName || CATEGORY_LABELS[currentSlug()] || currentSlug(),
            periodLabel: unitReportPeriodLabel(),
            roleLabel: reportScopeLabel(unitReportRoleLabel(), unitChartRoleChip, unitReportCourseLabel(), unitChartCourseChip),
            dataRangeLabel: rowsDateRangeLabel(rows),
            generatedAt: new Date().toLocaleString('pt-BR'),
            filename: `UniLAMIC_relatorio_unidade_${normalizeName(unitKey).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'unidade'}_${new Date().toISOString().split('T')[0]}.pdf`,
            summary: {
                coursesCount: courses.length,
                attempts: rows.length,
                approved,
                reproved: rows.length - approved,
                approvalPctLabel: pctLabel(approved, rows.length),
                avgScore,
                avgScoreLabel: avgScore === null ? null : formatScore(avgScore),
                minScoreLabel: scores.length ? formatScore(Math.min(...scores)) : '—',
                maxScoreLabel: scores.length ? formatScore(Math.max(...scores)) : '—',
                lastAttemptsCount: pairs.length,
                onTime,
                late: pairs.length - onTime,
                onTimePct,
                onTimePctLabel: pctLabel(onTime, pairs.length),
                retryApproved: attempts.filter(a => a.approved && a.attempts > 1).length,
                stillFailing: attempts.filter(a => !a.approved).length,
                avgEvalLabel: evalSeconds.length ? formatDuration(mean(evalSeconds)) : null,
                ratingsCount: ratings.length,
                avgRating,
                avgRatingLabel: avgRating === null ? null : avgRating.toFixed(1).replace('.', ','),
                commentsCount: rows.filter(r => r.comment).length,
                lowRatingsWithoutComment: rated.filter(r => Number(r.rating) <= 3 && !r.comment).length,
                pendingCount: unitPendingDataCache.length,
                pendingAvgPctLabel: unitPendingDataCache.length
                    ? `${Math.round(mean(unitPendingDataCache.map(p => p.pct)))}%` : null,
                underGoalCourses: underGoal.length,
                worstUnderGoalLabel: worstUnderGoal
                    ? `${pdfShortLabel(worstUnderGoal.item.label)}, ${worstUnderGoal.coverage.pct}% da meta`
                    : null,
                worstMonthLabel: worstMonth ? `${worstMonth.label} (${worstMonth.late})` : null
            },
            courses,
            completionCurves: curves.map(c => ({ name: c.name, points: c.points })),
            scoreHistory: perPerson.map(p => ({ label: p.name, score: Number(p.avg.toFixed(2)) })),
            scoreTrend: fixedAverageLine(perPerson.map(p => p.avg)),
            timeSeriesLabel: 'Média da unidade',
            scoreChartTitle: 'Nota média por colaborador',
            scoreChartSub: 'Uma barra por colaborador da unidade, com a média da unidade como referência',
            deadlineByMonth,
            ratingCounts: [1, 2, 3, 4, 5].map(star => rated.filter(r => Number(r.rating) === star).length),
            timeVsGoal,
            feedbacks: unitFeedbacks.feedbacks,
            feedbackHiddenCount: unitFeedbacks.hiddenCount,
            pending: unitPendingDataCache.map(p => ({
                name: p.name,
                subject: `${p.subject} · faltam ${p.missing} de ${p.total}`,
                pct: p.pct,
                // Nomes de quem falta: no relatório da unidade a folha lista
                // pessoa a pessoa, então a média do curso vira só o resumo.
                people: (p.people || []).map(person => ({ name: person.name, pct: person.pct }))
            }))
        };
    }

    async function exportUnitPdf() {
        if (!unitChartKeyCache) { showWarning('Abra uma unidade para gerar o relatório.'); return; }
        if (!U.UserPdfReport) { showWarning('Módulo de relatório em PDF não carregado. Recarregue a página.'); return; }
        const btn = document.getElementById('cfg-dash-unit-pdf-btn');
        if (btn) btn.disabled = true;
        try {
            const rows = filterUnitRows(unitChartRowsCache);
            const ok = await U.UserPdfReport.download(buildUnitPdfPayload(unitChartKeyCache, filterUnitColabsByRole(unitChartColabsCache), rows));
            if (ok) showWarning('Relatório baixado com sucesso!');
        } catch (error) {
            showWarning('Erro ao gerar o relatório: ' + error.message);
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    document.getElementById('cfg-dash-unit-pdf-btn')?.addEventListener('click', exportUnitPdf);

    async function exportUnitReport() {
        if (!unitChartKeyCache) { showWarning('Abra uma unidade para gerar o relatório.'); return; }
        const btn = document.getElementById('cfg-dash-unit-export-btn');
        if (btn) btn.disabled = true;
        showWarning('Gerando planilha...');
        try {
            if (U.loadVendor) await Promise.all([U.loadVendor('xlsx-style'), U.loadVendor('fflate')]);
            const XLSXLib = window.XLSX;
            if (!XLSXLib) throw new Error('biblioteca de planilha indisponível');

            const unitKey = unitChartKeyCache;
            const colaboradores = filterUnitColabsByRole(unitChartColabsCache);
            const rows = filterUnitRows(unitChartRowsCache);
            const pairs = lastAttemptByPersonCourse(rows);
            const attemptsByKey = new Map(attemptsByPersonCourse(rows).map(a => [a.key, a.attempts]));
            const curves = unitCompletionCurves(colaboradores, rows);
            const courses = unitCourseSummaries(colaboradores, rows, curves);
            const periodLabel = unitReportPeriodLabel();

            const wb = XLSXLib.utils.book_new();
            XLSXLib.utils.book_append_sheet(wb, buildUnitSummarySheet(XLSXLib, unitKey, colaboradores, rows), 'Resumo');

            const chartsSheet = buildUserChartsSheet(XLSXLib, { fullName: unitKey }, rows, {
                periodLabel,
                roleLabel: `${unitReportRoleLabel()} • ${unitReportCourseLabel()}`,
                attemptsOf: attemptsByPersonCourse,
                lastAttemptsOf: lastAttemptByPersonCourse,
                range: unitChartRangeChip.getRange(),
                year: unitChartYearChip.getValue()
            });
            XLSXLib.utils.book_append_sheet(wb, chartsSheet.ws, 'Gráficos');

            // Colaboradores — a aba que só existe no relatório da unidade:
            // é ela que mostra quem puxa a média para cima ou para baixo.
            const byPerson = new Map();
            rows.forEach(row => {
                if (!byPerson.has(row.unitPersonId)) byPerson.set(row.unitPersonId, []);
                byPerson.get(row.unitPersonId).push(row);
            });
            XLSXLib.utils.book_append_sheet(wb, xlsTableSheet(XLSXLib, {
                title: `Colaboradores — ${unitKey}`,
                subtitle: `Situação de cada colaborador da unidade • Período: ${periodLabel}`,
                columns: [
                    { header: 'Colaborador', width: 34, cell: (p) => ({ value: p.colab.fullName, bold: true }) },
                    { header: 'Função', width: 26, cell: (p) => p.colab.role || '—' },
                    { header: 'Cursos concluídos', width: 17, cell: (p) => ({ value: p.courses, bold: true }) },
                    { header: 'Provas', width: 10, cell: (p) => p.attempts },
                    { header: 'Aprovações', width: 12, cell: (p) => ({ value: p.approved, tone: 'ok' }) },
                    { header: 'Reprovações', width: 12, cell: (p) => ({ value: p.attempts - p.approved, tone: p.attempts - p.approved > 0 ? 'bad' : undefined }) },
                    { header: 'Média', width: 10, cell: (p) => ({ value: p.avg === null ? '—' : Number(p.avg.toFixed(1)), tone: p.avg === null ? undefined : p.avg >= 8 ? 'ok' : p.avg >= 6 ? 'warn' : 'bad', bold: true }) },
                    { header: 'Fora do prazo', width: 14, cell: (p) => ({ value: p.late, tone: p.late > 0 ? 'bad' : 'ok' }) }
                ],
                rows: colaboradores.map(colab => {
                    const personRows = byPerson.get(colab.id) || [];
                    const scores = personRows.map(r => Number(r.score)).filter(Number.isFinite);
                    const personPairs = lastAttemptByPersonCourse(personRows);
                    return {
                        colab,
                        courses: personPairs.length,
                        attempts: personRows.length,
                        approved: personRows.filter(r => r.approved).length,
                        avg: scores.length ? mean(scores) : null,
                        late: personPairs.filter(r => !isOnTime(r.deadlineStatus)).length
                    };
                }).sort((a, b) => b.courses - a.courses || a.colab.fullName.localeCompare(b.colab.fullName, 'pt-BR')),
                emptyMessage: 'Nenhum colaborador ativo nesta unidade.'
            }), 'Colaboradores');

            XLSXLib.utils.book_append_sheet(wb, xlsTableSheet(XLSXLib, {
                title: 'Cursos da unidade',
                subtitle: `Um curso por linha, com o veredito do relatório • Período: ${periodLabel}`,
                columns: [
                    { header: 'Curso', width: 42, cell: (c) => ({ value: c.name, bold: true }) },
                    { header: 'Assunto', width: 26, cell: (c) => c.subject || '—' },
                    { header: 'Concluíram', width: 12, cell: (c) => ({ value: c.concluded, tone: 'ok', bold: true }) },
                    { header: 'Público-alvo na unidade', width: 20, cell: (c) => c.total },
                    { header: 'Taxa de conclusão', width: 16, cell: (c) => ({ value: c.completionPct === null ? '—' : `${c.completionPct}%`, tone: 'strong', bold: true }) },
                    { header: 'Fora do prazo', width: 13, cell: (c) => ({ value: c.lateCount, tone: c.lateCount > 0 ? 'bad' : 'ok' }) },
                    { header: 'Nota média', width: 11, cell: (c) => ({ value: c.avgScore === null ? '—' : Number(c.avgScore.toFixed(1)), tone: c.avgScore === null ? undefined : c.avgScore >= 8 ? 'ok' : c.avgScore >= 6 ? 'warn' : 'bad', bold: true }) },
                    { header: 'Tempo médio', width: 13, cell: (c) => formatHHMMSS(c.avgActiveMs) },
                    { header: 'Meta esperada', width: 14, cell: (c) => formatHHMMSS(c.expectedMs) },
                    // Cobertura da meta, não delta: o risco é ficar abaixo.
                    { header: '% da meta', width: 12, cell: (c) => {
                        const coverage = timeCoverage(c.avgActiveMs, c.expectedMs);
                        return coverage
                            ? { value: `${coverage.pct}%`, tone: coverage.level === 'critico' ? 'bad' : coverage.level === 'alerta' ? 'warn' : 'ok', bold: true }
                            : '—';
                    } },
                    { header: 'Cobertura', width: 14, cell: (c) => {
                        const coverage = timeCoverage(c.avgActiveMs, c.expectedMs);
                        return coverage
                            ? { value: coverage.label, tone: coverage.level === 'critico' ? 'bad' : coverage.level === 'alerta' ? 'warn' : 'ok' }
                            : '—';
                    } },
                    { header: 'Satisfação', width: 11, cell: (c) => (c.avgRating === null ? '—' : Number(c.avgRating.toFixed(1))) }
                ],
                rows: courses,
                emptyMessage: 'Nenhum curso concluído nesta unidade no período.'
            }), 'Cursos');

            XLSXLib.utils.book_append_sheet(wb, xlsTableSheet(XLSXLib, {
                title: 'Tentativas de prova',
                subtitle: `Uma linha por prova enviada na unidade • Período: ${periodLabel}`,
                columns: [
                    { header: 'Data/Hora', width: 18, cell: (r) => r.submittedAt ? new Date(r.submittedAt).toLocaleString('pt-BR') : '—' },
                    { header: 'Colaborador', width: 32, cell: (r) => ({ value: r.unitPersonName || r.fullName || '—', bold: true }) },
                    { header: 'Curso', width: 40, cell: (r) => rowCourseLabel(r) },
                    { header: 'Nota', width: 8, cell: (r) => ({ value: Number.isFinite(Number(r.score)) ? Number(r.score) : '—', tone: Number(r.score) >= 8 ? 'ok' : Number(r.score) >= 6 ? 'warn' : 'bad', bold: true }) },
                    { header: 'Situação', width: 13, cell: (r) => ({ value: r.approved ? 'Aprovado' : 'Reprovado', tone: r.approved ? 'ok' : 'bad', bold: true }) },
                    { header: 'Tentativas', width: 11, cell: (r) => attemptsByKey.get(personCourseKey(r)) || 1 },
                    { header: 'Tempo de prova', width: 14, cell: (r) => formatDuration(r.durationSeconds) },
                    { header: 'Tempo de conclusão', width: 17, cell: (r) => formatHHMMSS(userCompletionDurationOf(r)) },
                    { header: 'Prazo', width: 15, cell: (r) => ({ value: deadlineStatusLabel(r.deadlineStatus), tone: deadlineTone(r.deadlineStatus) }) },
                    { header: 'Satisfação', width: 10, cell: (r) => starsLabel(r.rating) },
                    { header: 'Comentário', width: 50, cell: (r) => r.comment || '' }
                ],
                rows: rows.slice().sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0)),
                emptyMessage: 'Nenhuma prova enviada nesta unidade no período.'
            }), 'Tentativas');

            const range = unitChartRangeChip.getRange();
            const monthBuckets = monthBucketsForRange(range, pairs, unitChartYearChip.getValue());
            const onTimeByMonth = countIntoMonthBuckets(pairs.filter(r => isOnTime(r.deadlineStatus)), monthBucketsForRange(range, pairs, unitChartYearChip.getValue()));
            const lateByMonth = countIntoMonthBuckets(pairs.filter(r => !isOnTime(r.deadlineStatus)), monthBucketsForRange(range, pairs, unitChartYearChip.getValue()));
            XLSXLib.utils.book_append_sheet(wb, xlsTableSheet(XLSXLib, {
                title: 'Prazo por mês',
                subtitle: 'Cursos concluídos na unidade em cada mês, pela situação da última tentativa',
                columns: [
                    { header: 'Mês', width: 14, cell: (b) => ({ value: b.label, bold: true }) },
                    { header: 'No prazo', width: 12, cell: (b) => ({ value: b.onTime, tone: 'ok' }) },
                    { header: 'Fora do prazo', width: 14, cell: (b) => ({ value: b.late, tone: b.late > 0 ? 'bad' : undefined }) },
                    { header: 'Total', width: 10, cell: (b) => ({ value: b.onTime + b.late, bold: true }) },
                    { header: '% no prazo', width: 12, cell: (b) => ({ value: pctLabel(b.onTime, b.onTime + b.late), tone: 'strong' }) }
                ],
                rows: monthBuckets.map((b, i) => ({ label: b.label, onTime: onTimeByMonth[i].count, late: lateByMonth[i].count }))
            }), 'Prazo por Mês');

            const scoreCounts = new Array(11).fill(0);
            rows.forEach(r => {
                const score = Number(r.score);
                if (!Number.isFinite(score)) return;
                scoreCounts[Math.min(10, Math.max(0, Math.floor(score)))]++;
            });
            const scoredTotal = scoreCounts.reduce((a, b) => a + b, 0);
            XLSXLib.utils.book_append_sheet(wb, xlsTableSheet(XLSXLib, {
                title: 'Distribuição de notas',
                subtitle: 'Provas da unidade por nota (arredondada para baixo)',
                columns: [
                    { header: 'Nota', width: 10, cell: (s) => ({ value: s.score, bold: true }) },
                    { header: 'Provas', width: 12, cell: (s) => ({ value: s.count, tone: s.score >= 8 ? 'ok' : s.score >= 6 ? 'warn' : 'bad' }) },
                    { header: '% do total', width: 12, cell: (s) => ({ value: pctLabel(s.count, scoredTotal), tone: 'strong' }) }
                ],
                rows: scoreCounts.map((count, score) => ({ score, count }))
            }), 'Notas');

            XLSXLib.utils.book_append_sheet(wb, xlsTableSheet(XLSXLib, {
                title: 'Cursos pendentes na unidade',
                subtitle: 'Quem do público-alvo ainda não concluiu — não depende do filtro de data',
                columns: [
                    { header: 'Curso', width: 44, cell: (p) => ({ value: p.name, bold: true }) },
                    { header: 'Assunto', width: 26, cell: (p) => p.subject },
                    { header: 'Faltam', width: 10, cell: (p) => ({ value: p.missing, tone: 'bad', bold: true }) },
                    { header: 'Concluíram', width: 12, cell: (p) => ({ value: p.done, tone: 'ok' }) },
                    { header: 'Público-alvo na unidade', width: 20, cell: (p) => p.total },
                    { header: '% assistido de quem falta', width: 22, cell: (p) => ({ value: `${p.pct}%`, tone: p.pct >= 75 ? 'ok' : p.pct > 0 ? 'warn' : 'bad', bold: true }) }
                ],
                rows: unitPendingDataCache,
                emptyMessage: 'Nenhum curso pendente: a unidade concluiu tudo que os cargos exigem.'
            }), 'Pendentes');

            // Uma linha por pessoa pendente: a aba acima resume por curso,
            // esta é a que se usa para cobrar, porque traz o nome.
            const pendingPeopleRows = [];
            unitPendingDataCache.forEach(course => {
                (course.people || []).forEach(person => {
                    pendingPeopleRows.push({ course, person });
                });
            });
            XLSXLib.utils.book_append_sheet(wb, xlsTableSheet(XLSXLib, {
                title: 'Pendentes por colaborador',
                subtitle: 'Uma linha por pessoa que ainda não concluiu — não depende do filtro de data',
                columns: [
                    { header: 'Colaborador', width: 34, cell: (r) => ({ value: r.person.name, bold: true }) },
                    { header: 'Função', width: 26, cell: (r) => r.person.role || '—' },
                    { header: 'Curso', width: 44, cell: (r) => r.course.name },
                    { header: 'Assunto', width: 26, cell: (r) => r.course.subject },
                    { header: '% assistido', width: 13, cell: (r) => ({ value: `${r.person.pct}%`, tone: r.person.pct >= 75 ? 'ok' : r.person.pct > 0 ? 'warn' : 'bad', bold: true }) }
                ],
                rows: pendingPeopleRows.sort((a, b) =>
                    a.person.name.localeCompare(b.person.name, 'pt-BR') ||
                    a.course.name.localeCompare(b.course.name, 'pt-BR')),
                emptyMessage: 'Ninguém com curso pendente nesta unidade.'
            }), 'Pendentes por pessoa');

            const safeName = normalizeName(unitKey).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'unidade';
            const filename = `relatorio_unidade_${safeName}_${new Date().toISOString().split('T')[0]}.xlsx`;
            if (U.XlsxCharts && window.fflate) {
                const bytes = U.XlsxCharts.withCharts(XLSXLib, window.fflate, wb, 'Gráficos', chartsSheet.charts);
                U.XlsxCharts.download(bytes, filename);
            } else {
                XLSXLib.writeFile(wb, filename);
            }
            showWarning('Planilha baixada com sucesso!');
        } catch (error) {
            showWarning('Erro ao gerar planilha: ' + error.message);
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    document.getElementById('cfg-dash-unit-export-btn')?.addEventListener('click', exportUnitReport);

    function buildUnitSummarySheet(XLSXLib, unitKey, colaboradores, rows) {
        const matrix = [];
        const push = (cells) => {
            const line = cells.slice();
            while (line.length < 3) line.push(xlsCell(''));
            matrix.push(line);
        };
        const pairs = lastAttemptByPersonCourse(rows);
        const attempts = attemptsByPersonCourse(rows);
        const scores = rows.map(r => Number(r.score)).filter(Number.isFinite);
        const rated = ratedOnly(rows);
        const ratings = rated.map(r => Number(r.rating));
        const onTime = pairs.filter(r => isOnTime(r.deadlineStatus)).length;
        const approved = rows.filter(r => r.approved).length;
        const durations = rows.map(r => Number(r.durationSeconds)).filter(Number.isFinite);
        const actives = pairs.map(userCompletionDurationOf).filter(ms => Number.isFinite(ms) && ms > 0);

        matrix.push([xlsTitleCell(`Relatório da unidade ${unitKey}`), xlsTitleCell(''), xlsTitleCell('')]);
        matrix.push([xlsSubtitleCell(`${U.currentCategoryName || CATEGORY_LABELS[currentSlug()] || currentSlug()} • Período: ${unitReportPeriodLabel()} • ${unitReportRoleLabel()} • ${unitReportCourseLabel()}`), xlsSubtitleCell(''), xlsSubtitleCell('')]);
        push([]);

        push([xlsSectionCell('Identificação')]);
        [
            ['Unidade', unitKey],
            ['Colaboradores ativos', colaboradores.length],
            ['Categoria', U.currentCategoryName || CATEGORY_LABELS[currentSlug()] || currentSlug()],
            ['Período do relatório', unitReportPeriodLabel()],
            ['Recorte por função', unitReportRoleLabel()],
            ['Recorte por curso', unitReportCourseLabel()],
            ['Gerado em', new Date().toLocaleString('pt-BR')]
        ].forEach(([label, value]) => push([xlsLabelCell(label), xlsCell(value, { align: 'left' })]));

        const sections = [
            { section: 'Volume' },
            { label: 'Cursos concluídos (pessoa × curso)', value: pairs.length, tone: 'strong' },
            { label: 'Tentativas de prova', value: rows.length },
            { label: 'Aprovações', value: approved, tone: 'ok' },
            { label: 'Reprovações', value: rows.length - approved, tone: rows.length - approved > 0 ? 'bad' : undefined },
            { label: 'Taxa de aprovação', value: pctLabel(approved, rows.length), tone: 'strong' },

            { section: 'Notas' },
            { label: 'Média das notas', value: scores.length ? formatScore(mean(scores)) : '—', tone: 'strong' },
            { label: 'Maior nota', value: scores.length ? formatScore(Math.max(...scores)) : '—', tone: 'ok' },
            { label: 'Menor nota', value: scores.length ? formatScore(Math.min(...scores)) : '—', tone: 'bad' },

            { section: 'Prazo' },
            { label: 'Concluídos no prazo', value: onTime, tone: 'ok' },
            { label: 'Concluídos fora do prazo', value: pairs.length - onTime, tone: pairs.length - onTime > 0 ? 'bad' : undefined },
            { label: '% no prazo', value: pctLabel(onTime, pairs.length), tone: 'strong' },

            { section: 'Retentativas' },
            { label: 'Aprovado na 1ª tentativa', value: attempts.filter(a => a.approved && a.attempts === 1).length, tone: 'ok' },
            { label: 'Aprovado após retentativa', value: attempts.filter(a => a.approved && a.attempts > 1).length, tone: 'warn' },
            { label: 'Ainda reprovado', value: attempts.filter(a => !a.approved).length, tone: 'bad' },

            { section: 'Tempos' },
            { label: 'Tempo médio de prova', value: durations.length ? formatDuration(mean(durations)) : '—' },
            { label: 'Tempo médio de conclusão', value: actives.length ? formatHHMMSS(mean(actives)) : '—' },

            { section: 'Satisfação' },
            { label: 'Pesquisas respondidas', value: ratings.length },
            { label: 'Satisfação média', value: ratings.length ? `${mean(ratings).toFixed(1).replace('.', ',')}★` : '—', tone: 'strong' },
            { label: 'Comentários deixados', value: rows.filter(r => r.comment).length },

            { section: 'Pendências' },
            { label: 'Cursos pendentes', value: unitPendingDataCache.length, tone: unitPendingDataCache.length > 0 ? 'warn' : 'ok' },
            { label: 'Pessoas-curso em aberto', value: unitPendingDataCache.reduce((a, p) => a + p.missing, 0), tone: 'warn' }
        ];
        sections.forEach(item => {
            if (item.section) {
                push([]);
                push([xlsSectionCell(item.section)]);
                push([xlsHeaderCell('Indicador'), xlsHeaderCell('Valor')]);
                return;
            }
            push([xlsLabelCell(item.label), xlsCell(item.value, { tone: item.tone, bold: true, align: 'center' })]);
        });

        const ws = XLSXLib.utils.aoa_to_sheet(matrix);
        ws['!cols'] = [{ wch: 34 }, { wch: 22 }, { wch: 4 }];
        ws['!rows'] = [{ hpt: 28 }, { hpt: 17 }];
        ws['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } }
        ];
        return ws;
    }

    // ─── Modo: por curso ───
    // A categoria não é mais escolhida aqui: vale sempre a que está selecionada
    // nas Configurações. O tema (assunto-pai) vem de um popover e os assuntos
    // do tema aparecem como cards, no mesmo formato da plataforma do aluno.
    const subjectTrigger = document.getElementById('cfg-dash-subject-trigger');
    const subjectPopover = document.getElementById('cfg-dash-subject-popover');
    const subjectLabel = document.getElementById('cfg-dash-subject-label');
    const categoryLabel = document.getElementById('cfg-dash-category-label');
    const courseCardsBox = document.getElementById('cfg-dash-course-cards');

    const ALL_SUBJECTS_ID = '__all__';
    let selectedSubjectId = ALL_SUBJECTS_ID;
    let selectedCourseKey = null;

    function currentSlug() {
        return U.currentCategorySlug || 'treinamentos';
    }

    function currentTrainingData() {
        return allTrainingData[currentSlug()] || {};
    }

    function orderedSubjectIds() {
        const trainingData = currentTrainingData();
        return Object.keys(trainingData)
            .sort((a, b) => (trainingData[a]?.name || a).localeCompare(trainingData[b]?.name || b, 'pt-BR'));
    }

    function orderedThemes(subjectId) {
        const themes = currentTrainingData()[subjectId]?.themes || {};
        return Object.keys(themes)
            .map(themeId => ({ ...themes[themeId], id: themeId }))
            .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, 'pt-BR'));
    }

    function updateCategoryChip() {
        const slug = currentSlug();
        const name = U.currentCategoryName || CATEGORY_LABELS[slug] || slug;
        if (categoryLabel) categoryLabel.textContent = name;
    }

    function closeSubjectPopover() {
        subjectPopover?.classList.remove('active');
        subjectTrigger?.classList.remove('is-open');
    }

    function renderSubjectPopover() {
        subjectPopover.innerHTML = '';
        const subjectIds = orderedSubjectIds();
        if (subjectIds.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'dash-theme-popover-empty';
            empty.textContent = 'Nenhum tema cadastrado nesta categoria.';
            subjectPopover.appendChild(empty);
        } else {
            const totalThemes = subjectIds.reduce((sum, id) => sum + Object.keys(currentTrainingData()[id]?.themes || {}).length, 0);
            const allItem = document.createElement('button');
            allItem.type = 'button';
            allItem.className = 'dash-theme-popover-item';
            if (selectedSubjectId === ALL_SUBJECTS_ID) allItem.classList.add('is-selected');
            allItem.innerHTML = `<span class="dash-theme-popover-name">Todos os temas</span>
                <span class="dash-theme-popover-count">${totalThemes} ${totalThemes === 1 ? 'curso' : 'cursos'}</span>`;
            allItem.onclick = () => {
                selectSubject(ALL_SUBJECTS_ID);
                closeSubjectPopover();
            };
            subjectPopover.appendChild(allItem);

            subjectIds.forEach(subjectId => {
                const subject = currentTrainingData()[subjectId] || {};
                const count = Object.keys(subject.themes || {}).length;
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'dash-theme-popover-item';
                if (subjectId === selectedSubjectId) item.classList.add('is-selected');
                item.innerHTML = `<span class="dash-theme-popover-name">${escapeHtml(subject.name || subjectId)}</span>
                    <span class="dash-theme-popover-count">${count} ${count === 1 ? 'assunto' : 'assuntos'}</span>`;
                item.onclick = () => {
                    selectSubject(subjectId);
                    closeSubjectPopover();
                };
                subjectPopover.appendChild(item);
            });
        }
        subjectPopover.classList.add('active');
        subjectTrigger?.classList.add('is-open');
    }

    subjectTrigger?.addEventListener('click', (event) => {
        event.stopPropagation();
        if (subjectPopover.classList.contains('active')) closeSubjectPopover();
        else renderSubjectPopover();
    });
    document.addEventListener('click', (event) => {
        if (subjectPopover && !subjectPopover.contains(event.target) && !subjectTrigger?.contains(event.target)) {
            closeSubjectPopover();
        }
    });

    function selectSubject(subjectId) {
        selectedSubjectId = subjectId;
        selectedCourseKey = null;
        if (subjectId === ALL_SUBJECTS_ID) {
            subjectLabel.textContent = 'Todos os temas';
        } else {
            const subject = currentTrainingData()[subjectId] || {};
            subjectLabel.textContent = subject.name || subjectId;
        }
        closeCourseModal();
        renderCourseCards();
    }

    // ─── Público-alvo do curso (funções configuradas no assunto) ───
    // Sem funções marcadas = todos os colaboradores. A lista base é
    // /colaboradores (espelho da planilha), a mesma que alimenta o seletor
    // de funções do assunto.
    function courseAudience(theme) {
        const roles = Array.isArray(theme?.roles) ? theme.roles.filter(Boolean) : [];
        const roleKeys = new Set(roles.map(role => normalizeName(role)));
        return Object.keys(allColaboradores)
            .map(id => ({ id, ...allColaboradores[id] }))
            .filter(colab => colab.fullName)
            // Inativo (colab.active === false, mesmo critério da aba
            // Colaboradores) ou desvinculado da planilha (inSheet === false,
            // "inválido" — saiu da base oficial) não conta como público-alvo:
            // infla o denominador dos gráficos de conclusão com gente que já
            // não deveria mais fazer o curso.
            .filter(colab => colab.active !== false && colab.inSheet !== false)
            .filter(colab => roleKeys.size === 0 || roleKeys.has(normalizeName(colab.role || '')));
    }

    // Uma pessoa pode aparecer no histórico pela conta (userId) ou só pelo
    // nome (registros importados/sem conta) — as duas chaves são aceitas.
    function personKeysOfRow(row) {
        return [row.userId || null, row.fullName ? normalizeName(row.fullName) : null].filter(Boolean);
    }
    function personKeysOfColaborador(colab) {
        return [colab.accountUserId || null, normalizeName(colab.fullNameKey || colab.fullName || '')].filter(Boolean);
    }

    // Números do card: quantos fizeram, média e aprovação — do mesmo
    // historyRows usado pelos gráficos, para não divergir. Quando a
    // categoria tem público-alvo (tudo menos estágios), também conta
    // quantos do público já realizaram o curso.
    function courseStats(subjectId, theme) {
        const slug = currentSlug();
        const themeId = typeof theme === 'string' ? theme : theme?.id;
        const rows = fetchCourseResults(slug, subjectId, themeId);
        const scores = rows.map(r => Number(r.score) || 0);
        const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
        const approved = rows.filter(r => r.approved).length;

        let audienceTotal = null;
        let audienceDone = null;
        if (typeof theme === 'object' && theme && !AUDIENCE_EXEMPT_SLUGS.includes(slug)) {
            const doneKeys = new Set();
            rows.forEach(row => personKeysOfRow(row).forEach(key => doneKeys.add(key)));
            const audience = courseAudience(theme);
            audienceTotal = audience.length;
            audienceDone = audience.filter(colab => personKeysOfColaborador(colab).some(key => doneKeys.has(key))).length;
        }

        return {
            attempts: rows.length,
            avg,
            approvalPct: rows.length ? Math.round((approved / rows.length) * 100) : null,
            audienceTotal,
            audienceDone,
            audiencePct: audienceTotal ? Math.round((audienceDone / audienceTotal) * 100) : null
        };
    }

    // Barra "x de N do público já fizeram" + quem falta. O público vem das
    // funções configuradas no assunto (ou todos, se nenhuma foi marcada).
    function audienceHtml(theme, stats) {
        if (stats.audienceTotal === null) return '';
        const roles = Array.isArray(theme?.roles) ? theme.roles.filter(Boolean) : [];
        const scope = roles.length === 0
            ? 'todas as funções'
            : roles.length === 1 ? roles[0] : `${roles.length} funções`;
        if (stats.audienceTotal === 0) {
            return `<div class="dash-course-audience is-empty">
                <span class="dash-course-audience-label">Nenhum colaborador em ${escapeHtml(scope)}</span>
            </div>`;
        }
        const missing = stats.audienceTotal - stats.audienceDone;
        return `<div class="dash-course-audience">
            <div class="dash-course-audience-top">
                <span class="dash-course-audience-label"><i class="fas fa-user-check"></i> ${stats.audienceDone}/${stats.audienceTotal} assistiram &bull; ${escapeHtml(scope)}</span>
                <strong class="dash-course-audience-pct">${stats.audiencePct}%</strong>
            </div>
            <div class="dash-course-audience-bar"><span style="width:${stats.audiencePct}%"></span></div>
            <span class="dash-course-audience-missing">${missing === 0 ? 'Todos do público já realizaram.' : `${missing} ${missing === 1 ? 'pessoa falta' : 'pessoas faltam'} realizar`}</span>
        </div>`;
    }

    function themeInitials(name) {
        return String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
    }

    function buildCourseCard(subjectId, theme, subjectName) {
        const slug = currentSlug();
        const courseKey = `${subjectId}_${theme.id}`;
        const stats = courseStats(subjectId, theme);
        const modules = (theme.modules || []).length;
        const questions = (allQuizData[slug]?.[courseKey] || []).length;

        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'dash-course-card';
        if (courseKey === selectedCourseKey) card.classList.add('is-selected');

        const thumb = document.createElement('div');
        thumb.className = 'dash-course-thumb';
        const imageSrc = window.UniAdminImages
            ? window.UniAdminImages.resolve(slug, subjectId, theme.id, theme)
            : (theme.image || null);
        if (imageSrc) {
            const img = document.createElement('img');
            img.src = imageSrc;
            img.alt = theme.name || '';
            img.loading = 'lazy';
            img.onerror = () => { thumb.textContent = themeInitials(theme.name); };
            thumb.appendChild(img);
        } else {
            thumb.textContent = themeInitials(theme.name);
        }

        const body = document.createElement('div');
        body.className = 'dash-course-body';
        body.innerHTML = `
            ${subjectName ? `<span class="dash-course-subject-tag"><i class="fas fa-layer-group"></i> ${escapeHtml(subjectName)}</span>` : ''}
            <h3>${escapeHtml(theme.name || theme.id)}</h3>
            <p class="dash-course-desc${theme.description ? '' : ' is-empty'}">${escapeHtml(theme.description || 'Sem descrição cadastrada para este curso.')}</p>
            <div class="dash-course-meta">
                <span><i class="fas fa-play-circle"></i> ${modules} ${modules === 1 ? 'módulo' : 'módulos'}</span>
                <span><i class="fas fa-clipboard-list"></i> ${questions} ${questions === 1 ? 'questão' : 'questões'}</span>
            </div>
            <div class="dash-course-stats">
                <span><i class="fas fa-users"></i> ${stats.attempts} ${stats.attempts === 1 ? 'realização' : 'realizações'}</span>
                <span><i class="fas fa-star"></i> Média ${stats.avg === null ? '—' : stats.avg.toFixed(1).replace('.', ',')}</span>
                <span><i class="fas fa-circle-check"></i> ${stats.approvalPct === null ? '—' : stats.approvalPct + '% aprovação'}</span>
            </div>
            ${audienceHtml(theme, stats)}`;

        card.appendChild(thumb);
        card.appendChild(body);
        card.onclick = () => {
            selectedCourseKey = courseKey;
            courseCardsBox.querySelectorAll('.dash-course-card').forEach(c => c.classList.remove('is-selected'));
            card.classList.add('is-selected');
            openCourseModal(slug, courseKey, theme.name || theme.id, { theme, thumb: imageSrc || null });
        };
        return card;
    }

    // Mensagem exibida no lugar dos cards enquanto a base não chegou. Falha de
    // carga tem texto próprio: deixar "Carregando…" para sempre esconderia o
    // erro, e cair no vazio ("Nenhum tema cadastrado") afirmaria algo falso
    // sobre o conteúdo.
    function pendingCardsHtml() {
        return baseLoadFailed
            ? '<p class="dashboard-table-empty">Não foi possível carregar os dados do dashboard.</p>'
            : '<p class="dashboard-table-empty">Carregando dados…</p>';
    }

    function renderCourseCards() {
        if (!courseCardsBox) return;
        courseCardsBox.innerHTML = '';
        const inCourseMode = dashMode === 'course';
        if (!selectedSubjectId || !inCourseMode) { courseCardsBox.style.display = 'none'; return; }

        const empty = document.getElementById('cfg-dash-empty');

        if (!baseDataLoaded) {
            courseCardsBox.style.display = 'block';
            if (empty) empty.style.display = 'none';
            courseCardsBox.innerHTML = pendingCardsHtml();
            return;
        }

        if (selectedSubjectId === ALL_SUBJECTS_ID) {
            const subjectIds = orderedSubjectIds();
            const cards = [];
            subjectIds.forEach(subjectId => {
                const subject = currentTrainingData()[subjectId] || {};
                orderedThemes(subjectId).forEach(theme => cards.push({ subjectId, theme, subjectName: subject.name || subjectId }));
            });
            courseCardsBox.style.display = cards.length ? 'grid' : 'block';
            if (empty) empty.style.display = 'none';
            if (cards.length === 0) {
                courseCardsBox.innerHTML = '<p class="dashboard-table-empty">Nenhum tema cadastrado nesta categoria.</p>';
                return;
            }
            cards.forEach(({ subjectId, theme, subjectName }) => courseCardsBox.appendChild(buildCourseCard(subjectId, theme, subjectName)));
            return;
        }

        const themes = orderedThemes(selectedSubjectId);
        courseCardsBox.style.display = themes.length ? 'grid' : 'block';
        // Com os cards na tela o estado vazio vira ruído: o próprio grid já diz
        // o que falta fazer (escolher um assunto).
        if (empty) empty.style.display = 'none';
        if (themes.length === 0) {
            courseCardsBox.innerHTML = '<p class="dashboard-table-empty">Nenhum assunto cadastrado neste tema.</p>';
            return;
        }
        themes.forEach(theme => courseCardsBox.appendChild(buildCourseCard(selectedSubjectId, theme)));
    }

    // Troca de categoria nas Configurações: o dashboard acompanha.
    document.addEventListener('uniadmin:category-changed', () => {
        selectedSubjectId = ALL_SUBJECTS_ID;
        selectedCourseKey = null;
        if (subjectLabel) subjectLabel.textContent = 'Todos os temas';
        closeSubjectPopover();
        updateCategoryChip();
        renderCourseCards();
        closeCourseModal();
        // Os cards de colaborador também são recortados pela categoria (ver
        // flattenColaboradorResults): sem repintar, "x cursos" e a média
        // continuariam com os números da categoria anterior.
        renderUserCards();
        // O modal do colaborador é todo recortado pela categoria — fecha
        // junto para não ficar mostrando histórico, gráficos e comentários
        // da categoria antiga.
        closeUserModal();
        // A unidade segue a mesma regra: os cursos, as pendências e o
        // público-alvo são todos da categoria selecionada.
        renderUnitCards();
        closeUnitModal();
    });

    // Linhas do curso selecionado — casadas por IDs (contas reais e
    // estágios livres, que têm subjectId/themeId) ou, na falta deles, pelo
    // nome normalizado de assunto/tema (registros importados de planilha,
    // que não têm vínculo com trainingData).
    function fetchCourseResults(slug, subjectId, themeId) {
        const theme = allTrainingData[slug]?.[subjectId]?.themes?.[themeId];
        const subject = allTrainingData[slug]?.[subjectId];
        const nameKey = theme ? normalizeName(`${subject?.name || ''}|${theme.name || ''}`) : null;

        return historyRows.filter(r => {
            if (r.slug !== slug) return false;
            if (r.subjectId && r.themeId) return r.subjectId === subjectId && r.themeId === themeId;
            return nameKey && normalizeName(`${r.subject}|${r.theme}`) === nameKey;
        });
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }

    // Estrelas douradas, crescentes da esquerda para a direita (as
    // preenchidas vêm primeiro, as vazias completam até 5).
    function starsHtml(rating) {
        const n = Math.max(0, Math.min(5, Number(rating) || 0));
        let html = '<span class="comment-stars" aria-label="' + n + ' de 5 estrelas">';
        for (let i = 1; i <= 5; i++) {
            html += `<i class="fas fa-star ${i <= n ? 'is-filled' : 'is-empty'}"></i>`;
        }
        html += '</span>';
        return html;
    }

    const COMMENTS_PAGE_SIZE = 5;
    let commentsPage = 1;
    let commentsRowsCache = [];
    // Comentários filtrados pelas unidades marcadas no chip (vazio = todas).
    // O índice do card aponta pra esta lista, não pro cache completo.
    let commentsVisibleRows = [];

    function commentUnitOf(row) { return row.unit || 'Sem unidade'; }

    function filteredCommentRows() {
        const units = commentsUnitChip ? commentsUnitChip.getValues() : null;
        if (!units || units.size === 0) return commentsRowsCache;
        return commentsRowsCache.filter(r => units.has(commentUnitOf(r)));
    }

    function renderCommentsPagination(totalPages) {
        const pager = document.getElementById('cfg-dash-course-comments-pagination');
        if (!pager) return;
        if (totalPages <= 1) { pager.innerHTML = ''; return; }
        let html = `<button type="button" class="comments-page-btn" data-page="prev" ${commentsPage === 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>`;
        html += `<span class="comments-page-info">Página ${commentsPage} de ${totalPages}</span>`;
        html += `<button type="button" class="comments-page-btn" data-page="next" ${commentsPage === totalPages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>`;
        pager.innerHTML = html;
        pager.querySelectorAll('.comments-page-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                commentsPage += btn.dataset.page === 'prev' ? -1 : 1;
                paintCommentsPage();
            });
        });
    }

    function paintCommentsPage() {
        const container = document.getElementById('cfg-dash-course-comments');
        const rows = filteredCommentRows();
        commentsVisibleRows = rows;
        if (rows.length === 0) {
            container.innerHTML = '<p class="dashboard-table-empty">Nenhum comentário nas unidades selecionadas.</p>';
            renderCommentsPagination(1);
            return;
        }
        const totalPages = Math.max(1, Math.ceil(rows.length / COMMENTS_PAGE_SIZE));
        commentsPage = Math.min(Math.max(1, commentsPage), totalPages);
        const start = (commentsPage - 1) * COMMENTS_PAGE_SIZE;
        const pageRows = rows.slice(start, start + COMMENTS_PAGE_SIZE);

        container.innerHTML = `<div class="comment-cards">${pageRows.map((r, i) => {
            const n = Number(r.rating) || 0;
            const ratingClass = n >= 4 ? 'rating-high' : n === 3 ? 'rating-mid' : 'rating-low';
            return `
            <div class="comment-card ${ratingClass} is-clickable" data-row-i="${start + i}" title="Ver detalhes da avaliação">
                <div class="comment-card-head">
                    <span class="comment-card-head-left">
                        <span class="comment-card-name"><i class="fas fa-user-circle"></i> ${escapeHtml(r.fullName)}</span>
                        <span class="comment-card-unit"><i class="fas fa-building"></i> ${escapeHtml(commentUnitOf(r))}</span>
                    </span>
                    <span class="comment-card-rating">${scoreBadgeGradientHtml(r.score)}${starsHtml(r.rating)}</span>
                </div>
                <p class="comment-card-text ${r.comment ? '' : 'is-empty'}">${r.comment ? escapeHtml(r.comment) : 'Em branco'}</p>
                ${r.comment ? '<span class="comment-card-more" data-action="toggle-comment">Ver mais</span>' : ''}
            </div>`;
        }).join('')}</div>`;
        container.querySelectorAll('.comment-card-more').forEach(btn => {
            btn.addEventListener('click', (event) => {
                event.stopPropagation();
                const text = btn.previousElementSibling;
                const expanded = text.classList.toggle('is-expanded');
                btn.textContent = expanded ? 'Ver menos' : 'Ver mais';
            });
        });
        container.querySelectorAll('.comment-card.is-clickable').forEach(card => {
            card.addEventListener('click', () => {
                const row = commentsVisibleRows[Number(card.dataset.rowI)];
                if (row) openReviewModal(row);
            });
        });
        renderCommentsPagination(totalPages);
    }

    function renderCommentsTable(rows) {
        const container = document.getElementById('cfg-dash-course-comments');
        const pager = document.getElementById('cfg-dash-course-comments-pagination');
        // Entra todo mundo que deixou comentário (qualquer nota) e, além
        // disso, quem deixou o campo em branco mas avaliou com nota baixa
        // (≤3★) — campo em branco com nota alta não precisa de atenção.
        commentsRowsCache = rows.filter(r => r.comment || (Number(r.rating) || 0) <= 3)
            .sort((a, b) => (Number(a.rating) || 0) - (Number(b.rating) || 0));
        commentsPage = 1;
        // Só as unidades que realmente têm comentário entram no filtro:
        // listar unidade sem comentário daria opção que não filtra nada.
        commentsUnitChip?.setOptions([...new Set(commentsRowsCache.map(commentUnitOf))]
            .sort((a, b) => a.localeCompare(b, 'pt-BR')));
        if (commentsRowsCache.length === 0) {
            commentsVisibleRows = [];
            container.innerHTML = '<p class="dashboard-table-empty">Nenhum comentário registrado para este curso.</p>';
            if (pager) pager.innerHTML = '';
            return;
        }
        paintCommentsPage();
    }

    // Filtro por unidade dos comentários: mesmo popover multi-seleção dos
    // gráficos, com "Limpar filtro" no topo. Trocar a seleção volta pra
    // página 1 (senão a paginação podia apontar pra página vazia).
    const commentsUnitChip = createMultiFilterChip('cfg-dash-course-comments-unit-chip', 'cfg-dash-course-comments-unit-list', () => {
        commentsPage = 1;
        paintCommentsPage();
    });

    document.getElementById('cfg-dash-course-comments-unit-clear')?.addEventListener('click', (event) => {
        event.stopPropagation();
        commentsUnitChip.clear();
        commentsPage = 1;
        paintCommentsPage();
    });

    // ─── Modal de detalhe da avaliação (clique num comentário) ───
    // Mostra quem é o aluno (unidade, cargo, média geral e total de cursos
    // entre TODOS os cursos que já fez) ao lado da avaliação específica deste
    // curso (nota, estrelas, comentário e as questões que errou/acertou).
    const reviewModal = document.getElementById('cfg-dash-review-modal');
    const reviewModalClose = document.getElementById('cfg-dash-review-modal-close');

    function closeReviewModal() { if (reviewModal) reviewModal.style.display = 'none'; }

    // Cadastro do curso (certificateEnabled/Title/Hours/Topics), lido direto
    // de allTrainingData (já carregado em memória) — mesma fonte usada pelo
    // resto do painel, sem precisar de fetch assíncrono como em admin-history.js.
    function courseCadastroForRow(row) {
        if (!row.slug || !row.subjectId || !row.themeId) return null;
        return allTrainingData[row.slug]?.[row.subjectId]?.themes?.[row.themeId] || null;
    }

    function renderReviewCertificateButton(row) {
        const holder = document.getElementById('cfg-dash-review-cert');
        if (!holder) return;
        holder.innerHTML = '';
        if (!row.approved) return;

        const course = courseCadastroForRow(row);
        if (!U.Certificate?.isEnabled(course)) return;

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

    // Acha o cadastro do colaborador dono de uma linha de histórico, pela
    // mesma chave (conta ou nome normalizado) usada no resto do dashboard.
    function findColaboradorForRow(row) {
        const keys = new Set(personKeysOfRow(row));
        const entry = Object.entries(allColaboradores).find(([, colab]) => personKeysOfColaborador(colab).some(key => keys.has(key)));
        return entry ? { id: entry[0], colab: entry[1] } : null;
    }

    function openReviewModal(row) {
        if (!reviewModal) return;
        const found = findColaboradorForRow(row);
        const colab = found?.colab || { fullName: row.fullName, unit: row.unit, role: row.role };

        const allRows = found ? flattenColaboradorResults(colab) : [row];
        const scores = allRows.map(r => Number(r.score) || 0);
        const overallAvg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
        const ratedRows = allRows.filter(r => r.rating);
        const ratingAvg = ratedRows.length ? ratedRows.reduce((a, r) => a + (Number(r.rating) || 0), 0) / ratedRows.length : null;
        const courseCount = new Set(allRows.map(rowCourseKey)).size;

        const titleEl = document.getElementById('cfg-dash-review-modal-title');
        if (titleEl) titleEl.textContent = colab.fullName || 'Colaborador';
        const avatarEl = document.getElementById('cfg-dash-review-avatar');
        if (avatarEl) avatarEl.textContent = themeInitials(colab.fullName || '?');
        const tagsEl = document.getElementById('cfg-dash-review-student-tags');
        if (tagsEl) {
            tagsEl.innerHTML = `
                ${colab.role ? `<span class="dash-course-subject-tag"><i class="fas fa-briefcase"></i> ${escapeHtml(colab.role)}</span>` : ''}
                ${colab.unit ? `<span class="dash-course-subject-tag"><i class="fas fa-building"></i> ${escapeHtml(colab.unit)}</span>` : ''}`;
        }
        const statsEl = document.getElementById('cfg-dash-review-stats');
        if (statsEl) {
            statsEl.innerHTML = `
                <div class="dash-review-stat"><i class="fas fa-layer-group"></i><div><b>${courseCount}</b><span>${courseCount === 1 ? 'curso realizado' : 'cursos realizados'}</span></div></div>
                <div class="dash-review-stat"><i class="fas fa-chart-line"></i><div><b>${overallAvg === null ? '—' : formatScore(overallAvg)}</b><span>média geral</span></div></div>
                <div class="dash-review-stat"><i class="fas fa-star"></i><div><b>${ratingAvg === null ? '—' : ratingAvg.toFixed(1).replace('.', ',')}</b><span>média de avaliação</span></div></div>`;
        }

        const courseNameEl = document.getElementById('cfg-dash-review-course-name');
        if (courseNameEl) courseNameEl.textContent = row.theme || row.subject || '';
        const summaryEl = document.getElementById('cfg-dash-review-summary-grid');
        if (summaryEl) {
            const dateLabel = row.submittedAt ? new Date(row.submittedAt).toLocaleString('pt-BR') : '—';
            const activeMs = row.userId ? allProgress[row.userId]?.[row.slug]?.[row.subjectId]?.[row.themeId]?.activeMs : null;
            const completionLabel = formatHHMMSS(activeMs);
            summaryEl.innerHTML = `
                <div class="dash-review-summary-item">${scoreBadgeHtml(row.score)}<span>Nota da prova</span></div>
                <div class="dash-review-summary-item">${starsHtml(row.rating)}<span>Avaliação do curso</span></div>
                <div class="dash-review-summary-item"><span class="conclusion-situation ${row.approved ? 'is-ok' : 'is-bad'}"><i class="fas ${row.approved ? 'fa-circle-check' : 'fa-circle-xmark'}"></i> ${row.approved ? 'Aprovado' : 'Reprovado'}</span><span>Situação</span></div>
                <div class="dash-review-summary-item"><span class="dash-review-date"><i class="fas fa-calendar"></i> ${dateLabel}</span><span>Data</span></div>
                <div class="dash-review-summary-item"><span class="dash-review-date"><i class="fas fa-stopwatch"></i> ${formatDuration(row.durationSeconds)}</span><span>Tempo de prova</span></div>
                <div class="dash-review-summary-item"><span class="dash-review-date"><i class="fas fa-hourglass-end"></i> ${completionLabel}</span><span>Tempo de conclusão</span></div>`;
        }
        const commentEl = document.getElementById('cfg-dash-review-comment');
        if (commentEl) {
            commentEl.innerHTML = row.comment
                ? `<i class="fas fa-quote-left"></i><p>${escapeHtml(row.comment)}</p>`
                : `<p class="dash-review-no-comment">Nenhum comentário deixado.</p>`;
        }

        renderReviewCertificateButton(row);

        const questionsSection = document.getElementById('cfg-dash-review-questions-section');
        const questionsEl = document.getElementById('cfg-dash-review-questions');
        if (questionsEl) {
            const answers = row.answers || [];
            const wrongAnswers = answers
                .map((a, idx) => ({ a, idx }))
                .filter(({ a }) => a.selected !== a.correct);

            // Só mostra questões erradas — quem acertou tudo não tem nada a
            // revisar aqui, então a seção inteira fica oculta.
            if (questionsSection) questionsSection.style.display = wrongAnswers.length === 0 ? 'none' : '';

            questionsEl.innerHTML = wrongAnswers.map(({ a, idx }) => `
                <div class="history-detail-question is-wrong">
                    <div class="q-title wrong">
                        <i class="fas fa-circle-xmark"></i>
                        <span>${idx + 1}. ${escapeHtml(a.question)}</span>
                    </div>
                    ${(a.options || []).map((opt, optIdx) => {
                        const wasSelected = optIdx === a.selected;
                        const isKey = optIdx === a.correct;
                        let cls = 'q-option';
                        if (wasSelected && isKey) cls += ' was-selected is-right';
                        else if (wasSelected && !isKey) cls += ' was-selected is-wrong';
                        else if (isKey) cls += ' is-answer-key';
                        const marker = wasSelected ? '<i class="fas fa-arrow-right" style="margin-right:6px;"></i>' : '';
                        const keyMarker = isKey ? ' <i class="fas fa-check" style="margin-left:6px;"></i>' : '';
                        return `<div class="${cls}">${marker}${escapeHtml(opt)}${keyMarker}</div>`;
                    }).join('')}
                </div>`).join('');
        }

        reviewModal.style.display = 'flex';
    }

    reviewModalClose?.addEventListener('click', closeReviewModal);
    reviewModal?.addEventListener('click', (event) => { if (event.target === reviewModal) closeReviewModal(); });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && reviewModal?.style.display === 'flex') closeReviewModal();
    });

    // ─── Aba Conclusões: quem já concluiu x quem falta ───

    // Avatar com iniciais coloridas (mesmo critério de hash usado no card do
    // curso — cor estável por nome, sem precisar de foto).
    function avatarHtml(name) {
        let hash = 0;
        const str = name || '?';
        for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) % 360;
        return `<span class="row-avatar" style="--avatar-hue:${hash};">${escapeHtml(themeInitials(name))}</span>`;
    }

    function deadlineBadgeHtml(status) {
        const label = U.Deadlines.STATUS_LABELS[status] || status || '—';
        const toneMap = { on_time: 'is-good', livre: 'is-neutral', forgiven: 'is-neutral', not_started: 'is-neutral', late: 'is-mid', closed: 'is-bad' };
        const tone = toneMap[status] || 'is-neutral';
        const iconMap = { on_time: 'fa-check', late: 'fa-triangle-exclamation', closed: 'fa-ban', forgiven: 'fa-calendar-check' };
        const icon = iconMap[status] || 'fa-circle-minus';
        return `<span class="deadline-pill ${tone}"><i class="fas ${icon}"></i> ${escapeHtml(label)}</span>`;
    }

    // "Aprovados" / "Reprovados": uma linha por realização, ordenado da mais
    // recente para a mais antiga, com busca por nome — cada situação com sua
    // própria tabela (antes era uma lista só com filtro de situação).
    let completedRowsCache = [];
    let completedSearchTerm = '';
    let reprovedRowsCache = [];
    let reprovedSearchTerm = '';
    let reprovedCriticalOnly = false;
    let conclusionsCourseIds = { slug: '', subjectId: '', themeId: '' };

    function conclusionRowHtml(r, i) {
        const dateLabel = r.submittedAt ? new Date(r.submittedAt).toLocaleString('pt-BR') : '—';
        const situationOk = !!r.approved;
        const { slug, subjectId, themeId } = conclusionsCourseIds;
        const canForgive = !situationOk && r.userId && (r.deadlineStatus === 'late' || r.deadlineStatus === 'closed');
        const activeMs = r.userId ? allProgress[r.userId]?.[r.slug]?.[r.subjectId]?.[r.themeId]?.activeMs : null;
        // `data-label` alimenta o modo card do mobile (css/mobile.css secao 8.1),
        // onde a tabela perde o cabecalho e cada celula precisa se apresentar
        // sozinha. No desktop o atributo nao tem efeito visual.
        return `<tr style="--row-i:${i}" class="is-clickable" data-row-i="${i}" title="Ver detalhes">
            <td data-label="Data/Hora">${dateLabel}</td>
            <td data-label="Nome"><span class="row-name">${avatarHtml(r.fullName)} ${escapeHtml(r.fullName)}</span></td>
            <td data-label="Unidade">${escapeHtml(r.unit || '—')}</td>
            <td data-label="Cargo">${escapeHtml(r.role || '—')}</td>
            <td data-label="Prazo">${deadlineBadgeHtml(r.deadlineStatus)}</td>
            <td data-label="Nota">${scoreBadgeHtml(r.score)}</td>
            <td data-label="Tempo">${formatDuration(r.durationSeconds)}</td>
            <td data-label="Conclusão">${formatHHMMSS(activeMs)}</td>
            <td data-label="Situação"><span class="conclusion-situation ${situationOk ? 'is-ok' : 'is-bad'}"><i class="fas ${situationOk ? 'fa-circle-check' : 'fa-circle-xmark'}"></i> ${situationOk ? 'Aprovado' : 'Reprovado'}</span></td>
            <td>${canForgive ? `<button class="dash-forgive-btn" data-user-id="${escapeHtml(r.userId)}" data-slug="${slug}" data-subject-id="${subjectId}" data-theme-id="${themeId}">Desconsiderar atraso</button>` : ''}</td>
        </tr>`;
    }

    // Ordenação por coluna das tabelas de Aprovados/Reprovados: clicar no
    // título ordena por aquela coluna, clicar de novo inverte. Cada tabela
    // guarda sua própria ordenação (o mesmo paint serve as duas), e `null`
    // significa a ordem natural do cache — mais recente primeiro.
    const CONCLUSION_COLUMNS = [
        { key: 'date', label: 'Data/Hora', numeric: true, value: (r) => r.submittedAt || 0 },
        { key: 'name', label: 'Nome', value: (r) => r.fullName || '' },
        { key: 'unit', label: 'Unidade', value: (r) => r.unit || '' },
        { key: 'role', label: 'Cargo', value: (r) => r.role || '' },
        { key: 'deadline', label: 'Prazo', value: (r) => U.Deadlines.STATUS_LABELS[r.deadlineStatus] || r.deadlineStatus || '' },
        { key: 'score', label: 'Nota', numeric: true, value: (r) => Number(r.score) },
        { key: 'duration', label: 'Tempo', numeric: true, value: (r) => Number(r.durationSeconds) },
        // "Conclusão" não está na linha do histórico: vem do activeMs gravado
        // em progress/byUser, a mesma leitura que a célula faz.
        { key: 'active', label: 'Conclusão', numeric: true, value: (r) => Number(r.userId ? allProgress[r.userId]?.[r.slug]?.[r.subjectId]?.[r.themeId]?.activeMs : NaN) },
        { key: 'situation', label: 'Situação', numeric: true, value: (r) => (r.approved ? 1 : 0) }
    ];

    const conclusionSort = {};

    function sortedConclusionRows(containerId, rows) {
        const sort = conclusionSort[containerId];
        if (!sort) return rows;
        const column = CONCLUSION_COLUMNS.find(c => c.key === sort.key);
        if (!column) return rows;
        const dir = sort.dir === 'asc' ? 1 : -1;
        return rows.slice().sort((a, b) => {
            const va = column.value(a);
            const vb = column.value(b);
            if (column.numeric) {
                // Sem valor (prova sem tempo gravado, por ex.) sempre por
                // último, independente da direção — senão a coluna começa
                // com uma pilha de tracinhos (—).
                const aOk = Number.isFinite(va);
                const bOk = Number.isFinite(vb);
                if (!aOk || !bOk) return aOk === bOk ? 0 : (aOk ? -1 : 1);
                return (va - vb) * dir;
            }
            return String(va).localeCompare(String(vb), 'pt-BR', { sensitivity: 'base' }) * dir;
        });
    }

    function conclusionHeadHtml(containerId) {
        const sort = conclusionSort[containerId];
        const ths = CONCLUSION_COLUMNS.map(col => {
            const active = sort && sort.key === col.key;
            const icon = active ? (sort.dir === 'asc' ? 'fa-arrow-up' : 'fa-arrow-down') : 'fa-sort';
            return `<th class="is-sortable ${active ? 'is-sorted' : ''}" data-sort-key="${col.key}" title="Ordenar por ${escapeHtml(col.label)}">
                ${escapeHtml(col.label)} <i class="fas ${icon}"></i>
            </th>`;
        }).join('');
        return `<thead><tr>${ths}<th></th></tr></thead>`;
    }

    // Qual repaint chamar depois de trocar a ordenação de cada tabela — as
    // duas passam pelo mesmo paint, mas cada uma tem seus próprios filtros
    // (busca, "Críticos") que precisam ser reaplicados.
    const CONCLUSION_REPAINT = {
        'cfg-dash-course-completed': () => paintCompletedPage(),
        'cfg-dash-course-reproved': () => paintReprovedPage()
    };

    function bindConclusionSort(container, containerId) {
        container.querySelectorAll('th.is-sortable').forEach(th => {
            th.addEventListener('click', () => {
                const key = th.dataset.sortKey;
                const current = conclusionSort[containerId];
                const column = CONCLUSION_COLUMNS.find(c => c.key === key);
                if (current && current.key === key) {
                    conclusionSort[containerId] = { key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
                } else {
                    // Primeiro clique: texto começa em A-Z, número/data começa
                    // do maior (nota mais alta, realização mais recente).
                    conclusionSort[containerId] = { key, dir: column?.numeric ? 'desc' : 'asc' };
                }
                CONCLUSION_REPAINT[containerId]?.();
            });
        });
    }

    function paintConclusionsTable(containerId, rowsCache, searchTerm, emptyIcon, emptyMessage) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const filtered = searchTerm
            ? rowsCache.filter(r => normalizeName(r.fullName || '').includes(normalizeName(searchTerm)))
            : rowsCache;

        if (rowsCache.length === 0) {
            container.innerHTML = emptyStateHtml(emptyIcon, emptyMessage);
            return;
        }
        if (filtered.length === 0) {
            container.innerHTML = emptyStateHtml('fa-search', 'Nenhum resultado para essa busca.');
            return;
        }

        const ordered = sortedConclusionRows(containerId, filtered);
        container.innerHTML = `<table class="is-sticky dash-cards">
            ${conclusionHeadHtml(containerId)}
            <tbody>${ordered.map((r, i) => conclusionRowHtml(r, i)).join('')}</tbody>
        </table>`;
        bindConclusionSort(container, containerId);

        container.querySelectorAll('.dash-forgive-btn').forEach(btn => {
            btn.addEventListener('click', (event) => {
                event.stopPropagation();
                handleForgiveDeadline(btn.dataset);
            });
        });
        container.querySelectorAll('tr.is-clickable').forEach(tr => {
            tr.addEventListener('click', () => openReviewModal(ordered[Number(tr.dataset.rowI)]));
        });
    }

    function paintCompletedPage() {
        paintConclusionsTable('cfg-dash-course-completed', completedRowsCache, completedSearchTerm, 'fa-clipboard-check', 'Ninguém foi aprovado neste curso ainda.');
    }

    function paintReprovedPage() {
        const rows = reprovedCriticalOnly ? reprovedRowsCache.filter(r => Number(r.score) < 6) : reprovedRowsCache;
        const emptyMessage = reprovedCriticalOnly ? 'Nenhuma reprovação crítica (nota abaixo de 6) registrada para este curso.' : 'Nenhuma reprovação registrada para este curso.';
        paintConclusionsTable('cfg-dash-course-reproved', rows, reprovedSearchTerm, 'fa-circle-xmark', emptyMessage);
    }

    function renderCompletedTable(rows, slug, subjectId, themeId) {
        conclusionsCourseIds = { slug, subjectId, themeId };
        // Curso novo abre na ordem padrão (mais recente primeiro), sem herdar
        // a coluna que estava ordenada no curso anterior.
        delete conclusionSort['cfg-dash-course-completed'];
        delete conclusionSort['cfg-dash-course-reproved'];
        const sorted = rows.slice().sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
        completedRowsCache = sorted.filter(r => r.approved);
        reprovedRowsCache = sorted.filter(r => !r.approved);
        reprovedCriticalOnly = false;
        document.getElementById('cfg-dash-course-reproved-critical')?.classList.remove('is-active');
        paintCompletedPage();
        paintReprovedPage();
    }

    document.getElementById('cfg-dash-course-completed-search')?.addEventListener('input', (e) => {
        completedSearchTerm = e.target.value;
        paintCompletedPage();
    });

    document.getElementById('cfg-dash-course-reproved-search')?.addEventListener('input', (e) => {
        reprovedSearchTerm = e.target.value;
        paintReprovedPage();
    });

    document.getElementById('cfg-dash-course-reproved-critical')?.addEventListener('click', (e) => {
        reprovedCriticalOnly = !reprovedCriticalOnly;
        e.currentTarget.classList.toggle('is-active', reprovedCriticalOnly);
        paintReprovedPage();
    });

    // Progresso (%) de um colaborador neste curso, lido de progress/byUser.
    function progressPctFor(colab, slug, subjectId, themeId) {
        const userId = colab.accountUserId;
        if (!userId) return 0;
        const entry = allProgress[userId]?.[slug]?.[subjectId]?.[themeId];
        return entry?.pct || 0;
    }

    function progressToneClass(pct) {
        if (pct >= 75) return 'is-high';
        if (pct >= 40) return 'is-mid';
        return 'is-low';
    }

    function emptyStateHtml(icon, message) {
        return `<div class="dashboard-empty-state"><i class="fas ${icon}"></i><p>${escapeHtml(message)}</p></div>`;
    }

    let missingRowsCache = [];
    let missingSearchTerm = '';

    function paintMissingTable() {
        const container = document.getElementById('cfg-dash-course-missing');
        if (!container) return;
        const filtered = missingSearchTerm
            ? missingRowsCache.filter(m => normalizeName(m.fullName || '').includes(normalizeName(missingSearchTerm)))
            : missingRowsCache;

        if (missingRowsCache.length === 0) {
            container.innerHTML = emptyStateHtml('fa-trophy', 'Todos do público-alvo já concluíram este curso.');
            return;
        }
        if (filtered.length === 0) {
            container.innerHTML = emptyStateHtml('fa-search', 'Nenhum resultado para essa busca.');
            return;
        }

        container.innerHTML = `<table class="is-sticky dash-cards">
            <thead><tr><th>Nome</th><th>Unidade</th><th>Progresso</th></tr></thead>
            <tbody>${filtered.map((m, i) => `
                <tr style="--row-i:${i}">
                    <td data-label="Nome"><span class="row-name">${avatarHtml(m.fullName)} ${escapeHtml(m.fullName)}</span></td>
                    <td data-label="Unidade">${escapeHtml(m.unit)}</td>
                    <td data-label="Progresso">
                        <div class="missing-progress" title="${m.pct}% assistido">
                            <div class="missing-progress-bar"><span class="${progressToneClass(m.pct)}" style="width:${m.pct}%"></span></div>
                            <span class="missing-progress-pct">${m.pct}%</span>
                        </div>
                    </td>
                </tr>
            `).join('')}</tbody>
        </table>`;
    }

    // "Faltam realizar": público-alvo do curso que ainda não tem nenhuma
    // aprovação (nunca fez a prova ou só reprovou), com progresso de
    // módulos assistidos, do maior para o menor.
    function renderMissingTable(rows, slug, subjectId, theme) {
        const container = document.getElementById('cfg-dash-course-missing');
        if (!container) return;

        if (AUDIENCE_EXEMPT_SLUGS.includes(slug)) {
            container.innerHTML = '<p class="dashboard-table-empty">Esta categoria não possui público-alvo definido.</p>';
            missingRowsCache = [];
            return;
        }

        // Só aprovação encerra a pendência: quem reprovou e não tem nenhuma
        // aprovação continua na lista, porque ainda precisa refazer a prova.
        const doneKeys = new Set();
        rows.filter(row => row.approved).forEach(row => personKeysOfRow(row).forEach(key => doneKeys.add(key)));
        const audience = courseAudience(theme);
        missingRowsCache = audience
            .filter(colab => !personKeysOfColaborador(colab).some(key => doneKeys.has(key)))
            .map(colab => ({
                fullName: colab.fullName,
                unit: colab.unit || '—',
                pct: progressPctFor(colab, slug, subjectId, theme.id)
            }))
            .sort((a, b) => b.pct - a.pct || a.fullName.localeCompare(b.fullName, 'pt-BR'));

        paintMissingTable();
    }

    document.getElementById('cfg-dash-course-missing-search')?.addEventListener('input', (e) => {
        missingSearchTerm = e.target.value;
        paintMissingTable();
    });

    function handleCopyMissingList() {
        if (missingRowsCache.length === 0) {
            showWarning('Não há colaboradores pendentes para copiar.');
            return;
        }
        const byUnit = new Map();
        missingRowsCache.forEach(m => {
            const unit = m.unit || 'Sem unidade';
            if (!byUnit.has(unit)) byUnit.set(unit, []);
            byUnit.get(unit).push(`${m.fullName} (${m.pct}% completo)`);
        });
        const unitNames = Array.from(byUnit.keys()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
        const text = unitNames.map(unit => `${unit}\n${byUnit.get(unit).join('\n')}`).join('\n\n');

        navigator.clipboard.writeText(text)
            .then(() => showWarning('Lista copiada para a área de transferência.'))
            .catch(() => showWarning('Não foi possível copiar a lista.'));
    }

    document.getElementById('cfg-dash-course-copy-missing')?.addEventListener('click', handleCopyMissingList);

    async function handleForgiveDeadline({ userId, slug, subjectId, themeId }) {
        const confirmed = await showConfirm({
            title: 'Desconsiderar atraso',
            message: 'O status de prazo deste resultado passa a ser "Atraso desconsiderado".',
            icon: 'fa-calendar-check',
            tone: 'neutral',
            confirmText: 'Confirmar'
        });
        if (!confirmed) return;

        try {
            const updates = {};
            updates[`/${dbRoot}/results/byUser/${userId}/${slug}/${subjectId}/${themeId}/deadlineStatus`] = 'forgiven';
            updates[`/${dbRoot}/results/byCourse/${slug}/${subjectId}/${themeId}/${userId}/deadlineStatus`] = 'forgiven';
            await db.ref().update(updates);
            showWarning('Atraso desconsiderado com sucesso.');
            historyRows = await U.refreshHistoryRows();
            renderCourseCards();
            renderCourseDashboard(slug, `${subjectId}_${themeId}`);
        } catch (error) {
            showWarning('Erro ao atualizar o resultado: ' + error.message);
        }
    }

    // Anos com dados em `rows` (ordem decrescente) — só entram anos que
    // realmente têm pelo menos um resultado, nunca uma faixa fixa.
    function yearsFromRows(rows) {
        const years = new Set();
        rows.forEach(r => { if (r.submittedAt) years.add(new Date(r.submittedAt).getFullYear()); });
        return [...years].sort((a, b) => b - a);
    }

    function filterRowsByYear(rows, year) {
        if (!year) return rows;
        return rows.filter(r => r.submittedAt && new Date(r.submittedAt).getFullYear() === Number(year));
    }

    // Chip de filtro por ano: botão redondo com popover de lista, mesmo
    // padrão visual/comportamental dos chips de Unidade/Função. `onChange` é
    // chamado com o ano selecionado ("" = todos) sempre que o valor muda.
    function createYearFilterChip(chipId, listId, onChange) {
        const chip = document.getElementById(chipId);
        const listEl = document.getElementById(listId);
        const btn = chip?.querySelector('.hfilter-chip-btn');
        const label = chip?.querySelector('.hfilter-chip-label');
        let value = '';

        function closePopover() { chip?.classList.remove('is-open'); }

        function paint(years) {
            if (!listEl) return;
            listEl.innerHTML = [`<div class="hfilter-chip-item ${!value ? 'is-selected' : ''}" data-value="">Todos os anos</div>`]
                .concat(years.map(y => `<div class="hfilter-chip-item ${String(y) === value ? 'is-selected' : ''}" data-value="${y}">${y}</div>`))
                .join('');
            listEl.querySelectorAll('.hfilter-chip-item').forEach(item => {
                item.addEventListener('click', () => {
                    value = item.dataset.value;
                    closePopover();
                    refresh(years);
                    onChange(value);
                });
            });
        }

        function refresh(years) {
            if (label) label.textContent = value || label.dataset.default;
            chip?.classList.toggle('is-active', !!value);
            paint(years);
        }

        btn?.addEventListener('click', (event) => {
            event.stopPropagation();
            const isOpen = chip.classList.contains('is-open');
            // Fecha qualquer outro chip aberto (ano, período, unidade): como
            // eles param a propagação do clique, o fechamento global no
            // document não chega a rodar quando se pula de um para o outro.
            document.querySelectorAll('.hfilter-chip.is-open').forEach(c => c.classList.remove('is-open'));
            if (!isOpen) chip.classList.add('is-open');
        });
        chip?.addEventListener('click', (event) => event.stopPropagation());
        document.addEventListener('click', closePopover);

        return {
            // Repopula com os anos disponíveis para o curso/colaborador atual;
            // se o ano selecionado não existir mais nesse conjunto, volta a
            // "Todos os anos" (mesmo critério do resto do painel).
            setYears(years) {
                if (value && !years.some(y => String(y) === value)) value = '';
                refresh(years);
            },
            getValue() { return value; }
        };
    }

    // Chip de período: popover com dois <input type="month"> (mês inicial e
    // mês final) para comparar um recorte qualquer, em vez de só um ano
    // fechado como no chip de ano. Os dois lados são opcionais — só o
    // inicial = "daqui em diante", só o final = "até aqui". `onChange` roda
    // no Aplicar/Limpar, não a cada tecla, pra não repintar os gráficos
    // enquanto a data ainda está pela metade.
    function createMonthRangeChip(chipId, ids, onChange) {
        const chip = document.getElementById(chipId);
        const label = chip?.querySelector('.hfilter-chip-label');
        const btn = chip?.querySelector('.hfilter-chip-btn');
        const startInput = document.getElementById(ids.start);
        const endInput = document.getElementById(ids.end);
        const applyBtn = document.getElementById(ids.apply);
        const clearBtn = document.getElementById(ids.clear);
        let range = { start: '', end: '' };

        function closePopover() { chip?.classList.remove('is-open'); }

        function refresh() {
            const hasRange = !!(range.start || range.end);
            if (label) {
                const startLabel = range.start ? monthLabelOf(monthIndexFromInput(range.start)) : null;
                const endLabel = range.end ? monthLabelOf(monthIndexFromInput(range.end)) : null;
                label.textContent = !hasRange ? label.dataset.default
                    : startLabel && endLabel ? `${startLabel} – ${endLabel}`
                    : startLabel ? `desde ${startLabel}` : `até ${endLabel}`;
            }
            chip?.classList.toggle('is-active', hasRange);
        }

        function commit() {
            let start = startInput?.value || '';
            let end = endInput?.value || '';
            // Intervalo invertido é erro de digitação, não filtro vazio:
            // troca os lados em vez de devolver zero linhas.
            const startIndex = monthIndexFromInput(start);
            const endIndex = monthIndexFromInput(end);
            if (startIndex !== null && endIndex !== null && startIndex > endIndex) {
                [start, end] = [end, start];
                if (startInput) startInput.value = start;
                if (endInput) endInput.value = end;
            }
            range = { start, end };
            refresh();
            closePopover();
            onChange(range);
        }

        applyBtn?.addEventListener('click', (event) => { event.stopPropagation(); commit(); });
        clearBtn?.addEventListener('click', (event) => {
            event.stopPropagation();
            if (startInput) startInput.value = '';
            if (endInput) endInput.value = '';
            commit();
        });

        btn?.addEventListener('click', (event) => {
            event.stopPropagation();
            const isOpen = chip.classList.contains('is-open');
            document.querySelectorAll('.hfilter-chip.is-open').forEach(c => c.classList.remove('is-open'));
            if (!isOpen) chip.classList.add('is-open');
        });
        chip?.addEventListener('click', (event) => event.stopPropagation());
        document.addEventListener('click', closePopover);

        return {
            // Limita os seletores ao intervalo que a pessoa realmente tem
            // histórico — escolher um mês fora disso só renderiza vazio.
            setBounds(rows) {
                const indexes = rows.map(r => r.submittedAt ? monthIndexOfDate(r.submittedAt) : null).filter(i => i !== null);
                const toInput = (index) => {
                    const year = Math.floor(index / 12);
                    return `${year}-${String(index - year * 12 + 1).padStart(2, '0')}`;
                };
                const min = indexes.length ? toInput(Math.min(...indexes)) : '';
                const max = indexes.length ? toInput(Math.max(...indexes)) : '';
                [startInput, endInput].forEach(input => {
                    if (!input) return;
                    input.min = min;
                    input.max = max;
                });
            },
            reset() {
                if (startInput) startInput.value = '';
                if (endInput) endInput.value = '';
                range = { start: '', end: '' };
                refresh();
            },
            getRange() { return range; }
        };
    }

    let courseChartRowsCache = [];
    let courseChartAudienceCache = [];
    let courseChartCompletionTimeCache = [];
    let courseChartEvalTimeCache = [];
    // Slug do curso aberto no modal — "Tempo para Conclusão" precisa dele pra
    // ler progress/byUser/<user>/<slug>/... (allProgress é organizado por
    // slug de categoria; currentSlug() aqui apontaria pra categoria
    // selecionada no topo do painel, não pra do curso aberto, que pode ser
    // outra).
    let courseChartSlugCache = null;
    let courseChartSubjectIdCache = null;
    let courseChartThemeIdCache = null;
    // Tempo de conclusão esperado do curso aberto (ms), gravado no assunto
    // como `expectedCompletionMs`. Vira a linha vermelha de referência no
    // gráfico "Tempo para Conclusão". null = curso sem tempo esperado.
    let courseChartExpectedMsCache = null;

    function expectedCompletionMsOf(theme) {
        const ms = Number(theme?.expectedCompletionMs);
        return Number.isFinite(ms) && ms > 0 ? ms : null;
    }
    const courseChartYearChip = createYearFilterChip('cfg-dash-course-year-chip', 'cfg-dash-course-year-list', () => renderCourseCharts(courseChartRowsCache));

    // Popover de seleção múltipla (checkbox) — mesmo visual do chip de ano,
    // mas permite marcar várias opções ao mesmo tempo (ex.: comparar a
    // conclusão de várias unidades juntas no gráfico de tendência).
    // `onPaint(values)`, se passado, roda a cada (re)pintura — usado pelo chip
    // de "Tempo para Conclusão" pra listar os colaboradores das unidades
    // marcadas logo abaixo das opções, dentro do mesmo popover.
    function createMultiFilterChip(chipId, listId, onChange, onPaint, searchId) {
        const chip = document.getElementById(chipId);
        const listEl = document.getElementById(listId);
        const btn = chip?.querySelector('.hfilter-chip-btn');
        const label = chip?.querySelector('.hfilter-chip-label');
        // Busca opcional: só os chips com lista longa (funções, dezenas de
        // cargos) passam `searchId`. Sem ela o componente pinta tudo, como
        // sempre fez para unidades.
        const searchEl = searchId ? document.getElementById(searchId) : null;
        let values = new Set();
        let options = [];

        // Botão "Marcar/desmarcar todos" fica em elemento próprio, injetado
        // antes da lista (ver `paint`), pra não competir com o `.hfilter-chip-list`
        // que já é sobrescrito por inteiro a cada pintura.
        const toggleAllEl = listEl ? document.createElement('button') : null;
        if (toggleAllEl) {
            toggleAllEl.type = 'button';
            toggleAllEl.className = 'hfilter-chip-toggle-all';
            listEl.insertAdjacentElement('beforebegin', toggleAllEl);
            toggleAllEl.addEventListener('click', (event) => {
                event.stopPropagation();
                // Com busca ativa o botão age só sobre o que está à vista:
                // "Marcar todos" depois de digitar "Enfermagem" deve marcar
                // esses cargos, não os cinquenta que a busca escondeu.
                const shown = visibleOptions();
                const allShownSelected = shown.length > 0 && shown.every(opt => values.has(opt));
                if (allShownSelected) shown.forEach(opt => values.delete(opt));
                else shown.forEach(opt => values.add(opt));
                refresh();
                onChange(values);
            });
        }

        function closePopover() { chip?.classList.remove('is-open'); }

        function visibleOptions() {
            const term = normalizeName(searchEl?.value || '');
            return term ? options.filter(opt => normalizeName(opt).includes(term)) : options;
        }

        function paint() {
            if (!listEl) return;
            const shown = visibleOptions();
            if (toggleAllEl) {
                toggleAllEl.style.display = shown.length === 0 ? 'none' : '';
                const allSelected = shown.length > 0 && shown.every(opt => values.has(opt));
                toggleAllEl.innerHTML = allSelected
                    ? `<i class="fas fa-square-minus"></i> Desmarcar todos`
                    : `<i class="fas fa-square-check"></i> Marcar todos`;
            }
            if (shown.length === 0) {
                listEl.innerHTML = `<div class="hfilter-chip-empty">${escapeHtml(
                    searchEl?.value ? 'Nada encontrado.' : (chip?.dataset.emptyLabel || 'Nenhuma unidade disponível.'))}</div>`;
            } else {
                listEl.innerHTML = shown.map(opt => `
                    <div class="hfilter-chip-item ${values.has(opt) ? 'is-selected' : ''}" data-value="${escapeHtml(opt)}">
                        <i class="fas ${values.has(opt) ? 'fa-square-check' : 'fa-square'}"></i> ${escapeHtml(opt)}
                    </div>`).join('');
                listEl.querySelectorAll('.hfilter-chip-item').forEach(item => {
                    item.addEventListener('click', (event) => {
                        event.stopPropagation();
                        const value = item.dataset.value;
                        if (values.has(value)) values.delete(value); else values.add(value);
                        refresh();
                        onChange(values);
                    });
                });
            }
            onPaint?.(values);
        }

        function refresh() {
            if (label) {
                // O plural do rótulo ("3 unidades") vem do próprio chip: o
                // mesmo componente filtra unidades no modal do curso e cursos
                // no modal do colaborador.
                label.textContent = values.size === 0 ? label.dataset.default
                    : values.size === 1 ? [...values][0]
                    : `${values.size} ${chip?.dataset.pluralLabel || 'unidades'}`;
            }
            chip?.classList.toggle('is-active', values.size > 0);
            // "Limpar filtro" (quando o popover tem um) só aparece com algo
            // marcado — sem seleção o botão não teria o que limpar.
            const clearBtn = chip?.querySelector('.hfilter-chip-clear');
            if (clearBtn) clearBtn.hidden = values.size === 0;
            paint();
        }

        btn?.addEventListener('click', (event) => {
            event.stopPropagation();
            const isOpen = chip.classList.contains('is-open');
            document.querySelectorAll('.hfilter-chip.is-open').forEach(c => c.classList.remove('is-open'));
            if (isOpen) return;
            chip.classList.add('is-open');
            // Abre sempre com a busca zerada: um termo deixado da abertura
            // anterior esconderia opções sem o usuário entender por quê.
            if (searchEl) { searchEl.value = ''; paint(); searchEl.focus(); }
        });
        chip?.addEventListener('click', (event) => event.stopPropagation());
        searchEl?.addEventListener('input', paint);
        document.addEventListener('click', closePopover);

        return {
            // Repopula com as unidades disponíveis para o curso atual; remove
            // da seleção qualquer unidade que não exista mais nesse conjunto.
            setOptions(newOptions) {
                options = newOptions;
                values = new Set([...values].filter(v => options.includes(v)));
                refresh();
            },
            // Zera a seleção sem disparar onChange — quem chama decide o que
            // repintar (usado pelo botão "Limpar filtro" do popover).
            clear() {
                values = new Set();
                if (searchEl) searchEl.value = '';
                refresh();
            },
            getValues() { return values; }
        };
    }

    const courseChartUnitChip = createMultiFilterChip('cfg-dash-course-unit-chip', 'cfg-dash-course-unit-list', () => renderCourseCompletionTrendChart(courseChartRowsCache, courseChartAudienceCache));

    // Chip de unidade do gráfico "Tempo para Conclusão" — além de filtrar o
    // gráfico, lista os colaboradores das unidades marcadas dentro do
    // próprio popover (pedido explícito: selecionar unidade mostra quem é
    // dela, podendo marcar mais de uma ao mesmo tempo).
    const completionTimeUnitUsersEl = document.getElementById('cfg-dash-course-completiontime-unit-users');
    function paintCompletionTimeUnitUsers(values) {
        if (!completionTimeUnitUsersEl) return;
        if (values.size === 0) { completionTimeUnitUsersEl.innerHTML = ''; return; }
        const people = courseChartAudienceCache
            .filter(c => values.has(c.unit))
            .slice()
            .sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '', 'pt-BR'));
        completionTimeUnitUsersEl.innerHTML = `
            <div class="hfilter-chip-unit-users-title">${people.length} colaborador${people.length === 1 ? '' : 'es'}</div>
            <div class="hfilter-chip-unit-users-list">${
                people.length
                    ? people.map(p => `<div class="hfilter-chip-unit-user"><i class="fas fa-user"></i> ${escapeHtml(p.fullName)}</div>`).join('')
                    : `<div class="hfilter-chip-empty">Nenhum colaborador nessa unidade.</div>`
            }</div>`;
    }
    const courseChartCompletionTimeUnitChip = createMultiFilterChip(
        'cfg-dash-course-completiontime-unit-chip', 'cfg-dash-course-completiontime-unit-list',
        () => renderCourseCompletionTimeChart(courseChartCompletionTimeCache),
        paintCompletionTimeUnitUsers
    );

    // Chip de unidade do gráfico "Tempo para Conclusão da Avaliação" — usa
    // courseChartEvalTimeCache (duração da prova, campo durationSeconds,
    // mesmo valor da coluna "Tempo" do histórico), não o tempo até a
    // aprovação usado pelo gráfico "Tempo para Conclusão" acima.
    const courseChartEvalTimeUnitChip = createMultiFilterChip(
        'cfg-dash-course-evaltime-unit-chip', 'cfg-dash-course-evaltime-unit-list',
        () => renderCourseEvalTimeChart(courseChartEvalTimeCache)
    );

    // Gráfico de Satisfação em dois modos, alternados pelos botões
    // "Geral"/"Unidade" no cabeçalho do painel:
    //   geral   — distribuição de quantas avaliações cada nota de estrela
    //              recebeu (leitura original do gráfico);
    //   unidade — média de estrelas de cada unidade, da menor para a maior,
    //              pra achar rápido onde a satisfação está pior.
    let satisfactionMode = 'geral';
    let satisfactionRowsCache = [];
    // Paginação do modo "Unidade" (o modo "Geral" tem 5 barras fixas e não
    // pagina). Mesmo tamanho de página de "Notas por Unidade" — acima disso
    // as barras ficam finas demais e os nomes se atropelam.
    const SATISFACTION_PAGE_SIZE = 7;
    let satisfactionPage = 1;

    // Média de estrelas por unidade. Só linhas com estrela válida (1-5)
    // entram — quem concluiu sem responder a pesquisa não deve puxar a
    // média da unidade pra baixo.
    function satisfactionByUnit(rows) {
        const byUnit = new Map();
        rows.forEach(r => {
            const rating = Number(r.rating);
            if (!Number.isFinite(rating) || rating < 1 || rating > 5) return;
            const unit = r.unit || 'Sem unidade';
            if (!byUnit.has(unit)) byUnit.set(unit, { sum: 0, count: 0 });
            const entry = byUnit.get(unit);
            entry.sum += rating;
            entry.count++;
        });
        return [...byUnit.entries()]
            .map(([unit, e]) => ({ unit, avg: e.sum / e.count, count: e.count }))
            .sort((a, b) => a.avg - b.avg || a.unit.localeCompare(b.unit, 'pt-BR'));
    }

    // Pager do gráfico (some no modo "Geral" e quando cabe tudo numa página).
    function paintSatisfactionPagination(totalPages) {
        const pager = document.getElementById('cfg-dash-course-satisfaction-pagination');
        if (!pager) return;
        if (totalPages <= 1) { pager.innerHTML = ''; return; }
        pager.innerHTML = `<button type="button" class="comments-page-btn" data-page="prev" ${satisfactionPage === 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>` +
            `<span class="comments-page-info">Página ${satisfactionPage} de ${totalPages}</span>` +
            `<button type="button" class="comments-page-btn" data-page="next" ${satisfactionPage === totalPages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>`;
        pager.querySelectorAll('.comments-page-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                satisfactionPage += btn.dataset.page === 'prev' ? -1 : 1;
                renderCourseSatisfactionChart(satisfactionRowsCache);
            });
        });
    }

    function renderCourseSatisfactionChart(rows) {
        satisfactionRowsCache = rows;

        if (satisfactionMode === 'unidade') {
            const allUnits = satisfactionByUnit(rows);
            const totalPages = Math.max(1, Math.ceil(allUnits.length / SATISFACTION_PAGE_SIZE));
            satisfactionPage = Math.min(Math.max(1, satisfactionPage), totalPages);
            const start = (satisfactionPage - 1) * SATISFACTION_PAGE_SIZE;
            const units = allUnits.slice(start, start + SATISFACTION_PAGE_SIZE);

            renderChart('courseSatisfaction', 'cfg-dash-course-satisfaction-chart', {
                type: 'bar',
                data: {
                    labels: units.map(u => u.unit),
                    datasets: [{ data: units.map(u => Number(u.avg.toFixed(2))), backgroundColor: CHART_COLORS.warning, borderRadius: 4 }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false, indexAxis: 'y',
                    plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: { label: (ctx) => {
                            const u = units[ctx.dataIndex];
                            return `Média ${u.avg.toFixed(1).replace('.', ',')}★ • ${u.count} ${u.count === 1 ? 'avaliação' : 'avaliações'}`;
                        } } }
                    },
                    // Escala fixa 0-5: comparar unidades só faz sentido na mesma
                    // régua de estrelas, senão o eixo se ajusta e exagera a
                    // diferença entre médias parecidas.
                    // autoSkip: false garante nome em TODA barra da página —
                    // sem ele o Chart.js esconde rótulos que não couberem.
                    scales: {
                        x: { min: 0, max: 5, ticks: { stepSize: 1, callback: (v) => `${v}★` } },
                        y: { ticks: { autoSkip: false } }
                    }
                }
            });
            paintSatisfactionPagination(totalPages);
            return;
        }
        paintSatisfactionPagination(1);

        const ratingCounts = [1, 2, 3, 4, 5].map(star => rows.filter(r => r.rating === star).length);
        renderChart('courseSatisfaction', 'cfg-dash-course-satisfaction-chart', {
            type: 'bar',
            data: { labels: ['1★', '2★', '3★', '4★', '5★'], datasets: [{ data: ratingCounts, backgroundColor: CHART_COLORS.warning, borderRadius: 4 }] },
            options: {
                responsive: true, maintainAspectRatio: false, indexAxis: 'y',
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => singleSeriesTooltipLabel(ctx) } } }
            }
        });
    }

    document.getElementById('cfg-dash-course-satisfaction-mode')?.querySelectorAll('.dash-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (satisfactionMode === btn.dataset.mode) return;
            satisfactionMode = btn.dataset.mode;
            satisfactionPage = 1;
            btn.parentElement.querySelectorAll('.dash-mode-btn').forEach(b => b.classList.toggle('is-active', b === btn));
            renderCourseSatisfactionChart(satisfactionRowsCache);
        });
    });

    // Parte da aba Gráficos que depende de data (Satisfação, Prazo,
    // Retentativas, Por Unidade) — respeita o filtro de ano. "Realização do
    // Curso" fica de fora: compara com o público-alvo total, não faz sentido
    // recortar por ano.
    function renderCourseCharts(allRows) {
        const rows = filterRowsByYear(allRows, courseChartYearChip.getValue());

        renderCourseSatisfactionChart(rows);

        const lastAttempts = lastAttemptByPerson(rows);
        const onTime = lastAttempts.filter(r => ['on_time', 'livre', 'forgiven'].includes(r.deadlineStatus)).length;
        const late = lastAttempts.length - onTime;
        renderChart('courseDeadline', 'cfg-dash-course-deadline-chart', {
            type: 'pie',
            data: { labels: ['No prazo', 'Fora do prazo'], datasets: [{ data: [onTime, late], backgroundColor: [CHART_COLORS.accent, CHART_COLORS.danger] }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { tooltip: { callbacks: { label: (ctx) => pieTooltipLabel(ctx) } } } }
        });

        renderCourseRetriesChart(rows);
        renderCourseByUnitChart(rows);
        renderCourseMistakesChart(rows);
        renderCourseScoresChart(rows);
        renderCourseScoresByUnitChart(rows);

        // Só entram unidades com nome de verdade — vazio, "—" ou "Sem
        // unidade" viram ruído no filtro (não dá pra segmentar por elas).
        const invalidUnit = (u) => !u || !u.trim() || u.trim() === '—' || normalizeName(u) === normalizeName('Sem unidade');
        const units = [...new Set(courseChartAudienceCache.map(c => c.unit).filter(u => !invalidUnit(u)))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
        courseChartUnitChip.setOptions(units);
        renderCourseCompletionTrendChart(allRows, courseChartAudienceCache);
        renderCourseUnitCompletionChart(allRows, courseChartAudienceCache);

        courseChartCompletionTimeUnitChip.setOptions(units);
        courseChartCompletionTimeCache = buildCompletionTimeData(allRows, courseChartSlugCache);
        renderCourseCompletionTimeChart(courseChartCompletionTimeCache);

        courseChartEvalTimeUnitChip.setOptions(units);
        courseChartEvalTimeCache = buildEvalTimeData(allRows);
        renderCourseEvalTimeChart(courseChartEvalTimeCache);
    }

    // Tempo ATIVO com o curso aberto até a aprovação (campo activeMs de
    // progress/byUser, gravado por resumeActiveCourseTimer/
    // pauseActiveCourseTimer em js/main.js): soma só o tempo em que o aluno
    // esteve de fato com o curso na tela (aba visível), não o tempo corrido
    // — fechar o curso por dias não infla o número. Contador some ao aprovar.
    // Registros antigos (gravados antes dessa métrica existir) não têm
    // activeMs e são excluídos — não há tempo ativo real para mostrar.
    // Ordenado do maior tempo para o menor.
    function buildCompletionTimeData(rows, slug) {
        const approved = lastAttemptByPerson(rows).filter(r => r.approved && r.submittedAt);
        return approved
            .map(r => {
                const activeMs = r.userId ? allProgress[r.userId]?.[slug]?.[r.subjectId]?.[r.themeId]?.activeMs : null;
                if (!Number.isFinite(activeMs) || activeMs <= 0) return null;
                return { fullName: r.fullName, unit: r.unit, durationMs: activeMs };
            })
            .filter(Boolean)
            .sort((a, b) => b.durationMs - a.durationMs);
    }

    // Tempo de duração da PROVA em si (mesmo campo `durationSeconds` exibido
    // na coluna "Tempo" do histórico) — não confundir com buildCompletionTimeData,
    // que mede o tempo desde o início do curso até a aprovação. Usado só pelo
    // gráfico "Tempo para Conclusão da Avaliação".
    function buildEvalTimeData(rows) {
        const approved = lastAttemptByPerson(rows).filter(r => r.approved && r.submittedAt);
        return approved
            .map(r => {
                const seconds = Number(r.durationSeconds);
                if (!Number.isFinite(seconds)) return null;
                return { fullName: r.fullName, unit: r.unit, durationMs: seconds * 1000 };
            })
            .filter(Boolean)
            .sort((a, b) => b.durationMs - a.durationMs);
    }

    // HH:MM a partir de ms — HH não tem teto (curso aberto por 30h vira
    // "30:00", não volta para "06:00" do dia seguinte).
    function formatHHMM(ms) {
        const totalMinutes = Math.round(ms / 60000);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }

    // HH:MM:SS a partir de ms — mesmo formato da coluna "Conclusão" do
    // histórico (ver formatHHMMSS em admin-history.js), HH sem teto.
    function formatHHMMSS(ms) {
        const n = Number(ms);
        if (!Number.isFinite(n) || n <= 0) return '—';
        const totalSeconds = Math.round(n / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    // Mesmo formato MM:SS da coluna "Tempo" do histórico (ver formatDuration),
    // mas a partir de ms — usado no gráfico "Tempo para Conclusão da
    // Avaliação", que mede duração de prova (curta, minutos), não dias.
    function formatMsAsDuration(ms) {
        return formatDuration(ms / 1000);
    }

    // Mesmo modelo do gráfico "Tempo para Conclusão da Avaliação" (ver
    // paintEvalTimePage/renderCourseEvalTimeChart): sem filtro, uma barra por
    // unidade com média±desvio padrão, ordenada da maior média para a menor;
    // marcando uma ou mais unidades, troca para uma barra por pessoa daquelas
    // unidades. Barra "Geral" (cinza, fixa no topo) com média±desvio de todos
    // os aprovados, ignorando o filtro. Paginado igual aos outros gráficos
    // "por unidade".
    // 5 (+ "Geral" fixo = 6 barras no canvas) — 7 deixava as barras achatadas
    // no card de altura fixa (260px).
    const COMPLETION_TIME_PAGE_SIZE = 9;
    let completionTimePage = 1;
    let completionTimeDataCache = [];

    function paintCompletionTimePage() {
        // "Geral" (1ª posição do cache, ver renderCourseCompletionTimeChart)
        // não entra na paginação normal — fica fixa no topo de toda página, o
        // resto das barras pagina em torno dela.
        const generalRow = completionTimeDataCache[0];
        const rest = completionTimeDataCache.slice(1);
        const totalPages = Math.max(1, Math.ceil(rest.length / COMPLETION_TIME_PAGE_SIZE));
        completionTimePage = Math.min(Math.max(1, completionTimePage), totalPages);
        const start = (completionTimePage - 1) * COMPLETION_TIME_PAGE_SIZE;
        const pageRows = generalRow ? [generalRow, ...rest.slice(start, start + COMPLETION_TIME_PAGE_SIZE)] : [];

        const canvas = document.getElementById('cfg-dash-course-completiontime-chart');
        const emptyEl = document.getElementById('cfg-dash-course-completiontime-empty');
        const pager = document.getElementById('cfg-dash-course-completiontime-pagination');

        // Sem dado nenhum (ninguém com activeMs registrado ainda) o Chart.js
        // desenha um eixo numérico "fantasma" com o canvas vazio — em vez
        // disso mostra mensagem e não renderiza o gráfico.
        if (completionTimeDataCache.length === 0) {
            destroyChart('courseCompletionTime');
            if (canvas) canvas.style.display = 'none';
            if (emptyEl) emptyEl.style.display = 'flex';
            if (pager) pager.innerHTML = '';
            return;
        }
        if (canvas) canvas.style.display = '';
        if (emptyEl) emptyEl.style.display = 'none';

        renderChart('courseCompletionTime', 'cfg-dash-course-completiontime-chart', {
            type: 'bar',
            data: {
                labels: pageRows.map(r => r.label),
                datasets: [{
                    data: pageRows.map(r => r.avgMs),
                    backgroundColor: pageRows.map(r => r.isGeneral ? CHART_COLORS.muted : CHART_COLORS.accent),
                    borderRadius: 4,
                    // Sem isso o Chart.js reparte a altura toda entre poucas
                    // barras mas deixa cada uma fina (categoryPercentage
                    // baixo por padrão) — resultado "achatado" mesmo com
                    // canvas alto. Sem maxBarThickness (o cap de 34px travava
                    // a barra fina mesmo sobrando espaço) — deixa
                    // barPercentage/categoryPercentage engordarem livre até
                    // preencher o canvas, igual ao gráfico "Taxa de Conclusão
                    // por Unidade" que nunca teve esse problema.
                    barPercentage: 0.9, categoryPercentage: 0.85
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, indexAxis: 'y',
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: {
                        label: (ctx) => {
                            const r = pageRows[ctx.dataIndex];
                            const base = `Média: ${formatHHMMSS(r.avgMs)}`;
                            return r.n > 1 ? `${base} (±${formatHHMMSS(r.stddevMs)}, ${r.n} pessoas)` : `${base} (1 pessoa)`;
                        },
                        // Linha extra comparando o tempo real com o esperado
                        // configurado no curso. Só aparece quando há tempo
                        // esperado definido (mesma condição da linha vermelha).
                        afterBody: (items) => {
                            const expectedMs = courseChartExpectedMsCache;
                            if (!expectedMs) return [];
                            const r = pageRows[items[0]?.dataIndex];
                            if (!r) return [];
                            const pct = Math.round((r.avgMs / expectedMs) * 100);
                            const delta = r.avgMs - expectedMs;
                            // >100% = levou MAIS tempo que o previsto.
                            const situation = delta > 0
                                ? `${formatHHMMSS(delta)} acima do esperado`
                                : `${formatHHMMSS(Math.abs(delta))} abaixo do esperado`;
                            return [
                                `${pct}% do tempo esperado (${formatHHMMSS(expectedMs)})`,
                                delta === 0 ? 'exatamente no tempo esperado' : situation
                            ];
                        }
                    } }
                },
                scales: {
                    x: {
                        ticks: { callback: (v) => formatHHMM(v) },
                        // Garante que a linha do tempo esperado caiba no eixo
                        // mesmo quando todo mundo terminou bem antes dela —
                        // senão a referência ficaria fora da área desenhada.
                        ...(courseChartExpectedMsCache && { suggestedMax: courseChartExpectedMsCache * 1.05 })
                    }
                }
            },
            plugins: [stddevWhiskerPlugin, expectedTimeLinePlugin]
        });
        chartInstances.courseCompletionTime.$stddevs = [pageRows.map(r => r.stddevMs)];
        chartInstances.courseCompletionTime.$expectedMs = courseChartExpectedMsCache;

        // O pager é montado ANTES do resize() de propósito: ele fica no mesmo
        // flex column do canvas, então injetá-lo encolhe o canvas. Se o
        // Chart.js medisse antes disso, as coordenadas internas ficariam
        // referentes ao canvas alto e a hitbox de hover/click sairia
        // deslocada pra baixo (hover na última barra acusava a anterior).
        if (pager) {
            if (totalPages <= 1) {
                pager.innerHTML = '';
            } else {
                pager.innerHTML = `<button type="button" class="comments-page-btn" data-page="prev" ${completionTimePage === 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>` +
                    `<span class="comments-page-info">Página ${completionTimePage} de ${totalPages}</span>` +
                    `<button type="button" class="comments-page-btn" data-page="next" ${completionTimePage === totalPages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>`;
                pager.querySelectorAll('.comments-page-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        completionTimePage += btn.dataset.page === 'prev' ? -1 : 1;
                        paintCompletionTimePage();
                    });
                });
            }
        }

        // resize() depois do pager e antes do update: o card ganhou altura
        // maior (ver .dashboard-chart-card-tall) mas o Chart.js mede o canvas
        // só na construção — sem isso a hitbox de hover/click das barras fica
        // travada no tamanho antigo, descolada da barra desenhada visualmente.
        chartInstances.courseCompletionTime.resize();
        chartInstances.courseCompletionTime.update('none');
    }

    function renderCourseCompletionTimeChart(data) {
        const selectedUnits = courseChartCompletionTimeUnitChip.getValues();

        if (selectedUnits.size > 0) {
            // Unidade(s) marcada(s): uma barra por pessoa, maior tempo primeiro.
            completionTimeDataCache = data
                .filter(d => selectedUnits.has(d.unit))
                .map(d => ({ label: d.fullName, avgMs: d.durationMs, stddevMs: 0, n: 1 }))
                .sort((a, b) => b.avgMs - a.avgMs);
        } else {
            // Sem filtro: uma barra por unidade, média ± desvio padrão.
            const byUnit = new Map();
            data.forEach(d => {
                const unit = d.unit || 'Sem unidade';
                if (!byUnit.has(unit)) byUnit.set(unit, []);
                byUnit.get(unit).push(d.durationMs);
            });
            completionTimeDataCache = [...byUnit.entries()]
                .map(([unit, durations]) => {
                    const avg = mean(durations);
                    return { label: unit, avgMs: avg, stddevMs: stddev(durations, avg), n: durations.length };
                })
                .sort((a, b) => b.avgMs - a.avgMs);
        }

        // Barra "Geral" (cinza, sempre em 1º): média±desvio de TODOS os
        // aprovados, ignorando filtro de unidade — fica fixa mesmo com
        // unidade(s) marcada(s), pra servir de referência de comparação.
        // Sem dado nenhum não entra, senão o cache nunca fica vazio de
        // verdade e o card de "sem dados suficientes" nunca aparece.
        if (data.length > 0) {
            const allDurations = data.map(d => d.durationMs);
            const generalAvg = mean(allDurations);
            completionTimeDataCache.unshift({
                label: 'Geral', avgMs: generalAvg, stddevMs: stddev(allDurations, generalAvg),
                n: allDurations.length, isGeneral: true
            });
        }

        completionTimePage = 1;
        paintCompletionTimePage();
    }

    // Plugin Chart.js que desenha a "barra de erro" (desvio padrão) sobre
    // cada barra horizontal: um traço central + travessões nas pontas, no
    // valor médio ± stddev. Não há plugin de error bar carregado no projeto
    // (só chart.js@4 puro), então desenha à mão no afterDatasetsDraw.
    // `chart.$stddevs[datasetIndex][dataIndex]` guarda o desvio de cada
    // barra — setado por quem monta o gráfico, já que o Chart.js não tem
    // onde guardar esse dado por ponto além do próprio array de `data`.
    const stddevWhiskerPlugin = {
        id: 'stddevWhisker',
        afterDatasetsDraw(chart) {
            const stddevs = chart.$stddevs;
            if (!stddevs) return;
            const { ctx, scales: { x: xScale } } = chart;
            chart.data.datasets.forEach((dataset, datasetIndex) => {
                const meta = chart.getDatasetMeta(datasetIndex);
                if (meta.hidden) return;
                meta.data.forEach((bar, index) => {
                    const sd = stddevs[datasetIndex]?.[index];
                    if (!sd) return;
                    const value = dataset.data[index];
                    const y = bar.y;
                    const xLo = xScale.getPixelForValue(Math.max(0, value - sd));
                    const xHi = xScale.getPixelForValue(value + sd);
                    const cap = Math.min(6, bar.height ? bar.height / 3 : 6);
                    ctx.save();
                    ctx.strokeStyle = 'rgba(15, 23, 42, 0.55)';
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(xLo, y); ctx.lineTo(xHi, y);
                    ctx.moveTo(xLo, y - cap); ctx.lineTo(xLo, y + cap);
                    ctx.moveTo(xHi, y - cap); ctx.lineTo(xHi, y + cap);
                    ctx.stroke();
                    ctx.restore();
                });
            });
        }
    };

    // Linha vertical vermelha no "Tempo para Conclusão", marcando o tempo de
    // conclusão esperado do curso (`expectedCompletionMs` do assunto): barra
    // que passa dela levou mais tempo que o previsto. Desenhada depois das
    // barras (afterDatasetsDraw) pra ficar por cima, com o valor escrito no
    // topo. `chart.$expectedMs` é setado por quem monta o gráfico.
    const expectedTimeLinePlugin = {
        id: 'expectedTimeLine',
        afterDatasetsDraw(chart) {
            const expectedMs = chart.$expectedMs;
            if (!Number.isFinite(expectedMs) || expectedMs <= 0) return;
            const { ctx, chartArea, scales: { x: xScale } } = chart;
            if (!chartArea) return;
            const x = xScale.getPixelForValue(expectedMs);
            // Fora da área desenhada (tempo esperado além do maior valor do
            // eixo, mesmo com o suggestedMax) — não desenha nada solto.
            if (x < chartArea.left || x > chartArea.right) return;

            ctx.save();
            ctx.strokeStyle = CHART_COLORS.danger;
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 4]);
            ctx.beginPath();
            ctx.moveTo(x, chartArea.top);
            ctx.lineTo(x, chartArea.bottom);
            ctx.stroke();
            ctx.setLineDash([]);

            // Rótulo encostado na linha; vira para a esquerda quando a linha
            // está perto da borda direita, pra não sair do canvas.
            const label = `Esperado ${formatHHMMSS(expectedMs)}`;
            ctx.font = '600 11px system-ui, -apple-system, sans-serif';
            ctx.fillStyle = CHART_COLORS.danger;
            ctx.textBaseline = 'top';
            const flip = x + ctx.measureText(label).width + 8 > chartArea.right;
            ctx.textAlign = flip ? 'right' : 'left';
            ctx.fillText(label, flip ? x - 4 : x + 4, chartArea.top + 2);
            ctx.restore();
        }
    };

    function mean(values) { return values.reduce((a, b) => a + b, 0) / values.length; }
    function stddev(values, avg) {
        if (values.length < 2) return 0;
        const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (values.length - 1);
        return Math.sqrt(variance);
    }

    // Tempo médio de DURAÇÃO DA PROVA (campo durationSeconds, mesmo dado da
    // coluna "Tempo" no histórico — não confundir com "Tempo para Conclusão",
    // que mede início do curso até a aprovação), agregado por unidade —
    // ordenado da maior média para a menor. Marcando uma ou mais
    // unidades no filtro, troca a agregação para uma barra por pessoa
    // daquelas unidades (pedido explícito), mantendo média±desvio por barra
    // (desvio de 1 pessoa sozinha é 0, não aparece traço). Paginado como os
    // outros gráficos "por unidade".
    // 5 (+ "Geral" fixo = 6 barras no canvas) — 7 deixava as barras achatadas
    // no card de altura fixa (260px).
    const EVALTIME_PAGE_SIZE = 9;
    let evalTimePage = 1;
    let evalTimeDataCache = [];

    function paintEvalTimePage() {
        // "Geral" (1ª posição do cache, ver renderCourseEvalTimeChart) não
        // entra na paginação normal — fica fixa no topo de toda página, o
        // resto das barras pagina em torno dela.
        const generalRow = evalTimeDataCache[0];
        const rest = evalTimeDataCache.slice(1);
        const totalPages = Math.max(1, Math.ceil(rest.length / EVALTIME_PAGE_SIZE));
        evalTimePage = Math.min(Math.max(1, evalTimePage), totalPages);
        const start = (evalTimePage - 1) * EVALTIME_PAGE_SIZE;
        const pageRows = generalRow ? [generalRow, ...rest.slice(start, start + EVALTIME_PAGE_SIZE)] : [];

        const canvas = document.getElementById('cfg-dash-course-evaltime-chart');
        const emptyEl = document.getElementById('cfg-dash-course-evaltime-empty');
        const pager = document.getElementById('cfg-dash-course-evaltime-pagination');

        if (evalTimeDataCache.length === 0) {
            destroyChart('courseEvalTime');
            if (canvas) canvas.style.display = 'none';
            if (emptyEl) emptyEl.style.display = 'flex';
            if (pager) pager.innerHTML = '';
            return;
        }
        if (canvas) canvas.style.display = '';
        if (emptyEl) emptyEl.style.display = 'none';

        renderChart('courseEvalTime', 'cfg-dash-course-evaltime-chart', {
            type: 'bar',
            data: {
                labels: pageRows.map(r => r.label),
                datasets: [{
                    data: pageRows.map(r => r.avgMs),
                    backgroundColor: pageRows.map(r => r.isGeneral ? CHART_COLORS.muted : CHART_COLORS.accent),
                    borderRadius: 4,
                    // Ver comentário equivalente em renderCourseCompletionTimeChart.
                    barPercentage: 0.9, categoryPercentage: 0.85
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, indexAxis: 'y',
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => {
                        const r = pageRows[ctx.dataIndex];
                        const base = `Média: ${formatMsAsDuration(r.avgMs)}`;
                        return r.n > 1 ? `${base} (±${formatMsAsDuration(r.stddevMs)}, ${r.n} pessoas)` : `${base} (1 pessoa)`;
                    } } }
                },
                scales: { x: { ticks: { callback: (v) => formatMsAsDuration(v) } } }
            },
            plugins: [stddevWhiskerPlugin]
        });
        chartInstances.courseEvalTime.$stddevs = [pageRows.map(r => r.stddevMs)];

        // Pager antes do resize — ver comentário equivalente em
        // paintCompletionTimePage.
        if (pager) {
            if (totalPages <= 1) {
                pager.innerHTML = '';
            } else {
                pager.innerHTML = `<button type="button" class="comments-page-btn" data-page="prev" ${evalTimePage === 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>` +
                    `<span class="comments-page-info">Página ${evalTimePage} de ${totalPages}</span>` +
                    `<button type="button" class="comments-page-btn" data-page="next" ${evalTimePage === totalPages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>`;
                pager.querySelectorAll('.comments-page-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        evalTimePage += btn.dataset.page === 'prev' ? -1 : 1;
                        paintEvalTimePage();
                    });
                });
            }
        }

        chartInstances.courseEvalTime.resize();
        chartInstances.courseEvalTime.update('none');
    }

    function renderCourseEvalTimeChart(data) {
        const selectedUnits = courseChartEvalTimeUnitChip.getValues();

        if (selectedUnits.size > 0) {
            // Unidade(s) marcada(s): uma barra por pessoa, maior tempo primeiro.
            evalTimeDataCache = data
                .filter(d => selectedUnits.has(d.unit))
                .map(d => ({ label: d.fullName, avgMs: d.durationMs, stddevMs: 0, n: 1 }))
                .sort((a, b) => b.avgMs - a.avgMs);
        } else {
            // Sem filtro: uma barra por unidade, média ± desvio padrão.
            const byUnit = new Map();
            data.forEach(d => {
                const unit = d.unit || 'Sem unidade';
                if (!byUnit.has(unit)) byUnit.set(unit, []);
                byUnit.get(unit).push(d.durationMs);
            });
            evalTimeDataCache = [...byUnit.entries()]
                .map(([unit, durations]) => {
                    const avg = mean(durations);
                    return { label: unit, avgMs: avg, stddevMs: stddev(durations, avg), n: durations.length };
                })
                .sort((a, b) => b.avgMs - a.avgMs);
        }

        // Barra "Geral" (cinza, sempre em 1º): média±desvio de TODOS os
        // aprovados, ignorando filtro de unidade — fica fixa mesmo com
        // unidade(s) marcada(s), pra servir de referência de comparação.
        // Sem dado nenhum não entra, senão o cache nunca fica vazio de
        // verdade e o card de "sem dados suficientes" nunca aparece.
        if (data.length > 0) {
            const allDurations = data.map(d => d.durationMs);
            const generalAvg = mean(allDurations);
            evalTimeDataCache.unshift({
                label: 'Geral', avgMs: generalAvg, stddevMs: stddev(allDurations, generalAvg),
                n: allDurations.length, isGeneral: true
            });
        }

        evalTimePage = 1;
        paintEvalTimePage();
    }

    // Taxa de conclusão do curso ao longo do tempo, em % do público-alvo:
    // acumula quem concluiu (última tentativa de cada pessoa) dia a dia e
    // divide pelo total de pessoas elegíveis. Não respeita o filtro de ano
    // do card (a curva precisa do histórico completo pra fazer sentido como
    // acumulado) — só o filtro de unidade, que também recalcula o total.
    function renderCourseCompletionTrendChart(allRows, audience) {
        const selectedUnits = courseChartUnitChip.getValues();
        const scopedRows = selectedUnits.size > 0
            ? allRows.filter(r => selectedUnits.has(r.unit))
            : allRows;
        const scopedAudience = selectedUnits.size > 0
            ? audience.filter(c => selectedUnits.has(c.unit))
            : audience;
        const total = scopedAudience.length || 1;

        // Só conta quem está no público-alvo válido do curso (mesmo critério
        // de courseAudience: ativo, vinculado à planilha, cargo compatível).
        // Sem esse filtro, gente inativa/inválida/de outro cargo que apareceu
        // no histórico inflava o acumulado além do denominador e passava de
        // 100% no gráfico.
        const audienceKeys = new Set();
        scopedAudience.forEach(colab => personKeysOfColaborador(colab).forEach(key => audienceKeys.add(key)));

        // "Concluiu" = data da 1ª tentativa APROVADA de cada pessoa, não a
        // última tentativa registrada — lastAttemptByPerson pegava a tentativa
        // mais recente mesmo quando era uma reprovação depois de já ter
        // passado, ou quando a pessoa refez o curso bem depois de concluído;
        // isso empurrava a data de conclusão pra frente (ou fazia sumir do
        // dia certo) e sub-contava o dia real de aprovação no gráfico.
        const byPerson = new Map();
        scopedRows.forEach(row => {
            if (!row.approved || !row.submittedAt) return;
            const keys = personKeysOfRow(row);
            const key = keys[0];
            if (!key) return;
            if (!keys.some(k => audienceKeys.has(k))) return;
            const current = byPerson.get(key);
            if (!current || row.submittedAt < current.submittedAt) byPerson.set(key, row);
        });
        const last = [...byPerson.values()].sort((a, b) => a.submittedAt - b.submittedAt);

        // Agrupa por dia (data local, sem hora) e acumula. Guarda também
        // quem concluiu em cada dia (nome/unidade/nota) pro clique no ponto.
        const byDay = new Map();
        last.forEach(r => {
            const day = new Date(r.submittedAt).toLocaleDateString('pt-BR');
            if (!byDay.has(day)) byDay.set(day, []);
            byDay.get(day).push({ fullName: r.fullName || 'Sem nome', unit: r.unit || 'Sem unidade', score: Number(r.score) });
        });

        // Eixo X em dias corridos desde o dia 1. Curso com prazo definido:
        // dia 1 é o início do prazo, não o dia da 1ª conclusão — se ninguém
        // concluiu nos primeiros dias, o gráfico começa "achatado" em vez de
        // já pular pra quando alguém passou, refletindo a adesão real dentro
        // da janela de prazo. Sem prazo definido: cai de volta pro 1º dia
        // com dado, como antes.
        const theme = allTrainingData[courseChartSlugCache]?.[courseChartSubjectIdCache]?.themes?.[courseChartThemeIdCache];
        const deadline = theme?.deadline;
        const dayKeys = [...byDay.keys()];
        // Zera a hora do início do prazo (mesmo critério de parseBrDate) —
        // senão um prazo começando às 14h deslocava a diferença em dias por
        // causa da fração de horas entre ele e a meia-noite das conclusões.
        const firstDay = (deadline?.mode === 'prazo' && deadline.startAt)
            ? parseBrDate(new Date(deadline.startAt).toLocaleDateString('pt-BR'))
            : (dayKeys.length ? parseBrDate(dayKeys[0]) : null);

        let running = 0;
        const labels = [];
        const dateLabels = [];
        const data = [];
        const runningCounts = [];
        const peopleByDay = [];
        dayKeys.forEach(day => {
            const people = byDay.get(day);
            running += people.length;
            const dayNum = firstDay ? Math.round((parseBrDate(day) - firstDay) / 86400000) + 1 : 1;
            labels.push(`${dayNum}º dia`);
            dateLabels.push(day);
            data.push(Math.min(100, Math.round((running / total) * 100)));
            runningCounts.push(running);
            peopleByDay.push(people);
        });

        renderChart('courseCompletionTrend', 'cfg-dash-course-completion-trend-chart', {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Taxa de conclusão', data,
                    borderColor: CHART_COLORS.accent, backgroundColor: CHART_COLORS.accent + '22',
                    fill: true, tension: 0.25, pointRadius: 2
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                onClick: (event, elements) => {
                    if (!elements.length) return;
                    const i = elements[0].index;
                    openPeopleModal(`Conclusões — ${labels[i]}`, `Data: ${dateLabels[i]}`, peopleByDay[i],
                        `${peopleByDay[i].length} concluíram neste dia (${runningCounts[i]} de ${total} no acumulado, ${data[i]}%)`);
                },
                onHover: (event, elements) => {
                    event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
                },
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: {
                        title: (items) => `${items[0].label} · ${dateLabels[items[0].dataIndex]}`,
                        label: (ctx) => `${runningCounts[ctx.dataIndex]} de ${total} concluíram (${ctx.parsed.y}%)`
                    } }
                },
                scales: { y: { min: 0, max: 100, ticks: { callback: (v) => `${v}%` } } }
            }
        });
    }

    // % de conclusão por unidade — denominador é o total de pessoas do
    // público-alvo daquela unidade (não só quem já concluiu), então a barra
    // mostra o quanto falta de fato. Paginado e ordenado da maior taxa para
    // a menor, mesmo critério visual do gráfico "Realização por Unidade".
    const UNIT_COMPLETION_PAGE_SIZE = 7;
    let unitCompletionPage = 1;
    let unitCompletionDataCache = [];

    function paintUnitCompletionPage() {
        const totalPages = Math.max(1, Math.ceil(unitCompletionDataCache.length / UNIT_COMPLETION_PAGE_SIZE));
        unitCompletionPage = Math.min(Math.max(1, unitCompletionPage), totalPages);
        const start = (unitCompletionPage - 1) * UNIT_COMPLETION_PAGE_SIZE;
        const pageUnits = unitCompletionDataCache.slice(start, start + UNIT_COMPLETION_PAGE_SIZE);

        renderChart('courseUnitCompletion', 'cfg-dash-course-unit-completion-chart', {
            type: 'bar',
            data: {
                labels: pageUnits.map(u => u.unit),
                datasets: [{ data: pageUnits.map(u => u.pct), backgroundColor: CHART_COLORS.accent, borderRadius: 4 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, indexAxis: 'y',
                onClick: (event, elements) => {
                    if (!elements.length) return;
                    const u = pageUnits[elements[0].index];
                    openProgressModal(u.unit, '', u.people, `${u.done} de ${u.total} concluíram (${u.pct}%)`);
                },
                onHover: (event, elements) => {
                    event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
                },
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => {
                        const u = pageUnits[ctx.dataIndex];
                        return `${u.done} de ${u.total} concluíram (${u.pct}%)`;
                    } } }
                },
                scales: { x: { min: 0, max: 100, ticks: { callback: (v) => `${v}%` } } }
            }
        });

        const pager = document.getElementById('cfg-dash-course-unit-completion-pagination');
        if (!pager) return;
        if (totalPages <= 1) { pager.innerHTML = ''; return; }
        pager.innerHTML = `<button type="button" class="comments-page-btn" data-page="prev" ${unitCompletionPage === 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>` +
            `<span class="comments-page-info">Página ${unitCompletionPage} de ${totalPages}</span>` +
            `<button type="button" class="comments-page-btn" data-page="next" ${unitCompletionPage === totalPages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>`;
        pager.querySelectorAll('.comments-page-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                unitCompletionPage += btn.dataset.page === 'prev' ? -1 : 1;
                paintUnitCompletionPage();
            });
        });
    }

    function renderCourseUnitCompletionChart(allRows, audience) {
        const doneKeys = new Set();
        lastAttemptByPerson(allRows).forEach(row => personKeysOfRow(row).forEach(key => doneKeys.add(key)));

        const byUnit = new Map();
        audience.forEach(colab => {
            const unit = colab.unit || 'Sem unidade';
            if (!byUnit.has(unit)) byUnit.set(unit, { total: 0, done: 0, people: [] });
            const entry = byUnit.get(unit);
            entry.total++;
            if (personKeysOfColaborador(colab).some(key => doneKeys.has(key))) entry.done++;
            // Progresso (% de módulos assistidos) de cada colaborador —
            // mesmo dado usado pela tabela "Faltam realizar", só que aqui
            // pra unidade inteira (concluídos entram com 100%).
            entry.people.push({
                fullName: colab.fullName,
                unit,
                pct: progressPctFor(colab, courseChartSlugCache, courseChartSubjectIdCache, courseChartThemeIdCache)
            });
        });

        unitCompletionDataCache = [...byUnit.entries()]
            .map(([unit, e]) => ({ unit, total: e.total, done: e.done, pct: e.total ? Math.round((e.done / e.total) * 100) : 0, people: e.people }))
            .sort((a, b) => b.pct - a.pct);
        unitCompletionPage = 1;
        paintUnitCompletionPage();
    }

    // Distribuição das notas de prova, arredondadas sem casa decimal (0-10),
    // coloridas por faixa: 10 verde, 8-9 limão, 6-7 amarelo, 4-5 laranja,
    // <4 vermelho.
    function scoreBarColor(score) {
        if (score >= 10) return CHART_COLORS.success;
        if (score >= 8) return CHART_COLORS.lime;
        if (score >= 6) return CHART_COLORS.yellow;
        if (score >= 4) return CHART_COLORS.orange;
        return CHART_COLORS.danger;
    }

    function renderCourseScoresChart(rows) {
        const counts = new Array(11).fill(0); // índice 0..10
        const peopleByScore = Array.from({ length: 11 }, () => []); // pessoas por nota, pra clique na barra
        let total = 0;
        rows.forEach(r => {
            const score = Number(r.score);
            if (!Number.isFinite(score)) return;
            // Arredonda pra baixo, não pro mais próximo — nota 9,5 é nota 9,
            // não deve inflar a barra do 10 (critério de aprovação é por
            // nota cheia, não por proximidade).
            const rounded = Math.min(10, Math.max(0, Math.floor(score)));
            counts[rounded]++;
            peopleByScore[rounded].push({ fullName: r.fullName || 'Sem nome', unit: r.unit || 'Sem unidade', score });
            total++;
        });

        renderChart('courseScores', 'cfg-dash-course-scores-chart', {
            type: 'bar',
            data: {
                labels: counts.map((_, score) => String(score)),
                datasets: [{ data: counts, backgroundColor: counts.map((_, score) => scoreBarColor(score)), borderRadius: 4 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                onClick: (event, elements) => {
                    if (!elements.length) return;
                    const score = elements[0].index;
                    const pct = total > 0 ? Math.round((counts[score] / total) * 100) : 0;
                    openPeopleModal(`Nota ${score}`, '', peopleByScore[score],
                        `${counts[score]} de ${total} colaboradores tiraram nota ${score} (${pct}%)`);
                },
                onHover: (event, elements) => {
                    event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
                },
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => {
                        // Chart vertical: valor real vem de parsed.y, não .x
                        // (singleSeriesTooltipLabel assume barra horizontal e
                        // pegaria o rótulo do eixo x — a própria nota — como
                        // se fosse a contagem).
                        const value = Number(ctx.parsed.y) || 0;
                        const pct = total > 0 ? Math.round((value / total) * 100) : 0;
                        return `${value} (${pct}%)`;
                    } } }
                },
                scales: { x: { title: { display: true, text: 'Nota' } }, y: { ticks: { precision: 0 } } }
            }
        });
    }

    // Faixa de nota para o empilhado por unidade: 10 verde, 8-9 limão, 6-7
    // laranja, <6 crítico (vermelho) — critério pedido explicitamente,
    // diferente das 5 faixas de scoreBarColor (que tem uma faixa a mais,
    // 4-5, usada só no histograma "Notas").
    const SCORE_BAND_DEFS = [
        { key: 'nota10', label: 'Nota 10', color: CHART_COLORS.success, test: (s) => s >= 10 },
        { key: 'nota89', label: 'Nota 8-9', color: CHART_COLORS.lime, test: (s) => s >= 8 },
        { key: 'nota67', label: 'Nota 6-7', color: CHART_COLORS.orange, test: (s) => s >= 6 },
        { key: 'critico', label: 'Crítico (<6)', color: CHART_COLORS.danger, test: () => true }
    ];
    function scoreBand(score) { return SCORE_BAND_DEFS.find(b => b.test(score)); }

    // Notas por unidade, empilhadas por faixa (uma pessoa conta pela sua
    // última tentativa, mesmo critério dos demais gráficos "por pessoa") e
    // normalizadas em % da unidade — dá pra comparar unidades com números
    // de gente bem diferentes. Ordenado pela pior situação primeiro (maior %
    // crítico) pra chamar atenção de quem precisa de reforço. Paginado como
    // os outros gráficos "por unidade".
    const SCORES_BYUNIT_PAGE_SIZE = 7;
    let scoresByUnitPage = 1;
    let scoresByUnitDataCache = [];

    function paintScoresByUnitPage() {
        const totalPages = Math.max(1, Math.ceil(scoresByUnitDataCache.length / SCORES_BYUNIT_PAGE_SIZE));
        scoresByUnitPage = Math.min(Math.max(1, scoresByUnitPage), totalPages);
        const start = (scoresByUnitPage - 1) * SCORES_BYUNIT_PAGE_SIZE;
        const pageUnits = scoresByUnitDataCache.slice(start, start + SCORES_BYUNIT_PAGE_SIZE);

        renderChart('courseScoresByUnit', 'cfg-dash-course-scores-byunit-chart', {
            type: 'bar',
            data: {
                // Rótulo é só o nome da unidade: em duas linhas (nome + média) o
                // texto não cabia na altura da barra e o autoSkip do eixo
                // escondia parte das unidades. A média vive no tooltip.
                labels: pageUnits.map(u => u.unit),
                datasets: SCORE_BAND_DEFS.map(band => ({
                    label: band.label, backgroundColor: band.color,
                    data: pageUnits.map(u => u.total ? (u.counts[band.key] / u.total) * 100 : 0)
                }))
            },
            options: {
                responsive: true, maintainAspectRatio: false, indexAxis: 'y',
                onClick: (event, elements) => {
                    if (!elements.length) return;
                    const { datasetIndex, index } = elements[0];
                    const u = pageUnits[index];
                    const band = SCORE_BAND_DEFS[datasetIndex];
                    const count = u.counts[band.key];
                    const pct = u.total > 0 ? Math.round((count / u.total) * 100) : 0;
                    openPeopleModal(`${band.label} — ${u.unit}`, '', u.people[band.key],
                        `${count} de ${u.total} colaboradores da unidade (${pct}%) • média da unidade ${u.avg === null ? '—' : formatScore(u.avg)}`);
                },
                onHover: (event, elements) => {
                    event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
                },
                plugins: {
                    // Tooltip por categoria (mode 'index' no eixo y): passar o
                    // mouse na barra da unidade lista TODAS as faixas dela, não
                    // só a faixa exata sob o cursor. As faixas zeradas ficam de
                    // fora (`filter`) pra não poluir com "Nota 6-7: 0 (0%)".
                    // Só o tooltip usa 'index' — o onClick continua no padrão
                    // 'nearest'/intersect, senão clicar abriria sempre a
                    // primeira faixa em vez da clicada.
                    tooltip: {
                        mode: 'index', intersect: false, axis: 'y',
                        filter: (item) => (Number(item.parsed.x) || 0) > 0,
                        callbacks: {
                            title: (items) => {
                                const u = pageUnits[items[0].dataIndex];
                                return [u.unit, `média ${u.avg === null ? '—' : formatScore(u.avg)} • ${u.total} ${u.total === 1 ? 'pessoa' : 'pessoas'}`];
                            },
                            label: (ctx) => {
                                const u = pageUnits[ctx.dataIndex];
                                const band = SCORE_BAND_DEFS[ctx.datasetIndex];
                                const count = u.counts[band.key];
                                return `${band.label}: ${count} (${Math.round(ctx.parsed.x)}%)`;
                            }
                        }
                    }
                },
                // autoSkip: false no eixo das unidades — com muitas barras o
                // Chart.js escondia rótulos e a unidade aparecia sem nome.
                scales: {
                    x: { stacked: true, min: 0, max: 100, ticks: { callback: (v) => `${v}%` } },
                    y: { stacked: true, ticks: { autoSkip: false } }
                }
            }
        });

        const pager = document.getElementById('cfg-dash-course-scores-byunit-pagination');
        if (!pager) return;
        if (totalPages <= 1) { pager.innerHTML = ''; return; }
        pager.innerHTML = `<button type="button" class="comments-page-btn" data-page="prev" ${scoresByUnitPage === 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>` +
            `<span class="comments-page-info">Página ${scoresByUnitPage} de ${totalPages}</span>` +
            `<button type="button" class="comments-page-btn" data-page="next" ${scoresByUnitPage === totalPages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>`;
        pager.querySelectorAll('.comments-page-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                scoresByUnitPage += btn.dataset.page === 'prev' ? -1 : 1;
                paintScoresByUnitPage();
            });
        });
    }

    function renderCourseScoresByUnitChart(rows) {
        const byUnit = new Map();
        lastAttemptByPerson(rows).forEach(r => {
            const score = Number(r.score);
            if (!Number.isFinite(score)) return;
            const unit = r.unit || 'Sem unidade';
            if (!byUnit.has(unit)) byUnit.set(unit, {
                total: 0, scoreSum: 0,
                counts: { nota10: 0, nota89: 0, nota67: 0, critico: 0 },
                people: { nota10: [], nota89: [], nota67: [], critico: [] }
            });
            const entry = byUnit.get(unit);
            entry.total++;
            entry.scoreSum += score;
            const band = scoreBand(score).key;
            entry.counts[band]++;
            entry.people[band].push({ fullName: r.fullName || 'Sem nome', unit, score });
        });

        scoresByUnitDataCache = [...byUnit.entries()]
            .map(([unit, e]) => ({ unit, total: e.total, counts: e.counts, people: e.people, avg: e.total ? e.scoreSum / e.total : null }))
            .sort((a, b) => (b.total ? b.counts.critico / b.total : 0) - (a.total ? a.counts.critico / a.total : 0));
        scoresByUnitPage = 1;
        paintScoresByUnitPage();
    }

    // Ranking das questões com mais erros, do maior para o menor — ajuda a
    // localizar perguntas mal formuladas ou conteúdo pouco compreendido.
    // Agrupa por enunciado (mesma questão pode mudar de índice entre
    // versões do quiz) e mostra só o trecho inicial no eixo, enunciado
    // completo no tooltip.
    const MISTAKES_TOP_N = 8;

    function renderCourseMistakesChart(rows) {
        const canvas = document.getElementById('cfg-dash-course-mistakes-chart');
        if (!canvas) return;

        // Conta por PESSOA, não por tentativa — quem errou a mesma questão
        // em várias retentativas entra só uma vez (senão retentativa infla
        // artificialmente a taxa de erro de uma questão fácil).
        // Denominador da % é o total de pessoas que concluíram o curso
        // (universo fixo, igual pra todas as questões) — não só quem
        // respondeu aquela questão específica, senão quem pulou/não chegou
        // nela infla a taxa de erro artificialmente.
        const totalPeople = new Set();
        const stats = new Map(); // enunciado -> { number, question, options, correct, wrongPeople: Map<personKey, {fullName, unit, selected}> }
        rows.forEach(r => {
            const personKey = personKeysOfRow(r)[0];
            if (!personKey) return;
            totalPeople.add(personKey);
            (r.answers || []).forEach((a, index) => {
                if (!a || !a.question) return;
                const key = a.question;
                const entry = stats.get(key) || {
                    number: index + 1, question: a.question,
                    options: Array.isArray(a.options) ? a.options : [], correct: a.correct,
                    wrongPeople: new Map()
                };
                if (a.selected !== a.correct) entry.wrongPeople.set(personKey, { fullName: r.fullName || 'Sem nome', unit: r.unit || 'Sem unidade', selected: a.selected });
                stats.set(key, entry);
            });
        });

        const ranked = Array.from(stats.values())
            .map(e => ({
                number: e.number, question: e.question, options: e.options, correct: e.correct,
                wrong: e.wrongPeople.size, total: totalPeople.size, wrongPeople: Array.from(e.wrongPeople.values())
            }))
            .filter(e => e.wrong > 0)
            .sort((a, b) => b.wrong - a.wrong)
            .slice(0, MISTAKES_TOP_N);

        if (ranked.length === 0) {
            renderChart('courseMistakes', 'cfg-dash-course-mistakes-chart', {
                type: 'bar', data: { labels: [], datasets: [] },
                options: { responsive: true, maintainAspectRatio: false }
            });
            return;
        }

        // Quebra o enunciado em linhas curtas por palavra inteira — Chart.js
        // renderiza um array de strings do callback `label` como um tooltip
        // multi-linha.
        const wrapText = (text, maxLen = 42) => {
            const words = text.trim().split(/\s+/);
            const lines = [];
            let line = '';
            words.forEach(word => {
                const candidate = line ? `${line} ${word}` : word;
                if (candidate.length > maxLen && line) {
                    lines.push(line);
                    line = word;
                } else {
                    line = candidate;
                }
            });
            if (line) lines.push(line);
            return lines;
        };

        const errorPct = (e) => e.total > 0 ? (e.wrong / e.total) * 100 : 0;

        // Cor pela TAXA de erro (% de alunos que erraram), não pelo nº
        // absoluto de erros que o eixo x mostra — amarelo até 5%, laranja até
        // 10%, vermelho acima disso. Quando a barra cruza um desses limiares
        // (ex.: taxa de 39% numa barra que representa 0%–39%), o degradê
        // marca a transição de faixa dentro do próprio trecho da barra;
        // acima de 10% a barra já nasce vermelha (sem faixas anteriores pra
        // mostrar).
        const mistakeGradient = (ctx) => {
            const { chart, dataIndex } = ctx;
            const { ctx: c, chartArea } = chart;
            if (!chartArea || dataIndex == null) return CHART_COLORS.danger;
            const entry = ranked[dataIndex];
            const pct = errorPct(entry);

            // Gradiente tem que cobrir só o trecho da barra (0 até o valor
            // dela no eixo x), não o chartArea inteiro — senão a barra mais
            // curta mostra uma fatia do degradê pensado pra barra mais longa
            // e as faixas de cor saem desalinhadas com a % real de erro.
            const xScale = chart.scales.x;
            const barStart = chartArea.left;
            const barEnd = xScale ? xScale.getPixelForValue(entry.wrong) : chartArea.right;

            if (pct <= 5) return CHART_COLORS.yellow;

            // Transição levemente suave entre faixas (blend de ~4% da barra
            // em vez de corte seco) — evita degradê brusco entre as cores.
            const BLEND = 0.04;
            const blendAround = (stop) => [Math.max(0, stop - BLEND), Math.min(1, stop + BLEND)];

            const gradient = c.createLinearGradient(barStart, 0, barEnd, 0);
            if (pct <= 10) {
                // Cruza só o limiar amarelo→laranja: sólida até proporção
                // 5/pct da barra, laranja no resto.
                const split = 5 / pct;
                const [a, b] = blendAround(split);
                gradient.addColorStop(0, CHART_COLORS.yellow);
                gradient.addColorStop(a, CHART_COLORS.yellow);
                gradient.addColorStop(b, CHART_COLORS.orange);
                gradient.addColorStop(1, CHART_COLORS.orange);
                return gradient;
            }
            // Acima de 10%: cruza as duas faixas — amarelo até 5%, laranja
            // até 10%, vermelho no resto (posições proporcionais a pct).
            const yellowSplit = 5 / pct;
            const orangeSplit = 10 / pct;
            const [ya, yb] = blendAround(yellowSplit);
            const [oa, ob] = blendAround(orangeSplit);
            gradient.addColorStop(0, CHART_COLORS.yellow);
            gradient.addColorStop(ya, CHART_COLORS.yellow);
            gradient.addColorStop(Math.min(yb, oa - 0.001), CHART_COLORS.orange);
            gradient.addColorStop(oa, CHART_COLORS.orange);
            gradient.addColorStop(ob, CHART_COLORS.danger);
            gradient.addColorStop(1, CHART_COLORS.danger);
            return gradient;
        };

        renderChart('courseMistakes', 'cfg-dash-course-mistakes-chart', {
            type: 'bar',
            data: {
                labels: ranked.map(e => `Questão ${e.number}`),
                datasets: [{ data: ranked.map(e => e.wrong), backgroundColor: mistakeGradient, borderRadius: 4 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, indexAxis: 'y',
                onClick: (event, elements) => {
                    if (!elements.length) return;
                    openMistakeModal(ranked[elements[0].index]);
                },
                onHover: (event, elements) => {
                    event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
                },
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: {
                        title: (items) => `Questão ${ranked[items[0].dataIndex].number}`,
                        label: (ctx) => wrapText(ranked[ctx.dataIndex].question),
                        afterLabel: (ctx) => {
                            const e = ranked[ctx.dataIndex];
                            return `Erros: ${e.wrong} de ${e.total} (${Math.round(errorPct(e))}%)`;
                        }
                    } }
                },
                scales: { x: { ticks: { precision: 0 } } }
            }
        });
    }

    // ─── Modal "quem errou": colaboradores por unidade que erraram a
    // questão clicada no gráfico "Principais Erros" ───
    const mistakeModal = document.getElementById('cfg-dash-mistake-modal');
    const mistakeModalTitle = document.getElementById('cfg-dash-mistake-modal-title');
    const mistakeModalClose = document.getElementById('cfg-dash-mistake-modal-close');
    const mistakeModalSubtitle = document.getElementById('cfg-dash-mistake-modal-subtitle');
    const mistakeModalBody = document.getElementById('cfg-dash-mistake-modal-body');

    function closeMistakeModal() { if (mistakeModal) mistakeModal.style.display = 'none'; }

    // Modal genérico "lista de colaboradores por unidade" — usado pelo
    // clique nas barras de Principais Erros, Notas e Notas por Unidade.
    // `people`: array de {fullName, unit, score?} — `score`, quando presente
    // (gráficos de nota), mostra a nota exata do aluno ao lado do nome.
    // `countLabel`: texto do resumo no topo (já pronto, cada gráfico formata o seu).
    function openPeopleModal(title, subtitle, people, countLabel) {
        if (!mistakeModal) return;
        if (mistakeModalTitle) mistakeModalTitle.textContent = title;
        if (mistakeModalSubtitle) mistakeModalSubtitle.textContent = subtitle || '';
        if (mistakeModalBody) {
            const byUnit = new Map();
            people
                .slice()
                .sort((a, b) => a.fullName.localeCompare(b.fullName, 'pt-BR'))
                .forEach(p => {
                    const unit = p.unit || 'Sem unidade';
                    if (!byUnit.has(unit)) byUnit.set(unit, []);
                    byUnit.get(unit).push(p);
                });
            const units = Array.from(byUnit.entries()).sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
            mistakeModalBody.innerHTML = (countLabel ? `<p class="dash-mistake-modal-count">${countLabel}</p>` : '') +
                (units.length === 0 ? emptyStateHtml('fa-users', 'Nenhum colaborador encontrado.') :
                units.map(([unit, unitPeople]) => `
                    <div class="dash-mistake-unit-group">
                        <h3><i class="fas fa-building"></i> ${escapeHtml(unit)} <span class="tab-count">${unitPeople.length}</span></h3>
                        <ul class="dash-mistake-name-list">${unitPeople.map(p => `<li><span class="row-name">${avatarHtml(p.fullName)} ${escapeHtml(p.fullName)}</span>${Number.isFinite(p.score) ? scoreBadgeHtml(p.score) : ''}</li>`).join('')}</ul>
                    </div>
                `).join(''));
        }
        mistakeModal.style.display = 'flex';
    }

    // Letra da alternativa (0 -> a, 1 -> b, ...) usada no Gabarito e no balão
    // ao lado do nome de quem errou (mostra qual alternativa a pessoa marcou).
    function optionLetter(index) {
        return String.fromCharCode(97 + index);
    }

    // Modal "Questão N": mostra o gabarito completo (todas as alternativas,
    // correta destacada em verde) com uma barra de volume por alternativa —
    // só contando quem ERROU (a base de dados só guarda quem errou cada
    // questão, ver renderCourseMistakesChart; a alternativa correta nunca
    // aparece na barra pois por definição ninguém que a marcou está em
    // wrongPeople) — seguida da lista de colaboradores que erraram, por
    // unidade, como já era.
    function openMistakeModal(entry) {
        const pct = entry.total > 0 ? Math.round((entry.wrong / entry.total) * 100) : 0;
        if (!mistakeModal) return;
        if (mistakeModalTitle) mistakeModalTitle.textContent = `Questão ${entry.number}`;
        if (mistakeModalSubtitle) mistakeModalSubtitle.textContent = entry.question || '';

        // Volume de erros por alternativa escolhida (índice -> contagem).
        const countsByOption = new Map();
        entry.wrongPeople.forEach(p => {
            if (!Number.isFinite(p.selected)) return;
            countsByOption.set(p.selected, (countsByOption.get(p.selected) || 0) + 1);
        });
        const maxCount = Math.max(1, ...countsByOption.values());

        const answerKeyHtml = (entry.options || []).length === 0 ? '' : `
            <div class="dash-mistake-answerkey">
                <h3>Gabarito</h3>
                ${entry.options.map((opt, i) => {
                    const isCorrect = i === entry.correct;
                    const count = countsByOption.get(i) || 0;
                    const barPct = isCorrect ? 0 : Math.round((count / maxCount) * 100);
                    return `
                        <div class="dash-mistake-option ${isCorrect ? 'is-correct' : ''}">
                            <div class="dash-mistake-option-row">
                                <span class="dash-mistake-option-text">${isCorrect ? '<i class="fas fa-check-circle"></i> ' : ''}<b class="dash-mistake-option-letter">${optionLetter(i)}.</b> ${escapeHtml(opt)}</span>
                                <span class="dash-mistake-option-count">${isCorrect ? 'Correta' : `${count} ${count === 1 ? 'pessoa' : 'pessoas'}`}</span>
                            </div>
                            ${isCorrect ? '' : `<div class="dash-mistake-option-bar"><span style="width:${count > 0 ? Math.max(barPct, 4) : 0}%"></span></div>`}
                        </div>
                    `;
                }).join('')}
            </div>
        `;

        if (mistakeModalBody) {
            const byUnit = new Map();
            entry.wrongPeople
                .slice()
                .sort((a, b) => a.fullName.localeCompare(b.fullName, 'pt-BR'))
                .forEach(p => {
                    const unit = p.unit || 'Sem unidade';
                    if (!byUnit.has(unit)) byUnit.set(unit, []);
                    byUnit.get(unit).push(p);
                });
            const units = Array.from(byUnit.entries()).sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
            mistakeModalBody.innerHTML = answerKeyHtml +
                `<p class="dash-mistake-modal-count">${entry.wrong} de ${entry.total} colaboradores erraram (${pct}%)</p>` +
                (units.length === 0 ? emptyStateHtml('fa-users', 'Nenhum colaborador encontrado.') :
                units.map(([unit, unitPeople]) => `
                    <div class="dash-mistake-unit-group">
                        <h3><i class="fas fa-building"></i> ${escapeHtml(unit)} <span class="tab-count">${unitPeople.length}</span></h3>
                        <ul class="dash-mistake-name-list">${unitPeople.map(p => `<li><span class="row-name">${avatarHtml(p.fullName)} ${escapeHtml(p.fullName)}</span>${Number.isFinite(p.selected) ? `<span class="dash-mistake-option-chip">${optionLetter(p.selected)}</span>` : ''}</li>`).join('')}</ul>
                    </div>
                `).join(''));
        }
        mistakeModal.style.display = 'flex';
    }

    // Modal de PROGRESSO por unidade — mesma estrutura do modal de pessoas,
    // mas cada linha mostra a barra de % assistido em vez da nota (usado
    // pelo clique nas barras de "Taxa de Conclusão por Unidade", mesmo
    // visual da tabela "Faltam realizar").
    // `people`: array de {fullName, unit, pct}.
    function openProgressModal(title, subtitle, people, countLabel) {
        if (!mistakeModal) return;
        if (mistakeModalTitle) mistakeModalTitle.textContent = title;
        if (mistakeModalSubtitle) mistakeModalSubtitle.textContent = subtitle || '';
        if (mistakeModalBody) {
            const byUnit = new Map();
            people
                .slice()
                .sort((a, b) => b.pct - a.pct || a.fullName.localeCompare(b.fullName, 'pt-BR'))
                .forEach(p => {
                    const unit = p.unit || 'Sem unidade';
                    if (!byUnit.has(unit)) byUnit.set(unit, []);
                    byUnit.get(unit).push(p);
                });
            const units = Array.from(byUnit.entries()).sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
            mistakeModalBody.innerHTML = (countLabel ? `<p class="dash-mistake-modal-count">${countLabel}</p>` : '') +
                (units.length === 0 ? emptyStateHtml('fa-users', 'Nenhum colaborador encontrado.') :
                units.map(([unit, unitPeople]) => `
                    <div class="dash-mistake-unit-group">
                        <h3><i class="fas fa-building"></i> ${escapeHtml(unit)} <span class="tab-count">${unitPeople.length}</span></h3>
                        <ul class="dash-mistake-name-list">${unitPeople.map(p => `
                            <li>
                                <span class="row-name">${avatarHtml(p.fullName)} ${escapeHtml(p.fullName)}</span>
                                <div class="missing-progress" title="${p.pct}% assistido">
                                    <div class="missing-progress-bar"><span class="${progressToneClass(p.pct)}" style="width:${p.pct}%"></span></div>
                                    <span class="missing-progress-pct">${p.pct}%</span>
                                </div>
                            </li>
                        `).join('')}</ul>
                    </div>
                `).join(''));
        }
        mistakeModal.style.display = 'flex';
    }

    mistakeModalClose?.addEventListener('click', closeMistakeModal);
    mistakeModal?.addEventListener('click', (event) => { if (event.target === mistakeModal) closeMistakeModal(); });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && mistakeModal?.style.display === 'flex') closeMistakeModal();
    });

    async function renderCourseDashboard(slug, courseKey) {
        const [subjectId, themeId] = courseKey.split('_');
        courseChartSlugCache = slug;
        courseChartSubjectIdCache = subjectId;
        courseChartThemeIdCache = themeId;

        const rows = await fetchCourseResults(slug, subjectId, themeId);

        // "Realização do curso": denominador = público-alvo do curso (mesma
        // base de courseAudience usada nos cards e na tabela "Faltam
        // realizar"), não só contas de login — evita subestimar "Realizou"
        // quando boa parte das conclusões vem de colaboradores sem conta
        // própria (estágio livre, importados).
        const theme = allTrainingData[slug]?.[subjectId]?.themes?.[themeId];
        courseChartExpectedMsCache = expectedCompletionMsOf(theme);
        let realizou, faltaram;
        if (theme && !AUDIENCE_EXEMPT_SLUGS.includes(slug)) {
            const doneKeys = new Set();
            rows.forEach(row => personKeysOfRow(row).forEach(key => doneKeys.add(key)));
            const audience = courseAudience(theme);
            realizou = audience.filter(colab => personKeysOfColaborador(colab).some(key => doneKeys.has(key))).length;
            faltaram = Math.max(0, audience.length - realizou);
            courseChartAudienceCache = audience;
        } else {
            // Sem público-alvo definido (ex.: estágios): volta ao total de
            // contas cadastradas, mesmo critério de antes.
            const totalUsers = Object.keys(allUsers).length;
            realizou = rows.filter(r => r.userId).length;
            faltaram = Math.max(0, totalUsers - realizou);
            courseChartAudienceCache = Object.keys(allColaboradores)
                .map(id => ({ id, ...allColaboradores[id] }))
                .filter(c => c.fullName && c.active !== false && c.inSheet !== false);
        }
        renderChart('courseCompletion', 'cfg-dash-course-completion-chart', {
            type: 'pie',
            data: { labels: ['Realizou', 'Falta'], datasets: [{ data: [realizou, faltaram], backgroundColor: [CHART_COLORS.accent, CHART_COLORS.danger] }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { tooltip: { callbacks: { label: (ctx) => pieTooltipLabel(ctx) } } } }
        });

        renderCommentsTable(rows);

        renderCompletedTable(rows, slug, subjectId, themeId);
        if (theme) renderMissingTable(rows, slug, subjectId, { ...theme, id: themeId });

        courseChartRowsCache = rows;
        courseChartYearChip.setYears(yearsFromRows(rows));
        renderCourseCharts(rows);

        renderCourseHero(rows, theme, realizou);
        updateTabCounts(rows);
    }

    // Quantos precisaram de mais de uma tentativa para passar — sinaliza
    // dificuldade real do curso (prova mal calibrada, conteúdo confuso etc).
    function renderCourseRetriesChart(rows) {
        const people = attemptsByPerson(rows);
        const firstTry = people.filter(p => p.approved && p.attempts === 1).length;
        const retried = people.filter(p => p.approved && p.attempts > 1).length;
        const stillFailed = people.filter(p => !p.approved).length;
        renderChart('courseRetries', 'cfg-dash-course-retries-chart', {
            type: 'bar',
            data: {
                labels: ['Retentativas'],
                datasets: [
                    { label: 'Aprovado na 1ª tentativa', data: [firstTry], backgroundColor: CHART_COLORS.success },
                    { label: 'Aprovado após retentativa', data: [retried], backgroundColor: CHART_COLORS.warning },
                    { label: 'Ainda reprovado', data: [stillFailed], backgroundColor: CHART_COLORS.danger }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false, indexAxis: 'y',
                plugins: { tooltip: { callbacks: { label: (ctx) => percentTooltipLabel(ctx) } } },
                scales: { x: { stacked: true, ticks: { precision: 0 } }, y: { stacked: true } }
            }
        });
    }

    // Comparativo de realização por unidade — ajuda o gestor a identificar
    // qual unidade está atrasada para cobrar localmente. Paginado: com muitas
    // unidades o gráfico ficava espremido demais para ler.
    const BYUNIT_PAGE_SIZE = 7;
    let byUnitPage = 1;
    let byUnitDataCache = [];

    function paintByUnitPage() {
        const totalPages = Math.max(1, Math.ceil(byUnitDataCache.length / BYUNIT_PAGE_SIZE));
        byUnitPage = Math.min(Math.max(1, byUnitPage), totalPages);
        const start = (byUnitPage - 1) * BYUNIT_PAGE_SIZE;
        const pageUnits = byUnitDataCache.slice(start, start + BYUNIT_PAGE_SIZE);

        renderChart('courseByUnit', 'cfg-dash-course-byunit-chart', {
            type: 'bar',
            data: {
                labels: pageUnits.map(u => u.unit),
                datasets: [
                    { label: 'No prazo', data: pageUnits.map(u => u.onTime), backgroundColor: CHART_COLORS.accent },
                    { label: 'Fora do prazo', data: pageUnits.map(u => u.late), backgroundColor: CHART_COLORS.danger }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false, indexAxis: 'y',
                plugins: { tooltip: { callbacks: { label: (ctx) => percentTooltipLabel(ctx) } } },
                scales: { x: { stacked: true, ticks: { precision: 0 } }, y: { stacked: true } }
            }
        });

        const pager = document.getElementById('cfg-dash-course-byunit-pagination');
        if (!pager) return;
        if (totalPages <= 1) { pager.innerHTML = ''; return; }
        pager.innerHTML = `<button type="button" class="comments-page-btn" data-page="prev" ${byUnitPage === 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>` +
            `<span class="comments-page-info">Página ${byUnitPage} de ${totalPages}</span>` +
            `<button type="button" class="comments-page-btn" data-page="next" ${byUnitPage === totalPages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>`;
        pager.querySelectorAll('.comments-page-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                byUnitPage += btn.dataset.page === 'prev' ? -1 : 1;
                paintByUnitPage();
            });
        });
    }

    function renderCourseByUnitChart(rows) {
        const byUnit = new Map();
        lastAttemptByPerson(rows).forEach(r => {
            const unit = r.unit || 'Sem unidade';
            if (!byUnit.has(unit)) byUnit.set(unit, { onTime: 0, late: 0 });
            const entry = byUnit.get(unit);
            if (['on_time', 'livre', 'forgiven'].includes(r.deadlineStatus)) entry.onTime++; else entry.late++;
        });
        const units = [...byUnit.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
        byUnitDataCache = units.map(unit => ({ unit, ...byUnit.get(unit) }));
        byUnitPage = 1;
        paintByUnitPage();
    }

    function formatShortDate(timestamp) {
        if (!timestamp) return '—';
        return new Date(timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    // Resumo rápido no topo do modal: concluídos, pendentes, média, tempo
    // médio de prova, tempo médio de conclusão (do início ao aprovado) e o
    // prazo do curso (quando configurado) — panorama sem trocar de aba.
    function renderCourseHero(rows, theme, realizou) {
        if (!courseHeroStats) return;
        const scores = rows.map(r => Number(r.score) || 0);
        const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1).replace('.', ',') : '—';
        const pendentes = missingRowsCache.length;
        const durationLabel = formatDuration(avgDuration(rows));

        const completionTimes = buildCompletionTimeData(rows, courseChartSlugCache);
        const avgCompletionLabel = completionTimes.length
            ? formatHHMMSS(completionTimes.reduce((sum, d) => sum + d.durationMs, 0) / completionTimes.length)
            : '—';

        // Tempo de conclusão esperado configurado no curso (Config > Cursos >
        // Editar Curso). Chip só aparece quando definido.
        const expectedMs = expectedCompletionMsOf(theme);

        const deadline = theme?.deadline;
        const deadlineLabel = deadline?.mode === 'prazo' && (deadline.startAt || deadline.endAt)
            ? `${formatShortDate(deadline.startAt)} - ${formatShortDate(deadline.endAt)}`
            : null;

        // "Concluídos" = pessoas únicas, não rows.length — rows.length conta
        // cada tentativa, então quem se reavalia depois de já ter passado
        // inflava o número além da quantidade real de gente (destoando do
        // gráfico "Taxa de Conclusão do Curso", que já dedupa por pessoa).
        const concluidos = realizou ?? new Set(rows.flatMap(r => personKeysOfRow(r))).size;

        courseHeroStats.innerHTML = `
            <span class="hero-stat is-ok"><i class="fas fa-circle-check"></i> ${concluidos} ${concluidos === 1 ? 'concluído' : 'concluídos'}</span>
            <span class="hero-stat is-warn"><i class="fas fa-hourglass-half"></i> ${pendentes} ${pendentes === 1 ? 'pendente' : 'pendentes'}</span>
            <span class="hero-stat"><i class="fas fa-star"></i> Média ${avg}</span>
            <span class="hero-stat"><i class="fas fa-clock"></i> Tempo médio de prova ${durationLabel}</span>
            <span class="hero-stat"><i class="fas fa-hourglass-end"></i> Tempo médio de conclusão ${avgCompletionLabel}</span>
            ${deadlineLabel ? `<span class="hero-stat"><i class="fas fa-calendar-days"></i> Prazo: ${deadlineLabel}</span>` : ''}
            ${expectedMs ? `<span class="hero-stat"><i class="fas fa-stopwatch"></i> Tempo esperado: ${formatHHMMSS(expectedMs)}</span>` : ''}
        `;
    }

    function updateTabCounts(rows) {
        const conclusionsCount = document.getElementById('cfg-dash-course-tabcount-conclusions');
        const infoCount = document.getElementById('cfg-dash-course-tabcount-info');
        if (conclusionsCount) conclusionsCount.textContent = String(rows.length);
        if (infoCount) infoCount.textContent = String(rows.filter(r => r.comment).length);
    }

    // ─── Modal do curso: Informações / Gráficos + Resetar curso ───
    const courseModal = document.getElementById('cfg-dash-course-modal');
    const courseModalTitle = document.getElementById('cfg-dash-course-modal-title');
    const courseModalClose = document.getElementById('cfg-dash-course-modal-close');
    const courseResetBtn = document.getElementById('cfg-dash-course-reset-btn');
    const courseHeroThumb = document.getElementById('cfg-dash-course-hero-thumb');
    const courseHeroStats = document.getElementById('cfg-dash-course-hero-stats');
    let openCourseSlug = null;
    let openCourseKey = null;
    let openCourseName = null;

    function openCourseModal(slug, courseKey, themeName, extra) {
        openCourseSlug = slug;
        openCourseKey = courseKey;
        openCourseName = themeName;
        courseModalTitle.textContent = themeName || 'Curso';

        if (courseHeroThumb) {
            courseHeroThumb.innerHTML = '';
            if (extra?.thumb) {
                const img = document.createElement('img');
                img.src = extra.thumb;
                img.alt = '';
                img.onerror = () => { courseHeroThumb.textContent = themeInitials(themeName); };
                courseHeroThumb.appendChild(img);
            } else {
                courseHeroThumb.textContent = themeInitials(themeName);
            }
        }

        courseModal.querySelectorAll('.dash-course-modal-tabs .tab-btn').forEach((btn, i) => btn.classList.toggle('active', i === 0));
        courseModal.querySelectorAll('.dash-course-modal-body .tab-content').forEach((tab, i) => tab.classList.toggle('active', i === 0));
        courseModal.style.display = 'flex';
        renderCourseDashboard(slug, courseKey);
    }

    function closeCourseModal() { courseModal.style.display = 'none'; }

    courseModal?.querySelectorAll('.dash-course-modal-tabs .tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            courseModal.querySelectorAll('.dash-course-modal-tabs .tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const target = btn.dataset.dashCourseTab;
            courseModal.querySelectorAll('.dash-course-modal-body .tab-content').forEach(tab => {
                tab.classList.toggle('active', tab.id === `cfg-dash-course-tab-${target}`);
            });
            // Os gráficos da aba "Gráficos" (incl. "Tempo para Conclusão" e
            // "...da Avaliação") são desenhados enquanto essa aba ainda está
            // display:none (tab não ativa por padrão) — o Chart.js mede
            // altura 0 nesse momento e congela um layout achatado, cujas
            // coordenadas internas (usadas pelo stddevWhiskerPlugin pra
            // posicionar a barra de erro) ficam fora de sincronia com o que
            // a barra aparenta ocupar depois que a aba fica visível. Forçar
            // resize() ao entrar na aba corrige a medida real e realinha o
            // whisker com a barra.
            if (target === 'charts') resizeChartsIn(courseModal);
        });
    });

    courseModalClose?.addEventListener('click', closeCourseModal);
    courseModal?.addEventListener('click', (event) => { if (event.target === courseModal) closeCourseModal(); });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && courseModal?.style.display === 'flex') closeCourseModal();
    });

    async function handleResetCourse() {
        if (!openCourseSlug || !openCourseKey) return;
        const [subjectId, themeId] = openCourseKey.split('_');

        const confirmed = await showConfirm({
            title: 'Resetar curso',
            message: `Todo o progresso, as avaliações e o contador de tentativas de "${openCourseName || 'este curso'}" serão apagados para todos os colaboradores. Eles poderão assistir e avaliar o curso novamente, sem nenhum bloqueio. Esta ação não pode ser desfeita.`,
            icon: 'fa-rotate-left',
            requireWord: 'RESETAR',
            confirmText: 'Resetar'
        });
        if (!confirmed) return;

        try {
            const updates = {};
            updates[`/${dbRoot}/results/byCourse/${openCourseSlug}/${subjectId}/${themeId}`] = null;

            const byCourseSnap = await get(ref(db, `/${dbRoot}/results/byCourse/${openCourseSlug}/${subjectId}/${themeId}`));
            if (byCourseSnap.exists()) {
                Object.keys(byCourseSnap.val()).forEach(userId => {
                    updates[`/${dbRoot}/results/byUser/${userId}/${openCourseSlug}/${subjectId}/${themeId}`] = null;
                });
            }
            updates[`/${dbRoot}/results/estagiosLivre/${openCourseSlug}/${subjectId}/${themeId}`] = null;

            // Registros importados de planilha não têm subjectId/themeId, só
            // casam pelo nome (mesmo critério de fetchCourseResults) — cada um
            // precisa ser apagado individualmente pelo seu entryId.
            fetchCourseResults(openCourseSlug, subjectId, themeId)
                .filter(r => r.imported && r.entryId)
                .forEach(r => { updates[`/${dbRoot}/results/imported/${openCourseSlug}/${r.entryId}`] = null; });

            // progress/byUser é uma árvore separada de results/* (grava % de
            // módulos assistidos + nota, ver js/main.js:progressPathFor) —
            // sem isso o card do colaborador continuava mostrando 100%/nota
            // antiga mesmo depois do reset apagar a avaliação em results/*.
            Object.keys(allProgress).forEach(userId => {
                if (allProgress[userId]?.[openCourseSlug]?.[subjectId]?.[themeId] !== undefined) {
                    updates[`/${dbRoot}/progress/byUser/${userId}/${openCourseSlug}/${subjectId}/${themeId}`] = null;
                }
            });

            // attempts/byUser (js/attempts.js) é o contador de tentativas
            // deste curso — reseta o histórico, então o bloqueio também some
            // (senão o aluno ficaria travado num curso sem nenhum resultado).
            if (byCourseSnap.exists()) {
                Object.keys(byCourseSnap.val()).forEach(userId => {
                    updates[`/${dbRoot}/attempts/byUser/${userId}/${openCourseSlug}/${subjectId}/${themeId}`] = null;
                });
            }

            await db.ref().update(updates);

            Object.keys(allProgress).forEach(userId => {
                if (allProgress[userId]?.[openCourseSlug]?.[subjectId]) {
                    delete allProgress[userId][openCourseSlug][subjectId][themeId];
                }
            });

            showWarning('Curso resetado com sucesso.');
            historyRows = await U.refreshHistoryRows();
            renderCourseCards();
            renderCourseDashboard(openCourseSlug, openCourseKey);
        } catch (error) {
            showWarning('Erro ao resetar o curso: ' + error.message);
        }
    }
    courseResetBtn?.addEventListener('click', handleResetCourse);

    // ─── Alternância de modo ───
    const modeUserBtn = document.getElementById('cfg-dash-mode-user');
    const modeCourseBtn = document.getElementById('cfg-dash-mode-course');

    const modeUnitBtn = document.getElementById('cfg-dash-mode-unit');

    function setDashMode(mode) {
        dashMode = mode;
        modeUserBtn.classList.toggle('active', mode === 'user');
        modeCourseBtn.classList.toggle('active', mode === 'course');
        modeUnitBtn?.classList.toggle('active', mode === 'unit');
        document.getElementById('cfg-dash-user-picker').style.display = mode === 'user' ? 'flex' : 'none';
        document.getElementById('cfg-dash-course-picker').style.display = mode === 'course' ? 'flex' : 'none';
        const unitPicker = document.getElementById('cfg-dash-unit-picker');
        if (unitPicker) unitPicker.style.display = mode === 'unit' ? 'flex' : 'none';
        document.getElementById('cfg-dash-empty').style.display = 'flex';
        closeSubjectPopover();
        closeUserFilterPopovers();
        closeCourseModal();
        closeUserModal();
        closeUnitModal();
        // Cada render já se protege pelo `dashMode`; chamar os três deixa a
        // grade do modo que saiu escondida sem precisar apagá-la à mão.
        if (mode === 'course') updateCategoryChip();
        renderCourseCards();
        renderUserCards();
        renderUnitCards();
    }
    modeUserBtn?.addEventListener('click', () => setDashMode('user'));
    modeCourseBtn?.addEventListener('click', () => setDashMode('course'));
    modeUnitBtn?.addEventListener('click', () => setDashMode('unit'));

    // Redesenha tudo que está na tela a partir do estado já carregado. Isolado
    // de loadBaseData() para que uma atualização vinda de listener não precise
    // rebaixar tudo de novo — o listener já trouxe o dado novo.
    function renderEverything() {
        updateCategoryChip();
        if (selectedSubjectId && selectedSubjectId !== ALL_SUBJECTS_ID && !currentTrainingData()[selectedSubjectId]) {
            selectedSubjectId = ALL_SUBJECTS_ID; selectedCourseKey = null;
            subjectLabel.textContent = 'Todos os temas';
        }
        renderCourseCards();
        if (selectedCourseKey) renderCourseDashboard(currentSlug(), selectedCourseKey);
        renderUserCards();
        if (selectedUserId && allColaboradores[selectedUserId]) {
            renderUserDashboard(allColaboradores[selectedUserId], userHeroStats);
        }
        renderUnitCards();
        if (unitModal?.style.display === 'flex' && unitChartKeyCache) {
            renderUnitDashboard(unitChartKeyCache);
        }
    }

    // ─── Sincronização ao vivo ───
    // Sem isto, o painel só relia os dados ao trocar de aba: um administrador
    // com as Configurações abertas via os números do momento em que entrou,
    // enquanto alunos concluíam cursos do outro lado. Números velhos numa tela
    // que parece atual é a pior forma de errar — daí os listeners.
    //
    // Ficam ligados apenas enquanto a aba Dashboard está aberta (ver
    // stopLiveSync): cada listener é uma assinatura permanente no RTDB e
    // manter todas ligadas o tempo todo custaria banda e quota à toa.
    let liveRefs = [];
    let liveRenderTimer = null;

    // As atualizações chegam em rajada (uma escrita de resultado dispara
    // vários caminhos). Redesenhar a cada evento piscaria os gráficos várias
    // vezes seguidas, então as mudanças são agrupadas numa janela curta.
    function scheduleLiveRender() {
        clearTimeout(liveRenderTimer);
        liveRenderTimer = setTimeout(() => {
            liveRenderTimer = null;
            try { renderEverything(); }
            catch (error) { console.error('Erro ao atualizar o dashboard ao vivo:', error); }
        }, 300);
    }

    // Resultados vivem fora do estado local do dashboard (as linhas vêm do
    // Histórico, que tem o próprio cache). Ao ver mudança em /results, o cache
    // do Histórico é invalidado e refeito antes de redesenhar — caso contrário
    // os cards mostrariam a conclusão nova com as notas antigas.
    let historyReloadPending = false;
    async function reloadHistoryThenRender() {
        if (historyReloadPending) return;
        historyReloadPending = true;
        try {
            historyRows = await U.refreshHistoryRows();
            scheduleLiveRender();
        } catch (error) {
            console.error('Erro ao recarregar o histórico ao vivo:', error);
        } finally {
            historyReloadPending = false;
        }
    }

    function watch(path, handler) {
        const reference = ref(db, path);
        const callback = reference.on('value', handler, error => {
            console.error(`Listener de ${path} interrompido:`, error.message);
        });
        liveRefs.push({ reference, callback });
    }

    function startLiveSync() {
        if (liveRefs.length) return;
        // O primeiro disparo de cada listener chega logo após o attach e traz
        // o mesmo dado que loadBaseData() acabou de ler; o render agrupado
        // absorve essa repetição sem custo visível.
        watch(`/${dbRoot}/progress/byUser`, snapshot => {
            allProgress = snapshot.exists() ? snapshot.val() : {};
            scheduleLiveRender();
        });
        watch(`/${dbRoot}/colaboradores`, snapshot => {
            allColaboradores = snapshot.exists() ? snapshot.val() : {};
            refreshUserFilterChips();
            scheduleLiveRender();
        });
        watch(`/${dbRoot}/users`, snapshot => {
            allUsers = snapshot.exists() ? snapshot.val() : {};
            scheduleLiveRender();
        });
        // Os três ramos de /results que o Histórico realmente lê. A raiz
        // arrastaria junto o espelho `byCourse` (~1,3 MB), que nenhuma
        // listagem consome — ele só é lido pontualmente, por curso.
        //
        // O primeiro `value` de cada ramo é o eco do attach: traz exatamente o
        // que `loadBaseData()` acabou de ler. Atendê-lo disparava
        // `reloadHistoryThenRender()`, que rebaixava e reprocessava a árvore de
        // resultados inteira logo depois de ela ter sido lida — abrir o
        // Dashboard custava duas descidas completas e três passagens de
        // `flatten`. Cada ramo ignora o seu primeiro evento; do segundo em
        // diante é mudança de verdade. Contagem em vez de temporizador: o eco
        // depende de ida e volta à rede e não cabe numa janela fixa.
        ['byUser', 'estagiosLivre', 'imported'].forEach(branch => {
            let sawFirstEvent = false;
            watch(`/${dbRoot}/results/${branch}`, () => {
                if (!sawFirstEvent) { sawFirstEvent = true; return; }
                reloadHistoryThenRender();
            });
        });
        Object.keys(CATEGORY_LABELS).forEach(slug => {
            watch(`/${dbRoot}/${slug}/trainingData`, snapshot => {
                allTrainingData[slug] = snapshot.exists() ? snapshot.val() : {};
                scheduleLiveRender();
            });
            watch(`/${dbRoot}/${slug}/quizData`, snapshot => {
                allQuizData[slug] = snapshot.exists() ? snapshot.val() : {};
                scheduleLiveRender();
            });
        });
    }

    function stopLiveSync() {
        liveRefs.forEach(({ reference, callback }) => reference.off('value', callback));
        liveRefs = [];
        clearTimeout(liveRenderTimer);
        liveRenderTimer = null;
    }
    U.stopDashboardLiveSync = stopLiveSync;

    // Carga em voo. `initDashboard` tem duas origens — o fim de fetchData
    // (js/admin.js) e o clique na aba — e nada impedia as duas de correrem
    // juntas: dois `loadBaseData()` em paralelo, tudo baixado e processado em
    // dobro. Quem chega no meio espera a carga que já existe.
    let baseLoad = null;

    async function initDashboard() {
        if (!initialized) {
            initialized = true;
            setDashMode('course');
        }
        if (baseLoad) return baseLoad;
        baseLoad = (async () => {
            try {
                await loadBaseData();
                baseDataLoaded = true;
                baseLoadFailed = false;
                // Os cards leem allTrainingData/allQuizData, só disponíveis depois
                // de loadBaseData() — renderizar antes deixava a lista vazia no
                // primeiro carregamento (nada para escolher, dashboard em branco).
                renderEverything();
                startLiveSync();
            } catch (error) {
                baseLoadFailed = true;
                renderEverything();
                showWarning('Erro ao carregar dados do dashboard: ' + error.message);
            } finally {
                baseLoad = null;
            }
        })();
        return baseLoad;
    }
    U.initDashboard = initDashboard;

    // Volta da rede: o que estava na tela é anterior à queda, e os listeners
    // ficaram sem receber eventos. Recarrega do zero em vez de confiar no que
    // sobrou em memória.
    document.addEventListener('uniadmin:connection-restored', () => {
        if (!liveRefs.length) return;
        loadBaseData()
            .then(renderEverything)
            .catch(error => console.error('Erro ao ressincronizar o dashboard:', error));
    });
})();
