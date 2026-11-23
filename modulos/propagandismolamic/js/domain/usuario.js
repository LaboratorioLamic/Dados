// ===== js/domain/usuario.js =====
(function () {
'use strict';

/**
 * Domínio: contas de usuário.
 *
 * A senha nunca é guardada em texto puro: fica como SHA-256 de `salt:senha`,
 * com salt aleatório por usuário. Isso impede que alguém *leia* a senha na
 * base — e só isso. Como o app é `file://` + `localStorage`, quem abre o
 * DevTools ainda edita a base à mão. O login é organização de acesso, não
 * uma barreira de segurança.
 *
 * O hash é assíncrono (`crypto.subtle`), então `criar`, `autenticar` e
 * `trocarSenha` devolvem Promise — os formulários dão `await` no submit.
 */

var db = NS.core.db;
var novoSalt = NS.core.id.novoSalt;
var normalizeStr = NS.domain.enderecoUtils.normalizeStr;
var permissoes = NS.domain.permissoes;
var sessao = NS.core.sessao;
const COLECAO = 'usuarios';
const SENHA_MINIMA = 6;

/* ------------------------------------------------------------------ *
 * Hash de senha
 * ------------------------------------------------------------------ */

/** true quando o hash forte está disponível. Falso vira aviso visível em Ajustes. */
function hashForteDisponivel() {
    return typeof crypto !== 'undefined' && !!crypto.subtle && typeof crypto.subtle.digest === 'function';
}

/**
 * Fallback declaradamente fraco (FNV-1a de 64 bits, em duas passadas).
 * Só entra em cena se `crypto.subtle` não existir — navegador muito antigo
 * ou contexto não confiável. Nunca substitui o SHA-256 em silêncio: o
 * usuário fica marcado com `algoritmo: 'fraco'` e a tela de Ajustes avisa.
 */
function hashFraco(texto) {
    let a = 0x811c9dc5;
    let b = 0xcbf29ce4;

    for (let i = 0; i < texto.length; i++) {
        const codigo = texto.charCodeAt(i);
        a = Math.imul(a ^ codigo, 0x01000193) >>> 0;
        b = Math.imul(b ^ (codigo + i), 0x01000193) >>> 0;
    }

    return (a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')).repeat(4);
}

async function hashSenha(senha, salt) {
    const material = `${salt}:${senha}`;

    if (!hashForteDisponivel()) {
        return { hash: hashFraco(material), algoritmo: 'fraco' };
    }

    const bytes = new TextEncoder().encode(material);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');

    return { hash, algoritmo: 'sha256' };
}

/** Comparação de tempo constante — barata e evita um vazamento bobo. */
function hashesIguais(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;

    let diferenca = 0;
    for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diferenca === 0;
}

/* ------------------------------------------------------------------ *
 * Leitura
 * ------------------------------------------------------------------ */

function listar() {
    return db.listar(COLECAO).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

function obter(id) {
    return db.obter(COLECAO, id);
}

function porLogin(login) {
    const alvo = normalizeStr(login);
    if (!alvo) return null;
    return db.listar(COLECAO).find(u => normalizeStr(u.login) === alvo) || null;
}

/** O usuário logado, ou null. */
function atual() {
    return permissoes.usuarioDaSessao();
}

function adminsAtivos() {
    return db.listar(COLECAO).filter(u => u.admin && u.ativo !== false);
}

function contarAdmins() {
    return adminsAtivos().length;
}

/** Base sem nenhum administrador ativo: o boot oferece o cadastro inicial. */
function precisaPrimeiroAdmin() {
    return contarAdmins() === 0;
}

/** true se `id` é o último administrador ativo — bloqueia excluir/desativar/rebaixar. */
function ehUltimoAdmin(id) {
    const admins = adminsAtivos();
    return admins.length === 1 && admins[0].id === id;
}

/* ------------------------------------------------------------------ *
 * Validação
 * ------------------------------------------------------------------ */

/** CPF é opcional; se preenchido, precisa ser válido de verdade. */
function cpfValido(bruto) {
    const digitos = String(bruto || '').replace(/\D/g, '');
    if (digitos.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(digitos)) return false;

    for (const tamanho of [9, 10]) {
        let soma = 0;
        for (let i = 0; i < tamanho; i++) soma += Number(digitos[i]) * (tamanho + 1 - i);
        const resto = (soma * 10) % 11 % 10;
        if (resto !== Number(digitos[tamanho])) return false;
    }

    return true;
}

function formatarCpf(bruto) {
    const digitos = String(bruto || '').replace(/\D/g, '').slice(0, 11);
    if (!digitos) return '';
    return digitos
        .replace(/^(\d{3})(\d)/, '$1.$2')
        .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
}

/**
 * Valida os dados de um usuário. Devolve um mapa { campo: mensagem },
 * pronto para `aplicarErros` de `js/ui/components/formField.js`.
 *
 * @param {object} dados                  nome, cpf, login, senha, confirmarSenha, grupoId, admin
 * @param {object} [opcoes]
 * @param {string} [opcoes.ignorarId]     id do próprio usuário, na edição
 * @param {boolean} [opcoes.senhaOpcional] true na edição: em branco = manter a atual
 */
function validar(dados, { ignorarId = null, senhaOpcional = false } = {}) {
    const erros = {};

    const nome = (dados.nome || '').trim();
    if (!nome) erros.nome = 'Informe o nome completo.';
    else if (nome.length < 3) erros.nome = 'Nome muito curto.';

    if (dados.cpf && !cpfValido(dados.cpf)) erros.cpf = 'CPF inválido.';

    const login = (dados.login || '').trim();
    if (!login) erros.login = 'Informe o login.';
    else if (login.length < 3) erros.login = 'Login muito curto.';
    else if (/\s/.test(login)) erros.login = 'O login não pode ter espaços.';
    else {
        const existente = porLogin(login);
        if (existente && existente.id !== ignorarId) erros.login = 'Já existe um usuário com esse login.';
    }

    const senha = dados.senha || '';
    const querTrocarSenha = !senhaOpcional || senha || dados.confirmarSenha;

    if (querTrocarSenha) {
        if (senha.length < SENHA_MINIMA) erros.senha = `A senha precisa de pelo menos ${SENHA_MINIMA} caracteres.`;
        else if (senha !== (dados.confirmarSenha || '')) erros.confirmarSenha = 'As senhas não conferem.';
    }

    if (!dados.admin) {
        if (!dados.grupoId) erros.grupoId = 'Escolha um grupo.';
        else if (!permissoes.obterGrupo(dados.grupoId)) erros.grupoId = 'Grupo não encontrado.';
    }

    return erros;
}

/* ------------------------------------------------------------------ *
 * Escrita
 * ------------------------------------------------------------------ */

async function criar({ nome, cpf = '', login, senha, grupoId = '', admin = false }) {
    const salt = novoSalt();
    const { hash, algoritmo } = await hashSenha(senha, salt);

    return db.criar(COLECAO, {
        nome: nome.trim(),
        cpf: formatarCpf(cpf),
        login: login.trim(),
        senhaHash: hash,
        salt,
        algoritmo,
        grupoId: admin ? '' : grupoId,
        admin: !!admin,
        ativo: true,
        ultimoAcesso: null
    });
}

/**
 * Atualiza um usuário. Senha em branco mantém a atual.
 * @returns {Promise<{ok: boolean, motivo?: string, usuario?: object}>}
 */
async function atualizar(id, { nome, cpf, login, senha, grupoId, admin }) {
    const usuario = obter(id);
    if (!usuario) return { ok: false, motivo: 'Usuário não encontrado.' };

    if (usuario.admin && admin === false && ehUltimoAdmin(id)) {
        return { ok: false, motivo: 'Este é o único administrador ativo. Promova outro usuário antes de rebaixá-lo.' };
    }

    const patch = {};
    // Conta ligada ao Dados LAMIC: nome, CPF, login e senha vêm de lá e não mudam aqui.
    const ligado = !!usuario.dadosLogin;
    if (ligado) { nome = cpf = login = senha = undefined; }
    if (nome !== undefined) patch.nome = String(nome).trim();
    if (cpf !== undefined) patch.cpf = formatarCpf(cpf);
    if (login !== undefined) patch.login = String(login).trim();
    if (admin !== undefined) patch.admin = !!admin;
    if (grupoId !== undefined || admin !== undefined) {
        const viraAdmin = admin !== undefined ? !!admin : usuario.admin;
        patch.grupoId = viraAdmin ? '' : (grupoId !== undefined ? grupoId : usuario.grupoId);
    }

    if (senha) {
        const salt = novoSalt();
        const { hash, algoritmo } = await hashSenha(senha, salt);
        Object.assign(patch, { senhaHash: hash, salt, algoritmo });
    }

    return { ok: true, usuario: db.atualizar(COLECAO, id, patch) };
}

/** Troca a senha do próprio usuário, exigindo a atual. */
async function trocarSenha(id, senhaAtual, senhaNova) {
    const usuario = obter(id);
    if (!usuario) return { ok: false, motivo: 'Usuário não encontrado.' };
    if (usuario.dadosLogin) return { ok: false, motivo: 'A senha é a do Dados LAMIC. Troque por lá.' };

    const { hash } = await hashSenha(senhaAtual, usuario.salt);
    if (!hashesIguais(hash, usuario.senhaHash)) return { ok: false, motivo: 'A senha atual está incorreta.' };

    if (senhaNova.length < SENHA_MINIMA) {
        return { ok: false, motivo: `A senha precisa de pelo menos ${SENHA_MINIMA} caracteres.` };
    }

    const salt = novoSalt();
    const novo = await hashSenha(senhaNova, salt);
    db.atualizar(COLECAO, id, { senhaHash: novo.hash, salt, algoritmo: novo.algoritmo });

    return { ok: true };
}

function definirAtivo(id, ativo) {
    if (!ativo && ehUltimoAdmin(id)) {
        return { ok: false, motivo: 'Este é o único administrador ativo. Promova outro usuário antes de desativá-lo.' };
    }
    return { ok: true, usuario: db.atualizar(COLECAO, id, { ativo: !!ativo }) };
}

/** Excluir um usuário não toca em médicos nem visitas — a base é compartilhada. */
function remover(id) {
    if (ehUltimoAdmin(id)) {
        return { ok: false, motivo: 'Este é o único administrador ativo. Promova outro usuário antes de excluí-lo.' };
    }
    if (id === sessao.usuarioId()) {
        return { ok: false, motivo: 'Você não pode excluir a própria conta.' };
    }

    return { ok: db.remover(COLECAO, id) };
}

/**
 * Autentica e abre a sessão.
 * A mensagem de erro é sempre a mesma para login inexistente e senha errada —
 * não vale entregar de graça quais logins existem.
 *
 * @returns {Promise<{ok: boolean, motivo?: string, usuario?: object}>}
 */
async function autenticar(login, senha) {
    const usuario = porLogin(login);
    const generico = { ok: false, motivo: 'Login ou senha inválidos.' };

    if (!usuario) return generico;

    const { hash } = await hashSenha(senha, usuario.salt);
    if (!hashesIguais(hash, usuario.senhaHash)) return generico;

    if (usuario.ativo === false) {
        return { ok: false, motivo: 'Esta conta está desativada. Procure um administrador.' };
    }

    db.atualizar(COLECAO, usuario.id, { ultimoAcesso: new Date().toISOString() }, { silencioso: true });
    sessao.abrir(usuario.id);

    return { ok: true, usuario: obter(usuario.id) };
}

/** Cadastro do administrador inicial. Só funciona em base sem admin ativo. */
async function criarPrimeiroAdmin(dados) {
    if (!precisaPrimeiroAdmin()) {
        return { ok: false, motivo: 'Este sistema já possui um administrador.' };
    }

    const usuario = await criar({ ...dados, admin: true, grupoId: '' });
    sessao.abrir(usuario.id);

    return { ok: true, usuario };
}

/** Autocadastro pela tela de login. Entra no grupo padrão, nunca como admin. */
async function autocadastrar(dados) {
    const config = db.lerConfig();
    if (!config.autocadastro) return { ok: false, motivo: 'O autocadastro está desativado.' };

    const grupo = permissoes.grupoPadrao();
    if (!grupo) return { ok: false, motivo: 'Nenhum grupo padrão configurado. Procure um administrador.' };

    const usuario = await criar({ ...dados, admin: false, grupoId: grupo.id });
    sessao.abrir(usuario.id);

    return { ok: true, usuario };
}

function sair() {
    sessao.encerrar();
}

NS.domain = NS.domain || {};
NS.domain.usuario = {
    SENHA_MINIMA, adminsAtivos, atual, atualizar, autenticar, autocadastrar, contarAdmins,
    cpfValido, criar, criarPrimeiroAdmin, definirAtivo, ehUltimoAdmin, formatarCpf,
    hashForteDisponivel, listar, obter, porLogin, precisaPrimeiroAdmin, remover, sair,
    trocarSenha, validar
};
})();
