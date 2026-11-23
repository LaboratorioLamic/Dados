// ═══════════════════════════════════════════════════════════════
// auth.js — Login, cadastro, sessão e permissões — COMERCIAL LAMIC
// Modelo do Manutenção LAMIC (usuários e grupos no Realtime Database).
// A segurança definitiva (Firebase Auth + Security Rules) fica para a
// fase final do projeto.
// ═══════════════════════════════════════════════════════════════

let sessao = null;          // { usuarioId, em }

// ── SHA-256 (JS puro: funciona também fora de HTTPS) ──────────
const _K256 = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];
function sha256(texto) {
  const bytes = new TextEncoder().encode(texto), l = bytes.length;
  const blocos = (l + 9 + 63) >> 6, w = new Uint32Array(blocos * 16);
  for (let i = 0; i < l; i++) w[i >> 2] |= bytes[i] << (24 - (i % 4) * 8);
  w[l >> 2] |= 0x80 << (24 - (l % 4) * 8);
  w[blocos * 16 - 1] = (l * 8) >>> 0;
  w[blocos * 16 - 2] = Math.floor(l * 8 / 0x100000000);
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const W = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let b = 0; b < blocos; b++) {
    for (let t = 0; t < 16; t++) W[t] = w[b * 16 + t];
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(W[t - 15], 7) ^ rotr(W[t - 15], 18) ^ (W[t - 15] >>> 3);
      const s1 = rotr(W[t - 2], 17) ^ rotr(W[t - 2], 19) ^ (W[t - 2] >>> 10);
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
    }
    let [a, bb, c, d, e, f, g, h] = H;
    for (let t = 0; t < 64; t++) {
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + _K256[t] + W[t]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = bb; bb = a; a = (t1 + t2) >>> 0;
    }
    [a, bb, c, d, e, f, g, h].forEach((v, i) => { H[i] = (H[i] + v) >>> 0; });
  }
  return H.map(x => x.toString(16).padStart(8, '0')).join('');
}

const novoSal = () => [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
const hashSenha = (senha, sal) => sha256(sal + ':' + senha);

// ── Consultas ─────────────────────────────────────────────────
const usuarioAtual = () => sessao ? { id: sessao.usuarioId, ...ESTADO.usuarios[sessao.usuarioId] } : null;
// Sem grupo marcado como padrão: Visualizador ou, na falta, o grupo com menos permissões
const nPermissoes = g => Object.values(g.permissoes || {}).reduce((s, l) => s + (l?.length || 0), 0);
const grupoPadrao = () => {
  const gs = lista(ESTADO.grupos);
  return gs.find(g => g.padrao) || gs.find(g => !g.travado && normalizar(g.nome) === 'visualizador')
    || gs.filter(g => !g.travado).sort((a, b) => nPermissoes(a) - nPermissoes(b))[0];
};

// Permissão: admin e grupo travado podem tudo
function pode(modulo, acao = 'ver') {
  const u = usuarioAtual();
  if (!u) return false;
  if (u.admin) return true;
  const g = ESTADO.grupos[u.grupoId];
  if (!g) return false;
  if (g.travado) return true;
  return (g.permissoes?.[modulo] || []).includes(acao);
}

// ── Sessão (login do Dados LAMIC) ─────────────────────────────
// Não há conta própria: quem entra é o usuário logado no Dados LAMIC (mesma origem → mesma sessão
// do Firebase Auth). O registro em auth/usuarios/{id} guarda só o que é do Comercial (grupo, setores,
// ativo, admin) e aponta para o Dados pelo campo `login`. Nome e cargo vêm do Dados.
// Admin do Dados = admin do Comercial. Demais: precisam de registro ativo (liberado em Configurações › Usuários).
const DADOS = { login: null, perfil: null, usuarios: {}, gruposComAcesso: new Set(), acessoIndividual: {} };
// Conta do Dados que pode usar o Comercial: admin ou grupo com comercial_acessar
// Acesso: admin do Dados, grupo com "Acessar o Comercial" ou liberação individual (comercial_acesso/{login}).
const contaComAcesso = (d, login) => !!d && d.ativo !== false && (d.grupo === 'admin' || DADOS.gruposComAcesso.has(d.grupo) || DADOS.acessoIndividual[login] === true);
const registroDe = login => lista(ESTADO.usuarios).find(u => u.login === login) || null;

// Liga registros antigos (usuário/senha próprios) às contas do Dados: pelo login e, se não houver, pelo nome completo.
function vinculosPendentes() {
  const up = {}, usados = new Set(lista(ESTADO.usuarios).map(u => u.login).filter(Boolean));
  Object.entries(DADOS.usuarios).forEach(([login, d]) => {
    if (usados.has(login)) return;
    const livres = lista(ESTADO.usuarios).filter(u => !u.login && !up[`${u.id}/login`]);
    let r = livres.filter(u => u.usuario === login);
    if (r.length !== 1) r = livres.filter(u => normalizar(u.nome) === normalizar(d.nome));
    if (r.length === 1) { up[`${r[0].id}/login`] = login; usados.add(login); }
  });
  return up;
}

// Antes de tocar no nó /comercial: conta ativa no Dados e grupo com acesso (as regras do banco exigem o mesmo).
async function verificarAcessoDados(user) {
  const login = await lerDados(`uids/${user.uid}`);
  const perfil = login && await lerDados(`usuarios/${login}`);
  if (!perfil || perfil.ativo !== true) return 'Sua conta está desativada no Dados LAMIC.';
  DADOS.login = login; DADOS.perfil = perfil;
  DADOS.usuarios = (await lerDados('usuarios').catch(() => null)) || {};
  const ehAdmin = perfil.grupo === 'admin';
  // Acesso ao Comercial é dado no Dados LAMIC: Grupos e permissões › Comercial › "Acessar o Comercial".
  DADOS.gruposComAcesso = new Set(Object.entries((await lerDados('grupos').catch(() => null)) || {})
    .filter(([, g]) => g?.perms?.comercial_acessar === true).map(([id]) => id));
  DADOS.acessoIndividual = (await lerDados('comercial_acesso').catch(() => null)) || {};
  if (!contaComAcesso(perfil, login))
    return 'Seu grupo no Dados LAMIC não tem acesso ao Comercial. Peça a um administrador: Dados LAMIC › Grupos e permissões › Comercial.';
  return '';
}

// Depois de carregar o estado do Comercial: vínculos, registro próprio e sessão.
async function iniciarSessaoDados() {
  const { login, perfil } = DADOS, ehAdmin = perfil.grupo === 'admin';
  const up = vinculosPendentes();
  if (Object.keys(up).length) {
    await DB.mesclar(CAMINHOS.usuarios, up);
    Object.entries(up).forEach(([k, v]) => { const [id] = k.split('/'); ESTADO.usuarios[id] = { ...ESTADO.usuarios[id], login: v }; });
  }
  let r = registroDe(login);
  if (!r) {
    // 1º acesso de quem tem permissão no Dados: admin → admin; demais → grupo padrão do Comercial
    const id = DB.novaChave(CAMINHOS.usuarios);
    const novo = { nome: perfil.nome || login, usuario: login, login, cargo: perfil.cargo || '', setores: 'todos', ativo: true,
      admin: ehAdmin, grupoId: ehAdmin ? 'admin' : (grupoPadrao()?.id || null), criadoEm: Date.now() };
    await DB.gravar(`${CAMINHOS.usuarios}/${id}`, novo);
    ESTADO.usuarios = { ...ESTADO.usuarios, [id]: novo };
    registrar('usuarios', `${novo.nome} entrou pela 1ª vez (acesso dado no Dados LAMIC)`);
    r = { id, ...novo };
  }
  if (r.ativo === false && !ehAdmin) return 'Seu acesso ao Comercial está desativado. Fale com o administrador.';
  // Nome, cargo e admin seguem o Dados
  const sinc = { ultimoAcesso: Date.now() };
  if (perfil.nome && r.nome !== perfil.nome) sinc.nome = perfil.nome;
  if ((r.cargo || '') !== (perfil.cargo || '')) sinc.cargo = perfil.cargo || '';
  if (ehAdmin && (!r.admin || r.ativo === false)) { sinc.admin = true; sinc.ativo = true; }
  await DB.mesclar(`${CAMINHOS.usuarios}/${r.id}`, sinc);
  ESTADO.usuarios[r.id] = { ...ESTADO.usuarios[r.id], ...sinc };
  sessao = { usuarioId: r.id, em: Date.now() };
  return '';
}
function encerrarSessao() { sessao = null; }

// ── Tela de acesso ────────────────────────────────────────────
function mostrarAuth(modo, erro = '') {
  const el = document.getElementById('auth');
  el.classList.remove('hide');
  const marca = `<div class="brand"><div class="brand-ico"><i class="fa-solid fa-hand-holding-dollar"></i></div>
    <div><div class="brand-name">COMERCIAL LAMIC</div><div class="brand-sub">Precificação &amp; Comercial</div></div></div>`;
  const msg = erro ? `<div class="auth-erro"><i class="fa-solid fa-circle-exclamation"></i>${esc(erro)}</div>` : '';
  const ent = (id, rotulo, icone, tipo = 'text', ph = '') =>
    `<label for="${id}">${rotulo}</label><div class="inp-auth"><i class="fa-solid ${icone}"></i><input id="${id}" type="${tipo}" placeholder="${ph}" autocomplete="${tipo === 'password' ? 'current-password' : 'username'}"></div>`;
  let corpo = '';
  if (modo === 'carregando') {
    corpo = `<div class="auth-load"><i class="fa-solid fa-circle-notch fa-spin"></i>Conectando ao banco de dados…</div>`;
  } else if (modo === 'sem-dados') {
    corpo = `<h1>Entre pelo Dados LAMIC</h1><p>O banco do Comercial fica no Dados LAMIC. Entre por lá e abra o Comercial novamente.</p>
      <button class="btn-primary" onclick="location.href='https://laboratoriolamic.github.io/Dados/'"><i class="fa-solid fa-right-to-bracket"></i>Ir para o Dados LAMIC</button>`;
  } else if (modo === 'erro-conexao') {
    corpo = `<h1>Sem conexão</h1><p>Não foi possível acessar o banco de dados. Verifique a internet e as regras do Realtime Database.</p>
      <button class="btn-primary" onclick="location.reload()"><i class="fa-solid fa-rotate"></i>Tentar novamente</button>`;
  } else {
    // 'sem-acesso': logado no Dados, mas sem liberação no Comercial
    corpo = `<h1>Sem acesso</h1><p>${esc(erro || 'Você não tem acesso ao Comercial.')}</p>
      <button class="btn-primary" onclick="location.href='https://laboratoriolamic.github.io/Dados/'"><i class="fa-solid fa-arrow-left"></i>Voltar ao Dados LAMIC</button>`;
  }
  if (modo !== 'carregando') { if (window.LamicCarregando) window.LamicCarregando.fim(); }
  el.innerHTML = `<div class="auth-card">${marca}${corpo}${window.DB_TESTE ? '<div class="auth-teste"><i class="fa-solid fa-flask"></i>Ambiente de teste (emulador)</div>' : ''}</div>`;
  el.querySelector('input')?.focus();
}
const esconderAuth = () => { document.getElementById('auth').classList.add('hide'); if (window.LamicCarregando) window.LamicCarregando.fim(); };

// ── Ações ─────────────────────────────────────────────────────
async function sair() {
  // no treinamento: sair também descarta a simulação
  if (SIM.ativo) {
    const ok = await confirmar({ titulo: 'Encerrar o treinamento e sair?', icone: 'fa-flask', tom: 'pausa', botao: 'Sair',
      texto: 'Tudo o que foi feito na simulação será descartado e você precisará fazer login novamente.' });
    if (ok) encerrarSimulacao({ sair: true, msg: '' });
    return;
  }
  const ok = await confirmar({ titulo: 'Sair?', texto: 'Você sai do Dados LAMIC e de todos os módulos.', botao: 'Sair' });
  if (!ok) return;
  encerrarSessao();
  fecharGaveta();
  await firebase.auth().signOut().catch(() => {});
  location.href = 'https://laboratoriolamic.github.io/Dados/';
}

