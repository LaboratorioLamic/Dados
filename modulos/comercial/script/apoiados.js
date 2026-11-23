// ═══════════════════════════════════════════════════════════════
// apoiados.js — Acessos do site L2L (LAMIC Apoiados): login e senha
// dos laboratórios apoiados cadastrados em Tabelas de Preço
// ═══════════════════════════════════════════════════════════════
//
// l2l/acessos/{id}: id = id do laboratório (laboratorios/{id}) ou 'lamic' (Laboratório LAMIC, sem cadastro
//   de laboratório). interno = true: vê a tabela base escolhida (sem valores diferenciados) e baixa a
//   proposta em PDF; só acessos internos têm o botão da proposta no L2L
//   nome (como aparece no login do L2L), sal, hash (mesmo cálculo do login do Comercial),
//   ativo, interno, tabelaId (tabela base, só no interno), atualizadoEm, atualizadoPor,
//   ultimoAcesso (gravado pelo L2L)
//
// O que o L2L lê do banco:
//   l2l/acessos            lista do login e conferência da senha
//   laboratorios/{id}      nome, ativo, tabelaId e precos (valores diferenciados)
//   tabelas/{tabelaId}     nome e precos (valor padrão do exame)
//   exames                 mn, descricao, ativo, material e prazo (quando faltam no catálogo)
//   catalogo               nome, material, prazo, instrução e anexos

const ACESSO_INTERNO = 'lamic';
let buscaApoiado = '', filtroApoiado = '';

// Tabela mais usada pelos laboratórios (referência do acesso interno e de laboratório novo)
function tabelaDosLabs() {
  const n = {};
  lista(ESTADO.laboratorios).forEach(l => { if (ESTADO.tabelas[l.tabelaId]) n[l.tabelaId] = (n[l.tabelaId] || 0) + 1; });
  return Object.keys(n).sort((a, b) => n[b] - n[a])[0] || tabelaLabPadrao()?.id || null;
}

function linhasApoiados() {
  const ac = ESTADO.acessosL2L, int = ac[ACESSO_INTERNO];
  return [
    { id: ACESSO_INTERNO, fixo: true, interno: int ? !!int.interno : true, nome: int?.nome || 'Laboratório LAMIC', sub: 'Acesso do próprio LAMIC · sem cadastro de laboratório',
      tabelaId: ESTADO.tabelas[int?.tabelaId] ? int.tabelaId : tabelaDosLabs(), n: null, acesso: int },
    ...lista(ESTADO.laboratorios, porNome).map(l => {
      const a = ac[l.id], tabLab = ESTADO.tabelas[l.tabelaId] ? l.tabelaId : tabelaLabPadrao()?.id || null;
      return { id: l.id, interno: !!a?.interno, nome: l.nome, sub: l.razaoSocial || 'Laboratório apoiado',
        tabelaId: a?.interno && ESTADO.tabelas[a.tabelaId] ? a.tabelaId : tabLab, n: Object.keys(l.precos || {}).length, labInativo: l.ativo === false, acesso: a };
    })
  ];
}

const temAcessoL2L = x => !!x.acesso?.hash;
const badgeAcessoL2L = x => !temAcessoL2L(x) ? '<span class="badge-s warn"><i class="fa-solid fa-key"></i>Sem acesso</span>'
  : x.acesso.ativo === false ? '<span class="badge-s off"><i class="fa-solid fa-lock"></i>Bloqueado</span>'
  : x.labInativo ? '<span class="badge-s off"><i class="fa-solid fa-eye-slash"></i>Laboratório inativo</span>'
  : '<span class="badge-s ok"><i class="fa-solid fa-circle" style="font-size:6px"></i>Ativo</span>';
const tagTabelaL2L = id => {
  const t = ESTADO.tabelas[id];
  return t ? `<span class="tag"><i class="fa-solid ${t.icone}" style="color:${t.cor}"></i>${esc(t.nome)}</span>` : '<span class="tag muted">sem tabela</span>';
};

function renderApoiados() {
  painelConfig().innerHTML = `
    <div class="alert x"><i class="fa-solid fa-circle-info"></i><div>Cada laboratório apoiado entra no site <b>L2L</b> escolhendo o próprio nome e a senha definida aqui. Ele vê os valores da tabela de referência, os valores diferenciados, o prazo, o material e a instrução de cada exame. O cadastro dos laboratórios fica em <b>Tabelas de Preço → Laboratórios apoiados</b>.</div></div>
    <div class="card">
      <div class="toolbar">
        <div class="search"><i class="fa-solid fa-magnifying-glass"></i><input id="q-apo" value="${esc(buscaApoiado)}" placeholder="Buscar laboratório…" oninput="buscaApoiado=this.value;desenharApoiados()"></div>
        ${pode('usuarios', 'criar') ? `<button class="btn" onclick="abrirImportAcessosL2L()"><i class="fa-solid fa-file-import"></i>Importar acessos</button>` : ''}
        ${pode('tabelas', 'criar') ? `<button class="btn pri" onclick="abrirLaboratorio()"><i class="fa-solid fa-plus"></i>Novo laboratório</button>` : ''}
      </div>
      <div class="chips" id="apo-chips"></div>
      <div class="tbl-wrap" style="margin-top:10px"><table><thead><tr><th>Laboratório</th><th>Tabela de referência</th><th class="num">Valores diferenciados</th><th>Acesso ao L2L</th><th>Último acesso</th><th></th></tr></thead><tbody id="apo-body"></tbody></table></div>
      <div class="foot"><span id="apo-count"></span><span></span></div></div>`;
  desenharApoiados();
}

function desenharApoiados() {
  const body = document.getElementById('apo-body');
  if (!body) return;
  const todos = linhasApoiados().filter(x => contem(x.nome + ' ' + x.sub, buscaApoiado));
  const filtros = { '': ['Todos', 'fa-list', () => true], com: ['Com acesso', 'fa-key', temAcessoL2L], sem: ['Sem acesso', 'fa-ban', x => !temAcessoL2L(x)] };
  document.getElementById('apo-chips').innerHTML = Object.entries(filtros).map(([k, [nome, ic, f]]) =>
    `<button class="chip ${filtroApoiado === k ? 'on' : ''}" onclick="filtroApoiado='${k}';desenharApoiados()"><i class="fa-solid ${ic}"></i>${nome} <b>${todos.filter(f).length}</b></button>`).join('');
  const ls = todos.filter(filtros[filtroApoiado][2]);
  body.innerHTML = ls.map(x => `
    <tr class="row" onclick="abrirAcessoL2L('${x.id}')" ${x.labInativo ? 'style="opacity:.6"' : ''}>
      <td><div class="ucell"><span class="po-ic" style="--c:${x.fixo ? 'var(--cyan)' : corAvatar(x.id)}"><i class="fa-solid ${x.fixo ? 'fa-hospital' : 'fa-building-user'}"></i></span>
        <div>${esc(x.nome)} ${x.interno ? '<span class="badge-s base">interno</span>' : ''}<div class="s">${esc(x.sub)}</div></div></div></td>
      <td>${tagTabelaL2L(x.tabelaId)}</td><td class="num">${x.n == null ? '—' : num(x.n, 0)}</td>
      <td>${badgeAcessoL2L(x)}</td><td class="muted" style="font-size:12px">${dataHora(x.acesso?.ultimoAcesso)}</td>
      <td><i class="fa-solid fa-chevron-right muted"></i></td></tr>`).join('') || `<tr><td colspan="6">${vazio('fa-building-user', 'Nenhum laboratório encontrado')}</td></tr>`;
  const com = linhasApoiados().filter(temAcessoL2L).length;
  document.getElementById('apo-count').textContent = `${ls.length} de ${linhasApoiados().length} · ${com} com acesso ao L2L`;
}

// ── Gaveta do acesso ──────────────────────────────────────────
let _apEd = null;
function abrirAcessoL2L(id) {
  const x = linhasApoiados().find(l => l.id === id);
  if (!x) return;
  const a = x.acesso, tem = temAcessoL2L(x), editar = pode('usuarios', tem ? 'editar' : 'criar');
  _apEd = { id, fixo: !!x.fixo, interno: !!x.interno, ativo: a ? a.ativo !== false : true };
  abrirGaveta({
    sobre: 'Acesso ao L2L', titulo: x.nome,
    meta: `${badgeAcessoL2L(x)}${a?.ultimoAcesso ? `<span class="tag" title="Último acesso"><i class="fa-solid fa-clock"></i>${dataHora(a.ultimoAcesso)}</span>` : ''}`,
    corpo: `<div class="form-col">
      ${x.fixo ? campo('ap-nome', 'Nome no login', x.nome, { tipo: 'text', desab: !editar })
      : `<div class="casc">
        <div class="casc-r"><div class="lft"><i class="fa-solid fa-building-user"></i><div>${esc(x.nome)}<div class="s">${esc(x.sub)}</div></div></div>${x.labInativo ? '<span class="badge-s off">inativo</span>' : ''}</div>
        <div class="casc-r"><div class="lft"><i class="fa-solid fa-table-list"></i><div>Tabela de referência<div class="s">valor padrão dos exames</div></div></div>${tagTabelaL2L(x.tabelaId)}</div>
        <div class="casc-r"><div class="lft"><i class="fa-solid fa-handshake"></i><div>Valores diferenciados<div class="s">substituem o valor da tabela</div></div></div><b class="mono">${num(x.n, 0)}</b></div></div>`}
      <div class="casc"><div class="casc-r"><div class="lft"><i class="fa-solid fa-hospital"></i><div>Acesso interno<div class="s">vê a tabela base e baixa a proposta em PDF no L2L</div></div></div>${chave(_apEd.interno, 'alternarInternoL2L(this)', !editar)}</div></div>
      <div class="field" id="ap-tab-f" ${_apEd.interno ? '' : 'style="display:none"'}><label>Tabela base exibida</label><div id="pop-aptab" class="block"></div><span class="hint">Valores que o acesso interno vê e usa na proposta em PDF${x.fixo ? '' : ' (os valores diferenciados não entram)'}</span></div>
      <div class="sec-t"><i class="fa-solid fa-key"></i>${tem ? 'Redefinir senha' : 'Senha de acesso'}</div>
      <div class="ap-senha">${campo('ap-senha', tem ? 'Nova senha' : 'Senha', '', { tipo: 'text', desab: !editar, ph: tem ? 'deixe vazio para manter a atual' : 'mínimo 6 caracteres' })}
        ${editar ? `<button class="btn" type="button" onclick="gerarSenhaL2L()" title="Gerar uma senha"><i class="fa-solid fa-wand-magic-sparkles"></i>Gerar</button>` : ''}</div>
      <span class="hint" style="margin-top:-8px">Anote antes de salvar: a senha é guardada cifrada e não pode ser consultada depois.</span>
      <div class="casc"><div class="casc-r"><div class="lft"><i class="fa-solid fa-user-check"></i><div>Acesso ativo<div class="s">bloqueado some da lista do login</div></div></div>${chave(_apEd.ativo, '_apEd.ativo=!_apEd.ativo;this.classList.toggle(\'on\')', !editar)}</div></div>
      ${a?.atualizadoPor ? `<span class="hint">Alterado por ${esc(a.atualizadoPor)} em ${dataHora(a.atualizadoEm)}</span>` : ''}
    </div>`,
    rodape: `${tem && pode('usuarios', 'excluir') ? `<button class="btn perigo-txt" style="margin-right:auto" onclick="removerAcessoL2L('${id}')"><i class="fa-solid fa-trash"></i>Remover acesso</button>` : ''}
      <button class="btn" onclick="fecharGaveta()">${editar ? 'Cancelar' : 'Fechar'}</button>
      ${editar ? `<button class="btn pri" onclick="gravarAcessoL2L()"><i class="fa-solid fa-floppy-disk"></i>Salvar</button>` : ''}`
  });
  {
    const tabs = tabelasLista();
    criarPop('pop-aptab', {
      rotulo: 'Tabela', titulo: 'Tabela exibida no acesso interno', icone: 'fa-table-list', padrao: '',
      opcoes: () => tabs.length ? tabs.map(t => ({ valor: t.id, rotulo: t.nome, icone: t.icone, cor: t.cor, desc: TIPOS_TABELA[t.tipo]?.nome, qtd: Object.keys(t.precos || {}).length }))
        : [{ valor: '', rotulo: 'Nenhuma tabela', icone: 'fa-ban', cor: 'var(--gray)' }]
    });
    POPS['pop-aptab'].valor = x.tabelaId || ''; desenharBotaoPop('pop-aptab');
  }
}

function alternarInternoL2L(b) {
  _apEd.interno = !_apEd.interno;
  b.classList.toggle('on', _apEd.interno);
  document.getElementById('ap-tab-f').style.display = _apEd.interno ? '' : 'none';
}

// 8 caracteres sem os que se confundem (0/O, 1/l/I)
function gerarSenhaL2L() {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz', digitos = '23456789';
  const r = crypto.getRandomValues(new Uint32Array(8));
  const s = [...r].map((v, i) => i >= 6 ? digitos[v % digitos.length] : letras[v % letras.length]).join('');
  const el = document.getElementById('ap-senha');
  el.value = s; el.focus(); el.select();
}

async function gravarAcessoL2L() {
  const id = _apEd.id, a = ESTADO.acessosL2L[id], senha = valorCampo('ap-senha').trim();
  if (!a?.hash && !senha) return toast('Defina a senha de acesso', 'erro');
  if (senha && senha.length < 6) return toast('A senha precisa ter ao menos 6 caracteres', 'erro');
  const nome = _apEd.fixo ? valorCampo('ap-nome').trim() : ESTADO.laboratorios[id]?.nome;
  if (!nome) return toast('Informe o nome', 'erro');
  const dados = { nome, ativo: _apEd.ativo, interno: _apEd.interno, tabelaId: _apEd.interno || _apEd.fixo ? valorPop('pop-aptab') || null : null,
    atualizadoEm: DB.agora(), atualizadoPor: usuarioAtual().nome };
  if (senha) { dados.sal = novoSal(); dados.hash = hashSenha(senha, dados.sal); }
  await DB.mesclar(`${CAMINHOS.acessosL2L}/${id}`, dados);
  registrar('usuarios', `Acesso L2L de ${nome} ${!a?.hash ? 'criado' : senha ? 'alterado (senha redefinida)' : 'alterado'}`);
  fecharGaveta();
  toast(`Acesso de ${nome} salvo`);
}

async function removerAcessoL2L(id) {
  const a = ESTADO.acessosL2L[id];
  const ok = await confirmar({ titulo: `Remover o acesso de ${a.nome}?`, texto: 'O laboratório deixa de entrar no L2L. O cadastro e os valores continuam no sistema.', botao: 'Remover', perigo: true });
  if (!ok) return;
  await DB.remover(`${CAMINHOS.acessosL2L}/${id}`);
  registrar('usuarios', `Acesso L2L de ${a.nome} removido`);
  fecharGaveta();
  toast(`Acesso de ${a.nome} removido`);
}

// ── Importação dos acessos do L2L antigo ──────────────────────
// Aceita o info.json do L2L ({ users: [{ user, password }] }) ou qualquer texto com
// pares user/password (a lista que ficava dentro do index.html antigo).
const apImp = { arquivo: '', itens: null, erro: '' };

function abrirImportAcessosL2L() {
  Object.assign(apImp, { arquivo: '', itens: null, erro: '' });
  abrirGaveta({ sobre: 'Acessos do L2L', titulo: 'Importar logins e senhas', corpo: '<div id="apimp-corpo"></div>', rodape: '<div id="apimp-rodape" style="display:contents"></div>' });
  desenharImportAcessos();
}

function lerAcessosL2L(texto) {
  const itens = [], add = (n, s) => { n = String(n ?? '').trim(); s = String(s ?? '').trim(); if (n && s && !itens.some(i => normalizar(i.nome) === normalizar(n))) itens.push({ nome: n, senha: s }); };
  try {
    const j = JSON.parse(texto), ls = Array.isArray(j) ? j : j.users || j.usuarios || [];
    ls.forEach(x => add(x.user ?? x.usuario ?? x.nome, x.password ?? x.senha));
  } catch (e) {
    const re = /["']?user["']?\s*:\s*(["'])((?:\\.|(?!\1).)*)\1\s*,\s*["']?password["']?\s*:\s*(["'])((?:\\.|(?!\3).)*)\3/g;
    let m;
    while ((m = re.exec(texto))) add(m[2].replace(/\\(.)/g, '$1'), m[4].replace(/\\(.)/g, '$1'));
  }
  if (!itens.length) throw new Error('Nenhum login encontrado. Esperado: { "users": [{ "user": "…", "password": "…" }] }.');
  return itens;
}

// Laboratório cadastrado com o mesmo nome ("Lab." e "Laboratório" não contam)
const _semPrefixoLab = s => normalizar(s).replace(/^(laboratorio|lab\.?|clinica)\s+/, '').replace(/[^a-z0-9]/g, '');
function destinoAcessoL2L(nome) {
  if (_semPrefixoLab(nome) === 'lamic') return ACESSO_INTERNO;
  const labs = lista(ESTADO.laboratorios);
  const l = labs.find(x => normalizar(x.nome) === normalizar(nome)) || labs.find(x => _semPrefixoLab(x.nome) === _semPrefixoLab(nome));
  return l ? l.id : '__novo';
}

function lerArquivoAcessos(input) {
  const f = input.files[0];
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    apImp.arquivo = f.name; apImp.erro = ''; apImp.itens = null;
    try { apImp.itens = lerAcessosL2L(String(rd.result)).map(i => ({ ...i, destino: destinoAcessoL2L(i.nome) })); }
    catch (e) { apImp.erro = e.message; }
    desenharImportAcessos();
  };
  rd.readAsText(f, 'UTF-8');
}

function desenharImportAcessos() {
  const c = document.getElementById('apimp-corpo');
  if (!c) return;
  const its = apImp.itens;
  c.innerHTML = `
    <div class="alert x"><i class="fa-solid fa-circle-info"></i><div>Escolha o arquivo <b>info.json</b> do repositório do L2L (lista de <code>user</code> e <code>password</code>). Cada login é ligado a um laboratório apoiado cadastrado; as senhas são gravadas cifradas.</div></div>
    <label class="drop ${apImp.arquivo && !apImp.erro ? 'ok' : ''}" for="apimp-arq"><input type="file" id="apimp-arq" accept=".json,.txt,.html,.js" onchange="lerArquivoAcessos(this)">
      <i class="fa-solid ${apImp.arquivo && !apImp.erro ? 'fa-circle-check' : 'fa-cloud-arrow-up'}"></i><b>Logins do L2L (info.json)</b><div class="drop-s">${apImp.arquivo ? esc(apImp.arquivo) : 'Clique para escolher o arquivo'}</div></label>
    ${apImp.erro ? `<div class="alert r" style="margin-top:12px"><i class="fa-solid fa-circle-xmark"></i><div>${esc(apImp.erro)}</div></div>` : ''}
    ${its ? `<div class="sec-t" style="margin-top:16px"><i class="fa-solid fa-link"></i>Ligar cada login a um laboratório</div>
      <div class="casc">${its.map((it, i) => `<div class="casc-r"><div class="lft"><i class="fa-solid fa-user"></i><div>${esc(it.nome)}<div class="s">senha com ${it.senha.length} caracteres</div></div></div><div id="pop-apimp-${i}" style="width:210px;flex-shrink:0"></div></div>`).join('')}</div>` : ''}`;
  (its || []).forEach((it, i) => {
    const id = `pop-apimp-${i}`;
    delete POPS[id];
    criarPop(id, {
      rotulo: 'Destino', titulo: `Login "${it.nome}"`, icone: 'fa-building-user', padrao: '', busca: 'Buscar laboratório…',
      opcoes: () => [
        { valor: '', rotulo: 'Não importar', icone: 'fa-ban', cor: 'var(--gray)' },
        { valor: '__novo', rotulo: `Cadastrar ${it.nome}`, desc: 'novo laboratório apoiado', icone: 'fa-plus', cor: 'var(--green)' },
        { valor: ACESSO_INTERNO, rotulo: 'Acesso interno (LAMIC)', desc: 'tabela de referência e proposta em PDF', icone: 'fa-hospital', grupo: 'Cadastrados' },
        ...lista(ESTADO.laboratorios, porNome).map(l => ({ valor: l.id, rotulo: l.nome, icone: 'fa-building-user', grupo: 'Cadastrados',
          desc: ESTADO.acessosL2L[l.id]?.hash ? 'já tem acesso: a senha é substituída' : 'sem acesso' }))
      ].filter(o => o.valor !== '__novo' || destinoAcessoL2L(it.nome) === '__novo'),
      aoMudar: v => { it.destino = v; desenharRodapeImportAcessos(); }
    });
    POPS[id].valor = it.destino; desenharBotaoPop(id);
  });
  desenharRodapeImportAcessos();
}

function desenharRodapeImportAcessos() {
  const r = document.getElementById('apimp-rodape');
  if (!r) return;
  const its = (apImp.itens || []).filter(i => i.destino), novos = its.filter(i => i.destino === '__novo').length;
  r.innerHTML = `<span class="hint" style="margin-right:auto">${novos ? `${novos} laboratório(s) será(ão) cadastrado(s)` : ''}</span>
    <button class="btn" onclick="fecharGaveta()">Cancelar</button>
    <button class="btn pri" ${its.length ? '' : 'disabled'} onclick="gravarImportAcessos()"><i class="fa-solid fa-check"></i>Importar ${its.length || ''} acesso(s)</button>`;
}

async function gravarImportAcessos() {
  const its = apImp.itens.filter(i => i.destino), rep = its.find((i, n) => i.destino !== '__novo' && its.findIndex(j => j.destino === i.destino) !== n);
  if (rep) return toast(`Dois logins apontam para o mesmo destino (${rep.nome})`, 'erro');
  const u = usuarioAtual(), agora = DB.agora(), tab = tabelaDosLabs(), upd = {};
  let novos = 0;
  its.forEach(it => {
    let id = it.destino;
    if (id === '__novo') {
      id = DB.novaChave(CAMINHOS.laboratorios); novos++;
      upd[`${CAMINHOS.laboratorios}/${id}`] = { nome: it.nome, tabelaId: tab, ativo: true, criadoEm: agora };
    }
    const sal = novoSal(), interno = id === ACESSO_INTERNO;
    upd[`${CAMINHOS.acessosL2L}/${id}`] = { nome: interno ? it.nome : ESTADO.laboratorios[id]?.nome || it.nome, sal, hash: hashSenha(it.senha, sal), ativo: true,
      atualizadoEm: agora, atualizadoPor: u.nome, ...(interno ? { interno: true, tabelaId: ESTADO.acessosL2L[ACESSO_INTERNO]?.tabelaId || tab } : {}) };
  });
  await DB.mesclar('/', upd);
  registrar('usuarios', `Acessos do L2L importados: ${its.length} login(s)${novos ? `, ${novos} laboratório(s) cadastrado(s)` : ''}`, { arquivo: apImp.arquivo });
  fecharGaveta();
  toast(`${its.length} acesso(s) importado(s)`);
}
