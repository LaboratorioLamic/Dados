// Permissões no estilo Dados LAMIC: cartões por área com interruptores do que HABILITAR.
// A tela nova grava nos selects antigos (ocultos), então salvar/herdar de grupo segue igual.
// Listas viram itens próprios (window._permListas: 'todas' | [chaves]).
(function () {
    const ESC = ['De todos', 'Só dos meus'];
    const CARDS = [
        { nome: 'Kanban', icone: 'fa-table-columns', cor: '#3b82f6', itens: [
            { sel: 'cfgCanEdit', rot: 'Editar cards', desc: 'Alterar campos e mover cards', on: ['total', 'parcial'], off: 'nao', esc: ESC },
            { sel: 'cfgCanDelete', rot: 'Excluir cards', desc: 'Apagar cards (vão para o histórico)', on: ['total', 'parcial'], off: 'nao', esc: ESC },
            { sel: 'cfgCanChecklist', rot: 'Preencher checklist', desc: 'Marcar itens do checklist dos cards', on: ['total', 'parcial'], off: 'nao', esc: ESC },
            { sel: 'cfgTaskView', rot: 'Ver tarefas de todos', desc: 'Desligado: só as tarefas em que é responsável', on: ['todos'], off: 'usuario' }
        ] },
        { nome: 'RNC', icone: 'fa-file-circle-exclamation', cor: '#dc2626', itens: [
            { sel: 'cfgRncCanEdit', rot: 'Criar e editar RNC', desc: 'Abrir e alterar relatórios de não conformidade', on: ['total', 'parcial'], off: 'nao', esc: ESC },
            { sel: 'cfgRncTaskView', rot: 'Ver RNC de todos', desc: 'Desligado: só as RNC em que participa', on: ['todos'], off: 'usuario' }
        ] },
        { nome: 'Reuniões', icone: 'fa-handshake', cor: '#6366f1', itens: [
            { sel: 'cfgCanManageReu', rot: 'Criar e editar reuniões', desc: 'Agendar, alterar e registrar atas', on: ['total', 'parcial'], off: 'nao', esc: ['De todas', 'Só das minhas'] }
        ] },
        { nome: 'Publicações', icone: 'fa-newspaper', cor: '#06b6d4', itens: [
            { sel: 'cfgCanManagePubs', rot: 'Gerenciar publicações', desc: 'Editar e remover publicações', on: ['total', 'parcial'], off: 'nao', esc: ESC },
            { sel: 'cfgCanPublish', rot: 'Publicar', desc: 'Criar novas publicações', on: ['total', 'parcial'], off: 'nao', esc: ESC }
        ] },
        { nome: 'Ocorrências', icone: 'fa-triangle-exclamation', cor: '#f59e0b', itens: [
            { sel: 'cfgCanManageOc', rot: 'Registrar e editar ocorrências', desc: 'Desligado: apenas visualiza', on: ['total', 'parcial'], off: 'visualizar', esc: ESC },
            { sel: 'cfgCanViewOc', rot: 'Ver ocorrências de todos', desc: 'Desligado: só as que registrou ou é responsável', on: ['total'], off: 'parcial' },
            { sel: 'cfgCanManageMotivos', rot: 'Gerenciar motivos', desc: 'Cadastrar categorias e motivos de ocorrência', on: ['total', 'motivo'], off: 'nao', esc: ['Categorias e motivos', 'Só motivos'] }
        ] }
    ];
    const LISTAS = [
        ['areas', 'Áreas', 'Setores vêm do RH e não são editáveis'],
        ['status', 'Status e colunas do Kanban', 'Auditoria, Documentos, Atividades, Manutenção'],
        ['categorias', 'Categorias e subcategorias', ''],
        ['tipos', 'Tipos de ocorrência / NC', ''],
        ['marcadores', 'Marcadores', 'Auditoria, Documentos, Atividades'],
        ['rnc', 'Listas da RNC', 'Origens, detalhamentos, status e marcadores']
    ];

    const $ = id => document.getElementById(id);
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    function css() {
        if ($('pu-css')) return;
        const st = document.createElement('style');
        st.id = 'pu-css';
        st.textContent = `
.pu-wrap{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
.pu-card{border:1px solid #e2e8f0;border-radius:14px;background:#fff;overflow:hidden}
.pu-head{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid #f1f5f9;font-weight:700;font-size:13px;color:#162036}
.pu-head i{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;font-size:13px}
.pu-row{display:flex;align-items:flex-start;gap:10px;padding:10px 14px;border-bottom:1px solid #f8fafc}
.pu-row:last-child{border-bottom:0}
.pu-txt{flex:1;min-width:0}
.pu-rot{font-size:13px;font-weight:600;color:#1e293b}
.pu-desc{font-size:11px;color:#94a3b8;margin-top:2px}
.pu-seg{display:inline-flex;margin-top:6px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden}
.pu-seg button{border:0;background:#fff;font-size:11px;padding:4px 10px;cursor:pointer;color:#64748b}
.pu-seg button.on{background:#162036;color:#fff}
.pu-sw{position:relative;width:38px;height:22px;flex:none;margin-top:2px}
.pu-sw input{opacity:0;width:0;height:0;position:absolute}
.pu-sw span{position:absolute;inset:0;border-radius:22px;background:#cbd5e1;transition:.15s;cursor:pointer}
.pu-sw span:after{content:'';position:absolute;left:3px;top:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:.15s}
.pu-sw input:checked+span{background:#10b981}
.pu-sw input:checked+span:after{transform:translateX(16px)}
.pu-lock .pu-sw span,.pu-lock .pu-seg button{cursor:not-allowed;opacity:.6}
.pu-todas{background:#f8fafc}
.pu-card-listas{grid-column:1/-1}
.pu-card-listas .pu-lgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr))}`;
        document.head.appendChild(st);
    }

    function sw(on, dis, data) {
        return `<label class="pu-sw"><input type="checkbox" ${on ? 'checked' : ''} ${dis ? 'disabled' : ''} ${data}><span></span></label>`;
    }

    function render() {
        const grid = document.querySelector('#modalUsuario .um-perm-grid') || document.querySelector('.um-perm-grid');
        if (!grid) return;
        css();
        grid.style.display = 'none';
        let box = $('puBox');
        if (!box) {
            box = document.createElement('div');
            box.id = 'puBox';
            box.className = 'pu-wrap';
            grid.parentElement.insertBefore(box, grid.nextSibling);
            box.addEventListener('change', onChange);
            box.addEventListener('click', onClick);
        }
        const lock = !!($('cfgCanEdit') && $('cfgCanEdit').disabled);
        box.classList.toggle('pu-lock', lock);
        let h = '';
        CARDS.forEach(c => {
            h += `<div class="pu-card"><div class="pu-head"><i class="fas ${c.icone}" style="background:${c.cor}1a;color:${c.cor}"></i>${esc(c.nome)}</div>`;
            c.itens.forEach(it => {
                const el = $(it.sel);
                if (!el) return;
                const v = el.value;
                const on = v !== it.off;
                h += `<div class="pu-row">${sw(on, lock, `data-sel="${it.sel}"`)}<div class="pu-txt"><div class="pu-rot">${esc(it.rot)}</div>` +
                    (it.desc ? `<div class="pu-desc">${esc(it.desc)}</div>` : '');
                if (on && it.esc) h += `<div class="pu-seg">${it.esc.map((l, i) => `<button type="button" class="${v === it.on[i] ? 'on' : ''}" data-sel="${it.sel}" data-v="${it.on[i]}" ${lock ? 'disabled' : ''}>${esc(l)}</button>`).join('')}</div>`;
                h += '</div></div>';
            });
            h += '</div>';
        });
        const lp = window._permListas === 'todas' ? 'todas' : (Array.isArray(window._permListas) ? window._permListas : []);
        h += `<div class="pu-card pu-card-listas"><div class="pu-head"><i class="fas fa-list-check" style="background:#8b5cf61a;color:#8b5cf6"></i>Listas que pode gerenciar</div>` +
            `<div class="pu-row pu-todas">${sw(lp === 'todas', lock, 'data-lista="todas"')}<div class="pu-txt"><div class="pu-rot">Todas as listas</div><div class="pu-desc">Inclui listas futuras e libera todos os setores</div></div></div><div class="pu-lgrid">`;
        LISTAS.forEach(([k, rot, desc]) => {
            const on = lp === 'todas' || lp.includes(k);
            h += `<div class="pu-row">${sw(on, lock || lp === 'todas', `data-lista="${k}"`)}<div class="pu-txt"><div class="pu-rot">${esc(rot)}</div>${desc ? `<div class="pu-desc">${esc(desc)}</div>` : ''}</div></div>`;
        });
        h += '</div></div>';
        box.innerHTML = h;
    }

    function setSel(id, v) {
        const el = $(id);
        if (!el || el.disabled) return;
        el.value = v;
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    function achar(id) { for (const c of CARDS) for (const it of c.itens) if (it.sel === id) return it; }

    function onChange(e) {
        const t = e.target;
        if (t.dataset.sel) {
            const it = achar(t.dataset.sel);
            setSel(it.sel, t.checked ? it.on[0] : it.off);
        } else if (t.dataset.lista) {
            const k = t.dataset.lista;
            let lp = window._permListas === 'todas' ? 'todas' : (Array.isArray(window._permListas) ? window._permListas.slice() : []);
            if (k === 'todas') lp = t.checked ? 'todas' : [];
            else {
                lp = lp === 'todas' ? LISTAS.map(x => x[0]) : lp;
                lp = t.checked ? [...new Set([...lp, k])] : lp.filter(x => x !== k);
            }
            window._permListas = lp;
            sincSetores();
        }
        render();
    }
    function onClick(e) {
        const b = e.target.closest('.pu-seg button');
        if (!b || b.disabled) return;
        setSel(b.dataset.sel, b.dataset.v);
        render();
    }

    // "Todas as listas" = acesso a todos os setores (campo antigo canManageLists)
    function sincSetores() {
        const el = $('cfgCanManageLists');
        if (!el || el.disabled) return;
        const v = window._permListas === 'todas' ? 'true' : 'false';
        if (el.value !== v) setSel('cfgCanManageLists', v);
    }
    window._permUiRender = function () { sincSetores(); render(); };

    function iniciar() {
        const grid = document.querySelector('.um-perm-grid');
        if (!grid) return setTimeout(iniciar, 500);
        render();
        // Trava/destrava de grupo muda o atributo disabled dos selects antigos
        new MutationObserver(() => render()).observe(grid, { subtree: true, attributes: true, attributeFilter: ['disabled'] });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
