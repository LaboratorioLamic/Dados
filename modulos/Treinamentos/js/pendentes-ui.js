// Treinamentos pendentes do aluno: sino no cabeçalho (com contador) e botão
// "Pendentes" à direita do Tema. Os dois abrem a mesma lista. O cálculo vive em
// ../../js/unilamic-pendentes.js, compartilhado com a bolinha do menu do Dados LAMIC.
(function () {
    const U = window.UniAdmin;
    const P = window.UniPendentes;
    if (!U || !P) return;

    // Sino (portal.html e index.html) e botão "Pendentes" (só portal.html).
    const sino = document.getElementById('pend-sino');
    const btn = document.getElementById('pend-btn');
    const botoes = [sino, btn].filter(Boolean);
    if (!botoes.length) return;

    const PRAZO = {
        late: { txt: 'Em atraso', cls: 'late', ic: 'fa-triangle-exclamation' },
        on_time: { txt: 'No prazo', cls: 'ok', ic: 'fa-clock' },
        closed: { txt: 'Encerrado', cls: 'closed', ic: 'fa-lock' },
        livre: { txt: 'Sem prazo', cls: 'free', ic: 'fa-infinity' }
    };
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const dataBR = (ts) => new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

    let lista = [];
    let off = null;
    let chave = '';
    let painel = null;
    let carregou = false; // primeira lista já calculada
    let ancora = null;

    function atualizarContadores() {
        const n = P.contaAlerta(lista);
        botoes.forEach((b) => {
            const bd = b.querySelector('.pend-badge');
            bd.textContent = n > 99 ? '99+' : String(n);
            bd.hidden = n === 0;
            b.classList.toggle('tem-pend', n > 0);
        });
        if (sino) sino.title = n ? `${n} treinamento${n === 1 ? '' : 's'} pendente${n === 1 ? '' : 's'}` : 'Nenhum treinamento pendente';
        if (painel) desenhar();
        if (U.PendingGallery?.isActive()) U.PendingGallery.show(lista);
        else if (querFiltro) filtrar();
    }

    function item(c) {
        const pz = PRAZO[c.prazo] || PRAZO.livre;
        const fim = c.fim && c.prazo !== 'livre' ? ` · até ${dataBR(c.fim)}` : '';
        const prog = c.total ? `${c.done}/${c.total} módulos` : 'Só avaliação';
        return `<a class="pend-item${c.prazo === 'closed' ? ' is-closed' : ''}" href="${esc(c.url)}">
            <span class="pend-item-ic ${pz.cls}"><i class="fas ${pz.ic}"></i></span>
            <span class="pend-item-txt">
                <strong>${esc(c.nome)}</strong>
                <small>${esc(c.catNome)} › ${esc(c.temaNome)}</small>
                <span class="pend-item-meta"><span class="pend-tag ${pz.cls}">${pz.txt}${esc(fim)}</span><span>${prog}${c.temQuiz ? ' · avaliação pendente' : ''}</span></span>
                ${c.total ? `<span class="pend-bar"><i style="width:${c.pct}%"></i></span>` : ''}
            </span>
            <i class="fas fa-chevron-right pend-item-go"></i>
        </a>`;
    }

    function desenhar() {
        const n = P.contaAlerta(lista);
        const abertos = lista.filter((c) => c.prazo !== 'closed');
        const encerrados = lista.filter((c) => c.prazo === 'closed');
        painel.innerHTML = `
            <div class="pend-head">
                <span><i class="fas fa-list-check"></i> Treinamentos pendentes</span>
                <em>${n}</em>
                <button type="button" class="pend-x" aria-label="Fechar"><i class="fas fa-xmark"></i></button>
            </div>
            <div class="pend-lista">${n ? abertos.map(item).join('') : `
                <div class="pend-vazio"><i class="fas fa-circle-check"></i><p>Tudo em dia! Nenhum treinamento pendente.</p></div>`}${encerrados.length ? `
                <div class="pend-sep"><i class="fas fa-lock"></i> Prazo encerrado: procure o gestor</div>${encerrados.map(item).join('')}` : ''}</div>`;
        painel.querySelector('.pend-x').onclick = fechar;
        posicionar();
    }

    function posicionar() {
        if (!painel || !ancora) return;
        const r = ancora.getBoundingClientRect();
        const w = Math.min(400, innerWidth - 16);
        const left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8));
        painel.style.width = `${w}px`;
        painel.style.left = `${left}px`;
        painel.style.top = `${r.bottom + 8}px`;
        painel.style.maxHeight = `${Math.max(220, innerHeight - r.bottom - 24)}px`;
    }

    function abrir(de) {
        if (painel && ancora === de) return fechar();
        fechar();
        ancora = de;
        painel = document.createElement('div');
        painel.className = 'pend-painel';
        painel.setAttribute('role', 'dialog');
        painel.setAttribute('aria-label', 'Treinamentos pendentes');
        document.body.appendChild(painel);
        de.setAttribute('aria-expanded', 'true');
        desenhar();
    }

    function fechar() {
        if (!painel) return;
        painel.remove();
        painel = null;
        ancora?.setAttribute('aria-expanded', 'false');
        ancora = null;
    }

    // Sino: lista de notificações. Botão "Pendentes": filtra a galeria (main.js: PendingGallery).
    if (sino) sino.onclick = (e) => { e.stopPropagation(); abrir(sino); };
    // ?pend=1 (vindo do aviso de outra plataforma) liga o filtro assim que cursos e lista estiverem prontos.
    let querFiltro = !!btn && new URLSearchParams(location.search).get('pend') === '1';
    function marcarBtn(on) {
        if (!btn) return;
        btn.classList.toggle('ativo', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    function filtrar() {
        const G = U.PendingGallery;
        if (!G || !G.ready() || !carregou) { querFiltro = true; return; }
        querFiltro = false;
        fechar();
        G.show(lista);
        marcarBtn(true);
    }
    function desfiltrar() {
        U.PendingGallery?.hide();
        marcarBtn(false);
    }
    if (btn) btn.onclick = (e) => {
        e.stopPropagation();
        if (U.PendingGallery?.isActive()) desfiltrar(); else filtrar();
    };
    // Outra ação saiu do filtro (escolheu tema, abriu curso): o botão volta ao normal.
    setInterval(() => { if (btn?.classList.contains('ativo') && !U.PendingGallery?.isActive()) marcarBtn(false); }, 400);
    document.addEventListener('uniadmin:cursos-prontos', () => { if (querFiltro) filtrar(); });
    document.addEventListener('click', (e) => { if (painel && !painel.contains(e.target)) fechar(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fechar(); });
    addEventListener('resize', posicionar);
    addEventListener('scroll', posicionar, true);

    function ligar() {
        const s = U.StudentAuth?.getSession?.();
        const nova = s?.userId ? `${s.userId}|${s.role || ''}|${s.fullName || ''}` : '';
        if (nova === chave) return;
        chave = nova;
        off?.(); off = null;
        lista = [];
        botoes.forEach((b) => { b.hidden = !nova; });
        atualizarContadores();
        if (!nova) { fechar(); return; }
        off = P.observar(U.db, { userId: s.userId, login: s.login, role: s.role, fullName: s.fullName }, (l) => { lista = l; carregou = true; atualizarContadores(); });
    }

    document.addEventListener('uniadmin:session-updated', ligar);
    U.StudentAuth?.ready?.then(ligar);
})();
