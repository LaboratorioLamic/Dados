// === SETORES (RH) E ÁREAS ===
// masterLists.setores continua sendo a lista única que filtros, buscas, selects e permissões
// já usam — assim tudo que busca por setor também busca por área, sem mudar esses campos.
// Dentro dela há dois tipos:
//   • Setores: unidades do cadastro do RH (rh_unidades, no Dados LAMIC). Só leitura aqui.
//     Os antigos "01 - Unidade NTO" … "97 - …" são setores: viram o nome do RH quando há par.
//   • Áreas: o resto (Coleta, Hematologia, RH…). Editáveis como antes.
(function () {
    'use strict';

    let rhNomes = null;             // Set com os nomes das unidades do RH (null = ainda não carregou)
    const NUMERADO = /^\s*\d{1,2}\s*[-–]/;

    const sem = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
    // "01 - UNIDADE NTO" -> "NTO"
    const chave = s => sem(s).replace(/^\d+\s*[-–.]\s*/, '').replace(/\bUNIDADE\b/g, '').replace(/[^A-Z0-9]+/g, ' ').trim();

    // Setor = vem do RH (ou é um dos antigos numerados). Área = o resto.
    window.setorEhRH = function (s) {
        if (!s) return false;
        if (rhNomes && rhNomes.has(String(s))) return true;
        return NUMERADO.test(String(s));
    };
    // Setor do usuário logado: unidade da conta vinculada no Dados LAMIC, casada com a lista de setores
    window.meuSetorPadrao = function () {
        try {
            if (typeof currentuser === 'undefined' || !currentuser || typeof window._contaDados !== 'function') return '';
            const c = window._contaDados(currentuser.dadosLogin);
            const un = c && c.unidade ? String(c.unidade).trim() : '';
            if (!un) return '';
            const lista = (typeof masterLists !== 'undefined' && masterLists && masterLists.setores) || [];
            return lista.find(s => s === un) || lista.find(s => sem(s) === sem(un)) || lista.find(s => chave(s) && chave(s) === chave(un)) || '';
        } catch (_) { return ''; }
    };
    window.listaAreas = () => (masterLists.setores || []).filter(s => !window.setorEhRH(s));
    window.listaSetoresRH = () => (masterLists.setores || []).filter(s => window.setorEhRH(s));

    const aviso = msg => (typeof showToast === 'function' ? showToast(msg, 'warning') : alert(msg));
    const MSG_RH = 'Setores vêm do cadastro do RH (Dados LAMIC) e não são editados aqui. Aqui só se editam as Áreas.';

    // ── Sincronização: só admin grava; roda quando RH e dados já chegaram ──
    let sincronizou = false;
    function sincronizar() {
        if (sincronizou || !rhNomes || !rhNomes.size) return;
        if (typeof _dataListenersPrimed === 'undefined' || !_dataListenersPrimed) return;
        if (!currentuser || !userIsAdmin() || !Array.isArray(masterLists.setores)) return;
        sincronizou = true;

        const lista = masterLists.setores;
        const rh = [...rhNomes];
        const trocas = [];
        // 1) antigos numerados (ou nome do RH escrito diferente) → nome oficial do RH, se o par for único
        lista.slice().forEach(s => {
            if (rhNomes.has(s)) return;
            let par = rh.filter(n => sem(n) === sem(s));
            if (par.length !== 1 && NUMERADO.test(s)) par = rh.filter(n => chave(n) === chave(s));
            if (par.length === 1) trocas.push([s, par[0]]);
        });
        trocas.forEach(([de, para]) => {
            const i = lista.indexOf(de);
            if (lista.includes(para)) lista.splice(i, 1); else lista[i] = para;
            [audits, activities, maintenances, documents, window.ocorrencias || [], window.rncItems || []]
                .forEach(col => (col || []).forEach(c => { if (c) c.setor = setorRename(c.setor, de, para); }));
            const troca = arr => Array.isArray(arr) ? [...new Set(arr.map(x => x === de ? para : x))] : arr;
            (users || []).forEach(u => { u.allowedSetores = troca(u.allowedSetores); });
            (typeof userGroups !== 'undefined' ? userGroups : []).forEach(g => { if (g.perms) g.perms.allowedSetores = troca(g.perms.allowedSetores); });
        });
        // 2) unidades do RH que ainda não estão na lista
        const novos = rh.filter(n => !lista.includes(n));
        novos.forEach(n => lista.push(n));

        if (!trocas.length && !novos.length) return;
        console.info('[setores-rh] renomeados:', trocas, 'novos do RH:', novos);
        if (typeof saveAll === 'function') saveAll(false);
        if (trocas.length) {
            if (typeof saveusers === 'function') saveusers().catch(e => console.warn(e));
            if (typeof saveUserGroups === 'function') saveUserGroups().catch(e => console.warn(e));
        }
        if (typeof populateSelects === 'function') try { populateSelects(); } catch (_) {}
    }

    function ouvirRH() {
        if (!window.firebaseOnValue || !window.firebaseRefRaiz || !window.firebaseDatabase) return setTimeout(ouvirRH, 300);
        window.firebaseOnValue(window.firebaseRefRaiz(window.firebaseDatabase, 'rh_unidades'), snap => {
            const v = snap.val() || {};
            rhNomes = new Set(Object.values(v).filter(u => u && u.nome).map(u => String(u.nome).trim()));
            sincronizar();
        }, err => console.warn('[setores-rh] rh_unidades:', err && err.code));
    }
    setInterval(sincronizar, 3000);

    // ── Sub-abas "Áreas | Setores" ──
    let abaAtual = 'areas';
    function barra(id, onTroca) {
        const b = document.createElement('div');
        b.id = id;
        b.style.cssText = 'display:flex;gap:6px;margin:0 0 10px';
        b.innerHTML = ['areas', 'setores'].map(k => `<button type="button" data-aba="${k}" style="flex:1;padding:8px 10px;border-radius:10px;font-weight:700;font-size:13px;cursor:pointer;border:1px solid #cbd5e1">${k === 'areas' ? '<i class="fas fa-layer-group"></i> Áreas' : '<i class="fas fa-building"></i> Setores (RH)'}</button>`).join('');
        b.querySelectorAll('[data-aba]').forEach(x => x.onclick = () => { abaAtual = x.dataset.aba; onTroca(); });
        return b;
    }
    function pintarBarra(b) {
        b.querySelectorAll('[data-aba]').forEach(x => {
            const on = x.dataset.aba === abaAtual;
            x.style.background = on ? '#162036' : '#fff';
            x.style.color = on ? '#fff' : '#334155';
        });
    }

    // Gerenciador de listas (openListManager('setores'))
    function ajustarGerenciador() {
        const body = document.getElementById('listBody');
        const tabela = body && body.closest('table');
        if (!tabela) return;
        let b = document.getElementById('subabasSetoresLista');
        if (!b) { b = barra('subabasSetoresLista', ajustarGerenciador); tabela.parentElement.insertBefore(b, tabela); }
        b.style.display = 'flex';
        pintarBarra(b);
        body.querySelectorAll('tr').forEach(tr => {
            const nome = tr.querySelector('.list-item-cell')?.dataset.name;
            const ehSetor = window.setorEhRH(nome);
            tr.style.display = (abaAtual === 'setores') === ehSetor ? '' : 'none';
            if (ehSetor) {
                const acoes = tr.querySelector('.list-actions');
                if (acoes) acoes.innerHTML = '<span style="font-size:11px;color:#94a3b8" title="Vem do cadastro do RH"><i class="fas fa-lock"></i> RH</span>';
            }
        });
        const inp = document.getElementById('newListItem');
        const linhaAdd = inp && (inp.closest('.list-add-row, .input-group, .list-input-row') || inp.parentElement);
        if (linhaAdd) linhaAdd.style.display = abaAtual === 'setores' ? 'none' : '';
        if (inp) inp.placeholder = abaAtual === 'areas' ? 'Nova área…' : inp.placeholder;
        const t = document.getElementById('listTitle');
        if (t) t.textContent = abaAtual === 'areas' ? 'Gerenciar: ÁREAS' : 'Setores (cadastro do RH)';
    }

    // Seletores de setor (permissão do usuário, filtros de setor, RNC e ocorrências):
    // sub-abas "Setores | Áreas", abrindo em Setores. Esconde por classe própria, então
    // convive com a busca de cada modal (que usa style.display).
    const GRADES = { modalSetoresList: '.setor-chip', setorFilterGrid: '.setor-chip', rncSetorFilterGrid: '.setor-chip', ocSetorModalBody: '.oc-setor-item' };
    const abaDaGrade = {};   // id da grade → 'setores' | 'areas'
    const cssAba = document.createElement('style');
    cssAba.textContent = '.sr-fora-aba{display:none!important}' +
        '.sr-abas{display:flex;gap:6px;padding:10px 16px 4px}' +
        '.sr-abas button{flex:1;padding:8px 10px;border-radius:10px;font:700 13px/1.2 inherit;cursor:pointer;border:1px solid #cbd5e1;background:#fff;color:#334155;display:flex;align-items:center;justify-content:center;gap:6px}' +
        '.sr-abas button.on{background:#162036;color:#fff;border-color:#162036}' +
        '.sr-abas b{font-size:11px;opacity:.75;font-weight:700}';
    (document.head || document.documentElement).appendChild(cssAba);
    const nomeDoChip = ch => ch.dataset.setor || (ch.querySelector('.setor-chip-label, .oc-setor-name')?.textContent || '').trim();

    function ajustarGrade(id) {
        const grade = document.getElementById(id);
        if (!grade) return;
        const chips = [...grade.querySelectorAll(GRADES[id])];
        let b = document.getElementById('sr-abas-' + id);
        if (!b) {
            b = document.createElement('div');
            b.id = 'sr-abas-' + id;
            b.className = 'sr-abas';
            grade.parentElement.insertBefore(b, grade);
        }
        const aba = abaDaGrade[id] || 'setores';
        const nSet = chips.filter(c => window.setorEhRH(nomeDoChip(c))).length;
        b.style.display = chips.length ? 'flex' : 'none';
        b.innerHTML = `<button type="button" data-aba="setores" class="${aba === 'setores' ? 'on' : ''}"><i class="fas fa-building"></i> Setores <b>${nSet}</b></button>` +
            `<button type="button" data-aba="areas" class="${aba === 'areas' ? 'on' : ''}"><i class="fas fa-layer-group"></i> Áreas <b>${chips.length - nSet}</b></button>`;
        b.querySelectorAll('[data-aba]').forEach(x => x.onclick = ev => { ev.stopPropagation(); abaDaGrade[id] = x.dataset.aba; ajustarGrade(id); });
        chips.forEach(c => c.classList.toggle('sr-fora-aba', (aba === 'setores') !== window.setorEhRH(nomeDoChip(c))));
    }

    // Observa as grades: cada nova renderização reaplica as sub-abas
    function vigiarGrades() {
        Object.keys(GRADES).forEach(id => {
            const grade = document.getElementById(id);
            if (!grade || grade._srVigia) return;
            grade._srVigia = new MutationObserver(() => { grade._srVigia.disconnect(); ajustarGrade(id); grade._srVigia.observe(grade, { childList: true }); });
            grade._srVigia.observe(grade, { childList: true });
            ajustarGrade(id);
        });
    }
    setInterval(vigiarGrades, 1500);

    function instalar() {
        const abrir = window.openListManager;
        if (typeof abrir === 'function') {
            window.openListManager = function (key) {
                const r = abrir.apply(this, arguments);
                const b = document.getElementById('subabasSetoresLista');
                if (key === 'setores') { abaAtual = 'areas'; ajustarGerenciador(); }
                else {
                    if (b) b.style.display = 'none';
                    const inp = document.getElementById('newListItem');
                    const linhaAdd = inp && (inp.closest('.list-add-row, .input-group, .list-input-row') || inp.parentElement);
                    if (linhaAdd) linhaAdd.style.display = '';
                }
                return r;
            };
        }
        const editar = window.editListItem;
        if (typeof editar === 'function') window.editListItem = function (key, val) {
            if (key === 'setores' && window.setorEhRH(val)) return aviso(MSG_RH);
            return editar.apply(this, arguments);
        };
        const remover = window.removeFromList;
        if (typeof remover === 'function') window.removeFromList = function (key, val) {
            if (key === 'setores' && window.setorEhRH(val)) return aviso(MSG_RH);
            return remover.apply(this, arguments);
        };
        const adicionar = window.addToList;
        if (typeof adicionar === 'function') window.addToList = function () {
            const v = (document.getElementById('newListItem')?.value || '').trim();
            if (typeof currentListKey !== 'undefined' && currentListKey === 'setores' && v && window.setorEhRH(v)) return aviso(MSG_RH);
            const r = adicionar.apply(this, arguments);
            if (typeof currentListKey !== 'undefined' && currentListKey === 'setores') setTimeout(ajustarGerenciador, 0);
            return r;
        };
    }

    function boot() { instalar(); ouvirRH(); vigiarGrades(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
