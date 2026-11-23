// Painel de Usuários (Configurações): lista contas de aluno, permite
// redefinir senha, desativar/reativar e excluir. Global — não depende da
// categoria escolhida (contas são compartilhadas entre categorias).
(function () {
    const U = window.UniAdmin;
    const ref = U.ref, get = U.get, db = U.db, dbRoot = U.dbRoot;
    const showWarning = U.showWarning, showConfirm = U.showConfirm;
    const normalizeName = U.normalizeName;
    const { randomSalt, hashWithSalt } = U.crypto;

    // Formata nota com 1 casa decimal (vírgula), ex.: 8,2/10
    function formatScore(score) {
        const n = Number(score);
        if (!Number.isFinite(n)) return score;
        return n.toFixed(1).replace('.', ',');
    }

    const USERS_PATH = `/${dbRoot}/users`;
    const COLABS_PATH = `/${dbRoot}/colaboradores`;

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
        ));
    }

    function userInitials(name) {
        const clean = (name || '').trim();
        if (!clean) return '?';
        const words = clean.split(/\s+/).filter(w => /[a-zA-ZÀ-ÿ0-9]/.test(w));
        if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
        return clean.slice(0, 2).toUpperCase();
    }

    function formatDate(ts) {
        if (!ts) return '—';
        return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    let usersCache = {};
    // Linhas completas do histórico (todas categorias), vindas de
    // admin-history.js — usadas tanto para o contador do card quanto para o
    // modal de histórico do usuário.
    let historyRowsCache = [];
    let sheetsSynced = false;

    async function fetchUsers() {
        const snapshot = await get(ref(db, USERS_PATH));
        return snapshot.exists() ? snapshot.val() : {};
    }

    // Setor/função ficam gravados na própria conta e são mantidos em dia pelo
    // sync de Colaboradores (js/colaboradores-sync.js), disparado logo antes
    // de carregar esta lista.
    function unitRoleOf(user) {
        return { unit: user.unit || null, role: user.role || null };
    }

    // Linhas de histórico associadas a um usuário: por userId (contas
    // vinculadas) OU por nome completo igual (registros avulsos/importados
    // sem conta, ex.: planilha antiga) — associação automática por nome.
    function historyRowsForUser(user) {
        const nameKey = normalizeName(user.fullName);
        return historyRowsCache.filter(r =>
            r.userId === user.userId || (r.userId == null && normalizeName(r.fullName) === nameKey)
        );
    }

    // Contagem de cursos aprovados por usuário em UMA passada pelo histórico.
    // Antes era um filter por card (nº de usuários × nº de linhas), o que com
    // milhares de resultados travava a montagem da lista.
    let approvedCounts = null;
    function buildApprovedCounts() {
        const byUserId = new Map();
        const byNameKey = new Map();
        historyRowsCache.forEach(r => {
            if (!r.approved) return;
            if (r.userId != null) byUserId.set(r.userId, (byUserId.get(r.userId) || 0) + 1);
            else {
                const key = normalizeName(r.fullName);
                byNameKey.set(key, (byNameKey.get(key) || 0) + 1);
            }
        });
        approvedCounts = { byUserId, byNameKey };
    }

    function approvedCountFor(user) {
        if (!approvedCounts) return null; // histórico ainda carregando
        return (approvedCounts.byUserId.get(user.userId) || 0)
            + (approvedCounts.byNameKey.get(normalizeName(user.fullName)) || 0);
    }

    // Filtros da barra: unidade, função e status, cada um com seu popover/aba.
    // unit/role vazios = todos; status default = só contas ativas (mesmo
    // comportamento de antes, quando não havia esse filtro). Combinam com a
    // busca por nome/login.
    const listFilters = { unit: '', role: '', status: 'active' };

    function renderList(filterTerm = '') {
        const container = document.getElementById('cfg-users-container');
        if (!container) return;
        const term = normalizeName(filterTerm);
        const entries = Object.keys(usersCache)
            .map(userId => ({ userId, ...usersCache[userId] }))
            .filter(u => u && u.fullName)
            .filter(u => !term || normalizeName(u.fullName).includes(term) || (u.username || '').includes(term))
            .filter(u => !listFilters.unit || (u.unit || '') === listFilters.unit)
            .filter(u => !listFilters.role || (u.role || '') === listFilters.role)
            .filter(u => {
                if (listFilters.status === 'active') return !u.disabled;
                if (listFilters.status === 'inactive') return !!u.disabled;
                return true; // 'all'
            })
            .sort((a, b) => a.fullName.localeCompare(b.fullName, 'pt-BR'));

        if (entries.length === 0) {
            const filtering = !!term || !!listFilters.unit || !!listFilters.role;
            container.innerHTML = `<p class="form-hint">${filtering
                ? 'Nenhum usuário encontrado com os filtros atuais.'
                : 'Nenhum usuário cadastrado ainda.'}</p>`;
            return;
        }

        container.innerHTML = entries.map((u, index) => {
            const approvedCount = approvedCountFor(u);
            const { unit, role } = unitRoleOf(u);
            return `
            <div class="theme-card user-card ${u.disabled ? 'is-disabled' : ''}" data-user-id="${escapeHtml(u.userId)}" style="--card-i:${index};">
                <div class="user-card-open" data-user-id="${escapeHtml(u.userId)}" title="Ver histórico de cursos">
                    <span class="theme-card-thumb is-initials">${escapeHtml(userInitials(u.fullName))}</span>
                    <div class="theme-card-title">
                        <h3>${escapeHtml(u.fullName)}</h3>
                        ${u.disabled ? '<span class="user-status-badge">Desativado</span>' : ''}
                        ${u.isManager ? '<span class="user-manager-badge"><i class="fas fa-user-shield"></i> Gestor</span>' : ''}
                        <p class="card-desc">
                            <span><i class="fas fa-at"></i> ${escapeHtml(u.username || '—')}</span>
                            <span class="user-card-metric" data-user-metric="${escapeHtml(u.userId)}"><i class="fas fa-circle-check"></i> ${approvedCount === null ? '…' : `${approvedCount} curso(s)`}</span>
                            <span class="user-card-since">Desde ${formatDate(u.createdAt)}</span>
                        </p>
                        <p class="card-desc user-card-org">
                            <span><i class="fas fa-building"></i> ${escapeHtml(unit || 'Setor não informado')}</span>
                            <span><i class="fas fa-id-badge"></i> ${escapeHtml(role || 'Função não informada')}</span>
                        </p>
                    </div>
                    <span class="user-card-hint"><i class="fas fa-clock-rotate-left"></i> Ver histórico</span>
                </div>
                <div class="card-footer">
                    <div class="card-actions">
                        <button class="btn btn-ghost btn-sm user-edit" data-user-id="${escapeHtml(u.userId)}" title="Editar dados">
                            <i class="fas fa-pencil-alt"></i><span class="btn-label"> Editar</span>
                        </button>
                    </div>
                </div>
            </div>`;
        }).join('');

        bindCardActions();
    }

    function currentFilterTerm() {
        return document.getElementById('cfg-users-filter')?.value || '';
    }

    // Preenche só os contadores de cursos já renderizados, sem remontar a
    // lista inteira (evita perder foco/scroll quando o histórico chega).
    function patchApprovedCounts() {
        document.querySelectorAll('#cfg-users-container [data-user-metric]').forEach(el => {
            const userId = el.dataset.userMetric;
            const user = usersCache[userId];
            if (!user) return;
            const count = approvedCountFor({ userId, ...user });
            if (count !== null) el.innerHTML = `<i class="fas fa-circle-check"></i> ${count} curso(s)`;
        });
    }

    // A lista aparece assim que as contas chegam. O histórico completo
    // (/results, pesado) e o sync da planilha continuam em segundo plano e
    // apenas completam o card depois — antes os três esperavam em série e a
    // aba ficava no "Carregando dados..." o tempo todo.
    async function populateUsers() {
        showSpinner(true);
        try {
            usersCache = await fetchUsers();
            refreshUsersFilterChips();
            renderList(currentFilterTerm());
        } catch (error) {
            showWarning('Erro ao carregar usuários: ' + error.message);
            return;
        } finally {
            showSpinner(false);
        }

        U.getHistoryRows().then(rows => {
            historyRowsCache = rows;
            buildApprovedCounts();
            patchApprovedCounts();
        }).catch(error => {
            console.error('Erro ao carregar histórico dos usuários:', error);
        });

        // O sync propaga setor/função da planilha para as contas vinculadas;
        // quando muda algo, a lista é relida para refletir. Silencioso: rede
        // fora do ar não atrapalha o que já está na tela. Uma vez por sessão
        // do painel — recarregar a lista após editar/excluir não precisa
        // bater na planilha de novo.
        if (sheetsSynced) return;
        sheetsSynced = true;
        U.ColaboradoresSync?.syncFromSheets({ silent: true }).then(async (result) => {
            if (!result || !result.usersUpdated) return;
            usersCache = await fetchUsers();
            renderList(currentFilterTerm());
            patchApprovedCounts();
        }).catch(() => { /* silencioso */ });
    }
    U.populateUsers = populateUsers;

    function showSpinner(show) {
        // Reaproveita o spinner global de carregamento do painel, já que esta
        // aba não tem um spinner próprio de formulário.
        if (show) U.showLoadingBar?.(); else U.hideLoadingBar?.();
    }

    document.getElementById('cfg-users-filter')?.addEventListener('input', (event) => {
        renderList(event.target.value);
        usersFilterRow?.querySelector('.hfilter-search-chip')?.classList.toggle('is-active', !!event.target.value);
    });

    // ─── Abas de status (Ativos / Inativos / Ambos) ───
    const usersStatusTabs = document.getElementById('cfg-users-status-tabs');
    usersStatusTabs?.querySelectorAll('.hfilter-status-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            listFilters.status = tab.dataset.status;
            usersStatusTabs.querySelectorAll('.hfilter-status-tab').forEach(t => t.classList.toggle('is-active', t === tab));
            renderList(currentFilterTerm());
        });
    });

    // ─── Chips de filtro (unidade / função) ───
    // Mesma mecânica dos chips do Histórico: um popover por campo, com busca.
    const usersFilterRow = document.getElementById('cfg-users-filter-row');
    const usersFilterClear = document.getElementById('cfg-users-filter-clear');

    function filterOptions(field) {
        const values = new Set();
        Object.values(usersCache).forEach(u => { if (u?.[field]) values.add(String(u[field]).trim()); });
        return [...values].filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    }

    function closeUsersPopovers({ keepSearch = false } = {}) {
        usersFilterRow?.querySelectorAll('.hfilter-chip.is-open').forEach(chip => {
            if (keepSearch && chip.classList.contains('hfilter-search-chip')) return;
            chip.classList.remove('is-open');
        });
    }

    // Fecha o chip de busca especificamente: some com o popover e limpa o
    // termo digitado, já que fechado o campo não deve continuar filtrando.
    function closeUsersSearchChip() {
        const searchChip = usersFilterRow?.querySelector('.hfilter-search-chip');
        if (!searchChip?.classList.contains('is-open')) return;
        searchChip.classList.remove('is-open');
        const input = document.getElementById('cfg-users-filter');
        if (input) input.value = '';
        renderList(currentFilterTerm());
        refreshUsersFilterChips();
    }

    function refreshUsersFilterChips() {
        ['unit', 'role'].forEach(field => {
            const chip = usersFilterRow?.querySelector(`.hfilter-chip[data-field="${field}"]`);
            const label = chip?.querySelector('.hfilter-chip-label');
            if (!label) return;
            label.textContent = listFilters[field] || label.dataset.default;
            chip.classList.toggle('is-active', !!listFilters[field]);
        });
        // Botão de busca: fica marcado como "ativo" quando há termo digitado,
        // mesmo tratamento visual dos demais chips.
        const searchChip = usersFilterRow?.querySelector('.hfilter-search-chip');
        searchChip?.classList.toggle('is-active', !!currentFilterTerm());
        if (usersFilterClear) {
            usersFilterClear.style.display = (listFilters.unit || listFilters.role) ? 'inline-flex' : 'none';
        }
    }

    function renderUsersFilterList(field, searchTerm = '') {
        const listEl = document.getElementById(`cfg-users-filter-${field}-list`);
        if (!listEl) return;
        const term = normalizeName(searchTerm);
        const options = filterOptions(field).filter(v => !term || normalizeName(v).includes(term));
        const allLabel = field === 'unit' ? 'Todas' : 'Todas as funções';

        listEl.innerHTML = options.length === 0 && term
            ? '<div class="hfilter-chip-empty">Nada encontrado.</div>'
            : [`<div class="hfilter-chip-item ${!listFilters[field] ? 'is-selected' : ''}" data-value="">${allLabel}</div>`]
                .concat(options.map(v => `<div class="hfilter-chip-item ${listFilters[field] === v ? 'is-selected' : ''}" data-value="${escapeHtml(v)}">${escapeHtml(v)}</div>`))
                .join('');

        listEl.querySelectorAll('.hfilter-chip-item[data-value]').forEach(item => {
            item.addEventListener('click', () => {
                listFilters[field] = item.dataset.value;
                closeUsersPopovers();
                refreshUsersFilterChips();
                renderList(currentFilterTerm());
            });
        });
    }

    usersFilterRow?.querySelectorAll('.hfilter-chip').forEach(chip => {
        const field = chip.dataset.field;
        const isSearchChip = field === 'search';
        const btn = chip.querySelector('.hfilter-chip-btn');
        const search = chip.querySelector('.hfilter-chip-search');

        btn?.addEventListener('click', (event) => {
            event.stopPropagation();
            const isOpen = chip.classList.contains('is-open');
            if (isSearchChip) {
                // O ícone de busca só abre/fecha no próprio clique: clicar
                // fora não fecha, e ao fechar o termo digitado é limpo (o
                // filtro para de valer).
                closeUsersPopovers({ keepSearch: true });
                if (isOpen) { closeUsersSearchChip(); return; }
                chip.classList.add('is-open');
                // O autofill do navegador pode preencher o campo sem que o
                // usuário digite nada: abre sempre vazio.
                if (search && search.value) {
                    search.value = '';
                    renderList(currentFilterTerm());
                    refreshUsersFilterChips();
                }
                search?.focus();
                return;
            }
            closeUsersPopovers();
            if (isOpen) return;
            chip.classList.add('is-open');
            if (search) { search.value = ''; }
            renderUsersFilterList(field, '');
            search?.focus();
        });
        chip.addEventListener('click', (event) => event.stopPropagation());
        if (!isSearchChip) search?.addEventListener('input', () => renderUsersFilterList(field, search.value));
    });
    document.addEventListener('click', () => closeUsersPopovers({ keepSearch: true }));

    usersFilterClear?.addEventListener('click', () => {
        listFilters.unit = '';
        listFilters.role = '';
        refreshUsersFilterChips();
        renderList(currentFilterTerm());
    });

    function bindCardActions() {
        document.querySelectorAll('.user-edit').forEach(btn => {
            btn.addEventListener('click', () => openUserForm(btn.dataset.userId));
        });
        document.querySelectorAll('.user-reset-password').forEach(btn => {
            btn.addEventListener('click', () => handleResetPassword(btn.dataset.userId));
        });
        document.querySelectorAll('.user-toggle-disabled').forEach(btn => {
            btn.addEventListener('click', () => handleToggleDisabled(btn.dataset.userId, btn.dataset.disabled === '1'));
        });
        document.querySelectorAll('.user-delete').forEach(btn => {
            btn.addEventListener('click', () => handleDeleteUser(btn.dataset.userId));
        });
        document.querySelectorAll('.user-card-open').forEach(head => {
            head.addEventListener('click', () => openUserHistory(head.dataset.userId));
        });
    }

    // ─── Modal de histórico do usuário (card clicável) ───
    const CATEGORY_LABELS = { treinamentos: 'Treinamentos', educacao_continuada: 'Educação Continuada', estagios: 'Estágios' };
    const userHistoryModal = document.getElementById('cfg-user-history-modal');
    const userHistoryTitle = document.getElementById('cfg-user-history-title');
    const userHistorySummary = document.getElementById('cfg-user-history-summary');
    const userHistoryProgressBlock = document.getElementById('cfg-user-history-progress');
    const userHistoryProgressList = document.getElementById('cfg-user-history-progress-list');
    const userHistoryTableWrap = document.getElementById('cfg-user-history-table-wrap');

    // % de módulos assistidos por curso (progress/byUser, gravado por
    // js/main.js) — mesmo dado exibido no Perfil do próprio aluno
    // (js/student-profile.js), aqui do lado do admin.
    function renderUserProgress(progressRows, courseIndex) {
        if (!userHistoryProgressBlock || !userHistoryProgressList) return;
        const courseByIds = new Map();
        courseIndex.forEach(course => courseByIds.set(`${course.slug}|${course.subjectId}|${course.themeId}`, course));

        const withCourse = progressRows
            .map(p => ({ ...p, course: courseByIds.get(`${p.slug}|${p.subjectId}|${p.themeId}`) }))
            .filter(p => p.course && p.total > 0)
            .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

        if (withCourse.length === 0) {
            userHistoryProgressBlock.style.display = 'none';
            userHistoryProgressList.innerHTML = '';
            return;
        }

        userHistoryProgressBlock.style.display = 'block';
        userHistoryProgressList.innerHTML = withCourse.map(p => {
            const isComplete = p.pct >= 100;
            return `
                <div class="student-progress-item ${isComplete ? 'is-complete' : ''}">
                    <div class="student-progress-item-head">
                        <span class="student-progress-item-name" title="${escapeHtml(p.course.theme)}">${escapeHtml(p.course.theme)}</span>
                        <span class="student-progress-item-pct">${p.pct}%</span>
                    </div>
                    <div class="student-progress-bar"><span style="width:${p.pct}%"></span></div>
                </div>`;
        }).join('');
    }
    const userHistoryClose = document.getElementById('cfg-user-history-close');

    function courseCardThumbHtml(course, name) {
        if (course?.image) {
            return `<img src="${escapeHtml(course.image)}" alt="" loading="lazy">`;
        }
        const hue = (() => {
            let hash = 0;
            for (let i = 0; i < (name || '').length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 360;
            return hash;
        })();
        return `<span class="user-course-initials" style="--initials-hue:${hue};">${escapeHtml(userInitials(name))}</span>`;
    }

    // Agrupa as tentativas por curso (subject+theme), preservando as
    // tentativas ordenadas da mais recente para a mais antiga. Uma aprovação
    // em qualquer tentativa já basta para o curso contar como aprovado; o
    // card do curso sempre representa a aprovação mais recente (não
    // necessariamente a última tentativa, que pode ter sido uma reprovação
    // posterior a uma aprovação anterior).
    function groupRowsByCourse(rows) {
        const groups = new Map();
        rows.forEach(r => {
            const key = `${r.slug}|${normalizeName(r.subject)}|${normalizeName(r.theme)}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(r);
        });
        return [...groups.values()]
            .map(attempts => attempts.sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0)))
            .map(attempts => {
                const isApproved = attempts.some(a => a.approved);
                const latest = isApproved ? attempts.find(a => a.approved) : attempts[0];
                return { attempts, latest, isApproved };
            })
            .sort((a, b) => (b.latest.submittedAt || 0) - (a.latest.submittedAt || 0));
    }

    // Mostra as tentativas de um curso; se houver só uma, pula direto para o
    // detalhe (o modal de detalhe já cobre gabarito/avaliação/comentário).
    function openCourseAttempts(latest, attempts) {
        if (attempts.length === 1) { U.openHistoryDetail?.(attempts[0]); return; }
        U.openHistoryDetail?.(latest, attempts);
    }

    // Popover "Reprovações": um único listener global (o botão é remontado a
    // cada render do histórico, então não pode religar um novo listener por
    // vez sem acumular).
    document.addEventListener('click', (event) => {
        const popover = document.getElementById('user-reproved-popover');
        if (!popover || !popover.classList.contains('is-open')) return;
        if (event.target.closest('#user-reproved-popover') || event.target.closest('#user-reproved-btn')) return;
        popover.classList.remove('is-open');
    });

    async function openUserHistory(userId) {
        const user = usersCache[userId] ? { userId, ...usersCache[userId] } : null;
        if (!user) return;

        userHistoryTitle.textContent = `Histórico — ${user.fullName}`;
        userHistorySummary.innerHTML = '';
        if (userHistoryProgressBlock) userHistoryProgressBlock.style.display = 'none';
        if (userHistoryProgressList) userHistoryProgressList.innerHTML = '';
        userHistoryTableWrap.innerHTML = '<p class="dashboard-table-empty">Carregando...</p>';
        userHistoryModal.style.display = 'flex';

        showSpinner(true);
        try {
            const [historyRows, courseIndex, progressRows, attemptsState] = await Promise.all([
                U.getHistoryRows(),
                U.getCourseIndex(),
                U.StudentAuth.getCourseProgressForUser(userId),
                U.Attempts.getAllForUser(userId)
            ]);
            historyRowsCache = historyRows;
            buildApprovedCounts();
            const rows = historyRowsForUser(user);
            renderUserProgress(progressRows, courseIndex);

            const approvedCount = rows.filter(r => r.approved).length;
            const { unit, role } = unitRoleOf(user);
            userHistorySummary.innerHTML = `
                <div class="history-detail-summary-item"><span class="label">Nome completo</span><span class="value">${escapeHtml(user.fullName)}</span></div>
                <div class="history-detail-summary-item"><span class="label">Login</span><span class="value">${escapeHtml(user.username || '—')}</span></div>
                <div class="history-detail-summary-item"><span class="label">Cadastrado em</span><span class="value">${formatDate(user.createdAt)}</span></div>
                <div class="history-detail-summary-item"><span class="label">Setor</span><span class="value">${escapeHtml(unit || 'Não informado')}</span></div>
                <div class="history-detail-summary-item"><span class="label">Função</span><span class="value">${escapeHtml(role || 'Não informado')}</span></div>
                <div class="history-detail-summary-item"><span class="label">Cursos concluídos</span><span class="value">${approvedCount}</span></div>
                <div class="history-detail-summary-item"><span class="label">Total de avaliações</span><span class="value">${rows.length}</span></div>
            `;

            if (rows.length === 0) {
                userHistoryTableWrap.innerHTML = '<p class="dashboard-table-empty">Nenhuma avaliação registrada para este usuário.</p>';
                return;
            }

            const groups = groupRowsByCourse(rows);
            const approvedGroups = groups.filter(g => g.isApproved);
            const reprovedGroups = groups.filter(g => !g.isApproved);

            const cardsHtml = approvedGroups.map((group, i) => {
                const { attempts, latest } = group;
                const course = courseIndex.get(normalizeName(`${latest.subject}|${latest.theme}`));
                const rating = latest.rating;
                return `
                <button type="button" class="user-course-card" data-group-index="${i}" style="--card-i:${i};">
                    <div class="user-course-thumb">
                        ${courseCardThumbHtml(course, latest.theme)}
                        <span class="user-course-badge"><i class="fas fa-circle-check"></i></span>
                        <span class="user-course-hover"><i class="fas fa-clipboard-list"></i> Ver avaliação</span>
                    </div>
                    <div class="user-course-body">
                        <h4 title="${escapeHtml(latest.theme)}">${escapeHtml(latest.theme)}</h4>
                        <p class="user-course-subject">${escapeHtml(latest.subject)}</p>
                        ${course?.description ? `<p class="user-course-desc">${escapeHtml(course.description)}</p>` : ''}
                        <div class="user-course-stats">
                            ${rating ? U.starsHtml(rating) : '<span class="user-course-no-rating">Sem avaliação</span>'}
                            <span class="user-course-score">${formatScore(latest.score)}/10</span>
                        </div>
                        <div class="user-course-foot">
                            <span class="history-status-pill is-approved">Aprovado</span>
                            <span class="user-course-attempts"><i class="fas fa-rotate-right"></i> ${attempts.length} tentativa${attempts.length > 1 ? 's' : ''}</span>
                        </div>
                        ${U.Certificate?.isEnabled(course) ? `
                            <span class="user-course-cert" role="button" tabindex="0" data-cert-index="${i}">
                                <i class="fas fa-award"></i> Baixar certificado
                            </span>` : ''}
                    </div>
                </button>`;
            }).join('');

            // Cruza cada curso reprovado com o contador de tentativas
            // (js/attempts.js) para saber se o aluno está travado — o
            // agrupamento por resultado (`attempts.length`) não serve aqui
            // porque results/byUser guarda só a submissão mais recente.
            const reprovedLockInfo = reprovedGroups.map(group => {
                const course = courseIndex.get(normalizeName(`${group.latest.subject}|${group.latest.theme}`));
                const state = course ? attemptsState.get(`${course.slug}|${course.subjectId}|${course.themeId}`) : null;
                const limit = state ? U.Attempts.limitFor(state) : U.Attempts.MAX_ATTEMPTS;
                return { course, state, locked: !!state?.locked, count: state?.count || 0, limit };
            });

            const reprovedBtnHtml = reprovedGroups.length === 0 ? '' : `
                <div class="user-reproved-chip">
                    <button type="button" class="user-reproved-btn" id="user-reproved-btn">
                        <i class="fas fa-circle-xmark"></i> Reprovações
                        <span class="user-reproved-count">${reprovedGroups.length}</span>
                        ${reprovedLockInfo.some(i => i.locked) ? '<span class="user-reproved-locked-dot" title="Há curso bloqueado"></span>' : ''}
                    </button>
                    <div class="hfilter-chip-popover" id="user-reproved-popover">
                        <div class="hfilter-chip-list">
                            ${reprovedGroups.map((group, i) => {
                                const { latest, attempts } = group;
                                const { locked, count, limit } = reprovedLockInfo[i];
                                return `
                                <div class="hfilter-chip-item user-reproved-item ${locked ? 'is-locked' : ''}" data-reproved-index="${i}">
                                    <div class="user-reproved-item-main">
                                        <strong>${escapeHtml(latest.theme)}</strong>
                                        <small>${escapeHtml(latest.subject)} · ${formatDate(latest.submittedAt)} · ${formatScore(latest.score)}/10 · ${attempts.length} tentativa${attempts.length > 1 ? 's' : ''}</small>
                                    </div>
                                    ${locked ? `
                                        <div class="user-reproved-locked-row">
                                            <span class="user-reproved-locked-badge"><i class="fas fa-lock"></i> ${count}/${limit} tentativas — bloqueado</span>
                                            <button type="button" class="user-attempts-unlock-btn" data-unlock-index="${i}">
                                                <i class="fas fa-unlock"></i> Liberar +1 tentativa
                                            </button>
                                        </div>` : ''}
                                </div>`;
                            }).join('')}
                        </div>
                    </div>
                </div>`;

            userHistoryTableWrap.innerHTML = `
                ${reprovedBtnHtml}
                <div class="user-course-grid">${cardsHtml || (reprovedGroups.length ? '' : '<p class="dashboard-table-empty">Nenhuma avaliação registrada para este usuário.</p>')}</div>
            `;

            userHistoryTableWrap.querySelectorAll('.user-course-card').forEach(card => {
                card.addEventListener('click', () => {
                    const { attempts, latest } = approvedGroups[Number(card.dataset.groupIndex)];
                    openCourseAttempts(latest, attempts);
                });
            });

            const reprovedBtn = document.getElementById('user-reproved-btn');
            const reprovedPopover = document.getElementById('user-reproved-popover');
            reprovedBtn?.addEventListener('click', (event) => {
                event.stopPropagation();
                reprovedPopover.classList.toggle('is-open');
            });
            userHistoryTableWrap.querySelectorAll('.user-reproved-item').forEach(item => {
                item.addEventListener('click', () => {
                    const { attempts, latest } = reprovedGroups[Number(item.dataset.reprovedIndex)];
                    reprovedPopover?.classList.remove('is-open');
                    openCourseAttempts(latest, attempts);
                });
            });

            // Botão "Liberar tentativas": fica dentro do item clicável acima,
            // então precisa de stopPropagation para não também abrir o
            // detalhe da avaliação por baixo dele.
            userHistoryTableWrap.querySelectorAll('.user-attempts-unlock-btn').forEach(btn => {
                btn.addEventListener('click', (event) => {
                    event.stopPropagation();
                    const info = reprovedLockInfo[Number(btn.dataset.unlockIndex)];
                    const group = reprovedGroups[Number(btn.dataset.unlockIndex)];
                    handleUnlockAttempts(user, group.latest, info.course);
                });
            });

            // Dentro do card (que é um botão): o clique no certificado não
            // deve também abrir o detalhe da avaliação.
            userHistoryTableWrap.querySelectorAll('.user-course-cert').forEach(el => {
                el.addEventListener('click', (event) => {
                    event.stopPropagation();
                    const { latest } = approvedGroups[Number(el.dataset.certIndex)];
                    U.Certificate.download({
                        studentName: latest.fullName,
                        course: courseIndex.get(normalizeName(`${latest.subject}|${latest.theme}`)),
                        courseName: latest.theme,
                        submittedAt: latest.submittedAt
                    });
                });
            });
        } catch (error) {
            showWarning('Erro ao carregar histórico do usuário: ' + error.message);
            userHistoryTableWrap.innerHTML = '<p class="dashboard-table-empty">Erro ao carregar histórico.</p>';
        } finally {
            showSpinner(false);
        }
    }

    function closeUserHistory() { userHistoryModal.style.display = 'none'; }
    userHistoryClose?.addEventListener('click', closeUserHistory);
    userHistoryModal?.addEventListener('click', (event) => { if (event.target === userHistoryModal) closeUserHistory(); });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && userHistoryModal?.style.display === 'flex') closeUserHistory();
    });

    // ─── Modal de criar/editar conta ───
    // Criar aqui é o mesmo cadastro que o aluno faz no portal: parte de um
    // colaborador sem conta e trava o nome com transação (mesma garantia
    // anti-duplicidade de js/student-auth.js), sem abrir sessão para o aluno.
    const USERNAME_RULE = /^[a-z0-9]+$/;
    const userFormModal = document.getElementById('cfg-user-form-modal');
    const userFormTitle = document.getElementById('cfg-user-form-title');
    const userFormMessage = document.getElementById('cfg-user-form-message');
    const userFormIcon = document.getElementById('cfg-user-form-icon');
    const userFormColabField = document.getElementById('cfg-user-form-colab-field');
    const userFormColab = document.getElementById('cfg-user-form-colab');
    const userFormNameField = document.getElementById('cfg-user-form-name-field');
    const userFormName = document.getElementById('cfg-user-form-name');
    const userFormUsername = document.getElementById('cfg-user-form-username');
    const userFormPasswordField = document.getElementById('cfg-user-form-password-field');
    const userFormPassword = document.getElementById('cfg-user-form-password');
    const userFormPassword2 = document.getElementById('cfg-user-form-password2');
    const userFormPasswordHint = document.getElementById('cfg-user-form-password-hint');
    const userFormUnit = document.getElementById('cfg-user-form-unit');
    const userFormRole = document.getElementById('cfg-user-form-role');
    const userFormManager = document.getElementById('cfg-user-form-manager');
    const userFormError = document.getElementById('cfg-user-form-error');
    const userFormOk = document.getElementById('cfg-user-form-ok');
    const userFormCancel = document.getElementById('cfg-user-form-cancel');

    let editingUserId = null;
    let colabsCache = {};

    function sanitizeUsername(raw) {
        return (raw || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    function formError(message) {
        userFormError.textContent = message || '';
        userFormError.classList.toggle('active', !!message);
    }

    function closeUserForm() {
        userFormModal.style.display = 'none';
        editingUserId = null;
    }

    // Login já usado por OUTRA conta (a própria não conta como conflito).
    function usernameTaken(username, ignoreUserId) {
        return Object.keys(usersCache).some(id =>
            id !== ignoreUserId && usersCache[id]?.username === username
        );
    }

    async function ensureColabs() {
        if (Object.keys(colabsCache).length > 0) return colabsCache;
        try {
            colabsCache = await U.ColaboradoresSync.fetchColaboradores();
        } catch (error) {
            colabsCache = {};
        }
        return colabsCache;
    }

    function colabList({ onlyWithoutAccount = false } = {}) {
        return Object.keys(colabsCache)
            .map(id => ({ id, ...colabsCache[id] }))
            .filter(c => c?.fullName && (!onlyWithoutAccount || !c.accountUserId))
            .sort((a, b) => a.fullName.localeCompare(b.fullName, 'pt-BR'));
    }

    // Valores já em uso (planilha + contas), sem repetição — é o que alimenta
    // as sugestões de Setor e Função.
    function distinctValues(field) {
        const set = new Set();
        Object.values(colabsCache).forEach(c => { if (c?.[field]) set.add(String(c[field]).trim()); });
        Object.values(usersCache).forEach(u => { if (u?.[field]) set.add(String(u[field]).trim()); });
        return [...set].filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    }

    // ─── Combobox: input digitável + popover com a lista válida ───
    // Cada campo continua aceitando texto livre; o popover só facilita cair
    // em um valor que já existe (evita "Adminstrativo" x "Administrativo").
    function setupCombobox({ input, popover, getItems, onSelect, emptyText }) {
        if (!input || !popover) return null;
        let items = [];
        let activeIndex = -1;

        function close() {
            popover.classList.remove('active');
            input.setAttribute('aria-expanded', 'false');
            activeIndex = -1;
        }

        function highlight(index) {
            const nodes = [...popover.querySelectorAll('.user-combobox-item')];
            if (nodes.length === 0) return;
            activeIndex = (index + nodes.length) % nodes.length;
            nodes.forEach((n, i) => n.classList.toggle('is-active', i === activeIndex));
            nodes[activeIndex].scrollIntoView({ block: 'nearest' });
        }

        function choose(item) {
            input.value = item.label;
            close();
            onSelect?.(item);
        }

        function open(term = '') {
            const query = normalizeName(term);
            items = getItems()
                .filter(item => !query || normalizeName(item.label).includes(query))
                .slice(0, 60);

            popover.innerHTML = items.length === 0
                ? `<div class="user-combobox-empty">${escapeHtml(emptyText || 'Nenhuma opção encontrada.')}</div>`
                : items.map((item, i) => `
                    <button type="button" class="user-combobox-item" data-index="${i}">
                        <span class="user-combobox-item-label">${escapeHtml(item.label)}</span>
                        ${item.hint ? `<span class="user-combobox-item-hint">${escapeHtml(item.hint)}</span>` : ''}
                    </button>`).join('');

            popover.querySelectorAll('.user-combobox-item').forEach(node => {
                // mousedown em vez de click: o blur do input não fecha o
                // popover antes de o clique ser registrado.
                node.addEventListener('mousedown', (event) => {
                    event.preventDefault();
                    choose(items[Number(node.dataset.index)]);
                });
            });

            popover.classList.add('active');
            input.setAttribute('aria-expanded', 'true');
            activeIndex = -1;
        }

        input.addEventListener('focus', () => open(''));
        input.addEventListener('input', () => open(input.value));
        input.addEventListener('blur', () => setTimeout(close, 120));
        input.addEventListener('keydown', (event) => {
            const isOpen = popover.classList.contains('active');
            if (event.key === 'ArrowDown') { event.preventDefault(); if (!isOpen) open(input.value); else highlight(activeIndex + 1); return; }
            if (event.key === 'ArrowUp') { event.preventDefault(); if (isOpen) highlight(activeIndex - 1); return; }
            if (event.key === 'Escape' && isOpen) { event.stopPropagation(); close(); return; }
            if (event.key === 'Enter' && isOpen && activeIndex >= 0) {
                // Não deixa o Enter chegar ao modal e submeter o formulário.
                event.preventDefault(); event.stopPropagation();
                choose(items[activeIndex]);
            }
        });
        // Clique no campo com texto já digitado reabre a lista completa.
        input.addEventListener('mousedown', () => { if (document.activeElement === input) open(input.value); });

        return { close, open };
    }

    let selectedColabId = null;

    setupCombobox({
        input: userFormColab,
        popover: document.getElementById('cfg-user-form-colab-popover'),
        emptyText: 'Nenhum colaborador sem conta encontrado.',
        getItems: () => colabList({ onlyWithoutAccount: true }).map(c => ({
            label: c.fullName,
            hint: [c.unit, c.role].filter(Boolean).join(' • '),
            value: c.id
        })),
        onSelect: (item) => {
            selectedColabId = item.value;
            const colab = colabsCache[item.value] || {};
            userFormUnit.value = colab.unit || '';
            userFormRole.value = colab.role || '';
            if (!userFormUsername.value) {
                const parts = (colab.fullName || '').trim().split(/\s+/);
                const guess = sanitizeUsername(`${parts[0] || ''}${parts.length > 1 ? parts[parts.length - 1] : ''}`);
                if (guess && !usernameTaken(guess, null)) userFormUsername.value = guess;
            }
        }
    });

    // Digitar por cima do nome escolhido invalida a seleção: o colaborador só
    // vale se veio da lista (é ele quem carrega o vínculo e a trava de nome).
    userFormColab?.addEventListener('input', () => {
        const colab = colabsCache[selectedColabId];
        if (!colab || colab.fullName !== userFormColab.value) selectedColabId = null;
    });

    setupCombobox({
        input: userFormName,
        popover: document.getElementById('cfg-user-form-name-popover'),
        emptyText: 'Nenhum nome encontrado na lista de colaboradores.',
        getItems: () => colabList().map(c => ({
            label: c.fullName,
            hint: [c.unit, c.role].filter(Boolean).join(' • ')
        }))
    });

    setupCombobox({
        input: userFormUnit,
        popover: document.getElementById('cfg-user-form-unit-popover'),
        emptyText: 'Nenhum setor cadastrado ainda.',
        getItems: () => distinctValues('unit').map(v => ({ label: v }))
    });

    setupCombobox({
        input: userFormRole,
        popover: document.getElementById('cfg-user-form-role-popover'),
        emptyText: 'Nenhuma função cadastrada ainda.',
        getItems: () => distinctValues('role').map(v => ({ label: v }))
    });

    // ─── Senha + confirmação, com aviso em tempo real ───
    function renderPasswordHint() {
        const pass = userFormPassword.value;
        const confirmation = userFormPassword2.value;
        userFormPasswordHint.classList.remove('is-ok', 'is-error', 'is-warn');

        if (!pass && !confirmation) { userFormPasswordHint.textContent = ''; return; }
        if (pass.length < U.MIN_PASSWORD_LENGTH) {
            userFormPasswordHint.className = 'user-password-hint is-warn';
            userFormPasswordHint.innerHTML = `<i class="fas fa-circle-info"></i> A senha deve ter ao menos ${U.MIN_PASSWORD_LENGTH} caracteres.`;
            return;
        }
        if (!confirmation) {
            userFormPasswordHint.className = 'user-password-hint is-warn';
            userFormPasswordHint.innerHTML = '<i class="fas fa-circle-info"></i> Repita a senha para confirmar.';
            return;
        }
        if (pass === confirmation) {
            userFormPasswordHint.className = 'user-password-hint is-ok';
            userFormPasswordHint.innerHTML = '<i class="fas fa-circle-check"></i> As senhas conferem.';
        } else {
            userFormPasswordHint.className = 'user-password-hint is-error';
            userFormPasswordHint.innerHTML = '<i class="fas fa-circle-xmark"></i> As senhas não conferem.';
        }
    }
    userFormPassword?.addEventListener('input', renderPasswordHint);
    userFormPassword2?.addEventListener('input', renderPasswordHint);

    // userId ausente = criação.
    async function openUserForm(userId) {
        editingUserId = userId || null;
        selectedColabId = null;
        formError('');
        userFormColab.value = '';
        userFormName.value = '';
        userFormUsername.value = '';
        userFormPassword.value = '';
        userFormPassword2.value = '';
        userFormUnit.value = '';
        userFormRole.value = '';
        if (userFormManager) userFormManager.checked = false;
        renderPasswordHint();

        // As sugestões (nome, setor, função) saem da lista de colaboradores.
        await ensureColabs();

        if (editingUserId) {
            const user = usersCache[editingUserId];
            if (!user) return;
            userFormTitle.textContent = 'Editar usuário';
            userFormMessage.textContent = `Atualize os dados da conta de ${user.fullName}.`;
            userFormIcon.className = 'fas fa-user-pen';
            userFormColabField.style.display = 'none';
            userFormNameField.style.display = '';
            userFormPasswordField.style.display = 'none';
            // Nome, login e função vêm do Dados LAMIC; setor fica como estava. Nada disso se edita aqui.
            let perfil = null;
            if (user.login) { try { perfil = (await U.db.ref(`/usuarios/${user.login}`).once('value')).val(); } catch (e) { /* sem leitura: mostra o que há */ } }
            userFormName.value = perfil?.nome || user.fullName || '';
            userFormUsername.value = user.login || user.username || '';
            userFormUnit.value = user.unit || '';
            userFormRole.value = perfil?.cargo || user.role || '';
            userFormMessage.textContent = 'Nome, login, setor e função vêm do Dados LAMIC e não podem ser alterados aqui.';
            if (userFormManager) userFormManager.checked = !!user.isManager;
            travarCamposImportados(true);
            userFormOk.textContent = 'Salvar';
        } else {
            userFormTitle.textContent = 'Novo usuário';
            userFormMessage.textContent = 'Crie uma conta de aluno a partir de um colaborador da planilha.';
            userFormIcon.className = 'fas fa-user-plus';
            userFormColabField.style.display = '';
            userFormNameField.style.display = 'none';
            userFormPasswordField.style.display = '';
            travarCamposImportados(false);
            userFormOk.textContent = 'Criar conta';
        }

        userFormModal.style.display = 'flex';
        setTimeout(() => (editingUserId ? userFormManager || userFormOk : userFormColab)?.focus(), 60);
    }

    async function createUser({ colabId, username, password, unit, role, isManager }) {
        const colab = colabsCache[colabId];
        if (!colab?.fullName) throw new Error('Selecione um colaborador.');

        const userId = ref(db, USERS_PATH).push().key;
        const salt = randomSalt();
        const passwordHash = await hashWithSalt(password, salt);

        // Mesma transação do cadastro pelo portal: só commita se o
        // colaborador ainda estiver sem conta.
        const colabRef = ref(db, `${COLABS_PATH}/${colabId}`);
        const txResult = await colabRef.transaction(current => {
            if (!current) return current;
            if (current.accountUserId) return;
            current.accountUserId = userId;
            return current;
        });
        if (!txResult.committed || !txResult.snapshot.exists()) {
            throw new Error('Este colaborador já possui conta associada.');
        }

        const record = {
            fullName: colab.fullName,
            fullNameKey: normalizeName(colab.fullName),
            username,
            passwordHash,
            passwordSalt: salt,
            colaboradorId: colabId,
            unit: unit || null,
            role: role || null,
            isManager: !!isManager,
            disabled: false,
            createdAt: Date.now()
        };

        try {
            await U.set(ref(db, `${USERS_PATH}/${userId}`), record);
        } catch (error) {
            // Libera o nome de novo se a gravação da conta falhar.
            await ref(db, `${COLABS_PATH}/${colabId}`).update({ accountUserId: null }).catch(() => {});
            throw new Error('Erro ao criar a conta. Tente novamente.');
        }
    }

    async function updateUser(userId, { fullName, username, unit, role, isManager }) {
        await ref(db, `${USERS_PATH}/${userId}`).update({
            fullName,
            fullNameKey: normalizeName(fullName),
            username,
            unit: unit || null,
            role: role || null,
            isManager: !!isManager
        });
    }

    // No modo edição só o "Gestor" é editável; o resto é importado do Dados LAMIC.
    function travarCamposImportados(travar) {
        [userFormName, userFormUsername, userFormUnit, userFormRole].forEach(el => {
            if (!el) return;
            el.readOnly = travar; el.disabled = travar;
            el.style.pointerEvents = travar ? 'none' : '';
            el.style.opacity = travar ? '.7' : '';
        });
    }

    async function submitUserForm() {
        if (editingUserId) {
            userFormOk.disabled = true;
            formError('');
            try {
                await ref(db, `${USERS_PATH}/${editingUserId}`).update({ isManager: !!userFormManager?.checked });
                showWarning('Usuário atualizado com sucesso.');
                closeUserForm();
                usersCache = await fetchUsers();
                renderList(currentFilterTerm());
                patchApprovedCounts();
            } catch (error) {
                formError(error.message || 'Não foi possível salvar.');
            } finally {
                userFormOk.disabled = false;
            }
            return;
        }
        const username = sanitizeUsername(userFormUsername.value);
        const unit = userFormUnit.value.trim();
        const role = userFormRole.value.trim();
        const isManager = !!userFormManager?.checked;

        if (!username || !USERNAME_RULE.test(username)) {
            formError('O login deve conter apenas letras minúsculas e números, sem espaços.');
            return;
        }
        if (usernameTaken(username, editingUserId)) {
            formError('Este login já está em uso por outra conta.');
            return;
        }

        userFormOk.disabled = true;
        formError('');
        try {
            if (editingUserId) {
                const fullName = userFormName.value.trim();
                if (!fullName) { formError('Informe o nome completo.'); return; }
                await updateUser(editingUserId, { fullName, username, unit, role, isManager });
                showWarning('Usuário atualizado com sucesso.');
            } else {
                const colabId = selectedColabId;
                const password = userFormPassword.value;
                if (!colabId) { formError('Escolha o colaborador na lista.'); return; }
                if (!password || password.length < U.MIN_PASSWORD_LENGTH) {
                    formError(`A senha deve ter ao menos ${U.MIN_PASSWORD_LENGTH} caracteres.`);
                    return;
                }
                if (password !== userFormPassword2.value) { formError('As senhas não conferem.'); return; }
                await createUser({ colabId, username, password, unit, role, isManager });
                showWarning('Conta criada com sucesso.');
            }
            closeUserForm();
            usersCache = await fetchUsers();
            renderList(currentFilterTerm());
            patchApprovedCounts();
        } catch (error) {
            formError(error.message || 'Não foi possível salvar.');
        } finally {
            userFormOk.disabled = false;
        }
    }

    userFormOk?.addEventListener('click', submitUserForm);
    userFormCancel?.addEventListener('click', closeUserForm);
    userFormModal?.addEventListener('click', (event) => { if (event.target === userFormModal) closeUserForm(); });
    userFormModal?.addEventListener('keydown', (event) => {
        // Com um popover aberto, Enter/Esc pertencem ao combobox.
        const comboOpen = !!userFormModal.querySelector('.user-combobox-popover.active');
        if (event.key === 'Enter' && !comboOpen) { event.preventDefault(); submitUserForm(); }
        if (event.key === 'Escape' && !comboOpen) closeUserForm();
    });
    document.getElementById('cfg-users-new')?.addEventListener('click', () => openUserForm(null));

    // ─── Modal de redefinir senha ───
    const resetModal = document.getElementById('cfg-reset-password-modal');
    const resetMessageEl = document.getElementById('cfg-reset-password-message');
    const resetInput = document.getElementById('cfg-reset-password-input');
    const resetErrorEl = document.getElementById('cfg-reset-password-error');
    const resetOkBtn = document.getElementById('cfg-reset-password-ok');
    const resetCancelBtn = document.getElementById('cfg-reset-password-cancel');

    function promptNewPassword(user) {
        resetMessageEl.textContent = `Defina uma nova senha para ${user.fullName}.`;
        resetInput.value = '';
        resetErrorEl.classList.remove('active');
        resetModal.style.display = 'flex';
        setTimeout(() => resetInput.focus(), 60);

        return new Promise(resolve => {
            function cleanup(result) {
                resetModal.style.display = 'none';
                resetOkBtn.removeEventListener('click', onConfirm);
                resetCancelBtn.removeEventListener('click', onCancel);
                resetModal.removeEventListener('click', onBackdrop);
                resetInput.removeEventListener('keydown', onKey);
                resolve(result);
            }
            function onConfirm() {
                const value = resetInput.value;
                if (!value || value.length < U.MIN_PASSWORD_LENGTH) {
                    resetErrorEl.textContent = `A senha deve ter ao menos ${U.MIN_PASSWORD_LENGTH} caracteres.`;
                    resetErrorEl.classList.add('active');
                    return;
                }
                cleanup(value);
            }
            function onCancel() { cleanup(null); }
            function onBackdrop(event) { if (event.target === resetModal) cleanup(null); }
            function onKey(event) { if (event.key === 'Enter') { event.preventDefault(); onConfirm(); } }

            resetOkBtn.addEventListener('click', onConfirm);
            resetCancelBtn.addEventListener('click', onCancel);
            resetModal.addEventListener('click', onBackdrop);
            resetInput.addEventListener('keydown', onKey);
        });
    }

    async function handleResetPassword(userId) {
        const user = usersCache[userId];
        if (!user) return;

        const newPassword = await promptNewPassword(user);
        if (!newPassword) return;

        try {
            const salt = randomSalt();
            const passwordHash = await hashWithSalt(newPassword, salt);
            await ref(db, `${USERS_PATH}/${userId}`).update({ passwordHash, passwordSalt: salt });
            showWarning('Senha redefinida com sucesso.');
        } catch (error) {
            showWarning('Erro ao redefinir senha: ' + error.message);
        }
    }

    async function handleToggleDisabled(userId, isCurrentlyDisabled) {
        const user = usersCache[userId];
        if (!user) return;
        const action = isCurrentlyDisabled ? 'reativar' : 'desativar';
        const confirmed = await showConfirm({
            title: isCurrentlyDisabled ? 'Reativar conta' : 'Desativar conta',
            message: `Deseja ${action} a conta de ${user.fullName}?`,
            icon: isCurrentlyDisabled ? 'fa-toggle-off' : 'fa-toggle-on',
            tone: 'neutral',
            details: isCurrentlyDisabled ? [] : ['O aluno não conseguirá mais fazer login até a conta ser reativada.'],
            confirmText: isCurrentlyDisabled ? 'Reativar' : 'Desativar'
        });
        if (!confirmed) return;

        try {
            await ref(db, `${USERS_PATH}/${userId}`).update({ disabled: !isCurrentlyDisabled });
            await populateUsers();
            showWarning(`Conta ${isCurrentlyDisabled ? 'reativada' : 'desativada'} com sucesso.`);
        } catch (error) {
            showWarning('Erro ao atualizar conta: ' + error.message);
        }
    }

    // Libera as tentativas de um curso específico travado por reprovação
    // (js/attempts.js) — não mexe em senha/conta, só zera o contador daquele
    // curso para o aluno poder refazer a avaliação.
    async function handleUnlockAttempts(user, row, course) {
        if (!course) { showWarning('Não foi possível localizar este curso para liberar.'); return; }
        const confirmed = await showConfirm({
            title: 'Liberar tentativas',
            message: `Liberar mais 1 tentativa de "${row.theme}" para ${user.fullName}?`,
            icon: 'fa-unlock',
            tone: 'neutral',
            details: ['O aluno ganha exatamente 1 nova tentativa — as reprovações já feitas continuam contando.'],
            confirmText: 'Liberar 1 tentativa'
        });
        if (!confirmed) return;

        try {
            await U.Attempts.unlock(user.userId, course.slug, course.subjectId, course.themeId, 'Administrador');
            showWarning('1 tentativa liberada com sucesso.');
            await openUserHistory(user.userId);
        } catch (error) {
            showWarning('Erro ao liberar tentativa: ' + error.message);
        }
    }

    async function handleDeleteUser(userId) {
        const user = usersCache[userId];
        if (!user) return;

        const confirmed = await showConfirm({
            title: 'Excluir conta',
            message: `A conta de ${user.fullName} será removida permanentemente.`,
            icon: 'fa-trash-can',
            details: [
                'O nome volta a ficar disponível para um novo cadastro.',
                { text: 'O histórico de notas/resultados desta conta NÃO é apagado.', alert: false },
                { text: 'Esta ação não pode ser desfeita.', alert: true }
            ],
            requireWord: 'SIM',
            confirmText: 'Excluir'
        });
        if (!confirmed) return;

        try {
            const updates = {};
            updates[`${USERS_PATH}/${userId}`] = null;
            if (user.colaboradorId) {
                updates[`${COLABS_PATH}/${user.colaboradorId}/accountUserId`] = null;
            }
            await db.ref().update(updates);
            await populateUsers();
            showWarning('Conta excluída com sucesso.');
        } catch (error) {
            showWarning('Erro ao excluir conta: ' + error.message);
        }
    }
})();
