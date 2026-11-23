// Home: seleção da plataforma (Treinamentos / Educação Continuada / Estágios).
// Cada card leva ao portal (portal.html) já com a categoria escolhida.
(function () {

// Indicadores lidos pelo SDK (as regras do banco exigem a sessão do Dados LAMIC).

// Mesmo mapeamento de js/firebase-config.js (UniAdmin.categoryPaths).
const PLATFORMS = [
    {
        category: 'Treinamentos',
        slug: 'treinamentos',
        kicker: 'Capacitação interna',
        description: 'Trilhas de treinamento com vídeos, materiais de apoio e avaliação de aprendizagem.',
        icon: 'fa-chalkboard-user',
        color: 'var(--c-treinamentos)',
        badge: 'Ativa',
        tags: [
            { icon: 'fa-video', label: 'Vídeoaulas' },
            { icon: 'fa-file-pdf', label: 'Materiais' },
            { icon: 'fa-clipboard-check', label: 'Avaliação' }
        ]
    },
    {
        category: 'Educação Continuada',
        slug: 'educacao_continuada',
        kicker: 'Atualização permanente',
        description: 'Conteúdos de atualização científica e técnica para a equipe já formada.',
        icon: 'fa-book-open-reader',
        color: 'var(--c-educacao)',
        badge: 'Ativa',
        tags: [
            { icon: 'fa-certificate', label: 'Certificação' },
            { icon: 'fa-layer-group', label: 'Por assunto' },
            { icon: 'fa-star', label: 'Avaliação do curso' }
        ]
    },
    {
        category: 'Estágios',
        slug: 'estagios',
        kicker: 'Formação de estagiários',
        description: 'Percurso de integração e formação prática para estagiários do laboratório.',
        icon: 'fa-user-graduate',
        color: 'var(--c-estagios)',
        badge: 'Ativa',
        tags: [
            { icon: 'fa-route', label: 'Trilha guiada' },
            { icon: 'fa-list-check', label: 'Progresso' },
            { icon: 'fa-user-check', label: 'Registro' }
        ]
    }
];

const STATS = [
    { key: 'subjects', label: 'Temas' },
    { key: 'themes', label: 'Assuntos' },
    { key: 'modules', label: 'Módulos' }
];

const grid = document.getElementById('platform-grid');

function openPlatform(platform) {
    try {
        localStorage.setItem('uniadmin.category', platform.category);
    } catch (error) {
        // localStorage indisponível (modo privado / file://): a query string basta.
    }
    location.href = 'portal.html?cat=' + encodeURIComponent(platform.category);
}

function buildCard(platform) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'platform-card';
    card.style.setProperty('--card-color', platform.color);
    card.setAttribute('aria-label', 'Acessar ' + platform.category);

    const tags = platform.tags
        .map(tag => `<span class="card-tag"><i class="fas ${tag.icon}"></i>${tag.label}</span>`)
        .join('');

    const stats = STATS
        .map(stat => `
            <div class="card-stat is-loading" data-stat="${stat.key}">
                <div class="stat-value">—</div>
                <div class="stat-label">${stat.label}</div>
            </div>`)
        .join('');

    card.innerHTML = `
        <div class="card-top">
            <div class="card-icon"><i class="fas ${platform.icon}"></i></div>
            <div class="card-heading">
                <h2>${platform.category}</h2>
                <div class="card-kicker">${platform.kicker}</div>
            </div>
            <span class="card-badge">${platform.badge}</span>
        </div>
        <p class="card-desc">${platform.description}</p>
        <div class="card-tags">${tags}</div>
        <div class="card-stats">${stats}</div>
        <div class="card-foot">
            <span class="card-enter">Acessar <i class="fas fa-arrow-right"></i></span>
        </div>`;

    card.addEventListener('click', () => openPlatform(platform));
    return card;
}

function countEntries(value) {
    if (!value || typeof value !== 'object') return 0;
    return Object.keys(value).length;
}

// Conta temas, assuntos e módulos de uma categoria a partir de trainingData.
function summarize(trainingData) {
    const summary = { subjects: 0, themes: 0, modules: 0 };
    if (!trainingData || typeof trainingData !== 'object') return summary;

    for (const subjectId of Object.keys(trainingData)) {
        const subject = trainingData[subjectId];
        if (!subject || !subject.name || !String(subject.name).trim()) continue;
        summary.subjects++;

        const themes = subject.themes || {};
        for (const themeId of Object.keys(themes)) {
            const theme = themes[themeId];
            if (!theme || !theme.name || !String(theme.name).trim()) continue;
            summary.themes++;
            summary.modules += countEntries(theme.modules);
        }
    }
    return summary;
}

function renderStats(card, summary) {
    for (const stat of STATS) {
        const box = card.querySelector(`[data-stat="${stat.key}"]`);
        if (!box) continue;
        box.classList.remove('is-loading');
        box.querySelector('.stat-value').textContent = summary[stat.key];
    }
}

async function loadStats(platform, card) {
    try {
        const U = window.UniAdmin;
        await U.StudentAuth?.ready;
        const snap = await U.db.ref(`/${U.dbRoot}/${platform.slug}/trainingData`).once('value');
        renderStats(card, summarize(snap.val()));
    } catch (error) {
        console.error(`Erro ao carregar indicadores de ${platform.category}:`, error);
        for (const stat of STATS) {
            const box = card.querySelector(`[data-stat="${stat.key}"]`);
            if (box) box.querySelector('.stat-value').textContent = '—';
        }
    }
}

for (const platform of PLATFORMS) {
    const card = buildCard(platform);
    grid.appendChild(card);
    loadStats(platform, card);
}

// Atalho para o painel de configurações, dentro do portal.
document.getElementById('home-settings-btn')?.addEventListener('click', () => {
    location.href = 'portal.html#config';
});

})();
