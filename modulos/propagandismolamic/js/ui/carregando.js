// ===== js/ui/carregando.js =====
(function () {
'use strict';

/**
 * Overlay de carregamento bloqueante.
 *
 * Toda ação que depende do banco passa por `acaoRemota`: ela recusa quando
 * não há conexão, cobre a tela enquanto a escrita não chega ao servidor e
 * só então libera a interface. É o que impede o usuário de clicar duas
 * vezes em "Salvar" ou de fechar o modal achando que gravou.
 *
 * Não reaproveita `NS.ui.modal`: modal fecha com Escape, com clique no
 * fundo e com o botão ×, que é exatamente o que aqui não pode existir.
 */

var toast = NS.ui.toast;

const MSG_SEM_CONEXAO = 'Sem conexão com o servidor. A alteração não foi salva — tente de novo quando a conexão voltar.';
const MSG_FALHA = 'Não foi possível salvar. Verifique a conexão e tente novamente.';
const MSG_TIMEOUT = 'O servidor não confirmou o salvamento. Confira o registro antes de repetir a ação.';
const TIMEOUT_ESCRITA = 15000;

let raiz = null;
let contador = 0;

function obterRaiz() {
    if (!raiz) raiz = document.getElementById('carregando-root');
    return raiz;
}

function definirTexto(mensagem) {
    const alvo = obterRaiz()?.querySelector('[data-carregando-msg]');
    if (alvo) alvo.textContent = mensagem;
}

/** Enquanto o overlay está visível, nada além dele recebe clique ou tecla. */
function bloquear(evento) {
    if (obterRaiz()?.contains(evento.target)) return;
    evento.preventDefault();
    evento.stopPropagation();
}

function ligarBloqueio() {
    document.addEventListener('pointerdown', bloquear, true);
    document.addEventListener('keydown', bloquear, true);
}

function desligarBloqueio() {
    document.removeEventListener('pointerdown', bloquear, true);
    document.removeEventListener('keydown', bloquear, true);
}

/**
 * Mostra o overlay. Chamadas aninhadas são contadas — o overlay só some
 * quando a última terminar.
 * @returns {Function} esconde esta chamada
 */
function mostrar(mensagem = 'Salvando…') {
    const elemento = obterRaiz();
    if (!elemento) return () => {};

    definirTexto(mensagem);
    contador += 1;

    if (contador === 1) {
        elemento.hidden = false;
        elemento.classList.add('carregando-overlay--visivel');
        document.body.classList.add('carregando');
        ligarBloqueio();
    }

    let jaEscondeu = false;
    return function () {
        if (jaEscondeu) return;
        jaEscondeu = true;
        esconder();
    };
}

function esconder() {
    const elemento = obterRaiz();
    if (!elemento) return;

    contador = Math.max(0, contador - 1);
    if (contador > 0) return;

    elemento.classList.remove('carregando-overlay--visivel');
    document.body.classList.remove('carregando');
    desligarBloqueio();
    setTimeout(() => { if (contador === 0) elemento.hidden = true; }, 200);
}

function comTimeout(promessa, ms, nome) {
    let temporizador;
    const limite = new Promise((_, reject) => {
        temporizador = setTimeout(() => {
            const erro = new Error(nome || 'Tempo esgotado.');
            erro.name = 'TimeoutErro';
            reject(erro);
        }, ms);
    });
    return Promise.race([promessa, limite]).finally(() => clearTimeout(temporizador));
}

/** Envolve uma promessa qualquer no overlay. */
async function com(promessa, { mensagem = 'Carregando…' } = {}) {
    const fim = mostrar(mensagem);
    try {
        return await promessa;
    } finally {
        fim();
    }
}

/**
 * O wrapper que a UI usa: recusa offline, mostra o overlay, executa a ação
 * e só devolve depois que o servidor confirmou a gravação.
 *
 * @param {Function} fn ação síncrona ou assíncrona que grava no banco
 * @returns {Promise<{ok: boolean, valor?: any, erro?: Error}>}
 */
async function acaoRemota(fn, { mensagem = 'Salvando…' } = {}) {
    const db = NS.core.db;

    if (!db.conectado()) {
        toast.erro(MSG_SEM_CONEXAO, 7000);
        return { ok: false, erro: new db.ErroSemConexao() };
    }

    const fim = mostrar(mensagem);

    try {
        const valor = await fn();
        // A confirmação do servidor é o que autoriza fechar o modal.
        await comTimeout(db.pendente(), TIMEOUT_ESCRITA, MSG_TIMEOUT);
        return { ok: true, valor };
    } catch (erro) {
        if (erro?.name === 'ErroSemConexao') toast.erro(MSG_SEM_CONEXAO, 7000);
        else if (erro?.name === 'TimeoutErro') toast.erro(MSG_TIMEOUT, 8000);
        else {
            // Mostra o motivo real (ex.: PERMISSION_DENIED) para achar o problema sem abrir o console
            console.error('[acaoRemota]', erro);
            const det = /permission|denied/i.test(String(erro?.code || erro?.message || ''))
                ? ' (sem permissão no banco: confira as regras do Dados LAMIC e o acesso do seu grupo ao módulo)'
                : (erro?.code || erro?.message ? ` (${erro.code || erro.message})` : '');
            toast.erro((erro?.mensagemUsuario || MSG_FALHA) + det, 10000);
        }
        return { ok: false, erro };
    } finally {
        fim();
    }
}

/* ------------------------------------------------------------------ *
 * Overlay de boot — sem contador, e pode virar tela de erro
 * ------------------------------------------------------------------ */

const boot = {
    mostrar(mensagem) {
        const elemento = obterRaiz();
        if (!elemento) return;
        elemento.hidden = false;
        elemento.classList.add('carregando-overlay--visivel');
        document.body.classList.add('carregando');
        definirTexto(mensagem);
    },

    texto: definirTexto,

    esconder() {
        const elemento = obterRaiz();
        if (!elemento) return;
        contador = 0;
        elemento.classList.remove('carregando-overlay--visivel');
        document.body.classList.remove('carregando');
        desligarBloqueio();
        setTimeout(() => { if (contador === 0) elemento.hidden = true; }, 200);
    },

    /** Substitui o spinner por uma mensagem de falha com botão de recarregar. */
    erro({ titulo, mensagem, aoTentar }) {
        const elemento = obterRaiz();
        if (!elemento) return;

        elemento.hidden = false;
        elemento.classList.add('carregando-overlay--visivel');
        document.body.classList.add('carregando');

        elemento.innerHTML = `
            <div class="carregando__caixa carregando__caixa--erro" role="alert">
                <h2 class="carregando__titulo"></h2>
                <p class="carregando__texto"></p>
                <button type="button" class="btn btn--primario" data-tentar>Tentar novamente</button>
            </div>
        `;
        elemento.querySelector('.carregando__titulo').textContent = titulo;
        elemento.querySelector('.carregando__texto').textContent = mensagem;
        elemento.querySelector('[data-tentar]').addEventListener('click', () => {
            (aoTentar || (() => location.reload()))();
        });
    }
};

NS.ui = NS.ui || {};
NS.ui.carregando = { acaoRemota, boot, com, comTimeout, esconder, mostrar };
})();
