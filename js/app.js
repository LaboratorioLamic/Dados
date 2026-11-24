/* Dados LAMIC — Portal do Colaborador
 * SPA sem build: Firebase Auth (login + senha) + Realtime Database.
 * A regra de acesso real está em firebase/database.rules.json; aqui só escondemos o que o usuário não pode usar.
 *
 * Estrutura do banco:
 *   meta/bootstrap            uid do primeiro administrador (existe = sistema já iniciado)
 *   logins/{login}            { v, uid, reset? }  → conta do Auth = login.v@dominioInterno
 *   uids/{uid}                login
 *   usuarios/{login}          { nome, cargo, grupo, ativo, criado_em }
 *   privado/{login}           { cpf }
 *   cpfs/{cpf}                login (garante CPF único)
 *   convites/{login}          { nome, cargo, grupo, criado_por, criado_em }
 *   grupos/{id}               { nome, sistema?, perms: { chave_com_underline: true } }
 *   modulos/{id}              { nome, icone, cor, ordem, grupos: {id: true}, links: {id: {...}} }
 *   avisos/{id}, leituras/{login}/{aviso}, auditoria/{id}
 */
(() => {
  'use strict';

  const cfg = window.LAMIC_CONFIG || {};
  const app = document.getElementById('app');
  const S = { auth: null, db: null, me: null, perms: new Set(), grupos: [], offAvisos: null, cadastrando: false };

  // ---------- utilidades ----------
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const pode = (p) => S.perms.has(p);
  const dataBR = (d) => d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  const iniciais = (n) => (n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
  // aceita http(s), páginas internas da pasta seeds/ e imagens embutidas (bloqueia javascript: etc.)
  const urlSegura = (u) => /^(https?:\/\/|seeds\/|modulos\/|data:image\/)/i.test(u || '') ? u : '#';

  // Realtime Database
  const ref = (p) => S.db.ref(p);
  const ler = async (p) => (await ref(p).get()).val();
  const TS = () => firebase.database.ServerValue.TIMESTAMP;
  const lista = (obj) => Object.entries(obj || {}).map(([id, v]) => ({ id, ...v }));
  const porOrdem = (a, b) => (a.ordem ?? 0) - (b.ordem ?? 0);
  const porNome = (a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR');
  const marcados = (sel) => {
    const v = [...sel.selectedOptions].map((o) => o.value);
    return v.length ? Object.fromEntries(v.map((x) => [x, true])) : null;
  };
  const novaChave = () => S.db.ref().push().key;
  const emailDe = (login, v) => `${login}.${v || 0}@${cfg.dominioInterno || 'dados-lamic.app'}`;
  const auditar = (acao, alvo = '') => ref('auditoria_log').push({ por: S.me?.login, acao, alvo, em: TS() }).catch(() => {});

  // Permissões do sistema. No banco a chave usa "_" no lugar de "." (o RTDB não aceita ponto em chave).
  // Organizadas por categoria (como em seeds/manutencao): cada categoria vira um cartão com interruptores.
  const CATEGORIAS = [
    { id: 'usuarios', nome: 'Usuários', icone: 'fas fa-users', perms: [['usuarios.gerenciar', 'Criar usuários, alterar senha, grupo e desativar']] },
    { id: 'grupos', nome: 'Grupos', icone: 'fas fa-user-shield', perms: [['grupos.gerenciar', 'Criar grupos e definir permissões']] },
    { id: 'modulos', nome: 'Módulos', icone: 'fas fa-table-cells-large', perms: [['modulos.gerenciar', 'Editar módulos e links (vê todos os links)']] },
    { id: 'avisos', nome: 'Avisos', icone: 'fas fa-bell', perms: [['avisos.publicar', 'Publicar avisos'], ['avisos.relatorio', 'Ver quem leu/confirmou avisos']] },
    { id: 'docadmin', nome: 'Documentos', icone: 'fas fa-folder-open', perms: [['docadmin.gerenciar', 'Abrir o DocAdmin (cadastrar POPs, protocolos, termos e planilhas)']] },
    { id: 'comercial', nome: 'Comercial', icone: 'fas fa-hand-holding-dollar', perms: [['comercial.acessar', 'Acessar o Comercial LAMIC (preços, custos, propostas): ler e gravar']] },
    { id: 'unilamic', nome: 'UniLAMIC', icone: 'fas fa-graduation-cap', perms: [['unilamic.gerenciar', 'Abrir as configurações do UniLAMIC (cursos, relatórios, alunos)']] },
    { id: 'auditoria', nome: 'Auditoria', icone: 'fas fa-clipboard-list', perms: [['auditoria.ver', 'Ver log de auditoria']] },
  ];
  const PERMISSOES = CATEGORIAS.flatMap((c) => c.perms);
  const chavePerm = (p) => p.replace('.', '_');
  // Os módulos vivem em seeds/ (local) e são copiados para modulos/ (node ferramentas/sincronizar-modulos.js),
  // que vai no GitHub Pages do Dados. Publicado: abre modulos/{repo}/; local: seeds/{repo}/.
  // Links antigos para laboratoriolamic.github.io/{repo}/ também caem na cópia do Dados.
  const SEEDS = ['Iamicproposta', 'Iamicvacinas', 'L2L', 'Planilhas', 'Pops', 'Protocolos', 'TabeIasIamic', 'Temperatura', 'Termos', 'Treinamentos',
    'auditoriaIamic', 'checkguias', 'comercial', 'conveniosIamic', 'curricuIoIamic', 'docadmin', 'manutencao', 'propagandismolamic', 'respIamic', 'valor', 'wpp'];
  const PUBLICADO = /\.github\.io$/.test(location.hostname);
  // nomes de repo trocam "l" por "I" maiúsculo (TabeIasIamic); compara ignorando essa troca
  const chaveRepo = (s) => String(s || '').replace(/I/g, 'l').toLowerCase();
  const repoDe = (u, soGithub = false) => {
    const sd = soGithub ? null : /^seeds\/([^/?#]+)\/?(index\.html)?$/.exec(u || '');
    const gh = /^https:\/\/laboratoriolamic\.github\.io\/([^/?#]+)\/?(index\.html)?$/i.exec(u || '');
    const nome = (sd || gh)?.[1];
    return nome ? SEEDS.find((r) => chaveRepo(r) === chaveRepo(nome)) : undefined;
  };
  const urlLink = (u) => {
    const repo = repoDe(u);
    if (!repo) return u;
    return PUBLICADO ? `modulos/${repo}/index.html` : `seeds/${repo}/index.html`;
  };
  // Link liberado ao grupo: grupos/{g}/links/{linkId}. Grupo antigo sem a lista usa o módulo inteiro (modulos/{m}/grupos).
  function linkLiberado(grupo, m, l) {
    if (pode('modulos.gerenciar')) return true;
    const g = S.grupos.find((x) => x.id === grupo);
    if (g?.links) return !!g.links[l.id];
    return !!m.grupos?.[grupo];
  }

  function toast(txt) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = txt;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  function esconderLoader() {
    const l = $('#loader');
    l.classList.add('out');
    setTimeout(() => l.classList.add('hidden'), 400);
  }

  const ERROS = {
    CADASTRO_NAO_AUTORIZADO: 'Este login não tem convite. Peça ao administrador para cadastrá-lo.',
    CADASTRO_RECUSADO: 'Cadastro recusado: o CPF já está cadastrado ou o convite não é válido.',
    LOGIN_INVALIDO: 'Login inválido: use só letras minúsculas e números, até 14 caracteres.',
    LOGIN_INCORRETO: 'Login ou senha incorretos.',
    LOGIN_RESETADO: 'Sua senha foi alterada pelo administrador. Entre com a senha nova que ele informou.',
    LOGIN_REDEFINIDO: 'Sua senha foi redefinida. Use "Primeiro acesso" para criar uma nova.',
    SENHA_FRACA: 'A senha precisa ter no mínimo 6 caracteres, com letra maiúscula, letra minúscula e número.',
    SISTEMA_INICIADO: 'O administrador já foi criado. Recarregue a página.',
    SEM_PERMISSAO: 'Você não tem permissão para isso.',
    CPF_INVALIDO: 'CPF inválido. Confira os números.',
    LOGIN_EM_USO: 'Este login já está em uso.',
    CPF_EM_USO: 'Este CPF já está cadastrado.',
    'auth/invalid-credential': 'Login ou senha incorretos.',
    'auth/invalid-login-credentials': 'Login ou senha incorretos.',
    'auth/wrong-password': 'Senha incorreta.',
    'auth/user-not-found': 'Login ou senha incorretos.',
    'auth/email-already-in-use': 'Este login já está em uso.',
    'auth/weak-password': 'A senha precisa ter no mínimo 6 caracteres, com letra maiúscula, letra minúscula e número.',
    'auth/password-does-not-meet-requirements': 'A senha precisa ter no mínimo 6 caracteres, com letra maiúscula, letra minúscula e número.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
    'auth/network-request-failed': 'Sem conexão com a internet.',
    'auth/operation-not-allowed': 'Ative o provedor "E-mail/senha" no Firebase Authentication.',
    'auth/unauthorized-domain': 'Domínio não autorizado: adicione-o em Firebase → Authentication → Settings → Authorized domains.',
    PERMISSION_DENIED: 'Você não tem permissão para isso.',
    permission_denied: 'Você não tem permissão para isso.',
  };
  const traduz = (e) => {
    const m = `${e?.code || ''} ${e?.message || String(e)}`;
    const k = Object.keys(ERROS).find((k) => m.includes(k));
    return k ? ERROS[k] : (e?.message || String(e));
  };
  const falha = (codigo) => new Error(codigo);

  // Login: só a-z e 0-9, até 14 caracteres.
  const LOGIN_RE = /^[a-z0-9]{1,14}$/;

  // CPF: só dígitos, com validação dos dígitos verificadores.
  const CPF_ENTIDADE = '00000000000';   // pode repetir: não entra no índice de CPF único
  const soDigitos = (v) => String(v || '').replace(/\D/g, '');
  function cpfValido(v) {
    const c = soDigitos(v);
    if (c === CPF_ENTIDADE) return true;   // entidades (sem CPF) usam 000.000.000-00
    if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
    const dv = (n) => {
      let soma = 0;
      for (let i = 0; i < n; i++) soma += +c[i] * (n + 1 - i);
      const r = (soma * 10) % 11;
      return r === 10 ? 0 : r;
    };
    return dv(9) === +c[9] && dv(10) === +c[10];
  }
  const mascaraCpf = (v) => soDigitos(v).slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  const cpfOculto = (v) => { const c = soDigitos(v); return c.length === 11 ? `***.${c.slice(3, 6)}.***-${c.slice(9)}` : '—'; };
  const campoCpf = () => `<label class="field so-novo"><span>CPF</span>
    <input name="cpf" required inputmode="numeric" maxlength="14" placeholder="000.000.000-00" autocomplete="off"></label>`;
  const campoLogin = (rotulo = 'Login') => `<label class="field"><span>${rotulo}</span>
    <input name="login" required maxlength="14" pattern="[a-z0-9]{1,14}" autocomplete="username" autocapitalize="off" spellcheck="false"
      title="Só letras minúsculas e números, sem espaço, até 14 caracteres" placeholder="ex.: mariasilva"></label>`;
  // força o formato enquanto digita (minúsculas, remove acentos, espaços e símbolos)
  function ligarCamposLogin(root) {
    $$('input[name=login]', root).forEach((i) => i.addEventListener('input', () => {
      const v = i.value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '').slice(0, 14);
      if (v !== i.value) i.value = v;
    }));
    $$('input[name=cpf]', root).forEach((i) => i.addEventListener('input', () => { i.value = mascaraCpf(i.value); }));
    // força da senha: checklist em tempo real; bloqueia o envio enquanto faltar alguma regra
    $$('input[data-forte]', root).forEach((i) => {
      const lista = document.createElement('ul');
      lista.className = 'regras-senha';
      lista.setAttribute('aria-live', 'polite');
      i.insertAdjacentElement('afterend', lista);
      const checar = () => {
        const falta = REGRAS_SENHA.filter(([, teste]) => !teste(i.value));
        lista.innerHTML = REGRAS_SENHA.map(([txt, teste]) => {
          const ok = teste(i.value);
          return `<li class="${ok ? 'ok' : ''}"><i class="fas ${ok ? 'fa-circle-check' : 'fa-circle'}"></i> ${txt}</li>`;
        }).join('');
        i.setCustomValidity(falta.length ? ERROS.SENHA_FRACA : '');
        i.classList.toggle('invalido', !!i.value && !!falta.length);
      };
      i.addEventListener('input', checar);
      checar();
    });
    // confirmação de senha: compara em tempo real e bloqueia o envio se não bater
    $$('input[name=senha2]', root).forEach((c) => {
      const senha = $('input[name=senha]', c.form);
      const status = c.closest('.field').querySelector('.conf-status');
      const checar = () => {
        if (!c.value) { status.textContent = ''; status.className = 'conf-status'; c.setCustomValidity(''); return; }
        const ok = c.value === senha.value;
        status.innerHTML = ok ? '<i class="fas fa-circle-check"></i> As senhas conferem' : '<i class="fas fa-circle-xmark"></i> As senhas não conferem';
        status.className = `conf-status ${ok ? 'ok' : 'erro'}`;
        c.classList.toggle('invalido', !ok);
        c.setCustomValidity(ok ? '' : 'As senhas não conferem');
      };
      c.addEventListener('input', checar);
      senha.addEventListener('input', checar);
    });
  }
  // Regra de senha: mínimo 6 caracteres, com maiúscula, minúscula e número.
  const REGRAS_SENHA = [
    ['Mínimo 6 caracteres', (v) => v.length >= 6],
    ['Uma letra maiúscula', (v) => /[A-Z]/.test(v)],
    ['Uma letra minúscula', (v) => /[a-z]/.test(v)],
    ['Um número', (v) => /[0-9]/.test(v)],
  ];
  const senhaForte = (v) => REGRAS_SENHA.every(([, t]) => t(v));
  const campoConfirma = () => `<label class="field"><span>Confirmar senha</span>
    <input name="senha2" type="password" required autocomplete="new-password"><small class="conf-status" aria-live="polite"></small></label>`;

  function modal(html, { bloqueante = false } = {}) {
    const m = document.createElement('div');
    m.className = 'modal';
    m.innerHTML = `<div class="modal-box">${html}</div>`;
    if (!bloqueante) m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });
    document.body.appendChild(m);
    return m;
  }

  // ---------- inicialização ----------
  async function iniciar() {
    if (!window.firebase || !cfg.firebase?.databaseURL) {
      app.innerHTML = `<div class="auth"><div class="auth-card"><div class="circ"></div>
        <h1>Configuração pendente</h1>
        <p class="sub">Preencha <code>js/config.js</code> com a configuração do Firebase.</p></div></div>`;
      return esconderLoader();
    }
    firebase.initializeApp(cfg.firebase);
    S.auth = firebase.auth();
    S.db = firebase.database();

    let primeiro = true;
    S.auth.onAuthStateChanged(async (user) => {
      if (S.cadastrando) return;   // o cadastro chama entrar() depois de gravar o perfil
      try {
        if (user) await entrar(user);
        else { pararAvisos(); S.me = null; window.dispatchEvent(new CustomEvent('lamic:saiu')); const m = S.motivoSaida; S.motivoSaida = null; fecharViewer(); $$('.viewer').forEach((v) => v.remove()); guardados.clear(); await telaAuth('login', m); }
      } catch (e) { console.error(e); toast(traduz(e)); }
      if (primeiro) { primeiro = false; esconderLoader(); }
    });
  }

  // ---------- logout automático por inatividade (2 h) ----------
  // Última atividade fica no localStorage: vale para todas as abas abertas do portal.
  const INATIVO_MAX = 2 * 60 * 60 * 1000, CH_ATIVO = 'lamic_ultima_atividade';
  let ultimoGravado = 0;
  const marcarAtivo = () => {
    const t = Date.now(); if (t - ultimoGravado < 30000) return;   // grava no máx. a cada 30 s
    ultimoGravado = t; try { localStorage.setItem(CH_ATIVO, t); } catch {}
  };
  const ultimaAtividade = () => { try { return +localStorage.getItem(CH_ATIVO) || Date.now(); } catch { return Date.now(); } };
  const EV_ATIVO = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove'];
  function vigiarAtividade(w) { EV_ATIVO.forEach((ev) => w.addEventListener(ev, marcarAtivo, { passive: true, capture: true })); }
  vigiarAtividade(window);
  // atividade dentro dos sistemas abertos (iframes do mesmo domínio) também conta
  document.addEventListener('load', (e) => { if (e.target.tagName === 'IFRAME') try { vigiarAtividade(e.target.contentWindow); } catch {} }, true);
  function checarInatividade() {
    if (!S.me || !S.auth?.currentUser) return;
    if (Date.now() - ultimaAtividade() < INATIVO_MAX) return;
    S.motivoSaida = 'Você foi desconectado por inatividade. Entre novamente.';
    S.auth.signOut();
  }
  setInterval(checarInatividade, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checarInatividade(); });

  // ---------- autenticação ----------
  async function telaAuth(modo, aviso) {
    if (modo === 'login' && !(await ler('meta/bootstrap'))) modo = 'boot';
    const T = {
      login: ['Portal do Colaborador', 'Acesse com seu login e senha.'],
      boot: ['Criar primeiro administrador', 'Nenhum usuário cadastrado ainda.'],
      primeiro: ['Primeiro acesso', 'Use o login cadastrado pelo administrador.'],
      reset: ['Esqueci a senha', ''],
    }[modo];

    const senhaNova = (rotulo) => `<label class="field"><span>${rotulo}</span><input name="senha" type="password" minlength="6" required data-forte autocomplete="new-password"></label>
      ${campoConfirma()}`;
    const campos = {
      login: `${campoLogin()}
              <label class="field"><span>Senha</span><input name="senha" type="password" required autocomplete="current-password"></label>`,
      boot: `<div class="badge-boot"><i class="fas fa-shield-halved"></i> Esta conta terá acesso total ao sistema.</div>
             <label class="field"><span>Nome completo</span><input name="nome" required autocomplete="name"></label>
             ${campoLogin('Login (minúsculas e números, até 14)')}
             ${campoCpf()}
             ${senhaNova('Senha')}`,
      primeiro: `<label class="field so-novo"><span>Nome completo</span><input name="nome" required autocomplete="name"></label>
                 ${campoLogin()}
                 ${campoCpf()}
                 <div class="msg ok hidden" id="aviso-reset">Senha redefinida pelo administrador: crie a nova senha abaixo.</div>
                 ${senhaNova('Crie uma senha')}`,
      reset: `<div class="msg ok">A senha é redefinida pelo administrador do sistema. Peça a ele em
              <b>Administração → Usuários → <i class="fas fa-key"></i></b>; depois entre em <b>Primeiro acesso</b> e crie a nova senha.</div>`,
    }[modo];

    const botao = { login: 'Entrar', boot: 'Criar administrador', primeiro: 'Criar minha senha' }[modo];
    const links = {
      login: '',
      primeiro: `<a data-m="login">Já tenho senha</a>`,
      reset: `<a data-m="login">Voltar ao login</a>`,
    }[modo] || '';

    app.innerHTML = `<div class="auth"><form class="auth-card" novalidate>
      <div class="circ"></div><h1>${T[0]}</h1>${T[1] ? `<p class="sub">${T[1]}</p>` : ''}
      <div class="msg-area">${aviso ? `<div class="msg erro">${esc(aviso)}</div>` : ''}</div>${campos}
      ${botao ? `<button class="btn full turq" type="submit">${botao}</button>` : ''}
      <div class="auth-links">${links}</div></form></div>`;

    ligarCamposLogin(app);
    $$('.auth-links a').forEach((a) => a.onclick = () => telaAuth(a.dataset.m));
    const form = $('form', app);

    // Primeiro acesso após "redefinir senha": só pede a nova senha (nome e CPF já estão cadastrados).
    let reset = false;
    if (modo === 'primeiro') {
      $('input[name=login]', form).addEventListener('change', async (e) => {
        const info = LOGIN_RE.test(e.target.value) ? await ler(`logins/${e.target.value}`).catch(() => null) : null;
        reset = info?.reset === true;
        $$('.so-novo', form).forEach((el) => {
          el.classList.toggle('hidden', reset);
          $$('input', el).forEach((i) => { i.required = !reset; });
        });
        $('#aviso-reset', form).classList.toggle('hidden', !reset);
      });
    }

    form.onsubmit = async (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const f = Object.fromEntries(new FormData(form));
      const area = $('.msg-area', form);
      const btn = $('button[type=submit]', form);
      const msg = (txt, tipo = 'erro') => area.innerHTML = `<div class="msg ${tipo}">${esc(txt)}</div>`;
      if (!LOGIN_RE.test(f.login || '')) return msg(ERROS.LOGIN_INVALIDO);
      if (modo !== 'login' && !reset && !cpfValido(f.cpf)) return msg(ERROS.CPF_INVALIDO);
      if (modo !== 'login' && !senhaForte(f.senha)) return msg(ERROS.SENHA_FRACA);
      btn.disabled = true;
      try {
        if (modo === 'login') {
          const info = await ler(`logins/${f.login}`);
          if (info?.reset) throw falha('LOGIN_REDEFINIDO');
          if (!info?.uid) throw falha('LOGIN_INCORRETO');
          await S.auth.signInWithEmailAndPassword(emailDe(f.login, info.v), f.senha);
          return;   // onAuthStateChanged chama entrar()
        }
        await cadastrar(f, modo === 'boot');
      } catch (err) { msg(traduz(err)); } finally { btn.disabled = false; }
    };
  }

  // Cria a conta no Auth (login.v@dominioInterno) e grava perfil + vínculos numa única atualização atômica.
  async function cadastrar(f, boot) {
    const login = f.login;
    const [info, iniciado] = await Promise.all([ler(`logins/${login}`), ler('meta/bootstrap')]);
    if (boot && iniciado) throw falha('SISTEMA_INICIADO');
    const reset = !boot && info?.reset === true;
    if (info?.uid) throw falha('LOGIN_EM_USO');
    const v = info?.v || 0;

    S.cadastrando = true;
    let cred;
    try {
      cred = await S.auth.createUserWithEmailAndPassword(emailDe(login, v), f.senha);
      const uid = cred.user.uid;
      const up = { [`logins/${login}`]: { v, uid }, [`uids/${uid}`]: login };
      if (!reset) {
        const cpf = soDigitos(f.cpf);
        let grupo = 'admin', cargo = '', nome = f.nome.trim();
        if (!boot) {
          const conv = await ler(`convites/${login}`);
          if (!conv) throw falha('CADASTRO_NAO_AUTORIZADO');
          grupo = conv.grupo; cargo = conv.cargo || ''; nome = nome || conv.nome;
          up[`convites/${login}`] = null;
        }
        up[`usuarios/${login}`] = { nome, cargo, grupo, ativo: true, criado_em: TS() };
        up[`privado/${login}`] = { cpf };
        if (cpf !== CPF_ENTIDADE) up[`cpfs/${cpf}`] = login;
        if (boot) Object.assign(up, dadosIniciais(uid));
      }
      try { await ref('/').update(up); } catch (e) { throw /permission/i.test(e.message) ? falha('CADASTRO_RECUSADO') : e; }
    } catch (e) {
      if (cred) await cred.user.delete().catch(() => {});   // não deixa conta órfã no Auth
      S.cadastrando = false;
      throw e;
    }
    S.cadastrando = false;
    await entrar(cred.user);
    auditar(boot ? 'bootstrap_admin' : reset ? 'senha_recriada' : 'cadastro_convite', login);
  }

  // Grupos e módulos iniciais, gravados junto com o primeiro administrador.
  function dadosIniciais(uid) {
    const modulos = {}, todos = {};
    (window.LAMIC_SEED_MODULOS || []).forEach((m) => {
      const links = {};
      m.links.forEach((l) => { const k = novaChave(); links[k] = l; todos[k] = true; });
      modulos[novaChave()] = { nome: m.nome, icone: m.icone, cor: m.cor, ordem: m.ordem, links };
    });
    return {
      'meta/bootstrap': uid,
      grupos: {
        admin: { nome: 'Administradores', sistema: true },
        colab: { nome: 'Colaboradores', links: todos },
      },
      modulos,
    };
  }

  async function entrar(user) {
    const sair = async (txt) => { await S.auth.signOut(); return telaAuth('login', txt); };
    // sessão restaurada depois de mais de 2 h parada: não entra
    if (Date.now() - ultimaAtividade() >= INATIVO_MAX) { try { localStorage.removeItem(CH_ATIVO); } catch {} return sair('Você foi desconectado por inatividade. Entre novamente.'); }
    ultimoGravado = 0; marcarAtivo();
    const login = await ler(`uids/${user.uid}`).catch(() => null);
    if (!login) return sair('Conta sem cadastro. Fale com o administrador.');
    const info = await ler(`logins/${login}`);
    if (info?.uid !== user.uid) return sair(ERROS.LOGIN_RESETADO);
    const me = await ler(`usuarios/${login}`).catch(() => null);   // usuário inativo não tem leitura
    if (!me || !me.ativo) return sair('Acesso desativado. Fale com o administrador.');
    S.me = { ...me, login, id: login, uid: user.uid };
    await carregarGrupos();
    montarShell();
    ouvirAvisos();
    window.onhashchange = rotear;
    await rotear();
    // não aguarda: a troca de senha e a fila de avisos esperam o usuário, e o loader só sai quando entrar() termina
    (info.trocar ? ler(`privado/${login}/cpf`).catch(() => null).then((cpf) => exigirTrocaSenha(login, !cpf)) : Promise.resolve())
      .then(() => avisosObrigatorios()).catch((e) => toast(traduz(e)));
  }

  // Senha criada ou alterada pelo administrador: obriga o colaborador a definir uma senha só dele.
  // pedirCpf: conta importada (ex.: UniLAMIC) sem CPF — o CPF é registrado aqui e garante conta única por pessoa.
  function exigirTrocaSenha(login, pedirCpf = false) {
    return new Promise((fim) => {
      const m = modal(`<div class="conf-ic" style="margin:0 auto 12px"><i class="fas fa-key"></i></div>
        <h2 style="text-align:center">Crie sua nova senha</h2>
        <p style="text-align:center;color:var(--txt-2);font-size:14px;margin-bottom:16px">Sua senha foi definida pelo administrador. Por segurança, troque por uma senha que só você conheça.</p>
        <form>
          ${pedirCpf ? campoCpf() : ''}
          <label class="field"><span>Senha atual (informada pelo administrador)</span><input name="atual" type="password" required autocomplete="current-password"></label>
          <label class="field"><span>Nova senha</span><input name="senha" type="password" required data-forte autocomplete="new-password"></label>
          ${campoConfirma()}
          <div class="modal-acoes"><button type="button" class="btn ghost" data-sair>Sair</button><button class="btn turq">Salvar nova senha</button></div>
        </form>`, { bloqueante: true });
      ligarCamposLogin(m);
      $('[data-sair]', m).onclick = () => { m.remove(); S.auth.signOut(); };
      $('form', m).onsubmit = async (e) => {
        e.preventDefault();
        const f = e.target;
        if (!f.reportValidity()) return;
        if (f.senha.value === f.atual.value) return toast('A nova senha precisa ser diferente da atual.');
        const cpf = pedirCpf ? soDigitos(f.cpf.value) : '';
        if (pedirCpf && !cpfValido(cpf)) return toast(ERROS.CPF_INVALIDO);
        const btn = $('button.turq', f); btn.disabled = true;
        try {
          const user = S.auth.currentUser;
          // confere a senha atual antes de gravar o CPF, para não registrar CPF de quem errou a senha
          await user.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(user.email, f.atual.value));
          if (pedirCpf && cpf !== CPF_ENTIDADE) {
            // cpfs/{cpf} só aceita gravação se ainda não existe: CPF de outra conta cai aqui
            try { await ref('/').update({ [`privado/${login}`]: { cpf }, [`cpfs/${cpf}`]: login }); }
            catch (err) { throw /permission/i.test(err.message) ? new Error('Este CPF já está cadastrado em outra conta. Fale com o administrador.') : err; }
          }
          await user.updatePassword(f.senha.value);
          // a senha já foi trocada no Auth; se a regra "logins/$login/trocar" não estiver publicada, avisa sem travar o usuário
          let limpou = true;
          await ref(`logins/${login}/trocar`).remove().catch((err) => { console.error('Falha ao limpar logins/trocar:', err); limpou = false; });
          auditar('senha_trocada_primeiro_login', login);
          m.remove(); fim();
          if (limpou) toast('Senha alterada. Bem-vindo!');
          else {
            const a = modal(`<h2>Senha alterada, mas…</h2>
              <p style="color:var(--txt-2);font-size:14px">O banco recusou limpar a marca de "troca obrigatória" (permissão negada), então esta janela vai voltar no próximo login.</p>
              <p style="color:var(--txt-2);font-size:14px;margin-top:8px">Administrador: publique o arquivo <b>firebase/database.rules.json</b> atualizado em Firebase → Realtime Database → Regras.</p>
              <div class="modal-acoes"><button class="btn turq" data-x>Entendi</button></div>`);
            $('[data-x]', a).onclick = () => a.remove();
          }
        } catch (err) { toast(traduz(err)); btn.disabled = false; }
      };
    });
  }

  async function carregarGrupos() {
    const grupos = await ler('grupos');
    S.grupos = lista(grupos).sort(porNome);
    const meu = grupos?.[S.me.grupo];
    S.perms = new Set(S.me.grupo === 'admin'
      ? PERMISSOES.map((p) => p[0])
      : PERMISSOES.map((p) => p[0]).filter((p) => meu?.perms?.[chavePerm(p)]));
  }

  // ---------- layout ----------
  const ADMIN_PERMS = ['usuarios.gerenciar', 'grupos.gerenciar', 'modulos.gerenciar', 'auditoria.ver'];

  function montarShell() {
    const admin = ADMIN_PERMS.some(pode);
    const nomeGrupo = S.grupos.find((g) => g.id === S.me.grupo)?.nome || '';
    app.innerHTML = `
      <aside class="lateral">
        <a class="lat-logo" href="#avisos" title="Dados LAMIC"><span class="circ"></span></a>
        <nav class="lat-nav" id="lat-nav">
          <a href="#avisos" class="lat-item" data-r="avisos"><i class="fas fa-bell"></i><span>Avisos</span><b class="cont hidden" id="cont-avisos"></b></a>
        </nav>
        <button type="button" class="lat-seta esq" data-seta="-1" aria-label="Rolar para a esquerda" hidden><i class="fas fa-chevron-left"></i></button>
        <button type="button" class="lat-seta dir" data-seta="1" aria-label="Rolar para a direita" hidden><i class="fas fa-chevron-right"></i></button>
      </aside>
      <div class="painel-links hidden" id="painel-links"></div>
      <div class="topo-dir" title="${esc(nomeGrupo)}">
        <span class="td-nome">${esc(S.me.nome.split(' ')[0])}</span>
        <span class="td-av">${esc(iniciais(S.me.nome))}</span>
        <button class="td-bt" id="trocar-senha" title="Trocar minha senha"><i class="fas fa-key"></i></button>
        ${admin ? `<a class="td-bt" href="#admin" data-r="admin" title="Administração"><i class="fas fa-gear"></i></a>` : ''}
        <button class="td-bt" id="sair" title="Sair"><i class="fas fa-right-from-bracket"></i></button>
      </div>
      <main id="pagina"></main>
      <footer>© ${new Date().getFullYear()} Laboratório LAMIC — Análises Clínicas · Uso interno</footer>`;
    $('#sair').onclick = () => S.auth.signOut();
    $('#trocar-senha').onclick = () => {
      const m = modal(`<h2>Trocar minha senha</h2><form>
        <label class="field"><span>Senha atual</span><input name="atual" type="password" required autocomplete="current-password"></label>
        <label class="field"><span>Nova senha</span><input name="senha" type="password" minlength="6" required data-forte autocomplete="new-password"></label>
        ${campoConfirma()}
        <div class="modal-acoes"><button type="button" class="btn ghost" data-x>Cancelar</button><button class="btn turq">Salvar</button></div></form>`);
      ligarCamposLogin(m);
      $('[data-x]', m).onclick = () => m.remove();
      $('form', m).onsubmit = async (e) => {
        e.preventDefault();
        if (!e.target.reportValidity()) return;
        try {
          const user = S.auth.currentUser;
          await user.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(user.email, e.target.atual.value));
          await user.updatePassword(e.target.senha.value);
          m.remove(); toast('Senha alterada.');
        } catch (err) { toast(traduz(err)); }
      };
    };
    // fecha o painel de links ao clicar fora dele
    document.addEventListener('click', (e) => {
      const p = $('#painel-links');
      if (p && !p.classList.contains('hidden') && !e.target.closest('#painel-links, .lat-item[data-mod]')) fecharPainel();
    });
    carregarMenu().catch((e) => toast(traduz(e)));
  }

  // Abas da lateral = módulos com pelo menos um link liberado ao grupo.
  async function carregarMenu() {
    const mods = await ler('modulos');
    S.mods = lista(mods).map((m) => ({ ...m, _links: lista(m.links).filter((l) => linkLiberado(S.me.grupo, m, l)).sort(porOrdem) }))
      .filter((m) => m._links.length).sort(porOrdem);
    window.dispatchEvent(new CustomEvent('lamic:pronto'));
    const nav = $('#lat-nav');
    if (!nav) return;
    $$('[data-mod]', nav).forEach((b) => b.remove());
    nav.insertAdjacentHTML('beforeend', S.mods.map((m) =>
      `<button class="lat-item" data-mod="${esc(m.id)}" title="${esc(m.nome)}"><i class="${esc(m.icone)}"></i><span>${esc(m.nome)}</span></button>`).join(''));
    ligarSetasNav(nav);
    $$('[data-mod]', nav).forEach((b) => b.onclick = () => {
      if (b.classList.contains('on')) return fecharPainel();
      abrirPainel(S.mods.find((m) => m.id === b.dataset.mod), b);
    });
  }

  function fecharPainel() {
    $('#painel-links')?.classList.add('hidden');
    $$('.lat-item[data-mod]').forEach((x) => x.classList.remove('on'));
  }

  function abrirPainel(m, btn) {
    const p = $('#painel-links');
    $$('.lat-item[data-mod]').forEach((x) => x.classList.toggle('on', x === btn));
    p.innerHTML = `<div class="pl-head"><span class="mod-ic ${esc(m.cor)}"><i class="${esc(m.icone)}"></i></span>
        <h3>${esc(m.nome)}</h3><button class="pl-x" title="Fechar"><i class="fas fa-xmark"></i></button></div>
      <div class="pl-links">${m._links.map((l) => `<a href="${esc(urlSegura(urlLink(l.url)))}" data-modo="${esc(l.modo)}" data-nome="${esc(l.nome)}" target="_blank" rel="noopener">
        <i class="${esc(l.icone)}"></i><span>${esc(l.nome)}</span><i class="fas ${l.modo === 'iframe' ? 'fa-chevron-right' : 'fa-arrow-up-right-from-square'}"></i></a>`).join('')}</div>`;
    // alinha o painel com a aba clicada (desktop)
    const topo = Math.max(16, Math.min(btn.getBoundingClientRect().top - 20, innerHeight - 420));
    p.style.setProperty('--pl-top', `${topo}px`);
    // nunca passa da margem inferior da tela
    p.style.setProperty('--pl-max', `${Math.max(200, innerHeight - topo - 16)}px`);
    p.classList.remove('hidden');
    $('.pl-x', p).onclick = fecharPainel;
    $$('a', p).forEach((a) => a.onclick = (e) => {
      if (a.dataset.modo === 'iframe') { e.preventDefault(); abrirViewer(a.href, a.dataset.nome); }
      fecharPainel();
    });
  }

  async function rotear() {
    const [rota, sub] = (location.hash.slice(1) || 'avisos').split('/');
    $$('[data-r]').forEach((a) => a.classList.toggle('on', a.dataset.r === rota));
    fecharPainel();
    fecharViewer();
    const pg = $('#pagina');
    if (!pg) return;
    try {
      if (rota === 'admin' && ADMIN_PERMS.some(pode)) await paginaAdmin(pg, sub);
      else { await paginaAvisos(pg); if (rota === 'avisos') destacarAviso(sub); }
    } catch (e) { console.error(e); toast(traduz(e)); }
    if (S.suave) {
      S.suave = false;
      pg.getAnimations().forEach((a) => a.cancel());
      pg.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.22,1,.36,1)' });
    }
    atualizarContador();
  }

  // Carrossel genérico: slides com rolagem horizontal (arrasta no celular) + setas e pontos.
  // auto = ms entre trocas (0 = sem troca automática).
  function montarCarrossel(el, slidesHtml, { auto = 0, classe = '' } = {}) {
    const n = slidesHtml.length;
    if (!n) return el.innerHTML = '';
    el.innerHTML = `<div class="carrossel ${classe}"><div class="slides">${slidesHtml.join('')}</div>
      ${n > 1 ? `<button type="button" class="car-btn prev" aria-label="Anterior"><i class="fas fa-chevron-left"></i></button>
      <button type="button" class="car-btn next" aria-label="Próximo"><i class="fas fa-chevron-right"></i></button>
      <div class="dots">${slidesHtml.map((_, i) => `<button type="button" data-i="${i}" aria-label="Item ${i + 1}"></button>`).join('')}</div>` : ''}</div>`;
    if (n < 2) return;
    const trilho = $('.slides', el);
    const atual = () => Math.round(trilho.scrollLeft / trilho.clientWidth);
    const ir = (i) => trilho.scrollTo({ left: ((i + n) % n) * trilho.clientWidth, behavior: 'smooth' });
    const pontos = () => $$('.dots button', el).forEach((d, k) => d.classList.toggle('on', k === atual()));
    trilho.addEventListener('scroll', () => requestAnimationFrame(pontos), { passive: true });
    let timer = null;
    const reiniciar = () => { if (!auto) return; clearInterval(timer); timer = setInterval(() => { if (!document.body.contains(el)) return clearInterval(timer); ir(atual() + 1); }, auto); };
    $('.prev', el).onclick = (e) => { e.stopPropagation(); ir(atual() - 1); reiniciar(); };
    $('.next', el).onclick = (e) => { e.stopPropagation(); ir(atual() + 1); reiniciar(); };
    $$('.dots button', el).forEach((d) => d.onclick = (e) => { e.stopPropagation(); ir(+d.dataset.i); reiniciar(); });
    pontos(); reiniciar();
  }

  // Visualizador de sistemas internos: barra fina navy + botão Home redondo (maior que a barra)
  // que abre/fecha a mesma lateral de abas do portal, suspensa por cima do sistema.
  // Animação feita em JS (Web Animations): aparece mesmo com "efeitos de animação" do Windows desligados.
  const EASE = 'cubic-bezier(.22,1,.36,1)';
  const SOMBRA = '0 0 0 1px rgba(255,255,255,.28), 0 10px 30px rgba(0,0,0,.22), 0 0 24px rgba(143,211,224,.18)', SOMBRA0 = '0 0 0 0 rgba(255,255,255,0), 0 0 0 rgba(0,0,0,0), 0 0 0 rgba(143,211,224,0)';
  function lateralSuspensa(abrir) {
    const b = document.body, lat = $('.lateral'), topo = $('.topo-dir'), aberta = b.classList.contains('lat-viewer') && !b.classList.contains('lat-saindo');
    if (abrir === undefined) abrir = !aberta;
    $('#viewer .vhome')?.classList.toggle('on', abrir);
    if (!lat) return;
    lat.getAnimations().forEach((x) => x.cancel());
    topo?.getAnimations().forEach((x) => x.cancel());
    if (abrir) {
      // barra do usuário (nome, perfil, senha, configurações, sair) volta junto, no mesmo lugar
      topo?.animate([{ opacity: 0, transform: 'translateY(-14px) scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 520, delay: 60, easing: EASE, fill: 'backwards' });
      b.classList.remove('lat-saindo'); b.classList.add('lat-viewer');
      lat.animate([
        { opacity: 0, boxShadow: SOMBRA0, transform: 'translateY(-18px) scale(.96)', clipPath: 'inset(-40px -40px 100% -40px round 60px)' },
        { opacity: 1, boxShadow: SOMBRA, transform: 'none', clipPath: 'inset(-40px -40px -40px -40px round 60px)' },
      ], { duration: 700, easing: EASE });
      [$('.lat-logo', lat), ...$$('.lat-item', lat)].forEach((el, i) => el?.animate(
        [{ opacity: 0, transform: 'translateX(-12px)' }, { opacity: 1, transform: 'none' }],
        { duration: 380, delay: 80 + i * 40, easing: EASE, fill: 'backwards' }));
      return;
    }
    if (!b.classList.contains('lat-viewer')) return;
    fecharPainel();
    b.classList.add('lat-saindo');
    topo?.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-10px) scale(.97)' }], { duration: 260, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' });
    const an = lat.animate([
      { opacity: 1, boxShadow: SOMBRA, transform: 'none', clipPath: 'inset(-40px -40px -40px -40px round 60px)' },
      { opacity: 0, boxShadow: SOMBRA0, transform: 'translateY(-12px) scale(.97)', clipPath: 'inset(-40px -40px 100% -40px round 60px)' },
    ], { duration: 300, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' });
    an.onfinish = () => { if (b.classList.contains('lat-saindo')) { b.classList.remove('lat-viewer', 'lat-saindo'); an.cancel(); topo?.getAnimations().forEach((x) => x.cancel()); } };
  }
  // Ponte para js/chat-flutuante.js (bate-papo da Auditoria na tela inicial)
  window.LamicPortal = {
    db: () => S.db,
    me: () => S.me,
    // link "Auditoria" liberado ao usuário (URL absoluta, igual à usada ao abrir pelo menu)
    linkAuditoria() {
      for (const m of S.mods || []) for (const l of m._links || [])
        if (/auditoria[il]amic/i.test(l.url || '')) return {
          url: new URL(urlSegura(urlLink(l.url)), location.href).href, nome: l.nome, modo: l.modo,
          // chat: sempre a Auditoria do mesmo endereço do portal (local = seeds/, publicado = github.io)
          chat: new URL(PUBLICADO ? 'modulos/auditoriaIamic/index.html' : 'seeds/auditoriaIamic/index.html', location.href).href,
        };
      return null;
    },
    abrirViewer: (url, nome) => abrirViewer(url, nome),
    iframeDe: (url) => guardados.get(url)?.el.querySelector('iframe') || null,
  };
  // Sistemas abertos ficam guardados em segundo plano (display:none = sem pintura/layout, só memória).
  // Reabrir o mesmo link é instantâneo. Fecha sozinho após 1 h sem uso; no máximo 4 guardados.
  const VIEW_TTL = 60 * 60 * 1000, VIEW_MAX = 4, guardados = new Map();   // url -> { el, usado }
  function fecharViewer() {
    const v = $('#viewer');
    if (v) { v.removeAttribute('id'); v.hidden = true; const g = guardados.get(v.dataset.url); if (g) g.usado = Date.now(); }
    $('.lateral')?.getAnimations().forEach((x) => x.cancel());
    $('.topo-dir')?.getAnimations().forEach((x) => x.cancel());
    document.body.classList.remove('lat-viewer', 'lat-saindo');
    $$('.vhome.on').forEach((b) => b.classList.remove('on'));   // botão home não fica pressionado ao trocar de sistema
    marcarTopo(true);
    limparGuardados();
  }
  function limparGuardados() {
    const agora = Date.now();
    [...guardados].filter(([, g]) => g.el.hidden && agora - g.usado > VIEW_TTL).forEach(([u, g]) => { g.el.remove(); guardados.delete(u); });
    const ocultos = [...guardados].filter(([, g]) => g.el.hidden).sort((x, y) => x[1].usado - y[1].usado);
    while (ocultos.length > VIEW_MAX) { const [u, g] = ocultos.shift(); g.el.remove(); guardados.delete(u); }
  }
  setInterval(limparGuardados, 5 * 60 * 1000);
  // Botão de configurações (barra do usuário) só fica marcado quando a página de administração está à vista
  const marcarTopo = (ligado) => {
    const rota = (location.hash.slice(1) || 'avisos').split('/')[0];
    $$('.topo-dir [data-r]').forEach((a) => a.classList.toggle('on', ligado && a.dataset.r === rota));
  };
  function abrirViewer(url, nome) {
    fecharViewer();
    fecharPainel();
    marcarTopo(false);
    let g = guardados.get(url);
    if (g) { g.el.hidden = false; g.el.id = 'viewer'; g.usado = Date.now(); return; }
    const v = document.createElement('div');
    v.id = 'viewer'; v.className = 'viewer'; v.dataset.url = url;
    v.innerHTML = `<div class="vbar">
        <button class="vhome" title="Abas e links"><i class="fas fa-house"></i></button>
        <strong class="vnome">${esc(nome)}</strong></div>
      <iframe src="${esc(url)}" title="${esc(nome)}"></iframe>`;
    document.body.appendChild(v);
    $('.vhome', v).onclick = (e) => { e.stopPropagation(); lateralSuspensa(); };
    guardados.set(url, { el: v, usado: Date.now() });
  }
  // com o sistema aberto: clicar fora da lateral/painel fecha a lateral; "Avisos" fecha o sistema
  document.addEventListener('click', (e) => {
    if (!document.body.classList.contains('lat-viewer')) return;
    // abas da lateral, logo e configurações (barra do usuário): minimizam o sistema e vão para a página
    if (e.target.closest('.lateral [data-r], .lat-logo, .topo-dir [data-r]')) return fecharViewer();
    if (!e.target.closest('.lateral, #painel-links, #viewer .vhome')) lateralSuspensa(false);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('lat-viewer')) lateralSuspensa(false); });
  // clique dentro do sistema aberto (iframe) não chega neste documento: a janela perde o foco para o iframe.
  // Aí fecha a lateral/painel do home. O iframe do bate-papo não conta.
  window.addEventListener('blur', () => setTimeout(() => {
    const f = document.activeElement;
    if (f?.tagName === 'IFRAME' && f.closest('#viewer') && document.body.classList.contains('lat-viewer')) { fecharPainel(); lateralSuspensa(false); }
  }, 0));

  // ---------- anexos (Google Drive via Apps Script, mesmo modelo de seeds/respIamic) ----------
  const ANEXO_MAX = 30 * 1024 * 1024;
  const EXT_IMG = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
  const extDe = (nome) => (String(nome).split('.').pop() || '').toLowerCase();
  const imgDrive = (id, w = 1600) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${w}`;
  const ICONE_EXT = { pdf: 'fa-file-pdf', doc: 'fa-file-word', docx: 'fa-file-word', odt: 'fa-file-word', xls: 'fa-file-excel', xlsx: 'fa-file-excel', ods: 'fa-file-excel', csv: 'fa-file-csv',
    ppt: 'fa-file-powerpoint', pptx: 'fa-file-powerpoint', odp: 'fa-file-powerpoint', zip: 'fa-file-zipper', rar: 'fa-file-zipper', mp4: 'fa-file-video', mp3: 'fa-file-audio', txt: 'fa-file-lines' };

  // Apps Script responde via redirect e às vezes embrulha o JSON em HTML: tenta o JSON direto e depois o primeiro {...}.
  function respostaDrive(txt) {
    const b = String(txt || '').trim();
    try { return JSON.parse(b); } catch { /* segue */ }
    const i = b.indexOf('{'), f = b.lastIndexOf('}');
    if (i !== -1 && f > i) { try { return JSON.parse(b.slice(i, f + 1)); } catch { /* segue */ } }
    return b;
  }
  // POST sem Content-Type: o Apps Script não responde ao preflight CORS.
  async function driveRequest(payload) {
    if (!cfg.driveEndpoint) throw new Error('Endereço do Apps Script não configurado (js/config.js → driveEndpoint).');
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 120000);
    try {
      const r = await fetch(cfg.driveEndpoint, { method: 'POST', body: JSON.stringify({ ...payload, idToken: await S.auth.currentUser?.getIdToken() }), signal: ctl.signal });
      return respostaDrive(await r.text());
    } catch (e) {
      throw e.name === 'AbortError' ? new Error('O envio demorou demais e foi cancelado.') : e;
    } finally { clearTimeout(t); }
  }
  const lerDataUrl = (arq) => new Promise((ok, erro) => {
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.onerror = () => erro(new Error(`Não foi possível ler ${arq.name}.`));
    r.readAsDataURL(arq);
  });
  async function enviarAnexo(arq) {
    const ext = extDe(arq.name);
    const imagem = EXT_IMG.includes(ext);
    // fotos são reduzidas antes do envio (GIF fica como está para não perder a animação)
    const reduz = imagem && ext !== 'gif';
    const data = reduz ? await imagemReduzida(arq, 1920, 0.85) : await lerDataUrl(arq);
    const extFinal = reduz ? (data.startsWith('data:image/webp') ? 'webp' : 'png') : ext;
    const nome = reduz ? arq.name.replace(/\.[^.]+$/, '') + '.' + extFinal : arq.name;
    const resp = await driveRequest({ action: 'upload', filename: nome, data });
    if (!resp || typeof resp !== 'object') throw new Error(typeof resp === 'string' && resp ? `Resposta inesperada do servidor: ${resp.slice(0, 120)}` : 'O servidor não respondeu ao envio.');
    if (resp.success === false || resp.error) throw new Error(resp.error || resp.message || 'O servidor recusou o arquivo.');
    const fileId = resp.fileId || resp.id || null;
    const url = resp.url || (fileId ? `https://drive.google.com/file/d/${fileId}/view` : null);
    if (!url) throw new Error('O servidor não devolveu o link do arquivo.');
    return { nome, ext: extFinal, tipo: imagem ? 'imagem' : 'arquivo', fileId, url };
  }

  // Visualizador de imagens (inspirado em seeds/respIamic): zoom (botões, roda, clique, pinça),
  // arrastar com zoom, girar, anterior/próxima, baixar, abrir original e tela cheia. Sem legenda.
  // itens = [{ src, id, nome }]
  function lightbox(itens, inicio = 0) {
    $('.lightbox')?.remove();
    const MIN = 1, MAX = 5, PASSO = 0.5;
    let i = inicio, zoom = 1, px = 0, py = 0, giro = 0;
    const m = document.createElement('div');
    m.className = 'lightbox';
    const bt = (k, ic, t, cl = '') => `<button type="button" class="lb-bt ${cl}" data-lb="${k}" title="${t}" aria-label="${t}"><i class="fas ${ic}"></i></button>`;
    m.innerHTML = `<div class="lb-barra">
        ${bt('out', 'fa-magnifying-glass-minus', 'Diminuir (−)')}<span class="lb-nivel">100%</span>${bt('in', 'fa-magnifying-glass-plus', 'Aumentar (+)')}
        ${bt('reset', 'fa-compress', 'Ajustar à tela (0)')}<span class="lb-sep"></span>
        ${bt('anti', 'fa-rotate-left', 'Girar à esquerda (,)')}${bt('hora', 'fa-rotate-right', 'Girar à direita (.)')}<span class="lb-sep"></span>
        ${bt('baixar', 'fa-download', 'Baixar')}${bt('abrir', 'fa-arrow-up-right-from-square', 'Abrir original')}${bt('cheia', 'fa-expand', 'Tela cheia (F)')}
        <span class="lb-sep"></span>${bt('fechar', 'fa-xmark', 'Fechar (Esc)')}</div>
      ${itens.length > 1 ? `${bt('ant', 'fa-chevron-left', 'Anterior (←)', 'lb-nav lb-ant')}${bt('prox', 'fa-chevron-right', 'Próxima (→)', 'lb-nav lb-prox')}<span class="lb-cont"></span>` : ''}
      <div class="lb-palco"><img class="lb-img" alt="" draggable="false" referrerpolicy="no-referrer"></div>`;
    document.body.appendChild(m);
    const img = $('.lb-img', m), palco = $('.lb-palco', m), nivel = $('.lb-nivel', m);
    // Celular em pé: abre na horizontal. Tenta tela cheia + trava em paisagem (Android);
    // se o aparelho não deixar (iPhone), gira a própria janela 90° enquanto estiver em pé.
    const celular = matchMedia('(max-width: 760px) and (pointer: coarse)').matches;
    const emPe = matchMedia('(orientation: portrait)');
    let girada = false;
    const pt = (e) => (girada ? { x: e.clientY, y: -e.clientX } : { x: e.clientX, y: e.clientY });
    // só gira imagem larga (16:9 etc.); 4:3, quadrada ou em pé abre na vertical
    let larga = itens[inicio]?.larga !== false;
    const ajustarGiro = () => { girada = celular && emPe.matches && !travou && larga; m.classList.toggle('lb-paisagem', girada); };
    let travou = false;
    if (celular && emPe.matches && larga) {
      ajustarGiro();
      (async () => {
        try { await m.requestFullscreen?.({ navigationUI: 'hide' }); await screen.orientation.lock('landscape'); travou = true; }
        catch { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }
        ajustarGiro();
      })();
    }
    if (celular) emPe.addEventListener('change', ajustarGiro);
    const aplicar = (anim = true) => {
      if (zoom <= 1) { px = 0; py = 0; }
      img.style.transition = anim ? 'transform .25s cubic-bezier(.22,1,.36,1)' : 'none';
      img.style.transform = `translate(${px}px, ${py}px) scale(${zoom}) rotate(${giro}deg)`;
      nivel.textContent = `${Math.round(zoom * 100)}%`;
      palco.classList.toggle('ampliado', zoom > 1);
    };
    const setZoom = (z) => { zoom = Math.min(MAX, Math.max(MIN, z)); aplicar(); };
    const mostrar = (n) => {
      i = (n + itens.length) % itens.length; zoom = 1; giro = 0; aplicar(false);
      img.style.opacity = 0; img.src = itens[i].src; img.alt = itens[i].nome || '';
      const c = $('.lb-cont', m); if (c) c.textContent = `${i + 1} / ${itens.length}`;
    };
    img.onload = () => {
      if (celular && !travou) { larga = img.naturalWidth / img.naturalHeight > 1.45; ajustarGiro(); }
      img.style.opacity = ''; img.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220 }); };
    const fechar = () => {
      document.removeEventListener('keydown', tecla);
      emPe.removeEventListener('change', ajustarGiro);
      try { if (travou) screen.orientation.unlock(); } catch {}
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      m.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180 }).onfinish = () => m.remove();
    };
    const acoes = {
      in: () => setZoom(zoom + PASSO), out: () => setZoom(zoom - PASSO), reset: () => { zoom = 1; giro = 0; aplicar(); },
      hora: () => { giro += 90; aplicar(); }, anti: () => { giro -= 90; aplicar(); },
      ant: () => mostrar(i - 1), prox: () => mostrar(i + 1), fechar,
      abrir: () => window.open(itens[i].id ? `https://drive.google.com/file/d/${encodeURIComponent(itens[i].id)}/view` : itens[i].src, '_blank', 'noopener'),
      baixar: () => window.open(itens[i].id ? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(itens[i].id)}` : itens[i].src, '_blank', 'noopener'),
      cheia: () => document.fullscreenElement ? document.exitFullscreen() : m.requestFullscreen?.().catch(() => {}),
    };
    m.addEventListener('click', (e) => {
      const b = e.target.closest('[data-lb]');
      if (b) return acoes[b.dataset.lb]?.();
      if (e.target === palco && zoom === 1 && !arrastou) fechar();
    });
    // clique na imagem: amplia 2x no ponto clicado / volta ao normal
    let arrastou = false;
    img.addEventListener('click', (e) => {
      if (arrastou) return;
      if (zoom > 1) { zoom = 1; return aplicar(); }
      const r = img.getBoundingClientRect(), c = pt({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }), q = pt(e);
      zoom = 2; px = c.x - q.x; py = c.y - q.y; aplicar();
    });
    palco.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(zoom + (e.deltaY < 0 ? PASSO : -PASSO)); }, { passive: false });
    // arrastar (mouse/toque) com zoom; pinça para zoom; deslizar sem zoom troca de imagem
    let ini = null, dist0 = 0, zoom0 = 1;
    const toques = new Map();
    palco.addEventListener('pointerdown', (e) => {
      toques.set(e.pointerId, e); arrastou = false;
      if (toques.size === 2) { const [a, b] = [...toques.values()]; dist0 = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1; zoom0 = zoom; ini = null; }
      else { const q = pt(e); ini = { x: q.x - px, y: q.y - py, ox: q.x, oy: q.y }; }
    });
    palco.addEventListener('pointermove', (e) => {
      if (!toques.has(e.pointerId)) return;
      toques.set(e.pointerId, e);
      if (toques.size === 2) {
        const [a, b] = [...toques.values()];
        zoom = Math.min(MAX, Math.max(MIN, zoom0 * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / dist0)); aplicar(false); arrastou = true;
      } else if (ini) {
        const q = pt(e);
        if (Math.abs(q.x - ini.ox) + Math.abs(q.y - ini.oy) > 5) arrastou = true;
        if (zoom > 1) { px = q.x - ini.x; py = q.y - ini.y; aplicar(false); }
      }
    });
    const solta = (e) => {
      toques.delete(e.pointerId);
      const q = pt(e);
      if (ini && zoom === 1 && itens.length > 1 && Math.abs(q.x - ini.ox) > 60) mostrar(i + (q.x < ini.ox ? 1 : -1));
      ini = null;
    };
    palco.addEventListener('pointerup', solta); palco.addEventListener('pointercancel', solta);
    function tecla(e) {
      const k = { Escape: 'fechar', '+': 'in', '=': 'in', '-': 'out', '0': 'reset', '.': 'hora', ',': 'anti', ArrowLeft: 'ant', ArrowRight: 'prox', f: 'cheia', F: 'cheia' }[e.key];
      if (!k || ((k === 'ant' || k === 'prox') && itens.length < 2)) return;
      e.preventDefault(); acoes[k]();
    }
    document.addEventListener('keydown', tecla);
    m.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
    mostrar(inicio);
  }

  // ---------- texto formatado dos avisos ----------
  // A mensagem é guardada como HTML limitado. Ao exibir, passa SEMPRE por limparHtml (lista branca):
  // só formatação simples, sem atributos além do tamanho da fonte -> sem script/links/eventos.
  const TAGS_OK = { B: 'b', STRONG: 'b', I: 'i', EM: 'i', U: 'u', S: 's', STRIKE: 's', DEL: 's', UL: 'ul', OL: 'ol', LI: 'li', BLOCKQUOTE: 'blockquote', BR: 'br', P: 'div', DIV: 'div' };
  const FONTE_MIN = 10, FONTE_MAX = 48, FONTE_SUG = [12, 14, 16, 18, 20, 24, 28, 32, 40];
  const TAMANHOS = { 1: 'sm', 2: 'sm', 3: '', 4: 'lg', 5: 'xl', 6: 'xl', 7: 'xl' };
  function limparHtml(html) {
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    const saida = document.createElement('div');
    const copiar = (de, para) => de.childNodes.forEach((n) => {
      if (n.nodeType === 3) return para.appendChild(document.createTextNode(n.nodeValue.replace(/\u200B/g, '')));
      if (n.nodeType !== 1) return;
      let tag = TAGS_OK[n.tagName], cls = '', px = 0;
      if (n.tagName === 'FONT' || n.tagName === 'SPAN') {
        const t = n.tagName === 'FONT' ? TAMANHOS[n.getAttribute('size')] : (/\btx-(sm|lg|xl)\b/.exec(n.className) || [])[1];
        const f = n.tagName === 'SPAN' && /^\s*(\d{1,2}(?:\.\d+)?)px\s*$/.exec(n.style.fontSize || '');
        if (f) { tag = 'span'; px = Math.round(Math.min(FONTE_MAX, Math.max(FONTE_MIN, +f[1]))); }
        else if (t) { tag = 'span'; cls = `tx-${t}`; }
      }
      if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'TEMPLATE'].includes(n.tagName)) return;
      if (!tag) return copiar(n, para);          // tag desconhecida: mantém só o conteúdo
      const el = document.createElement(tag);
      if (cls) el.className = cls;
      if (px) el.style.fontSize = `${px}px`;   // único estilo permitido, número validado
      para.appendChild(el);
      copiar(n, el);
    });
    copiar(doc.body.firstChild, saida);
    return saida.innerHTML;
  }
  const ehHtml = (t) => /<\/?(b|i|u|ul|ol|li|blockquote|br|div|span|font|strong|em|p)\b/i.test(t || '');
  // texto antigo (sem HTML) continua exibido como texto puro com quebras de linha
  const corpoHtml = (t) => ehHtml(t) ? limparHtml(t) : esc(t || '').replace(/\n/g, '<br>');
  const textoDe = (html) => { const d = document.createElement('div'); d.innerHTML = limparHtml(html); return d.textContent; };

  // Emojis corporativos e amigáveis, por categoria (18 cada = grade 6×3, sem rolagem).
  const EMOJIS = [
    ['Reações', 'fa-face-smile', '😀 😊 🙂 😉 😍 😎 🤔 😮 👍 👏 🙌 🙏 💪 🤝 👋 ✌️ 👌 🤗'],
    ['Trabalho', 'fa-briefcase', '✅ ❌ ⚠️ ❗ ❓ 💡 📌 📅 ⏰ ⏳ 📢 🔔 📝 📄 📎 📊 📈 🎯'],
    ['Saúde', 'fa-heart-pulse', '🧪 🔬 🩺 💉 💊 🩸 🧬 🏥 🚑 😷 🧤 🧼 🩹 🌡️ ❤️ 💙 💚 ♻️'],
    ['Celebração', 'fa-champagne-glasses', '🎉 🎊 🥳 🎂 🎁 🎈 🏆 🥇 ⭐ 🌟 ✨ 🚀 ☕ 🍰 🌞 🌻 💐 🎶'],
  ].map(([nome, ic, l]) => ({ nome, ic, lista: l.split(' ') }));

  // Editor de texto simples sobre contenteditable. Sincroniza o HTML limpo no <textarea> escondido.
  function editorTexto(area) {
    const box = document.createElement('div');
    box.className = 'rt';
    const b = (cmd, ic, t, extra = '') => `<button type="button" class="rt-bt" data-cmd="${cmd}" ${extra} title="${t}" aria-label="${t}"><i class="fas ${ic}"></i></button>`;
    box.innerHTML = `<div class="rt-barra" role="toolbar">
        ${b('bold', 'fa-bold', 'Negrito (Ctrl+B)')}${b('italic', 'fa-italic', 'Itálico (Ctrl+I)')}${b('underline', 'fa-underline', 'Sublinhado (Ctrl+U)')}${b('strikeThrough', 'fa-strikethrough', 'Tachado')}<span class="rt-sep"></span>
        ${b('menor', 'fa-minus', 'Diminuir fonte')}<span class="rt-fonte" title="Tamanho da fonte (px)">
          <input class="rt-tam" type="number" min="${FONTE_MIN}" max="${FONTE_MAX}" step="1" value="14" aria-label="Tamanho da fonte">
          <button type="button" class="rt-tam-bt" aria-label="Tamanhos sugeridos"><i class="fas fa-chevron-down"></i></button>
          <span class="rt-tam-pop hidden">${FONTE_SUG.map((n) => `<button type="button" data-px="${n}" style="font-size:${Math.min(n, 24)}px">${n}${n === 14 ? ' <small>padrão</small>' : ''}</button>`).join('')}</span>
        </span>${b('maior', 'fa-plus', 'Aumentar fonte')}<span class="rt-sep"></span>
        ${b('insertUnorderedList', 'fa-list-ul', 'Tópicos')}${b('insertOrderedList', 'fa-list-ol', 'Lista numerada')}
        ${b('outdent', 'fa-outdent', 'Subir nível (Shift+Tab)')}${b('indent', 'fa-indent', 'Descer nível — subtópico (Tab)')}<span class="rt-sep"></span>
        ${b('citacao', 'fa-quote-right', 'Citação')}${b('emoji', 'fa-face-smile', 'Emoji')}${b('removeFormat', 'fa-eraser', 'Limpar formatação')}
      </div>
      <div class="rt-ed" contenteditable="true" role="textbox" aria-multiline="true" data-ph="${esc(area.placeholder || '')}"></div>
      <div class="rt-emojis hidden">
        <div class="rt-em-cab"><b>Emojis</b><div class="rt-em-abas">${EMOJIS.map((c, i) => `<button type="button" data-aba="${i}" class="${i ? '' : 'on'}" title="${c.nome}"><i class="fas ${c.ic}"></i></button>`).join('')}</div></div>
        <small class="rt-em-nome">${EMOJIS[0].nome}</small>
        ${EMOJIS.map((c, i) => `<div class="rt-em-grade" data-g="${i}" ${i ? 'hidden' : ''}>${c.lista.map((e) => `<button type="button" data-e="${e}">${e}</button>`).join('')}</div>`).join('')}
      </div>`;
    area.hidden = true;
    area.after(box);
    const ed = $('.rt-ed', box), pop = $('.rt-emojis', box);
    let sel = null;
    const guardar = () => { const s = getSelection(); if (s.rangeCount && ed.contains(s.anchorNode)) sel = s.getRangeAt(0).cloneRange(); };
    // copia a seleção ANTES do focus(): o evento focus chama guardar() e sobrescreveria com o cursor no início
    const restaurar = () => {
      const r = sel && ed.contains(sel.commonAncestorContainer) ? sel.cloneRange() : null;
      if (document.activeElement !== ed) ed.focus({ preventScroll: true });
      if (!r) return;
      const s = getSelection(), at = s.rangeCount ? s.getRangeAt(0) : null;
      // seleção já igual: não mexe (refazer apaga o formato pendente do cursor e o botão não desliga)
      if (at && at.startContainer === r.startContainer && at.startOffset === r.startOffset && at.endContainer === r.endContainer && at.endOffset === r.endOffset) { sel = r; return; }
      s.removeAllRanges(); s.addRange(r); sel = r;
    };
    const sync = () => { area.value = ed.textContent.trim() ? limparHtml(ed.innerHTML) : ''; estado(); };
    const estado = () => ['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList'].forEach((c) => {
      try { $(`[data-cmd="${c}"]`, box).classList.toggle('on', document.queryCommandState(c)); } catch {}
    });
    // ---- tamanho da fonte em px: vale para o texto selecionado ou para o que for digitado a seguir
    const tam = $('.rt-tam', box), tamPop = $('.rt-tam-pop', box);
    // primeiro texto dentro da seleção guardada (para ler o tamanho real do trecho)
    const noSel = () => {
      if (!sel || !ed.contains(sel.commonAncestorContainer)) return ed;
      const w = document.createTreeWalker(sel.commonAncestorContainer.nodeType === 3 ? sel.commonAncestorContainer.parentNode : sel.commonAncestorContainer, NodeFilter.SHOW_TEXT);
      for (let t = w.nextNode(); t; t = w.nextNode()) if (sel.intersectsNode(t) && t.nodeValue.replace(/​/g, '').trim()) return t.parentElement;
      const n = sel.startContainer; return n.nodeType === 1 ? n : n.parentElement;
    };
    const tamanhoAtual = () => Math.round(parseFloat(getComputedStyle(noSel()).fontSize)) || 14;
    const mostrarTam = () => { if (document.activeElement !== tam) tam.value = tamanhoAtual(); };
    // Aplica direto na seleção guardada, só com Range/DOM (sem execCommand): não precisa de foco no editor,
    // então funciona digitando no campo numérico, e a seleção continua a mesma para novos ajustes.
    function aplicarTamanho(px) {
      px = Math.round(Math.min(FONTE_MAX, Math.max(FONTE_MIN, +px || 14)));
      tam.value = px;
      if (!sel || !ed.contains(sel.commonAncestorContainer)) { ed.focus(); guardar(); }
      if (!sel) return;
      const r = sel;
      let novoSel;
      if (r.collapsed) {
        // sem seleção: trecho vazio no tamanho escolhido onde está o cursor (o que for digitado sai nele)
        const sp = document.createElement('span');
        sp.style.fontSize = `${px}px`; sp.textContent = '​';
        r.insertNode(sp);
        novoSel = document.createRange(); novoSel.setStart(sp.firstChild, 1); novoSel.collapse(true);
      } else {
        const raiz = r.commonAncestorContainer.nodeType === 3 ? r.commonAncestorContainer.parentNode : r.commonAncestorContainer;
        const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT), textos = [];
        for (let t = w.nextNode(); t; t = w.nextNode()) if (r.intersectsNode(t)) textos.push(t);
        const ini = { n: r.startContainer, o: r.startOffset }, fim = { n: r.endContainer, o: r.endOffset };
        const pecas = [];
        textos.forEach((t) => {
          let a = t === ini.n ? ini.o : 0, z = t === fim.n ? fim.o : t.length;
          if (z <= a) return;
          let parte = t;
          if (a > 0) { parte = t.splitText(a); z -= a; }
          if (z < parte.length) parte.splitText(z);
          const pai = parte.parentElement;
          if (pai.matches('span[style*="font-size"]') && pai.childNodes.length === 1) { pai.style.fontSize = `${px}px`; pecas.push(pai); return; }
          const sp = document.createElement('span');
          sp.style.fontSize = `${px}px`;
          parte.before(sp); sp.appendChild(parte); pecas.push(sp);
        });
        if (!pecas.length) return;
        novoSel = document.createRange();
        novoSel.setStart(pecas[0].firstChild, 0);
        const ult = pecas[pecas.length - 1].lastChild;
        novoSel.setEnd(ult, ult.length);
      }
      sel = novoSel;
      if (document.activeElement === ed) { const s = getSelection(); s.removeAllRanges(); s.addRange(sel); }
      else marcar();
      sync();
    }
    tam.addEventListener('input', () => { if (tam.value !== '' && +tam.value >= FONTE_MIN) aplicarTamanho(tam.value); });
    tam.addEventListener('change', () => aplicarTamanho(tam.value));
    tam.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); aplicarTamanho(tam.value); restaurar(); }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); aplicarTamanho(+tam.value + (e.key === 'ArrowUp' ? 1 : -1)); }
      if (e.key === 'Escape') { tam.value = tamanhoAtual(); restaurar(); }
    });
    $('.rt-tam-bt', box).addEventListener('click', (e) => { e.stopPropagation(); tamPop.classList.toggle('hidden'); });
    tamPop.addEventListener('click', (e) => {
      const x = e.target.closest('[data-px]'); if (!x) return;
      e.stopPropagation(); aplicarTamanho(x.dataset.px); tamPop.classList.add('hidden');
    });
    document.addEventListener('mousedown', (e) => { if (!e.target.closest('.rt-fonte')) tamPop.classList.add('hidden'); });
    const acoes = {
      maior: () => aplicarTamanho(tamanhoAtual() + (tamanhoAtual() >= 24 ? 4 : 2)),
      menor: () => aplicarTamanho(tamanhoAtual() - (tamanhoAtual() > 24 ? 4 : 2)),
      citacao: () => {
        const no = getSelection().anchorNode, q = (no?.nodeType === 1 ? no : no?.parentElement)?.closest('blockquote');
        document.execCommand('formatBlock', false, q && ed.contains(q) ? 'div' : 'blockquote');
      },
      emoji: () => pop.classList.toggle('hidden'),
    };
    $('.rt-barra', box).addEventListener('mousedown', (e) => { if (!e.target.closest('.rt-tam')) e.preventDefault(); });   // não perde a seleção
    $('.rt-barra', box).addEventListener('click', (e) => {
      const bt = e.target.closest('[data-cmd]'); if (!bt) return;
      const c = bt.dataset.cmd;
      if (c === 'maior' || c === 'menor') { acoes[c](); return; }
      restaurar();
      if (acoes[c]) acoes[c](); else document.execCommand(c, false, null);
      if (c !== 'emoji') pop.classList.add('hidden');
      guardar(); sync(); mostrarTam();
    });
    pop.addEventListener('mousedown', (e) => e.preventDefault());
    pop.addEventListener('click', (e) => {
      const aba = e.target.closest('[data-aba]');
      if (aba) {
        $$('[data-aba]', pop).forEach((x) => x.classList.toggle('on', x === aba));
        $$('.rt-em-grade', pop).forEach((g) => g.hidden = g.dataset.g !== aba.dataset.aba);
        $('.rt-em-nome', pop).textContent = EMOJIS[aba.dataset.aba].nome;
        return;
      }
      const x = e.target.closest('[data-e]'); if (!x) return;
      restaurar(); document.execCommand('insertText', false, x.dataset.e); guardar(); sync();
    });
    document.addEventListener('mousedown', (e) => { if (!e.target.closest('.rt-emojis, [data-cmd="emoji"]')) pop.classList.add('hidden'); });
    ed.addEventListener('input', sync);
    // guarda toda seleção feita no editor, mesmo arrastando e soltando o mouse fora dele
    document.addEventListener('selectionchange', () => {
      if (!document.body.contains(ed)) return;
      const sl = getSelection();
      if (sl.rangeCount && ed.contains(sl.anchorNode) && ed.contains(sl.focusNode)) { sel = sl.getRangeAt(0).cloneRange(); estado(); mostrarTam(); }
    });
    // ao sair do editor a seleção continua marcada (Custom Highlight API) e a barra age sobre ela
    function marcar() {
      if (!window.CSS?.highlights || !window.Highlight) return;
      if (sel && !sel.collapsed && ed.contains(sel.commonAncestorContainer)) CSS.highlights.set('rt-sel', new Highlight(sel));
      else CSS.highlights.delete('rt-sel');
    }
    ed.addEventListener('blur', () => { guardar(); marcar(); });
    ed.addEventListener('focus', () => window.CSS?.highlights?.delete('rt-sel'));
    ['keyup', 'mouseup', 'focus'].forEach((ev) => ed.addEventListener(ev, () => { guardar(); estado(); mostrarTam(); }));
    ed.addEventListener('keydown', (e) => {
      // Enter na citação: nova linha dentro dela; Enter numa linha vazia no fim sai da citação
      if (e.key === 'Enter' && !e.shiftKey) {
        const sl = getSelection(), no = sl.anchorNode;
        const q = (no?.nodeType === 1 ? no : no?.parentElement)?.closest('blockquote');
        if (q && ed.contains(q)) {
          e.preventDefault();
          const r = sl.getRangeAt(0), fim = document.createRange();
          fim.selectNodeContents(q); fim.setStart(r.endContainer, r.endOffset);
          const noFim = !fim.toString().replace(/​/g, '').trim();
          const linhaVazia = /(^|\n)$/.test(q.innerText.replace(/​/g, '')) || !q.textContent.trim();
          if (noFim && linhaVazia) {
            // remove a quebra/linha vazia final e cria parágrafo normal depois da citação
            while (q.lastChild && (q.lastChild.nodeName === 'BR' || (q.lastChild.nodeType === 3 && !q.lastChild.nodeValue.trim())
              || (q.lastChild.nodeType === 1 && !q.lastChild.textContent.trim() && q.lastChild.nodeName !== 'BR' && !q.lastChild.querySelector('img')))) q.lastChild.remove();
            const d = document.createElement('div'); d.appendChild(document.createElement('br'));
            q.after(d);
            if (!q.textContent.trim()) q.remove();
            const nr = document.createRange(); nr.setStart(d, 0); nr.collapse(true);
            sl.removeAllRanges(); sl.addRange(nr);
          } else document.execCommand('insertLineBreak');
          guardar(); sync(); return;
        }
      }
      if (e.key === 'Tab') {   // Tab / Shift+Tab: sobe/desce nível na árvore de tópicos
        const no = getSelection().anchorNode;
        if ((no?.nodeType === 1 ? no : no?.parentElement)?.closest('li')) { e.preventDefault(); document.execCommand(e.shiftKey ? 'outdent' : 'indent'); sync(); }
      }
    });
    // colar: só texto puro (evita trazer estilos/links de outros sites)
    ed.addEventListener('paste', (e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); });
    try { document.execCommand('defaultParagraphSeparator', false, 'div'); } catch {}
    return { definir: (t) => { ed.innerHTML = t ? corpoHtml(t) : ''; sync(); } };
  }

  // ---------- avisos ----------
  async function buscarAvisos() {
    const [snap, lei] = await Promise.all([
      ref('avisos').orderByChild('criado_em').limitToLast(200).get(),
      ler(`leituras/${S.me.login}`),
    ]);
    const agora = Date.now();
    return lista(snap.val())
      // administradores veem todos os avisos; os não destinados a eles vêm marcados como "fora"
      .map((a) => ({ ...a, fora: !paraUsuario(a, S.me.login, S.me.grupo) }))
      .filter((a) => (!a.fora || S.me.grupo === 'admin') && (!a.expira_em || a.expira_em > agora))
      .map((a) => ({ ...a, leitura: lei?.[a.id] }))
      .sort((a, b) => (b.criado_em || 0) - (a.criado_em || 0));
  }

  // sem alvo = todos; senão, o grupo ou a pessoa precisa estar marcada
  const paraUsuario = (a, login, grupo) => (!a.alvo_grupos && !a.alvo_usuarios)
    || !!a.alvo_grupos?.[grupo] || !!a.alvo_usuarios?.[login];

  const pendente = (a) => !a.fora && (!a.leitura || (a.exige_confirmacao && !a.leitura.confirmado_em));
  async function avisosPendentes() { return (await buscarAvisos()).filter(pendente); }

  async function atualizarContador() {
    const n = (await avisosPendentes().catch(() => [])).length;
    const c = $('#cont-avisos');
    if (!c) return;
    c.textContent = n;
    c.classList.toggle('hidden', !n);
  }

  // Barra inferior (celular): setas laterais aparecem só quando há itens escondidos daquele lado.
  function ligarSetasNav(nav) {
    const lat = nav.closest('.lateral'); if (!lat) return;
    const esq = $('.lat-seta.esq', lat), dir = $('.lat-seta.dir', lat);
    const atualizar = () => {
      const horiz = getComputedStyle(nav).flexDirection === 'row' && nav.scrollWidth > nav.clientWidth + 2;
      esq.hidden = !horiz || nav.scrollLeft <= 4;
      dir.hidden = !horiz || nav.scrollLeft + nav.clientWidth >= nav.scrollWidth - 4;
    };
    if (!nav.dataset.setas) {
      nav.dataset.setas = '1';
      nav.addEventListener('scroll', atualizar, { passive: true });
      window.addEventListener('resize', atualizar);
      // deslize próprio (ease-out), igual em todos os navegadores; cliques seguidos continuam do destino
      let alvo = null, raf = 0;
      const deslizar = (dx) => {
        const max = nav.scrollWidth - nav.clientWidth;
        alvo = Math.max(0, Math.min(max, (alvo ?? nav.scrollLeft) + dx));
        const de = nav.scrollLeft, ate = alvo, t0 = performance.now(), dur = 420;
        cancelAnimationFrame(raf);
        nav.style.scrollBehavior = 'auto';
        const passo = (t) => {
          const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
          nav.scrollLeft = de + (ate - de) * e;
          if (k < 1) raf = requestAnimationFrame(passo); else { alvo = null; nav.style.scrollBehavior = ''; }
        };
        raf = requestAnimationFrame(passo);
      };
      [esq, dir].forEach((b) => {
        b.addEventListener('pointerdown', (e) => e.preventDefault());   // não ganha foco/seleção
        b.onclick = (e) => { e.stopPropagation(); deslizar(+b.dataset.seta * nav.clientWidth * 0.7); };
      });
    }
    atualizar();
  }

  // ---------- vínculos: documentos (POP, Protocolo, Termo, Planilha) ligados a um aviso ----------
  const VINC_TIPOS = {
    pop: { nome: 'POP', plural: 'POPs', cat: 'POPs', seed: 'Pops', ic: 'fa-clipboard-list', cor: '#2E7DC7' },
    protocolo: { nome: 'Protocolo', plural: 'Protocolos', cat: 'Protocolos', seed: 'Protocolos', ic: 'fa-file-medical', cor: '#2AA7BE' },
    termo: { nome: 'Termo', plural: 'Termos', cat: 'Termos', seed: 'Termos', ic: 'fa-file-signature', cor: '#8B5CF6' },
    planilha: { nome: 'Planilha', plural: 'Planilhas', cat: 'Planilhas', seed: 'Planilhas', ic: 'fa-table-cells', cor: '#16A34A' },
    curso: { nome: 'Curso', plural: 'Cursos', ic: 'fa-graduation-cap', cor: '#E8833A', grupo: 'unilamic' },
  };
  // sub-abas da etapa Vínculos: cada grupo reúne tipos de vínculo
  const VINC_GRUPOS = {
    docs: { nome: 'Documentos', ic: 'fa-folder-open', dica: 'POPs, Protocolos, Termos e Planilhas' },
    unilamic: { nome: 'Cursos UniLAMIC', ic: 'fa-graduation-cap', dica: 'Plataforma › Tema › Assunto' },
  };
  const grupoDe = (tipo) => VINC_TIPOS[tipo]?.grupo || 'docs';
  // plataformas do UniLAMIC (mesmo mapeamento de seeds/Treinamentos/js/home.js)
  const UNI_PLATS = {
    treinamentos: { nome: 'Treinamentos', ic: 'fa-chalkboard-user', cor: '#2E7DC7' },
    educacao_continuada: { nome: 'Educação Continuada', ic: 'fa-book-open-reader', cor: '#8B5CF6' },
    estagios: { nome: 'Estágios', ic: 'fa-user-graduate', cor: '#16A34A' },
  };
  const UNI_DB = 'https://uniadmin-708f5-default-rtdb.firebaseio.com/uniadmin/';
  const cacheCursos = {};
  // cursos de uma plataforma: [{ tipo:'curso', plat, tema, temaNome, curso, titulo, desc, img }]
  function cursosDe(plat) {
    cacheCursos[plat] ||= fetch(`${UNI_DB}${plat}/trainingData.json`).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then((d) => Object.entries(d || {}).flatMap(([tema, s]) => (!s?.name?.trim() ? [] : Object.entries(s.themes || {})
        .filter(([, t]) => t?.name?.trim() && t.active !== false)
        .map(([curso, t]) => ({ tipo: 'curso', plat, tema, temaNome: String(s.name).trim(), curso, titulo: String(t.name).trim(),
          desc: String(t.description || '').trim(), img: typeof t.image === 'string' && /^(data:image\/|https:)/.test(t.image) ? t.image : '' }))))
        .sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR', { numeric: true })))
      .catch((e) => { delete cacheCursos[plat]; throw e; });
    return cacheCursos[plat];
  }
  const VINC_MAX = 12;
  const cacheDocs = {};
  // acervo do DocAdmin (docs/categories, mesmo banco); guardado em memória durante a sessão
  function docsDe(tipo) {
    cacheDocs[tipo] ||= ler(`docs/categories/${VINC_TIPOS[tipo].cat}`)
      .then((d) => (Array.isArray(d) ? d : Object.values(d || {})).filter((x) => x && x.title)
        .map((x) => ({ tipo, titulo: String(x.title).trim(), setor: String(x.sector || '').trim() }))
        .sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR', { numeric: true })))
      .catch((e) => { delete cacheDocs[tipo]; throw e; });
    return cacheDocs[tipo];
  }
  const vinculosDe = (a) => (Array.isArray(a.vinculos) ? a.vinculos : Object.values(a.vinculos || {}))
    .filter((v) => v && VINC_TIPOS[v.tipo] && v.titulo && (v.tipo !== 'curso' || (UNI_PLATS[v.plat] && v.tema && v.curso)));
  // só os campos que vão para o banco (curso guarda o caminho plataforma/tema/assunto)
  const vincSalvo = (v) => (v.tipo === 'curso'
    ? { tipo: 'curso', titulo: v.titulo, plat: v.plat, tema: v.tema, curso: v.curso, temaNome: v.temaNome || '' }
    : { tipo: v.tipo, titulo: v.titulo });
  // abre a seed já no documento (a seed lê ?doc= e abre sozinha); curso abre o portal do UniLAMIC direto no assunto
  function abrirVinculo(v) {
    const T = VINC_TIPOS[v.tipo]; if (!T) return;
    if (v.tipo === 'curso') {
      const P = UNI_PLATS[v.plat]; if (!P) return;
      return abrirViewer(`seeds/Treinamentos/portal.html?cat=${encodeURIComponent(P.nome)}&tema=${encodeURIComponent(v.tema)}&curso=${encodeURIComponent(v.curso)}`, `UniLAMIC · ${v.titulo}`);
    }
    abrirViewer(`seeds/${T.seed}/index.html?doc=${encodeURIComponent(v.titulo)}`, `${T.nome} · ${v.titulo}`);
  }
  // card do curso no aviso: miniatura (imagem do curso, carregada depois), plataforma, tema e descrição
  function cardCurso(v) {
    const P = UNI_PLATS[v.plat];
    return `<button type="button" class="av-curso" style="--c:${P.cor}" data-vinc="${esc(JSON.stringify(vincSalvo(v)))}" data-curso-img="${esc(`${v.plat}|${v.tema}|${v.curso}`)}" title="Abrir curso">
      <span class="av-curso-th"><span class="av-curso-ini">${esc(iniciais(v.titulo))}</span></span>
      <span class="av-curso-tx"><small><i class="fas fa-graduation-cap"></i> UniLAMIC · ${esc(P.nome)}</small><b>${esc(v.titulo)}</b>
        ${v.temaNome ? `<em><i class="fas fa-bookmark"></i> ${esc(v.temaNome)}</em>` : ''}<span class="av-curso-desc"></span></span>
      <span class="av-curso-ir">Acessar curso <i class="fas fa-arrow-right"></i></span></button>`;
  }
  // completa os cards de curso com imagem e descrição atuais do UniLAMIC
  function ligarCursos(root) {
    $$('[data-curso-img]', root).forEach((b) => {
      const [plat, tema, curso] = b.dataset.cursoImg.split('|');
      cursosDe(plat).then((l) => {
        const c = l.find((x) => x.tema === tema && x.curso === curso); if (!c) return;
        if (c.img) { const th = $('.av-curso-th', b), img = new Image(); img.alt = ''; img.loading = 'lazy'; img.onload = () => { th.textContent = ''; th.appendChild(img); }; img.src = c.img; }
        if (c.desc) $('.av-curso-desc', b).textContent = c.desc;
      }).catch(() => {});
    });
  }

  const anexosDe = (a) => (Array.isArray(a.anexos) ? a.anexos : Object.values(a.anexos || {})).filter((x) => x && x.url);

  function cartaoAviso(a) {
    const l = a.leitura;
    const anexos = anexosDe(a);
    const imgs = anexos.filter((x) => x.tipo === 'imagem' && x.fileId);
    const arqs = anexos.filter((x) => !(x.tipo === 'imagem' && x.fileId));
    const nomesAlvo = [...Object.keys(a.alvo_grupos || {}).map((g) => S.grupos.find((x) => x.id === g)?.nome || g),
      ...Object.keys(a.alvo_usuarios || {}).map((u) => `@${u}`)];
    const status = a.fora
      ? `<span class="tag pend" title="Você vê este aviso por ser administrador"><i class="fas fa-eye"></i> Destinado a: ${esc(nomesAlvo.join(', '))}</span>`
      : a.exige_confirmacao
      ? (l?.confirmado_em ? `<span class="tag ok">Confirmado ${dataBR(l.confirmado_em)}</span>` : `<span class="tag pend">Aguardando confirmação</span>`)
      : (l ? `<span class="tag ok">Lido</span>` : '');
    return `<article class="aviso ${esc(a.prioridade)} ${pendente(a) ? 'novo' : ''}" data-id="${esc(a.id)}">
      <h3>${esc(a.titulo)} <span class="tag ${esc(a.prioridade)}">${esc(a.prioridade)}</span></h3>
      <div class="meta">${dataBR(a.criado_em)}${a.expira_em ? ` · expira ${dataBR(a.expira_em)}` : ''}${a.editado_em ? ` · editado ${dataBR(a.editado_em)}` : ''}</div>
      ${a.corpo ? `<div class="corpo rt-txt">${corpoHtml(a.corpo)}</div>` : ''}
      ${imgs.length ? `<div class="av-galeria" data-imgs="${esc(JSON.stringify(imgs.map((x) => ({ id: x.fileId, nome: x.nome }))))}"></div>` : ''}
      ${arqs.length ? `<div class="av-arqs">${arqs.map((x) => `<a href="${esc(urlSegura(x.url))}" target="_blank" rel="noopener" class="av-arq">
        <i class="fas ${ICONE_EXT[x.ext] || (x.tipo === 'imagem' ? 'fa-file-image' : 'fa-file')}"></i><span>${esc(x.nome)}</span></a>`).join('')}</div>` : ''}
      ${vinculosDe(a).some((v) => v.tipo === 'curso') ? `<div class="av-cursos">${vinculosDe(a).filter((v) => v.tipo === 'curso').map(cardCurso).join('')}</div>` : ''}
      ${vinculosDe(a).some((v) => v.tipo !== 'curso') ? `<div class="av-vincs">${vinculosDe(a).filter((v) => v.tipo !== 'curso').map((v) => { const T = VINC_TIPOS[v.tipo];
        return `<button type="button" class="av-vinc" style="--c:${T.cor}" data-vinc="${esc(JSON.stringify({ tipo: v.tipo, titulo: v.titulo }))}" title="Abrir ${esc(T.nome)}">
          <span class="av-vinc-ic"><i class="fas ${T.ic}"></i></span><span class="av-vinc-tx"><small>${T.nome}</small><b>${esc(v.titulo)}</b></span><i class="fas fa-arrow-right av-vinc-seta"></i></button>`; }).join('')}</div>` : ''}
      <div class="acoes">${status}
        ${!a.fora && !l && !a.exige_confirmacao ? `<button class="btn sm ghost" data-ac="ler">Marcar como lido</button>` : ''}
        ${!a.fora && a.exige_confirmacao && !l?.confirmado_em ? `<button class="btn sm turq" data-ac="confirmar"><i class="fas fa-check"></i> Li e estou ciente</button>` : ''}
        ${pode('avisos.relatorio') ? `<button class="btn sm ghost" data-ac="relatorio"><i class="fas fa-list-check"></i> Quem leu</button>` : ''}
        ${pode('avisos.publicar') ? `<button class="btn sm ghost" data-ac="editar" title="Editar aviso"><i class="fas fa-pen"></i></button>` : ''}
        ${pode('avisos.publicar') ? `<button class="btn sm ghost" data-ac="excluir" title="Excluir aviso"><i class="fas fa-trash"></i></button>` : ''}
      </div></article>`;
  }

  // galerias de imagens dos avisos viram carrossel; clique abre a imagem grande
  function ligarGalerias(root) {
    $$('.av-galeria', root).forEach((g) => {
      const imgs = JSON.parse(g.dataset.imgs || '[]');
      montarCarrossel(g, imgs.map((x) => `<div class="slide"><img src="${esc(imgDrive(x.id, 1200))}" alt="${esc(x.nome)}" loading="lazy" referrerpolicy="no-referrer"></div>`), { classe: 'galeria' });
      const fotos = $$('.slide img', g);
      fotos.forEach((img, i) => img.onclick = () => lightbox(imgs.map((x, j) => {
        const f = fotos[j], r = f?.naturalWidth ? f.naturalWidth / f.naturalHeight : null;
        return { src: imgDrive(x.id, 2400), id: x.id, nome: x.nome, larga: r == null ? null : r > 1.45 };
      }), i));
    });
  }

  // lido_em é gravado uma vez; confirmado_em também não muda depois (regra do banco)
  async function marcar(id, confirmar) {
    const r = ref(`leituras/${S.me.login}/${id}`);
    const atual = (await r.get()).val();
    if (atual && (!confirmar || atual.confirmado_em)) return;
    const reg = { lido_em: atual?.lido_em || TS() };
    if (confirmar) reg.confirmado_em = TS();
    await r.update(reg);
  }

  function ligarAvisos(root) {
    ligarGalerias(root);
    ligarCursos(root);
    $$('[data-vinc]', root).forEach((b) => b.onclick = () => { try { abrirVinculo(JSON.parse(b.dataset.vinc)); } catch {} });
    $$('[data-ac]', root).forEach((b) => b.onclick = async () => {
      const id = b.closest('.aviso').dataset.id;
      try {
        if (b.dataset.ac === 'ler') await marcar(id, false);
        if (b.dataset.ac === 'confirmar') await marcar(id, true);
        if (b.dataset.ac === 'relatorio') return relatorio(id);
        if (b.dataset.ac === 'editar') { const av = await ler(`avisos/${id}`); return av ? formAviso({ id, ...av }) : toast('Aviso não encontrado.'); }
        if (b.dataset.ac === 'excluir') {
          if (!(await confirmarAcao('Excluir este aviso para todos? Os anexos também serão apagados do Drive.'))) return;
          const aviso = await ler(`avisos/${id}`);
          await ref(`avisos/${id}`).remove();
          anexosDe(aviso || {}).forEach((x) => { if (x.fileId) driveRequest({ action: 'delete', id: x.fileId }).catch(() => {}); });
          auditar('aviso_excluido', aviso?.titulo || id);
        }
        rotear();
      } catch (e) { toast(traduz(e)); }
    });
  }

  // Confirmação no estilo do portal (substitui o window.confirm).
  // Texto "Pergunta? Detalhe." vira título + descrição. Ações de excluir/remover ficam em vermelho.
  function confirmarAcao(txt, { ok = null, perigo = null } = {}) {
    const i = txt.indexOf('?');
    const titulo = i > -1 ? txt.slice(0, i + 1) : txt;
    const desc = i > -1 ? txt.slice(i + 1).trim() : '';
    const risco = perigo ?? /excluir|remover|apagar/i.test(titulo);
    const rotulo = ok || (risco ? (titulo.match(/^(Excluir|Remover|Apagar)/i)?.[1] || 'Confirmar') : 'Confirmar');
    return new Promise((fim) => {
      const m = document.createElement('div');
      m.className = 'modal conf-modal';
      m.innerHTML = `<div class="conf-box ${risco ? 'risco' : ''}" role="alertdialog" aria-modal="true" aria-labelledby="conf-t">
        <div class="conf-ic"><i class="fas ${risco ? 'fa-trash-can' : 'fa-circle-question'}"></i></div>
        <h2 id="conf-t">${esc(titulo)}</h2>
        ${desc ? `<p>${esc(desc)}</p>` : ''}
        ${risco ? '<div class="conf-alerta"><i class="fas fa-triangle-exclamation"></i> Esta ação não pode ser desfeita.</div>' : ''}
        <div class="conf-acoes"><button type="button" class="btn ghost" data-n>Cancelar</button>
          <button type="button" class="btn ${risco ? 'perigo' : 'turq'}" data-s><i class="fas ${risco ? 'fa-trash' : 'fa-check'}"></i> ${esc(rotulo)}</button></div></div>`;
      const sair = (v) => { document.removeEventListener('keydown', tecla); m.classList.add('saindo'); setTimeout(() => m.remove(), 180); fim(v); };
      const tecla = (e) => { if (e.key === 'Escape') sair(false); };
      m.addEventListener('click', (e) => { if (e.target === m) sair(false); });
      $('[data-n]', m).onclick = () => sair(false);
      $('[data-s]', m).onclick = () => sair(true);
      document.addEventListener('keydown', tecla);
      document.body.appendChild(m);
      $('[data-n]', m).focus();   // foco em Cancelar: Enter não apaga por engano
    });
  }

  // Página padrão: faixa no estilo do site + quadro de avisos.
  async function paginaAvisos(pg) {
    const hora = new Date().getHours();
    const saud = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
    pg.innerHTML = `<section class="hero">
        <div class="hero-txt">
          <div class="hero-dots"><i></i><i></i><i></i></div>
          <p class="hero-saud">${saud}, ${esc(S.me.nome.split(' ')[0])}</p>
          <h1>Quadro de<br><b>Avisos LAMIC</b></h1>
          ${pode('avisos.publicar') ? `<button class="btn hero-btn" id="novo"><i class="fas fa-plus"></i> Novo aviso</button>` : ''}
        </div>
      </section>
      <div class="quadro"><div class="eyebrow"><i class="fas fa-heart"></i> Comunicação interna</div>
        <div id="lista"></div></div>`;
    const avisos = await buscarAvisos();
    // ao abrir a página, avisos simples ficam como lidos
    const simples = avisos.filter((a) => !a.fora && !a.leitura && !a.exige_confirmacao);
    if (simples.length) {
      await ref(`leituras/${S.me.login}`).update(Object.fromEntries(simples.map((a) => [`${a.id}/lido_em`, TS()]))).catch(() => {});
    }
    const el = $('#lista');
    el.innerHTML = avisos.map(cartaoAviso).join('') || `<div class="card vazio">Nenhum aviso por enquanto.</div>`;
    ligarAvisos(el);
    if ($('#novo')) $('#novo').onclick = () => formAviso();
  }

  // Popover flutuante: fica por cima da janela (position: fixed), alinhado ao campo.
  // Abre para baixo; sem espaço, abre para cima. Acompanha rolagem e redimensionamento enquanto aberto.
  function flutuar(pop, ancora) {
    const pos = () => {
      if (pop.classList.contains('hidden') || !document.body.contains(pop)) return parar();
      const r = ancora.getBoundingClientRect();
      const margem = 8, alt = Math.min(pop.scrollHeight, 320);
      const baixo = innerHeight - r.bottom - margem, cima = r.top - margem;
      const paraCima = baixo < alt && cima > baixo;
      pop.style.left = `${Math.max(margem, r.left)}px`;
      pop.style.width = `${r.width}px`;
      pop.style.maxHeight = `${Math.max(140, Math.min(320, paraCima ? cima - 6 : baixo - 6))}px`;
      pop.style.top = paraCima ? '' : `${r.bottom + 6}px`;
      pop.style.bottom = paraCima ? `${innerHeight - r.top + 6}px` : '';
      pop.classList.toggle('acima', paraCima);
    };
    const parar = () => { removeEventListener('scroll', pos, true); removeEventListener('resize', pos); };
    addEventListener('scroll', pos, true);
    addEventListener('resize', pos);
    pos();
    return pos;
  }

  // Seleção múltipla com busca: chips na caixa + popover com resultados filtrados.
  // opcoes: [{ v, rotulo, sub, icone }]; de(prefixo) devolve { id: true } dos marcados com aquele prefixo (ou null).
  function multiSelecao(el, opcoes, placeholder, marcados = []) {
    const sel = new Set(marcados.filter((v) => opcoes.some((o) => o.v === v)));
    const sem = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    el.innerHTML = `<div class="msel-caixa"><span class="msel-chips"></span>
        <input type="text" placeholder="${esc(placeholder)}" autocomplete="off"><i class="fas fa-magnifying-glass msel-lupa"></i></div>
      <div class="msel-pop hidden" role="listbox"></div>`;
    const caixa = $('.msel-caixa', el), chips = $('.msel-chips', el), inp = $('input', el), pop = $('.msel-pop', el);
    let ativo = 0;
    const filtradas = () => opcoes.filter((o) => sem(`${o.rotulo} ${o.sub}`).includes(sem(inp.value.trim())));
    const desenharChips = () => {
      chips.innerHTML = [...sel].map((v) => { const o = opcoes.find((x) => x.v === v);
        return `<span class="msel-chip ${v.startsWith('g:') ? 'grupo' : ''}"><i class="fas ${o.icone}"></i>${esc(o.rotulo)}<button type="button" data-tira="${esc(v)}" aria-label="Remover"><i class="fas fa-xmark"></i></button></span>`; }).join('');
      $$('[data-tira]', chips).forEach((b) => b.onclick = (e) => { e.stopPropagation(); sel.delete(b.dataset.tira); desenharChips(); desenharPop(); });
      inp.placeholder = sel.size ? 'Adicionar…' : placeholder;
    };
    const desenharPop = () => {
      const l = filtradas();
      ativo = Math.min(ativo, Math.max(0, l.length - 1));
      let grupoAnt = '';
      pop.innerHTML = l.length ? l.map((o, i) => {
        const cab = o.sub === 'Grupo' ? 'Grupos' : 'Pessoas';
        const h = cab !== grupoAnt ? `<div class="msel-cab">${cab}</div>` : '';
        grupoAnt = cab;
        return `${h}<div class="msel-op ${sel.has(o.v) ? 'on' : ''} ${i === ativo ? 'ativo' : ''}" data-v="${esc(o.v)}" role="option">
          <span class="msel-av ${o.sub === 'Grupo' ? 'grupo' : ''}">${o.sub === 'Grupo' ? '<i class="fas fa-users"></i>' : esc(iniciais(o.rotulo))}</span>
          <span class="msel-tx"><b>${esc(o.rotulo)}</b><small>${esc(o.sub)}</small></span><i class="fas fa-check msel-ok"></i></div>`;
      }).join('') : '<div class="msel-vazio">Nada encontrado.</div>';
      $$('.msel-op', pop).forEach((d) => d.onmousedown = (e) => { e.preventDefault(); alternar(d.dataset.v); });
    };
    const alternar = (v) => { sel.has(v) ? sel.delete(v) : sel.add(v); inp.value = ''; desenharChips(); desenharPop(); reposicionar?.(); inp.focus(); };
    let reposicionar = null;
    const abrir = () => { const ja = !pop.classList.contains('hidden'); pop.classList.remove('hidden'); el.classList.add('aberto'); desenharPop();
      if (!ja) reposicionar = flutuar(pop, caixa); else reposicionar?.(); };
    const fechar = () => { pop.classList.add('hidden'); el.classList.remove('aberto'); };
    caixa.onclick = () => inp.focus();
    inp.onfocus = abrir;
    inp.onblur = () => setTimeout(fechar, 120);
    inp.oninput = () => { ativo = 0; abrir(); };
    inp.onkeydown = (e) => {
      const l = filtradas();
      if (e.key === 'ArrowDown') { e.preventDefault(); ativo = Math.min(ativo + 1, l.length - 1); desenharPop(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); ativo = Math.max(ativo - 1, 0); desenharPop(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (l[ativo]) alternar(l[ativo].v); }
      else if (e.key === 'Escape') { e.stopPropagation(); inp.blur(); }
      else if (e.key === 'Backspace' && !inp.value && sel.size) { sel.delete([...sel].pop()); desenharChips(); desenharPop(); }
      $('.msel-op.ativo', pop)?.scrollIntoView({ block: 'nearest' });
    };
    desenharChips();
    return {
      de: (pref) => { const ids = [...sel].filter((v) => v.startsWith(pref)).map((v) => v.slice(pref.length));
        return ids.length ? Object.fromEntries(ids.map((x) => [x, true])) : null; },
      rotulos: () => [...sel].map((v) => opcoes.find((o) => o.v === v)?.rotulo).filter(Boolean),
    };
  }

  // Sem argumento: novo aviso. Com um aviso: edição (mantém autor, data e leituras).
  async function formAviso(ed = null) {
    const pessoas = lista(await ler('usuarios')).filter((u) => u.ativo).sort(porNome);
    const PRIOS = [['normal', 'Normal', 'fa-circle-info', 'Comunicado do dia a dia'],
      ['importante', 'Importante', 'fa-triangle-exclamation', 'Merece atenção da equipe'],
      ['urgente', 'Urgente', 'fa-bolt', 'Ação imediata necessária']];
    const PASSOS = [['conteudo', 'Conteúdo', 'fa-pen'], ['anexos', 'Anexos', 'fa-paperclip'], ['vinculos', 'Vínculos', 'fa-link'], ['publico', 'Público', 'fa-users'], ['revisao', 'Revisão', 'fa-circle-check']];
    const m = modal(`<form class="wz" novalidate>
      <header class="wz-head">
        <div class="wz-topo"><span class="wz-ic"><i class="fas ${ed ? 'fa-pen-to-square' : 'fa-bullhorn'}"></i></span>
          <div><h2>${ed ? 'Editar aviso' : 'Novo aviso'}</h2><small>Comunicação interna · etapa <b id="wz-n">1</b> de ${PASSOS.length}</small></div>
          <button type="button" class="wz-x" data-x title="Fechar"><i class="fas fa-xmark"></i></button></div>
        <nav class="wz-passos">${PASSOS.map(([id, nome, ic], i) => `<button type="button" data-ir="${i}"><span class="wz-bola"><i class="fas ${ic}"></i></span><span>${nome}</span></button>`).join('')}</nav>
        <div class="wz-barra"><i></i></div>
      </header>
      <div class="wz-corpo">
        <section class="wz-etapa" data-e="0">
          <label class="field"><span>Título</span><input name="titulo" required maxlength="120" placeholder="Ex.: Novo horário da coleta domiciliar"></label>
          <div class="field"><span>Mensagem</span><textarea name="corpo" placeholder="Escreva o aviso…"></textarea></div>
          <div class="field"><span>Prioridade</span>
            <div class="psel"><input type="hidden" name="prioridade" value="normal">
              <button type="button" class="psel-bt" aria-haspopup="listbox"></button>
              <div class="psel-pop hidden" role="listbox">${PRIOS.map(([v, r, ic, d]) =>
                `<button type="button" class="psel-op ${v}" data-v="${v}" role="option"><span class="psel-ic"><i class="fas ${ic}"></i></span>
                  <span class="psel-tx"><b>${r}</b><small>${d}</small></span><i class="fas fa-check psel-ok"></i></button>`).join('')}</div></div></div>
        </section>
        <section class="wz-etapa" data-e="1" hidden>
          <label class="anexo-zona" tabindex="0"><input type="file" multiple hidden>
            <i class="fas fa-cloud-arrow-up"></i><b>Clique ou arraste arquivos aqui</b><small>Imagens, PDF, Word, planilhas… até 30 MB cada · imagens aparecem em carrossel</small></label>
          <div class="img-dica"><i class="fas fa-image"></i>
            <span><b>Imagem ideal:</b> 1920 × 1080 px (16:9), PNG com fundo transparente ou WebP. Será convertida para WebP automaticamente.</span>
            <span class="img-modelo-box"><button type="button" class="img-modelo" aria-haspopup="menu" title="Baixar modelo transparente"><i class="fas fa-download"></i> Modelo PNG <i class="fas fa-chevron-down img-modelo-seta"></i></button>
              <span class="img-modelo-pop hidden" role="menu"><span class="imp-abas" role="tablist">${['Computador', 'Celular'].map((g, k) => `<button type="button" role="tab" data-imp-aba="${g}" class="${k ? '' : 'on'}"><i class="fas ${k ? 'fa-mobile-screen' : 'fa-desktop'}"></i> ${g}</button>`).join('')}</span>${MODELOS_IMG.map(([id, nome, w, h, d, grupo]) => `<button type="button" role="menuitem" data-modelo="${id}" data-grupo="${grupo}" ${grupo === 'Computador' ? '' : 'hidden'}>
                <span class="imp-prev imp-${id}"></span><span class="imp-tx"><b>${nome}</b><small>${w} × ${h} px · ${d}</small></span><i class="fas fa-download imp-dl"></i></button>`).join('')}</span></span></div>
          <ul class="anexo-lista"></ul>
          <p class="wz-nota"><i class="fas fa-circle-info"></i> Etapa opcional. Os arquivos novos só são enviados ao ${ed ? 'salvar' : 'publicar'}.</p>
        </section>
        <section class="wz-etapa" data-e="2" hidden>
          <div class="vc">
            <div class="vc-sel"></div>
            <div class="vc-grupos" role="tablist">${Object.entries(VINC_GRUPOS).map(([k, G], i) => `<button type="button" role="tab" data-grupo="${k}" class="${i ? '' : 'on'}" aria-selected="${!i}">
              <i class="fas ${G.ic}"></i><span><b>${G.nome}</b><small>${G.dica}</small></span></button>`).join('')}</div>
            <div class="vc-tipos" data-g="docs">${Object.entries(VINC_TIPOS).filter(([k]) => grupoDe(k) === 'docs').map(([k, T], i) => `<button type="button" data-tipo="${k}" class="${i ? '' : 'on'}" style="--c:${T.cor}">
              <span class="vc-tipo-ic"><i class="fas ${T.ic}"></i></span><span>${T.plural}</span><em data-qt="${k}">…</em></button>`).join('')}</div>
            <div class="vc-tipos vc-plats" data-g="unilamic" hidden>${Object.entries(UNI_PLATS).map(([k, P], i) => `<button type="button" data-plat="${k}" class="${i ? '' : 'on'}" style="--c:${P.cor}">
              <span class="vc-tipo-ic"><i class="fas ${P.ic}"></i></span><span>${P.nome}</span><em data-qtp="${k}">…</em></button>`).join('')}</div>
            <div class="vc-busca"><i class="fas fa-magnifying-glass"></i><input type="search" placeholder="Pesquisar pelo nome ou número…" aria-label="Pesquisar documento">
              <kbd>Enter</kbd></div>
            <div class="vc-setores"></div>
            <ul class="vc-lista" role="listbox" aria-multiselectable="true"></ul>
          </div>
          <p class="wz-nota"><i class="fas fa-circle-info"></i> Etapa opcional. No aviso, clicar no vínculo abre o documento ou o curso direto.</p>
        </section>
        <section class="wz-etapa" data-e="3" hidden>
          <div class="field"><span>Para quem</span>
            <div class="msel" id="ms-alvo"></div>
            <small class="msel-dica">Nenhum grupo ou pessoa selecionado = aviso para todos.</small></div>
          <label class="toggle"><input type="checkbox" name="exige_confirmacao"><span class="tg"></span>
            <span class="tg-txt"><b>Exigir confirmação de leitura</b><small>O colaborador precisa clicar em "Li e estou ciente"</small></span></label>
          <label class="field"><span>Expira em (opcional)</span><input name="expira_em" type="datetime-local"></label>
        </section>
        <section class="wz-etapa" data-e="4" hidden><div id="wz-resumo"></div>
          <p class="wz-nota"><i class="fas fa-user-shield"></i> Não inclua dados de pacientes (LGPD).</p></section>
      </div>
      <footer class="wz-pe">
        <button type="button" class="btn ghost" data-x>Cancelar</button>
        <span class="wz-esp"></span>
        <button type="button" class="btn ghost" data-voltar><i class="fas fa-arrow-left"></i> Voltar</button>
        <button type="submit" class="btn turq" data-pub>Próximo <i class="fas fa-arrow-right"></i></button>
      </footer></form>`, { bloqueante: true });
    $('.modal-box', m).classList.add('wizard');

    const alvo = multiSelecao($('#ms-alvo', m), [
      ...S.grupos.map((g) => ({ v: `g:${g.id}`, rotulo: g.nome, sub: 'Grupo', icone: 'fa-users' })),
      ...pessoas.map((p) => ({ v: `u:${p.id}`, rotulo: p.nome, sub: `@${p.id}`, icone: 'fa-user' })),
    ], 'Pesquisar grupo ou pessoa…', ed ? [...Object.keys(ed.alvo_grupos || {}).map((g) => `g:${g}`), ...Object.keys(ed.alvo_usuarios || {}).map((u) => `u:${u}`)] : []);
    const arquivos = [];
    const existentes = ed ? anexosDe(ed) : [];   // anexos já publicados (podem ser removidos)
    const removidos = [];
    const zona = $('.anexo-zona', m), input = $('input[type=file]', m), ul = $('.anexo-lista', m);
    const desenhar = () => {
      ul.innerHTML = existentes.map((x, i) => `<li class="ja"><i class="fas ${x.tipo === 'imagem' ? 'fa-file-image' : ICONE_EXT[x.ext] || 'fa-file'}"></i>
        <span>${esc(x.nome)}</span><small>publicado</small><button type="button" data-rmx="${i}" title="Remover"><i class="fas fa-xmark"></i></button></li>`).join('') + arquivos.map((f, i) => `<li><i class="fas ${EXT_IMG.includes(extDe(f.name)) ? 'fa-file-image' : ICONE_EXT[extDe(f.name)] || 'fa-file'}"></i>
        <span>${esc(f.name)}</span><small>${(f.size / 1048576).toFixed(1)} MB</small><button type="button" data-rm="${i}" title="Remover"><i class="fas fa-xmark"></i></button></li>`).join('');
      $$('[data-rm]', ul).forEach((b) => b.onclick = () => { arquivos.splice(+b.dataset.rm, 1); desenhar(); });
      $$('[data-rmx]', ul).forEach((b) => b.onclick = () => { removidos.push(...existentes.splice(+b.dataset.rmx, 1)); desenhar(); });
    };
    const adicionar = (lista) => {
      [...lista].forEach((f) => {
        if (f.size > ANEXO_MAX) return toast(`${f.name}: maior que 30 MB.`);
        arquivos.push(f);
      });
      desenhar();
    };
    input.onchange = () => { adicionar(input.files); input.value = ''; };
    zona.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } };
    ['dragenter', 'dragover'].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.add('sobre'); }));
    ['dragleave', 'drop'].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.remove('sobre'); }));
    zona.addEventListener('drop', (e) => adicionar(e.dataTransfer.files));

    // ---- vínculos: sub-abas (Documentos | Cursos UniLAMIC), busca, filtro, seleção múltipla
    const vincs = ed ? vinculosDe(ed).map(vincSalvo) : [];
    const vc = $('.vc', m), vcLista = $('.vc-lista', vc), vcBusca = $('.vc-busca input', vc), vcSet = $('.vc-setores', vc);
    let vcGrupo = 'docs', vcTipo = 'pop', vcPlat = 'treinamentos', vcSetor = '', vcDocs = [];
    const chave = (v) => (v.tipo === 'curso' ? `curso|${v.plat}|${v.tema}|${v.curso}` : `${v.tipo}|${v.titulo}`);
    const escolhido = (d) => vincs.some((v) => chave(v) === chave(d));
    const normal = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const corDe = (v) => (v.tipo === 'curso' ? UNI_PLATS[v.plat]?.cor || VINC_TIPOS.curso.cor : VINC_TIPOS[v.tipo].cor);
    const desenharSel = () => {
      const box = $('.vc-sel', vc);
      box.innerHTML = vincs.length
        ? `<div class="vc-sel-cab"><b><i class="fas fa-link"></i> ${vincs.length} vinculado${vincs.length > 1 ? 's' : ''}</b><button type="button" data-limpar>Limpar</button></div>
           <div class="vc-chips">${vincs.map((v, i) => { const T = VINC_TIPOS[v.tipo];
             return `<span class="vc-chip" style="--c:${corDe(v)}"><i class="fas ${T.ic}"></i><span title="${esc(v.titulo)}">${esc(v.titulo)}</span><button type="button" data-rmv="${i}" title="Remover"><i class="fas fa-xmark"></i></button></span>`; }).join('')}</div>`
        : `<div class="vc-vazio"><span><i class="fas fa-link"></i></span><div><b>Nenhum vínculo</b><small>Escolha abaixo documentos (POPs, Protocolos, Termos, Planilhas) ou cursos do UniLAMIC relacionados ao aviso.</small></div></div>`;
      $$('[data-rmv]', box).forEach((b) => b.onclick = () => { vincs.splice(+b.dataset.rmv, 1); desenharSel(); desenharLista(); });
      $('[data-limpar]', box)?.addEventListener('click', () => { vincs.length = 0; desenharSel(); desenharLista(); });
    };
    // curso: com busca digitada procura em todos os temas da plataforma; sem busca, só no tema escolhido
    const filtrados = () => {
      const q = normal(vcBusca.value.trim());
      if (vcGrupo === 'unilamic') return vcDocs.filter((d) => (q ? normal(`${d.titulo} ${d.temaNome} ${d.desc}`).includes(q) : d.tema === vcSetor));
      return vcDocs.filter((d) => (!vcSetor || d.setor === vcSetor) && (!q || normal(`${d.titulo} ${d.setor}`).includes(q)));
    };
    const desenharLista = () => {
      const itens = filtrados();
      if (!vcDocs.length) return;
      const T = VINC_TIPOS[vcTipo], cor = vcGrupo === 'unilamic' ? UNI_PLATS[vcPlat].cor : T.cor;
      vcLista.innerHTML = itens.length ? itens.slice(0, 200).map((d, i) => `<li><button type="button" role="option" aria-selected="${escolhido(d)}" class="vc-it ${d.tipo === 'curso' ? 'vc-it-curso' : ''} ${escolhido(d) ? 'on' : ''}" data-i="${i}" style="--c:${cor};animation-delay:${Math.min(i, 12) * 18}ms">
          ${d.tipo === 'curso'
            ? `<span class="vc-it-th">${d.img ? `<img src="${esc(d.img)}" alt="" loading="lazy">` : esc(iniciais(d.titulo))}</span>
               <span class="vc-it-tx"><b>${esc(d.titulo)}</b><small>${vcBusca.value.trim() ? `${esc(d.temaNome)} · ` : ''}${esc(d.desc || 'Sem descrição cadastrada.')}</small></span>`
            : `<span class="vc-it-ic"><i class="fas ${T.ic}"></i></span>
               <span class="vc-it-tx"><b>${esc(d.titulo)}</b>${d.setor ? `<small>${esc(d.setor)}</small>` : ''}</span>`}
          <span class="vc-it-ck"><i class="fas fa-check"></i></span></button></li>`).join('')
        : `<li class="vc-msg"><i class="fas fa-magnifying-glass"></i> Nada encontrado${vcBusca.value ? ` para "${esc(vcBusca.value)}"` : ''}.</li>`;
      $$('.vc-it', vcLista).forEach((b) => b.onclick = () => alternar(itens[+b.dataset.i]));
    };
    const alternar = (d) => {
      const i = vincs.findIndex((v) => chave(v) === chave(d));
      if (i >= 0) vincs.splice(i, 1);
      else { if (vincs.length >= VINC_MAX) return toast(`Máximo de ${VINC_MAX} vínculos.`); vincs.push(vincSalvo(d)); }
      desenharSel(); desenharLista();
    };
    // chips: setores (documentos) ou temas (cursos — sempre um tema escolhido)
    const desenharSetores = () => {
      if (vcGrupo === 'unilamic') {
        const temas = [...new Map(vcDocs.map((d) => [d.tema, d.temaNome])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR', { numeric: true }));
        if (!temas.some(([id]) => id === vcSetor)) vcSetor = temas[0]?.[0] || '';
        vcSet.innerHTML = `<span class="vc-set-rot"><i class="fas fa-bookmark"></i> Tema</span>` + temas.map(([id, nome]) => `<button type="button" data-setor="${esc(id)}" class="${id === vcSetor ? 'on' : ''}">${esc(nome)}</button>`).join('');
      } else {
        const setores = [...new Set(vcDocs.map((d) => d.setor).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
        vcSet.innerHTML = setores.length > 1 ? ['', ...setores].map((x) => `<button type="button" data-setor="${esc(x)}" class="${x === vcSetor ? 'on' : ''}">${x ? esc(x) : 'Todos'}</button>`).join('') : '';
      }
      $$('[data-setor]', vcSet).forEach((b) => b.onclick = () => { vcSetor = b.dataset.setor; desenharSetores(); desenharLista(); });
    };
    const carregar = async (busca, rotulo, aoTentar) => {
      vcSetor = ''; vcDocs = [];
      vcBusca.placeholder = `Pesquisar ${rotulo}…`;
      vcSet.innerHTML = '';
      vcLista.innerHTML = Array.from({ length: 5 }, () => '<li class="vc-esq"><span></span><span></span></li>').join('');
      const vez = (carregar.vez = (carregar.vez || 0) + 1);
      let lista;
      try { lista = await busca(); } catch { if (vez !== carregar.vez) return; vcLista.innerHTML = '<li class="vc-msg erro"><i class="fas fa-wifi"></i> Não foi possível carregar a lista. <button type="button" data-tentar>Tentar de novo</button></li>';
        $('[data-tentar]', vcLista).onclick = aoTentar; return; }
      if (vez !== carregar.vez) return;   // trocou de aba enquanto carregava
      vcDocs = lista;
      if (!vcDocs.length) { vcLista.innerHTML = `<li class="vc-msg">Nenhum ${vcGrupo === 'unilamic' ? 'curso' : 'documento'} cadastrado.</li>`; return; }
      desenharSetores(); desenharLista();
    };
    const trocarTipo = (tipo) => {
      vcTipo = tipo;
      $$('[data-tipo]', vc).forEach((b) => b.classList.toggle('on', b.dataset.tipo === tipo));
      carregar(() => docsDe(tipo), VINC_TIPOS[tipo].plural.toLowerCase(), () => trocarTipo(tipo));
    };
    const trocarPlat = (plat) => {
      vcTipo = 'curso'; vcPlat = plat;
      $$('[data-plat]', vc).forEach((b) => b.classList.toggle('on', b.dataset.plat === plat));
      carregar(() => cursosDe(plat), `cursos de ${UNI_PLATS[plat].nome}`, () => trocarPlat(plat));
    };
    const trocarGrupo = (g) => {
      vcGrupo = g;
      $$('[data-grupo]', vc).forEach((b) => { b.classList.toggle('on', b.dataset.grupo === g); b.setAttribute('aria-selected', b.dataset.grupo === g); });
      $$('[data-g]', vc).forEach((el) => { el.hidden = el.dataset.g !== g; });
      vcBusca.value = '';
      if (g === 'unilamic' && !vcCont) { vcCont = true;
        Object.keys(UNI_PLATS).forEach((k) => cursosDe(k).then((l) => { const q = $(`[data-qtp="${k}"]`, vc); if (q) q.textContent = l.length; }).catch(() => {})); }
      if (g === 'unilamic') trocarPlat(vcPlat); else trocarTipo(grupoDe(vcTipo) === 'docs' ? vcTipo : 'pop');
    };
    $$('[data-grupo]', vc).forEach((b) => b.onclick = () => { if (b.dataset.grupo !== vcGrupo) trocarGrupo(b.dataset.grupo); });
    $$('[data-tipo]', vc).forEach((b) => b.onclick = () => trocarTipo(b.dataset.tipo));
    $$('[data-plat]', vc).forEach((b) => b.onclick = () => trocarPlat(b.dataset.plat));
    vcBusca.addEventListener('input', desenharLista);
    vcBusca.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const p = filtrados()[0]; if (p) alternar(p); } });
    Object.keys(VINC_TIPOS).filter((k) => grupoDe(k) === 'docs').forEach((k) => docsDe(k).then((l) => { const q = $(`[data-qt="${k}"]`, vc); if (q) q.textContent = l.length; }).catch(() => {}));
    desenharSel();
    let vcPronto = false, vcCont = false;

    const f = $('form', m);
    let passo = 0;
    // prioridade: botão + popover
    const psel = $('.psel', m), pbt = $('.psel-bt', psel), ppop = $('.psel-pop', psel);
    const escolherPrio = (v) => {
      const [, r, ic, d] = PRIOS.find((x) => x[0] === v);
      f.prioridade.value = v;
      psel.className = `psel ${v}`;
      pbt.innerHTML = `<span class="psel-ic"><i class="fas ${ic}"></i></span><span class="psel-tx"><b>${r}</b><small>${d}</small></span><i class="fas fa-chevron-down psel-seta"></i>`;
      $$('.psel-op', ppop).forEach((o) => o.classList.toggle('on', o.dataset.v === v));
    };
    const fecharPrio = () => { ppop.classList.add('hidden'); psel.classList.remove('aberto'); };
    pbt.onclick = (e) => { e.stopPropagation(); const fechado = ppop.classList.toggle('hidden'); psel.classList.toggle('aberto', !fechado); if (!fechado) flutuar(ppop, pbt); };
    $$('.psel-op', ppop).forEach((o) => o.onclick = () => { escolherPrio(o.dataset.v); fecharPrio(); pbt.focus(); });
    m.addEventListener('click', (e) => { if (!e.target.closest('.psel')) fecharPrio(); });
    psel.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharPrio(); });
    // preenche a edição
    const dtLocal = (ms) => { const d = new Date(ms); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
    const editor = editorTexto(f.corpo);
    if (ed) {
      f.titulo.value = ed.titulo || ''; editor.definir(ed.corpo || '');
      f.exige_confirmacao.checked = !!ed.exige_confirmacao;
      if (ed.expira_em) f.expira_em.value = dtLocal(ed.expira_em);
      desenhar();
    }
    escolherPrio(ed?.prioridade && PRIOS.some((x) => x[0] === ed.prioridade) ? ed.prioridade : 'normal');
    const ROT_PRIO = { normal: 'Normal', importante: 'Importante', urgente: 'Urgente' };
    // valida a etapa 1 antes de seguir (título obrigatório; mensagem ou anexo)
    const valida = (ate) => {
      if (ate > 0 && !f.titulo.value.trim()) { irPara(0); f.titulo.reportValidity(); return false; }
      if (ate > 3 && !f.corpo.value.trim() && !arquivos.length && !existentes.length && !vincs.length) { irPara(0); toast('Escreva uma mensagem ou anexe um arquivo.'); return false; }
      return true;
    };
    const resumo = () => {
      const quem = alvo.rotulos();
      $('#wz-resumo', m).innerHTML = `<div class="rv-card ${esc(f.prioridade.value)}">
        <div class="rv-topo"><span class="tag ${esc(f.prioridade.value)}">${ROT_PRIO[f.prioridade.value]}</span>${f.exige_confirmacao.checked ? '<span class="tag pend"><i class="fas fa-check-double"></i> exige confirmação</span>' : ''}</div>
        <h3>${esc(f.titulo.value.trim())}</h3>
        ${f.corpo.value.trim() ? `<div class="rt-txt">${corpoHtml(f.corpo.value.trim())}</div>` : ''}
        <dl>
          <dt><i class="fas fa-users"></i> Para</dt><dd>${quem.length ? quem.map(esc).join(', ') : 'Todos os colaboradores'}</dd>
          <dt><i class="fas fa-paperclip"></i> Anexos</dt><dd>${arquivos.length + existentes.length ? `${arquivos.length + existentes.length} arquivo(s)` : 'Nenhum'}</dd>
          <dt><i class="fas fa-link"></i> Vínculos</dt><dd>${vincs.length ? vincs.map((v) => `${v.tipo === 'curso' ? `Curso UniLAMIC · ${esc(UNI_PLATS[v.plat]?.nome || '')}` : VINC_TIPOS[v.tipo].nome} · ${esc(v.titulo)}`).join('<br>') : 'Nenhum'}</dd>
          <dt><i class="fas fa-hourglass-end"></i> Expira</dt><dd>${f.expira_em.value ? dataBR(new Date(f.expira_em.value)) : 'Não expira'}</dd>
        </dl></div>`;
    };
    const irPara = (n) => {
      passo = Math.max(0, Math.min(PASSOS.length - 1, n));
      $$('.wz-etapa', m).forEach((sec) => { sec.hidden = +sec.dataset.e !== passo; });
      $$('[data-ir]', m).forEach((b, i) => { b.classList.toggle('on', i === passo); b.classList.toggle('feito', i < passo); });
      $('.wz-barra i', m).style.width = `${(passo / (PASSOS.length - 1)) * 100}%`;
      $('#wz-n', m).textContent = passo + 1;
      $('[data-voltar]', m).style.visibility = passo ? 'visible' : 'hidden';
      const ult = passo === PASSOS.length - 1;
      $('[data-pub]', m).innerHTML = ult ? (ed ? '<i class="fas fa-floppy-disk"></i> Salvar alterações' : '<i class="fas fa-paper-plane"></i> Publicar') : 'Próximo <i class="fas fa-arrow-right"></i>';
      if (ult) resumo();
      if (PASSOS[passo][0] === 'vinculos') { if (!vcPronto) { vcPronto = true; trocarTipo('pop'); } setTimeout(() => vcBusca.focus(), 60); }
      $('.wz-corpo', m).scrollTop = 0;
      if (passo === 0) setTimeout(() => f.titulo.focus(), 50);
    };
    $$('[data-ir]', m).forEach((b) => b.onclick = () => { const n = +b.dataset.ir; if (n <= passo || valida(n)) irPara(n); });
    $('[data-voltar]', m).onclick = () => irPara(passo - 1);
    $$('[data-x]', m).forEach((b) => b.onclick = async () => {
      const sujo = ed ? true : f.titulo.value.trim() || f.corpo.value.trim() || arquivos.length || vincs.length;
      if (!sujo || await confirmarAcao(ed ? 'Descartar alterações? O aviso continua como estava.' : 'Descartar este aviso? O que foi preenchido será perdido.', { ok: 'Descartar', perigo: true })) m.remove();
    });
    irPara(0);

    f.onsubmit = async (e) => {
      e.preventDefault();
      if (passo < PASSOS.length - 1) { if (valida(passo + 1)) irPara(passo + 1); return; }
      if (!valida(PASSOS.length - 1)) return;
      const btn = $('[data-pub]', m);
      btn.disabled = true;
      const enviados = [];
      try {
        for (let i = 0; i < arquivos.length; i++) {
          btn.textContent = `Enviando ${i + 1}/${arquivos.length}…`;
          enviados.push(await enviarAnexo(arquivos[i]));
        }
        btn.textContent = ed ? 'Salvando…' : 'Publicando…';
        if (ed) {
          await ref(`avisos/${ed.id}`).update({
            titulo: f.titulo.value.trim(), corpo: f.corpo.value.trim(), prioridade: f.prioridade.value,
            exige_confirmacao: f.exige_confirmacao.checked,
            expira_em: f.expira_em.value ? new Date(f.expira_em.value).getTime() : null,
            alvo_grupos: alvo.de('g:'), alvo_usuarios: alvo.de('u:'),
            anexos: existentes.length + enviados.length ? [...existentes, ...enviados] : null,
            vinculos: vincs.length ? vincs : null,
            editado_por: S.me.login, editado_em: TS(),
          });
          // só apaga do Drive depois de salvar
          removidos.forEach((x) => { if (x.fileId) driveRequest({ action: 'delete', id: x.fileId }).catch(() => {}); });
          auditar('aviso_editado', f.titulo.value.trim());
          m.remove(); toast('Aviso atualizado.'); rotear();
          return;
        }
        const novo = await ref('avisos').push({
          titulo: f.titulo.value.trim(), corpo: f.corpo.value.trim(), prioridade: f.prioridade.value,
          exige_confirmacao: f.exige_confirmacao.checked,
          expira_em: f.expira_em.value ? new Date(f.expira_em.value).getTime() : null,
          alvo_grupos: alvo.de('g:'), alvo_usuarios: alvo.de('u:'),
          anexos: enviados.length ? enviados : null,
          vinculos: vincs.length ? vincs : null,
          criado_por: S.me.login, criado_em: TS(),
        });
        auditar('aviso_publicado', f.titulo.value.trim() || novo.key);
        m.remove(); toast('Aviso publicado.'); rotear();
      } catch (err) {
        // não deixa arquivo solto no Drive se o aviso não foi publicado
        enviados.forEach((x) => { if (x.fileId) driveRequest({ action: 'delete', id: x.fileId }).catch(() => {}); });
        toast(traduz(err)); btn.disabled = false; btn.innerHTML = ed ? '<i class="fas fa-floppy-disk"></i> Salvar alterações' : '<i class="fas fa-paper-plane"></i> Publicar';
      }
    };
  }

  async function relatorio(id) {
    try {
      const [aviso, users, lei] = await Promise.all([ler(`avisos/${id}`), ler('usuarios'), ler('leituras')]);
      const nomeG = Object.fromEntries(S.grupos.map((g) => [g.id, g.nome]));
      const dados = lista(users).filter((u) => u.ativo && paraUsuario(aviso || {}, u.id, u.grupo)).sort(porNome)
        .map((u) => ({ nome: u.nome, grupo: nomeG[u.grupo] || '—', ...(lei?.[u.id]?.[id] || {}) }));
      const tot = dados.length, lidos = dados.filter((r) => r.lido_em).length, conf = dados.filter((r) => r.confirmado_em).length;
      const m = modal(`<h2>Leitura do aviso</h2>
        <p style="margin-bottom:12px"><span class="tag ok">${lidos}/${tot} leram</span> <span class="tag normal">${conf}/${tot} confirmaram</span></p>
        <div class="scroll-x"><table class="tabela"><thead><tr><th>Nome</th><th>Grupo</th><th>Lido</th><th>Confirmado</th></tr></thead><tbody>
        ${dados.map((r) => `<tr><td>${esc(r.nome)}</td><td>${esc(r.grupo)}</td><td>${dataBR(r.lido_em)}</td><td>${r.confirmado_em ? dataBR(r.confirmado_em) : '<span class="tag pend">pendente</span>'}</td></tr>`).join('')}
        </tbody></table></div><div class="modal-acoes"><button class="btn ghost" data-x>Fechar</button></div>`);
      $('[data-x]', m).onclick = () => m.remove();
    } catch (e) { toast(traduz(e)); }
  }

  // Janela de notificação (canto superior direito): título, importância e "Ver aviso".
  // A confirmação de leitura acontece no próprio aviso, que abre destacado no quadro.
  const ROTULO_PRIO = { normal: 'Normal', importante: 'Importante', urgente: 'Urgente' };
  function notificar(a, novo = true) {
    let pilha = $('#notifs');
    if (!pilha) { pilha = document.createElement('div'); pilha.id = 'notifs'; document.body.appendChild(pilha); }
    if ($(`[data-n="${CSS.escape(a.id)}"]`, pilha)) return;
    const n = document.createElement('div');
    n.className = `notif ${esc(a.prioridade || 'normal')}`;
    n.dataset.n = a.id;
    n.innerHTML = `<div class="nt-ic"><i class="fas fa-bell"></i></div>
      <div class="nt-corpo"><small>${novo ? 'Novo aviso' : 'Aviso não lido'}${a.exige_confirmacao ? ' · requer confirmação' : ''}</small>
        <b>${esc(a.titulo)}</b><span class="tag ${esc(a.prioridade || 'normal')}">${esc(ROTULO_PRIO[a.prioridade] || a.prioridade || 'Normal')}</span></div>
      <div class="nt-acoes"><button class="btn sm turq" data-ver>Ver aviso</button><button class="nt-x" title="Fechar"><i class="fas fa-xmark"></i></button></div>`;
    const fechar = () => { n.classList.add('saindo'); setTimeout(() => n.remove(), 250); };
    $('.nt-x', n).onclick = fechar;
    $('[data-ver]', n).onclick = () => { fechar(); irParaAviso(a.id); };
    pilha.prepend(n);
  }

  // Já no quadro e o aviso na tela: só rola e destaca, sem redesenhar a página.
  // Senão: esmaece o conteúdo atual, redesenha e revela de forma suave.
  async function irParaAviso(id) {
    const alvo = `avisos/${id}`, pg = $('#pagina');
    const naTela = !$('#viewer') && (location.hash.slice(1) || 'avisos').split('/')[0] === 'avisos'
      && $(`.aviso[data-id="${CSS.escape(id)}"]`);
    if (naTela) { history.replaceState(null, '', `#${alvo}`); return destacarAviso(id); }
    if (pg) await pg.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(6px)' }],
      { duration: 220, easing: 'ease', fill: 'forwards' }).finished.catch(() => {});
    S.suave = true;
    if (location.hash.slice(1) === alvo) rotear(); else location.hash = alvo;
  }

  // Ao abrir o quadro com um id na rota: rola até o aviso e destaca.
  function destacarAviso(id) {
    const c = id && $(`.aviso[data-id="${CSS.escape(id)}"]`);
    if (!c) return;
    c.scrollIntoView({ behavior: 'smooth', block: 'center' });
    clearTimeout(c._dt);
    setTimeout(() => c.classList.add('destaque'), 250);   // destaca depois de começar a rolar
    c._dt = setTimeout(() => c.classList.remove('destaque'), 4200);
  }

  // Ao entrar: avisos pendentes viram notificações (até 3 + resumo).
  async function avisosObrigatorios() {
    const pend = await avisosPendentes();
    pend.slice(0, 3).reverse().forEach((a) => notificar(a, false));
    if (pend.length > 3) toast(`Você tem ${pend.length} avisos não lidos.`);
  }

  // Tempo real: todo aviso novo dispara a notificação em todos os usuários logados a quem ele se destina.
  function ouvirAvisos() {
    pararAvisos();
    const desde = Date.now() - 5 * 60 * 1000;          // folga para relógio do computador adiantado
    const vistos = new Set();
    let pronto = false;
    const q = ref('avisos').orderByChild('criado_em').startAt(desde);
    const cb = q.on('child_added', async (snap) => {
      const a = { id: snap.key, ...snap.val() };
      if (!pronto) { vistos.add(a.id); return; }        // avisos que já existiam ao entrar
      if (vistos.has(a.id) || !paraUsuario(a, S.me.login, S.me.grupo) || a.criado_por === S.me.login) return;
      vistos.add(a.id);
      notificar(a, true);
      if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
        new Notification('Novo aviso — Dados LAMIC', { body: a.titulo, icon: 'assents/circulo.png' });
      }
      atualizarContador();
      // atualiza o quadro aberto (sem atrapalhar quem está com uma janela aberta)
      if ((location.hash.slice(1) || 'avisos').startsWith('avisos') && !$('.modal')) rotear();
    });
    q.once('value').then(() => { pronto = true; });   // depois da carga inicial, só avisos novos
    S.offAvisos = () => q.off('child_added', cb);
    if ('Notification' in window && Notification.permission === 'default') {
      document.addEventListener('click', () => Notification.requestPermission(), { once: true });
    }
  }
  function pararAvisos() { if (S.offAvisos) { S.offAvisos(); S.offAvisos = null; } $('#notifs')?.remove(); }

  // ---------- administração ----------
  async function paginaAdmin(pg, sub) {
    const abas = [
      ['usuarios', 'Usuários', 'usuarios.gerenciar'],
      ['grupos', 'Grupos e permissões', 'grupos.gerenciar'],
      ['modulos', 'Módulos e links', 'modulos.gerenciar'],
      ['auditoria', 'Auditoria', 'auditoria.ver'],
    ].filter((a) => pode(a[2]));
    const atual = abas.find((a) => a[0] === sub) ? sub : abas[0][0];
    pg.innerHTML = `<div class="eyebrow">Gestão</div><h1 class="titulo">Administração</h1>
      <div class="abas">${abas.map((a) => `<button class="${a[0] === atual ? 'on' : ''}" data-a="${a[0]}">${a[1]}</button>`).join('')}</div>
      <div id="adm"></div>`;
    $$('.abas button').forEach((b) => b.onclick = () => location.hash = `admin/${b.dataset.a}`);
    const el = $('#adm');
    await ({ usuarios: admUsuarios, grupos: admGrupos, modulos: admModulos, auditoria: admAuditoria })[atual](el);
  }

  const optGrupos = (sel) => S.grupos.map((g) => `<option value="${esc(g.id)}" ${g.id === sel ? 'selected' : ''}>${esc(g.nome)}</option>`).join('');

  // ── Seletor de grupo em popover ──
  // Todo <select class="grupo"> / <select name="grupo"> (simples) vira um botão + painel.
  // O select continua lá, escondido: guarda o valor, entra no FormData e dispara 'change'.
  const CORES_GRUPO = ['#1257A5', '#1F9D6B', '#D98E04', '#7C3AED', '#DB2777', '#2AA7BE', '#C8372D', '#4F46E5'];
  const corGrupo = (id) => { if (id === 'admin') return '#162036'; let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return CORES_GRUPO[h % CORES_GRUPO.length]; };
  const iniGrupo = (nome) => String(nome || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  let popGrupoAberto = null;
  function fecharPopGrupo() {
    if (!popGrupoAberto) return;
    popGrupoAberto.painel.remove();
    popGrupoAberto.btn.setAttribute('aria-expanded', 'false');
    popGrupoAberto = null;
  }
  function pintarBtnGrupo(sel, btn) {
    const g = S.grupos.find((x) => x.id === sel.value);
    btn.disabled = sel.disabled;
    btn.innerHTML = g
      ? `<span class="pg-bolha" style="background:${corGrupo(g.id)}">${esc(iniGrupo(g.nome))}</span><span class="pg-nome">${esc(g.nome)}</span><i class="fa-solid fa-chevron-down pg-seta"></i>`
      : `<span class="pg-bolha pg-vazio"><i class="fa-solid fa-users"></i></span><span class="pg-nome pg-ph">Selecione…</span><i class="fa-solid fa-chevron-down pg-seta"></i>`;
  }
  function abrirPopGrupo(sel, btn) {
    fecharPopGrupo();
    const painel = document.createElement('div');
    painel.className = 'pop-grupo';
    painel.setAttribute('role', 'listbox');
    const busca = S.grupos.length > 6;
    painel.innerHTML = (busca ? '<div class="pg-busca"><i class="fa-solid fa-magnifying-glass"></i><input placeholder="Buscar grupo…" autocomplete="off"></div>' : '') + '<div class="pg-lista"></div>';
    document.body.appendChild(painel);
    const r = btn.getBoundingClientRect();
    const larg = Math.max(r.width, 240);
    painel.style.width = larg + 'px';
    painel.style.left = Math.max(8, Math.min(r.left, innerWidth - larg - 8)) + 'px';
    const alto = Math.min(painel.offsetHeight, 320);
    painel.style.top = (r.bottom + 6 + alto > innerHeight && r.top - 6 - alto > 0 ? r.top - 6 - alto : r.bottom + 6) + 'px';
    let ativo = Math.max(0, S.grupos.findIndex((g) => g.id === sel.value));
    let itens = S.grupos;
    const desenhar = () => {
      const q = busca ? $('input', painel).value.trim().toLowerCase() : '';
      itens = S.grupos.filter((g) => !q || g.nome.toLowerCase().includes(q));
      ativo = Math.min(ativo, Math.max(itens.length - 1, 0));
      $('.pg-lista', painel).innerHTML = itens.map((g, i) => `<button type="button" role="option" data-g="${esc(g.id)}" class="pg-item${i === ativo ? ' ativo' : ''}${g.id === sel.value ? ' on' : ''}">
          <span class="pg-bolha" style="background:${corGrupo(g.id)}">${esc(iniGrupo(g.nome))}</span>
          <span class="pg-nome">${esc(g.nome)}${g.id === 'admin' ? '<small>acesso total</small>' : ''}</span>
          ${g.id === sel.value ? '<i class="fa-solid fa-circle-check pg-ok"></i>' : ''}</button>`).join('') || '<p class="pg-nada">Nenhum grupo encontrado.</p>';
    };
    const escolher = (id) => {
      fecharPopGrupo();
      if (id !== sel.value) { sel.value = id; sel.dispatchEvent(new Event('change', { bubbles: true })); }
      pintarBtnGrupo(sel, btn); btn.focus();
    };
    painel.addEventListener('click', (e) => { const b = e.target.closest('[data-g]'); if (b) escolher(b.dataset.g); });
    painel.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); ativo = Math.min(ativo + 1, itens.length - 1); desenhar(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); ativo = Math.max(ativo - 1, 0); desenhar(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (itens[ativo]) escolher(itens[ativo].id); }
      else if (e.key === 'Escape') { fecharPopGrupo(); btn.focus(); }
    });
    if (busca) $('input', painel).oninput = () => { ativo = 0; desenhar(); };
    desenhar();
    popGrupoAberto = { painel, btn };
    btn.setAttribute('aria-expanded', 'true');
    (busca ? $('input', painel) : painel.querySelector('.pg-item.on, .pg-item'))?.focus();
  }
  function enfeitarSelectGrupo(sel) {
    if (sel.dataset.pop || sel.multiple) return;
    sel.dataset.pop = '1';
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'pg-btn'; btn.setAttribute('aria-haspopup', 'listbox');
    sel.classList.add('pg-oculto'); sel.tabIndex = -1;
    sel.insertAdjacentElement('afterend', btn);
    pintarBtnGrupo(sel, btn);
    btn.onclick = (e) => { e.stopPropagation(); popGrupoAberto?.btn === btn ? fecharPopGrupo() : abrirPopGrupo(sel, btn); };
    btn.onkeydown = (e) => { if (e.key === 'ArrowDown') { e.preventDefault(); abrirPopGrupo(sel, btn); } };
    sel.addEventListener('change', () => pintarBtnGrupo(sel, btn));
    sel.addEventListener('invalid', () => btn.classList.add('pg-erro'));
  }
  const enfeitarGrupos = (raiz) => raiz.querySelectorAll?.('select.grupo, select[name="grupo"]').forEach(enfeitarSelectGrupo);
  new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => n.nodeType === 1 && (n.matches?.('select.grupo, select[name="grupo"]') ? enfeitarSelectGrupo(n) : enfeitarGrupos(n)))))
    .observe(document.body, { childList: true, subtree: true });
  document.addEventListener('mousedown', (e) => { if (popGrupoAberto && !popGrupoAberto.painel.contains(e.target) && !popGrupoAberto.btn.contains(e.target)) fecharPopGrupo(); }, true);
  addEventListener('resize', fecharPopGrupo);
  document.addEventListener('scroll', (e) => { if (popGrupoAberto && !popGrupoAberto.painel.contains(e.target)) fecharPopGrupo(); }, true);

  // Conta no Auth criada por um app Firebase secundário: o administrador continua logado no principal.
  async function criarContaAuth(login, v, senha) {
    const sec = firebase.apps.find((a) => a.name === 'secundario') || firebase.initializeApp(cfg.firebase, 'secundario');
    const auth = sec.auth();
    await auth.setPersistence(firebase.auth.Auth.Persistence.NONE);
    const cred = await auth.createUserWithEmailAndPassword(emailDe(login, v), senha);
    return {
      uid: cred.user.uid,
      descartar: () => cred.user.delete().catch(() => {}).finally(() => auth.signOut()),
      fechar: () => auth.signOut().catch(() => {}),
    };
  }

  // ─── Importação única das contas do UniLAMIC ───
  // Cada conta de aluno (/uniadmin/users) vira (ou é ligada a) um usuário do Dados LAMIC.
  // Mesmo nome já cadastrado aqui → só vincula. Senão cria login com senha padrão e troca obrigatória;
  // o CPF é pedido no primeiro acesso (exigirTrocaSenha). Vínculo em /uniadmin/porLogin/{login} = userId,
  // então rodar de novo pula quem já foi importado.
  const SENHA_PADRAO_IMPORT = 'Lamic759@';
  const nomeChave = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();

  function gerarLoginImport(username, nome, ocupados) {
    const livre = (l) => LOGIN_RE.test(l) && !ocupados.has(l);
    const u = String(username || '').toLowerCase();
    if (livre(u)) return u;
    const p = nomeChave(nome).split(' ').filter(Boolean);
    const base = ((p[0] || 'user') + (p.length > 1 ? p[p.length - 1][0] : '')).slice(0, 12);
    if (livre(base)) return base;
    for (let n = 2; n < 100; n++) if (livre(`${base}${n}`)) return `${base}${n}`;
    return null;
  }

  async function importarUnilamic(el) {
    // /logins só pode ser lido login a login (regra), por isso a lista de ocupados vem de /usuarios e cada login novo é conferido na hora de criar.
    const [alunos, users, porLogin] = await Promise.all([ler('uniadmin/users'), ler('usuarios'), ler('uniadmin/porLogin')]);
    const vinculados = new Set(Object.values(porLogin || {}));
    const porNomeDados = new Map(lista(users).map((u) => [nomeChave(u.nome), u.id]));
    const ocupados = new Set(Object.keys(users || {}));
    const plano = [];
    lista(alunos).forEach((a) => {
      const nome = a.fullName || a.username || '';
      if (vinculados.has(a.id) || a.login) return plano.push({ acao: 'ja', a, nome, login: a.login || '' });
      if (a.disabled) return plano.push({ acao: 'ignorar', a, nome, obs: 'desativado no UniLAMIC' });
      const existente = porNomeDados.get(nomeChave(nome));
      if (existente) return plano.push({ acao: 'vincular', a, nome, login: existente });
      const login = gerarLoginImport(a.username, nome, ocupados);
      if (!login) return plano.push({ acao: 'ignorar', a, nome, obs: 'sem login livre' });
      ocupados.add(login);
      plano.push({ acao: 'criar', a, nome, login, obs: login !== a.username ? `antes: ${a.username || '—'}` : '' });
    });
    const conta = (x) => plano.filter((p) => p.acao === x).length;
    const ROT = { criar: 'Criar conta', vincular: 'Vincular a existente', ja: 'Já importado', ignorar: 'Ignorado' };
    const pend = plano.filter((p) => p.acao === 'criar' || p.acao === 'vincular');
    const m = modal(`<h2>Importar contas do UniLAMIC</h2>
      <p class="sub" style="margin-bottom:10px">Criar: <b>${conta('criar')}</b> · Vincular: <b>${conta('vincular')}</b> · Já importados: <b>${conta('ja')}</b> · Ignorados: <b>${conta('ignorar')}</b></p>
      <p style="font-size:13px;color:var(--txt-2);margin-bottom:10px">Contas novas: senha <b>${SENHA_PADRAO_IMPORT}</b>, grupo Colaboradores, troca de senha e CPF obrigatórios no primeiro acesso. Faça o backup do banco antes.</p>
      <div class="scroll-x" style="max-height:50vh;overflow:auto"><table class="tabela"><thead><tr><th>Nome</th><th>Ação</th><th>Login</th><th>Obs.</th></tr></thead><tbody>
      ${plano.sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR')).map((p) => `<tr><td>${esc(p.nome)}</td><td>${ROT[p.acao]}</td><td>${p.login ? '@' + esc(p.login) : '—'}</td><td><small>${esc(p.obs || '')}</small></td></tr>`).join('')}
      </tbody></table></div>
      <p id="imp-status" style="font-size:13px;margin-top:10px"></p>
      <div class="modal-acoes"><button type="button" class="btn ghost" data-x>Fechar</button>${pend.length ? `<button class="btn turq" data-ok>Importar ${pend.length}</button>` : ''}</div>`);
    $('[data-x]', m).onclick = () => m.remove();
    const ok = $('[data-ok]', m);
    if (!ok) return;
    ok.onclick = async () => {
      ok.disabled = true; $('[data-x]', m).disabled = true;
      const st = $('#imp-status', m);
      let feitos = 0; const erros = [];
      for (const p of pend) {
        st.textContent = `Importando ${feitos + erros.length + 1} de ${pend.length}: ${p.nome}…`;
        let nova;
        try {
          const up = { [`uniadmin/users/${p.a.id}/login`]: p.login, [`uniadmin/porLogin/${p.login}`]: p.a.id };
          if (p.acao === 'criar') {
            if ((await ler(`logins/${p.login}`))?.uid) throw new Error(`login @${p.login} já existe no Dados`);
            nova = await criarContaAuth(p.login, 0, SENHA_PADRAO_IMPORT);
            Object.assign(up, {
              [`logins/${p.login}`]: { v: 0, uid: nova.uid, trocar: true },
              [`uids/${nova.uid}`]: p.login,
              [`usuarios/${p.login}`]: { nome: p.nome.trim(), cargo: p.a.role || '', grupo: 'colab', ativo: true, criado_em: TS(), origem: 'unilamic' },
            });
          }
          await ref('/').update(up);
          if (nova) nova.fechar();
          feitos++;
        } catch (err) {
          if (nova) nova.descartar();
          erros.push(`${p.nome}: ${traduz(err)}`);
        }
      }
      auditar('importacao_unilamic', `${feitos} ok, ${erros.length} erro(s)`);
      st.innerHTML = `<b>${feitos} importado(s).</b>${erros.length ? `<br>${erros.length} com erro (rode de novo para tentar só esses):<br><small>${erros.map(esc).join('<br>')}</small>` : ''}`;
      $('[data-x]', m).disabled = false;
      $('[data-x]', m).onclick = () => { m.remove(); admUsuarios(el); };
    };
  }

  // ─── Importação única do RH LAMIC (banco antigo curriculolamic → nós rh_* daqui) ───
  // Copia cada nó rh_* (sobrescreve o que houver aqui) e liga os usuários do RH às contas do Dados
  // por nome: rh_usuarios/{id}/login passa a ser o login do Dados, a senha antiga sai e o acesso é
  // liberado em rh_acesso/{login}. Quem não casar pelo nome aparece na lista para ligar à mão no RH.
  const RH_ORIGEM = 'https://curriculolamic-default-rtdb.firebaseio.com';
  async function importarRh(el) {
    const raiz = await (await fetch(`${RH_ORIGEM}/.json?shallow=true`)).json();
    const nos = Object.keys(raiz || {}).filter((k) => k.startsWith('rh_')).sort();
    const [rhUsers, users] = await Promise.all([
      fetch(`${RH_ORIGEM}/rh_usuarios.json`).then((r) => r.json()), ler('usuarios')]);
    const porNome = new Map(lista(users).map((u) => [nomeChave(u.nome), u.id]));
    const plano = lista(rhUsers).map((u) => {
      const l = String(u.login || '').toLowerCase();
      const login = users?.[l] ? l : porNome.get(nomeChave(u.nome)) || '';
      return { u, login };
    });
    const m = modal(`<h2>Importar RH LAMIC</h2>
      <p class="sub" style="margin-bottom:10px">Copia <b>${nos.length}</b> nós do banco antigo do RH para este banco (sobrescreve os rh_* daqui). Faça o backup antes.</p>
      <p style="font-size:12px;color:var(--txt-2);margin-bottom:10px">${nos.map(esc).join(', ')}</p>
      <div class="scroll-x" style="max-height:40vh;overflow:auto"><table class="tabela"><thead><tr><th>Usuário do RH</th><th>Login antigo</th><th>Conta no Dados</th></tr></thead><tbody>
      ${plano.map((p) => `<tr><td>${esc(p.u.nome || '')}${p.u.admin ? ' <small>(admin)</small>' : ''}</td><td>${esc(p.u.login || '')}</td><td>${p.login ? '@' + esc(p.login) : '<b style="color:#c0392b">sem conta — ligar no RH depois</b>'}</td></tr>`).join('')}
      </tbody></table></div>
      <p id="imp-status" style="font-size:13px;margin-top:10px"></p>
      <div class="modal-acoes"><button type="button" class="btn ghost" data-x>Fechar</button><button class="btn turq" data-ok>Importar</button></div>`);
    $('[data-x]', m).onclick = () => m.remove();
    const ok = $('[data-ok]', m);
    ok.onclick = async () => {
      ok.disabled = true; $('[data-x]', m).disabled = true;
      const st = $('#imp-status', m);
      const erros = [];
      for (const no of nos) {
        st.textContent = `Copiando ${no}…`;
        try {
          const dados = await (await fetch(`${RH_ORIGEM}/${no}.json`)).json();
          if (no === 'rh_usuarios') {
            plano.forEach((p) => {
              const d = dados?.[p.u.id]; if (!d) return;
              delete d.senhaHash;
              if (p.login) { d.loginAntigo = d.login || null; d.login = p.login; }
            });
          }
          // Cargos cadastrados aqui antes da importação (Grupos e permissões › Cargos) não se perdem.
          if (no === 'rh_cargos') {
            const atuais = (await ler('rh_cargos').catch(() => null)) || {};
            const nomes = new Set(Object.values(dados || {}).map((c) => nomeChave(c?.nome)));
            Object.entries(atuais).forEach(([id, c]) => { if (!nomes.has(nomeChave(c?.nome)) && !dados?.[id]) (dados || {})[id] = c; });
          }
          await ref(no).set(dados);
        } catch (err) { erros.push(`${no}: ${traduz(err)}`); }
      }
      const acesso = {};
      plano.forEach((p) => { if (p.login && p.u.ativo !== false) acesso[p.login] = true; });
      try { await ref('rh_acesso').update(acesso); } catch (err) { erros.push(`rh_acesso: ${traduz(err)}`); }
      auditar('importacao_rh', `${nos.length - erros.length} nós, ${Object.keys(acesso).length} acessos`);
      st.innerHTML = `<b>Concluído.</b> ${Object.keys(acesso).length} usuário(s) com acesso ao RH.${erros.length ? `<br><small>${erros.map(esc).join('<br>')}</small>` : ''}`;
      $('[data-x]', m).disabled = false;
    };
  }

  // ─── CPFs vindos da Agenda de exames e do RH ───
  // Para cada usuário do Dados sem CPF, procura pelo nome completo: primeiro nos usuários da Agenda
  // de exames (agendaresp, CPF do próprio usuário), depois no RH, onde o CPF só aparece nos dados de
  // pagamento (chave Pix CPF ou titular da conta, que pode ser outra pessoa). A prévia mostra a origem.
  const AGENDA_ORIGEM = 'https://agendaresp-default-rtdb.firebaseio.com';
  async function cpfsDoRh(el) {
    const [funcs, users, priv, agenda] = await Promise.all([ler('rh_funcionarios').catch(() => null), ler('usuarios'), ler('privado'),
      fetch(`${AGENDA_ORIGEM}/users.json`).then((r) => r.json()).catch(() => null)]);
    // Candidatos por nome: Agenda de exames (CPF do próprio usuário) vence o RH (Pix > titular).
    const cand = new Map();
    const por = (nome, cpf, origem) => {
      const c = soDigitos(cpf), k = nomeChave(nome);
      if (!k || c === CPF_ENTIDADE || !cpfValido(c) || cand.has(k)) return;
      cand.set(k, { cpf: c, origem });
    };
    Object.values(agenda && !agenda.error ? agenda : {}).forEach((u) => por(u.fullName, u.cpf, 'Agenda de exames'));
    lista(funcs).forEach((f) => {
      const pags = Object.values(f.pagamentos || {});
      pags.forEach((p) => { if (p.pixTipo === 'CPF') por(f.nome, p.pixChave, 'RH (Pix)'); });
      pags.forEach((p) => por(f.nome, p.titularDoc, 'RH (titular da conta)'));
    });
    const plano = lista(users).map((u) => {
      const c = cand.get(nomeChave(u.nome));
      let acao = 'gravar', obs = c?.origem || '';
      if (priv?.[u.id]?.cpf) { acao = 'pular'; obs = 'já tem CPF'; }
      else if (!c) { acao = 'pular'; obs = 'nome não encontrado no RH/Agenda'; }
      return { nome: u.nome || '', login: u.id, cpf: c?.cpf || '', acao, obs };
    });
    const pend = plano.filter((p) => p.acao === 'gravar');
    const m = modal(`<h2>CPFs do RH e da Agenda</h2>
      <p class="sub" style="margin-bottom:10px">Gravar: <b>${pend.length}</b> · Pular: <b>${plano.length - pend.length}</b></p>
      <div class="scroll-x" style="max-height:50vh;overflow:auto"><table class="tabela"><thead><tr><th>Usuário</th><th>Login</th><th>CPF</th><th>Origem</th></tr></thead><tbody>
      ${plano.sort((a, b) => a.acao.localeCompare(b.acao) || a.nome.localeCompare(b.nome, 'pt-BR')).map((p) => `<tr${p.acao === 'pular' ? ' style="opacity:.55"' : ''}><td>${esc(p.nome)}</td><td>${p.login ? '@' + esc(p.login) : '—'}</td><td>${p.cpf ? esc(cpfOculto(p.cpf)) : '—'}</td><td><small>${esc(p.obs)}</small></td></tr>`).join('')}
      </tbody></table></div>
      <p id="imp-status" style="font-size:13px;margin-top:10px"></p>
      <div class="modal-acoes"><button type="button" class="btn ghost" data-x>Fechar</button>${pend.length ? `<button class="btn turq" data-ok>Gravar ${pend.length}</button>` : ''}</div>`);
    $('[data-x]', m).onclick = () => m.remove();
    const ok = $('[data-ok]', m);
    if (!ok) return;
    ok.onclick = async () => {
      ok.disabled = true;
      const st = $('#imp-status', m);
      let feitos = 0; const erros = [];
      for (const p of pend) {
        try { await ref('/').update({ [`privado/${p.login}/cpf`]: p.cpf, [`cpfs/${p.cpf}`]: p.login }); feitos++; }
        catch (err) { erros.push(`${p.nome}: ${/permission/i.test(err?.message || err?.code || '') ? 'CPF já usado em outra conta' : traduz(err)}`); }
      }
      auditar('cpfs_importados', `${feitos} gravado(s), ${erros.length} erro(s)`);
      st.innerHTML = `<b>${feitos} CPF(s) gravado(s).</b>${erros.length ? `<br><small>${erros.map(esc).join('<br>')}</small>` : ''}`;
      $('[data-x]', m).onclick = () => { m.remove(); admUsuarios(el); };
    };
  }

  // ─── Importação única da Agenda de exames (backup JSON do banco antigo agendaresp → nó /agenda daqui) ───
  // Copia cada nó para /agenda/{nó} (sobrescreve). Os usuários da Agenda são rechaveados pelo login do
  // Dados: casa pelo CPF (privado/{login}/cpf) e, sem CPF, pelo nome completo. Quem não casar vai para
  // /agenda/usersSemConta (sem acesso), para não dar o acesso de alguém a um login homônimo do Dados.
  // Senhas antigas (passwordHash, adminPasswordHash) e CPF não são copiados.
  // Fonte: o arquivo de backup exportado do banco antigo (Console › ⋮ › Exportar JSON), escolhido aqui.
  function escolherJson() {
    return new Promise((resolve, reject) => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.json,application/json';
      inp.onchange = () => {
        const f = inp.files?.[0]; if (!f) return reject(new Error('Nenhum arquivo escolhido.'));
        f.text().then((t) => resolve(JSON.parse(t))).catch(() => reject(new Error('Arquivo JSON inválido.')));
      };
      inp.click();
    });
  }

  async function importarAgenda(el) {
    let backup = await escolherJson();
    if (backup?.agenda && !backup.users) backup = backup.agenda;
    if (!backup?.users || !backup?.agendas) throw new Error('Este arquivo não parece ser o backup da Agenda (faltam users/agendas).');
    const nos = Object.keys(backup).filter((k) => k !== 'users').sort();
    const agUsers = backup.users;
    const [users, priv] = await Promise.all([ler('usuarios'), ler('privado')]);
    const porCpf = new Map(Object.entries(priv || {}).filter(([, v]) => v?.cpf && v.cpf !== CPF_ENTIDADE).map(([l, v]) => [v.cpf, l]));
    const porNome = new Map(lista(users).map((u) => [nomeChave(u.nome), u.id]));
    const usados = new Set();
    const plano = Object.entries(agUsers || {}).map(([antigo, u]) => {
      let login = porCpf.get(soDigitos(u.cpf)), via = 'CPF';
      if (!login) { login = porNome.get(nomeChave(u.fullName)); via = 'nome'; }
      if (login && usados.has(login)) { login = ''; via = 'login já usado por outro'; }
      if (login) usados.add(login);
      return { antigo, u, login: login || '', via: login ? via : (via === 'nome' ? '' : via) };
    }).sort((a, b) => String(a.u.fullName || '').localeCompare(String(b.u.fullName || ''), 'pt-BR'));
    const novoLogin = Object.fromEntries(plano.filter((p) => p.login).map((p) => [p.antigo, p.login]));
    const m = modal(`<h2>Importar Agenda de exames</h2>
      <p class="sub" style="margin-bottom:10px">Copia <b>${nos.length}</b> nós para <code>/agenda</code> (sobrescreve). Usuários: <b>${plano.filter((p) => p.login).length}</b> ligados · <b>${plano.filter((p) => !p.login).length}</b> sem conta. Faça o backup antes.</p>
      <p style="font-size:12px;color:var(--txt-2);margin-bottom:10px">${nos.map(esc).join(', ')}</p>
      <div class="scroll-x" style="max-height:40vh;overflow:auto"><table class="tabela"><thead><tr><th>Usuário da Agenda</th><th>Antigo</th><th>Conta no Dados</th><th>Por</th></tr></thead><tbody>
      ${plano.map((p) => `<tr><td>${esc(p.u.fullName || '')}${p.u.role === 'admin' ? ' <small>(admin)</small>' : ''}${p.u.active === false ? ' <small>(inativo)</small>' : ''}</td><td>${esc(p.antigo)}</td><td>${p.login ? '@' + esc(p.login) : '<b style="color:#c0392b">sem conta</b>'}</td><td><small>${esc(p.via)}</small></td></tr>`).join('')}
      </tbody></table></div>
      <p id="imp-status" style="font-size:13px;margin-top:10px"></p>
      <div class="modal-acoes"><button type="button" class="btn ghost" data-x>Fechar</button><button class="btn turq" data-ok>Importar</button></div>`);
    $('[data-x]', m).onclick = () => m.remove();
    const ok = $('[data-ok]', m);
    ok.onclick = async () => {
      ok.disabled = true; $('[data-x]', m).disabled = true;
      const st = $('#imp-status', m);
      const erros = [];
      for (const no of nos) {
        st.textContent = `Copiando ${no}…`;
        try {
          const dados = backup[no] ?? null;
          if (no === 'config' && dados) { delete dados.adminPasswordHash; delete dados.allowRegistration; }
          // Histórico: troca o usuário antigo pelo login do Dados (guarda o antigo em userAntigo).
          if (no === 'auditLog' && dados) Object.values(dados).forEach((e) => {
            const novo = e && novoLogin[e.user];
            if (novo) { e.userAntigo = e.user; e.user = novo; }
          });
          await ref(`agenda/${no}`).set(dados);
        } catch (err) { erros.push(`${no}: ${traduz(err)}`); }
      }
      st.textContent = 'Gravando usuários…';
      const ligados = {}, semConta = {};
      plano.forEach((p) => {
        const reg = { username: p.login || p.antigo, fullName: p.u.fullName || '', role: p.u.role === 'admin' ? 'admin' : 'user',
          active: p.u.active !== false, createdAt: p.u.createdAt || null, usuarioAntigo: p.antigo };
        if (p.login) ligados[p.login] = reg; else semConta[p.antigo] = reg;
      });
      try { await ref('agenda/users').set(ligados); } catch (err) { erros.push(`users: ${traduz(err)}`); }
      try { await ref('agenda/usersSemConta').set(semConta); } catch (err) { erros.push(`usersSemConta: ${traduz(err)}`); }
      auditar('importacao_agenda', `${nos.length} nós, ${Object.keys(ligados).length} usuários ligados`);
      st.innerHTML = `<b>Concluído.</b> ${Object.keys(ligados).length} usuário(s) com acesso à Agenda.${erros.length ? `<br><small>${erros.map(esc).join('<br>')}</small>` : ''}`;
      $('[data-x]', m).disabled = false;
    };
  }

  let filtroUsuarios = 'ativos';
  async function admUsuarios(el) {
    const [users, conv, priv, cargosCad, funcsRh, unidRh] = await Promise.all([ler('usuarios'), ler('convites'), ler('privado'), ler('rh_cargos').catch(() => null), ler('rh_funcionarios').catch(() => null), ler('rh_unidades').catch(() => null)]);
    const opcoesCargo = nomesCargos(cargosCad);
    // O RH manda no cargo e na unidade de quem está vinculado: nome do cargo/unidade do funcionário.
    const dadosRh = (f) => ({ cargo: cargosCad?.[f.cargoId]?.nome || '', unidade: unidRh?.[f.unidadeId]?.nome || '' });
    // Vínculo usuário ↔ funcionário do RH: rh_funcionarios/{id}/login = login do Dados.
    // Sugestão = funcionário ainda sem vínculo com o MESMO nome completo (ignora acentos/maiúsculas), só quando é único.
    const funcs = lista(funcsRh);
    const funcDe = (login) => funcs.find((f) => f.login === login) || null;
    const sugestaoDe = (u) => {
      if (funcDe(u.id)) return null;
      const m = funcs.filter((f) => !f.login && nomeChave(f.nome) === nomeChave(u.nome));
      return m.length === 1 ? m[0] : null;
    };
    const sugeridos = funcs.length ? lista(users).map((u) => [u, sugestaoDe(u)]).filter(([, f]) => f) : [];
    {
      const up = {};
      funcs.filter((f) => f.login && users?.[f.login]).forEach((f) => {
        const d = dadosRh(f), u = users[f.login];
        if ((u.cargo || '') !== d.cargo) { up[`usuarios/${f.login}/cargo`] = d.cargo; u.cargo = d.cargo; }
        if ((u.unidade || '') !== d.unidade) { up[`usuarios/${f.login}/unidade`] = d.unidade; u.unidade = d.unidade; }
      });
      if (Object.keys(up).length) ref('/').update(up).catch(() => {});
    }
    const nomeG = (id) => S.grupos.find((g) => g.id === id)?.nome || '—';
    const convites = lista(conv).sort((a, b) => (b.criado_em || 0) - (a.criado_em || 0));
    el.innerHTML = `
      <div class="card"><div class="secao-head" style="margin-bottom:0"><h2 style="color:var(--navy);font-size:18px">Colaboradores</h2>
        <span style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn ghost" id="imp-unilamic"><i class="fas fa-graduation-cap"></i> Importar do UniLAMIC</button><button class="btn ghost" id="imp-rh"><i class="fas fa-id-badge"></i> Importar do RH</button><button class="btn ghost" id="cpf-rh"><i class="fas fa-id-card"></i> Buscar CPFs</button><button class="btn ghost" id="imp-agenda"><i class="fas fa-calendar-check"></i> Importar da Agenda</button>${sugeridos.length ? `<button class="btn ghost" id="vinc-todos"><i class="fas fa-link"></i> Vincular todos ao RH (${sugeridos.length})</button>` : ''}<button class="btn turq" id="novo-user"><i class="fas fa-user-plus"></i> Criar usuário</button></span></div>
        <p style="font-size:13px;color:var(--txt-2);margin-top:6px">O administrador define login e senha e entrega ao colaborador. A senha pode ser alterada aqui a qualquer momento (botão <i class="fas fa-key"></i>).</p>
        ${convites.length ? `<div class="scroll-x" style="margin-top:12px"><table class="tabela"><thead><tr><th>Convite pendente (antigo)</th><th>Grupo</th><th></th></tr></thead><tbody>
          ${convites.map((c) => `<tr><td>${esc(c.nome)}<br><small>@${esc(c.id)}</small></td><td>${esc(nomeG(c.grupo))}</td>
          <td><button class="btn sm ghost" data-delconv="${esc(c.id)}">Cancelar</button></td></tr>`).join('')}</tbody></table></div>` : ''}
      </div>
      <div class="card" style="margin-top:16px">
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">${[['ativos', 'Ativos', (u) => u.ativo], ['inativos', 'Inativos', (u) => !u.ativo], ['todos', 'Todos', () => true]]
          .map(([id, rot, f]) => `<button class="btn sm ${filtroUsuarios === id ? 'turq' : 'ghost'}" data-filtro="${id}">${rot} <small>(${lista(users).filter(f).length})</small></button>`).join('')}</div>
        <div class="scroll-x"><table class="tabela"><thead><tr><th>Colaborador</th><th>Cargo</th><th>Grupo</th><th>Ativo</th><th></th></tr></thead><tbody>
        ${lista(users).filter((u) => filtroUsuarios === 'todos' || (filtroUsuarios === 'ativos' ? u.ativo : !u.ativo)).sort(porNome).map((u) => `<tr data-u="${esc(u.id)}"><td><b>${esc(u.nome)}</b><br><small>@${esc(u.id)} · CPF ${esc(cpfOculto(priv?.[u.id]?.cpf))}${u.unidade ? ` · ${esc(u.unidade)}` : ''}</small>${funcs.length ? `<br>${funcDe(u.id)
            ? `<button class="btn sm ghost vinc" style="padding:2px 8px;font-size:11px;margin-top:4px" title="Funcionário vinculado no RH"><i class="fas fa-link" style="color:var(--turq)"></i> RH: ${esc(funcDe(u.id).nome)}</button>`
            : sugestaoDe(u) ? `<button class="btn sm ghost vinc" style="padding:2px 8px;font-size:11px;margin-top:4px;border-color:#f0ad4e" title="Sugestão pelo nome completo"><i class="fas fa-lightbulb" style="color:#f0ad4e"></i> Vincular ao RH (sugerido)</button>`
            : `<button class="btn sm ghost vinc" style="padding:2px 8px;font-size:11px;margin-top:4px;opacity:.7"><i class="fas fa-link-slash"></i> Sem vínculo no RH</button>`}` : ''}</td>
          <td><input class="cargo" value="${esc(u.cargo || '')}" placeholder="Selecione…" title="${esc(u.cargo || '')}" style="border:1px solid var(--borda);border-radius:10px;padding:6px 10px;width:190px"></td>
          <td><select class="grupo" ${u.id === S.me.login ? 'disabled' : ''}>${optGrupos(u.grupo)}</select></td>
          <td><label class="perm-row${u.ativo ? ' on' : ''}" style="padding:4px;border:0;background:none;cursor:pointer" title="${u.ativo ? 'Ativo' : 'Inativo'}"><input type="checkbox" class="ativo" style="display:none" ${u.ativo ? 'checked' : ''} ${u.id === S.me.login ? 'disabled' : ''}><span class="perm-tg"></span></label></td>
          <td style="white-space:nowrap"><button class="btn sm ghost editu" title="Editar nome, CPF e login"><i class="fas fa-pen"></i></button> <button class="btn sm ghost redef" title="${u.id === S.me.login ? 'Use o botão de chave no topo' : 'Alterar senha'}" ${u.id === S.me.login ? 'disabled' : ''}><i class="fas fa-key"></i></button></td></tr>`).join('')}
      </tbody></table></div></div>`;

    $$('[data-filtro]', el).forEach((b) => b.onclick = () => { filtroUsuarios = b.dataset.filtro; admUsuarios(el); });
    const vt = $('#vinc-todos', el);
    if (vt) vt.onclick = async () => {
      if (!(await confirmarAcao(`Vincular ${sugeridos.length} usuário(s) ao funcionário do RH com o mesmo nome completo?`))) return;
      const up = {};
      sugeridos.forEach(([u, f]) => {
        const d = dadosRh(f);
        up[`rh_funcionarios/${f.id}/login`] = u.id; up[`usuarios/${u.id}/cargo`] = d.cargo; up[`usuarios/${u.id}/unidade`] = d.unidade;
      });
      try { await ref('/').update(up); auditar('vinculo_rh_lote', `${sugeridos.length}`); toast(`${sugeridos.length} vínculo(s) criado(s).`); admUsuarios(el); }
      catch (err) { toast(traduz(err)); }
    };
    $('#imp-unilamic').onclick = () => importarUnilamic(el).catch((e) => toast(traduz(e)));
    $('#imp-rh').onclick = () => importarRh(el).catch((e) => toast(traduz(e)));
    $('#cpf-rh').onclick = () => cpfsDoRh(el).catch((e) => toast(traduz(e)));
    $('#imp-agenda').onclick = () => importarAgenda(el).catch((e) => toast(traduz(e)));
    $('#novo-user').onclick = () => {
      const m = modal(`<h2>Criar usuário</h2><form autocomplete="off">
        <div class="field"><span>Funcionário do RH <small style="font-weight:400;color:var(--txt-2)">(opcional)</small></span>
          <div data-rh-sel></div>
          <input data-rh-busca placeholder="Buscar funcionário sem conta pelo nome…" autocomplete="off"></div>
        <label class="field"><span>Nome completo</span><input name="nome" required></label>
        ${campoLogin()}
        ${campoCpf()}
        <div class="row">
          <label class="field"><span>Cargo</span><input name="cargo" placeholder="Selecione…"></label>
          <label class="field"><span>Grupo</span><select name="grupo" required>${optGrupos('colab')}</select></label>
        </div>
        <label class="field"><span>Senha</span><input name="senha" type="password" required data-forte autocomplete="new-password"></label>
        ${campoConfirma()}
        <div class="modal-acoes"><button type="button" class="btn ghost" data-x>Cancelar</button><button class="btn turq">Criar</button></div></form>`, { bloqueante: true });
      ligarCamposLogin(m);
      comboCargo($('[name=cargo]', m), opcoesCargo, () => {});
      const rhEscolhido = popoverFuncionarioRh(m, funcs, dadosRh);
      $('[data-x]', m).onclick = () => m.remove();
      $('form', m).onsubmit = async (e) => {
        e.preventDefault();
        const form = e.target;
        if (!form.reportValidity()) return;
        const f = Object.fromEntries(new FormData(form));
        const cpf = soDigitos(f.cpf);
        if (!LOGIN_RE.test(f.login)) return toast(ERROS.LOGIN_INVALIDO);
        if (!cpfValido(cpf)) return toast(ERROS.CPF_INVALIDO);
        const btn = $('button.turq', form); btn.disabled = true;
        let conta;
        try {
          const [info, dono] = await Promise.all([ler(`logins/${f.login}`), cpf === CPF_ENTIDADE ? null : ler(`cpfs/${cpf}`)]);
          if (info?.uid) throw falha('LOGIN_EM_USO');
          if (dono) throw falha('CPF_EM_USO');
          const v = info ? (info.v || 0) + 1 : 0;
          conta = await criarContaAuth(f.login, v, f.senha);
          // Vínculo com o funcionário do RH: o RH passa a mandar no cargo e na unidade.
          const fr = rhEscolhido();
          const rh = fr ? { [`rh_funcionarios/${fr.id}/login`]: f.login } : {};
          const d = fr ? dadosRh(fr) : null;
          await ref('/').update({
            ...rh,
            [`logins/${f.login}`]: { v, uid: conta.uid, trocar: true },
            [`uids/${conta.uid}`]: f.login,
            [`usuarios/${f.login}`]: { nome: f.nome.trim(), cargo: d ? d.cargo : f.cargo.trim(), ...(d?.unidade ? { unidade: d.unidade } : {}), grupo: f.grupo, ativo: true, criado_em: TS() },
            [`privado/${f.login}`]: { cpf },
            [`convites/${f.login}`]: null,
            ...(cpf === CPF_ENTIDADE ? {} : { [`cpfs/${cpf}`]: f.login }),
          });
          conta.fechar();
          auditar('usuario_criado', f.login);
          m.remove(); toast(`Usuário @${f.login} criado.`); admUsuarios(el);
        } catch (err) {
          if (conta) conta.descartar();
          toast(traduz(err)); btn.disabled = false;
        }
      };
    };
    $$('[data-delconv]', el).forEach((b) => b.onclick = async () => {
      await ref(`convites/${b.dataset.delconv}`).remove().catch((e) => toast(traduz(e)));
      admUsuarios(el);
    });
    $$('tr[data-u]', el).forEach((tr) => {
      const login = tr.dataset.u;
      const salvar = async (campo, valor) => {
        try {
          await ref(`usuarios/${login}/${campo}`).set(valor);
          auditar(`usuario_${campo}`, `${login}: ${valor}`);
          toast('Salvo.');
        } catch (err) { toast(traduz(err)); admUsuarios(el); }
      };
      $('.grupo', tr).onchange = (e) => salvar('grupo', e.target.value);
      $('.ativo', tr).onchange = (e) => { e.target.closest('.perm-row').classList.toggle('on', e.target.checked); salvar('ativo', e.target.checked).then(() => setTimeout(() => admUsuarios(el), 400)); };
      const bv = $('.vinc', tr);
      if (bv) bv.onclick = () => vincularFuncionario(users[login] ? { ...users[login], id: login } : { id: login }, funcs, funcDe(login), sugestaoDe({ ...users[login], id: login }), () => admUsuarios(el), dadosRh);
      $('.editu', tr).onclick = () => editarUsuario(login, users[login], priv?.[login]?.cpf || '', priv || {}, () => admUsuarios(el));
      comboCargo($('.cargo', tr), opcoesCargo, async (v) => {
        const f = funcDe(login);
        if (!f) { $('.cargo', tr).title = v; return salvar('cargo', v); }
        const antigo = dadosRh(f).cargo;
        const cargoId = Object.keys(cargosCad || {}).find((id) => cargosCad[id]?.nome === v);
        if (!cargoId || !(await confirmarAcao(`Este usuário está vinculado ao funcionário ${f.nome} no RH. Alterar o cargo de "${antigo || '—'}" para "${v}" aqui e no RH LAMIC?`))) {
          $('.cargo', tr).value = antigo; return;
        }
        try {
          await ref('/').update({ [`usuarios/${login}/cargo`]: v, [`rh_funcionarios/${f.id}/cargoId`]: cargoId });
          f.cargoId = cargoId; $('.cargo', tr).title = v;
          auditar('cargo_alterado_dados_rh', `${login}: ${antigo} → ${v}`); toast('Cargo alterado no Dados e no RH.');
        } catch (err) { toast(traduz(err)); admUsuarios(el); }
      });
      // Firebase não deixa o cliente trocar a senha de outra conta: cria-se uma conta nova (login.v+1)
      // com a senha nova e o login passa a apontar para ela. A conta antiga deixa de valer na hora.
      $('.redef', tr).onclick = () => {
        const nome = $('b', tr).textContent;
        const m = modal(`<h2>Alterar senha</h2><p class="sub" style="margin-bottom:14px">${esc(nome)} · @${esc(login)}</p><form autocomplete="off">
          <label class="field"><span>Nova senha</span><input name="senha" type="password" required data-forte autocomplete="new-password"></label>
          ${campoConfirma()}
          <div class="modal-acoes"><button type="button" class="btn ghost" data-x>Cancelar</button><button class="btn turq">Salvar senha</button></div></form>`);
        ligarCamposLogin(m);
        $('[data-x]', m).onclick = () => m.remove();
        $('form', m).onsubmit = async (e) => {
          e.preventDefault();
          if (!e.target.reportValidity()) return;
          const btn = $('button.turq', e.target); btn.disabled = true;
          let conta;
          try {
            const info = await ler(`logins/${login}`);
            const v = (info?.v || 0) + 1;
            conta = await criarContaAuth(login, v, e.target.senha.value);
            const up = { [`logins/${login}`]: { v, uid: conta.uid, trocar: true }, [`uids/${conta.uid}`]: login };
            if (info?.uid) up[`uids/${info.uid}`] = null;
            await ref('/').update(up);
            conta.fechar();
            auditar('senha_alterada_admin', login);
            m.remove(); toast(`Senha de @${login} alterada.`);
          } catch (err) {
            if (conta) conta.descartar();
            toast(traduz(err)); btn.disabled = false;
          }
        };
      };
    });
  }

  // ─── Vínculo manual usuário ↔ funcionário do RH ───
  // Campo opcional "Funcionário do RH" no Criar usuário: popover com busca entre os funcionários
  // ainda sem conta. Escolher preenche nome, cargo e CPF (quando o RH tem) e grava o vínculo ao criar.
  // Devolve uma função que diz qual funcionário ficou escolhido (ou null).
  function popoverFuncionarioRh(m, funcs, dadosRh) {
    const busca = $('[data-rh-busca]', m), sel = $('[data-rh-sel]', m);
    const livres = funcs.filter((f) => !f.login && f.nome).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
    let escolhido = null, pop = null, ativo = 0;
    const cpfDoRh = (f) => {
      const pags = Object.values(f.pagamentos || {});
      const c = pags.map((p) => p.pixTipo === 'CPF' ? soDigitos(p.pixChave) : '').concat(pags.map((p) => soDigitos(p.titularDoc)))
        .find((x) => x && x !== CPF_ENTIDADE && cpfValido(x));
      return c || '';
    };
    const iniciais = (n) => String(n).split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
    const fechar = () => { if (pop) { pop.remove(); pop = null; } };
    const preencher = (f) => {
      const d = dadosRh(f), set = (n, v) => { const i = $(`[name=${n}]`, m); if (i && v) { i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); } };
      set('nome', f.nome); set('cargo', d.cargo);
      const cpf = cpfDoRh(f), ic = $('[name=cpf]', m);
      if (cpf && ic && !soDigitos(ic.value)) set('cpf', cpf);
    };
    const pintarSel = () => {
      busca.style.display = escolhido ? 'none' : '';
      if (!escolhido) { sel.innerHTML = ''; return; }
      const d = dadosRh(escolhido);
      sel.innerHTML = `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid rgba(46,170,190,.45);background:rgba(46,170,190,.08);border-radius:12px">
        <span style="width:32px;height:32px;border-radius:50%;background:#162036;color:#fff;display:grid;place-items:center;font-size:11px;font-weight:800">${esc(iniciais(escolhido.nome))}</span>
        <span style="flex:1;min-width:0"><b style="display:block;font-size:13px">${esc(escolhido.nome)}</b><small style="color:var(--txt-2)">${esc([d.cargo, d.unidade].filter(Boolean).join(' · ') || 'Funcionário do RH')}</small></span>
        <i class="fas fa-link" style="color:#2AA7BE" title="Será vinculado ao criar"></i>
        <button type="button" class="btn sm ghost" data-rh-tirar title="Tirar vínculo"><i class="fas fa-xmark"></i></button></div>`;
      $('[data-rh-tirar]', sel).onclick = () => { escolhido = null; pintarSel(); busca.value = ''; busca.focus(); };
    };
    const desenhar = () => {
      const q = nomeChave(busca.value);
      const itens = livres.filter((f) => !q || nomeChave(f.nome).includes(q)).slice(0, 40);
      if (!pop) {
        pop = document.createElement('div');
        pop.style.cssText = 'position:fixed;z-index:9999;max-height:300px;overflow:auto;background:var(--card,#fff);border:1px solid var(--borda);border-radius:14px;box-shadow:0 14px 36px rgba(22,32,54,.22);padding:6px;font-size:13px';
        pop.addEventListener('mousedown', (e) => e.preventDefault());
        document.body.appendChild(pop);
      }
      const r = busca.getBoundingClientRect();
      pop.style.left = `${r.left}px`; pop.style.top = `${r.bottom + 6}px`; pop.style.width = `${r.width}px`;
      ativo = Math.min(ativo, Math.max(itens.length - 1, 0));
      pop.innerHTML = itens.length ? itens.map((f, i) => {
        const d = dadosRh(f);
        return `<div data-i="${i}" style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;cursor:pointer;${i === ativo ? 'background:rgba(46,170,190,.15)' : ''}">
          <span style="width:30px;height:30px;flex:none;border-radius:50%;background:#162036;color:#fff;display:grid;place-items:center;font-size:10px;font-weight:800">${esc(iniciais(f.nome))}</span>
          <span style="min-width:0"><b style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(f.nome)}</b><small style="color:var(--txt-2)">${esc([d.cargo, d.unidade].filter(Boolean).join(' · ') || '—')}</small></span></div>`;
      }).join('') : `<div style="padding:10px;color:var(--txt-2)">${livres.length ? 'Nenhum funcionário encontrado.' : 'Todos os funcionários do RH já têm conta.'}</div>`;
      $$('[data-i]', pop).forEach((dv) => dv.onclick = () => escolher(itens[+dv.dataset.i]));
      return itens;
    };
    const escolher = (f) => { if (!f) return; escolhido = f; fechar(); preencher(f); pintarSel(); };
    busca.addEventListener('focus', desenhar);
    busca.addEventListener('input', () => { ativo = 0; desenhar(); });
    busca.addEventListener('blur', () => setTimeout(fechar, 120));
    busca.addEventListener('keydown', (e) => {
      const itens = pop ? desenhar() : [];
      if (e.key === 'ArrowDown') { e.preventDefault(); ativo = Math.min(ativo + 1, itens.length - 1); desenhar(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); ativo = Math.max(ativo - 1, 0); desenhar(); }
      else if (e.key === 'Enter') { e.preventDefault(); escolher(itens[ativo]); }
      else if (e.key === 'Escape') { fechar(); }
    });
    const obs = new MutationObserver(() => { if (!document.body.contains(m)) { fechar(); obs.disconnect(); } });
    obs.observe(document.body, { childList: true });
    if (!funcs.length) { busca.disabled = true; busca.placeholder = 'Sem acesso ao cadastro do RH'; }
    return () => escolhido;
  }

  function vincularFuncionario(u, funcs, atual, sugerido, depois, dadosRh) {
    const livres = funcs.filter((f) => !f.login || f.login === u.id);
    const rot = (f) => f.nome || '(sem nome)';
    const opcoes = [...new Set(livres.map(rot))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const m = modal(`<h2>Funcionário do RH</h2><p class="sub" style="margin-bottom:14px">${esc(u.nome || '')} · @${esc(u.id)}</p><form autocomplete="off">
      <label class="field"><span>Funcionário</span><input name="func" placeholder="Digite para buscar…" value="${esc(atual ? rot(atual) : sugerido ? rot(sugerido) : '')}"></label>
      ${!atual && sugerido ? '<p style="font-size:12px;color:var(--txt-2);margin:-4px 0 10px"><i class="fas fa-lightbulb" style="color:#f0ad4e"></i> Sugerido pelo nome completo.</p>' : ''}
      <div class="modal-acoes">${atual ? '<button type="button" class="btn ghost" data-desv>Desvincular</button>' : ''}<button type="button" class="btn ghost" data-x>Cancelar</button><button class="btn turq">Vincular</button></div></form>`);
    const inp = $('input[name=func]', m);
    comboCargo(inp, opcoes, () => {});
    $('[data-x]', m).onclick = () => m.remove();
    const dv = $('[data-desv]', m);
    if (dv) dv.onclick = async () => {
      try { await ref(`rh_funcionarios/${atual.id}/login`).remove(); auditar('vinculo_rh_removido', u.id); m.remove(); depois(); } catch (err) { toast(traduz(err)); }
    };
    $('form', m).onsubmit = async (e) => {
      e.preventDefault();
      const f = livres.filter((x) => rot(x) === inp.value);
      if (f.length !== 1) return toast(f.length ? 'Há mais de um funcionário com esse nome; ajuste no RH.' : 'Escolha um funcionário da lista.');
      const d = dadosRh(f[0]);
      const up = { [`rh_funcionarios/${f[0].id}/login`]: u.id, [`usuarios/${u.id}/cargo`]: d.cargo, [`usuarios/${u.id}/unidade`]: d.unidade };
      if (atual && atual.id !== f[0].id) up[`rh_funcionarios/${atual.id}/login`] = null;
      try { await ref('/').update(up); auditar('vinculo_rh', `${u.id} → ${f[0].nome}`); m.remove(); depois(); } catch (err) { toast(traduz(err)); }
    };
  }

  // ─── Editar nome, CPF e login de um colaborador ───
  // Nome e CPF: gravação direta. Login: o Firebase Auth usa login.v@dados-lamic.app, então trocar o login
  // cria uma conta nova (senha definida aqui, troca obrigatória no 1º acesso) e move, numa gravação só,
  // tudo o que é indexado pelo login: perfil, CPF, leituras de avisos, vínculo do UniLAMIC, acesso ao RH
  // e à Agenda. Registros antigos (auditoria, autor de avisos) continuam com o login antigo.
  function editarUsuario(login, u, cpfAtual, privTodos, depois) {
    const ehAdmin = S.me?.grupo === 'admin';
    const m = modal(`<h2>Editar colaborador</h2><p class="sub" style="margin-bottom:14px">@${esc(login)}</p><form autocomplete="off">
      <label class="field"><span>Nome completo</span><input name="nome" required value="${esc(u?.nome || '')}"></label>
      <label class="field"><span>CPF</span><input name="cpf" inputmode="numeric" maxlength="14" placeholder="000.000.000-00" value="${esc(cpfAtual ? mascaraCpf(cpfAtual) : '')}"></label>
      ${ehAdmin && login !== S.me.login ? `${campoLogin('Login')}
      <div id="nova-senha" style="display:none"><p style="font-size:12px;color:var(--txt-2);margin:-4px 0 8px">Trocar o login cria uma conta nova: defina a senha (o colaborador troca no 1º acesso).</p>
        <label class="field"><span>Senha da conta nova</span><input name="senha" type="password" autocomplete="new-password" minlength="6"></label></div>`
        : '<p style="font-size:12px;color:var(--txt-2);margin-bottom:10px">Login só pode ser trocado por um administrador, e não o próprio.</p>'}
      <div class="modal-acoes"><button type="button" class="btn ghost" data-x>Cancelar</button><button class="btn turq">Salvar</button></div></form>`);
    ligarCamposLogin(m);
    const inLogin = $('input[name=login]', m);
    if (inLogin) {
      inLogin.value = login;
      inLogin.addEventListener('input', () => { const muda = inLogin.value !== login; $('#nova-senha', m).style.display = muda ? '' : 'none'; $('input[name=senha]', m).required = muda; });
    }
    $('[data-x]', m).onclick = () => m.remove();
    $('form', m).onsubmit = async (e) => {
      e.preventDefault();
      if (!e.target.reportValidity()) return;
      const nome = e.target.nome.value.trim();
      const cpf = soDigitos(e.target.cpf.value);
      const novo = inLogin ? inLogin.value.trim() : login;
      if (cpf && !cpfValido(cpf)) return toast(ERROS.CPF_INVALIDO);
      const donoCpf = cpf && cpf !== CPF_ENTIDADE ? Object.keys(privTodos).find((l) => l !== login && privTodos[l]?.cpf === cpf) : null;
      if (donoCpf) return toast(`Este CPF já está cadastrado em @${donoCpf}.`);
      if (!LOGIN_RE.test(novo)) return toast('Login inválido.');
      const btn = $('button.turq', e.target); btn.disabled = true;
      let conta;
      try {
        const up = {};
        const alvo = novo;
        // CPF (índice cpfs/ sai do antigo e vai para o novo)
        if (cpf !== soDigitos(cpfAtual) || novo !== login) {
          if (cpfAtual && cpfAtual !== CPF_ENTIDADE) up[`cpfs/${cpfAtual}`] = null;
          if (cpf) { up[`privado/${alvo}/cpf`] = cpf; if (cpf !== CPF_ENTIDADE) up[`cpfs/${cpf}`] = alvo; }
          else up[`privado/${alvo}/cpf`] = null;
        }
        if (novo === login) {
          up[`usuarios/${login}/nome`] = nome;
          await ref('/').update(up);
          auditar('usuario_editado', login);
        } else {
          if ((await ler(`logins/${novo}`))?.uid || (await ler(`usuarios/${novo}`))) throw new Error(`O login @${novo} já existe.`);
          const [info, leit, porLoginUni, rhAcesso, agUser, rhUsers] = await Promise.all([
            ler(`logins/${login}`), ler(`leituras/${login}`).catch(() => null), ler(`uniadmin/porLogin/${login}`).catch(() => null),
            ler(`rh_acesso/${login}`).catch(() => null), ler(`agenda/users/${login}`).catch(() => null), ler('rh_usuarios').catch(() => null)]);
          conta = await criarContaAuth(novo, 0, e.target.senha.value);
          Object.assign(up, {
            [`logins/${novo}`]: { v: 0, uid: conta.uid, trocar: true }, [`logins/${login}`]: null,
            [`uids/${conta.uid}`]: novo,
            [`usuarios/${novo}`]: { ...u, nome }, [`usuarios/${login}`]: null,
            [`privado/${login}`]: null,
          });
          if (info?.uid) up[`uids/${info.uid}`] = null;
          if (!up[`privado/${novo}/cpf`] && cpfAtual) { up[`privado/${novo}/cpf`] = cpfAtual; if (cpfAtual !== CPF_ENTIDADE) up[`cpfs/${cpfAtual}`] = novo; }
          if (leit) { up[`leituras/${novo}`] = leit; up[`leituras/${login}`] = null; }
          if (porLoginUni) { up[`uniadmin/porLogin/${novo}`] = porLoginUni; up[`uniadmin/porLogin/${login}`] = null; up[`uniadmin/users/${porLoginUni}/login`] = novo; }
          if (rhAcesso) { up[`rh_acesso/${novo}`] = rhAcesso; up[`rh_acesso/${login}`] = null; }
          lista(rhUsers).filter((r) => String(r.login || '').toLowerCase() === login).forEach((r) => { up[`rh_usuarios/${r.id}/login`] = novo; });
          if (agUser) { up[`agenda/users/${novo}`] = { ...agUser, username: novo }; up[`agenda/users/${login}`] = null; }
          await ref('/').update(up);
          conta.fechar();
          auditar('login_alterado', `${login} → ${novo}`);
        }
        m.remove(); toast('Colaborador atualizado.'); depois();
      } catch (err) {
        if (conta) conta.descartar();
        toast(err?.message && !err.code ? err.message : traduz(err)); btn.disabled = false;
      }
    };
  }

  // ─── Cargos (funções) ───
  // Cadastro único em rh_cargos, o mesmo do RH LAMIC (lá ficam também CBO, salário etc.). O Dados só
  // lê e grava o campo `nome`; usuarios/{login}/cargo guarda o NOME do cargo escolhido.
  const nomesCargos = (cargos) => [...new Set(lista(cargos).map((c) => String(c.nome || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));

  // Campo com lista suspensa: digita para filtrar, escolhe com clique ou Enter. Só aceita cargo cadastrado.
  function comboCargo(input, opcoes, aoEscolher) {
    let pop = null, ativo = -1, inicial = input.value, naLista = false;
    const fechar = () => { if (pop) { pop.remove(); pop = null; } ativo = -1; };
    const escolher = (v) => { input.value = v; fechar(); if (v !== inicial) { inicial = v; aoEscolher(v); } };
    const desenhar = () => {
      const q = nomeChave(input.value);
      const itens = opcoes.filter((o) => !q || nomeChave(o).includes(q));
      if (!pop) {
        pop = document.createElement('div');
        pop.style.cssText = 'position:fixed;z-index:9999;max-height:260px;overflow:auto;background:var(--card,#fff);border:1px solid var(--borda);border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.15);padding:4px;font-size:13px';
        document.body.appendChild(pop);
        // Clique/arraste na lista (itens e barra de rolagem) não tira o foco do campo.
        pop.addEventListener('mousedown', (e) => e.preventDefault());
        pop.addEventListener('pointerdown', (e) => { e.preventDefault(); naLista = true; });
        document.addEventListener('pointerup', () => { naLista = false; }, true);
      }
      const r = input.getBoundingClientRect();
      pop.style.left = `${r.left}px`; pop.style.top = `${r.bottom + 4}px`; pop.style.minWidth = `${Math.max(r.width, 240)}px`;
      pop.innerHTML = itens.length
        ? itens.map((o, i) => `<div data-v="${esc(o)}" style="padding:7px 10px;border-radius:8px;cursor:pointer;${i === ativo ? 'background:rgba(46,170,190,.15)' : ''}">${esc(o)}</div>`).join('')
        : '<div style="padding:8px 10px;color:var(--txt-2)">Nenhum cargo. Cadastre no RH LAMIC.</div>';
      $$('[data-v]', pop).forEach((d) => d.onclick = () => escolher(d.dataset.v));
      return itens;
    };
    input.setAttribute('autocomplete', 'off');
    input.addEventListener('focus', () => { input.select(); desenhar(); });
    input.addEventListener('input', () => { ativo = -1; desenhar(); });
    input.addEventListener('keydown', (e) => {
      const itens = pop ? desenhar() : [];
      if (e.key === 'ArrowDown') { e.preventDefault(); ativo = Math.min(ativo + 1, itens.length - 1); desenhar(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); ativo = Math.max(ativo - 1, 0); desenhar(); }
      else if (e.key === 'Enter') { e.preventDefault(); const v = itens[ativo] || (itens.length === 1 ? itens[0] : null); if (v) escolher(v); }
      else if (e.key === 'Escape') { input.value = inicial; fechar(); input.blur(); }
    });
    input.addEventListener('blur', () => {
      if (naLista) { setTimeout(() => input.focus(), 0); return; }   // clicou na barra de rolagem da lista
      const exato = opcoes.find((o) => nomeChave(o) === nomeChave(input.value));
      if (exato) escolher(exato);
      else if (!input.value.trim()) escolher('');
      else { input.value = inicial; fechar(); }
    });
    // Rolagem da página fecha a lista; a rolagem da própria lista, não.
    window.addEventListener('scroll', (e) => { if (pop && !pop.contains(e.target)) fechar(); }, true);
  }

  // Cargos: só leitura. O cadastro é do RH LAMIC (rh_cargos); aqui apenas se importa a lista.
  async function admCargos(box, users) {
    const cargos = (await ler('rh_cargos').catch(() => null)) || {};
    const nomes = nomesCargos(cargos);
    const contar = (n) => users.filter((u) => nomeChave(u.cargo) === nomeChave(n)).length;
    const foraDoRh = [...new Set(users.map((u) => String(u.cargo || '').trim()).filter(Boolean))]
      .filter((c) => !nomes.some((n) => nomeChave(n) === nomeChave(c))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    box.innerHTML = `<div class="card" style="margin-top:16px">
      <div class="secao-head" style="margin-bottom:12px"><h2 style="color:var(--navy);font-size:18px">Cargos <small style="font-weight:500;color:var(--txt-2);font-size:13px">· importados do RH LAMIC</small></h2></div>
      ${foraDoRh.length ? `<div style="background:rgba(240,173,78,.12);border:1px solid rgba(240,173,78,.5);border-radius:12px;padding:10px 12px;margin-bottom:12px;font-size:13px">
        <b>${foraDoRh.length} cargo(s) usados em usuários não existem no RH:</b> ${foraDoRh.map(esc).join(', ')}.
        Cadastre-os no RH LAMIC ou escolha outro cargo para esses usuários.</div>` : ''}
      <div class="scroll-x"><table class="tabela"><thead><tr><th>Cargo</th><th>Colaboradores</th></tr></thead><tbody>
      ${nomes.map((n) => `<tr><td><b>${esc(n)}</b></td><td>${contar(n)}</td></tr>`).join('')
        || '<tr><td colspan="2" style="color:var(--txt-2)">Nenhum cargo no RH LAMIC. Rode "Importar do RH" em Usuários.</td></tr>'}
      </tbody></table></div>
      <p style="font-size:12px;color:var(--txt-2);margin-top:10px">Criar, renomear ou excluir cargo é feito no RH LAMIC (Configurações › Cargos). A lista aqui se atualiza sozinha.</p></div>`;
  }

  // Grupos: lista + editor em janela com cartões por categoria (inspirado em seeds/manutencao).
  async function admGrupos(el) {
    await carregarGrupos();
    const users = lista(await ler('usuarios'));
    el.innerHTML = `<div class="card">
      <div class="secao-head" style="margin-bottom:12px"><h2 style="color:var(--navy);font-size:18px">Grupos</h2>
        <button class="btn turq" id="novo-grupo"><i class="fas fa-plus"></i> Novo grupo</button></div>
      <div class="scroll-x"><table class="tabela"><thead><tr><th>Grupo</th><th>Membros</th><th>Permissões</th><th>Links</th><th></th></tr></thead><tbody>
      ${S.grupos.map((g) => {
        const n = users.filter((u) => u.grupo === g.id).length;
        const np = g.sistema ? 'Todas' : PERMISSOES.filter(([p]) => g.perms?.[chavePerm(p)]).length;
        const nl = g.sistema ? 'Todos' : g.links ? Object.keys(g.links).length : 'por módulo';
        return `<tr><td><b>${esc(g.nome)}</b>${g.sistema ? ' <span class="tag normal">sistema</span>' : ''}</td>
          <td>${n} membro${n !== 1 ? 's' : ''}</td><td>${np}</td><td>${nl}</td>
          <td style="text-align:right;white-space:nowrap">${g.sistema ? '' : `<button class="btn sm ghost" data-edg="${esc(g.id)}" title="Editar"><i class="fas fa-pen"></i></button>
            <button class="btn sm ghost" data-delg="${esc(g.id)}" title="Excluir"><i class="fas fa-trash"></i></button>`}</td></tr>`;
      }).join('')}
      </tbody></table></div>
      <p style="font-size:12px;color:var(--txt-2);margin-top:10px">O grupo Administradores sempre tem todas as permissões e todos os links.</p></div>
      <div id="adm-cargos"></div>`;
    admCargos($('#adm-cargos', el), users).catch((e) => toast(traduz(e)));

    $('#novo-grupo').onclick = () => editarGrupo(null, () => admGrupos(el));
    $$('[data-edg]', el).forEach((b) => b.onclick = () => editarGrupo(b.dataset.edg, () => admGrupos(el)));
    $$('[data-delg]', el).forEach((b) => b.onclick = async () => {
      const n = users.filter((u) => u.grupo === b.dataset.delg).length;
      if (!(await confirmarAcao(`Excluir grupo?${n ? ` ${n} usuário(s) dele ficarão sem permissões e sem links.` : ''}`))) return;
      try { await ref(`grupos/${b.dataset.delg}`).remove(); auditar('grupo_excluido', b.dataset.delg); admGrupos(el); } catch (err) { toast(traduz(err)); }
    });
  }

  async function editarGrupo(id, depois) {
    const g = id ? S.grupos.find((x) => x.id === id) : null;
    const mods = lista(await ler('modulos')).sort(porOrdem);
    // estado inicial dos links: lista do grupo ou, em grupo antigo, módulos inteiros liberados
    const ligado = (m, l) => g ? (g.links ? !!g.links[l.id] : !!m.grupos?.[id]) : false;
    const linha = (k, rotulo, on, ic = '') => `<label class="perm-row${on ? ' on' : ''}"><input type="checkbox" data-k="${esc(k)}" ${on ? 'checked' : ''}>
      <span class="perm-tg"></span><span class="perm-lb">${ic ? `<i class="${esc(ic)}"></i> ` : ''}${esc(rotulo)}</span></label>`;
    const cartao = (cat, icone, nome, linhas) => `<div class="perm-cat" data-cat="${esc(cat)}"><div class="perm-head">
      <span class="perm-ic"><i class="${esc(icone)}"></i></span><b>${esc(nome)}</b><span class="perm-badge"></span>
      <button type="button" class="perm-all">Todos</button></div><div class="perm-rows">${linhas}</div></div>`;

    const m = modal(`<h2>${g ? 'Editar grupo' : 'Novo grupo'}</h2><form>
      <label class="field"><span>Nome do grupo</span><input name="nome" required value="${esc(g?.nome || '')}" placeholder="Ex.: Recepção"></label>
      <h3 class="perm-tit">Permissões do sistema</h3>
      <div class="perm-grid">${CATEGORIAS.map((c) => cartao(`p-${c.id}`, c.icone, c.nome,
        c.perms.map(([p, d]) => linha(`p:${p}`, d, !!g?.perms?.[chavePerm(p)])).join(''))).join('')}</div>
      <h3 class="perm-tit">Módulos e links que o grupo vê</h3>
      <div class="perm-grid">${mods.map((md) => cartao(`m-${md.id}`, md.icone, md.nome,
        lista(md.links).sort(porOrdem).map((l) => linha(`l:${l.id}`, l.nome, ligado(md, l), l.icone)).join('') || '<small>Sem links.</small>')).join('')}</div>
      <div class="modal-acoes"><button type="button" class="btn ghost" data-x>Cancelar</button><button class="btn turq">Salvar</button></div></form>`);
    $('.modal-box', m).classList.add('largo');

    const atualizar = (cat) => {
      const cbs = $$('input[data-k]', cat), on = cbs.filter((c) => c.checked).length;
      const b = $('.perm-badge', cat); b.textContent = `${on}/${cbs.length}`; b.classList.toggle('on', on > 0);
      $('.perm-all', cat).textContent = cbs.length && on === cbs.length ? 'Nenhum' : 'Todos';
    };
    $$('.perm-cat', m).forEach((cat) => {
      $$('input[data-k]', cat).forEach((c) => c.onchange = () => { c.closest('.perm-row').classList.toggle('on', c.checked); atualizar(cat); });
      $('.perm-all', cat).onclick = () => {
        const cbs = $$('input[data-k]', cat), todos = cbs.every((c) => c.checked);
        cbs.forEach((c) => { c.checked = !todos; c.closest('.perm-row').classList.toggle('on', c.checked); });
        atualizar(cat);
      };
      atualizar(cat);
    });
    $('[data-x]', m).onclick = () => m.remove();
    $('form', m).onsubmit = async (e) => {
      e.preventDefault();
      if (!e.target.reportValidity()) return;
      const perms = {}, links = {};
      $$('input[data-k]:checked', m).forEach((c) => {
        const [t, k] = [c.dataset.k.slice(0, 1), c.dataset.k.slice(2)];
        if (t === 'p') perms[chavePerm(k)] = true; else links[k] = true;
      });
      const nome = e.target.nome.value.trim();
      const gid = id || novaChave();
      try {
        // links: {} gravado como null some do banco; marcador "_" mantém "grupo sem links" diferente de "grupo antigo"
        await ref(`grupos/${gid}`).set({ nome, perms: Object.keys(perms).length ? perms : null, links: Object.keys(links).length ? links : { _: true } });
        auditar(id ? 'grupo_editado' : 'grupo_criado', nome);
        m.remove(); toast('Grupo salvo.');
        if (id === S.me.grupo) await carregarGrupos();
        depois();
      } catch (err) { toast(traduz(err)); }
    };
  }

  async function admModulos(el) {
    const mods = lista(await ler('modulos')).sort(porOrdem);
    // migra links antigos laboratoriolamic.github.io/{repo}/ para seeds/{repo}/ (abre o index do módulo)
    const mig = {};
    mods.forEach((m) => Object.entries(m.links || {}).forEach(([lid, l]) => {
      const repo = repoDe(l?.url, true);
      if (repo) { mig[`${m.id}/links/${lid}/url`] = `seeds/${repo}/`; l.url = `seeds/${repo}/`; }
    }));
    if (Object.keys(mig).length) await ref('modulos').update(mig).catch((e) => toast(traduz(e)));
    el.innerHTML = `<div class="card"><p style="font-size:13px;color:var(--txt-2)">Quem vê cada link é definido em <a href="#admin/grupos">Grupos e permissões</a>. Link novo começa oculto para todos os grupos (exceto Administradores).</p></div>
      ${mods.map((m, i) => `<div class="card" style="margin-top:16px"><h3 style="color:var(--navy);margin-bottom:8px;display:flex;align-items:center;gap:8px"><i class="${esc(m.icone)}"></i> ${esc(m.nome)}
          <span style="margin-left:auto;display:flex;gap:4px"><button class="btn sm ghost" data-mover="-1" data-i="${i}" title="Subir no menu" ${i ? '' : 'disabled'}><i class="fas fa-arrow-up"></i></button><button class="btn sm ghost" data-mover="1" data-i="${i}" title="Descer no menu" ${i < mods.length - 1 ? '' : 'disabled'}><i class="fas fa-arrow-down"></i></button></span></h3>
        <div class="scroll-x"><table class="tabela"><tbody>
        ${lista(m.links).sort(porOrdem).map((l) => `<tr><td><i class="${esc(l.icone)}"></i> ${esc(l.nome)}</td><td style="max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><small>${esc(l.url)}</small></td>
          <td><span class="tag ${l.modo === 'iframe' ? 'normal' : 'pend'}">${l.modo === 'iframe' ? 'no portal' : 'nova aba'}</span></td>
          <td><button class="btn sm ghost" data-dell="${esc(l.id)}" data-mod="${esc(m.id)}"><i class="fas fa-trash"></i></button></td></tr>`).join('')}
        </tbody></table></div>
        <form class="row flink" data-mod="${esc(m.id)}" style="align-items:end;margin-top:10px">
          <label class="field"><span>Nome</span><input name="nome" required></label>
          <label class="field"><span>URL</span><input name="url" required pattern="(https?://|seeds/).+" placeholder="https://... ou seeds/pasta/"></label>
          <label class="field"><span>Abrir</span><select name="modo"><option value="iframe">no portal</option><option value="nova_aba">nova aba</option></select></label>
          <div class="field"><button class="btn sm turq">Adicionar link</button></div></form></div>`).join('')}`;

    // Ordem do menu lateral: troca o módulo com o vizinho e regrava 0..n em todos.
    $$('[data-mover]', el).forEach((b) => b.onclick = async () => {
      const i = +b.dataset.i, j = i + +b.dataset.mover;
      if (j < 0 || j >= mods.length) return;
      const ord = mods.slice();
      [ord[i], ord[j]] = [ord[j], ord[i]];
      const up = {};
      ord.forEach((m, k) => { up[`${m.id}/ordem`] = k; });
      await ref('modulos').update(up).catch((e) => toast(traduz(e)));
      admModulos(el);
    });
    $$('[data-dell]', el).forEach((b) => b.onclick = async () => {
      if (!(await confirmarAcao('Remover link?'))) return;
      await ref(`modulos/${b.dataset.mod}/links/${b.dataset.dell}`).remove().catch((e) => toast(traduz(e)));
      admModulos(el);
    });
    $$('.flink', el).forEach((f) => f.onsubmit = async (e) => {
      e.preventDefault();
      if (!f.reportValidity()) return;
      const d = Object.fromEntries(new FormData(f));
      try {
        await ref(`modulos/${f.dataset.mod}/links`).push({ nome: d.nome.trim(), url: d.url.trim(), modo: d.modo, icone: 'fas fa-link', ordem: 999 });
        admModulos(el);
      } catch (err) { toast(traduz(err)); }
    });
  }

  // Sem Storage: a imagem é reduzida (máx. 1600 px de largura, JPEG) e guardada no próprio banco.
  // Modelo PNG transparente no tamanho ideal (gerado no navegador, sem servidor).
  // modelos 16:9 transparentes: [id, nome, largura, altura, uso]
  // [id, nome, largura, altura, uso, grupo]
  const MODELOS_IMG = [
    ['p', 'Pequeno', 854, 480, '480p · leve', 'Computador'],
    ['m', 'Médio', 1280, 720, '720p · recomendado', 'Computador'],
    ['g', 'Grande', 1920, 1080, '1080p · alta definição', 'Computador'],
    ['c23', 'Celular 2:3', 1080, 1620, 'em pé · estilo foto', 'Celular'],
    ['c45', 'Celular retrato 4:5', 1080, 1350, 'em pé · estilo post', 'Celular'],
    ['c916', 'Celular tela cheia 9:16', 1080, 1920, 'em pé · estilo story', 'Celular'],
  ];
  function baixarModeloImagem(id = 'm') {
    const [, , W, H] = MODELOS_IMG.find((x) => x[0] === id) || MODELOS_IMG[1];
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    c.toBlob((b) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b); a.download = `modelo-aviso-${W}x${H}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, 'image/png');
  }
  document.addEventListener('click', (e) => {
    const aba = e.target.closest('[data-imp-aba]');
    if (aba) {
      e.preventDefault(); e.stopPropagation();
      const pop = aba.closest('.img-modelo-pop');
      $$('[data-imp-aba]', pop).forEach((b) => b.classList.toggle('on', b === aba));
      $$('[data-modelo]', pop).forEach((b) => { b.hidden = b.dataset.grupo !== aba.dataset.impAba; });
      return;
    }
    const op = e.target.closest('[data-modelo]');
    if (op) { e.preventDefault(); baixarModeloImagem(op.dataset.modelo); op.closest('.img-modelo-box').classList.remove('aberto'); op.parentElement.classList.add('hidden'); toast(`Modelo ${op.querySelector('b').textContent.toLowerCase()} baixado.`); return; }
    const bt = e.target.closest('.img-modelo');
    $$('.img-modelo-box.aberto').forEach((b) => { if (b !== bt?.parentElement) { b.classList.remove('aberto'); $('.img-modelo-pop', b).classList.add('hidden'); } });
    if (bt) { e.preventDefault(); const box = bt.parentElement; $('.img-modelo-pop', box).classList.toggle('hidden', box.classList.toggle('aberto') === false); }
  });

  function imagemReduzida(arq, larguraMax = 1600, qualidade = 0.8) {
    return new Promise((ok, erro) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, larguraMax / img.width);
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);   // canvas começa transparente
        URL.revokeObjectURL(img.src);
        // WebP mantém transparência e pesa bem menos; navegador sem WebP devolve PNG (também transparente)
        const d = c.toDataURL('image/webp', qualidade);
        ok(d.startsWith('data:image/webp') ? d : c.toDataURL('image/png'));
      };
      img.onerror = () => erro(new Error('Não foi possível ler a imagem.'));
      img.src = URL.createObjectURL(arq);
    });
  }

  async function admAuditoria(el) {
    const [snap, users] = await Promise.all([ref('auditoria_log').orderByChild('em').limitToLast(200).get(), ler('usuarios')]);
    const log = lista(snap.val()).sort((a, b) => (b.em || 0) - (a.em || 0));
    el.innerHTML = `<div class="card"><div class="scroll-x"><table class="tabela"><thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Alvo</th></tr></thead><tbody>
      ${log.map((l) => `<tr><td>${dataBR(l.em)}</td><td>${esc(users?.[l.por]?.nome || l.por || '—')}</td><td><code>${esc(l.acao)}</code></td><td><small>${esc(l.alvo)}</small></td></tr>`).join('')
        || '<tr><td colspan="4" class="vazio">Sem registros.</td></tr>'}</tbody></table></div></div>`;
  }

  // ---------- PWA ----------
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(() => {});

  iniciar().catch((e) => { console.error(e); esconderLoader(); toast(traduz(e)); });
})();
