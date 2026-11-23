// ===== js/core/dadosSessao.js =====
(function () {
'use strict';

/**
 * Login pelo Dados LAMIC (projeto applamic).
 *
 * O Propagandismo não tem mais login próprio: usa a sessão do Firebase Auth do
 * Dados LAMIC (mesma origem, a sessão fica no IndexedDB do domínio). Quem entra:
 *   - administrador do Dados, quem gerencia módulos, ou grupo do Dados com o link
 *     do Propagandismo liberado — a regra de verdade está no database.rules.json
 *     do Dados (nó /propagandismo). Sem isso a leitura do banco é recusada e
 *     ninguém ganha usuário aqui.
 *
 * O usuário do Dados é ligado ao cadastro daqui (usuarios) por dadosLogin,
 * CPF, login ou nome. Quem tem acesso mas ainda não tem cadastro entra no grupo
 * padrão do módulo (admin do Dados entra como Administrador Geral).
 * Nome, CPF e login vêm sempre do Dados e não são editáveis aqui; não há senha.
 */

var fb = NS.core.firebase;
var db = NS.core.db;
var sessao = NS.core.sessao;

const DADOS_URL = 'https://laboratoriolamic.github.io/Dados/';
const soDig = v => String(v || '').replace(/\D/g, '');
const norm = v => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

let contaDados = null;   // { login, nome, cargo, grupo, admin, cpf }

/** Espera o Firebase Auth restaurar a sessão. Devolve o usuário do Auth ou null. */
function usuarioAuth() {
    const auth = fb.auth();
    if (!auth) return Promise.resolve(null);
    return new Promise(resolve => {
        const off = auth.onAuthStateChanged(u => { off(); resolve(u); });
    });
}

/**
 * Antes de ler o banco: confere a conta no Dados e, para quem gerencia módulos,
 * grava acesso_links/propagandismo (as regras usam esse ponteiro para liberar o nó).
 * @returns {Promise<{ok: boolean, titulo?: string, motivo?: string}>}
 */
async function preparar() {
    const user = await usuarioAuth();
    if (!user) return { ok: false, titulo: 'Sessão do Dados LAMIC', motivo: 'Entre pelo Dados LAMIC para usar o Propagandismo.' };

    const login = await fb.lerRaiz(`uids/${user.uid}`).catch(() => null);
    const perfil = login ? await fb.lerRaiz(`usuarios/${login}`).catch(() => null) : null;
    if (!perfil || perfil.ativo !== true) return { ok: false, titulo: 'Sem acesso', motivo: 'Sua conta está desativada no Dados LAMIC.' };

    const admin = perfil.grupo === 'admin';
    let gerente = admin;
    if (!admin && perfil.grupo) {
        const g = await fb.lerRaiz(`grupos/${perfil.grupo}`).catch(() => null);
        gerente = g?.perms?.modulos_gerenciar === true;
    }

    if (gerente) {
        try {
            const mods = (await fb.lerRaiz('modulos')) || {};
            let achou = null;
            for (const [mod, m] of Object.entries(mods))
                for (const [link, l] of Object.entries(m?.links || {}))
                    if (/propagandismo/i.test(String(l?.url || ''))) achou = achou || { mod, link };
            const atual = await fb.lerRaiz('acesso_links/propagandismo').catch(() => null);
            if (achou && (achou.mod !== atual?.mod || achou.link !== atual?.link)) await fb.gravarRaiz('acesso_links/propagandismo', achou);
        } catch (e) { console.warn('acesso_links/propagandismo:', e); }
    }

    let cpf = '';
    try { cpf = soDig(await fb.lerRaiz(`privado/${login}/cpf`)); } catch { /* sem permissão: liga por login/nome */ }
    if (cpf === '00000000000') cpf = '';

    contaDados = { login, nome: perfil.nome || login, cargo: perfil.cargo || '', grupo: perfil.grupo, admin, cpf };
    return { ok: true };
}

function esperarConexao(ms = 15000) {
    if (fb.conectado()) return Promise.resolve(true);
    return new Promise(resolve => {
        const t = setTimeout(() => { off(); resolve(fb.conectado()); }, ms);
        const off = fb.aoMudarConexao(on => { if (on) { clearTimeout(t); off(); resolve(true); } });
    });
}

const formatarCpf = d => d ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : '';

/**
 * Depois de carregar o banco: liga (ou cria) o usuário daqui e abre a sessão.
 * @returns {Promise<{ok: boolean, titulo?: string, motivo?: string}>}
 */
async function entrar() {
    const c = contaDados;
    if (!c) return { ok: false, titulo: 'Sessão do Dados LAMIC', motivo: 'Entre pelo Dados LAMIC para usar o Propagandismo.' };
    if (!(await esperarConexao())) return { ok: false, titulo: 'Sem conexão', motivo: 'Não foi possível falar com o servidor. Recarregue a página.' };

    const todos = db.listar('usuarios');
    const livre = u => !u.dadosLogin || u.dadosLogin === c.login;
    let eu = todos.find(u => u.dadosLogin === c.login)
        || (c.cpf && todos.find(u => livre(u) && soDig(u.cpf) === c.cpf))
        || todos.find(u => livre(u) && norm(u.login) === norm(c.login));
    // Nome parecido não liga sozinho: o administrador vincula em Ajustes › Usuários › Vincular.

    // Dados críticos sempre espelhados do Dados LAMIC
    const espelho = { dadosLogin: c.login, nome: c.nome, login: c.login, ...(c.cpf ? { cpf: formatarCpf(c.cpf) } : {}) };

    if (eu) {
        if (eu.ativo === false && !c.admin) return { ok: false, titulo: 'Usuário inativo', motivo: 'Seu usuário está desativado no Propagandismo. Fale com um administrador.' };
        const patch = { ...espelho, ultimoAcesso: new Date().toISOString() };
        if (c.admin) Object.assign(patch, { admin: true, grupoId: '', ativo: true });
        db.atualizar('usuarios', eu.id, patch, { silencioso: true });
    } else {
        const grupo = NS.domain.permissoes.grupoPadrao();
        if (!c.admin && !grupo) {
            return { ok: false, titulo: 'Primeiro acesso', motivo: 'Você ainda não tem cadastro no Propagandismo e nenhum grupo padrão foi escolhido. Peça a um administrador (Ajustes › Usuários › Grupos e permissões).' };
        }
        eu = db.criar('usuarios', {
            ...espelho,
            cpf: espelho.cpf || '',
            grupoId: c.admin ? '' : grupo.id,
            admin: !!c.admin,
            ativo: true,
            criadoVia: 'dados',
            ultimoAcesso: new Date().toISOString()
        });
    }
    await db.pendente().catch(() => {});
    sessao.abrir(eu.id);
    return { ok: true };
}

/* ------------------------------------------------------------------ *
 * Vínculo manual: usuário antigo daqui ↔ conta do Dados LAMIC
 * ------------------------------------------------------------------ */

/** Contas ativas do Dados LAMIC: [{ login, nome, cargo }] em ordem de nome. */
async function contasDados() {
    const us = (await fb.lerRaiz('usuarios')) || {};
    return Object.entries(us)
        .filter(([, u]) => u && u.ativo === true)
        .map(([login, u]) => ({ login, nome: u.nome || login, cargo: u.cargo || '' }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Sugestão para um usuário antigo: mesmo login ou mesmo nome. */
function sugerir(u, contas) {
    return contas.find(c => norm(c.login) === norm(u.login))
        || contas.find(c => norm(c.nome) === norm(u.nome))
        || null;
}

/**
 * Liga o usuário `id` à conta `login` do Dados. Se outro cadastro daqui já usava
 * esse login (ex.: criado sozinho no primeiro acesso), ele é desativado e perde o
 * vínculo — nada é apagado. Nome e login passam a ser os do Dados.
 */
function vincular(id, conta) {
    const alvo = db.obter('usuarios', id);
    if (!alvo || !conta) return { ok: false, motivo: 'Usuário ou conta não encontrados.' };
    for (const outro of db.listar('usuarios', u => u.dadosLogin === conta.login && u.id !== id)) {
        db.atualizar('usuarios', outro.id, { dadosLogin: null, ativo: false, substituidoPor: id });
    }
    db.atualizar('usuarios', id, { dadosLogin: conta.login, nome: conta.nome, login: conta.login, ativo: true, vinculadoEm: new Date().toISOString() });
    return { ok: true };
}

function desvincular(id) {
    const alvo = db.obter('usuarios', id);
    if (!alvo) return { ok: false, motivo: 'Usuário não encontrado.' };
    if (id === sessao.usuarioId()) return { ok: false, motivo: 'Você não pode desvincular a própria conta.' };
    db.atualizar('usuarios', id, { dadosLogin: null, ativo: false });
    return { ok: true };
}

/** Usuário ligado ao Dados: nome, CPF, login e senha não se editam aqui. */
function ligado(u) {
    return !!(u && u.dadosLogin);
}

NS.core = NS.core || {};
NS.core.dadosSessao = { DADOS_URL, contasDados, desvincular, entrar, ligado, preparar, sugerir, vincular, conta: () => contaDados };
})();
