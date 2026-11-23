// ===== js/ui/components/formField.js =====
(function () {
'use strict';

/**
 * Campos de formulário.
 *
 * Os formulários renderizam uma vez e são lidos com FormData no submit —
 * nunca re-renderizam durante a digitação (perderia o cursor). Erros são
 * injetados nos slots `[data-erro]`, sem tocar no resto do markup.
 */

var html = NS.core.dom.html;
var raw = NS.core.dom.raw;
/**
 * Só o campo obrigatório recebe marca. Marcar "(opcional)" em quase tudo
 * — que é o caso aqui — vira ruído em vez de informação.
 */
function rotulo(id, label, obrigatorio) {
    return html`
        <label class="campo__label" for="${id}">
            ${label}${raw(obrigatorio ? ' <span class="campo__obrigatorio" aria-hidden="true">*</span>' : '')}
        </label>
    `;
}

function rodape(nome, ajuda) {
    return html`
        ${raw(ajuda ? html`<span class="campo__ajuda">${ajuda}</span>` : '')}
        <span class="campo__aviso" data-aviso="${nome}"></span>
        <span class="campo__erro" data-erro="${nome}"></span>
    `;
}

function campoTexto({
    nome,
    label,
    valor = '',
    tipo = 'text',
    placeholder = '',
    obrigatorio = false,
    ajuda = '',
    inputmode = '',
    maxlength = '',
    autocomplete = 'off',
    atributos = ''
}) {
    const id = `campo-${nome}`;
    return html`
        <div class="campo" data-campo="${nome}">
            ${raw(rotulo(id, label, obrigatorio))}
            <input
                class="campo__controle"
                type="${tipo}"
                id="${id}"
                name="${nome}"
                value="${valor}"
                placeholder="${placeholder}"
                autocomplete="${autocomplete}"
                ${raw(inputmode ? `inputmode="${inputmode}"` : '')}
                ${raw(maxlength ? `maxlength="${maxlength}"` : '')}
                ${raw(obrigatorio ? 'required' : '')}
                ${raw(atributos)}
            >
            ${raw(rodape(nome, ajuda))}
        </div>
    `;
}

/**
 * Campo de senha com botão de revelar.
 *
 * O botão só troca `type` entre password e text; quem liga o clique é
 * `ligarRevelarSenha(raiz)`, para que o mesmo markup sirva a formulários
 * renderizados em tela e dentro de modal.
 */
function campoSenha({
    nome,
    label,
    obrigatorio = true,
    ajuda = '',
    placeholder = '',
    autocomplete = 'current-password'
}) {
    const id = `campo-${nome}`;
    return html`
        <div class="campo" data-campo="${nome}">
            ${raw(rotulo(id, label, obrigatorio))}
            <div class="campo-senha">
                <input class="campo__controle" type="password" id="${id}" name="${nome}"
                       placeholder="${placeholder}" autocomplete="${autocomplete}"
                       ${raw(obrigatorio ? 'required' : '')}>
                <button type="button" class="campo-senha__olho" data-revelar="${nome}"
                        aria-label="Mostrar senha" title="Mostrar senha">
                    ${raw(NS.ui.icons.icone('olho'))}
                </button>
            </div>
            ${raw(rodape(nome, ajuda))}
        </div>
    `;
}

/** Ativa os botões de revelar senha dentro de `raiz`. Devolve o desinscritor. */
function ligarRevelarSenha(raiz) {
    const ouvinte = e => {
        const botao = e.target.closest('[data-revelar]');
        if (!botao || !raiz.contains(botao)) return;

        const campo = raiz.querySelector(`[name="${botao.dataset.revelar}"]`);
        if (!campo) return;

        const revelando = campo.type === 'password';
        campo.type = revelando ? 'text' : 'password';
        botao.innerHTML = NS.ui.icons.icone(revelando ? 'olhoFechado' : 'olho');

        const rotuloBotao = revelando ? 'Ocultar senha' : 'Mostrar senha';
        botao.setAttribute('aria-label', rotuloBotao);
        botao.setAttribute('title', rotuloBotao);
        campo.focus();
    };

    raiz.addEventListener('click', ouvinte);
    return () => raiz.removeEventListener('click', ouvinte);
}

function campoTextarea({
    nome,
    label,
    valor = '',
    placeholder = '',
    linhas = 3,
    obrigatorio = false,
    ajuda = ''
}) {
    const id = `campo-${nome}`;
    return html`
        <div class="campo" data-campo="${nome}">
            ${raw(rotulo(id, label, obrigatorio))}
            <textarea
                class="campo__controle"
                id="${id}"
                name="${nome}"
                rows="${linhas}"
                placeholder="${placeholder}"
                ${raw(obrigatorio ? 'required' : '')}
            >${valor}</textarea>
            ${raw(rodape(nome, ajuda))}
        </div>
    `;
}

function campoSelect({
    nome,
    label,
    valor = '',
    opcoes = [],
    obrigatorio = false,
    ajuda = '',
    vazio = ''
}) {
    const id = `campo-${nome}`;
    const itens = opcoes.map(op => {
        const v = typeof op === 'string' ? op : op.valor;
        const t = typeof op === 'string' ? op : op.texto;
        return html`<option value="${v}"${raw(String(v) === String(valor) ? ' selected' : '')}>${t}</option>`;
    }).join('');

    return html`
        <div class="campo" data-campo="${nome}">
            ${raw(rotulo(id, label, obrigatorio))}
            <select class="campo__controle" id="${id}" name="${nome}" ${raw(obrigatorio ? 'required' : '')}>
                ${raw(vazio ? html`<option value="">${vazio}</option>` : '')}
                ${raw(itens)}
            </select>
            ${raw(rodape(nome, ajuda))}
        </div>
    `;
}

/* ------------------------------------------------------------------ *
 * Manipulação de erros e avisos
 * ------------------------------------------------------------------ */

function mostrarErro(form, nome, mensagem) {
    const slot = form.querySelector(`[data-erro="${nome}"]`);
    if (slot) slot.textContent = mensagem || '';
    form.querySelector(`[data-campo="${nome}"]`)?.classList.toggle('campo--invalido', !!mensagem);
}

function mostrarAviso(form, nome, mensagem) {
    const slot = form.querySelector(`[data-aviso="${nome}"]`);
    if (slot) slot.textContent = mensagem || '';
}

function limparErros(form) {
    form.querySelectorAll('[data-erro]').forEach(el => { el.textContent = ''; });
    form.querySelectorAll('.campo--invalido').forEach(el => el.classList.remove('campo--invalido'));
}

/** Aplica um mapa { campo: mensagem } e foca o primeiro campo com erro. */
function aplicarErros(form, erros) {
    limparErros(form);
    const nomes = Object.keys(erros);
    nomes.forEach(nome => mostrarErro(form, nome, erros[nome]));

    if (nomes.length) {
        const primeiro = form.querySelector(`[name="${nomes[0]}"]`);
        primeiro?.focus();
        primeiro?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
}

/** Lê o formulário como objeto plano, com os valores já aparados. */
/**
 * Lê os campos nomeados de um <form> — ou de qualquer container, para os
 * blocos que vivem dentro de outro formulário e não podem ser <form>.
 */
function lerFormulario(form) {
    const dados = {};

    if (!(form instanceof HTMLFormElement)) {
        form?.querySelectorAll('[name]').forEach(campo => {
            if (campo.type === 'checkbox') dados[campo.name] = campo.checked;
            else if (campo.type === 'radio') { if (campo.checked) dados[campo.name] = campo.value.trim(); }
            else dados[campo.name] = String(campo.value ?? '').trim();
        });
        return dados;
    }

    new FormData(form).forEach((valor, chave) => {
        dados[chave] = typeof valor === 'string' ? valor.trim() : valor;
    });
    return dados;
}

NS.ui = NS.ui || {};
NS.ui.components = NS.ui.components || {};
NS.ui.components.formField = { aplicarErros, campoSelect, campoSenha, campoTextarea, campoTexto, lerFormulario, ligarRevelarSenha, limparErros, mostrarAviso, mostrarErro };
})();
