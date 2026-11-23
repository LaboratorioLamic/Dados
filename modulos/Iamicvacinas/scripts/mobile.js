/* ══════════════════════════════════════════════════════════════════════════
   IMUNOGEST — CAMADA MOBILE (comportamento)
   Complementa css/mobile.css: aplica body.is-mobile, monta a barra inferior
   de navegação, o painel recolhível de filtros, o kanban de coluna única e a
   folha "Mover para". Nada aqui roda no desktop.
   ══════════════════════════════════════════════════════════════════════════ */

const MOBILE_MQ = window.matchMedia('(max-width: 768px)');

function isMobileView() { return MOBILE_MQ.matches; }

// ─── BARRA INFERIOR DE NAVEGAÇÃO ──────────────────────────────────────────────
const MOBILE_TABS = [
    { tab: 'agenda',    icon: 'fa-calendar-alt', label: 'Agenda' },
    { tab: 'pacientes', icon: 'fa-users',        label: 'Pacientes' },
    { tab: 'vacinas',   icon: 'fa-vial',         label: 'Vacinas' },
    { tab: 'dashboard', icon: 'fa-chart-pie',    label: 'Painel' },
];

function buildMobileNav() {
    if (document.getElementById('mobile-nav')) return;
    const nav = document.createElement('nav');
    nav.id = 'mobile-nav';
    nav.setAttribute('aria-label', 'Navegação principal');
    nav.innerHTML = MOBILE_TABS.map(t => `
        <button type="button" data-mtab="${t.tab}" onclick="mobileGoTab('${t.tab}')" aria-label="${t.label}">
            <i class="fas ${t.icon}"></i><span>${t.label}</span>
        </button>`).join('') + `
        <button type="button" data-mtab="mais" onclick="mobileOpenMenu()" aria-label="Mais opções">
            <i class="fas fa-bars"></i><span>Mais</span>
        </button>`;
    document.body.appendChild(nav);
    syncMobileNavPerms();
    setMobileNavActive();
}

function mobileGoTab(tab) {
    closeSidebar();
    switchTab(tab);
}

function mobileOpenMenu() {
    toggleSidebar();
}

function setMobileNavActive() {
    const nav = document.getElementById('mobile-nav');
    if (!nav) return;
    const active = document.querySelector('.tab-content.active');
    const current = active ? active.id.replace('tab-', '') : '';
    nav.querySelectorAll('button[data-mtab]').forEach(b => {
        b.classList.toggle('active', b.dataset.mtab === current);
    });
}

// Espelha na barra inferior as permissões já aplicadas aos botões da sidebar
function syncMobileNavPerms() {
    const nav = document.getElementById('mobile-nav');
    if (!nav) return;
    MOBILE_TABS.forEach(t => {
        const side = document.getElementById(`btn-${t.tab}`);
        const btn = nav.querySelector(`button[data-mtab="${t.tab}"]`);
        if (side && btn) btn.style.display = side.style.display === 'none' ? 'none' : '';
    });
}

// ─── PAINEL RECOLHÍVEL DE FILTROS ─────────────────────────────────────────────
// Não move nada no DOM (os IDs continuam onde estão): apenas insere um botão
// "Filtros" antes de cada barra marcada com .m-filterbar e alterna a classe.
function buildMobileFilterToggles() {
    document.querySelectorAll('.m-filterbar').forEach((bar, i) => {
        if (bar.previousElementSibling && bar.previousElementSibling.classList.contains('m-filters-btn')) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'm-filters-btn mobile-only';
        btn.innerHTML = '<i class="fas fa-sliders-h"></i><span>Filtros</span>';
        btn.onclick = () => {
            const open = bar.classList.toggle('m-filters-open');
            btn.classList.toggle('active', open);
        };
        bar.parentNode.insertBefore(btn, bar);
        if (!bar.id) bar.id = `m-filterbar-${i}`;
    });
}

// ─── SUB-NAVEGAÇÃO → BARRA DE ÍCONES ──────────────────────────────────────────
// As sub-abas (.m-chips) viram botões ícone+rótulo curto, iguais aos da barra
// inferior. O texto original do botão é envolvido num <span> para poder ser
// substituído pelo rótulo curto sem perder o ícone nem o onclick.
const MOBILE_CHIP_LABELS = {
    'btn-agendaview-kanban': 'CRM',
    'btn-agendaview-agenda': 'Agenda',
    'btn-agendaview-planilha': 'Planilha',
    'btn-agendaview-oportunidades': 'Oport.',
    'btn-opp-sub-aprazamento': 'Apraz.',
    'btn-opp-sub-oferta': 'Oferta',
};

function buildMobileChipBars() {
    document.querySelectorAll('.m-chips > button').forEach(btn => {
        if (btn.querySelector('.m-chip-lbl')) return;
        const short = MOBILE_CHIP_LABELS[btn.id];
        const label = document.createElement('span');
        label.className = 'm-chip-lbl';
        label.textContent = short || btn.textContent.trim();
        // Remove só os nós de texto soltos; o <i> do ícone permanece
        Array.from(btn.childNodes).forEach(n => { if (n.nodeType === 3) n.remove(); });
        btn.appendChild(label);
    });
}

// ─── TABELAS → CARTÕES ────────────────────────────────────────────────────────
// Copia o texto de cada <th> para o data-label do <td> correspondente; o CSS
// usa esse atributo como rótulo do cartão. Evita duplicar rótulos em todos os
// renderizadores (planilha, almoxarifado, usuários…).
function mobileLabelTables(root) {
    (root || document).querySelectorAll('.tbl-cards table').forEach(table => {
        const heads = Array.from(table.querySelectorAll('thead th'))
            .map(th => th.textContent.trim().replace(/\s+/g, ' '));
        if (!heads.length) return;
        table.querySelectorAll('tbody > tr').forEach(tr => {
            Array.from(tr.children).forEach((td, i) => {
                if (td.hasAttribute('colspan') || td.hasAttribute('data-label')) return;
                if (heads[i]) td.setAttribute('data-label', heads[i]);
            });
        });
    });
}

function _watchTables() {
    document.querySelectorAll('.tbl-cards tbody').forEach(tbody => {
        if (tbody.dataset.mObserved === '1') return;
        tbody.dataset.mObserved = '1';
        new MutationObserver(() => mobileLabelTables(tbody.closest('.tbl-cards')))
            .observe(tbody, { childList: true });
    });
    mobileLabelTables();
}

// ─── KANBAN: CARROSSEL (uma coluna por tela, arrastando para os lados) ────────
let _mKanbanCol = 'Nova oportunidade';

function _mKanbanCols() {
    const board = document.getElementById('kanban-board');
    return board ? Array.from(board.querySelectorAll('.kanban-col')) : [];
}

function _mKanbanApply() {
    const board = document.getElementById('kanban-board');
    if (!board) return;
    const cols = _mKanbanCols();
    if (!cols.length) return;
    if (!cols.some(c => c.dataset.col === _mKanbanCol)) _mKanbanCol = cols[0].dataset.col;

    // Pontos de posição abaixo do quadro
    let dots = document.getElementById('m-kanban-dots');
    if (!dots) {
        dots = document.createElement('div');
        dots.id = 'm-kanban-dots';
        dots.className = 'mobile-only';
        board.parentNode.insertBefore(dots, board.nextSibling);
    }
    dots.innerHTML = cols.map(c => {
        const key = c.dataset.col;
        return `<button type="button" aria-label="${key}" title="${key}"
            onclick="mobileKanbanShowCol('${key.replace(/'/g, "\\'")}')"></button>`;
    }).join('');

    // O quadro é recriado a cada render: devolve a coluna que estava visível
    const idx = cols.findIndex(c => c.dataset.col === _mKanbanCol);
    if (idx > -1) board.scrollLeft = cols[idx].offsetLeft - board.offsetLeft;
    _mKanbanSyncDots();

    // Acompanha o arrasto para atualizar a coluna corrente
    if (board.dataset.mSwipe !== '1') {
        board.dataset.mSwipe = '1';
        let t = null;
        board.addEventListener('scroll', () => {
            clearTimeout(t);
            t = setTimeout(() => {
                const list = _mKanbanCols();
                if (!list.length) return;
                const center = board.scrollLeft + board.clientWidth / 2;
                const cur = list.reduce((best, c) => {
                    const mid = c.offsetLeft - board.offsetLeft + c.offsetWidth / 2;
                    return Math.abs(mid - center) < Math.abs(best.mid - center) ? { col: c, mid } : best;
                }, { col: list[0], mid: Infinity }).col;
                _mKanbanCol = cur.dataset.col;
                _mKanbanSyncDots();
            }, 80);
        }, { passive: true });
    }

    // Botão "Mover" em cada card de grupo (o arrastar entre colunas não existe no toque)
    board.querySelectorAll('.kanban-group-card').forEach(card => {
        const slot = card.querySelector('.kb-mob-move');
        if (!slot || slot.dataset.ready === '1') return;
        const patId = card.dataset.pat;
        const status = card.dataset.status;
        slot.innerHTML = `<button type="button" class="m-move-btn"
            onclick="event.stopPropagation();mobileMoveGroup('${patId}','${String(status).replace(/'/g, "\\'")}')"
            title="Mover para outra etapa"><i class="fas fa-arrow-right-arrow-left"></i>Mover</button>`;
        slot.dataset.ready = '1';
    });

    _mDisableHtml5Drag();
    _mBindSwipes();
}

function _mKanbanSyncDots() {
    const dots = document.getElementById('m-kanban-dots');
    if (!dots) return;
    const cols = _mKanbanCols();
    Array.from(dots.children).forEach((b, i) => {
        b.classList.toggle('active', cols[i] && cols[i].dataset.col === _mKanbanCol);
    });
}

function mobileKanbanShowCol(key) {
    const board = document.getElementById('kanban-board');
    const col = _mKanbanCols().find(c => c.dataset.col === key);
    if (!board || !col) return;
    _mKanbanCol = key;
    board.scrollTo({ left: col.offsetLeft - board.offsetLeft, behavior: 'smooth' });
    _mKanbanSyncDots();
}

// ─── SWIPE HORIZONTAL GENÉRICO ────────────────────────────────────────────────
// Reconhece o arrasto lateral por toque e chama onSwipe(-1 | +1). Só dispara
// quando o gesto é claramente horizontal (|dx| > |dy|), para não roubar a
// rolagem vertical da página.
const M_SWIPE_MIN_PX = 45;   // curto o bastante para um polegar, longo o bastante para não disparar sem querer

// onSwipe(dir)  — gesto concluído: troca de item
// onMove(dx)    — a cada quadro do arrasto horizontal, para acompanhar o dedo
// onCancel()    — gesto abandonado (curto demais, ou virou rolagem vertical)
function attachHorizontalSwipe(el, onSwipe, onMove, onCancel) {
    if (!el || el.dataset.mHswipe === '1') return;
    el.dataset.mHswipe = '1';
    let x0 = 0, y0 = 0, tracking = false, decided = false, horizontal = false, raf = 0;

    const encerrar = () => {
        tracking = false;
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
    };

    el.addEventListener('touchstart', e => {
        if (e.touches.length !== 1) { encerrar(); return; }
        x0 = e.touches[0].clientX;
        y0 = e.touches[0].clientY;
        tracking = true; decided = false; horizontal = false;
    }, { passive: true });

    el.addEventListener('touchmove', e => {
        if (!tracking || e.touches.length !== 1) return;
        const dx = e.touches[0].clientX - x0;
        const dy = e.touches[0].clientY - y0;
        // A direção é decidida uma única vez, no início do movimento
        if (!decided && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
            decided = true;
            horizontal = Math.abs(dx) > Math.abs(dy);
        }
        // Gesto vertical: solta o controle e deixa a página rolar
        if (decided && !horizontal) {
            encerrar();
            if (onCancel) onCancel();
            return;
        }
        // Um quadro por frame: o dedo dispara touchmove bem mais rápido que o repaint
        if (decided && horizontal && onMove && !raf) {
            raf = requestAnimationFrame(() => { raf = 0; onMove(dx); });
        }
    }, { passive: true });

    const finalizar = e => {
        if (!tracking || !horizontal) { encerrar(); return; }
        encerrar();
        const t = e.changedTouches && e.changedTouches[0];
        const dx = t ? t.clientX - x0 : 0;
        if (Math.abs(dx) < M_SWIPE_MIN_PX) { if (onCancel) onCancel(); return; }
        onSwipe(dx < 0 ? 1 : -1);   // arrastar para a esquerda avança
    };

    el.addEventListener('touchend', finalizar, { passive: true });
    el.addEventListener('touchcancel', () => { encerrar(); if (onCancel) onCancel(); }, { passive: true });
}

// ─── KANBAN: swipe entre colunas ──────────────────────────────────────────────
function mobileKanbanStep(dir) {
    const board = document.getElementById('kanban-board');
    const cols = _mKanbanCols();
    if (!board || !cols.length) return;
    // A coluna de partida vem da posição real do scroll, não de _mKanbanCol:
    // o scroll nativo por snap já pode ter andado antes do touchend, e a
    // variável só é atualizada 80ms depois.
    const inicio = board.scrollLeft;
    let i = cols.reduce((best, c, idx) => {
        const d = Math.abs((c.offsetLeft - board.offsetLeft) - inicio);
        return d < best.d ? { d, idx } : best;
    }, { d: Infinity, idx: 0 }).idx;
    // Desfaz o esticão de borda, se o gesto terminou numa ponta
    mobileKanbanDragCancel();
    const next = cols[Math.min(cols.length - 1, Math.max(0, i + dir))];
    if (next) mobileKanbanShowCol(next.dataset.col);
}

// Duração das transições de troca de item (kanban e semanal)
const M_WK_SLIDE_MS = 190;

// No modo leve (body.lite-mode) e com "reduzir movimento" ligado no aparelho a
// troca é instantânea: as transições do CSS já estão desligadas lá.
function _mSemAnimacao() {
    return document.body.classList.contains('lite-mode')
        || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Nas pontas o scroll nativo não tem para onde ir e o gesto parece travado:
// o quadro inteiro cede um pouco, indicando que aquela é a última coluna.
function mobileKanbanDrag(dx) {
    if (_mSemAnimacao()) return;
    const board = document.getElementById('kanban-board');
    if (!board) return;
    const fim = board.scrollWidth - board.clientWidth;
    const naPonta = (dx < 0 && board.scrollLeft >= fim - 1) || (dx > 0 && board.scrollLeft <= 1);
    if (!naPonta) {
        // Saiu da ponta no meio do gesto: tira o deslocamento na hora, sem
        // transição — animar a cada frame do arrasto engasgaria o movimento.
        if (board.style.transform) { board.style.transition = 'none'; board.style.transform = ''; }
        return;
    }
    board.style.transition = 'none';
    board.style.transform = `translateX(${dx * 0.2}px)`;
}

function mobileKanbanDragCancel() {
    const board = document.getElementById('kanban-board');
    if (!board || !board.style.transform) return;
    board.style.transition = `transform ${M_WK_SLIDE_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`;
    board.style.transform = '';
    setTimeout(() => { if (board.isConnected) board.style.transition = ''; }, M_WK_SLIDE_MS);
}

// ─── AGENDA SEMANAL: swipe entre dias ─────────────────────────────────────────
// A semana mostra um dia por vez (_wkMobileDay em scripts/agenda.js). Diferente
// do kanban — que tem os vizinhos no DOM e rola por snap — aqui só existe o dia
// atual, então a transição é feita à mão: o quadro segue o dedo, sai pela borda
// e o dia novo entra pelo lado oposto.
function _mWkPainel() {
    const board = document.getElementById('weekly-board');
    return board ? board.querySelector('.wk-wrap') : null;
}

function _mWeeklyChips() {
    return Array.from(document.querySelectorAll('.m-wk-days .m-wk-day'));
}

// Índice do dia visível e limites: nas pontas o arrasto tem resistência, para
// o usuário sentir que não há para onde ir.
function _mWeeklyPos() {
    const chips = _mWeeklyChips();
    let i = chips.findIndex(c => c.classList.contains('active'));
    if (i < 0) i = 0;
    return { chips, i };
}

function mobileWeeklyDrag(dx) {
    if (_mSemAnimacao()) return;
    const painel = _mWkPainel();
    if (!painel) return;
    const { chips, i } = _mWeeklyPos();
    if (!chips.length) return;
    // Sem vizinho naquele lado: o arrasto vira um esticão curto (efeito de borda)
    const naPonta = (dx < 0 && i >= chips.length - 1) || (dx > 0 && i <= 0);
    const desloc = naPonta ? dx * 0.25 : dx;
    painel.style.transition = 'none';
    painel.style.transform = `translateX(${desloc}px)`;
    painel.style.willChange = 'transform';
}

function mobileWeeklyDragCancel() {
    const painel = _mWkPainel();
    if (!painel) return;
    painel.style.transition = `transform ${M_WK_SLIDE_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`;
    painel.style.transform = 'translateX(0)';
    setTimeout(() => {
        if (!painel.isConnected) return;
        painel.style.transition = '';
        painel.style.willChange = '';
    }, M_WK_SLIDE_MS);
}

function mobileWeeklyStep(dir) {
    if (typeof setWeeklyMobileDay !== 'function') return;
    const { chips, i } = _mWeeklyPos();
    if (!chips.length) return;
    const alvo = Math.min(chips.length - 1, Math.max(0, i + dir));
    // Já está na ponta: só devolve o quadro ao lugar
    if (alvo === i) { mobileWeeklyDragCancel(); return; }

    const painel = _mWkPainel();
    const largura = painel ? painel.offsetWidth : 0;

    const trocar = () => {
        setWeeklyMobileDay(alvo);
        // renderWeekly() reconstrói o quadro: o novo painel entra pelo lado oposto
        const novo = _mSemAnimacao() ? null : _mWkPainel();
        if (novo) {
            novo.style.transition = 'none';
            novo.style.transform = `translateX(${dir > 0 ? largura : -largura}px)`;
            // Dois frames: o primeiro aplica a posição inicial, o segundo anima
            requestAnimationFrame(() => requestAnimationFrame(() => {
                if (!novo.isConnected) return;
                novo.style.transition = `transform ${M_WK_SLIDE_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`;
                novo.style.transform = 'translateX(0)';
                setTimeout(() => {
                    if (!novo.isConnected) return;
                    novo.style.transition = '';
                    novo.style.transform = '';
                    novo.style.willChange = '';
                }, M_WK_SLIDE_MS);
            }));
        }
        // Mantém o dia escolhido visível na faixa de chips
        _mWeeklyChips()[alvo]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    };

    if (!painel || !largura || _mSemAnimacao()) { trocar(); return; }
    // Primeiro o dia atual termina de sair pela borda, aí o novo entra
    painel.style.transition = `transform ${M_WK_SLIDE_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`;
    painel.style.transform = `translateX(${dir > 0 ? -largura : largura}px)`;
    setTimeout(trocar, M_WK_SLIDE_MS);
}

// Os dois quadros são recriados a cada render: o gancho roda de novo e o
// dataset.mHswipe evita listeners duplicados.
function _mBindSwipes() {
    if (!isMobileView()) return;
    // Kanban: as colunas vizinhas já estão no DOM e o scroll nativo com
    // scroll-snap dá a animação de passagem — basta o passo no fim do gesto.
    attachHorizontalSwipe(
        document.getElementById('kanban-board'),
        mobileKanbanStep,
        mobileKanbanDrag,
        mobileKanbanDragCancel
    );
    attachHorizontalSwipe(
        document.getElementById('weekly-board'),
        mobileWeeklyStep,
        mobileWeeklyDrag,
        mobileWeeklyDragCancel
    );
}

// O arrasto HTML5 (draggable) engole o toque e impede o swipe; no celular o
// movimento entre etapas é feito pelo botão "Mover".
function _mDisableHtml5Drag() {
    if (!isMobileView()) return;
    document.querySelectorAll('#kanban-board [draggable="true"], #weekly-board [draggable="true"]')
        .forEach(el => { el.setAttribute('draggable', 'false'); });
}

// ─── FOLHA "MOVER PARA" ───────────────────────────────────────────────────────
const MOBILE_STATUSES = [
    { key: 'Nova oportunidade', icon: 'fa-star',            color: '#64748b' },
    { key: 'Em negociação',     icon: 'fa-comments',        color: '#0891b2' },
    { key: 'Agendado',          icon: 'fa-calendar-check',  color: '#2563eb' },
    { key: 'Aplicado',          icon: 'fa-syringe',         color: '#16a34a' },
    { key: 'Perdido',           icon: 'fa-ban',             color: '#dc2626' },
];

function mobileMoveGroup(patId, fromStatus) {
    const pat = typeof getPatientById === 'function' ? getPatientById(patId) : null;
    _mobileOpenSheet(
        pat ? pat.nome : 'Mover agendamentos',
        MOBILE_STATUSES.filter(s => s.key !== fromStatus).map(s => ({
            label: s.key,
            icon: s.icon,
            color: s.color,
            run: () => _handleGroupDrop(patId, fromStatus, s.key),
        }))
    );
}

function _mobileOpenSheet(title, options) {
    let sheet = document.getElementById('m-action-sheet');
    if (!sheet) {
        sheet = document.createElement('div');
        sheet.id = 'm-action-sheet';
        sheet.className = 'fixed inset-0 z-[600] hidden';
        sheet.innerHTML = `
            <div class="absolute inset-0 bg-navy-900/60 backdrop-blur-sm" onclick="mobileCloseSheet()"></div>
            <div class="absolute left-0 right-0 bottom-0 bg-white rounded-t-2xl overflow-hidden shadow-2xl"
                 style="padding-bottom:calc(0.75rem + env(safe-area-inset-bottom,0px));max-height:80dvh;overflow-y:auto;">
                <div class="px-4 pt-4 pb-2 flex items-center justify-between gap-3 border-b border-slate-100">
                    <p id="m-sheet-title" class="font-black text-navy-900 text-sm truncate"></p>
                    <button type="button" onclick="mobileCloseSheet()" class="h-8 w-8 rounded-lg text-slate-400"><i class="fas fa-times"></i></button>
                </div>
                <div id="m-sheet-body" class="p-3 space-y-1.5"></div>
            </div>`;
        document.body.appendChild(sheet);
    }
    sheet.querySelector('#m-sheet-title').textContent = title || '';
    const body = sheet.querySelector('#m-sheet-body');
    body.innerHTML = '';
    options.forEach((opt, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'w-full flex items-center gap-3 px-3 py-3 rounded-xl bg-slate-50 text-left font-black text-xs uppercase tracking-wide text-slate-700';
        b.innerHTML = `<span class="h-8 w-8 rounded-lg flex items-center justify-center text-white shrink-0"
            style="background:${opt.color || '#2563eb'}"><i class="fas ${opt.icon || 'fa-chevron-right'} text-xs"></i></span>${opt.label}`;
        b.onclick = () => { mobileCloseSheet(); opt.run(); };
        body.appendChild(b);
        b.dataset.idx = i;
    });
    sheet.classList.remove('hidden');
}

function mobileCloseSheet() {
    const sheet = document.getElementById('m-action-sheet');
    if (sheet) sheet.classList.add('hidden');
}

// ─── APLICAÇÃO / SINCRONIZAÇÃO DO MODO ────────────────────────────────────────
function _applyMobileMode() {
    const on = isMobileView();
    document.body.classList.toggle('is-mobile', on);
    if (on) {
        buildMobileNav();
        buildMobileChipBars();
        buildMobileFilterToggles();
        setMobileNavActive();
        _watchTables();
        _mKanbanApply();
        _mBindSwipes();
    } else {
        // Volta ao layout desktop sem resíduos
        document.querySelectorAll('.m-filterbar.m-filters-open').forEach(b => b.classList.remove('m-filters-open'));
        document.querySelectorAll('.m-filters-btn.active').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.kanban-col.m-col-active').forEach(c => c.classList.remove('m-col-active'));
        mobileCloseSheet();
    }
}

// Ao trocar de faixa (girar o aparelho, redimensionar), re-renderiza a aba ativa
// para que os renderizadores dependentes de isMobileView() refaçam o HTML.
MOBILE_MQ.addEventListener('change', () => {
    _applyMobileMode();
    const active = document.querySelector('.tab-content.active');
    if (active && typeof switchTab === 'function' && typeof _appReady !== 'undefined' && _appReady) {
        switchTab(active.id.replace('tab-', ''));
    }
});

// ─── GANCHOS NAS FUNÇÕES EXISTENTES ───────────────────────────────────────────
// switchTab / applyPermissions / renderKanban continuam sendo as fontes da
// verdade; aqui só reagimos a elas.
(function hookExisting() {
    const _switchTab = window.switchTab;
    window.switchTab = function (...args) {
        const r = _switchTab.apply(this, args);
        setMobileNavActive();
        if (isMobileView()) buildMobileFilterToggles();
        return r;
    };

    const _applyPermissions = window.applyPermissions;
    if (typeof _applyPermissions === 'function') {
        window.applyPermissions = function (...args) {
            const r = _applyPermissions.apply(this, args);
            syncMobileNavPerms();
            return r;
        };
    }

    const _renderKanban = window.renderKanban;
    if (typeof _renderKanban === 'function') {
        window.renderKanban = function (...args) {
            const r = _renderKanban.apply(this, args);
            if (isMobileView()) _mKanbanApply();
            return r;
        };
    }

    // O quadro semanal é reescrito por inteiro a cada render (inclusive ao
    // trocar de dia): religa o swipe e desarma o draggable dos cards.
    const _renderWeekly = window.renderWeekly;
    if (typeof _renderWeekly === 'function') {
        window.renderWeekly = function (...args) {
            const r = _renderWeekly.apply(this, args);
            if (isMobileView()) { _mDisableHtml5Drag(); _mBindSwipes(); }
            return r;
        };
    }
})();

document.addEventListener('DOMContentLoaded', _applyMobileMode);
_applyMobileMode();
