// ═══════════════════════════════════════════════════════════════
// key.js — Sistema de Autenticação — Manutenção LAMIC
// ═══════════════════════════════════════════════════════════════

const AUTH_KEY = 'auth-key-v1';

let authState = {
  users:  [],
  groups: [],
  cargos: [],
  allowRegistration: true
};

let currentSession = null;
/*
  Session: { userId, username, nomeCompleto, cargo, cpf,
             grupoId, isAdmin, setores[], loginAt }

  User:    { id, nomeCompleto, cpf, cargo, username, passwordHash,
             setores[], grupoId, isAdmin, ativo, createdAt }

  Group:   { id, nome, isDefault, permissoes: {
               ativos:      { criar, editar, excluir, editarSetor, editarCategoria },
               rotinas:     { criar, editar, excluir, editarTipo },
               tarefas:     { criar, editar, excluir, publicar },
               atividades:  { editar, excluir },
               ot:          { criarOT, editarOT, excluirOT, alterarStatus,
                              realizarPublicacoes, editarPublicacoes, excluirPublicacoes },
               config:      { visualizarConfig, backup,
                              gerenciarUsuarios, gerenciarGrupos }
             }}
*/

// ── HASH (obfuscação simples para localStorage) ──────────────
function _hashPwd(pwd) {
  let h = 5381;
  const s = pwd + 'lamic-key-2024';
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 33) ^ s.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, '0') + '-' +
    btoa(unescape(encodeURIComponent(pwd))).slice(-8);
}

function _verifyPwd(plain, stored) {
  return _hashPwd(plain) === stored;
}

// Reautenticação para assinaturas críticas (ex.: liberar corrida com violação)
// Assinatura = senha do Dados LAMIC (reautentica no Firebase Auth). Retorna Promise<boolean>.
async function authVerifyCurrentPassword(pwd) {
  const fu = firebase.auth().currentUser;
  if (!currentSession || !pwd || !fu) return false;
  try {
    await fu.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(fu.email, pwd));
    return true;
  } catch (e) { return false; }
}

// ── PERSISTÊNCIA ─────────────────────────────────────────────
function _saveAuth() {
  window.dbSave(AUTH_KEY, authState);
}

function _applyAuthData(d) {
  if (!d || typeof d !== 'object') return;
  authState.users  = Array.isArray(d.users)  ? d.users  : [];
  authState.groups = Array.isArray(d.groups) ? d.groups : [];
  authState.allowRegistration = d.allowRegistration !== false;
  // Migração: unifica criarUsuarios/editarUsuarios/deletarUsuarios → gerenciarUsuarios
  authState.groups.forEach(g => {
    if (!g.permissoes?.config) return;
    const c = g.permissoes.config;
    if ('criarUsuarios' in c || 'editarUsuarios' in c || 'deletarUsuarios' in c) {
      c.gerenciarUsuarios = !!(c.criarUsuarios || c.editarUsuarios || c.deletarUsuarios);
      delete c.criarUsuarios; delete c.editarUsuarios; delete c.deletarUsuarios;
    }
    // Migração: renomeia os → ot
    if (g.permissoes.os) { g.permissoes.ot = g.permissoes.os; delete g.permissoes.os; }
  });
  // Migração: reconstrói lista de cargos a partir dos usuários se não existir
  if (Array.isArray(d.cargos) && d.cargos.length > 0) {
    authState.cargos = d.cargos;
  } else {
    authState.cargos = [...new Set(authState.users.map(u => u.cargo).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }
}


// ── UTILITÁRIOS ──────────────────────────────────────────────
function _authUid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function formatCPF(v) {
  return v.replace(/\D/g, '')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
    .slice(0, 14);
}

function _getInitials(name) {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ── API PÚBLICA ───────────────────────────────────────────────
function authHasAdmin() {
  return authState.users.some(u => u.isAdmin);
}

function authGetDefaultGroup() {
  return authState.groups.find(g => g.isDefault) || null;
}

function authIsRegistrationAllowed() {
  return authState.allowRegistration !== false;
}

function authGetCurrentUser() {
  return currentSession;
}

function authHasPermission(key) {
  if (!currentSession) return false;
  if (currentSession.isAdmin) return true;
  if (!currentSession.grupoId) return false;
  const group = authState.groups.find(g => g.id === currentSession.grupoId);
  if (!group?.permissoes) return false;
  let perm = group.permissoes;
  for (const p of key.split('.')) {
    perm = perm?.[p];
    if (perm === undefined || perm === null) return false;
  }
  return !!perm;
}

// Como 'visualizar' é uma permissão nova, grupos antigos não a têm definida.
// Retorna true se a permissão não estiver definida (compatibilidade com grupos existentes).
function authCanViewTab(tabId) {
  if (!currentSession) return true;
  if (currentSession.isAdmin) return true;
  // Módulo regulado: só aparece para quem recebeu a permissão explicitamente
  if (tabId === 'cq') return authHasPermission('cq.visualizar');
  if (!currentSession.grupoId) return true;
  const group = authState.groups.find(g => g.id === currentSession.grupoId);
  if (!group?.permissoes) return true;
  const catMap = { ativos: ['ativos','visualizar'], rotina: ['rotinas','visualizar'], os: ['ot','visualizar'], ocorrencias: ['ocorrencias','visualizar'] };
  const path = catMap[tabId];
  if (!path) return true;
  let perm = group.permissoes;
  for (const p of path) {
    if (perm === undefined || perm === null) return true;
    perm = perm[p];
  }
  return perm === undefined ? true : !!perm;
}

// Ids de setor (org.js) liberados ao grupo do usuário logado; null = todos
function authGetVisibleSetores() {
  if (!currentSession) return null;
  if (currentSession.isAdmin) return null;
  const g = authState.groups.find(g => g.id === currentSession.grupoId);
  return _authGrupoSetorIds(g);
}

// ── SETORES × UNIDADES ───────────────────────────────────────
// Permissões e filtros trabalham com ids de setor (org.js). Setores cadastrados em unidades
// ficam em setorIdsPermitidos / setorIds; itens da lista antiga ainda sem unidade continuam
// gravados pelo nome (setoresPermitidos / setores) e, quando ganham destino, o nome passa a
// apontar para o setor novo (vínculo em org.js) — sem precisar regravar as permissões.
function _authOrg() { return typeof _orgSetores === 'function'; }
function _authMigrado() { return _authOrg() && _orgMigrado(); }   // há unidades cadastradas
function _authEsc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// Ids de setor a partir dos campos gravados (ids novos + nomes antigos)
function _authIdsGravados(ids, nomes) {
  const out = new Set(Array.isArray(ids) ? ids.filter(Boolean) : []);
  (Array.isArray(nomes) ? nomes : []).forEach(n => out.add(_orgIdDeNomeLegado(n) || 'n:' + n));
  return [...out];
}
// Separa ids reais (gravados como id) e nomes antigos sem destino (gravados como nome)
function _authSepararIds(ids) {
  const reais = [], nomes = [];
  ids.forEach(id => { if (String(id).startsWith('n:')) nomes.push(String(id).slice(2)); else reais.push(id); });
  return { reais, nomes };
}
// Setores liberados ao grupo: por unidade (inclui setores futuros) + setores avulsos. null = todos
function _authGrupoSetorIds(g) {
  if (!g || !_authOrg()) return null;
  const un = Array.isArray(g.unidadeIdsPermitidas) ? g.unidadeIdsPermitidas : [];
  const ids = _authIdsGravados(g.setorIdsPermitidos, g.setoresPermitidos);
  if (!un.length && !ids.length) return null;
  return [...new Set([...ids, ..._orgSetoresDasUnidades(un)])];
}
function _authGravarGrupoSetores(g, setorIds, unidadeIds) {
  const { reais, nomes } = _authSepararIds(setorIds);
  g.setorIdsPermitidos = reais;
  g.setoresPermitidos = nomes;
  g.unidadeIdsPermitidas = (unidadeIds || []).slice();
}
// Restrição individual do usuário (subconjunto do grupo); [] = todos do grupo
function _authUserSetorIds(u) {
  if (!u || !_authOrg()) return [];
  return _authIdsGravados(u.setorIds, u.setores);
}
function _authGravarUserSetores(u, ids) {
  const { reais, nomes } = _authSepararIds(ids);
  u.setorIds = reais;
  u.setores = nomes;
}
function _authSessaoUserSetorIds() {
  const u = currentSession ? authState.users.find(x => x.id === currentSession.userId) : null;
  return _authUserSetorIds(u);
}
function _authTodosSetorIds() { return _authOrg() ? _orgSetores(undefined, { todos: true }).map(s => s.id) : []; }

// Resumo legível de uma seleção de setores ("NTO", "NTO · 2/5 setores", "2 unidades"…)
function _authResumoSetores(sel, available) {
  if (!available.length || sel.length >= available.length) return 'Todos os setores';
  if (sel.length === 1) return _orgRotuloSetor(sel[0]);
  const porUn = {};
  available.forEach(id => { const u = _orgUnidadeIdDoSetor(id) || ''; (porUn[u] = porUn[u] || { tot: 0, sel: 0 }).tot++; });
  sel.forEach(id => { const u = _orgUnidadeIdDoSetor(id) || ''; if (porUn[u]) porUn[u].sel++; });
  const comSel = Object.entries(porUn).filter(([, v]) => v.sel > 0);
  if (comSel.length === 1 && comSel[0][0]) {
    const [u, v] = comSel[0];
    return v.sel === v.tot ? _orgSiglaUnidade(u) : `${_orgSiglaUnidade(u)} · ${v.sel}/${v.tot} setores`;
  }
  if (comSel.length > 1 && comSel.every(([u, v]) => u && v.sel === v.tot)) return `${comSel.length} unidades`;
  return `${sel.length}/${available.length} setores`;
}

// Lista de seleção agrupada por unidade: marcar a unidade marca todos os setores dela.
// `aposMudar` é o nome da função chamada depois de qualquer alteração.
function _authArvoreSetoresHTML(ids, selecionados, aposMudar) {
  const grupos = new Map();
  ids.forEach(id => { const u = _orgUnidadeIdDoSetor(id) || ''; if (!grupos.has(u)) grupos.set(u, []); grupos.get(u).push(id); });
  const ordem = [...grupos.keys()].sort((a, b) => a === '' ? 1 : b === '' ? -1 : _orgSiglaUnidade(a).localeCompare(_orgSiglaUnidade(b), 'pt-BR'));
  const sel = new Set(selecionados);
  const nome = id => _orgRotuloSetor(id, { semUnidade: true });
  const chip = (id, u) => {
    const checked = sel.has(id);
    return `<label class="sector-check-card${checked ? ' checked' : ''}">
        <input type="checkbox" value="${_authEsc(id)}" data-unidade="${_authEsc(u)}" ${checked ? 'checked' : ''} onchange="_authSetorMudou(this,'${aposMudar}')">
        <span class="sector-check-card-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:11px;height:11px;"><polyline points="20 6 9 17 4 12"/></svg>
        </span>
        <span class="sector-check-card-label">${_authEsc(nome(id))}</span>
      </label>`;
  };
  if (ordem.length === 1 && ordem[0] === '' && !_authMigrado()) {
    return grupos.get('').sort((a, b) => nome(a).localeCompare(nome(b), 'pt-BR')).map(id => chip(id, '')).join('');
  }
  return ordem.map(u => {
    const lista = grupos.get(u).sort((a, b) => nome(a).localeCompare(nome(b), 'pt-BR'));
    const un = _orgUnidade(u);
    return `<label class="sector-unit-head">
        <input type="checkbox" class="sector-unit-check" data-unidade="${_authEsc(u)}" onchange="_authUnidadeMudou(this,'${aposMudar}')">
        <b>${_authEsc(un ? un.sigla : 'Sem unidade')}</b>${un ? ` <span>${_authEsc(un.nome)}</span>` : ''}
        <small>${lista.length} setor${lista.length !== 1 ? 'es' : ''}</small>
      </label>` + lista.map(id => chip(id, u)).join('');
  }).join('');
}
function _authSetorMudou(cb, aposMudar) {
  cb.closest('.sector-check-card')?.classList.toggle('checked', cb.checked);
  if (typeof window[aposMudar] === 'function') window[aposMudar]();
}
function _authUnidadeMudou(cb, aposMudar) {
  const lista = cb.closest('.sector-grid');
  lista?.querySelectorAll(`input[type=checkbox][data-unidade="${CSS.escape(cb.dataset.unidade)}"]:not(.sector-unit-check)`).forEach(c => {
    c.checked = cb.checked;
    c.closest('.sector-check-card')?.classList.toggle('checked', cb.checked);
  });
  if (typeof window[aposMudar] === 'function') window[aposMudar]();
}
// Atualiza o estado (marcado/parcial) das caixas de unidade de uma lista
function _authSincronizarUnidades(listaId) {
  const lista = document.getElementById(listaId);
  lista?.querySelectorAll('.sector-unit-check').forEach(u => {
    const filhos = [...lista.querySelectorAll(`input[type=checkbox][data-unidade="${CSS.escape(u.dataset.unidade)}"]:not(.sector-unit-check)`)];
    const n = filhos.filter(c => c.checked).length;
    u.checked = filhos.length > 0 && n === filhos.length;
    u.indeterminate = n > 0 && n < filhos.length;
  });
}
function _authCaixasSetor(listaId) {
  return [...document.querySelectorAll(`#${listaId} input[type=checkbox]:not(.sector-unit-check)`)];
}

// ── OPERAÇÕES ────────────────────────────────────────────────
// Login e senha próprios não existem mais: a sessão vem do Dados LAMIC.
function authLogin() { return { ok: false, error: 'Entre pelo Dados LAMIC.' }; }

// Sair da Manutenção = sair do Dados LAMIC (é a mesma conta).
async function authLogout() {
  currentSession = null;
  localStorage.removeItem('auth-session');
  try { await firebase.auth().signOut(); } catch (e) { /* já saiu */ }
  location.href = DADOS_URL;
}

function authCreateAdmin(data) {
  return { ok: false, error: 'Usuários vêm do Dados LAMIC.' };
  if (authHasAdmin()) return { ok: false, error: 'Já existe um administrador.' };
  const { nomeCompleto, cpf, cargo, username, password, confirmPassword } = data;
  if (!nomeCompleto?.trim()) return { ok: false, error: 'Informe o nome completo.' };
  if (!username?.trim())    return { ok: false, error: 'Informe o nome de usuário.' };
  if (!password)             return { ok: false, error: 'Informe a senha.' };
  if (password !== confirmPassword)
    return { ok: false, error: 'As senhas não conferem.' };
  if (password.length < 4)
    return { ok: false, error: 'A senha deve ter ao menos 4 caracteres.' };
  if (authState.users.some(u =>
    u.username.toLowerCase() === username.toLowerCase().trim()))
    return { ok: false, error: 'Nome de usuário já em uso.' };

  const cargoTrimmed = (cargo || '').trim();
  authState.users.push({
    id:           _authUid(),
    nomeCompleto: nomeCompleto.trim(),
    cpf:          (cpf    || '').trim(),
    cargo:        cargoTrimmed,
    username:     username.trim(),
    passwordHash: _hashPwd(password),
    setores:      [],
    grupoId:      null,
    isAdmin:      true,
    ativo:        true,
    createdAt:    new Date().toISOString()
  });
  // Adiciona o cargo à lista se ainda não existir
  if (cargoTrimmed && !authState.cargos.includes(cargoTrimmed)) {
    authState.cargos.push(cargoTrimmed);
    authState.cargos.sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }
  _saveAuth();
  return { ok: true };
}

function authRegister(data) {
  return { ok: false, error: 'Usuários vêm do Dados LAMIC.' };
  const { nomeCompleto, cpf, cargo, username, password, confirmPassword, setores } = data;
  if (!nomeCompleto?.trim()) return { ok: false, error: 'Informe o nome completo.' };
  if (!username?.trim())    return { ok: false, error: 'Informe o nome de usuário.' };
  if (!password)             return { ok: false, error: 'Informe a senha.' };
  if (password !== confirmPassword)
    return { ok: false, error: 'As senhas não conferem.' };
  if (password.length < 4)
    return { ok: false, error: 'A senha deve ter ao menos 4 caracteres.' };
  if (authState.users.some(u =>
    u.username.toLowerCase() === username.toLowerCase().trim()))
    return { ok: false, error: 'Nome de usuário já em uso.' };

  const defaultGroup = authGetDefaultGroup();
  if (!defaultGroup)
    return { ok: false, error: 'Nenhum grupo padrão definido. Contate o administrador.' };

  authState.users.push({
    id:           _authUid(),
    nomeCompleto: nomeCompleto.trim(),
    cpf:          (cpf    || '').trim(),
    cargo:        (cargo  || '').trim(),
    username:     username.trim(),
    passwordHash: _hashPwd(password),
    setores:      setores || [],
    grupoId:      defaultGroup.id,
    isAdmin:      false,
    ativo:        true,
    createdAt:    new Date().toISOString()
  });
  _saveAuth();
  return { ok: true };
}

function authUpdateUserProfile(userId, updates) {
  const idx = authState.users.findIndex(u => u.id === userId);
  if (idx < 0) return { ok: false, error: 'Usuário não encontrado.' };

  if (updates.password) {
    if (!updates.currentPassword)
      return { ok: false, error: 'Informe a senha atual para alterar a senha.' };
    if (authState.users[idx].passwordHash !== _hashPwd(updates.currentPassword))
      return { ok: false, error: 'Senha atual incorreta.' };
    if (updates.password !== updates.confirmPassword)
      return { ok: false, error: 'As senhas não conferem.' };
    if (updates.password.length < 4)
      return { ok: false, error: 'A senha deve ter ao menos 4 caracteres.' };
    authState.users[idx].passwordHash = _hashPwd(updates.password);
  }
  if (updates.setores !== undefined) {
    authState.users[idx].setores = updates.setores;
    if (currentSession?.userId === userId) {
      currentSession.setores = updates.setores;
      localStorage.setItem('auth-session', JSON.stringify(currentSession));
    }
  }
  _saveAuth();
  return { ok: true };
}

// ── RESTAURAR SESSÃO ─────────────────────────────────────────
function _restoreSession() {
  try {
    const s = JSON.parse(localStorage.getItem('auth-session'));
    if (!s?.userId) return false;
    const user = authState.users.find(u => u.id === s.userId && u.ativo !== false);
    if (!user) return false;
    currentSession = {
      userId:       user.id,
      username:     user.username,
      nomeCompleto: user.nomeCompleto,
      cargo:        user.cargo  || '',
      cpf:          user.cpf    || '',
      grupoId:      user.grupoId || null,
      isAdmin:      !!user.isAdmin,
      setores:      user.setores || [],
      loginAt:      s.loginAt || new Date().toISOString()
    };
    return true;
  } catch { return false; }
}

// ── ESTADO TEMPORÁRIO (seleção de setores) ───────────────────
let _sectorModalCallback = null;

// ── INICIALIZAÇÃO ─────────────────────────────────────────────
// ── Tela de erro de conexão ───────────────────────────────────
function _showConnectionError() {
  // Bloqueia qualquer acesso offline: fecha sessão e exibe tela de erro
  currentSession = null;
  document.body.classList.add('auth-locked');
  const overlay = document.getElementById('auth-overlay');
  if (overlay) overlay.style.display = 'flex';
  showAuthScreen('no-connection');
}

// ── INICIALIZAÇÃO ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  localStorage.removeItem('auth-session');

  // Aguarda Firebase SDK inicializar, depois aguarda confirmação de conexão real
  window._dbReady.then(() => {
    // Firebase .info/connected demora ~1-3s para confirmar; aguarda até 8s
    const _connTimeout = setTimeout(() => {
      if (!window._dbConnected) _showConnectionError();
    }, 8000);

    // Monitora mudanças de conexão durante toda a sessão
    window._onDbConnectionChange = (connected) => {
      if (connected) {
        clearTimeout(_connTimeout);
        _onFirebaseConnected();
      } else {
        // Perdeu conexão após estar online → bloqueia imediatamente
        if (_authInitialized) _showConnectionError();
      }
    };

    // Se já estava conectado antes do handler ser registrado
    if (window._dbConnected) {
      clearTimeout(_connTimeout);
      _onFirebaseConnected();
    }
  });
});

let _authInitialized = false;

// ── Sessão do Dados LAMIC ────────────────────────────────────
const DADOS_URL = 'https://laboratoriolamic.github.io/Dados/';
// Link "Manutenções" no Dados (módulo Operacional). Se o link for recriado, troque aqui
// e em firebase/database.rules.json (nó manutencao).
const MODULO_MANUT = '-P6y5YhNCv--m3yiKH3E', LINK_MANUT = '-P6y5YhNCv--m3yiKH3C';

function _authNomeChave(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}
const _authCpfDig = (c) => String(c || '').replace(/\D/g, '');

function _authTelaDados(titulo, msg) {
  currentSession = null;
  document.body.classList.add('auth-locked');
  _setTextEl('auth-dados-titulo', titulo);
  _setTextEl('auth-dados-msg', msg);
  showAuthScreen('dados');
}

function _authEsperarUsuario() {
  return new Promise(res => { const off = firebase.auth().onAuthStateChanged(u => { off(); res(u); }); });
}

// Acesso = mesmo critério do link "Manutenções" no Dados: admin, quem edita módulos
// ou grupo com o link liberado (grupo antigo sem a lista usa modulos/{m}/grupos/{g}).
async function _authTemAcessoDados(perfil) {
  if (perfil.grupo === 'admin') return true;
  if (!perfil.grupo) return false;
  const g = (await rootDb.ref(`grupos/${perfil.grupo}`).once('value')).val() || {};
  if (g.perms?.modulos_gerenciar === true) return true;
  if (g.links) return g.links[LINK_MANUT] === true;
  return (await rootDb.ref(`modulos/${MODULO_MANUT}/grupos/${perfil.grupo}`).once('value')).val() === true;
}

// Liga a conta do Dados ao usuário da Manutenção. O id do usuário NUNCA muda: lançamentos,
// assinaturas e trilhas guardam esse id. Ordem: vínculo já gravado → CPF → nome completo (único).
// Sem par: cria o usuário no grupo padrão. Retorna o usuário (ou null se não deu para gravar).
function _authVincularDados(login, perfil, cpf) {
  const livres = authState.users.filter(u => !u.dadosLogin);
  let u = authState.users.find(x => x.dadosLogin === login);
  if (!u && cpf) u = livres.find(x => _authCpfDig(x.cpf) === cpf);
  if (!u) {
    const m = livres.filter(x => _authNomeChave(x.nomeCompleto) === _authNomeChave(perfil.nome));
    if (m.length === 1) u = m[0];
  }
  let mudou = false;
  if (!u) {
    u = {
      id: _authUid(), nomeCompleto: perfil.nome || login, cpf: cpf ? formatCPF(cpf) : '', cargo: perfil.cargo || '',
      username: login, setores: [], grupoId: authGetDefaultGroup()?.id || null, isAdmin: false, ativo: true,
      createdAt: new Date().toISOString(), dadosLogin: login,
    };
    authState.users.push(u);
    mudou = true;
  } else {
    // Nome e login seguem o Dados; os registros antigos guardam o nome da época (assinatura)
    if (u.dadosLogin !== login) { u.dadosLogin = login; mudou = true; }
    if (u.username !== login) { u.username = login; mudou = true; }
    if (perfil.nome && u.nomeCompleto !== perfil.nome) { u.nomeCompleto = perfil.nome; mudou = true; }
    if (cpf && !_authCpfDig(u.cpf)) { u.cpf = formatCPF(cpf); mudou = true; }
  }
  // Administrador do Dados = administrador aqui
  if (perfil.grupo === 'admin' && !u.isAdmin) { u.isAdmin = true; mudou = true; }
  delete u.passwordHash;
  if (mudou) _saveAuth();
  return u;
}

function _authSessaoDe(u, perfil) {
  return {
    userId: u.id, username: u.username, nomeCompleto: u.nomeCompleto, cargo: u.cargo || '', cpf: u.cpf || '',
    grupoId: u.grupoId || null, isAdmin: !!u.isAdmin || perfil?.grupo === 'admin', setores: u.setores || [],
    loginAt: new Date().toISOString(), dadosLogin: u.dadosLogin,
  };
}

let _authPerfilDados = null;

async function _onFirebaseConnected() {
  if (_authInitialized) return; // já inicializou; reconexão não refaz login
  _authInitialized = true;

  const fu = await _authEsperarUsuario();
  if (!fu) return _authTelaDados('Entre pelo Dados LAMIC', 'A Manutenção usa o mesmo login e senha do Dados LAMIC. Entre por lá e abra a Manutenção novamente.');
  let login, perfil, cpf = '', data;
  try {
    login = (await rootDb.ref('uids/' + fu.uid).once('value')).val();
    perfil = login && (await rootDb.ref('usuarios/' + login).once('value')).val();
    if (!perfil || perfil.ativo !== true) return _authTelaDados('Sem acesso', 'Sua conta está desativada no Dados LAMIC.');
    if (!(await _authTemAcessoDados(perfil)))
      return _authTelaDados('Sem acesso', 'Seu grupo no Dados LAMIC não tem acesso à Manutenção. Peça a um administrador para liberar o link "Manutenções" no seu grupo (Dados LAMIC › Grupos e permissões).');
    try { cpf = _authCpfDig((await rootDb.ref(`privado/${login}/cpf`).once('value')).val()); } catch (e) { cpf = ''; }
    if (cpf === '00000000000') cpf = '';
    data = await window.dbGet(AUTH_KEY);
  } catch (err) {
    console.error('[key.js] sessão do Dados:', err);
    const perm = String(err && (err.code || err.message) || '').toLowerCase().includes('permission');
    return _authTelaDados('Erro ao conectar', perm
      ? 'Sem permissão no banco: publique as regras do Firebase (nó manutencao) e confira o link "Manutenções" do seu grupo.'
      : 'Não foi possível ler o banco de dados. Tente novamente.');
  }
  _authPerfilDados = perfil;
  _applyAuthData(data);
  const u = _authVincularDados(login, perfil, cpf);
  if (u.ativo === false && perfil.grupo !== 'admin')
    return _authTelaDados('Usuário inativo', 'Seu usuário está inativo na Manutenção. Fale com um administrador.');
  currentSession = _authSessaoDe(u, perfil);

  window.dbListen(AUTH_KEY, (liveData) => {
    _applyAuthData(liveData);
    // grupo/setores/admin alterados por outro administrador valem na hora
    const eu = currentSession && authState.users.find(x => x.id === currentSession.userId);
    if (eu) currentSession = { ..._authSessaoDe(eu, _authPerfilDados), loginAt: currentSession.loginAt };
    if (typeof renderUsersTable  === 'function') renderUsersTable();
    if (typeof renderGroupsTable === 'function') renderGroupsTable();
    if (currentSession) { _initTopbarSectorFilter(); applyPermissions(); }
  });

  _unlockApp();
}

function showAuthScreen(name) {
  if (name !== 'loading' && window.LamicCarregando) window.LamicCarregando.fim();
  document.querySelectorAll('.auth-screen').forEach(el => el.classList.remove('active'));
  const el = document.getElementById('auth-screen-' + name);
  if (el) el.classList.add('active');
  const overlay = document.getElementById('auth-overlay');
  if (overlay) overlay.style.display = 'flex';
  if (name === 'login')    _updateLoginButtons();
  if (name === 'register') _populateCargoSelect('reg-cargo', '');
}

// Paleta de cores para avatares
const _AVATAR_PALETTE = [
  '#2a9d8f','#00a8cc','#3f51b5','#9c27b0','#e91e63',
  '#ff9800','#4caf50','#795548','#607d8b','#e63946'
];

function _avatarColor(str) {
  if (!str) return 'var(--cyan)';
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = (h << 5) - h + str.charCodeAt(i); h |= 0; }
  return _AVATAR_PALETTE[Math.abs(h) % _AVATAR_PALETTE.length];
}

function _unlockApp() {
  if (window.LamicCarregando) window.LamicCarregando.fim();
  const overlay = document.getElementById('auth-overlay');
  if (overlay) overlay.style.display = 'none';
  document.body.classList.remove('auth-locked');
  _updateSidebarUser();
  applyPermissions();
  // Dispara refresh com timeout para garantir que o DOMContentLoaded do script.js já rodou
  setTimeout(() => {
    if (typeof atualizarSelects    === 'function') atualizarSelects();
    if (typeof refreshTaskFlagsUI  === 'function') refreshTaskFlagsUI();
    _initTopbarSectorFilter();
    // O Início pode ter sido desenhado antes da sessão existir: o CQ depende do usuário
    // (Áreas de que é membro) e o filtro de setores acabou de ser definido
    if (typeof _cqUpdateNavBadge   === 'function') _cqUpdateNavBadge();
    if (typeof renderHome          === 'function') renderHome();
  }, 60);
}

// Setores disponíveis para o usuário (considerando restrição de grupo)
function _getAvailableSetores() {
  const all = _authTodosSetorIds();
  const groupAllowed = authGetVisibleSetores();
  return groupAllowed ? all.filter(s => groupAllowed.includes(s)) : all;
}

// Filtro de setores ativo na sessão (null = não inicializado; array = setores selecionados)
let _topbarSetorFilter = null;

// Inicializa o filtro da topbar considerando o override por usuário
function _initTopbarSectorFilter() {
  const available = _getAvailableSetores(); // setores do grupo
  const userPref  = _authSessaoUserSetorIds(); // override individual configurado pelo admin
  if (userPref.length > 0) {
    // Aplica exatamente os setores do override (interseção com grupo por segurança)
    const intersection = available.filter(s => userPref.includes(s));
    // Se a interseção for vazia (setores do override não existem no grupo), usa todos do grupo
    _topbarSetorFilter = intersection.length > 0 ? intersection : [...available];
  } else {
    // Sem override: todos os setores do grupo ficam selecionados
    _topbarSetorFilter = [...available];
  }
  _updateTopbarSectorBtn();
}

// Atualiza o botão da topbar com o estado atual do filtro
function _updateTopbarSectorBtn() {
  const badge = document.getElementById('sector-filter-badge');
  const txt   = document.getElementById('sector-badge-text');
  if (!badge || !txt) return;
  badge.style.display = ''; // sempre visível após login
  const available = _getSelectableSetores();
  const selected  = Array.isArray(_topbarSetorFilter) ? _topbarSetorFilter : available;
  if (available.length === 0 || selected.length >= available.length) {
    txt.textContent = _authMigrado() ? 'Todas as unidades' : 'Todos os setores';
    badge.style.background = '';
    badge.style.borderColor = '';
  } else {
    txt.textContent = _authResumoSetores(selected, available);
    badge.style.background = 'rgba(0,168,204,0.25)';
    badge.style.borderColor = 'var(--cyan)';
  }
}

// Retorna os setores que o usuário atual pode selecionar no filtro da topbar
// (interseção entre setores do grupo e override individual configurado pelo admin)
function _getSelectableSetores() {
  const groupSetores = _getAvailableSetores();
  const userPref = _authSessaoUserSetorIds();
  if (userPref.length > 0) {
    return groupSetores.filter(s => userPref.includes(s));
  }
  return groupSetores;
}

// Abre o modal de seleção de setores para o filtro da topbar
function openTopbarSectorFilter() {
  const available = _getSelectableSetores();
  const current   = Array.isArray(_topbarSetorFilter) ? _topbarSetorFilter.filter(s => available.includes(s)) : available;
  _openSectorModal(current, function (sel) {
    _topbarSetorFilter = sel;
    _updateTopbarSectorBtn();
    if (typeof renderCards              === 'function') renderCards();
    if (typeof renderRotinasTable       === 'function') renderRotinasTable();
    if (typeof renderTarefasTable       === 'function') renderTarefasTable();
    if (typeof renderAtividadesTable    === 'function') renderAtividadesTable();
    if (typeof _otRenderKanban          === 'function') _otRenderKanban();
    if (typeof ocRender                 === 'function') ocRender();
    if (typeof cqRender                 === 'function') cqRender();
    if (typeof renderAgendaCalendario   === 'function') renderAgendaCalendario();
    if (typeof atualizarSelects         === 'function') atualizarSelects();
    if (typeof updateNotifBadge         === 'function') updateNotifBadge();
    if (typeof renderHome               === 'function') renderHome();
  }, available);
}

// Verifica se o usuário pode ver um ativo com base no filtro de unidades/setores ativo
function _userCanSeeAtivo(ativo) {
  if (!ativo) return false;
  // Setor responsável ou qualquer setor com que o ativo é compartilhado
  const ids = typeof _orgSetorIdsDoAtivo === 'function' ? _orgSetorIdsDoAtivo(ativo) : [];
  return ids.length ? ids.some(_userCanSeeSetor) : _userCanSeeSetor('');
}
// Mesmo critério para um setor (id) — OT/ocorrência sem ativo
function _userCanSeeSetor(setorId) {
  if (Array.isArray(_topbarSetorFilter)) {
    // Filtro inicializado: vazio = nenhum setor selecionado = não vê nada
    return _topbarSetorFilter.length > 0 && _topbarSetorFilter.includes(setorId);
  }
  // Filtro ainda não inicializado: usa setores disponíveis do grupo
  const available = _getAvailableSetores();
  return available.length === 0 || available.includes(setorId);
}

// Ids dos setores visíveis pelo filtro ativo da topbar
function _getFilteredSetores() {
  const all = _authTodosSetorIds();
  if (Array.isArray(_topbarSetorFilter)) {
    // Filtro inicializado: respeita exatamente a seleção (vazio = nenhum)
    return _topbarSetorFilter.length > 0 ? all.filter(s => _topbarSetorFilter.includes(s)) : [];
  }
  const available = _getAvailableSetores();
  return available.length > 0 ? all.filter(s => available.includes(s)) : all;
}

// Aplica visibilidade/estado de botões com base nas permissões do usuário logado
function applyPermissions() {
  if (!currentSession) return;

  function vis(id, show) {
    const el = document.getElementById(id);
    if (el) el.style.display = show ? '' : 'none';
  }

  const can = key => currentSession.isAdmin || authHasPermission(key);

  // FAB criar
  vis('fab-new-ativo',   can('ativos.criar'));
  vis('fab-new-rotina',  can('rotinas.criar'));
  vis('fab-new-tarefa',  can('tarefas.criar'));

  // Botões de editar setor, categoria e tipo
  vis('btn-editar-setor-toolbar',        can('ativos.editarSetor'));
  vis('btn-editar-setor-form',           can('ativos.editarSetor'));
  vis('btn-sector-modal-edit-setor',     can('ativos.editarSetor'));
  vis('btn-editar-categoria-form',  can('ativos.editarCategoria'));
  vis('btn-nova-categoria-toolbar', can('ativos.editarCategoria'));
  vis('btn-editar-tipo-rotina',    can('rotinas.editarTipo'));

  // Botões de config
  vis('btn-novo-usuario',  can('config.gerenciarUsuarios'));
  vis('btn-novo-grupo',    can('config.gerenciarGrupos'));
  vis('btn-nova-empresa',  can('config.gerenciarEmpresas'));

  // Config sub-nav
  const canUsers  = can('config.gerenciarUsuarios');
  const canGroups = can('config.gerenciarGrupos');
  const canBackup = can('config.backup');
  vis('cnav-usuario', canUsers);
  vis('cnav-grupos',  canGroups);
  vis('cnav-backup',  canBackup);
  vis('cnav-ocorrencias', authCanViewTab('ocorrencias'));
  vis('cnav-cq', can('cq.configurar'));
  vis('cnav-org', can('ativos.editarSetor'));

  // Config nav principal — controlado por 'visualizarConfig'
  const canConfig = can('config.visualizarConfig');
  vis('nav-config', canConfig);
  vis('nav-section-sistema', canConfig);

  // Abas principais — usa fallback true para grupos sem a permissão definida
  const canAtivos  = authCanViewTab('ativos');
  const canRotinas = authCanViewTab('rotina');
  const canOT      = authCanViewTab('os');
  const canOc      = authCanViewTab('ocorrencias');
  const canCQ      = authCanViewTab('cq');
  vis('nav-ativos', canAtivos);
  vis('nav-rotina', canRotinas);
  vis('nav-os',     canOT);
  vis('nav-ocorrencias', canOc);
  vis('nav-cq', canCQ);

  // Toggle de cadastro (apenas admin vê)
  vis('cfg-allow-registration-row', currentSession.isAdmin);

  // Se a aba config estiver ativa, navegar para o primeiro painel visível
  if (document.getElementById('tab-config')?.classList.contains('active')) {
    if (typeof _switchConfigTabFirst === 'function') _switchConfigTabFirst();
  }

  // Redirecionar para Início se a aba ativa ficou oculta
  const activeNavId = document.querySelector('.nav-item.active')?.id;
  const tabHiddenMap = { 'nav-ativos': !canAtivos, 'nav-rotina': !canRotinas, 'nav-os': !canOT, 'nav-ocorrencias': !canOc, 'nav-cq': !canCQ, 'nav-config': !canConfig };
  if (activeNavId && tabHiddenMap[activeNavId] && typeof switchTab === 'function') {
    switchTab('inicio');
  }
}

function _updateLoginButtons() {
  const btnReg = document.getElementById('btn-login-register');
  if (btnReg) btnReg.style.display = authIsRegistrationAllowed() ? '' : 'none';
}

function _updateSidebarUser() {
  if (!currentSession) return;
  const pill = document.getElementById('sidebar-user-pill');
  if (!pill) return;
  const initials = _getInitials(currentSession.nomeCompleto);
  const color    = _avatarColor(currentSession.username || currentSession.nomeCompleto);
  const role     = currentSession.isAdmin
    ? 'Administrador'
    : (currentSession.cargo || 'Usuário');
  pill.innerHTML = `
    <div class="user-avatar" style="background:${color};">${initials}</div>
    <div style="flex:1;min-width:0;overflow:hidden;">
      <div class="user-name" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${currentSession.nomeCompleto}</div>
      <div class="user-role">${role}</div>
    </div>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
      style="width:14px;height:14px;flex-shrink:0;opacity:.35;color:rgba(255,255,255,.6);">
      <circle cx="12" cy="8" r="4"/>
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
    </svg>`;
}

// ── FORMULÁRIO: LOGIN ─────────────────────────────────────────
function authDoLogin() {
  const username = (document.getElementById('login-username')?.value || '').trim();
  const password =  document.getElementById('login-password')?.value || '';
  if (!username || !password) {
    _showAuthError('login-error', 'Preencha todos os campos.');
    return;
  }
  const result = authLogin(username, password);
  if (result.ok) {
    document.getElementById('login-error').style.display = 'none';
    _unlockApp();
  } else {
    _showAuthError('login-error', result.error);
    const pwd = document.getElementById('login-password');
    if (pwd) { pwd.value = ''; pwd.focus(); }
  }
}

// ── FORMULÁRIO: CRIAR PRIMEIRO ADMIN ─────────────────────────
function authDoCreateAdmin() {
  const data = {
    nomeCompleto:    document.getElementById('admin-nome')?.value     || '',
    cpf:             document.getElementById('admin-cpf')?.value      || '',
    cargo:           document.getElementById('admin-cargo')?.value    || '',
    username:        document.getElementById('admin-username')?.value || '',
    password:        document.getElementById('admin-password')?.value || '',
    confirmPassword: document.getElementById('admin-confirm')?.value  || ''
  };
  const result = authCreateAdmin(data);
  if (result.ok) {
    document.getElementById('admin-error').style.display = 'none';
    const r = authLogin(data.username, data.password);
    if (r.ok) _unlockApp();
  } else {
    _showAuthError('admin-error', result.error);
  }
}

// ── FORMULÁRIO: CADASTRO ──────────────────────────────────────
function authDoRegister() {
  const data = {
    nomeCompleto:    document.getElementById('reg-nome')?.value     || '',
    cpf:             document.getElementById('reg-cpf')?.value      || '',
    cargo:           document.getElementById('reg-cargo')?.value    || '',
    username:        document.getElementById('reg-username')?.value || '',
    password:        document.getElementById('reg-password')?.value || '',
    confirmPassword: document.getElementById('reg-confirm')?.value  || ''
  };
  const result = authRegister(data);
  if (result.ok) {
    document.getElementById('reg-error').style.display = 'none';
    ['reg-nome','reg-cpf','reg-cargo','reg-username','reg-password','reg-confirm']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    showAuthScreen('login');
    setTimeout(() => {
      if (typeof showToast === 'function')
        showToast('Conta criada! Faça login para continuar.', 'success');
    }, 80);
  } else {
    _showAuthError('reg-error', result.error);
  }
}

// ── MODAL GENÉRICO DE SETORES ─────────────────────────────────
function _openSectorModal(currentSelected, callback, availableSetores) {
  _sectorModalCallback = callback;
  const ids = availableSetores || _authTodosSetorIds();
  const list = document.getElementById('sector-modal-list');
  if (!list) return;

  if (ids.length === 0) {
    list.innerHTML = `<div class="sector-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
      </svg>
      Nenhum setor cadastrado.<br>Cadastre unidades e setores no módulo Ativos primeiro.
    </div>`;
  } else {
    list.innerHTML = _authArvoreSetoresHTML(ids, currentSelected, '_updateSectorModalState');
  }
  _updateSectorModalState();
  document.getElementById('modal-sector-select')?.classList.add('open');
}

function _onSectorCheckChange(cb) {
  const card = cb.closest('.sector-check-card');
  if (card) card.classList.toggle('checked', cb.checked);
  _updateSectorModalState();
}

function _updateSectorModalState() {
  _authSincronizarUnidades('sector-modal-list');
  const all     = _authCaixasSetor('sector-modal-list');
  const n       = all.filter(c => c.checked).length;
  const total   = all.length;

  const countEl = document.getElementById('sector-modal-count');
  if (countEl) countEl.textContent = n === 0 ? 'Nenhum selecionado' : `${n} de ${total} selecionado${n !== 1 ? 's' : ''}`;

  const allBtn = document.getElementById('btn-sector-select-all');
  if (allBtn) {
    const isAll = total > 0 && n === total;
    allBtn.innerHTML = isAll
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:13px;height:13px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Desmarcar todos`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:13px;height:13px;"><polyline points="20 6 9 17 4 12"/></svg> Selecionar todos`;
  }

  const confirmBtn = document.getElementById('btn-confirm-sectors');
  if (confirmBtn) {
    confirmBtn.disabled = n === 0;
    confirmBtn.style.opacity = n === 0 ? '.45' : '';
    confirmBtn.style.cursor  = n === 0 ? 'not-allowed' : '';
  }
}

function toggleSelectAllSectors() {
  const checkboxes = _authCaixasSetor('sector-modal-list');
  const allChecked = checkboxes.every(c => c.checked);
  checkboxes.forEach(c => {
    c.checked = !allChecked;
    const card = c.closest('.sector-check-card');
    if (card) card.classList.toggle('checked', !allChecked);
  });
  _updateSectorModalState();
}

function closeSectorModal() {
  document.getElementById('modal-sector-select')?.classList.remove('open');
  _sectorModalCallback = null;
}

function confirmSectorModal() {
  const selected = _authCaixasSetor('sector-modal-list').filter(c => c.checked).map(c => c.value);
  if (selected.length === 0) {
    if (typeof showToast === 'function') showToast('Selecione ao menos 1 setor.', 'error');
    return;
  }
  if (_sectorModalCallback) _sectorModalCallback(selected);
  closeSectorModal();
}

// ── PERFIL DO USUÁRIO ─────────────────────────────────────────
function openUserProfileModal() {
  if (!currentSession) return;
  const user = authState.users.find(u => u.id === currentSession.userId);
  if (!user) return;

  _setTextEl('profile-nome',     user.nomeCompleto || '—');
  _setTextEl('profile-cpf',      user.cpf          || '—');
  _setTextEl('profile-cargo',    user.cargo        || '—');
  _setTextEl('profile-username', user.username     || '—');
  const grpName = user.isAdmin
    ? 'Administrador'
    : (authState.groups.find(g => g.id === user.grupoId)?.nome || '—');
  _setTextEl('profile-grupo', grpName);

  const curp = document.getElementById('profile-current-password');
  const np   = document.getElementById('profile-new-password');
  const cp   = document.getElementById('profile-confirm-password');
  if (curp) curp.value = '';
  if (np)   np.value   = '';
  if (cp)   cp.value   = '';

  const errEl = document.getElementById('profile-error');
  if (errEl) errEl.style.display = 'none';

  document.getElementById('modal-user-profile')?.classList.add('open');
  if (typeof closeSidebar === 'function') closeSidebar();
}

function closeUserProfileModal() {
  document.getElementById('modal-user-profile')?.classList.remove('open');
}

function saveUserProfile() {
  const curPwd  = document.getElementById('profile-current-password')?.value || '';
  const newPwd  = document.getElementById('profile-new-password')?.value     || '';
  const confPwd = document.getElementById('profile-confirm-password')?.value || '';
  const updates = {};
  if (newPwd) { _showAuthError('profile-error', 'A senha é a do Dados LAMIC: troque por lá (Meu perfil).'); return; }

  const result = authUpdateUserProfile(currentSession.userId, updates);
  if (result.ok) {
    document.getElementById('profile-error').style.display = 'none';
    closeUserProfileModal();
    _updateSidebarUser();
    _updateTopbarSectorBtn();
    if (typeof showToast === 'function')
      showToast('Perfil atualizado com sucesso!', 'success');
    if (typeof atualizarSelects   === 'function') atualizarSelects();
    if (typeof refreshTaskFlagsUI === 'function') refreshTaskFlagsUI();
  } else {
    _showAuthError('profile-error', result.error);
  }
}

// ── LOGOUT ────────────────────────────────────────────────────
async function authDoLogout() {
  if (typeof openModal === 'function') {
    openModal('modal-confirmar-logout');
  } else {
    if (!(await uiConfirmar({ icone: 'sair', titulo: 'Sair do sistema?', mensagem: 'Sua sessão será encerrada neste dispositivo.', confirmar: 'Sair' }))) return;
    authLogout();
  }
}

function _confirmarLogout() {
  if (typeof closeModal === 'function') closeModal('modal-confirmar-logout');
  authLogout();
}

// ── HELPERS DE UI ─────────────────────────────────────────────
function _showAuthError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
}

function _setTextEl(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// ═══════════════════════════════════════════════════════════════
// GERENCIAMENTO DE CARGOS
// ═══════════════════════════════════════════════════════════════

function _ensureCargos() {
  if (!Array.isArray(authState.cargos)) authState.cargos = [];
}

function authGetCargos() {
  _ensureCargos();
  return [...authState.cargos].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function authAddCargo(nome) {
  _ensureCargos();
  const n = (nome || '').trim();
  if (!n) return { ok: false, error: 'Informe o nome do cargo.' };
  if (authState.cargos.includes(n)) return { ok: false, error: 'Cargo já cadastrado.' };
  authState.cargos.push(n);
  authState.cargos.sort((a, b) => a.localeCompare(b, 'pt-BR'));
  _saveAuth();
  return { ok: true };
}

function authEditCargo(oldName, newName) {
  _ensureCargos();
  const n = (newName || '').trim();
  if (!n) return { ok: false, error: 'Informe o nome do cargo.' };
  if (n === oldName) return { ok: true };
  if (authState.cargos.includes(n)) return { ok: false, error: 'Cargo já cadastrado.' };
  const idx = authState.cargos.indexOf(oldName);
  if (idx < 0) return { ok: false, error: 'Cargo não encontrado.' };
  authState.cargos[idx] = n;
  // Atualiza todos os usuários com esse cargo
  authState.users.forEach(u => { if (u.cargo === oldName) u.cargo = n; });
  // Atualiza sessão atual se necessário
  if (currentSession?.cargo === oldName) {
    currentSession.cargo = n;
    localStorage.setItem('auth-session', JSON.stringify(currentSession));
    _updateSidebarUser();
  }
  authState.cargos.sort((a, b) => a.localeCompare(b, 'pt-BR'));
  _saveAuth();
  return { ok: true };
}

function authDeleteCargo(nome) {
  _ensureCargos();
  const count = authState.users.filter(u => u.cargo === nome).length;
  if (count > 0)
    return { ok: false, error: `${count} usuário(s) usa(m) este cargo. Altere-os antes de excluir.` };
  authState.cargos = authState.cargos.filter(c => c !== nome);
  _saveAuth();
  return { ok: true };
}

// Popula um <select> com os cargos cadastrados
function _populateCargoSelect(selectId, currentValue) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const cargos = authGetCargos();
  sel.innerHTML = '<option value="">— Sem cargo —</option>' +
    cargos.map(c =>
      `<option value="${c}"${c === currentValue ? ' selected' : ''}>${c}</option>`
    ).join('');
}

// ── Modal de gerenciamento de cargos ────────────────────────
let _cargoEditingOldName = null;
let _cargoOpenedFrom     = null; // 'user-edit' | 'register'

function openCargosModal(from) {
  _cargoEditingOldName = null;
  _cargoOpenedFrom     = from || 'user-edit';
  document.getElementById('cargos-error').style.display = 'none';
  document.getElementById('cargo-input').value = '';
  const lbl = document.getElementById('cargo-save-label');
  if (lbl) lbl.textContent = 'Adicionar';
  _renderCargosModal();
  document.getElementById('modal-cargos-manage')?.classList.add('open');
}

function closeCargosModal() {
  document.getElementById('modal-cargos-manage')?.classList.remove('open');
  // Recarrega o select de origem
  if (_cargoOpenedFrom === 'register') {
    _populateCargoSelect('reg-cargo', document.getElementById('reg-cargo')?.value || '');
  } else {
    _populateCargoSelect('user-edit-cargo', document.getElementById('user-edit-cargo')?.value || '');
  }
  _cargoOpenedFrom = null;
}

function _renderCargosModal() {
  const list  = document.getElementById('cargos-list');
  const errEl = document.getElementById('cargos-error');
  if (errEl) errEl.style.display = 'none';
  if (!list) return;
  const cargos = authGetCargos();
  if (cargos.length === 0) {
    list.innerHTML = `<div style="padding:18px;text-align:center;color:var(--text-muted);font-size:13px;">
      Nenhum cargo cadastrado ainda.
    </div>`;
    return;
  }
  list.innerHTML = cargos.map(c => `
    <div class="cargo-row">
      <span class="cargo-name">${c}</span>
      <div style="display:flex;gap:4px;">
        <button class="btn btn-outline btn-icon" onclick='startEditCargo(${JSON.stringify(c)})' title="Editar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;">
            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/>
          </svg>
        </button>
        <button class="btn btn-outline btn-icon" onclick='doDeleteCargo(${JSON.stringify(c)})' title="Excluir"
          style="color:var(--red);border-color:rgba(230,57,70,.3);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
          </svg>
        </button>
      </div>
    </div>`).join('');
}

function startEditCargo(nome) {
  _cargoEditingOldName = nome;
  const input = document.getElementById('cargo-input');
  if (input) { input.value = nome; input.focus(); input.select(); }
  _setTextEl('cargo-save-label', 'Atualizar');
  _setTextEl('cargo-form-label', 'Editar cargo');
  const cancelBtn = document.getElementById('btn-cancel-cargo-edit');
  if (cancelBtn) cancelBtn.style.display = '';
  document.getElementById('cargos-error').style.display = 'none';
}

function cancelEditCargo() {
  _cargoEditingOldName = null;
  const input = document.getElementById('cargo-input');
  if (input) input.value = '';
  _setTextEl('cargo-save-label', 'Adicionar');
  _setTextEl('cargo-form-label', 'Novo cargo');
  const cancelBtn = document.getElementById('btn-cancel-cargo-edit');
  if (cancelBtn) cancelBtn.style.display = 'none';
  document.getElementById('cargos-error').style.display = 'none';
}

function doSaveCargo() {
  const nome = (document.getElementById('cargo-input')?.value || '').trim();
  const wasEditing = !!_cargoEditingOldName;
  const result = wasEditing
    ? authEditCargo(_cargoEditingOldName, nome)
    : authAddCargo(nome);

  if (result.ok) {
    _cargoEditingOldName = null;
    document.getElementById('cargo-input').value = '';
    const lbl = document.getElementById('cargo-save-label');
    if (lbl) lbl.textContent = 'Adicionar';
    document.getElementById('cargos-error').style.display = 'none';
    _renderCargosModal();
    if (typeof showToast === 'function')
      showToast(wasEditing ? 'Cargo atualizado em todos os usuários!' : 'Cargo adicionado!', 'success');
  } else {
    _showAuthError('cargos-error', result.error);
  }
}

function doDeleteCargo(nome) {
  const result = authDeleteCargo(nome);
  if (result.ok) {
    _renderCargosModal();
    if (typeof showToast === 'function') showToast('Cargo excluído.', 'success');
  } else {
    _showAuthError('cargos-error', result.error);
  }
}

// ═══════════════════════════════════════════════════════════════
// GERENCIAMENTO DE USUÁRIOS (admin)
// ═══════════════════════════════════════════════════════════════

let _userEditId          = null;
let _userEditIsAdmin     = false;
let _userEditSetoresTemp = []; // [] = sem override (usa todos do grupo)
let _usersFilter         = 'ativo';

function toggleUserEditAdmin() {
  if (!currentSession?.isAdmin) return;
  _userEditIsAdmin = !_userEditIsAdmin;
  updateUserEditAdminButton();
}

function updateUserEditAdminButton() {
  const btn      = document.getElementById('btn-user-edit-admin');
  const grupoSel = document.getElementById('user-edit-grupo');
  const grupoReq = document.getElementById('user-edit-grupo-req');
  if (!btn) return;

  // Só exibe o botão se o admin logado estiver editando outro usuário
  const isEditingSelf = _userEditId === currentSession?.userId;
  if (!currentSession?.isAdmin || isEditingSelf) {
    btn.style.display = 'none';
    return;
  }
  btn.style.display = '';

  if (_userEditIsAdmin) {
    btn.title     = 'Remover administrador';
    btn.className = 'btn btn-primary btn-icon user-admin-toggle-btn';
    btn.style.cssText = 'flex-shrink:0;padding:0 10px;min-width:36px;background:var(--cyan);border-color:var(--cyan);';
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px;">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>`;
    // Admin não precisa de grupo
    if (grupoSel) { grupoSel.disabled = true; grupoSel.value = ''; }
    if (grupoReq) grupoReq.style.display = 'none';
  } else {
    btn.title     = 'Promover a administrador';
    btn.className = 'btn btn-outline btn-icon user-admin-toggle-btn';
    btn.style.cssText = 'flex-shrink:0;padding:0 10px;min-width:36px;';
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px;">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>`;
    if (grupoSel) grupoSel.disabled = false;
    if (grupoReq) grupoReq.style.display = '';
  }
}

async function promoteAdmin(id) {
  const u = authState.users.find(u => u.id === id);
  if (!u || !currentSession?.isAdmin || u.id === currentSession.userId) return;
  if (!(await uiConfirmar({
    tipo: 'info', titulo: 'Promover a administrador?', confirmar: 'Promover',
    mensagem: `<b>${uiEsc(u.nomeCompleto)}</b> terá acesso total ao sistema, inclusive a usuários e permissões.`,
  }))) return;
  u.isAdmin = true;
  _saveAuth();
  renderUsersTable();
  if (typeof showToast === 'function') showToast(`${u.nomeCompleto} agora é administrador.`, 'success');
}

async function demoteAdmin(id) {
  const u = authState.users.find(u => u.id === id);
  if (!u || !currentSession?.isAdmin || u.id === currentSession.userId) return;
  if (!(await uiConfirmar({
    titulo: 'Remover administrador?', confirmar: 'Remover permissão',
    mensagem: `<b>${uiEsc(u.nomeCompleto)}</b> deixa de ser administrador e passa a seguir as permissões do grupo.`,
  }))) return;
  u.isAdmin = false;
  _saveAuth();
  renderUsersTable();
  if (typeof showToast === 'function') showToast(`Permissão de administrador removida de ${u.nomeCompleto}.`, 'info');
}

function renderUsersTable() {
  const tbody = document.getElementById('users-tbody');
  if (!tbody) return;

  renderRegistrationToggle();

  const meId = currentSession?.userId;

  const sorted = [...authState.users]
    .filter(u => {
      if (_usersFilter === 'ativo')   return u.ativo !== false;
      if (_usersFilter === 'inativo') return u.ativo === false;
      return true;
    })
    .sort((a, b) => {
      if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;
      return a.nomeCompleto.localeCompare(b.nomeCompleto, 'pt-BR');
    });

  if (sorted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="data-table-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
      </svg>
      <strong>Nenhum usuário ${_usersFilter === 'ativo' ? 'ativo' : _usersFilter === 'inativo' ? 'inativo' : 'cadastrado'}</strong>
    </div></td></tr>`;
    return;
  }

  tbody.innerHTML = sorted.map(u => {
    const isMe      = u.id === meId;
    const initials  = _getInitials(u.nomeCompleto);
    const avatarClr = _avatarColor(u.username || u.nomeCompleto);
    const grpName   = u.isAdmin
      ? '<span class="chip chip-cyan" style="font-size:10px;">Admin</span>'
      : `<span class="chip chip-gray" style="font-size:10.5px;">${authState.groups.find(g => g.id === u.grupoId)?.nome || '—'}</span>`;
    const statusChip = u.ativo !== false
      ? '<span class="chip chip-green">Ativo</span>'
      : '<span class="chip chip-gray">Inativo</span>';
    const canManageUsers = currentSession?.isAdmin || authHasPermission('config.gerenciarUsuarios');
    const canDelete   = canManageUsers && !isMe && !u.isAdmin;
    const canDemote   = u.isAdmin && !isMe && currentSession?.isAdmin;

    const adminBtn = canDemote
      ? `<button class="btn btn-outline btn-icon" onclick="demoteAdmin('${u.id}')" title="Remover administrador"
          style="color:var(--amber);border-color:rgba(255,183,3,.3);margin-left:4px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <line x1="4" y1="4" x2="20" y2="20" stroke-width="2.5"/>
          </svg>
        </button>`
      : '';

    return `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="cfg-user-avatar" style="background:${avatarClr};">${initials}</div>
          <div>
            <div style="font-weight:600;font-size:13px;">${u.nomeCompleto}${isMe ? '<span style="font-size:10px;color:var(--cyan);font-weight:700;margin-left:6px;">Você</span>' : ''}</div>
            <div style="font-size:11px;color:var(--text-muted);font-family:\'DM Mono\',monospace;">${u.username}</div>
          </div>
        </div>
      </td>
      <td style="font-size:12px;color:var(--text-secondary);">${u.cpf || '—'}</td>
      <td style="font-size:12.5px;color:var(--text-secondary);">${u.cargo || '—'}</td>
      <td>${grpName}</td>
      <td>${statusChip}</td>
      <td style="text-align:right;white-space:nowrap;">
        ${canManageUsers ? `<button class="btn btn-outline btn-icon" onclick="openUserEditModal('${u.id}')" title="Editar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;">
            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/>
          </svg>
        </button>` : ''}
        ${adminBtn}
        <button class="btn btn-outline btn-icon" onclick="deleteUser('${u.id}')" title="Excluir"
          style="color:var(--red);border-color:rgba(230,57,70,.3);margin-left:4px;"
          ${!canDelete ? 'disabled style="opacity:.25;cursor:not-allowed;color:var(--red);border-color:rgba(230,57,70,.3);margin-left:4px;"' : ''}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
          </svg>
        </button>
      </td>
    </tr>`;
  }).join('');
}

function renderRegistrationToggle() {
  const btn = document.getElementById('btn-toggle-registration');
  if (!btn) return;
  btn.classList.toggle('cfg-toggle-on', authIsRegistrationAllowed());
}

function setUsersFilter(filter) {
  _usersFilter = filter;
  ['ativo','inativo','ambos'].forEach(f => {
    const btn = document.getElementById('sfbtn-user-' + f);
    if (!btn) return;
    btn.classList.toggle('active',       f === filter);
    btn.classList.toggle('active-green', f === filter);
  });
  renderUsersTable();
}

function toggleAllowRegistration() {
  if (typeof showToast === 'function') showToast('Sem cadastro próprio: os usuários vêm do Dados LAMIC.', 'info'); return;
  authState.allowRegistration = !authState.allowRegistration;
  _saveAuth();
  renderRegistrationToggle();
  _updateLoginButtons();
  if (typeof showToast === 'function')
    showToast(authState.allowRegistration
      ? 'Criação de contas habilitada.' : 'Criação de contas desabilitada.', 'info');
}

// ── Modal criar/editar usuário ───────────────────────────────
function openUserEditModal(id) {
  if (currentSession && !currentSession.isAdmin && !authHasPermission('config.gerenciarUsuarios')) {
    if (typeof showToast === 'function') showToast('Você não tem permissão para gerenciar usuários.', 'error');
    return;
  }
  if (!id) { if (typeof showToast === 'function') showToast('Usuários são criados no Dados LAMIC. No primeiro acesso entram no grupo padrão.', 'info'); return; }
  _userEditId = id || null;

  const errEl = document.getElementById('user-edit-error');
  if (errEl) errEl.style.display = 'none';
  document.getElementById('user-edit-modal-title').textContent = id ? 'Editar Usuário' : 'Novo Usuário';

  // Label de senha obrigatória
  const reqLabel = document.getElementById('user-pwd-req-label');
  if (reqLabel) reqLabel.style.display = id ? 'none' : 'inline';

  // Popula select de grupos
  const groupSel = document.getElementById('user-edit-grupo');
  if (groupSel) {
    groupSel.innerHTML = '<option value="">— Selecione um grupo —</option>' +
      authState.groups.map(g =>
        `<option value="${g.id}">${g.nome}${g.isDefault ? ' ★' : ''}</option>`
      ).join('');
    groupSel.disabled = false;
  }

  _populateCargoSelect('user-edit-cargo', '');

  if (id) {
    const u = authState.users.find(u => u.id === id);
    if (!u) return;
    document.getElementById('user-edit-nome').value      = u.nomeCompleto || '';
    document.getElementById('user-edit-cpf').value       = u.cpf          || '';
    _populateCargoSelect('user-edit-cargo', u.cargo || '');
    document.getElementById('user-edit-username').value  = u.username     || '';
    document.getElementById('user-edit-password').value  = '';
    document.getElementById('user-edit-confirm').value   = '';
    if (groupSel) { groupSel.value = u.grupoId || ''; }
    const statusEl = document.getElementById('user-edit-status');
    if (statusEl) {
      statusEl.checked = u.ativo !== false;
      const isSelf = currentSession?.userId === id;
      statusEl.disabled = isSelf;
      const statusHint = document.getElementById('user-edit-status-self-hint');
      if (statusHint) statusHint.style.display = isSelf ? 'inline' : 'none';
    }
    _userEditIsAdmin = !!u.isAdmin;
    _userEditSetoresTemp = _authUserSetorIds(u);
  } else {
    ['user-edit-nome','user-edit-cpf','user-edit-cargo','user-edit-username',
     'user-edit-password','user-edit-confirm'].forEach(elId => {
      const el = document.getElementById(elId);
      if (el) el.value = '';
    });
    if (groupSel) groupSel.disabled = false;
    const statusEl2 = document.getElementById('user-edit-status');
    if (statusEl2) { statusEl2.checked = true; statusEl2.disabled = false; }
    const statusHint2 = document.getElementById('user-edit-status-self-hint');
    if (statusHint2) statusHint2.style.display = 'none';
    _userEditIsAdmin = false;
    _userEditSetoresTemp = [];
  }
  // Nome, CPF e login vêm do Dados LAMIC (vinculado); senha é a do Dados
  const vinc = !!authState.users.find(x => x.id === id)?.dadosLogin;
  ['user-edit-nome', 'user-edit-cpf', 'user-edit-username'].forEach(i => {
    const el = document.getElementById(i);
    if (el) { el.readOnly = vinc; el.style.opacity = vinc ? '.65' : ''; el.title = vinc ? 'Vem do Dados LAMIC' : ''; }
  });
  ['user-edit-password', 'user-edit-confirm'].forEach(i => {
    const el = document.getElementById(i);
    const campo = el?.closest('.form-field');
    if (campo) campo.style.display = 'none';
  });
  updateUserEditStatusLabel();
  _updateUserEditSetoresBtn();
  updateUserEditAdminButton();
  document.getElementById('modal-user-edit')?.classList.add('open');
}

function closeUserEditModal() {
  document.getElementById('modal-user-edit')?.classList.remove('open');
}

// Retorna os setores disponíveis para o grupo selecionado no modal de edição
function _getUserEditAvailableSetores() {
  const all = _authTodosSetorIds();
  const grupoId = document.getElementById('user-edit-grupo')?.value || '';
  if (!grupoId) return all;
  const g = authState.groups.find(g => g.id === grupoId);
  const permitidos = _authGrupoSetorIds(g);
  return permitidos ? all.filter(s => permitidos.includes(s)) : all;
}

function _onUserEditGrupoChange() {
  // Ao trocar de grupo, zera o override para herdar os setores do novo grupo
  _userEditSetoresTemp = [];
  _updateUserEditSetoresBtn();
}

function openUserEditSectorModal() {
  const available = _getUserEditAvailableSetores();
  if (available.length === 0) {
    if (typeof showToast === 'function') showToast('Selecione um grupo primeiro.', 'error');
    return;
  }
  // Se não tem override, pré-seleciona todos os disponíveis
  const current = _userEditSetoresTemp.length > 0
    ? _userEditSetoresTemp.filter(s => available.includes(s))
    : [...available];
  _openSectorModal(current, function (sel) {
    // Se selecionou todos, não guarda override (significa "todos do grupo")
    _userEditSetoresTemp = sel.length === available.length ? [] : sel;
    _updateUserEditSetoresBtn();
  }, available);
}

function _updateUserEditSetoresBtn() {
  const lbl = document.getElementById('user-edit-setores-label');
  if (!lbl) return;
  const available = _getUserEditAvailableSetores();
  const n = _userEditSetoresTemp.length;
  if (n === 0 || n >= available.length) {
    lbl.textContent = available.length > 0 ? `Todos (${available.length})` : 'Todos do grupo';
  } else {
    lbl.textContent = _authResumoSetores(_userEditSetoresTemp.filter(s => available.includes(s)), available);
  }
}

function updateUserEditStatusLabel() {
  const t = document.getElementById('user-edit-status');
  const l = document.getElementById('user-edit-status-label');
  if (t && l) l.textContent = t.checked ? 'Ativo' : 'Inativo';
}

let _authUsuarioOriginal = null;
function saveUserEdit() {
  { const o = authState.users.find(x => x.id === _userEditId); _authUsuarioOriginal = o ? { nomeCompleto: o.nomeCompleto, cpf: o.cpf, username: o.username } : null; }
  if (currentSession && !currentSession.isAdmin && !authHasPermission('config.gerenciarUsuarios')) {
    if (typeof showToast === 'function') showToast('Você não tem permissão para gerenciar usuários.', 'error');
    return;
  }
  const nome     = (document.getElementById('user-edit-nome')?.value     || '').trim();
  const cpf      = (document.getElementById('user-edit-cpf')?.value      || '').trim();
  const cargo    = (document.getElementById('user-edit-cargo')?.value    || '').trim();
  const username = (document.getElementById('user-edit-username')?.value || '').trim();
  const pwd      = document.getElementById('user-edit-password')?.value  || '';
  const conf     = document.getElementById('user-edit-confirm')?.value   || '';
  const grupoId  = document.getElementById('user-edit-grupo')?.value     || null;
  const isSelf   = _userEditId && currentSession?.userId === _userEditId;
  const ativo    = isSelf ? true : (document.getElementById('user-edit-status')?.checked !== false);

  if (!nome)     { _showAuthError('user-edit-error', 'Informe o nome completo.'); return; }
  if (!username) { _showAuthError('user-edit-error', 'Informe o nome de usuário.'); return; }
  if (!_userEditId) return;   // sem criação manual: usuários vêm do Dados LAMIC
  if (!_userEditIsAdmin && !grupoId) { _showAuthError('user-edit-error', 'Selecione um grupo para o usuário.'); return; }
  if (authState.users.some(u => u.username.toLowerCase() === username.toLowerCase() && u.id !== _userEditId))
    { _showAuthError('user-edit-error', 'Nome de usuário já em uso.'); return; }
  if (pwd) {
    if (pwd !== conf)      { _showAuthError('user-edit-error', 'As senhas não conferem.'); return; }
    if (pwd.length < 4)    { _showAuthError('user-edit-error', 'Senha deve ter ao menos 4 caracteres.'); return; }
  }

  if (_userEditId) {
    const idx = authState.users.findIndex(u => u.id === _userEditId);
    if (idx < 0) return;
    const u = authState.users[idx];
    u.nomeCompleto = nome; u.cpf = cpf; u.cargo = cargo; u.username = username;
    _authGravarUserSetores(u, _userEditSetoresTemp);
    u.ativo = ativo;
    if (!u.isAdmin) {
      u.grupoId = grupoId || null;
      if (_userEditIsAdmin) u.isAdmin = true;
    }
    if (u.dadosLogin) { const o = _authUsuarioOriginal; if (o) { u.nomeCompleto = o.nomeCompleto; u.cpf = o.cpf; u.username = o.username; } }
    // Refresh session if editing self
    if (currentSession?.userId === _userEditId) {
      currentSession.nomeCompleto = nome; currentSession.cargo = cargo;
      currentSession.setores = _userEditSetoresTemp.slice();
      if (grupoId) currentSession.grupoId = grupoId;
      localStorage.setItem('auth-session', JSON.stringify(currentSession));
      _updateSidebarUser();
      _initTopbarSectorFilter(); // reinicializa filtro com novos setores
    }
  } else {
    const novo = {
      id: _authUid(), nomeCompleto: nome, cpf, cargo, username,
      passwordHash: _hashPwd(pwd),
      setores: [],
      grupoId: grupoId || null, isAdmin: _userEditIsAdmin, ativo,
      createdAt: new Date().toISOString()
    };
    _authGravarUserSetores(novo, _userEditSetoresTemp);
    authState.users.push(novo);
  }
  _saveAuth();
  closeUserEditModal();
  renderUsersTable();
  if (typeof showToast === 'function')
    showToast(_userEditId ? 'Usuário atualizado!' : 'Usuário criado!', 'success');
}

async function deleteUser(id) {
  if (currentSession && !currentSession.isAdmin && !authHasPermission('config.gerenciarUsuarios')) {
    if (typeof showToast === 'function') showToast('Você não tem permissão para excluir usuários.', 'error');
    return;
  }
  const u = authState.users.find(u => u.id === id);
  if (!u) return;
  if (u.isAdmin) { if (typeof showToast==='function') showToast('Não é possível excluir o administrador.', 'error'); return; }
  if (u.id === currentSession?.userId) { if (typeof showToast==='function') showToast('Você não pode excluir sua própria conta.', 'error'); return; }
  if (!(await uiConfirmar({
    tipo: 'perigo', titulo: 'Excluir usuário?', confirmar: 'Excluir',
    mensagem: `O usuário <b>${uiEsc(u.nomeCompleto)}</b> perderá o acesso ao sistema.`,
    detalhe: 'Esta ação não pode ser desfeita.',
  }))) return;
  authState.users = authState.users.filter(u => u.id !== id);
  _saveAuth();
  renderUsersTable();
  if (typeof showToast === 'function') showToast('Usuário excluído.', 'success');
}

// ═══════════════════════════════════════════════════════════════
// GERENCIAMENTO DE GRUPOS (admin)
// ═══════════════════════════════════════════════════════════════

const PERM_STRUCTURE = {
  ativos:     { label: 'Ativos',           keys: ['visualizar','criar','editar','excluir','editarSetor','editarCategoria'] },
  rotinas:    { label: 'Rotinas',          keys: ['visualizar','criar','editar','excluir','editarTipo'] },
  tarefas:    { label: 'Tarefas',          keys: ['criar','editar','excluir','publicar'] },
  atividades: { label: 'Atividades',       keys: ['editar','excluir','gerenciarAnexos'] },
  ot:         { label: 'OT',               keys: ['visualizar','criarOT','editarOT','excluirOT','alterarStatus','realizarPublicacoes','editarPublicacoes','excluirPublicacoes'] },
  ocorrencias:{ label: 'Ocorrências',      keys: ['visualizar','registrar','editar','tratar','liberarAtivo','encerrar','cancelar'] },
  cq:         { label: 'Controle de Qualidade', keys: ['visualizar','lancar','liberar','configurar','editarCadastros','definirAlvos','ceq','revisar','relatorios','invalidar'] },
  config:    { label: 'Configurações',    keys: ['visualizarConfig','backup','gerenciarUsuarios','gerenciarGrupos','gerenciarEmpresas'] }
};

const PERM_LABELS = {
  visualizar:'Visualizar aba',
  criar:'Criar', editar:'Editar', excluir:'Excluir', gerenciarAnexos:'Gerenciar Anexos', publicar:'Publicar',
  editarSetor:'Editar setores', editarCategoria:'Editar categorias', editarTipo:'Editar tipos',
  criarOT:'Criar OT', editarOT:'Editar OT', excluirOT:'Excluir OT',
  alterarStatus:'Alterar Status',
  realizarPublicacoes:'Realizar Publicações',
  editarPublicacoes:'Editar Publicações',
  excluirPublicacoes:'Excluir Publicações',
  registrar:'Registrar', tratar:'Tratar (impacto, causa, ações)', liberarAtivo:'Liberar ativo para uso',
  encerrar:'Encerrar / reabrir', cancelar:'Cancelar',
  lancar:'Lançar corridas de controle', liberar:'Avaliar / liberar corridas', configurar:'Cadastros e áreas de CQ', editarCadastros:'Editar cadastros, criar lotes e excluir cadastro sem vínculo',
  definirAlvos:'Definir médias, DP e regras', ceq:'Controle externo (CEQ)', revisar:'Revisão mensal / análise crítica',
  relatorios:'Relatórios de CQ', invalidar:'Corrigir / invalidar resultados',
  visualizarConfig:'Visualizar configurações', backup:'Backup',
  gerenciarUsuarios:'Gerenciar usuários', gerenciarGrupos:'Gerenciar grupos',
  gerenciarEmpresas:'Gerenciar empresas'
};

function _emptyPermissoes() {
  const p = {};
  for (const [cat, { keys }] of Object.entries(PERM_STRUCTURE)) {
    p[cat] = {};
    keys.forEach(k => { p[cat][k] = false; });
  }
  return p;
}

let _groupEditId = null;

function renderGroupsTable() {
  const tbody = document.getElementById('groups-tbody');
  if (!tbody) return;

  if (authState.groups.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="data-table-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="9" cy="7" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6"/>
        <circle cx="17" cy="7" r="3"/><path d="M21 20c0-3.3-2.7-6-6-6"/>
      </svg>
      <strong>Nenhum grupo cadastrado</strong>
      <p>Crie grupos para gerenciar permissões de usuários</p>
    </div></td></tr>`;
    return;
  }

  tbody.innerHTML = authState.groups.map(g => {
    const memberCount = authState.users.filter(u => u.grupoId === g.id).length;
    const defaultCell = g.isDefault
      ? '<span class="chip chip-cyan" style="font-size:10px;">Padrão</span>'
      : `<button class="btn btn-outline" style="font-size:11px;padding:3px 10px;min-height:0;height:26px;"
           onclick="setGroupDefault('${g.id}')">Definir padrão</button>`;
    return `<tr>
      <td style="font-weight:600;font-size:13px;">${g.nome}</td>
      <td><span class="chip chip-gray">${memberCount} membro${memberCount!==1?'s':''}</span></td>
      <td>${defaultCell}</td>
      <td style="text-align:right;white-space:nowrap;">
        <button class="btn btn-outline" onclick="openGroupSectorModal('${g.id}')" title="Permissão de Setores"
          style="font-size:11px;padding:3px 10px;min-height:0;height:26px;gap:5px;margin-right:4px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
          </svg>
          ${_authEsc(_authResumoGrupo(g))}
        </button>
        <button class="btn btn-outline btn-icon" onclick="openGroupEditModal('${g.id}')" title="Editar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;">
            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/>
          </svg>
        </button>
        <button class="btn btn-outline btn-icon" onclick="deleteGroup('${g.id}')" title="Excluir"
          style="color:var(--red);border-color:rgba(230,57,70,.3);margin-left:4px;"
          ${g.isDefault ? 'disabled' : ''}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
          </svg>
        </button>
      </td>
    </tr>`;
  }).join('');
}

let _groupSectorEditId = null;
let _groupSectorTemp = [];

// Rótulo do botão de acesso do grupo
function _authResumoGrupo(g) {
  const un = (g.unidadeIdsPermitidas || []).length;
  const st = _authIdsGravados(g.setorIdsPermitidos, g.setoresPermitidos).length;
  if (!un && !st) return _authMigrado() ? 'Acesso: todas as unidades' : 'Setores: todos';
  return 'Acesso: ' + [un ? `${un} unidade${un !== 1 ? 's' : ''}` : '', st ? `${st} setor${st !== 1 ? 'es' : ''}` : ''].filter(Boolean).join(' + ');
}

function openGroupSectorModal(groupId) {
  const g = authState.groups.find(g => g.id === groupId);
  if (!g) return;
  _groupSectorEditId = groupId;

  const ids = _authTodosSetorIds();
  const permitidos = _authGrupoSetorIds(g);
  _groupSectorTemp = permitidos ? permitidos.slice() : [];
  const list = document.getElementById('group-sector-list');
  if (!list) return;

  if (ids.length === 0) {
    list.innerHTML = `<div class="data-table-empty" style="padding:24px;">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/></svg>
      <strong>Nenhum setor cadastrado</strong>
    </div>`;
  } else {
    list.innerHTML = _authArvoreSetoresHTML(ids, permitidos || ids, '_onGroupSectorCheck');
  }

  const titleEl = document.getElementById('group-sector-modal-title');
  if (titleEl) titleEl.textContent = `${_authMigrado() ? 'Unidades e setores' : 'Setores'} — ${g.nome}`;
  _authSincronizarUnidades('group-sector-list');
  _updateGroupSectorCount();
  document.getElementById('modal-group-sector')?.classList.add('open');
}

function _onGroupSectorCheck() {
  _authSincronizarUnidades('group-sector-list');
  const checkboxes = _authCaixasSetor('group-sector-list');
  const allChecked = checkboxes.every(c => c.checked);
  _groupSectorTemp = allChecked ? [] : checkboxes.filter(c => c.checked).map(c => c.value);
  _updateGroupSectorCount();
}

function _updateGroupSectorCount() {
  const checkboxes = _authCaixasSetor('group-sector-list');
  const n = checkboxes.filter(c => c.checked).length;
  const total = checkboxes.length;
  const countEl = document.getElementById('group-sector-count');
  if (countEl) countEl.textContent = n === 0 ? 'Nenhum selecionado' : `${n} de ${total} selecionado${n !== 1 ? 's' : ''}`;
  const btn = document.getElementById('btn-group-sector-all');
  if (btn) {
    const isAll = total > 0 && n === total;
    btn.innerHTML = isAll
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:11px;height:11px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Desmarcar todos`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:11px;height:11px;"><polyline points="20 6 9 17 4 12"/></svg> Selecionar todos`;
  }
  const saveBtn = document.getElementById('btn-group-sector-save');
  if (saveBtn) {
    saveBtn.disabled = n === 0;
    saveBtn.style.opacity = n === 0 ? '.45' : '';
    saveBtn.style.cursor  = n === 0 ? 'not-allowed' : '';
  }
}

function _toggleGroupSectorAll() {
  const checkboxes = _authCaixasSetor('group-sector-list');
  const allChecked = checkboxes.every(c => c.checked);
  checkboxes.forEach(c => {
    c.checked = !allChecked;
    const card = c.closest('.sector-check-card');
    if (card) card.classList.toggle('checked', !allChecked);
  });
  _onGroupSectorCheck();
}

function saveGroupSectorModal() {
  const all = _authCaixasSetor('group-sector-list');
  const checkedCount = all.filter(c => c.checked).length;
  if (checkedCount === 0) {
    if (typeof showToast === 'function') showToast('Selecione ao menos 1 setor.', 'error');
    return;
  }
  const allChecked = checkedCount === all.length;
  // Unidade inteira marcada vira acesso por unidade (inclui setores criados depois nela)
  const unidadeIds = [], setorIds = [];
  if (!allChecked) {
    const inteiras = new Set(_authMigrado()
      ? [...document.querySelectorAll('#group-sector-list .sector-unit-check')].filter(u => u.checked && u.dataset.unidade).map(u => u.dataset.unidade)
      : []);
    unidadeIds.push(...inteiras);
    all.filter(c => c.checked && !inteiras.has(c.dataset.unidade)).forEach(c => setorIds.push(c.value));
  }
  const g = authState.groups.find(g => g.id === _groupSectorEditId);
  if (g) {
    _authGravarGrupoSetores(g, setorIds, unidadeIds);
    const permitidos = _authGrupoSetorIds(g);

    // Restrição individual dos membros: remove setores que o grupo não permite mais
    if (permitidos) {
      authState.users.filter(u => u.grupoId === _groupSectorEditId).forEach(u => {
        const atual = _authUserSetorIds(u);
        if (atual.length) _authGravarUserSetores(u, atual.filter(s => permitidos.includes(s)));
      });
    }
    _saveAuth();
  }
  document.getElementById('modal-group-sector')?.classList.remove('open');
  renderGroupsTable();
  // Se o grupo editado é o do usuário logado, reinicializa o filtro da topbar
  if (currentSession?.grupoId === _groupSectorEditId) _initTopbarSectorFilter();
  if (typeof showToast === 'function') showToast('Acesso do grupo atualizado.', 'success');
}

function closeGroupSectorModal() {
  document.getElementById('modal-group-sector')?.classList.remove('open');
}

function openGroupEditModal(id) {
  _groupEditId = id || null;
  const errEl = document.getElementById('group-edit-error');
  if (errEl) errEl.style.display = 'none';
  document.getElementById('group-edit-modal-title').textContent = id ? 'Editar Grupo' : 'Novo Grupo';

  if (id) {
    const g = authState.groups.find(g => g.id === id);
    if (!g) return;
    document.getElementById('group-edit-nome').value      = g.nome || '';
    document.getElementById('group-edit-default').checked = !!g.isDefault;
    _renderPermissions(g.permissoes || _emptyPermissoes());
  } else {
    document.getElementById('group-edit-nome').value      = '';
    document.getElementById('group-edit-default').checked = false;
    _renderPermissions(_emptyPermissoes());
  }
  updateGroupEditDefaultLabel();
  document.getElementById('modal-group-edit')?.classList.add('open');
}

function closeGroupEditModal() {
  document.getElementById('modal-group-edit')?.classList.remove('open');
}

function updateGroupEditDefaultLabel() {
  const el = document.getElementById('group-edit-default-label');
  if (el) el.textContent = document.getElementById('group-edit-default')?.checked
    ? 'Grupo Padrão' : 'Não é padrão';
}

const PERM_ICONS = {
  ativos:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px;"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>`,
  rotinas:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px;"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>`,
  tarefas:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px;"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>`,
  atividades: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px;"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
  ot:         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px;"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>`,
  ocorrencias:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px;"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  cq:         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px;"><path d="M9 3h6"/><path d="M10 3v6.5L4.6 18.4A2 2 0 006.3 21.5h11.4a2 2 0 001.7-3.1L14 9.5V3"/><line x1="7.5" y1="15" x2="16.5" y2="15"/></svg>`,
  config:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px;"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`
};

function _renderPermissions(permissoes) {
  const container = document.getElementById('group-perm-container');
  if (!container) return;
  container.innerHTML = Object.entries(PERM_STRUCTURE).map(([cat, { label, keys }]) => {
    const activeCount = keys.filter(k => permissoes[cat]?.[k]).length;
    const allChecked  = activeCount === keys.length;
    return `<div class="perm-category" id="perm-cat-${cat}">
      <div class="perm-cat-header">
        <div class="perm-cat-header-left">
          <div class="perm-cat-icon">${PERM_ICONS[cat] || ''}</div>
          <div class="perm-cat-title-wrap">
            <span class="perm-cat-label">${label}</span>
            <span class="perm-cat-badge${activeCount > 0 ? ' has-active' : ''}" id="perm-badge-${cat}">
              ${activeCount}/${keys.length}
            </span>
          </div>
        </div>
        <button type="button" class="perm-cat-toggle-btn${allChecked ? ' all-active' : ''}"
          id="perm-all-btn-${cat}" onclick="toggleAllCatPerms('${cat}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:10px;height:10px;">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          ${allChecked ? 'Desmarcar todos' : 'Marcar todos'}
        </button>
        <input type="checkbox" id="perm-all-${cat}" ${allChecked ? 'checked' : ''} style="display:none;">
      </div>
      <div class="perm-rows">
        ${keys.map(k => {
          const on = !!permissoes[cat]?.[k];
          return `<label class="perm-row${on ? ' active' : ''}" id="perm-row-${cat}-${k}"
            onclick="_onPermRowClick(this,'${cat}','${k}')">
            <input type="checkbox" id="perm-${cat}-${k}" ${on ? 'checked' : ''}>
            <span class="perm-row-toggle"></span>
            <span class="perm-row-label">${PERM_LABELS[k] || k}</span>
          </label>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');
}

function _onPermRowClick(rowEl, cat, k) {
  const cb = document.getElementById(`perm-${cat}-${k}`);
  if (!cb) return;
  cb.checked = !cb.checked;
  rowEl.classList.toggle('active', cb.checked);
  updateCatAllCheck(cat);
}

function toggleAllCatPerms(cat) {
  const keys    = PERM_STRUCTURE[cat]?.keys || [];
  const allCb   = document.getElementById('perm-all-' + cat);
  const newState = allCb ? !allCb.checked : true;
  if (allCb) allCb.checked = newState;
  keys.forEach(k => {
    const cb  = document.getElementById(`perm-${cat}-${k}`);
    const row = document.getElementById(`perm-row-${cat}-${k}`);
    if (cb)  cb.checked = newState;
    if (row) row.classList.toggle('active', newState);
  });
  _updateCatHeader(cat);
}

function updateCatAllCheck(cat) {
  const keys    = PERM_STRUCTURE[cat]?.keys || [];
  const allEl   = document.getElementById('perm-all-' + cat);
  const allOn   = keys.every(k => document.getElementById(`perm-${cat}-${k}`)?.checked);
  if (allEl) allEl.checked = allOn;
  _updateCatHeader(cat);
}

function _updateCatHeader(cat) {
  const keys        = PERM_STRUCTURE[cat]?.keys || [];
  const activeCount = keys.filter(k => document.getElementById(`perm-${cat}-${k}`)?.checked).length;
  const allOn       = activeCount === keys.length;

  const badge = document.getElementById(`perm-badge-${cat}`);
  if (badge) {
    badge.textContent = `${activeCount}/${keys.length}`;
    badge.classList.toggle('has-active', activeCount > 0);
  }
  const btn = document.getElementById(`perm-all-btn-${cat}`);
  if (btn) {
    btn.classList.toggle('all-active', allOn);
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:10px;height:10px;">
      ${allOn
        ? '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'
        : '<polyline points="20 6 9 17 4 12"/>'}
    </svg>
    ${allOn ? 'Desmarcar todos' : 'Marcar todos'}`;
  }
}

function _readPermissions() {
  const p = _emptyPermissoes();
  for (const [cat, { keys }] of Object.entries(PERM_STRUCTURE)) {
    keys.forEach(k => { const el = document.getElementById(`perm-${cat}-${k}`); if (el) p[cat][k] = el.checked; });
  }
  return p;
}

function saveGroupEdit() {
  const nome      = (document.getElementById('group-edit-nome')?.value || '').trim();
  const isDefault = document.getElementById('group-edit-default')?.checked || false;

  if (!nome) { _showAuthError('group-edit-error', 'Informe o nome do grupo.'); return; }
  if (authState.groups.some(g => g.nome.toLowerCase() === nome.toLowerCase() && g.id !== _groupEditId))
    { _showAuthError('group-edit-error', 'Já existe um grupo com este nome.'); return; }

  const permissoes = _readPermissions();

  if (isDefault) authState.groups.forEach(g => { g.isDefault = false; });

  if (_groupEditId) {
    const idx = authState.groups.findIndex(g => g.id === _groupEditId);
    if (idx < 0) return;
    authState.groups[idx].nome       = nome;
    authState.groups[idx].isDefault  = isDefault;
    authState.groups[idx].permissoes = permissoes;
  } else {
    authState.groups.push({ id: _authUid(), nome, isDefault, permissoes, createdAt: new Date().toISOString() });
  }
  _saveAuth();
  closeGroupEditModal();
  renderGroupsTable();
  if (typeof showToast === 'function')
    showToast(_groupEditId ? 'Grupo atualizado!' : 'Grupo criado!', 'success');
}

async function deleteGroup(id) {
  const g = authState.groups.find(g => g.id === id);
  if (!g) return;
  if (g.isDefault) { if (typeof showToast==='function') showToast('Não é possível excluir o grupo padrão.', 'error'); return; }
  const n = authState.users.filter(u => u.grupoId === id).length;
  if (n > 0) { if (typeof showToast==='function') showToast(`Este grupo tem ${n} membro(s). Mova-os antes de excluir.`, 'error'); return; }
  if (!(await uiConfirmar({
    tipo: 'perigo', titulo: 'Excluir grupo?', confirmar: 'Excluir',
    mensagem: `O grupo <b>${uiEsc(g.nome)}</b> e suas permissões serão removidos.`,
  }))) return;
  authState.groups = authState.groups.filter(g => g.id !== id);
  _saveAuth();
  renderGroupsTable();
  if (typeof showToast === 'function') showToast('Grupo excluído.', 'success');
}

function setGroupDefault(id) {
  authState.groups.forEach(g => { g.isDefault = g.id === id; });
  _saveAuth();
  renderGroupsTable();
  const g = authState.groups.find(g => g.id === id);
  if (typeof showToast === 'function') showToast(`"${g?.nome}" definido como grupo padrão.`, 'success');
}

// Enter nos formulários de auth
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Enter') return;
  const overlay = document.getElementById('auth-overlay');
  if (!overlay || overlay.style.display === 'none' || overlay.style.display === '') return;
  const active = document.querySelector('.auth-screen.active');
  if (!active) return;
  if (active.id === 'auth-screen-login')       authDoLogin();
  else if (active.id === 'auth-screen-first-admin') authDoCreateAdmin();
  else if (active.id === 'auth-screen-register')    authDoRegister();
});
