// ============================================================
// CBO — Classificação Brasileira de Ocupações (CBO 2002)
// ============================================================
// A tabela vem embarcada em js/cbo-data.js (CBO_RAW), gerada do CSV oficial do
// MTE (cbo2002-ocupacao.csv). Não existe API pública oficial da CBO: o
// cbo.mte.gov.br só serve HTML (JSF) e os webservices de terceiros (UNA-SUS
// etc.) não liberam CORS nem garantem no-ar. Buscar local mantém o cadastro
// funcionando offline e sem latência.
// Para atualizar: baixe o CSV em
// https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/cbo/servicos/downloads
// e regrave cbo-data.js como "codigo|titulo" por linha, ordenado por código.
// O campo continua livre: quem não achar a ocupação digita o texto na mão —
// necessário enquanto o CSV do MTE ficar atrás das portarias mais recentes.

let _cboLista = null;

// Parse preguiçoso: só monta o array na primeira busca (2.6k linhas).
function cboLista() {
    if (_cboLista) return _cboLista;
    _cboLista = (typeof CBO_RAW === 'string' ? CBO_RAW : '').split('\n').map(l => {
        const i = l.indexOf('|');
        const codigo = l.slice(0, i);
        const titulo = l.slice(i + 1);
        return { codigo, titulo, busca: cboNorm(`${codigo} ${titulo}`) };
    });
    return _cboLista;
}

// Sem acento e minúsculo — o RH digita "medico" e espera achar "Médico".
function cboNorm(s) {
    return (s || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

// 6 dígitos crus no banco; "2124-05" só na tela (é como o MTE publica).
function cboFmtCodigo(cod) {
    const d = (cod || '').toString().replace(/\D/g, '');
    return d.length === 6 ? `${d.slice(0, 4)}-${d.slice(4)}` : d;
}

function cboPorCodigo(cod) {
    const d = (cod || '').toString().replace(/\D/g, '');
    return d.length === 6 ? cboLista().find(o => o.codigo === d) || null : null;
}

function cboPorTitulo(titulo) {
    const t = cboNorm(titulo);
    return t ? cboLista().find(o => cboNorm(o.titulo) === t) || null : null;
}

// Prefixo antes de "contém": quem digita "aux" quer "Auxiliar ...", não
// "Motorista auxiliar". Só o que couber no limite vai para a tela.
function cboBuscar(termo, limite = 30) {
    const t = cboNorm(termo);
    if (!t) return [];
    const termos = t.split(/\s+/);
    const inicio = [], meio = [];
    for (const o of cboLista()) {
        if (!termos.every(x => o.busca.includes(x))) continue;
        (o.busca.startsWith(termos[0]) || cboNorm(o.titulo).startsWith(t) ? inicio : meio).push(o);
        if (inicio.length >= limite) break;
    }
    return inicio.concat(meio).slice(0, limite);
}

// ---- Autocomplete (título ↔ código andam juntos) ----
// inputEl: campo do título (texto livre); codigoEl: campo do código.
// Escolher na lista preenche os dois; digitar um código válido no outro campo
// puxa o título de volta. Nada é obrigatório.
function initCboAutocomplete(inputEl, codigoEl) {
    const wrap = document.createElement('div');
    wrap.className = 'cbo-ac';
    inputEl.parentNode.insertBefore(wrap, inputEl);
    wrap.appendChild(inputEl);
    const menu = document.createElement('div');
    menu.className = 'cbo-ac-menu';
    menu.hidden = true;
    wrap.appendChild(menu);

    let itens = [], ativo = -1;

    const fechar = () => { menu.hidden = true; ativo = -1; };

    const pintar = () => {
        menu.querySelectorAll('.cbo-ac-item').forEach((el, i) => el.classList.toggle('active', i === ativo));
    };

    const escolher = o => {
        inputEl.value = o.titulo;
        codigoEl.value = cboFmtCodigo(o.codigo);
        codigoEl.dataset.cbo = o.codigo;
        fechar();
    };

    const abrir = () => {
        itens = cboBuscar(inputEl.value);
        if (!itens.length) return fechar();
        menu.innerHTML = itens.map((o, i) => `
            <div class="cbo-ac-item" data-i="${i}">
                <span class="cbo-ac-cod">${cboFmtCodigo(o.codigo)}</span>
                <span class="cbo-ac-tit">${escapeHtml(o.titulo)}</span>
            </div>`).join('');
        menu.querySelectorAll('.cbo-ac-item').forEach(el => {
            // mousedown, não click: o blur do input fecharia o menu antes do click.
            el.onmousedown = e => { e.preventDefault(); escolher(itens[Number(el.dataset.i)]); };
        });
        ativo = -1;
        menu.hidden = false;
    };

    inputEl.setAttribute('autocomplete', 'off');
    inputEl.addEventListener('input', () => {
        // Título editado à mão deixa de casar com o código antes escolhido.
        const exato = cboPorTitulo(inputEl.value);
        if (exato) { codigoEl.value = cboFmtCodigo(exato.codigo); codigoEl.dataset.cbo = exato.codigo; }
        abrir();
    });
    inputEl.addEventListener('focus', () => { if (inputEl.value.trim()) abrir(); });
    inputEl.addEventListener('blur', fechar);
    inputEl.addEventListener('keydown', e => {
        if (menu.hidden) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); ativo = Math.min(ativo + 1, itens.length - 1); pintar(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); ativo = Math.max(ativo - 1, 0); pintar(); }
        else if (e.key === 'Enter' && ativo >= 0) { e.preventDefault(); escolher(itens[ativo]); }
        else if (e.key === 'Escape') fechar();
    });

    // Código digitado direto: aceita "2124-05" ou "212405" e completa o título
    // se estiver vazio (não sobrescreve um título que o RH escreveu de propósito).
    codigoEl.addEventListener('input', () => {
        const o = cboPorCodigo(codigoEl.value);
        codigoEl.dataset.cbo = o ? o.codigo : '';
        if (o && !inputEl.value.trim()) inputEl.value = o.titulo;
    });
    codigoEl.addEventListener('blur', () => {
        const o = cboPorCodigo(codigoEl.value);
        if (o) codigoEl.value = cboFmtCodigo(o.codigo);
    });
}

// ---- Cargo + CBO na escolha ----
// Nome de cargo não é chave: a empresa pode ter "Analista" com CBO de sistemas e outro com
// CBO administrativo. Quem escolhe o cargo precisa ver o CBO junto, senão marca o errado e o
// eSocial/RAIS sai com a ocupação trocada. Estes helpers dão a segunda linha da opção.

// "2124-05 · Analista de sistemas" — o que estiver preenchido; '' quando não há CBO.
function cargoCboTexto(c) {
    const cod = cboFmtCodigo(c?.cboCodigo || '');
    const tit = (c?.cbo || '').trim();
    return cod && tit ? `${cod} · ${tit}` : (cod || tit || '');
}

// Segunda linha da opção: sem CBO, avisa — é o caso em que dois homônimos se confundem.
// Aprendiz não tem CBO próprio (o vínculo é de aprendizagem, não de uma ocupação CBO) —
// mostra o perfil em vez de "Sem CBO", que pareceria cadastro incompleto.
function cargoCboSub(c) {
    if (ehAprendiz(c)) return 'Jovem Aprendiz';
    return cargoCboTexto(c) || 'Sem CBO';
}

// Opções prontas para initPickerField/openFilterPopover, em ordem alfabética.
function cargoOpcoes(cargos) {
    return (cargos || []).slice()
        .sort((a, b) => (a.nome || '').localeCompare(b.nome || '') || cargoCboTexto(a).localeCompare(cargoCboTexto(b)))
        .map(c => ({ value: c.id, label: c.nome || '(sem nome)', sub: cargoCboSub(c) }));
}

// Valor gravado: 6 dígitos crus, ou '' quando o RH digitou algo que não é código.
function cboCodigoValor(codigoEl) {
    const d = (codigoEl.value || '').replace(/\D/g, '');
    return d.length === 6 ? d : '';
}
