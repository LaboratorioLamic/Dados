// Busca digitável nos cards do painel: Cursos (cfg-courses-grid) e Dashboard > Por curso
// (cfg-dash-course-cards). Filtra os cards já desenhados pelo texto visível (nome, tema,
// descrição), sem acento e sem diferenciar maiúsculas. A grade é redesenhada por outros
// filtros (tema, status, categoria): um MutationObserver reaplica a busca a cada redesenho.
(function () {
    const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

    function ligar(inputId, gridId, cardSel) {
        const input = document.getElementById(inputId);
        const grid = document.getElementById(gridId);
        if (!input || !grid) return;
        const wrap = input.closest('.admin-busca');
        const limpar = wrap?.querySelector('.admin-busca-x');
        let vazio = null;

        function aplicar() {
            const termos = norm(input.value).split(' ').filter(Boolean);
            const cards = grid.querySelectorAll(cardSel);
            let visiveis = 0;
            cards.forEach((c) => {
                const txt = c.dataset.buscaTxt || (c.dataset.buscaTxt = norm(c.textContent));
                const ok = termos.every((t) => txt.includes(t));
                c.classList.toggle('busca-oculto', !ok);
                if (ok) visiveis++;
            });
            if (limpar) limpar.hidden = !input.value;
            const mostrarVazio = termos.length > 0 && cards.length > 0 && visiveis === 0;
            if (mostrarVazio && !vazio?.isConnected) {
                vazio = document.createElement('p');
                vazio.className = 'admin-busca-vazio';
                obs.disconnect();
                grid.appendChild(vazio);
                obs.observe(grid, { childList: true });
            }
            if (vazio) {
                vazio.hidden = !mostrarVazio;
                vazio.textContent = `Nenhum curso encontrado para "${input.value.trim()}".`;
            }
        }

        // Só redesenhos de verdade (cards novos) reaplicam; o próprio aviso de vazio é ignorado.
        const obs = new MutationObserver((muts) => {
            if (muts.some((m) => [...m.addedNodes].some((n) => n !== vazio))) aplicar();
        });
        obs.observe(grid, { childList: true });
        input.addEventListener('input', aplicar);
        input.addEventListener('keydown', (e) => { if (e.key === 'Escape' && input.value) { input.value = ''; aplicar(); } });
        limpar?.addEventListener('click', () => { input.value = ''; aplicar(); input.focus(); });
    }

    function iniciar() {
        ligar('cfg-courses-search', 'cfg-courses-grid', '.admin-course-card');
        ligar('cfg-dash-course-search', 'cfg-dash-course-cards', '.dash-course-card');
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
})();
