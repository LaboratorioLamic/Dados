// === INICIALIZAÇÃO E SIDEBAR ===

    // Inicialização (garante que os selects sejam preenchidos ao carregar a página)
    document.addEventListener('DOMContentLoaded', () => {
        populateYearSelects();
        populateSelects();
        initDarkMode();
        initPerfMode();
    });

    // === MODO LEVE (perf-mode) ===
    function initPerfMode() {
        const on = localStorage.getItem('perfMode') === 'true';
        document.body.classList.toggle('perf-mode', on);
    }

    function togglePerfMode() {
        const on = document.body.classList.toggle('perf-mode');
        localStorage.setItem('perfMode', on);
    }

    // === DARK MODE ===
    function initDarkMode() {
        const saved = localStorage.getItem('darkMode');
        const isDark = saved === 'true';
        if (isDark) {
            document.body.classList.add('dark-mode');
        }
        _updateDarkModeIcon(isDark);
        // Remove classe de pré-carregamento do html
        document.documentElement.classList.remove('dark-mode-pre');
    }

    function toggleDarkMode() {
        const isDark = document.body.classList.toggle('dark-mode');
        localStorage.setItem('darkMode', isDark);
        _updateDarkModeIcon(isDark);
        if (typeof window.ocDashRerender === 'function') window.ocDashRerender();
        if (typeof window.rncRerender    === 'function') window.rncRerender();
        if (typeof window.renderCards    === 'function') window.renderCards();
    }

    function _updateDarkModeIcon(isDark) {
        const icon = document.querySelector('.sidebar-darkmode-icon');
        if (!icon) return;
        icon.className = isDark
            ? 'fa-solid fa-sun sidebar-darkmode-icon'
            : 'fa-solid fa-moon sidebar-darkmode-icon';
    }

    function toggleSidebar() {
        document.body.classList.toggle('sidebar-open');
    }

    // Opcional: Fechar o menu ao clicar em um item no Mobile
    document.querySelectorAll('.sidebar button').forEach(button => {
        if (button.id === 'btnDarkMode') return;
        button.addEventListener('click', () => {
            document.body.classList.remove('sidebar-open');
        });
    });
