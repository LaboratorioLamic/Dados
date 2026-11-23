// Aba "Cursos" — camada de apresentação que unifica as antigas abas
// Temas / Assuntos / Módulos / Avaliações em uma única tela.
//
// IMPORTANTE — nomenclatura invertida herdada de js/admin.js:
//   subject  (subjectId)  = rótulo visível "Tema"     (nível 1, só nome)
//   theme    (themeId)    = rótulo visível "Assunto"  (nível 2 — é o "curso":
//                            nome, descrição, imagem, prazo, roles, certificado)
//   module                = "Módulo"   (aula: vídeo/pdf/anexos)
//   quiz                  = "Avaliação" (array de questões)
// Hierarquia: Tema → Assunto/curso → Módulos[] + Avaliação.
//
// Este arquivo NÃO duplica lógica de dados/Firebase: toda leitura vem de
// window.UniAdminCoursesData.getData() (a mesma variável `data` de admin.js)
// e toda escrita é feita clicando/disparando os mesmos botões e inputs que
// o formulário legado já usa (eles só mudaram de lugar no HTML, de painel
// inline para dentro de modais — os IDs são idênticos).
(function () {

function C() { return window.UniAdminCoursesData; }

// A categoria aberta filtra cursos por função? Estágios não (não há conta
// logada, logo nenhum cargo de sessão para comparar), então tudo que trata de
// `roles` some da tela — inclusive o selo do card, que antes aparecia ali em
// cursos duplicados de outra categoria sem forma de removê-lo.
function categoryUsesRoles() {
    const category = C()?.getCurrentCategory?.();
    return window.UniAdmin?.categoryUsesRoles ? window.UniAdmin.categoryUsesRoles(category) : true;
}

// ─── Modal Stack: empilhamento de modais com fechar-só-o-topo ───
const ModalStack = (() => {
    const stack = []; // [{ el, onClose }]
    const BASE_Z = 2000, STEP = 25;

    function applyDimming() {
        stack.forEach((entry, i) => {
            entry.el.classList.toggle('cfg-mstack-dimmed', i < stack.length - 1);
        });
    }

    function open(el, { onClose } = {}) {
        if (!el) return;
        if (stack.some(e => e.el === el)) return; // já aberto, evita duplicar no stack
        stack.push({ el, onClose });
        el.style.zIndex = String(BASE_Z + stack.length * STEP);
        el.style.display = 'flex';
        document.body.classList.add('cfg-mstack-open');
        applyDimming();
    }

    function closeTop() {
        const top = stack.pop();
        if (!top) return;
        top.el.style.display = 'none';
        top.el.classList.remove('cfg-mstack-dimmed');
        try { top.onClose?.(); } catch (e) { console.error(e); }
        if (stack.length === 0) document.body.classList.remove('cfg-mstack-open');
        applyDimming();
    }

    function closeAll() { while (stack.length) closeTop(); }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && stack.length) closeTop();
    });

    return { open, closeTop, closeAll, get depth() { return stack.length; } };
})();

// ─── Utilidades compartilhadas (lêem de admin.js via bridge) ───
function escapeHtml(value) {
    return window.UniAdminCoursesData?.escapeHtml
        ? C().escapeHtml(value)
        : String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function themeInitials(name) {
    if (C()?.themeInitials) return C().themeInitials(name);
    const clean = (name || '').trim();
    return clean ? clean.slice(0, 2).toUpperCase() : '?';
}

// ms → HH:MM:SS (HH sem teto), mesmo formato usado no formulário de assunto
// e no chip "Tempo esperado" do dashboard.
function formatMsAsHHMMSS(ms) {
    const totalSeconds = Math.round(Number(ms) / 1000);
    const pad = v => String(v).padStart(2, '0');
    return `${pad(Math.floor(totalSeconds / 3600))}:${pad(Math.floor((totalSeconds % 3600) / 60))}:${pad(totalSeconds % 60)}`;
}

function validKeys(collection) {
    if (!collection || typeof collection !== 'object') return [];
    return Object.keys(collection).filter(key => collection[key] && typeof collection[key] === 'object');
}

// ─── Estado local da UI (não é dado de negócio, não vai pro Firebase) ───
let selectedSubjectFilter = null; // null = todos os temas; senão, 1 subjectId
let selectedStatusFilter = 'active'; // 'active' | 'inactive' | 'all' — padrão: só ativos
let currentDetailSubjectId = null;
let currentDetailThemeId = null;

// ══════════════════════════════════════════════════════════════════
// Popover de filtro por Tema
// ══════════════════════════════════════════════════════════════════
const filterBtn = document.getElementById('cfg-courses-filter-btn');
const filterPopover = document.getElementById('cfg-courses-filter-popover');
const filterListEl = document.getElementById('cfg-courses-filter-list');
const filterSearchInput = document.getElementById('cfg-courses-filter-search');
const filterClearBtn = document.getElementById('cfg-courses-filter-clear');
const filterSummaryEl = document.getElementById('cfg-courses-filter-summary');

function refreshFilterSummary() {
    filterSummaryEl.textContent = selectedSubjectFilter
        ? (C().getData().trainingData[selectedSubjectFilter]?.name || 'Tema selecionado')
        : 'Todos os temas';
    filterBtn.classList.toggle('is-on', !!selectedSubjectFilter);
}

function renderFilterList() {
    if (!filterListEl) return;
    const term = (filterSearchInput?.value || '').trim().toLowerCase();
    const data = C().getData();
    const subjectIds = (data.order?.subjects?.length ? data.order.subjects : validKeys(data.trainingData))
        .filter(id => data.trainingData[id]);
    const visible = subjectIds.filter(id => !term || data.trainingData[id].name.toLowerCase().includes(term));
    if (visible.length === 0) {
        filterListEl.innerHTML = subjectIds.length === 0
            ? '<p class="filter-popover-empty">Nenhum tema cadastrado ainda.</p>'
            : '<p class="filter-popover-empty">Nada encontrado.</p>';
        refreshFilterSummary();
        positionFilterPopover();
        return;
    }
    const allOn = !selectedSubjectFilter;
    const allOptionHtml = `
        <button type="button" class="filter-popover-option ${allOn ? 'is-selected' : ''}" data-subject-id="" role="radio" aria-checked="${allOn}">
            <span class="filter-popover-option-mark"><i class="fas fa-layer-group"></i></span>
            <span class="filter-popover-option-label">Todos os temas</span>
        </button>`;
    filterListEl.innerHTML = allOptionHtml + visible.map(id => {
        const on = selectedSubjectFilter === id;
        return `
        <button type="button" class="filter-popover-option ${on ? 'is-selected' : ''}" data-subject-id="${id}" role="radio" aria-checked="${on}">
            <span class="filter-popover-option-mark"><i class="fas fa-bookmark"></i></span>
            <span class="filter-popover-option-label">${escapeHtml(data.trainingData[id].name)}</span>
        </button>`;
    }).join('');
    filterListEl.querySelectorAll('.filter-popover-option').forEach(option => {
        option.addEventListener('click', () => {
            selectedSubjectFilter = option.dataset.subjectId || null;
            renderFilterList();
            renderCoursesGrid();
            closeFilterPopover();
        });
    });
    refreshFilterSummary();
    positionFilterPopover();
}

function positionFilterPopover() {
    if (!filterPopover || filterPopover.hidden) return;
    const rect = filterBtn.getBoundingClientRect();
    const gap = 6, margin = 10;
    filterPopover.style.width = `${Math.max(rect.width, 260)}px`;
    filterPopover.style.left = `${Math.max(margin, Math.min(rect.left, window.innerWidth - Math.max(rect.width, 260) - margin))}px`;
    filterPopover.style.top = '0px';
    const height = filterPopover.offsetHeight;
    const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
    const openUp = spaceBelow < height && rect.top - gap - margin > spaceBelow;
    const available = Math.max(180, openUp ? rect.top - gap - margin : spaceBelow);
    const chrome = height - filterListEl.offsetHeight;
    filterListEl.style.maxHeight = `${Math.max(120, available - chrome)}px`;
    const finalHeight = Math.min(filterPopover.offsetHeight, available);
    filterPopover.style.top = openUp ? `${rect.top - gap - finalHeight}px` : `${rect.bottom + gap}px`;
}

function closeFilterPopover() {
    if (!filterPopover || filterPopover.hidden) return;
    filterPopover.hidden = true;
    filterBtn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onFilterOutsideClick, true);
    window.removeEventListener('resize', positionFilterPopover);
    window.removeEventListener('scroll', positionFilterPopover, true);
}
function onFilterOutsideClick(event) {
    if (!filterPopover.contains(event.target) && !filterBtn.contains(event.target)) closeFilterPopover();
}

filterBtn?.addEventListener('click', () => {
    const willOpen = filterPopover.hidden;
    if (!willOpen) { closeFilterPopover(); return; }
    const cfgRoot = document.getElementById('cfg-root') || document.body;
    if (filterPopover.parentElement !== cfgRoot) cfgRoot.appendChild(filterPopover);
    filterPopover.hidden = false;
    filterBtn.setAttribute('aria-expanded', 'true');
    filterSearchInput.value = '';
    renderFilterList();
    positionFilterPopover();
    document.addEventListener('click', onFilterOutsideClick, true);
    window.addEventListener('resize', positionFilterPopover);
    window.addEventListener('scroll', positionFilterPopover, true);
    setTimeout(() => filterSearchInput.focus(), 40);
});
filterSearchInput?.addEventListener('input', renderFilterList);
filterClearBtn?.addEventListener('click', () => {
    selectedSubjectFilter = null;
    renderFilterList();
    renderCoursesGrid();
});

// ══════════════════════════════════════════════════════════════════
// Modal "Gerenciar Temas"
// ══════════════════════════════════════════════════════════════════
const subjectManageModal = document.getElementById('cfg-subject-manage-modal');

function openSubjectManageModal() {
    ModalStack.open(subjectManageModal, {
        onClose: () => {
            document.getElementById('cfg-subject-delete').style.display = 'none';
            document.getElementById('cfg-subject-name').value = '';
        }
    });
    renderFilterList(); // temas podem ter mudado — mantém popover em dia
}
document.getElementById('cfg-courses-manage-themes-btn')?.addEventListener('click', openSubjectManageModal);
document.getElementById('cfg-subject-manage-close')?.addEventListener('click', () => ModalStack.closeTop());
subjectManageModal?.addEventListener('click', (event) => { if (event.target === subjectManageModal) ModalStack.closeTop(); });

document.getElementById('cfg-courses-status-segment')?.addEventListener('click', (event) => {
    const btn = event.target.closest('.status-segment-btn[data-status]');
    if (!btn) return;
    selectedStatusFilter = btn.dataset.status;
    document.querySelectorAll('#cfg-courses-status-segment .status-segment-btn').forEach(b => {
        b.classList.toggle('is-active', b === btn);
    });
    renderCoursesGrid();
});

// ══════════════════════════════════════════════════════════════════
// Modal de formulário de Assunto (curso)
// ══════════════════════════════════════════════════════════════════
const themeFormModal = document.getElementById('cfg-theme-form-modal');
const themeFormTitle = document.getElementById('cfg-theme-form-title');

function openThemeFormModal({ subjectId, themeId } = {}) {
    const subjectSelect = document.getElementById('cfg-theme-subject');
    if (subjectId) {
        subjectSelect.value = subjectId;
        subjectSelect.dispatchEvent(new Event('change'));
    }
    if (themeId) {
        // populateThemes() (chamada pelo 'change' acima) já re-renderiza os
        // cards legados escondidos; simulamos o clique "Editar" existente.
        const editBtn = document.querySelector(`#cfg-themes-container .edit-theme[data-id="${themeId}"]`);
        editBtn?.click();
        themeFormTitle.innerHTML = '<i class="fas fa-layer-group"></i> Editar Curso';
    } else {
        C().resetThemeForm?.();
        themeFormTitle.innerHTML = '<i class="fas fa-layer-group"></i> Novo Curso';
    }
    ModalStack.open(themeFormModal, {
        onClose: () => { C().resetThemeForm?.(); renderCoursesGrid(); }
    });
}
document.getElementById('cfg-theme-form-close')?.addEventListener('click', () => ModalStack.closeTop());
// Clique no backdrop nao fecha o formulario de curso — apenas o X (evita perda de dados).

document.getElementById('cfg-courses-add-btn')?.addEventListener('click', () => {
    const data = C().getData();
    const subjectIds = validKeys(data.trainingData);
    if (subjectIds.length === 0) {
        window.UniAdmin?.showWarning?.('Cadastre um tema antes de adicionar um curso.');
        openSubjectManageModal();
        return;
    }
    // Se houver um tema selecionado no filtro, já pré-seleciona.
    openThemeFormModal({ subjectId: selectedSubjectFilter || '' });
});

// ══════════════════════════════════════════════════════════════════
// Modal de detalhe do curso (drawer): hero + abas Módulos/Avaliação
// ══════════════════════════════════════════════════════════════════
const detailModal = document.getElementById('cfg-course-detail-modal');
const detailThumb = document.getElementById('cfg-course-detail-thumb');
const detailTitle = document.getElementById('cfg-course-detail-title');
const detailTags = document.getElementById('cfg-course-detail-tags');

function refreshDetailTabCounts() {
    if (!currentDetailSubjectId || !currentDetailThemeId) return;
    const data = C().getData();
    const theme = data.trainingData[currentDetailSubjectId]?.themes?.[currentDetailThemeId];
    if (!theme) return;
    const modules = theme.modules || [];
    const quizKey = `${currentDetailSubjectId}_${currentDetailThemeId}`;
    const quizCount = data.quizData?.[quizKey]?.length || 0;
    const modCountEl = document.getElementById('cfg-course-detail-tabcount-modules');
    const quizCountEl = document.getElementById('cfg-course-detail-tabcount-quiz');
    if (modCountEl) modCountEl.textContent = String(modules.length);
    if (quizCountEl) quizCountEl.textContent = String(quizCount);
    renderCourseInfo(currentDetailSubjectId, currentDetailThemeId, theme);
}

// Aba "Informações": mostra tudo que foi cadastrado no formulário de Assunto
// (descrição, status, prazo, funções, certificado) em formato de leitura.
function renderCourseInfo(subjectId, themeId, theme) {
    const infoEl = document.getElementById('cfg-course-detail-info');
    if (!infoEl) return;
    const data = C().getData();
    const subjectName = data.trainingData[subjectId]?.name || '—';

    // Prazo
    const deadlineStatus = window.UniAdmin?.Deadlines?.computeDeadlineStatus?.(theme.deadline) || 'livre';
    const deadlineLabel = window.UniAdmin?.Deadlines?.STATUS_LABELS?.[deadlineStatus] || 'Sem prazo';
    const fmtDate = window.UniAdmin?.Deadlines?.formatDeadlineDate;
    const deadlineRows = theme.deadline?.mode === 'prazo' && fmtDate ? `
        <div class="course-info-subrow"><span>Início</span><strong>${fmtDate(theme.deadline.startAt)}</strong></div>
        <div class="course-info-subrow"><span>Prazo final</span><strong>${fmtDate(theme.deadline.endAt)}</strong></div>
        <div class="course-info-subrow"><span>Encerramento</span><strong>${fmtDate(theme.deadline.closeAt)}</strong></div>`
        : '';

    // Tempo de conclusão esperado (ms → HH:MM:SS). Independe do prazo: vale
    // também para curso em modo "Livre".
    const expectedMs = Number(theme.expectedCompletionMs);
    const expectedRow = Number.isFinite(expectedMs) && expectedMs > 0
        ? `<div class="course-info-subrow"><span>Tempo esperado</span><strong>${formatMsAsHHMMSS(expectedMs)}</strong></div>`
        : '';

    // Funções com acesso. Estágios não tem conta logada (logo, nenhum cargo de
    // sessão para comparar), então o bloco inteiro sai da tela.
    const roles = Array.isArray(theme.roles) ? theme.roles.filter(Boolean) : [];
    const rolesHtml = roles.length
        ? `<div class="course-info-pills">${roles.map(r => `<span class="course-info-pill">${escapeHtml(r)}</span>`).join('')}</div>`
        : '<p class="course-info-muted">Visível para todas as funções.</p>';
    const rolesCard = !categoryUsesRoles() ? '' : `
        <div class="course-info-card">
            <div class="course-info-card-head"><i class="fas fa-user-tag"></i> Funções que veem este curso</div>
            ${rolesHtml}
        </div>`;

    // Certificado
    const certTopics = theme.certificateEnabled ? (window.UniAdmin?.Certificate?.parseTopics?.(theme.certificateTopics) || []) : [];
    const certHtml = theme.certificateEnabled ? `
        <div class="course-info-subrow"><span>Título</span><strong>${escapeHtml(theme.certificateTitle || subjectName)}</strong></div>
        <div class="course-info-subrow"><span>Carga horária</span><strong>${theme.certificateHours || 10}h</strong></div>
        <div class="course-info-subrow"><span>Tópicos</span><strong>${certTopics.length ? `${certTopics.length} tópico(s)` : 'Nenhum tópico cadastrado'}</strong></div>`
        : '<p class="course-info-muted">Emissão de certificado desativada para este curso.</p>';

    // Módulos e avaliação (resumo — o detalhe fica nas próprias abas)
    const moduleCount = theme.modules?.length || 0;
    const quizKey = `${subjectId}_${themeId}`;
    const quizCount = data.quizData?.[quizKey]?.length || 0;
    const quizEnabled = data.quizStatus?.[quizKey] !== false;

    infoEl.innerHTML = `
        <div class="course-info-card">
            <div class="course-info-card-head"><i class="fas fa-align-left"></i> Descrição</div>
            <p class="course-info-desc">${theme.description ? escapeHtml(theme.description) : '<span class="course-info-muted">Nenhuma descrição cadastrada.</span>'}</p>
        </div>

        <div class="course-info-card">
            <div class="course-info-card-head"><i class="fas fa-toggle-on"></i> Status</div>
            <div class="course-info-row">
                <span class="course-info-status ${theme.active === false ? 'is-inactive' : 'is-active'}">
                    <i class="fas ${theme.active === false ? 'fa-ban' : 'fa-check-circle'}"></i>
                    ${theme.active === false ? 'Inativo' : 'Ativo'}
                </span>
                <span class="deadline-badge deadline-${deadlineStatus}">${deadlineLabel}</span>
            </div>
            ${deadlineRows}
            ${expectedRow}
        </div>

        <div class="course-info-card">
            <div class="course-info-card-head"><i class="fas fa-bookmark"></i> Organização</div>
            <div class="course-info-subrow"><span>Tema</span><strong>${escapeHtml(subjectName)}</strong></div>
            <div class="course-info-subrow"><span>Módulos</span><strong>${moduleCount}</strong></div>
            <div class="course-info-subrow"><span>Avaliação</span><strong>${quizCount ? `${quizCount} questão(ões) — ${quizEnabled ? 'habilitada' : 'desabilitada'}` : 'Sem questões cadastradas'}</strong></div>
        </div>

        ${rolesCard}

        <div class="course-info-card">
            <div class="course-info-card-head"><i class="fas fa-award"></i> Certificado</div>
            ${certHtml}
        </div>

        <div id="cfg-course-orphans"></div>`;
    renderOrphanHistory(subjectId, themeId, theme);
}

// Histórico sem curso: resultados gravados sob uma chave que não existe mais
// (curso migrado de tema antes de a migração levar o histórico junto).
// Oferece vincular esses registros a este curso — quem realizou volta a
// constar como concluído e a tabela volta a mostrar os nomes.
async function renderOrphanHistory(subjectId, themeId, theme) {
    const host = document.getElementById('cfg-course-orphans');
    if (!host) return;
    const slug = C().getCategorySlug();
    let orphans = [];
    try { orphans = await C().findOrphanHistory(slug, C().getData().trainingData); }
    catch (error) { console.error('Erro ao buscar histórico sem curso:', error); return; }
    // O modal pode ter trocado de curso enquanto a leitura estava em voo.
    if (currentDetailSubjectId !== subjectId || currentDetailThemeId !== themeId) return;
    if (!orphans.length) { host.innerHTML = ''; return; }

    const fmt = ts => ts ? new Date(ts).toLocaleDateString('pt-BR') : '—';
    host.innerHTML = `
        <div class="course-info-card">
            <div class="course-info-card-head"><i class="fas fa-link-slash"></i> Histórico sem curso</div>
            <p class="course-info-muted">Registros gravados para cursos que não existem mais nesta categoria (ex.: curso migrado de tema). Vincule ao curso correto para que quem realizou conste como concluído.</p>
            ${orphans.map(o => `
                <div class="course-info-subrow">
                    <span>Tema ${escapeHtml(o.subjectId)} / Assunto ${escapeHtml(o.themeId)} — ${o.count} registro(s), último em ${fmt(o.lastAt)}</span>
                    <button type="button" class="btn btn-ghost btn-sm" data-orphan="${escapeHtml(o.subjectId)}|${escapeHtml(o.themeId)}"><i class="fas fa-link"></i> Vincular a este curso</button>
                </div>`).join('')}
        </div>`;

    host.querySelectorAll('[data-orphan]').forEach(btn => btn.addEventListener('click', async () => {
        const [fromSubjectId, fromThemeId] = btn.dataset.orphan.split('|');
        const U = window.UniAdmin;
        const data = C().getData();
        const ok = await U.showConfirm({
            title: 'Vincular histórico',
            message: `Os registros de "Tema ${fromSubjectId} / Assunto ${fromThemeId}" passarão a pertencer a "${theme.name}".`,
            icon: 'fa-link',
            tone: 'neutral',
            confirmText: 'Vincular'
        });
        if (!ok) return;
        btn.disabled = true;
        try {
            const moved = await C().relinkCourseHistory(slug,
                { subjectId: fromSubjectId, themeId: fromThemeId },
                { subjectId, themeId, subjectName: data.trainingData[subjectId]?.name, themeName: theme.name });
            U.showWarning(`${moved} registro(s) vinculado(s) a "${theme.name}".`);
            await U.refreshHistoryRows?.();
            window.UniAdminCourses?.refresh?.();
            renderOrphanHistory(subjectId, themeId, theme);
        } catch (error) {
            btn.disabled = false;
            U.showWarning(`Erro ao vincular histórico: ${error.message}`);
        }
    }));
}

function openCourseDetail(subjectId, themeId) {
    const data = C().getData();
    const theme = data.trainingData[subjectId]?.themes?.[themeId];
    if (!theme) return;
    currentDetailSubjectId = subjectId;
    currentDetailThemeId = themeId;

    detailTitle.textContent = theme.name;
    detailThumb.innerHTML = theme.image
        ? `<img src="${escapeHtml(theme.image)}" alt="">`
        : escapeHtml(themeInitials(theme.name));
    const subjectName = data.trainingData[subjectId]?.name || '';
    detailTags.innerHTML = `
        <span class="dash-course-subject-tag"><i class="fas fa-bookmark"></i> ${escapeHtml(subjectName)}</span>
        ${theme.active === false ? '<span class="user-status-badge">Inativo</span>' : ''}`;

    renderCourseInfo(subjectId, themeId, theme);

    // Contexto para as funções legadas de populateModules()/populateQuizzes(),
    // que leem dos <select> ocultos cfg-module-subject/theme e cfg-quiz-subject/theme.
    C().setModuleContext(subjectId, themeId);
    C().setQuizContext(subjectId, themeId);
    refreshDetailTabCounts();

    // Sempre abre na aba Informações.
    detailModal.querySelectorAll('.course-drawer-tabs .tab-btn').forEach((btn, i) => btn.classList.toggle('active', i === 0));
    detailModal.querySelectorAll('.course-drawer-body .tab-content').forEach((tab, i) => tab.classList.toggle('active', i === 0));

    ModalStack.open(detailModal, { onClose: () => { currentDetailSubjectId = null; currentDetailThemeId = null; } });
}

detailModal?.querySelectorAll('.course-drawer-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        detailModal.querySelectorAll('.course-drawer-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.dataset.courseDetailTab;
        detailModal.querySelectorAll('.course-drawer-body .tab-content').forEach(tab => {
            tab.classList.toggle('active', tab.id === `cfg-course-detail-tab-${target}`);
        });
    });
});
document.getElementById('cfg-course-detail-close')?.addEventListener('click', () => ModalStack.closeTop());
detailModal?.addEventListener('click', (event) => { if (event.target === detailModal) ModalStack.closeTop(); });
document.getElementById('cfg-course-detail-edit')?.addEventListener('click', () => {
    if (currentDetailSubjectId && currentDetailThemeId) {
        openThemeFormModal({ subjectId: currentDetailSubjectId, themeId: currentDetailThemeId });
    }
});

// ══════════════════════════════════════════════════════════════════
// Modal de formulário de Módulo (empilhado sobre o drawer)
// ══════════════════════════════════════════════════════════════════
const moduleFormModal = document.getElementById('cfg-module-form-modal');
const moduleFormTitle = document.getElementById('cfg-module-form-title');

document.getElementById('cfg-course-detail-add-module')?.addEventListener('click', () => {
    C().resetModuleForm();
    moduleFormTitle.innerHTML = '<i class="fas fa-play-circle"></i> Novo Módulo';
    ModalStack.open(moduleFormModal, { onClose: () => { C().resetModuleForm(); refreshDetailTabCounts(); } });
});
document.getElementById('cfg-module-form-close')?.addEventListener('click', () => ModalStack.closeTop());
// Clique no backdrop nao fecha o formulario de modulo — apenas o X (evita perda de dados).

// Delegação: os botões "Editar" dos module-cards (renderizados pela função
// legada populateModules()) continuam existindo; aqui só interceptamos o
// clique para também abrir o modal empilhado por cima do drawer.
document.getElementById('cfg-modules-container')?.addEventListener('click', (event) => {
    if (event.target.closest('.edit-module')) {
        moduleFormTitle.innerHTML = '<i class="fas fa-play-circle"></i> Editar Módulo';
        ModalStack.open(moduleFormModal, { onClose: () => { C().resetModuleForm(); refreshDetailTabCounts(); } });
    }
});
// O handler legado (admin.js) é async: valida, salva, e só então limpa o
// form (título fica vazio de novo). Só fechamos o modal quando o título
// realmente esvaziar — se a validação falhar (showWarning), o form mantém
// o texto digitado e o modal permanece aberto para o usuário corrigir.
function watchAndAutoClose(inputEl, modalEl, resetFn) {
    const titleBefore = inputEl.value.trim();
    if (!titleBefore) return; // nada preenchido, não há o que salvar
    const check = () => {
        if (modalEl.style.display !== 'flex') return; // já foi fechado por outro caminho
        if (inputEl.value.trim() === '') ModalStack.closeTop();
    };
    // Duas tentativas cobrem tanto o caminho rápido (validação síncrona)
    // quanto o caminho com upload de imagem/spinner (levemente mais lento).
    setTimeout(check, 120);
    setTimeout(check, 500);
}
document.getElementById('cfg-module-save')?.addEventListener('click', () => {
    watchAndAutoClose(document.getElementById('cfg-module-title'), moduleFormModal);
});

// ══════════════════════════════════════════════════════════════════
// Seletor de tipo de conteúdo do módulo (Vídeo / PDF / Vídeos curtos)
// ══════════════════════════════════════════════════════════════════
// Os três tipos são exclusivos: só o campo do tipo escolhido fica
// visível, e js/admin.js lê o tipo do hidden #cfg-module-type na hora
// de salvar. Este arquivo é a única fonte de verdade da UI do seletor.
const CTYPES = {
    video:  { icon: 'fa-play',          badge: 'is-video',  label: 'Vídeo (YouTube)', desc: 'Aula em vídeo horizontal' },
    pdf:    { icon: 'fa-file-pdf',      badge: 'is-pdf',    label: 'PDF / Slides',    desc: 'Documento hospedado no Dropbox' },
    shorts: { icon: 'fa-mobile-screen', badge: 'is-shorts', label: 'Vídeos curtos',   desc: 'Vários vídeos verticais em carrossel' },
    quiz:   { icon: 'fa-bolt',          badge: 'is-quiz',   label: 'Quiz',            desc: 'Cards de perguntas rápidas com resposta na hora' }
};

const ctypeInput = document.getElementById('cfg-module-type');
const ctypeBtn = document.getElementById('cfg-module-ctype-btn');
const ctypePopover = document.getElementById('cfg-module-ctype-popover');
const ctypeBadge = document.getElementById('cfg-module-ctype-badge');
const ctypeIcon = document.getElementById('cfg-module-ctype-icon');
const ctypeSummary = document.getElementById('cfg-module-ctype-summary');
const ctypeDesc = document.getElementById('cfg-module-ctype-desc');
const shortsDataInput = document.getElementById('cfg-module-shorts-data');
const shortsListEl = document.getElementById('cfg-module-shorts-list');
const shortsLinkInput = document.getElementById('cfg-module-shorts-link');
const shortsTitleInput = document.getElementById('cfg-module-shorts-title');
const shortsAddBtn = document.getElementById('cfg-module-shorts-add');
const shortsCancelEditBtn = document.getElementById('cfg-module-shorts-cancel-edit');
const shortsErrorEl = document.getElementById('cfg-module-shorts-error');

// Extrai o ID de 11 caracteres de qualquer formato aceito: link de
// shorts, link curto youtu.be, watch?v= ou o ID digitado puro.
function extractYouTubeId(raw) {
    const value = (raw || '').trim();
    if (!value) return null;
    if (/^[A-Za-z0-9_-]{11}$/.test(value)) return value;
    const patterns = [
        /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/i,
        /youtu\.be\/([A-Za-z0-9_-]{11})/i,
        /[?&]v=([A-Za-z0-9_-]{11})/i,
        /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/i
    ];
    for (const pattern of patterns) {
        const match = value.match(pattern);
        if (match) return match[1];
    }
    return null;
}
// admin.js normaliza o videoId ao salvar o módulo e precisa deste helper,
// que fica preso no escopo deste IIFE.
window.extractYouTubeId = extractYouTubeId;

// Campo "ID do Vídeo": colar/digitar um link inteiro troca o valor pelo ID,
// para o admin ver na hora o que será salvo.
const moduleVideoIdInput = document.getElementById('cfg-module-video');
function normalizeModuleVideoInput() {
    const id = extractYouTubeId(moduleVideoIdInput.value);
    if (id && id !== moduleVideoIdInput.value) moduleVideoIdInput.value = id;
}
moduleVideoIdInput?.addEventListener('paste', () => setTimeout(normalizeModuleVideoInput, 0));
moduleVideoIdInput?.addEventListener('change', normalizeModuleVideoInput);

// Link de compartilhamento do Dropbox → caminho salvo em pdfUrl (o que vem
// depois de /scl/fi/), com dl=1 para baixar o arquivo em vez da página de
// visualização. O ID já no formato certo passa só pela troca do dl.
function extractDropboxPath(raw) {
    let value = (raw || '').trim();
    if (!value) return '';
    const marker = value.search(/\/scl\/fi\//i);
    if (marker !== -1) value = value.slice(marker + '/scl/fi/'.length);
    if (/[?&]dl=[^&]*/.test(value)) {
        value = value.replace(/([?&]dl=)[^&]*/, (_, prefix) => `${prefix}1`);
    } else if (value.includes('?')) {
        value += '&dl=1';
    }
    return value;
}
window.extractDropboxPath = extractDropboxPath;

const modulePdfPathInput = document.getElementById('cfg-module-pdf');
function normalizeModulePdfInput() {
    const path = extractDropboxPath(modulePdfPathInput.value);
    if (path !== modulePdfPathInput.value) modulePdfPathInput.value = path;
}
modulePdfPathInput?.addEventListener('paste', () => setTimeout(normalizeModulePdfInput, 0));
modulePdfPathInput?.addEventListener('change', normalizeModulePdfInput);

// ── Lista de vídeos curtos: estado em memória + espelho em JSON no hidden.
// admin.js lê só o hidden na hora de salvar — não precisa conhecer esta UI.
let shortsItems = [];
// Índice do item em edição (clique no lápis), ou null quando os campos de
// baixo estão em modo "adicionar". Os mesmos dois inputs + botão servem
// para os dois fluxos, só o rótulo/ação do botão mudam.
let shortsEditingIndex = null;

function readShortsData() {
    try {
        const parsed = JSON.parse(shortsDataInput?.value || '[]');
        return Array.isArray(parsed) ? parsed.filter(item => item && item.id) : [];
    } catch { return []; }
}

function writeShortsData() {
    if (shortsDataInput) shortsDataInput.value = JSON.stringify(shortsItems);
}

function setShortsError(message) {
    if (!shortsErrorEl) return;
    shortsErrorEl.textContent = message || '';
    shortsErrorEl.style.display = message ? '' : 'none';
}

function renderShortsList() {
    if (!shortsListEl) return;
    if (!shortsItems.length) {
        shortsListEl.innerHTML = '<p class="shorts-list-empty">Nenhum vídeo adicionado ainda.</p>';
        return;
    }
    shortsListEl.innerHTML = shortsItems.map((item, index) => `
        <div class="shorts-list-item ${index === shortsEditingIndex ? 'is-editing' : ''}" data-index="${index}">
            <span class="shorts-list-item-index">${index + 1}</span>
            <span class="shorts-list-item-text">
                <strong>${escapeHtml(item.title || item.id)}</strong>
                ${item.title ? `<small>${escapeHtml(item.id)}</small>` : ''}
            </span>
            <button type="button" class="shorts-list-item-edit" data-index="${index}" aria-label="Editar vídeo">
                <i class="fas fa-pencil-alt"></i>
            </button>
            <button type="button" class="shorts-list-item-remove" data-index="${index}" aria-label="Remover vídeo">
                <i class="fas fa-trash"></i>
            </button>
        </div>`).join('');
}

function setShortsItems(items) {
    shortsItems = Array.isArray(items) ? items.filter(item => item && item.id) : [];
    cancelShortsEdit();
    writeShortsData();
    renderShortsList();
}

// Troca o rótulo/ícone do botão entre "Adicionar" e "Salvar edição", e
// mostra/esconde o X de cancelar ao lado.
function updateShortsAddBtnLabel() {
    if (!shortsAddBtn) return;
    const editing = shortsEditingIndex !== null;
    shortsAddBtn.innerHTML = editing
        ? '<i class="fas fa-check"></i> Salvar edição'
        : '<i class="fas fa-plus"></i> Adicionar';
    if (shortsCancelEditBtn) shortsCancelEditBtn.style.display = editing ? '' : 'none';
}

function startShortsEdit(index) {
    const item = shortsItems[index];
    if (!item) return;
    shortsEditingIndex = index;
    if (shortsLinkInput) shortsLinkInput.value = item.id;
    if (shortsTitleInput) shortsTitleInput.value = item.title || '';
    setShortsError('');
    updateShortsAddBtnLabel();
    renderShortsList();
    shortsLinkInput?.focus();
}

function cancelShortsEdit() {
    shortsEditingIndex = null;
    if (shortsLinkInput) shortsLinkInput.value = '';
    if (shortsTitleInput) shortsTitleInput.value = '';
    setShortsError('');
    updateShortsAddBtnLabel();
    renderShortsList();
}

// Mesmos dois campos servem para adicionar (índice null) e para salvar a
// edição de um item existente (shortsEditingIndex definido pelo lápis).
function addShortFromInputs() {
    const id = extractYouTubeId(shortsLinkInput?.value);
    if (!id) {
        setShortsError('Link não reconhecido. Use um link de shorts, youtu.be, watch?v= ou o ID do vídeo.');
        shortsLinkInput?.focus();
        return;
    }
    setShortsError('');
    const title = (shortsTitleInput?.value || '').trim();
    const item = title ? { id, title } : { id };
    if (shortsEditingIndex !== null && shortsItems[shortsEditingIndex]) {
        shortsItems[shortsEditingIndex] = item;
    } else {
        shortsItems.push(item);
    }
    shortsEditingIndex = null;
    writeShortsData();
    updateShortsAddBtnLabel();
    renderShortsList();
    if (shortsLinkInput) shortsLinkInput.value = '';
    if (shortsTitleInput) shortsTitleInput.value = '';
    shortsLinkInput?.focus();
}

shortsAddBtn?.addEventListener('click', addShortFromInputs);
shortsCancelEditBtn?.addEventListener('click', cancelShortsEdit);
[shortsLinkInput, shortsTitleInput].forEach(input => {
    input?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') { event.preventDefault(); addShortFromInputs(); return; }
        if (event.key === 'Escape' && shortsEditingIndex !== null) { event.preventDefault(); cancelShortsEdit(); }
    });
});
shortsLinkInput?.addEventListener('input', () => setShortsError(''));

shortsListEl?.addEventListener('click', (event) => {
    const editBtn = event.target.closest('.shorts-list-item-edit[data-index]');
    if (editBtn) {
        const index = Number(editBtn.dataset.index);
        if (!Number.isNaN(index)) startShortsEdit(index);
        return;
    }
    const removeBtn = event.target.closest('.shorts-list-item-remove[data-index]');
    if (!removeBtn) return;
    const index = Number(removeBtn.dataset.index);
    if (Number.isNaN(index)) return;
    // Remover o item em edição (ou um antes dele) invalidaria o índice
    // guardado: mais simples cancelar a edição em curso.
    if (shortsEditingIndex !== null) cancelShortsEdit();
    shortsItems.splice(index, 1);
    writeShortsData();
    renderShortsList();
});

// ── Perguntas do módulo de Quiz ──────────────────────────────────
// Mesma mecânica da lista de vídeos curtos: estado em memória espelhado
// em JSON no hidden #cfg-module-quiz-data, que é o que admin.js lê ao
// salvar. Cada item: { question, options: [A,B,C,D], correct: 0..3, image? }.
const mquizDataInput = document.getElementById('cfg-module-quiz-data');
const mquizListEl = document.getElementById('cfg-module-quiz-list');
const mquizQuestionInput = document.getElementById('cfg-module-quiz-question');
const mquizExplanationInput = document.getElementById('cfg-module-quiz-explanation');
const mquizOptionInputs = Array.from(document.querySelectorAll('.mquiz-option-input'));
const mquizAddBtn = document.getElementById('cfg-module-quiz-add');
const mquizCancelBtn = document.getElementById('cfg-module-quiz-cancel');
const mquizErrorEl = document.getElementById('cfg-module-quiz-error');
const mquizEditorTitle = document.getElementById('cfg-module-quiz-editor-title');
const mquizImageFile = document.getElementById('cfg-module-quiz-image-file');
const mquizImageClear = document.getElementById('cfg-module-quiz-image-clear');
const mquizImagePreview = document.getElementById('cfg-module-quiz-image-preview');
const mquizImageInfo = document.getElementById('cfg-module-quiz-image-info');
const MQUIZ_IMAGE_EMPTY_HINT = 'Opcional — o card mostra só o texto.';
const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

let mquizItems = [];
let mquizEditingIndex = null;
let mquizPendingImage = null;

function readQuizData() {
    try {
        const parsed = JSON.parse(mquizDataInput?.value || '[]');
        return Array.isArray(parsed) ? parsed.filter(isValidQuizItem) : [];
    } catch { return []; }
}

function isValidQuizItem(item) {
    return !!item
        && typeof item.question === 'string' && item.question.trim() !== ''
        && Array.isArray(item.options) && item.options.length === 4
        && item.options.every(option => typeof option === 'string' && option.trim() !== '')
        && Number.isInteger(item.correct) && item.correct >= 0 && item.correct <= 3;
}

function writeQuizData() {
    if (mquizDataInput) mquizDataInput.value = JSON.stringify(mquizItems);
}

function setQuizError(message) {
    if (!mquizErrorEl) return;
    mquizErrorEl.textContent = message || '';
    mquizErrorEl.style.display = message ? '' : 'none';
}

function renderQuizImagePreview(dataUrl, infoText) {
    if (!mquizImagePreview) return;
    mquizImagePreview.innerHTML = dataUrl
        ? `<img src="${escapeHtml(dataUrl)}" alt="Prévia da imagem da pergunta">`
        : '<span class="image-initials"><i class="fas fa-image"></i></span>';
    if (mquizImageInfo) mquizImageInfo.textContent = infoText;
}

function renderQuizList() {
    if (!mquizListEl) return;
    if (!mquizItems.length) {
        mquizListEl.innerHTML = '<p class="mquiz-list-empty">Nenhuma pergunta adicionada ainda.</p>';
        return;
    }
    mquizListEl.innerHTML = mquizItems.map((item, index) => `
        <div class="mquiz-list-item ${index === mquizEditingIndex ? 'is-editing' : ''}" data-index="${index}">
            <span class="mquiz-list-item-index">${index + 1}</span>
            ${item.image ? `<img class="mquiz-list-item-thumb" src="${escapeHtml(item.image)}" alt="">` : ''}
            <span class="mquiz-list-item-text">
                <strong>${escapeHtml(item.question)}</strong>
                <small>
                    Correta: ${OPTION_LETTERS[item.correct]} — ${escapeHtml(item.options[item.correct])}
                    ${item.explanation ? '<i class="fas fa-lightbulb mquiz-list-item-hasexp" title="Tem explicação"></i>' : ''}
                </small>
            </span>
            <button type="button" class="mquiz-list-item-edit" data-index="${index}" aria-label="Editar pergunta">
                <i class="fas fa-pencil-alt"></i>
            </button>
            <button type="button" class="mquiz-list-item-remove" data-index="${index}" aria-label="Remover pergunta">
                <i class="fas fa-trash"></i>
            </button>
        </div>`).join('');
}

function setQuizItems(items) {
    mquizItems = Array.isArray(items) ? items.filter(isValidQuizItem) : [];
    cancelQuizEdit();
    writeQuizData();
    renderQuizList();
}

function selectedCorrectIndex() {
    const checked = document.querySelector('input[name="cfg-module-quiz-correct"]:checked');
    return checked ? Number(checked.value) : 0;
}

function setCorrectIndex(index) {
    const radio = document.querySelector(`input[name="cfg-module-quiz-correct"][value="${index}"]`);
    if (radio) radio.checked = true;
}

function updateQuizEditorLabel() {
    const editing = mquizEditingIndex !== null;
    if (mquizEditorTitle) {
        mquizEditorTitle.innerHTML = editing
            ? `<i class="fas fa-pen"></i> Editando pergunta ${mquizEditingIndex + 1}`
            : '<i class="fas fa-circle-plus"></i> Nova pergunta';
    }
    if (mquizAddBtn) {
        mquizAddBtn.innerHTML = editing
            ? '<i class="fas fa-check"></i> Salvar pergunta'
            : '<i class="fas fa-plus"></i> Adicionar pergunta';
    }
    if (mquizCancelBtn) mquizCancelBtn.style.display = editing ? '' : 'none';
}

function clearQuizEditorFields() {
    if (mquizQuestionInput) mquizQuestionInput.value = '';
    if (mquizExplanationInput) mquizExplanationInput.value = '';
    mquizOptionInputs.forEach(input => { input.value = ''; });
    setCorrectIndex(0);
    if (mquizImageFile) mquizImageFile.value = '';
    mquizPendingImage = null;
    renderQuizImagePreview(null, MQUIZ_IMAGE_EMPTY_HINT);
    setQuizError('');
}

function cancelQuizEdit() {
    mquizEditingIndex = null;
    clearQuizEditorFields();
    updateQuizEditorLabel();
    renderQuizList();
}

function startQuizEdit(index) {
    const item = mquizItems[index];
    if (!item) return;
    mquizEditingIndex = index;
    if (mquizQuestionInput) mquizQuestionInput.value = item.question;
    if (mquizExplanationInput) mquizExplanationInput.value = item.explanation || '';
    mquizOptionInputs.forEach((input, i) => { input.value = item.options[i] || ''; });
    setCorrectIndex(item.correct);
    mquizPendingImage = item.image || null;
    if (mquizImageFile) mquizImageFile.value = '';
    renderQuizImagePreview(mquizPendingImage, mquizPendingImage ? 'Imagem atual da pergunta.' : MQUIZ_IMAGE_EMPTY_HINT);
    setQuizError('');
    updateQuizEditorLabel();
    renderQuizList();
    mquizQuestionInput?.focus();
}

function addQuizFromInputs() {
    const question = (mquizQuestionInput?.value || '').trim();
    if (!question) {
        setQuizError('Digite a pergunta.');
        mquizQuestionInput?.focus();
        return;
    }
    const options = mquizOptionInputs.map(input => input.value.trim());
    const missing = options.findIndex(option => !option);
    if (missing !== -1) {
        setQuizError(`Preencha a alternativa ${OPTION_LETTERS[missing]}.`);
        mquizOptionInputs[missing].focus();
        return;
    }
    setQuizError('');
    const explanation = (mquizExplanationInput?.value || '').trim();
    const item = {
        question,
        options,
        correct: selectedCorrectIndex(),
        ...(explanation && { explanation }),
        ...(mquizPendingImage && { image: mquizPendingImage })
    };
    if (mquizEditingIndex !== null && mquizItems[mquizEditingIndex]) {
        mquizItems[mquizEditingIndex] = item;
    } else {
        mquizItems.push(item);
    }
    mquizEditingIndex = null;
    writeQuizData();
    clearQuizEditorFields();
    updateQuizEditorLabel();
    renderQuizList();
    mquizQuestionInput?.focus();
}

mquizAddBtn?.addEventListener('click', addQuizFromInputs);
mquizCancelBtn?.addEventListener('click', cancelQuizEdit);
mquizQuestionInput?.addEventListener('input', () => setQuizError(''));
[mquizQuestionInput, ...mquizOptionInputs].forEach(input => {
    input?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') { event.preventDefault(); addQuizFromInputs(); return; }
        if (event.key === 'Escape' && mquizEditingIndex !== null) { event.preventDefault(); cancelQuizEdit(); }
    });
});
// A explicação é textarea: Enter quebra linha, só o Esc cancela a edição.
mquizExplanationInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && mquizEditingIndex !== null) { event.preventDefault(); cancelQuizEdit(); }
});

mquizImageFile?.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
        if (mquizImageInfo) mquizImageInfo.textContent = 'Processando imagem...';
        const result = await window.UniAdminImages.processQuestionFile(file);
        mquizPendingImage = result.dataUrl;
        renderQuizImagePreview(result.dataUrl, `${result.width}×${result.height} • ${(result.bytes / 1024).toFixed(1)} KB • ${result.mime}`);
    } catch (error) {
        mquizImageFile.value = '';
        renderQuizImagePreview(mquizPendingImage, mquizPendingImage ? 'Imagem atual mantida.' : MQUIZ_IMAGE_EMPTY_HINT);
        setQuizError(error.message || 'Não foi possível processar a imagem.');
    }
});

mquizImageClear?.addEventListener('click', () => {
    if (mquizImageFile) mquizImageFile.value = '';
    mquizPendingImage = null;
    renderQuizImagePreview(null, MQUIZ_IMAGE_EMPTY_HINT);
});

mquizListEl?.addEventListener('click', (event) => {
    const editBtn = event.target.closest('.mquiz-list-item-edit[data-index]');
    if (editBtn) {
        const index = Number(editBtn.dataset.index);
        if (!Number.isNaN(index)) startQuizEdit(index);
        return;
    }
    const removeBtn = event.target.closest('.mquiz-list-item-remove[data-index]');
    if (!removeBtn) return;
    const index = Number(removeBtn.dataset.index);
    if (Number.isNaN(index)) return;
    // Remover o item em edição (ou um antes dele) invalidaria o índice guardado.
    if (mquizEditingIndex !== null) cancelQuizEdit();
    mquizItems.splice(index, 1);
    writeQuizData();
    renderQuizList();
});

// Planilha (js/quiz-sheet.js). Como o resto da lista, só vai para o banco
// quando o módulo for salvo.
const mquizSheetFile = document.getElementById('cfg-module-quiz-sheet-file');
const warn = (message) => window.UniAdmin?.showWarning?.(message);

document.getElementById('cfg-module-quiz-sheet-export')?.addEventListener('click', async () => {
    try {
        const title = document.getElementById('cfg-module-title')?.value.trim();
        await window.UniAdmin.QuizSheet.exportQuestions(mquizItems, {
            fileName: `quiz_${title || 'modulo'}`, withExplanation: true
        });
    } catch (error) { warn(`Erro ao exportar planilha: ${error.message}`); }
});

mquizSheetFile?.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    mquizSheetFile.value = '';
    if (!file) return;
    try {
        const { items, skipped } = await window.UniAdmin.QuizSheet.importQuestions(file, { withExplanation: true });
        if (mquizEditingIndex !== null) cancelQuizEdit();
        mquizItems.push(...items);
        writeQuizData();
        renderQuizList();
        warn(`${window.UniAdmin.QuizSheet.describeImport(items.length, skipped)}${items.length ? ' Salve o módulo para gravar.' : ''}`);
    } catch (error) { warn(`Erro ao importar planilha: ${error.message}`); }
});

function setModuleType(kind) {
    const type = CTYPES[kind] ? kind : 'video';
    const meta = CTYPES[type];
    if (ctypeInput) ctypeInput.value = type;
    if (ctypeIcon) ctypeIcon.className = `fas ${meta.icon}`;
    if (ctypeBadge) ctypeBadge.className = `ctype-picker-icon ${meta.badge}`;
    if (ctypeSummary) ctypeSummary.textContent = meta.label;
    if (ctypeDesc) ctypeDesc.textContent = meta.desc;
    document.querySelectorAll('#cfg-module-form-modal .ctype-panel').forEach(panel => {
        panel.hidden = panel.dataset.ctype !== type;
    });
    ctypePopover?.querySelectorAll('.ctype-popover-option').forEach(option => {
        const on = option.dataset.ctype === type;
        option.classList.toggle('is-selected', on);
        option.setAttribute('aria-checked', String(on));
    });
    if (type === 'shorts') renderShortsList();
    if (type === 'quiz') renderQuizList();
}

// Mesmo tratamento do popover de funções (js/admin.js): .modal-content
// tem overflow:hidden, então o popover é movido para o fim de #cfg-root
// e posicionado em coordenadas de viewport, virando para cima quando
// não há espaço abaixo.
function positionCtypePopover() {
    if (!ctypePopover || ctypePopover.hidden) return;
    const rect = ctypeBtn.getBoundingClientRect();
    const gap = 6, margin = 10;
    ctypePopover.style.width = `${rect.width}px`;
    ctypePopover.style.left = `${Math.max(margin, Math.min(rect.left, window.innerWidth - rect.width - margin))}px`;
    ctypePopover.style.top = '0px';
    const height = ctypePopover.offsetHeight;
    const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
    const openUp = spaceBelow < height && rect.top - gap - margin > spaceBelow;
    const finalHeight = Math.min(height, Math.max(160, openUp ? rect.top - gap - margin : spaceBelow));
    ctypePopover.style.top = openUp ? `${rect.top - gap - finalHeight}px` : `${rect.bottom + gap}px`;
}

function closeCtypePopover() {
    if (!ctypePopover || ctypePopover.hidden) return;
    ctypePopover.hidden = true;
    ctypeBtn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onCtypeOutsideClick, true);
    window.removeEventListener('resize', positionCtypePopover);
    window.removeEventListener('scroll', positionCtypePopover, true);
}
function onCtypeOutsideClick(event) {
    if (!ctypePopover.contains(event.target) && !ctypeBtn.contains(event.target)) closeCtypePopover();
}

ctypeBtn?.addEventListener('click', () => {
    if (!ctypePopover.hidden) { closeCtypePopover(); return; }
    const cfgRoot = document.getElementById('cfg-root') || document.body;
    if (ctypePopover.parentElement !== cfgRoot) cfgRoot.appendChild(ctypePopover);
    ctypePopover.hidden = false;
    ctypeBtn.setAttribute('aria-expanded', 'true');
    positionCtypePopover();
    document.addEventListener('click', onCtypeOutsideClick, true);
    window.addEventListener('resize', positionCtypePopover);
    window.addEventListener('scroll', positionCtypePopover, true);
});

ctypePopover?.addEventListener('click', (event) => {
    const option = event.target.closest('.ctype-popover-option[data-ctype]');
    if (!option) return;
    setModuleType(option.dataset.ctype);
    closeCtypePopover();
});

// Escape com o popover aberto fecha só ele — sem o stopPropagation o
// ModalStack fecharia o modal de módulo inteiro junto.
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && ctypePopover && !ctypePopover.hidden) {
        event.stopPropagation();
        closeCtypePopover();
    }
}, true);

// O popover vive fora do modal (foi reparentado para #cfg-root): fechar o
// modal por qualquer caminho não pode deixá-lo órfão flutuando na tela.
document.getElementById('cfg-module-form-close')?.addEventListener('click', closeCtypePopover);
document.getElementById('cfg-module-save')?.addEventListener('click', closeCtypePopover);

// ══════════════════════════════════════════════════════════════════
// Modal de formulário de Avaliação (empilhado sobre o drawer)
// ══════════════════════════════════════════════════════════════════
const quizFormModal = document.getElementById('cfg-quiz-form-modal');
const quizFormTitle = document.getElementById('cfg-quiz-form-title');

document.getElementById('cfg-course-detail-add-quiz')?.addEventListener('click', () => {
    C().resetQuizForm();
    quizFormTitle.innerHTML = '<i class="fas fa-clipboard-list"></i> Nova Questão';
    ModalStack.open(quizFormModal, { onClose: () => { C().resetQuizForm(); refreshDetailTabCounts(); } });
});
document.getElementById('cfg-quiz-form-close')?.addEventListener('click', () => ModalStack.closeTop());
// Clique no backdrop nao fecha o formulario de questao — apenas o X (evita perda de dados).

document.getElementById('cfg-quizzes-container')?.addEventListener('click', (event) => {
    if (event.target.closest('.edit-quiz')) {
        quizFormTitle.innerHTML = '<i class="fas fa-clipboard-list"></i> Editar Questão';
        ModalStack.open(quizFormModal, { onClose: () => { C().resetQuizForm(); refreshDetailTabCounts(); } });
    }
});
document.getElementById('cfg-quiz-save')?.addEventListener('click', () => {
    watchAndAutoClose(document.getElementById('cfg-quiz-question'), quizFormModal);
});

// ══════════════════════════════════════════════════════════════════
// Grid de cards de Assunto/curso
// ══════════════════════════════════════════════════════════════════
const gridEl = document.getElementById('cfg-courses-grid');

function orderedSubjectIds(data) {
    return (data.order?.subjects?.length ? data.order.subjects : validKeys(data.trainingData))
        .filter(id => data.trainingData[id]);
}

function orderedThemeIds(data, subjectId) {
    const themes = data.trainingData[subjectId]?.themes;
    if (!themes) return [];
    const order = data.order?.themes?.[subjectId];
    return (order?.length ? order : validKeys(themes)).filter(id => themes[id]);
}

function buildCourseCard(subjectId, subjectName, themeId, theme, index, total, canReorder) {
    const card = document.createElement('div');
    card.className = 'admin-course-card' + (theme.active === false ? ' is-inactive' : '');
    const media = theme.image
        ? `<img src="${escapeHtml(theme.image)}" alt="">`
        : `<span class="image-initials">${escapeHtml(themeInitials(theme.name))}</span>`;
    const data = C().getData();
    const deadlineStatus = window.UniAdmin?.Deadlines?.computeDeadlineStatus?.(theme.deadline);
    const deadlineBadge = theme.deadline && deadlineStatus
        ? `<span class="deadline-badge deadline-${deadlineStatus}">${window.UniAdmin.Deadlines.STATUS_LABELS[deadlineStatus]}</span>`
        : '';
    const roles = categoryUsesRoles() && Array.isArray(theme.roles) ? theme.roles.filter(Boolean) : [];
    const rolesBadge = roles.length
        ? `<span class="roles-badge" title="Visível apenas para: ${escapeHtml(roles.join(', '))}"><i class="fas fa-user-tag"></i> ${roles.length}</span>`
        : '';
    const moduleCount = theme.modules?.length || 0;
    const quizKey = `${subjectId}_${themeId}`;
    const quizCount = data.quizData?.[quizKey]?.length || 0;
    const quizEnabled = data.quizStatus?.[quizKey] !== false;
    const isFirst = index === 0, isLast = index === total - 1;

    card.innerHTML = `
        <div class="admin-course-card-media">
            ${media}
            <span class="admin-course-card-subject-tag"><i class="fas fa-bookmark"></i> ${escapeHtml(subjectName)}</span>
            ${theme.active === false ? '<span class="admin-course-card-status">Inativo</span>' : ''}
        </div>
        <div class="admin-course-card-body">
            <h3>${escapeHtml(theme.name)}</h3>
            <p class="admin-course-card-desc">${escapeHtml(theme.description || 'Sem descrição.')}</p>
            <div class="admin-course-card-badges">
                ${deadlineBadge}${rolesBadge}
                <span class="modules-count"><i class="fas fa-play-circle"></i> ${moduleCount} módulo(s)</span>
                <span class="quiz-status-badge ${quizCount ? (quizEnabled ? 'is-on' : 'is-off') : ''}">
                    <i class="fas fa-clipboard-list"></i> ${quizCount ? (quizEnabled ? 'Avaliação ativa' : 'Avaliação desativada') : 'Sem avaliação'}
                </span>
            </div>
        </div>
        <div class="admin-course-card-footer">
            ${canReorder ? `
            <div class="order-buttons">
                <button type="button" class="order-btn" data-direction="up" ${isFirst ? 'disabled' : ''} title="Mover para cima"><i class="fas fa-chevron-up"></i></button>
                <button type="button" class="order-btn" data-direction="down" ${isLast ? 'disabled' : ''} title="Mover para baixo"><i class="fas fa-chevron-down"></i></button>
            </div>` : '<div></div>'}
            <div class="card-actions">
                <label class="toggle-switch" title="${theme.active === false ? 'Ativar curso' : 'Desativar curso'}">
                    <input type="checkbox" class="admin-course-card-toggle" ${theme.active === false ? '' : 'checked'}>
                    <span class="toggle-slider"></span>
                </label>
                <button type="button" class="btn btn-ghost btn-sm admin-course-card-edit" title="Editar"><i class="fas fa-pencil-alt"></i></button>
                <button type="button" class="btn btn-danger btn-sm admin-course-card-delete" title="Excluir"><i class="fas fa-trash"></i></button>
            </div>
        </div>`;

    card.querySelector('.order-btn[data-direction="up"]')?.addEventListener('click', (e) => {
        e.stopPropagation(); C().moveTheme(subjectId, themeId, 'up');
    });
    card.querySelector('.order-btn[data-direction="down"]')?.addEventListener('click', (e) => {
        e.stopPropagation(); C().moveTheme(subjectId, themeId, 'down');
    });
    card.querySelector('.toggle-switch')?.addEventListener('click', (e) => e.stopPropagation());
    card.querySelector('.admin-course-card-toggle')?.addEventListener('change', (e) => {
        C().toggleThemeActive(subjectId, themeId, e.target.checked);
    });
    card.querySelector('.admin-course-card-edit')?.addEventListener('click', (e) => {
        e.stopPropagation(); openThemeFormModal({ subjectId, themeId });
    });
    card.querySelector('.admin-course-card-delete')?.addEventListener('click', (e) => {
        e.stopPropagation(); C().deleteTheme(subjectId, themeId);
    });
    card.addEventListener('click', () => openCourseDetail(subjectId, themeId));
    return card;
}

function renderCoursesGrid() {
    if (!gridEl) return;
    const data = C()?.getData?.();
    if (!data) return;
    gridEl.innerHTML = '';
    const subjectIds = orderedSubjectIds(data).filter(id => !selectedSubjectFilter || selectedSubjectFilter === id);
    // Reordenar só faz sentido dentro de um único tema — com "todos os temas"
    // a lista mistura vários temas e a posição relativa perde o sentido.
    const canReorder = !!selectedSubjectFilter;
    let total = 0;
    const frag = document.createDocumentFragment();
    subjectIds.forEach(subjectId => {
        const subjectName = data.trainingData[subjectId].name;
        const themeIds = orderedThemeIds(data, subjectId);
        themeIds.forEach((themeId, index) => {
            const theme = data.trainingData[subjectId].themes[themeId];
            if (!theme) return;
            const isActive = theme.active !== false;
            if (selectedStatusFilter === 'active' && !isActive) return;
            if (selectedStatusFilter === 'inactive' && isActive) return;
            frag.appendChild(buildCourseCard(subjectId, subjectName, themeId, theme, index, themeIds.length, canReorder));
            total++;
        });
    });
    gridEl.appendChild(frag);
    if (total === 0) {
        const hasAnyCourse = subjectIds.some(id => orderedThemeIds(data, id).length > 0);
        const msg = hasAnyCourse
            ? (selectedStatusFilter === 'active' ? 'Nenhum curso ativo para os filtros selecionados.'
                : selectedStatusFilter === 'inactive' ? 'Nenhum curso inativo para os filtros selecionados.'
                : 'Nenhum curso para o tema selecionado.')
            : 'Nenhum curso cadastrado ainda. Clique em "Adicionar curso" para começar.';
        gridEl.innerHTML = `<div class="courses-empty">
            <i class="fas fa-graduation-cap"></i>
            <p>${msg}</p>
        </div>`;
    }
    refreshFilterSummary();
}

// Se o drawer de detalhe estiver aberto quando um refresh() acontecer
// (ex.: salvou módulo/avaliação), mantém os contadores da aba em dia.
function refresh() {
    renderCoursesGrid();
    if (currentDetailSubjectId && currentDetailThemeId) refreshDetailTabCounts();
}

window.UniAdminCourses = { refresh, openCourseDetail, openThemeFormModal, ModalStack,
    // Consumidos por js/admin.js (populateModules / resetModuleForm / save do modulo).
    setModuleType, setShortsItems, readShortsData, closeCtypePopover,
    setQuizItems, readQuizData };

})();
